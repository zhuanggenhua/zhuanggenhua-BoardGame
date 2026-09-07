import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from "fs";
import { dirname } from "path";
import {
  expect,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import {
    type BetrayalCore,
    type BetrayalTraitKey,
    createBetrayalMonsterFromDefinition,
    createBetrayalMonsterEncounterCore,
} from "../../src/games/betrayal/game";
import { BETRAYAL_COMMANDS } from "../../src/games/betrayal/commands";
import type {
    BetrayalCommand,
    BetrayalCommandMap,
} from "../../src/games/betrayal/commandTypes";
import { BETRAYAL_DISCOVERY_POOLS } from "../../src/games/betrayal/scenarioConfig";
import {
  applyBetrayalCommand,
  createBetrayalScriptedRandom,
  createCorpseLootReadyCore,
  createDogTradeReadyCore,
  createDustHauntCore,
  createDustFeverishAttackReadyCore,
  createDustFeverishNaturalMonsterTurnBeforeRollCore,
  createExchangeReadyCore,
  createFirstScenarioHauntCore,
  createJackSpiritNaturalMonsterTurnBeforeRollCore,
  createJackSpiritMovementRollReadyCore,
  createJackSpiritReviveReadyCore,
  createJackSpiritPostReviveAttackReadyCore,
  createFirstScenarioReadyToLearnAboutJackCore,
  createFirstScenarioReadyToStudyExorcismCore,
  createFirstScenarioReadyToExorciseCore,
  createFirstScenarioReadyToTraitorVictoryCore,
  createHeroAttackTraitorReadyCore,
  createHolyWaterUseReadyCore,
  createMaskMoveReadyCore,
  createMedicalKitUseReadyCore,
  createSkeletonKeyMoveReadyCore,
  createStartedFirstScenarioCore,
  createTradeReadyCore,
  createMummyReadyToBanishCore,
  playMummyScenarioToSurvivorVictory,
  playMummyScenarioToTraitorVictory,
  playFirstScenarioToSurvivorVictory,
  playFirstScenarioToTraitorVictory,
} from "../../src/games/betrayal/testing/firstScenarioTestUtils";
import type { Command, MatchState } from "../../src/engine/types";
import {
  disableAudio,
  disableTutorial,
  setChineseLocale,
  waitForTestHarness,
} from "../helpers/common";
import { EVIDENCE_SCREENSHOT_QUALITY } from "../framework/evidenceScreenshots";

type BetrayalHarnessSnapshot = {
  core: BetrayalCore;
  sys?: MatchState<BetrayalCore>["sys"];
};

type BetrayalHarnessWindow = Window & {
  __E2E_TEST_MODE__?: boolean;
  __BG_TEST_HARNESS__?: {
    state?: {
      isRegistered?: () => boolean;
      get?: () => BetrayalHarnessSnapshot;
      set?: (state: BetrayalHarnessSnapshot) => Promise<void> | void;
    };
    command?: {
      isRegistered?: () => boolean;
      dispatch?: (command: Command) => Promise<void> | void;
    };
    random?: {
      setQueue?: (values: number[]) => void;
    };
  };
};

export const initBetrayalContext = async (
  context: BrowserContext,
  options?: { skipTutorial?: boolean },
) => {
  await setChineseLocale(context);
  if (options?.skipTutorial !== false) {
    await disableTutorial(context);
  }
  await disableAudio(context);
  await context.addInitScript(() => {
    (window as BetrayalHarnessWindow).__E2E_TEST_MODE__ = true;
  });
};

export const waitForBetrayalHarnessState = async (
  page: Page,
  timeout = 30000,
) => {
  await page.waitForFunction(
    () =>
      Boolean(
        (
          window as BetrayalHarnessWindow
        ).__BG_TEST_HARNESS__?.state?.isRegistered?.(),
      ),
    { timeout },
  );
};

export const waitForBetrayalHarnessCommand = async (
  page: Page,
  timeout = 30000,
) => {
  await page.waitForFunction(
    () =>
      Boolean(
        (
          window as BetrayalHarnessWindow
        ).__BG_TEST_HARNESS__?.command?.isRegistered?.(),
      ),
    { timeout },
  );
};

const readBetrayalPageDiagnostics = async (page: Page) => {
  return page
    .evaluate(() => {
      const harness = (window as BetrayalHarnessWindow).__BG_TEST_HARNESS__;
      const rescueGate = document.querySelector(
        '[data-testid="game-page-rescue-gate"]',
      );
      const viewport = document.querySelector(".game-page-viewport");
      const shell = document.querySelector(".mobile-board-shell");
      const content = document.querySelector(".mobile-board-shell__content");
      const loadingScreen = document.querySelector(
        '[data-testid="loading-screen"]',
      );
      const viteOverlay = document.querySelector("vite-error-overlay");
      const rect = (element: Element | null) => {
        if (!element) return null;
        const box = element.getBoundingClientRect();
        return `${Math.round(box.width)}x${Math.round(box.height)}`;
      };

      return {
        href: window.location.href,
        testMode: Boolean((window as BetrayalHarnessWindow).__E2E_TEST_MODE__),
        hasHarness: Boolean(harness),
        harnessStatus:
          typeof harness?.getStatus === "function" ? harness.getStatus() : null,
        hasRescueGate: Boolean(rescueGate),
        rescueText:
          rescueGate?.textContent?.replace(/\s+/g, " ").trim().slice(0, 500) ??
          null,
        viewport: rect(viewport),
        shell: rect(shell),
        content: rect(content),
        hasLoadingScreen: Boolean(loadingScreen),
        hasViteOverlay: Boolean(viteOverlay),
        bodyText:
          document.body.textContent
            ?.replace(/\s+/g, " ")
            .trim()
            .slice(0, 700) ?? "",
      };
    })
    .catch((error) => ({
      diagnosticError: error instanceof Error ? error.message : String(error),
    }));
};

export const waitForBetrayalPageReady = async (page: Page, attempts = 4) => {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await waitForTestHarness(page, 8000);
      await waitForBetrayalHarnessState(page, 8000);
      return;
    } catch (error) {
      lastError = error;
      const diagnostics = await readBetrayalPageDiagnostics(page);
      const rescueReloadButton = page.getByRole("button", {
        name: /刷新重试/i,
      });
      const rescueGate = page.getByTestId("game-page-rescue-gate");
      const rescueTitle = page.getByText("页面没有正常显示");
      const shouldReloadRescueGate =
        (await rescueGate.isVisible({ timeout: 800 }).catch(() => false)) ||
        (await rescueTitle.isVisible({ timeout: 800 }).catch(() => false));

      if (attempt === attempts - 1) {
        const detail = JSON.stringify(diagnostics, null, 2);
        throw new Error(
          `betrayal 页面未能进入 harness。最后错误：${error instanceof Error ? error.message : String(error)}\n诊断：${detail}`,
        );
      }

      if (shouldReloadRescueGate) {
        await rescueReloadButton
          .click()
          .catch(() => page.reload({ waitUntil: "domcontentloaded" }));
      } else {
        await page.reload({ waitUntil: "domcontentloaded" });
      }
      await page.waitForTimeout(1200);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("betrayal 页面未能稳定进入 harness");
};

export const warmBetrayalFrontend = async (
  context: BrowserContext,
  timeout = 45000,
) => {
  const warmupPage = await context.newPage();
  try {
    await warmupPage.goto("/play/betrayal", {
      waitUntil: "commit",
      timeout,
    });
    await warmupPage
      .waitForLoadState("domcontentloaded", { timeout: 5000 })
      .catch(() => undefined);
    await waitForBetrayalPageReady(warmupPage);
  } finally {
    await warmupPage.close();
  }
};

export const saveScreenshot = async (page: Page, path: string) => {
  mkdirSync(dirname(path), { recursive: true });
  const image = await page.screenshot({
    fullPage: false,
    ...( /\.jpe?g$/i.test(path)
      ? { type: "jpeg" as const, quality: EVIDENCE_SCREENSHOT_QUALITY }
      : { type: "png" as const }),
  });
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const tempPath = `${path}.${process.pid}.${Date.now()}.${attempt}.tmp`;
    try {
      writeFileSync(tempPath, image);
      renameSync(tempPath, path);
      return;
    } catch (error) {
      lastError = error;
      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
      }
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }
  throw lastError;
};

export type BetrayalClientRectSnapshot = {
  left: number;
  top: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

export const readLocatorClientRect = async (
  locator: Locator,
): Promise<BetrayalClientRectSnapshot> =>
  locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
    };
  });

export const expectBetrayalTransitionTargetsLocator = async (
  transition: Locator,
  target: Locator,
  label: string,
  options: {
    sourceRect?: BetrayalClientRectSnapshot;
    maxCenterDelta?: number;
  } = {},
) => {
  const maxCenterDelta = options.maxCenterDelta ?? 2;
  const [transitionGeometry, targetRect] = await Promise.all([
    transition.evaluate((element) => ({
      sourceCenterX: Number(element.getAttribute("data-transition-source-center-x")),
      sourceCenterY: Number(element.getAttribute("data-transition-source-center-y")),
      targetCenterX: Number(element.getAttribute("data-transition-target-center-x")),
      targetCenterY: Number(element.getAttribute("data-transition-target-center-y")),
      deltaX: Number(element.getAttribute("data-transition-delta-x")),
      deltaY: Number(element.getAttribute("data-transition-delta-y")),
    })),
    readLocatorClientRect(target),
  ]);
  expect(
    Number.isFinite(transitionGeometry.targetCenterX) &&
      Number.isFinite(transitionGeometry.targetCenterY),
    `${label} 动画终点必须暴露可测量坐标`,
  ).toBe(true);
  expect(
    Math.abs(transitionGeometry.targetCenterX - targetRect.centerX),
    `${label} 动画终点 X 必须贴最终 token 中心`,
  ).toBeLessThanOrEqual(maxCenterDelta);
  expect(
    Math.abs(transitionGeometry.targetCenterY - targetRect.centerY),
    `${label} 动画终点 Y 必须贴最终 token 中心`,
  ).toBeLessThanOrEqual(maxCenterDelta);

  if (options.sourceRect) {
    expect(
      Math.abs(transitionGeometry.sourceCenterX - options.sourceRect.centerX),
      `${label} 动画起点 X 必须贴移动前 token 中心`,
    ).toBeLessThanOrEqual(maxCenterDelta);
    expect(
      Math.abs(transitionGeometry.sourceCenterY - options.sourceRect.centerY),
      `${label} 动画起点 Y 必须贴移动前 token 中心`,
    ).toBeLessThanOrEqual(maxCenterDelta);
    expect(
      Math.abs(
        transitionGeometry.deltaX -
          (targetRect.centerX - options.sourceRect.centerX),
      ),
      `${label} 动画 X 位移必须等于 token 中心到 token 中心`,
    ).toBeLessThanOrEqual(maxCenterDelta);
    expect(
      Math.abs(
        transitionGeometry.deltaY -
          (targetRect.centerY - options.sourceRect.centerY),
      ),
      `${label} 动画 Y 位移必须等于 token 中心到 token 中心`,
    ).toBeLessThanOrEqual(maxCenterDelta);
  }
};

export async function readVisibleNonSrText(locator: Locator) {
  return locator.evaluate((root) => {
    const rootElement = root as HTMLElement;
    const chunks: string[] = [];
    const isHiddenForPlayer = (element: HTMLElement) => {
      for (
        let current: HTMLElement | null = element;
        current;
        current = current.parentElement
      ) {
        if (current.classList.contains("sr-only")) return true;
        if (current.hidden || current.getAttribute("aria-hidden") === "true") {
          return true;
        }
        const style = window.getComputedStyle(current);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          style.opacity === "0"
        ) {
          return true;
        }
        if (current === rootElement) break;
      }
      return false;
    };
    const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT);
    let current = walker.nextNode();
    while (current) {
      const parent = current.parentElement;
      const text = current.textContent?.replace(/\s+/g, " ").trim() ?? "";
      if (parent && text && !isHiddenForPlayer(parent)) {
        chunks.push(text);
      }
      current = walker.nextNode();
    }
    return chunks.join(" ").replace(/\s+/g, " ").trim();
  });
}

