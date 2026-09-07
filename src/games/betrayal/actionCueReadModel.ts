import { BETRAYAL_COMMANDS } from "./commands";
import type {
  BetrayalCore,
  BetrayalExplorerSummary,
  BetrayalRoomNode,
  BetrayalRoomPlacementPreview,
} from "./game";
import type { BetrayalHauntActionContext } from "./hauntActionContextReadModel";
import type {
  BetrayalHelpingHandsTrollHandMoveEntry,
  BetrayalMonsterAttackEntry,
  BetrayalMonsterMoveEntry,
} from "./monsterActionSelectionReadModel";
import type { PreviewState } from "./previewStateModel";
import { formatRoomTargetList, resolveFloorLabel } from "./roomMapModel";

type ActionText = (key: string, options?: Record<string, unknown>) => string;

type MoveCueSummary = {
  monsterName: string;
  targetRoomNames: readonly string[];
  targetListText: string;
} | null;

type MonsterAttackCueSummary = {
  monsterName: string;
  targetPlayerNames: readonly string[];
} | null;

export type BetrayalRoomFocusState = {
  label: string;
  actionKind: "use";
  roomId: string | null;
};

export type BetrayalTradeStatusCueState = {
  label: string;
};

export type BetrayalActionCueReadModel = {
  turnHintText: string;
  roomFocusState: BetrayalRoomFocusState | null;
  canPickUpMummyGirlRoomId: string | null;
  shouldShowRoomFocusTargetLabel: boolean;
  tradeStatusCueState: BetrayalTradeStatusCueState | null;
  actionCueText: string;
};

export type BetrayalActionCueReadModelInput = {
  t: ActionText;
  recommendedAction: BetrayalCore["recommendedAction"];
  activeRoomId: BetrayalCore["activeRoomId"];
  currentExplorerRoomId: string;
  currentExplorerInventoryCount: number;
  interactionMode: PreviewState["interactionMode"];
  activeHauntTargetGuideCue: string | null;
  selectedHelpingHandsTrollHandMoveEntry: BetrayalHelpingHandsTrollHandMoveEntry | null;
  selectedMonsterMoveEntry: BetrayalMonsterMoveEntry | null;
  selectedMonsterAttackEntry: BetrayalMonsterAttackEntry | null;
  isMonsterAttackMode: boolean;
  selectedMonsterAttackSourceId: string | null;
  isBloodFromStoneSetupPlacementMode: boolean;
  remainingBloodFromStoneSetupPlacementCount: number;
  selectedBloodFromStoneStoneCherubRoomCount: number;
  pendingBloodFromStoneSetupPlacementCount: number;
  pendingRoomPlacementPreview: BetrayalRoomPlacementPreview | null;
  turnEndedByDiscovery: boolean;
  moveTargetRooms: BetrayalRoomNode[];
  canStartExploreSelection: boolean;
  explorableRoomSlots: BetrayalRoomNode[];
  selectedInventoryCardName: string | null;
  selectedCardUseDisabled: boolean;
  selectedCardUsedThisTurn: boolean;
  hauntActionContext: BetrayalHauntActionContext | null;
  hauntActionDisabledReason: string | null;
  isTradeDraftActive: boolean;
  hasUsedTradeThisTurn: boolean;
  tradeSelectionReady: boolean;
  selectedTradeGiveCardCount: number;
  selectedDogTradeCardCount: number;
  selectedTradeTarget: BetrayalExplorerSummary | null;
  activeTradeTargetCount: number;
  unknownRoomLabel: string;
  hasRoomEndTurnEffect: boolean;
  allExplorers: readonly BetrayalExplorerSummary[];
  resolvePlayerName: (playerId: string, explorerName: string) => string;
};

type BetrayalTurnHintInput = {
  t: ActionText;
  interactionMode: PreviewState["interactionMode"];
  helpingHandsTrollMove: MoveCueSummary;
  selectedMonsterMove: MoveCueSummary;
  isBloodFromStoneSetupPlacementMode: boolean;
  remainingBloodFromStoneSetupPlacementCount: number;
  selectedBloodFromStoneStoneCherubRoomCount: number;
  pendingBloodFromStoneSetupPlacementCount: number;
  hasPendingRoomPlacementPreview: boolean;
  turnEndedByDiscovery: boolean;
  moveTargetRoomCount: number;
  moveTargetListText: string;
  canStartExploreSelection: boolean;
  firstExplorableFloorLabel: string | null;
};

