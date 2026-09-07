import { expect, test, type Page } from "@playwright/test";
import {
  assertNoFatalFrontendErrors,
  attachPageDiagnostics,
} from "../helpers/common";
import { expectNoDuplicateUiOwners } from "../helpers/uiDuplicateOwners";
import {
    type BetrayalCore,
    type BetrayalTraitKey,
} from "../../src/games/betrayal/game";
import { BETRAYAL_COMMANDS } from "../../src/games/betrayal/commands";
import { BETRAYAL_DISCOVERY_POOLS } from "../../src/games/betrayal/scenarioConfig";
import {
  createRuntimeCore,
  dispatchHarnessCommand,
  expectEventRollWorkbenchReadable,
  expectPhysicalDiceSeparated,
  expectVisiblePhysicalDiceBox,
  initBetrayalContext,
  injectCore,
  readVisibleNonSrText,
  saveScreenshot,
  setHarnessRandomQueue,
  waitForPhysicalDiceSettled,
  waitForBetrayalPageReady,
  warmBetrayalFrontend,
} from "./betrayalTestHelpers";

const NAMED_PLAYER_ROUTE =
  `/play/betrayal?players=3&seat0=human&seat1=human&seat2=human&player0Name=${encodeURIComponent("薇薇安")}&player1Name=${encodeURIComponent("布兰登")}&player2Name=${encodeURIComponent("佐伊")}`;
const EVIDENCE_DIR =
  "test-results/evidence-screenshots/betrayal/action-log-undo-screenshots";
const ACTION_LOG_SCREENSHOT = `${EVIDENCE_DIR}/01-山屋惊魂-移动后操作日志面板.png`;
const UNDO_SCREENSHOT = `${EVIDENCE_DIR}/02-山屋惊魂-撤回请求面板.png`;
const EVENT_TRIGGER_SCREENSHOT = `${EVIDENCE_DIR}/03-山屋惊魂-触发事件牌.png`;
const EVENT_RESULT_SCREENSHOT = `${EVIDENCE_DIR}/04-山屋惊魂-事件结果面板.png`;
const ACTION_LOG_WITH_EVENT_SCREENSHOT = `${EVIDENCE_DIR}/05-山屋惊魂-操作日志含事件触发与结果.png`;
const RADIO_DAMAGE_EVIDENCE_DIR =
  "test-results/evidence-screenshots/betrayal/radio-event-damage-flow";
const RADIO_DAMAGE_READY_SCREENSHOT = `${RADIO_DAMAGE_EVIDENCE_DIR}/01-无线电广播-探索前玩家名与属性.png`;
const RADIO_DAMAGE_TRIGGER_SCREENSHOT = `${RADIO_DAMAGE_EVIDENCE_DIR}/02-无线电广播-低点数受伤分支.png`;
const RADIO_DAMAGE_ROLL_SCREENSHOT = `${RADIO_DAMAGE_EVIDENCE_DIR}/03-无线电广播-事件骰结果.png`;
const RADIO_DAMAGE_REROLL_SCREENSHOT = `${RADIO_DAMAGE_EVIDENCE_DIR}/04-无线电广播-重新投掷一颗骰子.png`;
const RADIO_DAMAGE_ALLOCATION_SCREENSHOT = `${RADIO_DAMAGE_EVIDENCE_DIR}/05-无线电广播-精神伤害分配面板.png`;
const RADIO_DAMAGE_AFTER_SCREENSHOT = `${RADIO_DAMAGE_EVIDENCE_DIR}/06-无线电广播-分配后属性结果.png`;
const RADIO_DAMAGE_LOG_SCREENSHOT = `${RADIO_DAMAGE_EVIDENCE_DIR}/07-无线电广播-日志记录重新投骰与分配.png`;

type BetrayalHarnessWindow = Window & {
  __BG_TEST_HARNESS__?: {
    state?: {
      get?: () => {
        core: BetrayalCore;
        sys?: {
          actionLog?: { entries?: unknown[] };
          undo?: { snapshots?: unknown[] };
        };
      };
    };
  };
};

