import type {
    RandomFn,
    ValidationResult,
} from '../../engine/types';
import { BETRAYAL_COMMANDS } from './commands';
import { rollBetrayalDicePips } from './diceRules';
import {
    cloneExplorerSummary,
    findExplorerByPlayerId,
} from './explorerReadModel';
import {
    HELPING_HANDS_STRANGE_AMULET_EFFECT_ID,
    resolveJackSpiritSpawnRoomId,
} from './hauntScenarioReadModel';
import {
    cloneMonsterMovementRollResult,
    type BetrayalBloodFromStoneGazeDamageRoll,
} from './monsterActionReadModel';
import {
    BETRAYAL_TRAIT_LABEL as TRAIT_LABEL,
    resolveInventoryEffectId,
} from './possessionEffects';
import { resolveRecentRollRerollItemRule } from './possessionActionReadModel';
import {
    isRecentRollFullyAcknowledged,
    resolveAcknowledgeableRecentRoll,
} from './acknowledgementReadModel';
import {
    applyGeneralDamage,
    applyTraitLoss,
    BETRAYAL_TRAIT_KEYS,
    damageTraitsAreAssignable,
    moveExplorerTraitSteps,
    normalizeExplorerTraitTracks,
    resolveTraitDamageAssignableSteps,
    setExplorerTraitPosition,
} from './traitTrackModel';
import type {
    BetrayalCore,
    BetrayalExplorerSummary,
    BetrayalMonsterSummary,
    BetrayalMonsterMovementRollResult,
    BetrayalPendingDamageAllocationState,
    BetrayalScenarioRuntimeStatus,
    BetrayalTraitKey,
} from './game';
import type { BetrayalCommand } from './commandTypes';
import type { BetrayalCommandMap } from './commandTypes';

const BROOCH_CARD_ID = 'brooch';

const PHYSICAL_DAMAGE_REDUCTION_BY_CARD_ID: Record<string, number> = {
    armor: 1,
};

const MENTAL_DAMAGE_REDUCTION_BY_CARD_ID: Record<string, number> = {
    radio: 1,
};

const DEATH_PREVENTION_ROLL_CARDS_BY_ID: Record<string, { dice: number; minTotal: number }> = {
    skull: { dice: 3, minTotal: 4 },
};

export type BetrayalDeathPreventionRoll = {
    playerId: string;
    prevented: boolean;
    rollTotal: number;
    dice: number[];
    minTotal: number;
    cardId: string;
};

type ResolveDamageAllocationPayload = BetrayalCommandMap[typeof BETRAYAL_COMMANDS.RESOLVE_DAMAGE_ALLOCATION];

export interface BetrayalDamageAllocationResolvedPayload {
    playerId: string;
    sourceTitle: string;
    damageKind: 'physical' | 'mental' | 'general';
    amount: number;
    traits: BetrayalTraitKey[];
    nextPlayerId?: string;
    monsterMovementRoll?: BetrayalMonsterMovementRollResult | null;
    turnLogText?: string;
    helpingHandsMonsterTurnControllerPlayerId?: string;
    skipBloodFromStoneMonsterTurnStart?: boolean;
    deathPrevention?: {
        playerId: string;
        cardId: string;
        rollTotal: number;
        dice: number[];
        minTotal: number;
        damageAmount: number;
        damageKind: 'physical' | 'mental' | 'general';
        damageTraits: BetrayalTraitKey[];
        traitsBeforeDamage: BetrayalExplorerSummary['traits'];
        releasedJackSpiritRoomId?: string;
        nextPlayerId?: string;
        monsterMovementRoll?: BetrayalMonsterMovementRollResult | null;
        turnLogText?: string;
        helpingHandsMonsterTurnControllerPlayerId?: string;
        skipBloodFromStoneMonsterTurnStart?: boolean;
        prevented: boolean;
    };
    logText: string;
}

export interface BetrayalDamageAllocationStateResolution {
    pending: BetrayalPendingDamageAllocationState;
    target: BetrayalExplorerSummary;
    targetReachedDeath: boolean;
    targetDefeated: boolean;
    nextQueuedDamageAllocation: BetrayalPendingDamageAllocationState | null;
}

