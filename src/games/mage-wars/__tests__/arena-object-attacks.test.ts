import { describe, expect, it } from 'vitest';
import type { MatchState, RandomFn } from '../../../engine/types';
import { MAGE_WARS_COMMANDS } from '../domain';
import { MAGE_WARS_EVENTS } from '../domain/events';
import { resolveMageWarsObjectAttackEvents } from '../domain/execute';
import { ARENA_ZONE_IDS, STATUS_TOKEN_IDS } from '../domain/ids';
import type { MageWarsCore } from '../domain/types';
import {
    actionLogKinds,
    fixedRandom,
    makeArenaObject,
    planCommand,
    PLAYER_ZERO_START_ZONE,
    runCommand,
    setupState,
    validateCommand,
    withArenaObject,
    withPlayerInZone,
} from './helpers/domainFlowHarness';

describe('mage-wars arena object attacks', () => {
    it('prevents stunned arena creatures from moving or attacking', () => {
        const baseState = setupState('creatureAction');
        const stunnedCat = makeArenaObject('stunned-cat-0', '0', PLAYER_ZERO_START_ZONE, {
            statusTokens: {
                [STATUS_TOKEN_IDS.STUN]: 1,
            },
        });
        const target = makeArenaObject('target-1', '1', PLAYER_ZERO_START_ZONE, {
            life: 30,
        });
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(withArenaObject(baseState.core, stunnedCat), target),
            sys: baseState.sys,
        };

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.MOVE_ARENA_OBJECT,
            playerId: '0',
            payload: { objectId: stunnedCat.id, toZoneId: ARENA_ZONE_IDS.A2 },
        })).toBe('objectStunned');
        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: stunnedCat.id,
                attackProfileId: 'attack-0',
                targetObjectId: target.id,
            },
        })).toBe('objectStunned');
    });

    it('applies weak only to non-spell attack dice without reducing below one die', () => {
        const baseState = setupState('creatureAction');
        const weakenedCleric = makeArenaObject('cleric-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2907,
            sourceObjectId: 'spell-card-2907',
            name: '灰衣天使',
            attackOrTraitLine: '利剑：快速近战 4 骰；飞行',
            statusTokens: {
                [STATUS_TOKEN_IDS.WEAK]: 2,
            },
        });
        const overWeakenedCat = makeArenaObject('cat-weak-0', '0', PLAYER_ZERO_START_ZONE, {
            statusTokens: {
                [STATUS_TOKEN_IDS.WEAK]: 5,
            },
        });
        const target = makeArenaObject('target-1', '1', PLAYER_ZERO_START_ZONE, {
            life: 30,
        });
        const core = withArenaObject(
            withArenaObject(
                withArenaObject(baseState.core, weakenedCleric),
                overWeakenedCat,
            ),
            target,
        );

        const weakenedAttack = runCommand({
            core,
            sys: baseState.sys,
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: weakenedCleric.id,
                attackProfileId: 'attack-0',
                targetObjectId: target.id,
            },
        });
        const minimumAttack = runCommand({
            core,
            sys: baseState.sys,
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: overWeakenedCat.id,
                attackProfileId: 'attack-0',
                targetObjectId: target.id,
            },
        });

        expect(weakenedAttack.success).toBe(true);
        expect(weakenedAttack.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED,
                payload: expect.objectContaining({
                    attackerObjectId: weakenedCleric.id,
                    diceResults: [3, 3],
                    baseDamage: 6,
                }),
            }),
            expect.objectContaining({
                type: 'DAMAGE_DEALT',
                payload: expect.objectContaining({
                    targetId: target.id,
                    actualDamage: 6,
                }),
            }),
        ]));
        expect(minimumAttack.success).toBe(true);
        expect(minimumAttack.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED,
                payload: expect.objectContaining({
                    attackerObjectId: overWeakenedCat.id,
                    diceResults: [3],
                    baseDamage: 3,
                }),
            }),
        ]));
        expect(minimumAttack.state.core.objects[target.id].damage).toBe(3);
    });

    it('resolves triple strike arena object attacks as three separate damage rolls with one action spend', () => {
        const baseState = setupState('creatureAction');
        const hydra = makeArenaObject('hydra-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2901,
            sourceObjectId: 'spell-card-2901',
            name: '暗沼九头蛇',
            life: 15,
            armor: 1,
            attackOrTraitLine: '猛力噬咬：快速近战 4 骰，反击；三重噬咬：完整行动近战 3 骰，三连击；重生2；迟缓',
        });
        const target = makeArenaObject('target-1', '1', PLAYER_ZERO_START_ZONE, {
            life: 40,
            armor: 0,
        });
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(withArenaObject(baseState.core, hydra), target),
            sys: baseState.sys,
        };

        const attacked = runCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: hydra.id,
                attackProfileId: 'attack-1',
                targetObjectId: target.id,
            },
        });
        const attackRolls = attacked.events.filter((event) => event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED);
        const damageEvents = attacked.events.filter((event) => event.type === 'DAMAGE_DEALT');

        expect(attacked.success).toBe(true);
        expect(attackRolls).toEqual([
            expect.objectContaining({
                payload: expect.objectContaining({
                    attackerObjectId: hydra.id,
                    attackProfileId: 'attack-1',
                    attackName: '三重噬咬',
                    targetObjectId: target.id,
                    diceResults: [3, 3, 3],
                    strikeIndex: 0,
                    strikeCount: 3,
                    baseDamage: 9,
                }),
            }),
            expect.objectContaining({
                payload: expect.objectContaining({
                    targetObjectId: target.id,
                    diceResults: [3, 3, 3],
                    strikeIndex: 1,
                    strikeCount: 3,
                    baseDamage: 9,
                }),
            }),
            expect.objectContaining({
                payload: expect.objectContaining({
                    targetObjectId: target.id,
                    diceResults: [3, 3, 3],
                    strikeIndex: 2,
                    strikeCount: 3,
                    baseDamage: 9,
                }),
            }),
        ]);
        expect(damageEvents).toHaveLength(3);
        expect(damageEvents).toEqual([
            expect.objectContaining({
                payload: expect.objectContaining({
                    targetId: target.id,
                    actualDamage: 9,
                    sourceAbilityId: 'mw.object.2901.attack-1',
                }),
            }),
            expect.objectContaining({
                payload: expect.objectContaining({
                    targetId: target.id,
                    actualDamage: 9,
                    sourceAbilityId: 'mw.object.2901.attack-1',
                }),
            }),
            expect.objectContaining({
                payload: expect.objectContaining({
                    targetId: target.id,
                    actualDamage: 9,
                    sourceAbilityId: 'mw.object.2901.attack-1',
                }),
            }),
        ]);
        expect(attacked.state.core.objects[hydra.id].actionReady).toBe(false);
        expect(attacked.state.core.objects[target.id].damage).toBe(27);
    });

    it('drains mana from the damaged target controller on the first mana-drain strike only', () => {
        const baseState = setupState('creatureAction');
        const manaLeech = makeArenaObject('mana-leech-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2807,
            sourceObjectId: 'spell-card-2807',
            name: '汲法水蛭',
            life: 8,
            armor: 1,
            attackOrTraitLine: '吸食噬咬：快速近战 2 骰，法力流失+1；吞食噬咬：完整行动近战 3 骰，法力流失+2；精神免疫',
        });
        const target = makeArenaObject('target-1', '1', PLAYER_ZERO_START_ZONE, {
            life: 30,
            armor: 0,
        });
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(withArenaObject({
                ...baseState.core,
                players: {
                    ...baseState.core.players,
                    '1': {
                        ...baseState.core.players['1'],
                        mana: 1,
                    },
                },
            }, manaLeech), target),
            sys: baseState.sys,
        };
        const rawQuickAttackEvents = resolveMageWarsObjectAttackEvents({
            state,
            sourceCommandType: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            timestamp: 0,
            random: fixedRandom,
            attackerObjectId: manaLeech.id,
            attackProfileId: 'attack-0',
            targetObjectId: target.id,
        });
        const rawQuickAttackEventTypes = rawQuickAttackEvents.map((event) => event.type);

        expect(rawQuickAttackEventTypes).toContain(MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_MANA_DRAIN_AVAILABLE);
        expect(rawQuickAttackEventTypes).not.toContain(MAGE_WARS_EVENTS.MANA_DRAINED);

        const quickAttack = runCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: manaLeech.id,
                attackProfileId: 'attack-0',
                targetObjectId: target.id,
            },
        });

        expect(quickAttack.success).toBe(true);
        expect(quickAttack.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.MANA_DRAINED,
                payload: expect.objectContaining({
                    playerId: '1',
                    amount: 1,
                    requestedAmount: 1,
                    sourceAbilityId: 'mw.object.2807.attack-0',
                    spellCardId: 2807,
                    targetObjectId: target.id,
                }),
            }),
        ]));
        expect(quickAttack.state.core.players['1'].mana).toBe(0);
        expect(actionLogKinds(quickAttack.state)).toContain(MAGE_WARS_EVENTS.MANA_DRAINED);

        const multiStrikeLeech = makeArenaObject('multi-leech-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2807,
            sourceObjectId: 'spell-card-2807',
            name: '汲法水蛭',
            attackOrTraitLine: '吞食噬咬：完整行动近战 3 骰，法力流失+2，三连击',
        });
        const multiTarget = makeArenaObject('multi-target-1', '1', PLAYER_ZERO_START_ZONE, {
            life: 40,
            armor: 0,
        });
        const multiStrikeState: MatchState<MageWarsCore> = {
            core: withArenaObject(withArenaObject({
                ...baseState.core,
                players: {
                    ...baseState.core.players,
                    '1': {
                        ...baseState.core.players['1'],
                        mana: 5,
                    },
                },
            }, multiStrikeLeech), multiTarget),
            sys: baseState.sys,
        };

        const multiStrike = runCommand(multiStrikeState, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: multiStrikeLeech.id,
                attackProfileId: 'attack-0',
                targetObjectId: multiTarget.id,
            },
        });
        const manaDrainEvents = multiStrike.events.filter((event) => event.type === MAGE_WARS_EVENTS.MANA_DRAINED);

        expect(multiStrike.success).toBe(true);
        expect(manaDrainEvents).toHaveLength(1);
        expect(manaDrainEvents[0]).toMatchObject({
            payload: {
                playerId: '1',
                amount: 2,
                requestedAmount: 2,
                sourceAbilityId: 'mw.object.2807.attack-0',
                targetObjectId: multiTarget.id,
            },
        });
        expect(multiStrike.state.core.players['1'].mana).toBe(3);
    });

    it('requires explicit object attack profiles and supports ranged attack ranges', () => {
        const baseState = setupState('creatureAction');
        const archer = makeArenaObject('archer-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2816,
            sourceObjectId: 'spell-card-2816',
            name: '皇家箭手',
            attackOrTraitLine: '长弓：完整行动远程 `1-2` 4 骰，穿刺+1；小刀：快速近战 2 骰',
        });
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(withPlayerInZone(baseState.core, '1', ARENA_ZONE_IDS.B3), archer),
            sys: baseState.sys,
        };

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: archer.id,
                attackProfileId: 'missing',
                targetPlayerId: '1',
            },
        })).toBe('invalidAttackProfile');
        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: archer.id,
                attackProfileId: 'attack-1',
                targetPlayerId: '1',
            },
        })).toBe('targetNotInSameZone');

        const attacked = runCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: archer.id,
                attackProfileId: 'attack-0',
                targetPlayerId: '1',
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
                    targetPlayerId: '1',
                    diceResults: [3, 3, 3, 3],
                    baseDamage: 12,
                }),
            }),
            expect.objectContaining({
                type: 'DAMAGE_DEALT',
                payload: expect.objectContaining({
                    targetId: '1',
                    actualDamage: 12,
                    sourceAbilityId: 'mw.object.2816.attack-0',
                }),
            }),
        ]));
    });

    it('places status tokens from arena object attack effect dice', () => {
        const baseState = setupState('creatureAction');
        const imp = makeArenaObject('imp-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2801,
            sourceObjectId: 'spell-card-2801',
            name: '火烙魔婴',
            attackOrTraitLine: '狱火利爪：快速近战火焰 2 骰，效果骰 `8+=燃烧`，除霜；火焰免疫',
        });
        const statusRandom: RandomFn = {
            ...fixedRandom,
            d: (sides: number) => (sides === 12 ? 8 : 3),
        };
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(withPlayerInZone(baseState.core, '1', PLAYER_ZERO_START_ZONE), imp),
            sys: baseState.sys,
        };
        const rawAttackEvents = resolveMageWarsObjectAttackEvents({
            state,
            sourceCommandType: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            timestamp: 0,
            random: statusRandom,
            attackerObjectId: imp.id,
            attackProfileId: 'attack-0',
            targetPlayerId: '1',
        });
        const rawAttackEventTypes = rawAttackEvents.map((event) => event.type);

        expect(rawAttackEventTypes).toContain(MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_STATUS_EFFECT_AVAILABLE);
        expect(rawAttackEventTypes).not.toContain(MAGE_WARS_EVENTS.STATUS_TOKEN_PLACED);

        const attacked = runCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: imp.id,
                attackProfileId: 'attack-0',
                targetPlayerId: '1',
            },
        }, statusRandom);

        expect(attacked.success).toBe(true);
        expect(attacked.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED,
                payload: expect.objectContaining({
                    attackerObjectId: imp.id,
                    attackProfileId: 'attack-0',
                    effectDieResult: 8,
                    diceResults: [3, 3],
                    baseDamage: 6,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_PLACED,
                payload: expect.objectContaining({
                    targetPlayerId: '1',
                    statusTokenId: STATUS_TOKEN_IDS.BURN,
                    amount: 1,
                    sourceAbilityId: 'mw.object.2801.attack-0',
                }),
            }),
        ]));
        expect(attacked.state.core.players['1'].statusTokens[STATUS_TOKEN_IDS.BURN]).toBe(1);
    });

    it('does not place burn from arena object attacks on cannot-burn objects', () => {
        const baseState = setupState('creatureAction');
        const imp = makeArenaObject('imp-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2801,
            sourceObjectId: 'spell-card-2801',
            name: '火烙魔婴',
            attackOrTraitLine: '狱火利爪：快速近战火焰 2 骰，效果骰 `8+=燃烧`，除霜；火焰免疫',
        });
        const target = makeArenaObject('cannot-burn-1', '1', PLAYER_ZERO_START_ZONE, {
            life: 30,
            attackOrTraitLine: '短剑：快速近战 4 骰；无法燃烧',
        });
        const statusRandom: RandomFn = {
            ...fixedRandom,
            d: (sides: number) => (sides === 12 ? 8 : 3),
        };
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(withArenaObject(baseState.core, imp), target),
            sys: baseState.sys,
        };

        const attacked = runCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: imp.id,
                attackProfileId: 'attack-0',
                targetObjectId: target.id,
            },
        }, statusRandom);

        expect(attacked.success).toBe(true);
        expect(attacked.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: 'DAMAGE_DEALT',
                payload: expect.objectContaining({
                    targetId: target.id,
                    actualDamage: 6,
                    sourceAbilityId: 'mw.object.2801.attack-0',
                }),
            }),
        ]));
        expect(attacked.events.some((event) => (
            event.type === MAGE_WARS_EVENTS.STATUS_TOKEN_PLACED
            && event.payload.targetObjectId === target.id
            && event.payload.statusTokenId === STATUS_TOKEN_IDS.BURN
        ))).toBe(false);
        expect(attacked.state.core.objects[target.id].statusTokens[STATUS_TOKEN_IDS.BURN]).toBeUndefined();
    });

    it('applies target fire resistance to arena object attack dice and effect dice', () => {
        const baseState = setupState('creatureAction');
        const imp = makeArenaObject('imp-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2801,
            sourceObjectId: 'spell-card-2801',
            name: '火烙魔婴',
            attackOrTraitLine: '狱火利爪：快速近战火焰 2 骰，效果骰 `8+=燃烧`，除霜；火焰免疫',
        });
        const target = makeArenaObject('fire-resistant-1', '1', PLAYER_ZERO_START_ZONE, {
            life: 30,
            attackOrTraitLine: '狱火剑：快速近战 4 骰，穿刺+2；火焰-2',
        });
        const statusRandom: RandomFn = {
            ...fixedRandom,
            d: (sides: number) => (sides === 12 ? 9 : 3),
        };
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(withArenaObject(baseState.core, imp), target),
            sys: baseState.sys,
        };

        const attacked = runCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: imp.id,
                attackProfileId: 'attack-0',
                targetObjectId: target.id,
            },
        }, statusRandom);

        expect(attacked.success).toBe(true);
        expect(attacked.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED,
                payload: expect.objectContaining({
                    attackerObjectId: imp.id,
                    attackProfileId: 'attack-0',
                    targetObjectId: target.id,
                    rawEffectDieResult: 9,
                    effectDieResult: 7,
                    diceResults: [3],
                    baseDamage: 3,
                }),
            }),
            expect.objectContaining({
                type: 'DAMAGE_DEALT',
                payload: expect.objectContaining({
                    targetId: target.id,
                    actualDamage: 3,
                    sourceAbilityId: 'mw.object.2801.attack-0',
                }),
            }),
        ]));
        expect(attacked.events.some((event) => (
            event.type === MAGE_WARS_EVENTS.STATUS_TOKEN_PLACED
            && event.payload.targetObjectId === target.id
            && event.payload.statusTokenId === STATUS_TOKEN_IDS.BURN
        ))).toBe(false);
        expect(attacked.state.core.objects[target.id]).toMatchObject({
            damage: 3,
            statusTokens: {},
        });
    });

    it('skips arena object attack dice and effects against matching damage type immunity', () => {
        const baseState = setupState('creatureAction');
        const imp = makeArenaObject('imp-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2801,
            sourceObjectId: 'spell-card-2801',
            name: '火烙魔婴',
            attackOrTraitLine: '狱火利爪：快速近战火焰 2 骰，效果骰 `8+=燃烧`，除霜；火焰免疫',
        });
        const target = makeArenaObject('fire-immune-1', '1', PLAYER_ZERO_START_ZONE, {
            life: 30,
            attackOrTraitLine: '烈焰剑：快速近战火焰 4 骰；火焰免疫',
        });
        const statusRandom: RandomFn = {
            ...fixedRandom,
            d: (sides: number) => (sides === 12 ? 9 : 3),
        };
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(withArenaObject(baseState.core, imp), target),
            sys: baseState.sys,
        };

        const attacked = runCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: imp.id,
                attackProfileId: 'attack-0',
                targetObjectId: target.id,
            },
        }, statusRandom);

        expect(attacked.success).toBe(true);
        expect(attacked.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED,
                payload: expect.objectContaining({
                    attackerObjectId: imp.id,
                    attackProfileId: 'attack-0',
                    targetObjectId: target.id,
                    diceResults: [],
                    baseDamage: 0,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ATTACK_MISSED,
                payload: expect.objectContaining({
                    attackerObjectId: imp.id,
                    targetObjectId: target.id,
                    sourceAbilityId: 'mw.object.2801.attack-0',
                    immunityDamageTypes: ['火焰'],
                }),
            }),
        ]));
        expect(attacked.events.map((event) => event.type)).not.toContain('DAMAGE_DEALT');
        expect(attacked.events.map((event) => event.type)).not.toContain(MAGE_WARS_EVENTS.STATUS_TOKEN_PLACED);
        expect(attacked.state.core.objects[imp.id].actionReady).toBe(false);
        expect(attacked.state.core.objects[target.id]).toMatchObject({
            damage: 0,
            statusTokens: {},
        });
        expect(actionLogKinds(attacked.state)).toContain(MAGE_WARS_EVENTS.ATTACK_MISSED);
    });

    it('places rot tokens from arena object attack effect dice', () => {
        const baseState = setupState('creatureAction');
        const basilisk = makeArenaObject('basilisk-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2808,
            sourceObjectId: 'spell-card-2808',
            name: '翠绿树蜥',
            attackOrTraitLine: '剧毒噬咬：快速近战 3 骰，效果骰 `8+=腐化`',
        });
        const statusRandom: RandomFn = {
            ...fixedRandom,
            d: (sides: number) => (sides === 12 ? 8 : 3),
        };
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(withPlayerInZone(baseState.core, '1', PLAYER_ZERO_START_ZONE), basilisk),
            sys: baseState.sys,
        };

        const attacked = runCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: basilisk.id,
                attackProfileId: 'attack-0',
                targetPlayerId: '1',
            },
        }, statusRandom);

        expect(attacked.success).toBe(true);
        expect(attacked.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_PLACED,
                payload: expect.objectContaining({
                    targetPlayerId: '1',
                    statusTokenId: STATUS_TOKEN_IDS.ROT,
                    amount: 1,
                    sourceAbilityId: 'mw.object.2808.attack-0',
                }),
            }),
        ]));
        expect(attacked.state.core.players['1'].statusTokens[STATUS_TOKEN_IDS.ROT]).toBe(1);
    });

    it('places weak and cripple tokens from object attack effect dice and respects toxin immunity', () => {
        const baseState = setupState('creatureAction');
        const gorgon = makeArenaObject('gorgon-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2810,
            sourceObjectId: 'spell-card-2810',
            name: '戈尔贡箭手',
            attackOrTraitLine: '毒弓：完整行动远程 `1-2` 4 骰，效果骰 `4-9=虚弱`、`10+=虚弱x2`；利爪：快速近战 2 骰；重生2；迟缓',
        });
        const basilisk = makeArenaObject('basilisk-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2809,
            sourceObjectId: 'spell-card-2809',
            name: '石目蛇蜥',
            attackOrTraitLine: '麻痹光束：完整行动远程 `0-2` 2 骰，效果骰 `7+=残废`；噬咬：快速近战 4 骰；迟缓',
        });
        const livingTarget = makeArenaObject('guard-1', '1', ARENA_ZONE_IDS.B3, {
            life: 30,
        });
        const nonlivingTarget = makeArenaObject('skeleton-1', '1', ARENA_ZONE_IDS.B3, {
            sourceSpellCardId: 2826,
            sourceObjectId: 'spell-card-2826',
            name: '骷髅哨兵',
            life: 30,
            attackOrTraitLine: '短剑：快速近战 4 骰；非活体；精神免疫',
        });
        const uncontainableTarget = makeArenaObject('phase-1', '1', ARENA_ZONE_IDS.B3, {
            name: '不羁目标',
            life: 30,
            attackOrTraitLine: '利爪：快速近战 2 骰；不羁',
        });
        const weakRandom: RandomFn = {
            ...fixedRandom,
            d: (sides: number) => (sides === 12 ? 10 : 1),
        };
        const crippleRandom: RandomFn = {
            ...fixedRandom,
            d: (sides: number) => (sides === 12 ? 7 : 1),
        };
        const core = [gorgon, basilisk, livingTarget, nonlivingTarget, uncontainableTarget].reduce(
            (nextCore, object) => withArenaObject(nextCore, object),
            baseState.core,
        );

        const weakened = runCommand({
            core,
            sys: baseState.sys,
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: gorgon.id,
                attackProfileId: 'attack-0',
                targetObjectId: livingTarget.id,
            },
        }, weakRandom);

        const crippled = runCommand({
            core,
            sys: baseState.sys,
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: basilisk.id,
                attackProfileId: 'attack-0',
                targetObjectId: livingTarget.id,
            },
        }, crippleRandom);

        const toxinImmune = runCommand({
            core,
            sys: baseState.sys,
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: gorgon.id,
                attackProfileId: 'attack-0',
                targetObjectId: nonlivingTarget.id,
            },
        }, weakRandom);

        const uncontainableCrippleImmune = runCommand({
            core,
            sys: baseState.sys,
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: basilisk.id,
                attackProfileId: 'attack-0',
                targetObjectId: uncontainableTarget.id,
            },
        }, crippleRandom);

        expect(weakened.success).toBe(true);
        expect(weakened.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_PLACED,
                payload: expect.objectContaining({
                    targetObjectId: livingTarget.id,
                    statusTokenId: STATUS_TOKEN_IDS.WEAK,
                    amount: 2,
                    sourceAbilityId: 'mw.object.2810.attack-0',
                }),
            }),
        ]));
        expect(weakened.state.core.objects[livingTarget.id].statusTokens[STATUS_TOKEN_IDS.WEAK]).toBe(2);

        expect(crippled.success).toBe(true);
        expect(crippled.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_PLACED,
                payload: expect.objectContaining({
                    targetObjectId: livingTarget.id,
                    statusTokenId: STATUS_TOKEN_IDS.CRIPPLE,
                    amount: 1,
                    sourceAbilityId: 'mw.object.2809.attack-0',
                }),
            }),
        ]));
        expect(crippled.state.core.objects[livingTarget.id].statusTokens[STATUS_TOKEN_IDS.CRIPPLE]).toBe(1);

        expect(toxinImmune.success).toBe(true);
        expect(toxinImmune.events.some((event) => (
            event.type === MAGE_WARS_EVENTS.STATUS_TOKEN_PLACED
            && event.payload.targetObjectId === nonlivingTarget.id
        ))).toBe(false);
        expect(toxinImmune.state.core.objects[nonlivingTarget.id].statusTokens[STATUS_TOKEN_IDS.WEAK]).toBeUndefined();

        expect(uncontainableCrippleImmune.success).toBe(true);
        expect(uncontainableCrippleImmune.events.some((event) => (
            event.type === MAGE_WARS_EVENTS.STATUS_TOKEN_PLACED
            && event.payload.targetObjectId === uncontainableTarget.id
            && event.payload.statusTokenId === STATUS_TOKEN_IDS.CRIPPLE
        ))).toBe(false);
        expect(uncontainableCrippleImmune.state.core.objects[uncontainableTarget.id].statusTokens[STATUS_TOKEN_IDS.CRIPPLE]).toBeUndefined();
    });

    it('applies arena object armor through the damage pipeline', () => {
        const baseState = setupState('creatureAction');
        const attacker = makeArenaObject('cat-0', '0', PLAYER_ZERO_START_ZONE);
        const armoredDefender = makeArenaObject('guard-1', '1', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2909,
            sourceObjectId: 'spell-card-2909',
            name: '皇家弓手',
            life: 6,
            armor: 2,
        });
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(withArenaObject(baseState.core, attacker), armoredDefender),
            sys: baseState.sys,
        };

        const attacked = runCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: armoredDefender.id,
            },
        });

        expect(attacked.success).toBe(true);
        expect(attacked.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: 'DAMAGE_DEALT',
                payload: expect.objectContaining({
                    targetId: armoredDefender.id,
                    actualDamage: 4,
                    sourceAbilityId: 'mw.object.2906.attack-0',
                    breakdown: expect.objectContaining({
                        steps: expect.arrayContaining([
                            expect.objectContaining({
                                sourceId: 'mage-wars-object-armor',
                                sourceName: '护甲',
                                value: -2,
                                runningTotal: 4,
                            }),
                        ]),
                    }),
                }),
            }),
        ]));
        expect(attacked.events.map((event) => event.type)).not.toContain(MAGE_WARS_EVENTS.ARENA_OBJECT_DEFEATED);
        expect(attacked.state.core.objects[armoredDefender.id]).toMatchObject({
            damage: 4,
            armor: 2,
        });
    });

    it('uses pierce to offset object armor without adding bonus damage', () => {
        const baseState = setupState('creatureAction');
        const archer = makeArenaObject('archer-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2816,
            sourceObjectId: 'spell-card-2816',
            name: '皇家箭手',
            attackOrTraitLine: '长弓：完整行动远程 `1-2` 4 骰，穿刺+1；小刀：快速近战 2 骰',
        });
        const armoredDefender = makeArenaObject('guard-1', '1', ARENA_ZONE_IDS.B3, {
            sourceSpellCardId: 2909,
            sourceObjectId: 'spell-card-2909',
            name: '皇家弓手',
            life: 20,
            armor: 3,
        });
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(withArenaObject(baseState.core, archer), armoredDefender),
            sys: baseState.sys,
        };

        const attacked = runCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: archer.id,
                attackProfileId: 'attack-0',
                targetObjectId: armoredDefender.id,
            },
        });

        expect(attacked.success).toBe(true);
        expect(attacked.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: 'DAMAGE_DEALT',
                payload: expect.objectContaining({
                    targetId: armoredDefender.id,
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
        expect(attacked.state.core.objects[armoredDefender.id]).toMatchObject({
            damage: 10,
            armor: 3,
        });
    });

    it('does not reduce object attack damage when pierce fully offsets armor', () => {
        const baseState = setupState('creatureAction');
        const attacker = makeArenaObject('warrior-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2811,
            sourceObjectId: 'spell-card-2811',
            name: '黑暗军团战士',
            attackOrTraitLine: '斩首刃：快速近战 4 骰，无法回避，穿刺+3',
        });
        const armoredDefender = makeArenaObject('guard-1', '1', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2909,
            sourceObjectId: 'spell-card-2909',
            name: '皇家弓手',
            life: 20,
            armor: 1,
        });
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(withArenaObject(baseState.core, attacker), armoredDefender),
            sys: baseState.sys,
        };

        const attacked = runCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: armoredDefender.id,
            },
        });

        const damageEvent = attacked.events.find((event) => event.type === 'DAMAGE_DEALT');
        expect(attacked.success).toBe(true);
        expect(damageEvent).toMatchObject({
            payload: {
                targetId: armoredDefender.id,
                actualDamage: 12,
                sourceAbilityId: 'mw.object.2811.attack-0',
            },
        });
        expect(JSON.stringify(damageEvent?.payload.breakdown)).not.toContain('mage-wars-object-armor');
        expect(attacked.state.core.objects[armoredDefender.id]).toMatchObject({
            damage: 12,
            armor: 1,
        });
    });

    it('applies arena object armor to attack spells that target objects', () => {
        const attackSpellId = 1710;
        const planned = runCommand(setupState('planning'), planCommand([attackSpellId]));
        const armoredDefender = makeArenaObject('guard-1', '1', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2909,
            sourceObjectId: 'spell-card-2909',
            name: '皇家弓手',
            life: 10,
            armor: 2,
        });

        const attacked = runCommand({
            core: withArenaObject(planned.state.core, armoredDefender),
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: attackSpellId,
                manaCost: 4,
                targetObjectId: armoredDefender.id,
            },
        });

        expect(attacked.success).toBe(true);
        expect(attacked.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: 'DAMAGE_DEALT',
                payload: expect.objectContaining({
                    targetId: armoredDefender.id,
                    actualDamage: 7,
                    sourceAbilityId: 'mw.spell.1710',
                }),
            }),
        ]));
        expect(attacked.events.map((event) => event.type)).not.toContain(MAGE_WARS_EVENTS.ARENA_OBJECT_DEFEATED);
        expect(attacked.state.core.objects[armoredDefender.id]).toMatchObject({
            damage: 7,
            armor: 2,
        });
    });
});
