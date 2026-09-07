import { expect, test, type Locator, type Page } from '@playwright/test';
import { resolve } from 'path';
import { type BetrayalCore } from '../../src/games/betrayal/game';
import { BETRAYAL_COMMANDS } from '../../src/games/betrayal/commands';
import { BETRAYAL_DISCOVERY_POOLS } from '../../src/games/betrayal/scenarioConfig';
import {
    applyBetrayalCommand,
    createBetrayalScriptedRandom,
    createStartedFirstScenarioCore,
} from '../../src/games/betrayal/testing/firstScenarioTestUtils';
import {
    assertNoFatalFrontendErrors,
    attachPageDiagnostics,
} from '../helpers/common';
import {
    clickDiscoveryBackdropAndExpectStillVisible,
    expectPhysicalDiceSeparated,
    expectVisiblePhysicalDiceBox,
    initBetrayalContext,
    injectCore,
    saveScreenshot,
    setHarnessRandomQueue,
    waitForBetrayalPageReady,
    waitForPhysicalDiceSettled,
    warmBetrayalFrontend,
} from './betrayalTestHelpers';

const EVIDENCE_DIR = resolve(process.cwd(), 'evidence/betrayal-room-effect-representatives');
const CHAPEL_BEFORE_SCREENSHOT = `${EVIDENCE_DIR}/01-礼拜堂-发现前属性栏.png`;
const CHAPEL_AFTER_SCREENSHOT = `${EVIDENCE_DIR}/02-礼拜堂-发现后神志加点.png`;
const DIRECT_ROOM_EFFECT_MATRIX_EVIDENCE_DIR = resolve(process.cwd(), 'evidence/betrayal-room-effect-confirmation-matrix');
const FURNACE_HINT_SCREENSHOT = `${EVIDENCE_DIR}/03-火炉房-结束回合前提示.png`;
const FURNACE_RESOLVED_SCREENSHOT = `${EVIDENCE_DIR}/04-火炉房-结算后反馈.png`;
const JUNK_OBSTACLE_SCREENSHOT = `${EVIDENCE_DIR}/05-杂物间-障碍标记.png`;
const JUNK_MOVE_COST_SCREENSHOT = `${EVIDENCE_DIR}/06-杂物间-离开扣2点移动.png`;
const FIXED_LINK_CROSS_FLOOR_HINT_SCREENSHOT = `${EVIDENCE_DIR}/07-密道楼梯-跨层移动切层提示.png`;
const FIXED_LINK_MOVE_RESOLVED_SCREENSHOT = `${EVIDENCE_DIR}/08-密道楼梯-移动到门厅.png`;
const COLLAPSED_ROOM_FULL_CHAIN_EVIDENCE_DIR = resolve(process.cwd(), 'evidence/山屋惊魂-倒塌房间速度检定完整链路');
const COLLAPSED_ROOM_READY_SCREENSHOT = `${COLLAPSED_ROOM_FULL_CHAIN_EVIDENCE_DIR}/01-倒塌房间已翻出牌桌可操作.jpg`;
const COLLAPSED_ROOM_STATUS_SCREENSHOT = `${COLLAPSED_ROOM_FULL_CHAIN_EVIDENCE_DIR}/02-倒塌房间结束回合检定状态可见.jpg`;
const COLLAPSED_ROOM_HINT_SCREENSHOT = `${COLLAPSED_ROOM_FULL_CHAIN_EVIDENCE_DIR}/03-倒塌房间速度坠落提示可见.jpg`;
const COLLAPSED_ROOM_END_TURN_READY_SCREENSHOT = `${COLLAPSED_ROOM_FULL_CHAIN_EVIDENCE_DIR}/04-结束回合触发速度检定前.jpg`;
const COLLAPSED_ROOM_DICE_SCREENSHOT = `${COLLAPSED_ROOM_FULL_CHAIN_EVIDENCE_DIR}/05-速度检定骰盘停稳.jpg`;
const COLLAPSED_ROOM_DAMAGE_SCREENSHOT = `${COLLAPSED_ROOM_FULL_CHAIN_EVIDENCE_DIR}/06-坠落后伤害分配面板.jpg`;
const COLLAPSED_ROOM_SETTLED_SCREENSHOT = `${COLLAPSED_ROOM_FULL_CHAIN_EVIDENCE_DIR}/07-坠落后地下室起始点回牌桌可操作.jpg`;
const COLLAPSED_ROOM_MOBILE_EVIDENCE_DIR = resolve(process.cwd(), 'evidence/山屋惊魂-移动端结束回合投骰阻塞完整链路');
const COLLAPSED_ROOM_MOBILE_DICE_SCREENSHOT = `${COLLAPSED_ROOM_MOBILE_EVIDENCE_DIR}/01-移动端横屏-速度检定骰盘阻塞.jpg`;
const COLLAPSED_ROOM_MOBILE_DAMAGE_SCREENSHOT = `${COLLAPSED_ROOM_MOBILE_EVIDENCE_DIR}/02-移动端横屏-确认后伤害分配阻塞.jpg`;
const COLLAPSED_ROOM_MOBILE_SETTLED_SCREENSHOT = `${COLLAPSED_ROOM_MOBILE_EVIDENCE_DIR}/03-移动端横屏-分配伤害后下一位行动.jpg`;
const MYSTIC_ELEVATOR_FULL_CHAIN_EVIDENCE_DIR = resolve(process.cwd(), 'evidence/山屋惊魂-神秘电梯移动骰盘完整链路');
const MYSTIC_ELEVATOR_READY_SCREENSHOT = `${MYSTIC_ELEVATOR_FULL_CHAIN_EVIDENCE_DIR}/01-神秘电梯已翻出牌桌可操作.jpg`;
const MYSTIC_ELEVATOR_BUTTON_SCREENSHOT = `${MYSTIC_ELEVATOR_FULL_CHAIN_EVIDENCE_DIR}/02-神秘电梯房间效果按钮可见.jpg`;
const MYSTIC_ELEVATOR_TRIGGER_READY_SCREENSHOT = `${MYSTIC_ELEVATOR_FULL_CHAIN_EVIDENCE_DIR}/03-启动神秘电梯前.jpg`;
const MYSTIC_ELEVATOR_DICE_SCREENSHOT = `${MYSTIC_ELEVATOR_FULL_CHAIN_EVIDENCE_DIR}/04-神秘电梯2骰移动骰盘停稳.jpg`;
const MYSTIC_ELEVATOR_MOVED_SCREENSHOT = `${MYSTIC_ELEVATOR_FULL_CHAIN_EVIDENCE_DIR}/05-神秘电梯移动到一层开放门位.jpg`;
const MYSTIC_ELEVATOR_SETTLED_SCREENSHOT = `${MYSTIC_ELEVATOR_FULL_CHAIN_EVIDENCE_DIR}/06-神秘电梯移动后回牌桌继续可操作.jpg`;
const LAUNDRY_CHUTE_FULL_CHAIN_EVIDENCE_DIR = resolve(process.cwd(), 'evidence/山屋惊魂-洗衣滑槽直接移动完整链路');
const LAUNDRY_CHUTE_READY_SCREENSHOT = `${LAUNDRY_CHUTE_FULL_CHAIN_EVIDENCE_DIR}/01-地下室起始点探索前牌桌可操作.jpg`;
const LAUNDRY_CHUTE_TARGET_SCREENSHOT = `${LAUNDRY_CHUTE_FULL_CHAIN_EVIDENCE_DIR}/02-选择地下未知房间目标.jpg`;
const LAUNDRY_CHUTE_REVEALED_SCREENSHOT = `${LAUNDRY_CHUTE_FULL_CHAIN_EVIDENCE_DIR}/03-洗衣滑槽翻出并落位.jpg`;
const LAUNDRY_CHUTE_STATUS_SCREENSHOT = `${LAUNDRY_CHUTE_FULL_CHAIN_EVIDENCE_DIR}/04-结束回合滑落提示可见.jpg`;
const LAUNDRY_CHUTE_MOVED_SCREENSHOT = `${LAUNDRY_CHUTE_FULL_CHAIN_EVIDENCE_DIR}/05-结束回合后滑落到地下室起始点.jpg`;
const LAUNDRY_CHUTE_SETTLED_SCREENSHOT = `${LAUNDRY_CHUTE_FULL_CHAIN_EVIDENCE_DIR}/06-洗衣滑槽结算后回牌桌继续可操作.jpg`;

