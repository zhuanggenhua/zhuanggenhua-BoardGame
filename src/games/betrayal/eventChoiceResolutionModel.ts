import type {
    RandomFn,
    ValidationResult,
} from '../../engine/types';
import { BETRAYAL_COMMANDS } from './commands';
import { rollBetrayalDicePips } from './diceRules';
import { resolveEvent } from './eventDeckModel';
import { resolveEventDamageDeathPrevention } from './eventEffectResolutionModel';
import {
    materializeEventEffect,
    resolveEventBranch,
    rollEventFixedDice,
    type BetrayalEventRollPayload,
} from './eventRollModel';
import { findExplorerByPlayerId } from './explorerReadModel';
import { resolveBetrayalHauntRisk } from './hauntProgress';
import {
    createDustRuntimeState,
    createUponReflectionRuntimeState,
} from './hauntRuntimeSetupModel';
import { resolveHauntRevealResolutionForTrigger } from './hauntSetupModel';
import { resolveHauntTraitorResolutionForTrigger } from './hauntTraitorResolutionModel';
import {
    applyItemChoiceToEffect,
    effectAllowsItemChoice,
} from './possessionItemChoiceModel';
import { canUseIdolToSkipEvent } from './possessionActionReadModel';
import {
    BETRAYAL_TRAIT_LABEL as TRAIT_LABEL,
    applyAdjacentRoomChoiceToEffect,
    applyChosenTraitToEffect,
    applyGeneralDamageTraitsToEffect,
    applyRoomTargetChoiceToEffect,
    cloneUseEffect,
    effectAllowsAdjacentRoomChoice,
    effectAllowsChosenTrait,
    effectAllowsGeneralDamageTraits,
    effectAllowsRoomTargetChoice,
    effectHasUnresolvedChosenTraitChoice,
    effectHasUnresolvedGeneralDamageChoice,
    effectHasUnresolvedTraitChoice,
    effectNeedsAdjacentRoomChoice,
    effectNeedsRoomTargetChoice,
    effectNeedsTraitChoice,
    eventEffectNeedsPendingEventChoice,
    formatEffectLabel,
    isWarningEventEffect,
    type UseEffectProfile,
} from './possessionEffects';
import { isBetrayalOptionalHauntRollRuntimeSupported } from './scenarioConfig';
import { canUseBetrayalTraitorPowers } from './traitorPowerRules';
import {
    resolveNonCombatTraitCheckValue,
    rollEventTraitCheckWithDice,
} from './traitRollModel';
import type {
    BetrayalCore,
    BetrayalDiscoveryResolutionStep,
    BetrayalDiscoverySummary,
    BetrayalPendingEventChoiceState,
    BetrayalPendingEventRollResolutionState,
    BetrayalTraitKey,
} from './game';
import type { BetrayalCommandMap } from './commandTypes';

type ResolveEventChoicePayload = BetrayalCommandMap[typeof BETRAYAL_COMMANDS.RESOLVE_EVENT_CHOICE];

export interface BetrayalEventChoiceResolvedPayload {
    playerId: string;
    sourceTitle: string;
    eventDescription?: string;
    accepted: boolean;
    hauntTriggered?: boolean;
    hauntTraitorPlayerId?: string | null;
    hauntCardNumber?: number;
    hauntTriggerLabel?: string;
    hauntRevealResolution?: BetrayalPendingEventRollResolutionState['hauntRevealResolution'];
    hauntTraitorResolution?: BetrayalPendingEventRollResolutionState['hauntTraitorResolution'];
    dustSetup?: BetrayalPendingEventRollResolutionState['dustSetup'];
    magicCameraSetup?: BetrayalPendingEventRollResolutionState['magicCameraSetup'];
    helpingHandsSetup?: BetrayalPendingEventRollResolutionState['helpingHandsSetup'];
    uponReflectionSetup?: BetrayalPendingEventRollResolutionState['uponReflectionSetup'];
    hauntRoll?: BetrayalPendingEventRollResolutionState['hauntRoll'];
    nextPendingEventChoice?: BetrayalPendingEventChoiceState;
    eventEffect?: UseEffectProfile;
    deathPrevention?: BetrayalPendingEventRollResolutionState['deathPrevention'];
    eventRoll?: BetrayalEventRollPayload;
    drawnEventCardNameToBury?: string;
    discovery: BetrayalDiscoverySummary;
    logText: string;
}

function resolveChooseTraitRollPreviewEffect(
    core: BetrayalCore,
    effect: Extract<UseEffectProfile, { mode: 'chooseTraitRoll' }>,
    selectedTrait: BetrayalTraitKey,
): UseEffectProfile {
    const previewRollTotal = resolveNonCombatTraitCheckValue(core, core.currentExplorer, selectedTrait);
    const previewBranch = resolveEventBranch(effect.branches, previewRollTotal);
    return applyChosenTraitToEffect(cloneUseEffect(previewBranch.effect), selectedTrait);
}

