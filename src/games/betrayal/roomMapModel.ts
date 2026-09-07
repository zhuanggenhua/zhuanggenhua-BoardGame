import type {
  BetrayalCore,
  BetrayalExplorerSummary,
  BetrayalMonsterSummary,
  BetrayalRoomEdge,
  BetrayalRoomNode,
  BetrayalRoomTileAdjustmentOption,
  BetrayalRoomTileAdjustmentSelection,
  BetrayalRoomVisualId,
} from "./game";

export const ROOM_TILE_SIZE = 184;
const ROOM_TILE_STEP_X = 184;
const ROOM_TILE_STEP_Y = 184;
const ROOM_CANVAS_PADDING = 8;
export const ROOM_CANVAS_MIN_WIDTH = 780;
export const ROOM_CANVAS_MIN_HEIGHT = 560;

export const FLOOR_TONE: Record<
  BetrayalCore["rooms"][number]["floor"],
  { label: string; accent: string; glow: string }
> = {
  ground: { label: "一层", accent: "#c5a56c", glow: "rgba(197,165,108,0.32)" },
  upper: { label: "二层", accent: "#8ba98d", glow: "rgba(139,169,141,0.28)" },
  basement: {
    label: "地下",
    accent: "#8b6b78",
    glow: "rgba(139,107,120,0.26)",
  },
};

export const ROOM_MAP_FLOOR_ORDER: BetrayalRoomNode["floor"][] = [
  "upper",
  "ground",
  "basement",
];

export type RoomOrientationTurns = 0 | 1 | 2 | 3;

export const ROOM_ORIENTATION_DEGREES: Record<RoomOrientationTurns, number> = {
  0: 0,
  1: 90,
  2: 180,
  3: 270,
};

export const ROOM_EDGE_VECTOR: Record<BetrayalRoomEdge, { x: number; y: number }> = {
  north: { x: 0, y: -1 },
  east: { x: 1, y: 0 },
  south: { x: 0, y: 1 },
  west: { x: -1, y: 0 },
};

const STARTING_FRONTIER_SLOT_IDS: Record<
  string,
  Partial<Record<BetrayalRoomEdge, string>>
> = {
  "upper-landing": {
    north: "upper-north",
    west: "upper-west",
  },
  hallway: {
    north: "ground-north",
    south: "ground-south",
  },
  "entrance-hall": {
    east: "ground-east",
  },
  "basement-landing": {
    east: "basement-east",
    south: "basement-south",
  },
};

export function cloneBetrayalRoom(room: BetrayalRoomNode): BetrayalRoomNode {
  return {
    ...room,
    connectedRoomIds: [...room.connectedRoomIds],
    tags: [...room.tags],
    doorways: room.doorways.map((doorway) => ({ ...doorway })),
    markerTokens: room.markerTokens ? [...room.markerTokens] : undefined,
  };
}

export function roomTileAdjustmentSelectionsMatch(
  left: BetrayalRoomTileAdjustmentSelection,
  right: BetrayalRoomTileAdjustmentSelection,
): boolean {
  return (
    left.roomId === right.roomId &&
    left.x === right.x &&
    left.y === right.y &&
    left.entryRoomId === right.entryRoomId &&
    left.entryEdge === right.entryEdge &&
    left.orientationTurns === right.orientationTurns
  );
}

export function toRoomTileAdjustmentSelection(
  option: BetrayalRoomTileAdjustmentOption,
): BetrayalRoomTileAdjustmentSelection {
  return {
    roomId: option.roomId,
    x: option.x,
    y: option.y,
    entryRoomId: option.entryRoomId,
    entryEdge: option.entryEdge,
    orientationTurns: option.orientationTurns,
  };
}

type RoomCanvasStyle = {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
};

export type RoomCanvasLayout = {
  style: RoomCanvasStyle;
  offsetX: number;
  offsetY: number;
};

const FIXED_LINK_ROOM_IDS_BY_VISUAL_ID: Partial<
  Record<BetrayalRoomVisualId, string>
> = {
  secretStaircase: "hallway",
};

