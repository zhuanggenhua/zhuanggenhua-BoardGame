import React from "react";
import { useTranslation } from "react-i18next";

import type { EntityRelation } from "../../engine/primitives";
import type { MatchPlayerInfo } from "../../engine/transport/protocol";
import type {
  BetrayalExplorerSummary,
  BetrayalMonsterStatusKind,
  BetrayalMonsterSummary,
  BetrayalTraitKey,
} from "./game";
import type { BetrayalAttackImpactState } from "./attackImpactPresentation";
import { BetrayalAttackImpactSurface } from "./attackImpactSurface";
import { formatMonsterTraitSummary } from "./entityPresentation";
import type { BetrayalHauntTokenInstanceSummary } from "./hauntTokenModel";
import { resolvePlayerName } from "./playerPresentation";
import {
  ExplorerFigureToken,
  GirlBoardToken,
  MonsterBoardToken,
} from "./entityTokenSurface";

type RoomEntityHauntTargetGuide = {
  kind: "room" | "explorer" | "monster";
  roomId: string | null;
  playerId?: string;
  monsterId?: string;
  targetName: string;
  cue: string;
};

type RoomEntityMaskTarget = {
  kind: "explorer" | "monster";
  id: string;
};

type HealFeedback = {
  kind: "heal";
  targetName: string | null;
  traitSummary: string;
  traitCount: number;
};

type RoomEntityLayerSurfaceProps = {
  roomId: string;
  occupants: readonly BetrayalExplorerSummary[];
  monsters: readonly BetrayalMonsterSummary[];
  visibleGirlToken?: BetrayalHauntTokenInstanceSummary;
  canSelectRoom: boolean;
  canPickUpMummyGirl: boolean;
  currentExplorerPlayerId: string;
  traitorPlayerId: string | null;
  mummyMonsterId?: string | null;
  activeHauntTargetGuide?: RoomEntityHauntTargetGuide | null;
  hauntActionKind?: string | null;
  selectedInventoryUseEffectMode?: string | null;
  maskTargetTokens: readonly RoomEntityMaskTarget[];
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
  activeMaskTargetTokenId: string | null;
  selectedPreviewTradeTargetPlayerId: string | null;
  selectedDustTargetPlayerId: string | null;
  visibleFeedback: HealFeedback | null;
  movingExplorerPlayerId?: string | null;
  isHauntTargetRoom: boolean;
  isHelpingHandsTrollHandMoveMode: boolean;
  helpingHandsMovableTrollHandIds: ReadonlySet<string>;
  isMonsterMoveMode: boolean;
  monsterMovableIds: ReadonlySet<string>;
  isMonsterAttackMode: boolean;
  monsterAttackableIds: ReadonlySet<string>;
  isBloodFromStonePeekabooMode: boolean;
  bloodFromStonePeekabooSameRoomMonsterIds: ReadonlySet<string>;
  bloodFromStonePeekabooLineOfSightMonsterIds: ReadonlySet<string>;
  selectedMonsterAttackSourceId: string | null;
  selectedPeekabooSameRoomMonsterId: string | null;
  monsterStatusById: ReadonlyMap<string, BetrayalMonsterStatusKind>;
  movingMonsterId?: string | null;
  locale: string;
  matchData?: MatchPlayerInfo[];
  resolveMonsterRelationToExplorer: (
    monsterId: string,
    playerId: string,
  ) => EntityRelation | undefined;
  attackImpactPresentationKey: string | null;
  attackImpactByPlayerId: ReadonlyMap<string, BetrayalAttackImpactState>;
  onSelectExplorerTarget: (explorer: BetrayalExplorerSummary) => void;
  onOpenExplorerDetails: (playerId: string) => void;
  onSelectMonsterTarget: (monsterId: string) => void;
  onSelectHelpingHandsTrollHandMoveMonster: (monsterId: string) => void;
  onSelectMonsterMoveMonster: (monsterId: string) => void;
  onSelectMonsterAttackMonster: (monsterId: string) => void;
  onOpenMonsterDetails: (monsterId: string) => void;
  onPickUpMummyGirl: () => void;
};

function hasPlayerId(
  explorers: readonly Pick<BetrayalExplorerSummary, "playerId">[],
  playerId: string,
) {
  return explorers.some((target) => target.playerId === playerId);
}

