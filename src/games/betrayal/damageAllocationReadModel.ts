import type {
  BetrayalCore,
  BetrayalExplorerSummary,
  BetrayalTraitKey,
} from "./game";
import { resolveDamageReductionCardNames } from "./inventoryPresentation";
import {
  TRAIT_DAMAGE_ORDER,
  adjustSelectedDamageTrait,
  countSelectedDamageTrait,
  pruneSelectedDamageTraits,
  resolveTraitDamageAssignableSteps,
} from "./traitPresentation";

type DamageAllocationText = (
  key: string,
  options?: Record<string, unknown>,
) => string;

export type BetrayalDamageAllocationReadModel = {
  allocation: BetrayalCore["pendingDamageAllocation"];
  explorer: BetrayalExplorerSummary | null;
  explorerName: string;
  phase: BetrayalCore["phase"];
  canUseBrooch: boolean;
  usesBrooch: boolean;
  allowedTraits: BetrayalTraitKey[];
  selectedTraits: BetrayalTraitKey[];
  reductionAmount: number;
  reductionSourceLabel: string;
  ready: boolean;
  isForViewer: boolean;
};

export type BetrayalDamageAllocationSelectionState = {
  useBroochForDamageAllocation: boolean;
  selectedDamageAllocationTraits: BetrayalTraitKey[];
};

export type BetrayalResolveDamageAllocationCommandPayload = {
  traits: BetrayalTraitKey[];
  useBrooch?: true;
};

export function resolveBetrayalDamageAllocationReadModel({
  core,
  allExplorers,
  viewerPlayerId,
  selectedDamageAllocationTraits,
  useBroochForDamageAllocation,
  resolvePlayerName,
  text,
}: {
  core: BetrayalCore;
  allExplorers: BetrayalExplorerSummary[];
  viewerPlayerId: string;
  selectedDamageAllocationTraits: BetrayalTraitKey[];
  useBroochForDamageAllocation: boolean;
  resolvePlayerName: (playerId: string, displayName: string) => string;
  text: DamageAllocationText;
}): BetrayalDamageAllocationReadModel {
  const allocation = core.pendingDamageAllocation;
  const explorer = allocation
    ? (allExplorers.find(
        (candidate) => candidate.playerId === allocation.playerId,
      ) ?? null)
    : null;
  const explorerName = explorer
    ? resolvePlayerName(explorer.playerId, explorer.displayName)
    : "";
  const phase: BetrayalCore["phase"] = allocation?.allowSkull
    ? "haunt"
    : "preHaunt";
  const canUseBrooch = Boolean(
    allocation?.damageReplacement &&
      !allocation.forcedTraitSequence &&
      allocation.damageKind !== "general",
  );
  const usesBrooch = canUseBrooch && useBroochForDamageAllocation;
  const allowedTraits = usesBrooch
    ? TRAIT_DAMAGE_ORDER
    : (allocation?.allowedTraits ?? []);
  const selectedTraits =
    allocation && explorer
      ? pruneSelectedDamageTraits(
          selectedDamageAllocationTraits,
          allowedTraits,
          allocation.amount,
          explorer,
          phase,
        )
      : [];
  const reductionAmount = allocation
    ? (allocation.damageReductionAmount ??
      Math.max(0, allocation.originalAmount - allocation.amount))
    : 0;
  const reductionCardNames = resolveDamageReductionCardNames(
    explorer,
    allocation?.damageKind,
  );
  const reductionSourceLabel =
    reductionCardNames.length > 0
      ? reductionCardNames.join("、")
      : text("board.status.damageAllocationReductionFallback");
  return {
    allocation,
    explorer,
    explorerName,
    phase,
    canUseBrooch,
    usesBrooch,
    allowedTraits,
    selectedTraits,
    reductionAmount,
    reductionSourceLabel,
    ready: Boolean(allocation && explorer) && selectedTraits.length === allocation?.amount,
    isForViewer: allocation?.playerId === viewerPlayerId,
  };
}

export function resolveBetrayalDamageAllocationBroochToggle(
  readModel: BetrayalDamageAllocationReadModel,
  selectedDamageAllocationTraits: BetrayalTraitKey[],
): BetrayalDamageAllocationSelectionState | null {
  const { allocation, explorer } = readModel;
  if (
    !allocation ||
    !explorer ||
    !readModel.canUseBrooch ||
    !readModel.isForViewer
  ) {
    return null;
  }
  const nextUseBrooch = !readModel.usesBrooch;
  const nextAllowedTraits = nextUseBrooch
    ? TRAIT_DAMAGE_ORDER
    : allocation.allowedTraits;
  return {
    useBroochForDamageAllocation: nextUseBrooch,
    selectedDamageAllocationTraits: pruneSelectedDamageTraits(
      selectedDamageAllocationTraits,
      nextAllowedTraits,
      allocation.amount,
      explorer,
      readModel.phase,
    ),
  };
}

export function resolveBetrayalDamageAllocationTraitAdjustment({
  readModel,
  selectedDamageAllocationTraits,
  trait,
  delta,
}: {
  readModel: BetrayalDamageAllocationReadModel;
  selectedDamageAllocationTraits: BetrayalTraitKey[];
  trait: BetrayalTraitKey;
  delta: -1 | 1;
}): BetrayalTraitKey[] | null {
  const { allocation, explorer } = readModel;
  if (!allocation || !explorer) {
    return null;
  }
  return adjustSelectedDamageTrait({
    selectedTraits: selectedDamageAllocationTraits,
    trait,
    delta,
    allowedTraits: readModel.allowedTraits,
    amount: allocation.amount,
    explorer,
    phase: readModel.phase,
  });
}

export function canIncrementBetrayalDamageAllocationTrait({
  readModel,
  selectedDamageAllocationTraits,
  trait,
}: {
  readModel: BetrayalDamageAllocationReadModel;
  selectedDamageAllocationTraits: BetrayalTraitKey[];
  trait: BetrayalTraitKey;
}): boolean {
  const { allocation, explorer } = readModel;
  if (!allocation || !explorer) {
    return false;
  }
  const selected = pruneSelectedDamageTraits(
    selectedDamageAllocationTraits,
    readModel.allowedTraits,
    allocation.amount,
    explorer,
    readModel.phase,
  );
  const currentCount = countSelectedDamageTrait(selected, trait);
  const maxTraitCount = Math.min(
    allocation.amount,
    resolveTraitDamageAssignableSteps(explorer, trait, readModel.phase),
  );
  return (
    readModel.isForViewer &&
    readModel.allowedTraits.includes(trait) &&
    currentCount < maxTraitCount &&
    selected.length < allocation.amount
  );
}

export function resolveBetrayalDamageAllocationCommandPayload(
  readModel: BetrayalDamageAllocationReadModel,
): BetrayalResolveDamageAllocationCommandPayload | null {
  if (!readModel.ready) {
    return null;
  }
  return {
    traits: readModel.selectedTraits,
    ...(readModel.usesBrooch ? { useBrooch: true as const } : {}),
  };
}
