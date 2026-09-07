import type {
  BetrayalCore,
  BetrayalDiscoveryResolutionStep,
  BetrayalDiscoverySummary,
  BetrayalInventoryCard,
  BetrayalPendingCardResolutionProcessCard,
  BetrayalPendingCardResolutionState,
  BetrayalRecentRollState,
} from "./game";
import {
  buildRecentRollDisplayKey,
  type EventRollConfirmationPresentation,
} from "./recentRollPresentation";

export type LatestDiscoveryDisplayEntry = {
  key: string;
  sourceKey: string;
  discovery: BetrayalDiscoverySummary;
  ownerPlayerId: string | null;
  recentRoll: BetrayalRecentRollState | null;
};

type LatestDiscoveryTranslation = (
  key: string,
  params?: { confirmed: number; total: number },
) => string;

export type LatestDiscoverySelectionPresentation = {
  queuedEntry: LatestDiscoveryDisplayEntry | null;
  visibleCurrentEntry: LatestDiscoveryDisplayEntry | null;
  entry: LatestDiscoveryDisplayEntry | null;
  discovery: BetrayalDiscoverySummary | null;
  recentRoll: BetrayalRecentRollState | null;
  ownerPlayerId: string | null;
  key: string | null;
  coreRecentRollDisplayKey: string | null;
  recentRollDisplayKey: string | null;
};

export type BetrayalLatestDiscoveryContinueButtonState = {
  label: string;
  disabled: boolean;
  pendingCardResolutionId?: string;
  pendingCardResolutionStep?: string;
  cardResolutionConfirmedCount?: number;
  cardResolutionRequiredCount?: number;
  eventRollConfirmedCount?: number;
  eventRollRequiredCount?: number;
};

export type BetrayalLatestDiscoveryPanelPresentation = {
  hasDisplayEntry: boolean;
  shouldDisplayEventRolledDamageAsIndependentRoll: boolean;
  isRecentRollDismissed: boolean;
  hasActionableRollModifier: boolean;
  shouldAutoReturnAfterLatestDiscovery: boolean;
  shouldShow: boolean;
  shouldShowRoll: boolean;
  canCurrentPlayerModifyRoll: boolean;
  pendingEventRollStart: BetrayalCore["pendingEventRollStart"] | null;
  canCurrentViewerStartEventRoll: boolean;
  pendingEventRollRequiresNoAcknowledgement: boolean;
  eventChoiceDiscoveryForVisual: BetrayalDiscoverySummary | null;
  displayKindLabel: string;
  displaySummary: string;
  shouldShowCardFace: boolean;
  pendingCardResolution: BetrayalPendingCardResolutionState | null;
  cardResolutionRequiredPlayerIds: string[];
  cardResolutionAcknowledgedPlayerIds: string[];
  cardResolutionConfirmedCount: number;
  cardResolutionTotalCount: number;
  viewerHasAcknowledgedCardResolution: boolean;
  canCurrentViewerAcknowledgeCardResolution: boolean;
  searchSequence: readonly BetrayalPendingCardResolutionProcessCard[];
  hasSearchSequence: boolean;
  isSearchOperator: boolean;
  searchVisibleIndex: number;
  visibleProcessCard: BetrayalPendingCardResolutionProcessCard | null;
  resolutionSteps: readonly BetrayalDiscoveryResolutionStep[];
  searchStepNumber: number;
  searchFinalEffectText: string;
  canAdvanceSearch: boolean;
  isSearchFinalAcknowledgement: boolean;
  pendingPossessionCard: BetrayalInventoryCard | null;
  displayedKindLabel: string;
  displayedTitle: string;
  continueButton: BetrayalLatestDiscoveryContinueButtonState;
};

export function buildLatestDiscoveryKey(core: BetrayalCore): string | null {
  return core.latestDiscovery
    ? [
        core.latestDiscoveryOwnerPlayerId ?? "",
        core.latestDiscovery.kind,
        core.latestDiscovery.title,
        core.latestDiscovery.summary,
        core.latestDiscovery.detail,
      ].join("::")
    : null;
}

