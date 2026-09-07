import type {
    BetrayalCore,
    BetrayalExplorerSummary,
    BetrayalTraitKey,
} from "./game";
import type { BetrayalCommandMap } from "./commandTypes";
import { BETRAYAL_COMMANDS } from "./commands";
import {
    resolveHelpingHandsTrollHandAttackCommandPayload,
    type BetrayalHelpingHandsTrollHandAttackOption,
} from "./hauntAttackRewardReadModel";
import {
    resolveBetrayalHauntSpecialActionStatus,
    type BetrayalHauntSpecialActionId,
    type BetrayalHauntSpecialActionStatus,
} from "./hauntSpecialActionReadModel";
import { resolveDynamiteTargetRooms } from "./roomMapModel";
import {
    DUST_CURE_TRAIT_CHOICES,
    DUST_SEARCH_TRAIT_CHOICES,
    isDustTraitChoice,
} from "./dustHauntRules";

type HauntActionText = (
  key: string,
  options?: Record<string, unknown>,
) => string;

export type BetrayalHauntUseContext<
  Type extends keyof BetrayalCommandMap = keyof BetrayalCommandMap,
> = {
  actionKind: "use";
  commandType: Type;
  payload?: BetrayalCommandMap[Type];
  label: string;
  cue: string;
  hauntSpecialActionId?: BetrayalHauntSpecialActionId;
  disabledReason?: string | null;
};

export type BetrayalHauntActionContext =
  | BetrayalHauntUseContext
  | {
      actionKind: "play-peekaboo";
      hauntSpecialActionId: "play-peekaboo";
      disabledReason: string | null;
      label: string;
      cue: string;
    }
  | {
      actionKind:
        | "sickness-exchange"
        | "attack-dust"
        | "attack-room"
        | "attack-traitor"
        | "attack-hero";
      label: string;
      cue: string;
    };

export type BetrayalDustHauntTraitSelector = {
  actionId: Extract<
    BetrayalHauntSpecialActionId,
    "search-for-cure" | "cure-the-dust"
  >;
  choices: readonly BetrayalTraitKey[];
  selectedTrait: BetrayalTraitKey | null;
  testIdPrefix: string;
};

export type BetrayalHauntUseVisualPlan = {
  sourceRoomId: string;
  targetTestId: string;
  attachedTo: "explorer" | "mummy";
};

export type BetrayalHauntActionContextInput = {
  t: HauntActionText;
  core: BetrayalCore;
  shouldPauseHauntBoardActions: boolean;
  selectedDustSearchTrait: BetrayalTraitKey | null;
  selectedDustCureTrait: BetrayalTraitKey | null;
  selectedAttackWeaponEffectId: string | null;
  traitorAttackTargetPlayerId: string | null;
  heroAttackTargets: readonly BetrayalExplorerSummary[];
  hasDynamiteAttackWeaponCard: boolean;
  dustSameRoomLivingTargetCount: number;
  isDustSicknessExchangeMode: boolean;
  helpingHandsTrollHandAttackOption: BetrayalHelpingHandsTrollHandAttackOption | null;
  helpingHandsTrollHandAttackTarget: BetrayalExplorerSummary | null;
  helpingHandsTrollHandAttackTargetName: string;
  magicCameraPhotoTarget: BetrayalExplorerSummary | null;
  magicCameraPhotoTrait: BetrayalTraitKey;
  resolvePlayerName: (playerId: string, explorerName: string) => string;
};

