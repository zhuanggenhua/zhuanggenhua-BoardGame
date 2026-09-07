import type { RandomFn } from '../../engine/types';
import {
    eventRollResolutionNeedsSharedAcknowledgement,
    resolveRoomExploredCardResolutionRequiredPlayerIds,
} from './acknowledgementReadModel';
import {
    cloneDiscoverySummary,
    clonePendingEventChoice,
    createPendingCardResolutionQueue,
} from './cardResolutionStateModel';
import {
    appendActivity,
    cloneMonster,
    cloneScenarioRuntimeStatus,
    syncCurrentExplorerProjection,
} from './coreStateModel';
import {
    activatePendingRolledDamageAllocation,
    applyEventEffect,
    applyEventEffectWithDeferredRolledDamage,
    applyImmediateEventDeathPreventionIfNeeded,
    cloneSourceEventRollFromRecentRoll,
    isEventRecentRoll,
    setEventRolledDamageRecentRollFromSnapshot,
} from './eventEffectResolutionModel';
import { buryEventCardToBottom } from './eventDeckModel';
import { applyDustEventEffectDeathIfNeeded } from './deathStateReadModel';
import type {
    BetrayalCore,
    BetrayalEndgameResult,
} from './game';
import type { BetrayalEvent } from './events';
import { buildHauntRollThresholds } from './hauntProgress';
import {
    cloneDustRuntimeState,
    cloneHelpingHandsRuntimeState,
    cloneMagicCameraRuntimeState,
    cloneUponReflectionRuntimeState,
    createUponReflectionRuntimeState,
} from './hauntRuntimeSetupModel';
import { resolveHauntRevealResolutionForTrigger } from './hauntSetupModel';
import {
    cloneHauntTraitorResolution,
    resolveHauntFirstPlayerResolutionForTrigger,
    resolveHauntTraitorResolutionForTrigger,
} from './hauntTraitorResolutionModel';
import { resolveDustTraitorVictoryResult } from './hauntVictoryModel';
import { collectMummyGirlByExplorerIfPresent } from './mummyHauntRules';
import {
    buryPossessionCardToBottom,
    cloneInventoryCard,
    removePossessionCardFromDeck,
} from './possessionDeckModel';
import {
    cloneUseEffect,
    eventEffectNeedsPendingEventChoice,
} from './possessionEffects';
import { resolveRecommendedAction } from './recommendedActionReadModel';
import {
    applyBetrayalRoomExploredPlacementState,
    applyRoomDiscoveryEffect,
    applyRoomDrawResolutionToCore,
} from './roomDiscoveryModel';
import { BETRAYAL_SCENARIO_CONFIGS } from './scenarioConfig';
import { consumeNextNonCombatTraitReplacementAfterTraitRoll } from './traitRollModel';

type RoomExploredEvent = Extract<BetrayalEvent, { type: 'ROOM_EXPLORED' }>;
type HauntTriggeredPayload = Extract<BetrayalEvent, { type: 'HAUNT_TRIGGERED' }>['payload'];

export interface BetrayalRoomExploredStateResolution {
    core: BetrayalCore;
    scenarioCompletedResult?: BetrayalEndgameResult;
    hauntTriggeredPayload?: HauntTriggeredPayload;
}

