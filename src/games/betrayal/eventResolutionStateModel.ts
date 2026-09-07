import { eventRollResolutionNeedsSharedAcknowledgement } from './acknowledgementReadModel';
import {
    acknowledgeEventEffectCardResolution,
    cloneDiscoverySummary,
    clonePendingEventChoice,
    createPendingCardResolutionQueue,
    mergePreviousDiscoveryResolutionSteps,
    withEventChoiceResolutionStep,
} from './cardResolutionStateModel';
import {
    appendActivity,
    cloneMonster,
    cloneScenarioRuntimeStatus,
    syncCurrentExplorerProjection,
} from './coreStateModel';
import {
    activatePendingRolledDamageAllocation,
    applyEventEffectWithDeferredRolledDamage,
    applyImmediateEventDeathPreventionIfNeeded,
    cloneSourceEventRollFromRecentRoll,
    isEventRecentRoll,
    setEventRolledDamageRecentRollFromSnapshot,
} from './eventEffectResolutionModel';
import { buryEventCardToBottom } from './eventDeckModel';
import {
    cloneDustRuntimeState,
    cloneHelpingHandsRuntimeState,
    cloneMagicCameraRuntimeState,
    cloneUponReflectionRuntimeState,
} from './hauntRuntimeSetupModel';
import { resolveHauntRevealResolutionForTrigger } from './hauntSetupModel';
import {
    cloneHauntTraitorResolution,
    resolveHauntFirstPlayerResolutionForTrigger,
    resolveHauntTraitorResolutionForTrigger,
} from './hauntTraitorResolutionModel';
import { resolveDustTraitorVictoryResult } from './hauntVictoryModel';
import {
    cloneUseEffect,
    type UseEffectProfile,
} from './possessionEffects';
import { resolveRecommendedAction } from './recommendedActionReadModel';
import { BETRAYAL_SCENARIO_CONFIGS } from './scenarioConfig';
import { consumeNextNonCombatTraitReplacementAfterTraitRoll } from './traitRollModel';
import type {
    BetrayalCore,
    BetrayalEndgameResult,
    BetrayalPendingEventChoiceState,
    BetrayalPendingEventRollResolutionState,
    BetrayalRecentRollState,
} from './game';
import type { BetrayalEvent } from './events';

type EventChoiceResolvedEvent = Extract<BetrayalEvent, { type: 'EVENT_CHOICE_RESOLVED' }>;
type EventRolledEvent = Extract<BetrayalEvent, { type: 'EVENT_ROLLED' }>;
type EventRollFinalizedEvent = Extract<BetrayalEvent, { type: 'EVENT_ROLL_FINALIZED' }>;
type HauntTriggeredPayload = Extract<BetrayalEvent, { type: 'HAUNT_TRIGGERED' }>['payload'];
type EventRollPayload = NonNullable<EventChoiceResolvedEvent['payload']['eventRoll']>;

export interface BetrayalEventStateResolution {
    core: BetrayalCore;
    scenarioCompletedResult?: BetrayalEndgameResult;
    hauntTriggeredPayload?: HauntTriggeredPayload;
}

function cloneEventDeathPrevention(
    deathPrevention: BetrayalPendingEventRollResolutionState['deathPrevention'] | undefined,
): BetrayalPendingEventRollResolutionState['deathPrevention'] | undefined {
    return deathPrevention
        ? {
            ...deathPrevention,
            dice: [...deathPrevention.dice],
            damageTraits: [...deathPrevention.damageTraits],
            traitsBeforeDamage: { ...deathPrevention.traitsBeforeDamage },
        }
        : undefined;
}

function cloneEventRollBranchThresholds(
    eventRoll: EventRollPayload,
): BetrayalRecentRollState['branchThresholds'] {
    return eventRoll.branchThresholds?.map((branch) => ({
        ...branch,
        effect: cloneUseEffect(branch.effect),
    }));
}