const FIXED_LINK_TARGET_VISUAL_IDS_BY_VISUAL_ID: Partial<
  Record<BetrayalRoomVisualId, BetrayalRoomVisualId>
> = {
  graveyard: "undergroundCavern",
  undergroundCavern: "graveyard",
  gallery: "ballroom",
};

export function roomDistanceByLayout(
  a: BetrayalRoomNode,
  b: BetrayalRoomNode,
): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function isStraightLineVisible(
  a: BetrayalRoomNode,
  b: BetrayalRoomNode,
  rooms: BetrayalRoomNode[],
): boolean {
  if (a.floor !== b.floor) {
    return false;
  }
  if (a.x !== b.x && a.y !== b.y) {
    return false;
  }
  const candidates = rooms.filter(
    (room) => room.floor === a.floor && room.state === "discovered",
  );
  if (a.x === b.x) {
    const [start, end] = a.y < b.y ? [a.y, b.y] : [b.y, a.y];
    for (let y = start; y <= end; y += 1) {
      if (!candidates.some((room) => room.x === a.x && room.y === y)) {
        return false;
      }
    }
    return true;
  }
  const [start, end] = a.x < b.x ? [a.x, b.x] : [b.x, a.x];
  for (let x = start; x <= end; x += 1) {
    if (!candidates.some((room) => room.x === x && room.y === a.y)) {
      return false;
    }
  }
  return true;
}

export function isBetrayalRoomInLineOfSight(
  core: BetrayalCore,
  sourceRoomId: string,
  targetRoomId: string,
): boolean {
  const sourceRoom = core.rooms.find(
    (room) => room.id === sourceRoomId && room.state === "discovered",
  );
  const targetRoom = core.rooms.find(
    (room) => room.id === targetRoomId && room.state === "discovered",
  );
  return Boolean(
    sourceRoom && targetRoom && isStraightLineVisible(sourceRoom, targetRoom, core.rooms),
  );
}

export function resolveBetrayalLineOfSightRoomIds(
  core: BetrayalCore,
  sourceRoomId: string,
): string[] {
  return core.rooms
    .filter(
      (room) =>
        room.state === "discovered" &&
        isBetrayalRoomInLineOfSight(core, sourceRoomId, room.id),
    )
    .map((room) => room.id);
}

export function resolveFloorLabel(floor: BetrayalRoomNode["floor"]): string {
  return FLOOR_TONE[floor].label;
}

export function resolveOppositeRoomEdge(
  edge: BetrayalRoomEdge,
): BetrayalRoomEdge {
  switch (edge) {
    case "north":
      return "south";
    case "east":
      return "west";
    case "south":
      return "north";
    case "west":
    default:
      return "east";
  }
}

export function resolveDoorwayConnectionEdge(
  fromRoom: BetrayalRoomNode,
  targetRoomId: string,
): BetrayalRoomEdge | null {
  return (
    fromRoom.doorways.find((doorway) => doorway.connectsToRoomId === targetRoomId)
      ?.edge ?? null
  );
}

function resolveBackVisualId(
  floor: BetrayalRoomNode["floor"],
): Extract<BetrayalRoomVisualId, "backUpper" | "backGround" | "backBasement"> {
  if (floor === "upper") {
    return "backUpper";
  }
  if (floor === "basement") {
    return "backBasement";
  }
  return "backGround";
}

function createFrontierSlotId(
  fromRoom: BetrayalRoomNode,
  edge: BetrayalRoomEdge,
): string {
  return STARTING_FRONTIER_SLOT_IDS[fromRoom.id]?.[edge] ?? `frontier-${fromRoom.id}-${edge}`;
}

