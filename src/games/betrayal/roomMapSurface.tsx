import React from "react";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ZoomPanViewport } from "../../components/game/framework";
import type { EntityRelation } from "../../engine/primitives";
import type { MatchPlayerInfo } from "../../engine/transport/protocol";
import type {
  BetrayalCore,
  BetrayalExplorerSummary,
  BetrayalMonsterStatusKind,
  BetrayalMonsterSummary,
  BetrayalRoomNode,
  BetrayalRoomPlacementPreview,
  BetrayalRoomTileAdjustmentOption,
} from "./game";
import type { BetrayalAttackLineOfSightSegment } from "./attackLineOfSightPresentation";
import { BetrayalAttackLineOfSightOverlay } from "./attackLineOfSightSurface";
import {
  resolveAttackImpactByPlayerId,
  type BetrayalAttackImpactState,
} from "./attackImpactPresentation";
import { getAllExplorers } from "./explorerReadModel";
import type { BetrayalHauntTokenInstanceSummary } from "./hauntTokenModel";
import type { BetrayalRoomTileVisual } from "./roomAtlas";
import { resolveBetrayalRoomNodeTileVisual } from "./roomAtlas";
import { RoomTileSprite } from "./roomTileSurface";
import {
  FLOOR_TONE,
  resolveRoomTileStyle,
  type RoomCanvasLayout,
} from "./roomMapModel";
import { resolveRoomIdentityPresentation } from "./roomPresentation";
import { BetrayalRoomMarkerLayerSurface } from "./roomMarkerSurface";
import { BetrayalRoomEntityLayerSurface } from "./roomEntityLayerSurface";
import {
  BetrayalRoomPlacementFailureBanner,
  BetrayalRoomPlacementSurface,
} from "./roomPlacementSurface";
import { BetrayalRoomFloorSwitcherSurface } from "./roomFloorSwitcherSurface";

export type BetrayalRoomMapHauntTargetGuide = {
  kind: "room" | "explorer" | "monster";
  roomId: string | null;
  playerId?: string;
  monsterId?: string;
  targetName: string;
  cue: string;
};

export type BetrayalRoomMapMaskTarget = {
  id: string;
  kind: "explorer" | "monster";
  name?: string;
};

type BetrayalRoomMapFocusState = {
  actionKind: string;
  roomId?: string | null;
  label?: string | null;
};

type BetrayalRoomMapHealFeedback = {
  kind: "heal";
  targetName: string | null;
  traitSummary: string;
  traitCount: number;
};

type RoomPlacementOrientationOption =
  BetrayalRoomPlacementPreview["orientationOptions"][number];

