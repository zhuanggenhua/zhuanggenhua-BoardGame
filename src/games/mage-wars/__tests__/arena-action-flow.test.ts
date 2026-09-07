import { describe, expect, it } from 'vitest';
import { FLOW_COMMANDS } from '../../../engine/systems/FlowSystem';
import type { MatchState, RandomFn } from '../../../engine/types';
import { MageWarsDomain, MAGE_WARS_COMMANDS } from '../domain';
import { MAGE_WARS_EVENTS } from '../domain/events';
import {
    ARENA_ZONE_IDS,
    MAGE_IDS,
    MAGE_WARS_OBJECT_ABILITY_IDS,
    STATUS_TOKEN_IDS,
    type MageWarsObjectAbilityId,
} from '../domain/ids';
import type { MageWarsCommand, MageWarsCore } from '../domain/types';
import {
    actionLogKinds,
    CAT_ATTACK_WITH_DEFENSE_LINE,
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
    withPreparedPlayerMage,
} from './helpers/domainFlowHarness';

describe('mage-wars arena action flow', () => {
    it('moves only to adjacent arena zones and guard consumes the main action', () => {
        const state = setupState('creatureAction');

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.MOVE_MAGE,
            playerId: '0',
            payload: { toZoneId: PLAYER_ONE_START_ZONE },
        })).toBe('zoneNotAdjacent');

        const moved = runCommand(state, {
            type: MAGE_WARS_COMMANDS.MOVE_MAGE,
            playerId: '0',
            payload: { toZoneId: ARENA_ZONE_IDS.A2 },
        });

        expect(moved.success).toBe(true);
        expect(moved.state.core.players['0']).toMatchObject({
            mageZoneId: ARENA_ZONE_IDS.A2,
            actionReady: false,
            guarding: false,
        });
        expect(moved.state.core.arena.find((zone) => zone.id === PLAYER_ZERO_START_ZONE)?.occupantIds).not.toContain('0');
        expect(moved.state.core.arena.find((zone) => zone.id === ARENA_ZONE_IDS.A2)?.occupantIds).toContain('0');

        const guarded = runCommand(setupState('creatureAction'), {
            type: MAGE_WARS_COMMANDS.GUARD,
            playerId: '0',
            payload: {},
        });

        expect(guarded.success).toBe(true);
        expect(guarded.state.core.players['0']).toMatchObject({
            actionReady: false,
            guarding: true,
        });
        expect(validateCommand(guarded.state, {
            type: MAGE_WARS_COMMANDS.GUARD,
            playerId: '0',
            payload: {},
        })).toBe('actionSpent');
    });

    it('moves ready arena creatures without consuming the mage action track', () => {
        const baseState = setupState('creatureAction');
        const object = makeArenaObject('cat-0', '0', PLAYER_ZERO_START_ZONE);
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject({
                ...baseState.core,
                players: {
                    ...baseState.core.players,
                    '0': {
                        ...baseState.core.players['0'],
                        actionReady: false,
                    },
                },
            }, object),
            sys: baseState.sys,
        };

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.MOVE_ARENA_OBJECT,
            playerId: '0',
            payload: { objectId: object.id, toZoneId: PLAYER_ONE_START_ZONE },
        })).toBe('zoneNotAdjacent');

        const crippledObject = makeArenaObject('crippled-cat-0', '0', PLAYER_ZERO_START_ZONE, {
            statusTokens: {
                [STATUS_TOKEN_IDS.CRIPPLE]: 1,
            },
        });
        const crippledState: MatchState<MageWarsCore> = {
            core: withArenaObject(state.core, crippledObject),
            sys: state.sys,
        };

        expect(validateCommand(crippledState, {
            type: MAGE_WARS_COMMANDS.MOVE_ARENA_OBJECT,
            playerId: '0',
            payload: { objectId: crippledObject.id, toZoneId: ARENA_ZONE_IDS.A2 },
        })).toBe('objectCrippled');

        const blockedMove = runCommand(crippledState, {
            type: MAGE_WARS_COMMANDS.MOVE_ARENA_OBJECT,
            playerId: '0',
            payload: { objectId: crippledObject.id, toZoneId: ARENA_ZONE_IDS.A2 },
        });
        expect(blockedMove.success).toBe(false);
        expect(blockedMove.error).toBe('objectCrippled');
        expect(blockedMove.events.map((event) => event.type)).not.toContain(MAGE_WARS_EVENTS.ARENA_OBJECT_MOVED);
        expect(blockedMove.state.core.objects[crippledObject.id]).toMatchObject({
            zoneId: PLAYER_ZERO_START_ZONE,
            actionReady: true,
        });

        const moved = runCommand(state, {
            type: MAGE_WARS_COMMANDS.MOVE_ARENA_OBJECT,
            playerId: '0',
            payload: { objectId: object.id, toZoneId: ARENA_ZONE_IDS.A2 },
        });

        expect(moved.success).toBe(true);
        expect(moved.events.map((event) => event.type)).toContain(MAGE_WARS_EVENTS.ARENA_OBJECT_MOVED);
        expect(moved.state.core.players['0'].actionReady).toBe(false);
        expect(moved.state.core.objects[object.id]).toMatchObject({
            zoneId: ARENA_ZONE_IDS.A2,
            actionReady: false,
        });
        expect(moved.state.core.arena.find((zone) => zone.id === PLAYER_ZERO_START_ZONE)?.objectIds).not.toContain(object.id);
        expect(moved.state.core.arena.find((zone) => zone.id === ARENA_ZONE_IDS.A2)?.objectIds).toContain(object.id);
        expect(actionLogKinds(moved.state)).toContain(MAGE_WARS_EVENTS.ARENA_OBJECT_MOVED);
    });

    it('rejects unknown arena object abilities before execution', () => {
        const state = setupState('creatureAction');
        const command: MageWarsCommand = {
            type: MAGE_WARS_COMMANDS.USE_ARENA_OBJECT_ABILITY,
            playerId: '0',
            payload: {
                objectId: 'missing-object',
                abilityId: 'mw.object.unknown' as MageWarsObjectAbilityId,
                manaCost: 0,
            },
        };

        expect(validateCommand(state, command)).toBe('unknownArenaObjectAbility');
        const result = runCommand(state, command);
        expect(result.success).toBe(false);
        expect(result.events).toEqual([]);
    });

    it('lets Blue Gremlin pay for swift teleport movement until the creature action ends', () => {
        const creatureSpellId = 2822;
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.WIZARD_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([creatureSpellId]));

        const summoned = runCommand({
            core: { ...planned.state.core, phaseReadyPlayerIds: ['1'] },
            sys: { ...planned.state.sys, phase: 'creatureAction' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: creatureSpellId,
                manaCost: 7,
                targetZoneId: PLAYER_ZERO_START_ZONE,
            },
        });
        const gremlinId = 'mwobj-0-2822-1';
        const gremlin = summoned.state.core.objects[gremlinId];

        expect(summoned.success).toBe(true);
        expect(gremlin).toMatchObject({
            sourceSpellCardId: creatureSpellId,
            name: '蓝色精怪',
            actionReady: false,
        });

        const readyState: MatchState<MageWarsCore> = {
            core: {
                ...summoned.state.core,
                players: {
                    ...summoned.state.core.players,
                    '0': {
                        ...summoned.state.core.players['0'],
                        mana: 3,
                    },
                },
                objects: {
                    ...summoned.state.core.objects,
                    [gremlinId]: {
                        ...gremlin,
                        actionReady: true,
                    },
                },
            },
            sys: { ...summoned.state.sys, phase: 'creatureAction' },
        };
        const nonGremlinState: MatchState<MageWarsCore> = {
            core: withArenaObject(readyState.core, makeArenaObject('cat-0', '0', PLAYER_ZERO_START_ZONE)),
            sys: readyState.sys,
        };

        expect(validateCommand(nonGremlinState, {
            type: MAGE_WARS_COMMANDS.USE_ARENA_OBJECT_ABILITY,
            playerId: '0',
            payload: {
                objectId: 'cat-0',
                abilityId: MAGE_WARS_OBJECT_ABILITY_IDS.BLUE_GREMLIN_SWIFT_TELEPORT,
                manaCost: 1,
            },
        })).toBe('invalidArenaObjectAbilitySource');
        expect(validateCommand(readyState, {
            type: MAGE_WARS_COMMANDS.USE_ARENA_OBJECT_ABILITY,
            playerId: '0',
            payload: {
                objectId: gremlinId,
                abilityId: MAGE_WARS_OBJECT_ABILITY_IDS.BLUE_GREMLIN_SWIFT_TELEPORT,
                manaCost: 2,
            },
        })).toBe('manaCostMismatch');

        const activated = runCommand(readyState, {
            type: MAGE_WARS_COMMANDS.USE_ARENA_OBJECT_ABILITY,
            playerId: '0',
            payload: {
                objectId: gremlinId,
                abilityId: MAGE_WARS_OBJECT_ABILITY_IDS.BLUE_GREMLIN_SWIFT_TELEPORT,
                manaCost: 1,
            },
        });

        expect(activated.success).toBe(true);
        expect(activated.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_ABILITY_RESOLVED,
                payload: expect.objectContaining({
                    objectId: gremlinId,
                    abilityId: MAGE_WARS_OBJECT_ABILITY_IDS.BLUE_GREMLIN_SWIFT_TELEPORT,
                    manaCost: 1,
                    grants: ['swift', 'teleportMovement'],
                }),
            }),
        ]));
        expect(activated.state.core.players['0'].mana).toBe(2);
        expect(activated.state.core.objects[gremlinId]).toMatchObject({
            actionReady: true,
            temporaryTraits: {
                swift: true,
                teleportMovement: true,
                freeMoveUsedThisAction: false,
            },
        });
        expect(validateCommand(activated.state, {
            type: MAGE_WARS_COMMANDS.USE_ARENA_OBJECT_ABILITY,
            playerId: '0',
            payload: {
                objectId: gremlinId,
                abilityId: MAGE_WARS_OBJECT_ABILITY_IDS.BLUE_GREMLIN_SWIFT_TELEPORT,
                manaCost: 1,
            },
        })).toBe('objectAbilityAlreadyActive');

        const slowActivatedState: MatchState<MageWarsCore> = {
            core: {
                ...activated.state.core,
                objects: {
                    ...activated.state.core.objects,
                    [gremlinId]: {
                        ...activated.state.core.objects[gremlinId],
                        attackOrTraitLine: '利爪：快速近战 2 骰；迟缓',
                    },
                },
            },
            sys: activated.state.sys,
        };
        const slowMove = runCommand(slowActivatedState, {
            type: MAGE_WARS_COMMANDS.MOVE_ARENA_OBJECT,
            playerId: '0',
            payload: { objectId: gremlinId, toZoneId: ARENA_ZONE_IDS.A2 },
        });

        expect(slowMove.success).toBe(true);
        expect(slowMove.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_MOVED,
                payload: expect.objectContaining({
                    objectId: gremlinId,
                    actionCost: 'normal',
                    movementMode: 'teleport',
                    sourceAbilityId: MAGE_WARS_OBJECT_ABILITY_IDS.BLUE_GREMLIN_SWIFT_TELEPORT,
                }),
            }),
        ]));
        expect(slowMove.state.core.objects[gremlinId]).toMatchObject({
            zoneId: ARENA_ZONE_IDS.A2,
            actionReady: false,
            temporaryTraits: {
                swift: true,
                teleportMovement: true,
                freeMoveUsedThisAction: false,
            },
        });

        const firstMove = runCommand(activated.state, {
            type: MAGE_WARS_COMMANDS.MOVE_ARENA_OBJECT,
            playerId: '0',
            payload: { objectId: gremlinId, toZoneId: ARENA_ZONE_IDS.A2 },
        });

        expect(firstMove.success).toBe(true);
        expect(firstMove.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_MOVED,
                payload: expect.objectContaining({
                    objectId: gremlinId,
                    actionCost: 'none',
                    movementMode: 'teleport',
                    sourceAbilityId: MAGE_WARS_OBJECT_ABILITY_IDS.BLUE_GREMLIN_SWIFT_TELEPORT,
                }),
            }),
        ]));
        expect(firstMove.state.core.objects[gremlinId]).toMatchObject({
            zoneId: ARENA_ZONE_IDS.A2,
            actionReady: true,
            temporaryTraits: {
                freeMoveUsedThisAction: true,
            },
        });

        const secondMove = runCommand(firstMove.state, {
            type: MAGE_WARS_COMMANDS.MOVE_ARENA_OBJECT,
            playerId: '0',
            payload: { objectId: gremlinId, toZoneId: ARENA_ZONE_IDS.A3 },
        });

        expect(secondMove.success).toBe(true);
        expect(secondMove.state.core.objects[gremlinId]).toMatchObject({
            zoneId: ARENA_ZONE_IDS.A3,
            actionReady: false,
        });

        const advanced = runCommand(secondMove.state, {
            type: FLOW_COMMANDS.ADVANCE_PHASE,
            playerId: '0',
            payload: {},
        });

        expect(advanced.success).toBe(true);
        expect(advanced.state.sys.phase).toBe('finalQuickcast');
        expect(advanced.state.core.objects[gremlinId].temporaryTraits).toBeUndefined();
        expect(advanced.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_TEMPORARY_TRAITS_CLEAR_AVAILABLE,
                payload: expect.objectContaining({
                    objectId: gremlinId,
                    traitIds: expect.arrayContaining(['swift', 'teleportMovement']),
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_TEMPORARY_TRAITS_CLEARED,
                payload: expect.objectContaining({
                    objectId: gremlinId,
                    traitIds: expect.arrayContaining(['swift', 'teleportMovement']),
                }),
            }),
        ]));
        const clearAvailableIndex = advanced.events.findIndex((event) => (
            event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_TEMPORARY_TRAITS_CLEAR_AVAILABLE
            && event.payload.objectId === gremlinId
        ));
        const traitsClearedIndex = advanced.events.findIndex((event) => (
            event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_TEMPORARY_TRAITS_CLEARED
            && event.payload.objectId === gremlinId
        ));
        expect(clearAvailableIndex).toBeGreaterThanOrEqual(0);
        expect(traitsClearedIndex).toBeGreaterThanOrEqual(0);
        expect(clearAvailableIndex).toBeLessThan(traitsClearedIndex);
        expect(actionLogKinds(advanced.state)).toContain(MAGE_WARS_EVENTS.ARENA_OBJECT_TEMPORARY_TRAITS_CLEARED);
    });

    it('uses Asyran Cleric healing light as a full-action arena object healing ability', () => {
        const baseState = setupState('creatureAction');
        const cleric = makeArenaObject('cleric-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2811,
            sourceObjectId: 'spell-card-2811',
            name: '阿希拉牧师',
            life: 6,
            armor: 1,
            attackOrTraitLine: '法杖：快速近战 2 骰；治疗之光：完整行动治疗 `0-1`，治疗目标活体生物，治疗效果等于掷骰的结果',
        });
        const woundedCat = makeArenaObject('wounded-cat-0', '0', ARENA_ZONE_IDS.A2, {
            life: 8,
            damage: 3,
        });
        const healingRandom: RandomFn = {
            ...fixedRandom,
            d: (sides: number) => (sides === 3 ? 2 : fixedRandom.d(sides)),
        };
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(withArenaObject(baseState.core, cleric), woundedCat),
            sys: baseState.sys,
        };

        const healed = runCommand(state, {
            type: MAGE_WARS_COMMANDS.USE_ARENA_OBJECT_ABILITY,
            playerId: '0',
            payload: {
                objectId: cleric.id,
                abilityId: MAGE_WARS_OBJECT_ABILITY_IDS.ASYRAN_CLERIC_HEALING_LIGHT,
                manaCost: 0,
                targetObjectId: woundedCat.id,
            },
        }, healingRandom);

        expect(healed.success).toBe(true);
        expect(healed.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_ABILITY_RESOLVED,
                payload: expect.objectContaining({
                    objectId: cleric.id,
                    abilityId: MAGE_WARS_OBJECT_ABILITY_IDS.ASYRAN_CLERIC_HEALING_LIGHT,
                    abilityName: '治疗之光',
                    manaCost: 0,
                    targetObjectId: woundedCat.id,
                    actionCost: 'normal',
                    grants: [],
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_HEALING_ROLLED,
                payload: expect.objectContaining({
                    spellCardId: 2811,
                    sourceAbilityId: MAGE_WARS_OBJECT_ABILITY_IDS.ASYRAN_CLERIC_HEALING_LIGHT,
                    targetObjectId: woundedCat.id,
                    targetZoneId: woundedCat.zoneId,
                    diceResults: [2],
                    healing: 2,
                    actualHealing: 2,
                }),
            }),
        ]));
        expect(healed.state.core.players['0'].mana).toBe(baseState.core.players['0'].mana);
        expect(healed.state.core.objects[cleric.id]).toMatchObject({
            actionReady: false,
        });
        expect(healed.state.core.objects[woundedCat.id]).toMatchObject({
            damage: 1,
        });
        expect(actionLogKinds(healed.state)).toEqual(expect.arrayContaining([
            MAGE_WARS_EVENTS.ARENA_OBJECT_ABILITY_RESOLVED,
            MAGE_WARS_EVENTS.SPELL_HEALING_ROLLED,
        ]));
    });

    it('rejects Asyran Cleric healing light for nonliving or out-of-range targets', () => {
        const baseState = setupState('creatureAction');
        const cleric = makeArenaObject('cleric-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2811,
            sourceObjectId: 'spell-card-2811',
            name: '阿希拉牧师',
            attackOrTraitLine: '法杖：快速近战 2 骰；治疗之光：完整行动治疗 `0-1`，治疗目标活体生物，治疗效果等于掷骰的结果',
        });
        const nonlivingTarget = makeArenaObject('skeleton-1', '1', ARENA_ZONE_IDS.A2, {
            sourceSpellCardId: 2826,
            sourceObjectId: 'spell-card-2826',
            name: '骷髅哨兵',
            attackOrTraitLine: '短剑：快速近战 4 骰；非活体；精神免疫',
        });
        const farTarget = makeArenaObject('far-cat-1', '1', PLAYER_ONE_START_ZONE);
        const wrongSource = makeArenaObject('cat-0', '0', PLAYER_ZERO_START_ZONE);
        const state: MatchState<MageWarsCore> = {
            core: [cleric, nonlivingTarget, farTarget, wrongSource].reduce(
                (core, object) => withArenaObject(core, object),
                baseState.core,
            ),
            sys: baseState.sys,
        };

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.USE_ARENA_OBJECT_ABILITY,
            playerId: '0',
            payload: {
                objectId: cleric.id,
                abilityId: MAGE_WARS_OBJECT_ABILITY_IDS.ASYRAN_CLERIC_HEALING_LIGHT,
                manaCost: 0,
                targetObjectId: nonlivingTarget.id,
            },
        })).toBe('invalidTargetObject');
        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.USE_ARENA_OBJECT_ABILITY,
            playerId: '0',
            payload: {
                objectId: cleric.id,
                abilityId: MAGE_WARS_OBJECT_ABILITY_IDS.ASYRAN_CLERIC_HEALING_LIGHT,
                manaCost: 0,
                targetObjectId: farTarget.id,
            },
        })).toBe('targetOutOfRange');
        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.USE_ARENA_OBJECT_ABILITY,
            playerId: '0',
            payload: {
                objectId: wrongSource.id,
                abilityId: MAGE_WARS_OBJECT_ABILITY_IDS.ASYRAN_CLERIC_HEALING_LIGHT,
                manaCost: 0,
                targetObjectId: cleric.id,
            },
        })).toBe('invalidArenaObjectAbilitySource');
    });

    it('uses Grey Angel redemption sacrifice to heal any living arena creature and destroy itself', () => {
        const baseState = setupState('creatureAction');
        const greyAngel = makeArenaObject('grey-angel-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2907,
            sourceObjectId: 'spell-card-2907',
            name: '灰衣天使',
            life: 10,
            armor: 2,
            attackOrTraitLine: '利剑：快速近战 4 骰；救赎献祭：完整行动治疗 6 骰，治疗竞技场中任一活体生物，治疗效果等于掷骰结果，然后摧毁灰衣天使；飞行',
        });
        const distantWoundedCreature = makeArenaObject('distant-wounded-1', '1', PLAYER_ONE_START_ZONE, {
            life: 10,
            damage: 7,
        });
        const healingRandom: RandomFn = {
            ...fixedRandom,
            d: (sides: number) => (sides === 3 ? 2 : fixedRandom.d(sides)),
        };
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(withArenaObject(baseState.core, greyAngel), distantWoundedCreature),
            sys: baseState.sys,
        };

        const sacrificeCommand: MageWarsCommand = {
            type: MAGE_WARS_COMMANDS.USE_ARENA_OBJECT_ABILITY,
            playerId: '0',
            payload: {
                objectId: greyAngel.id,
                abilityId: MAGE_WARS_OBJECT_ABILITY_IDS.GREY_ANGEL_REDEMPTION_SACRIFICE,
                manaCost: 0,
                targetObjectId: distantWoundedCreature.id,
            },
        };
        const rawSacrificeEvents = MageWarsDomain.execute(state, sacrificeCommand, healingRandom);
        const rawSacrificeEventTypes = rawSacrificeEvents.map((event) => event.type);
        expect(rawSacrificeEventTypes).toContain(MAGE_WARS_EVENTS.ARENA_OBJECT_SOURCE_CONSUME_AVAILABLE);
        expect(rawSacrificeEventTypes).not.toContain(MAGE_WARS_EVENTS.ARENA_OBJECT_DEFEATED);

        const healed = runCommand(state, sacrificeCommand, healingRandom);

        expect(healed.success).toBe(true);
        expect(healed.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_ABILITY_RESOLVED,
                payload: expect.objectContaining({
                    objectId: greyAngel.id,
                    abilityId: MAGE_WARS_OBJECT_ABILITY_IDS.GREY_ANGEL_REDEMPTION_SACRIFICE,
                    abilityName: '救赎献祭',
                    manaCost: 0,
                    targetObjectId: distantWoundedCreature.id,
                    actionCost: 'normal',
                    grants: [],
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_HEALING_ROLLED,
                payload: expect.objectContaining({
                    spellCardId: 2907,
                    sourceAbilityId: MAGE_WARS_OBJECT_ABILITY_IDS.GREY_ANGEL_REDEMPTION_SACRIFICE,
                    targetObjectId: distantWoundedCreature.id,
                    targetZoneId: distantWoundedCreature.zoneId,
                    diceResults: [2, 2, 2, 2, 2, 2],
                    healing: 12,
                    actualHealing: 7,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_SOURCE_CONSUME_AVAILABLE,
                payload: expect.objectContaining({
                    sourceObjectId: greyAngel.id,
                    sourceAbilityId: MAGE_WARS_OBJECT_ABILITY_IDS.GREY_ANGEL_REDEMPTION_SACRIFICE,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_DEFEATED,
                payload: expect.objectContaining({
                    objectId: greyAngel.id,
                    ownerId: '0',
                    sourceAbilityId: MAGE_WARS_OBJECT_ABILITY_IDS.GREY_ANGEL_REDEMPTION_SACRIFICE,
                    spellCardId: 2907,
                }),
            }),
        ]));
        const sourceConsumeAvailableIndex = healed.events.findIndex((event) => (
            event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_SOURCE_CONSUME_AVAILABLE
        ));
        const defeatedIndex = healed.events.findIndex((event) => (
            event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_DEFEATED
            && event.payload.objectId === greyAngel.id
        ));
        expect(sourceConsumeAvailableIndex).toBeGreaterThanOrEqual(0);
        expect(defeatedIndex).toBeGreaterThan(sourceConsumeAvailableIndex);
        expect(healed.state.core.players['0'].mana).toBe(baseState.core.players['0'].mana);
        expect(healed.state.core.objects[greyAngel.id]).toBeUndefined();
        expect(healed.state.core.arena.find((zone) => zone.id === PLAYER_ZERO_START_ZONE)?.objectIds).not.toContain(greyAngel.id);
        expect(healed.state.core.objects[distantWoundedCreature.id]).toMatchObject({
            damage: 0,
        });
        expect(actionLogKinds(healed.state)).toEqual(expect.arrayContaining([
            MAGE_WARS_EVENTS.ARENA_OBJECT_ABILITY_RESOLVED,
            MAGE_WARS_EVENTS.SPELL_HEALING_ROLLED,
            MAGE_WARS_EVENTS.ARENA_OBJECT_DEFEATED,
        ]));
    });

    it('rejects Grey Angel redemption sacrifice for nonliving targets or wrong sources', () => {
        const baseState = setupState('creatureAction');
        const greyAngel = makeArenaObject('grey-angel-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2907,
            sourceObjectId: 'spell-card-2907',
            name: '灰衣天使',
            attackOrTraitLine: '利剑：快速近战 4 骰；救赎献祭：完整行动治疗 6 骰，治疗竞技场中任一活体生物，治疗效果等于掷骰结果，然后摧毁灰衣天使；飞行',
        });
        const nonlivingTarget = makeArenaObject('skeleton-1', '1', PLAYER_ONE_START_ZONE, {
            sourceSpellCardId: 2826,
            sourceObjectId: 'spell-card-2826',
            name: '骷髅哨兵',
            attackOrTraitLine: '短剑：快速近战 4 骰；非活体；精神免疫',
        });
        const wrongSource = makeArenaObject('cat-0', '0', PLAYER_ZERO_START_ZONE);
        const state: MatchState<MageWarsCore> = {
            core: [greyAngel, nonlivingTarget, wrongSource].reduce(
                (core, object) => withArenaObject(core, object),
                baseState.core,
            ),
            sys: baseState.sys,
        };

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.USE_ARENA_OBJECT_ABILITY,
            playerId: '0',
            payload: {
                objectId: greyAngel.id,
                abilityId: MAGE_WARS_OBJECT_ABILITY_IDS.GREY_ANGEL_REDEMPTION_SACRIFICE,
                manaCost: 0,
                targetObjectId: nonlivingTarget.id,
            },
        })).toBe('invalidTargetObject');
        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.USE_ARENA_OBJECT_ABILITY,
            playerId: '0',
            payload: {
                objectId: wrongSource.id,
                abilityId: MAGE_WARS_OBJECT_ABILITY_IDS.GREY_ANGEL_REDEMPTION_SACRIFICE,
                manaCost: 0,
                targetObjectId: greyAngel.id,
            },
        })).toBe('invalidArenaObjectAbilitySource');
    });

    it('lets printed swift creatures use one free move before spending their action', () => {
        const creatureSpellId = 2812;
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.BEASTMASTER_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([creatureSpellId]));

        const summoned = runCommand({
            core: { ...planned.state.core, phaseReadyPlayerIds: [] },
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
        const foxId = 'mwobj-0-2812-1';

        expect(summoned.success).toBe(true);
        expect(summoned.state.core.objects[foxId]).toMatchObject({
            sourceSpellCardId: creatureSpellId,
            name: '苦木林狐',
            attackOrTraitLine: '噬咬：快速近战 3 骰；迅捷',
            actionReady: false,
        });

        const readyState: MatchState<MageWarsCore> = {
            core: {
                ...summoned.state.core,
                objects: {
                    ...summoned.state.core.objects,
                    [foxId]: {
                        ...summoned.state.core.objects[foxId],
                        actionReady: true,
                    },
                },
            },
            sys: { ...summoned.state.sys, phase: 'creatureAction' },
        };
        const firstMove = runCommand(readyState, {
            type: MAGE_WARS_COMMANDS.MOVE_ARENA_OBJECT,
            playerId: '0',
            payload: { objectId: foxId, toZoneId: ARENA_ZONE_IDS.A2 },
        });

        expect(firstMove.success).toBe(true);
        expect(firstMove.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_MOVED,
                payload: expect.objectContaining({
                    objectId: foxId,
                    actionCost: 'none',
                }),
            }),
        ]));
        const firstMoveEvent = firstMove.events.find((event) => event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_MOVED);
        expect(firstMoveEvent?.payload).not.toMatchObject({
            movementMode: 'teleport',
            sourceAbilityId: MAGE_WARS_OBJECT_ABILITY_IDS.BLUE_GREMLIN_SWIFT_TELEPORT,
        });
        expect(firstMove.state.core.objects[foxId]).toMatchObject({
            zoneId: ARENA_ZONE_IDS.A2,
            actionReady: true,
            temporaryTraits: {
                freeMoveUsedThisAction: true,
            },
        });

        const secondMove = runCommand(firstMove.state, {
            type: MAGE_WARS_COMMANDS.MOVE_ARENA_OBJECT,
            playerId: '0',
            payload: { objectId: foxId, toZoneId: ARENA_ZONE_IDS.A3 },
        });

        expect(secondMove.success).toBe(true);
        expect(secondMove.state.core.objects[foxId]).toMatchObject({
            zoneId: ARENA_ZONE_IDS.A3,
            actionReady: false,
            temporaryTraits: {
                freeMoveUsedThisAction: true,
            },
        });

        const advanced = runCommand(secondMove.state, {
            type: FLOW_COMMANDS.ADVANCE_PHASE,
            playerId: '0',
            payload: {},
        });

        expect(advanced.success).toBe(true);
        expect(advanced.state.core.objects[foxId].temporaryTraits).toBeUndefined();
        expect(advanced.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_TEMPORARY_TRAITS_CLEARED,
                payload: expect.objectContaining({
                    objectId: foxId,
                    traitIds: expect.arrayContaining(['swiftFreeMove']),
                    sourceAbilityId: 'mw.trait.swift.printed',
                }),
            }),
        ]));
        expect(actionLogKinds(advanced.state)).toContain(MAGE_WARS_EVENTS.ARENA_OBJECT_TEMPORARY_TRAITS_CLEARED);
    });

    it('summons Thunderift Falcon with flying and printed swift traits from config', () => {
        const creatureSpellId = 2820;
        const jetStreamSpellId = 1711;
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
                manaCost: 6,
                targetZoneId: PLAYER_ZERO_START_ZONE,
            },
        });
        const falconId = 'mwobj-0-2820-1';

        expect(summoned.success).toBe(true);
        expect(summoned.state.core.objects[falconId]).toMatchObject({
            sourceSpellCardId: creatureSpellId,
            sourceObjectId: 'spell-2820',
            name: '雷隙猎鹰',
            life: 5,
            armor: 0,
            attackOrTraitLine: '剃刀鸟喙：快速近战 3 骰；飞行；迅捷',
            actionReady: false,
        });

        const readyState: MatchState<MageWarsCore> = {
            core: {
                ...summoned.state.core,
                objects: {
                    ...summoned.state.core.objects,
                    [falconId]: {
                        ...summoned.state.core.objects[falconId],
                        actionReady: true,
                    },
                },
            },
            sys: { ...summoned.state.sys, phase: 'creatureAction' },
        };
        const firstMove = runCommand(readyState, {
            type: MAGE_WARS_COMMANDS.MOVE_ARENA_OBJECT,
            playerId: '0',
            payload: { objectId: falconId, toZoneId: ARENA_ZONE_IDS.A2 },
        });

        expect(firstMove.success).toBe(true);
        expect(firstMove.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_MOVED,
                payload: expect.objectContaining({
                    objectId: falconId,
                    actionCost: 'none',
                    movementMode: 'normal',
                }),
            }),
        ]));
        expect(firstMove.state.core.objects[falconId]).toMatchObject({
            zoneId: ARENA_ZONE_IDS.A2,
            actionReady: true,
            temporaryTraits: {
                freeMoveUsedThisAction: true,
            },
        });

        const jetStreamRandom: RandomFn = {
            ...fixedRandom,
            d: (sides: number) => (sides === 12 ? 3 : 3),
        };
        const opponentBeastmasterCore = withPlayerMage(
            withPlayerInZone(withCurrentPlayer(firstMove.state.core, '1'), '1', ARENA_ZONE_IDS.B2),
            '1',
            MAGE_IDS.BEASTMASTER_APPRENTICE,
        );
        const jetStreamState: MatchState<MageWarsCore> = {
            core: {
                ...opponentBeastmasterCore,
                players: {
                    ...opponentBeastmasterCore.players,
                    '1': {
                        ...opponentBeastmasterCore.players['1'],
                        mana: 20,
                        quickcastReady: true,
                        preparedSpellCardIds: [jetStreamSpellId],
                    },
                },
            },
            sys: { ...firstMove.state.sys, phase: 'initiativeQuickcast' },
        };
        const jetStream = runCommand(jetStreamState, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '1',
            payload: {
                spellCardId: jetStreamSpellId,
                manaCost: 4,
                targetObjectId: falconId,
                pushToZoneId: ARENA_ZONE_IDS.A3,
            },
        }, jetStreamRandom);

        const damageEvent = jetStream.events.find((event) => event.type === 'DAMAGE_DEALT');
        expect(jetStream.success).toBe(true);
        expect(damageEvent).toMatchObject({
            payload: {
                targetId: falconId,
                actualDamage: 8,
                sourceAbilityId: 'mw.spell.1711',
                breakdown: expect.objectContaining({
                    steps: expect.arrayContaining([
                        expect.objectContaining({
                            sourceId: 'mage-wars-flying-bonus',
                            sourceName: '对抗飞行',
                            value: 2,
                        }),
                    ]),
                }),
            },
        });
    });

    it('summons Deepwood Shadow and consumes its swift, elusive, legendary, and defense traits', () => {
        const creatureSpellId = 2824;
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.BEASTMASTER_APPRENTICE),
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
                manaCost: 15,
                targetZoneId: PLAYER_ZERO_START_ZONE,
            },
        });
        const shadowId = 'mwobj-0-2824-1';
        const shadow = summoned.state.core.objects[shadowId];

        expect(summoned.success).toBe(true);
        expect(shadow).toMatchObject({
            sourceSpellCardId: creatureSpellId,
            sourceObjectId: 'spell-2824',
            name: '深林幽影切维尔',
            life: 11,
            armor: 2,
            attackOrTraitLine: '利爪与噬咬：快速近战 4 骰；防御图标 `8+ / 1x`；迅捷；遁逸；传奇',
            actionReady: false,
        });

        const duplicateCastState: MatchState<MageWarsCore> = {
            core: {
                ...summoned.state.core,
                players: {
                    ...summoned.state.core.players,
                    '0': {
                        ...summoned.state.core.players['0'],
                        mana: 20,
                        actionReady: true,
                        preparedSpellCardIds: [creatureSpellId],
                    },
                },
            },
            sys: { ...summoned.state.sys, phase: 'creatureAction' },
        };
        expect(validateCommand(duplicateCastState, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: creatureSpellId,
                manaCost: 15,
                targetZoneId: PLAYER_ZERO_START_ZONE,
            },
        })).toBe('legendaryObjectAlreadyInPlay');

        const afterShadowLeavesState: MatchState<MageWarsCore> = {
            core: {
                ...duplicateCastState.core,
                objects: {},
                arena: duplicateCastState.core.arena.map((zone) => ({
                    ...zone,
                    objectIds: zone.objectIds.filter((objectId) => objectId !== shadowId),
                    conjurationIds: zone.conjurationIds.filter((objectId) => objectId !== shadowId),
                })),
            },
            sys: duplicateCastState.sys,
        };
        expect(validateCommand(afterShadowLeavesState, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: creatureSpellId,
                manaCost: 15,
                targetZoneId: PLAYER_ZERO_START_ZONE,
            },
        })).toBeUndefined();

        const enemyGuard = makeArenaObject('guard-1', '1', PLAYER_ZERO_START_ZONE, {
            guarding: true,
            life: 20,
            attackOrTraitLine: '短剑：快速近战 4 骰',
        });
        const guardedMageCore = withPlayerInZone(
            withArenaObject({
                ...summoned.state.core,
                objects: {
                    ...summoned.state.core.objects,
                    [shadowId]: {
                        ...shadow,
                        actionReady: true,
                    },
                },
            }, enemyGuard),
            '1',
            PLAYER_ZERO_START_ZONE,
        );
        const attackMageState: MatchState<MageWarsCore> = {
            core: guardedMageCore,
            sys: { ...summoned.state.sys, phase: 'creatureAction' },
        };
        const attackEnemyMage = runCommand(attackMageState, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: shadowId,
                attackProfileId: 'attack-0',
                targetPlayerId: '1',
            },
        });

        expect(attackEnemyMage.success).toBe(true);
        expect(attackEnemyMage.events.map((event) => event.type)).toContain(MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED);
        expect(attackEnemyMage.state.core.objects[enemyGuard.id].guarding).toBe(true);

        const attackGuard = runCommand({
            core: guardedMageCore,
            sys: { ...summoned.state.sys, phase: 'creatureAction' },
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: shadowId,
                attackProfileId: 'attack-0',
                targetObjectId: enemyGuard.id,
            },
        });
        expect(attackGuard.success).toBe(true);
        expect(attackGuard.events.map((event) => event.type)).toContain(MAGE_WARS_EVENTS.COUNTERSTRIKE_AVAILABLE);

        const enemyBlocker = makeArenaObject('blocker-1', '1', PLAYER_ZERO_START_ZONE, {
            life: 20,
        });
        const enemyDestinationBlocker = makeArenaObject('destination-blocker-1', '1', ARENA_ZONE_IDS.A2, {
            life: 20,
        });
        const readyShadowState: MatchState<MageWarsCore> = {
            core: [enemyBlocker, enemyDestinationBlocker].reduce(
                (core, object) => withArenaObject(core, object),
                {
                    ...summoned.state.core,
                    objects: {
                        ...summoned.state.core.objects,
                        [shadowId]: {
                            ...shadow,
                            actionReady: true,
                        },
                    },
                },
            ),
            sys: { ...summoned.state.sys, phase: 'creatureAction' },
        };
        const elusiveMove = runCommand(readyShadowState, {
            type: MAGE_WARS_COMMANDS.MOVE_ARENA_OBJECT,
            playerId: '0',
            payload: { objectId: shadowId, toZoneId: ARENA_ZONE_IDS.A2 },
        });
        expect(elusiveMove.success).toBe(true);
        expect(elusiveMove.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_MOVED,
                payload: expect.objectContaining({
                    objectId: shadowId,
                    actionCost: 'none',
                }),
            }),
        ]));
        expect(elusiveMove.state.core.objects[shadowId]).toMatchObject({
            zoneId: ARENA_ZONE_IDS.A2,
            actionReady: true,
        });

        const swiftFox = makeArenaObject('swift-fox-0', '0', PLAYER_ZERO_START_ZONE, {
            attackOrTraitLine: '噬咬：快速近战 3 骰；迅捷',
        });
        const hinderedSwiftState: MatchState<MageWarsCore> = {
            core: withArenaObject(withArenaObject(setupState('creatureAction').core, swiftFox), enemyBlocker),
            sys: readyShadowState.sys,
        };
        const hinderedSwiftMove = runCommand(hinderedSwiftState, {
            type: MAGE_WARS_COMMANDS.MOVE_ARENA_OBJECT,
            playerId: '0',
            payload: { objectId: swiftFox.id, toZoneId: ARENA_ZONE_IDS.A2 },
        });
        expect(hinderedSwiftMove.success).toBe(true);
        expect(hinderedSwiftMove.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_MOVED,
                payload: expect.objectContaining({
                    objectId: swiftFox.id,
                }),
            }),
        ]));
        const hinderedMoveEvent = hinderedSwiftMove.events.find((event) => (
            event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_MOVED
        ));
        expect(hinderedMoveEvent?.payload).not.toMatchObject({ actionCost: 'none' });
        expect(hinderedSwiftMove.state.core.objects[swiftFox.id]).toMatchObject({
            zoneId: ARENA_ZONE_IDS.A2,
            actionReady: false,
        });
    });

    it('summons Tanglevine and consumes its attached conjuration restraint rules', () => {
        const conjurationSpellId = 2224;
        const forcePushSpellId = 3425;
        const planningState = setupState('planning');
        const target = makeArenaObject('target-wolf-1', '1', ARENA_ZONE_IDS.A2, {
            sourceSpellCardId: 2819,
            sourceObjectId: 'spell-2819',
            name: '目标丛林灰狼',
            life: 6,
            attackOrTraitLine: '噬咬：快速近战 3 骰',
        });
        const flyingTarget = makeArenaObject('flying-target-1', '1', ARENA_ZONE_IDS.A2, {
            sourceSpellCardId: 2820,
            sourceObjectId: 'spell-2820',
            name: '雷隙猎鹰',
            attackOrTraitLine: '爪击：快速近战 3 骰；飞行；迅捷',
        });
        const uncontainableTarget = makeArenaObject('uncontainable-target-1', '1', ARENA_ZONE_IDS.A2, {
            attackOrTraitLine: '拳击：快速近战 3 骰；不羁',
        });
        const conjurationTarget = makeArenaObject('conjuration-target-1', '1', ARENA_ZONE_IDS.A2, {
            kind: 'conjuration',
            sourceSpellCardId: 2224,
            sourceObjectId: 'spell-2224',
            name: '已有魔物',
        });
        const planned = runCommand({
            core: withArenaObject(
                withArenaObject(
                    withArenaObject(
                        withArenaObject(
                            withPlayerMage(planningState.core, '0', MAGE_IDS.BEASTMASTER_APPRENTICE),
                            target,
                        ),
                        flyingTarget,
                    ),
                    uncontainableTarget,
                ),
                conjurationTarget,
            ),
            sys: planningState.sys,
        }, planCommand([conjurationSpellId]));
        const readyToCast: MatchState<MageWarsCore> = {
            core: {
                ...planned.state.core,
                players: {
                    ...planned.state.core.players,
                    '0': {
                        ...planned.state.core.players['0'],
                        mana: 10,
                    },
                },
            },
            sys: { ...planned.state.sys, phase: 'creatureAction' },
        };

        expect(validateCommand(readyToCast, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: conjurationSpellId,
                manaCost: 5,
                targetPlayerId: '1',
            },
        })).toBe('invalidTargetMode');
        for (const invalidTarget of [flyingTarget, uncontainableTarget, conjurationTarget]) {
            expect(validateCommand(readyToCast, {
                type: MAGE_WARS_COMMANDS.CAST_SPELL,
                playerId: '0',
                payload: {
                    spellCardId: conjurationSpellId,
                    manaCost: 5,
                    targetObjectId: invalidTarget.id,
                },
            })).toBe('invalidTargetObject');
        }

        const summoned = runCommand(readyToCast, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: conjurationSpellId,
                manaCost: 5,
                targetObjectId: target.id,
            },
        });
        const tanglevineId = 'mwobj-0-2224-1';
        const tanglevine = summoned.state.core.objects[tanglevineId];

        expect(summoned.success).toBe(true);
        expect(summoned.events.map((event) => event.type)).toEqual(expect.arrayContaining([
            MAGE_WARS_EVENTS.ARENA_OBJECT_SUMMONED,
            MAGE_WARS_EVENTS.ARENA_OBJECT_RESTRAINED,
        ]));
        expect(tanglevine).toMatchObject({
            kind: 'conjuration',
            ownerId: '0',
            sourceSpellCardId: conjurationSpellId,
            sourceObjectId: 'spell-2224',
            name: '缠绕藤蔓',
            zoneId: ARENA_ZONE_IDS.A2,
            life: 8,
            armor: 0,
            anchoredToObjectId: target.id,
            attackOrTraitLine: '活体；火焰+2；水流免疫',
            rulesText: '目标被束缚并且获得稳固特性。缠绕藤蔓不能将具有飞行或不羁特性的生物作为目标。远程攻击不能将缠绕藤蔓作为目标。',
        });
        expect(summoned.state.core.objects[target.id]).toMatchObject({
            restrainedByObjectId: tanglevineId,
        });
        expect(summoned.state.core.objects[target.id].statusTokens[STATUS_TOKEN_IDS.CRIPPLE]).toBeUndefined();
        expect(summoned.state.core.arena.find((zone) => zone.id === ARENA_ZONE_IDS.A2)?.conjurationIds).toContain(tanglevineId);

        expect(validateCommand({
            core: {
                ...summoned.state.core,
                currentPlayerId: '1',
            },
            sys: { ...summoned.state.sys, phase: 'creatureAction' },
        }, {
            type: MAGE_WARS_COMMANDS.MOVE_ARENA_OBJECT,
            playerId: '1',
            payload: { objectId: target.id, toZoneId: ARENA_ZONE_IDS.A3 },
        })).toBe('objectCrippled');

        const forcePushCore = withPlayerMage(summoned.state.core, '1', MAGE_IDS.WARLOCK_APPRENTICE);
        expect(validateCommand({
            core: {
                ...forcePushCore,
                currentPlayerId: '1',
                players: {
                    ...forcePushCore.players,
                    '1': {
                        ...forcePushCore.players['1'],
                        mana: 10,
                        actionReady: true,
                        preparedSpellCardIds: [forcePushSpellId],
                    },
                },
            },
            sys: { ...summoned.state.sys, phase: 'creatureAction' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '1',
            payload: {
                spellCardId: forcePushSpellId,
                manaCost: 3,
                targetObjectId: target.id,
                pushToZoneId: ARENA_ZONE_IDS.A3,
            },
        })).toBe('targetUnmovable');

        expect(validateCommand({
            core: {
                ...summoned.state.core,
                players: {
                    ...summoned.state.core.players,
                    '0': {
                        ...summoned.state.core.players['0'],
                        mana: 10,
                        actionReady: true,
                        preparedSpellCardIds: [conjurationSpellId],
                    },
                },
            },
            sys: { ...summoned.state.sys, phase: 'creatureAction' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: conjurationSpellId,
                manaCost: 5,
                targetObjectId: target.id,
            },
        })).toBe('conjurationAlreadyAttached');

        const rangedAttacker = makeArenaObject('ranged-attacker-1', '1', ARENA_ZONE_IDS.A2, {
            sourceSpellCardId: 2816,
            sourceObjectId: 'spell-2816',
            name: '敌方皇家箭手',
            attackOrTraitLine: '长弓：完整行动远程 `0-2` 4 骰；小刀：快速近战 2 骰',
        });
        const meleeAttacker = makeArenaObject('melee-attacker-1', '1', ARENA_ZONE_IDS.A2, {
            attackOrTraitLine: '短剑：快速近战 3 骰',
        });
        const attackState: MatchState<MageWarsCore> = {
            core: [rangedAttacker, meleeAttacker].reduce(
                (core, object) => withArenaObject(core, object),
                {
                    ...summoned.state.core,
                    currentPlayerId: '1',
                },
            ),
            sys: { ...summoned.state.sys, phase: 'creatureAction' },
        };

        expect(validateCommand(attackState, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '1',
            payload: {
                attackerObjectId: rangedAttacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: tanglevineId,
            },
        })).toBe('rangedAttackForbiddenTarget');
        expect(validateCommand(attackState, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '1',
            payload: {
                attackerObjectId: meleeAttacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: tanglevineId,
            },
        })).toBeUndefined();
    });

    it('summons Darkfenne Bat with flying and rot attack traits from config', () => {
        const creatureSpellId = 2825;
        const jetStreamSpellId = 1711;
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
                manaCost: 5,
                targetZoneId: PLAYER_ZERO_START_ZONE,
            },
        });
        const batId = 'mwobj-0-2825-1';
        const bat = summoned.state.core.objects[batId];

        expect(summoned.success).toBe(true);
        expect(bat).toMatchObject({
            sourceSpellCardId: creatureSpellId,
            sourceObjectId: 'spell-2825',
            name: '暗沼蝙蝠',
            life: 4,
            armor: 0,
            attackOrTraitLine: '致病噬咬：快速近战 2 骰，效果骰 `9+=腐化`；飞行',
            actionReady: false,
        });

        const livingTarget = makeArenaObject('bat-target-1', '1', PLAYER_ZERO_START_ZONE, {
            life: 20,
            armor: 0,
        });
        const attackCore = withArenaObject({
            ...summoned.state.core,
            objects: {
                ...summoned.state.core.objects,
                [batId]: {
                    ...bat,
                    actionReady: true,
                },
            },
        }, livingTarget);
        const rotRandom: RandomFn = {
            ...fixedRandom,
            d: (sides: number) => (sides === 12 ? 9 : fixedRandom.d(sides)),
        };

        const attacked = runCommand({
            core: attackCore,
            sys: { ...summoned.state.sys, phase: 'creatureAction' },
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: batId,
                attackProfileId: 'attack-0',
                targetObjectId: livingTarget.id,
            },
        }, rotRandom);

        expect(attacked.success).toBe(true);
        expect(attacked.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED,
                payload: expect.objectContaining({
                    attackerObjectId: batId,
                    attackName: '致病噬咬',
                    diceResults: [3, 3],
                    effectDieResult: 9,
                    baseDamage: 6,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_PLACED,
                payload: expect.objectContaining({
                    targetObjectId: livingTarget.id,
                    statusTokenId: STATUS_TOKEN_IDS.ROT,
                    amount: 1,
                    sourceAbilityId: 'mw.object.2825.attack-0',
                    spellCardId: creatureSpellId,
                }),
            }),
        ]));
        expect(attacked.state.core.objects[livingTarget.id].statusTokens[STATUS_TOKEN_IDS.ROT]).toBe(1);

        const opponentBeastmasterCore = withPlayerInZone(
            withPlayerMage(withCurrentPlayer(attacked.state.core, '1'), '1', MAGE_IDS.BEASTMASTER_APPRENTICE),
            '1',
            ARENA_ZONE_IDS.A2,
        );
        const jetStreamState: MatchState<MageWarsCore> = {
            core: {
                ...opponentBeastmasterCore,
                players: {
                    ...opponentBeastmasterCore.players,
                    '1': {
                        ...opponentBeastmasterCore.players['1'],
                        mana: 20,
                        quickcastReady: true,
                        preparedSpellCardIds: [jetStreamSpellId],
                    },
                },
            },
            sys: { ...attacked.state.sys, phase: 'initiativeQuickcast' },
        };
        const jetStreamRandom: RandomFn = {
            ...fixedRandom,
            d: (sides: number) => (sides === 12 ? 3 : 3),
        };
        const jetStream = runCommand(jetStreamState, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '1',
            payload: {
                spellCardId: jetStreamSpellId,
                manaCost: 4,
                targetObjectId: batId,
                pushToZoneId: ARENA_ZONE_IDS.A2,
            },
        }, jetStreamRandom);

        const damageEvent = jetStream.events.find((event) => event.type === 'DAMAGE_DEALT');
        expect(jetStream.success).toBe(true);
        expect(damageEvent).toMatchObject({
            payload: {
                targetId: batId,
                actualDamage: 8,
                sourceAbilityId: 'mw.spell.1711',
                breakdown: expect.objectContaining({
                    steps: expect.arrayContaining([
                        expect.objectContaining({
                            sourceId: 'mage-wars-flying-bonus',
                            sourceName: '对抗飞行',
                            value: 2,
                        }),
                    ]),
                }),
            },
        });
    });

    it('applies Charge after a creature moves and immediately makes a quick melee attack', () => {
        const baseState = setupState('creatureAction');
        const wildcat = makeArenaObject('wildcat-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2906,
            sourceObjectId: 'spell-card-2906',
            name: '野性山猫',
            attackOrTraitLine: CAT_ATTACK_WITH_DEFENSE_LINE,
        });
        const target = makeArenaObject('target-1', '1', ARENA_ZONE_IDS.A2, {
            sourceSpellCardId: 2819,
            sourceObjectId: 'spell-card-2819',
            name: '丛林灰狼',
            life: 20,
            attackOrTraitLine: '噬咬：快速近战 3 骰',
        });
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(withArenaObject(baseState.core, wildcat), target),
            sys: baseState.sys,
        };

        const moved = runCommand(state, {
            type: MAGE_WARS_COMMANDS.MOVE_ARENA_OBJECT,
            playerId: '0',
            payload: { objectId: wildcat.id, toZoneId: ARENA_ZONE_IDS.A2 },
        });

        expect(moved.success).toBe(true);
        expect(moved.state.core.objects[wildcat.id]).toMatchObject({
            zoneId: ARENA_ZONE_IDS.A2,
            actionReady: false,
            temporaryTraits: {
                movedThisAction: true,
                quickActionAfterMoveAvailable: true,
            },
        });

        const attackCommand: MageWarsCommand = {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: wildcat.id,
                attackProfileId: 'attack-0',
                targetObjectId: target.id,
            },
        };

        expect(validateCommand(moved.state, attackCommand)).toBeUndefined();

        const attacked = runCommand(moved.state, attackCommand);
        const attackEvent = attacked.events.find((event) => (
            event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED
        ));
        const damageEvent = attacked.events.find((event) => event.type === 'DAMAGE_DEALT');

        expect(attacked.success).toBe(true);
        expect(attackEvent).toMatchObject({
            payload: {
                attackerObjectId: wildcat.id,
                targetObjectId: target.id,
                diceResults: [3, 3, 3, 3],
                rawEffectDieResult: 3,
                effectDieResult: 3,
                chargeDiceModifier: 2,
                baseDamage: 12,
            },
        });
        expect(damageEvent).toMatchObject({
            payload: {
                targetId: target.id,
                actualDamage: 12,
            },
        });
        expect(attacked.state.core.objects[wildcat.id]).toMatchObject({
            actionReady: false,
        });
        expect(attacked.state.core.objects[wildcat.id].temporaryTraits).toBeUndefined();
    });

    it('keeps legacy Charge On out of the standard Beastmaster spellbook and rejects legacy casts', () => {
        const chargeOnSpellId = 3407;
        const planningState = setupState('planning');
        const casterCore = withPlayerMage(planningState.core, '0', MAGE_IDS.BEASTMASTER_APPRENTICE);
        const creature = makeArenaObject('wolf-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2819,
            sourceObjectId: 'spell-card-2819',
            name: '丛林灰狼',
            attackOrTraitLine: '噬咬：快速近战 3 骰',
        });
        const target = makeArenaObject('target-1', '1', ARENA_ZONE_IDS.A2, {
            sourceSpellCardId: 2819,
            sourceObjectId: 'spell-card-2819',
            name: '敌方丛林灰狼',
            life: 20,
            attackOrTraitLine: '噬咬：快速近战 3 骰',
        });
        const coreWithObjects = withArenaObject(withArenaObject(casterCore, creature), target);
        expect(validateCommand({
            core: coreWithObjects,
            sys: planningState.sys,
        }, planCommand([chargeOnSpellId]))).toBe('spellNotInPresetSpellbook');
        const legacyPreparedCore = withPreparedPlayerMage(
            coreWithObjects,
            '0',
            MAGE_IDS.BEASTMASTER_APPRENTICE,
            [chargeOnSpellId],
            20,
        );
        const readyToCast: MatchState<MageWarsCore> = {
            core: legacyPreparedCore,
            sys: { ...planningState.sys, phase: 'initiativeQuickcast' },
        };

        const cast = runCommand(readyToCast, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: chargeOnSpellId,
                manaCost: 4,
                targetObjectId: creature.id,
            },
        });

        expect(cast.success).toBe(false);
        expect(cast.error).toBe('spellNotInPresetSpellbook');
        expect(cast.state.core.players['0'].preparedSpellCardIds).toEqual([chargeOnSpellId]);
        expect(cast.state.core.objects[creature.id].temporaryTraits).toBeUndefined();
    });
});
