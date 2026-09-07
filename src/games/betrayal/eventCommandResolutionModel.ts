import type { RandomFn } from '../../engine/types';
import {
    isPendingCardResolutionFullyAcknowledged,
    isPendingEventRollResolutionFullyAcknowledged,
    isRecentRollFullyAcknowledged,
    resolveAcknowledgeableRecentRoll,
    resolvePendingCardResolutionAcknowledgedPlayerIds,
    resolvePendingCardResolutionRequiredPlayerIds,
    resolvePendingEventRollResolutionAcknowledgedPlayerIds,
    resolvePendingEventRollResolutionRequiredPlayerIds,
    resolveRecentRollAcknowledgedPlayerIds,
    resolveRecentRollRequiredPlayerIds,
} from './acknowledgementReadModel';
import {
    clonePendingEventChoice,
    cloneTurnEndedPayload,
} from './cardResolutionStateModel';
import { BETRAYAL_COMMANDS } from './commands';
import { clonePendingCardResolution } from './coreStateModel';
import { resolveBetrayalEventChoiceResolvedPayload } from './eventChoiceResolutionModel';
import { resolveEventDamageDeathPrevention } from './eventEffectResolutionModel';
import { resolveEvent } from './eventDeckModel';
import {
    materializeEventEffect,
    resolveEventRollResolution,
} from './eventRollModel';
import { findExplorerByPlayerId } from './explorerReadModel';
import {
    cloneDustRuntimeState,
    cloneHelpingHandsRuntimeState,
    cloneMagicCameraRuntimeState,
    cloneUponReflectionRuntimeState,
} from './hauntRuntimeSetupModel';
import { cloneHauntTraitorResolution } from './hauntTraitorResolutionModel';
import {
    BETRAYAL_TRAIT_LABEL as TRAIT_LABEL,
    cloneUseEffect,
    isWarningEventEffect,
} from './possessionEffects';
import type { BetrayalCore } from './game';
import type { BetrayalCommand } from './commandTypes';
import type { BetrayalEvent } from './events';

type EventRolledPayload = Extract<BetrayalEvent, { type: 'EVENT_ROLLED' }>['payload'];
type CardResolutionAcknowledgedPayload = Extract<BetrayalEvent, { type: 'CARD_RESOLUTION_ACKNOWLEDGED' }>['payload'];
type RecentRollAcknowledgedPayload = Extract<BetrayalEvent, { type: 'RECENT_ROLL_ACKNOWLEDGED' }>['payload'];
type EventRollFinalizedPayload = Extract<BetrayalEvent, { type: 'EVENT_ROLL_FINALIZED' }>['payload'];
type EventChoiceCommand = Extract<BetrayalCommand, { type: typeof BETRAYAL_COMMANDS.RESOLVE_EVENT_CHOICE }>;
type ToothNecklaceTraitGainedEvent = Extract<BetrayalEvent, { type: 'TOOTH_NECKLACE_TRAIT_GAINED' }>;
type EventChoiceResolvedEvent = Extract<BetrayalEvent, { type: 'EVENT_CHOICE_RESOLVED' }>;
const TOOTH_NECKLACE_CARD_ID = 'tooth-necklace';

export function resolveBetrayalEventRolledPayload(
    core: BetrayalCore,
    playerId: string,
    random: RandomFn,
    timestamp: number,
): EventRolledPayload | null {
    const pending = core.pendingEventRollStart;
    if (!pending) {
        return null;
    }
    const eventCard = resolveEvent(core);
    const resolution = resolveEventRollResolution(core, eventCard, random);
    const rollId = `${playerId}-${pending.sourceTitle}-${timestamp}`;
    return {
        rollId,
        playerId,
        sourceTitle: pending.sourceTitle,
        eventDescription: pending.eventDescription,
        eventEffect: cloneUseEffect(resolution.eventEffect),
        deathPrevention: resolution.deathPrevention
            ? {
                ...resolution.deathPrevention,
                dice: [...resolution.deathPrevention.dice],
                damageTraits: [...resolution.deathPrevention.damageTraits],
                traitsBeforeDamage: { ...resolution.deathPrevention.traitsBeforeDamage },
            }
            : undefined,
        eventRoll: {
            ...resolution.eventRoll,
            branchThresholds: resolution.eventRoll.branchThresholds?.map((branch) => ({
                ...branch,
                effect: cloneUseEffect(branch.effect),
            })),
        },
        nextPendingEventChoice: resolution.nextPendingEventChoice
            ? clonePendingEventChoice(resolution.nextPendingEventChoice)
            : undefined,
        discovery: {
            kind: 'event',
            title: pending.sourceTitle,
            summary: '结果已公开',
            detail: resolution.resolutionText,
            tone: isWarningEventEffect(resolution.eventEffect) ? 'warning' : 'accent',
            resolutionSteps: [{
                id: `event-effect-${pending.sourceTitle}`,
                kind: 'event-effect',
                text: `事件效果：${resolution.resolutionText}`,
                deckKind: 'event',
            }],
        },
        drawnEventCardNameToBury: eventCard.name,
        logText: `${core.currentExplorer.displayName}投掷事件：${pending.sourceTitle}（${resolution.resolutionText}）`,
    };
}