function applyEventChoiceSelections(
    core: BetrayalCore,
    effect: UseEffectProfile,
    payload: ResolveEventChoicePayload,
): UseEffectProfile {
    const selectedTraitEffect = applyChosenTraitToEffect(effect, payload.trait);
    const damageSelectedEffect = applyGeneralDamageTraitsToEffect(selectedTraitEffect, payload.traits);
    const adjacentSelectedEffect = applyAdjacentRoomChoiceToEffect(core, damageSelectedEffect, payload.targetRoomId);
    return applyRoomTargetChoiceToEffect(core, adjacentSelectedEffect, payload.targetRoomId);
}

function eventEffectNeedsFollowUpChoice(effect: UseEffectProfile): boolean {
    return effectHasUnresolvedTraitChoice(effect)
        || effectHasUnresolvedGeneralDamageChoice(effect)
        || effectNeedsAdjacentRoomChoice(effect)
        || effectNeedsRoomTargetChoice(effect);
}

function createPendingChoiceForEventEffect(
    id: string,
    playerId: string,
    sourceTitle: string,
    eventDescription: string | undefined,
    effect: UseEffectProfile,
): BetrayalPendingEventChoiceState {
    return {
        id,
        playerId,
        sourceTitle,
        eventDescription,
        sourceKind: 'event',
        acceptLabel: effect.mode === 'optionalEventRoll'
            || effect.mode === 'optionalEffect'
            || effect.mode === 'optionalItemEffect'
            || effect.mode === 'optionalHauntRoll'
            ? effect.acceptLabel
            : undefined,
        declineLabel: effect.mode === 'optionalEventRoll'
            || effect.mode === 'optionalEffect'
            || effect.mode === 'optionalItemEffect'
            || effect.mode === 'optionalHauntRoll'
            ? effect.declineLabel
            : undefined,
        effect: cloneUseEffect(effect),
    };
}

function resolveEventSymbolSkipMethod(
    core: BetrayalCore,
    playerId: string,
): NonNullable<BetrayalPendingEventChoiceState['eventSymbolSkip']>['method'] | null {
    if (canUseBetrayalTraitorPowers(core, playerId)) {
        return 'traitorPower';
    }
    if (canUseIdolToSkipEvent(core)) {
        return 'idol';
    }
    return null;
}

export function createBetrayalEventSymbolSkipChoice(
    core: BetrayalCore,
    playerId: string,
    roomId: string,
    roomName: string,
    timestamp: number,
): BetrayalPendingEventChoiceState | null {
    const method = resolveEventSymbolSkipMethod(core, playerId);
    if (!method) {
        return null;
    }
    return {
        id: `${playerId}-${roomId}-event-symbol-skip-${timestamp}`,
        playerId,
        sourceTitle: `${roomName}：事件符号`,
        sourceKind: 'event-symbol-skip',
        eventSymbolSkip: {
            roomId,
            roomName,
            method,
        },
        acceptLabel: method === 'idol' ? '用雕像跳过事件' : '跳过事件',
        declineLabel: '抽取事件牌',
        effect: { mode: 'none' },
    };
}

