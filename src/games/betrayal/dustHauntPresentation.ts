import type { PreviewState } from "./previewStateModel";
import type {
  BetrayalCore,
  BetrayalDustRuntimeState,
  BetrayalExplorerSummary,
} from "./game";
import type { BetrayalHauntTokenInstanceSummary } from "./hauntTokenModel";

type DustPresentationText = (
  key: string,
  options?: Record<string, unknown>,
) => string;

export type BetrayalDustProgressItem = {
  id: string;
  label: string;
  value: string;
};

export type BetrayalDustPresentation = {
  isDustHauntActive: boolean;
  sameRoomLivingTargets: BetrayalExplorerSummary[];
  targetPlayerIds: ReadonlySet<string>;
  isSicknessExchangeAvailable: boolean;
  isSicknessExchangeMode: boolean;
  selectedTargetPlayerId: string | null;
  selectedTargetName: string | null;
  progressItems: BetrayalDustProgressItem[];
};

export function resolveBetrayalBoardVisibleHauntTokensByRoomId(
  tokens: readonly BetrayalHauntTokenInstanceSummary[],
): Map<string, BetrayalHauntTokenInstanceSummary[]> {
  const tokensByRoomId = new Map<string, BetrayalHauntTokenInstanceSummary[]>();
  for (const token of tokens) {
    const isBoardVisibleHauntToken =
      token.id.startsWith("dust-research-token-") ||
      token.id.startsWith("mummy-");
    if (
      !token.roomId ||
      token.visibility !== "public" ||
      !isBoardVisibleHauntToken
    ) {
      continue;
    }
    const roomTokens = tokensByRoomId.get(token.roomId) ?? [];
    roomTokens.push(token);
    tokensByRoomId.set(token.roomId, roomTokens);
  }
  return tokensByRoomId;
}

export function resolveBetrayalDustPresentation({
  t,
  phase,
  hauntCardNumber,
  dust,
  currentExplorer,
  otherExplorers,
  deadExplorerPlayerIds,
  usedCardIdsThisTurn,
  viewerPlayerId,
  interactionMode,
  selectedTargetPlayerId,
  resolvePlayerName,
}: {
  t: DustPresentationText;
  phase: BetrayalCore["phase"];
  hauntCardNumber: BetrayalCore["scenarioRuntime"]["hauntCardNumber"];
  dust: BetrayalDustRuntimeState | null;
  currentExplorer: BetrayalExplorerSummary;
  otherExplorers: readonly BetrayalExplorerSummary[];
  deadExplorerPlayerIds: readonly string[];
  usedCardIdsThisTurn: readonly string[];
  viewerPlayerId: string;
  interactionMode: PreviewState["interactionMode"];
  selectedTargetPlayerId: string | null;
  resolvePlayerName: (playerId: string, explorerName: string) => string;
}): BetrayalDustPresentation {
  const isDustHauntActive = Boolean(
    phase === "haunt" && hauntCardNumber === 3 && dust,
  );
  const isCurrentExplorerDead = deadExplorerPlayerIds.includes(
    currentExplorer.playerId,
  );
  const sameRoomLivingTargets =
    isDustHauntActive && !isCurrentExplorerDead
      ? otherExplorers.filter(
          (explorer) =>
            explorer.roomId === currentExplorer.roomId &&
            !deadExplorerPlayerIds.includes(explorer.playerId),
        )
      : [];
  const targetPlayerIds = new Set(
    sameRoomLivingTargets.map((target) => target.playerId),
  );
  const isSicknessExchangeAvailable = Boolean(
    sameRoomLivingTargets.length > 0 &&
      !usedCardIdsThisTurn.includes("sickness-exchange"),
  );
  const isSicknessExchangeMode =
    interactionMode === "sicknessExchange" && isSicknessExchangeAvailable;
  const resolvedSelectedTargetPlayerId =
    selectedTargetPlayerId && targetPlayerIds.has(selectedTargetPlayerId)
      ? selectedTargetPlayerId
      : null;
  const selectedTarget = resolvedSelectedTargetPlayerId
    ? (sameRoomLivingTargets.find(
        (explorer) => explorer.playerId === resolvedSelectedTargetPlayerId,
      ) ?? null)
    : null;
  const selectedTargetName = selectedTarget
    ? resolvePlayerName(selectedTarget.playerId, selectedTarget.displayName)
    : null;

  return {
    isDustHauntActive,
    sameRoomLivingTargets,
    targetPlayerIds,
    isSicknessExchangeAvailable,
    isSicknessExchangeMode,
    selectedTargetPlayerId: resolvedSelectedTargetPlayerId,
    selectedTargetName,
    progressItems: resolveBetrayalDustProgressItems({
      t,
      dust,
      currentExplorerPlayerId: currentExplorer.playerId,
      viewerPlayerId,
      isDustHauntActive,
      isSicknessExchangeAvailable,
    }),
  };
}

