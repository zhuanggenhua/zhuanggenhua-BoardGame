import { BETRAYAL_COMMANDS } from "./commands";
import type { BetrayalCorpseLootCommandPayload } from "./deathStateReadModel";
import type { BetrayalTradePossessionCommandPayload } from "./trade";

type TradeFlowText = (key: string, options?: Record<string, unknown>) => string;

type AttackRewardPromptInput = {
  isChooser: boolean;
  chooserTargetName: string;
  waitingPlayerName: string;
  damage: number;
} | null;

type PendingTradeAgreementInput = {
  hasOfferCards: boolean;
  hasReturnCards: boolean;
} | null;

export type BetrayalTradeAgreementState =
  | "incoming"
  | "waiting"
  | "observing"
  | "draft";

export type BetrayalTradeFlowReadModel = {
  statusText: string;
  instructionText: string;
  shouldShowMobileStatus: boolean;
  shouldShowInlineConfirm: boolean;
  shouldShowTopPrompt: boolean;
  agreementState: BetrayalTradeAgreementState;
  targetStepText: string;
  bannerStatusText: string;
  shouldShowActionPanel: boolean;
  sicknessExchangeTargetStepText: string;
};

export type BetrayalTradeFlowReadModelInput = {
  t: TradeFlowText;
  recommendedAction: string | null | undefined;
  shouldPauseHauntBoardActions: boolean;
  hasActiveHauntTargetGuide: boolean;
  mummyReward: AttackRewardPromptInput;
  helpingHandsReward: AttackRewardPromptInput;
  hasPendingSicknessExchange: boolean;
  isPendingSicknessForViewer: boolean;
  pendingSicknessRequesterName: string;
  pendingSicknessTargetName: string;
  isDustSicknessExchangeMode: boolean;
  selectedDustTargetName: string | null;
  shouldStartDustSicknessExchange: boolean;
  dustSameRoomLivingTargetCount: number;
  pendingTradeAgreement: PendingTradeAgreementInput;
  isPendingTradeForViewer: boolean;
  isPendingTradeFromViewer: boolean;
  pendingTradeRequesterName: string;
  pendingTradeTargetName: string;
  pendingTradeGiveText: string;
  pendingTradeReturnText: string;
  hasUsedTradeThisTurn: boolean;
  selectedTradeTargetName: string | null;
  selectedCorpseLootTargetName: string | null;
  hasCorpseLootTargets: boolean;
  corpseLootTargetCount: number;
  activeTradeTargetCount: number;
  dogTradeFlowActive: boolean;
  selectedDogTradeCardCount: number;
  selectedDogTradeCardNames: string;
  selectedTradeGiveCardCount: number;
  selectedTradeReturnCardCount: number;
  selectedTradeGiveText: string;
  selectedTradeReturnText: string;
  isTradeDraftActive: boolean;
  tradeSelectionReady: boolean;
};

export type BetrayalTradeActionCommand =
  | {
      kind: "lootCorpse";
      commandType: typeof BETRAYAL_COMMANDS.LOOT_CORPSE;
      payload: BetrayalCorpseLootCommandPayload;
    }
  | {
      kind: "tradePossession";
      commandType: typeof BETRAYAL_COMMANDS.TRADE_POSSESSION;
      payload: BetrayalTradePossessionCommandPayload;
    };

