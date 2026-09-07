import { expect, test, type Locator } from '@playwright/test';
import { type BetrayalCore } from '../../src/games/betrayal/game';
import { BETRAYAL_COMMANDS } from '../../src/games/betrayal/commands';
import { BETRAYAL_DISCOVERY_POOLS } from '../../src/games/betrayal/scenarioConfig';
import {
    acknowledgePendingCardResolutions,
    applyBetrayalCommand,
    createBetrayalScriptedRandom,
    createStartedFirstScenarioCore,
} from '../../src/games/betrayal/testing/firstScenarioTestUtils';
import {
    assertNoFatalFrontendErrors,
    attachPageDiagnostics,
} from '../helpers/common';
import {
    initBetrayalContext,
    injectCore,
    saveScreenshot,
    waitForBetrayalPageReady,
    warmBetrayalFrontend,
} from './betrayalTestHelpers';

const EVIDENCE_DIR = 'evidence/betrayal-core-interactions/haunt-reveal-protocol';
const ONE_TRAITOR_REVEAL_SCREENSHOT = `${EVIDENCE_DIR}/01-作祟揭示-一名叛徒横幅提示.jpg`;
const ONE_TRAITOR_READER_SCREENSHOT = `${EVIDENCE_DIR}/02-作祟揭示-一名叛徒剧本阅读承接.jpg`;
const ONE_TRAITOR_AFTER_READER_SCREENSHOT = `${EVIDENCE_DIR}/03-作祟揭示-一名叛徒关闭剧本书横幅仍在.jpg`;
const ONE_TRAITOR_BOARD_SCREENSHOT = `${EVIDENCE_DIR}/04-作祟揭示-一名叛徒关闭横幅后牌桌.jpg`;
const HIDDEN_TRAITOR_REVEAL_SCREENSHOT = `${EVIDENCE_DIR}/05-作祟揭示-剧本3横幅提示.jpg`;
const HIDDEN_TRAITOR_READER_SCREENSHOT = `${EVIDENCE_DIR}/06-作祟揭示-剧本3剧本阅读承接.jpg`;
const HIDDEN_TRAITOR_AFTER_READER_SCREENSHOT = `${EVIDENCE_DIR}/07-作祟揭示-剧本3关闭剧本书横幅仍在.jpg`;
const HIDDEN_TRAITOR_BOARD_SCREENSHOT = `${EVIDENCE_DIR}/08-作祟揭示-剧本3关闭横幅后牌桌.jpg`;

const FORBIDDEN_PLAYER_UI_INTERNAL_COPY = [
    '上屏',
    'off-screen',
    '看清后可关闭',
    '阅读后关闭',
    '确认是否受影响',
    '确认一下是否受影响',
    '如果有就给我看图',
    '公开步骤',
    '公开设置',
    'setup 队列',
    'setup queue',
    '英雄和叛徒会分别阅读',
    '分别阅读自己的剧本书',
] as const;

function findBetrayalEventByName(name: string) {
    const event = BETRAYAL_DISCOVERY_POOLS.events.find((candidate) => candidate.name === name);
    if (!event) {
        throw new Error(`山屋作祟揭示 E2E 缺少事件牌《${name}》`);
    }
    return event;
}

function cloneRoomDiscoveryTemplate(
    room: BetrayalCore['roomDiscoveryDeck'][number]['room'],
): BetrayalCore['roomDiscoveryDeck'][number]['room'] {
    return {
        ...room,
        tags: [...room.tags],
        doorways: [...room.doorways],
    };
}

function setNextGroundEventRoom(core: BetrayalCore) {
    const eventRoom = BETRAYAL_DISCOVERY_POOLS.roomDiscoveryByFloor.ground.find(
        (room) => room.visualId === 'kitchen',
    );
    if (!eventRoom) {
        throw new Error('山屋作祟揭示 E2E 缺少地面事件房间：厨房');
    }
    const room = cloneRoomDiscoveryTemplate(eventRoom);
    core.roomDiscoveryDeck = [{ floor: 'ground', room }];
    core.roomDiscoveryOrderByFloor = {
        ...core.roomDiscoveryOrderByFloor,
        ground: [cloneRoomDiscoveryTemplate(eventRoom)],
    };
}

async function expectNoForbiddenPlayerUiInternalCopy(locator: Locator, label: string) {
    for (const phrase of FORBIDDEN_PLAYER_UI_INTERNAL_COPY) {
        await expect(
            locator,
            `${label} 不得出现内部审查/AI过程话术：${phrase}`,
        ).not.toContainText(phrase);
    }
}

