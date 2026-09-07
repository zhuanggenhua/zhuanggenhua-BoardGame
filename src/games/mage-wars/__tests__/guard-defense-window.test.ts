import { describe, expect, it } from 'vitest';
import { FLOW_COMMANDS } from '../../../engine/systems/FlowSystem';
import { INTERACTION_COMMANDS } from '../../../engine/systems/InteractionSystem';
import type { Command, MatchState, RandomFn } from '../../../engine/types';
import {
    buildAiLegalActionsFromInteractionDecision,
    type AiDecisionDescriptor,
} from '../../../engine/ai/decisionSemantics';
import { MAGE_WARS_COMMANDS } from '../domain';
import { MAGE_WARS_EVENTS } from '../domain/events';
import { resolveMageWarsObjectAttackEvents } from '../domain/execute';
import { ARENA_ZONE_IDS, STATUS_TOKEN_IDS } from '../domain/ids';
import type { MageWarsCore } from '../domain/types';
import {
    actionLogKinds,
    CAT_ATTACK_WITH_DEFENSE_LINE,
    expectNoPrompt,
    fixedRandom,
    getPromptInteractionId,
    getSimpleChoicePrompt,
    makeArenaObject,
    makeCounterstrikeEnchantmentObject,
    PLAYER_ZERO_START_ZONE,
    runCommand,
    setupState,
    validateCommand,
    withArenaObject,
    withPlayerInZone,
} from './helpers/domainFlowHarness';