export const expectEventRollWorkbenchReadable = async (
  page: Page,
  label: string,
  options: { expectedEventFrameIndex?: string } = {},
) => {
  const discoveryPanel = page.getByTestId("betrayal-discovery-panel");
  const card = page.getByTestId("betrayal-discovery-card-front-atlas");
  const rollPanel = discoveryPanel.getByTestId("betrayal-recent-roll-panel");
  await expect(discoveryPanel, `${label}必须显示事件/投骰同屏工作台`).toBeVisible();
  await expect(card, `${label}必须显示正式事件牌正面，不得退回文字占位`).toBeVisible();
  await expect(
    page.getByTestId("betrayal-discovery-card-front-missing"),
    `${label}不得出现缺图/文字占位牌`,
  ).toHaveCount(0);
  await expect(card).toHaveAttribute(
    "data-asset-src",
    /betrayal\/cards\/event-front-atlas/,
  );
  if (options.expectedEventFrameIndex) {
    await expect(card).toHaveAttribute(
      "data-atlas-frame-index",
      options.expectedEventFrameIndex,
    );
  }
  await expect(rollPanel, `${label}必须显示同源投骰面板`).toBeVisible();

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
    const overlapArea = (
      a: ReturnType<typeof rectOf>,
      b: ReturnType<typeof rectOf>,
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
    const confirmElement =
      document.querySelector<HTMLElement>('[data-testid="betrayal-roll-modifier-confirm"]') ??
      document.querySelector<HTMLElement>('[data-testid="betrayal-discovery-continue"]');
    const confirm = confirmElement
      ? (() => {
          const rect = confirmElement.getBoundingClientRect();
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
        })()
      : null;
    const diceGroupElement = document.querySelector<HTMLElement>(
      '[data-testid="betrayal-house-dice-3d-group"]',
    );
    const outsidePromptElement = document.querySelector<HTMLElement>(
      '[data-testid="betrayal-reroll-prompt-outside-dice"]',
    );
    const rerollLayerElement = document.querySelector<HTMLElement>(
      '[data-testid="betrayal-rabbit-foot-dice"]',
    );
    const resultStageElement = document.querySelector<HTMLElement>(
      '[data-testid="betrayal-discovery-panel"] [data-testid="betrayal-recent-roll-result-stage"]',
    );
    const dicePhysicsSourceElement = document.querySelector<HTMLElement>(
      '[data-testid="betrayal-discovery-panel"] [data-testid="betrayal-house-dice-physics-source"]',
    );
    if (!resultStageElement) {
      throw new Error("missing betrayal recent roll result stage");
    }
    if (!dicePhysicsSourceElement) {
      throw new Error("missing betrayal dice physics source");
    }
    const resultStageStyle = getComputedStyle(resultStageElement);
    const dicePhysicsSourceStyle = getComputedStyle(dicePhysicsSourceElement);
    const diceGroupStyle = diceGroupElement ? getComputedStyle(diceGroupElement) : null;
    const diceBoundaryElement = document.querySelector<HTMLElement>(
      '[data-testid="betrayal-discovery-panel"] [data-testid="betrayal-house-dice-boundary-highlight"]',
    );
    const diceBoundaryStyle = diceBoundaryElement
      ? getComputedStyle(diceBoundaryElement)
      : null;
    const diceCanvases = Array.from(
      diceGroupElement?.querySelectorAll("canvas") ?? [],
    ).filter(
      (candidate): candidate is HTMLCanvasElement =>
        candidate instanceof HTMLCanvasElement,
    );
    const debugRegistry =
      (
        window as typeof window & {
          __diceBoxThreeDebug?: Record<string, () => unknown>;
        }
      ).__diceBoxThreeDebug ?? {};
    const activeCanvas =
      diceCanvases.find((canvas) => {
        const testId = canvas.dataset.testid;
        return Boolean(testId && typeof debugRegistry[testId] === "function");
      }) ??
      diceCanvases[0] ??
      null;
    const activeCanvasTestId =
      activeCanvas?.dataset.testid ?? diceGroupElement?.dataset.diceDebugKey;
    const diceDebugSnapshot = activeCanvasTestId
      ? (debugRegistry[activeCanvasTestId]?.() as
          | {
              diceHighlights?: Array<{
                dieId?: number;
                dieIndex?: number;
                variant?: string;
                scale?: number;
                opacity?: number;
              }>;
              diceHighlightShells?: Array<{
                dieId?: number;
                dieIndex?: number;
                variant?: string;
                renderer?: string;
                visible?: boolean;
                scale?: number;
                opacity?: number;
                materialType?: string;
                materialSide?: number;
                depthTest?: boolean;
                depthWrite?: boolean;
                transparent?: boolean;
                shaderOpacity?: number;
              }>;
            }
          | null
          | undefined)
      : null;
    const diceHighlights = Array.isArray(diceDebugSnapshot?.diceHighlights)
      ? diceDebugSnapshot.diceHighlights
      : [];
    const diceHighlightShells = Array.isArray(
      diceDebugSnapshot?.diceHighlightShells,
    )
      ? diceDebugSnapshot.diceHighlightShells
      : [];
    const resultBackgroundParts = resultStageStyle.backgroundColor
      .replace(/[^\d.,]/g, "")
      .split(",")
      .filter(Boolean)
      .map(Number);
    const resultBackgroundAlpha =
      resultBackgroundParts.length >= 4 ? resultBackgroundParts[3] : 1;
    const resultBorderMaxPx = Math.max(
      Number.parseFloat(resultStageStyle.borderTopWidth) || 0,
      Number.parseFloat(resultStageStyle.borderRightWidth) || 0,
      Number.parseFloat(resultStageStyle.borderBottomWidth) || 0,
      Number.parseFloat(resultStageStyle.borderLeftWidth) || 0,
    );
    const diceGroup = rectOf('[data-testid="betrayal-house-dice-3d-group"]');
    const outsidePrompt = optionalRectOf(
      '[data-testid="betrayal-reroll-prompt-outside-dice"]',
    );
    const rerollLayer = optionalRectOf('[data-testid="betrayal-rabbit-foot-dice"]');
    const rerollTargets = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-testid^="betrayal-house-dice-reroll-target-"]',
      ),
    )
      .filter((target) => target.offsetParent !== null)
      .map((target) => {
        const rect = target.getBoundingClientRect();
        const dieIndex = Number(
          target.dataset.testid?.match(/-(\d+)$/)?.[1] ?? "NaN",
        );
        const domCandidateVisual = target.querySelector<Element>(
          '[data-reroll-target-candidate-box="true"]',
        );
        const selectedBorder = target.querySelector<Element>(
          '[data-reroll-target-selected-border="true"]',
        );
        const visibleOutline = domCandidateVisual ?? selectedBorder;
        const outlineStyle = visibleOutline
          ? getComputedStyle(visibleOutline)
          : null;
        const outlineStroke =
          visibleOutline?.querySelector<Element>(
            '[data-reroll-target-outline-stroke="true"]',
          ) ?? visibleOutline;
        const outlineStrokeStyle = outlineStroke
          ? getComputedStyle(outlineStroke)
          : null;
        const parsePx = (value: string | undefined) =>
          Number.parseFloat(value ?? "0") || 0;
        const parseAlpha = (value: string | undefined) => {
          if (!value || value === "transparent") return 0;
          const parts = value
            .replace(/[^\d.,]/g, "")
            .split(",")
            .filter(Boolean)
            .map(Number);
          return parts.length >= 4 ? parts[3] : 1;
        };
        const visibleWidth = Number(target.dataset.rerollTargetVisualWidth);
        const visibleHeight = Number(target.dataset.rerollTargetVisualHeight);
        const hitWidth = Number(target.dataset.rerollTargetHitWidth);
        const hitHeight = Number(target.dataset.rerollTargetHitHeight);
        const boxSize = Number(target.dataset.rerollTargetBoxSize);
        const visibleMax = Math.max(visibleWidth, visibleHeight);
        const outlineGap = Number(target.dataset.rerollTargetOutlineGap);
        const hitBoxPadding = Math.max(
          0,
          (hitWidth - visibleWidth) / 2,
          (hitHeight - visibleHeight) / 2,
        );
        const outlineBorderMaxPx = outlineStyle
          ? Math.max(
              parsePx(outlineStyle.borderTopWidth),
              parsePx(outlineStyle.borderRightWidth),
              parsePx(outlineStyle.borderBottomWidth),
              parsePx(outlineStyle.borderLeftWidth),
            )
          : 0;
        const outlineEffect =
          outlineStyle && outlineStyle.filter !== "none"
            ? outlineStyle.filter
            : outlineStyle?.boxShadow ?? "";
        const webglHighlight =
          diceHighlights.find((highlight) => highlight.dieIndex === dieIndex) ??
          null;
        const webglShell =
          diceHighlightShells.find((shell) => shell.dieIndex === dieIndex) ??
          null;
        return {
          testId: target.dataset.testid ?? "",
          dieIndex,
          selected: target.dataset.rerollTargetSelected === "true",
          shape: target.dataset.rerollTargetShape ?? "",
          highlightRenderer: target.dataset.rerollTargetHighlightRenderer ?? "",
          visualContract: target.dataset.rerollTargetVisualContract ?? "",
          visualLayer: target.dataset.rerollTargetVisualLayer ?? "",
          outlinePaint: target.dataset.rerollTargetOutlinePaint ?? "",
          outlineRotateZ: Number(target.dataset.rerollTargetOutlineRotateZ),
          outlinePointCount: Number(target.dataset.rerollTargetOutlinePointCount),
          outlinePoints: target.dataset.rerollTargetOutlinePoints ?? "",
          targetTransform: getComputedStyle(target).transform,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          centerX: rect.left + rect.width / 2,
          centerY: rect.top + rect.height / 2,
          screenWidth: rect.width,
          screenHeight: rect.height,
          targetWidth: hitWidth,
          targetHeight: hitHeight,
          boxSize,
          visibleWidth,
          visibleHeight,
          visibleMax,
          outlineGap,
          hitBoxPadding,
          domCandidateVisualExists: Boolean(domCandidateVisual),
          selectedBorderExists: Boolean(selectedBorder),
          outlineExists: Boolean(visibleOutline),
          outlineWidth: outlineStrokeStyle
            ? parsePx(outlineStrokeStyle.strokeWidth)
            : outlineStyle
              ? parsePx(outlineStyle.outlineWidth)
              : 0,
          outlineOffset: outlineStyle ? parsePx(outlineStyle.outlineOffset) : 0,
          outlineColor:
            outlineStrokeStyle?.stroke ?? outlineStyle?.outlineColor ?? "",
          outlineBorderMaxPx,
          outlineBackgroundAlpha: parseAlpha(
            outlineStrokeStyle?.fill ?? outlineStyle?.backgroundColor,
          ),
          outlineBoxShadow: outlineEffect,
          webglHighlight,
          webglShell,
        };
      });
    let confirmHitTestId = "";
    if (confirm && confirmElement) {
      const hit = document.elementFromPoint(confirm.centerX, confirm.centerY);
      confirmHitTestId =
        hit?.closest<HTMLElement>("button")?.dataset.testid ??
        (hit as HTMLElement | null)?.dataset?.testid ??
        "";
    }
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      discoveryPanel: rectOf('[data-testid="betrayal-discovery-panel"]'),
      content: rectOf('[data-testid="betrayal-discovery-panel-content"]'),
      card: rectOf('[data-testid="betrayal-discovery-card-front-atlas"]'),
      roll: rectOf(
        '[data-testid="betrayal-discovery-panel"] [data-testid="betrayal-recent-roll-panel"]',
      ),
      diceGroup,
      diceGroupBoundaryHighlight:
        diceGroupElement?.getAttribute("data-dice-boundary-highlight") ?? "",
      diceGroupBackgroundImage: diceGroupStyle?.backgroundImage ?? "",
      diceGroupBoxShadow: diceGroupStyle?.boxShadow ?? "",
      diceBoundaryBackgroundImage: diceBoundaryStyle?.backgroundImage ?? "",
      diceBoundaryBoxShadow: diceBoundaryStyle?.boxShadow ?? "",
      outsidePrompt,
      outsidePromptText: outsidePromptElement?.innerText.trim() ?? "",
      outsidePromptInsideDiceGroup: Boolean(
        outsidePromptElement && diceGroupElement?.contains(outsidePromptElement),
      ),
      rerollLayer,
      rerollTargets,
      rerollLayerText: rerollLayerElement?.innerText.trim() ?? "",
      rerollHighlightRenderer:
        rerollLayerElement?.dataset.rerollHighlightRenderer ?? "",
      rerollVisualContract:
        rerollLayerElement?.dataset.rerollVisualContract ?? "",
      rerollDomVisualBoxCount: rerollLayerElement
        ? rerollLayerElement.querySelectorAll(
            '[data-reroll-target-candidate-underline="true"], [data-reroll-target-candidate-box="true"], [data-reroll-target-selected-border="true"]',
          ).length
        : 0,
      diceHighlightDebugKey: activeCanvasTestId ?? "",
      diceHighlightSourceRenderer:
        dicePhysicsSourceElement.dataset.diceHighlightRenderer ?? "",
      diceHighlightCanvasRenderer:
        activeCanvas?.dataset.diceHighlightRenderer ?? "",
      diceHighlightCount: diceHighlights.length,
      diceHighlightShellCount: diceHighlightShells.length,
      diceHighlightCandidateCount: diceHighlights.filter(
        (highlight) => highlight.variant === "candidate",
      ).length,
      diceHighlightSelectedCount: diceHighlights.filter(
        (highlight) => highlight.variant === "selected",
      ).length,
      result: rectOf(
        '[data-testid="betrayal-discovery-panel"] [data-testid="betrayal-recent-roll-result-stage"]',
      ),
      resultSurface:
        resultStageElement.getAttribute("data-result-surface") ?? "",
      resultBackgroundAlpha,
      resultBorderMaxPx,
      dicePhysicsSourceFilter: dicePhysicsSourceStyle.filter,
      actionRail: rectOf('[data-testid="betrayal-action-rail"]'),
      statusRail: rectOf('[data-testid="betrayal-status-rail"]'),
      confirm,
      confirmHitTestId,
      bottomContinueCount: Array.from(
        document.querySelectorAll<HTMLElement>(
          '[data-testid="betrayal-discovery-continue"][data-discovery-action-position="bottom"]',
        ),
      ).filter((element) => element.offsetParent !== null).length,
      cardRollOverlap: overlapArea(
        rectOf('[data-testid="betrayal-discovery-card-front-atlas"]'),
        rectOf('[data-testid="betrayal-discovery-panel"] [data-testid="betrayal-recent-roll-panel"]'),
      ),
    };
  });

  expect(
    metrics.discoveryPanel.left,
    `${label}特写背景遮罩必须从视口左边开始，不能只是一条中间竖条：${JSON.stringify(metrics)}`,
  ).toBeLessThanOrEqual(1);
  expect(
    metrics.discoveryPanel.top,
    `${label}特写背景遮罩必须从视口顶部开始，不能只盖局部：${JSON.stringify(metrics)}`,
  ).toBeLessThanOrEqual(1);
  expect(
    metrics.discoveryPanel.right,
    `${label}特写背景遮罩必须覆盖到视口右边，不能露出右侧 HUD：${JSON.stringify(metrics)}`,
  ).toBeGreaterThanOrEqual(metrics.viewport.width - 1);
  expect(
    metrics.discoveryPanel.bottom,
    `${label}特写背景遮罩必须覆盖到视口底部，不能露出底部 HUD：${JSON.stringify(metrics)}`,
  ).toBeGreaterThanOrEqual(metrics.viewport.height - 1);
  expect(
    metrics.card.width,
    `${label}事件牌必须保持桌面可读宽度：${JSON.stringify(metrics)}`,
  ).toBeGreaterThanOrEqual(280);
  expect(
    metrics.cardRollOverlap,
    `${label}事件牌和投骰面板不得发生几何重叠：${JSON.stringify(metrics)}`,
  ).toBe(0);
  expect(
    metrics.roll.left,
    `${label}投骰面板必须在事件牌右侧同一工作台：${JSON.stringify(metrics)}`,
  ).toBeGreaterThanOrEqual(metrics.card.right + 12);
  expect(
    Math.abs(metrics.roll.centerY - metrics.card.centerY),
    `${label}事件牌和投骰面板必须共享同一工作台中轴，避免上下散落：${JSON.stringify(metrics)}`,
  ).toBeLessThanOrEqual(24);
  expect(
    metrics.roll.height,
    `${label}投骰面板不能继续占据大半屏：${JSON.stringify(metrics)}`,
  ).toBeLessThanOrEqual(metrics.viewport.height * 0.48);
  expect(
    metrics.diceGroupBoundaryHighlight,
    `${label}骰盘必须是开放式透明承接，不能回到硬框弹窗：${JSON.stringify(metrics)}`,
  ).toBe("subtle-open-stage");
  expect(
    metrics.diceGroupBackgroundImage,
    `${label}开放骰盘容器不得绘制整体背景，否则玩家会看到暗色方框：${JSON.stringify(metrics)}`,
  ).toBe("none");
  expect(
    metrics.diceGroupBoxShadow,
    `${label}开放骰盘容器不得绘制整体阴影，否则玩家会看到暗色方框：${JSON.stringify(metrics)}`,
  ).toBe("none");
  expect(
    metrics.diceBoundaryBackgroundImage,
    `${label}开放骰盘边界层不得再画整块背景，只允许骰子本体和逐骰高亮：${JSON.stringify(metrics)}`,
  ).toBe("none");
  expect(
    metrics.diceBoundaryBoxShadow,
    `${label}开放骰盘边界层不得再画整块阴影，只允许骰子本体和逐骰高亮：${JSON.stringify(metrics)}`,
  ).toBe("none");
  expect(
    metrics.resultSurface,
    `${label}开放骰盘结果区必须是轻量信息带，不能退回封闭结果盒：${JSON.stringify(metrics)}`,
  ).toBe("open-info-band");
  expect(
    metrics.resultBorderMaxPx,
    `${label}开放骰盘结果区不得保留可见硬边框：${JSON.stringify(metrics)}`,
  ).toBeLessThanOrEqual(0);
  expect(
    metrics.resultBackgroundAlpha,
    `${label}开放骰盘结果区不得使用深色封闭背景：${JSON.stringify(metrics)}`,
  ).toBeLessThanOrEqual(0.45);
  expect(
    metrics.dicePhysicsSourceFilter,
    `${label}开放骰盘不得给整张物理骰 canvas 套阴影滤镜，否则会显示成暗色方框：${JSON.stringify(metrics)}`,
  ).toBe("none");
  if (metrics.rerollLayer) {
    expect(
      metrics.outsidePrompt,
      `${label}改骰选择态必须把“选择骰子”提示放在骰盘外部：${JSON.stringify(metrics)}`,
    ).not.toBeNull();
    expect(
      metrics.outsidePromptInsideDiceGroup,
      `${label}改骰提示不得再塞进骰盘命中层或骰子方框里：${JSON.stringify(metrics)}`,
    ).toBe(false);
    expect(
      metrics.outsidePrompt!.bottom,
      `${label}改骰提示必须位于骰盘外上方，而不是覆盖骰子：${JSON.stringify(metrics)}`,
    ).toBeLessThanOrEqual(metrics.diceGroup.top + 2);
    expect(
      metrics.outsidePromptText,
      `${label}骰盘外提示必须清楚说明当前要选择骰子：${JSON.stringify(metrics)}`,
    ).toMatch(/选择要重掷的骰子|选择骰子/);
    expect(
      metrics.rerollLayerText,
      `${label}骰盘命中层只能承接真实骰子目标，不得再显示提示正文：${JSON.stringify(metrics)}`,
    ).not.toMatch(/选择要重掷的骰子|选择骰子/);
    expect(
      metrics.rerollTargets.length,
      `${label}改骰选择态必须直接在每颗可改骰子上保留可点击热区：${JSON.stringify(metrics)}`,
    ).toBeGreaterThan(0);
    const selectedRerollTargetCount = metrics.rerollTargets.filter(
      (target) => target.selected,
    ).length;
    expect(
      metrics.rerollHighlightRenderer,
      `${label}兔脚改骰必须保留 Three.js 骰体描边作为本体外壳辅助：${JSON.stringify(metrics)}`,
    ).toBe("threejs-backside-shader-shell");
    expect(
      metrics.rerollVisualContract,
      `${label}兔脚改骰必须使用骰面投影 SVG 外描边 + Three.js 外壳的当前视觉合同：${JSON.stringify(metrics)}`,
    ).toBe("projected-face-svg-outline-plus-threejs-shell");
    expect(
      metrics.diceHighlightSourceRenderer,
      `${label}物理骰源必须声明 WebGL 高亮渲染器：${JSON.stringify(metrics)}`,
    ).toBe("threejs-backside-shader-shell");
    expect(
      metrics.diceHighlightCanvasRenderer,
      `${label}canvas 必须收到 WebGL 高亮状态：${JSON.stringify(metrics)}`,
    ).toBe("threejs-backside-shader-shell");
    expect(
      metrics.rerollDomVisualBoxCount,
      `${label}每个可选骰子都必须有一个玩家可见、贴投影边缘的外描边：${JSON.stringify(metrics)}`,
    ).toBe(metrics.rerollTargets.length);
    expect(
      metrics.diceHighlightCount,
      `${label}每个可选骰子都必须有一个 Three.js 高亮状态：${JSON.stringify(metrics)}`,
    ).toBe(metrics.rerollTargets.length);
    expect(
      metrics.diceHighlightShellCount,
      `${label}每个可选骰子都必须有一个真实 WebGL 外壳描边 mesh：${JSON.stringify(metrics)}`,
    ).toBe(metrics.rerollTargets.length);
    for (let leftIndex = 0; leftIndex < metrics.rerollTargets.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < metrics.rerollTargets.length; rightIndex += 1) {
        const leftTarget = metrics.rerollTargets[leftIndex];
        const rightTarget = metrics.rerollTargets[rightIndex];
        const leftInflate = Math.max(0, leftTarget.outlineOffset + leftTarget.outlineWidth);
        const rightInflate = Math.max(0, rightTarget.outlineOffset + rightTarget.outlineWidth);
        const overlapWidth = Math.max(
          0,
          Math.min(leftTarget.right + leftInflate, rightTarget.right + rightInflate) -
            Math.max(leftTarget.left - leftInflate, rightTarget.left - rightInflate),
        );
        const overlapHeight = Math.max(
          0,
          Math.min(leftTarget.bottom + leftInflate, rightTarget.bottom + rightInflate) -
            Math.max(leftTarget.top - leftInflate, rightTarget.top - rightInflate),
        );
        expect(
          overlapWidth * overlapHeight,
          `${label}第 ${leftTarget.dieIndex + 1} 颗和第 ${rightTarget.dieIndex + 1} 颗改骰方框不能重叠：${JSON.stringify(metrics)}`,
        ).toBeLessThanOrEqual(1);
      }
    }
    for (const target of metrics.rerollTargets) {
      const evidence = JSON.stringify({ target, metrics });
      expect(target.shape, `${label}改骰方框必须绑定骰子本体：${evidence}`).toBe(
        "die-face",
      );
      expect(
        target.highlightRenderer,
        `${label}WebGL 辅助高亮必须来自 Three.js 骰体描边：${evidence}`,
      ).toBe("threejs-backside-shader-shell");
      expect(
        target.visualContract,
        `${label}改骰目标必须使用当前骰面投影 SVG 外描边视觉合同：${evidence}`,
      ).toBe("projected-face-svg-outline-plus-threejs-shell");
      expect(
        target.visualLayer,
        `${label}可见方框必须是骰面投影 SVG 外描边加 Three.js 外壳，不得回到离体大框：${evidence}`,
      ).toBe("projected-face-svg-outline-plus-threejs-shell");
      expect(
        target.outlinePaint,
        `${label}可见方框必须来自当前可见骰面四角投影，不能退回轴对齐大框：${evidence}`,
      ).toBe("projected-face-outside-svg-outline");
      expect(
        Number.isFinite(target.outlineRotateZ),
        `${label}可见方框必须暴露屏幕旋转角，证明不是固定轴对齐框：${evidence}`,
      ).toBe(true);
      expect(
        target.outlinePointCount,
        `${label}可见方框必须有当前可见骰面的四角投影点：${evidence}`,
      ).toBeGreaterThanOrEqual(4);
      expect(
        target.outlinePoints,
        `${label}可见方框必须暴露屏幕投影点，避免退回离体矩形：${evidence}`,
      ).toMatch(/\d/);
      expect(
        target.targetTransform,
        `${label}可见方框必须应用投影旋转 transform：${evidence}`,
      ).not.toBe("none");
      expect(
        Math.abs(target.targetWidth - target.visibleWidth),
        `${label}改骰方框宽度必须贴真实骰子投影：${evidence}`,
      ).toBeLessThanOrEqual(1.5);
      expect(
        Math.abs(target.targetHeight - target.visibleHeight),
        `${label}改骰方框高度必须贴真实骰子投影：${evidence}`,
      ).toBeLessThanOrEqual(1.5);
      expect(
        target.visibleMax,
        `${label}改骰方框必须来自真实 Three.js 骰子投影尺寸：${evidence}`,
      ).toBeGreaterThan(0);
      expect(
        target.outlineGap,
        `${label}改骰描边不能在 DOM 层制造离体空隙：${evidence}`,
      ).toBe(0);
      expect(
        target.hitBoxPadding,
        `${label}可点透明区可以比骰子本体略大，但不能把可见方框撑出大间隙：${evidence}`,
      ).toBeGreaterThanOrEqual(0);
      expect(
        target.hitBoxPadding,
        `${label}透明命中区不能过大到让玩家误判归属：${evidence}`,
      ).toBeLessThanOrEqual(1);
      expect(
        target.domCandidateVisualExists,
        `${label}未选候选必须有清晰外描边，选中后候选描边退场：${evidence}`,
      ).toBe(!target.selected);
      expect(
        target.selectedBorderExists,
        `${label}只有选中骰子显示选中外描边：${evidence}`,
      ).toBe(target.selected);
      expect(
        target.outlineExists,
        `${label}骰子必须有玩家可见外描边：${evidence}`,
      ).toBe(true);
      expect(
        target.outlineOffset,
        `${label}外描边必须贴边，不能产生离体空隙：${evidence}`,
      ).toBe(0);
      expect(
        target.outlineBorderMaxPx,
        `${label}外描边不得用 border 向内盖住骰面：${evidence}`,
      ).toBe(0);
      expect(
        target.outlineBackgroundAlpha,
        `${label}外描边内部必须透明，不得盖住骰子：${evidence}`,
      ).toBe(0);
      expect(
        target.outlineBoxShadow,
        `${label}外描边需要发光辅助，不能弱到看不清：${evidence}`,
      ).not.toBe("none");
      expect(
        target.webglHighlight,
        `${label}必须能从 Three.js 快照读到当前骰子的高亮状态：${evidence}`,
      ).not.toBeNull();
      expect(
        target.webglShell,
        `${label}必须能从 Three.js 场景读到当前骰子的描边外壳：${evidence}`,
      ).not.toBeNull();
      expect(
        target.webglShell?.renderer,
        `${label}描边外壳必须是 Three.js 背面外壳渲染器：${evidence}`,
      ).toBe("threejs-backside-shader-shell");
      expect(
        target.webglShell?.visible,
        `${label}描边外壳必须可见：${evidence}`,
      ).toBe(true);
      expect(
        target.webglShell?.materialType,
        `${label}描边外壳必须使用 Three.js ShaderMaterial，而不是 DOM/CSS 框或普通透明贴片：${evidence}`,
      ).toBe("ShaderMaterial");
      expect(
        target.webglShell?.materialSide,
        `${label}描边外壳必须用背面材质，只露骰子外缘不盖骰面：${evidence}`,
      ).toBe(1);
      expect(
        target.webglShell?.depthWrite,
        `${label}描边外壳不能写入深度，否则可能遮住骰子：${evidence}`,
      ).toBe(false);
      expect(
        target.webglShell?.transparent,
        `${label}描边外壳必须是透明材质，不能变成实心块：${evidence}`,
      ).toBe(true);
      expect(
        target.webglShell?.shaderOpacity,
        `${label}shader 透明度必须随候选/选中状态同步：${evidence}`,
      ).toBe(target.webglShell?.opacity);
      if (target.selected) {
        expect(
          target.outlineColor,
          `${label}选中外描边必须是清晰黄色：${evidence}`,
        ).toMatch(/255,\s*212,\s*71/);
        expect(
          target.outlineWidth,
          `${label}选中外描边必须比候选态更粗：${evidence}`,
        ).toBeGreaterThanOrEqual(3);
        expect(
          target.outlineWidth,
          `${label}选中外描边不能粗到盖住骰子归属：${evidence}`,
        ).toBeLessThanOrEqual(4);
        expect(
          target.webglHighlight?.variant,
          `${label}选中骰子必须升级为 selected WebGL 高亮：${evidence}`,
        ).toBe("selected");
        expect(
          target.webglShell?.variant,
          `${label}选中骰子的外壳必须同步为 selected：${evidence}`,
        ).toBe("selected");
        expect(
          target.webglShell?.scale,
          `${label}选中描边要比候选态更清楚，但仍贴近骰子：${evidence}`,
        ).toBeGreaterThanOrEqual(1.06);
        expect(
          target.webglShell?.scale,
          `${label}选中描边不能外扩成离体大框：${evidence}`,
        ).toBeLessThanOrEqual(1.075);
        expect(
          target.webglShell?.opacity,
          `${label}选中描边必须清晰可见：${evidence}`,
        ).toBeGreaterThanOrEqual(0.9);
      } else {
        expect(
          target.outlineColor,
          `${label}候选外描边必须是清晰青色：${evidence}`,
        ).toMatch(/0,\s*231,\s*255/);
        expect(
          target.outlineWidth,
          `${label}候选外描边必须清晰可见：${evidence}`,
        ).toBeGreaterThanOrEqual(2);
        expect(
          target.outlineWidth,
          `${label}候选外描边不能粗到像已选中：${evidence}`,
        ).toBeLessThanOrEqual(3);
        expect(
          target.webglHighlight?.variant,
          `${label}未选骰子必须显示 candidate WebGL 高亮：${evidence}`,
        ).toBe("candidate");
        expect(
          target.webglShell?.variant,
          `${label}未选骰子的外壳必须同步为 candidate：${evidence}`,
        ).toBe("candidate");
        expect(
          target.webglShell?.scale,
          `${label}候选描边必须是贴近骰子的弱候选态，不能像已选中：${evidence}`,
        ).toBeGreaterThanOrEqual(1.04);
        expect(
          target.webglShell?.scale,
          `${label}候选描边不能外扩成离体大框：${evidence}`,
        ).toBeLessThanOrEqual(1.055);
        expect(
          target.webglShell?.opacity,
          `${label}候选描边不能弱到看不清：${evidence}`,
        ).toBeGreaterThanOrEqual(0.9);
      }
    }
  }
  const workbenchRight = Math.max(
    metrics.card.right,
    metrics.roll.right,
    metrics.confirm?.right ?? 0,
  );
  expect(
    workbenchRight,
    `${label}卡牌、骰盘和确认入口不能压进右侧牌堆/状态栏：${JSON.stringify(metrics)}`,
  ).toBeLessThanOrEqual(metrics.statusRail.left - 2);
  expect(
    metrics.content.bottom,
    `${label}工作台不能压住底部行动栏：${JSON.stringify(metrics)}`,
  ).toBeLessThanOrEqual(metrics.actionRail.top + 4);
  expect(
    metrics.result.left,
    `${label}结果与确认入口必须收在投骰面板内：${JSON.stringify(metrics)}`,
  ).toBeGreaterThanOrEqual(metrics.roll.left - 4);
  expect(
    metrics.result.right,
    `${label}结果与确认入口不能漂出投骰面板：${JSON.stringify(metrics)}`,
  ).toBeLessThanOrEqual(metrics.roll.right + 4);
  if (metrics.confirm) {
    expect(
      metrics.confirm.left,
      `${label}确认按钮必须跟随投骰结果，不得贴到事件牌或房间牌上：${JSON.stringify(metrics)}`,
    ).toBeGreaterThanOrEqual(metrics.roll.left - 4);
    expect(
      metrics.confirm.right,
      `${label}确认按钮不能漂出投骰工作台：${JSON.stringify(metrics)}`,
    ).toBeLessThanOrEqual(metrics.roll.right + 4);
    expect(
      metrics.confirm.bottom,
      `${label}确认按钮不能压到底部行动栏附近：${JSON.stringify(metrics)}`,
    ).toBeLessThanOrEqual(metrics.actionRail.top - 32);
    expect(
      metrics.confirmHitTestId,
      `${label}确认按钮中心点必须真实命中按钮本体：${JSON.stringify(metrics)}`,
    ).toMatch(/betrayal-(discovery-continue|roll-modifier-confirm)/);
    if (metrics.confirmHitTestId === "betrayal-discovery-continue") {
      expect(
        metrics.bottomContinueCount,
        `${label}统一投骰确认按钮必须是唯一底部确认入口：${JSON.stringify(metrics)}`,
      ).toBe(1);
    } else {
      expect(
        metrics.bottomContinueCount,
        `${label}改骰确认入口可见时不得再残留底部返回/确认按钮：${JSON.stringify(metrics)}`,
      ).toBe(0);
    }
  }
};