export function isHauntScenarioOpeningDiscoverySummary(
  discovery: BetrayalDiscoverySummary | null,
): boolean {
  if (!discovery) {
    return false;
  }
  const discoveryText = [
    discovery.title,
    discovery.summary,
    discovery.detail,
  ].join(" ");
  return (
    discoveryText.includes("剧本") ||
    discoveryText.includes("作祟开始") ||
    discoveryText.includes("自动触发作祟") ||
    discoveryText.includes("预兆牌堆耗尽，自动触发作祟") ||
    discoveryText.includes("最后一张预兆触发作祟") ||
    (discoveryText.includes("作祟检定") && discoveryText.includes("已触发"))
  );
}

export function isHauntScenarioBookRevealDiscoverySummary(
  discovery: BetrayalDiscoverySummary | null,
): boolean {
  if (!discovery) {
    return false;
  }
  return [discovery.title, discovery.summary, discovery.detail]
    .join(" ")
    .includes("剧本");
}

export function isHauntScenarioOpeningDiscovery(core: BetrayalCore): boolean {
  if (
    core.phase !== "haunt" ||
    !core.scenarioRuntime.hauntTriggered ||
    !core.latestDiscovery
  ) {
    return false;
  }
  return isHauntScenarioOpeningDiscoverySummary(core.latestDiscovery);
}

function cloneRecentRollForDiscoveryDisplay(
  recentRoll: BetrayalRecentRollState | null,
): BetrayalRecentRollState | null {
  return recentRoll
    ? {
        ...recentRoll,
        dice: [...recentRoll.dice],
        requiredPlayerIds: recentRoll.requiredPlayerIds
          ? [...recentRoll.requiredPlayerIds]
          : undefined,
        acknowledgedPlayerIds: recentRoll.acknowledgedPlayerIds
          ? [...recentRoll.acknowledgedPlayerIds]
          : undefined,
        consumedRabbitFootCardIds: [
          ...recentRoll.consumedRabbitFootCardIds,
        ],
        branchThresholds: recentRoll.branchThresholds?.map((branch) => ({
          ...branch,
          effect: { ...branch.effect },
        })),
        eventRolledDamageResults: recentRoll.eventRolledDamageResults?.map((damage) => ({
          ...damage,
          rolls: [...damage.rolls],
        })),
        sourceEventRoll: recentRoll.sourceEventRoll
          ? {
              ...recentRoll.sourceEventRoll,
              dice: [...recentRoll.sourceEventRoll.dice],
            }
          : undefined,
      }
    : null;
}

export function buildLatestDiscoveryDisplayEntry(
  core: BetrayalCore,
): LatestDiscoveryDisplayEntry | null {
  if (
    isHauntScenarioOpeningDiscovery(core) &&
    isHauntScenarioBookRevealDiscoverySummary(core.latestDiscovery)
  ) {
    return null;
  }
  if (
    isHauntScenarioOpeningDiscovery(core) &&
    (core.pendingCardResolutionQueue?.length ?? 0) === 0
  ) {
    return null;
  }
  const baseKey = buildLatestDiscoveryKey(core);
  if (!core.latestDiscovery || !baseKey) {
    return null;
  }
  if (isEventSymbolNoCardDiscovery(core.latestDiscovery)) {
    return null;
  }
  const isHauntRollForOwner = Boolean(
    core.latestDiscovery.kind === "omen" &&
      core.recentRoll?.kind === "hauntRoll" &&
      core.latestDiscoveryOwnerPlayerId === core.recentRoll.playerId &&
      core.recentRoll.sourceTitle === core.latestDiscovery.title,
  );
  if (core.latestDiscoveryOwnerPlayerId === null && !isHauntRollForOwner) {
    return null;
  }
  const relatedRecentRoll =
    core.recentRoll?.sourceTitle === core.latestDiscovery.title
      ? core.recentRoll
      : null;
  const recentRollId = relatedRecentRoll?.id ?? "";
  const activityId = core.activityLog[0]?.id ?? "";
  const sourceKey = buildLatestDiscoverySourceKey(
    core.latestDiscoveryOwnerPlayerId,
    core.latestDiscovery,
  );
  return {
    key: [baseKey, recentRollId, activityId].join("::"),
    sourceKey,
    discovery: {
      ...core.latestDiscovery,
      resolutionSteps: core.latestDiscovery.resolutionSteps?.map((step) => ({
        ...step,
      })),
    },
    ownerPlayerId: core.latestDiscoveryOwnerPlayerId,
    recentRoll: cloneRecentRollForDiscoveryDisplay(relatedRecentRoll),
  };
}

