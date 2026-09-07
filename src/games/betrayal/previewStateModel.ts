import type {
  BetrayalCore,
  BetrayalRoomNode,
  BetrayalRoomTileAdjustmentSelection,
  BetrayalTraitKey,
} from "./game";
import { resolveMoveTargetRooms } from "./movementReadModel";
import {
  canUseHolySymbolForDiscovery,
  canUseSkeletonKeyForMove,
} from "./possessionActionReadModel";
import {
  canUseDogForTrade,
  resolveDogTradeTargets,
  resolveSelectedDogTradeCardIds,
  resolveSelectedTradeGiveCardIds,
  resolveSelectedTradeTargetPlayerId,
  resolveTradeTargets,
} from "./trade";
import {
  resolveRoomPlacementPreview,
  resolveRoomTileAdjustmentOptions,
} from "./roomDiscoveryModel";
import {
  roomTileAdjustmentSelectionsMatch,
  toRoomTileAdjustmentSelection,
  type RoomOrientationTurns,
} from "./roomMapModel";

export type PreviewState = {
  selectedInventoryCardId: string | null;
  lastUsedInventoryCardId: string | null;
  selectedTradeTargetPlayerId: string | null;
  selectedCorpseLootCardId: string | null;
  selectedTradeGiveCardIds: string[];
  selectedDogTradeCardIds: string[];
  selectedTradeReturnCardIds: string[];
  selectedAttackWeaponCardId: string | null;
  selectedInventoryTargetPlayerId: string | null;
  selectedInventoryTargetRoomId: string | null;
  selectedInventoryReplacementRollTotal: number | null;
  selectedRollModifierDieIndex: number | null;
  selectedMaskTargetRoomIdsByTokenId: Record<string, string>;
  activeMaskTargetTokenId: string | null;
  selectedEventTrait: BetrayalTraitKey | null;
  selectedEventCardId: string | null;
  selectedDustSearchTrait: BetrayalTraitKey | null;
  selectedDustCureTrait: BetrayalTraitKey | null;
  selectedEventTargetRoomId: string | null;
  selectedEventDamageTraits: BetrayalTraitKey[];
  selectedDamageAllocationTraits: BetrayalTraitKey[];
  useBroochForDamageAllocation: boolean;
  useHolySymbolForExplore: boolean;
  useIdolForExplore: boolean;
  ignoreEventSymbolWithTraitorPower: boolean;
  pendingRoomPlacementSlotId: string | null;
  pendingRoomPlacementFailure: {
    roomId: string;
    floor: BetrayalRoomNode["floor"];
  } | null;
  pendingRoomOrientationTurns: RoomOrientationTurns;
  pendingRoomTileAdjustment: BetrayalRoomTileAdjustmentSelection | null;
  tradeSelectionTouched: boolean;
  dismissedLatestDiscoveryKey: string | null;
  dismissedRecentRollId: string | null;
  interactionMode:
    | "default"
    | "move"
    | "explore"
    | "sicknessExchange"
    | "helpingHandsTrollMove"
    | "monsterMove"
    | "monsterAttack"
    | "bloodFromStoneSetupPlacement"
    | "bloodFromStoneMonsterTurnEnd";
  hauntTargetingActionKind: string | null;
  selectedHelpingHandsTrollHandMoveMonsterId: string | null;
  selectedMonsterMoveMonsterId: string | null;
  selectedMonsterAttackMonsterId: string | null;
  selectedPeekabooSameRoomMonsterId: string | null;
  selectedPeekabooLineOfSightMonsterId: string | null;
  selectedBloodFromStoneStoneCherubRoomIds: string[];
};

