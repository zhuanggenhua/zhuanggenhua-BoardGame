import type { RandomFn } from '../../engine/types';
import {
    appendActivity,
    clonePendingCardResolution,
    replaceExplorers,
} from './coreStateModel';
import {
    findExplorerByPlayerId,
    getAllExplorers,
    resolveTurnStartSpeed,
} from './explorerReadModel';
import {
    resolveBetrayalHauntSetupQueue,
    resolveHauntSetupQueueWithEntryStatus,
} from './hauntSetupModel';
import {
    cloneDustRuntimeState,
    cloneHelpingHandsRuntimeState,
    cloneMagicCameraRuntimeState,
    cloneMummyRuntimeState,
    cloneUponReflectionRuntimeState,
    createDustRuntimeState,
    createUponReflectionRuntimeState,
    setupBloodFromStoneHaunt,
    setupHelpingHandsHaunt,
    setupMagicCameraHaunt,
    setupMummyHaunt,
    setupUponReflectionHaunt,
} from './hauntRuntimeSetupModel';
import {
    cloneHauntFirstPlayerResolution,
    cloneHauntTraitorResolution,
    resolveHauntFirstPlayerResolutionForTrigger,
    resolveHauntTraitorResolutionForTrigger,
} from './hauntTraitorResolutionModel';
import {
    createBloodFromStoneTurnStartVisibility,
    createInitialMonsterTurnRuntimeState,
} from './monsterActionReadModel';
import { resolveTurnStartInventoryCardIds } from './possessionActionReadModel';
import { BETRAYAL_EXPLORER_CATALOG } from './scenarioConfig';
import {
    BETRAYAL_TRAIT_KEYS,
    healExplorerTraitToStart,
    moveExplorerTraitSteps,
} from './traitTrackModel';
import type {
    BetrayalCore,
    BetrayalExplorerSummary,
} from './game';
import type { BetrayalEvent } from './events';

type HauntTriggeredEvent = Extract<BetrayalEvent, { type: 'HAUNT_TRIGGERED' }>;

function healExplorerToTemplate(explorer: BetrayalExplorerSummary): void {
    const hasTemplate = BETRAYAL_EXPLORER_CATALOG.some((template) => (
        template.explorerId === explorer.explorerId
    ));
    if (!hasTemplate) {
        return;
    }
    for (const trait of BETRAYAL_TRAIT_KEYS) {
        healExplorerTraitToStart(explorer, trait);
    }
}

function resolveCrimsonJackTraitorPhysicalBonus(playerCount: number): number {
    return playerCount >= 5 ? 2 : 1;
}

function healTraitorForHaunt(explorer: BetrayalExplorerSummary, playerCount: number): void {
    healExplorerToTemplate(explorer);
    const physicalBonus = resolveCrimsonJackTraitorPhysicalBonus(playerCount);
    moveExplorerTraitSteps(explorer, 'might', physicalBonus);
    moveExplorerTraitSteps(explorer, 'speed', physicalBonus);
}

