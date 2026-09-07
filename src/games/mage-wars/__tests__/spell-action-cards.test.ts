import { describe, expect, it } from 'vitest';
import { FLOW_COMMANDS } from '../../../engine/systems/FlowSystem';
import type { MatchState, RandomFn } from '../../../engine/types';
import { MAGE_WARS_COMMANDS } from '../domain';
import {
    getMageWarsSpellCardFromConfig,
    getPresetSpellbookCardIdsFromConfig,
} from '../data/configPackage';
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

describe('mage-wars spell action cards', () => {
    it('applies Pillar of Light nonliving bonus damage and status effect to non-living creatures', () => {
        const attackSpellId = 1706;
        const statusRandom: RandomFn = {
            ...fixedRandom,
            d: (sides: number) => (sides === 12 ? 11 : 3),
        };
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withCurrentPlayer(planningState.core, '1'),
            sys: planningState.sys,
        }, planCommand([attackSpellId], '1'));
        const skeleton = makeArenaObject('skeleton-0', '0', ARENA_ZONE_IDS.C1, {
            sourceSpellCardId: 2826,
            sourceObjectId: 'spell-card-2826',
            name: '骷髅哨兵',
            life: 11,
            attackOrTraitLine: '短剑：快速近战 4 骰；非活体；精神免疫',
        });

        const attacked = runCommand({
            core: withArenaObject(planned.state.core, skeleton),
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '1',
            payload: {
                spellCardId: attackSpellId,
                manaCost: 5,
                targetObjectId: skeleton.id,
            },
        }, statusRandom);

        expect(planned.success).toBe(true);
        expect(attacked.success).toBe(true);
        expect(attacked.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_ATTACK_ROLLED,
                payload: expect.objectContaining({
                    playerId: '1',
                    spellCardId: attackSpellId,
                    sourceAbilityId: 'mw.spell.1706',
                    targetObjectId: skeleton.id,
                    targetZoneId: ARENA_ZONE_IDS.C1,
                    diceResults: [3, 3],
                    effectDieResult: 11,
                    baseDamage: 6,
                }),
            }),
            expect.objectContaining({
                type: 'DAMAGE_DEALT',
                payload: expect.objectContaining({
                    targetId: skeleton.id,
                    actualDamage: 8,
                    sourceAbilityId: 'mw.spell.1706',
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
                    targetObjectId: skeleton.id,
                    statusTokenId: STATUS_TOKEN_IDS.STUN,
                    amount: 1,
                    sourceAbilityId: 'mw.spell.1706',
                    spellCardId: attackSpellId,
                }),
            }),
        ]));
        expect(attacked.state.core.objects[skeleton.id]).toMatchObject({
            damage: 8,
            statusTokens: {
                [STATUS_TOKEN_IDS.STUN]: 1,
            },
        });
    });

    it('does not apply Pillar of Light nonliving bonus to living creatures', () => {
        const attackSpellId = 1706;
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withCurrentPlayer(planningState.core, '1'),
            sys: planningState.sys,
        }, planCommand([attackSpellId], '1'));
        const livingCat = makeArenaObject('cat-0', '0', ARENA_ZONE_IDS.C1, {
            sourceSpellCardId: 2906,
            sourceObjectId: 'spell-card-2906',
            name: '野性山猫',
            life: 10,
            attackOrTraitLine: '利爪：快速近战 2 骰；防御图标 `8+ / 1x`；冲锋+2',
        });

        const attacked = runCommand({
            core: withArenaObject(planned.state.core, livingCat),
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '1',
            payload: {
                spellCardId: attackSpellId,
                manaCost: 5,
                targetObjectId: livingCat.id,
            },
        });

        const damageEvent = attacked.events.find((event) => event.type === 'DAMAGE_DEALT');
        expect(attacked.success).toBe(true);
        expect(damageEvent).toMatchObject({
            payload: {
                targetId: livingCat.id,
                actualDamage: 6,
                sourceAbilityId: 'mw.spell.1706',
            },
        });
        expect(JSON.stringify(damageEvent?.payload.breakdown)).not.toContain('mage-wars-nonliving-bonus');
        expect(attacked.state.core.objects[livingCat.id].damage).toBe(6);
    });

    it('casts Jet Stream with flying bonus damage, push movement, and daze on 11+', () => {
        const attackSpellId = 1711;
        const spell = getMageWarsSpellCardFromConfig(attackSpellId);
        const pushRandom: RandomFn = {
            ...fixedRandom,
            d: (sides: number) => (sides === 12 ? 11 : 3),
        };
        const planned = runCommand(setupState('planning'), planCommand([attackSpellId]));
        const flyingAngel = makeArenaObject('angel-1', '1', ARENA_ZONE_IDS.A2, {
            sourceSpellCardId: 2907,
            sourceObjectId: 'spell-card-2907',
            name: '灰衣天使',
            life: 12,
            armor: 0,
            attackOrTraitLine: '利剑：快速近战 4 骰；飞行',
        });
        expect(spell).toBeDefined();

        const pushState: MatchState<MageWarsCore> = {
            core: withArenaObject(planned.state.core, flyingAngel),
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        };
        const pushCommand: MageWarsCommand = {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: attackSpellId,
                manaCost: 4,
                targetObjectId: flyingAngel.id,
                pushToZoneId: ARENA_ZONE_IDS.A3,
            },
        };
        const rawPushEvents = executeMageWarsSpellAbility({
            ownerId: '0',
            timestamp: 0,
            state: pushState,
            command: pushCommand,
            random: pushRandom,
            spell: spell!,
            manaCost: 4,
        });
        const rawPushEventTypes = rawPushEvents.map((event) => event.type);
        const pushed = runCommand(pushState, pushCommand, pushRandom);

        expect(pushed.success).toBe(true);
        expect(rawPushEventTypes).toContain(MAGE_WARS_EVENTS.SPELL_ATTACK_PUSH_AVAILABLE);
        expect(rawPushEventTypes).not.toContain(MAGE_WARS_EVENTS.SPELL_PUSH_RESOLVED);
        expect(pushed.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_ATTACK_ROLLED,
                payload: expect.objectContaining({
                    spellCardId: attackSpellId,
                    sourceAbilityId: 'mw.spell.1711',
                    targetObjectId: flyingAngel.id,
                    diceResults: [3, 3],
                    effectDieResult: 11,
                    baseDamage: 6,
                }),
            }),
            expect.objectContaining({
                type: 'DAMAGE_DEALT',
                payload: expect.objectContaining({
                    targetId: flyingAngel.id,
                    actualDamage: 8,
                    sourceAbilityId: 'mw.spell.1711',
                    breakdown: expect.objectContaining({
                        steps: expect.arrayContaining([
                            expect.objectContaining({
                                sourceId: 'mage-wars-flying-bonus',
                                sourceName: '对抗飞行',
                                value: 2,
                                runningTotal: 8,
                            }),
                        ]),
                    }),
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_ATTACK_PUSH_AVAILABLE,
                payload: expect.objectContaining({
                    sourcePlayerId: '0',
                    spellCardId: attackSpellId,
                    sourceAbilityId: 'mw.spell.1711',
                    targetObjectId: flyingAngel.id,
                    fromZoneId: ARENA_ZONE_IDS.A2,
                    toZoneId: ARENA_ZONE_IDS.A3,
                    effectDieResult: 11,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_PLACED,
                payload: expect.objectContaining({
                    targetObjectId: flyingAngel.id,
                    statusTokenId: STATUS_TOKEN_IDS.DAZE,
                    amount: 1,
                    sourceAbilityId: 'mw.spell.1711',
                    spellCardId: attackSpellId,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_PUSH_RESOLVED,
                payload: expect.objectContaining({
                    playerId: '0',
                    spellCardId: attackSpellId,
                    sourceAbilityId: 'mw.spell.1711',
                    targetObjectId: flyingAngel.id,
                    fromZoneId: ARENA_ZONE_IDS.A2,
                    toZoneId: ARENA_ZONE_IDS.A3,
                }),
            }),
        ]));
        const pushAvailableIndex = pushed.events.findIndex((event) => (
            event.type === MAGE_WARS_EVENTS.SPELL_ATTACK_PUSH_AVAILABLE
            && event.payload.targetObjectId === flyingAngel.id
        ));
        const pushResolvedIndex = pushed.events.findIndex((event) => (
            event.type === MAGE_WARS_EVENTS.SPELL_PUSH_RESOLVED
            && event.payload.targetObjectId === flyingAngel.id
        ));
        expect(pushAvailableIndex).toBeGreaterThanOrEqual(0);
        expect(pushResolvedIndex).toBeGreaterThanOrEqual(0);
        expect(pushAvailableIndex).toBeLessThan(pushResolvedIndex);
        expect(pushed.state.core.objects[flyingAngel.id]).toMatchObject({
            damage: 8,
            zoneId: ARENA_ZONE_IDS.A3,
            statusTokens: {
                [STATUS_TOKEN_IDS.DAZE]: 1,
            },
        });
        expect(pushed.state.core.arena.find((zone) => zone.id === ARENA_ZONE_IDS.A2)?.objectIds).not.toContain(flyingAngel.id);
        expect(pushed.state.core.arena.find((zone) => zone.id === ARENA_ZONE_IDS.A3)?.objectIds).toContain(flyingAngel.id);
    });

    it('does not treat crippled flying creatures as flying for Jet Stream bonus damage', () => {
        const attackSpellId = 1711;
        const pushRandom: RandomFn = {
            ...fixedRandom,
            d: (sides: number) => (sides === 12 ? 11 : 3),
        };
        const planned = runCommand(setupState('planning'), planCommand([attackSpellId]));
        const crippledFlyingAngel = makeArenaObject('crippled-angel-1', '1', ARENA_ZONE_IDS.A2, {
            sourceSpellCardId: 2907,
            sourceObjectId: 'spell-card-2907',
            name: '灰衣天使',
            life: 12,
            armor: 0,
            attackOrTraitLine: '利剑：快速近战 4 骰；飞行',
            statusTokens: {
                [STATUS_TOKEN_IDS.CRIPPLE]: 1,
            },
        });

        const pushed = runCommand({
            core: withArenaObject(planned.state.core, crippledFlyingAngel),
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: attackSpellId,
                manaCost: 4,
                targetObjectId: crippledFlyingAngel.id,
                pushToZoneId: ARENA_ZONE_IDS.A3,
            },
        }, pushRandom);

        const damageEvent = pushed.events.find((event) => event.type === 'DAMAGE_DEALT');
        expect(pushed.success).toBe(true);
        expect(damageEvent).toMatchObject({
            payload: {
                targetId: crippledFlyingAngel.id,
                actualDamage: 6,
                sourceAbilityId: 'mw.spell.1711',
            },
        });
        expect(JSON.stringify(damageEvent?.payload.breakdown)).not.toContain('mage-wars-flying-bonus');
        expect(pushed.state.core.objects[crippledFlyingAngel.id]).toMatchObject({
            damage: 6,
            zoneId: ARENA_ZONE_IDS.A3,
            statusTokens: {
                [STATUS_TOKEN_IDS.CRIPPLE]: 1,
                [STATUS_TOKEN_IDS.DAZE]: 1,
            },
        });
    });

    it('requires Jet Stream push destination to be a legal adjacent zone', () => {
        const attackSpellId = 1711;
        const planned = runCommand(setupState('planning'), planCommand([attackSpellId]));
        const target = makeArenaObject('target-1', '1', ARENA_ZONE_IDS.A2);
        const state = {
            core: withArenaObject(planned.state.core, target),
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        };

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: attackSpellId,
                manaCost: 4,
                targetObjectId: target.id,
            },
        })).toBe('missingPushTargetZone');

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: attackSpellId,
                manaCost: 4,
                targetObjectId: target.id,
                pushToZoneId: PLAYER_ONE_START_ZONE,
            },
        })).toBe('pushTargetNotAdjacent');
    });

    it('casts Force Push as a quick incantation that pushes a target creature one adjacent zone', () => {
        const forcePushSpellId = 3425;
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.WARLOCK_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([forcePushSpellId]));
        const target = makeArenaObject('force-push-target', '1', ARENA_ZONE_IDS.A2);
        const state = {
            core: withArenaObject(planned.state.core, target),
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        };

        const pushed = runCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: forcePushSpellId,
                manaCost: 3,
                targetObjectId: target.id,
                pushToZoneId: ARENA_ZONE_IDS.A3,
            },
        });

        expect(pushed.success).toBe(true);
        expect(pushed.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_CAST_RESOLVED,
                payload: expect.objectContaining({
                    spellCardId: forcePushSpellId,
                    targetObjectId: target.id,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_PUSH_RESOLVED,
                payload: {
                    playerId: '0',
                    spellCardId: forcePushSpellId,
                    sourceAbilityId: 'mw.spell.3425',
                    targetObjectId: target.id,
                    fromZoneId: ARENA_ZONE_IDS.A2,
                    toZoneId: ARENA_ZONE_IDS.A3,
                },
            }),
        ]));
        expect(pushed.state.core.players['0']).toMatchObject({
            quickcastReady: false,
            actionReady: true,
        });
        expect(pushed.state.core.players['0'].discardSpellCardIds).toEqual([forcePushSpellId]);
        expect(pushed.state.core.objects[target.id]).toMatchObject({
            zoneId: ARENA_ZONE_IDS.A3,
            actionReady: true,
        });
        expect(pushed.state.core.arena.find((zone) => zone.id === ARENA_ZONE_IDS.A2)?.objectIds).not.toContain(target.id);
        expect(pushed.state.core.arena.find((zone) => zone.id === ARENA_ZONE_IDS.A3)?.objectIds).toContain(target.id);
    });

    it('requires Force Push to target a creature and choose a legal adjacent destination', () => {
        const forcePushSpellId = 3523;
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.PRIESTESS_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([forcePushSpellId]));
        const target = makeArenaObject('force-push-priestess-target', '1', ARENA_ZONE_IDS.A2);
        const state = {
            core: withArenaObject(planned.state.core, target),
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        };

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: forcePushSpellId,
                manaCost: 3,
                targetObjectId: target.id,
            },
        })).toBe('missingPushTargetZone');

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: forcePushSpellId,
                manaCost: 3,
                targetObjectId: target.id,
                pushToZoneId: PLAYER_ONE_START_ZONE,
            },
        })).toBe('pushTargetNotAdjacent');

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: forcePushSpellId,
                manaCost: 3,
                targetPlayerId: '1',
                pushToZoneId: ARENA_ZONE_IDS.A3,
            },
        })).toBe('invalidTargetMode');
    });

    it('casts Teleport as a quick incantation that moves a target creature to the chosen zone', () => {
        const teleportSpellId = 3410;
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.WIZARD_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([teleportSpellId]));
        const target = makeArenaObject('teleport-target-cat', '1', ARENA_ZONE_IDS.A2);
        const state = {
            core: withArenaObject(planned.state.core, target),
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        };

        const teleported = runCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: teleportSpellId,
                manaCost: 6,
                targetObjectId: target.id,
                targetZoneId: ARENA_ZONE_IDS.B3,
            },
        });

        expect(teleported.success).toBe(true);
        expect(teleported.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_CAST_RESOLVED,
                payload: expect.objectContaining({
                    spellCardId: teleportSpellId,
                    manaCost: 6,
                    targetObjectId: target.id,
                    targetZoneId: ARENA_ZONE_IDS.B3,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_TELEPORT_RESOLVED,
                payload: {
                    playerId: '0',
                    spellCardId: teleportSpellId,
                    sourceAbilityId: 'mw.spell.3410',
                    targetObjectId: target.id,
                    fromZoneId: ARENA_ZONE_IDS.A2,
                    toZoneId: ARENA_ZONE_IDS.B3,
                    distance: 2,
                },
            }),
        ]));
        expect(teleported.state.core.players['0']).toMatchObject({
            quickcastReady: false,
            actionReady: true,
        });
        expect(teleported.state.core.players['0'].discardSpellCardIds).toEqual([teleportSpellId]);
        expect(teleported.state.core.objects[target.id]).toMatchObject({
            zoneId: ARENA_ZONE_IDS.B3,
            actionReady: true,
        });
        expect(teleported.state.core.arena.find((zone) => zone.id === ARENA_ZONE_IDS.A2)?.objectIds).not.toContain(target.id);
        expect(teleported.state.core.arena.find((zone) => zone.id === ARENA_ZONE_IDS.B3)?.objectIds).toContain(target.id);
    });

    it('requires Teleport to target a creature, choose a zone, and pay distance-based mana', () => {
        const teleportSpellId = 3410;
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.WIZARD_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([teleportSpellId]));
        const target = makeArenaObject('teleport-validation-target', '1', ARENA_ZONE_IDS.A2);
        const outOfRangeTarget = makeArenaObject('teleport-out-of-range-target', '1', PLAYER_ONE_START_ZONE);
        const conjuration = makeArenaObject('teleport-conjuration-target', '1', ARENA_ZONE_IDS.A2, {
            kind: 'conjuration',
            sourceSpellCardId: 2224,
            sourceObjectId: 'spell-card-2224',
            name: '缠绕藤蔓',
        });
        const state = {
            core: withArenaObject(
                withArenaObject(
                    withArenaObject(planned.state.core, target),
                    outOfRangeTarget,
                ),
                conjuration,
            ),
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        };

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: teleportSpellId,
                manaCost: 3,
                targetObjectId: target.id,
            },
        })).toBe('missingTargetZone');

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: teleportSpellId,
                manaCost: 3,
                targetPlayerId: '1',
                targetZoneId: PLAYER_ONE_START_ZONE,
            },
        })).toBe('invalidTargetMode');

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: teleportSpellId,
                manaCost: 6,
                targetObjectId: conjuration.id,
                targetZoneId: PLAYER_ONE_START_ZONE,
            },
        })).toBe('invalidTargetObject');

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: teleportSpellId,
                manaCost: 5,
                targetObjectId: target.id,
                targetZoneId: ARENA_ZONE_IDS.B3,
            },
        })).toBe('manaCostMismatch');

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: teleportSpellId,
                manaCost: 3,
                targetObjectId: outOfRangeTarget.id,
                targetZoneId: ARENA_ZONE_IDS.B2,
            },
        })).toBe('targetOutOfRange');
    });

    it('casts Rouse the Beast to ready a creature summoned this turn', () => {
        const creatureSpellId = 2906;
        const rouseSpellId = 3403;
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.BEASTMASTER_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([creatureSpellId, rouseSpellId]));

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
        const objectId = 'mwobj-0-2906-1';

        expect(summoned.success).toBe(true);
        expect(summoned.state.core.objects[objectId]).toMatchObject({
            sourceSpellCardId: creatureSpellId,
            name: '野性山猫',
            actionReady: false,
            summonedTurnNumber: summoned.state.core.turnNumber,
        });

        const roused = runCommand({
            core: summoned.state.core,
            sys: { ...summoned.state.sys, phase: 'finalQuickcast' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: rouseSpellId,
                manaCost: 1,
                targetObjectId: objectId,
            },
        });

        expect(roused.success).toBe(true);
        expect(roused.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_CAST_RESOLVED,
                payload: expect.objectContaining({
                    spellCardId: rouseSpellId,
                    manaCost: 1,
                    targetObjectId: objectId,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_ROUSED,
                payload: expect.objectContaining({
                    ownerId: '0',
                    objectId,
                    sourceAbilityId: 'mw.spell.3403',
                    spellCardId: rouseSpellId,
                    turnNumber: roused.state.core.turnNumber,
                }),
            }),
        ]));
        expect(roused.state.core.objects[objectId]).toMatchObject({
            actionReady: true,
            rousedBySpellTurnNumber: roused.state.core.turnNumber,
        });
        expect(roused.state.core.players['0']).toMatchObject({
            mana: planned.state.core.players['0'].mana - 6,
            actionReady: false,
            quickcastReady: false,
        });
        expect(roused.state.core.players['0'].discardSpellCardIds).toEqual([rouseSpellId, creatureSpellId]);
    });

    it('requires Rouse the Beast to target a fresh living creature and pay its level', () => {
        const rouseSpellId = 3403;
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.BEASTMASTER_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([rouseSpellId]));
        const freshCat = makeArenaObject('fresh-cat-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2906,
            sourceObjectId: 'spell-card-2906',
            name: '野性山猫',
            actionReady: false,
            summonedTurnNumber: planned.state.core.turnNumber,
        });
        const oldCat = makeArenaObject('old-cat-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2906,
            sourceObjectId: 'spell-card-2906',
            name: '旧召唤野性山猫',
            actionReady: false,
            summonedTurnNumber: planned.state.core.turnNumber - 1,
        });
        const nonlivingTarget = makeArenaObject('nonliving-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2826,
            sourceObjectId: 'spell-card-2826',
            name: '骷髅哨兵',
            actionReady: false,
            summonedTurnNumber: planned.state.core.turnNumber,
            attackOrTraitLine: '短剑：快速近战 4 骰；非活体；精神免疫',
        });
        const conjurationTarget = makeArenaObject('conjuration-0', '0', PLAYER_ZERO_START_ZONE, {
            kind: 'conjuration',
            sourceSpellCardId: 2224,
            sourceObjectId: 'spell-card-2224',
            name: '缠绕藤蔓',
            actionReady: false,
            summonedTurnNumber: planned.state.core.turnNumber,
            attackOrTraitLine: '活体；火焰+2；水流免疫',
        });
        const alreadyRoused = makeArenaObject('already-roused-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2906,
            sourceObjectId: 'spell-card-2906',
            name: '已觉醒野性山猫',
            actionReady: true,
            summonedTurnNumber: planned.state.core.turnNumber,
            rousedBySpellTurnNumber: planned.state.core.turnNumber,
        });
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(
                withArenaObject(
                    withArenaObject(
                        withArenaObject(
                            withArenaObject(planned.state.core, freshCat),
                            oldCat,
                        ),
                        nonlivingTarget,
                    ),
                    conjurationTarget,
                ),
                alreadyRoused,
            ),
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        };

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: rouseSpellId,
                manaCost: 2,
                targetObjectId: freshCat.id,
            },
        })).toBe('manaCostMismatch');

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: rouseSpellId,
                manaCost: 1,
                targetObjectId: oldCat.id,
            },
        })).toBe('targetNotSummonedThisTurn');

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: rouseSpellId,
                manaCost: 1,
                targetObjectId: nonlivingTarget.id,
            },
        })).toBe('invalidTargetObject');

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: rouseSpellId,
                manaCost: 1,
                targetObjectId: conjurationTarget.id,
            },
        })).toBe('invalidTargetObject');

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: rouseSpellId,
                manaCost: 1,
                targetObjectId: alreadyRoused.id,
            },
        })).toBe('targetAlreadyRousedThisTurn');

        expect(validateCommand({
            ...state,
            core: {
                ...state.core,
                players: {
                    ...state.core.players,
                    '0': {
                        ...state.core.players['0'],
                        mana: 0,
                    },
                },
            },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: rouseSpellId,
                manaCost: 1,
                targetObjectId: freshCat.id,
            },
        })).toBe('insufficientMana');
    });

    it('clears Rouse the Beast per-round marker when a new round starts', () => {
        const rousedCat = makeArenaObject('round-roused-cat-0', '0', PLAYER_ZERO_START_ZONE, {
            sourceSpellCardId: 2906,
            sourceObjectId: 'spell-card-2906',
            name: '已觉醒野性山猫',
            actionReady: true,
            summonedTurnNumber: 1,
            rousedBySpellTurnNumber: 1,
        });
        const state: MatchState<MageWarsCore> = {
            core: withCurrentPlayer({
                ...withArenaObject(setupState('finalQuickcast').core, rousedCat),
                phaseReadyPlayerIds: [],
            }, '1'),
            sys: setupState('finalQuickcast').sys,
        };

        const nextRound = runCommand(state, {
            type: FLOW_COMMANDS.ADVANCE_PHASE,
            playerId: '1',
            payload: {},
        });

        expect(nextRound.success).toBe(true);
        expect(nextRound.state.core.turnNumber).toBe(2);
        expect(nextRound.state.core.currentPlayerId).toBe('0');
        expect(nextRound.state.core.objects[rousedCat.id]).toMatchObject({
            actionReady: true,
            summonedTurnNumber: 1,
        });
        expect(nextRound.state.core.objects[rousedCat.id].rousedBySpellTurnNumber).toBeUndefined();
    });

    it('casts Explode to destroy mage-attached equipment before resolving its fire attack', () => {
        const explodeSpellId = 3401;
        const statusRandom: RandomFn = {
            ...fixedRandom,
            d: (sides: number) => (sides === 12 ? 6 : 3),
        };
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.WARLOCK_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([explodeSpellId]));
        const coreWithEnemyInRange = withPlayerInZone(planned.state.core, '1', ARENA_ZONE_IDS.A2);
        const equipment = makeArenaObject('enemy-equipment-3703-explode', '1', ARENA_ZONE_IDS.A2, {
            kind: 'equipment',
            sourceSpellCardId: 3703,
            sourceObjectId: 'spell-card-3703',
            name: '龙鳞锁甲',
            life: 1,
            actionReady: false,
            typeLine: '装备 / 胸甲',
            attackOrTraitLine: '法师获得护甲+2和火焰-2特性',
            anchoredToPlayerId: '1',
        });
        const state: MatchState<MageWarsCore> = {
            core: {
                ...withArenaObject(coreWithEnemyInRange, equipment),
                players: {
                    ...coreWithEnemyInRange.players,
                    '0': {
                        ...coreWithEnemyInRange.players['0'],
                        mana: 20,
                    },
                },
            },
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        };

        const explodeCommand: MageWarsCommand = {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: explodeSpellId,
                manaCost: 12,
                targetObjectId: equipment.id,
            },
        };
        const explodeSpell = getMageWarsSpellCardFromConfig(explodeSpellId);
        const rawExplodeEvents = executeMageWarsSpellAbility({
            ownerId: '0',
            timestamp: 0,
            state,
            command: explodeCommand,
            random: statusRandom,
            spell: explodeSpell!,
            manaCost: 12,
        });
        const rawExplodeEventTypes = rawExplodeEvents.map((event) => event.type);
        const exploded = runCommand(state, explodeCommand, statusRandom);
        const damageEvent = exploded.events.find((event) => event.type === 'DAMAGE_DEALT');

        expect(rawExplodeEventTypes).toContain(MAGE_WARS_EVENTS.SPELL_OBJECT_DESTRUCTION_AVAILABLE);
        expect(rawExplodeEventTypes).not.toContain(MAGE_WARS_EVENTS.ARENA_OBJECT_DEFEATED);
        expect(exploded.success).toBe(true);
        expect(exploded.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_CAST_RESOLVED,
                payload: expect.objectContaining({
                    spellCardId: explodeSpellId,
                    manaCost: 12,
                    targetObjectId: equipment.id,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_OBJECT_DESTRUCTION_AVAILABLE,
                payload: expect.objectContaining({
                    sourcePlayerId: '0',
                    sourceAbilityId: 'mw.spell.3401',
                    spellCardId: explodeSpellId,
                    targetObjectId: equipment.id,
                    targetObjectOwnerId: '1',
                    destructionKind: 'explode',
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_DEFEATED,
                payload: expect.objectContaining({
                    objectId: equipment.id,
                    ownerId: '1',
                    sourceAbilityId: 'mw.spell.3401',
                    spellCardId: explodeSpellId,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_ATTACK_ROLLED,
                payload: expect.objectContaining({
                    spellCardId: explodeSpellId,
                    sourceAbilityId: 'mw.spell.3401',
                    targetPlayerId: '1',
                    diceResults: [3, 3, 3, 3],
                    rawEffectDieResult: 6,
                    effectDieResult: 6,
                    baseDamage: 12,
                }),
            }),
            expect.objectContaining({
                type: 'DAMAGE_DEALT',
                payload: expect.objectContaining({
                    targetId: '1',
                    actualDamage: 12,
                    sourceAbilityId: 'mw.spell.3401',
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.STATUS_TOKEN_PLACED,
                payload: expect.objectContaining({
                    targetPlayerId: '1',
                    statusTokenId: STATUS_TOKEN_IDS.BURN,
                    amount: 1,
                    sourceAbilityId: 'mw.spell.3401',
                    spellCardId: explodeSpellId,
                }),
            }),
        ]));
        const destructionAvailableIndex = exploded.events.findIndex((event) => (
            event.type === MAGE_WARS_EVENTS.SPELL_OBJECT_DESTRUCTION_AVAILABLE
            && event.payload.targetObjectId === equipment.id
        ));
        const destroyedIndex = exploded.events.findIndex((event) => (
            event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_DEFEATED
            && event.payload.objectId === equipment.id
        ));
        const attackRolledIndex = exploded.events.findIndex((event) => (
            event.type === MAGE_WARS_EVENTS.SPELL_ATTACK_ROLLED
        ));
        expect(destructionAvailableIndex).toBeGreaterThanOrEqual(0);
        expect(destroyedIndex).toBeGreaterThanOrEqual(0);
        expect(attackRolledIndex).toBeGreaterThanOrEqual(0);
        expect(destructionAvailableIndex).toBeLessThan(destroyedIndex);
        expect(destroyedIndex).toBeLessThan(attackRolledIndex);
        expect(JSON.stringify(damageEvent?.payload.breakdown)).not.toContain('mage-wars-mage-equipment-armor');
        expect(exploded.state.core.objects[equipment.id]).toBeUndefined();
        expect(exploded.state.core.players['1'].damage).toBe(12);
        expect(exploded.state.core.players['1'].statusTokens[STATUS_TOKEN_IDS.BURN]).toBe(1);
        expect(exploded.state.core.players['0'].discardSpellCardIds).toEqual([explodeSpellId]);
        expect(exploded.state.core.players['0'].mana).toBe(8);
    });

    it('requires Explode to target mage-attached equipment and pay that equipment cost plus six', () => {
        const explodeSpellId = 3401;
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.WARLOCK_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([explodeSpellId]));
        const validEquipment = makeArenaObject('explode-equipment-in-range', '1', ARENA_ZONE_IDS.A2, {
            kind: 'equipment',
            sourceSpellCardId: 3703,
            sourceObjectId: 'spell-card-3703',
            name: '龙鳞锁甲',
            life: 1,
            actionReady: false,
            typeLine: '装备 / 胸甲',
            anchoredToPlayerId: '1',
        });
        const unattachedEquipment = makeArenaObject('explode-unattached-equipment', '1', ARENA_ZONE_IDS.A2, {
            kind: 'equipment',
            sourceSpellCardId: 3703,
            sourceObjectId: 'spell-card-3703',
            name: '未附属龙鳞锁甲',
            life: 1,
            actionReady: false,
            typeLine: '装备 / 胸甲',
        });
        const creature = makeArenaObject('explode-not-equipment', '1', ARENA_ZONE_IDS.A2);
        const outOfRangeEquipment = makeArenaObject('explode-equipment-out-of-range', '1', PLAYER_ONE_START_ZONE, {
            kind: 'equipment',
            sourceSpellCardId: 3703,
            sourceObjectId: 'spell-card-3703',
            name: '远处龙鳞锁甲',
            life: 1,
            actionReady: false,
            typeLine: '装备 / 胸甲',
            anchoredToPlayerId: '1',
        });
        const coreWithObjects = withArenaObject(
            withArenaObject(
                withArenaObject(
                    withArenaObject(withPlayerInZone(planned.state.core, '1', ARENA_ZONE_IDS.A2), validEquipment),
                    unattachedEquipment,
                ),
                creature,
            ),
            outOfRangeEquipment,
        );
        const state: MatchState<MageWarsCore> = {
            core: {
                ...coreWithObjects,
                players: {
                    ...coreWithObjects.players,
                    '0': {
                        ...coreWithObjects.players['0'],
                        mana: 20,
                    },
                },
            },
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        };

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: explodeSpellId,
                manaCost: 11,
                targetObjectId: validEquipment.id,
            },
        })).toBe('manaCostMismatch');

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: explodeSpellId,
                manaCost: 12,
                targetObjectId: unattachedEquipment.id,
            },
        })).toBe('invalidTargetObject');

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: explodeSpellId,
                manaCost: 12,
                targetObjectId: creature.id,
            },
        })).toBe('invalidTargetObject');

        expect(validateCommand({
            ...state,
            core: {
                ...state.core,
                players: {
                    ...state.core.players,
                    '0': {
                        ...state.core.players['0'],
                        mana: 11,
                    },
                },
            },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: explodeSpellId,
                manaCost: 12,
                targetObjectId: validEquipment.id,
            },
        })).toBe('insufficientMana');

        expect(validateCommand({
            ...state,
            core: withPlayerInZone(state.core, '1', PLAYER_ONE_START_ZONE),
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: explodeSpellId,
                manaCost: 12,
                targetObjectId: outOfRangeEquipment.id,
            },
        })).toBe('targetOutOfRange');
    });

    it('casts Dissolve to destroy equipment attached to a target mage', () => {
        const dissolveSpellId = 3605;
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.WIZARD_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([dissolveSpellId]));
        const coreWithEnemyInRange = withPlayerInZone(planned.state.core, '1', ARENA_ZONE_IDS.A2);
        const equipment = makeArenaObject('enemy-equipment-3703', '1', ARENA_ZONE_IDS.A2, {
            kind: 'equipment',
            sourceSpellCardId: 3703,
            sourceObjectId: 'spell-card-3703',
            name: '龙鳞锁甲',
            life: 1,
            actionReady: false,
            typeLine: '装备 / 胸甲',
            anchoredToPlayerId: '1',
        });
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(coreWithEnemyInRange, equipment),
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        };

        const dissolveCommand: MageWarsCommand = {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: dissolveSpellId,
                manaCost: 6,
                targetObjectId: equipment.id,
            },
        };
        const dissolveSpell = getMageWarsSpellCardFromConfig(dissolveSpellId);
        const rawDissolveEvents = executeMageWarsSpellAbility({
            ownerId: '0',
            timestamp: 0,
            state,
            command: dissolveCommand,
            random: fixedRandom,
            spell: dissolveSpell!,
            manaCost: 6,
        });
        const rawDissolveEventTypes = rawDissolveEvents.map((event) => event.type);
        const dissolved = runCommand(state, dissolveCommand);

        expect(rawDissolveEventTypes).toContain(MAGE_WARS_EVENTS.SPELL_OBJECT_DESTRUCTION_AVAILABLE);
        expect(rawDissolveEventTypes).not.toContain(MAGE_WARS_EVENTS.ARENA_OBJECT_DEFEATED);
        expect(dissolved.success).toBe(true);
        expect(dissolved.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_CAST_RESOLVED,
                payload: expect.objectContaining({
                    spellCardId: dissolveSpellId,
                    manaCost: 6,
                    targetObjectId: equipment.id,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_OBJECT_DESTRUCTION_AVAILABLE,
                payload: expect.objectContaining({
                    sourcePlayerId: '0',
                    sourceAbilityId: 'mw.spell.3605',
                    spellCardId: dissolveSpellId,
                    targetObjectId: equipment.id,
                    targetObjectOwnerId: '1',
                    destructionKind: 'dissolve',
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_DEFEATED,
                payload: expect.objectContaining({
                    objectId: equipment.id,
                    ownerId: '1',
                    sourceAbilityId: 'mw.spell.3605',
                    spellCardId: dissolveSpellId,
                }),
            }),
        ]));
        const destructionAvailableIndex = dissolved.events.findIndex((event) => (
            event.type === MAGE_WARS_EVENTS.SPELL_OBJECT_DESTRUCTION_AVAILABLE
            && event.payload.targetObjectId === equipment.id
        ));
        const destroyedIndex = dissolved.events.findIndex((event) => (
            event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_DEFEATED
            && event.payload.objectId === equipment.id
        ));
        expect(destructionAvailableIndex).toBeGreaterThanOrEqual(0);
        expect(destroyedIndex).toBeGreaterThanOrEqual(0);
        expect(destructionAvailableIndex).toBeLessThan(destroyedIndex);
        expect(dissolved.state.core.objects[equipment.id]).toBeUndefined();
        expect(dissolved.state.core.players['0'].discardSpellCardIds).toEqual([dissolveSpellId]);
        expect(dissolved.state.core.players['0'].mana).toBe(state.core.players['0'].mana - 6);
    });

    it('keeps alternate Dissolve 3406 as a non-standard alias outside the current spellbook plan gate', () => {
        const dissolveSpellId = 3406;
        const planningState = setupState('planning');

        expect(validateCommand(planningState, planCommand([dissolveSpellId]))).toBe('spellNotInPresetSpellbook');
        expect(getPresetSpellbookCardIdsFromConfig(MAGE_IDS.WIZARD_APPRENTICE)).toContain(3605);
        expect(getPresetSpellbookCardIdsFromConfig(MAGE_IDS.WIZARD_APPRENTICE)).not.toContain(dissolveSpellId);
    });

    it('requires Dissolve to target mage-attached equipment and pay that equipment cost', () => {
        const dissolveSpellId = 3605;
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.WIZARD_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([dissolveSpellId]));
        const validEquipment = makeArenaObject('equipment-in-range', '1', ARENA_ZONE_IDS.A2, {
            kind: 'equipment',
            sourceSpellCardId: 3703,
            sourceObjectId: 'spell-card-3703',
            name: '龙鳞锁甲',
            life: 1,
            actionReady: false,
            typeLine: '装备 / 胸甲',
            anchoredToPlayerId: '1',
        });
        const unattachedEquipment = makeArenaObject('unattached-equipment', '1', ARENA_ZONE_IDS.A2, {
            kind: 'equipment',
            sourceSpellCardId: 3703,
            sourceObjectId: 'spell-card-3703',
            name: '未附属龙鳞锁甲',
            life: 1,
            actionReady: false,
            typeLine: '装备 / 胸甲',
        });
        const creature = makeArenaObject('not-equipment', '1', ARENA_ZONE_IDS.A2);
        const outOfRangeEquipment = makeArenaObject('equipment-out-of-range', '1', PLAYER_ONE_START_ZONE, {
            kind: 'equipment',
            sourceSpellCardId: 3703,
            sourceObjectId: 'spell-card-3703',
            name: '远处龙鳞锁甲',
            life: 1,
            actionReady: false,
            typeLine: '装备 / 胸甲',
            anchoredToPlayerId: '1',
        });
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(
                withArenaObject(
                    withArenaObject(
                        withArenaObject(withPlayerInZone(planned.state.core, '1', ARENA_ZONE_IDS.A2), validEquipment),
                        unattachedEquipment,
                    ),
                    creature,
                ),
                outOfRangeEquipment,
            ),
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        };

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: dissolveSpellId,
                manaCost: 5,
                targetObjectId: validEquipment.id,
            },
        })).toBe('manaCostMismatch');

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: dissolveSpellId,
                manaCost: 6,
                targetObjectId: unattachedEquipment.id,
            },
        })).toBe('invalidTargetObject');

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: dissolveSpellId,
                manaCost: 6,
                targetObjectId: creature.id,
            },
        })).toBe('invalidTargetObject');

        expect(validateCommand({
            ...state,
            core: {
                ...state.core,
                players: {
                    ...state.core.players,
                    '0': {
                        ...state.core.players['0'],
                        mana: 5,
                    },
                },
            },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: dissolveSpellId,
                manaCost: 6,
                targetObjectId: validEquipment.id,
            },
        })).toBe('insufficientMana');

        expect(validateCommand({
            ...state,
            core: withPlayerInZone(state.core, '1', PLAYER_ONE_START_ZONE),
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: dissolveSpellId,
                manaCost: 6,
                targetObjectId: outOfRangeEquipment.id,
            },
        })).toBe('targetOutOfRange');
    });

    it('casts Dispel to destroy a visible enchantment attached to a creature', () => {
        const dispelSpellId = 3606;
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.WIZARD_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([dispelSpellId]));
        const enchantedCreature = makeArenaObject('enchanted-cat-1', '1', ARENA_ZONE_IDS.A2);
        const visibleEnchantment = makeVisibleEnchantmentObject('visible-enchantment-1800', '1', ARENA_ZONE_IDS.A2, {
            anchoredToObjectId: enchantedCreature.id,
        });
        const coreWithEnemyInRange = withPlayerInZone(planned.state.core, '1', ARENA_ZONE_IDS.A2);
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(withArenaObject(coreWithEnemyInRange, enchantedCreature), visibleEnchantment),
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        };

        const dispelCommand: MageWarsCommand = {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: dispelSpellId,
                manaCost: 5,
                targetObjectId: visibleEnchantment.id,
            },
        };
        const dispelSpell = getMageWarsSpellCardFromConfig(dispelSpellId);
        const rawDispelEvents = executeMageWarsSpellAbility({
            ownerId: '0',
            timestamp: 0,
            state,
            command: dispelCommand,
            random: fixedRandom,
            spell: dispelSpell!,
            manaCost: 5,
        });
        const rawDispelEventTypes = rawDispelEvents.map((event) => event.type);
        const dispelled = runCommand(state, dispelCommand);

        expect(rawDispelEventTypes).toContain(MAGE_WARS_EVENTS.SPELL_OBJECT_DESTRUCTION_AVAILABLE);
        expect(rawDispelEventTypes).not.toContain(MAGE_WARS_EVENTS.ARENA_OBJECT_DEFEATED);
        expect(dispelled.success).toBe(true);
        expect(dispelled.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_CAST_RESOLVED,
                payload: expect.objectContaining({
                    spellCardId: dispelSpellId,
                    manaCost: 5,
                    targetObjectId: visibleEnchantment.id,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_OBJECT_DESTRUCTION_AVAILABLE,
                payload: expect.objectContaining({
                    sourcePlayerId: '0',
                    sourceAbilityId: 'mw.spell.3606',
                    spellCardId: dispelSpellId,
                    targetObjectId: visibleEnchantment.id,
                    targetObjectOwnerId: '1',
                    destructionKind: 'dispel',
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_DEFEATED,
                payload: expect.objectContaining({
                    objectId: visibleEnchantment.id,
                    ownerId: '1',
                    sourceAbilityId: 'mw.spell.3606',
                    spellCardId: dispelSpellId,
                }),
            }),
        ]));
        const destructionAvailableIndex = dispelled.events.findIndex((event) => (
            event.type === MAGE_WARS_EVENTS.SPELL_OBJECT_DESTRUCTION_AVAILABLE
            && event.payload.targetObjectId === visibleEnchantment.id
        ));
        const destroyedIndex = dispelled.events.findIndex((event) => (
            event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_DEFEATED
            && event.payload.objectId === visibleEnchantment.id
        ));
        expect(destructionAvailableIndex).toBeGreaterThanOrEqual(0);
        expect(destroyedIndex).toBeGreaterThanOrEqual(0);
        expect(destructionAvailableIndex).toBeLessThan(destroyedIndex);
        expect(dispelled.state.core.objects[visibleEnchantment.id]).toBeUndefined();
        expect(dispelled.state.core.objects[enchantedCreature.id]).toBeDefined();
        expect(dispelled.state.core.players['0'].discardSpellCardIds).toEqual([dispelSpellId]);
        expect(dispelled.state.core.players['0'].mana).toBe(state.core.players['0'].mana - 5);
    });

    it('keeps alternate Dispel 3419 as a non-standard alias outside the current spellbook plan gate', () => {
        const dispelSpellId = 3419;
        const planningState = setupState('planning');

        expect(validateCommand(planningState, planCommand([dispelSpellId]))).toBe('spellNotInPresetSpellbook');
        expect(getPresetSpellbookCardIdsFromConfig(MAGE_IDS.WIZARD_APPRENTICE)).toContain(3606);
        expect(getPresetSpellbookCardIdsFromConfig(MAGE_IDS.WIZARD_APPRENTICE)).not.toContain(dispelSpellId);
    });

    it('requires Dispel to target an attached visible enchantment and pay that enchantment total cost', () => {
        const dispelSpellId = 3606;
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.WIZARD_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([dispelSpellId]));
        const enchantedCreature = makeArenaObject('dispel-enchanted-cat-1', '1', ARENA_ZONE_IDS.A2);
        const validEnchantment = makeVisibleEnchantmentObject('dispel-visible-enchantment', '1', ARENA_ZONE_IDS.A2, {
            anchoredToObjectId: enchantedCreature.id,
        });
        const hiddenEnchantment = makeVisibleEnchantmentObject('dispel-hidden-enchantment', '1', ARENA_ZONE_IDS.A2, {
            anchoredToObjectId: enchantedCreature.id,
            revealed: false,
        });
        const unattachedEnchantment = makeVisibleEnchantmentObject('dispel-unattached-enchantment', '1', ARENA_ZONE_IDS.A2);
        const equipment = makeArenaObject('dispel-not-enchantment', '1', ARENA_ZONE_IDS.A2, {
            kind: 'equipment',
            sourceSpellCardId: 3703,
            sourceObjectId: 'spell-card-3703',
            name: '龙鳞锁甲',
            life: 1,
            actionReady: false,
            typeLine: '装备 / 胸甲',
            anchoredToPlayerId: '1',
        });
        const farCreature = makeArenaObject('dispel-far-cat-1', '1', PLAYER_ONE_START_ZONE);
        const outOfRangeEnchantment = makeVisibleEnchantmentObject('dispel-far-enchantment', '1', PLAYER_ONE_START_ZONE, {
            anchoredToObjectId: farCreature.id,
        });
        const coreWithObjects = withArenaObject(
            withArenaObject(
                withArenaObject(
                    withArenaObject(
                        withArenaObject(
                            withArenaObject(
                                withArenaObject(withPlayerInZone(planned.state.core, '1', ARENA_ZONE_IDS.A2), enchantedCreature),
                                validEnchantment,
                            ),
                            hiddenEnchantment,
                        ),
                        unattachedEnchantment,
                    ),
                    equipment,
                ),
                farCreature,
            ),
            outOfRangeEnchantment,
        );
        const state: MatchState<MageWarsCore> = {
            core: {
                ...coreWithObjects,
                players: {
                    ...coreWithObjects.players,
                    '0': {
                        ...coreWithObjects.players['0'],
                        mana: 20,
                    },
                },
            },
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        };

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: dispelSpellId,
                manaCost: 4,
                targetObjectId: validEnchantment.id,
            },
        })).toBe('manaCostMismatch');

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: dispelSpellId,
                manaCost: 5,
                targetObjectId: hiddenEnchantment.id,
            },
        })).toBe('invalidTargetObject');

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: dispelSpellId,
                manaCost: 5,
                targetObjectId: equipment.id,
            },
        })).toBe('invalidTargetObject');

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: dispelSpellId,
                manaCost: 5,
                targetObjectId: unattachedEnchantment.id,
            },
        })).toBe('invalidTargetObject');

        expect(validateCommand({
            ...state,
            core: {
                ...state.core,
                players: {
                    ...state.core.players,
                    '0': {
                        ...state.core.players['0'],
                        mana: 4,
                    },
                },
            },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: dispelSpellId,
                manaCost: 5,
                targetObjectId: validEnchantment.id,
            },
        })).toBe('insufficientMana');

        expect(validateCommand({
            ...state,
            core: withPlayerInZone(state.core, '1', PLAYER_ONE_START_ZONE),
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: dispelSpellId,
                manaCost: 5,
                targetObjectId: outOfRangeEnchantment.id,
            },
        })).toBe('targetOutOfRange');
    });

    it('casts Steal Enchantment to move a visible enchantment to a new legal target under caster control', () => {
        const stealEnchantmentSpellId = 3409;
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.WIZARD_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([stealEnchantmentSpellId]));
        const friendlyCreature = makeArenaObject('steal-new-friendly-cat', '0', PLAYER_ZERO_START_ZONE);
        const enchantedCreature = makeArenaObject('steal-enchanted-enemy-cat', '1', ARENA_ZONE_IDS.A2);
        const visibleEnchantment = makeVisibleEnchantmentObject('stolen-visible-enchantment-1800', '1', ARENA_ZONE_IDS.A2, {
            anchoredToObjectId: enchantedCreature.id,
        });
        const coreWithObjects = [friendlyCreature, enchantedCreature, visibleEnchantment].reduce(
            (core, object) => withArenaObject(core, object),
            withPlayerInZone(planned.state.core, '1', ARENA_ZONE_IDS.A2),
        );
        const state: MatchState<MageWarsCore> = {
            core: coreWithObjects,
            sys: { ...planned.state.sys, phase: 'creatureAction' },
        };

        const stolen = runCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: stealEnchantmentSpellId,
                manaCost: 10,
                targetObjectId: visibleEnchantment.id,
                newTargetObjectId: friendlyCreature.id,
            },
        });

        const movedEnchantment = stolen.state.core.objects[visibleEnchantment.id];

        expect(stolen.success).toBe(true);
        expect(stolen.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.SPELL_CAST_RESOLVED,
                payload: expect.objectContaining({
                    spellCardId: stealEnchantmentSpellId,
                    manaCost: 10,
                    targetObjectId: visibleEnchantment.id,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ENCHANTMENT_STOLEN,
                payload: expect.objectContaining({
                    objectId: visibleEnchantment.id,
                    previousOwnerId: '1',
                    ownerId: '0',
                    fromZoneId: ARENA_ZONE_IDS.A2,
                    toZoneId: PLAYER_ZERO_START_ZONE,
                    targetObjectId: friendlyCreature.id,
                    sourceAbilityId: 'mw.spell.3409',
                    spellCardId: stealEnchantmentSpellId,
                }),
            }),
        ]));
        expect(movedEnchantment).toMatchObject({
            ownerId: '0',
            anchoredToObjectId: friendlyCreature.id,
            zoneId: PLAYER_ZERO_START_ZONE,
        });
        expect(movedEnchantment.anchoredToPlayerId).toBeUndefined();
        expect(movedEnchantment.anchoredToZoneId).toBeUndefined();
        expect(stolen.state.core.arena.find((zone) => zone.id === ARENA_ZONE_IDS.A2)?.objectIds)
            .not.toContain(visibleEnchantment.id);
        expect(stolen.state.core.arena.find((zone) => zone.id === PLAYER_ZERO_START_ZONE)?.objectIds)
            .toContain(visibleEnchantment.id);
        expect(stolen.state.core.players['0'].discardSpellCardIds).toEqual([stealEnchantmentSpellId]);
        expect(stolen.state.core.players['0'].mana).toBe(state.core.players['0'].mana - 10);
    });

    it('requires Steal Enchantment to target a visible attached enchantment, a new legal target, and the doubled enchantment total cost', () => {
        const stealEnchantmentSpellId = 3409;
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.WIZARD_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([stealEnchantmentSpellId]));
        const friendlyCreature = makeArenaObject('steal-validation-friendly-cat', '0', PLAYER_ZERO_START_ZONE);
        const enchantedCreature = makeArenaObject('steal-validation-enchanted-cat', '1', ARENA_ZONE_IDS.A2);
        const validEnchantment = makeVisibleEnchantmentObject('steal-visible-enchantment', '1', ARENA_ZONE_IDS.A2, {
            anchoredToObjectId: enchantedCreature.id,
        });
        const hiddenEnchantment = makeVisibleEnchantmentObject('steal-hidden-enchantment', '1', ARENA_ZONE_IDS.A2, {
            anchoredToObjectId: enchantedCreature.id,
            revealed: false,
        });
        const unattachedEnchantment = makeVisibleEnchantmentObject('steal-unattached-enchantment', '1', ARENA_ZONE_IDS.A2);
        const equipment = makeArenaObject('steal-not-enchantment', '1', ARENA_ZONE_IDS.A2, {
            kind: 'equipment',
            sourceSpellCardId: 3703,
            sourceObjectId: 'spell-card-3703',
            name: '龙鳞锁甲',
            life: 1,
            actionReady: false,
            typeLine: '装备 / 胸甲',
            anchoredToPlayerId: '1',
        });
        const farCreature = makeArenaObject('steal-far-cat', '1', PLAYER_ONE_START_ZONE);
        const outOfRangeEnchantment = makeVisibleEnchantmentObject('steal-far-enchantment', '1', PLAYER_ONE_START_ZONE, {
            anchoredToObjectId: farCreature.id,
        });
        const coreWithObjects = [
            friendlyCreature,
            enchantedCreature,
            validEnchantment,
            hiddenEnchantment,
            unattachedEnchantment,
            equipment,
            farCreature,
            outOfRangeEnchantment,
        ].reduce(
            (core, object) => withArenaObject(core, object),
            withPlayerInZone(planned.state.core, '1', ARENA_ZONE_IDS.A2),
        );
        const state: MatchState<MageWarsCore> = {
            core: {
                ...coreWithObjects,
                players: {
                    ...coreWithObjects.players,
                    '0': {
                        ...coreWithObjects.players['0'],
                        mana: 20,
                    },
                },
            },
            sys: { ...planned.state.sys, phase: 'creatureAction' },
        };

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: stealEnchantmentSpellId,
                manaCost: 10,
                targetObjectId: validEnchantment.id,
            },
        })).toBe('missingNewTarget');

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: stealEnchantmentSpellId,
                manaCost: 10,
                targetObjectId: validEnchantment.id,
                newTargetObjectId: friendlyCreature.id,
                newTargetPlayerId: '0',
            },
        })).toBe('invalidTargetMode');

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: stealEnchantmentSpellId,
                manaCost: 9,
                targetObjectId: validEnchantment.id,
                newTargetObjectId: friendlyCreature.id,
            },
        })).toBe('manaCostMismatch');

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: stealEnchantmentSpellId,
                manaCost: 10,
                targetObjectId: hiddenEnchantment.id,
                newTargetObjectId: friendlyCreature.id,
            },
        })).toBe('invalidTargetObject');

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: stealEnchantmentSpellId,
                manaCost: 10,
                targetObjectId: equipment.id,
                newTargetObjectId: friendlyCreature.id,
            },
        })).toBe('invalidTargetObject');

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: stealEnchantmentSpellId,
                manaCost: 10,
                targetObjectId: unattachedEnchantment.id,
                newTargetObjectId: friendlyCreature.id,
            },
        })).toBe('invalidTargetObject');

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: stealEnchantmentSpellId,
                manaCost: 10,
                targetObjectId: validEnchantment.id,
                newTargetObjectId: equipment.id,
            },
        })).toBe('invalidNewTarget');

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: stealEnchantmentSpellId,
                manaCost: 10,
                targetObjectId: validEnchantment.id,
                newTargetObjectId: enchantedCreature.id,
            },
        })).toBe('sameEnchantmentTarget');

        expect(validateCommand({
            ...state,
            core: {
                ...state.core,
                players: {
                    ...state.core.players,
                    '0': {
                        ...state.core.players['0'],
                        mana: 9,
                    },
                },
            },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: stealEnchantmentSpellId,
                manaCost: 10,
                targetObjectId: validEnchantment.id,
                newTargetObjectId: friendlyCreature.id,
            },
        })).toBe('insufficientMana');

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: stealEnchantmentSpellId,
                manaCost: 10,
                targetObjectId: outOfRangeEnchantment.id,
                newTargetObjectId: friendlyCreature.id,
            },
        })).toBe('targetOutOfRange');

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: stealEnchantmentSpellId,
                manaCost: 10,
                targetObjectId: validEnchantment.id,
                newTargetObjectId: farCreature.id,
            },
        })).toBe('newTargetOutOfRange');
    });
});
