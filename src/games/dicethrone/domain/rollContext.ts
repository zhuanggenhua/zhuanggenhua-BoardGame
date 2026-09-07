import type { PlayerId } from '../../../engine/types';
import type {
    ChoiceRequestedEvent,
    DiceThroneCore,
    DiceThroneRollContext,
    DiceThroneRollContextActorScope,
    DiceThroneRollContextKind,
    Die,
    DieFace,
    PendingBonusDiceSettlement,
    TurnPhase,
} from './types';

type CompareRollContestantMetadata = {
    dieId: number;
    playerId?: PlayerId;
    label?: string;
    labelKey?: string;
    labelParams?: Record<string, string | number>;
    characterId?: string;
    effectKey?: string;
    effectParams?: Record<string, string | number>;
};

type CompareRollOptionMetadata = ChoiceRequestedEvent['payload']['options'][number];
type CompareRollChoice = NonNullable<ChoiceRequestedEvent['payload']['compareRoll']>;

type CompareRollMetadata = {
    compareKind?: string;
    contestants?: CompareRollContestantMetadata[];
    bonusDamageOnWin?: number;
    winOnTie?: boolean;
};

export const getRollContextKindFromPhase = (phase?: TurnPhase): DiceThroneRollContextKind => {
    if (phase === 'defensiveRoll') return 'defensive';
    if (phase === 'targetingRoll') return 'targeting';
    if (phase === 'offensiveRoll') return 'offensive';
    return 'effect';
};

const getLegacyActiveDice = (state: DiceThroneCore): Die[] => {
    const dice = Array.isArray(state.dice) ? state.dice : [];
    const rollDiceCount = typeof state.rollDiceCount === 'number' ? state.rollDiceCount : dice.length;
    return dice.slice(0, rollDiceCount);
};

const inferRollOwnerId = (state: DiceThroneCore, phase?: TurnPhase): PlayerId => {
    if (phase === 'defensiveRoll') {
        return state.pendingAttack?.defenderId ?? state.activePlayerId;
    }
    if (phase === 'offensiveRoll' || phase === 'targetingRoll') {
        return state.activePlayerId;
    }
    if (state.pendingAttack?.defenseAbilityId) {
        return state.pendingAttack.defenderId ?? state.activePlayerId;
    }
    return state.activePlayerId;
};

const defaultPolicy = (
    actorScope: DiceThroneRollContextActorScope = 'owner',
): DiceThroneRollContext['policy'] => ({
    modifiableBy: actorScope,
    rerollableBy: actorScope,
    allowPassiveReroll: true,
    allowDiceCardTargeting: true,
    ultimateLocked: false,
    blocksPhaseFlow: true,
});

const temporaryInterferencePolicy = (): DiceThroneRollContext['policy'] => ({
    modifiableBy: 'any',
    rerollableBy: 'any',
    allowPassiveReroll: true,
    allowDiceCardTargeting: true,
    ultimateLocked: false,
    blocksPhaseFlow: true,
});

export const createMainRollContext = (
    state: DiceThroneCore,
    options: {
        phase?: TurnPhase;
        ownerPlayerId?: PlayerId;
        dice?: Die[];
    } = {},
): DiceThroneRollContext => {
    const phase = options.phase;
    const kind = getRollContextKindFromPhase(phase);
    const ownerPlayerId = options.ownerPlayerId ?? inferRollOwnerId(state, phase);
    const id = `roll:${kind}:${ownerPlayerId}:${state.rollCount}`;
    const dice = (options.dice ?? getLegacyActiveDice(state)).map((die) => ({
        ...die,
        ownerId: die.ownerId ?? ownerPlayerId,
    }));

    return {
        id,
        kind,
        ownerPlayerId,
        phase,
        dice,
        status: state.rollConfirmed ? 'settling' : 'open',
        policy: defaultPolicy('owner'),
        settlement: {
            mode: kind === 'targeting' ? 'targetPlayer' : 'selectAttack',
        },
        display: {
            surface: 'diceTray',
            replayOnly: false,
        },
    };
};

