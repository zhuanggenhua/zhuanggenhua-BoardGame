import { mkdir, readdir, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import {
    assertNoFatalFrontendErrors,
    attachPageDiagnostics,
    initContext,
    waitForFrontendAssets,
    waitForTestHarness,
} from '../helpers/common';

const SCREENSHOT_DIR = 'test-results/evidence-screenshots/mage-wars/tutorial-flow-sync';
const INTRO_SCREENSHOT_PATH = `${SCREENSHOT_DIR}/00-intro-board-and-win.png`;
const SELF_HUD_SCREENSHOT_PATH = `${SCREENSHOT_DIR}/01-read-self-hud-life-mana-channeling.png`;
const OPPONENT_HUD_SCREENSHOT_PATH = `${SCREENSHOT_DIR}/02-read-opponent-hud-hidden-plans.png`;
const STAGE_SCREENSHOT_PATH = `${SCREENSHOT_DIR}/03-read-round-stage.png`;
const CHANNEL_RESULT_SCREENSHOT_PATH = `${SCREENSHOT_DIR}/04-channel-result-mana-increased.png`;
const SPELL_CARD_READING_SCREENSHOT_PATH = `${SCREENSHOT_DIR}/05-read-spell-card-legend.png`;
const PLAN_OPEN_CREATURE_CATEGORY_SCREENSHOT_PATH = `${SCREENSHOT_DIR}/06-plan-open-creature-category.png`;
const PLAN_CREATURE_NEXT_PAGE_SCREENSHOT_PATH = `${SCREENSHOT_DIR}/07-plan-creature-next-page-wolf-hidden.png`;
const PLAN_SELECT_WOLF_SCREENSHOT_PATH = `${SCREENSHOT_DIR}/08-plan-select-wolf-visible.png`;
const PLAN_OPEN_INCANTATION_CATEGORY_SCREENSHOT_PATH = `${SCREENSHOT_DIR}/09-plan-wolf-in-slot-one-open-incantation-category.png`;
const PLAN_INCANTATION_NEXT_PAGE_SCREENSHOT_PATH = `${SCREENSHOT_DIR}/10-plan-incantation-next-page-rouse-hidden.png`;
const PLAN_SELECT_ROUSE_SCREENSHOT_PATH = `${SCREENSHOT_DIR}/11-plan-rouse-visible.png`;
const PLAN_CONFIRM_SCREENSHOT_PATH = `${SCREENSHOT_DIR}/12-plan-rouse-in-slot-two-confirm.png`;
const PREPARED_HIDDEN_SCREENSHOT_PATH = `${SCREENSHOT_DIR}/13-prepared-and-hidden.png`;
const DEPLOY_SELECT_WOLF_SCREENSHOT_PATH = `${SCREENSHOT_DIR}/14-deploy-select-wolf-prepared-card.png`;
const DEPLOY_TARGET_ZONE_SCREENSHOT_PATH = `${SCREENSHOT_DIR}/15-deploy-target-zone-highlight.png`;
const WOLF_SUMMONED_SCREENSHOT_PATH = `${SCREENSHOT_DIR}/16-wolf-summoned-not-ready.png`;
const ATTACK_BAR_READING_SCREENSHOT_PATH = `${SCREENSHOT_DIR}/17-read-attack-bar-on-wolf.png`;
const ROUSE_SELECT_SPELL_SCREENSHOT_PATH = `${SCREENSHOT_DIR}/18-rouse-select-spell-prepared-card.png`;
const ROUSE_TARGET_WOLF_SCREENSHOT_PATH = `${SCREENSHOT_DIR}/19-rouse-target-wolf-highlight.png`;
const PASS_DEPLOYMENT_SCREENSHOT_PATH = `${SCREENSHOT_DIR}/20-pass-your-deployment-wolf-ready.png`;
const OPPONENT_PUBLIC_VIEW_SCREENSHOT_PATH = `${SCREENSHOT_DIR}/21-opponent-public-view-toggle-highlight.png`;
const DISCARD_SCREENSHOT_PATH = `${SCREENSHOT_DIR}/22-opponent-public-view-same-discard-pile.png`;
const BACK_TO_SELF_VIEW_SCREENSHOT_PATH = `${SCREENSHOT_DIR}/23-back-to-self-view.png`;
const QUICKCAST_PASS_SCREENSHOT_PATH = `${SCREENSHOT_DIR}/24-skip-initiative-quickcast.png`;
const MOVE_SELECT_WOLF_SCREENSHOT_PATH = `${SCREENSHOT_DIR}/25-move-select-wolf.png`;
const MOVE_TARGET_ZONE_SCREENSHOT_PATH = `${SCREENSHOT_DIR}/26-move-target-zone-a2.png`;
const FINISH_SCREENSHOT_PATH = `${SCREENSHOT_DIR}/27-finish-wolf-moved-to-a2.png`;
const RESPONSIVE_PLAN_SCREENSHOT_DIR = 'test-results/evidence-screenshots/mage-wars/tutorial-plan-click-responsive';
const RESPONSIVE_PLAN_VIEWPORTS = [
    {
        label: '1366x768',
        width: 1366,
        height: 768,
        paths: {
            oneOfTwo: `${RESPONSIVE_PLAN_SCREENSHOT_DIR}/00-1366-plan-card-body-click-one-of-two.png`,
            slotCancel: `${RESPONSIVE_PLAN_SCREENSHOT_DIR}/01-1366-plan-slot-click-cancels-draft.png`,
            reselect: `${RESPONSIVE_PLAN_SCREENSHOT_DIR}/02-1366-plan-card-reselect-after-slot-cancel.png`,
        },
    },
    {
        label: '1920x1080',
        width: 1920,
        height: 1080,
        paths: {
            oneOfTwo: `${RESPONSIVE_PLAN_SCREENSHOT_DIR}/03-1920-plan-card-body-click-one-of-two.png`,
            slotCancel: `${RESPONSIVE_PLAN_SCREENSHOT_DIR}/04-1920-plan-slot-click-cancels-draft.png`,
            reselect: `${RESPONSIVE_PLAN_SCREENSHOT_DIR}/05-1920-plan-card-reselect-after-slot-cancel.png`,
        },
    },
] as const;

type ResponsivePlanViewport = (typeof RESPONSIVE_PLAN_VIEWPORTS)[number];

const CARD_BODY_PRIMARY_HIT_POINTS = [
    { label: '中心主体', xRatio: 0.5, yRatio: 0.5 },
    { label: '右上卡面主体', xRatio: 0.7, yRatio: 0.24 },
    { label: '右中卡面主体', xRatio: 0.78, yRatio: 0.42 },
    { label: '标题下方主体', xRatio: 0.62, yRatio: 0.18 },
] as const;

const CARD_BODY_PLAYER_CLICK_POINT = { label: '玩家中心点击卡牌本体', xRatio: 0.5, yRatio: 0.5 } as const;

const TUTORIAL_FLOW_SCREENSHOT_PATHS = [
    INTRO_SCREENSHOT_PATH,
    SELF_HUD_SCREENSHOT_PATH,
    OPPONENT_HUD_SCREENSHOT_PATH,
    STAGE_SCREENSHOT_PATH,
    CHANNEL_RESULT_SCREENSHOT_PATH,
    SPELL_CARD_READING_SCREENSHOT_PATH,
    PLAN_OPEN_CREATURE_CATEGORY_SCREENSHOT_PATH,
    PLAN_CREATURE_NEXT_PAGE_SCREENSHOT_PATH,
    PLAN_SELECT_WOLF_SCREENSHOT_PATH,
    PLAN_OPEN_INCANTATION_CATEGORY_SCREENSHOT_PATH,
    PLAN_INCANTATION_NEXT_PAGE_SCREENSHOT_PATH,
    PLAN_SELECT_ROUSE_SCREENSHOT_PATH,
    PLAN_CONFIRM_SCREENSHOT_PATH,
    PREPARED_HIDDEN_SCREENSHOT_PATH,
    DEPLOY_SELECT_WOLF_SCREENSHOT_PATH,
    DEPLOY_TARGET_ZONE_SCREENSHOT_PATH,
    WOLF_SUMMONED_SCREENSHOT_PATH,
    ATTACK_BAR_READING_SCREENSHOT_PATH,
    ROUSE_SELECT_SPELL_SCREENSHOT_PATH,
    ROUSE_TARGET_WOLF_SCREENSHOT_PATH,
    PASS_DEPLOYMENT_SCREENSHOT_PATH,
    OPPONENT_PUBLIC_VIEW_SCREENSHOT_PATH,
    DISCARD_SCREENSHOT_PATH,
    BACK_TO_SELF_VIEW_SCREENSHOT_PATH,
    QUICKCAST_PASS_SCREENSHOT_PATH,
    MOVE_SELECT_WOLF_SCREENSHOT_PATH,
    MOVE_TARGET_ZONE_SCREENSHOT_PATH,
    FINISH_SCREENSHOT_PATH,
];

type MageWarsTutorialState = {
    sys?: {
        phase?: string;
        tutorial?: {
            active?: boolean;
            step?: {
                id?: string;
                aiActions?: unknown[];
            } | null;
            stepIndex?: number;
        };
    };
    core?: {
        phaseActorId?: string;
        objects?: Record<string, {
            sourceSpellCardId?: number;
            ownerId?: string;
            zoneId?: string;
            actionReady?: boolean;
            guarding?: boolean;
            damage?: number;
            statusTokens?: Record<string, number>;
        }>;
        players?: Record<string, {
            mana?: number;
            preparedSpellCardIds?: number[];
            discardSpellCardIds?: number[];
        }>;
    };
};

async function prepareMageWarsTutorialContext(context: BrowserContext, page: Page) {
    await initContext(context, {
        storageKey: 'mage-wars-tutorial',
        skipTutorial: false,
        locale: 'zh-CN',
        skipImageGate: false,
        blockCdnAssets: false,
    });
    return attachPageDiagnostics(page);
}

async function openMageWarsTutorial(context: BrowserContext, page: Page) {
    const diagnostics = await prepareMageWarsTutorialContext(context, page);

    await page.goto('/play/mage-wars/tutorial', { waitUntil: 'domcontentloaded' });
    await waitForFrontendAssets(page, 45_000);
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    await expect(page.locator('[data-game-page][data-game-id="mage-wars"]').first()).toBeVisible({ timeout: 60_000 });
    const board = page.getByTestId('mage-wars-board');
    const catalogEntry = page.getByTestId('tutorial-catalog-entry-mage-wars-basic');
    const entryPoint = await Promise.race([
        board.waitFor({ state: 'visible', timeout: 60_000 }).then(() => 'board' as const),
        catalogEntry.waitFor({ state: 'visible', timeout: 60_000 }).then(() => 'catalog' as const),
    ]);
    if (entryPoint === 'catalog' && !(await board.isVisible().catch(() => false))) {
        await catalogEntry.click();
    }
    await expect(board).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('tutorial-catalog-stage')).toHaveCount(0);
    await expect(page.getByTestId('tutorial-catalog-entry-mage-wars-basic')).toHaveCount(0);
    await waitForTestHarness(page, 20_000);
    await page.waitForFunction(() => {
        const harness = (window as Window & {
            __BG_TEST_HARNESS__?: { state?: { isRegistered?: () => boolean } };
        }).__BG_TEST_HARNESS__;
        return harness?.state?.isRegistered?.() === true;
    }, undefined, { timeout: 20_000 });

    return diagnostics;
}

async function readMageWarsState(page: Page): Promise<MageWarsTutorialState> {
    return page.evaluate(() => {
        const harness = (window as Window & {
            __BG_TEST_HARNESS__?: { state?: { get?: () => unknown } };
        }).__BG_TEST_HARNESS__;
        return (harness?.state?.get?.() ?? {}) as MageWarsTutorialState;
    });
}

