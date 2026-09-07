import type {
  BetrayalCore,
  BetrayalInventoryCard,
  BetrayalRoomNode,
  BetrayalTraitKey,
  UseEffectProfile,
} from "./game";
import type { BetrayalAttackWeaponCardStatus } from "./attackRules";
import { resolveInventoryEffectId } from "./possessionEffects";
import { isBetrayalOptionalHauntRollRuntimeSupported } from "./scenarioConfig";
import { pruneSelectedDamageTraits } from "./traitPresentation";

export function mergeEventTraitChoices(
  ...choices: BetrayalTraitKey[][]
): BetrayalTraitKey[] {
  return Array.from(new Set(choices.flat()));
}

export function resolveEventTraitChoices(
  effect: UseEffectProfile,
): BetrayalTraitKey[] {
  if (effect.mode === "chooseTraitRoll") {
    return effect.allowedTraits;
  }
  if (effect.mode === "chosenTrait" || effect.mode === "healChosenTrait") {
    return effect.chosenTrait ? [] : effect.allowedTraits;
  }
  if (effect.mode === "compound") {
    return effect.effects.flatMap(resolveEventTraitChoices);
  }
  return [];
}

export function resolveEventPreviewEffect(
  core: BetrayalCore,
  effect: UseEffectProfile,
  selectedTrait: BetrayalTraitKey | null,
): UseEffectProfile | null {
  if (effect.mode !== "chooseTraitRoll") {
    return effect;
  }
  if (!selectedTrait || !effect.allowedTraits.includes(selectedTrait)) {
    return null;
  }
  const previewTotal = core.currentExplorer.traits[selectedTrait];
  return (
    [...effect.branches]
      .sort((left, right) => right.min - left.min)
      .find((branch) => previewTotal >= branch.min)?.effect ??
    effect.branches[effect.branches.length - 1]?.effect ??
    null
  );
}

export function resolveEventTargetRooms(
  core: BetrayalCore,
  effect: UseEffectProfile | null,
): BetrayalRoomNode[] {
  if (!effect) {
    return [];
  }
  if (effect.mode === "compound") {
    return effect.effects.flatMap((childEffect) =>
      resolveEventTargetRooms(core, childEffect),
    );
  }
  if (effect.mode === "placeExplorerInDiscoveredRoomByFloor") {
    const currentRoom = core.rooms.find(
      (room) => room.id === core.currentExplorer.roomId,
    );
    const requiredRoom = effect.requiredIfDiscoveredVisualIds?.length
      ? core.rooms.find(
          (room) =>
            room.state === "discovered" &&
            effect.requiredIfDiscoveredVisualIds!.includes(room.visualId),
        )
      : null;
    return core.rooms.filter(
      (room) => {
        if (room.state !== "discovered") {
          return false;
        }
        if (requiredRoom) {
          return room.id === requiredRoom.id;
        }
        if (effect.targetRoomScope === "anyDiscovered") {
          return true;
        }
        if (effect.targetRoomScope === "groundDiscovered") {
          return room.floor === "ground";
        }
        if (effect.targetRoomScope === "basementDiscovered") {
          return room.floor === "basement";
        }
        if (effect.targetRoomScope === "groundOrBasementDiscovered") {
          return room.floor === "ground" || room.floor === "basement";
        }
        if (effect.targetRoomScope === "sameFloorDiscovered") {
          return Boolean(currentRoom && room.floor === currentRoom.floor);
        }
        if (effect.targetRoomScope === "differentFloorDiscovered") {
          return Boolean(currentRoom && room.floor !== currentRoom.floor);
        }
        return false;
      },
    );
  }
  if (effect.mode === "placeExplorerInAdjacentRoom") {
    const currentRoom = core.rooms.find(
      (room) => room.id === core.currentExplorer.roomId,
    );
    if (!currentRoom) {
      return [];
    }
    const connectedRoomIds = new Set(currentRoom.connectedRoomIds);
    for (const doorway of currentRoom.doorways) {
      if (doorway.connectsToRoomId) {
        connectedRoomIds.add(doorway.connectsToRoomId);
      }
    }
    return core.rooms.filter(
      (room) => room.state === "discovered" && connectedRoomIds.has(room.id),
    );
  }
  if (effect.mode === "placeSecretPassageToken") {
    if (!effect.targetRoomScope) {
      return [];
    }
    return core.rooms.filter(
      (room) =>
        room.state === "discovered" &&
        room.id !== core.currentExplorer.roomId &&
        !room.markerTokens?.includes("secretPassage") &&
        (!effect.targetRoomScope ||
          effect.targetRoomScope === "anyOtherDiscovered" ||
          (effect.targetRoomScope === "groundDiscovered" &&
            room.floor === "ground") ||
          (effect.targetRoomScope === "basementDiscovered" &&
            room.floor === "basement")),
    );
  }
  return [];
}