export function createInitialPreviewState(_core: BetrayalCore): PreviewState {
  return {
    selectedInventoryCardId: null,
    lastUsedInventoryCardId: null,
    selectedTradeTargetPlayerId: null,
    selectedCorpseLootCardId: null,
    selectedTradeGiveCardIds: [],
    selectedDogTradeCardIds: [],
    selectedTradeReturnCardIds: [],
    selectedAttackWeaponCardId: null,
    selectedInventoryTargetPlayerId: null,
    selectedInventoryTargetRoomId: null,
    selectedInventoryReplacementRollTotal: null,
    selectedRollModifierDieIndex: null,
    selectedMaskTargetRoomIdsByTokenId: {},
    activeMaskTargetTokenId: null,
    selectedEventTrait: null,
    selectedEventCardId: null,
    selectedDustSearchTrait: null,
    selectedDustCureTrait: null,
    selectedEventTargetRoomId: null,
    selectedEventDamageTraits: [],
    selectedDamageAllocationTraits: [],
    useBroochForDamageAllocation: false,
    useHolySymbolForExplore: false,
    useIdolForExplore: false,
    ignoreEventSymbolWithTraitorPower: false,
    pendingRoomPlacementSlotId: null,
    pendingRoomPlacementFailure: null,
    pendingRoomOrientationTurns: 0,
    pendingRoomTileAdjustment: null,
    tradeSelectionTouched: false,
    dismissedLatestDiscoveryKey: null,
    dismissedRecentRollId: null,
    interactionMode: "default",
    hauntTargetingActionKind: null,
    selectedHelpingHandsTrollHandMoveMonsterId: null,
    selectedMonsterMoveMonsterId: null,
    selectedMonsterAttackMonsterId: null,
    selectedPeekabooSameRoomMonsterId: null,
    selectedPeekabooLineOfSightMonsterId: null,
    selectedBloodFromStoneStoneCherubRoomIds: [],
  };
}

export function resolvePreservedExplorePlacementState(
  core: BetrayalCore,
  previousState: PreviewState,
): Partial<PreviewState> | null {
  if (
    previousState.interactionMode !== "explore" ||
    !previousState.pendingRoomPlacementSlotId
  ) {
    return null;
  }
  const useHolySymbol =
    previousState.useHolySymbolForExplore && canUseHolySymbolForDiscovery(core);
  const placementPreview = resolveRoomPlacementPreview(core, {
    roomId: previousState.pendingRoomPlacementSlotId,
    useHolySymbol,
  });
  if (!placementPreview) {
    return null;
  }
  const selectedOrientationOption =
    placementPreview.orientationOptions.find(
      (option) =>
        option.orientationTurns === previousState.pendingRoomOrientationTurns,
    ) ??
    placementPreview.orientationOptions.find(
      (option) =>
        option.orientationTurns === placementPreview.defaultOrientationTurns,
    ) ??
    placementPreview.orientationOptions[0] ??
    null;
  const orientationTurns =
    selectedOrientationOption?.orientationTurns ??
    placementPreview.defaultOrientationTurns;
  const tileAdjustmentOption =
    previousState.pendingRoomTileAdjustment &&
    placementPreview.requiresTileAdjustment
      ? (resolveRoomTileAdjustmentOptions(core, {
          roomId: placementPreview.slotId,
          orientationTurns,
          useHolySymbol,
        }).find((option) =>
          roomTileAdjustmentSelectionsMatch(
            option,
            previousState.pendingRoomTileAdjustment!,
          ),
        ) ?? null)
      : null;
  return {
    interactionMode: "explore",
    useHolySymbolForExplore: useHolySymbol,
    useIdolForExplore: false,
    ignoreEventSymbolWithTraitorPower: false,
    pendingRoomPlacementSlotId: placementPreview.slotId,
    pendingRoomPlacementFailure: null,
    pendingRoomOrientationTurns: orientationTurns,
    pendingRoomTileAdjustment: tileAdjustmentOption
      ? toRoomTileAdjustmentSelection(tileAdjustmentOption)
    : null,
  };
}

