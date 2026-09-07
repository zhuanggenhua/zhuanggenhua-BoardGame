import React from "react";
import { ChevronRight, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { HudPortal, UI_Z_INDEX } from "../../core";
import { OptimizedImage } from "../../components/common/media/OptimizedImage";
import type { MatchPlayerInfo } from "../../engine/transport/protocol";
import { playSound } from "../../lib/audio/useGameAudio";
import { EXPLORER_CATALOG, type BetrayalCore, type BetrayalTraitKey } from "./game";
import { BETRAYAL_SCENARIO_PAGE_TURN_KEY } from "./audio.config";
import { BETRAYAL_TITLE_BANNER_ASSET } from "./uiAssets";
import { CinematicNarrationPanel } from "./cinematicNarrationSurface";
import {
  SCENARIO_BOOK_TURN_DURATION_MS,
  buildScenarioReaderPages,
  formatScenarioCardSummary,
  formatScenarioCardTitle,
  isScenarioReaderCinematicSection,
  resolveScenarioCardDossier,
  resolveScenarioReaderSpreadPages,
  type ScenarioBookTurnSnapshot,
} from "./scenarioReader";
import {
  getBetrayalScenarioCardCandidate,
  resolveImplementedScenarioIdForCard,
  type BetrayalScenarioCardId,
} from "./scenarioConfig";
import { ScenarioBookTurnSheet } from "./scenarioBookTurnSurface";
import { TRAIT_LABEL_LOCAL, TRAIT_TONE_CLASS } from "./traitTrackSurface";
import { BETRAYAL_TRAIT_MARKER_ASSETS } from "./traitAssets";
import { resolvePlayerName } from "./playerPresentation";

const SCENARIO_READER_MODAL_Z_INDEX = UI_Z_INDEX.modalContent;

function ExplorerPentagonCard({
  explorer,
  selected,
  ready,
  taken,
  playerLabel,
  compact = false,
  effectiveLocale,
  onClick,
}: {
  explorer: (typeof EXPLORER_CATALOG)[number];
  selected: boolean;
  ready: boolean;
  taken: boolean;
  playerLabel?: string | null;
  compact?: boolean;
  effectiveLocale: string;
  onClick?: () => void;
}) {
  const stateLabel =
    taken && !selected
      ? `${playerLabel ?? "其他玩家"}已占用`
      : ready
        ? `${playerLabel ?? "当前玩家"}已就绪`
        : selected
          ? `${playerLabel ?? "当前玩家"}已选择`
          : "选择";
  const assetHeightClass = compact
    ? "h-[118px] sm:h-[132px] lg:h-[232px]"
    : "h-[108px] sm:h-[148px] lg:h-[280px]";
  const widthClass = compact
    ? "w-[136px] sm:w-[152px] lg:w-[224px]"
    : "w-full max-w-[148px] sm:max-w-[216px] lg:max-w-[348px]";
  const statusBadgeClass =
    taken && !selected
      ? "border-[#5c5548] bg-[rgba(14,14,12,0.82)] text-[#9b917d]"
      : ready
        ? "border-[#77bb77] bg-[rgba(19,43,25,0.86)] text-[#b8f0a8]"
        : selected
          ? "border-[#b5ef42] bg-[rgba(34,55,18,0.88)] text-[#dfff8f]"
          : "border-[#8b744d] bg-[rgba(22,17,12,0.76)] text-[#e4c983]";
  const pentagonClipPath = "polygon(50% 1%, 96% 35%, 79% 99%, 21% 99%, 4% 35%)";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={taken && !selected}
      data-testid={`betrayal-character-card-${explorer.explorerId}`}
      aria-label={`${explorer.displayName}，${stateLabel}`}
      title={stateLabel}
      className={`group relative ${widthClass} text-left transition duration-200 ${
        selected
          ? "drop-shadow-[0_0_28px_rgba(181,239,66,0.44)]"
          : taken
            ? "opacity-55 grayscale"
            : "hover:-translate-y-1 hover:drop-shadow-[0_0_18px_rgba(211,179,109,0.28)]"
      }`}
    >
      <div
        className={`relative flex w-full items-end justify-center ${assetHeightClass}`}
      >
        {selected ? (
          <div
            className="pointer-events-none absolute inset-x-[8%] bottom-[5%] top-[2%] bg-[rgba(181,239,66,0.18)] blur-2xl"
            style={{ clipPath: pentagonClipPath }}
          />
        ) : null}
        {selected || ready || taken ? (
          <div
            data-testid={`betrayal-character-card-${explorer.explorerId}-state-outline`}
            data-highlight-shape="pentagon"
            className={`pointer-events-none absolute inset-x-[8%] bottom-[5%] top-[2%] z-20 border-[3px] ${
              taken && !selected
                ? "border-[#5c5548]/80"
                : ready
                  ? "border-[#77bb77]/90 shadow-[0_0_18px_rgba(119,187,119,0.34)]"
                  : "border-[#b5ef42]/95 shadow-[0_0_22px_rgba(181,239,66,0.42)]"
            }`}
            style={{ clipPath: pentagonClipPath }}
          />
        ) : null}
        <OptimizedImage
          src={explorer.portraitAsset}
          locale={effectiveLocale}
          alt={explorer.displayName}
          className="relative z-10 h-full w-full object-contain"
          draggable={false}
        />
        {selected && playerLabel ? (
          <div
            className="pointer-events-none absolute left-1/2 top-[9%] z-30 -translate-x-1/2 border border-[#b5ef42] bg-[rgba(16,28,12,0.92)] px-2 py-1 text-[10px] font-black leading-none tracking-[0.12em] text-[#dfff8f] shadow-[0_8px_18px_rgba(0,0,0,0.34)]"
            aria-hidden="true"
          >
            {playerLabel}
          </div>
        ) : null}
      </div>
      {playerLabel && !selected ? (
        <div
          className={`pointer-events-none absolute right-2 top-2 z-30 min-w-8 border px-2 py-1 text-center text-[11px] font-black leading-none tracking-[0.08em] shadow-[0_8px_18px_rgba(0,0,0,0.32)] ${statusBadgeClass}`}
          aria-hidden="true"
        >
          {playerLabel}
        </div>
      ) : null}
    </button>
  );
}

