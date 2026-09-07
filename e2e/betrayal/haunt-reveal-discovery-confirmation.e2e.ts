import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
    clearEvidenceScreenshotsForTest,
    getEvidenceScreenshotPath,
} from '../framework/evidenceScreenshots';
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
    dispatchHarnessCommand,
    injectCore,
    saveScreenshot,
    waitForBetrayalPageReady,
    warmBetrayalFrontend,
} from './betrayalTestHelpers';

const DISCOVERY_CONFIRM_SCREENSHOT = '01-先翻预兆并同屏显示作祟检定.jpg';
const REVEAL_READER_SCREENSHOT = '02-确认预兆后打开剧本书.jpg';
const DISCOVERY_DONE_SCREENSHOT = '03-关闭剧本书后回到作祟牌桌.jpg';
const REMOTE_VIEWER_DISCOVERY_SCREENSHOT = '04-旁观视角先看触发预兆和检定.jpg';
const SAFE_OMEN_CONFIRM_SCREENSHOT = '05-未触发作祟-同屏确认预兆与作祟检定.jpg';
const SAFE_OMEN_DONE_SCREENSHOT = '07-未触发作祟-确认后回恶兆前牌桌.jpg';
const SAFE_OMEN_MATRIX_FIRST_CARD_SCREENSHOT = '08-当前9张预兆矩阵-首张同屏确认.jpg';
const SAFE_OMEN_MATRIX_DONE_SCREENSHOT = '09-当前9张预兆矩阵-末张确认后持有区.jpg';
const HAUNT_OMEN_MATRIX_REVEAL_SCREENSHOT = '10-当前9张预兆触发矩阵-首张先翻预兆.jpg';
const HAUNT_OMEN_MATRIX_DONE_SCREENSHOT = '11-当前9张预兆触发矩阵-末张确认后作祟牌桌.jpg';
const TEST_URL = '/play/betrayal?players=3&playerID=0&seat0=human&seat1=human&seat2=human&seed=haunt-reveal-discovery-confirmation';

type OmenDiscoveryCard = BetrayalCore['possessionOrderByKind']['omen'][number];

const CURRENT_OMEN_DISCOVERY_CARDS: OmenDiscoveryCard[] =
    BETRAYAL_DISCOVERY_POOLS.possessions.omen.map((omen) => ({ ...omen }));

const DOG_OMEN_CARD =
    CURRENT_OMEN_DISCOVERY_CARDS.find((omen) => omen.id === 'dog') ??
    ({ id: 'dog', name: '狗', kind: 'omen' } satisfies OmenDiscoveryCard);
const BOOK_OMEN_CARD =
    CURRENT_OMEN_DISCOVERY_CARDS.find((omen) => omen.id === 'omen-book') ??
    ({ id: 'omen-book', name: '书', kind: 'omen' } satisfies OmenDiscoveryCard);
const MASK_OMEN_CARD =
    CURRENT_OMEN_DISCOVERY_CARDS.find((omen) => omen.id === 'mask') ??
    ({ id: 'mask', name: '面具', kind: 'omen' } satisfies OmenDiscoveryCard);
const SKULL_OMEN_CARD =
    CURRENT_OMEN_DISCOVERY_CARDS.find((omen) => omen.id === 'skull') ??
    ({ id: 'skull', name: '骷髅', kind: 'omen' } satisfies OmenDiscoveryCard);
const HELD_OMEN_CARDS = [BOOK_OMEN_CARD, MASK_OMEN_CARD, SKULL_OMEN_CARD] as const;

function pickVisibleHeldOmenCards(excludedCardId: string): OmenDiscoveryCard[] {
    const preferredCards = [
        ...HELD_OMEN_CARDS,
        ...CURRENT_OMEN_DISCOVERY_CARDS,
    ].filter((card) => card.id !== excludedCardId);
    const byId = new Map(preferredCards.map((card) => [card.id, card]));
    const cards = [...byId.values()].slice(0, 3);
    if (cards.length < 3) {
        throw new Error('山屋 E2E 缺少足够真实预兆卡来构造作祟检定压力态');
    }
    return cards.map((card) => ({ ...card }));
}

