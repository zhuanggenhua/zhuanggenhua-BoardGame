import type { BetrayalCore } from './game';

type BetrayalRoomEnterEffect = 'mysticElevator';
type BetrayalRoomActionText = (key: string, options?: Record<string, unknown>) => string;

export interface BetrayalRoomSpecialActionStatus {
    sourceKind: 'roomEffect';
    sourceId: BetrayalRoomEnterEffect | '';
    sourceName: string;
    active: boolean;
    canUse: boolean;
    usedThisTurn: boolean;
    availableInCurrentRoom: boolean;
    phaseEligible: boolean;
    turnEndedByDiscovery: boolean;
    reason: string | null;
}

export function resolveBetrayalRoomSpecialActionStatus(core: BetrayalCore): BetrayalRoomSpecialActionStatus {
    const currentRoom = core.rooms.find((room) => room.id === core.activeRoomId);
    const sourceId = currentRoom?.enterEffect ?? '';
    const phaseEligible = core.phase === 'preHaunt' || core.phase === 'haunt';
    const availableInCurrentRoom = Boolean(
        currentRoom?.state === 'discovered'
        && sourceId === 'mysticElevator',
    );
    const usedThisTurn = Boolean(
        sourceId
        && core.scenarioRuntime.usedRoomEffectIdsThisTurn.includes(sourceId),
    );
    const turnEndedByDiscovery = core.turnEndedByDiscovery;
    let reason: string | null = null;
    if (!phaseEligible) {
        reason = '当前阶段不能使用房间效果。';
    } else if (!availableInCurrentRoom) {
        reason = '当前房间没有可使用的房间效果。';
    } else if (turnEndedByDiscovery) {
        reason = '探索新房间后本回合已结束。';
    } else if (usedThisTurn) {
        reason = '该房间效果本回合已经使用。';
    }

    return {
        sourceKind: 'roomEffect',
        sourceId,
        sourceName: currentRoom?.name ?? sourceId,
        active: availableInCurrentRoom,
        canUse: reason === null,
        usedThisTurn,
        availableInCurrentRoom,
        phaseEligible,
        turnEndedByDiscovery,
        reason,
    };
}

export function resolveBetrayalRoomEffectActionPresentation(
    status: BetrayalRoomSpecialActionStatus,
    t: BetrayalRoomActionText,
): {
    canUse: boolean;
    shouldShowAction: boolean;
    disabledReason: string | null;
} {
    return {
        canUse: status.canUse,
        shouldShowAction: status.availableInCurrentRoom,
        disabledReason: resolveBetrayalRoomEffectDisabledReason(status, t),
    };
}

function resolveBetrayalRoomEffectDisabledReason(
    status: BetrayalRoomSpecialActionStatus,
    t: BetrayalRoomActionText,
): string | null {
    if (status.canUse) {
        return null;
    }
    if (!status.phaseEligible) {
        return t('board.status.roomEffectWrongPhase');
    }
    if (status.turnEndedByDiscovery) {
        return t('board.status.roomEffectDiscoveryEnded');
    }
    if (status.usedThisTurn) {
        return t('board.status.roomEffectUsedThisTurn');
    }
    return t('board.status.roomEffectUnavailable');
}