type BetrayalActionCueInput = {
  t: ActionText;
  recommendedAction: BetrayalCore["recommendedAction"];
  interactionMode: PreviewState["interactionMode"];
  activeHauntTargetGuideCue: string | null;
  helpingHandsTrollMove: MoveCueSummary;
  selectedMonsterMove: MoveCueSummary;
  isMonsterAttackMode: boolean;
  hasSelectedMonsterAttackSource: boolean;
  selectedMonsterAttack: {
    monsterName: string;
    targetPlayerNames: readonly string[];
  } | null;
  isBloodFromStoneSetupPlacementMode: boolean;
  remainingBloodFromStoneSetupPlacementCount: number;
  isTradeDraftActive: boolean;
  hasUsedTradeThisTurn: boolean;
  tradeSelectionReady: boolean;
  selectedTradeGiveCardCount: number;
  selectedDogTradeCardCount: number;
  selectedTradeTargetPlayerName: string | null;
  selectedInventoryCardName: string | null;
  selectedCardUsedThisTurn: boolean;
  hauntActionDisabledReason: string | null;
  hauntActionCue: string | null;
  moveTargetRoomNames: readonly string[];
  pendingRoomPlacementPreviewRoomName: string | null;
  canStartExploreSelection: boolean;
  firstExplorableFloorLabel: string | null;
  unknownRoomLabel: string;
  turnEndedByDiscovery: boolean;
  hasRoomEndTurnEffect: boolean;
};

function resolveBetrayalTurnHintText({
  t,
  interactionMode,
  helpingHandsTrollMove,
  selectedMonsterMove,
  isBloodFromStoneSetupPlacementMode,
  remainingBloodFromStoneSetupPlacementCount,
  selectedBloodFromStoneStoneCherubRoomCount,
  pendingBloodFromStoneSetupPlacementCount,
  hasPendingRoomPlacementPreview,
  turnEndedByDiscovery,
  moveTargetRoomCount,
  moveTargetListText,
  canStartExploreSelection,
  firstExplorableFloorLabel,
}: BetrayalTurnHintInput): string {
  if (interactionMode === "helpingHandsTrollMove" && helpingHandsTrollMove) {
    return t("board.status.turnHintHelpingHandsTrollMove", {
      monster: helpingHandsTrollMove.monsterName,
      targets: helpingHandsTrollMove.targetListText,
    });
  }
  if (interactionMode === "monsterMove" && selectedMonsterMove) {
    return t("board.status.turnHintMonsterMove", {
      monster: selectedMonsterMove.monsterName,
      targets: selectedMonsterMove.targetListText,
    });
  }
  if (isBloodFromStoneSetupPlacementMode) {
    return remainingBloodFromStoneSetupPlacementCount > 0
      ? t("board.status.turnHintBloodFromStoneSetupPlacement", {
          count: remainingBloodFromStoneSetupPlacementCount,
        })
      : t("board.status.turnHintBloodFromStoneSetupPlacementReady", {
          count: selectedBloodFromStoneStoneCherubRoomCount,
        });
  }
  if (pendingBloodFromStoneSetupPlacementCount > 0) {
    return t("board.status.bloodFromStoneSetupPlacementRemaining", {
      count: pendingBloodFromStoneSetupPlacementCount,
    });
  }
  if (interactionMode === "move") {
    return t("board.activity.chooseMoveTarget");
  }
  if (interactionMode === "explore") {
    return hasPendingRoomPlacementPreview
      ? t("board.activity.chooseRoomOrientation")
      : t("board.activity.chooseExploreTarget");
  }
  if (turnEndedByDiscovery) {
    return t("board.status.turnHintDiscoveryEndTurn");
  }
  if (moveTargetRoomCount > 0) {
    return t("board.status.turnHintMove", {
      targets: moveTargetListText,
    });
  }
  if (canStartExploreSelection && firstExplorableFloorLabel) {
    return t("board.status.turnHintExplore", {
      floor: firstExplorableFloorLabel,
    });
  }
  return t("board.status.turnHintHold");
}

