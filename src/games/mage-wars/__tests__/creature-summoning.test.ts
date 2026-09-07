import { describe, expect, it } from 'vitest';
import type { MatchState, RandomFn } from '../../../engine/types';
import { MAGE_WARS_COMMANDS } from '../domain';
import { getMageWarsSpellCardFromConfig } from '../data/configPackage';
import { MAGE_WARS_EVENTS } from '../domain/events';
import { executeMageWarsSpellAbility } from '../domain/spellAbilityExecutors';
import {
    ARENA_ZONE_IDS,
    MAGE_IDS,
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
    withPlayerInZone,
    withPlayerMage,
    withPreparedPlayerMage,
} from './helpers/domainFlowHarness';

describe('mage-wars creature summoning', () => {
    it('summons creature spells as arena objects that can be damaged by attack spells', () => {
        const creatureSpellId = 2906;
        const attackSpellId = 1710;
        const attackSpell = getMageWarsSpellCardFromConfig(attackSpellId);
        const planned = runCommand(setupState('planning'), planCommand([creatureSpellId, attackSpellId]));

        const summoned = runCommand({
            core: planned.state.core,
            sys: { ...planned.state.sys, phase: 'creatureAction' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: creatureSpellId,
                manaCost: 5,
                targetZoneId: PLAYER_ZERO_START_ZONE,
            },
        });

        expect(summoned.success).toBe(true);
        expect(summoned.events.map((event) => event.type)).toEqual(expect.arrayContaining([
            MAGE_WARS_EVENTS.SPELL_CAST_RESOLVED,
            MAGE_WARS_EVENTS.ARENA_OBJECT_SUMMONED,
        ]));

        const objectId = Object.keys(summoned.state.core.objects)[0];
        expect(attackSpell).toBeDefined();
        expect(objectId).toBe('mwobj-0-2906-1');
        expect(summoned.state.core.objects[objectId]).toMatchObject({
            kind: 'creature',
            ownerId: '0',
            sourceSpellCardId: creatureSpellId,
            name: '野性山猫',
            zoneId: PLAYER_ZERO_START_ZONE,
            life: 4,
            armor: 0,
            actionReady: false,
        });
        expect(summoned.state.core.arena.find((zone) => zone.id === PLAYER_ZERO_START_ZONE)?.objectIds).toContain(objectId);
        expect(summoned.state.core.players['0']).toMatchObject({
            mana: planned.state.core.players['0'].mana - 5,
            actionReady: false,
            quickcastReady: true,
        });

        const attackedObjectState: MatchState<MageWarsCore> = {
            core: summoned.state.core,
            sys: { ...summoned.state.sys, phase: 'finalQuickcast' },
        };
        const attackCommand: MageWarsCommand = {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: attackSpellId,
                manaCost: 4,
                targetObjectId: objectId,
            },
        };
        const rawAttackSpellEvents = executeMageWarsSpellAbility({
            ownerId: '0',
            timestamp: 0,
            state: attackedObjectState,
            command: attackCommand,
            random: fixedRandom,
            spell: attackSpell!,
            manaCost: 4,
        });
        const rawAttackSpellEventTypes = rawAttackSpellEvents.map((event) => event.type);
        const attackedObject = runCommand(attackedObjectState, attackCommand);

        expect(attackedObject.success).toBe(true);
        expect(rawAttackSpellEventTypes).toContain(MAGE_WARS_EVENTS.SPELL_ATTACK_DEFEAT_AVAILABLE);
        expect(rawAttackSpellEventTypes).not.toContain(MAGE_WARS_EVENTS.ARENA_OBJECT_DEFEATED);
        expect(attackedObject.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_ATTACK_ROLLED,
                payload: expect.objectContaining({
                    spellCardId: attackSpellId,
                    targetObjectId: objectId,
                    diceResults: [3, 3, 3],
                    baseDamage: 9,
                }),
            }),
            expect.objectContaining({
                type: 'DAMAGE_DEALT',
                payload: expect.objectContaining({
                    targetId: objectId,
                    actualDamage: 9,
                    sourceAbilityId: 'mw.spell.1710',
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_ATTACK_DEFEAT_AVAILABLE,
                payload: expect.objectContaining({
                    sourcePlayerId: '0',
                    targetObjectId: objectId,
                    sourceAbilityId: 'mw.spell.1710',
                    spellCardId: attackSpellId,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_DEFEATED,
                payload: expect.objectContaining({
                    objectId,
                    ownerId: '0',
                }),
            }),
        ]));
        const defeatAvailableIndex = attackedObject.events.findIndex((event) => (
            event.type === MAGE_WARS_EVENTS.SPELL_ATTACK_DEFEAT_AVAILABLE
            && event.payload.targetObjectId === objectId
        ));
        const defeatedIndex = attackedObject.events.findIndex((event) => (
            event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_DEFEATED
            && event.payload.objectId === objectId
        ));
        expect(defeatAvailableIndex).toBeGreaterThanOrEqual(0);
        expect(defeatedIndex).toBeGreaterThanOrEqual(0);
        expect(defeatAvailableIndex).toBeLessThan(defeatedIndex);
        expect(attackedObject.state.core.objects[objectId]).toBeUndefined();
        expect(attackedObject.state.core.arena.find((zone) => zone.id === PLAYER_ZERO_START_ZONE)?.objectIds).not.toContain(objectId);
        expect(actionLogKinds(attackedObject.state)).toEqual(expect.arrayContaining([
            MAGE_WARS_EVENTS.ARENA_OBJECT_SUMMONED,
            MAGE_WARS_EVENTS.ARENA_OBJECT_DEFEATED,
        ]));
    });

    it('summons a config-implemented plain creature spell with card stats and attack text', () => {
        const creatureSpellId = 2819;
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.BEASTMASTER_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([creatureSpellId]));

        const summoned = runCommand({
            core: planned.state.core,
            sys: { ...planned.state.sys, phase: 'creatureAction' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: creatureSpellId,
                manaCost: 9,
                targetZoneId: PLAYER_ZERO_START_ZONE,
            },
        });

        expect(summoned.success).toBe(true);
        expect(summoned.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_SUMMONED,
                payload: expect.objectContaining({
                    object: expect.objectContaining({
                        id: 'mwobj-0-2819-1',
                        kind: 'creature',
                        ownerId: '0',
                        sourceSpellCardId: creatureSpellId,
                        sourceObjectId: 'spell-2819',
                        name: '丛林灰狼',
                        zoneId: PLAYER_ZERO_START_ZONE,
                        life: 10,
                        armor: 2,
                        actionReady: false,
                        attackOrTraitLine: '噬咬：快速近战 4 骰',
                    }),
                }),
            }),
        ]));
        expect(summoned.state.core.objects['mwobj-0-2819-1']).toMatchObject({
            zoneId: PLAYER_ZERO_START_ZONE,
            life: 10,
            armor: 2,
            actionReady: false,
        });
        expect(summoned.state.core.arena.find((zone) => zone.id === PLAYER_ZERO_START_ZONE)?.objectIds).toContain('mwobj-0-2819-1');
        expect(summoned.state.core.players['0']).toMatchObject({
            mana: planned.state.core.players['0'].mana - 9,
            actionReady: false,
            quickcastReady: true,
        });
    });

    it('summons Skeleton Sentry from config with nonliving and mental immunity traits', () => {
        const creatureSpellId = 2826;
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.WARLOCK_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([creatureSpellId]));

        const summoned = runCommand({
            core: planned.state.core,
            sys: { ...planned.state.sys, phase: 'creatureAction' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: creatureSpellId,
                manaCost: 8,
                targetZoneId: PLAYER_ZERO_START_ZONE,
            },
        });

        expect(summoned.success).toBe(true);
        expect(summoned.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_SUMMONED,
                payload: expect.objectContaining({
                    object: expect.objectContaining({
                        id: 'mwobj-0-2826-1',
                        kind: 'creature',
                        ownerId: '0',
                        sourceSpellCardId: creatureSpellId,
                        sourceObjectId: 'spell-2826',
                        name: '骷髅哨兵',
                        zoneId: PLAYER_ZERO_START_ZONE,
                        life: 11,
                        armor: 0,
                        actionReady: false,
                        attackOrTraitLine: '短剑：快速近战 4 骰；非活体；精神免疫',
                    }),
                }),
            }),
        ]));

        const skeleton = summoned.state.core.objects['mwobj-0-2826-1'];
        expect(skeleton).toMatchObject({
            zoneId: PLAYER_ZERO_START_ZONE,
            life: 11,
            armor: 0,
            actionReady: false,
            attackOrTraitLine: '短剑：快速近战 4 骰；非活体；精神免疫',
        });

        const sleepSpellId = 3411;
        const priestessPlanned = runCommand({
            core: withPlayerMage({
                ...summoned.state.core,
                currentPlayerId: '1',
                players: {
                    ...summoned.state.core.players,
                    '1': {
                        ...summoned.state.core.players['1'],
                        mana: 20,
                    },
                },
            }, '1', MAGE_IDS.PRIESTESS_APPRENTICE),
            sys: { ...summoned.state.sys, phase: 'planning' },
        }, planCommand([sleepSpellId], '1'));

        expect(validateCommand({
            core: priestessPlanned.state.core,
            sys: { ...priestessPlanned.state.sys, phase: 'initiativeQuickcast' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '1',
            payload: {
                spellCardId: sleepSpellId,
                manaCost: 5,
                targetObjectId: skeleton.id,
            },
        })).toBe('invalidSleepTarget');
    });

    it('summons Royal Archer from config and consumes its ranged attack profile', () => {
        const creatureSpellId = 2816;
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.PRIESTESS_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([creatureSpellId]));

        const summoned = runCommand({
            core: {
                ...planned.state.core,
                players: {
                    ...planned.state.core.players,
                    '0': {
                        ...planned.state.core.players['0'],
                        mana: 20,
                    },
                },
            },
            sys: { ...planned.state.sys, phase: 'creatureAction' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: creatureSpellId,
                manaCost: 12,
                targetZoneId: PLAYER_ZERO_START_ZONE,
            },
        });

        const archer = summoned.state.core.objects['mwobj-0-2816-1'];
        expect(summoned.success).toBe(true);
        expect(archer).toMatchObject({
            kind: 'creature',
            ownerId: '0',
            sourceSpellCardId: creatureSpellId,
            sourceObjectId: 'spell-2816',
            name: '皇家箭手',
            zoneId: PLAYER_ZERO_START_ZONE,
            life: 9,
            armor: 1,
            actionReady: false,
            attackOrTraitLine: '长弓：完整行动远程 `1-2` 4 骰，穿刺+1；小刀：快速近战 2 骰',
        });

        const armoredTarget = makeArenaObject('armored-target-1', '1', ARENA_ZONE_IDS.B3, {
            life: 20,
            armor: 3,
        });
        const attackCore = withArenaObject(
            withPlayerInZone({
                ...summoned.state.core,
                objects: {
                    ...summoned.state.core.objects,
                    [archer.id]: {
                        ...archer,
                        actionReady: true,
                    },
                },
            }, '1', ARENA_ZONE_IDS.B3),
            armoredTarget,
        );

        const attacked = runCommand({
            core: attackCore,
            sys: { ...summoned.state.sys, phase: 'creatureAction' },
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: archer.id,
                attackProfileId: 'attack-0',
                targetObjectId: armoredTarget.id,
            },
        });

        expect(attacked.success).toBe(true);
        expect(attacked.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED,
                payload: expect.objectContaining({
                    attackerObjectId: archer.id,
                    attackProfileId: 'attack-0',
                    attackName: '长弓',
                    targetObjectId: armoredTarget.id,
                    diceResults: [3, 3, 3, 3],
                    baseDamage: 12,
                }),
            }),
            expect.objectContaining({
                type: 'DAMAGE_DEALT',
                payload: expect.objectContaining({
                    targetId: armoredTarget.id,
                    actualDamage: 10,
                    sourceAbilityId: 'mw.object.2816.attack-0',
                    breakdown: expect.objectContaining({
                        steps: expect.arrayContaining([
                            expect.objectContaining({
                                sourceId: 'mage-wars-object-armor',
                                value: -2,
                                runningTotal: 10,
                            }),
                        ]),
                    }),
                }),
            }),
        ]));
        expect(attacked.state.core.objects[armoredTarget.id]).toMatchObject({
            damage: 10,
            armor: 3,
        });
    });

    it('summons Royal Archer for player 1 in the priestess starting zone', () => {
        const creatureSpellId = 2816;
        const baseState = setupState('creatureAction');
        const readyToCast = {
            core: {
                ...withPreparedPlayerMage(
                    baseState.core,
                    '1',
                    MAGE_IDS.PRIESTESS_APPRENTICE,
                    [creatureSpellId],
                    20,
                ),
                currentPlayerId: '1',
                phaseActorId: '1',
            },
            sys: baseState.sys,
        };
        const command = {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '1',
            payload: {
                spellCardId: creatureSpellId,
                manaCost: 12,
                targetZoneId: PLAYER_ONE_START_ZONE,
            },
        } satisfies MageWarsCommand;

        expect(validateCommand(readyToCast, command)).toBeUndefined();

        const summoned = runCommand(readyToCast, command);
        const archer = summoned.state.core.objects['mwobj-1-2816-1'];

        expect(summoned.success).toBe(true);
        expect(summoned.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_CAST_RESOLVED,
                payload: expect.objectContaining({
                    playerId: '1',
                    spellCardId: creatureSpellId,
                    manaCost: 12,
                    targetZoneId: PLAYER_ONE_START_ZONE,
                    castMode: 'action',
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_SUMMONED,
                payload: expect.objectContaining({
                    object: expect.objectContaining({
                        id: 'mwobj-1-2816-1',
                        ownerId: '1',
                        sourceSpellCardId: creatureSpellId,
                        zoneId: PLAYER_ONE_START_ZONE,
                    }),
                }),
            }),
        ]));
        expect(archer).toMatchObject({
            kind: 'creature',
            ownerId: '1',
            sourceSpellCardId: creatureSpellId,
            sourceObjectId: 'spell-2816',
            name: '皇家箭手',
            zoneId: PLAYER_ONE_START_ZONE,
            life: 9,
            armor: 1,
            actionReady: false,
        });
        expect(summoned.state.core.arena.find((zone) => zone.id === PLAYER_ONE_START_ZONE)?.objectIds).toContain(archer.id);
        expect(summoned.state.core.players['1']).toMatchObject({
            mana: 8,
            actionReady: false,
            quickcastReady: true,
            preparedSpellCardIds: [],
            discardSpellCardIds: [creatureSpellId],
        });
    });

    it('summons Emerald Tegu from config and consumes its rot attack effect', () => {
        const creatureSpellId = 2808;
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.BEASTMASTER_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([creatureSpellId]));

        const summoned = runCommand({
            core: planned.state.core,
            sys: { ...planned.state.sys, phase: 'creatureAction' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: creatureSpellId,
                manaCost: 9,
                targetZoneId: PLAYER_ZERO_START_ZONE,
            },
        });

        const tegu = summoned.state.core.objects['mwobj-0-2808-1'];
        expect(summoned.success).toBe(true);
        expect(tegu).toMatchObject({
            kind: 'creature',
            ownerId: '0',
            sourceSpellCardId: creatureSpellId,
            sourceObjectId: 'spell-2808',
            name: '翠绿树蜥',
            zoneId: PLAYER_ZERO_START_ZONE,
            life: 8,
            armor: 3,
            actionReady: false,
            attackOrTraitLine: '剧毒噬咬：快速近战 3 骰，效果骰 `8+=腐化',
        });

        const livingTarget = makeArenaObject('living-target-1', '1', PLAYER_ZERO_START_ZONE, {
            life: 20,
            armor: 0,
        });
        const attackCore = withArenaObject({
            ...summoned.state.core,
            objects: {
                ...summoned.state.core.objects,
                [tegu.id]: {
                    ...tegu,
                    actionReady: true,
                },
            },
        }, livingTarget);
        const rotRandom: RandomFn = {
            ...fixedRandom,
            d: (sides: number) => (sides === 12 ? 8 : fixedRandom.d(sides)),
        };

        const attacked = runCommand({
            core: attackCore,
            sys: { ...summoned.state.sys, phase: 'creatureAction' },
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: tegu.id,
                attackProfileId: 'attack-0',
                targetObjectId: livingTarget.id,
            },
        }, rotRandom);

        expect(attacked.success).toBe(true);
        expect(attacked.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED,
                payload: expect.objectContaining({
                    attackerObjectId: tegu.id,
                    attackProfileId: 'attack-0',
                    attackName: '剧毒噬咬',
                    targetObjectId: livingTarget.id,
                    diceResults: [3, 3, 3],
                    effectDieResult: 8,
                    baseDamage: 9,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_PLACED,
                payload: expect.objectContaining({
                    targetObjectId: livingTarget.id,
                    statusTokenId: STATUS_TOKEN_IDS.ROT,
                    amount: 1,
                    sourceAbilityId: 'mw.object.2808.attack-0',
                    spellCardId: creatureSpellId,
                }),
            }),
        ]));
        expect(attacked.state.core.objects[livingTarget.id]).toMatchObject({
            damage: 9,
            statusTokens: {
                [STATUS_TOKEN_IDS.ROT]: 1,
            },
        });
    });

    it('summons passive creature cards whose current combat traits are config-consumable', () => {
        const cases = [
            {
                mageId: MAGE_IDS.PRIESTESS_APPRENTICE,
                spellCardId: 2909,
                manaCost: 13,
                objectId: 'mwobj-0-2909-1',
                name: '西锁骑士',
                life: 10,
                armor: 3,
                attackOrTraitLine: '长剑：快速近战 5 骰；防御图标 `8+ / 1x`；闪电+2',
            },
            {
                mageId: MAGE_IDS.WARLOCK_APPRENTICE,
                spellCardId: 2800,
                manaCost: 13,
                objectId: 'mwobj-0-2800-1',
                name: '暗契屠魔',
                life: 14,
                armor: 2,
                attackOrTraitLine: '狱火剑：快速近战 4 骰，穿刺+2；火焰-2',
            },
        ];

        for (const entry of cases) {
            const planningState = setupState('planning');
            const planned = runCommand({
                core: withPlayerMage(planningState.core, '0', entry.mageId),
                sys: planningState.sys,
            }, planCommand([entry.spellCardId]));
            const castState: MatchState<MageWarsCore> = {
                core: {
                    ...planned.state.core,
                    players: {
                        ...planned.state.core.players,
                        '0': {
                            ...planned.state.core.players['0'],
                            mana: 20,
                        },
                    },
                },
                sys: { ...planned.state.sys, phase: 'creatureAction' },
            };

            const summoned = runCommand(castState, {
                type: MAGE_WARS_COMMANDS.CAST_SPELL,
                playerId: '0',
                payload: {
                    spellCardId: entry.spellCardId,
                    manaCost: entry.manaCost,
                    targetZoneId: PLAYER_ZERO_START_ZONE,
                },
            });

            expect(summoned.success).toBe(true);
            expect(summoned.events).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    type: MAGE_WARS_EVENTS.ARENA_OBJECT_SUMMONED,
                    payload: expect.objectContaining({
                        object: expect.objectContaining({
                            id: entry.objectId,
                            sourceSpellCardId: entry.spellCardId,
                            sourceObjectId: `spell-${entry.spellCardId}`,
                            name: entry.name,
                            zoneId: PLAYER_ZERO_START_ZONE,
                            life: entry.life,
                            armor: entry.armor,
                            actionReady: false,
                            attackOrTraitLine: entry.attackOrTraitLine,
                        }),
                    }),
                }),
            ]));
            expect(summoned.state.core.objects[entry.objectId]).toMatchObject({
                name: entry.name,
                life: entry.life,
                armor: entry.armor,
                attackOrTraitLine: entry.attackOrTraitLine,
            });
            expect(summoned.state.core.players['0'].mana).toBe(20 - entry.manaCost);
        }
    });

    it('summons slow creature cards whose current combat traits are config-consumable', () => {
        const cases = [
            {
                spellCardId: 2809,
                manaCost: 12,
                objectId: 'mwobj-0-2809-1',
                name: '石目蛇蜥',
                life: 10,
                armor: 2,
                attackOrTraitLine: '麻痹光束：完整行动远程 `0-2` 2 骰，效果骰 `7+=残废`；噬咬：快速近战 4 骰；迟缓',
            },
            {
                spellCardId: 2810,
                manaCost: 16,
                objectId: 'mwobj-0-2810-1',
                name: '戈尔贡箭手',
                life: 13,
                armor: 1,
                attackOrTraitLine: '毒弓：完整行动远程 `1-2` 4 骰，效果骰 `4-9=虚弱`、`10+=虚弱x2`；利爪：快速近战 2 骰；重生2；迟缓',
            },
            {
                spellCardId: 2901,
                manaCost: 16,
                objectId: 'mwobj-0-2901-1',
                name: '暗沼九头蛇',
                life: 15,
                armor: 1,
                attackOrTraitLine: '猛力噬咬：快速近战 4 骰，反击；三重噬咬：完整行动近战 3 骰，三连击；重生2；迟缓',
            },
        ];

        for (const entry of cases) {
            const planningState = setupState('planning');
            const planned = runCommand({
                core: withPlayerMage(planningState.core, '0', MAGE_IDS.WIZARD_APPRENTICE),
                sys: planningState.sys,
            }, planCommand([entry.spellCardId]));
            const castState: MatchState<MageWarsCore> = {
                core: {
                    ...planned.state.core,
                    players: {
                        ...planned.state.core.players,
                        '0': {
                            ...planned.state.core.players['0'],
                            mana: 20,
                        },
                    },
                },
                sys: { ...planned.state.sys, phase: 'creatureAction' },
            };

            const summoned = runCommand(castState, {
                type: MAGE_WARS_COMMANDS.CAST_SPELL,
                playerId: '0',
                payload: {
                    spellCardId: entry.spellCardId,
                    manaCost: entry.manaCost,
                    targetZoneId: PLAYER_ZERO_START_ZONE,
                },
            });

            expect(summoned.success).toBe(true);
            expect(summoned.state.core.objects[entry.objectId]).toMatchObject({
                sourceSpellCardId: entry.spellCardId,
                sourceObjectId: `spell-${entry.spellCardId}`,
                name: entry.name,
                zoneId: PLAYER_ZERO_START_ZONE,
                life: entry.life,
                armor: entry.armor,
                actionReady: false,
                attackOrTraitLine: entry.attackOrTraitLine,
            });
            expect(summoned.state.core.players['0'].mana).toBe(20 - entry.manaCost);
        }
    });

    it('summons elemental and combat-profile creature cards whose current traits are config-consumable', () => {
        const cases = [
            {
                mageId: MAGE_IDS.WARLOCK_APPRENTICE,
                spellCardId: 2801,
                manaCost: 5,
                objectId: 'mwobj-0-2801-1',
                name: '火烙魔婴',
                life: 6,
                armor: 0,
                attackOrTraitLine: '狱火利爪：快速近战火焰 2 骰，效果骰 `8+=燃烧`，除霜；火焰免疫',
            },
            {
                mageId: MAGE_IDS.BEASTMASTER_APPRENTICE,
                spellCardId: 2802,
                manaCost: 17,
                objectId: 'mwobj-0-2802-1',
                name: '钢爪灰熊',
                life: 15,
                armor: 3,
                attackOrTraitLine: '利爪：快速近战 5 骰，穿刺+1；重爪猛击：完整行动近战 7 骰，穿刺+1；霜冻-3',
            },
            {
                mageId: MAGE_IDS.WARLOCK_APPRENTICE,
                spellCardId: 2803,
                manaCost: 13,
                objectId: 'mwobj-0-2803-1',
                name: '烈焰狱鬼',
                life: 9,
                armor: 2,
                attackOrTraitLine: '烈焰爆弹：完整行动远程 `1-1` 火焰 3 骰，效果骰 `5-9=燃烧`、`10+=燃烧x2`，除霜；烈火三叉戟：快速近战火焰 4 骰，效果骰 `7-10=燃烧`、`11+=燃烧x2`，除霜；火焰免疫',
            },
            {
                mageId: MAGE_IDS.PRIESTESS_APPRENTICE,
                spellCardId: 2813,
                manaCost: 15,
                objectId: 'mwobj-0-2813-1',
                name: '布洛根·血石',
                life: 11,
                armor: 4,
                attackOrTraitLine: '斩首刃：快速近战 4 骰，无法回避，穿刺+3；闪电+2；传奇',
            },
        ];

        for (const entry of cases) {
            const planningState = setupState('planning');
            const planned = runCommand({
                core: withPlayerMage(planningState.core, '0', entry.mageId),
                sys: planningState.sys,
            }, planCommand([entry.spellCardId]));
            const castState: MatchState<MageWarsCore> = {
                core: {
                    ...planned.state.core,
                    players: {
                        ...planned.state.core.players,
                        '0': {
                            ...planned.state.core.players['0'],
                            mana: 20,
                        },
                    },
                },
                sys: { ...planned.state.sys, phase: 'creatureAction' },
            };

            const summoned = runCommand(castState, {
                type: MAGE_WARS_COMMANDS.CAST_SPELL,
                playerId: '0',
                payload: {
                    spellCardId: entry.spellCardId,
                    manaCost: entry.manaCost,
                    targetZoneId: PLAYER_ZERO_START_ZONE,
                },
            });

            expect(summoned.success).toBe(true);
            expect(summoned.state.core.objects[entry.objectId]).toMatchObject({
                sourceSpellCardId: entry.spellCardId,
                sourceObjectId: `spell-${entry.spellCardId}`,
                name: entry.name,
                zoneId: PLAYER_ZERO_START_ZONE,
                life: entry.life,
                armor: entry.armor,
                actionReady: false,
                attackOrTraitLine: entry.attackOrTraitLine,
            });
            expect(summoned.state.core.players['0'].mana).toBe(20 - entry.manaCost);
        }
    });

    it('applies Goran bloodthirst dice to wounded living melee targets only', () => {
        const goranSpellId = 2804;
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.WARLOCK_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([goranSpellId]));
        const summoned = runCommand({
            core: {
                ...planned.state.core,
                players: {
                    ...planned.state.core.players,
                    '0': {
                        ...planned.state.core.players['0'],
                        mana: 20,
                    },
                },
            },
            sys: { ...planned.state.sys, phase: 'creatureAction' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: goranSpellId,
                manaCost: 15,
                targetZoneId: PLAYER_ZERO_START_ZONE,
            },
        });
        const goran = summoned.state.core.objects['mwobj-0-2804-1'];

        expect(summoned.success).toBe(true);
        expect(goran).toMatchObject({
            sourceSpellCardId: goranSpellId,
            sourceObjectId: 'spell-2804',
            name: '狼人宠物戈伦',
            zoneId: PLAYER_ZERO_START_ZONE,
            life: 12,
            armor: 3,
            attackOrTraitLine: '尖牙：快速近战 4 骰；野性利爪：完整行动近战 3 骰，两连击；嗜血+1；传奇；限定邪术师',
            rulesText: '当狼人宠物戈伦与其控制方法师位于同一格区域时，其额外获得嗜血+1特性。',
        });

        const runGoranAttack = (
            target: MageWarsArenaObjectState,
            ownerMageZoneId = PLAYER_ZERO_START_ZONE,
            attackProfileId = 'attack-0',
        ) => {
            const readyGoran = { ...goran, actionReady: true };
            const core = withArenaObject(
                withArenaObject(
                    withPlayerInZone(summoned.state.core, '0', ownerMageZoneId),
                    readyGoran,
                ),
                target,
            );
            return runCommand({
                core,
                sys: { ...summoned.state.sys, phase: 'creatureAction' },
            }, {
                type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
                playerId: '0',
                payload: {
                    attackerObjectId: readyGoran.id,
                    attackProfileId,
                    targetObjectId: target.id,
                },
            });
        };

        const woundedLiving = makeArenaObject('wounded-living-1', '1', PLAYER_ZERO_START_ZONE, {
            life: 40,
            damage: 1,
            armor: 0,
            attackOrTraitLine: '利爪：快速近战 2 骰',
        });
        const freshLiving = makeArenaObject('fresh-living-1', '1', PLAYER_ZERO_START_ZONE, {
            life: 40,
            damage: 0,
            armor: 0,
            attackOrTraitLine: '利爪：快速近战 2 骰',
        });
        const woundedNonliving = makeArenaObject('wounded-nonliving-1', '1', PLAYER_ZERO_START_ZONE, {
            life: 40,
            damage: 1,
            armor: 0,
            attackOrTraitLine: '短剑：快速近战 4 骰；非活体；精神免疫',
        });

        const sameZoneWounded = runGoranAttack(woundedLiving);
        const sameZoneWoundedRoll = sameZoneWounded.events.find((event) => (
            event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED
        ));
        expect(sameZoneWounded.success).toBe(true);
        expect(sameZoneWoundedRoll).toEqual(expect.objectContaining({
            payload: expect.objectContaining({
                diceResults: [3, 3, 3, 3, 3, 3],
                baseDamage: 18,
                bloodthirstDiceModifier: 2,
            }),
        }));

        const differentZoneWounded = runGoranAttack(woundedLiving, ARENA_ZONE_IDS.B1);
        const differentZoneWoundedRoll = differentZoneWounded.events.find((event) => (
            event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED
        ));
        expect(differentZoneWounded.success).toBe(true);
        expect(differentZoneWoundedRoll).toEqual(expect.objectContaining({
            payload: expect.objectContaining({
                diceResults: [3, 3, 3, 3, 3],
                baseDamage: 15,
                bloodthirstDiceModifier: 1,
            }),
        }));

        for (const target of [freshLiving, woundedNonliving]) {
            const result = runGoranAttack(target);
            const attackRoll = result.events.find((event) => (
                event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED
            ));

            expect(result.success).toBe(true);
            expect(attackRoll).toEqual(expect.objectContaining({
                payload: expect.objectContaining({
                    diceResults: [3, 3, 3, 3],
                    baseDamage: 12,
                }),
            }));
            expect(attackRoll?.payload).not.toMatchObject({ bloodthirstDiceModifier: expect.any(Number) });
        }

        const doubleStrike = runGoranAttack(woundedLiving, PLAYER_ZERO_START_ZONE, 'attack-1');
        const doubleStrikeRolls = doubleStrike.events.filter((event) => (
            event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED
        ));
        expect(doubleStrike.success).toBe(true);
        expect(doubleStrikeRolls).toEqual([
            expect.objectContaining({
                payload: expect.objectContaining({
                    attackProfileId: 'attack-1',
                    attackName: '野性利爪',
                    diceResults: [3, 3, 3, 3, 3],
                    strikeIndex: 0,
                    strikeCount: 2,
                    baseDamage: 15,
                    bloodthirstDiceModifier: 2,
                }),
            }),
            expect.objectContaining({
                payload: expect.objectContaining({
                    attackProfileId: 'attack-1',
                    attackName: '野性利爪',
                    diceResults: [3, 3, 3],
                    strikeIndex: 1,
                    strikeCount: 2,
                    baseDamage: 9,
                }),
            }),
        ]);
        expect(doubleStrikeRolls[1]?.payload).not.toMatchObject({ bloodthirstDiceModifier: expect.any(Number) });
    });
});
