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
    fixedRandom,
    makeArenaObject,
    makeVisibleEnchantmentObject,
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

describe('mage-wars control and area spells', () => {
    it('casts Sleep as a quick incantation that places sleep on a non-mage living creature', () => {
        const sleepSpellId = 3411;
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.PRIESTESS_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([sleepSpellId]));
        const target = makeArenaObject('sleep-target-cat', '1', ARENA_ZONE_IDS.A2, {
            sourceSpellCardId: 2906,
            sourceObjectId: 'spell-card-2906',
            name: '野性山猫',
        });
        const state = {
            core: withArenaObject(planned.state.core, target),
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        };

        const slept = runCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: sleepSpellId,
                manaCost: 4,
                targetObjectId: target.id,
            },
        });

        expect(slept.success).toBe(true);
        expect(slept.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_CAST_RESOLVED,
                payload: expect.objectContaining({
                    spellCardId: sleepSpellId,
                    manaCost: 4,
                    targetObjectId: target.id,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_PLACED,
                payload: expect.objectContaining({
                    targetObjectId: target.id,
                    statusTokenId: STATUS_TOKEN_IDS.SLEEP,
                    amount: 1,
                    sourceAbilityId: 'mw.spell.3411',
                    spellCardId: sleepSpellId,
                }),
            }),
        ]));
        expect(slept.state.core.players['0']).toMatchObject({
            quickcastReady: false,
            actionReady: true,
        });
        expect(slept.state.core.players['0'].discardSpellCardIds).toEqual([sleepSpellId]);
        expect(slept.state.core.objects[target.id].statusTokens).toEqual({
            [STATUS_TOKEN_IDS.SLEEP]: 1,
        });
    });

    it('requires Sleep to pay target level cost and target only non-mage living non-mental-immune creatures', () => {
        const sleepSpellId = 3411;
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.WIZARD_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([sleepSpellId]));
        const livingTarget = makeArenaObject('sleep-level-two-target', '1', ARENA_ZONE_IDS.A2, {
            sourceSpellCardId: 2810,
            sourceObjectId: 'spell-card-2810',
            name: '戈尔贡箭手',
        });
        const mentalImmuneTarget = makeArenaObject('sleep-mental-immune-target', '1', ARENA_ZONE_IDS.A2, {
            sourceSpellCardId: 2810,
            sourceObjectId: 'spell-card-2810',
            name: '精神免疫生物',
            attackOrTraitLine: '利爪：快速近战 2 骰；精神免疫',
        });
        const nonlivingTarget = makeArenaObject('sleep-nonliving-target', '1', ARENA_ZONE_IDS.A2, {
            sourceSpellCardId: 2826,
            sourceObjectId: 'spell-card-2826',
            name: '骷髅哨兵',
            attackOrTraitLine: '短剑：快速近战 4 骰；非活体；精神免疫',
        });
        const state = {
            core: withArenaObject(
                withArenaObject(
                    withArenaObject(planned.state.core, livingTarget),
                    mentalImmuneTarget,
                ),
                nonlivingTarget,
            ),
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        };

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: sleepSpellId,
                manaCost: 4,
                targetObjectId: livingTarget.id,
            },
        })).toBe('manaCostMismatch');

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: sleepSpellId,
                manaCost: 5,
                targetPlayerId: '1',
            },
        })).toBe('invalidTargetMode');

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: sleepSpellId,
                manaCost: 8,
                targetObjectId: mentalImmuneTarget.id,
            },
        })).toBe('invalidSleepTarget');

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: sleepSpellId,
                manaCost: 8,
                targetObjectId: nonlivingTarget.id,
            },
        })).toBe('invalidSleepTarget');
    });

    it('casts Chain Lightning through a legal object chain with shrinking dice and effect die penalties', () => {
        const attackSpellId = 1703;
        const spell = getMageWarsSpellCardFromConfig(attackSpellId);
        const chainRandom: RandomFn = {
            ...fixedRandom,
            d: (sides: number) => (sides === 12 ? 8 : 2),
        };
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.WIZARD_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([attackSpellId]));
        const firstTarget = makeArenaObject('chain-target-a1', '1', PLAYER_ZERO_START_ZONE, { life: 30 });
        const secondTarget = makeArenaObject('chain-target-b1', '1', ARENA_ZONE_IDS.B3, { life: 30 });
        const thirdTarget = makeArenaObject('chain-target-b2', '1', ARENA_ZONE_IDS.B2, { life: 30 });
        const aegis = makeVisibleEnchantmentObject('chain-aegis-1813', '1', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 1813,
            sourceObjectId: 'spell-1813',
            anchoredToObjectId: firstTarget.id,
        });
        const castCore = {
            ...planned.state.core,
            players: {
                ...planned.state.core.players,
                '0': {
                    ...planned.state.core.players['0'],
                    mana: 20,
                },
            },
        };
        expect(spell).toBeDefined();

        const chainState: MatchState<MageWarsCore> = {
            core: withArenaObject(
                withArenaObject(
                    withArenaObject(
                        withArenaObject(castCore, firstTarget),
                        secondTarget,
                    ),
                    thirdTarget,
                ),
                aegis,
            ),
            sys: { ...planned.state.sys, phase: 'creatureAction' },
        };
        const chainCommand: MageWarsCommand = {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: attackSpellId,
                manaCost: 12,
                targetObjectId: firstTarget.id,
                chainLightningTargets: [
                    { targetObjectId: secondTarget.id },
                    { targetObjectId: thirdTarget.id },
                ],
            },
        };
        const rawChainEvents = executeMageWarsSpellAbility({
            ownerId: '0',
            timestamp: 0,
            state: chainState,
            command: chainCommand,
            random: chainRandom,
            spell: spell!,
            manaCost: 12,
        });
        const rawChainStatusAvailableEvents = rawChainEvents.filter((event) => (
            event.type === MAGE_WARS_EVENTS.SPELL_ATTACK_STATUS_EFFECT_AVAILABLE
        ));
        const chained = runCommand(chainState, chainCommand, chainRandom);

        const attackRolls = chained.events.filter((event) => event.type === MAGE_WARS_EVENTS.SPELL_ATTACK_ROLLED);
        const damageEvents = chained.events.filter((event) => event.type === 'DAMAGE_DEALT');
        const statusAvailableEvents = chained.events.filter((event) => (
            event.type === MAGE_WARS_EVENTS.SPELL_ATTACK_STATUS_EFFECT_AVAILABLE
            && event.payload.sourceAbilityId === 'mw.spell.1703'
        ));
        const statusPlacedEvents = chained.events.filter((event) => (
            event.type === MAGE_WARS_EVENTS.STATUS_TOKEN_PLACED
            && event.payload.sourceAbilityId === 'mw.spell.1703'
        ));

        expect(planned.success).toBe(true);
        expect(rawChainStatusAvailableEvents).toHaveLength(3);
        expect(rawChainEvents.map((event) => event.type)).not.toContain(MAGE_WARS_EVENTS.STATUS_TOKEN_PLACED);
        expect(chained.success).toBe(true);
        expect(attackRolls).toHaveLength(3);
        expect(damageEvents).toHaveLength(3);
        expect(statusAvailableEvents).toHaveLength(3);
        expect(statusPlacedEvents).toHaveLength(3);
        expect(attackRolls).toEqual([
            expect.objectContaining({
                payload: expect.objectContaining({
                    targetObjectId: firstTarget.id,
                    diceResults: [2, 2, 2, 2],
                    rawEffectDieResult: 8,
                    effectDieResult: 8,
                    chainIndex: 0,
                    baseDamage: 8,
                }),
            }),
            expect.objectContaining({
                payload: expect.objectContaining({
                    targetObjectId: secondTarget.id,
                    diceResults: [2, 2, 2, 2],
                    rawEffectDieResult: 8,
                    effectDieResult: 7,
                    chainIndex: 1,
                    chainSourceObjectId: firstTarget.id,
                    chainSourceZoneId: PLAYER_ZERO_START_ZONE,
                    baseDamage: 8,
                }),
            }),
            expect.objectContaining({
                payload: expect.objectContaining({
                    targetObjectId: thirdTarget.id,
                    diceResults: [2, 2, 2],
                    rawEffectDieResult: 8,
                    effectDieResult: 6,
                    chainIndex: 2,
                    chainSourceObjectId: secondTarget.id,
                    chainSourceZoneId: ARENA_ZONE_IDS.B3,
                    baseDamage: 6,
                }),
            }),
        ]);
        expect(damageEvents).toEqual([
            expect.objectContaining({
                payload: expect.objectContaining({
                    targetId: firstTarget.id,
                    actualDamage: 8,
                    sourceAbilityId: 'mw.spell.1703',
                }),
            }),
            expect.objectContaining({
                payload: expect.objectContaining({
                    targetId: secondTarget.id,
                    actualDamage: 8,
                    sourceAbilityId: 'mw.spell.1703',
                }),
            }),
            expect.objectContaining({
                payload: expect.objectContaining({
                    targetId: thirdTarget.id,
                    actualDamage: 6,
                    sourceAbilityId: 'mw.spell.1703',
                }),
            }),
        ]);
        expect(chained.state.core.objects[firstTarget.id]).toMatchObject({
            damage: 8,
            statusTokens: { [STATUS_TOKEN_IDS.STUN]: 1 },
        });
        expect(chained.state.core.objects[secondTarget.id]).toMatchObject({
            damage: 8,
            statusTokens: { [STATUS_TOKEN_IDS.DAZE]: 1 },
        });
        expect(chained.state.core.objects[thirdTarget.id]).toMatchObject({
            damage: 6,
            statusTokens: { [STATUS_TOKEN_IDS.DAZE]: 1 },
        });
        for (const targetId of [firstTarget.id, secondTarget.id, thirdTarget.id]) {
            const availableIndex = chained.events.findIndex((event) => (
                event.type === MAGE_WARS_EVENTS.SPELL_ATTACK_STATUS_EFFECT_AVAILABLE
                && event.payload.targetObjectId === targetId
            ));
            const placedIndex = chained.events.findIndex((event) => (
                event.type === MAGE_WARS_EVENTS.STATUS_TOKEN_PLACED
                && event.payload.targetObjectId === targetId
            ));
            expect(availableIndex).toBeGreaterThanOrEqual(0);
            expect(placedIndex).toBeGreaterThanOrEqual(0);
            expect(availableIndex).toBeLessThan(placedIndex);
        }
    });

    it('requires Chain Lightning chain targets to be unique legal object targets within range of the previous target', () => {
        const attackSpellId = 1703;
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.WIZARD_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([attackSpellId]));
        const firstTarget = makeArenaObject('chain-target-a1', '1', PLAYER_ZERO_START_ZONE);
        const farTarget = makeArenaObject('chain-target-b3', '1', PLAYER_ONE_START_ZONE);
        const castCore = {
            ...planned.state.core,
            players: {
                ...planned.state.core.players,
                '0': {
                    ...planned.state.core.players['0'],
                    mana: 20,
                },
            },
        };
        const state = {
            core: withArenaObject(withArenaObject(castCore, firstTarget), farTarget),
            sys: { ...planned.state.sys, phase: 'creatureAction' },
        };

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: attackSpellId,
                manaCost: 12,
                targetPlayerId: '1',
            },
        })).toBe('invalidTargetMode');

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: attackSpellId,
                manaCost: 12,
                targetObjectId: firstTarget.id,
                chainLightningTargets: [{ targetObjectId: farTarget.id }],
            },
        })).toBe('chainLightningTargetOutOfRange');

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: attackSpellId,
                manaCost: 12,
                targetObjectId: firstTarget.id,
                chainLightningTargets: [{ targetObjectId: firstTarget.id }],
            },
        })).toBe('duplicateChainLightningTarget');
    });

    it('casts Dazzling Flash as a same-zone area attack excluding only the caster', () => {
        const attackSpellId = 1709;
        const statusRandom: RandomFn = {
            ...fixedRandom,
            d: (sides: number) => (sides === 12 ? 10 : 3),
        };
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withCurrentPlayer(planningState.core, '1'),
            sys: planningState.sys,
        }, planCommand([attackSpellId], '1'));
        const friendlyCat = makeArenaObject('cat-1', '1', PLAYER_ONE_START_ZONE, {
            sourceSpellCardId: 2906,
            sourceObjectId: 'spell-card-2906',
            name: '野性山猫',
            life: 10,
            attackOrTraitLine: '利爪：快速近战 2 骰；防御图标 `8+ / 1x`；冲锋+2',
        });
        const skeleton = makeArenaObject('skeleton-0', '0', PLAYER_ONE_START_ZONE, {
            sourceSpellCardId: 2826,
            sourceObjectId: 'spell-card-2826',
            name: '骷髅哨兵',
            life: 11,
            attackOrTraitLine: '短剑：快速近战 4 骰；非活体；精神免疫',
        });
        const outsideCat = makeArenaObject('outside-cat-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2906,
            sourceObjectId: 'spell-card-2906',
            name: '区外野性山猫',
            life: 10,
        });
        const contestedZoneCore = withPlayerInZone(planned.state.core, '0', PLAYER_ONE_START_ZONE);

        const attacked = runCommand({
            core: withArenaObject(
                withArenaObject(
                    withArenaObject(contestedZoneCore, friendlyCat),
                    skeleton,
                ),
                outsideCat,
            ),
            sys: { ...planned.state.sys, phase: 'creatureAction' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '1',
            payload: {
                spellCardId: attackSpellId,
                manaCost: 7,
                targetZoneId: PLAYER_ONE_START_ZONE,
            },
        }, statusRandom);

        const attackRolls = attacked.events.filter((event) => event.type === MAGE_WARS_EVENTS.SPELL_ATTACK_ROLLED);
        const damageEvents = attacked.events.filter((event) => event.type === 'DAMAGE_DEALT');

        expect(planned.success).toBe(true);
        expect(attacked.success).toBe(true);
        expect(attackRolls).toHaveLength(3);
        expect(damageEvents).toHaveLength(3);
        expect(attacked.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_ATTACK_ROLLED,
                payload: expect.objectContaining({
                    playerId: '1',
                    spellCardId: attackSpellId,
                    sourceAbilityId: 'mw.spell.1709',
                    targetPlayerId: '0',
                    targetZoneId: PLAYER_ONE_START_ZONE,
                    diceResults: [3, 3],
                    effectDieResult: 10,
                    baseDamage: 6,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_ATTACK_ROLLED,
                payload: expect.objectContaining({
                    targetObjectId: friendlyCat.id,
                    targetZoneId: PLAYER_ONE_START_ZONE,
                    diceResults: [3, 3],
                    effectDieResult: 10,
                    baseDamage: 6,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_ATTACK_ROLLED,
                payload: expect.objectContaining({
                    targetObjectId: skeleton.id,
                    targetZoneId: PLAYER_ONE_START_ZONE,
                    diceResults: [3, 3],
                    effectDieResult: 10,
                    baseDamage: 6,
                }),
            }),
            expect.objectContaining({
                type: 'DAMAGE_DEALT',
                payload: expect.objectContaining({
                    targetId: '0',
                    actualDamage: 6,
                    sourceAbilityId: 'mw.spell.1709',
                }),
            }),
            expect.objectContaining({
                type: 'DAMAGE_DEALT',
                payload: expect.objectContaining({
                    targetId: friendlyCat.id,
                    actualDamage: 6,
                    sourceAbilityId: 'mw.spell.1709',
                }),
            }),
            expect.objectContaining({
                type: 'DAMAGE_DEALT',
                payload: expect.objectContaining({
                    targetId: skeleton.id,
                    actualDamage: 8,
                    sourceAbilityId: 'mw.spell.1709',
                    breakdown: expect.objectContaining({
                        steps: expect.arrayContaining([
                            expect.objectContaining({
                                sourceId: 'mage-wars-nonliving-bonus',
                                sourceName: '对抗非活体生物',
                                value: 2,
                                runningTotal: 8,
                            }),
                        ]),
                    }),
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_PLACED,
                payload: expect.objectContaining({
                    targetPlayerId: '0',
                    statusTokenId: STATUS_TOKEN_IDS.STUN,
                    amount: 1,
                    sourceAbilityId: 'mw.spell.1709',
                    spellCardId: attackSpellId,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_PLACED,
                payload: expect.objectContaining({
                    targetObjectId: friendlyCat.id,
                    statusTokenId: STATUS_TOKEN_IDS.STUN,
                    amount: 1,
                    sourceAbilityId: 'mw.spell.1709',
                    spellCardId: attackSpellId,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_PLACED,
                payload: expect.objectContaining({
                    targetObjectId: skeleton.id,
                    statusTokenId: STATUS_TOKEN_IDS.STUN,
                    amount: 1,
                    sourceAbilityId: 'mw.spell.1709',
                    spellCardId: attackSpellId,
                }),
            }),
        ]));
        expect(attacked.state.core.players['1']).toMatchObject({
            damage: 0,
            statusTokens: {},
        });
        expect(attacked.state.core.players['0']).toMatchObject({
            damage: 6,
            statusTokens: {
                [STATUS_TOKEN_IDS.STUN]: 1,
            },
        });
        expect(attacked.state.core.objects[friendlyCat.id]).toMatchObject({
            damage: 6,
            statusTokens: {
                [STATUS_TOKEN_IDS.STUN]: 1,
            },
        });
        expect(attacked.state.core.objects[skeleton.id]).toMatchObject({
            damage: 8,
            statusTokens: {
                [STATUS_TOKEN_IDS.STUN]: 1,
            },
        });
        expect(attacked.state.core.objects[outsideCat.id]).toMatchObject({
            damage: 0,
            statusTokens: {},
        });
        expect(attacked.state.core.players['1'].discardSpellCardIds).toEqual([attackSpellId]);
    });

    it('casts Lightning Ring from the wizard spellbook as a same-zone area stun attack', () => {
        const attackSpellId = 1704;
        const statusRandom: RandomFn = {
            ...fixedRandom,
            d: (sides: number) => (sides === 12 ? 9 : 3),
        };
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.WIZARD_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([attackSpellId]));
        const friendlyCat = makeArenaObject('cat-0', '0', PLAYER_ZERO_START_ZONE, {
            life: 30,
        });
        const enemyGuard = makeArenaObject('guard-1', '1', PLAYER_ZERO_START_ZONE, {
            life: 30,
        });
        const lightningImmune = makeArenaObject('lightning-immune-1', '1', PLAYER_ZERO_START_ZONE, {
            life: 30,
            attackOrTraitLine: '长剑：快速近战 5 骰；闪电免疫',
        });
        const contestedZoneCore = withPlayerInZone(planned.state.core, '1', PLAYER_ZERO_START_ZONE);

        const attacked = runCommand({
            core: withArenaObject(
                withArenaObject(
                    withArenaObject(contestedZoneCore, friendlyCat),
                    lightningImmune,
                ),
                enemyGuard,
            ),
            sys: { ...planned.state.sys, phase: 'creatureAction' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: attackSpellId,
                manaCost: 9,
                targetZoneId: PLAYER_ZERO_START_ZONE,
            },
        }, statusRandom);

        const attackRolls = attacked.events.filter((event) => event.type === MAGE_WARS_EVENTS.SPELL_ATTACK_ROLLED);
        const damageEvents = attacked.events.filter((event) => event.type === 'DAMAGE_DEALT');

        expect(planned.success).toBe(true);
        expect(attacked.success).toBe(true);
        expect(attackRolls).toHaveLength(3);
        expect(damageEvents).toHaveLength(3);
        expect(attacked.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_ATTACK_ROLLED,
                payload: expect.objectContaining({
                    spellCardId: attackSpellId,
                    sourceAbilityId: 'mw.spell.1704',
                    targetPlayerId: '1',
                    targetZoneId: PLAYER_ZERO_START_ZONE,
                    diceResults: [3, 3, 3, 3],
                    effectDieResult: 9,
                    baseDamage: 12,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_ATTACK_ROLLED,
                payload: expect.objectContaining({
                    targetObjectId: friendlyCat.id,
                    targetZoneId: PLAYER_ZERO_START_ZONE,
                    diceResults: [3, 3, 3, 3],
                    effectDieResult: 9,
                    baseDamage: 12,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_ATTACK_ROLLED,
                payload: expect.objectContaining({
                    targetObjectId: enemyGuard.id,
                    targetZoneId: PLAYER_ZERO_START_ZONE,
                    diceResults: [3, 3, 3, 3],
                    effectDieResult: 9,
                    baseDamage: 12,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_PLACED,
                payload: expect.objectContaining({
                    targetPlayerId: '1',
                    statusTokenId: STATUS_TOKEN_IDS.STUN,
                    amount: 1,
                    sourceAbilityId: 'mw.spell.1704',
                    spellCardId: attackSpellId,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_PLACED,
                payload: expect.objectContaining({
                    targetObjectId: friendlyCat.id,
                    statusTokenId: STATUS_TOKEN_IDS.STUN,
                    amount: 1,
                    sourceAbilityId: 'mw.spell.1704',
                    spellCardId: attackSpellId,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_PLACED,
                payload: expect.objectContaining({
                    targetObjectId: enemyGuard.id,
                    statusTokenId: STATUS_TOKEN_IDS.STUN,
                    amount: 1,
                    sourceAbilityId: 'mw.spell.1704',
                    spellCardId: attackSpellId,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ATTACK_MISSED,
                payload: expect.objectContaining({
                    targetObjectId: lightningImmune.id,
                    sourceAbilityId: 'mw.spell.1704',
                    immunityDamageTypes: ['闪电'],
                }),
            }),
        ]));
        expect(attacked.state.core.players['0'].damage).toBe(0);
        expect(attacked.state.core.players['1']).toMatchObject({
            damage: 12,
            statusTokens: {
                [STATUS_TOKEN_IDS.STUN]: 1,
            },
        });
        expect(attacked.state.core.objects[friendlyCat.id]).toMatchObject({
            damage: 12,
            statusTokens: {
                [STATUS_TOKEN_IDS.STUN]: 1,
            },
        });
        expect(attacked.state.core.objects[enemyGuard.id]).toMatchObject({
            damage: 12,
            statusTokens: {
                [STATUS_TOKEN_IDS.STUN]: 1,
            },
        });
        expect(attacked.state.core.objects[lightningImmune.id]).toMatchObject({
            damage: 0,
            statusTokens: {},
        });
    });
});