export function resolveBetrayalTradeActionCommand({
  selectedCorpseLootTargetPlayerId,
  selectedCorpseLootCardId,
  tradeSelectionReady,
  useDogTrade,
  selectedDogTradeCardIds,
  selectedTradeGiveCardIds,
  selectedTradeReturnCardIds,
  selectedTradeTargetPlayerId,
}: {
  selectedCorpseLootTargetPlayerId: string | null;
  selectedCorpseLootCardId: string | null;
  tradeSelectionReady: boolean;
  useDogTrade: boolean;
  selectedDogTradeCardIds: string[];
  selectedTradeGiveCardIds: string[];
  selectedTradeReturnCardIds: string[];
  selectedTradeTargetPlayerId: string | null;
}): BetrayalTradeActionCommand | null {
  if (selectedCorpseLootTargetPlayerId) {
    return selectedCorpseLootCardId
      ? {
          kind: "lootCorpse",
          commandType: BETRAYAL_COMMANDS.LOOT_CORPSE,
          payload: {
            sourcePlayerId: selectedCorpseLootTargetPlayerId,
            cardId: selectedCorpseLootCardId,
          },
        }
      : null;
  }
  if (!tradeSelectionReady) {
    return null;
  }
  return {
    kind: "tradePossession",
    commandType: BETRAYAL_COMMANDS.TRADE_POSSESSION,
    payload: {
      ...(useDogTrade
        ? { useDog: true, cardIds: selectedDogTradeCardIds }
        : selectedTradeGiveCardIds.length > 0
          ? { cardIds: selectedTradeGiveCardIds }
          : {}),
      ...(selectedTradeReturnCardIds.length > 0
        ? { targetCardIds: selectedTradeReturnCardIds }
        : {}),
      ...(selectedTradeTargetPlayerId
        ? { targetPlayerId: selectedTradeTargetPlayerId }
        : {}),
    },
  };
}

