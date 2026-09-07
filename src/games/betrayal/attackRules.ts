import type {
  BetrayalCore,
  BetrayalExplorerSummary,
  BetrayalInventoryCard,
  BetrayalRecentRollState,
  BetrayalTraitKey,
} from "./game";
import type { RandomFn } from "../../engine/types";
import { rollBetrayalDicePips } from "./diceRules";
import {
  findExplorerByPlayerId,
  getAllExplorers,
} from "./explorerReadModel";
import {
  isHelpingHandsHaunt,
  isMagicCameraHaunt,
  resolveControlledRoomId,
} from "./hauntScenarioReadModel";
import { resolveInventoryEffectId } from "./possessionEffects";
import {
  isBetrayalRoomInLineOfSight,
  resolveConnectedRoomIds,
  resolveDynamiteTargetRooms,
} from "./roomMapModel";
import { rollTrait } from "./traitRollModel";

type BetrayalAttackTarget = NonNullable<BetrayalRecentRollState["attack"]>["target"];
type BetrayalAttackRollState = NonNullable<BetrayalRecentRollState["attack"]>;

const DYNAMITE_CARD_ID = "dynamite";

const DEFENSE_EXTRA_DICE_WHEN_ATTACKED_BY_CARD_ID: Record<string, number> = {
  "leather-jacket": 1,
};

const ATTACK_ROLL_BONUS_WEAPONS_BY_CARD_ID: Record<string, number> = {
  "hunting-knife": 1,
};

const ATTACK_EXTRA_DICE_WEAPONS_BY_CARD_ID: Record<string, number> = {
  dagger: 2,
  chainsaw: 1,
};

const ATTACK_SPEED_COST_WEAPONS_BY_CARD_ID: Record<string, number> = {
  dagger: 1,
};

const ATTACK_TRAIT_WEAPONS_BY_CARD_ID: Partial<Record<string, BetrayalTraitKey>> = {
  crossbow: "speed",
  gun: "speed",
  ring: "sanity",
};

const ATTACK_DAMAGE_KIND_WEAPONS_BY_CARD_ID: Record<string, "physical" | "mental"> = {
  ring: "mental",
};

const LINE_OF_SIGHT_ATTACK_WEAPON_CARD_IDS = new Set(["gun"]);

const ADJACENT_ROOM_ATTACK_WEAPON_CARD_IDS = new Set(["crossbow"]);

const DYNAMITE_ATTACK_WEAPON_CARD_IDS = new Set([DYNAMITE_CARD_ID]);

const NO_FAILED_ATTACK_DAMAGE_WEAPON_CARD_IDS = new Set([
  "crossbow",
  "gun",
]);

const ATTACK_WEAPON_CARD_IDS = new Set([
  ...Object.keys(ATTACK_ROLL_BONUS_WEAPONS_BY_CARD_ID),
  ...Object.keys(ATTACK_EXTRA_DICE_WEAPONS_BY_CARD_ID),
  ...Object.keys(ATTACK_SPEED_COST_WEAPONS_BY_CARD_ID),
  ...Object.keys(ATTACK_TRAIT_WEAPONS_BY_CARD_ID),
  ...Object.keys(ATTACK_DAMAGE_KIND_WEAPONS_BY_CARD_ID),
  ...LINE_OF_SIGHT_ATTACK_WEAPON_CARD_IDS,
  ...ADJACENT_ROOM_ATTACK_WEAPON_CARD_IDS,
  ...DYNAMITE_ATTACK_WEAPON_CARD_IDS,
]);

export type BetrayalAttackWeaponRangeKind =
  | "same-room"
  | "same-or-adjacent-room"
  | "line-of-sight";

export type BetrayalAttackWeaponEffect = {
  card: BetrayalInventoryCard;
  bonus: number;
  extraDice: number;
  speedCost: number;
  attackTrait: BetrayalTraitKey;
  damageKind: "physical" | "mental";
  rangeKind: BetrayalAttackWeaponRangeKind;
  attackerTakesDamageOnFailure: boolean;
};

export interface BetrayalAttackWeaponCardStatus {
  card: BetrayalInventoryCard;
  canUse: boolean;
  usedThisTurn: boolean;
  availableAtTurnStart: boolean;
  reason: string | null;
}

export type BetrayalAttackTargetPlayerIds = ReturnType<
  typeof resolveBetrayalAttackTargetPlayerIds
>;

