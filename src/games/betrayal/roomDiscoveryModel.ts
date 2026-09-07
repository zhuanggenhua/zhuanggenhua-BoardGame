import {
    cloneBetrayalRoom,
    refreshExplorableRoomSlots,
    resolveConnectedRoomIds,
    resolveDoorwayConnectionEdge,
    resolveOppositeRoomEdge,
    ROOM_EDGE_VECTOR,
} from './roomMapModel';
import type { RandomFn } from '../../engine/types';
import {
    BETRAYAL_DISCOVERY_POOLS,
    resolveBetrayalRoomDiscoverySymbol,
    type BetrayalRoomDiscoverySymbol,
    type BetrayalRoomDiscoveryTemplate,
    type BetrayalRoomDoorway,
    type BetrayalRoomEdge,
    type BetrayalRoomFloor,
} from './scenarioConfig';
import {
    BETRAYAL_TRAIT_LABEL as TRAIT_LABEL,
} from './possessionEffects';
import { isAttackWeaponCard } from './attackRules';
import { cloneExplorerSummary } from './explorerReadModel';
import { moveExplorerTraitSteps } from './traitTrackModel';
import type {
    BetrayalBuriedRoomTileSummary,
    BetrayalCore,
    BetrayalDeckKind,
    BetrayalDiscoveryResolutionStep,
    BetrayalInventoryCard,
    BetrayalRoomDiscoveryDeckEntry,
    BetrayalRoomDrawResolution,
    BetrayalRoomNode,
    BetrayalRoomPlacementPreview,
    BetrayalRoomTileAdjustmentOption,
    BetrayalRoomTileAdjustmentSelection,
} from './game';

type RoomTemplate = BetrayalRoomDiscoveryTemplate;
type BetrayalRoomDiscoveryEffect = NonNullable<BetrayalRoomDiscoveryTemplate['discoveryEffect']>;

export type BetrayalRoomDiscoveryCards = {
    roomDiscoveryCards?: BetrayalInventoryCard[];
    buriedRoomDiscoveryCards?: BetrayalInventoryCard[];
};

export type BetrayalExploreRoomCommandPayload = {
    roomId?: string;
    orientationTurns?: 0 | 1 | 2 | 3;
    useHolySymbol?: boolean;
    useIdol?: boolean;
    ignoreEventSymbolWithTraitorPower?: boolean;
    roomTileAdjustment?: BetrayalRoomTileAdjustmentSelection;
};

export interface BetrayalTileStackSearchCriteria {
    roomName?: string;
    visualId?: BetrayalRoomVisualId;
    floor?: BetrayalRoomFloor;
}

export interface BetrayalTileStackSearchRoomSummary {
    floor: BetrayalRoomFloor;
    name: string;
    visualId: BetrayalRoomVisualId;
}

export interface BetrayalTileStackSearchDiscoveredRoomSummary {
    roomId: string;
    floor: BetrayalRoomFloor;
    name: string;
    visualId: BetrayalRoomVisualId;
}

export interface BetrayalTileStackSearchResult {
    requestedRoomName?: string;
    requestedVisualId?: BetrayalRoomVisualId;
    requestedFloor?: BetrayalRoomFloor;
    foundRoom: BetrayalTileStackSearchRoomSummary | null;
    searchedCount: number;
    remainingCount: number;
    reshuffled: boolean;
}

export interface BetrayalTileStackSearchPreview {
    requestedRoomName?: string;
    requestedVisualId?: BetrayalRoomVisualId;
    requestedFloor?: BetrayalRoomFloor;
    searchedCount: number;
    candidateRooms: BetrayalTileStackSearchRoomSummary[];
    firstCandidate: BetrayalTileStackSearchRoomSummary | null;
    discoveredRooms: BetrayalTileStackSearchDiscoveredRoomSummary[];
    targetAlreadyInHouse: boolean;
    canSearch: boolean;
    willRemoveFirstCandidate: boolean;
    willReshuffleAfterSearch: boolean;
    remainingCountAfterSearch: number;
    reason: string | null;
    ruleNotes: string[];
}

export const BETRAYAL_ROOM_FLOORS: BetrayalRoomFloor[] = ['ground', 'upper', 'basement'];

export const ROOM_DISCOVERY_POOL: Record<BetrayalRoomFloor, RoomTemplate[]> = {
    ground: BETRAYAL_DISCOVERY_POOLS.roomDiscoveryByFloor.ground.map((room) => ({
        ...room,
        tags: [...room.tags],
    })),
    upper: BETRAYAL_DISCOVERY_POOLS.roomDiscoveryByFloor.upper.map((room) => ({
        ...room,
        tags: [...room.tags],
    })),
    basement: BETRAYAL_DISCOVERY_POOLS.roomDiscoveryByFloor.basement.map((room) => ({
        ...room,
        tags: [...room.tags],
    })),
};

export const ROOM_DISCOVERY_DECK_POOL: BetrayalRoomDiscoveryDeckEntry[] = BETRAYAL_ROOM_FLOORS.flatMap(
    (floor) => ROOM_DISCOVERY_POOL[floor].map((room) => ({ floor, room })),
);

export function cloneRoomTemplate(template: RoomTemplate): RoomTemplate {
    return {
        ...template,
        tags: [...template.tags],
        doorways: [...template.doorways],
    };
}

export function cloneRoomDiscoveryDeckEntry(
    entry: BetrayalRoomDiscoveryDeckEntry,
): BetrayalRoomDiscoveryDeckEntry {
    return {
        floor: entry.floor,
        room: cloneRoomTemplate(entry.room),
    };
}

export function cloneBuriedRoomTileSummary(
    summary: BetrayalBuriedRoomTileSummary,
): BetrayalBuriedRoomTileSummary {
    return { ...summary };
}

export function cloneRoomDrawResolution(
    resolution: BetrayalRoomDrawResolution,
): BetrayalRoomDrawResolution {
    return {
        requestedFloor: resolution.requestedFloor,
        selectedRoom: resolution.selectedRoom ? { ...resolution.selectedRoom } : null,
        buriedRoomTiles: resolution.buriedRoomTiles.map(cloneBuriedRoomTileSummary),
        exhausted: resolution.exhausted,
        requiresTileAdjustment: resolution.requiresTileAdjustment,
        usedUnifiedDeck: resolution.usedUnifiedDeck,
    };
}

export function groupRoomDiscoveryDeckByFloor(
    deck: BetrayalRoomDiscoveryDeckEntry[],
): Record<BetrayalRoomFloor, RoomTemplate[]> {
    return {
        ground: deck.filter((entry) => entry.floor === 'ground').map((entry) => cloneRoomTemplate(entry.room)),
        upper: deck.filter((entry) => entry.floor === 'upper').map((entry) => cloneRoomTemplate(entry.room)),
        basement: deck.filter((entry) => entry.floor === 'basement').map((entry) => cloneRoomTemplate(entry.room)),
    };
}

export function makeRoomDiscoveryDeckFromFloorPools(
    pools: Record<BetrayalRoomFloor, RoomTemplate[]>,
): BetrayalRoomDiscoveryDeckEntry[] {
    return BETRAYAL_ROOM_FLOORS.flatMap((floor) => (
        pools[floor].map((room) => ({ floor, room: cloneRoomTemplate(room) }))
    ));
}

