import type {
  Command,
  MatchState,
  RandomFn,
} from "../../../engine/types";
import {
  BetrayalDomain,
  EXPLORER_CATALOG,
  createBetrayalMonsterFromDefinition,
  type BetrayalCore,
  type BetrayalTraitKey,
} from "../game";
import { BETRAYAL_COMMANDS } from "../commands";
import type {
  BetrayalCommand,
  BetrayalCommandMap,
} from "../commandTypes";
import {
  resolveBetrayalMonsterMoveTargetRooms,
  resolveBetrayalMonsterMovementGroups,
  type BetrayalMonsterMovementRollGroupResult,
} from "../monsterActionReadModel";
import {
  BETRAYAL_DISCOVERY_POOLS,
  resolveBetrayalRoomDiscoverySymbol,
  type BetrayalRoomFloor,
  type BetrayalScenarioCardId,
} from "../scenarioConfig";

const BETRAYAL_TRAIT_KEYS: BetrayalTraitKey[] = [
  "might",
  "speed",
  "knowledge",
  "sanity",
];

export const BETRAYAL_FIXED_RANDOM: RandomFn = {
  random: () => 0.42,
  d: (max) => Math.max(1, Math.min(max, 1)),
  range: (min) => min,
  shuffle: (array) => [...array],
};

export function createBetrayalScriptedRandom(
  ...diceResults: number[]
): RandomFn {
  let index = 0;
  return {
    random: () => 0.42,
    d: (max) => {
      const next = diceResults[index] ?? 1;
      index += 1;
      return Math.max(1, Math.min(max, next));
    },
    range: (min) => min,
    shuffle: (array) => [...array],
  };
}

function stateOf(core: BetrayalCore): MatchState<BetrayalCore> {
  return { core, sys: {} as MatchState<BetrayalCore>["sys"] };
}

function buildLinearTestTraitTrack(
  trackId: string,
  value: number,
): BetrayalCore["currentExplorer"]["traitTracks"][BetrayalTraitKey] {
  const currentValue = Math.max(1, Math.round(value));
  const values = [
    Math.max(1, currentValue - 2),
    Math.max(1, currentValue - 1),
    currentValue,
    currentValue + 1,
    currentValue + 2,
  ];
  const startPosition = 2;
  return {
    trackId,
    values,
    position: startPosition,
    startPosition,
    criticalPosition: 0,
    skullPosition: -1,
    maxPosition: values.length - 1,
  };
}

function traitValueAtTestTrack(
  track: BetrayalCore["currentExplorer"]["traitTracks"][BetrayalTraitKey],
): number {
  if (track.position <= track.skullPosition) {
    return 0;
  }
  const position = Math.max(
    track.criticalPosition,
    Math.min(track.maxPosition, track.position),
  );
  return track.values[position] ?? track.values[track.criticalPosition] ?? 1;
}

function syncLegacyTestExplorerTraitTracks(
  explorer: BetrayalCore["currentExplorer"],
): void {
  for (const trait of BETRAYAL_TRAIT_KEYS) {
    const track = explorer.traitTracks[trait];
    const isExplicitTestTrack = track?.trackId.startsWith("test-") ?? false;
    if (!track) {
      explorer.traitTracks[trait] = buildLinearTestTraitTrack(
        `legacy-test-${explorer.explorerId}-${trait}`,
        explorer.traits[trait],
      );
      continue;
    }
    if (explorer.traits[trait] !== traitValueAtTestTrack(track)) {
      if (isExplicitTestTrack) {
        explorer.traits[trait] = traitValueAtTestTrack(track);
        continue;
      }
      explorer.traitTracks[trait] = buildLinearTestTraitTrack(
        `legacy-test-${explorer.explorerId}-${trait}`,
        explorer.traits[trait],
      );
      explorer.traits[trait] = traitValueAtTestTrack(explorer.traitTracks[trait]);
    }
  }
}

function syncLegacyTestCoreTraitTracks(core: BetrayalCore): void {
  syncLegacyTestExplorerTraitTracks(core.currentExplorer);
  for (const explorer of core.otherExplorers) {
    syncLegacyTestExplorerTraitTracks(explorer);
  }
  core.currentExplorerTraits = { ...core.currentExplorer.traits };
}

export function createBetrayalCommand<Type extends keyof BetrayalCommandMap>(
  type: Type,
  playerId: string,
  payload: BetrayalCommandMap[Type],
  timestamp = 100,
): BetrayalCommand {
  return {
    type,
    playerId,
    payload,
    timestamp,
  } as Command<Type & string, BetrayalCommandMap[Type]> as BetrayalCommand;
}

export function applyBetrayalCommand<Type extends keyof BetrayalCommandMap>(
  core: BetrayalCore,
  type: Type,
  playerId: string,
  payload: BetrayalCommandMap[Type],
  timestamp = 100,
  random: RandomFn = BETRAYAL_FIXED_RANDOM,
  finalizeEventRoll = true,
): BetrayalCore {
  syncLegacyTestCoreTraitTracks(core);
  const nextCommand = createBetrayalCommand(type, playerId, payload, timestamp);
  const validation = BetrayalDomain.validate(stateOf(core), nextCommand);
  if (!validation.valid) {
    throw new Error(
      validation.error ?? `invalid betrayal command: ${String(type)}`,
    );
  }
  const nextCore = BetrayalDomain.execute(stateOf(core), nextCommand, random).reduce(
    (nextCore, event) => BetrayalDomain.reduce(nextCore, event),
    core,
  );
  // 规则测试夹具保持旧的“一次调用完成探索事件”便利性；产品页面仍通过独立的 ROLL_EVENT 按钮启动投掷。
  const nextCoreAfterEventRoll =
    type !== BETRAYAL_COMMANDS.ROLL_EVENT && nextCore.pendingEventRollStart
      ? applyBetrayalCommand(
        nextCore,
        BETRAYAL_COMMANDS.ROLL_EVENT,
        nextCore.pendingEventRollStart.playerId,
        { sourceTitle: nextCore.pendingEventRollStart.sourceTitle },
        timestamp + 1,
        random,
        false,
      )
      : nextCore;
  if (
    finalizeEventRoll
    && type !== BETRAYAL_COMMANDS.FINALIZE_EVENT_ROLL
    && nextCoreAfterEventRoll.pendingEventRollResolution
  ) {
    return acknowledgePendingEventRollResolution(nextCoreAfterEventRoll, timestamp, random);
  }
  return nextCoreAfterEventRoll;
}

export function acknowledgePendingEventRollResolution(
  core: BetrayalCore,
  timestamp = 100,
  random: RandomFn = BETRAYAL_FIXED_RANDOM,
): BetrayalCore {
  let nextCore = core;
  let safety = 0;
  while (nextCore.pendingEventRollResolution) {
    if (safety >= 20) {
      throw new Error("山屋测试夹具确认事件骰超过安全上限");
    }
    const pendingResolution = nextCore.pendingEventRollResolution;
    const requiredPlayerIds = pendingResolution.requiredPlayerIds?.length
      ? pendingResolution.requiredPlayerIds
      : nextCore.playerIds.length > 0
        ? nextCore.playerIds
        : [pendingResolution.playerId];
    const acknowledgedPlayerIds = new Set(pendingResolution.acknowledgedPlayerIds ?? []);
    const nextPlayerId = requiredPlayerIds.find((playerId) => !acknowledgedPlayerIds.has(playerId));
    if (!nextPlayerId) {
      throw new Error("山屋测试夹具发现事件骰确认状态无法继续推进");
    }
    nextCore = applyBetrayalCommand(
      nextCore,
      BETRAYAL_COMMANDS.FINALIZE_EVENT_ROLL,
      nextPlayerId,
      { rollId: pendingResolution.rollId },
      timestamp + safety,
      random,
      false,
    );
    safety += 1;
  }
  return nextCore;
}

export function acknowledgePendingCardResolutions(core: BetrayalCore): BetrayalCore {
    let nextCore = core;
    let safety = 0;
    while ((nextCore.pendingCardResolutionQueue ?? []).length > 0) {
    if (safety >= 20) {
      throw new Error("山屋测试夹具确认牌面队列超过安全上限");
    }
        const pendingResolution = nextCore.pendingCardResolutionQueue[0]!;
        const requiredPlayerIds = pendingResolution.requiredPlayerIds?.length
            ? pendingResolution.requiredPlayerIds
            : [pendingResolution.playerId];
        const acknowledgedPlayerIds = new Set(pendingResolution.acknowledgedPlayerIds ?? []);
        const nextPlayerId = requiredPlayerIds.find((playerId) => !acknowledgedPlayerIds.has(playerId));
        if (!nextPlayerId) {
            throw new Error("山屋测试夹具发现牌确认状态无法继续推进");
        }
        nextCore = applyBetrayalCommand(
            nextCore,
            BETRAYAL_COMMANDS.ACKNOWLEDGE_CARD_RESOLUTION,
            nextPlayerId,
            { resolutionId: pendingResolution.id },
        );
        safety += 1;
    }
  return nextCore;
}

export function acknowledgePendingCardResolution(
  core: BetrayalCore,
  playerId: string,
): BetrayalCore {
  const pendingResolution = core.pendingCardResolutionQueue?.[0];
  if (!pendingResolution) {
    throw new Error("山屋测试夹具当前没有待确认的牌面结算");
  }
  return applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.ACKNOWLEDGE_CARD_RESOLUTION,
    playerId,
    { resolutionId: pendingResolution.id },
  );
}

function findFixtureExplorer(
  core: BetrayalCore,
  playerId: string,
): BetrayalCore["currentExplorer"] {
  const explorer = [core.currentExplorer, ...core.otherExplorers].find(
    (candidate) => candidate.playerId === playerId,
  );
  if (!explorer) {
    throw new Error(`山屋测试夹具缺少玩家 ${playerId}`);
  }
  return explorer;
}