describe('mage-wars guard and defense window', () => {
    it('lets ready arena creatures guard without consuming the mage action track', () => {
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

        const guarded = runCommand(state, {
            type: MAGE_WARS_COMMANDS.GUARD,
            playerId: '0',
            payload: {
                objectId: object.id,
            },
        });

        expect(guarded.success).toBe(true);
        expect(guarded.state.core.players['0']).toMatchObject({
            actionReady: false,
            guarding: false,
        });
        expect(guarded.state.core.objects[object.id]).toMatchObject({
            actionReady: false,
            guarding: true,
        });
        expect(guarded.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.GUARD_GAINED,
                payload: expect.objectContaining({
                    playerId: '0',
                    targetObjectId: object.id,
                }),
            }),
        ]));
        expect(actionLogKinds(guarded.state)).toContain(MAGE_WARS_EVENTS.GUARD_GAINED);
        expect(validateCommand(guarded.state, {
            type: MAGE_WARS_COMMANDS.GUARD,
            playerId: '0',
            payload: {
                objectId: object.id,
            },
        })).toBe('objectActionSpent');
    });

    it('lets ready arena creatures make same-zone quick melee attacks', () => {
        const baseState = setupState('creatureAction');
        const object = makeArenaObject('cat-0', '0', PLAYER_ZERO_START_ZONE);
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(withPlayerInZone(baseState.core, '1', PLAYER_ZERO_START_ZONE), object),
            sys: baseState.sys,
        };

        const attacked = runCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: object.id,
                attackProfileId: 'attack-0',
                targetPlayerId: '1',
            },
        });

        expect(attacked.success).toBe(true);
        expect(attacked.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED,
                payload: expect.objectContaining({
                    ownerId: '0',
                    attackerObjectId: object.id,
                    attackProfileId: 'attack-0',
                    attackName: '利爪',
                    targetPlayerId: '1',
                    diceResults: [3, 3],
                    baseDamage: 6,
                }),
            }),
            expect.objectContaining({
                type: 'DAMAGE_DEALT',
                payload: expect.objectContaining({
                    targetId: '1',
                    actualDamage: 6,
                    sourceAbilityId: 'mw.object.2906.attack-0',
                }),
            }),
        ]));
        expect(attacked.state.core.objects[object.id].actionReady).toBe(false);
        expect(attacked.state.core.players['1'].damage).toBe(6);
        expect(actionLogKinds(attacked.state)).toContain(MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED);

        expect(validateCommand(attacked.state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: { attackerObjectId: object.id, attackProfileId: 'attack-0', targetPlayerId: '1' },
        })).toBe('objectActionSpent');
    });

    it('requires same-zone melee object attacks to target enemy guarding creatures first', () => {
        const baseState = setupState('creatureAction');
        const attacker = makeArenaObject('cat-0', '0', PLAYER_ZERO_START_ZONE);
        const enemyGuard = makeArenaObject('guard-1', '1', PLAYER_ZERO_START_ZONE, {
            guarding: true,
            life: 12,
        });
        const exposedTarget = makeArenaObject('target-1', '1', PLAYER_ZERO_START_ZONE, {
            life: 12,
        });
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(
                withArenaObject(
                    withArenaObject(withPlayerInZone(baseState.core, '1', PLAYER_ZERO_START_ZONE), attacker),
                    enemyGuard,
                ),
                exposedTarget,
            ),
            sys: baseState.sys,
        };

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetPlayerId: '1',
            },
        })).toBe('guardInterceptionRequired');
        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: exposedTarget.id,
            },
        })).toBe('guardInterceptionRequired');
        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: enemyGuard.id,
            },
        })).toBeUndefined();
    });

    it('ignores guards that cannot protect the zone for melee target interception', () => {
        const baseState = setupState('creatureAction');
        const attacker = makeArenaObject('cat-0', '0', PLAYER_ZERO_START_ZONE);
        const crippledGuard = makeArenaObject('crippled-guard-1', '1', PLAYER_ZERO_START_ZONE, {
            guarding: true,
            statusTokens: { [STATUS_TOKEN_IDS.CRIPPLE]: 1 },
        });
        const stunnedGuard = makeArenaObject('stunned-guard-1', '1', PLAYER_ZERO_START_ZONE, {
            guarding: true,
            statusTokens: { [STATUS_TOKEN_IDS.STUN]: 1 },
        });
        const smallGuard = makeArenaObject('small-guard-1', '1', PLAYER_ZERO_START_ZONE, {
            guarding: true,
            attackOrTraitLine: '小爪：快速近战 1 骰；小型',
        });
        const exposedTarget = makeArenaObject('target-1', '1', PLAYER_ZERO_START_ZONE, {
            life: 12,
        });
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(
                withArenaObject(
                    withArenaObject(
                        withArenaObject(
                            withArenaObject(baseState.core, attacker),
                            crippledGuard,
                        ),
                        stunnedGuard,
                    ),
                    smallGuard,
                ),
                exposedTarget,
            ),
            sys: baseState.sys,
        };

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: exposedTarget.id,
            },
        })).toBeUndefined();
    });

    it('does not apply guard interception to ranged arena object attacks', () => {
        const baseState = setupState('creatureAction');
        const archer = makeArenaObject('archer-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2816,
            sourceObjectId: 'spell-card-2816',
            name: '皇家箭手',
            attackOrTraitLine: '长弓：完整行动远程 `1-2` 4 骰，穿刺+1；小刀：快速近战 2 骰',
        });
        const enemyGuard = makeArenaObject('guard-1', '1', PLAYER_ZERO_START_ZONE, {
            guarding: true,
            life: 12,
        });
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(
                withArenaObject(withPlayerInZone(baseState.core, '1', ARENA_ZONE_IDS.B3), archer),
                enemyGuard,
            ),
            sys: baseState.sys,
        };

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: archer.id,
                attackProfileId: 'attack-0',
                targetPlayerId: '1',
            },
        })).toBeUndefined();
    });

    it('removes guard from a guarding arena object after it is targeted by a melee attack', () => {
        const baseState = setupState('creatureAction');
        const attacker = makeArenaObject('cat-0', '0', PLAYER_ZERO_START_ZONE);
        const enemyGuard = makeArenaObject('guard-1', '1', PLAYER_ZERO_START_ZONE, {
            guarding: true,
            life: 12,
        });
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(withArenaObject(baseState.core, attacker), enemyGuard),
            sys: baseState.sys,
        };
        const rawAttackEvents = resolveMageWarsObjectAttackEvents({
            state,
            sourceCommandType: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            timestamp: 0,
            random: fixedRandom,
            attackerObjectId: attacker.id,
            attackProfileId: 'attack-0',
            targetObjectId: enemyGuard.id,
        });
        const rawAttackEventTypes = rawAttackEvents.map((event) => event.type);

        expect(rawAttackEventTypes).toContain(MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_GUARD_REMOVAL_AVAILABLE);
        expect(rawAttackEventTypes).not.toContain(MAGE_WARS_EVENTS.GUARD_REMOVED);

        const attacked = runCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: enemyGuard.id,
            },
        });

        expect(attacked.success).toBe(true);
        expect(attacked.state.core.objects[enemyGuard.id].guarding).toBe(false);
        expect(attacked.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.GUARD_REMOVED,
                payload: expect.objectContaining({
                    targetObjectId: enemyGuard.id,
                    sourceAbilityId: 'mw.guard.melee-attack',
                }),
            }),
        ]));
        expect(actionLogKinds(attacked.state)).toContain(MAGE_WARS_EVENTS.GUARD_REMOVED);
    });

    it('offers a voluntary counterstrike opportunity when a guarding creature is targeted by a melee attack', () => {
        const baseState = setupState('creatureAction');
        const attacker = makeArenaObject('cat-0', '0', PLAYER_ZERO_START_ZONE);
        const enemyGuard = makeArenaObject('guard-1', '1', PLAYER_ZERO_START_ZONE, {
            guarding: true,
            life: 12,
            attackOrTraitLine: '短剑：快速近战 4 骰；非活体；精神免疫',
        });
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(withArenaObject(baseState.core, attacker), enemyGuard),
            sys: baseState.sys,
        };

        const attacked = runCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: enemyGuard.id,
            },
        });

        const eventTypes = attacked.events.map((event) => event.type);
        expect(attacked.success).toBe(true);
        expect(attacked.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.COUNTERSTRIKE_AVAILABLE,
                payload: expect.objectContaining({
                    ownerId: '1',
                    attackerObjectId: attacker.id,
                    defenderObjectId: enemyGuard.id,
                    counterstrikeAttackProfileId: 'attack-0',
                    sourceAbilityId: 'mw.guard.counterstrike',
                }),
            }),
        ]));
        expect(eventTypes.indexOf(MAGE_WARS_EVENTS.COUNTERSTRIKE_AVAILABLE))
            .toBeLessThan(eventTypes.indexOf(MAGE_WARS_EVENTS.GUARD_REMOVED));
        expect(attacked.events.filter((event) => (
            event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED
            && event.payload.attackerObjectId === enemyGuard.id
        ))).toHaveLength(0);
        expect(actionLogKinds(attacked.state)).toContain(MAGE_WARS_EVENTS.COUNTERSTRIKE_AVAILABLE);
    });

    it('queues a defender choice and allows passing on voluntary counterstrike', () => {
        const baseState = setupState('creatureAction');
        const attacker = makeArenaObject('cat-0', '0', PLAYER_ZERO_START_ZONE);
        const enemyGuard = makeArenaObject('guard-1', '1', PLAYER_ZERO_START_ZONE, {
            guarding: true,
            life: 12,
            attackOrTraitLine: '短剑：快速近战 4 骰；非活体；精神免疫',
        });
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(withArenaObject(baseState.core, attacker), enemyGuard),
            sys: baseState.sys,
        };

        const attacked = runCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: enemyGuard.id,
            },
        });

        const interaction = getSimpleChoicePrompt(attacked.state, 'mw.counterstrike.choice');
        expect(interaction).toMatchObject({
            kind: 'simple-choice',
            playerId: '1',
            data: {
                sourceId: 'mw.counterstrike.choice',
                targetType: 'button',
            },
        });
        expect(interaction?.data).toMatchObject({
            options: expect.arrayContaining([
                expect.objectContaining({
                    id: 'counterstrike',
                    value: expect.objectContaining({
                        action: 'counterstrike',
                        attackerObjectId: attacker.id,
                        defenderObjectId: enemyGuard.id,
                        counterstrikeAttackProfileId: 'attack-0',
                    }),
                }),
                expect.objectContaining({
                    id: 'pass',
                    value: expect.objectContaining({
                        action: 'pass',
                        attackerObjectId: attacker.id,
                        defenderObjectId: enemyGuard.id,
                    }),
                }),
            ]),
        });
        expect(interaction?.data.choiceRequest).toMatchObject({
            sourceId: 'mw.counterstrike.choice',
            metadata: expect.objectContaining({
                opportunityId: interaction.id,
                mageWarsTimingOpportunity: 'mage-wars.counterstrike',
                sourceAbilityId: 'mw.guard.counterstrike',
                attackerObjectId: attacker.id,
                defenderObjectId: enemyGuard.id,
            }),
        });
        expect(interaction?.data.ai).toMatchObject({ status: 'semantic' });
        expect((interaction?.data.ai?.decisions?.[0] as AiDecisionDescriptor | undefined)?.metadata)
            .toMatchObject({
                opportunityId: interaction.id,
                mageWarsTimingOpportunity: 'mage-wars.counterstrike',
            });
        const aiActions = buildAiLegalActionsFromInteractionDecision(
            interaction.data.ai!.decisions![0] as AiDecisionDescriptor,
        );
        expect(aiActions.map((action) => (action.commands[0]?.payload as { optionId?: string }).optionId))
            .toEqual(expect.arrayContaining(['counterstrike', 'pass']));

        const passed = runCommand(attacked.state, {
            type: INTERACTION_COMMANDS.RESPOND,
            playerId: '1',
            payload: {
                interactionId: interaction.id,
                optionId: 'pass',
            },
        } as Command);

        expect(passed.success).toBe(true);
        expectNoPrompt(passed.state);
        expect(passed.events.map((event) => event.type)).toContain('SYS_INTERACTION_RESOLVED');
        expect(passed.events.filter((event) => (
            event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED
            && event.payload.attackerObjectId === enemyGuard.id
        ))).toHaveLength(0);
    });

    it('resolves selected counterstrike as a quick melee attack without spending the guarding creature action', () => {
        const baseState = setupState('creatureAction');
        const attacker = makeArenaObject('counterable-cat-0', '0', PLAYER_ZERO_START_ZONE, {
            life: 20,
            attackOrTraitLine: '利爪：快速近战 2 骰，反击',
        });
        const enemyGuard = makeArenaObject('guard-1', '1', PLAYER_ZERO_START_ZONE, {
            guarding: true,
            life: 20,
            attackOrTraitLine: '短剑：快速近战 4 骰；非活体；精神免疫',
        });
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(withArenaObject(baseState.core, attacker), enemyGuard),
            sys: baseState.sys,
        };

        const attacked = runCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: enemyGuard.id,
            },
        });
        const interaction = getSimpleChoicePrompt(attacked.state, 'mw.counterstrike.choice');

        const counterstruck = runCommand(attacked.state, {
            type: INTERACTION_COMMANDS.RESPOND,
            playerId: '1',
            payload: {
                interactionId: interaction.id,
                optionId: 'counterstrike',
            },
        } as Command);

        expect(counterstruck.success).toBe(true);
        expectNoPrompt(counterstruck.state);
        expect(counterstruck.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED,
                payload: expect.objectContaining({
                    ownerId: '1',
                    attackerObjectId: enemyGuard.id,
                    targetObjectId: attacker.id,
                    attackProfileId: 'attack-0',
                    attackName: '短剑',
                    diceResults: [3, 3, 3, 3],
                    baseDamage: 12,
                    actionCost: 'none',
                }),
            }),
            expect.objectContaining({
                type: 'DAMAGE_DEALT',
                payload: expect.objectContaining({
                    targetId: attacker.id,
                    actualDamage: 12,
                    sourceAbilityId: 'mw.object.2906.attack-0',
                }),
            }),
        ]));
        expect(counterstruck.events.map((event) => event.type)).not.toContain(MAGE_WARS_EVENTS.COUNTERSTRIKE_AVAILABLE);
        expect(counterstruck.state.core.objects[enemyGuard.id].actionReady).toBe(true);
        expect(counterstruck.state.core.objects[attacker.id].damage).toBe(12);
    });

    it('offers configured 1903 counterstrike without reading the enchantment display text', () => {
        const baseState = setupState('creatureAction');
        const attacker = makeArenaObject('enchantment-counter-attacker-0', '0', PLAYER_ZERO_START_ZONE);
        const target = makeArenaObject('enchantment-counter-target-1', '1', PLAYER_ZERO_START_ZONE, {
            life: 20,
            attackOrTraitLine: '利爪：快速近战 2 骰',
        });
        const enchantment = makeCounterstrikeEnchantmentObject(
            'counterstrike-enchantment-1903',
            '1',
            PLAYER_ZERO_START_ZONE,
            target.id,
        );
        const state: MatchState<MageWarsCore> = {
            core: [attacker, target, enchantment].reduce(withArenaObject, baseState.core),
            sys: baseState.sys,
        };

        const attacked = runCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: target.id,
            },
        });

        expect(attacked.success).toBe(true);
        expect(attacked.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.COUNTERSTRIKE_AVAILABLE,
                payload: expect.objectContaining({
                    defenderObjectId: target.id,
                    sourceAbilityId: 'mw.trait.counterstrike',
                    counterstrikeSourceObjectId: enchantment.id,
                }),
            }),
        ]));
        const interaction = getSimpleChoicePrompt(attacked.state, 'mw.counterstrike.choice');
        expect(interaction.data).toMatchObject({
            sourceId: 'mw.counterstrike.choice',
            options: expect.arrayContaining([
                expect.objectContaining({
                    id: 'counterstrike',
                    value: expect.objectContaining({
                        counterstrikeSourceObjectId: enchantment.id,
                    }),
                }),
            ]),
        });

        const passed = runCommand(attacked.state, {
            type: INTERACTION_COMMANDS.RESPOND,
            playerId: '1',
            payload: {
                interactionId: interaction.id,
                optionId: 'pass',
            },
        } as Command);

        expect(passed.success).toBe(true);
        expect(passed.state.core.objects[enchantment.id]).toBeDefined();
    });

    it('consumes configured 1903 after its first selected counterstrike', () => {
        const baseState = setupState('creatureAction');
        const attacker = makeArenaObject('consume-counter-attacker-0', '0', PLAYER_ZERO_START_ZONE);
        const target = makeArenaObject('consume-counter-target-1', '1', PLAYER_ZERO_START_ZONE, {
            life: 20,
            attackOrTraitLine: '利爪：快速近战 2 骰',
        });
        const enchantment = makeCounterstrikeEnchantmentObject(
            'consume-counter-enchantment-1903',
            '1',
            PLAYER_ZERO_START_ZONE,
            target.id,
        );
        const state: MatchState<MageWarsCore> = {
            core: [attacker, target, enchantment].reduce(withArenaObject, baseState.core),
            sys: baseState.sys,
        };

        const attacked = runCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: target.id,
            },
        });
        const interaction = getSimpleChoicePrompt(attacked.state, 'mw.counterstrike.choice');
        const counterstruck = runCommand(attacked.state, {
            type: INTERACTION_COMMANDS.RESPOND,
            playerId: '1',
            payload: {
                interactionId: interaction.id,
                optionId: 'counterstrike',
            },
        } as Command);

        expect(counterstruck.success).toBe(true);
        expect(counterstruck.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_SOURCE_CONSUME_AVAILABLE,
                payload: expect.objectContaining({
                    sourceObjectId: enchantment.id,
                    sourceAbilityId: 'mw.enchantment.counterstrike.consume',
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_DEFEATED,
                payload: expect.objectContaining({
                    objectId: enchantment.id,
                    sourceAbilityId: 'mw.enchantment.counterstrike.consume',
                    spellCardId: 1903,
                }),
            }),
        ]));
        const consumeAvailableIndex = counterstruck.events.findIndex((event) => (
            event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_SOURCE_CONSUME_AVAILABLE
            && event.payload.sourceObjectId === enchantment.id
        ));
        const sourceDefeatedIndex = counterstruck.events.findIndex((event) => (
            event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_DEFEATED
            && event.payload.objectId === enchantment.id
        ));
        expect(consumeAvailableIndex).toBeGreaterThanOrEqual(0);
        expect(sourceDefeatedIndex).toBeGreaterThanOrEqual(0);
        expect(consumeAvailableIndex).toBeLessThan(sourceDefeatedIndex);
        expect(counterstruck.state.core.objects[enchantment.id]).toBeUndefined();
    });

    it('consumes configured 1903 after a successful defense against its counterstrike', () => {
        const baseState = setupState('creatureAction');
        const attacker = makeArenaObject('defended-counter-attacker-0', '0', PLAYER_ZERO_START_ZONE, {
            attackOrTraitLine: CAT_ATTACK_WITH_DEFENSE_LINE,
        });
        const target = makeArenaObject('defended-counter-target-1', '1', PLAYER_ZERO_START_ZONE, {
            life: 20,
            attackOrTraitLine: '利爪：快速近战 2 骰',
        });
        const enchantment = makeCounterstrikeEnchantmentObject(
            'defended-counter-enchantment-1903',
            '1',
            PLAYER_ZERO_START_ZONE,
            target.id,
        );
        const state: MatchState<MageWarsCore> = {
            core: [attacker, target, enchantment].reduce(withArenaObject, baseState.core),
            sys: baseState.sys,
        };

        const attacked = runCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: target.id,
            },
        });
        const counterstruck = runCommand(attacked.state, {
            type: INTERACTION_COMMANDS.RESPOND,
            playerId: '1',
            payload: {
                interactionId: getPromptInteractionId(attacked.state, 'mw.counterstrike.choice'),
                optionId: 'counterstrike',
            },
        } as Command);
        const defenseInteraction = getSimpleChoicePrompt(counterstruck.state, 'mw.defense.choice');

        expect(defenseInteraction.data).toMatchObject({
            sourceId: 'mw.defense.choice',
            options: expect.arrayContaining([
                expect.objectContaining({ id: 'defend-defense-0' }),
            ]),
        });

        const defended = runCommand(counterstruck.state, {
            type: INTERACTION_COMMANDS.RESPOND,
            playerId: '0',
            payload: {
                interactionId: defenseInteraction.id,
                optionId: 'defend-defense-0',
            },
        } as Command, {
            ...fixedRandom,
            d: () => 8,
        });

        expect(defended.success).toBe(true);
        expect(defended.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_SOURCE_CONSUME_AVAILABLE,
                payload: expect.objectContaining({
                    sourceObjectId: enchantment.id,
                    sourceAbilityId: 'mw.enchantment.counterstrike.consume',
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_DEFEATED,
                payload: expect.objectContaining({
                    objectId: enchantment.id,
                    sourceAbilityId: 'mw.enchantment.counterstrike.consume',
                }),
            }),
        ]));
        const consumeAvailableIndex = defended.events.findIndex((event) => (
            event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_SOURCE_CONSUME_AVAILABLE
            && event.payload.sourceObjectId === enchantment.id
        ));
        const sourceDefeatedIndex = defended.events.findIndex((event) => (
            event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_DEFEATED
            && event.payload.objectId === enchantment.id
        ));
        expect(consumeAvailableIndex).toBeGreaterThanOrEqual(0);
        expect(sourceDefeatedIndex).toBeGreaterThanOrEqual(0);
        expect(consumeAvailableIndex).toBeLessThan(sourceDefeatedIndex);
        expect(defended.state.core.objects[enchantment.id]).toBeUndefined();
    });

    it('does not offer counterstrike for ranged attacks or paralyzed defending creatures', () => {
        const baseState = setupState('creatureAction');
        const archer = makeArenaObject('archer-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2816,
            sourceObjectId: 'spell-card-2816',
            name: '皇家箭手',
            attackOrTraitLine: '长弓：完整行动远程 `1-2` 4 骰，穿刺+1；小刀：快速近战 2 骰',
        });
        const rangedTarget = makeArenaObject('ranged-guard-1', '1', ARENA_ZONE_IDS.B3, {
            guarding: true,
            life: 20,
            attackOrTraitLine: '短剑：快速近战 4 骰',
        });
        const meleeAttacker = makeArenaObject('cat-0', '0', PLAYER_ZERO_START_ZONE);
        const stunnedGuard = makeArenaObject('stunned-guard-1', '1', PLAYER_ZERO_START_ZONE, {
            guarding: true,
            life: 12,
            attackOrTraitLine: '短剑：快速近战 4 骰',
            statusTokens: { [STATUS_TOKEN_IDS.STUN]: 1 },
        });

        const rangedAttack = runCommand({
            core: withArenaObject(withArenaObject(baseState.core, archer), rangedTarget),
            sys: baseState.sys,
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: archer.id,
                attackProfileId: 'attack-0',
                targetObjectId: rangedTarget.id,
            },
        });
        const stunnedMeleeAttack = runCommand({
            core: withArenaObject(withArenaObject(baseState.core, meleeAttacker), stunnedGuard),
            sys: baseState.sys,
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: meleeAttacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: stunnedGuard.id,
            },
        });

        expect(rangedAttack.success).toBe(true);
        expect(rangedAttack.events.map((event) => event.type)).not.toContain(MAGE_WARS_EVENTS.COUNTERSTRIKE_AVAILABLE);
        expect(rangedAttack.state.core.objects[rangedTarget.id].guarding).toBe(true);
        expect(stunnedMeleeAttack.success).toBe(true);
        expect(stunnedMeleeAttack.events.map((event) => event.type)).not.toContain(MAGE_WARS_EVENTS.COUNTERSTRIKE_AVAILABLE);
        expect(stunnedMeleeAttack.events.map((event) => event.type)).toContain(MAGE_WARS_EVENTS.GUARD_REMOVED);
    });

    it('removes guard from a guarding arena object after a dazed melee attack misses it', () => {
        const baseState = setupState('creatureAction');
        const attacker = makeArenaObject('dazed-cat-0', '0', PLAYER_ZERO_START_ZONE, {
            statusTokens: {
                [STATUS_TOKEN_IDS.DAZE]: 1,
            },
        });
        const enemyGuard = makeArenaObject('guard-1', '1', PLAYER_ZERO_START_ZONE, {
            guarding: true,
            life: 12,
        });
        const missRandom: RandomFn = {
            ...fixedRandom,
            d: (sides: number) => (sides === 12 ? 6 : 3),
        };
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(withArenaObject(baseState.core, attacker), enemyGuard),
            sys: baseState.sys,
        };

        const attacked = runCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: enemyGuard.id,
            },
        }, missRandom);

        expect(attacked.success).toBe(true);
        expect(attacked.state.core.objects[enemyGuard.id].guarding).toBe(false);
        expect(attacked.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ATTACK_MISSED,
                payload: expect.objectContaining({
                    targetObjectId: enemyGuard.id,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.GUARD_REMOVED,
                payload: expect.objectContaining({
                    targetObjectId: enemyGuard.id,
                    sourceAbilityId: 'mw.guard.melee-attack',
                }),
            }),
        ]));
        expect(attacked.events.map((event) => event.type)).toContain(MAGE_WARS_EVENTS.COUNTERSTRIKE_AVAILABLE);
    });

    it('makes dazed arena creature attacks miss before damage is rolled', () => {
        const baseState = setupState('creatureAction');
        const attacker = makeArenaObject('dazed-cat-0', '0', PLAYER_ZERO_START_ZONE, {
            statusTokens: {
                [STATUS_TOKEN_IDS.DAZE]: 1,
            },
        });
        const target = makeArenaObject('target-1', '1', PLAYER_ZERO_START_ZONE, {
            life: 30,
        });
        const missRandom: RandomFn = {
            ...fixedRandom,
            d: (sides: number) => (sides === 12 ? 6 : 3),
        };
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(withArenaObject(baseState.core, attacker), target),
            sys: baseState.sys,
        };

        const attacked = runCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: target.id,
            },
        }, missRandom);

        expect(attacked.success).toBe(true);
        expect(attacked.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED,
                payload: expect.objectContaining({
                    attackerObjectId: attacker.id,
                    targetObjectId: target.id,
                    diceResults: [],
                    effectDieResult: 6,
                    baseDamage: 0,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ATTACK_MISSED,
                payload: expect.objectContaining({
                    attackerObjectId: attacker.id,
                    targetObjectId: target.id,
                    statusTokenId: STATUS_TOKEN_IDS.DAZE,
                    effectDieResult: 6,
                }),
            }),
        ]));
        expect(attacked.events.map((event) => event.type)).not.toContain('DAMAGE_DEALT');
        expect(attacked.state.core.objects[attacker.id].actionReady).toBe(false);
        expect(attacked.state.core.objects[target.id].damage).toBe(0);
        expect(actionLogKinds(attacked.state)).toContain(MAGE_WARS_EVENTS.ATTACK_MISSED);
    });

    it('applies daze penalty to arena object defense dice without requiring the defender to be active player', () => {
        const baseState = setupState('creatureAction');
        const defendingCat = makeArenaObject('defending-cat-1', '1', PLAYER_ZERO_START_ZONE, {
            attackOrTraitLine: CAT_ATTACK_WITH_DEFENSE_LINE,
            statusTokens: {
                [STATUS_TOKEN_IDS.DAZE]: 1,
            },
        });
        const clearCat = makeArenaObject('clear-cat-1', '1', PLAYER_ZERO_START_ZONE, {
            attackOrTraitLine: CAT_ATTACK_WITH_DEFENSE_LINE,
        });
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(withArenaObject(baseState.core, defendingCat), clearCat),
            sys: baseState.sys,
        };
        const rawNineRandom: RandomFn = {
            ...fixedRandom,
            d: (sides: number) => (sides === 12 ? 9 : fixedRandom.d(sides)),
        };

        const dazedDefense = runCommand(state, {
            type: MAGE_WARS_COMMANDS.ROLL_ARENA_OBJECT_DEFENSE,
            playerId: '1',
            payload: {
                defenderObjectId: defendingCat.id,
                defenseProfileId: 'defense-0',
            },
        }, rawNineRandom);
        const clearDefense = runCommand(state, {
            type: MAGE_WARS_COMMANDS.ROLL_ARENA_OBJECT_DEFENSE,
            playerId: '1',
            payload: {
                defenderObjectId: clearCat.id,
                defenseProfileId: 'defense-0',
            },
        }, rawNineRandom);

        expect(dazedDefense.success).toBe(true);
        expect(clearDefense.success).toBe(true);
        expect(dazedDefense.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_DEFENSE_ROLLED,
                payload: expect.objectContaining({
                    ownerId: '1',
                    defenderObjectId: defendingCat.id,
                    defenseProfileId: 'defense-0',
                    defenseMinRoll: 8,
                    rawEffectDieResult: 9,
                    defenseDieModifier: -2,
                    modifiedEffectDieResult: 7,
                    success: false,
                }),
            }),
        ]));
        expect(clearDefense.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_DEFENSE_ROLLED,
                payload: expect.objectContaining({
                    defenderObjectId: clearCat.id,
                    defenseMinRoll: 8,
                    rawEffectDieResult: 9,
                    defenseDieModifier: 0,
                    modifiedEffectDieResult: 9,
                    success: true,
                }),
            }),
        ]));
        expect(actionLogKinds(dazedDefense.state)).toContain(MAGE_WARS_EVENTS.ARENA_OBJECT_DEFENSE_ROLLED);
    });

    it('applies restrained defense penalty to crippled arena creature defense dice', () => {
        const baseState = setupState('creatureAction');
        const crippledDefender = makeArenaObject('crippled-defender-1', '1', PLAYER_ZERO_START_ZONE, {
            attackOrTraitLine: CAT_ATTACK_WITH_DEFENSE_LINE,
            statusTokens: {
                [STATUS_TOKEN_IDS.CRIPPLE]: 1,
            },
        });
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(baseState.core, crippledDefender),
            sys: baseState.sys,
        };
        const rawNineRandom: RandomFn = {
            ...fixedRandom,
            d: (sides: number) => (sides === 12 ? 9 : fixedRandom.d(sides)),
        };

        const defense = runCommand(state, {
            type: MAGE_WARS_COMMANDS.ROLL_ARENA_OBJECT_DEFENSE,
            playerId: '1',
            payload: {
                defenderObjectId: crippledDefender.id,
                defenseProfileId: 'defense-0',
            },
        }, rawNineRandom);

        expect(defense.success).toBe(true);
        expect(defense.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_DEFENSE_ROLLED,
                payload: expect.objectContaining({
                    defenderObjectId: crippledDefender.id,
                    defenseMinRoll: 8,
                    rawEffectDieResult: 9,
                    defenseDieModifier: -2,
                    modifiedEffectDieResult: 7,
                    success: false,
                }),
            }),
        ]));
    });

    it('prevents stunned arena creatures from using defense profiles via the configured paralyze rule', () => {
        const baseState = setupState('creatureAction');
        const stunnedDefender = makeArenaObject('stunned-defender-1', '1', PLAYER_ZERO_START_ZONE, {
            attackOrTraitLine: CAT_ATTACK_WITH_DEFENSE_LINE,
            statusTokens: {
                [STATUS_TOKEN_IDS.STUN]: 1,
            },
        });
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(baseState.core, stunnedDefender),
            sys: baseState.sys,
        };

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.ROLL_ARENA_OBJECT_DEFENSE,
            playerId: '1',
            payload: {
                defenderObjectId: stunnedDefender.id,
                defenseProfileId: 'defense-0',
            },
        })).toBe('objectParalyzedCannotDefend');
    });

    it('queues a defender defense choice before attack dice and allows passing to continue the attack', () => {
        const baseState = setupState('creatureAction');
        const attacker = makeArenaObject('cat-0', '0', PLAYER_ZERO_START_ZONE);
        const defender = makeArenaObject('defending-cat-1', '1', PLAYER_ZERO_START_ZONE, {
            life: 20,
            attackOrTraitLine: '利爪：快速近战 2 骰；防御图标 `8+ / 1x`；冲锋+2',
        });
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(withArenaObject(baseState.core, attacker), defender),
            sys: baseState.sys,
        };

        const waitingForDefense = runCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: defender.id,
            },
        });

        const interaction = getSimpleChoicePrompt(waitingForDefense.state, 'mw.defense.choice');
        expect(waitingForDefense.success).toBe(true);
        expect(waitingForDefense.events.map((event) => event.type)).toContain(MAGE_WARS_EVENTS.DEFENSE_AVAILABLE);
        expect(waitingForDefense.events.map((event) => event.type)).not.toContain(MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED);
        expect(waitingForDefense.events.map((event) => event.type)).not.toContain('DAMAGE_DEALT');
        expect(waitingForDefense.state.core.objects[attacker.id].actionReady).toBe(false);
        expect(waitingForDefense.state.core.objects[defender.id].damage).toBe(0);
        expect(interaction).toMatchObject({
            kind: 'simple-choice',
            playerId: '1',
            data: {
                sourceId: 'mw.defense.choice',
                targetType: 'button',
            },
        });
        expect(interaction?.data).toMatchObject({
            options: expect.arrayContaining([
                expect.objectContaining({
                    id: 'defend-defense-0',
                    value: expect.objectContaining({
                        action: 'defend',
                        attackerObjectId: attacker.id,
                        defenderObjectId: defender.id,
                        defenseProfileId: 'defense-0',
                    }),
                }),
                expect.objectContaining({
                    id: 'pass',
                    value: expect.objectContaining({
                        action: 'pass',
                        attackerObjectId: attacker.id,
                        defenderObjectId: defender.id,
                    }),
                }),
            ]),
        });
        expect(interaction?.data.choiceRequest).toMatchObject({
            sourceId: 'mw.defense.choice',
            metadata: expect.objectContaining({
                opportunityId: interaction.id,
                mageWarsTimingOpportunity: 'mage-wars.defense',
                sourceAbilityId: 'mw.defense.choice',
                attackerObjectId: attacker.id,
                defenderObjectId: defender.id,
            }),
        });
        expect(interaction?.data.ai).toMatchObject({ status: 'semantic' });
        expect((interaction?.data.ai?.decisions?.[0] as AiDecisionDescriptor | undefined)?.metadata)
            .toMatchObject({
                opportunityId: interaction.id,
                mageWarsTimingOpportunity: 'mage-wars.defense',
            });
        const aiActions = buildAiLegalActionsFromInteractionDecision(
            interaction.data.ai!.decisions![0] as AiDecisionDescriptor,
        );
        expect(aiActions.map((action) => (action.commands[0]?.payload as { optionId?: string }).optionId))
            .toEqual(expect.arrayContaining(['defend-defense-0', 'pass']));

        const passed = runCommand(waitingForDefense.state, {
            type: INTERACTION_COMMANDS.RESPOND,
            playerId: '1',
            payload: {
                interactionId: interaction.id,
                optionId: 'pass',
            },
        } as Command);

        expect(passed.success).toBe(true);
        expectNoPrompt(passed.state);
        expect(passed.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED,
                payload: expect.objectContaining({
                    attackerObjectId: attacker.id,
                    targetObjectId: defender.id,
                    actionCost: 'none',
                }),
            }),
            expect.objectContaining({
                type: 'DAMAGE_DEALT',
                payload: expect.objectContaining({
                    targetId: defender.id,
                    actualDamage: 6,
                }),
            }),
        ]));
        expect(passed.state.core.objects[attacker.id].actionReady).toBe(false);
        expect(passed.state.core.objects[defender.id].damage).toBe(6);
    });

    it('makes a successful arena object defense evade the incoming attack before damage', () => {
        const baseState = setupState('creatureAction');
        const attacker = makeArenaObject('cat-0', '0', PLAYER_ZERO_START_ZONE);
        const defender = makeArenaObject('defending-cat-1', '1', PLAYER_ZERO_START_ZONE, {
            life: 20,
            attackOrTraitLine: '利爪：快速近战 2 骰；防御图标 `8+ / 1x`；冲锋+2',
        });
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(withArenaObject(baseState.core, attacker), defender),
            sys: baseState.sys,
        };
        const rawNineRandom: RandomFn = {
            ...fixedRandom,
            d: (sides: number) => (sides === 12 ? 9 : fixedRandom.d(sides)),
        };

        const waitingForDefense = runCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: defender.id,
            },
        });
        const interaction = getSimpleChoicePrompt(waitingForDefense.state, 'mw.defense.choice');

        const defended = runCommand(waitingForDefense.state, {
            type: INTERACTION_COMMANDS.RESPOND,
            playerId: '1',
            payload: {
                interactionId: interaction.id,
                optionId: 'defend-defense-0',
            },
        } as Command, rawNineRandom);

        expect(defended.success).toBe(true);
        expect(defended.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_DEFENSE_ROLLED,
                payload: expect.objectContaining({
                    defenderObjectId: defender.id,
                    defenseProfileId: 'defense-0',
                    rawEffectDieResult: 9,
                    success: true,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ATTACK_MISSED,
                payload: expect.objectContaining({
                    attackerObjectId: attacker.id,
                    targetObjectId: defender.id,
                    defenseProfileId: 'defense-0',
                }),
            }),
        ]));
        expect(defended.events.map((event) => event.type)).not.toContain(MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED);
        expect(defended.events.map((event) => event.type)).not.toContain('DAMAGE_DEALT');
        expect(defended.state.core.objects[defender.id].damage).toBe(0);
    });

    it('continues the incoming attack when arena object defense fails', () => {
        const baseState = setupState('creatureAction');
        const attacker = makeArenaObject('cat-0', '0', PLAYER_ZERO_START_ZONE);
        const defender = makeArenaObject('defending-cat-1', '1', PLAYER_ZERO_START_ZONE, {
            life: 20,
            attackOrTraitLine: '利爪：快速近战 2 骰；防御图标 `8+ / 1x`；冲锋+2',
        });
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(withArenaObject(baseState.core, attacker), defender),
            sys: baseState.sys,
        };

        const waitingForDefense = runCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: defender.id,
            },
        });
        const interaction = getSimpleChoicePrompt(waitingForDefense.state, 'mw.defense.choice');

        const defended = runCommand(waitingForDefense.state, {
            type: INTERACTION_COMMANDS.RESPOND,
            playerId: '1',
            payload: {
                interactionId: interaction.id,
                optionId: 'defend-defense-0',
            },
        } as Command);

        expect(defended.success).toBe(true);
        expect(defended.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_DEFENSE_ROLLED,
                payload: expect.objectContaining({
                    defenderObjectId: defender.id,
                    defenseProfileId: 'defense-0',
                    rawEffectDieResult: 3,
                    success: false,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED,
                payload: expect.objectContaining({
                    attackerObjectId: attacker.id,
                    targetObjectId: defender.id,
                    actionCost: 'none',
                }),
            }),
            expect.objectContaining({
                type: 'DAMAGE_DEALT',
                payload: expect.objectContaining({
                    targetId: defender.id,
                    actualDamage: 6,
                }),
            }),
        ]));
        expect(defended.events.map((event) => event.type)).not.toContain(MAGE_WARS_EVENTS.DEFENSE_AVAILABLE);
        expect(defended.state.core.objects[defender.id].damage).toBe(6);
    });

    it('spends one-use arena object defenses until their owner reset readies them', () => {
        const baseState = setupState('creatureAction');
        const firstAttacker = makeArenaObject('cat-0', '0', PLAYER_ZERO_START_ZONE);
        const secondAttacker = makeArenaObject('wolf-0', '0', PLAYER_ZERO_START_ZONE);
        const defender = makeArenaObject('defending-cat-1', '1', PLAYER_ZERO_START_ZONE, {
            life: 30,
            attackOrTraitLine: CAT_ATTACK_WITH_DEFENSE_LINE,
        });
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(
                withArenaObject(withArenaObject(baseState.core, firstAttacker), secondAttacker),
                defender,
            ),
            sys: baseState.sys,
        };
        const rawNineRandom: RandomFn = {
            ...fixedRandom,
            d: (sides: number) => (sides === 12 ? 9 : fixedRandom.d(sides)),
        };

        const waitingForDefense = runCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: firstAttacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: defender.id,
            },
        });
        const defended = runCommand(waitingForDefense.state, {
            type: INTERACTION_COMMANDS.RESPOND,
            playerId: '1',
            payload: {
                interactionId: getPromptInteractionId(waitingForDefense.state, 'mw.defense.choice'),
                optionId: 'defend-defense-0',
            },
        } as Command, rawNineRandom);

        expect(defended.success).toBe(true);
        expect(defended.state.core.objects[defender.id].defenseUsesThisRound).toMatchObject({
            'defense-0': 1,
        });
        expect(validateCommand(defended.state, {
            type: MAGE_WARS_COMMANDS.ROLL_ARENA_OBJECT_DEFENSE,
            playerId: '1',
            payload: {
                defenderObjectId: defender.id,
                defenseProfileId: 'defense-0',
            },
        })).toBe('defenseSpent');

        const spentDefenseAttack = runCommand(defended.state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: secondAttacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: defender.id,
            },
        });

        expect(spentDefenseAttack.success).toBe(true);
        expect(spentDefenseAttack.events.map((event) => event.type)).not.toContain(MAGE_WARS_EVENTS.DEFENSE_AVAILABLE);
        expect(spentDefenseAttack.events.map((event) => event.type)).toContain(MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED);

        const finalQuickcastState: MatchState<MageWarsCore> = {
            core: {
                ...defended.state.core,
                currentPlayerId: '0',
            },
            sys: { ...baseState.sys, phase: 'finalQuickcast' },
        };
        const nextTurn = runCommand(finalQuickcastState, {
            type: FLOW_COMMANDS.ADVANCE_PHASE,
            playerId: '0',
            payload: {},
        });
        const refreshedState: MatchState<MageWarsCore> = {
            core: {
                ...nextTurn.state.core,
                currentPlayerId: '0',
                phaseActorId: '0',
                objects: {
                    ...nextTurn.state.core.objects,
                    [secondAttacker.id]: {
                        ...nextTurn.state.core.objects[secondAttacker.id],
                        actionReady: true,
                    },
                },
            },
            sys: { ...nextTurn.state.sys, phase: 'creatureAction' },
        };
        const refreshedDefenseAttack = runCommand(refreshedState, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: secondAttacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: defender.id,
            },
        });

        expect(nextTurn.success).toBe(true);
        expect(nextTurn.state.core.objects[defender.id].defenseUsesThisRound).toBeUndefined();
        expect(refreshedDefenseAttack.success).toBe(true);
        expect(refreshedDefenseAttack.events.map((event) => event.type)).toContain(MAGE_WARS_EVENTS.DEFENSE_AVAILABLE);
    });

    it('does not offer defense against unavoidable arena object attacks', () => {
        const baseState = setupState('creatureAction');
        const attacker = makeArenaObject('brogan-0', '0', PLAYER_ZERO_START_ZONE, {
            attackOrTraitLine: '斩首刃：快速近战 4 骰，无法回避，穿刺+3',
        });
        const defender = makeArenaObject('defending-cat-1', '1', PLAYER_ZERO_START_ZONE, {
            life: 20,
            attackOrTraitLine: '利爪：快速近战 2 骰；防御图标 `8+ / 1x`；冲锋+2',
        });
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(withArenaObject(baseState.core, attacker), defender),
            sys: baseState.sys,
        };

        const attacked = runCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: defender.id,
            },
        });

        expect(attacked.success).toBe(true);
        expect(attacked.events.map((event) => event.type)).not.toContain(MAGE_WARS_EVENTS.DEFENSE_AVAILABLE);
        expect(attacked.events.map((event) => event.type)).toContain(MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED);
        expectNoPrompt(attacked.state);
        expect(attacked.state.core.objects[defender.id].damage).toBe(12);
    });
});