export function validateBetrayalEventChoiceResolution(
    core: BetrayalCore,
    playerId: string,
    payload: ResolveEventChoicePayload,
): ValidationResult {
    const pending = core.pendingEventChoice;
    if (!pending || pending.playerId !== playerId) {
        return { valid: false, error: '当前没有待结算的事件选择。' };
    }
    if (pending.itemResolution === 'tooth-necklace-end-turn') {
        if (payload.accept === false) {
            return { valid: true };
        }
        if (!payload.trait || !pending.effect.allowedTraits.includes(payload.trait)) {
            return { valid: false, error: '牙齿项链必须选择一项当前濒死属性。' };
        }
        return { valid: true };
    }
    if (pending.effect.mode === 'optionalItemEffect') {
        const selectedEffect = payload.accept
            ? pending.effect.acceptEffect
            : pending.effect.declineEffect;
        if (
            payload.accept
            && !effectAllowsItemChoice(core, pending.effect, payload.cardId)
        ) {
            return { valid: false, error: '该事件必须选择一件有效持有物。' };
        }
        if (
            effectNeedsAdjacentRoomChoice(selectedEffect)
            && (!payload.targetRoomId || !effectAllowsAdjacentRoomChoice(core, payload.targetRoomId))
        ) {
            return { valid: false, error: '该事件必须选择一个已发现的相邻板块。' };
        }
        if (
            effectNeedsRoomTargetChoice(selectedEffect)
            && (!payload.targetRoomId || !effectAllowsRoomTargetChoice(core, selectedEffect, payload.targetRoomId))
        ) {
            return { valid: false, error: '该事件必须选择一个有效目标板块。' };
        }
        if (
            effectHasUnresolvedChosenTraitChoice(selectedEffect)
            && (!payload.trait || !effectAllowsChosenTrait(selectedEffect, payload.trait))
        ) {
            return { valid: false, error: '该事件必须选择一个有效属性。' };
        }
        if (
            effectHasUnresolvedGeneralDamageChoice(selectedEffect)
            && !effectAllowsGeneralDamageTraits(
                selectedEffect,
                payload.traits,
                core.currentExplorer,
                { allowSkull: core.phase === 'haunt' },
            )
        ) {
            return { valid: false, error: '该事件必须选择足够的受伤属性。' };
        }
        return { valid: true };
    }
    if (pending.effect.mode === 'traitRoll') {
        return { valid: true };
    }
    if (
        effectNeedsAdjacentRoomChoice(pending.effect)
        && (!payload.targetRoomId || !effectAllowsAdjacentRoomChoice(core, payload.targetRoomId))
    ) {
        return { valid: false, error: '该事件必须选择一个已发现的相邻板块。' };
    }
    if (
        effectNeedsRoomTargetChoice(pending.effect)
        && (!payload.targetRoomId || !effectAllowsRoomTargetChoice(core, pending.effect, payload.targetRoomId))
    ) {
        return { valid: false, error: '该事件必须选择一个有效目标板块。' };
    }
    if (
        effectHasUnresolvedChosenTraitChoice(pending.effect)
        && (!payload.trait || !effectAllowsChosenTrait(pending.effect, payload.trait))
    ) {
        return { valid: false, error: '该事件必须选择一个有效属性。' };
    }
    if (
        effectHasUnresolvedGeneralDamageChoice(pending.effect)
        && !effectAllowsGeneralDamageTraits(
            pending.effect,
            payload.traits,
            core.currentExplorer,
            { allowSkull: core.phase === 'haunt' },
        )
    ) {
        return { valid: false, error: '该事件必须选择足够的受伤属性。' };
    }
    if (pending.effect.mode === 'chooseTraitRoll') {
        if (!payload.trait || !pending.effect.allowedTraits.includes(payload.trait)) {
            return { valid: false, error: '该事件必须选择一个有效属性。' };
        }
        const previewEffect = resolveChooseTraitRollPreviewEffect(core, pending.effect, payload.trait);
        if (
            effectNeedsRoomTargetChoice(previewEffect)
            && (!payload.targetRoomId || !effectAllowsRoomTargetChoice(core, previewEffect, payload.targetRoomId))
        ) {
            return { valid: false, error: '该事件必须选择一个有效目标板块。' };
        }
        if (
            effectNeedsAdjacentRoomChoice(previewEffect)
            && (!payload.targetRoomId || !effectAllowsAdjacentRoomChoice(core, payload.targetRoomId))
        ) {
            return { valid: false, error: '该事件必须选择一个已发现的相邻板块。' };
        }
        if (
            effectHasUnresolvedGeneralDamageChoice(previewEffect)
            && !effectAllowsGeneralDamageTraits(
                previewEffect,
                payload.traits,
                core.currentExplorer,
                { allowSkull: core.phase === 'haunt' },
            )
        ) {
            return { valid: false, error: '该事件必须选择足够的受伤属性。' };
        }
        return { valid: true };
    }
    if (pending.effect.mode === 'allTraitChecks') {
        if (
            effectHasUnresolvedChosenTraitChoice(pending.effect.allPassEffect)
            && (!payload.trait || !effectAllowsChosenTrait(pending.effect.allPassEffect, payload.trait))
        ) {
            return { valid: false, error: '该事件必须选择一个有效属性。' };
        }
        if (
            effectHasUnresolvedGeneralDamageChoice(pending.effect.allPassEffect)
            && !effectAllowsGeneralDamageTraits(
                pending.effect.allPassEffect,
                payload.traits,
                core.currentExplorer,
                { allowSkull: core.phase === 'haunt' },
            )
        ) {
            return { valid: false, error: '该事件必须选择足够的受伤属性。' };
        }
        return { valid: true };
    }
    if (pending.effect.mode === 'optionalHauntRoll') {
        if (
            payload.accept
            && !isBetrayalOptionalHauntRollRuntimeSupported(pending.effect.successHauntId)
        ) {
            return { valid: false, error: `作祟剧本${pending.effect.successHauntId}尚未接入完整剧本链路。` };
        }
        if (
            !payload.accept
            && effectNeedsTraitChoice(pending.effect.skippedOrStartedEffect)
            && (
                (
                    effectHasUnresolvedChosenTraitChoice(pending.effect.skippedOrStartedEffect)
                    && (!payload.trait || !effectAllowsChosenTrait(pending.effect.skippedOrStartedEffect, payload.trait))
                )
                || (
                    effectHasUnresolvedGeneralDamageChoice(pending.effect.skippedOrStartedEffect)
                    && !effectAllowsGeneralDamageTraits(
                        pending.effect.skippedOrStartedEffect,
                        payload.traits,
                        core.currentExplorer,
                        { allowSkull: core.phase === 'haunt' },
                    )
                )
            )
        ) {
            return { valid: false, error: '该事件必须选择一个有效属性。' };
        }
        return { valid: true };
    }
    return { valid: true };
}