export function resolveBetrayalHauntActionContext({
  t,
  core,
  shouldPauseHauntBoardActions,
  selectedDustSearchTrait,
  selectedDustCureTrait,
  selectedAttackWeaponEffectId,
  traitorAttackTargetPlayerId,
  heroAttackTargets,
  hasDynamiteAttackWeaponCard,
  dustSameRoomLivingTargetCount,
  isDustSicknessExchangeMode,
  helpingHandsTrollHandAttackOption,
  helpingHandsTrollHandAttackTarget,
  helpingHandsTrollHandAttackTargetName,
  magicCameraPhotoTarget,
  magicCameraPhotoTrait,
  resolvePlayerName,
}: BetrayalHauntActionContextInput): BetrayalHauntActionContext | null {
  if (core.phase !== "haunt" || shouldPauseHauntBoardActions) {
    return null;
  }

  const isTraitor =
    core.scenarioRuntime.traitorPlayerId === core.currentExplorer.playerId;
  const isDead = core.scenarioRuntime.deadExplorerPlayerIds.includes(
    core.currentExplorer.playerId,
  );
  const mummyRuntime = core.scenarioRuntime.mummy;
  const mummyMonster = mummyRuntime
    ? (core.monsters.find(
        (monster) =>
          monster.id === mummyRuntime.mummyMonsterId ||
          monster.definitionId === "mummy",
      ) ?? null)
    : null;
  const mummyWeddingOmenCard =
    core.currentExplorer.inventory.find(
      (card) =>
        card.kind === "omen" &&
        (card.id === "holy-symbol" || card.id === "ring"),
    ) ?? null;
  const defaultDustSearchTrait = resolveHighestTraitChoice(
    core.currentExplorer.traits,
    DUST_SEARCH_TRAIT_CHOICES,
  );
  const dustSearchTrait = isDustTraitChoice(
    DUST_SEARCH_TRAIT_CHOICES,
    selectedDustSearchTrait,
  )
    ? selectedDustSearchTrait
    : defaultDustSearchTrait;
  const defaultDustCureTrait = resolveHighestTraitChoice(
    core.currentExplorer.traits,
    DUST_CURE_TRAIT_CHOICES,
  );
  const dustCureTrait = isDustTraitChoice(
    DUST_CURE_TRAIT_CHOICES,
    selectedDustCureTrait,
  )
    ? selectedDustCureTrait
    : defaultDustCureTrait;
  const canAttackTraitor =
    !isTraitor && !isDead && Boolean(traitorAttackTargetPlayerId);
  const canUseDynamiteRoomAttack = Boolean(
    !isDead &&
    hasDynamiteAttackWeaponCard &&
    resolveDynamiteTargetRooms(core).length > 0,
  );

  const createBudgetedUseContext = <Type extends keyof BetrayalCommandMap>(
    actionId: BetrayalHauntSpecialActionId,
    context: BetrayalHauntUseContext<Type>,
  ) => {
    const status = resolveBetrayalHauntSpecialActionStatus(
      core,
      actionId,
      core.currentExplorer.playerId,
    );
    if (!status.active) {
      return null;
    }
    return {
      ...context,
      hauntSpecialActionId: actionId,
      disabledReason: resolveHauntSpecialActionDisabledReason(t, status),
    };
  };

  if (helpingHandsTrollHandAttackOption && helpingHandsTrollHandAttackTarget) {
    return {
      actionKind: "use",
      commandType: BETRAYAL_COMMANDS.HELPING_HANDS_TROLL_HAND_ATTACK,
      payload: resolveHelpingHandsTrollHandAttackCommandPayload(
        helpingHandsTrollHandAttackOption,
        helpingHandsTrollHandAttackTarget.playerId,
      ),
      label: helpingHandsTrollHandAttackOption.combined
        ? t("board.status.focusHelpingHandsTrollCombinedAttack", {
            player: helpingHandsTrollHandAttackTargetName,
          })
        : t("board.status.focusHelpingHandsTrollAttack", {
            player: helpingHandsTrollHandAttackTargetName,
          }),
      cue: helpingHandsTrollHandAttackOption.combined
        ? t("board.status.actionCueHelpingHandsTrollCombinedAttack", {
            player: helpingHandsTrollHandAttackTargetName,
          })
        : t("board.status.actionCueHelpingHandsTrollAttack", {
            player: helpingHandsTrollHandAttackTargetName,
          }),
    };
  }

  if (magicCameraPhotoTarget) {
    const targetName = resolvePlayerName(
      magicCameraPhotoTarget.playerId,
      magicCameraPhotoTarget.displayName,
    );
    return createBudgetedUseContext("take-photo", {
      actionKind: "use",
      commandType: BETRAYAL_COMMANDS.TAKE_PHOTO,
      payload: {
        targetPlayerId: magicCameraPhotoTarget.playerId,
        trait: magicCameraPhotoTrait,
      },
      label: t("board.status.focusTakePhoto", {
        player: targetName,
        trait: t(`board.traits.${magicCameraPhotoTrait}`),
      }),
      cue: t("board.status.actionCueTakePhoto", {
        player: targetName,
      }),
    });
  }

  const smashCameraContext = createBudgetedUseContext("smash-magic-camera", {
    actionKind: "use",
    commandType: BETRAYAL_COMMANDS.SMASH_MAGIC_CAMERA,
    label: t("board.status.focusSmashMagicCamera"),
    cue: t("board.status.actionCueSmashMagicCamera"),
  });
  if (smashCameraContext) {
    return smashCameraContext;
  }

  const peekabooStatus = resolveBetrayalHauntSpecialActionStatus(
    core,
    "play-peekaboo",
    core.currentExplorer.playerId,
  );
  if (peekabooStatus.active) {
    return {
      actionKind: "play-peekaboo",
      hauntSpecialActionId: "play-peekaboo",
      disabledReason: resolveHauntSpecialActionDisabledReason(
        t,
        peekabooStatus,
      ),
      label: t("board.status.focusPlayPeekaboo"),
      cue: t("board.status.actionCuePlayPeekaboo"),
    };
  }

  if (mummyRuntime && !isDead) {
    const currentRoomId = core.currentExplorer.roomId;
    if (
      mummyRuntime.girlRoomId === currentRoomId &&
      !mummyRuntime.girlHolderPlayerId &&
      !mummyRuntime.girlHeldByMummy
    ) {
      return {
        actionKind: "use",
        commandType: BETRAYAL_COMMANDS.PICK_UP_MUMMY_GIRL,
        label: t("board.status.focusPickUpMummyGirl"),
        cue: t("board.status.actionCuePickUpMummyGirl"),
      };
    }
    if (
      isTraitor &&
      mummyRuntime.girlHolderPlayerId === core.currentExplorer.playerId &&
      mummyMonster?.roomId === currentRoomId
    ) {
      return {
        actionKind: "use",
        commandType: BETRAYAL_COMMANDS.GIVE_GIRL_TO_MUMMY,
        label: t("board.status.focusGiveGirlToMummy"),
        cue: t("board.status.actionCueGiveGirlToMummy"),
      };
    }
    if (
      isTraitor &&
      mummyWeddingOmenCard &&
      mummyMonster?.roomId === currentRoomId &&
      !mummyRuntime.mummyCarriedOmenIds.includes(mummyWeddingOmenCard.id)
    ) {
      return {
        actionKind: "use",
        commandType: BETRAYAL_COMMANDS.GIVE_OMEN_TO_MUMMY,
        payload: { cardId: mummyWeddingOmenCard.id },
        label: t("board.status.focusGiveOmenToMummy", {
          card: mummyWeddingOmenCard.name,
        }),
        cue: t("board.status.actionCueGiveOmenToMummy", {
          card: mummyWeddingOmenCard.name,
        }),
      };
    }
  }

  const banishMummyContext = createBudgetedUseContext("banish-mummy", {
    actionKind: "use",
    commandType: BETRAYAL_COMMANDS.BANISH_MUMMY,
    label: t("board.status.focusBanishMummy"),
    cue: t("board.status.actionCueBanishMummy"),
  });
  if (banishMummyContext) {
    return banishMummyContext;
  }

  const learnMummyBanishmentContext = createBudgetedUseContext(
    "learn-mummy-banishment",
    {
      actionKind: "use",
      commandType: BETRAYAL_COMMANDS.LEARN_MUMMY_BANISHMENT,
      label: t("board.status.focusLearnMummyBanishment"),
      cue: t("board.status.actionCueLearnMummyBanishment"),
    },
  );
  if (learnMummyBanishmentContext) {
    return learnMummyBanishmentContext;
  }

  const studyMummyNameContext = createBudgetedUseContext("study-mummy-name", {
    actionKind: "use",
    commandType: BETRAYAL_COMMANDS.STUDY_MUMMY_NAME,
    label: t("board.status.focusStudyMummyName"),
    cue: t("board.status.actionCueStudyMummyName"),
  });
  if (studyMummyNameContext) {
    return studyMummyNameContext;
  }

  const exorciseJackContext = createBudgetedUseContext("exorcise-jack", {
    actionKind: "use",
    commandType: BETRAYAL_COMMANDS.EXORCISE_JACK,
    label: t("board.status.focusExorciseJack"),
    cue: t("board.status.actionCueExorciseJack"),
  });
  if (exorciseJackContext) {
    return exorciseJackContext;
  }

  if (isDustSicknessExchangeMode) {
    return {
      actionKind: "sickness-exchange",
      label: t("board.status.focusSicknessExchange"),
      cue: t("board.status.actionCueSicknessExchange"),
    };
  }

  const cureDustContext = createBudgetedUseContext("cure-the-dust", {
    actionKind: "use",
    commandType: BETRAYAL_COMMANDS.CURE_THE_DUST,
    payload: { trait: dustCureTrait },
    label: t("board.status.focusCureTheDust", {
      trait: t(`board.traits.${dustCureTrait}`),
    }),
    cue: t("board.status.actionCueCureTheDust", {
      trait: t(`board.traits.${dustCureTrait}`),
    }),
  });
  if (cureDustContext) {
    return cureDustContext;
  }

  const searchDustContext = createBudgetedUseContext("search-for-cure", {
    actionKind: "use",
    commandType: BETRAYAL_COMMANDS.SEARCH_FOR_CURE,
    payload: { trait: dustSearchTrait },
    label: t("board.status.focusSearchForCure", {
      trait: t(`board.traits.${dustSearchTrait}`),
    }),
    cue: t("board.status.actionCueSearchForCure", {
      trait: t(`board.traits.${dustSearchTrait}`),
    }),
  });
  if (searchDustContext) {
    return searchDustContext;
  }

  if (dustSameRoomLivingTargetCount > 0) {
    return {
      actionKind: "attack-dust",
      label: t("board.status.focusAttackDust"),
      cue: t("board.status.actionCueAttackDust"),
    };
  }

  const learnJackContext = createBudgetedUseContext("learn-about-jack", {
    actionKind: "use",
    commandType: BETRAYAL_COMMANDS.LEARN_ABOUT_JACK,
    label: t("board.status.focusLearnAboutJack"),
    cue: t("board.status.actionCueLearnAboutJack"),
  });
  if (learnJackContext) {
    return learnJackContext;
  }

  const studyExorcismContext = createBudgetedUseContext("study-exorcism", {
    actionKind: "use",
    commandType: BETRAYAL_COMMANDS.STUDY_EXORCISM,
    label: t("board.status.focusStudyExorcism"),
    cue: t("board.status.actionCueStudyExorcism"),
  });
  if (studyExorcismContext) {
    return studyExorcismContext;
  }

  if (
    canUseDynamiteRoomAttack &&
    (selectedAttackWeaponEffectId === "dynamite" ||
      (!canAttackTraitor && heroAttackTargets.length === 0))
  ) {
    return {
      actionKind: "attack-room",
      label: t("board.status.focusAttackDynamiteRoom"),
      cue: t("board.status.actionCueAttackDynamiteRoom"),
    };
  }
  if (canAttackTraitor) {
    return {
      actionKind: "attack-traitor",
      label: t("board.status.focusAttackTraitor"),
      cue: t("board.status.actionCueAttackTraitor"),
    };
  }
  if (heroAttackTargets.length > 0) {
    return {
      actionKind: "attack-hero",
      label: t("board.status.focusAttackHeroTarget"),
      cue: t("board.status.actionCueAttackHeroTarget"),
    };
  }
  return null;
}