function cloneExplorerForFixture(
    explorer: BetrayalCore['currentExplorer'],
): BetrayalCore['currentExplorer'] {
    return {
        ...explorer,
        traits: { ...explorer.traits },
        traitTracks: Object.fromEntries(
            Object.entries(explorer.traitTracks).map(([trait, track]) => [
                trait,
                { ...track, values: [...track.values] },
            ]),
        ) as BetrayalCore['currentExplorer']['traitTracks'],
        inventory: explorer.inventory.map((card) => ({ ...card })),
    };
}

function focusFixtureOnPlayer(core: BetrayalCore, playerId: string): BetrayalCore {
    const explorers = [core.currentExplorer, ...core.otherExplorers].map(cloneExplorerForFixture);
    const currentExplorer = explorers.find((explorer) => explorer.playerId === playerId);
    if (!currentExplorer) {
        throw new Error(`普通预兆作祟 E2E 夹具缺少玩家：${playerId}`);
    }
    return {
        ...core,
        currentPlayer: playerId,
        currentExplorer,
        otherExplorers: explorers.filter((explorer) => explorer.playerId !== playerId),
        activeRoomId: currentExplorer.roomId,
        currentExplorerRoomId: currentExplorer.roomId,
        currentExplorerTraits: { ...currentExplorer.traits },
        currentExplorerInventory: currentExplorer.inventory.map((card) => ({ ...card })),
        turnStartInventoryCardIds: currentExplorer.inventory.map((card) => card.id),
    };
}

type HauntDiscoveryConfirmationState = {
    phase?: string;
    currentPlayer?: string;
    hauntRevealerPlayerId?: string | null;
    latestDiscoveryTitle?: string | null;
    latestDiscoveryKind?: string | null;
    currentInventory?: Array<{
        id?: string;
        name?: string;
        kind?: string;
    }>;
    explorers?: Array<{
        playerId?: string;
        inventory?: Array<{
            id?: string;
            name?: string;
            kind?: string;
        }>;
    }>;
    pendingSteps?: Array<{
        stepKind?: string;
        index?: number;
        total?: number;
        cardName?: string;
    }>;
    rejected?: { commandType?: string; error?: string } | null;
};

function createOmenHauntPendingResolutionCore(
    omenCard: OmenDiscoveryCard = DOG_OMEN_CARD,
    actorPlayerId = '0',
): BetrayalCore {
    let core = createStartedFirstScenarioCore(['0', '1', '2']);
    core = focusFixtureOnPlayer(core, actorPlayerId);
    core.drawOrder = ['omen'];
    core.possessionOrderByKind.omen = [
        { ...omenCard },
    ];
    const heldOmenCards = pickVisibleHeldOmenCards(omenCard.id);
    core.currentExplorer.inventory = [
        { ...heldOmenCards[0]! },
    ];
    core.currentExplorerInventory = [...core.currentExplorer.inventory];
    core.otherExplorers = core.otherExplorers.map((explorer, index) => ({
        ...explorer,
        inventory: [
            { ...heldOmenCards[index + 1]! },
        ],
    }));

    core = applyBetrayalCommand(
        core,
        BETRAYAL_COMMANDS.EXPLORE_ROOM,
        actorPlayerId,
        { roomId: 'ground-east' },
        100,
        createBetrayalScriptedRandom(3, 3, 3, 3),
    );

    if (core.phase !== 'haunt' || !core.scenarioRuntime.hauntTriggered) {
        throw new Error('普通预兆作祟 E2E 夹具未触发作祟');
    }
    if (core.latestDiscovery?.kind !== 'omen') {
        throw new Error('普通预兆作祟 E2E 夹具缺少预兆发现');
    }
    if (core.latestDiscovery.title !== omenCard.name) {
        throw new Error(`普通预兆作祟 E2E 夹具翻出的不是预期预兆：${omenCard.name}`);
    }
    if (core.latestDiscovery.resolutionSteps?.length !== 2) {
        throw new Error('普通预兆作祟 E2E 夹具必须保留获得预兆和作祟检定两条结果事实');
    }
    if (core.pendingCardResolutionQueue.length !== 1) {
        throw new Error('普通预兆作祟 E2E 夹具必须只保留一次玩家确认');
    }
    if (core.pendingCardResolutionQueue[0]?.stepKind !== 'drawn-card' || core.pendingCardResolutionQueue[0]?.total !== 1) {
        throw new Error('普通预兆作祟 E2E 玩家确认不得暴露为确认 1/2、确认 2/2');
    }
    return core;
}