function createCrimsonHauntRevealCore(playerIds: string[] = ['0', '1', '2']): BetrayalCore {
    let core = createStartedFirstScenarioCore(playerIds);
    core.drawOrder = ['event'];
    core.eventOrder = [findBetrayalEventByName('一抹鲜红')];
    setNextGroundEventRoom(core);
    core.currentExplorer.inventory = [
        ...core.currentExplorer.inventory,
        { id: 'omen-book', name: '书本', kind: 'omen' },
        { id: 'dog', name: '狗', kind: 'omen' },
        { id: 'mask', name: '面具', kind: 'omen' },
    ];
    core.currentExplorerInventory = [...core.currentExplorer.inventory];
    core.currentExplorerTraits = { ...core.currentExplorer.traits };

    core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'hallway' });
    core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.EXPLORE_ROOM, '0', { roomId: 'ground-north' });
    if (core.pendingEventChoice?.sourceTitle !== '一抹鲜红') {
        throw new Error('一名叛徒作祟揭示 E2E 未进入《一抹鲜红》事件选择');
    }
    core = applyBetrayalCommand(
        core,
        BETRAYAL_COMMANDS.RESOLVE_EVENT_CHOICE,
        '0',
        { accept: true },
        100,
        createBetrayalScriptedRandom(3, 3, 3),
    );
    return acknowledgePendingCardResolutions(core);
}

function createDustHauntRevealCore(playerIds: string[] = ['0', '1', '2']): BetrayalCore {
    let core = createStartedFirstScenarioCore(playerIds);
    core.drawOrder = ['event'];
    core.eventOrder = [findBetrayalEventByName('一瓶微尘')];
    setNextGroundEventRoom(core);
    core.currentExplorer.inventory = [
        ...core.currentExplorer.inventory,
        { id: 'omen-book', name: '书本', kind: 'omen' },
        { id: 'dog', name: '狗', kind: 'omen' },
        { id: 'mask', name: '面具', kind: 'omen' },
    ];
    core.currentExplorerInventory = [...core.currentExplorer.inventory];
    core.currentExplorerTraits = { ...core.currentExplorer.traits };

    core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'hallway' });
    core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.EXPLORE_ROOM, '0', { roomId: 'ground-north' });
    if (core.pendingEventChoice?.sourceTitle !== '一瓶微尘') {
        throw new Error('隐藏叛徒作祟揭示 E2E 未进入《一瓶微尘》事件选择');
    }
    core = applyBetrayalCommand(
        core,
        BETRAYAL_COMMANDS.RESOLVE_EVENT_CHOICE,
        '0',
        { accept: true },
        100,
        createBetrayalScriptedRandom(3, 3, 3),
    );
    return acknowledgePendingCardResolutions(core);
}

async function openInjectedBetrayalBoard(page: Parameters<typeof injectCore>[0], core: BetrayalCore) {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('/play/betrayal?players=3&seat0=human&seat1=human&seat2=human&playerID=1', {
        waitUntil: 'domcontentloaded',
    });
    await waitForBetrayalPageReady(page);
    await injectCore(page, core);
    await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('betrayal-runtime-header-grid')).toContainText(/恶兆后|作祟中|Haunt/i);
}

async function expectScenarioReaderOpenedForRevealTransition(page: Parameters<typeof injectCore>[0], expectedText: RegExp) {
    const scenarioReaderDialog = page.getByTestId('betrayal-scenario-reader-dialog');
    await expect(
        scenarioReaderDialog,
        '页面从恶兆前同步到作祟揭示状态时必须承接一次剧本阅读',
    ).toBeVisible();
    await expect(scenarioReaderDialog.getByTestId('betrayal-scenario-opening-stage')).toBeVisible();
    await expect(scenarioReaderDialog.getByTestId('betrayal-scenario-opening-cinematic')).toBeVisible();
    await expect(scenarioReaderDialog).toContainText(expectedText);
    await expect(
        page.getByTestId('betrayal-recent-roll-panel'),
        '作祟开场不能继续用骰盘挡住剧本阅读承接',
    ).toHaveCount(0);
}

