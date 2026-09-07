import React from "react";
import { Hourglass } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  useTutorial,
  useTutorialBridge,
} from "../../contexts/TutorialContext";
import { UndoProvider } from "../../contexts/UndoContext";
import {
  HudPortal,
  UI_Z_INDEX,
} from "../../core";
import type { ActionBarAction } from "../../core/ui/types";
import {
  playSound,
  useGameAudio,
} from "../../lib/audio/useGameAudio";
import { useVisualSequenceGate } from "../../components/game/framework";
import { useRuntimeViewport } from "../../hooks/ui/useRuntimeViewport";
import type { GameBoardProps } from "../../engine/transport/protocol";
import type {
  BetrayalCore,
  BetrayalDeckKind,
  BetrayalExplorerSummary,
  BetrayalInventoryCard,
  BetrayalRecentRollState,
  BetrayalRoomNode,
  BetrayalRoomPlacementPreview,
  BetrayalRoomTileAdjustmentOption,
  BetrayalTraitKey,
} from "./game";
import type { BetrayalCommandMap } from "./commandTypes";
import {
  BetrayalDomain,
  EXPLORER_CATALOG,
  createBetrayalCharacterSelectCore,
} from "./game";
import { BETRAYAL_COMMANDS } from "./commands";
import { resolveBetrayalMoveTargetReadModel } from "./movementReadModel";
import {
  resolveBetrayalExploreRoomCommandPayload,
  resolveExplorableRoomSlots,
  resolveNextRoomDiscoveryDeckKind,
  resolveRoomPlacementPreview,
  resolveRoomTileAdjustmentOptions,
} from "./roomDiscoveryModel";
import {
  resolveHelpingHandsTrollHandAttackCommandPayload,
  resolveHelpingHandsPendingAttackReward,
  resolveHelpingHandsStealableCards,
  resolveMummyPendingAttackReward,
  resolveMummyStealableCards,
  type BetrayalHelpingHandsTrollHandAttackOption,
} from "./hauntAttackRewardReadModel";
import { resolveBloodFromStoneSetupPlacementPlan } from "./bloodFromStoneSetupReadModel";
import { resolveCorpseLootTargets } from "./deathStateReadModel";
import { resolveBetrayalMonsterRelationToExplorer } from "./entityRelationModel";
import { resolveBetrayalHauntRevealProtocol } from "./hauntSetupModel";
import type { BetrayalMonsterActionSlot } from "./monsterActionReadModel";
import { resolveBetrayalMonsterActionSelectionReadModel } from "./monsterActionSelectionReadModel";
import { resolveBetrayalMonsterStatuses } from "./monsterReadModel";
import { resolveBetrayalHauntSpecialActionTargetSelectionReadModel } from "./hauntSpecialActionReadModel";
import { resolveBetrayalHauntTokenInstances } from "./hauntTokenModel";
import {
  canUseBookForPendingEventRoll,
  canUseHolySymbolForDiscovery,
  canUseIdolToSkipEvent,
  canUseRecentRollRerollItemForRecentRoll,
  resolveBetrayalPossessionSpecialActionStatus,
  resolveRecentRollRerollSelectableDieIndices,
} from "./possessionActionReadModel";
import {
  resolveBetrayalHauntRisk,
  resolveBetrayalNumberTracks,
} from "./hauntProgress";
import {
  resolveBetrayalRoomEffectActionPresentation,
  resolveBetrayalRoomSpecialActionStatus,
} from "./roomActionReadModel";
import {
  resolveBetrayalTradeCardStatus,
  resolveBetrayalTradeDraftReadModel,
  resolveBetrayalTradeSelectionReadModel,
  type BetrayalTradeCardStatus,
} from "./trade";
import {
  resolvePossessionAtlasVisual,
  type BetrayalPossessionAtlasVisual,
} from "./possessionAtlas";
import { type BetrayalScenarioCardId } from "./scenarioConfig";
import {
  resolveScenarioReaderOpenPlan,
  resolveScenarioReaderSpreadPages,
  type ScenarioBookTurnSnapshot,
} from "./scenarioReader";
import { resolveBetrayalScenarioReaderPresentation } from "./scenarioReaderPresentation";
import { BetrayalHauntRevealCue } from "./hauntRevealCueSurface";
import {
  ROOM_CANVAS_MIN_HEIGHT,
  ROOM_CANVAS_MIN_WIDTH,
  buildRoomMonsters,
  buildRoomOccupants,
  resolveBetrayalBoardRoomMapFloorState,
  resolveExplorerFloor,
  resolveExplorerFloorByPlayer,
  resolveFloorLabel,
  resolveOccupiedRoomMapFloors,
  resolveRoomCanvasLayout,
  roomTileAdjustmentSelectionsMatch,
  toRoomTileAdjustmentSelection,
} from "./roomMapModel";
import { resolveRoomEndTurnEffectHint } from "./roomPresentation";
import {
  buildDeckItems,
  buildDiscardItems,
} from "./deckPresentation";
import { BetrayalDeckStatusRailSurface } from "./deckStatusRailSurface";
import {
  resolveReferencePages,
  type ReferencePageId,
} from "./referencePresentation";
import {
  resolveBetrayalInventoryDisplayReadModel,
  resolveBetrayalInventoryRoomTargetReadModel,
  resolveBetrayalSelectedInventoryUseState,
  resolveBetrayalUsePossessionCommandPayload,
} from "./inventoryPresentation";
import {
  resolveBetrayalEventChoiceAcceptPreview,
  resolveBetrayalEventChoiceCommandPayload,
  resolveBetrayalPendingEventChoiceReadModel,
  type BetrayalEventChoiceSelection,
} from "./eventChoicePreview";
import { isBetrayalCore } from "./coreSnapshotGuard";
import { resolveBetrayalActivityPresentation } from "./activityPresentation";
import {
  buildLatestDiscoveryDisplayEntry,
  buildLatestDiscoveryKey,
  isHauntScenarioOpeningDiscovery,
  isHauntScenarioOpeningDiscoverySummary,
  removeBetrayalLatestDiscoveryQueueEntry,
  resolveBetrayalLatestDiscoveryQueueAfterCurrentEntry,
  resolveBetrayalLatestDiscoveryQueueAfterHauntRevealDismiss,
  resolveBetrayalLatestDiscoveryPanelPresentation,
  resolveBetrayalLatestDiscoverySelectionPresentation,
  shouldRestoreBetrayalDiscoveryAfterHauntRevealDismiss,
  type LatestDiscoveryDisplayEntry,
} from "./latestDiscoveryPresentation";
import {
  buildRecentRollDisplayKey,
  resolveEventRollConfirmationPresentation,
  resolveRecentRollAcknowledgementPresentation,
  resolveRecentRollActorLabel as resolveRecentRollActorLabelPresentation,
} from "./recentRollPresentation";
import { resolvePlayerName } from "./playerPresentation";
import { resolveBetrayalAttackLineOfSightSegments } from "./attackLineOfSightPresentation";
import {
  resolveBetrayalAttackDeclarationReadModel,
  resolveBetrayalAttackTargetingReadModel,
  resolveAttackWeaponCardStatuses,
} from "./attackRules";
import {
  adjustSelectedDamageTrait,
  countSelectedDamageTrait,
  pruneSelectedDamageTraits,
  resolveTraitDamageAssignableSteps,
} from "./traitPresentation";
import { BETRAYAL_TRAIT_MARKER_ASSETS } from "./traitAssets";
import {
  BETRAYAL_COVER_ASSET,
  BETRAYAL_OMEN_DECK_ASSET,
  BETRAYAL_TITLE_BANNER_ASSET,
} from "./uiAssets";
import { resolveDiscoveryAtlasVisual } from "./discoveryAtlas";
import { BetrayalInventoryRailSurface } from "./inventoryRailSurface";
import { BetrayalDamageAllocationSurface } from "./damageAllocationSurface";
import {
  canIncrementBetrayalDamageAllocationTrait,
  resolveBetrayalDamageAllocationBroochToggle,
  resolveBetrayalDamageAllocationCommandPayload,
  resolveBetrayalDamageAllocationReadModel,
  resolveBetrayalDamageAllocationTraitAdjustment,
} from "./damageAllocationReadModel";
import {
  BETRAYAL_ROOM_TILE_VISUALS,
  resolveBetrayalRoomNodeTileVisual,
  resolveBetrayalRoomTileVisual,
} from "./roomAtlas";
import { BetrayalTopPromptStackSurface } from "./topPromptStackSurface";
import {
  BetrayalHelpingHandsRewardActionsSurface,
  BetrayalHelpingHandsTrollAttackActionsSurface,
  BetrayalMummyRewardActionsSurface,
} from "./attackRewardActionSurface";
import { BetrayalEventChoiceSurface } from "./eventChoiceSurface";
import { BetrayalTableActionCueSurface } from "./tableActionCueSurface";
import { BetrayalActionDockSurface } from "./actionDockSurface";
import { resolveBetrayalBoardActionItems } from "./actionBarReadModel";
import { resolveBetrayalActionCueReadModel } from "./actionCueReadModel";
import {
  BetrayalSicknessExchangeBannerSurface,
  BetrayalTradeActionPanelSurface,
  BetrayalTradeCardSelectorSurface,
} from "./tradeCardSelectorSurface";
import {
  resolveBetrayalTradeActionCommand,
  resolveBetrayalTradeFlowReadModel,
} from "./tradeFlowReadModel";
import {
  resolveBetrayalBoardVisibleHauntTokensByRoomId,
  resolveBetrayalDustPresentation,
} from "./dustHauntPresentation";
import {
  resolveActiveBetrayalHauntTargetGuide,
  resolveBetrayalHauntTargetGuide,
} from "./hauntTargetGuideReadModel";
import {
  resolveBetrayalExplorerTargetSelectionAction,
  resolveBetrayalPreviewStateAfterExplorerTargetSelection,
} from "./explorerTargetSelectionReadModel";
import {
  resolveBetrayalDustHauntTraitSelector,
  resolveBetrayalHauntActionContext,
  resolveBetrayalHauntUseVisualPlan,
} from "./hauntActionContextReadModel";
import {
  BETRAYAL_AUDIO_CONFIG,
  BETRAYAL_SCENARIO_PAGE_TURN_KEY,
} from "./audio.config";
import { BETRAYAL_MANIFEST } from "./manifest";
import {
  BetrayalConfirmButton,
  BETRAYAL_CONFIRM_BUTTON_CLASS,
} from "./confirmButtonSurface";
import { BetrayalDebugPanel } from "./debugPanelSurface";
import { EndgameScreen } from "./endgameScreen";
import { CharacterSelectScreen } from "./characterSelectSurface";
import {
  ExplorerDetailsDialog,
  MonsterDetailsDialog,
} from "./entityDetailsSurface";
import { BetrayalRoomMapSurface } from "./roomMapSurface";
import { BetrayalRecentRollReviewSurface } from "./recentRollReviewSurface";
import {
  BetrayalVisualTransitionLayer,
  centerBetrayalRect,
  findBetrayalTestElement,
  readBetrayalViewportRect,
  type BetrayalVisualTransition,
} from "./visualTransitionSurface";
import { BetrayalReferenceOverlaySurface } from "./referenceOverlaySurface";
import { BetrayalReferenceQuickActionsSurface } from "./referenceQuickActionsSurface";
import { BetrayalPreviewOverlaySurface } from "./previewOverlaySurface";
import { BetrayalScenarioStartOpeningStageSurface } from "./scenarioStartOpeningStageSurface";
import {
  BetrayalObservedExplorerPanelSurface,
  BetrayalTeammateListSurface,
} from "./playerStatusRailSurface";
import {
  createInitialPreviewState,
  resolveNextPreviewStateAfterCoreChange,
  type PreviewState,
} from "./previewStateModel";
import { BetrayalMobileActionRailSurface } from "./mobileActionRailSurface";
import { BetrayalLatestDiscoverySurface } from "./latestDiscoverySurface";
import { buildBetrayalTutorialRuntimeSyncKey } from "./tutorialRuntimeSyncKey";

type Props = GameBoardProps<BetrayalCore, BetrayalCommandMap>;

const ASSETS = {
  titleBanner: BETRAYAL_TITLE_BANNER_ASSET,
  cover: BETRAYAL_COVER_ASSET,
  playerReference: {
    front: "betrayal/cards/player-reference-zh-front",
    back: "betrayal/cards/player-reference-zh-back",
    traitor: "betrayal/cards/traitor-reference-zh",
    monster: "betrayal/cards/monster-reference-zh",
  },
  traitorBack: "betrayal/cards/back-traitor",
  deck: {
    omen: BETRAYAL_OMEN_DECK_ASSET,
    item: "betrayal/cards/back-item",
    event: "betrayal/cards/back-event",
  } satisfies Record<BetrayalDeckKind, string>,
  trait: {
    ...BETRAYAL_TRAIT_MARKER_ASSETS,
  } satisfies Record<BetrayalTraitKey, string>,
  marker: {
    numberBlank: "betrayal/markers/number-blank",
  } as const,
  ui: {
    hauntRiskTrack: "betrayal/ui/trait-track-0-9",
  } as const,
} as const;

