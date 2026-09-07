import type {
    BetrayalCore,
    BetrayalExplorerSummary,
    BetrayalInventoryCard,
} from './game';
import { cloneInventoryCard } from './possessionDeckModel';
import { resolveInventoryEffectId } from './possessionEffects';
import { roomDistanceByLayout } from './roomMapModel';

export interface BetrayalTradePossessionCommandPayload {
    cardId?: string;
    cardIds?: string[];
    targetCardIds?: string[];
    targetPlayerId?: string;
    useDog?: boolean;
}

export interface BetrayalTradeCardStatus {
    sourceKind: 'trade';
    cardId: string;
    cardName: string;
    ownerPlayerId: string;
    ownerRole: 'requester' | 'target';
    exists: boolean;
    canTrade: boolean;
    usedThisTurn: boolean;
    reservedAsTradeSource: boolean;
    reason: string | null;
}

export interface BetrayalTradeRequestedPayload {
    playerId: string;
    targetPlayerId: string;
    cardId: string;
    cardIds: string[];
    targetCardIds: string[];
    sourceCardId?: string;
    useDog?: boolean;
    logText: string;
}

export interface BetrayalTradeDeclinedPayload {
    playerId: string;
    targetPlayerId: string;
    cardIds: string[];
    targetCardIds?: string[];
    logText: string;
}

export interface BetrayalTradeAcceptedPayload {
    playerId: string;
    targetPlayerId: string;
    cardId: string;
    cardIds: string[];
    targetCardIds: string[];
    sourceCardId?: string;
    logText: string;
}

function findTradeExplorerByPlayerId(core: BetrayalCore, playerId: string): BetrayalExplorerSummary | null {
    if (core.currentExplorer.playerId === playerId) {
        return core.currentExplorer;
    }
    return core.otherExplorers.find((explorer) => explorer.playerId === playerId) ?? null;
}

export function resolveTradeTargets(core: BetrayalCore): BetrayalExplorerSummary[] {
    return core.otherExplorers.filter((explorer) => (
        explorer.roomId === core.activeRoomId
        && !core.scenarioRuntime.deadExplorerPlayerIds.includes(explorer.playerId)
    ));
}

export function canUseDogForTrade(core: BetrayalCore): boolean {
    const dog = core.currentExplorer.inventory.find((card) => resolveInventoryEffectId(card.id) === 'dog');
    return Boolean(
        dog
        && core.turnStartInventoryCardIds.some((cardId) => resolveInventoryEffectId(cardId) === 'dog')
        && !core.usedCardIdsThisTurn.includes(dog.id),
    );
}

export function resolveDogTradeSourceCardId(core: BetrayalCore): string | null {
    return core.currentExplorer.inventory.find((card) => resolveInventoryEffectId(card.id) === 'dog')?.id ?? null;
}

export function resolveDogTradeTargets(core: BetrayalCore): BetrayalExplorerSummary[] {
    if (!canUseDogForTrade(core)) {
        return [];
    }
    const sourceRoom = core.rooms.find((room) => room.id === core.currentExplorer.roomId);
    if (!sourceRoom) {
        return [];
    }
    return core.otherExplorers.filter((explorer) => {
        if (core.scenarioRuntime.deadExplorerPlayerIds.includes(explorer.playerId)) {
            return false;
        }
        const targetRoom = core.rooms.find((room) => room.id === explorer.roomId);
        return Boolean(targetRoom && roomDistanceByLayout(sourceRoom, targetRoom) <= 4);
    });
}