export function resolveBetrayalLatestDiscoverySelectionPresentation(options: {
  core: BetrayalCore;
  currentEntry: LatestDiscoveryDisplayEntry | null;
  queue: readonly LatestDiscoveryDisplayEntry[];
  dismissedLatestDiscoveryKey: string | null;
  dismissedLatestDiscoveryKeys: ReadonlySet<string>;
}): LatestDiscoverySelectionPresentation {
  const {
    core,
    currentEntry,
    queue,
    dismissedLatestDiscoveryKey,
    dismissedLatestDiscoveryKeys,
  } = options;
  const queuedEntry = queue[0] ?? null;
  const visibleCurrentEntry =
    currentEntry &&
    currentEntry.key !== dismissedLatestDiscoveryKey &&
    !dismissedLatestDiscoveryKeys.has(currentEntry.key)
      ? currentEntry
      : null;
  const entry =
    visibleCurrentEntry &&
    (!queuedEntry || queuedEntry.sourceKey === visibleCurrentEntry.sourceKey)
      ? visibleCurrentEntry
      : queuedEntry;
  const discovery = entry?.discovery ?? null;
  const recentRoll = entry?.recentRoll ?? null;
  const ownerPlayerId = entry?.ownerPlayerId ?? null;
  const key = entry?.key ?? null;
  const coreRecentRollDisplayKey = buildRecentRollDisplayKey(core.recentRoll);
  const recentRollDisplayKey = buildRecentRollDisplayKey(recentRoll);

  return {
    queuedEntry,
    visibleCurrentEntry,
    entry,
    discovery,
    recentRoll,
    ownerPlayerId,
    key,
    coreRecentRollDisplayKey,
    recentRollDisplayKey,
  };
}

export function resolveBetrayalLatestDiscoveryQueueAfterCurrentEntry(options: {
  core: BetrayalCore;
  currentEntry: LatestDiscoveryDisplayEntry | null;
  queue: readonly LatestDiscoveryDisplayEntry[];
  dismissedLatestDiscoveryKey: string | null;
  dismissedLatestDiscoveryKeys: ReadonlySet<string>;
}): LatestDiscoveryDisplayEntry[] {
  const {
    core,
    currentEntry,
    queue,
    dismissedLatestDiscoveryKey,
    dismissedLatestDiscoveryKeys,
  } = options;

  if (isEventSymbolNoCardDiscovery(core.latestDiscovery)) {
    const skippedEventSymbolSourceKey = buildEventSymbolSkipSourceKey(
      core.latestDiscoveryOwnerPlayerId,
    );
    return queue.filter(
      (entry) =>
        entry.sourceKey !== skippedEventSymbolSourceKey &&
        !isEventSymbolNoCardDiscovery(entry.discovery),
    );
  }

  if (!currentEntry) {
    return [...queue];
  }
  if (
    currentEntry.key === dismissedLatestDiscoveryKey ||
    dismissedLatestDiscoveryKeys.has(currentEntry.key)
  ) {
    return [...queue];
  }

  const existingIndex = queue.findIndex(
    (entry) => entry.key === currentEntry.key,
  );
  if (existingIndex >= 0) {
    return queue.map((entry, index) =>
      index === existingIndex ? currentEntry : entry,
    );
  }

  const existingSourceIndex = queue.findIndex(
    (entry) => entry.sourceKey === currentEntry.sourceKey,
  );
  if (existingSourceIndex >= 0) {
    return queue
      .map((entry, index) =>
        index === existingSourceIndex ? currentEntry : entry,
      )
      .filter(
        (entry, index) =>
          index === existingSourceIndex ||
          entry.sourceKey !== currentEntry.sourceKey,
      );
  }

  return [...queue, currentEntry];
}

