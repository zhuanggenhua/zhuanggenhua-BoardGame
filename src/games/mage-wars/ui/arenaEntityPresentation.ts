import type { PlayerId } from '../../../engine/types';
import { getPresetMageSetupFromConfig } from '../data/configPackage';
import type {
    MageWarsArenaObjectState,
    MageWarsCore,
    MageWarsPlayerState,
} from '../domain';
import type { ArenaZoneId } from '../domain/ids';

export type SeatOwnerSide = 'seat-left' | 'seat-right' | 'neutral';

export function isPlayerId(value: string | null | undefined): value is PlayerId {
    return value != null;
}

export function resolveMageWarsPhaseActorId(core: MageWarsCore): PlayerId {
    return core.phaseActorId ?? core.currentPlayerId;
}

export function isMageWarsAttachmentObject(object: MageWarsArenaObjectState): boolean {
    if (object.kind === 'equipment') {
        return object.anchoredToPlayerId !== undefined || object.anchoredToObjectId !== undefined;
    }
    if (object.kind !== 'enchantment') return false;
    return object.anchoredToPlayerId !== undefined
        || object.anchoredToObjectId !== undefined
        || object.anchoredToZoneId !== undefined;
}

export function isMageWarsMageAttachmentObject(
    object: MageWarsArenaObjectState,
    playerId: PlayerId,
): boolean {
    return isMageWarsAttachmentObject(object) && object.anchoredToPlayerId === playerId;
}

export function isMageWarsObjectAttachmentObject(
    object: MageWarsArenaObjectState,
    hostObjectId: string,
): boolean {
    return isMageWarsAttachmentObject(object) && object.anchoredToObjectId === hostObjectId;
}

export function isMageWarsZoneAttachmentObject(
    object: MageWarsArenaObjectState,
    zoneId: ArenaZoneId,
): boolean {
    return isMageWarsAttachmentObject(object) && object.anchoredToZoneId === zoneId;
}

export function resolveViewingPlayerId(core: MageWarsCore, playerID: string | null): PlayerId {
    if (isPlayerId(playerID) && core.players[playerID]) return playerID;
    return core.currentPlayerId;
}

export function resolveOpponentId(core: MageWarsCore, playerId: PlayerId): PlayerId | null {
    return core.playerOrder.find((candidate) => candidate !== playerId) ?? null;
}

export function resolveSeatOwnerSide(core: MageWarsCore, playerId: PlayerId | undefined): SeatOwnerSide {
    if (playerId == null) return 'neutral';
    const seatIndex = core.playerOrder.indexOf(playerId);
    if (seatIndex === 0) return 'seat-left';
    if (seatIndex === 1) return 'seat-right';
    return 'neutral';
}

export function getMageDisplayLabel(player: MageWarsPlayerState): string {
    return getPresetMageSetupFromConfig(player.mageId).displayName;
}