type DeathPreventionSnapshot = {
    scenarioRuntimeBeforeDefeat: BetrayalScenarioRuntimeStatus;
    monstersBeforeDefeat: BetrayalMonsterSummary[];
};

export function clonePendingDamageAllocation(
    pending: BetrayalPendingDamageAllocationState,
): BetrayalPendingDamageAllocationState {
    return {
        ...pending,
        allowedTraits: [...pending.allowedTraits],
        damageReplacement: pending.damageReplacement ? { ...pending.damageReplacement } : undefined,
        forcedTraitSequence: pending.forcedTraitSequence ? [...pending.forcedTraitSequence] : undefined,
        traitsBeforeDamage: { ...pending.traitsBeforeDamage },
        nextDamageAllocations: pending.nextDamageAllocations?.map(clonePendingDamageAllocation),
        monsterMovementRoll: pending.monsterMovementRoll
            ? cloneMonsterMovementRollResult(pending.monsterMovementRoll)
            : pending.monsterMovementRoll,
        skipBloodFromStoneMonsterTurnStart: pending.skipBloodFromStoneMonsterTurnStart,
    };
}

export function isExplorerDead(explorer: BetrayalExplorerSummary): boolean {
    normalizeExplorerTraitTracks(explorer);
    return BETRAYAL_TRAIT_KEYS.some((trait) => {
        const track = explorer.traitTracks[trait];
        return track.position <= track.skullPosition;
    });
}

function resolvePhysicalDamageReduction(explorer: BetrayalExplorerSummary): number {
    const cardIds = new Set(explorer.inventory.map((card) => resolveInventoryEffectId(card.id)));
    return [...cardIds].reduce((total, cardId) => total + (PHYSICAL_DAMAGE_REDUCTION_BY_CARD_ID[cardId] ?? 0), 0);
}

function resolveMentalDamageReduction(explorer: BetrayalExplorerSummary): number {
    const cardIds = new Set(explorer.inventory.map((card) => resolveInventoryEffectId(card.id)));
    return [...cardIds].reduce((total, cardId) => total + (MENTAL_DAMAGE_REDUCTION_BY_CARD_ID[cardId] ?? 0), 0);
}

export function applyPhysicalDamage(
    explorer: BetrayalExplorerSummary,
    amount: number,
    options: { allowSkull?: boolean } = {},
): number {
    const applied = applyTraitLoss(explorer, ['might', 'speed'], Math.max(0, amount - resolvePhysicalDamageReduction(explorer)), options);
    if (applied > 0) {
        applyStrangeAmuletPhysicalDamageBonus(explorer);
    }
    return applied;
}

export function applyMentalDamage(
    explorer: BetrayalExplorerSummary,
    amount: number,
    options: { allowSkull?: boolean } = {},
): number {
    return applyTraitLoss(explorer, ['knowledge', 'sanity'], Math.max(0, amount - resolveMentalDamageReduction(explorer)), options);
}

export function applyStrangeAmuletPhysicalDamageBonus(explorer: BetrayalExplorerSummary): void {
    const hasStrangeAmulet = explorer.inventory.some((card) => resolveInventoryEffectId(card.id) === HELPING_HANDS_STRANGE_AMULET_EFFECT_ID);
    if (hasStrangeAmulet) {
        moveExplorerTraitSteps(explorer, 'sanity', 1, { allowSkull: true });
    }
}

export function applyAttackDamage(
    explorer: BetrayalExplorerSummary,
    amount: number,
    damageKind: 'physical' | 'mental',
): void {
    if (damageKind === 'mental') {
        applyMentalDamage(explorer, amount, { allowSkull: true });
        return;
    }
    applyPhysicalDamage(explorer, amount, { allowSkull: true });
}

export function setExplorerTraitsToDeathsDoor(explorer: BetrayalExplorerSummary): void {
    normalizeExplorerTraitTracks(explorer);
    for (const trait of BETRAYAL_TRAIT_KEYS) {
        setExplorerTraitPosition(explorer, trait, explorer.traitTracks[trait].criticalPosition);
    }
}

