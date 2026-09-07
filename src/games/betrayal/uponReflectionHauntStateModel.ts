import {
    appendActivity,
    syncCurrentExplorerProjection,
} from './coreStateModel';
import { removeEventCardForUponReflectionHint } from './eventDeckModel';
import { createUponReflectionEndgameResult } from './hauntVictoryModel';
import { clearNextNonCombatTraitRollReplacementsForPlayer } from './possessionActionReadModel';
import { BETRAYAL_TRAIT_LABEL as TRAIT_LABEL } from './possessionEffects';
import type {
    BetrayalCore,
    BetrayalEndgameResult,
} from './game';
import type { BetrayalEvent } from './events';

type UponReflectionEventHintGivenEvent = Extract<BetrayalEvent, { type: 'UPON_REFLECTION_EVENT_HINT_GIVEN' }>;
type UponReflectionCurseBreakAttemptedEvent = Extract<BetrayalEvent, { type: 'UPON_REFLECTION_CURSE_BREAK_ATTEMPTED' }>;

export interface BetrayalUponReflectionHauntStateResolution {
    core: BetrayalCore;
    scenarioCompletedResult?: BetrayalEndgameResult;
}

export function applyBetrayalUponReflectionEventHintGivenState(
    core: BetrayalCore,
    event: UponReflectionEventHintGivenEvent,
): BetrayalCore {
    const uponReflection = core.scenarioRuntime.uponReflection;
    if (!uponReflection) {
        return core;
    }
    removeEventCardForUponReflectionHint(core, event.payload.eventName);
    core.usedCardIdsThisTurn = Array.from(new Set([
        ...core.usedCardIdsThisTurn,
        'give-mirror-hint',
    ]));
    core.pendingEventChoice = null;
    core.recentRoll = null;
    uponReflection.hintedEvents = [
        ...uponReflection.hintedEvents,
        {
            revealerPlayerId: event.payload.revealerPlayerId,
            targetPlayerId: event.payload.targetPlayerId,
            eventName: event.payload.eventName,
            eventText: event.payload.eventText,
            turnNumber: event.payload.turnNumber,
        },
    ];
    const syncedCore = syncCurrentExplorerProjection(core);
    return {
        ...syncedCore,
        recommendedAction: 'endTurn',
        activityLog: appendActivity(syncedCore, event.payload.logText, 'accent'),
    };
}

export function applyBetrayalUponReflectionCurseBreakAttemptedState(
    core: BetrayalCore,
    event: UponReflectionCurseBreakAttemptedEvent,
): BetrayalUponReflectionHauntStateResolution {
    const uponReflection = core.scenarioRuntime.uponReflection;
    if (!uponReflection) {
        return { core };
    }
    core.usedCardIdsThisTurn = Array.from(new Set([
        ...core.usedCardIdsThisTurn,
        'break-mirror-curse',
    ]));
    clearNextNonCombatTraitRollReplacementsForPlayer(core, event.payload.playerId);
    uponReflection.breakAttempts = [
        ...uponReflection.breakAttempts,
        {
            playerId: event.payload.playerId,
            roomId: event.payload.roomId,
            roomName: event.payload.roomName,
            trait: event.payload.trait,
            omenId: event.payload.omenId,
            omenName: event.payload.omenName,
            rollTotal: event.payload.rollTotal,
            dice: [...event.payload.dice],
            passiveBonus: event.payload.passiveBonus,
            successRoll: event.payload.successRoll,
            combinationCorrect: event.payload.combinationCorrect,
        },
    ];
    core.recentRoll = {
        id: `${event.payload.playerId}-break-mirror-curse-${event.timestamp}`,
        kind: 'hauntActionTraitCheck',
        playerId: event.payload.playerId,
        sourceTitle: '破咒',
        trait: event.payload.trait,
        rollLabel: `${TRAIT_LABEL[event.payload.trait]}检定`,
        dice: [...event.payload.dice],
        passiveBonus: event.payload.passiveBonus,
        latestLabel: event.payload.combinationCorrect
            ? '破咒成功'
            : event.payload.successRoll
                ? '组合不正确'
                : '无反馈',
        consumedRabbitFootCardIds: [],
    };
    const syncedCore = syncCurrentExplorerProjection(core);
    const loggedCore = {
        ...syncedCore,
        recommendedAction: 'endTurn' as const,
        activityLog: appendActivity(
            syncedCore,
            event.payload.logText,
            event.payload.combinationCorrect ? 'accent' : 'warning',
        ),
    };
    if (event.payload.combinationCorrect) {
        return {
            core: loggedCore,
            scenarioCompletedResult: createUponReflectionEndgameResult(loggedCore, 'survivors'),
        };
    }
    return { core: loggedCore };
}
