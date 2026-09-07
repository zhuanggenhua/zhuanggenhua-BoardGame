import type { PlayerId } from '../../../engine/types';
import type { MageWarsCore } from '../domain';

type MageWarsTutorialRuntimeSystemState = {
    eventStream?: { nextId?: number };
    decisionEpoch?: number;
    interaction?: { current?: { id?: string } };
    responseWindow?: { current?: { id?: string; currentResponderIndex?: number } };
};

export function buildMageWarsTutorialRuntimeSyncKey({
    core,
    phase,
    phaseActorId,
    sys,
}: {
    core: MageWarsCore;
    phase: string;
    phaseActorId: PlayerId;
    sys: MageWarsTutorialRuntimeSystemState;
}): string {
    const readyPlayerIds = core.phaseReadyPlayerIds ?? [];
    const playerSyncKey = core.playerOrder.map((id) => {
        const player = core.players[id];
        if (!player) return `${id}:missing`;
        const statusKey = Object.entries(player.statusTokens ?? {})
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([statusId, count]) => `${statusId}:${count}`)
            .join(',');
        return [
            id,
            player.mageId,
            player.mageZoneId,
            player.mana,
            player.damage,
            player.actionReady ? 1 : 0,
            player.quickcastReady ? 1 : 0,
            player.guarding ? 1 : 0,
            player.preparedSpellSlots,
            player.preparedSpellCardIds.join(','),
            player.discardSpellCardIds.join(','),
            statusKey,
        ].join(':');
    }).join(';');

    const objectSyncKey = Object.values(core.objects ?? {})
        .map((object) => {
            const statusKey = Object.entries(object.statusTokens ?? {})
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([statusId, count]) => `${statusId}:${count}`)
                .join(',');
            return [
                object.id,
                object.ownerId,
                object.sourceSpellCardId,
                object.zoneId,
                object.damage,
                object.actionReady ? 1 : 0,
                object.guarding ? 1 : 0,
                statusKey,
            ].join(':');
        })
        .sort()
        .join(';');

    const wallSyncKey = Object.values(core.walls ?? {})
        .map((wall) => [
            wall.id,
            wall.ownerId,
            wall.sourceSpellCardId,
            wall.edgeId,
            wall.blocksLineOfSight ? 1 : 0,
        ].join(':'))
        .sort()
        .join(';');

    return [
        phase,
        core.currentPlayerId,
        phaseActorId,
        core.turnNumber,
        readyPlayerIds.join(','),
        playerSyncKey,
        objectSyncKey,
        wallSyncKey,
        sys.eventStream?.nextId ?? 0,
        sys.decisionEpoch ?? 0,
        sys.interaction?.current?.id ?? '',
        sys.responseWindow?.current?.id ?? '',
        sys.responseWindow?.current?.currentResponderIndex ?? '',
    ].join('|');
}