export function roomDiscoveryDeckMatchesFloorPools(core: BetrayalCore): boolean {
    const deck = core.roomDiscoveryDeck ?? [];
    return BETRAYAL_ROOM_FLOORS.every((floor) => (
        deck
            .filter((entry) => entry.floor === floor)
            .map((entry) => entry.room.visualId)
            .join('|') === core.roomDiscoveryOrderByFloor[floor].map((room) => room.visualId).join('|')
    ));
}

export function resolveCurrentRoomDiscoveryDeck(core: BetrayalCore): BetrayalRoomDiscoveryDeckEntry[] {
    return (
        core.roomDiscoveryDeck?.length && roomDiscoveryDeckMatchesFloorPools(core)
            ? core.roomDiscoveryDeck
            : makeRoomDiscoveryDeckFromFloorPools(core.roomDiscoveryOrderByFloor)
    ).map(cloneRoomDiscoveryDeckEntry);
}

function makeTileStackSearchRoomSummary(
    entry: BetrayalRoomDiscoveryDeckEntry,
): BetrayalTileStackSearchRoomSummary {
    return {
        floor: entry.floor,
        name: entry.room.name,
        visualId: entry.room.visualId,
    };
}

function roomDiscoveryEntryMatchesTileStackSearch(
    entry: BetrayalRoomDiscoveryDeckEntry,
    criteria: BetrayalTileStackSearchCriteria,
): boolean {
    const requestedRoomName = criteria.roomName?.trim();
    if (requestedRoomName && entry.room.name !== requestedRoomName) {
        return false;
    }
    if (criteria.visualId && entry.room.visualId !== criteria.visualId) {
        return false;
    }
    if (criteria.floor && entry.floor !== criteria.floor) {
        return false;
    }
    return Boolean(requestedRoomName || criteria.visualId || criteria.floor);
}

function discoveredRoomMatchesTileStackSearch(
    room: BetrayalRoomNode,
    criteria: BetrayalTileStackSearchCriteria,
): boolean {
    const requestedRoomName = criteria.roomName?.trim();
    if (requestedRoomName && room.name !== requestedRoomName) {
        return false;
    }
    if (criteria.visualId && room.visualId !== criteria.visualId) {
        return false;
    }
    if (criteria.floor && room.floor !== criteria.floor) {
        return false;
    }
    return Boolean(requestedRoomName || criteria.visualId || criteria.floor);
}

export function resolveBetrayalTileStackSearchPreview(
    core: BetrayalCore,
    criteria: BetrayalTileStackSearchCriteria,
): BetrayalTileStackSearchPreview {
    const deck = resolveCurrentRoomDiscoveryDeck(core);
    const requestedRoomName = criteria.roomName?.trim() || undefined;
    const hasSpecificRoomTarget = Boolean(requestedRoomName || criteria.visualId);
    const discoveredRooms = core.rooms
        .filter((room) => room.state === 'discovered')
        .filter((room) => discoveredRoomMatchesTileStackSearch(room, criteria))
        .map((room): BetrayalTileStackSearchDiscoveredRoomSummary => ({
            roomId: room.id,
            floor: room.floor,
            name: room.name,
            visualId: room.visualId,
        }));
    const targetAlreadyInHouse = hasSpecificRoomTarget && discoveredRooms.length > 0;
    const candidateRooms = deck
        .filter((entry) => roomDiscoveryEntryMatchesTileStackSearch(entry, criteria))
        .map(makeTileStackSearchRoomSummary);
    let reason: string | null = null;
    if (!requestedRoomName && !criteria.visualId && !criteria.floor) {
        reason = '没有指定要搜索的房间或楼层。';
    } else if (targetAlreadyInHouse) {
        reason = '目标房间已经在屋内，不需要搜索房间堆。';
    } else if (candidateRooms.length === 0) {
        reason = '房间堆中没有命中的板块。';
    }
    const canSearch = reason === null;
    return {
        requestedRoomName,
        requestedVisualId: criteria.visualId,
        requestedFloor: criteria.floor,
        searchedCount: deck.length,
        candidateRooms,
        firstCandidate: candidateRooms[0] ?? null,
        discoveredRooms,
        targetAlreadyInHouse,
        canSearch,
        willRemoveFirstCandidate: canSearch,
        willReshuffleAfterSearch: canSearch,
        remainingCountAfterSearch: canSearch ? Math.max(0, deck.length - 1) : deck.length,
        reason,
        ruleNotes: [
            '作祟或 setup 要求寻找特定房间时，若该房间已在屋内则不再搜索房间堆。',
            '若从房间堆命中特定板块，应移除该板块并重洗剩余房间堆。',
            '当前读模型只表达搜索候选与重洗后果，不等于玩家可见搜索面板或逐作祟 setup 放置流程完成。',
        ],
    };
}

function cloneCoreWithRoomDiscoveryDeck(
    core: BetrayalCore,
    roomDiscoveryDeck: BetrayalRoomDiscoveryDeckEntry[],
    options: { resetLatestRoomDrawResolution?: boolean } = {},
): BetrayalCore {
    const currentExplorer = cloneExplorerSummary(core.currentExplorer);
    return {
        ...core,
        currentExplorer,
        currentExplorerTraits: { ...currentExplorer.traits },
        currentExplorerInventory: currentExplorer.inventory.map((card) => ({ ...card })),
        otherExplorers: core.otherExplorers.map(cloneExplorerSummary),
        rooms: core.rooms.map(cloneBetrayalRoom),
        roomDiscoveryDeck: roomDiscoveryDeck.map(cloneRoomDiscoveryDeckEntry),
        roomDiscoveryOrderByFloor: groupRoomDiscoveryDeckByFloor(roomDiscoveryDeck),
        buriedRoomTiles: (core.buriedRoomTiles ?? []).map(cloneBuriedRoomTileSummary),
        latestRoomDrawResolution: options.resetLatestRoomDrawResolution
            ? null
            : core.latestRoomDrawResolution
                ? cloneRoomDrawResolution(core.latestRoomDrawResolution)
                : null,
    };
}

export function applyBetrayalTileStackSearch(
    core: BetrayalCore,
    criteria: BetrayalTileStackSearchCriteria,
    random: RandomFn,
): { core: BetrayalCore; result: BetrayalTileStackSearchResult } {
    const deck = resolveCurrentRoomDiscoveryDeck(core);
    const foundIndex = deck.findIndex((entry) => roomDiscoveryEntryMatchesTileStackSearch(entry, criteria));
    const baseResult = {
        requestedRoomName: criteria.roomName?.trim() || undefined,
        requestedVisualId: criteria.visualId,
        requestedFloor: criteria.floor,
        searchedCount: deck.length,
    };
    if (foundIndex < 0) {
        return {
            core: cloneCoreWithRoomDiscoveryDeck(core, deck),
            result: {
                ...baseResult,
                foundRoom: null,
                remainingCount: deck.length,
                reshuffled: false,
            },
        };
    }

    const foundEntry = deck[foundIndex]!;
    const remainingDeck = [
        ...deck.slice(0, foundIndex),
        ...deck.slice(foundIndex + 1),
    ];
    const shuffledRemainingDeck = random.shuffle(remainingDeck).map(cloneRoomDiscoveryDeckEntry);
    return {
        core: cloneCoreWithRoomDiscoveryDeck(core, shuffledRemainingDeck, { resetLatestRoomDrawResolution: true }),
        result: {
            ...baseResult,
            foundRoom: makeTileStackSearchRoomSummary(foundEntry),
            remainingCount: shuffledRemainingDeck.length,
            reshuffled: true,
        },
    };
}