export const expectUnifiedEventRollConfirmButton = async (
  page: Page,
  expectedText = "确认 2/3",
) => {
  await expect(page.getByTestId("betrayal-event-roll-finalize")).toHaveCount(0);
  await expect(page.getByTestId("betrayal-event-roll-waiting")).toHaveCount(0);

  const confirmButton = page.getByTestId("betrayal-discovery-continue");
  await expect(confirmButton).toHaveText(expectedText);

  const buttonShape = await confirmButton.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      borderRadius: style.borderRadius,
    };
  });
  expect(buttonShape).toEqual({
    backgroundColor: "rgb(214, 181, 109)",
    borderColor: "rgb(214, 181, 109)",
    borderRadius: "0px",
  });
};

export const expectVisiblePhysicalDiceBox = async (rollPanel: Locator) => {
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
  const initialDiceState = await diceGroup.evaluate((node) => {
    const group = node as HTMLElement;
    return {
      physicsReady: group.dataset.dicePhysicsReady ?? "",
      preloadState: group.dataset.dicePreloadState ?? "",
    };
  });
  expect(initialDiceState.preloadState).toBe("none");
  try {
    await expect
      .poll(async () => diceGroup.getAttribute("data-dice-physics-ready"), {
        timeout: 30000,
      })
      .toBe("true");
  } catch (error) {
    const diagnostics = await rollPanel.evaluate((node) => {
      const panel = node as HTMLElement;
      const group = panel.querySelector(
        '[data-testid="betrayal-house-dice-3d-group"]',
      ) as HTMLElement | null;
      const source = panel.querySelector(
        '[data-testid="betrayal-house-dice-physics-source"]',
      ) as HTMLElement | null;
      const canvases = Array.from(panel.querySelectorAll("canvas")).filter(
        (canvas): canvas is HTMLCanvasElement =>
          canvas instanceof HTMLCanvasElement,
      );
      const debugRegistry =
        (
          window as typeof window & {
            __diceBoxThreeDebug?: Record<string, () => unknown>;
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
      const describeElement = (element: HTMLElement | null) => {
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          clientWidth: element.clientWidth,
          clientHeight: element.clientHeight,
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity,
          dataset: { ...element.dataset },
        };
      };

      return {
        panel: describeElement(panel),
        group: describeElement(group),
        source: describeElement(source),
        canvasCount: canvases.length,
        canvases: canvases.map((canvas) => {
          const rect = canvas.getBoundingClientRect();
          const style = window.getComputedStyle(canvas);
          return {
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            clientWidth: canvas.clientWidth,
            clientHeight: canvas.clientHeight,
            display: style.display,
            visibility: style.visibility,
            opacity: style.opacity,
            dataset: { ...canvas.dataset },
          };
        }),
        activeCanvasTestId,
        engineDebug: activeCanvasTestId
          ? (debugRegistry[activeCanvasTestId]?.() ?? null)
          : (debugRegistry["betrayal-house-dice-box-canvas"]?.() ?? null),
      };
    });
    throw new Error(
      `山屋物理骰子没有渲染就绪：${JSON.stringify(diagnostics)}\n${error instanceof Error ? error.message : String(error)}`,
    );
  }
  await expect(diceGroup).toHaveAttribute("data-dice-preload-state", "none");
  await expect(
    diceGroup.locator('[data-testid^="betrayal-house-dice-preloaded-"]'),
  ).toHaveCount(0);

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
  const readableFaceOverlay = rollPanel.getByTestId(
    "betrayal-house-dice-readable-faces",
  );
  await expect(readableFaceOverlay).toHaveAttribute(
    "data-visual-layer",
    "diagnostic-only",
  );
  await expect(readableFaceOverlay).toHaveClass(/sr-only/);
  await expect
    .poll(
      async () =>
        readableFaceOverlay.evaluate((node) => {
          const element = node as HTMLElement;
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return {
            position: style.position,
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            overflow: style.overflow,
          };
        }),
      { timeout: 5000 },
    )
    .toEqual({
      position: "absolute",
      width: 1,
      height: 1,
      overflow: "hidden",
    });
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

export const waitForPhysicalDiceSettled = async (rollPanel: Locator) => {
  const physicsSource = rollPanel.getByTestId(
    "betrayal-house-dice-physics-source",
  );
  const diceGroup = rollPanel.getByTestId("betrayal-house-dice-3d-group");
  await expect
    .poll(async () => physicsSource.getAttribute("data-dice-container-size-ready"), {
      timeout: 15000,
    })
    .toBe("true");
  await expect
    .poll(async () => physicsSource.getAttribute("data-dice-skins-ready"), {
      timeout: 15000,
    })
    .toBe("true");
  await expect
    .poll(
      async () => {
        const [groupReady, settled, engineReady, engineFailure] = await Promise.all([
          diceGroup.getAttribute("data-dice-physics-ready"),
          physicsSource.getAttribute("data-dice-settled"),
          physicsSource.getAttribute("data-dice-engine-ready"),
          physicsSource.getAttribute("data-dice-engine-failure"),
        ]);
        if (groupReady === "true" || settled === "true") return "true";
        return JSON.stringify({ groupReady, settled, engineReady, engineFailure });
      },
      { timeout: 15000 },
    )
    .toBe("true");
  await expect
    .poll(async () => physicsSource.getAttribute("data-dice-settled"), {
      timeout: 15000,
    })
    .toBe("true");
  await expectPhysicalDiceStableAfterSettled(rollPanel, {
    waitMs: 360,
    maxCenterShiftPx: 1,
    maxGroupDriftPx: 1,
    maxRotationShiftRad: 0.02,
  });
};

export const waitForPhysicalDiceRerollMotion = async (
  rollPanel: Locator,
  options: { timeout?: number } = {},
) => {
  const physicsSource = rollPanel.getByTestId(
    "betrayal-house-dice-physics-source",
  );
  await expect
    .poll(
      async () => {
        const [motionType, motionId, settled, engineReady, engineFailure] =
          await Promise.all([
            physicsSource.getAttribute("data-dice-motion-type"),
            physicsSource.getAttribute("data-dice-motion-id"),
            physicsSource.getAttribute("data-dice-settled"),
            physicsSource.getAttribute("data-dice-engine-ready"),
            physicsSource.getAttribute("data-dice-engine-failure"),
          ]);
        if (motionType === "reroll" && settled === "false") {
          return "rerolling";
        }
        return JSON.stringify({
          motionType,
          motionId,
          settled,
          engineReady,
          engineFailure,
        });
      },
      { timeout: options.timeout ?? 7000 },
    )
    .toBe("rerolling");
};

type PhysicalDiceRerollMotionCapture = {
  expectVisible: () => Promise<unknown>;
  saveVisibleFrame: (path: string) => Promise<unknown>;
  stop: () => Promise<void>;
};

export const armPhysicalDiceRerollMotionCapture = async (
  rollPanel: Locator,
  options: {
    dieIndex?: number;
    timeout?: number;
    minRotationShiftRad?: number;
    minPositionShiftPx?: number;
    minScreenShiftPx?: number;
  } = {},
): Promise<PhysicalDiceRerollMotionCapture> => {
  const dieIndex = options.dieIndex ?? 0;
  const minRotationShiftRad = options.minRotationShiftRad ?? 0.08;
  const minPositionShiftPx = options.minPositionShiftPx ?? 0.75;
  const minScreenShiftPx = options.minScreenShiftPx ?? 14;
  const key = `reroll-motion-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  await rollPanel.evaluate(
    (
      node,
      captureOptions: {
        key: string;
        dieIndex: number;
        minRotationShiftRad: number;
        minPositionShiftPx: number;
        minScreenShiftPx: number;
      },
    ) => {
      type Motion = {
        x: number;
        y: number;
        z: number;
        rotateX: number;
        rotateY: number;
        rotateZ: number;
      };
      type Layout = {
        x: number;
        y: number;
        width: number;
        height: number;
        visualWidth?: number;
        visualHeight?: number;
        minX: number;
        maxX: number;
        minY: number;
        maxY: number;
      };
      type DebugDie = { motion?: Motion | null; layout?: Layout | null };
      type DebugSnapshot = { dice?: DebugDie[] };
      type Sample = {
        at: number;
        motionType: string;
        motionId: string;
        settled: string;
        engineReady: string;
        engineFailure: string;
        activeCanvasTestId?: string;
        motion: Motion | null;
        motions: Array<Motion | null>;
        layout: Layout | null;
        layouts: Array<Layout | null>;
      };
      type Capture = {
        stopped: boolean;
        frameId: number | null;
        timerId: number | null;
        samples: Sample[];
        latestVisibleEvidence: unknown;
      };
      const pageWindow = window as typeof window & {
        __betrayalDiceRerollMotionCaptures?: Record<string, Capture>;
        __diceBoxThreeDebug?: Record<string, () => DebugSnapshot | null>;
      };
      const initialPanel = node as HTMLElement;
      pageWindow.__betrayalDiceRerollMotionCaptures =
        pageWindow.__betrayalDiceRerollMotionCaptures ?? {};

      const readSample = (now: number): Sample => {
        const source =
          document.querySelector<HTMLElement>(
            '[data-testid="betrayal-house-dice-physics-source"]',
          ) ??
          initialPanel.querySelector<HTMLElement>(
            '[data-testid="betrayal-house-dice-physics-source"]',
          );
        const panel =
          source?.closest<HTMLElement>(
            '[data-testid="betrayal-recent-roll-panel"], [data-testid="betrayal-discovery-panel"]',
          ) ?? initialPanel;
        const group =
          panel.querySelector<HTMLElement>(
            '[data-testid="betrayal-house-dice-3d-group"]',
          ) ??
          document.querySelector<HTMLElement>(
            '[data-testid="betrayal-house-dice-3d-group"]',
          );
        const debugRegistry = pageWindow.__diceBoxThreeDebug ?? {};
        const canvases = Array.from(panel.querySelectorAll("canvas")).filter(
          (canvas): canvas is HTMLCanvasElement =>
            canvas instanceof HTMLCanvasElement,
        );
        const activeCanvas =
          canvases.find((canvas) => {
            const testId = canvas.dataset.testid;
            return Boolean(
              testId && typeof debugRegistry[testId] === "function",
            );
          }) ??
          canvases[0] ??
          null;
        const activeCanvasTestId =
          activeCanvas?.dataset.testid ?? group?.dataset.diceDebugKey;
        const snapshot = activeCanvasTestId
          ? (debugRegistry[activeCanvasTestId]?.() ?? null)
          : null;
        const motions =
          snapshot?.dice?.map((die) => die.motion ?? null) ?? [];
        const layouts =
          snapshot?.dice?.map((die) => die.layout ?? null) ?? [];
        return {
          at: now,
          motionType: source?.dataset.diceMotionType ?? "",
          motionId: source?.dataset.diceMotionId ?? "",
          settled: source?.dataset.diceSettled ?? "",
          engineReady: source?.dataset.diceEngineReady ?? "",
          engineFailure: source?.dataset.diceEngineFailure ?? "",
          activeCanvasTestId,
          motion: motions[captureOptions.dieIndex] ?? null,
          motions,
          layout: layouts[captureOptions.dieIndex] ?? null,
          layouts,
        };
      };

      const capture: Capture = {
        stopped: false,
        frameId: null,
        timerId: null,
        samples: [readSample(performance.now())],
        latestVisibleEvidence: null,
      };
      const clearScheduledStep = () => {
        if (capture.frameId !== null) {
          window.cancelAnimationFrame(capture.frameId);
          capture.frameId = null;
        }
        if (capture.timerId !== null) {
          window.clearTimeout(capture.timerId);
          capture.timerId = null;
        }
      };
      const scheduleStep = () => {
        capture.frameId = window.requestAnimationFrame(step);
        capture.timerId = window.setTimeout(() => step(performance.now()), 33);
      };
      const step = (now: number) => {
        if (capture.stopped) return;
        clearScheduledStep();
        const sample = readSample(now);
        const previous = capture.samples.at(-1) ?? null;
        capture.samples.push(sample);
        if (capture.samples.length > 180) {
          capture.samples.shift();
        }
        const sampleIsRerolling =
          sample.motionType === "reroll" && sample.settled === "false";
        const baselineSample =
          [...capture.samples]
            .reverse()
            .find(
              (candidate) =>
                candidate !== sample &&
                Boolean(candidate.layout) &&
                !(
                  candidate.motionType === "reroll" &&
                  candidate.settled === "false"
                ),
            ) ??
          capture.samples.find(
            (candidate) => candidate !== sample && Boolean(candidate.layout),
          ) ??
          null;
        const positionShift = previous?.motion && sample.motion
          ? Math.hypot(
            sample.motion.x - previous.motion.x,
            sample.motion.y - previous.motion.y,
            sample.motion.z - previous.motion.z,
          )
          : 0;
        const rotationShift = previous?.motion && sample.motion
          ? Math.max(
            Math.abs(sample.motion.rotateX - previous.motion.rotateX),
            Math.abs(sample.motion.rotateY - previous.motion.rotateY),
            Math.abs(sample.motion.rotateZ - previous.motion.rotateZ),
          )
          : 0;
        const screenShiftPx = baselineSample?.layout && sample.layout
          ? Math.hypot(
            sample.layout.x - baselineSample.layout.x,
            sample.layout.y - baselineSample.layout.y,
          )
          : 0;
        const screenBoundsShiftPx = baselineSample?.layout && sample.layout
          ? Math.max(
            Math.abs(sample.layout.minX - baselineSample.layout.minX),
            Math.abs(sample.layout.maxX - baselineSample.layout.maxX),
            Math.abs(sample.layout.minY - baselineSample.layout.minY),
            Math.abs(sample.layout.maxY - baselineSample.layout.maxY),
          )
          : 0;
        const shiftedDice = sample.motions.map((motion, index) => {
          const previousMotion = previous?.motions[index] ?? null;
          const baselineLayout = baselineSample?.layouts[index] ?? null;
          const currentLayout = sample.layouts[index] ?? null;
          const dieScreenShiftPx = baselineLayout && currentLayout
            ? Math.hypot(
              currentLayout.x - baselineLayout.x,
              currentLayout.y - baselineLayout.y,
            )
            : 0;
          if (!previousMotion || !motion) {
            return { index, positionShift: 0, rotationShift: 0, screenShiftPx: dieScreenShiftPx };
          }
          return {
            index,
            positionShift: Math.hypot(
              motion.x - previousMotion.x,
              motion.y - previousMotion.y,
              motion.z - previousMotion.z,
            ),
            rotationShift: Math.max(
              Math.abs(motion.rotateX - previousMotion.rotateX),
              Math.abs(motion.rotateY - previousMotion.rotateY),
              Math.abs(motion.rotateZ - previousMotion.rotateZ),
            ),
            screenShiftPx: dieScreenShiftPx,
          };
        });
        const motionEvidenceType =
          Math.max(screenShiftPx, screenBoundsShiftPx) >= captureOptions.minScreenShiftPx
            ? "screen-shift"
            : positionShift >= captureOptions.minPositionShiftPx
              ? "position-shift"
              : rotationShift >= captureOptions.minRotationShiftRad
                ? "rotation-shift"
                : "";
        if (sampleIsRerolling && motionEvidenceType) {
          capture.latestVisibleEvidence = {
            detectedAt: now,
            motionEvidenceType,
            screenShiftPx,
            screenBoundsShiftPx,
            positionShift,
            rotationShift,
            shiftedDice,
            before: previous,
            after: sample,
          };
        }
        scheduleStep();
      };
      scheduleStep();
      pageWindow.__betrayalDiceRerollMotionCaptures[captureOptions.key] =
        capture;
    },
    { key, dieIndex, minRotationShiftRad, minPositionShiftPx, minScreenShiftPx },
  );

  const readCaptureState = async () =>
    rollPanel.page().evaluate((captureKey) => {
      const pageWindow = window as typeof window & {
        __betrayalDiceRerollMotionCaptures?: Record<
          string,
          {
            samples: Array<{
              at: number;
              motionType: string;
              motionId: string;
              settled: string;
              engineReady: string;
              engineFailure: string;
              activeCanvasTestId?: string;
              motion: unknown;
              motions: unknown[];
              layout: unknown;
              layouts: unknown[];
            }>;
            latestVisibleEvidence: {
              detectedAt?: number;
              motionEvidenceType?: string;
              screenShiftPx?: number;
              screenBoundsShiftPx?: number;
              positionShift?: number;
              rotationShift?: number;
              shiftedDice?: unknown[];
              before?: { at?: number } | null;
              after?: { at?: number } | null;
            } | null;
          }
        >;
      };
      const capture =
        pageWindow.__betrayalDiceRerollMotionCaptures?.[captureKey];
      if (!capture) {
        return { status: "missing" as const };
      }
      const now = performance.now();
      const latest = capture.samples.at(-1) ?? null;
      const rerollingSamples = capture.samples.filter(
        (sample) =>
          sample.motionType === "reroll" && sample.settled === "false",
      );
      const shiftedDiceSummary = rerollingSamples.flatMap((sample, sampleIndex) => {
        const previous = rerollingSamples[sampleIndex - 1] ?? null;
        const baseline =
          capture.samples
            .slice(0, capture.samples.indexOf(sample))
            .reverse()
            .find(
              (candidate) =>
                Boolean(candidate.layout) &&
                !(
                  candidate.motionType === "reroll" &&
                  candidate.settled === "false"
                ),
            ) ?? null;
        if (!previous) return [];
        return sample.motions.map((motion, index) => {
          const previousMotion = previous.motions[index] as
            | {
              x: number;
              y: number;
              z: number;
              rotateX: number;
              rotateY: number;
              rotateZ: number;
            }
            | null
            | undefined;
          const currentMotion = motion as
            | {
              x: number;
              y: number;
              z: number;
              rotateX: number;
              rotateY: number;
              rotateZ: number;
            }
            | null
            | undefined;
          const baselineLayout = (baseline?.layouts[index] ?? null) as
            | { x: number; y: number }
            | null
            | undefined;
          const currentLayout = (sample.layouts[index] ?? null) as
            | { x: number; y: number }
            | null
            | undefined;
          const screenShiftPx = baselineLayout && currentLayout
            ? Math.hypot(
              currentLayout.x - baselineLayout.x,
              currentLayout.y - baselineLayout.y,
            )
            : 0;
          if (!previousMotion || !currentMotion) {
            return { index, positionShift: 0, rotationShift: 0, screenShiftPx };
          }
          return {
            index,
            positionShift: Math.hypot(
              currentMotion.x - previousMotion.x,
              currentMotion.y - previousMotion.y,
              currentMotion.z - previousMotion.z,
            ),
            rotationShift: Math.max(
              Math.abs(currentMotion.rotateX - previousMotion.rotateX),
              Math.abs(currentMotion.rotateY - previousMotion.rotateY),
              Math.abs(currentMotion.rotateZ - previousMotion.rotateZ),
            ),
            screenShiftPx,
          };
        });
      });
      const visibleEvidence = capture.latestVisibleEvidence as
        | {
          detectedAt?: number;
          after?: { at?: number } | null;
        }
        | null;
      const recentVisible =
        visibleEvidence &&
        typeof visibleEvidence.detectedAt === "number" &&
        now - visibleEvidence.detectedAt <= 180 &&
        latest?.at === visibleEvidence.after?.at &&
        latest?.motionType === "reroll" &&
        latest?.settled === "false";
      return {
        status: recentVisible ? "visible-reroll-motion" : "waiting",
        now,
        latest,
        sampleCount: capture.samples.length,
        rerollingSampleCount: rerollingSamples.length,
        shiftedDiceSummary,
        rerollingSamples: rerollingSamples.slice(0, 8),
        latestVisibleEvidence: capture.latestVisibleEvidence,
        recentSamples: capture.samples.slice(-8),
      };
    }, key);

  const waitForCurrentRerollFrame = async (): Promise<unknown> => {
    const frame = await rollPanel.page().waitForFunction(
      (captureOptions) => {
        const source = document.querySelector<HTMLElement>(
          '[data-testid="betrayal-house-dice-physics-source"]',
        );
        if (
          source?.dataset.diceMotionType !== "reroll" ||
          source.dataset.diceSettled !== "false"
        ) {
          return null;
        }
        const canvas =
          document.querySelector<HTMLCanvasElement>(
            '[data-testid^="betrayal-house-dice-box-canvas"]',
          ) ?? null;
        const rect = canvas?.getBoundingClientRect();
        if (!canvas || !rect || rect.width <= 0 || rect.height <= 0) {
          return null;
        }
        type Motion = {
          x: number;
          y: number;
          z: number;
          rotateX: number;
          rotateY: number;
          rotateZ: number;
        };
        type Layout = { x: number; y: number; minX: number; maxX: number; minY: number; maxY: number };
        type Sample = {
          motionType: string;
          settled: string;
          motion: Motion | null;
          motions: Array<Motion | null>;
          layout: Layout | null;
          layouts: Array<Layout | null>;
        };
        const pageWindow = window as typeof window & {
          __betrayalDiceRerollMotionCaptures?: Record<
            string,
            {
              samples?: Sample[];
              latestVisibleEvidence?: unknown;
            }
          >;
          __diceBoxThreeDebug?: Record<
            string,
            () => { dice?: Array<{ layout?: Layout | null; motion?: Motion | null }> } | null
          >;
        };
        const capture =
          pageWindow.__betrayalDiceRerollMotionCaptures?.[
            captureOptions.key
          ] ?? null;
        const baseline =
          capture?.samples?.find(
            (candidate) =>
              candidate.layout &&
              !(
                candidate.motionType === "reroll" &&
                candidate.settled === "false"
              ),
          ) ??
          capture?.samples?.find((candidate) => Boolean(candidate.layout)) ??
          null;
        const debugRegistry = pageWindow.__diceBoxThreeDebug ?? {};
        const activeCanvasTestId =
          canvas.dataset.testid ??
          document
            .querySelector<HTMLElement>(
              '[data-testid="betrayal-house-dice-3d-group"]',
            )
            ?.dataset.diceDebugKey;
        const snapshot = activeCanvasTestId
          ? debugRegistry[activeCanvasTestId]?.() ?? null
          : null;
        const currentLayout =
          snapshot?.dice?.[captureOptions.dieIndex]?.layout ?? null;
        const currentMotion =
          snapshot?.dice?.[captureOptions.dieIndex]?.motion ?? null;
        const baselineLayout =
          baseline?.layouts?.[captureOptions.dieIndex] ??
          baseline?.layout ??
          null;
        const baselineMotion =
          baseline?.motions?.[captureOptions.dieIndex] ??
          baseline?.motion ??
          null;
        if (!baselineLayout || !currentLayout || !baselineMotion || !currentMotion) {
          return null;
        }
        const screenShiftPx = Math.hypot(
          currentLayout.x - baselineLayout.x,
          currentLayout.y - baselineLayout.y,
        );
        const screenBoundsShiftPx = Math.max(
          Math.abs(currentLayout.minX - baselineLayout.minX),
          Math.abs(currentLayout.maxX - baselineLayout.maxX),
          Math.abs(currentLayout.minY - baselineLayout.minY),
          Math.abs(currentLayout.maxY - baselineLayout.maxY),
        );
        const visibleShiftPx = Math.max(screenShiftPx, screenBoundsShiftPx);
        const positionShift = Math.hypot(
          currentMotion.x - baselineMotion.x,
          currentMotion.y - baselineMotion.y,
          currentMotion.z - baselineMotion.z,
        );
        const rotationShift = Math.max(
          Math.abs(currentMotion.rotateX - baselineMotion.rotateX),
          Math.abs(currentMotion.rotateY - baselineMotion.rotateY),
          Math.abs(currentMotion.rotateZ - baselineMotion.rotateZ),
        );
        const motionEvidenceType =
          visibleShiftPx >= captureOptions.minScreenShiftPx
            ? "screen-shift"
            : positionShift >= captureOptions.minPositionShiftPx
              ? "position-shift"
              : rotationShift >= captureOptions.minRotationShiftRad
                ? "rotation-shift"
                : "";
        if (!motionEvidenceType) {
          return null;
        }
        const parent = canvas.parentElement;
        if (!parent) {
          return null;
        }
        document
          .querySelectorAll(
            '[data-betrayal-reroll-motion-frame-overlay="true"]',
          )
          .forEach((element) => element.remove());
        const parentStyle = window.getComputedStyle(parent);
        if (parentStyle.position === "static") {
          parent.dataset.betrayalRerollFramePreviousPosition =
            parent.style.position;
          parent.style.position = "relative";
        }
        canvas.dataset.betrayalRerollFramePreviousVisibility =
          canvas.style.visibility;
        canvas.dataset.betrayalRerollFrameHidden = "true";
        canvas.style.visibility = "hidden";
        const overlay = document.createElement("img");
        overlay.dataset.testid = "betrayal-reroll-motion-frame-freeze";
        overlay.dataset.betrayalRerollMotionFrameOverlay = "true";
        overlay.alt = "";
        overlay.src = canvas.toDataURL("image/png");
        Object.assign(overlay.style, {
          position: "fixed",
          left: `${rect.left}px`,
          top: `${rect.top}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
          objectFit: "fill",
          pointerEvents: "none",
          zIndex: "2147483647",
        });
        document.body.appendChild(overlay);
        return {
          at: performance.now(),
          motionType: source.dataset.diceMotionType,
          motionId: source.dataset.diceMotionId ?? "",
          settled: source.dataset.diceSettled,
          canvasWidth: Math.round(rect.width),
          canvasHeight: Math.round(rect.height),
          baselineLayout,
          currentLayout,
          screenShiftPx,
          screenBoundsShiftPx,
          visibleShiftPx,
          positionShift,
          rotationShift,
          motionEvidenceType,
        };
      },
      { key, dieIndex, minScreenShiftPx, minPositionShiftPx, minRotationShiftRad },
      {
        timeout: options.timeout ?? 7000,
        polling: 16,
      },
    );
    const value = await frame.jsonValue();
    expect(value, "兔脚重投过程图必须在骰盘仍处于重投运动态时抓拍").not.toBeNull();
    return value;
  };

  const clearVisibleFrameOverlay = async () => {
    await rollPanel.page().evaluate(() => {
      document
        .querySelectorAll(
          '[data-betrayal-reroll-motion-frame-overlay="true"]',
        )
        .forEach((element) => element.remove());
      document
        .querySelectorAll<HTMLCanvasElement>(
          'canvas[data-betrayal-reroll-frame-hidden="true"]',
        )
        .forEach((canvas) => {
          canvas.style.visibility =
            canvas.dataset.betrayalRerollFramePreviousVisibility ?? "";
          delete canvas.dataset.betrayalRerollFramePreviousVisibility;
          delete canvas.dataset.betrayalRerollFrameHidden;
        });
      document
        .querySelectorAll<HTMLElement>(
          '[data-betrayal-reroll-frame-previous-position]',
        )
        .forEach((element) => {
          element.style.position =
            element.dataset.betrayalRerollFramePreviousPosition ?? "";
          delete element.dataset.betrayalRerollFramePreviousPosition;
        });
    });
  };

  const expectRecordedVisibleEvidence = async (): Promise<unknown> => {
    let visibleEvidence: unknown = null;
    await expect
      .poll(
        async () => {
          const state = await readCaptureState();
          if (state.latestVisibleEvidence) {
            visibleEvidence = state.latestVisibleEvidence;
            return "visible-reroll-motion";
          }
          return JSON.stringify({
            status: state.status,
            latest: state.latest,
            sampleCount: state.sampleCount,
            rerollingSampleCount: state.rerollingSampleCount,
            shiftedDiceSummary: state.shiftedDiceSummary,
            recentSamples: state.recentSamples,
          });
        },
        {
          timeout: options.timeout ?? 7000,
          intervals: [40, 60, 80, 120],
        },
      )
      .toBe("visible-reroll-motion");
    expect(visibleEvidence, "兔脚重投过程截图必须有玩家可见的运动或翻转证据").not.toBeNull();
    return visibleEvidence;
  };

  const expectVisible = async (): Promise<unknown> => {
    let visibleEvidence: unknown = null;
    await expect
      .poll(
        async () => {
          const state = await readCaptureState();
          if (state.status === "visible-reroll-motion") {
            visibleEvidence = state.latestVisibleEvidence;
            return "visible-reroll-motion";
          }
          return JSON.stringify(state);
        },
        {
          timeout: options.timeout ?? 7000,
          intervals: [40, 60, 80, 120],
        },
      )
      .toBe("visible-reroll-motion");
    expect(visibleEvidence, "兔脚重投过程截图必须绑定当前仍在运动的可见位移帧").not.toBeNull();
    return visibleEvidence;
  };

  return {
    expectVisible,
    saveVisibleFrame: async (path: string) => {
      const screenshotFrame = await waitForCurrentRerollFrame();
      await rollPanel
        .page()
        .waitForFunction(
          () => {
            const overlay = document.querySelector<HTMLImageElement>(
              '[data-testid="betrayal-reroll-motion-frame-freeze"]',
            );
            return Boolean(
              overlay?.complete &&
                (overlay.naturalWidth ?? 0) > 0 &&
                (overlay.naturalHeight ?? 0) > 0,
            );
          },
          undefined,
          { timeout: 5000, polling: 16 },
        );
      try {
        await saveScreenshot(rollPanel.page(), path);
      } finally {
        await clearVisibleFrameOverlay();
      }
      const visibleEvidence = await expectRecordedVisibleEvidence();
      return {
        ...(typeof visibleEvidence === "object" && visibleEvidence
          ? visibleEvidence
          : {}),
        screenshotFrame,
      };
    },
    stop: async () => {
      await rollPanel.page().evaluate((captureKey) => {
        const pageWindow = window as typeof window & {
          __betrayalDiceRerollMotionCaptures?: Record<
            string,
            { stopped: boolean; frameId: number | null; timerId: number | null }
          >;
        };
        const capture =
          pageWindow.__betrayalDiceRerollMotionCaptures?.[captureKey];
        if (!capture) return;
        capture.stopped = true;
        if (capture.frameId !== null) {
          window.cancelAnimationFrame(capture.frameId);
        }
        if (capture.timerId !== null) {
          window.clearTimeout(capture.timerId);
        }
        delete pageWindow.__betrayalDiceRerollMotionCaptures?.[captureKey];
      }, key);
    },
  };
};

