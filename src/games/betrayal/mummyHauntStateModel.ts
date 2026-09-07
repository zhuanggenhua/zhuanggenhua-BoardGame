import {
    appendActivity,
    syncCurrentExplorerProjection,
} from './coreStateModel';
import { findExplorerByPlayerId } from './explorerReadModel';
import { createMummyEndgameResult } from './mummyHauntRules';
import { clearNextNonCombatTraitRollReplacementsForPlayer } from './possessionActionReadModel';
import { resolveRecommendedAction } from './recommendedActionReadModel';
import { resolveMummyTraitorVictoryResult } from './hauntVictoryModel';
import type {
    BetrayalCore,
    BetrayalEndgameResult,
} from './game';
import type { BetrayalEvent } from './events';

type MummyNameStudiedEvent = Extract<BetrayalEvent, { type: 'MUMMY_NAME_STUDIED' }>;
type MummyBanishmentLearnedEvent = Extract<BetrayalEvent, { type: 'MUMMY_BANISHMENT_LEARNED' }>;
type MummyBanishedEvent = Extract<BetrayalEvent, { type: 'MUMMY_BANISHED' }>;
type MummyGirlPickedUpEvent = Extract<BetrayalEvent, { type: 'MUMMY_GIRL_PICKED_UP' }>;
type MummyGirlGivenEvent = Extract<BetrayalEvent, { type: 'MUMMY_GIRL_GIVEN' }>;
type MummyOmenGivenEvent = Extract<BetrayalEvent, { type: 'MUMMY_OMEN_GIVEN' }>;

export interface BetrayalMummyHauntStateResolution {
    core: BetrayalCore;
    scenarioCompletedResult?: BetrayalEndgameResult;
}

export function applyBetrayalMummyNameStudiedState(
    core: BetrayalCore,
    event: MummyNameStudiedEvent,
): BetrayalCore {
    const mummy = core.scenarioRuntime.mummy;
    if (!mummy) {
        return core;
    }
    if (event.payload.success) {
        mummy.knowledgeTokenCount = Math.max(mummy.knowledgeTokenCount, 1);
        mummy.trueNameFound = true;
    }
    core.usedCardIdsThisTurn = Array.from(new Set([
        ...core.usedCardIdsThisTurn,
        'study-mummy-name',
    ]));
    clearNextNonCombatTraitRollReplacementsForPlayer(core, event.payload.playerId);
    core.recentRoll = {
        id: `${event.payload.playerId}-study-mummy-name-${event.timestamp}`,
        kind: 'hauntActionTraitCheck',
        playerId: event.payload.playerId,
        sourceTitle: '寻找木乃伊真名',
        trait: 'knowledge',
        rollLabel: '知识检定',
        dice: [...event.payload.dice],
        passiveBonus: event.payload.passiveBonus,
        latestLabel: event.payload.success ? '取得第 1 枚知识标记' : '未取得知识标记',
        consumedRabbitFootCardIds: [],
    };
    const syncedCore = syncCurrentExplorerProjection(core);
    return {
        ...syncedCore,
        recommendedAction: 'endTurn',
        activityLog: appendActivity(syncedCore, event.payload.logText, event.payload.success ? 'accent' : 'warning'),
    };
}

export function applyBetrayalMummyBanishmentLearnedState(
    core: BetrayalCore,
    event: MummyBanishmentLearnedEvent,
): BetrayalCore {
    const mummy = core.scenarioRuntime.mummy;
    if (!mummy) {
        return core;
    }
    if (event.payload.success) {
        mummy.knowledgeTokenCount = Math.max(mummy.knowledgeTokenCount, 2);
        mummy.banishmentSpellLearned = true;
    }
    core.usedCardIdsThisTurn = Array.from(new Set([
        ...core.usedCardIdsThisTurn,
        'learn-mummy-banishment',
    ]));
    clearNextNonCombatTraitRollReplacementsForPlayer(core, event.payload.playerId);
    core.recentRoll = {
        id: `${event.payload.playerId}-learn-mummy-banishment-${event.timestamp}`,
        kind: 'hauntActionTraitCheck',
        playerId: event.payload.playerId,
        sourceTitle: '学习驱逐法术',
        trait: 'knowledge',
        rollLabel: '知识检定',
        dice: [...event.payload.dice],
        passiveBonus: event.payload.passiveBonus,
        latestLabel: event.payload.success ? '取得第 2 枚知识标记' : '未学会驱逐法术',
        consumedRabbitFootCardIds: [],
    };
    const syncedCore = syncCurrentExplorerProjection(core);
    return {
        ...syncedCore,
        recommendedAction: 'endTurn',
        activityLog: appendActivity(syncedCore, event.payload.logText, event.payload.success ? 'accent' : 'warning'),
    };
}