export function refreshExplorableRoomSlots(
  rooms: BetrayalRoomNode[],
): BetrayalRoomNode[] {
  const discoveredRooms = rooms
    .filter((room) => room.state === "discovered")
    .map(cloneBetrayalRoom);
  const discoveredIds = new Set(discoveredRooms.map((room) => room.id));

  for (const room of discoveredRooms) {
    room.connectedRoomIds = room.connectedRoomIds.filter((roomId) =>
      discoveredIds.has(roomId),
    );
    room.doorways = room.doorways.map((doorway) =>
      doorway.connectsToRoomId && !discoveredIds.has(doorway.connectsToRoomId)
        ? {
            edge: doorway.edge,
            leadsToFloor: doorway.leadsToFloor,
            note: doorway.note,
          }
        : { ...doorway },
    );
  }

  const occupiedPositions = new Set(
    discoveredRooms.map((room) => `${room.floor}:${room.x}:${room.y}`),
  );
  const frontierSlots: BetrayalRoomNode[] = [];

  for (const room of discoveredRooms) {
    for (const doorway of room.doorways) {
      if (doorway.connectsToRoomId || doorway.leadsToFloor) {
        continue;
      }
      const vector = ROOM_EDGE_VECTOR[doorway.edge];
      const x = room.x + vector.x;
      const y = room.y + vector.y;
      const positionKey = `${room.floor}:${x}:${y}`;
      if (occupiedPositions.has(positionKey)) {
        const neighbor = discoveredRooms.find(
          (item) => item.floor === room.floor && item.x === x && item.y === y,
        );
        const neighborDoorway = neighbor?.doorways.find(
          (item) => item.edge === resolveOppositeRoomEdge(doorway.edge),
        );
        if (neighbor && neighborDoorway) {
          doorway.connectsToRoomId = neighbor.id;
          neighborDoorway.connectsToRoomId = room.id;
          room.connectedRoomIds = Array.from(
            new Set([...room.connectedRoomIds, neighbor.id]),
          );
          neighbor.connectedRoomIds = Array.from(
            new Set([...neighbor.connectedRoomIds, room.id]),
          );
        }
        continue;
      }

      const existingSlot = frontierSlots.find(
        (slot) => slot.floor === room.floor && slot.x === x && slot.y === y,
      );
      if (existingSlot) {
        doorway.connectsToRoomId = existingSlot.id;
        room.connectedRoomIds = Array.from(
          new Set([...room.connectedRoomIds, existingSlot.id]),
        );
        if (!existingSlot.doorways.some((slotDoorway) => slotDoorway.connectsToRoomId === room.id)) {
          existingSlot.doorways = [
            ...existingSlot.doorways,
            { edge: resolveOppositeRoomEdge(doorway.edge), connectsToRoomId: room.id },
          ];
          existingSlot.connectedRoomIds = Array.from(
            new Set([...existingSlot.connectedRoomIds, room.id]),
          );
        }
        continue;
      }

      const backVisualId = resolveBackVisualId(room.floor);
      const slot: BetrayalRoomNode = {
        id: createFrontierSlotId(room, doorway.edge),
        name: "未探索",
        floor: room.floor,
        x,
        y,
        connectedRoomIds: [room.id],
        entryRoomId: room.id,
        entryEdge: doorway.edge,
        orientationTurns: 0,
        state: "unexplored",
        hint: `等待从${room.name}翻出房间`,
        tags: ["待翻出"],
        discoveryReward: null,
        visualId: backVisualId,
        doorways: [
          { edge: resolveOppositeRoomEdge(doorway.edge), connectsToRoomId: room.id },
        ],
        backVisualId,
      };
      doorway.connectsToRoomId = slot.id;
      room.connectedRoomIds = Array.from(
        new Set([...room.connectedRoomIds, slot.id]),
      );
      frontierSlots.push(slot);
      occupiedPositions.add(positionKey);
    }
  }

  return [...discoveredRooms, ...frontierSlots];
}

export function buildRoomOccupants(
  core: BetrayalCore,
): Record<string, BetrayalExplorerSummary[]> {
  const occupants: Record<string, BetrayalExplorerSummary[]> = {};
  for (const explorer of [core.currentExplorer, ...core.otherExplorers]) {
    occupants[explorer.roomId] ??= [];
    occupants[explorer.roomId]!.push(explorer);
  }
  return occupants;
}

export function buildRoomMonsters(
  core: BetrayalCore,
): Record<string, BetrayalMonsterSummary[]> {
  const monsters: Record<string, BetrayalMonsterSummary[]> = {};
  for (const monster of core.monsters) {
    monsters[monster.roomId] ??= [];
    monsters[monster.roomId]!.push(monster);
  }
  return monsters;
}