export function resolveBetrayalTradeCardStatus(
    core: BetrayalCore,
    cardId: string,
    options: {
        ownerPlayerId?: string;
        ownerRole?: 'requester' | 'target';
        useDogTrade?: boolean;
    } = {},
): BetrayalTradeCardStatus {
    const ownerPlayerId = options.ownerPlayerId ?? core.currentExplorer.playerId;
    const ownerRole = options.ownerRole ?? 'requester';
    const owner = findTradeExplorerByPlayerId(core, ownerPlayerId);
    const card = owner?.inventory.find((item) => item.id === cardId);
    const usedThisTurn = core.usedCardIdsThisTurn.includes(cardId);
    const reservedAsTradeSource = Boolean(
        options.useDogTrade
        && ownerRole === 'requester'
        && resolveInventoryEffectId(cardId) === 'dog',
    );
    let reason: string | null = null;
    if (!card) {
        reason = ownerRole === 'target' ? '交易对象没有这件持有物。' : '当前探索者没有这件持有物。';
    } else if (reservedAsTradeSource || usedThisTurn) {
        reason = '本回合已经使用过的持有物不能交易。';
    }

    return {
        sourceKind: 'trade',
        cardId,
        cardName: card?.name ?? cardId,
        ownerPlayerId,
        ownerRole,
        exists: Boolean(card),
        canTrade: reason === null,
        usedThisTurn,
        reservedAsTradeSource,
        reason,
    };
}

export function resolveTradeCardIds(payload: BetrayalTradePossessionCommandPayload): string[] {
    const cardIds = payload.cardIds?.length ? payload.cardIds : [payload.cardId].filter(Boolean);
    return Array.from(new Set(cardIds)) as string[];
}

function formatTradePossessionSummary(
    requesterName: string,
    targetName: string,
    cards: BetrayalInventoryCard[],
    targetCards: BetrayalInventoryCard[],
): string {
    const parts: string[] = [];
    if (cards.length > 0) {
        parts.push(`${requesterName}给出${cards.map((card) => card.name).join('、')}`);
    }
    if (targetCards.length > 0) {
        parts.push(`${targetName}给出${targetCards.map((card) => card.name).join('、')}`);
    }
    return parts.join('，');
}

export function createBetrayalTradeRequestedPayload(
    core: BetrayalCore,
    playerId: string,
    payload: BetrayalTradePossessionCommandPayload,
): BetrayalTradeRequestedPayload | null {
    const cardIds = resolveTradeCardIds(payload);
    const targetCardIds = Array.from(new Set(payload.targetCardIds ?? []));
    const cards = cardIds
        .map((cardId) => core.currentExplorer.inventory.find((item) => item.id === cardId))
        .filter((card): card is BetrayalInventoryCard => Boolean(card));
    const tradeTargets = payload.useDog ? resolveDogTradeTargets(core) : resolveTradeTargets(core);
    const target = tradeTargets.find((item) => item.playerId === payload.targetPlayerId);
    if (!target) {
        return null;
    }
    const targetCards = targetCardIds
        .map((cardId) => target.inventory.find((item) => item.id === cardId))
        .filter((card): card is BetrayalInventoryCard => Boolean(card));
    const dogSourceCardId = payload.useDog ? resolveDogTradeSourceCardId(core) ?? undefined : undefined;
    const tradeRequestDetail = formatTradePossessionSummary(
        core.currentExplorer.displayName,
        target.displayName,
        cards,
        targetCards,
    );
    return {
        playerId,
        targetPlayerId: target.playerId,
        cardId: cards[0]?.id ?? targetCards[0]!.id,
        cardIds: cards.map((card) => card.id),
        targetCardIds: targetCards.map((card) => card.id),
        sourceCardId: dogSourceCardId,
        useDog: payload.useDog,
        logText: payload.useDog
            ? `${core.currentExplorer.displayName}请${target.displayName}同意用狗交易：${tradeRequestDetail}`
            : `${core.currentExplorer.displayName}请${target.displayName}同意交易：${tradeRequestDetail}`,
    };
}