async function readSupportState(page: Page) {
  const result = await page.evaluate(() => {
    const snapshot = (
      window as BetrayalHarnessWindow
    ).__BG_TEST_HARNESS__?.state?.get?.();
    return {
      actionLogCount: snapshot?.sys?.actionLog?.entries?.length ?? 0,
      undoSnapshotCount: snapshot?.sys?.undo?.snapshots?.length ?? 0,
      currentPlayer: snapshot?.core?.currentPlayer,
      currentExplorerRoomId: snapshot?.core?.currentExplorer?.roomId,
      latestDiscoveryKind: snapshot?.core?.latestDiscovery?.kind ?? null,
      latestDiscoveryTitle: snapshot?.core?.latestDiscovery?.title ?? null,
      recentRollKind: snapshot?.core?.recentRoll?.kind ?? null,
      recentRollSourceTitle: snapshot?.core?.recentRoll?.sourceTitle ?? null,
      recentRollLatestLabel: snapshot?.core?.recentRoll?.latestLabel ?? null,
      recentRollDice: snapshot?.core?.recentRoll?.dice ?? [],
      recentRollSourceEventDice:
        snapshot?.core?.recentRoll?.sourceEventRoll?.dice ?? [],
      pendingEventRollSourceTitle:
        snapshot?.core?.pendingEventRollResolution?.sourceTitle ?? null,
      pendingEventRollAcknowledgedPlayerIds:
        snapshot?.core?.pendingEventRollResolution?.acknowledgedPlayerIds ?? [],
    };
  });
  return result;
}

async function readEventLogSupportState(page: Page) {
  const supportState = await readSupportState(page);
  return {
    ...supportState,
    hasEventActionLogEntries: supportState.actionLogCount >= 4,
  };
}

async function readCurrentCore(page: Page): Promise<BetrayalCore> {
  return page.evaluate(() => {
    const snapshot = (
      window as BetrayalHarnessWindow
    ).__BG_TEST_HARNESS__?.state?.get?.();
    if (!snapshot?.core) {
      throw new Error("山屋 E2E 无法读取当前核心状态");
    }
    return snapshot.core;
  });
}