function eventEffectHasDeferredRandomResult(effect: UseEffectProfile | undefined): boolean {
    if (!effect) {
        return false;
    }
    if (effect.mode === 'rolledDamage') {
        return !effect.rolls;
    }
    if (effect.mode === 'allTraitChecks') {
        return !effect.results;
    }
    if (effect.mode === 'compound') {
        return effect.effects.some(eventEffectHasDeferredRandomResult);
    }
    if (effect.mode === 'optionalEffect') {
        return eventEffectHasDeferredRandomResult(effect.acceptEffect);
    }
    if (effect.mode === 'optionalItemEffect') {
        return eventEffectHasDeferredRandomResult(effect.acceptEffect)
            || eventEffectHasDeferredRandomResult(effect.declineEffect);
    }
    if (effect.mode === 'optionalHauntRoll') {
        return eventEffectHasDeferredRandomResult(effect.failureEffect)
            || eventEffectHasDeferredRandomResult(effect.skippedOrStartedEffect);
    }
    if (effect.mode === 'optionalEventRoll') {
        return effect.roll.branches.some((branch) => eventEffectHasDeferredRandomResult(branch.effect));
    }
    if (effect.mode === 'traitRoll' || effect.mode === 'chooseTraitRoll') {
        return effect.branches.some((branch) => eventEffectHasDeferredRandomResult(branch.effect));
    }
    return false;
}

function createEventRecentRoll(
    rollId: string,
    playerId: string,
    sourceTitle: string,
    eventDescription: string | undefined,
    eventRoll: EventRollPayload,
): BetrayalRecentRollState {
    return {
        id: rollId,
        kind: eventRoll.kind === 'dice' ? 'eventDiceRoll' : 'eventTraitCheck',
        playerId,
        sourceTitle,
        eventDescription,
        trait: eventRoll.trait,
        rollLabel: eventRoll.rollLabel,
        dice: [...(eventRoll.dice ?? [])],
        passiveBonus: eventRoll.passiveBonus ?? 0,
        branchThresholds: cloneEventRollBranchThresholds(eventRoll),
        latestLabel: eventRoll.label,
        consumedRabbitFootCardIds: [],
    };
}