function createSafeOmenPendingResolutionCore(
    omenCard: OmenDiscoveryCard = DOG_OMEN_CARD,
): BetrayalCore {
    let core = createStartedFirstScenarioCore(['0', '1', '2']);
    core.drawOrder = ['omen'];
    core.possessionOrderByKind.omen = [
        { ...omenCard },
    ];
    core.currentExplorer.inventory = [];
    core.currentExplorerInventory = [];
    core.otherExplorers = core.otherExplorers.map((explorer) => ({
        ...explorer,
        inventory: [],
    }));

    core = applyBetrayalCommand(
        core,
        BETRAYAL_COMMANDS.EXPLORE_ROOM,
        '0',
        { roomId: 'ground-east' },
        100,
        createBetrayalScriptedRandom(1, 1, 1, 1),
    );

    if (core.phase !== 'preHaunt' || core.scenarioRuntime.hauntTriggered) {
        throw new Error('普通预兆未触发作祟 E2E 夹具不应进入作祟');
    }
    if (core.latestDiscovery?.kind !== 'omen') {
        throw new Error('普通预兆未触发作祟 E2E 夹具缺少预兆发现');
    }
    if (core.latestDiscovery.resolutionSteps?.length !== 2) {
        throw new Error('普通预兆未触发作祟 E2E 夹具必须保留获得预兆和作祟检定两条结果事实');
    }
    if (core.pendingCardResolutionQueue.length !== 1) {
        throw new Error('普通预兆未触发作祟 E2E 夹具必须只保留一次玩家确认');
    }
    if (core.pendingCardResolutionQueue[0]?.stepKind !== 'drawn-card' || core.pendingCardResolutionQueue[0]?.total !== 1) {
        throw new Error('普通预兆未触发作祟 E2E 玩家确认不得暴露为确认 1/2、确认 2/2');
    }
    return core;
}

const readHauntDiscoveryConfirmationState = async (
    page: Page,
): Promise<HauntDiscoveryConfirmationState> =>
    page.evaluate(() => {
        const holder = window as typeof window & {
            __BG_TEST_HARNESS__?: {
                state?: {
                    get?: () => {
                        core?: {
                            phase?: string;
                            currentPlayer?: string;
                            currentExplorer?: {
                                inventory?: Array<{
                                    id?: string;
                                    name?: string;
                                    kind?: string;
                                }>;
                            };
                            latestDiscovery?: {
                                title?: string;
                                kind?: string;
                            } | null;
                            scenarioRuntime?: {
                                hauntRevealerPlayerId?: string | null;
                            };
                            pendingCardResolutionQueue?: Array<{
                                stepKind?: string;
                                index?: number;
                                total?: number;
                                cardName?: string;
                            }>;
                            currentExplorer?: {
                                playerId?: string;
                                inventory?: Array<{
                                    id?: string;
                                    name?: string;
                                    kind?: string;
                                }>;
                            };
                            otherExplorers?: Array<{
                                playerId?: string;
                                inventory?: Array<{
                                    id?: string;
                                    name?: string;
                                    kind?: string;
                                }>;
                            }>;
                        };
                    };
                };
            };
            __BG_LAST_COMMAND_REJECTED__?: { commandType?: string; error?: string } | null;
        };
        const core = holder.__BG_TEST_HARNESS__?.state?.get?.()?.core;
        const explorers = [
            core?.currentExplorer,
            ...(core?.otherExplorers ?? []),
        ].filter((explorer): explorer is NonNullable<typeof explorer> => Boolean(explorer));
        return {
            phase: core?.phase,
            currentPlayer: core?.currentPlayer,
            hauntRevealerPlayerId: core?.scenarioRuntime?.hauntRevealerPlayerId ?? null,
            latestDiscoveryTitle: core?.latestDiscovery?.title ?? null,
            latestDiscoveryKind: core?.latestDiscovery?.kind ?? null,
            currentInventory: core?.currentExplorer?.inventory?.map((card) => ({
                id: card.id,
                name: card.name,
                kind: card.kind,
            })) ?? [],
            explorers: explorers.map((explorer) => ({
                playerId: explorer.playerId,
                inventory: explorer.inventory?.map((card) => ({
                    id: card.id,
                    name: card.name,
                    kind: card.kind,
                })) ?? [],
            })),
            pendingSteps: core?.pendingCardResolutionQueue?.map((step) => ({
                stepKind: step.stepKind,
                index: step.index,
                total: step.total,
                cardName: step.cardName,
            })) ?? [],
            rejected: holder.__BG_LAST_COMMAND_REJECTED__ ?? null,
        };
    });