export const expectPhysicalDiceRerollMotionVisible = async (
  rollPanel: Locator,
  options: {
    dieIndex?: number;
    timeout?: number;
    sampleMs?: number;
    minRotationShiftRad?: number;
    minPositionShiftPx?: number;
  } = {},
) => {
  const dieIndex = options.dieIndex ?? 0;
  const sampleMs = options.sampleMs ?? 180;
  const minRotationShiftRad = options.minRotationShiftRad ?? 0.08;
  const minPositionShiftPx = options.minPositionShiftPx ?? 0.75;
  const readSnapshot = async () =>
    rollPanel.evaluate((node, selectedDieIndex) => {
      type Motion = {
        x: number;
        y: number;
        z: number;
        rotateX: number;
        rotateY: number;
        rotateZ: number;
      };
      type DebugDie = { motion?: Motion | null };
      type DebugSnapshot = { dice?: DebugDie[] };
      const panel = node as HTMLElement;
      const source = panel.querySelector<HTMLElement>(
        '[data-testid="betrayal-house-dice-physics-source"]',
      );
      const group = panel.querySelector<HTMLElement>(
        '[data-testid="betrayal-house-dice-3d-group"]',
      );
      const debugRegistry =
        (
          window as typeof window & {
            __diceBoxThreeDebug?: Record<string, () => DebugSnapshot | null>;
          }
        ).__diceBoxThreeDebug ?? {};
      const canvases = Array.from(panel.querySelectorAll("canvas")).filter(
        (canvas): canvas is HTMLCanvasElement =>
          canvas instanceof HTMLCanvasElement,
      );
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
        ? (debugRegistry[activeCanvasTestId]?.() ?? null)
        : null;
      const motion = snapshot?.dice?.[selectedDieIndex]?.motion ?? null;
      return {
        motionType: source?.dataset.diceMotionType ?? "",
        settled: source?.dataset.diceSettled ?? "",
        engineReady: source?.dataset.diceEngineReady ?? "",
        engineFailure: source?.dataset.diceEngineFailure ?? "",
        activeCanvasTestId,
        motion,
      };
    }, dieIndex);

  await expect
    .poll(
      async () => {
        const before = await readSnapshot();
        await rollPanel.page().waitForTimeout(sampleMs);
        const after = await readSnapshot();
        const positionShift = before.motion && after.motion
          ? Math.hypot(
            after.motion.x - before.motion.x,
            after.motion.y - before.motion.y,
            after.motion.z - before.motion.z,
          )
          : 0;
        const rotationShift = before.motion && after.motion
          ? Math.max(
            Math.abs(after.motion.rotateX - before.motion.rotateX),
            Math.abs(after.motion.rotateY - before.motion.rotateY),
            Math.abs(after.motion.rotateZ - before.motion.rotateZ),
          )
          : 0;
        const evidence = JSON.stringify({
          dieIndex,
          positionShift,
          rotationShift,
          before,
          after,
        });
        const stayedInRerollWindow =
          before.motionType === "reroll" &&
          after.motionType === "reroll" &&
          before.settled === "false" &&
          after.settled === "false";
        const hasVisibleMotion =
          Boolean(before.motion && after.motion) &&
          (positionShift >= minPositionShiftPx || rotationShift >= minRotationShiftRad);
        return stayedInRerollWindow && hasVisibleMotion ? "visible-reroll-motion" : evidence;
      },
      {
        timeout: options.timeout ?? 7000,
        intervals: [40, 60, 80, 120],
      },
    )
    .toBe("visible-reroll-motion");
};