export function applyBetrayalHauntTriggeredState(
    core: BetrayalCore,
    event: HauntTriggeredEvent,
    fallbackRandom: RandomFn,
): BetrayalCore {
    const hauntCardNumber = event.payload.hauntCardNumber ?? event.payload.hauntRevealResolution?.hauntCardNumber ?? null;
    const hauntRevealerPlayerId = event.payload.hauntRevealerPlayerId
        ?? event.payload.traitorPlayerId
        ?? event.payload.nextPlayerId;
    const hauntTraitorResolution = event.payload.hauntTraitorResolution
        ?? resolveHauntTraitorResolutionForTrigger(core, hauntCardNumber, hauntRevealerPlayerId, {
            explicitTraitorPlayerId: event.payload.traitorPlayerId,
            revealRepresentativeOnly: event.payload.hauntRevealResolution?.representativeOnly,
        });
    const traitorPlayerId = hauntTraitorResolution.traitorPlayerId;
    const resolvedHauntFirstPlayerResolution = event.payload.hauntFirstPlayerResolution
        ?? resolveHauntFirstPlayerResolutionForTrigger(core, hauntCardNumber, hauntRevealerPlayerId, hauntTraitorResolution, {
            revealRepresentativeOnly: event.payload.hauntRevealResolution?.representativeOnly,
        });
    const hauntFirstPlayerResolution = {
        ...resolvedHauntFirstPlayerResolution,
        nextPlayerId: event.payload.nextPlayerId,
    };
    const nextPlayerId = hauntFirstPlayerResolution.nextPlayerId;
    core.phase = 'haunt';
    core.scenarioRuntime.hauntTriggered = true;
    core.scenarioRuntime.hauntRevealerPlayerId = hauntRevealerPlayerId;
    core.scenarioRuntime.traitorPlayerId = traitorPlayerId;
    core.scenarioRuntime.hauntTraitorResolution = cloneHauntTraitorResolution(hauntTraitorResolution);
    core.scenarioRuntime.hauntFirstPlayerResolution = cloneHauntFirstPlayerResolution(hauntFirstPlayerResolution);
    core.scenarioRuntime.nextHauntPlayerId = nextPlayerId;
    core.scenarioRuntime.hauntCardNumber = hauntCardNumber;
    core.scenarioRuntime.hauntTriggerLabel = event.payload.hauntTriggerLabel;
    core.scenarioRuntime.hauntScenarioCardId = event.payload.hauntRevealResolution?.scenarioCardId ?? null;
    core.scenarioRuntime.hauntScenarioCardTitle = event.payload.hauntRevealResolution?.scenarioCardTitle ?? null;
    core.scenarioRuntime.hauntScenarioCardLabel = event.payload.hauntRevealResolution?.scenarioCardLabel ?? null;
    core.scenarioRuntime.triggeringOmenId = event.payload.hauntRevealResolution?.triggeringOmenId ?? null;
    core.scenarioRuntime.triggeringOmenName = event.payload.hauntRevealResolution?.triggeringOmenName ?? event.payload.hauntTriggerLabel;
    core.scenarioRuntime.hauntResolutionMatchedTrigger = event.payload.hauntRevealResolution?.triggerMatchesScenarioCard ?? false;
    core.scenarioRuntime.hauntResolutionRepresentativeOnly = event.payload.hauntRevealResolution?.representativeOnly ?? true;
    core.scenarioRuntime.dust = hauntCardNumber === 3
        ? cloneDustRuntimeState(event.payload.dustSetup ?? createDustRuntimeState(core, fallbackRandom))
        : undefined;
    core.scenarioRuntime.magicCamera = undefined;
    core.scenarioRuntime.helpingHands = undefined;
    core.scenarioRuntime.bloodFromStone = undefined;
    core.scenarioRuntime.mummy = undefined;
    core.scenarioRuntime.uponReflection = hauntCardNumber === 7
        ? cloneUponReflectionRuntimeState(
            event.payload.uponReflectionSetup
                ?? createUponReflectionRuntimeState(core, hauntRevealerPlayerId, fallbackRandom),
        )
        : undefined;
    if (hauntCardNumber === 1 && core.scenarioRuntime.hauntScenarioCardId === 'mummy-rampage') {
        core.scenarioRuntime.mummy = cloneMummyRuntimeState(setupMummyHaunt(core, traitorPlayerId));
    }
    if (hauntCardNumber === 12) {
        core.scenarioRuntime.helpingHands = cloneHelpingHandsRuntimeState(
            event.payload.helpingHandsSetup
                ?? setupHelpingHandsHaunt(core, hauntRevealerPlayerId),
        );
    }
    if (hauntCardNumber === 33) {
        core.scenarioRuntime.magicCamera = cloneMagicCameraRuntimeState(
            event.payload.magicCameraSetup
                ?? setupMagicCameraHaunt(core, traitorPlayerId),
        );
    }
    if (hauntCardNumber === 5) {
        setupBloodFromStoneHaunt(core);
    }
    if (hauntCardNumber === 7) {
        setupUponReflectionHaunt(core);
    }
    core.scenarioRuntime.hauntSetupQueue = resolveBetrayalHauntSetupQueue(core);
    if (hauntCardNumber === 7) {
        core.scenarioRuntime.hauntSetupQueue = resolveHauntSetupQueueWithEntryStatus(
            core,
            'deal-secret-mirror-combination',
            'resolved',
        );
    }
    core.scenarioRuntime.monsterTurn = createInitialMonsterTurnRuntimeState();
    core.scenarioRuntime.bloodFromStoneTurnStartVisibleStoneCherubIdsByPlayerId =
        createBloodFromStoneTurnStartVisibility(core);
    core.scenarioRuntime.bloodFromStoneNewLineOfSightDamagePlayerIdsThisTurn = [];
    core.turnStartSpeed = 0;
    core.movesRemaining = 0;
    core.usedCardIdsThisTurn = [];
    core.tradeUsedThisTurnPlayerIds = [];
    core.receivedCardIdsThisTurnByPlayerId = {
        ...core.receivedCardIdsThisTurnByPlayerId,
        ...(traitorPlayerId ? { [traitorPlayerId]: [] } : {}),
    };
    core.nextNonCombatTraitReplacement = null;
    core.nextNonCombatTraitRollTotalReplacement = null;
    core.turnEndedByDiscovery = false;
    const traitor = traitorPlayerId
        ? findExplorerByPlayerId(core, traitorPlayerId)
        : null;
    if (
        traitor
        && (hauntCardNumber ?? 1) === 1
        && core.scenarioRuntime.hauntScenarioCardId !== 'mummy-rampage'
    ) {
        healTraitorForHaunt(traitor, core.playerIds.length);
    }
    const nextCore = replaceExplorers(core, getAllExplorers(core), nextPlayerId);
    const nextTurnStartSpeed = resolveTurnStartSpeed(nextCore, nextPlayerId);
    return {
        ...nextCore,
        currentPlayer: nextPlayerId,
        turnStartSpeed: nextTurnStartSpeed,
        movesRemaining: nextTurnStartSpeed,
        turnStartInventoryCardIds: resolveTurnStartInventoryCardIds(nextCore, nextPlayerId),
        recommendedAction: 'move',
        pendingTradeAgreement: null,
        pendingCardResolutionQueue: core.pendingCardResolutionQueue.map(clonePendingCardResolution),
        activePlayerId: null,
        activityLog: appendActivity(nextCore, event.payload.logText, 'warning'),
    };
}