const closeScenarioReaderIfPresent = async (page: Page): Promise<void> => {
    const scenarioReader = page.getByTestId('betrayal-scenario-reader-dialog');
    if (!await scenarioReader.isVisible({ timeout: 800 }).catch(() => false)) {
        return;
    }
    await expect(scenarioReader).toContainText('木乃伊横行');
    await page.getByTestId('betrayal-scenario-reader-close').click();
    await expect(scenarioReader).toHaveCount(0);
};

async function saveEvidenceScreenshot(page: Page, testInfo: TestInfo, filename: string): Promise<void> {
    await saveScreenshot(
        page,
        getEvidenceScreenshotPath(testInfo, filename, {
            filename,
            requireChineseName: true,
        }),
    );
}

async function acknowledgeRemainingPlayers(page: Page): Promise<void> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const pending = await page.evaluate(() => (
            (window as typeof window & { __BG_TEST_HARNESS__?: { state?: { get?: () => { core?: BetrayalCore } } } })
                .__BG_TEST_HARNESS__?.state?.get?.().core?.pendingCardResolutionQueue?.[0]
        ));
        if (!pending) return;
        const requiredPlayerIds = pending.requiredPlayerIds?.length ? pending.requiredPlayerIds : [pending.playerId];
        const nextPlayerId = requiredPlayerIds.find((playerId) => !(pending.acknowledgedPlayerIds ?? []).includes(playerId));
        if (!nextPlayerId) return;
        await dispatchHarnessCommand(page, BETRAYAL_COMMANDS.ACKNOWLEDGE_CARD_RESOLUTION, nextPlayerId, { resolutionId: pending.id });
    }
    throw new Error('山屋预兆矩阵确认队列超过安全上限');
}

test.beforeEach(async ({ page: _page }, testInfo) => {
    await clearEvidenceScreenshotsForTest(testInfo);
});