export function resolveEventGeneralDamageChoice(
  effect: UseEffectProfile | null,
): Extract<UseEffectProfile, { mode: "generalDamageChoice" }> | null {
  if (!effect) {
    return null;
  }
  if (effect.mode === "generalDamageChoice") {
    return effect;
  }
  if (effect.mode === "compound") {
    for (const childEffect of effect.effects) {
      const damageChoice = resolveEventGeneralDamageChoice(childEffect);
      if (damageChoice) {
        return damageChoice;
      }
    }
  }
  return null;
}

export function resolveEventActionEffect(
  effect: UseEffectProfile,
  accept: boolean,
): UseEffectProfile {
  if (effect.mode === "optionalItemEffect") {
    return accept ? effect.acceptEffect : effect.declineEffect;
  }
  if (!accept && effect.mode === "optionalHauntRoll") {
    return effect.skippedOrStartedEffect;
  }
  if (
    accept &&
    effect.mode === "allTraitChecks" &&
    effect.results?.every((result) => result.passed)
  ) {
    return effect.allPassEffect;
  }
  return effect;
}

export function resolveEventItemChoiceCards(
  inventory: readonly BetrayalInventoryCard[],
  effect: UseEffectProfile | null,
  attackWeaponCardStatuses: readonly BetrayalAttackWeaponCardStatus[],
): BetrayalInventoryCard[] {
  if (effect?.mode !== "optionalItemEffect") {
    return [];
  }
  const attackWeaponEffectIds = new Set(
    attackWeaponCardStatuses.map((status) =>
      resolveInventoryEffectId(status.card.id),
    ),
  );
  return inventory.filter((card) => {
    if (card.kind !== "item") {
      return false;
    }
    if (effect.itemFilter === "nonWeaponItem") {
      return !attackWeaponEffectIds.has(resolveInventoryEffectId(card.id));
    }
    return true;
  });
}

export type BetrayalEventChoiceSelection = {
  trait?: BetrayalTraitKey | null;
  cardId?: string | null;
  targetRoomId?: string | null;
  damageTraits?: BetrayalTraitKey[];
};

export type BetrayalEventChoiceAcceptPreview = {
  trait: BetrayalTraitKey | null;
  cardId: string | null;
  targetRooms: BetrayalRoomNode[];
  targetRoomId: string | null;
  damageChoice: Extract<
    UseEffectProfile,
    { mode: "generalDamageChoice" }
  > | null;
  damageTraits: BetrayalTraitKey[];
  ready: boolean;
};

export type BetrayalEventChoiceCommandPayload = {
  accept: boolean;
  trait?: BetrayalTraitKey;
  cardId?: string;
  targetRoomId?: string;
  traits?: BetrayalTraitKey[];
};