function summarizeBuriedRoomTile(
    entry: BetrayalRoomDiscoveryDeckEntry,
    reason: BetrayalBuriedRoomTileSummary['reason'],
): BetrayalBuriedRoomTileSummary {
    return {
        floor: entry.floor,
        name: entry.room.name,
        visualId: entry.room.visualId,
        reason,
    };
}

function rotateEdge(
    edge: BetrayalRoomEdge,
    turns: 0 | 1 | 2 | 3,
): BetrayalRoomEdge {
    const edges: BetrayalRoomEdge[] = ['north', 'east', 'south', 'west'];
    const index = edges.indexOf(edge);
    return edges[(index + turns + edges.length) % edges.length]!;
}

function orientDoorwaysToEntry(
    templateDoorways: BetrayalRoomEdge[],
    entryEdge: BetrayalRoomEdge,
): { doorways: BetrayalRoomDoorway[]; orientationTurns: 0 | 1 | 2 | 3 } {
    const requiredEdge = resolveOppositeRoomEdge(entryEdge);
    const baseEdge = templateDoorways[0] ?? requiredEdge;
    const edges: BetrayalRoomEdge[] = ['north', 'east', 'south', 'west'];
    const turns = ((edges.indexOf(requiredEdge) - edges.indexOf(baseEdge) + edges.length) % edges.length) as 0 | 1 | 2 | 3;
    return {
        doorways: templateDoorways.map((edge) => ({ edge: rotateEdge(edge, turns) })),
        orientationTurns: turns,
    };
}

export function isRoomOrientationTurns(value: unknown): value is 0 | 1 | 2 | 3 {
    return value === 0 || value === 1 || value === 2 || value === 3;
}

const ROOM_ORIENTATION_TURN_OPTIONS = [0, 1, 2, 3] as const;

function orientDoorwaysByTurns(
    templateDoorways: BetrayalRoomEdge[],
    orientationTurns: 0 | 1 | 2 | 3,
): BetrayalRoomDoorway[] {
    return templateDoorways.map((edge) => ({ edge: rotateEdge(edge, orientationTurns) }));
}

export function canConnectDoorwaysToEntry(
    templateDoorways: BetrayalRoomEdge[],
    entryEdge: BetrayalRoomEdge,
    orientationTurns: 0 | 1 | 2 | 3,
): boolean {
    const requiredEdge = resolveOppositeRoomEdge(entryEdge);
    return orientDoorwaysByTurns(templateDoorways, orientationTurns).some((doorway) => doorway.edge === requiredEdge);
}

export interface RoomPlacementContext {
    slot: BetrayalRoomNode;
    entryRoomId: string | null;
    entryEdge: BetrayalRoomEdge;
}

export function resolveRoomPlacementContext(
    core: BetrayalCore,
    slot: BetrayalRoomNode,
): RoomPlacementContext {
    const entryRoom = core.rooms.find((room) => room.id === core.activeRoomId);
    const entryEdge = (
        entryRoom
            ? resolveDoorwayConnectionEdge(entryRoom, slot.id)
            : null
    ) ?? slot.entryEdge ?? slot.doorways[0]?.edge ?? 'west';
    return {
        slot,
        entryRoomId: entryRoom?.id ?? null,
        entryEdge,
    };
}

function materializeRoomsAfterPlacement(
    core: BetrayalCore,
    placement: RoomPlacementContext,
    roomTemplate: RoomTemplate,
    orientationTurns: 0 | 1 | 2 | 3,
): BetrayalRoomNode[] {
    const placedRoom = cloneBetrayalRoom(placement.slot);
    placedRoom.name = roomTemplate.name;
    placedRoom.hint = roomTemplate.hint;
    placedRoom.tags = [...roomTemplate.tags];
    placedRoom.state = 'discovered';
    placedRoom.discoveryReward = null;
    placedRoom.visualId = roomTemplate.visualId;
    placedRoom.backVisualId = placement.slot.backVisualId;
    placedRoom.discoveryEffect = roomTemplate.discoveryEffect;
    placedRoom.endTurnEffect = roomTemplate.endTurnEffect;
    placedRoom.enterEffect = roomTemplate.enterEffect;
    placedRoom.entryRoomId = placement.entryRoomId ?? core.activeRoomId;
    placedRoom.entryEdge = placement.entryEdge;
    placedRoom.orientationTurns = orientationTurns;
    const connectionEdge = resolveOppositeRoomEdge(placement.entryEdge);
    let connectedToEntry = false;
    placedRoom.doorways = orientDoorwaysByTurns(roomTemplate.doorways, orientationTurns).map((doorway) => {
        if (!connectedToEntry && doorway.edge === connectionEdge) {
            connectedToEntry = true;
            return {
                ...doorway,
                connectsToRoomId: core.activeRoomId,
            };
        }
        return doorway;
    });
    if (!connectedToEntry) {
        placedRoom.doorways = [
            ...placedRoom.doorways,
            {
                edge: connectionEdge,
                connectsToRoomId: core.activeRoomId,
            },
        ];
    }
    placedRoom.connectedRoomIds = Array.from(new Set([
        ...placedRoom.connectedRoomIds,
        core.activeRoomId,
    ]));

    return refreshExplorableRoomSlots([
        ...core.rooms.filter((room) => room.id !== placement.slot.id).map(cloneBetrayalRoom),
        placedRoom,
    ]);
}

function placementLeavesFloorOpen(
    core: BetrayalCore,
    placement: RoomPlacementContext,
    roomTemplate: RoomTemplate,
    orientationTurns: 0 | 1 | 2 | 3,
): boolean {
    return materializeRoomsAfterPlacement(core, placement, roomTemplate, orientationTurns)
        .some((room) => room.state === 'unexplored' && room.floor === placement.slot.floor);
}

function addOrientationTurns(
    baseTurns: 0 | 1 | 2 | 3,
    addedTurns: 0 | 1 | 2 | 3,
): 0 | 1 | 2 | 3 {
    return ((baseTurns + addedTurns) % 4) as 0 | 1 | 2 | 3;
}

function countOpenDoorwaysOnFloor(rooms: BetrayalRoomNode[], floor: BetrayalRoomFloor): number {
    return rooms.filter((room) => room.state === 'unexplored' && room.floor === floor).length;
}

function discoveredRoomsOnFloorStayConnected(rooms: BetrayalRoomNode[], floor: BetrayalRoomFloor): boolean {
    const discoveredRoomIds = rooms
        .filter((room) => room.state === 'discovered' && room.floor === floor)
        .map((room) => room.id);
    if (discoveredRoomIds.length <= 1) {
        return true;
    }
    const remaining = new Set(discoveredRoomIds);
    const queue = [discoveredRoomIds[0]!];
    remaining.delete(queue[0]!);
    while (queue.length > 0) {
        const roomId = queue.shift()!;
        for (const connectedRoomId of resolveConnectedRoomIds(rooms, roomId)) {
            const connectedRoom = rooms.find((room) => room.id === connectedRoomId);
            if (connectedRoom?.floor === floor && remaining.delete(connectedRoomId)) {
                queue.push(connectedRoomId);
            }
        }
        for (const sourceRoom of rooms) {
            if (
                sourceRoom.floor === floor
                && sourceRoom.state === 'discovered'
                && resolveConnectedRoomIds(rooms, sourceRoom.id).has(roomId)
                && remaining.delete(sourceRoom.id)
            ) {
                queue.push(sourceRoom.id);
            }
        }
    }
    return remaining.size === 0;
}