function resolveBetrayalActionCueText({
  t,
  recommendedAction,
  interactionMode,
  activeHauntTargetGuideCue,
  helpingHandsTrollMove,
  selectedMonsterMove,
  isMonsterAttackMode,
  hasSelectedMonsterAttackSource,
  selectedMonsterAttack,
  isBloodFromStoneSetupPlacementMode,
  remainingBloodFromStoneSetupPlacementCount,
  isTradeDraftActive,
  hasUsedTradeThisTurn,
  tradeSelectionReady,
  selectedTradeGiveCardCount,
  selectedDogTradeCardCount,
  selectedTradeTargetPlayerName,
  selectedInventoryCardName,
  selectedCardUsedThisTurn,
  hauntActionDisabledReason,
  hauntActionCue,
  moveTargetRoomNames,
  pendingRoomPlacementPreviewRoomName,
  canStartExploreSelection,
  firstExplorableFloorLabel,
  unknownRoomLabel,
  turnEndedByDiscovery,
  hasRoomEndTurnEffect,
}: BetrayalActionCueInput): string {
  if (activeHauntTargetGuideCue) {
    return activeHauntTargetGuideCue;
  }
  if (interactionMode === "helpingHandsTrollMove" && helpingHandsTrollMove) {
    if (helpingHandsTrollMove.targetRoomNames.length === 1) {
      return t("board.status.actionCueHelpingHandsTrollMoveSingle", {
        monster: helpingHandsTrollMove.monsterName,
        room: helpingHandsTrollMove.targetRoomNames[0],
      });
    }
    return t("board.status.actionCueHelpingHandsTrollMoveMode", {
      monster: helpingHandsTrollMove.monsterName,
    });
  }
  if (interactionMode === "monsterMove" && selectedMonsterMove) {
    if (selectedMonsterMove.targetRoomNames.length === 1) {
      return t("board.status.actionCueMonsterMoveSingle", {
        monster: selectedMonsterMove.monsterName,
        room: selectedMonsterMove.targetRoomNames[0],
      });
    }
    return t("board.status.actionCueMonsterMoveMode", {
      monster: selectedMonsterMove.monsterName,
    });
  }
  if (isMonsterAttackMode && !hasSelectedMonsterAttackSource) {
    return t("board.status.actionCueMonsterAttackChooseSource");
  }
  if (isMonsterAttackMode && selectedMonsterAttack) {
    if (selectedMonsterAttack.targetPlayerNames.length === 1) {
      return t("board.status.actionCueMonsterAttackSingle", {
        monster: selectedMonsterAttack.monsterName,
        player: selectedMonsterAttack.targetPlayerNames[0],
      });
    }
    return t("board.status.actionCueMonsterAttackMode", {
      monster: selectedMonsterAttack.monsterName,
    });
  }
  if (isBloodFromStoneSetupPlacementMode) {
    return remainingBloodFromStoneSetupPlacementCount > 0
      ? t("board.status.actionCueBloodFromStoneSetupPlacement", {
          count: remainingBloodFromStoneSetupPlacementCount,
        })
      : t("board.status.actionCueBloodFromStoneSetupPlacementConfirm");
  }
  if (isTradeDraftActive && !hasUsedTradeThisTurn) {
    if (tradeSelectionReady) {
      return t("board.status.actionCueTradeRequest");
    }
    if (selectedTradeGiveCardCount > 0 || selectedDogTradeCardCount > 0) {
      return t("board.status.actionCueTradeTarget");
    }
    if (selectedTradeTargetPlayerName) {
      return t("board.status.actionCueTradePlayer", {
        player: selectedTradeTargetPlayerName,
      });
    }
    return t("board.status.actionCueTradeTarget");
  }
  if (selectedInventoryCardName && !selectedCardUsedThisTurn) {
    return t("board.status.actionCueUseCard", {
      card: selectedInventoryCardName,
    });
  }
  if (hauntActionDisabledReason) {
    return hauntActionDisabledReason;
  }
  if (hauntActionCue) {
    return hauntActionCue;
  }
  if (interactionMode === "move") {
    if (moveTargetRoomNames.length === 1) {
      return t("board.status.actionCueMoveSingle", {
        room: moveTargetRoomNames[0],
      });
    }
    return t("board.status.actionCueMoveMode");
  }
  if (interactionMode === "explore") {
    if (pendingRoomPlacementPreviewRoomName) {
      return t("board.status.actionCueExploreOrient", {
        room: pendingRoomPlacementPreviewRoomName,
      });
    }
    return canStartExploreSelection
      ? t("board.status.actionCueExploreSelect")
      : t("board.status.actionCueExplore", {
          floor: unknownRoomLabel,
        });
  }
  if (turnEndedByDiscovery) {
    return t("board.status.actionCueDiscoveryEndTurn");
  }

  switch (recommendedAction) {
    case "move":
      if (moveTargetRoomNames.length === 1) {
        return t("board.status.actionCueMoveSingle", {
          room: moveTargetRoomNames[0],
        });
      }
      return t("board.status.actionCueMoveMany");
    case "explore":
      return canStartExploreSelection && firstExplorableFloorLabel
        ? t("board.status.actionCueExplore", {
            floor: firstExplorableFloorLabel,
          })
        : t("board.status.actionCueExplore", {
            floor: unknownRoomLabel,
          });
    case "use":
      return selectedInventoryCardName && !selectedCardUsedThisTurn
        ? t("board.status.actionCueUseCard", {
            card: selectedInventoryCardName,
          })
        : t("board.status.actionCueUse");
    case "trade":
      return selectedTradeTargetPlayerName
        ? t("board.status.actionCueTradePlayer", {
            player: selectedTradeTargetPlayerName,
          })
        : t("board.status.actionCueTrade");
    case "endTurn":
      return hasRoomEndTurnEffect
        ? t("board.status.actionCueEndTurnRoomEffect")
        : t("board.status.actionCueEndTurn");
    default:
      return t("board.status.actionCueMoveMany");
  }
}