function setFixtureTraitTrack(
  core: BetrayalCore,
  playerId: string,
  trait: BetrayalTraitKey,
  values: number[],
  position: number,
  startPosition = position,
): void {
  const explorer = findFixtureExplorer(core, playerId);
  explorer.traitTracks[trait] = {
    trackId: `test-${playerId}-${trait}`,
    values: [...values],
    position,
    startPosition,
    criticalPosition: 0,
    skullPosition: -1,
    maxPosition: values.length - 1,
  };
  explorer.traits[trait] = values[position] ?? 0;
  if (core.currentExplorer.playerId === playerId) {
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
  }
}

function setFixturePhysicalDeathDoor(core: BetrayalCore, playerId: string): void {
  setFixtureTraitTrack(core, playerId, "might", [1], 0);
  setFixtureTraitTrack(core, playerId, "speed", [1], 0);
}

function lethalTraitsForPendingDamage(
  core: BetrayalCore,
  lethalTrait: BetrayalTraitKey = "might",
): BetrayalTraitKey[] {
  const pending = core.pendingDamageAllocation;
  if (!pending) {
    throw new Error("expected pending damage allocation");
  }
  const primaryTrait = pending.allowedTraits.includes(lethalTrait)
    ? lethalTrait
    : pending.allowedTraits[0];
  if (!primaryTrait) {
    throw new Error("pending damage allocation has no allowed traits");
  }
  const explorer = findFixtureExplorer(core, pending.playerId);
  const orderedTraits = [
    primaryTrait,
    ...pending.allowedTraits.filter((trait) => trait !== primaryTrait),
  ];
  const traits: BetrayalTraitKey[] = [];
  let remaining = pending.amount;
  for (const trait of orderedTraits) {
    if (remaining <= 0) {
      break;
    }
    const track = explorer.traitTracks[trait];
    const floorPosition = pending.allowSkull
      ? track.skullPosition
      : track.criticalPosition;
    const assignableSteps = Math.max(0, track.position - floorPosition);
    const take = Math.min(remaining, assignableSteps);
    traits.push(...Array.from({ length: take }, () => trait));
    remaining -= take;
  }
  if (traits.length !== pending.amount) {
    throw new Error(`山屋测试夹具无法为 ${pending.sourceTitle} 分配 ${pending.amount} 点伤害`);
  }
  return traits;
}

function resolvePendingDamageAllocation(
  core: BetrayalCore,
  lethalTrait: BetrayalTraitKey = "might",
): BetrayalCore {
  const pending = core.pendingDamageAllocation;
  if (!pending) {
    return core;
  }
  return applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.RESOLVE_DAMAGE_ALLOCATION,
    pending.playerId,
    { traits: lethalTraitsForPendingDamage(core, lethalTrait) },
  );
}

export function setScenarioTestTurnMovement(
  core: BetrayalCore,
  amount: number,
): void {
  core.turnStartSpeed = amount;
  core.movesRemaining = amount;
}

export function createStartedFirstScenarioCore(
  playerIds: string[] = ["0", "1", "2"],
): BetrayalCore {
  let core = BetrayalDomain.setup(playerIds, BETRAYAL_FIXED_RANDOM);
  for (const [index, playerId] of core.playerIds.entries()) {
    core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.SELECT_EXPLORER, playerId, {
      explorerId: EXPLORER_CATALOG[index % EXPLORER_CATALOG.length]!.explorerId,
    });
    core = applyBetrayalCommand(
      core,
      BETRAYAL_COMMANDS.CONFIRM_EXPLORER,
      playerId,
      {},
    );
    core = applyBetrayalCommand(
      core,
      BETRAYAL_COMMANDS.CONFIRM_SCENARIO_CARD,
      playerId,
      {},
    );
  }
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.START_SCENARIO, "0", {
  });
  core.eventOrder = [
    {
      name: "测试中性事件",
      effect: { mode: "none", recommendedAction: "endTurn" },
    },
  ];
  return core;
}

function applyTutorialDiscoveryOrder(core: BetrayalCore): BetrayalCore {
  const tutorialEvent = BETRAYAL_DISCOVERY_POOLS.events.find(
    (event) => event.name === "标本剥制",
  );
  if (!tutorialEvent) {
    throw new Error("山屋教程缺少官方事件牌：标本剥制");
  }
  core.eventOrder = [tutorialEvent];
  core.deckCounts.event = core.eventOrder.length;
  return core;
}

function applyBasicTutorialEventRoomDiscoveryOrder(core: BetrayalCore): BetrayalCore {
  setFixtureRoomDiscoveryDeck(core, [
    { floor: "ground", room: findFixtureRoomTemplate("ground", "kitchen") },
    { floor: "ground", room: findFixtureRoomTemplate("ground", "observatory") },
    { floor: "ground", room: findFixtureRoomTemplate("ground", "conservatory") },
    { floor: "ground", room: findFixtureRoomTemplate("ground", "graveyard") },
    { floor: "ground", room: findFixtureRoomTemplate("ground", "ballroom") },
    { floor: "upper", room: findFixtureRoomTemplate("upper", "library") },
    { floor: "upper", room: findFixtureRoomTemplate("upper", "tower") },
    { floor: "basement", room: findFixtureRoomTemplate("basement", "chasm") },
  ]);
  return core;
}

function cloneFixtureRoomTemplate(
  room: BetrayalCore["roomDiscoveryDeck"][number]["room"],
): BetrayalCore["roomDiscoveryDeck"][number]["room"] {
  return {
    ...room,
    tags: [...room.tags],
    doorways: [...room.doorways],
  };
}

function findFixtureRoomTemplate(
  floor: BetrayalRoomFloor,
  visualId: string,
): BetrayalCore["roomDiscoveryDeck"][number]["room"] {
  const room = BETRAYAL_DISCOVERY_POOLS.roomDiscoveryByFloor[floor].find(
    (candidate) => candidate.visualId === visualId,
  );
  if (!room) {
    throw new Error(`山屋测试夹具缺少${floor}房间 ${visualId}`);
  }
  return cloneFixtureRoomTemplate(room);
}

function setFixtureRoomDiscoveryDeck(
  core: BetrayalCore,
  deck: BetrayalCore["roomDiscoveryDeck"],
): void {
  const clonedDeck = deck.map((entry) => ({
    floor: entry.floor,
    room: cloneFixtureRoomTemplate(entry.room),
  }));
  core.roomDiscoveryDeck = clonedDeck;
  core.roomDiscoveryOrderByFloor = {
    ground: clonedDeck
      .filter((entry) => entry.floor === "ground")
      .map((entry) => cloneFixtureRoomTemplate(entry.room)),
    upper: clonedDeck
      .filter((entry) => entry.floor === "upper")
      .map((entry) => cloneFixtureRoomTemplate(entry.room)),
    basement: clonedDeck
      .filter((entry) => entry.floor === "basement")
      .map((entry) => cloneFixtureRoomTemplate(entry.room)),
  };
}

function setFixtureDiscoveredRoomVisual(
  core: BetrayalCore,
  roomId: string,
  floor: BetrayalRoomFloor,
  visualId: string,
): void {
  const template = findFixtureRoomTemplate(floor, visualId);
  const discoverySymbol = resolveBetrayalRoomDiscoverySymbol(template);
  core.rooms = core.rooms.map((room) => (
    room.id === roomId
      ? {
          ...room,
          name: template.name,
          hint: template.hint,
          tags: [...template.tags],
          state: "discovered",
          visualId: template.visualId,
          discoveryReward: discoverySymbol === "none" ? null : discoverySymbol,
          discoveryEffect: template.discoveryEffect,
          endTurnEffect: template.endTurnEffect,
          enterEffect: template.enterEffect,
        }
      : room
  ));
}

function cloneTestExplorer(
  explorer: BetrayalCore["currentExplorer"],
): BetrayalCore["currentExplorer"] {
  return {
    ...explorer,
    traits: { ...explorer.traits },
    traitTracks: Object.fromEntries(
      Object.entries(explorer.traitTracks).map(([trait, track]) => [
        trait,
        { ...track, values: [...track.values] },
      ]),
    ) as BetrayalCore["currentExplorer"]["traitTracks"],
    inventory: explorer.inventory.map((card) => ({ ...card })),
  };
}

function focusCoreOnExplorer(
  core: BetrayalCore,
  playerId: string,
): BetrayalCore {
  const explorers = [core.currentExplorer, ...core.otherExplorers];
  const currentExplorer = explorers.find(
    (explorer) => explorer.playerId === playerId,
  );
  if (!currentExplorer) {
    throw new Error(`山屋测试夹具缺少玩家 ${playerId}`);
  }
  const feverishRoomId = core.monsters.find(
    (monster) => monster.id === `feverish-${playerId}`,
  )?.roomId;
  const controlledRoomId =
    core.scenarioRuntime.traitorPlayerId === playerId &&
    core.scenarioRuntime.deadExplorerPlayerIds.includes(playerId) &&
    core.scenarioRuntime.jackSpiritReleased &&
    core.scenarioRuntime.jackSpiritRoomId
      ? core.scenarioRuntime.jackSpiritRoomId
      : core.scenarioRuntime.deadExplorerPlayerIds.includes(playerId) &&
          core.scenarioRuntime.dust?.feverishPlayerIds.includes(playerId) &&
          feverishRoomId
        ? feverishRoomId
      : currentExplorer.roomId;
  const nextCurrentExplorer = cloneTestExplorer(currentExplorer);
  return {
    ...core,
    currentPlayer: playerId,
    currentExplorer: nextCurrentExplorer,
    otherExplorers: explorers
      .filter((explorer) => explorer.playerId !== playerId)
      .map(cloneTestExplorer),
    activeRoomId: controlledRoomId,
    currentExplorerTraits: { ...nextCurrentExplorer.traits },
    currentExplorerInventory: nextCurrentExplorer.inventory.map((card) => ({
      ...card,
    })),
    turnStartInventoryCardIds: nextCurrentExplorer.inventory.map(
      (card) => card.id,
    ),
    usedCardIdsThisTurn: [],
    recommendedAction: "move",
  };
}