export const clickDiscoveryBackdropAndExpectStillVisible = async (
  page: Page,
  discoveryPanel: Locator = page.getByTestId("betrayal-discovery-panel"),
) => {
  await expect(discoveryPanel).toBeVisible();
  await expect(discoveryPanel).toHaveAttribute("data-backdrop-dismiss", "disabled");
  const blankPoint = await discoveryPanel.evaluate((panel) => {
    const panelRect = panel.getBoundingClientRect();
    const content = panel.querySelector(
      '[data-testid="betrayal-discovery-panel-content"]',
    );
    const contentRect = content?.getBoundingClientRect();
    const candidates = [
      { x: panelRect.left + 16, y: panelRect.top + 16 },
      { x: panelRect.right - 16, y: panelRect.top + 16 },
      { x: panelRect.left + 16, y: panelRect.bottom - 16 },
      { x: panelRect.right - 16, y: panelRect.bottom - 16 },
    ];
    const outsideContent = candidates.find(
      (point) =>
        !contentRect ||
        point.x < contentRect.left ||
        point.x > contentRect.right ||
        point.y < contentRect.top ||
        point.y > contentRect.bottom,
    );
    return outsideContent ?? { x: panelRect.left + 8, y: panelRect.top + 8 };
  });
  await page.mouse.click(blankPoint.x, blankPoint.y);
  await expect(discoveryPanel).toBeVisible();
};

export const expectPhysicalDiceStableAfterSettled = async (
  rollPanel: Locator,
  options: {
    waitMs?: number;
    maxCenterShiftPx?: number;
    maxGroupDriftPx?: number;
    maxRotationShiftRad?: number;
  } = {},
) => {
  const waitMs = options.waitMs ?? 600;
  const maxCenterShiftPx = options.maxCenterShiftPx ?? 24;
  const maxGroupDriftPx = options.maxGroupDriftPx ?? 8;
  const maxRotationShiftRad = options.maxRotationShiftRad ?? 0.08;
  const physicsSource = rollPanel.getByTestId(
    "betrayal-house-dice-physics-source",
  );
  const diceGroup = rollPanel.getByTestId("betrayal-house-dice-3d-group");
  await expect
    .poll(
      async () => {
        const [groupReady, settled, engineReady, engineFailure] = await Promise.all([
          diceGroup.getAttribute("data-dice-physics-ready"),
          physicsSource.getAttribute("data-dice-settled"),
          physicsSource.getAttribute("data-dice-engine-ready"),
          physicsSource.getAttribute("data-dice-engine-failure"),
        ]);
        if (groupReady === "true" || settled === "true") return "true";
        return JSON.stringify({ groupReady, settled, engineReady, engineFailure });
      },
      { timeout: 15000 },
    )
    .toBe("true");
  await expect
    .poll(async () => physicsSource.getAttribute("data-dice-settled"), {
      timeout: 15000,
    })
    .toBe("true");

  const readSnapshot = async () =>
    rollPanel.evaluate((node) => {
      type Layout = {
        x: number;
        y: number;
        width: number;
        height: number;
        visualWidth?: number;
        visualHeight?: number;
      };
      type Motion = {
        x: number;
        y: number;
        z: number;
        rotateX: number;
        rotateY: number;
        rotateZ: number;
      };
      type DebugDie = { layout?: Layout | null; motion?: Motion | null };
      type DebugSnapshot = {
        dice?: DebugDie[];
        canvas?: { clientWidth?: number; clientHeight?: number } | null;
      };
      const panel = node as HTMLElement;
      const group = panel.querySelector(
        '[data-testid="betrayal-house-dice-3d-group"]',
      ) as HTMLElement | null;
      const source = panel.querySelector(
        '[data-testid="betrayal-house-dice-physics-source"]',
      ) as HTMLElement | null;
      const groupRect = group?.getBoundingClientRect();
      const debugRegistry =
        (
          window as typeof window & {
            __diceBoxThreeDebug?: Record<string, () => DebugSnapshot | null>;
          }
        ).__diceBoxThreeDebug ?? {};
      const canvases = Array.from(panel.querySelectorAll("canvas")).filter(
        (canvas): canvas is HTMLCanvasElement =>
          canvas instanceof HTMLCanvasElement,
      );
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
        ? (debugRegistry[activeCanvasTestId]?.() ?? null)
        : (debugRegistry["betrayal-house-dice-box-canvas"]?.() ?? null);
      const canvasClientWidth = snapshot?.canvas?.clientWidth ?? 0;
      const canvasClientHeight = snapshot?.canvas?.clientHeight ?? 0;
      const canvasRect = activeCanvas?.getBoundingClientRect();
      const displayScaleX =
        canvasRect && canvasClientWidth > 0
          ? canvasRect.width / canvasClientWidth
          : 1;
      const displayScaleY =
        canvasRect && canvasClientHeight > 0
          ? canvasRect.height / canvasClientHeight
          : 1;
      const layouts = (snapshot?.dice ?? [])
        .map((die) => die.layout)
        .filter(
          (layout): layout is Layout =>
            Boolean(layout) &&
            Number.isFinite(layout.x) &&
            Number.isFinite(layout.y) &&
            Number.isFinite(layout.width) &&
            Number.isFinite(layout.height),
        )
        .map((layout) => ({
          x: layout.x,
          y: layout.y,
          width: layout.visualWidth ?? layout.width,
          height: layout.visualHeight ?? layout.height,
        }));
      const motions = (snapshot?.dice ?? [])
        .map((die) => die.motion)
        .filter(
          (motion): motion is Motion =>
            Boolean(motion) &&
            Number.isFinite(motion.x) &&
            Number.isFinite(motion.y) &&
            Number.isFinite(motion.z) &&
            Number.isFinite(motion.rotateX) &&
            Number.isFinite(motion.rotateY) &&
            Number.isFinite(motion.rotateZ),
        )
        .map((motion) => ({
          x: motion.x,
          y: motion.y,
          z: motion.z,
          rotateX: motion.rotateX,
          rotateY: motion.rotateY,
          rotateZ: motion.rotateZ,
        }));

      return {
        hasSnapshot: Boolean(snapshot),
        activeCanvasTestId,
        debugKeys: Object.keys(debugRegistry),
        sourceDataset: source ? { ...source.dataset } : null,
        canvasCount: canvases.length,
        canvases: canvases.map((canvas) => ({
          dataset: { ...canvas.dataset },
          width: canvas.width,
          height: canvas.height,
          clientWidth: canvas.clientWidth,
          clientHeight: canvas.clientHeight,
        })),
        diceCount: layouts.length,
        displayScaleX,
        displayScaleY,
        groupRect: groupRect
          ? {
              x: groupRect.x,
              y: groupRect.y,
              width: groupRect.width,
              height: groupRect.height,
            }
          : null,
        layouts,
        motions,
      };
    });

  const before = await readSnapshot();
  await rollPanel.page().waitForTimeout(waitMs);
  const after = await readSnapshot();
  expect(
    before.hasSnapshot && after.hasSnapshot,
    `山屋骰盘停稳稳定性必须来自真实 Three.js 快照：${JSON.stringify({ before, after })}`,
  ).toBe(true);
  expect(
    after.diceCount,
    `山屋骰盘停稳后骰子数量不能变化：${JSON.stringify({ before, after })}`,
  ).toBe(before.diceCount);
  expect(
    after.motions.length,
    `山屋骰盘停稳稳定性必须读到每颗骰子的旋转快照：${JSON.stringify({ before, after })}`,
  ).toBe(after.diceCount);
  expect(
    before.diceCount,
    `山屋骰盘停稳稳定性至少要看到一颗骰子：${JSON.stringify({ before, after })}`,
  ).toBeGreaterThan(0);

  const shifts = before.layouts.map((layout, index) => {
    const next = after.layouts[index];
    if (!next) return Number.POSITIVE_INFINITY;
    const dx = (next.x - layout.x) * after.displayScaleX;
    const dy = (next.y - layout.y) * after.displayScaleY;
    return Math.hypot(dx, dy);
  });
  const maxShift = Math.max(...shifts);
  expect(
    maxShift,
    `山屋骰子停稳后不能二次瞬移：${JSON.stringify({ before, after, shifts })}`,
  ).toBeLessThanOrEqual(maxCenterShiftPx);
  const rotationShifts = before.motions.map((motion, index) => {
    const next = after.motions[index];
    if (!next) return Number.POSITIVE_INFINITY;
    return Math.max(
      Math.abs(next.rotateX - motion.rotateX),
      Math.abs(next.rotateY - motion.rotateY),
      Math.abs(next.rotateZ - motion.rotateZ),
    );
  });
  const maxRotationShift = Math.max(...rotationShifts);
  expect(
    maxRotationShift,
    `山屋骰子停稳截图前旋转必须已经停止：${JSON.stringify({ before, after, rotationShifts })}`,
  ).toBeLessThanOrEqual(maxRotationShiftRad);
  if (before.groupRect && after.groupRect) {
    const groupDrift = Math.max(
      Math.abs(after.groupRect.x - before.groupRect.x),
      Math.abs(after.groupRect.y - before.groupRect.y),
      Math.abs(after.groupRect.width - before.groupRect.width),
      Math.abs(after.groupRect.height - before.groupRect.height),
    );
    expect(
      groupDrift,
      `山屋骰盘停稳后容器不能漂移：${JSON.stringify({ before, after })}`,
    ).toBeLessThanOrEqual(maxGroupDriftPx);
  }
};

export const expectPhysicalDiceSeparated = async (
  rollPanel: Locator,
  options: {
    minDiceCount?: number;
    minNormalizedCenterDistance?: number;
    maxOverlapRatio?: number;
    minNormalizedCenterSpan?: number;
    minDieVisualSize?: number;
    minCanvasEdgeMargin?: number;
    minCanvasClientWidth?: number;
    minCanvasClientHeight?: number;
  } = {},
) => {
  const minDiceCount = options.minDiceCount ?? 2;
  const minNormalizedCenterDistance =
    options.minNormalizedCenterDistance ?? 0.72;
  const maxOverlapRatio = options.maxOverlapRatio ?? 0.45;
  const minNormalizedCenterSpan =
    options.minNormalizedCenterSpan ??
    Math.min(2.3, 0.64 * Math.max(1, minDiceCount - 1));

  const metrics = await rollPanel.evaluate((node) => {
    type Layout = {
      x: number;
      y: number;
      width: number;
      height: number;
      visualWidth?: number;
      visualHeight?: number;
    };
    type DebugDie = { layout?: Layout | null };
    type DebugSnapshot = {
      dice?: DebugDie[];
      canvas?: { clientWidth?: number; clientHeight?: number } | null;
    };
    const panel = node as HTMLElement;
    const debugRegistry =
      (
        window as typeof window & {
          __diceBoxThreeDebug?: Record<string, () => DebugSnapshot | null>;
        }
      ).__diceBoxThreeDebug ?? {};
    const canvases = Array.from(panel.querySelectorAll("canvas")).filter(
      (canvas): canvas is HTMLCanvasElement =>
        canvas instanceof HTMLCanvasElement,
    );
    const activeCanvas =
      canvases.find((canvas) => {
        const testId = canvas.dataset.testid;
        return Boolean(testId && typeof debugRegistry[testId] === "function");
      }) ??
      canvases[0] ??
      null;
    const group = panel.querySelector(
      '[data-testid="betrayal-house-dice-3d-group"]',
    ) as HTMLElement | null;
    const activeCanvasTestId =
      activeCanvas?.dataset.testid ?? group?.dataset.diceDebugKey;
    const snapshot = activeCanvasTestId
      ? (debugRegistry[activeCanvasTestId]?.() ?? null)
      : (debugRegistry["betrayal-house-dice-box-canvas"]?.() ?? null);
    const canvasClientWidth = snapshot?.canvas?.clientWidth ?? 0;
    const canvasClientHeight = snapshot?.canvas?.clientHeight ?? 0;
    const canvasRect = activeCanvas?.getBoundingClientRect();
    const displayScaleX =
      canvasRect && canvasClientWidth > 0
        ? canvasRect.width / canvasClientWidth
        : 1;
    const displayScaleY =
      canvasRect && canvasClientHeight > 0
        ? canvasRect.height / canvasClientHeight
        : 1;
    const layouts = (snapshot?.dice ?? [])
      .map((die) => die.layout)
      .filter(
        (layout): layout is Layout =>
          Boolean(layout) &&
          Number.isFinite(layout.x) &&
          Number.isFinite(layout.y) &&
          Number.isFinite(layout.width) &&
          Number.isFinite(layout.height),
      );

    const minDimensions = layouts.map((layout) =>
      Math.min(
        layout.visualWidth ?? layout.width,
        layout.visualHeight ?? layout.height,
      ),
    );
    const displayedMinDimensions = layouts.map((layout) =>
      Math.min(
        (layout.visualWidth ?? layout.width) * displayScaleX,
        (layout.visualHeight ?? layout.height) * displayScaleY,
      ),
    );
    const averageMinDimension = minDimensions.length
      ? minDimensions.reduce((sum, value) => sum + value, 0) /
        minDimensions.length
      : 0;
    const centerXs = layouts.map((layout) => layout.x);
    const centerYs = layouts.map((layout) => layout.y);
    const horizontalCenterSpan = centerXs.length
      ? Math.max(...centerXs) - Math.min(...centerXs)
      : 0;
    const verticalCenterSpan = centerYs.length
      ? Math.max(...centerYs) - Math.min(...centerYs)
      : 0;
    const normalizedCenterSpan =
      averageMinDimension > 0
        ? Math.hypot(horizontalCenterSpan, verticalCenterSpan) /
          averageMinDimension
        : 0;
    let minPairDistance = Number.POSITIVE_INFINITY;
    let minPairNormalizedCenterDistance = Number.POSITIVE_INFINITY;
    let maxPairOverlapRatio = 0;
    let minCanvasEdgeMargin = Number.POSITIVE_INFINITY;

    for (const layout of layouts) {
      const width = layout.visualWidth ?? layout.width;
      const height = layout.visualHeight ?? layout.height;
      minCanvasEdgeMargin = Math.min(
        minCanvasEdgeMargin,
        (layout.x - width / 2) * displayScaleX,
        (canvasClientWidth - (layout.x + width / 2)) * displayScaleX,
        (layout.y - height / 2) * displayScaleY,
        (canvasClientHeight - (layout.y + height / 2)) * displayScaleY,
      );
    }

    for (let leftIndex = 0; leftIndex < layouts.length; leftIndex += 1) {
      const left = layouts[leftIndex];
      const leftWidth = left.visualWidth ?? left.width;
      const leftHeight = left.visualHeight ?? left.height;
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < layouts.length;
        rightIndex += 1
      ) {
        const right = layouts[rightIndex];
        const rightWidth = right.visualWidth ?? right.width;
        const rightHeight = right.visualHeight ?? right.height;
        const centerDistance = Math.hypot(left.x - right.x, left.y - right.y);
        const pairAverageMinDimension =
          (Math.min(leftWidth, leftHeight) +
            Math.min(rightWidth, rightHeight)) /
          2;
        minPairDistance = Math.min(minPairDistance, centerDistance);
        minPairNormalizedCenterDistance = Math.min(
          minPairNormalizedCenterDistance,
          pairAverageMinDimension > 0
            ? centerDistance / pairAverageMinDimension
            : 0,
        );

        const overlapWidth = Math.max(
          0,
          Math.min(left.x + leftWidth / 2, right.x + rightWidth / 2) -
            Math.max(left.x - leftWidth / 2, right.x - rightWidth / 2),
        );
        const overlapHeight = Math.max(
          0,
          Math.min(left.y + leftHeight / 2, right.y + rightHeight / 2) -
            Math.max(left.y - leftHeight / 2, right.y - rightHeight / 2),
        );
        const smallerArea = Math.min(
          leftWidth * leftHeight,
          rightWidth * rightHeight,
        );
        maxPairOverlapRatio = Math.max(
          maxPairOverlapRatio,
          smallerArea > 0 ? (overlapWidth * overlapHeight) / smallerArea : 0,
        );
      }
    }

    return {
      hasSnapshot: Boolean(snapshot),
      activeCanvasTestId,
      diceCount: layouts.length,
      canvasClientWidth,
      canvasClientHeight,
      displayScaleX,
      displayScaleY,
      minDieVisualSize: displayedMinDimensions.length
        ? Math.min(...displayedMinDimensions)
        : 0,
      averageDieVisualSize: averageMinDimension,
      minCanvasEdgeMargin: Number.isFinite(minCanvasEdgeMargin)
        ? minCanvasEdgeMargin
        : 0,
      minPairDistance: Number.isFinite(minPairDistance) ? minPairDistance : 0,
      minNormalizedCenterDistance: Number.isFinite(
        minPairNormalizedCenterDistance,
      )
        ? minPairNormalizedCenterDistance
        : 0,
      maxOverlapRatio: maxPairOverlapRatio,
      normalizedCenterSpan,
      layouts: layouts.map((layout) => ({
        x: Math.round(layout.x),
        y: Math.round(layout.y),
        width: Math.round(layout.visualWidth ?? layout.width),
        height: Math.round(layout.visualHeight ?? layout.height),
      })),
    };
  });

  expect(
    metrics.hasSnapshot,
    `山屋骰盘必须暴露真实 Three.js 调试快照：${JSON.stringify(metrics)}`,
  ).toBe(true);
  expect(
    metrics.diceCount,
    `山屋骰盘必须显示期望数量的独立骰子：${JSON.stringify(metrics)}`,
  ).toBeGreaterThanOrEqual(minDiceCount);
  expect(
    metrics.canvasClientWidth,
    `山屋骰盘 canvas 必须有可见宽度：${JSON.stringify(metrics)}`,
  ).toBeGreaterThanOrEqual(options.minCanvasClientWidth ?? 300);
  expect(
    metrics.canvasClientHeight,
    `山屋骰盘 canvas 必须有可见高度：${JSON.stringify(metrics)}`,
  ).toBeGreaterThanOrEqual(options.minCanvasClientHeight ?? 210);
  if (typeof options.minDieVisualSize === "number") {
    expect(
      metrics.minDieVisualSize,
      `山屋骰子本体不能小到不可读：${JSON.stringify(metrics)}`,
    ).toBeGreaterThanOrEqual(options.minDieVisualSize);
  }
  if (typeof options.minCanvasEdgeMargin === "number") {
    expect(
      metrics.minCanvasEdgeMargin,
      `山屋骰子不能贴边或被裁切：${JSON.stringify(metrics)}`,
    ).toBeGreaterThanOrEqual(options.minCanvasEdgeMargin);
  }
  expect(
    metrics.minNormalizedCenterDistance,
    `山屋多骰不能中心塌缩或明显重叠：${JSON.stringify(metrics)}`,
  ).toBeGreaterThanOrEqual(minNormalizedCenterDistance);
  expect(
    metrics.maxOverlapRatio,
    `山屋多骰不能大面积互相覆盖：${JSON.stringify(metrics)}`,
  ).toBeLessThanOrEqual(maxOverlapRatio);
  expect(
    metrics.normalizedCenterSpan,
    `山屋多骰必须在骰盘内形成可辨散布：${JSON.stringify(metrics)}`,
  ).toBeGreaterThanOrEqual(minNormalizedCenterSpan);
};