async function waitForTutorialStep(page: Page, stepId: string, timeout = 30_000) {
    await expect.poll(async () => {
        const visibleSteps = await page.locator('[data-tutorial-step]').evaluateAll((elements) => elements
            .filter((element) => {
                const rect = element.getBoundingClientRect();
                const style = window.getComputedStyle(element);
                return style.display !== 'none'
                    && style.visibility !== 'hidden'
                    && rect.width > 0
                    && rect.height > 0;
            })
            .map((element) => element.getAttribute('data-tutorial-step'))
            .filter((value): value is string => value != null));
        const state = await readMageWarsState(page);
        return {
            expectedStepId: stepId,
            hasVisibleExpectedStep: visibleSteps.includes(stepId),
            visibleSteps,
            gameStepId: state.sys?.tutorial?.step?.id ?? null,
            phase: state.sys?.phase ?? null,
            phaseActorId: state.core?.phaseActorId ?? null,
            tutorialActive: state.sys?.tutorial?.active ?? null,
        };
    }, {
        timeout,
        message: `等待教程步骤 ${stepId} 出现在真实页面，并与游戏教程状态同步`,
    }).toEqual(expect.objectContaining({
        hasVisibleExpectedStep: true,
        gameStepId: stepId,
    }));
}

async function expectTutorialStepNotVisible(page: Page, stepId: string) {
    await expect(page.locator(`[data-tutorial-step="${stepId}"]`)).toHaveCount(0);
}

async function clickTutorialNext(page: Page) {
    const button = page.getByTestId('tutorial-next-button');
    await expect(button).toBeVisible({ timeout: 10_000 });
    await button.click({ timeout: 5_000 });
}

const MAGE_WARS_TUTORIAL_ARENA_TARGET_PREFIXES = [
    'mw-zone-',
    'mw-field-object-',
    'mw-arena-object-',
    'mw-mage-entity-',
] as const;

function isMageWarsTutorialArenaTarget(tutorialId: string) {
    return MAGE_WARS_TUTORIAL_ARENA_TARGET_PREFIXES.some((prefix) => tutorialId.startsWith(prefix));
}

async function waitForTutorialArenaPanSettled(page: Page, tutorialId: string) {
    if (!isMageWarsTutorialArenaTarget(tutorialId)) return;
    const viewport = page.getByTestId('mage-wars-arena-viewport');
    await expect(viewport, `${tutorialId} 必须先触发竞技场自动聚焦`).toHaveAttribute(
        'data-zoom-pan-active-target',
        tutorialId,
        { timeout: 10_000 },
    );
    await expect(viewport, `${tutorialId} 必须等相机稳定后才允许截图或点击`).toHaveAttribute(
        'data-zoom-pan-target-state',
        'settled',
        { timeout: 10_000 },
    );
}

async function clickTutorialTarget(page: Page, tutorialId: string) {
    const target = page.locator(`[data-tutorial-id="${tutorialId}"]`).first();
    await expect(target).toBeVisible({ timeout: 15_000 });
    await expect(target).toBeEnabled({ timeout: 10_000 });
    await waitForTutorialArenaPanSettled(page, tutorialId);
    const targetTestId = await target.evaluate((element) => element.getAttribute('data-testid'));
    if (targetTestId === 'mage-wars-zone-field-card' || targetTestId === 'mage-wars-zone-mage-entity') {
        await clickTutorialPrimaryActionBodyTarget(page, target, tutorialId);
        return;
    }
    if (tutorialId.startsWith('mw-zone-')) {
        await expectNoTutorialCardOverlap(target, tutorialId);
        const audit = await expectLocatorCenterUnblocked(target, tutorialId);
        await page.mouse.click(audit.point.x, audit.point.y);
        return;
    }
    await target.click({ timeout: 5_000 });
}

async function expectMagnifyOverlayHidden(page: Page) {
    await expect(page.getByTestId('mage-wars-card-magnify-overlay')).toBeHidden({ timeout: 5_000 });
    await expect(page.getByTestId('mage-wars-card-magnify-overlay')).toHaveAttribute('aria-hidden', 'true');
}

async function expectLocatorPointUnblocked(
    locator: Locator,
    label: string,
    point: { xRatio: number; yRatio: number } = { xRatio: 0.5, yRatio: 0.5 },
) {
    const audit = await locator.evaluate((element, hitPoint) => {
        const rect = element.getBoundingClientRect();
        const x = rect.left + rect.width * hitPoint.xRatio;
        const y = rect.top + rect.height * hitPoint.yRatio;
        const hit = document.elementFromPoint(x, y);
        const primaryAction = hit?.closest<HTMLElement>('[data-primary-action="true"]') ?? null;
        return {
            point: { x, y },
            rect: {
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
                width: rect.width,
                height: rect.height,
            },
            containsHit: hit != null && element.contains(hit),
            hitTestId: hit?.closest<HTMLElement>('[data-testid]')?.dataset.testid ?? null,
            hitTutorialId: hit?.closest<HTMLElement>('[data-tutorial-id]')?.dataset.tutorialId ?? null,
            hitInspectButton: Boolean(hit?.closest<HTMLElement>('[data-testid="mage-wars-card-inspect-button"]')),
            hitPrimaryAction: primaryAction === element,
            hitTag: hit?.tagName ?? null,
        };
    }, point);
    expect(audit.containsHit, `${label} 必须真实命中自身或子元素，实际命中 ${JSON.stringify(audit)}`).toBe(true);
    return audit;
}

async function expectLocatorCenterUnblocked(locator: Locator, label: string) {
    return expectLocatorPointUnblocked(locator, `${label} 中心点`, { xRatio: 0.5, yRatio: 0.5 });
}

async function clickTutorialPrimaryActionBodyTarget(page: Page, target: Locator, tutorialId: string) {
    if (!isMageWarsTutorialArenaTarget(tutorialId)) {
        await target.evaluate((element) => {
            const lane = element.closest<HTMLElement>('[data-lane-owner-side]');
            if (lane) {
                lane.scrollTop = element.offsetTop - (lane.clientHeight / 2) + (element.clientHeight / 2);
            }
            element.scrollIntoView({ block: 'center', inline: 'center' });
        });
    }
    await expectNoTutorialCardOverlap(target, tutorialId);
    await expect(target, `${tutorialId} 本体必须承担当前教程主操作`).toHaveAttribute('data-primary-action', 'true');
    await expectMagnifyOverlayHidden(page);
    for (const hitPoint of CARD_BODY_PRIMARY_HIT_POINTS) {
        const audit = await expectLocatorPointUnblocked(target, `${tutorialId} ${hitPoint.label}`, hitPoint);
        expect(audit.hitInspectButton, `${tutorialId} ${hitPoint.label}不能命中放大镜: ${JSON.stringify(audit)}`).toBe(false);
        expect(audit.hitPrimaryAction, `${tutorialId} ${hitPoint.label}必须命中本体主操作: ${JSON.stringify(audit)}`).toBe(true);
    }
    const audit = await expectLocatorPointUnblocked(target, `${tutorialId} ${CARD_BODY_PLAYER_CLICK_POINT.label}`, CARD_BODY_PLAYER_CLICK_POINT);
    expect(audit.hitInspectButton, `${tutorialId} ${CARD_BODY_PLAYER_CLICK_POINT.label}不能命中放大镜: ${JSON.stringify(audit)}`).toBe(false);
    expect(audit.hitPrimaryAction, `${tutorialId} ${CARD_BODY_PLAYER_CLICK_POINT.label}必须命中本体主操作: ${JSON.stringify(audit)}`).toBe(true);
    await page.mouse.click(audit.point.x, audit.point.y);
    await expectMagnifyOverlayHidden(page);
}

async function expectReferenceSizedInspectButton(card: Locator, inspectButton: Locator, label: string) {
    const [cardBox, buttonBox] = await Promise.all([
        card.boundingBox(),
        inspectButton.boundingBox(),
    ]);
    expect(cardBox, `${label} 所属卡牌必须有可量测尺寸`).not.toBeNull();
    expect(buttonBox, `${label} 放大镜必须有可量测尺寸`).not.toBeNull();
    expect(buttonBox!.width, `${label} 放大镜命中区不应小于 24px`).toBeGreaterThanOrEqual(24);
    expect(buttonBox!.height, `${label} 放大镜命中区不应小于 24px`).toBeGreaterThanOrEqual(24);
    expect(buttonBox!.width, `${label} 放大镜可见面不能大到抢卡牌本体点击区`).toBeLessThanOrEqual(34);
    expect(buttonBox!.height, `${label} 放大镜可见面不能大到抢卡牌本体点击区`).toBeLessThanOrEqual(34);
    expect(
        buttonBox!.width / cardBox!.width,
        `${label} 放大镜视觉权重必须小于卡面主体，不能让右上常点区域变成放大`,
    ).toBeLessThanOrEqual(0.19);
}

async function clickLocatorCenterAsPlayer(page: Page, locator: Locator, label: string) {
    const audit = await expectLocatorCenterUnblocked(locator, label);
    await page.mouse.click(audit.point.x, audit.point.y);
}

async function expectNoTutorialCardOverlap(locator: Locator, label: string) {
    const overlapAudit = await locator.evaluate((element) => {
        const target = element.getBoundingClientRect();
        const targetRect = {
            left: target.left,
            top: target.top,
            right: target.right,
            bottom: target.bottom,
            width: target.width,
            height: target.height,
        };
        const tutorialCards = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="tutorial-overlay-card"]'))
            .filter((candidate) => {
                const style = window.getComputedStyle(candidate);
                const rect = candidate.getBoundingClientRect();
                return style.visibility !== 'hidden'
                    && style.display !== 'none'
                    && Number.parseFloat(style.opacity || '1') > 0.01
                    && rect.width > 1
                    && rect.height > 1;
            })
            .map((candidate) => {
                const rect = candidate.getBoundingClientRect();
                const intersectionWidth = Math.max(0, Math.min(target.right, rect.right) - Math.max(target.left, rect.left));
                const intersectionHeight = Math.max(0, Math.min(target.bottom, rect.bottom) - Math.max(target.top, rect.top));
                return {
                    rect: {
                        left: rect.left,
                        top: rect.top,
                        right: rect.right,
                        bottom: rect.bottom,
                        width: rect.width,
                        height: rect.height,
                    },
                    intersectionArea: intersectionWidth * intersectionHeight,
                };
            });
        return {
            targetRect,
            tutorialCards,
            overlappingCards: tutorialCards.filter((entry) => entry.intersectionArea > 1),
        };
    });
    expect(overlapAudit.overlappingCards, `${label} 不应被教程卡片视觉遮挡: ${JSON.stringify(overlapAudit)}`).toEqual([]);
}

async function findTutorialSpellbookCard(page: Page, cardId: number) {
    const card = page.locator(`[data-tutorial-id="mw-spellbook-card-${cardId}"]`).first();
    await expect(card, `卡牌 ${cardId} 必须已经在当前法术书页可见；E2E 不允许 helper 私下翻页`).toBeVisible({ timeout: 10_000 });
    await expect(card).toBeEnabled({ timeout: 10_000 });
    return card;
}

async function expectSpellbookInspectIconOpensWithoutPlanning(page: Page, card: Locator, cardId: number) {
    await expect(card).toHaveAttribute('data-secondary-inspect', 'true');
    const inspectButton = card.locator('xpath=..').getByTestId('mage-wars-card-inspect-button');
    await expect(inspectButton).toBeVisible({ timeout: 5_000 });
    await expect(inspectButton.locator('svg')).toHaveCount(1);
    await expectReferenceSizedInspectButton(card, inspectButton, `法术书卡牌 ${cardId}`);
    await expectLocatorCenterUnblocked(inspectButton, `法术书卡牌 ${cardId} 的放大镜`);
    const draftsBefore = await readPlanningDrafts(page);
    await clickLocatorCenterAsPlayer(page, inspectButton, `法术书卡牌 ${cardId} 的放大镜`);
    await expect(page.getByTestId('mage-wars-card-magnify-overlay')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('mage-wars-card-magnify-content')).toHaveAttribute('data-source-card-id', String(cardId));
    expect(await readPlanningDrafts(page)).toEqual(draftsBefore);
    await page.getByTestId('mage-wars-card-magnify-overlay-close').click();
    await expectMagnifyOverlayHidden(page);
}