export function resolveBetrayalTradeFlowReadModel({
  t,
  recommendedAction,
  shouldPauseHauntBoardActions,
  hasActiveHauntTargetGuide,
  mummyReward,
  helpingHandsReward,
  hasPendingSicknessExchange,
  isPendingSicknessForViewer,
  pendingSicknessRequesterName,
  pendingSicknessTargetName,
  isDustSicknessExchangeMode,
  selectedDustTargetName,
  shouldStartDustSicknessExchange,
  dustSameRoomLivingTargetCount,
  pendingTradeAgreement,
  isPendingTradeForViewer,
  isPendingTradeFromViewer,
  pendingTradeRequesterName,
  pendingTradeTargetName,
  pendingTradeGiveText,
  pendingTradeReturnText,
  hasUsedTradeThisTurn,
  selectedTradeTargetName,
  selectedCorpseLootTargetName,
  hasCorpseLootTargets,
  corpseLootTargetCount,
  activeTradeTargetCount,
  dogTradeFlowActive,
  selectedDogTradeCardCount,
  selectedDogTradeCardNames,
  selectedTradeGiveCardCount,
  selectedTradeReturnCardCount,
  selectedTradeGiveText,
  selectedTradeReturnText,
  isTradeDraftActive,
  tradeSelectionReady,
}: BetrayalTradeFlowReadModelInput): BetrayalTradeFlowReadModel {
  const hasPendingTradeAgreement = pendingTradeAgreement !== null;
  const shouldShowInlineConfirm = Boolean(
    !hasPendingTradeAgreement &&
      !hasPendingSicknessExchange &&
      !mummyReward &&
      !helpingHandsReward &&
      !isDustSicknessExchangeMode &&
      isTradeDraftActive &&
      !hasUsedTradeThisTurn &&
      tradeSelectionReady,
  );

  const statusText = resolveTradeStatusText({
    t,
    mummyReward,
    helpingHandsReward,
    hasPendingSicknessExchange,
    isPendingSicknessForViewer,
    pendingSicknessRequesterName,
    pendingSicknessTargetName,
    isDustSicknessExchangeMode,
    selectedDustTargetName,
    shouldStartDustSicknessExchange,
    dustSameRoomLivingTargetCount,
    hasPendingTradeAgreement,
    isPendingTradeForViewer,
    pendingTradeRequesterName,
    pendingTradeTargetName,
    hasUsedTradeThisTurn,
    selectedTradeTargetName,
    selectedCorpseLootTargetName,
    hasCorpseLootTargets,
    corpseLootTargetCount,
    activeTradeTargetCount,
    dogTradeFlowActive,
  });
  const instructionText = resolveTradeInstructionText({
    t,
    hasPendingSicknessExchange,
    isPendingSicknessForViewer,
    pendingSicknessRequesterName,
    pendingSicknessTargetName,
    isDustSicknessExchangeMode,
    selectedDustTargetName,
    shouldStartDustSicknessExchange,
    pendingTradeAgreement,
    isPendingTradeForViewer,
    pendingTradeRequesterName,
    pendingTradeTargetName,
    pendingTradeGiveText,
    pendingTradeReturnText,
    hasUsedTradeThisTurn,
    dogTradeFlowActive,
    selectedTradeTargetName,
    selectedDogTradeCardCount,
    selectedDogTradeCardNames,
    selectedTradeGiveCardCount,
    selectedTradeReturnCardCount,
    selectedTradeGiveText,
    selectedTradeReturnText,
  });
  const shouldShowMobileStatus =
    hasPendingTradeAgreement ||
    hasPendingSicknessExchange ||
    Boolean(mummyReward) ||
    Boolean(helpingHandsReward) ||
    shouldStartDustSicknessExchange ||
    recommendedAction !== "trade" ||
    Boolean(selectedCorpseLootTargetName) ||
    hasCorpseLootTargets ||
    activeTradeTargetCount === 0;
  const shouldShowTopPrompt = Boolean(
    !shouldPauseHauntBoardActions &&
      !hasPendingSicknessExchange &&
      !mummyReward &&
      !helpingHandsReward &&
      !isDustSicknessExchangeMode &&
      !hasActiveHauntTargetGuide &&
      (hasPendingTradeAgreement || isTradeDraftActive),
  );
  const agreementState: BetrayalTradeAgreementState = hasPendingTradeAgreement
    ? isPendingTradeForViewer
      ? "incoming"
      : isPendingTradeFromViewer
        ? "waiting"
        : "observing"
    : "draft";
  const targetStepText = hasPendingTradeAgreement
    ? isPendingTradeForViewer
      ? t("board.status.tradeAgreementDecision")
      : t("board.status.tradeFlowWaiting", {
          player: pendingTradeTargetName,
        })
    : tradeSelectionReady
      ? t("board.status.tradeFlowRequest")
      : t("board.status.tradeFlowChoose");
  const bannerStatusText = hasPendingTradeAgreement
    ? isPendingTradeForViewer
      ? t("board.status.tradeAgreementIncoming", {
          player: pendingTradeRequesterName,
        })
      : t("board.status.tradeFlowWaiting", {
          player: pendingTradeTargetName,
        })
    : tradeSelectionReady
      ? t("board.status.tradeBannerReady")
      : t("board.status.tradeBannerDraft");
  const shouldShowActionPanel = Boolean(
    !shouldPauseHauntBoardActions &&
      !hasPendingSicknessExchange &&
      !mummyReward &&
      !helpingHandsReward &&
      !isDustSicknessExchangeMode &&
      !hasActiveHauntTargetGuide &&
      (shouldShowInlineConfirm ||
        (hasPendingTradeAgreement &&
          (isPendingTradeForViewer || isPendingTradeFromViewer))),
  );
  const sicknessExchangeTargetStepText = isPendingSicknessForViewer
    ? t("board.status.sicknessExchangeTitle")
    : t("board.status.sicknessExchangeWaiting", {
        player: pendingSicknessTargetName,
      });

  return {
    statusText,
    instructionText,
    shouldShowMobileStatus,
    shouldShowInlineConfirm,
    shouldShowTopPrompt,
    agreementState,
    targetStepText,
    bannerStatusText,
    shouldShowActionPanel,
    sicknessExchangeTargetStepText,
  };
}

