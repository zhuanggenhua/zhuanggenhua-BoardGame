import { BETRAYAL_COMMANDS } from "./commands";
import type { BetrayalCommandMap } from "./commandTypes";
import type {
  BetrayalExplorerSummary,
  PossessionUseEffectProfile,
} from "./game";
import type { BetrayalHauntTargetGuide } from "./hauntTargetGuideReadModel";
import type { BetrayalMonsterAttackEntry } from "./monsterActionSelectionReadModel";
import type { PreviewState } from "./previewStateModel";

type MaskTargetToken = {
  kind: string;
  id: string;
};

export type BetrayalExplorerTargetSelectionAction =
  | {
      kind: "phantomPhotographerAttack";
      payload: BetrayalCommandMap[typeof BETRAYAL_COMMANDS.PHANTOM_PHOTOGRAPHER_ATTACK];
    }
  | {
      kind: "monsterAttackHero";
      payload: BetrayalCommandMap[typeof BETRAYAL_COMMANDS.MONSTER_ATTACK_HERO];
    }
  | {
      kind: "hauntAttackHero";
      payload: BetrayalCommandMap[typeof BETRAYAL_COMMANDS.HAUNT_ATTACK];
    }
  | { kind: "hauntAttackTraitor" }
  | { kind: "selectHauntUseTarget"; playerId: string }
  | { kind: "attackHero"; targetPlayerId: string }
  | {
      kind: "requestSicknessExchange";
      payload: BetrayalCommandMap[typeof BETRAYAL_COMMANDS.REQUEST_SICKNESS_EXCHANGE];
    }
  | { kind: "selectTradeOrLootTarget"; playerId: string; isCorpseLootTarget: boolean }
  | { kind: "selectInventoryTargetPlayer"; playerId: string }
  | { kind: "selectMaskTargetToken"; tokenId: string }
  | { kind: "none" };

export function resolveBetrayalExplorerTargetSelectionAction(options: {
  explorer: BetrayalExplorerSummary;
  traitorPlayerId: string | null;
  isMonsterAttackMode: boolean;
  selectedMonsterAttackEntry: BetrayalMonsterAttackEntry | null;
  selectedMonsterAttackTargetPlayerIds: ReadonlySet<string>;
  activeHauntTargetGuide: BetrayalHauntTargetGuide | null;
  hauntActionKind: string | null | undefined;
  magicCameraPhotoTargetPlayerIds: ReadonlySet<string>;
  helpingHandsTrollHandAttackTargetPlayerIds: ReadonlySet<string>;
  isHeroAttackTargetingMode: boolean;
  heroAttackTargetPlayerIds: ReadonlySet<string>;
  isDustSicknessExchangeMode: boolean;
  dustTargetPlayerIds: ReadonlySet<string>;
  isDustAttackTargetingMode: boolean;
  isTradeOrLootTargetSelectionActive: boolean;
  activeTradeTargets: readonly BetrayalExplorerSummary[];
  corpseLootTargets: readonly BetrayalExplorerSummary[];
  selectedInventoryUseEffectMode: PossessionUseEffectProfile["mode"] | null;
  healTargetExplorers: readonly BetrayalExplorerSummary[];
  maskTargetTokens: readonly MaskTargetToken[];
}): BetrayalExplorerTargetSelectionAction {
  const {
    explorer,
    traitorPlayerId,
    isMonsterAttackMode,
    selectedMonsterAttackEntry,
    selectedMonsterAttackTargetPlayerIds,
    activeHauntTargetGuide,
    hauntActionKind,
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
  } = options;

  if (
    isMonsterAttackMode &&
    selectedMonsterAttackEntry &&
    selectedMonsterAttackTargetPlayerIds.has(explorer.playerId)
  ) {
    if (selectedMonsterAttackEntry.kind === "phantom-photographer") {
      return {
        kind: "phantomPhotographerAttack",
        payload: {
          monsterId: selectedMonsterAttackEntry.monster.id,
          targetPlayerId: explorer.playerId,
        },
      };
    }
    if (
      selectedMonsterAttackEntry.slot.command ===
      BETRAYAL_COMMANDS.MONSTER_ATTACK_HERO
    ) {
      return {
        kind: "monsterAttackHero",
        payload: {
          monsterId: selectedMonsterAttackEntry.monster.id,
          targetPlayerId: explorer.playerId,
        },
      };
    }
    return {
      kind: "hauntAttackHero",
      payload: {
        target: "hero",
        targetPlayerId: explorer.playerId,
      },
    };
  }

  if (
    activeHauntTargetGuide?.kind === "explorer" &&
    activeHauntTargetGuide.playerId === explorer.playerId &&
    hauntActionKind === "attack-traitor" &&
    explorer.playerId === traitorPlayerId
  ) {
    return { kind: "hauntAttackTraitor" };
  }

  if (
    hauntActionKind === "use" &&
    (magicCameraPhotoTargetPlayerIds.has(explorer.playerId) ||
      helpingHandsTrollHandAttackTargetPlayerIds.has(explorer.playerId))
  ) {
    return { kind: "selectHauntUseTarget", playerId: explorer.playerId };
  }

  if (
    isHeroAttackTargetingMode &&
    heroAttackTargetPlayerIds.has(explorer.playerId)
  ) {
    return { kind: "attackHero", targetPlayerId: explorer.playerId };
  }

  if (
    isDustSicknessExchangeMode &&
    dustTargetPlayerIds.has(explorer.playerId)
  ) {
    return {
      kind: "requestSicknessExchange",
      payload: { targetPlayerId: explorer.playerId },
    };
  }

  if (isDustAttackTargetingMode && dustTargetPlayerIds.has(explorer.playerId)) {
    return { kind: "attackHero", targetPlayerId: explorer.playerId };
  }

  if (isTradeOrLootTargetSelectionActive) {
    const isTradeTarget = activeTradeTargets.some(
      (target) => target.playerId === explorer.playerId,
    );
    const isCorpseLootTarget = corpseLootTargets.some(
      (target) => target.playerId === explorer.playerId,
    );
    if (isTradeTarget || isCorpseLootTarget) {
      return {
        kind: "selectTradeOrLootTarget",
        playerId: explorer.playerId,
        isCorpseLootTarget,
      };
    }
  }

  if (
    selectedInventoryUseEffectMode === "healTraits" &&
    healTargetExplorers.some((target) => target.playerId === explorer.playerId)
  ) {
    return { kind: "selectInventoryTargetPlayer", playerId: explorer.playerId };
  }

  if (
    selectedInventoryUseEffectMode === "moveOthersInRoom" &&
    maskTargetTokens.some(
      (token) => token.kind === "explorer" && token.id === explorer.playerId,
    )
  ) {
    return { kind: "selectMaskTargetToken", tokenId: explorer.playerId };
  }

  return { kind: "none" };
}

