import type { MatchPlayerInfo } from "../../engine/transport/protocol";
import type { DicePhysicsProjectedLayout } from "../../lib/dice-physics/types";
import type {
  BetrayalCore,
  BetrayalExplorerSummary,
  BetrayalRecentRollState,
} from "./game";
import {
  resolvePendingEventRollResolutionRequiredPlayerIds,
  resolveRecentRollAcknowledgedPlayerIds,
  resolveRecentRollRequiredPlayerIds,
} from "./acknowledgementReadModel";
import { resolvePlayerName } from "./playerPresentation";

export type EventRollConfirmationPresentation = {
  requiredPlayerIds: string[];
  acknowledgedPlayerIds: string[];
  confirmedCount: number;
  totalCount: number;
  viewerHasAcknowledged: boolean;
  canViewerAcknowledge: boolean;
};

export type RecentRollAcknowledgementPresentation = {
  hasAcknowledgement: boolean;
  requiredPlayerIds: string[];
  acknowledgedPlayerIds: string[];
  confirmedCount: number;
  totalCount: number;
  fullyAcknowledged: boolean;
  hasAcknowledgeableRecentRoll: boolean;
  viewerHasAcknowledged: boolean;
  canViewerAcknowledge: boolean;
};

export function buildRecentRollDisplayKey(
  recentRoll: BetrayalRecentRollState | null | undefined,
): string | null {
  if (!recentRoll) {
    return null;
  }
  return [
    recentRoll.id,
    recentRoll.kind,
    recentRoll.playerId,
    recentRoll.sourceTitle,
    recentRoll.eventDescription ?? "",
    recentRoll.sourceEventRoll?.eventDescription ?? "",
    recentRoll.rollLabel ?? "",
    recentRoll.latestLabel,
    recentRoll.dice.join(","),
    recentRoll.passiveBonus,
  ].join("::");
}

function isAcknowledgeableRecentRollDisplay(
  recentRoll: BetrayalRecentRollState | null | undefined,
): boolean {
  if (!recentRoll) {
    return false;
  }
  if (recentRoll.roomEndTurn?.nextPlayerId || recentRoll.deathPrevention?.nextPlayerId) {
    return false;
  }
  return (
    recentRoll.kind === "eventRolledDamage" ||
    recentRoll.kind === "attackRoll" ||
    recentRoll.kind === "hauntActionTraitCheck" ||
    recentRoll.kind === "monsterMoveRoll"
  );
}

function resolveRecentRollRequiredPlayerIdsForDisplay(
  core: BetrayalCore,
  recentRoll: BetrayalRecentRollState | null | undefined,
): string[] {
  if (!recentRoll) {
    return [];
  }
  return resolveRecentRollRequiredPlayerIds(core, recentRoll);
}

function resolveRecentRollAcknowledgedPlayerIdsForDisplay(
  recentRoll: BetrayalRecentRollState | null | undefined,
): string[] {
  return recentRoll ? resolveRecentRollAcknowledgedPlayerIds(recentRoll) : [];
}

export function resolveRecentRollTotal(roll: BetrayalRecentRollState): number {
  return roll.dice.reduce((sum, pip) => sum + pip, 0) + roll.passiveBonus;
}

export function resolveRecentRollActorLabel(options: {
  roll: BetrayalRecentRollState | null | undefined;
  viewerPlayerId: string;
  explorers: readonly BetrayalExplorerSummary[];
  matchData?: MatchPlayerInfo[];
}): string | null {
  const { roll, viewerPlayerId, explorers, matchData } = options;
  if (!roll || roll.playerId === viewerPlayerId) {
    return null;
  }
  const actor = explorers.find((explorer) => explorer.playerId === roll.playerId);
  const actorName = actor
    ? resolvePlayerName(actor.playerId, actor.displayName, matchData)
    : resolvePlayerName(roll.playerId, "玩家", matchData);
  return `由 ${actorName} 触发`;
}

export function resolveEventRollConfirmationPresentation(
  core: BetrayalCore,
  viewerPlayerId: string,
): EventRollConfirmationPresentation {
  const pendingResolution = core.pendingEventRollResolution;
  const requiredPlayerIds = pendingResolution
    ? resolvePendingEventRollResolutionRequiredPlayerIds(core, pendingResolution)
    : [];
  const acknowledgedPlayerIds =
    pendingResolution?.acknowledgedPlayerIds ?? [];
  const confirmedCount = requiredPlayerIds.filter((playerId) =>
    acknowledgedPlayerIds.includes(playerId),
  ).length;
  const totalCount = requiredPlayerIds.length;
  const viewerHasAcknowledged = acknowledgedPlayerIds.includes(viewerPlayerId);
  const canViewerAcknowledge = Boolean(
    pendingResolution &&
      pendingResolution.requiresAcknowledgement !== false &&
      requiredPlayerIds.includes(viewerPlayerId) &&
      !viewerHasAcknowledged,
  );

  return {
    requiredPlayerIds: [...requiredPlayerIds],
    acknowledgedPlayerIds: [...acknowledgedPlayerIds],
    confirmedCount,
    totalCount,
    viewerHasAcknowledged,
    canViewerAcknowledge,
  };
}

export function resolveRecentRollAcknowledgementPresentation(
  core: BetrayalCore,
  viewerPlayerId: string,
): RecentRollAcknowledgementPresentation {
  const recentRollDecisionPlayerIds = new Set(
    [core.currentPlayer, core.activePlayerId].filter(
      (playerId): playerId is string => Boolean(playerId),
    ),
  );
  const hasAcknowledgement = Boolean(
    core.recentRoll &&
      isAcknowledgeableRecentRollDisplay(core.recentRoll) &&
      recentRollDecisionPlayerIds.has(core.recentRoll.playerId),
  );
  const requiredPlayerIds =
    hasAcknowledgement && core.recentRoll
      ? resolveRecentRollRequiredPlayerIdsForDisplay(core, core.recentRoll)
      : [];
  const acknowledgedPlayerIds =
    hasAcknowledgement && core.recentRoll
      ? resolveRecentRollAcknowledgedPlayerIdsForDisplay(core.recentRoll)
      : [];
  const confirmedCount = requiredPlayerIds.filter((playerId) =>
    acknowledgedPlayerIds.includes(playerId),
  ).length;
  const totalCount = requiredPlayerIds.length;
  const fullyAcknowledged = requiredPlayerIds.every((playerId) =>
    acknowledgedPlayerIds.includes(playerId),
  );
  const hasAcknowledgeableRecentRoll =
    hasAcknowledgement && !fullyAcknowledged;
  const viewerHasAcknowledged = acknowledgedPlayerIds.includes(viewerPlayerId);
  const canViewerAcknowledge = Boolean(
    hasAcknowledgeableRecentRoll &&
      requiredPlayerIds.includes(viewerPlayerId) &&
      !viewerHasAcknowledged,
  );

  return {
    hasAcknowledgement,
    requiredPlayerIds,
    acknowledgedPlayerIds,
    confirmedCount,
    totalCount,
    fullyAcknowledged,
    hasAcknowledgeableRecentRoll,
    viewerHasAcknowledged,
    canViewerAcknowledge,
  };
}

export function resolveBetrayalRerollTargetBoxSize(
  layout: DicePhysicsProjectedLayout,
): number {
  const visibleWidth = layout.visualWidth ?? layout.width;
  const visibleHeight = layout.visualHeight ?? layout.height;
  return Math.max(visibleWidth, visibleHeight);
}