function resolveTradeStatusText({
  t,
  mummyReward,
  helpingHandsReward,
  hasPendingSicknessExchange,
  isPendingSicknessForViewer,
  pendingSicknessRequesterName,
  pendingSicknessTargetName,
  isDustSicknessExchangeMode,
  selectedDustTargetName,
  shouldStartDustSicknessExchange,
  dustSameRoomLivingTargetCount,
  hasPendingTradeAgreement,
  isPendingTradeForViewer,
  pendingTradeRequesterName,
  pendingTradeTargetName,
  hasUsedTradeThisTurn,
  selectedTradeTargetName,
  selectedCorpseLootTargetName,
  hasCorpseLootTargets,
  corpseLootTargetCount,
  activeTradeTargetCount,
  dogTradeFlowActive,
}: Pick<
  BetrayalTradeFlowReadModelInput,
  | "t"
  | "mummyReward"
  | "helpingHandsReward"
  | "hasPendingSicknessExchange"
  | "isPendingSicknessForViewer"
  | "pendingSicknessRequesterName"
  | "pendingSicknessTargetName"
  | "isDustSicknessExchangeMode"
  | "selectedDustTargetName"
  | "shouldStartDustSicknessExchange"
  | "dustSameRoomLivingTargetCount"
  | "isPendingTradeForViewer"
  | "pendingTradeRequesterName"
  | "pendingTradeTargetName"
  | "hasUsedTradeThisTurn"
  | "selectedTradeTargetName"
  | "selectedCorpseLootTargetName"
  | "hasCorpseLootTargets"
  | "corpseLootTargetCount"
  | "activeTradeTargetCount"
  | "dogTradeFlowActive"
> & { hasPendingTradeAgreement: boolean }): string {
  if (mummyReward) {
    return mummyReward.isChooser
      ? t("board.status.mummyRewardChoose", {
          player: mummyReward.chooserTargetName,
          damage: mummyReward.damage,
        })
      : t("board.status.mummyRewardWaiting", {
          player: mummyReward.waitingPlayerName,
        });
  }
  if (helpingHandsReward) {
    return helpingHandsReward.isChooser
      ? t("board.status.helpingHandsRewardChoose", {
          player: helpingHandsReward.chooserTargetName,
          damage: helpingHandsReward.damage,
        })
      : t("board.status.helpingHandsRewardWaiting", {
          player: helpingHandsReward.waitingPlayerName,
        });
  }
  if (hasPendingSicknessExchange) {
    return isPendingSicknessForViewer
      ? t("board.status.sicknessExchangeIncoming", {
          player: pendingSicknessRequesterName,
        })
      : t("board.status.sicknessExchangeWaiting", {
          player: pendingSicknessTargetName,
        });
  }
  if (isDustSicknessExchangeMode) {
    return selectedDustTargetName
      ? t("board.status.sicknessExchangeTarget", {
          player: selectedDustTargetName,
        })
      : t("board.status.sicknessExchangeChoose");
  }
  if (shouldStartDustSicknessExchange) {
    return t("board.status.sicknessExchangeTargetsAvailable", {
      count: dustSameRoomLivingTargetCount,
    });
  }
  if (hasPendingTradeAgreement) {
    return isPendingTradeForViewer
      ? t("board.status.tradeAgreementIncoming", {
          player: pendingTradeRequesterName,
        })
      : t("board.status.tradeFlowWaiting", {
          player: pendingTradeTargetName,
        });
  }
  if (hasUsedTradeThisTurn) {
    return t("board.status.tradeUsedThisTurn");
  }
  if (selectedTradeTargetName) {
    return t("board.status.tradeTarget", {
      player: selectedTradeTargetName,
    });
  }
  if (selectedCorpseLootTargetName) {
    return t("board.status.lootTarget", {
      player: selectedCorpseLootTargetName,
    });
  }
  if (hasCorpseLootTargets) {
    return t("board.status.lootTargetsAvailable", {
      count: corpseLootTargetCount,
    });
  }
  if (activeTradeTargetCount > 0) {
    return dogTradeFlowActive
      ? t("board.status.dogTradeTargetsAvailable", {
          count: activeTradeTargetCount,
        })
      : t("board.status.tradeTargetsAvailable", {
          count: activeTradeTargetCount,
        });
  }
  return t("board.status.noTradeTargets");
}