function resolveDrawnEventChoicePayload(
    core: BetrayalCore,
    pending: BetrayalPendingEventChoiceState,
    actorName: string,
    playerId: string,
    random: RandomFn,
    timestamp: number,
): BetrayalEventChoiceResolvedPayload {
    const eventCard = resolveEvent(core);
    const eventRollKind = eventCard.roll?.kind ?? 'trait';
    const eventRollResult = eventCard.roll
        ? eventRollKind === 'dice'
            ? rollEventFixedDice(random, eventCard.roll.dice)
            : rollEventTraitCheckWithDice(random, core.currentExplorer, eventCard.roll.trait, core)
        : null;
    const eventRollTotal = eventRollResult?.total ?? null;
    const eventBranch = eventCard.roll && eventRollTotal !== null
        ? resolveEventBranch(eventCard.roll.branches, eventRollTotal)
        : null;
    const eventEffect = eventBranch?.effect ?? eventCard.effect;
    if (!eventEffect) {
        throw new Error(`event ${eventCard.name} has no resolvable effect`);
    }
    const deferEventRollEffectRandomResults = Boolean(eventCard.roll && eventRollTotal !== null && eventBranch);
    const materializedEventEffect = materializeEventEffect(
        eventEffect,
        random,
        core.currentExplorer,
        core,
        { materializeRandomResults: !deferEventRollEffectRandomResults },
    );
    const needsFollowUpChoice = eventEffectNeedsPendingEventChoice(materializedEventEffect);
    const deathPrevention = needsFollowUpChoice || deferEventRollEffectRandomResults
        ? undefined
        : resolveEventDamageDeathPrevention(core, materializedEventEffect, random);
    const effectLabel = formatEffectLabel(materializedEventEffect);
    const eventRollLabel = eventCard.roll
        ? eventRollKind === 'dice'
            ? eventCard.roll.label
            : `${TRAIT_LABEL[eventCard.roll.trait]}检定`
        : undefined;
    const rollLabel = eventCard.roll && eventRollTotal !== null && eventBranch
        ? `${eventRollLabel} ${eventRollTotal}：${eventBranch.label}`
        : undefined;
    const eventEffectResolutionText = rollLabel ? `${rollLabel}；${effectLabel}` : effectLabel;
    const nextPendingEventChoice = needsFollowUpChoice
        ? createPendingChoiceForEventEffect(
            `${pending.id}-drawn-event-${timestamp}`,
            playerId,
            eventCard.name,
            eventCard.description,
            materializedEventEffect,
        )
        : undefined;
    const discoveryResolutionSteps: BetrayalDiscoveryResolutionStep[] = needsFollowUpChoice
        ? []
        : [{
            id: `event-effect-${eventCard.name}`,
            kind: 'event-effect',
            text: `事件效果：${eventEffectResolutionText}`,
            deckKind: 'event',
        }];
    return {
        playerId,
        sourceTitle: eventCard.name,
        eventDescription: eventCard.description,
        accepted: false,
        nextPendingEventChoice,
        eventEffect: nextPendingEventChoice ? undefined : materializedEventEffect,
        deathPrevention,
        eventRoll: eventCard.roll && eventRollTotal !== null && eventBranch && eventRollResult
            ? {
                kind: eventRollKind,
                trait: eventRollKind === 'dice' ? undefined : eventCard.roll.trait,
                total: eventRollTotal,
                label: eventBranch.label,
                eventDescription: eventCard.description,
                rollLabel: eventRollLabel!,
                dice: eventRollResult.dice,
                passiveBonus: eventRollResult.passiveBonus,
                branchThresholds: eventCard.roll.branches.map((branch) => ({
                    min: branch.min,
                    label: branch.label,
                    effect: cloneUseEffect(branch.effect),
                })),
            }
            : undefined,
        drawnEventCardNameToBury: eventCard.name,
        discovery: {
            kind: 'event',
            title: eventCard.name,
            summary: '抽取事件牌',
            detail: nextPendingEventChoice
                ? `${eventEffectResolutionText}；等待选择事件效果`
                : eventEffectResolutionText,
            tone: isWarningEventEffect(materializedEventEffect) ? 'warning' : 'accent',
            resolutionSteps: discoveryResolutionSteps,
        },
        logText: `${actorName}选择抽取事件牌：${eventCard.name}（${eventEffectResolutionText}${nextPendingEventChoice ? '，等待选择事件效果' : ''}）`,
    };
}