export function repeatTraitForDamage(trait: BetrayalTraitKey, amount: number): BetrayalTraitKey[] {
    return Array.from({ length: Math.max(0, amount) }, () => trait);
}

export function wouldExplorerDieFromPhysicalDamage(explorer: BetrayalExplorerSummary, amount: number): boolean {
    if (amount <= 0) {
        return false;
    }
    const preview = cloneExplorerSummary(explorer);
    applyPhysicalDamage(preview, amount, { allowSkull: true });
    return isExplorerDead(preview);
}

export function wouldExplorerDieFromMentalDamage(explorer: BetrayalExplorerSummary, amount: number): boolean {
    if (amount <= 0) {
        return false;
    }
    const preview = cloneExplorerSummary(explorer);
    applyMentalDamage(preview, amount, { allowSkull: true });
    return isExplorerDead(preview);
}

export function wouldExplorerDieFromAttackDamage(
    explorer: BetrayalExplorerSummary,
    amount: number,
    damageKind: 'physical' | 'mental',
): boolean {
    return damageKind === 'mental'
        ? wouldExplorerDieFromMentalDamage(explorer, amount)
        : wouldExplorerDieFromPhysicalDamage(explorer, amount);
}

export function resolveDeathPreventionRollCardId(explorer: BetrayalExplorerSummary): string | null {
    return explorer.inventory
        .map((card) => resolveInventoryEffectId(card.id))
        .find((cardId) => Boolean(DEATH_PREVENTION_ROLL_CARDS_BY_ID[cardId]))
        ?? null;
}

export function rollDeathPrevention(
    random: RandomFn,
    explorer: BetrayalExplorerSummary,
): BetrayalDeathPreventionRoll | null {
    const cardId = resolveDeathPreventionRollCardId(explorer);
    if (!cardId) {
        return null;
    }
    const config = DEATH_PREVENTION_ROLL_CARDS_BY_ID[cardId]!;
    const dice = rollBetrayalDicePips(random, config.dice);
    const rollTotal = dice.reduce((sum, pip) => sum + pip, 0);
    return {
        playerId: explorer.playerId,
        cardId,
        dice,
        minTotal: config.minTotal,
        rollTotal,
        prevented: rollTotal >= config.minTotal,
    };
}

export function formatDeathPreventionLog(deathPrevention: {
    cardId: string;
    rollTotal: number;
    prevented: boolean;
} | null | undefined): string {
    if (!deathPrevention) {
        return '';
    }
    const cardName = deathPrevention.cardId === 'skull' ? '头骨' : deathPrevention.cardId;
    return deathPrevention.prevented
        ? `；${cardName}投出 ${deathPrevention.rollTotal}，阻止死亡并将所有属性调至濒死`
        : `；${cardName}投出 ${deathPrevention.rollTotal}，正常死亡`;
}

export function resolveDamageAllocationAllowedTraits(damageKind: BetrayalPendingDamageAllocationState['damageKind']): BetrayalTraitKey[] {
    if (damageKind === 'physical') {
        return ['might', 'speed'];
    }
    if (damageKind === 'mental') {
        return ['knowledge', 'sanity'];
    }
    return ['might', 'speed', 'knowledge', 'sanity'];
}

function resolveReducedDamageAmount(
    explorer: BetrayalExplorerSummary,
    damageKind: BetrayalPendingDamageAllocationState['damageKind'],
    amount: number,
): number {
    if (damageKind === 'physical') {
        return Math.max(0, amount - resolvePhysicalDamageReduction(explorer));
    }
    if (damageKind === 'mental') {
        return Math.max(0, amount - resolveMentalDamageReduction(explorer));
    }
    return Math.max(0, amount);
}