export function removeBetrayalLatestDiscoveryQueueEntry(
  queue: readonly LatestDiscoveryDisplayEntry[],
  key: string,
): LatestDiscoveryDisplayEntry[] {
  if (queue[0]?.key === key) {
    return queue.slice(1);
  }
  return queue.filter((entry) => entry.key !== key);
}

export function shouldRestoreBetrayalDiscoveryAfterHauntRevealDismiss(options: {
  nextEntry: LatestDiscoveryDisplayEntry | null;
  viewerPlayerId: string;
  dismissedLatestDiscoveryKey: string | null;
  dismissedLatestDiscoveryKeys: ReadonlySet<string>;
}): boolean {
  const {
    nextEntry,
    viewerPlayerId,
    dismissedLatestDiscoveryKey,
    dismissedLatestDiscoveryKeys,
  } = options;
  return Boolean(
    nextEntry &&
      nextEntry.ownerPlayerId === viewerPlayerId &&
      nextEntry.key !== dismissedLatestDiscoveryKey &&
      !dismissedLatestDiscoveryKeys.has(nextEntry.key),
  );
}

export function resolveBetrayalLatestDiscoveryQueueAfterHauntRevealDismiss(options: {
  queue: readonly LatestDiscoveryDisplayEntry[];
  hauntRevealDiscoveryKey: string;
  nextEntry: LatestDiscoveryDisplayEntry | null;
  shouldRestoreDiscovery: boolean;
}): LatestDiscoveryDisplayEntry[] {
  const {
    queue,
    hauntRevealDiscoveryKey,
    nextEntry,
    shouldRestoreDiscovery,
  } = options;
  const queueAfterRevealDismiss = queue.filter(
    (entry) => entry.key !== hauntRevealDiscoveryKey,
  );
  if (!shouldRestoreDiscovery || !nextEntry) {
    return queueAfterRevealDismiss;
  }
  const existingIndex = queueAfterRevealDismiss.findIndex(
    (entry) => entry.key === nextEntry.key,
  );
  if (existingIndex >= 0) {
    return queueAfterRevealDismiss.map((entry, index) =>
      index === existingIndex ? nextEntry : entry,
    );
  }
  return [nextEntry, ...queueAfterRevealDismiss];
}

function resolveLatestDiscoveryKindLabel(
  discovery: BetrayalDiscoverySummary | null,
  t: LatestDiscoveryTranslation,
): string {
  if (!discovery) {
    return "";
  }
  return {
    event: t("board.discovery.eventCard"),
    item: t("board.discovery.itemCard"),
    omen: t("board.discovery.omenCard"),
    none: t("board.discovery.noCard"),
  }[discovery.kind];
}

function resolveLatestDiscoveryDisplaySummary(
  discovery: BetrayalDiscoverySummary | null,
): string {
  const summary = discovery?.summary?.trim() ?? "";
  if (discovery?.kind !== "none") {
    return summary;
  }
  return summary
    .replace(/[；;]\s*没有事件、物品或预兆发现牌[。.]?\s*$/, "")
    .trim();
}

