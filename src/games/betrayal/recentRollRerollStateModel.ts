import {
    eventRollResolutionNeedsAcknowledgement,
    resolvePendingEventRollResolutionRequiredPlayerIds,
} from './acknowledgementReadModel';
import {
    canDeferOrdinaryAttackDamageToDefender,
    isPendingDamageAllocationForAttackRoll,
    resolveAttackRerollOutcome,
} from './attackRules';
import {
    appendActivity,
    cloneMonster,
    cloneScenarioRuntimeStatus,
    syncCurrentExplorerProjection,
} from './coreStateModel';
import {
    applyAttackDamage,
    createPendingDamageAllocation,
    createRecentRollRerollMentalDamageAllocation,
    setExplorerTraitsToDeathsDoor,
} from './damageResolutionModel';
import {
    addFeverishMonsterForPlayer,
    buryDustDeadTraitorPossessions,
    releaseJackSpiritForDeadTraitor,
} from './deathStateReadModel';
import {
    applyEventEffect,
    revertEventEffect,
} from './eventEffectResolutionModel';
import { resolveEventBranch } from './eventRollModel';
import { findExplorerByPlayerId } from './explorerReadModel';
import {
    cloneDustRuntimeState,
    cloneHelpingHandsRuntimeState,
    cloneMagicCameraRuntimeState,
    cloneUponReflectionRuntimeState,
} from './hauntRuntimeSetupModel';
import { isDustHaunt } from './hauntScenarioReadModel';
import { cloneHauntTraitorResolution } from './hauntTraitorResolutionModel';
import { resolveDustTraitorVictoryResult } from './hauntVictoryModel';
import {
    BETRAYAL_TRAIT_LABEL as TRAIT_LABEL,
    cloneUseEffect,
    eventEffectNeedsPendingEventChoice,
    formatEffectLabel,
    isWarningEventEffect,
} from './possessionEffects';
import { resolveRecommendedAction } from './recommendedActionReadModel';
import { resolveRecentRollTotal } from './recentRollPresentation';
import { applyBetrayalMysticElevatorRecentRollRerollState } from './roomEnterEffectModel';
import {
    applyGeneralDamage,
    setExplorerTraitsFromValues,
} from './traitTrackModel';
import type {
    BetrayalCore,
    BetrayalDiscoverySummary,
    BetrayalEndgameResult,
    BetrayalExplorerSummary,
    BetrayalPendingDamageAllocationState,
    BetrayalRecentRollState,
} from './game';
import type { BetrayalEvent } from './events';

type RabbitFootUsedEvent = Extract<BetrayalEvent, { type: 'RABBIT_FOOT_USED' }>;

export interface BetrayalRecentRollRerollStateResolution {
    core: BetrayalCore;
    scenarioCompletedResult?: BetrayalEndgameResult;
}

function resetExplorerTraits(explorer: BetrayalExplorerSummary, traits: BetrayalExplorerSummary['traits']): void {
    setExplorerTraitsFromValues(explorer, traits);
}

