import { expect, test, type Locator, type Page } from "@playwright/test";
import { resolve } from "path";
import sharp from "sharp";
import {
  assertNoFatalFrontendErrors,
  attachPageDiagnostics,
} from "../helpers/common";
import {
  initBetrayalContext,
  dispatchHarnessCommand,
  saveScreenshot,
  setHarnessRandomQueue,
  waitForBetrayalPageReady,
  armPhysicalDiceRerollMotionCapture,
  warmBetrayalFrontend,
} from "./betrayalTestHelpers";
import { BETRAYAL_COMMANDS } from "../../src/games/betrayal/commands";
import { MOBILE_LANDSCAPE_REFERENCE_VIEWPORT } from "../../src/shared/referenceViewports";

const EVIDENCE_DIR = resolve(process.cwd(), "evidence/betrayal-tutorial");
const STEP_00 = `${EVIDENCE_DIR}/00-山屋惊魂-教程-章节目录.jpg`;
const STEP_01 = `${EVIDENCE_DIR}/01-山屋惊魂-教程-回合目标与行动区.jpg`;
const STEP_02 = `${EVIDENCE_DIR}/03-山屋惊魂-教程-剩余移动.jpg`;
const STEP_03 = `${EVIDENCE_DIR}/04-山屋惊魂-教程-房间主视区.jpg`;
const STEP_04 = `${EVIDENCE_DIR}/10-山屋惊魂-教程-持有区与帮助入口.jpg`;
const STEP_05 = `${EVIDENCE_DIR}/11-山屋惊魂-教程-移动入口.jpg`;
const STEP_06 = `${EVIDENCE_DIR}/12-山屋惊魂-教程-移动到门厅后.jpg`;
const STEP_07 = `${EVIDENCE_DIR}/20-山屋惊魂-教程-探索目标房间.jpg`;
const STEP_08 = `${EVIDENCE_DIR}/21-山屋惊魂-教程-翻出房间朝向选择.jpg`;
const STEP_09 = `${EVIDENCE_DIR}/22-山屋惊魂-教程-旋转后确认放置新房间.jpg`;
const STEP_10 = `${EVIDENCE_DIR}/23-山屋惊魂-教程-事件牌公开与投掷入口.jpg`;
const STEP_11 = `${EVIDENCE_DIR}/24-山屋惊魂-教程-事件骰出现与书本可查看.jpg`;
const STEP_12 = `${EVIDENCE_DIR}/25-山屋惊魂-教程-书本牌面查看.jpg`;
const STEP_13 = `${EVIDENCE_DIR}/26-山屋惊魂-教程-书本使用后知识改骰结果.jpg`;
const STEP_14 = `${EVIDENCE_DIR}/27-山屋惊魂-教程-点击兔脚后选择骰子.jpg`;
const STEP_15 = `${EVIDENCE_DIR}/28-山屋惊魂-教程-兔脚选中改骰高亮.jpg`;
const STEP_15A = `${EVIDENCE_DIR}/29-山屋惊魂-教程-兔脚重投动画进行中.jpg`;
const STEP_16 = `${EVIDENCE_DIR}/30-山屋惊魂-教程-兔脚重投完成自动进入伤害分配.jpg`;
const STEP_16A = `${EVIDENCE_DIR}/31-山屋惊魂-教程-伤害分配面板可操作.jpg`;
const STEP_16B = `${EVIDENCE_DIR}/32-山屋惊魂-教程-伤害分配完成后.jpg`;
const MAIN_FLOW_33 = `${EVIDENCE_DIR}/main-flow-rebuilt/33-事件回合结束前.jpg`;
const MAIN_FLOW_34 = `${EVIDENCE_DIR}/main-flow-rebuilt/34-队友一获得指环未触发.jpg`;
const MAIN_FLOW_35 = `${EVIDENCE_DIR}/main-flow-rebuilt/35-队友一结果说明.jpg`;
const MAIN_FLOW_36 = `${EVIDENCE_DIR}/main-flow-rebuilt/36-队友二翻出狗未触发.jpg`;
const MAIN_FLOW_37 = `${EVIDENCE_DIR}/main-flow-rebuilt/37-狗确认后回到当前玩家.jpg`;
const MAIN_FLOW_38 = `${EVIDENCE_DIR}/main-flow-rebuilt/38-当前玩家到达大阶梯准备切层.jpg`;
const MAIN_FLOW_39 = `${EVIDENCE_DIR}/main-flow-rebuilt/39-切到上层看见上层平台.jpg`;
const MAIN_FLOW_40 = `${EVIDENCE_DIR}/main-flow-rebuilt/40-当前玩家移动到上层平台.jpg`;
const MAIN_FLOW_41 = `${EVIDENCE_DIR}/main-flow-rebuilt/41-当前玩家在上层平台准备结束回合.jpg`;
const MAIN_FLOW_42 = `${EVIDENCE_DIR}/main-flow-rebuilt/42-队友一翻出面具触发作祟.jpg`;
const MAIN_FLOW_43 = `${EVIDENCE_DIR}/main-flow-rebuilt/43-英雄开场过场.jpg`;
const MAIN_FLOW_44 = `${EVIDENCE_DIR}/main-flow-rebuilt/44-过场继续进入英雄剧本书.jpg`;
const MAIN_FLOW_45 = `${EVIDENCE_DIR}/main-flow-rebuilt/45-英雄剧本书目标页说明图书馆原因.jpg`;
const MAIN_FLOW_46 = `${EVIDENCE_DIR}/main-flow-rebuilt/46-读完目标关闭剧本书.jpg`;
const MAIN_FLOW_47 = `${EVIDENCE_DIR}/main-flow-rebuilt/47-读完目标回到上层平台英雄回合.jpg`;
const MAIN_FLOW_48 = `${EVIDENCE_DIR}/main-flow-rebuilt/48-读完目标后准备打开移动目标.jpg`;
const MAIN_FLOW_49 = `${EVIDENCE_DIR}/main-flow-rebuilt/49-图书馆成为可点击移动目标.jpg`;
const MAIN_FLOW_50 = `${EVIDENCE_DIR}/main-flow-rebuilt/50-英雄寻找木乃伊真名入口.jpg`;
const MAIN_FLOW_51 = `${EVIDENCE_DIR}/main-flow-rebuilt/51-寻找真名知识检定成功.jpg`;
const MAIN_FLOW_52 = `${EVIDENCE_DIR}/main-flow-rebuilt/52-确认后回到牌桌可结束回合.jpg`;
const STEP_17 = `${EVIDENCE_DIR}/representative-hero-haunt/01-木乃伊作祟目标改变.jpg`;
const STEP_18 = `${EVIDENCE_DIR}/representative-hero-haunt/02-打开木乃伊剧本目标页.jpg`;
const STEP_19 = `${EVIDENCE_DIR}/representative-hero-haunt/03-驱逐木乃伊前因果说明.jpg`;
const STEP_20 = `${EVIDENCE_DIR}/representative-hero-haunt/04-驱逐木乃伊神志对抗骰盘.jpg`;
const STEP_21 = `${EVIDENCE_DIR}/representative-hero-haunt/05-驱逐木乃伊成功后的终局页.jpg`;
const STEP_22 = `${EVIDENCE_DIR}/topic-hero-attack/01-英雄攻击叛徒前.jpg`;
const STEP_23 = `${EVIDENCE_DIR}/topic-hero-attack/02-英雄攻击叛徒骰盘.jpg`;
const STEP_26 = `${EVIDENCE_DIR}/topic-jack-spirit/01-杰克之灵目标页.jpg`;
const STEP_27 = `${EVIDENCE_DIR}/topic-jack-spirit/02-杰克之灵攻击英雄前.jpg`;
const STEP_28 = `${EVIDENCE_DIR}/topic-jack-spirit/03-杰克之灵攻击骰盘.jpg`;
const STEP_29 = `${EVIDENCE_DIR}/13-山屋惊魂-教程-交易同房间说明.jpg`;
const STEP_30 = `${EVIDENCE_DIR}/14-山屋惊魂-教程-交易选择急救包.jpg`;
const STEP_31 = `${EVIDENCE_DIR}/15-山屋惊魂-教程-交易选择队友.jpg`;
const STEP_32 = `${EVIDENCE_DIR}/16-山屋惊魂-教程-交易选择对方地图.jpg`;
const STEP_33 = `${EVIDENCE_DIR}/17-山屋惊魂-教程-交易请求等待同意.jpg`;
const STEP_34 = `${EVIDENCE_DIR}/18-山屋惊魂-教程-交易自动同意公开结果.jpg`;
const STEP_36 = `${EVIDENCE_DIR}/02-山屋惊魂-教程-属性轨读法.jpg`;
const STEP_37 = `${EVIDENCE_DIR}/05-山屋惊魂-教程-观察队友视角.jpg`;
const STEP_37A = `${EVIDENCE_DIR}/06-山屋惊魂-教程-切到第二名队友视角.jpg`;
const STEP_37B = `${EVIDENCE_DIR}/07-山屋惊魂-教程-再次点队友返回上一视角.jpg`;
const STEP_38 = `${EVIDENCE_DIR}/08-山屋惊魂-教程-聚焦回自己房间.jpg`;
const STEP_39 = `${EVIDENCE_DIR}/09-山屋惊魂-教程-预兆作祟进度条.jpg`;
const STEP_40 = `${EVIDENCE_DIR}/topic-omen-confirmation/01-预兆牌确认与作祟检定.jpg`;
const STEP_42 = `${EVIDENCE_DIR}/topic-omen-confirmation/02-确认后回牌桌持有区.jpg`;
const STEP_43 = `${EVIDENCE_DIR}/topic-omen-confirmation/03-确认后预兆进度条.jpg`;
const STEP_HAUNT_NATURAL_01 = `${EVIDENCE_DIR}/haunt-natural-trigger-flow/01-当前玩家结束回合前.jpg`;
const STEP_HAUNT_NATURAL_02 = `${EVIDENCE_DIR}/haunt-natural-trigger-flow/02-等待队友一探索预兆房间.jpg`;
const STEP_HAUNT_NATURAL_03 = `${EVIDENCE_DIR}/haunt-natural-trigger-flow/03-队友一获得指环未触发.jpg`;
const STEP_HAUNT_NATURAL_04 = `${EVIDENCE_DIR}/haunt-natural-trigger-flow/04-队友二翻出狗未触发.jpg`;
const STEP_HAUNT_NATURAL_05 = `${EVIDENCE_DIR}/haunt-natural-trigger-flow/05-狗确认后回到当前玩家.jpg`;
const STEP_HAUNT_NATURAL_06 = `${EVIDENCE_DIR}/haunt-natural-trigger-flow/06-再次结束当前回合.jpg`;
const STEP_HAUNT_NATURAL_07 = `${EVIDENCE_DIR}/haunt-natural-trigger-flow/07-队友一翻出面具触发作祟.jpg`;
const STEP_HAUNT_NATURAL_08 = `${EVIDENCE_DIR}/haunt-natural-trigger-flow/08-当前玩家看到英雄开场过场.jpg`;
const STEP_HAUNT_NATURAL_09 = `${EVIDENCE_DIR}/haunt-natural-trigger-flow/09-开场过场继续进入英雄剧本书.jpg`;
const STEP_HAUNT_NATURAL_10 = `${EVIDENCE_DIR}/haunt-natural-trigger-flow/10-英雄剧本书目标页与图书馆原因.jpg`;
const STEP_HAUNT_NATURAL_11 = `${EVIDENCE_DIR}/haunt-natural-trigger-flow/11-读完剧本书目标准备关闭.jpg`;
const STEP_HAUNT_NATURAL_12 = `${EVIDENCE_DIR}/haunt-natural-trigger-flow/12-读完目标回到上层平台英雄.jpg`;
const STEP_HAUNT_NATURAL_13 = `${EVIDENCE_DIR}/haunt-natural-trigger-flow/13-读完目标后准备打开移动目标.jpg`;
const STEP_HAUNT_NATURAL_14 = `${EVIDENCE_DIR}/haunt-natural-trigger-flow/14-图书馆成为可点击移动目标.jpg`;
const STEP_HAUNT_NATURAL_15 = `${EVIDENCE_DIR}/haunt-natural-trigger-flow/15-轮到英雄寻找木乃伊真名.jpg`;
const STEP_HAUNT_NATURAL_16 = `${EVIDENCE_DIR}/haunt-natural-trigger-flow/16-寻找真名知识检定成功.jpg`;
const STEP_HAUNT_NATURAL_17 = `${EVIDENCE_DIR}/haunt-natural-trigger-flow/17-确认后回到牌桌可结束回合.jpg`;
const STEP_TRAITOR_01 = `${EVIDENCE_DIR}/traitor-path/01-叛徒打开木乃伊剧本目标页.jpg`;
const STEP_TRAITOR_02 = `${EVIDENCE_DIR}/traitor-path/02-木乃伊怪物回合开始前.jpg`;
const STEP_TRAITOR_03 = `${EVIDENCE_DIR}/traitor-path/03-木乃伊移动骰盘.jpg`;
const STEP_TRAITOR_04 = `${EVIDENCE_DIR}/traitor-path/04-木乃伊瞬移目标.jpg`;
const STEP_TRAITOR_05 = `${EVIDENCE_DIR}/traitor-path/05-木乃伊移动到女孩房间并携带女孩.jpg`;
const STEP_TRAITOR_06 = `${EVIDENCE_DIR}/traitor-path/06-木乃伊同房必须先攻击.jpg`;
const STEP_TRAITOR_07 = `${EVIDENCE_DIR}/traitor-path/07-木乃伊攻击目标高亮.jpg`;
const STEP_TRAITOR_08 = `${EVIDENCE_DIR}/traitor-path/08-木乃伊攻击骰盘.jpg`;
const STEP_TRAITOR_09 = `${EVIDENCE_DIR}/traitor-path/09-木乃伊偷取奖励入口.jpg`;
const STEP_TRAITOR_10 = `${EVIDENCE_DIR}/traitor-path/10-木乃伊偷走地图结果.jpg`;
const STEP_TRAITOR_VICTORY_01 = `${EVIDENCE_DIR}/topic-mummy-traitor-victory/01-胜利链合法起点.jpg`;
const STEP_TRAITOR_VICTORY_02 = `${EVIDENCE_DIR}/topic-mummy-traitor-victory/02-叛徒回看胜利条件.jpg`;
const STEP_TRAITOR_VICTORY_03 = `${EVIDENCE_DIR}/topic-mummy-traitor-victory/03-叛徒拾起女孩前.jpg`;
const STEP_TRAITOR_VICTORY_04 = `${EVIDENCE_DIR}/topic-mummy-traitor-victory/04-女孩交给木乃伊前.jpg`;
const STEP_TRAITOR_VICTORY_05 = `${EVIDENCE_DIR}/topic-mummy-traitor-victory/05-圣符交给木乃伊前.jpg`;
const STEP_TRAITOR_VICTORY_06 = `${EVIDENCE_DIR}/topic-mummy-traitor-victory/06-木乃伊叛徒胜利.jpg`;
const STEP_49 = `${EVIDENCE_DIR}/topic-mummy-monster/01-木乃伊怪物回合开始前.jpg`;
const STEP_50 = `${EVIDENCE_DIR}/topic-mummy-monster/02-木乃伊移动骰盘.jpg`;
const STEP_51 = `${EVIDENCE_DIR}/topic-mummy-monster/03-木乃伊瞬移目标.jpg`;
const STEP_52 = `${EVIDENCE_DIR}/topic-mummy-monster/04-木乃伊移动到女孩房间并携带女孩.jpg`;
const STEP_53 = `${EVIDENCE_DIR}/topic-mummy-monster/05-木乃伊同房必须先攻击.jpg`;
const STEP_54 = `${EVIDENCE_DIR}/topic-mummy-monster/06-木乃伊攻击目标高亮.jpg`;
const STEP_55 = `${EVIDENCE_DIR}/topic-mummy-monster/07-木乃伊攻击骰盘.jpg`;
const STEP_56 = `${EVIDENCE_DIR}/topic-mummy-monster/08-木乃伊偷取奖励入口.jpg`;
const STEP_57 = `${EVIDENCE_DIR}/topic-mummy-monster/09-木乃伊偷走地图结果.jpg`;
const TECHNICAL_ASSET_GATE_STEP = `${EVIDENCE_DIR}/技术证据-山屋惊魂-教程-素材加载门禁.jpg`;
const MOBILE_EVIDENCE_DIR = resolve(
  process.cwd(),
  "test-results/evidence-screenshots/betrayal/山屋惊魂-教程移动端横屏验收",
);
const MOBILE_STEP_01 = `${MOBILE_EVIDENCE_DIR}/01-手机横屏-教程移动入口.png`;
const PC_REGRESSION_EVIDENCE_DIR = resolve(
  process.cwd(),
  "test-results/evidence-screenshots/betrayal/pc-regression-current",
);
const PC_REGRESSION_STEP_USE_BOOK = `${PC_REGRESSION_EVIDENCE_DIR}/05-pc-移动入口-current.png`;
const PC_REGRESSION_STEP_BOARD = `${PC_REGRESSION_EVIDENCE_DIR}/03-pc-房间主视区-current.png`;