function resolveLatestDiscoveryPendingCardResolution(options: {
  pendingResolution: BetrayalPendingCardResolutionState | null | undefined;
  discovery: BetrayalDiscoverySummary | null;
  ownerPlayerId: string | null;
}): BetrayalPendingCardResolutionState | null {
  const { pendingResolution, discovery, ownerPlayerId } = options;
  if (!pendingResolution || !discovery) {
    return null;
  }
  if (pendingResolution.playerId !== ownerPlayerId) {
    return null;
  }
  if (pendingResolution.discoveryTitle !== discovery.title) {
    return null;
  }
  return pendingResolution;
}

function resolveLatestDiscoveryResolutionSteps(
  discovery: BetrayalDiscoverySummary | null,
): readonly BetrayalDiscoveryResolutionStep[] {
  if (discovery?.resolutionSteps?.length) {
    return discovery.resolutionSteps;
  }
  if (
    discovery &&
    discovery.detail.trim() &&
    !isEventSymbolNoCardDiscovery(discovery)
  ) {
    return [
      {
        id: `event-effect-${discovery.title}`,
        kind: "event-effect",
        text: `事件效果：${discovery.detail.trim()}`,
        deckKind: "event",
      },
    ];
  }
  return [];
}

function resolveLatestDiscoveryPendingPossessionCard(options: {
  visibleProcessCard: BetrayalPendingCardResolutionProcessCard | null;
  pendingCardResolution: BetrayalPendingCardResolutionState | null;
}): BetrayalInventoryCard | null {
  const { visibleProcessCard, pendingCardResolution } = options;
  if (
    visibleProcessCard &&
    (visibleProcessCard.deckKind === "item" ||
      visibleProcessCard.deckKind === "omen")
  ) {
    return {
      id: visibleProcessCard.cardId ?? visibleProcessCard.cardName,
      name: visibleProcessCard.cardName,
      kind: visibleProcessCard.deckKind,
    };
  }
  if (
    !pendingCardResolution?.cardId ||
    (pendingCardResolution.deckKind !== "item" &&
      pendingCardResolution.deckKind !== "omen")
  ) {
    return null;
  }
  return {
    id: pendingCardResolution.cardId,
    name: pendingCardResolution.cardName,
    kind: pendingCardResolution.deckKind,
  };
}