function applyDeathPreventionRerollOutcome(
    core: BetrayalCore,
    explorer: BetrayalExplorerSummary,
    recentRoll: BetrayalRecentRollState,
    nextRoll: BetrayalRecentRollState,
    nextTotal: number,
): void {
    const deathPrevention = recentRoll.deathPrevention;
    if (!deathPrevention) {
        return;
    }
    core.scenarioRuntime = cloneScenarioRuntimeStatus(deathPrevention.scenarioRuntimeBeforeDefeat);
    core.monsters = deathPrevention.monstersBeforeDefeat.map(cloneMonster);
    resetExplorerTraits(explorer, deathPrevention.traitsBeforeDamage);
    if (deathPrevention.damageTraits?.length) {
        applyGeneralDamage(explorer, deathPrevention.damageAmount, deathPrevention.damageTraits, { allowSkull: true });
    } else {
        applyAttackDamage(explorer, deathPrevention.damageAmount, deathPrevention.damageKind);
    }
    if (nextTotal >= deathPrevention.minTotal) {
        core.scenarioRuntime.deadExplorerPlayerIds = core.scenarioRuntime.deadExplorerPlayerIds.filter((playerId) => playerId !== explorer.playerId);
        setExplorerTraitsToDeathsDoor(explorer);
        nextRoll.latestLabel = '阻止死亡';
    } else {
        core.scenarioRuntime.deadExplorerPlayerIds = Array.from(new Set([
            ...core.scenarioRuntime.deadExplorerPlayerIds,
            explorer.playerId,
        ]));
        if (isDustHaunt(core) && core.scenarioRuntime.dust?.permanentTraitorPlayerIds.includes(explorer.playerId)) {
            addFeverishMonsterForPlayer(core, explorer.playerId);
            buryDustDeadTraitorPossessions(core, explorer.playerId, { deferForRabbitFoot: false });
        } else if (core.scenarioRuntime.traitorPlayerId === explorer.playerId) {
            releaseJackSpiritForDeadTraitor(
                core,
                explorer.playerId,
                explorer.roomId,
                deathPrevention.releasedJackSpiritRoomId,
            );
        }
        nextRoll.latestLabel = '正常死亡';
    }
    nextRoll.deathPrevention = {
        ...deathPrevention,
        damageTraits: deathPrevention.damageTraits ? [...deathPrevention.damageTraits] : undefined,
        traitsBeforeDamage: { ...deathPrevention.traitsBeforeDamage },
        scenarioRuntimeBeforeDefeat: cloneScenarioRuntimeStatus(deathPrevention.scenarioRuntimeBeforeDefeat),
        monstersBeforeDefeat: deathPrevention.monstersBeforeDefeat.map(cloneMonster),
    };
}

function createNextRecentRollAfterReroll(core: BetrayalCore, event: RabbitFootUsedEvent): {
    recentRoll: BetrayalRecentRollState;
    nextRoll: BetrayalRecentRollState;
    nextTotal: number;
} | null {
    const recentRoll = core.recentRoll;
    if (!recentRoll) {
        return null;
    }
    const dice = [...recentRoll.dice];
    const dieIndices = event.payload.dieIndices ?? [event.payload.dieIndex];
    const newPips = event.payload.newPips ?? [event.payload.newPip];
    dieIndices.forEach((dieIndex, valueIndex) => {
        if (dieIndex >= 0 && dieIndex < dice.length) {
            dice[dieIndex] = newPips[valueIndex] ?? dice[dieIndex] ?? 0;
        }
    });
    const nextRoll: BetrayalRecentRollState = {
        ...recentRoll,
        dice,
        consumedRabbitFootCardIds: [...recentRoll.consumedRabbitFootCardIds, event.payload.cardId],
        lastRabbitFootRerollDieIndex: dieIndices.length === 1 ? dieIndices[0] : undefined,
        lastRabbitFootRerollPreviousDice: [...recentRoll.dice],
    };
    return {
        recentRoll,
        nextRoll,
        nextTotal: resolveRecentRollTotal(nextRoll),
    };
}

function createFinalizeRecentRollRerollCore(
    core: BetrayalCore,
    event: RabbitFootUsedEvent,
    tone: BetrayalDiscoverySummary['tone'] = 'accent',
    options: { appendLog?: boolean } = {},
): BetrayalCore {
    const appendLog = options.appendLog ?? true;
    const rerollDamageAllocation = core.pendingDamageAllocation
        ?? createRecentRollRerollMentalDamageAllocation(
            core,
            event.payload.playerId,
            event.payload.cardId,
            event.payload.mentalDamageAfterReroll,
            event.timestamp,
        );
    if (rerollDamageAllocation) {
        core.pendingDamageAllocation = rerollDamageAllocation;
        core.activePlayerId = rerollDamageAllocation.playerId;
    }
    const synced = syncCurrentExplorerProjection(core);
    if (rerollDamageAllocation) {
        return {
            ...synced,
            pendingDamageAllocation: rerollDamageAllocation,
            activePlayerId: rerollDamageAllocation.playerId,
            recommendedAction: 'endTurn',
            activityLog: appendLog
                ? appendActivity(synced, event.payload.logText, 'warning')
                : synced.activityLog,
        };
    }
    return {
        ...synced,
        recommendedAction: resolveRecommendedAction(synced),
        activityLog: appendLog
            ? appendActivity(synced, event.payload.logText, tone)
            : synced.activityLog,
    };
}

