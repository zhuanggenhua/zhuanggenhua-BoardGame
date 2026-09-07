import type { PreviewState } from "./previewStateModel";
import type { BetrayalExplorerSummary } from "./game";
import type { BetrayalBloodFromStonePeekabooOption } from "./hauntSpecialActionReadModel";

type HauntGuideText = (key: string, options?: Record<string, unknown>) => string;

export type BetrayalHauntTargetGuide = {
  kind: "room" | "explorer" | "monster";
  roomId: string | null;
  playerId?: string;
  monsterId?: string;
  targetName: string;
  cue: string;
};

export type BetrayalHauntTargetGuideInput = {
  t: HauntGuideText;
  phase: string;
  shouldPauseHauntBoardActions: boolean;
  interactionMode: PreviewState["interactionMode"];
  hauntActionKind: string | null | undefined;
  selectedAttackWeaponEffectId: string | null;
  allExplorers: readonly BetrayalExplorerSummary[];
  dustSameRoomLivingTargets: readonly BetrayalExplorerSummary[];
  selectedTradeTargetPlayerId: string | null;
  selectedAttackTargetPlayerIds: {
    traitorPlayerId: string | null;
    heroPlayerIds: readonly string[];
  };
  heroAttackTargets: readonly BetrayalExplorerSummary[];
  bloodFromStonePeekabooOptions: readonly BetrayalBloodFromStonePeekabooOption[];
  selectedPeekabooSameRoomMonsterId: string | null;
  resolvePlayerName: (playerId: string, explorerName: string) => string;
};

export function resolveBetrayalHauntTargetGuide({
  t,
  phase,
  shouldPauseHauntBoardActions,
  interactionMode,
  hauntActionKind,
  selectedAttackWeaponEffectId,
  allExplorers,
  dustSameRoomLivingTargets,
  selectedTradeTargetPlayerId,
  selectedAttackTargetPlayerIds,
  heroAttackTargets,
  bloodFromStonePeekabooOptions,
  selectedPeekabooSameRoomMonsterId,
  resolvePlayerName,
}: BetrayalHauntTargetGuideInput): BetrayalHauntTargetGuide | null {
  if (phase !== "haunt" || shouldPauseHauntBoardActions) {
    return null;
  }
  const targetActionKind =
    interactionMode === "sicknessExchange"
      ? "sickness-exchange"
      : hauntActionKind;
  if (!targetActionKind) {
    return null;
  }
  if (
    targetActionKind.startsWith("attack-") &&
    selectedAttackWeaponEffectId === "dynamite"
  ) {
    return null;
  }

  const resolveExplorerGuide = (
    playerId: string | null | undefined,
    cue: string,
  ): BetrayalHauntTargetGuide | null => {
    const explorer = allExplorers.find((item) => item.playerId === playerId);
    if (!explorer) {
      return null;
    }
    return {
      kind: "explorer",
      roomId: explorer.roomId,
      playerId: explorer.playerId,
      targetName: resolvePlayerName(explorer.playerId, explorer.displayName),
      cue,
    };
  };

  switch (targetActionKind) {
    case "sickness-exchange":
      return resolveSicknessExchangeGuide({
        t,
        dustSameRoomLivingTargets,
        selectedTradeTargetPlayerId,
        resolveExplorerGuide,
      });
    case "attack-dust":
      return resolveDustAttackGuide({
        t,
        dustSameRoomLivingTargets,
        selectedTradeTargetPlayerId,
        resolveExplorerGuide,
      });
    case "attack-traitor":
      return resolveExplorerGuide(
        selectedAttackTargetPlayerIds.traitorPlayerId,
        t("board.status.localCueAttackTraitor"),
      );
    case "attack-hero":
      return resolveHeroAttackGuide({
        t,
        hauntActionKind,
        heroAttackTargets,
        selectedHeroPlayerIds: selectedAttackTargetPlayerIds.heroPlayerIds,
        resolveExplorerGuide,
      });
    case "play-peekaboo":
      return resolvePeekabooGuide({
        t,
        hauntActionKind,
        bloodFromStonePeekabooOptions,
        selectedPeekabooSameRoomMonsterId,
      });
    default:
      return null;
  }
}

export function resolveActiveBetrayalHauntTargetGuide({
  hauntTargetGuide,
  hauntTargetingActionKind,
  hauntActionKind,
  interactionMode,
}: {
  hauntTargetGuide: BetrayalHauntTargetGuide | null;
  hauntTargetingActionKind: string | null | undefined;
  hauntActionKind: string | null | undefined;
  interactionMode: PreviewState["interactionMode"];
}): BetrayalHauntTargetGuide | null {
  return hauntTargetGuide &&
    (hauntTargetingActionKind === hauntActionKind ||
      interactionMode === "sicknessExchange")
    ? hauntTargetGuide
    : null;
}