export interface BetrayalRoomMapSurfaceProps {
  core: BetrayalCore;
  locale: string;
  matchData?: MatchPlayerInfo[];
  roomGridRef: React.Ref<HTMLDivElement>;
  selectedFloor: BetrayalRoomNode["floor"];
  visibleRooms: readonly BetrayalRoomNode[];
  roomCanvasLayout: RoomCanvasLayout;
  roomCanvasTransformStyle: React.CSSProperties;
  roomCanvasWidth: number;
  roomCanvasHeight: number;
  isPhoneLandscapeLayout: boolean;
  isHauntTargetingMode: boolean;
  roomFocusPanTarget: string | null;
  attackLineOfSightSegments: readonly BetrayalAttackLineOfSightSegment[];
  roomOccupants: Readonly<Record<string, readonly BetrayalExplorerSummary[]>>;
  roomMonsters: Readonly<Record<string, readonly BetrayalMonsterSummary[]>>;
  visibleHauntTokensByRoomId: ReadonlyMap<
    string,
    readonly BetrayalHauntTokenInstanceSummary[]
  >;
  movingGirlTokenId: string | null;
  movingExplorerPlayerId: string | null;
  movingMonsterId: string | null;
  activeHauntTargetGuide: BetrayalRoomMapHauntTargetGuide | null;
  hauntActionKind: string | null | undefined;
  canPickUpMummyGirlRoomId: string | null;
  moveTargetRoomIds: ReadonlySet<string>;
  skeletonKeyMoveTargetRoomIds: ReadonlySet<string>;
  explorableRoomSlotIds: ReadonlySet<string>;
  interactionMode: string;
  selectedInventoryUseEffectMode: string | null;
  inventoryTargetRooms: readonly BetrayalRoomNode[];
  selectedInventoryTargetRoomId: string | null;
  pendingEventTargetRooms: readonly BetrayalRoomNode[];
  selectedEventTargetRoomId: string | null;
  maskTargetRooms: readonly BetrayalRoomNode[];
  maskTargetTokens: readonly BetrayalRoomMapMaskTarget[];
  activeMaskTargetTokenId: string | null;
  selectedMaskTargetRoomIdsByTokenId: Readonly<
    Record<string, string | null | undefined>
  >;
  isDynamiteRoomTargetingMode: boolean;
  dynamiteTargetRoomIds: ReadonlySet<string>;
  isHelpingHandsTrollHandMoveMode: boolean;
  helpingHandsTrollMoveTargetRoomIds: ReadonlySet<string> | null;
  helpingHandsTrollMoveMonsterName: string | null;
  isMonsterMoveMode: boolean;
  monsterMoveTargetRoomIds: ReadonlySet<string> | null;
  monsterMoveMonsterName: string | null;
  isBloodFromStoneSetupPlacementMode: boolean;
  bloodFromStoneSetupCandidateRoomIds: ReadonlySet<string>;
  selectedBloodFromStoneStoneCherubRoomIds: readonly string[];
  bloodFromStoneSetupPlacementCountByRoomId: ReadonlyMap<string, number>;
  bloodFromStoneSetupPendingPlayerChoiceCount: number;
  pendingRoomPlacementPreview: BetrayalRoomPlacementPreview | null;
  pendingEventFocusesMapTarget: boolean;
  tutorialMapTargetRoomId: string | null;
  tutorialHighlightTarget?: string | null;
  roomFocusState: BetrayalRoomMapFocusState | null;
  isTradeOrLootTargetSelectionActive: boolean;
  activeTradeTargets: readonly BetrayalExplorerSummary[];
  corpseLootTargets: readonly BetrayalExplorerSummary[];
  healTargetExplorers: readonly BetrayalExplorerSummary[];
  dustTargetPlayerIds: ReadonlySet<string>;
  magicCameraPhotoTargetPlayerIds: ReadonlySet<string>;
  helpingHandsTrollHandAttackTargetPlayerIds: ReadonlySet<string>;
  selectedMonsterAttackTargetPlayerIds: ReadonlySet<string>;
  heroAttackTargetPlayerIds: ReadonlySet<string>;
  isDustAttackTargetingMode: boolean;
  isDustSicknessExchangeMode: boolean;
  isHeroAttackTargetingMode: boolean;
  selectedTradeTargetPlayerId: string | null;
  selectedCorpseLootTargetPlayerId: string | null;
  selectedInventoryTargetPlayerId: string | null;
  selectedPreviewTradeTargetPlayerId: string | null;
  selectedDustTargetPlayerId: string | null;
  visibleFeedback: BetrayalRoomMapHealFeedback | null;
  helpingHandsMovableTrollHandIds: ReadonlySet<string>;
  monsterMovableIds: ReadonlySet<string>;
  isMonsterAttackMode: boolean;
  monsterAttackableIds: ReadonlySet<string>;
  isBloodFromStonePeekabooMode: boolean;
  bloodFromStonePeekabooSameRoomMonsterIds: ReadonlySet<string>;
  bloodFromStonePeekabooLineOfSightMonsterIds: ReadonlySet<string>;
  selectedMonsterAttackSourceId: string | null;
  selectedPeekabooSameRoomMonsterId: string | null;
  monsterStatusById: ReadonlyMap<string, BetrayalMonsterStatusKind>;
  resolveMonsterRelationToExplorer: (
    monsterId: string,
    playerId: string,
  ) => EntityRelation | undefined;
  attackImpactPresentationKey: string | null;
  pendingRoomPlacementFailureText: string | null;
  selectedRoomOrientationOption: RoomPlacementOrientationOption | null;
  selectedRoomOrientationTurns: number;
  pendingRoomPlacementVisual: BetrayalRoomTileVisual | null;
  pendingRoomPlacementAdjustmentText: string | null;
  pendingRoomTileAdjustmentOptions: readonly BetrayalRoomTileAdjustmentOption[];
  selectedRoomTileAdjustmentOption: BetrayalRoomTileAdjustmentOption | null;
  upperFloor: BetrayalRoomNode["floor"] | null;
  lowerFloor: BetrayalRoomNode["floor"] | null;
  upperFloorHasSelectionTarget: boolean;
  lowerFloorHasSelectionTarget: boolean;
  hasCrossFloorMoveTargets: boolean;
  hasCrossFloorRoomSelectionTargets: boolean;
  hiddenTableChrome: boolean;
  onSelectEventTargetRoom: (roomId: string) => void;
  onSelectBloodFromStoneSetupPlacementRoom: (roomId: string) => void;
  onSelectInventoryTargetRoom: (roomId: string) => void;
  onSelectMaskTargetRoom: (tokenId: string, roomId: string) => void;
  onDynamiteRoomAttack: (roomId: string) => void;
  onMoveHelpingHandsTrollHandToRoom: (roomId: string) => void;
  onMoveMonsterToRoom: (roomId: string) => void;
  onSelectRoomFocusAction: () => void;
  onPrepareExploreRoom: (roomId: string) => void;
  onMoveToRoom: (roomId: string) => void;
  onOpenRoomPreview: (roomId: string) => void;
  onSelectExplorerTarget: (explorer: BetrayalExplorerSummary) => void;
  onOpenExplorerDetails: (playerId: string) => void;
  onSelectMonsterTarget: (monsterId: string) => void;
  onSelectHelpingHandsTrollHandMoveMonster: (monsterId: string) => void;
  onSelectMonsterMoveMonster: (monsterId: string) => void;
  onSelectMonsterAttackMonster: (monsterId: string) => void;
  onOpenMonsterDetails: (monsterId: string) => void;
  onPickUpMummyGirl: () => void;
  onRotateRoomPlacement: (direction: 1 | -1) => void;
  onCancelRoomPlacement: () => void;
  onConfirmRoomPlacement: () => void;
  onSelectRoomTileAdjustment: (
    option: BetrayalRoomTileAdjustmentOption,
  ) => void;
  onSelectFloor: (floor: BetrayalRoomNode["floor"]) => void;
}