const bonusDieToContextDie = (
    state: DiceThroneCore,
    settlement: PendingBonusDiceSettlement,
    die: PendingBonusDiceSettlement['dice'][number],
): Die => {
    const characterId = state.players[settlement.attackerId]?.characterId;
    if (!characterId || characterId === 'unselected') {
        throw new Error(`奖励骰缺少掷骰者角色：playerId=${settlement.attackerId}`);
    }
    const face = die.face as DieFace;
    return {
        id: die.index,
        definitionId: `${characterId}-dice`,
        value: die.value,
        symbol: face,
        symbols: face ? [face] : [],
        isKept: false,
        ownerId: settlement.attackerId,
        displayOnly: settlement.displayOnly,
    };
};

export const getBonusSettlementContextDice = (
    state: DiceThroneCore,
    settlement: PendingBonusDiceSettlement | null | undefined,
): Die[] => {
    const dice = Array.isArray(settlement?.dice) ? settlement.dice : [];
    return settlement ? dice.map((die) => bonusDieToContextDie(state, settlement, die)) : [];
};

export const createBonusRollContextFromSettlement = (
    state: DiceThroneCore,
    settlement: PendingBonusDiceSettlement,
): DiceThroneRollContext => {
    const id = `bonus:${settlement.id}`;
    return {
        id,
        kind: 'bonus',
        ownerPlayerId: settlement.attackerId,
        targetPlayerId: settlement.targetId,
        sourceAbilityId: settlement.sourceAbilityId,
        dice: getBonusSettlementContextDice(state, settlement),
        status: 'open',
        policy: temporaryInterferencePolicy(),
        settlement: {
            mode: settlement.resolutionMode === 'attackBonus'
                ? 'attackBonus'
                : settlement.resolutionMode === 'none'
                    ? 'none'
                    : 'damage',
            metadata: {
                pendingBonusDiceSettlementId: settlement.id,
            },
        },
        display: {
            surface: 'diceTray',
            replayOnly: false,
            summaryKey: settlement.summaryEffectKey,
        },
    };
};

export const createEvasionRollContext = (
    options: {
        ownerPlayerId: PlayerId;
        diceDefinitionId: string;
        targetPlayerId?: PlayerId;
        sourceTokenId: string;
        value: number;
        successRange: [number, number];
        damageBeforeEvasion: number;
        pendingDamageId?: string;
    },
): DiceThroneRollContext => {
    const id = `evasion:${options.pendingDamageId ?? 'damage'}:${options.sourceTokenId}`;
    return {
        id,
        kind: 'evasion',
        ownerPlayerId: options.ownerPlayerId,
        targetPlayerId: options.targetPlayerId,
        sourceTokenId: options.sourceTokenId,
        dice: [{
            id: 0,
            definitionId: options.diceDefinitionId,
            value: options.value,
            symbol: null,
            symbols: [],
            isKept: false,
            ownerId: options.ownerPlayerId,
        }],
        status: 'open',
        policy: temporaryInterferencePolicy(),
        settlement: {
            mode: 'tokenNegate',
            metadata: {
                evasionSuccessRange: options.successRange,
                damageBeforeEvasion: options.damageBeforeEvasion,
                pendingDamageId: options.pendingDamageId,
            },
        },
        display: {
            surface: 'diceTray',
            replayOnly: false,
        },
    };
};

export const createCompareRollContext = (
    state: DiceThroneCore,
    options: {
        id: string;
        ownerPlayerId: PlayerId;
        targetPlayerId?: PlayerId;
        sourceAbilityId: string;
        dice: Die[];
        metadata: CompareRollMetadata & Record<string, unknown>;
    },
): DiceThroneRollContext => ({
    id: options.id,
    kind: 'compare',
    ownerPlayerId: options.ownerPlayerId,
    targetPlayerId: options.targetPlayerId,
    sourceAbilityId: options.sourceAbilityId,
    dice: options.dice,
    status: 'open',
    policy: temporaryInterferencePolicy(),
    settlement: {
        mode: 'compare',
        metadata: options.metadata,
    },
    display: {
        surface: 'diceTray',
        replayOnly: false,
    },
});

const getCompareMetadata = (context: DiceThroneRollContext): CompareRollMetadata => (
    (context.settlement.metadata ?? {}) as CompareRollMetadata
);

const getCompareContestants = (context: DiceThroneRollContext): CompareRollContestantMetadata[] => {
    const metadata = getCompareMetadata(context);
    return Array.isArray(metadata.contestants) ? metadata.contestants : [];
};