async function clickTutorialSpellbookCardBody(page: Page, card: Locator, cardId: number) {
    await expectNoTutorialCardOverlap(card, `法术书卡牌 ${cardId}`);
    await expect(card, `法术书卡牌 ${cardId} 本体不能被标记为浏览放大入口`).not.toHaveAttribute('data-browse-inspectable', 'true');
    await expect(card, `法术书卡牌 ${cardId} 本体必须承担计划主操作`).toHaveAttribute('data-primary-action', 'true');
    await expectMagnifyOverlayHidden(page);
    for (const hitPoint of CARD_BODY_PRIMARY_HIT_POINTS) {
        const audit = await expectLocatorPointUnblocked(card, `法术书卡牌 ${cardId} ${hitPoint.label}`, hitPoint);
        expect(audit.hitInspectButton, `法术书卡牌 ${cardId} ${hitPoint.label}不能命中放大镜: ${JSON.stringify(audit)}`).toBe(false);
        expect(audit.hitPrimaryAction, `法术书卡牌 ${cardId} ${hitPoint.label}必须命中主操作按钮: ${JSON.stringify(audit)}`).toBe(true);
    }
    const audit = await expectLocatorPointUnblocked(card, `法术书卡牌 ${cardId} ${CARD_BODY_PLAYER_CLICK_POINT.label}`, CARD_BODY_PLAYER_CLICK_POINT);
    expect(audit.hitInspectButton, `法术书卡牌 ${cardId} ${CARD_BODY_PLAYER_CLICK_POINT.label}不能命中放大镜: ${JSON.stringify(audit)}`).toBe(false);
    expect(audit.hitPrimaryAction, `法术书卡牌 ${cardId} ${CARD_BODY_PLAYER_CLICK_POINT.label}必须命中主操作按钮: ${JSON.stringify(audit)}`).toBe(true);
    await page.mouse.click(audit.point.x, audit.point.y);
    await expectMagnifyOverlayHidden(page);
}

async function clickPlanningDraftCardBody(page: Page, cardId: number, planSlotIndex: number) {
    const draftCard = page
        .locator(`[data-testid="mage-wars-desktop-prepared-card"][data-planning-draft="true"][data-source-card-id="${cardId}"][data-plan-slot-index="${planSlotIndex}"]`)
        .first();
    await expect(draftCard).toBeVisible({ timeout: 10_000 });
    await expect(draftCard).toBeEnabled({ timeout: 10_000 });
    await expectNoTutorialCardOverlap(draftCard, `计划槽位 ${planSlotIndex} 草稿牌 ${cardId}`);
    await expect(draftCard, `计划槽位 ${planSlotIndex} 草稿牌本体不能被标记为浏览放大入口`).not.toHaveAttribute('data-browse-inspectable', 'true');
    await expect(draftCard, `计划槽位 ${planSlotIndex} 草稿牌本体必须承担取消计划主操作`).toHaveAttribute('data-primary-action', 'true');
    await expectMagnifyOverlayHidden(page);
    for (const hitPoint of CARD_BODY_PRIMARY_HIT_POINTS) {
        const audit = await expectLocatorPointUnblocked(draftCard, `计划槽位 ${planSlotIndex} 草稿牌 ${cardId} ${hitPoint.label}`, hitPoint);
        expect(audit.hitInspectButton, `计划槽位 ${planSlotIndex} 草稿牌 ${hitPoint.label}不能命中放大镜: ${JSON.stringify(audit)}`).toBe(false);
        expect(audit.hitPrimaryAction, `计划槽位 ${planSlotIndex} 草稿牌 ${hitPoint.label}必须命中取消计划主操作: ${JSON.stringify(audit)}`).toBe(true);
    }
    const audit = await expectLocatorPointUnblocked(draftCard, `计划槽位 ${planSlotIndex} 草稿牌 ${cardId} ${CARD_BODY_PLAYER_CLICK_POINT.label}`, CARD_BODY_PLAYER_CLICK_POINT);
    expect(audit.hitInspectButton, `计划槽位 ${planSlotIndex} 草稿牌 ${CARD_BODY_PLAYER_CLICK_POINT.label}不能命中放大镜: ${JSON.stringify(audit)}`).toBe(false);
    expect(audit.hitPrimaryAction, `计划槽位 ${planSlotIndex} 草稿牌 ${CARD_BODY_PLAYER_CLICK_POINT.label}必须命中取消计划主操作: ${JSON.stringify(audit)}`).toBe(true);
    await page.mouse.click(audit.point.x, audit.point.y);
    await expectMagnifyOverlayHidden(page);
}

async function expectPlanControlsUnblocked(page: Page, expectedDraftCount: number) {
    const planButton = page.getByTestId('mage-wars-plan-spells');
    await expect(planButton).toBeVisible({ timeout: 10_000 });
    await expectLocatorCenterUnblocked(planButton, '确认计划按钮');
    await expectNoTutorialCardOverlap(planButton, '确认计划按钮');

    const draftCards = page.locator('[data-testid="mage-wars-desktop-prepared-card"][data-planning-draft="true"]');
    await expect(draftCards).toHaveCount(expectedDraftCount);
    for (let index = 0; index < expectedDraftCount; index += 1) {
        const draft = draftCards.nth(index);
        await expectLocatorCenterUnblocked(draft, `计划槽位 ${index + 1}`);
        await expectNoTutorialCardOverlap(draft, `计划槽位 ${index + 1}`);
    }
}

