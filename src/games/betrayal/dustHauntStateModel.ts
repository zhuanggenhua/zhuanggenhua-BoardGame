import {
    appendActivity,
    syncCurrentExplorerProjection,
} from './coreStateModel';
import { applyDustSicknessSwap } from './dustHauntRules';
import { cloneDustRuntimeState } from './hauntRuntimeSetupModel';
import {
    createDustSurvivorVictoryResult,
    resolveDustTraitorVictoryResult,
} from './hauntVictoryModel';
import { clearNextNonCombatTraitRollReplacementsForPlayer } from './possessionActionReadModel';
import { BETRAYAL_TRAIT_LABEL as TRAIT_LABEL } from './possessionEffects';
import type {
    BetrayalCore,
    BetrayalEndgameResult,
} from './game';
import type { BetrayalEvent } from './events';

type DustSearchResolvedEvent = Extract<BetrayalEvent, { type: 'DUST_SEARCH_RESOLVED' }>;
type DustCureResolvedEvent = Extract<BetrayalEvent, { type: 'DUST_CURE_RESOLVED' }>;
type SicknessExchangeRequestedEvent = Extract<BetrayalEvent, { type: 'SICKNESS_EXCHANGE_REQUESTED' }>;
type SicknessExchangeResolvedEvent = Extract<BetrayalEvent, { type: 'SICKNESS_EXCHANGE_RESOLVED' }>;

export interface BetrayalDustHauntStateResolution {
    core: BetrayalCore;
    scenarioCompletedResult?: BetrayalEndgameResult;
}

export function applyBetrayalDustSearchResolvedState(
    core: BetrayalCore,
    event: DustSearchResolvedEvent,
): BetrayalDustHauntStateResolution {
    const dust = core.scenarioRuntime.dust;
    if (!dust) {
        return { core };
    }
    if (event.payload.success) {
        dust.researchRoomIds = Array.from(new Set([
            ...dust.researchRoomIds,
            event.payload.roomId,
        ]));
    } else if (event.payload.swap) {
        applyDustSicknessSwap(dust, event.payload.swap);
    }
    core.usedCardIdsThisTurn = [...core.usedCardIdsThisTurn, 'search-for-cure'];
    clearNextNonCombatTraitRollReplacementsForPlayer(core, event.payload.playerId);
    core.recentRoll = {
        id: `${event.payload.playerId}-dust-search-${event.timestamp}`,
        kind: 'hauntActionTraitCheck',
        playerId: event.payload.playerId,
        sourceTitle: '寻找解药',
        trait: event.payload.trait,
        rollLabel: `${TRAIT_LABEL[event.payload.trait]}检定`,
        dice: [...event.payload.dice],
        passiveBonus: event.payload.passiveBonus,
        latestLabel: event.payload.success ? '放置研究标记' : '交换疾病标记',
        consumedRabbitFootCardIds: [],
    };
    const scenarioCompletedResult = resolveDustTraitorVictoryResult(core);
    if (scenarioCompletedResult) {
        return { core, scenarioCompletedResult };
    }
    const synced = syncCurrentExplorerProjection(core);
    return {
        core: {
            ...synced,
            recommendedAction: 'endTurn',
            activityLog: appendActivity(synced, event.payload.logText, event.payload.success ? 'accent' : 'warning'),
        },
    };
}

export function applyBetrayalDustCureResolvedState(
    core: BetrayalCore,
    event: DustCureResolvedEvent,
): BetrayalDustHauntStateResolution {
    const dust = core.scenarioRuntime.dust;
    if (!dust) {
        return { core };
    }
    core.usedCardIdsThisTurn = [...core.usedCardIdsThisTurn, 'cure-the-dust'];
    clearNextNonCombatTraitRollReplacementsForPlayer(core, event.payload.playerId);
    core.recentRoll = {
        id: `${event.payload.playerId}-dust-cure-${event.timestamp}`,
        kind: 'hauntActionTraitCheck',
        playerId: event.payload.playerId,
        sourceTitle: '治愈灰尘',
        trait: event.payload.trait,
        rollLabel: `${TRAIT_LABEL[event.payload.trait]}检定`,
        dice: [...event.payload.dice],
        passiveBonus: event.payload.passiveBonus + event.payload.researchBonus,
        latestLabel: event.payload.success ? '治愈成功' : '治愈失败',
        consumedRabbitFootCardIds: [],
    };
    if (event.payload.success) {
        return {
            core,
            scenarioCompletedResult: createDustSurvivorVictoryResult(core),
        };
    }
    if (event.payload.swap) {
        applyDustSicknessSwap(dust, event.payload.swap);
    }
    const scenarioCompletedResult = resolveDustTraitorVictoryResult(core);
    if (scenarioCompletedResult) {
        return { core, scenarioCompletedResult };
    }
    const synced = syncCurrentExplorerProjection(core);
    return {
        core: {
            ...synced,
            recommendedAction: 'endTurn',
            activityLog: appendActivity(synced, event.payload.logText, 'warning'),
        },
    };
}

export function applyBetrayalSicknessExchangeRequestedState(
    core: BetrayalCore,
    event: SicknessExchangeRequestedEvent,
): BetrayalCore {
    const dust = core.scenarioRuntime.dust;
    if (!dust) {
        return core;
    }
    const synced = syncCurrentExplorerProjection(core);
    return {
        ...synced,
        scenarioRuntime: {
            ...synced.scenarioRuntime,
            dust: {
                ...cloneDustRuntimeState(dust),
                pendingSicknessExchange: {
                    id: `sickness-${event.payload.requesterPlayerId}-${event.payload.targetPlayerId}-${event.timestamp}`,
                    requesterPlayerId: event.payload.requesterPlayerId,
                    targetPlayerId: event.payload.targetPlayerId,
                },
            },
        },
        activePlayerId: event.payload.targetPlayerId,
        recommendedAction: 'trade',
        recentRoll: null,
        activityLog: appendActivity(synced, event.payload.logText, 'accent'),
    };
}

export function applyBetrayalSicknessExchangeResolvedState(
    core: BetrayalCore,
    event: SicknessExchangeResolvedEvent,
): BetrayalDustHauntStateResolution {
    const dust = core.scenarioRuntime.dust;
    if (!dust) {
        return { core };
    }
    if (event.payload.accepted && event.payload.swap) {
        applyDustSicknessSwap(dust, event.payload.swap);
    }
    dust.pendingSicknessExchange = undefined;
    core.activePlayerId = null;
    core.usedCardIdsThisTurn = Array.from(new Set([
        ...core.usedCardIdsThisTurn,
        'sickness-exchange',
    ]));
    const scenarioCompletedResult = resolveDustTraitorVictoryResult(core);
    if (scenarioCompletedResult) {
        return { core, scenarioCompletedResult };
    }
    const synced = syncCurrentExplorerProjection(core);
    return {
        core: {
            ...synced,
            recommendedAction: 'endTurn',
            activityLog: appendActivity(synced, event.payload.logText, event.payload.accepted ? 'accent' : 'neutral'),
        },
    };
}