function resolveTraitRollEventChoicePayload(
    core: BetrayalCore,
    pending: BetrayalPendingEventChoiceState,
    payload: ResolveEventChoicePayload,
    playerId: string,
    actorName: string,
    random: RandomFn,
    timestamp: number,
    traitRollEffect: Extract<UseEffectProfile, { mode: 'traitRoll' }>,
    summary: string,
    logVerb: string,
): BetrayalEventChoiceResolvedPayload {
    const rollResult = rollEventTraitCheckWithDice(random, core.currentExplorer, traitRollEffect.trait, core);
    const rollTotal = rollResult.total;
    const eventBranch = resolveEventBranch(traitRollEffect.branches, rollTotal);
    const branchEffect = cloneUseEffect(eventBranch.effect);
    const selectedEffect = applyEventChoiceSelections(core, branchEffect, payload);
    const unresolvedSelectedEffect = eventEffectNeedsFollowUpChoice(selectedEffect);
    const rollLabel = `${TRAIT_LABEL[traitRollEffect.trait]}检定`;
    const eventRoll: BetrayalEventRollPayload = {
        kind: 'trait',
        trait: traitRollEffect.trait,
        total: rollTotal,
        label: eventBranch.label,
        eventDescription: pending.eventDescription,
        rollLabel,
        dice: rollResult.dice,
        passiveBonus: rollResult.passiveBonus,
        branchThresholds: traitRollEffect.branches.map((branch) => ({
            ...branch,
            effect: cloneUseEffect(branch.label === eventBranch.label ? selectedEffect : branch.effect),
        })),
    };
    if (unresolvedSelectedEffect) {
        return {
            playerId,
            sourceTitle: pending.sourceTitle,
            accepted: payload.accept ?? true,
            nextPendingEventChoice: {
                id: `${pending.id}-trait-roll-${timestamp}`,
                playerId,
                sourceTitle: pending.sourceTitle,
                eventDescription: pending.eventDescription,
                effect: cloneUseEffect(selectedEffect),
            },
            eventRoll,
            discovery: {
                kind: 'event',
                title: pending.sourceTitle,
                summary,
                detail: `${rollLabel} ${rollTotal}：${eventBranch.label}`,
                tone: 'accent',
            },
            logText: `${actorName}${logVerb}：${pending.sourceTitle}（${rollLabel} ${rollTotal}，等待选择事件效果）`,
        };
    }
    const eventEffect = materializeEventEffect(
        selectedEffect,
        random,
        core.currentExplorer,
        core,
        { materializeRandomResults: false },
    );
    const effectLabel = formatEffectLabel(eventEffect);
    return {
        playerId,
        sourceTitle: pending.sourceTitle,
        accepted: payload.accept ?? true,
        eventEffect,
        deathPrevention: undefined,
        eventRoll,
        discovery: {
            kind: 'event',
            title: pending.sourceTitle,
            summary,
            detail: `${rollLabel} ${rollTotal}：${eventBranch.label}；${effectLabel}`,
            tone: isWarningEventEffect(eventEffect) ? 'warning' : 'accent',
        },
        logText: `${actorName}${logVerb}：${pending.sourceTitle}（${rollLabel} ${rollTotal}，${effectLabel}）`,
    };
}

function resolveMaterializedChoicePayload(
    core: BetrayalCore,
    pending: BetrayalPendingEventChoiceState,
    payload: ResolveEventChoicePayload,
    playerId: string,
    actorName: string,
    random: RandomFn,
    summary: string,
    logVerb: string,
    effect: UseEffectProfile,
    accepted: boolean,
    toneOverride?: BetrayalDiscoverySummary['tone'],
): BetrayalEventChoiceResolvedPayload {
    const selectedEffect = applyEventChoiceSelections(core, effect, payload);
    const eventEffect = materializeEventEffect(selectedEffect, random, core.currentExplorer, core);
    const effectLabel = formatEffectLabel(eventEffect);
    const deathPrevention = resolveEventDamageDeathPrevention(core, eventEffect, random);
    return {
        playerId,
        sourceTitle: pending.sourceTitle,
        accepted,
        eventEffect,
        deathPrevention,
        discovery: {
            kind: 'event',
            title: pending.sourceTitle,
            summary,
            detail: effectLabel,
            tone: toneOverride ?? (isWarningEventEffect(eventEffect) ? 'warning' : 'accent'),
        },
        logText: `${actorName}${logVerb}：${pending.sourceTitle}（${effectLabel}）`,
    };
}