function createRoomExploredHauntTriggeredPayload(
    core: BetrayalCore,
    event: RoomExploredEvent,
    fallbackRandom: RandomFn,
): HauntTriggeredPayload {
    const hauntRevealerPlayerId = event.payload.playerId;
    const hauntRevealResolution = event.payload.hauntRevealResolution
        ?? resolveHauntRevealResolutionForTrigger(core, event.payload.drawnCard);
    const hauntTraitorResolution = resolveHauntTraitorResolutionForTrigger(
        core,
        hauntRevealResolution.hauntCardNumber,
        hauntRevealerPlayerId,
        { revealRepresentativeOnly: hauntRevealResolution.representativeOnly },
    );
    const hauntTraitorPlayerId = hauntTraitorResolution.traitorPlayerId;
    const hauntFirstPlayerResolution = resolveHauntFirstPlayerResolutionForTrigger(
        core,
        hauntRevealResolution.hauntCardNumber,
        hauntRevealerPlayerId,
        hauntTraitorResolution,
        { revealRepresentativeOnly: hauntRevealResolution.representativeOnly },
    );
    const nextPlayerId = hauntFirstPlayerResolution.nextPlayerId;
    const uponReflectionSetup = hauntRevealResolution.hauntCardNumber === 7
        ? createUponReflectionRuntimeState(core, hauntRevealerPlayerId, fallbackRandom)
        : undefined;
    return {
        traitorPlayerId: hauntTraitorPlayerId,
        hauntRevealerPlayerId,
        nextPlayerId,
        hauntCardNumber: hauntRevealResolution.hauntCardNumber,
        hauntTriggerLabel: hauntRevealResolution.triggeringOmenName,
        hauntRevealResolution,
        hauntTraitorResolution,
        hauntFirstPlayerResolution,
        uponReflectionSetup,
        logText: hauntRevealResolution.hauntCardNumber === 1
            ? BETRAYAL_SCENARIO_CONFIGS[core.scenarioId].logs.hauntTriggered
            : `作祟触发：剧本${hauntRevealResolution.hauntCardNumber}（${hauntRevealResolution.triggeringOmenName}）`,
    };
}

function applyRoomExploredImmediateEventEffect(
    core: BetrayalCore,
    event: RoomExploredEvent,
): void {
    const deathPreventionScenarioRuntimeBeforeDefeat = event.payload.deathPrevention
        ? cloneScenarioRuntimeStatus(core.scenarioRuntime)
        : null;
    const deathPreventionMonstersBeforeDefeat = event.payload.deathPrevention
        ? core.monsters.map(cloneMonster)
        : [];
    const sourceEventRollBeforeEffect = cloneSourceEventRollFromRecentRoll(core.recentRoll);
    const {
        eventEffectSnapshot,
        pendingRolledDamageAllocation,
    } = applyEventEffectWithDeferredRolledDamage(
        core,
        event.payload.eventEffect!,
        event.payload.discovery.title,
        event.timestamp,
    );
    if (!activatePendingRolledDamageAllocation(core, pendingRolledDamageAllocation)) {
        applyImmediateEventDeathPreventionIfNeeded(
            core,
            event.payload.deathPrevention,
            event.timestamp,
            deathPreventionScenarioRuntimeBeforeDefeat,
            deathPreventionMonstersBeforeDefeat,
        );
    }
    const replacedWithDamageRoll = (
        pendingRolledDamageAllocation
        || !event.payload.deathPrevention?.dice.length
    )
        ? setEventRolledDamageRecentRollFromSnapshot(
            core,
            eventEffectSnapshot,
            event.payload.discovery.title,
            event.timestamp,
            sourceEventRollBeforeEffect,
        )
        : false;
    if (!replacedWithDamageRoll && isEventRecentRoll(core.recentRoll)) {
        core.recentRoll.eventEffectSnapshot = eventEffectSnapshot;
    }
    core.turnEndedByDiscovery = true;
}