export function createStartedFirstScenarioTutorialCore(
  playerIds: string[] = ["0", "1", "2"],
): BetrayalCore {
  const core = createStartedFirstScenarioCore(playerIds);
  setFixtureExplorerInventory(core, "0", [
    { id: "rope", name: "兔脚", kind: "item" },
    { id: "omen-book", name: "书本", kind: "omen" },
  ]);
  setFixtureExplorerInventory(core, "1", [
    { id: "map", name: "地图", kind: "item" },
  ]);
  core.otherExplorers = core.otherExplorers.map((explorer) =>
    explorer.playerId === "1"
      ? { ...explorer, roomId: "hallway" }
      : explorer,
  );
  core.possessionOrderByKind.omen = pickMainPlayerPathOmenOrder();
  core.deckCounts.omen = core.possessionOrderByKind.omen.length;
  core.usedCardIdsThisTurn = [];
  return applyBasicTutorialEventRoomDiscoveryOrder(
    applyTutorialDiscoveryOrder(core),
  );
}

export function createSafeOmenPendingResolutionTutorialCore(): BetrayalCore {
  let core = applyTutorialDiscoveryOrder(createStartedFirstScenarioCore(["0", "1", "2"]));
  const dogOmen =
    BETRAYAL_DISCOVERY_POOLS.possessions.omen.find((omen) => omen.id === "dog") ??
    ({ id: "dog", name: "狗", kind: "omen" } as BetrayalCore["possessionOrderByKind"]["omen"][number]);

  core.drawOrder = ["omen"];
  core.possessionOrderByKind.omen = [{ ...dogOmen }];
  setFixtureRoomDiscoveryDeck(core, [
    { floor: "ground", room: findFixtureRoomTemplate("ground", "observatory") },
    { floor: "ground", room: findFixtureRoomTemplate("ground", "kitchen") },
  ]);
  core.currentExplorer.inventory = [];
  core.currentExplorerInventory = [];
  core.otherExplorers = core.otherExplorers.map((explorer) => ({
    ...explorer,
    inventory: [],
  }));

  core = applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.EXPLORE_ROOM,
    "0",
    { roomId: "ground-east" },
    100,
    createBetrayalScriptedRandom(1, 1, 1, 1),
  );

  if (core.phase !== "preHaunt" || core.scenarioRuntime.hauntTriggered) {
    throw new Error("山屋教程预兆确认夹具不应进入作祟");
  }
  if (core.latestDiscovery?.kind !== "omen") {
    throw new Error("山屋教程预兆确认夹具缺少预兆发现");
  }
  if (core.pendingCardResolutionQueue.length !== 1) {
    throw new Error("山屋教程预兆确认夹具应只保留一次同屏确认");
  }
  const [pendingResolution] = core.pendingCardResolutionQueue;
  if (!pendingResolution || pendingResolution.playerId !== "0") {
    throw new Error("山屋教程预兆确认夹具必须由触发玩家确认");
  }
  if (pendingResolution.requiredPlayerIds.length !== 1 || pendingResolution.requiredPlayerIds[0] !== "0") {
    throw new Error("山屋教程预兆确认夹具必须使用真实触发玩家单人确认");
  }
  if (pendingResolution.acknowledgedPlayerIds.length !== 0) {
    throw new Error("山屋教程预兆确认夹具不能提前确认");
  }

  return core;
}

function pickNaturalHauntTriggerOmenOrder(): BetrayalCore["possessionOrderByKind"]["omen"] {
  const orderedOmenIds = ["ring", "dog", "mask"];
  const orderedOmens = orderedOmenIds.map((id) => {
    const omen = BETRAYAL_DISCOVERY_POOLS.possessions.omen.find((candidate) => candidate.id === id);
    if (!omen) {
      throw new Error(`山屋教程自然作祟流程缺少预兆牌：${id}`);
    }
    return { ...omen };
  });
  const orderedOmenIdSet = new Set(orderedOmenIds);
  return [
    ...orderedOmens,
    ...BETRAYAL_DISCOVERY_POOLS.possessions.omen
      .filter((omen) => !orderedOmenIdSet.has(omen.id))
      .map((omen) => ({ ...omen })),
  ];
}

function pickMainPlayerPathOmenOrder(): BetrayalCore["possessionOrderByKind"]["omen"] {
  const orderedOmenIds = ["ring", "dog", "mask"];
  const unavailableOmenIds = new Set(["omen-book", "skull", ...orderedOmenIds]);
  const orderedOmens = orderedOmenIds.map((id) => {
    const omen = BETRAYAL_DISCOVERY_POOLS.possessions.omen.find((candidate) => candidate.id === id);
    if (!omen) {
      throw new Error(`山屋默认教程自然作祟流程缺少预兆牌：${id}`);
    }
    return { ...omen };
  });
  return [
    ...orderedOmens,
    ...BETRAYAL_DISCOVERY_POOLS.possessions.omen
      .filter((omen) => !unavailableOmenIds.has(omen.id))
      .map((omen) => ({ ...omen })),
  ];
}

export function createNaturalHauntTriggerTutorialCore(): BetrayalCore {
  const core = applyTutorialDiscoveryOrder(createStartedFirstScenarioCore(["0", "1", "2"]));
  core.drawOrder = ["omen"];
  core.possessionOrderByKind.omen = pickNaturalHauntTriggerOmenOrder();
  core.deckCounts.omen = core.possessionOrderByKind.omen.length;
  setFixtureRoomDiscoveryDeck(core, [
    { floor: "ground", room: findFixtureRoomTemplate("ground", "observatory") },
    { floor: "ground", room: findFixtureRoomTemplate("ground", "conservatory") },
    { floor: "ground", room: findFixtureRoomTemplate("ground", "graveyard") },
    { floor: "ground", room: findFixtureRoomTemplate("ground", "ballroom") },
  ]);
  setFixtureDiscoveredRoomVisual(core, "upper-west", "upper", "library");
  core.currentExplorer.roomId = "upper-landing";
  core.activeRoomId = "upper-landing";
  core.usedCardIdsThisTurn = [];
  core.recommendedAction = "endTurn";

  if (core.phase !== "preHaunt" || core.scenarioRuntime.hauntTriggered) {
    throw new Error("山屋教程自然作祟流程必须从作祟前开始");
  }
  if (core.latestDiscovery) {
    throw new Error("山屋教程自然作祟流程不能提前翻出预兆牌");
  }
  if (core.pendingCardResolutionQueue.length !== 0) {
    throw new Error("山屋教程自然作祟流程不能提前存在预兆确认");
  }
  const startingOmenCount = [core.currentExplorer, ...core.otherExplorers]
    .flatMap((explorer) => explorer.inventory)
    .filter((card) => card.kind === "omen").length;
  if (startingOmenCount !== 0) {
    throw new Error("山屋教程自然作祟流程不能直接发放预兆牌");
  }

  return core;
}

export function createNaturalHauntTriggerPendingResolutionTutorialCore(): BetrayalCore {
  let core = createNaturalHauntTriggerTutorialCore();
  const hauntTriggerRandom = createBetrayalScriptedRandom(1, 3, 3, 3, 3, 3);
  core = applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.END_TURN,
    "0",
    {},
    100,
    hauntTriggerRandom,
    false,
  );
  core = applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.EXPLORE_ROOM,
    "1",
    { roomId: "ground-east" },
    101,
    hauntTriggerRandom,
    false,
  );
  core = acknowledgePendingCardResolution(core, "1");
  core = applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.END_TURN,
    "1",
    {},
    102,
    hauntTriggerRandom,
    false,
  );
  core = applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.MOVE_TO_ROOM,
    "2",
    { roomId: "ground-east" },
    103,
    hauntTriggerRandom,
    false,
  );
  core = applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.EXPLORE_ROOM,
    "2",
    { roomId: "frontier-ground-east-east" },
    104,
    hauntTriggerRandom,
    false,
  );
  core = acknowledgePendingCardResolution(core, "2");
  core = applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.END_TURN,
    "2",
    {},
    105,
    hauntTriggerRandom,
    false,
  );
  core = applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.END_TURN,
    "0",
    {},
    106,
    hauntTriggerRandom,
    false,
  );
  core = applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.EXPLORE_ROOM,
    "1",
    { roomId: "frontier-ground-east-south" },
    107,
    hauntTriggerRandom,
    false,
  );

  if (core.phase !== "haunt" || !core.scenarioRuntime.hauntTriggered) {
    throw new Error("山屋教程自然作祟流程未进入作祟");
  }
  if (core.latestDiscovery?.kind !== "omen" || core.latestDiscovery.title !== "面具") {
    throw new Error("山屋教程自然作祟流程必须由队友翻出第三张面具预兆");
  }
  if (core.recentRoll?.kind !== "hauntRoll") {
    throw new Error("山屋教程自然作祟流程必须保留作祟检定骰面");
  }
  if (core.recentRoll.dice.length !== 3) {
    throw new Error("山屋教程自然作祟流程必须由第三张自然预兆掷 3 颗骰触发");
  }
  if (core.scenarioRuntime.traitorPlayerId !== "1") {
    throw new Error("山屋教程自然作祟流程必须让触发作祟的队友成为叛徒");
  }
  if (core.pendingCardResolutionQueue.length !== 1) {
    throw new Error("山屋教程自然作祟流程必须只保留一次同屏确认");
  }
  const [pendingResolution] = core.pendingCardResolutionQueue;
  if (!pendingResolution || pendingResolution.playerId !== "1") {
    throw new Error("山屋教程自然作祟流程必须由触发玩家确认");
  }
  if (pendingResolution.requiredPlayerIds.length !== 1 || pendingResolution.requiredPlayerIds[0] !== "1") {
    throw new Error("山屋教程自然作祟流程必须使用真实触发玩家单人确认");
  }
  if (pendingResolution.acknowledgedPlayerIds.length !== 0) {
    throw new Error("山屋教程自然作祟流程不能提前确认");
  }

  return core;
}