export function resolveBetrayalTradeAgreementEventPayload(
    core: BetrayalCore,
    accepted: boolean,
): { kind: 'accepted'; payload: BetrayalTradeAcceptedPayload } | { kind: 'declined'; payload: BetrayalTradeDeclinedPayload } | null {
    const pending = core.pendingTradeAgreement;
    if (!pending) {
        return null;
    }
    const requester = findTradeExplorerByPlayerId(core, pending.playerId) ?? core.currentExplorer;
    const target = findTradeExplorerByPlayerId(core, pending.targetPlayerId);
    if (!target) {
        return null;
    }
    const cards = pending.cardIds
        .map((cardId) => requester.inventory.find((item) => item.id === cardId))
        .filter((card): card is BetrayalInventoryCard => Boolean(card));
    const targetCards = pending.targetCardIds
        .map((cardId) => target.inventory.find((item) => item.id === cardId))
        .filter((card): card is BetrayalInventoryCard => Boolean(card));
    if (!accepted) {
        return {
            kind: 'declined',
            payload: {
                playerId: pending.playerId,
                targetPlayerId: pending.targetPlayerId,
                cardIds: [...pending.cardIds],
                targetCardIds: [...pending.targetCardIds],
                logText: `${target.displayName}拒绝了${requester.displayName}的交易请求`,
            },
        };
    }
    if (cards.length !== pending.cardIds.length || targetCards.length !== pending.targetCardIds.length) {
        return {
            kind: 'declined',
            payload: {
                playerId: pending.playerId,
                targetPlayerId: pending.targetPlayerId,
                cardIds: [...pending.cardIds],
                targetCardIds: [...pending.targetCardIds],
                logText: `${requester.displayName}的交易请求已失效`,
            },
        };
    }
    const tradeResultDetail = formatTradePossessionSummary(
        requester.displayName,
        target.displayName,
        cards,
        targetCards,
    );
    return {
        kind: 'accepted',
        payload: {
            playerId: pending.playerId,
            targetPlayerId: pending.targetPlayerId,
            cardId: pending.cardIds[0] ?? pending.targetCardIds[0]!,
            cardIds: [...pending.cardIds],
            targetCardIds: [...pending.targetCardIds],
            sourceCardId: pending.sourceCardId,
            logText: pending.useDog
                ? `${target.displayName}同意交易，${requester.displayName}使用狗完成交易：${tradeResultDetail}`
                : `${target.displayName}同意交易：${tradeResultDetail}`,
        },
    };
}

export function createBetrayalPendingTradeAgreement(
    payload: BetrayalTradeRequestedPayload,
    timestamp: number,
): BetrayalCore['pendingTradeAgreement'] {
    return {
        id: `trade-${payload.playerId}-${payload.targetPlayerId}-${timestamp}`,
        playerId: payload.playerId,
        targetPlayerId: payload.targetPlayerId,
        cardIds: [...payload.cardIds],
        targetCardIds: [...(payload.targetCardIds ?? [])],
        useDog: payload.useDog,
        sourceCardId: payload.sourceCardId,
    };
}

export function applyBetrayalTradeAcceptedState(
    core: BetrayalCore,
    payload: BetrayalTradeAcceptedPayload,
): { requesterPlayerId: string } | null {
    const cardIds = payload.cardIds ?? [payload.cardId];
    const targetCardIds = payload.targetCardIds ?? [];
    const requester = findTradeExplorerByPlayerId(core, payload.playerId);
    const target = findTradeExplorerByPlayerId(core, payload.targetPlayerId);
    if (!requester || !target) {
        return null;
    }
    const cards = cardIds
        .map((cardId) => requester.inventory.find((item) => item.id === cardId))
        .filter((card): card is BetrayalInventoryCard => Boolean(card));
    const targetCards = targetCardIds
        .map((cardId) => target.inventory.find((item) => item.id === cardId))
        .filter((card): card is BetrayalInventoryCard => Boolean(card));
    if (cards.length !== cardIds.length || targetCards.length !== targetCardIds.length || (cards.length === 0 && targetCards.length === 0)) {
        return null;
    }
    core.pendingTradeAgreement = null;
    core.activePlayerId = null;
    const transferredIds = new Set(cards.map((card) => card.id));
    const receivedIds = new Set(targetCards.map((card) => card.id));
    requester.inventory = [
        ...requester.inventory.filter((item) => !transferredIds.has(item.id)),
        ...targetCards.map(cloneInventoryCard),
    ];
    target.inventory = [
        ...target.inventory.filter((item) => !receivedIds.has(item.id)),
        ...cards.map(cloneInventoryCard),
    ];
    core.receivedCardIdsThisTurnByPlayerId = {
        ...core.receivedCardIdsThisTurnByPlayerId,
        [requester.playerId]: Array.from(new Set([
            ...(core.receivedCardIdsThisTurnByPlayerId[requester.playerId] ?? []),
            ...targetCards.map((card) => card.id),
        ])),
        [target.playerId]: Array.from(new Set([
            ...(core.receivedCardIdsThisTurnByPlayerId[target.playerId] ?? []),
            ...cards.map((card) => card.id),
        ])),
    };
    if (payload.sourceCardId) {
        core.usedCardIdsThisTurn = Array.from(new Set([
            ...core.usedCardIdsThisTurn,
            payload.sourceCardId,
        ]));
    }
    return { requesterPlayerId: requester.playerId };
}