function resolveSicknessExchangeGuide({
  t,
  dustSameRoomLivingTargets,
  selectedTradeTargetPlayerId,
  resolveExplorerGuide,
}: Pick<
  BetrayalHauntTargetGuideInput,
  "t" | "dustSameRoomLivingTargets" | "selectedTradeTargetPlayerId"
> & {
  resolveExplorerGuide: (
    playerId: string | null | undefined,
    cue: string,
  ) => BetrayalHauntTargetGuide | null;
}): BetrayalHauntTargetGuide | null {
  const target =
    dustSameRoomLivingTargets.find(
      (item) => item.playerId === selectedTradeTargetPlayerId,
    ) ??
    dustSameRoomLivingTargets[0] ??
    null;
  const targetName = target?.displayName ?? null;
  return resolveExplorerGuide(
    target?.playerId,
    targetName
      ? t("board.status.localCueExchangeSicknessTarget", {
          player: targetName,
        })
      : t("board.status.localCueExchangeSickness"),
  );
}

function resolveDustAttackGuide({
  t,
  dustSameRoomLivingTargets,
  selectedTradeTargetPlayerId,
  resolveExplorerGuide,
}: Pick<
  BetrayalHauntTargetGuideInput,
  "t" | "dustSameRoomLivingTargets" | "selectedTradeTargetPlayerId"
> & {
  resolveExplorerGuide: (
    playerId: string | null | undefined,
    cue: string,
  ) => BetrayalHauntTargetGuide | null;
}): BetrayalHauntTargetGuide | null {
  const target =
    dustSameRoomLivingTargets.find(
      (item) => item.playerId === selectedTradeTargetPlayerId,
    ) ??
    dustSameRoomLivingTargets[0] ??
    null;
  return resolveExplorerGuide(
    target?.playerId,
    t("board.status.localCueAttackExplorer"),
  );
}

function resolveHeroAttackGuide({
  t,
  hauntActionKind,
  heroAttackTargets,
  selectedHeroPlayerIds,
  resolveExplorerGuide,
}: Pick<BetrayalHauntTargetGuideInput, "t" | "hauntActionKind" | "heroAttackTargets"> & {
  selectedHeroPlayerIds: readonly string[];
  resolveExplorerGuide: (
    playerId: string | null | undefined,
    cue: string,
  ) => BetrayalHauntTargetGuide | null;
}): BetrayalHauntTargetGuide | null {
  if (hauntActionKind !== "attack-hero") {
    return null;
  }
  const activeHeroAttackTargets = heroAttackTargets.filter((target) =>
    selectedHeroPlayerIds.includes(target.playerId),
  );
  if (activeHeroAttackTargets.length === 1) {
    return resolveExplorerGuide(
      activeHeroAttackTargets[0]?.playerId,
      t("board.status.localCueAttackExplorer"),
    );
  }
  if (heroAttackTargets.length === 1) {
    return resolveExplorerGuide(null, t("board.status.localCueAttackExplorer"));
  }
  return {
    kind: "explorer",
    roomId: null,
    targetName: t("board.status.targetAnyHero"),
    cue: t("board.status.localCueAttackAnyHero"),
  };
}

function resolvePeekabooGuide({
  t,
  hauntActionKind,
  bloodFromStonePeekabooOptions,
  selectedPeekabooSameRoomMonsterId,
}: Pick<
  BetrayalHauntTargetGuideInput,
  | "t"
  | "hauntActionKind"
  | "bloodFromStonePeekabooOptions"
  | "selectedPeekabooSameRoomMonsterId"
>): BetrayalHauntTargetGuide | null {
  if (hauntActionKind !== "play-peekaboo") {
    return null;
  }
  const resolveMonsterGuide = (
    option: BetrayalBloodFromStonePeekabooOption,
    step: "same-room" | "line-of-sight",
  ): BetrayalHauntTargetGuide => ({
    kind: "monster",
    roomId:
      step === "same-room"
        ? option.sameRoomRoomId
        : option.lineOfSightRoomId,
    monsterId:
      step === "same-room"
        ? option.sameRoomMonsterId
        : option.lineOfSightMonsterId,
    targetName:
      step === "same-room"
        ? option.sameRoomMonsterName
        : option.lineOfSightMonsterName,
    cue:
      step === "same-room"
        ? t("board.status.localCuePlayPeekabooSameRoom")
        : t("board.status.localCuePlayPeekabooLineOfSight"),
  });
  if (!selectedPeekabooSameRoomMonsterId) {
    const option = bloodFromStonePeekabooOptions[0] ?? null;
    return option ? resolveMonsterGuide(option, "same-room") : null;
  }
  const option =
    bloodFromStonePeekabooOptions.find(
      (item) => item.sameRoomMonsterId === selectedPeekabooSameRoomMonsterId,
    ) ??
    bloodFromStonePeekabooOptions[0] ??
    null;
  return option ? resolveMonsterGuide(option, "line-of-sight") : null;
}