export function resolveNextPreviewStateAfterCoreChange(
  core: BetrayalCore,
  previousState: PreviewState,
): PreviewState {
  const nextInitialState = createInitialPreviewState(core);
  const hasActiveTradeDraft =
    previousState.tradeSelectionTouched ||
    previousState.selectedTradeTargetPlayerId !== null ||
    previousState.selectedTradeGiveCardIds.length > 0 ||
    previousState.selectedDogTradeCardIds.length > 0 ||
    previousState.selectedTradeReturnCardIds.length > 0;
  if (core.recommendedAction === "trade" || hasActiveTradeDraft) {
    if (
      core.pendingTradeAgreement ||
      core.tradeUsedThisTurnPlayerIds.includes(core.currentExplorer.playerId)
    ) {
      return nextInitialState;
    }
    const tradeTargets = resolveTradeTargets(core);
    const canUseDogTrade = canUseDogForTrade(core);
    const dogTradeTargets = canUseDogTrade ? resolveDogTradeTargets(core) : [];
    const activeTradeTargets =
      canUseDogTrade && dogTradeTargets.length > 0
        ? dogTradeTargets
        : tradeTargets;
    const nextSelectedTradeTargetPlayerId =
      resolveSelectedTradeTargetPlayerId(
        activeTradeTargets,
        previousState.selectedTradeTargetPlayerId,
      );
    const nextSelectedTradeTarget =
      activeTradeTargets.find(
        (explorer) => explorer.playerId === nextSelectedTradeTargetPlayerId,
      ) ?? null;
    const usedCardIds = new Set(core.usedCardIdsThisTurn);
    const nextSelectedTradeGiveCardIds = resolveSelectedTradeGiveCardIds(
      core.currentExplorerInventory,
      previousState.selectedTradeGiveCardIds,
      core.usedCardIdsThisTurn,
    );
    const nextSelectedDogTradeCardIds = resolveSelectedDogTradeCardIds(
      core.currentExplorerInventory,
      previousState.selectedDogTradeCardIds,
    ).filter((cardId) => !usedCardIds.has(cardId));
    const nextTargetInventoryIds = new Set(
      nextSelectedTradeTarget?.inventory.map((card) => card.id) ?? [],
    );
    const nextSelectedTradeReturnCardIds =
      nextSelectedTradeTarget === null
        ? []
        : previousState.selectedTradeReturnCardIds.filter(
            (cardId) =>
              nextTargetInventoryIds.has(cardId) && !usedCardIds.has(cardId),
          );
    return {
      ...nextInitialState,
      selectedInventoryCardId: null,
      selectedTradeTargetPlayerId: nextSelectedTradeTargetPlayerId,
      selectedTradeGiveCardIds: nextSelectedTradeGiveCardIds,
      selectedDogTradeCardIds: nextSelectedDogTradeCardIds,
      selectedTradeReturnCardIds: nextSelectedTradeReturnCardIds,
      tradeSelectionTouched:
        previousState.tradeSelectionTouched ||
        nextSelectedTradeTargetPlayerId !== null ||
        nextSelectedTradeGiveCardIds.length > 0 ||
        nextSelectedDogTradeCardIds.length > 0 ||
        nextSelectedTradeReturnCardIds.length > 0,
    };
  }
  const preservedLastUsedInventoryCardId =
    previousState.lastUsedInventoryCardId &&
    core.usedCardIdsThisTurn.includes(previousState.lastUsedInventoryCardId)
      ? previousState.lastUsedInventoryCardId
      : null;
  const preservedExplorePlacementState = resolvePreservedExplorePlacementState(
    core,
    previousState,
  );
  if (preservedExplorePlacementState) {
    return {
      ...nextInitialState,
      ...preservedExplorePlacementState,
      lastUsedInventoryCardId: preservedLastUsedInventoryCardId,
      dismissedLatestDiscoveryKey: previousState.dismissedLatestDiscoveryKey,
      dismissedRecentRollId: previousState.dismissedRecentRollId,
    };
  }
  const canContinueMoveMode =
    previousState.interactionMode === "move" &&
    core.movesRemaining > 0 &&
    (resolveMoveTargetRooms(core).length > 0 ||
      core.rooms.some((room) => canUseSkeletonKeyForMove(core, room.id)));
  const nextInteractionMode = canContinueMoveMode
    ? "move"
    : nextInitialState.interactionMode;
  if (
    core.currentExplorerInventory.some(
      (card) => card.id === previousState.selectedInventoryCardId,
    )
  ) {
    return {
      ...nextInitialState,
      interactionMode: nextInteractionMode,
      selectedInventoryCardId: previousState.selectedInventoryCardId,
      lastUsedInventoryCardId: preservedLastUsedInventoryCardId,
      dismissedLatestDiscoveryKey: previousState.dismissedLatestDiscoveryKey,
      dismissedRecentRollId: previousState.dismissedRecentRollId,
    };
  }
  return {
    ...nextInitialState,
    interactionMode: nextInteractionMode,
    lastUsedInventoryCardId: preservedLastUsedInventoryCardId,
    dismissedLatestDiscoveryKey: previousState.dismissedLatestDiscoveryKey,
    dismissedRecentRollId: previousState.dismissedRecentRollId,
  };
}