type HarnessSnapshot = {
    core: BetrayalCore;
};

type HarnessWindow = Window & {
    __BG_TEST_HARNESS__?: {
        state?: {
            get?: () => HarnessSnapshot;
        };
    };
};

type OpenBetrayalPageOptions = {
    viewportSize?: { width: number; height: number };
    forceCoarsePointer?: boolean;
};

const openBetrayalPage = async (
    page: Page,
    context: Parameters<typeof initBetrayalContext>[0],
    label: string,
    options: OpenBetrayalPageOptions = {},
) => {
    await initBetrayalContext(context);
    const diagnostics = attachPageDiagnostics(page, label);
    await page.setViewportSize(options.viewportSize ?? { width: 1600, height: 900 });
    await warmBetrayalFrontend(context);
    await page.goto(
        `/play/betrayal?seat1=human&seat2=human&seat3=human${options.forceCoarsePointer ? '&bgForceCoarsePointer=1' : ''}`,
        { waitUntil: 'domcontentloaded' },
    );
    await waitForBetrayalPageReady(page);
    return diagnostics;
};

const clickMoveToRoom = async (page: Page, roomId: string) => {
    await dismissDiscoveryPanelIfVisible(page);
    await page.getByTestId('betrayal-action-move').click();
    await page.getByTestId(`betrayal-room-${roomId}`).click();
};

const confirmRoomPlacementIfVisible = async (page: Page): Promise<void> => {
    const placementPanel = page.getByTestId('betrayal-room-placement-panel');
    if (!await placementPanel.isVisible({ timeout: 1000 }).catch(() => false)) {
        return;
    }
    const confirmButton = page.getByTestId('betrayal-room-placement-confirm');
    await expect(confirmButton).toBeEnabled();
    await confirmButton.click();
    await expect(placementPanel).toBeHidden({ timeout: 30000 });
};

const dismissDiscoveryPanelIfVisible = async (page: Page) => {
    const discoveryPanel = page.getByTestId('betrayal-discovery-panel');
    if (!await discoveryPanel.isVisible({ timeout: 800 }).catch(() => false)) {
        return;
    }

    for (let safety = 0; safety < 8; safety += 1) {
        const continueButton = discoveryPanel.getByTestId('betrayal-discovery-continue');
        if (!await continueButton.isVisible({ timeout: 500 }).catch(() => false)) {
            break;
        }
        await continueButton.click();
        if (!await discoveryPanel.isVisible({ timeout: 500 }).catch(() => false)) {
            return;
        }
    }
    if (!await discoveryPanel.isVisible({ timeout: 500 }).catch(() => false)) {
        return;
    }

    await clickDiscoveryBackdropAndExpectStillVisible(page, discoveryPanel);
    const continueButton = discoveryPanel.getByTestId('betrayal-discovery-continue');
    await expect(
        continueButton,
        '发现牌浮层必须通过明确继续/确认按钮关闭，不能用空白点击关闭。',
    ).toBeVisible();
    await expect(continueButton).toBeEnabled();
    await continueButton.click();
    await expect(discoveryPanel).toBeHidden({ timeout: 30000 });
};

const readCurrentCore = async (page: Page): Promise<BetrayalCore> => (
    page.evaluate(() => {
        const snapshot = (window as HarnessWindow).__BG_TEST_HARNESS__?.state?.get?.();
        if (!snapshot?.core) {
            throw new Error('betrayal test harness state reader unavailable');
        }
        return snapshot.core;
    })
);

const expectRollPanelUsesAdaptiveOpenDock = async (page: Page, rollPanel: Locator, label: string) => {
    await expect(rollPanel).toHaveAttribute('data-roll-panel-style', 'open-table-transparent');
    const resultStage = rollPanel.getByTestId('betrayal-recent-roll-result-stage');
    const total = rollPanel.getByTestId('betrayal-recent-roll-total');
    const outcome = rollPanel.getByTestId('betrayal-recent-roll-outcome');
    const breakdown = rollPanel.getByTestId('betrayal-recent-roll-breakdown');
    await expect(resultStage).toHaveAttribute('data-result-layout', 'split-primary-total');
    await expect(total).toHaveAttribute('data-result-emphasis', 'primary-total');
    await expect(outcome).toHaveAttribute('data-result-role', 'outcome-primary');
    await expect(breakdown).toContainText('骰面合计');
    await expect(breakdown).toContainText('加值');
    const geometry = await rollPanel.evaluate((panel) => {
        const rect = panel.getBoundingClientRect();
        const rail = document.querySelector('[data-testid="betrayal-status-rail"]');
        const railRect = rail?.getBoundingClientRect();
        const resultStage = panel.querySelector('[data-testid="betrayal-recent-roll-result-stage"]');
        const total = panel.querySelector('[data-testid="betrayal-recent-roll-total"]');
        const outcome = panel.querySelector('[data-testid="betrayal-recent-roll-outcome"]');
        if (!resultStage || !total || !outcome) {
            throw new Error('recent roll result stage, total, or outcome is missing');
        }
        const resultStageRect = resultStage.getBoundingClientRect();
        const totalRect = total.getBoundingClientRect();
        const outcomeRect = outcome.getBoundingClientRect();
        return {
            panel: {
                left: rect.left,
                right: rect.right,
                top: rect.top,
                bottom: rect.bottom,
                width: rect.width,
                height: rect.height,
                centerX: rect.left + rect.width / 2,
                centerY: rect.top + rect.height / 2,
            },
            resultStage: {
                left: resultStageRect.left,
                right: resultStageRect.right,
                top: resultStageRect.top,
                bottom: resultStageRect.bottom,
                centerX: resultStageRect.left + resultStageRect.width / 2,
                centerY: resultStageRect.top + resultStageRect.height / 2,
            },
            outcome: {
                left: outcomeRect.left,
                right: outcomeRect.right,
                top: outcomeRect.top,
                bottom: outcomeRect.bottom,
                centerX: outcomeRect.left + outcomeRect.width / 2,
                centerY: outcomeRect.top + outcomeRect.height / 2,
            },
            total: {
                left: totalRect.left,
                right: totalRect.right,
                top: totalRect.top,
                bottom: totalRect.bottom,
                width: totalRect.width,
                height: totalRect.height,
                centerX: totalRect.left + totalRect.width / 2,
                centerY: totalRect.top + totalRect.height / 2,
            },
            rail: railRect
                ? {
                    left: railRect.left,
                    right: railRect.right,
                    top: railRect.top,
                    bottom: railRect.bottom,
                }
                : null,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
        };
    });
    expect(
        geometry.panel.width,
        `${label}骰盘不能占据整块中央大空间`,
    ).toBeLessThanOrEqual(geometry.viewportWidth * 0.52);
    expect(
        geometry.panel.height,
        `${label}骰盘必须是结果坞，不应撑成全屏遮挡层`,
    ).toBeLessThanOrEqual(geometry.viewportHeight * 0.46);
    expect(
        geometry.panel.top,
        `${label}骰盘不能停在右上角顶部状态区`,
    ).toBeGreaterThan(geometry.viewportHeight * 0.22);
    expect(
        geometry.panel.bottom,
        `${label}骰盘应让出上方牌面/事件卡阅读空间，而不是完全居中压住`,
    ).toBeGreaterThan(geometry.viewportHeight * 0.58);
    expect(
        Math.abs(geometry.resultStage.centerX - geometry.panel.centerX),
        `${label}结果舞台必须仍在投掷面板中央，不能漂到角落`,
    ).toBeLessThanOrEqual(28);
    expect(
        geometry.outcome.centerX,
        `${label}结论文字应在结果舞台左侧承担语义主位，不能和总点数全挤在中线`,
    ).toBeLessThan(geometry.resultStage.centerX);
    expect(
        geometry.total.centerX,
        `${label}总点数应在结果舞台右侧承担数值主位，不能回到全居中堆叠`,
    ).toBeGreaterThan(geometry.resultStage.centerX);
    expect(
        geometry.total.right,
        `${label}总点数不能退到右上角状态栏方向`,
    ).toBeLessThanOrEqual(geometry.panel.right);
    expect(
        geometry.resultStage.top,
        `${label}结果带必须承接在骰盘下方，而不是贴顶部状态区`,
    ).toBeGreaterThan(geometry.panel.centerY);
    expect(
        geometry.total.height,
        `${label}总点数字号必须足够醒目，但不能大到压过结论`,
    ).toBeGreaterThanOrEqual(28);
    expect(
        geometry.total.height,
        `${label}总点数字号不能过大导致主次不分`,
    ).toBeLessThanOrEqual(48);
    if (geometry.rail) {
        const overlapsRail =
            geometry.panel.left < geometry.rail.right &&
            geometry.panel.right > geometry.rail.left &&
            geometry.panel.top < geometry.rail.bottom &&
            geometry.panel.bottom > geometry.rail.top;
        expect(overlapsRail, `${label}骰盘不能侵入右侧状态栏`).toBe(false);
    }
};

