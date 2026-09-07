import { describe, expect, it } from 'vitest';
import type { MatchState, RandomFn } from '../../../engine/types';
import { MageWarsDomain, MAGE_WARS_COMMANDS } from '../domain';
import { getMageWarsSpellCardFromConfig } from '../data/configPackage';
import { MAGE_WARS_EVENTS } from '../domain/events';
import { executeMageWarsSpellAbility } from '../domain/spellAbilityExecutors';
import {
    ARENA_ZONE_IDS,
    MAGE_IDS,
    MAGE_WARS_MAGE_ABILITY_IDS,
    STATUS_TOKEN_IDS,
} from '../domain/ids';
import type { MageWarsCommand, MageWarsCore } from '../domain/types';
import {
    actionLogKinds,
    fixedRandom,
    makeArenaObject,
    planCommand,
    PLAYER_ONE_START_ZONE,
    PLAYER_ZERO_START_ZONE,
    runCommand,
    setupState,
    validateCommand,
    withArenaObject,
    withCurrentPlayer,
    withPlayerInZone,
    withPlayerMage,
} from './helpers/domainFlowHarness';

describe('mage-wars spell resolution', () => {
    it('casts attack spells from config cost, rolls spell dice, and consumes the matching readiness track', () => {
        const quickSpellId = 1710;
        const actionSpellId = 1711;
        const planned = runCommand(setupState('planning'), planCommand([quickSpellId, actionSpellId]));
        expect(planned.success).toBe(true);

        const quickcastCore = withPlayerInZone(planned.state.core, '1', ARENA_ZONE_IDS.A2);
        const quickcastState: MatchState<MageWarsCore> = {
            core: {
                ...quickcastCore,
                players: {
                    ...quickcastCore.players,
                    '0': {
                        ...quickcastCore.players['0'],
                        statusTokens: {
                            [STATUS_TOKEN_IDS.WEAK]: 5,
                        },
                    },
                },
            },
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        };
        const quickcast = runCommand(quickcastState, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: quickSpellId,
                manaCost: 4,
                targetPlayerId: '1',
            },
        });

        expect(quickcast.success).toBe(true);
        expect(quickcast.state.core.players['0']).toMatchObject({
            mana: planned.state.core.players['0'].mana - 4,
            quickcastReady: false,
            actionReady: true,
        });
        expect(quickcast.state.core.players['0'].statusTokens[STATUS_TOKEN_IDS.WEAK]).toBe(5);
        expect(quickcast.state.core.players['0'].preparedSpellCardIds).toEqual([actionSpellId]);
        expect(quickcast.state.core.players['0'].discardSpellCardIds).toEqual([quickSpellId]);
        expect(quickcast.events.map((event) => event.type)).toEqual(expect.arrayContaining([
            MAGE_WARS_EVENTS.SPELL_CAST_RESOLVED,
            MAGE_WARS_EVENTS.SPELL_ATTACK_ROLLED,
            'DAMAGE_DEALT',
        ]));
        expect(quickcast.events.find((event) => event.type === MAGE_WARS_EVENTS.SPELL_ATTACK_ROLLED)).toMatchObject({
            payload: {
                spellCardId: quickSpellId,
                sourceAbilityId: 'mw.spell.1710',
                targetPlayerId: '1',
                diceResults: [3, 3, 3],
                baseDamage: 9,
            },
        });
        expect(quickcast.events.find((event) => event.type === 'DAMAGE_DEALT')).toMatchObject({
            payload: {
                targetId: '1',
                actualDamage: 9,
                sourceAbilityId: 'mw.spell.1710',
            },
        });
        expect(quickcast.state.core.players['1'].damage).toBe(9);
        expect(actionLogKinds(quickcast.state)).toEqual(expect.arrayContaining([
            MAGE_WARS_EVENTS.SPELL_CAST_RESOLVED,
            MAGE_WARS_EVENTS.SPELL_ATTACK_ROLLED,
            'DAMAGE_DEALT',
        ]));
        expect(quickcast.state.sys.actionLog.entries[0]?.segments).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'card', cardId: String(quickSpellId) }),
        ]));

        expect(validateCommand({
            core: withPlayerInZone(planned.state.core, '1', ARENA_ZONE_IDS.A2),
            sys: { ...planned.state.sys, phase: 'creatureAction' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: { spellCardId: 999999, manaCost: 1 },
        })).toBe('spellNotPrepared');
        expect(validateCommand({
            core: withPlayerInZone(planned.state.core, '1', ARENA_ZONE_IDS.A2),
            sys: { ...planned.state.sys, phase: 'creatureAction' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: { spellCardId: actionSpellId, manaCost: 1, targetPlayerId: '1' },
        })).toBe('manaCostMismatch');

        const actionCast = runCommand({
            core: withPlayerInZone(planned.state.core, '1', ARENA_ZONE_IDS.A2),
            sys: { ...planned.state.sys, phase: 'creatureAction' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: actionSpellId,
                manaCost: 4,
                targetPlayerId: '1',
                pushToZoneId: ARENA_ZONE_IDS.A3,
            },
        });

        expect(actionCast.success).toBe(true);
        expect(actionCast.state.core.players['0']).toMatchObject({
            actionReady: false,
            quickcastReady: true,
        });
        expect(actionCast.state.core.players['0'].discardSpellCardIds).toEqual([actionSpellId]);
        expect(actionCast.state.core.players['1'].damage).toBe(6);
    });

    it('casts minor healing on a living arena object from config data', () => {
        const healingSpellId = 3402;
        const planned = runCommand(setupState('planning'), planCommand([healingSpellId]));
        const woundedCat = makeArenaObject('cat-0', '0', PLAYER_ZERO_START_ZONE, {
            damage: 3,
        });

        const healed = runCommand({
            core: withArenaObject(planned.state.core, woundedCat),
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: healingSpellId,
                manaCost: 5,
                targetObjectId: woundedCat.id,
            },
        });

        expect(healed.success).toBe(true);
        expect(healed.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_HEALING_ROLLED,
                payload: expect.objectContaining({
                    spellCardId: healingSpellId,
                    sourceAbilityId: 'mw.spell.3402',
                    targetObjectId: woundedCat.id,
                    diceResults: [3, 3, 3, 3, 3],
                    healing: 15,
                    actualHealing: 3,
                }),
            }),
        ]));
        expect(healed.state.core.objects[woundedCat.id].damage).toBe(0);
        expect(healed.state.core.players['0']).toMatchObject({
            mana: planned.state.core.players['0'].mana - 5,
            quickcastReady: false,
            actionReady: true,
        });
        expect(healed.state.core.players['0'].discardSpellCardIds).toEqual([healingSpellId]);
        expect(actionLogKinds(healed.state)).toContain(MAGE_WARS_EVENTS.SPELL_HEALING_ROLLED);
    });

    it('casts group healing only on friendly living targets in the selected zone', () => {
        const groupHealingSpellId = 3405;
        const planned = runCommand(setupState('planning'), planCommand([groupHealingSpellId]));
        const friendlyCat = makeArenaObject('cat-0', '0', PLAYER_ZERO_START_ZONE, {
            damage: 2,
        });
        const enemyGuard = makeArenaObject('guard-1', '1', PLAYER_ZERO_START_ZONE, {
            damage: 3,
            life: 6,
        });
        const friendlySkeleton = makeArenaObject('skeleton-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2826,
            sourceObjectId: 'spell-card-2826',
            name: '骷髅哨兵',
            damage: 3,
            life: 6,
            attackOrTraitLine: '短剑：快速近战 4 骰；非活体；精神免疫',
        });
        const coreWithEnemyMage = withPlayerInZone(planned.state.core, '1', PLAYER_ZERO_START_ZONE);
        const damagedCore: MageWarsCore = {
            ...coreWithEnemyMage,
            players: {
                ...coreWithEnemyMage.players,
                '0': {
                    ...coreWithEnemyMage.players['0'],
                    damage: 4,
                },
                '1': {
                    ...coreWithEnemyMage.players['1'],
                    damage: 7,
                },
            },
        };

        const healed = runCommand({
            core: withArenaObject(
                withArenaObject(
                    withArenaObject(damagedCore, friendlyCat),
                    enemyGuard,
                ),
                friendlySkeleton,
            ),
            sys: { ...planned.state.sys, phase: 'creatureAction' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: groupHealingSpellId,
                manaCost: 9,
                targetZoneId: PLAYER_ZERO_START_ZONE,
            },
        });

        expect(healed.success).toBe(true);
        expect(healed.events.filter((event) => event.type === MAGE_WARS_EVENTS.SPELL_HEALING_ROLLED)).toHaveLength(2);
        expect(healed.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_HEALING_ROLLED,
                payload: expect.objectContaining({
                    spellCardId: groupHealingSpellId,
                    targetPlayerId: '0',
                    targetZoneId: PLAYER_ZERO_START_ZONE,
                    diceResults: [3, 3, 3, 3, 3],
                    actualHealing: 4,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_HEALING_ROLLED,
                payload: expect.objectContaining({
                    spellCardId: groupHealingSpellId,
                    targetObjectId: friendlyCat.id,
                    targetZoneId: PLAYER_ZERO_START_ZONE,
                    diceResults: [3, 3, 3, 3, 3],
                    actualHealing: 2,
                }),
            }),
        ]));
        expect(healed.state.core.players['0'].damage).toBe(0);
        expect(healed.state.core.players['1'].damage).toBe(7);
        expect(healed.state.core.objects[friendlyCat.id].damage).toBe(0);
        expect(healed.state.core.objects[enemyGuard.id].damage).toBe(3);
        expect(healed.state.core.objects[friendlySkeleton.id].damage).toBe(3);
        expect(healed.state.core.players['0']).toMatchObject({
            actionReady: false,
            quickcastReady: true,
        });
    });

    it('rejects standard spells during quickcast phases', () => {
        const groupHealingSpellId = 3405;
        const planned = runCommand(setupState('planning'), planCommand([groupHealingSpellId]));

        expect(validateCommand({
            core: planned.state.core,
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: groupHealingSpellId,
                manaCost: 9,
                targetZoneId: PLAYER_ZERO_START_ZONE,
            },
        })).toBe('spellNotQuick');
    });

    it('casts single healing from the priestess apprentice spellbook on a living creature', () => {
        const healingSpellId = 3408;
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withCurrentPlayer(planningState.core, '1'),
            sys: planningState.sys,
        }, planCommand([healingSpellId], '1'));
        const woundedCleric = makeArenaObject('cleric-1', '1', PLAYER_ONE_START_ZONE, {
            sourceSpellCardId: 2907,
            sourceObjectId: 'spell-card-2907',
            name: '灰衣天使',
            damage: 7,
            life: 10,
            armor: 2,
            attackOrTraitLine: '利剑：快速近战 4 骰；飞行',
        });

        const healed = runCommand({
            core: withArenaObject(planned.state.core, woundedCleric),
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '1',
            payload: {
                spellCardId: healingSpellId,
                manaCost: 9,
                targetObjectId: woundedCleric.id,
            },
        });

        expect(planned.success).toBe(true);
        expect(healed.success).toBe(true);
        expect(healed.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_HEALING_ROLLED,
                payload: expect.objectContaining({
                    playerId: '1',
                    spellCardId: healingSpellId,
                    sourceAbilityId: 'mw.spell.3408',
                    targetObjectId: woundedCleric.id,
                    targetZoneId: PLAYER_ONE_START_ZONE,
                    diceResults: [3, 3, 3, 3, 3, 3, 3, 3],
                    healing: 24,
                    actualHealing: 7,
                }),
            }),
        ]));
        expect(healed.state.core.objects[woundedCleric.id].damage).toBe(0);
        expect(healed.state.core.players['1']).toMatchObject({
            mana: planned.state.core.players['1'].mana - 9,
            quickcastReady: false,
            actionReady: true,
        });
        expect(healed.state.core.players['1'].discardSpellCardIds).toEqual([healingSpellId]);
        expect(actionLogKinds(healed.state)).toContain(MAGE_WARS_EVENTS.SPELL_HEALING_ROLLED);
    });

    it('uses priestess quick restoration to pay and remove all same-name status tokens from a creature', () => {
        const baseState = setupState('initiativeQuickcast');
        const burningCleric = makeArenaObject('burning-cleric-1', '1', PLAYER_ONE_START_ZONE, {
            sourceSpellCardId: 2907,
            sourceObjectId: 'spell-card-2907',
            name: '灰衣天使',
            life: 10,
            armor: 2,
            statusTokens: {
                [STATUS_TOKEN_IDS.BURN]: 2,
                [STATUS_TOKEN_IDS.DAZE]: 1,
            },
        });

        const restoreState: MatchState<MageWarsCore> = {
            core: withArenaObject(withCurrentPlayer(baseState.core, '1'), burningCleric),
            sys: baseState.sys,
        };
        const restoreCommand: MageWarsCommand = {
            type: MAGE_WARS_COMMANDS.USE_MAGE_ABILITY,
            playerId: '1',
            payload: {
                abilityId: MAGE_WARS_MAGE_ABILITY_IDS.PRIESTESS_RESTORE_QUICK,
                targetObjectId: burningCleric.id,
                statusTokenIds: [STATUS_TOKEN_IDS.BURN],
                manaCost: 4,
            },
        };
        const rawRestoreEvents = MageWarsDomain.execute(restoreState, restoreCommand, fixedRandom);
        const rawRestoreEventTypes = rawRestoreEvents.map((event) => event.type);
        expect(rawRestoreEventTypes).toContain(MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVAL_AVAILABLE);
        expect(rawRestoreEventTypes).not.toContain(MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVED);

        const restored = runCommand(restoreState, restoreCommand);

        expect(restored.success).toBe(true);
        expect(restored.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.MAGE_ABILITY_RESOLVED,
                payload: expect.objectContaining({
                    playerId: '1',
                    abilityId: MAGE_WARS_MAGE_ABILITY_IDS.PRIESTESS_RESTORE_QUICK,
                    manaCost: 4,
                    targetObjectId: burningCleric.id,
                    statusTokenIds: [STATUS_TOKEN_IDS.BURN],
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVAL_AVAILABLE,
                payload: expect.objectContaining({
                    targetObjectId: burningCleric.id,
                    statusTokenId: STATUS_TOKEN_IDS.BURN,
                    amount: 2,
                    sourceAbilityId: MAGE_WARS_MAGE_ABILITY_IDS.PRIESTESS_RESTORE_QUICK,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVED,
                payload: expect.objectContaining({
                    targetObjectId: burningCleric.id,
                    statusTokenId: STATUS_TOKEN_IDS.BURN,
                    amount: 2,
                    sourceAbilityId: MAGE_WARS_MAGE_ABILITY_IDS.PRIESTESS_RESTORE_QUICK,
                }),
            }),
        ]));
        const removalAvailableIndex = restored.events.findIndex((event) => (
            event.type === MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVAL_AVAILABLE
            && event.payload.statusTokenId === STATUS_TOKEN_IDS.BURN
        ));
        const removedIndex = restored.events.findIndex((event) => (
            event.type === MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVED
            && event.payload.statusTokenId === STATUS_TOKEN_IDS.BURN
        ));
        expect(removalAvailableIndex).toBeGreaterThanOrEqual(0);
        expect(removedIndex).toBeGreaterThan(removalAvailableIndex);
        expect(restored.state.core.objects[burningCleric.id].statusTokens).toEqual({
            [STATUS_TOKEN_IDS.DAZE]: 1,
        });
        expect(restored.state.core.players['1']).toMatchObject({
            mana: baseState.core.players['1'].mana - 4,
            quickcastReady: false,
            actionReady: true,
            preparedSpellCardIds: [],
            discardSpellCardIds: [],
        });
        expect(actionLogKinds(restored.state)).toContain(MAGE_WARS_EVENTS.MAGE_ABILITY_RESOLVED);
        expect(actionLogKinds(restored.state)).toContain(MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVED);
    });

    it('uses priestess standard restoration to remove multiple status types including sleep level cost', () => {
        const baseState = setupState('creatureAction');
        const afflictedAngel = makeArenaObject('afflicted-angel-1', '1', PLAYER_ONE_START_ZONE, {
            sourceSpellCardId: 2907,
            sourceObjectId: 'spell-card-2907',
            name: '灰衣天使',
            life: 10,
            armor: 2,
            statusTokens: {
                [STATUS_TOKEN_IDS.BURN]: 1,
                [STATUS_TOKEN_IDS.STUN]: 1,
                [STATUS_TOKEN_IDS.SLEEP]: 1,
            },
        });

        const restoreState: MatchState<MageWarsCore> = {
            core: withArenaObject(withCurrentPlayer(baseState.core, '1'), afflictedAngel),
            sys: baseState.sys,
        };
        const restoreCommand: MageWarsCommand = {
            type: MAGE_WARS_COMMANDS.USE_MAGE_ABILITY,
            playerId: '1',
            payload: {
                abilityId: MAGE_WARS_MAGE_ABILITY_IDS.PRIESTESS_RESTORE_STANDARD,
                targetObjectId: afflictedAngel.id,
                statusTokenIds: [STATUS_TOKEN_IDS.BURN, STATUS_TOKEN_IDS.STUN, STATUS_TOKEN_IDS.SLEEP],
                manaCost: 9,
            },
        };
        const rawRestoreEvents = MageWarsDomain.execute(restoreState, restoreCommand, fixedRandom);
        const rawRestoreEventTypes = rawRestoreEvents.map((event) => event.type);
        expect(rawRestoreEventTypes.filter((type) => (
            type === MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVAL_AVAILABLE
        ))).toHaveLength(3);
        expect(rawRestoreEventTypes).not.toContain(MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVED);

        const restored = runCommand(restoreState, restoreCommand);

        expect(restored.success).toBe(true);
        expect(restored.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.MAGE_ABILITY_RESOLVED,
                payload: expect.objectContaining({
                    playerId: '1',
                    abilityId: MAGE_WARS_MAGE_ABILITY_IDS.PRIESTESS_RESTORE_STANDARD,
                    manaCost: 9,
                    targetObjectId: afflictedAngel.id,
                    statusTokenIds: [STATUS_TOKEN_IDS.BURN, STATUS_TOKEN_IDS.STUN, STATUS_TOKEN_IDS.SLEEP],
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVAL_AVAILABLE,
                payload: expect.objectContaining({
                    targetObjectId: afflictedAngel.id,
                    statusTokenId: STATUS_TOKEN_IDS.BURN,
                    amount: 1,
                    sourceAbilityId: MAGE_WARS_MAGE_ABILITY_IDS.PRIESTESS_RESTORE_STANDARD,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVED,
                payload: expect.objectContaining({
                    targetObjectId: afflictedAngel.id,
                    statusTokenId: STATUS_TOKEN_IDS.BURN,
                    amount: 1,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVED,
                payload: expect.objectContaining({
                    targetObjectId: afflictedAngel.id,
                    statusTokenId: STATUS_TOKEN_IDS.STUN,
                    amount: 1,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVED,
                payload: expect.objectContaining({
                    targetObjectId: afflictedAngel.id,
                    statusTokenId: STATUS_TOKEN_IDS.SLEEP,
                    amount: 1,
                }),
            }),
        ]));
        expect(restored.state.core.objects[afflictedAngel.id].statusTokens).toEqual({});
        expect(restored.state.core.players['1']).toMatchObject({
            mana: baseState.core.players['1'].mana - 9,
            quickcastReady: true,
            actionReady: false,
            preparedSpellCardIds: [],
            discardSpellCardIds: [],
        });
        expect(actionLogKinds(restored.state)).toContain(MAGE_WARS_EVENTS.MAGE_ABILITY_RESOLVED);
        expect(actionLogKinds(restored.state)).toContain(MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVED);
    });

    it('casts Life Drain as direct damage and heals the warlock by actual damage dealt', () => {
        const lifeDrainSpellId = 3400;
        const planningState = setupState('planning');
        const warlockCore = withPlayerMage(planningState.core, '0', MAGE_IDS.WARLOCK_APPRENTICE);
        const planned = runCommand({
            core: {
                ...warlockCore,
                players: {
                    ...warlockCore.players,
                    '0': {
                        ...warlockCore.players['0'],
                        mana: 20,
                        damage: 5,
                    },
                },
            },
            sys: planningState.sys,
        }, planCommand([lifeDrainSpellId]));
        const armoredLivingTarget = makeArenaObject('angel-1', '1', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2907,
            sourceObjectId: 'spell-card-2907',
            name: '灰衣天使',
            life: 20,
            armor: 4,
            attackOrTraitLine: '利剑：快速近战 4 骰；飞行',
        });

        const drainState: MatchState<MageWarsCore> = {
            core: withArenaObject(planned.state.core, armoredLivingTarget),
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        };
        const drainCommand: MageWarsCommand = {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: lifeDrainSpellId,
                manaCost: 12,
                targetObjectId: armoredLivingTarget.id,
            },
        };
        const lifeDrainSpell = getMageWarsSpellCardFromConfig(lifeDrainSpellId);
        const rawDrainEvents = executeMageWarsSpellAbility({
            ownerId: '0',
            timestamp: 0,
            state: drainState,
            command: drainCommand,
            random: fixedRandom,
            spell: lifeDrainSpell!,
            manaCost: 12,
        });
        const rawDrainEventTypes = rawDrainEvents.map((event) => event.type);
        const drained = runCommand(drainState, drainCommand);

        const damageEvent = drained.events.find((event) => event.type === 'DAMAGE_DEALT');
        expect(planned.success).toBe(true);
        expect(rawDrainEventTypes).toContain(MAGE_WARS_EVENTS.SPELL_DIRECT_DAMAGE_HEALING_AVAILABLE);
        expect(rawDrainEventTypes).not.toContain(MAGE_WARS_EVENTS.SPELL_HEALING_ROLLED);
        expect(rawDrainEventTypes).not.toContain(MAGE_WARS_EVENTS.ARENA_OBJECT_DEFEATED);
        expect(rawDrainEvents).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_DIRECT_DAMAGE_HEALING_AVAILABLE,
                payload: expect.objectContaining({
                    sourcePlayerId: '0',
                    spellCardId: lifeDrainSpellId,
                    sourceAbilityId: 'mw.spell.3400',
                    healingTargetPlayerId: '0',
                    damagedTargetObjectId: armoredLivingTarget.id,
                    diceResults: [3, 3, 3, 3, 3],
                    healing: 15,
                }),
            }),
        ]));
        expect(drained.success).toBe(true);
        expect(drained.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_DIRECT_DAMAGE_ROLLED,
                payload: expect.objectContaining({
                    playerId: '0',
                    spellCardId: lifeDrainSpellId,
                    sourceAbilityId: 'mw.spell.3400',
                    targetObjectId: armoredLivingTarget.id,
                    targetZoneId: PLAYER_ZERO_START_ZONE,
                    diceResults: [3, 3, 3, 3, 3],
                    directDamage: 15,
                }),
            }),
            expect.objectContaining({
                type: 'DAMAGE_DEALT',
                payload: expect.objectContaining({
                    targetId: armoredLivingTarget.id,
                    actualDamage: 15,
                    sourceAbilityId: 'mw.spell.3400',
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_DIRECT_DAMAGE_HEALING_AVAILABLE,
                payload: expect.objectContaining({
                    sourcePlayerId: '0',
                    spellCardId: lifeDrainSpellId,
                    sourceAbilityId: 'mw.spell.3400',
                    healingTargetPlayerId: '0',
                    damagedTargetObjectId: armoredLivingTarget.id,
                    healing: 15,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_HEALING_ROLLED,
                payload: expect.objectContaining({
                    playerId: '0',
                    spellCardId: lifeDrainSpellId,
                    sourceAbilityId: 'mw.spell.3400',
                    targetPlayerId: '0',
                    diceResults: [3, 3, 3, 3, 3],
                    healing: 15,
                    actualHealing: 5,
                }),
            }),
        ]));
        const healingAvailableIndex = drained.events.findIndex((event) => (
            event.type === MAGE_WARS_EVENTS.SPELL_DIRECT_DAMAGE_HEALING_AVAILABLE
        ));
        const healingRolledIndex = drained.events.findIndex((event) => (
            event.type === MAGE_WARS_EVENTS.SPELL_HEALING_ROLLED
        ));
        expect(healingAvailableIndex).toBeGreaterThanOrEqual(0);
        expect(healingRolledIndex).toBeGreaterThanOrEqual(0);
        expect(healingAvailableIndex).toBeLessThan(healingRolledIndex);
        expect(JSON.stringify(damageEvent?.payload.breakdown)).not.toContain('mage-wars-object-armor');
        expect(drained.state.core.objects[armoredLivingTarget.id].damage).toBe(15);
        expect(drained.state.core.players['0']).toMatchObject({
            mana: 8,
            damage: 0,
            quickcastReady: false,
            actionReady: true,
        });
        expect(drained.state.core.players['0'].discardSpellCardIds).toEqual([lifeDrainSpellId]);
        expect(actionLogKinds(drained.state)).toEqual(expect.arrayContaining([
            MAGE_WARS_EVENTS.SPELL_DIRECT_DAMAGE_ROLLED,
            MAGE_WARS_EVENTS.SPELL_HEALING_ROLLED,
        ]));
    });

    it('routes lethal Life Drain defeat through direct-damage timing opportunities', () => {
        const lifeDrainSpellId = 3400;
        const planningState = setupState('planning');
        const warlockCore = withPlayerMage(planningState.core, '0', MAGE_IDS.WARLOCK_APPRENTICE);
        const planned = runCommand({
            core: {
                ...warlockCore,
                players: {
                    ...warlockCore.players,
                    '0': {
                        ...warlockCore.players['0'],
                        mana: 20,
                        damage: 5,
                    },
                },
            },
            sys: planningState.sys,
        }, planCommand([lifeDrainSpellId]));
        const livingTarget = makeArenaObject('life-drain-target-1', '1', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2907,
            sourceObjectId: 'spell-card-2907',
            name: '灰衣天使',
            life: 10,
            armor: 4,
            attackOrTraitLine: '利剑：快速近战 4 骰；飞行',
        });
        const drainState: MatchState<MageWarsCore> = {
            core: withArenaObject(planned.state.core, livingTarget),
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        };
        const drainCommand: MageWarsCommand = {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: lifeDrainSpellId,
                manaCost: 12,
                targetObjectId: livingTarget.id,
            },
        };
        const lifeDrainSpell = getMageWarsSpellCardFromConfig(lifeDrainSpellId);
        const rawDrainEvents = executeMageWarsSpellAbility({
            ownerId: '0',
            timestamp: 0,
            state: drainState,
            command: drainCommand,
            random: fixedRandom,
            spell: lifeDrainSpell!,
            manaCost: 12,
        });
        const rawDrainEventTypes = rawDrainEvents.map((event) => event.type);
        const drained = runCommand(drainState, drainCommand);

        expect(planned.success).toBe(true);
        expect(rawDrainEventTypes).toContain(MAGE_WARS_EVENTS.SPELL_DIRECT_DAMAGE_HEALING_AVAILABLE);
        expect(rawDrainEventTypes).toContain(MAGE_WARS_EVENTS.SPELL_DIRECT_DAMAGE_DEFEAT_AVAILABLE);
        expect(rawDrainEventTypes).not.toContain(MAGE_WARS_EVENTS.SPELL_HEALING_ROLLED);
        expect(rawDrainEventTypes).not.toContain(MAGE_WARS_EVENTS.ARENA_OBJECT_DEFEATED);
        expect(drained.success).toBe(true);
        expect(drained.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_DIRECT_DAMAGE_HEALING_AVAILABLE,
                payload: expect.objectContaining({
                    sourcePlayerId: '0',
                    sourceAbilityId: 'mw.spell.3400',
                    spellCardId: lifeDrainSpellId,
                    healingTargetPlayerId: '0',
                    damagedTargetObjectId: livingTarget.id,
                    healing: 15,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_HEALING_ROLLED,
                payload: expect.objectContaining({
                    playerId: '0',
                    sourceAbilityId: 'mw.spell.3400',
                    targetPlayerId: '0',
                    healing: 15,
                    actualHealing: 5,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_DIRECT_DAMAGE_DEFEAT_AVAILABLE,
                payload: expect.objectContaining({
                    sourcePlayerId: '0',
                    sourceAbilityId: 'mw.spell.3400',
                    spellCardId: lifeDrainSpellId,
                    targetObjectId: livingTarget.id,
                    targetObjectOwnerId: '1',
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_DEFEATED,
                payload: expect.objectContaining({
                    objectId: livingTarget.id,
                    ownerId: '1',
                    sourceAbilityId: 'mw.spell.3400',
                    spellCardId: lifeDrainSpellId,
                }),
            }),
        ]));
        const healingAvailableIndex = drained.events.findIndex((event) => (
            event.type === MAGE_WARS_EVENTS.SPELL_DIRECT_DAMAGE_HEALING_AVAILABLE
        ));
        const healingRolledIndex = drained.events.findIndex((event) => (
            event.type === MAGE_WARS_EVENTS.SPELL_HEALING_ROLLED
        ));
        const defeatAvailableIndex = drained.events.findIndex((event) => (
            event.type === MAGE_WARS_EVENTS.SPELL_DIRECT_DAMAGE_DEFEAT_AVAILABLE
        ));
        const defeatedIndex = drained.events.findIndex((event) => (
            event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_DEFEATED
            && event.payload.objectId === livingTarget.id
        ));
        expect(healingAvailableIndex).toBeGreaterThanOrEqual(0);
        expect(healingRolledIndex).toBeGreaterThanOrEqual(0);
        expect(defeatAvailableIndex).toBeGreaterThanOrEqual(0);
        expect(defeatedIndex).toBeGreaterThanOrEqual(0);
        expect(healingAvailableIndex).toBeLessThan(healingRolledIndex);
        expect(defeatAvailableIndex).toBeLessThan(defeatedIndex);
        expect(drained.state.core.players['0'].damage).toBe(0);
        expect(drained.state.core.objects[livingTarget.id]).toBeUndefined();
        expect(drained.state.core.arena.find((zone) => zone.id === PLAYER_ZERO_START_ZONE)?.objectIds).not.toContain(livingTarget.id);
    });

    it('rejects Life Drain on non-living arena objects', () => {
        const lifeDrainSpellId = 3400;
        const planningState = setupState('planning');
        const warlockCore = withPlayerMage(planningState.core, '0', MAGE_IDS.WARLOCK_APPRENTICE);
        const planned = runCommand({
            core: {
                ...warlockCore,
                players: {
                    ...warlockCore.players,
                    '0': {
                        ...warlockCore.players['0'],
                        mana: 20,
                    },
                },
            },
            sys: planningState.sys,
        }, planCommand([lifeDrainSpellId]));
        const skeleton = makeArenaObject('skeleton-1', '1', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2826,
            sourceObjectId: 'spell-card-2826',
            name: '骷髅哨兵',
            life: 6,
            attackOrTraitLine: '短剑：快速近战 4 骰；非活体；精神免疫',
        });

        expect(planned.success).toBe(true);
        expect(validateCommand({
            core: withArenaObject(planned.state.core, skeleton),
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: lifeDrainSpellId,
                manaCost: 12,
                targetObjectId: skeleton.id,
            },
        })).toBe('invalidHealingTarget');
    });

    it('rejects direct healing on non-living arena objects', () => {
        const healingSpellId = 3402;
        const planned = runCommand(setupState('planning'), planCommand([healingSpellId]));
        const skeleton = makeArenaObject('skeleton-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2826,
            sourceObjectId: 'spell-card-2826',
            name: '骷髅哨兵',
            damage: 3,
            life: 6,
            attackOrTraitLine: '短剑：快速近战 4 骰；非活体；精神免疫',
        });

        expect(validateCommand({
            core: withArenaObject(planned.state.core, skeleton),
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: healingSpellId,
                manaCost: 5,
                targetObjectId: skeleton.id,
            },
        })).toBe('invalidHealingTarget');
    });

    it('places status tokens from attack spell effect dice', () => {
        const spellCardId = 1710;
        const planned = runCommand(setupState('planning'), planCommand([spellCardId]));
        const spell = getMageWarsSpellCardFromConfig(spellCardId);
        const statusRandom: RandomFn = {
            ...fixedRandom,
            d: (sides: number) => (sides === 12 ? 5 : 3),
        };
        expect(spell).toBeDefined();

        const attackState: MatchState<MageWarsCore> = {
            core: withPlayerInZone(planned.state.core, '1', ARENA_ZONE_IDS.A2),
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        };
        const attackCommand: MageWarsCommand = {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId,
                manaCost: 4,
                targetPlayerId: '1',
            },
        };
        const rawSpellEvents = executeMageWarsSpellAbility({
            ownerId: '0',
            timestamp: 0,
            state: attackState,
            command: attackCommand,
            random: statusRandom,
            spell: spell!,
            manaCost: 4,
        });
        const rawSpellEventTypes = rawSpellEvents.map((event) => event.type);
        const result = runCommand(attackState, attackCommand, statusRandom);

        expect(result.success).toBe(true);
        expect(rawSpellEventTypes).toContain(MAGE_WARS_EVENTS.SPELL_ATTACK_STATUS_EFFECT_AVAILABLE);
        expect(rawSpellEventTypes).not.toContain(MAGE_WARS_EVENTS.STATUS_TOKEN_PLACED);
        expect(result.events.find((event) => event.type === MAGE_WARS_EVENTS.SPELL_ATTACK_ROLLED)).toMatchObject({
            payload: {
                spellCardId,
                effectDieResult: 5,
            },
        });
        expect(result.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_ATTACK_STATUS_EFFECT_AVAILABLE,
                payload: expect.objectContaining({
                    targetPlayerId: '1',
                    statusTokenId: STATUS_TOKEN_IDS.DAZE,
                    amount: 1,
                    sourceAbilityId: 'mw.spell.1710',
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_PLACED,
                payload: expect.objectContaining({
                    targetPlayerId: '1',
                    statusTokenId: STATUS_TOKEN_IDS.DAZE,
                    amount: 1,
                    sourceAbilityId: 'mw.spell.1710',
                }),
            }),
        ]));
        const statusAvailableIndex = result.events.findIndex((event) => (
            event.type === MAGE_WARS_EVENTS.SPELL_ATTACK_STATUS_EFFECT_AVAILABLE
            && event.payload.targetPlayerId === '1'
        ));
        const statusPlacedIndex = result.events.findIndex((event) => (
            event.type === MAGE_WARS_EVENTS.STATUS_TOKEN_PLACED
            && event.payload.targetPlayerId === '1'
        ));
        expect(statusAvailableIndex).toBeGreaterThanOrEqual(0);
        expect(statusPlacedIndex).toBeGreaterThanOrEqual(0);
        expect(statusAvailableIndex).toBeLessThan(statusPlacedIndex);
        expect(result.state.core.players['1'].statusTokens[STATUS_TOKEN_IDS.DAZE]).toBe(1);
        expect(actionLogKinds(result.state)).toContain(MAGE_WARS_EVENTS.STATUS_TOKEN_PLACED);
    });

    it('does not place daze or stun on conjurations', () => {
        const spellCardId = 1705;
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.WIZARD_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([spellCardId]));
        const conjuration = makeArenaObject('vine-1', '1', ARENA_ZONE_IDS.A2, {
            kind: 'conjuration',
            sourceSpellCardId: 2224,
            sourceObjectId: 'spell-card-2224',
            name: '缠绕藤蔓',
            life: 30,
            attackOrTraitLine: '活体；火焰+2；水流免疫',
        });
        const stunRandom: RandomFn = {
            ...fixedRandom,
            d: (sides: number) => (sides === 12 ? 8 : 3),
        };

        const attacked = runCommand({
            core: withArenaObject(planned.state.core, conjuration),
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId,
                manaCost: 8,
                targetObjectId: conjuration.id,
            },
        }, stunRandom);

        expect(attacked.success).toBe(true);
        expect(attacked.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_ATTACK_ROLLED,
                payload: expect.objectContaining({
                    spellCardId,
                    effectDieResult: 8,
                    targetObjectId: conjuration.id,
                }),
            }),
            expect.objectContaining({
                type: 'DAMAGE_DEALT',
                payload: expect.objectContaining({
                    targetId: conjuration.id,
                    actualDamage: 15,
                }),
            }),
        ]));
        expect(attacked.events).not.toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_PLACED,
                payload: expect.objectContaining({
                    targetObjectId: conjuration.id,
                    statusTokenId: STATUS_TOKEN_IDS.STUN,
                }),
            }),
        ]));
        expect(attacked.state.core.objects[conjuration.id].statusTokens).toEqual({});
    });

    it('casts Flameblast from the warlock spellbook as a single-target burn attack', () => {
        const spellCardId = 1702;
        const statusRandom: RandomFn = {
            ...fixedRandom,
            d: (sides: number) => (sides === 12 ? 11 : 3),
        };
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.WARLOCK_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([spellCardId]));
        const target = makeArenaObject('guard-1', '1', ARENA_ZONE_IDS.A2, {
            life: 30,
            guarding: true,
        });

        const result = runCommand({
            core: withArenaObject(planned.state.core, target),
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId,
                manaCost: 5,
                targetObjectId: target.id,
            },
        }, statusRandom);

        expect(planned.success).toBe(true);
        expect(result.success).toBe(true);
        expect(result.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_ATTACK_ROLLED,
                payload: expect.objectContaining({
                    spellCardId,
                    sourceAbilityId: 'mw.spell.1702',
                    targetObjectId: target.id,
                    diceResults: [3, 3, 3, 3],
                    effectDieResult: 11,
                    baseDamage: 12,
                }),
            }),
            expect.objectContaining({
                type: 'DAMAGE_DEALT',
                payload: expect.objectContaining({
                    targetId: target.id,
                    actualDamage: 12,
                    sourceAbilityId: 'mw.spell.1702',
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_PLACED,
                payload: expect.objectContaining({
                    targetObjectId: target.id,
                    statusTokenId: STATUS_TOKEN_IDS.BURN,
                    amount: 2,
                    sourceAbilityId: 'mw.spell.1702',
                    spellCardId,
                }),
            }),
        ]));
        expect(result.state.core.objects[target.id]).toMatchObject({
            damage: 12,
            statusTokens: {
                [STATUS_TOKEN_IDS.BURN]: 2,
            },
        });
    });

    it('does not place burn on arena objects with cannot-burn traits', () => {
        const spellCardId = 1702;
        const statusRandom: RandomFn = {
            ...fixedRandom,
            d: (sides: number) => (sides === 12 ? 11 : 3),
        };
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.WARLOCK_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([spellCardId]));
        const target = makeArenaObject('cannot-burn-1', '1', ARENA_ZONE_IDS.A2, {
            life: 30,
            attackOrTraitLine: '短剑：快速近战 4 骰；无法燃烧',
        });

        const result = runCommand({
            core: withArenaObject(planned.state.core, target),
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId,
                manaCost: 5,
                targetObjectId: target.id,
            },
        }, statusRandom);

        expect(result.success).toBe(true);
        expect(result.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_ATTACK_ROLLED,
                payload: expect.objectContaining({
                    spellCardId,
                    effectDieResult: 11,
                }),
            }),
            expect.objectContaining({
                type: 'DAMAGE_DEALT',
                payload: expect.objectContaining({
                    targetId: target.id,
                    actualDamage: 12,
                }),
            }),
        ]));
        expect(result.events.some((event) => (
            event.type === MAGE_WARS_EVENTS.STATUS_TOKEN_PLACED
            && event.payload.targetObjectId === target.id
            && event.payload.statusTokenId === STATUS_TOKEN_IDS.BURN
        ))).toBe(false);
        expect(result.state.core.objects[target.id].statusTokens[STATUS_TOKEN_IDS.BURN]).toBeUndefined();
    });

    it('casts Lightning Bolt from the wizard spellbook as a single-target stun attack', () => {
        const spellCardId = 1705;
        const statusRandom: RandomFn = {
            ...fixedRandom,
            d: (sides: number) => (sides === 12 ? 8 : 3),
        };
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.WIZARD_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([spellCardId]));
        const target = makeArenaObject('guard-1', '1', ARENA_ZONE_IDS.A2, {
            life: 30,
        });

        const result = runCommand({
            core: withArenaObject(planned.state.core, target),
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId,
                manaCost: 8,
                targetObjectId: target.id,
            },
        }, statusRandom);

        expect(planned.success).toBe(true);
        expect(result.success).toBe(true);
        expect(result.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_ATTACK_ROLLED,
                payload: expect.objectContaining({
                    spellCardId,
                    sourceAbilityId: 'mw.spell.1705',
                    targetObjectId: target.id,
                    diceResults: [3, 3, 3, 3, 3],
                    effectDieResult: 8,
                    baseDamage: 15,
                }),
            }),
            expect.objectContaining({
                type: 'DAMAGE_DEALT',
                payload: expect.objectContaining({
                    targetId: target.id,
                    actualDamage: 15,
                    sourceAbilityId: 'mw.spell.1705',
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_PLACED,
                payload: expect.objectContaining({
                    targetObjectId: target.id,
                    statusTokenId: STATUS_TOKEN_IDS.STUN,
                    amount: 1,
                    sourceAbilityId: 'mw.spell.1705',
                    spellCardId,
                }),
            }),
        ]));
        expect(result.state.core.objects[target.id]).toMatchObject({
            damage: 15,
            guarding: false,
            statusTokens: {
                [STATUS_TOKEN_IDS.STUN]: 1,
            },
        });
    });

    it('applies target lightning weakness to spell attack dice and effect dice', () => {
        const spellCardId = 1705;
        const statusRandom: RandomFn = {
            ...fixedRandom,
            d: (sides: number) => (sides === 12 ? 6 : 3),
        };
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.WIZARD_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([spellCardId]));
        const target = makeArenaObject('lightning-weak-1', '1', ARENA_ZONE_IDS.A2, {
            life: 30,
            attackOrTraitLine: '长剑：快速近战 5 骰；防御图标 `8+ / 1x`；闪电+2',
        });

        const result = runCommand({
            core: withArenaObject(planned.state.core, target),
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId,
                manaCost: 8,
                targetObjectId: target.id,
            },
        }, statusRandom);

        expect(planned.success).toBe(true);
        expect(result.success).toBe(true);
        expect(result.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_ATTACK_ROLLED,
                payload: expect.objectContaining({
                    spellCardId,
                    sourceAbilityId: 'mw.spell.1705',
                    targetObjectId: target.id,
                    diceResults: [3, 3, 3, 3, 3, 3, 3],
                    rawEffectDieResult: 6,
                    effectDieResult: 8,
                    baseDamage: 21,
                }),
            }),
            expect.objectContaining({
                type: 'DAMAGE_DEALT',
                payload: expect.objectContaining({
                    targetId: target.id,
                    actualDamage: 21,
                    sourceAbilityId: 'mw.spell.1705',
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_PLACED,
                payload: expect.objectContaining({
                    targetObjectId: target.id,
                    statusTokenId: STATUS_TOKEN_IDS.STUN,
                    amount: 1,
                    sourceAbilityId: 'mw.spell.1705',
                    spellCardId,
                }),
            }),
        ]));
        expect(result.state.core.objects[target.id]).toMatchObject({
            damage: 21,
            statusTokens: {
                [STATUS_TOKEN_IDS.STUN]: 1,
            },
        });
    });

    it('rejects targeted attack spells against matching damage type immunity', () => {
        const spellCardId = 1705;
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.WIZARD_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([spellCardId]));
        const target = makeArenaObject('lightning-immune-1', '1', ARENA_ZONE_IDS.A2, {
            life: 30,
            attackOrTraitLine: '长剑：快速近战 5 骰；闪电免疫',
        });
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(planned.state.core, target),
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        };

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId,
                manaCost: 8,
                targetObjectId: target.id,
            },
        })).toBe('targetImmuneToDamageType');
    });

    it('applies target fire resistance to spell attack dice and effect dice', () => {
        const spellCardId = 1702;
        const statusRandom: RandomFn = {
            ...fixedRandom,
            d: (sides: number) => (sides === 12 ? 11 : 3),
        };
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.WARLOCK_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([spellCardId]));
        const target = makeArenaObject('fire-resistant-1', '1', ARENA_ZONE_IDS.A2, {
            life: 30,
            attackOrTraitLine: '狱火剑：快速近战 4 骰，穿刺+2；火焰-2',
        });

        const result = runCommand({
            core: withArenaObject(planned.state.core, target),
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId,
                manaCost: 5,
                targetObjectId: target.id,
            },
        }, statusRandom);

        expect(planned.success).toBe(true);
        expect(result.success).toBe(true);
        expect(result.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_ATTACK_ROLLED,
                payload: expect.objectContaining({
                    spellCardId,
                    sourceAbilityId: 'mw.spell.1702',
                    targetObjectId: target.id,
                    diceResults: [3, 3],
                    rawEffectDieResult: 11,
                    effectDieResult: 9,
                    baseDamage: 6,
                }),
            }),
            expect.objectContaining({
                type: 'DAMAGE_DEALT',
                payload: expect.objectContaining({
                    targetId: target.id,
                    actualDamage: 6,
                    sourceAbilityId: 'mw.spell.1702',
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_PLACED,
                payload: expect.objectContaining({
                    targetObjectId: target.id,
                    statusTokenId: STATUS_TOKEN_IDS.BURN,
                    amount: 1,
                    sourceAbilityId: 'mw.spell.1702',
                    spellCardId,
                }),
            }),
        ]));
        expect(result.state.core.objects[target.id]).toMatchObject({
            damage: 6,
            statusTokens: {
                [STATUS_TOKEN_IDS.BURN]: 1,
            },
        });
    });

    it('cancels intermittent jet damage to remove all burn from a burning target', () => {
        const spellCardId = 1710;
        const planned = runCommand(setupState('planning'), planCommand([spellCardId]));
        const coreWithTarget = withPlayerInZone(planned.state.core, '1', ARENA_ZONE_IDS.A2);
        const burningCore: MageWarsCore = {
            ...coreWithTarget,
            players: {
                ...coreWithTarget.players,
                '1': {
                    ...coreWithTarget.players['1'],
                    damage: 5,
                    statusTokens: {
                        ...coreWithTarget.players['1'].statusTokens,
                        [STATUS_TOKEN_IDS.BURN]: 2,
                    },
                },
            },
        };

        const spellState: MatchState<MageWarsCore> = {
            core: burningCore,
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        };
        const castCommand: MageWarsCommand = {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId,
                manaCost: 4,
                targetPlayerId: '1',
            },
        };
        const rawEvents = MageWarsDomain.execute(spellState, castCommand, fixedRandom);
        const rawEventTypes = rawEvents.map((event) => event.type);
        expect(rawEventTypes).toContain(MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVAL_AVAILABLE);
        expect(rawEventTypes).not.toContain(MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVED);

        const result = runCommand(spellState, castCommand);

        expect(result.success).toBe(true);
        expect(result.events.map((event) => event.type)).toContain(MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVAL_AVAILABLE);
        expect(result.events.map((event) => event.type)).toContain(MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVED);
        expect(result.events.map((event) => event.type)).not.toContain(MAGE_WARS_EVENTS.SPELL_ATTACK_ROLLED);
        expect(result.events.map((event) => event.type)).not.toContain('DAMAGE_DEALT');
        expect(result.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVAL_AVAILABLE,
                payload: expect.objectContaining({
                    targetPlayerId: '1',
                    statusTokenId: STATUS_TOKEN_IDS.BURN,
                    amount: 2,
                    sourceAbilityId: 'mw.spell.1710',
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVED,
                payload: expect.objectContaining({
                    targetPlayerId: '1',
                    statusTokenId: STATUS_TOKEN_IDS.BURN,
                    amount: 2,
                    sourceAbilityId: 'mw.spell.1710',
                }),
            }),
        ]));
        const removalAvailableIndex = result.events.findIndex((event) => (
            event.type === MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVAL_AVAILABLE
            && event.payload.statusTokenId === STATUS_TOKEN_IDS.BURN
        ));
        const removedIndex = result.events.findIndex((event) => (
            event.type === MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVED
            && event.payload.statusTokenId === STATUS_TOKEN_IDS.BURN
        ));
        expect(removalAvailableIndex).toBeGreaterThanOrEqual(0);
        expect(removedIndex).toBeGreaterThan(removalAvailableIndex);
        expect(result.state.core.players['1'].damage).toBe(5);
        expect(result.state.core.players['1'].statusTokens[STATUS_TOKEN_IDS.BURN]).toBeUndefined();
        expect(actionLogKinds(result.state)).toContain(MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVED);
    });
});