export function clearBetrayalPendingTradeAgreement(core: BetrayalCore): void {
    core.pendingTradeAgreement = null;
    core.activePlayerId = null;
}

export function resolveSelectedTradeTargetPlayerId(
    tradeTargets: BetrayalExplorerSummary[],
    selectedTradeTargetPlayerId: string | null,
): string | null {
    if (
        selectedTradeTargetPlayerId
        && tradeTargets.some((explorer) => explorer.playerId === selectedTradeTargetPlayerId)
    ) {
        return selectedTradeTargetPlayerId;
    }
    return null;
}

export function resolveSelectedDogTradeCardIds(
    inventory: BetrayalCore['currentExplorerInventory'],
    selectedCardIds: string[],
): string[] {
    const inventoryCardIds = new Set(inventory.map((card) => card.id));
    return selectedCardIds.filter(
        (cardId) => inventoryCardIds.has(cardId) && cardId !== 'dog',
    );
}

export function resolveSelectedTradeGiveCardIds(
    inventory: BetrayalCore['currentExplorerInventory'],
    selectedCardIds: string[],
    usedCardIdsThisTurn: string[],
): string[] {
    const inventoryCardIds = new Set(inventory.map((card) => card.id));
    const usedCardIds = new Set(usedCardIdsThisTurn);
    return selectedCardIds.filter(
        (cardId) => inventoryCardIds.has(cardId) && !usedCardIds.has(cardId),
    );
}

export interface BetrayalTradeSelectionReadModel {
    tradeTargets: BetrayalExplorerSummary[];
    canUseDogTrade: boolean;
    dogTradeTargets: BetrayalExplorerSummary[];
    activeTradeTargets: BetrayalExplorerSummary[];
    selectedTradeTargetPlayerId: string | null;
    selectedTradeTarget: BetrayalExplorerSummary | null;
    selectedTradeReturnCardIds: string[];
    selectedTradeReturnCards: BetrayalInventoryCard[];
    selectedTradeGiveCardIds: string[];
    selectedTradeGiveCards: BetrayalInventoryCard[];
    selectedDogTradeCardIds: string[];
    selectedDogTradeCards: BetrayalInventoryCard[];
    selectedNormalTradeGiveCardNames: string;
    selectedDogTradeCardNames: string;
    selectedTradeGiveCardNames: string;
    selectedTradeGiveText: string;
    selectedTradeReturnText: string;
    dogTradeFlowActive: boolean;
    useDogTrade: boolean;
    tradeSelectionReady: boolean;
}

