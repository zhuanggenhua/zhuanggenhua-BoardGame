import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  assertNoFatalFrontendErrors,
  attachPageDiagnostics,
} from "../helpers/common";
import {
    canSmashMagicCamera,
    type BetrayalCore,
    type BetrayalDiscoverySummary,
    type BetrayalRecentRollState,
    type BetrayalTraitKey,
    type BetrayalUseEffectSeed,
} from "../../src/games/betrayal/game";
import { BETRAYAL_COMMANDS } from "../../src/games/betrayal/commands";
import { BETRAYAL_DISCOVERY_POOLS } from "../../src/games/betrayal/scenarioConfig";
import { MOBILE_LANDSCAPE_REFERENCE_VIEWPORT } from "../../src/shared/referenceViewports";
import {
  applyBetrayalCommand,
  createBetrayalScriptedRandom,
} from "../../src/games/betrayal/testing/firstScenarioTestUtils";
import {
  clickDiscoveryBackdropAndExpectStillVisible,
  createRuntimeCore,
  dispatchHarnessCommand,
  initBetrayalContext,
  injectCore,
  readVisibleNonSrText,
  saveScreenshot,
  setHarnessRandomQueue,
  expectVisiblePhysicalDiceBox,
  expectPhysicalDiceSeparated,
  expectPhysicalDiceStableAfterSettled,
  waitForPhysicalDiceSettled,
  waitForBetrayalPageReady,
  warmBetrayalFrontend,
} from "./betrayalTestHelpers";

const EVIDENCE_DIR = "evidence/山屋惊魂-事件牌页面承接E2E";
const ARMOR_EVIDENCE_DIR = "evidence/山屋惊魂-盔甲物理减伤完整链路";
const RADIO_EVIDENCE_DIR = "evidence/山屋惊魂-头戴耳机精神减伤完整链路";
const FLASHLIGHT_EVIDENCE_DIR = "evidence/山屋惊魂-手电筒事件检定加骰完整链路";
const LANTERN_EVIDENCE_DIR = "evidence/山屋惊魂-灯笼事件检定加骰完整链路";
const MAGIC_CAMERA_EVIDENCE_DIR =
  "evidence/山屋惊魂-魔法相机知识检定替代完整链路";
const MAGIC_CAMERA_HAUNT_OWNER_EVIDENCE_DIR =
  "evidence/山屋惊魂-魔法相机作祟归属完整链路";
const OMEN_BOOK_EVIDENCE_DIR = "evidence/山屋惊魂-书本非战斗检定替代完整链路";
const DUST_HAUNT_EVIDENCE_DIR = "evidence/山屋惊魂-灰尘作祟完整链路";

type EventChoiceCase = {
  title: string;
  screenshotSlug: string;
  buildCore: () => BetrayalCore;
  actions: string[];
  expectedTexts: string[];
  expectedVisibleTestIds?: string[];
  expectedRecentRollBeforeChoice?: string[];
  expectNoRecentRollBeforeChoice?: boolean;
  expectedRecentRollAfterChoice?: string[];
  actionRandomQueue?: number[];
};

type BetrayalStateReaderWindow = Window & {
  __BG_TEST_HARNESS__?: {
    state?: {
      get?: () => { core: BetrayalCore };
    };
  };
};

function eventByName(name: string) {
  const event = BETRAYAL_DISCOVERY_POOLS.events.find(
    (candidate) => candidate.name === name,
  );
  if (!event) {
    throw new Error(`未找到山屋事件：${name}`);
  }
  return event;
}

function cloneGroundRoomTemplate(
  room: BetrayalCore["roomDiscoveryOrderByFloor"]["ground"][number],
): BetrayalCore["roomDiscoveryOrderByFloor"]["ground"][number] {
  return {
    ...room,
    tags: [...room.tags],
    doorways: [...room.doorways],
  };
}

function pinGroundNorthToEventRoom(core: BetrayalCore, visualId = "kitchen") {
  const roomTemplate = BETRAYAL_DISCOVERY_POOLS.roomDiscoveryByFloor.ground.find(
    (room) => room.visualId === visualId,
  );
  if (!roomTemplate || roomTemplate.discoverySymbol !== "event") {
    throw new Error(`山屋 E2E 夹具缺少一层事件房：${visualId}`);
  }

  const orderedGroundRooms = [
    cloneGroundRoomTemplate(roomTemplate),
    ...core.roomDiscoveryOrderByFloor.ground
      .filter((room) => room.visualId !== visualId)
      .map(cloneGroundRoomTemplate),
  ];
  core.roomDiscoveryOrderByFloor = {
    ...core.roomDiscoveryOrderByFloor,
    ground: orderedGroundRooms,
  };
  core.roomDiscoveryDeck = [
    ...orderedGroundRooms.map((room) => ({
      floor: "ground" as const,
      room: cloneGroundRoomTemplate(room),
    })),
    ...core.roomDiscoveryOrderByFloor.upper.map((room) => ({
      floor: "upper" as const,
      room: {
        ...room,
        tags: [...room.tags],
        doorways: [...room.doorways],
      },
    })),
    ...core.roomDiscoveryOrderByFloor.basement.map((room) => ({
      floor: "basement" as const,
      room: {
        ...room,
        tags: [...room.tags],
        doorways: [...room.doorways],
      },
    })),
  ];
}

function branchEffect(eventName: string, min: number): BetrayalUseEffectSeed {
  const event = eventByName(eventName);
  const branch = event.roll?.branches.find(
    (candidate) => candidate.min === min,
  );
  if (!branch) {
    throw new Error(`未找到山屋事件分支：${eventName} min=${min}`);
  }
  return branch.effect;
}

function allPassEffect(eventName: string): BetrayalUseEffectSeed {
  const event = eventByName(eventName);
  if (event.effect?.mode !== "allTraitChecks") {
    throw new Error(`山屋事件不是四属性检定：${eventName}`);
  }
  return event.effect.allPassEffect;
}

function createPendingChoiceCore(
  sourceTitle: string,
  effect: BetrayalUseEffectSeed,
  options: {
    id: string;
    acceptLabel?: string;
    declineLabel?: string;
    roomId?: string;
    traits?: Partial<Record<BetrayalTraitKey, number>>;
    possessionItems?: { id: string; name: string; kind: "item" }[];
  },
) {
  const core = createRuntimeCore();
  core.currentExplorer = {
    ...core.currentExplorer,
    roomId: options.roomId ?? core.currentExplorer.roomId,
    traits: {
      ...core.currentExplorer.traits,
      ...options.traits,
    },
    inventory: [],
  };
  core.activeRoomId = core.currentExplorer.roomId;
  core.currentExplorerTraits = { ...core.currentExplorer.traits };
  core.currentExplorerInventory = [];
  if (options.possessionItems) {
    core.possessionOrderByKind.item = [...options.possessionItems];
  }
  core.pendingEventChoice = {
    id: options.id,
    playerId: "0",
    sourceTitle,
    acceptLabel: options.acceptLabel,
    declineLabel: options.declineLabel,
    effect,
  };
  return core;
}

function createExploredEventChoiceCore(
  eventName: string,
  options?: {
    traits?: Partial<Record<BetrayalTraitKey, number>>;
    rollDice?: number[];
  },
) {
  const event = eventByName(eventName);
  let core = createRuntimeCore();
  core.drawOrder = ["event"];
  core.eventOrder = [event];
  core.deckCounts.event = core.eventOrder.length;
  pinGroundNorthToEventRoom(core);
  core.currentExplorer = {
    ...core.currentExplorer,
    traits: {
      ...core.currentExplorer.traits,
      ...options?.traits,
    },
    inventory: [],
  };
  core.currentExplorerTraits = { ...core.currentExplorer.traits };
  core.currentExplorerInventory = [];
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "hallway",
  });
  core = options?.rollDice
    ? applyBetrayalCommand(
        core,
        BETRAYAL_COMMANDS.EXPLORE_ROOM,
        "0",
        { roomId: "ground-north" },
        100,
        createBetrayalScriptedRandom(...options.rollDice),
      )
    : applyBetrayalCommand(core, BETRAYAL_COMMANDS.EXPLORE_ROOM, "0", {
        roomId: "ground-north",
      });
  if (core.pendingEventChoice?.sourceTitle !== eventName) {
    throw new Error(`未能生成事件待选态：${eventName}`);
  }
  return core;
}

function eventEffect(eventName: string): BetrayalUseEffectSeed {
  const effect = eventByName(eventName).effect;
  if (!effect) {
    throw new Error(`山屋事件没有直接效果：${eventName}`);
  }
  return effect;
}

async function readCurrentCore(page: Page): Promise<BetrayalCore> {
  return page.evaluate(() => {
    const snapshot = (
      window as BetrayalStateReaderWindow
    ).__BG_TEST_HARNESS__?.state?.get?.();
    if (!snapshot) {
      throw new Error("山屋 E2E 无法读取当前核心状态");
    }
    return snapshot.core;
  });
}

async function finalizePendingEventRollForAllPlayers(
  page: Page,
  message = "事件骰确认后必须进入正式事件结果",
  finalRollRandomQueue: number[] = [],
) {
  const pending = await page.evaluate(() => {
    const snapshot = (
      window as BetrayalStateReaderWindow
    ).__BG_TEST_HARNESS__?.state?.get?.();
    const resolution = snapshot?.core?.pendingEventRollResolution;
    if (!resolution) {
      return null;
    }
    return {
      rollId: resolution.rollId,
      requiredPlayerIds: resolution.requiredPlayerIds ?? snapshot?.core?.playerIds ?? [],
      acknowledgedPlayerIds: resolution.acknowledgedPlayerIds ?? [],
    };
  });
  if (!pending) {
    throw new Error("事件骰没有待确认状态，不能进入二次伤害骰流程");
  }

  const acknowledged = new Set(pending.acknowledgedPlayerIds);
  const unacknowledgedPlayerIds = pending.requiredPlayerIds.filter(
    (playerId) => !acknowledged.has(playerId),
  );
  if (finalRollRandomQueue.length > 0) {
    await setHarnessRandomQueue(page, finalRollRandomQueue);
  }
  for (const playerId of unacknowledgedPlayerIds) {
    await dispatchHarnessCommand(
      page,
      BETRAYAL_COMMANDS.FINALIZE_EVENT_ROLL,
      playerId,
      { rollId: pending.rollId },
    );
  }
  await expect
    .poll(async () => (await readCurrentCore(page)).pendingEventRollResolution ?? null, {
      message,
    })
    .toBeNull();
}

async function resolveVisibleDamageAllocation(
  page: Page,
  traits: BetrayalTraitKey[],
  screenshotPath?: string,
) {
  const allocationPanel = page.getByTestId("betrayal-damage-allocation-panel");
  await expect(allocationPanel).toBeVisible();
  const selectedCounts = new Map<BetrayalTraitKey, number>();
  for (const trait of traits) {
    const traitCard = allocationPanel.getByTestId(
      `betrayal-damage-allocation-trait-${trait}`,
    );
    const increaseButton = allocationPanel.getByTestId(
      `betrayal-damage-allocation-trait-${trait}-increase`,
    );
    await expect(traitCard).toBeEnabled();
    await expect(increaseButton).toBeEnabled();
    await increaseButton.click();
    const nextCount = (selectedCounts.get(trait) ?? 0) + 1;
    selectedCounts.set(trait, nextCount);
    await expect(traitCard).toHaveAttribute(
      "data-damage-selected-count",
      String(nextCount),
    );
    await expect(traitCard).toHaveAttribute(
      "data-trait-preview-step-count",
      String(nextCount),
    );
    await expect(
      allocationPanel.getByTestId(`betrayal-damage-allocation-trait-${trait}-selected-count`),
    ).toHaveText(String(nextCount));
    const previewPositions = await traitCard.evaluate((element) => ({
      current: Number(element.getAttribute("data-trait-preview-current-position")),
      target: Number(element.getAttribute("data-trait-preview-target-position")),
    }));
    expect(previewPositions.target).toBeLessThan(previewPositions.current);
    await expect(traitCard).not.toContainText(/承担\s*\d+\s*点|×\d|[+-]\s*\d+\s*步|[+-]\s*\d+\s*steps/i);
  }
  await expect(allocationPanel.getByTestId("betrayal-damage-allocation-traits")).not.toContainText(
    /承担\s*\d+\s*点|×\d|[+-]\s*\d+\s*步|[+-]\s*\d+\s*steps/i,
  );
  await expect(
    allocationPanel.getByTestId("betrayal-damage-allocation-confirm"),
  ).toBeEnabled();
  if (screenshotPath) {
    await saveScreenshot(page, screenshotPath);
  }
  await allocationPanel.getByTestId("betrayal-damage-allocation-confirm").click();
  await expect(page.getByTestId("betrayal-damage-allocation-panel")).toHaveCount(0);
}

async function acknowledgeVisibleEventDamageRoll(page: Page, message: string) {
  await expect(page.getByTestId("betrayal-damage-allocation-panel")).toHaveCount(0);
  const confirmButton = page.getByTestId("betrayal-roll-continue");
  await expect(confirmButton).toBeVisible();
  await expect(confirmButton).toContainText(/确认/);
  await confirmButton.click();
  await expect
    .poll(async () => (await readCurrentCore(page)).recentRoll ?? null, {
      message,
    })
    .toBeNull();
}

function buildVisibleTraitTrack(
  trait: BetrayalTraitKey,
  value: number,
): BetrayalCore["currentExplorer"]["traitTracks"][BetrayalTraitKey] {
  const values = [1, 2, 3, 4, 5];
  const position = values.indexOf(value);
  if (position < 0) {
    throw new Error(`山屋 E2E 属性轨不支持 ${trait}=${value}`);
  }
  return {
    trackId: `event-choice-e2e-${trait}`,
    values,
    position,
    startPosition: position,
    criticalPosition: 0,
    skullPosition: -1,
    maxPosition: values.length - 1,
  };
}

function setCurrentExplorerVisibleTrait(
  core: BetrayalCore,
  trait: BetrayalTraitKey,
  value: number,
): void {
  core.currentExplorer.traitTracks = {
    ...core.currentExplorer.traitTracks,
    [trait]: buildVisibleTraitTrack(trait, value),
  };
  core.currentExplorer.traits = {
    ...core.currentExplorer.traits,
    [trait]: value,
  };
  core.currentExplorerTraits = { ...core.currentExplorer.traits };
}

function findE2eExplorer(
  core: BetrayalCore,
  playerId: string,
): BetrayalCore["currentExplorer"] {
  const explorer = [core.currentExplorer, ...core.otherExplorers].find(
    (candidate) => candidate.playerId === playerId,
  );
  if (!explorer) {
    throw new Error(`山屋 E2E 无法找到玩家 ${playerId} 的探险者`);
  }
  return explorer;
}

function traitTrackPosition(
  core: BetrayalCore,
  playerId: string,
  trait: BetrayalTraitKey,
): number {
  return findE2eExplorer(core, playerId).traitTracks[trait].position;
}

function physicalTraitTotal(core: BetrayalCore, playerId: string): number {
  const explorer = findE2eExplorer(core, playerId);
  return explorer.traits.might + explorer.traits.speed;
}

function mentalTraitTotal(core: BetrayalCore, playerId: string): number {
  const explorer = findE2eExplorer(core, playerId);
  return explorer.traits.knowledge + explorer.traits.sanity;
}

async function dismissDiscoveryPanel(page: Page) {
  const discoveryPanel = page.getByTestId("betrayal-discovery-panel");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!(await discoveryPanel.isVisible().catch(() => false))) {
      return;
    }
    const continueButton = page.getByTestId("betrayal-discovery-continue");
    if (await continueButton.isVisible().catch(() => false)) {
      if (await continueButton.isEnabled().catch(() => false)) {
        await continueButton.click();
      }
      for (let acknowledgement = 0; acknowledgement < 12; acknowledgement += 1) {
        const core = await readCurrentCore(page);
        const pending = core.pendingCardResolutionQueue?.[0];
        if (!pending) {
          break;
        }
        const requiredPlayerIds = pending.requiredPlayerIds?.length
          ? pending.requiredPlayerIds
          : [pending.playerId];
        const acknowledgedPlayerIds = new Set(pending.acknowledgedPlayerIds ?? []);
        const nextPlayerId = requiredPlayerIds.find((playerId) => !acknowledgedPlayerIds.has(playerId));
        if (!nextPlayerId) {
          break;
        }
        await dispatchHarnessCommand(
          page,
          BETRAYAL_COMMANDS.ACKNOWLEDGE_CARD_RESOLUTION,
          nextPlayerId,
          { resolutionId: pending.id },
        );
      }
      await expect(discoveryPanel).toBeHidden({ timeout: 1200 }).catch(
        () => undefined,
      );
      continue;
    }
    break;
  }
  await clickDiscoveryBackdropAndExpectStillVisible(page, discoveryPanel);
  const continueButton = page.getByTestId("betrayal-discovery-continue");
  await expect(
    continueButton,
    "发现牌浮层必须提供明确继续/确认按钮，不能靠点击空白关闭。",
  ).toBeVisible();
  await expect(continueButton).toBeEnabled();
  await continueButton.click();
  await expect(discoveryPanel).toBeHidden({ timeout: 30000 });
}

async function confirmGroundNorthRoomPlacement(page: Page) {
  await page.getByTestId("betrayal-room-ground-north").click();
  const placementPanel = page.getByTestId("betrayal-room-placement-panel");
  await expect(placementPanel).toBeVisible({ timeout: 30000 });
  const confirmButton = page.getByTestId("betrayal-room-placement-confirm");
  await expect(confirmButton).toBeEnabled();
  await confirmButton.click();
  await expect(placementPanel).toBeHidden({ timeout: 30000 });
}

async function injectLatestDiscoverySync(
  page: Page,
  sourceCore: BetrayalCore,
  discovery: BetrayalDiscoverySummary,
  ownerPlayerId: string,
  syncId: string,
  recentRoll: BetrayalRecentRollState | null = null,
) {
  const nextCore: BetrayalCore = {
    ...sourceCore,
    latestDiscovery: { ...discovery },
    latestDiscoveryOwnerPlayerId: ownerPlayerId,
    recentRoll: recentRoll
      ? {
          ...recentRoll,
          dice: [...recentRoll.dice],
          consumedRabbitFootCardIds: [...recentRoll.consumedRabbitFootCardIds],
          branchThresholds: recentRoll.branchThresholds?.map((branch) => ({
            ...branch,
            effect: { ...branch.effect },
          })),
        }
      : null,
    activityLog: [
      {
        id: `queued-discovery-${syncId}`,
        text: `玩家 ${ownerPlayerId} 触发 ${discovery.title}`,
        tone: discovery.tone,
      },
      ...sourceCore.activityLog,
    ],
  };
  await injectCore(page, nextCore);
  return nextCore;
}

async function expectQueuedDiscoveryReadable(
  page: Page,
  title: string,
  detailText: string,
  label: string,
) {
  const discoveryPanel = page.getByTestId("betrayal-discovery-panel");
  await expect(discoveryPanel, `${label}发现牌浮层必须可见`).toBeVisible();
  await expect(discoveryPanel, `${label}必须显示正确发现牌`).toHaveAttribute(
    "aria-label",
    `事件牌 ${title}`,
  );
  await expect(
    page.getByTestId("betrayal-discovery-detail"),
    `${label}发现牌详情必须可读`,
  ).toContainText(detailText);
  await expect(
    page.getByTestId("betrayal-discovery-continue"),
    `${label}必须提供明确关闭入口`,
  ).toBeVisible();
  await page.waitForTimeout(1200);
  await expect(
    discoveryPanel,
    `${label}不能因为同步/计时只出现一瞬间`,
  ).toHaveAttribute("aria-label", `事件牌 ${title}`);
}

async function expectQueuedDiscoveryRoll(
  page: Page,
  options: {
    label: string;
    sourceTitle: string;
    rollLabel: string;
    totalText: string;
    diceValues: string;
    rabbitFootTargetsVisible?: boolean;
  },
) {
  const rollPanel = page.getByTestId("betrayal-recent-roll-panel");
  await expect(rollPanel, `${options.label}投掷结果必须同屏可见`).toBeVisible();
  await expect(
    rollPanel,
    `${options.label}投掷来源必须对应当前展示牌`,
  ).toContainText(options.sourceTitle);
  await expect(rollPanel, `${options.label}检定类型必须正确`).toContainText(
    options.rollLabel,
  );
  await expect(
    rollPanel,
    `${options.label}总点数必须保持自己的快照`,
  ).toContainText(options.totalText);
  await expect(
    rollPanel.getByTestId("betrayal-house-dice-3d-group"),
    `${options.label}骰子明细不能被后续同步覆盖`,
  ).toHaveAttribute("data-dice-rule-values", options.diceValues);
  await expect(
    page.getByTestId("betrayal-rabbit-foot-dice"),
    `${options.label}不能在不可修改的历史/对方投掷上露出兔脚改骰目标`,
  ).toHaveCount(options.rabbitFootTargetsVisible ? 1 : 0);
}

async function expectHauntGoalCardAndScenarioBook(
  page: Page,
  options: {
    cardNumber: number;
    title: string;
    goalTexts: string[];
    primaryActionText?: string;
    actionHintTexts?: string[];
    actionScreenshotPath?: string;
    bookTexts: string[];
    nextBookTexts?: string[];
    screenshotPath: string;
  },
) {
  const goalCard = page.getByTestId("betrayal-haunt-goal-card");
  await expect(
    goalCard,
    "作祟牌桌不得重复显示第二张作祟目标卡",
  ).toHaveCount(0);
  await expect(
    page.getByTestId("betrayal-haunt-goal-open-book"),
    "牌桌上只能保留一个剧本书入口",
  ).toHaveCount(0);
  await expect(
    page.getByTestId("betrayal-haunt-command-banner"),
    "作祟开始后不得再出现常驻作祟指挥横幅",
  ).toHaveCount(0);
  await expect(page.getByTestId("betrayal-haunt-command-title")).toHaveCount(0);
  await expect(page.getByTestId("betrayal-haunt-command-next")).toHaveCount(0);
  await expect(page.getByTestId("betrayal-haunt-command-cue")).toHaveCount(0);

  const scenarioReaderDialog = page.getByTestId(
    "betrayal-scenario-reader-dialog",
  );
  await expect(
    scenarioReaderDialog,
    "稳定作祟牌桌不应重复弹出剧本书；重开剧本应由牌桌短入口承接",
  ).toHaveCount(0);
  const openScenarioButton = page.getByTestId("betrayal-open-scenario");
  await expect(
    openScenarioButton,
    "作祟牌桌必须保留可手动查阅剧本书的入口",
  ).toBeVisible();
  await openScenarioButton.click();
  await expect(scenarioReaderDialog).toBeVisible();
  await expect(scenarioReaderDialog).toContainText(
    `剧本${options.cardNumber}查阅`,
  );
  await expect(scenarioReaderDialog).toContainText(options.title);
  await expect(page.getByTestId("betrayal-reference-overlay")).toHaveCount(0);
  await expect(page.getByTestId("betrayal-reference-toggle")).toHaveCount(0);
  await expect(
    page.getByTestId("betrayal-scenario-reader-header-progress"),
  ).toHaveText("1/2");
  await expect(
    page.getByTestId("betrayal-scenario-reader-footer-progress"),
  ).toHaveText("1/2");
  const scenarioBook = page.getByTestId("betrayal-scenario-book");
  await expect(scenarioBook).toBeVisible();
  const scenarioPage = page.getByTestId("betrayal-scenario-objective-page");
  for (const text of options.bookTexts) {
    await expect(scenarioPage).toContainText(text);
  }
  if (options.nextBookTexts?.length) {
    await page.getByTestId("betrayal-scenario-reader-next-zone").click();
    const turningSheet = page.getByTestId(
      "betrayal-scenario-book-turning-sheet",
    );
    await expect(turningSheet).toBeVisible();
    await expect(
      page.getByTestId("betrayal-scenario-reader-header-progress"),
    ).toHaveText("2/2");
    await expect(
      page.getByTestId("betrayal-scenario-reader-footer-progress"),
    ).toHaveText("2/2");
    await expect(
      page.getByTestId("betrayal-scenario-book-page-blank-1"),
    ).toHaveCount(0);
    for (const text of options.nextBookTexts) {
      await expect(scenarioPage).toContainText(text);
    }
    await expect(turningSheet).toHaveCount(0, { timeout: 2000 });
  }
  await saveScreenshot(page, options.screenshotPath);
  await page.getByTestId("betrayal-scenario-reader-close").click();
  await expect(scenarioReaderDialog).toBeHidden();
  await expect(page.getByTestId("betrayal-board")).toBeVisible();
  await expect(
    page.getByTestId("betrayal-haunt-command-banner"),
    "关闭剧本书回到牌桌后仍不得出现常驻作祟横幅",
  ).toHaveCount(0);
  const primaryAction = page.getByTestId("betrayal-action-use");
  await expect(primaryAction).toBeVisible();
  if (options.primaryActionText) {
    await expect(primaryAction).not.toHaveAttribute(
      "data-haunt-primary-action-mode",
      "unavailable",
    );
    await expect(primaryAction).toContainText(options.primaryActionText);
  }
  const primaryBox = await primaryAction.boundingBox();
  expect(primaryBox, "作祟主动作必须保留真实底部按钮尺寸").not.toBeNull();
  if (primaryBox) {
    expect(primaryBox.height, "作祟主按钮必须满足触控尺寸").toBeGreaterThan(44);
  }
  for (const text of options.goalTexts) {
    await expect(page.getByTestId("betrayal-board")).toContainText(text);
  }
  for (const text of options.actionHintTexts ?? []) {
    await expect(page.getByTestId("betrayal-action-cue")).toContainText(text);
  }
  if (options.actionScreenshotPath) {
    await saveScreenshot(page, options.actionScreenshotPath);
  }
}

async function expectMobileHauntScenarioBook(
  page: Page,
  options: {
    headerText: string;
    firstPageTexts: string[];
    lastPageTexts: string[];
    firstScreenshotPath: string;
    lastScreenshotPath: string;
    closedScreenshotPath: string;
  },
) {
  await page.setViewportSize(MOBILE_LANDSCAPE_REFERENCE_VIEWPORT);
  await expect(
    page.getByTestId("betrayal-mobile-landscape-layout"),
  ).toBeVisible();
  await page.getByTestId("betrayal-open-scenario").click();

  const dialog = page.getByTestId("betrayal-scenario-reader-dialog");
  const book = dialog.getByTestId("betrayal-scenario-book");
  const closeButton = dialog.getByTestId("betrayal-scenario-reader-close");
  const previousButton = dialog.getByTestId(
    "betrayal-scenario-reader-prev-zone",
  );
  const nextButton = dialog.getByTestId("betrayal-scenario-reader-next-zone");
  await expect(dialog).toBeVisible();
  await expect(book).toBeVisible();
  await expect(dialog).toContainText(options.headerText);
  await expect(
    dialog.getByTestId("betrayal-scenario-reader-header-progress"),
  ).toHaveText("1/2");
  await expect(
    dialog.getByTestId("betrayal-scenario-reader-footer-progress"),
  ).toHaveText("1/2");
  await expect(previousButton).toBeDisabled();
  await expect(nextButton).toBeEnabled();

  for (const [label, target] of [
    ["关闭剧本", closeButton],
    ["上一页", previousButton],
    ["下一页", nextButton],
  ] as const) {
    const box = await target.boundingBox();
    expect(box, `${label}必须有真实触控热区`).not.toBeNull();
    expect(
      box?.width ?? 0,
      `${label}触控宽度不能小于44px`,
    ).toBeGreaterThanOrEqual(44);
    expect(
      box?.height ?? 0,
      `${label}触控高度不能小于44px`,
    ).toBeGreaterThanOrEqual(44);
  }

  const leaveButton = page.getByRole("button", { name: "离开", exact: true });
  if (await leaveButton.isVisible()) {
    const leaveBox = await leaveButton.boundingBox();
    expect(leaveBox, "全局离开按钮必须有真实布局尺寸").not.toBeNull();
    if (leaveBox) {
      const coveredByScenarioReader = await page.evaluate(
        ({ x, y }) =>
          Boolean(
            document
              .elementFromPoint(x, y)
              ?.closest('[data-testid="betrayal-scenario-reader-dialog"]'),
          ),
        {
          x: leaveBox.x + leaveBox.width / 2,
          y: leaveBox.y + leaveBox.height / 2,
        },
      );
      expect(
        coveredByScenarioReader,
        "打开剧本时，全局离开按钮不能盖住书页或翻页按钮",
      ).toBe(true);
    }
  }

  for (const text of options.firstPageTexts) {
    await expect(book).toContainText(text);
  }
  const expectVisiblePagesFit = async (label: string) => {
    const pageScrollers = book.locator(".custom-scrollbar");
    await expect(pageScrollers, `${label}必须显示左右两页正文`).toHaveCount(2);
    const overflow = await pageScrollers.evaluateAll((elements) =>
      elements.map((element) => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      })),
    );
    for (const [index, size] of overflow.entries()) {
      expect(
        size.scrollHeight,
        `${label}第${index + 1}页正文不能被隐藏滚动裁切`,
      ).toBeLessThanOrEqual(size.clientHeight + 2);
    }
  };
  await expectVisiblePagesFit("剧本首页");
  await saveScreenshot(page, options.firstScreenshotPath);

  await nextButton.click();
  const turningSheet = dialog.getByTestId(
    "betrayal-scenario-book-turning-sheet",
  );
  await expect(turningSheet).toBeVisible();
  await expect(
    dialog.getByTestId("betrayal-scenario-reader-header-progress"),
  ).toHaveText("2/2");
  await expect(
    dialog.getByTestId("betrayal-scenario-reader-footer-progress"),
  ).toHaveText("2/2");
  await expect(
    dialog.getByTestId("betrayal-scenario-book-page-blank-1"),
  ).toHaveCount(0);
  for (const text of options.lastPageTexts) {
    await expect(book).toContainText(text);
  }
  await expect(turningSheet).toHaveCount(0, { timeout: 2000 });
  await expectVisiblePagesFit("剧本末页");
  await expect(nextButton).toBeDisabled();
  await saveScreenshot(page, options.lastScreenshotPath);

  await closeButton.click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("betrayal-board")).toBeVisible();
  await saveScreenshot(page, options.closedScreenshotPath);
}

async function expectDiscoveryResultKeepsTableChrome(page: Page, label: string) {
  await expect(
    page.getByTestId("betrayal-action-rail"),
    `${label}PC 事件结算态必须保留桌面行动栏，不能把周边 UI 整体隐藏`,
  ).toBeVisible();
  await expect(
    page.getByTestId("betrayal-status-rail"),
    `${label}PC 事件结算态必须保留右侧牌堆/弃牌状态栏`,
  ).toBeVisible();
  await expect(
    page.getByTestId("betrayal-phase-chip"),
    `${label}PC 事件结算态必须保留阶段 chip`,
  ).toBeVisible();
  const metrics = await page.evaluate(() => {
    const rectOf = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) {
        throw new Error(`missing ${selector}`);
      }
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    };
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      content: rectOf('[data-testid="betrayal-discovery-panel-content"]'),
      actionRail: rectOf('[data-testid="betrayal-action-rail"]'),
      statusRail: rectOf('[data-testid="betrayal-status-rail"]'),
      phaseChip: rectOf('[data-testid="betrayal-phase-chip"]'),
    };
  });
  expect(
    metrics.statusRail.right,
    `${label}PC 右侧状态栏必须在视口内`,
  ).toBeLessThanOrEqual(metrics.viewport.width + 1);
  expect(
    metrics.content.right,
    `${label}PC 事件结算层必须给右侧状态栏让位`,
  ).toBeLessThanOrEqual(metrics.statusRail.left - 2);
  expect(
    metrics.content.bottom,
    `${label}PC 事件结算层必须避开底部行动栏`,
  ).toBeLessThanOrEqual(metrics.actionRail.top + 4);
  expect(
    metrics.phaseChip.bottom,
    `${label}PC 阶段 chip 必须保留在事件结算层上方`,
  ).toBeLessThanOrEqual(metrics.content.top + 4);
}

async function expectDiscoveryContinueAtPanelBottom(page: Page) {
  const metrics = await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>(
      '[data-testid="betrayal-discovery-panel-main"]',
    );
    const button = document.querySelector<HTMLElement>(
      '[data-testid="betrayal-discovery-continue"]',
    );
    const content = document.querySelector<HTMLElement>(
      '[data-testid="betrayal-discovery-panel-content"]',
    );
    if (!main || !button || !content) {
      throw new Error("发现结果面板缺少主内容、返回牌桌按钮或内容容器");
    }
    const rectsOf = (selector: string) =>
      Array.from(document.querySelectorAll<HTMLElement>(selector))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          };
        })
        .filter((rect) => rect.width > 40 && rect.height > 40);
    const mainRect = main.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    const card = document.querySelector<HTMLElement>(
      '[data-testid="betrayal-discovery-card-front-atlas"]',
    );
    const cardRect = card?.getBoundingClientRect() ?? null;
    const hit = document.elementFromPoint(
      buttonRect.left + buttonRect.width / 2,
      buttonRect.top + buttonRect.height / 2,
    );
    return {
      actionPosition: button.dataset.discoveryActionPosition,
      actionSurface: button.dataset.discoveryActionSurface,
      mainTop: Math.round(mainRect.top),
      mainBottom: Math.round(mainRect.bottom),
      mainCenterX: Math.round(mainRect.left + mainRect.width / 2),
      mainCenterY: Math.round(mainRect.top + mainRect.height / 2),
      buttonTop: Math.round(buttonRect.top),
      buttonBottom: Math.round(buttonRect.bottom),
      buttonLeft: Math.round(buttonRect.left),
      buttonRight: Math.round(buttonRect.right),
      contentBottom: Math.round(contentRect.bottom),
      contentCenterX: Math.round(contentRect.left + contentRect.width / 2),
      buttonCenterX: Math.round(buttonRect.left + buttonRect.width / 2),
      buttonCenterY: Math.round(buttonRect.top + buttonRect.height / 2),
      card: cardRect
        ? {
            left: Math.round(cardRect.left),
            right: Math.round(cardRect.right),
            top: Math.round(cardRect.top),
            bottom: Math.round(cardRect.bottom),
            centerX: Math.round(cardRect.left + cardRect.width / 2),
          }
        : null,
      buttonHitTestId:
        hit?.closest<HTMLElement>("button")?.dataset.testid ??
        (hit as HTMLElement | null)?.dataset?.testid ??
        "",
      roomShells: rectsOf('[data-testid^="betrayal-room-shell-"]'),
    };
  });
  const overlapArea = (
    a: {
      left: number;
      right: number;
      top: number;
      bottom: number;
    },
    b: {
      left: number;
      right: number;
      top: number;
      bottom: number;
    },
  ) => {
    const width = Math.max(
      0,
      Math.min(a.right, b.right) - Math.max(a.left, b.left),
    );
    const height = Math.max(
      0,
      Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top),
    );
    return width * height;
  };
  expect(
    metrics.actionPosition,
    "无投骰发现牌确认按钮必须在卡牌外的底部动作区，不能塞进正式卡面",
  ).toBe("bottom");
  expect(metrics.buttonTop).toBeGreaterThanOrEqual(metrics.mainBottom - 1);
  expect(
    metrics.actionSurface,
    "底部确认必须是卡外独立动作坞，不能退回透明贴房间牌",
  ).toBe("card-external-dock");
  expect(metrics.contentBottom - metrics.buttonBottom).toBeLessThanOrEqual(2);
  expect(metrics.card, "确认按钮外置检查必须读到正式事件牌").not.toBeNull();
  expect(
    metrics.buttonTop,
    "确认按钮必须低于正式事件牌，不能压在卡面文字或图像上",
  ).toBeGreaterThanOrEqual(metrics.card!.bottom + 6);
  expect(
    Math.abs(metrics.buttonCenterX - metrics.contentCenterX),
    "返回牌桌按钮必须居中贴在发现面板底部动作区",
  ).toBeLessThanOrEqual(2);
  expect(
    metrics.buttonHitTestId,
    "确认按钮中心点必须真实命中按钮本体，不能被其它浮层盖住",
  ).toBe("betrayal-discovery-continue");
  const buttonRect = {
    left: metrics.buttonLeft,
    right: metrics.buttonRight,
    top: metrics.buttonTop,
    bottom: metrics.buttonBottom,
  };
  expect(
    overlapArea(buttonRect, metrics.card!),
    "确认按钮不得与正式事件牌卡面重叠",
  ).toBe(0);
  const buttonOverlappedRooms = metrics.roomShells.filter(
    (room) => overlapArea(buttonRect, room) > 0,
  );
  expect(
    buttonOverlappedRooms,
    "确认/返回按钮不得贴在或压住房间牌",
  ).toEqual([]);
}

async function expectDiscoveryResolutionLedgerTraceOnly(
  discoveryPanel: Locator,
  label: string,
) {
  const resolutionLedger = discoveryPanel.getByTestId(
    "betrayal-discovery-resolution-steps",
  );
  await expect(
    resolutionLedger,
    `${label}确认队列只能作为隐藏追踪，不能可见复写结果正文`,
  ).toHaveCount(0);
}

async function expectEventChoiceKeepsTurnBlocked(page: Page, label: string) {
  const core = await readCurrentCore(page);
  expect(core.currentPlayer, `${label}当前行动者仍应是发现玩家`).toBe("0");
  expect(core.currentExplorer.playerId, `${label}当前探索者仍应是 0 号`).toBe(
    "0",
  );
  expect(
    core.pendingEventChoice?.playerId,
    `${label}事件必须仍归 0 号处理`,
  ).toBe("0");
  await expect(
    page.getByTestId("betrayal-action-rail"),
    `${label}事件待选态应保留 PC 同构行动栏，不应把其它桌面 UI 整体隐藏`,
  ).toBeVisible();
}

async function expectDiscoveryResultKeepsTurnBlocked(
  page: Page,
  label: string,
) {
  const core = await readCurrentCore(page);
  expect(core.currentPlayer, `${label}当前行动者不能提前切到下一位`).toBe("0");
  expect(
    core.currentExplorer.playerId,
    `${label}当前探索者仍应是发现玩家`,
  ).toBe("0");
  expect(core.turnEndedByDiscovery, `${label}发现后只能进入结束回合等待`).toBe(
    true,
  );
  expect(core.recommendedAction, `${label}推荐动作必须是结束回合`).toBe(
    "endTurn",
  );
  await expectDiscoveryResultKeepsTableChrome(page, label);
  await expectDiscoveryContinueAtPanelBottom(page);
}