export function validateBetrayalDamageAllocationResolution(
    core: BetrayalCore,
    command: BetrayalCommand,
): ValidationResult | null {
    const pending = core.pendingDamageAllocation;
    if (!pending) {
        return command.type === BETRAYAL_COMMANDS.RESOLVE_DAMAGE_ALLOCATION
            ? { valid: false, error: '当前没有待分配的伤害。' }
            : null;
    }
    const pendingEventRolledDamageAcknowledgement = core.recentRoll?.kind === 'eventRolledDamage'
        ? resolveAcknowledgeableRecentRoll(core)
        : null;
    if (
        pendingEventRolledDamageAcknowledgement
        && !isRecentRollFullyAcknowledged(core, pendingEventRolledDamageAcknowledgement)
    ) {
        if (
            command.type === BETRAYAL_COMMANDS.ACKNOWLEDGE_RECENT_ROLL
            || command.type === BETRAYAL_COMMANDS.ACKNOWLEDGE_CARD_RESOLUTION
        ) {
            return null;
        }
        return { valid: false, error: '请先确认当前伤害骰结果。' };
    }
    if (command.type !== BETRAYAL_COMMANDS.RESOLVE_DAMAGE_ALLOCATION) {
        return { valid: false, error: '请先分配当前伤害。' };
    }
    if (pending.playerId !== command.playerId) {
        return { valid: false, error: '必须由受伤玩家分配伤害。' };
    }
    const useBrooch = Boolean(command.payload.useBrooch);
    if (useBrooch && !pending.damageReplacement) {
        return { valid: false, error: '当前伤害不能使用胸针替换为通用伤害。' };
    }
    if (useBrooch && pending.forcedTraitSequence) {
        return { valid: false, error: '当前强制伤害顺序不能使用胸针替换。' };
    }
    const allowedTraits = useBrooch
        ? resolveDamageAllocationAllowedTraits('general')
        : pending.allowedTraits;
    const traits = command.payload.traits ?? [];
    if (traits.length !== pending.amount) {
        return { valid: false, error: '伤害分配点数不正确。' };
    }
    if (
        pending.forcedTraitSequence
        && (
            pending.forcedTraitSequence.length !== traits.length
            || pending.forcedTraitSequence.some((trait, index) => trait !== traits[index])
        )
    ) {
        return { valid: false, error: '木乃伊伤害必须先扣速度，速度降到底后才扣力量。' };
    }
    if (!traits.every((trait) => allowedTraits.includes(trait))) {
        return { valid: false, error: '该伤害不能分配到所选属性。' };
    }
    const explorer = findExplorerByPlayerId(core, pending.playerId);
    if (!explorer) {
        return { valid: false, error: '受伤探索者不存在。' };
    }
    if (!damageTraitsAreAssignable(explorer, traits, { allowSkull: pending.allowSkull })) {
        return { valid: false, error: '不能把伤害分配到已锁定的属性。' };
    }
    return { valid: true };
}