async function expectHauntRevealSource(
    page: Parameters<typeof injectCore>[0],
    {
        scenarioCardId,
        triggeringOmenId,
        scenarioCardTitle,
        omenName,
        hauntNumber,
    }: {
        scenarioCardId: string;
        triggeringOmenId?: string | RegExp | null;
        scenarioCardTitle: string;
        omenName: string;
        hauntNumber: number;
    },
) {
    const source = page.getByTestId('betrayal-haunt-reveal-source');
    await expect(source).toBeVisible();
    await expect(source).toHaveAttribute('data-haunt-scenario-card-id', scenarioCardId);
    if (triggeringOmenId === null) {
        await expect(source).not.toHaveAttribute('data-haunt-triggering-omen-id', /.+/);
    } else if (triggeringOmenId !== undefined) {
        await expect(source).toHaveAttribute('data-haunt-triggering-omen-id', triggeringOmenId);
    }
    await expect(source).toContainText(`剧本卡 ${scenarioCardTitle}`);
    await expect(source).toContainText(`触发 ${omenName}`);
    await expect(source).toContainText(`作祟 ${hauntNumber}`);
    await expect(source).not.toContainText(/公开朗读|公开设置|秘密规则|目标|setup|队列/);
}

test.describe('山屋惊魂作祟揭示顺序和秘密边界', () => {
    test('一名叛徒作祟揭示只显示可关闭阶段横幅', async ({ page, context }) => {
        test.setTimeout(120000);
        await initBetrayalContext(context);
        const diagnostics = attachPageDiagnostics(page, 'betrayal-haunt-reveal-one-traitor');

        await warmBetrayalFrontend(context);
        await openInjectedBetrayalBoard(page, createCrimsonHauntRevealCore());

        await expectScenarioReaderOpenedForRevealTransition(page, /木乃伊横行|剧本1/);
        await saveScreenshot(page, ONE_TRAITOR_READER_SCREENSHOT);
        await page.getByTestId('betrayal-scenario-reader-close').click();
        await expect(page.getByTestId('betrayal-scenario-reader-dialog')).toHaveCount(0);

        await expect(page.getByTestId('betrayal-haunt-reveal-player-title')).toContainText('作祟开始');
        await expect(page.getByTestId('betrayal-haunt-reveal-lead')).toContainText('剧本已切换。');
        await expect(page.getByTestId('betrayal-haunt-reveal-close')).toContainText('关闭');
        await expect(page.getByTestId('betrayal-haunt-reveal-cue')).toHaveAttribute('data-haunt-setup-count', '7');
        await expect(page.getByTestId('betrayal-haunt-reveal-status-strip')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-haunt-reveal-action-panel')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-haunt-reveal-resume-hint')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-haunt-reveal-open-scenario')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-haunt-reveal-return-to-board')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-haunt-reveal-step-card-public')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-haunt-reveal-public-flow')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-haunt-reveal-secret-boundary')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-haunt-reveal-cue')).not.toContainText(/公开朗读|各自阅读|公开读|秘密规则|目标/);
        await expectNoForbiddenPlayerUiInternalCopy(page.locator('body'), '一名叛徒作祟揭示页');
        await expect(page.getByTestId('betrayal-haunt-setup-queue')).toHaveCount(0);
        await expect(page.getByText('治疗并强化叛徒')).toHaveCount(0);
        await expect(page.getByText('准备杰克标记')).toHaveCount(0);

        const revealCue = page.getByTestId('betrayal-haunt-reveal-cue');
        await expect(revealCue).toBeVisible();
        await expectHauntRevealSource(page, {
            scenarioCardId: 'mummy-rampage',
            triggeringOmenId: null,
            scenarioCardTitle: '木乃伊横行',
            omenName: 'A Splash of Crimson',
            hauntNumber: 1,
        });
        await expect(page.getByTestId('betrayal-open-scenario')).toHaveText(/^剧本$/);
        await expect(page.getByTestId('betrayal-open-scenario')).not.toContainText(/查阅/);
        await expect(page.getByTestId('betrayal-action-use')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-action-trade')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-attack-weapon-selector')).toHaveCount(0);
        await saveScreenshot(page, ONE_TRAITOR_REVEAL_SCREENSHOT);
        await expect(revealCue).toBeVisible();
        await expect(page.getByTestId('betrayal-action-use')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-haunt-reveal-return-to-board')).toHaveCount(0);
        await saveScreenshot(page, ONE_TRAITOR_AFTER_READER_SCREENSHOT);

        await page.getByTestId('betrayal-haunt-reveal-close').click();
        await expect(revealCue).toHaveCount(0);
        await expect(page.getByTestId('betrayal-scenario-reader-dialog')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-open-scenario')).toBeVisible();
        await expect(page.getByTestId('betrayal-haunt-setup-queue')).toHaveCount(0);
        await saveScreenshot(page, ONE_TRAITOR_BOARD_SCREENSHOT);

        assertNoFatalFrontendErrors([{ label: 'betrayal-haunt-reveal-one-traitor', diagnostics }]);
    });

    test('剧本3作祟揭示横幅不暴露规则细节，关闭前不显示后续动作', async ({ page, context }) => {
        test.setTimeout(120000);
        await initBetrayalContext(context);
        const diagnostics = attachPageDiagnostics(page, 'betrayal-haunt-reveal-hidden-traitor');

        await warmBetrayalFrontend(context);
        await openInjectedBetrayalBoard(page, createDustHauntRevealCore());

        await expectScenarioReaderOpenedForRevealTransition(page, /灰尘|剧本3/);
        await saveScreenshot(page, HIDDEN_TRAITOR_READER_SCREENSHOT);
        await page.getByTestId('betrayal-scenario-reader-close').click();
        await expect(page.getByTestId('betrayal-scenario-reader-dialog')).toHaveCount(0);

        await expect(page.getByTestId('betrayal-haunt-reveal-player-title')).toContainText('作祟开始');
        await expect(page.getByTestId('betrayal-haunt-reveal-lead')).toContainText('剧本已切换。');
        await expect(page.getByTestId('betrayal-haunt-reveal-close')).toContainText('关闭');
        await expect(page.getByTestId('betrayal-haunt-reveal-cue')).toHaveAttribute('data-haunt-type', 'hidden-traitor');
        await expect(page.getByTestId('betrayal-haunt-reveal-status-strip')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-haunt-reveal-cue')).toHaveAttribute('data-haunt-setup-count', '5');
        await expect(page.getByTestId('betrayal-haunt-reveal-step-traitor-intro')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-haunt-reveal-step-traitor-setup')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-haunt-reveal-resume-hint')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-haunt-reveal-open-scenario')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-haunt-reveal-step-card-public')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-haunt-reveal-public-flow')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-haunt-reveal-secret-boundary')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-haunt-reveal-cue')).not.toContainText(/公开朗读|各自阅读|公开读|公开设置|秘密规则|目标|不要公开谁是叛徒|隐藏叛徒/);
        await expectNoForbiddenPlayerUiInternalCopy(page.locator('body'), '隐藏叛徒作祟揭示页');
        await expect(page.getByTestId('betrayal-haunt-setup-queue')).toHaveCount(0);
        await expect(page.getByText('秘密分发疾病标记')).toHaveCount(0);

        const revealCue = page.getByTestId('betrayal-haunt-reveal-cue');
        await expect(revealCue).toBeVisible();
        await expectHauntRevealSource(page, {
            scenarioCardId: 'mummy-rampage',
            triggeringOmenId: null,
            scenarioCardTitle: '木乃伊横行',
            omenName: 'A Dusty Vial',
            hauntNumber: 3,
        });
        await expect(page.getByTestId('betrayal-open-scenario')).toHaveText(/^剧本$/);
        await expect(page.getByTestId('betrayal-open-scenario')).not.toContainText(/查阅/);
        await expect(page.getByTestId('betrayal-dust-progress-strip')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-action-use')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-action-trade')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-attack-weapon-selector')).toHaveCount(0);
        await expect(page.getByText('攻击灰尘')).toHaveCount(0);
        await expect(page.getByText('交换疾病')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-haunt-reveal-return-to-board')).toHaveCount(0);
        await saveScreenshot(page, HIDDEN_TRAITOR_REVEAL_SCREENSHOT);
        await expect(revealCue).toBeVisible();
        await expect(page.getByTestId('betrayal-dust-progress-strip')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-action-use')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-haunt-reveal-return-to-board')).toHaveCount(0);
        await saveScreenshot(page, HIDDEN_TRAITOR_AFTER_READER_SCREENSHOT);

        await page.getByTestId('betrayal-haunt-reveal-close').click();
        await expect(revealCue).toHaveCount(0);
        const dustProgressStrip = page.getByTestId('betrayal-dust-progress-strip');
        await expect(dustProgressStrip).toBeVisible();
        await expect(dustProgressStrip).toContainText('剧本3');
        await expect(dustProgressStrip).not.toContainText(/查阅/);
        await expect(dustProgressStrip).toContainText('灰尘');
        await expect(dustProgressStrip).toContainText('研究');
        await expect(dustProgressStrip).toContainText('疾病');
        await expect(dustProgressStrip).toContainText('交换疾病');
        await expect(page.getByText('秘密分发疾病标记')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-scenario-reader-dialog')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-open-scenario')).toBeVisible();
        await saveScreenshot(page, HIDDEN_TRAITOR_BOARD_SCREENSHOT);

        assertNoFatalFrontendErrors([{ label: 'betrayal-haunt-reveal-hidden-traitor', diagnostics }]);
    });
});