export type BetrayalPendingEventChoiceReadModel = {
  pendingEventChoice: BetrayalCore["pendingEventChoice"];
  pendingEventChoiceIsEventSymbolSkip: boolean;
  isToothNecklaceEndTurnChoice: boolean;
  pendingEventAcceptsUnsupportedHaunt: boolean;
  pendingEventActionEffect: UseEffectProfile | null;
  pendingEventDeclineEffect: UseEffectProfile | null;
  pendingEventAcceptTraitChoices: BetrayalTraitKey[];
  pendingEventDeclineTraitChoices: BetrayalTraitKey[];
  pendingEventTraitChoices: BetrayalTraitKey[];
  selectedEventTrait: BetrayalTraitKey | null;
  pendingEventPreviewEffect: UseEffectProfile | null;
  pendingEventTargetRooms: BetrayalRoomNode[];
  selectedEventTargetRoomId: string | null;
  pendingEventDamageChoice: Extract<
    UseEffectProfile,
    { mode: "generalDamageChoice" }
  > | null;
  shouldShowPendingEventDamageChoice: boolean;
  selectedEventDamageTraits: BetrayalTraitKey[];
  pendingEventItemChoice: Extract<
    UseEffectProfile,
    { mode: "optionalItemEffect" }
  > | null;
  pendingEventItemChoiceCards: BetrayalInventoryCard[];
  selectedEventCardId: string | null;
  pendingEventChoiceRoll: BetrayalCore["recentRoll"];
  pendingEventChoiceAllTraitCheck: BetrayalCore["recentAllTraitCheck"];
  pendingEventChoiceHasResultPanel: boolean;
  pendingEventReady: boolean;
  pendingEventNeedsAcceptSelection: boolean;
  shouldShowPendingEventAcceptButton: boolean;
  pendingEventAwaitsMapTargetClick: boolean;
  pendingEventFocusesMapTarget: boolean;
  pendingEventCanDecline: boolean;
};

export function resolveBetrayalEventChoiceAcceptPreview({
  core,
  readModel,
  selection,
}: {
  core: BetrayalCore;
  readModel: BetrayalPendingEventChoiceReadModel;
  selection: BetrayalEventChoiceSelection;
}): BetrayalEventChoiceAcceptPreview | null {
  if (!readModel.pendingEventChoice || !readModel.pendingEventActionEffect) {
    return null;
  }
  const trait = selection.trait ?? null;
  const cardId = selection.cardId ?? null;
  const previewEffect = resolveEventPreviewEffect(
    core,
    readModel.pendingEventActionEffect,
    trait,
  );
  const targetRooms = resolveEventTargetRooms(core, previewEffect);
  const targetRoomId = selection.targetRoomId ?? null;
  const damageChoice = resolveEventGeneralDamageChoice(previewEffect);
  const damageTraits = damageChoice
    ? pruneSelectedDamageTraits(
        selection.damageTraits ?? [],
        damageChoice.allowedTraits,
        damageChoice.amount,
        core.currentExplorer,
        core.phase,
      )
    : [];

  return {
    trait,
    cardId,
    targetRooms,
    targetRoomId,
    damageChoice,
    damageTraits,
    ready:
      !readModel.pendingEventAcceptsUnsupportedHaunt &&
      (!readModel.pendingEventItemChoice ||
        Boolean(
          cardId &&
            readModel.pendingEventItemChoiceCards.some(
              (card) => card.id === cardId,
            ),
        )) &&
      (!readModel.pendingEventAcceptTraitChoices.length || Boolean(trait)) &&
      (!targetRooms.length ||
        Boolean(
          targetRoomId && targetRooms.some((room) => room.id === targetRoomId),
        )) &&
      (!damageChoice || damageTraits.length === damageChoice.amount),
  };
}