function createPendingEventRollResolution(core: BetrayalCore, input: {
    rollId: string;
    playerId: string;
    sourceTitle: string;
    eventEffect?: EventChoiceResolvedEvent['payload']['eventEffect'];
    nextPendingEventChoice?: BetrayalPendingEventChoiceState;
    deathPrevention?: BetrayalPendingEventRollResolutionState['deathPrevention'];
    hauntTriggered?: boolean;
    hauntCardNumber?: number;
    hauntTriggerLabel?: string;
    hauntTraitorPlayerId?: string | null;
    hauntRevealResolution?: BetrayalPendingEventRollResolutionState['hauntRevealResolution'];
    hauntTraitorResolution?: BetrayalPendingEventRollResolutionState['hauntTraitorResolution'];
    dustSetup?: BetrayalPendingEventRollResolutionState['dustSetup'];
    magicCameraSetup?: BetrayalPendingEventRollResolutionState['magicCameraSetup'];
    helpingHandsSetup?: BetrayalPendingEventRollResolutionState['helpingHandsSetup'];
    uponReflectionSetup?: BetrayalPendingEventRollResolutionState['uponReflectionSetup'];
    hauntRoll?: BetrayalPendingEventRollResolutionState['hauntRoll'];
}): BetrayalPendingEventRollResolutionState {
    const nextPendingEventChoice = input.nextPendingEventChoice
        ? clonePendingEventChoice(input.nextPendingEventChoice)
        : undefined;
    const needsSharedEventRollAcknowledgement = eventRollResolutionNeedsSharedAcknowledgement({
        nextPendingEventChoice,
        hauntRevealResolution: input.hauntRevealResolution,
        hauntTraitorResolution: input.hauntTraitorResolution,
        dustSetup: input.dustSetup,
        magicCameraSetup: input.magicCameraSetup,
        helpingHandsSetup: input.helpingHandsSetup,
        uponReflectionSetup: input.uponReflectionSetup,
    });
    return {
        rollId: input.rollId,
        playerId: input.playerId,
        sourceTitle: input.sourceTitle,
        requiredPlayerIds: needsSharedEventRollAcknowledgement && core.playerIds.length > 0
            ? [...core.playerIds]
            : [input.playerId],
        acknowledgedPlayerIds: [],
        effect: cloneUseEffect(input.eventEffect ?? nextPendingEventChoice!.effect),
        nextPendingEventChoice,
        deathPrevention: cloneEventDeathPrevention(input.deathPrevention),
        requiresAcknowledgement: true,
        hauntTriggered: input.hauntTriggered,
        hauntCardNumber: input.hauntCardNumber,
        hauntTriggerLabel: input.hauntTriggerLabel,
        hauntTraitorPlayerId: input.hauntTraitorPlayerId,
        hauntRevealResolution: input.hauntRevealResolution
            ? { ...input.hauntRevealResolution }
            : undefined,
        hauntTraitorResolution: input.hauntTraitorResolution
            ? cloneHauntTraitorResolution(input.hauntTraitorResolution) ?? undefined
            : undefined,
        dustSetup: input.dustSetup ? cloneDustRuntimeState(input.dustSetup) : undefined,
        magicCameraSetup: input.magicCameraSetup
            ? cloneMagicCameraRuntimeState(input.magicCameraSetup)
            : undefined,
        helpingHandsSetup: input.helpingHandsSetup
            ? cloneHelpingHandsRuntimeState(input.helpingHandsSetup)
            : undefined,
        uponReflectionSetup: input.uponReflectionSetup
            ? cloneUponReflectionRuntimeState(input.uponReflectionSetup)
            : undefined,
        hauntRoll: input.hauntRoll ? { ...input.hauntRoll } : undefined,
    };
}

function applyEventEffectAndPendingDamageState(
    core: BetrayalCore,
    eventEffect: EventChoiceResolvedEvent['payload']['eventEffect'],
    sourceTitle: string,
    timestamp: number,
    deathPrevention: BetrayalPendingEventRollResolutionState['deathPrevention'] | undefined,
): ReturnType<typeof applyEventEffectWithDeferredRolledDamage> {
    const deathPreventionScenarioRuntimeBeforeDefeat = deathPrevention
        ? cloneScenarioRuntimeStatus(core.scenarioRuntime)
        : null;
    const deathPreventionMonstersBeforeDefeat = deathPrevention
        ? core.monsters.map(cloneMonster)
        : [];
    const sourceEventRollBeforeEffect = cloneSourceEventRollFromRecentRoll(core.recentRoll);
    const result = applyEventEffectWithDeferredRolledDamage(
        core,
        eventEffect!,
        sourceTitle,
        timestamp,
    );
    if (!activatePendingRolledDamageAllocation(core, result.pendingRolledDamageAllocation)) {
        applyImmediateEventDeathPreventionIfNeeded(
            core,
            deathPrevention,
            timestamp,
            deathPreventionScenarioRuntimeBeforeDefeat,
            deathPreventionMonstersBeforeDefeat,
        );
    }
    const replacedWithDamageRoll = (
        result.pendingRolledDamageAllocation
        || !deathPrevention?.dice.length
    )
        ? setEventRolledDamageRecentRollFromSnapshot(
            core,
            result.eventEffectSnapshot,
            sourceTitle,
            timestamp,
            sourceEventRollBeforeEffect,
        )
        : false;
    if (!replacedWithDamageRoll && isEventRecentRoll(core.recentRoll)) {
        core.recentRoll.eventEffectSnapshot = result.eventEffectSnapshot;
    }
    return result;
}