function createScenarioHauntCore(
  playerIds: string[] = ["0", "1", "2"],
  scenarioCardId?: BetrayalScenarioCardId,
): BetrayalCore {
  let core = createStartedFirstScenarioCore(playerIds);
  if (scenarioCardId) {
    core.proposedScenarioCardId = scenarioCardId;
  }
  setFixtureExplorerInventory(core, "0", [
    { id: "omen-book", name: "书本", kind: "omen" },
  ]);
  setFixtureExplorerInventory(core, "1", [
    { id: "ring", name: "指环", kind: "omen" },
  ]);
  setFixtureExplorerInventory(core, "2", [
    { id: "mask", name: "面具", kind: "omen" },
  ]);
  setFixtureRoomDiscoveryDeck(core, [
    { floor: "upper", room: findFixtureRoomTemplate("upper", "library") },
    { floor: "ground", room: findFixtureRoomTemplate("ground", "observatory") },
    { floor: "basement", room: findFixtureRoomTemplate("basement", "ritualRoom") },
  ]);
  const hauntTriggerRandom = createBetrayalScriptedRandom(
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    3,
    3,
    3,
    3,
    3,
    3, // 开局已有 3 张预兆；三次探索按 4/5/6 骰检定，前两次不触发、第三次触发
  );

  setScenarioTestTurnMovement(core, 6);
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "hallway",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "grand-staircase",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "upper-landing",
  });
  core = applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.EXPLORE_ROOM,
    "0",
    {},
    100,
    hauntTriggerRandom,
  );
  core = acknowledgePendingCardResolutions(core);
  if (core.phase === "haunt") {
    setScenarioTestTurnMovement(core, 6);
    return core;
  }
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, "0", {});

  setScenarioTestTurnMovement(core, 6);
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "1", {
    roomId: "hallway",
  });
  core = applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.EXPLORE_ROOM,
    "1",
    {},
    100,
    hauntTriggerRandom,
  );
  core = acknowledgePendingCardResolutions(core);
  if (core.phase === "haunt") {
    setScenarioTestTurnMovement(core, 6);
    return core;
  }
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, "1", {});

  setScenarioTestTurnMovement(core, 6);
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "2", {
    roomId: "hallway",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "2", {
    roomId: "grand-staircase",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "2", {
    roomId: "basement-landing",
  });
  core = applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.EXPLORE_ROOM,
    "2",
    {},
    100,
    hauntTriggerRandom,
  );
  core = acknowledgePendingCardResolutions(core);

  setScenarioTestTurnMovement(core, 6);
  if (scenarioCardId === "crimson-jack-returns") {
    setFixtureDiscoveredRoomVisual(core, "upper-west", "upper", "library");
    setFixtureDiscoveredRoomVisual(core, "ground-north", "ground", "kitchen");
    setFixtureDiscoveredRoomVisual(core, "basement-east", "basement", "chasm");
  }
  return core;
}

export function createFirstScenarioHauntCore(
  playerIds: string[] = ["0", "1", "2"],
): BetrayalCore {
  return createScenarioHauntCore(playerIds);
}

function placeFixtureExplorerInRoom(
  core: BetrayalCore,
  playerId: string,
  roomId: string,
): void {
  const focusedCore = focusCoreOnExplorer(core, playerId);
  Object.assign(core, focusedCore);
  core.currentExplorer.roomId = roomId;
  core.activeRoomId = roomId;
  core.turnEndedByDiscovery = false;
  core.pendingEventChoice = null;
  core.pendingDamageAllocation = null;
  core.recentRoll = null;
}

function setFixtureExplorerInventory(
  core: BetrayalCore,
  playerId: string,
  inventory: BetrayalCore["currentExplorer"]["inventory"],
): void {
  const nextInventory = inventory.map((card) => ({ ...card }));
  if (core.currentExplorer.playerId === playerId) {
    core.currentExplorer.inventory = nextInventory;
    core.currentExplorerInventory = nextInventory.map((card) => ({ ...card }));
    core.turnStartInventoryCardIds = nextInventory.map((card) => card.id);
    return;
  }
  core.otherExplorers = core.otherExplorers.map((explorer) =>
    explorer.playerId === playerId
      ? { ...explorer, inventory: nextInventory.map((card) => ({ ...card })) }
      : explorer,
  );
}

function clearTutorialBlockingState(core: BetrayalCore): void {
  core.latestDiscovery = null;
  core.latestDiscoveryOwnerPlayerId = null;
  core.pendingCardResolutionQueue = [];
  core.pendingEventChoice = null;
  core.pendingDamageAllocation = null;
  core.recentRoll = null;
  core.activePlayerId = null;
  core.usedCardIdsThisTurn = [];
}

function completeMummyMonsterPreparationForAttackSlot(
  core: BetrayalCore,
  monsterId: string,
): void {
  const movementGroup = resolveBetrayalMonsterMovementGroups(core)
    .find((group) => group.monsterIds.includes(monsterId));
  if (!movementGroup) {
    throw new Error(`木乃伊教程夹具找不到 ${monsterId} 的怪物移动骰组`);
  }
  const movementResult: BetrayalMonsterMovementRollGroupResult = {
    groupId: movementGroup.groupId,
    monsterName: movementGroup.monsterName,
    monsterIds: [...movementGroup.monsterIds],
    playerId: core.currentExplorer.playerId,
    speed: movementGroup.speed,
    diceCount: movementGroup.diceCount,
    dice: Array.from({ length: movementGroup.diceCount }, () => 0),
    total: 0,
    moveAllowance: 0,
    rollOnceForGroup: true,
    minimumMoveAllowance: movementGroup.minimumMoveAllowance,
  };
  core.scenarioRuntime.monsterTurn = {
    ...core.scenarioRuntime.monsterTurn,
    resolvedStartMonsterIds: Array.from(new Set([
      ...core.scenarioRuntime.monsterTurn.resolvedStartMonsterIds,
      ...movementGroup.monsterIds,
    ])),
    movementRollsByGroupId: {
      ...core.scenarioRuntime.monsterTurn.movementRollsByGroupId,
      [movementGroup.groupId]: movementResult,
    },
    moveRemainingById: {
      ...core.scenarioRuntime.monsterTurn.moveRemainingById,
      ...Object.fromEntries(movementGroup.monsterIds.map((id) => [id, 0])),
    },
  };
}

export function createMummyReadyToBanishCore(): BetrayalCore {
  let core = createFirstScenarioHauntCore();
  const heroId = "0";
  const studyRandom = createBetrayalScriptedRandom(3, 3, 3, 3);
  const learnRandom = createBetrayalScriptedRandom(3, 3, 3, 3);

  placeFixtureExplorerInRoom(core, heroId, "upper-west");
  core = applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.STUDY_MUMMY_NAME,
    heroId,
    {},
    100,
    studyRandom,
  );
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, "0", {});
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, "1", {});
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, "2", {});

  placeFixtureExplorerInRoom(core, heroId, "upper-west");
  core = applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.LEARN_MUMMY_BANISHMENT,
    heroId,
    {},
    100,
    learnRandom,
  );
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, "0", {});
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, "1", {});
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, "2", {});

  placeFixtureExplorerInRoom(
    core,
    heroId,
    core.scenarioRuntime.mummy!.sarcophagusRoomId,
  );
  return core;
}

export function createMummyReadyToBanishTutorialCore(): BetrayalCore {
  return applyTutorialDiscoveryOrder(createMummyReadyToBanishCore());
}

export function createMummyTraitorVictoryReadyTutorialCore(): BetrayalCore {
  let core = createFirstScenarioHauntCore();
  const traitorId = core.scenarioRuntime.traitorPlayerId!;
  const mummyRuntime = core.scenarioRuntime.mummy!;
  const traitorRoomId = mummyRuntime.sarcophagusRoomId;
  const awayRoomId =
    core.rooms.find((room) => room.state === "discovered" && room.id !== traitorRoomId)?.id ??
    traitorRoomId;

  core = focusCoreOnExplorer(core, traitorId);
  core.currentExplorer = {
    ...core.currentExplorer,
    roomId: traitorRoomId,
  };
  core.otherExplorers = core.otherExplorers.map((explorer) => ({
    ...explorer,
    roomId: explorer.playerId === traitorId ? traitorRoomId : awayRoomId,
  }));
  setFixtureExplorerInventory(core, traitorId, [
    { id: "holy-symbol", name: "圣符", kind: "omen" },
  ]);
  core.monsters = core.monsters.map((monster) =>
    monster.id === mummyRuntime.mummyMonsterId || monster.definitionId === "mummy"
      ? { ...monster, roomId: traitorRoomId }
      : monster,
  );
  core.scenarioRuntime.mummy = {
    ...mummyRuntime,
    sarcophagusRoomId: traitorRoomId,
    girlRoomId: traitorRoomId,
    girlHolderPlayerId: null,
    girlHeldByMummy: false,
    mummyCarriedOmenIds: [],
    mummyCarriedCards: [],
  };
  core.currentPlayer = traitorId;
  core.activeRoomId = traitorRoomId;
  core.currentExplorerRoomId = traitorRoomId;
  core.currentExplorerTraits = { ...core.currentExplorer.traits };
  core.currentExplorerInventory = core.currentExplorer.inventory.map((card) => ({ ...card }));
  core.turnStartInventoryCardIds = core.currentExplorer.inventory.map((card) => card.id);
  core.usedCardIdsThisTurn = [];
  core.pendingEventChoice = null;
  core.pendingDamageAllocation = null;
  core.latestDiscovery = null;
  core.latestDiscoveryOwnerPlayerId = null;
  core.pendingCardResolutionQueue = [];
  core.recentRoll = null;
  core.recommendedAction = "use";
  const completedMonsterIds = core.monsters.map((monster) => monster.id);
  core.scenarioRuntime.monsterTurn = {
    ...core.scenarioRuntime.monsterTurn,
    resolvedStartMonsterIds: completedMonsterIds,
    skippedMonsterIdsThisTurn: completedMonsterIds,
    attackedMonsterIdsThisTurn: completedMonsterIds,
    movedMonsterIdsThisTurn: completedMonsterIds,
    movementRollsByGroupId: {},
    moveRemainingById: Object.fromEntries(
      completedMonsterIds.map((monsterId) => [monsterId, 0]),
    ),
  };

  return applyTutorialDiscoveryOrder(core);
}