export function resolveBetrayalTradeSelectionReadModel({
    core,
    selectedTradeTargetPlayerId,
    selectedTradeReturnCardIds,
    selectedTradeGiveCardIds,
    selectedDogTradeCardIds,
}: {
    core: BetrayalCore;
    selectedTradeTargetPlayerId: string | null;
    selectedTradeReturnCardIds: string[];
    selectedTradeGiveCardIds: string[];
    selectedDogTradeCardIds: string[];
}): BetrayalTradeSelectionReadModel {
    const tradeTargets = resolveTradeTargets(core);
    const canUseDogTrade = canUseDogForTrade(core);
    const dogTradeTargets = resolveDogTradeTargets(core);
    const activeTradeTargets =
        canUseDogTrade && dogTradeTargets.length > 0
            ? dogTradeTargets
            : tradeTargets;
    const normalizedTradeTargetPlayerId = resolveSelectedTradeTargetPlayerId(
        activeTradeTargets,
        selectedTradeTargetPlayerId,
    );
    const selectedTradeTarget =
        activeTradeTargets.find(
            (explorer) => explorer.playerId === normalizedTradeTargetPlayerId,
        ) ?? null;
    const normalizedTradeReturnCardIds = selectedTradeTarget
        ? selectedTradeReturnCardIds.filter((cardId) =>
            selectedTradeTarget.inventory.some((card) => card.id === cardId),
        )
        : [];
    const selectedTradeReturnCards =
        selectedTradeTarget?.inventory.filter((card) =>
            normalizedTradeReturnCardIds.includes(card.id),
        ) ?? [];
    const normalizedTradeGiveCardIds = resolveSelectedTradeGiveCardIds(
        core.currentExplorerInventory,
        selectedTradeGiveCardIds,
        core.usedCardIdsThisTurn,
    );
    const selectedTradeGiveCards = core.currentExplorerInventory.filter(
        (card) => normalizedTradeGiveCardIds.includes(card.id),
    );
    const normalizedDogTradeCardIds = resolveSelectedDogTradeCardIds(
        core.currentExplorerInventory,
        selectedDogTradeCardIds,
    );
    const selectedDogTradeCards = core.currentExplorerInventory.filter((card) =>
        normalizedDogTradeCardIds.includes(card.id),
    );
    const selectedNormalTradeGiveCardNames = selectedTradeGiveCards
        .map((card) => card.name)
        .join('、');
    const selectedDogTradeCardNames = selectedDogTradeCards
        .map((card) => card.name)
        .join('、');
    const selectedTradeReturnText = selectedTradeReturnCards
        .map((card) => card.name)
        .join('、');
    const dogTradeFlowActive = canUseDogTrade && dogTradeTargets.length > 0;
    const selectedTargetNeedsDogTrade = Boolean(
        selectedTradeTarget &&
        dogTradeTargets.some(
            (target) => target.playerId === selectedTradeTarget.playerId,
        ) &&
        !tradeTargets.some(
            (target) => target.playerId === selectedTradeTarget.playerId,
        ),
    );
    const useDogTrade =
        dogTradeFlowActive &&
        (normalizedDogTradeCardIds.length > 0 ||
            (selectedTargetNeedsDogTrade &&
                normalizedTradeReturnCardIds.length > 0));
    const selectedTradeGiveCardNames = useDogTrade
        ? selectedDogTradeCardNames
        : selectedNormalTradeGiveCardNames;
    const tradeSelectionReady = Boolean(
        selectedTradeTarget &&
        (normalizedTradeGiveCardIds.length > 0 ||
            normalizedDogTradeCardIds.length > 0 ||
            normalizedTradeReturnCardIds.length > 0),
    );

    return {
        tradeTargets,
        canUseDogTrade,
        dogTradeTargets,
        activeTradeTargets,
        selectedTradeTargetPlayerId: normalizedTradeTargetPlayerId,
        selectedTradeTarget,
        selectedTradeReturnCardIds: normalizedTradeReturnCardIds,
        selectedTradeReturnCards,
        selectedTradeGiveCardIds: normalizedTradeGiveCardIds,
        selectedTradeGiveCards,
        selectedDogTradeCardIds: normalizedDogTradeCardIds,
        selectedDogTradeCards,
        selectedNormalTradeGiveCardNames,
        selectedDogTradeCardNames,
        selectedTradeGiveCardNames,
        selectedTradeGiveText: selectedTradeGiveCardNames,
        selectedTradeReturnText,
        dogTradeFlowActive,
        useDogTrade,
        tradeSelectionReady,
    };
}