function createEventHauntTriggeredPayload(
    core: BetrayalCore,
    payload: EventChoiceResolvedEvent['payload'] | EventRollFinalizedEvent['payload'],
    hauntRevealerPlayerId: string,
): HauntTriggeredPayload {
    const scenario = BETRAYAL_SCENARIO_CONFIGS[core.scenarioId];
    const hauntRevealResolution = payload.hauntRevealResolution
        ?? resolveHauntRevealResolutionForTrigger(
            core,
            { id: null, name: payload.hauntTriggerLabel ?? payload.sourceTitle },
            payload.hauntCardNumber,
        );
    const hauntCardNumber = payload.hauntCardNumber ?? hauntRevealResolution.hauntCardNumber;
    const hauntTraitorResolution = payload.hauntTraitorResolution
        ?? resolveHauntTraitorResolutionForTrigger(core, hauntCardNumber, hauntRevealerPlayerId, {
            explicitTraitorPlayerId: payload.hauntTraitorPlayerId,
            revealRepresentativeOnly: hauntRevealResolution.representativeOnly,
        });
    const hauntFirstPlayerResolution = resolveHauntFirstPlayerResolutionForTrigger(
        core,
        hauntCardNumber,
        hauntRevealerPlayerId,
        hauntTraitorResolution,
        { revealRepresentativeOnly: hauntRevealResolution.representativeOnly },
    );
    return {
        traitorPlayerId: hauntTraitorResolution.traitorPlayerId,
        hauntRevealerPlayerId,
        nextPlayerId: hauntFirstPlayerResolution.nextPlayerId,
        hauntCardNumber,
        hauntTriggerLabel: payload.hauntTriggerLabel ?? hauntRevealResolution.triggeringOmenName,
        hauntRevealResolution,
        hauntTraitorResolution,
        hauntFirstPlayerResolution,
        dustSetup: payload.dustSetup,
        magicCameraSetup: payload.magicCameraSetup,
        helpingHandsSetup: payload.helpingHandsSetup,
        uponReflectionSetup: payload.uponReflectionSetup,
        logText: hauntCardNumber !== 1
            ? `作祟触发：剧本${hauntCardNumber}（${payload.hauntTriggerLabel ?? payload.sourceTitle}）`
            : scenario.logs.hauntTriggered,
    };
}