async function expectMageWarsReadableViewport(page: Page, viewport: ResponsivePlanViewport, expectedDraftCount = 0) {
    const audit = await page.evaluate(() => {
        const toRect = (element: Element | null) => {
            if (!element) return null;
            const rect = element.getBoundingClientRect();
            return {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
                right: rect.right,
                bottom: rect.bottom,
            };
        };
        const intersects = (
            left: ReturnType<typeof toRect>,
            right: ReturnType<typeof toRect>,
        ) => Boolean(left && right
            && left.x < right.right
            && left.right > right.x
            && left.y < right.bottom
            && left.bottom > right.y);
        const spellbookCards = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="mage-wars-desktop-spellbook-card"]'));
        const preparedDraftCards = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="mage-wars-desktop-prepared-card"][data-planning-draft="true"]'));
        const bottomGrid = document.querySelector<HTMLElement>('[data-testid="mage-wars-bottom-viewport-grid"]');
        const selfHud = document.querySelector<HTMLElement>('[data-testid="mage-wars-mage-hud-self"]');
        const opponentHud = document.querySelector<HTMLElement>('[data-testid="mage-wars-mage-hud-opponent"]');
        const selfHintCard = selfHud?.querySelector<HTMLElement>('[data-testid="mage-wars-mage-hud-hint-card"]') ?? null;
        const opponentHintCard = opponentHud?.querySelector<HTMLElement>('[data-testid="mage-wars-mage-hud-hint-card"]') ?? null;
        const legacyHudStatGrids = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="mage-wars-mage-hud-stat-grid"]'));
        const legacyHudStatBars = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="mage-wars-mage-hud-stat-bar"]'));
        const hudIconRails = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="mage-wars-mage-hud-icon-rail"]'));
        const hudStatIcons = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="mage-wars-mage-hud-stat-icon"]'));
        const hudTokenIcons = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="mage-wars-mage-hud-token-icon"]'));
        const opponentPreparedMirror = document.querySelector<HTMLElement>('[data-testid="mage-wars-opponent-prepared-mirror"]');
        const lifeToggle = document.querySelector<HTMLElement>('[data-testid="mage-wars-life-toggle"]');
        const scaleBadge = document.querySelector<HTMLElement>('[data-testid="mage-wars-arena-viewport-scale"]');
        const arenaViewport = document.querySelector<HTMLElement>('[data-testid="mage-wars-arena-viewport"]');
        const arenaStage = document.querySelector<HTMLElement>('[data-testid="mage-wars-arena-stage"]');
        const spellbookShelf = document.querySelector<HTMLElement>('[data-testid="mage-wars-desktop-spellbook-shelf"]');
        const preparedArea = document.querySelector<HTMLElement>('[data-testid="mage-wars-desktop-prepared-spells"]');
        const planButton = document.querySelector<HTMLElement>('[data-testid="mage-wars-plan-spells"]');
        const categoryButtons = ['all', 'attack', 'enchantment', 'creature', 'incantation', 'equipment'].map((id) => {
            const element = document.querySelector<HTMLElement>(`[data-testid="mage-wars-spellbook-category-${id}"]`);
            return {
                id,
                rect: toRect(element),
                scrollWidth: element?.scrollWidth ?? null,
                clientWidth: element?.clientWidth ?? null,
                whiteSpace: element ? getComputedStyle(element).whiteSpace : null,
            };
        });
        const firstSpellbookCard = spellbookCards[0] ?? null;
        const firstPreparedDraftCard = preparedDraftCards[0] ?? null;
        return {
            viewport: { width: window.innerWidth, height: window.innerHeight },
            desktopScale: document.querySelector<HTMLElement>('[data-testid="mage-wars-desktop-ui-plane"]')
                ?.getAttribute('data-mage-wars-desktop-ui-scale') ?? null,
            visibleSpellbookCardCount: spellbookCards.length,
            bottomGap: bottomGrid ? window.innerHeight - bottomGrid.getBoundingClientRect().bottom : null,
            hudDensity: selfHud?.dataset.mageWarsHudDensity ?? null,
            opponentHudDensity: opponentHud?.dataset.mageWarsHudDensity ?? null,
            hudAnchorPointerEvents: (() => {
                const element = document.querySelector<HTMLElement>('[data-testid="mage-wars-hud-anchor-layer"]');
                return element ? getComputedStyle(element).pointerEvents : null;
            })(),
            selfHudPointerEvents: selfHud ? getComputedStyle(selfHud).pointerEvents : null,
            selfHudLayoutPosition: selfHud
                ?.closest<HTMLElement>('[data-layout-position]')
                ?.getAttribute('data-layout-position') ?? null,
            legacyHudStatGridCount: legacyHudStatGrids.length,
            legacyHudStatBarCount: legacyHudStatBars.length,
            categoryButtons,
            hudIconRails: hudIconRails.map((rail) => {
                const rect = rail.getBoundingClientRect();
                const owner = rail.closest('[data-testid="mage-wars-mage-hud-self"]')
                    ? 'self'
                    : rail.closest('[data-testid="mage-wars-mage-hud-opponent"]')
                        ? 'opponent'
                        : 'unknown';
                return {
                    owner,
                    align: rail.dataset.hudIconRailAlign ?? null,
                    width: rect.width,
                    height: rect.height,
                    x: rect.x,
                    y: rect.y,
                    right: rect.right,
                    bottom: rect.bottom,
                };
            }),
            hudStatIcons: hudStatIcons.map((icon) => {
                const rect = icon.getBoundingClientRect();
                const style = getComputedStyle(icon);
                const value = icon.querySelector<HTMLElement>('[data-testid="mage-wars-mage-hud-stat-value"]');
                const glyph = icon.querySelector<SVGElement>('[data-stat-glyph-kind]');
                const owner = icon.closest('[data-testid="mage-wars-mage-hud-self"]')
                    ? 'self'
                    : icon.closest('[data-testid="mage-wars-mage-hud-opponent"]')
                        ? 'opponent'
                        : 'unknown';
                return {
                    owner,
                    stat: icon.dataset.stat ?? null,
                    frame: icon.dataset.hudIconFrame ?? null,
                    hitSurface: icon.dataset.hudHitSurface ?? null,
                    tooltipTrigger: icon.dataset.hudIconTooltipTrigger ?? null,
                    tooltipText: icon.querySelector<HTMLElement>('[data-testid="mage-wars-mage-hud-icon-tooltip"]')?.textContent?.trim() ?? '',
                    glyph: glyph?.dataset.statGlyphKind ?? null,
                    value: icon.dataset.statValue ?? null,
                    max: icon.dataset.statMax ?? null,
                    fillPercent: Number.parseFloat(icon.dataset.fillPercent ?? 'NaN'),
                    valueText: value?.textContent?.trim() ?? '',
                    backgroundColor: style.backgroundColor,
                    pointerEvents: style.pointerEvents,
                    borderTopWidth: style.borderTopWidth,
                    boxShadow: style.boxShadow,
                    width: rect.width,
                    height: rect.height,
                    x: rect.x,
                    y: rect.y,
                    right: rect.right,
                    bottom: rect.bottom,
                };
            }),
            hudTokenIcons: hudTokenIcons.map((icon) => {
                const rect = icon.getBoundingClientRect();
                const style = getComputedStyle(icon);
                const owner = icon.closest('[data-testid="mage-wars-mage-hud-self"]')
                    ? 'self'
                    : icon.closest('[data-testid="mage-wars-mage-hud-opponent"]')
                        ? 'opponent'
                        : 'unknown';
                return {
                    owner,
                    kind: icon.dataset.tokenKind ?? null,
                    frame: icon.dataset.hudIconFrame ?? null,
                    tooltipTrigger: icon.dataset.hudIconTooltipTrigger ?? null,
                    tooltipText: icon.querySelector<HTMLElement>('[data-testid="mage-wars-mage-hud-icon-tooltip"]')?.textContent?.trim() ?? '',
                    backgroundColor: style.backgroundColor,
                    borderTopWidth: style.borderTopWidth,
                    boxShadow: style.boxShadow,
                    width: rect.width,
                    height: rect.height,
                    x: rect.x,
                    right: rect.right,
                };
            }),
            rects: {
                bottomGrid: toRect(bottomGrid),
                selfHud: toRect(selfHud),
                opponentHud: toRect(opponentHud),
                selfHintCard: toRect(selfHintCard),
                opponentHintCard: toRect(opponentHintCard),
                opponentPreparedMirror: toRect(opponentPreparedMirror),
                lifeToggle: toRect(lifeToggle),
                scaleBadge: toRect(scaleBadge),
                arenaViewport: toRect(arenaViewport),
                arenaStage: toRect(arenaStage),
                spellbookShelf: toRect(spellbookShelf),
                preparedArea: toRect(preparedArea),
                planButton: toRect(planButton),
                firstSpellbookCard: toRect(firstSpellbookCard),
                firstPreparedDraftCard: toRect(firstPreparedDraftCard),
            },
            overlaps: [
                { name: 'spellbook-prepared', value: intersects(toRect(spellbookShelf), toRect(preparedArea)) },
                { name: 'spellbook-plan-button', value: intersects(toRect(spellbookShelf), toRect(planButton)) },
                { name: 'hud-spellbook', value: intersects(toRect(selfHud), toRect(spellbookShelf)) },
                { name: 'hud-prepared-area', value: intersects(toRect(selfHud), toRect(preparedArea)) },
                { name: 'hud-plan-button', value: intersects(toRect(selfHud), toRect(planButton)) },
                { name: 'life-toggle-self-hud', value: intersects(toRect(lifeToggle), toRect(selfHud)) },
                { name: 'life-toggle-scale-badge', value: intersects(toRect(lifeToggle), toRect(scaleBadge)) },
                { name: 'opponent-hint-opponent-plans', value: intersects(toRect(opponentHintCard), toRect(opponentPreparedMirror)) },
            ],
        };
    });

    expect(audit.viewport).toEqual({ width: viewport.width, height: viewport.height });
    expect(audit.desktopScale, `${viewport.label} 不得把整层 HUD / 法术书 / 计划区整体缩小来冒充适配`).toBe('1.000000');
    expect(audit.visibleSpellbookCardCount, `${viewport.label} 必须显示本轮锁定的 6 张法术书牌，不能靠减少承载量适配`).toBe(6);
    audit.categoryButtons.forEach((category) => {
        expect(category.rect, `${viewport.label} ${category.id} 分类按钮必须可见`).not.toBeNull();
        expect(category.rect!.width, `${viewport.label} ${category.id} 分类按钮必须是按钮，不是小标签`).toBeGreaterThanOrEqual(72);
        expect(category.rect!.height, `${viewport.label} ${category.id} 分类按钮必须保留可读命中面`).toBeGreaterThanOrEqual(30);
        expect(category.whiteSpace, `${viewport.label} ${category.id} 分类按钮不得换行`).toBe('nowrap');
        expect(category.scrollWidth, `${viewport.label} ${category.id} 分类按钮文字必须可量测`).not.toBeNull();
        expect(category.clientWidth, `${viewport.label} ${category.id} 分类按钮文字必须可量测`).not.toBeNull();
        expect(category.scrollWidth!, `${viewport.label} ${category.id} 分类按钮文字不得被截断`).toBeLessThanOrEqual(category.clientWidth! + 1);
    });
    expect(audit.bottomGap, '底部主交互需要留出少量可见空隙，不能贴到屏幕底边').not.toBeNull();
    expect(audit.bottomGap!).toBeGreaterThanOrEqual(6);
    expect(audit.bottomGap!).toBeLessThanOrEqual(16);
    expect(audit.hudDensity, `${viewport.label} 桌面视口不得把玩家 HUD 自动切成 compact`).toBe('full');
    expect(audit.opponentHudDensity, `${viewport.label} 桌面视口不得把对手 HUD 自动切成 compact`).toBe('full');
    expect(audit.hudAnchorPointerEvents, `${viewport.label} HUD 锚点层外壳不应吞掉地图 / 牌桌输入`).toBe('none');
    expect(audit.selfHudPointerEvents, `${viewport.label} 己方 HUD 外壳不应吞掉非控件输入`).toBe('none');
    expect(audit.selfHudLayoutPosition, `${viewport.label} 己方 HUD 必须保持左下顶层锚点，不按场上实体启用避让态`).toBe('self-lower-left');
    expect(audit.legacyHudStatGridCount, `${viewport.label} HUD attributes must not use the old text/grid progress panel`).toBe(0);
    expect(audit.legacyHudStatBarCount, `${viewport.label} HUD attributes must not render progress bars`).toBe(0);
    expect(audit.hudIconRails, `${viewport.label} both mage HUDs must expose the compact icon rail next to the hint card`).toHaveLength(2);
    expect(audit.hudStatIcons, `${viewport.label} both mage HUDs must show life, mana and channeling as icons`).toHaveLength(6);
    expect(audit.hudTokenIcons, `${viewport.label} 行动 / 快速施法 token 不应继续占用 HUD 属性栏`).toHaveLength(0);
    for (const owner of ['self', 'opponent'] as const) {
        const ownerIcons = audit.hudStatIcons.filter((icon) => icon.owner === owner);
        const ownerRail = audit.hudIconRails.find((rail) => rail.owner === owner);
        const ownerHint = owner === 'self' ? audit.rects.selfHintCard : audit.rects.opponentHintCard;
        const ownerHud = owner === 'self' ? audit.rects.selfHud : audit.rects.opponentHud;
        expect(ownerIcons.map((icon) => icon.stat).sort()).toEqual(['channeling', 'life', 'mana']);
        expect(ownerRail, `${viewport.label} ${owner} HUD icon rail must exist: ${JSON.stringify(audit)}`).toBeTruthy();
        expect(ownerRail!.align, `${viewport.label} ${owner} HUD icon rail must be left aligned`).toBe('left');
        expect(ownerHint).not.toBeNull();
        expect(ownerHud).not.toBeNull();
        for (const icon of ownerIcons) {
            expect(icon.frame, `${viewport.label} ${owner} HUD icon must not add an extra backing frame: ${JSON.stringify(audit)}`).toBe('none');
            expect(icon.hitSurface, `${viewport.label} ${owner} HUD 属性图标显示层必须点击透传`).toBe('visual-pass-through');
            expect(icon.pointerEvents, `${viewport.label} ${owner} HUD 属性图标不能吞掉场上对象点击`).toBe('none');
            expect(['rgba(0, 0, 0, 0)', 'transparent'], `${viewport.label} ${owner} HUD icon wrapper background must be transparent: ${JSON.stringify(audit)}`).toContain(icon.backgroundColor);
            expect(icon.borderTopWidth, `${viewport.label} ${owner} HUD icon wrapper must not draw a border circle: ${JSON.stringify(audit)}`).toBe('0px');
            expect(icon.boxShadow, `${viewport.label} ${owner} HUD icon wrapper must not draw a shadow circle: ${JSON.stringify(audit)}`).toBe('none');
            expect(icon.tooltipTrigger, `${viewport.label} ${owner} HUD icon must expose a visible hover/focus explanation trigger: ${JSON.stringify(audit)}`).toBe('hover-focus');
            expect(icon.tooltipText, `${viewport.label} ${owner} HUD icon must have readable hover/focus tooltip text: ${JSON.stringify(audit)}`).not.toBe('');
            expect(icon.width, `${viewport.label} ${owner} HUD icon must remain readable after the no-progress-bar HUD compaction: ${JSON.stringify(audit)}`).toBeGreaterThanOrEqual(viewport.width >= 1900 ? 58 : 54);
            expect(icon.height, `${viewport.label} ${owner} HUD icon must remain readable after the no-progress-bar HUD compaction: ${JSON.stringify(audit)}`).toBeGreaterThanOrEqual(viewport.width >= 1900 ? 58 : 54);
            expect(Math.abs(icon.x - ownerRail!.x), `${viewport.label} ${owner} HUD icon column must be left aligned: ${JSON.stringify(audit)}`).toBeLessThanOrEqual(1);
            expect(icon.x, `${viewport.label} ${owner} HUD icons must sit to the right of the hint card: ${JSON.stringify(audit)}`).toBeGreaterThanOrEqual(ownerHint!.right - 1);
            expect(icon.right, `${viewport.label} ${owner} HUD icons must stay inside the HUD cluster: ${JSON.stringify(audit)}`).toBeLessThanOrEqual(ownerHud!.right + 1);
        }
        for (const statIcon of ownerIcons) {
            if (statIcon.stat === 'life') expect(statIcon.glyph, `${viewport.label} life must use the custom vitality glyph`).toBe('vital-heart');
            if (statIcon.stat === 'mana') expect(statIcon.glyph, `${viewport.label} mana must use the custom crystal glyph`).toBe('mana-crystal');
            if (statIcon.stat === 'channeling') expect(statIcon.glyph, `${viewport.label} channeling must use the custom rune glyph`).toBe('channel-rune');
            expect(Number.isFinite(statIcon.fillPercent), `${viewport.label} ${owner} ${statIcon.stat} icon must expose a measured fill percent`).toBe(true);
            expect(statIcon.fillPercent, `${viewport.label} ${owner} ${statIcon.stat} fill must be clamped to 0-100`).toBeGreaterThanOrEqual(0);
            expect(statIcon.fillPercent, `${viewport.label} ${owner} ${statIcon.stat} fill must be clamped to 0-100`).toBeLessThanOrEqual(100);
            expect(statIcon.valueText, `${viewport.label} ${owner} ${statIcon.stat} icon must overlay the numeric value`).toBe(statIcon.value);
            expect(Number(statIcon.max), `${viewport.label} ${owner} ${statIcon.stat} icon must keep its max for progress meaning`).toBeGreaterThan(0);
            expect(statIcon.tooltipText, `${viewport.label} ${owner} ${statIcon.stat} tooltip must explain current / max value`).toContain(`${statIcon.value}/${statIcon.max}`);
        }
    }
    expect(audit.rects.spellbookShelf, '法术书牌列必须有可量测宽度').not.toBeNull();
    expect(audit.rects.arenaViewport, '地图视窗必须存在').not.toBeNull();
    expect(audit.rects.arenaStage, '地图内容必须存在').not.toBeNull();
    expect(audit.rects.arenaViewport!.x, `${viewport.label} 地图视窗必须贴齐真实屏幕左边`).toBeLessThanOrEqual(1);
    expect(audit.rects.arenaViewport!.y, `${viewport.label} 地图视窗必须贴齐真实屏幕顶部`).toBeLessThanOrEqual(1);
    expect(audit.rects.arenaViewport!.right, `${viewport.label} 地图视窗必须覆盖真实屏幕右边`).toBeGreaterThanOrEqual(audit.viewport.width - 1);
    expect(audit.rects.arenaViewport!.bottom, `${viewport.label} 地图视窗必须覆盖真实屏幕底部`).toBeGreaterThanOrEqual(audit.viewport.height - 1);
    expect(audit.rects.arenaStage!.x, `${viewport.label} 地图内容必须铺满真实视口左边，不能缩成中间小框`).toBeLessThanOrEqual(1);
    expect(audit.rects.arenaStage!.y, `${viewport.label} 地图内容必须铺满真实视口顶部，不能缩成中间小框`).toBeLessThanOrEqual(1);
    expect(audit.rects.arenaStage!.right, `${viewport.label} 地图内容必须铺满真实视口右边`).toBeGreaterThanOrEqual(audit.viewport.width - 1);
    expect(audit.rects.arenaStage!.bottom, `${viewport.label} 地图内容必须铺满真实视口底部，底部 UI 不能成为地图裁剪边界`).toBeGreaterThanOrEqual(audit.viewport.height - 1);
    expect(
        audit.rects.spellbookShelf!.width,
        `${viewport.label} 法术书牌列必须吃掉底部主宽度，不能被旧 max-width 卡成窄条`,
    ).toBeGreaterThanOrEqual(viewport.width >= 1900 ? 1450 : 1000);
    expect(audit.rects.firstSpellbookCard, '法术书牌必须有可量测尺寸').not.toBeNull();
    expect(
        audit.rects.firstSpellbookCard!.height,
        `${viewport.label} 6 张法术书牌必须按底部主宽度自适应，1920 基线不能退回固定小卡`,
    ).toBeGreaterThanOrEqual(viewport.width >= 1900 ? 280 : 218);
    if (expectedDraftCount > 0) {
        expect(audit.rects.firstPreparedDraftCard, '计划槽位里的草稿牌必须有可量测尺寸').not.toBeNull();
        expect(audit.rects.firstPreparedDraftCard!.height, '计划槽位必须利用释放空间，不能维持低可读小卡').toBeGreaterThanOrEqual(215);
    }
    expect(audit.rects.selfHud, '己方 HUD 必须可见').not.toBeNull();
    expect(audit.rects.opponentHud, '对手 HUD 必须可见').not.toBeNull();
    expect(audit.rects.selfHintCard, '己方法师提示卡必须可见').not.toBeNull();
    expect(audit.rects.opponentHintCard, '对手法师提示卡必须可见').not.toBeNull();
    expect(audit.rects.opponentPreparedMirror, '对手隐藏计划提示必须可见').not.toBeNull();
    expect(audit.rects.lifeToggle, '全场生命眼睛必须可见').not.toBeNull();
    expect(audit.rects.scaleBadge, '地图缩放读数必须有独立锚点').not.toBeNull();
    expect(audit.rects.selfHud!.x, `${viewport.label} 计划态己方 HUD 必须贴左下顶层服务区`).toBeGreaterThanOrEqual(0);
    expect(audit.rects.selfHud!.x, `${viewport.label} 计划态己方 HUD 不能启用按场上实体驱动的大比例安全偏移`).toBeLessThanOrEqual(32);
    expect(audit.rects.selfHud!.right, `${viewport.label} 己方 HUD 集群不得越过桌面中线`).toBeLessThan(audit.viewport.width * 0.58);
    expect(audit.rects.selfHud!.y, `${viewport.label} 己方 HUD 必须处在左下独立层，不得回到左上工具带`).toBeGreaterThan(audit.viewport.height * 0.2);
    expect(audit.rects.selfHud!.bottom, '己方生命 / 提示卡必须离开底部法术书牌列，不和法术书同排').toBeLessThanOrEqual(audit.rects.firstSpellbookCard!.y - 6);
    expect(audit.rects.firstSpellbookCard!.y - audit.rects.selfHud!.bottom, `${viewport.label} 己方 HUD 必须贴近左下牌桌区，不能悬到中场`).toBeLessThanOrEqual(32);
    expect(audit.rects.opponentHud!.right).toBeGreaterThanOrEqual(audit.viewport.width - 20);
    expect(audit.rects.opponentHud!.y).toBeLessThanOrEqual(20);
    expect(audit.rects.opponentHintCard!.right, '对手提示卡必须在右上 HUD 集群内，并把右侧空间交给属性 / 动作图标 rail').toBeLessThan(audit.rects.opponentHud!.right - 32);
    expect(audit.overlaps.find((entry) => entry.name === 'life-toggle-self-hud')?.value, '生命眼睛不能压住己方提示卡槽位').toBe(false);
    expect(audit.rects.scaleBadge!.x, '地图缩放读数应离开生命眼睛槽位').toBeGreaterThanOrEqual(audit.rects.lifeToggle!.right + 8);
    expect(audit.rects.opponentPreparedMirror!.x, '对手已计划卡背必须迁到右上对手 HUD 左侧，而不是留在左上角').toBeGreaterThan(audit.viewport.width * 0.5);
    expect(audit.rects.opponentPreparedMirror!.right, '对手已计划卡背必须在对手 HUD 左侧相邻，不进入 HUD').toBeLessThanOrEqual(audit.rects.opponentHud!.x - 6);
    expect(Math.abs(audit.rects.opponentPreparedMirror!.y - audit.rects.opponentHud!.y), '对手已计划卡背必须和右上对手 HUD 顶部对齐').toBeLessThanOrEqual(3);
    expect(audit.rects.bottomGrid!.x).toBeGreaterThanOrEqual(-1);
    expect(audit.rects.bottomGrid!.right).toBeLessThanOrEqual(audit.viewport.width + 1);
    audit.overlaps.forEach((entry) => {
        expect(entry.value, `${viewport.label} 核心底部槽位不应相交: ${JSON.stringify(audit)}`).toBe(false);
    });
}