function command<Type extends keyof BetrayalCommandMap>(
  type: Type,
  playerId: string,
  payload: BetrayalCommandMap[Type],
): BetrayalCommand {
  return {
    type,
    playerId,
    payload,
    timestamp: 100,
  } as Command<Type & string, BetrayalCommandMap[Type]> as BetrayalCommand;
}

export function createRuntimeCore(): BetrayalCore {
  return createStartedFirstScenarioCore(["0", "1", "2"]);
}

export function createFirstScenarioHauntRuntimeCore(): BetrayalCore {
  return createFirstScenarioHauntCore();
}

export function createMonsterEncounterCore(): BetrayalCore {
  return createBetrayalMonsterEncounterCore(["0", "1", "2"]);
}

export function createFirstScenarioSurvivorEndgameCore(): BetrayalCore {
  return playMummyScenarioToSurvivorVictory();
}

export function createFirstScenarioTraitorEndgameCore(): BetrayalCore {
  return playMummyScenarioToTraitorVictory();
}

export function createFirstScenarioReadyToExorciseRuntimeCore(): BetrayalCore {
  return createMummyReadyToBanishCore();
}

export function createCrimsonJackSurvivorEndgameCore(): BetrayalCore {
  return playFirstScenarioToSurvivorVictory();
}

export function createCrimsonJackTraitorEndgameCore(): BetrayalCore {
  return playFirstScenarioToTraitorVictory();
}

export function createCrimsonJackReadyToExorciseRuntimeCore(): BetrayalCore {
  return createFirstScenarioReadyToExorciseCore();
}

export function createFirstScenarioReadyToLearnAboutJackRuntimeCore(): BetrayalCore {
  return createFirstScenarioReadyToLearnAboutJackCore();
}

export function createFirstScenarioReadyToStudyExorcismRuntimeCore(): BetrayalCore {
  return createFirstScenarioReadyToStudyExorcismCore();
}

export function createTradeReadyRuntimeCore(): BetrayalCore {
  return createTradeReadyCore();
}

export function createDogTradeReadyRuntimeCore(): BetrayalCore {
  return createDogTradeReadyCore();
}

export function createExchangeReadyRuntimeCore(): BetrayalCore {
  return createExchangeReadyCore();
}

export function createMedicalKitUseReadyRuntimeCore(): BetrayalCore {
  return createMedicalKitUseReadyCore();
}

export function createToothNecklaceEndTurnRuntimeCore(): BetrayalCore {
  let core = createStartedFirstScenarioCore(["0", "1", "2"]);
  core = focusBetrayalE2EExplorer(core, "0");
  core.currentExplorer = {
    ...core.currentExplorer,
    inventory: [
      { id: "tooth-necklace", name: "牙齿项链", kind: "item" },
    ],
  };
  setBetrayalE2ETraitTrack(core, "0", "might", [1, 2, 3], 0, 1);
  setBetrayalE2ETraitTrack(core, "0", "speed", [1, 2, 3], 1, 1);
  setBetrayalE2ETraitTrack(core, "0", "knowledge", [1, 2, 3], 1, 1);
  setBetrayalE2ETraitTrack(core, "0", "sanity", [1, 2, 3], 1, 1);
  syncBetrayalE2ECurrentExplorer(core);
  core.usedCardIdsThisTurn = [];
  core.pendingEventChoice = null;
  core.latestDiscovery = null;
  core.latestDiscoveryOwnerPlayerId = null;
  core.recentRoll = null;
  core.recommendedAction = "endTurn";
  return core;
}

export function createHolyWaterUseReadyRuntimeCore(): BetrayalCore {
  return createHolyWaterUseReadyCore();
}

export function createSkeletonKeyMoveReadyRuntimeCore(): BetrayalCore {
  return createSkeletonKeyMoveReadyCore();
}

export function createMaskMoveReadyRuntimeCore(): BetrayalCore {
  return createMaskMoveReadyCore();
}

export function createHeroAttackTraitorReadyRuntimeCore(): BetrayalCore {
  return createHeroAttackTraitorReadyCore();
}

export function createFirstScenarioReadyToTraitorVictoryRuntimeCore(): BetrayalCore {
  return createFirstScenarioReadyToTraitorVictoryCore();
}

export function createCorpseLootReadyRuntimeCore(): BetrayalCore {
  return createCorpseLootReadyCore();
}

export function createDustNonTraitorCorpseLootRuntimeCore(): BetrayalCore {
  let core = createDustHauntCore(["0", "1", "2"]);
  core = focusBetrayalE2EExplorer(core, "2");
  core.currentExplorer = {
    ...core.currentExplorer,
    roomId: "hallway",
    inventory: [],
  };
  core.otherExplorers = core.otherExplorers.map((explorer) => {
    if (explorer.playerId === "1") {
      return {
        ...explorer,
        roomId: "hallway",
        inventory: [
          { id: "map", name: "地图", kind: "item" },
          { id: "omen-book", name: "书本", kind: "omen" },
        ],
      };
    }
    if (explorer.playerId === "0") {
      return { ...explorer, roomId: "entrance-hall" };
    }
    return explorer;
  });
  core.scenarioRuntime.deadExplorerPlayerIds = ["1"];
  core.scenarioRuntime.corpseLootedByPlayerIdsThisTurn = [];
  if (!core.scenarioRuntime.dust) {
    throw new Error("山屋灰尘非叛徒搜尸夹具缺少 dust 运行态");
  }
  core.scenarioRuntime.dust.permanentTraitorPlayerIds = ["0"];
  core.scenarioRuntime.dust.feverishPlayerIds =
    core.scenarioRuntime.dust.feverishPlayerIds.filter((id) => id !== "1");
  core.scenarioRuntime.dust.exchangedSicknessThisTurnPlayerIds = [];
  core.scenarioRuntime.dust.pendingSicknessExchange = undefined;
  core.pendingTradeAgreement = null;
  core.pendingDamageAllocation = null;
  core.usedCardIdsThisTurn = [];
  syncBetrayalE2ECurrentExplorer(core);
  core.activePlayerId = null;
  core.recommendedAction = "trade";
  return dismissBetrayalE2EBlockingOverlays(core);
}

export function createDustDeadTraitorBurialNoLootRuntimeCore(): BetrayalCore {
  let core = createDustHauntCore(["0", "1", "2"]);
  core = focusBetrayalE2EExplorer(core, "2");
  core.currentExplorer = {
    ...core.currentExplorer,
    roomId: "hallway",
    inventory: [],
  };
  core.otherExplorers = core.otherExplorers.map((explorer) => {
    if (explorer.playerId === "1") {
      return {
        ...explorer,
        roomId: "hallway",
        inventory: [],
      };
    }
    if (explorer.playerId === "0") {
      return { ...explorer, roomId: "entrance-hall" };
    }
    return explorer;
  });
  core.scenarioRuntime.deadExplorerPlayerIds = ["1"];
  core.scenarioRuntime.corpseLootedByPlayerIdsThisTurn = [];
  if (!core.scenarioRuntime.dust) {
    throw new Error("山屋灰尘死亡叛徒掩埋夹具缺少 dust 运行态");
  }
  core.scenarioRuntime.dust.permanentTraitorPlayerIds = ["1"];
  core.scenarioRuntime.dust.feverishPlayerIds = ["1"];
  core.scenarioRuntime.dust.exchangedSicknessThisTurnPlayerIds = [];
  core.scenarioRuntime.dust.pendingSicknessExchange = undefined;
  core.monsters = [
    ...core.monsters.filter((monster) => monster.id !== "feverish-1"),
    createBetrayalMonsterFromDefinition(
      "dust-feverish-patient",
      "feverish-1",
      "hallway",
    ),
  ];
  core.pendingTradeAgreement = null;
  core.pendingDamageAllocation = null;
  core.usedCardIdsThisTurn = [];
  syncBetrayalE2ECurrentExplorer(core);
  core.activePlayerId = null;
  core.recommendedAction = "trade";
  return dismissBetrayalE2EBlockingOverlays(core);
}

export function createJackSpiritReviveReadyRuntimeCore(): BetrayalCore {
  return createJackSpiritReviveReadyCore();
}

export function createJackSpiritNaturalMonsterTurnBeforeRollRuntimeCore(): BetrayalCore {
  return createJackSpiritNaturalMonsterTurnBeforeRollCore();
}

export function createJackSpiritMovementRollReadyRuntimeCore(): BetrayalCore {
  return createJackSpiritMovementRollReadyCore();
}

export function createJackSpiritPostReviveAttackReadyRuntimeCore(): BetrayalCore {
  return createJackSpiritPostReviveAttackReadyCore();
}

export function createDustFeverishNaturalMonsterTurnBeforeRollRuntimeCore(): BetrayalCore {
  return createDustFeverishNaturalMonsterTurnBeforeRollCore();
}

export function createDustFeverishAttackReadyRuntimeCore(): BetrayalCore {
  return createDustFeverishAttackReadyCore();
}

const BETRAYAL_E2E_TRAIT_KEYS: BetrayalTraitKey[] = [
  "might",
  "speed",
  "knowledge",
  "sanity",
];

function findBetrayalE2EExplorer(core: BetrayalCore, playerId: string) {
  const explorer = [core.currentExplorer, ...core.otherExplorers].find(
    (candidate) => candidate.playerId === playerId,
  );
  if (!explorer) {
    throw new Error(`山屋 E2E 夹具缺少玩家 ${playerId}`);
  }
  return explorer;
}