function removeRoomConnection(room: BetrayalRoomNode, targetRoomId: string): BetrayalRoomNode {
    return {
        ...room,
        connectedRoomIds: room.connectedRoomIds.filter((roomId) => roomId !== targetRoomId),
        doorways: room.doorways.map((doorway) => (
            doorway.connectsToRoomId === targetRoomId
                ? {
                    edge: doorway.edge,
                    leadsToFloor: doorway.leadsToFloor,
                    note: doorway.note,
                }
                : { ...doorway }
        )),
    };
}

function connectRoomToAdjustedTile(
    room: BetrayalRoomNode,
    adjustedRoomId: string,
    edge: BetrayalRoomEdge,
): BetrayalRoomNode {
    let connected = false;
    const doorways = room.doorways.map((doorway) => {
        if (doorway.edge !== edge) {
            return { ...doorway };
        }
        connected = true;
        return {
            ...doorway,
            connectsToRoomId: adjustedRoomId,
        };
    });
    if (!connected) {
        doorways.push({
            edge,
            connectsToRoomId: adjustedRoomId,
        });
    }
    return {
        ...room,
        connectedRoomIds: Array.from(new Set([...room.connectedRoomIds, adjustedRoomId])),
        doorways,
    };
}

export function materializeRoomsAfterTileAdjustment(
    rooms: BetrayalRoomNode[],
    selection: BetrayalRoomTileAdjustmentSelection,
): BetrayalRoomNode[] | null {
    const roomToAdjust = rooms.find((room) => room.id === selection.roomId && room.state === 'discovered');
    const entryRoom = rooms.find((room) => room.id === selection.entryRoomId && room.state === 'discovered');
    if (
        !roomToAdjust
        || !entryRoom
        || roomToAdjust.floor !== entryRoom.floor
        || roomToAdjust.doorways.some((doorway) => doorway.leadsToFloor)
    ) {
        return null;
    }

    const targetVector = ROOM_EDGE_VECTOR[selection.entryEdge];
    const expectedX = entryRoom.x + targetVector.x;
    const expectedY = entryRoom.y + targetVector.y;
    if (selection.x !== expectedX || selection.y !== expectedY) {
        return null;
    }

    const discoveredRooms = rooms
        .filter((room) => room.state === 'discovered')
        .map(cloneBetrayalRoom);
    const remainingRooms = discoveredRooms
        .filter((room) => room.id !== roomToAdjust.id)
        .map((room) => removeRoomConnection(room, roomToAdjust.id));
    const occupiedPosition = remainingRooms.some((room) => (
        room.floor === roomToAdjust.floor
        && room.x === selection.x
        && room.y === selection.y
    ));
    if (occupiedPosition) {
        return null;
    }

    const adjustedDoorways = orientDoorwaysByTurns(
        roomToAdjust.doorways.map((doorway) => doorway.edge),
        selection.orientationTurns,
    );
    const connectionEdge = resolveOppositeRoomEdge(selection.entryEdge);
    let connectedToEntry = false;
    const adjustedRoom: BetrayalRoomNode = {
        ...cloneBetrayalRoom(roomToAdjust),
        x: selection.x,
        y: selection.y,
        entryRoomId: selection.entryRoomId,
        entryEdge: selection.entryEdge,
        orientationTurns: addOrientationTurns(roomToAdjust.orientationTurns, selection.orientationTurns),
        connectedRoomIds: [selection.entryRoomId],
        doorways: adjustedDoorways.map((doorway) => {
            if (!connectedToEntry && doorway.edge === connectionEdge) {
                connectedToEntry = true;
                return {
                    ...doorway,
                    connectsToRoomId: selection.entryRoomId,
                };
            }
            return doorway;
        }),
    };
    if (!connectedToEntry) {
        return null;
    }

    const withEntryConnection = remainingRooms.map((room) => (
        room.id === selection.entryRoomId
            ? connectRoomToAdjustedTile(room, roomToAdjust.id, selection.entryEdge)
            : room
    ));

    return refreshExplorableRoomSlots([...withEntryConnection, adjustedRoom]);
}

export function resolveRoomTileAdjustmentOptionsForPlacement(
    core: BetrayalCore,
    roomTemplate: RoomTemplate,
    placement: RoomPlacementContext,
    placementOrientationTurns: 0 | 1 | 2 | 3,
): BetrayalRoomTileAdjustmentOption[] {
    const discoveredRooms = core.rooms.filter((room) => room.state === 'discovered' && room.floor === placement.slot.floor);
    const occupiedPositions = new Set(
        discoveredRooms.map((room) => `${room.floor}:${room.x}:${room.y}`),
    );
    const options: BetrayalRoomTileAdjustmentOption[] = [];
    const seen = new Set<string>();

    for (const roomToAdjust of discoveredRooms) {
        if (
            roomToAdjust.id === core.activeRoomId
            || roomToAdjust.doorways.some((doorway) => doorway.leadsToFloor)
        ) {
            continue;
        }
        const positionsWithoutAdjustedRoom = new Set(occupiedPositions);
        positionsWithoutAdjustedRoom.delete(`${roomToAdjust.floor}:${roomToAdjust.x}:${roomToAdjust.y}`);
        const entryRooms = discoveredRooms.filter((room) => room.id !== roomToAdjust.id);
        for (const entryRoom of entryRooms) {
            for (const entryEdge of Object.keys(ROOM_EDGE_VECTOR) as BetrayalRoomEdge[]) {
                const vector = ROOM_EDGE_VECTOR[entryEdge];
                const x = entryRoom.x + vector.x;
                const y = entryRoom.y + vector.y;
                if (
                    positionsWithoutAdjustedRoom.has(`${roomToAdjust.floor}:${x}:${y}`)
                    || (x === placement.slot.x && y === placement.slot.y)
                ) {
                    continue;
                }
                for (const orientationTurns of ROOM_ORIENTATION_TURN_OPTIONS) {
                    if (!canConnectDoorwaysToEntry(
                        roomToAdjust.doorways.map((doorway) => doorway.edge),
                        entryEdge,
                        orientationTurns,
                    )) {
                        continue;
                    }
                    const selection: BetrayalRoomTileAdjustmentSelection = {
                        roomId: roomToAdjust.id,
                        x,
                        y,
                        entryRoomId: entryRoom.id,
                        entryEdge,
                        orientationTurns,
                    };
                    const adjustedRooms = materializeRoomsAfterTileAdjustment(core.rooms, selection);
                    if (!adjustedRooms || !discoveredRoomsOnFloorStayConnected(adjustedRooms, placement.slot.floor)) {
                        continue;
                    }
                    const adjustedCore = { ...core, rooms: adjustedRooms };
                    const adjustedSlot = adjustedRooms.find((room) => room.id === placement.slot.id && room.state === 'unexplored')
                        ?? adjustedRooms.find((room) => (
                            room.state === 'unexplored'
                            && room.floor === placement.slot.floor
                            && room.x === placement.slot.x
                            && room.y === placement.slot.y
                        ));
                    if (!adjustedSlot) {
                        continue;
                    }
                    const adjustedPlacement = resolveRoomPlacementContext(adjustedCore, adjustedSlot);
                    if (!canConnectDoorwaysToEntry(roomTemplate.doorways, adjustedPlacement.entryEdge, placementOrientationTurns)) {
                        continue;
                    }
                    const roomsAfterPlacement = materializeRoomsAfterPlacement(
                        adjustedCore,
                        adjustedPlacement,
                        roomTemplate,
                        placementOrientationTurns,
                    );
                    const openDoorwayCount = countOpenDoorwaysOnFloor(roomsAfterPlacement, placement.slot.floor);
                    if (openDoorwayCount <= 0) {
                        continue;
                    }
                    const key = `${selection.roomId}:${selection.x}:${selection.y}:${selection.entryRoomId}:${selection.entryEdge}:${selection.orientationTurns}`;
                    if (seen.has(key)) {
                        continue;
                    }
                    seen.add(key);
                    options.push({
                        ...selection,
                        roomName: roomToAdjust.name,
                        fromX: roomToAdjust.x,
                        fromY: roomToAdjust.y,
                        entryRoomName: entryRoom.name,
                        openDoorwayCount,
                    });
                }
            }
        }
    }

    return options;
}