export interface BetrayalAttackDeclarationReadModel {
  attackWeaponCards: BetrayalInventoryCard[];
  dynamiteAttackWeaponCard: BetrayalInventoryCard | null;
  selectedAttackWeaponCardId: string | null;
  selectedAttackWeaponEffectId: string | null;
  selectedAttackTargetPlayerIds: BetrayalAttackTargetPlayerIds;
  attackDeclarationTargetPlayerIds: BetrayalAttackTargetPlayerIds;
  heroAttackTargets: BetrayalExplorerSummary[];
}

export interface BetrayalAttackTargetingReadModel {
  heroAttackTargetPlayerIds: ReadonlySet<string>;
  isHeroAttackTargetingMode: boolean;
  isDustAttackTargetingMode: boolean;
  isDynamiteRoomTargetingMode: boolean;
  isHauntTargetingMode: boolean;
  dynamiteTargetRoomIds: ReadonlySet<string>;
}

export function resolveAttackWeaponEffect(
  explorer: BetrayalExplorerSummary,
  weaponCardId: string | undefined,
): BetrayalAttackWeaponEffect | null {
  if (!weaponCardId) {
    return null;
  }
  const card = explorer.inventory.find((item) => item.id === weaponCardId);
  if (!card) {
    return null;
  }
  const effectId = resolveInventoryEffectId(card.id);
  const bonus = ATTACK_ROLL_BONUS_WEAPONS_BY_CARD_ID[effectId] ?? 0;
  const extraDice = ATTACK_EXTRA_DICE_WEAPONS_BY_CARD_ID[effectId] ?? 0;
  const speedCost = ATTACK_SPEED_COST_WEAPONS_BY_CARD_ID[effectId] ?? 0;
  const attackTrait = ATTACK_TRAIT_WEAPONS_BY_CARD_ID[effectId] ?? "might";
  const damageKind = ATTACK_DAMAGE_KIND_WEAPONS_BY_CARD_ID[effectId] ?? "physical";
  const rangeKind = LINE_OF_SIGHT_ATTACK_WEAPON_CARD_IDS.has(effectId)
    ? "line-of-sight"
    : ADJACENT_ROOM_ATTACK_WEAPON_CARD_IDS.has(effectId)
      ? "same-or-adjacent-room"
      : "same-room";
  const attackerTakesDamageOnFailure =
    !NO_FAILED_ATTACK_DAMAGE_WEAPON_CARD_IDS.has(effectId);
  return bonus > 0 ||
    extraDice > 0 ||
    speedCost > 0 ||
    attackTrait !== "might" ||
    damageKind !== "physical" ||
    rangeKind !== "same-room" ||
    !attackerTakesDamageOnFailure
    ? {
        card,
        bonus,
        extraDice,
        speedCost,
        attackTrait,
        damageKind,
        rangeKind,
        attackerTakesDamageOnFailure,
      }
    : null;
}

export function isDynamiteCardId(cardId: string | undefined): boolean {
  return Boolean(
    cardId && DYNAMITE_ATTACK_WEAPON_CARD_IDS.has(resolveInventoryEffectId(cardId)),
  );
}

export function resolveDynamiteInventoryCard(
  explorer: BetrayalExplorerSummary,
  weaponCardId: string | undefined,
): BetrayalInventoryCard | null {
  if (!isDynamiteCardId(weaponCardId)) {
    return null;
  }
  return (
    explorer.inventory.find(
      (card) => card.id === weaponCardId && isDynamiteCardId(card.id),
    ) ?? null
  );
}

export function resolveAttackWeaponCards(core: BetrayalCore): BetrayalInventoryCard[] {
  return resolveAttackWeaponCardStatuses(core)
    .filter((status) => status.canUse)
    .map((status) => status.card);
}

export function resolveAttackWeaponCardStatuses(
  core: BetrayalCore,
): BetrayalAttackWeaponCardStatus[] {
  return core.currentExplorer.inventory.flatMap((card) => {
    if (!resolveAttackWeaponEffect(core.currentExplorer, card.id) && !isDynamiteCardId(card.id)) {
      return [];
    }
    const availableAtTurnStart = core.turnStartInventoryCardIds.includes(card.id);
    const usedThisTurn = core.usedCardIdsThisTurn.includes(card.id);
    let reason: string | null = null;
    if (!availableAtTurnStart) {
      reason = "本回合新获得的武器不能立刻使用。";
    } else if (usedThisTurn) {
      reason = "这把武器本回合已经使用。";
    }

    return [{
      card,
      canUse: reason === null,
      usedThisTurn,
      availableAtTurnStart,
      reason,
    }];
  });
}

