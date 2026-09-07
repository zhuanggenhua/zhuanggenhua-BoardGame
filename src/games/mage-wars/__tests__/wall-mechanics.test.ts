import { describe, expect, it } from 'vitest';
import type { MatchState } from '../../../engine/types';
import { MageWarsDomain, MAGE_WARS_COMMANDS } from '../domain';
import { MAGE_WARS_EVENTS } from '../domain/events';
import {
    ARENA_ZONE_IDS,
    MAGE_IDS,
    getMageWarsWallEdgeId,
} from '../domain/ids';
import type { MageWarsCommand, MageWarsCore } from '../domain/types';
import {
    fixedRandom,
    makeArenaObject,
    runCommand,
    setupState,
    validateCommand,
    withArenaObject,
    withPreparedPlayerMage,
} from './helpers/domainFlowHarness';

describe('mage-wars wall mechanics', () => {
    it('casts a standard starting wall onto an adjacent zone boundary and rejects invalid boundaries', () => {
        const wallEdgeId = getMageWarsWallEdgeId(ARENA_ZONE_IDS.A3, ARENA_ZONE_IDS.B3);
        const nonAdjacentWallEdgeId = getMageWarsWallEdgeId(ARENA_ZONE_IDS.A3, ARENA_ZONE_IDS.C3);
        const state: MatchState<MageWarsCore> = {
            ...setupState('creatureAction'),
            core: withPreparedPlayerMage(
                setupState('creatureAction').core,
                '0',
                MAGE_IDS.BEASTMASTER_APPRENTICE,
                [25700],
                20,
            ),
        };

        const castWallCommand: MageWarsCommand = {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: 25700,
                manaCost: 5,
                targetWallEdgeId: wallEdgeId,
            },
        };

        expect(validateCommand(state, castWallCommand)).toBeUndefined();
        expect(validateCommand(state, {
            ...castWallCommand,
            payload: {
                ...castWallCommand.payload,
                targetWallEdgeId: undefined,
            },
        })).toBe('missingWallEdgeTarget');
        expect(validateCommand(state, {
            ...castWallCommand,
            payload: {
                ...castWallCommand.payload,
                targetWallEdgeId: nonAdjacentWallEdgeId,
            },
        })).toBe('invalidWallEdge');

        const cast = runCommand(state, castWallCommand);

        expect(cast.success).toBe(true);
        expect(cast.events.map((event) => event.type)).toContain(MAGE_WARS_EVENTS.WALL_SUMMONED);
        expect(Object.values(cast.state.core.walls)).toEqual([
            expect.objectContaining({
                ownerId: '0',
                sourceSpellCardId: 25700,
                edgeId: wallEdgeId,
                zoneIds: [ARENA_ZONE_IDS.A3, ARENA_ZONE_IDS.B3],
                blocksLineOfSight: true,
                passageDamage: expect.objectContaining({ amount: expect.any(Number) }),
            }),
        ]);
        expect(validateCommand(cast.state, {
            ...castWallCommand,
            payload: {
                ...castWallCommand.payload,
                targetWallEdgeId: wallEdgeId,
            },
        })).toBe('wallEdgeOccupied');
    });

    it('blocks line of sight for ranged attacks across a wall edge', () => {
        const wallEdgeId = getMageWarsWallEdgeId(ARENA_ZONE_IDS.A3, ARENA_ZONE_IDS.B3);
        const rangedAttacker = makeArenaObject('ranged-attacker', '0', ARENA_ZONE_IDS.A3, {
            attackOrTraitLine: '长弓：快速远程 2 骰，1-2 区域',
        });
        const target = makeArenaObject('ranged-target', '1', ARENA_ZONE_IDS.B3);
        const state: MatchState<MageWarsCore> = {
            ...setupState('creatureAction'),
            core: {
                ...withArenaObject(withArenaObject(setupState('creatureAction').core, rangedAttacker), target),
                walls: {
                    [wallEdgeId]: {
                        id: 'wall-test-a3-b3',
                        ownerId: '0',
                        sourceSpellCardId: 25700,
                        sourceObjectId: 'spell-25700',
                        name: '荆棘之墙',
                        edgeId: wallEdgeId,
                        zoneIds: [ARENA_ZONE_IDS.A3, ARENA_ZONE_IDS.B3],
                        blocksLineOfSight: true,
                        passageDamage: { amount: 3, damageTypes: ['穿越墙体'] },
                    },
                },
            },
        };

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: rangedAttacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: target.id,
            },
        })).toBe('lineOfSightBlockedByWall');
    });

    it('applies wall passage damage when a creature crosses a wall edge', () => {
        const wallEdgeId = getMageWarsWallEdgeId(ARENA_ZONE_IDS.A3, ARENA_ZONE_IDS.B3);
        const mover = makeArenaObject('wall-crossing-cat', '0', ARENA_ZONE_IDS.A3);
        const state: MatchState<MageWarsCore> = {
            ...setupState('creatureAction'),
            core: {
                ...withArenaObject(setupState('creatureAction').core, mover),
                walls: {
                    [wallEdgeId]: {
                        id: 'wall-test-fire-a3-b3',
                        ownerId: '1',
                        sourceSpellCardId: 2500,
                        sourceObjectId: 'spell-2500',
                        name: '烈火之墙',
                        edgeId: wallEdgeId,
                        zoneIds: [ARENA_ZONE_IDS.A3, ARENA_ZONE_IDS.B3],
                        blocksLineOfSight: true,
                        passageDamage: { amount: 3, damageTypes: ['火焰'] },
                    },
                },
            },
        };

        const moveCommand: MageWarsCommand = {
            type: MAGE_WARS_COMMANDS.MOVE_ARENA_OBJECT,
            playerId: '0',
            payload: {
                objectId: mover.id,
                toZoneId: ARENA_ZONE_IDS.B3,
            },
        };

        const rawMoveEvents = MageWarsDomain.execute(state, moveCommand, fixedRandom);
        const rawMoveEventTypes = rawMoveEvents.map((event) => event.type);
        expect(rawMoveEventTypes).toContain(MAGE_WARS_EVENTS.WALL_PASSAGE_DAMAGE_AVAILABLE);
        expect(rawMoveEventTypes).not.toContain(MAGE_WARS_EVENTS.WALL_PASSAGE_DAMAGE_TRIGGERED);
        expect(rawMoveEventTypes).not.toContain('DAMAGE_DEALT');

        const moved = runCommand(state, moveCommand);

        expect(moved.success).toBe(true);
        expect(moved.state.core.objects[mover.id].zoneId).toBe(ARENA_ZONE_IDS.B3);
        expect(moved.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.WALL_PASSAGE_DAMAGE_AVAILABLE,
                payload: expect.objectContaining({
                    wallId: 'wall-test-fire-a3-b3',
                    objectId: mover.id,
                    fromZoneId: ARENA_ZONE_IDS.A3,
                    toZoneId: ARENA_ZONE_IDS.B3,
                    amount: 3,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.WALL_PASSAGE_DAMAGE_TRIGGERED,
                payload: expect.objectContaining({
                    wallId: 'wall-test-fire-a3-b3',
                    objectId: mover.id,
                    fromZoneId: ARENA_ZONE_IDS.A3,
                    toZoneId: ARENA_ZONE_IDS.B3,
                    amount: 3,
                }),
            }),
            expect.objectContaining({
                type: 'DAMAGE_DEALT',
                payload: expect.objectContaining({
                    targetId: mover.id,
                    actualDamage: 3,
                    sourceAbilityId: 'mw.wall.2500.passage',
                }),
            }),
        ]));
        const availableIndex = moved.events.findIndex((event) => (
            event.type === MAGE_WARS_EVENTS.WALL_PASSAGE_DAMAGE_AVAILABLE
        ));
        const triggeredIndex = moved.events.findIndex((event) => (
            event.type === MAGE_WARS_EVENTS.WALL_PASSAGE_DAMAGE_TRIGGERED
        ));
        const damageIndex = moved.events.findIndex((event) => event.type === 'DAMAGE_DEALT');
        expect(availableIndex).toBeGreaterThanOrEqual(0);
        expect(triggeredIndex).toBeGreaterThan(availableIndex);
        expect(damageIndex).toBeGreaterThan(triggeredIndex);
        expect(moved.state.core.objects[mover.id].damage).toBe(3);
    });
});