export function CharacterSelectScreen({
  core,
  matchData,
  effectiveLocale,
  isPhoneLandscapeLayout,
  viewerPlayerId,
  selectedExplorerId,
  onSelectExplorer,
  onConfirmExplorer,
  onProposeScenarioCard,
  onConfirmScenarioCard,
  onStartScenario,
}: {
  core: BetrayalCore;
  matchData?: MatchPlayerInfo[];
  effectiveLocale: string;
  isPhoneLandscapeLayout: boolean;
  viewerPlayerId: string;
  selectedExplorerId: string;
  onSelectExplorer: (explorerId: string) => void;
  onConfirmExplorer: () => void;
  onProposeScenarioCard: (candidateId: BetrayalScenarioCardId) => void;
  onConfirmScenarioCard: () => void;
  onStartScenario: () => void;
}) {
  const { t } = useTranslation("game-betrayal");
  const selectedExplorer =
    EXPLORER_CATALOG.find((item) => item.explorerId === selectedExplorerId) ??
    EXPLORER_CATALOG[0]!;
  const readySet = new Set(core.readyPlayerIds);
  const isReady = readySet.has(viewerPlayerId);
  const selectedByExplorerId = new Map(
    Object.entries(core.selectedExplorerByPlayerId).map(
      ([playerId, explorerId]) => [explorerId, playerId],
    ),
  );
  const availableExplorer =
    EXPLORER_CATALOG.find((explorer) => {
      const selectedByPlayer =
        selectedByExplorerId.get(explorer.explorerId) ?? null;
      return !selectedByPlayer || selectedByPlayer === viewerPlayerId;
    }) ?? EXPLORER_CATALOG[0]!;
  const scenarioCardCandidates = React.useMemo(
    () =>
      core.scenarioCandidateIds.map((candidateId) =>
        getBetrayalScenarioCardCandidate(candidateId),
      ),
    [core.scenarioCandidateIds],
  );
  const proposedScenarioCard = getBetrayalScenarioCardCandidate(
    core.proposedScenarioCardId,
  );
  const proposedScenarioCardTitle = formatScenarioCardTitle(
    proposedScenarioCard,
    effectiveLocale,
  );
  const proposedScenarioIsPlayable = Boolean(
    resolveImplementedScenarioIdForCard(core.proposedScenarioCardId),
  );
  const scenarioCardConfirmed =
    core.scenarioCardConfirmations[viewerPlayerId] ===
    core.proposedScenarioCardId;
  const scenarioParticipantPlayerIds = Object.keys(
    core.selectedExplorerByPlayerId,
  );
  const scenarioConfirmedCount = scenarioParticipantPlayerIds.filter(
    (playerId) =>
      core.scenarioCardConfirmations[playerId] === core.proposedScenarioCardId,
  ).length;
  const scenarioParticipantCount = scenarioParticipantPlayerIds.length;
  const scenarioAllParticipantsConfirmed =
    scenarioParticipantCount > 0 &&
    scenarioConfirmedCount === scenarioParticipantCount;
  const scenarioConfirmationStatusLabel =
    scenarioParticipantCount > 0
      ? t("board.characterSelect.scenarioConfirmationCount", {
          confirmed: scenarioConfirmedCount,
          total: scenarioParticipantCount,
        })
      : t("board.characterSelect.scenarioNoParticipants");
  const [
    scenarioCardConfirmationSettling,
    setScenarioCardConfirmationSettling,
  ] = React.useState(false);
  const scenarioCardConfirmationSettlingRef = React.useRef(false);
  const scenarioCardConfirmationSettlingTimerRef =
    React.useRef<number | null>(null);
  const primaryActionDisabled =
    isReady &&
    scenarioCardConfirmed &&
    (!scenarioAllParticipantsConfirmed ||
      !proposedScenarioIsPlayable ||
      scenarioCardConfirmationSettling);
  const primaryActionLabel = !isReady
    ? t("board.characterSelect.confirm")
    : !scenarioCardConfirmed
      ? t("board.characterSelect.confirmScenarioCard")
      : !scenarioAllParticipantsConfirmed
        ? t("board.characterSelect.scenarioConfirmed")
      : proposedScenarioIsPlayable
        ? t("board.characterSelect.startScenario")
        : t("board.characterSelect.cannotStartPendingScenario");
  const [scenarioSelectionOpen, setScenarioSelectionOpen] =
    React.useState(false);
  const [scenarioDetailsOpen, setScenarioDetailsOpen] = React.useState(false);
  const [scenarioReaderSpreadIndex, setScenarioReaderSpreadIndex] =
    React.useState(0);
  const [scenarioReaderTurnDirection, setScenarioReaderTurnDirection] =
    React.useState<"back" | "forward" | null>(null);
  const [scenarioReaderTurnSnapshot, setScenarioReaderTurnSnapshot] =
    React.useState<ScenarioBookTurnSnapshot | null>(null);

  React.useEffect(() => {
    if (!isReady) {
      setScenarioSelectionOpen(false);
      setScenarioDetailsOpen(false);
      setScenarioReaderSpreadIndex(0);
      setScenarioReaderTurnSnapshot(null);
    }
  }, [isReady]);
  React.useEffect(
    () => () => {
      if (scenarioCardConfirmationSettlingTimerRef.current) {
        window.clearTimeout(scenarioCardConfirmationSettlingTimerRef.current);
      }
    },
    [],
  );

  const handlePrimaryAction = React.useCallback(() => {
    if (!isReady) {
      onConfirmExplorer();
      return;
    }
    if (!scenarioCardConfirmed) {
      scenarioCardConfirmationSettlingRef.current = true;
      setScenarioCardConfirmationSettling(true);
      if (scenarioCardConfirmationSettlingTimerRef.current) {
        window.clearTimeout(scenarioCardConfirmationSettlingTimerRef.current);
      }
      onConfirmScenarioCard();
      scenarioCardConfirmationSettlingTimerRef.current = window.setTimeout(() => {
        scenarioCardConfirmationSettlingRef.current = false;
        setScenarioCardConfirmationSettling(false);
        scenarioCardConfirmationSettlingTimerRef.current = null;
      }, 350);
      return;
    }
    if (scenarioCardConfirmationSettlingRef.current) {
      return;
    }
    onStartScenario();
  }, [
    isReady,
    onConfirmExplorer,
    onConfirmScenarioCard,
    onStartScenario,
    scenarioCardConfirmed,
  ]);

  const handleScenarioCardPropose = React.useCallback(
    (candidateId: BetrayalScenarioCardId) => {
      onProposeScenarioCard(candidateId);
      setScenarioDetailsOpen(false);
      setScenarioReaderSpreadIndex(0);
      setScenarioReaderTurnSnapshot(null);
    },
    [onProposeScenarioCard],
  );

  const handleScenarioDialogClose = React.useCallback(
    (event?: React.SyntheticEvent) => {
      event?.stopPropagation();
      window.setTimeout(() => {
        setScenarioSelectionOpen(false);
        setScenarioDetailsOpen(false);
        setScenarioReaderSpreadIndex(0);
        setScenarioReaderTurnSnapshot(null);
      }, 0);
    },
    [
      setScenarioDetailsOpen,
      setScenarioReaderSpreadIndex,
      setScenarioSelectionOpen,
    ],
  );
  const handleScenarioReaderClose = React.useCallback(
    (event?: React.SyntheticEvent) => {
      event?.stopPropagation();
      setScenarioDetailsOpen(false);
      setScenarioReaderSpreadIndex(0);
      setScenarioReaderTurnSnapshot(null);
    },
    [],
  );
  const handleScenarioDetailsOpen = React.useCallback(
    (event: React.SyntheticEvent) => {
      event.stopPropagation();
      setScenarioDetailsOpen(true);
    },
    [],
  );
  const scenarioReaderDossier = resolveScenarioCardDossier(
    proposedScenarioCard,
  );
  const scenarioReaderTitle = t(scenarioReaderDossier.titleKey);
  // 角色选择阶段只是阅读剧本预览，不属于进入游戏后的开局剧情幕。
  // 开局黑幕只由 preHaunt 的真实开始流程负责展示。
  const scenarioReaderOpeningSection = null;
  const scenarioReaderPages = buildScenarioReaderPages(
    scenarioReaderDossier,
    "all",
  );
  const scenarioReaderBookSpreadCount = Math.max(
    1,
    Math.ceil(scenarioReaderPages.length / 2),
  );
  const scenarioReaderHasOpeningStage = false;
  const scenarioReaderSpreadCount =
    scenarioReaderBookSpreadCount + (scenarioReaderHasOpeningStage ? 1 : 0);
  const isScenarioReaderOpeningStage =
    scenarioReaderHasOpeningStage && scenarioReaderSpreadIndex === 0;
  const scenarioReaderBookSpreadIndex = scenarioReaderHasOpeningStage
    ? Math.max(0, scenarioReaderSpreadIndex - 1)
    : scenarioReaderSpreadIndex;
  const scenarioReaderLeftPage =
    scenarioReaderPages[scenarioReaderBookSpreadIndex * 2] ?? null;
  const scenarioReaderRightPage =
    scenarioReaderPages[scenarioReaderBookSpreadIndex * 2 + 1] ?? null;
  const canTurnScenarioReaderBack = scenarioReaderSpreadIndex > 0;
  const canTurnScenarioReaderForward =
    scenarioReaderSpreadIndex < scenarioReaderSpreadCount - 1;
  const handleScenarioReaderTurn = (direction: "back" | "forward") => {
    const nextSpreadIndex =
      direction === "back"
        ? Math.max(0, scenarioReaderSpreadIndex - 1)
        : Math.min(
            scenarioReaderSpreadCount - 1,
            scenarioReaderSpreadIndex + 1,
          );
    const didTurn = nextSpreadIndex !== scenarioReaderSpreadIndex;
    if (!didTurn) return;
    setScenarioReaderTurnSnapshot({
      fromPages: resolveScenarioReaderSpreadPages(
        scenarioReaderPages,
        scenarioReaderHasOpeningStage,
        scenarioReaderSpreadIndex,
      ),
      toPages: resolveScenarioReaderSpreadPages(
        scenarioReaderPages,
        scenarioReaderHasOpeningStage,
        nextSpreadIndex,
      ),
    });
    playSound(BETRAYAL_SCENARIO_PAGE_TURN_KEY);
    setScenarioReaderTurnDirection(direction);
    setScenarioReaderSpreadIndex(nextSpreadIndex);
    window.setTimeout(() => {
      setScenarioReaderTurnDirection(null);
      setScenarioReaderTurnSnapshot(null);
    }, SCENARIO_BOOK_TURN_DURATION_MS + 80);
  };

  return (
    <div
      data-testid="betrayal-character-select-screen"
      data-tutorial-id="betrayal-character-select-screen"
      className="relative flex h-full min-h-full flex-col overflow-hidden bg-[#09110f] text-[#f1e8d4]"
      style={{
        backgroundImage: [
          "radial-gradient(circle at 18% 22%, rgba(118,178,82,0.16), transparent 19%)",
          "radial-gradient(circle at 72% 14%, rgba(196,167,98,0.08), transparent 24%)",
          "repeating-linear-gradient(90deg, rgba(38,52,44,0.03) 0 2px, rgba(0,0,0,0) 2px 28px)",
          "linear-gradient(180deg, #10201a 0%, #07100e 100%)",
        ].join(","),
      }}
    >
      <div className="mx-auto flex h-full w-full max-w-[1760px] p-1.5 sm:p-2 lg:p-4">
        <div className="relative flex h-full w-full flex-col overflow-hidden border border-[#7d643a] bg-[rgba(8,15,13,0.94)] shadow-[0_24px_60px_rgba(0,0,0,0.42)]">
          <div className="pointer-events-none absolute inset-0 border border-[rgba(216,191,129,0.14)]" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(132,170,82,0.06),transparent_28%)]" />
          <div className="pointer-events-none absolute left-1 top-1 h-4 w-4 border-l border-t border-[rgba(216,191,129,0.6)]" />
          <div className="pointer-events-none absolute right-1 top-1 h-4 w-4 border-r border-t border-[rgba(216,191,129,0.6)]" />
          <div className="pointer-events-none absolute bottom-1 left-1 h-4 w-4 border-b border-l border-[rgba(216,191,129,0.6)]" />
          <div className="pointer-events-none absolute bottom-1 right-1 h-4 w-4 border-b border-r border-[rgba(216,191,129,0.6)]" />

          <header className="grid min-h-[64px] grid-cols-[minmax(132px,1fr)_minmax(0,1fr)_86px] border-b border-[#6a5637] bg-[linear-gradient(180deg,rgba(10,16,14,0.98),rgba(9,15,13,0.94))] sm:grid-cols-[minmax(180px,1fr)_minmax(0,1fr)_112px] lg:min-h-[104px] lg:grid-cols-[360px_1fr_240px]">
            <div className="relative flex items-center overflow-hidden border-r border-[#5e4b2e] px-2 py-2 sm:px-3 lg:px-6 lg:py-3">
              <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(214,191,129,0.26),transparent)]" />
              <div className="pointer-events-none absolute inset-x-4 bottom-0 h-px bg-[linear-gradient(90deg,transparent,rgba(214,191,129,0.14),transparent)]" />
              <div className="relative flex h-[46px] w-full items-center overflow-hidden border border-[rgba(214,191,129,0.28)] bg-[linear-gradient(180deg,rgba(8,12,11,0.74),rgba(5,8,7,0.92))] px-2 shadow-[inset_0_0_0_1px_rgba(214,191,129,0.08)] lg:h-[72px] lg:px-3">
                <div className="pointer-events-none absolute inset-[3px] border border-[rgba(214,191,129,0.12)]" />
                <OptimizedImage
                  src={BETRAYAL_TITLE_BANNER_ASSET}
                  locale={effectiveLocale}
                  alt={t("title")}
                  className="relative h-[34px] w-full object-contain object-left lg:h-[56px]"
                  draggable={false}
                />
              </div>
            </div>
            <div className="relative flex items-center justify-center px-2 py-2 text-center lg:px-6 lg:py-4">
              <div className="pointer-events-none absolute left-[16%] top-1/2 hidden items-center gap-2 lg:flex">
                <span className="h-px w-16 bg-[linear-gradient(90deg,transparent,#9f854d)]" />
                <span className="h-1.5 w-1.5 rotate-45 border border-[rgba(209,177,111,0.72)] bg-[rgba(209,177,111,0.14)]" />
              </div>
              <div className="pointer-events-none absolute right-[16%] top-1/2 hidden items-center gap-2 lg:flex">
                <span className="h-1.5 w-1.5 rotate-45 border border-[rgba(209,177,111,0.72)] bg-[rgba(209,177,111,0.14)]" />
                <span className="h-px w-16 bg-[linear-gradient(90deg,#9f854d,transparent)]" />
              </div>
              <div className="text-[15px] font-semibold uppercase tracking-[0.16em] text-[#e7c783] sm:text-[18px] lg:text-[24px] lg:tracking-[0.28em]">
                {t("board.characterSelect.title")}
              </div>
            </div>
            <div className="border-l border-[#5e4b2e]">
              <div className="flex h-full flex-col items-center justify-center px-2 py-2 text-center lg:px-4 lg:py-3">
                <div className="text-[10px] uppercase tracking-[0.16em] text-[#d8bf81] lg:text-xs lg:tracking-[0.2em]">
                  {t("board.characterSelect.playersLabel")}
                </div>
                <div className="mt-0.5 text-[16px] font-semibold text-[#a8e850] lg:mt-1 lg:text-[22px]">
                  {core.readyPlayerIds.length}/{core.playerIds.length}
                </div>
                <div className="mt-0.5 text-[9px] uppercase tracking-[0.12em] text-[#9e8c69] lg:mt-1 lg:text-[10px] lg:tracking-[0.16em]">
                  {t("board.characterSelect.readyCountLabel")}
                </div>
              </div>
            </div>
          </header>

          <main className="grid min-h-0 flex-1 grid-cols-[minmax(212px,34%)_minmax(0,1fr)] gap-0 px-2 pb-2 pt-2 sm:grid-cols-[minmax(270px,35%)_minmax(0,1fr)] lg:grid-cols-[440px_minmax(0,1fr)] lg:px-5 lg:pb-3 lg:pt-4 xl:grid-cols-[472px_minmax(0,1fr)]">
            <aside className="relative flex min-h-0 flex-col pr-1.5 lg:pr-6">
              <div className="pointer-events-none absolute right-0 top-2 bottom-2 w-px bg-[linear-gradient(180deg,transparent,rgba(214,191,129,0.22),rgba(214,191,129,0.22),transparent)]" />
              <section
                data-testid="betrayal-character-detail-scroll"
                className="custom-scrollbar relative flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain px-1.5 pb-1.5 pt-1.5 lg:px-5 lg:pb-4 lg:pt-4"
              >
                <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(214,191,129,0.28),transparent)]" />
                <div className="pointer-events-none absolute inset-x-4 bottom-0 h-px bg-[linear-gradient(90deg,transparent,rgba(214,191,129,0.14),transparent)]" />
                <div className="flex justify-center px-1 pt-0 lg:px-2 lg:pt-1">
                  <ExplorerPentagonCard
                    explorer={selectedExplorer}
                    selected
                    ready={isReady}
                    taken={false}
                    effectiveLocale={effectiveLocale}
                  />
                </div>
                <section className="relative mt-0.5 flex-1 overflow-visible px-0 pb-1 pt-1 lg:mt-2 lg:px-1 lg:pb-2 lg:pt-2">
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(214,191,129,0.34),transparent)]" />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,transparent,rgba(214,191,129,0.14),transparent)]" />
                  <div className="grid gap-0.5 lg:gap-2">
                    <h2 className="truncate text-[12px] font-semibold uppercase tracking-[0.03em] text-[#f3dfae] sm:text-[14px] lg:text-[24px] lg:tracking-[0.14em]">
                      {selectedExplorer.displayName}
                    </h2>
                    <div className="flex flex-wrap items-center gap-1 text-[7.5px] uppercase tracking-[0.06em] text-[#b9aa84] lg:text-[10px] lg:tracking-[0.12em]">
                      <span className="inline-flex items-center gap-1 rounded-[4px] border border-[rgba(214,191,129,0.18)] bg-[rgba(15,16,13,0.42)] px-1.5 py-0.5 lg:px-2 lg:py-1">
                        <span className="h-1.5 w-1.5 rounded-[2px] bg-[#d8bf81]" />
                        {t("board.characterSelect.currentSelection")}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-[4px] border border-[rgba(110,133,66,0.26)] bg-[rgba(23,33,19,0.36)] px-1.5 py-0.5 text-[#b5ef42] lg:px-2 lg:py-1">
                        <span className="h-1.5 w-1.5 rounded-[2px] bg-[#b5ef42]" />
                        {isReady
                          ? t("board.characterSelect.ready")
                          : t("board.characterSelect.pending")}
                      </span>
                    </div>
                  </div>
                  <div className="relative mt-1 px-0.5 py-0.5 lg:mt-2 lg:px-0.5 lg:py-0.5">
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(214,191,129,0.18),transparent)]" />
                    <div className="mb-1 flex items-center gap-1.5 text-[7.5px] font-semibold uppercase tracking-[0.1em] text-[#d8bf81] lg:mb-2 lg:gap-2 lg:text-[10px] lg:tracking-[0.16em]">
                      <span className="h-px flex-1 bg-[linear-gradient(90deg,transparent,rgba(214,191,129,0.28))]" />
                      <span>{t("board.characterSelect.traitsTitle")}</span>
                      <span className="h-px flex-1 bg-[linear-gradient(90deg,rgba(214,191,129,0.28),transparent)]" />
                    </div>
                    <div className="grid gap-1 lg:gap-2">
                      {(
                        [
                          "might",
                          "speed",
                          "knowledge",
                          "sanity",
                        ] as BetrayalTraitKey[]
                      ).map((trait) => (
                        <div
                          key={trait}
                          className="grid grid-cols-[38px_minmax(0,1fr)_14px] items-center gap-1 text-[8px] sm:grid-cols-[56px_minmax(0,1fr)_18px] sm:gap-1.5 sm:text-[10px] lg:grid-cols-[92px_minmax(0,1fr)_28px] lg:gap-3 lg:text-sm"
                        >
                          <span
                            className={`inline-flex items-center gap-1 font-semibold ${TRAIT_TONE_CLASS[trait].text}`}
                          >
                            <OptimizedImage
                              src={BETRAYAL_TRAIT_MARKER_ASSETS[trait]}
                              locale={effectiveLocale}
                              alt=""
                              className="h-2 w-2 object-contain opacity-86 sm:h-2.5 sm:w-2.5 lg:h-4 lg:w-4"
                              draggable={false}
                            />
                            {TRAIT_LABEL_LOCAL[trait]}
                          </span>
                          <div className="grid grid-cols-6 gap-[2px] lg:gap-1.5">
                            {Array.from({ length: 6 }).map((_, index) => (
                              <span
                                key={index}
                                className={`h-1 rounded-[2px] border sm:h-1.5 lg:h-3.5 ${
                                  index < selectedExplorer.traits[trait]
                                    ? TRAIT_TONE_CLASS[trait].active
                                    : TRAIT_TONE_CLASS[trait].inactive
                                }`}
                              />
                            ))}
                          </div>
                          <span className="text-right text-[10px] font-semibold text-[#f1e8d4] sm:text-[11px] lg:text-base">
                            {selectedExplorer.traits[trait]}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-1 border-t border-[rgba(78,65,45,0.54)] pt-1 lg:mt-2 lg:pt-2">
                    <div className="relative px-0.5 py-0.5">
                      <div
                        data-testid="betrayal-character-ability-summary"
                        className="relative flex min-h-[36px] w-full items-start gap-1.5 rounded-[6px] border border-[rgba(110,133,66,0.46)] bg-[rgba(23,33,19,0.62)] px-2 py-1.5 text-left text-[10px] font-medium leading-relaxed tracking-[0.04em] text-[#e4f3d4] lg:min-h-[44px] lg:px-2.5 lg:text-[10px] lg:tracking-[0.06em]"
                      >
                        <span className="h-1.5 w-1.5 shrink-0 rounded-[2px] bg-[#b5ef42]" />
                        <span className="shrink-0 font-semibold text-[#d8bf81]">
                          {t("board.characterSelect.abilityTitle")}：
                        </span>
                        <span className="font-semibold text-[#b5ef42]">
                          {selectedExplorer.abilityName}：
                        </span>
                        <span className="min-w-0 flex-1 text-[#e4f3d4]">
                          {selectedExplorer.abilityText}
                        </span>
                      </div>
                    </div>
                  </div>
                </section>
              </section>
            </aside>

            <section className="relative flex min-h-0 items-stretch justify-center px-0 lg:px-5">
              <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(214,191,129,0.16),transparent)]" />
              <div className="pointer-events-none absolute inset-x-10 bottom-0 h-px bg-[linear-gradient(90deg,transparent,rgba(214,191,129,0.12),transparent)]" />
              <div
                className="no-scrollbar hidden min-h-0 max-w-[1056px] grid-cols-3 content-start justify-items-center gap-x-12 gap-y-10 overflow-x-hidden overflow-y-auto overscroll-contain py-4 lg:grid"
                data-testid="betrayal-character-selection-grid"
                data-tutorial-id="betrayal-character-selection-grid"
              >
                {EXPLORER_CATALOG.map((explorer) => {
                  const selectedByPlayer =
                    selectedByExplorerId.get(explorer.explorerId) ?? null;
                  const selected = explorer.explorerId === selectedExplorerId;
                  const taken = Boolean(
                    selectedByPlayer && selectedByPlayer !== viewerPlayerId,
                  );
                  const visualOwnerPlayerId =
                    selectedByPlayer ?? (selected ? viewerPlayerId : null);
                  return (
                    <ExplorerPentagonCard
                      key={explorer.explorerId}
                      explorer={explorer}
                      compact
                      selected={selected}
                      ready={
                        selectedByPlayer
                          ? readySet.has(selectedByPlayer)
                          : false
                      }
                      taken={taken}
                      playerLabel={
                        visualOwnerPlayerId
                          ? `P${core.playerIds.indexOf(visualOwnerPlayerId) + 1}`
                          : null
                      }
                      effectiveLocale={effectiveLocale}
                      onClick={() => onSelectExplorer(explorer.explorerId)}
                    />
                  );
                })}
              </div>
              <div
                className="no-scrollbar grid h-full min-h-0 w-full grid-cols-3 content-start justify-items-center gap-x-1 gap-y-1.5 overflow-x-hidden overflow-y-auto overscroll-contain px-0.5 py-0.5 sm:gap-x-2 sm:gap-y-1.5 lg:hidden"
                data-testid="betrayal-character-mobile-grid"
              >
                {EXPLORER_CATALOG.map((explorer) => {
                  const selectedByPlayer =
                    selectedByExplorerId.get(explorer.explorerId) ?? null;
                  const selected = explorer.explorerId === selectedExplorerId;
                  const taken = Boolean(
                    selectedByPlayer && selectedByPlayer !== viewerPlayerId,
                  );
                  const visualOwnerPlayerId =
                    selectedByPlayer ?? (selected ? viewerPlayerId : null);
                  return (
                    <ExplorerPentagonCard
                      key={explorer.explorerId}
                      explorer={explorer}
                      compact
                      selected={selected}
                      ready={
                        selectedByPlayer
                          ? readySet.has(selectedByPlayer)
                          : false
                      }
                      taken={taken}
                      playerLabel={
                        visualOwnerPlayerId
                          ? `P${core.playerIds.indexOf(visualOwnerPlayerId) + 1}`
                          : null
                      }
                      effectiveLocale={effectiveLocale}
                      onClick={() => onSelectExplorer(explorer.explorerId)}
                    />
                  );
                })}
              </div>
            </section>
          </main>

          <footer className="grid grid-cols-[minmax(0,1fr)_minmax(220px,260px)] border-t border-[#6a5637] bg-[linear-gradient(180deg,rgba(10,16,14,0.98),rgba(9,15,13,0.94))] lg:grid-cols-[minmax(0,1fr)_520px]">
            <div className="grid grid-cols-[54px_repeat(6,minmax(34px,1fr))] overflow-hidden lg:grid-cols-[124px_repeat(6,minmax(92px,1fr))]">
              <div className="flex flex-col justify-center border-r border-[#5e4b2e] px-1 py-1.5 text-center lg:px-3 lg:py-3">
                <div className="text-[8px] uppercase tracking-[0.12em] text-[#d8bf81] lg:text-[11px] lg:tracking-[0.2em]">
                  {t("board.characterSelect.playersLabel")}
                </div>
                <div className="mt-0.5 text-[13px] font-semibold text-[#a8e850] lg:mt-1 lg:text-[16px]">
                  {core.readyPlayerIds.length}/{core.playerIds.length}
                </div>
              </div>
              {Array.from({ length: 6 }).map((_, seatIndex) => {
                const playerId = core.playerIds[seatIndex] ?? null;
                const selectedId = playerId
                  ? (core.selectedExplorerByPlayerId[playerId] ??
                    (playerId === viewerPlayerId ? selectedExplorerId : null))
                  : null;
                const playerName = playerId
                  ? resolvePlayerName(
                      playerId,
                      `玩家${seatIndex + 1}`,
                      matchData,
                    )
                  : "—";
                const ready = playerId ? readySet.has(playerId) : false;
                const seatExplorer = selectedId
                  ? (EXPLORER_CATALOG.find(
                      (explorer) => explorer.explorerId === selectedId,
                    ) ?? null)
                  : null;
                return (
                  <div
                    key={playerId ?? `empty-seat-${seatIndex}`}
                    className={`flex min-w-0 flex-col items-center justify-center border-r border-[#5e4b2e] px-0.5 py-1 text-center last:border-r-0 lg:px-2 lg:py-2 ${
                      selectedId
                        ? "bg-[rgba(75,116,59,0.08)] text-[#d9f0b8]"
                        : "bg-[rgba(9,13,12,0.22)] text-[#8d8678]"
                    }`}
                  >
                    <div
                      className={`grid h-[28px] w-[28px] place-items-center overflow-hidden sm:h-[34px] sm:w-[34px] lg:h-[66px] lg:w-[66px] ${
                        selectedId
                          ? "bg-[rgba(13,19,16,0.78)]"
                          : "bg-[rgba(13,17,15,0.56)]"
                      }`}
                    >
                      {seatExplorer ? (
                        <OptimizedImage
                          src={seatExplorer.portraitAsset}
                          locale={effectiveLocale}
                          alt={seatExplorer.displayName}
                          className="h-full w-full object-contain drop-shadow-[0_8px_18px_rgba(0,0,0,0.34)]"
                          draggable={false}
                        />
                      ) : (
                        <span className="text-[24px] text-[#3f473f]">—</span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[9px] font-semibold tracking-[0.08em] text-[#d7bf85] lg:mt-1 lg:text-[11px] lg:tracking-[0.12em]">
                      P{seatIndex + 1}
                    </div>
                    <div className="hidden mt-0.5 max-w-[82px] truncate text-[11px] lg:block">
                      {playerName}
                    </div>
                    <div
                      className={`mt-0.5 inline-flex items-center gap-1 rounded-[4px] px-1 py-0.5 text-[8px] lg:mt-1 lg:px-2 lg:text-[10px] ${
                        ready
                          ? "border border-[rgba(132,171,82,0.42)] bg-[rgba(39,57,28,0.42)] text-[#b5ef42]"
                          : selectedId
                            ? "border border-[rgba(214,191,129,0.22)] bg-[rgba(39,31,18,0.28)] text-[#d8bf81]"
                            : "border border-[rgba(93,79,54,0.18)] bg-transparent text-[#676253]"
                      }`}
                    >
                      {ready
                        ? t("board.characterSelect.ready")
                        : selectedId
                          ? t("board.characterSelect.pending")
                          : t("board.characterSelect.emptySeat")}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-[58px_minmax(92px,0.72fr)_minmax(0,1fr)] lg:grid-cols-[120px_minmax(170px,0.75fr)_minmax(0,1fr)]">
              <button
                type="button"
                onClick={() => onSelectExplorer(availableExplorer.explorerId)}
                className="relative inline-flex min-h-[58px] items-center justify-center gap-1 border-l border-[#5e4b2e] px-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#d8bf81] transition hover:bg-[rgba(214,191,129,0.06)] lg:min-h-[126px] lg:gap-3 lg:text-[16px] lg:tracking-[0.18em]"
              >
                <span className="pointer-events-none absolute inset-y-3 left-0 w-px bg-[linear-gradient(180deg,transparent,rgba(214,191,129,0.18),transparent)]" />
                {t("board.characterSelect.random")}
              </button>
              <button
                type="button"
                onClick={() => setScenarioSelectionOpen(true)}
                data-testid="betrayal-character-scenario-button"
                aria-haspopup="dialog"
                aria-expanded={scenarioSelectionOpen}
                className="relative inline-flex min-h-[58px] min-w-0 flex-col items-center justify-center gap-0.5 border-l border-[#5e4b2e] px-1 text-center transition hover:bg-[rgba(214,191,129,0.06)] lg:min-h-[126px] lg:px-3"
              >
                <span className="text-[8px] font-semibold uppercase tracking-[0.12em] text-[#c9a35e] lg:text-[11px] lg:tracking-[0.18em]">
                  {t("board.characterSelect.scenarioSelected")}
                </span>
                <span className="max-w-full truncate text-[11px] font-bold tracking-[0.04em] text-[#fff0b8] lg:text-[17px]">
                  {proposedScenarioCardTitle}
                </span>
                <span className="mt-0.5 max-w-full truncate text-[8px] font-semibold uppercase tracking-[0.08em] text-[#9fb98b] lg:text-[10px]">
                  {scenarioCardConfirmed
                    ? t("board.characterSelect.scenarioConfirmed")
                    : t("board.characterSelect.scenarioNeedsConfirmation")}
                </span>
                <span
                  data-testid="betrayal-scenario-confirmation-count"
                  className="mt-0.5 max-w-full truncate text-[8px] font-semibold uppercase tracking-[0.08em] text-[#d6b56d] lg:text-[10px]"
                >
                  {scenarioConfirmationStatusLabel}
                </span>
              </button>
              <button
                type="button"
                onClick={handlePrimaryAction}
                disabled={primaryActionDisabled}
                data-testid="betrayal-character-confirm"
                data-tutorial-id="betrayal-character-confirm"
                className={`relative inline-flex min-h-[58px] items-center justify-center gap-2 border-l border-[#5e4b2e] px-2 text-[15px] font-semibold uppercase tracking-[0.1em] shadow-[inset_0_0_0_1px_rgba(181,239,66,0.12)] transition lg:min-h-[126px] lg:text-[26px] lg:tracking-[0.18em] ${
                  primaryActionDisabled
                    ? "cursor-not-allowed bg-[linear-gradient(180deg,rgba(78,72,58,0.22),rgba(31,30,25,0.72))] text-[#9b9178]"
                    : "bg-[linear-gradient(180deg,rgba(95,135,44,0.24),rgba(54,81,22,0.76))] text-[#dfff8f] hover:bg-[linear-gradient(180deg,rgba(108,149,51,0.3),rgba(61,91,25,0.82))]"
                }`}
              >
                <span className="pointer-events-none absolute inset-2 border border-[rgba(181,239,66,0.16)]" />
                {primaryActionLabel}
              </button>
            </div>
          </footer>
        </div>
      </div>
      {scenarioSelectionOpen ? (
        <HudPortal>
          <div
            role="dialog"
            aria-modal="true"
            data-testid="betrayal-scenario-select-dialog"
            className="pointer-events-auto fixed inset-0 grid place-items-center bg-[rgba(2,6,5,0.72)] px-4 py-3"
            style={{ zIndex: SCENARIO_READER_MODAL_Z_INDEX }}
            onClick={handleScenarioDialogClose}
          >
            <div
              className="pointer-events-auto relative max-h-[calc(100vh-24px)] w-full max-w-[640px] overflow-y-auto border border-[#7b633d] bg-[linear-gradient(135deg,rgba(48,37,22,0.98),rgba(20,17,12,0.98)_46%,rgba(7,10,8,0.98))] p-3 text-[#f3e0b4] shadow-[0_26px_70px_rgba(0,0,0,0.58)] lg:p-5"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="pointer-events-none absolute inset-2 border border-[rgba(214,191,129,0.16)]" />
              <div className="pointer-events-none absolute left-0 top-0 h-full w-2 bg-[linear-gradient(180deg,rgba(198,152,71,0.5),rgba(58,31,18,0.34))]" />
              <div className="relative">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.26em] text-[#c9a35e] lg:text-[12px]">
                      {t("board.characterSelect.scenarioDossier")}
                    </div>
                    <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-[#8f8065]">
                      {t("board.characterSelect.scenarioCaseNo")}
                    </div>
                  </div>
                  <div className="border border-[rgba(214,191,129,0.3)] bg-[rgba(10,12,9,0.48)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#d6b56d]">
                    {t("board.characterSelect.scenarioOnly")}
                  </div>
                </div>
                <div className="mt-3 border-l-2 border-[rgba(214,191,129,0.34)] pl-3 text-[12px] leading-5 text-[#e8dfc8] lg:text-[14px]">
                  {t("board.characterSelect.scenarioStepSubtitle")}
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-[rgba(214,191,129,0.16)] pt-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#c9a35e]">
                    {t("board.characterSelect.scenarioCardsTitle")}
                  </div>
                  <div
                    data-testid="betrayal-scenario-candidate-count"
                    className="border border-[rgba(214,191,129,0.24)] bg-[rgba(10,12,9,0.38)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#d6b56d]"
                  >
                    {t("board.characterSelect.scenarioCardsCount")}
                  </div>
                  <div
                    data-testid="betrayal-scenario-dialog-confirmation-count"
                    className="border border-[rgba(214,191,129,0.24)] bg-[rgba(10,12,9,0.38)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#d6b56d]"
                  >
                    {scenarioConfirmationStatusLabel}
                  </div>
                </div>
                <div
                  data-testid="betrayal-scenario-candidate-list"
                  className="mt-3 grid gap-2"
                >
                  {scenarioCardCandidates.map((candidate) => {
                    const isProposed =
                      candidate.id === core.proposedScenarioCardId;
                    const isConfirmed =
                      core.scenarioCardConfirmations[viewerPlayerId] ===
                      candidate.id;
                    const isPlayable =
                      candidate.implementationStatus !== "contract-pending";
                    const candidateTitle = formatScenarioCardTitle(
                      candidate,
                      effectiveLocale,
                    );
                    return (
                      <button
                        key={candidate.id}
                        type="button"
                        data-testid={`betrayal-scenario-option-${candidate.id}`}
                        data-scenario-card-status={candidate.implementationStatus}
                        aria-pressed={isProposed}
                        onClick={() => handleScenarioCardPropose(candidate.id)}
                        className={`group relative w-full border p-3 text-left shadow-[inset_0_0_0_1px_rgba(255,240,184,0.08)] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e2c57e] lg:p-4 ${
                          isProposed
                            ? "border-[#b5ef42] bg-[linear-gradient(180deg,rgba(54,63,25,0.94),rgba(21,27,16,0.96))]"
                            : "border-[#8b7044] bg-[linear-gradient(180deg,rgba(54,43,25,0.92),rgba(21,23,16,0.94))] hover:border-[#d6bf81]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-[17px] font-bold tracking-[0.06em] text-[#fff0b8] lg:text-[22px]">
                              {candidateTitle}
                            </div>
                            <div className="mt-1 text-[12px] uppercase tracking-[0.1em] text-[#9fb98b]">
                              {t("board.characterSelect.scenarioCardMeta", {
                                card: candidate.scenarioCardLabel,
                                omen: candidate.triggerOmenLabel,
                              })}
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <span className="border border-[rgba(214,191,129,0.28)] bg-[rgba(10,12,9,0.44)] px-2 py-1 text-[12px] font-bold uppercase tracking-[0.1em] text-[#d6b56d]">
                              {t("board.characterSelect.scenarioHauntNumber", {
                                number: candidate.hauntNumber,
                              })}
                            </span>
                            <span
                              className={`border px-2 py-1 text-[12px] font-bold uppercase tracking-[0.1em] ${
                                isPlayable
                                  ? "border-[rgba(181,239,66,0.36)] bg-[rgba(34,48,20,0.54)] text-[#dfff8f]"
                                  : "border-[rgba(214,191,129,0.28)] bg-[rgba(54,43,25,0.42)] text-[#cbb889]"
                              }`}
                            >
                              {isPlayable
                                ? t("board.characterSelect.scenarioImplemented")
                                : t(
                                    "board.characterSelect.scenarioContractPending",
                                  )}
                            </span>
                          </div>
                        </div>
                        <div className="mt-2 text-[12px] leading-5 text-[#e8dfc8] lg:text-[13px]">
                          {formatScenarioCardSummary(
                            candidate,
                            effectiveLocale,
                          )}
                        </div>
                        {isProposed || isConfirmed ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {isProposed ? (
                              <span className="border border-[rgba(181,239,66,0.32)] bg-[rgba(39,57,28,0.42)] px-2 py-1 text-[12px] font-bold uppercase tracking-[0.1em] text-[#dfff8f]">
                                {t("board.characterSelect.scenarioProposed")}
                              </span>
                            ) : null}
                            {isConfirmed ? (
                              <span className="border border-[rgba(132,171,82,0.42)] bg-[rgba(39,57,28,0.42)] px-2 py-1 text-[12px] font-bold uppercase tracking-[0.1em] text-[#b5ef42]">
                                {t("board.characterSelect.scenarioConfirmed")}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[rgba(214,191,129,0.16)] pt-3">
                  <button
                    type="button"
                    data-testid="betrayal-scenario-detail-toggle"
                    aria-haspopup="dialog"
                    aria-expanded={scenarioDetailsOpen}
                    disabled={!proposedScenarioIsPlayable}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={handleScenarioDetailsOpen}
                    className={`inline-flex min-h-11 items-center justify-center border px-3 text-[12px] font-semibold uppercase tracking-[0.1em] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e2c57e] ${
                      proposedScenarioIsPlayable
                        ? "cursor-pointer border-[rgba(214,191,129,0.42)] bg-[rgba(18,23,18,0.78)] text-[#e2c57e] hover:border-[#e2c57e]"
                        : "cursor-not-allowed border-[rgba(114,101,78,0.28)] bg-[rgba(18,18,16,0.58)] text-[#8f8065]"
                    }`}
                  >
                    {t("board.characterSelect.viewScenarioDetails")}
                  </button>
                  <button
                    type="button"
                    data-testid="betrayal-scenario-select-current"
                    disabled={!isReady}
                    onClick={(event) => {
                      event.stopPropagation();
                      onConfirmScenarioCard();
                      handleScenarioDialogClose(event);
                    }}
                    className={`inline-flex min-h-11 items-center justify-center border px-3 text-[12px] font-semibold uppercase tracking-[0.1em] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b5ef42] ${
                      isReady
                        ? "cursor-pointer border-[rgba(181,239,66,0.44)] bg-[rgba(32,52,18,0.68)] text-[#dfff8f] hover:border-[#b5ef42]"
                        : "cursor-not-allowed border-[rgba(114,101,78,0.28)] bg-[rgba(18,18,16,0.58)] text-[#8f8065]"
                    }`}
                  >
                    {scenarioCardConfirmed
                      ? t("board.characterSelect.scenarioConfirmed")
                      : t("board.characterSelect.confirmScenarioCard")}
                  </button>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    data-testid="betrayal-scenario-dialog-close"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={handleScenarioDialogClose}
                    className="inline-flex min-h-11 cursor-pointer items-center justify-center border border-[rgba(214,191,129,0.34)] bg-[rgba(18,23,18,0.72)] px-4 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#e2c57e] transition hover:border-[#e2c57e]"
                  >
                    {t("board.characterSelect.closeScenarioDialog")}
                  </button>
                </div>
              </div>
            </div>
            {scenarioDetailsOpen ? (
              <div
                role="dialog"
                aria-modal="true"
                data-testid="betrayal-scenario-reader-dialog"
                className={`pointer-events-auto fixed inset-0 grid ${
                  isScenarioReaderOpeningStage
                    ? "place-items-stretch bg-black p-0"
                    : "place-items-center bg-[radial-gradient(circle_at_50%_12%,rgba(96,67,29,0.34),rgba(2,6,5,0.9)_52%,rgba(0,0,0,0.96))] px-3 py-3"
                }`}
                style={{ zIndex: SCENARIO_READER_MODAL_Z_INDEX }}
                onClick={handleScenarioReaderClose}
              >
                <article
                  data-testid="betrayal-scenario-detail-panel"
                  className={`relative flex w-full flex-col overflow-hidden ${
                    isScenarioReaderOpeningStage
                      ? "h-screen max-h-none max-w-none border-0 bg-transparent text-[#f5e6c7] shadow-none"
                      : "max-h-[calc(100vh-18px)] max-w-[1120px] border border-[#9a7b46] bg-[linear-gradient(135deg,rgba(52,34,20,0.98),rgba(18,14,10,0.99)_48%,rgba(5,7,6,0.99))] text-[#3a2414] shadow-[0_34px_90px_rgba(0,0,0,0.72)]"
                  }`}
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="pointer-events-none absolute inset-2 border border-[rgba(214,191,129,0.14)]" />
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_5%,rgba(216,171,88,0.16),transparent_34%)]" />
                  {isScenarioReaderOpeningStage ? null : (
                    <button
                      type="button"
                      data-testid="betrayal-scenario-reader-close"
                      onClick={handleScenarioReaderClose}
                      aria-label={t("board.characterSelect.hideScenarioDetails")}
                      className={`${isPhoneLandscapeLayout ? "relative ml-auto mr-2 mt-2 h-11 w-11 px-0" : "absolute right-3 top-3 min-h-11 min-w-11 px-3"} z-20 inline-flex cursor-pointer items-center justify-center border border-[rgba(214,191,129,0.42)] bg-[rgba(18,23,18,0.82)] text-[12px] font-semibold uppercase tracking-[0.12em] text-[#e2c57e] shadow-[0_8px_24px_rgba(0,0,0,0.38)] transition hover:border-[#e2c57e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e2c57e]`}
                    >
                      {isPhoneLandscapeLayout ? (
                        <X size={18} aria-hidden="true" />
                      ) : (
                        t("board.characterSelect.hideScenarioDetails")
                      )}
                    </button>
                  )}
                  <div
                    className={`relative min-h-0 ${
                      isScenarioReaderOpeningStage
                        ? "h-full p-0"
                        : `px-2 ${isPhoneLandscapeLayout ? "pb-2" : "py-2 lg:px-3 lg:py-3"}`
                    }`}
                  >
                    <div
                      data-testid={
                        isScenarioReaderOpeningStage
                          ? "betrayal-scenario-opening-stage"
                          : "betrayal-scenario-book"
                      }
                      className={`relative mx-auto w-full overflow-hidden ${
                        isScenarioReaderOpeningStage
                          ? "h-full max-w-none bg-transparent"
                          : "grid grid-cols-2 border border-[#5a371a] bg-[#2a170d] shadow-[0_26px_62px_rgba(0,0,0,0.58),inset_0_0_0_1px_rgba(236,196,117,0.18)]"
                      } ${
                        isScenarioReaderOpeningStage
                          ? "min-h-full p-0"
                          : isPhoneLandscapeLayout
                            ? "h-[calc(100vh-78px)] min-h-0 p-[5px]"
                            : "h-[min(84vh,760px)] min-h-[360px] p-[7px] lg:h-[min(86vh,780px)]"
                      }`}
                    >
                      {isScenarioReaderOpeningStage &&
                      scenarioReaderOpeningSection ? (
                        <CinematicNarrationPanel
                          testId="betrayal-scenario-opening-cinematic"
                          label={t(scenarioReaderOpeningSection.labelKey)}
                          text={t(scenarioReaderOpeningSection.bodyKey)}
                          variant="opening"
                          presentation="stage"
                          compact={isPhoneLandscapeLayout}
                          actionSlot={
                            <button
                              type="button"
                              data-testid="betrayal-scenario-reader-next-zone"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleScenarioReaderTurn("forward");
                              }}
                              disabled={!canTurnScenarioReaderForward}
                              aria-label={t("board.scenario.readerEnterBook")}
                              className="inline-flex min-h-11 min-w-[144px] cursor-pointer items-center justify-center gap-2 border border-[rgba(242,207,130,0.42)] bg-[rgba(8,10,9,0.82)] px-6 text-[12px] font-black uppercase tracking-[0.22em] text-[#f5e6c7] shadow-[0_16px_38px_rgba(0,0,0,0.58)] transition hover:border-[#f2cf82] hover:bg-[rgba(18,20,16,0.92)] disabled:opacity-35"
                            >
                              {t("board.scenario.readerEnterBook")}
                              <ChevronRight size={16} aria-hidden="true" />
                            </button>
                          }
                          className="h-full min-h-full"
                        />
                      ) : (
                        <>
                          <div className="pointer-events-none absolute inset-[7px] bg-[linear-gradient(90deg,rgba(53,30,14,0)_0%,rgba(52,30,15,0)_47%,rgba(52,30,15,0.74)_50%,rgba(255,236,187,0.10)_51%,rgba(52,30,15,0)_54%,rgba(52,30,15,0)_100%)]" />
                          <ScenarioBookTurnSheet
                            direction={scenarioReaderTurnDirection}
                            fromPages={
                              scenarioReaderTurnSnapshot?.fromPages ?? [null, null]
                            }
                            toPages={
                              scenarioReaderTurnSnapshot?.toPages ?? [null, null]
                            }
                            title={scenarioReaderTitle}
                            isPhoneLandscapeLayout={isPhoneLandscapeLayout}
                          />
                          {[scenarioReaderLeftPage, scenarioReaderRightPage].map(
                        (page, sideIndex) => {
                          if (!page) {
                            return (
                              <div
                                key={`blank-${sideIndex}`}
                                className="relative hidden overflow-hidden border border-[#c7a06b] bg-[linear-gradient(135deg,#ead3a8,#d9b77b)] shadow-[inset_0_0_38px_rgba(96,55,22,0.24)] sm:block"
                              />
                            );
                          }

                          const pageSideClassName =
                            sideIndex === 0
                              ? "mr-[5px] border-r-0 sm:mr-[8px]"
                              : "ml-[5px] border-l-0 sm:ml-[8px]";

                          return (
                            <section
                              key={page.id}
                              data-testid={
                                page.type === "cover"
                                  ? "betrayal-scenario-book-cover-page"
                                  : `betrayal-scenario-book-page-${page.id}`
                              }
                              className={`relative min-h-0 overflow-hidden border border-[#c7a06b] bg-[radial-gradient(circle_at_48%_18%,rgba(255,243,204,0.92),rgba(229,200,151,0.98)_58%,rgba(205,164,102,0.98)_100%)] shadow-[inset_0_0_0_1px_rgba(255,246,215,0.36),inset_0_0_42px_rgba(95,54,19,0.18)] ${isPhoneLandscapeLayout ? "p-2" : "p-3 sm:p-4 lg:p-6"} ${pageSideClassName}`}
                            >
                              <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:repeating-linear-gradient(0deg,rgba(92,55,24,0.08)_0_1px,transparent_1px_8px),radial-gradient(circle_at_18%_22%,rgba(88,49,18,0.12),transparent_18%),radial-gradient(circle_at_80%_70%,rgba(96,55,21,0.10),transparent_22%)]" />
                              <div className="pointer-events-none absolute inset-[10px] border border-[#b98343]/40" />
                              <div
                                data-testid={
                                  sideIndex === 0
                                    ? "betrayal-scenario-reader-page-label-desktop-left"
                                    : "betrayal-scenario-reader-page-label-desktop-right"
                                }
                                aria-hidden={sideIndex !== 0}
                                className="sr-only"
                              >
                                {String(page.pageNumber).padStart(2, "0")}
                              </div>
                              {page.type === "cover" ? (
                                <div className="relative flex h-full flex-col justify-between">
                                  <div>
                                    <h2 className="mt-3 text-[32px] font-black leading-none tracking-[0.08em] text-[#402411] lg:text-[46px]">
                                      {scenarioReaderTitle}
                                    </h2>
                                    <div className="mt-3 h-px w-28 bg-[#8f5a22]" />
                                    <p className="mt-4 text-[15px] font-semibold leading-7 text-[#57361f] lg:text-[17px] lg:leading-8">
                                      {t("board.scenario.readerLead")}
                                    </p>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-[12px] uppercase tracking-[0.1em] text-[#6b4727]">
                                    <div className="border border-[#b98343]/46 bg-[rgba(255,239,199,0.24)] p-2">
                                      <div>
                                        {t("board.scenario.readerCaseLabel")}
                                      </div>
                                      <div className="mt-1 font-bold text-[#402411]">
                                        {t(
                                          "board.characterSelect.scenarioCaseNo",
                                        )}
                                      </div>
                                    </div>
                                    <div className="border border-[#607f3a]/42 bg-[rgba(236,245,193,0.20)] p-2">
                                      <div>
                                        {t("board.scenario.readerStatusLabel")}
                                      </div>
                                      <div className="mt-1 font-bold text-[#425421]">
                                        {t(
                                          "board.characterSelect.scenarioOnly",
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="text-right text-[12px] font-semibold uppercase tracking-[0.14em] text-[#86643f]">
                                    {String(page.pageNumber).padStart(2, "0")}
                                  </div>
                                </div>
                              ) : (
                                <div className="relative flex h-full flex-col">
                                  <div
                                    data-testid="betrayal-scenario-reader-body-scroll"
                                    className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pr-1"
                                  >
                                    <div
                                      className={`grid ${isPhoneLandscapeLayout ? "gap-2" : "gap-4 lg:gap-5"}`}
                                    >
                                      {(page.sections ?? []).map((section) => {
                                          const isCinematicSection =
                                            isScenarioReaderCinematicSection(
                                              section.id,
                                            );

                                          return (
                                            <section
                                              key={section.id}
                                              data-testid={`betrayal-scenario-book-section-${section.id}`}
                                              data-cinematic-narration={
                                                isCinematicSection
                                                  ? "opening"
                                                  : undefined
                                              }
                                              className={
                                                isCinematicSection
                                                  ? "min-h-[260px]"
                                                  : `border-l-4 ${isPhoneLandscapeLayout ? "pl-2" : "pl-3"} ${section.accentClass}`
                                              }
                                            >
                                              {isCinematicSection ? (
                                                <CinematicNarrationPanel
                                                  label={t(section.labelKey)}
                                                  text={t(section.bodyKey)}
                                                  variant="opening"
                                                  compact={isPhoneLandscapeLayout}
                                                  className={
                                                    isPhoneLandscapeLayout
                                                      ? "min-h-[248px]"
                                                      : "min-h-[410px]"
                                                }
                                              />
                                              ) : (
                                                <>
                                                  <div
                                                    className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#7d5129]"
                                                    aria-hidden="true"
                                                  >
                                                    {String(
                                                      page.pageNumber,
                                                    ).padStart(2, "0")}
                                                  </div>
                                                  <h3
                                                    className={`${isPhoneLandscapeLayout ? "mt-0.5 text-[14px]" : "mt-1 text-[21px] lg:text-[25px]"} font-black tracking-[0.05em] text-[#3b2211]`}
                                                  >
                                                    {t(section.labelKey)}
                                                  </h3>
                                                  <p
                                                    className={`${isPhoneLandscapeLayout ? "mt-1 text-[12px] leading-[1.45]" : "mt-2 text-[14px] leading-[1.6] lg:text-[15px] lg:leading-[1.65]"} whitespace-pre-line font-medium text-[#4e321c]`}
                                                  >
                                                    {t(section.bodyKey)}
                                                  </p>
                                                </>
                                              )}
                                            </section>
                                          );
                                        },
                                      )}
                                    </div>
                                  </div>
                                  <div
                                    className={`${isPhoneLandscapeLayout ? "mt-1 pt-1" : "mt-3 pt-2"} flex items-center justify-between border-t border-[#b98343]/36 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#86643f]`}
                                  >
                                    <span>
                                      {scenarioReaderTitle}
                                    </span>
                                    <span>
                                      {String(page.pageNumber).padStart(2, "0")}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </section>
                          );
                        },
                      )}
                        </>
                      )}
                    </div>
                    {isScenarioReaderOpeningStage ? null : (
                      <button
                        type="button"
                        data-testid="betrayal-scenario-reader-prev-zone"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleScenarioReaderTurn("back");
                        }}
                        disabled={!canTurnScenarioReaderBack}
                        aria-label={t("board.scenario.readerPrev")}
                        className="absolute bottom-3 left-3 top-3 z-10 w-[calc(50%_-_12px)] cursor-w-resize bg-transparent disabled:pointer-events-none"
                      />
                    )}
                    {isScenarioReaderOpeningStage ? null : (
                      <button
                        type="button"
                        data-testid="betrayal-scenario-reader-next-zone"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleScenarioReaderTurn("forward");
                        }}
                        disabled={!canTurnScenarioReaderForward}
                        aria-label={t("board.scenario.readerNext")}
                        className="absolute bottom-3 right-3 top-3 z-10 w-[calc(50%_-_12px)] cursor-e-resize bg-transparent disabled:pointer-events-none"
                      />
                    )}
                  </div>
                </article>
              </div>
            ) : null}
          </div>
        </HudPortal>
      ) : null}
    </div>
  );
}