function resolveBetrayalDustProgressItems({
  t,
  dust,
  currentExplorerPlayerId,
  viewerPlayerId,
  isDustHauntActive,
  isSicknessExchangeAvailable,
}: {
  t: DustPresentationText;
  dust: BetrayalDustRuntimeState | null;
  currentExplorerPlayerId: string;
  viewerPlayerId: string;
  isDustHauntActive: boolean;
  isSicknessExchangeAvailable: boolean;
}): BetrayalDustProgressItem[] {
  if (!isDustHauntActive || !dust) {
    return [];
  }
  const currentExplorerSicknessCount =
    dust.sicknessTokensByPlayerId[currentExplorerPlayerId]?.length ?? 0;
  const viewerDustSicknessValues = (
    dust.sicknessTokensByPlayerId[viewerPlayerId] ?? []
  ).map((token) =>
    token.value === null
      ? t("board.status.hauntDustProgressOwnSicknessUnknown")
      : String(token.value),
  );
  const viewerPermanentInfectionValue =
    dust.permanentTraitorPlayerIds.includes(viewerPlayerId)
      ? t("board.status.hauntDustProgressPermanentInfectionYes")
      : t("board.status.hauntDustProgressPermanentInfectionNo");

  return [
    {
      id: "research",
      label: t("board.haunts.dust.progress.research"),
      value: t("board.status.hauntDustProgressResearchValue", {
        count: dust.researchRoomIds.length,
      }),
    },
    {
      id: "sickness",
      label: t("board.haunts.dust.progress.sickness"),
      value: t("board.status.hauntDustProgressSicknessValue", {
        count: currentExplorerSicknessCount,
      }),
    },
    ...buildViewerSicknessProgressItems({
      t,
      viewerDustSicknessValues,
      viewerPermanentInfectionValue,
    }),
    {
      id: "exchange",
      label: t("board.haunts.dust.progress.exchange"),
      value: isSicknessExchangeAvailable
        ? t("board.status.hauntDustProgressExchangeAvailable")
        : t("board.status.hauntDustProgressExchangeUnavailable"),
    },
  ];
}

function buildViewerSicknessProgressItems({
  t,
  viewerDustSicknessValues,
  viewerPermanentInfectionValue,
}: {
  t: DustPresentationText;
  viewerDustSicknessValues: readonly string[];
  viewerPermanentInfectionValue: string;
}): BetrayalDustProgressItem[] {
  if (viewerDustSicknessValues.length === 0) {
    return [];
  }
  return [
    {
      id: "own-sickness",
      label: t("board.status.hauntDustProgressOwnSicknessLabel"),
      value: viewerDustSicknessValues.join(" / "),
    },
    {
      id: "permanent-infection",
      label: t("board.status.hauntDustProgressPermanentInfectionLabel"),
      value: viewerPermanentInfectionValue,
    },
  ];
}