function resolveTradeInstructionText({
  t,
  hasPendingSicknessExchange,
  isPendingSicknessForViewer,
  pendingSicknessRequesterName,
  pendingSicknessTargetName,
  isDustSicknessExchangeMode,
  selectedDustTargetName,
  shouldStartDustSicknessExchange,
  pendingTradeAgreement,
  isPendingTradeForViewer,
  pendingTradeRequesterName,
  pendingTradeTargetName,
  pendingTradeGiveText,
  pendingTradeReturnText,
  hasUsedTradeThisTurn,
  dogTradeFlowActive,
  selectedTradeTargetName,
  selectedDogTradeCardCount,
  selectedDogTradeCardNames,
  selectedTradeGiveCardCount,
  selectedTradeReturnCardCount,
  selectedTradeGiveText,
  selectedTradeReturnText,
}: Pick<
  BetrayalTradeFlowReadModelInput,
  | "t"
  | "hasPendingSicknessExchange"
  | "isPendingSicknessForViewer"
  | "pendingSicknessRequesterName"
  | "pendingSicknessTargetName"
  | "isDustSicknessExchangeMode"
  | "selectedDustTargetName"
  | "shouldStartDustSicknessExchange"
  | "pendingTradeAgreement"
  | "isPendingTradeForViewer"
  | "pendingTradeRequesterName"
  | "pendingTradeTargetName"
  | "pendingTradeGiveText"
  | "pendingTradeReturnText"
  | "hasUsedTradeThisTurn"
  | "dogTradeFlowActive"
  | "selectedTradeTargetName"
  | "selectedDogTradeCardCount"
  | "selectedDogTradeCardNames"
  | "selectedTradeGiveCardCount"
  | "selectedTradeReturnCardCount"
  | "selectedTradeGiveText"
  | "selectedTradeReturnText"
>): string {
  if (hasPendingSicknessExchange) {
    return isPendingSicknessForViewer
      ? t("board.status.sicknessExchangeIncomingDetail", {
          player: pendingSicknessRequesterName,
        })
      : t("board.status.sicknessExchangeRequestSent", {
          player: pendingSicknessTargetName,
        });
  }
  if (isDustSicknessExchangeMode) {
    return selectedDustTargetName
      ? t("board.status.sicknessExchangeTarget", {
          player: selectedDustTargetName,
        })
      : t("board.status.sicknessExchangeChoose");
  }
  if (shouldStartDustSicknessExchange) {
    return t("board.status.sicknessExchangeStart");
  }
  if (pendingTradeAgreement) {
    return resolvePendingTradeInstruction({
      t,
      pendingTradeAgreement,
      isPendingTradeForViewer,
      pendingTradeRequesterName,
      pendingTradeTargetName,
      pendingTradeGiveText,
      pendingTradeReturnText,
    });
  }
  if (hasUsedTradeThisTurn) {
    return t("board.status.tradeUsedThisTurn");
  }
  if (dogTradeFlowActive) {
    return resolveDogTradeInstruction({
      t,
      selectedTradeTargetName,
      selectedDogTradeCardCount,
      selectedDogTradeCardNames,
      selectedTradeReturnCardCount,
      selectedTradeGiveText,
      selectedTradeReturnText,
    });
  }
  return resolveNormalTradeInstruction({
    t,
    selectedTradeTargetName,
    selectedTradeGiveCardCount,
    selectedTradeReturnCardCount,
    selectedTradeGiveText,
    selectedTradeReturnText,
  });
}

function resolvePendingTradeInstruction({
  t,
  pendingTradeAgreement,
  isPendingTradeForViewer,
  pendingTradeRequesterName,
  pendingTradeTargetName,
  pendingTradeGiveText,
  pendingTradeReturnText,
}: Pick<
  BetrayalTradeFlowReadModelInput,
  | "t"
  | "isPendingTradeForViewer"
  | "pendingTradeRequesterName"
  | "pendingTradeTargetName"
  | "pendingTradeGiveText"
  | "pendingTradeReturnText"
> & {
  pendingTradeAgreement: PendingTradeAgreementInput;
}): string {
  if (isPendingTradeForViewer) {
    if (pendingTradeAgreement.hasReturnCards) {
      return pendingTradeAgreement.hasOfferCards
        ? t("board.status.tradeAgreementDetailExchange", {
            player: pendingTradeRequesterName,
            give: pendingTradeGiveText,
            take: pendingTradeReturnText,
          })
        : t("board.status.tradeAgreementDetailRequestOnly", {
            player: pendingTradeRequesterName,
            take: pendingTradeReturnText,
          });
    }
    return t("board.status.tradeAgreementDetailNoReturn", {
      player: pendingTradeRequesterName,
      give: pendingTradeGiveText,
    });
  }
  if (pendingTradeAgreement.hasReturnCards) {
    return pendingTradeAgreement.hasOfferCards
      ? t("board.status.tradeRequestSentExchange", {
          player: pendingTradeTargetName,
          give: pendingTradeGiveText,
          take: pendingTradeReturnText,
        })
      : t("board.status.tradeRequestSentRequestOnly", {
          player: pendingTradeTargetName,
          take: pendingTradeReturnText,
        });
  }
  return t("board.status.tradeRequestSentNoReturn", {
    player: pendingTradeTargetName,
    give: pendingTradeGiveText,
  });
}