function cloneBetrayalE2EExplorer(
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

function focusBetrayalE2EExplorer(
  core: BetrayalCore,
  playerId: string,
): BetrayalCore {
  const explorers = [core.currentExplorer, ...core.otherExplorers].map(
    cloneBetrayalE2EExplorer,
  );
  const active = explorers.find((explorer) => explorer.playerId === playerId);
  if (!active) {
    throw new Error(`山屋 E2E 夹具不能切到缺失玩家 ${playerId}`);
  }
  core.currentPlayer = playerId;
  core.currentExplorer = active;
  core.otherExplorers = explorers.filter(
    (explorer) => explorer.playerId !== playerId,
  );
  core.activeRoomId = active.roomId;
  core.currentExplorerRoomId = active.roomId;
  core.currentExplorerTraits = { ...active.traits };
  core.currentExplorerInventory = active.inventory.map((card) => ({ ...card }));
  core.turnStartInventoryCardIds = active.inventory.map((card) => card.id);
  return core;
}

function syncBetrayalE2ECurrentExplorer(core: BetrayalCore): void {
  core.activeRoomId = core.currentExplorer.roomId;
  core.currentExplorerRoomId = core.currentExplorer.roomId;
  core.currentExplorerTraits = { ...core.currentExplorer.traits };
  core.currentExplorerInventory = core.currentExplorer.inventory.map((card) => ({
    ...card,
  }));
  core.turnStartInventoryCardIds = core.currentExplorer.inventory.map(
    (card) => card.id,
  );
}

function moveStrangeAmuletForHelpingHandsE2E(
  core: BetrayalCore,
  holderPlayerId: string | null,
): void {
  const explorers = [core.currentExplorer, ...core.otherExplorers];
  let strangeAmulet =
    explorers
      .flatMap((explorer) => explorer.inventory)
      .find((card) => card.id === "strange-amulet") ?? null;
  for (const explorer of explorers) {
    explorer.inventory = explorer.inventory.filter(
      (card) => card.id !== "strange-amulet",
    );
  }
  if (!holderPlayerId) {
    syncBetrayalE2ECurrentExplorer(core);
    return;
  }
  const holder = explorers.find(
    (explorer) => explorer.playerId === holderPlayerId,
  );
  if (!holder) {
    throw new Error(`山屋 E2E 夹具缺少奇异护符目标玩家 ${holderPlayerId}`);
  }
  strangeAmulet ??= { id: "strange-amulet", name: "奇异护符", kind: "item" };
  holder.inventory = [...holder.inventory, { ...strangeAmulet }];
  syncBetrayalE2ECurrentExplorer(core);
}

function setBetrayalE2ETraitTrack(
  core: BetrayalCore,
  playerId: string,
  trait: BetrayalTraitKey,
  values: number[],
  position: number,
  startPosition = 3,
): void {
  const explorer = findBetrayalE2EExplorer(core, playerId);
  explorer.traitTracks[trait] = {
    trackId: `e2e-${playerId}-${trait}`,
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

export function createDustEndTurnDamageAllocationRuntimeCore(): BetrayalCore {
  let core = createDustHauntCore();
  core = focusBetrayalE2EExplorer(core, "1");
  core.currentExplorer = {
    ...core.currentExplorer,
    roomId: "hallway",
  };
  core.otherExplorers = core.otherExplorers.map((explorer) =>
    explorer.playerId === "0"
      ? { ...explorer, roomId: "ground-north" }
      : { ...explorer, roomId: "entrance-hall" },
  );
  for (const trait of BETRAYAL_E2E_TRAIT_KEYS) {
    setBetrayalE2ETraitTrack(
      core,
      "1",
      trait,
      Array.from({ length: 16 }, () => 4),
      14,
      14,
    );
  }
  if (core.scenarioRuntime.dust) {
    core.scenarioRuntime.dust.exchangedSicknessThisTurnPlayerIds = [];
  }
  syncBetrayalE2ECurrentExplorer(core);
  core.activePlayerId = null;
  core.recommendedAction = "endTurn";
  return dismissBetrayalE2EBlockingOverlays(core);
}

export function createDustOrdinaryAttackDeathRuntimeCore(): BetrayalCore {
  let core = createDustHauntCore(["0", "1", "2"]);
  core = focusBetrayalE2EExplorer(core, "0");
  core.currentExplorer = {
    ...core.currentExplorer,
    roomId: "hallway",
  };
  core.otherExplorers = core.otherExplorers.map((explorer) => {
    if (explorer.playerId === "1") {
      return { ...explorer, roomId: "hallway" };
    }
    return { ...explorer, roomId: "entrance-hall" };
  });
  core.scenarioRuntime.deadExplorerPlayerIds = ["2"];
  if (!core.scenarioRuntime.dust) {
    throw new Error("山屋灰尘普通攻击致死夹具缺少 dust 运行态");
  }
  core.scenarioRuntime.dust.permanentTraitorPlayerIds = ["0", "1"];
  setBetrayalE2ETraitTrack(core, "0", "might", [2, 2], 0, 0);
  setBetrayalE2ETraitTrack(core, "1", "might", [1, 1, 1, 1, 1], 3, 3);
  setBetrayalE2ETraitTrack(core, "1", "speed", [1, 1, 1, 1, 1], 3, 3);
  syncBetrayalE2ECurrentExplorer(core);
  core.recommendedAction = "use";
  return dismissBetrayalE2EBlockingOverlays(core);
}

export type DustAttackWeaponE2ECardId = "hunting-knife" | "dagger" | "ring";

const DUST_ATTACK_WEAPON_E2E_CARDS: Record<
  DustAttackWeaponE2ECardId,
  BetrayalCore["currentExplorer"]["inventory"][number]
> = {
  "hunting-knife": { id: "hunting-knife", name: "砍刀", kind: "item" },
  dagger: { id: "dagger", name: "匕首", kind: "omen" },
  ring: { id: "ring", name: "指环", kind: "omen" },
};

export function createDustAttackWeaponDeathRuntimeCore(
  weaponCardId: DustAttackWeaponE2ECardId,
): BetrayalCore {
  let core = createDustHauntCore(["0", "1", "2"]);
  core = focusBetrayalE2EExplorer(core, "0");
  core.currentExplorer = {
    ...core.currentExplorer,
    roomId: "hallway",
    inventory: [DUST_ATTACK_WEAPON_E2E_CARDS[weaponCardId]],
  };
  core.currentExplorerInventory = core.currentExplorer.inventory.map((card) => ({
    ...card,
  }));
  core.turnStartInventoryCardIds = [weaponCardId];
  core.usedCardIdsThisTurn = core.usedCardIdsThisTurn.filter(
    (id) => id !== "haunt-attack" && id !== weaponCardId,
  );
  core.otherExplorers = core.otherExplorers.map((explorer) => {
    if (explorer.playerId === "1") {
      return {
        ...explorer,
        roomId: "hallway",
        inventory: [{ id: "map", name: "地图", kind: "item" }],
      };
    }
    return { ...explorer, roomId: "entrance-hall" };
  });
  core.scenarioRuntime.deadExplorerPlayerIds = ["2"];
  if (!core.scenarioRuntime.dust) {
    throw new Error("山屋灰尘武器攻击致死夹具缺少 dust 运行态");
  }
  core.scenarioRuntime.dust.permanentTraitorPlayerIds = ["0", "1"];
  setBetrayalE2ETraitTrack(core, "0", "might", [2], 0, 0);
  setBetrayalE2ETraitTrack(core, "0", "speed", [2, 3, 3], 2, 2);
  setBetrayalE2ETraitTrack(core, "0", "sanity", [2], 0, 0);
  const physicalDeathPosition = weaponCardId === "dagger" ? 7 : 4;
  const mentalDeathPosition = 3;
  const physicalDeathTrack = Array.from(
    { length: physicalDeathPosition + 1 },
    () => 1,
  );
  const mentalDeathTrack = Array.from(
    { length: mentalDeathPosition + 1 },
    () => 1,
  );
  setBetrayalE2ETraitTrack(core, "1", "might", physicalDeathTrack, physicalDeathPosition, physicalDeathPosition);
  setBetrayalE2ETraitTrack(core, "1", "speed", physicalDeathTrack, physicalDeathPosition, physicalDeathPosition);
  setBetrayalE2ETraitTrack(core, "1", "knowledge", mentalDeathTrack, mentalDeathPosition, mentalDeathPosition);
  setBetrayalE2ETraitTrack(core, "1", "sanity", mentalDeathTrack, mentalDeathPosition, mentalDeathPosition);
  syncBetrayalE2ECurrentExplorer(core);
  core.recommendedAction = "use";
  return dismissBetrayalE2EBlockingOverlays(core);
}

export function createDustRoomDamageDeathRuntimeCore(): BetrayalCore {
  let core = createDustHauntCore(["0", "1", "2"]);
  core = focusBetrayalE2EExplorer(core, "1");
  core.currentExplorer = {
    ...core.currentExplorer,
    roomId: "ground-north",
  };
  core.rooms = core.rooms.map((room) =>
    room.id === "ground-north"
      ? {
          ...room,
          state: "discovered",
          name: "火炉房",
          hint: "在此结束回合会受到房间伤害。",
          tags: ["伤害"],
          discoveryReward: null,
          visualId: "furnaceRoom",
          endTurnEffect: "physicalDamage1",
        }
      : room,
  );
  core.otherExplorers = core.otherExplorers.map((explorer) => {
    if (explorer.playerId === "0") {
      return { ...explorer, roomId: "entrance-hall" };
    }
    return { ...explorer, roomId: "hallway" };
  });
  if (!core.scenarioRuntime.dust) {
    throw new Error("山屋灰尘房间伤害致死夹具缺少 dust 运行态");
  }
  core.scenarioRuntime.dust.permanentTraitorPlayerIds = ["1"];
  core.scenarioRuntime.dust.exchangedSicknessThisTurnPlayerIds = ["1"];
  setBetrayalE2ETraitTrack(core, "1", "might", [1], 0, 0);
  setBetrayalE2ETraitTrack(core, "1", "speed", [1], 0, 0);
  syncBetrayalE2ECurrentExplorer(core);
  core.activePlayerId = null;
  core.recommendedAction = "endTurn";
  return dismissBetrayalE2EBlockingOverlays(core);
}

function createDustSkullDeathPreventionBaseRuntimeCore(): BetrayalCore {
  let core = createDustHauntCore(["0", "1", "2"]);
  core = focusBetrayalE2EExplorer(core, "1");
  core.currentExplorer = {
    ...core.currentExplorer,
    roomId: "hallway",
    inventory: [{ id: "skull", name: "头骨", kind: "omen" }],
  };
  core.otherExplorers = core.otherExplorers.map((explorer) =>
    explorer.playerId === "0"
      ? { ...explorer, roomId: "ground-north" }
      : { ...explorer, roomId: "entrance-hall" },
  );
  if (!core.scenarioRuntime.dust) {
    throw new Error("山屋灰尘头骨死亡保护夹具缺少 dust 运行态");
  }
  core.scenarioRuntime.dust.exchangedSicknessThisTurnPlayerIds = [];
  for (const trait of BETRAYAL_E2E_TRAIT_KEYS) {
    setBetrayalE2ETraitTrack(core, "1", trait, [1], 0, 0);
  }
  syncBetrayalE2ECurrentExplorer(core);
  core.activePlayerId = null;
  core.recommendedAction = "endTurn";
  return dismissBetrayalE2EBlockingOverlays(core);
}

export function createDustSkullDeathPreventionSuccessRuntimeCore(): BetrayalCore {
  const core = createDustSkullDeathPreventionBaseRuntimeCore();
  if (!core.scenarioRuntime.dust) {
    throw new Error("山屋灰尘头骨成功夹具缺少 dust 运行态");
  }
  core.scenarioRuntime.dust.permanentTraitorPlayerIds = ["1"];
  return core;
}

export function createDustSkullDeathPreventionFailedRuntimeCore(): BetrayalCore {
  const core = createDustSkullDeathPreventionBaseRuntimeCore();
  if (!core.scenarioRuntime.dust) {
    throw new Error("山屋灰尘头骨失败夹具缺少 dust 运行态");
  }
  core.scenarioRuntime.dust.permanentTraitorPlayerIds = ["1"];
  return core;
}

export function createDustRabbitFootDeathBurialRuntimeCore(): BetrayalCore {
  const core = createDustSkullDeathPreventionBaseRuntimeCore();
  core.currentExplorer = {
    ...core.currentExplorer,
    inventory: [
      { id: "skull", name: "头骨", kind: "omen" },
      { id: "rope", name: "兔脚", kind: "item" },
      { id: "map", name: "地图", kind: "item" },
    ],
  };
  if (!core.scenarioRuntime.dust) {
    throw new Error("山屋灰尘兔脚死亡回滚夹具缺少 dust 运行态");
  }
  core.scenarioRuntime.dust.permanentTraitorPlayerIds = ["1"];
  syncBetrayalE2ECurrentExplorer(core);
  return core;
}

export type DustActivePossessionE2ECardId =
  | "medical-kit"
  | "mirror"
  | "holy-water"
  | "map"
  | "notebook"
  | "journal"
  | "manuscript"
  | "mysterious-stopwatch"
  | "angel-feather"
  | "omen-book"
  | "mask";

export const DUST_ACTIVE_POSSESSION_E2E_CARDS: Record<
  DustActivePossessionE2ECardId,
  BetrayalCore["currentExplorer"]["inventory"][number]
> = {
  "medical-kit": { id: "medical-kit", name: "急救包", kind: "item" },
  mirror: { id: "mirror", name: "镜子", kind: "item" },
  "holy-water": { id: "holy-water", name: "奇怪的药品", kind: "item" },
  map: { id: "map", name: "地图", kind: "item" },
  notebook: { id: "notebook", name: "笔记本", kind: "item" },
  journal: { id: "journal", name: "日记", kind: "item" },
  manuscript: { id: "manuscript", name: "手稿", kind: "item" },
  "mysterious-stopwatch": {
    id: "mysterious-stopwatch",
    name: "神秘秒表",
    kind: "item",
  },
  "angel-feather": { id: "angel-feather", name: "天使之羽", kind: "item" },
  "omen-book": { id: "omen-book", name: "书本", kind: "omen" },
  mask: { id: "mask", name: "面具", kind: "omen" },
};

export function createDustActivePossessionRuntimeCore(
  cardIds: DustActivePossessionE2ECardId[] = [
    "medical-kit",
    "mirror",
    "holy-water",
    "map",
    "notebook",
    "journal",
    "manuscript",
    "mysterious-stopwatch",
    "angel-feather",
    "omen-book",
    "mask",
  ],
): BetrayalCore {
  let core = createDustHauntCore(["0", "1", "2"]);
  core = focusBetrayalE2EExplorer(core, "1");
  core.currentExplorer = {
    ...core.currentExplorer,
    roomId: "hallway",
    inventory: cardIds.map((cardId) => ({
      ...DUST_ACTIVE_POSSESSION_E2E_CARDS[cardId],
    })),
  };
  core.otherExplorers = core.otherExplorers.map((explorer) => {
    if (explorer.playerId === "0") {
      return {
        ...explorer,
        roomId: "hallway",
        inventory: [],
      };
    }
    if (explorer.playerId === "2") {
      return {
        ...explorer,
        roomId: "upper-landing",
        inventory: [],
      };
    }
    return { ...explorer, inventory: [] };
  });
  for (const playerId of ["0", "1"]) {
    for (const trait of BETRAYAL_E2E_TRAIT_KEYS) {
      setBetrayalE2ETraitTrack(core, playerId, trait, [1, 2, 3, 4, 5], 1, 3);
    }
  }
  if (!core.scenarioRuntime.dust) {
    throw new Error("山屋灰尘主动持有牌夹具缺少 dust 运行态");
  }
  core.scenarioRuntime.dust.permanentTraitorPlayerIds = ["0"];
  core.scenarioRuntime.dust.exchangedSicknessThisTurnPlayerIds = [];
  core.scenarioRuntime.dust.pendingSicknessExchange = undefined;
  core.monsters = [
    ...core.monsters.filter(
      (monster) => monster.id !== "feverish-active-possession-1",
    ),
    createBetrayalMonsterFromDefinition(
      "dust-feverish-patient",
      "feverish-active-possession-1",
      "hallway",
    ),
  ];
  core.pendingTradeAgreement = null;
  core.pendingDamageAllocation = null;
  core.pendingCardResolutionQueue = [];
  core.usedCardIdsThisTurn = [];
  core.activePlayerId = null;
  core.recommendedAction = "use";
  syncBetrayalE2ECurrentExplorer(core);
  return dismissBetrayalE2EBlockingOverlays(core);
}

export function createDustForcedSicknessExchangeRuntimeCore(): BetrayalCore {
  let core = createDustHauntCore(["0", "1", "2", "3"]);
  core = focusBetrayalE2EExplorer(core, "1");
  core.currentExplorer = {
    ...core.currentExplorer,
    roomId: "hallway",
  };
  core.otherExplorers = core.otherExplorers.map((explorer) => {
    if (explorer.playerId === "0" || explorer.playerId === "2") {
      return { ...explorer, roomId: "hallway" };
    }
    return { ...explorer, roomId: "entrance-hall" };
  });
  if (!core.scenarioRuntime.dust) {
    throw new Error("山屋灰尘强制交换夹具缺少 dust 运行态");
  }
  core.scenarioRuntime.dust.sicknessTokensByPlayerId = {
    "0": [
      { id: "sickness-0-a", value: 1 },
      { id: "sickness-0-b", value: 7 },
      { id: "sickness-0-c", value: 8 },
    ],
    "1": [
      { id: "sickness-1-a", value: 4 },
      { id: "sickness-1-b", value: 5 },
      { id: "sickness-1-c", value: 6 },
    ],
    "2": [
      { id: "sickness-2-a", value: 9 },
      { id: "sickness-2-b", value: 10 },
      { id: "sickness-2-c", value: 11 },
    ],
    "3": [
      { id: "sickness-3-a", value: 12 },
      { id: "sickness-3-b", value: 13 },
      { id: "sickness-3-c", value: 14 },
    ],
  };
  core.scenarioRuntime.dust.permanentTraitorPlayerIds = ["0"];
  core.scenarioRuntime.dust.exchangedSicknessThisTurnPlayerIds = [];
  core.scenarioRuntime.dust.pendingSicknessExchange = undefined;
  syncBetrayalE2ECurrentExplorer(core);
  core.activePlayerId = null;
  core.recommendedAction = "endTurn";
  return dismissBetrayalE2EBlockingOverlays(core);
}

export function createDustDogTradeSicknessSplitRuntimeCore(): BetrayalCore {
  let core = createDustHauntCore(["0", "1", "2"]);
  core = focusBetrayalE2EExplorer(core, "1");
  core.currentExplorer = {
    ...core.currentExplorer,
    roomId: "entrance-hall",
    inventory: [
      { id: "dog", name: "狗", kind: "omen" },
      { id: "medical-kit", name: "急救包", kind: "item" },
      { id: "map", name: "地图", kind: "item" },
    ],
  };
  core.otherExplorers = core.otherExplorers.map((explorer) => {
    if (explorer.playerId === "0") {
      return { ...explorer, roomId: "upper-landing", inventory: [] };
    }
    if (explorer.playerId === "2") {
      return { ...explorer, roomId: "entrance-hall", inventory: [] };
    }
    return { ...explorer, inventory: [] };
  });
  if (core.scenarioRuntime.dust) {
    core.scenarioRuntime.dust.exchangedSicknessThisTurnPlayerIds = [];
    core.scenarioRuntime.dust.pendingSicknessExchange = undefined;
  }
  core.activePlayerId = null;
  core.pendingTradeAgreement = null;
  core.pendingCardResolutionQueue = [];
  core.usedCardIdsThisTurn = [];
  core.recommendedAction = "trade";
  syncBetrayalE2ECurrentExplorer(core);
  return dismissBetrayalE2EBlockingOverlays(core);
}

export function createDustControlImpulsesSicknessExchangeRuntimeCore(): BetrayalCore {
  let core = createDustHauntCore(["0", "1", "2"]);
  core = focusBetrayalE2EExplorer(core, "1");
  core.currentExplorer = {
    ...core.currentExplorer,
    roomId: "hallway",
  };
  core.otherExplorers = core.otherExplorers.map((explorer) =>
    explorer.playerId === "0"
      ? { ...explorer, roomId: "hallway" }
      : { ...explorer, roomId: "entrance-hall" },
  );
  if (!core.scenarioRuntime.dust) {
    throw new Error("山屋灰尘控制冲动夹具缺少 dust 运行态");
  }
  core.scenarioRuntime.dust.sicknessTokensByPlayerId = {
    "0": [
      { id: "sickness-0-a", value: 1 },
      { id: "sickness-0-b", value: 7 },
      { id: "sickness-0-c", value: 8 },
    ],
    "1": [
      { id: "sickness-1-a", value: 4 },
      { id: "sickness-1-b", value: 5 },
      { id: "sickness-1-c", value: 6 },
    ],
    "2": [
      { id: "sickness-2-a", value: 9 },
      { id: "sickness-2-b", value: 10 },
      { id: "sickness-2-c", value: 11 },
    ],
  };
  core.scenarioRuntime.dust.permanentTraitorPlayerIds = ["0"];
  core.scenarioRuntime.dust.exchangedSicknessThisTurnPlayerIds = [];
  core.scenarioRuntime.dust.pendingSicknessExchange = undefined;
  syncBetrayalE2ECurrentExplorer(core);
  core.activePlayerId = null;
  core.recommendedAction = "trade";
  return dismissBetrayalE2EBlockingOverlays(core);
}

export function createDustFailedActionSicknessExchangeRuntimeCore(): BetrayalCore {
  let core = createDustHauntCore(["0", "1", "2", "3"]);
  core = focusBetrayalE2EExplorer(core, "1");
  core.currentExplorer = {
    ...core.currentExplorer,
    roomId: "ground-north",
  };
  core.rooms = core.rooms.map((room) =>
    room.id === "ground-north"
      ? {
          ...room,
          state: "discovered",
          name: "画廊",
          hint: "灰尘失败行动交换 E2E 恶兆板块",
          tags: ["恶兆"],
          discoveryReward: "omen",
          visualId: "gallery",
        }
      : room,
  );
  core.otherExplorers = core.otherExplorers.map((explorer) => {
    if (explorer.playerId === "0") {
      return { ...explorer, roomId: "entrance-hall" };
    }
    if (explorer.playerId === "2") {
      return { ...explorer, roomId: "hallway" };
    }
    if (explorer.playerId === "3") {
      return { ...explorer, roomId: "upper-landing" };
    }
    return explorer;
  });
  if (!core.scenarioRuntime.dust) {
    throw new Error("山屋灰尘失败行动交换夹具缺少 dust 运行态");
  }
  core.scenarioRuntime.deadExplorerPlayerIds = ["2"];
  core.scenarioRuntime.dust.sicknessTokensByPlayerId = {
    "0": [
      { id: "sickness-0-a", value: 7 },
      { id: "sickness-0-b", value: 8 },
      { id: "sickness-0-c", value: 9 },
    ],
    "1": [
      { id: "sickness-1-a", value: 4 },
      { id: "sickness-1-b", value: 5 },
      { id: "sickness-1-c", value: 6 },
    ],
    "2": [
      { id: "sickness-2-a", value: 12 },
      { id: "sickness-2-b", value: 13 },
      { id: "sickness-2-c", value: 14 },
    ],
    "3": [
      { id: "sickness-3-a", value: 1 },
      { id: "sickness-3-b", value: 10 },
      { id: "sickness-3-c", value: 11 },
    ],
  };
  core.scenarioRuntime.dust.permanentTraitorPlayerIds = ["3"];
  core.scenarioRuntime.dust.exchangedSicknessThisTurnPlayerIds = [];
  core.scenarioRuntime.dust.pendingSicknessExchange = undefined;
  core.scenarioRuntime.dust.researchRoomIds = [];
  setBetrayalE2ETraitTrack(core, "1", "knowledge", [1, 2, 3], 2, 2);
  setBetrayalE2ETraitTrack(core, "1", "sanity", [1, 2, 3], 2, 2);
  syncBetrayalE2ECurrentExplorer(core);
  core.activePlayerId = null;
  core.recommendedAction = "use";
  return dismissBetrayalE2EBlockingOverlays(core);
}

export function createDustResearchAndCureSuccessRuntimeCore(): BetrayalCore {
  let core = createDustHauntCore(["0", "1", "2"]);
  core = focusBetrayalE2EExplorer(core, "1");
  core.currentExplorer = {
    ...core.currentExplorer,
    roomId: "ground-north",
  };
  core.rooms = core.rooms.map((room) =>
    room.id === "ground-north"
      ? {
          ...room,
          state: "discovered",
          name: "画廊",
          hint: "灰尘研究治愈 E2E 恶兆板块",
          tags: ["恶兆"],
          discoveryReward: "omen",
          visualId: "gallery",
        }
      : room,
  );
  core.otherExplorers = core.otherExplorers.map((explorer) => {
    if (explorer.playerId === "0") {
      return { ...explorer, roomId: "entrance-hall" };
    }
    if (explorer.playerId === "2") {
      return { ...explorer, roomId: "hallway" };
    }
    return explorer;
  });
  if (!core.scenarioRuntime.dust) {
    throw new Error("山屋灰尘研究治愈夹具缺少 dust 运行态");
  }
  core.scenarioRuntime.dust.sicknessTokensByPlayerId = {
    "0": [
      { id: "sickness-0-a", value: 1 },
      { id: "sickness-0-b", value: 7 },
      { id: "sickness-0-c", value: 8 },
    ],
    "1": [
      { id: "sickness-1-a", value: 4 },
      { id: "sickness-1-b", value: 5 },
      { id: "sickness-1-c", value: 6 },
    ],
    "2": [
      { id: "sickness-2-a", value: 9 },
      { id: "sickness-2-b", value: 10 },
      { id: "sickness-2-c", value: 11 },
    ],
  };
  core.scenarioRuntime.dust.permanentTraitorPlayerIds = ["0"];
  core.scenarioRuntime.dust.exchangedSicknessThisTurnPlayerIds = [];
  core.scenarioRuntime.dust.pendingSicknessExchange = undefined;
  core.scenarioRuntime.dust.researchRoomIds = [];
  setBetrayalE2ETraitTrack(
    core,
    "1",
    "knowledge",
    Array.from({ length: 8 }, () => 6),
    3,
    3,
  );
  setBetrayalE2ETraitTrack(
    core,
    "1",
    "sanity",
    Array.from({ length: 8 }, () => 6),
    3,
    3,
  );
  syncBetrayalE2ECurrentExplorer(core);
  core.activePlayerId = null;
  core.recommendedAction = "use";
  return dismissBetrayalE2EBlockingOverlays(core);
}

export function createDustMultiResearchCureTraitChoiceRuntimeCore(): BetrayalCore {
  let core = createDustHauntCore(["0", "1", "2"]);
  core = focusBetrayalE2EExplorer(core, "1");
  core.currentExplorer = {
    ...core.currentExplorer,
    roomId: "ground-north",
  };
  core.rooms = core.rooms.map((room) => {
    if (room.id === "ground-north") {
      return {
        ...room,
        state: "discovered",
        name: "画廊",
        hint: "灰尘属性选择 E2E 恶兆板块",
        tags: ["恶兆"],
        discoveryReward: "omen",
        visualId: "gallery",
      };
    }
    if (room.id === "hallway") {
      return {
        ...room,
        state: "discovered",
        name: "门厅",
        hint: "灰尘属性选择 E2E 已研究板块",
      };
    }
    if (room.id === "entrance-hall") {
      return {
        ...room,
        state: "discovered",
        name: "入口大厅",
        hint: "灰尘属性选择 E2E 已研究板块",
      };
    }
    return room;
  });
  core.otherExplorers = core.otherExplorers.map((explorer) => {
    if (explorer.playerId === "0") {
      return { ...explorer, roomId: "entrance-hall" };
    }
    if (explorer.playerId === "2") {
      return { ...explorer, roomId: "hallway" };
    }
    return explorer;
  });
  if (!core.scenarioRuntime.dust) {
    throw new Error("山屋灰尘属性选择夹具缺少 dust 运行态");
  }
  core.scenarioRuntime.dust.sicknessTokensByPlayerId = {
    "0": [
      { id: "sickness-0-a", value: 1 },
      { id: "sickness-0-b", value: 7 },
      { id: "sickness-0-c", value: 8 },
    ],
    "1": [
      { id: "sickness-1-a", value: 4 },
      { id: "sickness-1-b", value: 5 },
      { id: "sickness-1-c", value: 6 },
    ],
    "2": [
      { id: "sickness-2-a", value: 9 },
      { id: "sickness-2-b", value: 10 },
      { id: "sickness-2-c", value: 11 },
    ],
  };
  core.scenarioRuntime.dust.permanentTraitorPlayerIds = ["0"];
  core.scenarioRuntime.dust.exchangedSicknessThisTurnPlayerIds = [];
  core.scenarioRuntime.dust.pendingSicknessExchange = undefined;
  core.scenarioRuntime.dust.researchRoomIds = [
    "ground-north",
    "hallway",
    "entrance-hall",
  ];
  setBetrayalE2ETraitTrack(core, "1", "might", [6], 0, 0);
  setBetrayalE2ETraitTrack(core, "1", "speed", [4], 0, 0);
  setBetrayalE2ETraitTrack(core, "1", "knowledge", [2], 0, 0);
  setBetrayalE2ETraitTrack(core, "1", "sanity", [2], 0, 0);
  syncBetrayalE2ECurrentExplorer(core);
  core.activePlayerId = null;
  core.recommendedAction = "use";
  return dismissBetrayalE2EBlockingOverlays(core);
}

export function createDustSicknessPrivacyRuntimeCore(): BetrayalCore {
  let core = createDustHauntCore(["0", "1", "2"]);
  core = focusBetrayalE2EExplorer(core, "1");
  if (!core.scenarioRuntime.dust) {
    throw new Error("山屋灰尘隐私夹具缺少 dust 运行态");
  }
  core.scenarioRuntime.dust.sicknessTokensByPlayerId = {
    "0": [
      { id: "sickness-0-a", value: 1 },
      { id: "sickness-0-b", value: 4 },
      { id: "sickness-0-c", value: 8 },
    ],
    "1": [
      { id: "sickness-1-a", value: 2 },
      { id: "sickness-1-b", value: 3 },
      { id: "sickness-1-c", value: 5 },
    ],
    "2": [
      { id: "sickness-2-a", value: 6 },
      { id: "sickness-2-b", value: 7 },
      { id: "sickness-2-c", value: 9 },
    ],
  };
  core.scenarioRuntime.dust.permanentTraitorPlayerIds = ["0"];
  core.scenarioRuntime.dust.exchangedSicknessThisTurnPlayerIds = [];
  core.scenarioRuntime.dust.pendingSicknessExchange = undefined;
  syncBetrayalE2ECurrentExplorer(core);
  core.activePlayerId = null;
  core.recommendedAction = "use";
  return dismissBetrayalE2EBlockingOverlays(core);
}

function dismissBetrayalE2EBlockingOverlays(core: BetrayalCore): BetrayalCore {
  core.latestDiscovery = null;
  core.latestDiscoveryOwnerPlayerId = null;
  core.pendingEventChoice = null;
  core.recentRoll = null;
  return core;
}

function isMagicCameraE2ECard(card: { id: string; name: string }): boolean {
  return card.id === "camera" || card.name === "魔法相机";
}

function removeMagicCameraFromE2EExplorer(
  explorer: BetrayalCore["currentExplorer"],
): BetrayalCore["currentExplorer"] {
  return {
    ...explorer,
    inventory: explorer.inventory.filter((card) => !isMagicCameraE2ECard(card)),
  };
}

export function createMagicCameraHauntRuntimeCore(
  cameraOwnerPlayerId: string | null = "1",
): BetrayalCore {
  let core = createStartedFirstScenarioCore(["0", "1", "2"]);
  const magicCameraEvent = BETRAYAL_DISCOVERY_POOLS.events.find(
    (event) => event.name === "说“茄子”！",
  );
  if (!magicCameraEvent) {
    throw new Error("山屋 E2E 夹具缺少作祟 33 事件：说“茄子”！");
  }

  core.drawOrder = ["event"];
  core.eventOrder = [magicCameraEvent];
  core.currentExplorer = removeMagicCameraFromE2EExplorer(core.currentExplorer);
  core.otherExplorers = core.otherExplorers.map(removeMagicCameraFromE2EExplorer);
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
  core.currentExplorerInventory = core.currentExplorer.inventory.map((card) => ({
    ...card,
  }));
  core.currentExplorerTraits = { ...core.currentExplorer.traits };
  core.otherExplorers = core.otherExplorers.map((explorer) =>
    explorer.playerId === cameraOwnerPlayerId
      ? {
          ...explorer,
          inventory: [
            ...explorer.inventory,
            { id: "camera", name: "魔法相机", kind: "item" },
          ],
        }
      : explorer,
  );
  if (!cameraOwnerPlayerId) {
    core.possessionOrderByKind.item = [
      { id: "camera", name: "魔法相机", kind: "item" },
      ...core.possessionOrderByKind.item.filter(
        (card) => !isMagicCameraE2ECard(card),
      ),
    ];
  }

  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, "0", {
    roomId: "hallway",
  });
  core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.EXPLORE_ROOM, "0", {
    roomId: "ground-north",
  });
  core = applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.RESOLVE_EVENT_CHOICE,
    "0",
    { accept: true },
    100,
    createBetrayalScriptedRandom(3, 3, 3),
  );
  core.recommendedAction = "use";
  return dismissBetrayalE2EBlockingOverlays(core);
}