async function expectMobileDiceBoxStable(rollPanel: Locator, label: string) {
  const diceGroup = rollPanel.getByTestId("betrayal-house-dice-3d-group");
  const before = await diceGroup.boundingBox();
  await rollPanel.page().waitForTimeout(600);
  const after = await diceGroup.boundingBox();
  if (!before || !after) {
    throw new Error(`${label}无法读取骰子盒尺寸`);
  }
  expect(after.height, `${label}骰子盒不能变成小块`).toBeGreaterThanOrEqual(
    150,
  );
  expect(
    Math.abs(after.height - before.height),
    `${label}骰子盒高度不能持续变小`,
  ).toBeLessThanOrEqual(8);
  expect(
    Math.abs(after.width - before.width),
    `${label}骰子盒宽度不能持续变小`,
  ).toBeLessThanOrEqual(8);
}

async function expectMobilePrimaryMapFocus(page: Page, label: string) {
  const core = await readCurrentCore(page);
  const activeRoom = page.getByTestId(
    `betrayal-room-shell-${core.currentExplorer.roomId}`,
  );
  await expect(activeRoom).toBeVisible();
  await expect
    .poll(
      async () => {
        const box = await activeRoom.boundingBox();
        if (!box) return "missing-room";
        const viewport = page.viewportSize();
        if (!viewport) return "missing-viewport";
        const canvasTransform = await page
          .getByTestId("betrayal-room-canvas")
          .evaluate((element) => getComputedStyle(element).transform);
        const roomGridBox = await page
          .getByTestId("betrayal-room-grid")
          .boundingBox();
        const roomCanvasBox = await page
          .getByTestId("betrayal-room-canvas")
          .boundingBox();
        const layoutMetrics = await page.evaluate(() => {
          const inspect = (selector: string) => {
            const element = document.querySelector<HTMLElement>(selector);
            if (!element) return null;
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return {
              top: rect.top,
              bottom: rect.bottom,
              width: rect.width,
              height: rect.height,
              cssHeight: style.height,
              cssMinHeight: style.minHeight,
              cssMaxHeight: style.maxHeight,
            };
          };
          return {
            visualViewportHeight: window.visualViewport?.height ?? null,
            board: inspect('[data-testid="betrayal-board"]'),
            layout: inspect('[data-testid="betrayal-mobile-landscape-layout"]'),
            roomGrid: inspect('[data-testid="betrayal-room-grid"]'),
            shell: inspect(".mobile-board-shell"),
          };
        });
        const fits =
          box.width >= 96 &&
          box.height >= 96 &&
          box.x >= 4 &&
          box.x + box.width <= viewport.width - 4 &&
          box.y >= 4 &&
          box.y + box.height <= viewport.height - 52;
        return fits
          ? "ok"
          : JSON.stringify({
              currentExplorerRoomId: core.currentExplorer.roomId,
              box,
              viewport,
              canvasTransform,
              roomGridBox,
              roomCanvasBox,
              layoutMetrics,
            });
      },
      {
        message: `${label}当前房间必须以可读尺寸完整聚焦在行动栏上方`,
        timeout: 5000,
      },
    )
    .toBe("ok");
}

async function expectMobileEventChoiceLayout(page: Page, label: string) {
  const eventChoicePanel = page.getByTestId("betrayal-event-choice-panel");
  const eventChoiceBackdrop = page.getByTestId(
    "betrayal-event-choice-backdrop",
  );
  const rollPanel = page.getByTestId("betrayal-recent-roll-panel");
  const mobileActionRail = page.getByTestId("betrayal-mobile-action-rail");
  const mobileStatusHud = page.getByTestId("betrayal-mobile-event-status-hud");
  const mobilePhaseChip = page.getByTestId("betrayal-phase-chip");
  const mobileRightStatusRail = page.getByTestId("betrayal-status-rail");
  await expect(page.locator("html")).toHaveAttribute(
    "data-mobile-layout-preset",
    "map-shell",
  );
  await expect(eventChoiceBackdrop).toHaveAttribute(
    "data-scene-visibility",
    "interactive-map",
  );
  await expect(
    mobileActionRail,
    `${label}事件待选态必须保留移动端行动栏，不能把其它 UI 整体隐藏`,
  ).toBeVisible();
  await expect(
    mobileStatusHud,
    `${label}事件待选态必须保留 PC 左侧探索者信息承载，不能换成文字 HUD`,
  ).toBeVisible();
  await expect(mobileStatusHud).toHaveAttribute(
    "data-mobile-role",
    "pc-isomorphic-explorer-rail",
  );
  await expect(
    mobileStatusHud.getByTestId("betrayal-current-traits"),
    `${label}移动端必须复用 PC 当前探索者属性面板`,
  ).toBeVisible();
  await expect(
    mobileStatusHud.getByTestId("betrayal-current-ability"),
    `${label}移动端不能丢失 PC 探索者能力信息`,
  ).toBeVisible();
  await expect(
    mobileStatusHud.locator('[data-testid^="betrayal-current-trait-row-"]'),
    `${label}移动端必须用 PC 属性条承接四项属性，而不是另写文字摘要`,
  ).toHaveCount(4);
  await expect(
    mobileStatusHud.locator(
      '[data-testid="betrayal-observed-explorer-panel"][data-player-id]',
    ),
    `${label}移动端必须保留 PC 探索者人物面板，而不是把左上面板改成地图 token`,
  ).toBeVisible();
  await expect(
    mobilePhaseChip,
    `${label}移动端必须保留 PC 同源阶段 chip，而不是无声隐藏阶段 UI`,
  ).toBeVisible();
  await expect(mobilePhaseChip).toHaveAttribute(
    "data-mobile-role",
    "pc-isomorphic-phase-chip",
  );
  await expect(
    mobileRightStatusRail,
    `${label}移动端必须保留 PC 右侧牌堆/弃牌/参考入口状态栏，不能只保留弹窗本体`,
  ).toBeVisible();
  await expect(mobileRightStatusRail).toHaveAttribute(
    "data-mobile-role",
    "pc-isomorphic-status-rail",
  );
  await expect(
    mobileRightStatusRail.locator("#betrayal-decks-section"),
    `${label}移动端右侧状态栏必须继续显示 PC 同源牌堆/弃牌区`,
  ).toBeVisible();
  await expect(eventChoicePanel).toHaveAttribute("data-surface", "open-table");
  await expect
    .poll(
      async () =>
        eventChoicePanel
          .getByTestId("betrayal-event-choice-card-front-atlas")
          .locator("img")
          .evaluate((img) => {
            const image = img as HTMLImageElement;
            const style = window.getComputedStyle(image);
            return {
              complete: image.complete,
              naturalWidth: image.naturalWidth,
              naturalHeight: image.naturalHeight,
              opacity: Number(style.opacity),
              currentSrc: image.getAttribute("data-debug-current-src"),
              renderedSrc: image.getAttribute("data-debug-rendered-src"),
              objectUrl: image.getAttribute("data-debug-object-url"),
              localFetch: image.getAttribute("data-debug-local-fetch"),
              browserCurrentSrc: image.currentSrc,
              browserSrc: image.src,
            };
          })
          .catch(() => null),
      {
        message: `${label}事件牌截图前必须等真实牌图渲染，不能用灰色占位图收口`,
        timeout: 30000,
      },
    )
    .toEqual(
      expect.objectContaining({
        complete: true,
        naturalWidth: expect.any(Number),
        naturalHeight: expect.any(Number),
        opacity: 1,
      }),
    );
  const eventCardImageMetrics = await eventChoicePanel
    .getByTestId("betrayal-event-choice-card-front-atlas")
    .locator("img")
    .evaluate((img) => {
      const image = img as HTMLImageElement;
      return {
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
      };
    });
  expect(
    eventCardImageMetrics.naturalWidth,
    `${label}事件牌图片必须有真实宽度，不能是未加载占位`,
  ).toBeGreaterThan(0);
  expect(
    eventCardImageMetrics.naturalHeight,
    `${label}事件牌图片必须有真实高度，不能是未加载占位`,
  ).toBeGreaterThan(0);
  await expect(rollPanel).toHaveAttribute(
    "data-roll-panel-style",
    "open-table-transparent",
  );
  await expect(
    rollPanel.getByTestId("betrayal-recent-roll-result-stage"),
  ).toHaveAttribute("data-result-layout", "split-primary-total");
  await expect(
    rollPanel.getByTestId("betrayal-recent-roll-result-stage"),
  ).toHaveAttribute("data-result-surface", "open-info-band");
  await expect(rollPanel.getByTestId("betrayal-recent-roll-stage-surface")).toHaveCount(0);
  await expect(rollPanel.getByTestId("betrayal-recent-roll-breakdown")).toContainText("骰面合计");
  await expect(rollPanel.getByTestId("betrayal-recent-roll-breakdown")).toContainText("加值");
  await expect(rollPanel.getByTestId("betrayal-recent-roll-outcome")).toHaveCount(0);

  const metrics = await page.evaluate(() => {
    const rectOf = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) {
        throw new Error(`missing ${selector}`);
      }
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
      };
    };
    const rectsOf = (selector: string) =>
      Array.from(document.querySelectorAll<HTMLElement>(selector)).map(
        (element) => {
          const rect = element.getBoundingClientRect();
          return {
            testId: element.dataset.testid ?? "",
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          };
        },
      );
    const rectOrNull = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) {
        return null;
      }
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    };
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      shell: rectOf(".mobile-board-shell"),
      backdrop: rectOf('[data-testid="betrayal-event-choice-backdrop"]'),
      backdropColor: getComputedStyle(
        document.querySelector<HTMLElement>(
          '[data-testid="betrayal-event-choice-backdrop"]',
        )!,
      ).backgroundColor,
      panel: rectOf('[data-testid="betrayal-event-choice-panel"]'),
      panelBackgroundColor: getComputedStyle(
        document.querySelector<HTMLElement>(
          '[data-testid="betrayal-event-choice-panel"]',
        )!,
      ).backgroundColor,
      rollBackgroundColor: getComputedStyle(
        document.querySelector<HTMLElement>(
          '[data-testid="betrayal-recent-roll-panel"]',
        )!,
      ).backgroundColor,
      resultStageBackgroundColor: getComputedStyle(
        document.querySelector<HTMLElement>(
          '[data-testid="betrayal-recent-roll-result-stage"]',
        )!,
      ).backgroundColor,
      card: rectOf('[data-testid="betrayal-event-choice-card-front-atlas"]'),
      roll: rectOf('[data-testid="betrayal-recent-roll-panel"]'),
      diceGroup: rectOf(
        '[data-testid="betrayal-event-choice-panel"] [data-testid="betrayal-house-dice-3d-group"]',
      ),
      resultStage: rectOf(
        '[data-testid="betrayal-event-choice-panel"] [data-testid="betrayal-recent-roll-result-stage"]',
      ),
      confirm: rectOrNull('[data-testid="betrayal-event-choice-confirm"]'),
      phaseChip: rectOf('[data-testid="betrayal-phase-chip"]'),
      mobileActionRail: rectOf('[data-testid="betrayal-mobile-action-rail"]'),
      mobileStatusHud: rectOf(
        '[data-testid="betrayal-mobile-event-status-hud"]',
      ),
      mobileStatusTraitsPanel: rectOf(
        '[data-testid="betrayal-mobile-event-status-hud"] [data-testid="betrayal-current-traits"]',
      ),
      mobileStatusTraits: rectsOf(
        '[data-testid="betrayal-mobile-event-status-hud"] [data-testid^="betrayal-current-trait-row-"]',
      ),
      mobileRightStatusRail: rectOf('[data-testid="betrayal-status-rail"]'),
      mobileRightDeckSection: rectOf("#betrayal-decks-section"),
      traitChoiceHitTargets: rectsOf(
        'button[data-testid^="betrayal-event-choice-trait-"]',
      ).map((rect) => {
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const hit = document.elementFromPoint(
          centerX,
          centerY,
        ) as HTMLElement | null;
        const hitButton = hit?.closest<HTMLElement>(
          'button[data-testid^="betrayal-event-choice-trait-"]',
        );
        const stack = document
          .elementsFromPoint(centerX, centerY)
          .slice(0, 8)
          .map((element) => {
            const htmlElement = element as HTMLElement;
            const style = getComputedStyle(htmlElement);
            return {
              tagName: htmlElement.tagName,
              testId: htmlElement.dataset.testid ?? "",
              ariaLabel: htmlElement.getAttribute("aria-label") ?? "",
              role: htmlElement.getAttribute("role") ?? "",
              className:
                typeof htmlElement.className === "string"
                  ? htmlElement.className.slice(0, 180)
                  : "",
              pointerEvents: style.pointerEvents,
              zIndex: style.zIndex,
              overflow: style.overflow,
            };
          });
        return {
          testId: rect.testId,
          hitTestId: hitButton?.dataset.testid ?? hit?.dataset.testid ?? "",
          hitTagName: hit?.tagName ?? "",
          centerX,
          centerY,
          stack,
        };
      }),
      traitChoices: rectsOf(
        'button[data-testid^="betrayal-event-choice-trait-"]',
      ),
    };
  });

  expect(metrics.viewport, `${label}必须在标准手机横屏视口验证`).toEqual(
    MOBILE_LANDSCAPE_REFERENCE_VIEWPORT,
  );
  expect(
    metrics.shell.width,
    `${label}地图壳必须直接铺满手机视口，不能再整页缩放`,
  ).toBeGreaterThanOrEqual(metrics.viewport.width - 2);
  expect(
    metrics.shell.height,
    `${label}地图壳必须直接铺满手机视口高度`,
  ).toBeGreaterThanOrEqual(metrics.viewport.height - 2);
  expect(
    metrics.shell.height,
    `${label}地图壳不能继续保留被视口裁切的逻辑高度`,
  ).toBeLessThanOrEqual(metrics.viewport.height + 2);
  expect(
    metrics.backdrop.width,
    `${label}阻塞层必须覆盖完整手机视口`,
  ).toBeGreaterThanOrEqual(metrics.viewport.width - 2);
  expect(
    metrics.backdrop.height,
    `${label}阻塞层必须覆盖完整手机视口高度`,
  ).toBeGreaterThanOrEqual(metrics.viewport.height - 2);
  expect(
    metrics.backdropColor,
    `${label}移动端事件弹窗应沿用 PC 的开放桌面口径，不额外压暗地图`,
  ).toBe("rgba(0, 0, 0, 0)");
  expect(
    metrics.panelBackgroundColor,
    `${label}移动端事件选择面板不能再加专属黑底，必须和 PC 一样是开放桌面叠层`,
  ).toBe("rgba(0, 0, 0, 0)");
  expect(
    metrics.rollBackgroundColor,
    `${label}移动端事件投骰区不能靠黑底承接，必须保留透明物理骰盘`,
  ).toBe("rgba(0, 0, 0, 0)");
  expect(
    metrics.resultStageBackgroundColor,
    `${label}移动端投骰结果条不能再加黑底，必须保留透明开放叠层`,
  ).toBe("rgba(0, 0, 0, 0)");
  expect(
    metrics.panel.width,
    `${label}主选择层不能横向溢出手机屏幕`,
  ).toBeLessThanOrEqual(metrics.viewport.width - 8);
  expect(
    metrics.panel.height,
    `${label}主选择层不能竖向盖满手机屏幕`,
  ).toBeLessThanOrEqual(metrics.viewport.height - 72);
  expect(
    metrics.mobileActionRail.bottom,
    `${label}移动端行动栏必须留在视口内`,
  ).toBeLessThanOrEqual(metrics.viewport.height + 1);
  expect(
    metrics.panel.bottom,
    `${label}事件弹窗必须避开底部行动栏，不能靠隐藏行动栏解决重叠`,
  ).toBeLessThanOrEqual(metrics.mobileActionRail.top + 4);
  expect(
    metrics.mobileStatusHud.left,
    `${label}移动端状态 HUD 必须留在视口内`,
  ).toBeGreaterThanOrEqual(0);
  expect(
    metrics.mobileStatusHud.top,
    `${label}移动端状态 HUD 必须留在视口内`,
  ).toBeGreaterThanOrEqual(0);
  expect(
    metrics.mobileStatusHud.right,
    `${label}移动端 PC 同源探索者面板必须给事件横排面板让位，不能盖住事件牌`,
  ).toBeLessThanOrEqual(metrics.panel.left - 6);
  expect(
    metrics.mobileStatusHud.bottom,
    `${label}移动端 PC 同源探索者面板不能压住底部行动栏`,
  ).toBeLessThanOrEqual(metrics.mobileActionRail.top + 4);
  expect(
    metrics.mobileRightStatusRail.right,
    `${label}移动端 PC 右侧状态栏必须留在视口内`,
  ).toBeLessThanOrEqual(metrics.viewport.width + 1);
  expect(
    metrics.mobileRightStatusRail.left,
    `${label}移动端 PC 右侧状态栏必须留在视口内`,
  ).toBeGreaterThanOrEqual(0);
  expect(
    metrics.mobileRightStatusRail.bottom,
    `${label}移动端 PC 右侧状态栏不能压住底部行动栏`,
  ).toBeLessThanOrEqual(metrics.mobileActionRail.top + 4);
  expect(
    metrics.panel.right,
    `${label}事件弹窗必须给 PC 右侧牌堆/弃牌状态栏让位，不能靠隐藏右侧 UI 解决重叠`,
  ).toBeLessThanOrEqual(metrics.mobileRightStatusRail.left - 2);
  expect(
    metrics.mobileRightStatusRail.width,
    `${label}移动端 PC 右侧状态栏不能被缩到不可识别`,
  ).toBeGreaterThanOrEqual(100);
  expect(
    metrics.mobileRightDeckSection.height,
    `${label}移动端右侧牌堆/弃牌区必须可见，不得只保留空壳`,
  ).toBeGreaterThan(100);
  expect(
    metrics.mobileStatusTraitsPanel.width,
    `${label}移动端 PC 同源属性面板不能被压到不可读`,
  ).toBeGreaterThanOrEqual(120);
  for (const statusTrait of metrics.mobileStatusTraits) {
    expect(
      statusTrait.width,
      `${label}${statusTrait.testId}必须是 PC 同源属性条，不得退回文字 HUD`,
    ).toBeGreaterThan(100);
    expect(
      statusTrait.height,
      `${label}${statusTrait.testId}必须可读，不得只放 sr-only`,
    ).toBeGreaterThan(7);
  }
  expect(
    metrics.phaseChip.top,
    `${label}移动端阶段 chip 必须留在视口内`,
  ).toBeGreaterThanOrEqual(0);
  expect(
    metrics.phaseChip.bottom,
    `${label}移动端阶段 chip 必须避开事件面板主阅读区`,
  ).toBeLessThanOrEqual(metrics.panel.top + 4);
  expect(
    metrics.card.width,
    `${label}事件牌不能小到不可读`,
  ).toBeGreaterThanOrEqual(120);
  expect(
    metrics.roll.left,
    `${label}投骰区必须给事件牌让出左侧阅读区`,
  ).toBeGreaterThanOrEqual(metrics.card.right + 4);
  expect(
    metrics.roll.width,
    `${label}投骰区必须只承载骰盘和结果，不能挤掉两侧 PC 同源 UI`,
  ).toBeLessThanOrEqual(metrics.viewport.width * 0.56);
  expect(
    metrics.diceGroup.left,
    `${label}透明骰盘必须仍在事件牌右侧，不能回到地图中心散落`,
  ).toBeGreaterThanOrEqual(metrics.card.right + 1);
  expect(
    metrics.resultStage.left,
    `${label}投骰结果必须收在投骰区内，不能和属性/确认列拆成另一套远端区域`,
  ).toBeGreaterThanOrEqual(metrics.roll.left - 4);
  expect(
    metrics.resultStage.right,
    `${label}投骰结果必须收在投骰区内，不能伸进属性/确认列或右侧状态栏`,
  ).toBeLessThanOrEqual(metrics.roll.right + 4);
  expect(
    metrics.resultStage.bottom,
    `${label}投骰结果必须停留在投骰区内，不能压到底部行动栏附近`,
  ).toBeLessThanOrEqual(metrics.roll.bottom + 4);
  expect(
    metrics.roll.height,
    `${label}投骰区不能成为全屏居中大块`,
  ).toBeLessThanOrEqual(metrics.viewport.height * 0.78);
  if (metrics.confirm) {
    expect(
      metrics.confirm.width,
      `${label}确认/接受按钮触控宽度不足`,
    ).toBeGreaterThanOrEqual(120);
    expect(
      metrics.confirm.height,
      `${label}确认/接受按钮触控高度不足`,
    ).toBeGreaterThanOrEqual(44);
    expect(
      metrics.confirm.left,
      `${label}确认/接受按钮必须在投骰区右侧的同源选择列内，不能覆盖骰盘/结果`,
    ).toBeGreaterThanOrEqual(metrics.roll.right - 4);
    expect(
      metrics.confirm.right,
      `${label}确认/接受按钮不能漂到右侧 HUD 或底栏`,
    ).toBeLessThanOrEqual(metrics.panel.right + 4);
  }
  const traitChoices = [...metrics.traitChoices].sort(
    (a, b) => a.left - b.left,
  );
  if (traitChoices.length > 0) {
    expect(
      traitChoices[0].top,
      `${label}属性选择必须留在事件工作区内，不能压到阶段 chip 或地图顶部`,
    ).toBeGreaterThanOrEqual(metrics.panel.top - 4);
    expect(
      traitChoices[0].left,
      `${label}属性选择必须在投骰区右侧的同源选择列内，不能另起一套移动端布局`,
    ).toBeGreaterThanOrEqual(metrics.roll.right - 4);
  }
  for (const choice of traitChoices) {
    expect(
      choice.height,
      `${label}${choice.testId}触控高度不足`,
    ).toBeGreaterThanOrEqual(44);
  }
  for (const hitTarget of metrics.traitChoiceHitTargets) {
    expect(
      hitTarget.hitTestId,
      `${label}${hitTarget.testId}中心点必须真实命中属性按钮，不能被底层房间主视区截获：${JSON.stringify(
        hitTarget,
      )}`,
    ).toBe(hitTarget.testId);
  }
  if (traitChoices.length > 1) {
    const firstChoice = traitChoices[0];
    for (let index = 1; index < traitChoices.length; index += 1) {
      const previous = traitChoices[index - 1];
      const current = traitChoices[index];
      expect(
        Math.abs(current.top - firstChoice.top),
        `${label}属性选项应保持 PC 同构横排，不能改成手机竖排`,
      ).toBeLessThanOrEqual(8);
      expect(
        current.left,
        `${label}属性选项应从左到右横向展开`,
      ).toBeGreaterThan(previous.left);
      expect(
        current.left - previous.right,
        `${label}属性选项横向间距过大`,
      ).toBeLessThanOrEqual(24);
    }
  }
}

async function expectDesktopEventChoiceLayout(page: Page, label: string) {
  const eventChoicePanel = page.getByTestId("betrayal-event-choice-panel");
  const eventChoiceBackdrop = page.getByTestId(
    "betrayal-event-choice-backdrop",
  );
  const rollPanel = page.getByTestId("betrayal-recent-roll-panel");
  await expect(
    page.getByTestId("betrayal-action-rail"),
    `${label}PC 事件待选态必须保留底部行动栏，不能把桌面 UI 整体隐藏`,
  ).toBeVisible();
  await expect(
    page.getByTestId("betrayal-status-rail"),
    `${label}PC 事件待选态必须保留右侧牌堆/弃牌状态栏`,
  ).toBeVisible();
  await expect(
    page.getByTestId("betrayal-current-traits"),
    `${label}PC 事件待选态必须保留左侧探索者属性面板`,
  ).toBeVisible();
  await expect(
    page.getByTestId("betrayal-phase-chip"),
    `${label}PC 事件待选态必须保留阶段 chip`,
  ).toBeVisible();
  await expect(eventChoiceBackdrop).toHaveAttribute(
    "data-scene-visibility",
    "interactive-map",
  );
  await expect(eventChoicePanel).toHaveAttribute("data-surface", "open-table");
  await expect(rollPanel).toHaveAttribute(
    "data-roll-panel-style",
    "open-table-transparent",
  );
  await expect(
    rollPanel.getByTestId("betrayal-recent-roll-result-stage"),
  ).toHaveAttribute("data-result-surface", "open-info-band");

  const metrics = await page.evaluate(() => {
    const rectOf = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) {
        throw new Error(`missing ${selector}`);
      }
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    };
    const rectsOf = (selector: string) =>
      Array.from(document.querySelectorAll<HTMLElement>(selector)).map(
        (element) => {
          const rect = element.getBoundingClientRect();
          return {
            testId: element.dataset.testid ?? "",
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          };
        },
      );
    const rectOrNull = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) {
        return null;
      }
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    };
    const computedBackground = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) {
        throw new Error(`missing ${selector}`);
      }
      return getComputedStyle(element).backgroundColor;
    };
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      backdrop: rectOf('[data-testid="betrayal-event-choice-backdrop"]'),
      backdropColor: computedBackground(
        '[data-testid="betrayal-event-choice-backdrop"]',
      ),
      panel: rectOf('[data-testid="betrayal-event-choice-panel"]'),
      panelBackgroundColor: computedBackground(
        '[data-testid="betrayal-event-choice-panel"]',
      ),
      rollBackgroundColor: computedBackground(
        '[data-testid="betrayal-recent-roll-panel"]',
      ),
      resultStageBackgroundColor: computedBackground(
        '[data-testid="betrayal-recent-roll-result-stage"]',
      ),
      card: rectOf('[data-testid="betrayal-event-choice-card-front-atlas"]'),
      roll: rectOf('[data-testid="betrayal-recent-roll-panel"]'),
      diceGroup: rectOf(
        '[data-testid="betrayal-event-choice-panel"] [data-testid="betrayal-house-dice-3d-group"]',
      ),
      resultStage: rectOf(
        '[data-testid="betrayal-event-choice-panel"] [data-testid="betrayal-recent-roll-result-stage"]',
      ),
      confirm: rectOrNull('[data-testid="betrayal-event-choice-confirm"]'),
      choiceHitTargets: [
        ...Array.from(
          document.querySelectorAll<HTMLElement>(
            'button[data-testid^="betrayal-event-choice-trait-"]',
          ),
        ),
        document.querySelector<HTMLElement>(
          '[data-testid="betrayal-event-choice-confirm"]',
        ),
      ]
        .filter((element): element is HTMLElement => Boolean(element))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const elementStyle = getComputedStyle(element);
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          const hit = document.elementFromPoint(
            centerX,
            centerY,
          ) as HTMLElement | null;
          const hitControl = hit?.closest<HTMLElement>(
            'button[data-testid^="betrayal-event-choice-trait-"], button[data-testid="betrayal-event-choice-confirm"]',
          );
          const stack = document
            .elementsFromPoint(centerX, centerY)
            .slice(0, 8)
            .map((stackElement) => {
              const htmlElement = stackElement as HTMLElement;
              const style = getComputedStyle(htmlElement);
              return {
                tagName: htmlElement.tagName,
                testId: htmlElement.dataset.testid ?? "",
                ariaLabel: htmlElement.getAttribute("aria-label") ?? "",
                className:
                  typeof htmlElement.className === "string"
                    ? htmlElement.className.slice(0, 180)
                    : "",
                pointerEvents: style.pointerEvents,
                zIndex: style.zIndex,
              };
            });
          return {
            testId: element.dataset.testid ?? "",
            elementClassName:
              typeof element.className === "string"
                ? element.className.slice(0, 240)
                : "",
            elementPointerEvents: elementStyle.pointerEvents,
            elementZIndex: elementStyle.zIndex,
            elementRect: {
              left: rect.left,
              right: rect.right,
              top: rect.top,
              bottom: rect.bottom,
              width: rect.width,
              height: rect.height,
            },
            ancestors: Array.from(
              (() => {
                const ancestors: HTMLElement[] = [];
                let current: HTMLElement | null = element.parentElement;
                while (current && ancestors.length < 8) {
                  ancestors.push(current);
                  current = current.parentElement;
                }
                return ancestors;
              })(),
            ).map((ancestor) => {
              const ancestorRect = ancestor.getBoundingClientRect();
              const ancestorStyle = getComputedStyle(ancestor);
              return {
                tagName: ancestor.tagName,
                testId: ancestor.dataset.testid ?? "",
                className:
                  typeof ancestor.className === "string"
                    ? ancestor.className.slice(0, 240)
                    : "",
                pointerEvents: ancestorStyle.pointerEvents,
                zIndex: ancestorStyle.zIndex,
                overflow: ancestorStyle.overflow,
                rect: {
                  left: ancestorRect.left,
                  right: ancestorRect.right,
                  top: ancestorRect.top,
                  bottom: ancestorRect.bottom,
                  width: ancestorRect.width,
                  height: ancestorRect.height,
                },
              };
            }),
            hitTestId: hitControl?.dataset.testid ?? hit?.dataset.testid ?? "",
            hitTagName: hit?.tagName ?? "",
            centerX,
            centerY,
            stack,
          };
        }),
      traitChoices: rectsOf(
        'button[data-testid^="betrayal-event-choice-trait-"]',
      ),
      actionRail: rectOf('[data-testid="betrayal-action-rail"]'),
      statusRail: rectOf('[data-testid="betrayal-status-rail"]'),
      currentTraits: rectOf('[data-testid="betrayal-current-traits"]'),
      phaseChip: rectOf('[data-testid="betrayal-phase-chip"]'),
    };
  });
  expect(
    metrics.backdropColor,
    `${label}PC 事件选择层不能靠黑底遮住地图和 HUD`,
  ).toBe("rgba(0, 0, 0, 0)");
  expect(
    metrics.panelBackgroundColor,
    `${label}PC 事件选择面板必须是开放桌面叠层，不能变成实心弹窗`,
  ).toBe("rgba(0, 0, 0, 0)");
  expect(
    metrics.rollBackgroundColor,
    `${label}PC 投骰区不能加黑底`,
  ).toBe("rgba(0, 0, 0, 0)");
  expect(
    metrics.resultStageBackgroundColor,
    `${label}PC 投骰结果区不能加黑底`,
  ).toBe("rgba(0, 0, 0, 0)");
  expect(
    metrics.backdrop.left,
    `${label}PC 事件选择层必须给左侧探索者 HUD 留出真实工作区，不能整屏覆盖`,
  ).toBeGreaterThanOrEqual(metrics.currentTraits.right - 16);
  expect(
    metrics.backdrop.right,
    `${label}PC 事件选择层必须给右侧状态栏留出真实工作区，不能整屏覆盖`,
  ).toBeLessThanOrEqual(metrics.statusRail.left + 16);
  expect(
    metrics.phaseChip.bottom,
    `${label}PC 阶段 chip 必须保留在事件选择工作区上方`,
  ).toBeLessThanOrEqual(metrics.backdrop.top + 4);
  expect(
    metrics.panel.bottom,
    `${label}PC 事件选择工作区必须避开底部行动栏`,
  ).toBeLessThanOrEqual(metrics.actionRail.top + 4);
  expect(
    metrics.panel.width,
    `${label}PC 事件牌工作区不能被移动端紧凑尺寸压小，必须保留桌面可读宽度`,
  ).toBeGreaterThanOrEqual(1040);
  expect(
    metrics.panel.width,
    `${label}PC 事件牌工作区必须仍避让左右 HUD，不能横向散出桌面主舞台`,
  ).toBeLessThanOrEqual(1120);
  expect(
    Math.abs(metrics.roll.top - metrics.card.top),
    `${label}PC 事件牌和投骰区必须是同一个开放工作区，不能上下散落到地图中央`,
  ).toBeLessThanOrEqual(18);
  expect(
    metrics.roll.height,
    `${label}PC 投骰区不能继续占用大半屏导致结果和按钮散落`,
  ).toBeLessThanOrEqual(metrics.viewport.height * 0.5);
  expect(
    metrics.roll.left,
    `${label}PC 投骰区必须位于事件牌右侧`,
  ).toBeGreaterThanOrEqual(metrics.card.right + 4);
  expect(
    metrics.roll.right,
    `${label}PC 投骰区必须覆盖骰盘和结果本体，不能把结果散到独立远端区域`,
  ).toBeGreaterThanOrEqual(metrics.resultStage.right - 4);
  expect(
    metrics.diceGroup.left,
    `${label}PC 透明骰盘必须仍在事件牌右侧，不能回到地图中心散落`,
  ).toBeGreaterThanOrEqual(metrics.card.right + 2);
  expect(
    metrics.resultStage.left,
    `${label}PC 投骰结果必须收在投骰区内，不能和选择按钮形成两套远端锚点`,
  ).toBeGreaterThanOrEqual(metrics.roll.left - 4);
  expect(
    metrics.resultStage.right,
    `${label}PC 投骰结果必须收在投骰区内，不能伸进选择/确认列`,
  ).toBeLessThanOrEqual(metrics.roll.right + 4);
  if (metrics.confirm) {
    expect(
      metrics.confirm.left,
      `${label}PC 确认/接受按钮必须位于投骰结果右侧的同一决策列，不能压住骰盘或结果`,
    ).toBeGreaterThanOrEqual(metrics.roll.right + 8);
    expect(
      metrics.confirm.right,
      `${label}PC 确认/接受按钮必须留在事件工作区内，不能漂到右侧状态栏`,
    ).toBeLessThanOrEqual(metrics.panel.right + 2);
  }
  expect(
    metrics.resultStage.bottom,
    `${label}PC 投骰结果必须停留在事件工作区内，不能压到底部行动栏附近`,
  ).toBeLessThanOrEqual(metrics.actionRail.top - 60);
  if (metrics.confirm) {
    expect(
      metrics.confirm.bottom,
      `${label}PC 确认/接受按钮必须停留在事件工作区内，不能游离到底部行动栏附近`,
    ).toBeLessThanOrEqual(metrics.actionRail.top - 40);
  }
  expect(
    metrics.card.width,
    `${label}PC 事件牌不能被压成移动端卡宽，必须维持桌面可读牌面`,
  ).toBeGreaterThanOrEqual(230);
  const traitChoices = [...metrics.traitChoices].sort(
    (a, b) => a.left - b.left,
  );
  if (traitChoices.length > 0) {
    expect(
      traitChoices[0].top,
      `${label}PC 属性选择必须留在事件工作区内，不能散到阶段 chip 或地图顶部`,
    ).toBeGreaterThanOrEqual(metrics.panel.top - 4);
    expect(
      traitChoices[0].left,
      `${label}PC 属性选择必须位于投骰区右侧的决策列，不能散到地图中央`,
    ).toBeGreaterThanOrEqual(metrics.roll.right + 8);
    expect(
      traitChoices[0].right,
      `${label}PC 属性选择必须留在事件工作区内，不能漂到右侧状态栏`,
    ).toBeLessThanOrEqual(metrics.panel.right + 2);
    expect(
      traitChoices[0].width,
      `${label}PC 属性按钮不能退回移动端窄按钮`,
    ).toBeGreaterThanOrEqual(92);
    expect(
      traitChoices[0].height,
      `${label}PC 属性按钮不能退回移动端矮按钮`,
    ).toBeGreaterThanOrEqual(56);
  }
  for (const hitTarget of metrics.choiceHitTargets) {
    expect(
      hitTarget.hitTestId,
      `${label}${hitTarget.testId}中心点必须真实命中该控件，不能被透明容器或房间主视区截获：${JSON.stringify(
        hitTarget,
      )}`,
    ).toBe(hitTarget.testId);
  }
  if (traitChoices.length > 1) {
    const firstChoice = traitChoices[0];
    for (let index = 1; index < traitChoices.length; index += 1) {
      const previous = traitChoices[index - 1];
      const current = traitChoices[index];
      expect(
        Math.abs(current.top - firstChoice.top),
        `${label}PC 属性选项必须保持同一工作区内的横排选择，不得散成另一套远端排布`,
      ).toBeLessThanOrEqual(8);
      expect(
        current.left,
        `${label}PC 属性选项应从左到右横向展开`,
      ).toBeGreaterThan(previous.left);
      expect(
        current.left - previous.right,
        `${label}PC 属性选项横向间距过大，说明选择区和结果列没有贴合`,
      ).toBeLessThanOrEqual(32);
    }
  }
}

async function expectEventMapTargetSelectionForeground(
  page: Page,
  label: string,
  targetTestId: string,
  roomTestId: string,
) {
  await expect(
    page.getByTestId("betrayal-event-choice-panel"),
    `${label}进入地图目标选择态后，事件牌/骰盘/结果特写必须退场，不能顶着特写选房间`,
  ).toHaveCount(0);
  await expect(
    page.getByTestId("betrayal-event-choice-backdrop"),
    `${label}目标选择态不能留下透明前景层，只靠 pointer-events 穿透完成点击`,
  ).toHaveCount(0);
  await expect(
    page.getByTestId("betrayal-event-choice-card-front-atlas"),
    `${label}目标选择态不能继续显示事件牌特写遮挡地图目标`,
  ).toHaveCount(0);
  await expect(
    page.getByTestId("betrayal-recent-roll-panel"),
    `${label}目标选择态不能继续显示骰盘/结果特写遮挡地图目标`,
  ).toHaveCount(0);

  const target = page.getByTestId(targetTestId);
  await expect(target, `${label}必须露出真实地图房间候选`).toBeVisible();
  await expect
    .poll(
      async () =>
        page.evaluate(
          ({ targetTestId: targetId, roomTestId: roomId }) => {
            const targetElement = document.querySelector<HTMLElement>(
              `[data-testid="${targetId}"]`,
            );
            if (!targetElement) {
              return "missing-target";
            }
            const rect = targetElement.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) {
              return JSON.stringify({ state: "empty-target", rect });
            }
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const hit = document.elementFromPoint(
              centerX,
              centerY,
            ) as HTMLElement | null;
            const hitTarget = hit?.closest<HTMLElement>(
              `[data-testid="${targetId}"], [data-testid="${roomId}"]`,
            );
            if (hitTarget) {
              return "ok";
            }
            const stack = document
              .elementsFromPoint(centerX, centerY)
              .slice(0, 8)
              .map((element) => {
                const htmlElement = element as HTMLElement;
                const style = getComputedStyle(htmlElement);
                return {
                  tagName: htmlElement.tagName,
                  testId: htmlElement.dataset.testid ?? "",
                  ariaLabel: htmlElement.getAttribute("aria-label") ?? "",
                  pointerEvents: style.pointerEvents,
                  zIndex: style.zIndex,
                };
              });
            return JSON.stringify({
              state: "blocked",
              centerX,
              centerY,
              targetRect: {
                left: rect.left,
                right: rect.right,
                top: rect.top,
                bottom: rect.bottom,
                width: rect.width,
                height: rect.height,
              },
              hitTestId: hit?.dataset.testid ?? "",
              hitTagName: hit?.tagName ?? "",
              stack,
            });
          },
          { targetTestId, roomTestId },
        ),
      {
        message: `${label}目标房间中心点必须真实命中地图房间本体，不能被事件特写/透明前景层挡住`,
        timeout: 5000,
      },
    )
    .toBe("ok");
  await expect
    .poll(
      async () =>
        page.evaluate(
          ({ targetTestId: targetId, roomTestId: roomId }) => {
            const targetElement = document.querySelector<HTMLElement>(
              `[data-testid="${targetId}"]`,
            );
            if (!targetElement) {
              return "missing-target";
            }
            const targetRect = targetElement.getBoundingClientRect();
            const overlapArea = (a: DOMRect, b: DOMRect) => {
              const width = Math.max(
                0,
                Math.min(a.right, b.right) - Math.max(a.left, b.left),
              );
              const height = Math.max(
                0,
                Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top),
              );
              return width * height;
            };
            const blockers = Array.from(
              document.querySelectorAll<HTMLElement>("button"),
            )
              .filter((element) => {
                const testId = element.dataset.testid ?? "";
                if (testId === targetId || testId === roomId) {
                  return false;
                }
                if (element.closest(`[data-testid="${roomId}"]`)) {
                  return false;
                }
                const style = getComputedStyle(element);
                const rect = element.getBoundingClientRect();
                return (
                  style.display !== "none" &&
                  style.visibility !== "hidden" &&
                  rect.width > 0 &&
                  rect.height > 0 &&
                  overlapArea(targetRect, rect) > 1
                );
              })
              .map((element) => {
                const rect = element.getBoundingClientRect();
                return {
                  testId: element.dataset.testid ?? "",
                  text: element.textContent?.trim() ?? "",
                  rect: {
                    left: rect.left,
                    right: rect.right,
                    top: rect.top,
                    bottom: rect.bottom,
                    width: rect.width,
                    height: rect.height,
                  },
                };
              });
            return blockers.length === 0
              ? "ok"
              : JSON.stringify({
                  state: "overlapped-controls",
                  targetRect: {
                    left: targetRect.left,
                    right: targetRect.right,
                    top: targetRect.top,
                    bottom: targetRect.bottom,
                    width: targetRect.width,
                    height: targetRect.height,
                  },
                  blockers,
                });
          },
          { targetTestId, roomTestId },
        ),
      {
        message: `${label}目标房间矩形不能被脚本查阅、行动栏或其它非当前步骤按钮压住`,
        timeout: 5000,
      },
    )
    .toBe("ok");
}

