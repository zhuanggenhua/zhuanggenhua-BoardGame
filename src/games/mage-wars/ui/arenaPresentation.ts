import type { CSSProperties } from 'react';
import type { MageWarsCore } from '../domain';
import {
    getMageWarsWallEdgeId,
    type ArenaZoneId,
    type MageWarsWallEdgeId,
} from '../domain/ids';

export const MAGE_WARS_ARENA_ASSET_WIDTH = 3210;
export const MAGE_WARS_ARENA_ASSET_HEIGHT = 2407;
export const MAGE_WARS_ARENA_WORLD_WIDTH = 1920;
export const MAGE_WARS_ARENA_WORLD_HEIGHT = MAGE_WARS_ARENA_WORLD_WIDTH * (MAGE_WARS_ARENA_ASSET_HEIGHT / MAGE_WARS_ARENA_ASSET_WIDTH);

export type ZoneRect = {
    left: number;
    top: number;
    width: number;
    height: number;
};

export type WallEdgeDescriptor = {
    edgeId: MageWarsWallEdgeId;
    zoneIds: [ArenaZoneId, ArenaZoneId];
    orientation: 'vertical' | 'horizontal';
    style: CSSProperties;
};

export type ZoneEntityDensity = 'solo' | 'duel' | 'dense' | 'packed';

export const ZONE_RECTS: Record<ArenaZoneId, ZoneRect> = {
    a1: { left: 0, top: 0, width: 25, height: 33.3333 },
    b1: { left: 25, top: 0, width: 25, height: 33.3333 },
    c1: { left: 50, top: 0, width: 25, height: 33.3333 },
    d1: { left: 75, top: 0, width: 25, height: 33.3333 },
    a2: { left: 0, top: 33.3333, width: 25, height: 33.3333 },
    b2: { left: 25, top: 33.3333, width: 25, height: 33.3333 },
    c2: { left: 50, top: 33.3333, width: 25, height: 33.3333 },
    d2: { left: 75, top: 33.3333, width: 25, height: 33.3333 },
    a3: { left: 0, top: 66.6666, width: 25, height: 33.3333 },
    b3: { left: 25, top: 66.6666, width: 25, height: 33.3333 },
    c3: { left: 50, top: 66.6666, width: 25, height: 33.3333 },
    d3: { left: 75, top: 66.6666, width: 25, height: 33.3333 },
};

const WALL_EDGE_THICKNESS = 2.3;

export function pct(value: number): string {
    return `${value}%`;
}

export function buildMageWarsWallEdgeDescriptors(core: MageWarsCore): WallEdgeDescriptor[] {
    return core.arena.flatMap((zone) => {
        const rect = ZONE_RECTS[zone.id];
        const right = core.arena.find((candidate) => candidate.row === zone.row && candidate.col === zone.col + 1);
        const down = core.arena.find((candidate) => candidate.row === zone.row + 1 && candidate.col === zone.col);
        const descriptors: WallEdgeDescriptor[] = [];

        if (right) {
            descriptors.push({
                edgeId: getMageWarsWallEdgeId(zone.id, right.id),
                zoneIds: [zone.id, right.id],
                orientation: 'vertical',
                style: {
                    left: pct(rect.left + rect.width - (WALL_EDGE_THICKNESS / 2)),
                    top: pct(rect.top + 1.2),
                    width: pct(WALL_EDGE_THICKNESS),
                    height: pct(rect.height - 2.4),
                },
            });
        }
        if (down) {
            descriptors.push({
                edgeId: getMageWarsWallEdgeId(zone.id, down.id),
                zoneIds: [zone.id, down.id],
                orientation: 'horizontal',
                style: {
                    left: pct(rect.left + 1.2),
                    top: pct(rect.top + rect.height - (WALL_EDGE_THICKNESS / 2)),
                    width: pct(rect.width - 2.4),
                    height: pct(WALL_EDGE_THICKNESS),
                },
            });
        }

        return descriptors;
    });
}

export function getZoneLaneItemStyle(
    laneIndex?: number,
    priority = false,
): CSSProperties | undefined {
    if (laneIndex == null) {
        return priority ? { zIndex: 80 } : undefined;
    }

    return {
        zIndex: priority ? 80 : 20 + laneIndex,
    };
}

export function getZoneOwnerLaneLayoutClassName(entityDensity: ZoneEntityDensity): string {
    if (entityDensity === 'packed') {
        return 'grid grid-flow-col grid-rows-3 auto-cols-max place-items-center justify-center content-center gap-x-1.5 gap-y-0.5 overflow-visible py-0.5';
    }

    if (entityDensity === 'dense') {
        return 'flex flex-col flex-nowrap content-center items-center justify-center gap-1 py-2';
    }

    return 'flex flex-col flex-nowrap content-center items-center justify-center gap-2 py-3';
}

export function getZoneOwnerLaneOverflowMode(entityDensity: ZoneEntityDensity): 'fit' | 'wrap-columns' {
    return entityDensity === 'packed' ? 'wrap-columns' : 'fit';
}

export function isBottomArenaRowZone(zoneId: ArenaZoneId): boolean {
    return zoneId.endsWith('3');
}

export function getZoneFieldCardOffsetStyle(zoneId: ArenaZoneId, hasFieldCards: boolean): CSSProperties | undefined {
    if (!hasFieldCards) return undefined;

    const offsets: Partial<Record<ArenaZoneId, { x: number; y: number }>> = {
        a1: { x: 70, y: 0 },
        a2: { x: 70, y: 0 },
        a3: { x: 70, y: 0 },
        b1: { x: 45, y: 0 },
        b2: { x: 45, y: 0 },
        b3: { x: 45, y: 0 },
        c1: { x: -45, y: 0 },
        c2: { x: -45, y: 0 },
        c3: { x: -45, y: 0 },
        d1: { x: -70, y: 0 },
        d2: { x: -70, y: 0 },
        d3: { x: -70, y: 0 },
    };
    const offset = offsets[zoneId];

    return offset ? { transform: `translate(${offset.x}px, ${offset.y}px)` } : undefined;
}