test('普通预兆触发作祟时先确认预兆和检定，再承接作祟揭示', async ({ page, context }, testInfo) => {
    test.setTimeout(120000);
    await initBetrayalContext(context);
    const diagnostics = attachPageDiagnostics(page, 'betrayal-haunt-reveal-discovery-confirmation');

    await page.setViewportSize({ width: 1600, height: 900 });
    await warmBetrayalFrontend(context);
    await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitForBetrayalPageReady(page);
    await injectCore(page, createOmenHauntPendingResolutionCore());
    await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });

    await expect(page.getByTestId('betrayal-haunt-reveal-cue'), '预兆卡确认前作祟揭示横幅不得抢先出现').toHaveCount(0);
    await expect(page.getByTestId('betrayal-scenario-reader-dialog'), '预兆卡确认前不得自动打开剧本书').toHaveCount(0);
    const discoveryPanel = page.getByTestId('betrayal-discovery-panel');
    await expect(discoveryPanel, '触发作祟的预兆卡必须先显示').toBeVisible({ timeout: 10000 });
    await expect(discoveryPanel).toContainText(DOG_OMEN_CARD.name);
    await expect(discoveryPanel.getByTestId('betrayal-discovery-continue')).toHaveText('确认');
    await expect(discoveryPanel.getByTestId('betrayal-discovery-continue')).toHaveAttribute(
        'data-pending-card-resolution-step',
        '1/1',
    );
    await expect(discoveryPanel.getByTestId('betrayal-recent-roll-panel')).toBeVisible();
    await expect(discoveryPanel.getByTestId('betrayal-house-dice-3d-group')).toBeVisible();
    await expect(discoveryPanel.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute('data-dice-count', '4');
    await expect(discoveryPanel.getByTestId('betrayal-recent-roll-total')).toContainText('总点数');
    await expect.poll(() => readHauntDiscoveryConfirmationState(page)).toMatchObject({
        phase: 'haunt',
        latestDiscoveryTitle: DOG_OMEN_CARD.name,
        latestDiscoveryKind: 'omen',
        pendingSteps: [
            { stepKind: 'drawn-card', index: 1, total: 1, cardName: DOG_OMEN_CARD.name },
        ],
        rejected: null,
    });
    await expect.poll(() => readHauntDiscoveryConfirmationState(page)).toMatchObject({
        pendingSteps: [
            { stepKind: 'drawn-card', index: 1, total: 1, cardName: DOG_OMEN_CARD.name },
        ],
        rejected: null,
    });
    await saveEvidenceScreenshot(page, testInfo, DISCOVERY_CONFIRM_SCREENSHOT);

    await discoveryPanel.getByTestId('betrayal-discovery-continue').click();
    await expect(discoveryPanel).toHaveCount(0);
    const scenarioReader = page.getByTestId('betrayal-scenario-reader-dialog');
    await expect(scenarioReader, '确认触发来源后才自动打开一次剧本书').toBeVisible({ timeout: 10000 });
    await expect(scenarioReader).toContainText('木乃伊横行');
    await saveEvidenceScreenshot(page, testInfo, REVEAL_READER_SCREENSHOT);
    await page.getByTestId('betrayal-scenario-reader-close').click();
    await expect(scenarioReader).toHaveCount(0);
    await expect(page.getByTestId('betrayal-haunt-reveal-cue'), '剧本书已承接本次作祟开始后，不再追加作祟横幅').toHaveCount(0);
    await expect(page.getByTestId('betrayal-discovery-panel'), '已确认过的预兆卡关闭剧本书后不得重复弹出').toHaveCount(0);
    await expect(page.getByTestId('betrayal-open-scenario')).toBeVisible();
    await expect(page.getByTestId('betrayal-runtime-header-grid')).toContainText(/作祟中|恶兆后|Haunt/i);
    await expect.poll(() => readHauntDiscoveryConfirmationState(page)).toMatchObject({
        phase: 'haunt',
        pendingSteps: [],
        rejected: null,
    });
    await saveEvidenceScreenshot(page, testInfo, DISCOVERY_DONE_SCREENSHOT);

    await assertNoFatalFrontendErrors([
        { label: 'betrayal-haunt-reveal-discovery-confirmation', diagnostics },
    ]);
});