async function expectAtlasFrameImageRendered(
  atlasFrame: Locator,
  label: string,
) {
  await expect
    .poll(
      async () =>
        atlasFrame
          .locator("img")
          .evaluate((img) => {
            const image = img as HTMLImageElement;
            const style = window.getComputedStyle(image);
            return {
              complete: image.complete,
              naturalWidth: image.naturalWidth,
              naturalHeight: image.naturalHeight,
              opacity: Number(style.opacity),
              currentSrc: image.getAttribute("data-debug-current-src"),
              renderedSrc: image.getAttribute("data-debug-rendered-src"),
              objectUrl: image.getAttribute("data-debug-object-url"),
              localFetch: image.getAttribute("data-debug-local-fetch"),
              browserCurrentSrc: image.currentSrc,
              browserSrc: image.src,
            };
          })
          .catch(() => null),
      {
        message: `${label}截图前必须等真实牌图渲染，不能用灰色占位图收口`,
        timeout: 30000,
      },
    )
    .toEqual(
      expect.objectContaining({
        complete: true,
        naturalWidth: expect.any(Number),
        naturalHeight: expect.any(Number),
        opacity: 1,
      }),
    );
  const metrics = await atlasFrame.locator("img").evaluate((img) => {
    const image = img as HTMLImageElement;
    return {
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    };
  });
  expect(metrics.naturalWidth, `${label}图片必须有真实宽度`).toBeGreaterThan(0);
  expect(metrics.naturalHeight, `${label}图片必须有真实高度`).toBeGreaterThan(
    0,
  );
}

async function expectMobileDiscoveryRollLayout(page: Page, label: string) {
  type RectLike = {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
  const discoveryPanel = page.getByTestId("betrayal-discovery-panel");
  const rollPanel = discoveryPanel.getByTestId("betrayal-recent-roll-panel");
  await expect(rollPanel).toHaveAttribute(
    "data-roll-panel-style",
    "open-table-transparent",
  );
  await expect(
    rollPanel.getByTestId("betrayal-recent-roll-result-stage"),
  ).toHaveAttribute("data-result-surface", "open-info-band");
  await expect(
    page.getByTestId("betrayal-mobile-event-status-hud"),
  ).toHaveAttribute("data-mobile-role", "pc-isomorphic-explorer-rail");
  await expect(page.getByTestId("betrayal-status-rail")).toHaveAttribute(
    "data-mobile-role",
    "pc-isomorphic-status-rail",
  );
  await expect(page.getByTestId("betrayal-phase-chip")).toHaveAttribute(
    "data-mobile-role",
    "pc-isomorphic-phase-chip",
  );
  await expect(page.getByTestId("betrayal-mobile-action-rail")).toBeVisible();
  const metrics = await page.evaluate(() => {
    const rectOf = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) {
        throw new Error(`missing ${selector}`);
      }
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
      };
    };
    const rectsOf = (selector: string) =>
      Array.from(document.querySelectorAll<HTMLElement>(selector)).map(
        (element) => {
          const rect = element.getBoundingClientRect();
          return {
            testId: element.dataset.testid ?? "",
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
            centerX: rect.left + rect.width / 2,
            centerY: rect.top + rect.height / 2,
          };
        },
      );
    const optionalRectOf = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) {
        return null;
      }
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
      };
    };
    const discoveryPanel = document.querySelector<HTMLElement>(
      '[data-testid="betrayal-discovery-panel"]',
    );
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      backdropColor: discoveryPanel
        ? getComputedStyle(discoveryPanel).backgroundColor
        : "",
      contentBackgroundColor: getComputedStyle(
        document.querySelector<HTMLElement>(
          '[data-testid="betrayal-discovery-panel-content"]',
        )!,
      ).backgroundColor,
      content: rectOf('[data-testid="betrayal-discovery-panel-content"]'),
      card: rectOf('[data-testid="betrayal-discovery-card-front-atlas"]'),
      roll: rectOf(
        '[data-testid="betrayal-discovery-panel"] [data-testid="betrayal-recent-roll-panel"]',
      ),
      diceGroup: rectOf(
        '[data-testid="betrayal-discovery-panel"] [data-testid="betrayal-house-dice-3d-group"]',
      ),
      resultStage: rectOf(
        '[data-testid="betrayal-discovery-panel"] [data-testid="betrayal-recent-roll-result-stage"]',
      ),
      resultStageBackgroundColor: getComputedStyle(
        document.querySelector<HTMLElement>(
          '[data-testid="betrayal-discovery-panel"] [data-testid="betrayal-recent-roll-result-stage"]',
        )!,
      ).backgroundColor,
      button: rectOf('[data-testid="betrayal-discovery-continue"]'),
      roomShells: rectsOf('[data-testid^="betrayal-room-shell-"]').filter(
        (rect) => rect.width > 40 && rect.height > 40,
      ),
      scenarioButton: optionalRectOf('[data-testid="betrayal-open-scenario"]'),
      mobileStatusHud: rectOf(
        '[data-testid="betrayal-mobile-event-status-hud"]',
      ),
      mobileRightStatusRail: rectOf('[data-testid="betrayal-status-rail"]'),
      mobileActionRail: rectOf('[data-testid="betrayal-mobile-action-rail"]'),
      phaseChip: rectOf('[data-testid="betrayal-phase-chip"]'),
    };
  });
  const overlapArea = (a: RectLike, b: RectLike) => {
    const width = Math.max(
      0,
      Math.min(a.right, b.right) - Math.max(a.left, b.left),
    );
    const height = Math.max(
      0,
      Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top),
    );
    return width * height;
  };

  expect(
    metrics.backdropColor,
    `${label}结算层必须沿用 PC 开放桌面口径，不能用全屏深色遮罩把其它 UI 吃掉`,
  ).toBe("rgba(0, 0, 0, 0)");
  expect(
    metrics.contentBackgroundColor,
    `${label}结算内容容器不能再加移动端专属黑底，必须保持 PC 开放桌面叠层`,
  ).toBe("rgba(0, 0, 0, 0)");
  expect(
    metrics.resultStageBackgroundColor,
    `${label}投骰结果条不能再加移动端专属黑底，必须保持 PC 开放桌面叠层`,
  ).toBe("rgba(0, 0, 0, 0)");
  expect(
    metrics.content.width,
    `${label}结算层不能横向溢出手机屏幕`,
  ).toBeLessThanOrEqual(metrics.viewport.width - 8);
  expect(
    metrics.content.height,
    `${label}结算层必须给牌桌留出呼吸空间`,
  ).toBeLessThanOrEqual(metrics.viewport.height - 72);
  expect(
    metrics.mobileStatusHud.right,
    `${label}左侧 PC 同源探索者面板必须仍可见且给结算层让位`,
  ).toBeLessThanOrEqual(metrics.content.left - 6);
  expect(
    metrics.mobileRightStatusRail.left,
    `${label}右侧 PC 同源牌堆/弃牌状态栏必须仍可见且给结算层让位`,
  ).toBeGreaterThanOrEqual(metrics.content.right + 2);
  expect(
    metrics.content.bottom,
    `${label}结算层必须避开底部行动栏，不能靠隐藏行动栏解决重叠`,
  ).toBeLessThanOrEqual(metrics.mobileActionRail.top + 4);
  const buttonOverlappedRooms = metrics.roomShells.filter(
    (room) => overlapArea(metrics.button, room) > 0,
  );
  expect(
    buttonOverlappedRooms,
    `${label}返回牌桌按钮不得和底部房间卡重叠`,
  ).toEqual([]);
  if (metrics.scenarioButton) {
    expect(
      overlapArea(metrics.button, metrics.scenarioButton),
      `${label}返回牌桌按钮不得和剧本入口重叠`,
    ).toBe(0);
  }
  expect(
    metrics.phaseChip.bottom,
    `${label}阶段 chip 必须保留在结算层上方`,
  ).toBeLessThanOrEqual(metrics.content.top + 4);
  expect(
    metrics.card.width,
    `${label}结算后事件牌仍需可读`,
  ).toBeGreaterThanOrEqual(120);
  expect(
    metrics.roll.left,
    `${label}投骰结果必须在牌旁让位，而不是压住牌面`,
  ).toBeGreaterThan(metrics.card.right);
  expect(
    metrics.resultStage.left,
    `${label}投骰结果文字必须在右侧结果列，不能再压回骰盘或地图中心`,
  ).toBeGreaterThanOrEqual(metrics.diceGroup.right - 8);
  expect(
    metrics.resultStage.top,
    `${label}投骰结果文字必须避开右上角返回按钮`,
  ).toBeGreaterThanOrEqual(metrics.button.bottom - 4);
  expect(
    metrics.resultStage.right,
    `${label}投骰结果列不能伸进右侧牌堆/弃牌状态栏`,
  ).toBeLessThanOrEqual(metrics.content.right + 2);
  expect(
    metrics.roll.height,
    `${label}投骰结果不能变成全屏大块`,
  ).toBeLessThanOrEqual(metrics.viewport.height * 0.78);
  expect(
    metrics.button.width,
    `${label}继续按钮不能小到难点`,
  ).toBeGreaterThanOrEqual(72);
  expect(
    metrics.button.height,
    `${label}继续按钮触控高度不足`,
  ).toBeGreaterThanOrEqual(44);
}

type DirectRollEventFullChainCase = {
  title: string;
  eventName: string;
  screenshotSlug: string;
  traits?: Partial<Record<BetrayalTraitKey, number>>;
  randomQueue: number[];
  expectedRollTexts: string[];
  expectedDiscoveryRollTexts?: string[];
  expectedDetailTexts: string[];
  expectedDiceCount: string;
  expectedSubtotal: string;
  expectedEventRolledDamage?: {
    sourceEventDice: number[];
    sourceEventTotal: number;
    sourceEventLabel: string;
    damageRandomQueue: number[];
    damageKind: "physical" | "mental";
    damageDice: number[];
    pendingOriginalAmount: number;
    pendingAmount: number;
    allocationTraits: BetrayalTraitKey[];
  };
  setupCore?: (core: BetrayalCore) => void;
  assertClosed?: (page: Page) => Promise<void>;
};

async function runDirectRollEventFullChain(
  page: Page,
  eventCase: DirectRollEventFullChainCase,
) {
  test.setTimeout(120000);
  const diagnostics = attachPageDiagnostics(
    page,
    `betrayal-event-choice-${eventCase.screenshotSlug}`,
  );
  const screenshotBase = `${EVIDENCE_DIR}/${eventCase.screenshotSlug}`;
  const eventCard = eventByName(eventCase.eventName);
  const core = createRuntimeCore();
  core.drawOrder = ["event"];
  core.eventOrder = [eventCard];
  core.deckCounts.event = core.eventOrder.length;
  pinGroundNorthToEventRoom(core);
  core.currentExplorer = {
    ...core.currentExplorer,
    traits: {
      ...core.currentExplorer.traits,
      ...eventCase.traits,
    },
    inventory: [],
  };
  core.currentExplorerTraits = { ...core.currentExplorer.traits };
  core.currentExplorerInventory = [];
  eventCase.setupCore?.(core);

  await injectCore(page, core);
  await expect(page.getByTestId("betrayal-board")).toBeVisible({
    timeout: 30000,
  });

  await page.getByTestId("betrayal-action-move").click();
  await page.getByTestId("betrayal-room-hallway").click();
  await expect(
    page.getByTestId("betrayal-room-ground-north"),
  ).toHaveAccessibleName(/未探索.*一层.*尚未翻出/);
  await expect(page.getByTestId("betrayal-action-explore")).toBeEnabled();
  await saveScreenshot(page, `${screenshotBase}-01-探索前.jpg`);

  await page.getByTestId("betrayal-action-explore").click();
  await expect(
    page.getByTestId("betrayal-room-explore-target-ground-north"),
  ).toBeVisible();
  await expect(
    page.getByTestId("betrayal-room-explore-target-ground-south"),
  ).toBeVisible();
  await saveScreenshot(page, `${screenshotBase}-02-选择未知房间.jpg`);

  await setHarnessRandomQueue(page, eventCase.randomQueue);
  await confirmGroundNorthRoomPlacement(page);
  await expect(page.getByTestId("betrayal-event-choice-panel")).toHaveCount(0);
  const discoveryPanel = page.getByTestId("betrayal-discovery-panel");
  await expect(discoveryPanel).toBeVisible({ timeout: 30000 });
  await expect(discoveryPanel).toHaveAttribute(
    "aria-label",
    new RegExp(`事件牌 ${eventCase.eventName}`),
  );
  await expect(
    page.getByTestId("betrayal-discovery-card-front-atlas"),
  ).toBeVisible();
  await expect(page.getByTestId("betrayal-discovery-top-banner")).toHaveCount(
    0,
  );
  const discoveryDetail = page.getByTestId("betrayal-discovery-detail");
  const discoveryRollTexts =
    eventCase.expectedDiscoveryRollTexts ??
    eventCase.expectedRollTexts.filter(
      (expectedText) => !expectedText.startsWith("总点数 "),
    );
  for (const expectedText of discoveryRollTexts) {
    await expect(discoveryDetail).toContainText(expectedText);
  }
  await saveScreenshot(page, `${screenshotBase}-03-事件牌翻出已有检定.jpg`);

  const rollPanel = discoveryPanel.getByTestId("betrayal-recent-roll-panel");
  await expect(rollPanel).toBeVisible();
  for (const expectedText of eventCase.expectedRollTexts) {
    await expect(rollPanel).toContainText(expectedText);
  }
  await expect(
    page.getByTestId("betrayal-house-dice-3d-group"),
  ).toHaveAttribute("data-dice-count", eventCase.expectedDiceCount);
  await expect(
    page.getByTestId("betrayal-house-dice-3d-group"),
  ).toHaveAttribute("data-dice-rule-subtotal", eventCase.expectedSubtotal);
  await expectVisiblePhysicalDiceBox(rollPanel);
  await expectPhysicalDiceStableAfterSettled(rollPanel);
  await expectPhysicalDiceSeparated(rollPanel, {
    minDiceCount: Number(eventCase.expectedDiceCount),
  });
  await saveScreenshot(
    page,
    eventCase.expectedEventRolledDamage
      ? `${screenshotBase}-04-事件骰停稳等待确认.jpg`
      : `${screenshotBase}-04-骰盘停稳直接结算.jpg`,
  );

  for (const expectedText of eventCase.expectedDetailTexts) {
    await expect(discoveryDetail).toContainText(expectedText);
  }
  await expect(page.getByTestId("betrayal-event-choice-panel")).toHaveCount(0);
  if (eventCase.expectedEventRolledDamage) {
    const expectedDamage = eventCase.expectedEventRolledDamage;
    const beforeFinalizeCore = await readCurrentCore(page);
    expect(beforeFinalizeCore.recentRoll).toMatchObject({
      kind: "eventDiceRoll",
      sourceTitle: eventCase.eventName,
      dice: expectedDamage.sourceEventDice,
      latestLabel: expectedDamage.sourceEventLabel,
    });
    expect(beforeFinalizeCore.pendingEventRollResolution).toMatchObject({
      sourceTitle: eventCase.eventName,
    });

    await finalizePendingEventRollForAllPlayers(
      page,
      `${eventCase.eventName}事件骰确认后必须切换到独立伤害骰`,
      expectedDamage.damageRandomQueue,
    );
    const expectedPendingDamageKindLabel =
      expectedDamage.damageKind === "physical" ? "物理伤害" : "精神伤害";
    const expectedDamageEffectText = `实际效果：造成 ${expectedDamage.pendingAmount} 点${expectedPendingDamageKindLabel}`;
    const afterFinalizeCore = await readCurrentCore(page);
    expect(afterFinalizeCore.recentRoll).toMatchObject({
      kind: "eventRolledDamage",
      sourceTitle: eventCase.eventName,
      rollLabel: "重新投掷的伤害骰",
      dice: expectedDamage.damageDice,
      passiveBonus: 0,
      latestLabel: `造成 ${expectedDamage.pendingAmount} 点${expectedPendingDamageKindLabel}`,
      sourceEventRoll: {
        kind: "eventDiceRoll",
        sourceTitle: eventCase.eventName,
        dice: expectedDamage.sourceEventDice,
        total: expectedDamage.sourceEventTotal,
        latestLabel: expectedDamage.sourceEventLabel,
      },
    });
    expect(afterFinalizeCore.recentRoll?.eventEffectSnapshot).toBeUndefined();
    expect(afterFinalizeCore.recentRoll?.eventRolledDamageResults).toEqual([{
      damageKind: expectedDamage.damageKind,
      rolls: expectedDamage.damageDice,
      total: expectedDamage.pendingOriginalAmount,
      appliedAmount: expectedDamage.pendingAmount,
    }]);
    expect(afterFinalizeCore.pendingDamageAllocation).toMatchObject({
      sourceTitle: eventCase.eventName,
      damageKind: expectedDamage.damageKind,
      originalAmount: expectedDamage.pendingOriginalAmount,
      amount: expectedDamage.pendingAmount,
    });

    const damageRollPanel = page.getByTestId("betrayal-recent-roll-panel");
    const damageDiceTotal = expectedDamage.damageDice.reduce(
      (sum, value) => sum + value,
      0,
    );
    await expect(damageRollPanel).toHaveAttribute(
      "data-visible-dice-source",
      "event-rolled-damage",
    );
    await expect(
      damageRollPanel.getByTestId("betrayal-recent-roll-source-title"),
    ).toHaveCount(0);
    await expect(
      damageRollPanel.getByTestId("betrayal-recent-roll-outcome"),
    ).toHaveCount(0);
    await expect(
      damageRollPanel.getByTestId("betrayal-recent-roll-event-description"),
    ).toHaveText(expectedDamage.sourceEventLabel);
    await expect(
      damageRollPanel.getByTestId("betrayal-recent-roll-event-description"),
    ).toHaveAttribute("data-result-role", "event-damage-description");
    await expect(
      damageRollPanel.getByTestId("betrayal-recent-roll-event-effect"),
    ).toHaveText(expectedDamageEffectText);
    await expect(
      damageRollPanel.getByTestId("betrayal-recent-roll-event-effect"),
    ).toHaveAttribute("data-result-role", "event-damage-effect");
    await expect(
      damageRollPanel.getByTestId("betrayal-recent-roll-total"),
    ).toContainText(`伤害骰合计 ${damageDiceTotal}`);
    await expect(
      damageRollPanel.getByTestId("betrayal-recent-roll-total"),
    ).not.toContainText(/骰面合计|加值/);
    await expect(
      damageRollPanel.getByTestId("betrayal-recent-roll-damage-dice"),
    ).toHaveCount(0);
    await expect(
      damageRollPanel.getByTestId("betrayal-recent-roll-effect-damage"),
    ).toHaveCount(0);
    const damageRollVisibleText = await readVisibleNonSrText(damageRollPanel);
    expect(damageRollVisibleText).not.toContain(eventCase.eventName);
    expect(
      damageRollVisibleText.split(expectedDamage.sourceEventLabel).length - 1,
    ).toBe(1);
    expect(damageRollVisibleText.split(expectedDamageEffectText).length - 1).toBe(1);
    expect(damageRollVisibleText).not.toContain(
      `待分配 ${expectedDamage.pendingAmount} 点${expectedPendingDamageKindLabel}`,
    );
    expect(damageRollVisibleText).not.toContain("重新投掷的伤害骰");
    await expect(
      damageRollPanel.getByTestId("betrayal-recent-roll-breakdown"),
    ).toHaveCount(0);
    await expect(
      damageRollPanel.getByTestId("betrayal-reroll-prompt-outside-dice"),
    ).toHaveAttribute("aria-hidden", "true");
    await expect(
      damageRollPanel.getByTestId("betrayal-reroll-prompt-outside-dice"),
    ).toHaveText("");
    await expect(
      damageRollPanel.getByTestId("betrayal-house-dice-3d-group"),
    ).toHaveAttribute("data-dice-count", String(expectedDamage.damageDice.length));
    await expect(
      damageRollPanel.getByTestId("betrayal-house-dice-3d-group"),
    ).toHaveAttribute("data-dice-rule-subtotal", String(damageDiceTotal));
    await expectVisiblePhysicalDiceBox(damageRollPanel);
    await waitForPhysicalDiceSettled(damageRollPanel);
    await expectPhysicalDiceSeparated(damageRollPanel, {
      minDiceCount: expectedDamage.damageDice.length,
      minNormalizedCenterDistance: expectedDamage.damageDice.length > 1 ? undefined : 0,
      minNormalizedCenterSpan: expectedDamage.damageDice.length > 1 ? undefined : 0,
    });
    await expect(page.getByTestId("betrayal-damage-allocation-panel")).toHaveCount(0);
    await saveScreenshot(page, `${screenshotBase}-05-重新投掷伤害骰.jpg`);
    await acknowledgeVisibleEventDamageRoll(
      page,
      `${eventCase.eventName}伤害骰确认后才进入伤害分配`,
    );

    const allocationPanel = page.getByTestId("betrayal-damage-allocation-panel");
    await expect(allocationPanel).toBeVisible();
    await expect(
      allocationPanel.getByTestId("betrayal-damage-allocation-source"),
    ).toContainText(eventCase.eventName);
    await expect(
      allocationPanel.getByTestId("betrayal-damage-allocation-source"),
    ).toHaveAttribute("data-visible-source-owner", "discovery-card");
    await expect(
      allocationPanel.getByTestId("betrayal-damage-allocation-source"),
    ).toHaveClass(/sr-only/);
    await expect(
      allocationPanel.getByTestId("betrayal-damage-allocation-amount"),
    ).toContainText(`${expectedDamage.pendingAmount} 点`);
    await resolveVisibleDamageAllocation(
      page,
      expectedDamage.allocationTraits,
      `${screenshotBase}-06-伤害分配面板.jpg`,
    );
    const afterAllocationCore = await readCurrentCore(page);
    expect(afterAllocationCore.pendingDamageAllocation).toBeNull();
    await saveScreenshot(page, `${screenshotBase}-07-结算结果可见.jpg`);

    await dismissDiscoveryPanel(page);
    await expect(page.getByTestId("betrayal-board")).toBeVisible();
    await expect(page.getByTestId("betrayal-discovery-panel")).toHaveCount(0);
    await expect(page.getByTestId("betrayal-event-choice-panel")).toHaveCount(0);
    await eventCase.assertClosed?.(page);
    await saveScreenshot(page, `${screenshotBase}-08-关闭后.jpg`);

    assertNoFatalFrontendErrors([
      { label: `betrayal-event-choice-${eventCase.screenshotSlug}`, diagnostics },
    ]);
    return;
  }
  await saveScreenshot(page, `${screenshotBase}-05-结算结果可见.jpg`);

  await dismissDiscoveryPanel(page);
  await expect(page.getByTestId("betrayal-board")).toBeVisible();
  await expect(page.getByTestId("betrayal-discovery-panel")).toHaveCount(0);
  await expect(page.getByTestId("betrayal-event-choice-panel")).toHaveCount(0);
  await eventCase.assertClosed?.(page);
  await saveScreenshot(page, `${screenshotBase}-06-关闭后.jpg`);

  assertNoFatalFrontendErrors([
    { label: `betrayal-event-choice-${eventCase.screenshotSlug}`, diagnostics },
  ]);
}

const directRollFullChainCases: DirectRollEventFullChainCase[] = [
  {
    title: "标本剥制伤害和障碍物直接结算",
    eventName: "标本剥制",
    screenshotSlug: "标本剥制-完整链路",
    traits: { might: 2 },
    randomQueue: [0, 0],
    expectedRollTexts: ["力量检定", "总点数 0"],
    expectedDetailTexts: ["受到 1 点物理伤害", "通用伤害 1", "放置障碍物"],
    expectedDiceCount: "2",
    expectedSubtotal: "0",
    assertClosed: async (page) => {
      await expect(
        page.getByTestId("betrayal-room-marker-ground-north-obstacle"),
      ).toBeVisible();
    },
  },
  {
    title: "小丑房间精神伤害直接结算",
    eventName: "小丑房间",
    screenshotSlug: "小丑房间-完整链路",
    traits: { sanity: 4 },
    randomQueue: [0, 0, 0, 0],
    expectedRollTexts: ["神志检定", "总点数 0"],
    expectedDetailTexts: ["受到 2 点精神伤害", "通用伤害 2"],
    expectedDiceCount: "4",
    expectedSubtotal: "0",
  },
  {
    title: "咬一口物理伤害直接结算",
    eventName: "咬一口！",
    screenshotSlug: "咬一口-完整链路",
    traits: { might: 2 },
    randomQueue: [0.5, 0.5],
    expectedRollTexts: ["力量检定", "总点数 2"],
    expectedDetailTexts: ["受到 1 点物理伤害", "通用伤害 1"],
    expectedDiceCount: "2",
    expectedSubtotal: "2",
  },
  {
    title: "电话铃声伤害分支确认后重新投骰",
    eventName: "电话铃声",
    screenshotSlug: "电话铃声-完整链路",
    randomQueue: [0, 0],
    expectedRollTexts: ["总点数 0"],
    expectedDiscoveryRollTexts: ["投 2 颗骰子"],
    expectedDetailTexts: ["受到两颗骰子的物理伤害"],
    expectedDiceCount: "2",
    expectedSubtotal: "0",
    expectedEventRolledDamage: {
      sourceEventDice: [0, 0],
      sourceEventTotal: 0,
      sourceEventLabel: "受到两颗骰子的物理伤害",
      damageRandomQueue: [0.99, 0.99],
      damageKind: "physical",
      damageDice: [2, 2],
      pendingOriginalAmount: 4,
      pendingAmount: 3,
      allocationTraits: ["might", "speed", "speed"],
    },
    assertClosed: async (page) => {
      await expect(
        page.getByTestId("betrayal-room-occupant-ground-north-0"),
      ).toBeVisible();
    },
  },
  {
    title: "嘎吱的木门移动直接结算",
    eventName: "嘎吱的木门",
    screenshotSlug: "嘎吱的木门-完整链路",
    traits: { knowledge: 4 },
    randomQueue: [0.99, 0.99, 0.99, 0.99],
    expectedRollTexts: ["知识检定", "总点数 8"],
    expectedDetailTexts: ["放置到上层起始板块", "放置到上层起始点"],
    expectedDiceCount: "4",
    expectedSubtotal: "8",
    assertClosed: async (page) => {
      await expect(
        page.getByTestId("betrayal-room-occupant-upper-landing-0"),
      ).toBeVisible();
    },
  },
  {
    title: "小机器人抽物品直接结算",
    eventName: "小机器人",
    screenshotSlug: "小机器人-完整链路",
    traits: { knowledge: 4 },
    randomQueue: [0.99, 0.99, 0.99, 0.99],
    expectedRollTexts: ["知识检定", "总点数 8"],
    expectedDetailTexts: ["抽取一张物品卡"],
    expectedDiceCount: "4",
    expectedSubtotal: "8",
    setupCore: (core) => {
      const huntingKnife = BETRAYAL_DISCOVERY_POOLS.possessions.item.find(
        (card) => card.id === "hunting-knife",
      );
      if (!huntingKnife) {
        throw new Error("山屋物品池缺少砍刀");
      }
      core.possessionOrderByKind.item = [huntingKnife];
    },
    assertClosed: async (page) => {
      await expect(
        page.getByTestId("betrayal-inventory-row-item"),
      ).toContainText("砍刀");
      await expect(
        page
          .locator('button[data-testid^="betrayal-inventory-hunting-knife-"]')
          .first(),
      ).toBeVisible();
    },
  },
  {
    title: "最深的壁橱抽物品直接结算",
    eventName: "最深的壁橱",
    screenshotSlug: "最深的壁橱-完整链路",
    traits: { speed: 4 },
    randomQueue: [0.99, 0.99, 0.99, 0.99],
    expectedRollTexts: ["速度检定", "总点数 8"],
    expectedDetailTexts: ["抽取一张物品卡"],
    expectedDiceCount: "4",
    expectedSubtotal: "8",
    setupCore: (core) => {
      const camera = BETRAYAL_DISCOVERY_POOLS.possessions.item.find(
        (card) => card.id === "camera",
      );
      if (!camera) {
        throw new Error("山屋物品池缺少魔法相机");
      }
      core.possessionOrderByKind.item = [camera];
    },
    assertClosed: async (page) => {
      await expect(
        page.getByTestId("betrayal-inventory-row-item"),
      ).toContainText("魔法相机");
    },
  },
  {
    title: "磁带播放器知识奖励直接结算",
    eventName: "磁带播放器",
    screenshotSlug: "磁带播放器-完整链路",
    traits: { sanity: 4 },
    randomQueue: [0.99, 0.99, 0.99, 0.99],
    expectedRollTexts: ["神志检定", "总点数 8"],
    expectedDetailTexts: ["获得 1 点知识", "知识 +1"],
    expectedDiceCount: "4",
    expectedSubtotal: "8",
  },
  {
    title: "在你背后神志奖励直接结算",
    eventName: "在你背后！",
    screenshotSlug: "在你背后-完整链路",
    traits: { speed: 4 },
    randomQueue: [0.99, 0.99, 0.99, 0.99],
    expectedRollTexts: ["速度检定", "总点数 8"],
    expectedDetailTexts: ["获得 1 点神志", "神志 +1"],
    expectedDiceCount: "4",
    expectedSubtotal: "8",
  },
  {
    title: "一种怪异的感觉力量损失直接结算",
    eventName: "一种怪异的感觉",
    screenshotSlug: "一种怪异的感觉-完整链路",
    randomQueue: [0, 0],
    expectedRollTexts: ["投 2 颗骰子", "总点数 0"],
    expectedDetailTexts: ["失去 1 点力量", "力量 -1"],
    expectedDiceCount: "2",
    expectedSubtotal: "0",
  },
  {
    title: "葬礼神志奖励直接结算",
    eventName: "葬礼",
    screenshotSlug: "葬礼-完整链路",
    traits: { sanity: 4 },
    randomQueue: [0.99, 0.99, 0.99, 0.99],
    expectedRollTexts: ["神志检定", "总点数 8"],
    expectedDetailTexts: ["获得 1 点神志", "神志 +1"],
    expectedDiceCount: "4",
    expectedSubtotal: "8",
  },
];

const cases: EventChoiceCase[] = [
  {
    title: "上古旧宅",
    screenshotSlug: "上古旧宅-属性目标通用伤害",
    buildCore: () =>
      createExploredEventChoiceCore("上古旧宅", {
        traits: { speed: 4, might: 4, knowledge: 4, sanity: 4 },
      }),
    actions: [
      "betrayal-event-choice-trait-might",
      "betrayal-room-hallway",
      "betrayal-event-choice-damage-might",
    ],
    expectedTexts: ["力量检定", "放置到门厅", "通用伤害 1（力量）"],
    expectNoRecentRollBeforeChoice: true,
    actionRandomQueue: [0.6, 0.6, 0.6, 0.6],
  },
  {
    title: "肉质苔癣",
    screenshotSlug: "肉质苔癣-跳过可选效果",
    buildCore: () =>
      createPendingChoiceCore("肉质苔癣", eventEffect("肉质苔癣"), {
        id: "e2e-flesh-moss-choice",
        acceptLabel: "大口吸入芳香",
        declineLabel: "不吸入芳香",
      }),
    actions: ["betrayal-event-choice-decline"],
    expectedTexts: ["无事发生"],
  },
  {
    title: "大宅饿了",
    screenshotSlug: "大宅饿了-选择属性跳过作祟",
    buildCore: () =>
      createPendingChoiceCore("大宅饿了", eventEffect("大宅饿了"), {
        id: "e2e-hungry-house-choice",
        acceptLabel: "进行作祟检定",
        declineLabel: "跳过作祟检定",
      }),
    actions: [
      "betrayal-event-choice-trait-knowledge",
      "betrayal-event-choice-decline",
    ],
    expectedTexts: ["知识 +1"],
  },
  {
    title: "蜘蛛！",
    screenshotSlug: "蜘蛛-属性相邻房间",
    buildCore: () =>
      createExploredEventChoiceCore("蜘蛛！", {
        traits: { sanity: 4, speed: 4 },
        rollDice: [2, 2, 2, 2],
      }),
    actions: [
      "betrayal-event-choice-trait-speed",
      "betrayal-room-hallway",
    ],
    expectedTexts: ["速度 +1", "放置到门厅"],
    expectDirectReturnAfterChoice: true,
    expectedRecentRollBeforeChoice: [
      "神志检定",
      "总点数 4",
      "获得 1 点神志或速度",
    ],
  },
  {
    title: "吊死鬼",
    screenshotSlug: "吊死鬼-奖励属性",
    buildCore: () =>
      createPendingChoiceCore("吊死鬼", allPassEffect("吊死鬼"), {
        id: "e2e-hanging-tree-trait-choice",
      }),
    actions: ["betrayal-event-choice-trait-knowledge"],
    expectedTexts: ["知识 +1"],
  },
  {
    title: "一条秘密通道",
    screenshotSlug: "一条秘密通道-第二目标板块",
    buildCore: () =>
      createPendingChoiceCore("一条秘密通道", branchEffect("一条秘密通道", 5), {
        id: "e2e-secret-passage-room-choice",
        roomId: "ground-north",
        traits: { knowledge: 4 },
      }),
    actions: ["betrayal-room-hallway"],
    expectedTexts: [
      "在当前板块放置秘密通道标志物",
      "在门厅放置秘密通道标志物",
      "知识 +1",
    ],
  },
  {
    title: "脑状食品",
    screenshotSlug: "脑状食品-奖励属性",
    buildCore: () =>
      createPendingChoiceCore("脑状食品", branchEffect("脑状食品", 5), {
        id: "e2e-brain-food-reward-choice",
      }),
    actions: ["betrayal-event-choice-trait-speed"],
    expectedTexts: ["速度 +1"],
  },
  {
    title: "脑状食品",
    screenshotSlug: "脑状食品-通用伤害属性",
    buildCore: () =>
      createPendingChoiceCore("脑状食品", branchEffect("脑状食品", 0), {
        id: "e2e-brain-food-damage-choice",
      }),
    actions: [
      "betrayal-event-choice-damage-might",
      "betrayal-event-choice-damage-knowledge",
    ],
    expectedTexts: ["通用伤害 2（力量、知识）"],
  },
  {
    title: "夜幕众星",
    screenshotSlug: "夜幕众星-选择检定属性",
    buildCore: () =>
      createExploredEventChoiceCore("夜幕众星", {
        traits: { knowledge: 4 },
      }),
    actions: ["betrayal-event-choice-trait-knowledge"],
    expectedTexts: ["知识检定", "治疗知识"],
    expectNoRecentRollBeforeChoice: true,
    actionRandomQueue: [0.1, 0.1, 0.1, 0.1],
  },
  {
    title: "一抹鲜红",
    screenshotSlug: "一抹鲜红-跳过作祟伤害",
    buildCore: () =>
      createPendingChoiceCore("一抹鲜红", eventEffect("一抹鲜红"), {
        id: "e2e-crimson-splash-choice",
        acceptLabel: "进行作祟检定",
        declineLabel: "跳过作祟检定",
      }),
    actions: ["betrayal-event-choice-decline"],
    expectedTexts: ["物理伤害"],
  },
  {
    title: "一瓶微尘",
    screenshotSlug: "一瓶微尘-跳过作祟双属性",
    buildCore: () =>
      createPendingChoiceCore("一瓶微尘", eventEffect("一瓶微尘"), {
        id: "e2e-dusty-vial-choice",
        acceptLabel: "进行作祟检定",
        declineLabel: "跳过作祟检定",
      }),
    actions: ["betrayal-event-choice-decline"],
    expectedTexts: ["力量 -1", "神志 +1"],
  },
  {
    title: "说“茄子”！",
    screenshotSlug: "说茄子-跳过作祟抽物品",
    buildCore: () =>
      createPendingChoiceCore("说“茄子”！", eventEffect("说“茄子”！"), {
        id: "e2e-say-cheese-choice",
        acceptLabel: "进行作祟检定",
        declineLabel: "跳过作祟检定",
        possessionItems: [{ id: "camera", name: "魔法相机", kind: "item" }],
      }),
    actions: ["betrayal-event-choice-decline"],
    expectedTexts: ["抽取一张物品卡"],
    expectedVisibleTestIds: ["betrayal-inventory-row-item"],
  },
];

