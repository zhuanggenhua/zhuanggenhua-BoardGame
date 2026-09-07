import type { RandomFn } from '../../engine/types';
import { BETRAYAL_COMMANDS } from './commands';
import { rollBetrayalPip } from './diceRules';
import { resolveEventDamageDeathPrevention } from './eventEffectResolutionModel';
import {
    materializeEventEffect,
    resolveEventBranch,
} from './eventRollModel';
import { findExplorerByPlayerId } from './explorerReadModel';
import {
    createDustRuntimeState,
    createUponReflectionRuntimeState,
} from './hauntRuntimeSetupModel';
import { resolveHauntRevealResolutionForTrigger } from './hauntSetupModel';
import { resolveHauntTraitorResolutionForTrigger } from './hauntTraitorResolutionModel';
import { eventEffectNeedsPendingEventChoice } from './possessionEffects';
import {
    resolveRabbitFootCard,
    resolveRecentRollRerollCommandDieIndices,
    resolveRecentRollRerollItemCard,
    resolveRecentRollRerollItemRule,
} from './possessionActionReadModel';
import type { BetrayalCore } from './game';
import type { BetrayalCommand } from './commandTypes';
import type { BetrayalEvent } from './events';

type RecentRollRerollCommand = Extract<
    BetrayalCommand,
    { type: typeof BETRAYAL_COMMANDS.USE_RABBIT_FOOT | typeof BETRAYAL_COMMANDS.USE_ROLL_REROLL_ITEM }
>;
type RabbitFootUsedPayload = Extract<BetrayalEvent, { type: 'RABBIT_FOOT_USED' }>['payload'];

export function resolveBetrayalRecentRollRerollPayload(
    core: BetrayalCore,
    command: RecentRollRerollCommand,
    random: RandomFn,
): RabbitFootUsedPayload | null {
    const card = command.type === BETRAYAL_COMMANDS.USE_RABBIT_FOOT
        ? resolveRabbitFootCard(core, command.payload.cardId, command.playerId)
        : resolveRecentRollRerollItemCard(core, command.payload.cardId, command.playerId);
    if (!card) {
        return null;
    }
    const rule = resolveRecentRollRerollItemRule(card.id);
    if (!rule) {
        return null;
    }
    const actor = findExplorerByPlayerId(core, command.playerId) ?? core.currentExplorer;
    const dieIndex = command.payload.dieIndex ?? 0;
    const dieIndices = core.recentRoll
        ? resolveRecentRollRerollCommandDieIndices(core.recentRoll, card.id, dieIndex)
        : [];
    const previousPips = dieIndices.map((index) => core.recentRoll?.dice[index] ?? 0);
    const newPips = dieIndices.map(() => rollBetrayalPip(random));
    const nextDice = core.recentRoll ? [...core.recentRoll.dice] : [];
    dieIndices.forEach((index, valueIndex) => {
        nextDice[index] = newPips[valueIndex] ?? nextDice[index] ?? 0;
    });
    const nextEventBranch = core.recentRoll
        && (core.recentRoll.kind === 'eventTraitCheck' || core.recentRoll.kind === 'eventDiceRoll')
        && core.recentRoll.branchThresholds
        ? resolveEventBranch(core.recentRoll.branchThresholds, nextDice.reduce((sum, pip) => sum + pip, 0) + core.recentRoll.passiveBonus)
        : null;
    const rerollTargetsPendingEventRoll = core.pendingEventRollResolution?.rollId === core.recentRoll?.id;
    const pendingHauntRoll = rerollTargetsPendingEventRoll
        ? core.pendingEventRollResolution.hauntRoll
        : undefined;
    const rerolledEventTotal = nextDice.reduce((sum, pip) => sum + pip, 0)
        + (core.recentRoll?.passiveBonus ?? 0);
    const rerollHauntTriggered = pendingHauntRoll
        ? rerolledEventTotal >= pendingHauntRoll.threshold
        : false;
    const rerollHauntRevealResolution = rerollHauntTriggered
        ? resolveHauntRevealResolutionForTrigger(
            core,
            { id: null, name: pendingHauntRoll?.successHauntTriggerLabel ?? core.recentRoll?.sourceTitle },
            pendingHauntRoll?.successHauntId,
        )
        : undefined;
    const rerollHauntTraitorResolution = rerollHauntTriggered && rerollHauntRevealResolution
        ? resolveHauntTraitorResolutionForTrigger(
            core,
            rerollHauntRevealResolution.hauntCardNumber,
            command.playerId,
            {
                eventSelection: pendingHauntRoll?.successTraitorSelection,
                revealRepresentativeOnly: rerollHauntRevealResolution.representativeOnly,
            },
        )
        : undefined;
    const eventRerollHaunt = pendingHauntRoll
        ? {
            hauntTriggered: rerollHauntTriggered,
            hauntCardNumber: rerollHauntTriggered ? pendingHauntRoll.successHauntId : undefined,
            hauntTriggerLabel: rerollHauntTriggered
                ? pendingHauntRoll.successHauntTriggerLabel ?? core.recentRoll?.sourceTitle
                : undefined,
            hauntTraitorPlayerId: rerollHauntTraitorResolution?.traitorPlayerId,
            hauntRevealResolution: rerollHauntRevealResolution,
            hauntTraitorResolution: rerollHauntTraitorResolution,
            dustSetup: rerollHauntTriggered && pendingHauntRoll.successHauntId === 3
                ? createDustRuntimeState(core, random)
                : undefined,
            uponReflectionSetup: rerollHauntTriggered && pendingHauntRoll.successHauntId === 7
                ? createUponReflectionRuntimeState(core, command.playerId, random)
                : undefined,
        }
        : undefined;
    const eventRerollMustStayPending = Boolean(
        rerollTargetsPendingEventRoll
        && (
            rerollHauntTriggered
            || (nextEventBranch && eventEffectNeedsPendingEventChoice(nextEventBranch.effect))
        ),
    );
    const eventRerollEffect = nextEventBranch
        ? materializeEventEffect(
            nextEventBranch.effect,
            random,
            core.currentExplorer,
            core,
            { materializeRandomResults: !eventRerollMustStayPending },
        )
        : undefined;
    const rerollSummary = rule.mode === 'single-die'
        ? `第 ${dieIndex + 1} 颗骰子：${previousPips[0] ?? 0} → ${newPips[0] ?? 0}`
        : `${dieIndices.length} 颗骰子：${previousPips.join('/')} → ${newPips.join('/')}`;
    const mentalDamageAfterReroll = rule.mode === 'blank-trait-check-dice'
        ? newPips.filter((pip) => pip === 0).length
        : 0;
    const mentalDamageSummary = mentalDamageAfterReroll > 0
        ? `；重投后仍有 ${mentalDamageAfterReroll} 个空白，承受 ${mentalDamageAfterReroll} 点精神伤害`
        : '';
    return {
        playerId: command.playerId,
        cardId: card.id,
        cardName: rule.label,
        dieIndex: dieIndices[0] ?? dieIndex,
        newPip: newPips[0] ?? 0,
        dieIndices,
        newPips,
        mentalDamageAfterReroll: mentalDamageAfterReroll || undefined,
        eventRerollEffect,
        eventRerollDeathPrevention: eventRerollEffect && !eventRerollMustStayPending
            ? resolveEventDamageDeathPrevention(core, eventRerollEffect, random)
            : undefined,
        eventRerollHaunt,
        logText: `${actor.displayName}使用${rule.label}重掷${rerollSummary}${mentalDamageSummary}`,
    };
}