async function clearResponsivePlanScreenshots(viewport: ResponsivePlanViewport) {
    await Promise.all(Object.values(viewport.paths).map((path) => rm(path, { force: true })));
}

async function visibleDesktopSpellbookCardIds(page: Page): Promise<string[]> {
    return page.locator('[data-testid="mage-wars-desktop-spellbook-card"]').evaluateAll((cards) => cards
        .map((card) => (card as HTMLElement).dataset.sourceCardId)
        .filter((cardId): cardId is string => cardId != null));
}

async function visibleAtlasFrameLoadFailures(page: Page) {
    return page.evaluate(() => {
        const isVisible = (element: HTMLElement) => {
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none'
                && style.visibility !== 'hidden'
                && Number.parseFloat(style.opacity || '1') > 0.01
                && rect.width > 8
                && rect.height > 8;
        };
        const readRect = (element: Element) => {
            const rect = element.getBoundingClientRect();
            return {
                width: rect.width,
                height: rect.height,
            };
        };
        const auditVisibleAtlasPixels = (frame: HTMLElement, image: HTMLImageElement) => {
            try {
                const frameRect = frame.getBoundingClientRect();
                const imageRect = image.getBoundingClientRect();
                const canvas = document.createElement('canvas');
                canvas.width = 1;
                canvas.height = 1;
                const ctx = canvas.getContext('2d');
                if (!ctx) return { status: 'unavailable', reason: 'canvas-context-unavailable' };

                const points = [
                    [0.28, 0.22],
                    [0.5, 0.32],
                    [0.72, 0.46],
                    [0.35, 0.68],
                    [0.62, 0.78],
                ] as const;
                const samples: number[][] = [];
                for (const [px, py] of points) {
                    const viewportX = frameRect.left + frameRect.width * px;
                    const viewportY = frameRect.top + frameRect.height * py;
                    const sourceX = ((viewportX - imageRect.left) / imageRect.width) * image.naturalWidth;
                    const sourceY = ((viewportY - imageRect.top) / imageRect.height) * image.naturalHeight;
                    if (
                        !Number.isFinite(sourceX)
                        || !Number.isFinite(sourceY)
                        || sourceX < 0
                        || sourceY < 0
                        || sourceX >= image.naturalWidth
                        || sourceY >= image.naturalHeight
                    ) {
                        continue;
                    }
                    ctx.clearRect(0, 0, 1, 1);
                    ctx.drawImage(image, Math.floor(sourceX), Math.floor(sourceY), 1, 1, 0, 0, 1, 1);
                    const [r, g, b, a] = Array.from(ctx.getImageData(0, 0, 1, 1).data);
                    if (a > 4) samples.push([r, g, b]);
                }

                if (samples.length < 3) {
                    return { status: 'fail', reason: 'too-few-visible-samples', sampleCount: samples.length };
                }

                const channelRanges = [0, 1, 2].map((channel) => {
                    const values = samples.map((sample) => sample[channel]);
                    return Math.max(...values) - Math.min(...values);
                });
                const averageChannelRange = channelRanges.reduce((sum, value) => sum + value, 0) / channelRanges.length;
                if (averageChannelRange < 8) {
                    return {
                        status: 'fail',
                        reason: 'visible-frame-low-pixel-variance',
                        averageChannelRange: Math.round(averageChannelRange * 10) / 10,
                        sampleCount: samples.length,
                    };
                }

                return {
                    status: 'pass',
                    averageChannelRange: Math.round(averageChannelRange * 10) / 10,
                    sampleCount: samples.length,
                };
            } catch (error) {
                return {
                    status: 'unavailable',
                    reason: error instanceof Error ? error.message : String(error),
                };
            }
        };

        const frames = Array.from(
            document.querySelectorAll<HTMLElement>('[data-card-atlas-frame="true"], .atlas-shimmer'),
        ).filter(isVisible);

        return frames.flatMap((frame) => {
            const image = frame.querySelector<HTMLImageElement>('img[data-card-atlas-img="true"]');
            const base = {
                testId: frame.closest<HTMLElement>('[data-testid]')?.dataset.testid ?? null,
                tutorialId: frame.closest<HTMLElement>('[data-tutorial-id]')?.dataset.tutorialId ?? null,
                sourceCardId: frame.closest<HTMLElement>('[data-source-card-id]')?.dataset.sourceCardId ?? null,
                atlasId: frame.dataset.cardAtlasId ?? null,
                atlasIndex: frame.dataset.cardAtlasIndex ?? null,
                rect: readRect(frame),
                hasShimmer: frame.classList.contains('atlas-shimmer'),
                hasImage: image != null,
                imageComplete: image?.complete ?? false,
                naturalWidth: image?.naturalWidth ?? 0,
                naturalHeight: image?.naturalHeight ?? 0,
            };

            if (frame.classList.contains('atlas-shimmer')) {
                return [{
                    ...base,
                    reason: frame.dataset.cardAtlasFrame === 'true'
                        ? 'atlas-frame-still-shimmering'
                        : 'lazy-atlas-unresolved-shimmer',
                }];
            }
            if (!image) return [{ ...base, reason: 'atlas-frame-missing-image' }];
            if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
                return [{ ...base, reason: 'atlas-image-not-loaded' }];
            }
            const imageRect = image.getBoundingClientRect();
            if (imageRect.width <= 10 || imageRect.height <= 10) {
                return [{ ...base, reason: 'atlas-image-zero-sized' }];
            }
            const pixelAudit = auditVisibleAtlasPixels(frame, image);
            if (pixelAudit.status === 'fail') {
                if (pixelAudit.reason === 'too-few-visible-samples') return [];
                return [{
                    ...base,
                    reason: pixelAudit.reason ?? 'atlas-frame-pixel-audit-failed',
                    pixelAudit,
                }];
            }
            return [];
        });
    });
}