export function resolveRoomPlacementOrientationOptions(
    core: BetrayalCore,
    roomTemplate: RoomTemplate,
    placement: RoomPlacementContext,
    requireOpenFrontier: boolean,
): { orientationTurns: 0 | 1 | 2 | 3; doorways: BetrayalRoomDoorway[] }[] {
    return ROOM_ORIENTATION_TURN_OPTIONS
        .filter((orientationTurns) => (
            canConnectDoorwaysToEntry(roomTemplate.doorways, placement.entryEdge, orientationTurns)
            && (
                !requireOpenFrontier
                || placementLeavesFloorOpen(core, placement, roomTemplate, orientationTurns)
            )
        ))
        .map((orientationTurns) => ({
            orientationTurns,
            doorways: orientDoorwaysByTurns(roomTemplate.doorways, orientationTurns),
        }));
}

export function orientDoorwaysForPlacement(
    templateDoorways: BetrayalRoomEdge[],
    entryEdge: BetrayalRoomEdge,
    requestedOrientationTurns?: 0 | 1 | 2 | 3,
): { doorways: BetrayalRoomDoorway[]; orientationTurns: 0 | 1 | 2 | 3 } {
    if (
        isRoomOrientationTurns(requestedOrientationTurns)
        && canConnectDoorwaysToEntry(templateDoorways, entryEdge, requestedOrientationTurns)
    ) {
        return {
            doorways: orientDoorwaysByTurns(templateDoorways, requestedOrientationTurns),
            orientationTurns: requestedOrientationTurns,
        };
    }
    return orientDoorwaysToEntry(templateDoorways, entryEdge);
}

export function resolveNextExplorableRoomSlot(core: BetrayalCore): BetrayalRoomNode | null {
    if (core.phase !== 'preHaunt' && core.phase !== 'haunt') {
        return null;
    }
    const activeRoom = core.rooms.find((room) => room.id === core.activeRoomId);
    if (!activeRoom) {
        return null;
    }
    const connectedIds = resolveConnectedRoomIds(core.rooms, activeRoom.id);
    return core.rooms.find((room) => room.state === 'unexplored' && connectedIds.has(room.id)) ?? null;
}

export function resolveExplorableRoomSlots(core: BetrayalCore): BetrayalRoomNode[] {
    if (core.phase !== 'preHaunt' && core.phase !== 'haunt') {
        return [];
    }
    const activeRoom = core.rooms.find((room) => room.id === core.activeRoomId);
    if (!activeRoom) {
        return [];
    }
    const connectedIds = resolveConnectedRoomIds(core.rooms, activeRoom.id);
    return core.rooms.filter((room) => room.state === 'unexplored' && connectedIds.has(room.id));
}

export function resolveRoomTileAdjustmentOptions(
    core: BetrayalCore,
    options: { roomId?: string; orientationTurns?: 0 | 1 | 2 | 3; useHolySymbol?: boolean } = {},
): BetrayalRoomTileAdjustmentOption[] {
    const explorableSlots = resolveExplorableRoomSlots(core);
    const slot = options.roomId
        ? explorableSlots.find((room) => room.id === options.roomId) ?? null
        : explorableSlots[0] ?? null;
    if (!slot) {
        return [];
    }
    const placement = resolveRoomPlacementContext(core, slot);
    const roomDraw = resolveRoomDraw(core, slot.floor, {
        useHolySymbol: Boolean(options.useHolySymbol),
        placement,
    });
    if (!roomDraw.roomTemplate || !roomDraw.resolution.requiresTileAdjustment) {
        return [];
    }
    const defaultPlacement = orientDoorwaysToEntry(roomDraw.roomTemplate.doorways, placement.entryEdge);
    const orientationTurns = options.orientationTurns ?? defaultPlacement.orientationTurns;
    if (!isRoomOrientationTurns(orientationTurns)) {
        return [];
    }
    return resolveRoomTileAdjustmentOptionsForPlacement(
        core,
        roomDraw.roomTemplate,
        placement,
        orientationTurns,
    );
}

export function resolveRoomPlacementPreview(
    core: BetrayalCore,
    options: { roomId?: string; useHolySymbol?: boolean } = {},
): BetrayalRoomPlacementPreview | null {
    const explorableSlots = resolveExplorableRoomSlots(core);
    const slot = options.roomId
        ? explorableSlots.find((room) => room.id === options.roomId) ?? null
        : explorableSlots[0] ?? null;
    if (!slot) {
        return null;
    }
    const placement = resolveRoomPlacementContext(core, slot);
    const roomDraw = resolveRoomDraw(core, slot.floor, {
        useHolySymbol: Boolean(options.useHolySymbol),
        placement,
    });
    const skippedRoomTemplate = roomDraw.skippedRoomTemplate;
    const roomTemplate = roomDraw.roomTemplate;
    if (!roomTemplate) {
        return null;
    }
    const deckKind = resolveRoomTemplateDiscoveryDeckKind(roomTemplate);
    const defaultPlacement = orientDoorwaysToEntry(roomTemplate.doorways, placement.entryEdge);
    const orientationOptions = resolveRoomPlacementOrientationOptions(
        core,
        roomTemplate,
        placement,
        roomDraw.selectedRoomRequiresOpenFrontier,
    );
    const defaultOrientationTurns = orientationOptions.some((option) => option.orientationTurns === defaultPlacement.orientationTurns)
        ? defaultPlacement.orientationTurns
        : orientationOptions[0]?.orientationTurns ?? defaultPlacement.orientationTurns;
    const defaultDoorways = orientationOptions.find((option) => option.orientationTurns === defaultOrientationTurns)?.doorways
        ?? defaultPlacement.doorways;
    const tileAdjustmentOptions = roomDraw.resolution.requiresTileAdjustment
        ? resolveRoomTileAdjustmentOptionsForPlacement(core, roomTemplate, placement, defaultOrientationTurns)
        : [];

    return {
        slotId: slot.id,
        floor: slot.floor,
        entryRoomId: placement.entryRoomId,
        entryEdge: placement.entryEdge,
        deckKind,
        skippedRoomName: skippedRoomTemplate?.name,
        buriedRoomNames: roomDraw.resolution.buriedRoomTiles.map((room) => room.name),
        room: {
            name: roomTemplate.name,
            hint: roomTemplate.hint,
            tags: roomTemplate.tags,
            discoveryReward: deckKind,
            visualId: roomTemplate.visualId,
            doorways: defaultDoorways,
            backVisualId: slot.backVisualId,
            orientationTurns: defaultOrientationTurns,
            discoveryEffect: roomTemplate.discoveryEffect,
            endTurnEffect: roomTemplate.endTurnEffect,
            enterEffect: roomTemplate.enterEffect,
        },
        orientationOptions,
        defaultOrientationTurns,
        requiresTileAdjustment: roomDraw.resolution.requiresTileAdjustment,
        tileAdjustmentOptions,
    };
}