export function resolveBetrayalEventChoiceCommandPayload({
  core,
  readModel,
  accept,
  currentSelection,
  selection,
}: {
  core: BetrayalCore;
  readModel: BetrayalPendingEventChoiceReadModel;
  accept: boolean;
  currentSelection: Required<BetrayalEventChoiceSelection>;
  selection?: BetrayalEventChoiceSelection;
}): BetrayalEventChoiceCommandPayload | null {
  if (!readModel.pendingEventChoice) {
    return null;
  }
  if (!accept) {
    if (!readModel.pendingEventCanDecline) {
      return null;
    }
    return {
      accept: false,
      ...(currentSelection.trait ? { trait: currentSelection.trait } : {}),
    };
  }

  const trait = selection?.trait ?? currentSelection.trait;
  const cardId = selection?.cardId ?? currentSelection.cardId;
  const targetRoomId = selection?.targetRoomId ?? currentSelection.targetRoomId;
  const damageTraits =
    selection?.damageTraits ?? currentSelection.damageTraits;
  const preview = selection
    ? resolveBetrayalEventChoiceAcceptPreview({
        core,
        readModel,
        selection: {
          trait,
          cardId,
          targetRoomId,
          damageTraits,
        },
      })
    : null;
  const ready = selection ? preview?.ready : readModel.pendingEventReady;
  if (!ready) {
    return null;
  }

  const payloadDamageTraits = preview?.damageTraits ?? damageTraits;
  return {
    accept: true,
    ...((preview?.trait ?? trait) ? { trait: preview?.trait ?? trait! } : {}),
    ...((preview?.cardId ?? cardId)
      ? { cardId: preview?.cardId ?? cardId! }
      : {}),
    ...((preview?.targetRoomId ?? targetRoomId)
      ? { targetRoomId: preview?.targetRoomId ?? targetRoomId! }
      : {}),
    ...(payloadDamageTraits.length > 0 ? { traits: payloadDamageTraits } : {}),
  };
}