export function createMummyMonsterMoveReadyTutorialCore(): BetrayalCore {
  let core = createFirstScenarioHauntCore();
  const traitorId = core.scenarioRuntime.traitorPlayerId!;
  const mummyRuntime = core.scenarioRuntime.mummy!;
  const mummyMonsterId = mummyRuntime.mummyMonsterId;
  const mummyRoomId = mummyRuntime.sarcophagusRoomId;
  const girlRoomId = mummyRuntime.girlRoomId;
  if (!girlRoomId) {
    throw new Error("木乃伊怪物移动教程夹具缺少女孩房间");
  }
  const quietRoomId =
    core.rooms.find((room) => (
      room.state === "discovered"
      && room.id !== mummyRoomId
      && room.id !== girlRoomId
    ))?.id ?? mummyRoomId;

  core = focusCoreOnExplorer(core, traitorId);
  core.currentExplorer = {
    ...core.currentExplorer,
    roomId: mummyRoomId,
  };
  core.otherExplorers = core.otherExplorers.map((explorer) => ({
    ...explorer,
    roomId: quietRoomId,
  }));
  core.monsters = core.monsters.map((monster) =>
    monster.id === mummyMonsterId || monster.definitionId === "mummy"
      ? { ...monster, roomId: mummyRoomId }
      : monster,
  );
  core.scenarioRuntime.mummy = {
    ...mummyRuntime,
    girlRoomId,
    girlHolderPlayerId: null,
    girlHeldByMummy: false,
  };
  core.currentPlayer = traitorId;
  core.activeRoomId = mummyRoomId;
  core.currentExplorerRoomId = mummyRoomId;
  core.currentExplorerTraits = { ...core.currentExplorer.traits };
  core.currentExplorerInventory = core.currentExplorer.inventory.map((card) => ({ ...card }));
  core.turnStartInventoryCardIds = core.currentExplorer.inventory.map((card) => card.id);
  core.recommendedAction = "use";
  clearTutorialBlockingState(core);

  return applyTutorialDiscoveryOrder(core);
}

export function createMummyMonsterAttackRewardReadyTutorialCore(): BetrayalCore {
  let core = createFirstScenarioHauntCore();
  const traitorId = core.scenarioRuntime.traitorPlayerId!;
  const mummyRuntime = core.scenarioRuntime.mummy!;
  const mummyMonsterId = mummyRuntime.mummyMonsterId;
  const mummyRoomId = mummyRuntime.sarcophagusRoomId;
  const [heroTargetId, deadHeroId] = core.playerIds.filter((playerId) => playerId !== traitorId);
  if (!heroTargetId || !deadHeroId) {
    throw new Error("木乃伊攻击教程夹具缺少英雄目标");
  }

  placeFixtureExplorerInRoom(core, traitorId, mummyRoomId);
  placeFixtureExplorerInRoom(core, heroTargetId, mummyRoomId);
  setFixtureExplorerInventory(core, heroTargetId, [
    { id: "map", name: "地图", kind: "item" },
    { id: "holy-symbol", name: "圣符", kind: "omen" },
  ]);
  placeFixtureExplorerInRoom(core, deadHeroId, mummyRoomId);
  core.scenarioRuntime.deadExplorerPlayerIds = [deadHeroId];

  core = focusCoreOnExplorer(core, traitorId);
  core.monsters = core.monsters.map((monster) =>
    monster.id === mummyMonsterId || monster.definitionId === "mummy"
      ? { ...monster, roomId: mummyRoomId }
      : monster,
  );
  core.scenarioRuntime.mummy = {
    ...mummyRuntime,
    girlRoomId: null,
    girlHolderPlayerId: null,
    girlHeldByMummy: false,
    mummyCarriedOmenIds: [],
    mummyCarriedCards: [],
  };
  core.currentPlayer = traitorId;
  core.activeRoomId = mummyRoomId;
  core.currentExplorerRoomId = mummyRoomId;
  core.currentExplorerTraits = { ...core.currentExplorer.traits };
  core.currentExplorerInventory = core.currentExplorer.inventory.map((card) => ({ ...card }));
  core.turnStartInventoryCardIds = core.currentExplorer.inventory.map((card) => card.id);
  core.recommendedAction = "use";
  clearTutorialBlockingState(core);
  completeMummyMonsterPreparationForAttackSlot(core, mummyMonsterId);

  return applyTutorialDiscoveryOrder(core);
}

export function playMummyScenarioToSurvivorVictory(): BetrayalCore {
  return applyBetrayalCommand(
    createMummyReadyToBanishCore(),
    BETRAYAL_COMMANDS.BANISH_MUMMY,
    "0",
    {},
    100,
    createBetrayalScriptedRandom(3, 3, 3, 3, 1, 1, 1, 1, 1),
  );
}

export function playMummyScenarioToTraitorVictory(): BetrayalCore {
  let core = createFirstScenarioHauntCore();
  const traitorId = core.scenarioRuntime.traitorPlayerId!;
  const mummyRuntime = core.scenarioRuntime.mummy!;
  const sarcophagusRoomId = mummyRuntime.sarcophagusRoomId;
  const girlRoomId = mummyRuntime.girlRoomId!;
  const mummyMonsterId = mummyRuntime.mummyMonsterId;

  placeFixtureExplorerInRoom(core, traitorId, girlRoomId);
  core = applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.PICK_UP_MUMMY_GIRL,
    traitorId,
    {},
  );

  const stagingRoom = core.rooms.find((room) => {
    if (room.id === sarcophagusRoomId || room.state !== "discovered") {
      return false;
    }
    core.monsters = core.monsters.map((monster) =>
      monster.id === mummyMonsterId ? { ...monster, roomId: room.id } : monster,
    );
    return resolveBetrayalMonsterMoveTargetRooms(core, mummyMonsterId).some(
      (targetRoom) => targetRoom.id === sarcophagusRoomId,
    );
  });
  if (!stagingRoom) {
    throw new Error("木乃伊测试夹具缺少能回到石棺的邻接房间");
  }
  const stagingRoomId = stagingRoom.id;
  core.monsters = core.monsters.map((monster) =>
    monster.id === mummyMonsterId
      ? { ...monster, roomId: stagingRoomId }
      : monster,
  );

  placeFixtureExplorerInRoom(core, traitorId, stagingRoomId);
  setFixtureExplorerInventory(core, traitorId, [
    { id: "holy-symbol", name: "圣符", kind: "omen" },
  ]);
  core = applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.GIVE_GIRL_TO_MUMMY,
    traitorId,
    {},
  );
  core = applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.GIVE_OMEN_TO_MUMMY,
    traitorId,
    { cardId: "holy-symbol" },
  );
  core.scenarioRuntime.monsterTurn = {
    ...core.scenarioRuntime.monsterTurn,
    moveRemainingById: {
      ...core.scenarioRuntime.monsterTurn.moveRemainingById,
      [mummyMonsterId]: 3,
    },
  };
  return applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_MONSTER_TO_ROOM, traitorId, {
    monsterId: mummyMonsterId,
    roomId: sarcophagusRoomId,
  });
}

export function createCrimsonJackHauntCore(
  playerIds: string[] = ["0", "1", "2"],
): BetrayalCore {
  return createScenarioHauntCore(playerIds, "crimson-jack-returns");
}

export function createFirstScenarioHauntTutorialCore(): BetrayalCore {
  return applyTutorialDiscoveryOrder(createFirstScenarioHauntCore());
}

export function createDustHauntCore(
  playerIds: string[] = ["0", "1", "2"],
): BetrayalCore {
  let core = createStartedFirstScenarioCore(playerIds);
  const dustEvent = BETRAYAL_DISCOVERY_POOLS.events.find(
    (event) => event.name === "一瓶微尘",
  );
  if (!dustEvent) {
    throw new Error("山屋测试夹具缺少官方事件牌：一瓶微尘");
  }
  core.drawOrder = ["event"];
  core.eventOrder = [dustEvent];
  setFixtureRoomDiscoveryDeck(core, [
    { floor: "ground", room: findFixtureRoomTemplate("ground", "kitchen") },
  ]);
  core.currentExplorer.inventory = [
    ...core.currentExplorer.inventory,
    { id: "omen-book", name: "书本", kind: "omen" },
    { id: "dog", name: "狗", kind: "omen" },
    { id: "mask", name: "面具", kind: "omen" },
  ];
  core.currentExplorerInventory = core.currentExplorer.inventory.map((card) => ({
    ...card,
  }));
  core.currentExplorerTraits = { ...core.currentExplorer.traits };

  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "hallway",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.EXPLORE_ROOM, "0", {
    roomId: "ground-north",
  });
  if (core.pendingEventChoice) {
    core = applyBetrayalCommand(
      core,
      BETRAYAL_COMMANDS.RESOLVE_EVENT_CHOICE,
      "0",
      { accept: true },
      100,
      createBetrayalScriptedRandom(3, 3, 3),
    );
  }
  if (core.pendingEventRollResolution) {
    core = acknowledgePendingEventRollResolution(core);
  }
  core = acknowledgePendingCardResolutions(core);
  if (core.phase !== "haunt" || !core.scenarioRuntime.dust) {
    throw new Error("山屋灰尘作祟夹具未生成事件选择或 dust 运行态");
  }
  return core;
}

function isFixtureMagicCameraCard(
  card: BetrayalCore["currentExplorer"]["inventory"][number],
): boolean {
  return card.id === "camera" || card.name === "魔法相机";
}

function removeFixtureMagicCameraFromExplorer(
  explorer: BetrayalCore["currentExplorer"],
): BetrayalCore["currentExplorer"] {
  return {
    ...explorer,
    inventory: explorer.inventory.filter((card) => !isFixtureMagicCameraCard(card)),
  };
}