export function resolveBetrayalDamageAllocationResolvedPayload(
    core: BetrayalCore,
    payload: ResolveDamageAllocationPayload,
    random: RandomFn,
): BetrayalDamageAllocationResolvedPayload | null {
    const pending = core.pendingDamageAllocation;
    if (!pending) {
        return null;
    }
    const actor = findExplorerByPlayerId(core, pending.playerId) ?? core.currentExplorer;
    const traits = payload.traits ?? [];
    const traitText = traits.map((trait) => TRAIT_LABEL[trait]).join('、');
    const useBrooch = Boolean(payload.useBrooch && pending.damageReplacement);
    const resolvedDamageKind = useBrooch ? 'general' : pending.damageKind;
    const broochLog = useBrooch
        ? `使用${pending.damageReplacement!.cardName}将${pending.damageKind === 'physical' ? '物理' : '精神'}伤害替换为通用伤害，`
        : '';
    const deathPreview = cloneExplorerSummary(actor);
    const projectedAppliedDamage = applyGeneralDamage(deathPreview, pending.amount, traits, { allowSkull: pending.allowSkull });
    const strangeAmuletBonusCard = resolvedDamageKind === 'physical' && projectedAppliedDamage > 0
        ? actor.inventory.find((card) => resolveInventoryEffectId(card.id) === HELPING_HANDS_STRANGE_AMULET_EFFECT_ID)
        : undefined;
    const strangeAmuletLog = strangeAmuletBonusCard ? `；${strangeAmuletBonusCard.name}使神志 +1` : '';
    const deathPreventionRoll = pending.allowSkull
        && isExplorerDead(deathPreview)
        ? rollDeathPrevention(random, actor)
        : null;
    const releasedJackSpiritRoomId = pending.sourceTitle === '攻击'
        && actor.playerId === core.scenarioRuntime.traitorPlayerId
        ? resolveJackSpiritSpawnRoomId(core, actor.roomId)
        : undefined;
    const deathPrevention = deathPreventionRoll
        ? {
            ...deathPreventionRoll,
            damageAmount: pending.amount,
            damageKind: resolvedDamageKind,
            damageTraits: [...traits],
            traitsBeforeDamage: { ...pending.traitsBeforeDamage },
            releasedJackSpiritRoomId,
            nextPlayerId: pending.nextPlayerId,
            monsterMovementRoll: pending.monsterMovementRoll ?? null,
            turnLogText: pending.turnLogText,
            helpingHandsMonsterTurnControllerPlayerId: pending.helpingHandsMonsterTurnControllerPlayerId,
            skipBloodFromStoneMonsterTurnStart: pending.skipBloodFromStoneMonsterTurnStart,
        }
        : undefined;
    const deathPreventionLog = formatDeathPreventionLog(deathPrevention);
    return {
        playerId: pending.playerId,
        sourceTitle: pending.sourceTitle,
        damageKind: resolvedDamageKind,
        amount: pending.amount,
        traits,
        nextPlayerId: pending.nextPlayerId,
        monsterMovementRoll: pending.monsterMovementRoll ?? null,
        turnLogText: pending.turnLogText,
        helpingHandsMonsterTurnControllerPlayerId: pending.helpingHandsMonsterTurnControllerPlayerId,
        skipBloodFromStoneMonsterTurnStart: pending.skipBloodFromStoneMonsterTurnStart,
        deathPrevention,
        logText: `${actor.displayName}${broochLog}将${pending.sourceTitle}的 ${pending.amount} 点伤害分配到${traitText}${deathPreventionLog}${strangeAmuletLog}`,
    };
}

export function applyBetrayalDamageAllocationResolvedState(
    core: BetrayalCore,
    payload: BetrayalDamageAllocationResolvedPayload,
    timestamp: number,
    deathPreventionSnapshot: DeathPreventionSnapshot,
): BetrayalDamageAllocationStateResolution | null {
    const pending = core.pendingDamageAllocation;
    const target = findExplorerByPlayerId(core, payload.playerId);
    if (!pending || !target) {
        return null;
    }

    const appliedDamage = applyGeneralDamage(target, payload.amount, payload.traits, { allowSkull: pending.allowSkull });
    if (payload.damageKind === 'physical' && appliedDamage > 0) {
        applyStrangeAmuletPhysicalDamageBonus(target);
    }

    const targetReachedDeath = pending.allowSkull && isExplorerDead(target);
    if (targetReachedDeath && payload.deathPrevention?.prevented) {
        setExplorerTraitsToDeathsDoor(target);
    }

    if (payload.deathPrevention?.dice.length) {
        core.recentRoll = {
            id: `${payload.deathPrevention.playerId}-death-prevention-${timestamp}`,
            kind: 'deathPrevention',
            playerId: payload.deathPrevention.playerId,
            sourceTitle: payload.deathPrevention.cardId === 'skull' ? '头骨死亡保护' : '死亡保护',
            dice: [...payload.deathPrevention.dice],
            passiveBonus: 0,
            latestLabel: payload.deathPrevention.prevented ? '阻止死亡' : '正常死亡',
            deathPrevention: {
                cardId: payload.deathPrevention.cardId,
                minTotal: payload.deathPrevention.minTotal,
                damageKind: payload.deathPrevention.damageKind,
                damageAmount: payload.deathPrevention.damageAmount,
                damageTraits: [...payload.deathPrevention.damageTraits],
                traitsBeforeDamage: { ...payload.deathPrevention.traitsBeforeDamage },
                scenarioRuntimeBeforeDefeat: deathPreventionSnapshot.scenarioRuntimeBeforeDefeat,
                monstersBeforeDefeat: deathPreventionSnapshot.monstersBeforeDefeat,
                releasedJackSpiritRoomId: payload.deathPrevention.releasedJackSpiritRoomId,
                nextPlayerId: payload.deathPrevention.nextPlayerId,
                monsterMovementRoll: payload.deathPrevention.monsterMovementRoll ?? null,
                turnLogText: payload.deathPrevention.turnLogText,
                helpingHandsMonsterTurnControllerPlayerId: payload.deathPrevention.helpingHandsMonsterTurnControllerPlayerId,
                skipBloodFromStoneMonsterTurnStart: payload.deathPrevention.skipBloodFromStoneMonsterTurnStart,
            },
            consumedRabbitFootCardIds: [],
        };
    }

    const targetDefeated = targetReachedDeath && !payload.deathPrevention?.prevented;
    const nextQueuedDamageAllocation = pending.nextDamageAllocations?.[0]
        ? {
            ...clonePendingDamageAllocation(pending.nextDamageAllocations[0]),
            nextDamageAllocations: pending.nextDamageAllocations.slice(1).map(clonePendingDamageAllocation),
        }
        : null;
    if (nextQueuedDamageAllocation) {
        const nextQueuedTarget = findExplorerByPlayerId(core, nextQueuedDamageAllocation.playerId);
        if (nextQueuedTarget) {
            nextQueuedDamageAllocation.traitsBeforeDamage = { ...nextQueuedTarget.traits };
        }
    }
    core.pendingDamageAllocation = null;

    return {
        pending,
        target,
        targetReachedDeath,
        targetDefeated,
        nextQueuedDamageAllocation,
    };
}