export function resolveBetrayalPendingEventChoiceReadModel({
  core,
  attackWeaponCardStatuses,
  selectedEventTrait: previewSelectedEventTrait,
  selectedEventTargetRoomId: previewSelectedEventTargetRoomId,
  selectedEventDamageTraits: previewSelectedEventDamageTraits,
  selectedEventCardId: previewSelectedEventCardId,
}: {
  core: BetrayalCore;
  attackWeaponCardStatuses: readonly BetrayalAttackWeaponCardStatus[];
  selectedEventTrait: BetrayalTraitKey | null;
  selectedEventTargetRoomId: string | null;
  selectedEventDamageTraits: BetrayalTraitKey[];
  selectedEventCardId: string | null;
}): BetrayalPendingEventChoiceReadModel {
  const pendingEventChoice = core.pendingEventChoice;
  const pendingEventChoiceIsEventSymbolSkip =
    pendingEventChoice?.sourceKind === "event-symbol-skip";
  const isToothNecklaceEndTurnChoice =
    pendingEventChoice?.itemResolution === "tooth-necklace-end-turn";
  const pendingEventAcceptsUnsupportedHaunt =
    pendingEventChoice?.effect.mode === "optionalHauntRoll" &&
    !isBetrayalOptionalHauntRollRuntimeSupported(
      pendingEventChoice.effect.successHauntId,
    );
  const pendingEventActionEffect =
    pendingEventChoice && !pendingEventAcceptsUnsupportedHaunt
      ? resolveEventActionEffect(pendingEventChoice.effect, true)
      : null;
  const pendingEventDeclineEffect = pendingEventChoice
    ? resolveEventActionEffect(pendingEventChoice.effect, false)
    : null;
  const pendingEventAcceptTraitChoices = pendingEventActionEffect
    ? resolveEventTraitChoices(pendingEventActionEffect)
    : [];
  const pendingEventDeclineTraitChoices = pendingEventDeclineEffect
    ? resolveEventTraitChoices(pendingEventDeclineEffect)
    : [];
  const pendingEventTraitChoices = mergeEventTraitChoices(
    pendingEventAcceptTraitChoices,
    pendingEventDeclineTraitChoices,
  );
  const selectedEventTrait = pendingEventTraitChoices.includes(
    previewSelectedEventTrait!,
  )
    ? previewSelectedEventTrait
    : null;
  const pendingEventPreviewEffect = pendingEventActionEffect
    ? resolveEventPreviewEffect(core, pendingEventActionEffect, selectedEventTrait)
    : null;
  const pendingEventTargetRooms = resolveEventTargetRooms(
    core,
    pendingEventPreviewEffect,
  );
  const selectedEventTargetRoomId = pendingEventTargetRooms.some(
    (room) => room.id === previewSelectedEventTargetRoomId,
  )
    ? previewSelectedEventTargetRoomId
    : null;
  const pendingEventDamageChoice = resolveEventGeneralDamageChoice(
    pendingEventPreviewEffect,
  );
  const shouldShowPendingEventDamageChoice =
    Boolean(pendingEventDamageChoice) &&
    (!pendingEventTargetRooms.length || Boolean(selectedEventTargetRoomId));
  const selectedEventDamageTraits = pendingEventDamageChoice
    ? pruneSelectedDamageTraits(
        previewSelectedEventDamageTraits,
        pendingEventDamageChoice.allowedTraits,
        pendingEventDamageChoice.amount,
        core.currentExplorer,
        core.phase,
      )
    : [];
  const pendingEventItemChoice =
    pendingEventChoice?.effect.mode === "optionalItemEffect"
      ? pendingEventChoice.effect
      : null;
  const pendingEventItemChoiceCards = resolveEventItemChoiceCards(
    core.currentExplorer.inventory,
    pendingEventItemChoice,
    attackWeaponCardStatuses,
  );
  const selectedEventCardId = pendingEventItemChoiceCards.some(
    (card) => card.id === previewSelectedEventCardId,
  )
    ? previewSelectedEventCardId
    : null;
  const pendingEventChoiceRoll =
    pendingEventChoice &&
    core.recentRoll &&
    (core.recentRoll.kind === "eventTraitCheck" ||
      core.recentRoll.kind === "eventDiceRoll") &&
    core.recentRoll.sourceTitle === pendingEventChoice.sourceTitle
      ? core.recentRoll
      : null;
  const pendingEventChoiceAllTraitCheck =
    pendingEventChoice &&
    core.recentAllTraitCheck &&
    core.recentAllTraitCheck.sourceTitle === pendingEventChoice.sourceTitle
      ? core.recentAllTraitCheck
      : null;
  const pendingEventChoiceHasResultPanel = Boolean(
    pendingEventChoiceRoll || pendingEventChoiceAllTraitCheck,
  );
  const pendingEventNeedsAcceptSelection =
    pendingEventAcceptTraitChoices.length > 0 ||
    Boolean(pendingEventItemChoice) ||
    pendingEventTargetRooms.length > 0 ||
    Boolean(pendingEventDamageChoice);
  const pendingEventReady =
    Boolean(pendingEventChoice) &&
    !pendingEventAcceptsUnsupportedHaunt &&
    (!pendingEventItemChoice || Boolean(selectedEventCardId)) &&
    (!pendingEventAcceptTraitChoices.length || Boolean(selectedEventTrait)) &&
    (!pendingEventTargetRooms.length || Boolean(selectedEventTargetRoomId)) &&
    (!pendingEventDamageChoice ||
      selectedEventDamageTraits.length === pendingEventDamageChoice.amount);
  const shouldShowPendingEventAcceptButton =
    Boolean(pendingEventChoice) &&
    (Boolean(pendingEventChoice.declineLabel) ||
      !pendingEventNeedsAcceptSelection);
  const pendingEventAwaitsMapTargetClick =
    pendingEventTargetRooms.length > 0 &&
    !selectedEventTargetRoomId &&
    (!pendingEventTraitChoices.length || Boolean(selectedEventTrait)) &&
    !pendingEventChoice?.declineLabel;

  return {
    pendingEventChoice,
    pendingEventChoiceIsEventSymbolSkip,
    isToothNecklaceEndTurnChoice,
    pendingEventAcceptsUnsupportedHaunt,
    pendingEventActionEffect,
    pendingEventDeclineEffect,
    pendingEventAcceptTraitChoices,
    pendingEventDeclineTraitChoices,
    pendingEventTraitChoices,
    selectedEventTrait,
    pendingEventPreviewEffect,
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
    pendingEventNeedsAcceptSelection,
    shouldShowPendingEventAcceptButton,
    pendingEventAwaitsMapTargetClick,
    pendingEventFocusesMapTarget:
      pendingEventAwaitsMapTargetClick && pendingEventTraitChoices.length > 0,
    pendingEventCanDecline:
      Boolean(pendingEventChoice?.declineLabel) &&
      (isToothNecklaceEndTurnChoice ||
        !pendingEventDeclineTraitChoices.length ||
        Boolean(selectedEventTrait)),
  };
}