export function createMagicCameraHauntCore(
  cameraOwnerPlayerId: string | null = "1",
): BetrayalCore {
  let core = createStartedFirstScenarioCore(["0", "1", "2"]);
  const cameraEvent = BETRAYAL_DISCOVERY_POOLS.events.find(
    (event) => event.name === "说“茄子”！",
  );
  if (!cameraEvent) {
    throw new Error("山屋测试夹具缺少官方事件牌：说“茄子”！");
  }
  core.drawOrder = ["event"];
  core.eventOrder = [cameraEvent];
  setFixtureRoomDiscoveryDeck(core, [
    { floor: "ground", room: findFixtureRoomTemplate("ground", "kitchen") },
  ]);
  core.currentExplorer = removeFixtureMagicCameraFromExplorer(core.currentExplorer);
  core.otherExplorers = core.otherExplorers.map(removeFixtureMagicCameraFromExplorer);
  core.currentExplorer.inventory = [
    ...core.currentExplorer.inventory,
    { id: "omen-book", name: "书本", kind: "omen" },
    { id: "dog", name: "狗", kind: "omen" },
    { id: "mask", name: "面具", kind: "omen" },
  ];
  if (cameraOwnerPlayerId === "0") {
    core.currentExplorer.inventory = [
      ...core.currentExplorer.inventory,
      { id: "camera", name: "魔法相机", kind: "item" },
    ];
  }
  core.currentExplorerInventory = [...core.currentExplorer.inventory];
  core.currentExplorerTraits = { ...core.currentExplorer.traits };
  core.otherExplorers = core.otherExplorers.map((explorer) => (
    explorer.playerId === cameraOwnerPlayerId
      ? { ...explorer, inventory: [...explorer.inventory, { id: "camera", name: "魔法相机", kind: "item" }] }
      : explorer
  ));
  if (!cameraOwnerPlayerId) {
    core.possessionOrderByKind.item = [
      { id: "camera", name: "魔法相机", kind: "item" },
      ...core.possessionOrderByKind.item.filter((card) => card.id !== "camera"),
    ];
  }

  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "hallway",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.EXPLORE_ROOM, "0", {
    roomId: "ground-north",
  });
  if (!core.pendingEventChoice) {
    throw new Error("山屋魔法相机作祟夹具未生成事件选择");
  }
  core = applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.RESOLVE_EVENT_CHOICE,
    "0",
    { accept: true },
    100,
    createBetrayalScriptedRandom(3, 3, 3),
  );
  core = acknowledgePendingCardResolutions(core);
  if (core.phase !== "haunt" || !core.scenarioRuntime.magicCamera) {
    throw new Error("山屋魔法相机作祟夹具未进入剧本33运行态");
  }
  return core;
}

export function createHelpingHandsHauntCore(
  playerIds: string[] = ["0", "1", "2"],
): BetrayalCore {
  let core = createStartedFirstScenarioCore(playerIds);
  const helpingHandsEvent = BETRAYAL_DISCOVERY_POOLS.events.find(
    (event) => event.name === "大宅饿了",
  );
  if (!helpingHandsEvent) {
    throw new Error("山屋测试夹具缺少官方事件牌：大宅饿了");
  }
  core.drawOrder = ["event"];
  core.eventOrder = [helpingHandsEvent];
  setFixtureRoomDiscoveryDeck(core, [
    { floor: "ground", room: findFixtureRoomTemplate("ground", "kitchen") },
  ]);
  core.currentExplorer.inventory = [
    ...core.currentExplorer.inventory,
    { id: "omen-book", name: "书本", kind: "omen" },
    { id: "dog", name: "狗", kind: "omen" },
    { id: "mask", name: "面具", kind: "omen" },
  ];
  setFixtureExplorerInventory(core, "1", [
    { id: "ring", name: "指环", kind: "omen" },
  ]);
  setFixtureExplorerInventory(core, "2", [
    { id: "holy-symbol", name: "圣符", kind: "omen" },
  ]);
  core.currentExplorer.traits = {
    ...core.currentExplorer.traits,
    might: 4,
    speed: 4,
  };
  core.currentExplorerInventory = [...core.currentExplorer.inventory];
  core.currentExplorerTraits = { ...core.currentExplorer.traits };

  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "hallway",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.EXPLORE_ROOM, "0", {
    roomId: "ground-north",
  });
  if (!core.pendingEventChoice) {
    throw new Error("山屋大宅饿了作祟夹具未生成事件选择");
  }
  core = applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.RESOLVE_EVENT_CHOICE,
    "0",
    { accept: true },
    100,
    createBetrayalScriptedRandom(3, 3, 3),
  );
  core = acknowledgePendingCardResolutions(core);
  if (core.phase !== "haunt" || !core.scenarioRuntime.helpingHands) {
    throw new Error("山屋大宅饿了作祟夹具未进入剧本12运行态");
  }
  return core;
}

export function createDustFeverishControlReadyCore(
  feverishPlayerId = "0",
): BetrayalCore {
  let core = createDustHauntCore();
  const feverishRoomId = "hallway";
  core = focusCoreOnExplorer(core, feverishPlayerId);
  core.currentExplorer = {
    ...core.currentExplorer,
    roomId: feverishRoomId,
    inventory: [
      { id: "medical-kit", name: "急救包", kind: "item" },
      { id: "rope", name: "兔脚", kind: "item" },
    ],
  };
  core.otherExplorers = core.otherExplorers.map((explorer) => ({
    ...explorer,
    roomId: explorer.playerId === "1" ? feverishRoomId : "grand-staircase",
  }));
  core.activeRoomId = feverishRoomId;
  core.currentExplorerRoomId = feverishRoomId;
  core.currentExplorerInventory = core.currentExplorer.inventory.map((card) => ({
    ...card,
  }));
  core.turnStartInventoryCardIds = core.currentExplorer.inventory.map(
    (card) => card.id,
  );
  core.scenarioRuntime.deadExplorerPlayerIds = Array.from(
    new Set([...core.scenarioRuntime.deadExplorerPlayerIds, feverishPlayerId]),
  );
  if (!core.scenarioRuntime.dust) {
    throw new Error("山屋灰尘夹具缺少 dust 运行态");
  }
  core.scenarioRuntime.dust.permanentTraitorPlayerIds = Array.from(
    new Set([
      ...core.scenarioRuntime.dust.permanentTraitorPlayerIds,
      feverishPlayerId,
    ]),
  );
  core.scenarioRuntime.dust.feverishPlayerIds = Array.from(
    new Set([
      ...core.scenarioRuntime.dust.feverishPlayerIds,
      feverishPlayerId,
    ]),
  );
  core.monsters = [
    ...core.monsters.filter(
      (monster) => monster.id !== `feverish-${feverishPlayerId}`,
    ),
    createBetrayalMonsterFromDefinition(
      "dust-feverish-patient",
      `feverish-${feverishPlayerId}`,
      feverishRoomId,
    ),
  ];
  setScenarioTestTurnMovement(core, 2);
  return focusCoreOnExplorer(core, feverishPlayerId);
}

export function createDustFeverishNaturalMonsterTurnBeforeRollCore(): BetrayalCore {
  let core = createDustFeverishControlReadyCore("0");
  if (!core.scenarioRuntime.dust) {
    throw new Error("山屋灰尘夹具缺少 dust 运行态");
  }
  core.scenarioRuntime.dust.exchangedSicknessThisTurnPlayerIds = Array.from(
    new Set([
      ...core.scenarioRuntime.dust.exchangedSicknessThisTurnPlayerIds,
      "2",
    ]),
  );
  core = focusCoreOnExplorer(core, "2");
  setScenarioTestTurnMovement(core, 2);
  return {
    ...core,
    recentRoll: null,
    recommendedAction: "endTurn",
  };
}

export function createDustFeverishMovementRollReadyCore(): BetrayalCore {
  return applyBetrayalCommand(
    createDustFeverishNaturalMonsterTurnBeforeRollCore(),
    BETRAYAL_COMMANDS.END_TURN,
    "2",
    {},
    100,
    createBetrayalScriptedRandom(2, 2, 1, 1, 1),
  );
}

export function createDustFeverishAttackReadyCore(): BetrayalCore {
  const core = createDustFeverishMovementRollReadyCore();
  const monsterId = "feverish-0";
  const groupId = "狂热病患:5";
  core.movesRemaining = 0;
  core.recentRoll = null;
  core.usedCardIdsThisTurn = core.usedCardIdsThisTurn.filter(
    (id) => id !== "haunt-attack",
  );
  core.scenarioRuntime.monsterTurn = {
    ...core.scenarioRuntime.monsterTurn,
    resolvedStartMonsterIds: Array.from(
      new Set([
        ...core.scenarioRuntime.monsterTurn.resolvedStartMonsterIds,
        monsterId,
      ]),
    ),
    movementRollsByGroupId: {
      ...core.scenarioRuntime.monsterTurn.movementRollsByGroupId,
      [groupId]: {
        groupId,
        monsterName: "狂热病患",
        monsterIds: [monsterId],
        playerId: "0",
        speed: 5,
        diceCount: 5,
        dice: [1, 1, 0, 0, 0],
        total: 2,
        moveAllowance: 2,
        rollOnceForGroup: true,
        minimumMoveAllowance: 1,
      },
    },
    moveRemainingById: {
      ...core.scenarioRuntime.monsterTurn.moveRemainingById,
      [monsterId]: 0,
    },
  };
  return core;
}

export function playFirstScenarioToSurvivorVictory(): BetrayalCore {
  let core = createCrimsonJackHauntCore();

  setScenarioTestTurnMovement(core, 6);
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "upper-landing",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "upper-west",
  });
  core = applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.LEARN_ABOUT_JACK,
    "0",
    {},
    100,
    createBetrayalScriptedRandom(3, 3, 3, 3),
  );
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, "0", {});

  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, "1", {});
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, "2", {});

  setScenarioTestTurnMovement(core, 6);
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "upper-landing",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "grand-staircase",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "basement-landing",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "basement-east",
  });
  setFixturePhysicalDeathDoor(core, "2");
  core = applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.HAUNT_ATTACK,
    "0",
    { target: "traitor" },
    100,
    createBetrayalScriptedRandom(3, 3, 3, 3, 1, 1),
  );
  core = resolvePendingDamageAllocation(core);
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, "0", {});
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, "1", {});
  setScenarioTestTurnMovement(core, 6);
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "2", {
    roomId: "upper-landing",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "2", {
    roomId: "grand-staircase",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "2", {
    roomId: "basement-landing",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, "2", {});

  placeFixtureExplorerInRoom(core, "0", "basement-east");
  core = applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.STUDY_EXORCISM,
    "0",
    {},
    100,
    createBetrayalScriptedRandom(3, 3, 3, 3),
  );
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, "0", {});

  core = applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.END_TURN,
    "1",
    {},
    100,
    createBetrayalScriptedRandom(2, 2, 1),
  );
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, "2", {});
  placeFixtureExplorerInRoom(core, "0", "ground-north");
  core = applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.STUDY_EXORCISM,
    "0",
    {},
    100,
    createBetrayalScriptedRandom(3, 3, 3, 3, 3, 3),
  );
  core.currentExplorer.roomId = "basement-landing";
  core.activeRoomId = "basement-landing";
  core = applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.EXORCISE_JACK,
    "0",
    {},
    100,
    createBetrayalScriptedRandom(3, 3, 3, 3, 3, 3),
  );

  return core;
}