const createCollapsedRoomSpeedCheckCore = () => {
    let core = createStartedFirstScenarioCore(['0', '1', '2']);
    core.roomDiscoveryOrderByFloor.upper = [
        BETRAYAL_DISCOVERY_POOLS.roomDiscoveryByFloor.upper.find((room) => room.visualId === 'collapsedRoom')!,
    ];
    core.currentExplorer = {
        ...core.currentExplorer,
        roomId: 'upper-landing',
        inventory: [],
    };
    core.otherExplorers = core.otherExplorers.map((explorer) => ({
        ...explorer,
        inventory: [],
    }));
    core.activeRoomId = 'upper-landing';
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.currentExplorerInventory = [];
    core.turnStartInventoryCardIds = [];
    core.usedCardIdsThisTurn = [];
    core.latestDiscovery = null;
    core.latestDiscoveryOwnerPlayerId = null;
    core.recentRoll = null;
    core.turnEndedByDiscovery = false;
    core.movesRemaining = 4;
    core.recommendedAction = 'explore';
    core = applyBetrayalCommand(
        core,
        BETRAYAL_COMMANDS.EXPLORE_ROOM,
        '0',
        { roomId: 'upper-north' },
        100,
        createBetrayalScriptedRandom(1),
    );
    core.latestDiscovery = null;
    core.latestDiscoveryOwnerPlayerId = null;
    core.recentRoll = null;
    core.turnEndedByDiscovery = false;
    core.movesRemaining = 4;
    core.recommendedAction = 'endTurn';
    core.currentExplorer.inventory = [];
    core.currentExplorerInventory = [];
    core.otherExplorers = core.otherExplorers.map((explorer) => ({
        ...explorer,
        inventory: [],
    }));
    core.turnStartInventoryCardIds = [];
    core.usedCardIdsThisTurn = [];
    return core;
};

const createMysticElevatorMoveCore = () => {
    let core = createStartedFirstScenarioCore(['0', '1', '2']);
    core.roomDiscoveryOrderByFloor.upper = [
        BETRAYAL_DISCOVERY_POOLS.roomDiscoveryByFloor.upper.find((room) => room.visualId === 'mysticElevator')!,
    ];
    core.currentExplorer = {
        ...core.currentExplorer,
        roomId: 'upper-landing',
        inventory: [],
    };
    core.otherExplorers = core.otherExplorers.map((explorer) => ({
        ...explorer,
        inventory: [],
    }));
    core.activeRoomId = 'upper-landing';
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.currentExplorerInventory = [];
    core.turnStartInventoryCardIds = [];
    core.usedCardIdsThisTurn = [];
    core.latestDiscovery = null;
    core.latestDiscoveryOwnerPlayerId = null;
    core.recentRoll = null;
    core.turnEndedByDiscovery = false;
    core.movesRemaining = 4;
    core.recommendedAction = 'explore';
    core = applyBetrayalCommand(
        core,
        BETRAYAL_COMMANDS.EXPLORE_ROOM,
        '0',
        { roomId: 'upper-north' },
        100,
        createBetrayalScriptedRandom(1),
    );
    core.latestDiscovery = null;
    core.latestDiscoveryOwnerPlayerId = null;
    core.recentRoll = null;
    core.turnEndedByDiscovery = false;
    core.movesRemaining = 4;
    core.recommendedAction = 'move';
    core.currentExplorer.inventory = [];
    core.currentExplorerInventory = [];
    core.otherExplorers = core.otherExplorers.map((explorer) => ({
        ...explorer,
        inventory: [],
    }));
    core.turnStartInventoryCardIds = [];
    core.usedCardIdsThisTurn = [];
    core.activeRoomId = 'upper-north';
    return core;
};

const createLaundryChuteReadyToExploreCore = () => {
    let core = createStartedFirstScenarioCore(['0', '1', '2']);
    core.roomDiscoveryOrderByFloor.basement = [
        BETRAYAL_DISCOVERY_POOLS.roomDiscoveryByFloor.basement.find((room) => room.visualId === 'laundryChute')!,
    ];
    core.currentExplorer = {
        ...core.currentExplorer,
        inventory: [],
    };
    core.otherExplorers = core.otherExplorers.map((explorer) => ({
        ...explorer,
        inventory: [],
    }));
    core.currentExplorerInventory = [];
    core.turnStartInventoryCardIds = [];
    core.usedCardIdsThisTurn = [];
    core.latestDiscovery = null;
    core.latestDiscoveryOwnerPlayerId = null;
    core.recentRoll = null;
    core.turnEndedByDiscovery = false;
    core.recommendedAction = 'move';
    core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'hallway' });
    core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'grand-staircase' });
    core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'basement-landing' });
    core.movesRemaining = 1;
    core.recommendedAction = 'explore';
    return core;
};

const switchRoomMapToFloor = async (page: Page, floor: 'upper' | 'ground' | 'basement') => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
        if (await page.getByTestId(`betrayal-room-floor-${floor}`).isVisible({ timeout: 500 }).catch(() => false)) {
            return;
        }
        if (floor === 'upper') {
            await page.getByTestId('betrayal-room-floor-up').click();
        } else {
            await page.getByTestId('betrayal-room-floor-down').click();
        }
    }
    await expect(page.getByTestId(`betrayal-room-floor-${floor}`)).toBeVisible();
};

type DirectRoomEffectCase = {
    floor: 'upper' | 'ground' | 'basement';
    visualId: string;
    targetRoomId: string;
    expectedRoomName: string;
    expectedText: string;
    screenshotStem: string;
    moveToFloor(core: BetrayalCore): BetrayalCore;
};