export function resolveBetrayalAttackDeclarationReadModel({
  core,
  attackWeaponCardStatuses,
  selectedAttackWeaponCardId,
}: {
  core: BetrayalCore;
  attackWeaponCardStatuses: readonly BetrayalAttackWeaponCardStatus[];
  selectedAttackWeaponCardId: string | null;
}): BetrayalAttackDeclarationReadModel {
  const attackWeaponCards = attackWeaponCardStatuses
    .filter((status) => status.canUse)
    .map((status) => status.card);
  const dynamiteAttackWeaponCard =
    attackWeaponCards.find((card) => isDynamiteCardId(card.id)) ?? null;
  const normalizedAttackWeaponCardId = attackWeaponCards.some(
    (card) => card.id === selectedAttackWeaponCardId,
  )
    ? selectedAttackWeaponCardId
    : null;
  const selectedAttackWeaponEffectId = normalizedAttackWeaponCardId
    ? resolveInventoryEffectId(normalizedAttackWeaponCardId)
    : null;
  const selectedAttackTargetPlayerIds = resolveBetrayalAttackTargetPlayerIds(
    core,
    normalizedAttackWeaponCardId,
  );
  const traitorPlayerIds = new Set<string>();
  const heroPlayerIds = new Set<string>();
  const mergeTargets = (targets: BetrayalAttackTargetPlayerIds) => {
    if (targets.traitorPlayerId) {
      traitorPlayerIds.add(targets.traitorPlayerId);
    }
    targets.heroPlayerIds.forEach((playerId) => heroPlayerIds.add(playerId));
  };

  mergeTargets(resolveBetrayalAttackTargetPlayerIds(core, null));
  attackWeaponCards.forEach((card) => {
    mergeTargets(resolveBetrayalAttackTargetPlayerIds(core, card.id));
  });
  const attackDeclarationTargetPlayerIds = {
    traitorPlayerId: Array.from(traitorPlayerIds)[0] ?? null,
    heroPlayerIds: Array.from(heroPlayerIds),
  };
  const heroAttackTargets =
    core.phase === "haunt" &&
    core.scenarioRuntime.traitorPlayerId === core.currentExplorer.playerId
      ? getAllExplorers(core).filter((explorer) =>
          attackDeclarationTargetPlayerIds.heroPlayerIds.includes(
            explorer.playerId,
          ),
        )
      : [];

  return {
    attackWeaponCards,
    dynamiteAttackWeaponCard,
    selectedAttackWeaponCardId: normalizedAttackWeaponCardId,
    selectedAttackWeaponEffectId,
    selectedAttackTargetPlayerIds,
    attackDeclarationTargetPlayerIds,
    heroAttackTargets,
  };
}

export function resolveDefenseExtraDiceWhenAttacked(
  explorer: BetrayalExplorerSummary,
): number {
  return explorer.inventory.reduce(
    (total, card) =>
      total +
      (DEFENSE_EXTRA_DICE_WHEN_ATTACKED_BY_CARD_ID[resolveInventoryEffectId(card.id)] ??
        0),
    0,
  );
}

export function resolveFailedAttackDamage(
  defenderRoll: number,
  attackerRoll: number,
  weaponEffect: BetrayalAttackWeaponEffect | null,
): number {
  return weaponEffect?.attackerTakesDamageOnFailure === false
    ? 0
    : Math.max(0, defenderRoll - attackerRoll);
}

export function resolveFailedAttackDamageForWeaponCard(
  defenderRoll: number,
  attackerRoll: number,
  weaponCardId: string | undefined,
): number {
  return weaponCardId &&
    NO_FAILED_ATTACK_DAMAGE_WEAPON_CARD_IDS.has(resolveInventoryEffectId(weaponCardId))
    ? 0
    : Math.max(0, defenderRoll - attackerRoll);
}

export function resolveAttackDamageKind(
  attackTrait: BetrayalTraitKey,
): "physical" | "mental" {
  return attackTrait === "sanity" || attackTrait === "knowledge"
    ? "mental"
    : "physical";
}

