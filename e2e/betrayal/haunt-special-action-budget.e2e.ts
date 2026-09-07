import { expect, test, type Page } from '@playwright/test';
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
    initBetrayalContext,
    injectCore,
    saveScreenshot,
    waitForBetrayalPageReady,
    warmBetrayalFrontend,
} from './betrayalTestHelpers';

const EVIDENCE_DIR = resolve(process.cwd(), 'evidence/betrayal-core-interactions/haunt-special-action-budget');
const USED_ACTION_SCREENSHOT = `${EVIDENCE_DIR}/01-作祟特殊行动已用禁用原因.jpg`;

type HarnessWindow = Window & {
    __BG_TEST_HARNESS__?: {
        state?: {
            get?: () => {
                core?: BetrayalCore;
            };
        };
    };
    __BG_LAST_COMMAND_REJECTED__?: { commandType: string; error: string };
};

function dismissBlockingBoardOverlays(core: BetrayalCore): BetrayalCore {
    core.latestDiscovery = null;
    core.latestDiscoveryOwnerPlayerId = null;
    core.pendingEventChoice = null;
    core.recentRoll = null;
    return core;
}

function placeCurrentExplorerInDustResearchRoom(core: BetrayalCore): BetrayalCore {
    const roomId = 'ground-north';
    core.currentExplorer = {
        ...core.currentExplorer,
        roomId,
    };
    core.activeRoomId = roomId;
    core.currentExplorerRoomId = roomId;
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.currentExplorerInventory = [...core.currentExplorer.inventory];
    core.rooms = core.rooms.map((room) => (
        room.id === roomId
            ? {
                ...room,
                state: 'discovered',
                name: '画廊',
                hint: '灰尘剧本作祟特殊行动预算 E2E 板块',
                tags: ['恶兆'],
                discoveryReward: 'omen',
                visualId: 'gallery',
            }
            : room
    ));
    return core;
}

function createDustHauntUsedSpecialActionCore(): BetrayalCore {
    let core = createStartedFirstScenarioCore(['0', '1', '2']);
    const dustEvent = BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '一瓶微尘');
    if (!dustEvent) {
        throw new Error('山屋灰尘作祟 E2E 缺少事件牌《一瓶微尘》');
    }

    core.drawOrder = ['event'];
    core.eventOrder = [dustEvent];
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
    core = applyBetrayalCommand(
        core,
        BETRAYAL_COMMANDS.RESOLVE_EVENT_CHOICE,
        '0',
        { accept: true },
        100,
        createBetrayalScriptedRandom(3, 3, 3),
    );

    core = dismissBlockingBoardOverlays(core);
    core = placeCurrentExplorerInDustResearchRoom(core);
    core.usedCardIdsThisTurn = ['search-for-cure'];
    core.recommendedAction = 'use';
    return core;
}

async function readBudgetViewState(page: Page) {
    return page.evaluate(() => {
        const holder = window as HarnessWindow;
        const core = holder.__BG_TEST_HARNESS__?.state?.get?.().core;
        const action = document.querySelector<HTMLButtonElement>('[data-testid="betrayal-action-use"]');
        const cue = document.querySelector<HTMLElement>('[data-testid="betrayal-action-cue"]');
        const progress = document.querySelector<HTMLElement>('[data-testid="betrayal-dust-progress-strip"]');
        return {
            phase: core?.phase ?? null,
            currentPlayer: core?.currentPlayer ?? null,
            currentExplorerPlayerId: core?.currentExplorer?.playerId ?? null,
            currentRoomId: core?.currentExplorer?.roomId ?? null,
            usedCardIds: core?.usedCardIdsThisTurn ?? [],
            recommendedAction: core?.recommendedAction ?? null,
            actionText: action?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
            actionDisabled: Boolean(action?.disabled),
            disabledReason: action?.getAttribute('data-action-disabled-reason') ?? '',
            title: action?.getAttribute('title') ?? '',
            cueText: cue?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
            progressText: progress?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
            rejected: holder.__BG_LAST_COMMAND_REJECTED__ ?? null,
        };
    });
}

test.describe('山屋惊魂作祟特殊行动预算', () => {
    test('已用寻找解药时真实牌桌保留作祟主动作入口并显示统一禁用原因', async ({ page, context }) => {
        test.setTimeout(120000);
        await initBetrayalContext(context);
        const diagnostics = attachPageDiagnostics(page, 'betrayal-haunt-special-action-budget');

        await page.setViewportSize({ width: 1600, height: 900 });
        await warmBetrayalFrontend(context);
        await page.goto('/play/betrayal?players=3&seat0=human&seat1=human&seat2=human&playerID=1', {
            waitUntil: 'domcontentloaded',
        });
        await waitForBetrayalPageReady(page);
        await injectCore(page, createDustHauntUsedSpecialActionCore());

        await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });
        await expect(page.getByTestId('betrayal-dust-progress-strip')).toContainText('灰尘');
        await expect(page.getByTestId('betrayal-dust-progress-strip')).toContainText('研究');

        const useAction = page.getByTestId('betrayal-action-use');
        await expect(useAction).toBeVisible();
        await expect(useAction).toContainText('寻找解药');
        await expect(useAction).toBeDisabled();
        await expect(useAction).toHaveAttribute('data-action-disabled-reason', '本回合已使用该作祟特殊行动');
        await expect(useAction).toHaveAttribute('title', '本回合已使用该作祟特殊行动');
        await expect(page.getByTestId('betrayal-action-cue')).toContainText('本回合已使用该作祟特殊行动');

        await expect.poll(async () => readBudgetViewState(page), {
            message: '作祟特殊行动预算必须由真实牌桌按钮、提示和状态共同表达',
            timeout: 10000,
        }).toMatchObject({
            phase: 'haunt',
            currentPlayer: '1',
            currentExplorerPlayerId: '1',
            currentRoomId: 'ground-north',
            usedCardIds: expect.arrayContaining(['search-for-cure']),
            recommendedAction: 'use',
            actionText: expect.stringContaining('寻找解药'),
            actionDisabled: true,
            disabledReason: '本回合已使用该作祟特殊行动',
            title: '本回合已使用该作祟特殊行动',
            cueText: expect.stringContaining('本回合已使用该作祟特殊行动'),
            progressText: expect.stringContaining('灰尘'),
            rejected: null,
        });

        await saveScreenshot(page, USED_ACTION_SCREENSHOT);
        assertNoFatalFrontendErrors([{ label: 'betrayal-haunt-special-action-budget', diagnostics }]);
    });
});