export function applyBetrayalEventChoiceResolvedState(
    core: BetrayalCore,
    event: EventChoiceResolvedEvent,
): BetrayalEventStateResolution {
    const previousRecentRoll = core.recentRoll;
    const previousDiscovery = core.latestDiscovery;
    const deferNextPendingEventChoiceBehindRoll = Boolean(
        event.payload.eventRoll?.dice?.length
        && event.payload.nextPendingEventChoice,
    );
    const eventChoiceDiscovery = event.payload.nextPendingEventChoice
        ? event.payload.discovery
        : withEventChoiceResolutionStep(event.payload.discovery);
    core.pendingEventChoice = event.payload.nextPendingEventChoice && !deferNextPendingEventChoiceBehindRoll
        ? clonePendingEventChoice(event.payload.nextPendingEventChoice)
        : null;
    const nextDiscovery = cloneDiscoverySummary(eventChoiceDiscovery);
    mergePreviousDiscoveryResolutionSteps(previousDiscovery, nextDiscovery);
    core.latestDiscovery = nextDiscovery;
    core.latestDiscoveryOwnerPlayerId = event.payload.playerId;
    if (event.payload.drawnEventCardNameToBury) {
        buryEventCardToBottom(core, event.payload.drawnEventCardNameToBury);
    }
    const carriedRecentRoll = !event.payload.eventRoll?.dice?.length
        && previousRecentRoll
        && previousRecentRoll.sourceTitle === event.payload.sourceTitle
        && (previousRecentRoll.kind === 'eventDiceRoll' || previousRecentRoll.kind === 'eventTraitCheck')
        ? {
            ...previousRecentRoll,
            dice: [...previousRecentRoll.dice],
            branchThresholds: previousRecentRoll.branchThresholds?.map((branch) => ({
                ...branch,
                effect: cloneUseEffect(
                    event.payload.eventEffect && branch.label === previousRecentRoll.latestLabel
                        ? event.payload.eventEffect
                        : branch.effect,
                ),
            })),
            consumedRabbitFootCardIds: [...previousRecentRoll.consumedRabbitFootCardIds],
        }
        : null;
    core.recentRoll = event.payload.eventRoll?.dice?.length && event.payload.eventRoll.branchThresholds
        ? createEventRecentRoll(
            `${event.payload.playerId}-${event.payload.sourceTitle}-${event.timestamp}`,
            event.payload.playerId,
            event.payload.sourceTitle,
            event.payload.eventRoll.eventDescription,
            event.payload.eventRoll,
        )
        : carriedRecentRoll;
    consumeNextNonCombatTraitReplacementAfterTraitRoll(core, event.payload.playerId, event.payload.eventRoll);
    if (
        event.payload.eventRoll?.dice?.length
        && core.recentRoll
        && (event.payload.eventEffect || event.payload.nextPendingEventChoice)
    ) {
        core.pendingEventRollResolution = createPendingEventRollResolution(core, {
            rollId: core.recentRoll.id,
            playerId: event.payload.playerId,
            sourceTitle: event.payload.sourceTitle,
            eventEffect: event.payload.eventEffect,
            nextPendingEventChoice: event.payload.nextPendingEventChoice,
            deathPrevention: event.payload.deathPrevention,
            hauntTriggered: event.payload.hauntTriggered,
            hauntCardNumber: event.payload.hauntCardNumber,
            hauntTriggerLabel: event.payload.hauntTriggerLabel,
            hauntTraitorPlayerId: event.payload.hauntTraitorPlayerId,
            hauntRevealResolution: event.payload.hauntRevealResolution,
            hauntTraitorResolution: event.payload.hauntTraitorResolution,
            dustSetup: event.payload.dustSetup,
            magicCameraSetup: event.payload.magicCameraSetup,
            helpingHandsSetup: event.payload.helpingHandsSetup,
            uponReflectionSetup: event.payload.uponReflectionSetup,
            hauntRoll: event.payload.hauntRoll,
        });
        core.turnEndedByDiscovery = true;
        core.pendingCardResolutionQueue = event.payload.nextPendingEventChoice
            ? []
            : createPendingCardResolutionQueue({
                playerId: event.payload.playerId,
                requiredPlayerIds: [event.payload.playerId],
                roomId: core.currentExplorer.roomId,
                timestamp: event.timestamp,
                deckKind: 'event',
                discovery: eventChoiceDiscovery,
            });
        const synced = syncCurrentExplorerProjection(core);
        return {
            core: {
                ...synced,
                recommendedAction: resolveRecommendedAction(synced),
                activityLog: appendActivity(synced, event.payload.logText, eventChoiceDiscovery.tone),
            },
        };
    }
    if (event.payload.eventEffect) {
        applyEventEffectAndPendingDamageState(
            core,
            event.payload.eventEffect,
            event.payload.sourceTitle,
            event.timestamp,
            event.payload.deathPrevention,
        );
    }
    core.turnEndedByDiscovery = !event.payload.nextPendingEventChoice;
    core.pendingCardResolutionQueue = event.payload.nextPendingEventChoice
        ? []
        : createPendingCardResolutionQueue({
            playerId: event.payload.playerId,
            requiredPlayerIds: [event.payload.playerId],
            roomId: core.currentExplorer.roomId,
            timestamp: event.timestamp,
            deckKind: 'event',
            discovery: eventChoiceDiscovery,
        });
    const synced = syncCurrentExplorerProjection(core);
    const pendingDamageAllocationAfterEventChoice = core.pendingDamageAllocation;
    const nextCore = {
        ...synced,
        recommendedAction: pendingDamageAllocationAfterEventChoice ? 'endTurn' : resolveRecommendedAction(synced),
        activePlayerId: pendingDamageAllocationAfterEventChoice?.playerId ?? synced.activePlayerId,
        activityLog: appendActivity(synced, event.payload.logText, eventChoiceDiscovery.tone),
    };
    const dustCompletedAfterEventChoice = pendingDamageAllocationAfterEventChoice
        ? null
        : resolveDustTraitorVictoryResult(nextCore);
    if (dustCompletedAfterEventChoice) {
        return {
            core: nextCore,
            scenarioCompletedResult: dustCompletedAfterEventChoice,
        };
    }
    if (event.payload.hauntTriggered) {
        return {
            core: nextCore,
            hauntTriggeredPayload: createEventHauntTriggeredPayload(nextCore, event.payload, event.payload.playerId),
        };
    }
    return { core: nextCore };
}

