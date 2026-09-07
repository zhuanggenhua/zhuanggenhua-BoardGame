import {
    appendActivity,
    syncCurrentExplorerProjection,
} from './coreStateModel';
import {
    applyMentalDamage,
    applyPhysicalDamage,
    isExplorerDead,
} from './damageResolutionModel';
import { markDeadExplorer } from './deathStateReadModel';
import { getAllExplorers } from './explorerReadModel';
import {
    createBetrayalCrimsonJackHeroVictoryResult,
    createBetrayalCrimsonJackTraitorVictoryResult,
} from './hauntVictoryModel';
import { clearNextNonCombatTraitRollReplacementsForPlayer } from './possessionActionReadModel';
import type {
    BetrayalCore,
    BetrayalEndgameResult,
} from './game';
import type { BetrayalEvent } from './events';

type JackLearnedEvent = Extract<BetrayalEvent, { type: 'JACK_LEARNED' }>;
type ExorcismStudiedEvent = Extract<BetrayalEvent, { type: 'EXORCISM_STUDIED' }>;
type JackExorcisedEvent = Extract<BetrayalEvent, { type: 'JACK_EXORCISED' }>;

export interface BetrayalCrimsonJackHauntStateResolution {
    core: BetrayalCore;
    scenarioCompletedResult?: BetrayalEndgameResult;
}

export function applyBetrayalJackLearnedState(
    core: BetrayalCore,
    event: JackLearnedEvent,
): BetrayalCore {
    if (event.payload.success && event.payload.grantedToPlayerId) {
        core.scenarioRuntime.knowledgeOfJackPlayerIds = Array.from(new Set([
            ...core.scenarioRuntime.knowledgeOfJackPlayerIds,
            event.payload.grantedToPlayerId,
        ]));
    }
    core.usedCardIdsThisTurn = [...core.usedCardIdsThisTurn, 'learn-about-jack'];
    clearNextNonCombatTraitRollReplacementsForPlayer(core, event.payload.playerId);
    const syncedCore = syncCurrentExplorerProjection(core);
    return {
        ...syncedCore,
        recommendedAction: 'endTurn',
        activityLog: appendActivity(syncedCore, event.payload.logText, event.payload.success ? 'accent' : 'warning'),
    };
}

export function applyBetrayalExorcismStudiedState(
    core: BetrayalCore,
    event: ExorcismStudiedEvent,
): BetrayalCore {
    if (event.payload.success) {
        core.scenarioRuntime.exorcismCircleRoomIds = [
            ...core.scenarioRuntime.exorcismCircleRoomIds,
            event.payload.roomId,
        ].slice(-2);
    } else {
        applyMentalDamage(core.currentExplorer, 2, { allowSkull: true });
        if (isExplorerDead(core.currentExplorer)) {
            markDeadExplorer(core, core.currentExplorer.playerId);
        }
    }
    core.usedCardIdsThisTurn = [...core.usedCardIdsThisTurn, 'study-exorcism'];
    clearNextNonCombatTraitRollReplacementsForPlayer(core, event.payload.playerId);
    const syncedCore = syncCurrentExplorerProjection(core);
    return {
        ...syncedCore,
        recommendedAction: core.scenarioRuntime.jackSpiritReleased ? 'move' : 'endTurn',
        activityLog: appendActivity(syncedCore, event.payload.logText, event.payload.success ? 'accent' : 'warning'),
    };
}

export function applyBetrayalJackExorcisedState(
    core: BetrayalCore,
    event: JackExorcisedEvent,
): BetrayalCrimsonJackHauntStateResolution {
    core.usedCardIdsThisTurn = [...core.usedCardIdsThisTurn, 'exorcise-jack'];
    clearNextNonCombatTraitRollReplacementsForPlayer(core, event.payload.playerId);
    core.recentRoll = {
        id: `${event.payload.playerId}-exorcise-jack-${event.timestamp}`,
        kind: 'hauntActionTraitCheck',
        playerId: event.payload.playerId,
        sourceTitle: '驱魔',
        trait: 'sanity',
        rollLabel: '神志检定',
        dice: [...event.payload.dice],
        passiveBonus: event.payload.passiveBonus + event.payload.regionBonus,
        latestLabel: event.payload.success ? '驱魔成功' : '驱魔失败',
        consumedRabbitFootCardIds: [],
    };
    if (!event.payload.success) {
        getAllExplorers(core)
            .filter((explorer) => explorer.playerId !== core.scenarioRuntime.traitorPlayerId)
            .filter((explorer) => !core.scenarioRuntime.deadExplorerPlayerIds.includes(explorer.playerId))
            .forEach((explorer) => {
                applyPhysicalDamage(explorer, 1, { allowSkull: true });
                if (isExplorerDead(explorer)) {
                    markDeadExplorer(core, explorer.playerId);
                }
            });
        const livingHeroes = getAllExplorers(core).filter((explorer) => (
            explorer.playerId !== core.scenarioRuntime.traitorPlayerId
            && !core.scenarioRuntime.deadExplorerPlayerIds.includes(explorer.playerId)
        ));
        if (livingHeroes.length === 0) {
            return {
                core,
                scenarioCompletedResult: createBetrayalCrimsonJackTraitorVictoryResult(core),
            };
        }
        const failedCore = syncCurrentExplorerProjection(core);
        return {
            core: {
                ...failedCore,
                recommendedAction: 'endTurn',
                activityLog: appendActivity(failedCore, event.payload.logText, 'warning'),
            },
        };
    }
    return {
        core,
        scenarioCompletedResult: createBetrayalCrimsonJackHeroVictoryResult(core),
    };
}