function mentalTraitTotal(core: BetrayalCore, playerId: string): number {
  const explorer = [core.currentExplorer, ...core.otherExplorers].find(
    (candidate) => candidate.playerId === playerId,
  );
  if (!explorer) {
    throw new Error(`山屋 E2E 无法找到玩家 ${playerId} 的探索者`);
  }
  return explorer.traits.knowledge + explorer.traits.sanity;
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
    trackId: `radio-damage-e2e-${trait}`,
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

function createEventScreenshotCore(): BetrayalCore {
  const core = createRuntimeCore();
  const radioEvent = eventByName("无线电广播");
  core.drawOrder = ["event"];
  core.eventOrder = [radioEvent];
  core.deckCounts.event = core.eventOrder.length;
  pinGroundNorthToEventRoom(core);
  return core;
}

function createRadioDamageScreenshotCore(): BetrayalCore {
  const core = createEventScreenshotCore();
  core.currentExplorer = {
    ...core.currentExplorer,
    inventory: [],
  };
  setCurrentExplorerVisibleTrait(core, "knowledge", 4);
  setCurrentExplorerVisibleTrait(core, "sanity", 4);
  core.currentExplorerTraits = { ...core.currentExplorer.traits };
  core.currentExplorerInventory = [];
  core.turnStartInventoryCardIds = [];
  return core;
}

async function finalizePendingEventRollForAllPlayers(
  page: Page,
  finalRollRandomQueue: number[] = [],
) {
  const pending = await page.evaluate(() => {
    const snapshot = (
      window as BetrayalHarnessWindow
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
    return;
  }

  const acknowledged = new Set(pending.acknowledgedPlayerIds);
  const unacknowledgedPlayerIds = pending.requiredPlayerIds.filter(
    (playerId) => !acknowledged.has(playerId),
  );
  if (finalRollRandomQueue.length > 0) {
    await setHarnessRandomQueue(page, finalRollRandomQueue);
  }
  for (const playerId of unacknowledgedPlayerIds) {
    await dispatchHarnessCommand(page, BETRAYAL_COMMANDS.FINALIZE_EVENT_ROLL, playerId, {
      rollId: pending.rollId,
    });
  }
  await expect
    .poll(async () => (await readCurrentCore(page)).pendingEventRollResolution ?? null, {
      message: "无线电广播事件骰确认后必须完成正式伤害结算",
    })
    .toBeNull();
}

async function acknowledgeVisibleDamageRoll(page: Page) {
  await expect(page.getByTestId("betrayal-damage-allocation-panel")).toHaveCount(0);
  const confirmButton = page.getByTestId("betrayal-roll-continue");
  await expect(confirmButton).toBeVisible();
  await expect(confirmButton).toContainText(/确认/);
  await confirmButton.click();
  await expect
    .poll(async () => (await readCurrentCore(page)).recentRoll ?? null, {
      message: "确认伤害骰后才进入伤害分配",
    })
    .toBeNull();
}

async function closeDiscoveryPanel(page: Page) {
  const discoveryPanel = page.getByTestId("betrayal-discovery-panel");
  if (!(await discoveryPanel.isVisible().catch(() => false))) {
    return;
  }
  const continueButton = page.getByTestId("betrayal-discovery-continue");
  await expect(continueButton).toBeVisible();
  await expect(continueButton).toBeEnabled();
  await continueButton.click();
  await expect(discoveryPanel).toHaveCount(0);
}

test.describe("山屋惊魂日志与撤回截图验收", () => {
  test("玩家动作后能打开操作日志、撤回请求，并在日志里看到事件触发与结果", async ({
    page,
    context,
  }) => {
    test.setTimeout(120000);
    await initBetrayalContext(context);
    const diagnostics = attachPageDiagnostics(
      page,
      "betrayal-action-log-undo-screenshots",
    );

    await page.setViewportSize({ width: 1600, height: 900 });
    await warmBetrayalFrontend(context);
    await page.goto(NAMED_PLAYER_ROUTE, { waitUntil: "domcontentloaded" });
    await waitForBetrayalPageReady(page);

    await injectCore(page, createEventScreenshotCore());
    await expect(page.getByTestId("betrayal-board")).toBeVisible({
      timeout: 30000,
    });

    await page.getByTestId("betrayal-action-move").click();
    await page.getByTestId("betrayal-room-hallway").click();

    await expect
      .poll(() => readSupportState(page), {
        message: "玩家移动后必须生成操作记录和撤回快照",
      })
      .toMatchObject({
        actionLogCount: 1,
        undoSnapshotCount: 1,
        currentPlayer: "0",
        currentExplorerRoomId: "hallway",
      });

    const fabMenu = page.getByTestId("fab-menu");
    await fabMenu.locator("button").first().click();
    await expect(page.locator('button[data-fab-id="action-log"]')).toBeVisible();
    await page.locator('button[data-fab-id="action-log"]').click();

    const logPanel = page.getByTestId("fab-panel-action-log");
    await expect(logPanel).toBeVisible();
    await expect(logPanel.getByTestId("hud-action-log-row")).toHaveCount(1);
    await expect(logPanel.getByTestId("hud-action-log-row")).toContainText(
      /薇薇安.*移动|移动.*薇薇安/,
    );
    await expect(logPanel.getByTestId("hud-action-log-row")).not.toContainText(/玩家 1|玩家1/);
    await expect(logPanel.getByTestId("hud-action-log-row")).not.toContainText(/玩家\s+薇薇安|Player\s+薇薇安/);
    await saveScreenshot(page, ACTION_LOG_SCREENSHOT);

    await expect(page.locator('button[data-fab-id="undo-request"]')).toBeVisible();
    await page.locator('button[data-fab-id="undo-request"]').click();

    const undoPanel = page.getByTestId("fab-panel-undo-request");
    await expect(undoPanel).toBeVisible();
    await expect(undoPanel).toContainText(/申请撤回|请求撤回|撤回|Request Undo|Undo/);
    await expect(
      undoPanel.getByRole("button", { name: /申请撤回|请求撤回|Request Undo/ }),
    ).toBeVisible();
    await saveScreenshot(page, UNDO_SCREENSHOT);

    await page.locator('button[data-fab-id="undo-request"]').click();
    await expect(undoPanel).toHaveCount(0);

    await expect(page.getByTestId("betrayal-action-explore")).toBeEnabled();
    await page.getByTestId("betrayal-action-explore").click();
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-north"),
    ).toBeVisible();
    await page.getByTestId("betrayal-room-ground-north").click();
    await expect(page.getByTestId("betrayal-room-placement-panel")).toBeVisible();
    await setHarnessRandomQueue(page, [0.834, 0.834]);
    await page.getByTestId("betrayal-room-placement-confirm").click();

    const discoveryPanel = page.getByTestId("betrayal-discovery-panel");
    await expect(discoveryPanel).toBeVisible();
    await expect(discoveryPanel).toHaveAttribute("aria-label", "事件牌 无线电广播");
    await expect(page.getByTestId("betrayal-discovery-card-front-atlas")).toBeVisible();
    await expect(page.getByTestId("betrayal-discovery-detail")).toContainText(
      /无线电广播|获得 1 点知识|精神伤害/,
    );
    await saveScreenshot(page, EVENT_TRIGGER_SCREENSHOT);

    await expectEventRollWorkbenchReadable(page, "无线电广播事件触发", {
      expectedEventFrameIndex: "25",
    });
    await expect
      .poll(() => readEventLogSupportState(page), {
        message: "探索事件后必须在操作日志和玩家界面生成事件触发与投骰结果",
      })
      .toMatchObject({
        hasEventActionLogEntries: true,
        latestDiscoveryKind: "event",
        latestDiscoveryTitle: "无线电广播",
        recentRollSourceTitle: "无线电广播",
        recentRollLatestLabel: "获得 1 点知识",
        recentRollDice: [2, 2],
        pendingEventRollSourceTitle: "无线电广播",
      });
    await expect(page.getByTestId("betrayal-recent-roll-panel")).toContainText(
      /无线电广播|获得 1 点知识|4/,
    );
    await saveScreenshot(page, EVENT_RESULT_SCREENSHOT);

    const actionLogButton = page.locator('button[data-fab-id="action-log"]');
    if (!(await actionLogButton.isVisible())) {
      await fabMenu.locator("button").first().click();
    }
    await expect(actionLogButton).toBeVisible();
    await actionLogButton.click();

    const finalLogPanel = page.getByTestId("fab-panel-action-log");
    await expect(finalLogPanel).toBeVisible();
    await expect
      .poll(() => finalLogPanel.getByTestId("hud-action-log-row").count(), {
        message: "最终操作日志至少要包含移动、探索、事件触发和事件结果",
      })
      .toBeGreaterThanOrEqual(4);
    await expect(finalLogPanel).toContainText(/移动到门厅/);
    await expect(finalLogPanel).toContainText(/探索到厨房/);
    await expect(finalLogPanel).toContainText(/触发事件：无线电广播/);
    await expect(finalLogPanel).toContainText(/无线电广播结果/);
    await expect(finalLogPanel).toContainText(/总点数 4/);
    await expect(finalLogPanel).toContainText(/获得 1 点知识/);
    await expect(finalLogPanel).toContainText(/薇薇安/);
    await expect(finalLogPanel).not.toContainText(/玩家 1|玩家1/);
    await expect(finalLogPanel).not.toContainText(/玩家\s+薇薇安|Player\s+薇薇安/);
    await expect(finalLogPanel).not.toContainText(
      /确认了事件检定结果|确认了卡牌结算|确认了掷骰结果|确认了回合结束检定结果/,
    );
    await saveScreenshot(page, ACTION_LOG_WITH_EVENT_SCREENSHOT);

    assertNoFatalFrontendErrors([
      { label: "betrayal-action-log-undo-screenshots", diagnostics },
    ]);
  });

  test("无线电广播低点数分支从触发到精神伤害结算与日志完整可见", async ({
    page,
    context,
  }, testInfo) => {
    test.setTimeout(120000);
    await initBetrayalContext(context);
    const diagnostics = attachPageDiagnostics(
      page,
      "betrayal-radio-event-damage-flow",
    );

    await page.setViewportSize({ width: 1600, height: 900 });
    await warmBetrayalFrontend(context);
    await page.goto(NAMED_PLAYER_ROUTE, { waitUntil: "domcontentloaded" });
    await waitForBetrayalPageReady(page);

    await injectCore(page, createRadioDamageScreenshotCore());
    await expect(page.getByTestId("betrayal-board")).toBeVisible({
      timeout: 30000,
    });
    const beforeCore = await readCurrentCore(page);
    const mentalBefore = mentalTraitTotal(beforeCore, "0");
    expect(mentalBefore).toBe(8);

    await page.getByTestId("betrayal-action-move").click();
    await page.getByTestId("betrayal-room-hallway").click();
    await expect(page.getByTestId("betrayal-action-explore")).toBeEnabled();
    await expect(page.getByTestId("fab-menu")).toBeVisible();
    await saveScreenshot(page, RADIO_DAMAGE_READY_SCREENSHOT);

    await page.getByTestId("betrayal-action-explore").click();
    await expect(
      page.getByTestId("betrayal-room-explore-target-ground-north"),
    ).toBeVisible();
    await page.getByTestId("betrayal-room-ground-north").click();
    await expect(page.getByTestId("betrayal-room-placement-panel")).toBeVisible();
    await setHarnessRandomQueue(page, [0, 0]);
    await page.getByTestId("betrayal-room-placement-confirm").click();

    const discoveryPanel = page.getByTestId("betrayal-discovery-panel");
    await expect(discoveryPanel).toBeVisible();
    await expect(discoveryPanel).toHaveAttribute("aria-label", "事件牌 无线电广播");
    await expect(page.getByTestId("betrayal-discovery-card-front-atlas")).toBeVisible();
    const discoveryDetail = page.getByTestId("betrayal-discovery-detail");
    await expect(discoveryDetail).toContainText("无线电广播");
    await expect(discoveryDetail).toContainText("投 2 颗骰子 0");
    await expect(discoveryDetail).toContainText("受到一颗骰子的精神伤害");
    await saveScreenshot(page, RADIO_DAMAGE_TRIGGER_SCREENSHOT);

    await expectEventRollWorkbenchReadable(page, "无线电广播低点数受伤分支", {
      expectedEventFrameIndex: "25",
    });
    const rollPanel = discoveryPanel.getByTestId("betrayal-recent-roll-panel");
    await expect(rollPanel.getByTestId("betrayal-recent-roll-outcome")).toHaveText(
      "受到一颗骰子的精神伤害",
    );
    await expect(rollPanel.getByTestId("betrayal-recent-roll-total")).toContainText(
      "总点数 0",
    );
    await expect(rollPanel.getByTestId("betrayal-recent-roll-total")).not.toContainText(
      "伤害骰合计 2",
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
    await saveScreenshot(page, RADIO_DAMAGE_ROLL_SCREENSHOT);

    const beforeFinalizeCore = await readCurrentCore(page);
    expect(beforeFinalizeCore.recentRoll).toMatchObject({
      kind: "eventDiceRoll",
      sourceTitle: "无线电广播",
      eventDescription: "华盛顿展开了一次核物理打击",
      dice: [0, 0],
      latestLabel: "受到一颗骰子的精神伤害",
    });
    expect(beforeFinalizeCore.recentRoll?.eventRolledDamageResults).toBeUndefined();
    expect(beforeFinalizeCore.pendingEventRollResolution).toMatchObject({
      sourceTitle: "无线电广播",
    });

    await finalizePendingEventRollForAllPlayers(page, [0.99]);
    const afterFinalizeCore = await readCurrentCore(page);
    expect(afterFinalizeCore.recentRoll).toMatchObject({
      kind: "eventRolledDamage",
      sourceTitle: "无线电广播",
      eventDescription: "华盛顿展开了一次核物理打击",
      rollLabel: "重新投掷的伤害骰",
      dice: [2],
      passiveBonus: 0,
      latestLabel: "造成 2 点精神伤害",
      sourceEventRoll: {
        kind: "eventDiceRoll",
        sourceTitle: "无线电广播",
        eventDescription: "华盛顿展开了一次核物理打击",
        dice: [0, 0],
        total: 0,
        latestLabel: "受到一颗骰子的精神伤害",
      },
    });
    expect(afterFinalizeCore.recentRoll?.eventEffectSnapshot).toBeUndefined();
    expect(afterFinalizeCore.recentRoll?.eventRolledDamageResults).toEqual([{
      damageKind: "mental",
      rolls: [2],
      total: 2,
      appliedAmount: 2,
    }]);

    const damageRollPanel = page.getByTestId("betrayal-recent-roll-panel");
    await expect(damageRollPanel).toBeVisible();
    await expect(
      damageRollPanel.getByTestId("betrayal-recent-roll-source-title"),
    ).toHaveCount(0);
    await expect(
      damageRollPanel.getByTestId("betrayal-recent-roll-outcome"),
    ).toHaveCount(0);
    await expect(
      damageRollPanel.getByTestId("betrayal-recent-roll-event-description"),
    ).toHaveText(
      "华盛顿展开了一次核物理打击",
    );
    await expect(
      damageRollPanel.getByTestId("betrayal-recent-roll-event-description"),
    ).toHaveAttribute("data-result-role", "event-damage-description");
    await expect(
      damageRollPanel.getByTestId("betrayal-recent-roll-event-subtitle"),
    ).toHaveText(
      "受到一颗骰子的精神伤害",
    );
    await expect(
      damageRollPanel.getByTestId("betrayal-recent-roll-event-subtitle"),
    ).toHaveAttribute("data-result-role", "event-damage-subtitle");
    await expect(
      damageRollPanel.getByTestId("betrayal-recent-roll-event-effect"),
    ).toHaveText("实际效果：造成 2 点精神伤害");
    await expect(
      damageRollPanel.getByTestId("betrayal-recent-roll-event-effect"),
    ).toHaveAttribute("data-result-role", "event-damage-effect");
    await expect(damageRollPanel.getByTestId("betrayal-recent-roll-total")).toContainText(
      "伤害骰合计 2",
    );
    await expect(damageRollPanel.getByTestId("betrayal-recent-roll-total")).not.toContainText(
      "事件总点数 0",
    );
    await expect(damageRollPanel.getByTestId("betrayal-recent-roll-total")).not.toContainText(
      /骰面合计|加值/,
    );
    await expect(damageRollPanel.getByTestId("betrayal-recent-roll-damage-dice")).toHaveCount(0);
    await expect(damageRollPanel.getByTestId("betrayal-recent-roll-effect-damage")).toHaveCount(0);
    await expect(damageRollPanel.getByTestId("betrayal-recent-roll-breakdown")).toHaveCount(0);
    await expect(damageRollPanel).toHaveAttribute("data-visible-dice-source", "event-rolled-damage");
    await expect(
      damageRollPanel.getByTestId("betrayal-reroll-prompt-outside-dice"),
    ).toHaveAttribute("aria-hidden", "true");
    await expect(
      damageRollPanel.getByTestId("betrayal-reroll-prompt-outside-dice"),
    ).toHaveText("");
    const damageRollVisibleText = await readVisibleNonSrText(damageRollPanel);
    expect(damageRollVisibleText).not.toContain("无线电广播");
    expect(
      (damageRollVisibleText.match(/华盛顿展开了一次核物理打击/g) ?? []),
    ).toHaveLength(1);
    expect(
      (damageRollVisibleText.match(/受到一颗骰子的精神伤害/g) ?? []),
    ).toHaveLength(1);
    expect(
      (damageRollVisibleText.match(/实际效果：造成 2 点精神伤害/g) ?? []),
    ).toHaveLength(1);
    expect(damageRollVisibleText).toContain("伤害骰合计 2");
    expect(damageRollVisibleText).not.toContain("待分配 2 点精神伤害");
    expect(damageRollVisibleText).not.toContain("重新投掷的伤害骰");
    await expectNoDuplicateUiOwners(
      damageRollPanel,
      testInfo,
      "rolled-damage-resolution",
      "temp/betrayal-radio-event-rolled-damage-panel-dom.html",
    );
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
    await saveScreenshot(page, RADIO_DAMAGE_REROLL_SCREENSHOT);
    expect(afterFinalizeCore.pendingDamageAllocation).toMatchObject({
      sourceTitle: "无线电广播",
      playerId: "0",
      damageKind: "mental",
      amount: 2,
      originalAmount: 2,
      allowedTraits: ["knowledge", "sanity"],
    });
    expect(mentalTraitTotal(afterFinalizeCore, "0")).toBe(mentalBefore);
    expect(afterFinalizeCore.currentExplorer.traits.knowledge).toBe(4);
    expect(afterFinalizeCore.currentExplorer.traits.sanity).toBe(4);

    await acknowledgeVisibleDamageRoll(page);

    const allocationPanel = page.getByTestId("betrayal-damage-allocation-panel");
    await expect(allocationPanel).toBeVisible();
    await expect(allocationPanel.getByTestId("betrayal-damage-allocation-source")).toContainText(
      "无线电广播",
    );
    await expect(
      allocationPanel.getByTestId("betrayal-damage-allocation-source"),
    ).toHaveAttribute("data-visible-source-owner", "discovery-card");
    await expect(
      allocationPanel.getByTestId("betrayal-damage-allocation-source"),
    ).toHaveClass(/sr-only/);
    await expect(allocationPanel.getByTestId("betrayal-damage-allocation-player")).toContainText(
      "薇薇安",
    );
    await expect(allocationPanel.getByTestId("betrayal-damage-allocation-amount")).toContainText(
      "2 点精神伤害",
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

    await allocationPanel.getByTestId("betrayal-damage-allocation-trait-knowledge-increase").click();
    await allocationPanel.getByTestId("betrayal-damage-allocation-trait-sanity-increase").click();
    await expect(
      allocationPanel.getByTestId("betrayal-damage-allocation-trait-sanity-selected-count"),
    ).toHaveText("1");
    await allocationPanel.getByTestId("betrayal-damage-allocation-trait-sanity-decrease").click();
    await expect(
      allocationPanel.getByTestId("betrayal-damage-allocation-trait-sanity-selected-count"),
    ).toHaveText("0");
    await allocationPanel.getByTestId("betrayal-damage-allocation-trait-sanity-increase").click();
    await expect(
      allocationPanel.getByTestId("betrayal-damage-allocation-trait-knowledge"),
    ).toHaveAttribute("data-damage-selected-count", "1");
    await expect(
      allocationPanel.getByTestId("betrayal-damage-allocation-trait-knowledge"),
    ).toHaveAttribute("data-trait-preview-step-count", "1");
    await expect(
      allocationPanel.getByTestId("betrayal-damage-allocation-trait-knowledge-selected-count"),
    ).toHaveText("1");
    const knowledgePreviewPositions = await allocationPanel
      .getByTestId("betrayal-damage-allocation-trait-knowledge")
      .evaluate((element) => ({
        current: Number(element.getAttribute("data-trait-preview-current-position")),
        target: Number(element.getAttribute("data-trait-preview-target-position")),
      }));
    expect(knowledgePreviewPositions.target).toBeLessThan(knowledgePreviewPositions.current);
    await expect(
      allocationPanel.getByTestId("betrayal-damage-allocation-trait-sanity"),
    ).toHaveAttribute("data-damage-selected-count", "1");
    await expect(
      allocationPanel.getByTestId("betrayal-damage-allocation-trait-sanity"),
    ).toHaveAttribute("data-trait-preview-step-count", "1");
    await expect(
      allocationPanel.getByTestId("betrayal-damage-allocation-trait-sanity-selected-count"),
    ).toHaveText("1");
    const sanityPreviewPositions = await allocationPanel
      .getByTestId("betrayal-damage-allocation-trait-sanity")
      .evaluate((element) => ({
        current: Number(element.getAttribute("data-trait-preview-current-position")),
        target: Number(element.getAttribute("data-trait-preview-target-position")),
      }));
    expect(sanityPreviewPositions.target).toBeLessThan(sanityPreviewPositions.current);
    await expect(allocationPanel.getByTestId("betrayal-damage-allocation-traits")).not.toContainText(
      /承担\s*\d+\s*点|×\d|[+-]\s*\d+\s*步|[+-]\s*\d+\s*steps/i,
    );
    await expectNoDuplicateUiOwners(
      allocationPanel,
      testInfo,
      "damage-allocation",
      "temp/betrayal-radio-mental-damage-allocation-panel-dom.html",
    );
    await expect(allocationPanel.getByTestId("betrayal-damage-allocation-confirm")).toBeEnabled();
    await saveScreenshot(page, RADIO_DAMAGE_ALLOCATION_SCREENSHOT);

    await allocationPanel.getByTestId("betrayal-damage-allocation-confirm").click();
    await expect(page.getByTestId("betrayal-damage-allocation-panel")).toHaveCount(0);
    const afterAllocationCore = await readCurrentCore(page);
    expect(afterAllocationCore.pendingDamageAllocation).toBeNull();
    expect(mentalTraitTotal(afterAllocationCore, "0")).toBe(mentalBefore - 2);
    expect(afterAllocationCore.currentExplorer.traits.knowledge).toBe(3);
    expect(afterAllocationCore.currentExplorer.traits.sanity).toBe(3);

    await closeDiscoveryPanel(page);
    await expect(page.getByTestId("betrayal-current-traits")).toBeVisible();
    await expect(page.getByTestId("betrayal-current-trait-track-knowledge")).toHaveAttribute(
      "data-trait-track-value",
      "3",
    );
    await expect(page.getByTestId("betrayal-current-trait-track-sanity")).toHaveAttribute(
      "data-trait-track-value",
      "3",
    );
    await expect(page.getByTestId("betrayal-action-endTurn")).toBeVisible();
    await saveScreenshot(page, RADIO_DAMAGE_AFTER_SCREENSHOT);

    const fabMenu = page.getByTestId("fab-menu");
    await fabMenu.locator("button").first().click();
    const actionLogButton = page.locator('button[data-fab-id="action-log"]');
    await expect(actionLogButton).toBeVisible();
    await actionLogButton.click();
    const logPanel = page.getByTestId("fab-panel-action-log");
    await expect(logPanel).toBeVisible();
    await expect(logPanel).toContainText(/薇薇安/);
    await expect(logPanel).toContainText(/无线电广播结果/);
    await expect(logPanel).toContainText(/总点数 0/);
    await expect(logPanel).toContainText(/受到一颗骰子的精神伤害/);
    await expect(logPanel).toContainText(/处理无线电广播伤害骰/);
    await expect(logPanel).toContainText(/合计 2/);
    await expect(logPanel).toContainText(/造成 2 点精神伤害/);
    await expect(logPanel).toContainText(/将无线电广播的 2 点精神伤害分配到知识、神志/);
    await expect(logPanel).not.toContainText(/待分配 2 点精神伤害/);
    await expect(logPanel).not.toContainText(/玩家 1|玩家1/);
    await expect(logPanel).not.toContainText(/玩家\s+薇薇安|Player\s+薇薇安/);
    await expect(logPanel).not.toContainText(
      /确认了事件检定结果|确认了卡牌结算|确认了掷骰结果|确认了回合结束检定结果/,
    );
    await saveScreenshot(page, RADIO_DAMAGE_LOG_SCREENSHOT);

    assertNoFatalFrontendErrors([
      { label: "betrayal-radio-event-damage-flow", diagnostics },
    ]);
  });
});