export function resolveBetrayalPreviewStateAfterExplorerTargetSelection(
  previousState: PreviewState,
  action: BetrayalExplorerTargetSelectionAction,
): PreviewState {
  switch (action.kind) {
    case "phantomPhotographerAttack":
    case "monsterAttackHero":
    case "hauntAttackHero":
      return {
        ...previousState,
        selectedTradeTargetPlayerId: null,
        selectedMonsterAttackMonsterId: null,
        tradeSelectionTouched: false,
        interactionMode: "default",
        hauntTargetingActionKind: null,
      };
    case "requestSicknessExchange":
      return {
        ...previousState,
        selectedTradeTargetPlayerId: null,
        selectedTradeGiveCardIds: [],
        tradeSelectionTouched: false,
        interactionMode: "default",
        hauntTargetingActionKind: null,
      };
    case "selectHauntUseTarget":
      return {
        ...previousState,
        selectedTradeTargetPlayerId: action.playerId,
        tradeSelectionTouched: true,
      };
    case "selectTradeOrLootTarget":
      return {
        ...previousState,
        interactionMode: "default",
        selectedInventoryTargetPlayerId: null,
        selectedTradeTargetPlayerId: action.playerId,
        selectedTradeReturnCardIds:
          previousState.selectedTradeTargetPlayerId === action.playerId
            ? previousState.selectedTradeReturnCardIds
            : [],
        selectedCorpseLootCardId: action.isCorpseLootTarget
          ? null
          : previousState.selectedCorpseLootCardId,
        tradeSelectionTouched: true,
      };
    case "selectInventoryTargetPlayer":
      return {
        ...previousState,
        selectedInventoryTargetPlayerId: action.playerId,
      };
    case "selectMaskTargetToken":
      return {
        ...previousState,
        activeMaskTargetTokenId: action.tokenId,
      };
    case "hauntAttackTraitor":
    case "attackHero":
    case "none":
      return previousState;
  }
}