export function resolveBetrayalDustHauntTraitSelector(
  hauntActionContext: BetrayalHauntActionContext | null,
): BetrayalDustHauntTraitSelector | null {
  if (hauntActionContext?.actionKind !== "use") {
    return null;
  }
  const selectedTrait =
    (hauntActionContext.payload as { trait?: BetrayalTraitKey } | undefined)
      ?.trait ?? null;
  if (hauntActionContext.hauntSpecialActionId === "search-for-cure") {
    return {
      actionId: "search-for-cure",
      choices: DUST_SEARCH_TRAIT_CHOICES,
      selectedTrait,
      testIdPrefix: "betrayal-dust-search-trait",
    };
  }
  if (hauntActionContext.hauntSpecialActionId === "cure-the-dust") {
    return {
      actionId: "cure-the-dust",
      choices: DUST_CURE_TRAIT_CHOICES,
      selectedTrait,
      testIdPrefix: "betrayal-dust-cure-trait",
    };
  }
  return null;
}

export function resolveBetrayalHauntUseVisualPlan(
  core: BetrayalCore,
  hauntActionContext: BetrayalHauntActionContext | null,
): BetrayalHauntUseVisualPlan | null {
  if (hauntActionContext?.actionKind !== "use") {
    return null;
  }
  if (hauntActionContext.commandType === BETRAYAL_COMMANDS.PICK_UP_MUMMY_GIRL) {
    return {
      sourceRoomId: core.currentExplorer.roomId,
      targetTestId: `betrayal-explorer-figure-token-${core.currentExplorer.playerId}`,
      attachedTo: "explorer",
    };
  }
  if (hauntActionContext.commandType !== BETRAYAL_COMMANDS.GIVE_GIRL_TO_MUMMY) {
    return null;
  }
  const mummyMonsterId =
    core.scenarioRuntime.mummy?.mummyMonsterId ??
    core.monsters.find((monster) => monster.definitionId === "mummy")?.id;
  return mummyMonsterId
    ? {
        sourceRoomId: core.currentExplorer.roomId,
        targetTestId: `betrayal-monster-board-token-${mummyMonsterId}`,
        attachedTo: "mummy",
      }
    : null;
}

function resolveHauntSpecialActionDisabledReason(
  t: HauntActionText,
  status: BetrayalHauntSpecialActionStatus,
): string | null {
  if (status.canUse) {
    return null;
  }
  if (!status.phaseEligible) {
    return t("board.status.hauntSpecialActionPreHaunt");
  }
  if (!status.actorAlive) {
    return t("board.status.hauntSpecialActionDead");
  }
  if (status.usedThisTurn) {
    return t("board.status.hauntSpecialActionUsedThisTurn");
  }
  return t("board.status.hauntSpecialActionUnavailable");
}

function resolveHighestTraitChoice(
  traits: BetrayalExplorerSummary["traits"],
  choices: readonly BetrayalTraitKey[],
): BetrayalTraitKey {
  return choices.reduce(
    (highestTrait, trait) =>
      traits[trait] > traits[highestTrait] ? trait : highestTrait,
    choices[0] ?? "might",
  );
}
