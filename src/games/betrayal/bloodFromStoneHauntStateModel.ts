import {
    appendActivity,
    syncCurrentExplorerProjection,
} from './coreStateModel';
import { createBetrayalMonsterFromDefinition } from './domain/monsterDefinitions';
import { createPendingDamageAllocation } from './damageResolutionModel';
import { findExplorerByPlayerId } from './explorerReadModel';
import { resolveBloodFromStoneSetupPlacementPlan } from './bloodFromStoneSetupReadModel';
import { resolveHauntSetupQueueWithEntryStatus } from './hauntSetupModel';
import { isBloodFromStoneHaunt } from './hauntScenarioReadModel';
import { resolveBloodFromStoneHeroVictoryResult } from './hauntVictoryModel';
import { removeBloodFromStoneStoneCherubs } from './monsterReadModel';
import { clearNextNonCombatTraitRollReplacementsForPlayer } from './possessionActionReadModel';
import type {
    BetrayalCore,
    BetrayalEndgameResult,
} from './game';
import type { BetrayalEvent } from './events';

type BloodFromStonePeekabooResolvedEvent = Extract<BetrayalEvent, { type: 'BLOOD_FROM_STONE_PEEKABOO_RESOLVED' }>;
type BloodFromStoneExtraStoneCherubsPlacedEvent = Extract<BetrayalEvent, { type: 'BLOOD_FROM_STONE_EXTRA_STONE_CHERUBS_PLACED' }>;

export interface BetrayalBloodFromStoneHauntStateResolution {
    core: BetrayalCore;
    scenarioCompletedResult?: BetrayalEndgameResult;
}

export function applyBetrayalBloodFromStonePeekabooResolvedState(
    core: BetrayalCore,
    event: BloodFromStonePeekabooResolvedEvent,
): BetrayalBloodFromStoneHauntStateResolution {
    const actor = findExplorerByPlayerId(core, event.payload.playerId);
    if (!actor || !isBloodFromStoneHaunt(core)) {
        return { core };
    }
    core.usedCardIdsThisTurn = [...core.usedCardIdsThisTurn, 'play-peekaboo'];
    clearNextNonCombatTraitRollReplacementsForPlayer(core, event.payload.playerId);
    core.recentRoll = {
        id: `${event.payload.playerId}-play-peekaboo-${event.timestamp}`,
        kind: 'hauntActionTraitCheck',
        playerId: event.payload.playerId,
        sourceTitle: '玩躲猫猫',
        trait: 'knowledge',
        rollLabel: '知识检定',
        dice: [...event.payload.dice],
        passiveBonus: event.payload.passiveBonus + event.payload.mirrorBonus,
        latestLabel: event.payload.success ? '移除石像小天使' : '一般伤害',
        consumedRabbitFootCardIds: [],
    };
    if (event.payload.success) {
        removeBloodFromStoneStoneCherubs(core, [
            event.payload.sameRoomMonsterId,
            event.payload.lineOfSightMonsterId,
        ]);
        const scenarioCompletedResult = resolveBloodFromStoneHeroVictoryResult(core);
        if (scenarioCompletedResult) {
            return { core, scenarioCompletedResult };
        }
        const synced = syncCurrentExplorerProjection(core);
        return {
            core: {
                ...synced,
                recommendedAction: 'endTurn',
                activityLog: appendActivity(synced, event.payload.logText, 'accent'),
            },
        };
    }
    const pendingPeekabooDamageAllocation = createPendingDamageAllocation({
        id: `blood-from-stone-peekaboo-${event.payload.playerId}-${event.timestamp}`,
        explorer: actor,
        sourceTitle: '玩躲猫猫',
        damageKind: 'general',
        amount: event.payload.damageAmount ?? 0,
        allowSkull: true,
    });
    const synced = syncCurrentExplorerProjection(core);
    if (pendingPeekabooDamageAllocation) {
        return {
            core: {
                ...synced,
                pendingDamageAllocation: pendingPeekabooDamageAllocation,
                activePlayerId: pendingPeekabooDamageAllocation.playerId,
                recommendedAction: 'damage',
                activityLog: appendActivity(synced, event.payload.logText, 'warning'),
            },
        };
    }
    return {
        core: {
            ...synced,
            recommendedAction: 'endTurn',
            activityLog: appendActivity(synced, event.payload.logText, 'warning'),
        },
    };
}

export function applyBetrayalBloodFromStoneExtraStoneCherubsPlacedState(
    core: BetrayalCore,
    event: BloodFromStoneExtraStoneCherubsPlacedEvent,
): BetrayalCore {
    core.monsters = [
        ...core.monsters,
        ...event.payload.placements.map((placement) => createBetrayalMonsterFromDefinition(
            'blood-from-stone-stone-cherub',
            placement.monsterId,
            placement.roomId,
        )),
    ];
    const plan = resolveBloodFromStoneSetupPlacementPlan(core);
    core.scenarioRuntime.hauntSetupQueue = resolveHauntSetupQueueWithEntryStatus(
        core,
        'place-additional-stone-cherubs',
        plan.pendingPlayerChoiceCount > 0 ? 'manual-check' : 'resolved',
    );
    const syncedCore = syncCurrentExplorerProjection(core);
    return {
        ...syncedCore,
        activityLog: appendActivity(syncedCore, event.payload.logText, 'accent'),
    };
}
