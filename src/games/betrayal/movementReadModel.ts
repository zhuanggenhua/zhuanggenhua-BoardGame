import {
    isBetrayalHauntRuntimeStarted,
    resolveBetrayalExplorerSide,
} from './entityRelationModel';
import {
    shouldDeadPlayerControlFeverish,
    shouldDeadTraitorControlJackSpirit,
} from './hauntScenarioReadModel';
import { getAllExplorers } from './explorerReadModel';
import {
    resolveConnectedRoomIds,
    roomDistanceByLayout,
} from './roomMapModel';
import { canUseSkeletonKeyForMove } from './possessionActionReadModel';
import type {
    BetrayalCore,
    BetrayalRoomNode,
} from './game';

export function resolveMoveTargetRooms(core: BetrayalCore): BetrayalRoomNode[] {
    const activeRoom = core.rooms.find((room) => room.id === core.activeRoomId);
    if (!activeRoom) {
        return [];
    }
    if (
        shouldDeadTraitorControlJackSpirit(core, core.currentExplorer.playerId)
        || shouldDeadPlayerControlFeverish(core, core.currentExplorer.playerId)
    ) {
        return core.rooms.filter((room) => (
            room.state === 'discovered'
            && room.id !== activeRoom.id
            && roomDistanceByLayout(room, activeRoom) === 1
        ));
    }
    const connectedIds = resolveConnectedRoomIds(core.rooms, activeRoom.id);
    return core.rooms.filter((room) => room.state === 'discovered' && connectedIds.has(room.id));
}

export type BetrayalMoveTargetReadModel = {
    normalMoveTargetRooms: BetrayalRoomNode[];
    skeletonKeyMoveTargetRooms: BetrayalRoomNode[];
    skeletonKeyMoveTargetRoomIds: Set<string>;
    moveTargetRooms: BetrayalRoomNode[];
    moveTargetRoomIds: Set<string>;
};

export function resolveBetrayalMoveTargetReadModel(core: BetrayalCore): BetrayalMoveTargetReadModel {
    const normalMoveTargetRooms = resolveMoveTargetRooms(core);
    const skeletonKeyMoveTargetRooms = core.rooms.filter((room) => canUseSkeletonKeyForMove(core, room.id));
    const byId = new Map<string, BetrayalRoomNode>();
    for (const room of normalMoveTargetRooms) {
        byId.set(room.id, room);
    }
    for (const room of skeletonKeyMoveTargetRooms) {
        byId.set(room.id, room);
    }
    const moveTargetRooms = [...byId.values()];
    return {
        normalMoveTargetRooms,
        skeletonKeyMoveTargetRooms,
        skeletonKeyMoveTargetRoomIds: new Set(skeletonKeyMoveTargetRooms.map((room) => room.id)),
        moveTargetRooms,
        moveTargetRoomIds: new Set(moveTargetRooms.map((room) => room.id)),
    };
}

function resolveMoveCostFromRoom(room: BetrayalRoomNode | undefined): number {
    return room?.markerTokens?.includes('obstacle') ? 2 : 1;
}

function hasEnemyExplorerObstacle(core: BetrayalCore, roomId: string, playerId: string): boolean {
    if (!isBetrayalHauntRuntimeStarted(core)) {
        return false;
    }
    const actorSide = resolveBetrayalExplorerSide(core, playerId);
    if (!actorSide) {
        return false;
    }
    return getAllExplorers(core).some((explorer) => (
        explorer.playerId !== playerId
        && explorer.roomId === roomId
        && !core.scenarioRuntime.deadExplorerPlayerIds.includes(explorer.playerId)
        && resolveBetrayalExplorerSide(core, explorer.playerId) !== actorSide
    ));
}

function hasMonsterObstacle(core: BetrayalCore, roomId: string, playerId: string): boolean {
    if (!isBetrayalHauntRuntimeStarted(core) || core.monsters.length === 0) {
        return false;
    }
    return resolveBetrayalExplorerSide(core, playerId) === 'hero'
        && core.monsters.some((monster) => monster.roomId === roomId);
}

export function resolveBetrayalMoveCost(
    core: BetrayalCore,
    playerId = core.currentExplorer.playerId,
): number {
    const actor = getAllExplorers(core).find((explorer) => explorer.playerId === playerId) ?? core.currentExplorer;
    const actorRoom = core.rooms.find((room) => room.id === actor.roomId);
    const baseCost = resolveMoveCostFromRoom(actorRoom);
    if (
        actorRoom
        && (
            hasEnemyExplorerObstacle(core, actorRoom.id, playerId)
            || hasMonsterObstacle(core, actorRoom.id, playerId)
        )
    ) {
        return Math.max(baseCost, 2);
    }
    return baseCost;
}