function resolveDogTradeInstruction({
  t,
  selectedTradeTargetName,
  selectedDogTradeCardCount,
  selectedDogTradeCardNames,
  selectedTradeReturnCardCount,
  selectedTradeGiveText,
  selectedTradeReturnText,
}: Pick<
  BetrayalTradeFlowReadModelInput,
  | "t"
  | "selectedTradeTargetName"
  | "selectedDogTradeCardCount"
  | "selectedDogTradeCardNames"
  | "selectedTradeReturnCardCount"
  | "selectedTradeGiveText"
  | "selectedTradeReturnText"
>): string {
  if (selectedTradeTargetName && (selectedDogTradeCardCount > 0 || selectedTradeReturnCardCount > 0)) {
    return selectedTradeReturnCardCount > 0
      ? selectedDogTradeCardCount > 0
        ? t("board.status.dogTradeFlowReadyExchange", {
            give: selectedTradeGiveText,
            take: selectedTradeReturnText,
            player: selectedTradeTargetName,
          })
        : t("board.status.dogTradeFlowReadyRequestOnly", {
            take: selectedTradeReturnText,
            player: selectedTradeTargetName,
          })
      : t("board.status.dogTradeFlowReadyNoReturn", {
          give: selectedTradeGiveText,
          player: selectedTradeTargetName,
        });
  }
  if (selectedDogTradeCardCount > 0) {
    return t("board.status.dogTradeFlowNeedTarget", {
      card: selectedDogTradeCardNames,
    });
  }
  if (selectedTradeTargetName) {
    return t("board.status.dogTradeFlowNeedSelection", {
      player: selectedTradeTargetName,
    });
  }
  return t("board.status.dogTradeFlowStart");
}

function resolveNormalTradeInstruction({
  t,
  selectedTradeTargetName,
  selectedTradeGiveCardCount,
  selectedTradeReturnCardCount,
  selectedTradeGiveText,
  selectedTradeReturnText,
}: Pick<
  BetrayalTradeFlowReadModelInput,
  | "t"
  | "selectedTradeTargetName"
  | "selectedTradeGiveCardCount"
  | "selectedTradeReturnCardCount"
  | "selectedTradeGiveText"
  | "selectedTradeReturnText"
>): string {
  if (selectedTradeTargetName && (selectedTradeGiveCardCount > 0 || selectedTradeReturnCardCount > 0)) {
    return selectedTradeReturnCardCount > 0
      ? selectedTradeGiveCardCount > 0
        ? t("board.status.tradeFlowReadyExchange", {
            give: selectedTradeGiveText,
            take: selectedTradeReturnText,
            player: selectedTradeTargetName,
          })
        : t("board.status.tradeFlowReadyRequestOnly", {
            take: selectedTradeReturnText,
            player: selectedTradeTargetName,
          })
      : t("board.status.tradeFlowReadyNoReturn", {
          give: selectedTradeGiveText,
          player: selectedTradeTargetName,
        });
  }
  if (selectedTradeGiveCardCount > 0) {
    return t("board.status.tradeFlowNeedTarget", {
      card: selectedTradeGiveText,
    });
  }
  if (selectedTradeTargetName) {
    return t("board.status.tradeFlowNeedSelection", {
      player: selectedTradeTargetName,
    });
  }
  return t("board.status.tradeFlowStart");
}