export function resolveOccupiedRoomMapFloors(
  core: BetrayalCore,
): BetrayalRoomNode["floor"][] {
  const roomFloorById = new Map(
    core.rooms.map((room) => [room.id, room.floor]),
  );
  const occupiedFloors = new Set<BetrayalRoomNode["floor"]>();
  for (const explorer of [core.currentExplorer, ...core.otherExplorers]) {
    const floor = roomFloorById.get(explorer.roomId);
    if (floor) {
      occupiedFloors.add(floor);
    }
  }
  for (const monster of core.monsters) {
    const floor = roomFloorById.get(monster.roomId);
    if (floor) {
      occupiedFloors.add(floor);
    }
  }
  return ROOM_MAP_FLOOR_ORDER.filter((floor) => occupiedFloors.has(floor));
}

export type BetrayalBoardRoomMapFloorState = {
  floors: BetrayalRoomNode["floor"][];
  upperFloor: BetrayalRoomNode["floor"] | null;
  lowerFloor: BetrayalRoomNode["floor"] | null;
  upperFloorHasSelectionTarget: boolean;
  lowerFloorHasSelectionTarget: boolean;
  hasCrossFloorSelectionTargets: boolean;
};

export function resolveBetrayalBoardRoomMapFloorState({
  occupiedRoomMapFloors,
  currentExplorerFloor,
  selectedRoomMapFloor,
  moveTargetRooms,
  interactionMode,
  selectedInventoryUseEffectMode,
  inventoryTargetRooms,
  maskTargetRooms,
  explorableRoomSlots,
  bloodFromStoneSetupPendingPlayerChoiceCount,
  bloodFromStoneSetupCandidateRooms,
  pendingEventTargetRooms,
  isBloodFromStoneSetupPlacementMode,
}: {
  occupiedRoomMapFloors: BetrayalRoomNode["floor"][];
  currentExplorerFloor: BetrayalRoomNode["floor"];
  selectedRoomMapFloor: BetrayalRoomNode["floor"];
  moveTargetRooms: BetrayalRoomNode[];
  interactionMode: string;
  selectedInventoryUseEffectMode: string | null;
  inventoryTargetRooms: BetrayalRoomNode[];
  maskTargetRooms: BetrayalRoomNode[];
  explorableRoomSlots: BetrayalRoomNode[];
  bloodFromStoneSetupPendingPlayerChoiceCount: number;
  bloodFromStoneSetupCandidateRooms: BetrayalRoomNode[];
  pendingEventTargetRooms: BetrayalRoomNode[];
  isBloodFromStoneSetupPlacementMode: boolean;
}): BetrayalBoardRoomMapFloorState {
  const floors = new Set<BetrayalRoomNode["floor"]>(occupiedRoomMapFloors);
  floors.add(currentExplorerFloor);
  if (moveTargetRooms.length > 0 || interactionMode === "move") {
    for (const room of moveTargetRooms) {
      floors.add(room.floor);
    }
  }
  if (selectedInventoryUseEffectMode === "placeExplorer") {
    for (const room of inventoryTargetRooms) {
      floors.add(room.floor);
    }
  }
  if (selectedInventoryUseEffectMode === "moveOthersInRoom") {
    for (const room of maskTargetRooms) {
      floors.add(room.floor);
    }
  }
  if (interactionMode === "explore") {
    for (const room of explorableRoomSlots) {
      floors.add(room.floor);
    }
  }
  if (
    bloodFromStoneSetupPendingPlayerChoiceCount > 0 ||
    interactionMode === "bloodFromStoneSetupPlacement"
  ) {
    for (const room of bloodFromStoneSetupCandidateRooms) {
      floors.add(room.floor);
    }
  }
  if (pendingEventTargetRooms.length > 0) {
    for (const room of pendingEventTargetRooms) {
      floors.add(room.floor);
    }
  }

  const orderedFloors = ROOM_MAP_FLOOR_ORDER.filter((floor) =>
    floors.has(floor),
  );
  const selectedRoomMapFloorIndex = orderedFloors.indexOf(selectedRoomMapFloor);
  const upperFloor =
    selectedRoomMapFloorIndex > 0
      ? orderedFloors[selectedRoomMapFloorIndex - 1]
      : null;
  const lowerFloor =
    selectedRoomMapFloorIndex >= 0 &&
    selectedRoomMapFloorIndex < orderedFloors.length - 1
      ? orderedFloors[selectedRoomMapFloorIndex + 1]
      : null;
  const targetFloors = new Set<BetrayalRoomNode["floor"]>();
  if (selectedInventoryUseEffectMode === "placeExplorer") {
    for (const room of inventoryTargetRooms) {
      targetFloors.add(room.floor);
    }
  }
  if (selectedInventoryUseEffectMode === "moveOthersInRoom") {
    for (const room of maskTargetRooms) {
      targetFloors.add(room.floor);
    }
  }
  for (const room of pendingEventTargetRooms) {
    targetFloors.add(room.floor);
  }
  if (isBloodFromStoneSetupPlacementMode) {
    for (const room of bloodFromStoneSetupCandidateRooms) {
      targetFloors.add(room.floor);
    }
  }

  const upperFloorHasSelectionTarget = upperFloor
    ? targetFloors.has(upperFloor)
    : false;
  const lowerFloorHasSelectionTarget = lowerFloor
    ? targetFloors.has(lowerFloor)
    : false;
  return {
    floors: orderedFloors,
    upperFloor,
    lowerFloor,
    upperFloorHasSelectionTarget,
    lowerFloorHasSelectionTarget,
    hasCrossFloorSelectionTargets:
      upperFloorHasSelectionTarget || lowerFloorHasSelectionTarget,
  };
}