export function rollAttackWithDice(
  random: RandomFn,
  explorer: BetrayalExplorerSummary,
  weaponEffect: BetrayalAttackWeaponEffect | null,
): { total: number; dice: number[]; passiveBonus: number } {
  const trait = weaponEffect?.attackTrait ?? "might";
  const dice = rollBetrayalDicePips(
    random,
    explorer.traits[trait] + (weaponEffect?.extraDice ?? 0),
  );
  const passiveBonus = weaponEffect?.bonus ?? 0;
  return {
    total: dice.reduce((sum, pip) => sum + pip, 0) + passiveBonus,
    dice,
    passiveBonus,
  };
}

export function rollAttackDefense(
  random: RandomFn,
  explorer: BetrayalExplorerSummary,
  weaponEffect: BetrayalAttackWeaponEffect | null,
  fallbackTrait: BetrayalTraitKey = "might",
): number {
  const trait = weaponEffect?.attackTrait ?? fallbackTrait;
  const extraDice = resolveDefenseExtraDiceWhenAttacked(explorer);
  return rollTrait(random, explorer.traits[trait] + extraDice);
}

export function canDeferOrdinaryAttackDamageToDefender(
  core: BetrayalCore,
  target: BetrayalAttackTarget,
): boolean {
  return !isMagicCameraHaunt(core)
    && !isHelpingHandsHaunt(core)
    && (target === "traitor" || target === "hero");
}

export function isPendingDamageAllocationForAttackRoll(core: BetrayalCore): boolean {
  const pending = core.pendingDamageAllocation;
  const attack = core.recentRoll?.kind === "attackRoll" ? core.recentRoll.attack : null;
  return Boolean(
    pending
    && attack
    && attack.defenderPlayerId
    && pending.sourceTitle === "攻击"
    && pending.playerId === attack.defenderPlayerId
    && pending.damageKind === attack.damageKind
    && pending.originalAmount === attack.previousDamageToDefender
    && canDeferOrdinaryAttackDamageToDefender(core, attack.target),
  );
}

export function resolveAttackRerollOutcome(
  nextAttackRoll: number,
  attack: BetrayalAttackRollState,
): {
  outcome: "wound" | "jack-damaged" | "no-damage";
  damageToAttacker?: number;
  damageToDefender?: number;
  latestLabel: string;
} {
  if (attack.target === "jack-spirit") {
    return nextAttackRoll > attack.defenderRoll
      ? { outcome: "jack-damaged", latestLabel: "压制杰克之灵" }
      : { outcome: "wound", latestLabel: "未压制杰克之灵" };
  }
  const damageToDefender = Math.max(0, nextAttackRoll - attack.defenderRoll);
  const damageToAttacker = resolveFailedAttackDamageForWeaponCard(
    attack.defenderRoll,
    nextAttackRoll,
    attack.weaponCardId,
  );
  if (nextAttackRoll === attack.defenderRoll) {
    return { outcome: "no-damage", latestLabel: "平手无伤害" };
  }
  return {
    outcome: "wound",
    damageToAttacker: damageToAttacker || undefined,
    damageToDefender: damageToDefender || undefined,
    latestLabel: damageToDefender > 0
      ? `造成 ${damageToDefender} 点伤害`
      : `反受 ${damageToAttacker} 点伤害`,
  };
}

export function isAttackTargetInWeaponRange(
  core: BetrayalCore,
  actorRoomId: string,
  targetRoomId: string,
  weaponEffect: BetrayalAttackWeaponEffect | null,
): boolean {
  if (actorRoomId === targetRoomId) {
    return true;
  }
  if (weaponEffect?.rangeKind === "line-of-sight") {
    return isBetrayalRoomInLineOfSight(core, actorRoomId, targetRoomId);
  }
  if (weaponEffect?.rangeKind === "same-or-adjacent-room") {
    return resolveConnectedRoomIds(core.rooms, actorRoomId).has(targetRoomId);
  }
  return false;
}

export function isDynamiteTargetRoom(
  core: BetrayalCore,
  actorRoomId: string,
  targetRoomId: string,
): boolean {
  return actorRoomId === targetRoomId || resolveConnectedRoomIds(core.rooms, actorRoomId).has(targetRoomId);
}

