import type { ActionBarAction } from "../../core/ui/types";
import type { BetrayalCore } from "./game";
import type { PreviewState } from "./previewStateModel";

type ActionText = (key: string, options?: Record<string, unknown>) => string;

type HauntActionSummary = {
  label: string;
  disabledReason?: string | null;
} | null;

type MonsterActionSummary = {
  name: string;
  reason?: string | null;
} | null;

export type BetrayalBoardActionItemsInput = {
  t: ActionText;
  phase: BetrayalCore["phase"];
  movesRemaining: number;
  currentExplorerInventoryCount: number;
  interactionMode: PreviewState["interactionMode"];
  turnEndedByDiscovery: boolean;
  hasPendingPlayerAgreement: boolean;
  canStartExploreSelection: boolean;
  hasCorpseLootTargets: boolean;
  tradeSelectionReady: boolean;
  shouldStartDustSicknessExchange: boolean;
  isDustSicknessExchangeMode: boolean;
  hasUsedTradeThisTurn: boolean;
  hasAnyTradeSelectableCards: boolean;
  activeTradeTargetCount: number;
  hasSelectedInventoryCard: boolean;
  selectedCardUseDisabled: boolean;
  selectedCardUseDisabledReason: string | null;
  hauntAction: HauntActionSummary;
  shouldShowRoomEffectAction: boolean;
  canUseRoomEffect: boolean;
  roomEffectDisabledReason: string | null;
  hasRoomEndTurnEffect: boolean;
  shouldShowHauntRevealCue: boolean;
  hasActiveHauntTargetGuide: boolean;
  activeHauntTargetGuideCue: string | null;
  isHelpingHandsMonsterTurnController: boolean;
  helpingHandsMonsterTurnActive: boolean;
  helpingHandsTrollHandMoveEntryCount: number;
  isDeadTraitorJackSpiritControlTurn: boolean;
  pendingBloodFromStoneSetupPlacementCount: number;
  selectedBloodFromStoneStoneCherubRoomCount: number;
  isBloodFromStoneSetupPlacementMode: boolean;
  monsterTurnStartAction: MonsterActionSummary;
  monsterMovementRollAction: MonsterActionSummary;
  selectedMonsterMoveAction: MonsterActionSummary;
  selectedMonsterAttackAction: MonsterActionSummary;
  bloodFromStoneMonsterTurnEndAction: MonsterActionSummary;
};

export type BetrayalBoardActionItems = {
  visibleActionDisabledReason: string | null;
  visibleActionItems: ActionBarAction[];
};