export default function BetrayalBoard({
  G,
  dispatch,
  playerID,
  matchData,
  isMultiplayer,
  locale,
}: Props) {
  const { t } = useTranslation(["game-betrayal", "common"]);
  const {
    isActive: isTutorialActive,
    currentStep: tutorialStep,
    nextStep,
  } = useTutorial();
  const runtimeViewport = useRuntimeViewport({ syncCssVars: false });
  const runtimeDispatch = dispatch as unknown as (
    type: string,
    payload?: unknown,
  ) => void;
  const effectiveLocale = locale || "zh-CN";
  const {
    beginSequence: beginVisualSequence,
    endSequence: endVisualSequence,
    isVisualBusy,
  } = useVisualSequenceGate();
  const [visualTransition, setVisualTransition] =
    React.useState<BetrayalVisualTransition | null>(null);
  const visualTransitionIdRef = React.useRef(0);
  const activeVisualTransitionIdRef = React.useRef<string | null>(null);
  const baseCore = React.useMemo(
    () =>
      isBetrayalCore(G?.core) ? G.core : createBetrayalCharacterSelectCore(),
    [G],
  );
  const viewerPlayerId = String(
    playerID ?? baseCore.currentPlayer ?? baseCore.playerIds[0] ?? "0",
  );
  const tutorialRuntimeSyncKey = React.useMemo(
    () =>
      buildBetrayalTutorialRuntimeSyncKey({
        core: baseCore,
        sys: G?.sys,
      }),
    [G?.sys, baseCore],
  );
  useTutorialBridge(G?.sys?.tutorial, runtimeDispatch, tutorialRuntimeSyncKey);
  const beginBetrayalVisualTransition = React.useCallback(
    (transition: Omit<BetrayalVisualTransition, "id">) => {
      if (isVisualBusy || activeVisualTransitionIdRef.current) {
        return false;
      }
      const id = `transition-${visualTransitionIdRef.current + 1}`;
      visualTransitionIdRef.current += 1;
      activeVisualTransitionIdRef.current = id;
      beginVisualSequence();
      setVisualTransition({ ...transition, id });
      return true;
    },
    [beginVisualSequence, isVisualBusy],
  );
  const finishBetrayalVisualTransition = React.useCallback(
    (transitionId: string) => {
      const currentTransition = visualTransition;
      if (
        activeVisualTransitionIdRef.current !== transitionId ||
        !currentTransition
      ) {
        return;
      }
      // 先提交原始动作，再释放活动标记，避免 core 变化被 AI/远端观察器误判为第二次动画。
      currentTransition.onComplete?.();
      activeVisualTransitionIdRef.current = null;
      setVisualTransition(null);
      endVisualSequence();
    },
    [endVisualSequence, visualTransition],
  );
  const displayBaseCore = React.useMemo<BetrayalCore>(() => {
    const playerViewCore = BetrayalDomain.playerView?.(
      baseCore,
      viewerPlayerId,
    ) as Partial<BetrayalCore> | undefined;
    if (!playerViewCore) {
      return baseCore;
    }
    return isBetrayalCore(playerViewCore)
      ? playerViewCore
      : { ...baseCore, ...playerViewCore };
  }, [baseCore, viewerPlayerId]);
  const isGameOver = Boolean(G?.sys?.gameover) || baseCore.phase === "endgame";
  const undoProviderValue = React.useMemo(
    () => ({
      G,
      dispatch: runtimeDispatch,
      playerID,
      isGameOver,
      isLocalMode: !isMultiplayer,
    }),
    [G, isGameOver, isMultiplayer, playerID, runtimeDispatch],
  );
  useGameAudio({
    config: BETRAYAL_AUDIO_CONFIG,
    gameId: BETRAYAL_MANIFEST.id,
    G: baseCore,
    ctx: {
      phase: baseCore.phase,
      isGameOver,
      isWinner: baseCore.endgameResult
        ? baseCore.endgameResult.winners.includes(viewerPlayerId)
        : undefined,
    },
    eventEntries: G?.sys?.eventStream?.entries,
    meta: {
      playerID: playerID ?? null,
    },
  });
  const [selectedExplorerId, setSelectedExplorerId] = React.useState(
    () =>
      baseCore.selectedExplorerByPlayerId[viewerPlayerId] ??
      EXPLORER_CATALOG[0]!.explorerId,
  );
  const [previewState, setPreviewState] = React.useState<PreviewState>(() =>
    createInitialPreviewState(baseCore),
  );
  const [referenceOpen, setReferenceOpen] = React.useState(false);
  const [scenarioReaderOpen, setScenarioReaderOpen] = React.useState(false);
  const [referenceSide, setReferenceSide] =
    React.useState<ReferencePageId>("front");
  const [referenceScenarioSpreadIndex, setReferenceScenarioSpreadIndex] =
    React.useState(0);
  const [
    referenceScenarioOpeningStageActive,
    setReferenceScenarioOpeningStageActive,
  ] = React.useState(false);
  const [referenceScenarioTurnDirection, setReferenceScenarioTurnDirection] =
    React.useState<"back" | "forward" | null>(null);
  const [referenceScenarioTurnSnapshot, setReferenceScenarioTurnSnapshot] =
    React.useState<ScenarioBookTurnSnapshot | null>(null);
  const previousBoardPhaseRef = React.useRef<BetrayalCore["phase"]>(
    baseCore.phase,
  );
  const pendingScenarioStartOpeningKeyRef = React.useRef<string | null>(null);
  const pendingScenarioTurnTutorialAdvanceRef = React.useRef(false);
  const [
    scenarioStartOpeningCinematicKey,
    setScenarioStartOpeningCinematicKey,
  ] = React.useState<string | null>(null);
  const [
    dismissedScenarioStartOpeningCinematicKey,
    setDismissedScenarioStartOpeningCinematicKey,
  ] = React.useState<string | null>(null);
  const [roomPreviewId, setRoomPreviewId] = React.useState<string | null>(null);
  const [inventoryPreviewCardId, setInventoryPreviewCardId] = React.useState<
    string | null
  >(null);
  const [
    latestDiscoverySearchRevealIndex,
    setLatestDiscoverySearchRevealIndex,
  ] = React.useState(0);
  const [confirmedExorciseRollId, setConfirmedExorciseRollId] = React.useState<
    string | null
  >(null);
  const [settledRecentRollId, setSettledRecentRollId] = React.useState<
    string | null
  >(null);
  const [selectedRoomMapFloor, setSelectedRoomMapFloor] = React.useState<
    BetrayalRoomNode["floor"]
  >(() => resolveExplorerFloor(baseCore));
  const [roomFocusPanTarget, setRoomFocusPanTarget] = React.useState<
    string | null
  >(null);
  const roomGridRef = React.useRef<HTMLDivElement | null>(null);
  React.useLayoutEffect(() => {
    const pendingTransition = visualTransition;
    if (!pendingTransition || pendingTransition.targetRect) {
      return undefined;
    }

    let attempts = 0;
    let frameId: number | null = null;
    const resolveTarget = () => {
      const targetRect = readBetrayalViewportRect(
        findBetrayalTestElement(pendingTransition.targetTestId),
      );
      const fallbackRoomRect = pendingTransition.fallbackRoomTestId
        ? readBetrayalViewportRect(
            findBetrayalTestElement(pendingTransition.fallbackRoomTestId),
          )
        : null;
      const resolvedRect =
        targetRect ??
        (fallbackRoomRect
          ? centerBetrayalRect(
              fallbackRoomRect,
              pendingTransition.sourceRect.width,
              pendingTransition.sourceRect.height,
            )
          : null);
      if (resolvedRect) {
        setVisualTransition((currentTransition) =>
          currentTransition?.id === pendingTransition.id
            ? { ...currentTransition, targetRect: resolvedRect }
            : currentTransition,
        );
        return;
      }

      attempts += 1;
      if (attempts >= 12) {
        finishBetrayalVisualTransition(pendingTransition.id);
        return;
      }
      frameId = window.requestAnimationFrame(resolveTarget);
    };

    frameId = window.requestAnimationFrame(resolveTarget);
    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [
    baseCore,
    finishBetrayalVisualTransition,
    selectedRoomMapFloor,
    visualTransition,
  ]);
  const isPhoneLandscapeLayout =
    runtimeViewport.width > 0 &&
    runtimeViewport.width <= 1023 &&
    runtimeViewport.width > runtimeViewport.height;
  const isExorciseRollReview =
    displayBaseCore.recentRoll?.kind === "hauntActionTraitCheck" &&
    (displayBaseCore.recentRoll.sourceTitle === "驱魔" ||
      displayBaseCore.recentRoll.sourceTitle === "驱逐木乃伊") &&
    displayBaseCore.recentRoll.trait === "sanity" &&
    confirmedExorciseRollId !== displayBaseCore.recentRoll.id;
  const isEndgameExorciseRollReview =
    displayBaseCore.phase === "endgame" && isExorciseRollReview;
  const core = React.useMemo<BetrayalCore>(
    () =>
      isEndgameExorciseRollReview
        ? {
            ...displayBaseCore,
            phase: "haunt",
            recommendedAction: "endTurn",
            endgameResult: null,
          }
        : displayBaseCore,
    [displayBaseCore, isEndgameExorciseRollReview],
  );
  const turnStartSpeedForHud = Number.isFinite(core.turnStartSpeed)
    ? core.turnStartSpeed
    : core.currentExplorer.traits.speed;
  const [latestDiscoveryQueue, setLatestDiscoveryQueue] = React.useState<
    LatestDiscoveryDisplayEntry[]
  >([]);
  const [
    dismissedHauntRevealDiscoveryKey,
    setDismissedHauntRevealDiscoveryKey,
  ] = React.useState<string | null>(null);
  const [dismissedLatestDiscoveryKeys, setDismissedLatestDiscoveryKeys] =
    React.useState<ReadonlySet<string>>(() => new Set());
  const autoOpenedHauntScenarioReaderKeysRef = React.useRef<Set<string>>(
    new Set(),
  );
  const hasObservedHauntRevealAutoOpenStateRef = React.useRef(false);
  const previousHauntRevealAutoOpenKeyRef = React.useRef<string | null>(null);
  const [inspectedExplorerPlayerId, setInspectedExplorerPlayerId] =
    React.useState<string | null>(null);
  const [inspectedMonsterId, setInspectedMonsterId] = React.useState<
    string | null
  >(null);
  const allExplorers = React.useMemo(
    () => [core.currentExplorer, ...core.otherExplorers],
    [core.currentExplorer, core.otherExplorers],
  );
  const resolveRecentRollActorLabel = React.useCallback(
    (roll: BetrayalRecentRollState | null | undefined) =>
      resolveRecentRollActorLabelPresentation({
        roll,
        viewerPlayerId,
        explorers: allExplorers,
        matchData,
      }),
    [allExplorers, matchData, viewerPlayerId],
  );
  const [observedExplorerPlayerId, setObservedExplorerPlayerId] =
    React.useState<string | null>(null);
  const observationReturnPlayerIdRef = React.useRef<string | null>(null);
  const observedExplorer =
    (observedExplorerPlayerId
      ? allExplorers.find(
          (explorer) => explorer.playerId === observedExplorerPlayerId,
        )
      : null) ?? core.currentExplorer;
  const observedExplorerRoomName =
    core.rooms.find((room) => room.id === observedExplorer.roomId)?.name ??
    t("board.rooms.unknown");
  const isObservingOtherExplorer =
    observedExplorer.playerId !== core.currentExplorer.playerId;
  const inspectedExplorer =
    allExplorers.find(
      (explorer) => explorer.playerId === inspectedExplorerPlayerId,
    ) ?? null;
  const inspectedExplorerTemplate = inspectedExplorer
    ? EXPLORER_CATALOG.find(
        (explorer) => explorer.explorerId === inspectedExplorer.explorerId,
      )
    : null;
  const inspectedExplorerRoomName = inspectedExplorer
    ? (core.rooms.find((room) => room.id === inspectedExplorer.roomId)?.name ??
      t("board.rooms.unknown"))
    : "";
  const inspectedMonster =
    core.monsters.find((monster) => monster.id === inspectedMonsterId) ?? null;
  const inspectedMonsterRoomName = inspectedMonster
    ? (core.rooms.find((room) => room.id === inspectedMonster.roomId)?.name ??
      t("board.rooms.unknown"))
    : "";
  const openExplorerDetails = React.useCallback((playerId: string) => {
    setInspectedExplorerPlayerId(playerId);
  }, []);
  const closeExplorerDetails = React.useCallback(() => {
    setInspectedExplorerPlayerId(null);
  }, []);
  const openMonsterDetails = React.useCallback((monsterId: string) => {
    setInspectedMonsterId(monsterId);
  }, []);
  const closeMonsterDetails = React.useCallback(() => {
    setInspectedMonsterId(null);
  }, []);
  React.useEffect(() => {
    if (
      inspectedMonsterId &&
      !core.monsters.some((monster) => monster.id === inspectedMonsterId)
    ) {
      setInspectedMonsterId(null);
    }
  }, [core.monsters, inspectedMonsterId]);
  const focusRoomOnMap = React.useCallback(
    (roomId: string, options: { pan?: boolean } = {}) => {
      const targetRoom = core.rooms.find((room) => room.id === roomId);
      if (!targetRoom) {
        return;
      }
      setSelectedRoomMapFloor(targetRoom.floor);
      const nextTarget = `betrayal-room-${targetRoom.id}`;
      setRoomFocusPanTarget(null);
      if (options.pan === false) {
        return;
      }
      window.requestAnimationFrame(() => {
        setRoomFocusPanTarget(nextTarget);
      });
    },
    [core.rooms],
  );
  const focusExplorerRoom = React.useCallback(
    (playerId: string | null) => {
      const targetExplorer =
        (playerId
          ? allExplorers.find((explorer) => explorer.playerId === playerId)
          : null) ?? core.currentExplorer;
      const targetRoom = core.rooms.find(
        (room) => room.id === targetExplorer.roomId,
      );
      if (!targetRoom) {
        return;
      }
      focusRoomOnMap(targetRoom.id);
    },
    [allExplorers, core.currentExplorer, core.rooms, focusRoomOnMap],
  );
  const focusMonsterRoom = React.useCallback(
    (monsterId: string | null) => {
      const monster = monsterId
        ? core.monsters.find((candidate) => candidate.id === monsterId)
        : null;
      if (monster) {
        focusRoomOnMap(monster.roomId);
      }
    },
    [core.monsters, focusRoomOnMap],
  );
  const clearSelectedInventoryInteraction = React.useCallback(() => {
    setPreviewState((previousState) => ({
      ...previousState,
      selectedInventoryCardId: null,
      selectedInventoryTargetPlayerId: null,
      selectedInventoryTargetRoomId: null,
      selectedInventoryReplacementRollTotal: null,
      selectedMaskTargetRoomIdsByTokenId: {},
      activeMaskTargetTokenId: null,
    }));
  }, []);
  const handleObserveExplorer = React.useCallback(
    (playerId: string) => {
      setInspectedExplorerPlayerId(null);
      clearSelectedInventoryInteraction();
      if (playerId === core.currentExplorer.playerId) {
        observationReturnPlayerIdRef.current = null;
        setObservedExplorerPlayerId(null);
        focusExplorerRoom(null);
        return;
      }
      if (observedExplorerPlayerId === playerId) {
        const returnPlayerId = observationReturnPlayerIdRef.current;
        observationReturnPlayerIdRef.current = null;
        setObservedExplorerPlayerId(returnPlayerId);
        focusExplorerRoom(returnPlayerId);
        return;
      }
      observationReturnPlayerIdRef.current = observedExplorerPlayerId;
      setObservedExplorerPlayerId(playerId);
      focusExplorerRoom(playerId);
    },
    [
      clearSelectedInventoryInteraction,
      core.currentExplorer.playerId,
      focusExplorerRoom,
      observedExplorerPlayerId,
    ],
  );
  const handleFocusSelfRoom = React.useCallback(() => {
    const selfRoom = core.rooms.find(
      (room) => room.id === core.currentExplorer.roomId,
    );
    if (!selfRoom) {
      return;
    }
    observationReturnPlayerIdRef.current = null;
    setObservedExplorerPlayerId(null);
    focusRoomOnMap(selfRoom.id);
  }, [core.currentExplorer.roomId, core.rooms, focusRoomOnMap]);
  const referencePages = React.useMemo(
    () => resolveReferencePages(core, ASSETS.playerReference),
    [core],
  );
  const currentReferencePage =
    referencePages.find((page) => page.id === referenceSide) ??
    referencePages[0]!;
  const scenarioReaderPresentation = React.useMemo(
    () =>
      resolveBetrayalScenarioReaderPresentation({
        core,
        viewerPlayerId,
        referenceScenarioOpeningStageActive,
        referenceScenarioSpreadIndex,
        scenarioStartOpeningCinematicKey,
        dismissedScenarioStartOpeningCinematicKey,
        text: t,
      }),
    [
      core,
      dismissedScenarioStartOpeningCinematicKey,
      referenceScenarioOpeningStageActive,
      referenceScenarioSpreadIndex,
      scenarioStartOpeningCinematicKey,
      t,
      viewerPlayerId,
    ],
  );
  const {
    activeHauntDossier,
    activeHauntTitle,
    activeHauntCaseLabel,
    scenarioReaderScope,
    scenarioReaderScopeLabel,
    scenarioReferenceButtonLabel,
    scenarioReferenceAccessibleLabel,
    referenceScenarioOpeningSection,
    scenarioStartOpeningSection,
    scenarioStartOpeningKey,
    shouldShowScenarioStartOpening,
    referenceScenarioPages,
    referenceScenarioBookSpreadCount,
    referenceScenarioHasOpeningStage,
    referenceScenarioSpreadCount,
    isReferenceScenarioOpeningStage,
    referenceScenarioLeftPage,
    referenceScenarioRightPage,
    canTurnReferenceScenarioBack,
    canTurnReferenceScenarioForward,
  } = scenarioReaderPresentation;

  React.useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }
    if (!(
      (scenarioReaderOpen && isReferenceScenarioOpeningStage) ||
      shouldShowScenarioStartOpening
    )) {
      return undefined;
    }
    const root = document.documentElement;
    const attrName = "data-betrayal-cinematic-stage";
    root.setAttribute(attrName, "true");
    return () => {
      root.removeAttribute(attrName);
    };
  }, [
    isReferenceScenarioOpeningStage,
    scenarioReaderOpen,
    shouldShowScenarioStartOpening,
  ]);

  React.useEffect(() => {
    setPreviewState((previousState) =>
      resolveNextPreviewStateAfterCoreChange(baseCore, previousState),
    );
    setInventoryPreviewCardId(null);
  }, [baseCore]);
  React.useEffect(() => {
    if (!referencePages.some((page) => page.id === referenceSide)) {
      setReferenceSide(referencePages[0]?.id ?? "front");
    }
  }, [referencePages, referenceSide]);
  React.useEffect(() => {
    setReferenceScenarioSpreadIndex(0);
    setReferenceScenarioOpeningStageActive(false);
  }, [activeHauntDossier.id]);
  React.useEffect(() => {
    const previousPhase = previousBoardPhaseRef.current;
    previousBoardPhaseRef.current = core.phase;
    const requestedOpeningKey = pendingScenarioStartOpeningKeyRef.current;
    if (
      previousPhase === "characterSelect" &&
      core.phase === "preHaunt" &&
      requestedOpeningKey &&
      requestedOpeningKey === scenarioStartOpeningKey
    ) {
      pendingScenarioStartOpeningKeyRef.current = null;
      setScenarioStartOpeningCinematicKey(scenarioStartOpeningKey);
      setDismissedScenarioStartOpeningCinematicKey(null);
      return;
    }
    if (core.phase !== "characterSelect") {
      pendingScenarioStartOpeningKeyRef.current = null;
    }
  }, [core.phase, scenarioStartOpeningKey]);
  React.useEffect(() => {
    if (
      inspectedExplorerPlayerId &&
      !allExplorers.some(
        (explorer) => explorer.playerId === inspectedExplorerPlayerId,
      )
    ) {
      setInspectedExplorerPlayerId(null);
    }
  }, [allExplorers, inspectedExplorerPlayerId]);
  React.useEffect(() => {
    if (
      observedExplorerPlayerId &&
      !allExplorers.some(
        (explorer) => explorer.playerId === observedExplorerPlayerId,
      )
    ) {
      observationReturnPlayerIdRef.current = null;
      setObservedExplorerPlayerId(null);
    }
  }, [allExplorers, observedExplorerPlayerId]);

  const openScenarioReference = React.useCallback(() => {
    const tutorialScenarioStepId = tutorialStep?.id;
    const shouldAdvanceScenarioReferenceTutorial =
      isTutorialActive &&
      (tutorialScenarioStepId === "hero-attack-objective" ||
        tutorialScenarioStepId === "jack-spirit-objective" ||
        tutorialScenarioStepId === "traitor-objective");
    const openPlan = resolveScenarioReaderOpenPlan(core, viewerPlayerId, {
      mode: shouldAdvanceScenarioReferenceTutorial
        ? "tutorialObjective"
        : "manualReview",
      hasOpeningSection: Boolean(referenceScenarioOpeningSection),
      bookSpreadCount: referenceScenarioBookSpreadCount,
    });
    const initialScenarioSpreadIndex =
      tutorialScenarioStepId === "jack-spirit-objective" ||
      tutorialScenarioStepId === "traitor-objective"
        ? Math.min(1, openPlan.spreadCount - 1)
        : openPlan.initialSpreadIndex;
    const hauntRevealKey = openPlan.isPublicHauntRevealReader
      ? buildLatestDiscoveryKey(core)
      : null;
    pendingScenarioTurnTutorialAdvanceRef.current = false;
    if (hauntRevealKey) {
      setDismissedLatestDiscoveryKeys((previousKeys) => {
        if (previousKeys.has(hauntRevealKey)) {
          return previousKeys;
        }
        const nextKeys = new Set(previousKeys);
        nextKeys.add(hauntRevealKey);
        return nextKeys;
      });
      setDismissedHauntRevealDiscoveryKey(hauntRevealKey);
      setLatestDiscoveryQueue((previousQueue) =>
        previousQueue.filter((entry) => entry.key !== hauntRevealKey),
      );
      if (
        core.recentRoll?.sourceTitle === core.latestDiscovery?.title &&
        buildRecentRollDisplayKey(core.recentRoll)
      ) {
        setPreviewState((previousState) => ({
          ...previousState,
          dismissedRecentRollId: buildRecentRollDisplayKey(core.recentRoll),
        }));
      }
    }
    setReferenceScenarioSpreadIndex(initialScenarioSpreadIndex);
    setReferenceScenarioOpeningStageActive(openPlan.includeOpeningStage);
    setReferenceScenarioTurnDirection(null);
    setReferenceScenarioTurnSnapshot(null);
    setScenarioReaderOpen(true);
    if (shouldAdvanceScenarioReferenceTutorial) {
      nextStep("auto");
    }
  }, [
    core,
    isTutorialActive,
    nextStep,
    referenceScenarioBookSpreadCount,
    referenceScenarioOpeningSection,
    tutorialStep?.id,
    viewerPlayerId,
  ]);

  React.useEffect(() => {
    if (!isHauntScenarioOpeningDiscovery(core)) {
      return;
    }
    setLatestDiscoveryQueue([]);
  }, [core]);

  const closeReferenceOverlay = React.useCallback(() => {
    const shouldAdvanceScenarioReaderCloseTutorial =
      isTutorialActive &&
      scenarioReaderOpen &&
      tutorialStep?.id === "haunt-hero-reader-close";
    setReferenceOpen(false);
    setScenarioReaderOpen(false);
    setReferenceScenarioOpeningStageActive(false);
    pendingScenarioTurnTutorialAdvanceRef.current = false;
    if (shouldAdvanceScenarioReaderCloseTutorial) {
      nextStep("auto");
    }
  }, [isTutorialActive, nextStep, scenarioReaderOpen, tutorialStep?.id]);

  const openReferenceCards = React.useCallback(() => {
    setReferenceSide("front");
    setReferenceOpen(true);
  }, []);

  React.useEffect(() => {
    setSelectedExplorerId(
      baseCore.selectedExplorerByPlayerId[viewerPlayerId] ??
        EXPLORER_CATALOG[0]!.explorerId,
    );
  }, [baseCore, viewerPlayerId]);

  const dispatchCommand = React.useCallback(
    <Type extends keyof BetrayalCommandMap>(
      type: Type,
      payload: BetrayalCommandMap[Type],
      options: { allowDuringVisualBusy?: boolean } = {},
    ) => {
      if (isVisualBusy && !options.allowDuringVisualBusy) {
        return;
      }
      dispatch(type, payload);
    },
    [dispatch, isVisualBusy],
  );
  const startExplorerMoveVisual = React.useCallback(
    (roomId: string, onComplete: () => void) => {
      const explorer = core.currentExplorer;
      const sourceRect = readBetrayalViewportRect(
        findBetrayalTestElement(
          `betrayal-explorer-figure-token-${explorer.playerId}`,
        ),
      );
      if (!sourceRect) {
        return false;
      }
      return beginBetrayalVisualTransition({
        kind: "explorer-move",
        sourceRect,
        targetRect: null,
        targetTestId: `betrayal-room-occupant-${roomId}-${explorer.playerId}`,
        explorer,
        locale: effectiveLocale,
        tokenLabel: resolvePlayerName(
          explorer.playerId,
          explorer.displayName,
          matchData,
        ),
        tone: "self",
        missingTokenLabel: t("board.hauntTokens.officialTokenMissing"),
        onComplete,
      });
    },
    [
      beginBetrayalVisualTransition,
      core.currentExplorer,
      effectiveLocale,
      matchData,
      t,
    ],
  );
  const startMonsterMoveVisual = React.useCallback(
    (monsterId: string, roomId: string, onComplete: () => void) => {
      const monster = core.monsters.find(
        (candidate) => candidate.id === monsterId,
      );
      if (!monster) {
        return false;
      }
      const sourceRect = readBetrayalViewportRect(
        findBetrayalTestElement(`betrayal-monster-board-token-${monsterId}`),
      );
      if (!sourceRect) {
        return false;
      }
      const monsterStatus = resolveBetrayalMonsterStatuses(core).find(
        (status) => status.monsterId === monsterId,
      )?.status;
      return beginBetrayalVisualTransition({
        kind: "monster-move",
        sourceRect,
        targetRect: null,
        targetTestId: `betrayal-room-monster-${roomId}-${monsterId}`,
        monster,
        monsterStatus,
        locale: effectiveLocale,
        missingTokenLabel: t("board.hauntTokens.officialTokenMissing"),
        onComplete,
      });
    },
    [beginBetrayalVisualTransition, core, effectiveLocale, t],
  );
  const startGirlTransferVisual = React.useCallback(
    ({
      sourceRoomId,
      targetTestId,
      attachedTo,
      onComplete,
    }: {
      sourceRoomId: string;
      targetTestId: string;
      attachedTo: "room" | "explorer" | "mummy";
    }) => {
      const girlToken = resolveBetrayalHauntTokenInstances(core).find(
        (token) => token.id === "mummy-girl-token",
      );
      const sourceRect = readBetrayalViewportRect(
        findBetrayalTestElement(
          `betrayal-room-haunt-token-${sourceRoomId}-mummy-girl-token`,
        ),
      );
      if (!girlToken || !sourceRect) {
        return false;
      }
      return beginBetrayalVisualTransition({
        kind: "girl-transfer",
        sourceRect,
        targetRect: null,
        targetTestId,
        girlToken,
        locale: effectiveLocale,
        missingTokenLabel: t("board.hauntTokens.officialTokenMissing"),
        attachedTo,
        onComplete,
      });
    },
    [beginBetrayalVisualTransition, core, effectiveLocale, t],
  );
  const applyOptimisticPreviewAfterCommand = React.useCallback(
    <Type extends keyof BetrayalCommandMap>(
      type: Type,
      payload: BetrayalCommandMap[Type],
      options: {
        keepSelectedInventoryCardId?: string | null;
        lastUsedInventoryCardId?: string | null;
      } = {},
    ) => {
      const command = {
        type,
        payload,
        playerId: viewerPlayerId,
        timestamp: Date.now(),
      } as Parameters<typeof BetrayalDomain.execute>[1];
      const validation = BetrayalDomain.validate(
        { core: baseCore, sys: {} as never },
        command,
      );
      if (!validation.valid) {
        return;
      }
      const nextCore = BetrayalDomain.execute(
        { core: baseCore, sys: {} as never },
        command,
      ).reduce(
        (currentCore, event) => BetrayalDomain.reduce(currentCore, event),
        baseCore,
      );
      const nextPreviewState = createInitialPreviewState(nextCore);
      setPreviewState((previousState) => ({
        ...nextPreviewState,
        selectedInventoryCardId:
          options.keepSelectedInventoryCardId ??
          nextPreviewState.selectedInventoryCardId,
        lastUsedInventoryCardId:
          options.lastUsedInventoryCardId ??
          nextPreviewState.lastUsedInventoryCardId,
        dismissedLatestDiscoveryKey:
          buildLatestDiscoveryKey(nextCore) ===
          previousState.dismissedLatestDiscoveryKey
            ? previousState.dismissedLatestDiscoveryKey
            : nextPreviewState.dismissedLatestDiscoveryKey,
        dismissedRecentRollId:
          buildRecentRollDisplayKey(nextCore.recentRoll) ===
          previousState.dismissedRecentRollId
            ? previousState.dismissedRecentRollId
            : nextPreviewState.dismissedRecentRollId,
      }));
    },
    [baseCore, viewerPlayerId],
  );

  const handleSelectExplorer = React.useCallback(
    (explorerId: string) => {
      setSelectedExplorerId(explorerId);
      dispatchCommand(BETRAYAL_COMMANDS.SELECT_EXPLORER, { explorerId });
    },
    [dispatchCommand],
  );

  const handleConfirmExplorer = React.useCallback(() => {
    if (
      baseCore.selectedExplorerByPlayerId[viewerPlayerId] !== selectedExplorerId
    ) {
      dispatchCommand(BETRAYAL_COMMANDS.SELECT_EXPLORER, {
        explorerId: selectedExplorerId,
      });
    }
    dispatchCommand(BETRAYAL_COMMANDS.CONFIRM_EXPLORER, {});
  }, [
    baseCore.selectedExplorerByPlayerId,
    dispatchCommand,
    selectedExplorerId,
    viewerPlayerId,
  ]);

  const handleProposeScenarioCard = React.useCallback(
    (candidateId: BetrayalScenarioCardId) => {
      pendingScenarioStartOpeningKeyRef.current = null;
      dispatchCommand(BETRAYAL_COMMANDS.PROPOSE_SCENARIO_CARD, {
        candidateId,
      });
    },
    [dispatchCommand],
  );

  const handleConfirmScenarioCard = React.useCallback(() => {
    pendingScenarioStartOpeningKeyRef.current = scenarioStartOpeningKey;
    dispatchCommand(BETRAYAL_COMMANDS.CONFIRM_SCENARIO_CARD, {});
  }, [dispatchCommand, scenarioStartOpeningKey]);

  const handleStartScenario = React.useCallback(() => {
    pendingScenarioStartOpeningKeyRef.current = scenarioStartOpeningKey;
    dispatchCommand(BETRAYAL_COMMANDS.START_SCENARIO, {});
  }, [dispatchCommand, scenarioStartOpeningKey]);
  const dismissScenarioStartOpening = React.useCallback(() => {
    if (scenarioStartOpeningKey) {
      setDismissedScenarioStartOpeningCinematicKey(scenarioStartOpeningKey);
    }
    setScenarioStartOpeningCinematicKey(null);
  }, [scenarioStartOpeningKey]);
  const roomOccupants = React.useMemo(() => buildRoomOccupants(core), [core]);
  const roomMonsters = React.useMemo(() => buildRoomMonsters(core), [core]);
  const movingExplorerPlayerId =
    visualTransition?.kind === "explorer-move"
      ? (visualTransition.explorer?.playerId ?? null)
      : null;
  const movingMonsterId =
    visualTransition?.kind === "monster-move"
      ? (visualTransition.monster?.id ?? null)
      : null;
  const movingGirlTokenId =
    visualTransition?.kind === "girl-transfer"
      ? (visualTransition.girlToken?.id ?? null)
      : null;
  const monsterStatuses = React.useMemo(
    () => resolveBetrayalMonsterStatuses(core),
    [core],
  );
  const monsterStatusById = React.useMemo(
    () =>
      new Map(
        monsterStatuses.map((status) => [status.monsterId, status.status]),
      ),
    [monsterStatuses],
  );
  const inspectedMonsterStatus = React.useMemo(
    () =>
      inspectedMonster
        ? (monsterStatuses.find(
            (status) => status.monsterId === inspectedMonster.id,
          ) ?? null)
        : null,
    [inspectedMonster, monsterStatuses],
  );
  const currentExplorerFloor = React.useMemo(
    () => resolveExplorerFloor(core),
    [core],
  );
  const viewerExplorerFloor = React.useMemo(
    () => resolveExplorerFloorByPlayer(core, viewerPlayerId),
    [core, viewerPlayerId],
  );
  const shouldFollowCurrentExplorerFloor =
    playerID != null && core.currentPlayer === viewerPlayerId;
  const previousFloorFollowTargetRef = React.useRef({
    currentPlayer: core.currentPlayer,
    currentExplorerFloor,
  });
  const currentRoom = React.useMemo(
    () =>
      core.rooms.find((room) => room.id === core.currentExplorer.roomId) ??
      null,
    [core.currentExplorer.roomId, core.rooms],
  );
  const roomEndTurnEffectHint = React.useMemo(
    () => resolveRoomEndTurnEffectHint(currentRoom, t),
    [currentRoom, t],
  );
  const occupiedRoomMapFloors = React.useMemo(
    () => resolveOccupiedRoomMapFloors(core),
    [core],
  );
  React.useEffect(() => {
    const previousTarget = previousFloorFollowTargetRef.current;
    if (
      shouldFollowCurrentExplorerFloor &&
      previousTarget.currentPlayer === core.currentPlayer &&
      previousTarget.currentExplorerFloor !== currentExplorerFloor
    ) {
      setSelectedRoomMapFloor(currentExplorerFloor);
    }
    previousFloorFollowTargetRef.current = {
      currentPlayer: core.currentPlayer,
      currentExplorerFloor,
    };
  }, [
    core.currentPlayer,
    currentExplorerFloor,
    shouldFollowCurrentExplorerFloor,
  ]);
  const visibleMapRooms = React.useMemo(
    () => core.rooms.filter((room) => room.floor === selectedRoomMapFloor),
    [core.rooms, selectedRoomMapFloor],
  );
  const roomCanvasLayout = React.useMemo(
    () =>
      resolveRoomCanvasLayout(
        visibleMapRooms,
        isPhoneLandscapeLayout ? core.currentExplorer.roomId : null,
      ),
    [core.currentExplorer.roomId, isPhoneLandscapeLayout, visibleMapRooms],
  );
  const roomCanvasStyle = roomCanvasLayout.style;
  const roomCanvasWidth =
    typeof roomCanvasStyle.width === "number"
      ? roomCanvasStyle.width
      : ROOM_CANVAS_MIN_WIDTH;
  const roomCanvasHeight =
    typeof roomCanvasStyle.height === "number"
      ? roomCanvasStyle.height
      : ROOM_CANVAS_MIN_HEIGHT;
  const previewRoom = React.useMemo(
    () => core.rooms.find((room) => room.id === roomPreviewId) ?? null,
    [core.rooms, roomPreviewId],
  );
  const previewRoomVisual = previewRoom
    ? resolveBetrayalRoomNodeTileVisual(
        previewRoom,
        previewRoom.state === "discovered",
      )
    : null;
  const roomCanvasTransformStyle = React.useMemo(
    () => ({
      ...roomCanvasStyle,
      transformOrigin: isPhoneLandscapeLayout ? "center top" : "center center",
    }),
    [isPhoneLandscapeLayout, roomCanvasStyle],
  );

  const phaseItems = React.useMemo(
    () => [
      { id: "preHaunt", label: t("board.phase.preHaunt") },
      { id: "haunt", label: t("board.phase.haunt") },
      { id: "endgame", label: t("board.phase.endgame") },
    ],
    [t],
  );
  const phaseLabel = React.useMemo(
    () =>
      phaseItems.find((item) => item.id === core.phase)?.label ??
      t("board.phase.preHaunt"),
    [core.phase, phaseItems, t],
  );
  const deckItems = React.useMemo(
    () => buildDeckItems(core, t, ASSETS.deck),
    [core, t],
  );
  const discardItems = React.useMemo(
    () => buildDiscardItems(core, t, ASSETS.deck),
    [core, t],
  );
  const hauntRisk = React.useMemo(() => resolveBetrayalHauntRisk(core), [core]);
  const numberTracks = React.useMemo(
    () => resolveBetrayalNumberTracks(core),
    [core],
  );
  const hauntRiskTrack =
    numberTracks.find((track) => track.id === "haunt-risk") ?? null;
  const inventoryDisplayReadModel = React.useMemo(
    () =>
      resolveBetrayalInventoryDisplayReadModel({
        core,
        allExplorers,
        observedExplorer,
        viewerPlayerId,
        selectedInventoryCardId: previewState.selectedInventoryCardId,
        selectedInventoryTargetPlayerId:
          previewState.selectedInventoryTargetPlayerId,
        selectedInventoryReplacementRollTotal:
          previewState.selectedInventoryReplacementRollTotal,
        inventoryPreviewCardId,
      }),
    [
      allExplorers,
      core,
      inventoryPreviewCardId,
      observedExplorer,
      previewState.selectedInventoryCardId,
      previewState.selectedInventoryTargetPlayerId,
      previewState.selectedInventoryReplacementRollTotal,
      viewerPlayerId,
    ],
  );
  const {
    recentRollInterventionOwner,
    inventoryActionPlayerId,
    actionInventoryCards,
    inventoryDisplayExplorer,
    isInventoryDisplayReadOnly,
    visibleInventoryCards,
    selectedInventoryCard,
    selectedInventoryUseEffect,
    selectedInventoryUseEffectMode,
    selectedInventoryHealTarget,
    selectedInventoryRollTotalReplacementEffect,
    selectedInventoryReplacementRollTotal,
    selectedInventoryReplacementRollTotalOptions,
    healTargetExplorers,
    selectedInventoryTargetPlayerId,
    selectedInventoryHealPreviewExplorer,
    selectedInventoryHealPreviewTraits,
    previewInventoryCard,
  } = inventoryDisplayReadModel;
  const {
    latestLogEntry,
    visibleBoardResultFeedback,
    earlierLogEntries,
  } = React.useMemo(
    () => resolveBetrayalActivityPresentation({ core, text: t }),
    [core, t],
  );
  const {
    skeletonKeyMoveTargetRoomIds,
    moveTargetRooms,
    moveTargetRoomIds,
  } = React.useMemo(() => resolveBetrayalMoveTargetReadModel(core), [core]);
  const inventoryRoomTargetReadModel = React.useMemo(
    () =>
      resolveBetrayalInventoryRoomTargetReadModel({
        core,
        selectedInventoryUseEffectMode,
        selectedInventoryTargetRoomId:
          previewState.selectedInventoryTargetRoomId,
        selectedMaskTargetRoomIdsByTokenId:
          previewState.selectedMaskTargetRoomIdsByTokenId,
        activeMaskTargetTokenId: previewState.activeMaskTargetTokenId,
        resolvePlayerName: (playerId, displayName) =>
          resolvePlayerName(playerId, displayName, matchData),
      }),
    [
      core,
      matchData,
      previewState.activeMaskTargetTokenId,
      previewState.selectedInventoryTargetRoomId,
      previewState.selectedMaskTargetRoomIdsByTokenId,
      selectedInventoryUseEffectMode,
    ],
  );
  const {
    maskTargetRooms,
    inventoryTargetRooms,
    maskTargetTokens,
    selectedMaskTargetRoomIdsByTokenId,
    activeMaskTargetTokenId,
    selectedInventoryTargetRoomId,
  } = inventoryRoomTargetReadModel;
  const attackWeaponCardStatuses = React.useMemo(
    () => resolveAttackWeaponCardStatuses(core),
    [core],
  );
  const pendingEventChoiceReadModel = React.useMemo(
    () =>
      resolveBetrayalPendingEventChoiceReadModel({
        core,
        attackWeaponCardStatuses,
        selectedEventTrait: previewState.selectedEventTrait,
        selectedEventTargetRoomId: previewState.selectedEventTargetRoomId,
        selectedEventDamageTraits: previewState.selectedEventDamageTraits,
        selectedEventCardId: previewState.selectedEventCardId,
      }),
    [
      attackWeaponCardStatuses,
      core,
      previewState.selectedEventCardId,
      previewState.selectedEventDamageTraits,
      previewState.selectedEventTargetRoomId,
      previewState.selectedEventTrait,
    ],
  );
  const {
    pendingEventChoice,
    pendingEventChoiceIsEventSymbolSkip,
    pendingEventTraitChoices,
    selectedEventTrait,
    pendingEventTargetRooms,
    selectedEventTargetRoomId,
    pendingEventDamageChoice,
    shouldShowPendingEventDamageChoice,
    selectedEventDamageTraits,
    pendingEventItemChoice,
    pendingEventItemChoiceCards,
    selectedEventCardId,
    pendingEventChoiceRoll,
    pendingEventChoiceAllTraitCheck,
    pendingEventChoiceHasResultPanel,
    pendingEventReady,
    shouldShowPendingEventAcceptButton,
    pendingEventAwaitsMapTargetClick,
    pendingEventFocusesMapTarget,
    pendingEventCanDecline,
  } = pendingEventChoiceReadModel;
  const pendingDamageAllocationReadModel = React.useMemo(
    () =>
      resolveBetrayalDamageAllocationReadModel({
        core,
        allExplorers,
        viewerPlayerId,
        selectedDamageAllocationTraits:
          previewState.selectedDamageAllocationTraits,
        useBroochForDamageAllocation:
          previewState.useBroochForDamageAllocation,
        resolvePlayerName: (playerId, displayName) =>
          resolvePlayerName(playerId, displayName, matchData),
        text: t,
      }),
    [
      allExplorers,
      core,
      matchData,
      previewState.selectedDamageAllocationTraits,
      previewState.useBroochForDamageAllocation,
      t,
      viewerPlayerId,
    ],
  );
  const {
    allocation: pendingDamageAllocation,
    explorer: pendingDamageExplorer,
    explorerName: pendingDamageExplorerName,
    phase: pendingDamageAllocationPhase,
    canUseBrooch: canUseBroochForPendingDamageAllocation,
    usesBrooch: pendingDamageUsesBrooch,
    allowedTraits: pendingDamageAllocationAllowedTraits,
    selectedTraits: selectedDamageAllocationTraits,
    reductionAmount: pendingDamageReductionAmount,
    reductionSourceLabel: pendingDamageReductionSourceLabel,
    ready: pendingDamageAllocationReady,
    isForViewer: isPendingDamageAllocationForViewer,
  } = pendingDamageAllocationReadModel;
  const explorableRoomSlots = React.useMemo(
    () => resolveExplorableRoomSlots(core),
    [core],
  );
  const explorableRoomSlotIds = React.useMemo(
    () => new Set(explorableRoomSlots.map((room) => room.id)),
    [explorableRoomSlots],
  );
  const crossFloorMoveTargetRooms = React.useMemo(
    () => moveTargetRooms.filter((room) => room.floor !== currentExplorerFloor),
    [currentExplorerFloor, moveTargetRooms],
  );
  const hasCrossFloorMoveTargets = crossFloorMoveTargetRooms.length > 0;
  const bloodFromStoneSetupPlacementPlan = React.useMemo(
    () => resolveBloodFromStoneSetupPlacementPlan(core),
    [core],
  );
  const bloodFromStoneSetupCandidateRoomIds = React.useMemo(
    () =>
      new Set(bloodFromStoneSetupPlacementPlan.playerChoiceCandidateRoomIds),
    [bloodFromStoneSetupPlacementPlan.playerChoiceCandidateRoomIds],
  );
  const bloodFromStoneSetupCandidateRooms = React.useMemo(
    () =>
      bloodFromStoneSetupPlacementPlan.playerChoiceCandidateRoomIds
        .map((roomId) => core.rooms.find((room) => room.id === roomId) ?? null)
        .filter((room): room is BetrayalRoomNode => Boolean(room)),
    [bloodFromStoneSetupPlacementPlan.playerChoiceCandidateRoomIds, core.rooms],
  );
  const selectedBloodFromStoneStoneCherubRoomIds = React.useMemo(
    () =>
      previewState.selectedBloodFromStoneStoneCherubRoomIds
        .filter((roomId) => bloodFromStoneSetupCandidateRoomIds.has(roomId))
        .slice(0, bloodFromStoneSetupPlacementPlan.pendingPlayerChoiceCount),
    [
      bloodFromStoneSetupCandidateRoomIds,
      bloodFromStoneSetupPlacementPlan.pendingPlayerChoiceCount,
      previewState.selectedBloodFromStoneStoneCherubRoomIds,
    ],
  );
  const selectedBloodFromStoneStoneCherubRoomCountByRoomId =
    React.useMemo(() => {
      const counts = new Map<string, number>();
      selectedBloodFromStoneStoneCherubRoomIds.forEach((roomId) => {
        counts.set(roomId, (counts.get(roomId) ?? 0) + 1);
      });
      return counts;
    }, [selectedBloodFromStoneStoneCherubRoomIds]);
  const remainingBloodFromStoneSetupPlacementCount = Math.max(
    0,
    bloodFromStoneSetupPlacementPlan.pendingPlayerChoiceCount -
      selectedBloodFromStoneStoneCherubRoomIds.length,
  );
  const isBloodFromStoneSetupPlacementMode =
    previewState.interactionMode === "bloodFromStoneSetupPlacement" &&
    bloodFromStoneSetupPlacementPlan.pendingPlayerChoiceCount > 0;
  React.useEffect(() => {
    const needsExit =
      bloodFromStoneSetupPlacementPlan.pendingPlayerChoiceCount <= 0 &&
      (previewState.interactionMode === "bloodFromStoneSetupPlacement" ||
        previewState.selectedBloodFromStoneStoneCherubRoomIds.length > 0);
    const needsPrune =
      selectedBloodFromStoneStoneCherubRoomIds.length !==
        previewState.selectedBloodFromStoneStoneCherubRoomIds.length ||
      selectedBloodFromStoneStoneCherubRoomIds.some(
        (roomId, index) =>
          roomId !==
          previewState.selectedBloodFromStoneStoneCherubRoomIds[index],
      );
    if (!needsExit && !needsPrune) {
      return;
    }
    setPreviewState((previousState) => ({
      ...previousState,
      interactionMode:
        previousState.interactionMode === "bloodFromStoneSetupPlacement" &&
        bloodFromStoneSetupPlacementPlan.pendingPlayerChoiceCount <= 0
          ? "default"
          : previousState.interactionMode,
      selectedBloodFromStoneStoneCherubRoomIds:
        bloodFromStoneSetupPlacementPlan.pendingPlayerChoiceCount <= 0
          ? []
          : selectedBloodFromStoneStoneCherubRoomIds,
    }));
  }, [
    bloodFromStoneSetupPlacementPlan.pendingPlayerChoiceCount,
    previewState.interactionMode,
    previewState.selectedBloodFromStoneStoneCherubRoomIds,
    selectedBloodFromStoneStoneCherubRoomIds,
  ]);
  const roomMapFloorState = React.useMemo(
    () =>
      resolveBetrayalBoardRoomMapFloorState({
        occupiedRoomMapFloors,
        currentExplorerFloor,
        selectedRoomMapFloor,
        moveTargetRooms,
        interactionMode: previewState.interactionMode,
        selectedInventoryUseEffectMode,
        inventoryTargetRooms,
        maskTargetRooms,
        explorableRoomSlots,
        bloodFromStoneSetupPendingPlayerChoiceCount:
          bloodFromStoneSetupPlacementPlan.pendingPlayerChoiceCount,
        bloodFromStoneSetupCandidateRooms,
        pendingEventTargetRooms,
        isBloodFromStoneSetupPlacementMode,
      }),
    [
      bloodFromStoneSetupCandidateRooms,
      bloodFromStoneSetupPlacementPlan.pendingPlayerChoiceCount,
      currentExplorerFloor,
      explorableRoomSlots,
      inventoryTargetRooms,
      isBloodFromStoneSetupPlacementMode,
      maskTargetRooms,
      moveTargetRooms,
      occupiedRoomMapFloors,
      pendingEventTargetRooms,
      previewState.interactionMode,
      selectedInventoryUseEffectMode,
      selectedRoomMapFloor,
    ],
  );
  const roomMapFloors = roomMapFloorState.floors;
  React.useEffect(() => {
    if (!roomMapFloors.includes(selectedRoomMapFloor)) {
      setSelectedRoomMapFloor(
        shouldFollowCurrentExplorerFloor
          ? currentExplorerFloor
          : viewerExplorerFloor,
      );
    }
  }, [
    currentExplorerFloor,
    roomMapFloors,
    selectedRoomMapFloor,
    shouldFollowCurrentExplorerFloor,
    viewerExplorerFloor,
  ]);
  const upperRoomMapFloor = roomMapFloorState.upperFloor;
  const lowerRoomMapFloor = roomMapFloorState.lowerFloor;
  const upperRoomMapFloorHasSelectionTarget =
    roomMapFloorState.upperFloorHasSelectionTarget;
  const lowerRoomMapFloorHasSelectionTarget =
    roomMapFloorState.lowerFloorHasSelectionTarget;
  const hasCrossFloorRoomSelectionTargets =
    roomMapFloorState.hasCrossFloorSelectionTargets;
  const handleSelectRoomMapFloor = React.useCallback(
    (floor: BetrayalRoomNode["floor"]) => {
      setSelectedRoomMapFloor(floor);
      if (
        isTutorialActive &&
        tutorialStep?.id === "switch-to-upper-floor" &&
        floor === "upper"
      ) {
        nextStep("auto");
      }
    },
    [isTutorialActive, nextStep, tutorialStep?.id],
  );
  const canDeclareHolySymbolExplore = canUseHolySymbolForDiscovery(core);
  const useHolySymbolForExplore =
    previewState.useHolySymbolForExplore && canDeclareHolySymbolExplore;
  const canStartExploreSelection = Boolean(
    (core.phase === "preHaunt" || core.phase === "haunt") &&
    !core.turnEndedByDiscovery &&
    explorableRoomSlots.length > 0,
  );
  const nextExploreDeckKind = resolveNextRoomDiscoveryDeckKind(core, {
    useHolySymbol: useHolySymbolForExplore,
  });
  const canDeclareIdolExplore =
    canStartExploreSelection &&
    nextExploreDeckKind === "event" &&
    canUseIdolToSkipEvent(core);
  const canDeclareTraitorEventSkip = false;
  const hasExploreDeclarationOptions = Boolean(
    canStartExploreSelection &&
    (canDeclareHolySymbolExplore ||
      canDeclareIdolExplore ||
      canDeclareTraitorEventSkip),
  );
  const exploreDeclarationLabel = t("board.inventory.exploreDeclaration");
  const useIdolForExplore =
    previewState.useIdolForExplore && canDeclareIdolExplore;
  const ignoreEventSymbolWithTraitorPower =
    previewState.ignoreEventSymbolWithTraitorPower &&
    canDeclareTraitorEventSkip;
  const pendingRoomPlacementPreview =
    React.useMemo<BetrayalRoomPlacementPreview | null>(
      () =>
        previewState.pendingRoomPlacementSlotId
          ? resolveRoomPlacementPreview(core, {
              roomId: previewState.pendingRoomPlacementSlotId,
              useHolySymbol: useHolySymbolForExplore,
            })
          : null,
      [core, previewState.pendingRoomPlacementSlotId, useHolySymbolForExplore],
    );
  const pendingRoomOrientationOptions = React.useMemo(
    () => pendingRoomPlacementPreview?.orientationOptions ?? [],
    [pendingRoomPlacementPreview],
  );
  const selectedRoomOrientationOption = React.useMemo(() => {
    if (!pendingRoomPlacementPreview) {
      return null;
    }
    return (
      pendingRoomOrientationOptions.find(
        (option) =>
          option.orientationTurns === previewState.pendingRoomOrientationTurns,
      ) ??
      pendingRoomOrientationOptions.find(
        (option) =>
          option.orientationTurns ===
          pendingRoomPlacementPreview.defaultOrientationTurns,
      ) ??
      pendingRoomOrientationOptions[0] ??
      null
    );
  }, [
    pendingRoomOrientationOptions,
    pendingRoomPlacementPreview,
    previewState.pendingRoomOrientationTurns,
  ]);
  const selectedRoomOrientationTurns =
    selectedRoomOrientationOption?.orientationTurns ??
    pendingRoomPlacementPreview?.defaultOrientationTurns ??
    0;
  const pendingRoomTileAdjustmentOptions = React.useMemo(
    () =>
      pendingRoomPlacementPreview?.requiresTileAdjustment
        ? resolveRoomTileAdjustmentOptions(core, {
            roomId: pendingRoomPlacementPreview.slotId,
            orientationTurns: selectedRoomOrientationTurns,
            useHolySymbol: useHolySymbolForExplore,
          })
        : [],
    [
      core,
      pendingRoomPlacementPreview,
      selectedRoomOrientationTurns,
      useHolySymbolForExplore,
    ],
  );
  const selectedRoomTileAdjustmentOption = React.useMemo(() => {
    if (!previewState.pendingRoomTileAdjustment) {
      return null;
    }
    return (
      pendingRoomTileAdjustmentOptions.find((option) =>
        roomTileAdjustmentSelectionsMatch(
          option,
          previewState.pendingRoomTileAdjustment!,
        ),
      ) ?? null
    );
  }, [
    pendingRoomTileAdjustmentOptions,
    previewState.pendingRoomTileAdjustment,
  ]);
  const pendingRoomPlacementFailureText =
    previewState.pendingRoomPlacementFailure
      ? t("board.rooms.floorExhausted", {
          floor: resolveFloorLabel(
            previewState.pendingRoomPlacementFailure.floor,
          ),
        })
      : null;
  const pendingRoomPlacementAdjustmentText =
    pendingRoomPlacementPreview?.requiresTileAdjustment
      ? t("board.rooms.adjustTilesRequired")
      : null;
  const pendingRoomPlacementVisual = pendingRoomPlacementPreview?.room.visualId
    ? (resolveBetrayalRoomTileVisual(
        pendingRoomPlacementPreview.room.visualId,
      ) ?? BETRAYAL_ROOM_TILE_VISUALS.conservatory)
    : null;
  const tradeSelectionReadModel = React.useMemo(
    () =>
      resolveBetrayalTradeSelectionReadModel({
        core,
        selectedTradeTargetPlayerId: previewState.selectedTradeTargetPlayerId,
        selectedTradeReturnCardIds: previewState.selectedTradeReturnCardIds,
        selectedTradeGiveCardIds: previewState.selectedTradeGiveCardIds,
        selectedDogTradeCardIds: previewState.selectedDogTradeCardIds,
      }),
    [
      core,
      previewState.selectedDogTradeCardIds,
      previewState.selectedTradeGiveCardIds,
      previewState.selectedTradeReturnCardIds,
      previewState.selectedTradeTargetPlayerId,
    ],
  );
  const {
    tradeTargets,
    canUseDogTrade,
    dogTradeTargets,
    activeTradeTargets,
    selectedTradeTargetPlayerId,
    selectedTradeTarget,
    selectedTradeReturnCardIds,
    selectedTradeGiveCardIds,
    selectedTradeGiveCards,
    selectedDogTradeCardIds,
    selectedDogTradeCardNames,
    selectedTradeGiveText,
    selectedTradeReturnText,
    dogTradeFlowActive,
    useDogTrade,
    tradeSelectionReady,
  } = tradeSelectionReadModel;
  const corpseLootTargets = React.useMemo(
    () => resolveCorpseLootTargets(core),
    [core],
  );
  const hasCorpseLootTargets = corpseLootTargets.length > 0;
  const tradeReturnSelectorLabel = t("board.status.tradeReturnLabel");
  const attackDeclarationReadModel = React.useMemo(
    () =>
      resolveBetrayalAttackDeclarationReadModel({
        core,
        attackWeaponCardStatuses,
        selectedAttackWeaponCardId: previewState.selectedAttackWeaponCardId,
      }),
    [attackWeaponCardStatuses, core, previewState.selectedAttackWeaponCardId],
  );
  const {
    attackWeaponCards,
    dynamiteAttackWeaponCard,
    selectedAttackWeaponCardId,
    selectedAttackWeaponEffectId,
    selectedAttackTargetPlayerIds,
    attackDeclarationTargetPlayerIds,
    heroAttackTargets,
  } = attackDeclarationReadModel;
  const selectedAttackWeaponCardIdRef = React.useRef<string | null>(null);
  React.useLayoutEffect(() => {
    selectedAttackWeaponCardIdRef.current = selectedAttackWeaponCardId;
  }, [selectedAttackWeaponCardId]);
  React.useEffect(() => {
    if (inventoryPreviewCardId && !previewInventoryCard) {
      setInventoryPreviewCardId(null);
    }
  }, [inventoryPreviewCardId, previewInventoryCard]);
  const selectedCorpseLootTargetPlayerId = corpseLootTargets.some(
    (explorer) =>
      explorer.playerId === previewState.selectedTradeTargetPlayerId,
  )
    ? previewState.selectedTradeTargetPlayerId
    : null;
  const selectedCorpseLootTarget = React.useMemo(
    () =>
      corpseLootTargets.find(
        (explorer) => explorer.playerId === selectedCorpseLootTargetPlayerId,
      ) ?? null,
    [corpseLootTargets, selectedCorpseLootTargetPlayerId],
  );
  const selectedCorpseLootCardId = selectedCorpseLootTarget?.inventory.some(
    (card) => card.id === previewState.selectedCorpseLootCardId,
  )
    ? previewState.selectedCorpseLootCardId
    : null;
  const selectedCorpseLootTargetName = selectedCorpseLootTarget
    ? resolvePlayerName(
        selectedCorpseLootTarget.playerId,
        selectedCorpseLootTarget.displayName,
        matchData,
      )
    : null;
  const selectedTradeTargetName = selectedTradeTarget
    ? resolvePlayerName(
        selectedTradeTarget.playerId,
        selectedTradeTarget.displayName,
        matchData,
      )
    : null;
  const dustRuntime = core.scenarioRuntime.dust ?? null;
  const visibleHauntTokensByRoomId = React.useMemo(
    () =>
      resolveBetrayalBoardVisibleHauntTokensByRoomId(
        resolveBetrayalHauntTokenInstances(core),
      ),
    [core],
  );
  const dustPresentation = React.useMemo(
    () =>
      resolveBetrayalDustPresentation({
        t,
        phase: core.phase,
        hauntCardNumber: core.scenarioRuntime.hauntCardNumber,
        dust: dustRuntime,
        currentExplorer: core.currentExplorer,
        otherExplorers: core.otherExplorers,
        deadExplorerPlayerIds: core.scenarioRuntime.deadExplorerPlayerIds,
        usedCardIdsThisTurn: core.usedCardIdsThisTurn,
        viewerPlayerId,
        interactionMode: previewState.interactionMode,
        selectedTargetPlayerId: previewState.selectedTradeTargetPlayerId,
        resolvePlayerName: (playerId, explorerName) =>
          resolvePlayerName(playerId, explorerName, matchData),
      }),
    [
      core.currentExplorer,
      core.otherExplorers,
      core.phase,
      core.scenarioRuntime.deadExplorerPlayerIds,
      core.scenarioRuntime.hauntCardNumber,
      core.usedCardIdsThisTurn,
      dustRuntime,
      matchData,
      previewState.interactionMode,
      previewState.selectedTradeTargetPlayerId,
      t,
      viewerPlayerId,
    ],
  );
  const dustSameRoomLivingTargets = dustPresentation.sameRoomLivingTargets;
  const dustTargetPlayerIds = dustPresentation.targetPlayerIds;
  const isDustSicknessExchangeAvailable =
    dustPresentation.isSicknessExchangeAvailable;
  const isDustSicknessExchangeMode = dustPresentation.isSicknessExchangeMode;
  const selectedDustTargetPlayerId = dustPresentation.selectedTargetPlayerId;
  const selectedDustTargetName = dustPresentation.selectedTargetName;
  const dustProgressItems = dustPresentation.progressItems;
  const pendingTradeAgreement = core.pendingTradeAgreement;
  const pendingSicknessExchange = dustRuntime?.pendingSicknessExchange ?? null;
  const pendingTradeRequester = pendingTradeAgreement
    ? (allExplorers.find(
        (explorer) => explorer.playerId === pendingTradeAgreement.playerId,
      ) ?? null)
    : null;
  const pendingTradeTarget = pendingTradeAgreement
    ? (allExplorers.find(
        (explorer) =>
          explorer.playerId === pendingTradeAgreement.targetPlayerId,
      ) ?? null)
    : null;
  const pendingTradeRequesterName = pendingTradeRequester
    ? resolvePlayerName(
        pendingTradeRequester.playerId,
        pendingTradeRequester.displayName,
        matchData,
      )
    : "";
  const pendingTradeTargetName = pendingTradeTarget
    ? resolvePlayerName(
        pendingTradeTarget.playerId,
        pendingTradeTarget.displayName,
        matchData,
      )
    : "";
  const pendingTradeCardNames = pendingTradeAgreement
    ? pendingTradeAgreement.cardIds
        .map(
          (cardId) =>
            pendingTradeRequester?.inventory.find((card) => card.id === cardId)
              ?.name,
        )
        .filter((name): name is string => Boolean(name))
        .join("、")
    : "";
  const pendingTradeReturnCardNames = pendingTradeAgreement
    ? pendingTradeAgreement.targetCardIds
        .map(
          (cardId) =>
            pendingTradeTarget?.inventory.find((card) => card.id === cardId)
              ?.name,
        )
        .filter((name): name is string => Boolean(name))
        .join("、")
    : "";
  const pendingTradeGiveText = pendingTradeAgreement
    ? pendingTradeAgreement.cardIds.length > 0
      ? pendingTradeCardNames || t("board.status.tradeAgreementUnknownCards")
      : ""
    : "";
  const pendingTradeReturnText = pendingTradeAgreement
    ? pendingTradeAgreement.targetCardIds.length > 0
      ? pendingTradeReturnCardNames ||
        t("board.status.tradeAgreementUnknownCards")
      : ""
    : "";
  const isPendingTradeForViewer =
    pendingTradeAgreement?.targetPlayerId === viewerPlayerId;
  const isPendingTradeFromViewer =
    pendingTradeAgreement?.playerId === viewerPlayerId;
  const pendingSicknessRequester = pendingSicknessExchange
    ? (allExplorers.find(
        (explorer) =>
          explorer.playerId === pendingSicknessExchange.requesterPlayerId,
      ) ?? null)
    : null;
  const pendingSicknessTarget = pendingSicknessExchange
    ? (allExplorers.find(
        (explorer) =>
          explorer.playerId === pendingSicknessExchange.targetPlayerId,
      ) ?? null)
    : null;
  const pendingSicknessRequesterName = pendingSicknessRequester
    ? resolvePlayerName(
        pendingSicknessRequester.playerId,
        pendingSicknessRequester.displayName,
        matchData,
      )
    : "";
  const pendingSicknessTargetName = pendingSicknessTarget
    ? resolvePlayerName(
        pendingSicknessTarget.playerId,
        pendingSicknessTarget.displayName,
        matchData,
      )
    : "";
  const isPendingSicknessForViewer =
    pendingSicknessExchange?.targetPlayerId === viewerPlayerId;
  const isPendingSicknessFromViewer =
    pendingSicknessExchange?.requesterPlayerId === viewerPlayerId;
  const helpingHandsPendingReward =
    resolveHelpingHandsPendingAttackReward(core);
  const helpingHandsRewardAttacker = helpingHandsPendingReward
    ? (allExplorers.find(
        (explorer) =>
          explorer.playerId === helpingHandsPendingReward.attackerPlayerId,
      ) ?? null)
    : null;
  const helpingHandsRewardDefender = helpingHandsPendingReward
    ? (allExplorers.find(
        (explorer) =>
          explorer.playerId === helpingHandsPendingReward.defenderPlayerId,
      ) ?? null)
    : null;
  const helpingHandsRewardAttackerName = helpingHandsRewardAttacker
    ? resolvePlayerName(
        helpingHandsRewardAttacker.playerId,
        helpingHandsRewardAttacker.displayName,
        matchData,
      )
    : "";
  const helpingHandsRewardDefenderName = helpingHandsRewardDefender
    ? resolvePlayerName(
        helpingHandsRewardDefender.playerId,
        helpingHandsRewardDefender.displayName,
        matchData,
      )
    : "";
  const helpingHandsStealableCards = helpingHandsPendingReward
    ? resolveHelpingHandsStealableCards(
        core,
        helpingHandsPendingReward.defenderPlayerId,
      )
    : [];
  const isHelpingHandsRewardChooser =
    helpingHandsPendingReward?.attackerPlayerId ===
    core.currentExplorer.playerId;
  const mummyPendingReward = resolveMummyPendingAttackReward(core);
  const mummyRewardController = mummyPendingReward
    ? (allExplorers.find(
        (explorer) =>
          explorer.playerId === mummyPendingReward.controllerPlayerId,
      ) ?? null)
    : null;
  const mummyRewardDefender = mummyPendingReward
    ? (allExplorers.find(
        (explorer) => explorer.playerId === mummyPendingReward.defenderPlayerId,
      ) ?? null)
    : null;
  const mummyRewardControllerName = mummyRewardController
    ? resolvePlayerName(
        mummyRewardController.playerId,
        mummyRewardController.displayName,
        matchData,
      )
    : "";
  const mummyRewardDefenderName = mummyRewardDefender
    ? resolvePlayerName(
        mummyRewardDefender.playerId,
        mummyRewardDefender.displayName,
        matchData,
      )
    : "";
  const mummyStealableCards = mummyPendingReward
    ? resolveMummyStealableCards(core, mummyPendingReward.defenderPlayerId)
    : [];
  const mummyStealableCardIdSet = new Set(
    mummyStealableCards.map((card) => card.id),
  );
  const mummyUnavailableStealTargetCount = mummyPendingReward
    ? mummyPendingReward.stealableCardIds.filter(
        (cardId) => !mummyStealableCardIdSet.has(cardId),
      ).length
    : 0;
  const isMummyRewardChooser =
    mummyPendingReward?.controllerPlayerId === core.currentExplorer.playerId;
  const hasPendingPlayerAgreement = Boolean(
    pendingTradeAgreement ||
    pendingSicknessExchange ||
    mummyPendingReward ||
    helpingHandsPendingReward ||
    pendingDamageAllocation,
  );
  const tradeDraftReadModel = React.useMemo(
    () =>
      resolveBetrayalTradeDraftReadModel({
        core,
        selectedTradeTarget,
        selectedTradeGiveCardIds,
        selectedDogTradeCardIds,
        selectedTradeReturnCardIds,
        activeTradeTargets,
        tradeSelectionTouched: previewState.tradeSelectionTouched,
        hasPendingTradeAgreement: Boolean(pendingTradeAgreement),
        hasPendingSicknessExchange: Boolean(pendingSicknessExchange),
        hasPendingMummyReward: Boolean(mummyPendingReward),
        hasPendingHelpingHandsReward: Boolean(helpingHandsPendingReward),
        isDustSicknessExchangeMode,
        isDustSicknessExchangeAvailable,
        hasSelectedCorpseLootTarget: Boolean(selectedCorpseLootTarget),
      }),
    [
      activeTradeTargets,
      core,
      helpingHandsPendingReward,
      isDustSicknessExchangeAvailable,
      isDustSicknessExchangeMode,
      mummyPendingReward,
      pendingSicknessExchange,
      pendingTradeAgreement,
      previewState.tradeSelectionTouched,
      selectedCorpseLootTarget,
      selectedDogTradeCardIds,
      selectedTradeGiveCardIds,
      selectedTradeReturnCardIds,
      selectedTradeTarget,
    ],
  );
  const {
    hasUsedTradeThisTurn,
    hasTradeDraftSelection,
    isTradeDraftActive,
    isTradeOrLootTargetSelectionActive,
    shouldStartDustSicknessExchange,
    hasAnyTradeSelectableCards,
  } = tradeDraftReadModel;
  const selectedCardUsedThisTurn = selectedInventoryCard
    ? core.usedCardIdsThisTurn.includes(selectedInventoryCard.id)
    : false;
  const lastUsedInventoryCardStillUsed =
    previewState.lastUsedInventoryCardId !== null &&
    core.usedCardIdsThisTurn.includes(previewState.lastUsedInventoryCardId);
  const selectedCardCanUseRecentRollRerollItem = selectedInventoryCard
    ? canUseRecentRollRerollItemForRecentRoll(
        core,
        inventoryActionPlayerId,
        selectedInventoryCard.id,
      )
    : false;
  const selectedCardSpecialActionStatus = selectedInventoryCard
    ? resolveBetrayalPossessionSpecialActionStatus(
        core,
        selectedInventoryCard.id,
        inventoryActionPlayerId,
      )
    : null;
  const selectedCardRecentRollRerollDieIndices =
    selectedInventoryCard && core.recentRoll
      ? resolveRecentRollRerollSelectableDieIndices(
          core.recentRoll,
          selectedInventoryCard.id,
        )
      : [];
  const recentRollRerollSelection =
    selectedCardCanUseRecentRollRerollItem && core.recentRoll
      ? {
          promptLabel: t("board.inventory.rollRerollItem"),
          allowedDieIndices: selectedCardRecentRollRerollDieIndices,
          selectedDieIndex: previewState.selectedRollModifierDieIndex,
          getDieActionLabel: (dieIndex: number) =>
            t("board.inventory.rerollDie", { index: dieIndex + 1 }),
          onSelectDie: (dieIndex: number) => {
            setPreviewState((previousState) => ({
              ...previousState,
              selectedRollModifierDieIndex: dieIndex,
            }));
          },
        }
      : null;
  const selectedRollModifierCard =
    selectedCardCanUseRecentRollRerollItem && selectedInventoryCard
      ? selectedInventoryCard
      : null;
  const selectedRollModifierCardId = selectedRollModifierCard?.id ?? null;
  const selectedRollModifierDieIndex =
    previewState.selectedRollModifierDieIndex;
  const selectedRollModifierCanConfirm = Boolean(
    selectedRollModifierCard &&
    selectedRollModifierDieIndex !== null &&
    selectedCardRecentRollRerollDieIndices.includes(
      selectedRollModifierDieIndex,
    ),
  );
  const confirmSelectedRollModifier = React.useCallback(() => {
    if (
      selectedRollModifierCardId === null ||
      selectedRollModifierDieIndex === null
    ) {
      return;
    }
    dispatchCommand(BETRAYAL_COMMANDS.USE_ROLL_REROLL_ITEM, {
      cardId: selectedRollModifierCardId,
      dieIndex: selectedRollModifierDieIndex,
    });
    setInventoryPreviewCardId(null);
    setPreviewState((previousState) => ({
      ...previousState,
      selectedInventoryCardId: null,
      selectedRollModifierDieIndex: null,
    }));
  }, [
    dispatchCommand,
    selectedRollModifierCardId,
    selectedRollModifierDieIndex,
  ]);
  const rollModifierCardIds = new Set(
    actionInventoryCards
      .filter((card) =>
        canUseRecentRollRerollItemForRecentRoll(
          core,
          inventoryActionPlayerId,
          card.id,
        ),
      )
      .map((card) => card.id),
  );
  const eventRollBookCardIds = new Set(
    actionInventoryCards
      .filter((card) =>
        canUseBookForPendingEventRoll(core, inventoryActionPlayerId, card.id),
      )
      .map((card) => card.id),
  );
  const hasRecentRollModifier =
    rollModifierCardIds.size > 0 || eventRollBookCardIds.size > 0;
  const {
    needsTargetRoom: selectedCardNeedsTargetRoom,
    disabled: selectedCardUseDisabled,
    disabledReason: selectedCardUseDisabledReason,
    statusText: useStatusText,
  } = resolveBetrayalSelectedInventoryUseState({
    t,
    selectedInventoryCard,
    selectedInventoryUseEffectMode,
    selectedInventoryHealTarget,
    healTargetExplorerCount: healTargetExplorers.length,
    selectedInventoryTargetRoomId,
    selectedInventoryTargetPlayerId,
    selectedInventoryReplacementRollTotal,
    maskTargetTokenIds: maskTargetTokens.map((token) => token.id),
    selectedMaskTargetRoomIdsByTokenId,
    selectedCardCanUseRecentRollRerollItem,
    selectedCardSpecialActionStatus,
    lastUsedInventoryCardStillUsed,
  });
  const selectedInventoryDisplayText =
    isTradeDraftActive && selectedTradeGiveText
      ? selectedTradeGiveText
      : (selectedInventoryCard?.name ?? t("board.status.noSelectedCard"));
  const hasSelectedInventoryDisplay =
    Boolean(selectedInventoryCard) ||
    (isTradeDraftActive && selectedTradeGiveText.length > 0);
  const hauntSpecialActionTargetSelectionReadModel = React.useMemo(
    () =>
      resolveBetrayalHauntSpecialActionTargetSelectionReadModel({
        core,
        selectedMagicCameraTargetPlayerId:
          previewState.selectedTradeTargetPlayerId,
        selectedPeekabooSameRoomMonsterId:
          previewState.selectedPeekabooSameRoomMonsterId,
        hauntTargetingActionKind: previewState.hauntTargetingActionKind,
      }),
    [
      core,
      previewState.hauntTargetingActionKind,
      previewState.selectedPeekabooSameRoomMonsterId,
      previewState.selectedTradeTargetPlayerId,
    ],
  );
  const {
    magicCameraPhotoTargetPlayerIds,
    magicCameraPhotoTarget,
    magicCameraPhotoTrait,
    bloodFromStonePeekabooOptions,
    bloodFromStonePeekabooSameRoomMonsterIds,
    bloodFromStonePeekabooLineOfSightMonsterIds,
    isBloodFromStonePeekabooMode,
  } = hauntSpecialActionTargetSelectionReadModel;
  const monsterActionSelectionReadModel = React.useMemo(
    () =>
      resolveBetrayalMonsterActionSelectionReadModel({
        core,
        allExplorers,
        viewerPlayerId,
        interactionMode: previewState.interactionMode,
        selectedHelpingHandsTrollHandMoveMonsterId:
          previewState.selectedHelpingHandsTrollHandMoveMonsterId,
        selectedMonsterMoveMonsterId:
          previewState.selectedMonsterMoveMonsterId,
        selectedMonsterAttackMonsterId:
          previewState.selectedMonsterAttackMonsterId,
        selectedHelpingHandsTrollHandTargetPlayerId:
          previewState.selectedTradeTargetPlayerId,
      }),
    [
      allExplorers,
      core,
      previewState.interactionMode,
      previewState.selectedHelpingHandsTrollHandMoveMonsterId,
      previewState.selectedMonsterAttackMonsterId,
      previewState.selectedMonsterMoveMonsterId,
      previewState.selectedTradeTargetPlayerId,
      viewerPlayerId,
    ],
  );
  const {
    helpingHandsMonsterTurnStatus,
    isHelpingHandsMonsterTurnController,
    helpingHandsTrollHandMoveEntries,
    selectedHelpingHandsTrollHandMoveEntry,
    selectedHelpingHandsTrollHandMoveMonsterId,
    isHelpingHandsTrollHandMoveMode,
    helpingHandsMovableTrollHandIds,
    monsterActionPanel,
    isDeadTraitorJackSpiritControlTurn,
    controlledMoveMonsterId,
    monsterTurnStartActionSlot,
    monsterMovementRollActionSlot,
    bloodFromStoneMonsterTurnEndActionSlot,
    monsterMoveSlots,
    selectedMonsterMoveEntry,
    selectedMonsterMoveMonsterId,
    isMonsterMoveMode,
    monsterMovableIds,
    monsterAttackSlots,
    selectedMonsterAttackEntry,
    selectedMonsterAttackSourceId,
    isMonsterAttackMode,
    monsterAttackableIds,
    phantomPhotographerTargetPlayerIds,
    selectedMonsterAttackTargetPlayerIds,
    helpingHandsTrollHandAttackTargetsByOptionId,
    helpingHandsVisibleTrollHandAttackOptions,
    helpingHandsTrollHandAttackTargetPlayerIds,
    helpingHandsTrollHandAttackOption,
    helpingHandsTrollHandAttackTarget,
  } = monsterActionSelectionReadModel;
  React.useEffect(() => {
    if (isBloodFromStonePeekabooMode) {
      return;
    }
    if (
      previewState.hauntTargetingActionKind !== "play-peekaboo" &&
      !previewState.selectedPeekabooSameRoomMonsterId &&
      !previewState.selectedPeekabooLineOfSightMonsterId
    ) {
      return;
    }
    setPreviewState((previousState) => ({
      ...previousState,
      hauntTargetingActionKind:
        previousState.hauntTargetingActionKind === "play-peekaboo"
          ? null
          : previousState.hauntTargetingActionKind,
      selectedPeekabooSameRoomMonsterId: null,
      selectedPeekabooLineOfSightMonsterId: null,
    }));
  }, [
    isBloodFromStonePeekabooMode,
    previewState.hauntTargetingActionKind,
    previewState.selectedPeekabooLineOfSightMonsterId,
    previewState.selectedPeekabooSameRoomMonsterId,
  ]);
  const resolveMonsterActionSlotName = React.useCallback(
    (slot: BetrayalMonsterActionSlot | null): string => {
      if (!slot) {
        return "";
      }
      if (slot.monsterId) {
        return (
          core.monsters.find((monster) => monster.id === slot.monsterId)
            ?.name ?? slot.label
        );
      }
      return slot.label.replace(/移动骰$/, "");
    },
    [core.monsters],
  );
  const helpingHandsMonsterControllerName =
    helpingHandsMonsterTurnStatus.controllerPlayerId
      ? resolvePlayerName(
          helpingHandsMonsterTurnStatus.controllerPlayerId,
          allExplorers.find(
            (explorer) =>
              explorer.playerId ===
              helpingHandsMonsterTurnStatus.controllerPlayerId,
          )?.displayName ?? "",
          matchData,
        )
      : "";
  const shouldShowHelpingHandsMonsterTurnStatus =
    core.phase === "haunt" &&
    Boolean(helpingHandsMonsterTurnStatus.monsterTurnAfterPlayerId) &&
    (helpingHandsMonsterTurnStatus.active ||
      !helpingHandsMonsterTurnStatus.controllerPlayerId) &&
    !mummyPendingReward &&
    !helpingHandsPendingReward &&
    !pendingTradeAgreement &&
    !pendingSicknessExchange &&
    !isDustSicknessExchangeMode;
  const helpingHandsTrollHandAttackTargetName =
    helpingHandsTrollHandAttackTarget
      ? resolvePlayerName(
          helpingHandsTrollHandAttackTarget.playerId,
          helpingHandsTrollHandAttackTarget.displayName,
          matchData,
        )
      : "";
  const hauntRevealProtocol = resolveBetrayalHauntRevealProtocol(core);
  const currentHauntOpeningDiscovery = isHauntScenarioOpeningDiscovery(core)
    ? core.latestDiscovery
    : null;
  const queuedHauntOpeningDiscoveryEntryForActionPause =
    !currentHauntOpeningDiscovery &&
    latestDiscoveryQueue[0] &&
    isHauntScenarioOpeningDiscoverySummary(latestDiscoveryQueue[0].discovery)
      ? latestDiscoveryQueue[0]
      : null;
  const hauntOpeningDiscoveryForActionPause =
    currentHauntOpeningDiscovery ??
    queuedHauntOpeningDiscoveryEntryForActionPause?.discovery ??
    null;
  const hauntRevealDiscoveryKeyForActionPause = currentHauntOpeningDiscovery
    ? buildLatestDiscoveryKey(core)
    : (queuedHauntOpeningDiscoveryEntryForActionPause?.key ?? null);
  const shouldPauseHauntBoardActions = Boolean(
    core.phase === "haunt" &&
    core.scenarioRuntime.hauntTriggered &&
    hauntRevealProtocol.active &&
    hauntOpeningDiscoveryForActionPause &&
    hauntRevealDiscoveryKeyForActionPause !== dismissedHauntRevealDiscoveryKey,
  );
  const hauntActionContext = React.useMemo(
    () =>
      resolveBetrayalHauntActionContext({
        t,
        core,
        shouldPauseHauntBoardActions,
        selectedDustSearchTrait: previewState.selectedDustSearchTrait,
        selectedDustCureTrait: previewState.selectedDustCureTrait,
        selectedAttackWeaponEffectId,
        traitorAttackTargetPlayerId:
          attackDeclarationTargetPlayerIds.traitorPlayerId,
        heroAttackTargets,
        hasDynamiteAttackWeaponCard: Boolean(dynamiteAttackWeaponCard),
        dustSameRoomLivingTargetCount: dustSameRoomLivingTargets.length,
        isDustSicknessExchangeMode,
        helpingHandsTrollHandAttackOption,
        helpingHandsTrollHandAttackTarget,
        helpingHandsTrollHandAttackTargetName,
        magicCameraPhotoTarget,
        magicCameraPhotoTrait,
        resolvePlayerName: (playerId, explorerName) =>
          resolvePlayerName(playerId, explorerName, matchData),
      }),
    [
      attackDeclarationTargetPlayerIds.traitorPlayerId,
      core,
      dustSameRoomLivingTargets.length,
      dynamiteAttackWeaponCard,
      helpingHandsTrollHandAttackOption,
      helpingHandsTrollHandAttackTarget,
      helpingHandsTrollHandAttackTargetName,
      heroAttackTargets,
      isDustSicknessExchangeMode,
      magicCameraPhotoTarget,
      magicCameraPhotoTrait,
      matchData,
      previewState.selectedDustCureTrait,
      previewState.selectedDustSearchTrait,
      selectedAttackWeaponEffectId,
      shouldPauseHauntBoardActions,
      t,
    ],
  );
  const hauntActionDisabledReason =
    hauntActionContext && "disabledReason" in hauntActionContext
      ? (hauntActionContext.disabledReason ?? null)
      : null;
  const dustHauntTraitSelector = React.useMemo(
    () => resolveBetrayalDustHauntTraitSelector(hauntActionContext),
    [hauntActionContext],
  );
  const hauntTargetGuide = React.useMemo(
    () =>
      resolveBetrayalHauntTargetGuide({
        t,
        phase: core.phase,
        shouldPauseHauntBoardActions,
        interactionMode: previewState.interactionMode,
        hauntActionKind: hauntActionContext?.actionKind,
        selectedAttackWeaponEffectId,
        allExplorers,
        dustSameRoomLivingTargets,
        selectedTradeTargetPlayerId,
        selectedAttackTargetPlayerIds,
        heroAttackTargets,
        bloodFromStonePeekabooOptions,
        selectedPeekabooSameRoomMonsterId:
          previewState.selectedPeekabooSameRoomMonsterId,
        resolvePlayerName: (playerId, explorerName) =>
          resolvePlayerName(playerId, explorerName, matchData),
      }),
    [
      allExplorers,
      bloodFromStonePeekabooOptions,
      core.phase,
      dustSameRoomLivingTargets,
      hauntActionContext?.actionKind,
      heroAttackTargets,
      matchData,
      previewState.interactionMode,
      previewState.selectedPeekabooSameRoomMonsterId,
      selectedAttackTargetPlayerIds,
      selectedAttackWeaponEffectId,
      selectedTradeTargetPlayerId,
      shouldPauseHauntBoardActions,
      t,
    ],
  );
  const activeHauntTargetGuide = resolveActiveBetrayalHauntTargetGuide({
    hauntTargetGuide,
    hauntTargetingActionKind: previewState.hauntTargetingActionKind,
    hauntActionKind: hauntActionContext?.actionKind,
    interactionMode: previewState.interactionMode,
  });
  const {
    statusText: tradeStatusText,
    instructionText: tradeInstructionText,
    shouldShowMobileStatus: shouldShowMobileTradeStatus,
    shouldShowInlineConfirm: shouldShowInlineTradeConfirm,
    shouldShowTopPrompt: shouldShowTradeFlowPrompt,
    agreementState: tradeAgreementState,
    targetStepText: tradeFlowTargetStepText,
    bannerStatusText: tradeBannerStatusText,
    shouldShowActionPanel: shouldShowTradeActionPanel,
    sicknessExchangeTargetStepText,
  } = resolveBetrayalTradeFlowReadModel({
    t,
    recommendedAction: core.recommendedAction,
    shouldPauseHauntBoardActions,
    hasActiveHauntTargetGuide: Boolean(activeHauntTargetGuide),
    mummyReward: mummyPendingReward
      ? {
          isChooser: isMummyRewardChooser,
          chooserTargetName: mummyRewardDefenderName,
          waitingPlayerName: mummyRewardControllerName,
          damage: mummyPendingReward.damageToHero,
        }
      : null,
    helpingHandsReward: helpingHandsPendingReward
      ? {
          isChooser: isHelpingHandsRewardChooser,
          chooserTargetName: helpingHandsRewardDefenderName,
          waitingPlayerName: helpingHandsRewardAttackerName,
          damage: helpingHandsPendingReward.damageToDefender,
        }
      : null,
    hasPendingSicknessExchange: Boolean(pendingSicknessExchange),
    isPendingSicknessForViewer,
    pendingSicknessRequesterName,
    pendingSicknessTargetName,
    isDustSicknessExchangeMode,
    selectedDustTargetName,
    shouldStartDustSicknessExchange,
    dustSameRoomLivingTargetCount: dustSameRoomLivingTargets.length,
    pendingTradeAgreement: pendingTradeAgreement
      ? {
          hasOfferCards: pendingTradeAgreement.cardIds.length > 0,
          hasReturnCards: pendingTradeAgreement.targetCardIds.length > 0,
        }
      : null,
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
    corpseLootTargetCount: corpseLootTargets.length,
    activeTradeTargetCount: activeTradeTargets.length,
    dogTradeFlowActive,
    selectedDogTradeCardCount: selectedDogTradeCardIds.length,
    selectedDogTradeCardNames,
    selectedTradeGiveCardCount: selectedTradeGiveCardIds.length,
    selectedTradeReturnCardCount: selectedTradeReturnCardIds.length,
    selectedTradeGiveText,
    selectedTradeReturnText,
    isTradeDraftActive,
    tradeSelectionReady,
  });
  const {
    heroAttackTargetPlayerIds,
    isHeroAttackTargetingMode,
    isDustAttackTargetingMode,
    isDynamiteRoomTargetingMode,
    isHauntTargetingMode,
    dynamiteTargetRoomIds,
  } = resolveBetrayalAttackTargetingReadModel({
    core,
    selectedAttackWeaponEffectId,
    hauntTargetingActionKind: previewState.hauntTargetingActionKind,
    hauntActionKind: hauntActionContext?.actionKind,
    selectedAttackTargetPlayerIds,
    hasActiveHauntTargetGuide: Boolean(activeHauntTargetGuide),
  });
  const attackLineOfSightSegments = React.useMemo(
    () =>
      resolveBetrayalAttackLineOfSightSegments({
        core,
        visibleRooms: visibleMapRooms,
        roomCanvasLayout,
        allExplorers,
        selectedAttackWeaponCardId,
        selectedAttackWeaponEffectId,
        hauntTargetingActionKind: previewState.hauntTargetingActionKind,
        selectedAttackTargetPlayerIds,
        isMonsterAttackMode,
        selectedMonsterAttackSourceId,
        selectedMonsterAttackEntry,
      }),
    [
      allExplorers,
      core,
      isMonsterAttackMode,
      previewState.hauntTargetingActionKind,
      roomCanvasLayout,
      selectedAttackTargetPlayerIds,
      selectedAttackWeaponCardId,
      selectedAttackWeaponEffectId,
      selectedMonsterAttackEntry,
      selectedMonsterAttackSourceId,
      visibleMapRooms,
    ],
  );

  const currentLatestDiscoveryEntry = React.useMemo(
    () => buildLatestDiscoveryDisplayEntry(core),
    [core],
  );
  React.useEffect(() => {
    setLatestDiscoveryQueue((previousQueue) =>
      resolveBetrayalLatestDiscoveryQueueAfterCurrentEntry({
        core,
        currentEntry: currentLatestDiscoveryEntry,
        queue: previousQueue,
        dismissedLatestDiscoveryKey: previewState.dismissedLatestDiscoveryKey,
        dismissedLatestDiscoveryKeys,
      }),
    );
  }, [
    core,
    currentLatestDiscoveryEntry,
    dismissedLatestDiscoveryKeys,
    previewState.dismissedLatestDiscoveryKey,
  ]);
  const latestDiscoverySelection = React.useMemo(
    () =>
      resolveBetrayalLatestDiscoverySelectionPresentation({
        core,
        currentEntry: currentLatestDiscoveryEntry,
        queue: latestDiscoveryQueue,
        dismissedLatestDiscoveryKey: previewState.dismissedLatestDiscoveryKey,
        dismissedLatestDiscoveryKeys,
      }),
    [
      core,
      currentLatestDiscoveryEntry,
      dismissedLatestDiscoveryKeys,
      latestDiscoveryQueue,
      previewState.dismissedLatestDiscoveryKey,
    ],
  );
  const latestDiscoveryEntry = latestDiscoverySelection.entry;
  const latestDiscovery = latestDiscoverySelection.discovery;
  const latestDiscoveryRecentRoll = latestDiscoverySelection.recentRoll;
  const latestDiscoveryOwnerPlayerId = latestDiscoverySelection.ownerPlayerId;
  const latestDiscoveryKey = latestDiscoverySelection.key;
  const coreRecentRollDisplayKey =
    latestDiscoverySelection.coreRecentRollDisplayKey;
  const latestDiscoveryRecentRollDisplayKey =
    latestDiscoverySelection.recentRollDisplayKey;
  const currentHauntOpeningDisplayEntry = currentHauntOpeningDiscovery
    ? currentLatestDiscoveryEntry
    : null;
  const isConfirmedExorciseRoll =
    core.recentRoll?.kind === "hauntActionTraitCheck" &&
    (core.recentRoll.sourceTitle === "驱魔" ||
      core.recentRoll.sourceTitle === "驱逐木乃伊") &&
    core.recentRoll.trait === "sanity" &&
    confirmedExorciseRollId === core.recentRoll.id;
  const isRecentRollDismissed = Boolean(
    coreRecentRollDisplayKey &&
    previewState.dismissedRecentRollId === coreRecentRollDisplayKey,
  );
  React.useEffect(() => {
    setSettledRecentRollId((previousRollId) =>
      previousRollId === coreRecentRollDisplayKey ? previousRollId : null,
    );
  }, [coreRecentRollDisplayKey]);
  const handleRecentRollDiceSettledChange = React.useCallback(
    (rollId: string, settled: boolean) => {
      setSettledRecentRollId((previousRollId) => {
        if (settled) {
          return rollId;
        }
        return previousRollId === rollId ? null : previousRollId;
      });
    },
    [],
  );
  const pendingEventRollPlayerId =
    core.pendingEventRollResolution?.playerId ?? null;
  const pendingEventRollRequiresAcknowledgement =
    core.pendingEventRollResolution?.requiresAcknowledgement ?? null;
  const pendingEventRollRollId =
    core.pendingEventRollResolution?.rollId ?? null;
  React.useEffect(() => {
    const rollId = core.recentRoll?.id ?? null;
    const tutorialIsTeachingEventRollModifier =
      isTutorialActive &&
      (tutorialStep?.id === "view-book" ||
        tutorialStep?.id === "use-book" ||
        tutorialStep?.id === "use-rabbit-foot");
    if (
      viewerPlayerId !== pendingEventRollPlayerId ||
      pendingEventRollRequiresAcknowledgement !== false ||
      tutorialIsTeachingEventRollModifier ||
      !rollId ||
      !pendingEventRollRollId ||
      rollId !== pendingEventRollRollId
    ) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      if (
        pendingEventRollRequiresAcknowledgement === false &&
        pendingEventRollRollId === rollId
      ) {
        dispatchCommand(
          BETRAYAL_COMMANDS.FINALIZE_EVENT_ROLL,
          { rollId: pendingEventRollRollId },
          { allowDuringVisualBusy: true },
        );
      }
    }, 2400);
    return () => window.clearTimeout(timer);
  }, [
    core.recentRoll?.id,
    dispatchCommand,
    isTutorialActive,
    pendingEventRollPlayerId,
    pendingEventRollRequiresAcknowledgement,
    pendingEventRollRollId,
    tutorialStep?.id,
    viewerPlayerId,
  ]);
  React.useEffect(() => {
    if (
      core.pendingEventRollResolution ||
      core.pendingEventRollStart ||
      core.pendingEventChoice ||
      core.latestDiscovery?.kind !== "event" ||
      !core.recentRoll ||
      (core.recentRoll.kind !== "eventTraitCheck" &&
        core.recentRoll.kind !== "eventDiceRoll") ||
      core.recentRoll.sourceTitle !== core.latestDiscovery.title ||
      !core.turnEndedByDiscovery ||
      !coreRecentRollDisplayKey
    ) {
      return;
    }
    setPreviewState((previousState) =>
      previousState.dismissedRecentRollId === coreRecentRollDisplayKey
        ? previousState
        : { ...previousState, dismissedRecentRollId: coreRecentRollDisplayKey },
    );
  }, [
    core.pendingEventChoice,
    core.pendingEventRollResolution,
    core.pendingEventRollStart,
    core.recentRoll,
    core.turnEndedByDiscovery,
    core.latestDiscovery?.kind,
    core.latestDiscovery?.title,
    coreRecentRollDisplayKey,
  ]);
  const isAttackImpactReady =
    isRecentRollDismissed ||
    (core.recentRoll?.kind === "attackRoll" &&
      settledRecentRollId === coreRecentRollDisplayKey);
  const attackImpactPresentationKey =
    core.recentRoll?.kind === "attackRoll" && isAttackImpactReady
      ? `${coreRecentRollDisplayKey ?? core.recentRoll.id}:${
          isRecentRollDismissed ? "board" : "review"
        }`
      : null;
  const queuedHauntOpeningDiscoveryEntry =
    !currentHauntOpeningDiscovery &&
    latestDiscoveryEntry &&
    isHauntScenarioOpeningDiscoverySummary(latestDiscoveryEntry.discovery)
      ? latestDiscoveryEntry
      : null;
  const hauntOpeningDiscovery =
    currentHauntOpeningDiscovery ??
    queuedHauntOpeningDiscoveryEntry?.discovery ??
    null;
  const hauntRevealDiscoveryKey = currentHauntOpeningDiscovery
    ? buildLatestDiscoveryKey(core)
    : (queuedHauntOpeningDiscoveryEntry?.key ?? null);
  const shouldDeferHauntRevealCueUntilDiscoveryRead = Boolean(
    (currentHauntOpeningDisplayEntry &&
      currentHauntOpeningDisplayEntry.key !==
        previewState.dismissedLatestDiscoveryKey) ||
    (queuedHauntOpeningDiscoveryEntry &&
      queuedHauntOpeningDiscoveryEntry.key !==
        previewState.dismissedLatestDiscoveryKey),
  );
  const shouldShowHauntRevealCue = Boolean(
    core.phase === "haunt" &&
    core.scenarioRuntime.hauntTriggered &&
    hauntRevealProtocol.active &&
    hauntOpeningDiscovery &&
    hauntRevealDiscoveryKey !== dismissedHauntRevealDiscoveryKey &&
    !shouldDeferHauntRevealCueUntilDiscoveryRead,
  );
  const hauntRevealAutoOpenKey = shouldShowHauntRevealCue
    ? [
        activeHauntDossier.id,
        core.scenarioRuntime.hauntCardNumber ?? "unknown-haunt",
        core.scenarioRuntime.triggeringOmenId ?? "unknown-omen",
        scenarioReaderScope,
        viewerPlayerId,
        hauntRevealDiscoveryKey ?? "current-reveal",
      ].join(":")
    : null;
  React.useEffect(() => {
    const previousAutoOpenKey = previousHauntRevealAutoOpenKeyRef.current;
    const hasObservedAutoOpenState =
      hasObservedHauntRevealAutoOpenStateRef.current;
    hasObservedHauntRevealAutoOpenStateRef.current = true;
    previousHauntRevealAutoOpenKeyRef.current = hauntRevealAutoOpenKey;

    if (
      !shouldShowHauntRevealCue ||
      !core.scenarioRuntime.hauntTriggered ||
      !hauntRevealAutoOpenKey
    ) {
      return;
    }
    const didEnterNewHauntReveal =
      hasObservedAutoOpenState &&
      previousAutoOpenKey !== hauntRevealAutoOpenKey;
    if (!didEnterNewHauntReveal) {
      return;
    }
    if (scenarioReaderOpen) {
      autoOpenedHauntScenarioReaderKeysRef.current.add(hauntRevealAutoOpenKey);
      return;
    }
    if (
      autoOpenedHauntScenarioReaderKeysRef.current.has(hauntRevealAutoOpenKey)
    ) {
      return;
    }
    if (referenceOpen) {
      return;
    }
    autoOpenedHauntScenarioReaderKeysRef.current.add(hauntRevealAutoOpenKey);
    if (
      core.recentRoll?.sourceTitle === core.latestDiscovery?.title &&
      coreRecentRollDisplayKey
    ) {
      setPreviewState((previousState) => ({
        ...previousState,
        dismissedRecentRollId:
          coreRecentRollDisplayKey ?? previousState.dismissedRecentRollId,
      }));
    }
    const openPlan = resolveScenarioReaderOpenPlan(core, viewerPlayerId, {
      mode: "hauntReveal",
      hasOpeningSection: Boolean(referenceScenarioOpeningSection),
      bookSpreadCount: referenceScenarioBookSpreadCount,
    });
    setDismissedHauntRevealDiscoveryKey(hauntRevealDiscoveryKey);
    setReferenceScenarioSpreadIndex(openPlan.initialSpreadIndex);
    setReferenceScenarioOpeningStageActive(openPlan.includeOpeningStage);
    setReferenceScenarioTurnDirection(null);
    setReferenceScenarioTurnSnapshot(null);
    setScenarioReaderOpen(true);
  }, [
    core.scenarioRuntime.hauntCardNumber,
    core.scenarioRuntime.hauntTriggered,
    core.scenarioRuntime.triggeringOmenId,
    core.recentRoll?.sourceTitle,
    core.latestDiscovery?.title,
    coreRecentRollDisplayKey,
    hauntRevealAutoOpenKey,
    hauntRevealDiscoveryKey,
    referenceOpen,
    referenceScenarioBookSpreadCount,
    referenceScenarioOpeningSection,
    scenarioReaderOpen,
    shouldShowHauntRevealCue,
    viewerPlayerId,
  ]);
  const visibleDustProgressItems = shouldShowHauntRevealCue
    ? []
    : dustProgressItems;
  const shouldShowDustProgressPrompt = Boolean(
    visibleDustProgressItems.length > 0 &&
    !pendingSicknessExchange &&
    !mummyPendingReward &&
    !helpingHandsPendingReward &&
    !isDustSicknessExchangeMode,
  );
  const shouldShowHelpingHandsTrollAttackBanner = Boolean(
    !helpingHandsPendingReward &&
    !mummyPendingReward &&
    !pendingTradeAgreement &&
    !pendingSicknessExchange &&
    !isDustSicknessExchangeMode &&
    !activeHauntTargetGuide &&
    helpingHandsTrollHandAttackOption &&
    helpingHandsTrollHandAttackTarget,
  );
  const shouldShowTopPromptStack = Boolean(
    visibleDustProgressItems.length > 0 ||
    shouldShowTradeFlowPrompt ||
    mummyPendingReward ||
    helpingHandsPendingReward ||
    shouldShowHelpingHandsMonsterTurnStatus ||
    shouldShowHelpingHandsTrollAttackBanner,
  );
  const eventRollConfirmation = React.useMemo(
    () => resolveEventRollConfirmationPresentation(core, viewerPlayerId),
    [core, viewerPlayerId],
  );
  const latestDiscoveryPresentation = React.useMemo(
    () =>
      resolveBetrayalLatestDiscoveryPanelPresentation({
        core,
        selection: latestDiscoverySelection,
        dismissedLatestDiscoveryKey: previewState.dismissedLatestDiscoveryKey,
        dismissedRecentRollId: previewState.dismissedRecentRollId,
        viewerPlayerId,
        inventoryActionPlayerId,
        hasRecentRollModifier,
        pendingEventChoice,
        shouldShowHauntRevealCue,
        latestDiscoverySearchRevealIndex,
        eventRollConfirmation,
        t,
      }),
    [
      core,
      eventRollConfirmation,
      hasRecentRollModifier,
      inventoryActionPlayerId,
      latestDiscoverySearchRevealIndex,
      latestDiscoverySelection,
      pendingEventChoice,
      previewState.dismissedLatestDiscoveryKey,
      previewState.dismissedRecentRollId,
      shouldShowHauntRevealCue,
      t,
      viewerPlayerId,
    ],
  );
  const {
    shouldAutoReturnAfterLatestDiscovery,
    shouldShow: shouldShowLatestDiscovery,
    shouldShowRoll: shouldShowLatestDiscoveryRoll,
    canCurrentPlayerModifyRoll: canCurrentPlayerModifyLatestDiscoveryRoll,
    pendingEventRollStart: pendingLatestDiscoveryEventRollStart,
    canCurrentViewerStartEventRoll:
      canCurrentViewerStartLatestDiscoveryEventRoll,
    pendingEventRollRequiresNoAcknowledgement:
      pendingLatestDiscoveryEventRollRequiresNoAcknowledgement,
    eventChoiceDiscoveryForVisual,
    displaySummary: latestDiscoveryDisplaySummary,
    shouldShowCardFace: shouldShowLatestDiscoveryCardFace,
    pendingCardResolution: latestDiscoveryPendingCardResolution,
    cardResolutionConfirmedCount: latestDiscoveryCardResolutionConfirmedCount,
    cardResolutionTotalCount: latestDiscoveryCardResolutionTotalCount,
    searchSequence: latestDiscoverySearchSequence,
    visibleProcessCard: latestDiscoveryVisibleProcessCard,
    resolutionSteps: latestDiscoveryResolutionSteps,
    searchStepNumber: latestDiscoverySearchStepNumber,
    searchFinalEffectText: latestDiscoverySearchFinalEffectText,
    canAdvanceSearch: canAdvanceLatestDiscoverySearch,
    canCurrentViewerAcknowledgeCardResolution,
    pendingPossessionCard: latestDiscoveryPendingPossessionCard,
    displayedKindLabel: latestDiscoveryDisplayedKindLabel,
    displayedTitle: latestDiscoveryDisplayedTitle,
    continueButton: latestDiscoveryContinueButton,
  } = latestDiscoveryPresentation;
  const latestDiscoveryRerollSelection =
    canCurrentPlayerModifyLatestDiscoveryRoll
      ? recentRollRerollSelection
      : null;
  const betrayalConfirmButtonClass = BETRAYAL_CONFIRM_BUTTON_CLASS;
  const rollModifierActionSlot = selectedRollModifierCanConfirm ? (
    <div className="pointer-events-auto flex items-center gap-2">
      <button
        type="button"
        data-testid="betrayal-roll-modifier-cancel"
        className="min-h-[42px] border border-[rgba(214,181,109,0.42)] bg-[rgba(18,17,13,0.72)] px-4 py-2 text-[12px] font-bold tracking-[0.10em] text-[#f3e0a6]"
        onClick={() =>
          setPreviewState((previousState) => ({
            ...previousState,
            selectedRollModifierDieIndex: null,
          }))
        }
      >
        {t("board.roll.cancelModifier")}
      </button>
      <BetrayalConfirmButton
        type="button"
        data-testid="betrayal-roll-modifier-confirm"
        onClick={confirmSelectedRollModifier}
      >
        {t("board.roll.confirmModifier", {
          card: selectedRollModifierCard?.name ?? "",
        })}
      </BetrayalConfirmButton>
    </div>
  ) : null;
  const recentRollAcknowledgement = React.useMemo(
    () => resolveRecentRollAcknowledgementPresentation(core, viewerPlayerId),
    [core, viewerPlayerId],
  );
  const {
    hasAcknowledgement: hasRecentRollAcknowledgement,
    confirmedCount: recentRollConfirmedCount,
    totalCount: recentRollTotalCount,
    fullyAcknowledged: recentRollFullyAcknowledged,
    hasAcknowledgeableRecentRoll,
    viewerHasAcknowledged: hasCurrentViewerAcknowledgedRecentRoll,
    canViewerAcknowledge: canCurrentViewerAcknowledgeRecentRoll,
  } = recentRollAcknowledgement;
  const canDismissLatestDiscoveryByBackdrop = false;
  const canDismissRecentRollByBackdrop = false;
  const shouldGateDamageAllocationBehindRecentRoll = Boolean(
    pendingDamageAllocation &&
    core.recentRoll?.kind === "eventRolledDamage" &&
    hasRecentRollAcknowledgement &&
    !recentRollFullyAcknowledged &&
    !isRecentRollDismissed,
  );
  const shouldShowBlockingRecentRollOverlay = Boolean(
    core.recentRoll &&
    !isRecentRollDismissed &&
    !isConfirmedExorciseRoll &&
    !pendingEventChoice &&
    !shouldAutoReturnAfterLatestDiscovery &&
    !shouldShowHauntRevealCue &&
    !shouldShowLatestDiscovery,
  );
  const shouldUseMobileEventOpenTableChrome =
    isPhoneLandscapeLayout &&
    !activeHauntTargetGuide &&
    Boolean(
      pendingEventChoice ||
      (shouldShowLatestDiscovery &&
        !shouldAutoReturnAfterLatestDiscovery &&
        latestDiscovery?.kind === "event"),
    );
  // 只用于非事件发现结果 / 独立投骰结果这类需要整桌退场的阻塞层。
  // 事件选择与事件结算必须保持 PC 同构的开放桌面叠层，不得把行动栏、HUD 等整套牌桌 UI 藏掉。
  const shouldHideTableChromeForBlockingOverlay = Boolean(
    !(
      shouldShowLatestDiscovery &&
      !shouldAutoReturnAfterLatestDiscovery &&
      latestDiscovery?.kind === "event"
    ) &&
    !shouldUseMobileEventOpenTableChrome &&
    ((shouldShowLatestDiscovery &&
      !shouldAutoReturnAfterLatestDiscovery &&
      !pendingEventChoice) ||
      shouldShowBlockingRecentRollOverlay),
  );
  const shouldSuppressMobileBlockingRollChrome =
    isPhoneLandscapeLayout && shouldShowBlockingRecentRollOverlay;
  const shouldShowMobileEventStatusRail = shouldUseMobileEventOpenTableChrome;
  React.useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }
    const root = document.documentElement;
    const attrName = "data-betrayal-blocking-roll";
    if (shouldSuppressMobileBlockingRollChrome) {
      root.setAttribute(attrName, "true");
    } else {
      root.removeAttribute(attrName);
    }
    return () => {
      root.removeAttribute(attrName);
    };
  }, [shouldSuppressMobileBlockingRollChrome]);
  const latestDiscoveryTitle = latestDiscovery?.title;
  const latestDiscoveryOwnerInventory = React.useMemo(() => {
    if (!latestDiscoveryOwnerPlayerId) {
      return core.currentExplorerInventory;
    }
    const owner = [core.currentExplorer, ...core.otherExplorers].find(
      (explorer) => explorer.playerId === latestDiscoveryOwnerPlayerId,
    );
    return owner?.inventory ?? core.currentExplorerInventory;
  }, [
    core.currentExplorer,
    core.currentExplorerInventory,
    core.otherExplorers,
    latestDiscoveryOwnerPlayerId,
  ]);
  const latestDiscoveryVisual = React.useMemo(
    () =>
      resolveDiscoveryAtlasVisual(
        latestDiscovery ?? eventChoiceDiscoveryForVisual,
        latestDiscoveryOwnerInventory,
      ),
    [
      eventChoiceDiscoveryForVisual,
      latestDiscovery,
      latestDiscoveryOwnerInventory,
    ],
  );
  React.useEffect(() => {
    setLatestDiscoverySearchRevealIndex(0);
  }, [
    latestDiscoveryPendingCardResolution?.id,
    latestDiscoveryPendingCardResolution?.processCards?.length,
    viewerPlayerId,
  ]);
  const pendingDiscoveryGainVisualRef = React.useRef<{
    card: BetrayalInventoryCard;
    visual: BetrayalPossessionAtlasVisual;
  } | null>(null);
  const latestDiscoveryPendingResolutionSeenRef = React.useRef<{
    sourceKey: string;
    resolutionId: string;
  } | null>(null);
  const latestDiscoveryPendingEventRollSeenRef = React.useRef<{
    sourceKey: string;
    rollId: string;
  } | null>(null);
  const startPendingDiscoveryGainVisual = React.useCallback(
    (onComplete?: () => void) => {
      const pendingGain = pendingDiscoveryGainVisualRef.current;
      if (!pendingGain) {
        return false;
      }
      const sourceRect = readBetrayalViewportRect(
        findBetrayalTestElement("betrayal-discovery-card-front-atlas"),
      );
      if (!sourceRect) {
        return false;
      }
      const ownerExplorer = latestDiscoveryOwnerPlayerId
        ? allExplorers.find(
            (explorer) => explorer.playerId === latestDiscoveryOwnerPlayerId,
          )
        : null;
      const ownerRoom = ownerExplorer
        ? core.rooms.find((room) => room.id === ownerExplorer.roomId)
        : null;
      if (ownerRoom) {
        // 接收者可能在另一层地图；先切到接收者所在楼层，让真实 token
        // 成为动画终点，而不是退回当前 viewer 的持有区。
        setSelectedRoomMapFloor(ownerRoom.floor);
      }
      return beginBetrayalVisualTransition({
        kind: "possession-gain",
        sourceRect,
        targetRect: null,
        targetTestId: latestDiscoveryOwnerPlayerId
          ? `betrayal-explorer-figure-token-${latestDiscoveryOwnerPlayerId}`
          : "betrayal-explorer-figure-token-unknown",
        fallbackRoomTestId: latestDiscoveryOwnerPlayerId
          ? `betrayal-room-${
              allExplorers.find(
                (explorer) =>
                  explorer.playerId === latestDiscoveryOwnerPlayerId,
              )?.roomId ?? "unknown"
            }`
          : undefined,
        possessionCard: pendingGain.card,
        possessionVisual: pendingGain.visual,
        locale: effectiveLocale,
        missingTokenLabel: t("board.hauntTokens.officialTokenMissing"),
        onComplete,
      });
    },
    [
      allExplorers,
      beginBetrayalVisualTransition,
      core.rooms,
      effectiveLocale,
      latestDiscoveryOwnerPlayerId,
      t,
    ],
  );
  const handleDismissLatestDiscovery = React.useCallback(() => {
    if (!latestDiscoveryKey) {
      return;
    }
    const shouldAdvanceLatestDiscoveryDismissTutorial =
      isTutorialActive && tutorialStep?.id === "return-to-table-after-damage";
    setDismissedLatestDiscoveryKeys((previousKeys) => {
      if (previousKeys.has(latestDiscoveryKey)) {
        return previousKeys;
      }
      const nextKeys = new Set(previousKeys);
      nextKeys.add(latestDiscoveryKey);
      return nextKeys;
    });
    setLatestDiscoveryQueue((previousQueue) =>
      removeBetrayalLatestDiscoveryQueueEntry(
        previousQueue,
        latestDiscoveryKey,
      ),
    );
    setPreviewState((previousState) => ({
      ...previousState,
      dismissedLatestDiscoveryKey: latestDiscoveryKey,
      dismissedRecentRollId:
        latestDiscoveryRecentRoll?.sourceTitle === latestDiscoveryTitle &&
        latestDiscoveryRecentRoll.kind !== "eventRolledDamage"
          ? latestDiscoveryRecentRollDisplayKey
          : previousState.dismissedRecentRollId,
    }));
    if (shouldAdvanceLatestDiscoveryDismissTutorial) {
      nextStep("auto");
    }
  }, [
    isTutorialActive,
    latestDiscoveryKey,
    latestDiscoveryRecentRoll?.kind,
    latestDiscoveryRecentRoll?.sourceTitle,
    latestDiscoveryRecentRollDisplayKey,
    latestDiscoveryTitle,
    nextStep,
    tutorialStep?.id,
  ]);
  const handleRollLatestDiscoveryEvent = React.useCallback(() => {
    if (!canCurrentViewerStartLatestDiscoveryEventRoll || isVisualBusy) {
      return;
    }
    dispatchCommand(BETRAYAL_COMMANDS.ROLL_EVENT, {
      sourceTitle: pendingLatestDiscoveryEventRollStart?.sourceTitle,
    });
  }, [
    canCurrentViewerStartLatestDiscoveryEventRoll,
    dispatchCommand,
    isVisualBusy,
    pendingLatestDiscoveryEventRollStart?.sourceTitle,
  ]);
  const handleContinueLatestDiscovery = React.useCallback(() => {
    if (isVisualBusy) {
      return;
    }
    if (core.pendingEventRollResolution) {
      if (!eventRollConfirmation.canViewerAcknowledge) {
        return;
      }
      dispatchCommand(BETRAYAL_COMMANDS.FINALIZE_EVENT_ROLL, {
        rollId: core.pendingEventRollResolution.rollId,
      });
      return;
    }
    if (latestDiscoveryPendingCardResolution) {
      if (canAdvanceLatestDiscoverySearch) {
        setLatestDiscoverySearchRevealIndex((previousIndex) =>
          Math.min(previousIndex + 1, latestDiscoverySearchSequence.length - 1),
        );
        return;
      }
      if (!canCurrentViewerAcknowledgeCardResolution) {
        return;
      }
      const acknowledge = () =>
        dispatch(BETRAYAL_COMMANDS.ACKNOWLEDGE_CARD_RESOLUTION, {
          resolutionId: latestDiscoveryPendingCardResolution.id,
        });
      const completesCardResolution =
        latestDiscoveryCardResolutionConfirmedCount + 1 >=
        latestDiscoveryCardResolutionTotalCount;
      if (!completesCardResolution) {
        acknowledge();
        return;
      }
      startPendingDiscoveryGainVisual();
      acknowledge();
      return;
    }
    handleDismissLatestDiscovery();
  }, [
    dispatch,
    core.pendingEventRollResolution,
    dispatchCommand,
    eventRollConfirmation.canViewerAcknowledge,
    handleDismissLatestDiscovery,
    isVisualBusy,
    canAdvanceLatestDiscoverySearch,
    canCurrentViewerAcknowledgeCardResolution,
    startPendingDiscoveryGainVisual,
    latestDiscoveryPendingCardResolution,
    latestDiscoveryCardResolutionConfirmedCount,
    latestDiscoveryCardResolutionTotalCount,
    latestDiscoverySearchSequence.length,
  ]);
  React.useEffect(() => {
    const pendingResolution = latestDiscoveryPendingCardResolution;
    if (pendingResolution && latestDiscoveryEntry?.sourceKey) {
      latestDiscoveryPendingResolutionSeenRef.current = {
        sourceKey: latestDiscoveryEntry.sourceKey,
        resolutionId: pendingResolution.id,
      };
      return;
    }
    const seenResolution = latestDiscoveryPendingResolutionSeenRef.current;
    if (
      !seenResolution ||
      seenResolution.sourceKey !== latestDiscoveryEntry?.sourceKey
    ) {
      return;
    }
    latestDiscoveryPendingResolutionSeenRef.current = null;
    handleDismissLatestDiscovery();
  }, [
    handleDismissLatestDiscovery,
    latestDiscoveryEntry?.sourceKey,
    latestDiscoveryPendingCardResolution,
  ]);
  React.useEffect(() => {
    const pendingResolution = core.pendingEventRollResolution;
    if (pendingResolution && latestDiscoveryEntry?.sourceKey) {
      latestDiscoveryPendingEventRollSeenRef.current = {
        sourceKey: latestDiscoveryEntry.sourceKey,
        rollId: pendingResolution.rollId,
      };
      return;
    }
    const seenResolution = latestDiscoveryPendingEventRollSeenRef.current;
    if (
      !seenResolution ||
      seenResolution.sourceKey !== latestDiscoveryEntry?.sourceKey
    ) {
      return;
    }
    if (latestDiscoveryPendingCardResolution) {
      return;
    }
    latestDiscoveryPendingEventRollSeenRef.current = null;
    handleDismissLatestDiscovery();
  }, [
    core.pendingEventRollResolution,
    handleDismissLatestDiscovery,
    latestDiscoveryEntry?.sourceKey,
    latestDiscoveryPendingCardResolution,
  ]);
  const handleDismissHauntRevealCue = () => {
    if (!hauntRevealDiscoveryKey) {
      return;
    }
    const nextDiscoveryEntry = buildLatestDiscoveryDisplayEntry(core);
    const shouldRestoreDiscoveryAfterRevealDismiss =
      shouldRestoreBetrayalDiscoveryAfterHauntRevealDismiss({
        nextEntry: nextDiscoveryEntry,
        viewerPlayerId,
        dismissedLatestDiscoveryKey: previewState.dismissedLatestDiscoveryKey,
        dismissedLatestDiscoveryKeys,
      });
    setDismissedHauntRevealDiscoveryKey(hauntRevealDiscoveryKey);
    if (
      !shouldRestoreDiscoveryAfterRevealDismiss &&
      core.recentRoll?.sourceTitle === core.latestDiscovery?.title
    ) {
      setPreviewState((previousState) => ({
        ...previousState,
        dismissedRecentRollId:
          coreRecentRollDisplayKey ?? previousState.dismissedRecentRollId,
      }));
    }
    setLatestDiscoveryQueue((previousQueue) =>
      resolveBetrayalLatestDiscoveryQueueAfterHauntRevealDismiss({
        queue: previousQueue,
        hauntRevealDiscoveryKey,
        nextEntry: nextDiscoveryEntry,
        shouldRestoreDiscovery: shouldRestoreDiscoveryAfterRevealDismiss,
      }),
    );
  };
  const handleDismissRecentRoll = React.useCallback(() => {
    if (!coreRecentRollDisplayKey) {
      return;
    }
    if (
      core.recentRoll.roomEndTurn?.nextPlayerId ||
      core.recentRoll.deathPrevention?.nextPlayerId
    ) {
      dispatchCommand(BETRAYAL_COMMANDS.ACKNOWLEDGE_TURN_END_ROLL, {});
    } else if (hasAcknowledgeableRecentRoll) {
      if (canCurrentViewerAcknowledgeRecentRoll) {
        dispatchCommand(BETRAYAL_COMMANDS.ACKNOWLEDGE_RECENT_ROLL, {});
      }
      return;
    }
    setPreviewState((previousState) => ({
      ...previousState,
      dismissedRecentRollId:
        coreRecentRollDisplayKey ?? previousState.dismissedRecentRollId,
    }));
  }, [
    canCurrentViewerAcknowledgeRecentRoll,
    core.recentRoll,
    coreRecentRollDisplayKey,
    dispatchCommand,
    hasAcknowledgeableRecentRoll,
  ]);
  const handleConfirmExorciseRollReview = React.useCallback(() => {
    setConfirmedExorciseRollId(core.recentRoll?.id ?? null);
  }, [core.recentRoll?.id]);
  const recentRollAcknowledgeLabel = !hasAcknowledgeableRecentRoll
    ? t("board.roll.backToBoard")
    : canCurrentViewerAcknowledgeRecentRoll
      ? t("board.discovery.confirmWithProgress", {
          confirmed: recentRollConfirmedCount,
          total: recentRollTotalCount,
        })
      : t("board.discovery.confirmedWithProgress", {
          confirmed: recentRollConfirmedCount,
          total: recentRollTotalCount,
        });
  const recentRollAcknowledgeActionSlot = hasAcknowledgeableRecentRoll ? (
    <BetrayalConfirmButton
      type="button"
      data-testid="betrayal-roll-continue"
      data-recent-roll-confirmed-count={String(recentRollConfirmedCount)}
      data-recent-roll-required-count={String(recentRollTotalCount)}
      className={`pointer-events-auto min-w-[168px] shrink-0 px-5 text-[14px] shadow-[0_10px_22px_rgba(0,0,0,0.34)] ${betrayalConfirmButtonClass}`}
      disabled={!canCurrentViewerAcknowledgeRecentRoll}
      onClick={handleDismissRecentRoll}
    >
      {recentRollAcknowledgeLabel}
    </BetrayalConfirmButton>
  ) : null;
  const {
    turnHintText,
    roomFocusState,
    canPickUpMummyGirlRoomId,
    shouldShowRoomFocusTargetLabel,
    tradeStatusCueState,
    actionCueText,
  } = resolveBetrayalActionCueReadModel({
    t,
    recommendedAction: core.recommendedAction,
    activeRoomId: core.activeRoomId,
    currentExplorerRoomId: core.currentExplorer.roomId,
    currentExplorerInventoryCount: core.currentExplorerInventory.length,
    interactionMode: previewState.interactionMode,
    activeHauntTargetGuideCue: activeHauntTargetGuide?.cue ?? null,
    selectedHelpingHandsTrollHandMoveEntry,
    selectedMonsterMoveEntry,
    selectedMonsterAttackEntry,
    isMonsterAttackMode,
    selectedMonsterAttackSourceId,
    isBloodFromStoneSetupPlacementMode,
    remainingBloodFromStoneSetupPlacementCount,
    selectedBloodFromStoneStoneCherubRoomCount:
      selectedBloodFromStoneStoneCherubRoomIds.length,
    pendingBloodFromStoneSetupPlacementCount:
      bloodFromStoneSetupPlacementPlan.pendingPlayerChoiceCount,
    pendingRoomPlacementPreview,
    turnEndedByDiscovery: core.turnEndedByDiscovery,
    moveTargetRooms,
    canStartExploreSelection,
    explorableRoomSlots,
    selectedInventoryCardName: selectedInventoryCard?.name ?? null,
    selectedCardUseDisabled,
    selectedCardUsedThisTurn,
    hauntActionContext,
    hauntActionDisabledReason,
    isTradeDraftActive,
    hasUsedTradeThisTurn,
    tradeSelectionReady,
    selectedTradeGiveCardCount: selectedTradeGiveCardIds.length,
    selectedDogTradeCardCount: selectedDogTradeCardIds.length,
    selectedTradeTarget,
    activeTradeTargetCount: activeTradeTargets.length,
    unknownRoomLabel: t("board.rooms.unknown"),
    hasRoomEndTurnEffect: Boolean(roomEndTurnEffectHint),
    allExplorers,
    resolvePlayerName: (playerId, explorerName) =>
      resolvePlayerName(playerId, explorerName, matchData),
  });
  const shouldShowBoardActionStatus = !shouldShowHauntRevealCue;
  const toggleReferenceSide = React.useCallback(() => {
    setReferenceSide((previousSide) => {
      const currentIndex = referencePages.findIndex(
        (page) => page.id === previousSide,
      );
      const nextPage =
        referencePages[(currentIndex + 1) % referencePages.length] ??
        referencePages[0];
      return nextPage?.id ?? "front";
    });
  }, [referencePages]);
  const handleReferenceScenarioTurn = (direction: "back" | "forward") => {
    const shouldAdvanceScenarioTurnTutorial =
      isTutorialActive &&
      direction === "forward" &&
      tutorialStep?.id === "haunt-hero-reader-turn-page";
    setReferenceScenarioSpreadIndex((previousIndex) => {
      const nextIndex =
        direction === "back"
          ? Math.max(0, previousIndex - 1)
          : Math.min(referenceScenarioSpreadCount - 1, previousIndex + 1);
      if (nextIndex !== previousIndex) {
        setReferenceScenarioTurnSnapshot({
          fromPages: resolveScenarioReaderSpreadPages(
            referenceScenarioPages,
            referenceScenarioHasOpeningStage,
            previousIndex,
          ),
          toPages: resolveScenarioReaderSpreadPages(
            referenceScenarioPages,
            referenceScenarioHasOpeningStage,
            nextIndex,
          ),
        });
        playSound(BETRAYAL_SCENARIO_PAGE_TURN_KEY);
        setReferenceScenarioTurnDirection(direction);
        if (shouldAdvanceScenarioTurnTutorial) {
          pendingScenarioTurnTutorialAdvanceRef.current = true;
        }
      }
      return nextIndex;
    });
  };

  const handleReferenceScenarioTurnComplete = React.useCallback(() => {
    setReferenceScenarioTurnDirection(null);
    setReferenceScenarioTurnSnapshot(null);
    if (pendingScenarioTurnTutorialAdvanceRef.current) {
      pendingScenarioTurnTutorialAdvanceRef.current = false;
      nextStep("auto");
    }
  }, [nextStep]);
  const latestDiscoveryPendingPossessionVisual = React.useMemo(
    () =>
      latestDiscoveryPendingPossessionCard
        ? resolvePossessionAtlasVisual(latestDiscoveryPendingPossessionCard)
        : null,
    [latestDiscoveryPendingPossessionCard],
  );
  React.useLayoutEffect(() => {
    pendingDiscoveryGainVisualRef.current =
      latestDiscoveryPendingPossessionCard &&
      latestDiscoveryPendingPossessionVisual
        ? {
            card: latestDiscoveryPendingPossessionCard,
            visual: latestDiscoveryPendingPossessionVisual,
          }
        : null;
  }, [
    latestDiscoveryPendingPossessionCard,
    latestDiscoveryPendingPossessionVisual,
  ]);
  const latestDiscoveryPanelVisual =
    latestDiscoveryPendingPossessionVisual ?? latestDiscoveryVisual;
  const damageAllocationSourceHasVisibleOwner = Boolean(
    pendingDamageAllocation?.sourceTitle &&
    shouldShowLatestDiscovery &&
    latestDiscoveryDisplayedTitle === pendingDamageAllocation.sourceTitle,
  );

  const scrollToSection = React.useCallback((sectionId: string) => {
    if (typeof document === "undefined") {
      return;
    }
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  React.useEffect(() => {
    if (
      !latestDiscoveryTitle ||
      typeof window === "undefined" ||
      window.innerWidth >= 768
    ) {
      return;
    }
    document.getElementById("betrayal-room-panel")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [latestDiscoveryTitle]);

  const handleMoveToRoom = React.useCallback(
    (roomId: string) => {
      if (isVisualBusy) {
        return;
      }
      const useSkeletonKey = skeletonKeyMoveTargetRoomIds.has(roomId);
      const move = () =>
        dispatch(BETRAYAL_COMMANDS.MOVE_TO_ROOM, {
          roomId,
          ...(useSkeletonKey ? { useSkeletonKey: true } : {}),
        });
      const focusTargetRoom = () => focusRoomOnMap(roomId);
      const visualStarted = controlledMoveMonsterId
        ? startMonsterMoveVisual(
            controlledMoveMonsterId,
            roomId,
            focusTargetRoom,
          )
        : startExplorerMoveVisual(roomId, focusTargetRoom);
      move();
      if (visualStarted) {
        focusRoomOnMap(roomId, { pan: false });
      } else {
        focusTargetRoom();
      }
      setPreviewState((previousState) => ({
        ...previousState,
        interactionMode: useSkeletonKey ? "default" : "move",
      }));
    },
    [
      controlledMoveMonsterId,
      dispatch,
      focusRoomOnMap,
      isVisualBusy,
      skeletonKeyMoveTargetRoomIds,
      startExplorerMoveVisual,
      startMonsterMoveVisual,
    ],
  );

  const handleMoveAction = React.useCallback(() => {
    const shouldAdvanceOpenMoveTutorial =
      isTutorialActive &&
      (tutorialStep?.id === "open-move-targets" ||
        (tutorialStep?.requireAction === true &&
          tutorialStep?.highlightTarget === "betrayal-action-move" &&
          tutorialStep?.allowedCommands?.length === 0)) &&
      previewState.interactionMode !== "move" &&
      core.movesRemaining > 0 &&
      moveTargetRooms.length > 0;
    setPreviewState((previousState) => {
      if (previousState.interactionMode === "move") {
        return {
          ...previousState,
          interactionMode: "default",
          selectedMonsterMoveMonsterId: null,
          selectedMonsterAttackMonsterId: null,
        };
      }
      if (core.movesRemaining <= 0 || moveTargetRooms.length === 0) {
        return previousState;
      }
      return {
        ...previousState,
        interactionMode: "move",
        selectedMonsterMoveMonsterId: null,
        selectedMonsterAttackMonsterId: null,
      };
    });
    if (shouldAdvanceOpenMoveTutorial) {
      nextStep("auto");
    }
  }, [
    core.movesRemaining,
    isTutorialActive,
    moveTargetRooms.length,
    nextStep,
    previewState.interactionMode,
    tutorialStep?.allowedCommands?.length,
    tutorialStep?.highlightTarget,
    tutorialStep?.id,
    tutorialStep?.requireAction,
  ]);

  React.useEffect(() => {
    if (previewState.interactionMode !== "move") {
      return;
    }
    if (core.movesRemaining > 0 && moveTargetRooms.length > 0) {
      return;
    }
    setPreviewState((previousState) =>
      previousState.interactionMode === "move"
        ? {
            ...previousState,
            interactionMode: "default",
            selectedMonsterAttackMonsterId: null,
          }
        : previousState,
    );
  }, [
    core.movesRemaining,
    moveTargetRooms.length,
    previewState.interactionMode,
  ]);

  React.useEffect(() => {
    if (previewState.interactionMode !== "explore") {
      return;
    }
    if (canStartExploreSelection) {
      return;
    }
    setPreviewState((previousState) =>
      previousState.interactionMode === "explore"
        ? {
            ...previousState,
            pendingRoomPlacementSlotId: null,
            pendingRoomPlacementFailure: null,
            pendingRoomOrientationTurns: 0,
            pendingRoomTileAdjustment: null,
            interactionMode: "default",
            selectedMonsterAttackMonsterId: null,
          }
        : previousState,
    );
  }, [canStartExploreSelection, previewState.interactionMode]);

  const handleExploreAction = React.useCallback(() => {
    setPreviewState((previousState) => {
      if (previousState.interactionMode === "explore") {
        return {
          ...previousState,
          pendingRoomPlacementSlotId: null,
          pendingRoomPlacementFailure: null,
          pendingRoomOrientationTurns: 0,
          pendingRoomTileAdjustment: null,
          interactionMode: "default",
          selectedMonsterAttackMonsterId: null,
        };
      }
      if (!canStartExploreSelection) {
        return previousState;
      }
      return {
        ...previousState,
        pendingRoomPlacementSlotId: null,
        pendingRoomPlacementFailure: null,
        pendingRoomOrientationTurns: 0,
        pendingRoomTileAdjustment: null,
        interactionMode: "explore",
        selectedMonsterAttackMonsterId: null,
      };
    });
  }, [canStartExploreSelection]);

  const handlePrepareExploreRoom = React.useCallback(
    (roomId: string) => {
      const placementPreview = resolveRoomPlacementPreview(core, {
        roomId,
        useHolySymbol: useHolySymbolForExplore,
      });
      if (!placementPreview) {
        const exhaustedSlot =
          explorableRoomSlots.find((room) => room.id === roomId) ?? null;
        setPreviewState((previousState) => ({
          ...previousState,
          pendingRoomPlacementSlotId: null,
          pendingRoomPlacementFailure: exhaustedSlot
            ? { roomId, floor: exhaustedSlot.floor }
            : null,
          pendingRoomOrientationTurns: 0,
          pendingRoomTileAdjustment: null,
          interactionMode: "explore",
        }));
        return;
      }
      setPreviewState((previousState) => ({
        ...previousState,
        pendingRoomPlacementSlotId: roomId,
        pendingRoomPlacementFailure: null,
        pendingRoomOrientationTurns: placementPreview.defaultOrientationTurns,
        pendingRoomTileAdjustment: null,
        interactionMode: "explore",
      }));
      if (
        isTutorialActive &&
        tutorialStep?.requireAction === true &&
        tutorialStep?.highlightTarget === "betrayal-action-explore" &&
        tutorialStep?.allowedCommands?.length === 0
      ) {
        nextStep("auto");
      }
    },
    [
      core,
      explorableRoomSlots,
      isTutorialActive,
      nextStep,
      tutorialStep?.allowedCommands?.length,
      tutorialStep?.highlightTarget,
      tutorialStep?.id,
      tutorialStep?.requireAction,
      useHolySymbolForExplore,
    ],
  );

  const handleRotateRoomPlacement = React.useCallback(
    (direction: 1 | -1) => {
      if (
        !pendingRoomPlacementPreview ||
        pendingRoomOrientationOptions.length === 0
      ) {
        return;
      }
      const currentIndex = pendingRoomOrientationOptions.findIndex(
        (option) => option.orientationTurns === selectedRoomOrientationTurns,
      );
      const safeCurrentIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex =
        (safeCurrentIndex + direction + pendingRoomOrientationOptions.length) %
        pendingRoomOrientationOptions.length;
      const nextOrientation =
        pendingRoomOrientationOptions[nextIndex]?.orientationTurns ??
        pendingRoomPlacementPreview.defaultOrientationTurns;
      setPreviewState((previousState) => ({
        ...previousState,
        pendingRoomOrientationTurns: nextOrientation,
        pendingRoomTileAdjustment: null,
      }));
      if (
        isTutorialActive &&
        tutorialStep?.requireAction === true &&
        tutorialStep?.highlightTarget ===
          "betrayal-room-placement-rotate-right" &&
        tutorialStep?.allowedCommands?.length === 0
      ) {
        nextStep("auto");
      }
    },
    [
      isTutorialActive,
      nextStep,
      pendingRoomOrientationOptions,
      pendingRoomPlacementPreview,
      selectedRoomOrientationTurns,
      tutorialStep?.allowedCommands?.length,
      tutorialStep?.highlightTarget,
      tutorialStep?.id,
      tutorialStep?.requireAction,
    ],
  );

  const handleCancelRoomPlacement = React.useCallback(() => {
    setPreviewState((previousState) => ({
      ...previousState,
      pendingRoomPlacementSlotId: null,
      pendingRoomPlacementFailure: null,
      pendingRoomOrientationTurns: 0,
      pendingRoomTileAdjustment: null,
      interactionMode: "explore",
    }));
  }, []);

  const handleSelectRoomTileAdjustment = React.useCallback(
    (option: BetrayalRoomTileAdjustmentOption) => {
      setPreviewState((previousState) => ({
        ...previousState,
        pendingRoomTileAdjustment: toRoomTileAdjustmentSelection(option),
      }));
    },
    [],
  );

  const handleConfirmRoomPlacement = React.useCallback(() => {
    const roomTileAdjustment = selectedRoomTileAdjustmentOption
      ? toRoomTileAdjustmentSelection(selectedRoomTileAdjustmentOption)
      : null;
    const payload = resolveBetrayalExploreRoomCommandPayload({
      placementPreview: pendingRoomPlacementPreview,
      selectedOrientation: selectedRoomOrientationOption,
      roomTileAdjustment,
      useHolySymbol: useHolySymbolForExplore,
      useIdol: useIdolForExplore,
      ignoreEventSymbolWithTraitorPower,
    });
    if (!payload) {
      return;
    }
    dispatchCommand(BETRAYAL_COMMANDS.EXPLORE_ROOM, payload);
    setPreviewState((previousState) => ({
      ...previousState,
      useHolySymbolForExplore: false,
      useIdolForExplore: false,
      ignoreEventSymbolWithTraitorPower: false,
      pendingRoomPlacementSlotId: null,
      pendingRoomPlacementFailure: null,
      pendingRoomOrientationTurns: 0,
      pendingRoomTileAdjustment: null,
      interactionMode: "default",
      selectedMonsterAttackMonsterId: null,
    }));
  }, [
    dispatchCommand,
    pendingRoomPlacementPreview,
    selectedRoomOrientationOption,
    selectedRoomTileAdjustmentOption,
    useHolySymbolForExplore,
    useIdolForExplore,
    ignoreEventSymbolWithTraitorPower,
  ]);

  const handleToggleHolySymbolExplore = React.useCallback(() => {
    if (!canDeclareHolySymbolExplore) {
      return;
    }
    setPreviewState((previousState) => ({
      ...previousState,
      pendingRoomPlacementSlotId: null,
      pendingRoomPlacementFailure: null,
      pendingRoomOrientationTurns: 0,
      pendingRoomTileAdjustment: null,
      useHolySymbolForExplore: !previousState.useHolySymbolForExplore,
    }));
  }, [canDeclareHolySymbolExplore]);

  const handleToggleIdolExplore = React.useCallback(() => {
    if (!canDeclareIdolExplore) {
      return;
    }
    setPreviewState((previousState) => ({
      ...previousState,
      pendingRoomPlacementSlotId: null,
      pendingRoomPlacementFailure: null,
      pendingRoomOrientationTurns: 0,
      pendingRoomTileAdjustment: null,
      useIdolForExplore: !previousState.useIdolForExplore,
      ignoreEventSymbolWithTraitorPower: false,
    }));
  }, [canDeclareIdolExplore]);

  const handleToggleTraitorEventSkip = React.useCallback(() => {
    if (!canDeclareTraitorEventSkip) {
      return;
    }
    setPreviewState((previousState) => ({
      ...previousState,
      pendingRoomPlacementSlotId: null,
      pendingRoomPlacementFailure: null,
      pendingRoomOrientationTurns: 0,
      pendingRoomTileAdjustment: null,
      useIdolForExplore: false,
      ignoreEventSymbolWithTraitorPower:
        !previousState.ignoreEventSymbolWithTraitorPower,
    }));
  }, [canDeclareTraitorEventSkip]);

  function handleSelectMaskTargetRoom(tokenId: string, roomId: string) {
    setPreviewState((previousState) => {
      const selectedMaskTargetRoomIdsByTokenId = {
        ...previousState.selectedMaskTargetRoomIdsByTokenId,
        [tokenId]: roomId,
      };
      const nextActiveMaskTargetTokenId =
        maskTargetTokens.find(
          (token) =>
            token.id !== tokenId &&
            !selectedMaskTargetRoomIdsByTokenId[token.id],
        )?.id ?? tokenId;
      return {
        ...previousState,
        activeMaskTargetTokenId: nextActiveMaskTargetTokenId,
        selectedMaskTargetRoomIdsByTokenId,
      };
    });
  }

  const handleSelectInventoryTargetRoom = React.useCallback(
    (roomId: string) => {
      setPreviewState((previousState) => ({
        ...previousState,
        selectedInventoryTargetRoomId: roomId,
      }));
    },
    [],
  );

  const handleSelectInventoryReplacementRollTotal = React.useCallback(
    (selectedTotal: number) => {
      setPreviewState((previousState) => ({
        ...previousState,
        selectedInventoryReplacementRollTotal: selectedTotal,
      }));
    },
    [],
  );

  const handleSelectActiveMaskTargetToken = React.useCallback(
    (tokenId: string) => {
      setPreviewState((previousState) => ({
        ...previousState,
        activeMaskTargetTokenId: tokenId,
      }));
    },
    [],
  );

  function handleSelectMonsterTarget(monsterId: string) {
    if (isBloodFromStonePeekabooMode) {
      const selectedSameRoomMonsterId =
        previewState.selectedPeekabooSameRoomMonsterId;
      if (selectedSameRoomMonsterId) {
        const option = bloodFromStonePeekabooOptions.find(
          (candidate) =>
            candidate.sameRoomMonsterId === selectedSameRoomMonsterId &&
            candidate.lineOfSightMonsterId === monsterId,
        );
        if (option) {
          dispatchCommand(BETRAYAL_COMMANDS.PLAY_PEEKABOO, {
            sameRoomMonsterId: option.sameRoomMonsterId,
            lineOfSightMonsterId: option.lineOfSightMonsterId,
          });
          setInventoryPreviewCardId(null);
          setPreviewState((previousState) => ({
            ...previousState,
            selectedPeekabooSameRoomMonsterId: null,
            selectedPeekabooLineOfSightMonsterId: null,
            hauntTargetingActionKind: null,
            interactionMode: "default",
          }));
          return;
        }
      }
      const sameRoomOption = bloodFromStonePeekabooOptions.find(
        (candidate) => candidate.sameRoomMonsterId === monsterId,
      );
      if (sameRoomOption) {
        const lineOfSightRoom = core.rooms.find(
          (room) => room.id === sameRoomOption.lineOfSightRoomId,
        );
        if (lineOfSightRoom) {
          setSelectedRoomMapFloor(lineOfSightRoom.floor);
        }
        setPreviewState((previousState) => ({
          ...previousState,
          selectedPeekabooSameRoomMonsterId: sameRoomOption.sameRoomMonsterId,
          selectedPeekabooLineOfSightMonsterId: null,
          hauntTargetingActionKind: "play-peekaboo",
          interactionMode: "default",
        }));
      }
      return;
    }
    if (
      selectedInventoryUseEffectMode === "moveOthersInRoom" &&
      maskTargetTokens.some(
        (token) => token.kind === "monster" && token.id === monsterId,
      )
    ) {
      handleSelectActiveMaskTargetToken(monsterId);
    }
  }
  const resetEventChoicePreview = React.useCallback(() => {
    setPreviewState((previousState) => ({
      ...previousState,
      selectedEventTrait: null,
      selectedEventCardId: null,
      selectedEventTargetRoomId: null,
      selectedEventDamageTraits: [],
      interactionMode: "default",
      selectedMonsterAttackMonsterId: null,
    }));
  }, []);

  function dispatchResolveEventChoice(
    accept: boolean,
    selection?: BetrayalEventChoiceSelection,
  ) {
    const payload = resolveBetrayalEventChoiceCommandPayload({
      core,
      readModel: pendingEventChoiceReadModel,
      accept,
      currentSelection: {
        trait: selectedEventTrait,
        cardId: selectedEventCardId,
        targetRoomId: selectedEventTargetRoomId,
        damageTraits: selectedEventDamageTraits,
      },
      selection,
    });
    if (!payload) {
      return false;
    }
    dispatchCommand(BETRAYAL_COMMANDS.RESOLVE_EVENT_CHOICE, payload, {
      allowDuringVisualBusy: true,
    });
    resetEventChoicePreview();
    return true;
  }

  function handleSelectEventTrait(trait: BetrayalTraitKey) {
    const nextSelection = {
      trait,
      cardId: selectedEventCardId,
      targetRoomId: null,
      damageTraits: [],
    };
    const preview = resolveBetrayalEventChoiceAcceptPreview({
      core,
      readModel: pendingEventChoiceReadModel,
      selection: nextSelection,
    });
    if (!pendingEventChoice?.declineLabel && preview?.ready) {
      dispatchResolveEventChoice(true, nextSelection);
      return;
    }
    setPreviewState((previousState) => ({
      ...previousState,
      selectedEventTrait: trait,
      selectedEventTargetRoomId: null,
      selectedEventDamageTraits: [],
    }));
  }

  function handleSelectEventCard(cardId: string) {
    const nextSelectedCardId = selectedEventCardId === cardId ? null : cardId;
    const nextSelection = {
      trait: selectedEventTrait,
      cardId: nextSelectedCardId,
      targetRoomId: selectedEventTargetRoomId,
      damageTraits: selectedEventDamageTraits,
    };
    const preview = resolveBetrayalEventChoiceAcceptPreview({
      core,
      readModel: pendingEventChoiceReadModel,
      selection: nextSelection,
    });
    if (!pendingEventChoice?.declineLabel && preview?.ready) {
      dispatchResolveEventChoice(true, nextSelection);
      return;
    }
    setPreviewState((previousState) => ({
      ...previousState,
      selectedEventCardId: nextSelectedCardId,
    }));
  }

  function handleSelectEventTargetRoom(roomId: string) {
    const nextSelection = {
      trait: selectedEventTrait,
      cardId: selectedEventCardId,
      targetRoomId: roomId,
      damageTraits: selectedEventDamageTraits,
    };
    const preview = resolveBetrayalEventChoiceAcceptPreview({
      core,
      readModel: pendingEventChoiceReadModel,
      selection: nextSelection,
    });
    if (!pendingEventChoice?.declineLabel && preview?.ready) {
      dispatchResolveEventChoice(true, nextSelection);
      return;
    }
    setPreviewState((previousState) => ({
      ...previousState,
      selectedEventTargetRoomId: roomId,
    }));
  }

  function applyEventDamageTraitSelection(
    nextSelectedDamageTraits: BetrayalTraitKey[],
  ) {
    const nextSelection = {
      trait: selectedEventTrait,
      cardId: selectedEventCardId,
      targetRoomId: selectedEventTargetRoomId,
      damageTraits: nextSelectedDamageTraits,
    };
    const preview = resolveBetrayalEventChoiceAcceptPreview({
      core,
      readModel: pendingEventChoiceReadModel,
      selection: nextSelection,
    });
    if (!pendingEventChoice?.declineLabel && preview?.ready) {
      dispatchResolveEventChoice(true, nextSelection);
      return;
    }
    setPreviewState((previousState) => ({
      ...previousState,
      selectedEventDamageTraits: nextSelectedDamageTraits,
    }));
  }

  function handleAdjustEventDamageTrait(
    trait: BetrayalTraitKey,
    delta: -1 | 1,
  ) {
    if (!pendingEventDamageChoice) {
      return;
    }
    const nextSelectedDamageTraits = adjustSelectedDamageTrait({
      selectedTraits: selectedEventDamageTraits,
      trait,
      delta,
      allowedTraits: pendingEventDamageChoice.allowedTraits,
      amount: pendingEventDamageChoice.amount,
      explorer: core.currentExplorer,
      phase: core.phase,
    });
    applyEventDamageTraitSelection(nextSelectedDamageTraits);
  }

  function canIncrementEventDamageTrait(trait: BetrayalTraitKey): boolean {
    if (!pendingEventDamageChoice) {
      return false;
    }
    const selected = pruneSelectedDamageTraits(
      selectedEventDamageTraits,
      pendingEventDamageChoice.allowedTraits,
      pendingEventDamageChoice.amount,
      core.currentExplorer,
      core.phase,
    );
    const currentCount = countSelectedDamageTrait(selected, trait);
    const maxTraitCount = Math.min(
      pendingEventDamageChoice.amount,
      resolveTraitDamageAssignableSteps(
        core.currentExplorer,
        trait,
        core.phase,
      ),
    );
    return (
      pendingEventDamageChoice.allowedTraits.includes(trait) &&
      currentCount < maxTraitCount &&
      selected.length < pendingEventDamageChoice.amount
    );
  }

  function handleToggleDamageAllocationBrooch() {
    const nextDamageAllocationSelection =
      resolveBetrayalDamageAllocationBroochToggle(
        pendingDamageAllocationReadModel,
        selectedDamageAllocationTraits,
      );
    if (!nextDamageAllocationSelection) {
      return;
    }
    setPreviewState((previousState) => ({
      ...previousState,
      ...nextDamageAllocationSelection,
    }));
  }

  function handleAdjustDamageAllocationTrait(
    trait: BetrayalTraitKey,
    delta: -1 | 1,
  ) {
    const nextSelectedDamageTraits =
      resolveBetrayalDamageAllocationTraitAdjustment({
        readModel: pendingDamageAllocationReadModel,
        selectedDamageAllocationTraits,
        trait,
        delta,
      });
    if (!nextSelectedDamageTraits) {
      return;
    }
    setPreviewState((previousState) => ({
      ...previousState,
      selectedDamageAllocationTraits: nextSelectedDamageTraits,
    }));
  }

  function canIncrementDamageAllocationTrait(trait: BetrayalTraitKey): boolean {
    return canIncrementBetrayalDamageAllocationTrait({
      readModel: pendingDamageAllocationReadModel,
      selectedDamageAllocationTraits,
      trait,
    });
  }

  function handleResolveDamageAllocation() {
    const payload = resolveBetrayalDamageAllocationCommandPayload(
      pendingDamageAllocationReadModel,
    );
    if (!payload) {
      return;
    }
    dispatchCommand(BETRAYAL_COMMANDS.RESOLVE_DAMAGE_ALLOCATION, payload);
    setPreviewState((previousState) => ({
      ...previousState,
      selectedDamageAllocationTraits: [],
      useBroochForDamageAllocation: false,
      interactionMode: "default",
      selectedMonsterAttackMonsterId: null,
    }));
  }

  const handleResolveEventChoice = (accept: boolean) => {
    dispatchResolveEventChoice(accept);
  };

  const handleSelectAttackWeapon = React.useCallback(
    (cardId: string | null) => {
      setPreviewState((previousState) => {
        const nextSelectedAttackWeaponCardId =
          previousState.selectedAttackWeaponCardId === cardId ? null : cardId;
        selectedAttackWeaponCardIdRef.current = nextSelectedAttackWeaponCardId;
        return {
          ...previousState,
          selectedAttackWeaponCardId: nextSelectedAttackWeaponCardId,
        };
      });
    },
    [],
  );

  const handleSelectDustHauntTrait = React.useCallback(
    (
      actionId: "search-for-cure" | "cure-the-dust",
      trait: BetrayalTraitKey,
    ) => {
      setPreviewState((previousState) => ({
        ...previousState,
        selectedDustSearchTrait:
          actionId === "search-for-cure"
            ? trait
            : previousState.selectedDustSearchTrait,
        selectedDustCureTrait:
          actionId === "cure-the-dust"
            ? trait
            : previousState.selectedDustCureTrait,
      }));
    },
    [],
  );

  const handleUseAction = () => {
    if (isVisualBusy) {
      return;
    }
    const cardId = selectedInventoryCard?.id;
    if (
      !cardId &&
      core.phase === "haunt" &&
      hauntActionContext?.actionKind === "use"
    ) {
      const dispatchHauntAction = () =>
        dispatch(
          hauntActionContext.commandType,
          hauntActionContext.payload ?? {},
        );
      const visualPlan = resolveBetrayalHauntUseVisualPlan(
        core,
        hauntActionContext,
      );
      const visualStarted = visualPlan
        ? startGirlTransferVisual({
            ...visualPlan,
            onComplete: dispatchHauntAction,
          })
        : false;
      if (!visualStarted) {
        dispatchHauntAction();
      }
      setInventoryPreviewCardId(null);
      setPreviewState((previousState) => ({
        ...previousState,
        interactionMode: "default",
        selectedMonsterAttackMonsterId: null,
        selectedDustSearchTrait: null,
        selectedDustCureTrait: null,
      }));
      return;
    }
    if (!cardId) {
      return;
    }
    if (cardId && selectedCardCanUseRecentRollRerollItem) {
      setInventoryPreviewCardId(null);
      return;
    }
    const payload = resolveBetrayalUsePossessionCommandPayload({
      cardId,
      selectedInventoryTargetPlayerId,
      selectedInventoryTargetRoomId,
      selectedInventoryUseEffectMode,
      selectedMaskTargetRoomIdsByTokenId,
      selectedInventoryReplacementRollTotal,
    });
    applyOptimisticPreviewAfterCommand(
      BETRAYAL_COMMANDS.USE_POSSESSION,
      payload,
      {
        lastUsedInventoryCardId: cardId,
      },
    );
    dispatchCommand(BETRAYAL_COMMANDS.USE_POSSESSION, payload);
    setInventoryPreviewCardId(null);
  };

  const handleTradeAction = () => {
    if (hasPendingPlayerAgreement) {
      return;
    }
    if (shouldStartDustSicknessExchange) {
      setPreviewState((previousState) => ({
        ...previousState,
        selectedTradeTargetPlayerId: null,
        selectedTradeGiveCardIds: [],
        tradeSelectionTouched: false,
        interactionMode:
          previousState.interactionMode === "sicknessExchange"
            ? "default"
            : "sicknessExchange",
        hauntTargetingActionKind:
          previousState.interactionMode === "sicknessExchange"
            ? null
            : "sickness-exchange",
      }));
      return;
    }
    const tradeActionCommand = resolveBetrayalTradeActionCommand({
      selectedCorpseLootTargetPlayerId:
        selectedCorpseLootTarget?.playerId ?? null,
      selectedCorpseLootCardId,
      tradeSelectionReady,
      useDogTrade,
      selectedDogTradeCardIds,
      selectedTradeGiveCardIds,
      selectedTradeReturnCardIds,
      selectedTradeTargetPlayerId,
    });
    if (selectedCorpseLootTarget && !tradeActionCommand) {
      setPreviewState((previousState) => ({
        ...previousState,
        tradeSelectionTouched: true,
      }));
      return;
    }
    if (!tradeActionCommand) {
      setPreviewState((previousState) => ({
        ...previousState,
        interactionMode: "default",
        tradeSelectionTouched: true,
      }));
      return;
    }
    if (tradeActionCommand.kind === "lootCorpse") {
      dispatchCommand(
        tradeActionCommand.commandType,
        tradeActionCommand.payload,
      );
      setInventoryPreviewCardId(null);
      setPreviewState((previousState) => ({
        ...previousState,
        selectedCorpseLootCardId: null,
        selectedTradeTargetPlayerId: null,
        selectedTradeGiveCardIds: [],
        selectedTradeReturnCardIds: [],
        interactionMode: "default",
      }));
      return;
    }
    dispatchCommand(tradeActionCommand.commandType, tradeActionCommand.payload);
    setInventoryPreviewCardId(null);
    setPreviewState((previousState) => ({
      ...previousState,
      selectedInventoryCardId: null,
      selectedTradeTargetPlayerId: null,
      selectedTradeGiveCardIds: [],
      selectedDogTradeCardIds: [],
      selectedTradeReturnCardIds: [],
      tradeSelectionTouched: false,
      interactionMode: "default",
    }));
  };

  const handleResolveTradeAgreement = React.useCallback(
    (accept: boolean) => {
      dispatchCommand(BETRAYAL_COMMANDS.RESOLVE_TRADE_AGREEMENT, { accept });
      setInventoryPreviewCardId(null);
      setPreviewState((previousState) => ({
        ...previousState,
        selectedInventoryCardId: null,
        selectedTradeTargetPlayerId: null,
        selectedTradeGiveCardIds: [],
        selectedDogTradeCardIds: [],
        selectedTradeReturnCardIds: [],
        tradeSelectionTouched: false,
        interactionMode: "default",
        hauntTargetingActionKind: null,
      }));
    },
    [dispatchCommand],
  );

  const handleResolveSicknessExchange = React.useCallback(
    (accept: boolean) => {
      dispatchCommand(BETRAYAL_COMMANDS.RESOLVE_SICKNESS_EXCHANGE, { accept });
      setInventoryPreviewCardId(null);
      setPreviewState((previousState) => ({
        ...previousState,
        selectedTradeTargetPlayerId: null,
        selectedTradeGiveCardIds: [],
        tradeSelectionTouched: false,
        interactionMode: "default",
        hauntTargetingActionKind: null,
      }));
    },
    [dispatchCommand],
  );

  const handleResolveHelpingHandsAttackReward = React.useCallback(
    (choice: "damage" | "steal", cardId?: string) => {
      dispatchCommand(BETRAYAL_COMMANDS.RESOLVE_HELPING_HANDS_ATTACK_REWARD, {
        choice,
        ...(cardId ? { cardId } : {}),
      });
      setInventoryPreviewCardId(null);
      setPreviewState((previousState) => ({
        ...previousState,
        selectedTradeTargetPlayerId: null,
        selectedTradeGiveCardIds: [],
        tradeSelectionTouched: false,
        interactionMode: "default",
        hauntTargetingActionKind: null,
      }));
    },
    [dispatchCommand],
  );

  const handleResolveMummyAttackReward = React.useCallback(
    (choice: "damage" | "steal", cardId?: string) => {
      dispatchCommand(BETRAYAL_COMMANDS.RESOLVE_MUMMY_ATTACK_REWARD, {
        choice,
        ...(cardId ? { cardId } : {}),
      });
      setInventoryPreviewCardId(null);
      setPreviewState((previousState) => ({
        ...previousState,
        selectedTradeTargetPlayerId: null,
        selectedTradeGiveCardIds: [],
        tradeSelectionTouched: false,
        interactionMode: "default",
        hauntTargetingActionKind: null,
      }));
    },
    [dispatchCommand],
  );

  const handleHelpingHandsTrollHandAttack = React.useCallback(
    (
      option: BetrayalHelpingHandsTrollHandAttackOption,
      targetPlayerId: string,
    ) => {
      dispatchCommand(
        BETRAYAL_COMMANDS.HELPING_HANDS_TROLL_HAND_ATTACK,
        resolveHelpingHandsTrollHandAttackCommandPayload(option, targetPlayerId),
      );
      setPreviewState((previousState) => ({
        ...previousState,
        selectedTradeTargetPlayerId: null,
        tradeSelectionTouched: false,
        interactionMode: "default",
        selectedMonsterAttackMonsterId: null,
        hauntTargetingActionKind: null,
      }));
    },
    [dispatchCommand],
  );

  const handleHelpingHandsTrollHandMoveAction = React.useCallback(() => {
    setInventoryPreviewCardId(null);
    setPreviewState((previousState) => {
      if (previousState.interactionMode === "helpingHandsTrollMove") {
        return {
          ...previousState,
          interactionMode: "default",
          selectedHelpingHandsTrollHandMoveMonsterId: null,
          selectedMonsterAttackMonsterId: null,
        };
      }
      const selectedMonsterId = helpingHandsTrollHandMoveEntries.some(
        (entry) =>
          entry.monster.id ===
          previousState.selectedHelpingHandsTrollHandMoveMonsterId,
      )
        ? previousState.selectedHelpingHandsTrollHandMoveMonsterId
        : (helpingHandsTrollHandMoveEntries[0]?.monster.id ?? null);
      if (!selectedMonsterId) {
        return previousState;
      }
      return {
        ...previousState,
        interactionMode: "helpingHandsTrollMove",
        selectedHelpingHandsTrollHandMoveMonsterId: selectedMonsterId,
        selectedMonsterAttackMonsterId: null,
        hauntTargetingActionKind: null,
      };
    });
  }, [helpingHandsTrollHandMoveEntries]);

  const handleSelectHelpingHandsTrollHandMoveMonster = React.useCallback(
    (monsterId: string) => {
      setInventoryPreviewCardId(null);
      setPreviewState((previousState) => ({
        ...previousState,
        interactionMode: "helpingHandsTrollMove",
        selectedHelpingHandsTrollHandMoveMonsterId: monsterId,
        selectedMonsterAttackMonsterId: null,
        hauntTargetingActionKind: null,
      }));
    },
    [],
  );

  function handleHelpingHandsTrollHandMoveToRoom(roomId: string) {
    if (!selectedHelpingHandsTrollHandMoveMonsterId || isVisualBusy) {
      return;
    }
    const monsterId = selectedHelpingHandsTrollHandMoveMonsterId;
    const move = () =>
      dispatch(BETRAYAL_COMMANDS.MOVE_HELPING_HANDS_TROLL_HAND, {
        monsterId,
        roomId,
      });
    const focusTargetRoom = () => focusRoomOnMap(roomId);
    const visualStarted = startMonsterMoveVisual(
      monsterId,
      roomId,
      focusTargetRoom,
    );
    move();
    if (visualStarted) {
      focusRoomOnMap(roomId, { pan: false });
    } else {
      focusTargetRoom();
    }
    setInventoryPreviewCardId(null);
    setPreviewState((previousState) => ({
      ...previousState,
      interactionMode: "default",
      selectedHelpingHandsTrollHandMoveMonsterId: null,
      selectedMonsterAttackMonsterId: null,
      selectedTradeTargetPlayerId: null,
      selectedTradeGiveCardIds: [],
      tradeSelectionTouched: false,
      hauntTargetingActionKind: null,
    }));
  }

  const handleResolveMonsterTurnStart = React.useCallback(() => {
    if (!monsterTurnStartActionSlot?.monsterId) {
      return;
    }
    dispatchCommand(BETRAYAL_COMMANDS.RESOLVE_MONSTER_TURN_START, {
      monsterId: monsterTurnStartActionSlot.monsterId,
    });
    setInventoryPreviewCardId(null);
    setPreviewState((previousState) => ({
      ...previousState,
      interactionMode:
        previousState.interactionMode === "monsterMove"
          ? "default"
          : previousState.interactionMode,
      selectedMonsterMoveMonsterId: null,
      selectedMonsterAttackMonsterId: null,
      hauntTargetingActionKind: null,
    }));
  }, [dispatchCommand, monsterTurnStartActionSlot?.monsterId]);

  const handleRollMonsterMovementGroup = React.useCallback(() => {
    if (!monsterMovementRollActionSlot?.groupId) {
      return;
    }
    dispatchCommand(BETRAYAL_COMMANDS.ROLL_MONSTER_MOVEMENT_GROUP, {
      groupId: monsterMovementRollActionSlot.groupId,
    });
    setInventoryPreviewCardId(null);
    setPreviewState((previousState) => ({
      ...previousState,
      interactionMode:
        previousState.interactionMode === "monsterMove"
          ? "default"
          : previousState.interactionMode,
      selectedMonsterMoveMonsterId: null,
      selectedMonsterAttackMonsterId: null,
      hauntTargetingActionKind: null,
    }));
  }, [dispatchCommand, monsterMovementRollActionSlot?.groupId]);

  const handleMonsterMoveAction = React.useCallback(() => {
    setInventoryPreviewCardId(null);
    const selectedMonsterId = monsterMoveSlots.some(
      (slot) => slot.monsterId === previewState.selectedMonsterMoveMonsterId,
    )
      ? previewState.selectedMonsterMoveMonsterId
      : (monsterMoveSlots[0]?.monsterId ?? null);
    setPreviewState((previousState) => {
      if (previousState.interactionMode === "monsterMove") {
        return {
          ...previousState,
          interactionMode: "default",
          selectedMonsterMoveMonsterId: null,
          selectedMonsterAttackMonsterId: null,
        };
      }
      const selectedMonsterId = monsterMoveSlots.some(
        (slot) => slot.monsterId === previousState.selectedMonsterMoveMonsterId,
      )
        ? previousState.selectedMonsterMoveMonsterId
        : (monsterMoveSlots[0]?.monsterId ?? null);
      if (!selectedMonsterId) {
        return previousState;
      }
      return {
        ...previousState,
        interactionMode: "monsterMove",
        selectedMonsterMoveMonsterId: selectedMonsterId,
        selectedMonsterAttackMonsterId: null,
        hauntTargetingActionKind: null,
      };
    });
    if (previewState.interactionMode !== "monsterMove" && selectedMonsterId) {
      focusMonsterRoom(selectedMonsterId);
    }
  }, [
    focusMonsterRoom,
    monsterMoveSlots,
    previewState.interactionMode,
    previewState.selectedMonsterMoveMonsterId,
  ]);

  const handleSelectMonsterMoveMonster = React.useCallback(
    (monsterId: string) => {
      setInventoryPreviewCardId(null);
      setPreviewState((previousState) => ({
        ...previousState,
        interactionMode: "monsterMove",
        selectedMonsterMoveMonsterId: monsterId,
        selectedMonsterAttackMonsterId: null,
        hauntTargetingActionKind: null,
      }));
      focusMonsterRoom(monsterId);
    },
    [focusMonsterRoom],
  );

  function handleMoveMonsterToRoom(roomId: string) {
    if (!selectedMonsterMoveMonsterId || isVisualBusy) {
      return;
    }
    const monsterId = selectedMonsterMoveMonsterId;
    const move = () =>
      dispatch(BETRAYAL_COMMANDS.MOVE_MONSTER_TO_ROOM, {
        monsterId,
        roomId,
      });
    const focusTargetRoom = () => focusRoomOnMap(roomId);
    const visualStarted = startMonsterMoveVisual(
      monsterId,
      roomId,
      focusTargetRoom,
    );
    move();
    if (visualStarted) {
      focusRoomOnMap(roomId, { pan: false });
    } else {
      focusTargetRoom();
    }
    setInventoryPreviewCardId(null);
    setPreviewState((previousState) => ({
      ...previousState,
      interactionMode: "monsterMove",
      selectedMonsterMoveMonsterId,
      selectedMonsterAttackMonsterId: null,
      selectedTradeTargetPlayerId: null,
      selectedTradeGiveCardIds: [],
      tradeSelectionTouched: false,
      hauntTargetingActionKind: null,
    }));
  }

  const handleMonsterAttackAction = React.useCallback(() => {
    setInventoryPreviewCardId(null);
    setPreviewState((previousState) => {
      if (previousState.interactionMode === "monsterAttack") {
        return {
          ...previousState,
          interactionMode: "default",
          selectedMonsterAttackMonsterId: null,
          selectedTradeTargetPlayerId: null,
          tradeSelectionTouched: false,
          hauntTargetingActionKind: null,
        };
      }
      if (monsterAttackSlots.length === 0) {
        return previousState;
      }
      return {
        ...previousState,
        interactionMode: "monsterAttack",
        selectedMonsterAttackMonsterId: null,
        selectedTradeTargetPlayerId: null,
        tradeSelectionTouched: false,
        hauntTargetingActionKind: null,
      };
    });
  }, [monsterAttackSlots]);

  const handleSelectMonsterAttackMonster = React.useCallback(
    (monsterId: string) => {
      setInventoryPreviewCardId(null);
      setPreviewState((previousState) => ({
        ...previousState,
        interactionMode: "monsterAttack",
        selectedMonsterAttackMonsterId: monsterId,
        selectedTradeTargetPlayerId: null,
        tradeSelectionTouched: false,
        hauntTargetingActionKind: null,
      }));
    },
    [],
  );

  const handleEndHelpingHandsMonsterTurn = React.useCallback(() => {
    dispatchCommand(BETRAYAL_COMMANDS.END_HELPING_HANDS_MONSTER_TURN, {});
    setInventoryPreviewCardId(null);
    setPreviewState((previousState) => ({
      ...previousState,
      selectedTradeTargetPlayerId: null,
      selectedTradeGiveCardIds: [],
      selectedTradeReturnCardIds: [],
      tradeSelectionTouched: false,
      interactionMode: "default",
      selectedHelpingHandsTrollHandMoveMonsterId: null,
      selectedMonsterMoveMonsterId: null,
      selectedMonsterAttackMonsterId: null,
      hauntTargetingActionKind: null,
    }));
  }, [dispatchCommand]);

  const handleEndBloodFromStoneMonsterTurn = React.useCallback(() => {
    dispatchCommand(BETRAYAL_COMMANDS.END_BLOOD_FROM_STONE_MONSTER_TURN, {});
    setInventoryPreviewCardId(null);
    setPreviewState((previousState) => ({
      ...previousState,
      selectedTradeTargetPlayerId: null,
      selectedTradeGiveCardIds: [],
      selectedTradeReturnCardIds: [],
      tradeSelectionTouched: false,
      interactionMode: "default",
      selectedHelpingHandsTrollHandMoveMonsterId: null,
      selectedMonsterMoveMonsterId: null,
      selectedMonsterAttackMonsterId: null,
      hauntTargetingActionKind: null,
      selectedBloodFromStoneStoneCherubRoomIds: [],
    }));
  }, [dispatchCommand]);
  const handleBloodFromStoneSetupPlacementAction = React.useCallback(() => {
    setInventoryPreviewCardId(null);
    const firstCandidateRoom = bloodFromStoneSetupCandidateRooms[0] ?? null;
    if (firstCandidateRoom) {
      setSelectedRoomMapFloor(firstCandidateRoom.floor);
    }
    setPreviewState((previousState) => {
      if (previousState.interactionMode === "bloodFromStoneSetupPlacement") {
        return {
          ...previousState,
          interactionMode: "default",
          selectedBloodFromStoneStoneCherubRoomIds: [],
        };
      }
      if (bloodFromStoneSetupPlacementPlan.pendingPlayerChoiceCount <= 0) {
        return previousState;
      }
      return {
        ...previousState,
        interactionMode: "bloodFromStoneSetupPlacement",
        selectedBloodFromStoneStoneCherubRoomIds: [],
        selectedHelpingHandsTrollHandMoveMonsterId: null,
        selectedMonsterMoveMonsterId: null,
        selectedMonsterAttackMonsterId: null,
        selectedTradeTargetPlayerId: null,
        tradeSelectionTouched: false,
        hauntTargetingActionKind: null,
      };
    });
  }, [
    bloodFromStoneSetupCandidateRooms,
    bloodFromStoneSetupPlacementPlan.pendingPlayerChoiceCount,
  ]);

  const handleSelectBloodFromStoneSetupPlacementRoom = React.useCallback(
    (roomId: string) => {
      if (
        bloodFromStoneSetupPlacementPlan.pendingPlayerChoiceCount <= 0 ||
        !bloodFromStoneSetupCandidateRoomIds.has(roomId)
      ) {
        return;
      }
      setInventoryPreviewCardId(null);
      setPreviewState((previousState) => {
        const selectedRoomIds =
          previousState.selectedBloodFromStoneStoneCherubRoomIds
            .filter((candidateRoomId) =>
              bloodFromStoneSetupCandidateRoomIds.has(candidateRoomId),
            )
            .slice(
              0,
              bloodFromStoneSetupPlacementPlan.pendingPlayerChoiceCount,
            );
        if (
          selectedRoomIds.length >=
          bloodFromStoneSetupPlacementPlan.pendingPlayerChoiceCount
        ) {
          return {
            ...previousState,
            interactionMode: "bloodFromStoneSetupPlacement",
            selectedBloodFromStoneStoneCherubRoomIds: selectedRoomIds,
          };
        }
        return {
          ...previousState,
          interactionMode: "bloodFromStoneSetupPlacement",
          selectedBloodFromStoneStoneCherubRoomIds: [
            ...selectedRoomIds,
            roomId,
          ],
          selectedHelpingHandsTrollHandMoveMonsterId: null,
          selectedMonsterMoveMonsterId: null,
          selectedMonsterAttackMonsterId: null,
          hauntTargetingActionKind: null,
        };
      });
    },
    [
      bloodFromStoneSetupCandidateRoomIds,
      bloodFromStoneSetupPlacementPlan.pendingPlayerChoiceCount,
    ],
  );

  const handleConfirmBloodFromStoneSetupPlacement = React.useCallback(() => {
    if (
      selectedBloodFromStoneStoneCherubRoomIds.length !==
        bloodFromStoneSetupPlacementPlan.pendingPlayerChoiceCount ||
      bloodFromStoneSetupPlacementPlan.pendingPlayerChoiceCount <= 0
    ) {
      return;
    }
    dispatchCommand(
      BETRAYAL_COMMANDS.PLACE_BLOOD_FROM_STONE_EXTRA_STONE_CHERUBS,
      {
        roomIds: selectedBloodFromStoneStoneCherubRoomIds,
      },
    );
    setInventoryPreviewCardId(null);
    setPreviewState((previousState) => ({
      ...previousState,
      interactionMode: "default",
      selectedBloodFromStoneStoneCherubRoomIds: [],
      selectedHelpingHandsTrollHandMoveMonsterId: null,
      selectedMonsterMoveMonsterId: null,
      selectedMonsterAttackMonsterId: null,
      hauntTargetingActionKind: null,
    }));
  }, [
    bloodFromStoneSetupPlacementPlan.pendingPlayerChoiceCount,
    dispatchCommand,
    selectedBloodFromStoneStoneCherubRoomIds,
  ]);

  const handleCancelHauntTargeting = React.useCallback(() => {
    selectedAttackWeaponCardIdRef.current = null;
    setInventoryPreviewCardId(null);
    setPreviewState((previousState) => ({
      ...previousState,
      selectedAttackWeaponCardId: null,
      selectedTradeTargetPlayerId: null,
      selectedTradeGiveCardIds: [],
      tradeSelectionTouched: false,
      interactionMode:
        previousState.interactionMode === "sicknessExchange" ||
        previousState.interactionMode === "monsterAttack" ||
        previousState.interactionMode === "bloodFromStoneSetupPlacement"
          ? "default"
          : previousState.interactionMode,
      selectedMonsterAttackMonsterId: null,
      selectedBloodFromStoneStoneCherubRoomIds: [],
      hauntTargetingActionKind: null,
    }));
  }, []);

  const handleToggleDogTradeCard = React.useCallback((cardId: string) => {
    setPreviewState((previousState) => {
      const selected = new Set(previousState.selectedDogTradeCardIds);
      if (selected.has(cardId)) {
        selected.delete(cardId);
      } else {
        selected.add(cardId);
      }
      return {
        ...previousState,
        interactionMode: "default",
        selectedDogTradeCardIds: Array.from(selected),
        tradeSelectionTouched: true,
      };
    });
  }, []);

  const handleToggleTradeGiveCard = React.useCallback((cardId: string) => {
    setPreviewState((previousState) => {
      const selected = new Set(previousState.selectedTradeGiveCardIds);
      if (selected.has(cardId)) {
        selected.delete(cardId);
      } else {
        selected.add(cardId);
      }
      const selectedTradeGiveCardIds = Array.from(selected);
      return {
        ...previousState,
        interactionMode: "default",
        selectedInventoryCardId: null,
        selectedTradeGiveCardIds,
        selectedInventoryTargetPlayerId: null,
        selectedInventoryTargetRoomId: null,
        selectedInventoryReplacementRollTotal: null,
        selectedMaskTargetRoomIdsByTokenId: {},
        activeMaskTargetTokenId: null,
        tradeSelectionTouched: true,
      };
    });
  }, []);

  const handleToggleTradeReturnCard = React.useCallback((cardId: string) => {
    setPreviewState((previousState) => {
      const selected = new Set(previousState.selectedTradeReturnCardIds);
      if (selected.has(cardId)) {
        selected.delete(cardId);
      } else {
        selected.add(cardId);
      }
      return {
        ...previousState,
        interactionMode: "default",
        selectedTradeReturnCardIds: Array.from(selected),
        tradeSelectionTouched: true,
      };
    });
  }, []);

  const resolveInventoryCardSurfaceTradeStatus = React.useCallback(
    (cardId: string): BetrayalTradeCardStatus | null => {
      if (
        isInventoryDisplayReadOnly ||
        isDustSicknessExchangeMode ||
        !isTradeDraftActive ||
        pendingTradeAgreement
      ) {
        return null;
      }
      return resolveBetrayalTradeCardStatus(core, cardId, {
        ownerPlayerId: core.currentExplorer.playerId,
        ownerRole: "requester",
      });
    },
    [
      core,
      isDustSicknessExchangeMode,
      isInventoryDisplayReadOnly,
      isTradeDraftActive,
      pendingTradeAgreement,
    ],
  );

  const resolveInventoryCardSurfaceSelected = React.useCallback(
    (cardId: string): boolean => {
      if (isInventoryDisplayReadOnly) {
        return false;
      }
      if (
        isTradeDraftActive &&
        !isDustSicknessExchangeMode &&
        selectedTradeGiveCardIds.includes(cardId)
      ) {
        return true;
      }
      return cardId === selectedInventoryCard?.id;
    },
    [
      isDustSicknessExchangeMode,
      isInventoryDisplayReadOnly,
      isTradeDraftActive,
      selectedInventoryCard?.id,
      selectedTradeGiveCardIds,
    ],
  );

  const handleInventoryCardSurfacePrimarySelect = React.useCallback(
    (cardId: string) => {
      if (isTradeDraftActive && !isDustSicknessExchangeMode) {
        handleToggleTradeGiveCard(cardId);
        return;
      }
      setPreviewState((previousState) => ({
        ...previousState,
        selectedInventoryCardId: cardId,
        selectedInventoryTargetPlayerId: null,
        selectedInventoryTargetRoomId: null,
        selectedInventoryReplacementRollTotal: null,
        selectedMaskTargetRoomIdsByTokenId: {},
        activeMaskTargetTokenId: null,
        selectedTradeGiveCardIds: [],
        selectedDogTradeCardIds: [],
        selectedTradeReturnCardIds: [],
        tradeSelectionTouched: false,
      }));
    },
    [handleToggleTradeGiveCard, isDustSicknessExchangeMode, isTradeDraftActive],
  );

  const handleInventoryCardSurfaceEventRollBookUse = React.useCallback(
    (cardId: string) => {
      dispatchCommand(BETRAYAL_COMMANDS.USE_POSSESSION, {
        cardId,
      });
      setInventoryPreviewCardId(null);
      setPreviewState((previousState) => ({
        ...previousState,
        selectedInventoryCardId: null,
        selectedRollModifierDieIndex: null,
      }));
    },
    [dispatchCommand],
  );

  const handleAttackAction = React.useCallback(
    (
      target: "traitor" | "hero" | "jack-spirit",
      targetPlayerId?: string | null,
      targetMonsterId?: string | null,
    ) => {
      const attackWeaponCardId = selectedAttackWeaponCardIdRef.current;
      dispatchCommand(BETRAYAL_COMMANDS.HAUNT_ATTACK, {
        target,
        ...(targetPlayerId ? { targetPlayerId } : {}),
        ...(targetMonsterId ? { targetMonsterId } : {}),
        ...(attackWeaponCardId ? { weaponCardId: attackWeaponCardId } : {}),
      });
      selectedAttackWeaponCardIdRef.current = null;
      setInventoryPreviewCardId(null);
      setPreviewState((previousState) => ({
        ...previousState,
        selectedAttackWeaponCardId: null,
        interactionMode: "default",
        hauntTargetingActionKind: null,
      }));
    },
    [dispatchCommand],
  );

  const handleDynamiteRoomAttack = React.useCallback(
    (targetRoomId: string) => {
      const attackWeaponCardId = selectedAttackWeaponCardIdRef.current;
      if (!attackWeaponCardId) {
        return;
      }
      dispatchCommand(BETRAYAL_COMMANDS.HAUNT_ATTACK, {
        target: "dynamite-room",
        weaponCardId: attackWeaponCardId,
        targetRoomId,
      });
      selectedAttackWeaponCardIdRef.current = null;
      setInventoryPreviewCardId(null);
      setPreviewState((previousState) => ({
        ...previousState,
        selectedAttackWeaponCardId: null,
        interactionMode: "default",
        hauntTargetingActionKind: null,
      }));
    },
    [dispatchCommand],
  );

  const handleHauntPrimaryAction = () => {
    if (!hauntActionContext || hasPendingPlayerAgreement) {
      return;
    }
    if (hauntActionDisabledReason) {
      return;
    }

    const focusRoom = (roomId: string | null | undefined) => {
      const room = core.rooms.find((item) => item.id === roomId);
      if (room) {
        setSelectedRoomMapFloor(room.floor);
      }
    };
    const focusExplorer = (playerId: string | null | undefined) => {
      const explorer = allExplorers.find((item) => item.playerId === playerId);
      focusRoom(explorer?.roomId);
    };

    const isDynamiteRoomAttackAction =
      hauntActionContext.actionKind === "attack-room" ||
      (hauntActionContext.actionKind.startsWith("attack-") &&
        selectedAttackWeaponEffectId === "dynamite");
    if (isDynamiteRoomAttackAction) {
      if (
        selectedAttackWeaponEffectId !== "dynamite" &&
        dynamiteAttackWeaponCard
      ) {
        selectedAttackWeaponCardIdRef.current = dynamiteAttackWeaponCard.id;
      }
      focusRoom(core.currentExplorer.roomId);
    } else
      switch (hauntActionContext.actionKind) {
        case "use":
          handleUseAction();
          return;
        case "sickness-exchange":
          handleTradeAction();
          focusExplorer(dustSameRoomLivingTargets[0]?.playerId);
          return;
        case "attack-dust":
          focusExplorer(dustSameRoomLivingTargets[0]?.playerId);
          break;
        case "attack-traitor":
          focusExplorer(core.scenarioRuntime.traitorPlayerId);
          break;
        case "attack-hero":
          focusExplorer(heroAttackTargets[0]?.playerId);
          break;
        case "play-peekaboo":
          focusRoom(bloodFromStonePeekabooOptions[0]?.sameRoomRoomId);
          break;
        default:
          break;
      }

    setPreviewState((previousState) => ({
      ...previousState,
      selectedAttackWeaponCardId:
        isDynamiteRoomAttackAction && dynamiteAttackWeaponCard
          ? dynamiteAttackWeaponCard.id
          : previousState.selectedAttackWeaponCardId,
      interactionMode: "default",
      hauntTargetingActionKind: hauntActionContext.actionKind,
      selectedPeekabooSameRoomMonsterId: null,
      selectedPeekabooLineOfSightMonsterId: null,
    }));
  };

  function handleSelectExplorerTarget(explorer: BetrayalExplorerSummary) {
    const action = resolveBetrayalExplorerTargetSelectionAction({
      explorer,
      traitorPlayerId: core.scenarioRuntime.traitorPlayerId,
      isMonsterAttackMode,
      selectedMonsterAttackEntry,
      selectedMonsterAttackTargetPlayerIds,
      activeHauntTargetGuide,
      hauntActionKind: hauntActionContext?.actionKind,
      magicCameraPhotoTargetPlayerIds,
      helpingHandsTrollHandAttackTargetPlayerIds,
      isHeroAttackTargetingMode,
      heroAttackTargetPlayerIds,
      isDustSicknessExchangeMode,
      dustTargetPlayerIds,
      isDustAttackTargetingMode,
      isTradeOrLootTargetSelectionActive,
      activeTradeTargets,
      corpseLootTargets,
      selectedInventoryUseEffectMode,
      healTargetExplorers,
      maskTargetTokens,
    });

    switch (action.kind) {
      case "phantomPhotographerAttack":
        dispatchCommand(
          BETRAYAL_COMMANDS.PHANTOM_PHOTOGRAPHER_ATTACK,
          action.payload,
        );
        setPreviewState((previousState) =>
          resolveBetrayalPreviewStateAfterExplorerTargetSelection(
            previousState,
            action,
          ),
        );
        return;
      case "monsterAttackHero":
        dispatchCommand(BETRAYAL_COMMANDS.MONSTER_ATTACK_HERO, action.payload);
        setPreviewState((previousState) =>
          resolveBetrayalPreviewStateAfterExplorerTargetSelection(
            previousState,
            action,
          ),
        );
        return;
      case "hauntAttackHero":
        dispatchCommand(BETRAYAL_COMMANDS.HAUNT_ATTACK, action.payload);
        setPreviewState((previousState) =>
          resolveBetrayalPreviewStateAfterExplorerTargetSelection(
            previousState,
            action,
          ),
        );
        return;
      case "hauntAttackTraitor":
        handleAttackAction("traitor");
        return;
      case "attackHero":
        handleAttackAction("hero", action.targetPlayerId);
        return;
      case "requestSicknessExchange":
        dispatchCommand(
          BETRAYAL_COMMANDS.REQUEST_SICKNESS_EXCHANGE,
          action.payload,
        );
        setPreviewState((previousState) =>
          resolveBetrayalPreviewStateAfterExplorerTargetSelection(
            previousState,
            action,
          ),
        );
        return;
      case "selectHauntUseTarget":
      case "selectTradeOrLootTarget":
      case "selectInventoryTargetPlayer":
      case "selectMaskTargetToken":
        setPreviewState((previousState) =>
          resolveBetrayalPreviewStateAfterExplorerTargetSelection(
            previousState,
            action,
          ),
        );
        return;
      case "none":
        return;
    }
  }

  const handleEndTurnAction = React.useCallback(() => {
    dispatchCommand(BETRAYAL_COMMANDS.END_TURN, {});
    setInventoryPreviewCardId(null);
    setPreviewState((previousState) => ({
      ...previousState,
      selectedTradeTargetPlayerId: null,
      selectedTradeGiveCardIds: [],
      selectedTradeReturnCardIds: [],
      tradeSelectionTouched: false,
      interactionMode: "default",
      selectedMonsterMoveMonsterId: null,
      selectedMonsterAttackMonsterId: null,
    }));
  }, [dispatchCommand]);

  const handleRoomEffectAction = React.useCallback(() => {
    dispatchCommand(BETRAYAL_COMMANDS.USE_ROOM_EFFECT, {});
    setInventoryPreviewCardId(null);
    setPreviewState((previousState) => ({
      ...previousState,
      selectedTradeTargetPlayerId: null,
      selectedTradeGiveCardIds: [],
      selectedTradeReturnCardIds: [],
      tradeSelectionTouched: false,
      interactionMode: "default",
      selectedMonsterMoveMonsterId: null,
      selectedMonsterAttackMonsterId: null,
    }));
  }, [dispatchCommand]);

  const roomSpecialActionStatus = resolveBetrayalRoomSpecialActionStatus(core);
  const {
    canUse: canUseRoomEffect,
    shouldShowAction: shouldShowRoomEffectAction,
    disabledReason: roomEffectDisabledReason,
  } = resolveBetrayalRoomEffectActionPresentation(
    roomSpecialActionStatus,
    t,
  );
  const { visibleActionDisabledReason, visibleActionItems } =
    resolveBetrayalBoardActionItems({
      t,
      phase: core.phase,
      movesRemaining: core.movesRemaining,
      currentExplorerInventoryCount: core.currentExplorerInventory.length,
      interactionMode: previewState.interactionMode,
      turnEndedByDiscovery: core.turnEndedByDiscovery,
      hasPendingPlayerAgreement,
      canStartExploreSelection,
      hasCorpseLootTargets,
      tradeSelectionReady,
      shouldStartDustSicknessExchange,
      isDustSicknessExchangeMode,
      hasUsedTradeThisTurn,
      hasAnyTradeSelectableCards,
      activeTradeTargetCount: activeTradeTargets.length,
      hasSelectedInventoryCard: Boolean(selectedInventoryCard),
      selectedCardUseDisabled,
      selectedCardUseDisabledReason,
      hauntAction: hauntActionContext
        ? {
            label: hauntActionContext.label,
            disabledReason: hauntActionDisabledReason,
          }
        : null,
      shouldShowRoomEffectAction,
      canUseRoomEffect,
      roomEffectDisabledReason,
      hasRoomEndTurnEffect: Boolean(roomEndTurnEffectHint),
      shouldShowHauntRevealCue,
      hasActiveHauntTargetGuide: Boolean(activeHauntTargetGuide),
      activeHauntTargetGuideCue: activeHauntTargetGuide?.cue ?? null,
      isHelpingHandsMonsterTurnController,
      helpingHandsMonsterTurnActive: helpingHandsMonsterTurnStatus.active,
      helpingHandsTrollHandMoveEntryCount:
        helpingHandsTrollHandMoveEntries.length,
      isDeadTraitorJackSpiritControlTurn,
      pendingBloodFromStoneSetupPlacementCount:
        bloodFromStoneSetupPlacementPlan.pendingPlayerChoiceCount,
      selectedBloodFromStoneStoneCherubRoomCount:
        selectedBloodFromStoneStoneCherubRoomIds.length,
      isBloodFromStoneSetupPlacementMode,
      monsterTurnStartAction: monsterTurnStartActionSlot?.monsterId
        ? {
            name: resolveMonsterActionSlotName(monsterTurnStartActionSlot),
            reason: monsterTurnStartActionSlot.reason,
          }
        : null,
      monsterMovementRollAction: monsterMovementRollActionSlot?.groupId
        ? {
            name: resolveMonsterActionSlotName(monsterMovementRollActionSlot),
            reason: monsterMovementRollActionSlot.reason,
          }
        : null,
      selectedMonsterMoveAction: selectedMonsterMoveEntry
        ? {
            name: selectedMonsterMoveEntry.monster.name,
            reason: selectedMonsterMoveEntry.slot.reason,
          }
        : null,
      selectedMonsterAttackAction: selectedMonsterAttackEntry
        ? {
            name: selectedMonsterAttackEntry.monster.name,
            reason: selectedMonsterAttackEntry.slot.reason,
          }
        : null,
      bloodFromStoneMonsterTurnEndAction: bloodFromStoneMonsterTurnEndActionSlot
        ? { name: "", reason: bloodFromStoneMonsterTurnEndActionSlot.reason }
        : null,
    });
  const tutorialMapTargetRoomId = React.useMemo(() => {
    const target = tutorialStep?.highlightTarget;
    if (!isTutorialActive || !target) {
      return null;
    }
    if (
      target.startsWith("betrayal-room-") &&
      !target.startsWith("betrayal-room-preview-") &&
      !target.startsWith("betrayal-room-shell-")
    ) {
      return target.replace("betrayal-room-", "");
    }
    return null;
  }, [isTutorialActive, tutorialStep?.highlightTarget]);

  const actionHandlerMap: Record<ActionBarAction["id"], () => void> = {
    move: isHelpingHandsMonsterTurnController
      ? handleHelpingHandsTrollHandMoveAction
      : handleMoveAction,
    explore: handleExploreAction,
    trade: handleTradeAction,
    use:
      core.phase === "haunt" && hauntActionContext && !selectedInventoryCard
        ? handleHauntPrimaryAction
        : handleUseAction,
    roomEffect: handleRoomEffectAction,
    monsterTurnStart: handleResolveMonsterTurnStart,
    monsterMovementRoll: handleRollMonsterMovementGroup,
    monsterMove: handleMonsterMoveAction,
    monsterAttack: handleMonsterAttackAction,
    bloodFromStoneSetupPlacement: handleBloodFromStoneSetupPlacementAction,
    bloodFromStoneConfirmSetupPlacement:
      handleConfirmBloodFromStoneSetupPlacement,
    bloodFromStoneMonsterTurnEnd: handleEndBloodFromStoneMonsterTurn,
    endTurn: isHelpingHandsMonsterTurnController
      ? handleEndHelpingHandsMonsterTurn
      : handleEndTurnAction,
    cancelTarget: handleCancelHauntTargeting,
  };
  if (baseCore.phase === "characterSelect") {
    return (
      <UndoProvider value={undoProviderValue}>
        <CharacterSelectScreen
          core={baseCore}
          matchData={matchData}
          effectiveLocale={effectiveLocale}
          isPhoneLandscapeLayout={isPhoneLandscapeLayout}
          viewerPlayerId={viewerPlayerId}
          selectedExplorerId={selectedExplorerId}
          onSelectExplorer={handleSelectExplorer}
          onConfirmExplorer={handleConfirmExplorer}
          onProposeScenarioCard={handleProposeScenarioCard}
          onConfirmScenarioCard={handleConfirmScenarioCard}
          onStartScenario={handleStartScenario}
        />
        <BetrayalDebugPanel G={G} dispatch={dispatch} playerID={playerID} />
      </UndoProvider>
    );
  }

  const observedExplorerTemplate = EXPLORER_CATALOG.find(
    (explorer) => explorer.explorerId === observedExplorer.explorerId,
  );
  const observedExplorerAbilityName =
    observedExplorer.abilityName || observedExplorerTemplate?.abilityName || "";
  const observedExplorerAbilityText =
    observedExplorer.abilityText || observedExplorerTemplate?.abilityText || "";

  return (
    <UndoProvider value={undoProviderValue}>
      <div
        data-testid="betrayal-board"
        data-betrayal-visual-busy={isVisualBusy ? "true" : "false"}
        className="relative h-full min-h-full overflow-hidden bg-[#0c1512] text-[#f1e8d4]"
        style={{
          backgroundImage: [
            "radial-gradient(circle at top, rgba(146, 116, 58, 0.18), transparent 30%)",
            "linear-gradient(180deg, rgba(11, 22, 18, 0.98) 0%, rgba(8, 15, 13, 1) 100%)",
          ].join(","),
          ...(isPhoneLandscapeLayout
            ? {
                height: "100dvh",
                minHeight: "100dvh",
                maxHeight: "100dvh",
              }
            : {}),
        }}
      >
        {!isHauntTargetingMode && !isPhoneLandscapeLayout ? (
          <BetrayalDebugPanel G={G} dispatch={dispatch} playerID={playerID} />
        ) : null}
        {shouldShowScenarioStartOpening && scenarioStartOpeningSection ? (
          <BetrayalScenarioStartOpeningStageSurface
            label={t(scenarioStartOpeningSection.labelKey)}
            text={t(scenarioStartOpeningSection.bodyKey)}
            continueLabel={t("board.scenario.readerContinue")}
            compact={isPhoneLandscapeLayout}
            onContinue={dismissScenarioStartOpening}
          />
        ) : null}
        {inspectedExplorer ? (
          <ExplorerDetailsDialog
            explorer={inspectedExplorer}
            locale={effectiveLocale}
            playerName={resolvePlayerName(
              inspectedExplorer.playerId,
              inspectedExplorer.displayName,
              matchData,
            )}
            roomName={inspectedExplorerRoomName}
            abilityName={
              inspectedExplorerTemplate?.abilityName ??
              inspectedExplorer.displayName
            }
            abilityText={inspectedExplorerTemplate?.abilityText ?? ""}
            onClose={closeExplorerDetails}
          />
        ) : null}
        {inspectedMonster ? (
          <MonsterDetailsDialog
            monster={inspectedMonster}
            status={inspectedMonsterStatus}
            locale={effectiveLocale}
            roomName={inspectedMonsterRoomName}
            onClose={closeMonsterDetails}
          />
        ) : null}
        <div
          className={`relative h-full min-h-full w-full overflow-hidden ${
            isPhoneLandscapeLayout ? "p-0" : "px-3 py-3 md:px-4 md:py-4"
          }`}
          data-testid={
            isPhoneLandscapeLayout
              ? "betrayal-mobile-landscape-layout"
              : "betrayal-desktop-layout"
          }
          data-layout-mode={
            isPhoneLandscapeLayout ? "phone-landscape-native" : "desktop-board"
          }
        >
          <header className="pointer-events-none absolute inset-x-4 top-3 z-30 hidden lg:block">
            <div
              className="relative min-h-[58px]"
              data-testid="betrayal-runtime-header-grid"
            >
              <span className="sr-only">{phaseLabel}</span>
              {!isPhoneLandscapeLayout &&
              !shouldHideTableChromeForBlockingOverlay ? (
                <HudPortal>
                  <div
                    data-testid="betrayal-phase-chip"
                    className="fixed left-1/2 top-3 flex min-w-[210px] flex-col items-center justify-center rounded-[8px] border border-[rgba(114,91,52,0.36)] bg-[rgba(8,13,11,0.68)] px-5 py-2 text-center shadow-[0_14px_30px_rgba(0,0,0,0.2)] backdrop-blur-md"
                    style={{
                      zIndex: UI_Z_INDEX.hud,
                      transform: "translateX(-50%)",
                    }}
                  >
                    <span className="text-[11px] uppercase tracking-[0.28em] text-[#b99b5f]">
                      {t("board.hud.phaseLabel")}
                    </span>
                    <span className="mt-0.5 text-[21px] font-semibold uppercase tracking-[0.2em] text-[#f0d29a]">
                      {phaseLabel}
                    </span>
                  </div>
                </HudPortal>
              ) : null}
              <div
                className="absolute right-[244px] top-0 flex items-center justify-end gap-3 rounded-[8px] border border-[rgba(114,91,52,0.28)] bg-[rgba(8,13,11,0.58)] px-3 py-1.5 shadow-[0_14px_30px_rgba(0,0,0,0.18)] backdrop-blur-md"
                data-testid="betrayal-status-chip"
              >
                <div className="text-right">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-[#b99b5f]">
                    {t("board.hud.turnLabel")}
                  </div>
                  <div className="mt-0.5 text-[16px] font-semibold uppercase tracking-[0.12em] text-[#f0d29a]">
                    {resolvePlayerName(
                      core.currentPlayer,
                      core.currentExplorer.displayName,
                      matchData,
                    )}
                  </div>
                </div>
                <div
                  className="grid h-[54px] min-w-[58px] place-items-center rounded-[8px] border border-[#756244] bg-[radial-gradient(circle_at_35%_30%,rgba(190,233,97,0.22),rgba(20,28,18,0.94)_72%)] px-1 text-center shadow-[0_0_18px_rgba(130,177,76,0.18)]"
                  data-tutorial-id="betrayal-moves-remaining"
                  data-testid="betrayal-movement-snapshot"
                  data-moves-remaining={core.movesRemaining}
                  data-turn-start-speed={turnStartSpeedForHud}
                >
                  <div>
                    <div className="text-[8px] font-semibold uppercase tracking-[0.12em] text-[#b5ef42]">
                      {t("board.hud.moveLabel")}
                    </div>
                    <div className="text-[18px] font-bold leading-none text-[#c8f05e]">
                      {t("board.status.moveSnapshot", {
                        remaining: core.movesRemaining,
                        total: turnStartSpeedForHud,
                      })}
                    </div>
                    <div className="mt-0.5 text-[7px] font-semibold uppercase tracking-[0.08em] text-[#d4f58f]">
                      {t("board.status.turnStartSpeed", {
                        count: turnStartSpeedForHud,
                      })}
                    </div>
                    <span className="sr-only">
                      {t("board.status.movesRemaining", {
                        count: core.movesRemaining,
                      })}{" "}
                      {t("board.status.turnStartSpeed", {
                        count: turnStartSpeedForHud,
                      })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </header>

          <main className="absolute inset-0 overflow-hidden">
            {shouldUseMobileEventOpenTableChrome ? (
              <div
                data-testid="betrayal-phase-chip"
                data-mobile-role="pc-isomorphic-phase-chip"
                className="pointer-events-none absolute left-1/2 top-0 z-[54] flex min-w-[136px] -translate-x-1/2 flex-col items-center justify-center rounded-[8px] border border-[rgba(114,91,52,0.36)] bg-[rgba(8,13,11,0.68)] px-2.5 py-1 text-center shadow-[0_14px_30px_rgba(0,0,0,0.2)] backdrop-blur-md"
              >
                <span className="text-[7px] uppercase tracking-[0.22em] text-[#b99b5f]">
                  {t("board.hud.phaseLabel")}
                </span>
                <span className="mt-0 text-[13px] font-semibold uppercase tracking-[0.16em] text-[#f0d29a]">
                  {phaseLabel}
                </span>
              </div>
            ) : null}

            {shouldShowHauntRevealCue ? (
              <BetrayalHauntRevealCue
                revealProtocol={hauntRevealProtocol}
                scenarioRuntime={core.scenarioRuntime}
                readerScope={scenarioReaderScope}
                isPhoneLandscapeLayout={isPhoneLandscapeLayout}
                onDismiss={handleDismissHauntRevealCue}
              />
            ) : null}

            <BetrayalTopPromptStackSurface
              variant="mobile"
              enabled={
                isPhoneLandscapeLayout &&
                !shouldHideTableChromeForBlockingOverlay &&
                !pendingEventFocusesMapTarget &&
                !shouldUseMobileEventOpenTableChrome &&
                shouldShowTopPromptStack
              }
              dustProgressItems={visibleDustProgressItems}
              showDustProgress={shouldShowDustProgressPrompt}
              dustProgressDimmed={Boolean(activeHauntTargetGuide)}
              activeHauntCaseLabel={activeHauntCaseLabel}
              activeHauntTitle={activeHauntTitle}
              showTradeFlowPrompt={shouldShowTradeFlowPrompt}
              tradeAgreementState={tradeAgreementState}
              tradeBannerStatusText={tradeBannerStatusText}
              mummyReward={
                mummyPendingReward
                  ? {
                      isChooser: isMummyRewardChooser,
                      chooserTargetName: mummyRewardDefenderName,
                      waitingPlayerName: mummyRewardControllerName,
                      damage: mummyPendingReward.damageToHero,
                      unavailableStealTargetCount:
                        mummyUnavailableStealTargetCount,
                    }
                  : null
              }
              helpingHandsReward={
                helpingHandsPendingReward
                  ? {
                      isChooser: isHelpingHandsRewardChooser,
                      chooserTargetName: helpingHandsRewardDefenderName,
                      waitingPlayerName: helpingHandsRewardAttackerName,
                      damage: helpingHandsPendingReward.damageToDefender,
                    }
                  : null
              }
              helpingHandsMonsterTurnStatus={
                shouldShowHelpingHandsMonsterTurnStatus
                  ? {
                      active: helpingHandsMonsterTurnStatus.active,
                      controllerName: helpingHandsMonsterControllerName,
                    }
                  : null
              }
              showHelpingHandsTrollAttack={
                shouldShowHelpingHandsTrollAttackBanner
              }
              helpingHandsTrollAttackTargetName={
                helpingHandsTrollHandAttackTargetName
              }
            />

            <section
              data-testid={
                shouldShowMobileEventStatusRail
                  ? "betrayal-mobile-event-status-hud"
                  : "betrayal-left-status-rail"
              }
              data-mobile-role={
                shouldShowMobileEventStatusRail
                  ? "pc-isomorphic-explorer-rail"
                  : undefined
              }
              className={`pointer-events-none absolute z-40 max-h-[calc(100vh-1.5rem)] w-[286px] min-h-0 content-start gap-2 overflow-visible ${
                shouldShowMobileEventStatusRail
                  ? "left-2 top-2 grid origin-top-left scale-[0.60]"
                  : isPhoneLandscapeLayout
                    ? "hidden"
                    : `left-3 top-3 grid ${activeHauntTargetGuide ? "opacity-[0.72]" : ""}`
              }`}
            >
              <BetrayalObservedExplorerPanelSurface
                explorer={observedExplorer}
                roomName={observedExplorerRoomName}
                abilityName={observedExplorerAbilityName}
                abilityText={observedExplorerAbilityText}
                markerAsset={ASSETS.marker.numberBlank}
                locale={effectiveLocale}
                matchData={matchData}
                isObservingOtherExplorer={isObservingOtherExplorer}
              />

              <article className="hidden px-2 py-1 md:px-1 xl:hidden">
                <div className="mb-2.5 text-[11px] uppercase tracking-[0.2em] text-[#a89d84]">
                  {t("board.sections.players")}
                </div>
                <div className="grid gap-1.5">
                  <BetrayalTeammateListSurface
                    variant="compact"
                    explorers={core.otherExplorers}
                    rooms={core.rooms}
                    currentExplorerRoomId={core.currentExplorer.roomId}
                    observedExplorerPlayerId={observedExplorer.playerId}
                    activeTradeTargets={activeTradeTargets}
                    corpseLootTargets={corpseLootTargets}
                    dogTradeTargets={dogTradeTargets}
                    dustTargetPlayerIds={dustTargetPlayerIds}
                    magicCameraPhotoTargetPlayerIds={
                      magicCameraPhotoTargetPlayerIds
                    }
                    phantomPhotographerTargetPlayerIds={
                      phantomPhotographerTargetPlayerIds
                    }
                    selectedMonsterAttackTargetPlayerIds={
                      selectedMonsterAttackTargetPlayerIds
                    }
                    helpingHandsTrollHandAttackTargetPlayerIds={
                      helpingHandsTrollHandAttackTargetPlayerIds
                    }
                    heroAttackTargetPlayerIds={heroAttackTargetPlayerIds}
                    knowledgeOfJackPlayerIds={
                      core.scenarioRuntime.knowledgeOfJackPlayerIds
                    }
                    isDustSicknessExchangeMode={isDustSicknessExchangeMode}
                    isHeroAttackTargetingMode={isHeroAttackTargetingMode}
                    isDustAttackTargetingMode={isDustAttackTargetingMode}
                    hauntActionKind={hauntActionContext?.actionKind}
                    hauntActionTargetPlayerId={
                      hauntActionContext?.targetPlayerId
                    }
                    selectedTradeTargetPlayerId={selectedTradeTargetPlayerId}
                    selectedCorpseLootTargetPlayerId={
                      selectedCorpseLootTargetPlayerId
                    }
                    selectedPreviewTradeTargetPlayerId={
                      previewState.selectedTradeTargetPlayerId
                    }
                    selectedDustTargetPlayerId={selectedDustTargetPlayerId}
                    locale={effectiveLocale}
                    matchData={matchData}
                    onSelectTarget={handleSelectExplorerTarget}
                    onObserveExplorer={handleObserveExplorer}
                  />
                </div>
              </article>
            </section>
            <BetrayalInventoryRailSurface
              explorer={inventoryDisplayExplorer}
              cards={visibleInventoryCards}
              isReadOnly={isInventoryDisplayReadOnly}
              ownerLabel={
                isInventoryDisplayReadOnly
                  ? resolvePlayerName(
                      inventoryDisplayExplorer.playerId,
                      inventoryDisplayExplorer.displayName,
                      matchData,
                    )
                  : null
              }
              selectedDisplayText={selectedInventoryDisplayText}
              hasSelectedDisplay={hasSelectedInventoryDisplay}
              useStatusText={useStatusText}
              isPhoneLandscapeLayout={isPhoneLandscapeLayout}
              isDimmed={Boolean(activeHauntTargetGuide)}
              elevatedForRollModifier={
                shouldShowLatestDiscovery &&
                !shouldAutoReturnAfterLatestDiscovery &&
                !pendingEventChoice &&
                canCurrentPlayerModifyLatestDiscoveryRoll
              }
              usedCardIdsThisTurn={core.usedCardIdsThisTurn}
              availableCardIdsThisTurn={core.turnStartInventoryCardIds}
              isTradeDraftActive={isTradeDraftActive}
              rollModifierCardIds={rollModifierCardIds}
              eventRollBookCardIds={eventRollBookCardIds}
              isTutorialUseBookActive={
                isTutorialActive && tutorialStep?.id === "use-book"
              }
              deckAssets={ASSETS.deck}
              traitAssets={ASSETS.trait}
              locale={effectiveLocale}
              resolveCardSelected={resolveInventoryCardSurfaceSelected}
              resolveTradeStatus={resolveInventoryCardSurfaceTradeStatus}
              onUseBookForEventRoll={handleInventoryCardSurfaceEventRollBookUse}
              onPrimarySelect={handleInventoryCardSurfacePrimarySelect}
              onPreview={setInventoryPreviewCardId}
            />

            <section
              className={`absolute inset-0 grid min-h-0 ${
                shouldShowLatestDiscovery &&
                !shouldAutoReturnAfterLatestDiscovery &&
                !pendingEventChoice
                  ? "z-[130]"
                  : "z-10"
              }`}
            >
              <div className="sr-only">
                {shouldShowBoardActionStatus ? (
                  <>
                    <span data-testid="betrayal-action-cue">
                      {actionCueText}
                    </span>
                    <span data-testid="betrayal-trade-status">
                      {tradeStatusText}
                    </span>
                    <span data-testid="betrayal-turn-hint">{turnHintText}</span>
                  </>
                ) : null}
                {roomEndTurnEffectHint ? (
                  <span data-testid="betrayal-room-end-turn-effect-status">
                    {roomEndTurnEffectHint.title} {roomEndTurnEffectHint.detail}
                  </span>
                ) : null}
                {visibleDustProgressItems.length > 0 ? (
                  <span data-testid="betrayal-dust-progress-status">
                    {activeHauntCaseLabel} {activeHauntTitle}{" "}
                    {visibleDustProgressItems
                      .map((item) => `${item.label} ${item.value}`)
                      .join(" ")}
                  </span>
                ) : null}
              </div>

              <article
                id="betrayal-room-panel"
                data-testid="betrayal-room-panel"
                data-tutorial-id="betrayal-room-board"
                className={`flex min-h-0 flex-col bg-transparent p-0 ${
                  isPhoneLandscapeLayout ? "pb-0 pt-0" : "pb-[86px] lg:pb-0"
                }`}
                data-mobile-role={
                  isPhoneLandscapeLayout ? "primary-board-stage" : undefined
                }
              >
                <div className="sr-only">
                  <span data-testid="betrayal-room-latest-feedback">
                    {latestLogEntry?.text || t("board.feedback.idle")}
                  </span>
                  {shouldShowLatestDiscovery &&
                  !shouldAutoReturnAfterLatestDiscovery ? (
                    <span>
                      {t("board.discovery.label")} {latestDiscovery!.title}{" "}
                      {latestDiscoveryDisplaySummary}
                    </span>
                  ) : null}
                  {shouldShowRoomFocusTargetLabel ? (
                    <span>{roomFocusState?.label}</span>
                  ) : null}
                  {tradeStatusCueState ? (
                    <span>{tradeStatusCueState.label}</span>
                  ) : null}
                </div>

                <BetrayalLatestDiscoverySurface
                  visible={
                    shouldShowLatestDiscovery &&
                    !shouldAutoReturnAfterLatestDiscovery &&
                    !pendingEventChoice
                  }
                  discovery={latestDiscovery}
                  displayedKindLabel={latestDiscoveryDisplayedKindLabel}
                  displayedTitle={latestDiscoveryDisplayedTitle}
                  displaySummary={latestDiscoveryDisplaySummary}
                  panelVisual={latestDiscoveryPanelVisual}
                  resolutionSteps={latestDiscoveryResolutionSteps}
                  visibleProcessCard={latestDiscoveryVisibleProcessCard}
                  searchStepNumber={latestDiscoverySearchStepNumber}
                  searchSequenceLength={latestDiscoverySearchSequence.length}
                  searchFinalEffectText={latestDiscoverySearchFinalEffectText}
                  shouldShowCardFace={shouldShowLatestDiscoveryCardFace}
                  shouldShowRoll={shouldShowLatestDiscoveryRoll}
                  recentRoll={latestDiscoveryRecentRoll}
                  rerollSelection={latestDiscoveryRerollSelection}
                  canModifyRoll={canCurrentPlayerModifyLatestDiscoveryRoll}
                  rollActorLabel={
                    latestDiscoveryRecentRoll
                      ? resolveRecentRollActorLabel(latestDiscoveryRecentRoll)
                      : ""
                  }
                  rollModifierActionSlot={rollModifierActionSlot}
                  pendingEventRollRequiresNoAcknowledgement={Boolean(
                    core.pendingEventRollResolution?.requiresAcknowledgement ===
                    false,
                  )}
                  hasPendingEventRollStart={Boolean(
                    pendingLatestDiscoveryEventRollStart,
                  )}
                  canStartPendingEventRoll={
                    canCurrentViewerStartLatestDiscoveryEventRoll
                  }
                  continueButton={latestDiscoveryContinueButton}
                  isPhoneLandscapeLayout={isPhoneLandscapeLayout}
                  shouldUseMobileEventOpenTableChrome={
                    shouldUseMobileEventOpenTableChrome
                  }
                  effectiveLocale={effectiveLocale}
                  canDismissByBackdrop={canDismissLatestDiscoveryByBackdrop}
                  isPossessionGainTransitionActive={
                    visualTransition?.kind === "possession-gain"
                  }
                  onDismiss={handleDismissLatestDiscovery}
                  onRollLatestDiscoveryEvent={handleRollLatestDiscoveryEvent}
                  onContinue={handleContinueLatestDiscovery}
                  onDiceSettledChange={handleRecentRollDiceSettledChange}
                />

                <BetrayalRecentRollReviewSurface
                  roll={core.recentRoll}
                  visible={Boolean(
                    core.recentRoll &&
                    core.phase !== "endgame" &&
                    !isRecentRollDismissed &&
                    !isConfirmedExorciseRoll &&
                    !pendingEventChoice &&
                    !shouldAutoReturnAfterLatestDiscovery &&
                    !shouldShowHauntRevealCue &&
                    !shouldPauseHauntBoardActions &&
                    !scenarioReaderOpen &&
                    !shouldShowScenarioStartOpening &&
                    !shouldShowLatestDiscovery,
                  )}
                  isExorciseRollReview={isExorciseRollReview}
                  isEndgameExorciseRollReview={isEndgameExorciseRollReview}
                  isPhoneLandscapeLayout={isPhoneLandscapeLayout}
                  canDismissByBackdrop={canDismissRecentRollByBackdrop}
                  effectiveLocale={effectiveLocale}
                  rerollSelection={recentRollRerollSelection}
                  actionSlot={
                    rollModifierActionSlot ?? recentRollAcknowledgeActionSlot
                  }
                  actorLabel={
                    core.recentRoll
                      ? resolveRecentRollActorLabel(core.recentRoll)
                      : ""
                  }
                  onDismiss={handleDismissRecentRoll}
                  onConfirmExorciseRollReview={handleConfirmExorciseRollReview}
                  onDiceSettledChange={handleRecentRollDiceSettledChange}
                />

                {pendingDamageAllocation &&
                pendingDamageExplorer &&
                !shouldGateDamageAllocationBehindRecentRoll ? (
                  <BetrayalDamageAllocationSurface
                    allocation={pendingDamageAllocation}
                    explorer={pendingDamageExplorer}
                    explorerName={pendingDamageExplorerName}
                    phase={pendingDamageAllocationPhase}
                    allowedTraits={pendingDamageAllocationAllowedTraits}
                    selectedTraits={selectedDamageAllocationTraits}
                    resolvedDamageKind={
                      pendingDamageUsesBrooch
                        ? "general"
                        : pendingDamageAllocation.damageKind
                    }
                    reductionAmount={pendingDamageReductionAmount}
                    reductionSourceLabel={pendingDamageReductionSourceLabel}
                    sourceHasVisibleOwner={
                      damageAllocationSourceHasVisibleOwner
                    }
                    canUseBrooch={canUseBroochForPendingDamageAllocation}
                    usesBrooch={pendingDamageUsesBrooch}
                    canAct={isPendingDamageAllocationForViewer}
                    ready={pendingDamageAllocationReady}
                    locale={effectiveLocale}
                    isPhoneLandscapeLayout={isPhoneLandscapeLayout}
                    onToggleBrooch={handleToggleDamageAllocationBrooch}
                    onAdjustTrait={handleAdjustDamageAllocationTrait}
                    canIncrementTrait={canIncrementDamageAllocationTrait}
                    onResolve={handleResolveDamageAllocation}
                  />
                ) : null}

                {pendingEventChoice && !pendingEventFocusesMapTarget ? (
                  <BetrayalEventChoiceSurface
                    choice={pendingEventChoice}
                    isEventSymbolSkip={pendingEventChoiceIsEventSymbolSkip}
                    isPhoneLandscapeLayout={isPhoneLandscapeLayout}
                    awaitsMapTargetClick={pendingEventAwaitsMapTargetClick}
                    hasMapTargetRooms={pendingEventTargetRooms.length > 0}
                    hasResultPanel={pendingEventChoiceHasResultPanel}
                    latestDiscoveryVisual={latestDiscoveryVisual}
                    roll={pendingEventChoiceRoll}
                    rollActorLabel={
                      pendingEventChoiceRoll
                        ? resolveRecentRollActorLabel(pendingEventChoiceRoll)
                        : null
                    }
                    allTraitCheck={pendingEventChoiceAllTraitCheck}
                    traitChoices={pendingEventTraitChoices}
                    selectedTrait={selectedEventTrait}
                    hasItemChoice={Boolean(pendingEventItemChoice)}
                    itemChoiceCards={pendingEventItemChoiceCards}
                    selectedCardId={selectedEventCardId}
                    showDamageChoice={shouldShowPendingEventDamageChoice}
                    damageChoice={pendingEventDamageChoice}
                    selectedDamageTraits={selectedEventDamageTraits}
                    explorer={core.currentExplorer}
                    phase={core.phase}
                    locale={effectiveLocale}
                    ready={pendingEventReady}
                    canDecline={pendingEventCanDecline}
                    showAcceptButton={shouldShowPendingEventAcceptButton}
                    onSelectTrait={handleSelectEventTrait}
                    onSelectCard={handleSelectEventCard}
                    onAdjustDamageTrait={handleAdjustEventDamageTrait}
                    canIncrementDamageTrait={canIncrementEventDamageTrait}
                    onResolve={handleResolveEventChoice}
                  />
                ) : null}

                <BetrayalTableActionCueSurface
                  hidden={shouldHideTableChromeForBlockingOverlay}
                  forceVisible={useDogTrade}
                  phase={core.phase}
                  isPhoneLandscapeLayout={isPhoneLandscapeLayout}
                  roomFocusLabel={
                    shouldShowRoomFocusTargetLabel
                      ? (roomFocusState?.label ?? null)
                      : null
                  }
                  tradeStatusCueLabel={
                    tradeStatusCueState && !isTradeDraftActive
                      ? tradeStatusCueState.label
                      : null
                  }
                  dustHauntTraitSelector={dustHauntTraitSelector}
                  inventoryTargetRooms={
                    selectedInventoryUseEffectMode === "placeExplorer"
                      ? inventoryTargetRooms
                      : []
                  }
                  selectedInventoryTargetRoomId={selectedInventoryTargetRoomId}
                  healTargetOptions={
                    selectedInventoryUseEffectMode === "healTraits"
                      ? healTargetExplorers.map((explorer) => ({
                          playerId: explorer.playerId,
                          displayName: resolvePlayerName(
                            explorer.playerId,
                            explorer.displayName,
                            matchData,
                          ),
                          selected:
                            selectedInventoryTargetPlayerId ===
                            explorer.playerId,
                        }))
                      : []
                  }
                  selectedHealCardName={selectedInventoryCard?.name ?? null}
                  rollTotalReplacementOptions={
                    selectedInventoryRollTotalReplacementEffect
                      ? selectedInventoryReplacementRollTotalOptions
                      : []
                  }
                  selectedInventoryReplacementRollTotal={
                    selectedInventoryReplacementRollTotal
                  }
                  selectedInventoryHealPreviewExplorer={
                    selectedInventoryHealPreviewExplorer
                  }
                  selectedInventoryHealPreviewTraits={
                    selectedInventoryHealPreviewTraits
                  }
                  attackWeaponCardStatuses={
                    hauntActionContext?.actionKind?.startsWith("attack-")
                      ? attackWeaponCardStatuses
                      : []
                  }
                  selectedAttackWeaponCardId={selectedAttackWeaponCardId}
                  selectedCorpseLootTarget={selectedCorpseLootTarget}
                  selectedCorpseLootCardId={selectedCorpseLootCardId}
                  exploreDeclarationOptions={
                    hasExploreDeclarationOptions
                      ? {
                          label: exploreDeclarationLabel,
                          canDeclareHolySymbolExplore,
                          useHolySymbolForExplore,
                          canDeclareIdolExplore,
                          useIdolForExplore,
                          canDeclareTraitorEventSkip,
                          ignoreEventSymbolWithTraitorPower,
                        }
                      : null
                  }
                  maskTargetTokens={
                    selectedCardNeedsTargetRoom ? maskTargetTokens : []
                  }
                  maskTargetRooms={
                    selectedCardNeedsTargetRoom ? maskTargetRooms : []
                  }
                  activeMaskTargetTokenId={activeMaskTargetTokenId}
                  selectedMaskTargetRoomIdsByTokenId={
                    selectedMaskTargetRoomIdsByTokenId
                  }
                  locale={effectiveLocale}
                  onSelectDustHauntTrait={handleSelectDustHauntTrait}
                  onSelectInventoryReplacementRollTotal={
                    handleSelectInventoryReplacementRollTotal
                  }
                  onSelectAttackWeapon={handleSelectAttackWeapon}
                  onSelectCorpseLootCard={(cardId) =>
                    setPreviewState((previousState) => ({
                      ...previousState,
                      selectedCorpseLootCardId: cardId,
                      tradeSelectionTouched: true,
                    }))
                  }
                  onToggleHolySymbolExplore={handleToggleHolySymbolExplore}
                  onToggleIdolExplore={handleToggleIdolExplore}
                  onToggleTraitorEventSkip={handleToggleTraitorEventSkip}
                />

                <BetrayalRoomMapSurface
                  core={core}
                  locale={effectiveLocale}
                  matchData={matchData}
                  roomGridRef={roomGridRef}
                  selectedFloor={selectedRoomMapFloor}
                  visibleRooms={visibleMapRooms}
                  roomCanvasLayout={roomCanvasLayout}
                  roomCanvasTransformStyle={roomCanvasTransformStyle}
                  roomCanvasWidth={roomCanvasWidth}
                  roomCanvasHeight={roomCanvasHeight}
                  isPhoneLandscapeLayout={isPhoneLandscapeLayout}
                  isHauntTargetingMode={isHauntTargetingMode}
                  roomFocusPanTarget={roomFocusPanTarget}
                  attackLineOfSightSegments={attackLineOfSightSegments}
                  roomOccupants={roomOccupants}
                  roomMonsters={roomMonsters}
                  visibleHauntTokensByRoomId={visibleHauntTokensByRoomId}
                  movingGirlTokenId={movingGirlTokenId}
                  movingExplorerPlayerId={movingExplorerPlayerId}
                  movingMonsterId={movingMonsterId}
                  activeHauntTargetGuide={activeHauntTargetGuide}
                  hauntActionKind={hauntActionContext?.actionKind}
                  canPickUpMummyGirlRoomId={canPickUpMummyGirlRoomId}
                  moveTargetRoomIds={moveTargetRoomIds}
                  skeletonKeyMoveTargetRoomIds={skeletonKeyMoveTargetRoomIds}
                  explorableRoomSlotIds={explorableRoomSlotIds}
                  interactionMode={previewState.interactionMode}
                  selectedInventoryUseEffectMode={
                    selectedInventoryUseEffectMode
                  }
                  inventoryTargetRooms={inventoryTargetRooms}
                  selectedInventoryTargetRoomId={selectedInventoryTargetRoomId}
                  pendingEventTargetRooms={pendingEventTargetRooms}
                  selectedEventTargetRoomId={selectedEventTargetRoomId}
                  maskTargetRooms={maskTargetRooms}
                  maskTargetTokens={maskTargetTokens}
                  activeMaskTargetTokenId={activeMaskTargetTokenId}
                  selectedMaskTargetRoomIdsByTokenId={
                    selectedMaskTargetRoomIdsByTokenId
                  }
                  isDynamiteRoomTargetingMode={isDynamiteRoomTargetingMode}
                  dynamiteTargetRoomIds={dynamiteTargetRoomIds}
                  isHelpingHandsTrollHandMoveMode={
                    isHelpingHandsTrollHandMoveMode
                  }
                  helpingHandsTrollMoveTargetRoomIds={
                    selectedHelpingHandsTrollHandMoveEntry?.targetRoomIds ??
                    null
                  }
                  helpingHandsTrollMoveMonsterName={
                    selectedHelpingHandsTrollHandMoveEntry?.monster.name ?? null
                  }
                  isMonsterMoveMode={isMonsterMoveMode}
                  monsterMoveTargetRoomIds={
                    selectedMonsterMoveEntry?.targetRoomIds ?? null
                  }
                  monsterMoveMonsterName={
                    selectedMonsterMoveEntry?.monster.name ?? null
                  }
                  isBloodFromStoneSetupPlacementMode={
                    isBloodFromStoneSetupPlacementMode
                  }
                  bloodFromStoneSetupCandidateRoomIds={
                    bloodFromStoneSetupCandidateRoomIds
                  }
                  selectedBloodFromStoneStoneCherubRoomIds={
                    selectedBloodFromStoneStoneCherubRoomIds
                  }
                  bloodFromStoneSetupPlacementCountByRoomId={
                    selectedBloodFromStoneStoneCherubRoomCountByRoomId
                  }
                  bloodFromStoneSetupPendingPlayerChoiceCount={
                    bloodFromStoneSetupPlacementPlan.pendingPlayerChoiceCount
                  }
                  pendingRoomPlacementPreview={pendingRoomPlacementPreview}
                  pendingEventFocusesMapTarget={pendingEventFocusesMapTarget}
                  tutorialMapTargetRoomId={tutorialMapTargetRoomId}
                  tutorialHighlightTarget={
                    tutorialStep?.highlightTarget ?? null
                  }
                  roomFocusState={roomFocusState}
                  isTradeOrLootTargetSelectionActive={
                    isTradeOrLootTargetSelectionActive
                  }
                  activeTradeTargets={activeTradeTargets}
                  corpseLootTargets={corpseLootTargets}
                  healTargetExplorers={healTargetExplorers}
                  dustTargetPlayerIds={dustTargetPlayerIds}
                  magicCameraPhotoTargetPlayerIds={
                    magicCameraPhotoTargetPlayerIds
                  }
                  helpingHandsTrollHandAttackTargetPlayerIds={
                    helpingHandsTrollHandAttackTargetPlayerIds
                  }
                  selectedMonsterAttackTargetPlayerIds={
                    selectedMonsterAttackTargetPlayerIds
                  }
                  heroAttackTargetPlayerIds={heroAttackTargetPlayerIds}
                  isDustAttackTargetingMode={isDustAttackTargetingMode}
                  isDustSicknessExchangeMode={isDustSicknessExchangeMode}
                  isHeroAttackTargetingMode={isHeroAttackTargetingMode}
                  selectedTradeTargetPlayerId={selectedTradeTargetPlayerId}
                  selectedCorpseLootTargetPlayerId={
                    selectedCorpseLootTargetPlayerId
                  }
                  selectedInventoryTargetPlayerId={
                    selectedInventoryTargetPlayerId
                  }
                  selectedPreviewTradeTargetPlayerId={
                    previewState.selectedTradeTargetPlayerId
                  }
                  selectedDustTargetPlayerId={selectedDustTargetPlayerId}
                  visibleFeedback={visibleBoardResultFeedback}
                  helpingHandsMovableTrollHandIds={
                    helpingHandsMovableTrollHandIds
                  }
                  monsterMovableIds={monsterMovableIds}
                  isMonsterAttackMode={isMonsterAttackMode}
                  monsterAttackableIds={monsterAttackableIds}
                  isBloodFromStonePeekabooMode={isBloodFromStonePeekabooMode}
                  bloodFromStonePeekabooSameRoomMonsterIds={
                    bloodFromStonePeekabooSameRoomMonsterIds
                  }
                  bloodFromStonePeekabooLineOfSightMonsterIds={
                    bloodFromStonePeekabooLineOfSightMonsterIds
                  }
                  selectedMonsterAttackSourceId={selectedMonsterAttackSourceId}
                  selectedPeekabooSameRoomMonsterId={
                    previewState.selectedPeekabooSameRoomMonsterId
                  }
                  monsterStatusById={monsterStatusById}
                  resolveMonsterRelationToExplorer={(
                    monsterId,
                    explorerPlayerId,
                  ) =>
                    resolveBetrayalMonsterRelationToExplorer(
                      core,
                      monsterId,
                      explorerPlayerId,
                    )
                  }
                  attackImpactPresentationKey={attackImpactPresentationKey}
                  pendingRoomPlacementFailureText={
                    pendingRoomPlacementFailureText
                  }
                  selectedRoomOrientationOption={selectedRoomOrientationOption}
                  selectedRoomOrientationTurns={selectedRoomOrientationTurns}
                  pendingRoomPlacementVisual={pendingRoomPlacementVisual}
                  pendingRoomPlacementAdjustmentText={
                    pendingRoomPlacementAdjustmentText
                  }
                  pendingRoomTileAdjustmentOptions={
                    pendingRoomTileAdjustmentOptions
                  }
                  selectedRoomTileAdjustmentOption={
                    selectedRoomTileAdjustmentOption
                  }
                  upperFloor={upperRoomMapFloor ?? null}
                  lowerFloor={lowerRoomMapFloor ?? null}
                  upperFloorHasSelectionTarget={
                    upperRoomMapFloorHasSelectionTarget
                  }
                  lowerFloorHasSelectionTarget={
                    lowerRoomMapFloorHasSelectionTarget
                  }
                  hasCrossFloorMoveTargets={hasCrossFloorMoveTargets}
                  hasCrossFloorRoomSelectionTargets={
                    hasCrossFloorRoomSelectionTargets
                  }
                  hiddenTableChrome={shouldHideTableChromeForBlockingOverlay}
                  onSelectEventTargetRoom={handleSelectEventTargetRoom}
                  onSelectBloodFromStoneSetupPlacementRoom={
                    handleSelectBloodFromStoneSetupPlacementRoom
                  }
                  onSelectInventoryTargetRoom={handleSelectInventoryTargetRoom}
                  onSelectMaskTargetRoom={handleSelectMaskTargetRoom}
                  onDynamiteRoomAttack={handleDynamiteRoomAttack}
                  onMoveHelpingHandsTrollHandToRoom={
                    handleHelpingHandsTrollHandMoveToRoom
                  }
                  onMoveMonsterToRoom={handleMoveMonsterToRoom}
                  onSelectRoomFocusAction={handleUseAction}
                  onPrepareExploreRoom={handlePrepareExploreRoom}
                  onMoveToRoom={handleMoveToRoom}
                  onOpenRoomPreview={setRoomPreviewId}
                  onSelectExplorerTarget={handleSelectExplorerTarget}
                  onOpenExplorerDetails={openExplorerDetails}
                  onSelectMonsterTarget={handleSelectMonsterTarget}
                  onSelectHelpingHandsTrollHandMoveMonster={
                    handleSelectHelpingHandsTrollHandMoveMonster
                  }
                  onSelectMonsterMoveMonster={handleSelectMonsterMoveMonster}
                  onSelectMonsterAttackMonster={
                    handleSelectMonsterAttackMonster
                  }
                  onOpenMonsterDetails={openMonsterDetails}
                  onPickUpMummyGirl={handleHauntPrimaryAction}
                  onRotateRoomPlacement={handleRotateRoomPlacement}
                  onCancelRoomPlacement={handleCancelRoomPlacement}
                  onConfirmRoomPlacement={handleConfirmRoomPlacement}
                  onSelectRoomTileAdjustment={handleSelectRoomTileAdjustment}
                  onSelectFloor={handleSelectRoomMapFloor}
                />
                <BetrayalTopPromptStackSurface
                  variant="desktop"
                  enabled={
                    !isEndgameExorciseRollReview &&
                    !shouldHideTableChromeForBlockingOverlay &&
                    !isPhoneLandscapeLayout &&
                    shouldShowTopPromptStack
                  }
                  dustProgressItems={visibleDustProgressItems}
                  showDustProgress={shouldShowDustProgressPrompt}
                  dustProgressDimmed={Boolean(activeHauntTargetGuide)}
                  activeHauntCaseLabel={activeHauntCaseLabel}
                  activeHauntTitle={activeHauntTitle}
                  showTradeFlowPrompt={shouldShowTradeFlowPrompt}
                  tradeAgreementState={tradeAgreementState}
                  tradeBannerStatusText={tradeBannerStatusText}
                  mummyReward={
                    mummyPendingReward
                      ? {
                          isChooser: isMummyRewardChooser,
                          chooserTargetName: mummyRewardDefenderName,
                          waitingPlayerName: mummyRewardControllerName,
                          damage: mummyPendingReward.damageToHero,
                          unavailableStealTargetCount:
                            mummyUnavailableStealTargetCount,
                        }
                      : null
                  }
                  helpingHandsReward={
                    helpingHandsPendingReward
                      ? {
                          isChooser: isHelpingHandsRewardChooser,
                          chooserTargetName: helpingHandsRewardDefenderName,
                          waitingPlayerName: helpingHandsRewardAttackerName,
                          damage: helpingHandsPendingReward.damageToDefender,
                        }
                      : null
                  }
                  helpingHandsMonsterTurnStatus={
                    shouldShowHelpingHandsMonsterTurnStatus
                      ? {
                          active: helpingHandsMonsterTurnStatus.active,
                          controllerName: helpingHandsMonsterControllerName,
                        }
                      : null
                  }
                  showHelpingHandsTrollAttack={
                    shouldShowHelpingHandsTrollAttackBanner
                  }
                  helpingHandsTrollAttackTargetName={
                    helpingHandsTrollHandAttackTargetName
                  }
                />

                {visibleActionItems.length > 0 &&
                !isEndgameExorciseRollReview &&
                !shouldHideTableChromeForBlockingOverlay &&
                !isPhoneLandscapeLayout ? (
                  <div
                    data-testid="betrayal-action-rail"
                    className="pointer-events-none absolute inset-x-0 bottom-1 z-50 hidden flex-col items-center justify-end gap-0.5 md:flex"
                  >
                    {mummyPendingReward && isMummyRewardChooser ? (
                      <BetrayalMummyRewardActionsSurface
                        variant="desktop"
                        damage={mummyPendingReward.damageToHero}
                        stealableCards={mummyStealableCards}
                        onResolveDamage={() =>
                          handleResolveMummyAttackReward("damage")
                        }
                        onStealCard={(cardId) =>
                          handleResolveMummyAttackReward("steal", cardId)
                        }
                      />
                    ) : null}
                    {helpingHandsPendingReward &&
                    isHelpingHandsRewardChooser ? (
                      <BetrayalHelpingHandsRewardActionsSurface
                        variant="desktop"
                        damage={helpingHandsPendingReward.damageToDefender}
                        stealableCards={helpingHandsStealableCards}
                        onResolveDamage={() =>
                          handleResolveHelpingHandsAttackReward("damage")
                        }
                        onStealCard={(cardId) =>
                          handleResolveHelpingHandsAttackReward("steal", cardId)
                        }
                      />
                    ) : null}
                    {!mummyPendingReward &&
                    !helpingHandsPendingReward &&
                    !pendingTradeAgreement &&
                    !pendingSicknessExchange &&
                    !isDustSicknessExchangeMode &&
                    !activeHauntTargetGuide &&
                    helpingHandsVisibleTrollHandAttackOptions.length > 0 ? (
                      <BetrayalHelpingHandsTrollAttackActionsSurface
                        variant="desktop"
                        attackOptions={
                          helpingHandsVisibleTrollHandAttackOptions
                        }
                        attackTargetsByOptionId={
                          helpingHandsTrollHandAttackTargetsByOptionId
                        }
                        trollHandIds={
                          helpingHandsMonsterTurnStatus.trollHandIds
                        }
                        onAttack={handleHelpingHandsTrollHandAttack}
                      />
                    ) : null}
                    {!pendingTradeAgreement &&
                    !pendingSicknessExchange &&
                    !mummyPendingReward &&
                    !helpingHandsPendingReward &&
                    !isDustSicknessExchangeMode &&
                    !activeHauntTargetGuide &&
                    isTradeDraftActive &&
                    canUseDogTrade &&
                    dogTradeTargets.length > 0 ? (
                      <BetrayalTradeCardSelectorSurface
                        testId="betrayal-dog-trade-selector"
                        currentFlowChoice="dog-trade-give"
                        label={t("board.inventory.dog")}
                        cards={core.currentExplorerInventory.filter(
                          (card) => card.id !== "dog",
                        )}
                        selectedCardIds={selectedDogTradeCardIds}
                        cardTestIdPrefix="betrayal-dog-trade-card"
                        isTradeDraftActive={isTradeDraftActive}
                        rollModifierCardIds={rollModifierCardIds}
                        eventRollBookCardIds={eventRollBookCardIds}
                        isTutorialUseBookActive={
                          isTutorialActive && tutorialStep?.id === "use-book"
                        }
                        deckAssets={ASSETS.deck}
                        traitAssets={ASSETS.trait}
                        locale={effectiveLocale}
                        resolveTradeStatus={(card) =>
                          resolveBetrayalTradeCardStatus(core, card.id, {
                            ownerPlayerId: core.currentExplorer.playerId,
                            ownerRole: "requester",
                            useDogTrade: true,
                          })
                        }
                        onToggleCard={handleToggleDogTradeCard}
                        onUseBookForEventRoll={
                          handleInventoryCardSurfaceEventRollBookUse
                        }
                        onPrimarySelect={
                          handleInventoryCardSurfacePrimarySelect
                        }
                        onPreview={setInventoryPreviewCardId}
                      />
                    ) : null}
                    {!pendingTradeAgreement &&
                    !pendingSicknessExchange &&
                    !mummyPendingReward &&
                    !helpingHandsPendingReward &&
                    !isDustSicknessExchangeMode &&
                    !activeHauntTargetGuide &&
                    isTradeDraftActive &&
                    selectedTradeTarget &&
                    !selectedCorpseLootTarget &&
                    selectedTradeTarget.inventory.length > 0 ? (
                      <BetrayalTradeCardSelectorSurface
                        testId="betrayal-trade-return-selector"
                        currentFlowChoice="trade-return"
                        label={tradeReturnSelectorLabel}
                        cards={selectedTradeTarget.inventory}
                        selectedCardIds={selectedTradeReturnCardIds}
                        cardTestIdPrefix="betrayal-trade-return-card"
                        isTradeDraftActive={isTradeDraftActive}
                        rollModifierCardIds={rollModifierCardIds}
                        eventRollBookCardIds={eventRollBookCardIds}
                        isTutorialUseBookActive={
                          isTutorialActive && tutorialStep?.id === "use-book"
                        }
                        deckAssets={ASSETS.deck}
                        traitAssets={ASSETS.trait}
                        locale={effectiveLocale}
                        resolveTradeStatus={(card) =>
                          resolveBetrayalTradeCardStatus(core, card.id, {
                            ownerPlayerId: selectedTradeTarget.playerId,
                            ownerRole: "target",
                          })
                        }
                        onToggleCard={handleToggleTradeReturnCard}
                        onUseBookForEventRoll={
                          handleInventoryCardSurfaceEventRollBookUse
                        }
                        onPrimarySelect={
                          handleInventoryCardSurfacePrimarySelect
                        }
                        onPreview={setInventoryPreviewCardId}
                      />
                    ) : null}
                    {pendingSicknessExchange ? (
                      <BetrayalSicknessExchangeBannerSurface
                        isPendingForViewer={isPendingSicknessForViewer}
                        isPendingFromViewer={isPendingSicknessFromViewer}
                        instructionText={tradeInstructionText}
                        targetStepText={sicknessExchangeTargetStepText}
                        acceptLabel={t("board.status.sicknessExchangeAccept")}
                        declineLabel={t("board.status.sicknessExchangeDecline")}
                        waitingLabel={t("board.status.tradeStepAgree")}
                        onAccept={() => handleResolveSicknessExchange(true)}
                        onDecline={() => handleResolveSicknessExchange(false)}
                      />
                    ) : null}
                    {shouldShowTradeActionPanel ? (
                      <BetrayalTradeActionPanelSurface
                        instructionText={tradeInstructionText}
                        targetStepText={tradeFlowTargetStepText}
                        showInlineTradeConfirm={shouldShowInlineTradeConfirm}
                        showTradeAgreementActions={Boolean(
                          pendingTradeAgreement && isPendingTradeForViewer,
                        )}
                        requestLabel={t("board.status.tradeFlowRequest")}
                        acceptLabel={t("board.status.tradeAgreementAccept")}
                        declineLabel={t("board.status.tradeAgreementDecline")}
                        onRequest={handleTradeAction}
                        onAccept={() => handleResolveTradeAgreement(true)}
                        onDecline={() => handleResolveTradeAgreement(false)}
                      />
                    ) : null}
                    {visibleActionDisabledReason ? (
                      <div
                        data-testid="betrayal-action-disabled-reason-visible"
                        className="pointer-events-none flex max-w-[520px] items-center gap-2 rounded-[6px] border border-[rgba(240,193,162,0.44)] bg-[rgba(57,30,22,0.78)] px-3 py-1 text-[12px] font-semibold tracking-[0.04em] text-[#f0c1a2] shadow-[0_10px_22px_rgba(0,0,0,0.22)]"
                      >
                        <span>{visibleActionDisabledReason}</span>
                      </div>
                    ) : null}
                    {roomEndTurnEffectHint ? (
                      <div
                        data-testid="betrayal-room-end-turn-effect-hint"
                        className="pointer-events-none flex max-w-[520px] items-center gap-2 rounded-[6px] border border-[#b66b36] bg-[rgba(55,24,15,0.78)] px-3 py-1 text-[12px] font-semibold tracking-[0.04em] text-[#ffd59a] shadow-[0_10px_22px_rgba(0,0,0,0.22)]"
                      >
                        <Hourglass size={15} strokeWidth={2.4} />
                        <span className="text-[#ffe0aa]">
                          {roomEndTurnEffectHint.title}
                        </span>
                        <span className="text-[#eebd82]">
                          {roomEndTurnEffectHint.detail}
                        </span>
                      </div>
                    ) : null}
                    <div className="pointer-events-auto relative flex min-h-[48px] w-full items-end justify-center gap-5">
                      <BetrayalActionDockSurface
                        actions={visibleActionItems}
                        variant="desktop"
                        phase={core.phase}
                        recommendedAction={core.recommendedAction}
                        interactionMode={previewState.interactionMode}
                        hauntActionKind={hauntActionContext?.actionKind}
                        hauntTargetingActionKind={
                          previewState.hauntTargetingActionKind
                        }
                        hasActiveHauntTargetGuide={Boolean(
                          activeHauntTargetGuide,
                        )}
                        hasSelectedInventoryCard={Boolean(
                          selectedInventoryCard,
                        )}
                        hasRoomEndTurnEffect={Boolean(roomEndTurnEffectHint)}
                        isBloodFromStoneSetupPlacementMode={
                          isBloodFromStoneSetupPlacementMode
                        }
                        isDustSicknessExchangeMode={isDustSicknessExchangeMode}
                        isHauntTargetingMode={isHauntTargetingMode}
                        isPhoneLandscapeLayout={isPhoneLandscapeLayout}
                        hideTradeAction={shouldShowInlineTradeConfirm}
                        actionCueText={actionCueText}
                        actionHandlers={actionHandlerMap}
                      />
                    </div>
                  </div>
                ) : null}
              </article>
            </section>

            <section
              data-testid="betrayal-status-rail"
              data-mobile-role={
                shouldShowMobileEventStatusRail
                  ? "pc-isomorphic-status-rail"
                  : undefined
              }
              className={`pointer-events-auto absolute z-40 w-[216px] min-h-0 flex-col gap-2 overflow-y-auto px-1 py-1 md:px-1 ${
                shouldShowMobileEventStatusRail
                  ? "bottom-[76px] right-2 top-8 flex origin-top-right scale-[0.56]"
                  : "bottom-3 right-3 top-3"
              } ${
                shouldShowMobileEventStatusRail
                  ? ""
                  : isPhoneLandscapeLayout ||
                      shouldHideTableChromeForBlockingOverlay
                    ? "hidden"
                    : `flex ${activeHauntTargetGuide ? "opacity-[0.72]" : ""}`
              }`}
            >
              <BetrayalDeckStatusRailSurface
                deckItems={deckItems}
                discardItems={discardItems}
                hauntRisk={hauntRisk}
                hauntRiskTrack={hauntRiskTrack}
                highlightedDeckKind={core.highlightedDeckKind}
                hauntRiskTrackAsset={ASSETS.ui.hauntRiskTrack}
                locale={effectiveLocale}
              />

              <article className="bg-transparent pt-1">
                <BetrayalReferenceQuickActionsSurface
                  showScenarioReferenceButton={
                    !isPhoneLandscapeLayout &&
                    !shouldHideTableChromeForBlockingOverlay
                  }
                  dimScenarioReferenceButton={Boolean(activeHauntTargetGuide)}
                  scenarioReferenceAccessibleLabel={
                    scenarioReferenceAccessibleLabel
                  }
                  scenarioReferenceButtonLabel={scenarioReferenceButtonLabel}
                  currentExplorerRoomId={core.currentExplorer.roomId}
                  onOpenScenarioReference={openScenarioReference}
                  onOpenReferenceCards={openReferenceCards}
                  onFocusSelfRoom={handleFocusSelfRoom}
                />
                <div className="mt-3 hidden xl:block">
                  <div className="flex items-center gap-2">
                    <div className="h-px flex-1 bg-[linear-gradient(90deg,transparent,rgba(196,162,101,0.18))]" />
                    <div className="text-[10px] uppercase tracking-[0.22em] text-[#a89d84]">
                      {t("board.hud.teammatesLabel")}
                    </div>
                  </div>
                  <div className="mt-2 grid gap-1.5">
                    <BetrayalTeammateListSurface
                      variant="sidebar"
                      explorers={core.otherExplorers}
                      rooms={core.rooms}
                      currentExplorerRoomId={core.currentExplorer.roomId}
                      observedExplorerPlayerId={observedExplorer.playerId}
                      activeTradeTargets={activeTradeTargets}
                      corpseLootTargets={corpseLootTargets}
                      dogTradeTargets={dogTradeTargets}
                      dustTargetPlayerIds={dustTargetPlayerIds}
                      magicCameraPhotoTargetPlayerIds={
                        magicCameraPhotoTargetPlayerIds
                      }
                      phantomPhotographerTargetPlayerIds={
                        phantomPhotographerTargetPlayerIds
                      }
                      selectedMonsterAttackTargetPlayerIds={
                        selectedMonsterAttackTargetPlayerIds
                      }
                      helpingHandsTrollHandAttackTargetPlayerIds={
                        helpingHandsTrollHandAttackTargetPlayerIds
                      }
                      heroAttackTargetPlayerIds={heroAttackTargetPlayerIds}
                      knowledgeOfJackPlayerIds={
                        core.scenarioRuntime.knowledgeOfJackPlayerIds
                      }
                      isDustSicknessExchangeMode={isDustSicknessExchangeMode}
                      isHeroAttackTargetingMode={isHeroAttackTargetingMode}
                      isDustAttackTargetingMode={isDustAttackTargetingMode}
                      hauntActionKind={hauntActionContext?.actionKind}
                      hauntActionTargetPlayerId={
                        hauntActionContext?.targetPlayerId
                      }
                      selectedTradeTargetPlayerId={selectedTradeTargetPlayerId}
                      selectedCorpseLootTargetPlayerId={
                        selectedCorpseLootTargetPlayerId
                      }
                      selectedPreviewTradeTargetPlayerId={
                        previewState.selectedTradeTargetPlayerId
                      }
                      selectedDustTargetPlayerId={selectedDustTargetPlayerId}
                      locale={effectiveLocale}
                      matchData={matchData}
                      onSelectTarget={handleSelectExplorerTarget}
                      onObserveExplorer={handleObserveExplorer}
                    />{" "}
                  </div>
                </div>
                <div className="sr-only" data-testid="betrayal-activity-list">
                  {earlierLogEntries.length > 0 ? (
                    earlierLogEntries.map((entry) => (
                      <span key={entry.id}>{entry.text}</span>
                    ))
                  ) : (
                    <span>{t("board.activity.earlierEmpty")}</span>
                  )}
                </div>
              </article>
            </section>
          </main>

          <BetrayalReferenceOverlaySurface
            referenceOpen={referenceOpen}
            scenarioReaderOpen={scenarioReaderOpen}
            isReferenceScenarioOpeningStage={isReferenceScenarioOpeningStage}
            isPhoneLandscapeLayout={isPhoneLandscapeLayout}
            currentReferencePage={currentReferencePage}
            referenceFallbackAsset={ASSETS.playerReference.front}
            effectiveLocale={effectiveLocale}
            scenarioReaderScope={scenarioReaderScope}
            scenarioReaderScopeLabel={scenarioReaderScopeLabel}
            activeHauntCaseLabel={activeHauntCaseLabel}
            activeHauntTitle={activeHauntTitle}
            referenceScenarioSpreadIndex={referenceScenarioSpreadIndex}
            referenceScenarioSpreadCount={referenceScenarioSpreadCount}
            referenceScenarioOpeningSection={referenceScenarioOpeningSection}
            referenceScenarioTurnDirection={referenceScenarioTurnDirection}
            referenceScenarioTurnSnapshot={referenceScenarioTurnSnapshot}
            referenceScenarioLeftPage={referenceScenarioLeftPage}
            referenceScenarioRightPage={referenceScenarioRightPage}
            canTurnReferenceScenarioBack={canTurnReferenceScenarioBack}
            canTurnReferenceScenarioForward={canTurnReferenceScenarioForward}
            onClose={closeReferenceOverlay}
            onToggleReferenceSide={toggleReferenceSide}
            onReferenceScenarioTurn={handleReferenceScenarioTurn}
            onScenarioTurnComplete={handleReferenceScenarioTurnComplete}
          />
          <BetrayalPreviewOverlaySurface
            previewRoom={previewRoom}
            previewRoomVisual={previewRoomVisual}
            previewInventoryCard={previewInventoryCard}
            deckAssets={ASSETS.deck}
            traitAssets={ASSETS.trait}
            locale={effectiveLocale}
            onCloseRoomPreview={() => setRoomPreviewId(null)}
            onCloseInventoryPreview={() => setInventoryPreviewCardId(null)}
          />

          <BetrayalMobileActionRailSurface
            hasActiveHauntTargetGuide={Boolean(activeHauntTargetGuide)}
            isTradeDraftActive={isTradeDraftActive}
            hasPendingSicknessExchange={Boolean(pendingSicknessExchange)}
            hasPendingTradeAgreement={Boolean(pendingTradeAgreement)}
            isDustSicknessExchangeMode={isDustSicknessExchangeMode}
            shouldShowInlineTradeConfirm={shouldShowInlineTradeConfirm}
            isEndgameExorciseRollReview={isEndgameExorciseRollReview}
            isPhoneLandscapeLayout={isPhoneLandscapeLayout}
            pendingEventFocusesMapTarget={pendingEventFocusesMapTarget}
            shouldHideTableChromeForBlockingOverlay={
              shouldHideTableChromeForBlockingOverlay
            }
            selectedInventoryDisplayText={selectedInventoryDisplayText}
            useStatusText={useStatusText}
            selectedCardUseDisabled={Boolean(selectedCardUseDisabled)}
            shouldShowBoardActionStatus={shouldShowBoardActionStatus}
            shouldShowMobileTradeStatus={shouldShowMobileTradeStatus}
            hasSelectedTradeTarget={Boolean(selectedTradeTarget)}
            tradeStatusText={tradeStatusText}
            actionCueText={actionCueText}
            visibleDustProgressItems={visibleDustProgressItems}
            activeHauntCaseLabel={activeHauntCaseLabel}
            activeHauntTitle={activeHauntTitle}
            tradeInstructionText={tradeInstructionText}
            tradeFlowTargetStepText={tradeFlowTargetStepText}
            mummyReward={
              mummyPendingReward
                ? {
                    isChooser: isMummyRewardChooser,
                    damage: mummyPendingReward.damageToHero,
                    stealableCards: mummyStealableCards,
                  }
                : null
            }
            helpingHandsReward={
              helpingHandsPendingReward
                ? {
                    isChooser: isHelpingHandsRewardChooser,
                    damage: helpingHandsPendingReward.damageToDefender,
                    stealableCards: helpingHandsStealableCards,
                  }
                : null
            }
            isPendingSicknessForViewer={isPendingSicknessForViewer}
            isPendingTradeForViewer={isPendingTradeForViewer}
            helpingHandsTrollAttack={
              helpingHandsVisibleTrollHandAttackOptions.length > 0
                ? {
                    attackOptions: helpingHandsVisibleTrollHandAttackOptions,
                    attackTargetsByOptionId:
                      helpingHandsTrollHandAttackTargetsByOptionId,
                    trollHandIds: helpingHandsMonsterTurnStatus.trollHandIds,
                  }
                : null
            }
            scenarioReferenceAccessibleLabel={scenarioReferenceAccessibleLabel}
            scenarioReferenceButtonLabel={scenarioReferenceButtonLabel}
            visibleActionItems={visibleActionItems}
            phase={core.phase}
            recommendedAction={core.recommendedAction}
            interactionMode={previewState.interactionMode}
            hauntActionKind={hauntActionContext?.actionKind}
            hauntTargetingActionKind={previewState.hauntTargetingActionKind}
            hasSelectedInventoryCard={Boolean(selectedInventoryCard)}
            hasRoomEndTurnEffect={Boolean(roomEndTurnEffectHint)}
            isBloodFromStoneSetupPlacementMode={
              isBloodFromStoneSetupPlacementMode
            }
            isHauntTargetingMode={isHauntTargetingMode}
            actionHandlers={actionHandlerMap}
            onTradeAction={handleTradeAction}
            onResolveMummyDamage={() =>
              handleResolveMummyAttackReward("damage")
            }
            onStealMummyCard={(cardId) =>
              handleResolveMummyAttackReward("steal", cardId)
            }
            onResolveHelpingHandsDamage={() =>
              handleResolveHelpingHandsAttackReward("damage")
            }
            onStealHelpingHandsCard={(cardId) =>
              handleResolveHelpingHandsAttackReward("steal", cardId)
            }
            onAcceptSicknessExchange={() => handleResolveSicknessExchange(true)}
            onDeclineSicknessExchange={() =>
              handleResolveSicknessExchange(false)
            }
            onAcceptTradeAgreement={() => handleResolveTradeAgreement(true)}
            onDeclineTradeAgreement={() => handleResolveTradeAgreement(false)}
            onHelpingHandsTrollHandAttack={handleHelpingHandsTrollHandAttack}
            onOpenScenarioReference={openScenarioReference}
            onJumpInventory={() =>
              scrollToSection("betrayal-inventory-section")
            }
            onJumpDecks={() => scrollToSection("betrayal-decks-section")}
          />
        </div>
        {visualTransition ? (
          <BetrayalVisualTransitionLayer
            transition={visualTransition}
            onComplete={finishBetrayalVisualTransition}
          />
        ) : null}
        {core.phase === "endgame" ? (
          <EndgameScreen
            core={core}
            matchData={matchData}
            effectiveLocale={effectiveLocale}
          />
        ) : null}
      </div>
    </UndoProvider>
  );
}