async function assertVisibleAtlasFramesLoaded(page: Page, label: string) {
    await expect.poll(
        async () => (await visibleAtlasFrameLoadFailures(page)).slice(0, 8),
        {
            timeout: 90_000,
            message: `${label} 截图前可见卡牌必须完成真实图像渲染，不能保留灰色 shimmer 占位`,
        },
    ).toEqual([]);
}

async function visibleActionTokenLoadFailures(page: Page) {
    return page.evaluate(() => {
        const isVisible = (element: HTMLElement) => {
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none'
                && style.visibility !== 'hidden'
                && rect.width > 8
                && rect.height > 8;
        };
        const readRect = (element: Element) => {
            const rect = element.getBoundingClientRect();
            return {
                width: Math.round(rect.width * 10) / 10,
                height: Math.round(rect.height * 10) / 10,
            };
        };

        return Array.from(document.querySelectorAll<HTMLElement>('[data-testid="mage-wars-action-token-slot"]'))
            .filter(isVisible)
            .flatMap((slot) => {
                const image = slot.querySelector<HTMLImageElement>('img');
                const imageStyle = image ? window.getComputedStyle(image) : null;
                const imageOpacity = imageStyle ? Number.parseFloat(imageStyle.opacity || '1') : 0;
                const base = {
                    tokenState: slot.dataset.actionTokenState ?? null,
                    tokenPosition: slot.dataset.actionTokenPosition ?? null,
                    owner: slot.closest<HTMLElement>('[data-owner-side]')?.dataset.ownerSide ?? null,
                    tutorialId: slot.closest<HTMLElement>('[data-tutorial-id]')?.dataset.tutorialId ?? null,
                    sourceCardId: slot.closest<HTMLElement>('[data-source-card-id]')?.dataset.sourceCardId ?? null,
                    slotRect: readRect(slot),
                    imageRect: image ? readRect(image) : null,
                    imageComplete: image?.complete ?? false,
                    naturalWidth: image?.naturalWidth ?? 0,
                    naturalHeight: image?.naturalHeight ?? 0,
                    imageOpacity,
                };

                if (!image) return [{ ...base, reason: 'action-token-missing-image' }];
                if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
                    return [{ ...base, reason: 'action-token-image-not-loaded' }];
                }
                if (imageOpacity < 0.95) return [{ ...base, reason: 'action-token-image-transparent' }];
                return [];
            });
    });
}

async function assertVisibleActionTokensLoaded(page: Page, label: string) {
    await expect.poll(
        async () => (await visibleActionTokenLoadFailures(page)).slice(0, 8),
        {
            timeout: 90_000,
            message: `${label} 截图前可见行动 token 必须完成真实图片渲染，不能停在透明加载态`,
        },
    ).toEqual([]);
}

async function screenshot(page: Page, path: string) {
    await mkdir(dirname(path), { recursive: true });
    await assertVisibleAtlasFramesLoaded(page, path);
    await assertVisibleActionTokensLoaded(page, path);
    await page.screenshot({ path, fullPage: false });
}

async function screenshotTutorialStep(page: Page, stepId: string, path: string) {
    await waitForTutorialStep(page, stepId);
    const highlightRing = page.getByTestId('tutorial-highlight-ring');
    const highlightTarget = (await highlightRing.count()) > 0
        ? await highlightRing.first().getAttribute('data-tutorial-highlight-target')
        : null;
    if (highlightTarget) {
        await waitForTutorialArenaPanSettled(page, highlightTarget);
    }
    await expect(page.getByTestId('tutorial-overlay-content')).toBeVisible({ timeout: 10_000 });
    await screenshot(page, path);
}

function basename(path: string) {
    return path.slice(path.lastIndexOf('/') + 1);
}

async function readPlanningDrafts(page: Page) {
    return page.locator('[data-testid="mage-wars-desktop-prepared-card"][data-planning-draft="true"]')
        .evaluateAll((cards) => cards
            .map((card) => ({
                sourceCardId: card.getAttribute('data-source-card-id'),
                planSlotIndex: card.getAttribute('data-plan-slot-index'),
            }))
            .sort((left, right) => String(left.planSlotIndex).localeCompare(String(right.planSlotIndex))));
}