export function createFirstScenarioReadyToExorciseCore(): BetrayalCore {
  let core = createCrimsonJackHauntCore();
  const hauntProgressRandom = createBetrayalScriptedRandom(
    3,
    3,
    3,
    3, // 对攻击倒叛徒：英雄高点数
    1,
    1,
    1,
    1, // 对攻击倒叛徒：叛徒低点数
    3,
    3,
    3,
    3, // 第二处驱魔法阵成功
  );

  setScenarioTestTurnMovement(core, 6);
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "upper-landing",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "upper-west",
  });
  core = applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.LEARN_ABOUT_JACK,
    "0",
    {},
    100,
    createBetrayalScriptedRandom(3, 3, 3, 3),
  );
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, "0", {});

  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, "1", {});
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, "2", {});

  setScenarioTestTurnMovement(core, 6);
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "upper-landing",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "grand-staircase",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "basement-landing",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "basement-east",
  });
  setFixturePhysicalDeathDoor(core, "2");
  core = applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.HAUNT_ATTACK,
    "0",
    { target: "traitor" },
    100,
    hauntProgressRandom,
  );
  core = resolvePendingDamageAllocation(core);
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, "0", {});
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, "1", {});
  setScenarioTestTurnMovement(core, 6);
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "2", {
    roomId: "upper-landing",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "2", {
    roomId: "grand-staircase",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "2", {
    roomId: "basement-landing",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, "2", {});

  placeFixtureExplorerInRoom(core, "0", "basement-east");
  core = applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.STUDY_EXORCISM,
    "0",
    {},
    100,
    createBetrayalScriptedRandom(3, 3, 3, 3),
  );
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, "0", {});

  core = applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.END_TURN,
    "1",
    {},
    100,
    createBetrayalScriptedRandom(2, 2, 1),
  );
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, "2", {});
  placeFixtureExplorerInRoom(core, "0", "ground-north");
  core = applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.STUDY_EXORCISM,
    "0",
    {},
    100,
    hauntProgressRandom,
  );
  core.currentExplorer.roomId = "basement-landing";
  core.activeRoomId = "basement-landing";

  return core;
}

export function createFirstScenarioReadyToExorciseTutorialCore(): BetrayalCore {
  return applyTutorialDiscoveryOrder(createFirstScenarioReadyToExorciseCore());
}

export function createFirstScenarioReadyToLearnAboutJackCore(): BetrayalCore {
  let core = createCrimsonJackHauntCore();
  setScenarioTestTurnMovement(core, 6);
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "upper-landing",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "upper-west",
  });
  return core;
}

export function createFirstScenarioReadyToStudyExorcismCore(): BetrayalCore {
  let core = createCrimsonJackHauntCore();
  const hauntProgressRandom = createBetrayalScriptedRandom(3, 3, 3, 3);

  setScenarioTestTurnMovement(core, 6);
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "upper-landing",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "upper-west",
  });
  core = applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.LEARN_ABOUT_JACK,
    "0",
    {},
    100,
    hauntProgressRandom,
  );
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, "0", {});
  core = applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.END_TURN,
    "1",
    {},
    100,
    createBetrayalScriptedRandom(2, 2, 1),
  );
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, "2", {});
  placeFixtureExplorerInRoom(core, "0", "ground-north");

  return core;
}

export function createTradeReadyCore(): BetrayalCore {
  const core = createStartedFirstScenarioCore();
  const teammate = core.otherExplorers.find(
    (explorer) => explorer.playerId === "1",
  )!;
  const traitor = core.otherExplorers.find(
    (explorer) => explorer.playerId === "2",
  )!;

  core.currentExplorer = {
    ...core.currentExplorer,
    roomId: "hallway",
    inventory: [
      { id: "medical-kit", name: "急救包", kind: "item" },
      { id: "rope", name: "兔脚", kind: "item" },
      { id: "omen-book", name: "书本", kind: "omen" },
    ],
  };
  core.otherExplorers = [
    {
      ...teammate,
      roomId: "hallway",
      inventory: [
        { id: "map", name: "地图", kind: "item" },
        { id: "skull", name: "头骨", kind: "omen" },
      ],
    },
    {
      ...traitor,
      roomId: "entrance-hall",
    },
  ];
  core.activeRoomId = "hallway";
  core.currentExplorerInventory = [...core.currentExplorer.inventory];
  core.turnStartInventoryCardIds = core.currentExplorer.inventory.map(
    (card) => card.id,
  );
  core.currentExplorerTraits = { ...core.currentExplorer.traits };
  core.recommendedAction = "trade";
  core.usedCardIdsThisTurn = [];
  core.pendingEventChoice = null;
  core.recentRoll = null;
  core.latestDiscovery = null;
  core.latestDiscoveryOwnerPlayerId = null;

  return core;
}

export function createTradeReadyTutorialCore(): BetrayalCore {
  return applyTutorialDiscoveryOrder(createTradeReadyCore());
}

export function createExchangeReadyCore(): BetrayalCore {
  const core = createTradeReadyCore();
  core.otherExplorers = core.otherExplorers.map((explorer) =>
    explorer.playerId === "1"
      ? {
          ...explorer,
          inventory: [
            { id: "map", name: "地图", kind: "item" },
            { id: "skull", name: "头骨", kind: "omen" },
          ],
        }
      : explorer,
  );
  core.currentExplorerInventory = [...core.currentExplorer.inventory];
  core.turnStartInventoryCardIds = core.currentExplorer.inventory.map(
    (card) => card.id,
  );
  return core;
}

export function createExchangeReadyTutorialCore(): BetrayalCore {
  return applyTutorialDiscoveryOrder(createExchangeReadyCore());
}

export function createDogTradeReadyCore(): BetrayalCore {
  const core = createStartedFirstScenarioCore();
  const teammate = core.otherExplorers.find(
    (explorer) => explorer.playerId === "1",
  )!;
  const traitor = core.otherExplorers.find(
    (explorer) => explorer.playerId === "2",
  )!;

  core.currentExplorer = {
    ...core.currentExplorer,
    roomId: "entrance-hall",
    inventory: [
      { id: "dog", name: "狗", kind: "omen" },
      { id: "medical-kit", name: "急救包", kind: "item" },
      { id: "map", name: "地图", kind: "item" },
    ],
  };
  core.otherExplorers = [
    {
      ...teammate,
      roomId: "upper-landing",
      inventory: [],
    },
    {
      ...traitor,
      roomId: "basement-east",
      inventory: [],
    },
  ];
  core.activeRoomId = "entrance-hall";
  core.currentExplorerInventory = [...core.currentExplorer.inventory];
  core.currentExplorerTraits = { ...core.currentExplorer.traits };
  core.turnStartInventoryCardIds = ["dog", "medical-kit", "map"];
  core.usedCardIdsThisTurn = [];
  core.recommendedAction = "trade";
  core.latestDiscovery = null;
  core.latestDiscoveryOwnerPlayerId = null;

  return core;
}

export function createMedicalKitUseReadyCore(): BetrayalCore {
  const core = createStartedFirstScenarioCore();
  const teammate = core.otherExplorers.find(
    (explorer) => explorer.playerId === "1",
  )!;
  const traitor = core.otherExplorers.find(
    (explorer) => explorer.playerId === "2",
  )!;

  core.currentExplorer = {
    ...core.currentExplorer,
    roomId: "hallway",
    inventory: [{ id: "medical-kit", name: "急救包", kind: "item" }],
  };
  core.otherExplorers = [
    {
      ...teammate,
      roomId: "hallway",
      traits: {
        ...teammate.traits,
        might: 1,
        speed: 1,
        knowledge: 1,
        sanity: 1,
      },
    },
    {
      ...traitor,
      roomId: "entrance-hall",
    },
  ];
  core.activeRoomId = "hallway";
  core.currentExplorerTraits = { ...core.currentExplorer.traits };
  core.currentExplorerInventory = [...core.currentExplorer.inventory];
  core.turnStartInventoryCardIds = ["medical-kit"];
  core.usedCardIdsThisTurn = [];
  core.recommendedAction = "use";
  core.latestDiscovery = null;
  core.latestDiscoveryOwnerPlayerId = null;

  return core;
}

export function createHolyWaterUseReadyCore(): BetrayalCore {
  const core = createStartedFirstScenarioCore();

  core.currentExplorer = {
    ...core.currentExplorer,
    roomId: "hallway",
    traits: {
      ...core.currentExplorer.traits,
      might: 1,
      speed: 1,
    },
    inventory: [{ id: "holy-water", name: "奇怪的药品", kind: "item" }],
  };
  core.activeRoomId = "hallway";
  core.currentExplorerTraits = { ...core.currentExplorer.traits };
  core.currentExplorerInventory = [...core.currentExplorer.inventory];
  core.turnStartInventoryCardIds = ["holy-water"];
  core.usedCardIdsThisTurn = [];
  core.recommendedAction = "use";
  core.latestDiscovery = null;
  core.latestDiscoveryOwnerPlayerId = null;

  return core;
}