export function resolveBetrayalCardResolutionAcknowledgedPayload(
    core: BetrayalCore,
    playerId: string,
): CardResolutionAcknowledgedPayload | null {
    const pendingResolution = (core.pendingCardResolutionQueue ?? [])[0];
    if (!pendingResolution) {
        return null;
    }
    const actor = findExplorerByPlayerId(core, playerId) ?? core.currentExplorer;
    const requiredPlayerIds = resolvePendingCardResolutionRequiredPlayerIds(pendingResolution);
    const acknowledgedPlayerIds = Array.from(new Set([
        ...resolvePendingCardResolutionAcknowledgedPlayerIds(pendingResolution),
        playerId,
    ]));
    const isComplete = isPendingCardResolutionFullyAcknowledged(
        core,
        pendingResolution,
        acknowledgedPlayerIds,
    );
    return {
        playerId,
        resolution: clonePendingCardResolution({
            ...pendingResolution,
            requiredPlayerIds,
            acknowledgedPlayerIds,
        }),
        remainingCount: Math.max(
            0,
            (core.pendingCardResolutionQueue ?? []).length - (isComplete ? 1 : 0),
        ),
        acknowledgedPlayerIds,
        remainingAcknowledgementCount: Math.max(
            0,
            requiredPlayerIds.length - acknowledgedPlayerIds.length,
        ),
        logText: `${actor.displayName}确认${pendingResolution.cardName}（${acknowledgedPlayerIds.length}/${requiredPlayerIds.length}）：${pendingResolution.text}`,
    };
}

export function resolveBetrayalRecentRollAcknowledgedPayload(
    core: BetrayalCore,
    playerId: string,
): RecentRollAcknowledgedPayload | null {
    const recentRoll = resolveAcknowledgeableRecentRoll(core);
    if (!recentRoll) {
        return null;
    }
    const actor = findExplorerByPlayerId(core, playerId) ?? core.currentExplorer;
    const requiredPlayerIds = resolveRecentRollRequiredPlayerIds(core, recentRoll);
    const acknowledgedPlayerIds = Array.from(new Set([
        ...resolveRecentRollAcknowledgedPlayerIds(recentRoll),
        playerId,
    ]));
    const isFullyAcknowledged = isRecentRollFullyAcknowledged(
        core,
        recentRoll,
        acknowledgedPlayerIds,
    );
    return {
        playerId,
        rollId: recentRoll.id,
        sourceTitle: recentRoll.sourceTitle,
        requiredPlayerIds,
        acknowledgedPlayerIds,
        remainingAcknowledgementCount: Math.max(0, requiredPlayerIds.length - acknowledgedPlayerIds.length),
        isFullyAcknowledged,
        logText: `${actor.displayName}确认${recentRoll.sourceTitle}投骰结果（${acknowledgedPlayerIds.length}/${requiredPlayerIds.length}）`,
    };
}