async function assertTutorialScreenshotEvidenceSet() {
    const actual = (await readdir(SCREENSHOT_DIR, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && entry.name.endsWith('.png'))
        .map((entry) => entry.name)
        .sort();
    const expected = TUTORIAL_FLOW_SCREENSHOT_PATHS.map(basename).sort();

    expect(actual, `教程主流程截图必须只包含当前 ${expected.length} 张玩家可见教程卡截图，不能混入专题/代表态/旧图`).toEqual(expected);
    expect(actual.filter((name) => /drag|dragged|zoom|map/i.test(name)), '教程主流程截图不得混入地图拖拽/缩放专项图').toEqual([]);
    expect(actual.filter((name) => /wall|guard|heal|restore|burn|transition/i.test(name)), '基础自然主线不得混入墙体/守卫/治疗/复原术代表态专题图').toEqual([]);
}

async function assertAllVisibleImagesLoaded(page: Page) {
    await page.waitForFunction(() => Array.from(document.images)
        .filter((image) => {
            const rect = image.getBoundingClientRect();
            return rect.width > 10 && rect.height > 10;
        })
        .every((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0), undefined, { timeout: 30_000 });

    const imageAudit = await page.evaluate(() => {
        const images = Array.from(document.images).map((image) => ({
            alt: image.alt,
            naturalWidth: image.naturalWidth,
            naturalHeight: image.naturalHeight,
        }));
        return {
            missing: images.filter((image) => image.naturalWidth === 0 || image.naturalHeight === 0),
            visibleAltTexts: images.map((image) => image.alt).filter(Boolean),
        };
    });
    expect(imageAudit.missing, JSON.stringify(imageAudit.missing, null, 2)).toHaveLength(0);
    expect(imageAudit.visibleAltTexts).toEqual(expect.arrayContaining([
        '法师战争标准竞技场',
        '兽王',
        '女祭司',
    ]));
}

async function expectTutorialVisualLoaded(
    page: Page,
    options: {
        altPattern: RegExp;
        captionText: string;
        sourceFragment: string;
        message: string;
    },
) {
    const visual = page.getByTestId('tutorial-overlay-visual');
    await expect(visual).toBeVisible({ timeout: 10_000 });
    const legend = visual.locator('img');
    await expect(legend).toBeVisible({ timeout: 10_000 });
    await expect(legend).toHaveAttribute('alt', options.altPattern);
    await expect(visual).toContainText(options.captionText);
    await expect.poll(async () => legend.evaluate((element, sourceFragment) => {
        const image = element as HTMLImageElement;
        const rect = image.getBoundingClientRect();
        const resolvedSource = [
            image.currentSrc,
            image.src,
            image.getAttribute('src'),
            image.getAttribute('data-debug-current-src'),
            image.getAttribute('data-debug-rendered-src'),
        ].filter(Boolean).join('|');
        return Boolean(
            image.complete
            && image.naturalWidth > 0
            && image.naturalHeight > 0
            && rect.width > 10
            && rect.height > 10
            && resolvedSource.includes(sourceFragment),
        );
    }, options.sourceFragment), {
        timeout: 45_000,
        message: options.message,
    }).toBe(true);
}

async function expectSpellCardLegendVisualLoaded(page: Page) {
    await expectTutorialVisualLoaded(page, {
        altPattern: /法术牌图例/,
        captionText: '这张图例先说明计划法术会用到的基础字段',
        sourceFragment: 'spell-card-legend',
        message: '读牌教程必须显示并加载用户提供的法术牌图例截图',
    });
}

async function expectAttackBarLegendVisualLoaded(page: Page) {
    await expectTutorialVisualLoaded(page, {
        altPattern: /攻击条图例/,
        captionText: '当前用场上的丛林灰狼读第一次',
        sourceFragment: 'attack-bar-legend',
        message: '灰狼上场后必须显示并加载用户提供的攻击条图例截图',
    });
}

test.describe('Mage Wars tutorial', () => {
    test('单入口教程按玩家自然流程覆盖读局、读牌、计划、召唤、攻击条、公开弃牌、快速施法窗口和移动', async ({ context, page }) => {
        test.setTimeout(240_000);
        await rm(SCREENSHOT_DIR, { recursive: true, force: true });
        const diagnostics = await openMageWarsTutorial(context, page);

        await waitForTutorialStep(page, 'intro', 60_000);
        await expect(page.getByTestId('tutorial-overlay-content')).toContainText('屹立不倒的法师');
        await expect(page.getByTestId('mage-wars-board')).not.toContainText('正式竞技场');
        await assertAllVisibleImagesLoaded(page);
        await screenshotTutorialStep(page, 'intro', INTRO_SCREENSHOT_PATH);
        await clickTutorialNext(page);

        await waitForTutorialStep(page, 'self-hud');
        await expect(page.getByTestId('tutorial-overlay-content')).toContainText('生命');
        await expect(page.getByTestId('tutorial-overlay-content')).toContainText('法力');
        await expect(page.getByTestId('tutorial-overlay-content')).toContainText('聚魔');
        await screenshotTutorialStep(page, 'self-hud', SELF_HUD_SCREENSHOT_PATH);
        await clickTutorialNext(page);

        await screenshotTutorialStep(page, 'opponent-hud', OPPONENT_HUD_SCREENSHOT_PATH);
        await clickTutorialNext(page);

        await screenshotTutorialStep(page, 'stage', STAGE_SCREENSHOT_PATH);
        await clickTutorialNext(page);

        await waitForTutorialStep(page, 'channel-result');
        await expect.poll(async () => (await readMageWarsState(page)).core?.players?.['0']?.mana).toBe(20);
        await expect(page.locator('[data-testid="mage-wars-desktop-prepared-card"][data-planning-draft="true"]'))
            .toHaveCount(0);
        await screenshotTutorialStep(page, 'channel-result', CHANNEL_RESULT_SCREENSHOT_PATH);
        await clickTutorialNext(page);

        await waitForTutorialStep(page, 'spell-card-reading', 45_000);
        await expect.poll(async () => {
            const state = await readMageWarsState(page);
            return { phase: state.sys?.phase ?? null, phaseActorId: state.core?.phaseActorId ?? null };
        }, { timeout: 15_000 }).toEqual({ phase: 'planning', phaseActorId: '0' });
        await expect(page.getByTestId('mage-wars-desktop-spellbook-shelf')).toBeVisible({ timeout: 10_000 });
        await expect(page.getByTestId('tutorial-overlay-content')).toContainText('计划法术');
        await expect(page.getByTestId('tutorial-overlay-content')).toContainText('费用');
        await expect(page.getByTestId('tutorial-overlay-content')).not.toContainText('攻击骰子');
        await expectSpellCardLegendVisualLoaded(page);
        await expectMagnifyOverlayHidden(page);
        await screenshotTutorialStep(page, 'spell-card-reading', SPELL_CARD_READING_SCREENSHOT_PATH);
        await clickTutorialNext(page);

        await waitForTutorialStep(page, 'plan-open-creature-category', 45_000);
        await expect(page.getByTestId('mage-wars-desktop-spellbook-shelf')).toHaveAttribute('data-planning-enabled', 'true');
        await screenshotTutorialStep(page, 'plan-open-creature-category', PLAN_OPEN_CREATURE_CATEGORY_SCREENSHOT_PATH);
        const beforeCreatureCategoryIds = await visibleDesktopSpellbookCardIds(page);
        await clickTutorialTarget(page, 'mw-spellbook-category-creature');
        await waitForTutorialStep(page, 'plan-creature-next-page');
        await expect(page.getByTestId('mage-wars-spellbook-category-creature')).toHaveAttribute('aria-pressed', 'true');
        const firstCreaturePageIds = await visibleDesktopSpellbookCardIds(page);
        expect(firstCreaturePageIds.join('|')).not.toBe(beforeCreatureCategoryIds.join('|'));
        expect(firstCreaturePageIds, '6 张法术书页下，丛林灰狼仍不在生物第一页，翻页步骤是真实必要动作').not.toContain('2819');
        await screenshotTutorialStep(page, 'plan-creature-next-page', PLAN_CREATURE_NEXT_PAGE_SCREENSHOT_PATH);
        await clickTutorialTarget(page, 'mw-spellbook-next-page');
        await waitForTutorialStep(page, 'plan-select-wolf');
        expect(await visibleDesktopSpellbookCardIds(page)).toContain('2819');
        const wolfSpellbookCard = await findTutorialSpellbookCard(page, 2819);
        await screenshotTutorialStep(page, 'plan-select-wolf', PLAN_SELECT_WOLF_SCREENSHOT_PATH);
        await expectSpellbookInspectIconOpensWithoutPlanning(page, wolfSpellbookCard, 2819);
        await clickTutorialSpellbookCardBody(page, wolfSpellbookCard, 2819);
        await waitForTutorialStep(page, 'plan-open-incantation-category');
        await expect(page.getByTestId('mage-wars-plan-spells')).toHaveAttribute('data-plan-progress', '1/2');
        await expect(page.getByTestId('mage-wars-plan-spells')).toContainText('1/2');
        await expect(page.getByTestId('mage-wars-plan-spells')).toBeDisabled();
        await expect(page.locator('[data-testid="mage-wars-desktop-spellbook-card"][data-source-card-id="2819"]')
            .getByTestId('mage-wars-spellbook-selected-count')).toHaveCount(0);
        await expect(page.locator('[data-testid="mage-wars-desktop-prepared-card"][data-planning-draft="true"]'))
            .toHaveCount(1);
        await expect(page.locator('[data-testid="mage-wars-desktop-prepared-card"][data-planning-draft="true"][data-source-card-id="2819"]'))
            .toHaveCount(1);
        await expectPlanControlsUnblocked(page, 1);
        expect(await readPlanningDrafts(page)).toEqual([
            { sourceCardId: '2819', planSlotIndex: '1' },
        ]);
        await screenshotTutorialStep(page, 'plan-open-incantation-category', PLAN_OPEN_INCANTATION_CATEGORY_SCREENSHOT_PATH);
        const beforeIncantationCategoryIds = await visibleDesktopSpellbookCardIds(page);
        await clickTutorialTarget(page, 'mw-spellbook-category-incantation');
        await waitForTutorialStep(page, 'plan-incantation-next-page');
        await expect(page.getByTestId('mage-wars-spellbook-category-incantation')).toHaveAttribute('aria-pressed', 'true');
        const firstIncantationPageIds = await visibleDesktopSpellbookCardIds(page);
        expect(firstIncantationPageIds.join('|')).not.toBe(beforeIncantationCategoryIds.join('|'));
        expect(firstIncantationPageIds, '6 张法术书页下，兽性觉醒仍不在咒语第一页，翻页步骤是真实必要动作').not.toContain('3403');
        await screenshotTutorialStep(page, 'plan-incantation-next-page', PLAN_INCANTATION_NEXT_PAGE_SCREENSHOT_PATH);
        await clickTutorialTarget(page, 'mw-spellbook-next-page');
        await waitForTutorialStep(page, 'plan-select-rouse');
        expect(await visibleDesktopSpellbookCardIds(page)).toContain('3403');
        const rouseSpellbookCard = await findTutorialSpellbookCard(page, 3403);
        await screenshotTutorialStep(page, 'plan-select-rouse', PLAN_SELECT_ROUSE_SCREENSHOT_PATH);
        await clickTutorialSpellbookCardBody(page, rouseSpellbookCard, 3403);
        await waitForTutorialStep(page, 'plan-confirm');
        await expect(page.getByTestId('mage-wars-plan-spells')).toHaveAttribute('data-plan-progress', '2/2');
        await expect(page.getByTestId('mage-wars-plan-spells')).toContainText('2/2');
        await expect(page.getByTestId('mage-wars-plan-spells')).toBeEnabled();
        await expect(page.locator('[data-testid="mage-wars-desktop-spellbook-card"][data-source-card-id="3403"]')
            .getByTestId('mage-wars-spellbook-selected-count')).toHaveCount(0);
        await expect(page.locator('[data-testid="mage-wars-desktop-prepared-card"][data-planning-draft="true"]'))
            .toHaveCount(2);
        await expect(page.locator('[data-testid="mage-wars-desktop-prepared-card"][data-planning-draft="true"][data-source-card-id="2819"]'))
            .toHaveCount(1);
        await expect(page.locator('[data-testid="mage-wars-desktop-prepared-card"][data-planning-draft="true"][data-source-card-id="3403"]'))
            .toHaveCount(1);
        await expect.poll(async () => page.locator('[data-testid="mage-wars-desktop-prepared-card"][data-planning-draft="true"]')
            .evaluateAll((cards) => cards
                .map((card) => card.getAttribute('data-source-card-id'))
                .filter(Boolean)
                .sort())).toEqual(['2819', '3403']);
        expect(await readPlanningDrafts(page)).toEqual([
            { sourceCardId: '2819', planSlotIndex: '1' },
            { sourceCardId: '3403', planSlotIndex: '2' },
        ]);
        await expectPlanControlsUnblocked(page, 2);
        await screenshotTutorialStep(page, 'plan-confirm', PLAN_CONFIRM_SCREENSHOT_PATH);
        await clickTutorialTarget(page, 'mw-plan-spells');
        await waitForTutorialStep(page, 'prepared-and-hidden');
        await expectTutorialStepNotVisible(page, 'prepare-opponent-spells');
        await expect.poll(async () => (await readMageWarsState(page)).core?.players?.['0']?.preparedSpellCardIds).toEqual([
            2819,
            3403,
        ]);
        await expect(page.locator('[data-tutorial-id="mw-prepared-card-2819"]')).toBeVisible({ timeout: 10_000 });
        await expect(page.locator('[data-tutorial-id="mw-prepared-card-3403"]')).toBeVisible({ timeout: 10_000 });
        await screenshotTutorialStep(page, 'prepared-and-hidden', PREPARED_HIDDEN_SCREENSHOT_PATH);
        await clickTutorialNext(page);

        await waitForTutorialStep(page, 'deploy-select-wolf');
        await screenshotTutorialStep(page, 'deploy-select-wolf', DEPLOY_SELECT_WOLF_SCREENSHOT_PATH);
        await clickTutorialTarget(page, 'mw-prepared-card-2819');
        await waitForTutorialStep(page, 'deploy-target-zone');
        await expect(page.locator('[data-tutorial-id="mw-zone-a3"][data-legal-target-zone="true"]')).toBeVisible({ timeout: 10_000 });
        await screenshotTutorialStep(page, 'deploy-target-zone', DEPLOY_TARGET_ZONE_SCREENSHOT_PATH);
        await clickTutorialTarget(page, 'mw-zone-a3');
        await waitForTutorialStep(page, 'wolf-summoned');
        await expect.poll(async () => {
            const state = await readMageWarsState(page);
            const wolf = Object.values(state.core?.objects ?? {}).find((object) => object.sourceSpellCardId === 2819);
            return { zoneId: wolf?.zoneId ?? null, actionReady: wolf?.actionReady ?? null };
        }, { timeout: 15_000 }).toEqual({ zoneId: 'a3', actionReady: false });
        const summonedWolf = page.locator('[data-tutorial-id="mw-field-object-2819"]');
        await expect(summonedWolf).toBeVisible({ timeout: 10_000 });
        await expect(summonedWolf).toHaveAttribute('data-action-ready', 'false');
        await expect(summonedWolf).toHaveAttribute('data-action-token-state', 'spent');
        await expect(summonedWolf).not.toHaveAttribute('data-visual-action-state', 'spent');
        await expect(summonedWolf).not.toHaveClass(/grayscale/);
        await expect(summonedWolf).not.toHaveClass(/opacity-55/);
        const summonedWolfActionToken = summonedWolf.locator('[data-testid="mage-wars-action-token-slot"]');
        await expect(summonedWolfActionToken).toHaveAttribute('data-action-token-position', 'entity-left-inside-midline');
        await expect(summonedWolfActionToken).toHaveAttribute('data-action-token-image-key', /ready-token-back/);
        await screenshotTutorialStep(page, 'wolf-summoned', WOLF_SUMMONED_SCREENSHOT_PATH);
        await clickTutorialNext(page);

        await waitForTutorialStep(page, 'attack-bar-reading', 45_000);
        await expect(summonedWolf).toBeVisible({ timeout: 10_000 });
        await expect(page.getByTestId('tutorial-overlay-content')).toContainText('丛林灰狼');
        await expect(page.getByTestId('tutorial-overlay-content')).toContainText('攻击条');
        await expect(page.getByTestId('tutorial-overlay-content')).toContainText('快速');
        await expect(page.getByTestId('tutorial-overlay-content')).toContainText('攻击骰子');
        await expectAttackBarLegendVisualLoaded(page);
        await expectMagnifyOverlayHidden(page);
        await screenshotTutorialStep(page, 'attack-bar-reading', ATTACK_BAR_READING_SCREENSHOT_PATH);
        await clickTutorialNext(page);

        await waitForTutorialStep(page, 'rouse-select-spell');
        await screenshotTutorialStep(page, 'rouse-select-spell', ROUSE_SELECT_SPELL_SCREENSHOT_PATH);
        await clickTutorialTarget(page, 'mw-prepared-card-3403');
        await waitForTutorialStep(page, 'rouse-target-wolf');
        await expect(page.locator('[data-tutorial-id="mw-field-object-2819"][data-field-card-role="target"]')).toBeVisible({ timeout: 10_000 });
        await screenshotTutorialStep(page, 'rouse-target-wolf', ROUSE_TARGET_WOLF_SCREENSHOT_PATH);
        await clickTutorialTarget(page, 'mw-field-object-2819');
        await waitForTutorialStep(page, 'pass-your-deployment', 45_000);
        await expect.poll(async () => {
            const state = await readMageWarsState(page);
            const wolf = Object.values(state.core?.objects ?? {}).find((object) => object.sourceSpellCardId === 2819);
            return {
                phase: state.sys?.phase ?? null,
                phaseActorId: state.core?.phaseActorId ?? null,
                zoneId: wolf?.zoneId ?? null,
                actionReady: wolf?.actionReady ?? null,
                discard: state.core?.players?.['0']?.discardSpellCardIds ?? [],
            };
        }, { timeout: 15_000 }).toEqual({
            phase: 'deployment',
            phaseActorId: '0',
            zoneId: 'a3',
            actionReady: true,
            discard: [3403, 2819],
        });
        await expect(summonedWolf).toHaveAttribute('data-action-ready', 'true');
        await expect(summonedWolf).toHaveAttribute('data-action-token-state', 'ready');
        await expect(summonedWolf).not.toHaveAttribute('data-visual-action-state', 'spent');
        await expect(summonedWolf).not.toHaveClass(/grayscale/);
        await expect(summonedWolfActionToken).toHaveAttribute('data-action-token-position', 'entity-left-inside-midline');
        await expect(summonedWolfActionToken).toHaveAttribute('data-action-token-image-key', /ready-token-front/);
        await screenshotTutorialStep(page, 'pass-your-deployment', PASS_DEPLOYMENT_SCREENSHOT_PATH);
        await clickTutorialTarget(page, 'mw-turn-end');
        await expectTutorialStepNotVisible(page, 'opponent-deploy');
        await expectTutorialStepNotVisible(page, 'opponent-attack-spell');
        await expectTutorialStepNotVisible(page, 'opponent-deployment-results');
        await waitForTutorialStep(page, 'opponent-public-view', 60_000);
        await expect.poll(async () => {
            const state = await readMageWarsState(page);
            const cleric = Object.values(state.core?.objects ?? {}).find((object) => object.sourceSpellCardId === 2811);
            return {
                phase: state.sys?.phase ?? null,
                phaseActorId: state.core?.phaseActorId ?? null,
                clericZoneId: cleric?.zoneId ?? null,
                clericDamaged: (cleric?.damage ?? 0) > 0,
                opponentDiscard: state.core?.players?.['1']?.discardSpellCardIds ?? [],
            };
        }, { timeout: 30_000 }).toEqual({
            phase: 'deployment',
            phaseActorId: '1',
            clericZoneId: 'd1',
            clericDamaged: true,
            opponentDiscard: [1706, 2811],
        });
        const mainDiscardPile = page.locator('[data-tutorial-id="mw-discard"]');
        await expect(mainDiscardPile).toBeVisible({ timeout: 10_000 });
        await expect(mainDiscardPile).toHaveAttribute('data-discard-owner-role', 'self');
        await expect(mainDiscardPile).toHaveAttribute('data-discard-owner-id', '0');
        await expect(page.locator('[data-tutorial-id="mw-opponent-discard"]')).toHaveCount(0);
        await expect(page.locator('[data-testid="mage-wars-opponent-discard-pile"]')).toHaveCount(0);
        await screenshotTutorialStep(page, 'opponent-public-view', OPPONENT_PUBLIC_VIEW_SCREENSHOT_PATH);
        await clickTutorialTarget(page, 'mw-opponent-view-toggle');

        await waitForTutorialStep(page, 'discard-reading');
        await expect(page.getByTestId('mage-wars-board')).toHaveAttribute('data-mage-wars-public-view-player-id', '1');
        await expect(page.getByTestId('mage-wars-board')).toHaveAttribute('data-mage-wars-public-view-role', 'opponent');
        const publicViewBanner = page.getByTestId('mage-wars-public-view-banner');
        await expect(publicViewBanner).toBeVisible({ timeout: 10_000 });
        const viewport = page.viewportSize();
        expect(viewport).not.toBeNull();
        const publicViewBannerMetrics = await publicViewBanner.evaluate((node) => {
            const shell = node.getBoundingClientRect();
            const panel = node.firstElementChild?.getBoundingClientRect();
            return {
                shellCenterX: shell.left + shell.width / 2,
                panelCenterX: panel ? panel.left + panel.width / 2 : null,
            };
        });
        expect(Math.abs(publicViewBannerMetrics.shellCenterX - viewport!.width / 2)).toBeLessThanOrEqual(4);
        expect(publicViewBannerMetrics.panelCenterX).not.toBeNull();
        expect(Math.abs((publicViewBannerMetrics.panelCenterX ?? 0) - viewport!.width / 2)).toBeLessThanOrEqual(32);
        await expect(mainDiscardPile).toHaveAttribute('data-discard-owner-role', 'opponent');
        await expect(mainDiscardPile).toHaveAttribute('data-discard-owner-id', '1');
        await expect(mainDiscardPile).toContainText('弃牌 2');
        await expect(page.locator('[data-tutorial-id="mw-opponent-discard"]')).toHaveCount(0);
        await expect(page.locator('[data-testid="mage-wars-opponent-discard-pile"]')).toHaveCount(0);
        await screenshotTutorialStep(page, 'discard-reading', DISCARD_SCREENSHOT_PATH);
        await clickTutorialNext(page);

        await waitForTutorialStep(page, 'back-to-self-view');
        await screenshotTutorialStep(page, 'back-to-self-view', BACK_TO_SELF_VIEW_SCREENSHOT_PATH);
        await clickTutorialTarget(page, 'mw-back-to-self-view');
        await expect(page.getByTestId('mage-wars-board')).toHaveAttribute('data-mage-wars-public-view-player-id', '0');
        await expect(page.getByTestId('mage-wars-board')).toHaveAttribute('data-mage-wars-public-view-role', 'self');
        await expect(mainDiscardPile).toHaveAttribute('data-discard-owner-role', 'self');
        await expect(mainDiscardPile).toHaveAttribute('data-discard-owner-id', '0');

        await expectTutorialStepNotVisible(page, 'opponent-pass-deployment');
        await waitForTutorialStep(page, 'skip-initiative-quickcast', 60_000);
        await expect.poll(async () => {
            const state = await readMageWarsState(page);
            return {
                phase: state.sys?.phase ?? null,
                phaseActorId: state.core?.phaseActorId ?? null,
            };
        }, { timeout: 15_000 }).toEqual({
            phase: 'initiativeQuickcast',
            phaseActorId: '0',
        });
        await expect(page.getByTestId('tutorial-overlay-content')).toContainText('快速施法');
        await screenshotTutorialStep(page, 'skip-initiative-quickcast', QUICKCAST_PASS_SCREENSHOT_PATH);
        await clickTutorialTarget(page, 'mw-turn-end');

        await expectTutorialStepNotVisible(page, 'opponent-pass-initiative-quickcast');
        await waitForTutorialStep(page, 'move-select-wolf', 60_000);
        await expect.poll(async () => {
            const state = await readMageWarsState(page);
            return {
                phase: state.sys?.phase ?? null,
                phaseActorId: state.core?.phaseActorId ?? null,
            };
        }, { timeout: 15_000 }).toEqual({
            phase: 'creatureAction',
            phaseActorId: '0',
        });
        await screenshotTutorialStep(page, 'move-select-wolf', MOVE_SELECT_WOLF_SCREENSHOT_PATH);
        await clickTutorialTarget(page, 'mw-field-object-2819');
        await waitForTutorialStep(page, 'move-target-zone');
        await expect(page.locator('[data-tutorial-id="mw-zone-a2"][data-legal-move-zone="true"]')).toBeVisible({ timeout: 10_000 });
        await screenshotTutorialStep(page, 'move-target-zone', MOVE_TARGET_ZONE_SCREENSHOT_PATH);
        await clickTutorialTarget(page, 'mw-zone-a2');
        await waitForTutorialStep(page, 'finish', 45_000);
        await expect.poll(async () => {
            const state = await readMageWarsState(page);
            const wolf = Object.values(state.core?.objects ?? {}).find((object) => object.sourceSpellCardId === 2819);
            return { zoneId: wolf?.zoneId ?? null, actionReady: wolf?.actionReady ?? null };
        }, { timeout: 15_000 }).toEqual({ zoneId: 'a2', actionReady: false });
        await screenshotTutorialStep(page, 'finish', FINISH_SCREENSHOT_PATH);
        await assertTutorialScreenshotEvidenceSet();

        await assertNoFatalFrontendErrors([{ label: 'mage-wars-tutorial-natural-flow', diagnostics }]);
    });

    async function runResponsivePlanClickScenario(context: BrowserContext, page: Page, viewport: ResponsivePlanViewport) {
        test.setTimeout(120_000);
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await clearResponsivePlanScreenshots(viewport);
        const diagnostics = await openMageWarsTutorial(context, page);

        await waitForTutorialStep(page, 'intro', 60_000);
        await clickTutorialNext(page);
        await waitForTutorialStep(page, 'self-hud');
        await clickTutorialNext(page);
        for (const stepId of ['opponent-hud', 'stage']) {
            await waitForTutorialStep(page, stepId);
            await clickTutorialNext(page);
        }
        await waitForTutorialStep(page, 'channel-result');
        await clickTutorialNext(page);
        await waitForTutorialStep(page, 'spell-card-reading', 45_000);
        await clickTutorialNext(page);
        await waitForTutorialStep(page, 'plan-open-creature-category', 45_000);

        await expect(page.getByTestId('mage-wars-desktop-spellbook-shelf')).toHaveAttribute('data-planning-enabled', 'true');
        await expect(page.getByTestId('mage-wars-desktop-spellbook-shelf')).toHaveAttribute('data-visible-card-count', '6');
        await expect(page.getByTestId('mage-wars-desktop-ui-plane')).toHaveAttribute('data-mage-wars-spellbook-visible-card-count', '6');
        await expectMageWarsReadableViewport(page, viewport);
        await clickTutorialTarget(page, 'mw-spellbook-category-creature');
        await waitForTutorialStep(page, 'plan-creature-next-page');
        expect(await visibleDesktopSpellbookCardIds(page)).not.toContain('2819');
        await clickTutorialTarget(page, 'mw-spellbook-next-page');
        await waitForTutorialStep(page, 'plan-select-wolf');
        expect(await visibleDesktopSpellbookCardIds(page)).toContain('2819');
        const wolfSpellbookCard = await findTutorialSpellbookCard(page, 2819);
        await expectSpellbookInspectIconOpensWithoutPlanning(page, wolfSpellbookCard, 2819);
        await clickTutorialSpellbookCardBody(page, wolfSpellbookCard, 2819);
        await waitForTutorialStep(page, 'plan-open-incantation-category');

        await expect(page.getByTestId('mage-wars-plan-spells')).toHaveAttribute('data-plan-progress', '1/2');
        await expect(page.getByTestId('mage-wars-plan-spells')).toBeDisabled();
        await expect(page.locator('[data-testid="mage-wars-desktop-prepared-card"][data-planning-draft="true"][data-source-card-id="2819"]'))
            .toHaveCount(1);
        expect(await readPlanningDrafts(page)).toEqual([
            { sourceCardId: '2819', planSlotIndex: '1' },
        ]);
        await expectPlanControlsUnblocked(page, 1);
        await expectMageWarsReadableViewport(page, viewport, 1);
        await screenshot(page, viewport.paths.oneOfTwo);

        await clickPlanningDraftCardBody(page, 2819, 1);
        await expect(page.locator('[data-testid="mage-wars-desktop-prepared-card"][data-planning-draft="true"]'))
            .toHaveCount(0);
        await expect(page.getByTestId('mage-wars-plan-spells')).toHaveCount(0);
        expect(await readPlanningDrafts(page)).toEqual([]);
        await expectMageWarsReadableViewport(page, viewport);
        await screenshot(page, viewport.paths.slotCancel);

        await clickTutorialSpellbookCardBody(page, wolfSpellbookCard, 2819);
        await expect(page.getByTestId('mage-wars-plan-spells')).toHaveAttribute('data-plan-progress', '1/2');
        await expect(page.locator('[data-testid="mage-wars-desktop-prepared-card"][data-planning-draft="true"][data-source-card-id="2819"]'))
            .toHaveCount(1);
        expect(await readPlanningDrafts(page)).toEqual([
            { sourceCardId: '2819', planSlotIndex: '1' },
        ]);
        await expectPlanControlsUnblocked(page, 1);
        await expectMageWarsReadableViewport(page, viewport, 1);
        await screenshot(page, viewport.paths.reselect);

        await assertNoFatalFrontendErrors([{ label: `mage-wars-tutorial-${viewport.label}-plan-click`, diagnostics }]);
    }

    test('1366x768 真实卡面点击计划且计划槽位不被遮挡', async ({ context, page }) => {
        await runResponsivePlanClickScenario(context, page, RESPONSIVE_PLAN_VIEWPORTS[0]);
    });

    test('1920x1080 真实卡面点击计划且计划槽位不被遮挡', async ({ context, page }) => {
        await runResponsivePlanClickScenario(context, page, RESPONSIVE_PLAN_VIEWPORTS[1]);
    });
});