test('旁观视角也先看触发预兆和检定，再本地进入剧本阅读', async ({ page, context }, testInfo) => {
    test.setTimeout(120000);
    await initBetrayalContext(context);
    const diagnostics = attachPageDiagnostics(page, 'betrayal-haunt-reveal-remote-viewer-confirmation');

    await page.setViewportSize({ width: 1600, height: 900 });
    await warmBetrayalFrontend(context);
    await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitForBetrayalPageReady(page);
    await injectCore(page, createOmenHauntPendingResolutionCore(DOG_OMEN_CARD, '1'));
    await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });

    await expect(page.getByTestId('betrayal-haunt-reveal-cue'), '旁观视角在看完触发预兆结果前不得先显示作祟揭示').toHaveCount(0);
    await expect(page.getByTestId('betrayal-scenario-reader-dialog'), '旁观视角在看完触发预兆结果前不得先打开剧本书').toHaveCount(0);
    const discoveryPanel = page.getByTestId('betrayal-discovery-panel');
    await expect(discoveryPanel, '旁观视角也必须先看到触发作祟的预兆结果').toBeVisible({ timeout: 10000 });
    await expect(discoveryPanel).toContainText(DOG_OMEN_CARD.name);
    await expect(discoveryPanel.getByTestId('betrayal-recent-roll-panel')).toBeVisible();
    await expect(discoveryPanel.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute('data-dice-count', '4');
    await expect.poll(() => readHauntDiscoveryConfirmationState(page)).toMatchObject({
        phase: 'haunt',
        latestDiscoveryTitle: DOG_OMEN_CARD.name,
        latestDiscoveryKind: 'omen',
        pendingSteps: [
            { stepKind: 'drawn-card', index: 1, total: 1, cardName: DOG_OMEN_CARD.name },
        ],
        rejected: null,
    });
    await saveEvidenceScreenshot(page, testInfo, REMOTE_VIEWER_DISCOVERY_SCREENSHOT);

    await discoveryPanel.getByTestId('betrayal-discovery-continue').click();
    await expect(discoveryPanel).toHaveCount(0);
    const scenarioReader = page.getByTestId('betrayal-scenario-reader-dialog');
    await expect(scenarioReader, '旁观者本地确认看完结果后才进入剧本阅读').toBeVisible({ timeout: 10000 });
    await expect(scenarioReader).toContainText('木乃伊横行');
    await expect.poll(() => readHauntDiscoveryConfirmationState(page)).toMatchObject({
        pendingSteps: [
            { stepKind: 'drawn-card', index: 1, total: 1, cardName: DOG_OMEN_CARD.name },
        ],
        rejected: null,
    });

    await assertNoFatalFrontendErrors([
        { label: 'betrayal-haunt-reveal-remote-viewer-confirmation', diagnostics },
    ]);
});

test('普通预兆未触发作祟时同屏显示获得预兆和作祟检定且只需一次确认', async ({ page, context }, testInfo) => {
    test.setTimeout(120000);
    await initBetrayalContext(context);
    const diagnostics = attachPageDiagnostics(page, 'betrayal-safe-omen-discovery-confirmation');

    await page.setViewportSize({ width: 1600, height: 900 });
    await warmBetrayalFrontend(context);
    await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitForBetrayalPageReady(page);
    await injectCore(page, createSafeOmenPendingResolutionCore());
    await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });

    await expect(page.getByTestId('betrayal-haunt-reveal-cue')).toHaveCount(0);
    const discoveryPanel = page.getByTestId('betrayal-discovery-panel');
    await expect(discoveryPanel).toBeVisible({ timeout: 10000 });
    await expect(discoveryPanel).toContainText('狗');
    await expect(discoveryPanel.getByTestId('betrayal-discovery-continue')).toHaveText('确认');
    await expect(discoveryPanel.getByTestId('betrayal-discovery-continue')).toHaveAttribute(
        'data-pending-card-resolution-step',
        '1/1',
    );
    await expect.poll(() => readHauntDiscoveryConfirmationState(page)).toMatchObject({
        phase: 'preHaunt',
        latestDiscoveryTitle: '狗',
        latestDiscoveryKind: 'omen',
        pendingSteps: [
            { stepKind: 'drawn-card', index: 1, total: 1, cardName: '狗' },
        ],
        rejected: null,
    });
    await saveEvidenceScreenshot(page, testInfo, SAFE_OMEN_CONFIRM_SCREENSHOT);

    await discoveryPanel.getByTestId('betrayal-discovery-continue').click();
    await expect(discoveryPanel).toHaveCount(0);
    await expect(page.getByTestId('betrayal-haunt-reveal-cue')).toHaveCount(0);
    await expect(page.getByTestId('betrayal-runtime-header-grid')).toContainText(/恶兆前|pre-haunt/i);
    await expect(page.locator('[data-testid="betrayal-inventory-dog-0"]')).toBeVisible();
    await expect(page.getByTestId('betrayal-deck-resolution-ledger')).toHaveCount(0);
    await expect(page.getByTestId('betrayal-deck-resolution-ledger-step')).toHaveCount(0);
    await expect.poll(() => readHauntDiscoveryConfirmationState(page)).toMatchObject({
        phase: 'preHaunt',
        pendingSteps: [],
        rejected: null,
    });
    await saveEvidenceScreenshot(page, testInfo, SAFE_OMEN_DONE_SCREENSHOT);

    await assertNoFatalFrontendErrors([
        { label: 'betrayal-safe-omen-discovery-confirmation', diagnostics },
    ]);
});

