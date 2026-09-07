import { appendActivity } from './coreStateModel';
import { BETRAYAL_SCENARIO_CONFIGS } from './scenarioConfig';
import type {
    BetrayalCore,
    BetrayalEndgameResult,
} from './game';
import type { BetrayalEvent } from './events';

type ScenarioCompletedEvent = Extract<BetrayalEvent, { type: 'SCENARIO_COMPLETED' }>;

function resolveScenarioCompletedLog(core: BetrayalCore, result: BetrayalEndgameResult): string {
    if (result.hauntId === 'crimson-jack-returns') {
        return result.outcome === 'survivors'
            ? '杰克之灵被驱散，英雄完成驱魔'
            : 'Crimson Jack 击倒了所有英雄';
    }
    if (result.hauntId === 'mummy-rampage') {
        return result.outcome === 'survivors'
            ? '英雄念出木乃伊真名并完成驱逐'
            : '木乃伊完成婚礼，或所有英雄都已倒下';
    }
    if (result.hauntId === 'upon-reflection') {
        return '英雄破除镜中诅咒，作祟揭秘者回到现实';
    }
    return BETRAYAL_SCENARIO_CONFIGS[core.scenarioId].logs.scenarioCompleted;
}

export function applyBetrayalScenarioCompletedState(
    core: BetrayalCore,
    event: ScenarioCompletedEvent,
): BetrayalCore {
    return {
        ...core,
        phase: 'endgame',
        recommendedAction: 'endTurn',
        pendingEventRollResolution: null,
        pendingCardResolutionQueue: [],
        endgameResult: {
            ...event.payload.result,
            winners: [...event.payload.result.winners],
            survivorsEscaped: [...event.payload.result.survivorsEscaped],
            reward: { ...event.payload.result.reward },
            stats: { ...event.payload.result.stats },
        },
        activityLog: appendActivity(core, resolveScenarioCompletedLog(core, event.payload.result), 'accent'),
    };
}