function hasMaskTarget(
  maskTargetTokens: readonly RoomEntityMaskTarget[],
  kind: RoomEntityMaskTarget["kind"],
  id: string,
) {
  return maskTargetTokens.some(
    (target) => target.kind === kind && target.id === id,
  );
}

export function BetrayalRoomEntityLayerSurface({
  roomId,
  occupants,
  monsters,
  visibleGirlToken,
  canSelectRoom,
  canPickUpMummyGirl,
  currentExplorerPlayerId,
  traitorPlayerId,
  mummyMonsterId,
  activeHauntTargetGuide,
  hauntActionKind,
  selectedInventoryUseEffectMode,
  maskTargetTokens,
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
  activeMaskTargetTokenId,
  selectedPreviewTradeTargetPlayerId,
  selectedDustTargetPlayerId,
  visibleFeedback,
  movingExplorerPlayerId,
  isHauntTargetRoom,
  isHelpingHandsTrollHandMoveMode,
  helpingHandsMovableTrollHandIds,
  isMonsterMoveMode,
  monsterMovableIds,
  isMonsterAttackMode,
  monsterAttackableIds,
  isBloodFromStonePeekabooMode,
  bloodFromStonePeekabooSameRoomMonsterIds,
  bloodFromStonePeekabooLineOfSightMonsterIds,
  selectedMonsterAttackSourceId,
  selectedPeekabooSameRoomMonsterId,
  monsterStatusById,
  movingMonsterId,
  locale,
  matchData,
  resolveMonsterRelationToExplorer,
  attackImpactPresentationKey,
  attackImpactByPlayerId,
  onSelectExplorerTarget,
  onOpenExplorerDetails,
  onSelectMonsterTarget,
  onSelectHelpingHandsTrollHandMoveMonster,
  onSelectMonsterMoveMonster,
  onSelectMonsterAttackMonster,
  onOpenMonsterDetails,
  onPickUpMummyGirl,
}: RoomEntityLayerSurfaceProps) {
  const { t } = useTranslation("game-betrayal");
  const hasPlayers = occupants.length > 0;
  const hasMonsters = monsters.length > 0;
  const hasCrowdedEntityRoom = hasPlayers && hasMonsters;
  const girlHeldByExplorer = visibleGirlToken?.status === "held-by-player";
  const girlHeldByMummy = visibleGirlToken?.status === "held-by-mummy";
  const selectedMonsterAttackTargetPlayerId =
    selectedMonsterAttackSourceId && selectedMonsterAttackTargetPlayerIds.size > 0
      ? (Array.from(selectedMonsterAttackTargetPlayerIds)[0] ?? null)
      : null;
  const resolveTraitLabel = React.useCallback(
    (trait: BetrayalTraitKey) => t(`board.traits.${trait}`),
    [t],
  );
  const renderAttackImpactSurface = React.useCallback(
    (
      playerId: string,
      surface: string,
      children: React.ReactNode,
      density: "token" | "panel" = "token",
    ) => {
      if (!attackImpactPresentationKey) {
        return children;
      }
      const impact = attackImpactByPlayerId.get(playerId);
      if (!impact) {
        return children;
      }
      const presentationKey = `${attackImpactPresentationKey}:${surface}:${playerId}`;
      return (
        <BetrayalAttackImpactSurface
          key={presentationKey}
          impact={impact}
          presentationKey={presentationKey}
          surface={surface}
          density={density}
          traitLabel={resolveTraitLabel}
        >
          {children}
        </BetrayalAttackImpactSurface>
      );
    },
    [attackImpactByPlayerId, attackImpactPresentationKey, resolveTraitLabel],
  );

  return (
    <div
      className={`pointer-events-none absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center ${
        hasCrowdedEntityRoom ? "gap-2" : "gap-0"
      }`}
      data-room-token-layout={
        hasCrowdedEntityRoom ? "stable-entity-lanes" : "single-entity-cluster"
      }
    >
      {hasPlayers ? (
        <div className="flex max-h-[146px] flex-col items-center justify-center gap-2">
          {occupants.map((occupant) => {
            const canSelectTraitorTarget =
              activeHauntTargetGuide?.kind === "explorer" &&
              activeHauntTargetGuide.playerId === occupant.playerId &&
              hauntActionKind === "attack-traitor" &&
              occupant.playerId === traitorPlayerId;
            const canSelectDustTarget =
              dustTargetPlayerIds.has(occupant.playerId) &&
              (isDustAttackTargetingMode || isDustSicknessExchangeMode);
            const canSelectHelpingHandsTrollHandTarget =
              helpingHandsTrollHandAttackTargetPlayerIds.has(occupant.playerId);
            const canSelectMagicCameraTarget =
              magicCameraPhotoTargetPlayerIds.has(occupant.playerId);
            const canSelectMonsterAttackTarget =
              selectedMonsterAttackTargetPlayerIds.has(occupant.playerId);
            const canSelectExplorerTarget =
              canSelectTraitorTarget ||
              canSelectDustTarget ||
              canSelectHelpingHandsTrollHandTarget ||
              canSelectMagicCameraTarget ||
              canSelectMonsterAttackTarget ||
              (isHeroAttackTargetingMode &&
                heroAttackTargetPlayerIds.has(occupant.playerId)) ||
              (selectedInventoryUseEffectMode === "healTraits" &&
                hasPlayerId(healTargetExplorers, occupant.playerId)) ||
              (selectedInventoryUseEffectMode === "moveOthersInRoom" &&
                hasMaskTarget(maskTargetTokens, "explorer", occupant.playerId)) ||
              (isTradeOrLootTargetSelectionActive &&
                (hasPlayerId(activeTradeTargets, occupant.playerId) ||
                  hasPlayerId(corpseLootTargets, occupant.playerId)));
            const isHauntGuideExplorerTarget =
              activeHauntTargetGuide?.kind === "explorer" &&
              activeHauntTargetGuide.playerId === occupant.playerId;
            const isSelectedExplorerTarget =
              occupant.playerId === selectedTradeTargetPlayerId ||
              occupant.playerId === selectedCorpseLootTargetPlayerId ||
              occupant.playerId === selectedInventoryTargetPlayerId ||
              occupant.playerId === activeMaskTargetTokenId ||
              (selectedPreviewTradeTargetPlayerId === occupant.playerId &&
                (canSelectMagicCameraTarget ||
                  canSelectMonsterAttackTarget ||
                  canSelectHelpingHandsTrollHandTarget ||
                  canSelectDustTarget)) ||
              canSelectTraitorTarget ||
              (isDustSicknessExchangeMode &&
                occupant.playerId === selectedDustTargetPlayerId) ||
              activeHauntTargetGuide?.playerId === occupant.playerId;
            const tokenLabel = resolvePlayerName(
              occupant.playerId,
              occupant.displayName,
              matchData,
            );
            const isVisibleFeedbackTarget =
              visibleFeedback?.kind === "heal" &&
              (visibleFeedback.targetName === tokenLabel ||
                visibleFeedback.targetName === occupant.displayName);
            const occupantCarriesGirl =
              girlHeldByExplorer &&
              visibleGirlToken?.ownerPlayerId === occupant.playerId;
            const isMovingExplorerAnchor =
              occupant.playerId === movingExplorerPlayerId;
            const tokenContent = (
              <>
                <span className="relative z-10 inline-flex items-end gap-1.5">
                  {renderAttackImpactSurface(
                    occupant.playerId,
                    "map",
                    <ExplorerFigureToken
                      explorer={occupant}
                      locale={locale}
                      label={tokenLabel}
                      tone={
                        occupant.playerId === currentExplorerPlayerId
                          ? "self"
                          : "ally"
                      }
                      missingTokenLabel={t(
                        "board.hauntTokens.officialTokenMissing",
                      )}
                      targetHighlight={canSelectExplorerTarget}
                      targetHighlightSelected={
                        isSelectedExplorerTarget || isHauntGuideExplorerTarget
                      }
                      targetHighlightTestId={`betrayal-room-occupant-target-outline-${roomId}-${occupant.playerId}`}
                    />,
                  )}
                  {occupantCarriesGirl && visibleGirlToken ? (
                    <GirlBoardToken
                      token={visibleGirlToken}
                      t={t}
                      attachedTo="explorer"
                    />
                  ) : null}
                </span>
                {isHauntGuideExplorerTarget ? (
                  <span
                    data-testid={`betrayal-room-occupant-target-cue-${roomId}-${occupant.playerId}`}
                    className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-30 max-w-[180px] -translate-x-1/2 whitespace-nowrap rounded-[5px] border border-[rgba(217,255,151,0.72)] bg-[rgba(7,14,10,0.92)] px-2 py-1 text-[11px] font-black leading-none tracking-[0.04em] text-[#f2ffd2] shadow-[0_0_0_1px_rgba(7,14,10,0.92),0_8px_18px_rgba(0,0,0,0.34),0_0_20px_rgba(217,255,151,0.24)]"
                  >
                    {activeHauntTargetGuide.cue}
                  </span>
                ) : null}
                {isVisibleFeedbackTarget && visibleFeedback ? (
                  <span
                    data-testid={`betrayal-room-occupant-feedback-${roomId}-${occupant.playerId}`}
                    data-feedback-style="floating-text"
                    data-feedback-anchor="target-token"
                    aria-label={`${t("board.feedback.healTraitCount", {
                      count: visibleFeedback.traitCount || 1,
                    })}：${visibleFeedback.traitSummary}`}
                    className="pointer-events-none absolute bottom-[calc(100%+4px)] left-1/2 z-40 -translate-x-1/2 whitespace-nowrap text-[16px] font-black leading-none text-[#dcfce7] [text-shadow:0_2px_3px_rgba(0,0,0,0.96),0_0_10px_rgba(34,197,94,0.76),0_0_18px_rgba(34,197,94,0.48)]"
                  >
                    {t("board.feedback.healFloatingText", {
                      count: visibleFeedback.traitCount || 1,
                    })}
                  </span>
                ) : null}
              </>
            );

            if (canSelectExplorerTarget) {
              return (
                <button
                  key={occupant.playerId}
                  type="button"
                  data-testid={`betrayal-room-occupant-${roomId}-${occupant.playerId}`}
                  data-highlight-shape="pentagon"
                  data-direct-target="true"
                  data-visual-transition-anchor-hidden={
                    isMovingExplorerAnchor ? "true" : undefined
                  }
                  data-haunt-target-hitbox={
                    isHauntGuideExplorerTarget ? "true" : undefined
                  }
                  title={
                    isHauntGuideExplorerTarget
                      ? `${tokenLabel} · ${activeHauntTargetGuide.cue}`
                      : tokenLabel
                  }
                  aria-label={
                    isHauntGuideExplorerTarget
                      ? `${tokenLabel}，${activeHauntTargetGuide.cue}`
                      : tokenLabel
                  }
                  className={`pointer-events-auto relative cursor-pointer outline-none transition hover:outline hover:outline-2 hover:outline-offset-2 hover:outline-[#86efac] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#86efac] ${
                    isMovingExplorerAnchor ? "invisible" : ""
                  } ${
                    isHauntGuideExplorerTarget
                      ? "grid min-h-[72px] min-w-[72px] place-items-center rounded-[14px] p-3"
                      : ""
                  }`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onPointerUp={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectExplorerTarget(occupant);
                  }}
                >
                  {tokenContent}
                </button>
              );
            }

            return (
              <button
                key={occupant.playerId}
                type="button"
                className={`relative outline-none transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d1b05f] ${
                  isMovingExplorerAnchor ? "invisible" : ""
                } ${
                  canSelectRoom
                    ? "pointer-events-none cursor-default"
                    : "pointer-events-auto cursor-pointer hover:drop-shadow-[0_0_14px_rgba(209,176,95,0.34)]"
                }`}
                data-testid={`betrayal-room-occupant-${roomId}-${occupant.playerId}`}
                data-visual-transition-anchor-hidden={
                  isMovingExplorerAnchor ? "true" : undefined
                }
                tabIndex={canSelectRoom ? -1 : undefined}
                title={t("board.players.detailsAria", {
                  player: tokenLabel,
                })}
                aria-label={t("board.players.detailsAria", {
                  player: tokenLabel,
                })}
                onPointerDown={(event) => event.stopPropagation()}
                onPointerUp={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenExplorerDetails(occupant.playerId);
                }}
              >
                {tokenContent}
              </button>
            );
          })}
        </div>
      ) : null}
      {hasMonsters ? (
        <div
          className={`relative flex justify-center ${
            isHauntTargetRoom
              ? "max-w-[176px] flex-row gap-1"
              : "max-h-[146px] flex-col gap-2"
          } items-center`}
        >
          {monsters.map((monster) => {
            const canSelectMonsterTarget =
              selectedInventoryUseEffectMode === "moveOthersInRoom" &&
              hasMaskTarget(maskTargetTokens, "monster", monster.id);
            const canSelectHelpingHandsTrollMoveMonster =
              isHelpingHandsTrollHandMoveMode &&
              helpingHandsMovableTrollHandIds.has(monster.id);
            const canSelectMonsterMoveMonster =
              isMonsterMoveMode && monsterMovableIds.has(monster.id);
            const canSelectMonsterAttackMonster =
              isMonsterAttackMode && monsterAttackableIds.has(monster.id);
            const canSelectPeekabooMonsterTarget =
              isBloodFromStonePeekabooMode &&
              (bloodFromStonePeekabooSameRoomMonsterIds.has(monster.id) ||
                bloodFromStonePeekabooLineOfSightMonsterIds.has(monster.id));
            const canSelectToken =
              canSelectMonsterTarget ||
              canSelectHelpingHandsTrollMoveMonster ||
              canSelectMonsterMoveMonster ||
              canSelectMonsterAttackMonster ||
              canSelectPeekabooMonsterTarget;
            const monsterStatus = monsterStatusById.get(monster.id) ?? "active";
            const monsterTraitSummary = formatMonsterTraitSummary(monster);
            const isHauntGuideMonsterTarget =
              activeHauntTargetGuide?.kind === "monster" &&
              activeHauntTargetGuide.monsterId === monster.id;
            const hauntGuideMonsterCue = activeHauntTargetGuide?.cue ?? monster.name;
            const monsterCarriesGirl =
              girlHeldByMummy && monster.id === mummyMonsterId;
            const isSelectedMonsterAttackSource =
              isMonsterAttackMode && selectedMonsterAttackSourceId === monster.id;
            const monsterHighlightRelation = selectedMonsterAttackTargetPlayerId
              ? resolveMonsterRelationToExplorer(
                  monster.id,
                  selectedMonsterAttackTargetPlayerId,
                )
              : canSelectMonsterAttackMonster || canSelectPeekabooMonsterTarget
                ? resolveMonsterRelationToExplorer(
                    monster.id,
                    currentExplorerPlayerId,
                  )
                : undefined;
            const isMovingMonsterAnchor = monster.id === movingMonsterId;
            const monsterContent = (
              <>
                <span
                  className={
                    monsterCarriesGirl
                      ? "relative z-10 inline-flex min-h-[58px] min-w-[112px] items-end justify-center gap-1.5"
                      : "relative z-10 inline-flex items-end gap-1.5"
                  }
                  data-monster-token-cluster={
                    monsterCarriesGirl ? "mummy-carrying-girl" : undefined
                  }
                >
                  <MonsterBoardToken
                    monster={monster}
                    locale={locale}
                    t={t}
                    quietFrame={isHauntGuideMonsterTarget}
                    status={monsterStatus}
                    targetHighlight={canSelectToken}
                    targetHighlightRole={
                      isSelectedMonsterAttackSource ? "source" : "target"
                    }
                    targetHighlightRelation={monsterHighlightRelation}
                    targetHighlightTestId={
                      canSelectToken
                        ? `betrayal-room-monster-target-outline-${roomId}-${monster.id}`
                        : undefined
                    }
                  />
                  {monsterCarriesGirl && visibleGirlToken ? (
                    <span className="pointer-events-none z-30 inline-flex translate-y-[2px]">
                      <GirlBoardToken
                        token={visibleGirlToken}
                        t={t}
                        attachedTo="mummy"
                      />
                    </span>
                  ) : null}
                </span>
                {isHauntGuideMonsterTarget ? (
                  <span
                    data-testid={`betrayal-room-monster-target-cue-${roomId}-${monster.id}`}
                    className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-30 max-w-[190px] -translate-x-1/2 whitespace-nowrap rounded-[5px] border border-[rgba(217,255,151,0.72)] bg-[rgba(7,14,10,0.92)] px-2 py-1 text-[11px] font-black leading-none tracking-[0.04em] text-[#f2ffd2] shadow-[0_0_0_1px_rgba(7,14,10,0.92),0_8px_18px_rgba(0,0,0,0.34),0_0_20px_rgba(217,255,151,0.24)]"
                  >
                    {hauntGuideMonsterCue}
                  </span>
                ) : null}
              </>
            );

            if (canSelectToken) {
              return (
                <button
                  key={monster.id}
                  type="button"
                  data-testid={`betrayal-room-monster-${roomId}-${monster.id}`}
                  data-highlight-shape="token"
                  data-direct-target="true"
                  data-monster-status={monsterStatus}
                  data-visual-transition-anchor-hidden={
                    isMovingMonsterAnchor ? "true" : undefined
                  }
                  data-token-asset={monster.tokenAsset ?? monster.portraitAsset}
                  data-haunt-target-hitbox={
                    isHauntGuideMonsterTarget ? "true" : undefined
                  }
                  title={
                    isHauntGuideMonsterTarget
                      ? `${monster.name} · ${hauntGuideMonsterCue}`
                      : canSelectHelpingHandsTrollMoveMonster
                        ? `${monster.name} · ${t("board.status.helpingHandsTrollMoveToken")}`
                        : canSelectMonsterMoveMonster
                          ? `${monster.name} · ${t("board.status.monsterMoveToken")}`
                          : canSelectMonsterAttackMonster
                            ? `${monster.name} · ${t("board.status.monsterAttackToken")}`
                            : canSelectPeekabooMonsterTarget
                              ? `${monster.name} · ${t(
                                  selectedPeekabooSameRoomMonsterId
                                    ? "board.status.playPeekabooLineOfSightToken"
                                    : "board.status.playPeekabooSameRoomToken",
                                )}`
                              : `${monster.name} · ${monsterTraitSummary}`
                  }
                  aria-label={
                    isHauntGuideMonsterTarget
                      ? `${monster.name}，${hauntGuideMonsterCue}`
                      : monster.name
                  }
                  className={`pointer-events-auto relative cursor-pointer outline-none transition hover:outline hover:outline-2 hover:outline-offset-2 hover:outline-[#86efac] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#86efac] ${
                    isMovingMonsterAnchor ? "invisible" : ""
                  } ${
                    isHauntGuideMonsterTarget
                      ? "grid min-h-[52px] min-w-[52px] place-items-center rounded-[10px]"
                      : ""
                  }`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onPointerUp={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (canSelectHelpingHandsTrollMoveMonster) {
                      onSelectHelpingHandsTrollHandMoveMonster(monster.id);
                      return;
                    }
                    if (canSelectMonsterMoveMonster) {
                      onSelectMonsterMoveMonster(monster.id);
                      return;
                    }
                    if (canSelectMonsterAttackMonster) {
                      onSelectMonsterAttackMonster(monster.id);
                      return;
                    }
                    onSelectMonsterTarget(monster.id);
                  }}
                >
                  {monsterContent}
                </button>
              );
            }

            return (
              <button
                key={monster.id}
                type="button"
                className={`relative border-0 bg-transparent p-0 outline-none transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d1b05f] ${
                  isMovingMonsterAnchor ? "invisible" : ""
                } ${
                  canSelectRoom
                    ? "pointer-events-none cursor-default"
                    : "pointer-events-auto cursor-pointer hover:drop-shadow-[0_0_14px_rgba(209,176,95,0.34)]"
                }`}
                data-testid={`betrayal-room-monster-${roomId}-${monster.id}`}
                data-monster-status={monsterStatus}
                data-visual-transition-anchor-hidden={
                  isMovingMonsterAnchor ? "true" : undefined
                }
                data-token-asset={monster.tokenAsset ?? monster.portraitAsset}
                data-monster-detail-entry="true"
                tabIndex={canSelectRoom ? -1 : undefined}
                title={`${monster.name} · ${monsterTraitSummary}`}
                aria-label={t("board.monster.openDetails", {
                  monster: monster.name,
                })}
                onPointerDown={(event) => event.stopPropagation()}
                onPointerUp={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenMonsterDetails(monster.id);
                }}
              >
                {monsterContent}
              </button>
            );
          })}
        </div>
      ) : null}
      {visibleGirlToken?.status === "placed" ? (
        <div className="relative flex flex-col items-center justify-center">
          <GirlBoardToken
            token={visibleGirlToken}
            t={t}
            attachedTo="room"
            interactive={canPickUpMummyGirl}
            onClick={canPickUpMummyGirl ? onPickUpMummyGirl : undefined}
          />
        </div>
      ) : null}
    </div>
  );
}
