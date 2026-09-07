import { describe, expect, it } from 'vitest';
import { INTERACTION_COMMANDS } from '../../../engine/systems/InteractionSystem';
import type { Command, MatchState } from '../../../engine/types';
import { MAGE_WARS_COMMANDS } from '../domain';
import { MAGE_WARS_EVENTS } from '../domain/events';
import { resolveMageWarsObjectAttackEvents } from '../domain/execute';
import { reduceEvent } from '../domain/reducer';
import {
    ARENA_ZONE_IDS,
    MAGE_IDS,
    MAGE_WARS_OBJECT_ABILITY_IDS,
} from '../domain/ids';
import type { MageWarsCommand, MageWarsCore } from '../domain/types';
import { getMageWarsPlayerDefenseProfiles } from '../domain/spellRules';
import {
    CAT_ATTACK_WITH_DEFENSE_LINE,
    fixedRandom,
    getPromptInteractionId,
    getPromptOptions,
    getPromptSourceId,
    makeArenaObject,
    makeCounterstrikeEnchantmentObject,
    makeDemonCuirassEquipmentObject,
    makeMentalCalmEnchantmentObject,
    makeSuppressionCloakEquipmentObject,
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

describe('mage-wars reaction equipment', () => {
    it('surfaces attack mana costs as a timing opportunity before the old attack owner pays or cancels', () => {
        const baseState = setupState('creatureAction');
        const attacker = makeArenaObject('attack-cost-available-attacker-0', '0', PLAYER_ONE_START_ZONE);
        const mentalCalm = makeMentalCalmEnchantmentObject(
            'attack-cost-available-mental-calm-1912',
            '1',
            PLAYER_ONE_START_ZONE,
            attacker.id,
        );
        const cloak = makeSuppressionCloakEquipmentObject(
            'attack-cost-available-cloak-3705',
            '1',
            PLAYER_ONE_START_ZONE,
        );
        const rawAttackEvents = resolveMageWarsObjectAttackEvents({
            state: {
                core: [attacker, mentalCalm, cloak].reduce(withArenaObject, {
                    ...baseState.core,
                    players: {
                        ...baseState.core.players,
                        '0': { ...baseState.core.players['0'], mana: 10 },
                    },
                }),
                sys: baseState.sys,
            },
            sourceCommandType: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            timestamp: 0,
            random: fixedRandom,
            attackerObjectId: attacker.id,
            attackProfileId: 'attack-0',
            targetPlayerId: '1',
        });
        const rawTypes = rawAttackEvents.map((event) => event.type);

        expect(rawAttackEvents).toEqual([expect.objectContaining({
            type: MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_MANA_COST_AVAILABLE,
            payload: expect.objectContaining({
                attackerObjectId: attacker.id,
                targetPlayerId: '1',
                mentalCalmSources: [{ objectId: mentalCalm.id, value: 2 }],
                meleeAttackManaTaxSources: [{ objectId: cloak.id, sourceSpellCardId: 3705, value: 2 }],
                requiredMana: 4,
            }),
        })]);
        expect(rawTypes).not.toContain(MAGE_WARS_EVENTS.MANA_SPENT);
        expect(rawTypes).not.toContain(MAGE_WARS_EVENTS.MENTAL_CALM_TRIGGERED);
        expect(rawTypes).not.toContain(MAGE_WARS_EVENTS.MELEE_ATTACK_MANA_TAX_TRIGGERED);
        expect(rawTypes).not.toContain(MAGE_WARS_EVENTS.ATTACK_MISSED);
        expect(rawTypes).not.toContain(MAGE_WARS_EVENTS.DEFENSE_AVAILABLE);
        expect(rawTypes).not.toContain('DAMAGE_DEALT');
    });

    it('charges Mental Calm before the defense window and records the source for the round', () => {
        const baseState = setupState('creatureAction');
        const attacker = makeArenaObject('mental-calm-attacker-0', '0', PLAYER_ZERO_START_ZONE);
        const target = makeArenaObject('mental-calm-defense-target-1', '1', PLAYER_ZERO_START_ZONE, {
            life: 20,
            attackOrTraitLine: CAT_ATTACK_WITH_DEFENSE_LINE,
        });
        const enchantment = makeMentalCalmEnchantmentObject(
            'mental-calm-enchantment-1912',
            '0',
            PLAYER_ZERO_START_ZONE,
            attacker.id,
        );
        const core = {
            ...baseState.core,
            players: {
                ...baseState.core.players,
                '0': { ...baseState.core.players['0'], mana: 5 },
            },
        };
        const attacked = runCommand({
            core: [attacker, target, enchantment].reduce(withArenaObject, core),
            sys: baseState.sys,
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: target.id,
            },
        });
        const eventTypes = attacked.events.map((event) => event.type);

        expect(attacked.success).toBe(true);
        expect(eventTypes).toContain(MAGE_WARS_EVENTS.MANA_SPENT);
        expect(eventTypes).toContain(MAGE_WARS_EVENTS.MENTAL_CALM_TRIGGERED);
        expect(eventTypes).toContain(MAGE_WARS_EVENTS.DEFENSE_AVAILABLE);
        expect(eventTypes.indexOf(MAGE_WARS_EVENTS.MANA_SPENT)).toBeLessThan(
            eventTypes.indexOf(MAGE_WARS_EVENTS.DEFENSE_AVAILABLE),
        );
        expect(eventTypes.indexOf(MAGE_WARS_EVENTS.MENTAL_CALM_TRIGGERED)).toBeLessThan(
            eventTypes.indexOf(MAGE_WARS_EVENTS.DEFENSE_AVAILABLE),
        );
        expect(attacked.state.core.players['0'].mana).toBe(3);
        expect(attacked.state.core.objects[enchantment.id]).toMatchObject({
            mentalCalmRoundNumber: attacked.state.core.turnNumber,
            mentalCalmAttackerObjectIdsThisRound: [attacker.id],
        });
        expect(attacked.state.core.objects[attacker.id].actionReady).toBe(false);
    });

    it('cancels Mental Calm attacks without enough mana while consuming the attack action', () => {
        const baseState = setupState('creatureAction');
        const attacker = makeArenaObject('mental-calm-insufficient-attacker-0', '0', PLAYER_ZERO_START_ZONE);
        const target = makeArenaObject('mental-calm-insufficient-target-1', '1', PLAYER_ZERO_START_ZONE, { life: 20 });
        const enchantment = makeMentalCalmEnchantmentObject(
            'mental-calm-insufficient-enchantment-1912',
            '0',
            PLAYER_ZERO_START_ZONE,
            attacker.id,
        );
        const core = {
            ...baseState.core,
            players: {
                ...baseState.core.players,
                '0': { ...baseState.core.players['0'], mana: 1 },
            },
        };
        const attacked = runCommand({
            core: [attacker, target, enchantment].reduce(withArenaObject, core),
            sys: baseState.sys,
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: target.id,
            },
        });
        const attackEvent = attacked.events.find((event) => (
            event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED
        ));

        expect(attacked.success).toBe(true);
        expect(attacked.events.map((event) => event.type)).toContain(MAGE_WARS_EVENTS.MENTAL_CALM_TRIGGERED);
        expect(attacked.events.map((event) => event.type)).not.toContain(MAGE_WARS_EVENTS.MANA_SPENT);
        expect(attacked.events.map((event) => event.type)).not.toContain(MAGE_WARS_EVENTS.DEFENSE_AVAILABLE);
        expect(attacked.events.map((event) => event.type)).not.toContain('DAMAGE_DEALT');
        expect(attacked.events.map((event) => event.type)).toContain(MAGE_WARS_EVENTS.ATTACK_MISSED);
        expect(attackEvent).toMatchObject({ payload: { diceResults: [], baseDamage: 0 } });
        expect(attacked.state.core.players['0'].mana).toBe(1);
        expect(attacked.state.core.objects[attacker.id].actionReady).toBe(false);
        expect(attacked.state.core.objects[enchantment.id].mentalCalmAttackerObjectIdsThisRound).toEqual([attacker.id]);
    });

    it('charges Mental Calm once per source and becomes available again in a new round', () => {
        const baseState = setupState('creatureAction');
        const attacker = makeArenaObject('mental-calm-round-attacker-0', '0', PLAYER_ZERO_START_ZONE);
        const target = makeArenaObject('mental-calm-round-target-1', '1', PLAYER_ZERO_START_ZONE, { life: 40 });
        const enchantment = makeMentalCalmEnchantmentObject(
            'mental-calm-round-enchantment-1912',
            '0',
            PLAYER_ZERO_START_ZONE,
            attacker.id,
        );
        const secondEnchantment = makeMentalCalmEnchantmentObject(
            'mental-calm-round-enchantment-1912-second',
            '0',
            PLAYER_ZERO_START_ZONE,
            attacker.id,
        );
        const core = {
            ...baseState.core,
            players: {
                ...baseState.core.players,
                '0': { ...baseState.core.players['0'], mana: 8 },
            },
        };
        const first = runCommand({
            core: [attacker, target, enchantment, secondEnchantment].reduce(withArenaObject, core),
            sys: baseState.sys,
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: target.id,
            },
        });
        const sameRound = runCommand({
            core: {
                ...first.state.core,
                currentPlayerId: '0',
                objects: {
                    ...first.state.core.objects,
                    [attacker.id]: { ...first.state.core.objects[attacker.id], actionReady: true },
                },
            },
            sys: first.state.sys,
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: target.id,
            },
        });
        const nextRoundCore = reduceEvent(first.state.core, {
            type: MAGE_WARS_EVENTS.TURN_ADVANCED,
            payload: { fromPlayerId: '0', toPlayerId: '0', turnNumber: first.state.core.turnNumber + 1 },
            sourceCommandType: 'test',
            timestamp: 1,
        });
        const nextRound = runCommand({
            core: {
                ...nextRoundCore,
                currentPlayerId: '0',
                objects: {
                    ...nextRoundCore.objects,
                    [attacker.id]: { ...nextRoundCore.objects[attacker.id], actionReady: true },
                },
            },
            sys: first.state.sys,
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: target.id,
            },
        });

        expect(first.events.map((event) => event.type)).toContain(MAGE_WARS_EVENTS.MANA_SPENT);
        expect(first.state.core.players['0'].mana).toBe(4);
        expect(sameRound.events.map((event) => event.type)).not.toContain(MAGE_WARS_EVENTS.MANA_SPENT);
        expect(sameRound.state.core.players['0'].mana).toBe(first.state.core.players['0'].mana);
        expect(nextRound.events.map((event) => event.type)).toContain(MAGE_WARS_EVENTS.MANA_SPENT);
        expect(nextRound.state.core.players['0'].mana).toBe(first.state.core.players['0'].mana - 4);
    });

    it('applies Mental Calm to ranged attacks but excludes counterstrikes', () => {
        const baseState = setupState('creatureAction');
        const rangedAttacker = makeArenaObject('mental-calm-ranged-attacker-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2816,
            sourceObjectId: 'spell-card-2816',
            attackOrTraitLine: '长弓：完整行动远程 `0-2` 4 骰',
        });
        const rangedTarget = makeArenaObject('mental-calm-ranged-target-1', '1', ARENA_ZONE_IDS.B2, { life: 20 });
        const rangedEnchantment = makeMentalCalmEnchantmentObject(
            'mental-calm-ranged-enchantment-1912',
            '0',
            PLAYER_ZERO_START_ZONE,
            rangedAttacker.id,
        );
        const ranged = runCommand({
            core: [rangedAttacker, rangedTarget, rangedEnchantment].reduce(withArenaObject, {
                ...baseState.core,
                players: {
                    ...baseState.core.players,
                    '0': { ...baseState.core.players['0'], mana: 4 },
                },
            }),
            sys: baseState.sys,
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: rangedAttacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: rangedTarget.id,
            },
        });

        const counterAttacker = makeArenaObject('mental-calm-counter-attacker-0', '0', PLAYER_ZERO_START_ZONE);
        const counterTarget = makeArenaObject('mental-calm-counter-target-1', '1', PLAYER_ZERO_START_ZONE, {
            life: 20,
            attackOrTraitLine: '利爪：快速近战 2 骰',
        });
        const counterstrikeEnchantment = makeCounterstrikeEnchantmentObject(
            'mental-calm-counterstrike-1903',
            '1',
            PLAYER_ZERO_START_ZONE,
            counterTarget.id,
        );
        const counterMentalCalm = makeMentalCalmEnchantmentObject(
            'mental-calm-counter-1912',
            '1',
            PLAYER_ZERO_START_ZONE,
            counterTarget.id,
        );
        const incoming = runCommand({
            core: [counterAttacker, counterTarget, counterstrikeEnchantment, counterMentalCalm].reduce(withArenaObject, {
                ...baseState.core,
                players: {
                    ...baseState.core.players,
                    '1': { ...baseState.core.players['1'], mana: 2 },
                },
            }),
            sys: baseState.sys,
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: counterAttacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: counterTarget.id,
            },
        });
        const counterstruck = runCommand(incoming.state, {
            type: INTERACTION_COMMANDS.RESPOND,
            playerId: '1',
            payload: {
                interactionId: getPromptInteractionId(incoming.state, 'mw.counterstrike.choice'),
                optionId: 'counterstrike',
            },
        } as Command);

        expect(ranged.success).toBe(true);
        expect(ranged.events.map((event) => event.type)).toContain(MAGE_WARS_EVENTS.MANA_SPENT);
        expect(counterstruck.success).toBe(true);
        expect(counterstruck.events.map((event) => event.type)).not.toContain(MAGE_WARS_EVENTS.MANA_SPENT);
        expect(counterstruck.events.map((event) => event.type)).not.toContain(MAGE_WARS_EVENTS.MENTAL_CALM_TRIGGERED);
        expect(counterstruck.state.core.players['1'].mana).toBe(2);
    });

    it('charges Suppression Cloak before a creature melee attack and only once per attacker each round', () => {
        const baseState = setupState('creatureAction');
        const attacker = makeArenaObject('suppression-cloak-attacker-0', '0', PLAYER_ONE_START_ZONE);
        const cloak = makeSuppressionCloakEquipmentObject(
            'suppression-cloak-3705',
            '1',
            PLAYER_ONE_START_ZONE,
        );
        const core = {
            ...baseState.core,
            players: {
                ...baseState.core.players,
                '0': { ...baseState.core.players['0'], mana: 5 },
            },
        };
        const attacked = runCommand({
            core: [attacker, cloak].reduce(withArenaObject, core),
            sys: baseState.sys,
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetPlayerId: '1',
            },
        });

        expect(attacked.success).toBe(true);
        expect(attacked.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.MANA_SPENT,
                payload: expect.objectContaining({ amount: 2, spellCardId: 3705 }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.MELEE_ATTACK_MANA_TAX_TRIGGERED,
                payload: expect.objectContaining({
                    attackerObjectId: attacker.id,
                    targetPlayerId: '1',
                    sourceObjectIds: [cloak.id],
                    requiredMana: 2,
                }),
            }),
        ]));
        expect(attacked.state.core.players['0'].mana).toBe(3);
        expect(attacked.state.core.objects[cloak.id]).toMatchObject({
            meleeAttackManaTaxRoundNumber: attacked.state.core.turnNumber,
            meleeAttackManaTaxAttackerObjectIdsThisRound: [attacker.id],
        });

        const sameRound = runCommand({
            core: {
                ...attacked.state.core,
                objects: {
                    ...attacked.state.core.objects,
                    [attacker.id]: { ...attacked.state.core.objects[attacker.id], actionReady: true },
                },
            },
            sys: attacked.state.sys,
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetPlayerId: '1',
            },
        });

        expect(sameRound.success).toBe(true);
        expect(sameRound.events.map((event) => event.type)).not.toContain(
            MAGE_WARS_EVENTS.MELEE_ATTACK_MANA_TAX_TRIGGERED,
        );
        expect(sameRound.state.core.players['0'].mana).toBe(3);
    });

    it('charges every Suppression Cloak source, resets in a new round, and stops after removal', () => {
        const baseState = setupState('creatureAction');
        const attacker = makeArenaObject('suppression-cloak-sources-attacker-0', '0', PLAYER_ONE_START_ZONE);
        const firstCloak = makeSuppressionCloakEquipmentObject(
            'suppression-cloak-sources-first-3705',
            '1',
            PLAYER_ONE_START_ZONE,
        );
        const secondCloak = makeSuppressionCloakEquipmentObject(
            'suppression-cloak-sources-second-3705',
            '1',
            PLAYER_ONE_START_ZONE,
        );
        const initial = runCommand({
            core: [attacker, firstCloak, secondCloak].reduce(withArenaObject, {
                ...baseState.core,
                players: {
                    ...baseState.core.players,
                    '0': { ...baseState.core.players['0'], mana: 8 },
                },
            }),
            sys: baseState.sys,
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetPlayerId: '1',
            },
        });
        const initialPayments = initial.events.filter((event) => event.type === MAGE_WARS_EVENTS.MANA_SPENT);
        expect(initialPayments).toHaveLength(2);
        expect(initial.state.core.players['0'].mana).toBe(4);

        const nextRoundCore = reduceEvent(initial.state.core, {
            type: MAGE_WARS_EVENTS.TURN_ADVANCED,
            payload: {
                fromPlayerId: '0',
                toPlayerId: '0',
                turnNumber: initial.state.core.turnNumber + 1,
            },
            sourceCommandType: 'test',
            timestamp: 1,
        });
        const objectsWithoutSecondCloak = { ...nextRoundCore.objects };
        delete objectsWithoutSecondCloak[secondCloak.id];
        const nextRound = runCommand({
            core: {
                ...nextRoundCore,
                objects: {
                    ...objectsWithoutSecondCloak,
                    [attacker.id]: { ...objectsWithoutSecondCloak[attacker.id], actionReady: true },
                },
                currentPlayerId: '0',
            },
            sys: initial.state.sys,
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetPlayerId: '1',
            },
        });

        expect(nextRound.success).toBe(true);
        expect(nextRound.events.filter((event) => event.type === MAGE_WARS_EVENTS.MANA_SPENT)).toHaveLength(1);
        expect(nextRound.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.MELEE_ATTACK_MANA_TAX_TRIGGERED,
                payload: expect.objectContaining({ sourceObjectIds: [firstCloak.id], requiredMana: 2 }),
            }),
        ]));
        expect(nextRound.state.core.players['0'].mana).toBe(2);
    });

    it('cancels a Suppression Cloak attack without enough mana and records the attempted creature', () => {
        const baseState = setupState('creatureAction');
        const attacker = makeArenaObject('suppression-cloak-insufficient-attacker-0', '0', PLAYER_ONE_START_ZONE);
        const cloak = makeSuppressionCloakEquipmentObject(
            'suppression-cloak-insufficient-3705',
            '1',
            PLAYER_ONE_START_ZONE,
        );
        const attacked = runCommand({
            core: [attacker, cloak].reduce(withArenaObject, {
                ...baseState.core,
                players: {
                    ...baseState.core.players,
                    '0': { ...baseState.core.players['0'], mana: 1 },
                },
            }),
            sys: baseState.sys,
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetPlayerId: '1',
            },
        });

        expect(attacked.success).toBe(true);
        expect(attacked.events.map((event) => event.type)).toContain(
            MAGE_WARS_EVENTS.MELEE_ATTACK_MANA_TAX_TRIGGERED,
        );
        expect(attacked.events.map((event) => event.type)).not.toContain(MAGE_WARS_EVENTS.MANA_SPENT);
        expect(attacked.events.map((event) => event.type)).toContain(MAGE_WARS_EVENTS.ATTACK_MISSED);
        expect(attacked.events.some((event) => event.type === 'DAMAGE_DEALT')).toBe(false);
        expect(attacked.state.core.players['0'].mana).toBe(1);
        expect(attacked.state.core.objects[attacker.id].actionReady).toBe(false);
        expect(attacked.state.core.objects[cloak.id].meleeAttackManaTaxAttackerObjectIdsThisRound).toEqual([
            attacker.id,
        ]);
    });

    it('does not partially pay when Suppression Cloak and Mental Calm exceed available mana', () => {
        const baseState = setupState('creatureAction');
        const attacker = makeArenaObject('suppression-cloak-combined-attacker-0', '0', PLAYER_ONE_START_ZONE);
        const cloak = makeSuppressionCloakEquipmentObject(
            'suppression-cloak-combined-3705',
            '1',
            PLAYER_ONE_START_ZONE,
        );
        const mentalCalm = makeMentalCalmEnchantmentObject(
            'suppression-cloak-combined-1912',
            '1',
            PLAYER_ONE_START_ZONE,
            attacker.id,
        );
        const attacked = runCommand({
            core: [attacker, cloak, mentalCalm].reduce(withArenaObject, {
                ...baseState.core,
                players: {
                    ...baseState.core.players,
                    '0': { ...baseState.core.players['0'], mana: 3 },
                },
            }),
            sys: baseState.sys,
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetPlayerId: '1',
            },
        });

        expect(attacked.success).toBe(true);
        expect(attacked.events.map((event) => event.type)).not.toContain(MAGE_WARS_EVENTS.MANA_SPENT);
        expect(attacked.events.map((event) => event.type)).toEqual(expect.arrayContaining([
            MAGE_WARS_EVENTS.MENTAL_CALM_TRIGGERED,
            MAGE_WARS_EVENTS.MELEE_ATTACK_MANA_TAX_TRIGGERED,
            MAGE_WARS_EVENTS.ATTACK_MISSED,
        ]));
        expect(attacked.state.core.players['0'].mana).toBe(3);
    });

    it('offers Offset Bracers as a structured mage defense and avoids a successful attack', () => {
        const baseState = setupState('creatureAction');
        const attacker = makeArenaObject('offset-bracers-attacker-0', '0', PLAYER_ONE_START_ZONE);
        const bracers = makeArenaObject('offset-bracers-3715', '1', PLAYER_ONE_START_ZONE, {
            kind: 'equipment',
            sourceSpellCardId: 3715,
            sourceObjectId: 'spell-3715',
            name: '偏移护腕',
            actionReady: false,
            attackOrTraitLine: undefined,
            rulesText: undefined,
            combatProfilesSource: 'config',
            anchoredToPlayerId: '1',
        });
        const waiting = runCommand({
            core: [attacker, bracers].reduce(withArenaObject, baseState.core),
            sys: baseState.sys,
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetPlayerId: '1',
            },
        });

        expect(waiting.success).toBe(true);
        expect(waiting.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.DEFENSE_AVAILABLE,
                payload: expect.objectContaining({
                    attackerObjectId: attacker.id,
                    defenderId: '1',
                    defenseProfileIds: ['equipment-offset-bracers-3715-defense-0'],
                }),
            }),
        ]));
        const defended = runCommand(waiting.state, {
            type: INTERACTION_COMMANDS.RESPOND,
            playerId: '1',
            payload: {
                interactionId: getPromptInteractionId(waiting.state, 'mw.defense.choice'),
                optionId: 'defend-equipment-offset-bracers-3715-defense-0',
            },
        } as Command, {
            ...fixedRandom,
            d: (sides: number) => (sides === 12 ? 8 : fixedRandom.d(sides)),
        });

        expect(defended.success).toBe(true);
        expect(defended.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.MAGE_DEFENSE_ROLLED,
                payload: expect.objectContaining({
                    defenderId: '1',
                    defenseMinRoll: 7,
                    success: true,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ATTACK_MISSED,
                payload: expect.objectContaining({
                    targetPlayerId: '1',
                    defenseProfileId: 'equipment-offset-bracers-3715-defense-0',
                }),
            }),
        ]));
        expect(defended.events.some((event) => event.type === 'DAMAGE_DEALT')).toBe(false);
        expect(defended.state.core.players['1'].defenseUsesThisRound).toEqual({
            'equipment-offset-bracers-3715-defense-0': 1,
        });
        const objectsWithoutBracers = { ...defended.state.core.objects };
        delete objectsWithoutBracers[bracers.id];
        expect(getMageWarsPlayerDefenseProfiles(
            { ...defended.state.core, objects: objectsWithoutBracers },
            defended.state.core.players['1'],
        )).toEqual([]);
    });

    it('resumes the original attack after a failed Offset Bracers defense and resets it next round', () => {
        const baseState = setupState('creatureAction');
        const attacker = makeArenaObject('offset-bracers-fail-attacker-0', '0', PLAYER_ONE_START_ZONE);
        const bracers = makeArenaObject('offset-bracers-fail-3715', '1', PLAYER_ONE_START_ZONE, {
            kind: 'equipment',
            sourceSpellCardId: 3715,
            sourceObjectId: 'spell-3715',
            name: '偏移护腕',
            actionReady: false,
            attackOrTraitLine: undefined,
            rulesText: undefined,
            combatProfilesSource: 'config',
            anchoredToPlayerId: '1',
        });
        const waiting = runCommand({
            core: [attacker, bracers].reduce(withArenaObject, baseState.core),
            sys: baseState.sys,
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetPlayerId: '1',
            },
        });
        const failed = runCommand(waiting.state, {
            type: INTERACTION_COMMANDS.RESPOND,
            playerId: '1',
            payload: {
                interactionId: getPromptInteractionId(waiting.state, 'mw.defense.choice'),
                optionId: 'defend-equipment-offset-bracers-fail-3715-defense-0',
            },
        } as Command);

        expect(failed.success).toBe(true);
        expect(failed.events.filter((event) => event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED)).toHaveLength(1);
        expect(failed.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.MAGE_DEFENSE_ROLLED,
                payload: expect.objectContaining({ success: false }),
            }),
            expect.objectContaining({ type: 'DAMAGE_DEALT' }),
        ]));
        expect(failed.state.core.players['1'].defenseUsesThisRound).toMatchObject({
            'equipment-offset-bracers-fail-3715-defense-0': 1,
        });

        const reset = reduceEvent(failed.state.core, {
            type: MAGE_WARS_EVENTS.ACTION_READINESS_RESET,
            payload: { playerId: '1' },
            sourceCommandType: 'test',
            timestamp: 1,
        });
        expect(reset.players['1'].defenseUsesThisRound).toBeUndefined();
    });

    it('uses the same mage defense window for a basic mage attack and an attack spell', () => {
        const baseState = setupState('creatureAction');
        const bracers = makeArenaObject('offset-bracers-shared-3715', '1', PLAYER_ONE_START_ZONE, {
            kind: 'equipment',
            sourceSpellCardId: 3715,
            sourceObjectId: 'spell-3715',
            name: '偏移护腕',
            actionReady: false,
            attackOrTraitLine: undefined,
            rulesText: undefined,
            combatProfilesSource: 'config',
            anchoredToPlayerId: '1',
        });
        const basic = runCommand({
            core: withArenaObject(withPlayerInZone(baseState.core, '0', PLAYER_ONE_START_ZONE), bracers),
            sys: baseState.sys,
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_ATTACK,
            playerId: '0',
            payload: { targetPlayerId: '1' },
        });
        expect(basic.success).toBe(true);
        expect(getPromptSourceId(basic.state)).toBe('mw.defense.choice');
        expect(getPromptOptions(basic.state)).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: 'defend-equipment-offset-bracers-shared-3715-defense-0' }),
        ]));

        const spellState = {
            core: withArenaObject(
                withPreparedPlayerMage(
                    withPlayerInZone(baseState.core, '0', ARENA_ZONE_IDS.C1),
                    '0',
                    MAGE_IDS.WIZARD_APPRENTICE,
                    [1705],
                    20,
                ),
                bracers,
            ),
            sys: { ...baseState.sys, phase: 'finalQuickcast' as const },
        };
        const spell = runCommand(spellState, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: 1705,
                manaCost: 8,
                targetPlayerId: '1',
            },
        });
        expect(spell.success).toBe(true);
        expect(spell.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.DEFENSE_AVAILABLE,
                payload: expect.objectContaining({
                    attackerId: '0',
                    defenderId: '1',
                    spellCardId: 1705,
                }),
            }),
        ]));
        const defendedSpell = runCommand(spell.state, {
            type: INTERACTION_COMMANDS.RESPOND,
            playerId: '1',
            payload: {
                interactionId: getPromptInteractionId(spell.state, 'mw.defense.choice'),
                optionId: 'defend-equipment-offset-bracers-shared-3715-defense-0',
            },
        } as Command, {
            ...fixedRandom,
            d: (sides: number) => (sides === 12 ? 8 : fixedRandom.d(sides)),
        });
        expect(defendedSpell.success).toBe(true);
        expect(defendedSpell.events.map((event) => event.type)).toContain(MAGE_WARS_EVENTS.MAGE_DEFENSE_ROLLED);
        expect(defendedSpell.events.map((event) => event.type)).toContain(MAGE_WARS_EVENTS.ATTACK_MISSED);
        expect(defendedSpell.events.map((event) => event.type)).not.toContain(MAGE_WARS_EVENTS.SPELL_ATTACK_ROLLED);
        expect(defendedSpell.state.core.players['0'].mana).toBe(12);
    });

    it('triggers Demon Cuirass after an object melee attack and ignores attacker armor', () => {
        const baseState = setupState('creatureAction');
        const attacker = makeArenaObject('demon-cuirass-object-attacker', '0', PLAYER_ONE_START_ZONE, {
            life: 10,
            armor: 5,
        });
        const cuirass = makeDemonCuirassEquipmentObject(
            'demon-cuirass-3700-object',
            '1',
            PLAYER_ONE_START_ZONE,
        );
        const state: MatchState<MageWarsCore> = {
            core: [attacker, cuirass].reduce(withArenaObject, baseState.core),
            sys: baseState.sys,
        };
        const rawAttackEvents = resolveMageWarsObjectAttackEvents({
            state,
            sourceCommandType: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            timestamp: 0,
            random: fixedRandom,
            attackerObjectId: attacker.id,
            attackProfileId: 'attack-0',
            targetPlayerId: '1',
        });
        const attacked = runCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetPlayerId: '1',
            },
        });

        const barrierDamage = attacked.events.find((event) => (
            event.type === 'DAMAGE_DEALT'
            && event.payload.sourceAbilityId === 'mw.equipment.3700.damage-barrier'
        ));
        expect(rawAttackEvents.map((event) => event.type)).toContain(MAGE_WARS_EVENTS.DAMAGE_BARRIER_AVAILABLE);
        expect(rawAttackEvents.map((event) => event.type)).not.toContain(MAGE_WARS_EVENTS.DAMAGE_BARRIER_TRIGGERED);
        expect(rawAttackEvents).not.toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: 'DAMAGE_DEALT',
                payload: expect.objectContaining({ sourceAbilityId: 'mw.equipment.3700.damage-barrier' }),
            }),
        ]));
        expect(attacked.success).toBe(true);
        expect(attacked.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.DAMAGE_BARRIER_TRIGGERED,
                payload: expect.objectContaining({
                    sourceObjectId: cuirass.id,
                    attackerObjectId: attacker.id,
                    diceResults: [3],
                    damageTypes: ['aether'],
                    unavoidable: true,
                    lethal: true,
                }),
            }),
        ]));
        expect(attacked.events.map((event) => event.type)).not.toContain(MAGE_WARS_EVENTS.DEFENSE_AVAILABLE);
        expect(attacked.events.map((event) => event.type)).not.toContain(MAGE_WARS_EVENTS.COUNTERSTRIKE_AVAILABLE);
        expect(barrierDamage).toMatchObject({
            type: 'DAMAGE_DEALT',
            payload: {
                targetId: attacker.id,
                actualDamage: 3,
            },
        });
        expect(attacked.state.core.objects[attacker.id].damage).toBe(3);
        expect(attacked.state.core.players['1'].damage).toBe(6);
        expect(attacked.state.core.objects[cuirass.id]).toMatchObject({
            damageBarrierRoundNumber: attacked.state.core.turnNumber,
            damageBarrierAttackerIdsThisRound: [attacker.id],
        });
    });

    it('can defeat the attacking object with Demon Cuirass lethal damage', () => {
        const baseState = setupState('creatureAction');
        const attacker = makeArenaObject('demon-cuirass-defeated-attacker', '0', PLAYER_ONE_START_ZONE, {
            life: 2,
        });
        const cuirass = makeDemonCuirassEquipmentObject(
            'demon-cuirass-3700-defeat',
            '1',
            PLAYER_ONE_START_ZONE,
        );
        const attacked = runCommand({
            core: [attacker, cuirass].reduce(withArenaObject, baseState.core),
            sys: baseState.sys,
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetPlayerId: '1',
            },
        });

        expect(attacked.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_DEFEATED,
                payload: expect.objectContaining({
                    objectId: attacker.id,
                    sourceAbilityId: 'mw.equipment.3700.damage-barrier',
                }),
            }),
        ]));
        expect(attacked.state.core.objects[attacker.id]).toBeUndefined();
    });

    it('triggers Demon Cuirass after a successful mage basic melee attack', () => {
        const baseState = setupState('creatureAction');
        const cuirass = makeDemonCuirassEquipmentObject(
            'demon-cuirass-3700-mage',
            '1',
            PLAYER_ONE_START_ZONE,
        );
        const core = withArenaObject(
            withPlayerInZone(baseState.core, '0', PLAYER_ONE_START_ZONE),
            cuirass,
        );
        const attacked = runCommand({ core, sys: baseState.sys }, {
            type: MAGE_WARS_COMMANDS.DECLARE_ATTACK,
            playerId: '0',
            payload: { targetPlayerId: '1' },
        });

        expect(attacked.success).toBe(true);
        expect(attacked.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.DAMAGE_BARRIER_TRIGGERED,
                payload: expect.objectContaining({
                    sourceObjectId: cuirass.id,
                    attackerId: '0',
                    diceResults: [3],
                }),
            }),
            expect.objectContaining({
                type: 'DAMAGE_DEALT',
                payload: expect.objectContaining({
                    targetId: '0',
                    actualDamage: 3,
                    sourceAbilityId: 'mw.equipment.3700.damage-barrier',
                }),
            }),
        ]));
        expect(attacked.state.core.players['0'].damage).toBe(3);
        expect(attacked.state.core.players['1'].damage).toBe(9);
    });

    it('does not trigger Demon Cuirass for an attack spell', () => {
        const baseState = setupState('initiativeQuickcast');
        const cuirass = makeDemonCuirassEquipmentObject(
            'demon-cuirass-3700-spell',
            '1',
            PLAYER_ONE_START_ZONE,
        );
        const core = withArenaObject(
            withPreparedPlayerMage(
                withPlayerInZone(baseState.core, '0', PLAYER_ONE_START_ZONE),
                '0',
                MAGE_IDS.WARLOCK_APPRENTICE,
                [1702],
            ),
            cuirass,
        );
        const cast = runCommand({ core, sys: baseState.sys }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: 1702,
                manaCost: 5,
                targetPlayerId: '1',
            },
        });

        expect(cast.success).toBe(true);
        expect(cast.events.map((event) => event.type)).not.toContain(
            MAGE_WARS_EVENTS.DAMAGE_BARRIER_TRIGGERED,
        );
        expect(cast.events.filter((event) => event.type === 'DAMAGE_DEALT')).toHaveLength(1);
    });

    it('uses a Demon Cuirass barrier once per attacker per round and restores it next round', () => {
        const baseState = setupState('creatureAction');
        const attacker = makeArenaObject('demon-cuirass-round-attacker', '0', PLAYER_ONE_START_ZONE, {
            life: 10,
        });
        const cuirass = makeDemonCuirassEquipmentObject(
            'demon-cuirass-3700-round',
            '1',
            PLAYER_ONE_START_ZONE,
        );
        const first = runCommand({
            core: [attacker, cuirass].reduce(withArenaObject, baseState.core),
            sys: baseState.sys,
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetPlayerId: '1',
            },
        });
        const sameRound = runCommand({
            core: {
                ...first.state.core,
                objects: {
                    ...first.state.core.objects,
                    [attacker.id]: { ...first.state.core.objects[attacker.id], actionReady: true },
                },
            },
            sys: first.state.sys,
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetPlayerId: '1',
            },
        });
        const nextRoundCore = reduceEvent(first.state.core, {
            type: MAGE_WARS_EVENTS.TURN_ADVANCED,
            payload: {
                fromPlayerId: '0',
                toPlayerId: '0',
                turnNumber: first.state.core.turnNumber + 1,
            },
            sourceCommandType: 'test',
            timestamp: 1,
        });
        const nextRound = runCommand({
            core: {
                ...nextRoundCore,
                objects: {
                    ...nextRoundCore.objects,
                    [attacker.id]: { ...nextRoundCore.objects[attacker.id], actionReady: true },
                },
            },
            sys: sameRound.state.sys,
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetPlayerId: '1',
            },
        });

        expect(first.events.filter((event) => event.type === MAGE_WARS_EVENTS.DAMAGE_BARRIER_TRIGGERED)).toHaveLength(1);
        expect(sameRound.events.filter((event) => event.type === MAGE_WARS_EVENTS.DAMAGE_BARRIER_TRIGGERED)).toHaveLength(0);
        expect(nextRound.events.filter((event) => event.type === MAGE_WARS_EVENTS.DAMAGE_BARRIER_TRIGGERED)).toHaveLength(1);
    });

    it('binds an attack spell when Elemental Staff is cast without mixing it into the discard pile', () => {
        const planningState = setupState('planning');
        const wizardState = {
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.WIZARD_APPRENTICE),
            sys: planningState.sys,
        };
        const planned = runCommand(wizardState, planCommand([3716]));
        const cast = runCommand({
            core: planned.state.core,
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: 3716,
                manaCost: 5,
                targetPlayerId: '0',
                boundSpellCardId: 1704,
            },
        });

        const staff = Object.values(cast.state.core.objects).find((object) => object.sourceSpellCardId === 3716);
        expect(planned.success).toBe(true);
        expect(cast.success).toBe(true);
        expect(staff).toMatchObject({
            kind: 'equipment',
            anchoredToPlayerId: '0',
            boundSpellCardId: 1704,
        });
        expect(cast.state.core.players['0'].discardSpellCardIds).toEqual([3716]);
        expect(cast.state.core.players['0'].discardSpellCardIds).not.toContain(1704);
    });

    it('allows Elemental Staff to enter play without a binding', () => {
        const planningState = setupState('planning');
        const wizardState = {
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.WIZARD_APPRENTICE),
            sys: planningState.sys,
        };
        const planned = runCommand(wizardState, planCommand([3716]));
        const cast = runCommand({
            core: planned.state.core,
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: 3716,
                manaCost: 5,
                targetPlayerId: '0',
            },
        });

        const staff = Object.values(cast.state.core.objects).find((object) => object.sourceSpellCardId === 3716);
        expect(cast.success).toBe(true);
        expect(staff?.boundSpellCardId).toBeUndefined();
    });

    it('replaces Elemental Staff binding as a quick spell and charges exactly three mana', () => {
        const baseState = setupState('finalQuickcast');
        const wizardCore = withPlayerMage(baseState.core, '0', MAGE_IDS.WIZARD_APPRENTICE);
        const staff = makeArenaObject('elemental-staff-0', '0', PLAYER_ZERO_START_ZONE, {
            kind: 'equipment',
            sourceSpellCardId: 3716,
            sourceObjectId: 'spell-card-3716',
            name: '元素魔杖',
            actionReady: false,
            attackOrTraitLine: '法术绑定',
            rulesText: '你可以从你的法术书中绑定一个非史诗攻击类法术到元素魔杖上。',
            anchoredToPlayerId: '0',
            boundSpellCardId: 1704,
        });
        const core = withArenaObject({
            ...wizardCore,
            players: {
                ...wizardCore.players,
                '0': {
                    ...wizardCore.players['0'],
                    mana: 10,
                    quickcastReady: true,
                    discardSpellCardIds: [],
                },
            },
        }, staff);
        const replaced = runCommand({ core, sys: baseState.sys }, {
            type: MAGE_WARS_COMMANDS.USE_ARENA_OBJECT_ABILITY,
            playerId: '0',
            payload: {
                objectId: staff.id,
                abilityId: MAGE_WARS_OBJECT_ABILITY_IDS.ELEMENTAL_STAFF_BIND,
                manaCost: 3,
                boundSpellCardId: 1705,
            },
        });

        expect(replaced.success).toBe(true);
        expect(replaced.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_ABILITY_RESOLVED,
                payload: expect.objectContaining({
                    abilityId: MAGE_WARS_OBJECT_ABILITY_IDS.ELEMENTAL_STAFF_BIND,
                    boundSpellCardId: 1705,
                    manaCost: 3,
                    actionTrack: 'quickcast',
                }),
            }),
        ]));
        expect(replaced.state.core.objects[staff.id].boundSpellCardId).toBe(1705);
        expect(replaced.state.core.players['0'].mana).toBe(7);
        expect(replaced.state.core.players['0'].quickcastReady).toBe(false);
        expect(replaced.state.core.players['0'].discardSpellCardIds).toEqual([]);
    });

    it('rejects Elemental Staff binding for non-attack spells and outside the quickcast phase', () => {
        const baseState = setupState('creatureAction');
        const wizardCore = withPlayerMage(baseState.core, '0', MAGE_IDS.WIZARD_APPRENTICE);
        const staff = makeArenaObject('elemental-staff-invalid', '0', PLAYER_ZERO_START_ZONE, {
            kind: 'equipment',
            sourceSpellCardId: 3716,
            sourceObjectId: 'spell-card-3716',
            name: '元素魔杖',
            actionReady: false,
            anchoredToPlayerId: '0',
            boundSpellCardId: 1704,
        });
        const state = {
            core: withArenaObject({
                ...wizardCore,
                players: {
                    ...wizardCore.players,
                    '0': { ...wizardCore.players['0'], mana: 10, quickcastReady: true },
                },
            }, staff),
            sys: baseState.sys,
        };
        const command = {
            type: MAGE_WARS_COMMANDS.USE_ARENA_OBJECT_ABILITY,
            playerId: '0',
            payload: {
                objectId: staff.id,
                abilityId: MAGE_WARS_OBJECT_ABILITY_IDS.ELEMENTAL_STAFF_BIND,
                manaCost: 3,
                boundSpellCardId: 1806,
            },
        } satisfies MageWarsCommand;

        expect(validateCommand(state, command)).toBe('wrongPhase');
        expect(validateCommand({
            ...state,
            sys: { ...state.sys, phase: 'finalQuickcast' },
        }, command)).toBe('invalidBoundSpell');
        expect(validateCommand({
            ...state,
            sys: { ...state.sys, phase: 'finalQuickcast' },
            core: {
                ...state.core,
                players: {
                    ...state.core.players,
                    '0': { ...state.core.players['0'], mana: 2 },
                },
            },
        }, {
            ...command,
            payload: { ...command.payload, boundSpellCardId: 1705 },
        })).toBe('insufficientMana');
        expect(validateCommand({
            ...state,
            sys: { ...state.sys, phase: 'finalQuickcast' },
        }, {
            ...command,
            payload: { ...command.payload, objectId: 'not-my-staff', boundSpellCardId: 1705 },
        })).toBe('invalidArenaObjectAbilitySource');
        expect(validateCommand({
            ...state,
            sys: { ...state.sys, phase: 'finalQuickcast' },
        }, {
            ...command,
            payload: { ...command.payload, boundSpellCardId: 1704 },
        })).toBe('sameBoundSpell');
    });
});