const buildCompareRollContestant = (
    context: DiceThroneRollContext,
    meta: CompareRollContestantMetadata | undefined,
    fallbackIndex: number,
): CompareRollChoice['contestants'][number] => {
    const dieId = typeof meta?.dieId === 'number' ? meta.dieId : fallbackIndex;
    const die = context.dice.find(entry => entry.id === dieId) ?? context.dice[fallbackIndex];
    return {
        playerId: meta?.playerId ?? die?.ownerId,
        label: meta?.label,
        labelKey: meta?.labelKey,
        labelParams: meta?.labelParams,
        roll: die?.value ?? 1,
        face: die?.symbol ?? undefined,
        characterId: meta?.characterId,
        effectKey: meta?.effectKey,
        effectParams: meta?.effectParams,
    };
};

const buildGunslingerShowdownChoice = (
    context: DiceThroneRollContext,
    metadata: CompareRollMetadata,
    timestamp: number,
    sourceCommandType: string,
): ChoiceRequestedEvent => {
    const contestants = getCompareContestants(context);
    const attacker = buildCompareRollContestant(context, contestants[0], 0);
    const defender = buildCompareRollContestant(context, contestants[1], 1);
    const amount = typeof metadata.bonusDamageOnWin === 'number' ? metadata.bonusDamageOnWin : 2;
    const showdownWon = attacker.roll >= defender.roll;
    return {
        type: 'CHOICE_REQUESTED',
        payload: {
            playerId: context.ownerPlayerId,
            sourceAbilityId: context.sourceAbilityId ?? 'showdown',
            titleKey: 'compareRoll.gunslingerShowdown.title',
            options: [],
            compareRoll: {
                contestants: [attacker, defender],
                resultTextKey: showdownWon
                    ? 'compareRoll.gunslingerShowdown.win'
                    : 'compareRoll.gunslingerShowdown.lose',
                resultTextParams: showdownWon ? { amount } : undefined,
                resultTone: showdownWon ? 'success' : 'neutral',
                confirmValue: {
                    value: showdownWon ? amount : 0,
                    customId: 'gunslinger-showdown-apply-bonus',
                },
            },
        },
        sourceCommandType,
        timestamp,
    };
};

const buildGunslingerDuelChoice = (
    context: DiceThroneRollContext,
    metadata: CompareRollMetadata,
    timestamp: number,
    sourceCommandType: string,
): ChoiceRequestedEvent => {
    const contestants = getCompareContestants(context);
    const defender = buildCompareRollContestant(context, contestants[0], 0);
    const attacker = buildCompareRollContestant(context, contestants[1], 1);
    const winOnTie = metadata.winOnTie === true;
    const duelWon = winOnTie ? defender.roll >= attacker.roll : defender.roll > attacker.roll;
    const options: CompareRollOptionMetadata[] = duelWon
        ? [
            { value: 3, customId: 'gunslinger-duel-deal-3', labelKey: 'choices.gunslingerDuel.deal3' },
            { value: 50, customId: 'gunslinger-duel-prevent-half', labelKey: 'choices.gunslingerDuel.preventHalf' },
        ]
        : [];
    return {
        type: 'CHOICE_REQUESTED',
        payload: {
            playerId: context.ownerPlayerId,
            sourceAbilityId: context.sourceAbilityId ?? 'duel',
            titleKey: duelWon ? 'choices.gunslingerDuel.title' : 'compareRoll.gunslingerDuel.title',
            options,
            compareRoll: {
                contestants: [defender, attacker],
                resultTextKey: duelWon
                    ? 'compareRoll.gunslingerDuel.win'
                    : (defender.roll === attacker.roll && !winOnTie
                        ? 'compareRoll.gunslingerDuel.tieLose'
                        : 'compareRoll.gunslingerDuel.lose'),
                resultTone: duelWon ? 'success' : 'danger',
                ...(duelWon ? {} : {
                    confirmValue: { value: 1, customId: 'gunslinger-duel-lose' },
                }),
            },
        },
        sourceCommandType,
        timestamp,
    };
};