export interface BetrayalTradeDraftReadModel {
    hasUsedTradeThisTurn: boolean;
    hasTradeDraftSelection: boolean;
    isTradeDraftActive: boolean;
    isTradeOrLootTargetSelectionActive: boolean;
    shouldStartDustSicknessExchange: boolean;
    hasTradeOfferCards: boolean;
    hasTradeReturnCards: boolean;
    hasAnyTradeSelectableCards: boolean;
}

export function resolveBetrayalTradeDraftReadModel({
    core,
    selectedTradeTarget,
    selectedTradeGiveCardIds,
    selectedDogTradeCardIds,
    selectedTradeReturnCardIds,
    activeTradeTargets,
    tradeSelectionTouched,
    hasPendingTradeAgreement,
    hasPendingSicknessExchange,
    hasPendingMummyReward,
    hasPendingHelpingHandsReward,
    isDustSicknessExchangeMode,
    isDustSicknessExchangeAvailable,
    hasSelectedCorpseLootTarget,
}: {
    core: BetrayalCore;
    selectedTradeTarget: BetrayalExplorerSummary | null;
    selectedTradeGiveCardIds: readonly string[];
    selectedDogTradeCardIds: readonly string[];
    selectedTradeReturnCardIds: readonly string[];
    activeTradeTargets: readonly BetrayalExplorerSummary[];
    tradeSelectionTouched: boolean;
    hasPendingTradeAgreement: boolean;
    hasPendingSicknessExchange: boolean;
    hasPendingMummyReward: boolean;
    hasPendingHelpingHandsReward: boolean;
    isDustSicknessExchangeMode: boolean;
    isDustSicknessExchangeAvailable: boolean;
    hasSelectedCorpseLootTarget: boolean;
}): BetrayalTradeDraftReadModel {
    const hasUsedTradeThisTurn = core.tradeUsedThisTurnPlayerIds.includes(
        core.currentExplorer.playerId,
    );
    const hasTradeDraftSelection =
        selectedTradeGiveCardIds.length > 0 ||
        selectedDogTradeCardIds.length > 0 ||
        selectedTradeReturnCardIds.length > 0 ||
        hasSelectedCorpseLootTarget;
    const isTradeDraftActive = Boolean(
        !hasPendingTradeAgreement &&
        !hasPendingSicknessExchange &&
        !hasPendingMummyReward &&
        !hasPendingHelpingHandsReward &&
        !isDustSicknessExchangeMode &&
        !hasSelectedCorpseLootTarget &&
        !hasUsedTradeThisTurn &&
        (core.recommendedAction === 'trade' ||
            tradeSelectionTouched ||
            Boolean(selectedTradeTarget) ||
            selectedTradeGiveCardIds.length > 0 ||
            selectedDogTradeCardIds.length > 0 ||
            selectedTradeReturnCardIds.length > 0),
    );
    const isTradeOrLootTargetSelectionActive =
        isTradeDraftActive || tradeSelectionTouched || hasSelectedCorpseLootTarget;
    const shouldStartDustSicknessExchange =
        isDustSicknessExchangeAvailable && !hasTradeDraftSelection;
    const hasTradeOfferCards = core.currentExplorerInventory.some(
        (card) => !core.usedCardIdsThisTurn.includes(card.id),
    );
    const hasTradeReturnCards = activeTradeTargets.some((target) =>
        target.inventory.some(
            (card) => !core.usedCardIdsThisTurn.includes(card.id),
        ),
    );

    return {
        hasUsedTradeThisTurn,
        hasTradeDraftSelection,
        isTradeDraftActive,
        isTradeOrLootTargetSelectionActive,
        shouldStartDustSicknessExchange,
        hasTradeOfferCards,
        hasTradeReturnCards,
        hasAnyTradeSelectableCards: hasTradeOfferCards || hasTradeReturnCards,
    };
}