function roomDiscoverySymbolToDeckKind(symbol: BetrayalRoomDiscoverySymbol): BetrayalDeckKind | null {
    return symbol === 'none' ? null : symbol;
}

export function resolveRoomTemplateDiscoveryDeckKind(roomTemplate: RoomTemplate): BetrayalDeckKind | null {
    return roomDiscoverySymbolToDeckKind(resolveBetrayalRoomDiscoverySymbol(roomTemplate));
}

export function hasAvailableDiscoveryDeckCard(core: BetrayalCore, deckKind: BetrayalDeckKind): boolean {
    if (core.deckCounts[deckKind] <= 0) {
        return false;
    }
    if (deckKind === 'event') {
        return core.eventOrder.length > 0;
    }
    return core.possessionOrderByKind[deckKind].length > 0;
}

export interface ResolvedRoomDraw {
    roomTemplate: RoomTemplate | null;
    skippedRoomTemplate: RoomTemplate | null;
    selectedRoomRequiresOpenFrontier: boolean;
    resolution: BetrayalRoomDrawResolution;
}

interface ResolveRoomDrawOptions {
    useHolySymbol?: boolean;
    placement?: RoomPlacementContext;
}

function makeSelectedRoomSummary(
    entry: BetrayalRoomDiscoveryDeckEntry,
): NonNullable<BetrayalRoomDrawResolution['selectedRoom']> {
    return {
        floor: entry.floor,
        name: entry.room.name,
        visualId: entry.room.visualId,
    };
}

function resolveLegacyRoomDraw(
    core: BetrayalCore,
    floor: BetrayalRoomFloor,
    options: ResolveRoomDrawOptions = {},
): ResolvedRoomDraw {
    const pool = core.roomDiscoveryOrderByFloor[floor];
    const discoveredCount = core.rooms.filter((room) => room.floor === floor && room.state === 'discovered' && !room.startingTile).length;
    const orderedEntries = pool.map((_, offset) => ({
        floor,
        room: cloneRoomTemplate(pool[(discoveredCount + offset) % pool.length]!),
    }));
    const buriedRoomTiles: BetrayalBuriedRoomTileSummary[] = [];
    let skippedRoomTemplate: RoomTemplate | null = null;
    let selectedEntry: BetrayalRoomDiscoveryDeckEntry | null = null;
    let selectedRoomRequiresOpenFrontier = false;
    let requiresTileAdjustment = false;

    for (let index = 0; index < orderedEntries.length; index += 1) {
        const entry = orderedEntries[index]!;
        if (options.useHolySymbol && !skippedRoomTemplate) {
            skippedRoomTemplate = cloneRoomTemplate(entry.room);
            buriedRoomTiles.push(summarizeBuriedRoomTile(entry, 'holySymbol'));
            continue;
        }
        const hasLaterSameFloor = orderedEntries.slice(index + 1).some((candidate) => candidate.floor === floor);
        if (options.placement) {
            const connectionOptions = resolveRoomPlacementOrientationOptions(core, entry.room, options.placement, false);
            const openFrontierOptions = resolveRoomPlacementOrientationOptions(core, entry.room, options.placement, true);
            if (connectionOptions.length === 0) {
                buriedRoomTiles.push(summarizeBuriedRoomTile(entry, 'sealedRegion'));
                continue;
            }
            if (openFrontierOptions.length === 0) {
                if (hasLaterSameFloor) {
                    buriedRoomTiles.push(summarizeBuriedRoomTile(entry, 'sealedRegion'));
                    continue;
                }
                requiresTileAdjustment = true;
            }
        }
        selectedEntry = entry;
        selectedRoomRequiresOpenFrontier = Boolean(options.placement && hasLaterSameFloor);
        break;
    }

    return {
        roomTemplate: selectedEntry ? cloneRoomTemplate(selectedEntry.room) : null,
        skippedRoomTemplate,
        selectedRoomRequiresOpenFrontier,
        resolution: {
            requestedFloor: floor,
            selectedRoom: selectedEntry ? makeSelectedRoomSummary(selectedEntry) : null,
            buriedRoomTiles,
            exhausted: !selectedEntry,
            requiresTileAdjustment,
            usedUnifiedDeck: false,
        },
    };
}

export function resolveRoomDraw(
    core: BetrayalCore,
    floor: BetrayalRoomFloor,
    options: ResolveRoomDrawOptions = {},
): ResolvedRoomDraw {
    const deck = core.roomDiscoveryDeck?.length
        ? core.roomDiscoveryDeck.map(cloneRoomDiscoveryDeckEntry)
        : makeRoomDiscoveryDeckFromFloorPools(core.roomDiscoveryOrderByFloor);
    if (!deck.length || !roomDiscoveryDeckMatchesFloorPools(core)) {
        return resolveLegacyRoomDraw(core, floor, options);
    }

    const buriedRoomTiles: BetrayalBuriedRoomTileSummary[] = [];
    let skippedRoomTemplate: RoomTemplate | null = null;
    let selectedEntry: BetrayalRoomDiscoveryDeckEntry | null = null;
    let selectedRoomRequiresOpenFrontier = false;
    let requiresTileAdjustment = false;

    for (let index = 0; index < deck.length; index += 1) {
        const entry = deck[index]!;
        if (entry.floor !== floor) {
            buriedRoomTiles.push(summarizeBuriedRoomTile(entry, 'areaMismatch'));
            continue;
        }
        if (options.useHolySymbol && !skippedRoomTemplate) {
            skippedRoomTemplate = cloneRoomTemplate(entry.room);
            buriedRoomTiles.push(summarizeBuriedRoomTile(entry, 'holySymbol'));
            continue;
        }
        const hasLaterSameFloor = deck.slice(index + 1).some((candidate) => candidate.floor === floor);
        if (options.placement) {
            const connectionOptions = resolveRoomPlacementOrientationOptions(core, entry.room, options.placement, false);
            const openFrontierOptions = resolveRoomPlacementOrientationOptions(core, entry.room, options.placement, true);
            if (connectionOptions.length === 0) {
                buriedRoomTiles.push(summarizeBuriedRoomTile(entry, 'sealedRegion'));
                continue;
            }
            if (openFrontierOptions.length === 0) {
                if (hasLaterSameFloor) {
                    buriedRoomTiles.push(summarizeBuriedRoomTile(entry, 'sealedRegion'));
                    continue;
                }
                requiresTileAdjustment = true;
            }
        }
        selectedEntry = entry;
        selectedRoomRequiresOpenFrontier = Boolean(options.placement && hasLaterSameFloor);
        break;
    }

    return {
        roomTemplate: selectedEntry ? cloneRoomTemplate(selectedEntry.room) : null,
        skippedRoomTemplate,
        selectedRoomRequiresOpenFrontier,
        resolution: {
            requestedFloor: floor,
            selectedRoom: selectedEntry ? makeSelectedRoomSummary(selectedEntry) : null,
            buriedRoomTiles,
            exhausted: !selectedEntry,
            requiresTileAdjustment,
            usedUnifiedDeck: true,
        },
    };
}