export function applyBetrayalRoomExploredState(
    core: BetrayalCore,
    event: RoomExploredEvent,
    fallbackRandom: RandomFn,
): BetrayalRoomExploredStateResolution {
    applyBetrayalRoomExploredPlacementState(core, event.payload);
    core.movesRemaining = 0;
    core.turnEndedByDiscovery = true;
    applyRoomDrawResolutionToCore(core, event.payload.roomDrawResolution);
    core.exploreIndex += event.payload.skippedRoomWithHolySymbol ? 2 : 1;
    core.highlightedDeckKind = event.payload.deckKind;
    core.latestDiscovery = cloneDiscoverySummary(event.payload.discovery);
    core.latestDiscoveryOwnerPlayerId = event.payload.playerId;
    core.pendingEventChoice = null;
    core.pendingEventRollStart = event.payload.eventRollPending
        ? {
            playerId: event.payload.playerId,
            roomId: event.payload.roomId,
            sourceTitle: event.payload.discovery.title,
            eventDescription: event.payload.eventDescription,
        }
        : null;
    core.pendingEventRollResolution = null;
    core.pendingCardResolutionQueue = event.payload.eventRollPending || event.payload.nextPendingEventChoice
        ? []
        : createPendingCardResolutionQueue({
            playerId: event.payload.playerId,
            requiredPlayerIds: resolveRoomExploredCardResolutionRequiredPlayerIds(core, event),
            roomId: event.payload.roomId,
            timestamp: event.timestamp,
            deckKind: event.payload.deckKind,
            discovery: event.payload.discovery,
            drawnCard: event.payload.drawnCard,
            roomDiscoveryCards: event.payload.roomDiscoveryCards,
            buriedRoomDiscoveryCards: event.payload.buriedRoomDiscoveryCards,
        });
    if (
        event.payload.deckKind === 'event'
        && !event.payload.skippedEventWithTraitorPower
        && !event.payload.skippedEventWithUponReflection
        && !event.payload.nextPendingEventChoice
        && !event.payload.eventRollPending
    ) {
        buryEventCardToBottom(core, event.payload.discovery.title);
    }
    if (event.payload.eventRoll?.dice?.length && event.payload.eventRoll.branchThresholds) {
        core.recentRoll = {
            id: `${event.payload.playerId}-${event.payload.roomId}-${event.timestamp}`,
            kind: event.payload.eventRoll.kind === 'dice' ? 'eventDiceRoll' : 'eventTraitCheck',
            playerId: event.payload.playerId,
            sourceTitle: event.payload.discovery.title,
            eventDescription: event.payload.eventRoll.eventDescription,
            trait: event.payload.eventRoll.trait,
            rollLabel: event.payload.eventRoll.rollLabel,
            dice: [...event.payload.eventRoll.dice],
            passiveBonus: event.payload.eventRoll.passiveBonus ?? 0,
            branchThresholds: event.payload.eventRoll.branchThresholds.map((branch) => ({
                ...branch,
                effect: { ...branch.effect },
            })),
            latestLabel: event.payload.eventRoll.label,
            consumedRabbitFootCardIds: [],
        };
    } else if (event.payload.hauntRoll?.dice.length) {
        core.recentRoll = {
            id: `${event.payload.playerId}-${event.payload.roomId}-haunt-${event.timestamp}`,
            kind: 'hauntRoll',
            playerId: event.payload.playerId,
            sourceTitle: event.payload.discovery.title,
            rollLabel: '作祟检定',
            dice: [...event.payload.hauntRoll.dice],
            passiveBonus: 0,
            branchThresholds: buildHauntRollThresholds(event.payload.hauntRoll),
            latestLabel: event.payload.hauntRoll.triggered ? '作祟开始' : '未触发作祟',
            consumedRabbitFootCardIds: [],
        };
    } else {
        core.recentRoll = null;
    }
    consumeNextNonCombatTraitReplacementAfterTraitRoll(core, event.payload.playerId, event.payload.eventRoll);
    if (event.payload.deckKind === 'omen') {
        core.scenarioRuntime.omensDiscovered += 1;
    }
    applyRoomDiscoveryEffect(core, event.payload.room.discoveryEffect);
    if (event.payload.buriedRoomDiscoveryCards?.length) {
        for (const buriedCard of event.payload.buriedRoomDiscoveryCards) {
            buryPossessionCardToBottom(core, 'item', buriedCard.id);
        }
    }
    if (event.payload.roomDiscoveryCards?.length) {
        core.currentExplorer.inventory = [
            ...core.currentExplorer.inventory,
            ...event.payload.roomDiscoveryCards.map(cloneInventoryCard),
        ];
        for (const drawnRoomCard of event.payload.roomDiscoveryCards) {
            removePossessionCardFromDeck(core, 'item', drawnRoomCard.id);
        }
    }

    if (event.payload.nextPendingEventChoice) {
        core.pendingEventChoice = clonePendingEventChoice(event.payload.nextPendingEventChoice);
        core.pendingCardResolutionQueue = [];
        core.turnEndedByDiscovery = false;
        const mummyGirlPickedUp = collectMummyGirlByExplorerIfPresent(
            core,
            event.payload.playerId,
            event.payload.roomId,
        );
        const synced = syncCurrentExplorerProjection(core);
        const mummyGirlPickupLog = mummyGirlPickedUp
            ? `；${synced.currentExplorer.displayName}拾起女孩`
            : '';
        return {
            core: {
                ...synced,
                recommendedAction: resolveRecommendedAction(synced),
                activityLog: appendActivity(synced, `${event.payload.logText}${mummyGirlPickupLog}`, event.payload.discovery.tone),
            },
        };
    }

    if (event.payload.skippedEventWithTraitorPower || event.payload.skippedEventWithUponReflection) {
        if (event.payload.skippedEventWithUponReflection) {
            core.turnEndedByDiscovery = false;
        }
    } else if (event.payload.skippedEventWithIdol) {
        // 雕像仍消耗这次事件牌堆顺序，但不结算事件效果。
    } else if (
        event.payload.deckKind === 'event'
        && eventEffectNeedsPendingEventChoice(event.payload.eventEffect)
    ) {
        if (event.payload.eventEffect.mode === 'allTraitChecks') {
            applyEventEffect(core, event.payload.eventEffect);
            applyDustEventEffectDeathIfNeeded(core);
        }
        core.pendingEventChoice = {
            id: `${event.payload.playerId}-${event.payload.roomId}-${event.timestamp}`,
            playerId: event.payload.playerId,
            sourceTitle: event.payload.discovery.title,
            eventDescription: event.payload.eventDescription,
            acceptLabel: event.payload.eventEffect.mode === 'optionalEventRoll'
                || event.payload.eventEffect.mode === 'optionalEffect'
                || event.payload.eventEffect.mode === 'optionalItemEffect'
                || event.payload.eventEffect.mode === 'optionalHauntRoll'
                ? event.payload.eventEffect.acceptLabel
                : undefined,
            declineLabel: event.payload.eventEffect.mode === 'optionalEventRoll'
                || event.payload.eventEffect.mode === 'optionalEffect'
                || event.payload.eventEffect.mode === 'optionalItemEffect'
                || event.payload.eventEffect.mode === 'optionalHauntRoll'
                ? event.payload.eventEffect.declineLabel
                : undefined,
            effect: cloneUseEffect(event.payload.eventEffect),
        };
        core.turnEndedByDiscovery = false;
    } else if (
        event.payload.deckKind === 'event'
        && event.payload.eventRoll?.dice?.length
        && core.recentRoll
        && event.payload.eventEffect
    ) {
        const needsSharedEventRollAcknowledgement = eventRollResolutionNeedsSharedAcknowledgement({
            hauntRevealResolution: event.payload.hauntRevealResolution,
            hauntTraitorResolution: event.payload.hauntTraitorResolution,
            dustSetup: event.payload.dustSetup,
            magicCameraSetup: event.payload.magicCameraSetup,
            helpingHandsSetup: event.payload.helpingHandsSetup,
            uponReflectionSetup: event.payload.uponReflectionSetup,
        });
        core.pendingEventRollResolution = {
            rollId: core.recentRoll.id,
            playerId: event.payload.playerId,
            sourceTitle: event.payload.discovery.title,
            requiredPlayerIds: needsSharedEventRollAcknowledgement && core.playerIds.length > 0
                ? [...core.playerIds]
                : [event.payload.playerId],
            acknowledgedPlayerIds: [],
            effect: cloneUseEffect(event.payload.eventEffect),
            requiresAcknowledgement: true,
            deathPrevention: event.payload.deathPrevention
                ? {
                    ...event.payload.deathPrevention,
                    dice: [...event.payload.deathPrevention.dice],
                    damageTraits: [...event.payload.deathPrevention.damageTraits],
                    traitsBeforeDamage: { ...event.payload.deathPrevention.traitsBeforeDamage },
                }
                : undefined,
            hauntTriggered: event.payload.hauntTriggered,
            hauntCardNumber: event.payload.hauntCardNumber,
            hauntTriggerLabel: event.payload.hauntTriggerLabel,
            hauntTraitorPlayerId: event.payload.hauntTraitorPlayerId,
            hauntRevealResolution: event.payload.hauntRevealResolution
                ? { ...event.payload.hauntRevealResolution }
                : undefined,
            hauntTraitorResolution: event.payload.hauntTraitorResolution
                ? cloneHauntTraitorResolution(event.payload.hauntTraitorResolution) ?? undefined
                : undefined,
            dustSetup: event.payload.dustSetup ? cloneDustRuntimeState(event.payload.dustSetup) : undefined,
            magicCameraSetup: event.payload.magicCameraSetup
                ? cloneMagicCameraRuntimeState(event.payload.magicCameraSetup)
                : undefined,
            helpingHandsSetup: event.payload.helpingHandsSetup
                ? cloneHelpingHandsRuntimeState(event.payload.helpingHandsSetup)
                : undefined,
            uponReflectionSetup: event.payload.uponReflectionSetup
                ? cloneUponReflectionRuntimeState(event.payload.uponReflectionSetup)
                : undefined,
            hauntRoll: event.payload.hauntRoll ? { ...event.payload.hauntRoll } : undefined,
        };
        core.turnEndedByDiscovery = true;
    } else if (!core.turnEndedByDiscovery && event.payload.deckKind === 'event' && event.payload.eventEffect) {
        applyRoomExploredImmediateEventEffect(core, event);
    } else if (event.payload.deckKind === 'event' && event.payload.eventEffect) {
        applyRoomExploredImmediateEventEffect(core, event);
    } else if (
        event.payload.drawnCard
        && (event.payload.deckKind === 'item' || event.payload.deckKind === 'omen')
    ) {
        core.currentExplorer.inventory = [...core.currentExplorer.inventory, cloneInventoryCard(event.payload.drawnCard)];
        removePossessionCardFromDeck(core, event.payload.deckKind, event.payload.drawnCard.id);
        if (event.payload.mummyForcedOmenSearch) {
            core.possessionOrderByKind = {
                ...core.possessionOrderByKind,
                omen: event.payload.mummyForcedOmenSearch.shuffledOmenDeck.map(cloneInventoryCard),
            };
            core.scenarioRuntime = {
                ...core.scenarioRuntime,
                mummyForcedOmenSearch: {
                    ...event.payload.mummyForcedOmenSearch,
                    shuffledOmenDeck: event.payload.mummyForcedOmenSearch.shuffledOmenDeck.map(cloneInventoryCard),
                },
            };
        }
    }

    const mummyGirlPickedUp = collectMummyGirlByExplorerIfPresent(
        core,
        event.payload.playerId,
        event.payload.roomId,
    );
    const synced = syncCurrentExplorerProjection(core);
    const mummyGirlPickupLog = mummyGirlPickedUp
        ? `；${synced.currentExplorer.displayName}拾起女孩`
        : '';
    const pendingDamageAllocationAfterEventDraw = core.pendingDamageAllocation;
    const nextCore = {
        ...synced,
        recommendedAction: pendingDamageAllocationAfterEventDraw ? 'endTurn' : resolveRecommendedAction(synced),
        activePlayerId: pendingDamageAllocationAfterEventDraw?.playerId ?? synced.activePlayerId,
        activityLog: appendActivity(synced, `${event.payload.logText}${mummyGirlPickupLog}`, event.payload.discovery.tone),
    };
    const scenarioCompletedResult = pendingDamageAllocationAfterEventDraw
        ? null
        : resolveDustTraitorVictoryResult(nextCore);
    if (scenarioCompletedResult) {
        return { core: nextCore, scenarioCompletedResult };
    }
    if (event.payload.hauntTriggered) {
        return {
            core: nextCore,
            hauntTriggeredPayload: createRoomExploredHauntTriggeredPayload(core, event, fallbackRandom),
        };
    }
    return { core: nextCore };
}