export function applyBetrayalEventRolledState(
    core: BetrayalCore,
    event: EventRolledEvent,
): BetrayalEventStateResolution {
    core.pendingEventRollStart = null;
    if (event.payload.drawnEventCardNameToBury) {
        buryEventCardToBottom(core, event.payload.drawnEventCardNameToBury);
    }
    const eventRoll = event.payload.eventRoll;
    core.recentRoll = createEventRecentRoll(
        event.payload.rollId,
        event.payload.playerId,
        event.payload.sourceTitle,
        event.payload.eventDescription,
        eventRoll,
    );
    consumeNextNonCombatTraitReplacementAfterTraitRoll(
        core,
        event.payload.playerId,
        eventRoll,
    );
    const previousDiscovery = core.latestDiscovery;
    const eventDiscovery = cloneDiscoverySummary(event.payload.discovery);
    mergePreviousDiscoveryResolutionSteps(previousDiscovery, eventDiscovery);
    core.latestDiscovery = eventDiscovery;
    core.latestDiscoveryOwnerPlayerId = event.payload.playerId;
    const eventCardResolutionQueue = !event.payload.nextPendingEventChoice
        && (eventDiscovery.resolutionSteps?.length ?? 0) > 1
        ? createPendingCardResolutionQueue({
            playerId: event.payload.playerId,
            requiredPlayerIds: core.playerIds,
            roomId: core.currentExplorer.roomId,
            timestamp: event.timestamp,
            deckKind: 'event',
            discovery: eventDiscovery,
        })
        : [];
    if (
        event.payload.eventEffect
        && eventCardResolutionQueue.length > 0
        && !eventEffectHasDeferredRandomResult(event.payload.eventEffect)
    ) {
        applyEventEffectAndPendingDamageState(
            core,
            event.payload.eventEffect,
            event.payload.sourceTitle,
            event.timestamp,
            event.payload.deathPrevention,
        );
        core.pendingEventRollResolution = null;
        core.pendingCardResolutionQueue = eventCardResolutionQueue;
        core.turnEndedByDiscovery = true;
        const pendingDamageAllocationAfterEventRoll = core.pendingDamageAllocation;
        const synced = syncCurrentExplorerProjection(core);
        return {
            core: {
                ...synced,
                recommendedAction: pendingDamageAllocationAfterEventRoll ? 'endTurn' : resolveRecommendedAction(synced),
                activePlayerId: pendingDamageAllocationAfterEventRoll?.playerId ?? synced.activePlayerId,
                activityLog: appendActivity(synced, event.payload.logText, event.payload.discovery.tone),
            },
        };
    }
    if (event.payload.eventEffect || event.payload.nextPendingEventChoice) {
        core.pendingEventRollResolution = createPendingEventRollResolution(core, {
            rollId: event.payload.rollId,
            playerId: event.payload.playerId,
            sourceTitle: event.payload.sourceTitle,
            eventEffect: event.payload.eventEffect,
            nextPendingEventChoice: event.payload.nextPendingEventChoice,
            deathPrevention: event.payload.deathPrevention,
        });
    } else {
        core.pendingEventRollResolution = null;
    }
    core.turnEndedByDiscovery = true;
    const synced = syncCurrentExplorerProjection(core);
    return {
        core: {
            ...synced,
            recommendedAction: resolveRecommendedAction(synced),
            activityLog: appendActivity(synced, event.payload.logText, event.payload.discovery.tone),
        },
    };
}