function createHelpingHandsHauntRuntimeCore(
  playerIds: string[] = ["0", "1", "2"],
): BetrayalCore {
  let core = createStartedFirstScenarioCore(playerIds);
  const helpingHandsEvent = BETRAYAL_DISCOVERY_POOLS.events.find(
    (event) => event.name === "大宅饿了",
  );
  if (!helpingHandsEvent) {
    throw new Error("山屋 E2E 夹具缺少作祟 12 事件：大宅饿了");
  }

  core.drawOrder = ["event"];
  core.eventOrder = [helpingHandsEvent];
  core.currentExplorer.inventory = [
    ...core.currentExplorer.inventory,
    { id: "omen-book", name: "书本", kind: "omen" },
    { id: "dog", name: "狗", kind: "omen" },
    { id: "mask", name: "面具", kind: "omen" },
  ];
  core.currentExplorer.traits = {
    ...core.currentExplorer.traits,
    might: 5,
    sanity: 5,
  };
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
  core = applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.RESOLVE_EVENT_CHOICE,
    "0",
    { accept: true },
    100,
    createBetrayalScriptedRandom(3, 3, 3),
  );
  core.recommendedAction = "use";
  return dismissBetrayalE2EBlockingOverlays(core);
}

export function createHelpingHandsPendingRewardRuntimeCore(): BetrayalCore {
  let core = createHelpingHandsHauntRuntimeCore(["0", "1", "2"]);
  core = focusBetrayalE2EExplorer(core, "0");
  core.currentExplorer = {
    ...core.currentExplorer,
    roomId: "entrance-hall",
    inventory: [
      ...core.currentExplorer.inventory.filter((card) => card.id !== "rope"),
      { id: "rope", name: "兔脚", kind: "item" },
    ],
    traits: {
      ...core.currentExplorer.traits,
      might: 5,
    },
  };
  core.otherExplorers = core.otherExplorers.map((explorer) =>
    explorer.playerId === "1"
      ? {
          ...explorer,
          roomId: "entrance-hall",
          inventory: [{ id: "medical-kit", name: "急救包", kind: "item" }],
          traits: {
            ...explorer.traits,
            might: 1,
          },
        }
      : explorer,
  );
  core.activeRoomId = "entrance-hall";
  core.currentExplorerRoomId = "entrance-hall";
  core.currentExplorerTraits = { ...core.currentExplorer.traits };
  core.currentExplorerInventory = core.currentExplorer.inventory.map((card) => ({
    ...card,
  }));
  core.turnStartInventoryCardIds = core.currentExplorer.inventory.map(
    (card) => card.id,
  );
  core = applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.HAUNT_ATTACK,
    "0",
    { target: "hero", targetPlayerId: "1" },
    100,
    createBetrayalScriptedRandom(3, 3, 3, 3, 3, 1, 1, 1, 1, 1),
  );
  return core;
}

export function createHelpingHandsTrollHandAttackRuntimeCore(): BetrayalCore {
  let core = createHelpingHandsHauntRuntimeCore(["0", "1", "2"]);
  core = focusBetrayalE2EExplorer(core, "0");
  const sharedRoomId = "entrance-hall";
  const trollHandIds = core.scenarioRuntime.helpingHands?.trollHandIds ?? [];
  core.monsters = core.monsters.map((monster) =>
    trollHandIds.includes(monster.id)
      ? { ...monster, roomId: sharedRoomId }
      : monster,
  );
  core.currentExplorer = {
    ...core.currentExplorer,
    roomId: "hallway",
  };
  core.otherExplorers = core.otherExplorers.map((explorer) =>
    explorer.playerId === "1"
      ? { ...explorer, roomId: sharedRoomId }
      : explorer,
  );
  for (const trait of BETRAYAL_E2E_TRAIT_KEYS) {
    setBetrayalE2ETraitTrack(
      core,
      "1",
      trait,
      [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
      10,
      10,
    );
  }
  core.activeRoomId = sharedRoomId;
  core.currentExplorerRoomId = core.currentExplorer.roomId;
  core.currentExplorerTraits = { ...core.currentExplorer.traits };
  core.currentExplorerInventory = core.currentExplorer.inventory.map((card) => ({
    ...card,
  }));
  core.recommendedAction = "use";
  return startHelpingHandsMonsterTurnForE2E(core);
}

function startHelpingHandsMonsterTurnForE2E(core: BetrayalCore): BetrayalCore {
  core = focusBetrayalE2EExplorer(core, "0");
  return applyBetrayalCommand(
    core,
    BETRAYAL_COMMANDS.END_TURN,
    "0",
    {},
    100,
    createBetrayalScriptedRandom(1, 2, 3),
  );
}

function placeHelpingHandsTrollHandsAndTargets(
  core: BetrayalCore,
  currentPlayerId: string,
): BetrayalCore {
  const sharedRoomId = "entrance-hall";
  const trollHandIds = core.scenarioRuntime.helpingHands?.trollHandIds ?? [];
  core.monsters = core.monsters.map((monster) =>
    trollHandIds.includes(monster.id)
      ? { ...monster, roomId: sharedRoomId }
      : monster,
  );
  core = focusBetrayalE2EExplorer(core, currentPlayerId);
  core.currentExplorer = {
    ...core.currentExplorer,
    roomId: currentPlayerId === "0" ? "hallway" : sharedRoomId,
  };
  core.otherExplorers = core.otherExplorers.map((explorer) =>
    explorer.playerId === "2"
      ? { ...explorer, roomId: sharedRoomId }
      : explorer.playerId === "1"
        ? { ...explorer, roomId: sharedRoomId }
        : { ...explorer, roomId: "hallway" },
  );
  syncBetrayalE2ECurrentExplorer(core);
  core.recommendedAction = "use";
  return core;
}

export function createHelpingHandsTransferredAmuletOldHolderRuntimeCore(): BetrayalCore {
  let core = createHelpingHandsHauntRuntimeCore(["0", "1", "2"]);
  moveStrangeAmuletForHelpingHandsE2E(core, "1");
  core = placeHelpingHandsTrollHandsAndTargets(core, "0");
  return startHelpingHandsMonsterTurnForE2E(core);
}

export function createHelpingHandsTransferredAmuletControllerRuntimeCore(): BetrayalCore {
  let core = createHelpingHandsHauntRuntimeCore(["0", "1", "2"]);
  moveStrangeAmuletForHelpingHandsE2E(core, "1");
  core = placeHelpingHandsTrollHandsAndTargets(core, "1");
  return startHelpingHandsMonsterTurnForE2E(core);
}

export function createHelpingHandsNoAmuletRuntimeCore(): BetrayalCore {
  let core = createHelpingHandsHauntRuntimeCore(["0", "1", "2"]);
  moveStrangeAmuletForHelpingHandsE2E(core, null);
  core = placeHelpingHandsTrollHandsAndTargets(core, "0");
  return core;
}

export const injectCore = async (page: Page, core: BetrayalCore) => {
  await page.evaluate((nextCore) => {
    const harness = (window as BetrayalHarnessWindow).__BG_TEST_HARNESS__;
    const state = harness?.state;
    const snapshot = state?.get?.();
    if (!snapshot || !state?.set) {
      throw new Error("betrayal test harness state injector unavailable");
    }
    return state.set({ ...snapshot, core: nextCore });
  }, core);
};

export const dispatchHarnessCommand = async <
  Type extends keyof BetrayalCommandMap,
>(
  page: Page,
  type: Type,
  playerId: string,
  payload: BetrayalCommandMap[Type],
) => {
  await waitForBetrayalHarnessCommand(page);
  await page.evaluate(
    async ({ nextCommand }) => {
      const harness = (window as BetrayalHarnessWindow).__BG_TEST_HARNESS__;
      if (!harness?.command?.dispatch) {
        throw new Error("betrayal test harness command dispatcher unavailable");
      }
      await harness.command.dispatch(nextCommand);
    },
    {
      nextCommand: command(type, playerId, payload),
    },
  );
};

export const setHarnessRandomQueue = async (page: Page, values: number[]) => {
  await page.evaluate((queueValues) => {
    const harness = (window as BetrayalHarnessWindow).__BG_TEST_HARNESS__;
    if (!harness?.random?.setQueue) {
      throw new Error("betrayal test harness random queue unavailable");
    }
    harness.random.setQueue(queueValues);
  }, values);
};
