import { describe, expect, it } from 'vitest';
import { FLOW_COMMANDS } from '../../../engine/systems/FlowSystem';
import type { MatchState, RandomFn } from '../../../engine/types';
import { MAGE_WARS_COMMANDS } from '../domain';
import { MAGE_WARS_EVENTS } from '../domain/events';
import { reduceEvent } from '../domain/reducer';
import {
    ARENA_ZONE_IDS,
    MAGE_IDS,
    MAGE_WARS_OBJECT_ABILITY_IDS,
    STATUS_TOKEN_IDS,
} from '../domain/ids';
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
    withCurrentPlayer,
    withPlayerInZone,
    withPlayerMage,
} from './helpers/domainFlowHarness';

describe('mage-wars mage equipment', () => {
    it('casts Leather Gloves as mage-attached passive armor equipment', () => {
        const equipmentSpellId = 3702;
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.WARLOCK_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([equipmentSpellId]));
        const state: MatchState<MageWarsCore> = {
            core: withPlayerInZone(planned.state.core, '1', PLAYER_ZERO_START_ZONE),
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        };

        const equipped = runCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: equipmentSpellId,
                manaCost: 2,
                targetPlayerId: '0',
            },
        });

        const equipment = Object.values(equipped.state.core.objects)
            .find((object) => object.sourceSpellCardId === equipmentSpellId);

        expect(equipped.success).toBe(true);
        expect(equipped.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_CAST_RESOLVED,
                payload: expect.objectContaining({
                    spellCardId: equipmentSpellId,
                    manaCost: 2,
                    targetPlayerId: '0',
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_SUMMONED,
                payload: expect.objectContaining({
                    object: expect.objectContaining({
                        kind: 'equipment',
                        sourceSpellCardId: equipmentSpellId,
                        name: '皮革手套',
                        ownerId: '0',
                        zoneId: PLAYER_ZERO_START_ZONE,
                        anchoredToPlayerId: '0',
                        attackOrTraitLine: '法师获得护甲+1',
                    }),
                }),
            }),
        ]));
        expect(equipment).toMatchObject({
            kind: 'equipment',
            ownerId: '0',
            name: '皮革手套',
            zoneId: PLAYER_ZERO_START_ZONE,
            life: 1,
            armor: 0,
            anchoredToPlayerId: '0',
        });
        expect(equipped.state.core.players['0']).toMatchObject({
            mana: state.core.players['0'].mana - 2,
            quickcastReady: false,
            actionReady: true,
        });
        expect(equipped.state.core.players['0'].preparedSpellCardIds).toEqual([]);
        expect(equipped.state.core.players['0'].discardSpellCardIds).toEqual([equipmentSpellId]);
    });

    it('casts Dragon Scale Hauberk as mage-attached passive armor equipment with fire resistance text', () => {
        const equipmentSpellId = 3703;
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.WIZARD_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([equipmentSpellId]));
        const state: MatchState<MageWarsCore> = {
            core: withPlayerInZone(planned.state.core, '1', PLAYER_ZERO_START_ZONE),
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        };

        const equipped = runCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: equipmentSpellId,
                manaCost: 6,
                targetPlayerId: '0',
            },
        });

        const equipment = Object.values(equipped.state.core.objects)
            .find((object) => object.sourceSpellCardId === equipmentSpellId);

        expect(equipped.success).toBe(true);
        expect(equipped.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_CAST_RESOLVED,
                payload: expect.objectContaining({
                    spellCardId: equipmentSpellId,
                    manaCost: 6,
                    targetPlayerId: '0',
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_SUMMONED,
                payload: expect.objectContaining({
                    object: expect.objectContaining({
                        kind: 'equipment',
                        sourceSpellCardId: equipmentSpellId,
                        name: '龙鳞锁甲',
                        ownerId: '0',
                        zoneId: PLAYER_ZERO_START_ZONE,
                        anchoredToPlayerId: '0',
                        attackOrTraitLine: '法师获得护甲+2和火焰-2特性',
                    }),
                }),
            }),
        ]));
        expect(equipment).toMatchObject({
            kind: 'equipment',
            ownerId: '0',
            name: '龙鳞锁甲',
            zoneId: PLAYER_ZERO_START_ZONE,
            life: 1,
            armor: 0,
            anchoredToPlayerId: '0',
            attackOrTraitLine: '法师获得护甲+2和火焰-2特性',
        });
        expect(equipped.state.core.players['0']).toMatchObject({
            mana: state.core.players['0'].mana - 6,
            quickcastReady: false,
            actionReady: true,
        });
        expect(equipped.state.core.players['0'].preparedSpellCardIds).toEqual([]);
        expect(equipped.state.core.players['0'].discardSpellCardIds).toEqual([equipmentSpellId]);
    });

    it('keeps mage-attached passive armor equipment with the mage and reduces incoming attack damage', () => {
        const equipmentSpellId = 3702;
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.WARLOCK_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([equipmentSpellId]));
        const equipped = runCommand({
            core: withPlayerInZone(planned.state.core, '1', PLAYER_ZERO_START_ZONE),
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: equipmentSpellId,
                manaCost: 2,
                targetPlayerId: '0',
            },
        });
        const equipmentId = Object.values(equipped.state.core.objects)
            .find((object) => object.sourceSpellCardId === equipmentSpellId)?.id;
        expect(equipmentId).toBeDefined();

        const moved = runCommand({
            core: equipped.state.core,
            sys: { ...equipped.state.sys, phase: 'creatureAction' },
        }, {
            type: MAGE_WARS_COMMANDS.MOVE_MAGE,
            playerId: '0',
            payload: { toZoneId: ARENA_ZONE_IDS.A2 },
        });

        expect(moved.success).toBe(true);
        expect(moved.state.core.objects[equipmentId!]).toMatchObject({
            zoneId: ARENA_ZONE_IDS.A2,
            anchoredToPlayerId: '0',
        });
        expect(moved.state.core.arena.find((zone) => zone.id === PLAYER_ZERO_START_ZONE)?.objectIds).not.toContain(equipmentId);
        expect(moved.state.core.arena.find((zone) => zone.id === ARENA_ZONE_IDS.A2)?.objectIds).toContain(equipmentId);

        const attackState: MatchState<MageWarsCore> = {
            core: withCurrentPlayer(withPlayerInZone(moved.state.core, '1', ARENA_ZONE_IDS.A2), '1'),
            sys: { ...moved.state.sys, phase: 'creatureAction' },
        };
        const attacked = runCommand(attackState, {
            type: MAGE_WARS_COMMANDS.DECLARE_ATTACK,
            playerId: '1',
            payload: { targetPlayerId: '0' },
        });

        expect(attacked.success).toBe(true);
        expect(attacked.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ATTACK_DECLARED,
                payload: expect.objectContaining({
                    attackerId: '1',
                    defenderId: '0',
                    diceResults: [3, 3, 3],
                    baseDamage: 9,
                }),
            }),
            expect.objectContaining({
                type: 'DAMAGE_DEALT',
                payload: expect.objectContaining({
                    targetId: '0',
                    actualDamage: 8,
                    sourceAbilityId: 'mage-basic-melee',
                    breakdown: expect.objectContaining({
                        steps: expect.arrayContaining([
                            expect.objectContaining({
                                sourceId: 'mage-wars-mage-equipment-armor',
                                sourceName: '装备护甲',
                                value: -1,
                                runningTotal: 8,
                            }),
                        ]),
                    }),
                }),
            }),
        ]));
        expect(attacked.state.core.players['0'].damage).toBe(8);
    });

    it('applies mage equipment fire resistance to attack spells and then reduces damage with armor', () => {
        const equipmentSpellId = 3703;
        const attackSpellId = 1702;
        const statusRandom: RandomFn = {
            ...fixedRandom,
            d: (sides: number) => (sides === 12 ? 11 : 3),
        };
        const planningState = setupState('planning');
        const wizardPlanned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.WIZARD_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([equipmentSpellId]));
        const bothPlanned = runCommand({
            core: withCurrentPlayer(
                withPlayerMage(withPlayerInZone(wizardPlanned.state.core, '1', ARENA_ZONE_IDS.A2), '1', MAGE_IDS.WARLOCK_APPRENTICE),
                '1',
            ),
            sys: wizardPlanned.state.sys,
        }, planCommand([attackSpellId], '1'));
        const equipped = runCommand({
            core: {
                ...withCurrentPlayer(bothPlanned.state.core, '0'),
                phaseActorId: '0',
            },
            sys: { ...bothPlanned.state.sys, phase: 'initiativeQuickcast' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: equipmentSpellId,
                manaCost: 6,
                targetPlayerId: '0',
            },
        });

        const attacked = runCommand({
            core: {
                ...withCurrentPlayer(equipped.state.core, '1'),
                phaseActorId: '1',
            },
            sys: { ...equipped.state.sys, phase: 'finalQuickcast' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '1',
            payload: {
                spellCardId: attackSpellId,
                manaCost: 5,
                targetPlayerId: '0',
            },
        }, statusRandom);

        expect(equipped.success).toBe(true);
        expect(attacked.success).toBe(true);
        expect(attacked.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_ATTACK_ROLLED,
                payload: expect.objectContaining({
                    spellCardId: attackSpellId,
                    sourceAbilityId: 'mw.spell.1702',
                    targetPlayerId: '0',
                    diceResults: [3, 3],
                    rawEffectDieResult: 11,
                    effectDieResult: 9,
                    baseDamage: 6,
                }),
            }),
            expect.objectContaining({
                type: 'DAMAGE_DEALT',
                payload: expect.objectContaining({
                    targetId: '0',
                    actualDamage: 4,
                    sourceAbilityId: 'mw.spell.1702',
                    breakdown: expect.objectContaining({
                        steps: expect.arrayContaining([
                            expect.objectContaining({
                                sourceId: 'mage-wars-mage-equipment-armor',
                                sourceName: '装备护甲',
                                value: -2,
                                runningTotal: 4,
                            }),
                        ]),
                    }),
                }),
            }),
        ]));
        expect(attacked.state.core.players['0']).toMatchObject({
            damage: 4,
            statusTokens: {
                [STATUS_TOKEN_IDS.BURN]: 1,
            },
        });
    });

    it('applies Elemental Cloak lightning resistance to arena object attacks against a mage', () => {
        const baseState = setupState('creatureAction');
        const attacker = makeArenaObject('storm-attacker-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2801,
            sourceObjectId: 'spell-card-2801',
            name: '风暴攻击者',
            attackOrTraitLine: '电爪：快速近战闪电 3 骰',
        });
        const equipment = makeArenaObject('elemental-cloak-1', '1', PLAYER_ZERO_START_ZONE, {
            kind: 'equipment',
            sourceSpellCardId: 3709,
            sourceObjectId: 'spell-card-3709',
            name: '元素斗篷',
            life: 1,
            actionReady: false,
            typeLine: '装备 / 斗篷',
            attackOrTraitLine: '法师获得护甲+1、火焰-2、霜冻-2和闪电-2特性',
            anchoredToPlayerId: '1',
        });
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(
                withArenaObject(withPlayerInZone(baseState.core, '1', PLAYER_ZERO_START_ZONE), attacker),
                equipment,
            ),
            sys: baseState.sys,
        };

        const attacked = runCommand(state, {
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
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED,
                payload: expect.objectContaining({
                    attackerObjectId: attacker.id,
                    targetPlayerId: '1',
                    diceResults: [3],
                    baseDamage: 3,
                }),
            }),
            expect.objectContaining({
                type: 'DAMAGE_DEALT',
                payload: expect.objectContaining({
                    targetId: '1',
                    actualDamage: 2,
                    sourceAbilityId: 'mw.object.2801.attack-0',
                    breakdown: expect.objectContaining({
                        steps: expect.arrayContaining([
                            expect.objectContaining({
                                sourceId: 'mage-wars-mage-equipment-armor',
                                sourceName: '装备护甲',
                                value: -1,
                                runningTotal: 2,
                            }),
                        ]),
                    }),
                }),
            }),
        ]));
        expect(attacked.state.core.players['1'].damage).toBe(2);
    });

    it('casts Arcane Staff as mage-attached weapon equipment and resolves its melee mana drain attack', () => {
        const arcaneStaffId = 3704;
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.WIZARD_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([arcaneStaffId]));
        const castState: MatchState<MageWarsCore> = {
            core: withPlayerInZone(planned.state.core, '1', PLAYER_ZERO_START_ZONE),
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        };

        const equipped = runCommand(castState, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: arcaneStaffId,
                manaCost: 8,
                targetPlayerId: '0',
            },
        });
        const equipment = Object.values(equipped.state.core.objects)
            .find((object) => object.sourceSpellCardId === arcaneStaffId);
        expect(equipment).toBeDefined();
        expect(equipped.success).toBe(true);
        expect(equipment).toMatchObject({
            kind: 'equipment',
            ownerId: '0',
            name: '奥秘法杖',
            zoneId: PLAYER_ZERO_START_ZONE,
            anchoredToPlayerId: '0',
            attackOrTraitLine: '奥术击打：快速近战 4 骰，以太，法力流失+1；奥术爆弹：完整行动远程 `1-1` 3 骰，以太，法力流失+1',
        });
        expect(equipped.state.core.players['0']).toMatchObject({
            mana: castState.core.players['0'].mana - 8,
            quickcastReady: false,
            actionReady: true,
        });

        const attacked = runCommand({
            core: equipped.state.core,
            sys: { ...equipped.state.sys, phase: 'creatureAction' },
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_EQUIPMENT_ATTACK,
            playerId: '0',
            payload: {
                equipmentObjectId: equipment!.id,
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
                    attackerObjectId: equipment!.id,
                    attackProfileId: 'attack-0',
                    attackName: '奥术击打',
                    targetPlayerId: '1',
                    diceResults: [3, 3, 3, 3],
                    baseDamage: 12,
                    actionCost: 'normal',
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.MANA_DRAINED,
                payload: expect.objectContaining({
                    playerId: '1',
                    amount: 1,
                    requestedAmount: 1,
                    sourceAbilityId: 'mw.object.3704.attack-0',
                    spellCardId: arcaneStaffId,
                    targetPlayerId: '1',
                }),
            }),
        ]));
        expect(attacked.state.core.players['0'].actionReady).toBe(false);
        expect(attacked.state.core.objects[equipment!.id].actionReady).toBe(false);
        expect(attacked.state.core.players['1']).toMatchObject({
            damage: 12,
            mana: equipped.state.core.players['1'].mana - 1,
        });
        expect(actionLogKinds(attacked.state)).toEqual(expect.arrayContaining([
            MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED,
            MAGE_WARS_EVENTS.MANA_DRAINED,
        ]));
    });

    it('uses Arcane Staff ranged profile only at printed range', () => {
        const arcaneStaffId = 3704;
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.WIZARD_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([arcaneStaffId]));
        const equipped = runCommand({
            core: planned.state.core,
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: arcaneStaffId,
                manaCost: 8,
                targetPlayerId: '0',
            },
        });
        const equipment = Object.values(equipped.state.core.objects)
            .find((object) => object.sourceSpellCardId === arcaneStaffId);
        expect(equipment).toBeDefined();

        const sameZoneState: MatchState<MageWarsCore> = {
            core: withPlayerInZone(equipped.state.core, '1', PLAYER_ZERO_START_ZONE),
            sys: { ...equipped.state.sys, phase: 'creatureAction' },
        };
        expect(validateCommand(sameZoneState, {
            type: MAGE_WARS_COMMANDS.DECLARE_EQUIPMENT_ATTACK,
            playerId: '0',
            payload: {
                equipmentObjectId: equipment!.id,
                attackProfileId: 'attack-1',
                targetPlayerId: '1',
            },
        })).toBe('targetOutOfRange');

        const adjacentState: MatchState<MageWarsCore> = {
            core: withPlayerInZone(equipped.state.core, '1', ARENA_ZONE_IDS.A2),
            sys: { ...equipped.state.sys, phase: 'creatureAction' },
        };
        expect(validateCommand(adjacentState, {
            type: MAGE_WARS_COMMANDS.DECLARE_EQUIPMENT_ATTACK,
            playerId: '0',
            payload: {
                equipmentObjectId: equipment!.id,
                attackProfileId: 'attack-1',
                targetPlayerId: '1',
            },
        })).toBeUndefined();

        const ranged = runCommand(adjacentState, {
            type: MAGE_WARS_COMMANDS.DECLARE_EQUIPMENT_ATTACK,
            playerId: '0',
            payload: {
                equipmentObjectId: equipment!.id,
                attackProfileId: 'attack-1',
                targetPlayerId: '1',
            },
        });

        expect(ranged.success).toBe(true);
        expect(ranged.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED,
                payload: expect.objectContaining({
                    attackerObjectId: equipment!.id,
                    attackProfileId: 'attack-1',
                    attackName: '奥术爆弹',
                    targetPlayerId: '1',
                    diceResults: [3, 3, 3],
                    baseDamage: 9,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.MANA_DRAINED,
                payload: expect.objectContaining({
                    playerId: '1',
                    amount: 1,
                    sourceAbilityId: 'mw.object.3704.attack-1',
                }),
            }),
        ]));
        expect(ranged.state.core.players['0'].actionReady).toBe(false);
        expect(validateCommand({
            core: equipped.state.core,
            sys: { ...equipped.state.sys, phase: 'creatureAction' },
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_EQUIPMENT_ATTACK,
            playerId: '0',
            payload: {
                equipmentObjectId: equipment!.id,
                attackProfileId: 'attack-1',
                targetPlayerId: '1',
            },
        })).toBe('targetOutOfRange');
    });

    it('uses Asyra Staff status effects and nonliving bonus against object targets', () => {
        const asyraStaffId = 3706;
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.PRIESTESS_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([asyraStaffId]));
        const equipped = runCommand({
            core: planned.state.core,
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: asyraStaffId,
                manaCost: 9,
                targetPlayerId: '0',
            },
        });
        const equipment = Object.values(equipped.state.core.objects)
            .find((object) => object.sourceSpellCardId === asyraStaffId);
        expect(equipment).toBeDefined();

        const stunnedTarget = makeArenaObject('asyra-staff-skeleton-stun', '1', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2826,
            sourceObjectId: 'spell-card-2826',
            name: '骷髅哨兵',
            life: 30,
            armor: 0,
            typeLine: '生物 / 骷髅',
            attackOrTraitLine: '短剑：快速近战 3 骰；非活体；精神免疫',
        });
        const stunAttack = runCommand({
            core: withArenaObject(equipped.state.core, stunnedTarget),
            sys: { ...equipped.state.sys, phase: 'creatureAction' },
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_EQUIPMENT_ATTACK,
            playerId: '0',
            payload: {
                equipmentObjectId: equipment!.id,
                attackProfileId: 'attack-0',
                targetObjectId: stunnedTarget.id,
            },
        }, {
            ...fixedRandom,
            d: (sides: number) => (sides === 12 ? 11 : 3),
        });

        expect(stunAttack.success).toBe(true);
        expect(stunAttack.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED,
                payload: expect.objectContaining({
                    attackerObjectId: equipment!.id,
                    attackProfileId: 'attack-0',
                    attackName: '天界神击',
                    targetObjectId: stunnedTarget.id,
                    diceResults: [3, 3, 3, 3],
                    baseDamage: 12,
                    rawEffectDieResult: 11,
                    effectDieResult: 11,
                }),
            }),
            expect.objectContaining({
                type: 'DAMAGE_DEALT',
                payload: expect.objectContaining({
                    targetId: stunnedTarget.id,
                    actualDamage: 14,
                    sourceAbilityId: 'mw.object.3706.attack-0',
                    breakdown: expect.objectContaining({
                        steps: expect.arrayContaining([
                            expect.objectContaining({
                                sourceId: 'mage-wars-nonliving-bonus',
                                sourceName: '对抗非活体生物',
                                value: 2,
                            }),
                        ]),
                    }),
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_PLACED,
                payload: expect.objectContaining({
                    targetObjectId: stunnedTarget.id,
                    statusTokenId: STATUS_TOKEN_IDS.STUN,
                    amount: 1,
                    sourceAbilityId: 'mw.object.3706.attack-0',
                    spellCardId: asyraStaffId,
                }),
            }),
        ]));
        expect(stunAttack.state.core.objects[stunnedTarget.id].statusTokens[STATUS_TOKEN_IDS.STUN]).toBe(1);

        const dazedTarget = makeArenaObject('asyra-staff-skeleton-daze', '1', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2826,
            sourceObjectId: 'spell-card-2826',
            name: '骷髅哨兵',
            life: 30,
            armor: 0,
            typeLine: '生物 / 骷髅',
            attackOrTraitLine: '短剑：快速近战 3 骰；非活体；精神免疫',
        });
        const dazeAttack = runCommand({
            core: withArenaObject(equipped.state.core, dazedTarget),
            sys: { ...equipped.state.sys, phase: 'creatureAction' },
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_EQUIPMENT_ATTACK,
            playerId: '0',
            payload: {
                equipmentObjectId: equipment!.id,
                attackProfileId: 'attack-0',
                targetObjectId: dazedTarget.id,
            },
        }, {
            ...fixedRandom,
            d: (sides: number) => (sides === 12 ? 7 : 3),
        });

        expect(dazeAttack.success).toBe(true);
        expect(dazeAttack.state.core.objects[dazedTarget.id].statusTokens[STATUS_TOKEN_IDS.DAZE]).toBe(1);
    });

    it('uses Inferno Whip reach to attack a same-zone flying target and applies structured burn thresholds', () => {
        const infernoWhipId = 3701;
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.WARLOCK_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([infernoWhipId]));
        const equipped = runCommand({
            core: planned.state.core,
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: infernoWhipId,
                manaCost: 8,
                targetPlayerId: '0',
            },
        });
        const equipment = Object.values(equipped.state.core.objects)
            .find((object) => object.sourceSpellCardId === infernoWhipId);
        const flyingTarget = makeArenaObject('inferno-whip-flying-target', '1', PLAYER_ZERO_START_ZONE, {
            life: 20,
            typeLine: '生物 / 飞行',
            attackOrTraitLine: '利爪：快速近战 2 骰；飞行',
        });
        const attackState: MatchState<MageWarsCore> = {
            core: withArenaObject(equipped.state.core, flyingTarget),
            sys: { ...equipped.state.sys, phase: 'creatureAction' },
        };
        const attackCommand = {
            type: MAGE_WARS_COMMANDS.DECLARE_EQUIPMENT_ATTACK,
            playerId: '0',
            payload: {
                equipmentObjectId: equipment!.id,
                attackProfileId: 'attack-0',
                targetObjectId: flyingTarget.id,
            },
        } as const;
        const rawElevenRandom: RandomFn = {
            ...fixedRandom,
            d: (sides: number) => (sides === 12 ? 11 : 3),
        };

        expect(equipped.success).toBe(true);
        expect(equipment).toMatchObject({
            kind: 'equipment',
            sourceSpellCardId: infernoWhipId,
            combatProfilesSource: 'config',
        });
        expect(validateCommand(attackState, attackCommand)).toBeUndefined();

        const attacked = runCommand(attackState, attackCommand, rawElevenRandom);

        expect(attacked.success).toBe(true);
        expect(attacked.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED,
                payload: expect.objectContaining({
                    attackerObjectId: equipment!.id,
                    attackProfileId: 'attack-0',
                    attackName: '炽热鞭笞',
                    targetObjectId: flyingTarget.id,
                    diceResults: [3, 3, 3, 3],
                    rawEffectDieResult: 11,
                    effectDieResult: 11,
                    baseDamage: 12,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_PLACED,
                payload: expect.objectContaining({
                    targetObjectId: flyingTarget.id,
                    statusTokenId: STATUS_TOKEN_IDS.BURN,
                    amount: 2,
                    sourceAbilityId: 'mw.object.3701.attack-0',
                    spellCardId: infernoWhipId,
                }),
            }),
        ]));
        expect(attacked.state.core.objects[flyingTarget.id].damage).toBe(12);
        expect(attacked.state.core.objects[flyingTarget.id].statusTokens[STATUS_TOKEN_IDS.BURN]).toBe(2);
    });

    it('limits equipment casts to self target and rejects invalid equipment attacks', () => {
        const leatherGlovesId = 3702;
        const arcaneStaffId = 3704;
        const lashId = 3701;
        const warlockPlanningState = setupState('planning');
        const warlockPlanned = runCommand({
            core: withPlayerMage(warlockPlanningState.core, '0', MAGE_IDS.WARLOCK_APPRENTICE),
            sys: warlockPlanningState.sys,
        }, planCommand([leatherGlovesId]));
        const warlockState: MatchState<MageWarsCore> = {
            core: warlockPlanned.state.core,
            sys: { ...warlockPlanned.state.sys, phase: 'initiativeQuickcast' },
        };

        expect(validateCommand(warlockState, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: leatherGlovesId,
                manaCost: 2,
            },
        })).toBe('missingTarget');
        expect(validateCommand(warlockState, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: leatherGlovesId,
                manaCost: 2,
                targetPlayerId: '1',
            },
        })).toBe('cannotTargetOpponent');
        expect(validateCommand(warlockState, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: leatherGlovesId,
                manaCost: 2,
                targetZoneId: PLAYER_ZERO_START_ZONE,
            },
        })).toBe('invalidTargetMode');

        const wizardPlanningState = setupState('planning');
        const wizardPlanned = runCommand({
            core: withPlayerMage(wizardPlanningState.core, '0', MAGE_IDS.WIZARD_APPRENTICE),
            sys: wizardPlanningState.sys,
        }, planCommand([arcaneStaffId]));
        const wizardState: MatchState<MageWarsCore> = {
            core: wizardPlanned.state.core,
            sys: { ...wizardPlanned.state.sys, phase: 'initiativeQuickcast' },
        };

        expect(validateCommand(wizardState, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: arcaneStaffId,
                manaCost: 8,
                targetPlayerId: '0',
            },
        })).toBeUndefined();

        const baseState = setupState('creatureAction');
        const lash = makeArenaObject('lash-3701', '0', PLAYER_ZERO_START_ZONE, {
            kind: 'equipment',
            sourceSpellCardId: lashId,
            sourceObjectId: 'spell-card-3701',
            name: '狱火长鞭',
            typeLine: '装备 / 武器',
            attackOrTraitLine: '炽热鞭笞：快速近战火焰 4 骰，效果骰 `7-10=燃烧`、`11+=燃烧x2`，远触，除霜',
            anchoredToPlayerId: '0',
        });
        const passiveArmor = makeArenaObject('passive-armor-3702', '0', PLAYER_ZERO_START_ZONE, {
            kind: 'equipment',
            sourceSpellCardId: leatherGlovesId,
            sourceObjectId: 'spell-card-3702',
            name: '皮革手套',
            typeLine: '装备 / 手套',
            attackOrTraitLine: '法师获得护甲+1',
            anchoredToPlayerId: '0',
        });
        const unattachedStaff = makeArenaObject('unattached-staff-3704', '0', PLAYER_ZERO_START_ZONE, {
            kind: 'equipment',
            sourceSpellCardId: arcaneStaffId,
            sourceObjectId: 'spell-card-3704',
            name: '奥秘法杖',
            typeLine: '装备 / 武器',
            attackOrTraitLine: '奥术击打：快速近战 4 骰，以太，法力流失+1',
        });
        const enemyStaff = makeArenaObject('enemy-staff-3704', '1', PLAYER_ZERO_START_ZONE, {
            kind: 'equipment',
            sourceSpellCardId: arcaneStaffId,
            sourceObjectId: 'spell-card-3704',
            name: '敌方奥秘法杖',
            typeLine: '装备 / 武器',
            attackOrTraitLine: '奥术击打：快速近战 4 骰，以太，法力流失+1',
            anchoredToPlayerId: '1',
        });
        const target = makeArenaObject('equipment-attack-target', '1', PLAYER_ZERO_START_ZONE);
        const equipmentState: MatchState<MageWarsCore> = {
            core: withArenaObject(
                withArenaObject(
                    withArenaObject(
                        withArenaObject(
                            withArenaObject(
                                withPlayerInZone(baseState.core, '1', PLAYER_ZERO_START_ZONE),
                                lash,
                            ),
                            passiveArmor,
                        ),
                        unattachedStaff,
                    ),
                    enemyStaff,
                ),
                target,
            ),
            sys: baseState.sys,
        };

        const attackPayload = (equipmentObjectId: string) => ({
            equipmentObjectId,
            attackProfileId: 'attack-0',
            targetObjectId: target.id,
        });
        expect(validateCommand(equipmentState, {
            type: MAGE_WARS_COMMANDS.DECLARE_EQUIPMENT_ATTACK,
            playerId: '0',
            payload: attackPayload(lash.id),
        })).toBeUndefined();
        expect(validateCommand(equipmentState, {
            type: MAGE_WARS_COMMANDS.DECLARE_EQUIPMENT_ATTACK,
            playerId: '0',
            payload: attackPayload(passiveArmor.id),
        })).toBe('equipmentCannotAttack');
        expect(validateCommand(equipmentState, {
            type: MAGE_WARS_COMMANDS.DECLARE_EQUIPMENT_ATTACK,
            playerId: '0',
            payload: attackPayload(unattachedStaff.id),
        })).toBe('equipmentNotAttachedToMage');
        expect(validateCommand(equipmentState, {
            type: MAGE_WARS_COMMANDS.DECLARE_EQUIPMENT_ATTACK,
            playerId: '0',
            payload: attackPayload(enemyStaff.id),
        })).toBe('notYourObject');
    });

    it('uses Beast Staff to grant a round-scoped melee bonus to a nearby friendly animal', () => {
        const beastStaffId = 3710;
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.BEASTMASTER_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([beastStaffId]));
        const animal = makeArenaObject('beast-staff-wolf', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2819,
            sourceObjectId: 'spell-card-2819',
            name: '丛林灰狼',
            typeLine: '生物 / 动物',
            life: 8,
        });
        const cast = runCommand({
            core: withArenaObject(planned.state.core, animal),
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: beastStaffId,
                manaCost: 7,
                targetPlayerId: '0',
            },
        });
        const equipment = Object.values(cast.state.core.objects)
            .find((object) => object.sourceSpellCardId === beastStaffId);
        expect(cast.success).toBe(true);
        expect(equipment).toBeDefined();

        const used = runCommand({
            core: cast.state.core,
            sys: { ...cast.state.sys, phase: 'creatureAction' },
        }, {
            type: MAGE_WARS_COMMANDS.USE_ARENA_OBJECT_ABILITY,
            playerId: '0',
            payload: {
                objectId: equipment!.id,
                abilityId: MAGE_WARS_OBJECT_ABILITY_IDS.BEAST_STAFF,
                manaCost: 2,
                targetObjectId: animal.id,
                mode: 'melee-bonus',
            },
        });

        expect(used.success).toBe(true);
        expect(used.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_ABILITY_RESOLVED,
                payload: expect.objectContaining({
                    objectId: equipment!.id,
                    abilityId: MAGE_WARS_OBJECT_ABILITY_IDS.BEAST_STAFF,
                    mode: 'melee-bonus',
                    actionTrack: 'action',
                    roundNumber: cast.state.core.turnNumber,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_TEMPORARY_TRAITS_GAINED,
                payload: expect.objectContaining({
                    objectId: animal.id,
                    meleeDiceModifier: 2,
                    meleeDiceModifierUntilRoundNumber: cast.state.core.turnNumber,
                }),
            }),
        ]));
        expect(used.state.core.players['0']).toMatchObject({
            mana: cast.state.core.players['0'].mana - 2,
            actionReady: false,
            quickcastReady: false,
        });
        expect(used.state.core.objects[animal.id].temporaryTraits).toMatchObject({
            meleeDiceModifier: 2,
            meleeDiceModifierUntilRoundNumber: cast.state.core.turnNumber,
        });
        expect(used.state.core.objects[equipment!.id].abilityUseRoundNumbers).toMatchObject({
            [MAGE_WARS_OBJECT_ABILITY_IDS.BEAST_STAFF]: cast.state.core.turnNumber,
        });

        const phaseAdvanced = runCommand({
            core: used.state.core,
            sys: { ...used.state.sys, phase: 'creatureAction' },
        }, {
            type: FLOW_COMMANDS.ADVANCE_PHASE,
            playerId: '0',
            payload: {},
        });
        expect(phaseAdvanced.state.core.objects[animal.id].temporaryTraits).toMatchObject({
            meleeDiceModifier: 2,
        });

        const nextRound = reduceEvent(
            reduceEvent(phaseAdvanced.state.core, {
                type: MAGE_WARS_EVENTS.TURN_ADVANCED,
                payload: { fromPlayerId: '0', toPlayerId: '0', turnNumber: 2 },
                sourceCommandType: 'test',
                timestamp: 0,
            }),
            {
                type: MAGE_WARS_EVENTS.ACTION_READINESS_RESET,
                payload: { playerId: '0', objectIds: [animal.id] },
                sourceCommandType: 'test',
                timestamp: 0,
            },
        );
        expect(nextRound.objects[animal.id].temporaryTraits).toBeUndefined();
    });

    it('uses Beast Staff healing mode with exactly two attack dice and caps actual healing', () => {
        const beastStaffId = 3710;
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.BEASTMASTER_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([beastStaffId]));
        const animal = makeArenaObject('beast-staff-heal-target', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2819,
            sourceObjectId: 'spell-card-2819',
            name: '丛林灰狼',
            typeLine: '生物 / 动物',
            life: 8,
            damage: 5,
        });
        const cast = runCommand({
            core: withArenaObject(planned.state.core, animal),
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: { spellCardId: beastStaffId, manaCost: 7, targetPlayerId: '0' },
        });
        const equipment = Object.values(cast.state.core.objects)
            .find((object) => object.sourceSpellCardId === beastStaffId);
        const healed = runCommand({
            core: cast.state.core,
            sys: { ...cast.state.sys, phase: 'creatureAction' },
        }, {
            type: MAGE_WARS_COMMANDS.USE_ARENA_OBJECT_ABILITY,
            playerId: '0',
            payload: {
                objectId: equipment!.id,
                abilityId: MAGE_WARS_OBJECT_ABILITY_IDS.BEAST_STAFF,
                manaCost: 2,
                targetObjectId: animal.id,
                mode: 'heal',
            },
        });
        expect(healed.success).toBe(true);
        expect(healed.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_HEALING_ROLLED,
                payload: expect.objectContaining({
                    sourceAbilityId: MAGE_WARS_OBJECT_ABILITY_IDS.BEAST_STAFF,
                    spellCardId: beastStaffId,
                    diceResults: [3, 3],
                    healing: 6,
                    actualHealing: 5,
                }),
            }),
        ]));
        expect(healed.state.core.objects[animal.id].damage).toBe(0);
        expect(healed.state.core.objects[equipment!.id].abilityUseRoundNumbers).toMatchObject({
            [MAGE_WARS_OBJECT_ABILITY_IDS.BEAST_STAFF]: cast.state.core.turnNumber,
        });
    });

    it('rejects Beast Staff for the wrong mage, a distant target, or a second use in the same round', () => {
        const staff = makeArenaObject('beast-staff-source', '0', PLAYER_ZERO_START_ZONE, {
            kind: 'equipment',
            sourceSpellCardId: 3710,
            sourceObjectId: 'spell-card-3710',
            name: '群兽法杖',
            typeLine: '装备 / 武器',
            attackOrTraitLine: '蛮力一击：快速近战 4 骰',
            combatProfilesSource: 'config',
            combatTraitsSource: 'config',
            anchoredToPlayerId: '0',
            actionReady: false,
        });
        const target = makeArenaObject('beast-staff-distant-target', '0', ARENA_ZONE_IDS.C3, {
            sourceSpellCardId: 2819,
            sourceObjectId: 'spell-card-2819',
            name: '丛林灰狼',
            typeLine: '生物 / 动物',
        });
        const wrongMageState = setupState('creatureAction');
        const wrongMageCore = withArenaObject(
            withArenaObject(
                withPlayerMage(wrongMageState.core, '0', MAGE_IDS.WIZARD_APPRENTICE),
                staff,
            ),
            target,
        );
        const command = {
            type: MAGE_WARS_COMMANDS.USE_ARENA_OBJECT_ABILITY,
            playerId: '0' as const,
            payload: {
                objectId: staff.id,
                abilityId: MAGE_WARS_OBJECT_ABILITY_IDS.BEAST_STAFF,
                manaCost: 2,
                targetObjectId: target.id,
                mode: 'melee-bonus' as const,
            },
        };
        expect(validateCommand({ core: wrongMageCore, sys: wrongMageState.sys }, command)).toBe('invalidMageRestriction');

        const usedStaff = {
            ...staff,
            abilityUseRoundNumbers: { [MAGE_WARS_OBJECT_ABILITY_IDS.BEAST_STAFF]: 1 },
        };
        const nearTarget = makeArenaObject('beast-staff-near-target', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2819,
            sourceObjectId: 'spell-card-2819',
            name: '丛林灰狼',
            typeLine: '生物 / 动物',
        });
        const beastmasterCore = withArenaObject(
            withArenaObject(
                withPlayerMage(wrongMageState.core, '0', MAGE_IDS.BEASTMASTER_APPRENTICE),
                usedStaff,
            ),
            nearTarget,
        );
        expect(validateCommand({
            core: beastmasterCore,
            sys: wrongMageState.sys,
        }, {
            ...command,
            payload: { ...command.payload, targetObjectId: nearTarget.id },
        })).toBe('objectAbilityAlreadyUsedThisRound');

        const freshStaff = { ...staff, abilityUseRoundNumbers: undefined };
        const distantCore = withArenaObject(
            withArenaObject(
                withPlayerMage(wrongMageState.core, '0', MAGE_IDS.BEASTMASTER_APPRENTICE),
                freshStaff,
            ),
            target,
        );
        expect(validateCommand({ core: distantCore, sys: wrongMageState.sys }, command)).toBe('targetOutOfRange');
    });
});