export function createSkeletonKeyMoveReadyCore(): BetrayalCore {
  const core = createStartedFirstScenarioCore();

  core.currentExplorer = {
    ...core.currentExplorer,
    roomId: "upper-landing",
    inventory: [{ id: "lockpick-tool", name: "骨制钥匙", kind: "item" }],
  };
  core.activeRoomId = "upper-landing";
  core.currentExplorerTraits = { ...core.currentExplorer.traits };
  core.currentExplorerInventory = [...core.currentExplorer.inventory];
  core.turnStartInventoryCardIds = ["lockpick-tool"];
  core.usedCardIdsThisTurn = [];
  setScenarioTestTurnMovement(core, 2);
  core.recommendedAction = "move";
  core.latestDiscovery = null;
  core.latestDiscoveryOwnerPlayerId = null;
  core.rooms = core.rooms.map((room) => {
    if (room.id === "upper-landing") {
      return {
        ...room,
        doorways: room.doorways.filter(
          (doorway) => doorway.connectsToRoomId !== "upper-west",
        ),
      };
    }
    if (room.id === "upper-west") {
      return {
        ...room,
        name: "图书馆",
        state: "discovered",
        hint: "已发现的相邻上层房间",
        tags: ["知识", "调查", "图书馆"],
        discoveryReward: "event",
        visualId: "library",
        doorways: room.doorways.filter(
          (doorway) => doorway.connectsToRoomId !== "upper-landing",
        ),
      };
    }
    return room;
  });

  return core;
}

export function createMaskMoveReadyCore(): BetrayalCore {
  const core = createStartedFirstScenarioCore();
  const teammate = core.otherExplorers.find(
    (explorer) => explorer.playerId === "1",
  )!;
  const traitor = core.otherExplorers.find(
    (explorer) => explorer.playerId === "2",
  )!;

  core.currentExplorer = {
    ...core.currentExplorer,
    roomId: "hallway",
    inventory: [{ id: "mask", name: "面具", kind: "omen" }],
  };
  core.otherExplorers = [
    {
      ...teammate,
      roomId: "hallway",
      inventory: [],
    },
    {
      ...traitor,
      roomId: "upper-landing",
      inventory: [],
    },
  ];
  core.activeRoomId = "hallway";
  core.currentExplorerTraits = { ...core.currentExplorer.traits };
  core.currentExplorerInventory = [...core.currentExplorer.inventory];
  core.turnStartInventoryCardIds = ["mask"];
  core.usedCardIdsThisTurn = [];
  core.recommendedAction = "use";
  core.latestDiscovery = null;
  core.latestDiscoveryOwnerPlayerId = null;

  return core;
}

export function createHeroAttackTraitorReadyCore(): BetrayalCore {
  let core = createCrimsonJackHauntCore();
  setScenarioTestTurnMovement(core, 6);
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "upper-landing",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "grand-staircase",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "basement-landing",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "basement-east",
  });
  core.pendingEventChoice = null;
  core.recentRoll = null;
  core.latestDiscovery = null;
  core.latestDiscoveryOwnerPlayerId = null;
  return core;
}

export function createHeroAttackTraitorReadyTutorialCore(): BetrayalCore {
  return applyTutorialDiscoveryOrder(createHeroAttackTraitorReadyCore());
}

export function playFirstScenarioToTraitorVictory(): BetrayalCore {
  let core = createCrimsonJackHauntCore();

  setScenarioTestTurnMovement(core, 6);
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "upper-landing",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "grand-staircase",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "hallway",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "ground-north",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, "0", {});

  setScenarioTestTurnMovement(core, 6);
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "1", {
    roomId: "hallway",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "1", {
    roomId: "ground-north",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, "1", {});

  setScenarioTestTurnMovement(core, 6);
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "2", {
    roomId: "basement-landing",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "2", {
    roomId: "grand-staircase",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "2", {
    roomId: "hallway",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "2", {
    roomId: "ground-north",
  });
  setFixturePhysicalDeathDoor(core, "0");
  core = applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.HAUNT_ATTACK,
    "2",
    { target: "hero", targetPlayerId: "0" },
    100,
    createBetrayalScriptedRandom(3, 3, 3, 3, 1, 1),
  );
  core = resolvePendingDamageAllocation(core);

  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, "2", {});
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, "1", {});
  setFixturePhysicalDeathDoor(core, "1");
  core = applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.HAUNT_ATTACK,
    "2",
    { target: "hero", targetPlayerId: "1" },
    100,
    createBetrayalScriptedRandom(3, 3, 3, 3, 1, 1),
  );
  core = resolvePendingDamageAllocation(core);

  return core;
}

export function createFirstScenarioReadyToTraitorVictoryCore(): BetrayalCore {
  let core = createCrimsonJackHauntCore();

  setScenarioTestTurnMovement(core, 6);
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "upper-landing",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "grand-staircase",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "hallway",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "ground-north",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, "0", {});

  setScenarioTestTurnMovement(core, 6);
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "1", {
    roomId: "hallway",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "1", {
    roomId: "ground-north",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, "1", {});

  setScenarioTestTurnMovement(core, 6);
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "2", {
    roomId: "basement-landing",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "2", {
    roomId: "grand-staircase",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "2", {
    roomId: "hallway",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "2", {
    roomId: "ground-north",
  });
  setFixturePhysicalDeathDoor(core, "0");
  core = applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.HAUNT_ATTACK,
    "2",
    { target: "hero", targetPlayerId: "0" },
    100,
    createBetrayalScriptedRandom(3, 3, 3, 3, 1, 1),
  );
  core = resolvePendingDamageAllocation(core);

  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, "2", {});
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, "1", {});

  return focusCoreOnExplorer(core, "2");
}

export function createFirstScenarioReadyToTraitorVictoryTutorialCore(): BetrayalCore {
  return applyTutorialDiscoveryOrder(
    createFirstScenarioReadyToTraitorVictoryCore(),
  );
}

export function createCorpseLootReadyCore(): BetrayalCore {
  const core = createFirstScenarioHauntCore();
  const current = core.otherExplorers.find(
    (explorer) => explorer.playerId === "1",
  )!;
  const corpse = core.currentExplorer;
  const traitor = core.otherExplorers.find(
    (explorer) => explorer.playerId === "2",
  )!;

  core.currentPlayer = "1";
  core.currentExplorer = {
    ...current,
    roomId: "hallway",
  };
  core.otherExplorers = [
    {
      ...corpse,
      roomId: "hallway",
      inventory: [
        { id: "corpse-item-1", name: "匕首", kind: "item" },
        { id: "corpse-omen-1", name: "黑暗预兆", kind: "omen" },
      ],
    },
    {
      ...traitor,
      roomId: "basement-east",
    },
  ];
  core.activeRoomId = "hallway";
  core.currentExplorerTraits = { ...core.currentExplorer.traits };
  core.currentExplorerInventory = [...core.currentExplorer.inventory];
  core.scenarioRuntime.deadExplorerPlayerIds = ["0"];
  core.scenarioRuntime.corpseLootedByPlayerIdsThisTurn = [];
  setScenarioTestTurnMovement(core, 4);
  core.recommendedAction = "trade";
  core.usedCardIdsThisTurn = [];
  core.pendingEventChoice = null;
  core.recentRoll = null;
  core.latestDiscovery = null;
  core.latestDiscoveryOwnerPlayerId = null;

  return core;
}

export function createJackSpiritReviveReadyCore(): BetrayalCore {
  let core = createCrimsonJackHauntCore();

  setScenarioTestTurnMovement(core, 6);
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "upper-landing",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "grand-staircase",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "basement-landing",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "basement-east",
  });
  setFixturePhysicalDeathDoor(core, "2");
  core = applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.HAUNT_ATTACK,
    "0",
    { target: "traitor" },
    100,
    createBetrayalScriptedRandom(3, 3, 3, 3, 1, 1, 1, 1, 1, 1),
  );
  core = resolvePendingDamageAllocation(core);
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, "0", {});
  core = applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.END_TURN,
    "1",
    {},
    100,
    createBetrayalScriptedRandom(3, 3, 3),
  );
  setScenarioTestTurnMovement(core, 6);
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "2", {
    roomId: "upper-landing",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "2", {
    roomId: "grand-staircase",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "2", {
    roomId: "basement-landing",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "2", {
    roomId: "basement-east",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, "2", {});
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, "0", {});

  return core;
}

export function createJackSpiritNaturalMonsterTurnBeforeRollCore(): BetrayalCore {
  let core = createCrimsonJackHauntCore();

  setScenarioTestTurnMovement(core, 6);
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "upper-landing",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "grand-staircase",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "basement-landing",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "basement-east",
  });
  setFixturePhysicalDeathDoor(core, "2");
  core = applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.HAUNT_ATTACK,
    "0",
    { target: "traitor" },
    100,
    createBetrayalScriptedRandom(3, 3, 3, 3, 1, 1, 1, 1, 1, 1),
  );
  core = resolvePendingDamageAllocation(core);
  return applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, "0", {});
}

export function createJackSpiritMovementRollReadyCore(): BetrayalCore {
  const core = createJackSpiritNaturalMonsterTurnBeforeRollCore();
  return applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.END_TURN,
    "1",
    {},
    100,
    createBetrayalScriptedRandom(2, 2, 1),
  );
}

export function createJackSpiritPostReviveAttackReadyCore(): BetrayalCore {
  let core = createJackSpiritReviveReadyCore();
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, "1", {});
  return focusCoreOnExplorer(core, "2");
}

export function createJackSpiritPostReviveAttackReadyTutorialCore(): BetrayalCore {
  const attackReadyCore = createJackSpiritMovementRollReadyCore();
  const jackSpiritRoomId = attackReadyCore.scenarioRuntime.jackSpiritRoomId;
  if (!jackSpiritRoomId) {
    throw new Error("山屋杰克之灵教程夹具缺少灵体所在房间");
  }
  placeFixtureExplorerInRoom(attackReadyCore, "0", jackSpiritRoomId);
  return applyTutorialDiscoveryOrder(
    {
      ...focusCoreOnExplorer(attackReadyCore, "2"),
      recentRoll: null,
    },
  );
}