test.describe("山屋惊魂事件牌真实页面选择承接", () => {
  test.beforeEach(async ({ page, context }) => {
    test.setTimeout(120000);
    await initBetrayalContext(context);
    await page.setViewportSize({ width: 1600, height: 900 });
    await warmBetrayalFrontend(context);
    await page.goto("/play/betrayal", { waitUntil: "domcontentloaded" });
    await waitForBetrayalPageReady(page);
  });

  test("结束回合后其他玩家连续触发展示时必须按队列逐个关闭", async ({
    page,
  }) => {
    test.setTimeout(120000);
    const diagnostics = attachPageDiagnostics(
      page,
      "betrayal-discovery-queue-after-end-turn",
    );
    await page.goto("/play/betrayal?seat1=human&seat2=human", {
      waitUntil: "domcontentloaded",
    });
    await waitForBetrayalPageReady(page);
    const screenshotBase = `${EVIDENCE_DIR}/连续展示队列`;
    const firstDiscovery: BetrayalDiscoverySummary = {
      kind: "event",
      title: "外星几何",
      summary: "即时生效",
      detail: "知识检定 5：你看懂了；知识 +1。",
      tone: "accent",
    };
    const secondDiscovery: BetrayalDiscoverySummary = {
      kind: "event",
      title: "标本剥制",
      summary: "即时生效",
      detail: "把这张卡交给当前探险者阅读。",
      tone: "accent",
    };
    const thirdDiscovery: BetrayalDiscoverySummary = {
      kind: "event",
      title: "蜘蛛！",
      summary: "选择结算",
      detail: "神志检定后选择神志或速度奖励。",
      tone: "accent",
    };
    const firstRoll: BetrayalRecentRollState = {
      id: "queued-roll-alien-geometry",
      kind: "eventTraitCheck",
      playerId: "2",
      sourceTitle: "外星几何",
      trait: "knowledge",
      rollLabel: "知识检定",
      dice: [0, 1, 0],
      passiveBonus: 0,
      latestLabel: "知识 +1",
      consumedRabbitFootCardIds: [],
      branchThresholds: [
        {
          min: 1,
          label: "知识 +1",
          effect: {
            mode: "trait",
            trait: "knowledge",
            amount: 1,
            recommendedAction: "endTurn",
          },
        },
      ],
    };
    const secondRoll: BetrayalRecentRollState = {
      id: "queued-roll-taxidermy",
      kind: "eventTraitCheck",
      playerId: "1",
      sourceTitle: "标本剥制",
      trait: "might",
      rollLabel: "力量检定",
      dice: [2, 1, 1],
      passiveBonus: 0,
      latestLabel: "没有受伤",
      consumedRabbitFootCardIds: [],
    };
    const thirdRoll: BetrayalRecentRollState = {
      id: "queued-roll-spider-current",
      kind: "eventTraitCheck",
      playerId: "1",
      sourceTitle: "蜘蛛！",
      trait: "sanity",
      rollLabel: "神志检定",
      dice: [2, 2, 1],
      passiveBonus: 0,
      latestLabel: "获得 1 点神志或速度",
      consumedRabbitFootCardIds: [],
    };

    const afterEndTurnCore = applyBetrayalCommand(
      createRuntimeCore(),
      BETRAYAL_COMMANDS.END_TURN,
      "0",
      {},
    );
    afterEndTurnCore.currentExplorer = {
      ...afterEndTurnCore.currentExplorer,
      inventory: [{ id: "rope", name: "兔脚", kind: "item" }],
    };
    afterEndTurnCore.currentExplorerInventory = [
      ...afterEndTurnCore.currentExplorer.inventory,
    ];
    afterEndTurnCore.turnStartInventoryCardIds = ["rope"];
    afterEndTurnCore.usedCardIdsThisTurn = [];
    afterEndTurnCore.receivedCardIdsThisTurnByPlayerId = {
      ...afterEndTurnCore.receivedCardIdsThisTurnByPlayerId,
      [afterEndTurnCore.currentExplorer.playerId]: [],
    };
    await injectCore(page, afterEndTurnCore);
    await expect(page.getByTestId("betrayal-board")).toBeVisible({
      timeout: 30000,
    });
    await expect
      .poll(
        async () => {
          const core = await readCurrentCore(page);
          return {
            currentPlayer: core.currentPlayer,
            currentExplorerPlayerId: core.currentExplorer.playerId,
          };
        },
        {
          message: "必须先从我方结束回合进入其他玩家行动",
          timeout: 10000,
        },
      )
      .toEqual({
        currentPlayer: "1",
        currentExplorerPlayerId: "1",
      });
    await expect(page.getByTestId("betrayal-inventory-rope")).toBeVisible();
    await page.getByTestId("betrayal-inventory-rope").click();

    let syncedCore = afterEndTurnCore;
    syncedCore = await injectLatestDiscoverySync(
      page,
      syncedCore,
      firstDiscovery,
      "2",
      "外星几何",
      firstRoll,
    );
    syncedCore = await injectLatestDiscoverySync(
      page,
      syncedCore,
      secondDiscovery,
      "1",
      "标本剥制",
      secondRoll,
    );
    syncedCore = await injectLatestDiscoverySync(
      page,
      syncedCore,
      thirdDiscovery,
      "1",
      "蜘蛛",
      thirdRoll,
    );

    await expectQueuedDiscoveryReadable(page, "外星几何", "知识 +1", "第一张");
    await expectQueuedDiscoveryRoll(page, {
      label: "第一张",
      sourceTitle: "外星几何",
      rollLabel: "知识检定",
      totalText: "总点数 1",
      diceValues: "0,1,0",
    });
    await saveScreenshot(page, `${screenshotBase}-01-第一张持续可读.jpg`);

    await page.getByTestId("betrayal-discovery-continue").click();
    await expectQueuedDiscoveryReadable(
      page,
      "标本剥制",
      "当前探险者",
      "第二张",
    );
    await expectQueuedDiscoveryRoll(page, {
      label: "第二张",
      sourceTitle: "标本剥制",
      rollLabel: "力量检定",
      totalText: "总点数 4",
      diceValues: "2,1,1",
    });
    await saveScreenshot(page, `${screenshotBase}-02-第二张持续可读.jpg`);

    await page.getByTestId("betrayal-discovery-continue").click();
    await expectQueuedDiscoveryReadable(page, "蜘蛛！", "神志检定", "第三张");
    await expectQueuedDiscoveryRoll(page, {
      label: "第三张",
      sourceTitle: "蜘蛛！",
      rollLabel: "神志检定",
      totalText: "总点数 5",
      diceValues: "2,2,1",
      rabbitFootTargetsVisible: true,
    });
    await saveScreenshot(page, `${screenshotBase}-03-第三张持续可读.jpg`);

    await page.getByTestId("betrayal-discovery-continue").click();
    await expect(page.getByTestId("betrayal-discovery-panel")).toHaveCount(0);

    await injectCore(page, { ...syncedCore });
    await expect(
      page.getByTestId("betrayal-discovery-panel"),
      "全部关闭后，旧同步状态不能把已经关闭的展示重新弹回",
    ).toHaveCount(0);
    await saveScreenshot(page, `${screenshotBase}-04-全部关闭后回到牌桌.jpg`);

    assertNoFatalFrontendErrors([
      { label: "betrayal-discovery-queue-after-end-turn", diagnostics },
    ]);
  });

  for (const eventCase of cases) {
    test(`${eventCase.title} 能在真实浏览器页面完成事件选择：${eventCase.screenshotSlug}`, async ({
      page,
    }) => {
      test.setTimeout(120000);
      const diagnostics = attachPageDiagnostics(
        page,
        `betrayal-event-choice-${eventCase.screenshotSlug}`,
      );
      const screenshotBase = `${EVIDENCE_DIR}/${eventCase.screenshotSlug}`;

      await injectCore(page, eventCase.buildCore());
      await expect(page.getByTestId("betrayal-board")).toBeVisible({
        timeout: 30000,
      });
      const eventChoicePanel = page.getByTestId("betrayal-event-choice-panel");
      await expect(eventChoicePanel).toHaveAttribute(
        "aria-label",
        eventCase.title,
      );
      await expect(eventChoicePanel).toHaveAttribute(
        "data-layout",
        "main-stage",
      );
      await expect(eventChoicePanel).toHaveAttribute(
        "data-surface",
        "open-table",
      );
      await expect(
        page
          .getByTestId("betrayal-event-choice-card-front-atlas")
          .or(page.getByTestId("betrayal-event-choice-card-front-missing")),
      ).toBeVisible();
      if (eventCase.expectedRecentRollBeforeChoice) {
        const rollPanel = page.getByTestId("betrayal-recent-roll-panel");
        await expect(rollPanel).toBeVisible();
        for (const expectedRollText of eventCase.expectedRecentRollBeforeChoice) {
          await expect(rollPanel).toContainText(expectedRollText);
        }
      }
      if (eventCase.expectNoRecentRollBeforeChoice) {
        await expect(
          page.getByTestId("betrayal-recent-roll-panel"),
        ).toHaveCount(0);
      }
      const panelSurface = await eventChoicePanel.evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          backgroundColor: style.backgroundColor,
          backgroundImage: style.backgroundImage,
          borderTopWidth: style.borderTopWidth,
        };
      });
      expect(panelSurface.backgroundColor).toBe("rgba(0, 0, 0, 0)");
      expect(panelSurface.backgroundImage).toBe("none");
      expect(panelSurface.borderTopWidth).toBe("0px");

      const optionMetrics = await page.evaluate(() => {
        const selectors = [
          'button[data-testid^="betrayal-event-choice-trait-"]',
          'button[data-testid^="betrayal-event-choice-damage-"]',
          'button[data-testid="betrayal-event-choice-confirm"]',
          'button[data-testid="betrayal-event-choice-decline"]',
        ];
        return selectors.flatMap((selector) =>
          Array.from(document.querySelectorAll<HTMLElement>(selector))
            .filter((element) => {
              const rect = element.getBoundingClientRect();
              const style = getComputedStyle(element);
              return (
                rect.width > 0 &&
                rect.height > 0 &&
                style.display !== "none" &&
                style.visibility !== "hidden"
              );
            })
            .map((element) => {
              const rect = element.getBoundingClientRect();
              const style = getComputedStyle(element);
              return {
                testId: element.dataset.testid ?? "",
                width: rect.width,
                height: rect.height,
                fontSize: Number.parseFloat(style.fontSize),
              };
            }),
        );
      });
      const roomTargetCount = await page
        .locator('[data-testid^="betrayal-room-event-choice-target-"]')
        .count();
      expect(
        optionMetrics.length + roomTargetCount,
        `${eventCase.title} 必须至少有一个真实可点击选择载体：面板选项或地图目标本体`,
      ).toBeGreaterThan(0);
      for (const metric of optionMetrics) {
        const isTraitButton =
          metric.testId.startsWith("betrayal-event-choice-trait-") ||
          metric.testId.startsWith("betrayal-event-choice-damage-");
        expect(
          metric.height,
          `${metric.testId} 高度不足，不是可读可点的大选项`,
        ).toBeGreaterThanOrEqual(isTraitButton ? 76 : 72);
        expect(
          metric.width,
          `${metric.testId} 宽度不足，不是可读可点的大选项`,
        ).toBeGreaterThanOrEqual(isTraitButton ? 168 : 160);
        expect(
          metric.fontSize,
          `${metric.testId} 字号不足，不是可读可点的大选项`,
        ).toBeGreaterThanOrEqual(isTraitButton ? 24 : 18);
      }
      await saveScreenshot(page, `${screenshotBase}-选择前.jpg`);

      if (eventCase.actionRandomQueue) {
        await setHarnessRandomQueue(page, eventCase.actionRandomQueue);
      }
      for (const testId of eventCase.actions) {
        await page.getByTestId(testId).click();
      }

      await expect(page.getByTestId("betrayal-event-choice-panel")).toBeHidden({
        timeout: 30000,
      });
      if ("expectDirectReturnAfterChoice" in eventCase && eventCase.expectDirectReturnAfterChoice) {
        await expect(page.getByTestId("betrayal-discovery-panel")).toHaveCount(0);
        await expect(page.getByTestId("betrayal-discovery-continue")).toHaveCount(0);
        await expect(page.getByTestId("betrayal-board")).toBeVisible();
        await saveScreenshot(page, `${screenshotBase}-结算后直接回牌桌.jpg`);
        assertNoFatalFrontendErrors([
          {
            label: `betrayal-event-choice-${eventCase.screenshotSlug}`,
            diagnostics,
          },
        ]);
        return;
      }
      const discoveryPanel = page.getByTestId("betrayal-discovery-panel");
      await expect(discoveryPanel).toBeVisible();
      await expectDiscoveryResolutionLedgerTraceOnly(
        discoveryPanel,
        `${eventCase.title} 结算结果`,
      );
      for (const expectedText of eventCase.expectedTexts) {
        await expect(
          page.locator("body"),
          `${eventCase.title} 结算后页面必须能读到结果文本：${expectedText}`,
        ).toContainText(expectedText);
      }
      if (eventCase.expectedRecentRollAfterChoice) {
        for (const expectedRollText of eventCase.expectedRecentRollAfterChoice) {
          await expect(
            page.locator("body"),
            `${eventCase.title} 结算后页面必须能读到检定结果文本：${expectedRollText}`,
          ).toContainText(expectedRollText);
        }
      }
      for (const testId of eventCase.expectedVisibleTestIds ?? []) {
        await expect(page.getByTestId(testId)).toBeVisible();
      }
      if (eventCase.title === "说“茄子”！") {
        await expect(
          page.getByTestId("betrayal-inventory-row-item"),
        ).toContainText("魔法相机");
      }
      await saveScreenshot(page, `${screenshotBase}-结算后.jpg`);
      assertNoFatalFrontendErrors([
        {
          label: `betrayal-event-choice-${eventCase.screenshotSlug}`,
          diagnostics,
        },
      ]);
    });
  }

  test("上古旧宅真实链路从探索翻牌到选择结算关闭", async ({ page }) => {
    test.setTimeout(120000);
    const diagnostics = attachPageDiagnostics(
      page,
      "betrayal-event-choice-上古旧宅-完整链路",
    );
    const screenshotBase = `${EVIDENCE_DIR}/上古旧宅-完整链路`;
    const oldMansion = eventByName("上古旧宅");
    const core = createRuntimeCore();
    core.drawOrder = ["event"];
    core.eventOrder = [oldMansion];
    core.currentExplorer = {
      ...core.currentExplorer,
      traits: {
        ...core.currentExplorer.traits,
        speed: 4,
        might: 4,
        knowledge: 4,
        sanity: 4,
      },
      inventory: [],
    };
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.currentExplorerInventory = [];

    await injectCore(page, core);
    await expect(page.getByTestId("betrayal-board")).toBeVisible({
      timeout: 30000,
    });

    await page.getByTestId("betrayal-action-move").click();
    await page.getByTestId("betrayal-room-hallway").click();
    await expect(
      page.getByTestId("betrayal-room-ground-north"),
    ).toHaveAccessibleName(/未探索.*一层.*尚未翻出/);
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-north"),
    ).toHaveCount(0);
    await expect(page.getByTestId("betrayal-action-explore")).toBeEnabled();
    await saveScreenshot(page, `${screenshotBase}-01-探索前.jpg`);

    await page.getByTestId("betrayal-action-explore").click();
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-north"),
    ).toBeVisible();
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-south"),
    ).toBeVisible();
    await expect(
      page.getByTestId("betrayal-room-ground-north"),
    ).toHaveAccessibleName(/未探索.*一层.*可探索/);
    await saveScreenshot(page, `${screenshotBase}-02-选择未知房间.jpg`);

    await confirmGroundNorthRoomPlacement(page);
    const eventChoicePanel = page.getByTestId("betrayal-event-choice-panel");
    await expect(eventChoicePanel).toHaveAttribute("aria-label", "上古旧宅");
    await expect(
      page.getByTestId("betrayal-event-choice-card-front-atlas"),
    ).toBeVisible();
    await expect(page.getByTestId("betrayal-recent-roll-panel")).toHaveCount(0);
    await expect(
      page.getByTestId("betrayal-event-choice-trait-speed"),
    ).toBeVisible();
    await expect(
      page.getByTestId("betrayal-event-choice-trait-might"),
    ).toBeVisible();
    await saveScreenshot(page, `${screenshotBase}-03-事件牌翻出选择前.jpg`);

    await page.getByTestId("betrayal-event-choice-trait-might").click();
    await expect(
      page.getByTestId("betrayal-room-event-choice-target-hallway"),
    ).toBeVisible();
    await page.getByTestId("betrayal-room-hallway").click();
    await expect(
      page.getByTestId("betrayal-event-choice-damage-might"),
    ).toBeVisible();
    await saveScreenshot(page, `${screenshotBase}-04-选择目标后待选伤害.jpg`);
    await setHarnessRandomQueue(page, [0.6, 0.6, 0.6, 0.6]);
    await page.getByTestId("betrayal-event-choice-damage-might-increase").click();
    await expect(eventChoicePanel).toBeHidden({ timeout: 30000 });
    const discoveryPanel = page.getByTestId("betrayal-discovery-panel");
    await expect(discoveryPanel).toBeVisible();
    await expect(
      page.locator("body"),
      "上古旧宅结算后页面必须能读到力量检定结果",
    ).toContainText("力量检定");
    await expect(page.locator("body")).toContainText("放置到门厅");
    await expect(page.locator("body")).toContainText("通用伤害 1（力量）");
    await saveScreenshot(page, `${screenshotBase}-05-结算后.jpg`);

    await dismissDiscoveryPanel(page);
    await expect(page.getByTestId("betrayal-board")).toBeVisible();
    await expect(page.getByTestId("betrayal-event-choice-panel")).toHaveCount(
      0,
    );
    await expect(page.getByTestId("betrayal-room-hallway")).toBeVisible();
    await saveScreenshot(page, `${screenshotBase}-06-关闭后.jpg`);

    assertNoFatalFrontendErrors([
      { label: "betrayal-event-choice-上古旧宅-完整链路", diagnostics },
    ]);
  });

  test("夜幕众星真实链路从探索翻牌到选择结算关闭", async ({ page }) => {
    test.setTimeout(120000);
    const diagnostics = attachPageDiagnostics(
      page,
      "betrayal-event-choice-夜幕众星-完整链路",
    );
    const screenshotBase = `${EVIDENCE_DIR}/夜幕众星-完整链路`;
    const nightStars = eventByName("夜幕众星");
    const core = createRuntimeCore();
    core.drawOrder = ["event"];
    core.eventOrder = [nightStars];
    core.currentExplorer = {
      ...core.currentExplorer,
      traits: {
        ...core.currentExplorer.traits,
        knowledge: 4,
      },
      inventory: [],
    };
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.currentExplorerInventory = [];

    await injectCore(page, core);
    await expect(page.getByTestId("betrayal-board")).toBeVisible({
      timeout: 30000,
    });

    await page.getByTestId("betrayal-action-move").click();
    await page.getByTestId("betrayal-room-hallway").click();
    await expect(
      page.getByTestId("betrayal-room-ground-north"),
    ).toHaveAccessibleName(/未探索.*一层.*尚未翻出/);
    await expect(page.getByTestId("betrayal-action-explore")).toBeEnabled();
    await saveScreenshot(page, `${screenshotBase}-01-探索前.jpg`);

    await page.getByTestId("betrayal-action-explore").click();
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-north"),
    ).toBeVisible();
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-south"),
    ).toBeVisible();
    await saveScreenshot(page, `${screenshotBase}-02-选择未知房间.jpg`);

    await confirmGroundNorthRoomPlacement(page);
    const eventChoicePanel = page.getByTestId("betrayal-event-choice-panel");
    await expect(eventChoicePanel).toHaveAttribute("aria-label", "夜幕众星");
    await expect(
      page.getByTestId("betrayal-event-choice-card-front-atlas"),
    ).toBeVisible();
    await expect(page.getByTestId("betrayal-recent-roll-panel")).toHaveCount(0);
    await expect(
      page.getByTestId("betrayal-event-choice-trait-might"),
    ).toBeVisible();
    await expect(
      page.getByTestId("betrayal-event-choice-trait-speed"),
    ).toBeVisible();
    await expect(
      page.getByTestId("betrayal-event-choice-trait-knowledge"),
    ).toBeVisible();
    await expect(
      page.getByTestId("betrayal-event-choice-trait-sanity"),
    ).toBeVisible();
    await saveScreenshot(page, `${screenshotBase}-03-事件牌翻出选择前.jpg`);

    await setHarnessRandomQueue(page, [0.1, 0.1, 0.1, 0.1]);
    await page.getByTestId("betrayal-event-choice-trait-knowledge").click();
    await expect(eventChoicePanel).toBeHidden({ timeout: 30000 });
    const discoveryPanel = page.getByTestId("betrayal-discovery-panel");
    await expect(discoveryPanel).toBeVisible();
    await expect(
      page.locator("body"),
      "夜幕众星结算后页面必须能读到知识检定结果",
    ).toContainText("知识检定");
    await expect(page.locator("body")).toContainText("治疗知识");
    await saveScreenshot(page, `${screenshotBase}-05-结算后.jpg`);

    await dismissDiscoveryPanel(page);
    await expect(page.getByTestId("betrayal-board")).toBeVisible();
    await expect(page.getByTestId("betrayal-event-choice-panel")).toHaveCount(
      0,
    );
    await expect(page.getByTestId("betrayal-room-hallway")).toBeVisible();
    await saveScreenshot(page, `${screenshotBase}-06-关闭后.jpg`);

    assertNoFatalFrontendErrors([
      { label: "betrayal-event-choice-夜幕众星-完整链路", diagnostics },
    ]);
  });

  test("肉质苔癣真实链路从探索翻牌到选择吸入投骰再选属性结算关闭", async ({
    page,
  }) => {
    test.setTimeout(120000);
    const diagnostics = attachPageDiagnostics(
      page,
      "betrayal-event-choice-肉质苔癣-完整链路",
    );
    const screenshotBase = `${EVIDENCE_DIR}/肉质苔癣-完整链路`;
    const fleshMoss = eventByName("肉质苔癣");
    const core = createRuntimeCore();
    core.drawOrder = ["event"];
    core.eventOrder = [fleshMoss];
    core.currentExplorer = {
      ...core.currentExplorer,
      traits: {
        ...core.currentExplorer.traits,
        might: 4,
        speed: 4,
        knowledge: 4,
        sanity: 4,
      },
      inventory: [],
    };
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.currentExplorerInventory = [];

    await injectCore(page, core);
    await expect(page.getByTestId("betrayal-board")).toBeVisible({
      timeout: 30000,
    });

    await page.getByTestId("betrayal-action-move").click();
    await page.getByTestId("betrayal-room-hallway").click();
    await expect(
      page.getByTestId("betrayal-room-ground-north"),
    ).toHaveAccessibleName(/未探索.*一层.*尚未翻出/);
    await expect(page.getByTestId("betrayal-action-explore")).toBeEnabled();
    await saveScreenshot(page, `${screenshotBase}-01-探索前.jpg`);

    await page.getByTestId("betrayal-action-explore").click();
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-north"),
    ).toBeVisible();
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-south"),
    ).toBeVisible();
    await saveScreenshot(page, `${screenshotBase}-02-选择未知房间.jpg`);

    await confirmGroundNorthRoomPlacement(page);
    const eventChoicePanel = page.getByTestId("betrayal-event-choice-panel");
    await expect(eventChoicePanel).toHaveAttribute("aria-label", "肉质苔癣");
    await expect(eventChoicePanel).toHaveAttribute(
      "data-surface",
      "open-table",
    );
    await expect(
      page.getByTestId("betrayal-event-choice-card-front-atlas"),
    ).toBeVisible();
    await expect(page.getByTestId("betrayal-recent-roll-panel")).toHaveCount(0);
    await expect(
      page.getByTestId("betrayal-event-choice-trait-knowledge"),
    ).toHaveCount(0);
    await expect(
      page.getByTestId("betrayal-event-choice-decline"),
    ).toContainText("不吸入芳香");
    await expect(
      page.getByTestId("betrayal-event-choice-confirm"),
    ).toContainText("大口吸入芳香");
    const initialSurface = await eventChoicePanel.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        borderTopWidth: style.borderTopWidth,
      };
    });
    expect(initialSurface.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(initialSurface.backgroundImage).toBe("none");
    expect(initialSurface.borderTopWidth).toBe("0px");
    const initialOptionMetrics = await page.evaluate(() =>
      ["betrayal-event-choice-decline", "betrayal-event-choice-confirm"].map(
        (testId) => {
          const element = document.querySelector<HTMLElement>(
            `[data-testid="${testId}"]`,
          );
          if (!element) {
            throw new Error(`缺少事件选项按钮：${testId}`);
          }
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            testId,
            width: rect.width,
            height: rect.height,
            fontSize: Number.parseFloat(style.fontSize),
          };
        },
      ),
    );
    for (const metric of initialOptionMetrics) {
      expect(metric.width, `${metric.testId} 宽度不足`).toBeGreaterThanOrEqual(
        160,
      );
      expect(metric.height, `${metric.testId} 高度不足`).toBeGreaterThanOrEqual(
        72,
      );
      expect(
        metric.fontSize,
        `${metric.testId} 字号不足`,
      ).toBeGreaterThanOrEqual(18);
    }
    await saveScreenshot(page, `${screenshotBase}-03-事件牌翻出可选择吸入.jpg`);

    await setHarnessRandomQueue(page, [3, 3]);
    await page.getByTestId("betrayal-event-choice-confirm").click();
    await expect(eventChoicePanel).toBeVisible();
    await expect(page.getByTestId("betrayal-event-choice-decline")).toHaveCount(
      0,
    );
    const rollPanel = eventChoicePanel.getByTestId(
      "betrayal-recent-roll-panel",
    );
    await expect(rollPanel).toBeVisible();
    await expect(rollPanel).toContainText("投 2 颗骰子");
    await expect(rollPanel).toContainText("总点数 4");
    await expect(rollPanel).toContainText("获得 1 点任意属性");
    await expect(
      page.getByTestId("betrayal-house-dice-3d-group"),
    ).toHaveAttribute("data-dice-count", "2");
    await expect(
      page.getByTestId("betrayal-house-dice-3d-group"),
    ).toHaveAttribute("data-dice-rule-subtotal", "4");
    await expectVisiblePhysicalDiceBox(rollPanel);
    await waitForPhysicalDiceSettled(rollPanel);
    await expectPhysicalDiceSeparated(rollPanel, { minDiceCount: 2 });
    await expect(
      page.getByTestId("betrayal-event-choice-confirm"),
      "肉质苔癣投骰后只剩属性奖励选择，不应再要求额外确认按钮",
    ).toHaveCount(0);
    for (const trait of ["might", "speed", "knowledge", "sanity"]) {
      await expect(
        page.getByTestId(`betrayal-event-choice-trait-${trait}`),
      ).toBeVisible();
    }
    const traitColors = await page.evaluate(() =>
      ["might", "speed", "knowledge", "sanity"].map((trait) => {
        const element = document.querySelector<HTMLElement>(
          `[data-testid="betrayal-event-choice-trait-${trait}"]`,
        );
        if (!element) {
          throw new Error(`缺少属性选项：${trait}`);
        }
        const style = getComputedStyle(element);
        return {
          trait,
          borderColor: style.borderColor,
          backgroundColor: style.backgroundColor,
          color: style.color,
        };
      }),
    );
    expect(
      new Set(traitColors.map((metric) => metric.borderColor)).size,
    ).toBeGreaterThan(1);
    expect(
      new Set(traitColors.map((metric) => metric.backgroundColor)).size,
    ).toBeGreaterThan(1);
    const scrollCheck = await eventChoicePanel
      .locator(".custom-scrollbar")
      .evaluate((node) => {
        const element = node as HTMLElement;
        element.scrollTop = element.scrollHeight;
        return {
          scrollTop: element.scrollTop,
          scrollHeight: element.scrollHeight,
          clientHeight: element.clientHeight,
        };
      });
    expect(scrollCheck.scrollHeight).toBeGreaterThanOrEqual(
      scrollCheck.clientHeight,
    );
    await expect(
      page.getByTestId("betrayal-event-choice-trait-knowledge"),
    ).toBeVisible();
    const afterRollCore = await readCurrentCore(page);
    expect(afterRollCore.pendingEventChoice?.sourceTitle).toBe("肉质苔癣");
    expect(afterRollCore.pendingEventChoice?.effect.mode).toBe("chosenTrait");
    expect(afterRollCore.currentExplorer.traits.knowledge).toBe(4);
    expect(afterRollCore.recentRoll?.kind).toBe("eventDiceRoll");
    expect(afterRollCore.recentRoll?.dice).toEqual([2, 2]);
    await saveScreenshot(
      page,
      `${screenshotBase}-04-选择吸入后骰盘停稳并出现属性选项.jpg`,
    );

    await page.getByTestId("betrayal-event-choice-trait-knowledge").click();
    await expect(eventChoicePanel).toBeHidden({ timeout: 30000 });
    const discoveryPanel = page.getByTestId("betrayal-discovery-panel");
    await expect(discoveryPanel).toBeVisible();
    const discoveryDetail = page.getByTestId("betrayal-discovery-detail");
    await expect(discoveryDetail).toContainText("知识 +1");
    await expect(
      discoveryPanel.getByTestId("betrayal-recent-roll-panel"),
    ).toContainText("投 2 颗骰子");
    await expect(
      discoveryPanel.getByTestId("betrayal-recent-roll-panel"),
    ).toContainText("总点数 4");
    const afterSettleCore = await readCurrentCore(page);
    expect(afterSettleCore.pendingEventChoice).toBeNull();
    expect(afterSettleCore.currentExplorer.traits.knowledge).toBe(5);
    expect(afterSettleCore.recentRoll?.sourceTitle).toBe("肉质苔癣");
    await saveScreenshot(
      page,
      `${screenshotBase}-05-选择知识奖励后结算结果可见.jpg`,
    );

    await dismissDiscoveryPanel(page);
    await expect(page.getByTestId("betrayal-board")).toBeVisible();
    await expect(page.getByTestId("betrayal-discovery-panel")).toHaveCount(0);
    await expect(page.getByTestId("betrayal-event-choice-panel")).toHaveCount(
      0,
    );
    await expect(
      page.getByTestId("betrayal-room-occupant-ground-north-0"),
    ).toBeVisible();
    await saveScreenshot(page, `${screenshotBase}-06-关闭后回牌桌.jpg`);

    assertNoFatalFrontendErrors([
      { label: "betrayal-event-choice-肉质苔癣-完整链路", diagnostics },
    ]);
  });

  test("一瓶微尘真实链路从探索翻牌到选择作祟检定投骰结算关闭", async ({
    page,
  }) => {
    test.setTimeout(120000);
    const diagnostics = attachPageDiagnostics(
      page,
      "betrayal-event-choice-一瓶微尘-完整链路",
    );
    const screenshotBase = `${EVIDENCE_DIR}/一瓶微尘-完整链路`;
    const dustyVial = eventByName("一瓶微尘");
    const core = createRuntimeCore();
    core.drawOrder = ["event"];
    core.eventOrder = [dustyVial];
    core.deckCounts.event = core.eventOrder.length;
    pinGroundNorthToEventRoom(core);
    core.currentExplorer = {
      ...core.currentExplorer,
      traits: {
        ...core.currentExplorer.traits,
        might: 4,
        sanity: 4,
      },
      inventory: [
        { id: "omen-book", name: "书本", kind: "omen" },
        { id: "dog", name: "狗", kind: "omen" },
      ],
    };
    core.otherExplorers = core.otherExplorers.map((explorer) => ({
      ...explorer,
      roomId: "hallway",
      traits: {
        ...explorer.traits,
        knowledge: 5,
        sanity: 5,
      },
    }));
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.currentExplorerInventory = [...core.currentExplorer.inventory];

    await injectCore(page, core);
    await expect(page.getByTestId("betrayal-board")).toBeVisible({
      timeout: 30000,
    });

    await page.getByTestId("betrayal-action-move").click();
    await page.getByTestId("betrayal-room-hallway").click();
    await expect(
      page.getByTestId("betrayal-room-ground-north"),
    ).toHaveAccessibleName(/未探索.*一层.*尚未翻出/);
    await expect(page.getByTestId("betrayal-action-explore")).toBeEnabled();
    await saveScreenshot(page, `${screenshotBase}-01-探索前.jpg`);

    await page.getByTestId("betrayal-action-explore").click();
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-north"),
    ).toBeVisible();
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-south"),
    ).toBeVisible();
    await saveScreenshot(page, `${screenshotBase}-02-选择未知房间.jpg`);

    await confirmGroundNorthRoomPlacement(page);
    const eventChoicePanel = page.getByTestId("betrayal-event-choice-panel");
    await expect(eventChoicePanel).toHaveAttribute("aria-label", "一瓶微尘");
    await expect(eventChoicePanel).toHaveAttribute(
      "data-surface",
      "open-table",
    );
    await expect(
      page.getByTestId("betrayal-event-choice-card-front-atlas"),
    ).toBeVisible();
    await expect(page.getByTestId("betrayal-recent-roll-panel")).toHaveCount(0);
    await expect(
      page.getByTestId("betrayal-event-choice-confirm"),
    ).toContainText("进行作祟检定");
    await expect(
      page.getByTestId("betrayal-event-choice-decline"),
    ).toContainText("跳过作祟检定");
    const initialSurface = await eventChoicePanel.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        borderTopWidth: style.borderTopWidth,
      };
    });
    expect(initialSurface.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(initialSurface.backgroundImage).toBe("none");
    expect(initialSurface.borderTopWidth).toBe("0px");
    const optionMetrics = await page.evaluate(() =>
      ["betrayal-event-choice-decline", "betrayal-event-choice-confirm"].map(
        (testId) => {
          const element = document.querySelector<HTMLElement>(
            `[data-testid="${testId}"]`,
          );
          if (!element) {
            throw new Error(`缺少事件选项按钮：${testId}`);
          }
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            testId,
            width: rect.width,
            height: rect.height,
            fontSize: Number.parseFloat(style.fontSize),
          };
        },
      ),
    );
    for (const metric of optionMetrics) {
      expect(metric.width, `${metric.testId} 宽度不足`).toBeGreaterThanOrEqual(
        160,
      );
      expect(metric.height, `${metric.testId} 高度不足`).toBeGreaterThanOrEqual(
        72,
      );
      expect(
        metric.fontSize,
        `${metric.testId} 字号不足`,
      ).toBeGreaterThanOrEqual(18);
    }
    const beforeChoiceCore = await readCurrentCore(page);
    expect(beforeChoiceCore.pendingEventChoice?.sourceTitle).toBe("一瓶微尘");
    expect(beforeChoiceCore.currentExplorer.traits.might).toBe(4);
    expect(beforeChoiceCore.currentExplorer.traits.sanity).toBe(4);
    await saveScreenshot(
      page,
      `${screenshotBase}-03-事件牌翻出可选择作祟检定.jpg`,
    );

    await setHarnessRandomQueue(page, [0.1, 0.1, 0.1, 0.1, 0.1, 0.1]);
    await page.getByTestId("betrayal-event-choice-confirm").click();
    await expect(eventChoicePanel).toBeHidden({ timeout: 30000 });
    const discoveryPanel = page.getByTestId("betrayal-discovery-panel");
    await expect(discoveryPanel).toBeVisible();
    await expectDiscoveryResolutionLedgerTraceOnly(
      discoveryPanel,
      "一瓶微尘作祟检定结算",
    );
    await expect(discoveryPanel).toHaveAttribute(
      "aria-label",
      /事件牌 一瓶微尘/,
    );
    await expect(page.getByTestId("betrayal-discovery-top-banner")).toHaveCount(
      0,
    );
    const rollPanel = discoveryPanel.getByTestId("betrayal-recent-roll-panel");
    await expect(rollPanel).toBeVisible();
    const afterRollCore = await readCurrentCore(page);
    const rolledDice = afterRollCore.recentRoll?.dice ?? [];
    const rolledSubtotal = rolledDice.reduce((sum, pip) => sum + pip, 0);
    expect(rolledDice.length).toBeGreaterThan(0);
    expect(rolledDice.every((pip) => pip === 0)).toBe(true);
    await expect(rollPanel).toContainText(`总点数 ${rolledSubtotal}`);
    await expect(
      page.getByTestId("betrayal-discovery-continue"),
      "一瓶微尘结算必须给当前玩家提供确认入口",
    ).toBeEnabled();
    await expect(page.getByTestId("betrayal-discovery-continue")).toContainText(
      "确认",
    );
    const rollBreakdown = rollPanel.getByTestId(
      "betrayal-recent-roll-breakdown",
    );
    await expect(rollBreakdown).toContainText(`骰面合计 ${rolledSubtotal}`);
    await expect(rollBreakdown).toContainText("加值 0");
    await expect(rollBreakdown).toContainText(`总点数 ${rolledSubtotal}`);
    const diceGroup = discoveryPanel.getByTestId(
      "betrayal-house-dice-3d-group",
    );
    await expect(diceGroup).toHaveAttribute(
      "data-dice-count",
      String(rolledDice.length),
    );
    await expect(diceGroup).toHaveAttribute(
      "data-dice-rule-subtotal",
      String(rolledSubtotal),
    );
    const diceTraySurface = rollPanel.getByTestId(
      "betrayal-house-dice-tray-surface",
    );
    await expect(diceTraySurface).toHaveAttribute(
      "data-dice-tray-surface",
      "transparent",
    );
    await expectVisiblePhysicalDiceBox(rollPanel);
    await expectPhysicalDiceStableAfterSettled(rollPanel);
    await expectPhysicalDiceSeparated(rollPanel, {
      minDiceCount: rolledDice.length,
    });
    expect(afterRollCore.pendingEventChoice).toBeNull();
    expect(afterRollCore.phase).toBe("preHaunt");
    expect(afterRollCore.scenarioRuntime.hauntTriggered).toBe(false);
    expect(afterRollCore.currentExplorer.traits.might).toBe(4);
    expect(afterRollCore.currentExplorer.traits.sanity).toBe(5);
    expect(afterRollCore.recentRoll?.sourceTitle).toBe("一瓶微尘");
    expect(afterRollCore.recentRoll?.rollLabel).toBe("作祟检定");
    await saveScreenshot(
      page,
      `${screenshotBase}-04-选择作祟检定后骰盘停稳.jpg`,
    );

    await expect(rollPanel).toContainText("总点数 0");
    await expect(rollPanel).toContainText("神志 +1");
    await expect(rollPanel).not.toContainText("力量 -1");
    await expect(page.getByTestId("betrayal-event-choice-panel")).toHaveCount(
      0,
    );
    await saveScreenshot(page, `${screenshotBase}-05-神志奖励结算结果可见.jpg`);

    await dismissDiscoveryPanel(page);
    await expect(page.getByTestId("betrayal-board")).toBeVisible();
    await expect(page.getByTestId("betrayal-discovery-panel")).toHaveCount(0);
    await expect(page.getByTestId("betrayal-event-choice-panel")).toHaveCount(
      0,
    );
    await expect(
      page.getByTestId("betrayal-room-occupant-ground-north-0"),
    ).toBeVisible();
    await saveScreenshot(page, `${screenshotBase}-06-关闭后回牌桌.jpg`);

    assertNoFatalFrontendErrors([
      { label: "betrayal-event-choice-一瓶微尘-完整链路", diagnostics },
    ]);
  });

  test("事件、物品、预兆结算必须由每个玩家在自己的页面分别确认", async ({
    page,
    context,
  }) => {
    test.setTimeout(120000);
    const diagnostics = attachPageDiagnostics(
      page,
      "betrayal-event-card-resolution-multi-view-confirmation",
    );
    await page.goto(
      "/play/betrayal?players=3&seat0=human&seat1=human&seat2=human&playerID=0",
      { waitUntil: "commit", timeout: 30000 },
    );
    await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => undefined);
    await waitForBetrayalPageReady(page);
    const cases = [
      {
        kind: "event" as const,
        title: "一瓶微尘",
        cardId: undefined,
        summary: "跳过作祟检定",
        detail: "力量 -1；神志 +1",
        stepKind: "event-effect" as const,
        kindLabel: "事件牌",
      },
      {
        kind: "item" as const,
        title: "急救包",
        cardId: "medical-kit",
        summary: "获得物品",
        detail: "已加入持有区：急救包",
        stepKind: "drawn-card" as const,
        kindLabel: "物品牌",
      },
      {
        kind: "omen" as const,
        title: "书本",
        cardId: "omen-book",
        summary: "获得预兆",
        detail: "已加入持有区：书本",
        stepKind: "drawn-card" as const,
        kindLabel: "预兆牌",
      },
    ];

    for (const cardCase of cases) {
      const baseCore = createRuntimeCore();
      const inventoryCard = cardCase.cardId
        ? [{ id: cardCase.cardId, name: cardCase.title, kind: cardCase.kind }]
        : [];
      baseCore.currentExplorer = {
        ...baseCore.currentExplorer,
        roomId: "kitchen",
        traits: { ...baseCore.currentExplorer.traits, might: 4, sanity: 4 },
        inventory: inventoryCard,
      };
      baseCore.currentExplorerTraits = { ...baseCore.currentExplorer.traits };
      baseCore.currentExplorerInventory = inventoryCard;
      baseCore.latestDiscovery = {
        kind: cardCase.kind,
        title: cardCase.title,
        summary: cardCase.summary,
        detail: cardCase.detail,
        tone: "accent",
      };
      baseCore.latestDiscoveryOwnerPlayerId = "0";
      baseCore.pendingCardResolutionQueue = [{
        id: `e2e-${cardCase.kind}-resolution`,
        playerId: "0",
        requiredPlayerIds: ["0", "1", "2"],
        acknowledgedPlayerIds: [],
        deckKind: cardCase.kind,
        cardId: cardCase.cardId,
        cardName: cardCase.title,
        discoveryTitle: cardCase.title,
        stepKind: cardCase.stepKind,
        text: cardCase.detail,
        index: 1,
        total: 1,
      }];

      await injectCore(page, baseCore);
      await expect(page.getByTestId("betrayal-discovery-panel")).toBeVisible();
      const confirm = page.getByTestId("betrayal-discovery-continue");
      await expect(confirm).toBeEnabled();
      await expect(confirm).toContainText("确认");
      await confirm.click();
      let currentCore = await readCurrentCore(page);
      expect(currentCore.pendingCardResolutionQueue?.[0]?.acknowledgedPlayerIds).toEqual(["0"]);

      const playerPages: Page[] = [];
      for (const playerId of ["1", "2"]) {
        const playerPage = await context.newPage();
        playerPages.push(playerPage);
        await playerPage.setViewportSize({ width: 1600, height: 900 });
        await playerPage.goto(
          `/play/betrayal?players=3&seat0=human&seat1=human&seat2=human&playerID=${playerId}`,
          { waitUntil: "commit", timeout: 30000 },
        );
        await playerPage.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => undefined);
        await waitForBetrayalPageReady(playerPage);
        await injectCore(playerPage, currentCore);
        const playerPanel = playerPage.getByTestId("betrayal-discovery-panel");
        await expect(playerPanel).toBeVisible();
        await expect(playerPanel).toHaveAttribute(
          "aria-label",
          new RegExp(`${cardCase.kindLabel} ${cardCase.title}`),
        );
        const playerConfirm = playerPage.getByTestId("betrayal-discovery-continue");
        await expect(playerConfirm).toBeEnabled();
        await expect(playerConfirm).toContainText("确认");
        await playerConfirm.click();
        if (playerId === "2") {
          await expect
            .poll(
              async () => (await readCurrentCore(playerPage)).pendingCardResolutionQueue,
              {
                message: `${cardCase.title}最后一位玩家确认后必须完成展示过场并清空结算队列`,
                timeout: 10000,
              },
            )
            .toEqual([]);
        } else {
          currentCore = await readCurrentCore(playerPage);
          expect(currentCore.pendingCardResolutionQueue?.[0]?.acknowledgedPlayerIds).toContain(playerId);
        }
      }

      await expect(playerPages[1].getByTestId("betrayal-discovery-panel")).toHaveCount(0);
      await expect(playerPages[1].getByTestId("betrayal-board")).toBeVisible();
      await Promise.all(playerPages.map((playerPage) => playerPage.close()));
    }
    assertNoFatalFrontendErrors([
      { label: "betrayal-card-resolution-multi-view-confirmation", diagnostics },
    ]);
  });

  test("当前43张事件牌都能进入同一确认队列并由全员确认收口", async ({
    page,
  }) => {
    test.setTimeout(240000);
    const diagnostics = attachPageDiagnostics(
      page,
      "betrayal-event-card-confirmation-matrix",
    );

    for (const [index, event] of BETRAYAL_DISCOVERY_POOLS.events.entries()) {
      const core = createRuntimeCore();
      core.currentExplorer = {
        ...core.currentExplorer,
        roomId: "kitchen",
        inventory: [],
      };
      core.currentExplorerTraits = { ...core.currentExplorer.traits };
      core.currentExplorerInventory = [];
      core.latestDiscovery = {
        kind: "event",
        title: event.name,
        summary: "事件结算",
        detail: event.effect?.mode
          ? `事件效果：${event.effect.mode}`
          : "事件牌已翻开，等待全员确认",
        tone: "accent",
      };
      core.latestDiscoveryOwnerPlayerId = "0";
      core.pendingCardResolutionQueue = [{
        id: `e2e-event-matrix-${index}`,
        playerId: "0",
        requiredPlayerIds: ["0", "1", "2"],
        acknowledgedPlayerIds: [],
        deckKind: "event",
        cardName: event.name,
        discoveryTitle: event.name,
        stepKind: "event-effect",
        text: core.latestDiscovery.detail,
        index: 1,
        total: 1,
      }];

      await injectCore(page, core);
      const panel = page.getByTestId("betrayal-discovery-panel");
      await expect(panel, `事件牌「${event.name}」必须显示发现面板`).toBeVisible();
      await expect(panel).toHaveAttribute("aria-label", `事件牌 ${event.name}`);
      const confirm = panel.getByTestId("betrayal-discovery-continue");
      await expect(confirm).toBeEnabled();
      await expect(confirm).toContainText("确认");
      await confirm.click();

      const afterOwnerConfirmation = await readCurrentCore(page);
      const pending = afterOwnerConfirmation.pendingCardResolutionQueue?.[0];
      expect(pending?.acknowledgedPlayerIds).toEqual(["0"]);
      for (const playerId of ["1", "2"]) {
        await dispatchHarnessCommand(
          page,
          BETRAYAL_COMMANDS.ACKNOWLEDGE_CARD_RESOLUTION,
          playerId,
          { resolutionId: pending!.id },
        );
      }
      await expect.poll(() => readCurrentCore(page)).toMatchObject({
        pendingCardResolutionQueue: [],
      });
      await expect(panel).toHaveCount(0);
    }

    assertNoFatalFrontendErrors([
      { label: "betrayal-event-card-confirmation-matrix", diagnostics },
    ]);
  });

  test("一瓶微尘跳过作祟后每个玩家都能在自己的页面确认", async ({
    page,
    context,
  }) => {
    test.setTimeout(120000);
    const diagnostics = attachPageDiagnostics(
      page,
      "betrayal-dusty-vial-decline-multi-view-confirmation",
    );
    const screenshotBase = `${EVIDENCE_DIR}/一瓶微尘-跳过作祟-多人确认`;
    await page.goto(
      "/play/betrayal?players=3&seat0=human&seat1=human&seat2=human&playerID=0",
      { waitUntil: "commit", timeout: 30000 },
    );
    await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => undefined);
    await waitForBetrayalPageReady(page);

    const core = createPendingChoiceCore(
      "一瓶微尘",
      eventEffect("一瓶微尘"),
      {
        id: "e2e-dusty-vial-decline-multi-view",
        acceptLabel: "进行作祟检定",
        declineLabel: "跳过作祟检定",
      },
    );
    await injectCore(page, core);
    await page.getByTestId("betrayal-event-choice-decline").click();
    await expect(page.getByTestId("betrayal-event-choice-panel")).toHaveCount(0);
    await expect(page.getByTestId("betrayal-discovery-panel")).toHaveAttribute(
      "aria-label",
      /事件牌 一瓶微尘/,
    );
    await expect(page.getByTestId("betrayal-discovery-continue")).toBeEnabled();
    await saveScreenshot(page, `${screenshotBase}-01-发起者确认前.jpg`);
    await page.getByTestId("betrayal-discovery-continue").click();
    let currentCore = await readCurrentCore(page);
    expect(currentCore.pendingCardResolutionQueue?.[0]?.acknowledgedPlayerIds).toEqual(["0"]);

    const playerPages: Page[] = [];
    for (const playerId of ["1", "2"]) {
      const playerPage = await context.newPage();
      playerPages.push(playerPage);
      await playerPage.setViewportSize({ width: 1600, height: 900 });
      await playerPage.goto(
        `/play/betrayal?players=3&seat0=human&seat1=human&seat2=human&playerID=${playerId}`,
        { waitUntil: "commit", timeout: 30000 },
      );
      await playerPage.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => undefined);
      await waitForBetrayalPageReady(playerPage);
      await injectCore(playerPage, currentCore);
      const panel = playerPage.getByTestId("betrayal-discovery-panel");
      const confirm = playerPage.getByTestId("betrayal-discovery-continue");
      await expect(panel).toHaveAttribute("aria-label", /事件牌 一瓶微尘/);
      await expect(confirm).toBeEnabled();
      await expect(confirm).toContainText("确认");
      if (playerId === "1") {
        await saveScreenshot(playerPage, `${screenshotBase}-02-第二位玩家确认前.jpg`);
      }
      await confirm.click();
      if (playerId === "1") {
        currentCore = await readCurrentCore(playerPage);
        expect(currentCore.pendingCardResolutionQueue?.[0]?.acknowledgedPlayerIds).toEqual(["0", "1"]);
      } else {
        await expect
          .poll(async () => (await readCurrentCore(playerPage)).pendingCardResolutionQueue)
          .toEqual([]);
        await expect(panel).toHaveCount(0);
        await saveScreenshot(playerPage, `${screenshotBase}-03-全员确认后回到牌桌.jpg`);
      }
    }

    assertNoFatalFrontendErrors([
      { label: "betrayal-dusty-vial-decline-multi-view-confirmation", diagnostics },
    ]);
    await Promise.all(playerPages.map((playerPage) => playerPage.close()));
  });

  test("一瓶微尘成功进入灰尘后可寻找解药并完成疾病交换同意", async ({
    page,
  }) => {
    test.setTimeout(180000);
    const diagnostics = attachPageDiagnostics(
      page,
      "betrayal-event-choice-一瓶微尘-灰尘成功链路",
    );
    await page.goto(
      "/play/betrayal?players=3&seat0=human&seat1=human&seat2=human&playerID=0",
      { waitUntil: "commit", timeout: 30000 },
    );
    await page
      .waitForLoadState("domcontentloaded", { timeout: 5000 })
      .catch(() => undefined);
    await waitForBetrayalPageReady(page);
    const screenshotBase = `${DUST_HAUNT_EVIDENCE_DIR}/一瓶微尘-灰尘成功链路`;
    const dustyVial = eventByName("一瓶微尘");
    const core = createRuntimeCore();
    const hallway = core.rooms.find((room) => room.id === "hallway");
    if (!hallway) {
      throw new Error("灰尘 E2E 缺少门厅板块");
    }
    hallway.discoveryReward = "omen";
    core.drawOrder = ["event"];
    core.eventOrder = [dustyVial];
    core.currentExplorer = {
      ...core.currentExplorer,
      traits: {
        ...core.currentExplorer.traits,
        might: 4,
        knowledge: 5,
        sanity: 5,
      },
      inventory: [
        { id: "omen-book", name: "书本", kind: "omen" },
        { id: "dog", name: "狗", kind: "omen" },
        { id: "skull", name: "头骨", kind: "omen" },
      ],
    };
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.currentExplorerInventory = [...core.currentExplorer.inventory];

    await injectCore(page, core);
    await expect(page.getByTestId("betrayal-board")).toBeVisible({
      timeout: 30000,
    });

    await page.getByTestId("betrayal-action-move").click();
    await page.getByTestId("betrayal-room-hallway").click();
    await page.getByTestId("betrayal-action-explore").click();
    await saveScreenshot(page, `${screenshotBase}-01-选择未知房间.jpg`);

    await confirmGroundNorthRoomPlacement(page);
    const eventChoicePanel = page.getByTestId("betrayal-event-choice-panel");
    await expect(eventChoicePanel).toHaveAttribute("aria-label", "一瓶微尘");
    await expect(
      page.getByTestId("betrayal-event-choice-confirm"),
    ).toContainText("进行作祟检定");
    await saveScreenshot(
      page,
      `${screenshotBase}-02-一瓶微尘可选择作祟检定.jpg`,
    );

    await setHarnessRandomQueue(
      page,
      [0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99],
    );
    await page.getByTestId("betrayal-event-choice-confirm").click();
    await expect(eventChoicePanel).toBeHidden({ timeout: 30000 });
    await expect
      .poll(
        async () => {
          const nextCore = await readCurrentCore(page);
          return {
            phase: nextCore.phase,
            hauntCardNumber: nextCore.scenarioRuntime.hauntCardNumber,
            hasDust: Boolean(nextCore.scenarioRuntime.dust),
          };
        },
        {
          message: "一瓶微尘作祟检定成功后必须进入灰尘作祟牌桌",
          timeout: 10000,
        },
      )
      .toMatchObject({
        phase: "haunt",
        hauntCardNumber: 3,
        hasDust: true,
      });
    const currentHauntCore = await readCurrentCore(page);
    expect(currentHauntCore.phase).toBe("haunt");
    await expect(page.getByTestId("betrayal-event-choice-panel")).toHaveCount(
      0,
    );
    expect(
      currentHauntCore.scenarioRuntime.dust?.sicknessTokensByPlayerId["0"],
    ).toHaveLength(3);
    const scenarioReaderDialog = page.getByTestId(
      "betrayal-scenario-reader-dialog",
    );
    await expect(
      scenarioReaderDialog,
      "灰尘作祟触发这个状态变化后必须承接一次剧本阅读，不能只把读法入口留在牌桌上",
    ).toBeVisible();
    await expect(
      scenarioReaderDialog.getByTestId("betrayal-scenario-opening-stage"),
    ).toBeVisible();
    await expect(
      scenarioReaderDialog.getByTestId("betrayal-scenario-opening-cinematic"),
    ).toBeVisible();
    await expect(scenarioReaderDialog).toContainText("剧本3");
    await expect(scenarioReaderDialog).toContainText("灰尘");
    await expect(page.getByTestId("betrayal-recent-roll-panel")).toHaveCount(0);
    await saveScreenshot(
      page,
      `${screenshotBase}-03-作祟成功后灰尘剧本阅读承接.jpg`,
    );
    await page.getByTestId("betrayal-scenario-reader-close").click();
    await expect(scenarioReaderDialog).toHaveCount(0);
    await expect(page.getByTestId("betrayal-open-scenario")).toBeVisible();
    await expect(page.getByTestId("betrayal-haunt-reveal-cue")).toBeVisible();
    await expect(page.getByTestId("betrayal-dust-progress-strip")).toHaveCount(0);
    await expect(page.getByTestId("betrayal-action-use")).toHaveCount(0);
    await expect(page.getByTestId("betrayal-action-trade")).toHaveCount(0);
    await expect(page.getByTestId("betrayal-attack-weapon-selector")).toHaveCount(0);
    await expect(page.getByText("攻击灰尘")).toHaveCount(0);
    await expect(page.getByText("交换疾病")).toHaveCount(0);
    await saveScreenshot(page, `${screenshotBase}-03a-关闭剧本后保留作祟横幅.jpg`);
    await page.getByTestId("betrayal-haunt-reveal-close").click();
    await expect(page.getByTestId("betrayal-haunt-reveal-cue")).toHaveCount(0);
    await expect(page.getByTestId("betrayal-dust-progress-strip")).toBeVisible();
    await saveScreenshot(page, `${screenshotBase}-03b-作祟揭示返回牌桌后显示灰尘进度.jpg`);

    const dustActionCore = await readCurrentCore(page);
    const hallwayAfterHaunt = dustActionCore.rooms.find(
      (room) => room.id === "hallway",
    );
    if (!hallwayAfterHaunt) {
      throw new Error("灰尘 E2E 成功态缺少门厅板块");
    }
    hallwayAfterHaunt.discoveryReward = "omen";
    hallwayAfterHaunt.state = "discovered";
    const dustExplorers = [
      dustActionCore.currentExplorer,
      ...dustActionCore.otherExplorers,
    ];
    const dustActor =
      dustExplorers.find((explorer) => explorer.playerId === "0") ??
      dustActionCore.currentExplorer;
    const currentActorId = dustActor.playerId;
    dustActionCore.currentExplorer = {
      ...dustActor,
      roomId: "hallway",
      traits: {
        ...dustActor.traits,
        knowledge: 5,
        sanity: 5,
      },
    };
    dustActionCore.otherExplorers = dustExplorers
      .filter((explorer) => explorer.playerId !== currentActorId)
      .map((explorer, index) => ({
        ...explorer,
        roomId: index === 0 ? "hallway" : explorer.roomId,
        traits: {
          ...explorer.traits,
          knowledge: Math.max(explorer.traits.knowledge, 5),
          sanity: Math.max(explorer.traits.sanity, 5),
        },
      }));
    dustActionCore.currentPlayer = currentActorId;
    dustActionCore.activeRoomId = "hallway";
    dustActionCore.currentExplorerTraits = {
      ...dustActionCore.currentExplorer.traits,
    };
    dustActionCore.currentExplorerInventory = [
      ...dustActionCore.currentExplorer.inventory,
    ];
    dustActionCore.movesRemaining = 4;
    dustActionCore.usedCardIdsThisTurn = [];
    dustActionCore.recommendedAction = "use";
    dustActionCore.pendingEventChoice = null;
    dustActionCore.latestDiscovery = null;
    dustActionCore.latestDiscoveryOwnerPlayerId = null;
    dustActionCore.recentRoll = null;
    dustActionCore.turnEndedByDiscovery = false;
    dustActionCore.activePlayerId = null;
    if (dustActionCore.scenarioRuntime.dust) {
      dustActionCore.scenarioRuntime.dust = {
        ...dustActionCore.scenarioRuntime.dust,
        researchRoomIds: [],
        exchangedSicknessThisTurnPlayerIds: [],
        pendingSicknessExchange: undefined,
      };
    }
    const exchangeTargetId =
      dustActionCore.otherExplorers.find(
        (explorer) =>
          explorer.playerId !== currentActorId && explorer.roomId === "hallway",
      )?.playerId ?? null;
    expect(exchangeTargetId).toBeTruthy();
    await injectCore(page, dustActionCore);
    await expect(page.getByTestId("betrayal-board")).toBeVisible();
    await expect(page.getByTestId("betrayal-discovery-panel")).toHaveCount(0);
    await expect(
      page.getByTestId(`betrayal-room-occupant-hallway-${currentActorId}`),
    ).toBeVisible();
    await expect(
      page.getByTestId(`betrayal-room-occupant-hallway-${exchangeTargetId}`),
    ).toBeVisible();
    await expect(
      page.getByTestId("betrayal-action-use"),
      "灰尘作祟主动作必须由底部作祟动作入口承接",
    ).toBeVisible();
    await expectHauntGoalCardAndScenarioBook(page, {
      cardNumber: 3,
      title: "灰尘",
      goalTexts: ["剧本3", "研究", "疾病标记", "交换疾病"],
      primaryActionText: "寻找解药",
      actionHintTexts: ["寻找解药"],
      actionScreenshotPath: `${screenshotBase}-04a-灰尘底部作祟主动作可见.jpg`,
      bookTexts: ["剧本3查阅", "灰尘", "研究标记", "交换疾病"],
      nextBookTexts: ["灰尘路线", "灰尘胜利"],
      screenshotPath: `${screenshotBase}-04b-灰尘目标卡打开剧本书.jpg`,
    });
    await saveScreenshot(
      page,
      `${screenshotBase}-04-灰尘牌桌显示寻找解药入口.jpg`,
    );
    await expectMobileHauntScenarioBook(page, {
      headerText: "剧本3查阅",
      firstPageTexts: ["灰尘", "研究标记", "交换疾病"],
      lastPageTexts: ["灰尘路线", "灰尘胜利"],
      firstScreenshotPath: `${screenshotBase}-04c-移动横屏灰尘剧本首页.jpg`,
      lastScreenshotPath: `${screenshotBase}-04d-移动横屏灰尘剧本末页.jpg`,
      closedScreenshotPath: `${screenshotBase}-04e-移动横屏关闭剧本回牌桌.jpg`,
    });
    await page.setViewportSize({ width: 1920, height: 1080 });

    await setHarnessRandomQueue(page, [0.99, 0.99, 0.99, 0.99, 0.99]);
    await page.getByTestId("betrayal-action-use").click();
    await expect(
      page.getByTestId("betrayal-room-latest-feedback"),
    ).toContainText("寻找解药");
    await expect(
      page.getByTestId("betrayal-room-latest-feedback"),
    ).toContainText("研究标记");
    await expect
      .poll(
        async () => {
          const nextCore = await readCurrentCore(page);
          return {
            researchRoomIds:
              nextCore.scenarioRuntime.dust?.researchRoomIds ?? [],
            recentRollSource: nextCore.recentRoll?.sourceTitle ?? null,
          };
        },
        {
          message: "灰尘寻找解药成功后必须在门厅放置研究标记",
          timeout: 10000,
        },
      )
      .toMatchObject({
        researchRoomIds: expect.arrayContaining(["hallway"]),
        recentRollSource: "寻找解药",
      });
    await saveScreenshot(
      page,
      `${screenshotBase}-05-寻找解药放置ResearchToken.jpg`,
    );

    await page.getByTestId("betrayal-roll-continue").click();
    await expect(page.getByTestId("betrayal-recent-roll-panel")).toHaveCount(0);
    await expect(page.getByTestId("betrayal-board")).toBeVisible();
    await expect(page.getByTestId("betrayal-action-trade")).toContainText(
      "交换疾病",
    );
    await expect(page.getByTestId("betrayal-action-use")).toContainText(
      "治愈灰尘",
    );
    await page.getByTestId("betrayal-action-trade").click();
    await expect(page.getByTestId("betrayal-action-use")).toContainText(
      "点丽贝卡·艾伦博士交换疾病",
    );
    await expect(page.getByTestId("betrayal-action-use")).toBeDisabled();
    await expect(page.getByTestId("betrayal-action-use")).toHaveAttribute(
      "data-haunt-targeting-status",
      "true",
    );
    await expect(
      page.locator('[data-testid="betrayal-haunt-target-cancel"]:visible'),
    ).toBeVisible();
    await expect(page.getByTestId("betrayal-action-cue")).toContainText(
      "点丽贝卡·艾伦博士交换疾病",
    );
    await expect(page.getByTestId("betrayal-room-hallway")).toHaveAttribute(
      "data-haunt-target-room",
      "true",
    );
    await expect(page.getByTestId("betrayal-status-rail")).toBeVisible();
    const targetToken = page.getByTestId(
      `betrayal-room-occupant-hallway-${exchangeTargetId}`,
    );
    await expect(targetToken).toHaveAttribute("data-direct-target", "true");
    await expect(targetToken).toHaveAttribute(
      "data-haunt-target-hitbox",
      "true",
    );
    const sicknessTargetBox = await targetToken.boundingBox();
    if (!sicknessTargetBox) {
      throw new Error("交换疾病目标必须有可量到的点击热区");
    }
    expect(sicknessTargetBox.width).toBeGreaterThanOrEqual(44);
    expect(sicknessTargetBox.height).toBeGreaterThanOrEqual(44);
    const sicknessTargetCue = page.getByTestId(
      `betrayal-room-occupant-target-cue-hallway-${exchangeTargetId}`,
    );
    await expect(
      sicknessTargetCue,
      "交换疾病目标态必须在目标旁显示动作后果提示",
    ).toContainText("点丽贝卡·艾伦博士交换疾病");
    const sicknessTargetCueBox = await sicknessTargetCue.boundingBox();
    if (!sicknessTargetCueBox) {
      throw new Error("交换疾病目标旁提示必须有可量到的布局尺寸");
    }
    expect(
      sicknessTargetCueBox.y + sicknessTargetCueBox.height,
      "交换疾病目标旁提示不得覆盖队友 token 命中区",
    ).toBeLessThanOrEqual(sicknessTargetBox.y + 2);
    await expect(page.getByTestId("betrayal-action-cue")).toContainText(
      "丽贝卡·艾伦博士",
    );
    await saveScreenshot(page, `${screenshotBase}-06a-交换疾病对象旁提示.jpg`);
    await targetToken.click();
    await expect
      .poll(
        async () => {
          const nextCore = await readCurrentCore(page);
          return {
            activePlayerId: nextCore.activePlayerId,
            pendingTarget:
              nextCore.scenarioRuntime.dust?.pendingSicknessExchange
                ?.targetPlayerId ?? null,
            pendingRequester:
              nextCore.scenarioRuntime.dust?.pendingSicknessExchange
                ?.requesterPlayerId ?? null,
          };
        },
        {
          message: "点击同房探索者后必须生成等待对方同意的疾病交换请求",
          timeout: 10000,
        },
      )
      .toMatchObject({
        activePlayerId: exchangeTargetId,
        pendingTarget: exchangeTargetId,
        pendingRequester: currentActorId,
      });
    await expect(
      page.getByTestId("betrayal-room-latest-feedback"),
    ).toContainText("请求交换疾病标记");
    await expect(
      page.getByTestId("betrayal-recent-roll-panel"),
      "交换请求成立后，发起方不得重新看到已经关闭的寻找解药投骰结果",
    ).toHaveCount(0);
    await saveScreenshot(page, `${screenshotBase}-06-疾病交换请求等待同意.jpg`);

    const pendingExchangeCore = await readCurrentCore(page);
    const targetPage = await page.context().newPage();
    const targetDiagnostics = attachPageDiagnostics(targetPage);
    await targetPage.setViewportSize({ width: 1600, height: 900 });
    await targetPage.goto(
      `/play/betrayal?players=3&seat0=human&seat1=human&seat2=human&playerID=${exchangeTargetId}`,
      { waitUntil: "commit", timeout: 30000 },
    );
    await targetPage
      .waitForLoadState("domcontentloaded", { timeout: 5000 })
      .catch(() => undefined);
    await waitForBetrayalPageReady(targetPage);
    await injectCore(targetPage, pendingExchangeCore);
    await expect(targetPage.getByTestId("betrayal-board")).toBeVisible({
      timeout: 30000,
    });
    await expect(
      targetPage.getByTestId("betrayal-recent-roll-panel"),
      "交换请求接收方不得先处理请求者遗留的寻找解药投骰结果",
    ).toHaveCount(0);
    await expect(
      targetPage.getByTestId("betrayal-sickness-exchange-banner"),
    ).toHaveAttribute("data-sickness-exchange-state", "incoming");
    await saveScreenshot(
      targetPage,
      `${screenshotBase}-07-疾病交换目标视角等待同意.jpg`,
    );

    await targetPage.getByTestId("betrayal-sickness-exchange-accept").click();
    await expect
      .poll(
        async () => {
          const nextCore = await readCurrentCore(targetPage);
          return {
            activePlayerId: nextCore.activePlayerId,
            pendingExchange:
              nextCore.scenarioRuntime.dust?.pendingSicknessExchange ?? null,
            usedCardIdsThisTurn: nextCore.usedCardIdsThisTurn,
            latestLog: nextCore.activityLog[0]?.text ?? "",
          };
        },
        {
          message: "接收方同意后疾病交换必须结算并清空等待态",
          timeout: 10000,
        },
      )
      .toMatchObject({
        activePlayerId: null,
        pendingExchange: null,
        usedCardIdsThisTurn: expect.arrayContaining(["sickness-exchange"]),
        latestLog: expect.stringContaining("同意了"),
      });
    await expect(
      targetPage.getByTestId("betrayal-sickness-exchange-banner"),
    ).toHaveCount(0);
    await expect(
      targetPage.getByTestId("betrayal-room-latest-feedback"),
    ).toContainText("同意了");
    await saveScreenshot(
      targetPage,
      `${screenshotBase}-08-疾病交换同意后回到牌桌.jpg`,
    );

    assertNoFatalFrontendErrors([
      {
        label: "betrayal-event-choice-一瓶微尘-灰尘成功链路",
        diagnostics,
      },
      {
        label: "betrayal-event-choice-一瓶微尘-灰尘目标视角",
        diagnostics: targetDiagnostics,
      },
    ]);
    await targetPage.close();
  });

  test("大宅饿了真实链路从探索翻牌到跳过作祟选择属性结算关闭", async ({
    page,
  }) => {
    test.setTimeout(120000);
    const diagnostics = attachPageDiagnostics(
      page,
      "betrayal-event-choice-大宅饿了-完整链路",
    );
    const screenshotBase = `${EVIDENCE_DIR}/大宅饿了-完整链路`;
    const helpingHandsEvent = eventByName("大宅饿了");
    const core = createRuntimeCore();
    core.drawOrder = ["event"];
    core.eventOrder = [helpingHandsEvent];
    core.currentExplorer = {
      ...core.currentExplorer,
      traits: {
        ...core.currentExplorer.traits,
        might: 4,
        speed: 4,
        knowledge: 4,
        sanity: 4,
      },
      inventory: [
        { id: "omen-book", name: "书本", kind: "omen" },
        { id: "dog", name: "狗", kind: "omen" },
      ],
    };
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.currentExplorerInventory = [...core.currentExplorer.inventory];

    await injectCore(page, core);
    await expect(page.getByTestId("betrayal-board")).toBeVisible({
      timeout: 30000,
    });

    await page.getByTestId("betrayal-action-move").click();
    await page.getByTestId("betrayal-room-hallway").click();
    await expect(
      page.getByTestId("betrayal-room-ground-north"),
    ).toHaveAccessibleName(/未探索.*一层.*尚未翻出/);
    await expect(page.getByTestId("betrayal-action-explore")).toBeEnabled();
    await saveScreenshot(page, `${screenshotBase}-01-探索前.jpg`);

    await page.getByTestId("betrayal-action-explore").click();
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-north"),
    ).toBeVisible();
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-south"),
    ).toBeVisible();
    await saveScreenshot(page, `${screenshotBase}-02-选择未知房间.jpg`);

    await confirmGroundNorthRoomPlacement(page);
    const eventChoicePanel = page.getByTestId("betrayal-event-choice-panel");
    await expect(eventChoicePanel).toHaveAttribute("aria-label", "大宅饿了");
    await expect(eventChoicePanel).toHaveAttribute(
      "data-surface",
      "open-table",
    );
    await expect(
      page.getByTestId("betrayal-event-choice-card-front-atlas"),
    ).toBeVisible();
    await expect(page.getByTestId("betrayal-recent-roll-panel")).toHaveCount(0);
    await expect(
      page.getByTestId("betrayal-event-choice-confirm"),
    ).toContainText("进行作祟检定");
    await expect(
      page.getByTestId("betrayal-event-choice-decline"),
    ).toContainText("跳过作祟检定");
    await expect(
      page.getByTestId("betrayal-event-choice-decline"),
    ).toBeDisabled();
    for (const trait of ["might", "speed", "knowledge", "sanity"]) {
      await expect(
        page.getByTestId(`betrayal-event-choice-trait-${trait}`),
      ).toBeVisible();
    }
    const initialSurface = await eventChoicePanel.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        borderTopWidth: style.borderTopWidth,
      };
    });
    expect(initialSurface.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(initialSurface.backgroundImage).toBe("none");
    expect(initialSurface.borderTopWidth).toBe("0px");
    const optionMetrics = await page.evaluate(() =>
      [
        "betrayal-event-choice-trait-might",
        "betrayal-event-choice-trait-speed",
        "betrayal-event-choice-trait-knowledge",
        "betrayal-event-choice-trait-sanity",
        "betrayal-event-choice-decline",
        "betrayal-event-choice-confirm",
      ].map((testId) => {
        const element = document.querySelector<HTMLElement>(
          `[data-testid="${testId}"]`,
        );
        if (!element) {
          throw new Error(`缺少事件选项控件：${testId}`);
        }
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          testId,
          width: rect.width,
          height: rect.height,
          fontSize: Number.parseFloat(style.fontSize),
        };
      }),
    );
    for (const metric of optionMetrics) {
      expect(metric.width, `${metric.testId} 宽度不足`).toBeGreaterThanOrEqual(
        120,
      );
      expect(metric.height, `${metric.testId} 高度不足`).toBeGreaterThanOrEqual(
        72,
      );
      expect(
        metric.fontSize,
        `${metric.testId} 字号不足`,
      ).toBeGreaterThanOrEqual(18);
    }
    const traitColors = await page.evaluate(() =>
      ["might", "speed", "knowledge", "sanity"].map((trait) => {
        const element = document.querySelector<HTMLElement>(
          `[data-testid="betrayal-event-choice-trait-${trait}"]`,
        );
        if (!element) {
          throw new Error(`缺少属性选项：${trait}`);
        }
        const style = getComputedStyle(element);
        return {
          trait,
          borderColor: style.borderColor,
          backgroundColor: style.backgroundColor,
        };
      }),
    );
    expect(
      new Set(traitColors.map((metric) => metric.borderColor)).size,
    ).toBeGreaterThan(1);
    expect(
      new Set(traitColors.map((metric) => metric.backgroundColor)).size,
    ).toBeGreaterThan(1);
    const beforeChoiceCore = await readCurrentCore(page);
    expect(beforeChoiceCore.pendingEventChoice?.sourceTitle).toBe("大宅饿了");
    expect(beforeChoiceCore.pendingEventChoice?.effect.mode).toBe(
      "optionalHauntRoll",
    );
    expect(beforeChoiceCore.currentExplorer.traits.knowledge).toBe(4);
    await saveScreenshot(
      page,
      `${screenshotBase}-03-事件牌翻出可选择作祟检定.jpg`,
    );

    await page.getByTestId("betrayal-event-choice-trait-knowledge").click();
    await expect(
      page.getByTestId("betrayal-event-choice-decline"),
    ).not.toBeDisabled();
    const scrollCheck = await eventChoicePanel
      .locator(".custom-scrollbar")
      .evaluate((node) => {
        const element = node as HTMLElement;
        element.scrollTop = element.scrollHeight;
        return {
          scrollTop: element.scrollTop,
          scrollHeight: element.scrollHeight,
          clientHeight: element.clientHeight,
        };
      });
    expect(scrollCheck.scrollHeight).toBeGreaterThanOrEqual(
      scrollCheck.clientHeight,
    );
    await expect(
      page.getByTestId("betrayal-event-choice-trait-knowledge"),
    ).toBeVisible();
    await expect(page.getByTestId("betrayal-recent-roll-panel")).toHaveCount(0);
    await saveScreenshot(
      page,
      `${screenshotBase}-04-选择知识奖励后准备跳过作祟.jpg`,
    );

    await page.getByTestId("betrayal-event-choice-decline").click();
    await expect(eventChoicePanel).toBeHidden({ timeout: 30000 });
    const discoveryPanel = page.getByTestId("betrayal-discovery-panel");
    await expect(discoveryPanel).toBeVisible();
    await expect(discoveryPanel).toHaveAttribute(
      "aria-label",
      /事件牌 大宅饿了/,
    );
    await expect(page.getByTestId("betrayal-recent-roll-panel")).toHaveCount(0);
    const discoveryDetail = page.getByTestId("betrayal-discovery-detail");
    await expect(discoveryDetail).toContainText("跳过作祟检定");
    await expect(discoveryDetail).toContainText("知识 +1");
    await expect(discoveryDetail).not.toContainText("力量 +1");
    const afterSettleCore = await readCurrentCore(page);
    expect(afterSettleCore.pendingEventChoice).toBeNull();
    expect(afterSettleCore.phase).toBe("preHaunt");
    expect(afterSettleCore.scenarioRuntime.hauntTriggered).toBe(false);
    expect(afterSettleCore.currentExplorer.traits.might).toBe(4);
    expect(afterSettleCore.currentExplorer.traits.knowledge).toBe(5);
    expect(afterSettleCore.recentRoll).toBeNull();
    await saveScreenshot(page, `${screenshotBase}-05-知识奖励结算结果可见.jpg`);

    await dismissDiscoveryPanel(page);
    await expect(page.getByTestId("betrayal-board")).toBeVisible();
    await expect(page.getByTestId("betrayal-discovery-panel")).toHaveCount(0);
    await expect(page.getByTestId("betrayal-event-choice-panel")).toHaveCount(
      0,
    );
    await expect(
      page.getByTestId("betrayal-room-occupant-ground-north-0"),
    ).toBeVisible();
    await saveScreenshot(page, `${screenshotBase}-06-关闭后回牌桌.jpg`);

    assertNoFatalFrontendErrors([
      { label: "betrayal-event-choice-大宅饿了-完整链路", diagnostics },
    ]);
  });
  test("说茄子真实链路从探索翻牌到作祟失败抽物品关闭", async ({ page }) => {
    test.setTimeout(120000);
    const diagnostics = attachPageDiagnostics(
      page,
      "betrayal-event-choice-说茄子-完整链路",
    );
    const screenshotBase = `${EVIDENCE_DIR}/说茄子-完整链路`;
    const sayCheese = eventByName("说“茄子”！");
    const camera = BETRAYAL_DISCOVERY_POOLS.possessions.item.find(
      (card) => card.id === "camera",
    );
    if (!camera) {
      throw new Error("山屋物品池缺少魔法相机");
    }
    const core = createRuntimeCore();
    core.drawOrder = ["event"];
    core.eventOrder = [sayCheese];
    core.possessionOrderByKind.item = [camera];
    core.currentExplorer = {
      ...core.currentExplorer,
      inventory: [
        { id: "omen-book", name: "书本", kind: "omen" },
        { id: "dog", name: "狗", kind: "omen" },
      ],
    };
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.currentExplorerInventory = [...core.currentExplorer.inventory];

    await injectCore(page, core);
    await expect(page.getByTestId("betrayal-board")).toBeVisible({
      timeout: 30000,
    });

    await page.getByTestId("betrayal-action-move").click();
    await page.getByTestId("betrayal-room-hallway").click();
    await expect(
      page.getByTestId("betrayal-room-ground-north"),
    ).toHaveAccessibleName(/未探索.*一层.*尚未翻出/);
    await expect(page.getByTestId("betrayal-action-explore")).toBeEnabled();
    await saveScreenshot(page, `${screenshotBase}-01-探索前.jpg`);

    await page.getByTestId("betrayal-action-explore").click();
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-north"),
    ).toBeVisible();
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-south"),
    ).toBeVisible();
    await saveScreenshot(page, `${screenshotBase}-02-选择未知房间.jpg`);

    await confirmGroundNorthRoomPlacement(page);
    const eventChoicePanel = page.getByTestId("betrayal-event-choice-panel");
    await expect(eventChoicePanel).toHaveAttribute("aria-label", "说“茄子”！");
    await expect(eventChoicePanel).toHaveAttribute(
      "data-surface",
      "open-table",
    );
    await expect(
      page.getByTestId("betrayal-event-choice-card-front-atlas"),
    ).toBeVisible();
    await expect(page.getByTestId("betrayal-recent-roll-panel")).toHaveCount(0);
    await expect(
      page.getByTestId("betrayal-event-choice-confirm"),
    ).toContainText("进行作祟检定");
    await expect(
      page.getByTestId("betrayal-event-choice-decline"),
    ).toContainText("跳过作祟检定");
    const beforeChoiceCore = await readCurrentCore(page);
    expect(beforeChoiceCore.pendingEventChoice?.sourceTitle).toBe("说“茄子”！");
    expect(
      beforeChoiceCore.currentExplorer.inventory.some(
        (card) => card.name === "魔法相机",
      ),
    ).toBe(false);
    await saveScreenshot(
      page,
      `${screenshotBase}-03-事件牌翻出可选择作祟检定.jpg`,
    );

    await setHarnessRandomQueue(page, [0.1, 0.1]);
    await page.getByTestId("betrayal-event-choice-confirm").click();
    await expect(eventChoicePanel).toBeHidden({ timeout: 30000 });
    const discoveryPanel = page.getByTestId("betrayal-discovery-panel");
    await expect(discoveryPanel).toBeVisible();
    await expect(discoveryPanel).toHaveAttribute(
      "aria-label",
      /事件牌 说“茄子”！/,
    );
    const rollPanel = discoveryPanel.getByTestId("betrayal-recent-roll-panel");
    await expect(rollPanel).toBeVisible();
    await expect(rollPanel).toContainText("作祟检定");
    const afterRollCore = await readCurrentCore(page);
    const rollDice = afterRollCore.recentRoll?.dice ?? [];
    const rollTotal =
      rollDice.reduce((sum, pip) => sum + pip, 0) +
      (afterRollCore.recentRoll?.passiveBonus ?? 0);
    const rollDiceCount = rollDice.length;
    expect(rollDiceCount).toBeGreaterThan(0);
    expect(rollTotal).toBeGreaterThanOrEqual(0);
    expect(rollTotal).toBeLessThan(
      afterRollCore.scenarioRuntime.hauntRollThreshold,
    );
    await expect(rollPanel).toContainText(`总点数 ${rollTotal}`);
    const diceGroup = discoveryPanel.getByTestId(
      "betrayal-house-dice-3d-group",
    );
    await expect(diceGroup).toHaveAttribute(
      "data-dice-count",
      String(rollDiceCount),
    );
    await expect(diceGroup).toHaveAttribute(
      "data-dice-rule-subtotal",
      String(rollTotal),
    );
    await expectVisiblePhysicalDiceBox(rollPanel);
    await waitForPhysicalDiceSettled(rollPanel);
    await expectPhysicalDiceSeparated(rollPanel, {
      minDiceCount: rollDiceCount,
    });
    await saveScreenshot(
      page,
      `${screenshotBase}-04-选择作祟检定后骰盘停稳.jpg`,
    );

    const discoveryDetail = page.getByTestId("betrayal-discovery-detail");
    await expect(discoveryDetail).toContainText(`总点数 ${rollTotal}`);
    await expect(discoveryDetail).toContainText("抽取一张物品卡");
    await expect(page.getByTestId("betrayal-inventory-row-item")).toContainText(
      "魔法相机",
    );
    const afterSettleCore = await readCurrentCore(page);
    expect(afterSettleCore.pendingEventChoice).toBeNull();
    expect(afterSettleCore.phase).toBe("preHaunt");
    expect(afterSettleCore.scenarioRuntime.hauntTriggered).toBe(false);
    const settledRollTotal =
      (afterSettleCore.recentRoll?.dice ?? []).reduce(
        (sum, pip) => sum + pip,
        0,
      ) + (afterSettleCore.recentRoll?.passiveBonus ?? 0);
    expect(settledRollTotal).toBeLessThan(
      afterSettleCore.scenarioRuntime.hauntRollThreshold,
    );
    expect(afterSettleCore.currentExplorer.inventory.at(-1)?.name).toBe(
      "魔法相机",
    );
    expect(afterSettleCore.recentRoll?.sourceTitle).toBe("说“茄子”！");
    await saveScreenshot(page, `${screenshotBase}-05-抽物品结算结果可见.jpg`);

    await dismissDiscoveryPanel(page);
    await expect(page.getByTestId("betrayal-board")).toBeVisible();
    await expect(page.getByTestId("betrayal-discovery-panel")).toHaveCount(0);
    await expect(page.getByTestId("betrayal-event-choice-panel")).toHaveCount(
      0,
    );
    await expect(page.getByTestId("betrayal-inventory-row-item")).toContainText(
      "魔法相机",
    );
    await saveScreenshot(page, `${screenshotBase}-06-关闭后回牌桌.jpg`);

    assertNoFatalFrontendErrors([
      { label: "betrayal-event-choice-说茄子-完整链路", diagnostics },
    ]);
  });

  test("说茄子真实链路触发作祟时由魔法相机持有者成为叛徒", async ({ page }) => {
    test.setTimeout(120000);
    const diagnostics = attachPageDiagnostics(
      page,
      "betrayal-event-choice-魔法相机作祟归属完整链路",
    );
    const screenshotBase = `${MAGIC_CAMERA_HAUNT_OWNER_EVIDENCE_DIR}/魔法相机作祟归属`;
    const sayCheese = eventByName("说“茄子”！");
    const core = createRuntimeCore();
    core.drawOrder = ["event"];
    core.eventOrder = [sayCheese];
    core.currentExplorer = {
      ...core.currentExplorer,
      inventory: [
        { id: "omen-book", name: "书本", kind: "omen" },
        { id: "dog", name: "狗", kind: "omen" },
        { id: "mask", name: "面具", kind: "omen" },
      ],
    };
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.currentExplorerInventory = [...core.currentExplorer.inventory];
    core.otherExplorers = core.otherExplorers.map((explorer) =>
      explorer.playerId === "1"
        ? {
            ...explorer,
            inventory: [{ id: "camera", name: "魔法相机", kind: "item" }],
          }
        : explorer,
    );

    await injectCore(page, core);
    await expect(page.getByTestId("betrayal-board")).toBeVisible({
      timeout: 30000,
    });
    const initialCore = await readCurrentCore(page);
    expect(initialCore.currentExplorer.playerId).toBe("0");
    expect(
      initialCore.otherExplorers
        .find((explorer) => explorer.playerId === "1")
        ?.inventory.some((card) => card.id === "camera"),
    ).toBe(true);
    await page.getByTestId("betrayal-action-move").click();
    await page.getByTestId("betrayal-room-hallway").click();
    await expect(page.getByTestId("betrayal-action-explore")).toBeEnabled();
    await saveScreenshot(page, `${screenshotBase}-01-探索前.jpg`);

    await page.getByTestId("betrayal-action-explore").click();
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-north"),
    ).toBeVisible();
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-south"),
    ).toBeVisible();
    await saveScreenshot(page, `${screenshotBase}-02-选择未知房间.jpg`);

    await confirmGroundNorthRoomPlacement(page);
    const eventChoicePanel = page.getByTestId("betrayal-event-choice-panel");
    await expect(eventChoicePanel).toHaveAttribute("aria-label", "说“茄子”！");
    await expect(page.getByTestId("betrayal-recent-roll-panel")).toHaveCount(0);
    await expect(
      page.getByTestId("betrayal-event-choice-confirm"),
    ).toContainText("进行作祟检定");
    const beforeChoiceCore = await readCurrentCore(page);
    expect(beforeChoiceCore.pendingEventChoice?.sourceTitle).toBe("说“茄子”！");
    expect(beforeChoiceCore.scenarioRuntime.hauntTriggered).toBe(false);
    await saveScreenshot(
      page,
      `${screenshotBase}-03-事件牌翻出可选择作祟检定.jpg`,
    );

    await setHarnessRandomQueue(page, [0.99, 0.99, 0.99, 0.99]);
    await page.getByTestId("betrayal-event-choice-confirm").click();
    await expect(eventChoicePanel).toBeHidden({ timeout: 30000 });
    const discoveryPanel = page.getByTestId("betrayal-discovery-panel");
    await expect(discoveryPanel).toBeVisible();
    await expect(page.getByTestId("betrayal-recent-roll-panel")).toHaveCount(0);
    const discoveryDetail = page.getByTestId("betrayal-discovery-detail");
    await expect(discoveryDetail).toContainText("作祟检定");
    await expect(discoveryDetail).toContainText("剧本33");
    const detailText = (await discoveryDetail.textContent()) ?? "";
    const rollMatch = detailText.match(/总点数\s*(\d+)/);
    expect(rollMatch?.[1]).toBeTruthy();
    const rollTotal = Number(rollMatch?.[1]);
    await saveScreenshot(
      page,
      `${screenshotBase}-04-选择作祟检定后触发作祟.jpg`,
    );

    const afterSettleCore = await readCurrentCore(page);
    expect(afterSettleCore.phase).toBe("haunt");
    expect(afterSettleCore.scenarioRuntime.hauntTriggered).toBe(true);
    expect(rollTotal).toBeGreaterThanOrEqual(
      afterSettleCore.scenarioRuntime.hauntRollThreshold,
    );
    expect(afterSettleCore.scenarioRuntime.hauntCardNumber).toBe(33);
    expect(afterSettleCore.scenarioRuntime.hauntRevealerPlayerId).toBe("0");
    expect(afterSettleCore.scenarioRuntime.traitorPlayerId).toBe("1");
    expect(afterSettleCore.scenarioRuntime.hauntTriggerLabel).toBe(
      "说“茄子”！",
    );
    await expect(page.getByTestId("betrayal-discovery-detail")).toContainText(
      `总点数 ${rollTotal}`,
    );
    const hauntRevealCue = page.getByTestId("betrayal-haunt-reveal-cue");
    await expect(hauntRevealCue).toBeVisible();
    await expect(hauntRevealCue).toHaveAttribute(
      "data-haunt-reveal-active",
      "true",
    );
    await expect(hauntRevealCue).toContainText("作祟开始");
    await expect(hauntRevealCue).toContainText("叛徒");
    expect(
      afterSettleCore.activityLog.some(
        (entry) =>
          entry.text.includes("剧本33") && entry.text.includes("说“茄子”！"),
      ),
    ).toBe(true);
    await saveScreenshot(
      page,
      `${screenshotBase}-05-魔法相机持有者成为叛徒结果可见.jpg`,
    );

    await dismissDiscoveryPanel(page);
    await expect(page.getByTestId("betrayal-board")).toBeVisible();
    await expect(page.getByTestId("betrayal-discovery-panel")).toHaveCount(0);
    await expect(page.getByTestId("betrayal-event-choice-panel")).toHaveCount(
      0,
    );
    await expect(page.getByTestId("betrayal-action-explore")).toHaveCount(0);
    const closedCore = await readCurrentCore(page);
    expect(closedCore.phase).toBe("haunt");
    expect(closedCore.scenarioRuntime.traitorPlayerId).toBe("1");
    const smashReadyCore: BetrayalCore = {
      ...closedCore,
      usedCardIdsThisTurn: [],
      recentRoll: null,
    };
    const cameraHolderId = smashReadyCore.scenarioRuntime.traitorPlayerId;
    const smashRoomId = smashReadyCore.currentExplorer.roomId;
    smashReadyCore.currentExplorer = {
      ...smashReadyCore.currentExplorer,
      traits: {
        ...smashReadyCore.currentExplorer.traits,
        sanity: 6,
      },
    };
    smashReadyCore.otherExplorers = smashReadyCore.otherExplorers.map(
      (explorer) =>
        explorer.playerId === cameraHolderId
          ? { ...explorer, roomId: smashRoomId }
          : explorer,
    );
    smashReadyCore.currentExplorerTraits = {
      ...smashReadyCore.currentExplorer.traits,
    };
    await injectCore(page, smashReadyCore);
    const injectedSmashReadyCore = await readCurrentCore(page);
    const injectedCameraHolderId =
      injectedSmashReadyCore.scenarioRuntime.magicCamera?.cameraHolderPlayerId;
    const injectedTraitor = [
      injectedSmashReadyCore.currentExplorer,
      ...injectedSmashReadyCore.otherExplorers,
    ].find((explorer) => explorer.playerId === cameraHolderId);
    expect(injectedCameraHolderId).toBe(cameraHolderId);
    expect(injectedTraitor?.roomId).toBe(
      injectedSmashReadyCore.currentExplorer.roomId,
    );
    expect(
      injectedTraitor?.inventory.some((card) => card.id === "camera"),
    ).toBe(true);
    expect(
      canSmashMagicCamera(
        injectedSmashReadyCore,
        injectedSmashReadyCore.currentExplorer,
      ),
    ).toBe(true);
    await expectHauntGoalCardAndScenarioBook(page, {
      cardNumber: 33,
      title: "魔法相机",
      goalTexts: ["剧本33", "本质", "幻影摄影师", "相机"],
      primaryActionText: "砸毁魔法相机",
      actionHintTexts: ["砸毁魔法相机"],
      actionScreenshotPath: `${screenshotBase}-06a-魔法相机底部作祟主动作可见.jpg`,
      bookTexts: [
        "剧本33查阅",
        "魔法相机",
        "本质",
        "幻影摄影师",
        "砸毁魔法相机",
      ],
      nextBookTexts: ["叛徒手册", "英雄胜利"],
      screenshotPath: `${screenshotBase}-06b-魔法相机目标卡打开剧本书.jpg`,
    });
    await expectMobileHauntScenarioBook(page, {
      headerText: "剧本33查阅",
      firstPageTexts: ["魔法相机", "本质", "幻影摄影师", "砸毁魔法相机"],
      lastPageTexts: ["叛徒手册", "英雄胜利"],
      firstScreenshotPath: `${screenshotBase}-06c-移动横屏魔法相机剧本首页.jpg`,
      lastScreenshotPath: `${screenshotBase}-06d-移动横屏魔法相机剧本末页.jpg`,
      closedScreenshotPath: `${screenshotBase}-06e-移动横屏关闭剧本回牌桌.jpg`,
    });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await saveScreenshot(page, `${screenshotBase}-06-关闭后进入作祟牌桌.jpg`);
    await expect(
      page.getByTestId("betrayal-action-use"),
      "砸毁魔法相机必须由底部作祟动作入口承接",
    ).toBeVisible();

    await setHarnessRandomQueue(page, [0.99, 0.99, 0.99, 0.99, 0.99, 0.99]);
    await page.getByTestId("betrayal-action-use").click();
    await expect(
      page.getByTestId("betrayal-room-latest-feedback"),
    ).toContainText("砸毁了魔法相机");
    await expect
      .poll(
        async () => {
          const nextCore = await readCurrentCore(page);
          return nextCore.scenarioRuntime.magicCamera?.cameraDestroyed ?? false;
        },
        {
          message: "点击作祟主动作后英雄必须能砸毁魔法相机",
          timeout: 10000,
        },
      )
      .toBe(true);
    await expect(page.getByTestId("betrayal-recent-roll-panel")).toBeVisible();
    await expect(
      page.getByTestId("betrayal-haunt-command-banner"),
      "砸毁相机的阻塞投骰结果未确认前，不得提前显示下一作祟动作",
    ).toHaveCount(0);
    await saveScreenshot(page, `${screenshotBase}-07-主动作砸毁魔法相机.jpg`);

    assertNoFatalFrontendErrors([
      {
        label: "betrayal-event-choice-魔法相机作祟归属完整链路",
        diagnostics,
      },
    ]);
  });

  test("一抹鲜红真实链路从探索翻牌到作祟失败速度奖励关闭", async ({ page }) => {
    test.setTimeout(120000);
    const diagnostics = attachPageDiagnostics(
      page,
      "betrayal-event-choice-一抹鲜红-完整链路",
    );
    const screenshotBase = `${EVIDENCE_DIR}/一抹鲜红-完整链路`;
    const crimsonSplash = eventByName("一抹鲜红");
    const core = createRuntimeCore();
    core.drawOrder = ["event"];
    core.eventOrder = [crimsonSplash];
    core.deckCounts.event = core.eventOrder.length;
    pinGroundNorthToEventRoom(core);
    core.currentExplorer = {
      ...core.currentExplorer,
      traits: {
        ...core.currentExplorer.traits,
        speed: 4,
      },
      inventory: [
        { id: "omen-book", name: "书本", kind: "omen" },
        { id: "dog", name: "狗", kind: "omen" },
      ],
    };
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.currentExplorerInventory = [...core.currentExplorer.inventory];

    await injectCore(page, core);
    await expect(page.getByTestId("betrayal-board")).toBeVisible({
      timeout: 30000,
    });

    await page.getByTestId("betrayal-action-move").click();
    await page.getByTestId("betrayal-room-hallway").click();
    await expect(
      page.getByTestId("betrayal-room-ground-north"),
    ).toHaveAccessibleName(/未探索.*一层.*尚未翻出/);
    await expect(page.getByTestId("betrayal-action-explore")).toBeEnabled();
    await saveScreenshot(page, `${screenshotBase}-01-探索前.jpg`);

    await page.getByTestId("betrayal-action-explore").click();
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-north"),
    ).toBeVisible();
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-south"),
    ).toBeVisible();
    await saveScreenshot(page, `${screenshotBase}-02-选择未知房间.jpg`);

    await confirmGroundNorthRoomPlacement(page);
    const eventChoicePanel = page.getByTestId("betrayal-event-choice-panel");
    await expect(eventChoicePanel).toHaveAttribute("aria-label", "一抹鲜红");
    await expect(eventChoicePanel).toHaveAttribute(
      "data-surface",
      "open-table",
    );
    await expect(
      page.getByTestId("betrayal-event-choice-card-front-atlas"),
    ).toBeVisible();
    await expect(page.getByTestId("betrayal-recent-roll-panel")).toHaveCount(0);
    await expect(
      page.getByTestId("betrayal-event-choice-confirm"),
    ).toContainText("进行作祟检定");
    await expect(
      page.getByTestId("betrayal-event-choice-decline"),
    ).toContainText("跳过作祟检定");
    const beforeChoiceCore = await readCurrentCore(page);
    expect(beforeChoiceCore.pendingEventChoice?.sourceTitle).toBe("一抹鲜红");
    expect(beforeChoiceCore.currentExplorer.traits.speed).toBe(4);
    const speedTrackPositionBefore =
      beforeChoiceCore.currentExplorer.traitTracks.speed.position;
    await saveScreenshot(
      page,
      `${screenshotBase}-03-事件牌翻出可选择作祟检定.jpg`,
    );

    await setHarnessRandomQueue(page, [0.1, 0.1]);
    await page.getByTestId("betrayal-event-choice-confirm").click();
    await expect(eventChoicePanel).toBeHidden({ timeout: 30000 });
    const discoveryPanel = page.getByTestId("betrayal-discovery-panel");
    await expect(discoveryPanel).toBeVisible();
    await expect(discoveryPanel).toHaveAttribute(
      "aria-label",
      /事件牌 一抹鲜红/,
    );
    const rollPanel = discoveryPanel.getByTestId("betrayal-recent-roll-panel");
    await expect(rollPanel).toBeVisible();
    await expect(rollPanel).toContainText("作祟检定");
    const afterRollCore = await readCurrentCore(page);
    const rollDice = afterRollCore.recentRoll?.dice ?? [];
    const rollTotal =
      rollDice.reduce((sum, pip) => sum + pip, 0) +
      (afterRollCore.recentRoll?.passiveBonus ?? 0);
    const rollDiceCount = rollDice.length;
    expect(rollDiceCount).toBeGreaterThan(0);
    expect(rollTotal).toBeGreaterThanOrEqual(0);
    expect(rollTotal).toBeLessThan(
      afterRollCore.scenarioRuntime.hauntRollThreshold,
    );
    await expect(rollPanel).toContainText(`总点数 ${rollTotal}`);
    const diceGroup = discoveryPanel.getByTestId(
      "betrayal-house-dice-3d-group",
    );
    await expect(diceGroup).toHaveAttribute(
      "data-dice-count",
      String(rollDiceCount),
    );
    await expect(diceGroup).toHaveAttribute(
      "data-dice-rule-subtotal",
      String(rollTotal),
    );
    await expectVisiblePhysicalDiceBox(rollPanel);
    await waitForPhysicalDiceSettled(rollPanel);
    await expectPhysicalDiceSeparated(rollPanel, {
      minDiceCount: rollDiceCount,
    });
    await saveScreenshot(
      page,
      `${screenshotBase}-04-选择作祟检定后骰盘停稳.jpg`,
    );

    const discoveryDetail = page.getByTestId("betrayal-discovery-detail");
    await expect(discoveryDetail).toContainText(`总点数 ${rollTotal}`);
    await expect(discoveryDetail).toContainText("速度 +1");
    await expect(discoveryDetail).not.toContainText("物理伤害");
    const afterSettleCore = await readCurrentCore(page);
    expect(afterSettleCore.pendingEventChoice).toBeNull();
    expect(afterSettleCore.phase).toBe("preHaunt");
    expect(afterSettleCore.scenarioRuntime.hauntTriggered).toBe(false);
    const settledRollTotal =
      (afterSettleCore.recentRoll?.dice ?? []).reduce(
        (sum, pip) => sum + pip,
        0,
      ) + (afterSettleCore.recentRoll?.passiveBonus ?? 0);
    expect(settledRollTotal).toBeLessThan(
      afterSettleCore.scenarioRuntime.hauntRollThreshold,
    );
    expect(afterSettleCore.currentExplorer.traitTracks.speed.position).toBe(
      speedTrackPositionBefore + 1,
    );
    expect(afterSettleCore.currentExplorerTraits.speed).toBe(
      afterSettleCore.currentExplorer.traits.speed,
    );
    expect(afterSettleCore.recentRoll?.sourceTitle).toBe("一抹鲜红");
    await saveScreenshot(page, `${screenshotBase}-05-速度奖励结算结果可见.jpg`);

    await dismissDiscoveryPanel(page);
    await expect(page.getByTestId("betrayal-board")).toBeVisible();
    await expect(page.getByTestId("betrayal-discovery-panel")).toHaveCount(0);
    await expect(page.getByTestId("betrayal-event-choice-panel")).toHaveCount(
      0,
    );
    await expect(
      page.getByTestId("betrayal-room-occupant-ground-north-0"),
    ).toBeVisible();
    await saveScreenshot(page, `${screenshotBase}-06-关闭后回牌桌.jpg`);

    assertNoFatalFrontendErrors([
      { label: "betrayal-event-choice-一抹鲜红-完整链路", diagnostics },
    ]);
  });

  test("吊死鬼真实链路从探索翻牌到四项检定后选奖励关闭", async ({ page }) => {
    test.setTimeout(120000);
    const diagnostics = attachPageDiagnostics(
      page,
      "betrayal-event-choice-吊死鬼-完整链路",
    );
    const screenshotBase = `${EVIDENCE_DIR}/吊死鬼-完整链路`;
    const hangingTree = eventByName("吊死鬼");
    const core = createRuntimeCore();
    core.drawOrder = ["event"];
    core.eventOrder = [hangingTree];
    core.currentExplorer = {
      ...core.currentExplorer,
      traits: {
        ...core.currentExplorer.traits,
        might: 3,
        speed: 3,
        knowledge: 3,
        sanity: 3,
      },
      inventory: [],
    };
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.currentExplorerInventory = [];

    await injectCore(page, core);
    await expect(page.getByTestId("betrayal-board")).toBeVisible({
      timeout: 30000,
    });

    await page.getByTestId("betrayal-action-move").click();
    await page.getByTestId("betrayal-room-hallway").click();
    await expect(
      page.getByTestId("betrayal-room-ground-north"),
    ).toHaveAccessibleName(/未探索.*一层.*尚未翻出/);
    await expect(page.getByTestId("betrayal-action-explore")).toBeEnabled();
    await saveScreenshot(page, `${screenshotBase}-01-探索前.jpg`);

    await page.getByTestId("betrayal-action-explore").click();
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-north"),
    ).toBeVisible();
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-south"),
    ).toBeVisible();
    await saveScreenshot(page, `${screenshotBase}-02-选择未知房间.jpg`);

    await setHarnessRandomQueue(page, Array(12).fill(0.99));
    await confirmGroundNorthRoomPlacement(page);
    const eventChoicePanel = page.getByTestId("betrayal-event-choice-panel");
    await expect(eventChoicePanel).toHaveAttribute("aria-label", "吊死鬼");
    await expect(eventChoicePanel).toHaveAttribute(
      "data-surface",
      "open-table",
    );
    await expect(
      page.getByTestId("betrayal-event-choice-card-front-atlas"),
    ).toBeVisible();
    await expect(page.getByTestId("betrayal-recent-roll-panel")).toHaveCount(0);
    const allTraitPanel = page.getByTestId(
      "betrayal-event-choice-all-trait-check",
    );
    await expect(allTraitPanel).toBeVisible();
    for (const [trait, label] of [
      ["might", "力量"],
      ["speed", "速度"],
      ["knowledge", "知识"],
      ["sanity", "神志"],
    ] as const) {
      const row = page.getByTestId(
        `betrayal-event-choice-all-trait-check-${trait}`,
      );
      await expect(row).toContainText(label);
      await expect(row).toContainText("6 / 通过");
    }
    for (const trait of ["might", "speed", "knowledge", "sanity"]) {
      await expect(
        page.getByTestId(`betrayal-event-choice-trait-${trait}`),
      ).toBeVisible();
    }
    const beforeRewardCore = await readCurrentCore(page);
    expect(beforeRewardCore.pendingEventChoice?.sourceTitle).toBe("吊死鬼");
    expect(
      beforeRewardCore.recentAllTraitCheck?.results.every(
        (result) => result.passed,
      ),
    ).toBe(true);
    expect(beforeRewardCore.currentExplorer.traits.knowledge).toBe(3);
    await expect(
      page.getByTestId("betrayal-event-choice-confirm"),
      "吊死鬼没有二选一语义，最终提交应由奖励属性点击完成，不能先露出额外确认按钮",
    ).toHaveCount(0);
    await saveScreenshot(
      page,
      `${screenshotBase}-03-事件牌翻出四项检定全过.jpg`,
    );

    await page.getByTestId("betrayal-event-choice-trait-knowledge").click();
    await expect(eventChoicePanel).toBeHidden({ timeout: 30000 });
    const discoveryPanel = page.getByTestId("betrayal-discovery-panel");
    await expect(discoveryPanel).toBeVisible();
    await expect(discoveryPanel).toHaveAttribute("aria-label", /事件牌 吊死鬼/);
    const discoveryDetail = page.getByTestId("betrayal-discovery-detail");
    await expect(discoveryDetail).toContainText("每项属性均通过");
    await expect(discoveryDetail).toContainText("知识 +1");
    const afterSettleCore = await readCurrentCore(page);
    expect(afterSettleCore.pendingEventChoice).toBeNull();
    expect(afterSettleCore.currentExplorer.traits.knowledge).toBe(4);
    await saveScreenshot(page, `${screenshotBase}-05-知识奖励结算结果可见.jpg`);

    await dismissDiscoveryPanel(page);
    await expect(page.getByTestId("betrayal-board")).toBeVisible();
    await expect(page.getByTestId("betrayal-discovery-panel")).toHaveCount(0);
    await expect(page.getByTestId("betrayal-event-choice-panel")).toHaveCount(
      0,
    );
    await expect(
      page.getByTestId("betrayal-room-occupant-ground-north-0"),
    ).toBeVisible();
    await saveScreenshot(page, `${screenshotBase}-06-关闭后回牌桌.jpg`);

    assertNoFatalFrontendErrors([
      { label: "betrayal-event-choice-吊死鬼-完整链路", diagnostics },
    ]);
  });

  test("外星几何真实链路从探索翻牌到自动投骰结算关闭", async ({ page }) => {
    test.setTimeout(120000);
    const diagnostics = attachPageDiagnostics(
      page,
      "betrayal-event-choice-外星几何-完整链路",
    );
    const screenshotBase = `${EVIDENCE_DIR}/外星几何-完整链路`;
    const alienGeometry = eventByName("外星几何");
    const core = createRuntimeCore();
    core.drawOrder = ["event"];
    core.eventOrder = [alienGeometry];
    core.deckCounts.event = core.eventOrder.length;
    pinGroundNorthToEventRoom(core);
    core.currentExplorer = {
      ...core.currentExplorer,
      traits: {
        ...core.currentExplorer.traits,
        knowledge: 3,
        speed: 4,
      },
      inventory: [],
    };
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.currentExplorerInventory = [];

    await injectCore(page, core);
    await expect(page.getByTestId("betrayal-board")).toBeVisible({
      timeout: 30000,
    });

    await page.getByTestId("betrayal-action-move").click();
    await page.getByTestId("betrayal-room-hallway").click();
    await expect(
      page.getByTestId("betrayal-room-ground-north"),
    ).toHaveAccessibleName(/未探索.*一层.*尚未翻出/);
    await expect(page.getByTestId("betrayal-action-explore")).toBeEnabled();
    await saveScreenshot(page, `${screenshotBase}-01-探索前.jpg`);

    await page.getByTestId("betrayal-action-explore").click();
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-north"),
    ).toBeVisible();
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-south"),
    ).toBeVisible();
    await saveScreenshot(page, `${screenshotBase}-02-选择未知房间.jpg`);

    await setHarnessRandomQueue(page, [0.99, 0.99, 0.99]);
    await confirmGroundNorthRoomPlacement(page);
    await expect(page.getByTestId("betrayal-event-choice-panel")).toHaveCount(
      0,
    );
    const discoveryPanel = page.getByTestId("betrayal-discovery-panel");
    await expect(discoveryPanel).toBeVisible({ timeout: 30000 });
    await expectDiscoveryResolutionLedgerTraceOnly(
      discoveryPanel,
      "外星几何自动投骰结算",
    );
    await expect(discoveryPanel).toHaveAttribute(
      "aria-label",
      /事件牌 外星几何/,
    );
    await expect(
      page.getByTestId("betrayal-discovery-card-front-atlas"),
    ).toBeVisible();
    await expect(page.getByTestId("betrayal-discovery-top-banner")).toHaveCount(
      0,
    );
    const discoveryDetail = page.getByTestId("betrayal-discovery-detail");
    await expect(discoveryDetail).toContainText("知识检定");
    await expect(discoveryDetail).toContainText("获得 1 点知识");
    await saveScreenshot(
      page,
      `${screenshotBase}-03-事件牌翻出已有知识检定.jpg`,
    );

    const rollPanel = discoveryPanel.getByTestId("betrayal-recent-roll-panel");
    await expect(rollPanel).toBeVisible();
    await expect(rollPanel).toContainText("知识检定");
    await expect(
      page.getByTestId("betrayal-house-dice-3d-group"),
    ).toHaveAttribute("data-dice-count", "3");
    await expect(
      page.getByTestId("betrayal-house-dice-3d-group"),
    ).toHaveAttribute("data-dice-rule-subtotal", "6");
    await expectVisiblePhysicalDiceBox(rollPanel);
    await expectPhysicalDiceStableAfterSettled(rollPanel);
    await expectPhysicalDiceSeparated(rollPanel, { minDiceCount: 3 });
    await saveScreenshot(page, `${screenshotBase}-04-骰盘停稳直接结算.jpg`);

    await expect(discoveryDetail).toContainText("获得 1 点知识");
    await expect(page.getByTestId("betrayal-event-choice-panel")).toHaveCount(
      0,
    );
    await saveScreenshot(page, `${screenshotBase}-05-结算结果可见.jpg`);

    await dismissDiscoveryPanel(page);
    await expect(page.getByTestId("betrayal-board")).toBeVisible();
    await expect(page.getByTestId("betrayal-discovery-panel")).toHaveCount(0);
    await expect(page.getByTestId("betrayal-event-choice-panel")).toHaveCount(
      0,
    );
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-south"),
    ).toHaveCount(0);
    await saveScreenshot(page, `${screenshotBase}-06-关闭后.jpg`);

    assertNoFatalFrontendErrors([
      { label: "betrayal-event-choice-外星几何-完整链路", diagnostics },
    ]);
  });

  for (const directRollCase of directRollFullChainCases) {
    test(`${directRollCase.title}真实链路从探索翻牌到投骰结算关闭`, async ({
      page,
    }) => {
      await runDirectRollEventFullChain(page, directRollCase);
    });
  }

  test("盔甲真实链路从电话铃声翻牌到物理伤害减伤结算关闭", async ({ page }) => {
    test.setTimeout(120000);
    const diagnostics = attachPageDiagnostics(
      page,
      "betrayal-event-choice-盔甲物理减伤完整链路",
    );
    const screenshotBase = ARMOR_EVIDENCE_DIR;
    const phoneCall = eventByName("电话铃声");
    const armorCard = BETRAYAL_DISCOVERY_POOLS.possessions.omen.find(
      (card) => card.id === "armor",
    );
    if (!armorCard) {
      throw new Error("山屋预兆池缺少盔甲");
    }
    const core = createRuntimeCore();
    core.drawOrder = ["event"];
    core.eventOrder = [phoneCall];
    core.deckCounts.event = core.eventOrder.length;
    pinGroundNorthToEventRoom(core);
    core.currentExplorer = {
      ...core.currentExplorer,
      inventory: [{ ...armorCard }],
    };
    setCurrentExplorerVisibleTrait(core, "might", 4);
    setCurrentExplorerVisibleTrait(core, "speed", 4);
    setCurrentExplorerVisibleTrait(core, "knowledge", 4);
    setCurrentExplorerVisibleTrait(core, "sanity", 4);
    core.currentExplorerInventory = [...core.currentExplorer.inventory];
    core.turnStartInventoryCardIds = ["armor"];

    await injectCore(page, core);
    await expect(page.getByTestId("betrayal-board")).toBeVisible({
      timeout: 30000,
    });
    const armorShell = page.getByTestId("betrayal-inventory-armor-shell");
    await expect(armorShell).toBeVisible();
    await expect(armorShell).toHaveAttribute(
      "data-rules-summary",
      /受到物理伤害 -1/,
    );
    const beforeCore = await readCurrentCore(page);
    const physicalBefore = physicalTraitTotal(beforeCore, "0");
    const mightPositionBefore = traitTrackPosition(beforeCore, "0", "might");
    const speedPositionBefore = traitTrackPosition(beforeCore, "0", "speed");
    expect(physicalBefore).toBe(8);
    await saveScreenshot(page, `${screenshotBase}/01-盔甲减伤前牌桌可操作.jpg`);

    await page.getByTestId("betrayal-action-move").click();
    await page.getByTestId("betrayal-room-hallway").click();
    await expect(
      page.getByTestId("betrayal-room-ground-north"),
    ).toHaveAccessibleName(/未探索.*一层.*尚未翻出/);
    await expect(page.getByTestId("betrayal-action-explore")).toBeEnabled();
    await page.getByTestId("betrayal-action-explore").click();
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-north"),
    ).toBeVisible();
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-south"),
    ).toBeVisible();
    await saveScreenshot(page, `${screenshotBase}/02-选择未知房间前.jpg`);

    await setHarnessRandomQueue(page, [0, 0]);
    await confirmGroundNorthRoomPlacement(page);
    await expect(page.getByTestId("betrayal-event-choice-panel")).toHaveCount(
      0,
    );
    const discoveryPanel = page.getByTestId("betrayal-discovery-panel");
    await expect(discoveryPanel).toBeVisible({ timeout: 30000 });
    await expect(discoveryPanel).toHaveAttribute(
      "aria-label",
      /事件牌 电话铃声/,
    );
    await expect(
      page.getByTestId("betrayal-discovery-card-front-atlas"),
    ).toBeVisible();
    const discoveryDetail = page.getByTestId("betrayal-discovery-detail");
    await expect(discoveryDetail).toContainText("投 2 颗骰子 0");
    await expect(discoveryDetail).toContainText("受到两颗骰子的物理伤害");
    await saveScreenshot(
      page,
      `${screenshotBase}/03-电话铃声翻出并显示物理伤害分支.jpg`,
    );

    const rollPanel = discoveryPanel.getByTestId("betrayal-recent-roll-panel");
    await expect(rollPanel).toBeVisible();
    await expect(rollPanel.getByTestId("betrayal-recent-roll-outcome")).toHaveText(
      "受到两颗骰子的物理伤害",
    );
    await expect(rollPanel.getByTestId("betrayal-recent-roll-total")).toContainText(
      "总点数 0",
    );
    await expect(rollPanel.getByTestId("betrayal-recent-roll-total")).not.toContainText(
      "伤害骰合计",
    );
    await expect(rollPanel.getByTestId("betrayal-recent-roll-damage-dice")).toHaveCount(0);
    await expect(rollPanel).toHaveAttribute("data-visible-dice-source", "recent-roll");
    await expect(
      rollPanel.getByTestId("betrayal-house-dice-3d-group"),
    ).toHaveAttribute("data-dice-count", "2");
    await expect(
      rollPanel.getByTestId("betrayal-house-dice-3d-group"),
    ).toHaveAttribute("data-dice-rule-subtotal", "0");
    await expectVisiblePhysicalDiceBox(rollPanel);
    await waitForPhysicalDiceSettled(rollPanel);
    await expectPhysicalDiceSeparated(rollPanel, { minDiceCount: 2 });
    await saveScreenshot(page, `${screenshotBase}/04-物理事件骰停稳等待确认.jpg`);

    const beforeFinalizeCore = await readCurrentCore(page);
    expect(beforeFinalizeCore.recentRoll).toMatchObject({
      kind: "eventDiceRoll",
      sourceTitle: "电话铃声",
      dice: [0, 0],
      latestLabel: "受到两颗骰子的物理伤害",
    });
    expect(beforeFinalizeCore.recentRoll?.eventRolledDamageResults).toBeUndefined();
    expect(beforeFinalizeCore.pendingEventRollResolution).toMatchObject({
      sourceTitle: "电话铃声",
    });
    expect(physicalTraitTotal(beforeFinalizeCore, "0")).toBe(physicalBefore);
    expect(traitTrackPosition(beforeFinalizeCore, "0", "might")).toBe(
      mightPositionBefore,
    );
    expect(traitTrackPosition(beforeFinalizeCore, "0", "speed")).toBe(
      speedPositionBefore,
    );

    await finalizePendingEventRollForAllPlayers(
      page,
      "电话铃声物理伤害分支确认后必须重新投掷两颗伤害骰",
      [0.99, 0.99],
    );
    const afterFinalizeCore = await readCurrentCore(page);
    expect(afterFinalizeCore.recentRoll).toMatchObject({
      kind: "eventRolledDamage",
      sourceTitle: "电话铃声",
      rollLabel: "重新投掷的伤害骰",
      dice: [2, 2],
      passiveBonus: 0,
      latestLabel: "造成 3 点物理伤害",
      sourceEventRoll: {
        kind: "eventDiceRoll",
        sourceTitle: "电话铃声",
        dice: [0, 0],
        total: 0,
        latestLabel: "受到两颗骰子的物理伤害",
      },
    });
    expect(afterFinalizeCore.recentRoll?.eventEffectSnapshot).toBeUndefined();
    expect(afterFinalizeCore.recentRoll?.eventRolledDamageResults).toEqual([{
      damageKind: "physical",
      rolls: [2, 2],
      total: 4,
      appliedAmount: 3,
    }]);
    expect(afterFinalizeCore.pendingDamageAllocation).toMatchObject({
      sourceTitle: "电话铃声",
      playerId: "0",
      damageKind: "physical",
      amount: 3,
      originalAmount: 4,
      allowedTraits: ["might", "speed"],
    });
    expect(physicalTraitTotal(afterFinalizeCore, "0")).toBe(physicalBefore);
    expect(traitTrackPosition(afterFinalizeCore, "0", "might")).toBe(
      mightPositionBefore,
    );
    expect(traitTrackPosition(afterFinalizeCore, "0", "speed")).toBe(
      speedPositionBefore,
    );

    const damageRollPanel = page.getByTestId("betrayal-recent-roll-panel");
    await expect(damageRollPanel).toHaveAttribute(
      "data-visible-dice-source",
      "event-rolled-damage",
    );
    await expect(
      damageRollPanel.getByTestId("betrayal-recent-roll-source-title"),
    ).toHaveCount(0);
    await expect(
      damageRollPanel.getByTestId("betrayal-recent-roll-outcome"),
    ).toHaveCount(0);
    await expect(
      damageRollPanel.getByTestId("betrayal-recent-roll-event-description"),
    ).toHaveText(
      "受到两颗骰子的物理伤害",
    );
    await expect(
      damageRollPanel.getByTestId("betrayal-recent-roll-event-description"),
    ).toHaveAttribute("data-result-role", "event-damage-description");
    await expect(
      damageRollPanel.getByTestId("betrayal-recent-roll-event-effect"),
    ).toHaveText("实际效果：造成 3 点物理伤害");
    await expect(
      damageRollPanel.getByTestId("betrayal-recent-roll-event-effect"),
    ).toHaveAttribute("data-result-role", "event-damage-effect");
    await expect(damageRollPanel.getByTestId("betrayal-recent-roll-total")).toContainText(
      "伤害骰合计 4",
    );
    await expect(damageRollPanel.getByTestId("betrayal-recent-roll-total")).not.toContainText(
      "事件总点数 0",
    );
    await expect(damageRollPanel.getByTestId("betrayal-recent-roll-total")).not.toContainText(
      /骰面合计|加值/,
    );
    await expect(damageRollPanel.getByTestId("betrayal-recent-roll-damage-dice")).toHaveCount(0);
    await expect(damageRollPanel.getByTestId("betrayal-recent-roll-effect-damage")).toHaveCount(0);
    const damageRollVisibleText = await readVisibleNonSrText(damageRollPanel);
    expect(damageRollVisibleText).not.toContain("电话铃声");
    expect((damageRollVisibleText.match(/受到两颗骰子的物理伤害/g) ?? [])).toHaveLength(1);
    expect((damageRollVisibleText.match(/实际效果：造成 3 点物理伤害/g) ?? [])).toHaveLength(1);
    expect(damageRollVisibleText).not.toContain("待分配 3 点物理伤害");
    expect(damageRollVisibleText).not.toContain("重新投掷的伤害骰");
    await expect(damageRollPanel.getByTestId("betrayal-recent-roll-breakdown")).toHaveCount(0);
    await expect(
      damageRollPanel.getByTestId("betrayal-reroll-prompt-outside-dice"),
    ).toHaveAttribute("aria-hidden", "true");
    await expect(
      damageRollPanel.getByTestId("betrayal-reroll-prompt-outside-dice"),
    ).toHaveText("");
    await expect(
      damageRollPanel.getByTestId("betrayal-house-dice-3d-group"),
    ).toHaveAttribute("data-dice-count", "2");
    await expect(
      damageRollPanel.getByTestId("betrayal-house-dice-3d-group"),
    ).toHaveAttribute("data-dice-rule-subtotal", "4");
    await expectVisiblePhysicalDiceBox(damageRollPanel);
    await waitForPhysicalDiceSettled(damageRollPanel);
    await expectPhysicalDiceSeparated(damageRollPanel, { minDiceCount: 2 });
    await expect(page.getByTestId("betrayal-damage-allocation-panel")).toHaveCount(0);
    await saveScreenshot(page, `${screenshotBase}/05-重新投掷两颗物理伤害骰.jpg`);
    await acknowledgeVisibleEventDamageRoll(
      page,
      "电话铃声物理伤害骰确认后才进入伤害分配",
    );

    const allocationPanel = page.getByTestId("betrayal-damage-allocation-panel");
    await expect(allocationPanel).toBeVisible();
    await expect(allocationPanel.getByTestId("betrayal-damage-allocation-source")).toContainText(
      "电话铃声",
    );
    await expect(
      allocationPanel.getByTestId("betrayal-damage-allocation-source"),
    ).toHaveAttribute("data-visible-source-owner", "discovery-card");
    await expect(
      allocationPanel.getByTestId("betrayal-damage-allocation-source"),
    ).toHaveClass(/sr-only/);
    await expect(allocationPanel.getByTestId("betrayal-damage-allocation-player")).toContainText(
      "伊莎·瓦伦西亚",
    );
    await expect(allocationPanel.getByTestId("betrayal-damage-allocation-amount")).toContainText(
      "3 点物理伤害",
    );
    await expect(allocationPanel.getByTestId("betrayal-damage-allocation-reduction")).toContainText(
      "盔甲",
    );
    await expect(
      allocationPanel.getByTestId("betrayal-damage-allocation-trait-might"),
    ).toBeEnabled();
    await expect(
      allocationPanel.getByTestId("betrayal-damage-allocation-trait-speed"),
    ).toBeEnabled();
    await expect(
      allocationPanel.getByTestId("betrayal-damage-allocation-trait-knowledge"),
    ).toHaveCount(0);
    await expect(
      allocationPanel.getByTestId("betrayal-damage-allocation-trait-sanity"),
    ).toHaveCount(0);

    await resolveVisibleDamageAllocation(
      page,
      ["might", "might", "speed"],
      `${screenshotBase}/06-盔甲减伤后物理伤害分配面板.jpg`,
    );
    const afterSettleCore = await readCurrentCore(page);
    expect(afterSettleCore.pendingDamageAllocation).toBeNull();
    const armoredExplorer = findE2eExplorer(afterSettleCore, "0");
    expect(armoredExplorer.traitTracks.might.position).toBe(
      mightPositionBefore - 2,
    );
    expect(armoredExplorer.traitTracks.speed.position).toBe(
      speedPositionBefore - 1,
    );
    await expect(armorShell).toHaveAttribute(
      "data-rules-summary",
      /受到物理伤害 -1/,
    );
    await saveScreenshot(page, `${screenshotBase}/07-盔甲减伤结算结果可见.jpg`);

    await dismissDiscoveryPanel(page);
    await expect(page.getByTestId("betrayal-board")).toBeVisible();
    await expect(page.getByTestId("betrayal-discovery-panel")).toHaveCount(0);
    await expect(page.getByTestId("betrayal-event-choice-panel")).toHaveCount(
      0,
    );
    const closedCore = await readCurrentCore(page);
    expect(traitTrackPosition(closedCore, "0", "might")).toBe(
      mightPositionBefore - 2,
    );
    expect(traitTrackPosition(closedCore, "0", "speed")).toBe(
      speedPositionBefore - 1,
    );
    await expect(
      page.getByTestId("betrayal-room-occupant-ground-north-0"),
    ).toBeVisible();
    await expect(page.getByTestId("betrayal-action-rail")).toBeVisible();
    await expect(page.getByTestId("betrayal-action-endTurn")).toBeVisible();
    await saveScreenshot(page, `${screenshotBase}/08-关闭后回牌桌状态清空.jpg`);

    assertNoFatalFrontendErrors([
      { label: "betrayal-event-choice-盔甲物理减伤完整链路", diagnostics },
    ]);
  });

  test("头戴耳机真实链路从电话铃声翻牌到精神伤害减伤结算关闭", async ({
    page,
  }) => {
    test.setTimeout(120000);
    const diagnostics = attachPageDiagnostics(
      page,
      "betrayal-event-choice-头戴耳机精神减伤完整链路",
    );
    const screenshotBase = RADIO_EVIDENCE_DIR;
    const phoneCall = eventByName("电话铃声");
    const radioCard = BETRAYAL_DISCOVERY_POOLS.possessions.item.find(
      (card) => card.id === "radio",
    );
    if (!radioCard) {
      throw new Error("山屋物品池缺少头戴耳机");
    }
    const core = createRuntimeCore();
    core.drawOrder = ["event"];
    core.eventOrder = [phoneCall];
    core.deckCounts.event = core.eventOrder.length;
    pinGroundNorthToEventRoom(core);
    core.currentExplorer = {
      ...core.currentExplorer,
      inventory: [{ ...radioCard }],
    };
    setCurrentExplorerVisibleTrait(core, "might", 4);
    setCurrentExplorerVisibleTrait(core, "speed", 4);
    setCurrentExplorerVisibleTrait(core, "knowledge", 4);
    setCurrentExplorerVisibleTrait(core, "sanity", 4);
    core.currentExplorerInventory = [...core.currentExplorer.inventory];
    core.turnStartInventoryCardIds = ["radio"];

    await injectCore(page, core);
    await expect(page.getByTestId("betrayal-board")).toBeVisible({
      timeout: 30000,
    });
    const radioShell = page.getByTestId("betrayal-inventory-radio-shell");
    await expect(radioShell).toBeVisible();
    await expect(radioShell).toHaveAttribute(
      "data-rules-summary",
      /受到精神伤害 -1/,
    );
    const beforeCore = await readCurrentCore(page);
    const mentalBefore = mentalTraitTotal(beforeCore, "0");
    const knowledgePositionBefore = traitTrackPosition(beforeCore, "0", "knowledge");
    const sanityPositionBefore = traitTrackPosition(beforeCore, "0", "sanity");
    expect(mentalBefore).toBe(8);
    await saveScreenshot(
      page,
      `${screenshotBase}/01-头戴耳机减伤前牌桌可操作.jpg`,
    );

    await page.getByTestId("betrayal-action-move").click();
    await page.getByTestId("betrayal-room-hallway").click();
    await expect(
      page.getByTestId("betrayal-room-ground-north"),
    ).toHaveAccessibleName(/未探索.*一层.*尚未翻出/);
    await expect(page.getByTestId("betrayal-action-explore")).toBeEnabled();
    await page.getByTestId("betrayal-action-explore").click();
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-north"),
    ).toBeVisible();
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-south"),
    ).toBeVisible();
    await saveScreenshot(page, `${screenshotBase}/02-选择未知房间前.jpg`);

    await setHarnessRandomQueue(page, [0.5, 0.5]);
    await confirmGroundNorthRoomPlacement(page);
    await expect(page.getByTestId("betrayal-event-choice-panel")).toHaveCount(
      0,
    );
    const discoveryPanel = page.getByTestId("betrayal-discovery-panel");
    await expect(discoveryPanel).toBeVisible({ timeout: 30000 });
    await expect(discoveryPanel).toHaveAttribute(
      "aria-label",
      /事件牌 电话铃声/,
    );
    await expect(
      page.getByTestId("betrayal-discovery-card-front-atlas"),
    ).toBeVisible();
    const discoveryDetail = page.getByTestId("betrayal-discovery-detail");
    await expect(discoveryDetail).toContainText("投 2 颗骰子 2");
    await expect(discoveryDetail).toContainText("受到一颗骰子的精神伤害");
    await saveScreenshot(
      page,
      `${screenshotBase}/03-电话铃声翻出并显示精神伤害分支.jpg`,
    );

    const rollPanel = discoveryPanel.getByTestId("betrayal-recent-roll-panel");
    await expect(rollPanel).toBeVisible();
    await expect(rollPanel.getByTestId("betrayal-recent-roll-outcome")).toHaveText(
      "受到一颗骰子的精神伤害",
    );
    await expect(rollPanel.getByTestId("betrayal-recent-roll-total")).toContainText(
      "总点数 2",
    );
    await expect(rollPanel.getByTestId("betrayal-recent-roll-total")).not.toContainText(
      "伤害骰合计",
    );
    await expect(rollPanel.getByTestId("betrayal-recent-roll-damage-dice")).toHaveCount(0);
    await expect(rollPanel).toHaveAttribute("data-visible-dice-source", "recent-roll");
    await expect(
      rollPanel.getByTestId("betrayal-house-dice-3d-group"),
    ).toHaveAttribute("data-dice-count", "2");
    await expect(
      rollPanel.getByTestId("betrayal-house-dice-3d-group"),
    ).toHaveAttribute("data-dice-rule-subtotal", "2");
    await expectVisiblePhysicalDiceBox(rollPanel);
    await waitForPhysicalDiceSettled(rollPanel);
    await expectPhysicalDiceSeparated(rollPanel, { minDiceCount: 2 });
    await saveScreenshot(page, `${screenshotBase}/04-精神事件骰停稳等待确认.jpg`);

    const beforeFinalizeCore = await readCurrentCore(page);
    expect(beforeFinalizeCore.recentRoll).toMatchObject({
      kind: "eventDiceRoll",
      sourceTitle: "电话铃声",
      dice: [1, 1],
      latestLabel: "受到一颗骰子的精神伤害",
    });
    expect(beforeFinalizeCore.recentRoll?.eventRolledDamageResults).toBeUndefined();
    expect(beforeFinalizeCore.pendingEventRollResolution).toMatchObject({
      sourceTitle: "电话铃声",
    });
    expect(mentalTraitTotal(beforeFinalizeCore, "0")).toBe(mentalBefore);

    await finalizePendingEventRollForAllPlayers(
      page,
      "电话铃声精神伤害分支确认后必须重新投掷一颗伤害骰",
      [0.99],
    );
    const afterFinalizeCore = await readCurrentCore(page);
    expect(afterFinalizeCore.recentRoll).toMatchObject({
      kind: "eventRolledDamage",
      sourceTitle: "电话铃声",
      rollLabel: "重新投掷的伤害骰",
      dice: [2],
      passiveBonus: 0,
      latestLabel: "造成 1 点精神伤害",
      sourceEventRoll: {
        kind: "eventDiceRoll",
        sourceTitle: "电话铃声",
        dice: [1, 1],
        total: 2,
        latestLabel: "受到一颗骰子的精神伤害",
      },
    });
    expect(afterFinalizeCore.recentRoll?.eventEffectSnapshot).toBeUndefined();
    expect(afterFinalizeCore.recentRoll?.eventRolledDamageResults).toEqual([{
      damageKind: "mental",
      rolls: [2],
      total: 2,
      appliedAmount: 1,
    }]);
    expect(afterFinalizeCore.pendingDamageAllocation).toMatchObject({
      sourceTitle: "电话铃声",
      playerId: "0",
      damageKind: "mental",
      amount: 1,
      originalAmount: 2,
      allowedTraits: ["knowledge", "sanity"],
    });
    expect(mentalTraitTotal(afterFinalizeCore, "0")).toBe(mentalBefore);

    const damageRollPanel = page.getByTestId("betrayal-recent-roll-panel");
    await expect(damageRollPanel).toHaveAttribute(
      "data-visible-dice-source",
      "event-rolled-damage",
    );
    await expect(
      damageRollPanel.getByTestId("betrayal-recent-roll-source-title"),
    ).toHaveCount(0);
    await expect(
      damageRollPanel.getByTestId("betrayal-recent-roll-outcome"),
    ).toHaveCount(0);
    await expect(
      damageRollPanel.getByTestId("betrayal-recent-roll-event-description"),
    ).toHaveText(
      "受到一颗骰子的精神伤害",
    );
    await expect(
      damageRollPanel.getByTestId("betrayal-recent-roll-event-description"),
    ).toHaveAttribute("data-result-role", "event-damage-description");
    await expect(
      damageRollPanel.getByTestId("betrayal-recent-roll-event-effect"),
    ).toHaveText("实际效果：造成 1 点精神伤害");
    await expect(
      damageRollPanel.getByTestId("betrayal-recent-roll-event-effect"),
    ).toHaveAttribute("data-result-role", "event-damage-effect");
    await expect(damageRollPanel.getByTestId("betrayal-recent-roll-total")).toContainText(
      "伤害骰合计 2",
    );
    await expect(damageRollPanel.getByTestId("betrayal-recent-roll-total")).not.toContainText(
      "事件总点数 2",
    );
    await expect(damageRollPanel.getByTestId("betrayal-recent-roll-total")).not.toContainText(
      /骰面合计|加值/,
    );
    await expect(damageRollPanel.getByTestId("betrayal-recent-roll-damage-dice")).toHaveCount(0);
    await expect(damageRollPanel.getByTestId("betrayal-recent-roll-effect-damage")).toHaveCount(0);
    const mentalDamageRollVisibleText = await readVisibleNonSrText(damageRollPanel);
    expect(mentalDamageRollVisibleText).not.toContain("电话铃声");
    expect((mentalDamageRollVisibleText.match(/受到一颗骰子的精神伤害/g) ?? [])).toHaveLength(1);
    expect((mentalDamageRollVisibleText.match(/实际效果：造成 1 点精神伤害/g) ?? [])).toHaveLength(1);
    expect(mentalDamageRollVisibleText).not.toContain("待分配 1 点精神伤害");
    expect(mentalDamageRollVisibleText).not.toContain("重新投掷的伤害骰");
    await expect(damageRollPanel.getByTestId("betrayal-recent-roll-breakdown")).toHaveCount(0);
    await expect(
      damageRollPanel.getByTestId("betrayal-reroll-prompt-outside-dice"),
    ).toHaveAttribute("aria-hidden", "true");
    await expect(
      damageRollPanel.getByTestId("betrayal-reroll-prompt-outside-dice"),
    ).toHaveText("");
    await expect(
      damageRollPanel.getByTestId("betrayal-house-dice-3d-group"),
    ).toHaveAttribute("data-dice-count", "1");
    await expect(
      damageRollPanel.getByTestId("betrayal-house-dice-3d-group"),
    ).toHaveAttribute("data-dice-rule-subtotal", "2");
    await expectVisiblePhysicalDiceBox(damageRollPanel);
    await waitForPhysicalDiceSettled(damageRollPanel);
    await expectPhysicalDiceSeparated(damageRollPanel, {
      minDiceCount: 1,
      minNormalizedCenterDistance: 0,
      minNormalizedCenterSpan: 0,
    });
    await expect(page.getByTestId("betrayal-damage-allocation-panel")).toHaveCount(0);
    await saveScreenshot(page, `${screenshotBase}/05-重新投掷一颗精神伤害骰.jpg`);
    await acknowledgeVisibleEventDamageRoll(
      page,
      "电话铃声精神伤害骰确认后才进入伤害分配",
    );

    const allocationPanel = page.getByTestId("betrayal-damage-allocation-panel");
    await expect(allocationPanel).toBeVisible();
    await expect(allocationPanel.getByTestId("betrayal-damage-allocation-source")).toContainText(
      "电话铃声",
    );
    await expect(
      allocationPanel.getByTestId("betrayal-damage-allocation-source"),
    ).toHaveAttribute("data-visible-source-owner", "discovery-card");
    await expect(
      allocationPanel.getByTestId("betrayal-damage-allocation-source"),
    ).toHaveClass(/sr-only/);
    await expect(allocationPanel.getByTestId("betrayal-damage-allocation-amount")).toContainText(
      "1 点精神伤害",
    );
    await expect(allocationPanel.getByTestId("betrayal-damage-allocation-reduction")).toContainText(
      "头戴耳机",
    );
    await expect(
      allocationPanel.getByTestId("betrayal-damage-allocation-trait-knowledge"),
    ).toBeEnabled();
    await expect(
      allocationPanel.getByTestId("betrayal-damage-allocation-trait-sanity"),
    ).toBeEnabled();
    await expect(
      allocationPanel.getByTestId("betrayal-damage-allocation-trait-might"),
    ).toHaveCount(0);
    await expect(
      allocationPanel.getByTestId("betrayal-damage-allocation-trait-speed"),
    ).toHaveCount(0);

    await resolveVisibleDamageAllocation(
      page,
      ["knowledge"],
      `${screenshotBase}/06-头戴耳机减伤后精神伤害分配面板.jpg`,
    );
    const afterSettleCore = await readCurrentCore(page);
    expect(afterSettleCore.pendingDamageAllocation).toBeNull();
    expect(mentalTraitTotal(afterSettleCore, "0")).toBe(mentalBefore - 1);
    const protectedExplorer = findE2eExplorer(afterSettleCore, "0");
    expect(protectedExplorer.traitTracks.knowledge.position).toBe(
      knowledgePositionBefore - 1,
    );
    expect(protectedExplorer.traitTracks.sanity.position).toBe(
      sanityPositionBefore,
    );
    await expect(radioShell).toHaveAttribute(
      "data-rules-summary",
      /受到精神伤害 -1/,
    );
    await saveScreenshot(
      page,
      `${screenshotBase}/07-头戴耳机减伤结算结果可见.jpg`,
    );

    await dismissDiscoveryPanel(page);
    await expect(page.getByTestId("betrayal-board")).toBeVisible();
    await expect(page.getByTestId("betrayal-discovery-panel")).toHaveCount(0);
    await expect(page.getByTestId("betrayal-event-choice-panel")).toHaveCount(
      0,
    );
    const closedCore = await readCurrentCore(page);
    expect(mentalTraitTotal(closedCore, "0")).toBe(mentalBefore - 1);
    expect(traitTrackPosition(closedCore, "0", "knowledge")).toBe(
      knowledgePositionBefore - 1,
    );
    expect(traitTrackPosition(closedCore, "0", "sanity")).toBe(
      sanityPositionBefore,
    );
    await expect(
      page.getByTestId("betrayal-room-occupant-ground-north-0"),
    ).toBeVisible();
    await expect(page.getByTestId("betrayal-action-rail")).toBeVisible();
    await expect(page.getByTestId("betrayal-action-endTurn")).toBeVisible();
    await saveScreenshot(page, `${screenshotBase}/08-关闭后回牌桌状态清空.jpg`);

    assertNoFatalFrontendErrors([
      { label: "betrayal-event-choice-头戴耳机精神减伤完整链路", diagnostics },
    ]);
  });

  async function runEventTraitCheckExtraDiceFullChain(
    page: Page,
    options: {
      itemId: "flashlight" | "lantern";
      itemName: "手电筒" | "灯笼";
      evidenceDir: string;
    },
  ) {
    test.setTimeout(120000);
    const diagnostics = attachPageDiagnostics(
      page,
      `betrayal-event-choice-${options.itemName}事件检定加骰完整链路`,
    );
    const alienGeometry = eventByName("外星几何");
    const core = createRuntimeCore();
    core.drawOrder = ["event"];
    core.eventOrder = [alienGeometry];
    core.deckCounts.event = core.eventOrder.length;
    pinGroundNorthToEventRoom(core);
    core.currentExplorer = {
      ...core.currentExplorer,
      traits: {
        ...core.currentExplorer.traits,
        knowledge: 3,
      },
      inventory: [{ id: options.itemId, name: options.itemName, kind: "item" }],
    };
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.currentExplorerInventory = [...core.currentExplorer.inventory];
    core.turnStartInventoryCardIds = [options.itemId];

    await injectCore(page, core);
    await expect(page.getByTestId("betrayal-board")).toBeVisible({
      timeout: 30000,
    });
    const itemShell = page.getByTestId(
      `betrayal-inventory-${options.itemId}-shell`,
    );
    await expect(itemShell).toBeVisible();
    await expect(itemShell).toHaveAttribute(
      "data-rules-summary",
      /事件属性检定额外投 2 骰/,
    );
    await saveScreenshot(
      page,
      `${options.evidenceDir}/01-${options.itemName}加骰前牌桌可操作.jpg`,
    );

    await page.getByTestId("betrayal-action-move").click();
    await page.getByTestId("betrayal-room-hallway").click();
    await expect(
      page.getByTestId("betrayal-room-ground-north"),
    ).toHaveAccessibleName(/未探索.*一层.*尚未翻出/);
    await expect(page.getByTestId("betrayal-action-explore")).toBeEnabled();
    await page.getByTestId("betrayal-action-explore").click();
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-north"),
    ).toBeVisible();
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-south"),
    ).toBeVisible();
    await saveScreenshot(page, `${options.evidenceDir}/02-选择未知房间前.jpg`);

    await setHarnessRandomQueue(page, [0.99, 0.99, 0.99, 0.99, 0.99]);
    await confirmGroundNorthRoomPlacement(page);
    await expect(page.getByTestId("betrayal-event-choice-panel")).toHaveCount(
      0,
    );
    const discoveryPanel = page.getByTestId("betrayal-discovery-panel");
    await expect(discoveryPanel).toBeVisible({ timeout: 30000 });
    await expect(discoveryPanel).toHaveAttribute(
      "aria-label",
      /事件牌 外星几何/,
    );
    await expect(
      page.getByTestId("betrayal-discovery-card-front-atlas"),
    ).toBeVisible();
    const discoveryDetail = page.getByTestId("betrayal-discovery-detail");
    await expect(discoveryDetail).toContainText("知识检定 10");
    await expect(discoveryDetail).toContainText("获得 1 点知识");
    await saveScreenshot(
      page,
      `${options.evidenceDir}/03-外星几何翻出并显示5骰知识检定.jpg`,
    );

    const rollPanel = discoveryPanel.getByTestId("betrayal-recent-roll-panel");
    await expect(rollPanel).toBeVisible();
    await expect(rollPanel).toContainText("知识检定");
    await expect(rollPanel).toContainText("总点数 10");
    await expect(
      page.getByTestId("betrayal-house-dice-3d-group"),
    ).toHaveAttribute("data-dice-count", "5");
    await expect(
      page.getByTestId("betrayal-house-dice-3d-group"),
    ).toHaveAttribute("data-dice-rule-subtotal", "10");
    await expectVisiblePhysicalDiceBox(rollPanel);
    await waitForPhysicalDiceSettled(rollPanel);
    await expectPhysicalDiceSeparated(rollPanel, { minDiceCount: 5 });
    await saveScreenshot(
      page,
      `${options.evidenceDir}/04-5骰事件检定骰盘停稳.jpg`,
    );

    const afterSettleCore = await readCurrentCore(page);
    expect(afterSettleCore.recentRoll?.dice).toHaveLength(5);
    expect(afterSettleCore.currentExplorer.traits.knowledge).toBe(4);
    await expect(itemShell).toHaveAttribute(
      "data-rules-summary",
      /事件属性检定额外投 2 骰/,
    );
    await saveScreenshot(
      page,
      `${options.evidenceDir}/05-加骰结算结果可见.jpg`,
    );

    await dismissDiscoveryPanel(page);
    await expect(page.getByTestId("betrayal-board")).toBeVisible();
    await expect(page.getByTestId("betrayal-discovery-panel")).toHaveCount(0);
    await expect(page.getByTestId("betrayal-event-choice-panel")).toHaveCount(
      0,
    );
    const closedCore = await readCurrentCore(page);
    expect(closedCore.currentExplorer.traits.knowledge).toBe(4);
    await expect(
      page.getByTestId("betrayal-room-occupant-ground-north-0"),
    ).toBeVisible();
    await expect(page.getByTestId("betrayal-action-rail")).toBeVisible();
    await expect(page.getByTestId("betrayal-action-endTurn")).toBeVisible();
    await saveScreenshot(
      page,
      `${options.evidenceDir}/06-关闭后回牌桌状态清空.jpg`,
    );

    assertNoFatalFrontendErrors([
      {
        label: `betrayal-event-choice-${options.itemName}事件检定加骰完整链路`,
        diagnostics,
      },
    ]);
  }

  test("手电筒真实链路从外星几何翻牌到事件检定额外加骰结算关闭", async ({
    page,
  }) => {
    await runEventTraitCheckExtraDiceFullChain(page, {
      itemId: "flashlight",
      itemName: "手电筒",
      evidenceDir: FLASHLIGHT_EVIDENCE_DIR,
    });
  });

  test("灯笼真实链路从外星几何翻牌到事件检定额外加骰结算关闭", async ({
    page,
  }) => {
    await runEventTraitCheckExtraDiceFullChain(page, {
      itemId: "lantern",
      itemName: "灯笼",
      evidenceDir: LANTERN_EVIDENCE_DIR,
    });
  });

  test("魔法相机真实链路从外星几何翻牌到知识检定改用神志结算关闭", async ({
    page,
  }) => {
    test.setTimeout(120000);
    const diagnostics = attachPageDiagnostics(
      page,
      "betrayal-event-choice-魔法相机知识检定替代完整链路",
    );
    const alienGeometry = eventByName("外星几何");
    const core = createRuntimeCore();
    core.drawOrder = ["event"];
    core.eventOrder = [alienGeometry];
    core.currentExplorer = {
      ...core.currentExplorer,
      traits: {
        ...core.currentExplorer.traits,
        knowledge: 3,
        sanity: 5,
      },
      inventory: [{ id: "camera", name: "魔法相机", kind: "item" }],
    };
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.currentExplorerInventory = [...core.currentExplorer.inventory];
    core.turnStartInventoryCardIds = ["camera"];

    await injectCore(page, core);
    await expect(page.getByTestId("betrayal-board")).toBeVisible({
      timeout: 30000,
    });
    const cameraShell = page.getByTestId("betrayal-inventory-camera-shell");
    await expect(cameraShell).toBeVisible();
    await expect(cameraShell).toHaveAttribute(
      "data-rules-summary",
      /知识检定可用神志替代/,
    );
    await expect(page.getByTestId("betrayal-action-use")).toBeDisabled();
    await saveScreenshot(
      page,
      `${MAGIC_CAMERA_EVIDENCE_DIR}/01-魔法相机替代前牌桌可操作.jpg`,
    );

    await page.getByTestId("betrayal-action-move").click();
    await page.getByTestId("betrayal-room-hallway").click();
    await expect(
      page.getByTestId("betrayal-room-ground-north"),
    ).toHaveAccessibleName(/未探索.*一层.*尚未翻出/);
    await expect(page.getByTestId("betrayal-action-explore")).toBeEnabled();
    await page.getByTestId("betrayal-action-explore").click();
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-north"),
    ).toBeVisible();
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-south"),
    ).toBeVisible();
    await saveScreenshot(
      page,
      `${MAGIC_CAMERA_EVIDENCE_DIR}/02-选择未知房间前.jpg`,
    );

    await setHarnessRandomQueue(page, [0.99, 0.99, 0.99, 0.99, 0.99]);
    await confirmGroundNorthRoomPlacement(page);
    await expect(page.getByTestId("betrayal-event-choice-panel")).toHaveCount(
      0,
    );
    const discoveryPanel = page.getByTestId("betrayal-discovery-panel");
    await expect(discoveryPanel).toBeVisible({ timeout: 30000 });
    await expect(discoveryPanel).toHaveAttribute(
      "aria-label",
      /事件牌 外星几何/,
    );
    await expect(
      page.getByTestId("betrayal-discovery-card-front-atlas"),
    ).toBeVisible();
    const discoveryDetail = page.getByTestId("betrayal-discovery-detail");
    await expect(discoveryDetail).toContainText("知识检定 10");
    await expect(discoveryDetail).toContainText("获得 1 点知识");
    await saveScreenshot(
      page,
      `${MAGIC_CAMERA_EVIDENCE_DIR}/03-外星几何翻出并显示5骰知识检定.jpg`,
    );

    const rollPanel = discoveryPanel.getByTestId("betrayal-recent-roll-panel");
    await expect(rollPanel).toBeVisible();
    await expect(rollPanel).toContainText("知识检定");
    await expect(rollPanel).toContainText("总点数 10");
    await expect(
      page.getByTestId("betrayal-house-dice-3d-group"),
    ).toHaveAttribute("data-dice-count", "5");
    await expect(
      page.getByTestId("betrayal-house-dice-3d-group"),
    ).toHaveAttribute("data-dice-rule-subtotal", "10");
    await expectVisiblePhysicalDiceBox(rollPanel);
    await waitForPhysicalDiceSettled(rollPanel);
    await expectPhysicalDiceSeparated(rollPanel, { minDiceCount: 5 });
    await saveScreenshot(
      page,
      `${MAGIC_CAMERA_EVIDENCE_DIR}/04-5骰相机替代检定骰盘停稳.jpg`,
    );

    const afterSettleCore = await readCurrentCore(page);
    expect(afterSettleCore.recentRoll?.dice).toHaveLength(5);
    expect(afterSettleCore.currentExplorer.traits.knowledge).toBe(4);
    expect(afterSettleCore.currentExplorer.traits.sanity).toBe(5);
    expect(afterSettleCore.currentExplorer.inventory).toContainEqual({
      id: "camera",
      name: "魔法相机",
      kind: "item",
    });
    expect(afterSettleCore.usedCardIdsThisTurn).not.toContain("camera");
    await expect(cameraShell).toHaveAttribute(
      "data-rules-summary",
      /知识检定可用神志替代/,
    );
    await saveScreenshot(
      page,
      `${MAGIC_CAMERA_EVIDENCE_DIR}/05-魔法相机替代检定结算结果可见.jpg`,
    );

    await dismissDiscoveryPanel(page);
    await expect(page.getByTestId("betrayal-board")).toBeVisible();
    await expect(page.getByTestId("betrayal-discovery-panel")).toHaveCount(0);
    await expect(page.getByTestId("betrayal-event-choice-panel")).toHaveCount(
      0,
    );
    const closedCore = await readCurrentCore(page);
    expect(closedCore.currentExplorer.traits.knowledge).toBe(4);
    expect(closedCore.currentExplorer.traits.sanity).toBe(5);
    await expect(
      page.getByTestId("betrayal-room-occupant-ground-north-0"),
    ).toBeVisible();
    await expect(page.getByTestId("betrayal-action-rail")).toBeVisible();
    await expect(page.getByTestId("betrayal-action-endTurn")).toBeVisible();
    await saveScreenshot(
      page,
      `${MAGIC_CAMERA_EVIDENCE_DIR}/06-关闭后回牌桌状态清空.jpg`,
    );

    assertNoFatalFrontendErrors([
      {
        label: "betrayal-event-choice-魔法相机知识检定替代完整链路",
        diagnostics,
      },
    ]);
  });

  test("书本真实链路从本体使用到小丑房间非战斗检定替代结算关闭", async ({
    page,
  }) => {
    test.setTimeout(120000);
    const diagnostics = attachPageDiagnostics(
      page,
      "betrayal-event-choice-书本非战斗检定替代完整链路",
    );
    const clownRoom = eventByName("小丑房间");
    const core = createRuntimeCore();
    core.drawOrder = ["event"];
    core.eventOrder = [clownRoom];
    core.currentExplorer = {
      ...core.currentExplorer,
      traits: {
        ...core.currentExplorer.traits,
        knowledge: 5,
        sanity: 2,
      },
      inventory: [{ id: "omen-book", name: "书本", kind: "omen" }],
    };
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.currentExplorerInventory = [...core.currentExplorer.inventory];
    core.turnStartInventoryCardIds = ["omen-book"];

    await injectCore(page, core);
    await expect(page.getByTestId("betrayal-board")).toBeVisible({
      timeout: 30000,
    });
    const bookCard = page.getByTestId("betrayal-inventory-omen-book");
    const bookShell = page.getByTestId("betrayal-inventory-omen-book-shell");
    await expect(bookCard).toBeVisible();
    await expect(bookShell).toHaveAttribute(
      "data-rules-summary",
      /下一次非战斗检定可用知识替换/,
    );
    await expect(page.getByTestId("betrayal-action-use")).toBeDisabled();
    await saveScreenshot(
      page,
      `${OMEN_BOOK_EVIDENCE_DIR}/01-书本使用前牌桌可操作.jpg`,
    );

    await bookCard.click();
    await expect(
      page.getByTestId("betrayal-selected-inventory-card-name"),
    ).toContainText("书本");
    await expect(page.getByTestId("betrayal-action-use")).toBeEnabled();
    await saveScreenshot(
      page,
      `${OMEN_BOOK_EVIDENCE_DIR}/02-书本本体已选中准备使用.jpg`,
    );

    await page.getByTestId("betrayal-action-use").click();
    await expect(
      page.getByTestId("betrayal-selected-inventory-card-name"),
    ).toHaveCount(0);
    const afterUseCore = await readCurrentCore(page);
    expect(afterUseCore.currentExplorer.traits.sanity).toBe(1);
    expect(afterUseCore.usedCardIdsThisTurn).toContain("omen-book");
    expect(afterUseCore.nextNonCombatTraitReplacement).toMatchObject({
      playerId: "0",
      sourceCardId: "omen-book",
      replacementTrait: "knowledge",
    });
    await expect(
      page.getByTestId("betrayal-room-latest-feedback"),
    ).toContainText("本回合下一次非战斗检定可用知识替换");

    await page.getByTestId("betrayal-action-move").click();
    await page.getByTestId("betrayal-room-hallway").click();
    await expect(
      page.getByTestId("betrayal-room-ground-north"),
    ).toHaveAccessibleName(/未探索.*一层.*尚未翻出/);
    await expect(page.getByTestId("betrayal-action-explore")).toBeEnabled();
    await page.getByTestId("betrayal-action-explore").click();
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-north"),
    ).toBeVisible();
    await saveScreenshot(
      page,
      `${OMEN_BOOK_EVIDENCE_DIR}/03-书本已使用并选择未知房间前.jpg`,
    );

    await setHarnessRandomQueue(page, [0.99, 0.99, 0.99, 0.99, 0.99]);
    await confirmGroundNorthRoomPlacement(page);
    await expect(page.getByTestId("betrayal-event-choice-panel")).toHaveCount(
      0,
    );
    const discoveryPanel = page.getByTestId("betrayal-discovery-panel");
    await expect(discoveryPanel).toBeVisible({ timeout: 30000 });
    await expect(discoveryPanel).toHaveAttribute(
      "aria-label",
      /事件牌 小丑房间/,
    );
    await expect(
      page.getByTestId("betrayal-discovery-card-front-atlas"),
    ).toBeVisible();
    const discoveryDetail = page.getByTestId("betrayal-discovery-detail");
    await expect(discoveryDetail).toContainText("神志检定 10");
    await expect(discoveryDetail).toContainText("无事发生");
    const rollPanel = discoveryPanel.getByTestId("betrayal-recent-roll-panel");
    await expect(rollPanel).toBeVisible();
    await expect(rollPanel).toContainText("神志检定");
    await expect(rollPanel).toContainText("总点数 10");
    await expect(
      page.getByTestId("betrayal-house-dice-3d-group"),
    ).toHaveAttribute("data-dice-count", "5");
    await expect(
      page.getByTestId("betrayal-house-dice-3d-group"),
    ).toHaveAttribute("data-dice-rule-subtotal", "10");
    await expectVisiblePhysicalDiceBox(rollPanel);
    await waitForPhysicalDiceSettled(rollPanel);
    await expectPhysicalDiceSeparated(rollPanel, { minDiceCount: 5 });
    await saveScreenshot(
      page,
      `${OMEN_BOOK_EVIDENCE_DIR}/04-小丑房间5骰神志检定停稳.jpg`,
    );

    const afterRollCore = await readCurrentCore(page);
    expect(afterRollCore.recentRoll?.dice).toHaveLength(5);
    expect(afterRollCore.currentExplorer.traits.sanity).toBe(1);
    expect(afterRollCore.nextNonCombatTraitReplacement).toBeNull();
    await expect(bookShell).toHaveAttribute(
      "data-rules-summary",
      /知识检定 \+1/,
    );
    await saveScreenshot(
      page,
      `${OMEN_BOOK_EVIDENCE_DIR}/05-书本替代检定结算结果可见.jpg`,
    );

    await dismissDiscoveryPanel(page);
    await expect(page.getByTestId("betrayal-board")).toBeVisible();
    await expect(page.getByTestId("betrayal-discovery-panel")).toHaveCount(0);
    await expect(page.getByTestId("betrayal-event-choice-panel")).toHaveCount(
      0,
    );
    const closedCore = await readCurrentCore(page);
    expect(closedCore.currentExplorer.traits.sanity).toBe(1);
    expect(closedCore.nextNonCombatTraitReplacement).toBeNull();
    await expect(
      page.getByTestId("betrayal-room-occupant-ground-north-0"),
    ).toBeVisible();
    await expect(page.getByTestId("betrayal-action-rail")).toBeVisible();
    await expect(page.getByTestId("betrayal-action-endTurn")).toBeVisible();
    await saveScreenshot(
      page,
      `${OMEN_BOOK_EVIDENCE_DIR}/06-关闭后回牌桌状态清空.jpg`,
    );

    assertNoFatalFrontendErrors([
      {
        label: "betrayal-event-choice-书本非战斗检定替代完整链路",
        diagnostics,
      },
    ]);
  });

  test("一条秘密通道真实链路从探索翻牌到检定后选房间结算关闭", async ({
    page,
  }) => {
    test.setTimeout(120000);
    const diagnostics = attachPageDiagnostics(
      page,
      "betrayal-event-choice-一条秘密通道-完整链路",
    );
    const screenshotBase = `${EVIDENCE_DIR}/一条秘密通道-完整链路`;
    const secretPassage = eventByName("一条秘密通道");
    const core = createRuntimeCore();
    core.drawOrder = ["event"];
    core.eventOrder = [secretPassage];
    core.currentExplorer = {
      ...core.currentExplorer,
      traits: {
        ...core.currentExplorer.traits,
        knowledge: 4,
        sanity: 4,
      },
      inventory: [],
    };
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.currentExplorerInventory = [];

    await injectCore(page, core);
    await expect(page.getByTestId("betrayal-board")).toBeVisible({
      timeout: 30000,
    });

    await page.getByTestId("betrayal-action-move").click();
    await page.getByTestId("betrayal-room-hallway").click();
    await expect(
      page.getByTestId("betrayal-room-ground-north"),
    ).toHaveAccessibleName(/未探索.*一层.*尚未翻出/);
    await expect(page.getByTestId("betrayal-action-explore")).toBeEnabled();
    await saveScreenshot(page, `${screenshotBase}-01-探索前.jpg`);

    await page.getByTestId("betrayal-action-explore").click();
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-north"),
    ).toBeVisible();
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-south"),
    ).toBeVisible();
    await saveScreenshot(page, `${screenshotBase}-02-选择未知房间.jpg`);

    await setHarnessRandomQueue(page, [0.99, 0.99, 0.99, 0.99]);
    await confirmGroundNorthRoomPlacement(page);
    const eventChoicePanel = page.getByTestId("betrayal-event-choice-panel");
    await expect(eventChoicePanel).toHaveAttribute(
      "aria-label",
      "一条秘密通道",
    );
    await expect(
      page.getByTestId("betrayal-event-choice-card-front-atlas"),
    ).toBeVisible();
    const rollPanel = page.getByTestId("betrayal-recent-roll-panel");
    await expect(rollPanel).toBeVisible();
    await expect(rollPanel).toContainText("知识检定");
    await expect(rollPanel).toContainText(
      "在任意另一板块放置另一个秘密通道标志物",
    );
    await expect(
      page.getByTestId("betrayal-room-event-choice-target-hallway"),
    ).toBeVisible();
    await expect(
      page.getByTestId("betrayal-event-choice-confirm"),
      "一条秘密通道没有二选一语义，最终提交应由真实房间点击完成，不能先露出额外确认按钮",
    ).toHaveCount(0);
    await saveScreenshot(
      page,
      `${screenshotBase}-03-事件牌翻出已有知识检定.jpg`,
    );

    await page.getByTestId("betrayal-room-hallway").click();
    await expect(eventChoicePanel).toBeHidden({ timeout: 30000 });
    const discoveryPanel = page.getByTestId("betrayal-discovery-panel");
    await expect(discoveryPanel).toBeVisible();
    const discoveryDetail = page.getByTestId("betrayal-discovery-detail");
    await expect(discoveryDetail).toContainText("在当前板块放置秘密通道标志物");
    await expect(discoveryDetail).toContainText("在门厅放置秘密通道标志物");
    await expect(discoveryDetail).toContainText("知识 +1");
    await expect(
      discoveryPanel.getByTestId("betrayal-recent-roll-panel"),
    ).toBeVisible();
    await expect(
      discoveryPanel.getByTestId("betrayal-recent-roll-panel"),
    ).toContainText("知识检定");
    await expect(
      page.getByTestId("betrayal-room-marker-ground-north-secret-passage"),
    ).toBeVisible();
    await expect(
      page.getByTestId("betrayal-room-marker-hallway-secret-passage"),
    ).toBeVisible();
    await saveScreenshot(page, `${screenshotBase}-05-结算结果可见.jpg`);

    await page.getByTestId("betrayal-discovery-continue").click();
    await expect(page.getByTestId("betrayal-board")).toBeVisible();
    await expect(page.getByTestId("betrayal-discovery-panel")).toHaveCount(0);
    await expect(page.getByTestId("betrayal-recent-roll-panel")).toHaveCount(0);
    await expect(page.getByTestId("betrayal-event-choice-panel")).toHaveCount(
      0,
    );
    await expect(
      page.getByTestId("betrayal-room-marker-ground-north-secret-passage"),
    ).toBeVisible();
    await expect(
      page.getByTestId("betrayal-room-marker-hallway-secret-passage"),
    ).toBeVisible();
    await saveScreenshot(page, `${screenshotBase}-06-关闭后.jpg`);

    assertNoFatalFrontendErrors([
      { label: "betrayal-event-choice-一条秘密通道-完整链路", diagnostics },
    ]);
  });

  test("移动端横屏一条秘密通道完整链路从移动探索到选择结算关闭", async ({
    page,
  }) => {
    test.setTimeout(120000);
    const diagnostics = attachPageDiagnostics(
      page,
      "betrayal-event-choice-mobile-secret-passage-full-chain",
    );
    const screenshotBase = `${EVIDENCE_DIR}/移动端横屏-一条秘密通道-完整链路`;
    const secretPassage = eventByName("一条秘密通道");
    const core = createRuntimeCore();
    core.drawOrder = ["event"];
    core.eventOrder = [secretPassage];
    core.currentExplorer = {
      ...core.currentExplorer,
      traits: {
        ...core.currentExplorer.traits,
        knowledge: 4,
        sanity: 4,
      },
      inventory: [],
    };
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.currentExplorerInventory = [];

    await page.setViewportSize(MOBILE_LANDSCAPE_REFERENCE_VIEWPORT);
    await page.goto("/play/betrayal?bgForceCoarsePointer=1", {
      waitUntil: "domcontentloaded",
    });
    await waitForBetrayalPageReady(page);
    await injectCore(page, core);
    await expect(page.getByTestId("betrayal-board")).toBeVisible({
      timeout: 30000,
    });
    await expect(page.locator("html")).toHaveAttribute(
      "data-mobile-layout-preset",
      "map-shell",
    );
    await expect(
      page.getByTestId("betrayal-mobile-landscape-layout"),
    ).toBeVisible();
    await expect(page.getByTestId("betrayal-mobile-action-rail")).toBeVisible();
    await expect(page.getByTestId("betrayal-mobile-dock-move")).toBeVisible();
    await expect(
      page.getByTestId("betrayal-mobile-dock-explore"),
    ).toBeVisible();
    await expectMobilePrimaryMapFocus(page, "移动端一条秘密通道初始牌桌");
    await saveScreenshot(page, `${screenshotBase}-01-移动端牌桌入口.jpg`);

    await page.getByTestId("betrayal-mobile-dock-move").click();
    await page.getByTestId("betrayal-room-hallway").click();
    await expect(
      page.getByTestId("betrayal-room-occupant-hallway-0"),
    ).toBeVisible();
    await expect(
      page.getByTestId("betrayal-room-ground-north"),
    ).toHaveAccessibleName(/未探索.*一层.*可探索/);
    await expect(
      page.getByTestId("betrayal-mobile-dock-explore"),
    ).toBeEnabled();
    await saveScreenshot(page, `${screenshotBase}-02-移动后可探索.jpg`);

    await page.getByTestId("betrayal-mobile-dock-explore").click();
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-north"),
    ).toBeVisible();
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-south"),
    ).toBeVisible();
    await saveScreenshot(page, `${screenshotBase}-03-选择未知房间.jpg`);

    await setHarnessRandomQueue(page, [0.99, 0.99, 0.99, 0.99]);
    await confirmGroundNorthRoomPlacement(page);
    const eventChoicePanel = page.getByTestId("betrayal-event-choice-panel");
    await expect(eventChoicePanel).toHaveAttribute(
      "aria-label",
      "一条秘密通道",
    );
    await expect(
      page.getByTestId("betrayal-event-choice-card-front-atlas"),
    ).toBeVisible();
    const rollPanel = page.getByTestId("betrayal-recent-roll-panel");
    await expect(rollPanel).toBeVisible();
    await expect(rollPanel).toContainText("知识检定");
    await expect(rollPanel).toContainText("总点数 8");
    await expect(rollPanel).toContainText(
      "在任意另一板块放置另一个秘密通道标志物",
    );
    await expectMobileEventChoiceLayout(page, "移动端一条秘密通道翻牌选择态");
    await expectVisiblePhysicalDiceBox(rollPanel);
    await waitForPhysicalDiceSettled(rollPanel);
    await expectPhysicalDiceSeparated(rollPanel, {
      minDiceCount: 4,
      minCanvasClientWidth: 240,
      minCanvasClientHeight: 200,
    });
    await expectMobileDiceBoxStable(rollPanel, "移动端一条秘密通道选择态");
    await expect(
      page.getByTestId("betrayal-room-event-choice-target-hallway"),
    ).toBeVisible();
    await expect(
      page.getByTestId("betrayal-event-choice-confirm"),
      "移动端一条秘密通道没有二选一语义，最终提交应由真实房间点击完成，不能先露出额外确认按钮",
    ).toHaveCount(0);
    await saveScreenshot(page, `${screenshotBase}-04-事件牌投骰和选择同屏.jpg`);

    await page.getByTestId("betrayal-room-hallway").click();
    await expect(eventChoicePanel).toBeHidden({ timeout: 30000 });
    const discoveryPanel = page.getByTestId("betrayal-discovery-panel");
    await expect(discoveryPanel).toBeVisible();
    const discoveryDetail = page.getByTestId("betrayal-discovery-detail");
    await expect(discoveryDetail).toContainText("在当前板块放置秘密通道标志物");
    await expect(discoveryDetail).toContainText("在门厅放置秘密通道标志物");
    await expect(discoveryDetail).toContainText("知识 +1");
    const discoveryRollPanel = discoveryPanel.getByTestId(
      "betrayal-recent-roll-panel",
    );
    await expect(discoveryRollPanel).toBeVisible();
    await expect(discoveryRollPanel).toContainText("知识检定");
    await expectMobileDiscoveryRollLayout(page, "移动端一条秘密通道结算态");
    await expectMobileDiceBoxStable(
      discoveryRollPanel,
      "移动端一条秘密通道结算态",
    );
    await expect(
      page.getByTestId("betrayal-room-marker-ground-north-secret-passage"),
    ).toBeVisible();
    await expect(
      page.getByTestId("betrayal-room-marker-hallway-secret-passage"),
    ).toBeVisible();
    await saveScreenshot(page, `${screenshotBase}-06-结算结果可读.jpg`);

    await page.getByTestId("betrayal-discovery-continue").click();
    await expect(page.getByTestId("betrayal-board")).toBeVisible();
    await expect(page.getByTestId("betrayal-discovery-panel")).toHaveCount(0);
    await expect(page.getByTestId("betrayal-recent-roll-panel")).toHaveCount(0);
    await expect(page.getByTestId("betrayal-event-choice-panel")).toHaveCount(
      0,
    );
    await expect(page.getByTestId("betrayal-mobile-action-rail")).toBeVisible();
    await expect(
      page.getByTestId("betrayal-room-marker-ground-north-secret-passage"),
    ).toBeVisible();
    await expect(
      page.getByTestId("betrayal-room-marker-hallway-secret-passage"),
    ).toBeVisible();
    await saveScreenshot(page, `${screenshotBase}-07-关闭后回牌桌.jpg`);

    assertNoFatalFrontendErrors([
      {
        label: "betrayal-event-choice-mobile-secret-passage-full-chain",
        diagnostics,
      },
    ]);
  });

  test("移动端横屏蜘蛛事件保持 PC 弹窗同构完整链路", async ({ page }) => {
    test.setTimeout(180000);
    const diagnostics = attachPageDiagnostics(
      page,
      "betrayal-event-choice-mobile-spider-pc-like-layout",
    );
    const screenshotBase = `${EVIDENCE_DIR}/移动端横屏-蜘蛛-PC同构弹窗`;
    const spider = eventByName("蜘蛛！");
    const core = createRuntimeCore();
    core.drawOrder = ["event"];
    core.eventOrder = [spider];
    core.currentExplorer = {
      ...core.currentExplorer,
      traits: {
        ...core.currentExplorer.traits,
        sanity: 4,
        speed: 4,
      },
      inventory: [],
    };
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.currentExplorerInventory = [];

    await page.setViewportSize(MOBILE_LANDSCAPE_REFERENCE_VIEWPORT);
    await page.goto("/play/betrayal?bgForceCoarsePointer=1", {
      waitUntil: "domcontentloaded",
    });
    await waitForBetrayalPageReady(page);
    await injectCore(page, core);
    await expect(page.getByTestId("betrayal-board")).toBeVisible({
      timeout: 30000,
    });
    await expect(page.locator("html")).toHaveAttribute(
      "data-mobile-layout-preset",
      "map-shell",
    );
    await expect(
      page.getByTestId("betrayal-mobile-landscape-layout"),
    ).toBeVisible();
    await expectMobilePrimaryMapFocus(page, "移动端蜘蛛初始牌桌");

    await page.getByTestId("betrayal-mobile-dock-move").click();
    await page.getByTestId("betrayal-room-hallway").click();
    await expect(
      page.getByTestId("betrayal-room-occupant-hallway-0"),
    ).toBeVisible();
    await expect(
      page.getByTestId("betrayal-mobile-dock-explore"),
    ).toBeEnabled();
    await page.getByTestId("betrayal-mobile-dock-explore").click();
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-north"),
    ).toBeVisible();
    await saveScreenshot(page, `${screenshotBase}-01-选择未知房间.jpg`);

    await setHarnessRandomQueue(page, [0.6, 0.6, 0.6, 0.6]);
    await page.getByTestId("betrayal-room-ground-north").click();
    await expect(page.getByTestId("betrayal-room-placement-panel")).toBeVisible();
    await saveScreenshot(
      page,
      `${screenshotBase}-01a-确认房间朝向放置事件房.jpg`,
    );
    await page.getByTestId("betrayal-room-placement-confirm").click();
    const eventChoicePanel = page.getByTestId("betrayal-event-choice-panel");
    await expect(eventChoicePanel).toHaveAttribute("aria-label", "蜘蛛！");
    await expect(
      page.getByTestId("betrayal-event-choice-card-front-atlas"),
    ).toBeVisible();
    const rollPanel = page.getByTestId("betrayal-recent-roll-panel");
    await expect(rollPanel).toBeVisible();
    await expect(rollPanel).toContainText("神志检定");
    await expect(rollPanel).toContainText("总点数 4");
    await expect(rollPanel).toContainText("获得 1 点神志或速度");
    await expect(
      page.getByTestId("betrayal-event-choice-trait-sanity"),
    ).toBeVisible();
    await expect(
      page.getByTestId("betrayal-event-choice-trait-speed"),
    ).toBeVisible();
    await expectMobileEventChoiceLayout(page, "移动端蜘蛛翻牌选择态");
    await expectVisiblePhysicalDiceBox(rollPanel);
    await waitForPhysicalDiceSettled(rollPanel);
    await expectPhysicalDiceSeparated(rollPanel, {
      minDiceCount: 4,
      minCanvasClientWidth: 240,
      minCanvasClientHeight: 160,
      minDieVisualSize: 32,
    });
    await expectMobileDiceBoxStable(rollPanel, "移动端蜘蛛选择态");
    await expect(
      page.getByTestId("betrayal-event-choice-confirm"),
      "移动端蜘蛛没有二选一语义，选择态不应露出额外确认按钮",
    ).toHaveCount(0);
    await saveScreenshot(
      page,
      `${screenshotBase}-02-事件牌骰盘和横排选项同屏.jpg`,
    );

    const mobileBeforeChoiceCore = await readCurrentCore(page);
    const mobileSpeedPositionBefore =
      mobileBeforeChoiceCore.currentExplorer.traitTracks.speed.position;
    await page.getByTestId("betrayal-event-choice-trait-speed").click();
    const mobileRoomTarget = page.getByTestId(
      "betrayal-room-event-choice-target-hallway",
    );
    await expect(mobileRoomTarget).toBeVisible();
    await expect(mobileRoomTarget).toHaveAttribute(
      "data-event-target-selected",
      "false",
    );
    await expect(
      page.getByTestId("betrayal-event-choice-rooms"),
      "移动端不能在事件选择面板里新增“地图 / 门厅”代理目标块，目标必须由地图房间本体承接",
    ).toHaveCount(0);
    await expect(
      page.getByTestId("betrayal-event-choice-room-hallway"),
      "移动端不能用“门厅”文字块替代真实地图房间点击",
    ).toHaveCount(0);
    await expect(
      page.locator('[data-testid^="betrayal-room-event-choice-target-label-"]'),
      "移动端不能给地图目标额外叠“点门厅/已选门厅”这类 PC 没有的标签",
    ).toHaveCount(0);
    await expect(
      page.getByTestId("betrayal-event-choice-room-instruction"),
      "移动端不能新增 PC 没有的房间说明正文",
    ).toHaveCount(0);
    await expect(
      page.getByTestId("betrayal-event-choice-confirm"),
      "移动端蜘蛛选择速度后还未点最终房间，也不应出现额外确认按钮",
    ).toHaveCount(0);
    await expectEventMapTargetSelectionForeground(
      page,
      "移动端蜘蛛4+效果处理中选择相邻房间",
      "betrayal-room-event-choice-target-hallway",
      "betrayal-room-hallway",
    );
    await saveScreenshot(
      page,
      `${screenshotBase}-03-4+效果处理中选择相邻房间.jpg`,
    );

    await page.getByTestId("betrayal-room-hallway").click();
    await expect(eventChoicePanel).toBeHidden({ timeout: 30000 });
    await expect(
      page.getByTestId("betrayal-discovery-panel"),
      "移动端蜘蛛点选最终房间后不应再打开只含返回牌桌的结果特写",
    ).toHaveCount(0);
    await expect(
      page.getByTestId("betrayal-discovery-continue"),
      "移动端蜘蛛点选最终房间后不应要求再点一次返回牌桌",
    ).toHaveCount(0);
    await expect(page.getByTestId("betrayal-board")).toBeVisible();
    await expect(page.getByTestId("betrayal-room-hallway")).toBeVisible();
    await saveScreenshot(
      page,
      `${screenshotBase}-04-点击门厅后直接回牌桌.jpg`,
    );
    const mobileSettledCore = await readCurrentCore(page);
    expect(mobileSettledCore.pendingEventChoice).toBeNull();
    expect(
      mobileSettledCore.currentExplorer.traitTracks.speed.position,
      "移动端蜘蛛效果处理完成后必须真实让速度轨道前进 1 格，不得只显示结果文案",
    ).toBe(mobileSpeedPositionBefore + 1);
    expect(
      mobileSettledCore.currentExplorerTraits.speed,
      "移动端蜘蛛效果处理完成后 UI 属性快照必须同步真实速度数值",
    ).toBe(mobileSettledCore.currentExplorer.traits.speed);
    expect(
      mobileSettledCore.currentExplorer.roomId,
      "移动端蜘蛛效果处理完成后探索者必须真实放置到所选相邻板块",
    ).toBe("hallway");
    expect(mobileSettledCore.activeRoomId).toBe("hallway");
    expect(mobileSettledCore.recommendedAction).toBe("endTurn");
    expect(mobileSettledCore.turnEndedByDiscovery).toBe(true);
    await expect(page.getByTestId("betrayal-event-choice-panel")).toHaveCount(
      0,
    );
    await expect(
      page.getByTestId("betrayal-room-occupant-hallway-0"),
      "移动端蜘蛛点选最终房间后，探索者 token 必须留在所选门厅房间",
    ).toBeVisible();

    assertNoFatalFrontendErrors([
      {
        label: "betrayal-event-choice-mobile-spider-pc-like-layout",
        diagnostics,
      },
    ]);
  });

  test("脑状食品真实链路从探索翻牌到检定后选属性结算关闭", async ({ page }) => {
    test.setTimeout(120000);
    const diagnostics = attachPageDiagnostics(
      page,
      "betrayal-event-choice-脑状食品-完整链路",
    );
    const screenshotBase = `${EVIDENCE_DIR}/脑状食品-完整链路`;
    const brainFood = eventByName("脑状食品");
    const core = createRuntimeCore();
    core.drawOrder = ["event"];
    core.eventOrder = [brainFood];
    core.currentExplorer = {
      ...core.currentExplorer,
      traits: {
        ...core.currentExplorer.traits,
        might: 4,
        speed: 4,
        sanity: 4,
      },
      inventory: [],
    };
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.currentExplorerInventory = [];

    await injectCore(page, core);
    await expect(page.getByTestId("betrayal-board")).toBeVisible({
      timeout: 30000,
    });

    await page.getByTestId("betrayal-action-move").click();
    await page.getByTestId("betrayal-room-hallway").click();
    await expect(
      page.getByTestId("betrayal-room-ground-north"),
    ).toHaveAccessibleName(/未探索.*一层.*尚未翻出/);
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-north"),
    ).toHaveCount(0);
    await expect(page.getByTestId("betrayal-action-explore")).toBeEnabled();
    await saveScreenshot(page, `${screenshotBase}-01-探索前.jpg`);

    await page.getByTestId("betrayal-action-explore").click();
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-north"),
    ).toBeVisible();
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-south"),
    ).toBeVisible();
    await expect(
      page.getByTestId("betrayal-room-ground-north"),
    ).toHaveAccessibleName(/未探索.*一层.*可探索/);
    await saveScreenshot(page, `${screenshotBase}-02-选择未知房间.jpg`);

    await setHarnessRandomQueue(page, [0.99, 0.99, 0.99, 0.99]);
    await confirmGroundNorthRoomPlacement(page);
    const eventChoicePanel = page.getByTestId("betrayal-event-choice-panel");
    await expect(eventChoicePanel).toHaveAttribute("aria-label", "脑状食品");
    await expect(
      page.getByTestId("betrayal-event-choice-card-front-atlas"),
    ).toBeVisible();
    const rollPanel = page.getByTestId("betrayal-recent-roll-panel");
    await expect(rollPanel).toBeVisible();
    await expect(rollPanel).toContainText("力量检定");
    await expect(rollPanel).toContainText("总点数 8");
    await expect(rollPanel).toContainText("获得 1 点力量或速度");
    await expect(
      page.getByTestId("betrayal-house-dice-3d-group"),
    ).toHaveAttribute("data-dice-count", "4");
    await expect(
      page.getByTestId("betrayal-house-dice-3d-group"),
    ).toHaveAttribute("data-dice-rule-subtotal", "8");
    await expectVisiblePhysicalDiceBox(rollPanel);
    await waitForPhysicalDiceSettled(rollPanel);
    await expect(
      page.getByTestId("betrayal-event-choice-trait-might"),
    ).toBeVisible();
    await expect(
      page.getByTestId("betrayal-event-choice-trait-speed"),
    ).toBeVisible();
    await expect(
      page.getByTestId("betrayal-event-choice-confirm"),
      "脑状食品奖励没有二选一语义，最终提交应由奖励属性点击完成，不能先露出额外确认按钮",
    ).toHaveCount(0);
    await expectEventChoiceKeepsTurnBlocked(page, "脑状食品事件选择未处理前");
    await saveScreenshot(
      page,
      `${screenshotBase}-03-事件牌翻出已有力量检定.jpg`,
    );

    await page.getByTestId("betrayal-event-choice-trait-speed").click();
    await expect(eventChoicePanel).toBeHidden({ timeout: 30000 });
    const discoveryPanel = page.getByTestId("betrayal-discovery-panel");
    await expect(discoveryPanel).toBeVisible();
    const discoveryDetail = page.getByTestId("betrayal-discovery-detail");
    await expect(discoveryDetail).toContainText("速度 +1");
    await expectDiscoveryResultKeepsTurnBlocked(
      page,
      "脑状食品结算结果未关闭前",
    );
    await saveScreenshot(page, `${screenshotBase}-05-结算结果可见.jpg`);

    await dismissDiscoveryPanel(page);
    await expect(page.getByTestId("betrayal-board")).toBeVisible();
    await expect(page.getByTestId("betrayal-discovery-panel")).toHaveCount(0);
    await expect(page.getByTestId("betrayal-event-choice-panel")).toHaveCount(
      0,
    );
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-south"),
    ).toHaveCount(0);
    const closedCore = await readCurrentCore(page);
    expect(closedCore.currentPlayer).toBe("0");
    expect(closedCore.currentExplorer.playerId).toBe("0");
    expect(closedCore.recommendedAction).toBe("endTurn");
    expect(closedCore.turnEndedByDiscovery).toBe(true);
    await expect(page.getByTestId("betrayal-action-rail")).toBeVisible();
    await expect(page.getByTestId("betrayal-action-endTurn")).toBeVisible();
    await expect(page.getByTestId("betrayal-action-explore")).toHaveCount(0);
    await saveScreenshot(page, `${screenshotBase}-06-关闭后.jpg`);

    await page.getByTestId("betrayal-action-endTurn").click();
    await expect
      .poll(
        async () => {
          const nextCore = await readCurrentCore(page);
          return {
            currentPlayer: nextCore.currentPlayer,
            currentExplorerPlayerId: nextCore.currentExplorer.playerId,
            recommendedAction: nextCore.recommendedAction,
            recentRollKind: nextCore.recentRoll?.kind ?? null,
            turnEndedByDiscovery: nextCore.turnEndedByDiscovery,
          };
        },
        {
          message: "事件、投骰和结算读完并结束回合后才允许下一位玩家行动",
          timeout: 10000,
        },
      )
      .toMatchObject({
        currentPlayer: "1",
        currentExplorerPlayerId: "1",
        recommendedAction: "move",
        recentRollKind: null,
        turnEndedByDiscovery: false,
      });
    await expect(page.getByTestId("betrayal-action-move")).toBeVisible();
    await expect(page.getByTestId("betrayal-action-move")).toBeEnabled();
    await expect(page.getByTestId("betrayal-recent-roll-panel")).toHaveCount(0);
    await saveScreenshot(page, `${screenshotBase}-07-下一位行动者可移动.jpg`);

    assertNoFatalFrontendErrors([
      { label: "betrayal-event-choice-脑状食品-完整链路", diagnostics },
    ]);
  });

  test("蜘蛛真实链路从探索翻牌到检定后处理4+效果再关闭", async ({ page }) => {
    test.setTimeout(120000);
    const diagnostics = attachPageDiagnostics(
      page,
      "betrayal-event-choice-蜘蛛-完整链路",
    );
    const screenshotBase = `${EVIDENCE_DIR}/蜘蛛-完整链路`;
    const spider = eventByName("蜘蛛！");
    const core = createRuntimeCore();
    core.drawOrder = ["event"];
    core.eventOrder = [spider];
    core.currentExplorer = {
      ...core.currentExplorer,
      traits: {
        ...core.currentExplorer.traits,
        sanity: 4,
        speed: 4,
      },
      inventory: [],
    };
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.currentExplorerInventory = [];

    await injectCore(page, core);
    await expect(page.getByTestId("betrayal-board")).toBeVisible({
      timeout: 30000,
    });

    await page.getByTestId("betrayal-action-move").click();
    await page.getByTestId("betrayal-room-hallway").click();
    await expect(page.getByTestId("betrayal-room-ground-north")).toBeVisible();
    await expect(page.getByTestId("betrayal-action-explore")).toBeEnabled();
    await saveScreenshot(page, `${screenshotBase}-01-探索前.jpg`);

    await page.getByTestId("betrayal-action-explore").click();
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-north"),
    ).toBeVisible();
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-south"),
    ).toBeVisible();
    await saveScreenshot(page, `${screenshotBase}-02-选择未知房间.jpg`);

    await setHarnessRandomQueue(page, [0.6, 0.6, 0.6, 0.6]);
    await page.getByTestId("betrayal-room-ground-north").click();
    await expect(page.getByTestId("betrayal-room-placement-panel")).toBeVisible();
    await saveScreenshot(
      page,
      `${screenshotBase}-02a-确认房间朝向放置事件房.jpg`,
    );
    await page.getByTestId("betrayal-room-placement-confirm").click();
    const eventChoicePanel = page.getByTestId("betrayal-event-choice-panel");
    await expect(eventChoicePanel).toHaveAttribute("aria-label", "蜘蛛！");
    await expect(
      page.getByTestId("betrayal-event-choice-card-front-atlas"),
    ).toBeVisible();
    const rollPanel = page.getByTestId("betrayal-recent-roll-panel");
    await expect(rollPanel).toBeVisible();
    await expect(rollPanel).toContainText("神志检定");
    await expect(rollPanel).toContainText("总点数 4");
    await expect(rollPanel).toContainText("获得 1 点神志或速度");
    await expect(
      page.getByTestId("betrayal-event-choice-trait-sanity"),
    ).toBeVisible();
    await expect(
      page.getByTestId("betrayal-event-choice-trait-speed"),
    ).toBeVisible();
    await expectAtlasFrameImageRendered(
      page.getByTestId("betrayal-event-choice-card-front-atlas"),
      "PC 蜘蛛选择态事件牌",
    );
    await expectDesktopEventChoiceLayout(page, "PC 蜘蛛选择态");
    await expect(
      page.getByTestId("betrayal-event-choice-confirm"),
      "PC 蜘蛛没有二选一语义，选择态不应露出额外确认按钮",
    ).toHaveCount(0);
    await saveScreenshot(
      page,
      `${screenshotBase}-03-事件牌翻出已有神志检定.jpg`,
    );

    const pcBeforeChoiceCore = await readCurrentCore(page);
    const pcSpeedPositionBefore =
      pcBeforeChoiceCore.currentExplorer.traitTracks.speed.position;
    await page.getByTestId("betrayal-event-choice-trait-speed").click();
    const pcRoomTarget = page.getByTestId(
      "betrayal-room-event-choice-target-hallway",
    );
    await expect(pcRoomTarget).toBeVisible();
    await expect(pcRoomTarget).toHaveAttribute(
      "data-event-target-selected",
      "false",
    );
    await expect(
      page.getByTestId("betrayal-event-choice-rooms"),
      "PC 不能在事件选择面板里新增“地图 / 门厅”代理目标块，目标必须由地图房间本体承接",
    ).toHaveCount(0);
    await expect(
      page.getByTestId("betrayal-event-choice-room-hallway"),
      "PC 不能用“门厅”文字块替代真实地图房间点击",
    ).toHaveCount(0);
    await expect(
      page.locator('[data-testid^="betrayal-room-event-choice-target-label-"]'),
      "PC 不能给地图目标额外叠“点门厅/已选门厅”这类代理标签",
    ).toHaveCount(0);
    await expect(
      page.getByTestId("betrayal-event-choice-room-instruction"),
      "PC 不能新增房间说明正文替代真实地图目标点击",
    ).toHaveCount(0);
    await expect(
      page.getByTestId("betrayal-event-choice-confirm"),
      "PC 蜘蛛选择速度后还未点最终房间，也不应出现额外确认按钮",
    ).toHaveCount(0);
    await expectEventMapTargetSelectionForeground(
      page,
      "PC 蜘蛛4+效果处理中选择相邻房间",
      "betrayal-room-event-choice-target-hallway",
      "betrayal-room-hallway",
    );
    await saveScreenshot(
      page,
      `${screenshotBase}-04-4+效果处理中选择相邻房间.jpg`,
    );

    await page.getByTestId("betrayal-room-hallway").click();
    await expect(eventChoicePanel).toBeHidden({ timeout: 30000 });
    const spiderDiscoveryPanel = page.getByTestId("betrayal-discovery-panel");
    await expect(
      spiderDiscoveryPanel,
      "PC 蜘蛛点选最终房间后应进入事件效果确认队列，而不是直接丢失结算承接",
    ).toBeVisible();
    await expect(spiderDiscoveryPanel).toHaveAttribute(
      "aria-label",
      /事件牌 蜘蛛！/,
    );
    await expect(spiderDiscoveryPanel).toContainText("事件效果");
    await expect(spiderDiscoveryPanel).toContainText("确认");
    await expect(
      spiderDiscoveryPanel.getByTestId("betrayal-discovery-continue"),
    ).toHaveAttribute("data-pending-card-resolution-step", "1/1");
    await saveScreenshot(page, `${screenshotBase}-05-点击门厅后事件效果确认.jpg`);
    await dismissDiscoveryPanel(page);
    await expect(page.getByTestId("betrayal-board")).toBeVisible();
    await expect(page.getByTestId("betrayal-room-hallway")).toBeVisible();
    await expect(page.getByTestId("betrayal-discovery-panel")).toHaveCount(0);
    await saveScreenshot(page, `${screenshotBase}-06-关闭后回牌桌.jpg`);
    const pcSettledCore = await readCurrentCore(page);
    expect(pcSettledCore.pendingEventChoice).toBeNull();
    expect(
      pcSettledCore.currentExplorer.traitTracks.speed.position,
      "PC 蜘蛛效果处理完成后必须真实让速度轨道前进 1 格，不得只显示结果文案",
    ).toBe(pcSpeedPositionBefore + 1);
    expect(
      pcSettledCore.currentExplorerTraits.speed,
      "PC 蜘蛛效果处理完成后 UI 属性快照必须同步真实速度数值",
    ).toBe(pcSettledCore.currentExplorer.traits.speed);
    expect(
      pcSettledCore.currentExplorer.roomId,
      "PC 蜘蛛效果处理完成后探索者必须真实放置到所选相邻板块",
    ).toBe("hallway");
    expect(pcSettledCore.activeRoomId).toBe("hallway");
    expect(pcSettledCore.recommendedAction).toBe("endTurn");
    expect(pcSettledCore.turnEndedByDiscovery).toBe(true);
    await expect(page.getByTestId("betrayal-event-choice-panel")).toHaveCount(
      0,
    );
    await expect(
      page.getByTestId("betrayal-room-occupant-hallway-0"),
      "PC 蜘蛛点选最终房间后，探索者 token 必须留在所选门厅房间",
    ).toBeVisible();

    assertNoFatalFrontendErrors([
      { label: "betrayal-event-choice-蜘蛛-完整链路", diagnostics },
    ]);
  });
});