function refreshLatestEventDiscoveryAfterReroll(
    core: BetrayalCore,
    recentRoll: BetrayalRecentRollState,
    nextRoll: BetrayalRecentRollState,
    nextTotal: number,
    nextLabel: string,
    effect: BetrayalRecentRollState['branchThresholds'][number]['effect'],
): void {
    if (!core.latestDiscovery || core.latestDiscovery.title !== nextRoll.sourceTitle) {
        return;
    }
    const effectLabel = formatEffectLabel(effect);
    const rerollLabel = recentRoll.rollLabel
        ?? (recentRoll.kind === 'eventTraitCheck' && recentRoll.trait
            ? `${TRAIT_LABEL[recentRoll.trait]}检定`
            : '投骰');
    core.latestDiscovery = {
        ...core.latestDiscovery,
        detail: `${rerollLabel} ${nextTotal}：${nextLabel}；${effectLabel}`,
        tone: isWarningEventEffect(effect) ? 'warning' : 'accent',
    };
}

function applyEventRecentRollRerollState(
    core: BetrayalCore,
    event: RabbitFootUsedEvent,
    recentRoll: BetrayalRecentRollState,
    nextRoll: BetrayalRecentRollState,
    nextTotal: number,
): BetrayalCore {
    if (recentRoll.kind === 'eventTraitCheck' && !recentRoll.trait) {
        return core;
    }
    if (!recentRoll.branchThresholds) {
        core.recentRoll = nextRoll;
        if (core.pendingEventRollResolution?.rollId === recentRoll.id) {
            core.pendingEventRollResolution = null;
        }
        core.usedCardIdsThisTurn = [...core.usedCardIdsThisTurn, event.payload.cardId];
        return createFinalizeRecentRollRerollCore(core, event);
    }
    const nextBranch = resolveEventBranch(recentRoll.branchThresholds, nextTotal);
    const nextEffect = event.payload.eventRerollEffect ?? nextBranch.effect;
    if (core.pendingEventRollResolution?.rollId === recentRoll.id) {
        const pendingEventRoll = core.pendingEventRollResolution;
        const nextPendingEventChoice = eventEffectNeedsPendingEventChoice(nextEffect)
            ? {
                id: `${pendingEventRoll.rollId}-reroll-${event.timestamp}`,
                playerId: pendingEventRoll.playerId,
                sourceTitle: pendingEventRoll.sourceTitle,
                effect: cloneUseEffect(nextEffect),
            }
            : undefined;
        const acknowledgementContext = {
            nextPendingEventChoice,
            hauntRevealResolution: event.payload.eventRerollHaunt?.hauntRevealResolution,
            hauntTraitorResolution: event.payload.eventRerollHaunt?.hauntTraitorResolution,
            dustSetup: event.payload.eventRerollHaunt?.dustSetup,
            magicCameraSetup: event.payload.eventRerollHaunt?.magicCameraSetup,
            helpingHandsSetup: event.payload.eventRerollHaunt?.helpingHandsSetup,
            uponReflectionSetup: event.payload.eventRerollHaunt?.uponReflectionSetup,
        };
        const requiresAcknowledgement = eventRollResolutionNeedsAcknowledgement(acknowledgementContext);
        nextRoll.latestLabel = nextBranch.label;
        core.recentRoll = nextRoll;
        core.pendingEventRollResolution = {
            ...pendingEventRoll,
            requiredPlayerIds: resolvePendingEventRollResolutionRequiredPlayerIds(core, pendingEventRoll),
            acknowledgedPlayerIds: [],
            effect: cloneUseEffect(nextEffect),
            nextPendingEventChoice,
            requiresAcknowledgement,
            deathPrevention: event.payload.eventRerollDeathPrevention
                ? {
                    ...event.payload.eventRerollDeathPrevention,
                    dice: [...event.payload.eventRerollDeathPrevention.dice],
                    damageTraits: [...event.payload.eventRerollDeathPrevention.damageTraits],
                    traitsBeforeDamage: { ...event.payload.eventRerollDeathPrevention.traitsBeforeDamage },
                }
                : undefined,
            ...(event.payload.eventRerollHaunt
                ? {
                    hauntTriggered: event.payload.eventRerollHaunt.hauntTriggered,
                    hauntCardNumber: event.payload.eventRerollHaunt.hauntCardNumber,
                    hauntTriggerLabel: event.payload.eventRerollHaunt.hauntTriggerLabel,
                    hauntTraitorPlayerId: event.payload.eventRerollHaunt.hauntTraitorPlayerId,
                    hauntRevealResolution: event.payload.eventRerollHaunt.hauntRevealResolution
                        ? { ...event.payload.eventRerollHaunt.hauntRevealResolution }
                        : undefined,
                    hauntTraitorResolution: event.payload.eventRerollHaunt.hauntTraitorResolution
                        ? cloneHauntTraitorResolution(event.payload.eventRerollHaunt.hauntTraitorResolution) ?? undefined
                        : undefined,
                    dustSetup: event.payload.eventRerollHaunt.dustSetup
                        ? cloneDustRuntimeState(event.payload.eventRerollHaunt.dustSetup)
                        : undefined,
                    magicCameraSetup: event.payload.eventRerollHaunt.magicCameraSetup
                        ? cloneMagicCameraRuntimeState(event.payload.eventRerollHaunt.magicCameraSetup)
                        : undefined,
                    helpingHandsSetup: event.payload.eventRerollHaunt.helpingHandsSetup
                        ? cloneHelpingHandsRuntimeState(event.payload.eventRerollHaunt.helpingHandsSetup)
                        : undefined,
                    uponReflectionSetup: event.payload.eventRerollHaunt.uponReflectionSetup
                        ? cloneUponReflectionRuntimeState(event.payload.eventRerollHaunt.uponReflectionSetup)
                        : undefined,
                }
                : {}),
        };
        core.usedCardIdsThisTurn = [...core.usedCardIdsThisTurn, event.payload.cardId];
        refreshLatestEventDiscoveryAfterReroll(core, recentRoll, nextRoll, nextTotal, nextBranch.label, nextEffect);
        if (!requiresAcknowledgement) {
            const synced = syncCurrentExplorerProjection(core);
            return {
                ...synced,
                recommendedAction: resolveRecommendedAction(synced),
                activityLog: appendActivity(synced, event.payload.logText, 'accent'),
            };
        }
        return createFinalizeRecentRollRerollCore(core, event);
    }
    if (core.pendingEventChoice?.sourceTitle === recentRoll.sourceTitle && !recentRoll.eventEffectSnapshot) {
        nextRoll.latestLabel = nextBranch.label;
        nextRoll.eventEffectSnapshot = undefined;
        core.recentRoll = nextRoll;
        core.pendingEventChoice = {
            ...core.pendingEventChoice,
            effect: cloneUseEffect(nextEffect),
        };
        core.usedCardIdsThisTurn = [...core.usedCardIdsThisTurn, event.payload.cardId];
        refreshLatestEventDiscoveryAfterReroll(core, recentRoll, nextRoll, nextTotal, nextBranch.label, nextEffect);
        return createFinalizeRecentRollRerollCore(core, event);
    }
    const previousEffect = recentRoll.branchThresholds.find((branch) => branch.label === recentRoll.latestLabel)?.effect;
    if (previousEffect) {
        revertEventEffect(core, previousEffect, recentRoll.eventEffectSnapshot);
    }
    const nextSnapshot = applyEventEffect(core, nextEffect);
    nextRoll.latestLabel = nextBranch.label;
    nextRoll.eventEffectSnapshot = nextSnapshot;
    core.recentRoll = nextRoll;
    core.usedCardIdsThisTurn = [...core.usedCardIdsThisTurn, event.payload.cardId];
    refreshLatestEventDiscoveryAfterReroll(core, recentRoll, nextRoll, nextTotal, nextBranch.label, nextBranch.effect);
    return createFinalizeRecentRollRerollCore(core, event);
}