test('当前9张预兆未触发作祟时均只需一次确认并进入持有区', async ({ page, context }, testInfo) => {
    test.setTimeout(240000);
    await initBetrayalContext(context);
    const diagnostics = attachPageDiagnostics(page, 'betrayal-safe-omen-discovery-matrix');

    await page.setViewportSize({ width: 1600, height: 900 });
    await warmBetrayalFrontend(context);
    await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitForBetrayalPageReady(page);

    for (const [index, omenCard] of CURRENT_OMEN_DISCOVERY_CARDS.entries()) {
        await injectCore(page, createSafeOmenPendingResolutionCore(omenCard));
        await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });
        await expect(page.getByTestId('betrayal-haunt-reveal-cue')).toHaveCount(0);

        const discoveryPanel = page.getByTestId('betrayal-discovery-panel');
        await expect(discoveryPanel, `预兆「${omenCard.name}」应显示发现确认面板`).toBeVisible({
            timeout: 10000,
        });
        await expect(discoveryPanel).toContainText(omenCard.name);
        await expect(discoveryPanel.getByTestId('betrayal-discovery-continue')).toHaveText('确认');
        await expect(discoveryPanel.getByTestId('betrayal-discovery-continue')).toHaveAttribute(
            'data-pending-card-resolution-step',
            '1/1',
        );
        await expect.poll(() => readHauntDiscoveryConfirmationState(page)).toMatchObject({
            phase: 'preHaunt',
            latestDiscoveryTitle: omenCard.name,
            latestDiscoveryKind: 'omen',
            pendingSteps: [
                { stepKind: 'drawn-card', index: 1, total: 1, cardName: omenCard.name },
            ],
            rejected: null,
        });

        if (index === 0) {
            await saveEvidenceScreenshot(page, testInfo, SAFE_OMEN_MATRIX_FIRST_CARD_SCREENSHOT);
        }

        await discoveryPanel.getByTestId('betrayal-discovery-continue').click();
        await acknowledgeRemainingPlayers(page);
        await expect(discoveryPanel).toHaveCount(0);
        await expect(page.getByTestId('betrayal-haunt-reveal-cue')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-runtime-header-grid')).toContainText(/作祟前|恶兆前|pre-haunt/i);
        await expect(page.getByTestId('betrayal-inventory-row-omen')).toContainText(omenCard.name);
        await expect.poll(async () => {
            const state = await readHauntDiscoveryConfirmationState(page);
            return Boolean(
                state.currentInventory?.some((card) => (
                    card.kind === 'omen' &&
                    card.id?.startsWith(omenCard.id) &&
                    card.name === omenCard.name
                )),
            );
        }).toBe(true);
        await expect.poll(() => readHauntDiscoveryConfirmationState(page)).toMatchObject({
            phase: 'preHaunt',
            pendingSteps: [],
            rejected: null,
        });

        if (index === CURRENT_OMEN_DISCOVERY_CARDS.length - 1) {
            await saveEvidenceScreenshot(page, testInfo, SAFE_OMEN_MATRIX_DONE_SCREENSHOT);
        }
    }

    await assertNoFatalFrontendErrors([
        { label: 'betrayal-safe-omen-discovery-matrix', diagnostics },
    ]);
});