export function resolveAssignableDamageAmount(
    explorer: BetrayalExplorerSummary,
    allowedTraits: BetrayalTraitKey[],
    amount: number,
    options: { allowSkull?: boolean } = {},
): number {
    const assignableSteps = allowedTraits.reduce(
        (total, trait) => total + resolveTraitDamageAssignableSteps(explorer, trait, options),
        0,
    );
    return Math.min(Math.max(0, amount), assignableSteps);
}

export function createPendingDamageAllocation(params: {
    id: string;
    explorer: BetrayalExplorerSummary;
    sourceTitle: string;
    damageKind: BetrayalPendingDamageAllocationState['damageKind'];
    amount: number;
    allowSkull?: boolean;
    forcedTraitSequence?: BetrayalTraitKey[];
    nextPlayerId?: string;
    nextDamageAllocations?: BetrayalPendingDamageAllocationState[];
    monsterMovementRoll?: BetrayalMonsterMovementRollResult | null;
    turnLogText?: string;
    helpingHandsMonsterTurnControllerPlayerId?: string;
    skipBloodFromStoneMonsterTurnStart?: boolean;
}): BetrayalPendingDamageAllocationState | null {
    const allowedTraits = resolveDamageAllocationAllowedTraits(params.damageKind);
    const reducedAmount = resolveReducedDamageAmount(params.explorer, params.damageKind, params.amount);
    const damageReductionAmount = Math.max(0, params.amount - reducedAmount);
    const assignableAmount = resolveAssignableDamageAmount(
        params.explorer,
        allowedTraits,
        reducedAmount,
        { allowSkull: params.allowSkull },
    );
    if (assignableAmount <= 0) {
        return null;
    }
    return {
        id: params.id,
        playerId: params.explorer.playerId,
        sourceTitle: params.sourceTitle,
        damageKind: params.damageKind,
        amount: assignableAmount,
        originalAmount: params.amount,
        damageReductionAmount,
        allowedTraits,
        damageReplacement: resolveBroochDamageReplacement(params.explorer, params.damageKind),
        forcedTraitSequence: params.forcedTraitSequence
            ? [...params.forcedTraitSequence].slice(0, assignableAmount)
            : undefined,
        allowSkull: Boolean(params.allowSkull),
        traitsBeforeDamage: { ...params.explorer.traits },
        nextPlayerId: params.nextPlayerId,
        nextDamageAllocations: params.nextDamageAllocations?.map(clonePendingDamageAllocation),
        monsterMovementRoll: params.monsterMovementRoll,
        turnLogText: params.turnLogText,
        helpingHandsMonsterTurnControllerPlayerId: params.helpingHandsMonsterTurnControllerPlayerId,
        skipBloodFromStoneMonsterTurnStart: params.skipBloodFromStoneMonsterTurnStart,
    };
}