export function BetrayalRoomMapSurface({
  core,
  locale,
  matchData,
  roomGridRef,
  selectedFloor,
  visibleRooms,
  roomCanvasLayout,
  roomCanvasTransformStyle,
  roomCanvasWidth,
  roomCanvasHeight,
  isPhoneLandscapeLayout,
  isHauntTargetingMode,
  roomFocusPanTarget,
  attackLineOfSightSegments,
  roomOccupants,
  roomMonsters,
  visibleHauntTokensByRoomId,
  movingGirlTokenId,
  movingExplorerPlayerId,
  movingMonsterId,
  activeHauntTargetGuide,
  hauntActionKind,
  canPickUpMummyGirlRoomId,
  moveTargetRoomIds,
  skeletonKeyMoveTargetRoomIds,
  explorableRoomSlotIds,
  interactionMode,
  selectedInventoryUseEffectMode,
  inventoryTargetRooms,
  selectedInventoryTargetRoomId,
  pendingEventTargetRooms,
  selectedEventTargetRoomId,
  maskTargetRooms,
  maskTargetTokens,
  activeMaskTargetTokenId,
  selectedMaskTargetRoomIdsByTokenId,
  isDynamiteRoomTargetingMode,
  dynamiteTargetRoomIds,
  isHelpingHandsTrollHandMoveMode,
  helpingHandsTrollMoveTargetRoomIds,
  helpingHandsTrollMoveMonsterName,
  isMonsterMoveMode,
  monsterMoveTargetRoomIds,
  monsterMoveMonsterName,
  isBloodFromStoneSetupPlacementMode,
  bloodFromStoneSetupCandidateRoomIds,
  selectedBloodFromStoneStoneCherubRoomIds,
  bloodFromStoneSetupPlacementCountByRoomId,
  bloodFromStoneSetupPendingPlayerChoiceCount,
  pendingRoomPlacementPreview,
  pendingEventFocusesMapTarget,
  tutorialMapTargetRoomId,
  tutorialHighlightTarget,
  roomFocusState,
  isTradeOrLootTargetSelectionActive,
  activeTradeTargets,
  corpseLootTargets,
  healTargetExplorers,
  dustTargetPlayerIds,
  magicCameraPhotoTargetPlayerIds,
  helpingHandsTrollHandAttackTargetPlayerIds,
  selectedMonsterAttackTargetPlayerIds,
  heroAttackTargetPlayerIds,
  isDustAttackTargetingMode,
  isDustSicknessExchangeMode,
  isHeroAttackTargetingMode,
  selectedTradeTargetPlayerId,
  selectedCorpseLootTargetPlayerId,
  selectedInventoryTargetPlayerId,
  selectedPreviewTradeTargetPlayerId,
  selectedDustTargetPlayerId,
  visibleFeedback,
  helpingHandsMovableTrollHandIds,
  monsterMovableIds,
  isMonsterAttackMode,
  monsterAttackableIds,
  isBloodFromStonePeekabooMode,
  bloodFromStonePeekabooSameRoomMonsterIds,
  bloodFromStonePeekabooLineOfSightMonsterIds,
  selectedMonsterAttackSourceId,
  selectedPeekabooSameRoomMonsterId,
  monsterStatusById,
  resolveMonsterRelationToExplorer,
  attackImpactPresentationKey,
  pendingRoomPlacementFailureText,
  selectedRoomOrientationOption,
  selectedRoomOrientationTurns,
  pendingRoomPlacementVisual,
  pendingRoomPlacementAdjustmentText,
  pendingRoomTileAdjustmentOptions,
  selectedRoomTileAdjustmentOption,
  upperFloor,
  lowerFloor,
  upperFloorHasSelectionTarget,
  lowerFloorHasSelectionTarget,
  hasCrossFloorMoveTargets,
  hasCrossFloorRoomSelectionTargets,
  hiddenTableChrome,
  onSelectEventTargetRoom,
  onSelectBloodFromStoneSetupPlacementRoom,
  onSelectInventoryTargetRoom,
  onSelectMaskTargetRoom,
  onDynamiteRoomAttack,
  onMoveHelpingHandsTrollHandToRoom,
  onMoveMonsterToRoom,
  onSelectRoomFocusAction,
  onPrepareExploreRoom,
  onMoveToRoom,
  onOpenRoomPreview,
  onSelectExplorerTarget,
  onOpenExplorerDetails,
  onSelectMonsterTarget,
  onSelectHelpingHandsTrollHandMoveMonster,
  onSelectMonsterMoveMonster,
  onSelectMonsterAttackMonster,
  onOpenMonsterDetails,
  onPickUpMummyGirl,
  onRotateRoomPlacement,
  onCancelRoomPlacement,
  onConfirmRoomPlacement,
  onSelectRoomTileAdjustment,
  onSelectFloor,
}: BetrayalRoomMapSurfaceProps) {
  const { t } = useTranslation("game-betrayal");
  const attackImpactByPlayerId = React.useMemo(
    () =>
      attackImpactPresentationKey
        ? resolveAttackImpactByPlayerId(core, getAllExplorers(core))
        : new Map<string, BetrayalAttackImpactState>(),
    [attackImpactPresentationKey, core],
  );

  return (
    <div className="relative min-h-0 flex-1">
      <ZoomPanViewport
        key={selectedFloor}
        ref={roomGridRef}
        className={`relative h-full min-h-0 w-full bg-transparent ${
          isPhoneLandscapeLayout
            ? "mx-auto grid max-w-none place-items-center"
            : "pt-[72px] pb-[72px]"
        }`}
        contentClassName={`relative ${
          isPhoneLandscapeLayout ? "mx-auto" : "mx-auto"
        }`}
        containerTestId="betrayal-room-grid"
        contentTestId="betrayal-room-canvas"
        scaleTestId="betrayal-room-map-scale"
        initialScale={1}
        minScale={0.55}
        maxScale={2.4}
        panToTarget={
          roomFocusPanTarget ??
          (isPhoneLandscapeLayout
            ? `betrayal-room-${core.currentExplorer.roomId}`
            : null)
        }
        panToScale={isPhoneLandscapeLayout ? 1 : undefined}
        panBoundsMode="free"
        dragBoundsPaddingRatioY={0.18}
        containerProps={{
          "data-haunt-targeting-mode": isHauntTargetingMode ? "true" : "false",
          "data-room-focus-pan-target": roomFocusPanTarget ?? "",
        }}
        interactionDisabled={isHauntTargetingMode}
        contentStyle={roomCanvasTransformStyle}
        ariaLabel={t("board.sections.rooms")}
      >
        <BetrayalAttackLineOfSightOverlay
          segments={attackLineOfSightSegments}
          width={roomCanvasWidth}
          height={roomCanvasHeight}
        />
        {visibleRooms.map((room) => {
          const tone = FLOOR_TONE[room.floor];
          const isActive = room.id === core.activeRoomId;
          const occupants = roomOccupants[room.id] ?? [];
          const monsters = roomMonsters[room.id] ?? [];
          const visibleHauntRoomTokens = (
            visibleHauntTokensByRoomId.get(room.id) ?? []
          ).filter((token) => token.id !== movingGirlTokenId);
          const visibleGirlToken = visibleHauntRoomTokens.find(
            (token) => token.id === "mummy-girl-token",
          );
          const visibleRoomHauntTokens = visibleHauntRoomTokens.filter(
            (token) => token.id !== "mummy-girl-token",
          );
          const canPickUpMummyGirl =
            visibleGirlToken?.status === "placed" &&
            canPickUpMummyGirlRoomId === room.id;
          const isDiscovered = room.state === "discovered";
          const isReachableRoom = moveTargetRoomIds.has(room.id);
          const isSkeletonKeyMoveTarget =
            skeletonKeyMoveTargetRoomIds.has(room.id);
          const isMoveTarget =
            interactionMode === "move" && moveTargetRoomIds.has(room.id);
          const isHelpingHandsTrollMoveTarget = Boolean(
            isHelpingHandsTrollHandMoveMode &&
              helpingHandsTrollMoveTargetRoomIds?.has(room.id),
          );
          const isMonsterMoveTarget = Boolean(
            isMonsterMoveMode && monsterMoveTargetRoomIds?.has(room.id),
          );
          const isExploreTarget =
            interactionMode === "explore" && explorableRoomSlotIds.has(room.id);
          const isInventoryTargetRoom =
            selectedInventoryUseEffectMode === "placeExplorer" &&
            inventoryTargetRooms.some((targetRoom) => targetRoom.id === room.id);
          const isSelectedInventoryTargetRoom =
            isInventoryTargetRoom && selectedInventoryTargetRoomId === room.id;
          const isEventChoiceTargetRoom = pendingEventTargetRooms.some(
            (targetRoom) => targetRoom.id === room.id,
          );
          const isSelectedEventChoiceTargetRoom =
            isEventChoiceTargetRoom && selectedEventTargetRoomId === room.id;
          const isMaskTargetRoom =
            selectedInventoryUseEffectMode === "moveOthersInRoom" &&
            maskTargetRooms.some((targetRoom) => targetRoom.id === room.id);
          const activeMaskTargetRoomId = activeMaskTargetTokenId
            ? selectedMaskTargetRoomIdsByTokenId[activeMaskTargetTokenId]
            : null;
          const isSelectedActiveMaskTargetRoom =
            isMaskTargetRoom && activeMaskTargetRoomId === room.id;
          const canSelectInventoryRoom = isInventoryTargetRoom;
          const canSelectEventRoom = isEventChoiceTargetRoom;
          const canSelectMaskRoom =
            Boolean(activeMaskTargetTokenId) && isMaskTargetRoom;
          const isDynamiteTargetRoom =
            isDynamiteRoomTargetingMode && dynamiteTargetRoomIds.has(room.id);
          const canSelectDynamiteRoom = isDynamiteTargetRoom;
          const canMoveToRoom =
            interactionMode === "move" &&
            isDiscovered &&
            !isActive &&
            core.movesRemaining > 0 &&
            isReachableRoom;
          const canMoveHelpingHandsTrollHandToRoom =
            isDiscovered && isHelpingHandsTrollMoveTarget;
          const canMoveMonsterToRoom = isDiscovered && isMonsterMoveTarget;
          const isBloodFromStoneSetupPlacementTarget =
            isBloodFromStoneSetupPlacementMode &&
            bloodFromStoneSetupCandidateRoomIds.has(room.id);
          const bloodFromStoneSetupPlacementCountForRoom =
            bloodFromStoneSetupPlacementCountByRoomId.get(room.id) ?? 0;
          const canSelectBloodFromStoneSetupPlacementRoom =
            isBloodFromStoneSetupPlacementTarget &&
            selectedBloodFromStoneStoneCherubRoomIds.length <
              bloodFromStoneSetupPendingPlayerChoiceCount;
          const isPendingRoomPlacementSlot =
            pendingRoomPlacementPreview?.slotId === room.id;
          const canExploreRoom =
            isExploreTarget && !pendingRoomPlacementPreview;
          const canSelectRoomFocusAction =
            !isHelpingHandsTrollHandMoveMode &&
            !isMonsterMoveMode &&
            !isBloodFromStoneSetupPlacementMode &&
            roomFocusState?.actionKind === "use" &&
            roomFocusState.roomId === room.id;
          const isHauntTargetRoom = activeHauntTargetGuide?.roomId === room.id;
          const shouldDimForHauntTargetGuide = Boolean(
            activeHauntTargetGuide && !isHauntTargetRoom,
          );
          const canSelectRoom =
            canSelectEventRoom ||
            canSelectInventoryRoom ||
            canSelectMaskRoom ||
            canSelectDynamiteRoom ||
            canSelectBloodFromStoneSetupPlacementRoom ||
            canSelectRoomFocusAction ||
            canMoveHelpingHandsTrollHandToRoom ||
            canMoveMonsterToRoom ||
            canMoveToRoom ||
            canExploreRoom;
          const isRoomSelectionTarget =
            canSelectEventRoom ||
            canSelectInventoryRoom ||
            canSelectMaskRoom ||
            canSelectDynamiteRoom ||
            canMoveHelpingHandsTrollHandToRoom ||
            canMoveMonsterToRoom;
          const roomTileVisual = resolveBetrayalRoomNodeTileVisual(
            room,
            isDiscovered,
          );
          const identityPresentation = resolveRoomIdentityPresentation(room, {
            isDiscovered,
            isExploreTarget,
            t,
          });
          const note = isDiscovered
            ? room.hint
            : isExploreTarget
              ? t("board.rooms.slotReady")
              : t("board.rooms.slotUndiscovered");

          return (
            <div
              key={room.id}
              data-testid={`betrayal-room-shell-${room.id}`}
              data-zoom-pan-target={`betrayal-room-${room.id}`}
              className="group absolute overflow-visible"
              style={{
                ...resolveRoomTileStyle(room, roomCanvasLayout),
                zIndex: isHauntTargetRoom
                  ? 36
                  : isRoomSelectionTarget ||
                      canSelectRoomFocusAction ||
                      isHelpingHandsTrollMoveTarget ||
                      isMonsterMoveTarget ||
                      isBloodFromStoneSetupPlacementTarget ||
                      isMoveTarget ||
                      isExploreTarget ||
                      isPendingRoomPlacementSlot
                    ? 30
                    : isActive
                      ? 25
                      : isReachableRoom
                        ? 20
                        : 1,
              }}
            >
              <button
                type="button"
                onPointerDown={(event) => {
                  if (canSelectRoom) {
                    event.stopPropagation();
                  }
                }}
                onPointerUp={(event) => {
                  if (canSelectRoom) {
                    event.stopPropagation();
                  }
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  if (canSelectEventRoom) {
                    onSelectEventTargetRoom(room.id);
                    return;
                  }
                  if (canSelectBloodFromStoneSetupPlacementRoom) {
                    onSelectBloodFromStoneSetupPlacementRoom(room.id);
                    return;
                  }
                  if (canSelectInventoryRoom) {
                    onSelectInventoryTargetRoom(room.id);
                    return;
                  }
                  if (canSelectMaskRoom && activeMaskTargetTokenId) {
                    onSelectMaskTargetRoom(activeMaskTargetTokenId, room.id);
                    return;
                  }
                  if (canSelectDynamiteRoom) {
                    onDynamiteRoomAttack(room.id);
                    return;
                  }
                  if (canMoveHelpingHandsTrollHandToRoom) {
                    onMoveHelpingHandsTrollHandToRoom(room.id);
                    return;
                  }
                  if (canMoveMonsterToRoom) {
                    onMoveMonsterToRoom(room.id);
                    return;
                  }
                  if (canSelectRoomFocusAction) {
                    onSelectRoomFocusAction();
                    return;
                  }
                  if (canExploreRoom) {
                    onPrepareExploreRoom(room.id);
                    return;
                  }
                  if (canMoveToRoom) {
                    onMoveToRoom(room.id);
                  }
                }}
                disabled={!canSelectRoom}
                data-testid={`betrayal-room-${room.id}`}
                data-haunt-target-room={isHauntTargetRoom ? "true" : undefined}
                data-haunt-target-dimmed={
                  shouldDimForHauntTargetGuide ? "true" : undefined
                }
                data-direct-target={
                  canSelectRoomFocusAction ||
                  canSelectBloodFromStoneSetupPlacementRoom ||
                  canSelectDynamiteRoom ||
                  canMoveHelpingHandsTrollHandToRoom ||
                  canMoveMonsterToRoom
                    ? "true"
                    : undefined
                }
                data-direct-action={
                  canSelectRoomFocusAction
                    ? "room-focus"
                    : canSelectBloodFromStoneSetupPlacementRoom
                      ? "blood-from-stone-setup-placement"
                      : canSelectDynamiteRoom
                        ? "dynamite-room"
                        : canMoveHelpingHandsTrollHandToRoom
                          ? "helping-hands-troll-move"
                          : canMoveMonsterToRoom
                            ? "monster-move"
                            : undefined
                }
                data-tutorial-id={
                  tutorialMapTargetRoomId === room.id
                    ? tutorialHighlightTarget
                    : undefined
                }
                title={
                  isDynamiteTargetRoom ? `炸药目标：${room.name}` : note
                }
                className="relative h-full w-full overflow-visible rounded-[4px] border p-0 text-left transition duration-200 disabled:cursor-default"
                style={{
                  borderColor: isHelpingHandsTrollMoveTarget
                    ? "rgba(159, 225, 167, 0.96)"
                    : isBloodFromStoneSetupPlacementTarget
                      ? "rgba(74, 222, 128, 0.96)"
                      : isMonsterMoveTarget
                        ? "rgba(159, 225, 167, 0.96)"
                        : isDynamiteTargetRoom
                          ? "rgba(74, 222, 128, 0.96)"
                          : isMoveTarget
                            ? "rgba(118, 189, 153, 0.92)"
                            : isPendingRoomPlacementSlot
                              ? "rgba(74, 222, 128, 0.96)"
                              : isHauntTargetRoom
                                ? "rgba(74, 222, 128, 0.62)"
                                : canSelectRoomFocusAction
                                  ? "rgba(134, 239, 172, 0.96)"
                                  : isSelectedInventoryTargetRoom ||
                                      isSelectedEventChoiceTargetRoom ||
                                      isSelectedActiveMaskTargetRoom
                                    ? "rgba(34, 197, 94, 0.96)"
                                    : isRoomSelectionTarget
                                      ? "rgba(34, 197, 94, 0.68)"
                                      : isReachableRoom
                                        ? "rgba(96, 155, 125, 0.42)"
                                        : isExploreTarget
                                          ? "rgba(34, 197, 94, 0.20)"
                                          : "rgba(0, 0, 0, 0)",
                  backgroundColor: "transparent",
                  boxShadow: isActive
                    ? "0 0 16px rgba(105,174,128,0.14), 0 12px 22px rgba(0,0,0,0.22)"
                    : isHauntTargetRoom
                      ? "0 0 0 2px rgba(34,197,94,0.42), 0 0 20px rgba(34,197,94,0.28), 0 10px 18px rgba(0,0,0,0.18)"
                      : canSelectRoomFocusAction
                        ? "0 0 0 3px rgba(74,222,128,0.62), 0 0 28px rgba(34,197,94,0.48), 0 8px 16px rgba(0,0,0,0.18)"
                        : isHelpingHandsTrollMoveTarget
                          ? "0 0 0 3px rgba(159,225,167,0.58), 0 0 26px rgba(159,225,167,0.46), 0 8px 16px rgba(0,0,0,0.18)"
                          : isBloodFromStoneSetupPlacementTarget
                            ? "0 0 0 3px rgba(74,222,128,0.62), 0 0 28px rgba(34,197,94,0.48), 0 8px 16px rgba(0,0,0,0.18)"
                            : isMonsterMoveTarget
                              ? "0 0 0 3px rgba(159,225,167,0.58), 0 0 26px rgba(159,225,167,0.46), 0 8px 16px rgba(0,0,0,0.18)"
                              : isDynamiteTargetRoom
                                ? "0 0 0 3px rgba(74,222,128,0.62), 0 0 28px rgba(34,197,94,0.48), 0 8px 16px rgba(0,0,0,0.18)"
                                : isMoveTarget
                                  ? "0 0 0 3px rgba(118,189,153,0.52), 0 0 22px rgba(118,189,153,0.40), 0 8px 16px rgba(0,0,0,0.18)"
                                  : isSelectedInventoryTargetRoom ||
                                      isSelectedEventChoiceTargetRoom ||
                                      isSelectedActiveMaskTargetRoom
                                    ? "0 0 0 3px rgba(74,222,128,0.62), 0 0 28px rgba(34,197,94,0.48), 0 8px 16px rgba(0,0,0,0.18)"
                                    : isRoomSelectionTarget
                                      ? "0 0 0 2px rgba(74,222,128,0.48), 0 0 22px rgba(34,197,94,0.34), 0 8px 16px rgba(0,0,0,0.16)"
                                      : isReachableRoom
                                        ? "0 0 0 2px rgba(96,155,125,0.46), 0 0 18px rgba(96,155,125,0.24), 0 8px 16px rgba(0,0,0,0.16)"
                                        : isPendingRoomPlacementSlot
                                          ? "0 0 0 3px rgba(74,222,128,0.62), 0 0 28px rgba(34,197,94,0.48), 0 8px 16px rgba(0,0,0,0.18)"
                                          : isExploreTarget
                                            ? "0 0 0 2px rgba(74,222,128,0.48), 0 0 22px rgba(34,197,94,0.34), 0 8px 16px rgba(0,0,0,0.16)"
                                            : "0 8px 16px rgba(0,0,0,0.14)",
                  opacity: !isDiscovered
                    ? shouldDimForHauntTargetGuide
                      ? 0.58
                      : 1
                    : shouldDimForHauntTargetGuide
                      ? 0.62
                      : isActive ||
                          isHauntTargetRoom ||
                          canSelectRoomFocusAction ||
                          isBloodFromStoneSetupPlacementTarget ||
                          isHelpingHandsTrollMoveTarget ||
                          isMonsterMoveTarget ||
                          isDynamiteTargetRoom ||
                          isMoveTarget ||
                          isRoomSelectionTarget ||
                          isReachableRoom ||
                          isExploreTarget
                        ? 1
                        : 0.92,
                  filter: shouldDimForHauntTargetGuide
                    ? "saturate(0.70) brightness(0.76)"
                    : isHauntTargetRoom
                      ? "saturate(1.08) brightness(1.04)"
                      : undefined,
                }}
              >
                <div className="pointer-events-none absolute -inset-0.5 -z-10 rounded-[6px] bg-[rgba(0,0,0,0.12)] blur-[1px]" />
                <RoomTileSprite
                  visual={roomTileVisual}
                  locale={locale}
                  alt=""
                  className={`pointer-events-none absolute inset-0 rounded-[3px] bg-[#15110d] ${
                    isDiscovered ? "opacity-95" : "opacity-82"
                  }`}
                />
                <div
                  className={`pointer-events-none absolute inset-0 rounded-[3px] ${
                    isActive
                      ? "bg-[radial-gradient(circle_at_50%_42%,rgba(126,189,145,0.12),transparent_58%),linear-gradient(180deg,rgba(6,11,9,0.02),rgba(4,7,6,0.24))]"
                      : isHelpingHandsTrollMoveTarget
                        ? "bg-[radial-gradient(circle_at_50%_42%,rgba(159,225,167,0.16),transparent_58%)]"
                        : isMonsterMoveTarget
                          ? "bg-[radial-gradient(circle_at_50%_42%,rgba(159,225,167,0.16),transparent_58%)]"
                          : isDynamiteTargetRoom
                            ? "bg-[radial-gradient(circle_at_50%_42%,rgba(34,197,94,0.14),transparent_58%)]"
                            : isMoveTarget
                              ? "bg-[radial-gradient(circle_at_50%_42%,rgba(118,189,153,0.10),transparent_58%)]"
                              : isReachableRoom
                                ? "bg-[radial-gradient(circle_at_50%_42%,rgba(96,155,125,0.07),transparent_58%)]"
                                : "bg-[linear-gradient(180deg,rgba(3,6,5,0.02),rgba(3,5,5,0.16))]"
                  }`}
                />
                {isRoomSelectionTarget ? (
                  <span
                    data-testid={
                      isEventChoiceTargetRoom
                        ? `betrayal-room-event-choice-target-${room.id}`
                        : isInventoryTargetRoom
                          ? `betrayal-room-inventory-target-card-highlight-${room.id}`
                          : isDynamiteTargetRoom
                            ? `betrayal-room-dynamite-target-card-highlight-${room.id}`
                            : `betrayal-room-mask-target-card-highlight-${room.id}`
                    }
                    data-event-target-selected={
                      isEventChoiceTargetRoom
                        ? isSelectedEventChoiceTargetRoom
                          ? "true"
                          : "false"
                        : undefined
                    }
                    data-highlight-layer-count="1"
                    data-highlight-style="solid"
                    className={`pointer-events-none absolute inset-0 z-30 rounded-[4px] border-[3px] bg-[rgba(34,197,94,0.07)] ${
                      isSelectedInventoryTargetRoom ||
                      isSelectedEventChoiceTargetRoom ||
                      isSelectedActiveMaskTargetRoom
                        ? "border-[#bbf7d0]"
                        : "border-[#4ade80]"
                    }`}
                  />
                ) : null}
                {canSelectRoomFocusAction ? (
                  <span
                    data-testid={`betrayal-room-focus-card-highlight-${room.id}`}
                    data-highlight-shape="room"
                    data-highlight-layer-count="1"
                    data-highlight-style="solid"
                    className="pointer-events-none absolute inset-0 z-30 rounded-[4px] border-[3px] border-[#86efac] bg-[rgba(34,197,94,0.07)]"
                  />
                ) : null}
                {canExploreRoom ? (
                  <span
                    data-testid={`betrayal-room-explore-card-highlight-${room.id}`}
                    data-highlight-layer-count="1"
                    data-highlight-style="solid"
                    className="pointer-events-none absolute inset-0 z-20 rounded-[4px] border-[3px] border-[#4ade80] bg-[rgba(34,197,94,0.07)]"
                  />
                ) : null}
                {identityPresentation ? (
                  <div
                    data-testid={`betrayal-room-stripe-${room.id}`}
                    className={`absolute left-2 top-2 h-5 w-1.5 border border-white/10 ${identityPresentation.tone.stripe} ${
                      canExploreRoom ? "hidden" : ""
                    }`}
                  />
                ) : null}
                <div className="pointer-events-none absolute inset-0 rounded-[3px] ring-1 ring-inset ring-[rgba(222,192,133,0.05)]" />
                <div className="sr-only">
                  <span>{room.name}</span>
                  <span>{tone.label}</span>
                  {identityPresentation ? (
                    <span data-testid={`betrayal-room-identity-${room.id}`}>
                      {identityPresentation.label}
                    </span>
                  ) : null}
                  {isActive ? <span>{t("board.rooms.active")}</span> : null}
                </div>
                <BetrayalRoomMarkerLayerSurface
                  roomId={room.id}
                  markerTokens={room.markerTokens}
                  hauntTokens={visibleRoomHauntTokens}
                  locale={locale}
                />
              </button>

              <BetrayalRoomEntityLayerSurface
                roomId={room.id}
                occupants={occupants}
                monsters={monsters}
                visibleGirlToken={visibleGirlToken}
                canSelectRoom={canSelectRoom}
                canPickUpMummyGirl={canPickUpMummyGirl}
                currentExplorerPlayerId={core.currentExplorer.playerId}
                traitorPlayerId={core.scenarioRuntime.traitorPlayerId}
                mummyMonsterId={core.scenarioRuntime.mummy?.mummyMonsterId}
                activeHauntTargetGuide={activeHauntTargetGuide}
                hauntActionKind={hauntActionKind}
                selectedInventoryUseEffectMode={selectedInventoryUseEffectMode}
                maskTargetTokens={maskTargetTokens}
                isTradeOrLootTargetSelectionActive={
                  isTradeOrLootTargetSelectionActive
                }
                activeTradeTargets={activeTradeTargets}
                corpseLootTargets={corpseLootTargets}
                healTargetExplorers={healTargetExplorers}
                dustTargetPlayerIds={dustTargetPlayerIds}
                magicCameraPhotoTargetPlayerIds={magicCameraPhotoTargetPlayerIds}
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
                selectedInventoryTargetPlayerId={selectedInventoryTargetPlayerId}
                activeMaskTargetTokenId={activeMaskTargetTokenId}
                selectedPreviewTradeTargetPlayerId={
                  selectedPreviewTradeTargetPlayerId
                }
                selectedDustTargetPlayerId={selectedDustTargetPlayerId}
                visibleFeedback={visibleFeedback}
                movingExplorerPlayerId={movingExplorerPlayerId}
                isHauntTargetRoom={isHauntTargetRoom}
                isHelpingHandsTrollHandMoveMode={
                  isHelpingHandsTrollHandMoveMode
                }
                helpingHandsMovableTrollHandIds={helpingHandsMovableTrollHandIds}
                isMonsterMoveMode={isMonsterMoveMode}
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
                  selectedPeekabooSameRoomMonsterId
                }
                monsterStatusById={monsterStatusById}
                movingMonsterId={movingMonsterId}
                locale={locale}
                matchData={matchData}
                resolveMonsterRelationToExplorer={resolveMonsterRelationToExplorer}
                attackImpactPresentationKey={attackImpactPresentationKey}
                attackImpactByPlayerId={attackImpactByPlayerId}
                onSelectExplorerTarget={onSelectExplorerTarget}
                onOpenExplorerDetails={onOpenExplorerDetails}
                onSelectMonsterTarget={onSelectMonsterTarget}
                onSelectHelpingHandsTrollHandMoveMonster={
                  onSelectHelpingHandsTrollHandMoveMonster
                }
                onSelectMonsterMoveMonster={onSelectMonsterMoveMonster}
                onSelectMonsterAttackMonster={onSelectMonsterAttackMonster}
                onOpenMonsterDetails={onOpenMonsterDetails}
                onPickUpMummyGirl={onPickUpMummyGirl}
              />
              {isReachableRoom && !isMoveTarget ? (
                <span
                  data-testid={`betrayal-room-move-card-highlight-${room.id}`}
                  data-highlight-layer-count="1"
                  data-highlight-style="solid"
                  className="pointer-events-none absolute inset-0 z-20 rounded-[4px] border-[3px] border-[#6aa986] bg-[rgba(106,169,134,0.06)]"
                  title={
                    isSkeletonKeyMoveTarget
                      ? t("board.rooms.skeletonKeyMoveTarget")
                      : t("board.rooms.moveTarget")
                  }
                />
              ) : null}
              {isHelpingHandsTrollMoveTarget ? (
                <span
                  data-testid={`betrayal-room-helping-hands-troll-move-target-${room.id}`}
                  data-highlight-layer-count="1"
                  data-highlight-style="solid"
                  className="pointer-events-none absolute inset-0 z-30 rounded-[4px] border-[3px] border-[#9fe1a7] bg-[rgba(159,225,167,0.07)]"
                  title={t("board.status.helpingHandsTrollMoveTarget", {
                    monster: helpingHandsTrollMoveMonsterName ?? "",
                    room: room.name,
                  })}
                />
              ) : null}
              {isMonsterMoveTarget ? (
                <span
                  data-testid={`betrayal-room-monster-move-target-${room.id}`}
                  data-highlight-layer-count="1"
                  data-highlight-style="solid"
                  className="pointer-events-none absolute inset-0 z-30 rounded-[4px] border-[3px] border-[#9fe1a7] bg-[rgba(159,225,167,0.07)]"
                  title={t("board.status.monsterMoveTarget", {
                    monster: monsterMoveMonsterName ?? "",
                    room: room.name,
                  })}
                />
              ) : null}
              {isBloodFromStoneSetupPlacementTarget ? (
                <>
                  <span
                    data-testid={`betrayal-room-blood-from-stone-setup-target-${room.id}`}
                    data-blood-from-stone-setup-selected-count={
                      bloodFromStoneSetupPlacementCountForRoom
                    }
                    data-blood-from-stone-setup-selectable={
                      canSelectBloodFromStoneSetupPlacementRoom
                        ? "true"
                        : "false"
                    }
                    data-highlight-layer-count="1"
                    data-highlight-style="solid"
                    className={`pointer-events-none absolute inset-0 z-30 rounded-[4px] border-[3px] bg-[rgba(34,197,94,0.07)] ${
                      bloodFromStoneSetupPlacementCountForRoom > 0
                        ? "border-[#bbf7d0]"
                        : "border-[#4ade80]"
                    }`}
                    title={t("board.status.bloodFromStoneSetupPlacementTarget", {
                      room: room.name,
                    })}
                  />
                  {bloodFromStoneSetupPlacementCountForRoom > 0 ? (
                    <span
                      data-testid={`betrayal-room-blood-from-stone-setup-count-${room.id}`}
                      className="pointer-events-none absolute right-1 top-1 z-40 rounded-[4px] border border-[#bbf7d0] bg-[rgba(5,46,22,0.92)] px-1.5 py-0.5 text-[10px] font-black leading-none text-[#dcfce7] shadow-[0_3px_10px_rgba(0,0,0,0.34)]"
                      aria-hidden="true"
                    >
                      {t("board.status.bloodFromStoneSetupPlacementRoomToken", {
                        count: bloodFromStoneSetupPlacementCountForRoom,
                      })}
                    </span>
                  ) : null}
                </>
              ) : null}
              {isExploreTarget ? (
                <span
                  data-testid={`betrayal-room-explore-target-${room.id}`}
                  data-room-placement-selected={
                    isPendingRoomPlacementSlot ? "true" : undefined
                  }
                  data-highlight-layer-count="1"
                  data-highlight-style="solid"
                  className={`pointer-events-none absolute inset-0 z-30 rounded-[4px] border-[3px] bg-[rgba(34,197,94,0.07)] ${
                    isPendingRoomPlacementSlot
                      ? "border-[#bbf7d0]"
                      : "border-[#4ade80]"
                  }`}
                  title={t("board.rooms.explorable")}
                />
              ) : null}
              {pendingEventFocusesMapTarget ? null : (
                <button
                  type="button"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenRoomPreview(room.id);
                  }}
                  data-testid={`betrayal-room-preview-${room.id}`}
                  className="absolute bottom-2 right-2 z-30 grid h-7 w-7 place-items-center rounded-[5px] border border-[rgba(222,192,133,0.34)] bg-[rgba(7,10,8,0.7)] text-[#f0d29a] opacity-0 shadow-[0_5px_10px_rgba(0,0,0,0.24)] transition group-hover:opacity-78 hover:bg-[rgba(36,28,19,0.88)] hover:opacity-100 focus:opacity-100"
                  title={t("board.rooms.preview")}
                >
                  <Search size={13} />
                  <span className="sr-only">{t("board.rooms.preview")}</span>
                </button>
              )}
            </div>
          );
        })}
      </ZoomPanViewport>
      {pendingRoomPlacementFailureText ? (
        <BetrayalRoomPlacementFailureBanner
          text={pendingRoomPlacementFailureText}
        />
      ) : null}
      {pendingRoomPlacementPreview &&
      selectedRoomOrientationOption &&
      pendingRoomPlacementVisual ? (
        <BetrayalRoomPlacementSurface
          preview={pendingRoomPlacementPreview}
          selectedOrientationOption={selectedRoomOrientationOption}
          selectedOrientationTurns={selectedRoomOrientationTurns}
          visual={pendingRoomPlacementVisual}
          adjustmentText={pendingRoomPlacementAdjustmentText}
          tileAdjustmentOptions={pendingRoomTileAdjustmentOptions}
          selectedTileAdjustmentOption={selectedRoomTileAdjustmentOption}
          locale={locale}
          onRotate={onRotateRoomPlacement}
          onCancel={onCancelRoomPlacement}
          onConfirm={onConfirmRoomPlacement}
          onSelectTileAdjustment={onSelectRoomTileAdjustment}
        />
      ) : null}
      <BetrayalRoomFloorSwitcherSurface
        selectedFloor={selectedFloor}
        upperFloor={upperFloor}
        lowerFloor={lowerFloor}
        upperFloorHasSelectionTarget={upperFloorHasSelectionTarget}
        lowerFloorHasSelectionTarget={lowerFloorHasSelectionTarget}
        hasCrossFloorMoveTargets={hasCrossFloorMoveTargets}
        hasCrossFloorRoomSelectionTargets={hasCrossFloorRoomSelectionTargets}
        hidden={hiddenTableChrome}
        isPhoneLandscapeLayout={isPhoneLandscapeLayout}
        onSelectFloor={onSelectFloor}
      />
    </div>
  );
}