function applyAttackRecentRollRerollState(
    core: BetrayalCore,
    event: RabbitFootUsedEvent,
    recentRoll: BetrayalRecentRollState,
    nextRoll: BetrayalRecentRollState,
    nextTotal: number,
): BetrayalCore {
    const attack = recentRoll.attack;
    if (!attack) {
        return core;
    }
    if (core.pendingDamageAllocation && !isPendingDamageAllocationForAttackRoll(core)) {
        return core;
    }
    const attacker = findExplorerByPlayerId(core, recentRoll.playerId);
    const defender = attack.defenderPlayerId
        ? findExplorerByPlayerId(core, attack.defenderPlayerId)
        : null;
    if (!attacker) {
        return core;
    }
    resetExplorerTraits(attacker, attack.attackerTraitsBeforeDamage);
    if (defender && attack.defenderTraitsBeforeDamage) {
        resetExplorerTraits(defender, attack.defenderTraitsBeforeDamage);
    }
    const rerollOutcome = resolveAttackRerollOutcome(nextTotal, attack);
    let pendingAttackDamageAllocation: BetrayalPendingDamageAllocationState | null = null;
    if (rerollOutcome.damageToAttacker) {
        applyAttackDamage(attacker, rerollOutcome.damageToAttacker, attack.damageKind);
    }
    if (defender && rerollOutcome.damageToDefender) {
        if (canDeferOrdinaryAttackDamageToDefender(core, attack.target)) {
            pendingAttackDamageAllocation = createPendingDamageAllocation({
                id: `haunt-attack-reroll-damage-${defender.playerId}-${event.timestamp}`,
                explorer: defender,
                sourceTitle: '攻击',
                damageKind: attack.damageKind,
                amount: rerollOutcome.damageToDefender,
                allowSkull: true,
            });
        }
        if (!pendingAttackDamageAllocation) {
            applyAttackDamage(defender, rerollOutcome.damageToDefender, attack.damageKind);
        }
    }
    nextRoll.latestLabel = rerollOutcome.latestLabel;
    nextRoll.attack = {
        ...attack,
        previousDamageToAttacker: rerollOutcome.damageToAttacker ?? 0,
        previousDamageToDefender: rerollOutcome.damageToDefender ?? 0,
        attackerTraitsBeforeDamage: { ...attack.attackerTraitsBeforeDamage },
        defenderTraitsBeforeDamage: attack.defenderTraitsBeforeDamage
            ? { ...attack.defenderTraitsBeforeDamage }
            : undefined,
    };
    core.recentRoll = nextRoll;
    core.usedCardIdsThisTurn = [...core.usedCardIdsThisTurn, event.payload.cardId];
    core.pendingDamageAllocation = pendingAttackDamageAllocation;
    core.activePlayerId = pendingAttackDamageAllocation?.playerId ?? null;
    if (pendingAttackDamageAllocation) {
        const synced = syncCurrentExplorerProjection(core);
        return {
            ...synced,
            pendingDamageAllocation: pendingAttackDamageAllocation,
            activePlayerId: pendingAttackDamageAllocation.playerId,
            recommendedAction: 'endTurn',
            activityLog: appendActivity(synced, event.payload.logText, 'accent'),
        };
    }
    return createFinalizeRecentRollRerollCore(core, event);
}