export function chainPendingDamageAllocations(
    allocations: BetrayalPendingDamageAllocationState[],
): BetrayalPendingDamageAllocationState | null {
    const [first, ...rest] = allocations.map(clonePendingDamageAllocation);
    if (!first) {
        return null;
    }
    return {
        ...first,
        nextDamageAllocations: rest,
    };
}

export function createRecentRollRerollMentalDamageAllocation(
    core: BetrayalCore,
    playerId: string,
    cardId: string,
    amount: number | undefined,
    timestamp: number,
): BetrayalPendingDamageAllocationState | null {
    const rule = resolveRecentRollRerollItemRule(cardId);
    const explorer = findExplorerByPlayerId(core, playerId);
    if (!rule || rule.mode !== 'blank-trait-check-dice' || !explorer || !amount || amount <= 0) {
        return null;
    }
    return createPendingDamageAllocation({
        id: `recent-reroll-mental-damage-${playerId}-${cardId}-${timestamp}`,
        explorer,
        sourceTitle: rule.label,
        damageKind: 'mental',
        amount,
        allowSkull: core.phase === 'haunt',
    });
}

export function createBloodFromStoneGazeDamageAllocationQueue(
    core: BetrayalCore,
    damageRolls: BetrayalBloodFromStoneGazeDamageRoll[],
    nextPlayerId: string,
    turnLogText: string,
): BetrayalPendingDamageAllocationState | null {
    const allocations = damageRolls
        .map((roll) => {
            const explorer = findExplorerByPlayerId(core, roll.playerId);
            if (!explorer || roll.amount <= 0) {
                return null;
            }
            return createPendingDamageAllocation({
                id: `blood-from-stone-gaze-${roll.playerId}-${roll.visibleStoneCherubIds.join('-')}`,
                explorer,
                sourceTitle: '石像小天使凝视',
                damageKind: 'general',
                amount: roll.amount,
                allowSkull: true,
            });
        })
        .filter((allocation): allocation is BetrayalPendingDamageAllocationState => Boolean(allocation));
    const lastAllocation = allocations[allocations.length - 1];
    if (lastAllocation) {
        lastAllocation.nextPlayerId = nextPlayerId;
        lastAllocation.turnLogText = turnLogText;
        lastAllocation.skipBloodFromStoneMonsterTurnStart = true;
    }
    return chainPendingDamageAllocations(allocations);
}

export function createBloodFromStoneNewLineOfSightDamageAllocation(
    core: BetrayalCore,
    roll: BetrayalBloodFromStoneGazeDamageRoll,
): BetrayalPendingDamageAllocationState | null {
    const explorer = findExplorerByPlayerId(core, roll.playerId);
    if (!explorer || roll.amount <= 0) {
        return null;
    }
    return createPendingDamageAllocation({
        id: `blood-from-stone-new-line-of-sight-${roll.playerId}-${roll.visibleStoneCherubIds.join('-')}`,
        explorer,
        sourceTitle: '石像小天使新视线伤害',
        damageKind: 'general',
        amount: roll.amount,
        allowSkull: true,
    });
}

function resolveBroochDamageReplacement(
    explorer: BetrayalExplorerSummary,
    damageKind: BetrayalPendingDamageAllocationState['damageKind'],
): BetrayalPendingDamageAllocationState['damageReplacement'] {
    if (damageKind === 'general') {
        return undefined;
    }
    const card = explorer.inventory.find((inventoryCard) => resolveInventoryEffectId(inventoryCard.id) === BROOCH_CARD_ID);
    return card
        ? {
            kind: 'brooch-general-damage',
            cardId: card.id,
            cardName: card.name,
        }
        : undefined;
}