const directRoomEffectCases: DirectRoomEffectCase[] = [
    {
        floor: 'ground',
        visualId: 'chapel',
        targetRoomId: 'ground-north',
        expectedRoomName: '礼拜堂',
        expectedText: '房间效果：礼拜堂，神志 +1',
        screenshotStem: '01-礼拜堂-房间效果确认',
        moveToFloor(core) {
            return applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'hallway' });
        },
    },
    {
        floor: 'upper',
        visualId: 'library',
        targetRoomId: 'upper-north',
        expectedRoomName: '图书馆',
        expectedText: '房间效果：图书馆，知识 +1',
        screenshotStem: '02-图书馆-房间效果确认',
        moveToFloor(core) {
            core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'hallway' });
            core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'grand-staircase' });
            return applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'upper-landing' });
        },
    },
    {
        floor: 'upper',
        visualId: 'study',
        targetRoomId: 'upper-north',
        expectedRoomName: '书房',
        expectedText: '房间效果：书房，知识 +1',
        screenshotStem: '03-书房-房间效果确认',
        moveToFloor(core) {
            core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'hallway' });
            core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'grand-staircase' });
            return applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'upper-landing' });
        },
    },
    {
        floor: 'upper',
        visualId: 'gymnasium',
        targetRoomId: 'upper-north',
        expectedRoomName: '体育馆',
        expectedText: '房间效果：体育馆，速度 +1',
        screenshotStem: '04-体育馆-房间效果确认',
        moveToFloor(core) {
            core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'hallway' });
            core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'grand-staircase' });
            return applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'upper-landing' });
        },
    },
    {
        floor: 'basement',
        visualId: 'larder',
        targetRoomId: 'basement-east',
        expectedRoomName: '储物间',
        expectedText: '房间效果：储物间，力量 +1',
        screenshotStem: '05-储物间-房间效果确认',
        moveToFloor(core) {
            core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'hallway' });
            core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'grand-staircase' });
            return applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'basement-landing' });
        },
    },
    {
        floor: 'basement',
        visualId: 'junkRoom',
        targetRoomId: 'basement-east',
        expectedRoomName: '杂物间',
        expectedText: '房间效果：杂物间，放置障碍物标记',
        screenshotStem: '06-杂物间-房间效果确认',
        moveToFloor(core) {
            core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'hallway' });
            core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'grand-staircase' });
            return applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'basement-landing' });
        },
    },
];

const createDirectRoomEffectDiscoveryCore = (testCase: DirectRoomEffectCase): BetrayalCore => {
    let core = createStartedFirstScenarioCore(['0', '1', '2']);
    core.drawOrder = ['item'];
    const roomTemplate = BETRAYAL_DISCOVERY_POOLS.roomDiscoveryByFloor[testCase.floor]
        .find((room) => room.visualId === testCase.visualId);
    if (!roomTemplate) {
        throw new Error(`山屋 E2E 夹具缺少房间：${testCase.expectedRoomName}`);
    }
    core.roomDiscoveryOrderByFloor[testCase.floor] = [roomTemplate];
    core = testCase.moveToFloor(core);
    return applyBetrayalCommand(
        core,
        BETRAYAL_COMMANDS.EXPLORE_ROOM,
        '0',
        { roomId: testCase.targetRoomId },
    );
};