function applyRoomEndTurnRecentRollRerollState(
    core: BetrayalCore,
    event: RabbitFootUsedEvent,
    recentRoll: BetrayalRecentRollState,
    nextRoll: BetrayalRecentRollState,
    nextTotal: number,
): BetrayalCore {
    const roomEndTurn = recentRoll.roomEndTurn;
    const explorer = findExplorerByPlayerId(core, recentRoll.playerId);
    if (!roomEndTurn || !explorer) {
        return core;
    }
    explorer.roomId = roomEndTurn.originalRoomId;
    resetExplorerTraits(explorer, roomEndTurn.traitsBeforeEffect);
    if (nextTotal >= 5) {
        nextRoll.latestLabel = '没有坠落';
        nextRoll.roomEndTurn = {
            ...roomEndTurn,
            previousPhysicalDamage: 0,
            previousDestinationRoomId: undefined,
            traitsBeforeEffect: { ...roomEndTurn.traitsBeforeEffect },
        };
    } else {
        explorer.roomId = 'basement-landing';
        nextRoll.latestLabel = '坠落到地下室起始点';
        nextRoll.roomEndTurn = {
            ...roomEndTurn,
            previousPhysicalDamage: roomEndTurn.previousPhysicalDamage,
            previousDestinationRoomId: 'basement-landing',
            traitsBeforeEffect: { ...roomEndTurn.traitsBeforeEffect },
        };
    }
    core.recentRoll = nextRoll;
    core.usedCardIdsThisTurn = [...core.usedCardIdsThisTurn, event.payload.cardId];
    return createFinalizeRecentRollRerollCore(core, event);
}

