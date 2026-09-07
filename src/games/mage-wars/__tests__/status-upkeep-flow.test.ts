import { describe, expect, it } from 'vitest';
import { FLOW_COMMANDS } from '../../../engine/systems/FlowSystem';
import type { Command, MatchState, RandomFn } from '../../../engine/types';
import { MAGE_WARS_COMMANDS } from '../domain';
import { MAGE_WARS_EVENTS } from '../domain/events';
import { resolveMageWarsBasicAttackEvents, resolveMageWarsObjectAttackEvents } from '../domain/execute';
import { mageWarsFlowHooks } from '../domain/flowHooks';
import { ARENA_ZONE_IDS, STATUS_TOKEN_IDS } from '../domain/ids';
import type { MageWarsCommand, MageWarsCore } from '../domain/types';
import {
    actionLogKinds,
    fixedRandom,
    makeArenaObject,
    makeVisibleEnchantmentObject,
    planCommand,
    PLAYER_ONE_START_ZONE,
    PLAYER_ZERO_START_ZONE,
    readMageWarsPhaseExitEvents,
    runCommand,
    setupState,
    validateCommand,
    withArenaObject,
    withPlayerInZone,
} from './helpers/domainFlowHarness';

describe('mage-wars status and upkeep flow', () => {
    it('removes defeated arena objects and readies next player creatures on turn handoff', () => {
        const baseState = setupState('creatureAction');
        const attacker = makeArenaObject('cat-0', '0', PLAYER_ZERO_START_ZONE);
        const defender = makeArenaObject('guard-1', '1', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2909,
            sourceObjectId: 'spell-card-2909',
            name: '皇家弓手',
            life: 6,
        });
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(withArenaObject(baseState.core, attacker), defender),
            sys: baseState.sys,
        };
        const rawAttackEvents = resolveMageWarsObjectAttackEvents({
            state,
            sourceCommandType: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            timestamp: 0,
            random: fixedRandom,
            attackerObjectId: attacker.id,
            attackProfileId: 'attack-0',
            targetObjectId: defender.id,
        });
        const rawAttackEventTypes = rawAttackEvents.map((event) => event.type);

        const defeated = runCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: defender.id,
            },
        });

        expect(defeated.success).toBe(true);
        expect(rawAttackEventTypes).toContain(MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DEFEAT_AVAILABLE);
        expect(rawAttackEventTypes).not.toContain(MAGE_WARS_EVENTS.ARENA_OBJECT_DEFEATED);
        expect(defeated.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DEFEAT_AVAILABLE,
                payload: expect.objectContaining({
                    attackerObjectId: attacker.id,
                    targetObjectId: defender.id,
                    sourceAbilityId: 'mw.object.2906.attack-0',
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_DEFEATED,
                payload: expect.objectContaining({
                    objectId: defender.id,
                    ownerId: '1',
                    sourceAbilityId: 'mw.object.2906.attack-0',
                }),
            }),
        ]));
        const defeatAvailableIndex = defeated.events.findIndex((event) => (
            event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DEFEAT_AVAILABLE
            && event.payload.targetObjectId === defender.id
        ));
        const defeatedIndex = defeated.events.findIndex((event) => (
            event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_DEFEATED
            && event.payload.objectId === defender.id
        ));
        expect(defeatAvailableIndex).toBeGreaterThanOrEqual(0);
        expect(defeatedIndex).toBeGreaterThanOrEqual(0);
        expect(defeatAvailableIndex).toBeLessThan(defeatedIndex);
        expect(defeated.state.core.objects[defender.id]).toBeUndefined();
        expect(defeated.state.core.arena.find((zone) => zone.id === PLAYER_ZERO_START_ZONE)?.objectIds).not.toContain(defender.id);

        const nextPlayerObject = makeArenaObject('cleric-1', '1', PLAYER_ONE_START_ZONE, { actionReady: false });
        const finalQuickcastState: MatchState<MageWarsCore> = {
            core: withArenaObject({
                ...baseState.core,
                players: {
                    ...baseState.core.players,
                    '1': {
                        ...baseState.core.players['1'],
                        actionReady: false,
                    },
                },
            }, nextPlayerObject),
            sys: { ...baseState.sys, phase: 'finalQuickcast' },
        };

        const nextTurn = runCommand(finalQuickcastState, {
            type: FLOW_COMMANDS.ADVANCE_PHASE,
            playerId: '0',
            payload: {},
        });

        expect(nextTurn.success).toBe(true);
        expect(nextTurn.state.core.currentPlayerId).toBe('1');
        expect(nextTurn.state.core.players['1'].actionReady).toBe(true);
        expect(nextTurn.state.core.objects[nextPlayerObject.id].actionReady).toBe(true);
        expect(nextTurn.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ACTION_READINESS_RESET,
                payload: expect.objectContaining({
                    playerId: '1',
                    objectIds: [nextPlayerObject.id],
                }),
            }),
        ]));
    });

    it('regenerates damaged living arena objects during upkeep without stacking regeneration values', () => {
        const baseState = setupState('channel');
        const highlandUnicorn = makeArenaObject('unicorn-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2814,
            sourceObjectId: 'spell-card-2814',
            name: '高地独角兽',
            life: 9,
            damage: 4,
            armor: 2,
            attackOrTraitLine: '特角：快速近战 3 骰；重生2；冲锋+2',
            rulesText: '所有与高地独角兽位于同一格区域的友方活体生物获得重生1特性。',
        });
        const woundedCat = makeArenaObject('cat-ally', '0', PLAYER_ZERO_START_ZONE, {
            damage: 3,
            attackOrTraitLine: '利爪：快速近战 2 骰',
        });
        const gorgonArcher = makeArenaObject('gorgon-ally', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2810,
            sourceObjectId: 'spell-card-2810',
            name: '戈尔贡箭手',
            life: 13,
            damage: 3,
            attackOrTraitLine: '毒弓：完整行动远程 `1-2` 4 骰，效果骰 `4-9=虚弱`、`10+=虚弱x2`；利爪：快速近战 2 骰；重生2；迟缓',
        });
        const nonlivingSkeleton = makeArenaObject('skeleton-ally', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2826,
            sourceObjectId: 'spell-card-2826',
            name: '骷髅哨兵',
            life: 11,
            damage: 4,
            attackOrTraitLine: '短剑：快速近战 4 骰；非活体；重生2',
        });
        const state: MatchState<MageWarsCore> = {
            core: [highlandUnicorn, woundedCat, gorgonArcher, nonlivingSkeleton].reduce(
                (core, object) => withArenaObject(core, object),
                baseState.core,
            ),
            sys: baseState.sys,
        };

        const upkeep = runCommand(state, {
            type: FLOW_COMMANDS.ADVANCE_PHASE,
            playerId: '0',
            payload: {},
        });

        const regenerationEvents = upkeep.events.filter((event) => (
            event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_REGENERATED
        ));
        expect(upkeep.success).toBe(true);
        expect(regenerationEvents).toEqual(expect.arrayContaining([
            expect.objectContaining({
                payload: expect.objectContaining({
                    objectId: highlandUnicorn.id,
                    regeneration: 2,
                    actualHealing: 2,
                    sourceObjectIds: [highlandUnicorn.id],
                }),
            }),
            expect.objectContaining({
                payload: expect.objectContaining({
                    objectId: woundedCat.id,
                    regeneration: 1,
                    actualHealing: 1,
                    sourceObjectIds: [highlandUnicorn.id],
                }),
            }),
            expect.objectContaining({
                payload: expect.objectContaining({
                    objectId: gorgonArcher.id,
                    regeneration: 2,
                    actualHealing: 2,
                    sourceObjectIds: [gorgonArcher.id],
                }),
            }),
        ]));
        expect(regenerationEvents).toHaveLength(3);
        expect(upkeep.state.core.objects[highlandUnicorn.id].damage).toBe(2);
        expect(upkeep.state.core.objects[woundedCat.id].damage).toBe(2);
        expect(upkeep.state.core.objects[gorgonArcher.id].damage).toBe(1);
        expect(upkeep.state.core.objects[nonlivingSkeleton.id].damage).toBe(4);
        expect(actionLogKinds(upkeep.state)).toContain(MAGE_WARS_EVENTS.ARENA_OBJECT_REGENERATED);
    });

    it('emits upkeep automatic damage facts from flow hooks without resolving damage there', () => {
        const baseState = setupState('channel');
        const rottedCat = makeArenaObject('flow-rot-cat-0', '0', PLAYER_ZERO_START_ZONE, {
            statusTokens: { [STATUS_TOKEN_IDS.ROT]: 1 },
        });
        const toxicTarget = makeArenaObject('flow-toxic-target-1', '1', ARENA_ZONE_IDS.A2, {
            life: 20,
            damage: 3,
        });
        const toxicEnchantment = makeVisibleEnchantmentObject('flow-toxic-enchantment-0', '0', ARENA_ZONE_IDS.A2, {
            sourceSpellCardId: 1820,
            sourceObjectId: 'spell-card-1820',
            name: 'Ghoul Rot',
            anchoredToObjectId: toxicTarget.id,
        });
        const state: MatchState<MageWarsCore> = {
            core: [rottedCat, toxicTarget, toxicEnchantment].reduce(
                (core, object) => withArenaObject(core, object),
                {
                    ...baseState.core,
                    players: {
                        ...baseState.core.players,
                        '0': {
                            ...baseState.core.players['0'],
                            statusTokens: { [STATUS_TOKEN_IDS.BURN]: 1 },
                        },
                    },
                },
            ),
            sys: baseState.sys,
        };

        const result = mageWarsFlowHooks.onPhaseEnter?.({
            state,
            from: 'channel',
            to: 'upkeep',
            command: {
                type: FLOW_COMMANDS.ADVANCE_PHASE,
                playerId: '0',
                payload: {},
            },
            random: fixedRandom,
        });
        const hookEvents = (Array.isArray(result) ? result : result?.events) ?? [];
        const toxicAvailable = hookEvents.find((event) => (
            event.type === MAGE_WARS_EVENTS.UPKEEP_ENCHANTMENT_DIRECT_DAMAGE_AVAILABLE
        ));

        expect(hookEvents.map((event) => event.type)).toEqual(expect.arrayContaining([
            MAGE_WARS_EVENTS.UPKEEP_ROT_DAMAGE_AVAILABLE,
            MAGE_WARS_EVENTS.UPKEEP_BURN_ROLL_AVAILABLE,
            MAGE_WARS_EVENTS.UPKEEP_ENCHANTMENT_DIRECT_DAMAGE_AVAILABLE,
        ]));
        expect(hookEvents).not.toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'DAMAGE_DEALT' }),
            expect.objectContaining({ type: MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVED }),
            expect.objectContaining({ type: MAGE_WARS_EVENTS.ARENA_OBJECT_DEFEATED }),
            expect.objectContaining({ type: MAGE_WARS_EVENTS.MAGE_DEFEATED }),
        ]));
        expect(toxicAvailable).toMatchObject({
            payload: expect.objectContaining({
                sourceObjectId: toxicEnchantment.id,
                sourceSpellCardId: 1820,
                sourcePlayerId: '0',
                targetObjectId: toxicTarget.id,
                amount: 2,
            }),
        });
    });

    it('deals direct rot damage to mages and living arena objects during upkeep', () => {
        const baseState = setupState('channel');
        const rottedCat = makeArenaObject('rotted-cat-0', '0', PLAYER_ZERO_START_ZONE, {
            damage: 1,
            statusTokens: { [STATUS_TOKEN_IDS.ROT]: 1 },
        });
        const nonlivingSkeleton = makeArenaObject('rotted-skeleton-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2826,
            sourceObjectId: 'spell-card-2826',
            name: '骷髅哨兵',
            life: 11,
            damage: 4,
            attackOrTraitLine: '短剑：快速近战 4 骰；非活体；重生2',
            statusTokens: { [STATUS_TOKEN_IDS.ROT]: 1 },
        });
        const state: MatchState<MageWarsCore> = {
            core: [rottedCat, nonlivingSkeleton].reduce(
                (core, object) => withArenaObject(core, object),
                {
                    ...baseState.core,
                    players: {
                        ...baseState.core.players,
                        '0': {
                            ...baseState.core.players['0'],
                            damage: 2,
                            statusTokens: { [STATUS_TOKEN_IDS.ROT]: 1 },
                        },
                        '1': {
                            ...baseState.core.players['1'],
                            damage: 3,
                            statusTokens: { [STATUS_TOKEN_IDS.ROT]: 2 },
                        },
                    },
                },
            ),
            sys: baseState.sys,
        };

        const upkeep = runCommand(state, {
            type: FLOW_COMMANDS.ADVANCE_PHASE,
            playerId: '0',
            payload: {},
        });
        const rotDamageEvents = upkeep.events.filter((event) => (
            event.type === 'DAMAGE_DEALT'
            && event.payload.sourceAbilityId === 'mw.status.rot.upkeep'
        ));

        expect(upkeep.success).toBe(true);
        expect(rotDamageEvents).toEqual(expect.arrayContaining([
            expect.objectContaining({
                payload: expect.objectContaining({ targetId: '0', actualDamage: 1 }),
            }),
            expect.objectContaining({
                payload: expect.objectContaining({ targetId: '1', actualDamage: 2 }),
            }),
            expect.objectContaining({
                payload: expect.objectContaining({ targetId: rottedCat.id, actualDamage: 1 }),
            }),
        ]));
        expect(rotDamageEvents).toHaveLength(3);
        expect(upkeep.state.core.players['0'].damage).toBe(3);
        expect(upkeep.state.core.players['1'].damage).toBe(5);
        expect(upkeep.state.core.objects[rottedCat.id].damage).toBe(2);
        expect(upkeep.state.core.objects[rottedCat.id].statusTokens[STATUS_TOKEN_IDS.ROT]).toBe(1);
        expect(upkeep.state.core.objects[nonlivingSkeleton.id].damage).toBe(4);
        expect(actionLogKinds(upkeep.state)).toContain('DAMAGE_DEALT');
    });

    it('rolls burn upkeep damage per burn token and removes tokens on blanks', () => {
        const baseState = setupState('channel');
        const burningCat = makeArenaObject('burning-cat-0', '0', PLAYER_ZERO_START_ZONE, {
            damage: 1,
            statusTokens: { [STATUS_TOKEN_IDS.BURN]: 2 },
        });
        const burnRolls = [0, 2, 1, 0, 0];
        const burnRandom: RandomFn = {
            ...fixedRandom,
            range: (min: number, max: number) => {
                const next = burnRolls.shift();
                if (next === undefined) return min;
                return Math.max(min, Math.min(max, next));
            },
        };
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject({
                ...baseState.core,
                players: {
                    ...baseState.core.players,
                    '0': {
                        ...baseState.core.players['0'],
                        damage: 2,
                        statusTokens: { [STATUS_TOKEN_IDS.BURN]: 2 },
                    },
                    '1': {
                        ...baseState.core.players['1'],
                        damage: 3,
                        statusTokens: { [STATUS_TOKEN_IDS.BURN]: 1 },
                    },
                },
            }, burningCat),
            sys: baseState.sys,
        };

        const upkeep = runCommand(state, {
            type: FLOW_COMMANDS.ADVANCE_PHASE,
            playerId: '0',
            payload: {},
        }, burnRandom);
        const burnDamageEvents = upkeep.events.filter((event) => (
            event.type === 'DAMAGE_DEALT'
            && event.payload.sourceAbilityId === 'mw.status.burn.upkeep'
        ));
        const burnRemovalEvents = upkeep.events.filter((event) => (
            event.type === MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVED
            && event.payload.statusTokenId === STATUS_TOKEN_IDS.BURN
        ));

        expect(upkeep.success).toBe(true);
        expect(burnDamageEvents).toEqual(expect.arrayContaining([
            expect.objectContaining({
                payload: expect.objectContaining({ targetId: '0', actualDamage: 2 }),
            }),
            expect.objectContaining({
                payload: expect.objectContaining({ targetId: '1', actualDamage: 1 }),
            }),
        ]));
        expect(burnDamageEvents).toHaveLength(2);
        expect(burnRemovalEvents).toEqual(expect.arrayContaining([
            expect.objectContaining({
                payload: expect.objectContaining({
                    targetPlayerId: '0',
                    amount: 1,
                    sourceAbilityId: 'mw.status.burn.upkeep',
                }),
            }),
            expect.objectContaining({
                payload: expect.objectContaining({
                    targetObjectId: burningCat.id,
                    amount: 2,
                    sourceAbilityId: 'mw.status.burn.upkeep',
                }),
            }),
        ]));
        expect(burnRemovalEvents).toHaveLength(2);
        expect(upkeep.state.core.players['0'].damage).toBe(4);
        expect(upkeep.state.core.players['0'].statusTokens[STATUS_TOKEN_IDS.BURN]).toBe(1);
        expect(upkeep.state.core.players['1'].damage).toBe(4);
        expect(upkeep.state.core.players['1'].statusTokens[STATUS_TOKEN_IDS.BURN]).toBe(1);
        expect(upkeep.state.core.objects[burningCat.id].damage).toBe(1);
        expect(upkeep.state.core.objects[burningCat.id].statusTokens[STATUS_TOKEN_IDS.BURN]).toBeUndefined();
        expect(actionLogKinds(upkeep.state)).toEqual(expect.arrayContaining([
            'DAMAGE_DEALT',
            MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVED,
        ]));
    });

    it('replaces sleep with daze when a sleeping arena object takes damage', () => {
        const baseState = setupState('creatureAction');
        const attacker = makeArenaObject('cat-0', '0', PLAYER_ZERO_START_ZONE);
        const sleepingTarget = makeArenaObject('sleeping-cat-1', '1', PLAYER_ZERO_START_ZONE, {
            life: 10,
            statusTokens: { [STATUS_TOKEN_IDS.SLEEP]: 1 },
        });
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(withArenaObject(baseState.core, attacker), sleepingTarget),
            sys: baseState.sys,
        };

        const attacked = runCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: sleepingTarget.id,
            },
        });

        expect(attacked.success).toBe(true);
        expect(attacked.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: 'DAMAGE_DEALT',
                payload: expect.objectContaining({
                    targetId: sleepingTarget.id,
                    actualDamage: 6,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVED,
                payload: expect.objectContaining({
                    targetObjectId: sleepingTarget.id,
                    statusTokenId: STATUS_TOKEN_IDS.SLEEP,
                    amount: 1,
                    sourceAbilityId: 'mw.status.sleep.damage-replacement',
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_PLACED,
                payload: expect.objectContaining({
                    targetObjectId: sleepingTarget.id,
                    statusTokenId: STATUS_TOKEN_IDS.DAZE,
                    amount: 1,
                    sourceAbilityId: 'mw.status.sleep.damage-replacement',
                }),
            }),
        ]));
        expect(attacked.eventCommitEvidence).toEqual(expect.arrayContaining([
            expect.objectContaining({
                position: 'eventCommit',
                factKind: 'DAMAGE_DEALT',
                originalEventType: 'DAMAGE_DEALT',
                opportunityIds: expect.arrayContaining([
                    expect.stringContaining('mw-sleep-damage-replacement'),
                ]),
                appliedOpportunityIds: expect.arrayContaining([
                    expect.stringContaining('mw-sleep-damage-replacement'),
                ]),
            }),
        ]));
        expect(attacked.state.core.objects[sleepingTarget.id].damage).toBe(6);
        expect(attacked.state.core.objects[sleepingTarget.id].statusTokens).toEqual({
            [STATUS_TOKEN_IDS.DAZE]: 1,
        });
        expect(actionLogKinds(attacked.state)).toEqual(expect.arrayContaining([
            'DAMAGE_DEALT',
            MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVED,
            MAGE_WARS_EVENTS.STATUS_TOKEN_PLACED,
        ]));
    });

    it('keeps sleep when armor prevents all incoming damage', () => {
        const baseState = setupState('creatureAction');
        const attacker = makeArenaObject('cat-0', '0', PLAYER_ZERO_START_ZONE);
        const armoredSleeper = makeArenaObject('armored-sleeper-1', '1', PLAYER_ZERO_START_ZONE, {
            armor: 10,
            life: 10,
            statusTokens: { [STATUS_TOKEN_IDS.SLEEP]: 1 },
        });
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(withArenaObject(baseState.core, attacker), armoredSleeper),
            sys: baseState.sys,
        };

        const attacked = runCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: armoredSleeper.id,
            },
        });

        expect(attacked.success).toBe(true);
        expect(attacked.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: 'DAMAGE_DEALT',
                payload: expect.objectContaining({
                    targetId: armoredSleeper.id,
                    actualDamage: 0,
                }),
            }),
        ]));
        expect(attacked.events.some((event) => (
            event.type === MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVED
            && event.payload.statusTokenId === STATUS_TOKEN_IDS.SLEEP
        ))).toBe(false);
        expect(attacked.state.core.objects[armoredSleeper.id].statusTokens).toEqual({
            [STATUS_TOKEN_IDS.SLEEP]: 1,
        });
    });

    it('applies weak to mage basic melee attacks', () => {
        const baseState = setupState('creatureAction');
        const state: MatchState<MageWarsCore> = {
            core: {
                ...baseState.core,
                players: {
                    ...baseState.core.players,
                    '0': {
                        ...baseState.core.players['0'],
                        statusTokens: {
                            [STATUS_TOKEN_IDS.WEAK]: 5,
                        },
                    },
                    '1': {
                        ...baseState.core.players['1'],
                        mageZoneId: PLAYER_ZERO_START_ZONE,
                    },
                },
                arena: baseState.core.arena.map((zone) => {
                    if (zone.id === PLAYER_ZERO_START_ZONE) {
                        return { ...zone, occupantIds: ['0', '1'] };
                    }
                    if (zone.id === PLAYER_ONE_START_ZONE) {
                        return { ...zone, occupantIds: [] };
                    }
                    return zone;
                }),
            },
            sys: baseState.sys,
        };

        const attack = runCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_ATTACK,
            playerId: '0',
            payload: { targetPlayerId: '1' },
        });

        expect(attack.success).toBe(true);
        expect(attack.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ATTACK_DECLARED,
                payload: expect.objectContaining({
                    attackerId: '0',
                    defenderId: '1',
                    diceResults: [3],
                    baseDamage: 3,
                }),
            }),
            expect.objectContaining({
                type: 'DAMAGE_DEALT',
                payload: expect.objectContaining({
                    targetId: '1',
                    actualDamage: 3,
                }),
            }),
        ]));
        expect(attack.state.core.players['1'].damage).toBe(3);
    });

    it('makes dazed mage basic melee attacks miss before damage is rolled', () => {
        const baseState = setupState('creatureAction');
        const missRandom: RandomFn = {
            ...fixedRandom,
            d: (sides: number) => (sides === 12 ? 6 : 3),
        };
        const state: MatchState<MageWarsCore> = {
            core: {
                ...baseState.core,
                players: {
                    ...baseState.core.players,
                    '0': {
                        ...baseState.core.players['0'],
                        statusTokens: {
                            [STATUS_TOKEN_IDS.DAZE]: 1,
                        },
                    },
                    '1': {
                        ...baseState.core.players['1'],
                        mageZoneId: PLAYER_ZERO_START_ZONE,
                    },
                },
                arena: baseState.core.arena.map((zone) => {
                    if (zone.id === PLAYER_ZERO_START_ZONE) {
                        return { ...zone, occupantIds: ['0', '1'] };
                    }
                    if (zone.id === PLAYER_ONE_START_ZONE) {
                        return { ...zone, occupantIds: [] };
                    }
                    return zone;
                }),
            },
            sys: baseState.sys,
        };

        const attack = runCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_ATTACK,
            playerId: '0',
            payload: { targetPlayerId: '1' },
        }, missRandom);

        expect(attack.success).toBe(true);
        expect(attack.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ATTACK_DECLARED,
                payload: expect.objectContaining({
                    attackerId: '0',
                    defenderId: '1',
                    diceResults: [],
                    effectDieResult: 6,
                    baseDamage: 0,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ATTACK_MISSED,
                payload: expect.objectContaining({
                    attackerId: '0',
                    targetPlayerId: '1',
                    statusTokenId: STATUS_TOKEN_IDS.DAZE,
                    effectDieResult: 6,
                }),
            }),
        ]));
        expect(attack.events.map((event) => event.type)).not.toContain('DAMAGE_DEALT');
        expect(attack.state.core.players['0'].actionReady).toBe(false);
        expect(attack.state.core.players['1'].damage).toBe(0);
        expect(actionLogKinds(attack.state)).toContain(MAGE_WARS_EVENTS.ATTACK_MISSED);
    });

    it('removes all daze from the active mage and owned creatures when creature action ends', () => {
        const baseState = setupState('creatureAction');
        const activeCat = makeArenaObject('dazed-cat-0', '0', PLAYER_ZERO_START_ZONE, {
            statusTokens: {
                [STATUS_TOKEN_IDS.DAZE]: 2,
                [STATUS_TOKEN_IDS.WEAK]: 1,
            },
        });
        const enemyCat = makeArenaObject('enemy-dazed-cat-1', '1', ARENA_ZONE_IDS.A2, {
            statusTokens: {
                [STATUS_TOKEN_IDS.DAZE]: 1,
            },
        });
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(withArenaObject({
                ...baseState.core,
                players: {
                    ...baseState.core.players,
                    '0': {
                        ...baseState.core.players['0'],
                        statusTokens: {
                            [STATUS_TOKEN_IDS.DAZE]: 1,
                            [STATUS_TOKEN_IDS.WEAK]: 1,
                        },
                    },
                    '1': {
                        ...baseState.core.players['1'],
                        statusTokens: {
                            [STATUS_TOKEN_IDS.DAZE]: 1,
                        },
                    },
                },
            }, activeCat), enemyCat),
            sys: baseState.sys,
        };
        const advanceCommand: Command<typeof FLOW_COMMANDS.ADVANCE_PHASE, Record<string, never>> = {
            type: FLOW_COMMANDS.ADVANCE_PHASE,
            playerId: '0',
            payload: {},
        };
        const rawExitEvents = readMageWarsPhaseExitEvents(mageWarsFlowHooks.onPhaseExit?.({
            state,
            from: 'creatureAction',
            to: 'finalQuickcast',
            command: advanceCommand,
            random: fixedRandom,
        }));
        const rawExitEventTypes = rawExitEvents.map((event) => event.type);

        const advanced = runCommand(state, advanceCommand);

        expect(rawExitEventTypes).toContain(MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVAL_AVAILABLE);
        expect(rawExitEventTypes).not.toContain(MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVED);
        expect(rawExitEvents).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVAL_AVAILABLE,
                payload: expect.objectContaining({
                    targetPlayerId: '0',
                    statusTokenId: STATUS_TOKEN_IDS.DAZE,
                    amount: 1,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVAL_AVAILABLE,
                payload: expect.objectContaining({
                    targetObjectId: activeCat.id,
                    statusTokenId: STATUS_TOKEN_IDS.DAZE,
                    amount: 2,
                }),
            }),
        ]));
        expect(advanced.success).toBe(true);
        expect(advanced.state.sys.phase).toBe('finalQuickcast');
        expect(advanced.state.core.players['0'].statusTokens).toEqual({
            [STATUS_TOKEN_IDS.WEAK]: 1,
        });
        expect(advanced.state.core.objects[activeCat.id].statusTokens).toEqual({
            [STATUS_TOKEN_IDS.WEAK]: 1,
        });
        expect(advanced.state.core.players['1'].statusTokens).toEqual({
            [STATUS_TOKEN_IDS.DAZE]: 1,
        });
        expect(advanced.state.core.objects[enemyCat.id].statusTokens).toEqual({
            [STATUS_TOKEN_IDS.DAZE]: 1,
        });
        expect(advanced.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVED,
                payload: expect.objectContaining({
                    targetPlayerId: '0',
                    statusTokenId: STATUS_TOKEN_IDS.DAZE,
                    amount: 1,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVED,
                payload: expect.objectContaining({
                    targetObjectId: activeCat.id,
                    statusTokenId: STATUS_TOKEN_IDS.DAZE,
                    amount: 2,
                }),
            }),
        ]));
        expect(actionLogKinds(advanced.state)).toContain(MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVED);
    });

    it('removes all stun from the active mage and owned creatures when creature action ends', () => {
        const baseState = setupState('creatureAction');
        const activeCat = makeArenaObject('stunned-cat-0', '0', PLAYER_ZERO_START_ZONE, {
            statusTokens: {
                [STATUS_TOKEN_IDS.STUN]: 2,
                [STATUS_TOKEN_IDS.WEAK]: 1,
            },
        });
        const enemyCat = makeArenaObject('enemy-stunned-cat-1', '1', ARENA_ZONE_IDS.A2, {
            statusTokens: {
                [STATUS_TOKEN_IDS.STUN]: 1,
            },
        });
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(withArenaObject({
                ...baseState.core,
                players: {
                    ...baseState.core.players,
                    '0': {
                        ...baseState.core.players['0'],
                        statusTokens: {
                            [STATUS_TOKEN_IDS.STUN]: 1,
                            [STATUS_TOKEN_IDS.WEAK]: 1,
                        },
                    },
                    '1': {
                        ...baseState.core.players['1'],
                        statusTokens: {
                            [STATUS_TOKEN_IDS.STUN]: 1,
                        },
                    },
                },
            }, activeCat), enemyCat),
            sys: baseState.sys,
        };
        const advanceCommand: Command<typeof FLOW_COMMANDS.ADVANCE_PHASE, Record<string, never>> = {
            type: FLOW_COMMANDS.ADVANCE_PHASE,
            playerId: '0',
            payload: {},
        };
        const rawExitEvents = readMageWarsPhaseExitEvents(mageWarsFlowHooks.onPhaseExit?.({
            state,
            from: 'creatureAction',
            to: 'finalQuickcast',
            command: advanceCommand,
            random: fixedRandom,
        }));
        const rawExitEventTypes = rawExitEvents.map((event) => event.type);

        const advanced = runCommand(state, advanceCommand);

        expect(rawExitEventTypes).toContain(MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVAL_AVAILABLE);
        expect(rawExitEventTypes).not.toContain(MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVED);
        expect(rawExitEvents).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVAL_AVAILABLE,
                payload: expect.objectContaining({
                    targetPlayerId: '0',
                    statusTokenId: STATUS_TOKEN_IDS.STUN,
                    amount: 1,
                    sourceAbilityId: 'mw.status.stun.end-creature-action',
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVAL_AVAILABLE,
                payload: expect.objectContaining({
                    targetObjectId: activeCat.id,
                    statusTokenId: STATUS_TOKEN_IDS.STUN,
                    amount: 2,
                    sourceAbilityId: 'mw.status.stun.end-creature-action',
                }),
            }),
        ]));
        expect(advanced.success).toBe(true);
        expect(advanced.state.sys.phase).toBe('finalQuickcast');
        expect(advanced.state.core.players['0'].statusTokens).toEqual({
            [STATUS_TOKEN_IDS.WEAK]: 1,
        });
        expect(advanced.state.core.objects[activeCat.id].statusTokens).toEqual({
            [STATUS_TOKEN_IDS.WEAK]: 1,
        });
        expect(advanced.state.core.players['1'].statusTokens).toEqual({
            [STATUS_TOKEN_IDS.STUN]: 1,
        });
        expect(advanced.state.core.objects[enemyCat.id].statusTokens).toEqual({
            [STATUS_TOKEN_IDS.STUN]: 1,
        });
        expect(advanced.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVED,
                payload: expect.objectContaining({
                    targetPlayerId: '0',
                    statusTokenId: STATUS_TOKEN_IDS.STUN,
                    amount: 1,
                    sourceAbilityId: 'mw.status.stun.end-creature-action',
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVED,
                payload: expect.objectContaining({
                    targetObjectId: activeCat.id,
                    statusTokenId: STATUS_TOKEN_IDS.STUN,
                    amount: 2,
                    sourceAbilityId: 'mw.status.stun.end-creature-action',
                }),
            }),
        ]));
        expect(actionLogKinds(advanced.state)).toContain(MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVED);
    });

    it('removes cripple from current player creatures on a successful end-action escape check', () => {
        const baseState = setupState('creatureAction');
        const activeCat = makeArenaObject('crippled-cat-0', '0', PLAYER_ZERO_START_ZONE, {
            statusTokens: {
                [STATUS_TOKEN_IDS.CRIPPLE]: 1,
                [STATUS_TOKEN_IDS.WEAK]: 1,
            },
        });
        const enemyCat = makeArenaObject('enemy-crippled-cat-1', '1', ARENA_ZONE_IDS.A2, {
            statusTokens: {
                [STATUS_TOKEN_IDS.CRIPPLE]: 1,
            },
        });
        const escapeRandom: RandomFn = {
            ...fixedRandom,
            d: (sides: number) => (sides === 12 ? 7 : 3),
        };
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(withArenaObject(baseState.core, activeCat), enemyCat),
            sys: baseState.sys,
        };
        const advanceCommand: Command<typeof FLOW_COMMANDS.ADVANCE_PHASE, Record<string, never>> = {
            type: FLOW_COMMANDS.ADVANCE_PHASE,
            playerId: '0',
            payload: {},
        };
        const rawExitEvents = readMageWarsPhaseExitEvents(mageWarsFlowHooks.onPhaseExit?.({
            state,
            from: 'creatureAction',
            to: 'finalQuickcast',
            command: advanceCommand,
            random: escapeRandom,
        }));
        const rawExitEventTypes = rawExitEvents.map((event) => event.type);

        const advanced = runCommand(state, advanceCommand, escapeRandom);

        expect(rawExitEventTypes).toContain(MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVAL_AVAILABLE);
        expect(rawExitEventTypes).not.toContain(MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVED);
        expect(rawExitEvents).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVAL_AVAILABLE,
                payload: expect.objectContaining({
                    targetObjectId: activeCat.id,
                    statusTokenId: STATUS_TOKEN_IDS.CRIPPLE,
                    amount: 1,
                    sourceAbilityId: 'mw.status.cripple.escape-check',
                    effectDieResult: 7,
                }),
            }),
        ]));
        expect(advanced.success).toBe(true);
        expect(advanced.state.sys.phase).toBe('finalQuickcast');
        expect(advanced.state.core.objects[activeCat.id].statusTokens).toEqual({
            [STATUS_TOKEN_IDS.WEAK]: 1,
        });
        expect(advanced.state.core.objects[enemyCat.id].statusTokens).toEqual({
            [STATUS_TOKEN_IDS.CRIPPLE]: 1,
        });
        expect(advanced.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVED,
                payload: expect.objectContaining({
                    targetObjectId: activeCat.id,
                    statusTokenId: STATUS_TOKEN_IDS.CRIPPLE,
                    amount: 1,
                    sourceAbilityId: 'mw.status.cripple.escape-check',
                    effectDieResult: 7,
                }),
            }),
        ]));
        expect(actionLogKinds(advanced.state)).toContain(MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVED);
    });

    it('keeps cripple on current player creatures after a failed end-action escape check', () => {
        const baseState = setupState('creatureAction');
        const activeCat = makeArenaObject('failed-escape-cat-0', '0', PLAYER_ZERO_START_ZONE, {
            statusTokens: {
                [STATUS_TOKEN_IDS.CRIPPLE]: 1,
            },
        });
        const escapeRandom: RandomFn = {
            ...fixedRandom,
            d: (sides: number) => (sides === 12 ? 6 : 3),
        };
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(baseState.core, activeCat),
            sys: baseState.sys,
        };

        const advanced = runCommand(state, {
            type: FLOW_COMMANDS.ADVANCE_PHASE,
            playerId: '0',
            payload: {},
        }, escapeRandom);

        expect(advanced.success).toBe(true);
        expect(advanced.state.sys.phase).toBe('finalQuickcast');
        expect(advanced.state.core.objects[activeCat.id].statusTokens).toEqual({
            [STATUS_TOKEN_IDS.CRIPPLE]: 1,
        });
        expect(advanced.events.some((event) => (
            event.type === MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVED
            && event.payload.statusTokenId === STATUS_TOKEN_IDS.CRIPPLE
        ))).toBe(false);
    });

    it('prevents stunned mages from moving, guarding, or making basic melee attacks', () => {
        const baseState = setupState('creatureAction');
        const state: MatchState<MageWarsCore> = {
            core: {
                ...baseState.core,
                players: {
                    ...baseState.core.players,
                    '0': {
                        ...baseState.core.players['0'],
                        statusTokens: {
                            [STATUS_TOKEN_IDS.STUN]: 1,
                        },
                    },
                    '1': {
                        ...baseState.core.players['1'],
                        mageZoneId: PLAYER_ZERO_START_ZONE,
                    },
                },
                arena: baseState.core.arena.map((zone) => {
                    if (zone.id === PLAYER_ZERO_START_ZONE) {
                        return { ...zone, occupantIds: ['0', '1'] };
                    }
                    if (zone.id === PLAYER_ONE_START_ZONE) {
                        return { ...zone, occupantIds: [] };
                    }
                    return zone;
                }),
            },
            sys: baseState.sys,
        };

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.MOVE_MAGE,
            playerId: '0',
            payload: { toZoneId: ARENA_ZONE_IDS.A2 },
        })).toBe('playerStunned');
        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.GUARD,
            playerId: '0',
            payload: {},
        })).toBe('playerStunned');
        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_ATTACK,
            playerId: '0',
            payload: { targetPlayerId: '1' },
        })).toBe('playerStunned');
    });

    it('prevents stunned mages from casting attack spells', () => {
        const attackSpellId = 1710;
        const planned = runCommand(setupState('planning'), planCommand([attackSpellId]));
        const state: MatchState<MageWarsCore> = {
            core: {
                ...withPlayerInZone(planned.state.core, '1', ARENA_ZONE_IDS.A2),
                players: {
                    ...planned.state.core.players,
                    '0': {
                        ...planned.state.core.players['0'],
                        statusTokens: {
                            [STATUS_TOKEN_IDS.STUN]: 1,
                        },
                    },
                    '1': {
                        ...planned.state.core.players['1'],
                        mageZoneId: ARENA_ZONE_IDS.A2,
                    },
                },
            },
            sys: { ...planned.state.sys, phase: 'creatureAction' },
        };

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: attackSpellId,
                manaCost: 4,
                targetPlayerId: '1',
            },
        })).toBe('playerStunnedCannotCastAttackSpell');
    });

    it('allows stunned mages to use actions for non-attack quick spells but not standard spells', () => {
        const quickHealingSpellId = 3402;
        const standardHealingSpellId = 3405;
        const quickPlanned = runCommand(setupState('planning'), planCommand([quickHealingSpellId]));
        const woundedCat = makeArenaObject('cat-0', '0', PLAYER_ZERO_START_ZONE, {
            damage: 2,
        });
        const stunnedQuickState: MatchState<MageWarsCore> = {
            core: withArenaObject({
                ...quickPlanned.state.core,
                players: {
                    ...quickPlanned.state.core.players,
                    '0': {
                        ...quickPlanned.state.core.players['0'],
                        statusTokens: {
                            [STATUS_TOKEN_IDS.STUN]: 1,
                        },
                    },
                },
            }, woundedCat),
            sys: { ...quickPlanned.state.sys, phase: 'creatureAction' },
        };

        const quickCast = runCommand(stunnedQuickState, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: quickHealingSpellId,
                manaCost: 5,
                targetObjectId: woundedCat.id,
            },
        });

        expect(quickCast.success).toBe(true);
        expect(quickCast.state.core.objects[woundedCat.id].damage).toBe(0);
        expect(quickCast.state.core.players['0']).toMatchObject({
            actionReady: false,
            quickcastReady: true,
            statusTokens: {
                [STATUS_TOKEN_IDS.STUN]: 1,
            },
        });

        const standardPlanned = runCommand(setupState('planning'), planCommand([standardHealingSpellId]));
        const stunnedStandardState: MatchState<MageWarsCore> = {
            core: {
                ...standardPlanned.state.core,
                players: {
                    ...standardPlanned.state.core.players,
                    '0': {
                        ...standardPlanned.state.core.players['0'],
                        statusTokens: {
                            [STATUS_TOKEN_IDS.STUN]: 1,
                        },
                    },
                },
            },
            sys: { ...standardPlanned.state.sys, phase: 'creatureAction' },
        };

        expect(validateCommand(stunnedStandardState, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: standardHealingSpellId,
                manaCost: 9,
                targetZoneId: PLAYER_ZERO_START_ZONE,
            },
        })).toBe('playerStunnedCannotCastStandardSpell');
    });

    it('declares same-zone melee attacks through the damage pipeline and closes gameover', () => {
        const baseState = setupState('creatureAction');
        const defenderLife = baseState.core.players['1'].life;
        const state: MatchState<MageWarsCore> = {
            core: {
                ...baseState.core,
                players: {
                    ...baseState.core.players,
                    '1': {
                        ...baseState.core.players['1'],
                        mageZoneId: PLAYER_ZERO_START_ZONE,
                        damage: defenderLife - 8,
                    },
                },
                arena: baseState.core.arena.map((zone) => {
                    if (zone.id === PLAYER_ZERO_START_ZONE) {
                        return { ...zone, occupantIds: ['0', '1'] };
                    }
                    if (zone.id === PLAYER_ONE_START_ZONE) {
                        return { ...zone, occupantIds: [] };
                    }
                    return zone;
                }),
            },
            sys: baseState.sys,
        };

        expect(validateCommand(baseState, {
            type: MAGE_WARS_COMMANDS.DECLARE_ATTACK,
            playerId: '0',
            payload: { targetPlayerId: '1' },
        })).toBe('targetNotInSameZone');

        const attackCommand: MageWarsCommand = {
            type: MAGE_WARS_COMMANDS.DECLARE_ATTACK,
            playerId: '0',
            payload: { targetPlayerId: '1' },
        };
        const rawAttackEvents = resolveMageWarsBasicAttackEvents({
            state,
            sourceCommandType: attackCommand.type,
            timestamp: 0,
            random: fixedRandom,
            attackerId: '0',
            defenderId: '1',
        });
        const rawAttackEventTypes = rawAttackEvents.map((event) => event.type);
        const attack = runCommand(state, attackCommand);

        expect(rawAttackEventTypes).toContain(MAGE_WARS_EVENTS.MAGE_BASIC_ATTACK_DEFEAT_AVAILABLE);
        expect(rawAttackEventTypes).not.toContain(MAGE_WARS_EVENTS.MAGE_DEFEATED);
        expect(attack.success).toBe(true);
        expect(attack.events.map((event) => event.type)).toEqual(expect.arrayContaining([
            MAGE_WARS_EVENTS.ATTACK_DECLARED,
            'DAMAGE_DEALT',
            MAGE_WARS_EVENTS.MAGE_BASIC_ATTACK_DEFEAT_AVAILABLE,
            MAGE_WARS_EVENTS.MAGE_DEFEATED,
        ]));
        const defeatAvailableIndex = attack.events.findIndex((event) => (
            event.type === MAGE_WARS_EVENTS.MAGE_BASIC_ATTACK_DEFEAT_AVAILABLE
        ));
        const defeatedIndex = attack.events.findIndex((event) => (
            event.type === MAGE_WARS_EVENTS.MAGE_DEFEATED
        ));
        expect(defeatAvailableIndex).toBeGreaterThanOrEqual(0);
        expect(defeatedIndex).toBeGreaterThanOrEqual(0);
        expect(defeatAvailableIndex).toBeLessThan(defeatedIndex);
        expect(attack.state.core.players['0'].actionReady).toBe(false);
        expect(attack.state.core.players['1'].damage).toBe(defenderLife);
        expect(attack.state.core.gameResult).toEqual({ winner: '0' });
        expect(attack.state.sys.gameover).toEqual({ winner: '0' });
        expect(attack.state.sys.undo.snapshots).toHaveLength(1);
        expect(actionLogKinds(attack.state)).toEqual(expect.arrayContaining([
            MAGE_WARS_EVENTS.ATTACK_DECLARED,
            'DAMAGE_DEALT',
            MAGE_WARS_EVENTS.MAGE_DEFEATED,
        ]));
    });
});