test.describe('山屋惊魂房间效果代表链', () => {
    test('礼拜堂代表发现加点 family：真实页面显示属性变化和发现反馈', async ({ page, context }) => {
        test.setTimeout(120000);
        const diagnostics = await openBetrayalPage(page, context, 'betrayal-room-effect-chapel');
        const core = createStartedFirstScenarioCore(['0', '1', '2']);
        core.roomDiscoveryOrderByFloor.ground = [
            BETRAYAL_DISCOVERY_POOLS.roomDiscoveryByFloor.ground.find((room) => room.visualId === 'chapel')!,
        ];

        await injectCore(page, core);
        await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });
        await expect(page.getByTestId('betrayal-current-traits')).toContainText('神志');
        await expect(page.getByTestId('betrayal-current-traits')).toContainText('3');
        await saveScreenshot(page, CHAPEL_BEFORE_SCREENSHOT);

        await clickMoveToRoom(page, 'hallway');
        await page.getByTestId('betrayal-action-explore').click();
        await page.getByTestId('betrayal-room-ground-north').click();
        await confirmRoomPlacementIfVisible(page);

        await expect(page.getByTestId('betrayal-room-ground-north')).toHaveAccessibleName(/礼拜堂/);
        await expect(page.getByTestId('betrayal-current-traits')).toContainText('神志');
        await expect(page.getByTestId('betrayal-current-traits')).toContainText('4');
        await expect(page.getByTestId('betrayal-room-latest-feedback')).toContainText('礼拜堂');
        await saveScreenshot(page, CHAPEL_AFTER_SCREENSHOT);

        assertNoFatalFrontendErrors([{ label: 'betrayal-room-effect-chapel', diagnostics }]);
    });

    test('当前全部直接房间文字效果：真实页面第一步均进入房间效果确认队列', async ({ page, context }) => {
        test.setTimeout(180000);
        const diagnostics = await openBetrayalPage(page, context, 'betrayal-room-effect-confirmation-matrix');

        for (const testCase of directRoomEffectCases) {
            await injectCore(page, createDirectRoomEffectDiscoveryCore(testCase));
            await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });
            const discoveryPanel = page.getByTestId('betrayal-discovery-panel');
            await expect(discoveryPanel).toBeVisible({ timeout: 30000 });
            const firstResolutionStep = discoveryPanel.getByTestId('betrayal-discovery-resolution-step').first();
            await expect(firstResolutionStep).toContainText(testCase.expectedText);
            await expect(discoveryPanel.getByTestId('betrayal-discovery-continue')).toHaveText(/确认 1\/\d+/);
            await expect(discoveryPanel.getByTestId('betrayal-discovery-continue')).toHaveAttribute(
                'data-pending-card-resolution-step',
                /^1\/\d+$/,
            );
            await saveScreenshot(
                page,
                `${DIRECT_ROOM_EFFECT_MATRIX_EVIDENCE_DIR}/${testCase.screenshotStem}.jpg`,
            );
            await dismissDiscoveryPanelIfVisible(page);
        }

        assertNoFatalFrontendErrors([{ label: 'betrayal-room-effect-confirmation-matrix', diagnostics }]);
    });

    test('火炉房代表停留效果 family：真实页面提示结束回合伤害并结算反馈', async ({ page, context }) => {
        test.setTimeout(120000);
        const diagnostics = await openBetrayalPage(page, context, 'betrayal-room-effect-furnace-room');
        let core = createStartedFirstScenarioCore(['0', '1', '2']);
        core.roomDiscoveryOrderByFloor.ground = [
            BETRAYAL_DISCOVERY_POOLS.roomDiscoveryByFloor.ground.find((room) => room.visualId === 'furnaceRoom')!,
        ];
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'hallway' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.EXPLORE_ROOM, '0', { roomId: 'ground-north' });

        await injectCore(page, core);
        await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });
        await dismissDiscoveryPanelIfVisible(page);
        await expect(page.getByTestId('betrayal-room-ground-north')).toHaveAccessibleName(/火炉房/);
        await expect(page.getByTestId('betrayal-room-end-turn-effect-status')).toContainText('火炉房');
        await expect(page.getByTestId('betrayal-room-end-turn-effect-status')).toContainText('1 点物理伤害');
        await expect(page.getByTestId('betrayal-room-end-turn-effect-hint')).toContainText('结束回合受伤');
        await expect(page.getByTestId('betrayal-action-endTurn')).toContainText('结束回合');
        await expect(page.getByTestId('betrayal-action-endTurn')).not.toContainText('结算房间');
        await saveScreenshot(page, FURNACE_HINT_SCREENSHOT);

        await page.getByTestId('betrayal-action-endTurn').click();

        await expect(page.getByTestId('betrayal-room-latest-feedback')).toContainText('火炉房');
        await expect(page.getByTestId('betrayal-room-latest-feedback')).toContainText('1 点物理伤害');
        await saveScreenshot(page, FURNACE_RESOLVED_SCREENSHOT);

        assertNoFatalFrontendErrors([{ label: 'betrayal-room-effect-furnace-room', diagnostics }]);
    });

    test('杂物间代表障碍移动 family：真实页面显示障碍标记并离开扣 2 点移动', async ({ page, context }) => {
        test.setTimeout(120000);
        const diagnostics = await openBetrayalPage(page, context, 'betrayal-room-effect-junk-room');
        let core = createStartedFirstScenarioCore(['0', '1', '2']);
        core.roomDiscoveryOrderByFloor.basement = [
            BETRAYAL_DISCOVERY_POOLS.roomDiscoveryByFloor.basement.find((room) => room.visualId === 'junkRoom')!,
        ];
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'hallway' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'grand-staircase' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'basement-landing' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.EXPLORE_ROOM, '0', { roomId: 'basement-east' });
        core.turnEndedByDiscovery = false;
        core.movesRemaining = 2;

        await injectCore(page, core);
        await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });
        await expect(page.getByTestId('betrayal-room-floor-basement')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByTestId('betrayal-room-basement-east')).toHaveAccessibleName(/杂物间/);
        await expect(page.getByTestId('betrayal-room-marker-basement-east-obstacle')).toBeVisible();
        await expect(page.getByTestId('betrayal-status-chip')).toContainText('剩余移动 2');
        await saveScreenshot(page, JUNK_OBSTACLE_SCREENSHOT);

        await clickMoveToRoom(page, 'basement-landing');

        await expect(page.getByTestId('betrayal-room-occupant-basement-landing-0')).toBeVisible();
        await expect(page.getByTestId('betrayal-status-chip')).toContainText('剩余移动 0');
        await saveScreenshot(page, JUNK_MOVE_COST_SCREENSHOT);

        assertNoFatalFrontendErrors([{ label: 'betrayal-room-effect-junk-room', diagnostics }]);
    });

    test('固定连接代表跨层入口 family：真实页面提示切层并可从密道楼梯移动到门厅', async ({ page, context }) => {
        test.setTimeout(120000);
        const diagnostics = await openBetrayalPage(page, context, 'betrayal-room-effect-fixed-link-cross-floor');
        let core = createStartedFirstScenarioCore(['0', '1', '2']);
        core.roomDiscoveryOrderByFloor.basement = [
            BETRAYAL_DISCOVERY_POOLS.roomDiscoveryByFloor.basement.find((room) => room.visualId === 'secretStaircase')!,
        ];
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'hallway' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'grand-staircase' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'basement-landing' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.EXPLORE_ROOM, '0', { roomId: 'basement-east' });
        core.turnEndedByDiscovery = false;
        core.movesRemaining = 2;

        await injectCore(page, core);
        await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });
        await dismissDiscoveryPanelIfVisible(page);
        await expect(page.getByTestId('betrayal-room-floor-basement')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByTestId('betrayal-room-basement-east')).toHaveAccessibleName(/密道楼梯/);

        await page.getByTestId('betrayal-action-move').click();

        await expect(page.getByTestId('betrayal-room-floor-switcher')).toBeVisible();
        await expect(page.getByTestId('betrayal-room-floor-up')).toBeEnabled();
        await saveScreenshot(page, FIXED_LINK_CROSS_FLOOR_HINT_SCREENSHOT);

        await page.getByTestId('betrayal-room-floor-up').click();

        await expect(page.getByTestId('betrayal-room-floor-ground')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByTestId('betrayal-room-hallway')).toBeEnabled();
        await page.getByTestId('betrayal-room-hallway').click();

        await expect(page.getByTestId('betrayal-room-occupant-hallway-0')).toBeVisible();
        await expect(page.getByTestId('betrayal-status-chip')).toContainText('剩余移动 1');
        await saveScreenshot(page, FIXED_LINK_MOVE_RESOLVED_SCREENSHOT);

        assertNoFatalFrontendErrors([{ label: 'betrayal-room-effect-fixed-link-cross-floor', diagnostics }]);
    });

    test('洗衣滑槽直接移动真实链路：翻出房间、结束回合滑落并回牌桌', async ({ page, context }) => {
        test.setTimeout(120000);
        const diagnostics = await openBetrayalPage(page, context, 'betrayal-room-effect-laundry-chute-direct-move');

        await injectCore(page, createLaundryChuteReadyToExploreCore());
        await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });
        await expect(page.getByTestId('betrayal-room-floor-basement')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByTestId('betrayal-room-occupant-basement-landing-0')).toBeVisible();
        await expect(page.getByTestId('betrayal-action-explore')).toContainText('探索');
        await saveScreenshot(page, LAUNDRY_CHUTE_READY_SCREENSHOT);

        await page.getByTestId('betrayal-action-explore').click();
        await expect(page.getByTestId('betrayal-room-explore-target-basement-east')).toBeVisible();
        await expect(page.getByTestId('betrayal-room-basement-east')).toBeEnabled();
        await saveScreenshot(page, LAUNDRY_CHUTE_TARGET_SCREENSHOT);

        await page.getByTestId('betrayal-room-basement-east').click();
        await confirmRoomPlacementIfVisible(page);
        await expect(page.getByTestId('betrayal-room-basement-east')).toHaveAccessibleName(/洗衣滑槽/);
        await expect(page.getByTestId('betrayal-room-occupant-basement-east-0')).toBeVisible();
        await expect(page.getByTestId('betrayal-room-latest-feedback')).toContainText('洗衣滑槽');
        await expect(page.getByTestId('betrayal-discovery-panel')).toContainText(/无发现符号|没有事件、物品或预兆发现牌/);
        await saveScreenshot(page, LAUNDRY_CHUTE_REVEALED_SCREENSHOT);

        await dismissDiscoveryPanelIfVisible(page);
        await expect(page.getByTestId('betrayal-room-end-turn-effect-status')).toContainText('洗衣滑槽');
        await expect(page.getByTestId('betrayal-room-end-turn-effect-status')).toContainText('地下室起始点');
        await expect(page.getByTestId('betrayal-room-end-turn-effect-hint')).toContainText('地下室起始点');
        await expect(page.getByTestId('betrayal-recent-roll-panel')).toHaveCount(0);
        await saveScreenshot(page, LAUNDRY_CHUTE_STATUS_SCREENSHOT);

        await page.getByTestId('betrayal-action-endTurn').click();
        await expect(page.getByTestId('betrayal-room-latest-feedback')).toContainText('洗衣滑槽');
        await expect(page.getByTestId('betrayal-room-latest-feedback')).toContainText('地下室起始点');
        await switchRoomMapToFloor(page, 'basement');
        await expect(page.getByTestId('betrayal-room-occupant-basement-landing-0')).toBeVisible();
        await expect(page.getByTestId('betrayal-recent-roll-panel')).toHaveCount(0);
        await saveScreenshot(page, LAUNDRY_CHUTE_MOVED_SCREENSHOT);

        const settledCore = await readCurrentCore(page);
        const movedExplorer = [settledCore.currentExplorer, ...settledCore.otherExplorers]
            .find((explorer) => explorer.playerId === '0');
        expect(movedExplorer?.roomId).toBe('basement-landing');
        expect(settledCore.currentPlayer).toBe('1');
        expect(settledCore.recentRoll).toBeNull();
        await expect(page.getByTestId('betrayal-discovery-panel')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-event-choice-panel')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-action-rail')).toBeVisible();
        await saveScreenshot(page, LAUNDRY_CHUTE_SETTLED_SCREENSHOT);

        assertNoFatalFrontendErrors([{ label: 'betrayal-room-effect-laundry-chute-direct-move', diagnostics }]);
    });

    test('倒塌房间速度坠落真实链路：已翻出房间、结束回合投骰、坠落结算并回牌桌', async ({ page, context }) => {
        test.setTimeout(120000);
        const diagnostics = await openBetrayalPage(page, context, 'betrayal-room-effect-collapsed-room-speed-check');

        await injectCore(page, createCollapsedRoomSpeedCheckCore());
        await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });
        await expect(page.getByTestId('betrayal-room-floor-upper')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByTestId('betrayal-room-upper-north')).toHaveAccessibleName(/倒塌房间/);
        await expect(page.getByTestId('betrayal-room-occupant-upper-north-0')).toBeVisible();
        await expect(page.getByTestId('betrayal-action-endTurn')).toContainText('结束回合');
        await saveScreenshot(page, COLLAPSED_ROOM_READY_SCREENSHOT);

        await expect(page.getByTestId('betrayal-room-end-turn-effect-status')).toContainText('倒塌房间');
        await expect(page.getByTestId('betrayal-room-end-turn-effect-status')).toContainText(/结束回合检定|投速度/);
        await saveScreenshot(page, COLLAPSED_ROOM_STATUS_SCREENSHOT);

        await dismissDiscoveryPanelIfVisible(page);
        await expect(page.getByTestId('betrayal-room-end-turn-effect-hint')).toContainText(/结束回合检定|投速度/);
        await saveScreenshot(page, COLLAPSED_ROOM_HINT_SCREENSHOT);
        await expect(page.getByTestId('betrayal-action-endTurn')).toContainText('结束回合');
        await saveScreenshot(page, COLLAPSED_ROOM_END_TURN_READY_SCREENSHOT);

        const beforeFallCore = await readCurrentCore(page);
        const beforeFallExplorer = beforeFallCore.currentExplorer;
        await setHarnessRandomQueue(page, [0.01, 0.01, 0.01, 0.5]);
        await page.getByTestId('betrayal-action-endTurn').click();

        await expect.poll(async () => {
            const core = await readCurrentCore(page);
            return {
                currentPlayer: core.currentPlayer,
                recentRollKind: core.recentRoll?.kind,
                recentRollPlayer: core.recentRoll?.playerId,
                recentRollSource: core.recentRoll?.sourceTitle,
                recentRollTrait: core.recentRoll?.trait,
                recentRollLabel: core.recentRoll?.latestLabel,
                recentRollDiceCount: core.recentRoll?.dice.length,
            };
        }, { timeout: 30000 }).toEqual({
            currentPlayer: '0',
            recentRollKind: 'roomEndTurnTraitCheck',
            recentRollPlayer: '0',
            recentRollSource: '倒塌房间',
            recentRollTrait: 'speed',
            recentRollLabel: '坠落到地下室起始点',
            recentRollDiceCount: 3,
        });
        const speedRollPanel = page.getByTestId('betrayal-recent-roll-panel');
        await expect(speedRollPanel).toBeVisible({ timeout: 30000 });
        await expect(speedRollPanel).toContainText('倒塌房间');
        await expect(speedRollPanel).toContainText('投骰');
        await expect(speedRollPanel).toContainText('坠落到地下室起始点');
        await expect(page.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute('data-dice-count', '3');
        await expectVisiblePhysicalDiceBox(speedRollPanel);
        await waitForPhysicalDiceSettled(speedRollPanel);
        await expectPhysicalDiceSeparated(speedRollPanel, { minDiceCount: 3 });
        await expectRollPanelUsesAdaptiveOpenDock(page, speedRollPanel, '倒塌房间速度检定');
        await saveScreenshot(page, COLLAPSED_ROOM_DICE_SCREENSHOT);

        const afterFallCore = await readCurrentCore(page);
        const fallenExplorer = [afterFallCore.currentExplorer, ...afterFallCore.otherExplorers]
            .find((explorer) => explorer.playerId === beforeFallExplorer.playerId);
        expect(fallenExplorer?.roomId).toBe('basement-landing');
        expect(fallenExplorer?.traits).toEqual(beforeFallExplorer.traits);
        expect(afterFallCore.pendingDamageAllocation).toBeNull();
        expect(afterFallCore.currentPlayer).toBe(beforeFallExplorer.playerId);
        expect(afterFallCore.recentRoll?.kind).toBe('roomEndTurnTraitCheck');
        expect(afterFallCore.recentRoll?.playerId).toBe(beforeFallExplorer.playerId);
        expect(afterFallCore.currentPlayer).toBe(afterFallCore.recentRoll?.playerId);
        expect(afterFallCore.recentRoll?.roomEndTurn?.nextPlayerId).toBe('1');
        expect(afterFallCore.recentRoll?.dice).toHaveLength(3);
        expect(afterFallCore.recentRoll?.latestLabel).toContain('坠落到地下室起始点');
        await page.getByTestId('betrayal-roll-continue').first().click();

        await expect(page.getByTestId('betrayal-recent-roll-panel')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-damage-allocation-panel')).toBeVisible({ timeout: 30000 });
        await expect(page.getByTestId('betrayal-damage-allocation-panel')).toHaveAttribute('data-player-id', '0');
        await expect(page.getByTestId('betrayal-damage-allocation-source')).toContainText('倒塌房间');
        await expect(page.getByTestId('betrayal-damage-allocation-amount')).toContainText('1 点物理伤害');
        await expect(page.getByTestId('betrayal-damage-allocation-traits')).toContainText('力量');
        await expect(page.getByTestId('betrayal-damage-allocation-traits')).toContainText('速度');
        await expect(page.getByTestId('betrayal-damage-allocation-confirm')).toBeDisabled();
        await saveScreenshot(page, COLLAPSED_ROOM_DAMAGE_SCREENSHOT);

        await page.getByTestId('betrayal-damage-allocation-trait-might').click();
        await expect(page.getByTestId('betrayal-damage-allocation-trait-might')).toHaveAttribute('data-damage-selected-count', '1');
        await expect(page.getByTestId('betrayal-damage-allocation-confirm')).toBeEnabled();
        await page.getByTestId('betrayal-damage-allocation-confirm').click();

        await expect.poll(async () => {
            const core = await readCurrentCore(page);
            return {
                currentPlayer: core.currentPlayer,
                recentRoll: core.recentRoll,
                pendingDamageAllocation: core.pendingDamageAllocation,
            };
        }, { timeout: 30000 }).toEqual({
            currentPlayer: '1',
            recentRoll: null,
            pendingDamageAllocation: null,
        });

        const afterDamageCore = await readCurrentCore(page);
        const damagedExplorer = [afterDamageCore.currentExplorer, ...afterDamageCore.otherExplorers]
            .find((explorer) => explorer.playerId === beforeFallExplorer.playerId);
        expect(damagedExplorer?.traitTracks.might.position).toBe(beforeFallExplorer.traitTracks.might.position - 1);
        expect(damagedExplorer?.roomId).toBe('basement-landing');

        await switchRoomMapToFloor(page, 'basement');
        await expect(page.getByTestId('betrayal-room-occupant-basement-landing-0')).toBeVisible();
        await expect(page.getByTestId('betrayal-recent-roll-panel')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-discovery-panel')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-event-choice-panel')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-action-rail')).toBeVisible();
        await saveScreenshot(page, COLLAPSED_ROOM_SETTLED_SCREENSHOT);

        assertNoFatalFrontendErrors([{ label: 'betrayal-room-effect-collapsed-room-speed-check', diagnostics }]);
    });

    test('移动端横屏：结束回合投骰未确认前阻塞，确认后才切到下一位', async ({ page, context }) => {
        test.setTimeout(120000);
        const diagnostics = await openBetrayalPage(
            page,
            context,
            'betrayal-mobile-collapsed-room-roll-blocks-until-acknowledged',
            {
                viewportSize: { width: 896, height: 414 },
                forceCoarsePointer: true,
            },
        );

        await injectCore(page, createCollapsedRoomSpeedCheckCore());
        await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });
        await expect(page.getByTestId('betrayal-mobile-action-rail')).toBeVisible();
        await dismissDiscoveryPanelIfVisible(page);

        const beforeFallCore = await readCurrentCore(page);
        await setHarnessRandomQueue(page, [0.01, 0.01, 0.01, 0.5]);
        await page.getByTestId('betrayal-mobile-dock-endTurn').click();

        await expect.poll(async () => {
            const core = await readCurrentCore(page);
            return {
                currentPlayer: core.currentPlayer,
                recentRollKind: core.recentRoll?.kind,
                recentRollPlayer: core.recentRoll?.playerId,
                recentRollSource: core.recentRoll?.sourceTitle,
                recentRollLabel: core.recentRoll?.latestLabel,
            };
        }, { timeout: 30000 }).toEqual({
            currentPlayer: beforeFallCore.currentExplorer.playerId,
            recentRollKind: 'roomEndTurnTraitCheck',
            recentRollPlayer: beforeFallCore.currentExplorer.playerId,
            recentRollSource: '倒塌房间',
            recentRollLabel: '坠落到地下室起始点',
        });

        const mobileRollPanel = page.getByTestId('betrayal-recent-roll-panel');
        await expect(mobileRollPanel).toBeVisible({ timeout: 30000 });
        await expect(mobileRollPanel).toHaveAttribute('data-roll-panel-style', 'mobile-landscape-open-dock');
        await expect(mobileRollPanel).toContainText('倒塌房间');
        await expect(page.getByTestId('betrayal-mobile-action-rail')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-room-floor-switcher')).toBeHidden();
        await expect(page.locator('html')).toHaveAttribute('data-betrayal-blocking-roll', 'true');
        await expect(page.getByTestId('fab-menu')).toBeHidden();
        await expect(page.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute('data-dice-count', '3');
        await waitForPhysicalDiceSettled(mobileRollPanel);
        await expectPhysicalDiceSeparated(mobileRollPanel, {
            minDiceCount: 3,
            minDieVisualSize: 48,
            minCanvasEdgeMargin: 12,
        });
        await expect(
            mobileRollPanel.locator('[data-testid^="betrayal-house-dice-readable-face-"]'),
        ).toHaveText(['0', '0', '0']);
        const mobileRollGeometry = await mobileRollPanel.evaluate((panel) => {
            const rectOf = (selector: string) => {
                const element = panel.querySelector(selector);
                if (!element) {
                    throw new Error(`${selector} is missing`);
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
            type DiceLayout = {
                x: number;
                y: number;
                width: number;
                height: number;
                visualWidth?: number;
                visualHeight?: number;
            };
            type DiceDebugSnapshot = {
                dice?: Array<{ layout?: DiceLayout | null }>;
                canvas?: { clientWidth?: number; clientHeight?: number } | null;
            };
            const diceVisualUnionOf = () => {
                const debugRegistry =
                    (
                        window as typeof window & {
                            __diceBoxThreeDebug?: Record<string, () => DiceDebugSnapshot | null>;
                        }
                    ).__diceBoxThreeDebug ?? {};
                const canvases = Array.from(panel.querySelectorAll('canvas')).filter(
                    (canvas): canvas is HTMLCanvasElement => canvas instanceof HTMLCanvasElement,
                );
                const group = panel.querySelector(
                    '[data-testid="betrayal-house-dice-3d-group"]',
                ) as HTMLElement | null;
                const activeCanvas =
                    canvases.find((canvas) => {
                        const testId = canvas.dataset.testid;
                        return Boolean(testId && typeof debugRegistry[testId] === 'function');
                    }) ??
                    canvases[0] ??
                    null;
                const activeCanvasTestId = activeCanvas?.dataset.testid ?? group?.dataset.diceDebugKey;
                const snapshot = activeCanvasTestId
                    ? (debugRegistry[activeCanvasTestId]?.() ?? null)
                    : null;
                if (!activeCanvas || !snapshot) {
                    throw new Error('山屋骰盘缺少真实 Three.js 投影快照，不能判断视觉间距');
                }
                const canvasRect = activeCanvas.getBoundingClientRect();
                const canvasClientWidth = snapshot.canvas?.clientWidth ?? activeCanvas.clientWidth;
                const canvasClientHeight = snapshot.canvas?.clientHeight ?? activeCanvas.clientHeight;
                const displayScaleX = canvasClientWidth > 0 ? canvasRect.width / canvasClientWidth : 1;
                const displayScaleY = canvasClientHeight > 0 ? canvasRect.height / canvasClientHeight : 1;
                const layouts = (snapshot.dice ?? [])
                    .map((die) => die.layout)
                    .filter(
                        (layout): layout is DiceLayout =>
                            Boolean(layout) &&
                            Number.isFinite(layout.x) &&
                            Number.isFinite(layout.y) &&
                            Number.isFinite(layout.width) &&
                            Number.isFinite(layout.height),
                    );
                if (layouts.length === 0) {
                    throw new Error('山屋骰盘没有可见骰子的真实投影，不能判断视觉间距');
                }
                const bounds = layouts.reduce(
                    (acc, layout) => {
                        const width = layout.visualWidth ?? layout.width;
                        const height = layout.visualHeight ?? layout.height;
                        const left = canvasRect.left + (layout.x - width / 2) * displayScaleX;
                        const right = canvasRect.left + (layout.x + width / 2) * displayScaleX;
                        const top = canvasRect.top + (layout.y - height / 2) * displayScaleY;
                        const bottom = canvasRect.top + (layout.y + height / 2) * displayScaleY;
                        return {
                            left: Math.min(acc.left, left),
                            right: Math.max(acc.right, right),
                            top: Math.min(acc.top, top),
                            bottom: Math.max(acc.bottom, bottom),
                        };
                    },
                    {
                        left: Number.POSITIVE_INFINITY,
                        right: Number.NEGATIVE_INFINITY,
                        top: Number.POSITIVE_INFINITY,
                        bottom: Number.NEGATIVE_INFINITY,
                    },
                );
                return {
                    ...bounds,
                    width: bounds.right - bounds.left,
                    height: bounds.bottom - bounds.top,
                    centerX: (bounds.left + bounds.right) / 2,
                    centerY: (bounds.top + bounds.bottom) / 2,
                };
            };
            const panelRect = panel.getBoundingClientRect();
            const dice = rectOf('[data-testid="betrayal-house-dice-3d-group"]');
            const diceVisualUnion = diceVisualUnionOf();
            const result = rectOf('[data-testid="betrayal-recent-roll-result-stage"]');
            const button = rectOf('[data-testid="betrayal-roll-continue"]');
            return {
                panel: {
                    left: panelRect.left,
                    right: panelRect.right,
                    top: panelRect.top,
                    bottom: panelRect.bottom,
                    width: panelRect.width,
                    height: panelRect.height,
                    centerX: panelRect.left + panelRect.width / 2,
                    centerY: panelRect.top + panelRect.height / 2,
                },
                dice,
                diceVisualUnion,
                result,
                button,
                viewportWidth: window.innerWidth,
                viewportHeight: window.innerHeight,
            };
        });
        expect(
            mobileRollGeometry.panel.width,
            '移动端投骰主承接不应撑满整屏宽度',
        ).toBeLessThanOrEqual(mobileRollGeometry.viewportWidth * 0.9);
        expect(
            mobileRollGeometry.panel.height,
            '移动端投骰主承接不应占据整屏高度',
        ).toBeLessThanOrEqual(mobileRollGeometry.viewportHeight * 0.62);
        expect(
            mobileRollGeometry.result.left,
            '移动端结算信息应在骰盘右侧同组承接，而不是掉到底部远处',
        ).toBeGreaterThan(mobileRollGeometry.diceVisualUnion.centerX);
        expect(
            Math.abs(mobileRollGeometry.result.left - mobileRollGeometry.diceVisualUnion.right),
            '移动端真实骰子和结算信息距离不能脱节',
        ).toBeLessThanOrEqual(56);
        expect(
            Math.abs(mobileRollGeometry.result.centerY - mobileRollGeometry.diceVisualUnion.centerY),
            '移动端真实骰子和结算信息应在同一个视觉带内',
        ).toBeLessThanOrEqual(72);
        expect(
            mobileRollGeometry.button.left,
            '移动端关闭按钮应跟随结算信息同栏，而不是漂到右下角',
        ).toBeGreaterThanOrEqual(mobileRollGeometry.result.left - 1);
        expect(
            mobileRollGeometry.button.right,
            '移动端关闭按钮不应越出结算信息栏',
        ).toBeLessThanOrEqual(mobileRollGeometry.result.right + 1);
        await saveScreenshot(page, COLLAPSED_ROOM_MOBILE_DICE_SCREENSHOT);

        await page.getByTestId('betrayal-roll-continue').first().click();
        await expect(page.getByTestId('betrayal-recent-roll-panel')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-damage-allocation-panel')).toBeVisible({ timeout: 30000 });
        await expect(page.getByTestId('betrayal-damage-allocation-panel')).toHaveAttribute('data-player-id', '0');
        await expect(page.getByTestId('betrayal-damage-allocation-source')).toContainText('倒塌房间');
        await expect(page.getByTestId('betrayal-damage-allocation-amount')).toContainText('1 点物理伤害');
        await expect(page.getByTestId('betrayal-damage-allocation-traits')).toContainText('力量');
        await expect(page.getByTestId('betrayal-damage-allocation-traits')).toContainText('速度');
        await expect(page.getByTestId('betrayal-damage-allocation-confirm')).toBeDisabled();
        await saveScreenshot(page, COLLAPSED_ROOM_MOBILE_DAMAGE_SCREENSHOT);

        await expect.poll(async () => {
            const core = await readCurrentCore(page);
            return {
                currentPlayer: core.currentPlayer,
                recentRoll: core.recentRoll,
                pendingDamageSource: core.pendingDamageAllocation?.sourceTitle,
            };
        }, { timeout: 30000 }).toEqual({
            currentPlayer: '0',
            recentRoll: null,
            pendingDamageSource: '倒塌房间',
        });

        await page.getByTestId('betrayal-damage-allocation-trait-might').click();
        await expect(page.getByTestId('betrayal-damage-allocation-trait-might')).toHaveAttribute('data-damage-selected-count', '1');
        await expect(page.getByTestId('betrayal-damage-allocation-confirm')).toBeEnabled();
        await page.getByTestId('betrayal-damage-allocation-confirm').click();
        await expect.poll(async () => {
            const core = await readCurrentCore(page);
            return {
                currentPlayer: core.currentPlayer,
                recentRoll: core.recentRoll,
                pendingDamageAllocation: core.pendingDamageAllocation,
            };
        }, { timeout: 30000 }).toEqual({
            currentPlayer: '1',
            recentRoll: null,
            pendingDamageAllocation: null,
        });

        const afterMobileDamageCore = await readCurrentCore(page);
        const damagedMobileExplorer = [afterMobileDamageCore.currentExplorer, ...afterMobileDamageCore.otherExplorers]
            .find((explorer) => explorer.playerId === beforeFallCore.currentExplorer.playerId);
        expect(damagedMobileExplorer?.traitTracks.might.position).toBe(beforeFallCore.currentExplorer.traitTracks.might.position - 1);
        expect(damagedMobileExplorer?.roomId).toBe('basement-landing');

        await expect(page.getByTestId('betrayal-mobile-action-rail')).toBeVisible();
        await expect(page.getByTestId('betrayal-room-floor-switcher')).toBeVisible();
        await expect(page.locator('html')).not.toHaveAttribute('data-betrayal-blocking-roll');
        await expect(page.getByTestId('fab-menu')).toBeVisible();
        await expect(page.getByTestId('betrayal-mobile-dock-endTurn')).toBeVisible();
        await saveScreenshot(page, COLLAPSED_ROOM_MOBILE_SETTLED_SCREENSHOT);

        assertNoFatalFrontendErrors([{ label: 'betrayal-mobile-collapsed-room-roll-blocks-until-acknowledged', diagnostics }]);
    });

    test('神秘电梯移动骰盘真实链路：已翻出房间、启动房间效果、投骰移动并回牌桌', async ({ page, context }) => {
        test.setTimeout(120000);
        const diagnostics = await openBetrayalPage(page, context, 'betrayal-room-effect-mystic-elevator-move-roll');

        await injectCore(page, createMysticElevatorMoveCore());
        await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });
        await expect(page.getByTestId('betrayal-room-floor-upper')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByTestId('betrayal-room-upper-north')).toHaveAccessibleName(/神秘电梯/);
        await expect(page.getByTestId('betrayal-room-occupant-upper-north-0')).toBeVisible();
        await expect(page.getByTestId('betrayal-action-roomEffect')).toContainText('神秘电梯');
        await saveScreenshot(page, MYSTIC_ELEVATOR_READY_SCREENSHOT);

        await expect(page.getByTestId('betrayal-action-roomEffect')).toBeEnabled();
        await expect(page.getByTestId('betrayal-recent-roll-panel')).toHaveCount(0);
        await saveScreenshot(page, MYSTIC_ELEVATOR_BUTTON_SCREENSHOT);

        await dismissDiscoveryPanelIfVisible(page);
        await expect(page.getByTestId('betrayal-action-roomEffect')).toContainText('神秘电梯');
        await expect(page.getByTestId('betrayal-action-rail')).toBeVisible();
        await saveScreenshot(page, MYSTIC_ELEVATOR_TRIGGER_READY_SCREENSHOT);

        await setHarnessRandomQueue(page, [0.5, 0.5, 0.5]);
        await page.getByTestId('betrayal-action-roomEffect').click();

        await expect.poll(async () => {
            const core = await readCurrentCore(page);
            const elevatorRoom = core.rooms.find((room) => room.visualId === 'mysticElevator');
            return {
                recentRollKind: core.recentRoll?.kind,
                recentRollSource: core.recentRoll?.sourceTitle,
                recentRollLabel: core.recentRoll?.latestLabel,
                recentRollDiceCount: core.recentRoll?.dice.length,
                recentRollDice: core.recentRoll?.dice,
                elevatorFloor: elevatorRoom?.floor,
                currentRoomId: core.currentExplorer.roomId,
                usedRoomEffect: core.scenarioRuntime.usedRoomEffectIdsThisTurn.includes('mysticElevator'),
            };
        }, { timeout: 30000 }).toEqual({
            recentRollKind: 'mysticElevator',
            recentRollSource: '神秘电梯',
            recentRollLabel: '移动到未探索',
            recentRollDiceCount: 2,
            recentRollDice: [1, 1],
            elevatorFloor: 'ground',
            currentRoomId: 'upper-north',
            usedRoomEffect: true,
        });
        const elevatorRollPanel = page.getByTestId('betrayal-recent-roll-panel');
        await expect(elevatorRollPanel).toBeVisible({ timeout: 30000 });
        await expect(elevatorRollPanel).toContainText('神秘电梯');
        await expect(elevatorRollPanel).toContainText('移动到未探索');
        await expect(page.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute('data-dice-count', '2');
        await expectVisiblePhysicalDiceBox(elevatorRollPanel);
        await waitForPhysicalDiceSettled(elevatorRollPanel);
        await expectPhysicalDiceSeparated(elevatorRollPanel, { minDiceCount: 2 });
        await expectRollPanelUsesAdaptiveOpenDock(page, elevatorRollPanel, '神秘电梯移动');
        await saveScreenshot(page, MYSTIC_ELEVATOR_DICE_SCREENSHOT);

        await expect(page.getByTestId('betrayal-room-floor-ground')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByTestId('betrayal-room-upper-north')).toHaveAccessibleName(/神秘电梯/);
        await expect(page.getByTestId('betrayal-room-occupant-upper-north-0')).toBeVisible();
        await saveScreenshot(page, MYSTIC_ELEVATOR_MOVED_SCREENSHOT);

        await page.getByTestId('betrayal-roll-continue').first().click();
        await expect.poll(async () => {
            const core = await readCurrentCore(page);
            return {
                recentRoll: core.recentRoll,
            };
        }, { timeout: 30000 }).toEqual({
            recentRoll: null,
        });
        await expect(page.getByTestId('betrayal-recent-roll-panel')).toHaveCount(0);
        const roomEffectAction = page.getByTestId('betrayal-action-roomEffect');
        await expect(roomEffectAction).toBeDisabled();
        await expect(roomEffectAction).toContainText('神秘电梯');
        await expect(page.getByText('该房间效果本回合已用')).toBeVisible();
        await expect(page.getByTestId('betrayal-discovery-panel')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-event-choice-panel')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-action-endTurn')).toContainText('结束回合');
        await expect(page.getByTestId('betrayal-action-rail')).toBeVisible();
        await saveScreenshot(page, MYSTIC_ELEVATOR_SETTLED_SCREENSHOT);

        assertNoFatalFrontendErrors([{ label: 'betrayal-room-effect-mystic-elevator-move-roll', diagnostics }]);
    });
});