export function resolveBetrayalAttackTargetPlayerIds(
  core: BetrayalCore,
  weaponCardId?: string | null,
): {
  traitorPlayerId: string | null;
  heroPlayerIds: string[];
} {
  if (core.phase !== "haunt") {
    return { traitorPlayerId: null, heroPlayerIds: [] };
  }
  const actor = core.currentExplorer;
  const isTraitor = core.scenarioRuntime.traitorPlayerId === actor.playerId;
  const actorRoomId = resolveControlledRoomId(core, actor);
  const weaponEffect = weaponCardId ? resolveAttackWeaponEffect(actor, weaponCardId) : null;
  if (weaponCardId && !weaponEffect) {
    return { traitorPlayerId: null, heroPlayerIds: [] };
  }

  if (isHelpingHandsHaunt(core)) {
    return {
      traitorPlayerId: null,
      heroPlayerIds: getAllExplorers(core)
        .filter((explorer) => (
          explorer.playerId !== actor.playerId &&
          !core.scenarioRuntime.deadExplorerPlayerIds.includes(explorer.playerId) &&
          isAttackTargetInWeaponRange(core, actorRoomId, explorer.roomId, weaponEffect)
        ))
        .map((explorer) => explorer.playerId),
    };
  }

  const traitor = core.scenarioRuntime.traitorPlayerId
    ? findExplorerByPlayerId(core, core.scenarioRuntime.traitorPlayerId)
    : null;
  const traitorPlayerId = !isTraitor &&
    traitor &&
    !core.scenarioRuntime.deadExplorerPlayerIds.includes(traitor.playerId) &&
    isAttackTargetInWeaponRange(core, actorRoomId, traitor.roomId, weaponEffect)
    ? traitor.playerId
    : null;
  const heroPlayerIds = isTraitor
    ? getAllExplorers(core)
      .filter((explorer) => (
        explorer.playerId !== actor.playerId &&
        explorer.playerId !== core.scenarioRuntime.traitorPlayerId &&
        !core.scenarioRuntime.deadExplorerPlayerIds.includes(explorer.playerId) &&
        isAttackTargetInWeaponRange(core, actorRoomId, explorer.roomId, weaponEffect)
      ))
      .map((explorer) => explorer.playerId)
    : [];

  return { traitorPlayerId, heroPlayerIds };
}

export function resolveBetrayalAttackTargetingReadModel({
  core,
  selectedAttackWeaponEffectId,
  hauntTargetingActionKind,
  hauntActionKind,
  selectedAttackTargetPlayerIds,
  hasActiveHauntTargetGuide,
}: {
  core: BetrayalCore;
  selectedAttackWeaponEffectId: string | null;
  hauntTargetingActionKind: string | null;
  hauntActionKind: string | null | undefined;
  selectedAttackTargetPlayerIds: BetrayalAttackTargetPlayerIds;
  hasActiveHauntTargetGuide: boolean;
}): BetrayalAttackTargetingReadModel {
  const heroAttackTargetPlayerIds =
    core.phase === "haunt" &&
    core.scenarioRuntime.traitorPlayerId === core.currentExplorer.playerId
      ? new Set(selectedAttackTargetPlayerIds.heroPlayerIds)
      : new Set<string>();
  const isHeroAttackTargetingMode =
    hauntTargetingActionKind === "attack-hero" &&
    hauntActionKind === "attack-hero";
  const isDustAttackTargetingMode =
    hauntTargetingActionKind === "attack-dust" &&
    hauntActionKind === "attack-dust";
  const isDynamiteRoomTargetingMode =
    selectedAttackWeaponEffectId === "dynamite" &&
    Boolean(hauntTargetingActionKind?.startsWith("attack-")) &&
    Boolean(hauntActionKind?.startsWith("attack-"));
  const dynamiteTargetRooms =
    selectedAttackWeaponEffectId === "dynamite"
      ? resolveDynamiteTargetRooms(core)
      : [];

  return {
    heroAttackTargetPlayerIds,
    isHeroAttackTargetingMode,
    isDustAttackTargetingMode,
    isDynamiteRoomTargetingMode,
    isHauntTargetingMode:
      hasActiveHauntTargetGuide || isDynamiteRoomTargetingMode,
    dynamiteTargetRoomIds: new Set(
      dynamiteTargetRooms.map((room) => room.id),
    ),
  };
}

export function formatAttackRangeLabel(
  weaponEffect: BetrayalAttackWeaponEffect | null,
): string {
  if (weaponEffect?.rangeKind === "line-of-sight") {
    return "同板块或视线内";
  }
  if (weaponEffect?.rangeKind === "same-or-adjacent-room") {
    return "同板块或相邻板块";
  }
  return "同板块";
}

export function isAttackWeaponCard(card: BetrayalInventoryCard): boolean {
  return ATTACK_WEAPON_CARD_IDS.has(resolveInventoryEffectId(card.id));
}