export function applyBetrayalEventRollFinalizedState(
    core: BetrayalCore,
    event: EventRollFinalizedEvent,
): BetrayalEventStateResolution {
    if (core.pendingEventRollResolution?.rollId !== event.payload.rollId) {
        return { core };
    }
    if (!event.payload.isFullyAcknowledged) {
        core.pendingEventRollResolution = {
            ...core.pendingEventRollResolution,
            requiredPlayerIds: [...event.payload.requiredPlayerIds],
            acknowledgedPlayerIds: [...event.payload.acknowledgedPlayerIds],
        };
        acknowledgeEventEffectCardResolution(
            core,
            event.payload.sourceTitle,
            event.payload.playerId,
        );
        const synced = syncCurrentExplorerProjection(core);
        return {
            core: {
                ...synced,
                recommendedAction: resolveRecommendedAction(synced),
                activityLog: appendActivity(synced, event.payload.logText, 'accent'),
            },
        };
    }
    if (event.payload.nextPendingEventChoice) {
        core.pendingEventChoice = clonePendingEventChoice(event.payload.nextPendingEventChoice);
        core.pendingEventRollResolution = null;
        core.pendingCardResolutionQueue = [];
        core.turnEndedByDiscovery = false;
        const synced = syncCurrentExplorerProjection(core);
        return {
            core: {
                ...synced,
                recommendedAction: resolveRecommendedAction(synced),
                activityLog: appendActivity(synced, event.payload.logText, 'accent'),
            },
        };
    }
    const {
        pendingRolledDamageAllocation,
    } = applyEventEffectAndPendingDamageState(
        core,
        event.payload.effect,
        event.payload.sourceTitle,
        event.timestamp,
        event.payload.deathPrevention,
    );
    const eventEffectCardResolutionQueue =
        core.latestDiscovery?.kind === 'event'
        && core.latestDiscovery.title === event.payload.sourceTitle
        && (core.latestDiscovery.resolutionSteps?.length ?? 0) > 0
            ? createPendingCardResolutionQueue({
                playerId: event.payload.triggerPlayerId || event.payload.playerId,
                requiredPlayerIds: [event.payload.triggerPlayerId || event.payload.playerId],
                roomId: core.currentExplorer.roomId,
                timestamp: event.timestamp,
                deckKind: 'event',
                discovery: core.latestDiscovery,
            })
            : [];
    core.pendingEventRollResolution = null;
    if (eventEffectCardResolutionQueue.length > 0) {
        core.pendingCardResolutionQueue = eventEffectCardResolutionQueue;
    }
    acknowledgeEventEffectCardResolution(
        core,
        event.payload.sourceTitle,
        event.payload.playerId,
    );
    const eventTriggerPlayerId = event.payload.triggerPlayerId || event.payload.playerId;
    const synced = syncCurrentExplorerProjection(core);
    const nextCore = {
        ...synced,
        recommendedAction: pendingRolledDamageAllocation ? 'endTurn' : resolveRecommendedAction(synced),
        activePlayerId: pendingRolledDamageAllocation?.playerId ?? synced.activePlayerId,
        activityLog: appendActivity(synced, event.payload.logText, 'accent'),
    };
    if (event.payload.hauntTriggered) {
        return {
            core: nextCore,
            hauntTriggeredPayload: createEventHauntTriggeredPayload(nextCore, event.payload, eventTriggerPlayerId),
        };
    }
    return { core: nextCore };
}