export function applyBetrayalMummyBanishedState(
    core: BetrayalCore,
    event: MummyBanishedEvent,
): BetrayalMummyHauntStateResolution {
    core.usedCardIdsThisTurn = Array.from(new Set([
        ...core.usedCardIdsThisTurn,
        'banish-mummy',
    ]));
    core.recentRoll = {
        id: `${event.payload.playerId}-banish-mummy-${event.timestamp}`,
        kind: 'hauntActionTraitCheck',
        playerId: event.payload.playerId,
        sourceTitle: '驱逐木乃伊',
        trait: 'sanity',
        rollLabel: '神志对抗',
        dice: [...event.payload.heroDice],
        passiveBonus: event.payload.passiveBonus,
        latestLabel: event.payload.success
            ? `驱逐成功：英雄 ${event.payload.heroRoll} / 木乃伊 ${event.payload.mummyRoll}`
            : `驱逐失败：英雄 ${event.payload.heroRoll} / 木乃伊 ${event.payload.mummyRoll}`,
        consumedRabbitFootCardIds: [],
    };
    if (event.payload.success) {
        return {
            core,
            scenarioCompletedResult: createMummyEndgameResult(core, 'survivors'),
        };
    }
    const syncedCore = syncCurrentExplorerProjection(core);
    return {
        core: {
            ...syncedCore,
            recommendedAction: 'endTurn',
            activityLog: appendActivity(syncedCore, event.payload.logText, 'warning'),
        },
    };
}

export function applyBetrayalMummyGirlPickedUpState(
    core: BetrayalCore,
    event: MummyGirlPickedUpEvent,
): BetrayalCore {
    const mummy = core.scenarioRuntime.mummy;
    if (!mummy) {
        return core;
    }
    mummy.girlRoomId = null;
    mummy.girlHolderPlayerId = event.payload.playerId;
    mummy.girlHeldByMummy = false;
    const syncedCore = syncCurrentExplorerProjection(core);
    return {
        ...syncedCore,
        recommendedAction: resolveRecommendedAction(syncedCore),
        activityLog: appendActivity(syncedCore, event.payload.logText, 'accent'),
    };
}

export function applyBetrayalMummyGirlGivenState(
    core: BetrayalCore,
    event: MummyGirlGivenEvent,
): BetrayalCore {
    const mummy = core.scenarioRuntime.mummy;
    if (!mummy) {
        return core;
    }
    mummy.girlRoomId = null;
    mummy.girlHolderPlayerId = null;
    mummy.girlHeldByMummy = true;
    const syncedCore = syncCurrentExplorerProjection(core);
    return {
        ...syncedCore,
        recommendedAction: resolveRecommendedAction(syncedCore),
        activityLog: appendActivity(syncedCore, event.payload.logText, 'accent'),
    };
}

export function applyBetrayalMummyOmenGivenState(
    core: BetrayalCore,
    event: MummyOmenGivenEvent,
): BetrayalMummyHauntStateResolution {
    const mummy = core.scenarioRuntime.mummy;
    const actor = findExplorerByPlayerId(core, event.payload.playerId);
    if (!mummy || !actor) {
        return { core };
    }
    actor.inventory = actor.inventory.filter((card) => card.id !== event.payload.cardId);
    mummy.mummyCarriedOmenIds = Array.from(new Set([
        ...mummy.mummyCarriedOmenIds,
        event.payload.cardId,
    ]));
    const syncedCore = syncCurrentExplorerProjection(core);
    const loggedCore = {
        ...syncedCore,
        recommendedAction: resolveRecommendedAction(syncedCore),
        activityLog: appendActivity(syncedCore, event.payload.logText, 'accent'),
    };
    const scenarioCompletedResult = resolveMummyTraitorVictoryResult(loggedCore);
    return scenarioCompletedResult
        ? { core: loggedCore, scenarioCompletedResult }
        : { core: loggedCore };
}
