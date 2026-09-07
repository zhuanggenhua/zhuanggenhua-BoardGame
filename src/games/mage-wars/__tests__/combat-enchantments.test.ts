import { describe, expect, it } from 'vitest';
import { FLOW_COMMANDS } from '../../../engine/systems/FlowSystem';
import type { MatchState } from '../../../engine/types';
import { MageWarsDomain, MAGE_WARS_COMMANDS } from '../domain';
import { MAGE_WARS_EVENTS } from '../domain/events';
import { resolveMageWarsObjectAttackEvents } from '../domain/execute';
import { ARENA_ZONE_IDS, MAGE_IDS } from '../domain/ids';
import type { MageWarsCore } from '../domain/types';
import {
    fixedRandom,
    makeArenaObject,
    makeVampiricEnchantmentObject,
    makeVisibleEnchantmentObject,
    planCommand,
    PLAYER_ZERO_START_ZONE,
    runCommand,
    setupState,
    withArenaObject,
    withArenaObjectDisplayText,
    withCurrentPlayer,
    withPlayerMage,
} from './helpers/domainFlowHarness';

describe('mage-wars combat enchantments', () => {
    it('lets Call of the Wild grant friendly animal melee dice until the round ends', () => {
        const callOfTheWildSpellId = 3417;
        const planningState = setupState('planning');
        const casterCore = withPlayerMage(planningState.core, '0', MAGE_IDS.BEASTMASTER_APPRENTICE);
        const friendlyWolf = makeArenaObject('wolf-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2819,
            sourceObjectId: 'spell-card-2819',
            name: '丛林灰狼',
            typeLine: '生物 / 动物、犬科',
            attackOrTraitLine: '噬咬：快速近战 3 骰',
        });
        const friendlyArcherAnimal = makeArenaObject('archer-animal-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2816,
            sourceObjectId: 'spell-card-2816',
            name: '动物射手',
            typeLine: '生物 / 动物',
            attackOrTraitLine: '短弓：快速远程 `0-1` 2 骰',
        });
        const friendlyNonAnimal = makeArenaObject('cleric-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2811,
            sourceObjectId: 'spell-card-2811',
            name: '阿希拉牧师',
            typeLine: '生物 / 牧师',
            attackOrTraitLine: '权杖：快速近战 2 骰',
        });
        const enemyWolf = makeArenaObject('wolf-1', '1', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2819,
            sourceObjectId: 'spell-card-2819',
            name: '敌方丛林灰狼',
            typeLine: '生物 / 动物、犬科',
            attackOrTraitLine: '噬咬：快速近战 3 骰',
        });
        const target = makeArenaObject('target-1', '1', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2819,
            sourceObjectId: 'spell-card-2819',
            name: '目标丛林灰狼',
            life: 30,
            attackOrTraitLine: '噬咬：快速近战 3 骰',
        });
        const planned = runCommand({
            core: withArenaObject(
                withArenaObject(
                    withArenaObject(
                        withArenaObject(
                            withArenaObject(casterCore, friendlyWolf),
                            friendlyArcherAnimal,
                        ),
                        friendlyNonAnimal,
                    ),
                    enemyWolf,
                ),
                target,
            ),
            sys: planningState.sys,
        }, planCommand([callOfTheWildSpellId]));
        const readyToCast: MatchState<MageWarsCore> = {
            core: planned.state.core,
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        };

        const cast = runCommand(readyToCast, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: callOfTheWildSpellId,
                manaCost: 4,
            },
        });

        expect(cast.success).toBe(true);
        expect(cast.events.filter((event) => (
            event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_TEMPORARY_TRAITS_GAINED
        ))).toHaveLength(2);
        expect(cast.state.core.objects[friendlyWolf.id].temporaryTraits).toMatchObject({
            meleeDiceModifier: 1,
        });
        expect(cast.state.core.objects[friendlyArcherAnimal.id].temporaryTraits).toMatchObject({
            meleeDiceModifier: 1,
        });
        expect(cast.state.core.objects[friendlyNonAnimal.id].temporaryTraits).toBeUndefined();
        expect(cast.state.core.objects[enemyWolf.id].temporaryTraits).toBeUndefined();

        const creatureActionState: MatchState<MageWarsCore> = {
            core: { ...cast.state.core, phaseReadyPlayerIds: [] },
            sys: { ...cast.state.sys, phase: 'creatureAction' },
        };
        const meleeAttack = runCommand(creatureActionState, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: friendlyWolf.id,
                attackProfileId: 'attack-0',
                targetObjectId: target.id,
            },
        });
        const meleeAttackEvent = meleeAttack.events.find((event) => (
            event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED
        ));

        expect(meleeAttack.success).toBe(true);
        expect(meleeAttackEvent).toMatchObject({
            payload: {
                attackerObjectId: friendlyWolf.id,
                targetObjectId: target.id,
                diceResults: [3, 3, 3, 3],
                meleeDiceModifier: 1,
                baseDamage: 12,
            },
        });

        const rangedAttack = runCommand({
            core: {
                ...cast.state.core,
                objects: {
                    ...cast.state.core.objects,
                    [friendlyArcherAnimal.id]: {
                        ...cast.state.core.objects[friendlyArcherAnimal.id],
                        actionReady: true,
                    },
                },
            },
            sys: { ...cast.state.sys, phase: 'creatureAction' },
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: friendlyArcherAnimal.id,
                attackProfileId: 'attack-0',
                targetObjectId: target.id,
            },
        });
        const rangedAttackEvent = rangedAttack.events.find((event) => (
            event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED
        ));

        expect(rangedAttack.success).toBe(true);
        expect(rangedAttackEvent).toMatchObject({
            payload: {
                attackerObjectId: friendlyArcherAnimal.id,
                diceResults: [3, 3],
                baseDamage: 6,
            },
        });
        expect(rangedAttackEvent?.payload).not.toHaveProperty('meleeDiceModifier');

        const advanced = runCommand({
            core: { ...cast.state.core, phaseReadyPlayerIds: ['1'] },
            sys: { ...cast.state.sys, phase: 'creatureAction' },
        }, {
            type: FLOW_COMMANDS.ADVANCE_PHASE,
            playerId: '0',
            payload: {},
        });

        expect(advanced.success).toBe(true);
        expect(advanced.state.core.objects[friendlyWolf.id].temporaryTraits).toMatchObject({
            meleeDiceModifier: 1,
            meleeDiceModifierUntilRoundNumber: cast.state.core.turnNumber,
        });
        expect(advanced.state.core.objects[friendlyArcherAnimal.id].temporaryTraits).toMatchObject({
            meleeDiceModifier: 1,
            meleeDiceModifierUntilRoundNumber: cast.state.core.turnNumber,
        });
    });

    it('lets Bloodstrike grant vampiric pierce to the target creature next melee attack', () => {
        const bloodstrikeSpellId = 3404;
        const planningState = setupState('planning');
        const warlockCore = withPlayerMage(planningState.core, '0', MAGE_IDS.WARLOCK_APPRENTICE);
        const casterCore: MageWarsCore = {
            ...warlockCore,
            players: {
                ...warlockCore.players,
                '0': {
                    ...warlockCore.players['0'],
                    mana: 20,
                    damage: 7,
                },
            },
        };
        const attacker = makeArenaObject('blood-cat-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2906,
            sourceObjectId: 'spell-card-2906',
            name: '野性山猫',
            attackOrTraitLine: '利爪：快速近战 2 骰；短弓：快速远程 `0-1` 2 骰',
        });
        const armoredTarget = makeArenaObject('armored-target-1', '1', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2819,
            sourceObjectId: 'spell-card-2819',
            name: '护甲目标',
            life: 20,
            armor: 2,
            attackOrTraitLine: '噬咬：快速近战 3 骰',
        });
        const planned = runCommand({
            core: withArenaObject(withArenaObject(casterCore, attacker), armoredTarget),
            sys: planningState.sys,
        }, planCommand([bloodstrikeSpellId]));
        const readyToCast: MatchState<MageWarsCore> = {
            core: planned.state.core,
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        };

        const cast = runCommand(readyToCast, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: bloodstrikeSpellId,
                manaCost: 3,
                targetObjectId: attacker.id,
            },
        });

        expect(planned.success).toBe(true);
        expect(cast.success).toBe(true);
        expect(cast.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_TEMPORARY_TRAITS_GAINED,
                payload: expect.objectContaining({
                    objectId: attacker.id,
                    spellCardId: bloodstrikeSpellId,
                    vampiricNextMelee: true,
                    nextMeleePierceModifier: 1,
                }),
            }),
        ]));
        expect(cast.state.core.objects[attacker.id].temporaryTraits).toMatchObject({
            vampiricNextMelee: true,
            nextMeleePierceModifier: 1,
        });
        const rawAttackEvents = resolveMageWarsObjectAttackEvents({
            state: {
                core: cast.state.core,
                sys: { ...cast.state.sys, phase: 'creatureAction' },
            },
            sourceCommandType: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            timestamp: 0,
            random: fixedRandom,
            attackerObjectId: attacker.id,
            attackProfileId: 'attack-0',
            targetObjectId: armoredTarget.id,
        });
        const rawAttackEventTypes = rawAttackEvents.map((event) => event.type);

        expect(rawAttackEventTypes).toContain(MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_TEMPORARY_TRAITS_CLEAR_AVAILABLE);
        expect(rawAttackEventTypes).not.toContain(MAGE_WARS_EVENTS.ARENA_OBJECT_TEMPORARY_TRAITS_CLEARED);

        const attacked = runCommand({
            core: cast.state.core,
            sys: { ...cast.state.sys, phase: 'creatureAction' },
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: armoredTarget.id,
            },
        });
        const attackEvent = attacked.events.find((event) => (
            event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED
        ));
        const damageEvent = attacked.events.find((event) => event.type === 'DAMAGE_DEALT');
        const healingEvent = attacked.events.find((event) => (
            event.type === MAGE_WARS_EVENTS.SPELL_HEALING_ROLLED
        ));

        expect(attacked.success).toBe(true);
        expect(attackEvent).toMatchObject({
            payload: {
                attackerObjectId: attacker.id,
                targetObjectId: armoredTarget.id,
                diceResults: [3, 3],
                baseDamage: 6,
                vampiricNextMelee: true,
                pierceModifier: 1,
            },
        });
        expect(damageEvent).toMatchObject({
            payload: {
                targetId: armoredTarget.id,
                actualDamage: 5,
            },
        });
        expect(healingEvent).toMatchObject({
            payload: {
                playerId: '0',
                spellCardId: bloodstrikeSpellId,
                sourceAbilityId: 'mw.spell.3404',
                targetPlayerId: '0',
                diceResults: [],
                healing: 5,
                actualHealing: 5,
            },
        });
        expect(attacked.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_TEMPORARY_TRAITS_CLEARED,
                payload: expect.objectContaining({
                    objectId: attacker.id,
                    traitIds: expect.arrayContaining(['vampiric', 'pierce']),
                    sourceAbilityId: 'mw.spell.3404',
                }),
            }),
        ]));
        expect(attacked.state.core.objects[attacker.id].temporaryTraits).toBeUndefined();
        expect(attacked.state.core.players['0'].damage).toBe(2);
    });

    it('keeps Bloodstrike through ranged attacks and clears it at creature action end', () => {
        const bloodstrikeSpellId = 3404;
        const planningState = setupState('planning');
        const warlockCore = withPlayerMage(planningState.core, '0', MAGE_IDS.WARLOCK_APPRENTICE);
        const casterCore: MageWarsCore = {
            ...warlockCore,
            players: {
                ...warlockCore.players,
                '0': {
                    ...warlockCore.players['0'],
                    mana: 20,
                    damage: 4,
                },
            },
        };
        const attacker = makeArenaObject('blood-archer-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2816,
            sourceObjectId: 'spell-card-2816',
            name: '血击射手',
            attackOrTraitLine: '短刀：快速近战 1 骰；长弓：快速远程 `0-1` 2 骰',
        });
        const rangedTarget = makeArenaObject('ranged-target-1', '1', ARENA_ZONE_IDS.A2, {
            sourceSpellCardId: 2819,
            sourceObjectId: 'spell-card-2819',
            name: '远程目标',
            life: 20,
            armor: 2,
        });
        const planned = runCommand({
            core: withArenaObject(withArenaObject(casterCore, attacker), rangedTarget),
            sys: planningState.sys,
        }, planCommand([bloodstrikeSpellId]));
        const cast = runCommand({
            core: planned.state.core,
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: bloodstrikeSpellId,
                manaCost: 3,
                targetObjectId: attacker.id,
            },
        });

        expect(cast.success).toBe(true);
        const rangedAttack = runCommand({
            core: { ...cast.state.core, phaseReadyPlayerIds: [] },
            sys: { ...cast.state.sys, phase: 'creatureAction' },
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-1',
                targetObjectId: rangedTarget.id,
            },
        });
        const rangedAttackEvent = rangedAttack.events.find((event) => (
            event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED
        ));

        expect(rangedAttack.success).toBe(true);
        expect(rangedAttackEvent).toMatchObject({
            payload: {
                attackerObjectId: attacker.id,
                diceResults: [3, 3],
                baseDamage: 6,
            },
        });
        expect(rangedAttackEvent?.payload).not.toHaveProperty('vampiricNextMelee');
        expect(rangedAttackEvent?.payload).not.toHaveProperty('pierceModifier');
        expect(rangedAttack.events.map((event) => event.type)).not.toContain(MAGE_WARS_EVENTS.SPELL_HEALING_ROLLED);
        expect(rangedAttack.state.core.objects[attacker.id].temporaryTraits).toMatchObject({
            vampiricNextMelee: true,
            nextMeleePierceModifier: 1,
        });

        const advanced = runCommand(rangedAttack.state, {
            type: FLOW_COMMANDS.ADVANCE_PHASE,
            playerId: '0',
            payload: {},
        });

        expect(advanced.success).toBe(true);
        expect(advanced.state.core.objects[attacker.id].temporaryTraits).toBeUndefined();
        expect(advanced.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_TEMPORARY_TRAITS_CLEARED,
                payload: expect.objectContaining({
                    objectId: attacker.id,
                    traitIds: expect.arrayContaining(['vampiric', 'pierce']),
                    sourceAbilityId: 'mw.spell.3404',
                }),
            }),
        ]));
    });

    it('uses the structured Bloodthirst enchantment without reading its display text', () => {
        const spellCardId = 1910;
        const planningState = setupState('planning');
        const warlockCore = withPlayerMage(planningState.core, '0', MAGE_IDS.WARLOCK_APPRENTICE);
        const casterCore: MageWarsCore = {
            ...warlockCore,
            players: {
                ...warlockCore.players,
                '0': {
                    ...warlockCore.players['0'],
                    mana: 20,
                    damage: 7,
                },
            },
        };
        const attacker = makeArenaObject('vampiric-cat-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2906,
            sourceObjectId: 'spell-card-2906',
            name: '野性山猫',
            combatProfilesSource: 'config',
            attackOrTraitLine: undefined,
        });
        const armoredTarget = makeArenaObject('vampiric-target-1', '1', PLAYER_ZERO_START_ZONE, {
            life: 20,
            armor: 2,
        });
        const planned = runCommand({
            core: withArenaObject(withArenaObject(casterCore, attacker), armoredTarget),
            sys: planningState.sys,
        }, planCommand([spellCardId]));
        const cast = runCommand({
            core: planned.state.core,
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId,
                manaCost: 6,
                targetObjectId: attacker.id,
            },
        });
        const enchantment = Object.values(cast.state.core.objects).find((object) => (
            object.sourceSpellCardId === spellCardId && object.anchoredToObjectId === attacker.id
        ));
        const castCoreWithoutDisplayText = enchantment
            ? withArenaObjectDisplayText(cast.state.core, enchantment.id, '')
            : cast.state.core;
        const attacked = runCommand({
            core: castCoreWithoutDisplayText,
            sys: { ...cast.state.sys, phase: 'creatureAction' },
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: armoredTarget.id,
            },
        });
        const healingEvents = attacked.events.filter((event) => (
            event.type === MAGE_WARS_EVENTS.SPELL_HEALING_ROLLED
        ));

        expect(cast.success).toBe(true);
        expect(enchantment).toMatchObject({
            sourceSpellCardId: spellCardId,
            anchoredToObjectId: attacker.id,
            attackOrTraitLine: undefined,
            rulesText: '本生物的近战攻击获得吸血特性。',
        });
        expect(castCoreWithoutDisplayText.objects[enchantment!.id]).toMatchObject({
            attackOrTraitLine: undefined,
            rulesText: '',
        });
        expect(attacked.success).toBe(true);
        expect(attacked.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED,
                payload: expect.objectContaining({
                    attackerObjectId: attacker.id,
                    targetObjectId: armoredTarget.id,
                    diceResults: [3, 3],
                    baseDamage: 6,
                    vampiric: true,
                }),
            }),
            expect.objectContaining({
                type: 'DAMAGE_DEALT',
                payload: expect.objectContaining({
                    targetId: armoredTarget.id,
                    actualDamage: 4,
                }),
            }),
        ]));
        expect(healingEvents).toHaveLength(1);
        expect(healingEvents[0]).toMatchObject({
            payload: {
                spellCardId,
                sourceAbilityId: 'mw.spell.1910',
                healing: 4,
                actualHealing: 4,
            },
        });
        expect(attacked.state.core.players['0'].damage).toBe(3);
        expect(attacked.state.core.objects[enchantment!.id]).toMatchObject({
            sourceSpellCardId: spellCardId,
            anchoredToObjectId: attacker.id,
        });
    });

    it('casts Saintly Territory as a revealed zone-anchored Aegis enchantment', () => {
        const baseState = setupState('planning');
        const coreWithMage = withPlayerMage(
            baseState.core,
            '0',
            MAGE_IDS.PRIESTESS_APPRENTICE,
        );
        const planned = runCommand({
            core: coreWithMage,
            sys: baseState.sys,
        }, planCommand([1913]));
        const cast = runCommand({
            core: planned.state.core,
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: 1913,
                manaCost: 6,
                targetZoneId: PLAYER_ZERO_START_ZONE,
            },
        });
        const enchantment = Object.values(cast.state.core.objects).find((object) => (
            object.sourceSpellCardId === 1913
        ));

        expect(planned.success).toBe(true);
        expect(cast.success).toBe(true);
        expect(enchantment).toMatchObject({
            kind: 'enchantment',
            ownerId: '0',
            revealed: true,
            zoneId: PLAYER_ZERO_START_ZONE,
            anchoredToZoneId: PLAYER_ZERO_START_ZONE,
        });
        expect(enchantment?.anchoredToObjectId).toBeUndefined();
    });

    it('applies area Aegis only to friendly living creatures in the anchored zone', () => {
        const baseState = setupState('planning');
        const coreWithMage = withPlayerMage(
            baseState.core,
            '0',
            MAGE_IDS.PRIESTESS_APPRENTICE,
        );
        const planned = runCommand({
            core: coreWithMage,
            sys: baseState.sys,
        }, planCommand([1913]));
        const friendlyTarget = makeArenaObject('area-aegis-friendly-0', '0', PLAYER_ZERO_START_ZONE, { life: 20 });
        const cast = runCommand({
            core: withArenaObject(planned.state.core, friendlyTarget),
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: 1913,
                manaCost: 6,
                targetZoneId: PLAYER_ZERO_START_ZONE,
            },
        });
        const areaState = {
            core: withCurrentPlayer(cast.state.core, '1'),
            sys: { ...cast.state.sys, phase: 'creatureAction' as const },
        };
        const attacker = makeArenaObject('area-aegis-attacker-1', '1', PLAYER_ZERO_START_ZONE, {
            attackOrTraitLine: '利爪：快速近战 3 骰',
        });
        const attacked = runCommand({
            core: withArenaObject(areaState.core, attacker),
            sys: areaState.sys,
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '1',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: friendlyTarget.id,
            },
        });
        const attackEvent = attacked.events.find((event) => (
            event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED
        ));

        expect(cast.success).toBe(true);
        expect(attacked.success).toBe(true);
        expect(attackEvent).toMatchObject({
            payload: {
                targetObjectId: friendlyTarget.id,
                diceResults: [3, 3],
                baseDamage: 6,
            },
        });
    });

    it('does not apply a zone Aegis source to enemies or creatures outside that zone', () => {
        const baseState = setupState('creatureAction');
        const enemyTarget = makeArenaObject('area-aegis-enemy-1', '1', PLAYER_ZERO_START_ZONE, { life: 20 });
        const outsideTarget = makeArenaObject('area-aegis-outside-1', '1', ARENA_ZONE_IDS.B1, { life: 20 });
        const area = makeVisibleEnchantmentObject('area-aegis-1913', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 1913,
            sourceObjectId: 'spell-1913',
            name: '圣佑领地',
            typeLine: '结界 / 加护、庇护',
            rulesText: undefined,
            anchoredToZoneId: PLAYER_ZERO_START_ZONE,
        });
        const attacker = makeArenaObject('area-aegis-enemy-attacker-0', '0', PLAYER_ZERO_START_ZONE, {
            attackOrTraitLine: '利爪：快速近战 3 骰',
        });
        const enemyAttack = runCommand({
            core: withArenaObject(
                withArenaObject(
                    withArenaObject(withArenaObject(baseState.core, attacker), enemyTarget),
                    outsideTarget,
                ),
                area,
            ),
            sys: baseState.sys,
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: enemyTarget.id,
            },
        });
        const enemyAttackEvent = enemyAttack.events.find((event) => (
            event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED
        ));
        const outsideAttacker = makeArenaObject('area-aegis-outside-attacker-0', '0', ARENA_ZONE_IDS.B1, {
            attackOrTraitLine: '利爪：快速近战 3 骰',
        });
        const outsideAttack = runCommand({
            core: withArenaObject(enemyAttack.state.core, outsideAttacker),
            sys: enemyAttack.state.sys,
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: outsideAttacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: outsideTarget.id,
            },
        });
        const outsideAttackEvent = outsideAttack.events.find((event) => (
            event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED
        ));

        expect(enemyAttack.success).toBe(true);
        expect(enemyAttackEvent).toMatchObject({
            payload: { diceResults: [3, 3, 3], baseDamage: 9 },
        });
        expect(outsideAttack.success).toBe(true);
        expect(outsideAttackEvent).toMatchObject({
            payload: { diceResults: [3, 3, 3], baseDamage: 9 },
        });
    });

    it('consumes a friendly zone Aegis source for attack spells', () => {
        const spellCardId = 1702;
        const baseState = setupState('planning');
        const coreWithMage = withPlayerMage(
            baseState.core,
            '0',
            MAGE_IDS.WARLOCK_APPRENTICE,
        );
        const planned = runCommand({
            core: coreWithMage,
            sys: baseState.sys,
        }, planCommand([spellCardId]));
        const target = makeArenaObject('area-aegis-spell-target-1', '1', PLAYER_ZERO_START_ZONE, { life: 20 });
        const area = makeVisibleEnchantmentObject('area-aegis-spell-1913', '1', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 1913,
            sourceObjectId: 'spell-1913',
            name: '圣佑领地',
            anchoredToZoneId: PLAYER_ZERO_START_ZONE,
        });
        const cast = runCommand({
            core: withArenaObject(withArenaObject(planned.state.core, target), area),
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId,
                manaCost: 5,
                targetObjectId: target.id,
            },
        });
        const attackEvent = cast.events.find((event) => (
            event.type === MAGE_WARS_EVENTS.SPELL_ATTACK_ROLLED
        ));

        expect(cast.success).toBe(true);
        expect(attackEvent).toMatchObject({
            payload: {
                spellCardId,
                targetObjectId: target.id,
                diceResults: [3, 3, 3],
                baseDamage: 9,
            },
        });
    });

    it('removes area Aegis after a friendly creature moves out of the anchored zone', () => {
        const baseState = setupState('creatureAction');
        const target = makeArenaObject('area-aegis-moved-target-0', '0', PLAYER_ZERO_START_ZONE, { life: 20 });
        const area = makeVisibleEnchantmentObject('area-aegis-moved-1913', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 1913,
            sourceObjectId: 'spell-1913',
            name: '圣佑领地',
            anchoredToZoneId: PLAYER_ZERO_START_ZONE,
        });
        const moved = runCommand({
            core: withArenaObject(withArenaObject(baseState.core, target), area),
            sys: baseState.sys,
        }, {
            type: MAGE_WARS_COMMANDS.MOVE_ARENA_OBJECT,
            playerId: '0',
            payload: {
                objectId: target.id,
                toZoneId: ARENA_ZONE_IDS.A2,
            },
        });
        const attacker = makeArenaObject('area-aegis-moved-attacker-1', '1', ARENA_ZONE_IDS.A2, {
            attackOrTraitLine: '利爪：快速近战 3 骰',
        });
        const attacked = runCommand({
            core: withCurrentPlayer(withArenaObject(moved.state.core, attacker), '1'),
            sys: moved.state.sys,
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '1',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: target.id,
            },
        });
        const attackEvent = attacked.events.find((event) => (
            event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED
        ));

        expect(moved.success).toBe(true);
        expect(moved.state.core.objects[target.id]?.zoneId).toBe(ARENA_ZONE_IDS.A2);
        expect(attacked.success).toBe(true);
        expect(attackEvent).toMatchObject({
            payload: { diceResults: [3, 3, 3], baseDamage: 9 },
        });
    });

    it('takes the highest value when area and attached Aegis sources overlap', () => {
        const baseState = setupState('creatureAction');
        const attacker = makeArenaObject('area-aegis-highest-attacker-0', '0', PLAYER_ZERO_START_ZONE, {
            attackOrTraitLine: '利爪：快速近战 3 骰',
        });
        const target = makeArenaObject('area-aegis-highest-target-1', '1', PLAYER_ZERO_START_ZONE, { life: 20 });
        const area = makeVisibleEnchantmentObject('area-aegis-highest-1913', '1', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 1913,
            sourceObjectId: 'spell-1913',
            name: '圣佑领地',
            anchoredToZoneId: PLAYER_ZERO_START_ZONE,
        });
        const attached = makeVisibleEnchantmentObject('area-aegis-highest-1813', '1', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 1813,
            sourceObjectId: 'spell-1813',
            name: '神力加护',
            anchoredToObjectId: target.id,
        });
        const attacked = runCommand({
            core: withArenaObject(
                withArenaObject(
                    withArenaObject(withArenaObject(baseState.core, attacker), target),
                    area,
                ),
                attached,
            ),
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
        expect(attackEvent).toMatchObject({
            payload: { diceResults: [3, 3], baseDamage: 6 },
        });
    });

    it('keeps area Aegis active when its display text is removed', () => {
        const baseState = setupState('creatureAction');
        const attacker = makeArenaObject('area-aegis-text-attacker-0', '0', PLAYER_ZERO_START_ZONE, {
            attackOrTraitLine: '利爪：快速近战 3 骰',
        });
        const target = makeArenaObject('area-aegis-text-target-1', '1', PLAYER_ZERO_START_ZONE, { life: 20 });
        let core = withArenaObject(withArenaObject(baseState.core, attacker), target);
        const area = makeVisibleEnchantmentObject('area-aegis-text-1913', '1', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 1913,
            sourceObjectId: 'spell-1913',
            name: '圣佑领地',
            rulesText: undefined,
            attackOrTraitLine: undefined,
            anchoredToZoneId: PLAYER_ZERO_START_ZONE,
        });
        core = withArenaObject(core, area);
        core = withArenaObjectDisplayText(core, area.id, '');

        const attacked = runCommand({ core, sys: baseState.sys }, {
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
        expect(attackEvent).toMatchObject({
            payload: { diceResults: [3, 3], baseDamage: 6 },
        });
    });

    it('uses the highest attached Aegis value once for object attacks after display text is removed', () => {
        const baseState = setupState('creatureAction');
        const attacker = makeArenaObject('aegis-attacker-0', '0', PLAYER_ZERO_START_ZONE, {
            attackOrTraitLine: '利爪：快速近战 3 骰',
        });
        const target = makeArenaObject('aegis-target-1', '1', PLAYER_ZERO_START_ZONE, {
            life: 20,
        });
        const aegis1813 = makeVisibleEnchantmentObject('aegis-1813', '1', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 1813,
            sourceObjectId: 'spell-1813',
            name: '神力加护',
            anchoredToObjectId: target.id,
        });
        const aegis1911 = makeVisibleEnchantmentObject('aegis-1911', '1', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 1911,
            sourceObjectId: 'spell-1911',
            name: '神力加护',
            anchoredToObjectId: target.id,
        });
        let core = withArenaObject(
            withArenaObject(
                withArenaObject(withArenaObject(baseState.core, attacker), target),
                aegis1813,
            ),
            aegis1911,
        );
        core = withArenaObjectDisplayText(core, aegis1813.id, '');
        core = withArenaObjectDisplayText(core, aegis1911.id, '');

        const attacked = runCommand({ core, sys: baseState.sys }, {
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
        expect(attackEvent).toMatchObject({
            payload: {
                attackerObjectId: attacker.id,
                targetObjectId: target.id,
                diceResults: [3, 3],
                baseDamage: 6,
            },
        });
    });

    it('keeps one attack die when Aegis reduces a one-die object attack', () => {
        const baseState = setupState('creatureAction');
        const attacker = makeArenaObject('aegis-min-attacker-0', '0', PLAYER_ZERO_START_ZONE, {
            attackOrTraitLine: '利爪：快速近战 1 骰',
        });
        const target = makeArenaObject('aegis-min-target-1', '1', PLAYER_ZERO_START_ZONE, {
            life: 20,
        });
        const aegis = makeVisibleEnchantmentObject('aegis-min-1813', '1', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 1813,
            sourceObjectId: 'spell-1813',
            anchoredToObjectId: target.id,
        });

        const attacked = runCommand({
            core: withArenaObject(withArenaObject(withArenaObject(baseState.core, attacker), target), aegis),
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
        expect(attackEvent).toMatchObject({
            payload: {
                diceResults: [3],
                baseDamage: 3,
            },
        });
    });

    it('applies Aegis to attack spells without reading the enchantment display text', () => {
        const spellCardId = 1702;
        const planningState = setupState('planning');
        const coreWithMage = withPlayerMage(
            planningState.core,
            '0',
            MAGE_IDS.WARLOCK_APPRENTICE,
        );
        const target = makeArenaObject('aegis-spell-target-1', '1', PLAYER_ZERO_START_ZONE, {
            life: 20,
        });
        const aegis = makeVisibleEnchantmentObject('aegis-spell-1813', '1', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 1813,
            sourceObjectId: 'spell-1813',
            anchoredToObjectId: target.id,
        });
        const planned = runCommand({
            core: withArenaObject(withArenaObject(coreWithMage, target), aegis),
            sys: planningState.sys,
        }, planCommand([spellCardId]));
        const coreWithoutDisplayText = withArenaObjectDisplayText(planned.state.core, aegis.id, '');
        const cast = runCommand({
            core: coreWithoutDisplayText,
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId,
                manaCost: 5,
                targetObjectId: target.id,
            },
        });
        const attackEvent = cast.events.find((event) => (
            event.type === MAGE_WARS_EVENTS.SPELL_ATTACK_ROLLED
        ));

        expect(cast.success).toBe(true);
        expect(attackEvent).toMatchObject({
            payload: {
                spellCardId,
                targetObjectId: target.id,
                diceResults: [3, 3, 3],
                baseDamage: 9,
            },
        });
    });

    it('keeps the damage-type immunity branch before Aegis dice reduction for attack spells', () => {
        const spellCardId = 1702;
        const planningState = setupState('planning');
        const coreWithMage = withPlayerMage(
            planningState.core,
            '0',
            MAGE_IDS.WARLOCK_APPRENTICE,
        );
        const target = makeArenaObject('aegis-immune-target-1', '1', PLAYER_ZERO_START_ZONE, {
            life: 20,
            attackOrTraitLine: '火焰免疫',
        });
        const aegis = makeVisibleEnchantmentObject('aegis-immune-1813', '1', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 1813,
            sourceObjectId: 'spell-1813',
            anchoredToObjectId: target.id,
        });
        const planned = runCommand({
            core: withArenaObject(withArenaObject(coreWithMage, target), aegis),
            sys: planningState.sys,
        }, planCommand([spellCardId]));
        const state = {
            core: planned.state.core,
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' as const },
        };
        const events = MageWarsDomain.execute(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId,
                manaCost: 5,
                targetObjectId: target.id,
            },
        }, fixedRandom);

        expect(events.map((event) => event.type)).toContain(MAGE_WARS_EVENTS.ATTACK_MISSED);
        expect(events.map((event) => event.type)).not.toContain(MAGE_WARS_EVENTS.SPELL_ATTACK_ROLLED);
    });

    it('does not apply a persistent vampiric enchantment to ranged attacks', () => {
        const attacker = makeArenaObject('vampiric-archer-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2816,
            sourceObjectId: 'spell-card-2816',
            name: '皇家箭手',
            combatProfilesSource: 'config',
            attackOrTraitLine: undefined,
        });
        const enchantment = makeVampiricEnchantmentObject(
            'vampiric-enchantment-0',
            '0',
            PLAYER_ZERO_START_ZONE,
            attacker.id,
        );
        const target = makeArenaObject('vampiric-ranged-target-1', '1', ARENA_ZONE_IDS.A2, {
            life: 20,
            armor: 2,
        });
        const base = setupState('creatureAction');
        const core = withArenaObject(
            withArenaObject(withArenaObject(base.core, attacker), enchantment),
            target,
        );
        const attacked = runCommand({ core, sys: base.sys }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: target.id,
            },
        });

        expect(attacked.success).toBe(true);
        expect(attacked.events).not.toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_HEALING_ROLLED,
            }),
        ]));
        expect(attacked.events.find((event) => event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED)?.payload)
            .not.toHaveProperty('vampiric');
        expect(attacked.state.core.objects[enchantment.id]).toBeDefined();
    });

    it('heals once from actual damage accumulated across a multi-strike melee attack', () => {
        const attacker = makeArenaObject('vampiric-hydra-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2901,
            sourceObjectId: 'spell-card-2901',
            name: '暗沼九头蛇',
            combatProfilesSource: 'config',
            attackOrTraitLine: undefined,
        });
        const enchantment = makeVampiricEnchantmentObject(
            'vampiric-enchantment-hydra',
            '0',
            PLAYER_ZERO_START_ZONE,
            attacker.id,
        );
        const target = makeArenaObject('vampiric-hydra-target-1', '1', PLAYER_ZERO_START_ZONE, {
            life: 40,
            armor: 2,
        });
        const base = setupState('creatureAction');
        const core: MageWarsCore = {
            ...withArenaObject(
                withArenaObject(withArenaObject(base.core, attacker), enchantment),
                target,
            ),
            players: {
                ...base.core.players,
                '0': {
                    ...base.core.players['0'],
                    damage: 20,
                },
            },
        };
        const rawAttackEvents = resolveMageWarsObjectAttackEvents({
            state: { core, sys: base.sys },
            sourceCommandType: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            timestamp: 0,
            random: fixedRandom,
            attackerObjectId: attacker.id,
            attackProfileId: 'attack-1',
            targetObjectId: target.id,
        });
        const rawAttackEventTypes = rawAttackEvents.map((event) => event.type);

        expect(rawAttackEventTypes).toContain(MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_VAMPIRIC_HEALING_AVAILABLE);
        expect(rawAttackEventTypes).not.toContain(MAGE_WARS_EVENTS.SPELL_HEALING_ROLLED);

        const attacked = runCommand({ core, sys: base.sys }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-1',
                targetObjectId: target.id,
            },
        });
        const healingEvents = attacked.events.filter((event) => (
            event.type === MAGE_WARS_EVENTS.SPELL_HEALING_ROLLED
        ));

        expect(attacked.success).toBe(true);
        expect(healingEvents).toHaveLength(1);
        expect(healingEvents[0]).toMatchObject({
            payload: {
                spellCardId: 1910,
                sourceAbilityId: 'mw.spell.1910',
                healing: 21,
                actualHealing: 20,
            },
        });
        expect(attacked.state.core.objects[target.id]).toMatchObject({ damage: 21 });
        expect(attacked.state.core.players['0'].damage).toBe(0);
        expect(attacked.state.core.objects[enchantment.id]).toBeDefined();
    });
});