export function resolveBetrayalRoomDrawResolution(
    core: BetrayalCore,
    floor: BetrayalRoomFloor,
    options: { useHolySymbol?: boolean; roomId?: string } = {},
): BetrayalRoomDrawResolution {
    const slot = options.roomId
        ? resolveExplorableRoomSlots(core).find((room) => room.id === options.roomId && room.floor === floor) ?? null
        : null;
    return cloneRoomDrawResolution(resolveRoomDraw(core, floor, {
        useHolySymbol: options.useHolySymbol,
        placement: slot ? resolveRoomPlacementContext(core, slot) : undefined,
    }).resolution);
}

export function resolveNextRoomDiscoveryDeckKind(
    core: BetrayalCore,
    options: { roomId?: string; useHolySymbol?: boolean } = {},
): BetrayalDeckKind | null {
    const explorableSlots = resolveExplorableRoomSlots(core);
    const slot = options.roomId
        ? explorableSlots.find((room) => room.id === options.roomId) ?? null
        : explorableSlots[0] ?? null;
    if (!slot) {
        return null;
    }
    const placement = resolveRoomPlacementContext(core, slot);
    const roomDraw = resolveRoomDraw(core, slot.floor, {
        useHolySymbol: Boolean(options.useHolySymbol),
        placement,
    });
    return roomDraw.roomTemplate ? resolveRoomTemplateDiscoveryDeckKind(roomDraw.roomTemplate) : null;
}

function roomDiscoveryEntryMatchesSelectedRoom(
    entry: BetrayalRoomDiscoveryDeckEntry,
    selectedRoom: NonNullable<BetrayalRoomDrawResolution['selectedRoom']>,
): boolean {
    return entry.floor === selectedRoom.floor
        && entry.room.visualId === selectedRoom.visualId
        && entry.room.name === selectedRoom.name;
}

export function applyRoomDiscoveryEffect(core: BetrayalCore, effect: BetrayalRoomDiscoveryEffect | undefined): void {
    if (effect === 'gainSanity1') {
        moveExplorerTraitSteps(core.currentExplorer, 'sanity', 1);
        return;
    }
    if (effect === 'gainKnowledge1') {
        moveExplorerTraitSteps(core.currentExplorer, 'knowledge', 1);
        return;
    }
    if (effect === 'gainMight1') {
        moveExplorerTraitSteps(core.currentExplorer, 'might', 1);
        return;
    }
    if (effect === 'gainSpeed1') {
        moveExplorerTraitSteps(core.currentExplorer, 'speed', 1);
    }
}

function createDrawnCardsUntilWeapon(core: BetrayalCore): { weapon: BetrayalInventoryCard | null; buriedCards: BetrayalInventoryCard[] } {
    const itemDeck = core.possessionOrderByKind.item;
    if (itemDeck.length === 0) {
        return { weapon: null, buriedCards: [] };
    }
    const revealedCards: BetrayalInventoryCard[] = [];
    for (let index = 0; index < itemDeck.length; index += 1) {
        const template = itemDeck[index]!;
        const card = {
            id: `${template.id}-armory-${core.exploreIndex}-${index}`,
            name: template.name,
            kind: template.kind,
        };
        revealedCards.push(card);
        if (isAttackWeaponCard(card)) {
            return {
                weapon: card,
                buriedCards: revealedCards.slice(0, -1),
            };
        }
    }
    return { weapon: null, buriedCards: revealedCards };
}

export function resolveRoomDiscoveryCards(
    core: BetrayalCore,
    effect: BetrayalRoomDiscoveryEffect | undefined,
): BetrayalRoomDiscoveryCards {
    if (effect !== 'drawUntilWeapon') {
        return {};
    }
    const result = createDrawnCardsUntilWeapon(core);
    return {
        roomDiscoveryCards: result.weapon ? [result.weapon] : [],
        buriedRoomDiscoveryCards: result.buriedCards,
    };
}

export function createRoomDiscoveryEffectResolutionSteps(
    roomName: string,
    effect: BetrayalRoomDiscoveryEffect | undefined,
): BetrayalDiscoveryResolutionStep[] {
    const label = (() => {
        switch (effect) {
            case 'gainSanity1':
                return `${TRAIT_LABEL.sanity} +1`;
            case 'gainKnowledge1':
                return `${TRAIT_LABEL.knowledge} +1`;
            case 'gainMight1':
                return `${TRAIT_LABEL.might} +1`;
            case 'gainSpeed1':
                return `${TRAIT_LABEL.speed} +1`;
            case 'placeObstacleToken':
                return '放置障碍物标记';
            default:
                return null;
        }
    })();
    return label
        ? [{
            id: `room-effect-${effect}`,
            kind: 'room-effect',
            text: `房间效果：${roomName}，${label}`,
        }]
        : [];
}

export function getRoomDiscoveryRewardNames(
    roomDiscoveryCards: BetrayalRoomDiscoveryCards,
): { gained: string[]; buried: string[] } {
    return {
        gained: roomDiscoveryCards.roomDiscoveryCards?.map((card) => card.name) ?? [],
        buried: roomDiscoveryCards.buriedRoomDiscoveryCards?.map((card) => card.name) ?? [],
    };
}

export function createRoomDiscoveryCardResolutionSteps(
    roomName: string,
    roomDiscoveryCards: BetrayalRoomDiscoveryCards,
): BetrayalDiscoveryResolutionStep[] {
    const rewardNames = getRoomDiscoveryRewardNames(roomDiscoveryCards);
    return [
        ...rewardNames.buried.map((name, index) => ({
            id: `buried-room-discovery-card-${roomDiscoveryCards.buriedRoomDiscoveryCards?.[index]?.id ?? index}`,
            kind: 'buried-room-discovery-card' as const,
            text: `展示后埋葬${name}`,
            deckKind: 'item' as const,
            cardId: roomDiscoveryCards.buriedRoomDiscoveryCards?.[index]?.id,
        })),
        ...rewardNames.gained.map((name, index) => ({
            id: `room-discovery-card-${roomDiscoveryCards.roomDiscoveryCards?.[index]?.id ?? index}`,
            kind: 'room-discovery-card' as const,
            text: `${roomName}获得${name}`,
            deckKind: 'item' as const,
            cardId: roomDiscoveryCards.roomDiscoveryCards?.[index]?.id,
        })),
    ];
}

export function formatRoomDiscoveryRewardDetailParts(
    roomName: string,
    roomDiscoveryCards: BetrayalRoomDiscoveryCards,
): string[] {
    const rewardNames = getRoomDiscoveryRewardNames(roomDiscoveryCards);
    return [
        rewardNames.buried.length > 0
            ? `展示后埋葬${rewardNames.buried.join('、')}`
            : null,
        rewardNames.gained.length > 0
            ? `${roomName}获得${rewardNames.gained.join('、')}`
            : null,
    ].filter((part): part is string => Boolean(part));
}