function resolveFixedLinkTargetRoomId(
  rooms: BetrayalRoomNode[],
  room: BetrayalRoomNode,
): string | null {
  const fixedTargetRoomId = FIXED_LINK_ROOM_IDS_BY_VISUAL_ID[room.visualId];
  if (fixedTargetRoomId) {
    return fixedTargetRoomId;
  }
  const fixedTargetVisualId =
    FIXED_LINK_TARGET_VISUAL_IDS_BY_VISUAL_ID[room.visualId];
  if (!fixedTargetVisualId) {
    return null;
  }
  return (
    rooms.find(
      (item) =>
        item.state === "discovered" && item.visualId === fixedTargetVisualId,
    )?.id ?? null
  );
}

export function resolveConnectedRoomIds(
  rooms: BetrayalRoomNode[],
  roomId: string,
): Set<string> {
  const room = rooms.find((item) => item.id === roomId);
  if (!room) {
    return new Set();
  }
  const connectedIds = new Set(
    room.doorways
      .map((doorway) => doorway.connectsToRoomId)
      .filter((targetRoomId): targetRoomId is string => Boolean(targetRoomId)),
  );
  if (
    room.state === "discovered" &&
    room.markerTokens?.includes("secretPassage")
  ) {
    for (const secretPassageRoom of rooms) {
      if (
        secretPassageRoom.id !== room.id &&
        secretPassageRoom.state === "discovered" &&
        secretPassageRoom.markerTokens?.includes("secretPassage")
      ) {
        connectedIds.add(secretPassageRoom.id);
      }
    }
  }
  if (room.state === "discovered") {
    const fixedTargetRoomId = resolveFixedLinkTargetRoomId(rooms, room);
    if (fixedTargetRoomId) {
      connectedIds.add(fixedTargetRoomId);
    }
  }
  for (const sourceRoom of rooms) {
    if (sourceRoom.state !== "discovered") {
      continue;
    }
    const fixedTargetRoomId = resolveFixedLinkTargetRoomId(rooms, sourceRoom);
    if (fixedTargetRoomId === room.id) {
      connectedIds.add(sourceRoom.id);
    }
  }
  return connectedIds;
}

export function resolveDynamiteTargetRooms(
  core: BetrayalCore,
): BetrayalRoomNode[] {
  const currentRoom = core.rooms.find(
    (room) => room.id === core.currentExplorer.roomId,
  );
  if (!currentRoom || currentRoom.state !== "discovered") {
    return [];
  }
  const connectedIds = resolveConnectedRoomIds(core.rooms, currentRoom.id);
  return core.rooms.filter(
    (room) =>
      room.state === "discovered" &&
      (room.id === currentRoom.id || connectedIds.has(room.id)),
  );
}