export const buildCompareRollChoiceEvent = (
    context: DiceThroneRollContext,
    timestamp: number,
    sourceCommandType: string,
): ChoiceRequestedEvent | null => {
    if (context.kind !== 'compare') return null;
    const metadata = getCompareMetadata(context);
    if (metadata.compareKind === 'gunslingerShowdown') {
        return buildGunslingerShowdownChoice(context, metadata, timestamp, sourceCommandType);
    }
    if (metadata.compareKind === 'gunslingerDuel') {
        return buildGunslingerDuelChoice(context, metadata, timestamp, sourceCommandType);
    }
    return null;
};

export const getEvasionRollSuccess = (
    context: DiceThroneRollContext,
    value: number,
): boolean => {
    const range = context.settlement.metadata?.evasionSuccessRange;
    const min = Array.isArray(range) && typeof range[0] === 'number' ? range[0] : 1;
    const max = Array.isArray(range) && typeof range[1] === 'number' ? range[1] : 2;
    return value >= min && value <= max;
};

export const getEvasionDamageBeforeRoll = (
    context: DiceThroneRollContext,
): number => {
    const value = context.settlement.metadata?.damageBeforeEvasion;
    return typeof value === 'number' ? value : 0;
};

export const replaceCurrentRollContext = (
    state: DiceThroneCore,
    context: DiceThroneRollContext,
): DiceThroneCore => {
    return {
        ...state,
        currentRollContext: context,
    };
};

/** 临时骰只挂起尚未结算的父骰；父骰在子骰确认前不属于当前骰区。 */
export const openTemporaryRollContext = (
    state: DiceThroneCore,
    context: DiceThroneRollContext,
): DiceThroneCore => {
    const parent = state.currentRollContext ?? (() => {
        const legacyDice = getLegacyActiveDice(state);
        if (state.rollCount <= 0 || legacyDice.length === 0) return undefined;
        return createMainRollContext(state, {
            phase: inferLegacyMainRollPhase(state),
            dice: legacyDice,
        });
    })();
    const canSuspendParent = parent
        && parent.status !== 'settled'
        && parent.display.replayOnly !== true;
    return {
        ...state,
        currentRollContext: canSuspendParent
            ? { ...context, suspendedParent: parent }
            : context,
    };
};

/** 临时骰确认后的内部收口；不生成玩家恢复命令或恢复按钮。 */
export const restoreSuspendedParentRollContext = (
    state: DiceThroneCore,
    contextId: string,
): DiceThroneCore => {
    const current = state.currentRollContext;
    if (!current || current.id !== contextId) return state;
    if (current.suspendedParent) {
        return {
            ...state,
            currentRollContext: current.suspendedParent,
        };
    }
    return clearCurrentRollContext(state, contextId);
};

export const clearCurrentRollContext = (
    state: DiceThroneCore,
    contextId?: string,
): DiceThroneCore => {
    if (!state.currentRollContext) return state;
    if (contextId && state.currentRollContext.id !== contextId) return state;
    const { currentRollContext: _currentRollContext, ...rest } = state;
    return rest as DiceThroneCore;
};

export const getBonusRollContextId = (
    settlement: PendingBonusDiceSettlement | null | undefined,
): string | undefined => settlement ? `bonus:${settlement.id}` : undefined;

/**
 * 迁移期奖励骰仍保留在 pendingBonusDiceSettlement 中，但只有它对应唯一当前上下文时
 * 才能作为当前骰区使用。currentRollContext 缺失时允许旧存档兼容读取。
 */
export const isCurrentBonusRollSettlement = (
    state: DiceThroneCore,
    settlement: PendingBonusDiceSettlement | null | undefined = state.pendingBonusDiceSettlement,
): boolean => {
    if (!settlement) return false;
    const currentContextId = state.currentRollContext?.id;
    return currentContextId === undefined || currentContextId === getBonusRollContextId(settlement);
};

export const isSettledReplayOnlyRollContext = (
    context: DiceThroneRollContext | undefined,
): boolean => context?.status === 'settled' && context.display.replayOnly === true;

const isMainRollPhase = (phase: TurnPhase | undefined): boolean => (
    phase === 'offensiveRoll'
    || phase === 'defensiveRoll'
    || phase === 'targetingRoll'
);

const canRecoverLegacyMainRollFromPhase = (phase: TurnPhase | undefined): boolean => (
    phase === undefined
    || phase === 'main1'
    || phase === 'main2'
);