export function resolveBetrayalEventRollFinalizedPayload(
    core: BetrayalCore,
    playerId: string,
    random: RandomFn,
): EventRollFinalizedPayload | null {
    const pending = core.pendingEventRollResolution;
    if (!pending) {
        return null;
    }
    const actor = findExplorerByPlayerId(core, playerId) ?? core.currentExplorer;
    const requiredPlayerIds = resolvePendingEventRollResolutionRequiredPlayerIds(core, pending);
    const acknowledgedPlayerIds = Array.from(new Set([
        ...resolvePendingEventRollResolutionAcknowledgedPlayerIds(pending),
        playerId,
    ]));
    const isFullyAcknowledged = isPendingEventRollResolutionFullyAcknowledged(
        core,
        pending,
        acknowledgedPlayerIds,
    );
    const shouldResolveFinalEffect = isFullyAcknowledged && !pending.nextPendingEventChoice;
    const finalEffect = shouldResolveFinalEffect
        ? materializeEventEffect(pending.effect, random, core.currentExplorer, core)
        : cloneUseEffect(pending.effect);
    const finalDeathPrevention = shouldResolveFinalEffect
        ? resolveEventDamageDeathPrevention(core, finalEffect, random)
        : pending.deathPrevention;
    return {
        rollId: pending.rollId,
        playerId,
        triggerPlayerId: pending.playerId,
        sourceTitle: pending.sourceTitle,
        requiredPlayerIds,
        acknowledgedPlayerIds,
        remainingAcknowledgementCount: Math.max(0, requiredPlayerIds.length - acknowledgedPlayerIds.length),
        isFullyAcknowledged,
        effect: cloneUseEffect(finalEffect),
        nextPendingEventChoice: pending.nextPendingEventChoice
            ? clonePendingEventChoice(pending.nextPendingEventChoice)
            : undefined,
        deathPrevention: finalDeathPrevention
            ? {
                ...finalDeathPrevention,
                dice: [...finalDeathPrevention.dice],
                damageTraits: [...finalDeathPrevention.damageTraits],
                traitsBeforeDamage: { ...finalDeathPrevention.traitsBeforeDamage },
            }
            : undefined,
        hauntTriggered: pending.hauntTriggered,
        hauntCardNumber: pending.hauntCardNumber,
        hauntTriggerLabel: pending.hauntTriggerLabel,
        hauntTraitorPlayerId: pending.hauntTraitorPlayerId,
        hauntRevealResolution: pending.hauntRevealResolution
            ? { ...pending.hauntRevealResolution }
            : undefined,
        hauntTraitorResolution: pending.hauntTraitorResolution
            ? cloneHauntTraitorResolution(pending.hauntTraitorResolution) ?? undefined
            : undefined,
        dustSetup: pending.dustSetup ? cloneDustRuntimeState(pending.dustSetup) : undefined,
        magicCameraSetup: pending.magicCameraSetup
            ? cloneMagicCameraRuntimeState(pending.magicCameraSetup)
            : undefined,
        helpingHandsSetup: pending.helpingHandsSetup
            ? cloneHelpingHandsRuntimeState(pending.helpingHandsSetup)
            : undefined,
        uponReflectionSetup: pending.uponReflectionSetup
            ? cloneUponReflectionRuntimeState(pending.uponReflectionSetup)
            : undefined,
        hauntRoll: pending.hauntRoll ? { ...pending.hauntRoll } : undefined,
        logText: pending.requiresAcknowledgement === false
            ? `${pending.sourceTitle}的最终投骰结果已自动结算`
            : `${actor.displayName}确认${pending.sourceTitle}的最终投骰结果（${acknowledgedPlayerIds.length}/${requiredPlayerIds.length}）`,
    };
}

export function resolveBetrayalEventChoiceCommandEvents(
    core: BetrayalCore,
    command: EventChoiceCommand,
    random: RandomFn,
    timestamp: number,
): BetrayalEvent[] {
    const pending = core.pendingEventChoice;
    if (!pending) {
        return [];
    }
    const actor = findExplorerByPlayerId(core, command.playerId) ?? core.currentExplorer;
    if (pending.itemResolution === 'tooth-necklace-end-turn' && pending.deferredTurnEnd) {
        const accepted = command.payload.accept !== false;
        const trait = accepted ? command.payload.trait : undefined;
        const traitLabel = trait ? TRAIT_LABEL[trait] : '';
        const event: ToothNecklaceTraitGainedEvent = {
            type: 'TOOTH_NECKLACE_TRAIT_GAINED',
            payload: {
                playerId: command.playerId,
                cardId: pending.itemCardId ?? TOOTH_NECKLACE_CARD_ID,
                cardName: pending.sourceTitle,
                accepted,
                trait,
                deferredTurnEnd: cloneTurnEndedPayload(pending.deferredTurnEnd),
                logText: accepted && trait
                    ? `${actor.displayName}使用${pending.sourceTitle}，${traitLabel}从濒死提升 1 步`
                    : `${actor.displayName}跳过${pending.sourceTitle}的回合结束属性提升`,
            },
            timestamp,
        };
        return [event];
    }
    const eventChoicePayload = resolveBetrayalEventChoiceResolvedPayload(
        core,
        command.playerId,
        command.payload,
        random,
        timestamp,
    );
    if (!eventChoicePayload) {
        return [];
    }
    const event: EventChoiceResolvedEvent = {
        type: 'EVENT_CHOICE_RESOLVED',
        payload: eventChoicePayload,
        timestamp,
    };
    return [event];
}