export function formatRoomTargetList(rooms: BetrayalRoomNode[]): string {
  return Array.from(new Set(rooms.map((room) => room.name))).join(" / ");
}

function resolveRoomVisualPosition(room: BetrayalRoomNode): {
  x: number;
  y: number;
} {
  return { x: room.x, y: room.y };
}

export function resolveRoomCanvasLayout(
  rooms: BetrayalRoomNode[],
  focusRoomId: string | null = null,
): RoomCanvasLayout {
  const roomPositions = rooms.map(resolveRoomVisualPosition);
  const minX = Math.min(...roomPositions.map((position) => position.x), 1);
  const maxX = Math.max(...roomPositions.map((position) => position.x), 1);
  const minY = Math.min(...roomPositions.map((position) => position.y), 0);
  const maxY = Math.max(...roomPositions.map((position) => position.y), 1);
  const roomBoundsWidth = (maxX - minX) * ROOM_TILE_STEP_X + ROOM_TILE_SIZE;
  const roomBoundsHeight = (maxY - minY) * ROOM_TILE_STEP_Y + ROOM_TILE_SIZE;
  const width = Math.max(
    ROOM_CANVAS_MIN_WIDTH,
    ROOM_CANVAS_PADDING * 2 + roomBoundsWidth,
  );
  const height = Math.max(
    ROOM_CANVAS_MIN_HEIGHT,
    ROOM_CANVAS_PADDING * 2 + roomBoundsHeight,
  );
  const focusPosition = focusRoomId
    ? roomPositions[rooms.findIndex((room) => room.id === focusRoomId)]
    : null;

  return {
    style: {
      width,
      height,
      minWidth: width,
      minHeight: height,
    },
    offsetX: focusPosition
      ? width / 2 - focusPosition.x * ROOM_TILE_STEP_X - ROOM_TILE_SIZE / 2
      : (width - roomBoundsWidth) / 2 - minX * ROOM_TILE_STEP_X,
    offsetY: focusPosition
      ? height / 2 - focusPosition.y * ROOM_TILE_STEP_Y - ROOM_TILE_SIZE / 2
      : (height - roomBoundsHeight) / 2 - minY * ROOM_TILE_STEP_Y,
  };
}

export function resolveRoomTileStyle(
  room: BetrayalRoomNode,
  layout: RoomCanvasLayout,
): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  const roomPosition = resolveRoomVisualPosition(room);
  return {
    left: layout.offsetX + roomPosition.x * ROOM_TILE_STEP_X,
    top: layout.offsetY + roomPosition.y * ROOM_TILE_STEP_Y,
    width: ROOM_TILE_SIZE,
    height: ROOM_TILE_SIZE,
  };
}

export function resolveRoomCenterPoint(
  room: BetrayalRoomNode,
  layout: RoomCanvasLayout,
): {
  x: number;
  y: number;
} {
  const roomPosition = resolveRoomVisualPosition(room);
  return {
    x: layout.offsetX + roomPosition.x * ROOM_TILE_STEP_X + ROOM_TILE_SIZE / 2,
    y: layout.offsetY + roomPosition.y * ROOM_TILE_STEP_Y + ROOM_TILE_SIZE / 2,
  };
}

export function resolveExplorerFloor(
  core: BetrayalCore,
): BetrayalRoomNode["floor"] {
  return (
    core.rooms.find((room) => room.id === core.currentExplorer.roomId)?.floor ??
    "ground"
  );
}

export function resolveExplorerFloorByPlayer(
  core: BetrayalCore,
  playerId: string,
): BetrayalRoomNode["floor"] {
  if (core.currentExplorer.playerId === playerId) {
    return resolveExplorerFloor(core);
  }
  const explorer = core.otherExplorers.find(
    (candidate) => candidate.playerId === playerId,
  );
  return (
    core.rooms.find((room) => room.id === explorer?.roomId)?.floor ??
    resolveExplorerFloor(core)
  );
}