const getStatePhase = (state: DiceThroneCore): TurnPhase | undefined => {
    const phaseCarrier = state as DiceThroneCore & { turnPhase?: TurnPhase; phase?: TurnPhase };
    return phaseCarrier.turnPhase ?? phaseCarrier.phase;
};

const inferLegacyMainRollPhase = (state: DiceThroneCore): TurnPhase | undefined => {
    const explicitPhase = getStatePhase(state);
    if (isMainRollPhase(explicitPhase)) return explicitPhase;

    const legacyDice = getLegacyActiveDice(state);
    if (state.rollCount <= 0 || state.rollDiceCount <= 0 || legacyDice.length === 0 || state.rollConfirmed !== true) {
        return explicitPhase;
    }

    const pending = state.pendingAttack;
    if (pending?.targetingSelectionPending === true) return 'targetingRoll';
    if (pending?.defenseAbilityId) return 'defensiveRoll';

    const ownerIds = new Set(legacyDice.map(die => die.ownerId).filter((ownerId): ownerId is PlayerId => Boolean(ownerId)));
    if (pending?.defenderId && ownerIds.has(pending.defenderId)) return 'defensiveRoll';
    if (pending?.attackerId && ownerIds.has(pending.attackerId)) return 'offensiveRoll';

    if (!pending && (ownerIds.size === 0 || ownerIds.has(state.activePlayerId))) {
        return 'offensiveRoll';
    }

    if (pending?.sourceAbilityId) return 'offensiveRoll';
    return explicitPhase;
};

export const resolveCurrentRollContext = (
    state: DiceThroneCore,
    phase?: TurnPhase,
): DiceThroneRollContext | undefined => {
    // 已结算的奖励骰/临时骰只读回看仍保存在 currentRollContext，供右侧骰盘展示。
    // 但它不再是可操作骰区；后续改骰牌、重掷牌和掷骰者判断应回到主攻击/防御骰。
    if (state.currentRollContext && !isSettledReplayOnlyRollContext(state.currentRollContext)) {
        return state.currentRollContext;
    }
    const settlement = state.pendingBonusDiceSettlement;
    if (
        settlement
        && isCurrentBonusRollSettlement(state, settlement)
        && getBonusSettlementContextDice(state, settlement).length > 0
    ) {
        return createBonusRollContextFromSettlement(state, settlement);
    }
    const legacyPhase = isMainRollPhase(phase)
        ? phase
        : canRecoverLegacyMainRollFromPhase(phase)
            ? inferLegacyMainRollPhase(state)
            : phase;
    if (!isMainRollPhase(legacyPhase)) {
        if (legacyPhase !== undefined || state.currentRollContext) return undefined;
    }
    const dice = getLegacyActiveDice(state);
    if (dice.length === 0) return undefined;
    return createMainRollContext(state, {
        phase: legacyPhase,
        ownerPlayerId: inferRollOwnerId(state, legacyPhase),
        dice,
    });
};

export const getCurrentRollDice = (
    state: DiceThroneCore,
    phase?: TurnPhase,
): Die[] => resolveCurrentRollContext(state, phase)?.dice ?? [];

export const getCurrentRollOwnerId = (
    state: DiceThroneCore,
    phase?: TurnPhase,
): PlayerId => resolveCurrentRollContext(state, phase)?.ownerPlayerId ?? inferRollOwnerId(state, phase);

export const findCurrentRollDie = (
    state: DiceThroneCore,
    dieId: number | undefined,
    phase?: TurnPhase,
): { die: Die; index: number } | undefined => {
    if (!Number.isInteger(dieId)) return undefined;
    const dice = getCurrentRollDice(state, phase);
    const index = dice.findIndex((die) => die.id === dieId);
    return index >= 0 ? { die: dice[index], index } : undefined;
};

export const setCurrentRollContextDice = (
    state: DiceThroneCore,
    dice: Die[],
): DiceThroneCore => {
    if (!state.currentRollContext) return state;
    return {
        ...state,
        currentRollContext: {
            ...state.currentRollContext,
            dice,
        },
    };
};

export const markCurrentRollContextStatus = (
    state: DiceThroneCore,
    status: DiceThroneRollContext['status'],
): DiceThroneCore => {
    if (!state.currentRollContext) return state;
    return {
        ...state,
        currentRollContext: {
            ...state.currentRollContext,
            status,
        },
    };
};