export function applyBetrayalRecentRollRerollState(
    core: BetrayalCore,
    event: RabbitFootUsedEvent,
): BetrayalRecentRollRerollStateResolution {
    const rerollState = createNextRecentRollAfterReroll(core, event);
    if (!rerollState) {
        return { core };
    }
    const { recentRoll, nextRoll, nextTotal } = rerollState;
    if (recentRoll.kind === 'eventTraitCheck' || recentRoll.kind === 'eventDiceRoll') {
        return {
            core: applyEventRecentRollRerollState(core, event, recentRoll, nextRoll, nextTotal),
        };
    }
    if (recentRoll.kind === 'mysticElevator') {
        if (!applyBetrayalMysticElevatorRecentRollRerollState(
            core,
            recentRoll,
            nextRoll,
            nextTotal,
            event.payload.cardId,
        )) {
            return { core };
        }
        return {
            core: createFinalizeRecentRollRerollCore(core, event),
        };
    }
    if (recentRoll.kind === 'attackRoll') {
        return {
            core: applyAttackRecentRollRerollState(core, event, recentRoll, nextRoll, nextTotal),
        };
    }
    if (recentRoll.kind === 'roomEndTurnTraitCheck') {
        return {
            core: applyRoomEndTurnRecentRollRerollState(core, event, recentRoll, nextRoll, nextTotal),
        };
    }
    if (recentRoll.kind === 'deathPrevention') {
        const explorer = findExplorerByPlayerId(core, recentRoll.playerId);
        if (!recentRoll.deathPrevention || !explorer) {
            return { core };
        }
        applyDeathPreventionRerollOutcome(core, explorer, recentRoll, nextRoll, nextTotal);
        core.recentRoll = nextRoll;
        core.usedCardIdsThisTurn = [...core.usedCardIdsThisTurn, event.payload.cardId];
        const scenarioCompletedResult = resolveDustTraitorVictoryResult(core, {
            deferForRabbitFoot: false,
        });
        if (scenarioCompletedResult) {
            return { core, scenarioCompletedResult };
        }
    }
    return {
        core: createFinalizeRecentRollRerollCore(core, event),
    };
}