export function resolveBetrayalBoardActionItems({
  t,
  phase,
  movesRemaining,
  currentExplorerInventoryCount,
  interactionMode,
  turnEndedByDiscovery,
  hasPendingPlayerAgreement,
  canStartExploreSelection,
  hasCorpseLootTargets,
  tradeSelectionReady,
  shouldStartDustSicknessExchange,
  isDustSicknessExchangeMode,
  hasUsedTradeThisTurn,
  hasAnyTradeSelectableCards,
  activeTradeTargetCount,
  hasSelectedInventoryCard,
  selectedCardUseDisabled,
  selectedCardUseDisabledReason,
  hauntAction,
  shouldShowRoomEffectAction,
  canUseRoomEffect,
  roomEffectDisabledReason,
  hasRoomEndTurnEffect,
  shouldShowHauntRevealCue,
  hasActiveHauntTargetGuide,
  activeHauntTargetGuideCue,
  isHelpingHandsMonsterTurnController,
  helpingHandsMonsterTurnActive,
  helpingHandsTrollHandMoveEntryCount,
  isDeadTraitorJackSpiritControlTurn,
  pendingBloodFromStoneSetupPlacementCount,
  selectedBloodFromStoneStoneCherubRoomCount,
  isBloodFromStoneSetupPlacementMode,
  monsterTurnStartAction,
  monsterMovementRollAction,
  selectedMonsterMoveAction,
  selectedMonsterAttackAction,
  bloodFromStoneMonsterTurnEndAction,
}: BetrayalBoardActionItemsInput): BetrayalBoardActionItems {
  const isHauntPrimaryAction =
    phase === "haunt" && hauntAction !== null && !hasSelectedInventoryCard;
  const visibleActionDisabledReason = (() => {
    if (hasSelectedInventoryCard && selectedCardUseDisabled) {
      return selectedCardUseDisabledReason;
    }
    if (phase === "haunt" && hauntAction?.disabledReason) {
      return hauntAction.disabledReason;
    }
    if (
      shouldShowRoomEffectAction &&
      !canUseRoomEffect &&
      roomEffectDisabledReason
    ) {
      return roomEffectDisabledReason;
    }
    return null;
  })();
  const actionItems: ActionBarAction[] = [
    {
      id: "move",
      label:
        interactionMode === "move"
          ? t("board.actions.cancelMove")
          : t("board.actions.move"),
      disabled: hasPendingPlayerAgreement || movesRemaining <= 0,
      variant: "secondary",
    },
    {
      id: "explore",
      label: t("board.actions.explore"),
      disabled: hasPendingPlayerAgreement || !canStartExploreSelection,
      variant: "primary",
    },
    {
      id: "trade",
      label: hasCorpseLootTargets
        ? t("board.actions.loot")
        : tradeSelectionReady && !hasPendingPlayerAgreement
          ? t("board.actions.sendTradeRequest")
          : shouldStartDustSicknessExchange
            ? isDustSicknessExchangeMode
              ? t("board.actions.cancelSicknessExchange")
              : t("board.actions.exchangeSickness")
            : t("board.actions.trade"),
      disabled: hasCorpseLootTargets
        ? hasPendingPlayerAgreement
        : hasPendingPlayerAgreement
          ? true
          : shouldStartDustSicknessExchange
            ? false
            : hasUsedTradeThisTurn ||
              !hasAnyTradeSelectableCards ||
              activeTradeTargetCount === 0,
      variant: "secondary",
    },
    {
      id: "use",
      label: isHauntPrimaryAction ? hauntAction.label : t("board.actions.use"),
      disabled: hasPendingPlayerAgreement
        ? true
        : isHauntPrimaryAction
          ? Boolean(hauntAction.disabledReason)
          : currentExplorerInventoryCount === 0 || selectedCardUseDisabled,
      description: isHauntPrimaryAction
        ? (hauntAction.disabledReason ?? undefined)
        : selectedCardUseDisabled
          ? (selectedCardUseDisabledReason ?? undefined)
          : undefined,
      variant: "secondary",
    },
    {
      id: "roomEffect",
      label: t("board.actions.roomEffectMysticElevator"),
      disabled: hasPendingPlayerAgreement || !canUseRoomEffect,
      description: !canUseRoomEffect
        ? (roomEffectDisabledReason ?? undefined)
        : undefined,
      variant: "secondary",
    },
    {
      id: "endTurn",
      label: hasRoomEndTurnEffect
        ? t("board.actions.endTurnRoomEffect")
        : t("board.actions.endTurn"),
      disabled: hasPendingPlayerAgreement,
      variant: "ghost",
    },
  ];
  const helpingHandsMonsterTurnActionItems: ActionBarAction[] =
    isHelpingHandsMonsterTurnController
      ? [
          {
            id: "move",
            label:
              interactionMode === "helpingHandsTrollMove"
                ? t("board.actions.cancelTrollHandMove")
                : t("board.actions.moveTrollHand"),
            disabled:
              hasPendingPlayerAgreement ||
              helpingHandsTrollHandMoveEntryCount === 0,
            description:
              helpingHandsTrollHandMoveEntryCount === 0
                ? t("board.status.helpingHandsTrollNoMoveTarget")
                : undefined,
            variant: "secondary",
          },
          {
            id: "use",
            label: hauntAction ? hauntAction.label : t("board.actions.attack"),
            disabled:
              hasPendingPlayerAgreement ||
              !hauntAction ||
              Boolean(hauntAction.disabledReason),
            description:
              hauntAction?.disabledReason ??
              (!hauntAction
                ? t("board.status.helpingHandsTrollNoAttackTarget")
                : undefined),
            variant: "secondary",
          },
          {
            id: "endTurn",
            label: t("board.actions.endHelpingHandsMonsterTurn"),
            disabled: hasPendingPlayerAgreement,
            variant: "ghost",
          },
        ]
      : [];
  const bloodFromStoneSetupPlacementActionItems: ActionBarAction[] =
    pendingBloodFromStoneSetupPlacementCount > 0
      ? [
          {
            id: "bloodFromStoneSetupPlacement",
            label: isBloodFromStoneSetupPlacementMode
              ? t("board.actions.cancelBloodFromStoneStoneCherubPlacement")
              : t("board.actions.placeBloodFromStoneStoneCherubs"),
            disabled: hasPendingPlayerAgreement,
            description: t(
              "board.status.bloodFromStoneSetupPlacementRemaining",
              {
                count: pendingBloodFromStoneSetupPlacementCount,
              },
            ),
            variant: "secondary",
          },
          ...(isBloodFromStoneSetupPlacementMode
            ? [
                {
                  id: "bloodFromStoneConfirmSetupPlacement",
                  label: t(
                    "board.actions.confirmBloodFromStoneStoneCherubPlacement",
                  ),
                  disabled:
                    hasPendingPlayerAgreement ||
                    selectedBloodFromStoneStoneCherubRoomCount !==
                      pendingBloodFromStoneSetupPlacementCount,
                  description:
                    selectedBloodFromStoneStoneCherubRoomCount ===
                    pendingBloodFromStoneSetupPlacementCount
                      ? undefined
                      : t("board.status.bloodFromStoneSetupPlacementSelected", {
                          selected: selectedBloodFromStoneStoneCherubRoomCount,
                          total: pendingBloodFromStoneSetupPlacementCount,
                        }),
                  variant: "primary" as const,
                },
              ]
            : []),
        ]
      : [];
  const monsterActionItems: ActionBarAction[] =
    phase === "haunt" && !helpingHandsMonsterTurnActive
      ? monsterTurnStartAction
        ? [
            {
              id: "monsterTurnStart",
              label: t("board.actions.resolveMonsterTurnStart", {
                monster: monsterTurnStartAction.name,
              }),
              disabled: hasPendingPlayerAgreement,
              description: monsterTurnStartAction.reason ?? undefined,
              variant: "secondary",
            },
          ]
        : monsterMovementRollAction
          ? [
              {
                id: "monsterMovementRoll",
                label: t("board.actions.rollMonsterMovement", {
                  monster: monsterMovementRollAction.name,
                }),
                disabled: hasPendingPlayerAgreement,
                description: monsterMovementRollAction.reason ?? undefined,
                variant: "secondary",
              },
            ]
          : selectedMonsterMoveAction
            ? [
                {
                  id: "monsterMove",
                  label:
                    interactionMode === "monsterMove"
                      ? t("board.actions.cancelMonsterMove")
                      : t("board.actions.moveMonster", {
                          monster: selectedMonsterMoveAction.name,
                        }),
                  disabled: hasPendingPlayerAgreement,
                  description: selectedMonsterMoveAction.reason ?? undefined,
                  variant: "secondary",
                },
              ]
            : selectedMonsterAttackAction
              ? [
                  {
                    id: "monsterAttack",
                    label:
                      interactionMode === "monsterAttack"
                        ? t("board.actions.cancelMonsterAttack")
                        : t("board.actions.attackMonster", {
                            monster: selectedMonsterAttackAction.name,
                          }),
                    disabled: hasPendingPlayerAgreement,
                    description:
                      selectedMonsterAttackAction.reason ?? undefined,
                    variant: "secondary",
                  },
                ]
              : bloodFromStoneMonsterTurnEndAction
                ? [
                    {
                      id: "bloodFromStoneMonsterTurnEnd",
                      label: t("board.actions.endBloodFromStoneMonsterTurn"),
                      disabled: hasPendingPlayerAgreement,
                      description:
                        bloodFromStoneMonsterTurnEndAction.reason ?? undefined,
                      variant: "secondary",
                    },
                  ]
                : []
      : [];
  const hauntSpecialActionItem = isHauntPrimaryAction
    ? (actionItems.find((action) => action.id === "use") ?? null)
    : null;
  const monsterActionItemsWithHauntAction =
    monsterActionItems.length > 0 && hauntSpecialActionItem
      ? [...monsterActionItems, hauntSpecialActionItem]
      : monsterActionItems;
  const visibleActionItems = shouldShowHauntRevealCue
    ? []
    : hasActiveHauntTargetGuide
      ? [
          {
            id: "use",
            label:
              activeHauntTargetGuideCue ?? t("board.status.hauntTargetingPrimary"),
            disabled: true,
            variant: "secondary" as const,
          },
          {
            id: "cancelTarget",
            label: t("board.status.hauntTargetingCancel"),
            disabled: false,
            variant: "ghost" as const,
          },
        ]
      : helpingHandsMonsterTurnActive
        ? helpingHandsMonsterTurnActionItems
        : isDeadTraitorJackSpiritControlTurn
          ? monsterActionItemsWithHauntAction.length > 0
            ? monsterActionItemsWithHauntAction
            : actionItems.filter(
                (action) => action.id === "move" || action.id === "endTurn",
              )
          : bloodFromStoneSetupPlacementActionItems.length > 0
            ? bloodFromStoneSetupPlacementActionItems
            : turnEndedByDiscovery
              ? actionItems.filter((action) => action.id === "endTurn")
              : monsterActionItemsWithHauntAction.length > 0
                ? monsterActionItemsWithHauntAction
                : [
                    ...actionItems.filter((action) => {
                      if (
                        action.id === "explore" &&
                        !canStartExploreSelection
                      ) {
                        return false;
                      }
                      if (action.id === "roomEffect") {
                        return shouldShowRoomEffectAction;
                      }
                      return true;
                    }),
                  ];

  return {
    visibleActionDisabledReason,
    visibleActionItems,
  };
}