function resolveMoveCue(
  entry:
    | BetrayalHelpingHandsTrollHandMoveEntry
    | BetrayalMonsterMoveEntry
    | null,
): MoveCueSummary {
  return entry
    ? {
        monsterName: entry.monster.name,
        targetRoomNames: entry.targetRooms.map((room) => room.name),
        targetListText: formatRoomTargetList(entry.targetRooms),
      }
    : null;
}

function resolveMonsterAttackCue({
  selectedMonsterAttackEntry,
  allExplorers,
  resolvePlayerName,
}: {
  selectedMonsterAttackEntry: BetrayalMonsterAttackEntry | null;
  allExplorers: readonly BetrayalExplorerSummary[];
  resolvePlayerName: (playerId: string, explorerName: string) => string;
}): MonsterAttackCueSummary {
  if (!selectedMonsterAttackEntry) {
    return null;
  }
  return {
    monsterName: selectedMonsterAttackEntry.monster.name,
    targetPlayerNames: Array.from(
      selectedMonsterAttackEntry.targetPlayerIds,
    ).map((playerId) => {
      const target = allExplorers.find(
        (explorer) => explorer.playerId === playerId,
      );
      return resolvePlayerName(playerId, target?.displayName ?? playerId);
    }),
  };
}

export function resolveBetrayalActionCueReadModel({
  t,
  recommendedAction,
  activeRoomId,
  currentExplorerRoomId,
  currentExplorerInventoryCount,
  interactionMode,
  activeHauntTargetGuideCue,
  selectedHelpingHandsTrollHandMoveEntry,
  selectedMonsterMoveEntry,
  selectedMonsterAttackEntry,
  isMonsterAttackMode,
  selectedMonsterAttackSourceId,
  isBloodFromStoneSetupPlacementMode,
  remainingBloodFromStoneSetupPlacementCount,
  selectedBloodFromStoneStoneCherubRoomCount,
  pendingBloodFromStoneSetupPlacementCount,
  pendingRoomPlacementPreview,
  turnEndedByDiscovery,
  moveTargetRooms,
  canStartExploreSelection,
  explorableRoomSlots,
  selectedInventoryCardName,
  selectedCardUseDisabled,
  selectedCardUsedThisTurn,
  hauntActionContext,
  hauntActionDisabledReason,
  isTradeDraftActive,
  hasUsedTradeThisTurn,
  tradeSelectionReady,
  selectedTradeGiveCardCount,
  selectedDogTradeCardCount,
  selectedTradeTarget,
  activeTradeTargetCount,
  unknownRoomLabel,
  hasRoomEndTurnEffect,
  allExplorers,
  resolvePlayerName,
}: BetrayalActionCueReadModelInput): BetrayalActionCueReadModel {
  const helpingHandsTrollMoveCue = resolveMoveCue(
    selectedHelpingHandsTrollHandMoveEntry,
  );
  const selectedMonsterMoveCue = resolveMoveCue(selectedMonsterMoveEntry);
  const firstExplorableFloorLabel = canStartExploreSelection
    ? resolveFloorLabel(explorableRoomSlots[0]!.floor)
    : null;
  const moveTargetRoomNames = moveTargetRooms.map((room) => room.name);
  const moveTargetListText = formatRoomTargetList(moveTargetRooms);
  const turnHintText = resolveBetrayalTurnHintText({
    t,
    interactionMode,
    helpingHandsTrollMove: helpingHandsTrollMoveCue,
    selectedMonsterMove: selectedMonsterMoveCue,
    isBloodFromStoneSetupPlacementMode,
    remainingBloodFromStoneSetupPlacementCount,
    selectedBloodFromStoneStoneCherubRoomCount,
    pendingBloodFromStoneSetupPlacementCount,
    hasPendingRoomPlacementPreview: Boolean(pendingRoomPlacementPreview),
    turnEndedByDiscovery,
    moveTargetRoomCount: moveTargetRooms.length,
    moveTargetListText,
    canStartExploreSelection,
    firstExplorableFloorLabel,
  });
  const roomFocusState =
    recommendedAction === "use" &&
    selectedInventoryCardName &&
    !selectedCardUseDisabled
      ? {
          label: t("board.status.focusUseCard", {
            card: selectedInventoryCardName,
          }),
          actionKind: "use" as const,
          roomId: null,
        }
      : hauntActionContext?.actionKind === "use"
        ? {
            label: hauntActionContext.label,
            actionKind: "use" as const,
            roomId: activeRoomId,
          }
        : null;
  const isMummyGirlRoomFocusAction =
    hauntActionContext?.actionKind === "use" &&
    (hauntActionContext.commandType === BETRAYAL_COMMANDS.PICK_UP_MUMMY_GIRL ||
      hauntActionContext.commandType === BETRAYAL_COMMANDS.GIVE_GIRL_TO_MUMMY);
  const canPickUpMummyGirlRoomId =
    hauntActionContext?.actionKind === "use" &&
    hauntActionContext.commandType === BETRAYAL_COMMANDS.PICK_UP_MUMMY_GIRL
      ? currentExplorerRoomId
      : null;
  const shouldShowRoomFocusTargetLabel =
    Boolean(roomFocusState) && !isMummyGirlRoomFocusAction;
  const selectedTradeTargetPlayerName = selectedTradeTarget
    ? resolvePlayerName(
        selectedTradeTarget.playerId,
        selectedTradeTarget.displayName,
      )
    : null;
  const tradeStatusCueState =
    !isTradeDraftActive &&
    activeTradeTargetCount === 1 &&
    selectedTradeTarget &&
    currentExplorerInventoryCount > 0
      ? {
          label: t("board.status.focusTradeTarget", {
            player: selectedTradeTargetPlayerName,
          }),
        }
      : null;
  const selectedMonsterAttackCue = resolveMonsterAttackCue({
    selectedMonsterAttackEntry,
    allExplorers,
    resolvePlayerName,
  });
  const actionCueText = resolveBetrayalActionCueText({
    t,
    recommendedAction,
    interactionMode,
    activeHauntTargetGuideCue,
    helpingHandsTrollMove: helpingHandsTrollMoveCue,
    selectedMonsterMove: selectedMonsterMoveCue,
    isMonsterAttackMode,
    hasSelectedMonsterAttackSource: Boolean(selectedMonsterAttackSourceId),
    selectedMonsterAttack: selectedMonsterAttackCue,
    isBloodFromStoneSetupPlacementMode,
    remainingBloodFromStoneSetupPlacementCount,
    isTradeDraftActive,
    hasUsedTradeThisTurn,
    tradeSelectionReady,
    selectedTradeGiveCardCount,
    selectedDogTradeCardCount,
    selectedTradeTargetPlayerName,
    selectedInventoryCardName,
    selectedCardUsedThisTurn,
    hauntActionDisabledReason,
    hauntActionCue: hauntActionContext?.cue ?? null,
    moveTargetRoomNames,
    pendingRoomPlacementPreviewRoomName:
      pendingRoomPlacementPreview?.room.name ?? null,
    canStartExploreSelection,
    firstExplorableFloorLabel,
    unknownRoomLabel,
    turnEndedByDiscovery,
    hasRoomEndTurnEffect,
  });

  return {
    turnHintText,
    roomFocusState,
    canPickUpMummyGirlRoomId,
    shouldShowRoomFocusTargetLabel,
    tradeStatusCueState,
    actionCueText,
  };
}