export function resolveBetrayalLatestDiscoveryPanelPresentation(options: {
  core: BetrayalCore;
  selection: LatestDiscoverySelectionPresentation;
  dismissedLatestDiscoveryKey: string | null;
  dismissedRecentRollId: string | null;
  viewerPlayerId: string;
  inventoryActionPlayerId: string;
  hasRecentRollModifier: boolean;
  pendingEventChoice: BetrayalCore["pendingEventChoice"];
  shouldShowHauntRevealCue: boolean;
  latestDiscoverySearchRevealIndex: number;
  eventRollConfirmation: EventRollConfirmationPresentation;
  t: LatestDiscoveryTranslation;
}): BetrayalLatestDiscoveryPanelPresentation {
  const {
    core,
    selection,
    dismissedLatestDiscoveryKey,
    dismissedRecentRollId,
    viewerPlayerId,
    inventoryActionPlayerId,
    hasRecentRollModifier,
    pendingEventChoice,
    shouldShowHauntRevealCue,
    latestDiscoverySearchRevealIndex,
    eventRollConfirmation,
    t,
  } = options;
  const { discovery, recentRoll, ownerPlayerId, key } = selection;
  const activePendingCardResolution =
    core.pendingCardResolutionQueue?.[0] ?? null;
  const hasDisplayEntry = Boolean(
    discovery && key !== dismissedLatestDiscoveryKey,
  );
  const shouldDisplayEventRolledDamageAsIndependentRoll = Boolean(
    core.recentRoll?.kind === "eventRolledDamage" &&
      recentRoll?.kind === "eventRolledDamage" &&
      selection.coreRecentRollDisplayKey === selection.recentRollDisplayKey,
  );
  const isRecentRollDismissed = Boolean(
    selection.recentRollDisplayKey &&
      dismissedRecentRollId === selection.recentRollDisplayKey,
  );
  const hasActionableRollModifier = Boolean(
    discovery &&
      recentRoll &&
      hasRecentRollModifier &&
      selection.coreRecentRollDisplayKey === selection.recentRollDisplayKey &&
      recentRoll.playerId === inventoryActionPlayerId,
  );
  const shouldAutoReturnAfterLatestDiscovery = Boolean(
    !pendingEventChoice &&
      (core.pendingCardResolutionQueue?.length ?? 0) === 0 &&
      core.turnEndedByDiscovery &&
      isSpiderAdjacentRoomResolutionDiscovery(core.latestDiscovery) &&
      !hasActionableRollModifier,
  );
  const shouldShow = Boolean(
    hasDisplayEntry &&
      !shouldAutoReturnAfterLatestDiscovery &&
      !shouldShowHauntRevealCue &&
      !shouldDisplayEventRolledDamageAsIndependentRoll,
  );
  const shouldShowRoll = Boolean(
    shouldShow &&
      !shouldAutoReturnAfterLatestDiscovery &&
      !isRecentRollDismissed &&
      recentRoll &&
      ((discovery?.kind === "event" &&
        (recentRoll.kind === "eventTraitCheck" ||
          recentRoll.kind === "eventDiceRoll")) ||
        (discovery?.kind === "omen" && recentRoll.kind === "hauntRoll")) &&
      recentRoll.sourceTitle === discovery?.title,
  );
  const canCurrentPlayerModifyRoll = Boolean(
    shouldShowRoll &&
      hasRecentRollModifier &&
      recentRoll &&
      selection.coreRecentRollDisplayKey === selection.recentRollDisplayKey &&
      recentRoll.playerId === inventoryActionPlayerId,
  );
  const pendingEventRollStart =
    core.pendingEventRollStart &&
    core.pendingEventRollStart.playerId === core.latestDiscoveryOwnerPlayerId &&
    core.pendingEventRollStart.sourceTitle === core.latestDiscovery?.title
      ? core.pendingEventRollStart
      : null;
  const canCurrentViewerStartEventRoll = Boolean(
    pendingEventRollStart && pendingEventRollStart.playerId === viewerPlayerId,
  );
  const eventChoiceDiscoveryForVisual =
    pendingEventChoice && pendingEventChoice.sourceKind !== "event-symbol-skip"
      ? {
          kind: "event" as const,
          title: pendingEventChoice.sourceTitle,
          summary: "",
          detail: "",
          tone: "accent" as const,
        }
      : null;
  const displayKindLabel = resolveLatestDiscoveryKindLabel(discovery, t);
  const displaySummary = resolveLatestDiscoveryDisplaySummary(discovery);
  const latestDiscoveryIsEventSymbolNoCard =
    isEventSymbolNoCardDiscovery(discovery);
  const shouldShowCardFace = Boolean(
    discovery &&
      ((discovery.kind !== "none" && !latestDiscoveryIsEventSymbolNoCard) ||
        (activePendingCardResolution?.cardId &&
          (activePendingCardResolution.deckKind === "item" ||
            activePendingCardResolution.deckKind === "omen"))),
  );
  const pendingCardResolution = resolveLatestDiscoveryPendingCardResolution({
    pendingResolution: activePendingCardResolution,
    discovery,
    ownerPlayerId,
  });
  const cardResolutionRequiredPlayerIds =
    pendingCardResolution?.requiredPlayerIds?.length
      ? pendingCardResolution.requiredPlayerIds
      : pendingCardResolution
        ? [pendingCardResolution.playerId]
        : [];
  const cardResolutionAcknowledgedPlayerIds =
    pendingCardResolution?.acknowledgedPlayerIds ?? [];
  const cardResolutionConfirmedCount =
    cardResolutionRequiredPlayerIds.filter((playerId) =>
      cardResolutionAcknowledgedPlayerIds.includes(playerId),
    ).length;
  const cardResolutionTotalCount = cardResolutionRequiredPlayerIds.length;
  const viewerHasAcknowledgedCardResolution =
    cardResolutionAcknowledgedPlayerIds.includes(viewerPlayerId);
  const searchSequence = pendingCardResolution?.processCards ?? [];
  const hasSearchSequence = searchSequence.length > 0;
  const isSearchOperator = Boolean(
    pendingCardResolution &&
      hasSearchSequence &&
      pendingCardResolution.playerId === viewerPlayerId,
  );
  const searchVisibleIndex = hasSearchSequence
    ? isSearchOperator
      ? Math.min(
          Math.max(0, latestDiscoverySearchRevealIndex),
          searchSequence.length - 1,
        )
      : searchSequence.length - 1
    : -1;
  const visibleProcessCard =
    searchVisibleIndex >= 0 ? (searchSequence[searchVisibleIndex] ?? null) : null;
  const resolutionSteps = resolveLatestDiscoveryResolutionSteps(discovery);
  const searchStepNumber =
    visibleProcessCard && searchVisibleIndex >= 0
      ? searchVisibleIndex + 1
      : 0;
  const searchFinalEffectText =
    hasSearchSequence && searchVisibleIndex === searchSequence.length - 1
      ? (pendingCardResolution?.text ?? "")
      : "";
  const canAdvanceSearch = Boolean(
    isSearchOperator &&
      !viewerHasAcknowledgedCardResolution &&
      searchVisibleIndex >= 0 &&
      searchVisibleIndex < searchSequence.length - 1,
  );
  const isSearchFinalAcknowledgement = Boolean(
    pendingCardResolution &&
      hasSearchSequence &&
      searchVisibleIndex === searchSequence.length - 1 &&
      !canAdvanceSearch,
  );
  const canCurrentViewerAcknowledgeCardResolution = Boolean(
    pendingCardResolution &&
      cardResolutionRequiredPlayerIds.includes(viewerPlayerId) &&
      !viewerHasAcknowledgedCardResolution &&
      !canAdvanceSearch,
  );
  const continueLabel = (() => {
    if (core.pendingEventRollResolution) {
      if (core.pendingEventRollResolution.requiresAcknowledgement === false) {
        return t("board.roll.backToBoard");
      }
      return eventRollConfirmation.viewerHasAcknowledged
        ? t("board.discovery.confirmedWithProgress", {
            confirmed: eventRollConfirmation.confirmedCount,
            total: eventRollConfirmation.totalCount,
          })
        : t("board.discovery.confirmWithProgress", {
            confirmed: eventRollConfirmation.confirmedCount,
            total: eventRollConfirmation.totalCount,
          });
    }
    if (!pendingCardResolution) {
      return t("board.roll.backToBoard");
    }
    if (viewerHasAcknowledgedCardResolution) {
      return t("board.discovery.confirmedWithProgress", {
        confirmed: cardResolutionConfirmedCount,
        total: cardResolutionTotalCount,
      });
    }
    if (canAdvanceSearch) {
      return t("board.discovery.nextSearchCard");
    }
    if (isSearchFinalAcknowledgement) {
      return t("board.discovery.confirmWithProgress", {
        confirmed: cardResolutionConfirmedCount,
        total: cardResolutionTotalCount,
      });
    }
    return t("board.discovery.confirmCard");
  })();
  const pendingPossessionCard = resolveLatestDiscoveryPendingPossessionCard({
    visibleProcessCard,
    pendingCardResolution,
  });
  const displayedKindLabel = pendingPossessionCard
    ? pendingPossessionCard.kind === "item"
      ? t("board.discovery.itemCard")
      : t("board.discovery.omenCard")
    : discovery?.kind === "none" && pendingCardResolution
      ? t("board.discovery.roomEffect")
      : displayKindLabel;
  const displayedTitle = pendingPossessionCard?.name ?? discovery?.title ?? "";

  return {
    hasDisplayEntry,
    shouldDisplayEventRolledDamageAsIndependentRoll,
    isRecentRollDismissed,
    hasActionableRollModifier,
    shouldAutoReturnAfterLatestDiscovery,
    shouldShow,
    shouldShowRoll,
    canCurrentPlayerModifyRoll,
    pendingEventRollStart,
    canCurrentViewerStartEventRoll,
    pendingEventRollRequiresNoAcknowledgement: Boolean(
      core.pendingEventRollResolution?.requiresAcknowledgement === false,
    ),
    eventChoiceDiscoveryForVisual,
    displayKindLabel,
    displaySummary,
    shouldShowCardFace,
    pendingCardResolution,
    cardResolutionRequiredPlayerIds: [...cardResolutionRequiredPlayerIds],
    cardResolutionAcknowledgedPlayerIds: [
      ...cardResolutionAcknowledgedPlayerIds,
    ],
    cardResolutionConfirmedCount,
    cardResolutionTotalCount,
    viewerHasAcknowledgedCardResolution,
    canCurrentViewerAcknowledgeCardResolution,
    searchSequence,
    hasSearchSequence,
    isSearchOperator,
    searchVisibleIndex,
    visibleProcessCard,
    resolutionSteps,
    searchStepNumber,
    searchFinalEffectText,
    canAdvanceSearch,
    isSearchFinalAcknowledgement,
    pendingPossessionCard,
    displayedKindLabel,
    displayedTitle,
    continueButton: {
      label: continueLabel,
      disabled: Boolean(
        (core.pendingEventRollResolution &&
          !eventRollConfirmation.canViewerAcknowledge) ||
          (pendingCardResolution &&
            !canAdvanceSearch &&
            !canCurrentViewerAcknowledgeCardResolution),
      ),
      pendingCardResolutionId: pendingCardResolution?.id ?? undefined,
      pendingCardResolutionStep:
        pendingCardResolution && !isSearchFinalAcknowledgement
          ? `${pendingCardResolution.index}/${pendingCardResolution.total}`
          : undefined,
      cardResolutionConfirmedCount: pendingCardResolution
        ? cardResolutionConfirmedCount
        : undefined,
      cardResolutionRequiredCount: pendingCardResolution
        ? cardResolutionTotalCount
        : undefined,
      eventRollConfirmedCount: core.pendingEventRollResolution
        ? eventRollConfirmation.confirmedCount
        : isSearchFinalAcknowledgement
          ? cardResolutionConfirmedCount
          : undefined,
      eventRollRequiredCount: core.pendingEventRollResolution
        ? eventRollConfirmation.totalCount
        : isSearchFinalAcknowledgement
          ? cardResolutionTotalCount
          : undefined,
    },
  };
}

export function isSpiderAdjacentRoomResolutionDiscovery(
  discovery: BetrayalDiscoverySummary | null,
): boolean {
  return Boolean(
    discovery?.kind === "event" &&
      discovery.title === "蜘蛛！" &&
      discovery.detail.includes("放置到") &&
      (discovery.detail.includes("神志 +1") ||
        discovery.detail.includes("速度 +1")),
  );
}

export function buildLatestDiscoverySourceKey(
  ownerPlayerId: string | null,
  discovery: BetrayalDiscoverySummary,
): string {
  return [ownerPlayerId ?? "", discovery.kind, discovery.title].join("::");
}

export function buildEventSymbolSkipSourceKey(
  ownerPlayerId: string | null,
): string {
  return [ownerPlayerId ?? "", "event", "事件符号"].join("::");
}

export function isEventSymbolNoCardDiscovery(
  discovery: BetrayalDiscoverySummary | null,
): boolean {
  if (discovery?.kind !== "event") {
    return false;
  }
  const text = [discovery.summary, discovery.detail].join(" ");
  return (
    text.includes("没有抽取或结算事件卡") ||
    text.includes("不抽取或结算事件卡")
  );
}