export type BetrayalRoomExploredPlacementPayload = {
    roomId: string;
    room: Pick<
        BetrayalRoomNode,
        | 'name'
        | 'hint'
        | 'tags'
        | 'discoveryReward'
        | 'visualId'
        | 'doorways'
        | 'backVisualId'
        | 'orientationTurns'
        | 'discoveryEffect'
        | 'endTurnEffect'
        | 'enterEffect'
    >;
    roomTileAdjustment?: BetrayalRoomTileAdjustmentSelection;
};

export function createBetrayalRoomExploredRoomPayload(options: {
    roomTemplate: RoomTemplate;
    roomSlot: Pick<BetrayalRoomNode, 'backVisualId'>;
    discoveryReward: BetrayalDeckKind | null;
    selectedOrientation: { doorways: BetrayalRoomDoorway[]; orientationTurns: 0 | 1 | 2 | 3 };
}): BetrayalRoomExploredPlacementPayload['room'] {
    return {
        name: options.roomTemplate.name,
        hint: options.roomTemplate.hint,
        tags: options.roomTemplate.tags,
        discoveryReward: options.discoveryReward,
        visualId: options.roomTemplate.visualId,
        doorways: options.selectedOrientation.doorways,
        backVisualId: options.roomSlot.backVisualId,
        orientationTurns: options.selectedOrientation.orientationTurns,
        discoveryEffect: options.roomTemplate.discoveryEffect,
        endTurnEffect: options.roomTemplate.endTurnEffect,
        enterEffect: options.roomTemplate.enterEffect,
    };
}

export function applyBetrayalRoomExploredPlacementState(
    core: BetrayalCore,
    payload: BetrayalRoomExploredPlacementPayload,
): void {
    if (payload.roomTileAdjustment) {
        const adjustedRooms = materializeRoomsAfterTileAdjustment(core.rooms, payload.roomTileAdjustment);
        if (adjustedRooms) {
            core.rooms = adjustedRooms;
        }
    }

    const targetRoom = core.rooms.find((room) => room.id === payload.roomId);
    if (targetRoom) {
        targetRoom.name = payload.room.name;
        targetRoom.hint = payload.room.hint;
        targetRoom.tags = [...payload.room.tags];
        targetRoom.state = 'discovered';
        targetRoom.discoveryReward = payload.room.discoveryReward;
        targetRoom.visualId = payload.room.visualId;
        targetRoom.doorways = payload.room.doorways.map((doorway) => ({ ...doorway }));
        targetRoom.backVisualId = payload.room.backVisualId;
        targetRoom.discoveryEffect = payload.room.discoveryEffect;
        targetRoom.endTurnEffect = payload.room.endTurnEffect;
        targetRoom.enterEffect = payload.room.enterEffect;
        targetRoom.entryRoomId = core.activeRoomId;
        const reverseDoorway = core.rooms
            .find((room) => room.id === core.activeRoomId)
            ?.doorways.find((doorway) => doorway.connectsToRoomId === targetRoom.id);
        targetRoom.entryEdge = reverseDoorway?.edge ?? targetRoom.doorways[0]?.edge ?? 'west';
        targetRoom.orientationTurns = payload.room.orientationTurns;
        const connectionEdge = resolveOppositeRoomEdge(targetRoom.entryEdge);
        let connectedToEntry = false;
        targetRoom.doorways = targetRoom.doorways.map((doorway) => {
            if (doorway.connectsToRoomId === core.activeRoomId) {
                connectedToEntry = true;
                return doorway;
            }
            if (!connectedToEntry && doorway.edge === connectionEdge && !doorway.connectsToRoomId) {
                connectedToEntry = true;
                return {
                    ...doorway,
                    connectsToRoomId: core.activeRoomId,
                };
            }
            return doorway;
        });
        if (!connectedToEntry) {
            targetRoom.doorways = [
                ...targetRoom.doorways,
                {
                    edge: connectionEdge,
                    connectsToRoomId: core.activeRoomId,
                },
            ];
        }
        const newlyConnectedIds = targetRoom.doorways
            .map((doorway) => doorway.connectsToRoomId)
            .filter((roomId): roomId is string => Boolean(roomId));
        targetRoom.connectedRoomIds = Array.from(new Set([
            ...targetRoom.connectedRoomIds,
            ...newlyConnectedIds,
        ]));
        if (payload.room.discoveryEffect === 'placeObstacleToken') {
            targetRoom.markerTokens = Array.from(new Set([...(targetRoom.markerTokens ?? []), 'obstacle']));
        }
    }

    core.currentExplorer.roomId = payload.roomId;
    core.rooms = refreshExplorableRoomSlots(core.rooms);
}

export function resolveBetrayalExploreRoomCommandPayload({
    placementPreview,
    selectedOrientation,
    roomTileAdjustment,
    useHolySymbol,
    useIdol,
    ignoreEventSymbolWithTraitorPower,
}: {
    placementPreview: BetrayalRoomPlacementPreview | null;
    selectedOrientation: Pick<BetrayalRoomPlacementPreview['orientationOptions'][number], 'orientationTurns'> | null;
    roomTileAdjustment: BetrayalRoomTileAdjustmentSelection | null;
    useHolySymbol: boolean;
    useIdol: boolean;
    ignoreEventSymbolWithTraitorPower: boolean;
}): BetrayalExploreRoomCommandPayload | null {
    if (
        !placementPreview
        || !selectedOrientation
        || (placementPreview.requiresTileAdjustment && !roomTileAdjustment)
    ) {
        return null;
    }
    return {
        roomId: placementPreview.slotId,
        orientationTurns: selectedOrientation.orientationTurns,
        ...(roomTileAdjustment ? { roomTileAdjustment } : {}),
        ...(useHolySymbol ? { useHolySymbol: true } : {}),
        ...(useIdol ? { useIdol: true } : {}),
        ...(ignoreEventSymbolWithTraitorPower ? { ignoreEventSymbolWithTraitorPower: true } : {}),
    };
}

export function applyRoomDrawResolutionToCore(
    core: BetrayalCore,
    resolution: BetrayalRoomDrawResolution | undefined,
): void {
    if (!resolution) {
        core.latestRoomDrawResolution = null;
        return;
    }
    const clonedResolution = cloneRoomDrawResolution(resolution);
    core.latestRoomDrawResolution = clonedResolution;
    if (clonedResolution.buriedRoomTiles.length > 0) {
        core.buriedRoomTiles = [
            ...(core.buriedRoomTiles ?? []).map(cloneBuriedRoomTileSummary),
            ...clonedResolution.buriedRoomTiles.map(cloneBuriedRoomTileSummary),
        ];
    }
    if (!clonedResolution.usedUnifiedDeck || !clonedResolution.selectedRoom) {
        return;
    }

    const deck = (core.roomDiscoveryDeck ?? makeRoomDiscoveryDeckFromFloorPools(core.roomDiscoveryOrderByFloor))
        .map(cloneRoomDiscoveryDeckEntry);
    const selectedIndex = deck.findIndex((entry) => roomDiscoveryEntryMatchesSelectedRoom(entry, clonedResolution.selectedRoom!));
    if (selectedIndex < 0) {
        return;
    }
    const buriedEntries = deck.slice(0, selectedIndex);
    core.roomDiscoveryDeck = [
        ...deck.slice(selectedIndex + 1),
        ...buriedEntries,
    ];
    core.roomDiscoveryOrderByFloor = groupRoomDiscoveryDeckByFloor(core.roomDiscoveryDeck);
}
