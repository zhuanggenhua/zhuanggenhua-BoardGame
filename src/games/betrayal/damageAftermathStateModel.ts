import {
    appendActivity,
    cloneMonster,
    cloneScenarioRuntimeStatus,
    syncCurrentExplorerProjection,
} from './coreStateModel';
import { applyBetrayalDamageAllocationResolvedState } from './damageResolutionModel';
import {
    addFeverishMonsterForPlayer,
    markDeadExplorer,
    releaseJackSpiritForDeadTraitor,
    shouldDeferDustTraitorVictoryForRabbitFoot,
} from './deathStateReadModel';
import { getAllExplorers } from './explorerReadModel';
import {
    isDustHaunt,
    isMummyHaunt,
} from './hauntScenarioReadModel';
import {
    createBetrayalCrimsonJackTraitorVictoryResult,
    resolveBloodFromStoneHauntVictoryResult,
    resolveDustTraitorVictoryResult,
    resolveHelpingHandsSoloVictoryResult,
} from './hauntVictoryModel';
import { createMummyEndgameResult } from './mummyHauntRules';
import { resolveRecommendedAction } from './recommendedActionReadModel';
import type {
    BetrayalCore,
    BetrayalEndgameResult,
} from './game';
import type { BetrayalEvent } from './events';

type DamageAllocationResolvedEvent = Extract<BetrayalEvent, { type: 'DAMAGE_ALLOCATION_RESOLVED' }>;
type TurnEndRollAcknowledgedPayload = Extract<BetrayalEvent, { type: 'TURN_END_ROLL_ACKNOWLEDGED' }>['payload'];

export interface BetrayalDamageAftermathStateResolution {
    core: BetrayalCore;
    scenarioCompletedResult?: BetrayalEndgameResult;
    turnEndRollAcknowledgedPayload?: TurnEndRollAcknowledgedPayload;
}

function resolveAllHeroesDefeatedVictoryResult(
    core: BetrayalCore,
    targetPlayerId: string,
    sourceTitle: string,
): BetrayalEndgameResult | null {
    if (
        sourceTitle !== '攻击'
        && sourceTitle !== '木乃伊攻击'
    ) {
        return null;
    }
    if (targetPlayerId === core.scenarioRuntime.traitorPlayerId) {
        return null;
    }
    const livingHeroes = getAllExplorers(core).filter((explorer) => (
        explorer.playerId !== core.scenarioRuntime.traitorPlayerId
        && !core.scenarioRuntime.deadExplorerPlayerIds.includes(explorer.playerId)
    ));
    if (livingHeroes.length > 0) {
        return null;
    }
    return isMummyHaunt(core)
        ? createMummyEndgameResult(core, 'traitor')
        : createBetrayalCrimsonJackTraitorVictoryResult(core);
}

function resolveDefeatVictoryResult(
    core: BetrayalCore,
    targetPlayerId: string,
    sourceTitle: string,
): BetrayalEndgameResult | null {
    const bloodFromStoneResult = resolveBloodFromStoneHauntVictoryResult(core);
    if (bloodFromStoneResult) {
        return bloodFromStoneResult;
    }
    if (isDustHaunt(core)) {
        if (core.scenarioRuntime.dust?.permanentTraitorPlayerIds.includes(targetPlayerId)) {
            addFeverishMonsterForPlayer(core, targetPlayerId);
        }
        const dustResult = shouldDeferDustTraitorVictoryForRabbitFoot(core, targetPlayerId)
            ? null
            : resolveDustTraitorVictoryResult(core);
        if (dustResult) {
            return dustResult;
        }
    }
    const allHeroesDefeatedResult = resolveAllHeroesDefeatedVictoryResult(core, targetPlayerId, sourceTitle);
    if (allHeroesDefeatedResult) {
        return allHeroesDefeatedResult;
    }
    return sourceTitle === '巨魔手攻击'
        ? resolveHelpingHandsSoloVictoryResult(core)
        : null;
}

export function applyBetrayalDamageAllocationAftermathState(
    core: BetrayalCore,
    event: DamageAllocationResolvedEvent,
): BetrayalDamageAftermathStateResolution {
    const damageAllocationResolution = applyBetrayalDamageAllocationResolvedState(
        core,
        event.payload,
        event.timestamp,
        {
            scenarioRuntimeBeforeDefeat: cloneScenarioRuntimeStatus(core.scenarioRuntime),
            monstersBeforeDefeat: core.monsters.map(cloneMonster),
        },
    );
    if (!damageAllocationResolution) {
        return { core };
    }
    const {
        pending,
        target,
        targetDefeated,
        nextQueuedDamageAllocation,
    } = damageAllocationResolution;
    if (targetDefeated) {
        markDeadExplorer(core, target.playerId);
        if (pending.sourceTitle === '攻击' && target.playerId === core.scenarioRuntime.traitorPlayerId) {
            releaseJackSpiritForDeadTraitor(core, target.playerId, target.roomId);
        }
        const scenarioCompletedResult = resolveDefeatVictoryResult(core, target.playerId, pending.sourceTitle);
        if (scenarioCompletedResult) {
            return { core, scenarioCompletedResult };
        }
    }
    const synced = syncCurrentExplorerProjection(core);
    if (nextQueuedDamageAllocation) {
        return {
            core: {
                ...synced,
                pendingDamageAllocation: nextQueuedDamageAllocation,
                activePlayerId: nextQueuedDamageAllocation.playerId,
                recommendedAction: 'endTurn',
                activityLog: appendActivity(synced, event.payload.logText, 'warning'),
            },
        };
    }
    if (event.payload.nextPlayerId && event.payload.deathPrevention?.dice.length) {
        return {
            core: {
                ...synced,
                recommendedAction: 'endTurn',
                activePlayerId: null,
                activityLog: appendActivity(synced, event.payload.logText, 'warning'),
            },
        };
    }
    if (event.payload.nextPlayerId) {
        return {
            core: synced,
            turnEndRollAcknowledgedPayload: {
                previousPlayerId: event.payload.playerId,
                nextPlayerId: event.payload.nextPlayerId,
                monsterMovementRoll: event.payload.monsterMovementRoll ?? null,
                helpingHandsMonsterTurnControllerPlayerId: event.payload.helpingHandsMonsterTurnControllerPlayerId,
                skipBloodFromStoneMonsterTurnStart: event.payload.skipBloodFromStoneMonsterTurnStart,
                logText: [event.payload.logText, event.payload.turnLogText].filter(Boolean).join('；'),
            },
        };
    }
    return {
        core: {
            ...synced,
            recommendedAction: pending.sourceTitle === '巨魔手攻击'
                && core.scenarioRuntime.helpingHands?.activeMonsterTurn
                ? 'endTurn'
                : resolveRecommendedAction(synced),
            activePlayerId: null,
            activityLog: appendActivity(synced, event.payload.logText, 'warning'),
        },
    };
}