export function resolveBetrayalEventChoiceResolvedPayload(
    core: BetrayalCore,
    playerId: string,
    payload: ResolveEventChoicePayload,
    random: RandomFn,
    timestamp: number,
): BetrayalEventChoiceResolvedPayload | null {
    const pending = core.pendingEventChoice;
    if (!pending || pending.itemResolution) {
        return null;
    }
    const actor = findExplorerByPlayerId(core, playerId) ?? core.currentExplorer;
    if (pending.sourceKind === 'event-symbol-skip' && pending.eventSymbolSkip) {
        const accepted = payload.accept !== false;
        const sourceMethod = pending.eventSymbolSkip.method;
        if (accepted) {
            const summary = sourceMethod === 'idol'
                ? '已用雕像跳过'
                : '跳过事件';
            const logText = sourceMethod === 'idol'
                ? `${actor.displayName}使用雕像跳过了事件`
                : `${actor.displayName}跳过了事件`;
            return {
                playerId,
                sourceTitle: pending.sourceTitle,
                accepted: true,
                eventEffect: { mode: 'none' },
                discovery: {
                    kind: 'event',
                    title: summary,
                    summary,
                    detail: '没有抽取或结算事件卡',
                    tone: 'accent',
                },
                logText,
            };
        }
        return resolveDrawnEventChoicePayload(core, pending, actor.displayName, playerId, random, timestamp);
    }
    if (pending.effect.mode === 'optionalHauntRoll') {
        if (
            payload.accept
            && !isBetrayalOptionalHauntRollRuntimeSupported(pending.effect.successHauntId)
        ) {
            return null;
        }
        if (!payload.accept || core.phase !== 'preHaunt' || core.scenarioRuntime.hauntTriggered) {
            return resolveMaterializedChoicePayload(
                core,
                pending,
                payload,
                playerId,
                actor.displayName,
                random,
                pending.declineLabel ?? '跳过作祟检定',
                `选择${pending.declineLabel ?? '跳过作祟检定'}`,
                pending.effect.skippedOrStartedEffect,
                false,
                'warning',
            );
        }
        const hauntRisk = resolveBetrayalHauntRisk(core);
        const dice = rollBetrayalDicePips(random, hauntRisk.omenCount);
        const rollTotal = dice.reduce((sum, pip) => sum + pip, 0);
        const hauntTriggered = rollTotal >= hauntRisk.threshold;
        const dustSetup = hauntTriggered && pending.effect.successHauntId === 3
            ? createDustRuntimeState(core, random)
            : undefined;
        const uponReflectionSetup = hauntTriggered && pending.effect.successHauntId === 7
            ? createUponReflectionRuntimeState(core, playerId, random)
            : undefined;
        const eventEffect = hauntTriggered
            ? { mode: 'none' as const, recommendedAction: 'endTurn' as const }
            : materializeEventEffect(
                pending.effect.failureEffect,
                random,
                core.currentExplorer,
                core,
                { materializeRandomResults: false },
            );
        const effectLabel = hauntTriggered ? pending.effect.successLabel : formatEffectLabel(eventEffect);
        const hauntRevealResolution = hauntTriggered
            ? resolveHauntRevealResolutionForTrigger(
                core,
                { id: null, name: pending.effect.successHauntTriggerLabel ?? pending.sourceTitle },
                pending.effect.successHauntId,
            )
            : undefined;
        const hauntTraitorResolution = hauntTriggered && hauntRevealResolution
            ? resolveHauntTraitorResolutionForTrigger(core, hauntRevealResolution.hauntCardNumber, playerId, {
                eventSelection: pending.effect.successTraitorSelection,
                revealRepresentativeOnly: hauntRevealResolution.representativeOnly,
            })
            : undefined;
        return {
            playerId,
            sourceTitle: pending.sourceTitle,
            accepted: true,
            hauntTriggered,
            hauntTraitorPlayerId: hauntTraitorResolution?.traitorPlayerId,
            hauntCardNumber: hauntTriggered ? pending.effect.successHauntId : undefined,
            hauntTriggerLabel: hauntTriggered
                ? pending.effect.successHauntTriggerLabel ?? pending.sourceTitle
                : undefined,
            hauntRevealResolution,
            hauntTraitorResolution,
            dustSetup,
            uponReflectionSetup,
            hauntRoll: {
                threshold: hauntRisk.threshold,
                successHauntId: pending.effect.successHauntId,
                successHauntTriggerLabel: pending.effect.successHauntTriggerLabel,
                successTraitorSelection: pending.effect.successTraitorSelection,
            },
            eventEffect,
            deathPrevention: undefined,
            eventRoll: {
                kind: 'dice',
                total: rollTotal,
                label: hauntTriggered ? pending.effect.successLabel : formatEffectLabel(pending.effect.failureEffect),
                rollLabel: '作祟检定',
                dice,
                passiveBonus: 0,
                branchThresholds: [
                    {
                        min: hauntRisk.threshold,
                        label: pending.effect.successLabel,
                        effect: { mode: 'none', recommendedAction: 'endTurn' },
                    },
                    {
                        min: 0,
                        label: formatEffectLabel(pending.effect.failureEffect),
                        effect: cloneUseEffect(pending.effect.failureEffect),
                    },
                ],
            },
            discovery: {
                kind: 'event',
                title: pending.sourceTitle,
                summary: pending.effect.acceptLabel,
                detail: `选择进行作祟检定：总点数 ${rollTotal}（${dice.length} 颗骰子，${effectLabel}）`,
                tone: hauntTriggered ? 'warning' : 'accent',
            },
            logText: `${actor.displayName}进行作祟检定：${pending.sourceTitle}（总点数 ${rollTotal}，${effectLabel}）`,
        };
    }
    if (pending.effect.mode === 'chooseTraitRoll') {
        const selectedTrait = payload.trait!;
        const rollResult = rollEventTraitCheckWithDice(random, core.currentExplorer, selectedTrait, core);
        const rollTotal = rollResult.total;
        const eventBranch = resolveEventBranch(pending.effect.branches, rollTotal);
        const selectedEffect = applyEventChoiceSelections(core, cloneUseEffect(eventBranch.effect), {
            ...payload,
            trait: selectedTrait,
        });
        const eventEffect = materializeEventEffect(
            selectedEffect,
            random,
            core.currentExplorer,
            core,
            { materializeRandomResults: false },
        );
        const effectLabel = formatEffectLabel(eventEffect);
        const rollLabel = `${TRAIT_LABEL[selectedTrait]}检定`;
        return {
            playerId,
            sourceTitle: pending.sourceTitle,
            accepted: true,
            eventEffect,
            deathPrevention: undefined,
            eventRoll: {
                kind: 'trait',
                trait: selectedTrait,
                total: rollTotal,
                label: eventBranch.label,
                eventDescription: pending.eventDescription,
                rollLabel,
                dice: rollResult.dice,
                passiveBonus: rollResult.passiveBonus,
                branchThresholds: pending.effect.branches.map((branch) => {
                    const branchSnapshotEffect = branch.label === eventBranch.label
                        ? selectedEffect
                        : branch.effect;
                    return {
                        ...branch,
                        effect: cloneUseEffect(branchSnapshotEffect),
                    };
                }),
            },
            discovery: {
                kind: 'event',
                title: pending.sourceTitle,
                summary: pending.effect.prompt,
                detail: `${rollLabel} ${rollTotal}：${eventBranch.label}；${effectLabel}`,
                tone: isWarningEventEffect(eventEffect) ? 'warning' : 'accent',
            },
            logText: `${actor.displayName}选择${TRAIT_LABEL[selectedTrait]}：${pending.sourceTitle}（${rollLabel} ${rollTotal}，${effectLabel}）`,
        };
    }
    if (pending.effect.mode === 'allTraitChecks') {
        return resolveMaterializedChoicePayload(
            core,
            pending,
            payload,
            playerId,
            actor.displayName,
            random,
            '每项属性均通过',
            `选择${payload.trait ? TRAIT_LABEL[payload.trait] : '任意属性'}`,
            pending.effect.allPassEffect,
            true,
        );
    }
    if (pending.effect.mode === 'traitRoll') {
        return resolveTraitRollEventChoicePayload(
            core,
            pending,
            payload,
            playerId,
            actor.displayName,
            random,
            timestamp,
            pending.effect,
            `${TRAIT_LABEL[pending.effect.trait]}检定`,
            `进行${TRAIT_LABEL[pending.effect.trait]}检定`,
        );
    }
    if (pending.effect.mode === 'optionalItemEffect') {
        if (payload.accept) {
            const itemSelectedEffect = applyItemChoiceToEffect(core, pending.effect, payload.cardId);
            if (itemSelectedEffect.mode !== 'optionalItemEffect') {
                return null;
            }
            return resolveMaterializedChoicePayload(
                core,
                pending,
                payload,
                playerId,
                actor.displayName,
                random,
                pending.effect.acceptLabel,
                `选择${pending.effect.acceptLabel}`,
                { ...itemSelectedEffect, acceptEffect: applyEventChoiceSelections(core, itemSelectedEffect.acceptEffect, payload) },
                true,
            );
        }
        if (pending.effect.declineEffect.mode === 'traitRoll') {
            return resolveTraitRollEventChoicePayload(
                core,
                pending,
                payload,
                playerId,
                actor.displayName,
                random,
                timestamp,
                pending.effect.declineEffect,
                pending.effect.declineLabel,
                `选择${pending.effect.declineLabel}`,
            );
        }
        return resolveMaterializedChoicePayload(
            core,
            pending,
            payload,
            playerId,
            actor.displayName,
            random,
            pending.effect.declineLabel,
            `选择${pending.effect.declineLabel}`,
            pending.effect.declineEffect,
            false,
        );
    }
    if (
        effectHasUnresolvedTraitChoice(pending.effect)
        || effectNeedsAdjacentRoomChoice(pending.effect)
        || effectNeedsRoomTargetChoice(pending.effect)
    ) {
        return resolveMaterializedChoicePayload(
            core,
            pending,
            payload,
            playerId,
            actor.displayName,
            random,
            '选择事件效果',
            '选择事件效果',
            pending.effect,
            true,
        );
    }
    if (pending.effect.mode === 'optionalEffect') {
        if (!payload.accept) {
            return {
                playerId,
                sourceTitle: pending.sourceTitle,
                accepted: false,
                discovery: {
                    kind: 'event',
                    title: pending.sourceTitle,
                    summary: pending.effect.declineLabel,
                    detail: '无事发生',
                    tone: 'accent',
                },
                logText: `${actor.displayName}选择${pending.effect.declineLabel}：${pending.sourceTitle}`,
            };
        }
        return resolveMaterializedChoicePayload(
            core,
            pending,
            payload,
            playerId,
            actor.displayName,
            random,
            pending.effect.acceptLabel,
            `选择${pending.effect.acceptLabel}`,
            pending.effect.acceptEffect,
            true,
        );
    }
    if (!payload.accept || pending.effect.mode !== 'optionalEventRoll') {
        return {
            playerId,
            sourceTitle: pending.sourceTitle,
            accepted: false,
            discovery: {
                kind: 'event',
                title: pending.sourceTitle,
                summary: pending.declineLabel ?? '不执行',
                detail: '无事发生',
                tone: 'accent',
            },
            logText: `${actor.displayName}选择${pending.declineLabel ?? '不执行'}：${pending.sourceTitle}`,
        };
    }

    const rollResult = rollEventFixedDice(random, pending.effect.roll.dice);
    const rollTotal = rollResult.total;
    const eventBranch = resolveEventBranch(pending.effect.roll.branches, rollTotal);
    const selectedEffect = applyEventChoiceSelections(core, cloneUseEffect(eventBranch.effect), payload);
    const unresolvedSelectedEffect = effectHasUnresolvedTraitChoice(selectedEffect)
        || effectNeedsAdjacentRoomChoice(selectedEffect)
        || effectNeedsRoomTargetChoice(selectedEffect);
    const eventRoll: BetrayalEventRollPayload = {
        kind: 'dice',
        total: rollTotal,
        label: eventBranch.label,
        eventDescription: pending.eventDescription,
        rollLabel: pending.effect.roll.label,
        dice: rollResult.dice,
        passiveBonus: rollResult.passiveBonus,
        branchThresholds: pending.effect.roll.branches.map((branch) => ({
            ...branch,
            effect: cloneUseEffect(branch.label === eventBranch.label ? selectedEffect : branch.effect),
        })),
    };
    if (unresolvedSelectedEffect) {
        return {
            playerId,
            sourceTitle: pending.sourceTitle,
            accepted: true,
            nextPendingEventChoice: {
                id: `${pending.id}-rolled-${timestamp}`,
                playerId,
                sourceTitle: pending.sourceTitle,
                eventDescription: pending.eventDescription,
                effect: cloneUseEffect(selectedEffect),
            },
            eventRoll,
            discovery: {
                kind: 'event',
                title: pending.sourceTitle,
                summary: pending.acceptLabel!,
                detail: `${pending.effect.roll.label} ${rollTotal}：${eventBranch.label}`,
                tone: 'accent',
            },
            logText: `${actor.displayName}选择${pending.acceptLabel}：${pending.sourceTitle}（${pending.effect.roll.label} ${rollTotal}，等待选择事件效果）`,
        };
    }
    const eventEffect = materializeEventEffect(
        selectedEffect,
        random,
        core.currentExplorer,
        core,
        { materializeRandomResults: false },
    );
    const effectLabel = formatEffectLabel(eventEffect);
    return {
        playerId,
        sourceTitle: pending.sourceTitle,
        accepted: true,
        eventEffect,
        deathPrevention: undefined,
        eventRoll,
        discovery: {
            kind: 'event',
            title: pending.sourceTitle,
            summary: pending.acceptLabel!,
            detail: `${pending.effect.roll.label} ${rollTotal}：${eventBranch.label}；${effectLabel}`,
            tone: isWarningEventEffect(eventEffect) ? 'warning' : 'accent',
        },
        logText: `${actor.displayName}选择${pending.acceptLabel}：${pending.sourceTitle}（${pending.effect.roll.label} ${rollTotal}，${effectLabel}）`,
    };
}