test('当前9张预兆触发作祟时均先确认预兆和检定，再进入作祟承接', async ({ page, context }, testInfo) => {
    test.setTimeout(300000);
    await initBetrayalContext(context);
    const diagnostics = attachPageDiagnostics(page, 'betrayal-haunt-omen-discovery-matrix');

    await page.setViewportSize({ width: 1600, height: 900 });
    await warmBetrayalFrontend(context);
    await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitForBetrayalPageReady(page);

    for (const [index, omenCard] of CURRENT_OMEN_DISCOVERY_CARDS.entries()) {
        await injectCore(page, createOmenHauntPendingResolutionCore(omenCard));
        await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });

        const revealCue = page.getByTestId('betrayal-haunt-reveal-cue');
        await expect(revealCue, `预兆「${omenCard.name}」确认前作祟揭示横幅不得抢先出现`).toHaveCount(0);
        await expect(page.getByTestId('betrayal-scenario-reader-dialog'), `预兆「${omenCard.name}」确认前不得自动打开剧本书`).toHaveCount(0);
        await expect.poll(() => readHauntDiscoveryConfirmationState(page)).toMatchObject({
            phase: 'haunt',
            latestDiscoveryTitle: omenCard.name,
            latestDiscoveryKind: 'omen',
            pendingSteps: [
                { stepKind: 'drawn-card', index: 1, total: 1, cardName: omenCard.name },
            ],
            rejected: null,
        });

        const discoveryPanel = page.getByTestId('betrayal-discovery-panel');
        await expect(discoveryPanel, `预兆「${omenCard.name}」触发作祟时应先显示发现确认面板`).toBeVisible({
            timeout: 10000,
        });
        await expect(discoveryPanel).toContainText(omenCard.name);
        await expect(discoveryPanel.getByTestId('betrayal-discovery-continue')).toHaveText('确认');
        await expect(discoveryPanel.getByTestId('betrayal-discovery-continue')).toHaveAttribute(
            'data-pending-card-resolution-step',
            '1/1',
        );
        await expect(discoveryPanel.getByTestId('betrayal-recent-roll-panel')).toBeVisible();
        await expect(discoveryPanel.getByTestId('betrayal-house-dice-3d-group')).toBeVisible();
        await expect(discoveryPanel.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute('data-dice-count', '4');
        await expect(discoveryPanel.getByTestId('betrayal-recent-roll-total')).toContainText('总点数');
        if (index === 0) {
            await saveEvidenceScreenshot(page, testInfo, HAUNT_OMEN_MATRIX_REVEAL_SCREENSHOT);
        }

        await discoveryPanel.getByTestId('betrayal-discovery-continue').click();
        await acknowledgeRemainingPlayers(page);
        await expect(discoveryPanel).toHaveCount(0);
        await expect(page.getByTestId('betrayal-scenario-reader-dialog'), `预兆「${omenCard.name}」确认后才打开剧本书承接`).toBeVisible({
            timeout: 10000,
        });
        await closeScenarioReaderIfPresent(page);
        await expect(revealCue, `预兆「${omenCard.name}」剧本书承接后不得再显示作祟揭示横幅`).toHaveCount(0);
        await expect(page.getByTestId('betrayal-discovery-panel'), `预兆「${omenCard.name}」确认过后关闭剧本书不得重复弹出`).toHaveCount(0);
        await expect(page.getByTestId('betrayal-runtime-header-grid')).toContainText(/恶兆后|Haunt/i);
        await expect.poll(async () => {
            const state = await readHauntDiscoveryConfirmationState(page);
            const revealer = state.explorers?.find((explorer) => (
                explorer.playerId === state.hauntRevealerPlayerId
            ));
            return Boolean(
                revealer?.inventory?.some((card) => (
                    card.kind === 'omen' &&
                    card.id?.startsWith(omenCard.id) &&
                    card.name === omenCard.name
                )),
            );
        }).toBe(true);
        await expect.poll(() => readHauntDiscoveryConfirmationState(page)).toMatchObject({
            phase: 'haunt',
            pendingSteps: [],
            rejected: null,
        });

        if (index === CURRENT_OMEN_DISCOVERY_CARDS.length - 1) {
            await saveEvidenceScreenshot(page, testInfo, HAUNT_OMEN_MATRIX_DONE_SCREENSHOT);
        }
    }

    await assertNoFatalFrontendErrors([
        { label: 'betrayal-haunt-omen-discovery-matrix', diagnostics },
    ]);
});