const expectScreenshotsVisiblyDifferent = async (
  leftPath: string,
  rightPath: string,
  label: string,
) => {
  const [left, right] = await Promise.all([
    sharp(leftPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(rightPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  expect(left.info.width, `${label} 宽度必须一致`).toBe(right.info.width);
  expect(left.info.height, `${label} 高度必须一致`).toBe(right.info.height);
  expect(left.info.channels, `${label} 通道数必须一致`).toBe(right.info.channels);
  let changedPixels = 0;
  let maxDelta = 0;
  let totalMaxDelta = 0;
  const channels = left.info.channels;
  for (let offset = 0; offset < left.data.length; offset += channels) {
    const pixelDelta = Math.max(
      Math.abs((left.data[offset] ?? 0) - (right.data[offset] ?? 0)),
      Math.abs((left.data[offset + 1] ?? 0) - (right.data[offset + 1] ?? 0)),
      Math.abs((left.data[offset + 2] ?? 0) - (right.data[offset + 2] ?? 0)),
    );
    totalMaxDelta += pixelDelta;
    maxDelta = Math.max(maxDelta, pixelDelta);
    if (pixelDelta >= 18) {
      changedPixels += 1;
    }
  }
  const pixelCount = left.info.width * left.info.height;
  const summary = {
    changedPixels,
    changedRatio: changedPixels / pixelCount,
    maxDelta,
    meanMaxDelta: totalMaxDelta / pixelCount,
  };
  expect(
    changedPixels,
    `${label} 不能再保存成像素相同的两张图：${JSON.stringify(summary)}`,
  ).toBeGreaterThan(1200);
  expect(
    maxDelta,
    `${label} 必须有肉眼可辨的像素变化：${JSON.stringify(summary)}`,
  ).toBeGreaterThan(60);
};

const expectGirlTokenMatchesExplorerBoardSize = async (
  page: Page,
  girlUnitTestId: string,
  label: string,
) => {
  const metrics = await page.evaluate((testId) => {
    const girl = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
    const explorer = document.querySelector<HTMLElement>(
      '[data-testid^="betrayal-explorer-figure-token-"]',
    );
    const girlRect = girl?.getBoundingClientRect();
    const explorerRect = explorer?.getBoundingClientRect();
    return {
      girlExists: Boolean(girl),
      explorerExists: Boolean(explorer),
      girlVisualSize: Number(girl?.dataset.tokenVisualSize ?? "0"),
      girlHeight: girlRect?.height ?? 0,
      explorerHeight: explorerRect?.height ?? 0,
    };
  }, girlUnitTestId);
  expect(metrics.girlExists, `${label} 必须能看到女孩 token：${JSON.stringify(metrics)}`).toBe(true);
  expect(metrics.explorerExists, `${label} 必须能看到玩家 token 作尺寸基准：${JSON.stringify(metrics)}`).toBe(true);
  expect(
    metrics.girlVisualSize,
    `${label} 女孩 token 必须保留和玩家 token 同层的设计尺寸：${JSON.stringify(metrics)}`,
  ).toBeGreaterThan(0);
  expect(
    Math.abs(metrics.girlHeight - metrics.explorerHeight),
    `${label} 女孩 token 屏幕高度必须和玩家 token 保持一致：${JSON.stringify(metrics)}`,
  ).toBeLessThanOrEqual(2);
};

const tradeActionPanelItemStep = (page: Page) =>
  page.locator(
    '[data-testid="betrayal-trade-action-panel"] [data-testid="betrayal-trade-flow-item-step"]',
  );

const tradeActionPanelTargetStep = (page: Page) =>
  page.locator(
    '[data-testid="betrayal-trade-action-panel"] [data-testid="betrayal-trade-flow-target-step"]',
  );

const readBetrayalOmenNamesByPlayer = (page: Page) =>
  page.evaluate(() => {
    type HarnessExplorer = {
      playerId?: string;
      inventory?: Array<{ kind?: string; name?: string }>;
    };
    const harness = (
      window as unknown as {
        __BG_TEST_HARNESS__?: {
          state?: {
            get?: () => {
              core?: {
                currentExplorer?: HarnessExplorer;
                otherExplorers?: HarnessExplorer[];
              };
            };
          };
        };
      }
    ).__BG_TEST_HARNESS__;
    const core = harness?.state?.get?.()?.core;
    const explorers = [
      core?.currentExplorer,
      ...(core?.otherExplorers ?? []),
    ].filter((explorer): explorer is HarnessExplorer => Boolean(explorer));
    return Object.fromEntries(
      explorers.map((explorer) => [
        explorer.playerId ?? "",
        (explorer.inventory ?? [])
          .filter((card) => card.kind === "omen")
          .map((card) => card.name ?? ""),
      ]),
    );
  });

const readBetrayalHauntTutorialState = (page: Page) =>
  page.evaluate(() => {
    const harness = (
      window as unknown as {
        __BG_TEST_HARNESS__?: {
          state?: {
            get?: () => {
              core?: {
                currentPlayer?: string;
                phase?: string;
                activeRoomId?: string;
                currentExplorer?: { playerId?: string; roomId?: string };
                recentRoll?: {
                  kind?: string;
                  dice?: unknown[];
                  sourceTitle?: string;
                  rollLabel?: string;
                  latestLabel?: string;
                  requiredPlayerIds?: string[];
                  acknowledgedPlayerIds?: string[];
                };
                recommendedAction?: string;
                scenarioRuntime?: {
                  hauntTriggered?: boolean;
                  hauntScenarioCardId?: string | null;
                  hauntRevealerPlayerId?: string | null;
                  traitorPlayerId?: string | null;
                  mummy?: {
                    knowledgeTokenCount?: number;
                    trueNameFound?: boolean;
                    banishmentSpellLearned?: boolean;
                  };
                };
              };
            };
          };
        };
      }
    ).__BG_TEST_HARNESS__;
    const core = harness?.state?.get?.()?.core;
    return {
      currentPlayer: core?.currentPlayer ?? null,
      currentExplorerRoomId: core?.currentExplorer?.roomId ?? null,
      activeRoomId: core?.activeRoomId ?? null,
      phase: core?.phase ?? null,
      hauntTriggered: core?.scenarioRuntime?.hauntTriggered ?? null,
      hauntScenarioCardId:
        core?.scenarioRuntime?.hauntScenarioCardId ?? null,
      hauntRevealerPlayerId:
        core?.scenarioRuntime?.hauntRevealerPlayerId ?? null,
      traitorPlayerId: core?.scenarioRuntime?.traitorPlayerId ?? null,
      recentRollKind: core?.recentRoll?.kind ?? null,
      recentRollDiceCount: core?.recentRoll?.dice?.length ?? null,
      recentRollSourceTitle: core?.recentRoll?.sourceTitle ?? null,
      recentRollLabel: core?.recentRoll?.rollLabel ?? null,
      recentRollLatestLabel: core?.recentRoll?.latestLabel ?? null,
      recentRollRequiredPlayerIds:
        core?.recentRoll?.requiredPlayerIds ?? null,
      recentRollAcknowledgedPlayerIds:
        core?.recentRoll?.acknowledgedPlayerIds ?? null,
      mummyKnowledgeTokenCount:
        core?.scenarioRuntime?.mummy?.knowledgeTokenCount ?? null,
      mummyTrueNameFound:
        core?.scenarioRuntime?.mummy?.trueNameFound ?? null,
      mummyBanishmentSpellLearned:
        core?.scenarioRuntime?.mummy?.banishmentSpellLearned ?? null,
      recommendedAction: core?.recommendedAction ?? null,
    };
  });

const waitForStep = async (
  page: Parameters<typeof test>[0]["page"],
  stepId: string,
  timeout = 15000,
) => {
  try {
    await expect(page.locator(`[data-tutorial-step="${stepId}"]`)).toBeVisible({
      timeout,
    });
  } catch (error) {
    const diagnostics = await page.evaluate((expectedStepId) => {
      const snapshot = (
        window as unknown as {
          __BG_TEST_HARNESS__?: {
            state?: {
              get?: () => {
                sys?: {
                  tutorial?: {
                    active?: boolean;
                    manifestId?: string | null;
                    stepIndex?: number;
                    steps?: unknown[];
                    totalSteps?: number;
                    step?: {
                      id?: string;
                      highlightTarget?: string;
                      aiActions?: unknown[];
                    } | null;
                    aiActions?: unknown[];
                    pendingAnimationAdvance?: boolean;
                  };
                };
                core?: { phase?: string };
              };
            };
          };
          __BG_TUTORIAL_CONTEXT_DIAGNOSTICS__?: unknown;
        }
      ).__BG_TEST_HARNESS__?.state?.get?.();
      const tutorial = snapshot?.sys?.tutorial;
      const highlightTarget = tutorial?.step?.highlightTarget ?? null;
      const target = highlightTarget
        ? document.querySelector(`[data-tutorial-id="${highlightTarget}"]`)
          ?? document.getElementById(highlightTarget)
          ?? document.querySelector(`[data-testid="${highlightTarget}"]`)
        : null;
      const activeStep = document.querySelector("[data-tutorial-step]");
      const overlayCard = document.querySelector('[data-testid="tutorial-overlay-card"]');
      const targetRect = target?.getBoundingClientRect();
      return {
        expectedStepId,
        href: window.location.href,
        contextDiagnostics:
          (window as unknown as { __BG_TUTORIAL_CONTEXT_DIAGNOSTICS__?: unknown })
            .__BG_TUTORIAL_CONTEXT_DIAGNOSTICS__ ?? null,
        tutorialActive: tutorial?.active ?? null,
        manifestId: tutorial?.manifestId ?? null,
        stepIndex: tutorial?.stepIndex ?? null,
        stepId: tutorial?.step?.id ?? null,
        stepsLength: tutorial?.steps?.length ?? null,
        totalSteps: tutorial?.totalSteps ?? null,
        stepAiActionCount: tutorial?.step?.aiActions?.length ?? 0,
        aiActionCount: tutorial?.aiActions?.length ?? 0,
        pendingAnimationAdvance: tutorial?.pendingAnimationAdvance ?? false,
        highlightTarget,
        highlightTargetFound: Boolean(target),
        highlightTargetRect: targetRect
          ? {
              x: Math.round(targetRect.x),
              y: Math.round(targetRect.y),
              width: Math.round(targetRect.width),
              height: Math.round(targetRect.height),
            }
          : null,
        activeStepDom: activeStep?.getAttribute("data-tutorial-step") ?? null,
        hasTutorialOverlayCard: Boolean(overlayCard),
        overlayText:
          overlayCard?.textContent?.replace(/\s+/g, " ").trim().slice(0, 300)
          ?? null,
        phase: snapshot?.core?.phase ?? null,
        bodyText:
          document.body.textContent?.replace(/\s+/g, " ").trim().slice(0, 800)
          ?? "",
      };
    }, stepId);
    throw new Error(
      `等待教程步骤 ${stepId} 超时。\n诊断：${JSON.stringify(
        diagnostics,
        null,
        2,
      )}\n原始错误：${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

const expectTutorialCardInForeground = async (
  page: Page,
  expectedText: string,
  coveredByTestId = "betrayal-scenario-reader-dialog",
) => {
  const card = page.getByTestId("tutorial-overlay-card");
  await expect(card).toBeVisible();
  await expect(card).toContainText(expectedText);
  await expect
    .poll(
      () =>
        page.evaluate((testId) => {
          const cardElement = document.querySelector<HTMLElement>(
            '[data-testid="tutorial-overlay-card"]',
          );
          const tutorialRoot =
            document.querySelector<HTMLElement>("[data-tutorial-step]");
          const coveredElement = document.querySelector<HTMLElement>(
            `[data-testid="${testId}"]`,
          );
          if (!cardElement) {
            return { cardForeground: false, reason: "missing-card" };
          }
          const rect = cardElement.getBoundingClientRect();
          const cardStyle = getComputedStyle(cardElement);
          const point = {
            x: Math.round(rect.left + rect.width / 2),
            y: Math.round(rect.top + rect.height / 2),
          };
          const topElement = document.elementFromPoint(point.x, point.y);
          const hitStack =
            typeof document.elementsFromPoint === "function"
              ? document.elementsFromPoint(point.x, point.y)
              : [];
          const stackCardIndex = hitStack.findIndex(
            (element) => element === cardElement || cardElement.contains(element),
          );
          const coveredRect = coveredElement?.getBoundingClientRect();
          const coveredStyle = coveredElement
            ? getComputedStyle(coveredElement)
            : null;
          const coveredVisible = Boolean(
            coveredElement &&
              coveredRect &&
              coveredRect.width > 0 &&
              coveredRect.height > 0 &&
              coveredStyle?.display !== "none" &&
              coveredStyle?.visibility !== "hidden",
          );
          const stackCoveredIndex = coveredElement
            ? hitStack.findIndex(
                (element) =>
                  element === coveredElement || coveredElement.contains(element),
              )
            : -1;
          const tutorialZIndex = tutorialRoot
            ? getComputedStyle(tutorialRoot).zIndex
            : null;
          const coveredZIndex = coveredElement
            ? getComputedStyle(coveredElement).zIndex
            : null;
          const tutorialZIndexNumber = Number.parseInt(tutorialZIndex ?? "", 10);
          const coveredZIndexNumber = Number.parseInt(coveredZIndex ?? "", 10);
          const zIndexAboveCovered =
            !coveredVisible ||
            Number.isNaN(coveredZIndexNumber) ||
            (!Number.isNaN(tutorialZIndexNumber) &&
              tutorialZIndexNumber > coveredZIndexNumber);
          const cardVisible =
            rect.width > 0 &&
            rect.height > 0 &&
            cardStyle.display !== "none" &&
            cardStyle.visibility !== "hidden" &&
            Number(cardStyle.opacity || "1") > 0.05;
          const pointerHitCard = Boolean(
            topElement && cardElement.contains(topElement),
          );
          const stackShowsCardAboveCovered =
            stackCardIndex >= 0 &&
            (stackCoveredIndex < 0 || stackCardIndex < stackCoveredIndex);
          return {
            cardForeground:
              cardVisible &&
              (pointerHitCard || stackShowsCardAboveCovered || zIndexAboveCovered),
            topTestId:
              topElement
                ?.closest("[data-testid]")
                ?.getAttribute("data-testid") ?? null,
            tutorialZIndex,
            coveredZIndex,
            cardPointerEvents: cardStyle.pointerEvents,
            stackCardIndex,
            stackCoveredIndex,
            cardRect: {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            },
          };
        }, coveredByTestId),
      {
        message: "教程卡必须在当前画面前景可见，截图里肉眼可读",
        timeout: 10000,
      },
    )
    .toMatchObject({ cardForeground: true });
};

const expectTutorialCardDoesNotCoverTargets = async (
  page: Page,
  targetTestIds: string[],
  label: string,
) => {
  const metrics = await page.evaluate((testIds) => {
    const card = document.querySelector<HTMLElement>(
      '[data-testid="tutorial-overlay-card"]',
    );
    if (!card) {
      return { hasCard: false, targets: [] };
    }
    const cardRect = card.getBoundingClientRect();
    const cardStyle = getComputedStyle(card);
    const cardVisible =
      cardRect.width > 0 &&
      cardRect.height > 0 &&
      cardStyle.display !== "none" &&
      cardStyle.visibility !== "hidden" &&
      Number(cardStyle.opacity || "1") > 0.05;
    const overlap = (targetRect: DOMRect) => {
      const width = Math.max(
        0,
        Math.min(cardRect.right, targetRect.right) -
          Math.max(cardRect.left, targetRect.left),
      );
      const height = Math.max(
        0,
        Math.min(cardRect.bottom, targetRect.bottom) -
          Math.max(cardRect.top, targetRect.top),
      );
      return Math.round(width * height);
    };

    return {
      hasCard: true,
      cardVisible,
      cardRect: {
        left: Math.round(cardRect.left),
        top: Math.round(cardRect.top),
        right: Math.round(cardRect.right),
        bottom: Math.round(cardRect.bottom),
        width: Math.round(cardRect.width),
        height: Math.round(cardRect.height),
      },
      targets: testIds.map((testId) => {
        const target = document.querySelector<HTMLElement>(
          `[data-testid="${testId}"], [data-tutorial-id="${testId}"]`,
        );
        if (!target) {
          return { testId, exists: false };
        }
        const targetRect = target.getBoundingClientRect();
        const targetStyle = getComputedStyle(target);
        const targetVisible =
          targetRect.width > 0 &&
          targetRect.height > 0 &&
          targetStyle.display !== "none" &&
          targetStyle.visibility !== "hidden" &&
          Number(targetStyle.opacity || "1") > 0.05;
        const centerElement = document.elementFromPoint(
          targetRect.left + targetRect.width / 2,
          targetRect.top + targetRect.height / 2,
        );
        return {
          testId,
          exists: true,
          targetVisible,
          overlapArea: overlap(targetRect),
          centerHitByCard: Boolean(centerElement && card.contains(centerElement)),
          targetRect: {
            left: Math.round(targetRect.left),
            top: Math.round(targetRect.top),
            right: Math.round(targetRect.right),
            bottom: Math.round(targetRect.bottom),
            width: Math.round(targetRect.width),
            height: Math.round(targetRect.height),
          },
        };
      }),
    };
  }, targetTestIds);

  expect(metrics.hasCard, `${label} 必须有教程卡用于截图验收`).toBe(true);
  expect(metrics.cardVisible, `${label} 教程卡必须真实可见`).toBe(true);
  for (const target of metrics.targets) {
    expect(target.exists, `${label} 目标 ${target.testId} 必须存在`).toBe(true);
    expect(
      target.targetVisible,
      `${label} 目标 ${target.testId} 必须真实可见`,
    ).toBe(true);
    expect(
      target.centerHitByCard,
      `${label} 教程卡不能盖住 ${target.testId} 的主视觉中心：${JSON.stringify(metrics)}`,
    ).toBe(false);
    expect(
      target.overlapArea,
      `${label} 教程卡不能和 ${target.testId} 目标主体重叠：${JSON.stringify(metrics)}`,
    ).toBe(0);
  }
};

const waitForTradeAgreementState = async (
  page: Parameters<typeof test>[0]["page"],
  state: "waiting" | "incoming",
  timeout = 15000,
) => {
  await expect(page.getByTestId("betrayal-trade-flow-banner")).toHaveAttribute(
    "data-trade-agreement-state",
    state,
    { timeout },
  );
};

const waitForAutoAcceptedTradeReview = async (
  page: Parameters<typeof test>[0]["page"],
  timeout = 30000,
) => {
  await waitForStep(page, "trade-review", timeout);
  await expect(
    page.getByTestId("betrayal-trade-agreement-panel"),
  ).toHaveCount(0);
  await expect(
    page.getByTestId("betrayal-trade-agreement-accept"),
  ).toHaveCount(0);
  await expect(
    page.getByTestId("betrayal-trade-agreement-decline"),
  ).toHaveCount(0);
  await expect(
    page.getByTestId("betrayal-room-latest-feedback"),
  ).toContainText(/同意交易|急救包|地图/, { timeout });

  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const step = document.querySelector(
            '[data-tutorial-step="trade-review"]',
          );
          const state = (
            window as unknown as {
              __BG_TEST_HARNESS__?: {
                state?: {
                  get?: () => {
                    core?: {
                      pendingTradeAgreement?: {
                        playerId?: string;
                        targetPlayerId?: string;
                      } | null;
                    };
                  };
                };
              };
            }
          ).__BG_TEST_HARNESS__?.state?.get?.();
          const pending = state?.core?.pendingTradeAgreement ?? null;

          return {
            stepReady: Boolean(step),
            pendingCleared: pending === null,
          };
        }),
      {
        message:
          "交易教程必须由队友自动回应后停在公开结果页，不能还残留接收方同意按钮或待同意状态",
        timeout,
      },
    )
    .toEqual({
      stepReady: true,
      pendingCleared: true,
    });
};

const expectBetrayalConfirmButtonVisual = async (
  button: Locator,
  label: string,
) => {
  await expect(button, `${label} 必须使用山屋惊魂统一确认按钮底色`).toHaveCSS(
    "background-color",
    "rgb(214, 181, 109)",
  );
  await expect(button, `${label} 必须使用山屋惊魂统一确认按钮边框色`).toHaveCSS(
    "border-top-color",
    "rgb(214, 181, 109)",
  );
  await expect(button, `${label} 不能保留另一套圆角确认样式`).toHaveCSS(
    "border-radius",
    "0px",
  );
};

const waitForHauntRuntime = async (
  page: Parameters<typeof test>[0]["page"],
  timeout = 30000,
) => {
  await expect(page.getByTestId("betrayal-board")).toBeVisible({ timeout });
  await expect(page.getByTestId("betrayal-runtime-header-grid")).toContainText(
    /作祟中|Haunt/i,
    { timeout },
  );
};

const resolveCurrentRoomExplorerTarget = async (
  page: Page,
  mode: "attack-hero" | "attack-traitor",
): Promise<{ roomId: string; playerId: string }> => {
  const target = await page.evaluate((targetMode) => {
    const state = (
      window as unknown as {
        __BG_TEST_HARNESS__?: {
          state?: {
            get?: () => {
              core?: {
                activeRoomId?: string;
                currentExplorer?: { playerId?: string; roomId?: string };
                otherExplorers?: Array<{
                  playerId: string;
                  roomId: string;
                  displayName?: string;
                }>;
                scenarioRuntime?: {
                  traitorPlayerId?: string;
                  deadExplorerPlayerIds?: string[];
                };
              };
            };
          };
        };
      }
    ).__BG_TEST_HARNESS__?.state?.get?.();
    const core = state?.core;
    const roomId = core?.activeRoomId ?? core?.currentExplorer?.roomId;
    if (!core || !roomId) return null;
    const deadIds = core.scenarioRuntime?.deadExplorerPlayerIds ?? [];
    const candidates =
      core.otherExplorers?.filter(
        (explorer) =>
          explorer.roomId === roomId && !deadIds.includes(explorer.playerId),
      ) ?? [];
    const playerId =
      targetMode === "attack-traitor"
        ? candidates.find(
            (explorer) =>
              explorer.playerId === core.scenarioRuntime?.traitorPlayerId,
          )?.playerId
        : candidates.find(
            (explorer) =>
              explorer.playerId !== core.scenarioRuntime?.traitorPlayerId,
          )?.playerId;
    if (!playerId) return null;
    return { roomId, playerId };
  }, mode);

  expect(
    target,
    `山屋教程 ${mode} 必须能从当前运行状态找到同房间目标 token`,
  ).not.toBeNull();
  return target!;
};

const resolveMummyBanishRoomTarget = async (
  page: Page,
): Promise<{ roomId: string; monsterId: string }> => {
  const target = await page.evaluate(() => {
    const state = (
      window as unknown as {
        __BG_TEST_HARNESS__?: {
          state?: {
            get?: () => {
              core?: {
                currentExplorer?: { roomId?: string };
                monsters?: Array<{ id: string; roomId: string }>;
                scenarioRuntime?: {
                  mummy?: {
                    mummyMonsterId?: string;
                    sarcophagusRoomId?: string;
                  };
                };
              };
            };
          };
        };
      }
    ).__BG_TEST_HARNESS__?.state?.get?.();
    const core = state?.core;
    const mummyMonsterId = core?.scenarioRuntime?.mummy?.mummyMonsterId;
    const sarcophagusRoomId = core?.scenarioRuntime?.mummy?.sarcophagusRoomId;
    if (!core || !mummyMonsterId || !sarcophagusRoomId) return null;
    const mummy = core.monsters?.find((monster) => monster.id === mummyMonsterId);
    if (!mummy || mummy.roomId !== sarcophagusRoomId) return null;
    if (core.currentExplorer?.roomId !== sarcophagusRoomId) return null;
    return { roomId: sarcophagusRoomId, monsterId: mummyMonsterId };
  });

  expect(
    target,
    "木乃伊驱逐教程必须从当前运行态找到英雄、木乃伊和石棺同房的房间牌目标",
  ).not.toBeNull();
  return target!;
};

const resolveMummyTraitorTutorialTarget = async (
  page: Page,
): Promise<{ roomId: string; traitorId: string; girlTokenTestId: string; sarcophagusTokenTestId: string }> => {
  const target = await page.evaluate(() => {
    const state = (
      window as unknown as {
        __BG_TEST_HARNESS__?: {
          state?: {
            get?: () => {
              core?: {
                currentExplorer?: { playerId?: string; roomId?: string };
                monsters?: Array<{ id: string; roomId: string }>;
                scenarioRuntime?: {
                  traitorPlayerId?: string | null;
                  mummy?: {
                    mummyMonsterId?: string;
                    sarcophagusRoomId?: string;
                    girlRoomId?: string | null;
                  };
                };
              };
            };
          };
        };
      }
    ).__BG_TEST_HARNESS__?.state?.get?.();
    const core = state?.core;
    const traitorId = core?.scenarioRuntime?.traitorPlayerId ?? null;
    const mummy = core?.scenarioRuntime?.mummy;
    const roomId = core?.currentExplorer?.roomId;
    const mummyMonster = core?.monsters?.find((monster) => monster.id === mummy?.mummyMonsterId);
    if (!core || !traitorId || !mummy || !roomId || !mummyMonster) return null;
    if (core.currentExplorer?.playerId !== traitorId) return null;
    if (mummy.sarcophagusRoomId !== roomId || mummy.girlRoomId !== roomId) return null;
    if (mummyMonster.roomId !== roomId) return null;
    return {
      roomId,
      traitorId,
      girlTokenTestId: `betrayal-room-haunt-token-${roomId}-mummy-girl-token`,
      sarcophagusTokenTestId: `betrayal-room-haunt-token-${roomId}-mummy-sarcophagus`,
    };
  });

  expect(
    target,
    "木乃伊叛徒教程必须从叛徒、女孩、木乃伊、石棺同房且圣符在手的真实状态开始",
  ).not.toBeNull();
  return target!;
};

const resolveMummyMonsterMoveTutorialTarget = async (
  page: Page,
): Promise<{
  traitorId: string;
  mummyRoomId: string;
  mummyRoomFloor: string;
  girlRoomId: string;
  girlRoomFloor: string;
  girlRoomName: string;
  girlTokenTestId: string;
  unrevealedRoomId: string | null;
}> => {
  const target = await page.evaluate(() => {
    const state = (
      window as unknown as {
        __BG_TEST_HARNESS__?: {
          state?: {
            get?: () => {
              core?: {
                currentExplorer?: { playerId?: string };
                rooms?: Array<{ id: string; name: string; floor: string; state?: string }>;
                monsters?: Array<{ id: string; roomId: string }>;
                scenarioRuntime?: {
                  traitorPlayerId?: string | null;
                  mummy?: {
                    mummyMonsterId?: string;
                    sarcophagusRoomId?: string;
                    girlRoomId?: string | null;
                    girlHeldByMummy?: boolean;
                  };
                };
              };
            };
          };
        };
      }
    ).__BG_TEST_HARNESS__?.state?.get?.();
    const core = state?.core;
    const traitorId = core?.scenarioRuntime?.traitorPlayerId ?? null;
    const mummy = core?.scenarioRuntime?.mummy;
    const mummyMonster = core?.monsters?.find((monster) => monster.id === mummy?.mummyMonsterId);
    const mummyRoom = core?.rooms?.find((room) => room.id === mummyMonster?.roomId);
    const girlRoom = core?.rooms?.find((room) => room.id === mummy?.girlRoomId);
    const unrevealedRoom = core?.rooms?.find((room) => room.state !== "discovered") ?? null;
    if (!core || !traitorId || !mummy || !mummyMonster || !mummyRoom || !girlRoom || !mummy.girlRoomId) {
      return null;
    }
    if (core.currentExplorer?.playerId !== traitorId || mummy.girlHeldByMummy) {
      return null;
    }
    return {
      traitorId,
      mummyRoomId: mummyMonster.roomId,
      mummyRoomFloor: mummyRoom.floor,
      girlRoomId: mummy.girlRoomId,
      girlRoomFloor: girlRoom.floor,
      girlRoomName: girlRoom.name,
      girlTokenTestId: `betrayal-room-haunt-token-${mummy.girlRoomId}-mummy-girl-token`,
      unrevealedRoomId: unrevealedRoom?.id ?? null,
    };
  });

  expect(
    target,
    "木乃伊怪物移动教程必须从叛徒操控、木乃伊和女孩分处已发现房间的真实状态开始",
  ).not.toBeNull();
  return target!;
};

const resolveMummyMonsterAttackTutorialTarget = async (
  page: Page,
): Promise<{
  traitorId: string;
  mummyRoomId: string;
  mummyRoomFloor: string;
  heroTargetId: string;
  deadHeroId: string | null;
}> => {
  const target = await page.evaluate(() => {
    const state = (
      window as unknown as {
        __BG_TEST_HARNESS__?: {
          state?: {
            get?: () => {
              core?: {
                currentExplorer?: { playerId?: string };
                otherExplorers?: Array<{ playerId: string; roomId: string; inventory?: Array<{ id: string }> }>;
                rooms?: Array<{ id: string; floor: string }>;
                monsters?: Array<{ id: string; roomId: string }>;
                scenarioRuntime?: {
                  traitorPlayerId?: string | null;
                  deadExplorerPlayerIds?: string[];
                  mummy?: { mummyMonsterId?: string };
                };
              };
            };
          };
        };
      }
    ).__BG_TEST_HARNESS__?.state?.get?.();
    const core = state?.core;
    const traitorId = core?.scenarioRuntime?.traitorPlayerId ?? null;
    const deadIds = core?.scenarioRuntime?.deadExplorerPlayerIds ?? [];
    const mummyMonster = core?.monsters?.find((monster) => monster.id === core?.scenarioRuntime?.mummy?.mummyMonsterId);
    const mummyRoom = core?.rooms?.find((room) => room.id === mummyMonster?.roomId);
    if (!core || !traitorId || !mummyMonster || !mummyRoom || core.currentExplorer?.playerId !== traitorId) {
      return null;
    }
    const sameRoomExplorers = core.otherExplorers?.filter((explorer) => explorer.roomId === mummyMonster.roomId) ?? [];
    const heroTarget = sameRoomExplorers.find((explorer) => (
      explorer.playerId !== traitorId
      && !deadIds.includes(explorer.playerId)
      && explorer.inventory?.some((card) => card.id === "map")
    ));
    if (!heroTarget) {
      return null;
    }
    return {
      traitorId,
      mummyRoomId: mummyMonster.roomId,
      mummyRoomFloor: mummyRoom.floor,
      heroTargetId: heroTarget.playerId,
      deadHeroId: sameRoomExplorers.find((explorer) => deadIds.includes(explorer.playerId))?.playerId ?? null,
    };
  });

  expect(
    target,
    "木乃伊攻击教程必须从木乃伊、叛徒和持地图英雄同房的真实状态开始",
  ).not.toBeNull();
  return target!;
};

const switchRoomMapToFloor = async (page: Page, floor: string): Promise<void> => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (await page.getByTestId(`betrayal-room-floor-${floor}`).isVisible({ timeout: 500 }).catch(() => false)) {
      return;
    }
    const upperVisible = await page.getByTestId("betrayal-room-floor-upper")
      .isVisible({ timeout: 250 })
      .catch(() => false);
    const basementVisible = await page.getByTestId("betrayal-room-floor-basement")
      .isVisible({ timeout: 250 })
      .catch(() => false);
    if (floor === "upper" || (floor === "ground" && basementVisible)) {
      await page.getByTestId("betrayal-room-floor-up").click();
    } else if (floor === "basement" || (floor === "ground" && upperVisible)) {
      await page.getByTestId("betrayal-room-floor-down").click();
    }
  }
  await expect(page.getByTestId(`betrayal-room-floor-${floor}`)).toBeVisible();
};

const expectImageLoaded = async (
  locator: ReturnType<Parameters<typeof test>[0]["page"]["locator"]>,
) => {
  await expect
    .poll(async () =>
      locator.evaluate((node) => {
        const image =
          node instanceof HTMLImageElement ? node : node.querySelector("img");
        return Boolean(
          image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0,
        );
      }),
    )
    .toBe(true);
};

const expectVisiblePhysicalDiceBox = async (rollPanel: Locator) => {
  const diceGroup = rollPanel.getByTestId("betrayal-house-dice-3d-group");
  await expect(diceGroup).toBeVisible();
  await expect(diceGroup).toHaveAttribute(
    "data-render-mode",
    "betrayal-house-dice-box-visible",
  );
  await expect(diceGroup).toHaveAttribute(
    "data-dice-tray-style",
    "transparent-virtual",
  );
  await expect(diceGroup).toHaveAttribute("data-dice-count", /[1-9]/);
  await expect
    .poll(async () => diceGroup.getAttribute("data-dice-physics-ready"), {
      timeout: 10000,
    })
    .toBe("true");

  const physicsSource = rollPanel.getByTestId(
    "betrayal-house-dice-physics-source",
  );
  await expect(physicsSource).toHaveAttribute(
    "data-dice-physics-source",
    "dice-box-threejs",
  );
  await expect(physicsSource).toHaveAttribute(
    "data-dice-physics-mode",
    "debug-visible",
  );
  await expect(physicsSource).toHaveAttribute(
    "data-dice-face-system",
    "betrayal-house-0-0-1-1-2-2-face-skin",
  );
  await expect
    .poll(
      async () =>
        diceGroup.evaluate((node) => {
          const canvases = Array.from(node.querySelectorAll("canvas")).filter(
            (canvas): canvas is HTMLCanvasElement =>
              canvas instanceof HTMLCanvasElement,
          );
          const source = node.querySelector(
            '[data-testid="betrayal-house-dice-physics-source"]',
          ) as HTMLElement | null;
          if (source?.dataset.dicePhysicsSource !== "dice-box-threejs")
            return false;
          if (
            source?.dataset.diceFaceSystem !==
            "betrayal-house-0-0-1-1-2-2-face-skin"
          )
            return false;

          return canvases.some((canvas) => {
            const rect = canvas.getBoundingClientRect();
            const style = window.getComputedStyle(canvas);
            return (
              rect.width >= 160 &&
              rect.height >= 120 &&
              canvas.dataset.skinsReady === "true" &&
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              Number(style.opacity || "1") > 0.5
            );
          });
        }),
      { timeout: 10000 },
    )
    .toBe(true);
};

const expectRabbitFootRerollWebglHighlights = async (
  rollPanel: Locator,
  selectedDieIndex: number | null,
) => {
  const readMetrics = async () =>
    rollPanel.evaluate((node, expectedSelectedDieIndex) => {
      const panel = node as HTMLElement;
      const layer = panel.querySelector(
        '[data-testid="betrayal-rabbit-foot-dice"]',
      ) as HTMLElement | null;
      const source = panel.querySelector(
        '[data-testid="betrayal-house-dice-physics-source"]',
      ) as HTMLElement | null;
      const group = panel.querySelector(
        '[data-testid="betrayal-house-dice-3d-group"]',
      ) as HTMLElement | null;
      const canvases = Array.from(panel.querySelectorAll("canvas")).filter(
        (candidate): candidate is HTMLCanvasElement =>
          candidate instanceof HTMLCanvasElement,
      );
      const debugRegistry =
        (
          window as typeof window & {
            __diceBoxThreeDebug?: Record<string, () => {
              diceHighlights?: Array<{
                dieIndex?: number;
                variant?: string;
                scale?: number;
                opacity?: number;
              }>;
              diceHighlightShells?: Array<{
                dieIndex?: number;
                variant?: string;
                renderer?: string;
                visible?: boolean;
                scale?: number;
                opacity?: number;
                materialType?: string;
                materialSide?: number;
                depthWrite?: boolean;
                transparent?: boolean;
                shaderOpacity?: number;
              }>;
            } | null>;
          }
        ).__diceBoxThreeDebug ?? {};
      const activeCanvas =
        canvases.find((canvas) => {
          const testId = canvas.dataset.testid;
          return Boolean(testId && typeof debugRegistry[testId] === "function");
        }) ??
        canvases[0] ??
        null;
      const activeCanvasTestId =
        activeCanvas?.dataset.testid ?? group?.dataset.diceDebugKey;
      const snapshot = activeCanvasTestId
        ? debugRegistry[activeCanvasTestId]?.()
        : null;
      const highlights = Array.isArray(snapshot?.diceHighlights)
        ? snapshot.diceHighlights
        : [];
      const shells = Array.isArray(snapshot?.diceHighlightShells)
        ? snapshot.diceHighlightShells
        : [];
      const targets = Array.from(
        layer?.querySelectorAll<HTMLElement>(
          '[data-testid^="betrayal-house-dice-reroll-target-"]',
        ) ?? [],
      )
        .filter((target) => target.offsetParent !== null)
        .map((target) => {
          const dieIndex = Number(
            target.dataset.testid?.match(/-(\d+)$/)?.[1] ?? "NaN",
          );
          const rect = target.getBoundingClientRect();
          const visibleWidth = Number(target.dataset.rerollTargetVisualWidth);
          const visibleHeight = Number(target.dataset.rerollTargetVisualHeight);
          const boxSize = Number(target.dataset.rerollTargetBoxSize);
          const visibleMax = Math.max(visibleWidth, visibleHeight);
          return {
            dieIndex,
            selected: target.dataset.rerollTargetSelected === "true",
            shape: target.dataset.rerollTargetShape ?? "",
            highlightRenderer: target.dataset.rerollTargetHighlightRenderer ?? "",
            visualLayer: target.dataset.rerollTargetVisualLayer ?? "",
            targetWidth: rect.width,
            targetHeight: rect.height,
            visibleMax,
            hitBoxPadding: (boxSize - visibleMax) / 2,
            domCandidateVisualExists: Boolean(
              target.querySelector(
                '[data-reroll-target-candidate-underline="true"], [data-reroll-target-candidate-box="true"]',
              ),
            ),
            selectedBorderExists: Boolean(
              target.querySelector(
                '[data-reroll-target-selected-border="true"]',
              ),
            ),
            highlight:
              highlights.find((highlight) => highlight.dieIndex === dieIndex) ??
              null,
            shell:
              shells.find((shell) => shell.dieIndex === dieIndex) ?? null,
          };
        });

      return {
        expectedSelectedDieIndex,
        layerExists: Boolean(layer),
        layerRenderer: layer?.dataset.rerollHighlightRenderer ?? "",
        sourceRenderer: source?.dataset.diceHighlightRenderer ?? "",
        canvasRenderer: activeCanvas?.dataset.diceHighlightRenderer ?? "",
        domVisualBoxCount: layer
          ? layer.querySelectorAll(
              '[data-reroll-target-candidate-underline="true"], [data-reroll-target-candidate-box="true"], [data-reroll-target-selected-border="true"]',
            ).length
          : 0,
        highlightCount: highlights.length,
        shellCount: shells.length,
        candidateCount: highlights.filter(
          (highlight) => highlight.variant === "candidate",
        ).length,
        selectedCount: highlights.filter(
          (highlight) => highlight.variant === "selected",
        ).length,
        targets,
      };
    }, selectedDieIndex);

  await expect
    .poll(
      async () => {
        const metrics = await readMetrics();
        const expectedSelectedCount = selectedDieIndex === null ? 0 : 1;
        if (!metrics.layerExists) return "missing-layer";
        if (metrics.layerRenderer !== "threejs-backside-shader-shell")
          return `bad-layer:${metrics.layerRenderer}`;
        if (metrics.sourceRenderer !== "threejs-backside-shader-shell")
          return `bad-source:${metrics.sourceRenderer}`;
        if (metrics.canvasRenderer !== "threejs-backside-shader-shell")
          return `bad-canvas:${metrics.canvasRenderer}`;
        if (metrics.targets.length <= 0) return "missing-targets";
        if (metrics.domVisualBoxCount !== 0)
          return `dom-boxes:${metrics.domVisualBoxCount}`;
        if (metrics.highlightCount !== metrics.targets.length)
          return `highlights:${metrics.highlightCount}/${metrics.targets.length}`;
        if (metrics.shellCount !== metrics.targets.length)
          return `shells:${metrics.shellCount}/${metrics.targets.length}`;
        if (metrics.selectedCount !== expectedSelectedCount)
          return `selected:${metrics.selectedCount}/${expectedSelectedCount}`;
        if (metrics.candidateCount !== metrics.targets.length - expectedSelectedCount)
          return `candidate:${metrics.candidateCount}`;
        return "ready";
      },
      { timeout: 5000 },
    )
    .toBe("ready");

  const metrics = await readMetrics();
  for (const target of metrics.targets) {
    const evidence = JSON.stringify({ target, metrics });
    expect(target.shape, `兔脚选骰热区必须绑定骰子本体：${evidence}`).toBe(
      "die-face",
    );
    expect(Math.abs(target.targetWidth - target.targetHeight)).toBeLessThanOrEqual(1);
    expect(target.visibleMax).toBeGreaterThan(0);
    expect(target.hitBoxPadding).toBeGreaterThanOrEqual(0);
    expect(target.hitBoxPadding).toBeLessThanOrEqual(0.75);
    expect(
      target.highlightRenderer,
      `兔脚选骰高亮必须来自 Three.js 骰体描边，而不是 DOM 框或底线：${evidence}`,
    ).toBe("threejs-backside-shader-shell");
    expect(target.visualLayer).toBe("transparent-hitbox-only");
    expect(
      target.domCandidateVisualExists,
      `DOM 层不得保留候选底线或候选框：${evidence}`,
    ).toBe(false);
    expect(target.selectedBorderExists).toBe(false);
    expect(target.highlight, `缺少 Three.js 高亮状态：${evidence}`).not.toBeNull();
    expect(target.shell, `缺少 Three.js 描边外壳：${evidence}`).not.toBeNull();
    expect(target.shell?.renderer).toBe("threejs-backside-shader-shell");
    expect(target.shell?.visible).toBe(true);
    expect(target.shell?.materialType).toBe("ShaderMaterial");
    expect(target.shell?.materialSide).toBe(1);
    expect(target.shell?.depthWrite).toBe(false);
    expect(target.shell?.transparent).toBe(true);
    expect(target.shell?.shaderOpacity).toBe(target.shell?.opacity);
    if (target.dieIndex === selectedDieIndex) {
      expect(target.selected).toBe(true);
      expect(target.highlight?.variant).toBe("selected");
      expect(target.shell?.variant).toBe("selected");
      expect(target.shell?.scale).toBeGreaterThanOrEqual(1.06);
      expect(target.shell?.scale).toBeLessThanOrEqual(1.075);
      expect(target.shell?.opacity).toBeGreaterThanOrEqual(0.9);
    } else {
      expect(target.selected).toBe(false);
      expect(target.highlight?.variant).toBe("candidate");
      expect(target.shell?.variant).toBe("candidate");
      expect(target.shell?.scale).toBeGreaterThanOrEqual(1.04);
      expect(target.shell?.scale).toBeLessThanOrEqual(1.055);
      expect(target.shell?.opacity).toBeGreaterThanOrEqual(0.9);
    }
  }
};

const waitForPhysicalDiceSettled = async (rollPanel: Locator) => {
  const physicsSource = rollPanel.getByTestId(
    "betrayal-house-dice-physics-source",
  );
  await expect
    .poll(async () => physicsSource.getAttribute("data-dice-settled"), {
      timeout: 15000,
    })
    .toBe("true");
  await rollPanel.page().waitForTimeout(450);
};

const expectInventoryCardHasSingleSymmetricOutline = async (card: Locator) => {
  const outline = await card.evaluate((node) => {
    const button = node as HTMLElement;
    const shell = button.querySelector(
      '[data-testid$="-shell"]',
    ) as HTMLElement | null;
    const modifier = button.querySelector(
      '[data-testid$="-roll-modifier"]',
    ) as HTMLElement | null;
    const selectedOutline = button.querySelector(
      '[data-testid$="-selected-outline"]',
    ) as HTMLElement | null;
    const buttonStyle = window.getComputedStyle(button);
    const shellStyle = shell ? window.getComputedStyle(shell) : null;
    const modifierStyle = modifier ? window.getComputedStyle(modifier) : null;
    const selectedOutlineStyle = selectedOutline
      ? window.getComputedStyle(selectedOutline)
      : null;
    const modifierRect = modifier?.getBoundingClientRect();
    const selectedOutlineRect = selectedOutline?.getBoundingClientRect();
    const shellRect = shell?.getBoundingClientRect();
    return {
      buttonShadowLayers:
        buttonStyle.boxShadow === "none"
          ? 0
          : buttonStyle.boxShadow.split("),").length,
      buttonOutlineStyle: buttonStyle.outlineStyle,
      buttonOutlineWidth: buttonStyle.outlineWidth,
      buttonRingShadow: buttonStyle.getPropertyValue("--tw-ring-shadow"),
      shellBoxShadow: shellStyle?.boxShadow ?? null,
      modifierExists: Boolean(modifier),
      selectedOutlineExists: Boolean(selectedOutline),
      selectedBorderTop: selectedOutlineStyle?.borderTopWidth ?? null,
      selectedBorderRight: selectedOutlineStyle?.borderRightWidth ?? null,
      selectedBorderBottom: selectedOutlineStyle?.borderBottomWidth ?? null,
      selectedBorderLeft: selectedOutlineStyle?.borderLeftWidth ?? null,
      selectedShape: selectedOutline?.dataset.highlightShape ?? null,
      selectedBorderRadius: selectedOutlineStyle?.borderTopLeftRadius ?? null,
      selectedBorderRadiusNumber: selectedOutlineStyle
        ? Number.parseFloat(selectedOutlineStyle.borderTopLeftRadius)
        : null,
      selectedWidth: selectedOutlineRect
        ? Math.round(selectedOutlineRect.width)
        : null,
      selectedHeight: selectedOutlineRect
        ? Math.round(selectedOutlineRect.height)
        : null,
      modifierBorderTop: modifierStyle?.borderTopWidth ?? null,
      modifierBorderRight: modifierStyle?.borderRightWidth ?? null,
      modifierBorderBottom: modifierStyle?.borderBottomWidth ?? null,
      modifierBorderLeft: modifierStyle?.borderLeftWidth ?? null,
      modifierShape: modifier?.dataset.highlightShape ?? null,
      modifierBorderRadius: modifierStyle?.borderTopLeftRadius ?? null,
      modifierBorderRadiusNumber: modifierStyle
        ? Number.parseFloat(modifierStyle.borderTopLeftRadius)
        : null,
      modifierWidth: modifierRect ? Math.round(modifierRect.width) : null,
      modifierHeight: modifierRect ? Math.round(modifierRect.height) : null,
      selectedInsetLeft:
        selectedOutlineRect && shellRect
          ? Math.round(selectedOutlineRect.left - shellRect.left)
          : null,
      selectedInsetRight:
        selectedOutlineRect && shellRect
          ? Math.round(shellRect.right - selectedOutlineRect.right)
          : null,
      selectedInsetTop:
        selectedOutlineRect && shellRect
          ? Math.round(selectedOutlineRect.top - shellRect.top)
          : null,
      selectedInsetBottom:
        selectedOutlineRect && shellRect
          ? Math.round(shellRect.bottom - selectedOutlineRect.bottom)
          : null,
      modifierInsetLeft:
        modifierRect && shellRect
          ? Math.round(modifierRect.left - shellRect.left)
          : null,
      modifierInsetRight:
        modifierRect && shellRect
          ? Math.round(shellRect.right - modifierRect.right)
          : null,
      modifierInsetTop:
        modifierRect && shellRect
          ? Math.round(modifierRect.top - shellRect.top)
          : null,
      modifierInsetBottom:
        modifierRect && shellRect
          ? Math.round(shellRect.bottom - modifierRect.bottom)
          : null,
    };
  });
  expect(
    outline.buttonShadowLayers,
    "选中/可改骰按钮外发光不能叠成多圈描边",
  ).toBeLessThanOrEqual(2);
  expect(outline.buttonOutlineStyle, "持有物按钮本体不能再出现矩形焦点框").toBe(
    "none",
  );
  expect(outline.buttonOutlineWidth, "持有物按钮本体不能再出现矩形焦点框").toBe(
    "0px",
  );
  expect(
    outline.buttonRingShadow,
    "持有物按钮本体不能再叠 Tailwind 矩形 ring",
  ).toBe("0 0 #0000");
  expect(outline.shellBoxShadow, "卡牌壳层内部不应额外叠阴影").toBe("none");
  expect(
    outline.modifierExists,
    "选中态不能再叠加内部改骰描边，避免左边和下边视觉加粗",
  ).toBe(false);
  expect(outline.selectedOutlineExists, "选中态需要一层独立外描边").toBe(true);
  expect(outline.selectedBorderTop).toBe("2px");
  expect(outline.selectedBorderRight).toBe("2px");
  expect(outline.selectedBorderBottom).toBe("2px");
  expect(outline.selectedBorderLeft).toBe("2px");
  expect(
    outline.selectedShape,
    "持有物卡牌选中态必须使用贴合卡牌本体的卡形外描边",
  ).toBe("card");
  expect(
    outline.selectedWidth ?? 0,
    "卡形外描边必须覆盖完整卡牌宽度",
  ).toBeGreaterThan(24);
  expect(
    outline.selectedHeight ?? 0,
    "卡形外描边必须覆盖完整卡牌高度",
  ).toBeGreaterThan(24);
  expect(
    outline.selectedBorderRadiusNumber ?? 0,
    "卡形外描边必须保留卡牌圆角，而不是骰子圆形圈",
  ).toBeGreaterThan(0);
  expect(outline.selectedInsetLeft, "选中外描边左侧外扩必须和右侧对称").toBe(
    outline.selectedInsetRight,
  );
  expect(outline.selectedInsetTop, "选中外描边上侧外扩必须和下侧对称").toBe(
    outline.selectedInsetBottom,
  );
};

const expectInventoryCandidateCardHasAtlas = async (
  card: Locator,
  testId: string,
) => {
  const metrics = await card.evaluate((node, currentTestId) => {
    const button = node as HTMLElement;
    const rect = button.getBoundingClientRect();
    const shell = button.querySelector(
      `[data-testid="${currentTestId}-shell"]`,
    ) as HTMLElement | null;
    const frontAtlas = button.querySelector(
      `[data-testid="${currentTestId}-front-atlas"]`,
    ) as HTMLImageElement | null;
    return {
      text: button.textContent?.replace(/\s+/g, " ").trim() ?? "",
      width: rect.width,
      height: rect.height,
      hasShell: Boolean(shell),
      frontAsset: frontAtlas?.getAttribute("data-asset-src") ?? "",
      frontLoaded: Boolean(
        frontAtlas?.complete &&
        frontAtlas.naturalWidth > 0 &&
        frontAtlas.naturalHeight > 0,
      ),
    };
  }, testId);

  expect(
    metrics.width,
    `${testId} 必须显示为卡牌本体，不能退成文字按钮`,
  ).toBeGreaterThanOrEqual(58);
  expect(
    metrics.height,
    `${testId} 必须保留卡牌热区高度`,
  ).toBeGreaterThanOrEqual(70);
  expect(metrics.hasShell, `${testId} 必须渲染持有物牌面壳层`).toBe(true);
  expect(metrics.frontAsset, `${testId} 必须挂载正式牌面 atlas`).toMatch(
    /(?:item|omen)-front-atlas/,
  );
  expect(metrics.frontLoaded, `${testId} 正式牌面必须真实加载完成`).toBe(true);
  expect(metrics.text, `${testId} 不应显示正面缺失回退文案`).not.toContain(
    "正面缺失",
  );
};

const expectTutorialNextDoesNotStealRollModifierFocus = async (
  page: Parameters<typeof test>[0]["page"],
) => {
  const geometry = await page.evaluate(() => {
    const button = document.querySelector(
      '[data-testid="tutorial-next-button"]',
    ) as HTMLElement | null;
    const dice = document.querySelector(
      '[data-testid="betrayal-rabbit-foot-dice"]',
    ) as HTMLElement | null;
    if (!button || !dice) {
      return {
        visible: false,
        overlaps: false,
      };
    }
    const buttonRect = button.getBoundingClientRect();
    const diceRect = dice.getBoundingClientRect();
    return {
      visible:
        buttonRect.width > 0 &&
        buttonRect.height > 0 &&
        window.getComputedStyle(button).visibility !== "hidden",
      overlaps:
        buttonRect.left < diceRect.right &&
        buttonRect.right > diceRect.left &&
        buttonRect.top < diceRect.bottom &&
        buttonRect.bottom > diceRect.top,
    };
  });
  if (!geometry.visible) return;
  expect(
    geometry.overlaps,
    "选择重投骰子时，“下一步”不能贴着骰子选择控件抢主焦点",
  ).toBe(false);
};

const expectTradeCandidateTrayAnchoredToFlow = async (
  page: Parameters<typeof test>[0]["page"],
  selectorTestId: string,
) => {
  const metrics = await page.evaluate((testId) => {
    const selector = document.querySelector(
      `[data-testid="${testId}"]`,
    ) as HTMLElement | null;
    const banner = document.querySelector(
      '[data-testid="betrayal-trade-flow-banner"]',
    ) as HTMLElement | null;
    if (!selector || !banner) return null;
    const selectorRect = selector.getBoundingClientRect();
    const bannerRect = banner.getBoundingClientRect();
    return {
      selectorTop: selectorRect.top,
      selectorBottom: selectorRect.bottom,
      selectorCenterX: selectorRect.left + selectorRect.width / 2,
      bannerBottom: bannerRect.bottom,
      bannerCenterX: bannerRect.left + bannerRect.width / 2,
      viewportHeight: window.innerHeight,
    };
  }, selectorTestId);

  expect(metrics, `${selectorTestId} 必须和顶部交易提示同时存在`).not.toBeNull();
  expect(
    metrics!.selectorTop,
    `${selectorTestId} 不能放到顶部角落或牌堆旁`,
  ).toBeGreaterThan(metrics!.viewportHeight * 0.52);
  expect(
    metrics!.selectorTop,
    `${selectorTestId} 必须和顶部交易提示分层，不能混进提示横幅`,
  ).toBeGreaterThan(metrics!.bannerBottom + 260);
  expect(
    Math.abs(metrics!.selectorCenterX - metrics!.bannerCenterX),
    `${selectorTestId} 必须和顶部交易提示保持同一视觉中轴`,
  ).toBeLessThanOrEqual(160);
};

const expectTradeConfirmAnchoredToFlow = async (
  page: Parameters<typeof test>[0]["page"],
) => {
  const metrics = await page.evaluate(() => {
    const confirm = document.querySelector(
      '[data-testid="betrayal-action-trade"]',
    ) as HTMLElement | null;
    const banner = document.querySelector(
      '[data-testid="betrayal-trade-flow-banner"]',
    ) as HTMLElement | null;
    const actionPanel = document.querySelector(
      '[data-testid="betrayal-trade-action-panel"]',
    ) as HTMLElement | null;
    if (!confirm || !banner || !actionPanel) return null;
    const confirmRect = confirm.getBoundingClientRect();
    const bannerRect = banner.getBoundingClientRect();
    const actionPanelRect = actionPanel.getBoundingClientRect();
    const offerSummary = actionPanel.querySelector(
      '[data-testid="betrayal-trade-offer-summary"]',
    ) as HTMLElement | null;
    const actionPanelItemStep = actionPanel.querySelector(
      '[data-testid="betrayal-trade-flow-item-step"]',
    ) as HTMLElement | null;
    const actionPanelTargetStep = actionPanel.querySelector(
      '[data-testid="betrayal-trade-flow-target-step"]',
    ) as HTMLElement | null;
    return {
      count: document.querySelectorAll('[data-testid="betrayal-action-trade"]')
        .length,
      placement: confirm.getAttribute("data-trade-confirm-placement") ?? "",
      role: confirm.getAttribute("data-trade-confirm-role") ?? "",
      bannerProgressVisible:
        banner.getAttribute("data-trade-progress-visible") ?? "",
      bannerText: banner.textContent ?? "",
      bannerHasOfferDetails: /给出|兔脚|书本|急救包|地图/.test(
        banner.textContent ?? "",
      ),
      offerSummaryInsideActionPanel: Boolean(offerSummary),
      actionPanelItemStepText: actionPanelItemStep?.textContent ?? "",
      actionPanelTargetStepText: actionPanelTargetStep?.textContent ?? "",
      insideBanner: Boolean(
        confirm.closest('[data-testid="betrayal-trade-flow-banner"]'),
      ),
      insideActionPanel: Boolean(
        confirm.closest('[data-testid="betrayal-trade-action-panel"]'),
      ),
      actionPanelFor: actionPanel.getAttribute("data-prompt-actions-for") ?? "",
      confirmCenterY: confirmRect.top + confirmRect.height / 2,
      bannerBottom: bannerRect.bottom,
      actionPanelTop: actionPanelRect.top,
      actionPanelBottom: actionPanelRect.bottom,
    };
  });

  expect(metrics, "交易确认按钮必须存在").not.toBeNull();
  expect(
    metrics!.count,
    "交易确认只能有一个，不能顶部提示和底部动作区各放一个",
  ).toBe(1);
  expect(metrics!.placement, "交易确认必须声明在底部动作面板里").toBe(
    "bottom-action-panel",
  );
  expect(metrics!.role, "交易确认按钮必须声明自己提交的是交易方案").toBe(
    "proposal-submit",
  );
  expect(metrics!.insideBanner, "交易确认按钮不能再塞进顶部交易提示横幅").toBe(
    false,
  );
  expect(metrics!.insideActionPanel, "交易确认按钮必须留在底部交易动作面板里").toBe(
    true,
  );
  expect(metrics!.actionPanelFor, "底部交易动作面板必须关联顶部交易提示").toBe(
    "betrayal-trade-flow-banner",
  );
  expect(
    metrics!.bannerProgressVisible,
    "顶部交易横幅只能是轻量状态，方案详情必须下沉到交易操作层",
  ).toBe("status-only");
  expect(
    metrics!.bannerHasOfferDetails,
    "顶部交易横幅不能重复展示双方给出物",
  ).toBe(false);
  expect(
    metrics!.offerSummaryInsideActionPanel,
    "交易方案摘要必须和提交/回应按钮同层承接",
  ).toBe(true);
  expect(
    metrics!.actionPanelItemStepText,
    "交易操作层必须保留双方给出物摘要",
  ).toMatch(/给出|选择|请求/);
  expect(
    metrics!.actionPanelTargetStepText,
    "交易操作层必须说明当前交易动作",
  ).not.toHaveLength(0);
  expect(
    metrics!.confirmCenterY,
    "交易确认按钮必须落在底部动作面板高度范围内",
  ).toBeGreaterThanOrEqual(metrics!.actionPanelTop);
  expect(
    metrics!.confirmCenterY,
    "交易确认按钮必须落在底部动作面板高度范围内",
  ).toBeLessThanOrEqual(metrics!.actionPanelBottom);
  expect(metrics!.actionPanelTop, "底部动作面板必须和顶部提示分层").toBeGreaterThan(
    metrics!.bannerBottom + 260,
  );
  await expectBetrayalConfirmButtonVisual(
    page.getByTestId("betrayal-action-trade"),
    "交易方案确认按钮",
  );
};

const expectDiscoveryPanelDoesNotCoverRollModifier = async (
  discoveryReveal: Locator,
  modifierCard: Locator,
) => {
  await expect(modifierCard).toBeVisible();
  await expect(discoveryReveal).toHaveAttribute(
    "data-allows-inventory-roll-modifiers",
    "true",
  );
  const hitTarget = await modifierCard.evaluate((node) => {
    const card = node as HTMLElement;
    const rect = card.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const elementAtCenter = document.elementFromPoint(
      centerX,
      centerY,
    ) as HTMLElement | null;
    const cardAtCenter = elementAtCenter?.closest(
      '[data-testid="betrayal-inventory-rope"]',
    );
    const discoveryAtCenter = elementAtCenter?.closest(
      '[data-testid="betrayal-discovery-panel"]',
    );
    return {
      cardWidth: rect.width,
      cardHeight: rect.height,
      cardHit: cardAtCenter === card,
      discoveryHit: Boolean(discoveryAtCenter),
      topTestId: elementAtCenter?.dataset.testid ?? null,
    };
  });
  expect(hitTarget.cardWidth).toBeGreaterThan(24);
  expect(hitTarget.cardHeight).toBeGreaterThan(24);
  expect(hitTarget.discoveryHit).toBe(false);
  expect(hitTarget.cardHit).toBe(true);
};

const expectInventoryPreviewCardReadable = async (previewOverlay: Locator) => {
  const readability = await previewOverlay
    .getByTestId("betrayal-inventory-preview-card-shell")
    .evaluate((node) => {
      const shell = node as HTMLElement;
      const shellStyle = window.getComputedStyle(shell);
      const button = shell.closest("button") as HTMLElement | null;
      const buttonStyle = button ? window.getComputedStyle(button) : null;
      const rect = shell.getBoundingClientRect();
      return {
        shellOpacity: Number(shellStyle.opacity),
        buttonOpacity: Number(buttonStyle?.opacity ?? "1"),
        shellFilter: shellStyle.filter,
        buttonFilter: buttonStyle?.filter ?? "none",
        width: rect.width,
        height: rect.height,
      };
    });
  expect(readability.width, "放大预览必须保留可读卡面宽度").toBeGreaterThan(
    220,
  );
  expect(readability.height, "放大预览必须保留可读卡面高度").toBeGreaterThan(
    300,
  );
  expect(
    readability.shellOpacity,
    "已使用卡牌的放大预览不得继承持有区灰化透明度",
  ).toBeGreaterThanOrEqual(0.99);
  expect(
    readability.buttonOpacity,
    "已使用卡牌的放大预览外层不得变灰",
  ).toBeGreaterThanOrEqual(0.99);
  expect(readability.shellFilter, "已使用卡牌的放大预览不得灰阶/模糊").toBe(
    "none",
  );
  expect(
    readability.buttonFilter,
    "已使用卡牌的放大预览外层不得灰阶/模糊",
  ).toBe("none");
};

const clickNext = async (page: Parameters<typeof test>[0]["page"]) => {
  const nextButton = page.getByTestId("tutorial-next-button");
  await expect(nextButton).toBeVisible({ timeout: 2000 });
  const beforeStepId = await page
    .locator("[data-tutorial-step]")
    .first()
    .getAttribute("data-tutorial-step")
    .catch(() => null);
  try {
    await nextButton.click({ timeout: 5000 });
  } catch (error) {
    const afterStepId = await page
      .locator("[data-tutorial-step]")
      .first()
      .getAttribute("data-tutorial-step")
      .catch(() => null);
    if (afterStepId && afterStepId !== beforeStepId) {
      return;
    }
    throw error;
  }
};

const readTutorialRuntimeDiagnostics = async (
  page: Parameters<typeof test>[0]["page"],
) =>
  page.evaluate(() => {
    const harness = (
      window as unknown as {
        __BG_TEST_HARNESS__?: {
          state?: {
            get?: () => {
              sys?: {
                tutorial?: {
                  active?: boolean;
                  manifestId?: string | null;
                  stepIndex?: number;
                  step?: { id?: string; aiActions?: unknown[] };
                  aiActions?: unknown[];
                };
              };
              core?: {
                phase?: string;
                latestFeedback?: string;
                currentExplorer?: { inventory?: Array<{ id?: string; name?: string }> };
              };
            };
          };
        };
      }
    ).__BG_TEST_HARNESS__;
    const snapshot = harness?.state?.get?.();
    const tutorial = snapshot?.sys?.tutorial;
    const activeStep = document.querySelector("[data-tutorial-step]");
    const contextDiagnostics = (
      window as unknown as {
        __BG_TUTORIAL_CONTEXT_DIAGNOSTICS__?: unknown;
      }
    ).__BG_TUTORIAL_CONTEXT_DIAGNOSTICS__ ?? null;
    return {
      href: window.location.href,
      gameMode: (window as unknown as { __BG_GAME_MODE__?: unknown }).__BG_GAME_MODE__ ?? null,
      isSpectator: (window as unknown as { __BG_IS_SPECTATOR__?: unknown }).__BG_IS_SPECTATOR__ ?? null,
      contextDiagnostics,
      tutorialActive: tutorial?.active ?? null,
      manifestId: tutorial?.manifestId ?? null,
      stepIndex: tutorial?.stepIndex ?? null,
      stepId: tutorial?.step?.id ?? null,
      stepAiActionCount: tutorial?.step?.aiActions?.length ?? 0,
      aiActionCount: tutorial?.aiActions?.length ?? 0,
      activeStepDom: activeStep?.getAttribute("data-tutorial-step") ?? null,
      hasTutorialOverlayCard: Boolean(
        document.querySelector('[data-testid="tutorial-overlay-card"]'),
      ),
      hasTutorialNextButton: Boolean(
        document.querySelector('[data-testid="tutorial-next-button"]'),
      ),
      hasBetrayalBoard: Boolean(
        document.querySelector('[data-testid="betrayal-board"]'),
      ),
      phase: snapshot?.core?.phase ?? null,
      latestFeedback: snapshot?.core?.latestFeedback ?? null,
      inventory:
        snapshot?.core?.currentExplorer?.inventory?.map((item) => ({
          id: item.id,
          name: item.name,
        })) ?? null,
      bodyText: document.body.textContent?.replace(/\s+/g, " ").trim().slice(0, 800) ?? "",
    };
  });

const advanceToStep = async (
  page: Parameters<typeof test>[0]["page"],
  targetStepId: string,
  maxClicks = 12,
) => {
  const activeStep = page.locator("[data-tutorial-step]").last();
  for (let index = 0; index < maxClicks; index += 1) {
    const targetStepVisible = await page
      .locator(`[data-tutorial-step="${targetStepId}"]`)
      .isVisible()
      .catch(() => false);
    if (targetStepVisible) {
      await waitForStep(page, targetStepId);
      return;
    }
    const currentStepId = await activeStep
      .getAttribute("data-tutorial-step")
      .catch(() => null);
    if (currentStepId === targetStepId) {
      return;
    }
    try {
      await clickNext(page);
    } catch (error) {
      const diagnostics = await readTutorialRuntimeDiagnostics(page);
      throw new Error(
        `教程无法推进到 ${targetStepId}：下一步按钮不可见或不可点。\n诊断：${JSON.stringify(
          diagnostics,
          null,
          2,
        )}\n原始错误：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  try {
    await waitForStep(page, targetStepId);
  } catch (error) {
    const diagnostics = await readTutorialRuntimeDiagnostics(page);
    throw new Error(
      `教程无法推进到 ${targetStepId}：超过最大点击次数。\n诊断：${JSON.stringify(
        diagnostics,
        null,
        2,
      )}\n原始错误：${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

type MummyMonsterTutorialScreenshots = Partial<{
  turnStart: string;
  movementRoll: string;
  moveTarget: string;
  moveResult: string;
  attackForced: string;
  attackTarget: string;
  attackRoll: string;
  reward: string;
  stealResult: string;
}>;

const saveMummyMonsterStepScreenshot = async (
  page: Page,
  path: string | undefined,
) => {
  if (path) {
    await saveScreenshot(page, path);
  }
};

type PendingRecentRollAcknowledgement = {
  requiredPlayerIds: string[];
  acknowledgedPlayerIds: string[];
};

const readPendingRecentRollAcknowledgement = async (
  page: Page,
): Promise<PendingRecentRollAcknowledgement | null> =>
  page.evaluate(() => {
    const core = (
      window as typeof window & {
        __BG_TEST_HARNESS__?: {
          state?: {
            get?: () => {
              core?: {
                playerIds?: string[];
                recentRoll?: {
                  playerId?: string;
                  requiredPlayerIds?: string[];
                  acknowledgedPlayerIds?: string[];
                } | null;
              };
            };
          };
        };
      }
    ).__BG_TEST_HARNESS__?.state?.get?.().core;
    const recentRoll = core?.recentRoll;
    if (!recentRoll) {
      return null;
    }
    const requiredPlayerIds = recentRoll.requiredPlayerIds?.length
      ? [...recentRoll.requiredPlayerIds]
      : core?.playerIds?.length
        ? [...core.playerIds]
        : recentRoll.playerId
          ? [recentRoll.playerId]
          : [];
    return {
      requiredPlayerIds,
      acknowledgedPlayerIds: [...(recentRoll.acknowledgedPlayerIds ?? [])],
    };
  });

const acknowledgeRecentRollForAllPlayers = async (page: Page) => {
  const pendingBefore = await readPendingRecentRollAcknowledgement(page);
  if (!pendingBefore) {
    throw new Error("当前没有待全员确认的投骰结果");
  }

  const continueButton = page.getByTestId("betrayal-roll-continue");
  await expect(continueButton).toBeVisible();
  if (await continueButton.isEnabled()) {
    const acknowledgedBefore = new Set(
      pendingBefore.acknowledgedPlayerIds,
    ).size;
    await continueButton.click();
    await expect
      .poll(async () => {
        const pending = await readPendingRecentRollAcknowledgement(page);
        return pending
          ? new Set(pending.acknowledgedPlayerIds).size
          : pendingBefore.requiredPlayerIds.length;
      })
      .toBeGreaterThan(acknowledgedBefore);
  }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const pending = await readPendingRecentRollAcknowledgement(page);
    if (!pending) {
      await expect(page.getByTestId("betrayal-recent-roll-panel")).toHaveCount(0);
      return;
    }
    const acknowledgedPlayerIds = new Set(pending.acknowledgedPlayerIds);
    const nextPlayerId = pending.requiredPlayerIds.find(
      (playerId) => !acknowledgedPlayerIds.has(playerId),
    );
    if (!nextPlayerId) {
      await expect(page.getByTestId("betrayal-recent-roll-panel")).toHaveCount(0);
      return;
    }
    await dispatchHarnessCommand(
      page,
      BETRAYAL_COMMANDS.ACKNOWLEDGE_RECENT_ROLL,
      nextPlayerId,
      {},
    );
    await expect
      .poll(async () => {
        const nextPending = await readPendingRecentRollAcknowledgement(page);
        return nextPending
          ? nextPending.acknowledgedPlayerIds.includes(nextPlayerId)
          : true;
      })
      .toBe(true);
  }

  throw new Error("全员确认投骰结果超过安全上限");
};

const completeMummyMonsterActionsFromTurnStart = async (
  page: Page,
  screenshots: MummyMonsterTutorialScreenshots = {},
) => {
  await waitForStep(page, "mummy-monster-turn-start");
  const moveTarget = await resolveMummyMonsterMoveTutorialTarget(page);
  await switchRoomMapToFloor(page, moveTarget.mummyRoomFloor);
  await expect(
    page.getByTestId("betrayal-action-monsterTurnStart"),
  ).toContainText("木乃伊开回合");
  await expect(
    page.getByTestId(`betrayal-room-monster-${moveTarget.mummyRoomId}-mummy`),
  ).toBeVisible();
  await saveMummyMonsterStepScreenshot(page, screenshots.turnStart);

  await page.getByTestId("betrayal-action-monsterTurnStart").click();
  await waitForStep(page, "mummy-monster-roll");
  await expect(
    page.getByTestId("betrayal-action-monsterMovementRoll"),
  ).toContainText("木乃伊移动骰");
  await page.getByTestId("betrayal-action-monsterMovementRoll").click();
  const movementRollPanel = page.getByTestId("betrayal-recent-roll-panel");
  await expect(movementRollPanel).toBeVisible();
  await expect(movementRollPanel).toContainText("木乃伊移动");
  await waitForPhysicalDiceSettled(movementRollPanel);
  await expect(movementRollPanel).toContainText("可移动 0 间");
  await saveMummyMonsterStepScreenshot(page, screenshots.movementRoll);

  await acknowledgeRecentRollForAllPlayers(page);
  await waitForStep(page, "mummy-monster-move-target");
  await expect(page.getByTestId("betrayal-recent-roll-panel")).toHaveCount(0);
  await page.getByTestId("betrayal-action-monsterMove").click();
  const mummyMoveToken = page.getByTestId(`betrayal-room-monster-${moveTarget.mummyRoomId}-mummy`);
  await expect(mummyMoveToken).toHaveAttribute("data-direct-target", "true");
  await mummyMoveToken.click();
  if (moveTarget.unrevealedRoomId) {
    await expect(
      page.getByTestId(`betrayal-room-monster-move-target-${moveTarget.unrevealedRoomId}`),
    ).toHaveCount(0);
  }
  await switchRoomMapToFloor(page, moveTarget.girlRoomFloor);
  await expect(
    page.getByTestId(`betrayal-room-monster-move-target-${moveTarget.girlRoomId}`),
  ).toBeVisible();
  await saveMummyMonsterStepScreenshot(page, screenshots.moveTarget);

  await page.getByTestId(`betrayal-room-${moveTarget.girlRoomId}`).click();
  await waitForStep(page, "mummy-monster-move-result");
  await expect(page.getByTestId("betrayal-room-latest-feedback")).toContainText(
    new RegExp(`木乃伊.*${moveTarget.girlRoomName}`),
  );
  await expect(
    page.getByTestId(`betrayal-room-monster-${moveTarget.girlRoomId}-mummy`),
  ).toBeVisible();
  await expect(page.getByTestId(moveTarget.girlTokenTestId)).toHaveAttribute(
    "data-token-status",
    "held-by-mummy",
  );
  await expect(page.getByTestId("tutorial-overlay-card")).not.toContainText(
    "拾起女孩",
  );
  await expectGirlTokenMatchesExplorerBoardSize(
    page,
    `betrayal-girl-svg-token-${moveTarget.girlRoomId}`,
    "木乃伊移动到女孩房间后携带女孩",
  );
  await saveMummyMonsterStepScreenshot(page, screenshots.moveResult);
  await clickNext(page);

  await waitForStep(page, "setup-mummy-attack");
  await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
    "同房攻击",
  );
  await clickNext(page);

  await waitForStep(page, "mummy-attack-forced");
  const attackTarget = await resolveMummyMonsterAttackTutorialTarget(page);
  await switchRoomMapToFloor(page, attackTarget.mummyRoomFloor);
  await expect(page.getByTestId("betrayal-action-monsterMove")).toHaveCount(0);
  const monsterAttackAction = page.getByTestId("betrayal-action-monsterAttack");
  await expect(monsterAttackAction).toContainText("木乃伊攻击");
  await expect(
    page.getByTestId(`betrayal-room-monster-${attackTarget.mummyRoomId}-mummy`),
  ).toBeVisible();
  await expect(
    page.getByTestId(`betrayal-room-occupant-${attackTarget.mummyRoomId}-${attackTarget.heroTargetId}`),
  ).toBeVisible();
  await saveMummyMonsterStepScreenshot(page, screenshots.attackForced);
  await clickNext(page);

  await waitForStep(page, "mummy-attack-target");
  await monsterAttackAction.click();
  await expect(monsterAttackAction).toContainText("取消攻击");
  const mummyAttackToken = page.getByTestId(`betrayal-room-monster-${attackTarget.mummyRoomId}-mummy`);
  const heroToken = page.getByTestId(
    `betrayal-room-occupant-${attackTarget.mummyRoomId}-${attackTarget.heroTargetId}`,
  );
  await expect(mummyAttackToken).toHaveAttribute("data-direct-target", "true");
  await mummyAttackToken.click();
  await expect(heroToken).toHaveAttribute("data-direct-target", "true");
  await expect(
    page.getByTestId(`betrayal-room-occupant-${attackTarget.mummyRoomId}-${attackTarget.traitorId}`),
  ).not.toHaveAttribute("data-direct-target", "true");
  if (attackTarget.deadHeroId) {
    await expect(
      page.getByTestId(`betrayal-room-occupant-${attackTarget.mummyRoomId}-${attackTarget.deadHeroId}`),
    ).not.toHaveAttribute("data-direct-target", "true");
  }
  await saveMummyMonsterStepScreenshot(page, screenshots.attackTarget);

  await heroToken.click();
  const attackRollPanel = page.getByTestId("betrayal-recent-roll-panel");
  await expect(attackRollPanel).toBeVisible();
  await expect(attackRollPanel).toContainText("木乃伊攻击");
  await expect(attackRollPanel).toContainText("攻击投骰");
  await waitForPhysicalDiceSettled(attackRollPanel);
  await expect(attackRollPanel).toContainText("本会造成");
  await expect(attackRollPanel).toContainText("满足木乃伊偷取条件");
  await expect(attackRollPanel).not.toContainText("伤害或偷取");
  await saveMummyMonsterStepScreenshot(page, screenshots.attackRoll);

  await acknowledgeRecentRollForAllPlayers(page);
  await waitForStep(page, "mummy-attack-reward");
  await expect(page.getByTestId("betrayal-recent-roll-panel")).toHaveCount(0);
  await expect(page.getByTestId("betrayal-mummy-reward-banner")).toContainText(
    "木乃伊攻击胜出",
  );
  await expect(page.getByTestId("betrayal-mummy-reward-banner")).toContainText(
    "请选择造成伤害，或偷走一件物品/预兆代替",
  );
  await expect(page.getByTestId("betrayal-mummy-reward-steal-map")).toContainText(
    "偷走地图",
  );
  await saveMummyMonsterStepScreenshot(page, screenshots.reward);

  await page.getByTestId("betrayal-mummy-reward-steal-map").click();
  await waitForStep(page, "mummy-steal-result");
  await expect(page.getByTestId("betrayal-mummy-reward-banner")).toHaveCount(0);
  await expect(page.getByTestId("betrayal-room-latest-feedback")).toContainText("夺走地图");
  await expect.poll(() =>
    page.evaluate((heroTargetId) => {
      const state = (
        window as unknown as {
          __BG_TEST_HARNESS__?: {
            state?: {
              get?: () => {
                core?: {
                  currentExplorer?: { playerId: string; inventory?: Array<{ id: string }> };
                  otherExplorers?: Array<{ playerId: string; inventory?: Array<{ id: string }> }>;
                  scenarioRuntime?: {
                    mummy?: {
                      pendingAttackReward?: unknown;
                      mummyCarriedCards?: Array<{ id: string }>;
                    };
                  };
                };
              };
            };
          };
        }
      ).__BG_TEST_HARNESS__?.state?.get?.();
      const core = state?.core;
      const hero = [core?.currentExplorer, ...(core?.otherExplorers ?? [])]
        .find((explorer) => explorer?.playerId === heroTargetId);
      return {
        heroHasMap: hero?.inventory?.some((card) => card.id === "map") ?? true,
        rewardPending: Boolean(core?.scenarioRuntime?.mummy?.pendingAttackReward),
        mummyCarriedCardIds: core?.scenarioRuntime?.mummy?.mummyCarriedCards?.map((card) => card.id) ?? [],
      };
    }, attackTarget.heroTargetId)
  ).toMatchObject({
    heroHasMap: false,
    rewardPending: false,
    mummyCarriedCardIds: expect.arrayContaining(["map"]),
  });
  await saveMummyMonsterStepScreenshot(page, screenshots.stealResult);
};

test.describe("山屋惊魂教程最小真实链路", () => {
  test("[mummy-banish] 教程驱逐木乃伊步骤必须点击房间本体进入驱逐结算", async ({
    page,
    context,
  }) => {
    test.setTimeout(120000);
    await initBetrayalContext(context, { skipTutorial: false });
    const diagnostics = attachPageDiagnostics(
      page,
      "betrayal-tutorial-exorcise-room-direct-target",
    );

    await page.setViewportSize({ width: 1600, height: 900 });
    await warmBetrayalFrontend(context);
    await page.goto("/play/betrayal/tutorial/haunt-actions-and-finish", {
      waitUntil: "domcontentloaded",
    });
    await waitForBetrayalPageReady(page);
    await waitForHauntRuntime(page, 30000);
    await advanceToStep(page, "haunt-actions");
    await expect(
      page.getByTestId("betrayal-action-use"),
    ).toContainText(/驱逐木乃伊|Banish Mummy/i);
    const banishTarget = await resolveMummyBanishRoomTarget(page);
    await expect(
      page.getByTestId("betrayal-room-focus-target"),
    ).toHaveAttribute("data-role", "status");
    await expect(
      page.getByTestId(`betrayal-room-${banishTarget.roomId}`),
    ).toHaveAttribute("data-direct-target", "true");
    await expect(
      page.getByTestId(`betrayal-room-focus-card-highlight-${banishTarget.roomId}`),
    ).toHaveAttribute("data-highlight-shape", "room");
    await saveScreenshot(page, STEP_19);

    await clickNext(page);
    await waitForStep(page, "banish-mummy");
    const readyRollBackdrop = page.getByTestId("betrayal-roll-result-backdrop");
    if (await readyRollBackdrop.isVisible({ timeout: 800 }).catch(() => false)) {
      await expect(readyRollBackdrop).toHaveAttribute(
        "data-backdrop-dismiss",
        "disabled",
      );
      await readyRollBackdrop.click({ position: { x: 16, y: 16 } });
      await expect(page.getByTestId("betrayal-recent-roll-panel")).toBeVisible();
      await page.getByTestId("betrayal-roll-continue").click();
    }
    await expect(page.getByTestId("betrayal-recent-roll-panel")).toHaveCount(0);
    await setHarnessRandomQueue(page, [0.99, 0.99, 0.99, 0.99, 0.2, 0.2, 0.2, 0.2, 0.2]);
    await page.getByTestId(`betrayal-room-${banishTarget.roomId}`).click();

    const exorciseRollReview = page.getByTestId(
      "betrayal-exorcise-roll-review",
    );
    await expect(exorciseRollReview).toBeVisible({ timeout: 30000 });
    await expect(
      exorciseRollReview.getByTestId("betrayal-recent-roll-panel"),
    ).toContainText("驱逐木乃伊");
    await expect(
      exorciseRollReview.getByTestId("betrayal-recent-roll-panel"),
    ).toContainText("神志对抗");
    await expect(
      exorciseRollReview.getByTestId("betrayal-recent-roll-total"),
    ).toContainText("总点数");
    await saveScreenshot(page, STEP_20);

    assertNoFatalFrontendErrors([
      { label: "betrayal-tutorial-exorcise-room-direct-target", diagnostics },
    ]);
  });

  test("[tutorial-main] 教程路由只暴露主线和叛徒视角，主线入口不伪装作祟后代表态", async ({
    page,
    context,
  }) => {
    test.setTimeout(120000);
    await initBetrayalContext(context, { skipTutorial: false });
    const diagnostics = attachPageDiagnostics(page, "betrayal-tutorial");

    await page.setViewportSize({ width: 1600, height: 900 });
    await warmBetrayalFrontend(context);
    await page.goto("/play/betrayal/tutorial", {
      waitUntil: "domcontentloaded",
    });

    const basicTutorialEntry = page.getByTestId(
      "tutorial-catalog-entry-basic-setup-and-turn",
    );
    const traitorTutorialEntry = page.getByTestId(
      "tutorial-catalog-entry-traitor-path",
    );
    await expect(basicTutorialEntry).toBeVisible({ timeout: 30000 });
    await expect(traitorTutorialEntry).toBeVisible();
    for (const hiddenTutorialId of [
      "omen-confirmation-and-haunt-risk",
      "haunt-natural-trigger-flow",
      "trade-and-agreement",
      "move-explore-use",
      "crimson-jack-objective",
      "haunt-actions-and-finish",
      "hero-attack-path",
      "jack-spirit-path",
      "mummy-traitor-victory-chain",
      "mummy-monster-actions",
    ]) {
      await expect(
        page.getByTestId(`tutorial-catalog-entry-${hiddenTutorialId}`),
      ).toHaveCount(0);
    }
    await expect(page.getByText("教程目录")).toBeVisible();
    await saveScreenshot(page, STEP_00);
    await basicTutorialEntry.click();
    await waitForBetrayalPageReady(page);

    await expect(page.getByTestId("betrayal-board")).toBeVisible({
      timeout: 30000,
    });
    await waitForStep(page, "objective-and-turn");
    await expect(
      page.locator('[data-tutorial-id="betrayal-actions-zone"]'),
    ).toHaveCount(0);
    await expect(page.getByTestId("betrayal-action-move")).toBeVisible();
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "现在是你的回合",
    );
    await saveScreenshot(page, STEP_01);

    await clickNext(page);
    await waitForStep(page, "traits-and-speed");
    await expect(
      page.locator('[data-testid="betrayal-current-traits"]'),
    ).toBeVisible();
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "速度",
    );

    await clickNext(page);
    await waitForStep(page, "trait-track-reading");
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "绿色数字",
    );
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "骷髅",
    );
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "重复的数字仍分别占格",
    );
    await saveScreenshot(page, STEP_36);

    await clickNext(page);
    await waitForStep(page, "moves-remaining");
    await expect(
      page.locator('[data-tutorial-id="betrayal-moves-remaining"]'),
    ).toBeVisible();
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "本回合还剩的移动力",
    );
    await saveScreenshot(page, STEP_02);

    await clickNext(page);
    await waitForStep(page, "room-board");
    await expect(
      page.locator('[data-tutorial-id="betrayal-room-board"]'),
    ).toBeVisible();
    await saveScreenshot(page, STEP_03);

    await clickNext(page);
    await waitForStep(page, "observe-teammate");
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "可观察该探险者",
    );
    await expect(
      page.locator('[data-tutorial-id="betrayal-bottom-teammate-1"]'),
    ).toBeVisible();
    await page.getByTestId("betrayal-bottom-teammate-1").click();
    await expect(page.getByTestId("betrayal-current-traits")).toHaveAttribute(
      "data-observed-player",
      "true",
    );
    await expect(page.getByTestId("betrayal-current-traits")).toHaveAttribute(
      "data-player-id",
      "1",
    );
    await saveScreenshot(page, STEP_37);

    await page.getByTestId("betrayal-bottom-teammate-2").click();
    await expect(page.getByTestId("betrayal-current-traits")).toHaveAttribute(
      "data-player-id",
      "2",
    );
    await saveScreenshot(page, STEP_37A);
    await page.getByTestId("betrayal-bottom-teammate-2").click();
    await expect(page.getByTestId("betrayal-current-traits")).toHaveAttribute(
      "data-observed-player",
      "true",
    );
    await expect(page.getByTestId("betrayal-current-traits")).toHaveAttribute(
      "data-player-id",
      "1",
    );
    await saveScreenshot(page, STEP_37B);

    await clickNext(page);
    await waitForStep(page, "focus-self-room");
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "聚焦到我的房间",
    );
    await expect(
      page.locator('[data-tutorial-id="betrayal-focus-self-room"]'),
    ).toBeVisible();
    await page.getByTestId("betrayal-focus-self-room").click();
    await expect(page.getByTestId("betrayal-current-traits")).toHaveAttribute(
      "data-observed-player",
      "false",
    );
    await expect(page.getByTestId("betrayal-current-traits")).toHaveAttribute(
      "data-player-id",
      "0",
    );
    await saveScreenshot(page, STEP_38);

    await clickNext(page);
    await waitForStep(page, "haunt-risk-track");
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "预兆进度条",
    );
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "抽到预兆",
    );
    await expect(
      page.locator('[data-tutorial-id="betrayal-haunt-risk-status"]'),
    ).toBeVisible();
    await expect(page.getByTestId("betrayal-haunt-risk-progress")).toHaveAttribute(
      "data-haunt-risk-style",
      "official-asset-track",
    );
    await expect(page.getByTestId("betrayal-haunt-risk-slot")).toHaveCount(10);
    await expect(
      page.locator('[data-haunt-risk-current-cell="true"]'),
    ).toHaveCount(1);
    await saveScreenshot(page, STEP_39);

    await clickNext(page);
    await waitForStep(page, "inventory-and-help");
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "物品和预兆会放在你面前",
    );
    await expect(page.getByTestId("tutorial-overlay-card")).not.toContainText(
      "帮助入口",
    );
    await expect(page.getByTestId("tutorial-overlay-card")).not.toContainText(
      "主界面",
    );
    await expect(page.getByTestId("tutorial-overlay-card")).not.toContainText(
      "替代",
    );
    await expect(
      page.locator('[data-tutorial-id="betrayal-inventory-zone"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-tutorial-id="betrayal-reference-entry"]'),
    ).toBeVisible();
    await page.getByTestId("betrayal-open-reference").click();
    const preHauntReferenceImage = page.getByTestId(
      "betrayal-reference-card-image",
    );
    await expect(preHauntReferenceImage).toBeVisible();
    await expect(preHauntReferenceImage).toHaveAttribute(
      "data-asset-src",
      "betrayal/cards/player-reference-zh-front",
    );
    await expectImageLoaded(preHauntReferenceImage);
    await page.getByTestId("betrayal-reference-toggle").click();
    await expect(preHauntReferenceImage).toHaveAttribute(
      "data-asset-src",
      "betrayal/cards/player-reference-zh-back",
    );
    await expectImageLoaded(preHauntReferenceImage);
    await page.getByTestId("betrayal-reference-close").click();
    await expect(page.getByTestId("betrayal-reference-overlay")).toBeHidden();
    await saveScreenshot(page, STEP_04);

    await clickNext(page);
    await waitForStep(page, "open-move-targets");
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "点“移动”",
    );
    await expect(
      page.getByTestId("betrayal-runtime-header-grid"),
    ).not.toContainText(/作祟中|Haunt/i);

    assertNoFatalFrontendErrors([{ label: "betrayal-tutorial", diagnostics }]);
  });

  test("[haunt-natural] 队友自然触发作祟后当前玩家读英雄书并执行找真名再回到结束回合入口", async ({
    page,
    context,
  }) => {
    test.setTimeout(120000);
    await initBetrayalContext(context, { skipTutorial: false });
    const diagnostics = attachPageDiagnostics(
      page,
      "betrayal-tutorial-haunt-natural-trigger-flow",
    );
    const readOmenNamesByPlayer = () =>
      page.evaluate(() => {
        type HarnessExplorer = {
          playerId?: string;
          inventory?: Array<{ kind?: string; name?: string }>;
        };
        const harness = (
          window as unknown as {
            __BG_TEST_HARNESS__?: {
              state?: {
                get?: () => {
                  core?: {
                    currentExplorer?: HarnessExplorer;
                    otherExplorers?: HarnessExplorer[];
                  };
                };
              };
            };
          }
        ).__BG_TEST_HARNESS__;
        const core = harness?.state?.get?.()?.core;
        const explorers = [
          core?.currentExplorer,
          ...(core?.otherExplorers ?? []),
        ].filter((explorer): explorer is HarnessExplorer => Boolean(explorer));
        return Object.fromEntries(
          explorers.map((explorer) => [
            explorer.playerId ?? "",
            (explorer.inventory ?? [])
              .filter((card) => card.kind === "omen")
              .map((card) => card.name ?? ""),
          ]),
        );
      });
    const readHauntState = () =>
      page.evaluate(() => {
        const harness = (
          window as unknown as {
            __BG_TEST_HARNESS__?: {
              state?: {
                get?: () => {
                  core?: {
                    currentPlayer?: string;
                    phase?: string;
                    activeRoomId?: string;
                    currentExplorer?: { playerId?: string; roomId?: string };
                    recentRoll?: {
                      kind?: string;
                      dice?: unknown[];
                      sourceTitle?: string;
                      rollLabel?: string;
                      latestLabel?: string;
                      requiredPlayerIds?: string[];
                      acknowledgedPlayerIds?: string[];
                    };
                    recommendedAction?: string;
                    scenarioRuntime?: {
                      hauntTriggered?: boolean;
                      hauntScenarioCardId?: string | null;
                      hauntRevealerPlayerId?: string | null;
                      traitorPlayerId?: string | null;
                      mummy?: {
                        knowledgeTokenCount?: number;
                        trueNameFound?: boolean;
                        banishmentSpellLearned?: boolean;
                      };
                    };
                  };
                };
              };
            };
          }
        ).__BG_TEST_HARNESS__;
        const core = harness?.state?.get?.()?.core;
        return {
          currentPlayer: core?.currentPlayer ?? null,
          currentExplorerRoomId: core?.currentExplorer?.roomId ?? null,
          activeRoomId: core?.activeRoomId ?? null,
          phase: core?.phase ?? null,
          hauntTriggered: core?.scenarioRuntime?.hauntTriggered ?? null,
          hauntScenarioCardId:
            core?.scenarioRuntime?.hauntScenarioCardId ?? null,
          hauntRevealerPlayerId:
            core?.scenarioRuntime?.hauntRevealerPlayerId ?? null,
          traitorPlayerId: core?.scenarioRuntime?.traitorPlayerId ?? null,
          recentRollKind: core?.recentRoll?.kind ?? null,
          recentRollDiceCount: core?.recentRoll?.dice?.length ?? null,
          recentRollSourceTitle: core?.recentRoll?.sourceTitle ?? null,
          recentRollLabel: core?.recentRoll?.rollLabel ?? null,
          recentRollLatestLabel: core?.recentRoll?.latestLabel ?? null,
          recentRollRequiredPlayerIds:
            core?.recentRoll?.requiredPlayerIds ?? null,
          recentRollAcknowledgedPlayerIds:
            core?.recentRoll?.acknowledgedPlayerIds ?? null,
          mummyKnowledgeTokenCount:
            core?.scenarioRuntime?.mummy?.knowledgeTokenCount ?? null,
          mummyTrueNameFound:
            core?.scenarioRuntime?.mummy?.trueNameFound ?? null,
          mummyBanishmentSpellLearned:
            core?.scenarioRuntime?.mummy?.banishmentSpellLearned ?? null,
          recommendedAction: core?.recommendedAction ?? null,
        };
      });
    const tutorialOverlayCard = page.getByTestId("tutorial-overlay-card");

    await page.setViewportSize({ width: 1600, height: 900 });
    await warmBetrayalFrontend(context);
    await page.goto("/play/betrayal/tutorial/haunt-natural-trigger-flow", {
      waitUntil: "domcontentloaded",
    });
    await waitForBetrayalPageReady(page);

    await waitForStep(page, "hand-off-to-teammate-one", 30000);
    await expect(page.getByTestId("betrayal-runtime-header-grid")).toContainText(
      /作祟前|Pre-Haunt/i,
    );
    await expect(tutorialOverlayCard).toContainText("结束回合");
    await expect(tutorialOverlayCard).not.toContainText("多数英雄视角");
    await expect(tutorialOverlayCard).not.toContainText("已经持有 3 张预兆");
    await expect(await readOmenNamesByPlayer()).toEqual({
      "0": [],
      "1": [],
      "2": [],
    });
    await expect(page.getByTestId("betrayal-scenario-reader-dialog")).toHaveCount(
      0,
    );
    await expect(page.getByTestId("betrayal-haunt-reveal-cue")).toHaveCount(0);
    await saveScreenshot(page, STEP_HAUNT_NATURAL_01);
    await expect(page.getByTestId("betrayal-action-endTurn")).toBeVisible();

    await page.getByTestId("betrayal-action-endTurn").click();
    await waitForStep(page, "watch-teammate-omen-turns", 10000);
    await expect(tutorialOverlayCard).toContainText("现在不是你的回合");
    await expect(tutorialOverlayCard).toContainText("等待队友 1 探索预兆房间");
    await expect(tutorialOverlayCard).not.toContainText("点“探索”");
    await expect
      .poll(readOmenNamesByPlayer, {
        message: "队友 1 必须通过正式探索自然获得指环",
        timeout: 30000,
      })
      .toMatchObject({
        "0": [],
        "1": ["指环"],
        "2": [],
      });
    await expect
      .poll(readHauntState, {
        message: "队友 1 获得第一张预兆后仍应处于作祟前",
        timeout: 30000,
      })
      .toMatchObject({
        currentPlayer: "2",
        phase: "preHaunt",
        hauntTriggered: false,
      });
    await saveScreenshot(page, STEP_HAUNT_NATURAL_02);

    await clickNext(page);
    await waitForStep(page, "teammate-omen-results", 10000);
    await expect(tutorialOverlayCard).toContainText("队友 1 获得指环");
    await expect(tutorialOverlayCard).toContainText("1 颗作祟骰低于 5+");
    await expect(tutorialOverlayCard).toContainText("交给队友 2");
    await saveScreenshot(page, STEP_HAUNT_NATURAL_03);

    await clickNext(page);
    await waitForStep(page, "watch-teammate-two-omen-turn", 10000);
    await expect(tutorialOverlayCard).toContainText("队友 2");
    await expect(tutorialOverlayCard).toContainText("翻出狗");
    await expect
      .poll(readOmenNamesByPlayer, {
        message: "队友 2 必须通过正式探索自然翻出狗",
        timeout: 30000,
      })
      .toMatchObject({
        "0": [],
        "1": ["指环"],
        "2": ["狗"],
      });
    await expect
      .poll(readHauntState, {
        message: "队友 2 翻出狗后仍应处于作祟前",
        timeout: 30000,
      })
      .toMatchObject({
        currentPlayer: "2",
        phase: "preHaunt",
        hauntTriggered: false,
        recentRollKind: "hauntRoll",
        recentRollDiceCount: 2,
      });
    const discoveryPanel = page.getByTestId("betrayal-discovery-panel");
    await expect(discoveryPanel).toBeVisible({ timeout: 10000 });
    await expect(discoveryPanel).toContainText("狗");
    await expect(
      discoveryPanel.getByTestId("betrayal-recent-roll-panel"),
    ).toBeVisible();
    await expect(
      discoveryPanel.getByTestId("betrayal-house-dice-3d-group"),
    ).toHaveAttribute("data-dice-count", "2");
    await expect(
      discoveryPanel.getByTestId("betrayal-recent-roll-total"),
    ).toContainText("总点数");
    await expect(tutorialOverlayCard).toContainText("第二张预兆用 2 颗骰检定");
    await expect(page.getByTestId("betrayal-scenario-reader-dialog")).toHaveCount(
      0,
    );
    await saveScreenshot(page, STEP_HAUNT_NATURAL_04);

    await clickNext(page);
    await waitForStep(page, "teammate-two-omen-results", 10000);
    await expect(tutorialOverlayCard).toContainText("队友 2 确认狗");
    await expect(tutorialOverlayCard).toContainText("回合回到你");
    await expect
      .poll(readOmenNamesByPlayer, {
        message: "狗确认后持有区应保留前两张自然预兆",
        timeout: 30000,
      })
      .toMatchObject({
        "0": [],
        "1": ["指环"],
        "2": ["狗"],
      });
    await expect
      .poll(readHauntState, {
        message: "狗确认后仍未触发作祟且回到当前玩家",
        timeout: 30000,
      })
      .toMatchObject({
        currentPlayer: "0",
        phase: "preHaunt",
        hauntTriggered: false,
      });
    await saveScreenshot(page, STEP_HAUNT_NATURAL_05);

    await clickNext(page);
    await waitForStep(page, "hand-off-to-teammate-second-cycle", 10000);
    await expect(tutorialOverlayCard).toContainText("现在又轮到你");
    await expect(tutorialOverlayCard).toContainText("不会替队友操作");
    await expect(page.getByTestId("betrayal-action-endTurn")).toBeVisible();
    await saveScreenshot(page, STEP_HAUNT_NATURAL_06);

    await page.getByTestId("betrayal-action-endTurn").click();
    await waitForStep(page, "watch-teammate-haunt-trigger", 10000);
    await expect(tutorialOverlayCard).toContainText("队友 1 继续探索");
    await expect(tutorialOverlayCard).toContainText("获得面具");
    await expect
      .poll(readOmenNamesByPlayer, {
        message: "队友 1 必须通过正式探索自然翻出第三张面具",
        timeout: 30000,
      })
      .toMatchObject({
        "0": [],
        "1": ["指环", "面具"],
        "2": ["狗"],
      });
    await expect
      .poll(readHauntState, {
        message: "队友 1 翻出第三张面具后必须自然触发木乃伊作祟",
        timeout: 30000,
      })
      .toMatchObject({
        currentPlayer: "2",
        phase: "haunt",
        hauntTriggered: true,
        hauntScenarioCardId: "mummy-rampage",
        hauntRevealerPlayerId: "1",
        traitorPlayerId: "1",
        recentRollKind: "hauntRoll",
        recentRollDiceCount: 3,
      });
    await expect(discoveryPanel).toBeVisible({ timeout: 10000 });
    await expect(discoveryPanel).toContainText("面具");
    await expect(
      discoveryPanel.getByTestId("betrayal-recent-roll-panel"),
    ).toBeVisible();
    await expect(
      discoveryPanel.getByTestId("betrayal-house-dice-3d-group"),
    ).toHaveAttribute("data-dice-count", "3");
    await expect(
      discoveryPanel.getByTestId("betrayal-recent-roll-total"),
    ).toContainText("总点数");
    await expect(page.getByTestId("betrayal-scenario-reader-dialog")).toHaveCount(
      0,
    );
    await saveScreenshot(page, STEP_HAUNT_NATURAL_07);

    await clickNext(page);
    await waitForStep(page, "haunt-hero-reader", 30000);
    await expect(await readOmenNamesByPlayer()).toMatchObject({
      "0": [],
      "1": ["指环", "面具"],
      "2": ["狗"],
    });
    await expect(await readHauntState()).toMatchObject({
      currentPlayer: "2",
      phase: "haunt",
      hauntTriggered: true,
      hauntScenarioCardId: "mummy-rampage",
      hauntRevealerPlayerId: "1",
      traitorPlayerId: "1",
      recentRollKind: "hauntRoll",
      recentRollDiceCount: 3,
    });
    const scenarioReader = page.getByTestId("betrayal-scenario-reader-dialog");
    await expect(scenarioReader).toBeVisible({ timeout: 10000 });
    const scenarioReaderPage = page.getByTestId(
      "betrayal-scenario-objective-page",
    );
    await expect(scenarioReaderPage).toHaveAttribute(
      "data-scenario-reader-scope",
      "heroes",
    );
    await expect(page.getByTestId("betrayal-scenario-opening-stage")).toBeVisible();
    await expect(page.getByTestId("betrayal-scenario-book")).toHaveCount(0);
    await expect(
      page.getByTestId("betrayal-scenario-opening-cinematic"),
    ).toContainText("英雄开场过场");
    await expect(
      page.getByTestId("betrayal-scenario-opening-cinematic"),
    ).toContainText("挚爱");
    await expect(
      page.getByTestId("betrayal-scenario-opening-cinematic"),
    ).not.toContainText("叛徒开场过场");
    await expect(
      page.getByTestId("betrayal-scenario-reader-header-progress"),
    ).toContainText("1/2");
    await expect(page.getByTestId("betrayal-scenario-reader-next-zone")).toBeVisible();
    await expect(page.getByTestId("betrayal-scenario-reader-next-zone")).toBeEnabled();
    await expect(page.getByTestId("betrayal-scenario-reader-next-zone")).toContainText("进入剧本书");
    await expect(tutorialOverlayCard).toContainText("英雄开场过场");
    await expectTutorialCardInForeground(page, "英雄开场过场");
    await saveScreenshot(page, STEP_HAUNT_NATURAL_08);

    await clickNext(page);
    await waitForStep(page, "haunt-hero-reader-turn-page", 10000);
    await expect(tutorialOverlayCard).toContainText("开场过场读完后");
    await expect(tutorialOverlayCard).toContainText("进入剧本书");
    await expect(tutorialOverlayCard).toContainText("英雄剧本书目标页");
    await expect(
      page.getByTestId("betrayal-scenario-reader-header-progress"),
    ).toContainText("1/2");
    await expect(page.getByTestId("betrayal-scenario-reader-next-zone")).toBeVisible();
    await expect(page.getByTestId("betrayal-scenario-reader-next-zone")).toBeEnabled();
    await expectTutorialCardInForeground(page, "英雄剧本书目标页");
    await saveScreenshot(page, STEP_HAUNT_NATURAL_09);

    await page.getByTestId("betrayal-scenario-reader-next-zone").click();
    await waitForStep(page, "haunt-hero-reader-goal", 10000);
    await expect(scenarioReader).toContainText("英雄剧本书", { timeout: 10000 });
    await expect(scenarioReader).toContainText("真名");
    await expect(scenarioReader).toContainText("驱逐法术");
    await expect(scenarioReader).toContainText("驱逐木乃伊");
    await expect(scenarioReader).toContainText("石棺");
    await expect(scenarioReader).toContainText("研究室");
    await expect(scenarioReader).toContainText("图书馆");
    await expect(scenarioReader).toContainText("研究木乃伊的历史");
    await expect(scenarioReader).not.toContainText("叛徒目标");
    await expect(
      page.getByTestId("betrayal-scenario-reader-header-progress"),
    ).toContainText("2/2");
    await expect(
      page.getByTestId("betrayal-scenario-book-turning-sheet"),
    ).toHaveCount(0);
    await expect(page.getByTestId("tutorial-highlight-ring")).toHaveAttribute(
      "data-tutorial-highlight-target",
      "betrayal-scenario-book-section-special",
    );
    await expectTutorialCardInForeground(page, "英雄剧本书目标页写明");
    await expectTutorialCardDoesNotCoverTargets(
      page,
      ["betrayal-scenario-book-section-special"],
      "英雄剧本书目标页与图书馆原因",
    );
    await saveScreenshot(page, STEP_HAUNT_NATURAL_10);

    await clickNext(page);
    await waitForStep(page, "haunt-hero-reader-close", 10000);
    await expect(tutorialOverlayCard).toContainText("点关闭回到牌桌");
    await expect(page.getByTestId("betrayal-scenario-reader-close")).toBeVisible();
    await expectTutorialCardInForeground(page, "点关闭回到牌桌");
    await saveScreenshot(page, STEP_HAUNT_NATURAL_11);

    await page.getByTestId("betrayal-scenario-reader-close").click();
    await expect(scenarioReader).toBeHidden();
    await waitForStep(page, "wait-for-hero-turn-after-haunt", 10000);
    await expect(page.getByTestId("betrayal-runtime-header-grid")).toContainText(
      /作祟中|恶兆后|Haunt/i,
    );
    await expect(tutorialOverlayCard).toContainText("作祟后轮序继续");
    await expect(tutorialOverlayCard).toContainText("队友 2 按正式流程结束回合");
    await expect(tutorialOverlayCard).toContainText("你仍在上层平台");
    await expect(tutorialOverlayCard).toContainText("图书馆可用于");
    await expect
      .poll(readHauntState, {
        message: "作祟读本关闭后必须等队友 2 按正式结束回合交回当前英雄",
        timeout: 30000,
      })
      .toMatchObject({
        currentPlayer: "0",
        currentExplorerRoomId: "upper-landing",
        phase: "haunt",
        hauntTriggered: true,
        mummyKnowledgeTokenCount: 0,
        mummyTrueNameFound: false,
      });
    await expect(page.getByTestId("betrayal-scenario-reader-dialog")).toBeHidden();
    await saveScreenshot(page, STEP_HAUNT_NATURAL_12);

    await clickNext(page);
    await waitForStep(page, "open-library-move-after-goal", 10000);
    await expect(tutorialOverlayCard).toContainText("已经读到英雄目标");
    await expect(tutorialOverlayCard).toContainText("先点“移动”");
    await expect(tutorialOverlayCard).toContainText("从上层平台可前往的房间");
    await expect(page.getByTestId("betrayal-action-move")).toBeVisible();
    await expect(page.getByTestId("betrayal-action-move")).toBeEnabled();
    await expect(page.getByTestId("tutorial-highlight-ring")).toHaveAttribute(
      "data-tutorial-highlight-target",
      "betrayal-action-move",
    );
    await expectTutorialCardInForeground(page, "先点“移动”");
    await saveScreenshot(page, STEP_HAUNT_NATURAL_13);

    await page.getByTestId("betrayal-action-move").click();
    await waitForStep(page, "move-to-library-after-goal", 10000);
    await expect(tutorialOverlayCard).toContainText("图书馆现在是相邻移动目标");
    await expect(tutorialOverlayCard).toContainText("点击图书馆移动进去");
    await expect(tutorialOverlayCard).toContainText("进去后才能执行");
    const postGoalLibraryRoom = page.getByTestId("betrayal-room-upper-west");
    await expect(postGoalLibraryRoom).toBeVisible({ timeout: 10000 });
    await expect(postGoalLibraryRoom).toBeEnabled();
    await expect(postGoalLibraryRoom).toContainText("图书馆");
    await expect(page.getByTestId("tutorial-highlight-ring")).toHaveAttribute(
      "data-tutorial-highlight-target",
      "betrayal-room-upper-west",
    );
    await expectTutorialCardInForeground(page, "图书馆现在是相邻移动目标");
    await saveScreenshot(page, STEP_HAUNT_NATURAL_14);

    await postGoalLibraryRoom.click();
    await expect(
      page.getByTestId("betrayal-room-occupant-upper-west-0"),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByTestId("betrayal-visual-transition-blocker"),
    ).toHaveCount(0, { timeout: 10000 });
    await waitForStep(page, "hero-study-name-roll", 10000);
    await expect(tutorialOverlayCard).toContainText("石棺房、研究室或图书馆");
    await expect(tutorialOverlayCard).toContainText("你当前在图书馆");
    await expect(tutorialOverlayCard).toContainText("寻找木乃伊真名");
    await expect(tutorialOverlayCard).toContainText("6+ 知识检定");
    await expect(page.getByTestId("betrayal-action-use")).toBeVisible();
    await expect(page.getByTestId("betrayal-action-use")).toBeEnabled();
    await expect(page.getByTestId("betrayal-action-use")).toContainText(
      "寻找木乃伊真名",
    );
    await expect
      .poll(readHauntState, {
        message: "P0 必须先真实移动进图书馆，再提供找真名的正式动作入口",
        timeout: 10000,
      })
      .toMatchObject({
        currentPlayer: "0",
        currentExplorerRoomId: "upper-west",
        mummyKnowledgeTokenCount: 0,
        mummyTrueNameFound: false,
      });
    await expectTutorialCardInForeground(page, "寻找木乃伊真名");
    await saveScreenshot(page, STEP_HAUNT_NATURAL_15);

    await page.getByTestId("betrayal-action-use").click();
    await waitForStep(page, "hero-study-name-result", 10000);
    const studyNameRollPanel = page.getByTestId("betrayal-recent-roll-panel");
    await expect(studyNameRollPanel).toBeVisible({ timeout: 10000 });
    await expect(studyNameRollPanel).toContainText("寻找木乃伊真名");
    await expect(studyNameRollPanel).toContainText("知识检定");
    await expect(studyNameRollPanel.getByTestId("betrayal-recent-roll-outcome"))
      .toContainText("取得第 1 枚知识标记");
    await expect(studyNameRollPanel.getByTestId("betrayal-recent-roll-total"))
      .toContainText("总点数");
    await expectVisiblePhysicalDiceBox(studyNameRollPanel);
    await waitForPhysicalDiceSettled(studyNameRollPanel);
    await expect
      .poll(readHauntState, {
        message: "寻找真名成功后必须写入第 1 枚知识标记，而不是只显示教程提示",
        timeout: 10000,
      })
      .toMatchObject({
        currentPlayer: "0",
        phase: "haunt",
        recentRollKind: "hauntActionTraitCheck",
        recentRollDiceCount: 4,
        recentRollSourceTitle: "寻找木乃伊真名",
        recentRollLabel: "知识检定",
        recentRollLatestLabel: "取得第 1 枚知识标记",
        mummyKnowledgeTokenCount: 1,
        mummyTrueNameFound: true,
        mummyBanishmentSpellLearned: false,
        recommendedAction: "endTurn",
      });
    await expect(tutorialOverlayCard).toContainText("检定成功");
    await expect(tutorialOverlayCard).toContainText("点“确认”回到牌桌");
    const studyNameContinueButton = page.getByTestId("betrayal-roll-continue");
    await expect(studyNameContinueButton).toBeVisible();
    await expect(studyNameContinueButton).toHaveAttribute(
      "data-recent-roll-confirmed-count",
      "0",
    );
    await expect(studyNameContinueButton).toHaveAttribute(
      "data-recent-roll-required-count",
      "1",
    );
    await expectTutorialCardInForeground(page, "检定成功");
    await saveScreenshot(page, STEP_HAUNT_NATURAL_16);

    await studyNameContinueButton.click();
    await waitForStep(page, "hero-study-name-closeout", 10000);
    await expect(page.getByTestId("betrayal-recent-roll-panel")).toBeHidden();
    await expect(tutorialOverlayCard).toContainText("结果已经落到英雄目标进度上");
    await expect(tutorialOverlayCard).toContainText("每名英雄每回合只能尝试一个");
    await expect(tutorialOverlayCard).toContainText("结束回合");
    await expect(page.getByTestId("betrayal-action-endTurn")).toBeVisible();
    await expect(page.getByTestId("betrayal-action-endTurn")).toBeEnabled();
    await expect
      .poll(readHauntState, {
        message: "确认找真名结果后必须关闭投骰层并回到结束回合入口，不能停在结果层或接非法同回合动作",
        timeout: 10000,
      })
      .toMatchObject({
        currentPlayer: "0",
        currentExplorerRoomId: "upper-west",
        phase: "haunt",
        recentRollKind: null,
        mummyKnowledgeTokenCount: 1,
        mummyTrueNameFound: true,
        mummyBanishmentSpellLearned: false,
        recommendedAction: "endTurn",
    });
    await expectTutorialCardInForeground(page, "结果已经落到英雄目标进度上");
    await saveScreenshot(page, STEP_HAUNT_NATURAL_17);

    assertNoFatalFrontendErrors([
      { label: "betrayal-tutorial-haunt-natural-trigger-flow", diagnostics },
    ]);
  });

  test("[haunt-representative] 作祟后代表态会打开剧本并驱逐木乃伊", async ({
    page,
    context,
  }) => {
    test.setTimeout(120000);
    await initBetrayalContext(context, { skipTutorial: false });
    const diagnostics = attachPageDiagnostics(
      page,
      "betrayal-tutorial-haunt-representative",
    );

    await page.setViewportSize({ width: 1600, height: 900 });
    await warmBetrayalFrontend(context);
    await page.goto("/play/betrayal/tutorial/haunt-actions-and-finish", {
      waitUntil: "domcontentloaded",
    });
    await waitForBetrayalPageReady(page);
    await waitForHauntRuntime(page, 30000);
    await waitForStep(page, "help-entry");
    const autoScenarioReaderDialog = page.getByTestId(
      "betrayal-scenario-reader-dialog",
    );
    if (
      await autoScenarioReaderDialog
        .isVisible({ timeout: 800 })
        .catch(() => false)
    ) {
      await expect(autoScenarioReaderDialog).toContainText("木乃伊横行");
      await expect(autoScenarioReaderDialog).toContainText("英雄剧本书");
      await expect(autoScenarioReaderDialog).toContainText("敌方情报 / 胜利条件");
      await page.getByTestId("betrayal-scenario-reader-close").click();
      await expect(autoScenarioReaderDialog).toBeHidden();
    }
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "打开剧本书",
    );
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "目标与胜利条件",
    );
    await expect(page.getByTestId("tutorial-overlay-card")).not.toContainText(
      "帮助入口",
    );
    await expect(page.getByTestId("tutorial-overlay-card")).not.toContainText(
      "底部动作按钮",
    );
    await expect(page.getByTestId("tutorial-overlay-card")).not.toContainText(
      "替代",
    );
    await expect(
      page.locator('[data-tutorial-id="betrayal-open-scenario"]'),
    ).toBeVisible();
    await expect(
      page.getByTestId("betrayal-monster-board-token-mummy"),
    ).toBeVisible();
    await saveScreenshot(page, STEP_17);
    await page.getByTestId("betrayal-open-scenario").click();
    const scenarioObjectivePage = page.getByTestId(
      "betrayal-scenario-objective-page",
    );
    await expect(scenarioObjectivePage).toBeVisible();
    await expect(page.getByTestId("betrayal-scenario-reader-title")).toHaveCount(0);
    await expect(scenarioObjectivePage).toContainText("英雄剧本书");
    await expect(
      page.getByTestId("betrayal-scenario-reader-header-progress"),
    ).toContainText("2/2");
    await expect(
      page.getByTestId("betrayal-scenario-reader-prev-zone"),
    ).toBeEnabled();
    await expect(scenarioObjectivePage).toContainText("敌方情报 / 胜利条件");
    await expect(scenarioObjectivePage).toContainText("真名");
    await expect(scenarioObjectivePage).toContainText("驱逐法术");
    await expect(scenarioObjectivePage).toContainText("驱逐木乃伊");
    await expect(
      page.getByTestId("betrayal-scenario-book-turning-sheet"),
    ).toHaveCount(0);
    await saveScreenshot(page, STEP_18);
    await page.getByTestId("betrayal-scenario-reader-close").click();
    await expect(
      page.getByTestId("betrayal-scenario-reader-dialog"),
    ).toBeHidden();
    await page.getByTestId("betrayal-open-reference").click();
    const hauntReferenceImage = page.getByTestId(
      "betrayal-reference-card-image",
    );
    await expect(hauntReferenceImage).toBeVisible();
    await expect(hauntReferenceImage).toHaveAttribute(
      "data-asset-src",
      "betrayal/cards/player-reference-zh-front",
    );
    await expectImageLoaded(hauntReferenceImage);
    await page.getByTestId("betrayal-reference-toggle").click();
    await expect(hauntReferenceImage).toHaveAttribute(
      "data-asset-src",
      "betrayal/cards/player-reference-zh-back",
    );
    await expectImageLoaded(hauntReferenceImage);
    await page.getByTestId("betrayal-reference-toggle").click();
    await expect(hauntReferenceImage).toHaveAttribute(
      "data-asset-src",
      "betrayal/cards/traitor-reference-zh",
    );
    await expectImageLoaded(hauntReferenceImage);
    await page.getByTestId("betrayal-reference-toggle").click();
    await expect(hauntReferenceImage).toHaveAttribute(
      "data-asset-src",
      "betrayal/cards/monster-reference-zh",
    );
    await expectImageLoaded(hauntReferenceImage);
    await page.getByTestId("betrayal-reference-close").click();
    await expect(page.getByTestId("betrayal-reference-overlay")).toBeHidden();
    await clickNext(page);

    await waitForStep(page, "haunt-actions");
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "6+ 知识考验",
    );
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "石棺房、研究室或图书馆",
    );
    await expect(
      page.getByTestId("betrayal-action-use"),
    ).toContainText(/驱逐木乃伊|Banish Mummy/i);
    const banishTarget = await resolveMummyBanishRoomTarget(page);
    await expect(
      page.getByTestId(`betrayal-room-${banishTarget.roomId}`),
    ).toHaveAttribute("data-direct-target", "true");
    await expect(
      page.getByTestId(`betrayal-room-focus-card-highlight-${banishTarget.roomId}`),
    ).toHaveAttribute("data-highlight-shape", "room");
    await saveScreenshot(page, STEP_19);
    await clickNext(page);

    await waitForStep(page, "banish-mummy");
    await page.getByTestId(`betrayal-room-${banishTarget.roomId}`).click();

    const exorciseRollReview = page.getByTestId(
      "betrayal-exorcise-roll-review",
    );
    await expect(exorciseRollReview).toBeVisible({ timeout: 30000 });
    const exorciseRollPanel = exorciseRollReview.getByTestId(
      "betrayal-recent-roll-panel",
    );
    await expect(exorciseRollPanel).toBeVisible();
    await expect(exorciseRollPanel).toContainText("驱逐木乃伊");
    await expect(exorciseRollPanel).toContainText("神志对抗");
    await expect(
      exorciseRollReview.getByTestId("betrayal-recent-roll-total"),
    ).toContainText("总点数");
    await expect(page.getByTestId("betrayal-endgame-screen")).toBeHidden();
    await expectVisiblePhysicalDiceBox(exorciseRollPanel);
    await waitForPhysicalDiceSettled(exorciseRollPanel);
    await saveScreenshot(page, STEP_20);
    await expect(page.getByTestId("betrayal-exorcise-roll-continue")).toBeVisible();
    await page.getByTestId("betrayal-exorcise-roll-continue").click();

    await waitForStep(page, "endgame-review", 30000);
    const endgameScreen = page.getByTestId("betrayal-endgame-screen");
    await expect(endgameScreen).toBeVisible({ timeout: 30000 });
    await expect(endgameScreen).toContainText("木乃伊");
    await expect(endgameScreen).toContainText("烟消云散");
    await expect(exorciseRollReview).toBeHidden();
    await expect(page.getByTestId("betrayal-recent-roll-panel")).toBeHidden();
    await saveScreenshot(page, STEP_21);

    assertNoFatalFrontendErrors([
      { label: "betrayal-tutorial-haunt-representative", diagnostics },
    ]);
  });

  test("[omen-confirm] 预兆教程会按规则解释作祟检定并保留一次确认", async ({
    page,
    context,
  }) => {
    test.setTimeout(90000);
    await initBetrayalContext(context, { skipTutorial: false });
    const diagnostics = attachPageDiagnostics(
      page,
      "betrayal-tutorial-omen-confirmation",
    );

    await page.setViewportSize({ width: 1600, height: 900 });
    await warmBetrayalFrontend(context);
    await page.goto("/play/betrayal/tutorial/omen-confirmation-and-haunt-risk", {
      waitUntil: "domcontentloaded",
    });
    await waitForBetrayalPageReady(page);

    await expect(page.getByTestId("betrayal-board")).toBeVisible({
      timeout: 30000,
    });
    await waitForStep(page, "confirm-omen-card");
    const discoveryContinue = page.getByTestId("betrayal-discovery-continue");
    const latestDiscovery = page.locator(
      '[data-tutorial-id="betrayal-latest-discovery"]',
    );
    await expect(latestDiscovery).toBeVisible();
    await expect(page.getByTestId("betrayal-discovery-panel-main")).toBeVisible();
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "预兆符号",
    );
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "翻出的预兆牌",
    );
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "所有玩家持有的预兆总数",
    );
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText("5+");
    await expect(page.getByTestId("tutorial-overlay-card")).not.toContainText(
      "同一画面",
    );
    await expect(discoveryContinue).toHaveText(/^确认$/);
    await expect(discoveryContinue).toHaveAttribute(
      "data-pending-card-resolution-step",
      "1/1",
    );
    await saveScreenshot(page, STEP_40);

    await discoveryContinue.click();
    await waitForStep(page, "omen-confirmation-review", 30000);
    await expect(latestDiscovery).toBeHidden({
      timeout: 30000,
    });
    await expect(page.getByTestId("betrayal-inventory-row-omen")).toContainText(
      "狗",
    );
    await expect(page.getByTestId("betrayal-runtime-header-grid")).toContainText(
      /作祟前|Pre-Haunt/i,
    );
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "你获得这张预兆",
    );
    await saveScreenshot(page, STEP_42);

    await clickNext(page);
    await waitForStep(page, "haunt-risk-track");
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "高亮格表示已发现的预兆数",
    );
    await expect(
      page.locator('[data-tutorial-id="betrayal-haunt-risk-status"]'),
    ).toBeVisible();
    await expect(page.getByTestId("betrayal-haunt-risk-progress")).toHaveAttribute(
      "data-haunt-risk-style",
      "official-asset-track",
    );
    await expect(page.getByTestId("betrayal-haunt-risk-slot")).toHaveCount(10);
    await expect(
      page.locator('[data-haunt-risk-current-cell="true"]'),
    ).toHaveCount(1);
    await saveScreenshot(page, STEP_43);

    assertNoFatalFrontendErrors([
      { label: "betrayal-tutorial-omen-confirmation", diagnostics },
    ]);
  });

  test("交易教程会选双方持有物、提交方案后等待队友正式自动同意", async ({
    page,
    context,
  }) => {
    test.setTimeout(120000);
    await initBetrayalContext(context, { skipTutorial: false });
    const diagnostics = attachPageDiagnostics(
      page,
      "betrayal-tutorial-trade-and-agreement",
    );

    await page.setViewportSize({ width: 1600, height: 900 });
    await warmBetrayalFrontend(context);
    await page.goto("/play/betrayal/tutorial/trade-and-agreement", {
      waitUntil: "domcontentloaded",
    });
    await waitForBetrayalPageReady(page);

    await waitForStep(page, "setup-trade");
    await expect(page.getByTestId("betrayal-board")).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "同一房间",
    );
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "双方都要同意",
    );
    await expect(page.getByTestId("betrayal-action-trade")).toContainText(
      "交易",
    );
    await expect(page.getByTestId("betrayal-trade-status")).toContainText(
      "同房间可交易对象：1人",
    );
    await expectTutorialCardDoesNotCoverTargets(
      page,
      ["betrayal-action-trade", "betrayal-inventory-medical-kit"],
      "交易教程起点",
    );
    await expect(page.getByTestId("betrayal-inventory-medical-kit")).not.toContainText(
      "下回合",
    );
    await expect(page.getByTestId("betrayal-inventory-rope")).not.toContainText(
      "下回合",
    );
    await expect(page.getByTestId("betrayal-inventory-omen-book")).not.toContainText(
      "下回合",
    );
    await saveScreenshot(page, STEP_29);

    await clickNext(page);
    await waitForStep(page, "start-trade");
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "点“交易”",
    );
    await expectTutorialCardDoesNotCoverTargets(
      page,
      ["betrayal-action-trade"],
      "进入交易选择态",
    );
    await page.getByTestId("betrayal-action-trade").click();
    await expect(page.getByTestId("betrayal-trade-flow-banner")).toBeVisible();

    await clickNext(page);
    await waitForStep(page, "choose-trade-item");
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "急救包",
    );
    await expect(page.getByTestId("betrayal-inventory-medical-kit")).toBeVisible();
    await expectTutorialCardDoesNotCoverTargets(
      page,
      ["betrayal-inventory-medical-kit"],
      "选择己方交易物品",
    );
    await page.getByTestId("betrayal-inventory-medical-kit").click();
    await expect(
      page.getByTestId("betrayal-selected-inventory-card-name"),
    ).toContainText("急救包");
    await expect(page.getByTestId("betrayal-inventory-medical-kit")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await saveScreenshot(page, STEP_30);

    await clickNext(page);
    await waitForStep(page, "choose-trade-target");
    const teammateToken = page.getByTestId("betrayal-room-occupant-hallway-1");
    await expect(
      teammateToken,
      "交易教程必须能直接点击地图上的同房间队友 token",
    ).toBeVisible();
    await expect(teammateToken).toHaveAttribute("data-direct-target", "true");
    await expectTutorialCardDoesNotCoverTargets(
      page,
      ["betrayal-room-occupant-hallway-1"],
      "选择同房间队友",
    );
    await page.getByTestId("betrayal-room-occupant-hallway-1").click();
    await expect(
      page.getByTestId("betrayal-trade-return-selector"),
    ).toBeVisible();
    await expectTradeCandidateTrayAnchoredToFlow(
      page,
      "betrayal-trade-return-selector",
    );
    await expect(
      page.getByTestId("betrayal-trade-return-skip"),
      "空选择不是候选按钮；没点对方卡时摘要和确认按钮承接当前选择",
    ).toHaveCount(0);
    await expect(
      page.getByTestId("betrayal-trade-return-card-map"),
    ).toBeVisible();
    await expect(
      page.getByTestId("betrayal-trade-return-card-skull"),
    ).toBeVisible();
    await expectInventoryCandidateCardHasAtlas(
      page.getByTestId("betrayal-trade-return-card-map"),
      "betrayal-trade-return-card-map",
    );
    await expectInventoryCandidateCardHasAtlas(
      page.getByTestId("betrayal-trade-return-card-skull"),
      "betrayal-trade-return-card-skull",
    );
    await expect(
      tradeActionPanelItemStep(page),
      "未主动选择对方物品时，交易摘要只列己方给出物",
    ).toContainText(/你给出.*急救包/);
    await expect(tradeActionPanelTargetStep(page)).toContainText("提交方案");
    await expectTradeConfirmAnchoredToFlow(page);
    await saveScreenshot(page, STEP_31);

    await clickNext(page);
    await waitForStep(page, "choose-trade-return");
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "对方持有区",
    );
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "地图",
    );
    await expectTutorialCardDoesNotCoverTargets(
      page,
      ["betrayal-trade-return-selector", "betrayal-trade-return-card-map"],
      "选择对方给出的地图",
    );
    await page.getByTestId("betrayal-trade-return-card-map").click();
    await expect(tradeActionPanelItemStep(page)).toContainText(
      /你给出.*急救包.*对方给出.*地图/,
    );
    await expect(
      page.getByTestId("betrayal-trade-return-card-map-selected-outline"),
    ).toBeVisible();
    await saveScreenshot(page, STEP_32);

    await clickNext(page);
    await waitForStep(page, "send-trade-request");
    const tradeButton = page.getByTestId("betrayal-action-trade");
    await expect(tradeButton).toBeEnabled();
    await expect(tradeButton).toContainText("提交方案");
    await expectTradeConfirmAnchoredToFlow(page);
    await expectTutorialCardDoesNotCoverTargets(
      page,
      ["betrayal-action-trade", "betrayal-trade-flow-banner"],
      "确认交易方案",
    );
    await tradeButton.click();
    await waitForStep(page, "request-waiting", 30000);
    await waitForTradeAgreementState(page, "waiting");
    await expectTutorialCardDoesNotCoverTargets(
      page,
      ["betrayal-trade-flow-banner"],
      "等待队友同意交易",
    );
    await expect(tradeActionPanelTargetStep(page)).toContainText("等待");
    await expect(tradeActionPanelItemStep(page)).toContainText(
      /你给出.*急救包.*对方给出.*地图/,
    );
    await expect(
      page.getByTestId("betrayal-trade-agreement-panel"),
    ).toHaveCount(0);
    await saveScreenshot(page, STEP_33);

    await waitForAutoAcceptedTradeReview(page);
    await expect(
      page.getByTestId("betrayal-trade-agreement-panel"),
    ).toHaveCount(0);
    await expectTutorialCardDoesNotCoverTargets(
      page,
      ["betrayal-room-latest-feedback"],
      "交易公开结果",
    );
    await saveScreenshot(page, STEP_34);
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const state = (
              window as unknown as {
                __BG_TEST_HARNESS__?: {
                  state?: {
                    get?: () => {
                      core?: {
                        currentExplorer?: {
                          inventory?: Array<{ name: string }>;
                        };
                        otherExplorers?: Array<{
                          playerId: string;
                          inventory?: Array<{ name: string }>;
                        }>;
                        pendingTradeAgreement?: unknown | null;
                      };
                    };
                  };
                };
              }
            ).__BG_TEST_HARNESS__?.state?.get?.();
            const currentInventory =
              state?.core?.currentExplorer?.inventory?.map(
                (item) => item.name,
              ) ?? [];
            const teammateInventory =
              state?.core?.otherExplorers
                ?.find((explorer) => explorer.playerId === "1")
                ?.inventory?.map((item) => item.name) ?? [];
            return {
              currentHasMedicalKit: currentInventory.includes("急救包"),
              currentHasRabbitFoot: currentInventory.includes("兔脚"),
              currentHasBook: currentInventory.includes("书本"),
              currentHasMap: currentInventory.includes("地图"),
              teammateHasMedicalKit: teammateInventory.includes("急救包"),
              teammateHasMap: teammateInventory.includes("地图"),
              teammateHasSkull: teammateInventory.includes("头骨"),
              pendingTradeAgreement: state?.core?.pendingTradeAgreement ?? null,
            };
          }),
        {
          message:
            "交易教程必须在接收方同意后双向转移：发起方得到地图，队友得到急救包，书本和兔脚仍留在发起方",
          timeout: 10000,
        },
      )
      .toMatchObject({
        currentHasMedicalKit: false,
        currentHasRabbitFoot: true,
        currentHasBook: true,
        currentHasMap: true,
        teammateHasMedicalKit: true,
        teammateHasMap: false,
        teammateHasSkull: true,
        pendingTradeAgreement: null,
      });
    assertNoFatalFrontendErrors([
      { label: "betrayal-tutorial-trade-and-agreement", diagnostics },
    ]);
  });

  test("主线教程会从基础回合自然推进到第一次英雄目标行动", async ({
    page,
    context,
  }) => {
    test.setTimeout(120000);
    await initBetrayalContext(context, { skipTutorial: false });
    const diagnostics = attachPageDiagnostics(
      page,
      "betrayal-tutorial-main-player-path",
    );

    await page.setViewportSize({ width: 1600, height: 900 });
    let releaseCriticalEventAtlas!: () => void;
    let criticalEventAtlasReleased = false;
    const criticalEventAtlasGate = new Promise<void>((resolve) => {
      releaseCriticalEventAtlas = () => {
        criticalEventAtlasReleased = true;
        resolve();
      };
    });
    let markCriticalEventAtlasRequested!: () => void;
    const criticalEventAtlasRequested = new Promise<void>((resolve) => {
      markCriticalEventAtlasRequested = resolve;
    });
    await page.route("**/*event-front-atlas*", async (route) => {
      markCriticalEventAtlasRequested();
      if (!criticalEventAtlasReleased) {
        await criticalEventAtlasGate;
      }
      await route.continue();
    });
    await page.goto("/play/betrayal/tutorial/basic-setup-and-turn", {
      waitUntil: "domcontentloaded",
    });
    await criticalEventAtlasRequested;
    await expect(page.getByTestId("loading-screen")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId("betrayal-board")).not.toBeVisible();
    await saveScreenshot(page, TECHNICAL_ASSET_GATE_STEP);
    releaseCriticalEventAtlas();
    await waitForBetrayalPageReady(page);

    await waitForStep(page, "objective-and-turn", 15000);
    await expect(page.getByTestId("tutorial-overlay-card")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId("tutorial-next-button")).toBeVisible({
      timeout: 15000,
    });

    await advanceToStep(page, "open-move-targets");
    await waitForStep(page, "open-move-targets");
    await expect(page.getByTestId("betrayal-action-move")).toBeVisible();
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "点“移动”",
    );
    await saveScreenshot(page, STEP_05);

    await page.getByTestId("betrayal-action-move").click();
    await waitForStep(page, "move-to-hallway");
    await expect(page.getByTestId("betrayal-room-hallway")).toBeVisible();
    await page.getByTestId("betrayal-room-hallway").click();
    await expect(
      page.getByTestId("betrayal-room-latest-feedback"),
    ).toContainText("移动到门厅");
    await waitForStep(page, "explore-upper");
    await saveScreenshot(page, STEP_06);

    await waitForStep(page, "explore-upper");
    await expect(page.getByTestId("betrayal-action-explore")).toBeVisible();
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "再选择出口",
    );
    await page.getByTestId("betrayal-action-explore").click();
    const exploreTargetMarker = page
      .locator('[data-testid^="betrayal-room-explore-target-"]')
      .first();
    await expect(exploreTargetMarker).toBeVisible({ timeout: 10000 });
    const targetRoomTestId = await exploreTargetMarker.evaluate((node) =>
      node
        .getAttribute("data-testid")
        ?.replace("betrayal-room-explore-target-", "betrayal-room-"),
    );
    expect(targetRoomTestId).toBeTruthy();
    const exploreTargetRoom = page.getByTestId(targetRoomTestId!);
    await expect(exploreTargetRoom).toBeVisible();
    await expect(
      page.getByTestId(
        `betrayal-room-explore-card-highlight-${targetRoomTestId!.replace("betrayal-room-", "")}`,
      ),
    ).toBeVisible();
    await saveScreenshot(page, STEP_07);
    await exploreTargetRoom.click();
    const roomPlacementPanel = page.getByTestId("betrayal-room-placement-panel");
    await expect(roomPlacementPanel).toBeVisible({ timeout: 10000 });
    const tutorialOverlayCard = page.getByTestId("tutorial-overlay-card");
    await waitForStep(page, "rotate-room-placement");
    await expect(tutorialOverlayCard).toContainText("旋转新房间");
    await expect(tutorialOverlayCard).toContainText("朝向");
    const rotateRoomPlacementRight = page.getByTestId(
      "betrayal-room-placement-rotate-right",
    );
    await expect(rotateRoomPlacementRight).toBeVisible();
    await expect(rotateRoomPlacementRight).toBeEnabled();
    await expect(page.getByTestId("tutorial-highlight-ring")).toHaveAttribute(
      "data-tutorial-highlight-target",
      "betrayal-room-placement-rotate-right",
    );
    const initialOrientation = await roomPlacementPanel.getAttribute(
      "data-room-orientation-turns",
    );
    await saveScreenshot(page, STEP_08);
    await rotateRoomPlacementRight.click();
    await expect
      .poll(
        () => roomPlacementPanel.getAttribute("data-room-orientation-turns"),
        { timeout: 3000 },
      )
      .not.toBe(initialOrientation);
    await waitForStep(page, "confirm-room-placement");
    await expect(tutorialOverlayCard).toContainText(
      "确认放置",
    );
    await expect(tutorialOverlayCard).toContainText(
      "结算房间文字和符号",
    );
    const roomPlacementConfirm = page.getByTestId("betrayal-room-placement-confirm");
    await expect(roomPlacementConfirm).toBeVisible();
    await expectBetrayalConfirmButtonVisual(
      roomPlacementConfirm,
      "房间放置确认按钮",
    );
    const roomTileAdjustmentOption = page
      .getByTestId("betrayal-room-tile-adjustment-option")
      .first();
    if (await roomTileAdjustmentOption.isVisible().catch(() => false)) {
      await roomTileAdjustmentOption.click();
    }
    await expect(roomPlacementConfirm).toBeEnabled();
    await saveScreenshot(page, STEP_09);
    await roomPlacementConfirm.click();
    await waitForStep(page, "discovery-card-type", 30000);
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "事件符号",
    );
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "翻出事件牌",
    );
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "物品牌",
    );
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "预兆牌",
    );
    await expect(page.getByTestId("betrayal-event-roll-start")).toBeVisible();
    await expect(page.getByTestId("betrayal-event-roll-start")).toBeEnabled();
    await saveScreenshot(page, STEP_10);
    await clickNext(page);
    await waitForStep(page, "roll-event", 30000);
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "点击“投掷事件”",
    );
    await expect(page.getByTestId("betrayal-event-roll-start")).toBeVisible();
    await expect(page.getByTestId("betrayal-event-roll-start")).toBeEnabled();
    await page.getByTestId("betrayal-event-roll-start").click();
    await waitForStep(page, "view-book", 30000);
    await expect(tutorialOverlayCard).toContainText("放大按钮");
    await expect(tutorialOverlayCard).toContainText("读它的牌面");
    await expect(tutorialOverlayCard).not.toContainText("使用书本本体");
    await expect(tutorialOverlayCard).not.toContainText("兔脚");
    await expect(tutorialOverlayCard).not.toContainText("其他玩家确认");
    const latestDiscovery = page.locator(
      '[data-tutorial-id="betrayal-latest-discovery"]',
    );
    await expect(latestDiscovery).toBeVisible({ timeout: 30000 });
    const discoveryReveal = page.getByTestId("betrayal-discovery-panel");
    await expect(discoveryReveal).toBeVisible();
    const discoveryRollPanel = discoveryReveal.getByTestId(
      "betrayal-recent-roll-panel",
    );
    await expect(discoveryRollPanel).toBeVisible();
    await expect(
      page.getByTestId("betrayal-inventory-omen-book"),
    ).toHaveAttribute("data-event-roll-book-available", "true");
    await expect(
      page.getByTestId("betrayal-inventory-omen-book-magnify"),
    ).toBeVisible();
    await expect(page.getByTestId("tutorial-highlight-ring")).toHaveAttribute(
      "data-tutorial-highlight-target",
      "betrayal-inventory-omen-book-magnify",
    );
    await expectVisiblePhysicalDiceBox(discoveryRollPanel);
    await waitForPhysicalDiceSettled(discoveryRollPanel);
    await saveScreenshot(page, STEP_11);

    await page.getByTestId("betrayal-inventory-omen-book-magnify").click();
    const bookPreviewBeforeUse = page.getByTestId(
      "betrayal-inventory-preview-overlay",
    );
    await expect(bookPreviewBeforeUse).toBeVisible();
    await expect(
      bookPreviewBeforeUse.getByTestId("betrayal-inventory-preview-card-shell"),
    ).toBeVisible();
    await expectInventoryPreviewCardReadable(bookPreviewBeforeUse);
    await saveScreenshot(page, STEP_12);
    await expect(bookPreviewBeforeUse).toHaveAttribute(
      "data-backdrop-dismiss",
      "disabled",
    );
    await bookPreviewBeforeUse.click({ position: { x: 8, y: 8 } });
    await expect(
      page.getByTestId("betrayal-inventory-preview-overlay"),
    ).toBeVisible();
    await page.getByTestId("betrayal-inventory-preview-overlay-close").click();
    await expect(
      page.getByTestId("betrayal-inventory-preview-overlay"),
    ).not.toBeVisible();
    await clickNext(page);
    await waitForStep(page, "use-book", 10000);
    await expect(tutorialOverlayCard).toContainText("使用书本本体");
    await expect(tutorialOverlayCard).toContainText("改用知识重新投骰");
    await expect(tutorialOverlayCard).not.toContainText("兔脚");
    await expect(tutorialOverlayCard).not.toContainText("其他玩家确认");
    await expect(page.getByTestId("tutorial-highlight-ring")).toHaveAttribute(
      "data-tutorial-highlight-target",
      "betrayal-inventory-omen-book",
    );
    await expect(
      page.getByTestId("betrayal-inventory-omen-book-shell"),
    ).toHaveAttribute("data-tutorial-target-outline", "true");
    const beforeBookState = await page.evaluate(() => {
      const state = (
        window as unknown as {
          __BG_TEST_HARNESS__?: {
            state?: {
              get?: () => {
                core?: {
                  currentExplorer?: { traits?: { sanity?: number } };
                  recentRoll?: { trait?: string };
                  pendingEventRollResolution?: unknown;
                };
              };
            };
          };
        }
      ).__BG_TEST_HARNESS__?.state?.get?.();
      return {
        sanity: state?.core?.currentExplorer?.traits?.sanity ?? null,
        rollTrait: state?.core?.recentRoll?.trait ?? null,
        pendingRoll: Boolean(state?.core?.pendingEventRollResolution),
      };
    });
    expect(beforeBookState.pendingRoll).toBe(true);
    expect(beforeBookState.rollTrait).toBe("might");

    await setHarnessRandomQueue(page, [0.99, 0, 0, 0, 0, 0]);
    await page.getByTestId("betrayal-inventory-omen-book").click();
    await waitForStep(page, "use-rabbit-foot", 30000);
    await expect(
      page.getByTestId("betrayal-selected-inventory-card-name"),
    ).toHaveCount(0);
    await expect(
      page.getByTestId("betrayal-inventory-preview-overlay"),
    ).not.toBeVisible();
    const afterBookState = await page.evaluate(() => {
      const state = (
        window as unknown as {
          __BG_TEST_HARNESS__?: {
            state?: {
              get?: () => {
                core?: {
                  currentExplorer?: { traits?: { sanity?: number } };
                  recentRoll?: { trait?: string; dice?: number[]; passiveBonus?: number };
                  pendingEventRollResolution?: unknown;
                  usedCardIdsThisTurn?: string[];
                };
              };
            };
          };
        }
      ).__BG_TEST_HARNESS__?.state?.get?.();
      return {
        sanity: state?.core?.currentExplorer?.traits?.sanity ?? null,
        rollTrait: state?.core?.recentRoll?.trait ?? null,
        rollDice: state?.core?.recentRoll?.dice ?? [],
        rollTotal: (
          (state?.core?.recentRoll?.dice ?? []).reduce(
            (sum: number, pip: number) => sum + pip,
            0,
          ) + (state?.core?.recentRoll?.passiveBonus ?? 0)
        ),
        pendingRoll: Boolean(state?.core?.pendingEventRollResolution),
        usedBook: state?.core?.usedCardIdsThisTurn?.includes("omen-book") ?? false,
      };
    });
    expect(afterBookState.sanity).toBe((beforeBookState.sanity ?? 0) - 1);
    expect(afterBookState.rollTrait).toBe("knowledge");
    expect(afterBookState.rollDice[0]).toBe(2);
    expect(afterBookState.rollTotal).toBeLessThan(5);
    expect(afterBookState.pendingRoll).toBe(true);
    expect(afterBookState.usedBook).toBe(true);
    await expect(tutorialOverlayCard).toHaveAttribute(
      "data-tutorial-placement",
      "top",
    );
    await expect(tutorialOverlayCard).not.toContainText(
      "使用持有物 -> 移动 -> 探索 -> 抽发现牌",
    );
    await expect(tutorialOverlayCard).toContainText("兔脚");
    await expect(tutorialOverlayCard).toContainText("书本已把检定改成知识");
    await expect(tutorialOverlayCard).toContainText("确认使用兔脚");
    await expect(tutorialOverlayCard).not.toContainText("其他玩家确认");
    await expect(tutorialOverlayCard).not.toContainText("承受 1 点物理伤害");
    await expect(discoveryReveal).toBeVisible();
    await expect(discoveryReveal).toHaveAttribute(
      "data-allows-inventory-roll-modifiers",
      "true",
    );
    const rabbitFootCard = page.getByTestId("betrayal-inventory-rope");
    await expect(rabbitFootCard).toBeVisible();
    await expect(rabbitFootCard).toHaveAttribute(
      "data-roll-modifier-available",
      "true",
    );
    const rollModifierHighlight = page.getByTestId(
      "betrayal-inventory-rope-roll-modifier",
    );
    await expect(rollModifierHighlight).toBeVisible();
    await expect(rollModifierHighlight).toBeEmpty();
    await expectDiscoveryPanelDoesNotCoverRollModifier(
      discoveryReveal,
      rabbitFootCard,
    );
    await expect(discoveryRollPanel).toBeVisible();
    await expect(discoveryRollPanel).not.toContainText("外星几何");
    await expect(discoveryRollPanel).toContainText("知识检定");
    await expect(
      discoveryReveal.getByTestId("betrayal-recent-roll-total"),
    ).toContainText("总点数");
    await expect(
      discoveryRollPanel.getByTestId("betrayal-recent-roll-breakdown"),
    ).toContainText("骰面合计");
    await expect(
      discoveryRollPanel.getByTestId("betrayal-recent-roll-breakdown"),
    ).toContainText("加值");
    await expect(discoveryRollPanel).toHaveAttribute(
      "data-roll-panel-style",
      "open-table-transparent",
    );
    await expectVisiblePhysicalDiceBox(discoveryRollPanel);
    await waitForPhysicalDiceSettled(discoveryRollPanel);
    await expect
      .poll(
        async () =>
          discoveryRollPanel.evaluate((node) => {
            const rect = (node as HTMLElement).getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          }),
        { timeout: 10000 },
      )
      .toBe(true);
    const rollPanelLayout = await discoveryRollPanel.evaluate((node) => {
      const panel = node as HTMLElement;
      const dice = panel.querySelector(
        '[data-testid="betrayal-house-dice-3d-group"]',
      ) as HTMLElement | null;
      const canvas =
        Array.from(dice?.querySelectorAll("canvas") ?? [])
          .filter(
            (candidate): candidate is HTMLCanvasElement =>
              candidate instanceof HTMLCanvasElement,
          )
          .sort((left, right) => {
            const leftRect = left.getBoundingClientRect();
            const rightRect = right.getBoundingClientRect();
            return (
              rightRect.width * rightRect.height -
              leftRect.width * leftRect.height
            );
          })[0] ?? null;
      const total = panel.querySelector(
        '[data-testid="betrayal-recent-roll-total"]',
      ) as HTMLElement | null;
      const panelRect = panel.getBoundingClientRect();
      const diceRect = dice?.getBoundingClientRect();
      const canvasRect = canvas?.getBoundingClientRect();
      const totalRect = total?.getBoundingClientRect();
      return {
        panelHeight: panelRect.height,
        panelBackground: window.getComputedStyle(panel).backgroundColor,
        diceWidth: diceRect?.width ?? 0,
        diceHeight: diceRect?.height ?? 0,
        canvasWidth: canvasRect?.width ?? 0,
        canvasHeight: canvasRect?.height ?? 0,
        totalTop: totalRect ? totalRect.top - panelRect.top : 0,
        staticDiceImages: panel.querySelectorAll(
          '[data-testid^="betrayal-recent-roll-die-"] img',
        ).length,
      };
    });
    expect(
      rollPanelLayout.diceHeight / rollPanelLayout.panelHeight,
    ).toBeGreaterThan(0.54);
    expect(
      rollPanelLayout.totalTop / rollPanelLayout.panelHeight,
    ).toBeGreaterThan(0.58);
    expect(rollPanelLayout.panelBackground).toBe("rgba(0, 0, 0, 0)");
    expect(rollPanelLayout.diceWidth).toBeGreaterThanOrEqual(540);
    expect(rollPanelLayout.canvasWidth).toBeGreaterThanOrEqual(300);
    expect(rollPanelLayout.canvasHeight).toBeGreaterThanOrEqual(210);
    expect(rollPanelLayout.staticDiceImages).toBe(0);
    const discoveryGeometry = await discoveryReveal.evaluate((node) => {
      const panel = node as HTMLElement;
      const rect = panel.getBoundingClientRect();
      const content = panel.querySelector(
        '[data-testid="betrayal-discovery-panel-content"]',
      ) as HTMLElement | null;
      const visibleGroup = panel.querySelector(
        '[data-testid="betrayal-discovery-panel-main"]',
      ) as HTMLElement | null;
      const discoveryCard = panel.querySelector(
        '[data-testid="betrayal-discovery-card-front-atlas"]',
      ) as HTMLElement | null;
      const contentRect = content?.getBoundingClientRect();
      const visibleGroupRect = visibleGroup?.getBoundingClientRect();
      const discoveryCardRect = discoveryCard?.getBoundingClientRect();
      const rollPanel = panel.querySelector(
        '[data-testid="betrayal-recent-roll-panel"]',
      ) as HTMLElement | null;
      const rollPanelRect = rollPanel?.getBoundingClientRect();
      const rightPanelRects = Array.from(
        document.querySelectorAll(
          '[data-testid="betrayal-status-rail"], [data-testid="betrayal-player-panel"], [data-testid="betrayal-deck-status"]',
        ),
      )
        .map((candidate) => (candidate as HTMLElement).getBoundingClientRect())
        .filter((candidate) => candidate.width > 0 && candidate.height > 0);
      const leftPanelRects = Array.from(
        document.querySelectorAll(
          '[data-testid="betrayal-left-status-rail"], [data-testid="betrayal-inventory-section"]',
        ),
      )
        .map((candidate) => (candidate as HTMLElement).getBoundingClientRect())
        .filter((candidate) => candidate.width > 0 && candidate.height > 0);
      return {
        panelCenterX: rect.left + rect.width / 2,
        panelCenterY: rect.top + rect.height / 2,
        contentCenterX: contentRect
          ? contentRect.left + contentRect.width / 2
          : 0,
        contentCenterY: contentRect
          ? contentRect.top + contentRect.height / 2
          : 0,
        contentLeft: contentRect?.left ?? 0,
        contentRight: contentRect?.right ?? 0,
        visibleGroupCenterX: visibleGroupRect
          ? visibleGroupRect.left + visibleGroupRect.width / 2
          : 0,
        visibleGroupLeft: visibleGroupRect?.left ?? 0,
        visibleGroupRight: visibleGroupRect?.right ?? 0,
        visibleGroupWidth: visibleGroupRect?.width ?? 0,
        discoveryCardLeft: discoveryCardRect?.left ?? 0,
        discoveryCardCenterX: discoveryCardRect
          ? discoveryCardRect.left + discoveryCardRect.width / 2
          : 0,
        rollPanelRight: rollPanelRect?.right ?? 0,
        rightPanelLeft: rightPanelRects.reduce(
          (minLeft, candidate) => Math.min(minLeft, candidate.left),
          rect.right,
        ),
        leftPanelRight: leftPanelRects.reduce(
          (maxRight, candidate) => Math.max(maxRight, candidate.right),
          0,
        ),
        viewportCenterX: window.innerWidth / 2,
        viewportCenterY: window.innerHeight / 2,
        width: rect.width,
        height: rect.height,
        contentWidth: contentRect?.width ?? 0,
        contentHeight: contentRect?.height ?? 0,
      };
    });
    expect(
      Math.abs(
        discoveryGeometry.visibleGroupCenterX -
          discoveryGeometry.viewportCenterX,
      ),
      `发现牌结果组必须居中在主牌桌可用区域内：${JSON.stringify(discoveryGeometry)}`,
    ).toBeLessThanOrEqual(24);
    expect(discoveryGeometry.discoveryCardCenterX).toBeGreaterThan(
      discoveryGeometry.leftPanelRight,
    );
    expect(discoveryGeometry.discoveryCardLeft).toBeGreaterThanOrEqual(
      discoveryGeometry.leftPanelRight - 32,
    );
    expect(discoveryGeometry.rollPanelRight).toBeLessThanOrEqual(
      discoveryGeometry.rightPanelLeft - 12,
    );
    expect(
      Math.abs(
        discoveryGeometry.panelCenterY - discoveryGeometry.viewportCenterY,
      ),
    ).toBeLessThanOrEqual(48);
    expect(discoveryGeometry.width).toBeGreaterThan(900);
    expect(discoveryGeometry.height).toBeGreaterThan(320);
    expect(discoveryGeometry.visibleGroupWidth).toBeGreaterThanOrEqual(860);
    expect(discoveryGeometry.contentHeight).toBeGreaterThan(320);
    const discoveryFrontAtlas = discoveryReveal.getByTestId(
      "betrayal-discovery-card-front-atlas",
    );
    await expect(discoveryFrontAtlas).toBeVisible();
    await expect(discoveryFrontAtlas).toHaveAttribute(
      "data-asset-src",
      /betrayal\/cards\/(event-front-atlas|item-front-atlas|omen-front-atlas)/,
    );
    await expect(discoveryFrontAtlas).toHaveAttribute(
      "data-atlas-frame-index",
      "0",
    );
    await expect(discoveryFrontAtlas).toHaveAttribute(
      "aria-label",
      /标本剥制|事件|物品|预兆/,
    );
    await expect
      .poll(async () =>
        discoveryFrontAtlas.evaluate((node) => {
          const image = node.querySelector("img");
          return (
            Boolean(image) &&
            image!.complete &&
            image!.naturalWidth > 0 &&
            image!.naturalHeight > 0
          );
        }),
      )
      .toBe(true);
    await saveScreenshot(page, STEP_13);
    await rabbitFootCard.click();
    const rabbitFootDice = page.getByTestId("betrayal-rabbit-foot-dice");
    await expect(rabbitFootDice).toBeVisible();
    await expect(rabbitFootDice).toHaveAttribute(
      "data-reroll-target-count",
      /^[1-9]\d*$/,
    );
    await expect(page.getByTestId("betrayal-rabbit-foot-die-1")).toHaveCount(0);
    const rerollTargetDie = page.getByTestId(
      "betrayal-house-dice-reroll-target-0",
    );
    await expect(rerollTargetDie).toBeVisible();
    await expect(rerollTargetDie).toHaveAttribute("role", "button");
    await expect(rerollTargetDie).toHaveAttribute(
      "data-reroll-target-shape",
      "die-face",
    );
    const rerollTargetBox = await rerollTargetDie.boundingBox();
    expect(
      Math.round(rerollTargetBox?.width ?? 0),
      "选骰命中区必须贴合骰面比例，不是旁路数字按钮",
    ).toBe(Math.round(rerollTargetBox?.height ?? 0));
    await expectRabbitFootRerollWebglHighlights(discoveryRollPanel, null);
    const rerollTargetRotateZ = Number(
      await rerollTargetDie.getAttribute("data-reroll-target-rotate-z"),
    );
    expect(
      Number.isFinite(rerollTargetRotateZ),
      "选骰框必须记录物理骰当前旋转角",
    ).toBe(true);
    await expect
      .poll(async () =>
        rerollTargetDie.evaluate(
          (node) => getComputedStyle(node as HTMLElement).transform,
        ),
      )
      .not.toBe("none");
    await expect(rabbitFootCard).toHaveAttribute("aria-pressed", "true");
    await expectInventoryCardHasSingleSymmetricOutline(rabbitFootCard);
    await expect(
      discoveryRollPanel.getByTestId("betrayal-recent-roll-total"),
    ).toContainText("总点数");
    await expect(discoveryRollPanel.getByTestId("betrayal-recent-roll-stage-surface")).toHaveCount(0);
    await expect(discoveryRollPanel.getByTestId("betrayal-recent-roll-breakdown")).toContainText("骰面合计");
    await expect(discoveryRollPanel.getByTestId("betrayal-recent-roll-breakdown")).toContainText("加值");
    await expectTutorialNextDoesNotStealRollModifierFocus(page);
    await saveScreenshot(page, STEP_14);
    await setHarnessRandomQueue(page, [0]);
    await rerollTargetDie.click();
    await expect(rerollTargetDie).toHaveAttribute(
      "data-reroll-target-selected",
      "true",
    );
    await expect(rerollTargetDie).toHaveAttribute("aria-pressed", "true");
    await expectRabbitFootRerollWebglHighlights(discoveryRollPanel, 0);
    const rollModifierConfirm = page.getByTestId("betrayal-roll-modifier-confirm");
    await expect(rollModifierConfirm).toBeVisible();
    await expect(rollModifierConfirm).toContainText("确认使用兔脚");
    await expect(rollModifierConfirm).toBeEnabled();
    await expect(rollModifierConfirm).toHaveCSS(
      "background-color",
      "rgb(214, 181, 109)",
    );
    await expect(rollModifierConfirm).toHaveCSS(
      "border-radius",
      "0px",
    );
    await saveScreenshot(page, STEP_15);
    const rerollMotionCapture = await armPhysicalDiceRerollMotionCapture(
      discoveryRollPanel,
      { dieIndex: 0, minScreenShiftPx: 32 },
    );
    try {
      const confirmBox = await rollModifierConfirm.boundingBox();
      expect(confirmBox, "确认使用兔脚按钮必须有真实可点击区域").not.toBeNull();
      await page.evaluate(
        ({ x, y }) => {
          const target = document.elementFromPoint(x, y);
          const button = target?.closest<HTMLButtonElement>(
            '[data-testid="betrayal-roll-modifier-confirm"]',
          );
          if (!button) {
            throw new Error("确认使用兔脚按钮中心没有命中真实按钮");
          }
          window.setTimeout(() => button.click(), 50);
        },
        {
          x: confirmBox!.x + confirmBox!.width / 2,
          y: confirmBox!.y + confirmBox!.height / 2,
        },
      );
      const rerollMotionEvidence =
        (await rerollMotionCapture.saveVisibleFrame(STEP_15A)) as {
          motionEvidenceType?: string;
          screenShiftPx?: number;
          screenBoundsShiftPx?: number;
          positionShift?: number;
          rotationShift?: number;
          shiftedDice?: Array<{
            index?: number;
            screenShiftPx?: number;
            positionShift?: number;
            rotationShift?: number;
          }>;
          screenshotFrame?: {
            visibleShiftPx?: number;
            positionShift?: number;
            rotationShift?: number;
            motionEvidenceType?: string;
          };
        };
      await expect(rabbitFootDice).toHaveCount(0);
      const visibleMotionAmount = Math.max(
        rerollMotionEvidence.screenShiftPx ?? 0,
        rerollMotionEvidence.screenBoundsShiftPx ?? 0,
        rerollMotionEvidence.positionShift ?? 0,
        rerollMotionEvidence.rotationShift ?? 0,
        rerollMotionEvidence.screenshotFrame?.visibleShiftPx ?? 0,
        rerollMotionEvidence.screenshotFrame?.positionShift ?? 0,
        rerollMotionEvidence.screenshotFrame?.rotationShift ?? 0,
        ...(rerollMotionEvidence.shiftedDice ?? []).map(
          (die) =>
            Math.max(
              die.screenShiftPx ?? 0,
              die.positionShift ?? 0,
              die.rotationShift ?? 0,
            ),
        ),
      );
      expect(
        rerollMotionEvidence.motionEvidenceType ??
          rerollMotionEvidence.screenshotFrame?.motionEvidenceType ??
          "",
        `兔脚重投过程图必须截到真实重掷中的位移、位置变化或旋转变化：${JSON.stringify(rerollMotionEvidence)}`,
      ).toMatch(/^(screen-shift|position-shift|rotation-shift)$/);
      expect(
        visibleMotionAmount,
        `兔脚重投过程图必须截到当前仍在运动的骰子，而不是复用稳定骰盘：${JSON.stringify(rerollMotionEvidence)}`,
      ).toBeGreaterThan(0);
    } finally {
      await rerollMotionCapture.stop();
    }
    await expect
      .poll(async () => {
        const damageAllocationPanel = page.getByTestId(
          "betrayal-damage-allocation-panel",
        );
        if (await damageAllocationPanel.isVisible().catch(() => false)) {
          return "settled";
        }
        const dicePhysicsSource = discoveryRollPanel.getByTestId(
          "betrayal-house-dice-physics-source",
        );
        if ((await dicePhysicsSource.count()) === 0) {
          return "settled";
        }
        const highlightRenderer = await dicePhysicsSource.getAttribute(
          "data-dice-highlight-renderer",
        );
        return highlightRenderer === "none"
          ? "settled"
          : `highlight:${highlightRenderer ?? "missing"}`;
      }, { timeout: 10000 })
      .toBe("settled");
    await expect
      .poll(async () => {
        const stepId = await page.locator("[data-tutorial-step]").first()
          .getAttribute("data-tutorial-step")
          .catch(() => null);
        return stepId ?? "";
      }, { timeout: 10000 })
      .toMatch(/^(rabbit-foot-result|finish)$/);
    await expect
      .poll(async () => await tutorialOverlayCard.textContent(), {
        message: "兔脚重投后必须停在重投结果或伤害分配这两个相邻真实状态之一",
        timeout: 10000,
      })
      .toMatch(/重掷完成|承受 1 点物理伤害/);
    const postRerollText = (await tutorialOverlayCard.textContent()) ?? "";
    if (postRerollText.includes("重掷完成")) {
      const rabbitFootResultPlacement = await tutorialOverlayCard.getAttribute(
        "data-tutorial-placement",
      );
      expect(
        ["center", "top"],
        `兔脚结果提示可以居中，也可以为了避让伤害分配面板自动上移：${rabbitFootResultPlacement}`,
      ).toContain(rabbitFootResultPlacement);
      await expect(tutorialOverlayCard).toContainText("重掷完成");
      await expect(tutorialOverlayCard).toContainText("伤害分配");
    } else {
      expect(postRerollText).toContain("承受 1 点物理伤害");
    }
    await expect(tutorialOverlayCard).not.toContainText("其他玩家确认");
    await expect(tutorialOverlayCard).not.toContainText("确认 1/3");
    await expect(
      discoveryReveal.getByTestId("betrayal-discovery-continue"),
    ).toHaveCount(0);
    const postRerollDamageAllocationPanel = page.getByTestId(
      "betrayal-damage-allocation-panel",
    );
    await expect(postRerollDamageAllocationPanel).toBeVisible({
      timeout: 15000,
    });
    await expect(postRerollDamageAllocationPanel).toContainText(
      "分配 1 点物理伤害",
    );
    const hasPostRerollDiceTotal = await discoveryRollPanel
      .getByTestId("betrayal-recent-roll-total")
      .isVisible()
      .catch(() => false);
    if (hasPostRerollDiceTotal) {
      const rerolledDicePhysicsSource = discoveryRollPanel.getByTestId(
        "betrayal-house-dice-physics-source",
      );
      await expect(
        rerolledDicePhysicsSource,
      ).toHaveAttribute("data-dice-physics-source", "dice-box-threejs");
      await waitForPhysicalDiceSettled(discoveryRollPanel);
      await expect(
        discoveryRollPanel.getByTestId("betrayal-recent-roll-total"),
      ).toContainText("总点数");
      await expect(
        discoveryRollPanel.getByTestId("betrayal-recent-roll-breakdown"),
      ).toContainText("骰面合计");
      await expect(
        discoveryRollPanel.getByTestId("betrayal-recent-roll-breakdown"),
      ).toContainText("加值");
      const finalDiceGeometry = await discoveryRollPanel.evaluate((node) => {
        const panel = node as HTMLElement;
        const panelRect = panel.getBoundingClientRect();
        const diceGroup = panel.querySelector(
          '[data-testid="betrayal-house-dice-3d-group"]',
        ) as HTMLElement | null;
        const canvas =
          Array.from(diceGroup?.querySelectorAll("canvas") ?? [])
            .filter(
              (candidate): candidate is HTMLCanvasElement =>
                candidate instanceof HTMLCanvasElement,
            )
            .sort((left, right) => {
              const leftRect = left.getBoundingClientRect();
              const rightRect = right.getBoundingClientRect();
              return (
                rightRect.width * rightRect.height -
                leftRect.width * leftRect.height
              );
            })[0] ?? null;
        const diceGroupRect = diceGroup?.getBoundingClientRect();
        const canvasRect = canvas?.getBoundingClientRect();
        const projectedFaceSizes = Array.from(
          panel.querySelectorAll('[data-testid^="betrayal-house-dice-readable-face-"]'),
        ).map((element) => Number((element as HTMLElement).dataset.projectedSize ?? "0"));
        return {
          panelHeight: panelRect.height,
          diceGroupHeight: diceGroupRect?.height ?? 0,
          canvasWidth: canvasRect?.width ?? 0,
          canvasHeight: canvasRect?.height ?? 0,
          maxProjectedFaceSize: Math.max(0, ...projectedFaceSizes),
        };
      });
      expect(finalDiceGeometry.diceGroupHeight).toBeGreaterThan(0);
      expect(
        finalDiceGeometry.diceGroupHeight / finalDiceGeometry.panelHeight,
        `兔脚重投完成图的骰盘不能膨胀成异常大骰：${JSON.stringify(finalDiceGeometry)}`,
      ).toBeLessThanOrEqual(0.82);
      expect(finalDiceGeometry.canvasWidth).toBeGreaterThanOrEqual(300);
      expect(finalDiceGeometry.canvasHeight).toBeGreaterThanOrEqual(210);
      expect(
        finalDiceGeometry.maxProjectedFaceSize,
        "兔脚重投完成图里的单颗骰子投影不能异常放大",
      ).toBeLessThanOrEqual(54);
    } else {
      const discoveryPanelAfterReroll = page.getByTestId(
        "betrayal-discovery-panel",
      );
      if ((await discoveryPanelAfterReroll.count()) === 0) {
        await expect(discoveryPanelAfterReroll).toHaveCount(0);
      } else {
        await expect(discoveryPanelAfterReroll).not.toContainText("总点数");
      }
    }
    await saveScreenshot(page, STEP_16);
    await expectScreenshotsVisiblyDifferent(
      STEP_15A,
      STEP_16,
      "兔脚重投过程图和完成图",
    );
    await waitForStep(page, "finish", 10000);
    await expect(tutorialOverlayCard).toContainText("承受 1 点物理伤害");
    await expect(tutorialOverlayCard).not.toContainText("兔脚");
    await expect(tutorialOverlayCard).not.toContainText("其他玩家确认");
    await expect(exploreTargetRoom).toBeVisible();
    await expect(
      page.locator('[data-testid^="betrayal-room-explore-target-"]'),
    ).toHaveCount(0);
    await expect(page.getByTestId("betrayal-discovery-panel")).toHaveCount(0);
    const damageAllocationPanel = page.getByTestId(
      "betrayal-damage-allocation-panel",
    );
    await expect(damageAllocationPanel).toBeVisible({ timeout: 15000 });
    const finalDiscoveryState = await page.evaluate(() => {
      const state = (
        window as unknown as {
          __BG_TEST_HARNESS__?: {
            state?: {
              get?: () => {
                core?: {
                  latestDiscovery?: { title?: string; kind?: string } | null;
                  pendingEventRollResolution?: unknown | null;
                  currentExplorer?: { roomId?: string };
                  rooms?: Array<{ id: string; name?: string; state?: string }>;
                };
              };
            };
          };
        }
      ).__BG_TEST_HARNESS__?.state?.get?.();
      const currentRoomId = state?.core?.currentExplorer?.roomId ?? null;
      const currentRoom = state?.core?.rooms?.find((room) => room.id === currentRoomId) ?? null;
      return {
        latestDiscoveryTitle: state?.core?.latestDiscovery?.title ?? null,
        latestDiscoveryKind: state?.core?.latestDiscovery?.kind ?? null,
        hasPendingEventRollResolution: Boolean(state?.core?.pendingEventRollResolution),
        currentRoomName: currentRoom?.name ?? null,
      };
    });
    expect(finalDiscoveryState).toMatchObject({
      latestDiscoveryTitle: "标本剥制",
      latestDiscoveryKind: "event",
      hasPendingEventRollResolution: false,
      currentRoomName: "厨房",
    });
    await expect(
      page.getByTestId("betrayal-damage-allocation-amount"),
    ).toContainText("分配 1 点物理伤害");
    await saveScreenshot(page, STEP_16A);
    await page.waitForTimeout(500);
    const damageTraitIncrease = page.getByTestId(
      "betrayal-damage-allocation-trait-speed-increase",
    );
    await expect(damageTraitIncrease).toBeVisible();
    await damageTraitIncrease.click();
    const damageAllocationConfirm = page.getByTestId(
      "betrayal-damage-allocation-confirm",
    );
    await expect(damageAllocationConfirm).toBeEnabled();
    await expect(damageAllocationConfirm).toHaveCSS(
      "background-color",
      "rgb(214, 181, 109)",
    );
    await damageAllocationConfirm.click();
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const core = (
              window as unknown as {
                __BG_TEST_HARNESS__?: { state?: { get?: () => { core?: { pendingEventRollResolution?: unknown } } } };
              }
            ).__BG_TEST_HARNESS__?.state?.get?.().core;
            return Boolean(core?.pendingEventRollResolution);
          }),
        { timeout: 10000 },
      )
      .toBe(false);
    await expect(damageAllocationPanel).toBeHidden({ timeout: 10000 });
    await waitForStep(page, "return-to-table-after-damage", 10000);
    await expect(tutorialOverlayCard).toContainText("伤害已经分配到属性轨");
    await expect(tutorialOverlayCard).toContainText("返回牌桌");
    const returnToTableAfterDamage = page.getByTestId(
      "betrayal-discovery-continue",
    );
    await expect(returnToTableAfterDamage).toBeVisible({ timeout: 10000 });
    await expect(returnToTableAfterDamage).toContainText("返回牌桌");
    await saveScreenshot(page, STEP_16B);

    await returnToTableAfterDamage.click();
    await expect(discoveryReveal).toBeHidden({ timeout: 10000 });
    await waitForStep(page, "end-turn-after-event", 10000);
    await expect(tutorialOverlayCard).toContainText("伤害分配完成后");
    await expect(tutorialOverlayCard).toContainText("结束回合");
    await expect(page.getByTestId("betrayal-action-endTurn")).toBeVisible();
    await expect(await readBetrayalOmenNamesByPlayer(page)).toMatchObject({
      "0": ["书本"],
      "1": [],
      "2": [],
    });
    await expect(await readBetrayalHauntTutorialState(page)).toMatchObject({
      currentPlayer: "0",
      currentExplorerRoomId: "ground-north",
      phase: "preHaunt",
      hauntTriggered: false,
      recommendedAction: "endTurn",
    });
    await saveScreenshot(page, MAIN_FLOW_33);

    await page.getByTestId("betrayal-action-endTurn").click();
    await waitForStep(page, "watch-teammate-one-omen-turn", 10000);
    await expect(tutorialOverlayCard).toContainText("现在不是你的回合");
    await expect(tutorialOverlayCard).toContainText("队友 1");
    await expect(tutorialOverlayCard).toContainText("翻出指环");
    await expect(tutorialOverlayCard).not.toContainText("你去操作队友");
    await expect
      .poll(() => readBetrayalOmenNamesByPlayer(page), {
        message: "默认主线中队友 1 必须通过正式探索自然获得指环",
        timeout: 30000,
      })
      .toMatchObject({
        "0": ["书本"],
        "1": ["指环"],
        "2": [],
      });
    await expect
      .poll(() => readBetrayalHauntTutorialState(page), {
        message: "队友 1 获得指环后仍应处于作祟前",
        timeout: 30000,
      })
      .toMatchObject({
        currentPlayer: "1",
        phase: "preHaunt",
        hauntTriggered: false,
        recentRollKind: "hauntRoll",
        recentRollDiceCount: 2,
      });
    await expect(discoveryReveal).toBeVisible({ timeout: 10000 });
    await expect(discoveryReveal).toContainText("指环");
    await expect(
      discoveryReveal.getByTestId("betrayal-recent-roll-panel"),
    ).toBeVisible();
    await saveScreenshot(page, MAIN_FLOW_34);

    await clickNext(page);
    await waitForStep(page, "teammate-one-omen-results", 10000);
    await expect(tutorialOverlayCard).toContainText("队友 1 获得指环");
    await expect(tutorialOverlayCard).toContainText("作祟仍未开始");
    await expect(tutorialOverlayCard).toContainText("队友 2");
    await expect
      .poll(() => readBetrayalHauntTutorialState(page), {
        message: "队友 1 公开结果后必须交给队友 2",
        timeout: 30000,
      })
      .toMatchObject({
        currentPlayer: "2",
        phase: "preHaunt",
        hauntTriggered: false,
      });
    await saveScreenshot(page, MAIN_FLOW_35);

    await clickNext(page);
    await waitForStep(page, "watch-teammate-two-omen-turn", 10000);
    await expect(tutorialOverlayCard).toContainText("队友 2");
    await expect(tutorialOverlayCard).toContainText("翻出狗");
    await expect
      .poll(() => readBetrayalOmenNamesByPlayer(page), {
        message: "默认主线中队友 2 必须通过正式探索自然获得狗",
        timeout: 30000,
      })
      .toMatchObject({
        "0": ["书本"],
        "1": ["指环"],
        "2": ["狗"],
      });
    await expect
      .poll(() => readBetrayalHauntTutorialState(page), {
        message: "队友 2 翻出狗后仍应处于作祟前",
        timeout: 30000,
      })
      .toMatchObject({
        currentPlayer: "2",
        phase: "preHaunt",
        hauntTriggered: false,
        recentRollKind: "hauntRoll",
        recentRollDiceCount: 3,
      });
    await expect(discoveryReveal).toBeVisible({ timeout: 10000 });
    await expect(discoveryReveal).toContainText("狗");
    await saveScreenshot(page, MAIN_FLOW_36);

    await clickNext(page);
    await waitForStep(page, "teammate-two-omen-results", 10000);
    await expect(tutorialOverlayCard).toContainText("狗确认后");
    await expect(tutorialOverlayCard).toContainText("回合回到你");
    await expect(tutorialOverlayCard).toContainText("移动到上层");
    await expect
      .poll(() => readBetrayalHauntTutorialState(page), {
        message: "狗确认后必须回到当前玩家，不能进入代操作队友流程",
        timeout: 30000,
      })
      .toMatchObject({
        currentPlayer: "0",
        phase: "preHaunt",
        hauntTriggered: false,
      });
    await saveScreenshot(page, MAIN_FLOW_37);

    await clickNext(page);
    await waitForStep(page, "move-to-grand-staircase", 10000);
    await expect(tutorialOverlayCard).toContainText("沿厨房、门厅");
    await expect(tutorialOverlayCard).toContainText("大阶梯");
    await expect(page.getByTestId("betrayal-action-move")).toBeVisible();
    await page.getByTestId("betrayal-action-move").click();
    for (const roomId of ["hallway", "grand-staircase"]) {
      const room = page.getByTestId(`betrayal-room-${roomId}`);
      await expect(room).toBeVisible({ timeout: 10000 });
      await expect(room).toBeEnabled();
      await room.click();
      await expect(
        page.getByTestId(`betrayal-room-occupant-${roomId}-0`),
      ).toBeVisible({ timeout: 10000 });
      await expect(
        page.getByTestId("betrayal-visual-transition-blocker"),
      ).toHaveCount(0, { timeout: 10000 });
    }
    await waitForStep(page, "switch-to-upper-floor", 10000);
    await expect(tutorialOverlayCard).toContainText("点上箭头");
    await expect(tutorialOverlayCard).toContainText("上层平台");
    await expect(page.getByTestId("betrayal-room-floor-ground")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId("betrayal-room-floor-up")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId("betrayal-room-floor-up")).toBeEnabled();
    await saveScreenshot(page, MAIN_FLOW_38);

    await page.getByTestId("betrayal-room-floor-up").click();
    await waitForStep(page, "move-to-upper-landing", 10000);
    await expect(tutorialOverlayCard).toContainText("上层平台已经在画面里");
    await expect(page.getByTestId("betrayal-room-floor-upper")).toBeVisible({
      timeout: 10000,
    });
    const upperLandingRoom = page.getByTestId("betrayal-room-upper-landing");
    await expect(upperLandingRoom).toBeVisible({ timeout: 10000 });
    await expect(upperLandingRoom).toBeEnabled();
    await expect(page.getByTestId("tutorial-highlight-ring")).toHaveAttribute(
      "data-tutorial-highlight-target",
      "betrayal-room-upper-landing",
    );
    await saveScreenshot(page, MAIN_FLOW_39);

    await upperLandingRoom.click();
    await expect(
      page.getByTestId("betrayal-room-occupant-upper-landing-0"),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByTestId("betrayal-visual-transition-blocker"),
    ).toHaveCount(0, { timeout: 10000 });
    await waitForStep(page, "end-turn-from-upper-landing", 10000);
    await expect(await readBetrayalHauntTutorialState(page)).toMatchObject({
      currentPlayer: "0",
      currentExplorerRoomId: "upper-landing",
      activeRoomId: "upper-landing",
      phase: "preHaunt",
      hauntTriggered: false,
    });
    await saveScreenshot(page, MAIN_FLOW_40);

    await expect(tutorialOverlayCard).toContainText("你现在在上层平台");
    await expect(tutorialOverlayCard).toContainText("这次先不继续探索");
    await expect(tutorialOverlayCard).toContainText("结束回合");
    const libraryRoom = page.getByTestId("betrayal-room-upper-west");
    await expect(libraryRoom).toBeVisible({ timeout: 10000 });
    await expect(libraryRoom).toContainText("图书馆");
    await expect(libraryRoom).toBeDisabled();
    await expect(page.getByTestId("tutorial-highlight-ring")).toHaveAttribute(
      "data-tutorial-highlight-target",
      "betrayal-action-endTurn",
    );
    await expect(page.getByTestId("betrayal-action-endTurn")).toBeVisible();
    await expect(page.getByTestId("betrayal-action-endTurn")).toBeEnabled();
    await expect
      .poll(() => readBetrayalOmenNamesByPlayer(page), {
        message: "上层平台结束回合前不能凭空获得圣符，默认主线只保留已自然获得的预兆",
        timeout: 10000,
      })
      .toMatchObject({
        "0": ["书本"],
        "1": ["指环"],
        "2": ["狗"],
      });
    await expect
      .poll(() => readBetrayalHauntTutorialState(page), {
        message: "当前玩家必须通过真实移动停在上层平台，等待结束回合",
        timeout: 10000,
      })
      .toMatchObject({
        currentPlayer: "0",
        currentExplorerRoomId: "upper-landing",
        activeRoomId: "upper-landing",
        phase: "preHaunt",
        hauntTriggered: false,
        recentRollKind: null,
      });
    await saveScreenshot(page, MAIN_FLOW_41);
    await page.getByTestId("betrayal-action-endTurn").click();
    await waitForStep(page, "watch-teammate-haunt-trigger", 10000);
    await expect(tutorialOverlayCard).toContainText("队友 1");
    await expect(tutorialOverlayCard).toContainText("面具");
    await expect(tutorialOverlayCard).toContainText("作祟自然开始");
    await expect
      .poll(() => readBetrayalOmenNamesByPlayer(page), {
        message: "队友 1 必须通过正式探索自然翻出面具",
        timeout: 30000,
      })
      .toMatchObject({
        "0": ["书本"],
        "1": ["指环", "面具"],
        "2": ["狗"],
      });
    await expect
      .poll(() => readBetrayalHauntTutorialState(page), {
        message: "队友 1 翻出面具后必须自然触发木乃伊作祟",
        timeout: 30000,
      })
      .toMatchObject({
        currentPlayer: "2",
        phase: "haunt",
        hauntTriggered: true,
        hauntScenarioCardId: "mummy-rampage",
        hauntRevealerPlayerId: "1",
        traitorPlayerId: "1",
        recentRollKind: "hauntRoll",
        recentRollDiceCount: 4,
      });
    await expect(discoveryReveal).toBeVisible({ timeout: 10000 });
    await expect(discoveryReveal).toContainText("面具");
    await expect(
      discoveryReveal.getByTestId("betrayal-house-dice-3d-group"),
    ).toHaveAttribute("data-dice-count", "4");
    await expect(page.getByTestId("betrayal-scenario-reader-dialog")).toHaveCount(
      0,
    );
    await saveScreenshot(page, MAIN_FLOW_42);

    await clickNext(page);
    await waitForStep(page, "haunt-hero-reader", 30000);
    await expect(await readBetrayalHauntTutorialState(page)).toMatchObject({
      currentPlayer: "2",
      phase: "haunt",
      hauntTriggered: true,
      hauntScenarioCardId: "mummy-rampage",
      hauntRevealerPlayerId: "1",
      traitorPlayerId: "1",
      recentRollKind: "hauntRoll",
      recentRollDiceCount: 4,
    });
    const scenarioReader = page.getByTestId("betrayal-scenario-reader-dialog");
    await expect(scenarioReader).toBeVisible({ timeout: 10000 });
    const scenarioReaderPage = page.getByTestId(
      "betrayal-scenario-objective-page",
    );
    await expect(scenarioReaderPage).toHaveAttribute(
      "data-scenario-reader-scope",
      "heroes",
    );
    await expect(page.getByTestId("betrayal-scenario-opening-stage")).toBeVisible();
    await expect(page.getByTestId("betrayal-scenario-book")).toHaveCount(0);
    await expect(
      page.getByTestId("betrayal-scenario-opening-cinematic"),
    ).toContainText("英雄开场过场");
    await expect(
      page.getByTestId("betrayal-scenario-opening-cinematic"),
    ).not.toContainText("叛徒开场过场");
    await expect(
      page.getByTestId("betrayal-scenario-reader-header-progress"),
    ).toContainText("1/2");
    await expect(page.getByTestId("betrayal-scenario-reader-next-zone")).toBeVisible();
    await expect(page.getByTestId("betrayal-scenario-reader-next-zone")).toBeEnabled();
    await expect(page.getByTestId("betrayal-scenario-reader-next-zone")).toContainText("进入剧本书");
    await expect(tutorialOverlayCard).toContainText("英雄开场过场");
    await expectTutorialCardInForeground(page, "英雄开场过场");
    await saveScreenshot(page, MAIN_FLOW_43);

    await clickNext(page);
    await waitForStep(page, "haunt-hero-reader-turn-page", 10000);
    await expect(tutorialOverlayCard).toContainText("开场过场读完后");
    await expect(tutorialOverlayCard).toContainText("进入剧本书");
    await expect(tutorialOverlayCard).toContainText("英雄剧本书目标页");
    await expect(
      page.getByTestId("betrayal-scenario-reader-header-progress"),
    ).toContainText("1/2");
    await expect(page.getByTestId("betrayal-scenario-reader-next-zone")).toBeVisible();
    await expect(page.getByTestId("betrayal-scenario-reader-next-zone")).toBeEnabled();
    await expectTutorialCardInForeground(page, "英雄剧本书目标页");
    await saveScreenshot(page, MAIN_FLOW_44);

    await page.getByTestId("betrayal-scenario-reader-next-zone").click();
    await waitForStep(page, "haunt-hero-reader-goal", 10000);
    await expect(scenarioReader).toContainText("英雄剧本书", { timeout: 10000 });
    await expect(scenarioReader).toContainText("真名");
    await expect(scenarioReader).toContainText("驱逐法术");
    await expect(scenarioReader).toContainText("驱逐木乃伊");
    await expect(scenarioReader).toContainText("石棺");
    await expect(scenarioReader).toContainText("研究室");
    await expect(scenarioReader).toContainText("图书馆");
    await expect(scenarioReader).toContainText("研究木乃伊的历史");
    await expect(scenarioReader).not.toContainText("叛徒目标");
    await expect(
      page.getByTestId("betrayal-scenario-reader-header-progress"),
    ).toContainText("2/2");
    await expect(
      page.getByTestId("betrayal-scenario-book-turning-sheet"),
    ).toHaveCount(0);
    await expect(page.getByTestId("tutorial-highlight-ring")).toHaveAttribute(
      "data-tutorial-highlight-target",
      "betrayal-scenario-book-section-special",
    );
    await expectTutorialCardInForeground(page, "英雄剧本书目标页写明");
    await expectTutorialCardDoesNotCoverTargets(
      page,
      ["betrayal-scenario-book-section-special"],
      "默认主线英雄剧本书目标页与图书馆原因",
    );
    await saveScreenshot(page, MAIN_FLOW_45);

    await clickNext(page);
    await waitForStep(page, "haunt-hero-reader-close", 10000);
    await expect(tutorialOverlayCard).toContainText("点关闭回到牌桌");
    await expect(page.getByTestId("betrayal-scenario-reader-close")).toBeVisible();
    await expectTutorialCardInForeground(page, "点关闭回到牌桌");
    await saveScreenshot(page, MAIN_FLOW_46);

    await page.getByTestId("betrayal-scenario-reader-close").click();
    await expect(scenarioReader).toBeHidden();
    await waitForStep(page, "wait-for-hero-turn-after-haunt", 10000);
    await expect(page.getByTestId("betrayal-runtime-header-grid")).toContainText(
      /作祟中|恶兆后|Haunt/i,
    );
    await expect(tutorialOverlayCard).toContainText("作祟后轮序继续");
    await expect(tutorialOverlayCard).toContainText("队友 2 按正式流程结束回合");
    await expect(tutorialOverlayCard).toContainText("你仍在上层平台");
    await expect(tutorialOverlayCard).toContainText("图书馆可用于");
    await expect
      .poll(() => readBetrayalHauntTutorialState(page), {
        message: "作祟读本关闭后必须等队友 2 按正式结束回合交回当前英雄",
        timeout: 30000,
      })
      .toMatchObject({
        currentPlayer: "0",
        currentExplorerRoomId: "upper-landing",
        phase: "haunt",
        hauntTriggered: true,
        mummyKnowledgeTokenCount: 0,
        mummyTrueNameFound: false,
      });
    await expect(page.getByTestId("betrayal-scenario-reader-dialog")).toBeHidden();
    await saveScreenshot(page, MAIN_FLOW_47);

    await clickNext(page);
    await waitForStep(page, "open-library-move-after-goal", 10000);
    await expect(tutorialOverlayCard).toContainText("已经读到英雄目标");
    await expect(tutorialOverlayCard).toContainText("先点“移动”");
    await expect(tutorialOverlayCard).toContainText("从上层平台可前往的房间");
    await expect(page.getByTestId("betrayal-action-move")).toBeVisible();
    await expect(page.getByTestId("betrayal-action-move")).toBeEnabled();
    await expect(page.getByTestId("tutorial-highlight-ring")).toHaveAttribute(
      "data-tutorial-highlight-target",
      "betrayal-action-move",
    );
    await expectTutorialCardInForeground(page, "先点“移动”");
    await saveScreenshot(page, MAIN_FLOW_48);

    await page.getByTestId("betrayal-action-move").click();
    await waitForStep(page, "move-to-library-after-goal", 10000);
    await expect(tutorialOverlayCard).toContainText("图书馆现在是相邻移动目标");
    await expect(tutorialOverlayCard).toContainText("点击图书馆移动进去");
    await expect(tutorialOverlayCard).toContainText("进去后才能执行");
    const postGoalLibraryRoom = page.getByTestId("betrayal-room-upper-west");
    await expect(postGoalLibraryRoom).toBeVisible({ timeout: 10000 });
    await expect(postGoalLibraryRoom).toBeEnabled();
    await expect(postGoalLibraryRoom).toContainText("图书馆");
    await expect(page.getByTestId("tutorial-highlight-ring")).toHaveAttribute(
      "data-tutorial-highlight-target",
      "betrayal-room-upper-west",
    );
    await expectTutorialCardInForeground(page, "图书馆现在是相邻移动目标");
    await saveScreenshot(page, MAIN_FLOW_49);

    await postGoalLibraryRoom.click();
    await expect(
      page.getByTestId("betrayal-room-occupant-upper-west-0"),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByTestId("betrayal-visual-transition-blocker"),
    ).toHaveCount(0, { timeout: 10000 });
    await waitForStep(page, "hero-study-name-roll", 10000);
    await expect(tutorialOverlayCard).toContainText("石棺房、研究室或图书馆");
    await expect(tutorialOverlayCard).toContainText("你当前在图书馆");
    await expect(tutorialOverlayCard).toContainText("寻找木乃伊真名");
    await expect(tutorialOverlayCard).toContainText("6+ 知识检定");
    await expect(page.getByTestId("betrayal-action-use")).toBeVisible();
    await expect(page.getByTestId("betrayal-action-use")).toBeEnabled();
    await expect(page.getByTestId("betrayal-action-use")).toContainText(
        "寻找木乃伊真名",
      );
    await expectTutorialCardInForeground(page, "寻找木乃伊真名");
    await saveScreenshot(page, MAIN_FLOW_50);

    await page.getByTestId("betrayal-action-use").click();
    await waitForStep(page, "hero-study-name-result", 10000);
    const studyNameRollPanel = page.getByTestId("betrayal-recent-roll-panel");
    await expect(studyNameRollPanel).toBeVisible({ timeout: 10000 });
    await expect(studyNameRollPanel).toContainText("寻找木乃伊真名");
    await expect(studyNameRollPanel).toContainText("知识检定");
    await expect(studyNameRollPanel.getByTestId("betrayal-recent-roll-outcome"))
      .toContainText("取得第 1 枚知识标记");
    await expect(studyNameRollPanel.getByTestId("betrayal-recent-roll-total"))
      .toContainText("总点数");
    await expectVisiblePhysicalDiceBox(studyNameRollPanel);
    await waitForPhysicalDiceSettled(studyNameRollPanel);
    await expect
      .poll(() => readBetrayalHauntTutorialState(page), {
        message: "寻找真名成功后必须写入第 1 枚知识标记，而不是只显示教程提示",
        timeout: 10000,
      })
      .toMatchObject({
        currentPlayer: "0",
        phase: "haunt",
        recentRollKind: "hauntActionTraitCheck",
        recentRollDiceCount: 4,
        recentRollSourceTitle: "寻找木乃伊真名",
        recentRollLabel: "知识检定",
        recentRollLatestLabel: "取得第 1 枚知识标记",
        mummyKnowledgeTokenCount: 1,
        mummyTrueNameFound: true,
        mummyBanishmentSpellLearned: false,
        recommendedAction: "endTurn",
      });
    await expect(tutorialOverlayCard).toContainText("检定成功");
    await expect(tutorialOverlayCard).toContainText("点“确认”回到牌桌");
    const studyNameContinueButton = page.getByTestId("betrayal-roll-continue");
    await expect(studyNameContinueButton).toBeVisible();
    await expect(studyNameContinueButton).toHaveAttribute(
      "data-recent-roll-confirmed-count",
      "0",
    );
    await expect(studyNameContinueButton).toHaveAttribute(
      "data-recent-roll-required-count",
      "1",
    );
    await expectTutorialCardInForeground(page, "检定成功");
    await saveScreenshot(page, MAIN_FLOW_51);

    await studyNameContinueButton.click();
    await waitForStep(page, "hero-study-name-closeout", 10000);
    await expect(page.getByTestId("betrayal-recent-roll-panel")).toBeHidden();
    await expect(tutorialOverlayCard).toContainText("结果已经落到英雄目标进度上");
    await expect(tutorialOverlayCard).toContainText("每名英雄每回合只能尝试一个");
    await expect(tutorialOverlayCard).toContainText("结束回合");
    await expect(page.getByTestId("betrayal-action-endTurn")).toBeVisible();
    await expect(page.getByTestId("betrayal-action-endTurn")).toBeEnabled();
    await expect
      .poll(() => readBetrayalHauntTutorialState(page), {
        message: "确认找真名结果后必须关闭投骰层并回到结束回合入口",
        timeout: 10000,
      })
      .toMatchObject({
        currentPlayer: "0",
        currentExplorerRoomId: "upper-west",
        phase: "haunt",
        recentRollKind: null,
        mummyKnowledgeTokenCount: 1,
        mummyTrueNameFound: true,
        mummyBanishmentSpellLearned: false,
        recommendedAction: "endTurn",
    });
    await expectTutorialCardInForeground(page, "结果已经落到英雄目标进度上");
    await saveScreenshot(page, MAIN_FLOW_52);

    assertNoFatalFrontendErrors([
      { label: "betrayal-tutorial-main-player-path", diagnostics },
    ]);
  });

  test("手机横屏下教程真实入口应使用地图壳原生横屏布局", async ({
    page,
    context,
  }) => {
    test.setTimeout(90000);
    await initBetrayalContext(context, { skipTutorial: false });
    const diagnostics = attachPageDiagnostics(
      page,
      "betrayal-tutorial-phone-landscape",
    );

    await page.setViewportSize(MOBILE_LANDSCAPE_REFERENCE_VIEWPORT);
    await page.goto(
      "/play/betrayal/tutorial/basic-setup-and-turn?bgForceCoarsePointer=1",
      { waitUntil: "domcontentloaded" },
    );
    await waitForBetrayalPageReady(page);

    await expect(page.getByTestId("mobile-orientation-game-gate")).toHaveCount(
      0,
    );
    await expect(page.locator("html")).toHaveAttribute(
      "data-game-id",
      "betrayal",
    );
    await expect(page.locator("html")).toHaveAttribute(
      "data-preferred-orientation",
      "landscape",
    );
    await expect(page.locator("html")).toHaveAttribute(
      "data-mobile-layout-preset",
      "map-shell",
    );
    await expect(
      page.getByTestId("mobile-orientation-game-banner"),
    ).toHaveCount(0);
    await advanceToStep(page, "open-move-targets");
    await waitForStep(page, "open-move-targets");
    await expect(page.getByTestId("betrayal-board")).toBeVisible();
    await expect(
      page.getByTestId("betrayal-mobile-landscape-layout"),
    ).toBeVisible();
    await expect(
      page.getByTestId("betrayal-mobile-landscape-layout"),
    ).toHaveAttribute("data-layout-mode", "phone-landscape-native");
    await expect(page.getByTestId("betrayal-desktop-layout")).toHaveCount(0);
    await expect(page.getByTestId("betrayal-mobile-stage-status")).toHaveCount(
      0,
    );
    await expect(page.getByTestId("betrayal-mobile-traits-strip")).toHaveCount(
      0,
    );
    await expect(page.getByTestId("betrayal-mobile-context-strip")).toHaveCount(
      0,
    );
    await expect(page.getByTestId("betrayal-room-grid")).toBeVisible();
    await expect(page.getByTestId("betrayal-left-status-rail")).toBeHidden();
    await expect(page.getByTestId("betrayal-status-rail")).toBeHidden();
    await expect(page.getByTestId("betrayal-action-rail")).toHaveCount(0);
    await expect(page.getByTestId("betrayal-mobile-action-rail")).toBeVisible();
    await expect(page.getByTestId("betrayal-room-panel")).toHaveAttribute(
      "data-mobile-role",
      "primary-board-stage",
    );
    await expect(
      page.getByTestId("betrayal-inventory-section"),
    ).toHaveAttribute("data-mobile-role", "possession-rail");
    await expect(
      page.getByTestId("betrayal-mobile-action-rail"),
    ).toHaveAttribute("data-mobile-role", "native-action-rail");
    await expect(
      page.getByTestId("betrayal-inventory-omen-book"),
    ).toBeVisible();
    await expect(page.getByTestId("betrayal-mobile-dock-move")).toBeVisible();

    const mobileLayout = await page.evaluate(() => {
      const pcActionButton = document.querySelector<HTMLElement>(
        'button[data-testid^="betrayal-action-"]',
      );
      const board = document.querySelector<HTMLElement>(
        '[data-testid="betrayal-board"]',
      );
      const layout = document.querySelector<HTMLElement>(
        '[data-testid="betrayal-mobile-landscape-layout"]',
      );
      const shell = document.querySelector<HTMLElement>(".mobile-board-shell");
      const roomGrid = document.querySelector<HTMLElement>(
        '[data-testid="betrayal-room-grid"]',
      );
      const roomPanel = document.querySelector<HTMLElement>(
        '[data-testid="betrayal-room-panel"]',
      );
      const inventoryRail = document.querySelector<HTMLElement>(
        '[data-testid="betrayal-inventory-section"]',
      );
      const actionRail = document.querySelector<HTMLElement>(
        '[data-testid="betrayal-mobile-action-rail"]',
      );
      const desktopActionButtons = Array.from(
        document.querySelectorAll<HTMLElement>(
          'button[data-testid^="betrayal-action-"]',
        ),
      );
      const mobileDockButtons = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[data-testid^="betrayal-mobile-dock-"]',
        ),
      );
      const roomCanvas = document.querySelector<HTMLElement>(
        '[data-testid="betrayal-room-canvas"]',
      );
      const leftRail = document.querySelector<HTMLElement>(
        '[data-testid="betrayal-left-status-rail"]',
      );
      const statusRail = document.querySelector<HTMLElement>(
        '[data-testid="betrayal-status-rail"]',
      );
      const tutorialCard = document.querySelector<HTMLElement>(
        '[data-testid="tutorial-overlay-card"]',
      );
      const boardRect = board?.getBoundingClientRect();
      const shellRect = shell?.getBoundingClientRect();
      const roomGridRect = roomGrid?.getBoundingClientRect();
      const inventoryRailRect = inventoryRail?.getBoundingClientRect();
      const actionRailRect = actionRail?.getBoundingClientRect();
      const leftRailRect = leftRail?.getBoundingClientRect();
      const statusRailRect = statusRail?.getBoundingClientRect();
      const tutorialRect = tutorialCard?.getBoundingClientRect();
      const visibleElementCount = (elements: HTMLElement[]) =>
        elements.filter((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            Number(style.opacity || "1") > 0.01
          );
        }).length;
      const isVisible = (element: HTMLElement | null) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity || "1") > 0.01
        );
      };

      return {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        layoutMode: layout?.dataset.layoutMode ?? null,
        roomPanelRole: roomPanel?.dataset.mobileRole ?? null,
        inventoryRole: inventoryRail?.dataset.mobileRole ?? null,
        actionRole: actionRail?.dataset.mobileRole ?? null,
        shellTransform: shell ? getComputedStyle(shell).transform : null,
        shellLeft: shellRect?.left ?? null,
        shellRight: shellRect?.right ?? null,
        shellWidth: shellRect?.width ?? 0,
        shellHeight: shellRect?.height ?? 0,
        boardWidth: boardRect?.width ?? 0,
        boardHeight: boardRect?.height ?? 0,
        roomGridWidth: roomGridRect?.width ?? 0,
        roomGridHeight: roomGridRect?.height ?? 0,
        roomCanvasTransform: roomCanvas
          ? getComputedStyle(roomCanvas).transform
          : null,
        inventoryRailBottomGap: inventoryRailRect
          ? window.innerHeight - inventoryRailRect.bottom
          : null,
        inventoryRailLeft: inventoryRailRect?.left ?? null,
        actionRailBottomGap: actionRailRect
          ? window.innerHeight - actionRailRect.bottom
          : null,
        actionRailLeft: actionRailRect?.left ?? null,
        actionRailWidth: actionRailRect?.width ?? 0,
        visibleDesktopActionCount: visibleElementCount(desktopActionButtons),
        visibleMobileDockCount: visibleElementCount(mobileDockButtons),
        firstDesktopActionVisible: isVisible(pcActionButton),
        roomPanelBottomPadding: roomPanel
          ? Number.parseFloat(getComputedStyle(roomPanel).paddingBottom || "0")
          : 0,
        leftRailDisplay: leftRail ? getComputedStyle(leftRail).display : null,
        statusRailDisplay: statusRail
          ? getComputedStyle(statusRail).display
          : null,
        leftRailWidth: leftRailRect?.width ?? 0,
        statusRailWidth: statusRailRect?.width ?? 0,
        tutorialCenterOffset: tutorialRect
          ? Math.abs(
              tutorialRect.left +
                tutorialRect.width / 2 -
                window.innerWidth / 2,
            )
          : null,
      };
    });

    expect(mobileLayout.viewportWidth).toBeGreaterThan(
      mobileLayout.viewportHeight,
    );
    expect(mobileLayout.layoutMode).toBe("phone-landscape-native");
    expect(mobileLayout.roomPanelRole).toBe("primary-board-stage");
    expect(mobileLayout.inventoryRole).toBe("possession-rail");
    expect(mobileLayout.actionRole).toBe("native-action-rail");
    expect(mobileLayout.shellTransform).toBe("none");
    expect(mobileLayout.shellLeft ?? 999).toBeGreaterThanOrEqual(-1);
    expect(mobileLayout.shellRight ?? -999).toBeLessThanOrEqual(
      mobileLayout.viewportWidth + 1,
    );
    expect(mobileLayout.shellWidth).toBeGreaterThanOrEqual(
      mobileLayout.viewportWidth - 2,
    );
    expect(mobileLayout.shellHeight).toBeGreaterThanOrEqual(
      mobileLayout.viewportHeight - 2,
    );
    expect(mobileLayout.boardWidth).toBeGreaterThanOrEqual(
      mobileLayout.viewportWidth - 2,
    );
    expect(mobileLayout.boardHeight).toBeGreaterThanOrEqual(
      mobileLayout.viewportHeight - 2,
    );
    expect(mobileLayout.roomGridWidth).toBeGreaterThan(
      mobileLayout.viewportWidth * 0.75,
    );
    expect(mobileLayout.roomGridHeight).toBeGreaterThan(300);
    expect(mobileLayout.roomPanelBottomPadding).toBe(0);
    expect(mobileLayout.inventoryRailBottomGap).not.toBeNull();
    expect(mobileLayout.inventoryRailBottomGap ?? 999).toBeLessThanOrEqual(64);
    expect(mobileLayout.inventoryRailLeft ?? 999).toBeLessThanOrEqual(12);
    expect(mobileLayout.actionRailBottomGap ?? 999).toBeLessThanOrEqual(4);
    expect(mobileLayout.actionRailLeft ?? 999).toBeGreaterThanOrEqual(-1);
    expect(mobileLayout.actionRailWidth).toBeGreaterThanOrEqual(
      mobileLayout.viewportWidth - 16,
    );
    expect(mobileLayout.visibleDesktopActionCount).toBe(0);
    expect(mobileLayout.visibleMobileDockCount).toBeGreaterThan(0);
    expect(mobileLayout.firstDesktopActionVisible).toBe(false);
    expect(mobileLayout.roomCanvasTransform).not.toBe("none");
    expect(mobileLayout.leftRailDisplay).toBe("none");
    expect(mobileLayout.statusRailDisplay).toBe("none");
    expect(mobileLayout.tutorialCenterOffset).not.toBeNull();
    expect(mobileLayout.tutorialCenterOffset ?? 999).toBeLessThanOrEqual(96);

    await saveScreenshot(page, MOBILE_STEP_01);
    assertNoFatalFrontendErrors([
      { label: "betrayal-tutorial-phone-landscape", diagnostics },
    ]);
  });

  test("PC 教程布局不应被手机横屏分支改写", async ({ page, context }) => {
    test.setTimeout(90000);
    await initBetrayalContext(context, { skipTutorial: false });
    const diagnostics = attachPageDiagnostics(
      page,
      "betrayal-tutorial-pc-layout-regression",
    );

    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto("/play/betrayal/tutorial/basic-setup-and-turn", {
      waitUntil: "domcontentloaded",
    });
    await waitForBetrayalPageReady(page);

    await advanceToStep(page, "open-move-targets");
    await waitForStep(page, "open-move-targets");
    await expect(page.getByTestId("betrayal-board")).toBeVisible();
    await expect(page.getByTestId("betrayal-desktop-layout")).toBeVisible();
    await expect(page.getByTestId("betrayal-desktop-layout")).toHaveAttribute(
      "data-layout-mode",
      "desktop-board",
    );
    await expect(
      page.getByTestId("betrayal-mobile-landscape-layout"),
    ).toHaveCount(0);
    await expect(page.getByTestId("betrayal-mobile-stage-status")).toHaveCount(
      0,
    );
    await expect(page.getByTestId("betrayal-mobile-context-strip")).toHaveCount(
      0,
    );
    await expect(page.getByTestId("betrayal-mobile-traits-strip")).toHaveCount(
      0,
    );
    await expect(page.getByTestId("betrayal-left-status-rail")).toBeVisible();
    await expect(page.getByTestId("betrayal-status-rail")).toBeVisible();
    await expect(page.getByTestId("betrayal-room-panel")).not.toHaveAttribute(
      "data-mobile-role",
      /primary-board-stage/,
    );
    await expect(
      page.getByTestId("betrayal-inventory-section"),
    ).not.toHaveAttribute("data-mobile-role", /possession-rail/);

    const pcLayout = await page.evaluate(() => {
      const rect = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) return null;
        const box = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return {
          display: style.display,
          left: Math.round(box.left),
          width: Math.round(box.width),
          height: Math.round(box.height),
        };
      };

      const roomCanvas = document.querySelector<HTMLElement>(
        '[data-testid="betrayal-room-canvas"]',
      );
      const roomCanvasScale = (() => {
        if (!roomCanvas) return null;
        const transform = window.getComputedStyle(roomCanvas).transform;
        if (!transform || transform === "none") return { scaleX: 1, scaleY: 1 };
        const match = transform.match(/^matrix\(([^)]+)\)$/);
        if (!match) return null;
        const parts = match[1].split(",").map((part) => Number(part.trim()));
        return { scaleX: parts[0], scaleY: parts[3] };
      })();

      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        leftRail: rect('[data-testid="betrayal-left-status-rail"]'),
        rightRail: rect('[data-testid="betrayal-status-rail"]'),
        phaseChip: rect('[data-testid="betrayal-phase-chip"]'),
        inventory: rect('[data-testid="betrayal-inventory-section"]'),
        mobileActionRail: rect('[data-testid="betrayal-mobile-action-rail"]'),
        mobileStage: rect('[data-testid="betrayal-mobile-stage-status"]'),
        roomCanvasScale,
      };
    });

    expect(pcLayout.viewport).toEqual({ width: 1600, height: 900 });
    expect(pcLayout.leftRail?.display).toBe("grid");
    expect(pcLayout.rightRail?.display).toBe("flex");
    expect(pcLayout.phaseChip?.display).toBe("flex");
    expect(pcLayout.phaseChip).not.toBeNull();
    if (pcLayout.phaseChip) {
      const phaseChipCenter =
        pcLayout.phaseChip.left + pcLayout.phaseChip.width / 2;
      expect(
        Math.abs(phaseChipCenter - pcLayout.viewport.width / 2),
      ).toBeLessThanOrEqual(2);
    }
    expect(pcLayout.leftRail?.width).toBeGreaterThan(250);
    expect(pcLayout.rightRail?.width).toBeGreaterThan(190);
    expect(pcLayout.inventory?.left).toBeLessThanOrEqual(12);
    expect(pcLayout.inventory?.width).toBeGreaterThan(330);
    expect(pcLayout.roomCanvasScale?.scaleX).toBeCloseTo(1, 3);
    expect(pcLayout.roomCanvasScale?.scaleY).toBeCloseTo(1, 3);
    expect(
      pcLayout.mobileActionRail === null ||
        (pcLayout.mobileActionRail.width === 0 &&
          pcLayout.mobileActionRail.height === 0),
    ).toBe(true);
    expect(pcLayout.mobileStage).toBeNull();

    await saveScreenshot(page, PC_REGRESSION_STEP_USE_BOOK);

    await page.getByTestId("betrayal-action-move").click();
    await waitForStep(page, "move-to-hallway");
    await expect(page.getByTestId("betrayal-room-hallway")).toBeVisible();
    await saveScreenshot(page, PC_REGRESSION_STEP_BOARD);

    assertNoFatalFrontendErrors([
      { label: "betrayal-tutorial-pc-layout-regression", diagnostics },
    ]);
  });

  test("[mummy-traitor-path] 叛徒教程会打开叛徒剧本并完成木乃伊行动", async ({
    page,
    context,
  }) => {
    test.setTimeout(120000);
    await initBetrayalContext(context, { skipTutorial: false });
    const diagnostics = attachPageDiagnostics(
      page,
      "betrayal-tutorial-traitor-path",
    );

    await page.setViewportSize({ width: 1600, height: 900 });
    await warmBetrayalFrontend(context);
    await page.goto("/play/betrayal/tutorial/traitor-path", {
      waitUntil: "domcontentloaded",
    });

    await waitForBetrayalPageReady(page);
    await waitForHauntRuntime(page, 30000);
    await waitForStep(page, "traitor-objective", 30000);
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "女孩、圣符或指环、石棺",
    );
    await expect(page.getByTestId("tutorial-overlay-card")).not.toContainText(
      "拾起女孩",
    );
    await page.getByTestId("betrayal-open-scenario").click();
    const traitorScenarioPage = page.getByTestId(
      "betrayal-scenario-objective-page",
    );
    await expect(traitorScenarioPage).toBeVisible();
    await expect(traitorScenarioPage).toHaveAttribute(
      "data-scenario-reader-scope",
      "traitor",
    );
    await expect(traitorScenarioPage).toContainText("叛徒剧本书");
    await expect(traitorScenarioPage).toContainText("女孩");
    await expect(traitorScenarioPage).toContainText("圣符");
    await expect(traitorScenarioPage).toContainText("指环");
    await expect(traitorScenarioPage).toContainText("石棺");
    await saveScreenshot(page, STEP_TRAITOR_01);
    await page.getByTestId("betrayal-scenario-reader-close").click();
    await expect(
      page.getByTestId("betrayal-scenario-reader-dialog"),
    ).toBeHidden();

    await completeMummyMonsterActionsFromTurnStart(page, {
      turnStart: STEP_TRAITOR_02,
      movementRoll: STEP_TRAITOR_03,
      moveTarget: STEP_TRAITOR_04,
      moveResult: STEP_TRAITOR_05,
      attackForced: STEP_TRAITOR_06,
      attackTarget: STEP_TRAITOR_07,
      attackRoll: STEP_TRAITOR_08,
      reward: STEP_TRAITOR_09,
      stealResult: STEP_TRAITOR_10,
    });
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "偷窃代替伤害",
    );
    await expect(page.getByTestId("tutorial-overlay-card")).not.toContainText(
      "交出圣符",
    );

    assertNoFatalFrontendErrors([
      { label: "betrayal-tutorial-traitor-path", diagnostics },
    ]);
  });

  test("[mummy-traitor-victory-chain] 隐藏专题从合法胜利前局面完成女孩与圣符交付", async ({
    page,
    context,
  }) => {
    test.setTimeout(120000);
    await initBetrayalContext(context, { skipTutorial: false });
    const diagnostics = attachPageDiagnostics(
      page,
      "betrayal-tutorial-mummy-traitor-victory-chain",
    );

    await page.setViewportSize({ width: 1600, height: 900 });
    await warmBetrayalFrontend(context);
    await page.goto("/play/betrayal/tutorial/mummy-traitor-victory-chain", {
      waitUntil: "domcontentloaded",
    });

    await waitForBetrayalPageReady(page);
    await waitForHauntRuntime(page, 30000);
    await expect(page.locator('[data-tutorial-step="setup-traitor-turn"]')).toHaveCount(0);
    await waitForStep(page, "traitor-objective", 30000);
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "打开叛徒剧本",
    );
    await expect(page.getByTestId("tutorial-overlay-card")).not.toContainText(
      "怪物回合",
    );
    await saveScreenshot(page, STEP_TRAITOR_VICTORY_01);
    await page.getByTestId("betrayal-open-scenario").click();
    const traitorScenarioPage = page.getByTestId(
      "betrayal-scenario-objective-page",
    );
    await expect(traitorScenarioPage).toBeVisible();
    await expect(traitorScenarioPage).toHaveAttribute(
      "data-scenario-reader-scope",
      "traitor",
    );
    await expect(traitorScenarioPage).toContainText("叛徒剧本书");
    await expect(traitorScenarioPage).toContainText("女孩");
    await expect(traitorScenarioPage).toContainText("圣符");
    await expect(traitorScenarioPage).toContainText("石棺");
    await saveScreenshot(page, STEP_TRAITOR_VICTORY_02);
    await page.getByTestId("betrayal-scenario-reader-close").click();
    await expect(
      page.getByTestId("betrayal-scenario-reader-dialog"),
    ).toBeHidden();

    await waitForStep(page, "pick-up-girl");
    const traitorTarget = await resolveMummyTraitorTutorialTarget(page);
    const girlToken = page.getByTestId(traitorTarget.girlTokenTestId);
    const sarcophagusToken = page.getByTestId(
      traitorTarget.sarcophagusTokenTestId,
    );
    await expect(girlToken).toHaveAttribute("data-token-status", "placed");
    await expect(sarcophagusToken).toContainText("棺");
    await expect(
      page.getByTestId("betrayal-action-use"),
    ).toContainText(/拾起女孩|Pick Up Girl/i);
    await expect(
      page.getByTestId(`betrayal-room-${traitorTarget.roomId}`),
    ).toHaveAttribute("data-direct-target", "true");
    await expectGirlTokenMatchesExplorerBoardSize(
      page,
      `betrayal-girl-svg-token-${traitorTarget.roomId}`,
      "叛徒胜利专题拾起女孩前",
    );
    await saveScreenshot(page, STEP_TRAITOR_VICTORY_03);
    await page.getByTestId("betrayal-action-use").click();

    await waitForStep(page, "give-girl-to-mummy");
    await expect(girlToken).toHaveAttribute("data-token-status", "held-by-player");
    await expect(girlToken).toHaveAttribute(
      "data-token-owner-player-id",
      traitorTarget.traitorId,
    );
    await expect(
      page.getByTestId("betrayal-action-use"),
    ).toContainText(/交出女孩|Give Girl/i);
    await expectGirlTokenMatchesExplorerBoardSize(
      page,
      `betrayal-girl-svg-token-${traitorTarget.roomId}`,
      "叛徒持有女孩后",
    );
    await saveScreenshot(page, STEP_TRAITOR_VICTORY_04);
    await page.getByTestId("betrayal-action-use").click();

    await waitForStep(page, "give-omen-to-mummy");
    await expect(girlToken).toHaveAttribute("data-token-status", "held-by-mummy");
    await expect(
      page.getByTestId("betrayal-action-use"),
    ).toContainText(/交出圣符|Give Holy Symbol/i);
    await expect(
      page.getByTestId("betrayal-inventory-section"),
    ).toContainText("圣符");
    await expectGirlTokenMatchesExplorerBoardSize(
      page,
      `betrayal-girl-svg-token-${traitorTarget.roomId}`,
      "木乃伊持有女孩后",
    );
    await saveScreenshot(page, STEP_TRAITOR_VICTORY_05);
    await page.getByTestId("betrayal-action-use").click();

    await waitForStep(page, "traitor-finish", 30000);
    const traitorEndgameScreen = page.getByTestId("betrayal-endgame-screen");
    await expect(traitorEndgameScreen).toBeVisible({ timeout: 30000 });
    await expect(traitorEndgameScreen).toContainText("木乃伊");
    await expect(traitorEndgameScreen).toContainText("小女孩");
    await expect(
      traitorEndgameScreen.getByTestId("betrayal-endgame-ending-narration"),
    ).toContainText("木乃伊怀中的小女孩");
    await saveScreenshot(page, STEP_TRAITOR_VICTORY_06);

    await expect
      .poll(() =>
        page.evaluate(() => {
          const state = (
            window as unknown as {
              __BG_TEST_HARNESS__?: {
                state?: {
                  get?: () => {
                    core?: {
                      phase?: string;
                      endgameResult?: { outcome?: string } | null;
                      currentExplorer?: {
                        inventory?: Array<{ id: string }>;
                      };
                      scenarioRuntime?: {
                        mummy?: {
                          girlHeldByMummy?: boolean;
                          mummyCarriedOmenIds?: string[];
                        };
                      };
                    };
                  };
                };
              };
            }
          ).__BG_TEST_HARNESS__?.state?.get?.();
          const core = state?.core;
          return {
            phase: core?.phase,
            outcome: core?.endgameResult?.outcome,
            girlHeldByMummy: core?.scenarioRuntime?.mummy?.girlHeldByMummy,
            mummyCarriedOmenIds:
              core?.scenarioRuntime?.mummy?.mummyCarriedOmenIds ?? [],
            currentInventory:
              core?.currentExplorer?.inventory?.map((card) => card.id) ?? [],
          };
        }),
      )
      .toMatchObject({
        phase: "endgame",
        outcome: "traitor",
        girlHeldByMummy: true,
        mummyCarriedOmenIds: expect.arrayContaining(["holy-symbol"]),
        currentInventory: expect.not.arrayContaining(["holy-symbol"]),
      });

    assertNoFatalFrontendErrors([
      { label: "betrayal-tutorial-mummy-traitor-victory-chain", diagnostics },
    ]);
  });

  test("[mummy-monster-actions] 教程会完成木乃伊怪物移动、同房攻击和偷取奖励", async ({
    page,
    context,
  }) => {
    test.setTimeout(120000);
    await initBetrayalContext(context, { skipTutorial: false });
    const diagnostics = attachPageDiagnostics(
      page,
      "betrayal-tutorial-mummy-monster-actions",
    );

    await page.setViewportSize({ width: 1600, height: 900 });
    await warmBetrayalFrontend(context);
    await page.goto("/play/betrayal/tutorial/mummy-monster-actions", {
      waitUntil: "domcontentloaded",
    });

    await waitForBetrayalPageReady(page);
    await waitForHauntRuntime(page, 30000);
    await waitForStep(page, "setup-mummy-monster-move");
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "怪物回合",
    );
    await clickNext(page);

    await completeMummyMonsterActionsFromTurnStart(page, {
      turnStart: STEP_49,
      movementRoll: STEP_50,
      moveTarget: STEP_51,
      moveResult: STEP_52,
      attackForced: STEP_53,
      attackTarget: STEP_54,
      attackRoll: STEP_55,
      reward: STEP_56,
      stealResult: STEP_57,
    });

    assertNoFatalFrontendErrors([
      { label: "betrayal-tutorial-mummy-monster-actions", diagnostics },
    ]);
  });

  test.skip("英雄攻击教程会打开剧本并进入真实攻击骰盘", async ({
    page,
    context,
  }) => {
    test.setTimeout(120000);
    await initBetrayalContext(context, { skipTutorial: false });
    const diagnostics = attachPageDiagnostics(
      page,
      "betrayal-tutorial-hero-attack-path",
    );

    await page.setViewportSize({ width: 1600, height: 900 });
    await warmBetrayalFrontend(context);
    await page.goto("/play/betrayal/tutorial/hero-attack-path", {
      waitUntil: "domcontentloaded",
    });

    await waitForBetrayalPageReady(page);
    await waitForHauntRuntime(page, 30000);

    await waitForStep(page, "hero-attack-objective");
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "打开剧本",
    );
    await page.getByTestId("betrayal-open-scenario").click();
    const heroAttackScenarioPage = page.getByTestId(
      "betrayal-scenario-objective-page",
    );
    await expect(heroAttackScenarioPage).toBeVisible();
    await expect(heroAttackScenarioPage).toContainText("英雄手册");
    await expect(heroAttackScenarioPage).toContainText("攻击叛徒");
    await page.getByTestId("betrayal-scenario-reader-close").click();
    await expect(
      page.getByTestId("betrayal-scenario-reader-dialog"),
    ).toBeHidden();

    await waitForStep(page, "attack-traitor");
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "攻击叛徒",
    );
    await expect(
      page.getByTestId("betrayal-action-use"),
    ).toContainText(/攻击|Attack/i);
    const attackTraitorTargetInfo = await resolveCurrentRoomExplorerTarget(
      page,
      "attack-traitor",
    );
    await page.getByTestId("betrayal-action-use").click();
    await expect(
      page.getByTestId("betrayal-action-use"),
    ).toHaveAttribute("data-haunt-targeting-status", "true");
    const attackTraitorTarget = page.getByTestId(
      `betrayal-room-occupant-${attackTraitorTargetInfo.roomId}-${attackTraitorTargetInfo.playerId}`,
    );
    const attackTraitorTargetOutline = page.getByTestId(
      `betrayal-room-occupant-target-outline-${attackTraitorTargetInfo.roomId}-${attackTraitorTargetInfo.playerId}`,
    );
    await expect(
      attackTraitorTarget,
      "英雄攻击教程主路径必须点击地图上的叛徒 token 本体",
    ).toBeVisible();
    await expect(
      attackTraitorTarget,
      "教程叛徒 token 必须标记为直选目标",
    ).toHaveAttribute("data-direct-target", "true");
    await expect(
      attackTraitorTargetOutline,
      "教程叛徒 token 必须有贴合本体的五边形高亮",
    ).toHaveAttribute("data-highlight-shape", "pentagon");
    await saveScreenshot(page, STEP_22);
    await setHarnessRandomQueue(
      page,
      [0.99, 0.99, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01],
    );
    await attackTraitorTarget.click();

    await waitForStep(page, "hero-attack-review", 30000);
    const heroAttackReview = page.getByTestId("betrayal-attack-roll-review");
    await expect(heroAttackReview).toBeVisible({ timeout: 30000 });
    const heroAttackRollPanel = heroAttackReview.getByTestId(
      "betrayal-recent-roll-panel",
    );
    await expect(heroAttackRollPanel).toBeVisible({ timeout: 30000 });
    await expect(heroAttackRollPanel).toContainText(/攻击|叛徒|杰克之灵/);
    await expect(heroAttackRollPanel).toContainText(/总点数|Total/i);
    await expect(heroAttackRollPanel).toHaveAttribute(
      "data-roll-panel-style",
      "open-table-transparent",
    );
    await expectVisiblePhysicalDiceBox(heroAttackRollPanel);
    await waitForPhysicalDiceSettled(heroAttackRollPanel);
    await saveScreenshot(page, STEP_23);

    assertNoFatalFrontendErrors([
      { label: "betrayal-tutorial-hero-attack-path", diagnostics },
    ]);
  });

  test.skip("杰克之灵教程会打开剧本并用同一攻击骰盘结算怪物攻击", async ({
    page,
    context,
  }) => {
    test.setTimeout(120000);
    await initBetrayalContext(context, { skipTutorial: false });
    const diagnostics = attachPageDiagnostics(
      page,
      "betrayal-tutorial-jack-spirit-path",
    );

    await page.setViewportSize({ width: 1600, height: 900 });
    await warmBetrayalFrontend(context);
    await page.goto("/play/betrayal/tutorial/jack-spirit-path", {
      waitUntil: "domcontentloaded",
    });

    await waitForBetrayalPageReady(page);
    await waitForHauntRuntime(page, 30000);

    await waitForStep(page, "jack-spirit-objective");
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "杰克之灵的目标",
    );
    await page.getByTestId("betrayal-open-scenario").click();
    const jackSpiritScenarioPage = page.getByTestId(
      "betrayal-scenario-objective-page",
    );
    await expect(jackSpiritScenarioPage).toBeVisible();
    await expect(jackSpiritScenarioPage).toContainText("杰克之灵");
    await expect(jackSpiritScenarioPage).toContainText(/尸体.*房间/);
    await saveScreenshot(page, STEP_26);
    await page.getByTestId("betrayal-scenario-reader-close").click();
    await expect(
      page.getByTestId("betrayal-scenario-reader-dialog"),
    ).toBeHidden();

    await waitForStep(page, "jack-spirit-attack");
    await expect(page.getByTestId("tutorial-overlay-card")).toContainText(
      "怪物攻击",
    );
    await expect(
      page.getByTestId("betrayal-action-use"),
    ).toContainText(/攻击英雄|Attack hero/i);
    const jackSpiritAttackTargetInfo = await resolveCurrentRoomExplorerTarget(
      page,
      "attack-hero",
    );
    const jackSpiritAttackTarget = page.getByTestId(
      `betrayal-room-occupant-${jackSpiritAttackTargetInfo.roomId}-${jackSpiritAttackTargetInfo.playerId}`,
    );
    const jackSpiritAttackTargetOutline = page.getByTestId(
      `betrayal-room-occupant-target-outline-${jackSpiritAttackTargetInfo.roomId}-${jackSpiritAttackTargetInfo.playerId}`,
    );
    await expect(
      page.locator('[data-haunt-target-hitbox="true"]'),
      "点怪物攻击入口前，教程不得把唯一英雄目标自动变成攻击热区",
    ).toHaveCount(0);
    await page.getByTestId("betrayal-action-use").click();
    await expect(
      page.getByTestId("betrayal-action-use"),
    ).toHaveAttribute("data-haunt-targeting-status", "true");
    await expect(
      jackSpiritAttackTarget,
      "杰克之灵教程攻击主路径必须点击地图上的英雄 token 本体",
    ).toBeVisible();
    await expect(
      jackSpiritAttackTarget,
      "教程英雄 token 必须标记为直选目标",
    ).toHaveAttribute("data-direct-target", "true");
    await expect(
      jackSpiritAttackTargetOutline,
      "教程英雄 token 必须有贴合本体的五边形高亮",
    ).toHaveAttribute("data-highlight-shape", "pentagon");
    await saveScreenshot(page, STEP_27);
    await setHarnessRandomQueue(
      page,
      [0.99, 0.99, 0.99, 0.99, 0.01, 0.01, 0.01, 0.01],
    );
    await jackSpiritAttackTarget.click();

    await waitForStep(page, "jack-spirit-review", 30000);
    const jackSpiritAttackReview = page.getByTestId(
      "betrayal-attack-roll-review",
    );
    await expect(jackSpiritAttackReview).toBeVisible({ timeout: 30000 });
    const jackSpiritRollPanel = jackSpiritAttackReview.getByTestId(
      "betrayal-recent-roll-panel",
    );
    await expect(jackSpiritRollPanel).toBeVisible();
    await expect(jackSpiritRollPanel).toContainText(/攻击|杰克之灵|英雄/);
    await expect(jackSpiritRollPanel).toHaveAttribute(
      "data-roll-panel-style",
      "open-table-transparent",
    );
    const jackSpiritDiceGroup = jackSpiritRollPanel.getByTestId(
      "betrayal-house-dice-3d-group",
    );
    await expect(jackSpiritDiceGroup).toBeVisible();
    await expect(jackSpiritDiceGroup).toHaveAttribute(
      "data-render-mode",
      "betrayal-house-dice-box-visible",
    );
    await expect(jackSpiritDiceGroup).toHaveAttribute(
      "data-dice-tray-style",
      "transparent-virtual",
    );
    await expect(jackSpiritDiceGroup).toHaveAttribute(
      "data-dice-count",
      /[1-9]/,
    );
    await expect(
      jackSpiritRollPanel.getByTestId("betrayal-recent-roll-total"),
    ).toContainText(/总点数|Total/i);
    await saveScreenshot(page, STEP_28);

    assertNoFatalFrontendErrors([
      { label: "betrayal-tutorial-jack-spirit-path", diagnostics },
    ]);
  });
});
