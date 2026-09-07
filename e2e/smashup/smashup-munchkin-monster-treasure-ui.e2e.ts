import { mkdirSync } from 'node:fs';
import { test, expect } from '../framework';
import type { GameTestContext } from '../framework';
import type { Page } from '@playwright/test';
import { hideSmashUpDebugPanelForEvidence, readCoreState } from '../helpers/smashup';
import {
    MUNCHKIN_MONSTER_DECK_DEF_IDS,
    MUNCHKIN_TREASURE_DECK_DEF_IDS,
} from '../../src/games/smashup/data/factions/munchkin';

type SmashUpSceneConfig = Parameters<GameTestContext['setupScene']>[0];
const MUNCHKIN_EVIDENCE_DIR = 'test-results/evidence-screenshots/smashup/munchkin-new-faction-flow';

type RocketBootsCoreState = {
    bases: Array<{
        defId: string;
        minions: Array<{
            uid: string;
            basePower?: number;
            powerCounters?: number;
            powerModifier?: number;
            tempPowerModifier?: number;
            talentUsed?: boolean;
            attachedActions?: Array<{ uid: string; defId: string; ownerId?: string; talentUsed?: boolean }>;
        }>;
        ongoingActions?: Array<{ uid: string; defId: string; ownerId: string }>;
    }>;
    players?: Record<string, {
        hand?: Array<{ uid: string; defId: string; type: string }>;
        deck?: Array<{ uid: string; defId: string; type: string }>;
        discard?: Array<{ uid: string; defId: string; type: string }>;
        actionsPlayed?: number;
        actionLimit?: number;
        minionLimit?: number;
        minionsPlayed?: number;
        minionsPlayedPerBase?: Record<number, number>;
        baseLimitedMinionQuota?: Record<number, number>;
        vp?: number;
    }>;
    treasureDeck?: string[];
    treasureDiscard?: string[];
    nextUid?: number;
    triggerQueue?: unknown[];
};

type SmashUpPlayerCoreSlice = NonNullable<RocketBootsCoreState['players']>[string] & {
    treasures?: unknown;
};

type StraightLineRunningAwayCoreState = RocketBootsCoreState & {
    pendingMunchkinTreasureReward?: {
        treasureCards: Array<{ uid: string; defId: string; type: string }>;
        eligiblePlayerIds: string[];
        nextRecipientIndex: number;
    };
    treasureDeck?: string[];
};

type ParalysisCoreState = RocketBootsCoreState & {
    suppressedCardUidsUntilTurnEnd?: string[];
};

type TemporalJetpackCoreState = RocketBootsCoreState & {
    turnNumber?: number;
};

type InteractionOption = {
    id?: string;
    label?: string;
        value?: {
            baseIndex?: number;
            cardUid?: string;
            defId?: string;
            factionId?: string;
            handCardUid?: string;
            kind?: string;
            minionUid?: string;
            mode?: string;
            playerId?: string;
            skip?: boolean;
            sourceDefId?: string;
            targetBaseIndex?: number;
            targetMinionUid?: string;
            targetPlayerId?: string;
        treasureDefId?: string;
        treasureUid?: string;
        triggerId?: string;
    };
};

type BrowserHarnessState = {
    core?: {
        currentPlayerIndex?: number;
        pendingMunchkinTreasureReward?: {
            treasureCards?: unknown[];
        };
        players?: Record<string, { hand?: Array<{ uid?: string }> }>;
        turnOrder?: string[];
    };
    sys?: {
        interaction?: { current?: { data?: { sourceId?: string } } };
        resolution?: {
            activeFrameId?: string;
            frames?: Array<{
                id?: string;
                metadata?: {
                    smashupReactionSession?: {
                        responseWindowType?: string;
                    };
                };
            }>;
        };
        responseWindow?: { current?: { windowType?: string } };
    };
};

type BrowserHarnessWindow = Window & {
    __BG_TEST_HARNESS__?: {
        state?: {
            get?: () => BrowserHarnessState;
            isRegistered?: () => boolean;
            patch?: (state: unknown) => Promise<void> | void;
        };
    };
};

type TriggerQueueEvidenceEvent = {
    type?: string;
    payload?: {
        baseDefId?: string;
        cardUid?: string;
        cards?: Array<{ uid?: string; defId?: string }>;
        defId?: string;
        reason?: string;
        minionUid?: string;
        rankings?: Array<{
            playerId?: string;
            power?: number;
            vp?: number;
        }>;
        targetBaseIndex?: number;
        targetMinionUid?: string;
        targetType?: string;
        triggers?: Array<{
            sourceDefId?: string;
            timing?: string;
            triggerMinionUid?: string;
        }>;
    };
};

type TriggerQueueEntry = {
    id?: string;
    baseIndex?: number;
    sourceBaseIndex?: number;
    sourceCardUid?: string;
    sourceDefId?: string;
    source?: { defId?: string };
};

type EventStreamEntry = {
    event?: TriggerQueueEvidenceEvent;
};

const deckCards = (playerId: string, defId: string, count: number) =>
    Array.from({ length: count }, (_, index) => ({
        uid: `${playerId}-deck-${index}`,
        defId,
        type: 'minion',
        owner: playerId,
    }));

const minion = (uid: string, defId: string, owner: string, basePower: number) => ({
    uid,
    defId,
    owner,
    controller: owner,
    basePower,
    powerCounters: 0,
    powerModifier: 0,
    tempPowerModifier: 0,
    talentUsed: false,
    attachedActions: [],
});

async function getReactionWindowStatus(page: Page): Promise<{ sourceId: string | null; windowType: string | null }> {
    return page.evaluate(() => {
        const state = (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.();
        const frames = state?.sys?.resolution?.frames ?? [];
        const frameIds = [
            state?.sys?.resolution?.activeFrameId,
            ...frames.map(frame => frame.id).reverse(),
        ].filter((frameId): frameId is string => !!frameId);
        let liveReactionWindowType: string | undefined;
        for (const frameId of frameIds) {
            const frame = frames.find(candidate => candidate.id === frameId);
            const session = frame?.metadata?.smashupReactionSession;
            if (session?.responseWindowType) {
                liveReactionWindowType = session.responseWindowType;
                break;
            }
        }
        return {
            sourceId: state?.sys?.interaction?.current?.data?.sourceId ?? null,
            windowType: state?.sys?.responseWindow?.current?.windowType ?? liveReactionWindowType ?? null,
        };
    });
}

async function getReactionTriggerSourceSelector(
    game: GameTestContext,
    option: InteractionOption,
): Promise<string | null> {
    const triggerId = option.value?.kind === 'trigger' ? option.value.triggerId : undefined;
    if (!triggerId) return null;

    const state = await game.getState();
    const triggers = (state.core?.triggerQueue ?? []) as TriggerQueueEntry[];
    const trigger = triggers.find((entry) => entry.id === triggerId);
    if (!trigger) return null;

    if (trigger.sourceCardUid) {
        return [
            `[data-minion-uid="${trigger.sourceCardUid}"]`,
            `[data-ongoing-uid="${trigger.sourceCardUid}"]`,
            `[data-attached-action-uid="${trigger.sourceCardUid}"]`,
            `[data-titan-uid="${trigger.sourceCardUid}"]`,
        ].join(', ');
    }

    const sourceBaseIndex = trigger.sourceBaseIndex ?? trigger.baseIndex;
    return typeof sourceBaseIndex === 'number' ? `[data-base-index="${sourceBaseIndex}"]` : null;
}

async function clickVisibleInteractionOptionBy(
    page: Page,
    game: GameTestContext,
    matcher: (option: InteractionOption) => boolean,
    description: string,
): Promise<void> {
    const options = await game.getInteractionOptions() as InteractionOption[];
    const option = options.find(matcher);
    if (!option?.id) {
        throw new Error(`${description}：当前交互没有匹配的可选项`);
    }

    const cardOption = page.locator(`[data-option-id="${option.id}"]`).first();
    if (await cardOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await cardOption.click({ force: true });
        await page.waitForTimeout(300);
        return;
    }

    const handCardUid = option.value?.cardUid ?? option.value?.handCardUid;
    if (handCardUid) {
        const handCard = page.locator(handCardSelector(handCardUid)).first();
        if (await handCard.isVisible({ timeout: 1000 }).catch(() => false)) {
            await handCard.click({ force: true });
            await page.waitForTimeout(300);
            return;
        }
    }

    const triggerSourceSelector = await getReactionTriggerSourceSelector(game, option);
    if (triggerSourceSelector) {
        const triggerSource = page.locator(triggerSourceSelector).first();
        if (await triggerSource.isVisible({ timeout: 1000 }).catch(() => false)) {
            await triggerSource.click({ force: true });
            await page.waitForTimeout(300);
            return;
        }
    }

    const buttonLabels = [
        option.label,
        option.value?.kind === 'pass' ? '让过' : undefined,
        option.value?.kind === 'pass' ? 'Pass' : undefined,
    ].filter((label): label is string => typeof label === 'string' && label.trim().length > 0);
    for (const label of buttonLabels) {
        const button = page.getByRole('button', { name: label, exact: true }).first();
        if (await button.isVisible({ timeout: 1000 }).catch(() => false)) {
            await button.click({ force: true });
            await page.waitForTimeout(300);
            return;
        }
    }

    throw new Error(`${description}：匹配选项存在，但页面没有可见的真实点击载体（optionId=${option.id}）`);
}

async function expectVisibleInteractionOptionBy(
    page: Page,
    game: GameTestContext,
    matcher: (option: InteractionOption) => boolean,
    description: string,
): Promise<void> {
    const options = await game.getInteractionOptions() as InteractionOption[];
    const option = options.find(matcher);
    expect(option?.id, `${description}：当前交互必须有匹配的可选项`).toBeTruthy();

    const cardOption = page.locator(`[data-option-id="${option!.id}"]`).first();
    if (await cardOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        return;
    }

    const handCardUid = option!.value?.cardUid ?? option!.value?.handCardUid;
    if (handCardUid) {
        const handCard = page.locator(handCardSelector(handCardUid)).first();
        if (await handCard.isVisible({ timeout: 1000 }).catch(() => false)) {
            return;
        }
    }

    const triggerSourceSelector = await getReactionTriggerSourceSelector(game, option!);
    if (triggerSourceSelector) {
        const triggerSource = page.locator(triggerSourceSelector).first();
        if (await triggerSource.isVisible({ timeout: 1000 }).catch(() => false)) {
            return;
        }
    }

    const buttonLabels = [
        option!.label,
        option!.value?.kind === 'pass' ? '让过' : undefined,
        option!.value?.kind === 'pass' ? 'Pass' : undefined,
    ].filter((label): label is string => typeof label === 'string' && label.trim().length > 0);
    for (const label of buttonLabels) {
        const button = page.getByRole('button', { name: label, exact: true }).first();
        if (await button.isVisible({ timeout: 1000 }).catch(() => false)) {
            return;
        }
    }

    throw new Error(`${description}：匹配选项存在，但页面没有可见的真实点击载体（optionId=${option!.id}）`);
}

async function waitForMeFirstReactionChoice(page: Page): Promise<void> {
    await expect.poll(async () => {
        const status = await getReactionWindowStatus(page);
        const phase = await page.evaluate(() => (
            (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.()?.sys?.phase ?? null
        ));
        return {
            phase,
            sourceId: status.sourceId,
            windowType: status.windowType,
        };
    }, { timeout: 15000, polling: 200 }).toEqual({
        phase: 'scoreBases',
        sourceId: 'smashup_reaction_choose',
        windowType: 'meFirst',
    });
}

async function waitForInteractionSourceId(
    page: Page,
    sourceIds: string[],
    description: string,
    timeout = 15000,
): Promise<string> {
    const handle = await page.waitForFunction((expectedSourceIds) => {
        const sourceId = (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.()?.sys?.interaction?.current?.data?.sourceId ?? null;
        return Array.isArray(expectedSourceIds) && typeof sourceId === 'string' && expectedSourceIds.includes(sourceId)
            ? sourceId
            : false;
    }, sourceIds, { timeout, polling: 200 }).catch(async () => {
        const state = await page.evaluate(() => {
            const current = (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.();
            const frames = (current?.sys?.resolution?.frames ?? []) as Array<{
                metadata?: { smashupReactionSession?: { responseWindowType?: string } };
            }>;
            const triggerQueue = (current?.core?.triggerQueue ?? []) as Array<{
                id?: string;
                sourceDefId?: string;
                source?: { defId?: string };
                sourceCardUid?: string;
                baseIndex?: number;
                sourceBaseIndex?: number;
            }>;
            return {
                phase: current?.sys?.phase ?? null,
                interactionSourceId: current?.sys?.interaction?.current?.data?.sourceId ?? null,
                interactionPlayerId: current?.sys?.interaction?.current?.playerId ?? null,
                responseWindowType: current?.sys?.responseWindow?.current?.windowType ?? null,
                reactionSessionType: [...frames].reverse().find((frame) => frame.metadata?.smashupReactionSession)
                    ?.metadata?.smashupReactionSession?.responseWindowType ?? null,
                triggerQueue: triggerQueue.map((trigger) => ({
                    id: trigger?.id ?? null,
                    sourceDefId: trigger?.sourceDefId ?? trigger?.source?.defId ?? null,
                    sourceCardUid: trigger?.sourceCardUid ?? null,
                    baseIndex: trigger?.baseIndex ?? trigger?.sourceBaseIndex ?? null,
                })),
                pendingAfterScoringSpecials: current?.core?.pendingAfterScoringSpecials ?? [],
            };
        });
        throw new Error(`${description}：等待交互 ${sourceIds.join(' / ')} 超时，当前状态=${JSON.stringify(state)}`);
    });
    return String(await handle.jsonValue());
}

async function passOpenReactionOrResponseWindow(
    page: Page,
    game: GameTestContext,
    description: string,
): Promise<boolean> {
    const status = await getReactionWindowStatus(page);
    if (status.sourceId === 'smashup_reaction_choose') {
        await clickVisibleInteractionOptionBy(
            page,
            game,
            (option: InteractionOption) => option.value?.kind === 'pass',
            description,
        );
        return true;
    }
    if (status.windowType) {
        await game.passResponseWindow();
        return true;
    }
    return false;
}

async function passOpenReactionOrResponseWindowVisibly(
    page: Page,
    game: GameTestContext,
    description: string,
): Promise<boolean> {
    const status = await getReactionWindowStatus(page);
    if (status.sourceId === 'smashup_reaction_choose') {
        await clickVisibleInteractionOptionBy(
            page,
            game,
            (option: InteractionOption) => option.value?.kind === 'pass',
            description,
        );
        return true;
    }

    const passButton = page.getByTestId('me-first-pass-button').first();
    if (await passButton.isVisible({ timeout: 1000 }).catch(() => false)) {
        await passButton.click({ force: true });
        await page.waitForTimeout(300);
        return true;
    }

    return false;
}

async function expectCenteredSmashUpReactionPrompt(page: Page, description: string): Promise<void> {
    const layout = await page.evaluate(() => {
        const prompt = document.querySelector<HTMLElement>('[data-testid="smashup-reaction-prompt"]');
        const promptContent = prompt?.querySelector<HTMLElement>('.smashup-prompt-content');
        const promptRect = promptContent?.getBoundingClientRect();
        const viewportCenterX = window.innerWidth / 2;
        const viewportCenterY = window.innerHeight / 2;
        const promptCenterX = promptRect ? promptRect.left + promptRect.width / 2 : 0;
        const promptCenterY = promptRect ? promptRect.top + promptRect.height / 2 : 0;
        return {
            noUnexpectedOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
            dockedPromptAbsent: !document.querySelector('[data-testid="smashup-docked-prompt"]'),
            promptVisible: Boolean(promptRect && promptRect.width > 24 && promptRect.height > 24),
            horizontallyCentered: promptRect
                ? Math.abs(promptCenterX - viewportCenterX) <= 32
                : false,
            verticallyCentered: promptRect
                ? Math.abs(promptCenterY - viewportCenterY) <= 32
                : false,
        };
    });
    expect(layout, description).toEqual({
        noUnexpectedOverflow: true,
        dockedPromptAbsent: true,
        promptVisible: true,
        horizontallyCentered: true,
        verticallyCentered: true,
    });
}

async function chooseReactionBySourceDefId(
    page: Page,
    game: GameTestContext,
    sourceDefId: string,
    description: string,
): Promise<void> {
    const state = await game.getState();
    const triggers = (state.core?.triggerQueue ?? []) as TriggerQueueEntry[];
    await clickVisibleInteractionOptionBy(page, game, (option: InteractionOption) => {
        const triggerId = option.value?.triggerId;
        const trigger = triggers.find((entry) => entry?.id === triggerId);
        return trigger?.sourceDefId === sourceDefId
            || trigger?.source?.defId === sourceDefId
            || option.value?.defId === sourceDefId
            || option.label?.includes(sourceDefId);
    }, description);
}

async function waitForSmashUpFxToSettle(page: Page): Promise<void> {
    const spotlightQueue = page.getByTestId('card-spotlight-queue');
    if (await spotlightQueue.isVisible({ timeout: 200 }).catch(() => false)) {
        await spotlightQueue.getByRole('button', { name: /^(关闭特写|Close spotlight)$/i }).click({ force: true });
    }
    await expect(spotlightQueue).toHaveCount(0, { timeout: 3000 });
    await expect(page.getByTestId('smashup-action-fx-card')).toHaveCount(0, { timeout: 5000 });
    await expect(page.locator('[data-testid^="smashup-triggered-fx-"]')).toHaveCount(0, { timeout: 8000 });
    await expect(page.locator('[data-testid^="su-vp-gain-feedback-"]')).toHaveCount(0, { timeout: 8000 });
    await page.waitForFunction(() => {
        const handCards = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="su-hand-area"] [data-card-uid]'));
        return handCards.every((card) => {
            const rect = card.getBoundingClientRect();
            const opacity = Number.parseFloat(window.getComputedStyle(card).opacity);
            return opacity > 0.99
                && rect.width > 24
                && rect.height > 24
                && rect.bottom <= window.innerHeight + 1;
        });
    }, { timeout: 5000 });
    await page.waitForFunction(() => {
        const baseArts = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="base-zone-"] .bg-slate-200.border-slate-300'));
        return baseArts.length === 0 || baseArts.every((art) => Number.parseFloat(window.getComputedStyle(art).opacity) > 0.99);
    }, { timeout: 5000 });
}

function handCardSelector(cardUid: string): string {
    return `[data-testid="su-hand-area"] [data-card-uid="${cardUid}"]`;
}

async function waitForSmashUpHandCardToSettle(page: Page, selector: string): Promise<void> {
    await expect(page.locator(selector).first()).toBeVisible({ timeout: 5000 });
    await page.waitForFunction((targetSelector) => {
        const card = document.querySelector<HTMLElement>(targetSelector);
        if (!card) return false;
        const rect = card.getBoundingClientRect();
        const opacity = Number.parseFloat(window.getComputedStyle(card).opacity);
        return rect.top >= 0
            && rect.bottom <= window.innerHeight + 1
            && rect.width > 24
            && rect.height > 24
            && opacity > 0.99;
    }, selector, { timeout: 5000 });
}

async function expectManualChoiceVisible(
    page: Page,
    selector: string,
    description: string,
    options: { allowPromptCardGrid?: boolean; forbidPromptContext?: boolean; minVisibleHitCount?: number } = {},
): Promise<void> {
    await expect(page.getByTestId('smashup-action-fx-card')).toHaveCount(0);
    if (options.forbidPromptContext) {
        await expect(page.getByTestId('prompt-context-card')).toHaveCount(0);
    }
    await expect(page.locator(selector).first()).toBeVisible({ timeout: 15000 });

    const visibility = await page.evaluate(({ targetSelector, allowPromptCardGrid }) => {
        const target = document.querySelector<HTMLElement>(targetSelector);
        if (!target) {
            return {
                exists: false,
                visible: false,
                visibleHitCount: 0,
                blockingOverlays: [] as Array<{ testId: string | null; left: number; top: number; right: number; bottom: number }>,
                hits: [] as Array<{ x: number; y: number; topTestId: string | null; matchesTarget: boolean }>,
            };
        }

        const rect = target.getBoundingClientRect();
        const points = [
            [0.5, 0.5],
            [0.22, 0.52],
            [0.78, 0.52],
            [0.5, 0.28],
            [0.5, 0.76],
        ].map(([xRatio, yRatio]) => ({
            x: rect.left + rect.width * xRatio,
            y: rect.top + rect.height * yRatio,
        })).filter((point) => (
            point.x >= 0
            && point.y >= 0
            && point.x <= window.innerWidth
            && point.y <= window.innerHeight
        ));

        const hits = points.map((point) => {
            const top = document.elementFromPoint(point.x, point.y) as HTMLElement | null;
            return {
                x: point.x,
                y: point.y,
                topTestId: top?.getAttribute('data-testid') ?? null,
                matchesTarget: Boolean(top?.closest(targetSelector) || top?.closest('[data-option-id]')),
            };
        });

        const blockingSelectors = [
            '[data-testid="smashup-action-fx-card"]',
            '[data-testid="prompt-context-card"]',
            '[data-testid="su-card-magnify-overlay"]',
            ...(allowPromptCardGrid ? [] : ['[data-testid="prompt-card-grid"]']),
            '[data-card-view-panel]',
            '[data-discard-view-panel]',
        ];
        const blockingOverlays = blockingSelectors.flatMap((selector) => (
            Array.from(document.querySelectorAll<HTMLElement>(selector)).map((element) => {
                const overlayRect = element.getBoundingClientRect();
                const overlaps = overlayRect.left < rect.right
                    && overlayRect.right > rect.left
                    && overlayRect.top < rect.bottom
                    && overlayRect.bottom > rect.top;
                if (!overlaps) return null;
                return {
                    testId: element.getAttribute('data-testid'),
                    left: overlayRect.left,
                    top: overlayRect.top,
                    right: overlayRect.right,
                    bottom: overlayRect.bottom,
                };
            }).filter((entry): entry is NonNullable<typeof entry> => entry !== null)
        ));

        return {
            exists: true,
            visible: rect.width > 24 && rect.height > 24,
            visibleHitCount: hits.filter((hit) => hit.matchesTarget).length,
            blockingOverlays,
            hits,
        };
    }, { targetSelector: selector, allowPromptCardGrid: options.allowPromptCardGrid === true });

    expect(visibility.exists, `${description}：候选节点必须存在`).toBe(true);
    expect(visibility.visible, `${description}：候选本体必须有可读尺寸`).toBe(true);
    expect(visibility.blockingOverlays, `${description}：候选本体不能被大卡预览或查看面板遮住`).toEqual([]);
    expect(
        visibility.visibleHitCount,
        `${description}：候选本体必须露出可点击命中点，实际命中=${JSON.stringify(visibility.hits)}`,
    ).toBeGreaterThanOrEqual(options.minVisibleHitCount ?? 2);
}

async function expectManualMinionChoiceVisible(
    page: Page,
    minionUid: string,
    description: string,
    options: { forbidPromptContext?: boolean } = {},
): Promise<void> {
    await expectManualChoiceVisible(page, `[data-minion-uid="${minionUid}"]`, description, options);
}

async function clickManualMinionChoice(page: Page, minionUid: string, description: string): Promise<void> {
    const point = await page.locator(`[data-minion-uid="${minionUid}"]`).first().evaluate((target, expectedUid) => {
        const rect = target.getBoundingClientRect();
        const points = [
            [0.5, 0.5],
            [0.5, 0.18],
            [0.22, 0.52],
            [0.78, 0.52],
            [0.5, 0.76],
        ].map(([xRatio, yRatio]) => ({
            x: rect.left + rect.width * xRatio,
            y: rect.top + rect.height * yRatio,
        })).filter((candidate) => (
            candidate.x >= 0
            && candidate.y >= 0
            && candidate.x <= window.innerWidth
            && candidate.y <= window.innerHeight
        ));

        return points.find((candidate) => {
            const top = document.elementFromPoint(candidate.x, candidate.y) as HTMLElement | null;
            return top?.closest('[data-minion-uid]')?.getAttribute('data-minion-uid') === expectedUid;
        }) ?? null;
    }, minionUid);

    expect(point, `${description}：必须有真实可见命中点`).not.toBeNull();
    await page.mouse.click(point!.x, point!.y);
    await page.waitForTimeout(300);
}

async function clickManualOngoingChoice(page: Page, ongoingUid: string, description: string): Promise<void> {
    const ongoing = page.locator(`[data-ongoing-uid="${ongoingUid}"]`).first();
    await expect(ongoing, `${description}：持续行动本体必须可见`).toBeVisible({ timeout: 15000 });
    await expect(ongoing, `${description}：持续行动本体必须处于可发动高亮`).toHaveAttribute('data-highlighted', 'true');
    await ongoing.click({ force: true });
    await page.waitForTimeout(300);
}

async function expectCurrentInteractionManual(game: GameTestContext, description: string): Promise<void> {
    const state = await game.getState();
    expect(
        state.sys?.interaction?.current?.data?.autoResolveIfSingle,
        `${description}：即使只有一个候选也必须保留手动选择`,
    ).toBe(false);
}

async function clickManualBaseChoice(page: Page, baseIndex: number, description: string): Promise<void> {
    const base = page.locator(`[data-base-index="${baseIndex}"]`).first();
    await expect(base, `${description}：基地本体必须可见`).toBeVisible({ timeout: 15000 });
    await base.click({ force: true });
    await page.waitForTimeout(300);
}

async function clickManualMonsterChoice(page: Page, monsterUid: string, description: string): Promise<void> {
    const monster = page.locator(`[data-monster-uid="${monsterUid}"]`).first();
    await expect(monster, `${description}：怪物卡本体必须可见`).toBeVisible({ timeout: 15000 });
    const point = await monster.evaluate((target, expectedUid) => {
        const rect = target.getBoundingClientRect();
        const points = [
            [0.5, 0.5],
            [0.18, 0.52],
            [0.22, 0.52],
            [0.32, 0.52],
            [0.78, 0.52],
            [0.5, 0.28],
            [0.5, 0.76],
        ].map(([xRatio, yRatio]) => ({
            x: rect.left + rect.width * xRatio,
            y: rect.top + rect.height * yRatio,
        })).filter((candidate) => (
            candidate.x >= 0
            && candidate.y >= 0
            && candidate.x <= window.innerWidth
            && candidate.y <= window.innerHeight
        ));

        return points.find((candidate) => {
            const top = document.elementFromPoint(candidate.x, candidate.y) as HTMLElement | null;
            return top?.closest('[data-monster-uid]')?.getAttribute('data-monster-uid') === expectedUid;
        }) ?? null;
    }, monsterUid);

    expect(point, `${description}：必须有真实可见命中点`).not.toBeNull();
    await page.mouse.click(point!.x, point!.y);
    await page.waitForTimeout(300);
}

async function clickManualMinionActivation(page: Page, minionUid: string, description: string): Promise<void> {
    const minion = page.locator(`[data-minion-uid="${minionUid}"]`).first();
    await expect(minion, `${description}：随从本体必须可见`).toBeVisible({ timeout: 15000 });
    const point = await minion.evaluate((target, expectedUid) => {
        const rect = target.getBoundingClientRect();
        const points = [
            [0.5, 0.5],
            [0.18, 0.52],
            [0.22, 0.52],
            [0.32, 0.52],
            [0.78, 0.52],
            [0.5, 0.28],
            [0.5, 0.76],
        ].map(([xRatio, yRatio]) => ({
            x: rect.left + rect.width * xRatio,
            y: rect.top + rect.height * yRatio,
        })).filter((candidate) => (
            candidate.x >= 0
            && candidate.y >= 0
            && candidate.x <= window.innerWidth
            && candidate.y <= window.innerHeight
        ));

        return points.find((candidate) => {
            const top = document.elementFromPoint(candidate.x, candidate.y) as HTMLElement | null;
            return top?.closest('[data-minion-uid]')?.getAttribute('data-minion-uid') === expectedUid;
        }) ?? null;
    }, minionUid);

    expect(point, `${description}：必须有真实可见命中点`).not.toBeNull();
    await page.mouse.click(point!.x, point!.y);
    await page.waitForTimeout(300);
}

async function openSmashUpPlayerView(sourcePage: Page, playerId: string): Promise<Page> {
    const playerPage = await sourcePage.context().newPage();
    await playerPage.setViewportSize({ width: 1440, height: 900 });
    await playerPage.goto(`/play/smashup?playerID=${playerId}&seat0=human&seat1=human`, { waitUntil: 'domcontentloaded' });
    await playerPage.waitForFunction(
        () => (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.isRegistered?.() === true,
        { timeout: 15000, polling: 200 },
    );
    return playerPage;
}

async function mirrorSmashUpHarnessState(page: Page, snapshot: unknown): Promise<void> {
    await page.evaluate(async (nextState) => {
        const harness = (window as BrowserHarnessWindow).__BG_TEST_HARNESS__;
        if (!harness?.state?.patch) throw new Error('SmashUp TestHarness state.patch 不可用');
        await harness.state.patch(nextState);
    }, snapshot);
    await page.waitForTimeout(400);
}

async function saveMunchkinEvidenceScreenshot(page: Page, filename: string): Promise<void> {
    mkdirSync(MUNCHKIN_EVIDENCE_DIR, { recursive: true });
    await page.screenshot({ path: `${MUNCHKIN_EVIDENCE_DIR}/${filename}` });
}

const buildMunchkinMonsterTreasureScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'p0-hand-1', defId: 'munchkin_dwarves_loot_lover', type: 'minion', owner: '0' },
            { uid: 'p0-hand-2', defId: 'munchkin_dwarves_mine', type: 'action', owner: '0' },
            { uid: 'p0-hand-3', defId: 'munchkin_warriors_big_hero', type: 'minion', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_dwarves_gem_grabber', 18),
        discard: [],
        factions: ['munchkin_dwarves', 'munchkin_warriors'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [
            { uid: 'p1-hand-1', defId: 'munchkin_orcs_sword_lord', type: 'minion', owner: '1' },
            { uid: 'p1-hand-2', defId: 'ninja_infiltrate', type: 'action', owner: '1' },
        ],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 20),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 5,
            nextUid: 500,
            deckQueryEnabled: false,
            enabledExpansions: ['titans', 'munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_treasure_bath', 'base_the_homeworld'],
            baseDiscard: [],
            titans: [
                {
                    uid: 'titan-on-base-0',
                    defId: 'dinosaurs_fort_titanosaurus',
                    faction: 'dinosaurs',
                    ownerId: '0',
                    controllerId: '0',
                    powerCounters: 0,
                    talentUsed: false,
                    location: { zone: 'base', baseIndex: 0, enteredAt: 1 },
                },
                {
                    uid: 'titan-setaside-0',
                    defId: 'ninjas_invisible_ninja',
                    faction: 'ninjas',
                    ownerId: '0',
                    controllerId: '0',
                    powerCounters: 0,
                    talentUsed: false,
                    location: { zone: 'setaside' },
                },
            ],
            bases: [
                {
                    defId: 'base_treasure_bath',
                    minions: [
                        minion('p0-base0-loot-lover', 'munchkin_dwarves_loot_lover', '0', 4),
                        minion('p0-base0-big-hero', 'munchkin_warriors_big_hero', '0', 5),
                        minion('p1-base0-sword-lord', 'munchkin_orcs_sword_lord', '1', 5),
                    ],
                    ongoingActions: [
                        { uid: 'ongoing-full-sail-0', defId: 'pirate_full_sail', ownerId: '0' },
                        { uid: 'ongoing-power-up-1', defId: 'pirate_full_sail', ownerId: '1' },
                    ],
                    monsters: [
                        { uid: 'monster-dragon-0', defId: 'munchkin_monster_treasure_dragon' },
                        { uid: 'monster-bigfoot-0', defId: 'munchkin_monster_bigfoot' },
                        { uid: 'monster-ghoul-0', defId: 'munchkin_monster_ghoul', controllerId: '1' },
                    ],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [
                        minion('p0-base1-gem', 'munchkin_dwarves_gem_grabber', '0', 2),
                        minion('p1-base1-dork-orc', 'munchkin_orcs_dork_orc', '1', 2),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinRemainingMonsterCoverageScene = (): SmashUpSceneConfig => {
    const scene = buildMunchkinMonsterTreasureScene();
    scene.player0.hand = [];
    scene.player0.deck = deckCards('0', 'munchkin_warriors_big_hero', 18);
    scene.player0.factions = ['munchkin_warriors', 'aliens'];
    scene.player0.minionsPlayed = 0;
    scene.player0.minionLimit = 0;
    scene.player0.actionsPlayed = 0;
    scene.player0.actionLimit = 1;
    scene.player1.hand = [];
    scene.player1.deck = deckCards('1', 'pirate_first_mate', 18);
    scene.player1.factions = ['pirates', 'ninjas'];
    scene.extra.core.enabledExpansions = ['munchkin'];
    scene.extra.core.turnNumber = 73;
    scene.extra.core.nextUid = 7300;
    scene.extra.core.titans = [];
    scene.extra.core.monsterDeck = MUNCHKIN_MONSTER_DECK_DEF_IDS;
    scene.extra.core.treasureDeck = [
        'munchkin_treasure_dwarf_hireling',
        'munchkin_treasure_halfling_hireling',
        'munchkin_treasure_tiger_steed',
        'munchkin_treasure_bag_of_caltrops',
    ];
    scene.extra.core.baseDeck = ['base_the_homeworld'];
    scene.extra.core.bases = [
        {
            defId: 'base_the_mines',
            minions: [
                minion('remaining-monster-hero', 'munchkin_warriors_big_hero', '0', 5),
                minion('remaining-monster-support', 'pirate_first_mate', '0', 5),
            ],
            ongoingActions: [],
            monsters: [
                { uid: 'remaining-undead-horseman', defId: 'munchkin_monster_undead_horseman' },
                { uid: 'remaining-tutankhamen', defId: 'munchkin_monster_tutankhamen' },
            ],
        },
        { defId: 'base_the_homeworld', minions: [], ongoingActions: [], monsters: [] },
    ];
    return scene;
};

const buildMunchkinTreasureMinionScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'halfling-hireling-1', defId: 'munchkin_treasure_halfling_hireling', type: 'minion', owner: '0' },
            { uid: 'tiger-steed-1', defId: 'munchkin_treasure_tiger_steed', type: 'minion', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_dwarves_gem_grabber', 18),
        discard: [],
        factions: ['munchkin_dwarves', 'munchkin_warriors'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 20),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 6,
            nextUid: 760,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_treasure_bath',
                    minions: [],
                    ongoingActions: [],
                    monsters: [
                        { uid: 'monster-bigfoot-0', defId: 'munchkin_monster_bigfoot' },
                    ],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinQuarterlingScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'quarterling-1', defId: 'munchkin_halflings_quarterling', type: 'minion', owner: '0' },
            { uid: 'quarterling-away-blocked-1', defId: 'alien_invader', type: 'minion', owner: '0' },
            { uid: 'quarterling-extra-here-1', defId: 'pirate_first_mate', type: 'minion', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_halflings_bardling', 16),
        discard: [],
        factions: ['munchkin_halflings', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 20),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 18,
            nextUid: 1800,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_treasure_bath'],
            baseDiscard: [],
            bases: [
                { defId: 'base_the_mines', minions: [], ongoingActions: [], monsters: [] },
                { defId: 'base_the_mines', minions: [], ongoingActions: [], monsters: [] },
            ],
        },
    },
});

const buildMunchkinBirthdayPartyRestrictionScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'birthday-blocked-1', defId: 'alien_invader', type: 'minion', owner: '0' },
            { uid: 'birthday-guest-1', defId: 'munchkin_halflings_pestling', type: 'minion', owner: '0' },
            { uid: 'birthday-free-1', defId: 'pirate_first_mate', type: 'minion', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_halflings_bardling', 16),
        discard: [],
        factions: ['munchkin_halflings', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 2,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 20),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 18,
            nextUid: 1810,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_treasure_bath'],
            baseDiscard: [],
            bases: [
                { defId: 'base_birthday_party', minions: [], ongoingActions: [], monsters: [] },
                { defId: 'base_the_mines', minions: [], ongoingActions: [], monsters: [] },
            ],
        },
    },
});

const buildMunchkinSubterraneanLairScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '1',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'lair-normal-away-1', defId: 'alien_invader', type: 'minion', owner: '0' },
            { uid: 'lair-extra-here-1', defId: 'pirate_first_mate', type: 'minion', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_halflings_bardling', 16),
        discard: [],
        factions: ['munchkin_halflings', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 20),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            currentPlayerIndex: 1,
            turnNumber: 18,
            nextUid: 1820,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_treasure_bath'],
            baseDiscard: [],
            bases: [
                { defId: 'base_subterranean_lair', minions: [], ongoingActions: [], monsters: [] },
                { defId: 'base_the_mines', minions: [], ongoingActions: [], monsters: [] },
            ],
        },
    },
});

const buildMunchkinShireMarshalScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'shire-extra-here-1', defId: 'pirate_first_mate', type: 'minion', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_halflings_bardling', 16),
        discard: [],
        factions: ['munchkin_halflings', 'pirates'],
        minionsPlayed: 1,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 20),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 18,
            nextUid: 1830,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_treasure_bath'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_mines',
                    minions: [
                        minion('shire-marshal-1', 'munchkin_halflings_shire_marshal', '0', 4),
                        minion('shire-opponent-1', 'munchkin_warriors_big_hero', '1', 5),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
                {
                    defId: 'base_birthday_party',
                    minions: [minion('shire-opponent-2', 'munchkin_warriors_big_hero', '1', 4)],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinPestlingScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'pestling-1', defId: 'munchkin_halflings_pestling', type: 'minion', owner: '0' },
            { uid: 'pestling-away-blocked-1', defId: 'alien_invader', type: 'minion', owner: '0' },
            { uid: 'pestling-extra-here-1', defId: 'pirate_first_mate', type: 'minion', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_halflings_bardling', 16),
        discard: [],
        factions: ['munchkin_halflings', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 20),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 18,
            nextUid: 1840,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_treasure_bath'],
            baseDiscard: [],
            bases: [
                { defId: 'base_the_mines', minions: [], ongoingActions: [], monsters: [] },
                { defId: 'base_the_homeworld', minions: [], ongoingActions: [], monsters: [] },
            ],
        },
    },
});

const buildMunchkinBardlingScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'bardling-1', defId: 'munchkin_halflings_bardling', type: 'minion', owner: '0' },
            { uid: 'bardling-away-blocked-1', defId: 'alien_invader', type: 'minion', owner: '0' },
            { uid: 'bardling-extra-here-1', defId: 'pirate_first_mate', type: 'minion', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_halflings_pestling', 16),
        discard: [],
        factions: ['munchkin_halflings', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 20),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 18,
            nextUid: 1850,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_treasure_bath'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_mines',
                    minions: [
                        minion('bardling-ally-1', 'alien_invader', '0', 1),
                        minion('bardling-opponent-1', 'munchkin_warriors_big_hero', '1', 5),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
                { defId: 'base_the_homeworld', minions: [], ongoingActions: [], monsters: [] },
            ],
        },
    },
});

const buildMunchkinLunchRunScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'lunch-run-1', defId: 'munchkin_halflings_lunch_run', type: 'action', owner: '0' },
            { uid: 'lunch-minion-1', defId: 'alien_invader', type: 'minion', owner: '0' },
        ],
        deck: [
            { uid: 'lunch-draw-1', defId: 'pirate_first_mate', type: 'minion', owner: '0' },
            ...deckCards('0', 'munchkin_halflings_bardling', 12),
        ],
        discard: [],
        factions: ['munchkin_halflings', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 20),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 19,
            nextUid: 1860,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_treasure_bath'],
            baseDiscard: [],
            bases: [
                { defId: 'base_the_mines', minions: [], ongoingActions: [], monsters: [] },
                { defId: 'base_the_homeworld', minions: [], ongoingActions: [], monsters: [] },
            ],
        },
    },
});

const buildMunchkinSneaksyScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'sneaksy-1', defId: 'munchkin_halflings_sneaksy', type: 'action', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_halflings_bardling', 16),
        discard: [],
        factions: ['munchkin_halflings', 'aliens'],
        minionsPlayed: 1,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [
            { uid: 'sneaksy-broadside-1', defId: 'pirate_broadside', type: 'action', owner: '1' },
        ],
        deck: deckCards('1', 'pirate_first_mate', 20),
        discard: [],
        factions: ['pirates', 'ninjas'],
        minionsPlayed: 1,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 19,
            nextUid: 1870,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_treasure_bath'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_mines',
                    minions: [
                        minion('sneaksy-protected-1', 'alien_invader', '0', 2),
                        minion('sneaksy-opponent-1', 'pirate_first_mate', '1', 2),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
                { defId: 'base_the_homeworld', minions: [], ongoingActions: [], monsters: [] },
            ],
        },
    },
});

const buildMunchkinSneaksyProtectionScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '1',
    phase: 'playCards',
    player0: {
        hand: [],
        deck: deckCards('0', 'munchkin_halflings_bardling', 16),
        discard: [],
        factions: ['munchkin_halflings', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [
            { uid: 'sneaksy-broadside-1', defId: 'pirate_broadside', type: 'action', owner: '1' },
        ],
        deck: deckCards('1', 'pirate_first_mate', 20),
        discard: [],
        factions: ['pirates', 'ninjas'],
        minionsPlayed: 1,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 20,
            nextUid: 1875,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_treasure_bath'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_mines',
                    minions: [
                        minion('sneaksy-protected-1', 'alien_invader', '0', 2),
                        minion('sneaksy-opponent-1', 'pirate_first_mate', '1', 2),
                    ],
                    ongoingActions: [
                        { uid: 'sneaksy-1', defId: 'munchkin_halflings_sneaksy', ownerId: '0' },
                    ],
                    monsters: [],
                },
                { defId: 'base_the_homeworld', minions: [], ongoingActions: [], monsters: [] },
            ],
        },
    },
});

const buildMunchkinOutOfNowhereScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'out-of-nowhere-1', defId: 'munchkin_halflings_out_of_nowhere', type: 'action', owner: '0' },
        ],
        deck: [
            { uid: 'out-reveal-action-1', defId: 'pirate_broadside', type: 'action', owner: '0' },
            { uid: 'out-reveal-minion-1', defId: 'alien_invader', type: 'minion', owner: '0' },
            { uid: 'out-reveal-action-2', defId: 'munchkin_halflings_lunch_run', type: 'action', owner: '0' },
            { uid: 'out-reveal-minion-2', defId: 'pirate_first_mate', type: 'minion', owner: '0' },
            { uid: 'out-unrevealed-1', defId: 'munchkin_halflings_sneaksy', type: 'action', owner: '0' },
        ],
        discard: [],
        factions: ['munchkin_halflings', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 20),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 19,
            nextUid: 1880,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_treasure_bath'],
            baseDiscard: [],
            bases: [
                { defId: 'base_the_mines', minions: [], ongoingActions: [], monsters: [] },
                { defId: 'base_the_homeworld', minions: [], ongoingActions: [], monsters: [] },
            ],
        },
    },
});

const buildMunchkinLastCallScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'last-call-1', defId: 'munchkin_halflings_last_call', type: 'action', owner: '0' },
            { uid: 'last-call-minion-1', defId: 'pirate_first_mate', type: 'minion', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_halflings_bardling', 16),
        discard: [],
        factions: ['munchkin_halflings', 'pirates'],
        minionsPlayed: 1,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 20),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 19,
            nextUid: 1890,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_treasure_bath'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_mines',
                    minions: [minion('last-call-scorer', 'munchkin_warriors_big_hero', '0', 30)],
                    ongoingActions: [],
                    monsters: [],
                },
                { defId: 'base_the_homeworld', minions: [], ongoingActions: [], monsters: [] },
            ],
        },
    },
});

const buildMunchkinRudeAwakeningScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'awakening-1', defId: 'munchkin_halflings_rude_awakening', type: 'action', owner: '0' },
            { uid: 'awakening-minion-a', defId: 'munchkin_treasure_halfling_hireling', type: 'minion', owner: '0' },
            { uid: 'awakening-minion-b', defId: 'alien_invader', type: 'minion', owner: '0' },
            { uid: 'awakening-left-action', defId: 'munchkin_halflings_lunch_run', type: 'action', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_halflings_bardling', 16),
        discard: [],
        factions: ['munchkin_halflings', 'aliens'],
        minionsPlayed: 1,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 20),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 19,
            nextUid: 1900,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_treasure_bath'],
            baseDiscard: [],
            bases: [
                { defId: 'base_the_mines', minions: [], ongoingActions: [], monsters: [] },
                { defId: 'base_the_homeworld', minions: [], ongoingActions: [], monsters: [] },
            ],
        },
    },
});

const buildMunchkinSmallButToughScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'small-but-tough-1', defId: 'munchkin_halflings_small_but_tough', type: 'action', owner: '0' },
            { uid: 'small-destroyer-1', defId: 'pirate_saucy_wench', type: 'minion', owner: '0' },
        ],
        deck: [
            { uid: 'small-deck-1', defId: 'pirate_first_mate', type: 'minion', owner: '0' },
        ],
        discard: [],
        factions: ['munchkin_halflings', 'pirates'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 20),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 19,
            nextUid: 1910,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_treasure_bath'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_mines',
                    minions: [minion('small-host-1', 'alien_invader', '0', 2)],
                    ongoingActions: [],
                    monsters: [],
                },
                { defId: 'base_the_homeworld', minions: [], ongoingActions: [], monsters: [] },
            ],
        },
    },
});

const buildMunchkinSpoiledBratsScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'spoiled-1', defId: 'munchkin_halflings_spoiled_brats', type: 'action', owner: '0' },
        ],
        deck: [
            { uid: 'spoiled-deck-1', defId: 'pirate_first_mate', type: 'minion', owner: '0' },
        ],
        discard: [
            { uid: 'spoiled-minion-1', defId: 'alien_invader', type: 'minion', owner: '0' },
            { uid: 'spoiled-action-1', defId: 'pirate_broadside', type: 'action', owner: '0' },
            { uid: 'spoiled-minion-2', defId: 'munchkin_halflings_quarterling', type: 'minion', owner: '0' },
        ],
        factions: ['munchkin_halflings', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 20),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 19,
            nextUid: 1920,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_treasure_bath'],
            baseDiscard: [],
            bases: [
                { defId: 'base_the_mines', minions: [], ongoingActions: [], monsters: [] },
                { defId: 'base_the_homeworld', minions: [], ongoingActions: [], monsters: [] },
            ],
        },
    },
});

const buildMunchkinUnexpectedPartyScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'party-1', defId: 'munchkin_halflings_unexpected_party', type: 'action', owner: '0' },
            { uid: 'party-minion-1', defId: 'pirate_first_mate', type: 'minion', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_halflings_bardling', 16),
        discard: [],
        factions: ['munchkin_halflings', 'pirates'],
        minionsPlayed: 1,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 20),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 19,
            nextUid: 1930,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_treasure_bath'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_mines',
                    minions: [minion('party-own-1', 'munchkin_halflings_quarterling', '0', 2)],
                    ongoingActions: [],
                    monsters: [],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [minion('party-enemy-1', 'alien_invader', '1', 2)],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinThievesMasterThiefScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'master-pressure-action', defId: 'alien_probe', type: 'action', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_thieves_pickpocket', 18),
        discard: [],
        factions: ['munchkin_thieves', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 20),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 22,
            nextUid: 1900,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: [
                'munchkin_treasure_wishing_ring',
                'munchkin_treasure_spiky_boots',
            ],
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_coffers',
                    minions: [
                        minion('master-thief-1', 'munchkin_thieves_master_thief', '0', 5),
                    ],
                    ongoingActions: [],
                    monsters: [
                        { uid: 'master-monster-1', defId: 'munchkin_monster_bigfoot' },
                        { uid: 'master-monster-2', defId: 'munchkin_monster_floating_nose' },
                    ],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinThievesSwipeScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'swipe-1', defId: 'munchkin_thieves_swipe', type: 'action', owner: '0' },
            { uid: 'swipe-pressure-minion', defId: 'alien_invader', type: 'minion', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_thieves_pickpocket', 18),
        discard: [],
        factions: ['munchkin_thieves', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 20),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 22,
            nextUid: 1910,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: [
                'munchkin_treasure_wishing_ring',
                'munchkin_treasure_spiky_boots',
            ],
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_coffers',
                    minions: [],
                    ongoingActions: [],
                    monsters: [
                        { uid: 'swipe-monster-1', defId: 'munchkin_monster_bigfoot' },
                        { uid: 'swipe-monster-2', defId: 'munchkin_monster_floating_nose' },
                    ],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinThievesPickpocketScene = (withAnotherPickpocket: boolean): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: withAnotherPickpocket ? 'pickpocket-1' : 'solo-pickpocket-1', defId: 'munchkin_thieves_pickpocket', type: 'minion', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_thieves_master_thief', 18),
        discard: [],
        factions: ['munchkin_thieves', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 20),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 22,
            nextUid: withAnotherPickpocket ? 1920 : 1930,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: [
                'munchkin_treasure_wishing_ring',
                'munchkin_treasure_spiky_boots',
            ],
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_thieves_guild',
                    minions: withAnotherPickpocket
                        ? [minion('other-pickpocket', 'munchkin_thieves_pickpocket', '1', 2)]
                        : [],
                    ongoingActions: [],
                    monsters: [
                        { uid: 'pickpocket-monster-1', defId: 'munchkin_monster_bigfoot' },
                    ],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinThievesCatBurglarScene = (nextUid = 1940): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'cat-burglar-1', defId: 'munchkin_thieves_cat_burglar', type: 'minion', owner: '0' },
            { uid: 'cat-treasure-ring', defId: 'munchkin_treasure_wishing_ring', type: 'action', owner: '0' },
            { uid: 'cat-treasure-hireling', defId: 'munchkin_treasure_dwarf_hireling', type: 'minion', owner: '0' },
            { uid: 'cat-normal-minion', defId: 'alien_invader', type: 'minion', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_thieves_pickpocket', 18),
        discard: [],
        factions: ['munchkin_thieves', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 20),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 22,
            nextUid,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: [
                'munchkin_treasure_wishing_ring',
                'munchkin_treasure_spiky_boots',
            ],
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_thieves_guild',
                    minions: [],
                    ongoingActions: [],
                    monsters: [
                        { uid: 'cat-monster-1', defId: 'munchkin_monster_bigfoot' },
                    ],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinThievesFenceScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'fence-treasure-ring', defId: 'munchkin_treasure_wishing_ring', type: 'action', owner: '0' },
            { uid: 'fence-treasure-hireling', defId: 'munchkin_treasure_dwarf_hireling', type: 'minion', owner: '0' },
            { uid: 'fence-normal-card', defId: 'alien_invader', type: 'minion', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_thieves_pickpocket', 18),
        discard: [],
        factions: ['munchkin_thieves', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 3,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 20),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 22,
            nextUid: 1960,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_thieves_guild',
                    minions: [minion('fence-1', 'munchkin_thieves_fence', '0', 3)],
                    ongoingActions: [],
                    monsters: [
                        { uid: 'fence-monster-1', defId: 'munchkin_monster_bigfoot' },
                    ],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinThievesBackstabScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'backstab-1', defId: 'munchkin_thieves_backstab', type: 'action', owner: '0' },
            { uid: 'backstab-treasure-ring', defId: 'munchkin_treasure_wishing_ring', type: 'action', owner: '0' },
            { uid: 'backstab-normal-card', defId: 'alien_scout', type: 'minion', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_thieves_pickpocket', 18),
        discard: [],
        factions: ['munchkin_thieves', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 20),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 22,
            nextUid: 1970,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_thieves_guild',
                    minions: [
                        minion('backstab-low-target', 'alien_invader', '1', 2),
                        minion('backstab-high-target', 'munchkin_warriors_big_hero', '1', 5),
                    ],
                    ongoingActions: [],
                    monsters: [
                        { uid: 'backstab-monster-1', defId: 'munchkin_monster_bigfoot' },
                    ],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinThievesPotionBandolierScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'bandolier-1', defId: 'munchkin_thieves_potion_bandolier', type: 'action', owner: '0' },
            { uid: 'bandolier-treasure-ring', defId: 'munchkin_treasure_wishing_ring', type: 'action', owner: '0' },
            { uid: 'bandolier-normal-card', defId: 'alien_scout', type: 'minion', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_thieves_pickpocket', 18),
        discard: [],
        factions: ['munchkin_thieves', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 20),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 22,
            nextUid: 1980,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_thieves_guild',
                    minions: [
                        minion('bandolier-target', 'alien_invader', '1', 2),
                        minion('bandolier-bystander', 'munchkin_warriors_big_hero', '0', 5),
                    ],
                    ongoingActions: [],
                    monsters: [
                        { uid: 'bandolier-monster-1', defId: 'munchkin_monster_bigfoot' },
                    ],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinThievesSmugglingScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'smuggling-1', defId: 'munchkin_thieves_smuggling', type: 'action', owner: '0' },
            { uid: 'smuggling-treasure-ring', defId: 'munchkin_treasure_wishing_ring', type: 'action', owner: '0' },
            { uid: 'smuggling-treasure-hireling', defId: 'munchkin_treasure_dwarf_hireling', type: 'minion', owner: '0' },
        ],
        deck: [
            { uid: 'smuggling-deck-a', defId: 'alien_invader', type: 'minion', owner: '0' },
            { uid: 'smuggling-deck-b', defId: 'alien_scout', type: 'minion', owner: '0' },
        ],
        discard: [
            { uid: 'smuggling-discard-a', defId: 'munchkin_thieves_pickpocket', type: 'minion', owner: '0' },
            { uid: 'smuggling-discard-b', defId: 'munchkin_thieves_swipe', type: 'action', owner: '0' },
        ],
        factions: ['munchkin_thieves', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 20),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 22,
            nextUid: 1990,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_thieves_guild',
                    minions: [],
                    ongoingActions: [],
                    monsters: [
                        { uid: 'smuggling-monster-1', defId: 'munchkin_monster_bigfoot' },
                    ],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinThievesMuggingScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'mugging-1', defId: 'munchkin_thieves_mugging', type: 'action', owner: '0' },
            { uid: 'mugging-pressure-minion', defId: 'alien_scout', type: 'minion', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_thieves_pickpocket', 18),
        discard: [],
        factions: ['munchkin_thieves', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 20),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 22,
            nextUid: 2000,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_thieves_guild',
                    minions: [
                        {
                            ...minion('mugging-enemy-host', 'alien_invader', '1', 2),
                            attachedActions: [
                                { uid: 'mugging-spiky-boots', defId: 'munchkin_treasure_spiky_boots', ownerId: '1' },
                            ],
                        },
                        minion('mugging-own-target', 'munchkin_thieves_pickpocket', '0', 2),
                    ],
                    ongoingActions: [],
                    monsters: [
                        { uid: 'mugging-monster-1', defId: 'munchkin_monster_bigfoot' },
                    ],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinThievesStripBareScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'strip-bare-1', defId: 'munchkin_thieves_strip_bare', type: 'action', owner: '0' },
            { uid: 'strip-pressure-minion', defId: 'alien_scout', type: 'minion', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_thieves_pickpocket', 18),
        discard: [],
        factions: ['munchkin_thieves', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 20),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 22,
            nextUid: 2010,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_thieves_guild',
                    minions: [
                        minion('strip-treasure-minion', 'munchkin_treasure_dwarf_hireling', '1', 2),
                        minion('strip-normal-minion', 'alien_invader', '1', 2),
                    ],
                    ongoingActions: [
                        { uid: 'strip-treasure-action', defId: 'munchkin_treasure_bag_of_caltrops', ownerId: '1' },
                    ],
                    monsters: [
                        { uid: 'strip-monster-1', defId: 'munchkin_monster_bigfoot' },
                    ],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinThievesGuildScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'guild-caltrops-1', defId: 'munchkin_treasure_bag_of_caltrops', type: 'action', owner: '0' },
            { uid: 'guild-pressure-minion', defId: 'alien_scout', type: 'minion', owner: '0' },
        ],
        deck: [
            { uid: 'guild-draw-1', defId: 'alien_invader', type: 'minion', owner: '0' },
        ],
        discard: [],
        factions: ['munchkin_thieves', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 20),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 22,
            nextUid: 2020,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_thieves_guild',
                    minions: [
                        minion('guild-own-minion', 'munchkin_thieves_pickpocket', '0', 2),
                    ],
                    ongoingActions: [],
                    monsters: [
                        { uid: 'guild-monster-1', defId: 'munchkin_monster_bigfoot' },
                    ],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinThievesScoringScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'clever-distraction-1', defId: 'munchkin_thieves_clever_distraction', type: 'action', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_thieves_pickpocket', 18),
        discard: [],
        factions: ['munchkin_thieves', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 2,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 20),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 5,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 22,
            nextUid: 2030,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: [
                'munchkin_treasure_wishing_ring',
                'munchkin_treasure_dwarf_hireling',
                'munchkin_treasure_spiky_boots',
                'munchkin_treasure_buckler_of_swashing',
            ],
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_coffers',
                    minions: [
                        minion('coffers-thief-minion', 'munchkin_thieves_pickpocket', '0', 2),
                        minion('coffers-winner-minion', 'munchkin_warriors_big_hero', '1', 20),
                    ],
                    ongoingActions: [
                        { uid: 'secret-stash-1', defId: 'munchkin_thieves_secret_stash', ownerId: '0' },
                    ],
                    monsters: [
                        { uid: 'coffers-monster-1', defId: 'munchkin_monster_gross_troll' },
                        { uid: 'coffers-monster-2', defId: 'munchkin_monster_gross_troll' },
                    ],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinDwarfHirelingScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'dwarf-hireling-1', defId: 'munchkin_treasure_dwarf_hireling', type: 'minion', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_dwarves_gem_grabber', 18),
        discard: [],
        factions: ['munchkin_dwarves', 'munchkin_warriors'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 20),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 16,
            nextUid: 765,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_treasure_bath',
                    minions: [],
                    ongoingActions: [],
                    monsters: [
                        { uid: 'dwarf-monster-1', defId: 'munchkin_monster_bigfoot' },
                    ],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinTreasureBathDrawScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'treasure-bath-invader-1', defId: 'alien_invader', type: 'minion', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_dwarves_gem_grabber', 18),
        discard: [],
        factions: ['aliens', 'munchkin_dwarves'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 20),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 16,
            nextUid: 1210,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: [
                'munchkin_treasure_wishing_ring',
                'munchkin_treasure_spiky_boots',
            ],
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_treasure_bath',
                    minions: [],
                    ongoingActions: [],
                    monsters: [
                        { uid: 'treasure-bath-monster-1', defId: 'munchkin_monster_bigfoot' },
                    ],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinGoldDiggerTreasureRecoveryScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [],
        deck: deckCards('0', 'munchkin_dwarves_gem_grabber', 18),
        discard: [],
        factions: ['munchkin_dwarves', 'munchkin_warriors'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 20),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 16,
            nextUid: 1230,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            treasureDiscard: [
                'munchkin_treasure_wishing_ring',
                'munchkin_treasure_spiky_boots',
            ],
            baseDeck: ['base_treasure_bath'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_mines',
                    minions: [
                        minion('dwarf-gold-digger', 'munchkin_dwarves_gold_digger', '0', 3),
                        minion('dwarf-gold-digger-bystander', 'alien_invader', '1', 3),
                    ],
                    ongoingActions: [],
                    monsters: [
                        { uid: 'gold-digger-monster-1', defId: 'munchkin_monster_bigfoot' },
                        { uid: 'gold-digger-monster-2', defId: 'munchkin_monster_floating_nose' },
                    ],
                },
                {
                    defId: 'base_treasure_bath',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinHiddenAssetsScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'hidden-assets-1', defId: 'munchkin_dwarves_hidden_assets', type: 'action', owner: '0' },
        ],
        deck: [
            { uid: 'hidden-assets-drawn-1', defId: 'alien_invader', type: 'minion', owner: '0' },
            ...deckCards('0', 'munchkin_dwarves_gem_grabber', 17),
        ],
        discard: [],
        factions: ['munchkin_dwarves', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 20),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 16,
            nextUid: 1240,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: [
                'munchkin_treasure_dwarf_hireling',
                'munchkin_treasure_halfling_hireling',
                'munchkin_treasure_tiger_steed',
                'munchkin_treasure_bag_of_caltrops',
            ],
            treasureDiscard: ['munchkin_treasure_wishing_ring'],
            baseDeck: ['base_treasure_bath'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_mines',
                    minions: [
                        minion('hidden-assets-bystander', 'munchkin_dwarves_loot_lover', '0', 4),
                    ],
                    ongoingActions: [],
                    monsters: [
                        { uid: 'hidden-assets-monster-1', defId: 'munchkin_monster_bigfoot' },
                        { uid: 'hidden-assets-monster-2', defId: 'munchkin_monster_floating_nose' },
                    ],
                },
                {
                    defId: 'base_treasure_bath',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinAnythingForMoneyScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'money-1', defId: 'munchkin_dwarves_anything_for_money', type: 'action', owner: '0' },
            { uid: 'money-discard-a', defId: 'munchkin_dwarves_cash_out', type: 'action', owner: '0' },
            { uid: 'money-discard-b', defId: 'munchkin_dwarves_gem_grabber', type: 'minion', owner: '0' },
        ],
        deck: deckCards('0', 'alien_invader', 18),
        discard: [],
        factions: ['munchkin_dwarves', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 20),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 16,
            nextUid: 1250,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: [
                'munchkin_treasure_dwarf_hireling',
                'munchkin_treasure_wishing_ring',
                'munchkin_treasure_spiky_boots',
            ],
            treasureDiscard: [],
            baseDeck: ['base_treasure_bath'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_mines',
                    minions: [
                        minion('money-bystander', 'munchkin_dwarves_loot_lover', '0', 4),
                    ],
                    ongoingActions: [],
                    monsters: [
                        { uid: 'money-monster-1', defId: 'munchkin_monster_bigfoot' },
                        { uid: 'money-monster-2', defId: 'munchkin_monster_floating_nose' },
                    ],
                },
                {
                    defId: 'base_treasure_bath',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinCashOutExtraTreasureMinionsScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'cash-out-1', defId: 'munchkin_dwarves_cash_out', type: 'action', owner: '0' },
            { uid: 'cash-out-treasure-a', defId: 'munchkin_treasure_dwarf_hireling', type: 'minion', owner: '0' },
            { uid: 'cash-out-treasure-b', defId: 'munchkin_treasure_tiger_steed', type: 'minion', owner: '0' },
            { uid: 'cash-out-non-treasure', defId: 'munchkin_dwarves_gem_grabber', type: 'minion', owner: '0' },
        ],
        deck: deckCards('0', 'alien_invader', 18),
        discard: [],
        factions: ['munchkin_dwarves', 'aliens'],
        minionsPlayed: 1,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 20),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 16,
            nextUid: 1270,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            treasureDiscard: [],
            baseDeck: ['base_treasure_bath'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_mines',
                    minions: [
                        minion('cash-out-existing-minion', 'munchkin_dwarves_loot_lover', '0', 4),
                    ],
                    ongoingActions: [],
                    monsters: [
                        { uid: 'cash-out-monster-1', defId: 'munchkin_monster_bigfoot' },
                        { uid: 'cash-out-monster-2', defId: 'munchkin_monster_floating_nose' },
                    ],
                },
                {
                    defId: 'base_treasure_bath',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinCunningPlanBeforeScoringScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'cunning-plan-1', defId: 'munchkin_dwarves_cunning_plan', type: 'action', owner: '0' },
        ],
        deck: deckCards('0', 'alien_invader', 18),
        discard: [],
        factions: ['munchkin_dwarves', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 2,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 20),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 17,
            nextUid: 1280,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: [
                'munchkin_treasure_wishing_ring',
                'munchkin_treasure_spiky_boots',
            ],
            treasureDiscard: [],
            baseDeck: ['base_treasure_bath'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_mines',
                    minions: [
                        minion('cunning-plan-scorer', 'munchkin_dwarves_loot_lover', '0', 30),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
                {
                    defId: 'base_treasure_bath',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinMineSearchTreasureScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'mine-1', defId: 'munchkin_dwarves_mine', type: 'action', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_dwarves_gem_grabber', 18),
        discard: [],
        factions: ['munchkin_dwarves', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'pirate_buccaneer', 20),
        discard: [],
        factions: ['pirates', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 17,
            nextUid: 1290,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: [
                'munchkin_treasure_wishing_ring',
                'munchkin_treasure_spiky_boots',
                'munchkin_treasure_potion_of_idiotic_bravery',
                'munchkin_treasure_magic_missile',
            ],
            treasureDiscard: [],
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_treasure_bath',
                    minions: [
                        minion('mine-host-1', 'munchkin_dwarves_loot_lover', '0', 4),
                        minion('mine-opponent-1', 'pirate_buccaneer', '1', 4),
                    ],
                    ongoingActions: [],
                    monsters: [
                        { uid: 'mine-monster-1', defId: 'munchkin_monster_bigfoot' },
                        { uid: 'mine-monster-2', defId: 'munchkin_monster_ghoul' },
                    ],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [
                        minion('mine-host-2', 'alien_invader', '0', 3),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinNoMyPreciousExtraActionScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'precious-1', defId: 'munchkin_dwarves_no_my_precious', type: 'action', owner: '0' },
            { uid: 'precious-extra-ring', defId: 'munchkin_treasure_wishing_ring', type: 'action', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_dwarves_gem_grabber', 18),
        discard: [],
        factions: ['munchkin_dwarves', 'munchkin_warriors'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'pirate_buccaneer', 20),
        discard: [],
        factions: ['pirates', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 17,
            nextUid: 1300,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: [],
            treasureDiscard: [],
            baseDeck: ['base_treasure_bath'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_mines',
                    minions: [
                        {
                            ...minion('precious-host', 'munchkin_warriors_big_hero', '1', 5),
                            attachedActions: [
                                {
                                    uid: 'precious-treasure-attached',
                                    defId: 'munchkin_treasure_spiky_boots',
                                    ownerId: '1',
                                },
                                {
                                    uid: 'precious-normal-attached',
                                    defId: 'alien_jammed_signal',
                                    ownerId: '1',
                                },
                            ],
                        },
                        minion('precious-bystander', 'munchkin_dwarves_loot_lover', '0', 4),
                    ],
                    ongoingActions: [
                        { uid: 'precious-base-action', defId: 'zombie_overrun', ownerId: '1' },
                    ],
                    monsters: [
                        { uid: 'precious-monster-1', defId: 'munchkin_monster_bigfoot' },
                        { uid: 'precious-monster-2', defId: 'munchkin_monster_fowl_fiend' },
                    ],
                },
                {
                    defId: 'base_treasure_bath',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinSalvageBeforeScoringScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'salvage-1', defId: 'munchkin_dwarves_salvage', type: 'action', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_dwarves_gem_grabber', 18),
        discard: [],
        factions: ['munchkin_dwarves', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 1,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'pirate_buccaneer', 20),
        discard: [],
        factions: ['pirates', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 17,
            nextUid: 1310,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            treasureDiscard: [
                'munchkin_treasure_wishing_ring',
                'munchkin_treasure_spiky_boots',
                'munchkin_treasure_potion_of_idiotic_bravery',
                'munchkin_treasure_magic_missile',
            ],
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_mines',
                    minions: [
                        minion('salvage-host-1', 'munchkin_dwarves_loot_lover', '0', 30),
                        minion('salvage-opponent-1', 'pirate_buccaneer', '1', 4),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
                {
                    defId: 'base_treasure_bath',
                    minions: [
                        minion('salvage-away-host', 'alien_invader', '0', 3),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinGreedIsGoodScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'greed-1', defId: 'munchkin_dwarves_greed_is_good', type: 'action', owner: '0' },
        ],
        deck: deckCards('0', 'alien_invader', 18),
        discard: [],
        factions: ['munchkin_dwarves', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 20),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 16,
            nextUid: 1260,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: [
                'munchkin_treasure_dwarf_hireling',
                'munchkin_treasure_spiky_boots',
            ],
            treasureDiscard: [
                'munchkin_treasure_wishing_ring',
                'munchkin_treasure_buckler_of_swashing',
            ],
            baseDeck: ['base_treasure_bath'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_mines',
                    minions: [
                        minion('greed-bystander', 'munchkin_dwarves_loot_lover', '0', 4),
                    ],
                    ongoingActions: [],
                    monsters: [
                        { uid: 'greed-monster-1', defId: 'munchkin_monster_bigfoot' },
                        { uid: 'greed-monster-2', defId: 'munchkin_monster_floating_nose' },
                    ],
                },
                {
                    defId: 'base_treasure_bath',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinDwarfTreasurePowerScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'loot-lover-buckler-1', defId: 'munchkin_treasure_buckler_of_swashing', type: 'action', owner: '0' },
            { uid: 'loot-lover-rocket-1', defId: 'munchkin_treasure_rocket_boots', type: 'action', owner: '0' },
            { uid: 'gem-grabber-jetpack-1', defId: 'munchkin_treasure_temporal_displacement_jetpack', type: 'action', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_dwarves_gem_grabber', 18),
        discard: [],
        factions: ['munchkin_dwarves', 'munchkin_warriors'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 3,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 20),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 16,
            nextUid: 1220,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_treasure_bath'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_homeworld',
                    minions: [
                        minion('dwarf-loot-lover', 'munchkin_dwarves_loot_lover', '0', 4),
                        minion('dwarf-power-bystander', 'alien_invader', '1', 3),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
                {
                    defId: 'base_treasure_bath',
                    minions: [
                        minion('dwarf-gem-grabber', 'munchkin_dwarves_gem_grabber', '0', 2),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinSpikyBootsScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'spiky-boots-hand-1', defId: 'munchkin_treasure_spiky_boots', type: 'action', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_dwarves_gem_grabber', 18),
        discard: [],
        factions: ['munchkin_warriors', 'munchkin_dwarves'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'alien_invader', 20),
        discard: [],
        factions: ['aliens', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 7,
            nextUid: 780,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_treasure_bath',
                    minions: [
                        minion('spiky-host', 'munchkin_warriors_big_hero', '0', 5),
                        minion('spiky-bystander', 'alien_invader', '1', 3),
                    ],
                    ongoingActions: [],
                    monsters: [
                        { uid: 'spiky-monster-1', defId: 'munchkin_monster_bigfoot' },
                    ],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinTheMinesTreasureAttachmentScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'mines-spiky-boots-1', defId: 'munchkin_treasure_spiky_boots', type: 'action', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_dwarves_gem_grabber', 18),
        discard: [],
        factions: ['munchkin_warriors', 'munchkin_dwarves'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'alien_invader', 20),
        discard: [],
        factions: ['aliens', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 16,
            nextUid: 1270,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_treasure_bath'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_mines',
                    minions: [
                        minion('mines-host', 'munchkin_warriors_big_hero', '0', 5),
                        minion('mines-bystander', 'alien_invader', '1', 3),
                    ],
                    ongoingActions: [],
                    monsters: [
                        { uid: 'mines-monster-1', defId: 'munchkin_monster_bigfoot' },
                        { uid: 'mines-monster-2', defId: 'munchkin_monster_floating_nose' },
                    ],
                },
                {
                    defId: 'base_treasure_bath',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinBloodyDismembermentChainsawScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'chainsaw-hand-1', defId: 'munchkin_treasure_bloody_dismemberment_chainsaw', type: 'action', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_dwarves_gem_grabber', 18),
        discard: [],
        factions: ['munchkin_warriors', 'munchkin_dwarves'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'alien_invader', 20),
        discard: [],
        factions: ['aliens', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 8,
            nextUid: 790,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_treasure_bath',
                    minions: [
                        minion('chainsaw-host', 'munchkin_warriors_big_hero', '0', 5),
                        minion('chainsaw-bystander', 'alien_invader', '1', 3),
                    ],
                    ongoingActions: [],
                    monsters: [
                        { uid: 'chainsaw-monster-1', defId: 'munchkin_monster_bigfoot' },
                    ],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinLoadsOfTreasureScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'loads-hand-1', defId: 'munchkin_treasure_loads_of_treasure', type: 'action', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_dwarves_gem_grabber', 18),
        discard: [],
        factions: ['munchkin_warriors', 'munchkin_dwarves'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'alien_invader', 20),
        discard: [],
        factions: ['aliens', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 9,
            nextUid: 800,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_treasure_bath',
                    minions: [
                        {
                            ...minion('loads-host', 'munchkin_warriors_big_hero', '0', 5),
                            attachedActions: [
                                {
                                    uid: 'loads-spiky-1',
                                    defId: 'munchkin_treasure_spiky_boots',
                                    ownerId: '0',
                                },
                            ],
                        },
                        minion('loads-bystander', 'alien_invader', '1', 3),
                    ],
                    ongoingActions: [],
                    monsters: [
                        { uid: 'loads-monster-1', defId: 'munchkin_monster_bigfoot' },
                    ],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinKneepadsOfAllureScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'kneepads-hand-1', defId: 'munchkin_treasure_kneepads_of_allure', type: 'action', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_dwarves_gem_grabber', 18),
        discard: [],
        factions: ['munchkin_warriors', 'munchkin_dwarves'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'alien_invader', 20),
        discard: [],
        factions: ['aliens', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 10,
            nextUid: 810,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_treasure_bath',
                    minions: [
                        minion('kneepads-host', 'munchkin_warriors_big_hero', '0', 5),
                        minion('kneepads-ally', 'munchkin_treasure_dwarf_hireling', '0', 2),
                        minion('kneepads-enemy', 'alien_invader', '1', 3),
                    ],
                    ongoingActions: [],
                    monsters: [
                        { uid: 'kneepads-monster-1', defId: 'munchkin_monster_bigfoot' },
                    ],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinPotionOfCowardiceScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'cowardice-hand-1', defId: 'munchkin_treasure_potion_of_cowardice', type: 'action', owner: '0' },
            { uid: 'cowardice-talent-cost-1', defId: 'alien_probe', type: 'action', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_dwarves_gem_grabber', 18),
        discard: [],
        factions: ['munchkin_warriors', 'aladdin'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'alien_invader', 20),
        discard: [],
        factions: ['aliens', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 11,
            nextUid: 820,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_treasure_bath',
                    minions: [
                        minion('cowardice-host', 'aladdin_rajah', '0', 3),
                        minion('cowardice-bystander', 'alien_invader', '1', 3),
                    ],
                    ongoingActions: [],
                    monsters: [
                        { uid: 'cowardice-monster-1', defId: 'munchkin_monster_bigfoot' },
                    ],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinRocketBootsScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [],
        deck: deckCards('0', 'munchkin_dwarves_gem_grabber', 18),
        discard: [],
        factions: ['munchkin_dwarves', 'munchkin_warriors'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 20),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 6,
            nextUid: 800,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_treasure_bath',
                    minions: [
                        {
                            ...minion('rocket-host', 'munchkin_warriors_big_hero', '0', 5),
                            attachedActions: [
                                {
                                    uid: 'rocket-boots-1',
                                    defId: 'munchkin_treasure_rocket_boots',
                                    ownerId: '0',
                                    talentUsed: false,
                                },
                            ],
                        },
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinDuplicationPotionScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'action-cost-1', defId: 'alien_probe', type: 'action', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_warriors_big_hero', 18),
        discard: [],
        factions: ['munchkin_warriors', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'alien_invader', 20),
        discard: [],
        factions: ['aladdin', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 7,
            nextUid: 900,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_treasure_bath',
                    minions: [
                        {
                            ...minion('duplication-host', 'munchkin_warriors_big_hero', '0', 5),
                            attachedActions: [
                                {
                                    uid: 'duplication-potion-1',
                                    defId: 'munchkin_treasure_potion_of_duplication',
                                    ownerId: '0',
                                    talentUsed: false,
                                },
                            ],
                        },
                        minion('rajah-1', 'aladdin_rajah', '1', 2),
                        minion('no-talent-1', 'alien_invader', '1', 3),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinMagicMissileScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [],
        deck: deckCards('0', 'munchkin_dwarves_gem_grabber', 18),
        discard: [],
        factions: ['munchkin_warriors', 'munchkin_dwarves'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'alien_invader', 20),
        discard: [],
        factions: ['aliens', 'munchkin_orcs'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 14,
            nextUid: 1500,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: ['munchkin_treasure_wishing_ring'],
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_treasure_bath',
                    minions: [
                        {
                            ...minion('magic-host', 'munchkin_warriors_big_hero', '0', 5),
                            attachedActions: [
                                {
                                    uid: 'magic-missile-1',
                                    defId: 'munchkin_treasure_magic_missile',
                                    ownerId: '0',
                                    talentUsed: false,
                                },
                            ],
                        },
                        minion('magic-low-target', 'alien_invader', '1', 2),
                        minion('magic-high-target', 'munchkin_orcs_sword_lord', '1', 5),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinBucklerOfSwashingScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'buckler-hand-1', defId: 'munchkin_treasure_buckler_of_swashing', type: 'action', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_dwarves_gem_grabber', 18),
        discard: [],
        factions: ['munchkin_warriors', 'munchkin_dwarves'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'alien_invader', 20),
        discard: [],
        factions: ['aliens', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 15,
            nextUid: 1580,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: ['munchkin_treasure_wishing_ring'],
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_treasure_bath',
                    minions: [
                        {
                            ...minion('buckler-magic-host', 'munchkin_warriors_big_hero', '0', 5),
                            attachedActions: [
                                {
                                    uid: 'buckler-magic-missile',
                                    defId: 'munchkin_treasure_magic_missile',
                                    ownerId: '0',
                                    talentUsed: false,
                                },
                            ],
                        },
                        minion('buckler-unprotected-target', 'alien_invader', '1', 3),
                        minion('buckler-protected-target', 'alien_invader', '1', 3),
                    ],
                    ongoingActions: [],
                    monsters: [
                        { uid: 'buckler-monster-1', defId: 'munchkin_monster_bigfoot' },
                    ],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinWishingRingScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'wishing-ring-1', defId: 'munchkin_treasure_wishing_ring', type: 'action', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_dwarves_gem_grabber', 18),
        discard: [],
        factions: ['munchkin_warriors', 'munchkin_dwarves'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 2,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'alien_invader', 20),
        discard: [],
        factions: ['aliens', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 15,
            nextUid: 1600,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: ['munchkin_treasure_dwarf_hireling'],
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_mines',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinTreasureFinderScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'treasure-finder-1', defId: 'munchkin_treasure_treasure_finder', type: 'action', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_dwarves_gem_grabber', 18),
        discard: [],
        factions: ['munchkin_warriors', 'munchkin_dwarves'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 2,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'alien_invader', 20),
        discard: [],
        factions: ['aliens', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 16,
            nextUid: 1700,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: [
                'munchkin_treasure_dwarf_hireling',
                'munchkin_treasure_halfling_hireling',
                'munchkin_treasure_tiger_steed',
            ],
            treasureDiscard: [
                'munchkin_treasure_magic_missile',
                'munchkin_treasure_wishing_ring',
            ],
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_mines',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinCrossbowScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'crossbow-1', defId: 'munchkin_treasure_crossbow', type: 'action', owner: '0' },
        ],
        deck: deckCards('0', 'pirate_buccaneer', 18),
        discard: [],
        factions: ['pirates', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 2,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'alien_invader', 20),
        discard: [],
        factions: ['robots', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 17,
            nextUid: 1800,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_mines',
                    minions: [
                        minion('crossbow-pirate-a', 'pirate_buccaneer', '0', 4),
                        minion('crossbow-pirate-b', 'pirate_first_mate', '1', 4),
                        minion('crossbow-alien-a', 'alien_invader', '1', 3),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
                {
                    defId: 'base_treasure_bath',
                    minions: [
                        minion('crossbow-pirate-away', 'pirate_buccaneer', '0', 4),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinBagOfCaltropsScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '1',
    phase: 'playCards',
    player0: {
        hand: [],
        deck: deckCards('0', 'munchkin_dwarves_gem_grabber', 18),
        discard: [],
        factions: ['munchkin_warriors', 'munchkin_dwarves'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [
            { uid: 'caltrops-target-1', defId: 'pirate_first_mate', type: 'minion', owner: '1' },
        ],
        deck: deckCards('1', 'pirate_first_mate', 20),
        discard: [],
        factions: ['pirates', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 18,
            nextUid: 1900,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_treasure_bath'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_mines',
                    minions: [],
                    ongoingActions: [
                        { uid: 'caltrops-1', defId: 'munchkin_treasure_bag_of_caltrops', ownerId: '0' },
                    ],
                    monsters: [],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinPotionOfIdioticBraveryScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'idiotic-bravery-1', defId: 'munchkin_treasure_potion_of_idiotic_bravery', type: 'action', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_dwarves_gem_grabber', 18),
        discard: [],
        factions: ['munchkin_warriors', 'munchkin_dwarves'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'alien_invader', 20),
        discard: [],
        factions: ['aliens', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 19,
            nextUid: 2000,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_treasure_bath'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_mines',
                    minions: [
                        minion('bravery-target', 'munchkin_warriors_big_hero', '0', 5),
                        minion('bravery-bystander', 'alien_invader', '1', 3),
                    ],
                    ongoingActions: [],
                    monsters: [
                        { uid: 'bravery-monster-1', defId: 'munchkin_monster_ghoul' },
                    ],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinDungeonRulebookScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'dungeon-rulebook-1', defId: 'munchkin_treasure_dungeon_rulebook', type: 'action', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_warriors_big_hero', 18),
        discard: [],
        factions: ['munchkin_warriors', 'munchkin_dwarves'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'alien_invader', 20),
        discard: [],
        factions: ['zombies', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 8,
            nextUid: 1000,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_mines',
                    minions: [
                        minion('rulebook-host', 'munchkin_warriors_big_hero', '0', 5),
                    ],
                    ongoingActions: [
                        { uid: 'dungeon-target-action-1', defId: 'zombie_overrun', ownerId: '1' },
                    ],
                    monsters: [],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinDwarfKingRecoveryScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'dwarf-king-rulebook-1', defId: 'munchkin_treasure_dungeon_rulebook', type: 'action', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_dwarves_gem_grabber', 18),
        discard: [],
        factions: ['munchkin_warriors', 'munchkin_dwarves'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'alien_invader', 20),
        discard: [],
        factions: ['zombies', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 8,
            nextUid: 1010,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_mines',
                    minions: [
                        minion('dwarf-king-e2e', 'munchkin_dwarves_dwarf_king', '0', 5),
                        {
                            ...minion('dwarf-king-host', 'munchkin_warriors_big_hero', '0', 5),
                            attachedActions: [
                                {
                                    uid: 'dwarf-king-spiky-boots',
                                    defId: 'munchkin_treasure_spiky_boots',
                                    ownerId: '1',
                                },
                            ],
                        },
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinHalitosisPotionScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'halitosis-1', defId: 'munchkin_treasure_potion_of_halitosis', type: 'action', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_warriors_big_hero', 18),
        discard: [],
        factions: ['munchkin_warriors', 'munchkin_dwarves'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'alien_invader', 20),
        discard: [],
        factions: ['aliens', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 9,
            nextUid: 1100,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_mines',
                    minions: [
                        minion('halitosis-runner', 'munchkin_warriors_big_hero', '0', 5),
                        minion('halitosis-enemy', 'alien_invader', '1', 3),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
                {
                    defId: 'base_treasure_bath',
                    minions: [
                        minion('halitosis-destination-ally', 'munchkin_dwarves_gem_grabber', '0', 2),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinStraightLineRunningAwayScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'straight-line-1', defId: 'munchkin_treasure_potion_of_straight_line_running_away', type: 'action', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_warriors_big_hero', 18),
        discard: [],
        factions: ['munchkin_warriors', 'munchkin_dwarves'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'alien_invader', 20),
        discard: [],
        factions: ['aliens', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 10,
            nextUid: 1200,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: [
                'munchkin_treasure_dwarf_hireling',
                'munchkin_treasure_bag_of_caltrops',
                'munchkin_treasure_wishing_ring',
                'munchkin_treasure_tiger_steed',
            ],
            baseDeck: ['base_treasure_bath'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_mines',
                    minions: [
                        minion('straight-line-winner', 'munchkin_warriors_big_hero', '0', 30),
                    ],
                    ongoingActions: [],
                    monsters: [
                        { uid: 'straight-line-treasure-dragon', defId: 'munchkin_monster_treasure_dragon' },
                    ],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinParalysisPotionScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'paralysis-1', defId: 'munchkin_treasure_potion_of_paralysis', type: 'action', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_warriors_big_hero', 18),
        discard: [],
        factions: ['munchkin_warriors', 'munchkin_dwarves'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'alien_invader', 20),
        discard: [],
        factions: ['aliens', 'zombies'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 11,
            nextUid: 1300,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_treasure_bath'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_mines',
                    minions: [
                        {
                            ...minion('paralysis-hero', 'munchkin_warriors_big_hero', '0', 30),
                            attachedActions: [
                                {
                                    uid: 'paralysis-rocket-boots',
                                    defId: 'munchkin_treasure_rocket_boots',
                                    ownerId: '0',
                                    talentUsed: false,
                                },
                            ],
                        },
                        minion('paralysis-ally', 'munchkin_treasure_dwarf_hireling', '1', 2),
                    ],
                    ongoingActions: [
                        { uid: 'paralysis-base-action', defId: 'zombie_overrun', ownerId: '1' },
                    ],
                    monsters: [],
                },
                {
                    defId: 'base_treasure_bath',
                    minions: [
                        minion('paralysis-away-minion', 'munchkin_treasure_halfling_hireling', '0', 2),
                    ],
                    ongoingActions: [
                        { uid: 'paralysis-away-action', defId: 'alien_jammed_signal', ownerId: '1' },
                    ],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinTemporalDisplacementJetpackScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [],
        deck: deckCards('0', 'munchkin_dwarves_gem_grabber', 18),
        discard: [],
        factions: ['munchkin_warriors', 'munchkin_dwarves'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'alien_invader', 20),
        discard: [],
        factions: ['aliens', 'zombies'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 13,
            nextUid: 1400,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_treasure_bath'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_mines',
                    minions: [
                        {
                            ...minion('jetpack-host', 'munchkin_warriors_big_hero', '0', 30),
                            attachedActions: [
                                {
                                    uid: 'temporal-jetpack-1',
                                    defId: 'munchkin_treasure_temporal_displacement_jetpack',
                                    ownerId: '0',
                                },
                            ],
                        },
                        minion('jetpack-witness', 'alien_invader', '1', 2),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinMagesTargetSelectionScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'mages-zzzzzap-1', defId: 'munchkin_mages_zzzzzap', type: 'action', owner: '0' },
            { uid: 'mages-cost-1', defId: 'munchkin_mages_speed_reading', type: 'action', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_mages_scroll_shuffler', 12),
        discard: [],
        factions: ['munchkin_mages', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'pirate_first_mate', 12),
        discard: [],
        factions: ['pirates', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 21,
            nextUid: 2100,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_mages_tower'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_mages_tower',
                    minions: [
                        minion('mages-strong-target', 'pirate_first_mate', '1', 5),
                        minion('mages-weak-target', 'alien_invader', '1', 2),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinMagesMassSummoningScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [{ uid: 'mages-mass-1', defId: 'munchkin_mages_mass_summoning', type: 'action', owner: '0' }],
        deck: deckCards('0', 'munchkin_mages_scroll_shuffler', 12),
        discard: [],
        factions: ['munchkin_mages', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'pirate_first_mate', 12),
        discard: [],
        factions: ['pirates', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 22,
            nextUid: 2200,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: ['munchkin_monster_bigfoot', 'munchkin_monster_ghoul', 'munchkin_monster_pegasus'],
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_dimension_doors', 'base_mages_tower', 'base_the_homeworld'],
            baseDiscard: [],
            bases: [
                { defId: 'base_dimension_doors', minions: [], ongoingActions: [], monsters: [] },
                { defId: 'base_mages_tower', minions: [], ongoingActions: [], monsters: [] },
                { defId: 'base_the_homeworld', minions: [], ongoingActions: [], monsters: [] },
            ],
        },
    },
});

const buildMunchkinMagesCharmScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [{ uid: 'mages-charm-1', defId: 'munchkin_mages_charm', type: 'action', owner: '0' }],
        deck: deckCards('0', 'munchkin_mages_scroll_shuffler', 12),
        discard: [],
        factions: ['munchkin_mages', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'pirate_first_mate', 12),
        discard: [],
        factions: ['pirates', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 23,
            nextUid: 2300,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_dimension_doors', 'base_mages_tower'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_dimension_doors',
                    minions: [],
                    ongoingActions: [],
                    monsters: [
                        { uid: 'mages-charm-monster', defId: 'munchkin_monster_bigfoot' },
                    ],
                },
                {
                    defId: 'base_mages_tower',
                    minions: [],
                    ongoingActions: [],
                    monsters: [
                        { uid: 'mages-charm-monster-2', defId: 'munchkin_monster_ghoul' },
                    ],
                },
            ],
        },
    },
});

const buildMunchkinMagesBaseInteractionScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'mages-base-minion-1', defId: 'alien_invader', type: 'minion', owner: '0' },
            { uid: 'mages-base-minion-2', defId: 'alien_invader', type: 'minion', owner: '0' },
            { uid: 'mages-base-cost-1', defId: 'munchkin_mages_speed_reading', type: 'action', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_mages_scroll_shuffler', 8),
        discard: [],
        factions: ['munchkin_mages', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 2,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'pirate_first_mate', 12),
        discard: [],
        factions: ['pirates', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 24,
            nextUid: 2400,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_dimension_doors', 'base_mages_tower'],
            baseDiscard: [],
            bases: [
                { defId: 'base_dimension_doors', minions: [], ongoingActions: [], monsters: [] },
                { defId: 'base_mages_tower', minions: [], ongoingActions: [], monsters: [] },
            ],
        },
    },
});

const buildMunchkinOrcsSwordLordScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [{ uid: 'orcs-sword-action-1', defId: 'munchkin_orcs_crush', type: 'action', owner: '0' }],
        deck: deckCards('0', 'munchkin_orcs_sword_lord', 18),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 18),
        discard: [],
        factions: ['munchkin_orcs', 'pirates'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 24,
            nextUid: 2400,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_garrison',
                    minions: [
                        minion('orcs-sword-lord-a', 'munchkin_orcs_sword_lord', '0', 5),
                        minion('orcs-sword-ally', 'alien_invader', '0', 2),
                        minion('orcs-sword-enemy', 'pirate_first_mate', '1', 2),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [minion('orcs-sword-other-base', 'alien_scout', '0', 2)],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinOrcsDorkOrcProtectionScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [{ uid: 'orcs-dork-crush-1', defId: 'munchkin_orcs_crush', type: 'action', owner: '0' }],
        deck: deckCards('0', 'munchkin_orcs_sword_lord', 18),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 18),
        discard: [],
        factions: ['munchkin_orcs', 'pirates'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 34,
            nextUid: 3400,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_garrison',
                    minions: [
                        minion('orcs-dork-attacker-a', 'alien_invader', '0', 3),
                        minion('orcs-dork-attacker-b', 'alien_scout', '0', 2),
                        minion('orcs-dork-attacker-c', 'pirate_first_mate', '0', 4),
                        minion('orcs-dork-protected', 'munchkin_orcs_dork_orc', '1', 2),
                        minion('orcs-dork-free', 'alien_invader', '1', 3),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
                { defId: 'base_the_homeworld', minions: [], ongoingActions: [], monsters: [] },
            ],
        },
    },
});

const buildMunchkinOrcsPitsProtectionScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'orcs-pits-crush-1', defId: 'munchkin_orcs_crush', type: 'action', owner: '0' },
            { uid: 'orcs-pits-crush-2', defId: 'munchkin_orcs_crush', type: 'action', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_orcs_sword_lord', 18),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 2,
        vp: 4,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 18),
        discard: [],
        factions: ['munchkin_orcs', 'pirates'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 35,
            nextUid: 3500,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_pits',
                    minions: [
                        minion('orcs-pits-attacker-a', 'alien_invader', '0', 3),
                        minion('orcs-pits-attacker-b', 'alien_scout', '0', 2),
                        minion('orcs-pits-attacker-c', 'pirate_first_mate', '0', 4),
                        minion('orcs-pits-protected-a', 'alien_invader', '1', 3),
                        minion('orcs-pits-protected-b', 'pirate_first_mate', '1', 3),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [
                        minion('orcs-pits-other-attacker-a', 'alien_scout', '0', 2),
                        minion('orcs-pits-other-attacker-b', 'alien_invader', '0', 3),
                        minion('orcs-pits-free', 'pirate_first_mate', '1', 3),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinOrcsPitsLeaveProtectionScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '1',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'orcs-pits-leave-death-breath', defId: 'munchkin_orcs_death_breath', type: 'action', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_orcs_sword_lord', 18),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    player1: {
        hand: [
            { uid: 'orcs-pits-leave-dogpile', defId: 'munchkin_orcs_dogpile', type: 'action', owner: '1' },
        ],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 18),
        discard: [],
        factions: ['munchkin_orcs', 'pirates'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            currentPlayerIndex: 1,
            turnNumber: 36,
            nextUid: 3600,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_pits',
                    minions: [
                        minion('orcs-pits-leaving-target', 'alien_invader', '1', 3),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [
                        minion('orcs-pits-leave-destination-a', 'pirate_first_mate', '1', 2),
                        minion('orcs-pits-leave-destination-b', 'alien_scout', '1', 2),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinOrcsPitsControllerActionScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '1',
    phase: 'playCards',
    player0: {
        hand: [],
        deck: deckCards('0', 'munchkin_orcs_sword_lord', 18),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    player1: {
        hand: [
            { uid: 'orcs-pits-controller-death-breath', defId: 'munchkin_orcs_death_breath', type: 'action', owner: '1' },
        ],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 18),
        discard: [],
        factions: ['munchkin_orcs', 'pirates'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            currentPlayerIndex: 1,
            turnNumber: 38,
            nextUid: 3800,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_pits',
                    minions: [
                        minion('orcs-pits-controller-target', 'alien_invader', '1', 3),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
                { defId: 'base_the_homeworld', minions: [], ongoingActions: [], monsters: [] },
            ],
        },
    },
});

const buildMunchkinOrcsPitsNonActionScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [],
        deck: deckCards('0', 'munchkin_orcs_sword_lord', 18),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 18),
        discard: [],
        factions: ['munchkin_orcs', 'pirates'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 39,
            nextUid: 3900,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld', 'base_mages_tower'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_ninja_dojo',
                    minions: [
                        minion('orcs-pits-non-action-score-own', 'alien_invader', '0', 10),
                        minion('orcs-pits-non-action-score-opponent', 'pirate_first_mate', '1', 9),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
                {
                    defId: 'base_the_pits',
                    minions: [
                        minion('orcs-pits-non-action-target', 'alien_invader', '1', 3),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinOrcsHammerSlammerScene = (options: { includeLegalTarget?: boolean } = {}): SmashUpSceneConfig => {
    const includeLegalTarget = options.includeLegalTarget ?? true;
    return ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'orcs-hammer-1', defId: 'munchkin_orcs_hammer_slammer', type: 'minion', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_orcs_sword_lord', 18),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 18),
        discard: [],
        factions: ['munchkin_orcs', 'pirates'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 25,
            nextUid: 2500,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_treasure_bath',
                    minions: [
                        ...(includeLegalTarget ? [minion('orcs-hammer-weak-0', 'alien_invader', '1', 2)] : []),
                        minion('orcs-hammer-strong-0', 'alien_scout', '1', 3),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: includeLegalTarget ? [minion('orcs-hammer-weak-1', 'pirate_first_mate', '1', 2)] : [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
    });
};

const buildMunchkinOrcsTopperChopperScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'orcs-topper-1', defId: 'munchkin_orcs_topper_chopper', type: 'minion', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_orcs_sword_lord', 18),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 18),
        discard: [],
        factions: ['munchkin_orcs', 'pirates'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 25,
            nextUid: 2520,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_treasure_bath',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinOrcsGimmeScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'orcs-gimme-1', defId: 'munchkin_orcs_gimme', type: 'action', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_orcs_sword_lord', 18),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 18),
        discard: [],
        factions: ['munchkin_orcs', 'pirates'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 25,
            nextUid: 2540,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_treasure_bath',
                    minions: [{
                        ...minion('orcs-gimme-host', 'alien_invader', '1', 3),
                        attachedActions: [{ uid: 'orcs-gimme-attached', defId: 'munchkin_orcs_and_stay_down', ownerId: '1' }],
                    }],
                    ongoingActions: [],
                    monsters: [],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [minion('orcs-gimme-target', 'pirate_first_mate', '0', 2)],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinOrcsAndStayDownScene = (options: { ownPower?: number; opponentPower?: number } = {}): SmashUpSceneConfig => {
    const ownPower = options.ownPower ?? 8;
    const opponentPower = options.opponentPower ?? 5;
    return ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [{ uid: 'orcs-stay-down-1', defId: 'munchkin_orcs_and_stay_down', type: 'action', owner: '0' }],
        deck: deckCards('0', 'munchkin_orcs_sword_lord', 18),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 18),
        discard: [],
        factions: ['munchkin_orcs', 'pirates'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 26,
            nextUid: 2600,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_garrison',
                    minions: [
                        minion('orcs-stay-down-own', 'alien_invader', '0', ownPower),
                        minion('orcs-stay-down-enemy', 'pirate_first_mate', '1', opponentPower),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
                { defId: 'base_the_homeworld', minions: [], ongoingActions: [], monsters: [] },
            ],
        },
    },
    });
};

const buildMunchkinOrcsAngryPillagersScene = (options: { ownPower?: number; opponentPower?: number } = {}): SmashUpSceneConfig => {
    const ownPower = options.ownPower ?? 8;
    const opponentPower = options.opponentPower ?? 5;
    return ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [{ uid: 'orcs-angry-1', defId: 'munchkin_orcs_angry_pillagers', type: 'action', owner: '0' }],
        deck: deckCards('0', 'munchkin_orcs_sword_lord', 18),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 18),
        discard: [],
        factions: ['munchkin_orcs', 'pirates'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 27,
            nextUid: 2700,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_garrison',
                    minions: [
                        minion('orcs-angry-own', 'alien_invader', '0', ownPower),
                        minion('orcs-angry-enemy', 'pirate_first_mate', '1', opponentPower),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
                { defId: 'base_the_homeworld', minions: [], ongoingActions: [], monsters: [] },
            ],
        },
    },
    });
};

const buildMunchkinOrcsBaseScoringScene = (options: {
    baseDefId: 'base_garrison' | 'base_the_pits';
    ownPower: number;
    opponentPower: number;
    turnNumber: number;
}): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [],
        deck: deckCards('0', 'munchkin_orcs_sword_lord', 12),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_sword_lord', 12),
        discard: [],
        factions: ['munchkin_orcs', 'pirates'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: options.turnNumber,
            nextUid: options.turnNumber * 100,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: options.baseDefId,
                    minions: [
                        minion('orcs-score-own', 'alien_invader', '0', options.ownPower),
                        minion('orcs-score-opponent', 'pirate_first_mate', '1', options.opponentPower),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
                { defId: 'base_the_homeworld', minions: [], ongoingActions: [], monsters: [] },
            ],
        },
    },
});

const buildMunchkinOrcsDogpileSpecialScene = (options: { includeTargetBaseMinions?: boolean } = {}): SmashUpSceneConfig => {
    const includeTargetBaseMinions = options.includeTargetBaseMinions ?? true;
    return ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [{ uid: 'orcs-dogpile-special-1', defId: 'munchkin_orcs_dogpile', type: 'action', owner: '0' }],
        deck: deckCards('0', 'munchkin_orcs_sword_lord', 18),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 18),
        discard: [],
        factions: ['munchkin_orcs', 'pirates'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 28,
            nextUid: 2800,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_garrison',
                    minions: [
                        minion('orcs-dogpile-source', 'alien_invader', '0', 5),
                        minion('orcs-dogpile-keep', 'alien_scout', '0', 4),
                        minion('orcs-dogpile-enemy', 'pirate_first_mate', '1', 5),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: includeTargetBaseMinions
                        ? [
                            minion('orcs-dogpile-target-a', 'alien_invader', '0', 3),
                            minion('orcs-dogpile-target-b', 'alien_scout', '0', 2),
                        ]
                        : [],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
    });
};

const buildMunchkinOrcsStallingScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [{ uid: 'orcs-stalling-action-1', defId: 'munchkin_orcs_crush', type: 'action', owner: '0' }],
        deck: deckCards('0', 'munchkin_orcs_sword_lord', 18),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 18),
        discard: [],
        factions: ['munchkin_orcs', 'pirates'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 29,
            nextUid: 2900,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_garrison',
                    minions: [
                        minion('orcs-stalling-attacker-a', 'alien_invader', '0', 3),
                        minion('orcs-stalling-attacker-b', 'alien_scout', '0', 2),
                        minion('orcs-stalling-defender', 'pirate_first_mate', '1', 3),
                    ],
                    ongoingActions: [{ uid: 'orcs-stalling-card', defId: 'munchkin_orcs_stalling', ownerId: '1' }],
                    monsters: [],
                },
                { defId: 'base_the_homeworld', minions: [], ongoingActions: [], monsters: [] },
            ],
        },
    },
});

const buildMunchkinOrcsStallingPlacementScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [{ uid: 'orcs-stalling-placement-1', defId: 'munchkin_orcs_stalling', type: 'action', owner: '0' }],
        deck: deckCards('0', 'munchkin_orcs_sword_lord', 18),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 18),
        discard: [],
        factions: ['munchkin_orcs', 'pirates'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 30,
            nextUid: 3010,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_garrison',
                    minions: [
                        minion('orcs-stalling-placement-own', 'alien_invader', '0', 3),
                        minion('orcs-stalling-placement-enemy', 'pirate_first_mate', '1', 2),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [minion('orcs-stalling-placement-other', 'alien_scout', '1', 2)],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinOrcsCrushScene = (options: { includeDefender?: boolean } = {}): SmashUpSceneConfig => {
    const includeDefender = options.includeDefender ?? true;
    return ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [{ uid: 'orcs-crush-action-1', defId: 'munchkin_orcs_crush', type: 'action', owner: '0' }],
        deck: deckCards('0', 'munchkin_orcs_sword_lord', 18),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 18),
        discard: [],
        factions: ['munchkin_orcs', 'pirates'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 30,
            nextUid: 3000,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_garrison',
                    minions: [
                        minion('orcs-crush-attacker-a', 'alien_invader', '0', 3),
                        minion('orcs-crush-attacker-b', 'alien_scout', '0', 2),
                        ...(includeDefender ? [minion('orcs-crush-defender', 'pirate_first_mate', '1', 3)] : []),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
                { defId: 'base_the_homeworld', minions: [], ongoingActions: [], monsters: [] },
            ],
        },
    },
    });
};

const buildMunchkinOrcsDeathBreathProtectionScene = (options: { includeFree?: boolean } = {}): SmashUpSceneConfig => {
    const includeFree = options.includeFree ?? true;
    return ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [{ uid: 'orcs-death-breath-action-1', defId: 'munchkin_orcs_death_breath', type: 'action', owner: '0' }],
        deck: deckCards('0', 'munchkin_orcs_sword_lord', 18),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 18),
        discard: [],
        factions: ['munchkin_orcs', 'pirates'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 30,
            nextUid: 3000,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_garrison',
                    minions: [
                        {
                            ...minion('orcs-death-breath-protected', 'pirate_first_mate', '1', 3),
                            attachedActions: [{ uid: 'orcs-death-breath-too-tough', defId: 'munchkin_orcs_too_tough', ownerId: '1' }],
                        },
                        ...(includeFree ? [minion('orcs-death-breath-free', 'alien_scout', '1', 3)] : []),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
                { defId: 'base_the_homeworld', minions: [], ongoingActions: [], monsters: [] },
            ],
        },
    },
    });
};

const buildMunchkinOrcsTooToughPlacementScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [{ uid: 'orcs-too-tough-placement-1', defId: 'munchkin_orcs_too_tough', type: 'action', owner: '0' }],
        deck: deckCards('0', 'munchkin_orcs_sword_lord', 18),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 18),
        discard: [],
        factions: ['munchkin_orcs', 'pirates'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 30,
            nextUid: 3020,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_garrison',
                    minions: [minion('orcs-too-tough-placement-target', 'pirate_first_mate', '0', 3)],
                    ongoingActions: [],
                    monsters: [],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [minion('orcs-too-tough-placement-other', 'alien_scout', '1', 2)],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

type MunchkinMagesBaseSeed = {
    defId: string;
    minions: ReturnType<typeof minion>[];
    ongoingActions: Array<{ uid: string; defId: string; ownerId: string; talentUsed?: boolean }>;
    monsters: Array<{ uid: string; defId: string; controllerId?: string }>;
};

const mageCard = (uid: string, defId: string, type: 'action' | 'minion') => ({
    uid,
    defId,
    type,
    owner: '0',
});

const mageBase = (
    defId: string,
    minions: ReturnType<typeof minion>[] = [],
    ongoingActions: MunchkinMagesBaseSeed['ongoingActions'] = [],
    monsters: MunchkinMagesBaseSeed['monsters'] = [],
): MunchkinMagesBaseSeed => ({ defId, minions, ongoingActions, monsters });

const buildMunchkinMagesRemainingScene = (options: {
    hand: Array<ReturnType<typeof mageCard>>;
    bases: MunchkinMagesBaseSeed[];
    deck?: Array<{ uid: string; defId: string; type: string; owner: string }>;
    discard?: Array<{ uid: string; defId: string; type: string; owner: string }>;
    monsterDeck?: string[];
    minionsPlayed?: number;
    minionLimit?: number;
    actionsPlayed?: number;
    actionLimit?: number;
    nextUid?: number;
    turnNumber?: number;
}): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: options.hand,
        deck: options.deck ?? deckCards('0', 'munchkin_mages_scroll_shuffler', 8),
        discard: options.discard ?? [],
        factions: ['munchkin_mages', 'aliens'],
        minionsPlayed: options.minionsPlayed ?? 0,
        minionLimit: options.minionLimit ?? 1,
        actionsPlayed: options.actionsPlayed ?? 0,
        actionLimit: options.actionLimit ?? 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'pirate_first_mate', 12),
        discard: [],
        factions: ['pirates', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: options.turnNumber ?? 40,
            nextUid: options.nextUid ?? 4000,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: options.monsterDeck ?? MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: options.bases.map(base => base.defId),
            baseDiscard: [],
            bases: options.bases,
        },
    },
});

const buildMunchkinElvesFlowerChildScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [{ uid: 'elves-flower-1', defId: 'munchkin_elves_flower_child', type: 'minion', owner: '0' }],
        deck: deckCards('0', 'munchkin_elves_fae_fighter', 12),
        discard: [],
        factions: ['munchkin_elves', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'pirate_first_mate', 12),
        discard: [],
        factions: ['pirates', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 25,
            nextUid: 2500,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_mines',
                    minions: [
                        minion('elves-flower-weak', 'alien_invader', '1', 3),
                        minion('elves-flower-strong', 'pirate_buccaneer', '1', 4),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
                { defId: 'base_the_homeworld', minions: [], ongoingActions: [], monsters: [] },
            ],
        },
    },
});

const buildMunchkinElvesPumpingIronScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [{ uid: 'elves-pumping-1', defId: 'munchkin_elves_pumping_iron', type: 'action', owner: '0' }],
        deck: deckCards('0', 'munchkin_elves_fae_fighter', 12),
        discard: [],
        factions: ['munchkin_elves', 'aliens'],
        minionsPlayed: 1,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'pirate_first_mate', 12),
        discard: [],
        factions: ['pirates', 'ninjas'],
        minionsPlayed: 1,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 26,
            nextUid: 2600,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_mines',
                    minions: [
                        minion('elves-pumping-self', 'alien_invader', '0', 2),
                        minion('elves-pumping-other', 'pirate_buccaneer', '1', 2),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
                { defId: 'base_the_homeworld', minions: [], ongoingActions: [], monsters: [] },
            ],
        },
    },
});

const buildMunchkinElvesRunAwayMoreScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [{ uid: 'elves-run-more-1', defId: 'munchkin_elves_run_away_more', type: 'action', owner: '0' }],
        deck: deckCards('0', 'munchkin_elves_fae_fighter', 12),
        discard: [],
        factions: ['munchkin_elves', 'aliens'],
        minionsPlayed: 2,
        minionLimit: 2,
        actionsPlayed: 1,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'pirate_first_mate', 12),
        discard: [],
        factions: ['pirates', 'ninjas'],
        minionsPlayed: 1,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 27,
            nextUid: 2700,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_mines',
                    minions: [
                        minion('elves-run-more-a', 'alien_invader', '0', 10),
                        minion('elves-run-more-b', 'pirate_buccaneer', '0', 10),
                        minion('elves-run-more-opponent', 'munchkin_warriors_big_hero', '1', 1),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
                { defId: 'base_the_homeworld', minions: [], ongoingActions: [], monsters: [] },
            ],
        },
    },
});

const buildMunchkinElvesTreehouseScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [{ uid: 'elves-treehouse-minion-1', defId: 'alien_invader', type: 'minion', owner: '0' }],
        deck: deckCards('0', 'munchkin_elves_fae_fighter', 12),
        discard: [],
        factions: ['munchkin_elves', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: [
            { uid: 'elves-treehouse-draw-1', defId: 'pirate_first_mate', type: 'minion', owner: '1' },
            ...deckCards('1', 'pirate_first_mate', 10),
        ],
        discard: [],
        factions: ['pirates', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 28,
            nextUid: 2800,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                { defId: 'base_treehouse', minions: [], ongoingActions: [], monsters: [] },
                { defId: 'base_the_homeworld', minions: [], ongoingActions: [], monsters: [] },
            ],
        },
    },
});

const buildMunchkinElvesTradeScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [
            { uid: 'elves-trade-1', defId: 'munchkin_elves_trade', type: 'action', owner: '0' },
            { uid: 'elves-trade-keep', defId: 'alien_invader', type: 'minion', owner: '0' },
        ],
        deck: deckCards('0', 'munchkin_elves_fae_fighter', 12),
        discard: [],
        factions: ['munchkin_elves', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [{ uid: 'elves-trade-target', defId: 'pirate_first_mate', type: 'minion', owner: '1' }],
        deck: deckCards('1', 'pirate_first_mate', 12),
        discard: [],
        factions: ['pirates', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 29,
            nextUid: 2900,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                { defId: 'base_the_mines', minions: [], ongoingActions: [], monsters: [] },
                { defId: 'base_the_homeworld', minions: [], ongoingActions: [], monsters: [] },
            ],
        },
    },
});

const buildMunchkinElvesRunAwayScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [{ uid: 'elves-run-away-1', defId: 'munchkin_elves_run_away', type: 'action', owner: '0' }],
        deck: deckCards('0', 'munchkin_elves_fae_fighter', 12),
        discard: [],
        factions: ['munchkin_elves', 'aliens'],
        minionsPlayed: 1,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'pirate_first_mate', 12),
        discard: [],
        factions: ['pirates', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 30,
            nextUid: 3000,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_mines',
                    minions: [minion('elves-run-away-own', 'alien_invader', '0', 20)],
                    ongoingActions: [],
                    monsters: [],
                },
                { defId: 'base_the_homeworld', minions: [], ongoingActions: [], monsters: [] },
            ],
        },
    },
});

const buildMunchkinElvesFaeFighterScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '1',
    phase: 'playCards',
    player0: {
        hand: [],
        deck: deckCards('0', 'alien_invader', 10),
        discard: [],
        factions: ['aliens', 'pirates'],
        minionsPlayed: 1,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [{ uid: 'elves-fae-played-1', defId: 'alien_invader', type: 'minion', owner: '1' }],
        deck: deckCards('1', 'munchkin_elves_fae_fighter', 10),
        discard: [],
        factions: ['munchkin_elves', 'pirates'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 31,
            nextUid: 3100,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_mines', 'base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_mines',
                    minions: [
                        minion('elves-fae-1', 'munchkin_elves_fae_fighter', '0', 5),
                        minion('elves-fae-ally', 'alien_invader', '0', 2),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
                { defId: 'base_the_homeworld', minions: [], ongoingActions: [], monsters: [] },
            ],
        },
    },
});

const buildMunchkinElvesLordOfThePranceScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [],
        deck: [{ uid: 'elves-lord-draw-1', defId: 'alien_invader', type: 'minion', owner: '0' }],
        discard: [],
        factions: ['munchkin_elves', 'aliens'],
        minionsPlayed: 1,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: [{ uid: 'elves-lord-target-draw-1', defId: 'pirate_first_mate', type: 'minion', owner: '1' }],
        discard: [],
        factions: ['pirates', 'ninjas'],
        minionsPlayed: 1,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 32,
            nextUid: 3200,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_mines'],
            baseDiscard: [],
            bases: [{
                defId: 'base_the_mines',
                minions: [minion('elves-lord-1', 'munchkin_elves_lord_of_the_prance', '0', 4)],
                ongoingActions: [],
                monsters: [],
            }],
        },
    },
});

const buildMunchkinElvesHelpGuruScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [],
        deck: deckCards('0', 'alien_invader', 10),
        discard: [],
        factions: ['munchkin_elves', 'aliens'],
        minionsPlayed: 1,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'pirate_first_mate', 10),
        discard: [],
        factions: ['pirates', 'ninjas'],
        minionsPlayed: 1,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 33,
            nextUid: 3300,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_mines', 'base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_mines',
                    minions: [
                        minion('elves-guru-1', 'munchkin_elves_elf_help_guru', '0', 2),
                        minion('elves-guru-opponent', 'alien_invader', '1', 2),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
                {
                    defId: 'base_the_homeworld',
                    minions: [minion('elves-guru-other-base', 'pirate_first_mate', '1', 2)],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinElvesAfterYouScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [{ uid: 'elves-after-you-1', defId: 'munchkin_elves_after_you', type: 'action', owner: '0' }],
        deck: [
            { uid: 'elves-after-you-draw-1', defId: 'alien_invader', type: 'minion', owner: '0' },
            { uid: 'elves-after-you-draw-2', defId: 'pirate_first_mate', type: 'minion', owner: '0' },
        ],
        discard: [],
        factions: ['munchkin_elves', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: [{ uid: 'elves-after-you-other-1', defId: 'pirate_first_mate', type: 'minion', owner: '1' }],
        discard: [],
        factions: ['pirates', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 34,
            nextUid: 3400,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [{ defId: 'base_the_homeworld', minions: [], ongoingActions: [], monsters: [] }],
        },
    },
});

const buildMunchkinElvesDancingRootScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [{ uid: 'elves-dancing-root-1', defId: 'munchkin_elves_dancing_root', type: 'action', owner: '0' }],
        deck: [{ uid: 'elves-root-deck-1', defId: 'alien_invader', type: 'minion', owner: '0' }],
        discard: [{ uid: 'elves-root-discard-1', defId: 'pirate_first_mate', type: 'minion', owner: '0' }],
        factions: ['munchkin_elves', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: [],
        discard: [{ uid: 'elves-root-other-discard-1', defId: 'alien_invader', type: 'minion', owner: '1' }],
        factions: ['pirates', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 35,
            nextUid: 3500,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [{ defId: 'base_the_homeworld', minions: [], ongoingActions: [], monsters: [] }],
        },
    },
});

const buildMunchkinElvesHelpingHandsScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [{ uid: 'elves-helping-hands-1', defId: 'munchkin_elves_helping_hands', type: 'action', owner: '0' }],
        deck: deckCards('0', 'alien_invader', 12),
        discard: [],
        factions: ['munchkin_elves', 'aliens'],
        minionsPlayed: 1,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 2,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'pirate_first_mate', 12),
        discard: [],
        factions: ['pirates', 'ninjas'],
        minionsPlayed: 1,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 3,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 36,
            nextUid: 3600,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_mines', 'base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_mines',
                    minions: [
                        minion('elves-helping-own', 'alien_invader', '0', 10),
                        minion('elves-helping-target', 'pirate_first_mate', '1', 10),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
                { defId: 'base_the_homeworld', minions: [], ongoingActions: [], monsters: [] },
            ],
        },
    },
});

const buildMunchkinElvesTravelingElfScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [],
        deck: deckCards('0', 'alien_invader', 10),
        discard: [],
        factions: ['munchkin_elves', 'aliens'],
        minionsPlayed: 1,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'pirate_first_mate', 10),
        discard: [],
        factions: ['pirates', 'ninjas'],
        minionsPlayed: 1,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 37,
            nextUid: 3700,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_mines', 'base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_mines',
                    minions: [{
                        ...minion('elves-travel-host', 'alien_invader', '0', 3),
                        attachedActions: [{ uid: 'elves-travel-1', defId: 'munchkin_elves_traveling_elf', ownerId: '0', talentUsed: false }],
                    }],
                    ongoingActions: [],
                    monsters: [],
                },
                { defId: 'base_the_homeworld', minions: [], ongoingActions: [], monsters: [] },
            ],
        },
    },
});

const buildMunchkinElvesHelperHollowScene = (currentPlayer: '0' | '1'): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer,
    phase: 'playCards',
    player0: {
        hand: [],
        deck: deckCards('0', 'alien_invader', 10),
        discard: [],
        factions: ['munchkin_elves', 'aliens'],
        minionsPlayed: 1,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 6,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'pirate_first_mate', 10),
        discard: [],
        factions: ['pirates', 'ninjas'],
        minionsPlayed: 1,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 38,
            nextUid: 3800,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_helpers_hollow'],
            baseDiscard: [],
            bases: [{
                defId: 'base_helpers_hollow',
                minions: [
                    minion('elves-hollow-own', 'alien_invader', '0', 2),
                    minion('elves-hollow-other', 'pirate_first_mate', '1', 2),
                ],
                ongoingActions: [],
                monsters: [],
            }],
        },
    },
});

const buildMunchkinClericsRemoveCurseScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [{ uid: 'clerics-remove-curse-1', defId: 'munchkin_clerics_remove_curse', type: 'action', owner: '0' }],
        deck: deckCards('0', 'munchkin_clerics_cardinal', 12),
        discard: [],
        factions: ['munchkin_clerics', 'munchkin_warriors'],
        minionsPlayed: 1,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 12),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 1,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 5,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 42,
            nextUid: 4200,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [{
                defId: 'base_the_mines',
                minions: [{
                    ...minion('clerics-curse-host', 'munchkin_orcs_dork_orc', '1', 2),
                    attachedActions: [{ uid: 'clerics-imprisonment-1', defId: 'munchkin_clerics_curse_of_imprisonment', ownerId: '0', talentUsed: false }],
                }],
                ongoingActions: [{ uid: 'clerics-base-action-1', defId: 'munchkin_clerics_bin_and_gone', ownerId: '1' }],
                monsters: [],
            }],
        },
    },
});

const buildMunchkinClericsCardinalScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [{ uid: 'clerics-cardinal-hand-1', defId: 'alien_probe', type: 'action', owner: '0' }],
        deck: deckCards('0', 'munchkin_clerics_collection_plate', 12),
        discard: [
            { uid: 'clerics-cardinal-discard-1', defId: 'munchkin_clerics_collection_plate', type: 'action', owner: '0' },
            { uid: 'clerics-cardinal-discard-2', defId: 'munchkin_clerics_good_habits', type: 'action', owner: '0' },
            { uid: 'clerics-cardinal-discard-3', defId: 'munchkin_clerics_join_the_club', type: 'action', owner: '0' },
            { uid: 'clerics-cardinal-discard-4', defId: 'munchkin_clerics_remove_curse', type: 'action', owner: '0' },
            { uid: 'clerics-cardinal-discard-5', defId: 'munchkin_clerics_word_of_recall', type: 'action', owner: '0' },
        ],
        factions: ['munchkin_clerics', 'munchkin_warriors'],
        minionsPlayed: 1,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 12),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 1,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 5,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 49,
            nextUid: 4900,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [{
                defId: 'base_the_homeworld',
                minions: [minion('clerics-cardinal-1', 'munchkin_clerics_cardinal', '0', 5)],
                ongoingActions: [],
                monsters: [],
            }],
        },
    },
});

const buildMunchkinClericsCollectionPlateScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [{ uid: 'clerics-plate-1', defId: 'munchkin_clerics_collection_plate', type: 'action', owner: '0' }],
        deck: deckCards('0', 'munchkin_clerics_cardinal', 12),
        discard: [
            { uid: 'clerics-plate-discard-1', defId: 'munchkin_clerics_cardinal', type: 'minion', owner: '0' },
            { uid: 'clerics-plate-discard-2', defId: 'munchkin_clerics_good_habits', type: 'action', owner: '0' },
            { uid: 'clerics-plate-discard-3', defId: 'munchkin_clerics_join_the_club', type: 'action', owner: '0' },
            { uid: 'clerics-plate-discard-4', defId: 'munchkin_clerics_remove_curse', type: 'action', owner: '0' },
            { uid: 'clerics-plate-discard-5', defId: 'munchkin_clerics_word_of_recall', type: 'action', owner: '0' },
        ],
        factions: ['munchkin_clerics', 'munchkin_warriors'],
        minionsPlayed: 1,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 12),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 1,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 5,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 50,
            nextUid: 5000,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [{
                defId: 'base_the_homeworld',
                minions: [minion('clerics-plate-host', 'munchkin_clerics_cardinal', '0', 5)],
                ongoingActions: [],
                monsters: [],
            }],
        },
    },
});

const buildMunchkinClericsGoodHabitsScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [{ uid: 'clerics-habits-1', defId: 'munchkin_clerics_good_habits', type: 'action', owner: '0' }],
        deck: deckCards('0', 'munchkin_clerics_cardinal', 12),
        discard: [],
        factions: ['munchkin_clerics', 'munchkin_warriors'],
        minionsPlayed: 1,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 12),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 1,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 5,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 51,
            nextUid: 5100,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld', 'base_the_mothership'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_homeworld',
                    minions: [
                        minion('clerics-habits-own', 'munchkin_clerics_cardinal', '0', 5),
                        minion('clerics-habits-enemy', 'munchkin_orcs_dork_orc', '1', 2),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
                {
                    defId: 'base_the_mothership',
                    minions: [minion('clerics-habits-other-base', 'munchkin_orcs_dork_orc', '1', 2)],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinClericsJoinTheClubScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [{ uid: 'clerics-club-1', defId: 'munchkin_clerics_join_the_club', type: 'action', owner: '0' }],
        deck: deckCards('0', 'munchkin_clerics_cardinal', 12),
        discard: [],
        factions: ['munchkin_clerics', 'munchkin_warriors'],
        minionsPlayed: 1,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_sword_lord', 12),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 1,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 5,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 52,
            nextUid: 5200,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld', 'base_the_mothership'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_homeworld',
                    minions: [minion('clerics-club-base-0', 'munchkin_clerics_cardinal', '0', 5)],
                    ongoingActions: [],
                    monsters: [],
                },
                {
                    defId: 'base_the_mothership',
                    minions: [minion('clerics-club-base-1', 'munchkin_orcs_sword_lord', '1', 2)],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinClericsCurseScene = (curseDefId: string, cardUid: string): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [{ uid: cardUid, defId: curseDefId, type: 'action', owner: '0' }],
        deck: deckCards('0', 'munchkin_clerics_cardinal', 12),
        discard: [],
        factions: ['munchkin_clerics', 'munchkin_warriors'],
        minionsPlayed: 1,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 12),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 1,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 5,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 53,
            nextUid: 5300,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [{
                defId: 'base_the_homeworld',
                minions: [
                    minion('clerics-curse-target', 'munchkin_clerics_cardinal', '1', 5),
                    minion('clerics-curse-other', 'alien_invader', '0', 2),
                ],
                ongoingActions: [],
                monsters: [],
            }],
        },
    },
});

const buildMunchkinClericsDeepFriarScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [],
        deck: deckCards('0', 'munchkin_clerics_cardinal', 12),
        discard: [],
        factions: ['munchkin_clerics', 'munchkin_warriors'],
        minionsPlayed: 2,
        minionLimit: 2,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 12),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 5,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 43,
            nextUid: 4300,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld', 'base_the_mothership'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_homeworld',
                    minions: [
                        minion('clerics-friar-1', 'munchkin_clerics_deep_friar', '0', 4),
                        minion('clerics-friar-move', 'alien_invader', '0', 19),
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
                { defId: 'base_the_mothership', minions: [], ongoingActions: [], monsters: [] },
            ],
        },
    },
});

const buildMunchkinClericsTurnerScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [{ uid: 'clerics-turner-1', defId: 'munchkin_clerics_turner', type: 'minion', owner: '0' }],
        deck: deckCards('0', 'munchkin_clerics_cardinal', 12),
        discard: [{ uid: 'clerics-turner-discard-minion', defId: 'munchkin_clerics_cardinal', type: 'minion', owner: '0' }],
        factions: ['munchkin_clerics', 'munchkin_warriors'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 12),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 5,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 44,
            nextUid: 4400,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [{
                defId: 'base_the_homeworld',
                minions: [],
                ongoingActions: [],
                monsters: [
                    { uid: 'clerics-turner-undead', defId: 'munchkin_monster_ghoul' },
                    { uid: 'clerics-turner-living', defId: 'munchkin_monster_bigfoot' },
                ],
            }],
        },
    },
});

const buildMunchkinClericsHolyRollerScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [{ uid: 'clerics-holy-roller-1', defId: 'munchkin_clerics_holy_roller', type: 'minion', owner: '0' }],
        deck: [{ uid: 'clerics-holy-deck-1', defId: 'alien_invader', type: 'minion', owner: '0' }],
        discard: [{ uid: 'clerics-holy-discard-1', defId: 'pirate_first_mate', type: 'minion', owner: '0' }],
        factions: ['munchkin_clerics', 'munchkin_warriors'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 12),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 5,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 45,
            nextUid: 4500,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [{ defId: 'base_the_homeworld', minions: [], ongoingActions: [], monsters: [] }],
        },
    },
});

const buildMunchkinClericsBinAndGoneScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [],
        deck: deckCards('0', 'munchkin_clerics_cardinal', 12),
        discard: [],
        factions: ['munchkin_clerics', 'munchkin_warriors'],
        minionsPlayed: 1,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 12),
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 1,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 5,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 46,
            nextUid: 4600,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld', 'base_the_mothership'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_homeworld',
                    minions: [],
                    ongoingActions: [{ uid: 'clerics-bin-1', defId: 'munchkin_clerics_bin_and_gone', ownerId: '0' }],
                    monsters: [],
                },
                {
                    defId: 'base_the_mothership',
                    // 22 点足以让“母舰”（临界点 20）计分，但移动到“家园”（临界点 23）后不应触发第二次计分。
                    minions: [minion('clerics-bin-move', 'alien_invader', '0', 22)],
                    ongoingActions: [],
                    monsters: [],
                },
            ],
        },
    },
});

const buildMunchkinClericsHotelScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [],
        deck: [{ uid: 'clerics-hotel-deck-0', defId: 'munchkin_clerics_cardinal', type: 'minion', owner: '0' }],
        discard: [],
        factions: ['munchkin_clerics', 'munchkin_warriors'],
        minionsPlayed: 2,
        minionLimit: 2,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    player1: {
        hand: [],
        deck: [{ uid: 'clerics-hotel-deck-1', defId: 'munchkin_orcs_dork_orc', type: 'minion', owner: '1' }],
        discard: [],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 5,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 47,
            nextUid: 4700,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_hotel_of_holiness', 'base_the_mothership'],
            baseDiscard: [],
            bases: [{
                defId: 'base_hotel_of_holiness',
                minions: [
                    minion('clerics-hotel-own', 'alien_invader', '0', 10),
                    minion('clerics-hotel-other', 'pirate_first_mate', '1', 10),
                ],
                ongoingActions: [],
                monsters: [],
            }, { defId: 'base_the_mothership', minions: [], ongoingActions: [], monsters: [] }],
        },
    },
});

const buildMunchkinClericsWordRecallScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [{ uid: 'clerics-recall-1', defId: 'munchkin_clerics_word_of_recall', type: 'action', owner: '0' }],
        deck: deckCards('0', 'munchkin_clerics_cardinal', 12),
        discard: [],
        factions: ['munchkin_clerics', 'munchkin_warriors'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'munchkin_orcs_dork_orc', 12),
        discard: [{ uid: 'clerics-recall-target', defId: 'munchkin_clerics_collection_plate', type: 'action', owner: '1' }],
        factions: ['munchkin_orcs', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 5,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 48,
            nextUid: 4800,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: MUNCHKIN_TREASURE_DECK_DEF_IDS,
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [{ defId: 'base_the_homeworld', minions: [], ongoingActions: [], monsters: [] }],
        },
    },
});

type WarriorsSceneOptions = {
    hand: Array<{ uid: string; defId: string; type: 'minion' | 'action'; owner: '0' }>;
    bases: Array<{
        defId: string;
        minions: ReturnType<typeof minion>[];
        ongoingActions: Array<{ uid: string; defId: string; ownerId: '0' | '1' }>;
        monsters: Array<{ uid: string; defId: string; controllerId?: string }>;
    }>;
    monsterDeck: string[];
    treasureDeck: string[];
    turnNumber: number;
    actionLimit?: number;
};

const buildMunchkinWarriorsScene = (options: WarriorsSceneOptions): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: options.hand,
        deck: deckCards('0', 'munchkin_warriors_berserker', 14),
        discard: [],
        factions: ['munchkin_warriors', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: options.actionLimit ?? 1,
        vp: 4,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'pirate_first_mate', 14),
        discard: [],
        factions: ['pirates', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 3,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: options.turnNumber,
            nextUid: options.turnNumber * 100,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: options.monsterDeck,
            treasureDeck: options.treasureDeck,
            baseDeck: options.bases.map(base => base.defId),
            baseDiscard: [],
            bases: options.bases,
        },
    },
});

const buildMunchkinWarriorsBigHeroScene = (): SmashUpSceneConfig => buildMunchkinWarriorsScene({
    hand: [{ uid: 'warriors-big-hero-hand', defId: 'munchkin_warriors_campaign', type: 'action', owner: '0' }],
    monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
    treasureDeck: ['munchkin_treasure_dwarf_hireling', 'munchkin_treasure_spiky_boots', 'munchkin_treasure_wishing_ring'],
    turnNumber: 61,
    bases: [
        {
            defId: 'base_the_homeworld',
            minions: [
                minion('warriors-star-player', 'munchkin_warriors_star_player', '0', 4),
                minion('warriors-big-hero', 'munchkin_warriors_big_hero', '0', 5),
            ],
            ongoingActions: [{ uid: 'warriors-full-sail', defId: 'pirate_full_sail', ownerId: '0' }],
            monsters: [
                { uid: 'warriors-big-hero-monster-a', defId: 'munchkin_monster_bigfoot' },
                { uid: 'warriors-big-hero-monster-b', defId: 'munchkin_monster_ghoul' },
            ],
        },
        {
            defId: 'base_the_gauntlet',
            minions: [minion('warriors-other-base-minion', 'pirate_first_mate', '1', 2)],
            ongoingActions: [],
            monsters: [],
        },
    ],
});

const buildMunchkinWarriorsCleaveScene = (): SmashUpSceneConfig => buildMunchkinWarriorsScene({
    hand: [{ uid: 'warriors-cleave-action', defId: 'munchkin_warriors_cleave', type: 'action', owner: '0' }],
    monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
    treasureDeck: ['munchkin_treasure_dwarf_hireling', 'munchkin_treasure_spiky_boots'],
    turnNumber: 62,
    bases: [
        {
            defId: 'base_bastion',
            minions: [minion('warriors-cleave-ally', 'alien_invader', '0', 2)],
            ongoingActions: [{ uid: 'warriors-cleave-ongoing', defId: 'pirate_full_sail', ownerId: '1' }],
            monsters: [{ uid: 'warriors-cleave-monster', defId: 'munchkin_monster_ghoul' }],
        },
        { defId: 'base_the_homeworld', minions: [], ongoingActions: [], monsters: [] },
    ],
});

const buildMunchkinWarriorsWarCryScene = (): SmashUpSceneConfig => buildMunchkinWarriorsScene({
    hand: [{ uid: 'warriors-war-cry-action', defId: 'munchkin_warriors_war_cry', type: 'action', owner: '0' }],
    monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
    treasureDeck: ['munchkin_treasure_dwarf_hireling', 'munchkin_treasure_spiky_boots'],
    turnNumber: 63,
    bases: [
        {
            defId: 'base_the_homeworld',
            minions: [
                minion('warriors-war-cry-own', 'alien_invader', '0', 2),
                minion('warriors-war-cry-other', 'pirate_first_mate', '1', 3),
            ],
            ongoingActions: [{ uid: 'warriors-war-cry-ongoing', defId: 'pirate_full_sail', ownerId: '0' }],
            monsters: [{ uid: 'warriors-war-cry-monster-a', defId: 'munchkin_monster_bigfoot' }],
        },
        {
            defId: 'base_the_gauntlet',
            minions: [minion('warriors-war-cry-other-base', 'pirate_first_mate', '1', 2)],
            ongoingActions: [],
            monsters: [{ uid: 'warriors-war-cry-monster-other-base', defId: 'munchkin_monster_pegasus' }],
        },
    ],
});

const buildMunchkinWarriorsBerserkerScene = (): SmashUpSceneConfig => buildMunchkinWarriorsScene({
    hand: [{ uid: 'warriors-berserker-hand', defId: 'munchkin_warriors_berserker', type: 'minion', owner: '0' }],
    monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
    treasureDeck: ['munchkin_treasure_dwarf_hireling'],
    turnNumber: 65,
    bases: [
        {
            defId: 'base_bastion',
            minions: [],
            ongoingActions: [],
            monsters: [{ uid: 'warriors-berserker-monster', defId: 'munchkin_monster_ghoul' }],
        },
        { defId: 'base_the_homeworld', minions: [], ongoingActions: [], monsters: [] },
    ],
});

const buildMunchkinWarriorsTaunterScene = (): SmashUpSceneConfig => buildMunchkinWarriorsScene({
    hand: [{ uid: 'warriors-taunter-hand', defId: 'munchkin_warriors_taunter', type: 'minion', owner: '0' }],
    monsterDeck: ['munchkin_monster_bigfoot', 'munchkin_monster_ghoul'],
    treasureDeck: ['munchkin_treasure_dwarf_hireling'],
    turnNumber: 66,
    bases: [
        { defId: 'base_the_homeworld', minions: [], ongoingActions: [], monsters: [] },
        { defId: 'base_the_gauntlet', minions: [], ongoingActions: [], monsters: [] },
    ],
});

const buildMunchkinWarriorsCampaignScene = (): SmashUpSceneConfig => buildMunchkinWarriorsScene({
    hand: [{ uid: 'warriors-campaign-hand', defId: 'munchkin_warriors_campaign', type: 'action', owner: '0' }],
    monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
    treasureDeck: ['munchkin_treasure_dwarf_hireling'],
    turnNumber: 67,
    bases: [
        {
            defId: 'base_bastion',
            minions: [minion('warriors-campaign-boosted', 'pirate_first_mate', '0', 2)],
            ongoingActions: [],
            monsters: [{ uid: 'warriors-campaign-monster', defId: 'munchkin_monster_bigfoot' }],
        },
        {
            defId: 'base_the_homeworld',
            minions: [minion('warriors-campaign-unboosted', 'pirate_first_mate', '0', 2)],
            ongoingActions: [],
            monsters: [],
        },
    ],
});

const buildMunchkinWarriorsDungeonBaitScene = (): SmashUpSceneConfig => buildMunchkinWarriorsScene({
    hand: [{ uid: 'warriors-dungeon-bait-hand', defId: 'munchkin_warriors_dungeon_bait', type: 'action', owner: '0' }],
    monsterDeck: ['munchkin_monster_bigfoot'],
    treasureDeck: ['munchkin_treasure_dwarf_hireling'],
    turnNumber: 68,
    bases: [
        {
            defId: 'base_bastion',
            minions: [minion('warriors-dungeon-bait-target', 'pirate_first_mate', '1', 2)],
            ongoingActions: [],
            monsters: [],
        },
        { defId: 'base_the_homeworld', minions: [], ongoingActions: [], monsters: [] },
    ],
});

const buildMunchkinWarriorsOngoingScene = (): SmashUpSceneConfig => buildMunchkinWarriorsScene({
    hand: [
        { uid: 'warriors-dumbbells-hand', defId: 'munchkin_warriors_dumbbells', type: 'action', owner: '0' },
        { uid: 'warriors-shield-hand', defId: 'munchkin_warriors_shield_of_ubiquity', type: 'action', owner: '0' },
    ],
    monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
    treasureDeck: ['munchkin_treasure_dwarf_hireling'],
    turnNumber: 69,
    actionLimit: 2,
    bases: [
        {
            defId: 'base_the_homeworld',
            minions: [
                minion('warriors-ongoing-host', 'pirate_first_mate', '0', 2),
                minion('warriors-ongoing-bystander', 'pirate_first_mate', '1', 2),
            ],
            ongoingActions: [],
            monsters: [{ uid: 'warriors-ongoing-monster', defId: 'munchkin_monster_bigfoot' }],
        },
        { defId: 'base_the_gauntlet', minions: [], ongoingActions: [], monsters: [] },
    ],
});

const buildMunchkinWarriorsEternalHeroScene = (): SmashUpSceneConfig => ({
    gameId: 'smashup',
    currentPlayer: '0',
    phase: 'playCards',
    player0: {
        hand: [],
        deck: deckCards('0', 'munchkin_warriors_berserker', 14),
        discard: [],
        factions: ['munchkin_warriors', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 4,
    },
    player1: {
        hand: [],
        deck: deckCards('1', 'pirate_first_mate', 14),
        discard: [],
        factions: ['pirates', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 3,
    },
    extra: {
        core: {
            turnOrder: ['0', '1'],
            seatOrder: ['0', '1'],
            turnNumber: 70,
            nextUid: 7000,
            deckQueryEnabled: false,
            enabledExpansions: ['munchkin'],
            monsterDeck: MUNCHKIN_MONSTER_DECK_DEF_IDS,
            treasureDeck: ['munchkin_treasure_wishing_ring'],
            baseDeck: ['base_the_homeworld'],
            baseDiscard: [],
            bases: [
                {
                    defId: 'base_the_homeworld',
                    minions: [
                        {
                            ...minion('warriors-eternal-host', 'alien_invader', '0', 2),
                            attachedActions: [
                                {
                                    uid: 'warriors-eternal-hero',
                                    defId: 'munchkin_warriors_eternal_hero',
                                    ownerId: '0',
                                },
                                {
                                    uid: 'warriors-eternal-other-action',
                                    defId: 'pirate_full_sail',
                                    ownerId: '1',
                                },
                                {
                                    uid: 'warriors-eternal-magic-missile',
                                    defId: 'munchkin_treasure_magic_missile',
                                    ownerId: '0',
                                    talentUsed: false,
                                },
                            ],
                        },
                    ],
                    ongoingActions: [],
                    monsters: [],
                },
                { defId: 'base_the_gauntlet', minions: [], ongoingActions: [], monsters: [] },
            ],
        },
    },
});

const buildMunchkinWarriorsBaseTriggerScene = (): SmashUpSceneConfig => buildMunchkinWarriorsScene({
    hand: [],
    monsterDeck: ['munchkin_monster_bigfoot'],
    treasureDeck: ['munchkin_treasure_spiky_boots'],
    turnNumber: 71,
    bases: [
        {
            defId: 'base_bastion',
            minions: [minion('warriors-bastion-defeater', 'alien_invader', '0', 5)],
            ongoingActions: [],
            monsters: [{ uid: 'warriors-bastion-monster', defId: 'munchkin_monster_ghoul' }],
        },
        {
            defId: 'base_the_gauntlet',
            minions: [minion('warriors-gauntlet-defeater', 'alien_invader', '0', 5)],
            ongoingActions: [],
            monsters: [{ uid: 'warriors-gauntlet-monster', defId: 'munchkin_monster_ghoul' }],
        },
    ],
});

const buildMunchkinWarriorsRuckusScene = (): SmashUpSceneConfig => buildMunchkinWarriorsScene({
    hand: [{ uid: 'warriors-ruckus-action', defId: 'munchkin_warriors_ruckus', type: 'action', owner: '0' }],
    monsterDeck: ['munchkin_monster_bigfoot', 'munchkin_monster_ghoul', 'munchkin_monster_pegasus'],
    treasureDeck: ['munchkin_treasure_dwarf_hireling', 'munchkin_treasure_spiky_boots'],
    turnNumber: 64,
    bases: [
        {
            defId: 'base_bastion',
            minions: [minion('warriors-ruckus-own', 'alien_invader', '0', 2)],
            ongoingActions: [{ uid: 'warriors-ruckus-ongoing', defId: 'pirate_full_sail', ownerId: '0' }],
            monsters: [{ uid: 'warriors-ruckus-monster', defId: 'munchkin_monster_bigfoot' }],
        },
        {
            defId: 'base_the_gauntlet',
            minions: [minion('warriors-ruckus-other-base', 'pirate_first_mate', '1', 2)],
            ongoingActions: [],
            monsters: [{ uid: 'warriors-ruckus-other-monster', defId: 'munchkin_monster_ghoul' }],
        },
    ],
});

test.describe('大杀四方 Munchkin 怪物与宝藏 UI', () => {
    test('怪物行和公共小牌堆不抢原版布局', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinMonsterTreasureScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-special-supply-row')).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await expect(page.getByTestId('su-base-monster-row-0')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-monster-uid]')).toHaveCount(3);
        await expect(page.getByTestId('su-base-titan-titan-on-base-0')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-ongoing-uid="ongoing-full-sail-0"]')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-testid="su-munchkin-monster-discard"]')).toHaveCount(0);
        await expect(page.locator('[data-testid="su-munchkin-treasure-discard"]')).toHaveCount(0);

        const layoutEvidence = await page.evaluate(() => {
            const rectOf = (selector: string) => {
                const element = document.querySelector<HTMLElement>(selector);
                if (!element) return null;
                const rect = element.getBoundingClientRect();
                return {
                    top: rect.top,
                    bottom: rect.bottom,
                    left: rect.left,
                    right: rect.right,
                    width: rect.width,
                    height: rect.height,
                };
            };
            const monsterRow = rectOf('[data-testid="su-base-monster-row-0"]');
            const baseCard = rectOf('[data-base-index="0"]');
            const playerColumn = rectOf('[data-testid="su-base-player-column-0-0"]');
            const titanOnBase = rectOf('[data-testid="su-base-titan-titan-on-base-0"]');
            const ongoing = rectOf('[data-ongoing-uid="ongoing-full-sail-0"]');
            const supplyRow = rectOf('[data-testid="su-special-supply-row"]');
            const deckStack = rectOf('[data-testid="su-deck-stack"]');

            return {
                monsterBelowBase: !!monsterRow && !!baseCard && monsterRow.top >= baseCard.bottom - 8,
                monsterAbovePlayerColumn: !!monsterRow && !!playerColumn && monsterRow.bottom <= playerColumn.top + 12,
                titanAboveBase: !!titanOnBase && !!baseCard && titanOnBase.bottom <= baseCard.top + 90,
                ongoingAboveBase: !!ongoing && !!baseCard && ongoing.bottom <= baseCard.top + 90,
                supplyAttachedToDeck: !!supplyRow && !!deckStack && supplyRow.bottom <= deckStack.top + 60,
            };
        });

        expect(layoutEvidence, '怪物行应位于基地卡下方、玩家随从列上方；泰坦/持续行动仍在基地上方；公共小牌堆挂在抽牌堆旁').toEqual({
            monsterBelowBase: true,
            monsterAbovePlayerColumn: true,
            titanAboveBase: true,
            ongoingAboveBase: true,
            supplyAttachedToDeck: true,
        });

        await page.waitForTimeout(800);
        await game.screenshot('01-当前实现-怪物行和公共牌堆', testInfo);

        const treasureDragon = page.locator('[data-monster-uid="monster-dragon-0"][data-defeatable-monster="true"]');
        await expect(treasureDragon).toBeVisible({ timeout: 15000 });
        const treasureDragonBox = await treasureDragon.boundingBox();
        expect(treasureDragonBox, '宝藏龙怪物卡应有可点击的露出切片').not.toBeNull();
        await page.mouse.click(
            treasureDragonBox!.x + Math.max(8, treasureDragonBox!.width * 0.16),
            treasureDragonBox!.y + treasureDragonBox!.height * 0.5,
        );

        await expect(page.locator('[data-monster-uid="monster-dragon-0"]')).toHaveCount(0);
        await expect(page.locator('[data-monster-uid]')).toHaveCount(2);
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 19');
        await expect(page.locator('[data-card-uid^="munchkin_treasure_"]')).toHaveCount(3);

        await page.waitForTimeout(800);
        await game.screenshot('02-点击怪物后宝藏进入手牌', testInfo);

        const core = await readCoreState(page) as {
            bases: Array<{ monsters?: Array<{ uid: string; defId: string }> }>;
            players: Record<string, { hand: Array<{ uid: string; defId: string; type: string }> }>;
            monsterDiscard?: string[];
            treasureDeck?: string[];
        };
        expect(core.bases[0].monsters?.map(monster => monster.uid)).toEqual(['monster-bigfoot-0', 'monster-ghoul-0']);
        expect(core.monsterDiscard).toContain('munchkin_monster_treasure_dragon');
        expect(core.players['0'].hand.filter(card => card.uid.startsWith('munchkin_treasure_')).map(card => card.defId)).toEqual([
            'munchkin_treasure_dwarf_hireling',
            'munchkin_treasure_halfling_hireling',
            'munchkin_treasure_tiger_steed',
        ]);
        expect(core.players['0'].hand.filter(card => card.uid.startsWith('munchkin_treasure_')).map(card => card.type)).toEqual([
            'minion',
            'minion',
            'minion',
        ]);
        expect(core.treasureDeck).toHaveLength(19);
    });

    test('活死人骑士和图坦卡蒙可从真实怪物行逐张手动击败并领取宝藏', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinRemainingMonsterCoverageScene());

        await expect(page.getByTestId('su-base-monster-row-0')).toBeVisible({ timeout: 15000 });
        await expect(page.getByRole('button', { name: '击败活死人骑士' })).toBeVisible({ timeout: 15000 });
        await expect(page.getByRole('button', { name: '击败图坦卡蒙' })).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 4');
        await hideSmashUpDebugPanelForEvidence(page);
        await page.waitForTimeout(800);
        await game.screenshot('活死人骑士和图坦卡蒙-逐张击败前', testInfo);

        await clickManualMonsterChoice(page, 'remaining-undead-horseman', '活死人骑士');
        await waitForSmashUpFxToSettle(page);
        await expect(page.locator('[data-monster-uid="remaining-undead-horseman"]')).toHaveCount(0);
        await expect(page.locator('[data-monster-uid="remaining-tutankhamen"]')).toHaveCount(1);
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 2');
        await expect(page.locator('[data-card-uid^="munchkin_treasure_"]')).toHaveCount(2);
        await hideSmashUpDebugPanelForEvidence(page);
        await page.waitForTimeout(800);
        await game.screenshot('活死人骑士和图坦卡蒙-击败活死人骑士后', testInfo);

        await clickManualMonsterChoice(page, 'remaining-tutankhamen', '图坦卡蒙');
        await waitForSmashUpFxToSettle(page);
        await expect(page.locator('[data-monster-uid]')).toHaveCount(0);
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 0');
        await expect(page.locator('[data-card-uid^="munchkin_treasure_"]')).toHaveCount(4);

        const core = (await game.getState()).core as {
            players: Record<string, { hand: Array<{ defId: string }> }>;
            monsterDiscard?: string[];
            treasureDeck?: string[];
            bases: Array<{ monsters?: Array<{ defId: string }> }>;
        };
        expect(core.bases[0].monsters).toEqual([]);
        expect(core.monsterDiscard).toEqual([
            'munchkin_monster_undead_horseman',
            'munchkin_monster_tutankhamen',
        ]);
        expect(core.players['0'].hand.map(card => card.defId)).toEqual([
            'munchkin_treasure_dwarf_hireling',
            'munchkin_treasure_halfling_hireling',
            'munchkin_treasure_tiger_steed',
            'munchkin_treasure_bag_of_caltrops',
        ]);
        expect(core.treasureDeck).toEqual([]);

        await hideSmashUpDebugPanelForEvidence(page);
        await page.waitForTimeout(800);
        await game.screenshot('活死人骑士和图坦卡蒙-全部击败后', testInfo);
    });

    test('Munchkin 新 UI 移动端横屏保留怪物行与公共小牌堆入口', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 844, height: 390 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinMonsterTreasureScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-special-supply-row')).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await expect(page.getByTestId('su-base-monster-row-0')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-monster-uid]')).toHaveCount(3);
        await expect(page.getByTestId('su-base-titan-titan-on-base-0')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-ongoing-uid="ongoing-full-sail-0"]')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-testid="su-munchkin-monster-discard"]')).toHaveCount(0);
        await expect(page.locator('[data-testid="su-munchkin-treasure-discard"]')).toHaveCount(0);

        const mobileLayoutEvidence = await page.evaluate(() => {
            const rectOf = (selector: string) => {
                const element = document.querySelector<HTMLElement>(selector);
                if (!element) return null;
                const rect = element.getBoundingClientRect();
                return {
                    top: rect.top,
                    bottom: rect.bottom,
                    left: rect.left,
                    right: rect.right,
                    width: rect.width,
                    height: rect.height,
                };
            };
            const monsterRow = rectOf('[data-testid="su-base-monster-row-0"]');
            const baseCard = rectOf('[data-base-index="0"]');
            const playerColumn = rectOf('[data-testid="su-base-player-column-0-0"]');
            const hand = rectOf('[data-testid="su-hand-area"]');
            const supply = rectOf('[data-testid="su-special-supply-row"]');
            const endTurn = rectOf('button[aria-label*="结束回合"], button[aria-label*="End turn"]');
            const withinViewport = (rect: ReturnType<typeof rectOf>) => !!rect
                && rect.left >= -2
                && rect.right <= window.innerWidth + 2
                && rect.top >= -2
                && rect.bottom <= window.innerHeight + 2;

            return {
                monsterBelowBase: !!monsterRow && !!baseCard && monsterRow.top >= baseCard.bottom - 8,
                monsterAbovePlayerColumn: !!monsterRow && !!playerColumn && monsterRow.bottom <= playerColumn.top + 12,
                handVisibleInViewport: withinViewport(hand),
                supplyVisibleInViewport: withinViewport(supply),
                endTurnVisibleInViewport: withinViewport(endTurn),
                noUnexpectedOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
            };
        });

        expect(mobileLayoutEvidence, '移动端怪物行、公共小牌堆、手牌和结束回合入口应保持可见且不产生横向溢出').toEqual({
            monsterBelowBase: true,
            monsterAbovePlayerColumn: true,
            handVisibleInViewport: true,
            supplyVisibleInViewport: true,
            endTurnVisibleInViewport: true,
            noUnexpectedOverflow: true,
        });

        await game.screenshot('移动端横屏-怪物行和公共小牌堆不抢原版布局', testInfo);
    });

    test('尖刺靴移动端横屏可从手牌手动选择宿主并收口', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 844, height: 390 });
        await page.addInitScript(() => {
            (window as Window & { __BG_FORCE_COARSE_POINTER__?: boolean }).__BG_FORCE_COARSE_POINTER__ = true;
        });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinSpikyBootsScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="spiky-boots-hand-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="spiky-host"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="spiky-bystander"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('移动端-尖刺靴-选择前', testInfo);

        await page.locator('[data-card-uid="spiky-boots-hand-1"]').first().click({ force: true });
        await page.waitForTimeout(400);
        await expectManualMinionChoiceVisible(
            page,
            'spiky-host',
            '移动端尖刺靴必须显示真实宿主随从供玩家手动选择',
            { forbidPromptContext: true },
        );
        await game.screenshot('移动端-尖刺靴-手动选择宿主', testInfo);

        await clickManualMinionChoice(page, 'spiky-host', '移动端尖刺靴选择宿主');
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect(page.locator('[data-attached-action-uid="spiky-boots-hand-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-minion-power-badge-spiky-host')).toHaveAttribute('title', /尖刺靴: \+1/);
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');

        const mobileResolutionEvidence = await page.evaluate(() => ({
            noUnexpectedOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
            handVisible: (() => {
                const rect = document.querySelector<HTMLElement>('[data-testid="su-hand-area"]')?.getBoundingClientRect();
                return !!rect && rect.left >= -2 && rect.right <= window.innerWidth + 2 && rect.bottom <= window.innerHeight + 2;
            })(),
            hostVisible: (() => {
                const rect = document.querySelector<HTMLElement>('[data-minion-uid="spiky-host"]')?.getBoundingClientRect();
                return !!rect && rect.width > 24 && rect.height > 24 && rect.left >= -2 && rect.right <= window.innerWidth + 2;
            })(),
            supplyVisible: (() => {
                const rect = document.querySelector<HTMLElement>('[data-testid="su-special-supply-row"]')?.getBoundingClientRect();
                return !!rect && rect.left >= -2 && rect.right <= window.innerWidth + 2;
            })(),
        }));
        expect(mobileResolutionEvidence, '移动端尖刺靴结算后应保留手牌区、宿主和公共小牌堆且无横向溢出').toEqual({
            noUnexpectedOverflow: true,
            handVisible: true,
            hostVisible: true,
            supplyVisible: true,
        });
        await game.screenshot('移动端-尖刺靴-附着后收口', testInfo);
    });

    test('火箭靴移动端横屏无需悬停即可手动选择目标基地并移动宿主', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 844, height: 390 });
        await page.addInitScript(() => {
            (window as Window & { __BG_FORCE_COARSE_POINTER__?: boolean }).__BG_FORCE_COARSE_POINTER__ = true;
        });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinRocketBootsScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        const host = page.locator('[data-minion-uid="rocket-host"]').first();
        const rocketBoots = page.locator('[data-attached-action-uid="rocket-boots-1"]').first();
        await expect(host).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('移动端-火箭靴-宿主与附着卡收起', testInfo);

        await host.click({ force: true });
        await expect(host).toHaveAttribute('data-attached-overlay-visible', 'true');
        await expect(rocketBoots, '移动端点击宿主后附着行动卡必须可见').toBeVisible({ timeout: 15000 });
        await game.screenshot('移动端-火箭靴-点击宿主展开附着卡', testInfo);

        await rocketBoots.click({ force: true });
        await game.waitForInteraction('munchkin_treasure_rocket_boots_move', 10000);
        await expectManualChoiceVisible(
            page,
            '[data-base-index="1"]',
            '移动端火箭靴必须显示目标基地本体供玩家手动选择',
            { forbidPromptContext: true },
        );
        await game.screenshot('移动端-火箭靴-手动选择目标基地', testInfo);

        await clickManualBaseChoice(page, 1, '移动端火箭靴选择目标基地');
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const sourceUids = core.bases[0].minions.map(minion => minion.uid);
            const targetHost = core.bases[1].minions.find(minion => minion.uid === 'rocket-host');
            const rocket = targetHost?.attachedActions?.find(action => action.uid === 'rocket-boots-1');
            return {
                sourceUids,
                targetHasHost: Boolean(targetHost),
                targetHasRocketBoots: rocket?.defId === 'munchkin_treasure_rocket_boots',
                rocketTalentUsed: rocket?.talentUsed === true,
                triggerQueueLength: core.triggerQueue?.length ?? 0,
            };
        }, { timeout: 10000 }).toEqual({
            sourceUids: [],
            targetHasHost: true,
            targetHasRocketBoots: true,
            rocketTalentUsed: true,
            triggerQueueLength: 0,
        });

        const mobileResolutionEvidence = await page.evaluate(() => ({
            noUnexpectedOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
            targetBaseVisible: (() => {
                const rect = document.querySelector<HTMLElement>('[data-base-index="1"]')?.getBoundingClientRect();
                return !!rect && rect.width > 24 && rect.height > 24 && rect.left >= -2 && rect.right <= window.innerWidth + 2;
            })(),
            hostVisible: (() => {
                const rect = document.querySelector<HTMLElement>('[data-minion-uid="rocket-host"]')?.getBoundingClientRect();
                return !!rect && rect.width > 24 && rect.height > 24 && rect.left >= -2 && rect.right <= window.innerWidth + 2;
            })(),
        }));
        expect(mobileResolutionEvidence, '移动端火箭靴收口后目标基地和宿主应可见且无横向溢出').toEqual({
            noUnexpectedOverflow: true,
            targetBaseVisible: true,
            hostVisible: true,
        });
        await game.screenshot('移动端-火箭靴-宿主与附着卡移动后', testInfo);
    });

    test('直线跑路药水移动端横屏可手动选择计分后展示的宝藏', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 844, height: 390 });
        await page.addInitScript(() => {
            (window as Window & { __BG_FORCE_COARSE_POINTER__?: boolean }).__BG_FORCE_COARSE_POINTER__ = true;
        });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinStraightLineRunningAwayScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="straight-line-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-monster-uid="straight-line-treasure-dragon"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 4');
        await game.screenshot('移动端-直线跑路药水-计分前', testInfo);

        await game.advancePhase();
        await game.waitForPhase('scoreBases', 10000);
        await page.waitForFunction(
            () => {
                const state = (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.();
                return state?.core?.pendingMunchkinTreasureReward?.treasureCards?.length === 3
                    && (
                        state?.sys?.interaction?.current?.data?.sourceId === 'smashup_reaction_choose'
                        || Boolean(state?.sys?.responseWindow?.current?.windowType)
                    );
            },
            { timeout: 15000, polling: 200 },
        );

        for (let attempt = 0; attempt < 8; attempt += 1) {
            const status = await getReactionWindowStatus(page);
            const options = status.sourceId === 'smashup_reaction_choose'
                ? await game.getInteractionOptions() as InteractionOption[]
                : [];
            const hasStraightLineOption = status.windowType === 'afterScoring'
                && options.some((option) =>
                    option.value?.kind === 'play_action'
                    && option.value?.cardUid === 'straight-line-1'
                );
            if (hasStraightLineOption) break;

            const didPass = await passOpenReactionOrResponseWindowVisibly(
                page,
                game,
                `移动端直线跑路药水前置响应让过 ${attempt + 1}`,
            );
            expect(didPass, '移动端等待 afterScoring 直线跑路药水入口时必须存在可见让过按钮或选项').toBe(true);
            await page.waitForTimeout(300);
        }

        await expect.poll(async () => {
            const status = await getReactionWindowStatus(page);
            const options = status.sourceId === 'smashup_reaction_choose'
                ? await game.getInteractionOptions() as InteractionOption[]
                : [];
            return {
                windowType: status.windowType,
                hasStraightLineOption: options.some((option) =>
                    option.value?.kind === 'play_action'
                    && option.value?.cardUid === 'straight-line-1'
                ),
            };
        }, { timeout: 10000 }).toEqual({
            windowType: 'afterScoring',
            hasStraightLineOption: true,
        });
        await expectCenteredSmashUpReactionPrompt(
            page,
            '移动端直线跑路药水 afterScoring 响应窗口必须沿用 PC 同构居中弹窗，不得回到停靠提示条',
        );
        await game.screenshot('移动端-直线跑路药水-afterScoring响应入口', testInfo);

        await clickVisibleInteractionOptionBy(
            page,
            game,
            (option: InteractionOption) =>
                option.value?.kind === 'play_action'
                && option.value?.cardUid === 'straight-line-1',
            '移动端 afterScoring 手动选择直线跑路药水',
        );
        await game.waitForInteraction('munchkin_treasure_potion_of_straight_line_running_away_choose_treasure', 10000);

        const treasureOptions = await game.getInteractionOptions() as InteractionOption[];
        const targetTreasureOption = treasureOptions.find((option) =>
            option.value?.treasureDefId === 'munchkin_treasure_bag_of_caltrops'
        );
        expect(targetTreasureOption?.id, '移动端直线跑路药水必须暴露已展示宝藏的真实可选项').toBeTruthy();
        await expectManualChoiceVisible(
            page,
            `[data-option-id="${targetTreasureOption!.id}"]`,
            '移动端直线跑路药水必须显示已展示宝藏卡面供玩家手动选择',
            { allowPromptCardGrid: true, forbidPromptContext: true },
        );

        const treasureChoiceLayout = await page.evaluate((optionId) => {
            const grid = document.querySelector<HTMLElement>('[data-testid="prompt-card-grid"]');
            const target = document.querySelector<HTMLElement>(`[data-option-id="${optionId}"]`);
            return {
                noUnexpectedOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
                gridVisible: Boolean(grid && grid.getBoundingClientRect().width > 24 && grid.getBoundingClientRect().height > 24),
                targetVisible: Boolean(target && target.getBoundingClientRect().width > 24 && target.getBoundingClientRect().height > 24),
                targetInViewport: (() => {
                    const rect = target?.getBoundingClientRect();
                    return !!rect
                        && rect.left >= -2
                        && rect.right <= window.innerWidth + 2
                        && rect.top >= -2
                        && rect.bottom <= window.innerHeight + 2;
                })(),
            };
        }, targetTreasureOption!.id);
        expect(treasureChoiceLayout, '移动端直线跑路药水的宝藏选择层必须可见、可点且不横向溢出').toEqual({
            noUnexpectedOverflow: true,
            gridVisible: true,
            targetVisible: true,
            targetInViewport: true,
        });
        await game.screenshot('移动端-直线跑路药水-手动选择已展示宝藏', testInfo);

        await clickVisibleInteractionOptionBy(
            page,
            game,
            (option: InteractionOption) =>
                option.value?.treasureDefId === 'munchkin_treasure_bag_of_caltrops',
            '移动端直线跑路药水选择一袋铁蒺藜',
        );

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as StraightLineRunningAwayCoreState;
            const player0HandDefIds = core.players?.['0']?.hand?.map(card => card.defId) ?? [];
            const player0DiscardDefIds = core.players?.['0']?.discard?.map(card => card.defId) ?? [];
            return {
                pendingTreasureReward: core.pendingMunchkinTreasureReward ?? null,
                player0TreasureHandDefIds: player0HandDefIds.filter(defId => defId.startsWith('munchkin_treasure_')),
                player0DiscardHasPotion: player0DiscardDefIds.includes('munchkin_treasure_potion_of_straight_line_running_away'),
                treasureDeck: core.treasureDeck ?? [],
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 15000 }).toEqual({
            pendingTreasureReward: null,
            player0TreasureHandDefIds: [
                'munchkin_treasure_bag_of_caltrops',
                'munchkin_treasure_dwarf_hireling',
                'munchkin_treasure_wishing_ring',
            ],
            player0DiscardHasPotion: true,
            treasureDeck: ['munchkin_treasure_tiger_steed'],
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await waitForSmashUpFxToSettle(page);
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 1');

        const mobileResolutionEvidence = await page.evaluate(() => ({
            noUnexpectedOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
            handVisible: (() => {
                const rect = document.querySelector<HTMLElement>('[data-testid="su-hand-area"]')?.getBoundingClientRect();
                return !!rect && rect.left >= -2 && rect.right <= window.innerWidth + 2 && rect.bottom <= window.innerHeight + 2;
            })(),
            supplyVisible: (() => {
                const rect = document.querySelector<HTMLElement>('[data-testid="su-special-supply-row"]')?.getBoundingClientRect();
                return !!rect && rect.left >= -2 && rect.right <= window.innerWidth + 2;
            })(),
            finishTurnVisible: (() => {
                const button = Array.from(document.querySelectorAll<HTMLElement>('button')).find(element =>
                    /^(结束回合|Finish Turn|End)$/i.test(element.textContent?.trim() ?? '')
                );
                const rect = button?.getBoundingClientRect();
                return !!rect && rect.width > 24 && rect.height > 24 && rect.left >= -2 && rect.right <= window.innerWidth + 2;
            })(),
        }));
        expect(mobileResolutionEvidence, '移动端直线跑路药水收口后手牌、公共小牌和结束回合入口应可见且无横向溢出').toEqual({
            noUnexpectedOverflow: true,
            handVisible: true,
            supplyVisible: true,
            finishTurnVisible: true,
        });
        await game.screenshot('移动端-直线跑路药水-计分收口后', testInfo);
    });

    test('麻痹药水移动端横屏可手动选择计分前响应并收口', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 844, height: 390 });
        await page.addInitScript(() => {
            (window as Window & { __BG_FORCE_COARSE_POINTER__?: boolean }).__BG_FORCE_COARSE_POINTER__ = true;
        });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinParalysisPotionScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="paralysis-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="paralysis-hero"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('移动端-麻痹药水-计分前', testInfo);

        await game.advancePhase();
        await game.waitForPhase('scoreBases', 10000);
        await page.waitForFunction(
            () => {
                const state = (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.();
                return state?.sys?.phase === 'scoreBases'
                    && state?.sys?.responseWindow?.current?.windowType === 'meFirst'
                    && state?.sys?.interaction?.current?.data?.sourceId === 'smashup_reaction_choose';
            },
            { timeout: 15000, polling: 200 },
        );

        await expect.poll(async () => {
            const options = await game.getInteractionOptions() as InteractionOption[];
            return options.some((option) =>
                option.value?.kind === 'play_action'
                && option.value?.cardUid === 'paralysis-1'
                && option.value?.targetBaseIndex === 0
            );
        }, { timeout: 10000 }).toBe(true);

        await expectCenteredSmashUpReactionPrompt(
            page,
            '移动端麻痹药水 beforeScoring 响应窗口必须沿用 PC 同构居中弹窗，不得回到停靠提示条',
        );
        await game.screenshot('移动端-麻痹药水-beforeScoring响应入口', testInfo);

        await clickVisibleInteractionOptionBy(
            page,
            game,
            (option: InteractionOption) =>
                option.value?.kind === 'play_action'
                && option.value?.cardUid === 'paralysis-1'
                && option.value?.targetBaseIndex === 0,
            '移动端 beforeScoring 手动选择麻痹药水',
        );

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as ParalysisCoreState;
            const suppressionEvent = [...(state.sys?.eventStream?.entries ?? [])]
                .map(entry => entry.event)
                .find(event => event?.type === 'su:cards_suppressed_until_turn_end'
                    && event?.payload?.reason === 'munchkin_treasure_potion_of_paralysis');
            const suppressedCardUids = suppressionEvent?.payload?.cardUids ?? [];
            const player0DiscardDefIds = core.players?.['0']?.discard?.map(card => card.defId) ?? [];
            return {
                suppressionBaseIndex: suppressionEvent?.payload?.baseIndex ?? null,
                suppressedCardUids,
                suppressedAwayAction: suppressedCardUids.includes('paralysis-away-action'),
                suppressedAwayMinion: suppressedCardUids.includes('paralysis-away-minion'),
                player0DiscardHasPotion: player0DiscardDefIds.includes('munchkin_treasure_potion_of_paralysis'),
                suppressionStillActiveAfterTurnAdvance: (core.suppressedCardUidsUntilTurnEnd ?? []).length > 0,
                turnNumber: core.turnNumber,
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            suppressionBaseIndex: 0,
            suppressedCardUids: [
                'paralysis-base-action',
                'paralysis-hero',
                'paralysis-rocket-boots',
                'paralysis-ally',
            ],
            suppressedAwayAction: false,
            suppressedAwayMinion: false,
            player0DiscardHasPotion: true,
            suppressionStillActiveAfterTurnAdvance: false,
            turnNumber: 12,
            triggerQueueLength: 0,
            responseWindowType: null,
            interactionSourceId: null,
        });
        await waitForSmashUpFxToSettle(page);
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');

        const mobileResolutionEvidence = await page.evaluate(() => {
            const inViewport = (selector: string) => {
                const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                return !!rect
                    && rect.width > 24
                    && rect.height > 24
                    && rect.left >= -2
                    && rect.right <= window.innerWidth + 2
                    && rect.top >= -2
                    && rect.bottom <= window.innerHeight + 2;
            };
            const visibleSupplyElementInViewport = (selector: string) => Array.from(document.querySelectorAll<HTMLElement>(selector))
                .some(element => {
                    const rect = element.getBoundingClientRect();
                    const style = getComputedStyle(element);
                    return style.display !== 'none'
                        && style.visibility !== 'hidden'
                        && rect.width > 0
                        && rect.height > 0
                        && rect.left >= -2
                        && rect.right <= window.innerWidth + 2
                        && rect.top >= -2
                        && rect.bottom <= window.innerHeight + 2;
                });
            return {
                noUnexpectedOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
                baseVisible: inViewport('[data-base-index="0"]'),
                handVisible: inViewport('[data-testid="su-hand-area"]'),
                monsterSupplyCardVisible: visibleSupplyElementInViewport('[data-testid="su-munchkin-monster-supply-card"]'),
                monsterSupplyCountVisible: visibleSupplyElementInViewport('[data-testid="su-munchkin-monster-supply-count"]'),
                treasureSupplyCardVisible: visibleSupplyElementInViewport('[data-testid="su-munchkin-treasure-supply-card"]'),
                treasureSupplyCountVisible: visibleSupplyElementInViewport('[data-testid="su-munchkin-treasure-supply-count"]'),
                turnTrackerVisible: inViewport('[data-testid="su-turn-tracker"]'),
            };
        });
        expect(mobileResolutionEvidence, '移动端麻痹药水收口后基地、手牌、两张公共小牌及其数量和回合信息应可见且无横向溢出').toEqual({
            noUnexpectedOverflow: true,
            baseVisible: true,
            handVisible: true,
            monsterSupplyCardVisible: true,
            monsterSupplyCountVisible: true,
            treasureSupplyCardVisible: true,
            treasureSupplyCountVisible: true,
            turnTrackerVisible: true,
        });
        await game.screenshot('移动端-麻痹药水-计分收口后', testInfo);
    });

    test('兽人剑王真实入口显示同基地己方力量加成并排除自身、对手和其他基地', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinOrcsSwordLordScene());
        await waitForSmashUpFxToSettle(page);

        await expect(page.locator('[data-minion-uid="orcs-sword-lord-a"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-sword-ally"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-sword-enemy"]').first()).toBeVisible({ timeout: 15000 });

        const allyBadge = page.getByTestId('su-minion-power-badge-orcs-sword-ally');
        await expect(allyBadge).toBeVisible({ timeout: 15000 });
        await expect(allyBadge).toHaveText('+1');
        await expect(allyBadge).toHaveAttribute('title', /基础: 2[\s\S]*剑王: \+1[\s\S]*= 3/);
        await expect(page.getByTestId('su-minion-power-badge-orcs-sword-lord-a')).toHaveCount(0);
        await expect(page.getByTestId('su-minion-power-badge-orcs-sword-enemy')).toHaveCount(0);
        await expect(page.getByTestId('su-minion-power-badge-orcs-sword-other-base')).toHaveCount(0);

        const state = await game.getState();
        const bases = state.core.bases as Array<{ minions: Array<{ uid: string; basePower?: number }> }>;
        expect(bases[0]?.minions.find(minion => minion.uid === 'orcs-sword-ally')?.basePower).toBe(2);
        expect(bases[1]?.minions.find(minion => minion.uid === 'orcs-sword-other-base')?.basePower).toBe(2);
        await hideSmashUpDebugPanelForEvidence(page);
        await game.screenshot('兽人-剑王-同基地己方获得加成且自身对手与其他基地不加成', testInfo);
    });

    test('兽人剑王移动端横屏显示同基地加成并保留原版布局', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 844, height: 390 });
        await page.addInitScript(() => {
            (window as Window & { __BG_FORCE_COARSE_POINTER__?: boolean }).__BG_FORCE_COARSE_POINTER__ = true;
        });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinOrcsSwordLordScene());
        await waitForSmashUpFxToSettle(page);

        await expect(page.locator('[data-minion-uid="orcs-sword-lord-a"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-sword-ally"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-sword-enemy"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-minion-power-badge-orcs-sword-ally')).toHaveText('+1');
        await expect(page.getByTestId('su-minion-power-badge-orcs-sword-lord-a')).toHaveCount(0);
        await expect(page.getByTestId('su-minion-power-badge-orcs-sword-enemy')).toHaveCount(0);
        await expect(page.getByTestId('su-minion-power-badge-orcs-sword-other-base')).toHaveCount(0);
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');

        const state = await game.getState();
        const bases = state.core.bases as Array<{ minions: Array<{ uid: string; basePower?: number }> }>;
        expect(bases[0]?.minions.find(minion => minion.uid === 'orcs-sword-ally')?.basePower).toBe(2);
        expect(bases[1]?.minions.find(minion => minion.uid === 'orcs-sword-other-base')?.basePower).toBe(2);

        const mobileResolutionEvidence = await page.evaluate(() => {
            const inViewport = (selector: string) => {
                const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                return !!rect
                    && rect.width > 24
                    && rect.height > 24
                    && rect.left >= -2
                    && rect.right <= window.innerWidth + 2
                    && rect.top >= -2
                    && rect.bottom <= window.innerHeight + 2;
            };
            const supplyBadgeInViewport = (selector: string) => {
                const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                return !!rect
                    && rect.width > 0
                    && rect.height > 0
                    && rect.left >= -2
                    && rect.right <= window.innerWidth + 2
                    && rect.top >= -2
                    && rect.bottom <= window.innerHeight + 2;
            };
            return {
                noUnexpectedOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
                firstBaseVisible: inViewport('[data-base-index="0"]'),
                secondBaseVisible: inViewport('[data-base-index="1"]'),
                handVisible: inViewport('[data-testid="su-hand-area"]'),
                supplyVisible: supplyBadgeInViewport('[data-testid="su-munchkin-monster-supply-card"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-monster-supply-count"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-treasure-supply-card"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-treasure-supply-count"]'),
                turnTrackerVisible: inViewport('[data-testid="su-turn-tracker"]'),
                endTurnVisible: inViewport('button[aria-label*="结束回合"], button[aria-label*="End turn"]'),
                monsterDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-monster-discard"]'),
                treasureDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-treasure-discard"]'),
            };
        });
        expect(mobileResolutionEvidence, '移动端剑王图面应显示两座基地、力量标记、公共小牌和原版操作入口且无横向溢出').toEqual({
            noUnexpectedOverflow: true,
            firstBaseVisible: true,
            secondBaseVisible: true,
            handVisible: true,
            supplyVisible: true,
            turnTrackerVisible: true,
            endTurnVisible: true,
            monsterDiscardAbsent: true,
            treasureDiscardAbsent: true,
        });
        await game.screenshot('移动端-兽人剑王-同基地加成与原版布局', testInfo);
    });

    test('兽人呆瓜兽人真实入口排除对手行动目标但保留同基地普通随从', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinOrcsDorkOrcProtectionScene());

        await expect(page.locator('[data-card-uid="orcs-dork-crush-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-dork-protected"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-dork-free"]').first()).toBeVisible({ timeout: 15000 });

        await game.playCard('munchkin_orcs_crush');
        await game.waitForInteraction('munchkin_orcs_crush_base', 10000);
        await game.selectInteractionOptionBy(option => option.value?.baseIndex === 0, '呆瓜兽人保护链选择基地');
        await game.waitForInteraction('munchkin_orcs_crush_player', 10000);
        await game.selectInteractionOptionBy(option => option.value?.targetPlayerId === '1', '呆瓜兽人保护链选择目标玩家');
        await game.waitForInteraction('munchkin_orcs_crush_minion', 10000);

        const targetOptions = await game.getInteractionOptions() as InteractionOption[];
        expect(targetOptions.some(option => option.value?.minionUid === 'orcs-dork-free')).toBe(true);
        expect(targetOptions.some(option => option.value?.minionUid === 'orcs-dork-protected')).toBe(false);
        await expectManualMinionChoiceVisible(
            page,
            'orcs-dork-free',
            '呆瓜兽人受到对手行动影响时，合法目标应显示普通随从本体',
            { forbidPromptContext: true },
        );
        await hideSmashUpDebugPanelForEvidence(page);
        await game.screenshot('兽人-呆瓜兽人-对手行动排除受保护随从', testInfo);

        await clickManualMinionChoice(page, 'orcs-dork-free', '呆瓜兽人保护链选择普通随从');
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);
        const finalState = await game.getState();
        const targetBase = finalState.core.bases[0];
        expect(targetBase.minions.some((minion: any) => minion.uid === 'orcs-dork-protected')).toBe(true);
        expect(targetBase.minions.some((minion: any) => minion.uid === 'orcs-dork-free')).toBe(false);
        expect(finalState.core.players?.['0']?.discard?.some((card: any) => card.uid === 'orcs-dork-crush-1')).toBe(true);
        await game.screenshot('兽人-呆瓜兽人-普通随从被摧毁而呆瓜兽人保留', testInfo);
    });

    test('兽人呆瓜兽人移动端横屏过滤保护目标并手动收口', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 844, height: 390 });
        await page.addInitScript(() => {
            (window as Window & { __BG_FORCE_COARSE_POINTER__?: boolean }).__BG_FORCE_COARSE_POINTER__ = true;
        });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinOrcsDorkOrcProtectionScene());

        await expect(page.locator('[data-card-uid="orcs-dork-crush-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-dork-protected"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-dork-free"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('移动端-兽人呆瓜兽人-手牌与保护目标', testInfo);

        await game.playCard('munchkin_orcs_crush');
        await game.waitForInteraction('munchkin_orcs_crush_base', 10000);
        await waitForSmashUpFxToSettle(page);
        await expectCurrentInteractionManual(game, '移动端呆瓜兽人第一步选择基地');
        await expectManualChoiceVisible(
            page,
            '[data-base-index="0"]',
            '移动端呆瓜兽人第一步必须显示基地本体供玩家手动选择',
            { forbidPromptContext: true },
        );
        await clickManualBaseChoice(page, 0, '移动端呆瓜兽人选择目标基地');

        await game.waitForInteraction('munchkin_orcs_crush_player', 10000);
        await waitForSmashUpFxToSettle(page);
        await expectCurrentInteractionManual(game, '移动端呆瓜兽人第二步选择玩家');
        const playerOptions = await game.getInteractionOptions() as InteractionOption[];
        expect(playerOptions).toHaveLength(1);
        expect(playerOptions[0]?.value?.targetPlayerId).toBe('1');
        await clickVisibleInteractionOptionBy(
            page,
            game,
            option => option.value?.targetPlayerId === '1',
            '移动端呆瓜兽人选择目标玩家',
        );

        await game.waitForInteraction('munchkin_orcs_crush_minion', 10000);
        await waitForSmashUpFxToSettle(page);
        await expectCurrentInteractionManual(game, '移动端呆瓜兽人第三步选择随从');
        const targetOptions = await game.getInteractionOptions() as InteractionOption[];
        expect(targetOptions.some(option => option.value?.minionUid === 'orcs-dork-free')).toBe(true);
        expect(targetOptions.some(option => option.value?.minionUid === 'orcs-dork-protected')).toBe(false);
        await expectManualMinionChoiceVisible(
            page,
            'orcs-dork-free',
            '移动端呆瓜兽人必须显示未保护的普通随从本体',
            { forbidPromptContext: true },
        );
        await game.screenshot('移动端-兽人呆瓜兽人-过滤保护目标', testInfo);
        await clickManualMinionChoice(page, 'orcs-dork-free', '移动端呆瓜兽人选择普通随从');
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            return {
                protectedVisible: await page.locator('[data-minion-uid="orcs-dork-protected"]').count() > 0,
                freeVisible: await page.locator('[data-minion-uid="orcs-dork-free"]').count() > 0,
                freeInDiscard: core.players?.['1']?.discard?.some(card => card.uid === 'orcs-dork-free') ?? false,
                actionInDiscard: core.players?.['0']?.discard?.some(card => card.uid === 'orcs-dork-crush-1') ?? false,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            protectedVisible: true,
            freeVisible: false,
            freeInDiscard: true,
            actionInDiscard: true,
            interactionSourceId: null,
        });

        const mobileResolutionEvidence = await page.evaluate(() => {
            const inViewport = (selector: string) => {
                const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                return !!rect
                    && rect.width > 24
                    && rect.height > 24
                    && rect.left >= -2
                    && rect.right <= window.innerWidth + 2
                    && rect.top >= -2
                    && rect.bottom <= window.innerHeight + 2;
            };
            return {
                noUnexpectedOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
                baseVisible: inViewport('[data-base-index="0"]'),
                otherBaseVisible: inViewport('[data-base-index="1"]'),
                handVisible: inViewport('[data-testid="su-hand-area"]'),
                turnTrackerVisible: inViewport('[data-testid="su-turn-tracker"]'),
                endTurnVisible: inViewport('button[aria-label*="结束回合"], button[aria-label*="End turn"]'),
                monsterDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-monster-discard"]'),
                treasureDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-treasure-discard"]'),
            };
        });
        expect(mobileResolutionEvidence, '移动端呆瓜兽人收口后基地、手牌、公共小牌和原版操作入口应可见且无横向溢出').toEqual({
            noUnexpectedOverflow: true,
            baseVisible: true,
            otherBaseVisible: true,
            handVisible: true,
            turnTrackerVisible: true,
            endTurnVisible: true,
            monsterDiscardAbsent: true,
            treasureDiscardAbsent: true,
        });
        await game.screenshot('移动端-兽人呆瓜兽人-保护目标保留并收口', testInfo);
    });

    test('兽人坑洞真实入口只保护坑洞内随从不受对手行动', async ({ page, game }, testInfo) => {
        test.setTimeout(120000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinOrcsPitsProtectionScene());

        await expect(page.locator('[data-card-uid="orcs-pits-crush-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-pits-protected-a"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-pits-free"]').first()).toBeVisible({ timeout: 15000 });
        await hideSmashUpDebugPanelForEvidence(page);
        await game.screenshot('兽人-坑洞保护-两座基地对照初始状态', testInfo);

        await game.playCard('munchkin_orcs_crush');
        await game.waitForInteraction('munchkin_orcs_crush_base', 10000);
        await game.selectInteractionOptionBy(option => option.value?.baseIndex === 0, '坑洞保护链第一张行动选择坑洞');
        await game.waitForInteraction('munchkin_orcs_crush_player', 10000);
        await game.selectInteractionOptionBy(option => option.value?.targetPlayerId === '1', '坑洞保护链第一张行动选择坑洞内目标玩家');
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        const pitsState = await game.getState();
        expect(pitsState.core.bases[0].minions.some((minion: any) => minion.uid === 'orcs-pits-protected-a')).toBe(true);
        expect(pitsState.core.bases[0].minions.some((minion: any) => minion.uid === 'orcs-pits-protected-b')).toBe(true);
        expect(pitsState.core.players?.['0']?.discard?.some((card: any) => card.uid === 'orcs-pits-crush-1')).toBe(true);
        await game.screenshot('兽人-坑洞保护-对手行动无法摧毁坑洞随从', testInfo);

        await game.playCard('munchkin_orcs_crush');
        await game.waitForInteraction('munchkin_orcs_crush_base', 10000);
        await game.selectInteractionOptionBy(option => option.value?.baseIndex === 1, '坑洞保护链第二张行动选择另一基地');
        await game.waitForInteraction('munchkin_orcs_crush_player', 10000);
        await game.selectInteractionOptionBy(option => option.value?.targetPlayerId === '1', '坑洞保护链第二张行动选择另一基地目标玩家');
        await game.waitForInteraction('munchkin_orcs_crush_minion', 10000);
        const freeTargetOptions = await game.getInteractionOptions() as InteractionOption[];
        expect(freeTargetOptions.some(option => option.value?.minionUid === 'orcs-pits-free')).toBe(true);
        await expectManualMinionChoiceVisible(
            page,
            'orcs-pits-free',
            '坑洞外的普通随从仍应成为对手行动的可选目标',
            { forbidPromptContext: true },
        );
        await hideSmashUpDebugPanelForEvidence(page);
        await game.screenshot('兽人-坑洞保护-另一基地仍可手动选择目标', testInfo);
        await clickManualMinionChoice(page, 'orcs-pits-free', '坑洞保护链选择另一基地普通随从');
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        const finalState = await game.getState();
        expect(finalState.core.bases[0].minions.some((minion: any) => minion.uid === 'orcs-pits-protected-a')).toBe(true);
        expect(finalState.core.bases[0].minions.some((minion: any) => minion.uid === 'orcs-pits-protected-b')).toBe(true);
        expect(finalState.core.bases[1].minions.some((minion: any) => minion.uid === 'orcs-pits-free')).toBe(false);
        expect(finalState.core.players?.['0']?.discard?.some((card: any) => card.uid === 'orcs-pits-crush-2')).toBe(true);
        await game.screenshot('兽人-坑洞保护-坑洞保留而另一基地目标被摧毁', testInfo);
    });

    test('兽人坑洞移动端过滤坑洞内保护目标并保留另一基地手动目标', async ({ page, game }, testInfo) => {
        test.setTimeout(120000);

        await page.setViewportSize({ width: 844, height: 390 });
        await page.addInitScript(() => {
            (window as Window & { __BG_FORCE_COARSE_POINTER__?: boolean }).__BG_FORCE_COARSE_POINTER__ = true;
        });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinOrcsPitsProtectionScene());

        const firstAction = page.locator('[data-card-uid="orcs-pits-crush-1"]').first();
        const secondAction = page.locator('[data-card-uid="orcs-pits-crush-2"]').first();
        await expect(firstAction).toBeVisible({ timeout: 15000 });
        await expect(secondAction).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-pits-protected-a"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-pits-protected-b"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-pits-free"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('移动端-兽人坑洞保护-两座基地与两张行动', testInfo);

        await firstAction.click({ force: true });
        await page.waitForTimeout(300);
        await firstAction.click({ force: true });
        await game.waitForInteraction('munchkin_orcs_crush_base', 10000);
        await waitForSmashUpFxToSettle(page);
        await expectManualChoiceVisible(
            page,
            '[data-base-index="0"]',
            '移动端坑洞保护第一张行动应显示坑洞基地本体',
            { forbidPromptContext: true },
        );
        await game.screenshot('移动端-兽人坑洞保护-第一张行动选择坑洞', testInfo);
        await clickManualBaseChoice(page, 0, '移动端坑洞保护第一张行动选择坑洞');
        await game.waitForInteraction('munchkin_orcs_crush_player', 10000);
        await clickVisibleInteractionOptionBy(page, game, option => option.value?.targetPlayerId === '1', '移动端坑洞保护第一张行动选择目标玩家');
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            return {
                protectedAOnPits: state.core.bases[0].minions.some((entry: { uid?: string }) => entry.uid === 'orcs-pits-protected-a'),
                protectedBOnPits: state.core.bases[0].minions.some((entry: { uid?: string }) => entry.uid === 'orcs-pits-protected-b'),
                firstActionInDiscard: state.core.players?.['0']?.discard?.some((card: { uid?: string }) => card.uid === 'orcs-pits-crush-1') ?? false,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
            };
        }, { timeout: 15000 }).toEqual({
            protectedAOnPits: true,
            protectedBOnPits: true,
            firstActionInDiscard: true,
            interactionSourceId: null,
        });
        await game.screenshot('移动端-兽人坑洞保护-坑洞目标全部过滤并收口', testInfo);

        await secondAction.click({ force: true });
        await page.waitForTimeout(300);
        await secondAction.click({ force: true });
        await game.waitForInteraction('munchkin_orcs_crush_base', 10000);
        await waitForSmashUpFxToSettle(page);
        await expectManualChoiceVisible(
            page,
            '[data-base-index="1"]',
            '移动端坑洞保护第二张行动应显示另一基地本体',
            { forbidPromptContext: true },
        );
        await clickManualBaseChoice(page, 1, '移动端坑洞保护第二张行动选择另一基地');
        await game.waitForInteraction('munchkin_orcs_crush_player', 10000);
        await clickVisibleInteractionOptionBy(page, game, option => option.value?.targetPlayerId === '1', '移动端坑洞保护第二张行动选择目标玩家');
        await game.waitForInteraction('munchkin_orcs_crush_minion', 10000);
        const targetOptions = await game.getInteractionOptions() as InteractionOption[];
        expect(targetOptions.some(option => option.value?.minionUid === 'orcs-pits-protected-a')).toBe(false);
        expect(targetOptions.some(option => option.value?.minionUid === 'orcs-pits-protected-b')).toBe(false);
        expect(targetOptions.some(option => option.value?.minionUid === 'orcs-pits-free')).toBe(true);
        await expectManualMinionChoiceVisible(
            page,
            'orcs-pits-free',
            '移动端坑洞保护第二张行动应只显示另一基地普通随从本体',
            { forbidPromptContext: true },
        );
        await game.screenshot('移动端-兽人坑洞保护-另一基地手动选择普通随从', testInfo);
        await clickManualMinionChoice(page, 'orcs-pits-free', '移动端坑洞保护选择另一基地普通随从');
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            return {
                protectedAOnPits: state.core.bases[0].minions.some((entry: { uid?: string }) => entry.uid === 'orcs-pits-protected-a'),
                protectedBOnPits: state.core.bases[0].minions.some((entry: { uid?: string }) => entry.uid === 'orcs-pits-protected-b'),
                freeOnOtherBase: state.core.bases[1].minions.some((entry: { uid?: string }) => entry.uid === 'orcs-pits-free'),
                freeInDiscard: state.core.players?.['1']?.discard?.some((card: { uid?: string }) => card.uid === 'orcs-pits-free') ?? false,
                secondActionInDiscard: state.core.players?.['0']?.discard?.some((card: { uid?: string }) => card.uid === 'orcs-pits-crush-2') ?? false,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 15000 }).toEqual({
            protectedAOnPits: true,
            protectedBOnPits: true,
            freeOnOtherBase: false,
            freeInDiscard: true,
            secondActionInDiscard: true,
            interactionSourceId: null,
            responseWindowType: null,
        });

        const mobileResolutionEvidence = await page.evaluate(() => {
            const inViewport = (selector: string) => {
                const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                return !!rect
                    && rect.width > 24
                    && rect.height > 24
                    && rect.left >= -2
                    && rect.right <= window.innerWidth + 2
                    && rect.top >= -2
                    && rect.bottom <= window.innerHeight + 2;
            };
            return {
                noUnexpectedOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
                firstBaseVisible: inViewport('[data-base-index="0"]'),
                secondBaseVisible: inViewport('[data-base-index="1"]'),
                handVisible: inViewport('[data-testid="su-hand-area"]'),
                turnTrackerVisible: inViewport('[data-testid="su-turn-tracker"]'),
                endTurnVisible: inViewport('button[aria-label*="结束回合"], button[aria-label*="End turn"]'),
                monsterDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-monster-discard"]'),
                treasureDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-treasure-discard"]'),
            };
        });
        expect(mobileResolutionEvidence, '移动端坑洞保护收口后两座基地、手牌、公共小牌和原版操作入口应可见且无横向溢出').toEqual({
            noUnexpectedOverflow: true,
            firstBaseVisible: true,
            secondBaseVisible: true,
            handVisible: true,
            turnTrackerVisible: true,
            endTurnVisible: true,
            monsterDiscardAbsent: true,
            treasureDiscardAbsent: true,
        });
        await game.screenshot('移动端-兽人坑洞保护-坑洞保留另一基地目标被摧毁并收口', testInfo);
    });

    test('兽人坑洞移动端随从离开后恢复为可受其他玩家行动影响', async ({ page, game }, testInfo) => {
        test.setTimeout(120000);

        await page.setViewportSize({ width: 844, height: 390 });
        await page.addInitScript(() => {
            (window as Window & { __BG_FORCE_COARSE_POINTER__?: boolean }).__BG_FORCE_COARSE_POINTER__ = true;
        });
        await game.openTestGame('smashup', {
            skipInitialization: true,
            seat1: 'human',
            playerID: '0',
        }, 20000);
        await game.setupScene(buildMunchkinOrcsPitsLeaveProtectionScene());
        const targetPage = await openSmashUpPlayerView(page, '1');
        await targetPage.setViewportSize({ width: 844, height: 390 });

        try {
            const initialState = await game.getState();
            await mirrorSmashUpHarnessState(targetPage, initialState);

            const dogpile = targetPage.locator('[data-card-uid="orcs-pits-leave-dogpile"]').first();
            await expect(dogpile).toBeVisible({ timeout: 15000 });
            await expect(page.locator('[data-minion-uid="orcs-pits-leaving-target"]').first()).toBeVisible({ timeout: 15000 });
            await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
            await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
            await game.screenshot('移动端-兽人坑洞离开保护-坑洞随从与死亡之息入口', testInfo);

            await dogpile.click({ force: true });
            await targetPage.waitForTimeout(300);
            await dogpile.click({ force: true });
            await targetPage.waitForFunction(
                () => (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.()?.sys?.interaction?.current?.data?.sourceId
                    === 'munchkin_orcs_dogpile_minion',
                { timeout: 10000, polling: 200 },
            );
            await waitForSmashUpFxToSettle(targetPage);
            await expectManualMinionChoiceVisible(
                targetPage,
                'orcs-pits-leaving-target',
                '离开坑洞前必须显示坑洞中的随从本体供玩家手动选择',
                { forbidPromptContext: true },
            );
            await saveMunchkinEvidenceScreenshot(targetPage, '兽人-坑洞离开保护-手动选择坑洞随从.png');
            await clickManualMinionChoice(targetPage, 'orcs-pits-leaving-target', '坑洞离开保护链选择要移动的随从');
            await targetPage.waitForFunction(
                () => (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.()?.sys?.interaction?.current?.data?.sourceId
                    === 'munchkin_orcs_dogpile_base',
                { timeout: 10000, polling: 200 },
            );
            await waitForSmashUpFxToSettle(targetPage);
            await expectManualChoiceVisible(
                targetPage,
                '[data-base-index="1"]',
                '离开坑洞后必须显示另一基地本体供玩家手动选择',
                { forbidPromptContext: true },
            );
            await saveMunchkinEvidenceScreenshot(targetPage, '兽人-坑洞离开保护-手动选择另一基地.png');
            await clickManualBaseChoice(targetPage, 1, '坑洞离开保护链选择另一基地');

            const movedState = await targetPage.evaluate(() => (
                (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.()
            )) as {
                core?: {
                    bases?: Array<{ minions?: Array<{ uid?: string }> }>;
                    players?: Record<string, { discard?: Array<{ uid?: string }> }>;
                };
                sys?: { interaction?: { current?: { data?: { sourceId?: string | null } } } };
            };
            expect(movedState.core?.bases?.[0]?.minions?.some((entry) => entry.uid === 'orcs-pits-leaving-target')).toBe(false);
            expect(movedState.core?.bases?.[1]?.minions?.some((entry) => entry.uid === 'orcs-pits-leaving-target')).toBe(true);
            expect(movedState.core?.players?.['1']?.discard?.some((card) => card.uid === 'orcs-pits-leave-dogpile')).toBe(true);
            expect(movedState.sys?.interaction?.current?.data?.sourceId ?? null).toBeNull();

            await mirrorSmashUpHarnessState(page, movedState);
            await targetPage.getByTestId('su-end-turn-action-button').click({ force: true });
            await targetPage.waitForFunction(
                () => (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.()?.core?.currentPlayerIndex === 0,
                { timeout: 10000, polling: 200 },
            );
            const p0TurnState = await targetPage.evaluate(() => (
                (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.()
            ));
            await mirrorSmashUpHarnessState(page, p0TurnState);
            await expect(page.locator('[data-card-uid="orcs-pits-leave-death-breath"]').first()).toBeVisible({ timeout: 15000 });
            await game.screenshot('移动端-兽人坑洞离开保护-随从移到另一基地后P0行动入口', testInfo);

            const deathBreath = page.locator('[data-card-uid="orcs-pits-leave-death-breath"]').first();
            await deathBreath.click({ force: true });
            await page.waitForTimeout(300);
            await deathBreath.click({ force: true });
            await game.waitForInteraction('munchkin_orcs_death_breath_target', 10000);
            await waitForSmashUpFxToSettle(page);
            const targetOptions = await game.getInteractionOptions() as InteractionOption[];
            expect(targetOptions.some((option) => option.value?.minionUid === 'orcs-pits-leaving-target')).toBe(true);
            await expectManualMinionChoiceVisible(
                page,
                'orcs-pits-leaving-target',
                '离开坑洞后的随从必须重新成为其他玩家行动的可选目标',
                { forbidPromptContext: true },
            );
            await game.screenshot('移动端-兽人坑洞离开保护-另一基地手动选择已恢复保护外随从', testInfo);
            await clickManualMinionChoice(page, 'orcs-pits-leaving-target', '死亡之息选择离开坑洞后的随从');
            await game.waitForNoInteraction(10000);
            await waitForSmashUpFxToSettle(page);

            await expect.poll(async () => {
                const state = await game.getState();
                return {
                    movedMinionInPits: state.core.bases[0].minions.some((entry: { uid?: string }) => entry.uid === 'orcs-pits-leaving-target'),
                    movedMinionOnDestination: state.core.bases[1].minions.some((entry: { uid?: string }) => entry.uid === 'orcs-pits-leaving-target'),
                    movedMinionInOwnerDeck: state.core.players?.['1']?.deck?.some((entry: { uid?: string }) => entry.uid === 'orcs-pits-leaving-target') ?? false,
                    dogpileInOwnerDiscard: state.core.players?.['1']?.discard?.some((entry: { uid?: string }) => entry.uid === 'orcs-pits-leave-dogpile') ?? false,
                    deathBreathInDiscard: state.core.players?.['0']?.discard?.some((entry: { uid?: string }) => entry.uid === 'orcs-pits-leave-death-breath') ?? false,
                    interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                    responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
                };
            }, { timeout: 15000 }).toEqual({
                movedMinionInPits: false,
                movedMinionOnDestination: false,
                movedMinionInOwnerDeck: true,
                dogpileInOwnerDiscard: true,
                deathBreathInDiscard: true,
                interactionSourceId: null,
                responseWindowType: null,
            });

            const mobileResolutionEvidence = await page.evaluate(() => {
                const inViewport = (selector: string) => {
                    const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                    return !!rect
                        && rect.width > 24
                        && rect.height > 24
                        && rect.left >= -2
                        && rect.right <= window.innerWidth + 2
                        && rect.top >= -2
                        && rect.bottom <= window.innerHeight + 2;
                };
                const supplyBadgeInViewport = (selector: string) => {
                    const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                    return !!rect
                        && rect.width > 0
                        && rect.height > 0
                        && rect.left >= -2
                        && rect.right <= window.innerWidth + 2
                        && rect.top >= -2
                        && rect.bottom <= window.innerHeight + 2;
                };
                return {
                    noUnexpectedOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
                    firstBaseVisible: inViewport('[data-base-index="0"]'),
                    secondBaseVisible: inViewport('[data-base-index="1"]'),
                    handVisible: inViewport('[data-testid="su-hand-area"]'),
                    supplyVisible: supplyBadgeInViewport('[data-testid="su-munchkin-monster-supply-card"]')
                        && supplyBadgeInViewport('[data-testid="su-munchkin-monster-supply-count"]')
                        && supplyBadgeInViewport('[data-testid="su-munchkin-treasure-supply-card"]')
                        && supplyBadgeInViewport('[data-testid="su-munchkin-treasure-supply-count"]'),
                    turnTrackerVisible: inViewport('[data-testid="su-turn-tracker"]'),
                    endTurnVisible: inViewport('button[aria-label*="结束回合"], button[aria-label*="End turn"]'),
                    monsterDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-monster-discard"]'),
                    treasureDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-treasure-discard"]'),
                };
            });
            expect(mobileResolutionEvidence, '移动端坑洞随从离开后恢复可受行动影响的收口布局应完整且无横向溢出').toEqual({
                noUnexpectedOverflow: true,
                firstBaseVisible: true,
                secondBaseVisible: true,
                handVisible: true,
                supplyVisible: true,
                turnTrackerVisible: true,
                endTurnVisible: true,
                monsterDiscardAbsent: true,
                treasureDiscardAbsent: true,
            });
            await game.screenshot('移动端-兽人坑洞离开保护-目标进入牌库底并收口', testInfo);
        } finally {
            await targetPage.close();
        }
    });

    test('兽人坑洞移动端控制者自己的行动仍可影响坑洞随从', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 844, height: 390 });
        await page.addInitScript(() => {
            (window as Window & { __BG_FORCE_COARSE_POINTER__?: boolean }).__BG_FORCE_COARSE_POINTER__ = true;
        });
        await game.openTestGame('smashup', {
            skipInitialization: true,
            seat1: 'human',
            playerID: '1',
        }, 20000);
        await game.setupScene(buildMunchkinOrcsPitsControllerActionScene());

        const action = page.locator('[data-card-uid="orcs-pits-controller-death-breath"]').first();
        await expect(action).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-pits-controller-target"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('移动端-兽人坑洞控制者行动-坑洞随从与死亡之息入口', testInfo);

        await action.click({ force: true });
        await page.waitForTimeout(300);
        await action.click({ force: true });
        await game.waitForInteraction('munchkin_orcs_death_breath_target', 10000);
        await waitForSmashUpFxToSettle(page);
        const targetOptions = await game.getInteractionOptions() as InteractionOption[];
        expect(targetOptions.some((option) => option.value?.minionUid === 'orcs-pits-controller-target')).toBe(true);
        await expectManualMinionChoiceVisible(
            page,
            'orcs-pits-controller-target',
            '坑洞控制者自己的行动必须显示坑洞内自己的随从本体作为可选目标',
            { forbidPromptContext: true },
        );
        await game.screenshot('移动端-兽人坑洞控制者行动-手动选择坑洞随从', testInfo);
        await clickManualMinionChoice(page, 'orcs-pits-controller-target', '坑洞控制者行动选择自己的坑洞随从');
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            return {
                targetOnPits: state.core.bases[0].minions.some((entry: { uid?: string }) => entry.uid === 'orcs-pits-controller-target'),
                targetInOwnerDeck: state.core.players?.['1']?.deck?.some((entry: { uid?: string }) => entry.uid === 'orcs-pits-controller-target') ?? false,
                actionInOwnerDiscard: state.core.players?.['1']?.discard?.some((entry: { uid?: string }) => entry.uid === 'orcs-pits-controller-death-breath') ?? false,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 15000 }).toEqual({
            targetOnPits: false,
            targetInOwnerDeck: true,
            actionInOwnerDiscard: true,
            interactionSourceId: null,
            responseWindowType: null,
        });

        const mobileResolutionEvidence = await page.evaluate(() => {
            const inViewport = (selector: string) => {
                const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                return !!rect
                    && rect.width > 24
                    && rect.height > 24
                    && rect.left >= -2
                    && rect.right <= window.innerWidth + 2
                    && rect.top >= -2
                    && rect.bottom <= window.innerHeight + 2;
            };
            const supplyBadgeInViewport = (selector: string) => {
                const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                return !!rect
                    && rect.width > 0
                    && rect.height > 0
                    && rect.left >= -2
                    && rect.right <= window.innerWidth + 2
                    && rect.top >= -2
                    && rect.bottom <= window.innerHeight + 2;
            };
            return {
                noUnexpectedOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
                firstBaseVisible: inViewport('[data-base-index="0"]'),
                secondBaseVisible: inViewport('[data-base-index="1"]'),
                handVisible: inViewport('[data-testid="su-hand-area"]'),
                supplyVisible: supplyBadgeInViewport('[data-testid="su-munchkin-monster-supply-card"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-monster-supply-count"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-treasure-supply-card"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-treasure-supply-count"]'),
                turnTrackerVisible: inViewport('[data-testid="su-turn-tracker"]'),
                endTurnVisible: inViewport('button[aria-label*="结束回合"], button[aria-label*="End turn"]'),
                monsterDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-monster-discard"]'),
                treasureDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-treasure-discard"]'),
            };
        });
        expect(mobileResolutionEvidence, '移动端坑洞控制者自己的行动收口后应保留原版布局且无横向溢出').toEqual({
            noUnexpectedOverflow: true,
            firstBaseVisible: true,
            secondBaseVisible: true,
            handVisible: true,
            supplyVisible: true,
            turnTrackerVisible: true,
            endTurnVisible: true,
            monsterDiscardAbsent: true,
            treasureDiscardAbsent: true,
        });
        await game.screenshot('移动端-兽人坑洞控制者行动-目标进入牌库底并收口', testInfo);
    });

    test('兽人坑洞移动端其他玩家的非行动效果仍可影响坑洞随从', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 844, height: 390 });
        await page.addInitScript(() => {
            (window as Window & { __BG_FORCE_COARSE_POINTER__?: boolean }).__BG_FORCE_COARSE_POINTER__ = true;
        });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinOrcsPitsNonActionScene());

        await expect(page.locator('[data-base-index="0"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-base-index="1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-pits-non-action-target"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('移动端-兽人坑洞非行动-忍者道场计分前与坑洞目标', testInfo);

        await game.advancePhase();
        await page.waitForFunction(
            () => {
                const state = (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.();
                return state?.sys?.phase === 'scoreBases' || state?.sys?.phase === 'playCards';
            },
            { timeout: 15000, polling: 200 },
        );

        for (let attempt = 0; attempt < 12; attempt += 1) {
            const state = await game.getState();
            const sourceId = state.sys?.interaction?.current?.data?.sourceId ?? null;
            if (sourceId === 'base_ninja_dojo') break;
            if (state.sys?.phase === 'playCards' && !state.sys?.interaction?.current) break;
            if (sourceId === 'smashup_reaction_choose') {
                const dojoButton = page.getByRole('button', { name: '忍者道场', exact: true }).first();
                if (await dojoButton.isVisible({ timeout: 1000 }).catch(() => false)) {
                    await dojoButton.click({ force: true });
                    await page.waitForTimeout(300);
                    continue;
                }
            }
            const didPass = await passOpenReactionOrResponseWindow(page, game, `移动端坑洞非行动计分前让过响应 ${attempt + 1}`);
            if (!didPass) await page.waitForTimeout(300);
        }

        await game.waitForInteraction('base_ninja_dojo', 15000);
        await expectManualMinionChoiceVisible(
            page,
            'orcs-pits-non-action-target',
            '移动端忍者道场必须显示坑洞内对手随从本体作为可选目标',
            { forbidPromptContext: true },
        );
        await expect(page.locator('[data-base-index="1"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('移动端-兽人坑洞非行动-忍者道场手动选择坑洞随从', testInfo);
        await clickManualMinionChoice(page, 'orcs-pits-non-action-target', '移动端忍者道场选择坑洞内对手随从');
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            return {
                scoringBaseReplaced: state.core.bases?.[0]?.defId !== 'base_ninja_dojo',
                scoringBaseCleared: state.core.bases?.[0]?.minions?.length === 0,
                pitsTargetStillPresent: state.core.bases?.[1]?.minions?.some((entry: { uid?: string }) => entry.uid === 'orcs-pits-non-action-target') ?? false,
                targetInOwnerDiscard: state.core.players?.['1']?.discard?.some((entry: { uid?: string }) => entry.uid === 'orcs-pits-non-action-target') ?? false,
                ownVp: state.core.players?.['0']?.vp ?? 0,
                opponentVp: state.core.players?.['1']?.vp ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 20000 }).toEqual({
            scoringBaseReplaced: true,
            scoringBaseCleared: true,
            pitsTargetStillPresent: false,
            targetInOwnerDiscard: true,
                ownVp: 6,
                opponentVp: 7,
            interactionSourceId: null,
            responseWindowType: null,
        });

        const mobileResolutionEvidence = await page.evaluate(() => {
            const inViewport = (selector: string) => {
                const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                return !!rect
                    && rect.width > 24
                    && rect.height > 24
                    && rect.left >= -2
                    && rect.right <= window.innerWidth + 2
                    && rect.top >= -2
                    && rect.bottom <= window.innerHeight + 2;
            };
            const supplyBadgeInViewport = (selector: string) => {
                const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                return !!rect
                    && rect.width > 0
                    && rect.height > 0
                    && rect.left >= -2
                    && rect.right <= window.innerWidth + 2
                    && rect.top >= -2
                    && rect.bottom <= window.innerHeight + 2;
            };
            return {
                noUnexpectedOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
                firstBaseVisible: inViewport('[data-base-index="0"]'),
                secondBaseVisible: inViewport('[data-base-index="1"]'),
                handVisible: inViewport('[data-testid="su-hand-area"]'),
                supplyVisible: supplyBadgeInViewport('[data-testid="su-munchkin-monster-supply-card"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-monster-supply-count"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-treasure-supply-card"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-treasure-supply-count"]'),
                turnTrackerVisible: inViewport('[data-testid="su-turn-tracker"]'),
                endTurnVisible: inViewport('button[aria-label*="结束回合"], button[aria-label*="End turn"]'),
                monsterDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-monster-discard"]'),
                treasureDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-treasure-discard"]'),
            };
        });
        expect(mobileResolutionEvidence, '移动端坑洞非行动效果收口后应保留两座基地、手牌、公共小牌和原版操作入口且无横向溢出').toEqual({
            noUnexpectedOverflow: true,
            firstBaseVisible: true,
            secondBaseVisible: true,
            handVisible: true,
            supplyVisible: true,
            turnTrackerVisible: true,
            endTurnVisible: true,
            monsterDiscardAbsent: true,
            treasureDiscardAbsent: true,
        });
        await game.screenshot('移动端-兽人坑洞非行动-目标被忍者道场消灭并收口', testInfo);
    });

    test('兽人重击者真实入口手动选择力量目标，单候选也不自动结算', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinOrcsHammerSlammerScene());

        await expect(page.locator('[data-card-uid="orcs-hammer-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-hammer-weak-0"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-hammer-strong-0"]').first()).toBeVisible({ timeout: 15000 });

        await game.playCard('munchkin_orcs_hammer_slammer', { targetBaseIndex: 0 });
        await game.waitForInteraction('munchkin_orcs_hammer_slammer_target', 10000);
        await waitForSmashUpFxToSettle(page);
        await expectManualMinionChoiceVisible(
            page,
            'orcs-hammer-weak-0',
            '重击者选择态应显示力量 2 的目标本体',
            { forbidPromptContext: true },
        );
        await expect(page.locator('[data-minion-uid="orcs-hammer-weak-1"]').first()).toBeVisible({ timeout: 15000 });

        const targetOptions = await game.getInteractionOptions() as InteractionOption[];
        expect(targetOptions.filter(option => option.value?.minionUid?.startsWith('orcs-hammer-weak')).length).toBe(2);
        expect(targetOptions.some(option => option.value?.minionUid === 'orcs-hammer-strong-0')).toBe(false);
        await hideSmashUpDebugPanelForEvidence(page);
        await game.screenshot('兽人-重击者-手动选择力量目标', testInfo);

        await clickManualMinionChoice(page, 'orcs-hammer-weak-0', '重击者选择目标随从');
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);
        await expect(page.locator('[data-minion-uid="orcs-hammer-weak-0"]')).toHaveCount(0);
        await expect(page.locator('[data-minion-uid="orcs-hammer-weak-1"]')).toHaveCount(1);
        await expect(page.locator('[data-minion-uid="orcs-hammer-strong-0"]')).toHaveCount(1);
        await hideSmashUpDebugPanelForEvidence(page);
        await game.screenshot('兽人-重击者-结算后', testInfo);
    });

    test('兽人粉碎者真实入口保留手动天赋按钮并记录已使用状态', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinOrcsTopperChopperScene());

        await game.playCard('munchkin_orcs_topper_chopper', { targetBaseIndex: 0 });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);
        await expect(page.locator('[data-minion-uid="orcs-topper-1"]').first()).toBeVisible({ timeout: 15000 });
        await hideSmashUpDebugPanelForEvidence(page);
        await game.screenshot('兽人-粉碎者-天赋可用', testInfo);

        await page.locator('[data-minion-uid="orcs-topper-1"]').first().click({ force: true });
        await waitForSmashUpFxToSettle(page);
        await expect(page.getByTestId('su-minion-used-badge-orcs-topper-1')).toBeVisible({ timeout: 15000 });
        const state = await game.getState();
        const core = state.core as { bases: Array<{ minions: Array<{ uid: string; talentUsed?: boolean }> }> };
        expect(core.bases.flatMap(base => base.minions).find(minion => minion.uid === 'orcs-topper-1')?.talentUsed).toBe(true);
        await hideSmashUpDebugPanelForEvidence(page);
        await game.screenshot('兽人-粉碎者-天赋已使用', testInfo);
    });

    test('兽人给我！真实入口先选附着行动再选己方新宿主', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinOrcsGimmeScene());

        const host = page.locator('[data-minion-uid="orcs-gimme-host"]').first();
        const target = page.locator('[data-minion-uid="orcs-gimme-target"]').first();
        await expect(page.locator('[data-card-uid="orcs-gimme-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(host).toBeVisible({ timeout: 15000 });
        await expect(target).toBeVisible({ timeout: 15000 });
        await host.hover();
        await expect(page.locator('[data-attached-action-uid="orcs-gimme-attached"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('兽人-给我-打出前附着行动与新宿主', testInfo);

        await game.playCard('munchkin_orcs_gimme');
        await game.waitForInteraction('munchkin_orcs_gimme_action', 10000);
        await waitForSmashUpFxToSettle(page);
        const actionOptions = await game.getInteractionOptions() as InteractionOption[];
        expect(actionOptions.some(option => option.value?.cardUid === 'orcs-gimme-attached')).toBe(true);
        await page.mouse.move(24, 24);
        await expectManualChoiceVisible(
            page,
            '[data-attached-action-uid="orcs-gimme-attached"]',
            '给我第一步选择附着行动卡本体',
            { forbidPromptContext: true },
        );
        await hideSmashUpDebugPanelForEvidence(page);
        await game.screenshot('兽人-给我-第一步手动选择附着行动', testInfo);
        await page.locator('[data-attached-action-uid="orcs-gimme-attached"]').first().click({ force: true });

        await game.waitForInteraction('munchkin_orcs_gimme_minion', 10000);
        await waitForSmashUpFxToSettle(page);
        const minionOptions = await game.getInteractionOptions() as InteractionOption[];
        expect(minionOptions.some(option => option.value?.minionUid === 'orcs-gimme-target')).toBe(true);
        expect(minionOptions.some(option => option.value?.minionUid === 'orcs-gimme-host')).toBe(false);
        await expectManualMinionChoiceVisible(
            page,
            'orcs-gimme-target',
            '给我第二步选择己方新宿主随从本体',
            { forbidPromptContext: true },
        );
        await hideSmashUpDebugPanelForEvidence(page);
        await game.screenshot('兽人-给我-第二步手动选择己方新宿主', testInfo);
        await clickManualMinionChoice(page, 'orcs-gimme-target', '给我选择己方新宿主');
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const sourceHost = core.bases[0].minions.find(minion => minion.uid === 'orcs-gimme-host');
            const newHost = core.bases[1].minions.find(minion => minion.uid === 'orcs-gimme-target');
            const player1 = core.players?.['1'] as SmashUpPlayerCoreSlice | undefined;
            return {
                sourceHostPresent: Boolean(sourceHost),
                targetAttachedUids: newHost?.attachedActions?.map(action => action.uid) ?? [],
                player1DiscardDefIds: player1?.discard?.map(card => card.defId) ?? [],
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            sourceHostPresent: false,
            targetAttachedUids: ['orcs-gimme-attached'],
            player1DiscardDefIds: ['alien_invader'],
            interactionSourceId: null,
        });
        await target.hover();
        await expect(target.locator('[data-attached-action-uid="orcs-gimme-attached"]').first()).toBeVisible({ timeout: 15000 });
        await hideSmashUpDebugPanelForEvidence(page);
        await game.screenshot('兽人-给我-转移后行动保留在新宿主', testInfo);
    });

    test('兽人给我！移动端横屏先选附着行动再选己方新宿主并收口', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 844, height: 390 });
        await page.addInitScript(() => {
            (window as Window & { __BG_FORCE_COARSE_POINTER__?: boolean }).__BG_FORCE_COARSE_POINTER__ = true;
        });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinOrcsGimmeScene());

        const host = page.locator('[data-minion-uid="orcs-gimme-host"]').first();
        const target = page.locator('[data-minion-uid="orcs-gimme-target"]').first();
        const attachedAction = page.locator('[data-attached-action-uid="orcs-gimme-attached"]').first();
        await expect(page.locator('[data-card-uid="orcs-gimme-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(host).toBeVisible({ timeout: 15000 });
        await expect(target).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('移动端-兽人给我-手牌与两个宿主', testInfo);

        await host.click({ force: true });
        await expect(host).toHaveAttribute('data-attached-overlay-visible', 'true');
        await expect(attachedAction).toBeVisible({ timeout: 15000 });
        await game.screenshot('移动端-兽人给我-展开附着行动', testInfo);

        const gimmeCard = page.locator('[data-card-uid="orcs-gimme-1"]').first();
        await gimmeCard.click({ force: true });
        await page.waitForTimeout(300);
        await expect(gimmeCard, '移动端给我第一次点击后应保留待确认的手牌卡本体').toBeVisible({ timeout: 15000 });
        await game.screenshot('移动端-兽人给我-手牌卡待确认', testInfo);
        await gimmeCard.click({ force: true });
        await game.waitForInteraction('munchkin_orcs_gimme_action', 10000);
        await waitForSmashUpFxToSettle(page);
        await expectCurrentInteractionManual(game, '移动端给我第一步选择附着行动');
        await expectManualChoiceVisible(
            page,
            '[data-attached-action-uid="orcs-gimme-attached"]',
            '移动端给我第一步必须显示附着行动本体供玩家手动选择',
            { forbidPromptContext: true },
        );
        await game.screenshot('移动端-兽人给我-手动选择附着行动', testInfo);
        await attachedAction.click({ force: true });

        await game.waitForInteraction('munchkin_orcs_gimme_minion', 10000);
        await waitForSmashUpFxToSettle(page);
        await expectCurrentInteractionManual(game, '移动端给我第二步选择己方新宿主');
        const minionOptions = await game.getInteractionOptions() as InteractionOption[];
        expect(minionOptions.some(option => option.value?.minionUid === 'orcs-gimme-target')).toBe(true);
        expect(minionOptions.some(option => option.value?.minionUid === 'orcs-gimme-host')).toBe(false);
        await expectManualMinionChoiceVisible(
            page,
            'orcs-gimme-target',
            '移动端给我第二步必须显示己方新宿主本体供玩家手动选择',
            { forbidPromptContext: true },
        );
        await game.screenshot('移动端-兽人给我-手动选择己方新宿主', testInfo);
        await clickManualMinionChoice(page, 'orcs-gimme-target', '移动端给我选择己方新宿主');

        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);
        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const sourceHost = core.bases[0].minions.find(minion => minion.uid === 'orcs-gimme-host');
            const newHost = core.bases[1].minions.find(minion => minion.uid === 'orcs-gimme-target');
            const player1 = core.players?.['1'] as SmashUpPlayerCoreSlice | undefined;
            return {
                sourceHostPresent: Boolean(sourceHost),
                targetAttachedUids: newHost?.attachedActions?.map(action => action.uid) ?? [],
                player1DiscardDefIds: player1?.discard?.map(card => card.defId) ?? [],
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            sourceHostPresent: false,
            targetAttachedUids: ['orcs-gimme-attached'],
            player1DiscardDefIds: ['alien_invader'],
            interactionSourceId: null,
        });

        const mobileResolutionEvidence = await page.evaluate(() => {
            const inViewport = (selector: string) => {
                const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                return !!rect
                    && rect.width > 24
                    && rect.height > 24
                    && rect.left >= -2
                    && rect.right <= window.innerWidth + 2
                    && rect.top >= -2
                    && rect.bottom <= window.innerHeight + 2;
            };
            return {
                noUnexpectedOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
                sourceBaseVisible: inViewport('[data-base-index="0"]'),
                targetBaseVisible: inViewport('[data-base-index="1"]'),
                handVisible: inViewport('[data-testid="su-hand-area"]'),
                turnTrackerVisible: inViewport('[data-testid="su-turn-tracker"]'),
                endTurnVisible: inViewport('button[aria-label*="结束回合"], button[aria-label*="End turn"]'),
                monsterDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-monster-discard"]'),
                treasureDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-treasure-discard"]'),
            };
        });
        expect(mobileResolutionEvidence, '移动端给我收口后两个基地、宿主、手牌、公共小牌和原版操作入口应可见且无横向溢出').toEqual({
            noUnexpectedOverflow: true,
            sourceBaseVisible: true,
            targetBaseVisible: true,
            handVisible: true,
            turnTrackerVisible: true,
            endTurnVisible: true,
            monsterDiscardAbsent: true,
            treasureDiscardAbsent: true,
        });
        await target.click({ force: true });
        await expect(target).toHaveAttribute('data-attached-overlay-visible', 'true');
        await expect(attachedAction).toBeVisible({ timeout: 15000 });
        await game.screenshot('移动端-兽人给我-转移后行动保留在新宿主', testInfo);
    });

    test('兽人洗手间从真实手牌入口手动选择附着基地', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinOrcsStallingPlacementScene());

        await expect(page.locator('[data-card-uid="orcs-stalling-placement-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-base-index="0"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-base-index="1"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('兽人-洗手间-手牌打出前两个基地', testInfo);

        await page.locator('[data-card-uid="orcs-stalling-placement-1"]').first().click({ force: true });
        await waitForSmashUpFxToSettle(page);
        await expect(page.locator('[data-base-index="0"] > div').first()).toHaveClass(/ring-(green|emerald)-400/);
        await expect(page.locator('[data-base-index="1"] > div').first()).toHaveClass(/ring-(green|emerald)-400/);
        await expectManualChoiceVisible(
            page,
            '[data-base-index="0"]',
            '洗手间打出后应显示可手动选择的附着基地本体',
            { forbidPromptContext: true },
        );
        await game.screenshot('兽人-洗手间-手动选择附着基地', testInfo);
        await page.locator('[data-base-index="0"]').first().click({ force: true });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        const state = await game.getState();
        const core = state.core as RocketBootsCoreState;
        const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;
        expect(core.bases[0].ongoingActions?.some(action => action.uid === 'orcs-stalling-placement-1')).toBe(true);
        expect(player0?.hand?.some(card => card.uid === 'orcs-stalling-placement-1')).toBe(false);
        expect(player0?.actionsPlayed).toBe(1);
        expect(state.sys?.interaction?.current ?? null).toBeNull();
        await game.screenshot('兽人-洗手间-已附着到目标基地', testInfo);
    });

    test('兽人洗手间移动端横屏手动选择附着基地并收口', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 844, height: 390 });
        await page.addInitScript(() => {
            (window as Window & { __BG_FORCE_COARSE_POINTER__?: boolean }).__BG_FORCE_COARSE_POINTER__ = true;
        });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinOrcsStallingPlacementScene());

        const action = page.locator('[data-card-uid="orcs-stalling-placement-1"]').first();
        await expect(action).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-base-index="0"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-base-index="1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('移动端-兽人洗手间-手牌与两个候选基地', testInfo);

        await action.click({ force: true });
        await waitForSmashUpFxToSettle(page);
        await expect(page.locator('[data-base-index="0"] > div').first()).toHaveClass(/ring-(green|emerald)-400/);
        await expect(page.locator('[data-base-index="1"] > div').first()).toHaveClass(/ring-(green|emerald)-400/);
        await expectManualChoiceVisible(
            page,
            '[data-base-index="0"]',
            '移动端洗手间必须显示附着基地本体供玩家手动选择',
            { forbidPromptContext: true },
        );
        await game.screenshot('移动端-兽人洗手间-手动选择附着基地', testInfo);
        await clickManualBaseChoice(page, 0, '移动端洗手间选择附着基地');
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            return {
                targetBaseHasStalling: core.bases[0].ongoingActions?.some(actionCard => actionCard.uid === 'orcs-stalling-placement-1') ?? false,
                otherBaseHasStalling: core.bases[1].ongoingActions?.some(actionCard => actionCard.uid === 'orcs-stalling-placement-1') ?? false,
                handHasAction: core.players?.['0']?.hand?.some(card => card.uid === 'orcs-stalling-placement-1') ?? false,
                actionsPlayed: core.players?.['0']?.actionsPlayed ?? null,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            targetBaseHasStalling: true,
            otherBaseHasStalling: false,
            handHasAction: false,
            actionsPlayed: 1,
            interactionSourceId: null,
        });

        const mobileResolutionEvidence = await page.evaluate(() => {
            const inViewport = (selector: string) => {
                const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                return !!rect
                    && rect.width > 24
                    && rect.height > 24
                    && rect.left >= -2
                    && rect.right <= window.innerWidth + 2
                    && rect.top >= -2
                    && rect.bottom <= window.innerHeight + 2;
            };
            const supplyBadgeInViewport = (selector: string) => {
                const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                return !!rect
                    && rect.width > 0
                    && rect.height > 0
                    && rect.left >= -2
                    && rect.right <= window.innerWidth + 2
                    && rect.top >= -2
                    && rect.bottom <= window.innerHeight + 2;
            };
            return {
                noUnexpectedOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
                sourceBaseVisible: inViewport('[data-base-index="0"]'),
                otherBaseVisible: inViewport('[data-base-index="1"]'),
                handVisible: inViewport('[data-testid="su-hand-area"]'),
                supplyVisible: supplyBadgeInViewport('[data-testid="su-munchkin-monster-supply-card"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-monster-supply-count"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-treasure-supply-card"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-treasure-supply-count"]'),
                turnTrackerVisible: inViewport('[data-testid="su-turn-tracker"]'),
                endTurnVisible: inViewport('button[aria-label*="结束回合"], button[aria-label*="End turn"]'),
                monsterDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-monster-discard"]'),
                treasureDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-treasure-discard"]'),
            };
        });
        expect(mobileResolutionEvidence, '移动端洗手间收口后两座基地、手牌、公共小牌和原版操作入口应可见且无横向溢出').toEqual({
            noUnexpectedOverflow: true,
            sourceBaseVisible: true,
            otherBaseVisible: true,
            handVisible: true,
            supplyVisible: true,
            turnTrackerVisible: true,
            endTurnVisible: true,
            monsterDiscardAbsent: true,
            treasureDiscardAbsent: true,
        });
        await game.screenshot('移动端-兽人洗手间-附着后收口', testInfo);
    });

    test('兽人太难了从真实手牌入口手动选择附着随从', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);
        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinOrcsTooToughPlacementScene());

        await expect(page.locator('[data-card-uid="orcs-too-tough-placement-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-too-tough-placement-target"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-too-tough-placement-other"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('兽人-太难了-手牌打出前两个候选随从', testInfo);

        await page.locator('[data-card-uid="orcs-too-tough-placement-1"]').first().click({ force: true });
        await waitForSmashUpFxToSettle(page);
        await expectManualMinionChoiceVisible(
            page,
            'orcs-too-tough-placement-target',
            '太难了打出后应显示可手动选择的附着随从本体',
            { forbidPromptContext: true },
        );
        await game.screenshot('兽人-太难了-手动选择附着随从', testInfo);
        await clickManualMinionChoice(page, 'orcs-too-tough-placement-target', '太难了选择附着宿主随从');
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        const state = await game.getState();
        const core = state.core as RocketBootsCoreState;
        const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;
        const target = core.bases[0].minions.find(minion => minion.uid === 'orcs-too-tough-placement-target');
        expect(target?.attachedActions?.some(action => action.uid === 'orcs-too-tough-placement-1')).toBe(true);
        expect(player0?.hand?.some(card => card.uid === 'orcs-too-tough-placement-1')).toBe(false);
        expect(player0?.actionsPlayed).toBe(1);
        expect(state.sys?.interaction?.current ?? null).toBeNull();
        await game.screenshot('兽人-太难了-已附着到目标随从', testInfo);
    });

    test('兽人太难了移动端横屏手动选择附着随从并收口', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 844, height: 390 });
        await page.addInitScript(() => {
            (window as Window & { __BG_FORCE_COARSE_POINTER__?: boolean }).__BG_FORCE_COARSE_POINTER__ = true;
        });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinOrcsTooToughPlacementScene());

        const action = page.locator('[data-card-uid="orcs-too-tough-placement-1"]').first();
        await expect(action).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-too-tough-placement-target"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-too-tough-placement-other"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('移动端-兽人太难了-手牌与两个候选随从', testInfo);

        await action.click({ force: true });
        await waitForSmashUpFxToSettle(page);
        await expectManualMinionChoiceVisible(
            page,
            'orcs-too-tough-placement-target',
            '移动端太难了必须显示附着随从本体供玩家手动选择',
            { forbidPromptContext: true },
        );
        await game.screenshot('移动端-兽人太难了-手动选择附着随从', testInfo);
        await clickManualMinionChoice(page, 'orcs-too-tough-placement-target', '移动端太难了选择附着宿主');
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const target = core.bases[0].minions.find(minion => minion.uid === 'orcs-too-tough-placement-target');
            return {
                targetAttached: target?.attachedActions?.some(card => card.uid === 'orcs-too-tough-placement-1') ?? false,
                otherAttached: core.bases[0].minions.find(minion => minion.uid === 'orcs-too-tough-placement-other')?.attachedActions?.length ?? 0,
                handHasAction: core.players?.['0']?.hand?.some(card => card.uid === 'orcs-too-tough-placement-1') ?? false,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            targetAttached: true,
            otherAttached: 0,
            handHasAction: false,
            interactionSourceId: null,
        });

        const mobileResolutionEvidence = await page.evaluate(() => {
            const inViewport = (selector: string) => {
                const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                return !!rect
                    && rect.width > 24
                    && rect.height > 24
                    && rect.left >= -2
                    && rect.right <= window.innerWidth + 2
                    && rect.top >= -2
                    && rect.bottom <= window.innerHeight + 2;
            };
            return {
                noUnexpectedOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
                baseVisible: inViewport('[data-base-index="0"]'),
                handVisible: inViewport('[data-testid="su-hand-area"]'),
                turnTrackerVisible: inViewport('[data-testid="su-turn-tracker"]'),
                endTurnVisible: inViewport('button[aria-label*="结束回合"], button[aria-label*="End turn"]'),
                monsterDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-monster-discard"]'),
                treasureDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-treasure-discard"]'),
            };
        });
        expect(mobileResolutionEvidence, '移动端太难了收口后基地、手牌、公共小牌和原版操作入口应可见且无横向溢出').toEqual({
            noUnexpectedOverflow: true,
            baseVisible: true,
            handVisible: true,
            turnTrackerVisible: true,
            endTurnVisible: true,
            monsterDiscardAbsent: true,
            treasureDiscardAbsent: true,
        });
        await page.locator('[data-minion-uid="orcs-too-tough-placement-target"]').first().click({ force: true });
        await expect(page.locator('[data-attached-action-uid="orcs-too-tough-placement-1"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('移动端-兽人太难了-附着后收口', testInfo);
    });

    test('兽人挤碎真实入口按基地、玩家、随从三步手动选择', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinOrcsCrushScene());

        await expect(page.locator('[data-card-uid="orcs-crush-action-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-crush-defender"]').first()).toBeVisible({ timeout: 15000 });

        await game.playCard('munchkin_orcs_crush');
        await game.waitForInteraction('munchkin_orcs_crush_base', 10000);
        await waitForSmashUpFxToSettle(page);
        await expectManualChoiceVisible(
            page,
            '[data-base-index="0"]',
            '挤碎第一步应显示基地本体',
            { forbidPromptContext: true },
        );
        await game.screenshot('兽人-挤碎-第一步手动选择基地', testInfo);
        await game.selectInteractionOptionBy(option => option.value?.baseIndex === 0, '挤碎选择目标基地');

        await game.waitForInteraction('munchkin_orcs_crush_player', 10000);
        await waitForSmashUpFxToSettle(page);
        const playerOptions = await game.getInteractionOptions() as InteractionOption[];
        expect(playerOptions).toHaveLength(1);
        expect(playerOptions[0]?.value?.targetPlayerId).toBe('1');
        await expect(page.getByText(/AI 2 号位|AI 2/i)).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('prompt-context-card')).toHaveCount(0);
        await game.screenshot('兽人-挤碎-第二步手动选择仆从更少玩家', testInfo);
        await game.selectInteractionOptionBy(option => option.value?.targetPlayerId === '1', '挤碎选择仆从更少的玩家');

        await game.waitForInteraction('munchkin_orcs_crush_minion', 10000);
        await waitForSmashUpFxToSettle(page);
        await expectManualMinionChoiceVisible(
            page,
            'orcs-crush-defender',
            '挤碎第三步应显示要摧毁的随从本体',
            { forbidPromptContext: true },
        );
        await game.screenshot('兽人-挤碎-第三步手动选择要摧毁随从', testInfo);
        await clickManualMinionChoice(page, 'orcs-crush-defender', '挤碎选择要摧毁的随从');

        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);
        await expect(page.locator('[data-minion-uid="orcs-crush-defender"]')).toHaveCount(0);
        const finalState = await game.getState() as {
            core?: { players?: Record<string, { discard?: Array<{ uid?: string }> }> };
        };
        expect(finalState.core?.players?.['1']?.discard?.some(card => card.uid === 'orcs-crush-defender')).toBe(true);
        await game.screenshot('兽人-挤碎-目标随从被摧毁后', testInfo);
    });

    test('兽人挤碎移动端横屏按基地、玩家、随从三步手动选择并收口', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 844, height: 390 });
        await page.addInitScript(() => {
            (window as Window & { __BG_FORCE_COARSE_POINTER__?: boolean }).__BG_FORCE_COARSE_POINTER__ = true;
        });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinOrcsCrushScene());

        await expect(page.locator('[data-card-uid="orcs-crush-action-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-crush-defender"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('移动端-兽人挤碎-手牌与两座基地', testInfo);

        await game.playCard('munchkin_orcs_crush');
        await game.waitForInteraction('munchkin_orcs_crush_base', 10000);
        await waitForSmashUpFxToSettle(page);
        await expectCurrentInteractionManual(game, '移动端挤碎第一步选择基地');
        await expectManualChoiceVisible(
            page,
            '[data-base-index="0"]',
            '移动端挤碎第一步必须显示基地本体供玩家手动选择',
            { forbidPromptContext: true },
        );
        await game.screenshot('移动端-兽人挤碎-手动选择基地', testInfo);
        await clickManualBaseChoice(page, 0, '移动端挤碎选择目标基地');

        await game.waitForInteraction('munchkin_orcs_crush_player', 10000);
        await waitForSmashUpFxToSettle(page);
        await expectCurrentInteractionManual(game, '移动端挤碎第二步选择玩家');
        const playerOptions = await game.getInteractionOptions() as InteractionOption[];
        expect(playerOptions).toHaveLength(1);
        expect(playerOptions[0]?.value?.targetPlayerId).toBe('1');
        await game.screenshot('移动端-兽人挤碎-手动选择目标玩家', testInfo);
        await clickVisibleInteractionOptionBy(
            page,
            game,
            (option: InteractionOption) => option.value?.targetPlayerId === '1',
            '移动端挤碎选择仆从更少的玩家',
        );

        await game.waitForInteraction('munchkin_orcs_crush_minion', 10000);
        await waitForSmashUpFxToSettle(page);
        await expectCurrentInteractionManual(game, '移动端挤碎第三步选择随从');
        await expectManualMinionChoiceVisible(
            page,
            'orcs-crush-defender',
            '移动端挤碎第三步必须显示目标随从本体供玩家手动选择',
            { forbidPromptContext: true },
        );
        await game.screenshot('移动端-兽人挤碎-手动选择目标随从', testInfo);
        await clickManualMinionChoice(page, 'orcs-crush-defender', '移动端挤碎选择要摧毁的随从');

        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);
        await expect(page.locator('[data-minion-uid="orcs-crush-defender"]')).toHaveCount(0);
        const finalState = await game.getState() as {
            core?: {
                bases?: Array<{ minions?: Array<{ uid?: string }> }>;
                players?: Record<string, { discard?: Array<{ uid?: string }> }>;
            };
        };
        expect(finalState.core?.bases?.[0]?.minions?.some(minion => minion.uid === 'orcs-crush-defender')).toBe(false);
        expect(finalState.core?.players?.['1']?.discard?.some(card => card.uid === 'orcs-crush-defender')).toBe(true);
        expect(finalState.core?.players?.['0']?.discard?.some(card => card.uid === 'orcs-crush-action-1')).toBe(true);

        const mobileResolutionEvidence = await page.evaluate(() => {
            const inViewport = (selector: string) => {
                const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                return !!rect
                    && rect.width > 24
                    && rect.height > 24
                    && rect.left >= -2
                    && rect.right <= window.innerWidth + 2
                    && rect.top >= -2
                    && rect.bottom <= window.innerHeight + 2;
            };
            return {
                noUnexpectedOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
                baseVisible: inViewport('[data-base-index="0"]'),
                targetBaseVisible: inViewport('[data-base-index="1"]'),
                handVisible: inViewport('[data-testid="su-hand-area"]'),
                turnTrackerVisible: inViewport('[data-testid="su-turn-tracker"]'),
                endTurnVisible: inViewport('button[aria-label*="结束回合"], button[aria-label*="End turn"]'),
                monsterDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-monster-discard"]'),
                treasureDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-treasure-discard"]'),
            };
        });
        expect(mobileResolutionEvidence, '移动端挤碎收口后基地、手牌、公共小牌和原版操作入口应可见且无横向溢出').toEqual({
            noUnexpectedOverflow: true,
            baseVisible: true,
            targetBaseVisible: true,
            handVisible: true,
            turnTrackerVisible: true,
            endTurnVisible: true,
            monsterDiscardAbsent: true,
            treasureDiscardAbsent: true,
        });
        await game.screenshot('移动端-兽人挤碎-目标随从被摧毁后', testInfo);
    });

    test('兽人挤碎移动端无合法目标时不生成隐藏交互并保持手牌', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 844, height: 390 });
        await page.addInitScript(() => {
            (window as Window & { __BG_FORCE_COARSE_POINTER__?: boolean }).__BG_FORCE_COARSE_POINTER__ = true;
        });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinOrcsCrushScene({ includeDefender: false }));

        const action = page.locator('[data-card-uid="orcs-crush-action-1"]').first();
        await expect(action).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-crush-attacker-a"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-base-index="1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('移动端-兽人挤碎-无合法目标前手牌与两座基地', testInfo);

        await action.click({ force: true });
        await waitForSmashUpFxToSettle(page);
        await game.waitForNoInteraction(10000);

        await expect.poll(async () => {
            const state = await game.getState();
            return {
                phase: state.sys?.phase,
                actionInHand: state.core.players?.['0']?.hand?.some((card: { uid?: string }) => card.uid === 'orcs-crush-action-1') ?? false,
                actionInDiscard: state.core.players?.['0']?.discard?.some((card: { uid?: string }) => card.uid === 'orcs-crush-action-1') ?? false,
                ownMinionsUnchanged: state.core.bases[0]?.minions.filter((entry: { controller?: string }) => entry.controller === '0').map((entry: { uid?: string }) => entry.uid) ?? [],
                defenderAbsent: !state.core.bases.some((base: { minions?: Array<{ uid?: string }> }) => base.minions?.some(entry => entry.uid === 'orcs-crush-defender')),
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 15000 }).toEqual({
            phase: 'playCards',
            actionInHand: true,
            actionInDiscard: false,
            ownMinionsUnchanged: ['orcs-crush-attacker-a', 'orcs-crush-attacker-b'],
            defenderAbsent: true,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await expect(page.locator('[data-testid="smashup-reaction-prompt"], [data-testid="smashup-docked-prompt"]')).toHaveCount(0);

        const mobileResolutionEvidence = await page.evaluate(() => {
            const inViewport = (selector: string) => {
                const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                return !!rect
                    && rect.width > 24
                    && rect.height > 24
                    && rect.left >= -2
                    && rect.right <= window.innerWidth + 2
                    && rect.top >= -2
                    && rect.bottom <= window.innerHeight + 2;
            };
            return {
                noUnexpectedOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
                sourceBaseVisible: inViewport('[data-base-index="0"]'),
                targetBaseVisible: inViewport('[data-base-index="1"]'),
                handVisible: inViewport('[data-testid="su-hand-area"]'),
                turnTrackerVisible: inViewport('[data-testid="su-turn-tracker"]'),
                endTurnVisible: inViewport('button[aria-label*="结束回合"], button[aria-label*="End turn"]'),
                monsterDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-monster-discard"]'),
                treasureDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-treasure-discard"]'),
            };
        });
        expect(mobileResolutionEvidence, '移动端挤碎无合法目标时应保持手牌并保留两座基地、公共小牌和原版操作入口，且无横向溢出').toEqual({
            noUnexpectedOverflow: true,
            sourceBaseVisible: true,
            targetBaseVisible: true,
            handVisible: true,
            turnTrackerVisible: true,
            endTurnVisible: true,
            monsterDiscardAbsent: true,
            treasureDiscardAbsent: true,
        });

        await game.screenshot('移动端-兽人挤碎-无合法目标保持手牌且不生成隐藏交互', testInfo);
    });

    test('兽人躺下！计分前真实响应先手动选择行动并压制其他玩家特殊能力', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinOrcsAndStayDownScene());

        await expect(page.locator('[data-card-uid="orcs-stay-down-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-base-index="0"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('兽人-躺下-计分前手牌与要塞', testInfo);

        await game.advancePhase();
        await page.waitForFunction(
            () => {
                const state = (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.();
                return state?.sys?.phase === 'scoreBases'
                    && state?.sys?.responseWindow?.current?.windowType === 'meFirst'
                    && state?.sys?.interaction?.current?.data?.sourceId === 'smashup_reaction_choose';
            },
            { timeout: 20000, polling: 200 },
        );

        await expect.poll(async () => {
            const options = await game.getInteractionOptions() as InteractionOption[];
            return options.some(option =>
                option.value?.kind === 'play_action'
                && option.value?.cardUid === 'orcs-stay-down-1'
                && option.value?.targetBaseIndex === 0,
            );
        }, { timeout: 10000 }).toBe(true);
        await game.screenshot('兽人-躺下-计分前手动选择响应', testInfo);

        await game.selectInteractionOptionBy(
            option => option.value?.kind === 'play_action'
                && option.value?.cardUid === 'orcs-stay-down-1'
                && option.value?.targetBaseIndex === 0,
            '计分前选择躺下',
        );

        await expect.poll(async () => {
            const state = await game.getState();
            const entries = (state.sys?.eventStream?.entries ?? []).map((entry: EventStreamEntry) => entry.event);
            return {
                hasSuppressionEvent: entries.some((event: any) =>
                    event?.type === 'su:base_metadata_updated'
                    && event.payload?.baseIndex === 0
                    && event.payload?.metadataUpdate?.andStayDownSuppressorPlayerId === '0',
                ),
                hasCardInDiscard: state.core.players?.['0']?.discard?.some((card: any) => card.uid === 'orcs-stay-down-1') ?? false,
            };
        }, { timeout: 15000 }).toEqual({ hasSuppressionEvent: true, hasCardInDiscard: true });
        await waitForSmashUpFxToSettle(page);
        await game.screenshot('兽人-躺下-压制状态结算后', testInfo);
    });

    test('兽人愤怒的掠夺者计分前真实响应手动选择后获得 1 VP', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinOrcsAngryPillagersScene());

        await expect(page.locator('[data-card-uid="orcs-angry-1"]').first()).toBeVisible({ timeout: 15000 });
        await game.advancePhase();
        await page.waitForFunction(
            () => {
                const state = (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.();
                return state?.sys?.phase === 'scoreBases'
                    && state?.sys?.responseWindow?.current?.windowType === 'meFirst'
                    && state?.sys?.interaction?.current?.data?.sourceId === 'smashup_reaction_choose';
            },
            { timeout: 20000, polling: 200 },
        );

        await expect.poll(async () => {
            const options = await game.getInteractionOptions() as InteractionOption[];
            return options.some(option =>
                option.value?.kind === 'play_action'
                && option.value?.cardUid === 'orcs-angry-1'
                && option.value?.targetBaseIndex === 0,
            );
        }, { timeout: 10000 }).toBe(true);
        await game.screenshot('兽人-愤怒的掠夺者-计分前手动选择响应', testInfo);

        await game.selectInteractionOptionBy(
            option => option.value?.kind === 'play_action'
                && option.value?.cardUid === 'orcs-angry-1'
                && option.value?.targetBaseIndex === 0,
            '计分前选择愤怒的掠夺者',
        );

        await expect.poll(async () => {
            const state = await game.getState();
            const events = (state.sys?.eventStream?.entries ?? []).map((entry: EventStreamEntry) => entry.event);
            return {
                vp: state.core.players?.['0']?.vp ?? 0,
                hasCardInDiscard: state.core.players?.['0']?.discard?.some((card: any) => card.uid === 'orcs-angry-1') ?? false,
                hasAngryBonus: events.some((event: any) =>
                    event?.type === 'su:vp_awarded'
                    && event.payload?.playerId === '0'
                    && event.payload?.amount === 1
                    && event.payload?.reason === 'munchkin_orcs_angry_pillagers',
                ),
            };
        }, { timeout: 15000 }).toEqual({ vp: 8, hasCardInDiscard: true, hasAngryBonus: true });
        await waitForSmashUpFxToSettle(page);
        await game.screenshot('兽人-愤怒的掠夺者-获得 VP 后', testInfo);
    });

    test('兽人要塞真实计分按玩家总力量 22 门槛给两名最高玩家额外 VP', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinOrcsBaseScoringScene({
            baseDefId: 'base_garrison',
            ownPower: 12,
            opponentPower: 10,
            turnNumber: 31,
        }));

        await expect(page.locator('[data-base-index="0"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-score-own"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-score-opponent"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('兽人-要塞-计分前总力量达到22', testInfo);

        await game.advancePhase();
        await page.waitForFunction(
            () => {
                const state = (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.();
                return state?.sys?.phase === 'scoreBases' || state?.sys?.phase === 'playCards';
            },
            { timeout: 15000, polling: 200 },
        );
        const responseStatus = await getReactionWindowStatus(page);
        if (responseStatus.sourceId === 'smashup_reaction_choose') {
            const responseOptions = await game.getInteractionOptions() as InteractionOption[];
            expect(responseOptions.some(option => option.value?.kind === 'pass')).toBe(true);
            await game.screenshot('兽人-要塞-计分前响应入口', testInfo);
        }

        for (let attempt = 0; attempt < 12; attempt += 1) {
            const state = await game.getState();
            if (state.sys?.phase === 'playCards' && !state.sys?.interaction?.current) break;
            const didPass = await passOpenReactionOrResponseWindow(page, game, `要塞计分前让过响应 ${attempt + 1}`);
            if (!didPass) await page.waitForTimeout(300);
        }

        await expect.poll(async () => {
            const state = await game.getState();
            return {
                phase: state.sys?.phase,
                ownVp: state.core.players?.['0']?.vp ?? 0,
                opponentVp: state.core.players?.['1']?.vp ?? 0,
                scoredBaseLeftBoard: !state.core.bases?.some((base: any) => base.defId === 'base_garrison'),
                scoredBaseCleared: state.core.bases?.[0]?.minions?.length === 0,
            };
        }, { timeout: 20000 }).toEqual({
            phase: 'playCards',
            ownVp: 8,
            opponentVp: 7,
            scoredBaseLeftBoard: true,
            scoredBaseCleared: true,
        });
        await waitForSmashUpFxToSettle(page);
        await game.screenshot('兽人-要塞-达到22后两名玩家获得额外VP', testInfo);
    });

    test('兽人要塞移动端横屏真实计分后保留额外VP与公共小牌入口', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 844, height: 390 });
        await page.addInitScript(() => {
            (window as Window & { __BG_FORCE_COARSE_POINTER__?: boolean }).__BG_FORCE_COARSE_POINTER__ = true;
        });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinOrcsBaseScoringScene({
            baseDefId: 'base_garrison',
            ownPower: 12,
            opponentPower: 10,
            turnNumber: 34,
        }));

        await expect(page.locator('[data-base-index="0"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-score-own"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-score-opponent"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('移动端-兽人要塞-计分前总力量达到22', testInfo);

        await game.advancePhase();
        await page.waitForFunction(
            () => {
                const state = (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.();
                return state?.sys?.phase === 'scoreBases' || state?.sys?.phase === 'playCards';
            },
            { timeout: 15000, polling: 200 },
        );

        for (let attempt = 0; attempt < 12; attempt += 1) {
            const state = await game.getState();
            if (state.sys?.phase === 'playCards' && !state.sys?.interaction?.current) break;
            const didPass = await passOpenReactionOrResponseWindow(page, game, '移动端要塞计分前让过响应 ' + (attempt + 1));
            if (!didPass) await page.waitForTimeout(300);
        }

        await expect.poll(async () => {
            const state = await game.getState();
            return {
                phase: state.sys?.phase,
                ownVp: state.core.players?.['0']?.vp ?? 0,
                opponentVp: state.core.players?.['1']?.vp ?? 0,
                scoredBaseLeftBoard: !state.core.bases?.some((base: { defId?: string }) => base.defId === 'base_garrison'),
                scoredBaseCleared: state.core.bases?.[0]?.minions?.length === 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 20000 }).toEqual({
            phase: 'playCards',
            ownVp: 8,
            opponentVp: 7,
            scoredBaseLeftBoard: true,
            scoredBaseCleared: true,
            interactionSourceId: null,
            responseWindowType: null,
        });

        await expect(page.locator('[data-testid="su-special-supply-row"]:visible')).toHaveCount(1);
        await expect(page.locator('[data-testid="su-munchkin-monster-supply-card"]:visible')).toHaveCount(1);
        await expect(page.locator('[data-testid="su-munchkin-monster-supply-count"]:visible')).toHaveCount(1);
        await expect(page.locator('[data-testid="su-munchkin-treasure-supply-card"]:visible')).toHaveCount(1);
        await expect(page.locator('[data-testid="su-munchkin-treasure-supply-count"]:visible')).toHaveCount(1);

        const mobileResolutionEvidence = await page.evaluate(() => {
            const inViewport = (selector: string) => {
                const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                return !!rect
                    && rect.width > 24
                    && rect.height > 24
                    && rect.left >= -2
                    && rect.right <= window.innerWidth + 2
                    && rect.top >= -2
                    && rect.bottom <= window.innerHeight + 2;
            };
            return {
                noUnexpectedOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
                baseVisible: inViewport('[data-base-index="0"]'),
                handVisible: inViewport('[data-testid="su-hand-area"]'),
                turnTrackerVisible: inViewport('[data-testid="su-turn-tracker"]'),
                endTurnVisible: inViewport('button[aria-label*="结束回合"], button[aria-label*="End turn"]'),
                monsterDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-monster-discard"]'),
                treasureDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-treasure-discard"]'),
            };
        });
        expect(mobileResolutionEvidence, '移动端要塞计分收口后额外VP、基地、公共小牌和原版操作入口应可见且无横向溢出').toEqual({
            noUnexpectedOverflow: true,
            baseVisible: true,
            handVisible: true,
            turnTrackerVisible: true,
            endTurnVisible: true,
            monsterDiscardAbsent: true,
            treasureDiscardAbsent: true,
        });

        await waitForSmashUpFxToSettle(page);
        await game.screenshot('移动端-兽人要塞-计分后额外VP与公共小牌入口', testInfo);
    });

    test('兽人要塞移动端总力量低于22时不奖励额外VP并清场', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 844, height: 390 });
        await page.addInitScript(() => {
            (window as Window & { __BG_FORCE_COARSE_POINTER__?: boolean }).__BG_FORCE_COARSE_POINTER__ = true;
        });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinOrcsBaseScoringScene({
            baseDefId: 'base_garrison',
            ownPower: 11,
            opponentPower: 10,
            turnNumber: 35,
        }));

        await expect(page.locator('[data-base-index="0"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-score-own"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-score-opponent"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('移动端-兽人要塞-总力量21计分前不触发额外VP', testInfo);

        await game.advancePhase();
        await page.waitForFunction(
            () => {
                const state = (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.();
                return state?.sys?.phase === 'scoreBases' || state?.sys?.phase === 'playCards';
            },
            { timeout: 15000, polling: 200 },
        );

        for (let attempt = 0; attempt < 12; attempt += 1) {
            const state = await game.getState();
            if (state.sys?.phase === 'playCards' && !state.sys?.interaction?.current) break;
            const didPass = await passOpenReactionOrResponseWindow(page, game, '移动端要塞低于22计分前让过响应 ' + (attempt + 1));
            if (!didPass) await page.waitForTimeout(300);
        }

        await expect.poll(async () => {
            const state = await game.getState();
            return {
                phase: state.sys?.phase,
                ownVp: state.core.players?.['0']?.vp ?? 0,
                opponentVp: state.core.players?.['1']?.vp ?? 0,
                scoredBaseLeftBoard: !state.core.bases?.some((base: { defId?: string }) => base.defId === 'base_garrison'),
                scoredBaseCleared: state.core.bases?.[0]?.minions?.length === 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 20000 }).toEqual({
            phase: 'playCards',
            ownVp: 7,
            opponentVp: 6,
            scoredBaseLeftBoard: true,
            scoredBaseCleared: true,
            interactionSourceId: null,
            responseWindowType: null,
        });

        const mobileResolutionEvidence = await page.evaluate(() => {
            const inViewport = (selector: string) => {
                const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                return !!rect
                    && rect.width > 24
                    && rect.height > 24
                    && rect.left >= -2
                    && rect.right <= window.innerWidth + 2
                    && rect.top >= -2
                    && rect.bottom <= window.innerHeight + 2;
            };
            const supplyBadgeInViewport = (selector: string) => {
                const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                return !!rect
                    && rect.width > 0
                    && rect.height > 0
                    && rect.left >= -2
                    && rect.right <= window.innerWidth + 2
                    && rect.top >= -2
                    && rect.bottom <= window.innerHeight + 2;
            };
            return {
                noUnexpectedOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
                baseVisible: inViewport('[data-base-index="0"]'),
                handVisible: inViewport('[data-testid="su-hand-area"]'),
                supplyVisible: supplyBadgeInViewport('[data-testid="su-munchkin-monster-supply-card"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-monster-supply-count"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-treasure-supply-card"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-treasure-supply-count"]'),
                turnTrackerVisible: inViewport('[data-testid="su-turn-tracker"]'),
                endTurnVisible: inViewport('button[aria-label*="结束回合"], button[aria-label*="End turn"]'),
                monsterDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-monster-discard"]'),
                treasureDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-treasure-discard"]'),
            };
        });
        expect(mobileResolutionEvidence, '移动端要塞低于22收口后不得新增弃牌堆或挤压原版操作入口').toEqual({
            noUnexpectedOverflow: true,
            baseVisible: true,
            handVisible: true,
            supplyVisible: true,
            turnTrackerVisible: true,
            endTurnVisible: true,
            monsterDiscardAbsent: true,
            treasureDiscardAbsent: true,
        });

        await waitForSmashUpFxToSettle(page);
        await game.screenshot('移动端-兽人要塞-总力量21计分后仅基础VP并清场', testInfo);
    });

    test('兽人要塞移动端并列最高且少于三名玩家时两名玩家均获额外VP', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 844, height: 390 });
        await page.addInitScript(() => {
            (window as Window & { __BG_FORCE_COARSE_POINTER__?: boolean }).__BG_FORCE_COARSE_POINTER__ = true;
        });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinOrcsBaseScoringScene({
            baseDefId: 'base_garrison',
            ownPower: 11,
            opponentPower: 11,
            turnNumber: 36,
        }));

        await expect(page.locator('[data-base-index="0"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-score-own"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-score-opponent"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('移动端-兽人要塞-并列最高两名玩家计分前', testInfo);

        await game.advancePhase();
        await page.waitForFunction(
            () => {
                const state = (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.();
                return state?.sys?.phase === 'scoreBases' || state?.sys?.phase === 'playCards';
            },
            { timeout: 15000, polling: 200 },
        );

        for (let attempt = 0; attempt < 12; attempt += 1) {
            const state = await game.getState();
            if (state.sys?.phase === 'playCards' && !state.sys?.interaction?.current) break;
            const didPass = await passOpenReactionOrResponseWindow(page, game, `移动端要塞并列最高计分前让过响应 ${attempt + 1}`);
            if (!didPass) await page.waitForTimeout(300);
        }

        await expect.poll(async () => {
            const state = await game.getState();
            return {
                phase: state.sys?.phase,
                ownVp: state.core.players?.['0']?.vp ?? 0,
                opponentVp: state.core.players?.['1']?.vp ?? 0,
                scoredBaseLeftBoard: !state.core.bases?.some((base: { defId?: string }) => base.defId === 'base_garrison'),
                scoredBaseCleared: state.core.bases?.[0]?.minions?.length === 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 20000 }).toMatchObject({
            phase: 'playCards',
            ownVp: 8,
            opponentVp: 8,
            scoredBaseLeftBoard: true,
            scoredBaseCleared: true,
            interactionSourceId: null,
            responseWindowType: null,
        });

        const finalState = await game.getState();
        const scoreEvent = (finalState as { sys?: { eventStream?: { entries?: EventStreamEntry[] } } }).sys?.eventStream?.entries
            ?.map((entry: EventStreamEntry) => entry.event)
            .find((event: TriggerQueueEvidenceEvent | undefined) => event?.type === 'su:base_scored' && event.payload?.baseDefId === 'base_garrison');
        expect(scoreEvent?.payload?.rankings?.filter(ranking => ranking.power === 11)).toEqual([
            { playerId: '0', power: 11, vp: 4 },
            { playerId: '1', power: 11, vp: 4 },
        ]);

        const mobileResolutionEvidence = await page.evaluate(() => {
            const inViewport = (selector: string) => {
                const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                return !!rect
                    && rect.width > 24
                    && rect.height > 24
                    && rect.left >= -2
                    && rect.right <= window.innerWidth + 2
                    && rect.top >= -2
                    && rect.bottom <= window.innerHeight + 2;
            };
            const supplyBadgeInViewport = (selector: string) => {
                const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                return !!rect
                    && rect.width > 0
                    && rect.height > 0
                    && rect.left >= -2
                    && rect.right <= window.innerWidth + 2
                    && rect.top >= -2
                    && rect.bottom <= window.innerHeight + 2;
            };
            return {
                noUnexpectedOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
                baseVisible: inViewport('[data-base-index="0"]'),
                handVisible: inViewport('[data-testid="su-hand-area"]'),
                supplyVisible: supplyBadgeInViewport('[data-testid="su-munchkin-monster-supply-card"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-monster-supply-count"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-treasure-supply-card"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-treasure-supply-count"]'),
                turnTrackerVisible: inViewport('[data-testid="su-turn-tracker"]'),
                endTurnVisible: inViewport('button[aria-label*="结束回合"], button[aria-label*="End turn"]'),
                monsterDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-monster-discard"]'),
                treasureDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-treasure-discard"]'),
            };
        });
        expect(mobileResolutionEvidence, '移动端要塞并列计分收口后两名玩家额外VP、公共小牌和原版操作入口应可见且无横向溢出').toEqual({
            noUnexpectedOverflow: true,
            baseVisible: true,
            handVisible: true,
            supplyVisible: true,
            turnTrackerVisible: true,
            endTurnVisible: true,
            monsterDiscardAbsent: true,
            treasureDiscardAbsent: true,
        });

        await waitForSmashUpFxToSettle(page);
        await game.screenshot('移动端-兽人要塞-并列最高两名玩家各获额外VP并清场', testInfo);
    });

    test('兽人坑洞真实计分达到16后清场并保留原版计分布局', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinOrcsBaseScoringScene({
            baseDefId: 'base_the_pits',
            ownPower: 9,
            opponentPower: 7,
            turnNumber: 32,
        }));

        await expect(page.locator('[data-base-index="0"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-score-own"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-score-opponent"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('兽人-坑洞-计分前总力量达到16', testInfo);

        await game.advancePhase();
        await page.waitForFunction(
            () => {
                const state = (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.();
                return state?.sys?.phase === 'scoreBases' || state?.sys?.phase === 'playCards';
            },
            { timeout: 15000, polling: 200 },
        );
        const responseStatus = await getReactionWindowStatus(page);
        if (responseStatus.sourceId === 'smashup_reaction_choose') {
            const responseOptions = await game.getInteractionOptions() as InteractionOption[];
            expect(responseOptions.some(option => option.value?.kind === 'pass')).toBe(true);
            await game.screenshot('兽人-坑洞-计分前响应入口', testInfo);
        }

        for (let attempt = 0; attempt < 12; attempt += 1) {
            const state = await game.getState();
            if (state.sys?.phase === 'playCards' && !state.sys?.interaction?.current) break;
            const didPass = await passOpenReactionOrResponseWindow(page, game, `坑洞计分前让过响应 ${attempt + 1}`);
            if (!didPass) await page.waitForTimeout(300);
        }

        await expect.poll(async () => {
            const state = await game.getState();
            return {
                phase: state.sys?.phase,
                ownVp: state.core.players?.['0']?.vp ?? 0,
                opponentVp: state.core.players?.['1']?.vp ?? 0,
                scoredBaseLeftBoard: !state.core.bases?.some((base: any) => base.defId === 'base_the_pits'),
                scoredBaseCleared: state.core.bases?.[0]?.minions?.length === 0,
            };
        }, { timeout: 20000 }).toEqual({
            phase: 'playCards',
            ownVp: 8,
            opponentVp: 6,
            scoredBaseLeftBoard: true,
            scoredBaseCleared: true,
        });
        await waitForSmashUpFxToSettle(page);
        await game.screenshot('兽人-坑洞-计分清场后保留原版布局', testInfo);
    });

    test('兽人坑洞移动端横屏真实计分后保留公共小牌与原版操作入口', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 844, height: 390 });
        await page.addInitScript(() => {
            (window as Window & { __BG_FORCE_COARSE_POINTER__?: boolean }).__BG_FORCE_COARSE_POINTER__ = true;
        });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinOrcsBaseScoringScene({
            baseDefId: 'base_the_pits',
            ownPower: 9,
            opponentPower: 7,
            turnNumber: 33,
        }));

        await expect(page.locator('[data-base-index="0"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-score-own"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-score-opponent"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('移动端-兽人坑洞-计分前基地与公共小牌', testInfo);

        await page.evaluate(() => {
            const state = (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.();
            if (state?.sys?.phase !== 'playCards') throw new Error('兽人坑洞移动端测试必须从 playCards 真实入口开始');
        });
        await game.advancePhase();
        await page.waitForFunction(
            () => {
                const state = (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.();
                return state?.sys?.phase === 'scoreBases' || state?.sys?.phase === 'playCards';
            },
            { timeout: 15000, polling: 200 },
        );

        for (let attempt = 0; attempt < 12; attempt += 1) {
            const state = await game.getState();
            if (state.sys?.phase === 'playCards' && !state.sys?.interaction?.current) break;
            const didPass = await passOpenReactionOrResponseWindow(page, game, `移动端坑洞计分前让过响应 ${attempt + 1}`);
            if (!didPass) await page.waitForTimeout(300);
        }

        await expect.poll(async () => {
            const state = await game.getState();
            return {
                phase: state.sys?.phase,
                ownVp: state.core.players?.['0']?.vp ?? 0,
                opponentVp: state.core.players?.['1']?.vp ?? 0,
                scoredBaseLeftBoard: !state.core.bases?.some((base: { defId?: string }) => base.defId === 'base_the_pits'),
                scoredBaseCleared: state.core.bases?.[0]?.minions?.length === 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 20000 }).toEqual({
            phase: 'playCards',
            ownVp: 8,
            opponentVp: 6,
            scoredBaseLeftBoard: true,
            scoredBaseCleared: true,
            interactionSourceId: null,
            responseWindowType: null,
        });

        await expect(page.locator('[data-testid="su-special-supply-row"]:visible')).toHaveCount(1);
        await expect(page.locator('[data-testid="su-munchkin-monster-supply-card"]:visible')).toHaveCount(1);
        await expect(page.locator('[data-testid="su-munchkin-monster-supply-count"]:visible')).toHaveCount(1);
        await expect(page.locator('[data-testid="su-munchkin-treasure-supply-card"]:visible')).toHaveCount(1);
        await expect(page.locator('[data-testid="su-munchkin-treasure-supply-count"]:visible')).toHaveCount(1);

        const mobileResolutionEvidence = await page.evaluate(() => {
            const inViewport = (selector: string) => {
                const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                return !!rect
                    && rect.width > 24
                    && rect.height > 24
                    && rect.left >= -2
                    && rect.right <= window.innerWidth + 2
                    && rect.top >= -2
                    && rect.bottom <= window.innerHeight + 2;
            };
            return {
                noUnexpectedOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
                baseVisible: inViewport('[data-base-index="0"]'),
                handVisible: inViewport('[data-testid="su-hand-area"]'),
                turnTrackerVisible: inViewport('[data-testid="su-turn-tracker"]'),
                endTurnVisible: inViewport('button[aria-label*="结束回合"], button[aria-label*="End turn"]'),
                monsterDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-monster-discard"]'),
                treasureDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-treasure-discard"]'),
            };
        });
        expect(mobileResolutionEvidence, '移动端坑洞计分收口后基地、手牌、公共小牌数量、回合入口应可见且无横向溢出').toEqual({
            noUnexpectedOverflow: true,
            baseVisible: true,
            handVisible: true,
            turnTrackerVisible: true,
            endTurnVisible: true,
            monsterDiscardAbsent: true,
            treasureDiscardAbsent: true,
        });

        await waitForSmashUpFxToSettle(page);
        await game.screenshot('移动端-兽人坑洞-计分清场后保留公共小牌与操作入口', testInfo);
    });

    test('兽人狗堆在计分前真实响应仍按随从再基地手动选择', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinOrcsDogpileSpecialScene());

        await expect(page.locator('[data-card-uid="orcs-dogpile-special-1"]').first()).toBeVisible({ timeout: 15000 });
        await game.advancePhase();
        await page.waitForFunction(
            () => {
                const state = (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.();
                return state?.sys?.phase === 'scoreBases'
                    && state?.sys?.responseWindow?.current?.windowType === 'meFirst'
                    && state?.sys?.interaction?.current?.data?.sourceId === 'smashup_reaction_choose';
            },
            { timeout: 20000, polling: 200 },
        );

        await game.selectInteractionOptionBy(
            option => option.value?.kind === 'play_action'
                && option.value?.cardUid === 'orcs-dogpile-special-1'
                && option.value?.targetBaseIndex === 0,
            '计分前选择狗堆',
        );
        await game.waitForInteraction('munchkin_orcs_dogpile_minion', 10000);
        await waitForSmashUpFxToSettle(page);
        await expectManualMinionChoiceVisible(
            page,
            'orcs-dogpile-source',
            '狗堆计分前响应第一步应显示待移动随从本体',
            { forbidPromptContext: true },
        );
        await game.screenshot('兽人-狗堆-计分前手动选择随从', testInfo);
        await clickManualMinionChoice(page, 'orcs-dogpile-source', '狗堆选择计分前移动随从');

        await game.waitForInteraction('munchkin_orcs_dogpile_base', 10000);
        await waitForSmashUpFxToSettle(page);
        await expect(page.locator('[data-base-index="1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('prompt-context-card')).toHaveCount(0);
        await game.screenshot('兽人-狗堆-计分前手动选择目标基地', testInfo);
        await game.selectInteractionOptionBy(option => option.value?.baseIndex === 1, '狗堆选择计分前目标基地');

        await expect.poll(async () => {
            const state = await game.getState();
            return {
                sourcePresent: state.core.bases[0].minions.some((entry: any) => entry.uid === 'orcs-dogpile-source'),
                targetPresent: state.core.bases[1].minions.some((entry: any) => entry.uid === 'orcs-dogpile-source'),
                hasCardInDiscard: state.core.players?.['0']?.discard?.some((card: any) => card.uid === 'orcs-dogpile-special-1') ?? false,
            };
        }, { timeout: 15000 }).toEqual({ sourcePresent: false, targetPresent: true, hasCardInDiscard: true });
        await waitForSmashUpFxToSettle(page);
        await game.screenshot('兽人-狗堆-计分前移动结算后', testInfo);
    });

    test('兽人狗堆移动端横屏仍按随从再基地手动选择并收口', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 844, height: 390 });
        await page.addInitScript(() => {
            (window as Window & { __BG_FORCE_COARSE_POINTER__?: boolean }).__BG_FORCE_COARSE_POINTER__ = true;
        });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinOrcsDogpileSpecialScene());

        await expect(page.locator('[data-card-uid="orcs-dogpile-special-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('移动端-兽人狗堆-计分前手牌与两座基地', testInfo);

        await game.advancePhase();
        await page.waitForFunction(
            () => {
                const state = (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.();
                return state?.sys?.phase === 'scoreBases'
                    && state?.sys?.responseWindow?.current?.windowType === 'meFirst'
                    && state?.sys?.interaction?.current?.data?.sourceId === 'smashup_reaction_choose';
            },
            { timeout: 20000, polling: 200 },
        );
        await expect(page.locator('[data-testid="smashup-reaction-prompt"] .smashup-prompt-content')).toBeVisible({ timeout: 10000 });
        await game.screenshot('移动端-兽人狗堆-beforeScoring响应入口', testInfo);

        await clickVisibleInteractionOptionBy(
            page,
            game,
            (option: InteractionOption) =>
                option.value?.kind === 'play_action'
                && option.value?.cardUid === 'orcs-dogpile-special-1'
                && option.value?.targetBaseIndex === 0,
            '移动端狗堆计分前手动选择行动',
        );
        await game.waitForInteraction('munchkin_orcs_dogpile_minion', 10000);
        await waitForSmashUpFxToSettle(page);
        await expectManualMinionChoiceVisible(
            page,
            'orcs-dogpile-source',
            '移动端狗堆必须显示待移动随从本体',
            { forbidPromptContext: true },
        );
        await game.screenshot('移动端-兽人狗堆-手动选择随从', testInfo);
        await clickManualMinionChoice(page, 'orcs-dogpile-source', '移动端狗堆选择待移动随从');

        await game.waitForInteraction('munchkin_orcs_dogpile_base', 10000);
        await waitForSmashUpFxToSettle(page);
        await expectCurrentInteractionManual(game, '移动端狗堆选择目标基地');
        await expectManualChoiceVisible(
            page,
            '[data-base-index="1"]',
            '移动端狗堆必须显示目标基地本体供玩家手动选择',
            { forbidPromptContext: true },
        );
        await game.screenshot('移动端-兽人狗堆-手动选择目标基地', testInfo);
        await clickManualBaseChoice(page, 1, '移动端狗堆选择目标基地');

        await expect.poll(async () => {
            const state = await game.getState();
            const interactionSourceId = state.sys?.interaction?.current?.data?.sourceId ?? '';
            return {
                sourcePresent: state.core.bases[0].minions.some((entry: { uid?: string }) => entry.uid === 'orcs-dogpile-source'),
                targetPresent: state.core.bases[1].minions.some((entry: { uid?: string }) => entry.uid === 'orcs-dogpile-source'),
                hasCardInDiscard: state.core.players?.['0']?.discard?.some((card: { uid?: string }) => card.uid === 'orcs-dogpile-special-1') ?? false,
                dogpileInteractionClosed: !interactionSourceId.includes('munchkin_orcs_dogpile'),
            };
        }, { timeout: 15000 }).toEqual({
            sourcePresent: false,
            targetPresent: true,
            hasCardInDiscard: true,
            dogpileInteractionClosed: true,
        });

        await expect(page.locator('[data-testid="su-special-supply-row"]:visible')).toHaveCount(1);
        await expect(page.locator('[data-testid="su-munchkin-monster-supply-card"]:visible')).toHaveCount(1);
        await expect(page.locator('[data-testid="su-munchkin-monster-supply-count"]:visible')).toHaveCount(1);
        await expect(page.locator('[data-testid="su-munchkin-treasure-supply-card"]:visible')).toHaveCount(1);
        await expect(page.locator('[data-testid="su-munchkin-treasure-supply-count"]:visible')).toHaveCount(1);

        const mobileResolutionEvidence = await page.evaluate(() => {
            const inViewport = (selector: string) => {
                const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                return !!rect
                    && rect.width > 24
                    && rect.height > 24
                    && rect.left >= -2
                    && rect.right <= window.innerWidth + 2
                    && rect.top >= -2
                    && rect.bottom <= window.innerHeight + 2;
            };
            return {
                noUnexpectedOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
                sourceBaseVisible: inViewport('[data-base-index="0"]'),
                targetBaseVisible: inViewport('[data-base-index="1"]'),
                handVisible: inViewport('[data-testid="su-hand-area"]'),
                turnTrackerVisible: inViewport('[data-testid="su-turn-tracker"]'),
                endTurnVisible: inViewport('button[aria-label*="结束回合"], button[aria-label*="End turn"]'),
                monsterDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-monster-discard"]'),
                treasureDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-treasure-discard"]'),
            };
        });
        expect(mobileResolutionEvidence, '移动端狗堆结算后两座基地、公共小牌、手牌和原版操作入口应可见且无横向溢出').toEqual({
            noUnexpectedOverflow: true,
            sourceBaseVisible: true,
            targetBaseVisible: true,
            handVisible: true,
            turnTrackerVisible: true,
            endTurnVisible: true,
            monsterDiscardAbsent: true,
            treasureDiscardAbsent: true,
        });

        await waitForSmashUpFxToSettle(page);
        await game.screenshot('移动端-兽人狗堆-随从移动后流程收口', testInfo);
    });

    test('兽人狗堆移动端无合法目标时不生成隐藏基地交互并保持手牌', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 844, height: 390 });
        await page.addInitScript(() => {
            (window as Window & { __BG_FORCE_COARSE_POINTER__?: boolean }).__BG_FORCE_COARSE_POINTER__ = true;
        });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinOrcsDogpileSpecialScene({ includeTargetBaseMinions: false }));

        const action = page.locator('[data-card-uid="orcs-dogpile-special-1"]').first();
        await expect(action).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-dogpile-source"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-base-index="1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('移动端-兽人狗堆-无合法目标前手牌与两座基地', testInfo);

        await action.click({ force: true });
        await waitForSmashUpFxToSettle(page);
        await game.waitForNoInteraction(10000);

        await expect.poll(async () => {
            const state = await game.getState();
            return {
                phase: state.sys?.phase,
                actionInHand: state.core.players?.['0']?.hand?.some((card: { uid?: string }) => card.uid === 'orcs-dogpile-special-1') ?? false,
                actionInDiscard: state.core.players?.['0']?.discard?.some((card: { uid?: string }) => card.uid === 'orcs-dogpile-special-1') ?? false,
                sourcePresent: state.core.bases[0]?.minions.some((entry: { uid?: string }) => entry.uid === 'orcs-dogpile-source') ?? false,
                targetBaseOwnMinionCount: state.core.bases[1]?.minions.filter((entry: { controller?: string }) => entry.controller === '0').length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 15000 }).toEqual({
            phase: 'playCards',
            actionInHand: true,
            actionInDiscard: false,
            sourcePresent: true,
            targetBaseOwnMinionCount: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await expect(page.locator('[data-testid="smashup-reaction-prompt"], [data-testid="smashup-docked-prompt"]')).toHaveCount(0);

        const mobileResolutionEvidence = await page.evaluate(() => {
            const inViewport = (selector: string) => {
                const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                return !!rect
                    && rect.width > 24
                    && rect.height > 24
                    && rect.left >= -2
                    && rect.right <= window.innerWidth + 2
                    && rect.top >= -2
                    && rect.bottom <= window.innerHeight + 2;
            };
            return {
                noUnexpectedOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
                sourceBaseVisible: inViewport('[data-base-index="0"]'),
                targetBaseVisible: inViewport('[data-base-index="1"]'),
                handVisible: inViewport('[data-testid="su-hand-area"]'),
                turnTrackerVisible: inViewport('[data-testid="su-turn-tracker"]'),
                endTurnVisible: inViewport('button[aria-label*="结束回合"], button[aria-label*="End turn"]'),
                monsterDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-monster-discard"]'),
                treasureDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-treasure-discard"]'),
            };
        });
        expect(mobileResolutionEvidence, '移动端狗堆无合法目标时应保持手牌并保留两座基地、公共小牌和原版操作入口，且无横向溢出').toEqual({
            noUnexpectedOverflow: true,
            sourceBaseVisible: true,
            targetBaseVisible: true,
            handVisible: true,
            turnTrackerVisible: true,
            endTurnVisible: true,
            monsterDiscardAbsent: true,
            treasureDiscardAbsent: true,
        });

        await game.screenshot('移动端-兽人狗堆-无合法目标保持手牌且不生成隐藏交互', testInfo);
    });

    test('兽人洗手间在对手行动后把手动保护选择交给行动卡控制者', async ({ page, game }, _testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true, seat1: 'human', playerID: '0' }, 20000);
        await game.setupScene(buildMunchkinOrcsStallingScene());
        const targetPage = await openSmashUpPlayerView(page, '1');

        try {
            await expect(page.locator('[data-card-uid="orcs-stalling-action-1"]').first()).toBeVisible({ timeout: 15000 });
            await expect(page.locator('[data-minion-uid="orcs-stalling-defender"]').first()).toBeVisible({ timeout: 15000 });
            const initialState = await game.getState();
            await mirrorSmashUpHarnessState(targetPage, initialState);
            await expect(targetPage.locator('[data-minion-uid="orcs-stalling-defender"]').first()).toBeVisible({ timeout: 15000 });

            await game.playCard('munchkin_orcs_crush');
            await game.waitForInteraction('munchkin_orcs_crush_base', 10000);
            await game.selectInteractionOptionBy(option => option.value?.baseIndex === 0, '挤碎选择洗手间所在基地');
            await waitForSmashUpFxToSettle(page);

            const reactionState = await game.getState();
            await mirrorSmashUpHarnessState(targetPage, reactionState);
            await targetPage.waitForFunction(
                () => (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.()?.sys?.interaction?.current?.data?.sourceId
                    === 'munchkin_orcs_stalling_minion',
                { timeout: 10000, polling: 200 },
            );
            await waitForSmashUpFxToSettle(targetPage);
            await expectManualMinionChoiceVisible(
                targetPage,
                'orcs-stalling-defender',
                '洗手间应把保护选择交给控制者并显示随从本体',
                { forbidPromptContext: true },
            );
            await saveMunchkinEvidenceScreenshot(targetPage, '兽人-洗手间-手动选择保护随从.png');
            await clickManualMinionChoice(targetPage, 'orcs-stalling-defender', '洗手间选择保护随从');
            await targetPage.waitForFunction(
                () => (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.()?.sys?.interaction?.current?.data?.sourceId
                    === 'munchkin_orcs_crush_player',
                { timeout: 10000, polling: 200 },
            );

            const protectedState = await targetPage.evaluate(() => (
                (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.()
            ));
            await mirrorSmashUpHarnessState(page, protectedState);

            await game.waitForInteraction('munchkin_orcs_crush_player', 10000);
            await game.selectInteractionOptionBy(
                option => option.value?.targetPlayerId === '1',
                '挤碎手动选择仆从更少的玩家',
            );
            await waitForSmashUpFxToSettle(page);

            await game.waitForInteraction('munchkin_orcs_crush_minion', 10000);
            await game.selectInteractionOptionBy(
                option => option.value?.minionUid === 'orcs-stalling-defender',
                '挤碎手动选择目标玩家的仆从',
            );
            await waitForSmashUpFxToSettle(page);
            await expect.poll(async () => {
                const state = await game.getState();
                const protectedMinion = state.core.bases[0].minions.find((entry: any) => entry.uid === 'orcs-stalling-defender');
                return {
                    protectedAction: protectedMinion?.metadata?.stallingProtectedActionDefId ?? null,
                    protectedTurn: protectedMinion?.metadata?.stallingProtectedTurnNumber ?? null,
                    interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                };
            }, { timeout: 10000 }).toEqual({
                protectedAction: 'munchkin_orcs_crush',
                protectedTurn: 29,
                    interactionSourceId: null,
                });
            const finalState = await game.getState();
            await mirrorSmashUpHarnessState(targetPage, finalState);
            await saveMunchkinEvidenceScreenshot(targetPage, '兽人-洗手间-保护状态结算后.png');
        } finally {
            await targetPage.close();
        }
    });

    test('兽人洗手间移动端明确跳过保护后继续结算并清理', async ({ page, game }, testInfo) => {
        test.setTimeout(120000);

        await page.setViewportSize({ width: 844, height: 390 });
        await page.addInitScript(() => {
            (window as Window & { __BG_FORCE_COARSE_POINTER__?: boolean }).__BG_FORCE_COARSE_POINTER__ = true;
        });
        await game.openTestGame('smashup', { skipInitialization: true, seat1: 'human', playerID: '0' }, 20000);
        await game.setupScene(buildMunchkinOrcsStallingScene());
        const targetPage = await openSmashUpPlayerView(page, '1');
        await targetPage.setViewportSize({ width: 844, height: 390 });

        try {
            await expect(page.locator('[data-card-uid="orcs-stalling-action-1"]').first()).toBeVisible({ timeout: 15000 });
            await expect(page.locator('[data-base-index="0"]').first()).toBeVisible({ timeout: 15000 });
            await expect(page.locator('[data-minion-uid="orcs-stalling-defender"]').first()).toBeVisible({ timeout: 15000 });
            await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
            await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
            await game.screenshot('移动端-兽人洗手间-跳过保护前手牌与基地', testInfo);

            const actionCard = page.locator('[data-card-uid="orcs-stalling-action-1"]').first();
            await actionCard.click({ force: true });
            await page.waitForTimeout(300);
            await actionCard.click({ force: true });
            await game.waitForInteraction('munchkin_orcs_crush_base', 10000);
            await clickManualBaseChoice(page, 0, '移动端洗手间跳过链选择行动目标基地');

            const reactionState = await game.getState();
            await mirrorSmashUpHarnessState(targetPage, reactionState);
            await targetPage.waitForFunction(
                () => (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.()?.sys?.interaction?.current?.data?.sourceId
                    === 'munchkin_orcs_stalling_minion',
                { timeout: 10000, polling: 200 },
            );
            await waitForSmashUpFxToSettle(targetPage);
            await expectManualMinionChoiceVisible(
                targetPage,
                'orcs-stalling-defender',
                '移动端洗手间跳过前必须显示可保护的随从本体',
                { forbidPromptContext: true },
            );
            await expect(targetPage.getByRole('button', { name: /不保护|跳过|让过|Skip|Pass/i }).first()).toBeVisible({ timeout: 10000 });
            await targetPage.waitForFunction(() => {
                const baseFrames = Array.from(document.querySelectorAll<HTMLElement>('[data-base-index] [data-card-atlas-frame]'));
                return baseFrames.length >= 2 && baseFrames.every((frame) => {
                    const image = frame.querySelector<HTMLImageElement>('[data-card-atlas-img]');
                    return !frame.classList.contains('atlas-shimmer')
                        && !!image
                        && image.complete
                        && image.naturalWidth > 0
                        && image.naturalHeight > 0;
                });
            }, { timeout: 15000, polling: 200 });
            await saveMunchkinEvidenceScreenshot(targetPage, '兽人-洗手间-移动端-保护选择与明确跳过.png');
            await clickVisibleInteractionOptionBy(
                targetPage,
                game,
                option => option.value?.skip === true,
                '移动端洗手间明确跳过保护',
            );

            const skippedState = await targetPage.evaluate(() => (
                (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.()
            )) as {
                core?: {
                    bases?: Array<{
                        minions?: Array<{
                            uid?: string;
                            metadata?: {
                                stallingProtectedActionDefId?: string;
                            };
                        }>;
                    }>;
                };
                sys?: {
                    interaction?: {
                        current?: {
                            data?: {
                                sourceId?: string | null;
                            };
                        };
                    };
                };
            };
            const skippedMinion = skippedState.core?.bases?.[0]?.minions?.find(
                (entry: { uid?: string }) => entry.uid === 'orcs-stalling-defender',
            );
            expect(skippedMinion?.metadata?.stallingProtectedActionDefId ?? null).toBeNull();
            expect(skippedState.sys?.interaction?.current?.data?.sourceId).toBe('munchkin_orcs_crush_player');
            await mirrorSmashUpHarnessState(page, skippedState);

            await game.waitForInteraction('munchkin_orcs_crush_player', 10000);
            await clickVisibleInteractionOptionBy(
                page,
                game,
                option => option.value?.targetPlayerId === '1',
                '移动端洗手间跳过后选择目标玩家',
            );
            await game.waitForInteraction('munchkin_orcs_crush_minion', 10000);
            await expectManualMinionChoiceVisible(
                page,
                'orcs-stalling-defender',
                '移动端洗手间跳过后仍必须显示原目标随从',
                { forbidPromptContext: true },
            );
            await clickManualMinionChoice(page, 'orcs-stalling-defender', '移动端洗手间跳过后选择目标随从');

            await expect.poll(async () => {
                const state = await game.getState();
                const targetMinion = state.core.bases[0].minions.find((entry: { uid?: string }) => entry.uid === 'orcs-stalling-defender');
                return {
                    targetOnBase: Boolean(targetMinion),
                    targetInDiscard: state.core.players?.['1']?.discard?.some((card: { uid?: string }) => card.uid === 'orcs-stalling-defender') ?? false,
                    actionInDiscard: state.core.players?.['0']?.discard?.some((card: { uid?: string }) => card.uid === 'orcs-stalling-action-1') ?? false,
                    protectedAction: targetMinion?.metadata?.stallingProtectedActionDefId ?? null,
                    interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                    responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
                };
            }, { timeout: 15000 }).toEqual({
                targetOnBase: false,
                targetInDiscard: true,
                actionInDiscard: true,
                protectedAction: null,
                interactionSourceId: null,
                responseWindowType: null,
            });
            await waitForSmashUpFxToSettle(page);

            const mobileResolutionEvidence = await page.evaluate(() => {
                const inViewport = (selector: string) => {
                    const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                    return !!rect && rect.width > 24 && rect.height > 24 && rect.left >= -2 && rect.right <= window.innerWidth + 2 && rect.top >= -2 && rect.bottom <= window.innerHeight + 2;
                };
                const supplyBadgeInViewport = (selector: string) => {
                    const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                    return !!rect && rect.width > 0 && rect.height > 0 && rect.left >= -2 && rect.right <= window.innerWidth + 2 && rect.top >= -2 && rect.bottom <= window.innerHeight + 2;
                };
                return {
                    noUnexpectedOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
                    firstBaseVisible: inViewport('[data-base-index="0"]'),
                    secondBaseVisible: inViewport('[data-base-index="1"]'),
                    handVisible: inViewport('[data-testid="su-hand-area"]'),
                    supplyVisible: supplyBadgeInViewport('[data-testid="su-munchkin-monster-supply-card"]')
                        && supplyBadgeInViewport('[data-testid="su-munchkin-monster-supply-count"]')
                        && supplyBadgeInViewport('[data-testid="su-munchkin-treasure-supply-card"]')
                        && supplyBadgeInViewport('[data-testid="su-munchkin-treasure-supply-count"]'),
                    turnTrackerVisible: inViewport('[data-testid="su-turn-tracker"]'),
                    endTurnVisible: inViewport('button[aria-label*="结束回合"], button[aria-label*="End turn"]'),
                };
            });
            expect(mobileResolutionEvidence, '移动端洗手间跳过后应保留原版牌桌布局并收口').toEqual({
                noUnexpectedOverflow: true,
                firstBaseVisible: true,
                secondBaseVisible: true,
                handVisible: true,
                supplyVisible: true,
                turnTrackerVisible: true,
                endTurnVisible: true,
            });
            await game.screenshot('移动端-兽人洗手间-跳过保护后目标被摧毁并收口', testInfo);
        } finally {
            await targetPage.close();
        }
    });

    test('兽人死亡之息真实入口排除附着太难了的受保护随从', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinOrcsDeathBreathProtectionScene());

        await expect(page.locator('[data-card-uid="orcs-death-breath-action-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-death-breath-protected"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-death-breath-free"]').first()).toBeVisible({ timeout: 15000 });

        await game.playCard('munchkin_orcs_death_breath');
        await game.waitForInteraction('munchkin_orcs_death_breath_target', 10000);
        await waitForSmashUpFxToSettle(page);
        const targetOptions = await game.getInteractionOptions() as InteractionOption[];
        expect(targetOptions.some(option => option.value?.minionUid === 'orcs-death-breath-free')).toBe(true);
        expect(targetOptions.some(option => option.value?.minionUid === 'orcs-death-breath-protected')).toBe(false);
        await expectManualMinionChoiceVisible(
            page,
            'orcs-death-breath-free',
            '死亡之息应把未受太难了保护的随从作为唯一可选目标',
            { forbidPromptContext: true },
        );
        await game.screenshot('兽人-死亡之息-过滤太难了保护目标', testInfo);
        await clickManualMinionChoice(page, 'orcs-death-breath-free', '死亡之息选择未受保护随从');
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect(page.locator('[data-minion-uid="orcs-death-breath-free"]')).toHaveCount(0);
        await expect(page.locator('[data-minion-uid="orcs-death-breath-protected"]')).toHaveCount(1);
        const state = await game.getState();
        expect(state.core.players?.['1']?.deck?.some((card: any) => card.uid === 'orcs-death-breath-free')).toBe(true);
        await game.screenshot('兽人-死亡之息-受保护随从保留', testInfo);
    });

    test('兽人死亡之息移动端横屏过滤太难了保护目标并收口', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 844, height: 390 });
        await page.addInitScript(() => {
            (window as Window & { __BG_FORCE_COARSE_POINTER__?: boolean }).__BG_FORCE_COARSE_POINTER__ = true;
        });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinOrcsDeathBreathProtectionScene());

        const action = page.locator('[data-card-uid="orcs-death-breath-action-1"]').first();
        await expect(action).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-death-breath-protected"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-death-breath-free"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('移动端-兽人死亡之息-手牌与受保护/未保护随从', testInfo);

        await game.playCard('munchkin_orcs_death_breath');
        await game.waitForInteraction('munchkin_orcs_death_breath_target', 10000);
        await waitForSmashUpFxToSettle(page);
        await expectCurrentInteractionManual(game, '移动端死亡之息目标随从选择');
        const targetOptions = await game.getInteractionOptions() as InteractionOption[];
        expect(targetOptions.some(option => option.value?.minionUid === 'orcs-death-breath-free')).toBe(true);
        expect(targetOptions.some(option => option.value?.minionUid === 'orcs-death-breath-protected')).toBe(false);
        await expectManualMinionChoiceVisible(
            page,
            'orcs-death-breath-free',
            '移动端死亡之息必须只显示未受太难了保护的随从本体',
            { forbidPromptContext: true },
        );
        await game.screenshot('移动端-兽人死亡之息-过滤太难了保护目标', testInfo);
        await clickManualMinionChoice(page, 'orcs-death-breath-free', '移动端死亡之息选择未受保护随从');
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            return {
                protectedVisible: await page.locator('[data-minion-uid="orcs-death-breath-protected"]').count() > 0,
                freeVisible: await page.locator('[data-minion-uid="orcs-death-breath-free"]').count() > 0,
                freeInOwnerDeck: core.players?.['1']?.deck?.some(card => card.uid === 'orcs-death-breath-free') ?? false,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            protectedVisible: true,
            freeVisible: false,
            freeInOwnerDeck: true,
            interactionSourceId: null,
        });

        const mobileResolutionEvidence = await page.evaluate(() => {
            const inViewport = (selector: string) => {
                const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                return !!rect
                    && rect.width > 24
                    && rect.height > 24
                    && rect.left >= -2
                    && rect.right <= window.innerWidth + 2
                    && rect.top >= -2
                    && rect.bottom <= window.innerHeight + 2;
            };
            const supplyBadgeInViewport = (selector: string) => {
                const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                return !!rect
                    && rect.width > 0
                    && rect.height > 0
                    && rect.left >= -2
                    && rect.right <= window.innerWidth + 2
                    && rect.top >= -2
                    && rect.bottom <= window.innerHeight + 2;
            };
            return {
                noUnexpectedOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
                baseVisible: inViewport('[data-base-index="0"]'),
                handVisible: inViewport('[data-testid="su-hand-area"]'),
                supplyVisible: supplyBadgeInViewport('[data-testid="su-munchkin-monster-supply-card"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-monster-supply-count"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-treasure-supply-card"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-treasure-supply-count"]'),
                turnTrackerVisible: inViewport('[data-testid="su-turn-tracker"]'),
                endTurnVisible: inViewport('button[aria-label*="结束回合"], button[aria-label*="End turn"]'),
                monsterDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-monster-discard"]'),
                treasureDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-treasure-discard"]'),
            };
        });
        expect(mobileResolutionEvidence, '移动端死亡之息收口后基地、手牌、公共小牌和原版操作入口应可见且无横向溢出').toEqual({
            noUnexpectedOverflow: true,
            baseVisible: true,
            handVisible: true,
            supplyVisible: true,
            turnTrackerVisible: true,
            endTurnVisible: true,
            monsterDiscardAbsent: true,
            treasureDiscardAbsent: true,
        });
        await game.screenshot('移动端-兽人死亡之息-受保护随从保留并收口', testInfo);
    });

    test('兽人死亡之息移动端全目标受保护时不生成隐藏目标并保持手牌', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 844, height: 390 });
        await page.addInitScript(() => {
            (window as Window & { __BG_FORCE_COARSE_POINTER__?: boolean }).__BG_FORCE_COARSE_POINTER__ = true;
        });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinOrcsDeathBreathProtectionScene({ includeFree: false }));

        const action = page.locator('[data-card-uid="orcs-death-breath-action-1"]').first();
        await expect(action).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-death-breath-protected"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('移动端-兽人死亡之息-全目标受保护前手牌与随从', testInfo);

        await action.click({ force: true });
        await waitForSmashUpFxToSettle(page);
        await game.waitForNoInteraction(10000);

        await expect.poll(async () => {
            const state = await game.getState();
            return {
                phase: state.sys?.phase,
                actionInHand: state.core.players?.['0']?.hand?.some((card: { uid?: string }) => card.uid === 'orcs-death-breath-action-1') ?? false,
                actionInDiscard: state.core.players?.['0']?.discard?.some((card: { uid?: string }) => card.uid === 'orcs-death-breath-action-1') ?? false,
                protectedPresent: state.core.bases[0]?.minions.some((entry: { uid?: string }) => entry.uid === 'orcs-death-breath-protected') ?? false,
                freePresent: state.core.bases.some((base: { minions?: Array<{ uid?: string }> }) => base.minions?.some(entry => entry.uid === 'orcs-death-breath-free')),
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 15000 }).toEqual({
            phase: 'playCards',
            actionInHand: true,
            actionInDiscard: false,
            protectedPresent: true,
            freePresent: false,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await expect(page.locator('[data-testid="smashup-reaction-prompt"], [data-testid="smashup-docked-prompt"]')).toHaveCount(0);

        const mobileResolutionEvidence = await page.evaluate(() => {
            const inViewport = (selector: string) => {
                const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                return !!rect
                    && rect.width > 24
                    && rect.height > 24
                    && rect.left >= -2
                    && rect.right <= window.innerWidth + 2
                    && rect.top >= -2
                    && rect.bottom <= window.innerHeight + 2;
            };
            const supplyBadgeInViewport = (selector: string) => {
                const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                return !!rect
                    && rect.width > 0
                    && rect.height > 0
                    && rect.left >= -2
                    && rect.right <= window.innerWidth + 2
                    && rect.top >= -2
                    && rect.bottom <= window.innerHeight + 2;
            };
            return {
                noUnexpectedOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
                baseVisible: inViewport('[data-base-index="0"]'),
                handVisible: inViewport('[data-testid="su-hand-area"]'),
                supplyVisible: supplyBadgeInViewport('[data-testid="su-munchkin-monster-supply-card"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-monster-supply-count"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-treasure-supply-card"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-treasure-supply-count"]'),
                turnTrackerVisible: inViewport('[data-testid="su-turn-tracker"]'),
                endTurnVisible: inViewport('button[aria-label*="结束回合"], button[aria-label*="End turn"]'),
                monsterDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-monster-discard"]'),
                treasureDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-treasure-discard"]'),
            };
        });
        expect(mobileResolutionEvidence, '移动端死亡之息全目标受保护时应保持手牌并保留基地、公共小牌和原版操作入口，且无横向溢出').toEqual({
            noUnexpectedOverflow: true,
            baseVisible: true,
            handVisible: true,
            supplyVisible: true,
            turnTrackerVisible: true,
            endTurnVisible: true,
            monsterDiscardAbsent: true,
            treasureDiscardAbsent: true,
        });

        await game.screenshot('移动端-兽人死亡之息-全目标受保护保持手牌且不生成隐藏目标', testInfo);
    });

    test('兽人重击者移动端横屏手动选择低力量目标并收口', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 844, height: 390 });
        await page.addInitScript(() => {
            (window as Window & { __BG_FORCE_COARSE_POINTER__?: boolean }).__BG_FORCE_COARSE_POINTER__ = true;
        });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinOrcsHammerSlammerScene());

        await expect(page.locator('[data-card-uid="orcs-hammer-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-hammer-weak-0"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-hammer-strong-0"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('移动端-兽人重击者-手牌与低力量目标', testInfo);

        await game.playCard('munchkin_orcs_hammer_slammer', { targetBaseIndex: 0 });
        await game.waitForInteraction('munchkin_orcs_hammer_slammer_target', 10000);
        await waitForSmashUpFxToSettle(page);
        await expectCurrentInteractionManual(game, '移动端重击者目标选择');
        const targetOptions = await game.getInteractionOptions() as InteractionOption[];
        expect(targetOptions.some(option => option.value?.minionUid === 'orcs-hammer-weak-0')).toBe(true);
        expect(targetOptions.some(option => option.value?.minionUid === 'orcs-hammer-weak-1')).toBe(true);
        expect(targetOptions.some(option => option.value?.minionUid === 'orcs-hammer-strong-0')).toBe(false);
        await expectManualMinionChoiceVisible(
            page,
            'orcs-hammer-weak-0',
            '移动端重击者必须显示力量 2 或更少的随从本体',
            { forbidPromptContext: true },
        );
        await game.screenshot('移动端-兽人重击者-手动选择低力量目标', testInfo);
        await clickManualMinionChoice(page, 'orcs-hammer-weak-0', '移动端重击者选择低力量目标');
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            return {
                sourceMinionPresent: core.bases[0].minions.some(minion => minion.uid === 'orcs-hammer-1'),
                destroyedTargetPresent: core.bases[0].minions.some(minion => minion.uid === 'orcs-hammer-weak-0'),
                otherLowTargetPresent: core.bases[1].minions.some(minion => minion.uid === 'orcs-hammer-weak-1'),
                strongTargetPresent: core.bases[0].minions.some(minion => minion.uid === 'orcs-hammer-strong-0'),
                targetInOwnerDiscard: core.players?.['1']?.discard?.some(card => card.uid === 'orcs-hammer-weak-0') ?? false,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            sourceMinionPresent: true,
            destroyedTargetPresent: false,
            otherLowTargetPresent: true,
            strongTargetPresent: true,
            targetInOwnerDiscard: true,
            interactionSourceId: null,
        });

        const mobileResolutionEvidence = await page.evaluate(() => {
            const inViewport = (selector: string) => {
                const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                return !!rect
                    && rect.width > 24
                    && rect.height > 24
                    && rect.left >= -2
                    && rect.right <= window.innerWidth + 2
                    && rect.top >= -2
                    && rect.bottom <= window.innerHeight + 2;
            };
            const supplyBadgeInViewport = (selector: string) => {
                const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                return !!rect
                    && rect.width > 0
                    && rect.height > 0
                    && rect.left >= -2
                    && rect.right <= window.innerWidth + 2
                    && rect.top >= -2
                    && rect.bottom <= window.innerHeight + 2;
            };
            return {
                noUnexpectedOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
                firstBaseVisible: inViewport('[data-base-index="0"]'),
                secondBaseVisible: inViewport('[data-base-index="1"]'),
                handVisible: inViewport('[data-testid="su-hand-area"]'),
                supplyVisible: supplyBadgeInViewport('[data-testid="su-munchkin-monster-supply-card"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-monster-supply-count"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-treasure-supply-card"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-treasure-supply-count"]'),
                turnTrackerVisible: inViewport('[data-testid="su-turn-tracker"]'),
                endTurnVisible: inViewport('button[aria-label*="结束回合"], button[aria-label*="End turn"]'),
                monsterDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-monster-discard"]'),
                treasureDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-treasure-discard"]'),
            };
        });
        expect(mobileResolutionEvidence, '移动端重击者收口后两座基地、手牌、公共小牌和原版操作入口应可见且无横向溢出').toEqual({
            noUnexpectedOverflow: true,
            firstBaseVisible: true,
            secondBaseVisible: true,
            handVisible: true,
            supplyVisible: true,
            turnTrackerVisible: true,
            endTurnVisible: true,
            monsterDiscardAbsent: true,
            treasureDiscardAbsent: true,
        });
        await game.screenshot('移动端-兽人重击者-低力量目标被摧毁并收口', testInfo);
    });

    test('兽人粉碎者移动端横屏手动激活天赋并显示已使用状态', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 844, height: 390 });
        await page.addInitScript(() => {
            (window as Window & { __BG_FORCE_COARSE_POINTER__?: boolean }).__BG_FORCE_COARSE_POINTER__ = true;
        });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinOrcsTopperChopperScene());

        const card = page.locator('[data-card-uid="orcs-topper-1"]').first();
        const minion = page.locator('[data-minion-uid="orcs-topper-1"]').first();
        await expect(card).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('移动端-兽人粉碎者-手牌与空基地', testInfo);

        await game.playCard('munchkin_orcs_topper_chopper', { targetBaseIndex: 0 });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);
        await expect(minion).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-minion-used-badge-orcs-topper-1')).toHaveCount(0);
        await game.screenshot('移动端-兽人粉碎者-天赋可用', testInfo);

        await minion.click({ force: true });
        await expect(minion).toHaveAttribute('data-activation-armed', 'true');
        await expect(page.getByTestId('su-minion-activation-hint-orcs-topper-1')).toBeVisible({ timeout: 10000 });
        await game.screenshot('移动端-兽人粉碎者-第一次点击待确认', testInfo);

        await minion.click({ force: true });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);
        await expect(page.getByTestId('su-minion-used-badge-orcs-topper-1')).toBeVisible({ timeout: 15000 });
        await expect(minion).toHaveAttribute('data-activation-armed', 'false');

        const state = await game.getState();
        const core = state.core as { bases: Array<{ minions: Array<{ uid: string; talentUsed?: boolean }> }> };
        expect(core.bases.flatMap(base => base.minions).find(entry => entry.uid === 'orcs-topper-1')?.talentUsed).toBe(true);
        expect(state.sys?.interaction?.current?.data?.sourceId ?? null).toBe(null);

        const mobileResolutionEvidence = await page.evaluate(() => {
            const inViewport = (selector: string) => {
                const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                return !!rect
                    && rect.width > 24
                    && rect.height > 24
                    && rect.left >= -2
                    && rect.right <= window.innerWidth + 2
                    && rect.top >= -2
                    && rect.bottom <= window.innerHeight + 2;
            };
            const badgeInViewport = (selector: string) => {
                const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                return !!rect
                    && rect.width > 0
                    && rect.height > 0
                    && rect.left >= -2
                    && rect.right <= window.innerWidth + 2
                    && rect.top >= -2
                    && rect.bottom <= window.innerHeight + 2;
            };
            const supplyBadgeInViewport = (selector: string) => {
                const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                return !!rect
                    && rect.width > 0
                    && rect.height > 0
                    && rect.left >= -2
                    && rect.right <= window.innerWidth + 2
                    && rect.top >= -2
                    && rect.bottom <= window.innerHeight + 2;
            };
            return {
                noUnexpectedOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
                firstBaseVisible: inViewport('[data-base-index="0"]'),
                secondBaseVisible: inViewport('[data-base-index="1"]'),
                handVisible: inViewport('[data-testid="su-hand-area"]'),
                usedBadgeVisible: badgeInViewport('[data-testid="su-minion-used-badge-orcs-topper-1"]'),
                supplyVisible: supplyBadgeInViewport('[data-testid="su-munchkin-monster-supply-card"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-monster-supply-count"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-treasure-supply-card"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-treasure-supply-count"]'),
                turnTrackerVisible: inViewport('[data-testid="su-turn-tracker"]'),
                endTurnVisible: inViewport('button[aria-label*="结束回合"], button[aria-label*="End turn"]'),
                monsterDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-monster-discard"]'),
                treasureDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-treasure-discard"]'),
            };
        });
        expect(mobileResolutionEvidence, '移动端粉碎者天赋收口后应显示已使用状态并保留原版布局与公共小牌').toEqual({
            noUnexpectedOverflow: true,
            firstBaseVisible: true,
            secondBaseVisible: true,
            handVisible: true,
            usedBadgeVisible: true,
            supplyVisible: true,
            turnTrackerVisible: true,
            endTurnVisible: true,
            monsterDiscardAbsent: true,
            treasureDiscardAbsent: true,
        });
        await game.screenshot('移动端-兽人粉碎者-天赋已使用并收口', testInfo);
    });

    test('兽人躺下！移动端横屏计分前手动选择响应并保留压制状态', async ({ page, game }, testInfo) => {
        test.setTimeout(120000);

        await page.setViewportSize({ width: 844, height: 390 });
        await page.addInitScript(() => {
            (window as Window & { __BG_FORCE_COARSE_POINTER__?: boolean }).__BG_FORCE_COARSE_POINTER__ = true;
        });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinOrcsAndStayDownScene());

        await expect(page.locator('[data-card-uid="orcs-stay-down-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-base-index="0"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('移动端-兽人躺下-计分前手牌与要塞', testInfo);

        await game.advancePhase();
        await page.waitForFunction(
            () => {
                const state = (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.();
                return state?.sys?.phase === 'scoreBases'
                    && state?.sys?.responseWindow?.current?.windowType === 'meFirst'
                    && state?.sys?.interaction?.current?.data?.sourceId === 'smashup_reaction_choose';
            },
            { timeout: 20000, polling: 200 },
        );
        await expectCurrentInteractionManual(game, '移动端躺下计分前响应');
        await expect.poll(async () => {
            const options = await game.getInteractionOptions() as InteractionOption[];
            return options.some(option =>
                option.value?.kind === 'play_action'
                && option.value?.cardUid === 'orcs-stay-down-1'
                && option.value?.targetBaseIndex === 0,
            );
        }, { timeout: 10000 }).toBe(true);

        await expectCenteredSmashUpReactionPrompt(
            page,
            '移动端躺下 beforeScoring 响应窗口必须沿用 PC 同构居中弹窗，不得回到停靠提示条',
        );
        await game.screenshot('移动端-兽人躺下-beforeScoring响应入口', testInfo);

        await clickVisibleInteractionOptionBy(
            page,
            game,
            option => option.value?.kind === 'play_action'
                && option.value?.cardUid === 'orcs-stay-down-1'
                && option.value?.targetBaseIndex === 0,
            '移动端躺下选择计分前响应',
        );
        await expect.poll(async () => {
            const state = await game.getState();
            const events = (state.sys?.eventStream?.entries ?? []).map((entry: EventStreamEntry) => entry.event);
            return {
                suppressorPlayerId: state.core.bases[0]?.metadata?.andStayDownSuppressorPlayerId ?? null,
                hasSuppressionEvent: events.some((event: any) =>
                    event?.type === 'su:base_metadata_updated'
                    && event.payload?.baseIndex === 0
                    && event.payload?.metadataUpdate?.andStayDownSuppressorPlayerId === '0',
                ),
                hasCardInDiscard: state.core.players?.['0']?.discard?.some((card: any) => card.uid === 'orcs-stay-down-1') ?? false,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
            };
        }, { timeout: 15000 }).toEqual({
            suppressorPlayerId: '0',
            hasSuppressionEvent: true,
            hasCardInDiscard: true,
            interactionSourceId: null,
        });
        await waitForSmashUpFxToSettle(page);

        const mobileResolutionEvidence = await page.evaluate(() => {
            const inViewport = (selector: string) => {
                const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                return !!rect && rect.width > 24 && rect.height > 24 && rect.left >= -2 && rect.right <= window.innerWidth + 2 && rect.top >= -2 && rect.bottom <= window.innerHeight + 2;
            };
            const supplyBadgeInViewport = (selector: string) => {
                const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                return !!rect && rect.width > 0 && rect.height > 0 && rect.left >= -2 && rect.right <= window.innerWidth + 2 && rect.top >= -2 && rect.bottom <= window.innerHeight + 2;
            };
            return {
                noUnexpectedOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
                firstBaseVisible: inViewport('[data-base-index="0"]'),
                secondBaseVisible: inViewport('[data-base-index="1"]'),
                handVisible: inViewport('[data-testid="su-hand-area"]'),
                supplyVisible: supplyBadgeInViewport('[data-testid="su-munchkin-monster-supply-card"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-monster-supply-count"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-treasure-supply-card"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-treasure-supply-count"]'),
                turnTrackerVisible: inViewport('[data-testid="su-turn-tracker"]'),
                endTurnVisible: inViewport('button[aria-label*="结束回合"], button[aria-label*="End turn"]'),
                monsterDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-monster-discard"]'),
                treasureDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-treasure-discard"]'),
            };
        });
        expect(mobileResolutionEvidence, '移动端躺下收口后压制状态、基地、手牌、公共小牌和原版操作入口应可见且无横向溢出').toEqual({
            noUnexpectedOverflow: true,
            firstBaseVisible: true,
            secondBaseVisible: true,
            handVisible: true,
            supplyVisible: true,
            turnTrackerVisible: true,
            endTurnVisible: true,
            monsterDiscardAbsent: true,
            treasureDiscardAbsent: true,
        });
        await game.screenshot('移动端-兽人躺下-压制状态结算后', testInfo);
    });

    test('兽人躺下移动端并列最高时仍进入计分前响应并完成压制清理', async ({ page, game }, testInfo) => {
        test.setTimeout(120000);

        await page.setViewportSize({ width: 844, height: 390 });
        await page.addInitScript(() => {
            (window as Window & { __BG_FORCE_COARSE_POINTER__?: boolean }).__BG_FORCE_COARSE_POINTER__ = true;
        });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinOrcsAndStayDownScene({ ownPower: 9, opponentPower: 9 }));

        await expect(page.locator('[data-card-uid="orcs-stay-down-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-base-index="0"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('移动端-兽人躺下-并列最高计分前', testInfo);

        await game.advancePhase();
        await page.waitForFunction(
            () => {
                const state = (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.();
                return state?.sys?.phase === 'scoreBases'
                    && state?.sys?.responseWindow?.current?.windowType === 'meFirst'
                    && state?.sys?.interaction?.current?.data?.sourceId === 'smashup_reaction_choose';
            },
            { timeout: 20000, polling: 200 },
        );
        await expectCurrentInteractionManual(game, '移动端躺下并列最高计分前响应');
        await expect.poll(async () => {
            const options = await game.getInteractionOptions() as InteractionOption[];
            return options.some(option =>
                option.value?.kind === 'play_action'
                && option.value?.cardUid === 'orcs-stay-down-1'
                && option.value?.targetBaseIndex === 0,
            );
        }, { timeout: 10000 }).toBe(true);

        await expectCenteredSmashUpReactionPrompt(
            page,
            '移动端躺下并列最高 beforeScoring 响应窗口必须沿用 PC 同构居中弹窗，不得回到停靠提示条',
        );
        await game.screenshot('移动端-兽人躺下-并列最高计分前响应入口', testInfo);

        await clickVisibleInteractionOptionBy(
            page,
            game,
            option => option.value?.kind === 'play_action'
                && option.value?.cardUid === 'orcs-stay-down-1'
                && option.value?.targetBaseIndex === 0,
            '移动端躺下并列最高选择计分前响应',
        );

        await expect.poll(async () => {
            const state = await game.getState();
            const events = (state.sys?.eventStream?.entries ?? []).map((entry: EventStreamEntry) => entry.event);
            return {
                phase: state.sys?.phase,
                ownVp: state.core.players?.['0']?.vp ?? 0,
                opponentVp: state.core.players?.['1']?.vp ?? 0,
                scoredBaseLeftBoard: !state.core.bases?.some((base: { defId?: string }) => base.defId === 'base_garrison'),
                baseCleared: state.core.bases?.[0]?.minions?.length === 0,
                hasSuppressionEvent: events.some((event: any) =>
                    event?.type === 'su:base_metadata_updated'
                    && event.payload?.baseIndex === 0
                    && event.payload?.metadataUpdate?.andStayDownSuppressorPlayerId === '0',
                ),
                hasCardInDiscard: state.core.players?.['0']?.discard?.some((card: any) => card.uid === 'orcs-stay-down-1') ?? false,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 20000 }).toEqual({
            phase: 'playCards',
            ownVp: 7,
            opponentVp: 7,
            scoredBaseLeftBoard: true,
            baseCleared: true,
            hasSuppressionEvent: true,
            hasCardInDiscard: true,
            interactionSourceId: null,
            responseWindowType: null,
        });

        await waitForSmashUpFxToSettle(page);
        const mobileResolutionEvidence = await page.evaluate(() => {
            const inViewport = (selector: string) => {
                const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                return !!rect && rect.width > 24 && rect.height > 24 && rect.left >= -2 && rect.right <= window.innerWidth + 2 && rect.top >= -2 && rect.bottom <= window.innerHeight + 2;
            };
            const supplyBadgeInViewport = (selector: string) => {
                const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                return !!rect && rect.width > 0 && rect.height > 0 && rect.left >= -2 && rect.right <= window.innerWidth + 2 && rect.top >= -2 && rect.bottom <= window.innerHeight + 2;
            };
            return {
                noUnexpectedOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
                firstBaseVisible: inViewport('[data-base-index="0"]'),
                secondBaseVisible: inViewport('[data-base-index="1"]'),
                handVisible: inViewport('[data-testid="su-hand-area"]'),
                supplyVisible: supplyBadgeInViewport('[data-testid="su-munchkin-monster-supply-card"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-monster-supply-count"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-treasure-supply-card"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-treasure-supply-count"]'),
                turnTrackerVisible: inViewport('[data-testid="su-turn-tracker"]'),
                endTurnVisible: inViewport('button[aria-label*="结束回合"], button[aria-label*="End turn"]'),
                monsterDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-monster-discard"]'),
                treasureDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-treasure-discard"]'),
            };
        });
        expect(mobileResolutionEvidence, '移动端躺下并列最高收口后双方基础计分、压制清理和原版布局应成立').toEqual({
            noUnexpectedOverflow: true,
            firstBaseVisible: true,
            secondBaseVisible: true,
            handVisible: true,
            supplyVisible: true,
            turnTrackerVisible: true,
            endTurnVisible: true,
            monsterDiscardAbsent: true,
            treasureDiscardAbsent: true,
        });
        await game.screenshot('移动端-兽人躺下-并列最高压制后清场收口', testInfo);
    });

    test('兽人愤怒的掠夺者移动端横屏计分前手动选择响应并获得 VP', async ({ page, game }, testInfo) => {
        test.setTimeout(120000);

        await page.setViewportSize({ width: 844, height: 390 });
        await page.addInitScript(() => {
            (window as Window & { __BG_FORCE_COARSE_POINTER__?: boolean }).__BG_FORCE_COARSE_POINTER__ = true;
        });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinOrcsAngryPillagersScene());

        await expect(page.locator('[data-card-uid="orcs-angry-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-base-index="0"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('移动端-兽人愤怒的掠夺者-计分前手牌与要塞', testInfo);

        await game.advancePhase();
        await page.waitForFunction(
            () => {
                const state = (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.();
                return state?.sys?.phase === 'scoreBases'
                    && state?.sys?.responseWindow?.current?.windowType === 'meFirst'
                    && state?.sys?.interaction?.current?.data?.sourceId === 'smashup_reaction_choose';
            },
            { timeout: 20000, polling: 200 },
        );
        await expectCurrentInteractionManual(game, '移动端愤怒的掠夺者计分前响应');
        await expect.poll(async () => {
            const options = await game.getInteractionOptions() as InteractionOption[];
            return options.some(option =>
                option.value?.kind === 'play_action'
                && option.value?.cardUid === 'orcs-angry-1'
                && option.value?.targetBaseIndex === 0,
            );
        }, { timeout: 10000 }).toBe(true);

        await expectCenteredSmashUpReactionPrompt(
            page,
            '移动端愤怒的掠夺者 beforeScoring 响应窗口必须沿用 PC 同构居中弹窗，不得回到停靠提示条',
        );
        await game.screenshot('移动端-兽人愤怒的掠夺者-beforeScoring响应入口', testInfo);

        await clickVisibleInteractionOptionBy(
            page,
            game,
            option => option.value?.kind === 'play_action'
                && option.value?.cardUid === 'orcs-angry-1'
                && option.value?.targetBaseIndex === 0,
            '移动端愤怒的掠夺者选择计分前响应',
        );
        await expect.poll(async () => {
            const state = await game.getState();
            const events = (state.sys?.eventStream?.entries ?? []).map((entry: EventStreamEntry) => entry.event);
            return {
                vp: state.core.players?.['0']?.vp ?? 0,
                hasCardInDiscard: state.core.players?.['0']?.discard?.some((card: any) => card.uid === 'orcs-angry-1') ?? false,
                hasAngryBonus: events.some((event: any) =>
                    event?.type === 'su:vp_awarded'
                    && event.payload?.playerId === '0'
                    && event.payload?.amount === 1
                    && event.payload?.reason === 'munchkin_orcs_angry_pillagers',
                ),
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
            };
        }, { timeout: 15000 }).toEqual({
            vp: 8,
            hasCardInDiscard: true,
            hasAngryBonus: true,
            interactionSourceId: null,
        });
        await waitForSmashUpFxToSettle(page);

        const mobileResolutionEvidence = await page.evaluate(() => {
            const inViewport = (selector: string) => {
                const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                return !!rect && rect.width > 24 && rect.height > 24 && rect.left >= -2 && rect.right <= window.innerWidth + 2 && rect.top >= -2 && rect.bottom <= window.innerHeight + 2;
            };
            const supplyBadgeInViewport = (selector: string) => {
                const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                return !!rect && rect.width > 0 && rect.height > 0 && rect.left >= -2 && rect.right <= window.innerWidth + 2 && rect.top >= -2 && rect.bottom <= window.innerHeight + 2;
            };
            return {
                noUnexpectedOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
                firstBaseVisible: inViewport('[data-base-index="0"]'),
                secondBaseVisible: inViewport('[data-base-index="1"]'),
                handVisible: inViewport('[data-testid="su-hand-area"]'),
                supplyVisible: supplyBadgeInViewport('[data-testid="su-munchkin-monster-supply-card"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-monster-supply-count"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-treasure-supply-card"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-treasure-supply-count"]'),
                turnTrackerVisible: inViewport('[data-testid="su-turn-tracker"]'),
                endTurnVisible: inViewport('button[aria-label*="结束回合"], button[aria-label*="End turn"]'),
                monsterDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-monster-discard"]'),
                treasureDiscardAbsent: !document.querySelector('[data-testid="su-munchkin-treasure-discard"]'),
            };
        });
        expect(mobileResolutionEvidence, '移动端愤怒的掠夺者收口后 VP、基地、手牌、公共小牌和原版操作入口应可见且无横向溢出').toEqual({
            noUnexpectedOverflow: true,
            firstBaseVisible: true,
            secondBaseVisible: true,
            handVisible: true,
            supplyVisible: true,
            turnTrackerVisible: true,
            endTurnVisible: true,
            monsterDiscardAbsent: true,
            treasureDiscardAbsent: true,
        });
        await game.screenshot('移动端-兽人愤怒的掠夺者-获得VP并收口', testInfo);
    });

    test('兽人重击者移动端无合法目标时不生成隐藏目标或假结算', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 844, height: 390 });
        await page.addInitScript(() => {
            (window as Window & { __BG_FORCE_COARSE_POINTER__?: boolean }).__BG_FORCE_COARSE_POINTER__ = true;
        });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinOrcsHammerSlammerScene({ includeLegalTarget: false }));

        await expect(page.locator('[data-card-uid="orcs-hammer-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="orcs-hammer-strong-0"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('移动端-兽人重击者-无合法目标前', testInfo);

        await game.playCard('munchkin_orcs_hammer_slammer', { targetBaseIndex: 0 });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            return {
                sourceMinionPresent: state.core.bases[0].minions.some((entry: { uid?: string }) => entry.uid === 'orcs-hammer-1'),
                onlyStrongTargetPresent: state.core.bases[0].minions.some((entry: { uid?: string }) => entry.uid === 'orcs-hammer-strong-0'),
                hiddenTargetAbsent: state.core.bases.some((base: { minions?: Array<{ uid?: string }> }) => base.minions?.some(entry => entry.uid === 'orcs-hammer-weak-0' || entry.uid === 'orcs-hammer-weak-1')) === false,
                sourceStillInHand: state.core.players?.['0']?.hand?.some((card: { uid?: string }) => card.uid === 'orcs-hammer-1') ?? false,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
            };
        }, { timeout: 15000 }).toEqual({
            sourceMinionPresent: true,
            onlyStrongTargetPresent: true,
            hiddenTargetAbsent: true,
            sourceStillInHand: false,
            interactionSourceId: null,
        });

        const mobileResolutionEvidence = await page.evaluate(() => {
            const inViewport = (selector: string) => {
                const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                return !!rect && rect.width > 24 && rect.height > 24 && rect.left >= -2 && rect.right <= window.innerWidth + 2 && rect.top >= -2 && rect.bottom <= window.innerHeight + 2;
            };
            const supplyBadgeInViewport = (selector: string) => {
                const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
                return !!rect && rect.width > 0 && rect.height > 0 && rect.left >= -2 && rect.right <= window.innerWidth + 2 && rect.top >= -2 && rect.bottom <= window.innerHeight + 2;
            };
            return {
                noUnexpectedOverflow: document.documentElement.scrollWidth <= window.innerWidth + 2,
                firstBaseVisible: inViewport('[data-base-index="0"]'),
                secondBaseVisible: inViewport('[data-base-index="1"]'),
                handVisible: inViewport('[data-testid="su-hand-area"]'),
                supplyVisible: supplyBadgeInViewport('[data-testid="su-munchkin-monster-supply-card"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-monster-supply-count"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-treasure-supply-card"]')
                    && supplyBadgeInViewport('[data-testid="su-munchkin-treasure-supply-count"]'),
                turnTrackerVisible: inViewport('[data-testid="su-turn-tracker"]'),
                endTurnVisible: inViewport('button[aria-label*="结束回合"], button[aria-label*="End turn"]'),
            };
        });
        expect(mobileResolutionEvidence, '移动端重击者无合法目标收口后仍应保留原版牌桌布局').toEqual({
            noUnexpectedOverflow: true,
            firstBaseVisible: true,
            secondBaseVisible: true,
            handVisible: true,
            supplyVisible: true,
            turnTrackerVisible: true,
            endTurnVisible: true,
        });
        await game.screenshot('移动端-兽人重击者-无合法目标收口', testInfo);
    });

    test('兽人躺下移动端落后时不进入计分前响应', async ({ page, game }, testInfo) => {
        test.setTimeout(120000);

        await page.setViewportSize({ width: 844, height: 390 });
        await page.addInitScript(() => {
            (window as Window & { __BG_FORCE_COARSE_POINTER__?: boolean }).__BG_FORCE_COARSE_POINTER__ = true;
        });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinOrcsAndStayDownScene({ ownPower: 4, opponentPower: 9 }));

        await expect(page.locator('[data-card-uid="orcs-stay-down-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-base-index="0"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('移动端-兽人躺下-落后时计分前', testInfo);

        await game.advancePhase();
        await expect.poll(async () => {
            const state = await game.getState();
            const base = state.core.bases[0];
            return {
                ownVp: state.core.players?.['0']?.vp ?? 0,
                opponentVp: state.core.players?.['1']?.vp ?? 0,
                baseCleared: base?.minions?.length === 0,
                sourceStillInHand: state.core.players?.['0']?.hand?.some((card: { uid?: string }) => card.uid === 'orcs-stay-down-1') ?? false,
                suppressorPlayerId: base?.metadata?.andStayDownSuppressorPlayerId ?? null,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 20000 }).toEqual({
            ownVp: 6,
            opponentVp: 7,
            baseCleared: true,
            sourceStillInHand: true,
            suppressorPlayerId: null,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await waitForSmashUpFxToSettle(page);
        await game.screenshot('移动端-兽人躺下-落后时无响应直接计分收口', testInfo);
    });

    test('兽人愤怒的掠夺者移动端领先不足三点时不进入响应也不奖励VP', async ({ page, game }, testInfo) => {
        test.setTimeout(120000);

        await page.setViewportSize({ width: 844, height: 390 });
        await page.addInitScript(() => {
            (window as Window & { __BG_FORCE_COARSE_POINTER__?: boolean }).__BG_FORCE_COARSE_POINTER__ = true;
        });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinOrcsAngryPillagersScene({ ownPower: 7, opponentPower: 5 }));

        await expect(page.locator('[data-card-uid="orcs-angry-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-base-index="0"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('移动端-兽人愤怒的掠夺者-领先不足三点计分前', testInfo);

        await game.advancePhase();
        await expect.poll(async () => {
            const state = await game.getState();
            const events = (state.sys?.eventStream?.entries ?? []).map((entry: EventStreamEntry) => entry.event);
            return {
                ownVp: state.core.players?.['0']?.vp ?? 0,
                opponentVp: state.core.players?.['1']?.vp ?? 0,
                baseCleared: state.core.bases[0]?.minions?.length === 0,
                sourceStillInHand: state.core.players?.['0']?.hand?.some((card: { uid?: string }) => card.uid === 'orcs-angry-1') ?? false,
                hasAngryBonus: events.some((event: any) =>
                    event?.type === 'su:vp_awarded'
                    && event.payload?.reason === 'munchkin_orcs_angry_pillagers'
                    && event.payload?.amount === 1,
                ),
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 20000 }).toEqual({
            ownVp: 7,
            opponentVp: 6,
            baseCleared: true,
            sourceStillInHand: true,
            hasAngryBonus: false,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await waitForSmashUpFxToSettle(page);
        await game.screenshot('移动端-兽人愤怒的掠夺者-领先不足三点无响应且不奖励VP', testInfo);
    });

    test('法师快速攻击先手动选弃牌成本，再手动选力量目标', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinMagesTargetSelectionScene());

        await expect(page.locator('[data-card-uid="mages-zzzzzap-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="mages-weak-target"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="mages-strong-target"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('法师-快速攻击-打出前', testInfo);

        await game.playCard('munchkin_mages_zzzzzap');
        await game.waitForInteraction('munchkin_mages_zzzzzap_discard', 10000);
        await waitForSmashUpFxToSettle(page);
        await expectManualChoiceVisible(
            page,
            handCardSelector('mages-cost-1'),
            '快速攻击第一步选择手牌成本',
            { forbidPromptContext: true },
        );
        await game.screenshot('法师-快速攻击-手动选择弃牌成本', testInfo);
        await page.locator(handCardSelector('mages-cost-1')).first().click({ force: true });

        await game.waitForInteraction('munchkin_mages_zzzzzap_target', 10000);
        await waitForSmashUpFxToSettle(page);
        await expectManualMinionChoiceVisible(
            page,
            'mages-weak-target',
            '快速攻击第二步选择力量3或更少的随从',
            { forbidPromptContext: true },
        );
        const targetOptions = await game.getInteractionOptions() as InteractionOption[];
        expect(targetOptions.some((option) => option.value?.minionUid === 'mages-weak-target')).toBe(true);
        expect(targetOptions.some((option) => option.value?.minionUid === 'mages-strong-target')).toBe(false);
        await game.screenshot('法师-快速攻击-手动选择目标随从', testInfo);
        await clickManualMinionChoice(page, 'mages-weak-target', '快速攻击选择目标随从');

        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);
        await expect(page.locator('[data-minion-uid="mages-weak-target"]')).toHaveCount(0);
        await expect(page.locator('[data-minion-uid="mages-strong-target"]')).toHaveCount(1);
        await expect(page.locator('[data-card-uid="mages-cost-1"]')).toHaveCount(0);
        await expect(page.locator('[data-card-uid="mages-zzzzzap-1"]')).toHaveCount(0);
        await expect(page.getByTestId('su-interaction-select-banner')).toHaveCount(0);
        await game.screenshot('法师-快速攻击-结算后', testInfo);
    });

    test('法师大召唤把怪物逐基地放入基地下方怪物行', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinMagesMassSummoningScene());

        await expect(page.locator('[data-card-uid="mages-mass-1"]').first()).toBeVisible({ timeout: 15000 });
        await game.playCard('munchkin_mages_mass_summoning');
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect(page.getByTestId('su-base-monster-row-0')).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-base-monster-row-1')).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-base-monster-row-2')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-monster-uid]')).toHaveCount(3);
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 0');
        await expect(page.locator('[data-monster-uid="munchkin_monster_2200"]')).toBeVisible();
        await expect(page.locator('[data-monster-uid="munchkin_monster_2201"]')).toBeVisible();
        await expect(page.locator('[data-monster-uid="munchkin_monster_2202"]')).toBeVisible();
        await game.screenshot('法师-大召唤-三个基地的怪物行', testInfo);

        const layoutEvidence = await page.evaluate(() => {
            return [0, 1, 2].map((baseIndex) => {
                const base = document.querySelector<HTMLElement>(`[data-base-index="${baseIndex}"]`);
                const row = document.querySelector<HTMLElement>(`[data-testid="su-base-monster-row-${baseIndex}"]`);
                const baseRect = base?.getBoundingClientRect();
                const rowRect = row?.getBoundingClientRect();
                return {
                    baseIndex,
                    rowBelowBase: !!baseRect && !!rowRect && rowRect.top >= baseRect.bottom - 8,
                };
            });
        });
        expect(layoutEvidence).toEqual([
            { baseIndex: 0, rowBelowBase: true },
            { baseIndex: 1, rowBelowBase: true },
            { baseIndex: 2, rowBelowBase: true },
        ]);
    });

    test('法师魅力让玩家手动选择一个公共怪物并暂时控制它', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinMagesCharmScene());

        await expect(page.locator('[data-card-uid="mages-charm-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-monster-uid="mages-charm-monster"]').first()).toBeVisible({ timeout: 15000 });
        await game.playCard('munchkin_mages_charm');
        await game.waitForInteraction('munchkin_mages_charm_target', 10000);
        await waitForSmashUpFxToSettle(page);
        await expect(page.getByTestId('su-interaction-select-banner')).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('prompt-card-grid')).toHaveCount(0);
        await expect(page.locator('[data-monster-uid="mages-charm-monster"][data-monster-selectable="true"]')).toHaveCount(1);
        await expect(page.locator('[data-monster-uid="mages-charm-monster-2"][data-monster-selectable="true"]')).toHaveCount(1);
        await game.screenshot('法师-魅力-手动选择怪物', testInfo);

        const charmOptions = await game.getInteractionOptions() as InteractionOption[];
        const charmTarget = charmOptions.find((option) => option.value?.monsterUid === 'mages-charm-monster');
        expect(charmTarget, '魅力必须把怪物作为可见候选交给玩家手动选择').toBeTruthy();
        await page.locator('[data-monster-uid="mages-charm-monster"] button').click();
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        const core = await game.getState();
        expect(core.core.bases[0].monsters).toEqual([
            expect.objectContaining({ uid: 'mages-charm-monster', controllerId: '0' }),
        ]);
        await expect(page.locator('[data-monster-uid="mages-charm-monster"][data-monster-controller-id="0"]')).toBeVisible();
        await game.screenshot('法师-魅力-控制怪物后', testInfo);
    });

    test('法师基地能力在随从入场后保留手动选择', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinMagesBaseInteractionScene());

        await game.playCard('alien_invader', { targetBaseIndex: 0 });
        await game.waitForInteraction('base_dimension_doors_discard', 10000);
        await waitForSmashUpFxToSettle(page);
        await expect(page.getByRole('button', { name: '不额外打出' })).toBeVisible({ timeout: 15000 });
        await expectManualChoiceVisible(
            page,
            handCardSelector('mages-base-cost-1'),
            '次元之门应让玩家看见手牌成本并手动决定',
            { forbidPromptContext: true },
        );
        await game.screenshot('法师-次元之门-手动选择是否额外打出', testInfo);
        await page.getByRole('button', { name: '不额外打出' }).click({ force: true });
        await game.waitForNoInteraction(10000);

        await game.playCard('alien_invader', { targetBaseIndex: 1 });
        await game.waitForInteraction('base_mages_tower_draw', 10000);
        await waitForSmashUpFxToSettle(page);
        await expect(page.getByRole('heading', { name: '法师之塔' })).toBeVisible({ timeout: 15000 });
        await expect(page.getByRole('button', { name: '抽一张牌' })).toBeVisible({ timeout: 15000 });
        await expect(page.getByRole('button', { name: '不抽牌' })).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-testid^="su-vp-gain-feedback-"]:visible')).toHaveCount(0);
        await game.screenshot('法师-法师之塔-手动选择抽牌', testInfo);
        await page.getByRole('button', { name: '抽一张牌' }).click({ force: true });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        const state = await game.getState();
        expect(state.core.players['0'].deck).toHaveLength(7);
        await waitForSmashUpHandCardToSettle(page, handCardSelector('0-deck-0'));
        await game.screenshot('法师-法师之塔-抽牌后', testInfo);
    });

    test('法师爆破大师天赋手动选择弃牌成本和低力量目标', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinMagesRemainingScene({
            hand: [
                mageCard('mages-blaster-1', 'munchkin_mages_blaster_master', 'minion'),
                mageCard('mages-blaster-cost', 'munchkin_mages_speed_reading', 'action'),
            ],
            bases: [mageBase('base_the_mothership', [
                minion('mages-blaster-high', 'pirate_first_mate', '1', 5),
                minion('mages-blaster-target', 'alien_invader', '1', 2),
            ])],
        }));

        await game.playCard('munchkin_mages_blaster_master', { targetBaseIndex: 0 });
        await game.waitForNoInteraction(10000);
        const blaster = page.locator('[data-minion-uid="mages-blaster-1"]').first();
        await blaster.click({ force: true });
        await game.waitForInteraction('munchkin_mages_blaster_master_discard', 10000);
        await waitForSmashUpFxToSettle(page);
        await expectManualChoiceVisible(page, handCardSelector('mages-blaster-cost'), '爆破大师选择弃牌成本', { forbidPromptContext: true });
        await game.screenshot('法师-爆破大师-手动选择弃牌成本', testInfo);

        await page.locator(handCardSelector('mages-blaster-cost')).first().click({ force: true });
        await game.waitForInteraction('munchkin_mages_blaster_master_target', 10000);
        await waitForSmashUpFxToSettle(page);
        await expectManualMinionChoiceVisible(page, 'mages-blaster-target', '爆破大师选择力量2或更少的仆从', { forbidPromptContext: true });
        const options = await game.getInteractionOptions() as InteractionOption[];
        expect(options.some(option => option.value?.minionUid === 'mages-blaster-target')).toBe(true);
        expect(options.some(option => option.value?.minionUid === 'mages-blaster-high')).toBe(false);
        await game.screenshot('法师-爆破大师-手动选择低力量目标', testInfo);
        await clickManualMinionChoice(page, 'mages-blaster-target', '爆破大师目标随从');
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        const state = await game.getState();
        expect(state.core.bases[0].minions.map((entry: any) => entry.uid)).toEqual(['mages-blaster-high', 'mages-blaster-1']);
        expect(state.core.players['0'].discard.map((entry: any) => entry.uid)).toEqual(['mages-blaster-cost']);
        await game.screenshot('法师-爆破大师-摧毁目标后', testInfo);
    });

    test('法师快乐小法师天赋手动选择弃牌成本并获得临时力量', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinMagesRemainingScene({
            hand: [
                mageCard('mages-happy-1', 'munchkin_mages_happy_zapper', 'minion'),
                mageCard('mages-happy-cost', 'munchkin_mages_speed_reading', 'action'),
            ],
            bases: [mageBase('base_the_mothership')],
        }));

        await game.playCard('munchkin_mages_happy_zapper', { targetBaseIndex: 0 });
        await game.waitForNoInteraction(10000);
        await page.locator('[data-minion-uid="mages-happy-1"]').first().click({ force: true });
        await game.waitForInteraction('munchkin_mages_happy_zapper_discard', 10000);
        await waitForSmashUpFxToSettle(page);
        await expectManualChoiceVisible(page, handCardSelector('mages-happy-cost'), '快乐小法师选择弃牌成本', { forbidPromptContext: true });
        await game.screenshot('法师-快乐小法师-手动选择弃牌成本', testInfo);
        await page.locator(handCardSelector('mages-happy-cost')).first().click({ force: true });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        const state = await game.getState();
        expect(state.core.bases[0].minions.find((entry: any) => entry.uid === 'mages-happy-1')?.tempPowerModifier).toBe(2);
        expect(state.core.players['0'].discard.map((entry: any) => entry.uid)).toEqual(['mages-happy-cost']);
        await game.screenshot('法师-快乐小法师-获得临时力量后', testInfo);
    });

    test('法师快乐小法师在计分前从真实响应窗口手动激活特殊能力', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinMagesRemainingScene({
            hand: [
                mageCard('mages-happy-special-1', 'munchkin_mages_happy_zapper', 'minion'),
                mageCard('mages-happy-special-cost', 'munchkin_mages_speed_reading', 'action'),
            ],
            bases: [mageBase('base_the_mothership', [
                minion('mages-happy-special-board', 'munchkin_mages_happy_zapper', '0', 3),
                minion('mages-happy-special-scorer', 'alien_invader', '0', 30),
            ])],
        }));

        await expect(page.locator('[data-minion-uid="mages-happy-special-board"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('法师-快乐小法师特殊-计分前响应前', testInfo);

        await game.advancePhase();
        await game.waitForPhase('scoreBases', 10000);
        await page.waitForFunction(
            () => {
                const state = (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.();
                return state?.sys?.phase === 'scoreBases'
                    && state?.sys?.responseWindow?.current?.windowType === 'meFirst'
                    && state?.sys?.interaction?.current?.data?.sourceId === 'smashup_reaction_choose';
            },
            { timeout: 15000, polling: 200 },
        );

        await expect.poll(async () => {
            const options = await game.getInteractionOptions() as InteractionOption[];
            return options.some(option =>
                option.value?.kind === 'activate_special'
                && option.value?.minionUid === 'mages-happy-special-board'
                && option.value?.baseIndex === 0,
            );
        }, { timeout: 10000 }).toBe(true);
        const specialMinionBox = await page.locator('[data-minion-uid="mages-happy-special-board"]').first().boundingBox();
        const specialButtonBox = await page.getByRole('button', { name: /快乐小法师\s*特殊能力/ }).boundingBox();
        expect(specialMinionBox, '快乐小法师本体必须可见').not.toBeNull();
        expect(specialButtonBox, '快乐小法师特殊能力按钮必须可见').not.toBeNull();
        if (specialMinionBox && specialButtonBox) {
            const overlaps = specialMinionBox.x < specialButtonBox.x + specialButtonBox.width
                && specialMinionBox.x + specialMinionBox.width > specialButtonBox.x
                && specialMinionBox.y < specialButtonBox.y + specialButtonBox.height
                && specialMinionBox.y + specialMinionBox.height > specialButtonBox.y;
            expect(overlaps, '响应选择按钮不能遮住快乐小法师本体').toBe(false);
        }
        await game.screenshot('法师-快乐小法师特殊-手动选择特殊能力', testInfo);

        await game.selectInteractionOptionBy(
            option => option.value?.kind === 'activate_special'
                && option.value?.minionUid === 'mages-happy-special-board'
                && option.value?.baseIndex === 0,
            '计分前选择快乐小法师特殊能力',
        );
        await game.waitForInteraction('munchkin_mages_happy_zapper_discard', 10000);
        await waitForSmashUpFxToSettle(page);
        await expectManualChoiceVisible(
            page,
            handCardSelector('mages-happy-special-cost'),
            '快乐小法师特殊能力选择弃牌成本',
            { forbidPromptContext: true },
        );
        await game.screenshot('法师-快乐小法师特殊-手动选择弃牌成本', testInfo);
        await page.locator(handCardSelector('mages-happy-special-cost')).first().click({ force: true });
        await game.waitForNoInteraction(15000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const events = (state.sys?.eventStream?.entries ?? []).map((entry: EventStreamEntry) => entry.event);
            return {
                hasTempPowerEvent: events.some((event: any) =>
                    event?.type === 'su:temp_power_added'
                    && event.payload?.minionUid === 'mages-happy-special-board'
                    && event.payload?.amount === 2,
                ),
                hasCostInDiscard: state.core.players?.['0']?.discard?.some((card: any) =>
                    card.uid === 'mages-happy-special-cost',
                ) ?? false,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 15000 }).toEqual({
            hasTempPowerEvent: true,
            hasCostInDiscard: true,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await game.screenshot('法师-快乐小法师特殊-结算后', testInfo);
    });

    test('法师魔杖天才手动选择弃牌成本和额外出牌类型', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinMagesRemainingScene({
            hand: [
                mageCard('mages-wand-1', 'munchkin_mages_wand_whiz', 'minion'),
                mageCard('mages-wand-cost', 'munchkin_mages_speed_reading', 'action'),
            ],
            bases: [mageBase('base_the_mothership')],
        }));

        await game.playCard('munchkin_mages_wand_whiz', { targetBaseIndex: 0 });
        await game.waitForInteraction('munchkin_mages_wand_whiz_discard', 10000);
        await waitForSmashUpFxToSettle(page);
        const wandCostSelector = handCardSelector('mages-wand-cost');
        await expectManualChoiceVisible(page, wandCostSelector, '魔杖天才选择弃牌成本', { forbidPromptContext: true });
        await waitForSmashUpHandCardToSettle(page, wandCostSelector);
        await game.screenshot('法师-魔杖天才-手动选择弃牌成本', testInfo);
        await page.locator(wandCostSelector).first().click({ force: true });
        await game.waitForInteraction('munchkin_mages_wand_whiz_mode', 10000);
        await waitForSmashUpFxToSettle(page);
        await expect(page.getByRole('button', { name: '额外随从' })).toBeVisible({ timeout: 15000 });
        await expect(page.getByRole('button', { name: '额外行动' })).toBeVisible({ timeout: 15000 });
        await game.screenshot('法师-魔杖天才-手动选择额外出牌类型', testInfo);
        await page.getByRole('button', { name: '额外行动' }).click({ force: true });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        const state = await game.getState();
        expect(state.core.players['0'].discard.map((entry: any) => entry.uid)).toEqual(['mages-wand-cost']);
        expect(state.core.players['0'].actionLimit).toBe(2);
        await game.screenshot('法师-魔杖天才-获得额外行动后', testInfo);
    });

    test('法师勤读者手动选择弃牌成本后抽一张牌', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinMagesRemainingScene({
            hand: [
                mageCard('mages-scroll-1', 'munchkin_mages_scroll_shuffler', 'minion'),
                mageCard('mages-scroll-cost', 'munchkin_mages_speed_reading', 'action'),
            ],
            deck: [{ uid: 'mages-scroll-draw', defId: 'alien_invader', type: 'minion', owner: '0' }],
            bases: [mageBase('base_the_mothership')],
        }));

        await game.playCard('munchkin_mages_scroll_shuffler', { targetBaseIndex: 0 });
        await game.waitForInteraction('munchkin_mages_scroll_shuffler_discard', 10000);
        await waitForSmashUpFxToSettle(page);
        await expectManualChoiceVisible(page, handCardSelector('mages-scroll-cost'), '勤读者选择弃牌成本', { forbidPromptContext: true });
        await game.screenshot('法师-勤读者-手动选择弃牌成本', testInfo);
        await page.locator(handCardSelector('mages-scroll-cost')).first().click({ force: true });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        const state = await game.getState();
        expect(state.core.players['0'].hand.map((entry: any) => entry.uid)).toContain('mages-scroll-draw');
        expect(state.core.players['0'].discard.map((entry: any) => entry.uid)).toEqual(['mages-scroll-cost']);
        expect(state.core.bases[0].minions.map((entry: any) => entry.uid)).toEqual(['mages-scroll-1']);
        await waitForSmashUpHandCardToSettle(page, handCardSelector('mages-scroll-draw'));
        await game.screenshot('法师-勤读者-抽牌后', testInfo);
    });

    test('法师大上一倍先手动选择仆从，再多选弃牌并增加力量', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinMagesRemainingScene({
            hand: [
                mageCard('mages-embiggen-1', 'munchkin_mages_embiggen', 'action'),
                mageCard('mages-embiggen-cost-a', 'munchkin_mages_speed_reading', 'action'),
                mageCard('mages-embiggen-cost-b', 'munchkin_mages_scroll_shuffler', 'minion'),
            ],
            bases: [mageBase('base_mages_tower', [minion('mages-embiggen-target', 'alien_invader', '0', 2)])],
        }));

        await game.playCard('munchkin_mages_embiggen');
        await game.waitForInteraction('munchkin_mages_embiggen_target', 10000);
        await waitForSmashUpFxToSettle(page);
        await expectManualMinionChoiceVisible(page, 'mages-embiggen-target', '大上一倍选择目标仆从', { forbidPromptContext: true });
        await game.screenshot('法师-大上一倍-手动选择目标仆从', testInfo);
        await clickManualMinionChoice(page, 'mages-embiggen-target', '大上一倍目标仆从');

        await game.waitForInteraction('munchkin_mages_embiggen_discard', 10000);
        await waitForSmashUpFxToSettle(page);
        await expectManualChoiceVisible(page, handCardSelector('mages-embiggen-cost-a'), '大上一倍选择第一张弃牌', { forbidPromptContext: true });
        await expectManualChoiceVisible(page, handCardSelector('mages-embiggen-cost-b'), '大上一倍选择第二张弃牌', { forbidPromptContext: true });
        await game.screenshot('法师-大上一倍-多选弃牌', testInfo);
        await page.locator(handCardSelector('mages-embiggen-cost-a')).first().click({ force: true });
        await page.locator(handCardSelector('mages-embiggen-cost-b')).first().click({ force: true });
        await game.confirm();
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        const state = await game.getState();
        expect(state.core.bases[0].minions.find((entry: any) => entry.uid === 'mages-embiggen-target')?.tempPowerModifier).toBe(2);
        expect(state.core.players['0'].discard.map((entry: any) => entry.uid)).toEqual([
            'mages-embiggen-1',
            'mages-embiggen-cost-a',
            'mages-embiggen-cost-b',
        ]);
        await game.screenshot('法师-大上一倍-增加力量后', testInfo);
    });

    test('法师通往次元之门从真实卡本体天赋手动选择弃牌并召唤怪物', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinMagesRemainingScene({
            hand: [
                mageCard('mages-portal-1', 'munchkin_mages_portal_to_beyond', 'action'),
                mageCard('mages-portal-cost', 'munchkin_mages_speed_reading', 'action'),
            ],
            monsterDeck: ['munchkin_monster_bigfoot'],
            bases: [mageBase('base_the_mothership')],
        }));

        await game.playCard('munchkin_mages_portal_to_beyond', { targetBaseIndex: 0 });
        await game.waitForNoInteraction(10000);
        const portal = page.locator('[data-ongoing-uid="mages-portal-1"]').first();
        await expect(portal).toBeVisible({ timeout: 15000 });
        await game.screenshot('法师-通往次元之门-打出后天赋入口', testInfo);
        await portal.click({ force: true });
        await game.waitForInteraction('munchkin_mages_portal_to_beyond_discard', 10000);
        await waitForSmashUpFxToSettle(page);
        await expectManualChoiceVisible(page, handCardSelector('mages-portal-cost'), '通往次元之门选择弃牌成本', { forbidPromptContext: true });
        await game.screenshot('法师-通往次元之门-手动选择弃牌成本', testInfo);
        await page.locator(handCardSelector('mages-portal-cost')).first().click({ force: true });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        const state = await game.getState();
        expect(state.core.bases[0].monsters).toHaveLength(1);
        expect(state.core.bases[0].monsters[0].defId).toBe('munchkin_monster_bigfoot');
        expect(state.core.players['0'].discard.map((entry: any) => entry.uid)).toEqual(['mages-portal-cost']);
        await game.screenshot('法师-通往次元之门-召唤怪物后', testInfo);
    });

    test('牧师抓鬼从真实法师天赋入口拦截亡灵怪物并保留普通怪物', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinMagesRemainingScene({
            hand: [
                mageCard('clerics-whack-portal-undead', 'munchkin_mages_portal_to_beyond', 'action'),
                mageCard('clerics-whack-cost-undead', 'munchkin_mages_speed_reading', 'action'),
                mageCard('clerics-whack-portal-living', 'munchkin_mages_portal_to_beyond', 'action'),
                mageCard('clerics-whack-cost-living', 'munchkin_mages_speed_reading', 'action'),
            ],
            monsterDeck: ['munchkin_monster_ghoul', 'munchkin_monster_bigfoot'],
            actionLimit: 2,
            nextUid: 5200,
            bases: [mageBase('base_whack_a_ghoul')],
        }));

        await game.screenshot('牧师-抓鬼-召唤前怪物牌库与基地', testInfo);

        await game.playCard('munchkin_mages_portal_to_beyond', { targetBaseIndex: 0 });
        await game.waitForNoInteraction(10000);
        const undeadPortal = page.locator('[data-ongoing-uid="clerics-whack-portal-undead"]').first();
        await expect(undeadPortal).toBeVisible({ timeout: 15000 });
        await undeadPortal.click({ force: true });
        await game.waitForInteraction('munchkin_mages_portal_to_beyond_discard', 10000);
        await waitForSmashUpFxToSettle(page);
        const undeadCostOptions = await game.getInteractionOptions() as InteractionOption[];
        const undeadCostOption = undeadCostOptions.find(
            (option: InteractionOption) => option.value?.cardUid === 'clerics-whack-cost-undead',
        );
        expect(undeadCostOption?.id, '抓鬼召唤亡灵怪物时应列出指定手牌作为弃牌成本').toBeTruthy();
        await expectManualChoiceVisible(
            page,
            `[data-option-id="${undeadCostOption!.id}"]`,
            '抓鬼召唤亡灵怪物时选择弃牌成本',
            { allowPromptCardGrid: true, forbidPromptContext: true },
        );
        await game.screenshot('牧师-抓鬼-召唤亡灵时手动选择弃牌', testInfo);
        await clickVisibleInteractionOptionBy(
            page,
            game,
            (option: InteractionOption) => option.value?.cardUid === 'clerics-whack-cost-undead',
            '抓鬼召唤亡灵怪物时选择弃牌成本',
        );
        await game.confirm();
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        const undeadState = await game.getState();
        expect(undeadState.core.bases[0].monsters ?? []).toEqual([]);
        expect(undeadState.core.monsterDeck).toEqual(['munchkin_monster_bigfoot', 'munchkin_monster_ghoul']);
        expect(undeadState.core.monsterDiscard ?? []).toEqual([]);
        expect(undeadState.core.players['0'].discard.map((entry: any) => entry.uid)).toContain('clerics-whack-cost-undead');
        await expect(page.getByTestId('su-base-monster-row-0')).toHaveCount(0);
        await game.screenshot('牧师-抓鬼-亡灵怪物被放回怪物牌库底', testInfo);

        await game.playCard('munchkin_mages_portal_to_beyond', { targetBaseIndex: 0 });
        await game.waitForNoInteraction(10000);
        const livingPortal = page.locator('[data-ongoing-uid="clerics-whack-portal-living"]').first();
        await expect(livingPortal).toBeVisible({ timeout: 15000 });
        await livingPortal.click({ force: true });
        await game.waitForInteraction('munchkin_mages_portal_to_beyond_discard', 10000);
        await waitForSmashUpFxToSettle(page);
        const livingCostOptions = await game.getInteractionOptions() as InteractionOption[];
        const livingCostOption = livingCostOptions.find(
            (option: InteractionOption) => option.value?.cardUid === 'clerics-whack-cost-living',
        );
        expect(livingCostOption?.id, '抓鬼召唤普通怪物时应列出指定手牌作为弃牌成本').toBeTruthy();
        await expectManualChoiceVisible(
            page,
            `[data-option-id="${livingCostOption!.id}"]`,
            '抓鬼召唤普通怪物时选择弃牌成本',
            { allowPromptCardGrid: true, forbidPromptContext: true },
        );
        await game.screenshot('牧师-抓鬼-召唤普通怪物时手动选择弃牌', testInfo);
        await clickVisibleInteractionOptionBy(
            page,
            game,
            (option: InteractionOption) => option.value?.cardUid === 'clerics-whack-cost-living',
            '抓鬼召唤普通怪物时选择弃牌成本',
        );
        await game.confirm();
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        const livingState = await game.getState();
        expect(livingState.core.bases[0].monsters).toEqual([
            expect.objectContaining({ defId: 'munchkin_monster_bigfoot' }),
        ]);
        expect(livingState.core.monsterDeck).toEqual(['munchkin_monster_ghoul']);
        expect(livingState.core.monsterDiscard ?? []).toEqual([]);
        await expect(page.getByTestId('su-base-monster-row-0')).toBeVisible();
        const livingMonsterUid = livingState.core.bases[0].monsters?.[0]?.uid;
        expect(livingMonsterUid).toBeTruthy();
        await expect(page.locator(`[data-monster-uid="${livingMonsterUid}"]`)).toBeVisible();
        await game.screenshot('牧师-抓鬼-普通怪物保留在基地下方', testInfo);
    });

    test('法师恢复奥术智慧抽牌直到手上有五张', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinMagesRemainingScene({
            hand: [
                mageCard('mages-recover-1', 'munchkin_mages_recover_arcane_wisdom', 'action'),
                mageCard('mages-recover-held', 'alien_invader', 'minion'),
            ],
            deck: [
                { uid: 'mages-recover-draw-a', defId: 'pirate_first_mate', type: 'minion', owner: '0' },
                { uid: 'mages-recover-draw-b', defId: 'alien_invader', type: 'minion', owner: '0' },
                { uid: 'mages-recover-draw-c', defId: 'pirate_buccaneer', type: 'minion', owner: '0' },
                { uid: 'mages-recover-draw-d', defId: 'alien_invader', type: 'minion', owner: '0' },
            ],
            bases: [mageBase('base_mages_tower')],
        }));

        await game.screenshot('法师-恢复奥术智慧-打出前', testInfo);
        await game.playCard('munchkin_mages_recover_arcane_wisdom');
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        const state = await game.getState();
        expect(state.core.players['0'].hand).toHaveLength(5);
        expect(state.core.players['0'].hand.map((entry: any) => entry.uid)).toEqual([
            'mages-recover-held',
            'mages-recover-draw-a',
            'mages-recover-draw-b',
            'mages-recover-draw-c',
            'mages-recover-draw-d',
        ]);
        await waitForSmashUpHandCardToSettle(page, handCardSelector('mages-recover-draw-d'));
        await game.screenshot('法师-恢复奥术智慧-手上五张牌', testInfo);
    });

    test('法师神奇的夜晚手动多选弃牌后获得额外低力量随从额度', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinMagesRemainingScene({
            hand: [
                mageCard('mages-evening-1', 'munchkin_mages_some_enchanted_evening', 'action'),
                mageCard('mages-evening-cost', 'munchkin_mages_speed_reading', 'action'),
                mageCard('mages-evening-extra', 'alien_invader', 'minion'),
            ],
            bases: [mageBase('base_the_mothership')],
        }));

        await game.playCard('munchkin_mages_some_enchanted_evening');
        await game.waitForInteraction('munchkin_mages_some_enchanted_evening_discard', 10000);
        await waitForSmashUpFxToSettle(page);
        await expectManualChoiceVisible(page, handCardSelector('mages-evening-cost'), '神奇的夜晚选择弃牌', { forbidPromptContext: true });
        await game.screenshot('法师-神奇的夜晚-手动选择弃牌', testInfo);
        await page.locator(handCardSelector('mages-evening-cost')).first().click({ force: true });
        await game.confirm();

        await game.waitForInteraction('smashup_immediate_extra_minion', 10000);
        await waitForSmashUpFxToSettle(page);
        const extraOptions = await game.getInteractionOptions() as InteractionOption[];
        expect(extraOptions.some(option => option.value?.cardUid === 'mages-evening-extra')).toBe(true);
        await game.screenshot('法师-神奇的夜晚-手动选择额外随从', testInfo);
        await game.selectInteractionOptionBy(
            option => option.value?.cardUid === 'mages-evening-extra',
            '神奇的夜晚选择额外随从',
        );
        await game.waitForInteraction('smashup_immediate_extra_minion_base', 10000);
        await game.selectInteractionOptionBy(option => option.value?.baseIndex === 0, '神奇的夜晚选择额外随从基地');
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        const state = await game.getState();
        expect(state.core.bases[0].minions.map((entry: any) => entry.uid)).toContain('mages-evening-extra');
        expect(state.core.players['0'].discard.map((entry: any) => entry.uid)).toEqual(['mages-evening-1', 'mages-evening-cost']);
        await game.screenshot('法师-神奇的夜晚-额外随从结算后', testInfo);
    });

    test('法师快速阅读手动选择弃牌成本后抽三张牌', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinMagesRemainingScene({
            hand: [
                mageCard('mages-speed-1', 'munchkin_mages_speed_reading', 'action'),
                mageCard('mages-speed-cost', 'munchkin_mages_scroll_shuffler', 'minion'),
            ],
            deck: [
                { uid: 'mages-speed-draw-a', defId: 'alien_invader', type: 'minion', owner: '0' },
                { uid: 'mages-speed-draw-b', defId: 'pirate_first_mate', type: 'minion', owner: '0' },
                { uid: 'mages-speed-draw-c', defId: 'pirate_buccaneer', type: 'minion', owner: '0' },
            ],
            bases: [mageBase('base_mages_tower')],
        }));

        await game.playCard('munchkin_mages_speed_reading');
        await game.waitForInteraction('munchkin_mages_speed_reading_discard', 10000);
        await waitForSmashUpFxToSettle(page);
        await expectManualChoiceVisible(page, handCardSelector('mages-speed-cost'), '快速阅读选择弃牌成本', { forbidPromptContext: true });
        await game.screenshot('法师-快速阅读-手动选择弃牌成本', testInfo);
        await page.locator(handCardSelector('mages-speed-cost')).first().click({ force: true });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        const state = await game.getState();
        expect(state.core.players['0'].hand.map((entry: any) => entry.uid)).toEqual([
            'mages-speed-draw-a',
            'mages-speed-draw-b',
            'mages-speed-draw-c',
        ]);
        expect(state.core.players['0'].discard.map((entry: any) => entry.uid)).toEqual(['mages-speed-1', 'mages-speed-cost']);
        await waitForSmashUpHandCardToSettle(page, handCardSelector('mages-speed-draw-c'));
        await game.screenshot('法师-快速阅读-抽三张牌后', testInfo);
    });

    test('半身人雇佣兵可按宝藏随从打出并开放第二个随从额度', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinTreasureMinionScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="halfling-hireling-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="tiger-steed-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-base-monster-row-0')).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await expect(page.locator('[data-testid="su-munchkin-treasure-discard"]')).toHaveCount(0);
        await game.screenshot('39-半身人雇佣兵手牌与目标基地', testInfo);

        await game.playCard('munchkin_treasure_halfling_hireling', { targetBaseIndex: 0 });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);
        await expect(page.locator('[data-minion-uid="halfling-hireling-1"]').first()).toBeVisible({ timeout: 15000 });

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;
            return {
                base0Uids: core.bases[0].minions.map(minion => minion.uid),
                player0HandDefIds: player0?.hand?.map(card => card.defId) ?? [],
                player0DiscardDefIds: player0?.discard?.map(card => card.defId) ?? [],
                player0MinionsPlayed: player0?.minionsPlayed ?? 0,
                player0MinionLimit: player0?.minionLimit ?? 0,
                hasLongTermTreasureZone: player0 ? Object.prototype.hasOwnProperty.call(player0, 'treasures') : false,
                triggerQueueLength: core.triggerQueue?.length ?? 0,
            };
        }, { timeout: 10000 }).toEqual({
            base0Uids: ['halfling-hireling-1'],
            player0HandDefIds: ['munchkin_treasure_tiger_steed', 'munchkin_treasure_dwarf_hireling'],
            player0DiscardDefIds: [],
            player0MinionsPlayed: 1,
            player0MinionLimit: 2,
            hasLongTermTreasureZone: false,
            triggerQueueLength: 0,
        });

        await game.playCard('munchkin_treasure_tiger_steed', { targetBaseIndex: 0 });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;
            return {
                base0Uids: core.bases[0].minions.map(minion => minion.uid),
                player0HandUids: player0?.hand?.map(card => card.uid) ?? [],
                player0DiscardDefIds: player0?.discard?.map(card => card.defId) ?? [],
                player0MinionsPlayed: player0?.minionsPlayed ?? 0,
                player0MinionLimit: player0?.minionLimit ?? 0,
                treasureDeckSize: core.treasureDeck?.length ?? 0,
                treasureDiscardSize: core.treasureDiscard?.length ?? 0,
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            base0Uids: ['halfling-hireling-1', 'tiger-steed-1'],
            player0HandUids: ['munchkin_treasure_760'],
            player0DiscardDefIds: [],
            player0MinionsPlayed: 2,
            player0MinionLimit: 2,
            treasureDeckSize: 21,
            treasureDiscardSize: 0,
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 21');
        await page.waitForTimeout(1000);
        await game.screenshot('40-半身人雇佣兵开放第二个随从后状态', testInfo);
    });

    test('半身人可打出后只开放同基地额外随从额度', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinQuarterlingScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="quarterling-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="quarterling-away-blocked-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="quarterling-extra-here-1"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('98-半身人手牌与两个候选基地', testInfo);

        await game.playCard('munchkin_halflings_quarterling', { targetBaseIndex: 0 });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await game.playCard('alien_invader', { targetBaseIndex: 1 });
        await page.waitForTimeout(600);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            return {
                base0Uids: core.bases[0].minions.map(entry => entry.uid),
                base1Uids: core.bases[1].minions.map(entry => entry.uid),
                handUids: core.players?.['0']?.hand?.map(card => card.uid) ?? [],
                quota0: core.players?.['0']?.baseLimitedMinionQuota?.[0] ?? 0,
                minionsPlayed: core.players?.['0']?.minionsPlayed ?? 0,
            };
        }, { timeout: 10000 }).toEqual({
            base0Uids: ['quarterling-1'],
            base1Uids: [],
            handUids: ['quarterling-away-blocked-1', 'quarterling-extra-here-1'],
            quota0: 1,
            minionsPlayed: 1,
        });
        await game.screenshot('99-半身人额外随从不能打到其他基地', testInfo);

        await game.playCard('pirate_first_mate', { targetBaseIndex: 0 });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            return {
                base0Uids: core.bases[0].minions.map(entry => entry.uid),
                base1Uids: core.bases[1].minions.map(entry => entry.uid),
                handUids: core.players?.['0']?.hand?.map(card => card.uid) ?? [],
                quota0: core.players?.['0']?.baseLimitedMinionQuota?.[0] ?? 0,
                minionsPlayed: core.players?.['0']?.minionsPlayed ?? 0,
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            base0Uids: ['quarterling-1', 'quarterling-extra-here-1'],
            base1Uids: [],
            handUids: ['quarterling-away-blocked-1'],
            quota0: 0,
            minionsPlayed: 1,
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await expect(page.getByText('本回合随从额度已用完')).toHaveCount(0, { timeout: 8000 });
        await page.mouse.move(24, 24);
        await game.screenshot('100-半身人额外随从打到同基地后收口', testInfo);
    });

    test('生日派对无人时阻止去别处打随从，补上后恢复其他基地打出', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinBirthdayPartyRestrictionScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="birthday-blocked-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="birthday-guest-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="birthday-free-1"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('101-生日派对无人时手牌与基地', testInfo);

        await game.playCard('alien_invader', { targetBaseIndex: 1 });
        await page.waitForTimeout(600);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            return {
                birthdayUids: core.bases[0].minions.map(entry => entry.uid),
                otherUids: core.bases[1].minions.map(entry => entry.uid),
                handUids: core.players?.['0']?.hand?.map(card => card.uid) ?? [],
                minionsPlayed: core.players?.['0']?.minionsPlayed ?? 0,
            };
        }, { timeout: 10000 }).toEqual({
            birthdayUids: [],
            otherUids: [],
            handUids: ['birthday-blocked-1', 'birthday-guest-1', 'birthday-free-1'],
            minionsPlayed: 0,
        });

        await game.playCard('munchkin_halflings_pestling', { targetBaseIndex: 0 });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);
        await game.screenshot('102-生日派对补上己方仆从', testInfo);

        await game.playCard('pirate_first_mate', { targetBaseIndex: 1 });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            return {
                birthdayUids: core.bases[0].minions.map(entry => entry.uid),
                otherUids: core.bases[1].minions.map(entry => entry.uid),
                handUids: core.players?.['0']?.hand?.map(card => card.uid) ?? [],
                minionsPlayed: core.players?.['0']?.minionsPlayed ?? 0,
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            birthdayUids: ['birthday-guest-1'],
            otherUids: ['birthday-free-1'],
            handUids: ['birthday-blocked-1'],
            minionsPlayed: 2,
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await game.screenshot('103-生日派对有己方仆从后允许去别处', testInfo);
    });

    test('地下矮屋回合开始给没有仆从的玩家一个本基地额外随从额度', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinSubterraneanLairScene());

        await game.advancePhase();
        await game.waitForCurrentPlayer('0', 10000);
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            return {
                currentPlayerIndex: core.currentPlayerIndex,
                quota0: core.players?.['0']?.baseLimitedMinionQuota?.[0] ?? 0,
                handUids: core.players?.['0']?.hand?.map(card => card.uid) ?? [],
            };
        }, { timeout: 10000 }).toEqual({
            currentPlayerIndex: 0,
            quota0: 1,
            handUids: ['lair-normal-away-1', 'lair-extra-here-1'],
        });
        await game.screenshot('104-地下矮屋回合开始授予本基地额度', testInfo);

        await game.playCard('alien_invader', { targetBaseIndex: 1 });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await game.playCard('pirate_first_mate', { targetBaseIndex: 0 });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            return {
                lairUids: core.bases[0].minions.map(entry => entry.uid),
                otherUids: core.bases[1].minions.map(entry => entry.uid),
                handUids: core.players?.['0']?.hand?.map(card => card.uid) ?? [],
                quota0: core.players?.['0']?.baseLimitedMinionQuota?.[0] ?? 0,
                minionsPlayed: core.players?.['0']?.minionsPlayed ?? 0,
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            lairUids: ['lair-extra-here-1'],
            otherUids: ['lair-normal-away-1'],
            handUids: [],
            quota0: 0,
            minionsPlayed: 1,
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await game.screenshot('105-地下矮屋额外随从打到本基地后收口', testInfo);
    });

    test('夏尔首领天赋选择基地后只开放所选基地额外随从额度', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinShireMarshalScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        const marshal = page.locator('[data-minion-uid="shire-marshal-1"]').first();
        await expect(marshal).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="shire-extra-here-1"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('106-夏尔首领天赋前多基地候选', testInfo);

        await marshal.click({ force: true });
        await game.waitForInteraction('munchkin_halflings_shire_marshal_choose_base', 10000);
        await game.screenshot('107-夏尔首领选择额外随从基地', testInfo);

        await game.selectInteractionOptionBy(
            (option: InteractionOption) => option.value?.baseIndex === 1,
            '夏尔首领目标基地',
        );
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            return {
                base0Uids: core.bases[0].minions.map(entry => entry.uid),
                base1Uids: core.bases[1].minions.map(entry => entry.uid),
                handUids: core.players?.['0']?.hand?.map(card => card.uid) ?? [],
                quota0: core.players?.['0']?.baseLimitedMinionQuota?.[0] ?? 0,
                quota1: core.players?.['0']?.baseLimitedMinionQuota?.[1] ?? 0,
            };
        }, { timeout: 10000 }).toEqual({
            base0Uids: ['shire-marshal-1', 'shire-opponent-1'],
            base1Uids: ['shire-opponent-2'],
            handUids: ['shire-extra-here-1'],
            quota0: 0,
            quota1: 1,
        });

        await game.playCard('pirate_first_mate', { targetBaseIndex: 1 });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const shireMarshalState = core.bases[0].minions.find(entry => entry.uid === 'shire-marshal-1');
            return {
                base0Uids: core.bases[0].minions.map(entry => entry.uid),
                base1Uids: core.bases[1].minions.map(entry => entry.uid),
                handUids: core.players?.['0']?.hand?.map(card => card.uid) ?? [],
                quota1: core.players?.['0']?.baseLimitedMinionQuota?.[1] ?? 0,
                marshalTalentUsed: shireMarshalState?.talentUsed === true,
                minionsPlayed: core.players?.['0']?.minionsPlayed ?? 0,
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            base0Uids: ['shire-marshal-1', 'shire-opponent-1'],
            base1Uids: ['shire-opponent-2', 'shire-extra-here-1'],
            handUids: [],
            quota1: 0,
            marshalTalentUsed: true,
            minionsPlayed: 1,
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await game.screenshot('108-夏尔首领额外随从打到所选基地后收口', testInfo);
    });

    test('调皮鬼打出后只开放本基地额外随从额度', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinPestlingScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="pestling-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="pestling-away-blocked-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="pestling-extra-here-1"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('109-调皮鬼手牌与两个候选基地', testInfo);

        await game.playCard('munchkin_halflings_pestling', { targetBaseIndex: 0 });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await game.playCard('alien_invader', { targetBaseIndex: 1 });
        await page.waitForTimeout(600);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            return {
                base0Uids: core.bases[0].minions.map(entry => entry.uid),
                base1Uids: core.bases[1].minions.map(entry => entry.uid),
                handUids: core.players?.['0']?.hand?.map(card => card.uid) ?? [],
                quota0: core.players?.['0']?.baseLimitedMinionQuota?.[0] ?? 0,
                minionsPlayed: core.players?.['0']?.minionsPlayed ?? 0,
            };
        }, { timeout: 10000 }).toEqual({
            base0Uids: ['pestling-1'],
            base1Uids: [],
            handUids: ['pestling-away-blocked-1', 'pestling-extra-here-1'],
            quota0: 1,
            minionsPlayed: 1,
        });
        await game.screenshot('110-调皮鬼额外随从不能打到其他基地', testInfo);

        await game.playCard('pirate_first_mate', { targetBaseIndex: 0 });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            return {
                base0Uids: core.bases[0].minions.map(entry => entry.uid),
                base1Uids: core.bases[1].minions.map(entry => entry.uid),
                handUids: core.players?.['0']?.hand?.map(card => card.uid) ?? [],
                quota0: core.players?.['0']?.baseLimitedMinionQuota?.[0] ?? 0,
                minionsPlayed: core.players?.['0']?.minionsPlayed ?? 0,
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            base0Uids: ['pestling-1', 'pestling-extra-here-1'],
            base1Uids: [],
            handUids: ['pestling-away-blocked-1'],
            quota0: 0,
            minionsPlayed: 1,
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await game.screenshot('111-调皮鬼额外随从打到同基地后收口', testInfo);
    });

    test('吟游诗人对手力量更大时只开放本基地额外随从额度', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinBardlingScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="bardling-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="bardling-away-blocked-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="bardling-extra-here-1"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('112-吟游诗人手牌与对手高力量基地', testInfo);

        await game.playCard('munchkin_halflings_bardling', { targetBaseIndex: 0 });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await game.playCard('alien_invader', { targetBaseIndex: 1 });
        await page.waitForTimeout(600);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            return {
                base0Uids: core.bases[0].minions.map(entry => entry.uid),
                base1Uids: core.bases[1].minions.map(entry => entry.uid),
                handUids: core.players?.['0']?.hand?.map(card => card.uid) ?? [],
                quota0: core.players?.['0']?.baseLimitedMinionQuota?.[0] ?? 0,
                minionsPlayed: core.players?.['0']?.minionsPlayed ?? 0,
            };
        }, { timeout: 10000 }).toEqual({
            base0Uids: ['bardling-ally-1', 'bardling-opponent-1', 'bardling-1'],
            base1Uids: [],
            handUids: ['bardling-away-blocked-1', 'bardling-extra-here-1'],
            quota0: 1,
            minionsPlayed: 1,
        });
        await game.screenshot('113-吟游诗人额外随从不能打到其他基地', testInfo);

        await game.playCard('pirate_first_mate', { targetBaseIndex: 0 });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            return {
                base0Uids: core.bases[0].minions.map(entry => entry.uid),
                base1Uids: core.bases[1].minions.map(entry => entry.uid),
                handUids: core.players?.['0']?.hand?.map(card => card.uid) ?? [],
                quota0: core.players?.['0']?.baseLimitedMinionQuota?.[0] ?? 0,
                minionsPlayed: core.players?.['0']?.minionsPlayed ?? 0,
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            base0Uids: ['bardling-ally-1', 'bardling-opponent-1', 'bardling-1', 'bardling-extra-here-1'],
            base1Uids: [],
            handUids: ['bardling-away-blocked-1'],
            quota0: 0,
            minionsPlayed: 1,
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await game.screenshot('114-吟游诗人额外随从打到同基地后收口', testInfo);
    });

    test('午餐散步在本基地打出仆从后真实抽牌', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinLunchRunScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="lunch-run-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="lunch-minion-1"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('115-午餐散步手牌与目标基地', testInfo);

        await game.playCard('munchkin_halflings_lunch_run', { targetBaseIndex: 0 });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);
        await expect(page.locator('[data-ongoing-uid="lunch-run-1"]').first()).toBeVisible({ timeout: 15000 });

        await game.playCard('alien_invader', { targetBaseIndex: 0 });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;
            return {
                base0Minions: core.bases[0].minions.map(entry => entry.uid),
                base0Ongoing: core.bases[0].ongoingActions?.map(action => action.uid) ?? [],
                player0HandUids: player0?.hand?.map(card => card.uid) ?? [],
                player0DeckTopUid: player0?.deck?.[0]?.uid ?? null,
                player0DiscardUids: player0?.discard?.map(card => card.uid) ?? [],
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            base0Minions: ['lunch-minion-1'],
            base0Ongoing: ['lunch-run-1'],
            player0HandUids: ['lunch-draw-1'],
            player0DeckTopUid: '0-deck-0',
            player0DiscardUids: [],
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await game.screenshot('116-午餐散步触发后抽到一张牌', testInfo);
    });

    test('偷偷摸摸保护本基地己方仆从不受对手行动影响', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinSneaksyScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="sneaksy-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="sneaksy-protected-1"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('117-偷偷摸摸打出前本基地己方仆从', testInfo);

        await game.playCard('munchkin_halflings_sneaksy', { targetBaseIndex: 0 });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);
        await expect(page.locator('[data-ongoing-uid="sneaksy-1"]').first()).toBeVisible({ timeout: 15000 });

        await game.setupScene(buildMunchkinSneaksyProtectionScene());
        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await game.waitForCurrentPlayer('1', 15000);
        await expect(page.locator('[data-card-uid="sneaksy-broadside-1"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('118-偷偷摸摸在场后轮到对手行动', testInfo);

        await game.playCard('pirate_broadside');
        await page.waitForTimeout(600);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const events = (state.sys?.eventStream?.entries ?? []).map((entry: EventStreamEntry) => entry.event);
            return {
                base0Minions: core.bases[0].minions.map(entry => entry.uid),
                base0Ongoing: core.bases[0].ongoingActions?.map(action => action.uid) ?? [],
                player1DiscardDefIds: core.players?.['1']?.discard?.map(card => card.defId) ?? [],
                player1ActionsPlayed: core.players?.['1']?.actionsPlayed ?? 0,
                broadsideDestroyedProtected: events.some(event =>
                    event?.type === 'su:minion_destroyed'
                    && event.payload?.reason === 'pirate_broadside'
                    && event.payload?.minionUid === 'sneaksy-protected-1'
                ),
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            base0Minions: ['sneaksy-protected-1', 'sneaksy-opponent-1'],
            base0Ongoing: ['sneaksy-1'],
            player1DiscardDefIds: ['pirate_broadside'],
            player1ActionsPlayed: 1,
            broadsideDestroyedProtected: false,
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await game.screenshot('119-偷偷摸摸保护后侧舷炮击无合法目标', testInfo);
    });

    test('偷袭展示牌库直到两个仆从并把它们加入手牌', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinOutOfNowhereScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="out-of-nowhere-1"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('120-偷袭打出前手牌与牌库', testInfo);

        await game.playCard('munchkin_halflings_out_of_nowhere');
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;
            const events = (state.sys?.eventStream?.entries ?? []).map((entry: EventStreamEntry) => entry.event);
            const reveal = events.find(event => event?.type === 'su:reveal_deck_top');
            const draw = events.find(event => event?.type === 'su:cards_drawn');
            return {
                handUids: player0?.hand?.map(card => card.uid) ?? [],
                deckUids: player0?.deck?.map(card => card.uid) ?? [],
                discardUids: player0?.discard?.map(card => card.uid) ?? [],
                revealCount: reveal?.payload?.cards?.length ?? 0,
                drawnUids: draw?.payload?.cardUids ?? [],
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            handUids: ['out-reveal-minion-1', 'out-reveal-minion-2'],
            deckUids: ['out-unrevealed-1', 'out-reveal-action-1', 'out-reveal-action-2'],
            discardUids: ['out-of-nowhere-1'],
            revealCount: 4,
            drawnUids: ['out-reveal-minion-1', 'out-reveal-minion-2'],
            triggerQueueLength: 0,
            interactionSourceId: null,
        });
        await game.screenshot('121-偷袭结算后两个仆从进手牌', testInfo);
    });

    test('最后通牒在计分前打出手牌随从并取消其能力', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinLastCallScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="last-call-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="last-call-minion-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="last-call-scorer"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('122-最后通牒计分前手牌与当前基地', testInfo);

        await game.advancePhase();
        await game.waitForPhase('scoreBases', 10000);
        await page.waitForFunction(
            () => {
                const state = (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.();
                return state?.sys?.phase === 'scoreBases'
                    && state?.sys?.responseWindow?.current?.windowType === 'meFirst'
                    && state?.sys?.interaction?.current?.data?.sourceId === 'smashup_reaction_choose';
            },
            { timeout: 15000, polling: 200 },
        );
        await expect.poll(async () => {
            const options = await game.getInteractionOptions() as InteractionOption[];
            return {
                hasLastCallOption: options.some(option =>
                    option.value?.kind === 'play_action'
                    && option.value?.cardUid === 'last-call-1'
                    && option.value?.targetBaseIndex === 0
                ),
            };
        }, { timeout: 10000 }).toEqual({ hasLastCallOption: true });
        await game.screenshot('123-最后通牒beforeScoring响应入口', testInfo);

        await game.selectInteractionOptionBy(
            (option: InteractionOption) =>
                option.value?.kind === 'play_action'
                && option.value?.cardUid === 'last-call-1'
                && option.value?.targetBaseIndex === 0,
            'beforeScoring 选择最后通牒',
        );
        await game.waitForInteraction('munchkin_halflings_last_call_choose_minion', 10000);
        await game.screenshot('124-最后通牒选择要打出的手牌随从', testInfo);
        await game.selectInteractionOptionBy(
            (option: InteractionOption) => option.value?.cardUid === 'last-call-minion-1',
            '最后通牒选择海盗大副',
        );
        await game.waitForNoInteraction(15000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState & { suppressedCardUidsUntilTurnEnd?: string[] };
            const events = (state.sys?.eventStream?.entries ?? []).map((entry: EventStreamEntry) => entry.event);
            return {
                playedByLastCall: events.some(event =>
                    event?.type === 'su:minion_played'
                    && event.payload?.cardUid === 'last-call-minion-1'
                    && event.payload?.skipOnPlayAbility === true
                ),
                suppressedByLastCall: events.some(event =>
                    event?.type === 'su:cards_suppressed_until_turn_end'
                    && event.payload?.reason === 'munchkin_halflings_last_call'
                    && event.payload?.cardUids?.includes('last-call-minion-1')
                ),
                player0DiscardUids: core.players?.['0']?.discard?.map(card => card.uid) ?? [],
                suppressionStillActiveAfterScoring: core.suppressedCardUidsUntilTurnEnd ?? [],
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            playedByLastCall: true,
            suppressedByLastCall: true,
            player0DiscardUids: ['last-call-1', 'last-call-scorer', 'last-call-minion-1'],
            suppressionStillActiveAfterScoring: [],
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await game.screenshot('125-最后通牒计分收口后随从已进弃牌', testInfo);
    });

    test('惊醒把手牌所有随从额外打到所选基地并取消能力', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinRudeAwakeningScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="awakening-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="awakening-minion-a"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="awakening-minion-b"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('126-惊醒打出前手牌随从与目标基地', testInfo);

        await game.playCard('munchkin_halflings_rude_awakening', { targetBaseIndex: 1 });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState & { suppressedCardUidsUntilTurnEnd?: string[] };
            const events = (state.sys?.eventStream?.entries ?? []).map((entry: EventStreamEntry) => entry.event);
            return {
                base0Minions: core.bases[0].minions.map(entry => entry.uid),
                base1Minions: core.bases[1].minions.map(entry => entry.uid),
                handUids: core.players?.['0']?.hand?.map(card => card.uid) ?? [],
                discardUids: core.players?.['0']?.discard?.map(card => card.uid) ?? [],
                suppressed: core.suppressedCardUidsUntilTurnEnd ?? [],
                revealedUids: events.find(event => event?.type === 'su:reveal_hand')?.payload?.cards?.map(card => card.uid) ?? [],
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            base0Minions: [],
            base1Minions: ['awakening-minion-a', 'awakening-minion-b'],
            handUids: ['awakening-left-action'],
            discardUids: ['awakening-1'],
            suppressed: ['awakening-minion-a', 'awakening-minion-b'],
            revealedUids: ['awakening-minion-a', 'awakening-minion-b', 'awakening-left-action'],
            triggerQueueLength: 0,
            interactionSourceId: null,
        });
        await game.screenshot('127-惊醒结算后所有手牌随从入所选基地', testInfo);
    });

    test('小而坚韧让宿主被摧毁时回到牌库顶', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinSmallButToughScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        const host = page.locator('[data-minion-uid="small-host-1"]').first();
        await expect(page.locator('[data-card-uid="small-but-tough-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="small-destroyer-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(host).toBeVisible({ timeout: 15000 });
        await game.screenshot('128-小而坚韧附着前宿主与摧毁者', testInfo);

        await game.playCard('munchkin_halflings_small_but_tough', { targetMinionUid: 'small-host-1' });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);
        await host.hover();
        await expect(page.locator('[data-attached-action-uid="small-but-tough-1"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('129-小而坚韧已附着到宿主', testInfo);

        await game.playCard('pirate_saucy_wench', { targetBaseIndex: 0 });
        await game.waitForInteraction('pirate_saucy_wench', 10000);
        await game.screenshot('130-粗鲁少妇选择摧毁小而坚韧宿主', testInfo);
        await game.selectInteractionOptionBy(
            (option: InteractionOption) => option.value?.minionUid === 'small-host-1',
            '粗鲁少妇选择小而坚韧宿主',
        );
        await page.waitForTimeout(600);
        if ((await getReactionWindowStatus(page)).sourceId === 'smashup_reaction_choose') {
            await chooseReactionBySourceDefId(page, game, 'munchkin_halflings_small_but_tough', '小而坚韧触发');
        }
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            return {
                base0Minions: core.bases[0].minions.map(entry => entry.uid),
                deckUids: core.players?.['0']?.deck?.map(card => card.uid) ?? [],
                discardUids: core.players?.['0']?.discard?.map(card => card.uid) ?? [],
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            base0Minions: ['small-destroyer-1'],
            deckUids: ['small-host-1', 'small-deck-1'],
            discardUids: ['small-but-tough-1'],
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await game.screenshot('131-小而坚韧宿主回到牌库顶', testInfo);
    });

    test('被宠坏的小家伙从弃牌堆多选随从洗回牌库顶', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinSpoiledBratsScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="spoiled-1"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('132-被宠坏的小家伙打出前手牌与弃牌堆', testInfo);

        await game.playCard('munchkin_halflings_spoiled_brats');
        await game.waitForInteraction('munchkin_halflings_spoiled_brats_choose_minions', 10000);
        const options = await game.getInteractionOptions() as InteractionOption[];
        const minionA = options.find(option => option.value?.cardUid === 'spoiled-minion-1');
        const minionB = options.find(option => option.value?.cardUid === 'spoiled-minion-2');
        const actionOption = options.find(option => option.value?.cardUid === 'spoiled-action-1');
        expect(minionA?.id, '弃牌堆第一个随从必须可选').toBeTruthy();
        expect(minionB?.id, '弃牌堆第二个随从必须可选').toBeTruthy();
        expect(actionOption?.id, '弃牌堆非随从不应可选').toBeFalsy();
        await game.screenshot('133-被宠坏的小家伙多选弃牌堆随从', testInfo);

        await expect(page.locator('[data-discard-view-panel] [data-card-uid="spoiled-minion-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-discard-view-panel] [data-card-uid="spoiled-minion-2"]').first()).toBeVisible({ timeout: 15000 });
        await page.locator('[data-discard-view-panel] [data-card-uid="spoiled-minion-1"]').first().click({ force: true });
        await page.locator('[data-discard-view-panel] [data-card-uid="spoiled-minion-2"]').first().click({ force: true });
        await game.confirm();
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;
            return {
                deckUids: player0?.deck?.map(card => card.uid) ?? [],
                discardUids: player0?.discard?.map(card => card.uid) ?? [],
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            deckUids: ['spoiled-minion-1', 'spoiled-minion-2', 'spoiled-deck-1'],
            discardUids: ['spoiled-action-1', 'spoiled-1'],
            triggerQueueLength: 0,
            interactionSourceId: null,
        });
        await game.screenshot('134-被宠坏的小家伙把所选随从放到牌库顶', testInfo);
    });

    test('意外的派对选择无己方随从基地并立即打出额外随从', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinUnexpectedPartyScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="party-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="party-minion-1"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('135-意外的派对打出前无己方随从目标基地', testInfo);

        await game.playCard('munchkin_halflings_unexpected_party');
        await game.waitForInteraction('munchkin_halflings_unexpected_party_choose_base', 10000);
        await expect.poll(async () => {
            const options = await game.getInteractionOptions() as InteractionOption[];
            return {
                hasSkip: options.some(option => option.value?.skip === true),
                hasOwnBase: options.some(option => option.value?.baseIndex === 0),
                hasEnemyOnlyBase: options.some(option => option.value?.baseIndex === 1),
            };
        }, { timeout: 10000 }).toEqual({
            hasSkip: true,
            hasOwnBase: false,
            hasEnemyOnlyBase: true,
        });
        await game.screenshot('136-意外的派对只能选择没有己方随从的基地', testInfo);

        await game.selectInteractionOptionBy(
            (option: InteractionOption) => option.value?.baseIndex === 1,
            '意外的派对选择无己方随从基地',
        );
        await game.waitForInteraction('smashup_immediate_extra_minion', 10000);
        await game.screenshot('137-意外的派对进入立即额外随从选择', testInfo);
        await game.selectInteractionOptionBy(
            (option: InteractionOption) => option.value?.cardUid === 'party-minion-1',
            '意外的派对选择额外打出海盗大副',
        );
        await game.waitForInteraction('smashup_immediate_extra_minion_base', 10000);
        await expectCurrentInteractionManual(game, '意外的派对额外随从基地选择');
        const extraBaseOptions = await game.getInteractionOptions() as InteractionOption[];
        expect(extraBaseOptions.some((option) => option.value?.baseIndex === 1)).toBe(true);
        expect(extraBaseOptions.some((option) => option.value?.baseIndex === 0)).toBe(false);
        await expectManualChoiceVisible(page, '[data-base-index="1"]', '意外的派对必须显示额外随从目标基地', { forbidPromptContext: true });
        await game.screenshot('137b-意外的派对手动选择额外随从基地', testInfo);
        await game.selectInteractionOptionBy(
            (option: InteractionOption) => option.value?.baseIndex === 1,
            '意外的派对选择额外随从基地',
        );
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            return {
                base0Minions: core.bases[0].minions.map(entry => entry.uid),
                base1Minions: core.bases[1].minions.map(entry => entry.uid),
                handUids: core.players?.['0']?.hand?.map(card => card.uid) ?? [],
                discardUids: core.players?.['0']?.discard?.map(card => card.uid) ?? [],
                minionsPlayed: core.players?.['0']?.minionsPlayed ?? 0,
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            base0Minions: ['party-own-1'],
            base1Minions: ['party-enemy-1', 'party-minion-1'],
            handUids: [],
            discardUids: ['party-1'],
            minionsPlayed: 1,
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await game.screenshot('138-意外的派对额外随从打到所选基地后收口', testInfo);
    });

    test('盗贼大师可从真实天赋入口抽一张公共宝藏', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinThievesMasterThiefScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        const master = page.locator('[data-minion-uid="master-thief-1"]').first();
        await expect(master).toBeVisible({ timeout: 15000 });
        await expect(master).toHaveAttribute('data-activation-armed', 'false');
        await expect(page.getByTestId('su-base-monster-row-0')).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 2');
        await expect(page.locator('[data-testid="su-munchkin-treasure-discard"]')).toHaveCount(0);
        await game.screenshot('139-盗贼大师天赋前宝藏堆与怪物槽', testInfo);

        await master.click({ force: true });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const masterState = core.bases[0].minions.find(minion => minion.uid === 'master-thief-1');
            const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;
            return {
                masterTalentUsed: masterState?.talentUsed === true,
                player0HandUids: player0?.hand?.map(card => card.uid) ?? [],
                player0HandDefIds: player0?.hand?.map(card => card.defId) ?? [],
                treasureDeck: core.treasureDeck ?? [],
                treasureDiscardSize: core.treasureDiscard?.length ?? 0,
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            masterTalentUsed: true,
            player0HandUids: ['master-pressure-action', 'munchkin_treasure_1900'],
            player0HandDefIds: ['alien_probe', 'munchkin_treasure_wishing_ring'],
            treasureDeck: ['munchkin_treasure_spiky_boots'],
            treasureDiscardSize: 0,
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });

        await expect(page.locator('[data-card-uid="munchkin_treasure_1900"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-minion-used-badge-master-thief-1')).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 1');
        await expect(page.locator('[data-testid="su-munchkin-treasure-discard"]')).toHaveCount(0);
        await game.screenshot('140-盗贼大师天赋后宝藏进入手牌', testInfo);
    });

    test('顺手拿走作为普通行动从真实手牌入口抽一张公共宝藏', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinThievesSwipeScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="swipe-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="swipe-pressure-minion"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-base-monster-row-0')).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 2');
        await game.screenshot('141-顺手拿走打出前手牌与宝藏堆', testInfo);

        await game.playCard('munchkin_thieves_swipe');
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;
            return {
                player0HandUids: player0?.hand?.map(card => card.uid) ?? [],
                player0HandDefIds: player0?.hand?.map(card => card.defId) ?? [],
                player0DiscardDefIds: player0?.discard?.map(card => card.defId) ?? [],
                player0ActionsPlayed: player0?.actionsPlayed ?? 0,
                treasureDeck: core.treasureDeck ?? [],
                treasureDiscardSize: core.treasureDiscard?.length ?? 0,
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            player0HandUids: ['swipe-pressure-minion', 'munchkin_treasure_1910'],
            player0HandDefIds: ['alien_invader', 'munchkin_treasure_wishing_ring'],
            player0DiscardDefIds: ['munchkin_thieves_swipe'],
            player0ActionsPlayed: 1,
            treasureDeck: ['munchkin_treasure_spiky_boots'],
            treasureDiscardSize: 0,
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });

        await expect(page.locator('[data-card-uid="munchkin_treasure_1910"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 1');
        await expect(page.locator('[data-testid="su-munchkin-treasure-discard"]')).toHaveCount(0);
        await game.screenshot('142-顺手拿走结算后宝藏进入手牌', testInfo);
    });

    test('扒手只有同基地已有另一个扒手时才从真实打出入口抽宝藏', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinThievesPickpocketScene(true));

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="pickpocket-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="other-pickpocket"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-base-monster-row-0')).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 2');
        await game.screenshot('143-扒手同基地已有另一个扒手前', testInfo);

        await game.playCard('munchkin_thieves_pickpocket', { targetBaseIndex: 0 });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;
            return {
                base0Uids: core.bases[0].minions.map(minion => minion.uid),
                player0HandUids: player0?.hand?.map(card => card.uid) ?? [],
                player0HandDefIds: player0?.hand?.map(card => card.defId) ?? [],
                treasureDeck: core.treasureDeck ?? [],
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            base0Uids: ['other-pickpocket', 'pickpocket-1'],
            player0HandUids: ['munchkin_treasure_1920'],
            player0HandDefIds: ['munchkin_treasure_wishing_ring'],
            treasureDeck: ['munchkin_treasure_spiky_boots'],
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await expect(page.locator('[data-card-uid="munchkin_treasure_1920"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 1');
        await game.screenshot('144-扒手同基地有另一个扒手后抽宝藏', testInfo);

        await game.setupScene(buildMunchkinThievesPickpocketScene(false));
        await expect(page.locator('[data-card-uid="solo-pickpocket-1"]').first()).toBeVisible({ timeout: 15000 });
        await game.playCard('munchkin_thieves_pickpocket', { targetBaseIndex: 0 });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;
            return {
                base0Uids: core.bases[0].minions.map(minion => minion.uid),
                player0HandUids: player0?.hand?.map(card => card.uid) ?? [],
                treasureDeck: core.treasureDeck ?? [],
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            base0Uids: ['solo-pickpocket-1'],
            player0HandUids: [],
            treasureDeck: ['munchkin_treasure_wishing_ring', 'munchkin_treasure_spiky_boots'],
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 2');
        await game.screenshot('145-扒手无另一个扒手时不抽宝藏', testInfo);
    });

    test('猫咪窃贼可展示任意数量手牌宝藏并按数量加力量指示物', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinThievesCatBurglarScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="cat-burglar-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="cat-treasure-ring"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="cat-treasure-hireling"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="cat-normal-minion"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-base-monster-row-0')).toBeVisible({ timeout: 15000 });
        await game.screenshot('146-猫咪窃贼打出前手牌宝藏与普通牌', testInfo);

        await game.playCard('munchkin_thieves_cat_burglar', { targetBaseIndex: 0 });
        await game.waitForInteraction('munchkin_thieves_cat_burglar_choose_treasures', 10000);
        await waitForSmashUpFxToSettle(page);
        const catOptions = await game.getInteractionOptions();
        const ringOption = catOptions.find((option: InteractionOption) => option.value?.cardUid === 'cat-treasure-ring');
        const hirelingOption = catOptions.find((option: InteractionOption) => option.value?.cardUid === 'cat-treasure-hireling');
        expect(ringOption?.id, '猫咪窃贼应列出许愿戒指').toBeTruthy();
        expect(hirelingOption?.id, '猫咪窃贼应列出矮人雇佣兵').toBeTruthy();
        expect(catOptions.some((option: InteractionOption) => option.value?.cardUid === 'cat-normal-minion')).toBe(false);
        await expectManualChoiceVisible(page, handCardSelector('cat-treasure-ring'), '猫咪窃贼选择手牌许愿戒指');
        await expectManualChoiceVisible(page, handCardSelector('cat-treasure-hireling'), '猫咪窃贼选择手牌矮人雇佣兵');
        await expect(page.locator('[data-card-uid="cat-normal-minion"]')).toHaveCount(0);
        await game.screenshot('147-猫咪窃贼选择任意数量手牌宝藏', testInfo);

        await page.locator(handCardSelector('cat-treasure-ring')).first().click({ force: true });
        await page.locator(handCardSelector('cat-treasure-hireling')).first().click({ force: true });
        await game.screenshot('148-猫咪窃贼已选两张宝藏待确认', testInfo);
        await game.confirm();
        await game.waitForNoInteraction(10000);
        await expect(page.getByTestId('reveal-overlay')).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('reveal-card')).toHaveCount(2);
        await game.screenshot('149-猫咪窃贼展示两张宝藏', testInfo);
        await page.getByTestId('reveal-dismiss-btn').click({ force: true });
        await expect(page.getByTestId('reveal-overlay')).toHaveCount(0, { timeout: 5000 });
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const cat = core.bases[0].minions.find(minion => minion.uid === 'cat-burglar-1');
            const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;
            const events = (state.sys?.eventStream?.entries ?? []).map((entry: EventStreamEntry) => entry.event);
            return {
                base0Uids: core.bases[0].minions.map(minion => minion.uid),
                catPowerCounters: cat?.powerCounters ?? 0,
                player0HandUids: player0?.hand?.map(card => card.uid) ?? [],
                player0HandDefIds: player0?.hand?.map(card => card.defId) ?? [],
                treasureDeck: core.treasureDeck ?? [],
                revealByCat: events.some((event: TriggerQueueEvidenceEvent | undefined) =>
                    event?.type === 'su:reveal_hand'
                    && event.payload?.reason === 'munchkin_thieves_cat_burglar'
                ),
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            base0Uids: ['cat-burglar-1'],
            catPowerCounters: 2,
            player0HandUids: ['cat-treasure-ring', 'cat-treasure-hireling', 'cat-normal-minion'],
            player0HandDefIds: ['munchkin_treasure_wishing_ring', 'munchkin_treasure_dwarf_hireling', 'alien_invader'],
            treasureDeck: ['munchkin_treasure_wishing_ring', 'munchkin_treasure_spiky_boots'],
            revealByCat: true,
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await expect(page.getByTestId('su-minion-power-badge-cat-burglar-1')).toContainText('+2');
        await expect(page.getByTestId('su-minion-power-badge-cat-burglar-1')).toHaveAttribute('title', /力量指示物: \+2[\s\S]*= 5/);
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 2');
        await game.screenshot('150-猫咪窃贼展示宝藏后获得两个力量指示物', testInfo);

        await game.setupScene(buildMunchkinThievesCatBurglarScene(1950));
        await game.playCard('munchkin_thieves_cat_burglar', { targetBaseIndex: 0 });
        await game.waitForInteraction('munchkin_thieves_cat_burglar_choose_treasures', 10000);
        await game.screenshot('151-猫咪窃贼有宝藏时也允许空选', testInfo);
        await game.confirm();
        await game.waitForNoInteraction(10000);
        await expect(page.getByTestId('reveal-overlay')).toHaveCount(0, { timeout: 5000 });
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const cat = core.bases[0].minions.find(minion => minion.uid === 'cat-burglar-1');
            const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;
            return {
                base0Uids: core.bases[0].minions.map(minion => minion.uid),
                catPowerCounters: cat?.powerCounters ?? 0,
                player0HandUids: player0?.hand?.map(card => card.uid) ?? [],
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            base0Uids: ['cat-burglar-1'],
            catPowerCounters: 0,
            player0HandUids: ['cat-treasure-ring', 'cat-treasure-hireling', 'cat-normal-minion'],
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await expect(page.getByTestId('su-minion-power-badge-cat-burglar-1')).toHaveCount(0);
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 2');
        await game.screenshot('152-猫咪窃贼空选后不展示也不加指示物', testInfo);
    });

    test('销赃犯可从真实天赋入口弃两张手牌宝藏获得 1VP', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinThievesFenceScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="fence-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="fence-treasure-ring"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="fence-treasure-hireling"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="fence-normal-card"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-base-monster-row-0')).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('153-销赃犯天赋前手牌宝藏与怪物槽', testInfo);

        await page.locator('[data-minion-uid="fence-1"]').first().click({ force: true });
        await game.waitForInteraction('munchkin_thieves_fence_choose_treasures', 10000);
        await waitForSmashUpFxToSettle(page);
        const fenceOptions = await game.getInteractionOptions();
        const ringOption = fenceOptions.find((option: InteractionOption) => option.value?.cardUid === 'fence-treasure-ring');
        const hirelingOption = fenceOptions.find((option: InteractionOption) => option.value?.cardUid === 'fence-treasure-hireling');
        expect(ringOption?.id, '销赃犯应列出手牌许愿指环').toBeTruthy();
        expect(hirelingOption?.id, '销赃犯应列出手牌矮人雇佣兵').toBeTruthy();
        expect(fenceOptions.some((option: InteractionOption) => option.value?.cardUid === 'fence-normal-card')).toBe(false);
        await expectManualChoiceVisible(page, handCardSelector('fence-treasure-ring'), '销赃犯选择手牌许愿指环');
        await expectManualChoiceVisible(page, handCardSelector('fence-treasure-hireling'), '销赃犯选择手牌矮人雇佣兵');
        await expect(page.locator('[data-card-uid="fence-normal-card"]')).toHaveCount(0);
        await game.screenshot('154-销赃犯选择两张手牌宝藏', testInfo);

        await page.locator(handCardSelector('fence-treasure-ring')).first().click({ force: true });
        await page.locator(handCardSelector('fence-treasure-hireling')).first().click({ force: true });
        await game.confirm();
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;
            const fence = core.bases[0].minions.find(minion => minion.uid === 'fence-1');
            return {
                player0Vp: player0?.vp ?? 0,
                player0HandUids: player0?.hand?.map(card => card.uid) ?? [],
                player0DiscardUids: player0?.discard?.map(card => card.uid) ?? [],
                fenceTalentUsed: fence?.talentUsed === true,
                treasureDeckSize: core.treasureDeck?.length ?? 0,
                treasureDiscardSize: core.treasureDiscard?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            player0Vp: 4,
            player0HandUids: ['fence-normal-card'],
            player0DiscardUids: ['fence-treasure-ring', 'fence-treasure-hireling'],
            fenceTalentUsed: true,
            treasureDeckSize: 22,
            treasureDiscardSize: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await expect(page.locator('[data-card-uid="fence-normal-card"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-testid="su-munchkin-treasure-discard"]')).toHaveCount(0);
        await game.screenshot('155-销赃犯弃宝藏后VP增加', testInfo);
    });

    test('背刺可从真实手牌入口弃一张宝藏并摧毁低力量随从', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinThievesBackstabScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="backstab-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="backstab-treasure-ring"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="backstab-low-target"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="backstab-high-target"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('156-背刺打出前手牌宝藏与高低力量目标', testInfo);

        await game.playCard('munchkin_thieves_backstab');
        await game.waitForInteraction('munchkin_thieves_backstab_choose_treasure', 10000);
        await waitForSmashUpFxToSettle(page);
        const treasureOptions = await game.getInteractionOptions();
        const treasureOption = treasureOptions.find((option: InteractionOption) => option.value?.cardUid === 'backstab-treasure-ring');
        expect(treasureOption?.id, '背刺应列出手牌宝藏作为成本').toBeTruthy();
        expect(treasureOptions.some((option: InteractionOption) => option.value?.cardUid === 'backstab-normal-card')).toBe(false);
        await expectManualChoiceVisible(page, handCardSelector('backstab-treasure-ring'), '背刺单候选手牌宝藏成本');
        await game.screenshot('157-背刺选择一张手牌宝藏作为成本', testInfo);
        await page.locator(handCardSelector('backstab-treasure-ring')).first().click({ force: true });

        await game.waitForInteraction('munchkin_thieves_backstab_choose_minion', 10000);
        await waitForSmashUpFxToSettle(page);
        const targetOptions = await game.getInteractionOptions();
        expect(targetOptions.some((option: InteractionOption) => option.value?.minionUid === 'backstab-low-target')).toBe(true);
        expect(targetOptions.some((option: InteractionOption) => option.value?.minionUid === 'backstab-high-target')).toBe(false);
        await expectManualMinionChoiceVisible(page, 'backstab-low-target', '背刺单候选低力量随从目标');
        await game.screenshot('158-背刺只允许选择力量3或更少的随从', testInfo);
        await clickManualMinionChoice(page, 'backstab-low-target', '背刺选择低力量随从');
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;
            const player1 = core.players?.['1'] as SmashUpPlayerCoreSlice | undefined;
            return {
                base0Uids: core.bases[0].minions.map(minion => minion.uid),
                player0HandUids: player0?.hand?.map(card => card.uid) ?? [],
                player0DiscardUids: player0?.discard?.map(card => card.uid) ?? [],
                player1DiscardDefIds: player1?.discard?.map(card => card.defId) ?? [],
                player0ActionsPlayed: player0?.actionsPlayed ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            base0Uids: ['backstab-high-target'],
            player0HandUids: ['backstab-normal-card'],
            player0DiscardUids: ['backstab-1', 'backstab-treasure-ring'],
            player1DiscardDefIds: ['alien_invader'],
            player0ActionsPlayed: 1,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await expect(page.locator('[data-minion-uid="backstab-high-target"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="backstab-low-target"]')).toHaveCount(0);
        await game.screenshot('159-背刺摧毁低力量随从后收口', testInfo);
    });

    test('药水腰带可从真实手牌入口弃宝藏并给任意随从本回合加力量', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinThievesPotionBandolierScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="bandolier-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="bandolier-treasure-ring"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="bandolier-target"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="bandolier-bystander"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('160-药水腰带打出前手牌宝藏与目标随从', testInfo);

        await page.locator('[data-card-uid="bandolier-1"]').first().click({ force: true });
        await waitForSmashUpFxToSettle(page);
        await expectManualMinionChoiceVisible(
            page,
            'bandolier-target',
            '药水腰带选择目标随从',
        );
        await clickManualMinionChoice(page, 'bandolier-target', '药水腰带选择目标随从');
        await game.waitForInteraction('munchkin_thieves_potion_bandolier_choose_treasure', 10000);
        await waitForSmashUpFxToSettle(page);
        const treasureOptions = await game.getInteractionOptions();
        const treasureOption = treasureOptions.find((option: InteractionOption) => option.value?.cardUid === 'bandolier-treasure-ring');
        expect(treasureOption?.id, '药水腰带应列出手牌宝藏作为成本').toBeTruthy();
        expect(treasureOptions.some((option: InteractionOption) => option.value?.cardUid === 'bandolier-normal-card')).toBe(false);
        await expectManualChoiceVisible(page, handCardSelector('bandolier-treasure-ring'), '药水腰带单候选手牌宝藏成本');
        await game.screenshot('161-药水腰带选择一张手牌宝藏作为成本', testInfo);
        await page.locator(handCardSelector('bandolier-treasure-ring')).first().click({ force: true });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;
            const target = core.bases[0].minions.find(minion => minion.uid === 'bandolier-target');
            const bystander = core.bases[0].minions.find(minion => minion.uid === 'bandolier-bystander');
            return {
                targetTempPower: target?.tempPowerModifier ?? 0,
                bystanderTempPower: bystander?.tempPowerModifier ?? 0,
                player0HandUids: player0?.hand?.map(card => card.uid) ?? [],
                player0DiscardUids: player0?.discard?.map(card => card.uid) ?? [],
                player0ActionsPlayed: player0?.actionsPlayed ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            targetTempPower: 3,
            bystanderTempPower: 0,
            player0HandUids: ['bandolier-normal-card'],
            player0DiscardUids: ['bandolier-1', 'bandolier-treasure-ring'],
            player0ActionsPlayed: 1,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await expect(page.getByTestId('su-minion-power-badge-bandolier-target')).toContainText('+3');
        await expect(page.locator('[data-testid="su-munchkin-treasure-discard"]')).toHaveCount(0);
        await game.screenshot('162-药水腰带结算后目标获得临时力量', testInfo);
    });

    test('走私可从真实手牌入口弃两张宝藏得VP并把弃牌洗回牌库', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinThievesSmugglingScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="smuggling-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="smuggling-treasure-ring"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="smuggling-treasure-hireling"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-base-monster-row-0')).toBeVisible({ timeout: 15000 });
        await game.screenshot('163-走私打出前手牌宝藏与个人弃牌', testInfo);

        await game.playCard('munchkin_thieves_smuggling');
        await game.waitForInteraction('munchkin_thieves_smuggling_choose_treasures', 10000);
        await waitForSmashUpFxToSettle(page);
        const smugglingOptions = await game.getInteractionOptions();
        const ringOption = smugglingOptions.find((option: InteractionOption) => option.value?.cardUid === 'smuggling-treasure-ring');
        const hirelingOption = smugglingOptions.find((option: InteractionOption) => option.value?.cardUid === 'smuggling-treasure-hireling');
        expect(ringOption?.id, '走私应列出手牌许愿指环').toBeTruthy();
        expect(hirelingOption?.id, '走私应列出手牌矮人雇佣兵').toBeTruthy();
        await expectManualChoiceVisible(page, handCardSelector('smuggling-treasure-ring'), '走私选择手牌许愿指环');
        await expectManualChoiceVisible(page, handCardSelector('smuggling-treasure-hireling'), '走私选择手牌矮人雇佣兵');
        await game.screenshot('164-走私选择两张手牌宝藏作为成本', testInfo);

        await page.locator(handCardSelector('smuggling-treasure-ring')).first().click({ force: true });
        await page.locator(handCardSelector('smuggling-treasure-hireling')).first().click({ force: true });
        await game.confirm();
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;
            return {
                player0Vp: player0?.vp ?? 0,
                player0HandUids: player0?.hand?.map(card => card.uid) ?? [],
                player0DiscardUids: player0?.discard?.map(card => card.uid) ?? [],
                player0DeckSize: player0?.deck?.length ?? 0,
                player0DeckBottomUid: player0?.deck?.at(-1)?.uid ?? null,
                player0DeckUidSet: [...new Set(player0?.deck?.map(card => card.uid) ?? [])].sort(),
                treasureDeckSize: core.treasureDeck?.length ?? 0,
                treasureDiscardSize: core.treasureDiscard?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            player0Vp: 5,
            player0HandUids: [],
            player0DiscardUids: [],
            player0DeckSize: 7,
            player0DeckBottomUid: 'smuggling-1',
            player0DeckUidSet: [
                'smuggling-1',
                'smuggling-deck-a',
                'smuggling-deck-b',
                'smuggling-discard-a',
                'smuggling-discard-b',
                'smuggling-treasure-hireling',
                'smuggling-treasure-ring',
            ],
            treasureDeckSize: 22,
            treasureDiscardSize: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await expect(page.locator('[data-card-uid="smuggling-1"]')).toHaveCount(0);
        await expect(page.locator('[data-testid="su-munchkin-treasure-discard"]')).toHaveCount(0);
        await game.screenshot('165-走私结算后VP增加且个人弃牌洗回牌库', testInfo);
    });

    test('打劫可从真实手牌入口转移仆从身上的行动到己方另一个仆从', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinThievesMuggingScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="mugging-1"]').first()).toBeVisible({ timeout: 15000 });
        const host = page.locator('[data-minion-uid="mugging-enemy-host"]').first();
        const target = page.locator('[data-minion-uid="mugging-own-target"]').first();
        await expect(host).toBeVisible({ timeout: 15000 });
        await expect(target).toBeVisible({ timeout: 15000 });
        await host.hover();
        await expect(page.locator('[data-attached-action-uid="mugging-spiky-boots"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('166-打劫打出前附着行动与己方目标', testInfo);

        await game.playCard('munchkin_thieves_mugging');
        await game.waitForInteraction('munchkin_thieves_mugging_choose_action', 10000);
        await waitForSmashUpFxToSettle(page);
        const actionOptions = await game.getInteractionOptions() as InteractionOption[];
        expect(actionOptions.some((option) => option.value?.cardUid === 'mugging-spiky-boots')).toBe(true);
        await host.hover();
        await expectManualChoiceVisible(page, '[data-attached-action-uid="mugging-spiky-boots"]', '打劫第一步单候选附着行动');
        await game.screenshot('167-打劫选择仆从身上的行动', testInfo);
        await page.locator('[data-attached-action-uid="mugging-spiky-boots"]').first().click({ force: true });

        await game.waitForInteraction('munchkin_thieves_mugging_choose_minion', 10000);
        await waitForSmashUpFxToSettle(page);
        const minionOptions = await game.getInteractionOptions() as InteractionOption[];
        expect(minionOptions.some((option) => option.value?.minionUid === 'mugging-own-target')).toBe(true);
        expect(minionOptions.some((option) => option.value?.minionUid === 'mugging-enemy-host')).toBe(false);
        await page.mouse.move(24, 24);
        await expectManualMinionChoiceVisible(
            page,
            'mugging-own-target',
            '打劫第二步选择己方另一个随从',
            { forbidPromptContext: true },
        );
        await game.screenshot('168-打劫选择己方另一个仆从', testInfo);
        await clickManualMinionChoice(page, 'mugging-own-target', '打劫选择己方另一个随从');
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const sourceHost = core.bases[0].minions.find(minion => minion.uid === 'mugging-enemy-host');
            const ownTarget = core.bases[0].minions.find(minion => minion.uid === 'mugging-own-target');
            const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;
            return {
                sourceAttachedUids: sourceHost?.attachedActions?.map(action => action.uid) ?? [],
                targetAttachedUids: ownTarget?.attachedActions?.map(action => action.uid) ?? [],
                targetAttachedDefIds: ownTarget?.attachedActions?.map(action => action.defId) ?? [],
                player0DiscardDefIds: player0?.discard?.map(card => card.defId) ?? [],
                player0ActionsPlayed: player0?.actionsPlayed ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            sourceAttachedUids: [],
            targetAttachedUids: ['mugging-spiky-boots'],
            targetAttachedDefIds: ['munchkin_treasure_spiky_boots'],
            player0DiscardDefIds: ['munchkin_thieves_mugging'],
            player0ActionsPlayed: 1,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await target.hover();
        await expect(page.locator('[data-minion-uid="mugging-own-target"]').locator('[data-attached-action-uid="mugging-spiky-boots"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="mugging-enemy-host"]').locator('[data-attached-action-uid="mugging-spiky-boots"]')).toHaveCount(0);
        await game.screenshot('169-打劫结算后行动附着到己方目标', testInfo);
    });

    test('剥光可从真实手牌入口拿走场上的宝藏牌进当前玩家手牌', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinThievesStripBareScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="strip-bare-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="strip-treasure-minion"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="strip-normal-minion"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-ongoing-uid="strip-treasure-action"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('170-剥光打出前场上宝藏牌', testInfo);

        await game.playCard('munchkin_thieves_strip_bare');
        await game.waitForInteraction('munchkin_thieves_strip_bare_choose_treasure', 10000);
        await waitForSmashUpFxToSettle(page);
        const stripOptions = await game.getInteractionOptions() as InteractionOption[];
        expect(stripOptions.some((option) => option.value?.cardUid === 'strip-treasure-action')).toBe(true);
        expect(stripOptions.some((option) => option.value?.cardUid === 'strip-treasure-minion')).toBe(true);
        expect(stripOptions.some((option) => option.value?.cardUid === 'strip-normal-minion')).toBe(false);
        await expectManualChoiceVisible(page, '[data-ongoing-uid="strip-treasure-action"]', '剥光选择场上宝藏行动');
        await expectManualMinionChoiceVisible(page, 'strip-treasure-minion', '剥光选择场上宝藏随从');
        await game.screenshot('171-剥光选择场上的宝藏牌', testInfo);
        await page.locator('[data-ongoing-uid="strip-treasure-action"]').first().click({ force: true });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;
            const player1 = core.players?.['1'] as SmashUpPlayerCoreSlice | undefined;
            return {
                baseOngoingUids: core.bases[0].ongoingActions?.map(action => action.uid) ?? [],
                baseMinionUids: core.bases[0].minions.map(minion => minion.uid),
                player0HandUids: player0?.hand?.map(card => card.uid) ?? [],
                player0HandDefIds: player0?.hand?.map(card => card.defId) ?? [],
                player0DiscardDefIds: player0?.discard?.map(card => card.defId) ?? [],
                player1DiscardUids: player1?.discard?.map(card => card.uid) ?? [],
                player0ActionsPlayed: player0?.actionsPlayed ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            baseOngoingUids: [],
            baseMinionUids: ['strip-treasure-minion', 'strip-normal-minion'],
            player0HandUids: ['strip-pressure-minion', 'strip-treasure-action'],
            player0HandDefIds: ['alien_scout', 'munchkin_treasure_bag_of_caltrops'],
            player0DiscardDefIds: ['munchkin_thieves_strip_bare'],
            player1DiscardUids: [],
            player0ActionsPlayed: 1,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await expect(page.locator('[data-ongoing-uid="strip-treasure-action"]')).toHaveCount(0);
        await expect(page.locator('[data-card-uid="strip-treasure-action"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('172-剥光结算后宝藏牌进入手牌', testInfo);
    });

    test('剥光可从真实随从本体入口拿走场上的宝藏随从', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinThievesStripBareScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await game.playCard('munchkin_thieves_strip_bare');
        await game.waitForInteraction('munchkin_thieves_strip_bare_choose_treasure', 10000);
        await waitForSmashUpFxToSettle(page);

        const stripOptions = await game.getInteractionOptions() as InteractionOption[];
        expect(stripOptions.some((option) => option.value?.cardUid === 'strip-treasure-minion')).toBe(true);
        await expectManualMinionChoiceVisible(page, 'strip-treasure-minion', '剥光从真实随从本体选择宝藏随从');
        await game.screenshot('172b-剥光从真实随从本体选择宝藏随从', testInfo);
        await clickManualMinionChoice(page, 'strip-treasure-minion', '剥光选择宝藏随从');
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;
            return {
                baseMinionUids: core.bases[0].minions.map(minion => minion.uid),
                player0HandUids: player0?.hand?.map(card => card.uid) ?? [],
                player0HandDefIds: player0?.hand?.map(card => card.defId) ?? [],
                player0DiscardDefIds: player0?.discard?.map(card => card.defId) ?? [],
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            baseMinionUids: ['strip-normal-minion'],
            player0HandUids: ['strip-pressure-minion', 'strip-treasure-minion'],
            player0HandDefIds: ['alien_scout', 'munchkin_treasure_dwarf_hireling'],
            player0DiscardDefIds: ['munchkin_thieves_strip_bare'],
            interactionSourceId: null,
        });
        await expect(page.locator('[data-card-uid="strip-treasure-minion"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('172c-剥光结算后宝藏随从进入手牌', testInfo);
    });

    test('盗贼公会在宝藏行动打到本基地后从真实入口抽一张普通牌', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinThievesGuildScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="guild-caltrops-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="guild-own-minion"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('173-盗贼公会打出宝藏行动前', testInfo);

        await game.playCard('munchkin_treasure_bag_of_caltrops', { targetBaseIndex: 0 });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;
            const events = (state.sys?.eventStream?.entries ?? []).map((entry: EventStreamEntry) => entry.event);
            return {
                baseOngoingUids: core.bases[0].ongoingActions?.map(action => action.uid) ?? [],
                player0HandUids: player0?.hand?.map(card => card.uid) ?? [],
                player0HandDefIds: player0?.hand?.map(card => card.defId) ?? [],
                player0DeckUids: player0?.deck?.map(card => card.uid) ?? [],
                player0ActionsPlayed: player0?.actionsPlayed ?? 0,
                drewByGuild: events.some(event =>
                    event?.type === 'su:cards_drawn'
                    && event.payload?.playerId === '0'
                    && event.payload?.cardUids?.includes('guild-draw-1')
                ),
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            baseOngoingUids: ['guild-caltrops-1'],
            player0HandUids: ['guild-pressure-minion', 'guild-draw-1'],
            player0HandDefIds: ['alien_scout', 'alien_invader'],
            player0DeckUids: [],
            player0ActionsPlayed: 1,
            drewByGuild: true,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await expect(page.locator('[data-ongoing-uid="guild-caltrops-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="guild-draw-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await page.mouse.move(24, 24);
        await game.screenshot('174-盗贼公会触发后普通牌进手牌', testInfo);
    });

    test('金库计分链同时处理秘密藏匿处、转移注意力和计分后抽宝藏', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinThievesScoringScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="clever-distraction-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="coffers-thief-minion"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="coffers-winner-minion"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-ongoing-uid="secret-stash-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-base-monster-row-0')).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 4');
        await game.screenshot('175-金库计分前转移注意力与秘密藏匿处', testInfo);

        await game.advancePhase();
        await game.waitForPhase('scoreBases', 10000);
        await page.waitForFunction(
            () => {
                const state = (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.();
                return state?.core?.pendingMunchkinTreasureReward?.treasureCards?.length === 2
                    && (
                        state?.sys?.interaction?.current?.data?.sourceId === 'smashup_reaction_choose'
                        || Boolean(state?.sys?.responseWindow?.current?.windowType)
                    );
            },
            { timeout: 15000, polling: 200 },
        );
        await game.screenshot('176-秘密藏匿处让计分奖励展示两张宝藏', testInfo);

        for (let attempt = 0; attempt < 8; attempt += 1) {
            const status = await getReactionWindowStatus(page);
            const options = status.sourceId === 'smashup_reaction_choose'
                ? await game.getInteractionOptions() as InteractionOption[]
                : [];
            const hasCleverOption = status.windowType === 'afterScoring'
                && options.some((option) =>
                    option.value?.kind === 'play_action'
                    && option.value?.cardUid === 'clever-distraction-1'
                );
            if (hasCleverOption) break;

            const didPass = await passOpenReactionOrResponseWindow(page, game, `转移注意力前置响应让过 ${attempt + 1}`);
            expect(didPass, '等待 afterScoring 转移注意力入口期间必须存在可让过的响应').toBe(true);
            await page.waitForTimeout(300);
        }

        await expect.poll(async () => {
            const status = await getReactionWindowStatus(page);
            const options = status.sourceId === 'smashup_reaction_choose'
                ? await game.getInteractionOptions() as InteractionOption[]
                : [];
            return {
                windowType: status.windowType,
                hasCleverOption: options.some((option) =>
                    option.value?.kind === 'play_action'
                    && option.value?.cardUid === 'clever-distraction-1'
                ),
            };
        }, { timeout: 10000 }).toEqual({
            windowType: 'afterScoring',
            hasCleverOption: true,
        });
        await game.screenshot('177-转移注意力afterScoring响应入口', testInfo);

        await clickVisibleInteractionOptionBy(
            page,
            game,
            (option: InteractionOption) =>
                option.value?.kind === 'play_action'
                && option.value?.cardUid === 'clever-distraction-1',
            'afterScoring 选择转移注意力',
        );
        await waitForSmashUpFxToSettle(page);

        for (let attempt = 0; attempt < 12; attempt += 1) {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;
            const player1 = core.players?.['1'] as SmashUpPlayerCoreSlice | undefined;
            const done = state.sys?.phase === 'playCards'
                && !state.sys?.interaction?.current
                && !state.sys?.responseWindow?.current
                && (core.triggerQueue?.length ?? 0) === 0
                && !core.pendingMunchkinTreasureReward
                && (player0?.hand?.filter(card => card.defId.startsWith('munchkin_treasure_')).length ?? 0) === 2
                && (player1?.hand?.filter(card => card.defId.startsWith('munchkin_treasure_')).length ?? 0) === 2;
            if (done) break;

            const status = await getReactionWindowStatus(page);
            if (status.sourceId === 'smashup_reaction_choose') {
                const options = await game.getInteractionOptions() as InteractionOption[];
                const triggers = (state.core?.triggerQueue ?? []) as TriggerQueueEntry[];
                const hasCoffersTrigger = options.some((option) => {
                    const triggerId = option.value?.triggerId;
                    const trigger = triggers.find((entry) => entry?.id === triggerId);
                    return trigger?.sourceDefId === 'base_the_coffers'
                        || trigger?.source?.defId === 'base_the_coffers'
                        || option.value?.defId === 'base_the_coffers';
                });
                if (hasCoffersTrigger) {
                    await clickVisibleInteractionOptionBy(
                        page,
                        game,
                        (option: InteractionOption) => {
                            const triggerId = option.value?.triggerId;
                            const trigger = triggers.find((entry) => entry?.id === triggerId);
                            return trigger?.sourceDefId === 'base_the_coffers'
                                || trigger?.source?.defId === 'base_the_coffers'
                                || option.value?.defId === 'base_the_coffers';
                        },
                        '金库 afterScoring 抽宝藏',
                    );
                } else if (options.some((option) => option.value?.kind === 'pass')) {
                    await clickVisibleInteractionOptionBy(
                        page,
                        game,
                        (option: InteractionOption) => option.value?.kind === 'pass',
                        `金库计分链让过 ${attempt + 1}`,
                    );
                } else {
                    await page.waitForTimeout(500);
                }
            } else if (status.windowType) {
                await game.passResponseWindow();
            } else {
                await page.waitForTimeout(500);
            }
        }

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;
            const player1 = core.players?.['1'] as SmashUpPlayerCoreSlice | undefined;
            const events = (state.sys?.eventStream?.entries ?? []).map((entry: EventStreamEntry) => entry.event);
            return {
                phase: state.sys?.phase,
                base0DefId: core.bases[0]?.defId,
                player0Vp: player0?.vp ?? 0,
                player1Vp: player1?.vp ?? 0,
                player0TreasureHandCount: player0?.hand?.filter(card => card.defId.startsWith('munchkin_treasure_')).length ?? 0,
                player1TreasureHandCount: player1?.hand?.filter(card => card.defId.startsWith('munchkin_treasure_')).length ?? 0,
                player0DiscardHasClever: player0?.discard?.some(card => card.defId === 'munchkin_thieves_clever_distraction') ?? false,
                player0DiscardHasSecretStash: player0?.discard?.some(card => card.defId === 'munchkin_thieves_secret_stash') ?? false,
                rewardRevealCount: events.find(event =>
                    event?.type === 'su:munchkin_treasure_reward_revealed'
                    && event.payload?.reason === 'munchkin_scoring_treasure_reward'
                )?.payload?.count ?? 0,
                cofferDrawEvents: events.filter(event =>
                    event?.type === 'su:munchkin_treasures_drawn'
                    && event.payload?.reason === 'base_the_coffers'
                ).length,
                cleverVpEvents: events.filter(event =>
                    event?.type === 'su:vp_awarded'
                    && event.payload?.reason === 'munchkin_thieves_clever_distraction'
                ).length,
                treasureDeckSize: core.treasureDeck?.length ?? 0,
                pendingTreasureReward: core.pendingMunchkinTreasureReward ?? null,
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 15000 }).toEqual({
            phase: 'playCards',
            base0DefId: 'base_the_homeworld',
            player0Vp: 5,
            player1Vp: 8,
            player0TreasureHandCount: 2,
            player1TreasureHandCount: 2,
            player0DiscardHasClever: true,
            player0DiscardHasSecretStash: true,
            rewardRevealCount: 2,
            cofferDrawEvents: 2,
            cleverVpEvents: 2,
            treasureDeckSize: 0,
            pendingTreasureReward: null,
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 0');
        await page.waitForTimeout(1000);
        await game.screenshot('178-金库计分后宝藏奖励与转移注意力收口', testInfo);
    });

    test('矮人雇佣兵可按宝藏随从从手牌打到基地', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinDwarfHirelingScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="dwarf-hireling-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-base-monster-row-0')).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await expect(page.locator('[data-testid="su-munchkin-treasure-discard"]')).toHaveCount(0);
        await game.screenshot('55-矮人雇佣兵手牌与目标基地', testInfo);

        await game.playCard('munchkin_treasure_dwarf_hireling', { targetBaseIndex: 0 });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;
            return {
                base0Uids: core.bases[0].minions.map(minion => minion.uid),
                base0DefIds: core.bases[0].minions.map(minion => minion.defId),
                player0HandUids: player0?.hand?.map(card => card.uid) ?? [],
                player0DiscardDefIds: player0?.discard?.map(card => card.defId) ?? [],
                player0MinionsPlayed: player0?.minionsPlayed ?? 0,
                player0MinionLimit: player0?.minionLimit ?? 0,
                hasLongTermTreasureZone: player0 ? Object.prototype.hasOwnProperty.call(player0, 'treasures') : false,
                treasureDeckSize: core.treasureDeck?.length ?? 0,
                treasureDiscardSize: core.treasureDiscard?.length ?? 0,
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            base0Uids: ['dwarf-hireling-1'],
            base0DefIds: ['munchkin_treasure_dwarf_hireling'],
            player0HandUids: ['munchkin_treasure_765'],
            player0DiscardDefIds: [],
            player0MinionsPlayed: 1,
            player0MinionLimit: 1,
            hasLongTermTreasureZone: false,
            treasureDeckSize: 21,
            treasureDiscardSize: 0,
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await expect(page.locator('[data-minion-uid="dwarf-hireling-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 21');
        await game.screenshot('56-矮人雇佣兵打出后进入基地', testInfo);
    });

    test('宝藏池可在本回合第一次打出仆从后抽一张宝藏', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinTreasureBathDrawScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="treasure-bath-invader-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-base-monster-row-0')).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 2');
        await game.screenshot('60-宝藏池手牌与首个仆从目标基地', testInfo);

        await game.playCard('alien_invader', { targetBaseIndex: 0 });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;
            return {
                base0Uids: core.bases[0].minions.map(minion => minion.uid),
                base0DefIds: core.bases[0].minions.map(minion => minion.defId),
                player0HandUids: player0?.hand?.map(card => card.uid) ?? [],
                player0HandDefIds: player0?.hand?.map(card => card.defId) ?? [],
                player0DiscardDefIds: player0?.discard?.map(card => card.defId) ?? [],
                player0MinionsPlayed: player0?.minionsPlayed ?? 0,
                player0MinionsPlayedPerBase: player0?.minionsPlayedPerBase ?? {},
                treasureDeck: core.treasureDeck ?? [],
                treasureDiscardSize: core.treasureDiscard?.length ?? 0,
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            base0Uids: ['treasure-bath-invader-1'],
            base0DefIds: ['alien_invader'],
            player0HandUids: ['munchkin_treasure_1210'],
            player0HandDefIds: ['munchkin_treasure_wishing_ring'],
            player0DiscardDefIds: [],
            player0MinionsPlayed: 1,
            player0MinionsPlayedPerBase: { 0: 1 },
            treasureDeck: ['munchkin_treasure_spiky_boots'],
            treasureDiscardSize: 0,
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await expect(page.locator('[data-minion-uid="treasure-bath-invader-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="munchkin_treasure_1210"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 1');
        await game.screenshot('61-宝藏池首个仆从后抽到宝藏', testInfo);
    });

    test('黄金挖掘者可用天赋从公共宝藏弃牌堆回收宝藏', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinGoldDiggerTreasureRecoveryScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        const goldDigger = page.locator('[data-minion-uid="dwarf-gold-digger"]').first();
        await expect(goldDigger).toBeVisible({ timeout: 15000 });
        await expect(goldDigger).toHaveAttribute('data-activation-armed', 'false');
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('64-黄金挖掘者天赋前公共宝藏弃牌', testInfo);

        await goldDigger.click({ force: true });
        await game.waitForInteraction('munchkin_dwarves_gold_digger_choose_treasure', 10000);
        await game.screenshot('65-黄金挖掘者选择宝藏弃牌', testInfo);

        await game.selectInteractionOptionBy(
            (option: InteractionOption) => option.value?.treasureDefId === 'munchkin_treasure_spiky_boots',
            '黄金挖掘者目标宝藏弃牌',
        );
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const goldDiggerState = core.bases[0].minions.find(minion => minion.uid === 'dwarf-gold-digger');
            const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;
            return {
                goldDiggerTalentUsed: goldDiggerState?.talentUsed === true,
                player0HandUids: player0?.hand?.map(card => card.uid) ?? [],
                player0HandDefIds: player0?.hand?.map(card => card.defId) ?? [],
                player0DiscardDefIds: player0?.discard?.map(card => card.defId) ?? [],
                treasureDiscard: core.treasureDiscard ?? [],
                nextUid: core.nextUid ?? 0,
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            goldDiggerTalentUsed: true,
            player0HandUids: ['munchkin_treasure_1230'],
            player0HandDefIds: ['munchkin_treasure_spiky_boots'],
            player0DiscardDefIds: [],
            treasureDiscard: ['munchkin_treasure_wishing_ring'],
            nextUid: 1231,
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });

        await expect(page.locator('[data-card-uid="munchkin_treasure_1230"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-minion-used-badge-dwarf-gold-digger')).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('66-黄金挖掘者回收宝藏后进入手牌', testInfo);
    });

    test('隐藏资产可从手牌打出并把宝藏牌库顶三张放入公共弃牌', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinHiddenAssetsScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="hidden-assets-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="hidden-assets-bystander"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 4');
        await game.screenshot('67-隐藏资产手牌与公共宝藏牌库', testInfo);

        await game.playCard('munchkin_dwarves_hidden_assets');
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;
            return {
                player0HandUids: player0?.hand?.map(card => card.uid) ?? [],
                player0HandDefIds: player0?.hand?.map(card => card.defId) ?? [],
                player0DeckTopDefId: player0?.deck?.[0]?.defId ?? null,
                player0DiscardDefIds: player0?.discard?.map(card => card.defId) ?? [],
                player0ActionsPlayed: player0?.actionsPlayed ?? 0,
                player0ActionLimit: player0?.actionLimit ?? 0,
                treasureDeck: core.treasureDeck ?? [],
                treasureDiscard: core.treasureDiscard ?? [],
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            player0HandUids: ['hidden-assets-drawn-1'],
            player0HandDefIds: ['alien_invader'],
            player0DeckTopDefId: 'munchkin_dwarves_gem_grabber',
            player0DiscardDefIds: ['munchkin_dwarves_hidden_assets'],
            player0ActionsPlayed: 1,
            player0ActionLimit: 2,
            treasureDeck: ['munchkin_treasure_bag_of_caltrops'],
            treasureDiscard: [
                'munchkin_treasure_wishing_ring',
                'munchkin_treasure_dwarf_hireling',
                'munchkin_treasure_halfling_hireling',
                'munchkin_treasure_tiger_steed',
            ],
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });

        await expect(page.locator('[data-card-uid="hidden-assets-drawn-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="hidden-assets-1"]')).toHaveCount(0);
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 1');
        await game.screenshot('68-隐藏资产结算后抽牌并磨宝藏', testInfo);
    });

    test('为了钱什么都可以可真实多选手牌弃掉并按数量抽宝藏', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinAnythingForMoneyScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="money-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="money-discard-a"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="money-discard-b"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 3');
        await game.screenshot('69-为了钱什么都可以手牌与宝藏牌库', testInfo);

        await game.playCard('munchkin_dwarves_anything_for_money');
        await game.waitForInteraction('munchkin_dwarves_anything_for_money_discard', 10000);

        const discardOptions = await game.getInteractionOptions();
        const discardA = discardOptions.find((option: InteractionOption) => option.value?.cardUid === 'money-discard-a');
        const discardB = discardOptions.find((option: InteractionOption) => option.value?.cardUid === 'money-discard-b');
        expect(discardA?.id, '为了钱什么都可以应列出套现作为可弃手牌').toBeTruthy();
        expect(discardB?.id, '为了钱什么都可以应列出宝石抓取者作为可弃手牌').toBeTruthy();
        await expectManualChoiceVisible(
            page,
            `[data-option-id="${discardA!.id}"]`,
            '为了钱什么都可以选择第一张手牌',
            { allowPromptCardGrid: true },
        );
        await expectManualChoiceVisible(
            page,
            `[data-option-id="${discardB!.id}"]`,
            '为了钱什么都可以选择第二张手牌',
            { allowPromptCardGrid: true },
        );
        await game.screenshot('70-为了钱什么都可以选择弃牌', testInfo);

        await clickVisibleInteractionOptionBy(
            page,
            game,
            (option: InteractionOption) => option.value?.cardUid === 'money-discard-a',
            '为了钱什么都可以选择第一张手牌',
        );
        await clickVisibleInteractionOptionBy(
            page,
            game,
            (option: InteractionOption) => option.value?.cardUid === 'money-discard-b',
            '为了钱什么都可以选择第二张手牌',
        );
        await game.confirm();
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;
            return {
                player0HandUids: player0?.hand?.map(card => card.uid) ?? [],
                player0HandDefIds: player0?.hand?.map(card => card.defId) ?? [],
                player0DiscardUids: player0?.discard?.map(card => card.uid) ?? [],
                player0ActionsPlayed: player0?.actionsPlayed ?? 0,
                player0ActionLimit: player0?.actionLimit ?? 0,
                treasureDeck: core.treasureDeck ?? [],
                treasureDiscardSize: core.treasureDiscard?.length ?? 0,
                nextUid: core.nextUid ?? 0,
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            player0HandUids: ['munchkin_treasure_1250', 'munchkin_treasure_1251'],
            player0HandDefIds: [
                'munchkin_treasure_dwarf_hireling',
                'munchkin_treasure_wishing_ring',
            ],
            player0DiscardUids: ['money-1', 'money-discard-a', 'money-discard-b'],
            player0ActionsPlayed: 1,
            player0ActionLimit: 1,
            treasureDeck: ['munchkin_treasure_spiky_boots'],
            treasureDiscardSize: 0,
            nextUid: 1252,
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });

        await expect(page.locator('[data-card-uid="munchkin_treasure_1250"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="munchkin_treasure_1251"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="money-discard-a"]')).toHaveCount(0);
        await expect(page.locator('[data-card-uid="money-discard-b"]')).toHaveCount(0);
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 1');
        await game.screenshot('71-为了钱什么都可以抽到两张宝藏', testInfo);
    });

    test('套现可真实多选手牌宝藏并连续作为额外随从打出', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinCashOutExtraTreasureMinionsScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="cash-out-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="cash-out-treasure-a"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="cash-out-treasure-b"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="cash-out-non-treasure"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="cash-out-existing-minion"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('77-套现手牌宝藏与已用随从额度', testInfo);

        await game.playCard('munchkin_dwarves_cash_out');
        await game.waitForInteraction('munchkin_dwarves_cash_out_choose_treasures', 10000);

        const treasureOptions = await game.getInteractionOptions();
        const treasureA = treasureOptions.find((option: InteractionOption) => option.value?.cardUid === 'cash-out-treasure-a');
        const treasureB = treasureOptions.find((option: InteractionOption) => option.value?.cardUid === 'cash-out-treasure-b');
        const nonTreasure = treasureOptions.find((option: InteractionOption) => option.value?.cardUid === 'cash-out-non-treasure');
        expect(treasureA?.id, '套现应列出矮人雇佣兵作为可选宝藏').toBeTruthy();
        expect(treasureB?.id, '套现应列出虎骑士作为可选宝藏').toBeTruthy();
        expect(nonTreasure, '套现不应列出非宝藏手牌').toBeUndefined();
        await expectManualChoiceVisible(
            page,
            `[data-option-id="${treasureA!.id}"]`,
            '套现选择第一张手牌宝藏',
            { allowPromptCardGrid: true },
        );
        await expectManualChoiceVisible(
            page,
            `[data-option-id="${treasureB!.id}"]`,
            '套现选择第二张手牌宝藏',
            { allowPromptCardGrid: true },
        );
        await expect(
            page.getByTestId('prompt-card-grid').locator('[data-card-def-id="munchkin_dwarves_gem_grabber"]'),
            '套现选择框不应列出非宝藏手牌',
        ).toHaveCount(0);
        await game.screenshot('78-套现多选手牌宝藏', testInfo);

        await clickVisibleInteractionOptionBy(
            page,
            game,
            (option: InteractionOption) => option.value?.cardUid === 'cash-out-treasure-a',
            '套现选择第一张手牌宝藏',
        );
        await clickVisibleInteractionOptionBy(
            page,
            game,
            (option: InteractionOption) => option.value?.cardUid === 'cash-out-treasure-b',
            '套现选择第二张手牌宝藏',
        );
        await game.confirm();
        await game.waitForInteraction('smashup_immediate_extra_minion', 10000);

        const firstExtraOptions = await game.getInteractionOptions();
        expect(firstExtraOptions.some((option: InteractionOption) => option.value?.cardUid === 'cash-out-treasure-a')).toBe(true);
        expect(firstExtraOptions.some((option: InteractionOption) => option.value?.cardUid === 'cash-out-treasure-b')).toBe(false);
        expect(firstExtraOptions.some((option: InteractionOption) => option.value?.cardUid === 'cash-out-non-treasure')).toBe(false);
        await game.screenshot('79-套现进入第一张额外宝藏随从选择', testInfo);

        await game.selectInteractionOptionBy(
            (option: InteractionOption) => option.value?.cardUid === 'cash-out-treasure-a',
            '套现第一张宝藏随从',
        );
        await game.waitForInteraction('smashup_immediate_extra_minion_base', 10000);
        await game.screenshot('80-套现选择额外宝藏随从目标基地', testInfo);
        await game.selectInteractionOptionBy(
            (option: InteractionOption) => option.value?.baseIndex === 0,
            '套现第一张宝藏随从目标基地',
        );

        await game.waitForInteraction('smashup_immediate_extra_minion', 10000);
        const secondExtraOptions = await game.getInteractionOptions();
        expect(secondExtraOptions.some((option: InteractionOption) => option.value?.cardUid === 'cash-out-treasure-b')).toBe(true);
        expect(secondExtraOptions.some((option: InteractionOption) => option.value?.cardUid === 'cash-out-treasure-a')).toBe(false);
        await game.selectInteractionOptionBy(
            (option: InteractionOption) => option.value?.cardUid === 'cash-out-treasure-b',
            '套现第二张宝藏随从',
        );
        await game.waitForInteraction('smashup_immediate_extra_minion_base', 10000);
        await game.selectInteractionOptionBy(
            (option: InteractionOption) => option.value?.baseIndex === 0,
            '套现第二张宝藏随从目标基地',
        );
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;
            return {
                base0MinionUids: core.bases[0].minions.map(minion => minion.uid),
                base0MinionDefIds: core.bases[0].minions.map(minion => minion.defId),
                base1MinionUids: core.bases[1].minions.map(minion => minion.uid),
                player0HandUids: player0?.hand?.map(card => card.uid) ?? [],
                player0DiscardUids: player0?.discard?.map(card => card.uid) ?? [],
                player0ActionsPlayed: player0?.actionsPlayed ?? 0,
                player0ActionLimit: player0?.actionLimit ?? 0,
                player0MinionsPlayed: player0?.minionsPlayed ?? 0,
                player0MinionLimit: player0?.minionLimit ?? 0,
                treasureDeckSize: core.treasureDeck?.length ?? 0,
                treasureDiscardSize: core.treasureDiscard?.length ?? 0,
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            base0MinionUids: [
                'cash-out-existing-minion',
                'cash-out-treasure-a',
                'cash-out-treasure-b',
            ],
            base0MinionDefIds: [
                'munchkin_dwarves_loot_lover',
                'munchkin_treasure_dwarf_hireling',
                'munchkin_treasure_tiger_steed',
            ],
            base1MinionUids: [],
            player0HandUids: ['cash-out-non-treasure'],
            player0DiscardUids: ['cash-out-1'],
            player0ActionsPlayed: 1,
            player0ActionLimit: 1,
            player0MinionsPlayed: 3,
            player0MinionLimit: 3,
            treasureDeckSize: MUNCHKIN_TREASURE_DECK_DEF_IDS.length,
            treasureDiscardSize: 0,
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });

        await expect(page.locator('[data-minion-uid="cash-out-treasure-a"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="cash-out-treasure-b"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="cash-out-non-treasure"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('81-套现两张宝藏随从已打出', testInfo);
    });

    test('狡猾计划可从计分前响应窗口抽宝藏并立即打出', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinCunningPlanBeforeScoringScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="cunning-plan-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="cunning-plan-scorer"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 2');
        await game.screenshot('82-狡猾计划计分前手牌与目标基地', testInfo);

        await game.advancePhase();
        await game.waitForPhase('scoreBases', 10000);
        await expect.poll(async () => getReactionWindowStatus(page), { timeout: 15000 }).toEqual({
            sourceId: 'smashup_reaction_choose',
            windowType: 'meFirst',
        });

        await expect.poll(async () => {
            const options = await game.getInteractionOptions() as InteractionOption[];
            return options.some((option) =>
                option.value?.cardUid === 'cunning-plan-1'
                || option.label === '狡猾计划'
            );
        }, { timeout: 10000 }).toBe(true);
        const responseOptions = await game.getInteractionOptions() as InteractionOption[];
        const cunningPlanOption = responseOptions.find((option) =>
            option.value?.cardUid === 'cunning-plan-1'
            || option.label === '狡猾计划'
        );
        expect(cunningPlanOption?.id, '狡猾计划响应选项应有页面可点击的稳定 option id').toBeTruthy();
        await expectManualChoiceVisible(
            page,
            handCardSelector('cunning-plan-1'),
            '狡猾计划beforeScoring响应入口',
        );
        await game.screenshot('83-狡猾计划beforeScoring响应入口', testInfo);

        await clickVisibleInteractionOptionBy(
            page,
            game,
            (option: InteractionOption) =>
                option.value?.cardUid === 'cunning-plan-1'
                || option.label === '狡猾计划',
            'beforeScoring 选择狡猾计划',
        );
        await game.waitForInteraction('smashup_immediate_extra_action', 10000);

        const immediateOptions = await game.getInteractionOptions() as InteractionOption[];
        const wishingRingOption = immediateOptions.find((option) => option.value?.cardUid === 'munchkin_treasure_1280');
        expect(wishingRingOption?.id, '许愿指环立即打出选项应有页面可点击的稳定 option id').toBeTruthy();
        await expectManualChoiceVisible(
            page,
            handCardSelector('munchkin_treasure_1280'),
            '狡猾计划打出刚抽到的许愿指环',
        );
        await game.screenshot('84-狡猾计划抽到许愿指环并可立即打出', testInfo);

        await clickVisibleInteractionOptionBy(
            page,
            game,
            (option: InteractionOption) => option.value?.cardUid === 'munchkin_treasure_1280',
            '狡猾计划打出刚抽到的许愿指环',
        );
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;
            const player0Discard = player0?.discard ?? [];
            const player0TreasureHandDefIds = (player0?.hand ?? [])
                .filter(card => card.defId.startsWith('munchkin_treasure_'))
                .map(card => card.defId);
            return {
                player0Vp: player0?.vp ?? 0,
                player0TreasureHandDefIds,
                player0DiscardHasCunningPlan: player0Discard.some(card => card.uid === 'cunning-plan-1'),
                player0DiscardHasScoringMinion: player0Discard.some(card => card.uid === 'cunning-plan-scorer'),
                treasureDeck: core.treasureDeck ?? [],
                treasureDiscardSize: core.treasureDiscard?.length ?? 0,
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 15000 }).toEqual({
            player0Vp: 7,
            player0TreasureHandDefIds: [],
            player0DiscardHasCunningPlan: true,
            player0DiscardHasScoringMinion: true,
            treasureDeck: [
                'munchkin_treasure_spiky_boots',
                'munchkin_treasure_wishing_ring',
            ],
            treasureDiscardSize: 0,
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 18');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 2');
        await game.screenshot('85-狡猾计划许愿指环收口后状态', testInfo);
    });

    test('我的！可真实检索可附着宝藏并立即打到己方宿主身上', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinMineSearchTreasureScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="mine-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="mine-host-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="mine-host-2"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="mine-opponent-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-base-monster-row-0')).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 4');
        await game.screenshot('86-我的！手牌与可选宿主', testInfo);

        await game.playCard('munchkin_dwarves_mine');
        await game.waitForInteraction('munchkin_dwarves_mine_choose_treasure', 10000);
        await waitForSmashUpFxToSettle(page);

        const mineOptions = await game.getInteractionOptions() as InteractionOption[];
        const spikyToHost = mineOptions.find((option) =>
            option.value?.treasureDefId === 'munchkin_treasure_spiky_boots'
            && option.value?.targetMinionUid === 'mine-host-1'
        );
        const magicToSecondHost = mineOptions.find((option) =>
            option.value?.treasureDefId === 'munchkin_treasure_magic_missile'
            && option.value?.targetMinionUid === 'mine-host-2'
        );
        expect(spikyToHost?.id, '我的！应列出尖刺靴到己方宝藏爱好者的组合').toBeTruthy();
        expect(magicToSecondHost?.id, '我的！应列出魔法导弹到另一名己方随从的组合').toBeTruthy();
        expect(
            mineOptions.some((option) => option.value?.treasureDefId === 'munchkin_treasure_wishing_ring'),
            '我的！不应列出不可附着的许愿指环',
        ).toBe(false);
        expect(
            mineOptions.some((option) => option.value?.treasureDefId === 'munchkin_treasure_potion_of_idiotic_bravery'),
            '我的！不应列出非附着宝藏的愚蠢勇气药水',
        ).toBe(false);
        expect(
            mineOptions.some((option) => option.value?.targetMinionUid === 'mine-opponent-1'),
            '我的！不应列出对手随从作为宿主',
        ).toBe(false);
        await expect(page.locator(`[data-option-id="${spikyToHost!.id}"]`).first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('87-我的！选择宝藏和己方宿主', testInfo);

        await game.selectInteractionOptionBy(
            (option: InteractionOption) =>
                option.value?.treasureDefId === 'munchkin_treasure_spiky_boots'
                && option.value?.targetMinionUid === 'mine-host-1',
            '我的！选择尖刺靴给己方宝藏爱好者',
        );
        await game.waitForInteraction('smashup_immediate_extra_action', 10000);

        const immediateOptions = await game.getInteractionOptions() as InteractionOption[];
        expect(
            immediateOptions.some((option) => option.value?.cardUid === 'munchkin_treasure_1290'),
            '我的！应只把检索到的尖刺靴作为立即额外行动',
        ).toBe(true);
        expect(
            immediateOptions.some((option) => option.value?.cardUid === 'mine-1'),
            '我的！源牌不应留在立即额外行动候选里',
        ).toBe(false);
        await expect(page.locator('[data-card-uid="munchkin_treasure_1290"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 3');
        await game.screenshot('88-我的！检索到尖刺靴并进入立即打出', testInfo);

        await game.selectInteractionOptionBy(
            (option: InteractionOption) => option.value?.cardUid === 'munchkin_treasure_1290',
            '我的！立即打出检索到的尖刺靴',
        );
        await game.waitForInteraction('smashup_immediate_extra_action_minion', 10000);
        const immediateMinionOptions = await game.getInteractionOptions() as InteractionOption[];
        expect(
            immediateMinionOptions.some((option) => option.value?.minionUid === 'mine-host-1'),
            '我的！立即打出尖刺靴后必须手动选择己方宿主',
        ).toBe(true);
        await expect(page.locator('[data-minion-uid="mine-host-1"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('88b-我的！立即打出尖刺靴时手动选择宿主', testInfo);
        await game.selectInteractionOptionBy(
            (option: InteractionOption) => option.value?.minionUid === 'mine-host-1',
            '我的！选择尖刺靴的己方宿主',
        );
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const host = core.bases[0].minions.find(minion => minion.uid === 'mine-host-1');
            const opponent = core.bases[0].minions.find(minion => minion.uid === 'mine-opponent-1');
            const otherHost = core.bases[1].minions.find(minion => minion.uid === 'mine-host-2');
            const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;
            return {
                hostAttachedUids: host?.attachedActions?.map(action => action.uid) ?? [],
                hostAttachedDefIds: host?.attachedActions?.map(action => action.defId) ?? [],
                opponentAttachedDefIds: opponent?.attachedActions?.map(action => action.defId) ?? [],
                otherHostAttachedDefIds: otherHost?.attachedActions?.map(action => action.defId) ?? [],
                player0HandUids: player0?.hand?.map(card => card.uid) ?? [],
                player0DiscardUids: player0?.discard?.map(card => card.uid) ?? [],
                player0ActionsPlayed: player0?.actionsPlayed ?? 0,
                player0ActionLimit: player0?.actionLimit ?? 0,
                treasureDeckSize: core.treasureDeck?.length ?? 0,
                treasureDeckHasSpikyBoots: core.treasureDeck?.includes('munchkin_treasure_spiky_boots') ?? false,
                treasureDiscardSize: core.treasureDiscard?.length ?? 0,
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            hostAttachedUids: ['munchkin_treasure_1290'],
            hostAttachedDefIds: ['munchkin_treasure_spiky_boots'],
            opponentAttachedDefIds: [],
            otherHostAttachedDefIds: [],
            player0HandUids: [],
            player0DiscardUids: ['mine-1'],
            player0ActionsPlayed: 2,
            player0ActionLimit: 2,
            treasureDeckSize: 3,
            treasureDeckHasSpikyBoots: false,
            treasureDiscardSize: 0,
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });

        await expect(page.locator('[data-attached-action-uid="munchkin_treasure_1290"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-minion-power-badge-mine-host-1')).toHaveAttribute('title', /尖刺靴: \+1/);
        await expect(page.locator('[data-minion-uid="mine-opponent-1"]').locator('[data-attached-action-uid="munchkin_treasure_1290"]')).toHaveCount(0);
        await expect(page.locator('[data-minion-uid="mine-host-2"]').locator('[data-attached-action-uid="munchkin_treasure_1290"]')).toHaveCount(0);
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 3');
        await game.screenshot('89-我的！尖刺靴附着到指定己方宿主', testInfo);
    });

    test('不！我的宝贝！可摧毁仆从身上的宝藏行动并继续打出额外行动', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinNoMyPreciousExtraActionScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="precious-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="precious-extra-ring"]').first()).toBeVisible({ timeout: 15000 });
        const host = page.locator('[data-minion-uid="precious-host"]').first();
        await expect(host).toBeVisible({ timeout: 15000 });
        await host.hover();
        await expect(page.locator('[data-attached-action-uid="precious-treasure-attached"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-attached-action-uid="precious-normal-attached"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-ongoing-uid="precious-base-action"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 0');
        await game.screenshot('90-不！我的宝贝！手牌与可摧毁附着行动', testInfo);

        await game.playCard('munchkin_dwarves_no_my_precious');
        await game.waitForInteraction('munchkin_dwarves_no_my_precious_destroy', 10000);

        const preciousOptions = await game.getInteractionOptions() as InteractionOption[];
        const treasureAttached = preciousOptions.find((option) => option.value?.cardUid === 'precious-treasure-attached');
        const normalAttached = preciousOptions.find((option) => option.value?.cardUid === 'precious-normal-attached');
        expect(treasureAttached?.id, '不！我的宝贝！应列出仆从身上的宝藏行动').toBeTruthy();
        expect(normalAttached?.id, '不！我的宝贝！应列出仆从身上的非宝藏行动').toBeTruthy();
        expect(
            preciousOptions.some((option) => option.value?.cardUid === 'precious-base-action'),
            '不！我的宝贝！不应列出基地上的行动',
        ).toBe(false);
        const attachedTreasureTarget = page.locator('[data-attached-action-uid="precious-treasure-attached"]').first();
        await host.hover();
        await expect(attachedTreasureTarget).toBeVisible({ timeout: 15000 });
        await game.screenshot('91-不！我的宝贝！选择仆从身上的宝藏行动', testInfo);

        await attachedTreasureTarget.click({ force: true });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const targetHost = core.bases[0].minions.find(minion => minion.uid === 'precious-host');
            const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;
            const player1 = core.players?.['1'] as SmashUpPlayerCoreSlice | undefined;
            return {
                hostAttachedUids: targetHost?.attachedActions?.map(action => action.uid) ?? [],
                player0HandUids: player0?.hand?.map(card => card.uid) ?? [],
                player0DiscardUids: player0?.discard?.map(card => card.uid) ?? [],
                player0ActionsPlayed: player0?.actionsPlayed ?? 0,
                player0ActionLimit: player0?.actionLimit ?? 0,
                player1DiscardUids: player1?.discard?.map(card => card.uid) ?? [],
                baseActionStillPresent: core.bases[0].ongoingActions?.some(action => action.uid === 'precious-base-action') ?? false,
                treasureDeck: core.treasureDeck ?? [],
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            hostAttachedUids: ['precious-normal-attached'],
            player0HandUids: ['precious-extra-ring'],
            player0DiscardUids: ['precious-1'],
            player0ActionsPlayed: 1,
            player0ActionLimit: 2,
            player1DiscardUids: ['precious-treasure-attached'],
            baseActionStillPresent: true,
            treasureDeck: [],
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });

        await expect(page.locator('[data-attached-action-uid="precious-treasure-attached"]')).toHaveCount(0);
        await host.hover();
        await expect(page.locator('[data-attached-action-uid="precious-normal-attached"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="precious-extra-ring"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('92-不！我的宝贝！摧毁宝藏后获得额外行动', testInfo);

        await game.playCard('munchkin_treasure_wishing_ring');
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;
            return {
                player0Vp: player0?.vp ?? 0,
                player0HandUids: player0?.hand?.map(card => card.uid) ?? [],
                player0DiscardUids: player0?.discard?.map(card => card.uid) ?? [],
                player0ActionsPlayed: player0?.actionsPlayed ?? 0,
                player0ActionLimit: player0?.actionLimit ?? 0,
                treasureDeck: core.treasureDeck ?? [],
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            player0Vp: 7,
            player0HandUids: [],
            player0DiscardUids: ['precious-1'],
            player0ActionsPlayed: 2,
            player0ActionLimit: 2,
            treasureDeck: ['munchkin_treasure_wishing_ring'],
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 1');
        await game.screenshot('93-不！我的宝贝！额外打出许愿指环后收口', testInfo);
    });

    test('打捞可从计分前响应窗口回收公共宝藏弃牌并附着到当前基地己方宿主', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinSalvageBeforeScoringScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="salvage-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="salvage-host-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="salvage-opponent-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="salvage-away-host"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('94-打捞计分前手牌与当前基地宿主', testInfo);

        await game.advancePhase();
        await game.waitForPhase('scoreBases', 10000);
        await page.waitForFunction(
            () => {
                const state = (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.();
                return state?.sys?.phase === 'scoreBases'
                    && state?.sys?.responseWindow?.current?.windowType === 'meFirst'
                    && state?.sys?.interaction?.current?.data?.sourceId === 'smashup_reaction_choose';
            },
            { timeout: 15000, polling: 200 },
        );

        await expect.poll(async () => {
            const options = await game.getInteractionOptions() as InteractionOption[];
            return {
                hasSalvageOption: options.some((option) =>
                    option.value?.cardUid === 'salvage-1'
                    || option.value?.handCardUid === 'salvage-1'
                    || option.label === '打捞'
                ),
            };
        }, { timeout: 10000 }).toEqual({ hasSalvageOption: true });

        await game.selectInteractionOptionBy(
            (option: InteractionOption) =>
                option.value?.cardUid === 'salvage-1'
                || option.value?.handCardUid === 'salvage-1'
                || option.label === '打捞',
            'beforeScoring 选择打捞',
        );
        await game.waitForInteraction('munchkin_dwarves_salvage_choose_treasure', 10000);

        const salvageOptions = await game.getInteractionOptions() as InteractionOption[];
        const spikyToCurrentHost = salvageOptions.find((option) =>
            option.value?.treasureDefId === 'munchkin_treasure_spiky_boots'
            && option.value?.targetMinionUid === 'salvage-host-1'
        );
        const magicToCurrentHost = salvageOptions.find((option) =>
            option.value?.treasureDefId === 'munchkin_treasure_magic_missile'
            && option.value?.targetMinionUid === 'salvage-host-1'
        );
        expect(spikyToCurrentHost?.id, '打捞应列出尖刺靴到当前基地己方宿主的组合').toBeTruthy();
        expect(magicToCurrentHost?.id, '打捞应列出魔法导弹到当前基地己方宿主的组合').toBeTruthy();
        expect(
            salvageOptions.some((option) => option.value?.treasureDefId === 'munchkin_treasure_wishing_ring'),
            '打捞不应列出不可附着的许愿指环',
        ).toBe(false);
        expect(
            salvageOptions.some((option) => option.value?.treasureDefId === 'munchkin_treasure_potion_of_idiotic_bravery'),
            '打捞不应列出非附着宝藏的愚蠢勇气药水',
        ).toBe(false);
        expect(
            salvageOptions.some((option) => option.value?.targetMinionUid === 'salvage-opponent-1'),
            '打捞不应列出对手随从作为宿主',
        ).toBe(false);
        expect(
            salvageOptions.some((option) => option.value?.targetMinionUid === 'salvage-away-host'),
            '打捞不应列出非当前计分基地的己方随从作为宿主',
        ).toBe(false);
        await expect(page.locator(`[data-option-id="${spikyToCurrentHost!.id}"]`).first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('95-打捞选择公共宝藏弃牌和当前基地宿主', testInfo);

        await game.selectInteractionOptionBy(
            (option: InteractionOption) =>
                option.value?.treasureDefId === 'munchkin_treasure_spiky_boots'
                && option.value?.targetMinionUid === 'salvage-host-1',
            '打捞选择尖刺靴给当前基地己方宿主',
        );
        await game.waitForInteraction('smashup_immediate_extra_action', 10000);

        const immediateState = await game.getState();
        const immediateCore = immediateState.core as RocketBootsCoreState;
        const recoveredTreasureUid = immediateCore.players?.['0']?.hand?.find(card =>
            card.defId === 'munchkin_treasure_spiky_boots'
        )?.uid;
        if (!recoveredTreasureUid) {
            throw new Error('打捞应把回收的尖刺靴放入手牌作为立即额外行动候选');
        }
        const recoveredTreasureCard = page.locator(`[data-card-uid="${recoveredTreasureUid}"]`).first();
        await expect(recoveredTreasureCard).toBeVisible({ timeout: 15000 });
        const immediateOptions = await game.getInteractionOptions() as InteractionOption[];
        expect(
            immediateOptions.some((option) =>
                option.value?.cardUid === recoveredTreasureUid
                || option.value?.defId === 'munchkin_treasure_spiky_boots'
            ),
            '打捞应只把回收出的尖刺靴作为立即额外行动候选',
        ).toBe(true);
        expect(
            immediateOptions.some((option) =>
                option.value?.cardUid === 'salvage-1'
                || option.value?.defId === 'munchkin_dwarves_salvage'
            ),
            '打捞源牌不应留在立即额外行动候选里',
        ).toBe(false);
        await game.screenshot('96-打捞回收到尖刺靴并进入立即打出', testInfo);

        await game.selectInteractionOptionBy(
            (option: InteractionOption) =>
                option.value?.cardUid === recoveredTreasureUid
                || option.value?.defId === 'munchkin_treasure_spiky_boots',
            '打捞立即打出刚回收的尖刺靴',
        );
        await game.waitForInteraction('smashup_immediate_extra_action_minion', 10000);
        const salvageImmediateMinionOptions = await game.getInteractionOptions() as InteractionOption[];
        expect(
            salvageImmediateMinionOptions.some((option) => option.value?.minionUid === 'salvage-host-1'),
            '打捞立即打出尖刺靴后必须手动选择当前基地己方宿主',
        ).toBe(true);
        await expect(page.locator('[data-minion-uid="salvage-host-1"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('96b-打捞立即打出尖刺靴时手动选择宿主', testInfo);
        await game.selectInteractionOptionBy(
            (option: InteractionOption) => option.value?.minionUid === 'salvage-host-1',
            '打捞选择尖刺靴的当前基地己方宿主',
        );
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;
            const player1 = core.players?.['1'] as SmashUpPlayerCoreSlice | undefined;
            const events = (state.sys?.eventStream?.entries ?? []).map((entry: EventStreamEntry) => entry.event);
            const attachEvent = events.find(event =>
                event?.type === 'su:ongoing_attached'
                && event.payload?.cardUid === recoveredTreasureUid
                && event.payload?.defId === 'munchkin_treasure_spiky_boots'
                && event.payload?.targetType === 'minion'
                && event.payload?.targetBaseIndex === 0
                && event.payload?.targetMinionUid === 'salvage-host-1'
            );
            const baseScoredEvent = events.find(event =>
                event?.type === 'su:base_scored'
                && event.payload?.baseDefId === 'base_the_mines'
            );
            const baseClearedEvent = events.find(event =>
                event?.type === 'su:base_cleared'
                && event.payload?.baseDefId === 'base_the_mines'
            );
            return {
                attachedToCurrentHostBeforeClear: Boolean(attachEvent),
                baseScoredByMine: Boolean(baseScoredEvent),
                baseClearedByMine: Boolean(baseClearedEvent),
                baseScoredRankingSummary: baseScoredEvent?.payload?.rankings?.map((ranking) => ({
                    playerId: ranking.playerId,
                    power: ranking.power,
                    vp: ranking.vp,
                })) ?? [],
                remainingBaseDefIds: core.bases.map(base => base.defId),
                awayHostStillOnTreasureBath: core.bases.some(base =>
                    base.defId === 'base_treasure_bath'
                    && base.minions.some(minion => minion.uid === 'salvage-away-host')
                ),
                player0Vp: player0?.vp ?? 0,
                player1Vp: player1?.vp ?? 0,
                player0HandUids: player0?.hand?.map(card => card.uid) ?? [],
                player0DiscardUids: player0?.discard?.map(card => card.uid) ?? [],
                player1DiscardUids: player1?.discard?.map(card => card.uid) ?? [],
                treasureDeckSize: core.treasureDeck?.length ?? 0,
                treasureDiscard: core.treasureDiscard ?? [],
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 15000 }).toEqual({
            attachedToCurrentHostBeforeClear: true,
            baseScoredByMine: true,
            baseClearedByMine: true,
            baseScoredRankingSummary: [
                { playerId: '0', power: 34, vp: 4 },
                { playerId: '1', power: 4, vp: 2 },
            ],
            remainingBaseDefIds: ['base_the_homeworld', 'base_treasure_bath'],
            awayHostStillOnTreasureBath: true,
            player0Vp: 10,
            player1Vp: 6,
            player0HandUids: ['0-deck-0', '0-deck-1'],
            player0DiscardUids: ['salvage-1', recoveredTreasureUid, 'salvage-host-1'],
            player1DiscardUids: ['salvage-opponent-1'],
            treasureDeckSize: MUNCHKIN_TREASURE_DECK_DEF_IDS.length,
            treasureDiscard: [
                'munchkin_treasure_wishing_ring',
                'munchkin_treasure_potion_of_idiotic_bravery',
                'munchkin_treasure_magic_missile',
            ],
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });

        await expect(page.locator(`[data-attached-action-uid="${recoveredTreasureUid}"]`)).toHaveCount(0);
        await expect(page.getByTestId('su-score-vp-0')).toHaveText('10');
        await expect(page.getByTestId('su-score-vp-1')).toHaveText('6');
        await expect(page.locator('[data-minion-uid="salvage-opponent-1"]').locator(`[data-attached-action-uid="${recoveredTreasureUid}"]`)).toHaveCount(0);
        await expect(page.locator('[data-minion-uid="salvage-away-host"]').locator(`[data-attached-action-uid="${recoveredTreasureUid}"]`)).toHaveCount(0);
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('97-打捞尖刺靴附着后完成计分清场', testInfo);
    });

    test('贪婪是好的可真实选择回收公共宝藏弃牌并获得额外行动', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinGreedIsGoodScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="greed-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="greed-bystander"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 2');
        await game.screenshot('72-贪婪是好的手牌与公共宝藏弃牌', testInfo);

        await game.playCard('munchkin_dwarves_greed_is_good');
        await game.waitForInteraction('munchkin_dwarves_greed_is_good_choose_treasure', 10000);

        const greedOptions = await game.getInteractionOptions();
        const drawOption = greedOptions.find((option: InteractionOption) => option.value?.mode === 'draw');
        const recoverOption = greedOptions.find((option: InteractionOption) =>
            option.value?.mode === 'recover'
            && option.value?.treasureDefId === 'munchkin_treasure_buckler_of_swashing'
        );
        expect(drawOption?.id, '贪婪是好的应提供抽宝藏选项').toBeTruthy();
        expect(recoverOption?.id, '贪婪是好的应提供回收公共宝藏弃牌选项').toBeTruthy();
        await expect(page.getByRole('button', { name: '抽一张宝藏牌' }).first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByText('摆动的盾牌').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('73-贪婪是好的选择抽宝藏或回收弃牌', testInfo);

        await game.selectInteractionOptionBy(
            (option: InteractionOption) =>
                option.value?.mode === 'recover'
                && option.value?.treasureDefId === 'munchkin_treasure_buckler_of_swashing',
            '贪婪是好的回收摆动的盾牌',
        );
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;
            return {
                player0HandUids: player0?.hand?.map(card => card.uid) ?? [],
                player0HandDefIds: player0?.hand?.map(card => card.defId) ?? [],
                player0DiscardDefIds: player0?.discard?.map(card => card.defId) ?? [],
                player0ActionsPlayed: player0?.actionsPlayed ?? 0,
                player0ActionLimit: player0?.actionLimit ?? 0,
                treasureDeck: core.treasureDeck ?? [],
                treasureDiscard: core.treasureDiscard ?? [],
                nextUid: core.nextUid ?? 0,
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            player0HandUids: ['munchkin_treasure_1260'],
            player0HandDefIds: ['munchkin_treasure_buckler_of_swashing'],
            player0DiscardDefIds: ['munchkin_dwarves_greed_is_good'],
            player0ActionsPlayed: 1,
            player0ActionLimit: 2,
            treasureDeck: [
                'munchkin_treasure_dwarf_hireling',
                'munchkin_treasure_spiky_boots',
            ],
            treasureDiscard: ['munchkin_treasure_wishing_ring'],
            nextUid: 1261,
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });

        await expect(page.locator('[data-card-uid="munchkin_treasure_1260"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="greed-1"]')).toHaveCount(0);
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 2');
        await game.screenshot('74-贪婪是好的回收宝藏弃牌后进入手牌', testInfo);
    });

    test('宝藏爱好者和宝石抓取者可通过真实附着宝藏获得持续力量', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinDwarfTreasurePowerScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="loot-lover-buckler-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="loot-lover-rocket-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="gem-grabber-jetpack-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="dwarf-loot-lover"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="dwarf-gem-grabber"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('62-宝藏爱好者与宝石抓取者待附着宝藏', testInfo);

        const playTreasureToVisibleMinion = async (cardUid: string, targetMinionUid: string, xRatio: number) => {
            await page.locator(`[data-card-uid="${cardUid}"]`).first().click();
            await page.waitForTimeout(300);
            const target = page.locator(`[data-minion-uid="${targetMinionUid}"]`).first();
            const box = await target.boundingBox();
            expect(box, `${targetMinionUid} 应有可点击的露出卡面`).not.toBeNull();
            await page.mouse.click(
                box!.x + Math.max(8, Math.min(box!.width - 8, box!.width * xRatio)),
                box!.y + box!.height * 0.55,
            );
            await game.waitForNoInteraction(10000);
        };

        await playTreasureToVisibleMinion('loot-lover-buckler-1', 'dwarf-loot-lover', 0.18);
        await playTreasureToVisibleMinion('loot-lover-rocket-1', 'dwarf-loot-lover', 0.18);
        await playTreasureToVisibleMinion('gem-grabber-jetpack-1', 'dwarf-gem-grabber', 0.82);
        await waitForSmashUpFxToSettle(page);

        await expect(page.getByTestId('su-minion-power-badge-dwarf-loot-lover')).toHaveAttribute('title', /宝藏爱好者: \+4/);
        await expect(page.getByTestId('su-minion-power-badge-dwarf-loot-lover')).toContainText('+4');
        await expect(page.getByTestId('su-minion-power-badge-dwarf-gem-grabber')).toHaveAttribute('title', /宝石抓取者: \+2/);
        await expect(page.getByTestId('su-minion-power-badge-dwarf-gem-grabber')).toContainText('+2');

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const lootLover = core.bases[0].minions.find(minion => minion.uid === 'dwarf-loot-lover');
            const gemGrabber = core.bases[1].minions.find(minion => minion.uid === 'dwarf-gem-grabber');
            const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;
            return {
                lootLoverAttachedDefIds: lootLover?.attachedActions?.map(action => action.defId) ?? [],
                gemGrabberAttachedDefIds: gemGrabber?.attachedActions?.map(action => action.defId) ?? [],
                player0HandUids: player0?.hand?.map(card => card.uid) ?? [],
                player0DiscardDefIds: player0?.discard?.map(card => card.defId) ?? [],
                player0ActionsPlayed: player0?.actionsPlayed ?? 0,
                player0ActionLimit: player0?.actionLimit ?? 0,
                treasureDeckSize: core.treasureDeck?.length ?? 0,
                treasureDiscardSize: core.treasureDiscard?.length ?? 0,
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            lootLoverAttachedDefIds: [
                'munchkin_treasure_buckler_of_swashing',
                'munchkin_treasure_rocket_boots',
            ],
            gemGrabberAttachedDefIds: ['munchkin_treasure_temporal_displacement_jetpack'],
            player0HandUids: [],
            player0DiscardDefIds: [],
            player0ActionsPlayed: 3,
            player0ActionLimit: 3,
            treasureDeckSize: 22,
            treasureDiscardSize: 0,
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('63-宝藏爱好者与宝石抓取者获得持续力量', testInfo);
    });

    test('尖刺靴可从手牌附着到随从并提供持续力量', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinSpikyBootsScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="spiky-boots-hand-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="spiky-host"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="spiky-bystander"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('41-尖刺靴手牌与目标随从', testInfo);

        await game.playCard('munchkin_treasure_spiky_boots', { targetMinionUid: 'spiky-host' });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        const attachedBoots = page.locator('[data-attached-action-uid="spiky-boots-hand-1"]').first();
        await expect(attachedBoots).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-minion-power-badge-spiky-host')).toHaveAttribute('title', /尖刺靴: \+1/);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const host = core.bases[0].minions.find(minion => minion.uid === 'spiky-host');
            const bystander = core.bases[0].minions.find(minion => minion.uid === 'spiky-bystander');
            return {
                hostAttachedDefIds: host?.attachedActions?.map(action => action.defId) ?? [],
                bystanderAttachedDefIds: bystander?.attachedActions?.map(action => action.defId) ?? [],
                player0HandUids: core.players?.['0']?.hand?.map(card => card.uid) ?? [],
                player0DiscardDefIds: core.players?.['0']?.discard?.map(card => card.defId) ?? [],
                player0ActionsPlayed: core.players?.['0']?.actionsPlayed ?? 0,
                treasureDeckSize: core.treasureDeck?.length ?? 0,
                treasureDiscardSize: core.treasureDiscard?.length ?? 0,
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            hostAttachedDefIds: ['munchkin_treasure_spiky_boots'],
            bystanderAttachedDefIds: [],
            player0HandUids: [],
            player0DiscardDefIds: [],
            player0ActionsPlayed: 1,
            treasureDeckSize: 22,
            treasureDiscardSize: 0,
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('42-尖刺靴附着后持续力量', testInfo);
    });

    test('矿洞可在真实宝藏附着后按随从身上宝藏提供持续力量', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinTheMinesTreasureAttachmentScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="mines-spiky-boots-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="mines-host"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="mines-bystander"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('75-矿洞手牌宝藏与目标随从', testInfo);

        await game.playCard('munchkin_treasure_spiky_boots', { targetMinionUid: 'mines-host' });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        const attachedBoots = page.locator('[data-attached-action-uid="mines-spiky-boots-1"]').first();
        const minesHostPower = page.getByTestId('su-minion-power-badge-mines-host');
        await expect(attachedBoots).toBeVisible({ timeout: 15000 });
        await expect(minesHostPower).toHaveText('+2', { timeout: 15000 });
        await expect(minesHostPower).toHaveAttribute('title', /尖刺靴: \+1/);
        await expect(minesHostPower).toHaveAttribute('title', /矿洞: \+1/);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const host = core.bases[0].minions.find(minion => minion.uid === 'mines-host');
            const bystander = core.bases[0].minions.find(minion => minion.uid === 'mines-bystander');
            return {
                base0DefId: core.bases[0].defId,
                hostAttachedDefIds: host?.attachedActions?.map(action => action.defId) ?? [],
                bystanderAttachedDefIds: bystander?.attachedActions?.map(action => action.defId) ?? [],
                player0HandUids: core.players?.['0']?.hand?.map(card => card.uid) ?? [],
                player0DiscardDefIds: core.players?.['0']?.discard?.map(card => card.defId) ?? [],
                player0ActionsPlayed: core.players?.['0']?.actionsPlayed ?? 0,
                treasureDeckSize: core.treasureDeck?.length ?? 0,
                treasureDiscardSize: core.treasureDiscard?.length ?? 0,
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            base0DefId: 'base_the_mines',
            hostAttachedDefIds: ['munchkin_treasure_spiky_boots'],
            bystanderAttachedDefIds: [],
            player0HandUids: [],
            player0DiscardDefIds: [],
            player0ActionsPlayed: 1,
            treasureDeckSize: 22,
            treasureDiscardSize: 0,
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('76-矿洞按附着宝藏提供持续力量', testInfo);
    });

    test('血腥肢解电锯可从手牌附着到随从并提供持续力量', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinBloodyDismembermentChainsawScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="chainsaw-hand-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="chainsaw-host"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="chainsaw-bystander"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('43-血腥肢解电锯手牌与目标随从', testInfo);

        await game.playCard('munchkin_treasure_bloody_dismemberment_chainsaw', { targetMinionUid: 'chainsaw-host' });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        const attachedChainsaw = page.locator('[data-attached-action-uid="chainsaw-hand-1"]').first();
        await expect(attachedChainsaw).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-minion-power-badge-chainsaw-host')).toHaveAttribute('title', /血腥肢解电锯: \+2/);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const host = core.bases[0].minions.find(minion => minion.uid === 'chainsaw-host');
            const bystander = core.bases[0].minions.find(minion => minion.uid === 'chainsaw-bystander');
            return {
                hostAttachedDefIds: host?.attachedActions?.map(action => action.defId) ?? [],
                bystanderAttachedDefIds: bystander?.attachedActions?.map(action => action.defId) ?? [],
                player0HandUids: core.players?.['0']?.hand?.map(card => card.uid) ?? [],
                player0DiscardDefIds: core.players?.['0']?.discard?.map(card => card.defId) ?? [],
                player0ActionsPlayed: core.players?.['0']?.actionsPlayed ?? 0,
                treasureDeckSize: core.treasureDeck?.length ?? 0,
                treasureDiscardSize: core.treasureDiscard?.length ?? 0,
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            hostAttachedDefIds: ['munchkin_treasure_bloody_dismemberment_chainsaw'],
            bystanderAttachedDefIds: [],
            player0HandUids: [],
            player0DiscardDefIds: [],
            player0ActionsPlayed: 1,
            treasureDeckSize: 22,
            treasureDiscardSize: 0,
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('44-血腥肢解电锯附着后持续力量', testInfo);
    });

    test('大量宝藏可从手牌附着并按宿主宝藏数量持续加力量', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinLoadsOfTreasureScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="loads-hand-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="loads-host"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="loads-bystander"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-minion-power-badge-loads-host')).toHaveAttribute('title', /尖刺靴: \+1/);
        await expect(page.getByTestId('su-minion-power-badge-loads-host')).toContainText('+1');
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('45-大量宝藏手牌与已有宝藏附着', testInfo);

        await game.playCard('munchkin_treasure_loads_of_treasure', { targetMinionUid: 'loads-host' });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        const attachedLoads = page.locator('[data-attached-action-uid="loads-hand-1"]').first();
        await expect(attachedLoads).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-minion-power-badge-loads-host')).toHaveAttribute('title', /大量宝藏: \+2/);
        await expect(page.getByTestId('su-minion-power-badge-loads-host')).toContainText('+3');

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const host = core.bases[0].minions.find(minion => minion.uid === 'loads-host');
            const bystander = core.bases[0].minions.find(minion => minion.uid === 'loads-bystander');
            return {
                hostAttachedDefIds: host?.attachedActions?.map(action => action.defId) ?? [],
                bystanderAttachedDefIds: bystander?.attachedActions?.map(action => action.defId) ?? [],
                player0HandUids: core.players?.['0']?.hand?.map(card => card.uid) ?? [],
                player0DiscardDefIds: core.players?.['0']?.discard?.map(card => card.defId) ?? [],
                player0ActionsPlayed: core.players?.['0']?.actionsPlayed ?? 0,
                treasureDeckSize: core.treasureDeck?.length ?? 0,
                treasureDiscardSize: core.treasureDiscard?.length ?? 0,
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            hostAttachedDefIds: [
                'munchkin_treasure_spiky_boots',
                'munchkin_treasure_loads_of_treasure',
            ],
            bystanderAttachedDefIds: [],
            player0HandUids: [],
            player0DiscardDefIds: [],
            player0ActionsPlayed: 1,
            treasureDeckSize: 22,
            treasureDiscardSize: 0,
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('46-大量宝藏附着后按宝藏数量加力量', testInfo);
    });

    test('诱惑护膝可从手牌附着并给同基地每个随从持续加力量', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinKneepadsOfAllureScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="kneepads-hand-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="kneepads-host"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="kneepads-ally"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="kneepads-enemy"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('47-诱惑护膝手牌与同基地随从', testInfo);

        await game.playCard('munchkin_treasure_kneepads_of_allure', { targetMinionUid: 'kneepads-ally' });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        const attachedKneepads = page.locator('[data-attached-action-uid="kneepads-hand-1"]').first();
        await expect(attachedKneepads).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-minion-power-badge-kneepads-host')).toHaveAttribute('title', /诱惑护膝: \+1/);
        await expect(page.getByTestId('su-minion-power-badge-kneepads-ally')).toHaveAttribute('title', /诱惑护膝: \+1/);
        await expect(page.getByTestId('su-minion-power-badge-kneepads-enemy')).toHaveAttribute('title', /诱惑护膝: \+1/);
        await expect(page.getByTestId('su-minion-power-badge-kneepads-host')).toContainText('+1');
        await expect(page.getByTestId('su-minion-power-badge-kneepads-ally')).toContainText('+1');
        await expect(page.getByTestId('su-minion-power-badge-kneepads-enemy')).toContainText('+1');

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const host = core.bases[0].minions.find(minion => minion.uid === 'kneepads-host');
            const ally = core.bases[0].minions.find(minion => minion.uid === 'kneepads-ally');
            const enemy = core.bases[0].minions.find(minion => minion.uid === 'kneepads-enemy');
            return {
                hostAttachedDefIds: host?.attachedActions?.map(action => action.defId) ?? [],
                allyAttachedDefIds: ally?.attachedActions?.map(action => action.defId) ?? [],
                enemyAttachedDefIds: enemy?.attachedActions?.map(action => action.defId) ?? [],
                player0HandUids: core.players?.['0']?.hand?.map(card => card.uid) ?? [],
                player0DiscardDefIds: core.players?.['0']?.discard?.map(card => card.defId) ?? [],
                player0ActionsPlayed: core.players?.['0']?.actionsPlayed ?? 0,
                treasureDeckSize: core.treasureDeck?.length ?? 0,
                treasureDiscardSize: core.treasureDiscard?.length ?? 0,
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            hostAttachedDefIds: [],
            allyAttachedDefIds: ['munchkin_treasure_kneepads_of_allure'],
            enemyAttachedDefIds: [],
            player0HandUids: [],
            player0DiscardDefIds: [],
            player0ActionsPlayed: 1,
            treasureDeckSize: 22,
            treasureDiscardSize: 0,
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('48-诱惑护膝附着后同基地全体加力量', testInfo);
    });

    test('怯懦药水可从手牌附着并让宿主失去能力', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinPotionOfCowardiceScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="cowardice-hand-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="cowardice-talent-cost-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="cowardice-host"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="cowardice-bystander"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('49-怯懦药水手牌与拉贾宿主', testInfo);

        await game.playCard('munchkin_treasure_potion_of_cowardice', { targetMinionUid: 'cowardice-host' });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        const attachedCowardice = page.locator('[data-attached-action-uid="cowardice-hand-1"]').first();
        await expect(attachedCowardice).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-minion-power-badge-cowardice-host')).toHaveAttribute('title', /怯懦药水: -2/);
        await expect(page.getByTestId('su-minion-power-badge-cowardice-host')).toContainText('-2');

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const host = core.bases[0].minions.find(minion => minion.uid === 'cowardice-host');
            const bystander = core.bases[0].minions.find(minion => minion.uid === 'cowardice-bystander');
            return {
                hostAttachedDefIds: host?.attachedActions?.map(action => action.defId) ?? [],
                bystanderAttachedDefIds: bystander?.attachedActions?.map(action => action.defId) ?? [],
                hostTempPower: host?.tempPowerModifier ?? 0,
                hostTalentUsed: host?.talentUsed === true,
                player0HandUids: core.players?.['0']?.hand?.map(card => card.uid) ?? [],
                player0DiscardDefIds: core.players?.['0']?.discard?.map(card => card.defId) ?? [],
                player0ActionsPlayed: core.players?.['0']?.actionsPlayed ?? 0,
                treasureDeckSize: core.treasureDeck?.length ?? 0,
                treasureDiscardSize: core.treasureDiscard?.length ?? 0,
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            hostAttachedDefIds: ['munchkin_treasure_potion_of_cowardice'],
            bystanderAttachedDefIds: [],
            hostTempPower: 0,
            hostTalentUsed: false,
            player0HandUids: ['cowardice-talent-cost-1'],
            player0DiscardDefIds: [],
            player0ActionsPlayed: 1,
            treasureDeckSize: 22,
            treasureDiscardSize: 0,
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });

        await page.evaluate(async () => {
            const harness = (window as BrowserHarnessWindow).__BG_TEST_HARNESS__;
            await harness?.command?.dispatch?.({
                type: 'su:use_talent',
                playerId: '0',
                payload: { minionUid: 'cowardice-host', baseIndex: 0 },
            });
        });
        await page.waitForTimeout(500);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const host = core.bases[0].minions.find(minion => minion.uid === 'cowardice-host');
            return {
                hostTempPower: host?.tempPowerModifier ?? 0,
                hostTalentUsed: host?.talentUsed === true,
                player0HandUids: core.players?.['0']?.hand?.map(card => card.uid) ?? [],
                player0DiscardDefIds: core.players?.['0']?.discard?.map(card => card.defId) ?? [],
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 3000 }).toEqual({
            hostTempPower: 0,
            hostTalentUsed: false,
            player0HandUids: ['cowardice-talent-cost-1'],
            player0DiscardDefIds: [],
            interactionSourceId: null,
            responseWindowType: null,
        });

        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('50-怯懦药水附着后宿主失去能力', testInfo);
    });

    test('摆动的盾牌可从手牌附着并保护宿主不被摧毁', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinBucklerOfSwashingScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        const buckler = page.locator('[data-card-uid="buckler-hand-1"]').first();
        const magicHost = page.locator('[data-minion-uid="buckler-magic-host"]').first();
        const protectedTarget = page.locator('[data-minion-uid="buckler-protected-target"]').first();
        const unprotectedTarget = page.locator('[data-minion-uid="buckler-unprotected-target"]').first();
        await expect(buckler).toBeVisible({ timeout: 15000 });
        await expect(magicHost).toBeVisible({ timeout: 15000 });
        await expect(protectedTarget).toBeVisible({ timeout: 15000 });
        await expect(unprotectedTarget).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 1');
        await game.screenshot('51-摆动的盾牌手牌与魔法导弹压力态', testInfo);

        await game.playCard('munchkin_treasure_buckler_of_swashing', {
            targetMinionUid: 'buckler-protected-target',
        });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        const attachedBuckler = page.locator('[data-attached-action-uid="buckler-hand-1"]').first();
        await protectedTarget.hover();
        await expect(attachedBuckler).toBeVisible({ timeout: 15000 });
        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const protectedState = core.bases[0].minions.find(minion => minion.uid === 'buckler-protected-target');
            const magicHostState = core.bases[0].minions.find(minion => minion.uid === 'buckler-magic-host');
            return {
                protectedAttachedDefIds: protectedState?.attachedActions?.map(action => action.defId) ?? [],
                magicHostAttachedDefIds: magicHostState?.attachedActions?.map(action => action.defId) ?? [],
                player0HandUids: core.players?.['0']?.hand?.map(card => card.uid) ?? [],
                player0DiscardDefIds: core.players?.['0']?.discard?.map(card => card.defId) ?? [],
                player0ActionsPlayed: core.players?.['0']?.actionsPlayed ?? 0,
                treasureDeck: core.treasureDeck ?? [],
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            protectedAttachedDefIds: ['munchkin_treasure_buckler_of_swashing'],
            magicHostAttachedDefIds: ['munchkin_treasure_magic_missile'],
            player0HandUids: [],
            player0DiscardDefIds: [],
            player0ActionsPlayed: 1,
            treasureDeck: ['munchkin_treasure_wishing_ring'],
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await game.screenshot('52-摆动的盾牌附着后保护目标', testInfo);

        const magicMissile = page.locator('[data-attached-action-uid="buckler-magic-missile"]').first();
        await magicHost.hover();
        await expect(magicMissile).toBeVisible({ timeout: 15000 });
        await magicMissile.click({ force: true });
        await game.waitForInteraction('munchkin_treasure_magic_missile_destroy', 10000);
        const magnifyOverlay = page.getByTestId('su-card-magnify-overlay');
        if (await magnifyOverlay.isVisible().catch(() => false)) {
            await magnifyOverlay.click({ position: { x: 10, y: 10 }, force: true });
            await expect(magnifyOverlay).toBeHidden({ timeout: 1000 });
        }

        await expect.poll(async () => {
            const options = await game.getInteractionOptions() as InteractionOption[];
            return options.map(option => option.value?.minionUid).filter(Boolean);
        }, { timeout: 10000 }).toEqual(['buckler-unprotected-target']);
        await game.screenshot('53-摆动的盾牌过滤受保护摧毁目标', testInfo);

        const unprotectedTargetBox = await unprotectedTarget.boundingBox();
        expect(unprotectedTargetBox, '魔法导弹应只能点到未被摆动的盾牌保护的目标').not.toBeNull();
        await page.mouse.click(
            unprotectedTargetBox!.x + Math.max(8, unprotectedTargetBox!.width * 0.18),
            unprotectedTargetBox!.y + unprotectedTargetBox!.height * 0.55,
        );
        await game.waitForNoInteraction(10000);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const protectedState = core.bases[0].minions.find(minion => minion.uid === 'buckler-protected-target');
            const magicHostState = core.bases[0].minions.find(minion => minion.uid === 'buckler-magic-host');
            return {
                base0MinionUids: core.bases[0].minions.map(minion => minion.uid),
                protectedAttachedDefIds: protectedState?.attachedActions?.map(action => action.defId) ?? [],
                magicHostAttachedDefIds: magicHostState?.attachedActions?.map(action => action.defId) ?? [],
                player1DiscardUids: core.players?.['1']?.discard?.map(card => card.uid) ?? [],
                treasureDeck: core.treasureDeck ?? [],
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            base0MinionUids: ['buckler-magic-host', 'buckler-protected-target'],
            protectedAttachedDefIds: ['munchkin_treasure_buckler_of_swashing'],
            magicHostAttachedDefIds: [],
            player1DiscardUids: ['buckler-unprotected-target'],
            treasureDeck: [
                'munchkin_treasure_wishing_ring',
                'munchkin_treasure_magic_missile',
            ],
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });

        await expect(page.locator('[data-minion-uid="buckler-protected-target"]')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('[data-minion-uid="buckler-unprotected-target"]')).toHaveCount(0);
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 2');
        await game.screenshot('54-摆动的盾牌保护宿主摧毁未保护目标后状态', testInfo);
    });

    test('火箭靴附着行动天赋可从卡本体点击并移动宿主到目标基地', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinRocketBootsScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        const host = page.locator('[data-minion-uid="rocket-host"]').first();
        const rocketBoots = page.locator('[data-attached-action-uid="rocket-boots-1"]').first();
        await expect(host).toBeVisible({ timeout: 15000 });
        await host.hover();
        await expect(rocketBoots).toBeVisible({ timeout: 15000 });
        await game.screenshot('03-火箭靴附着行动可点击', testInfo);

        await rocketBoots.click({ force: true });
        await game.waitForInteraction('munchkin_treasure_rocket_boots_move', 10000);
        await game.screenshot('04-火箭靴选择目标基地', testInfo);

        await game.selectInteractionOptionBy(
            (option: InteractionOption) => option?.value?.baseIndex === 1,
            '火箭靴目标基地',
        );
        await game.waitForNoInteraction(10000);

        await expect.poll(async () => {
            const core = await readCoreState(page) as RocketBootsCoreState;
            const sourceUids = core.bases[0].minions.map(minion => minion.uid);
            const targetHost = core.bases[1].minions.find(minion => minion.uid === 'rocket-host');
            const rocket = targetHost?.attachedActions?.find(action => action.uid === 'rocket-boots-1');
            return {
                sourceUids,
                targetHasHost: Boolean(targetHost),
                targetHasRocketBoots: rocket?.defId === 'munchkin_treasure_rocket_boots',
                rocketTalentUsed: rocket?.talentUsed === true,
                triggerQueueLength: core.triggerQueue?.length ?? 0,
            };
        }, { timeout: 10000 }).toEqual({
            sourceUids: [],
            targetHasHost: true,
            targetHasRocketBoots: true,
            rocketTalentUsed: true,
            triggerQueueLength: 0,
        });

        await game.screenshot('05-火箭靴移动宿主后状态', testInfo);
    });

    test('复制药水附着行动天赋可从卡本体点击并复制另一个仆从天赋', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinDuplicationPotionScene());
        await hideSmashUpDebugPanelForEvidence(page);

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        const host = page.locator('[data-minion-uid="duplication-host"]').first();
        const duplicationPotion = page.locator('[data-attached-action-uid="duplication-potion-1"]').first();
        await expect(host).toBeVisible({ timeout: 15000 });
        await host.hover();
        await expect(duplicationPotion).toBeVisible({ timeout: 15000 });
        await game.screenshot('06-复制药水附着行动可点击', testInfo);

        await duplicationPotion.click({ force: true });
        await game.waitForInteraction('munchkin_treasure_potion_of_duplication_choose_talent', 10000);
        await game.screenshot('07-复制药水选择另一个仆从天赋', testInfo);

        await game.selectInteractionOptionBy(
            (option: InteractionOption) => option?.value?.minionUid === 'rajah-1',
            '复制药水目标天赋',
        );
        await game.waitForNoInteraction(10000);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const hostState = core.bases[0].minions.find(minion => minion.uid === 'duplication-host');
            const potion = hostState?.attachedActions?.find(action => action.uid === 'duplication-potion-1');
            return {
                hostTempPower: hostState?.tempPowerModifier ?? 0,
                potionTalentUsed: potion?.talentUsed === true,
                handUids: core.players?.['0']?.hand?.map(card => card.uid) ?? [],
                discardDefIds: core.players?.['0']?.discard?.map(card => card.defId) ?? [],
                triggerQueueLength: core.triggerQueue?.length ?? 0,
            };
        }, { timeout: 10000 }).toEqual({
            hostTempPower: 2,
            potionTalentUsed: true,
            handUids: [],
            discardDefIds: ['alien_probe'],
            triggerQueueLength: 0,
        });

        await waitForSmashUpFxToSettle(page);
        await page.mouse.move(24, 24);
        await game.screenshot('08-复制药水复制天赋后状态', testInfo);
    });

    test('魔法导弹附着行动天赋可从卡本体点击并摧毁同基地低力仆从', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinMagicMissileScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        const host = page.locator('[data-minion-uid="magic-host"]').first();
        const magicMissile = page.locator('[data-attached-action-uid="magic-missile-1"]').first();
        const lowTarget = page.locator('[data-minion-uid="magic-low-target"]').first();
        const highTarget = page.locator('[data-minion-uid="magic-high-target"]').first();
        await expect(host).toBeVisible({ timeout: 15000 });
        await expect(lowTarget).toBeVisible({ timeout: 15000 });
        await expect(highTarget).toBeVisible({ timeout: 15000 });
        await host.hover();
        await expect(magicMissile).toBeVisible({ timeout: 15000 });
        await game.screenshot('25-魔法导弹附着行动可点击', testInfo);

        await magicMissile.click({ force: true });
        const magnifyOverlay = page.getByTestId('su-card-magnify-overlay');
        if (await magnifyOverlay.isVisible().catch(() => false)) {
            await magnifyOverlay.click({ position: { x: 10, y: 10 }, force: true });
            await expect(magnifyOverlay).toBeHidden({ timeout: 1000 });
        }
        await game.waitForInteraction('munchkin_treasure_magic_missile_destroy', 10000);
        await expect.poll(async () => {
            const options = await game.getInteractionOptions() as InteractionOption[];
            return options.map(option => option.value?.minionUid).filter(Boolean);
        }, { timeout: 10000 }).toEqual(['magic-low-target']);
        await game.screenshot('26-魔法导弹选择低力仆从', testInfo);

        const lowTargetBox = await lowTarget.boundingBox();
        expect(lowTargetBox, '魔法导弹低力目标仆从应有可点击的露出卡面').not.toBeNull();
        await page.mouse.click(
            lowTargetBox!.x + Math.max(8, lowTargetBox!.width * 0.18),
            lowTargetBox!.y + lowTargetBox!.height * 0.55,
        );
        await game.waitForNoInteraction(10000);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const hostState = core.bases[0].minions.find(minion => minion.uid === 'magic-host');
            return {
                base0MinionUids: core.bases[0].minions.map(minion => minion.uid),
                hostAttachedActionUids: hostState?.attachedActions?.map(action => action.uid) ?? [],
                player0DiscardDefIds: core.players?.['0']?.discard?.map(card => card.defId) ?? [],
                player1DiscardDefIds: core.players?.['1']?.discard?.map(card => card.defId) ?? [],
                treasureDeck: core.treasureDeck ?? [],
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            base0MinionUids: ['magic-host', 'magic-high-target'],
            hostAttachedActionUids: [],
            player0DiscardDefIds: [],
            player1DiscardDefIds: ['alien_invader'],
            treasureDeck: [
                'munchkin_treasure_wishing_ring',
                'munchkin_treasure_magic_missile',
            ],
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });

        await expect(page.locator('[data-minion-uid="magic-low-target"]')).toHaveCount(0);
        await expect(highTarget).toBeVisible({ timeout: 10000 });
        await game.screenshot('27-魔法导弹摧毁后状态', testInfo);
    });

    test('许愿指环可从手牌打出并获得 1VP 后回公共宝藏牌库底', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinWishingRingScene());
        await hideSmashUpDebugPanelForEvidence(page);

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="wishing-ring-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-score-vp-0')).toHaveText('2');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 1');
        await game.screenshot('28-许愿指环手牌与当前VP', testInfo);

        await game.playCard('munchkin_treasure_wishing_ring');
        await game.waitForNoInteraction(10000);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            return {
                player0Vp: core.players?.['0']?.vp ?? 0,
                player0HandUids: core.players?.['0']?.hand?.map(card => card.uid) ?? [],
                player0DiscardDefIds: core.players?.['0']?.discard?.map(card => card.defId) ?? [],
                player0ActionsPlayed: core.players?.['0']?.actionsPlayed ?? 0,
                treasureDeck: core.treasureDeck ?? [],
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            player0Vp: 3,
            player0HandUids: [],
            player0DiscardDefIds: [],
            player0ActionsPlayed: 1,
            treasureDeck: [
                'munchkin_treasure_dwarf_hireling',
                'munchkin_treasure_wishing_ring',
            ],
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await waitForSmashUpFxToSettle(page);
        await expect(page.getByTestId('su-score-vp-0')).toHaveText('3');
        await expect(page.locator('[data-card-uid="wishing-ring-1"]')).toHaveCount(0);
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 2');
        await game.screenshot('29-许愿指环结算后VP与公共宝藏牌堆', testInfo);
    });

    test('探宝棒可从手牌打出并抽两张宝藏后重洗公共宝藏弃牌', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinTreasureFinderScene());
        await hideSmashUpDebugPanelForEvidence(page);

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="treasure-finder-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 3');
        await game.screenshot('30-探宝棒手牌与公共宝藏牌堆', testInfo);

        await page.locator('[data-card-uid="treasure-finder-1"]').first().click({ force: true });
        await page.locator('[data-card-uid="treasure-finder-1"]').first().click({ force: true });
        await game.waitForNoInteraction(10000);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            return {
                player0HandDefIds: core.players?.['0']?.hand?.map(card => card.defId) ?? [],
                player0HandUids: core.players?.['0']?.hand?.map(card => card.uid) ?? [],
                player0DiscardDefIds: core.players?.['0']?.discard?.map(card => card.defId) ?? [],
                player0ActionsPlayed: core.players?.['0']?.actionsPlayed ?? 0,
                treasureDiscard: core.treasureDiscard ?? [],
                treasureDeck: core.treasureDeck ?? [],
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            player0HandDefIds: [
                'munchkin_treasure_dwarf_hireling',
                'munchkin_treasure_halfling_hireling',
            ],
            player0HandUids: [
                'munchkin_treasure_1700',
                'munchkin_treasure_1701',
            ],
            player0DiscardDefIds: [],
            player0ActionsPlayed: 1,
            treasureDiscard: [],
            treasureDeck: [
                'munchkin_treasure_tiger_steed',
                'munchkin_treasure_treasure_finder',
                'munchkin_treasure_magic_missile',
                'munchkin_treasure_wishing_ring',
            ],
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await waitForSmashUpFxToSettle(page);
        await expect(page.locator('[data-card-uid="treasure-finder-1"]')).toHaveCount(0);
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 4');
        await game.screenshot('31-探宝棒结算后手牌与公共宝藏牌堆', testInfo);
    });

    test('十字弓可从手牌打出并选择基地和派系批量加力量', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinCrossbowScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="crossbow-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="crossbow-pirate-a"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="crossbow-pirate-b"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="crossbow-alien-a"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('32-十字弓手牌与目标基地', testInfo);

        await game.playCard('munchkin_treasure_crossbow', { targetBaseIndex: 0 });
        await game.waitForInteraction('munchkin_treasure_crossbow_choose_faction', 10000);
        await game.screenshot('33-十字弓选择目标派系', testInfo);

        await game.selectInteractionOptionBy(
            (option: InteractionOption) => option.value?.factionId === 'pirates',
            '十字弓目标派系',
        );
        await game.waitForNoInteraction(10000);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const base0Temps = Object.fromEntries(core.bases[0].minions.map(minion => [
                minion.uid,
                minion.tempPowerModifier ?? 0,
            ]));
            const base1Temps = Object.fromEntries(core.bases[1].minions.map(minion => [
                minion.uid,
                minion.tempPowerModifier ?? 0,
            ]));
            return {
                base0Temps,
                base1Temps,
                player0DiscardDefIds: core.players?.['0']?.discard?.map(card => card.defId) ?? [],
                player0ActionsPlayed: core.players?.['0']?.actionsPlayed ?? 0,
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            base0Temps: {
                'crossbow-pirate-a': 2,
                'crossbow-pirate-b': 2,
                'crossbow-alien-a': 0,
            },
            base1Temps: {
                'crossbow-pirate-away': 0,
            },
            player0DiscardDefIds: ['munchkin_treasure_crossbow'],
            player0ActionsPlayed: 1,
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await game.screenshot('34-十字弓结算后目标派系加力量', testInfo);
    });

    test('一袋铁蒺藜可在对手打出低力随从到本基地时摧毁双方', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinBagOfCaltropsScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="caltrops-target-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-ongoing-uid="caltrops-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('35-一袋铁蒺藜触发前基地与对手手牌', testInfo);

        await game.playCard('pirate_first_mate', { targetBaseIndex: 0 });
        await game.waitForNoInteraction(10000);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            return {
                base0MinionUids: core.bases[0].minions.map(minion => minion.uid),
                base0OngoingUids: core.bases[0].ongoingActions?.map(action => action.uid) ?? [],
                player0DiscardDefIds: core.players?.['0']?.discard?.map(card => card.defId) ?? [],
                player1DiscardDefIds: core.players?.['1']?.discard?.map(card => card.defId) ?? [],
                player1MinionsPlayed: core.players?.['1']?.minionsPlayed ?? 0,
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            base0MinionUids: [],
            base0OngoingUids: [],
            player0DiscardDefIds: ['munchkin_treasure_bag_of_caltrops'],
            player1DiscardDefIds: ['pirate_first_mate'],
            player1MinionsPlayed: 1,
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await expect(page.locator('[data-card-uid="caltrops-target-1"]')).toHaveCount(0);
        await expect(page.locator('[data-ongoing-uid="caltrops-1"]')).toHaveCount(0);
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await waitForSmashUpFxToSettle(page);
        await game.screenshot('36-一袋铁蒺藜触发后双方进弃牌', testInfo);
    });

    test('愚蠢勇气药水可从手牌打出并给目标随从本回合加力量', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinPotionOfIdioticBraveryScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="idiotic-bravery-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="bravery-target"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="bravery-bystander"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('37-愚蠢勇气药水手牌与目标随从', testInfo);

        await game.playCard('munchkin_treasure_potion_of_idiotic_bravery', {
            targetMinionUid: 'bravery-target',
        });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);
        await expect(page.getByText('请选择一个随从来附着此卡')).toHaveCount(0);
        await expect(page.getByText('请选择一个目标随从')).toHaveCount(0);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const base0Temps = Object.fromEntries(core.bases[0].minions.map(minion => [
                minion.uid,
                minion.tempPowerModifier ?? 0,
            ]));
            return {
                base0Temps,
                player0HandUids: core.players?.['0']?.hand?.map(card => card.uid) ?? [],
                player0DiscardDefIds: core.players?.['0']?.discard?.map(card => card.defId) ?? [],
                player0ActionsPlayed: core.players?.['0']?.actionsPlayed ?? 0,
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            base0Temps: {
                'bravery-target': 3,
                'bravery-bystander': 0,
            },
            player0HandUids: [],
            player0DiscardDefIds: ['munchkin_treasure_potion_of_idiotic_bravery'],
            player0ActionsPlayed: 1,
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await expect(page.locator('[data-card-uid="idiotic-bravery-1"]')).toHaveCount(0);
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('38-愚蠢勇气药水结算后力量加成', testInfo);
    });

    test('地牢规则书可从手牌打出并点击基地行动作为摧毁目标', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinDungeonRulebookScene());
        await hideSmashUpDebugPanelForEvidence(page);

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        const rulebook = page.locator('[data-card-uid="dungeon-rulebook-1"]').first();
        const targetAction = page.locator('[data-ongoing-uid="dungeon-target-action-1"]').first();
        await expect(rulebook).toBeVisible({ timeout: 15000 });
        await expect(targetAction).toBeVisible({ timeout: 15000 });
        await game.screenshot('09-地牢规则书手牌与目标行动', testInfo);

        await rulebook.click({ force: true });
        await rulebook.click({ force: true });
        await game.waitForInteraction('munchkin_treasure_dungeon_rulebook_destroy', 10000);
        await game.screenshot('10-地牢规则书选择要摧毁的行动', testInfo);

        await targetAction.click({ force: true });
        await game.waitForNoInteraction(10000);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            return {
                remainingOngoingUids: core.bases[0].ongoingActions?.map(action => action.uid) ?? [],
                player0HandUids: core.players?.['0']?.hand?.map(card => card.uid) ?? [],
                player0DiscardDefIds: core.players?.['0']?.discard?.map(card => card.defId) ?? [],
                player1DiscardDefIds: core.players?.['1']?.discard?.map(card => card.defId) ?? [],
                triggerQueueLength: core.triggerQueue?.length ?? 0,
            };
        }, { timeout: 10000 }).toEqual({
            remainingOngoingUids: [],
            player0HandUids: [],
            player0DiscardDefIds: ['munchkin_treasure_dungeon_rulebook'],
            player1DiscardDefIds: ['zombie_overrun'],
            triggerQueueLength: 0,
        });

        await waitForSmashUpFxToSettle(page);
        await game.screenshot('11-地牢规则书摧毁行动后状态', testInfo);
    });

    test('矮人王可把己方宿主身上被摧毁的宝藏回收到手牌', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinDwarfKingRecoveryScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        const rulebook = page.locator('[data-card-uid="dwarf-king-rulebook-1"]').first();
        const king = page.locator('[data-minion-uid="dwarf-king-e2e"]').first();
        const host = page.locator('[data-minion-uid="dwarf-king-host"]').first();
        const attachedTreasure = page.locator('[data-attached-action-uid="dwarf-king-spiky-boots"]').first();
        await expect(rulebook).toBeVisible({ timeout: 15000 });
        await expect(king).toBeVisible({ timeout: 15000 });
        await expect(host).toBeVisible({ timeout: 15000 });
        await host.hover();
        await expect(attachedTreasure).toBeVisible({ timeout: 15000 });
        await game.screenshot('57-矮人王回收前宿主宝藏与地牢规则书', testInfo);

        await rulebook.click({ force: true });
        await rulebook.click({ force: true });
        await game.waitForInteraction('munchkin_treasure_dungeon_rulebook_destroy', 10000);
        await host.hover();
        await expect(attachedTreasure).toBeVisible({ timeout: 15000 });
        await game.screenshot('58-矮人王选择要摧毁的宿主宝藏', testInfo);

        await attachedTreasure.click({ force: true });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            const hostState = core.bases[0].minions.find(minion => minion.uid === 'dwarf-king-host');
            return {
                hostAttachedUids: hostState?.attachedActions?.map(action => action.uid) ?? [],
                player0HandUids: core.players?.['0']?.hand?.map(card => card.uid) ?? [],
                player0DiscardDefIds: core.players?.['0']?.discard?.map(card => card.defId) ?? [],
                player1DiscardUids: core.players?.['1']?.discard?.map(card => card.uid) ?? [],
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            hostAttachedUids: [],
            player0HandUids: ['dwarf-king-spiky-boots'],
            player0DiscardDefIds: ['munchkin_treasure_dungeon_rulebook'],
            player1DiscardUids: [],
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });

        await expect(page.locator('[data-card-uid="dwarf-king-spiky-boots"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-attached-action-uid="dwarf-king-spiky-boots"]')).toHaveCount(0);
        await expect(page.getByTestId('su-munchkin-monster-supply-count')).toHaveText('x 20');
        await expect(page.getByTestId('su-munchkin-treasure-supply-count')).toHaveText('x 22');
        await game.screenshot('59-矮人王回收宝藏后进入手牌', testInfo);
    });

    test('口臭药水可从手牌打出并点击被选玩家的仆从移动', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinHalitosisPotionScene());
        await hideSmashUpDebugPanelForEvidence(page);

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        const potion = page.locator('[data-card-uid="halitosis-1"]').first();
        const sourceBase = page.locator('[data-base-index="0"]').first();
        const movingMinion = page.locator('[data-minion-uid="halitosis-runner"]').first();
        await expect(potion).toBeVisible({ timeout: 15000 });
        await expect(sourceBase).toBeVisible({ timeout: 15000 });
        await expect(movingMinion).toBeVisible({ timeout: 15000 });
        await game.screenshot('12-口臭药水手牌与目标基地', testInfo);

        await potion.click({ force: true });
        await sourceBase.click({ force: true });
        await game.waitForInteraction('munchkin_treasure_potion_of_halitosis_choose_player', 10000);
        await game.screenshot('13-口臭药水选择玩家', testInfo);

        await game.selectInteractionOptionBy(
            (option: { value?: { playerId?: string } }) => option?.value?.playerId === '0',
            '口臭药水选择自己',
        );
        await game.waitForInteraction('munchkin_treasure_potion_of_halitosis_move', 10000);
        await game.screenshot('14-口臭药水点击己方仆从移动', testInfo);

        await movingMinion.click({ force: true });
        await game.waitForNoInteraction(10000);

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as RocketBootsCoreState;
            return {
                sourceMinionUids: core.bases[0].minions.map(minion => minion.uid),
                targetMinionUids: core.bases[1].minions.map(minion => minion.uid),
                player0HandUids: core.players?.['0']?.hand?.map(card => card.uid) ?? [],
                player0DiscardDefIds: core.players?.['0']?.discard?.map(card => card.defId) ?? [],
                player0ActionsPlayed: core.players?.['0']?.actionsPlayed ?? 0,
                triggerQueueLength: core.triggerQueue?.length ?? 0,
            };
        }, { timeout: 10000 }).toEqual({
            sourceMinionUids: ['halitosis-enemy'],
            targetMinionUids: ['halitosis-destination-ally', 'halitosis-runner'],
            player0HandUids: [],
            player0DiscardDefIds: ['munchkin_treasure_potion_of_halitosis'],
            player0ActionsPlayed: 1,
            triggerQueueLength: 0,
        });

        await waitForSmashUpFxToSettle(page);
        await game.screenshot('15-口臭药水移动后状态', testInfo);
    });

    test('直线跑路药水可从计分后响应窗口选择已展示宝藏进手牌', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinStraightLineRunningAwayScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="straight-line-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-monster-uid="straight-line-treasure-dragon"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('16-直线跑路药水计分前手牌与宝藏龙', testInfo);

        await game.advancePhase();
        await game.waitForPhase('scoreBases', 10000);

        await page.waitForFunction(
            () => {
                const state = (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.();
                return state?.core?.pendingMunchkinTreasureReward?.treasureCards?.length === 3
                    && (
                        state?.sys?.interaction?.current?.data?.sourceId === 'smashup_reaction_choose'
                        || Boolean(state?.sys?.responseWindow?.current?.windowType)
                    );
            },
            { timeout: 15000, polling: 200 },
        );

        for (let attempt = 0; attempt < 8; attempt += 1) {
            const status = await getReactionWindowStatus(page);
            const options = status.sourceId === 'smashup_reaction_choose'
                ? await game.getInteractionOptions() as InteractionOption[]
                : [];
            const hasStraightLineOption = status.windowType === 'afterScoring'
                && options.some((option) =>
                    option.value?.kind === 'play_action'
                    && option.value?.cardUid === 'straight-line-1'
                );
            if (hasStraightLineOption) break;

            const didPass = await passOpenReactionOrResponseWindow(page, game, `直线跑路药水前置响应让过 ${attempt + 1}`);
            expect(didPass, '等待 afterScoring 直线跑路药水入口期间必须存在可让过的响应').toBe(true);
            await page.waitForTimeout(300);
        }

        await expect.poll(async () => {
            const status = await getReactionWindowStatus(page);
            const options = status.sourceId === 'smashup_reaction_choose'
                ? await game.getInteractionOptions() as InteractionOption[]
                : [];
            return {
                windowType: status.windowType,
                hasStraightLineOption: options.some((option) =>
                    option.value?.kind === 'play_action'
                    && option.value?.cardUid === 'straight-line-1'
                ),
            };
        }, { timeout: 10000 }).toEqual({
            windowType: 'afterScoring',
            hasStraightLineOption: true,
        });
        await game.screenshot('17-直线跑路药水afterScoring响应入口', testInfo);

        await game.selectInteractionOptionBy(
            (option: InteractionOption) =>
                option.value?.kind === 'play_action'
                && option.value?.cardUid === 'straight-line-1',
            'afterScoring 选择直线跑路药水',
        );
        await game.waitForInteraction('munchkin_treasure_potion_of_straight_line_running_away_choose_treasure', 10000);
        await game.screenshot('18-直线跑路药水选择已展示宝藏', testInfo);

        await game.selectInteractionOptionBy(
            (option: InteractionOption) =>
                option.value?.treasureDefId === 'munchkin_treasure_bag_of_caltrops',
            '直线跑路药水选择一袋铁蒺藜',
        );

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as StraightLineRunningAwayCoreState;
            const player0HandDefIds = core.players?.['0']?.hand?.map(card => card.defId) ?? [];
            const player0DiscardDefIds = core.players?.['0']?.discard?.map(card => card.defId) ?? [];
            return {
                pendingTreasureReward: core.pendingMunchkinTreasureReward ?? null,
                player0TreasureHandDefIds: player0HandDefIds.filter(defId => defId.startsWith('munchkin_treasure_')),
                player0DiscardHasPotion: player0DiscardDefIds.includes('munchkin_treasure_potion_of_straight_line_running_away'),
                treasureDeck: core.treasureDeck ?? [],
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 15000 }).toEqual({
            pendingTreasureReward: null,
            player0TreasureHandDefIds: [
                'munchkin_treasure_bag_of_caltrops',
                'munchkin_treasure_dwarf_hireling',
                'munchkin_treasure_wishing_ring',
            ],
            player0DiscardHasPotion: true,
            treasureDeck: ['munchkin_treasure_tiger_steed'],
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });
        await game.screenshot('19-直线跑路药水计分收口后状态', testInfo);
    });

    test('麻痹药水可从计分前响应窗口取消正在计分基地上的牌能力', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinParalysisPotionScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="paralysis-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="paralysis-hero"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('20-麻痹药水计分前手牌与目标基地', testInfo);

        await game.advancePhase();
        await game.waitForPhase('scoreBases', 10000);

        await page.waitForFunction(
            () => {
                const state = (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.();
                return state?.sys?.phase === 'scoreBases'
                    && state?.sys?.responseWindow?.current?.windowType === 'meFirst'
                    && state?.sys?.interaction?.current?.data?.sourceId === 'smashup_reaction_choose';
            },
            { timeout: 15000, polling: 200 },
        );

        await expect.poll(async () => {
            const options = await game.getInteractionOptions() as InteractionOption[];
            return {
                hasParalysisOption: options.some((option) =>
                    option.value?.kind === 'play_action'
                    && option.value?.cardUid === 'paralysis-1'
                    && option.value?.targetBaseIndex === 0
                ),
            };
        }, { timeout: 10000 }).toEqual({ hasParalysisOption: true });
        await game.screenshot('21-麻痹药水beforeScoring响应入口', testInfo);

        await clickVisibleInteractionOptionBy(
            page,
            game,
            (option: InteractionOption) =>
                option.value?.kind === 'play_action'
                && option.value?.cardUid === 'paralysis-1'
                && option.value?.targetBaseIndex === 0,
            '桌面 beforeScoring 手动选择麻痹药水',
        );

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as ParalysisCoreState;
            const suppressionEvent = [...(state.sys?.eventStream?.entries ?? [])]
                .map(entry => entry.event)
                .find(event => event?.type === 'su:cards_suppressed_until_turn_end'
                    && event?.payload?.reason === 'munchkin_treasure_potion_of_paralysis');
            const suppressedCardUids = suppressionEvent?.payload?.cardUids ?? [];
            const player0DiscardDefIds = core.players?.['0']?.discard?.map(card => card.defId) ?? [];
            return {
                suppressionBaseIndex: suppressionEvent?.payload?.baseIndex ?? null,
                suppressedCardUids,
                suppressedAwayAction: suppressedCardUids.includes('paralysis-away-action'),
                suppressedAwayMinion: suppressedCardUids.includes('paralysis-away-minion'),
                player0DiscardHasPotion: player0DiscardDefIds.includes('munchkin_treasure_potion_of_paralysis'),
                suppressionStillActiveAfterTurnAdvance: (core.suppressedCardUidsUntilTurnEnd ?? []).length > 0,
                turnNumber: core.turnNumber,
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
            };
        }, { timeout: 10000 }).toEqual({
            suppressionBaseIndex: 0,
            suppressedCardUids: [
                'paralysis-base-action',
                'paralysis-hero',
                'paralysis-rocket-boots',
                'paralysis-ally',
            ],
            suppressedAwayAction: false,
            suppressedAwayMinion: false,
            player0DiscardHasPotion: true,
            suppressionStillActiveAfterTurnAdvance: false,
            turnNumber: 12,
            triggerQueueLength: 0,
            responseWindowType: null,
            interactionSourceId: null,
        });
        await game.screenshot('22-麻痹药水计分收口后状态', testInfo);
    });

    test('时间错乱的喷气背包可在真实计分清场队列中让宿主回手牌', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinTemporalDisplacementJetpackScene());

        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        const host = page.locator('[data-minion-uid="jetpack-host"]').first();
        const jetpack = page.locator('[data-attached-action-uid="temporal-jetpack-1"]').first();
        await expect(host).toBeVisible({ timeout: 15000 });
        await host.hover();
        await expect(jetpack).toBeVisible({ timeout: 15000 });
        await game.screenshot('23-时间错乱的喷气背包计分前宿主', testInfo);

        await game.advancePhase();
        await game.waitForPhase('scoreBases', 10000);

        for (let attempt = 0; attempt < 12; attempt += 1) {
            const state = await game.getState();
            const core = state.core as TemporalJetpackCoreState;
            const player0HandUids = core.players?.['0']?.hand?.map(card => card.uid) ?? [];
            const player0DiscardUids = core.players?.['0']?.discard?.map(card => card.uid) ?? [];
            const hostReturned = player0HandUids.includes('jetpack-host')
                && player0DiscardUids.includes('temporal-jetpack-1');
            if (hostReturned && state.sys?.phase === 'playCards') break;

            const didPass = await passOpenReactionOrResponseWindow(page, game, `时间错乱的喷气背包计分响应让过 ${attempt + 1}`);
            if (!didPass) await page.waitForTimeout(500);
        }

        await expect.poll(async () => {
            const state = await game.getState();
            const core = state.core as TemporalJetpackCoreState;
            const player0Hand = core.players?.['0']?.hand ?? [];
            const player0Discard = core.players?.['0']?.discard ?? [];
            const player1Discard = core.players?.['1']?.discard ?? [];
            const events = (state.sys?.eventStream?.entries ?? []).map((entry: EventStreamEntry) => entry.event);
            const queued = events.find((event) =>
                event?.type === 'su:trigger_queued'
                && event?.payload?.triggers?.some((trigger) =>
                    trigger.sourceDefId === 'munchkin_treasure_temporal_displacement_jetpack'
                    && trigger.timing === 'onMinionDiscardedFromBase'
                    && trigger.triggerMinionUid === 'jetpack-host'
                )
            );
            const returned = events.find((event) =>
                event?.type === 'su:minion_returned'
                && event?.payload?.reason === 'munchkin_treasure_temporal_displacement_jetpack'
                && event?.payload?.minionUid === 'jetpack-host'
            );

            return {
                phase: state.sys?.phase,
                player0HandHasReturnedHost: player0Hand.some(card =>
                    card.uid === 'jetpack-host'
                    && card.defId === 'munchkin_warriors_big_hero'
                ),
                player0HandHostCount: player0Hand.filter(card => card.uid === 'jetpack-host').length,
                player0DiscardHasHost: player0Discard.some(card => card.uid === 'jetpack-host'),
                player0DiscardHasJetpack: player0Discard.some(card =>
                    card.uid === 'temporal-jetpack-1'
                    && card.defId === 'munchkin_treasure_temporal_displacement_jetpack'
                ),
                player1DiscardDefIds: player1Discard.map(card => card.defId),
                hostStillOnBase: core.bases.some(base => base.minions.some(minion => minion.uid === 'jetpack-host')),
                triggerQueuedForJetpack: Boolean(queued),
                returnedByJetpack: Boolean(returned),
                triggerQueueLength: core.triggerQueue?.length ?? 0,
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
            };
        }, { timeout: 15000 }).toEqual({
            phase: 'playCards',
            player0HandHasReturnedHost: true,
            player0HandHostCount: 1,
            player0DiscardHasHost: false,
            player0DiscardHasJetpack: true,
            player1DiscardDefIds: ['alien_invader'],
            hostStillOnBase: false,
            triggerQueuedForJetpack: true,
            returnedByJetpack: true,
            triggerQueueLength: 0,
            interactionSourceId: null,
            responseWindowType: null,
        });

        await game.screenshot('24-时间错乱的喷气背包回手牌后状态', testInfo);
    });

    test('木精灵花之子先选玩家再选随从', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true, seat1: 'human' }, 20000);
        await game.setupScene(buildMunchkinElvesFlowerChildScene());

        await expect(page.locator('[data-card-uid="elves-flower-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="elves-flower-weak"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="elves-flower-strong"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('木精灵-花之子-打出前', testInfo);

        await game.playCard('munchkin_elves_flower_child', { targetBaseIndex: 0 });
        await game.waitForInteraction('munchkin_elves_flower_child_choose_player', 10000);
        await waitForSmashUpFxToSettle(page);
        await expectVisibleInteractionOptionBy(
            page,
            game,
            option => option.value?.targetPlayerId === '1',
            '花之子第一步应显示另一位玩家选项',
        );
        await game.screenshot('木精灵-花之子-手动选择玩家', testInfo);

        await clickVisibleInteractionOptionBy(
            page,
            game,
            option => option.value?.targetPlayerId === '1',
            '花之子选择另一位玩家',
        );
        await game.waitForInteraction('munchkin_elves_flower_child_choose_minion', 10000);
        await waitForSmashUpFxToSettle(page);
        await expectManualMinionChoiceVisible(
            page,
            'elves-flower-weak',
            '花之子第二步应显示对方力量不超过 3 的随从本体',
            { forbidPromptContext: true },
        );
        const flowerOptions = await game.getInteractionOptions() as InteractionOption[];
        expect(flowerOptions.some(option => option.value?.minionUid === 'elves-flower-weak')).toBe(true);
        expect(flowerOptions.some(option => option.value?.minionUid === 'elves-flower-strong')).toBe(false);
        await game.screenshot('木精灵-花之子-手动选择力量不超过3的随从', testInfo);

        await clickManualMinionChoice(page, 'elves-flower-weak', '花之子选择对方随从');
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        const state = await game.getState();
        const minions = state.core.bases[0].minions;
        expect(minions.find((entry: any) => entry.uid === 'elves-flower-1')?.controller).toBe('1');
        expect(minions.find((entry: any) => entry.uid === 'elves-flower-weak')?.controller).toBe('0');
        expect(minions.find((entry: any) => entry.uid === 'elves-flower-strong')?.controller).toBe('1');
        await game.screenshot('木精灵-花之子-控制权交换后', testInfo);
    });

    test('木精灵力量训练按玩家、对方随从、己方随从顺序手动选择', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true, seat1: 'human' }, 20000);
        await game.setupScene(buildMunchkinElvesPumpingIronScene());

        const targetPage = await openSmashUpPlayerView(page, '1');
        try {

            await expect(page.locator('[data-card-uid="elves-pumping-1"]').first()).toBeVisible({ timeout: 15000 });
            await expect(page.locator('[data-minion-uid="elves-pumping-self"]').first()).toBeVisible({ timeout: 15000 });
            await expect(page.locator('[data-minion-uid="elves-pumping-other"]').first()).toBeVisible({ timeout: 15000 });
            await game.playCard('munchkin_elves_pumping_iron');

            await game.waitForInteraction('munchkin_elves_pumping_iron_choose_player', 10000);
            await waitForSmashUpFxToSettle(page);
            await expectVisibleInteractionOptionBy(
                page,
                game,
                option => option.value?.targetPlayerId === '1',
                '力量训练第一步应显示另一位玩家选项',
            );
            await game.screenshot('木精灵-力量训练-手动选择玩家', testInfo);
            await clickVisibleInteractionOptionBy(
                page,
                game,
                option => option.value?.targetPlayerId === '1',
                '力量训练选择另一位玩家',
            );

            const otherPlayerState = await game.getState();
            await mirrorSmashUpHarnessState(targetPage, otherPlayerState);
            await targetPage.waitForFunction(
                () => (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.()?.sys?.interaction?.current?.data?.sourceId
                    === 'munchkin_elves_pumping_iron_choose_other_minion',
                { timeout: 10000, polling: 200 },
            );
            await waitForSmashUpFxToSettle(targetPage);
            await expectManualMinionChoiceVisible(
                targetPage,
                'elves-pumping-other',
                '力量训练第二步应显示对方选择的随从本体',
                { forbidPromptContext: true },
            );
            await saveMunchkinEvidenceScreenshot(targetPage, '力量训练-P2-对方手动选择随从.png');
            await clickManualMinionChoice(targetPage, 'elves-pumping-other', '力量训练选择对方随从');

            const selfPlayerState = await targetPage.evaluate(() => (
                (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.()
            ));
            await mirrorSmashUpHarnessState(page, selfPlayerState);
            await game.waitForInteraction('munchkin_elves_pumping_iron_choose_self_minion', 10000);
            await waitForSmashUpFxToSettle(page);
            await expectManualMinionChoiceVisible(
                page,
                'elves-pumping-self',
                '力量训练第三步应显示己方选择的随从本体',
                { forbidPromptContext: true },
            );
            await game.screenshot('木精灵-力量训练-己方手动选择随从', testInfo);
            await clickManualMinionChoice(page, 'elves-pumping-self', '力量训练选择己方随从');
            await game.waitForNoInteraction(10000);
            await waitForSmashUpFxToSettle(page);

            const state = await game.getState();
            const minions = state.core.bases[0].minions;
            expect(minions.find((entry: any) => entry.uid === 'elves-pumping-other')?.tempPowerModifier).toBe(2);
            expect(minions.find((entry: any) => entry.uid === 'elves-pumping-self')?.tempPowerModifier).toBe(3);
            await game.screenshot('木精灵-力量训练-结算后', testInfo);
        } finally {
            await targetPage.close();
        }
    });

    test('木精灵贸易把正在打出的行动卡交给目标玩家，并把对方手牌换回己方', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true, seat1: 'human' }, 20000);
        await game.setupScene(buildMunchkinElvesTradeScene());

        const targetPage = await openSmashUpPlayerView(page, '1');
        try {
            await expect(page.locator('[data-card-uid="elves-trade-1"]').first()).toBeVisible({ timeout: 15000 });
            await expect(page.locator('[data-card-uid="elves-trade-keep"]').first()).toBeVisible({ timeout: 15000 });
            await game.screenshot('木精灵-贸易-打出前双方手牌', testInfo);

            await game.playCard('munchkin_elves_trade');
            await game.waitForInteraction('munchkin_elves_trade_choose_player', 10000);
            await waitForSmashUpFxToSettle(page);
            await expectVisibleInteractionOptionBy(
                page,
                game,
                option => option.value?.targetPlayerId === '1',
                '贸易应显示有手牌的目标玩家选项',
            );
            await game.screenshot('木精灵-贸易-手动选择目标玩家', testInfo);

            await clickVisibleInteractionOptionBy(
                page,
                game,
                option => option.value?.targetPlayerId === '1',
                '贸易选择目标玩家',
            );
            await game.waitForNoInteraction(10000);
            await waitForSmashUpFxToSettle(page);

            const state = await game.getState();
            const player0 = state.core.players['0'];
            const player1 = state.core.players['1'];
            expect(player0.hand.map((card: any) => card.uid)).toEqual(expect.arrayContaining(['elves-trade-keep', 'elves-trade-target']));
            expect(player0.hand.map((card: any) => card.uid)).not.toContain('elves-trade-1');
            expect(player1.hand.map((card: any) => card.uid)).toEqual(['elves-trade-1']);
            expect(player0.actionLimit).toBe(2);
            expect(player0.actionsPlayed).toBe(1);
            expect(state.sys?.interaction?.current).toBeUndefined();
            expect(state.sys?.responseWindow?.current).toBeUndefined();

            await mirrorSmashUpHarnessState(targetPage, state);
            await waitForSmashUpFxToSettle(targetPage);
            await waitForSmashUpHandCardToSettle(targetPage, handCardSelector('elves-trade-1'));
            await saveMunchkinEvidenceScreenshot(targetPage, '贸易-P2-收到贸易行动卡.png');
            await game.screenshot('木精灵-贸易-交换结算后', testInfo);
        } finally {
            await targetPage.close();
        }
    });

    test('木精灵优雅贵族天赋手动选择另一位玩家并让双方各抽一张', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true, seat1: 'human' }, 20000);
        await game.setupScene(buildMunchkinElvesLordOfThePranceScene());

        const lord = page.locator('[data-minion-uid="elves-lord-1"]').first();
        await expect(lord).toBeVisible({ timeout: 15000 });
        await game.screenshot('木精灵-优雅贵族-天赋前', testInfo);
        await lord.click({ force: true });
        await game.waitForInteraction('munchkin_elves_lord_of_the_prance_choose_player', 10000);
        await waitForSmashUpFxToSettle(page);
        await expectVisibleInteractionOptionBy(
            page,
            game,
            option => option.value?.targetPlayerId === '1',
            '优雅贵族应显示另一位玩家选项',
        );
        await game.screenshot('木精灵-优雅贵族-手动选择另一位玩家', testInfo);
        await clickVisibleInteractionOptionBy(
            page,
            game,
            option => option.value?.targetPlayerId === '1',
            '优雅贵族选择另一位玩家',
        );
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        const state = await game.getState();
        expect(state.core.players['0'].hand.map((card: any) => card.uid)).toEqual(['elves-lord-draw-1']);
        expect(state.core.players['1'].hand.map((card: any) => card.uid)).toEqual(['elves-lord-target-draw-1']);
        expect(state.core.bases[0].minions.find((entry: any) => entry.uid === 'elves-lord-1')?.talentUsed).toBe(true);
        await game.screenshot('木精灵-优雅贵族-双方抽牌后', testInfo);
    });

    test('木精灵精灵帮助大师天赋只给同基地对手随从临时加力', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true, seat1: 'human' }, 20000);
        await game.setupScene(buildMunchkinElvesHelpGuruScene());

        const guru = page.locator('[data-minion-uid="elves-guru-1"]').first();
        await expect(guru).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="elves-guru-opponent"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="elves-guru-other-base"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('木精灵-精灵帮助大师-天赋前', testInfo);
        await guru.click({ force: true });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        const state = await game.getState();
        const sameBaseOpponent = state.core.bases[0].minions.find((entry: any) => entry.uid === 'elves-guru-opponent');
        const otherBaseOpponent = state.core.bases[1].minions.find((entry: any) => entry.uid === 'elves-guru-other-base');
        expect(sameBaseOpponent?.tempPowerModifier).toBe(1);
        expect(otherBaseOpponent?.tempPowerModifier ?? 0).toBe(0);
        expect(state.core.bases[0].minions.find((entry: any) => entry.uid === 'elves-guru-1')?.tempPowerModifier ?? 0).toBe(0);
        await expect(page.getByTestId('su-minion-used-badge-elves-guru-1')).toBeVisible({ timeout: 10000 });
        await game.screenshot('木精灵-精灵帮助大师-同基地对手获得临时力量', testInfo);
    });

    test('木精灵在你之后真实按玩家人数抽牌，并让另一位玩家各抽一张', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true, seat1: 'human' }, 20000);
        await game.setupScene(buildMunchkinElvesAfterYouScene());

        await expect(page.locator('[data-card-uid="elves-after-you-1"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('木精灵-在你之后-打出前', testInfo);
        await game.playCard('munchkin_elves_after_you');
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        const state = await game.getState();
        expect(state.core.players['0'].hand.map((card: any) => card.uid)).toEqual([
            'elves-after-you-draw-1',
            'elves-after-you-draw-2',
        ]);
        expect(state.core.players['1'].hand.map((card: any) => card.uid)).toEqual(['elves-after-you-other-1']);
        expect(state.core.players['0'].discard.map((card: any) => card.defId)).toContain('munchkin_elves_after_you');
        await game.screenshot('木精灵-在你之后-双方抽牌后', testInfo);
    });

    test('木精灵舞动之根真实重洗每位玩家弃牌并从最新牌库抽一张', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true, seat1: 'human' }, 20000);
        await game.setupScene(buildMunchkinElvesDancingRootScene());

        await expect(page.locator('[data-card-uid="elves-dancing-root-1"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('木精灵-舞动之根-打出前', testInfo);
        await game.playCard('munchkin_elves_dancing_root');
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        const state = await game.getState();
        expect(state.core.players['0'].hand.map((card: any) => card.uid)).toContain('elves-root-deck-1');
        expect(state.core.players['0'].discard.map((card: any) => card.defId)).toEqual(['munchkin_elves_dancing_root']);
        expect(state.core.players['1'].discard).toHaveLength(0);
        expect(state.core.players['1'].deck.map((card: any) => card.uid)).toContain('elves-root-other-discard-1');
        await game.screenshot('木精灵-舞动之根-各玩家重洗并抽牌后', testInfo);
    });

    test('木精灵逃跑吧！只有己方随从时手动选择后不产生空的对手随从选择', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true, seat1: 'human' }, 20000);
        await game.setupScene(buildMunchkinElvesRunAwayScene());

        await expect(page.locator('[data-card-uid="elves-run-away-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="elves-run-away-own"]').first()).toBeVisible({ timeout: 15000 });
        await game.advancePhase();
        await waitForMeFirstReactionChoice(page);

        await game.selectInteractionOptionBy(
            option => option.value?.kind === 'play_action'
                && option.value?.cardUid === 'elves-run-away-1'
                && option.value?.targetBaseIndex === 0,
            '逃跑吧选择特殊行动卡',
        );
        await game.waitForInteraction('munchkin_elves_run_away_choose_own_minion', 10000);
        await waitForSmashUpFxToSettle(page);
        await expectManualMinionChoiceVisible(
            page,
            'elves-run-away-own',
            '逃跑吧第一步应显示唯一的己方随从本体',
            { forbidPromptContext: true },
        );
        await expect(page.getByText('选择另一位玩家的随从')).toHaveCount(0);
        await game.screenshot('木精灵-逃跑吧-手动选择己方随从且无对手目标', testInfo);

        await clickManualMinionChoice(page, 'elves-run-away-own', '逃跑吧选择己方随从');
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        await expect.poll(async () => {
            const state = await game.getState();
            return {
                player0HasRunAwayDiscard: state.core.players['0'].discard.some((card: any) => card.defId === 'munchkin_elves_run_away'),
                interactionSourceId: state.sys?.interaction?.current?.data?.sourceId ?? null,
                responseWindowType: state.sys?.responseWindow?.current?.windowType ?? null,
                hasEmptyOpponentPrompt: Boolean(state.sys?.interaction?.current?.data?.sourceId === 'munchkin_elves_run_away_choose_other_minion'),
            };
        }, { timeout: 15000 }).toEqual({
            player0HasRunAwayDiscard: true,
            interactionSourceId: null,
            responseWindowType: null,
            hasEmptyOpponentPrompt: false,
        });
        await game.screenshot('木精灵-逃跑吧-选择后无空第二步', testInfo);
    });

    test('木精灵精灵斗士在对手打出随从后把反应选择交给精灵控制者', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true, seat1: 'human', playerID: '0' }, 20000);
        await game.setupScene(buildMunchkinElvesFaeFighterScene());
        const targetPage = await openSmashUpPlayerView(page, '1');
        try {
            await expect(page.locator('[data-minion-uid="elves-fae-1"]').first()).toBeVisible({ timeout: 15000 });
            await expect(page.locator('[data-minion-uid="elves-fae-ally"]').first()).toBeVisible({ timeout: 15000 });
            const initialState = await game.getState();
            await mirrorSmashUpHarnessState(targetPage, initialState);
            await expect(targetPage.locator('[data-card-uid="elves-fae-played-1"]').first()).toBeVisible({ timeout: 15000 });
            await game.screenshot('木精灵-精灵斗士-对手打出前', testInfo);

            await targetPage.locator('[data-card-uid="elves-fae-played-1"]').first().click({ force: true });
            await targetPage.waitForTimeout(300);
            await targetPage.locator('[data-base-index="0"]').first().click({ force: true });
            await targetPage.waitForFunction(
                () => {
                    const state = (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.();
                    return state?.core?.bases?.[0]?.minions?.some((entry: any) => entry.uid === 'elves-fae-played-1')
                        && state?.sys?.interaction?.current?.data?.sourceId === 'smashup_reaction_choose';
                },
                { timeout: 10000, polling: 200 },
            );
            const queuedState = await targetPage.evaluate(() => (
                (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.()
            ));
            await mirrorSmashUpHarnessState(page, queuedState);
            await page.waitForFunction(
                () => (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.()?.sys?.interaction?.current?.data?.sourceId
                    === 'smashup_reaction_choose',
                { timeout: 10000, polling: 200 },
            );
            await waitForSmashUpFxToSettle(page);
            await chooseReactionBySourceDefId(page, game, 'munchkin_elves_fae_fighter', '精灵斗士选择反应候选');
            await page.waitForFunction(
                () => (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.()?.sys?.interaction?.current?.data?.sourceId
                    === 'munchkin_elves_fae_fighter_choose_target',
                { timeout: 10000, polling: 200 },
            );
            await waitForSmashUpFxToSettle(page);
            await expectManualMinionChoiceVisible(
                page,
                'elves-fae-ally',
                '精灵斗士应在玩家0视图中显示己方随从本体',
                { forbidPromptContext: true },
            );
            await saveMunchkinEvidenceScreenshot(page, '精灵斗士-P0-手动选择己方随从.png');
            await clickManualMinionChoice(page, 'elves-fae-ally', '精灵斗士选择己方随从');
            await waitForSmashUpFxToSettle(page);
            const state = await game.getState();
            expect(state.core.bases[0].minions.find((entry: any) => entry.uid === 'elves-fae-played-1')?.powerCounters).toBe(1);
            expect(state.core.bases[0].minions.find((entry: any) => entry.uid === 'elves-fae-ally')?.powerCounters).toBe(1);
            await game.screenshot('木精灵-精灵斗士-双方获得力量指示物', testInfo);
        } finally {
            await targetPage.close();
        }
    });

    test('木精灵援手在计分前手动选择玩家和己方随从，并在赢家确认后手动选择 VP', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true, seat1: 'human', playerID: '0' }, 20000);
        await game.setupScene(buildMunchkinElvesHelpingHandsScene());
        const targetPage = await openSmashUpPlayerView(page, '1');
        try {

        await expect(page.locator('[data-card-uid="elves-helping-hands-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="elves-helping-own"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('木精灵-援手-计分前', testInfo);
        await game.advancePhase();
        await waitForMeFirstReactionChoice(page);
        await game.selectInteractionOptionBy(
            option => option.value?.kind === 'play_action'
                && option.value?.cardUid === 'elves-helping-hands-1'
                && option.value?.targetBaseIndex === 0,
            '援手选择特殊行动卡',
        );
        await game.waitForInteraction('munchkin_elves_helping_hands_choose_player', 10000);
        await waitForSmashUpFxToSettle(page);
        await expectVisibleInteractionOptionBy(
            page,
            game,
            option => option.value?.targetPlayerId === '1',
            '援手第一步应显示目标玩家选项',
        );
        await game.screenshot('木精灵-援手-手动选择目标玩家', testInfo);
        await clickVisibleInteractionOptionBy(
            page,
            game,
            option => option.value?.targetPlayerId === '1',
            '援手选择目标玩家',
        );
        await game.waitForInteraction('munchkin_elves_helping_hands_choose_minion', 10000);
        await waitForSmashUpFxToSettle(page);
        await expectManualMinionChoiceVisible(
            page,
            'elves-helping-own',
            '援手应显示己方随从本体供玩家手动选择',
            { forbidPromptContext: true },
        );
        await game.screenshot('木精灵-援手-手动选择己方随从', testInfo);
        await clickManualMinionChoice(page, 'elves-helping-own', '援手选择己方随从');
        const helpingAfterScoringSourceId = await waitForInteractionSourceId(
            page,
            ['smashup_reaction_choose', 'munchkin_elves_helping_hands_choose_vp'],
            '援手选择己方随从后应进入计分后反应或 VP 选择',
        );
        if (helpingAfterScoringSourceId === 'smashup_reaction_choose') {
            await chooseReactionBySourceDefId(page, game, 'munchkin_elves_helping_hands', '选择援手计分后效果');
        }
        await game.waitForInteraction('munchkin_elves_helping_hands_choose_vp', 15000);
        await waitForSmashUpFxToSettle(page);
        await expect(page.getByRole('button', { name: '获得 1 VP' })).toBeVisible({ timeout: 15000 });
        await expect(page.getByRole('button', { name: '不获得' })).toBeVisible({ timeout: 15000 });
        await game.screenshot('木精灵-援手-计分后手动选择是否获得VP', testInfo);
        await page.getByRole('button', { name: '获得 1 VP' }).click({ force: true });
        await page.waitForFunction(
            () => String((window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.()?.sys?.interaction?.current?.playerId ?? '') === '1',
            { timeout: 10000, polling: 200 },
        );
        const responseState = await game.getState();
        await mirrorSmashUpHarnessState(targetPage, responseState);
        await targetPage.waitForFunction(
            () => String((window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.()?.sys?.interaction?.current?.playerId ?? '') === '1',
            { timeout: 10000, polling: 200 },
        );
        await waitForSmashUpFxToSettle(targetPage);
        await expect(targetPage.getByRole('button', { name: /跳过|让过|Pass|Skip/i }).first()).toBeVisible({ timeout: 15000 });
        await saveMunchkinEvidenceScreenshot(targetPage, '援手-P1-后续响应手动让过.png');
        await targetPage.getByRole('button', { name: /跳过|让过|Pass|Skip/i }).first().click({ force: true });
        const resolvedState = await targetPage.evaluate(() => (
            (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.()
        ));
        await mirrorSmashUpHarnessState(page, resolvedState);
        await page.waitForFunction(
            () => {
                const state = (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.();
                return !state?.sys?.interaction?.current && !state?.sys?.responseWindow?.current;
            },
            { timeout: 10000, polling: 200 },
        );
        await waitForSmashUpFxToSettle(page);

        const state = await game.getState();
        expect(state.core.players['0'].vp).toBe(5);
        expect(state.core.players['1'].vp).toBe(6);
        await game.screenshot('木精灵-援手-获得VP后结算', testInfo);
        } finally {
            await targetPage.close();
        }
    });

    test('木精灵旅行精灵从附着卡本体打开天赋并移动宿主', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true, seat1: 'human' }, 20000);
        await game.setupScene(buildMunchkinElvesTravelingElfScene());

        const host = page.locator('[data-minion-uid="elves-travel-host"]').first();
        const travelingElf = page.locator('[data-attached-action-uid="elves-travel-1"]').first();
        await expect(host).toBeVisible({ timeout: 15000 });
        await host.hover();
        await expect(travelingElf).toBeVisible({ timeout: 15000 });
        await game.screenshot('木精灵-旅行精灵-附着卡本体', testInfo);
        await travelingElf.click({ force: true });
        await game.waitForInteraction('munchkin_elves_traveling_elf_choose_destination', 10000);
        await waitForSmashUpFxToSettle(page);
        await expect(page.locator('[data-base-index="1"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('木精灵-旅行精灵-手动选择目标基地', testInfo);
        await game.selectInteractionOptionBy(option => option.value?.baseIndex === 1, '旅行精灵目标基地');
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        const state = await game.getState();
        expect(state.core.bases[0].minions).toHaveLength(0);
        expect(state.core.bases[1].minions).toEqual([
            expect.objectContaining({
                uid: 'elves-travel-host',
                attachedActions: [expect.objectContaining({ uid: 'elves-travel-1', defId: 'munchkin_elves_traveling_elf' })],
            }),
        ]);
        await game.screenshot('木精灵-旅行精灵-宿主与附着卡移动后', testInfo);
    });

    test('木精灵援助山谷随当前回合玩家动态排除自己并给其他玩家加力', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true, seat1: 'human' }, 20000);
        await game.setupScene(buildMunchkinElvesHelperHollowScene('0'));
        await expect(page.locator('[data-base-index="0"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-base-score-0-0')).toHaveText('2', { timeout: 15000 });
        await expect(page.getByTestId('su-base-score-0-1')).toHaveText('3', { timeout: 15000 });
        await game.screenshot('木精灵-援助山谷-玩家0回合', testInfo);

        await game.setupScene(buildMunchkinElvesHelperHollowScene('1'));
        await expect(page.getByTestId('su-base-score-0-0')).toHaveText('3', { timeout: 15000 });
        await expect(page.getByTestId('su-base-score-0-1')).toHaveText('2', { timeout: 15000 });
        await game.screenshot('木精灵-援助山谷-玩家1回合', testInfo);
    });

    test('木精灵赶紧逃跑吧先选基地再多选随从，并允许空选', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true, seat1: 'human' }, 20000);

        const enterRunAwayMoreChoice = async (suffix: string) => {
            await game.setupScene(buildMunchkinElvesRunAwayMoreScene());
            await expect(page.locator('[data-card-uid="elves-run-more-1"]').first()).toBeVisible({ timeout: 15000 });
            await expect(page.locator('[data-minion-uid="elves-run-more-a"]').first()).toBeVisible({ timeout: 15000 });
            await expect(page.locator('[data-minion-uid="elves-run-more-b"]').first()).toBeVisible({ timeout: 15000 });

            await game.advancePhase();
            await waitForMeFirstReactionChoice(page);
            await game.selectInteractionOptionBy(
                option => option.value?.kind === 'play_action'
                    && option.value?.cardUid === 'elves-run-more-1'
                    && option.value?.targetBaseIndex === 0,
                `赶紧逃跑吧${suffix}：选择特殊行动卡`,
            );
            await game.waitForInteraction('munchkin_elves_run_away_more_choose_destination', 10000);
            await waitForSmashUpFxToSettle(page);
            await expect(page.locator('[data-base-index="1"]').first()).toBeVisible({ timeout: 15000 });
            await game.screenshot(`木精灵-赶紧逃跑吧${suffix}-手动选择目标基地`, testInfo);
            await page.locator('[data-base-index="1"]').first().click({ force: true });
            await game.waitForInteraction('munchkin_elves_run_away_more_choose_minions', 10000);
            await waitForSmashUpFxToSettle(page);
            await expectManualMinionChoiceVisible(
                page,
                'elves-run-more-a',
                `赶紧逃跑吧${suffix}：多选随从应显示己方随从本体`,
                { forbidPromptContext: true },
            );
            await expectManualMinionChoiceVisible(
                page,
                'elves-run-more-b',
                `赶紧逃跑吧${suffix}：第二个己方随从本体应可见`,
                { forbidPromptContext: true },
            );
            await expect(page.getByRole('button', { name: /确认/ }).first()).toBeVisible({ timeout: 15000 });
            await game.screenshot(`木精灵-赶紧逃跑吧${suffix}-手动多选随从`, testInfo);
        };

        await enterRunAwayMoreChoice('-空选路径');
        await page.getByRole('button', { name: '确认选择' }).click({ force: true });
        await game.waitForNoInteraction(10000);
        const skippedState = await game.getState();
        expect(skippedState.core.bases[0].minions.map((entry: any) => entry.uid)).toEqual([]);
        expect(skippedState.core.bases[1].minions.map((entry: any) => entry.uid)).toEqual([]);
        expect(skippedState.core.players['0'].discard.map((card: any) => card.uid)).toEqual(expect.arrayContaining([
            'elves-run-more-1',
            'elves-run-more-a',
            'elves-run-more-b',
        ]));
        expect(skippedState.core.players['1'].discard.map((card: any) => card.uid)).toContain('elves-run-more-opponent');
        await game.screenshot('木精灵-赶紧逃跑吧-空选后按已开始计分清场', testInfo);

        await game.openTestGame('smashup', { skipInitialization: true, seat1: 'human' }, 20000);
        await enterRunAwayMoreChoice('-选择路径');
        await clickManualMinionChoice(page, 'elves-run-more-a', '赶紧逃跑吧选择第一个己方随从');
        await game.screenshot('木精灵-赶紧逃跑吧-已选择一个随从后', testInfo);
        await game.confirm();
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        const movedState = await game.getState();
        expect(movedState.core.bases[0].minions.map((entry: any) => entry.uid)).toEqual([]);
        expect(movedState.core.bases[1].minions.map((entry: any) => entry.uid)).toEqual(['elves-run-more-a']);
        await game.screenshot('木精灵-赶紧逃跑吧-选择后随从移至目标基地', testInfo);
    });

    test('木精灵树屋先选另一位玩家，再由目标玩家手动选择抽牌或跳过', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true, seat1: 'human' }, 20000);
        await game.setupScene(buildMunchkinElvesTreehouseScene());

        const targetPage = await openSmashUpPlayerView(page, '1');
        try {

            await expect(page.locator('[data-card-uid="elves-treehouse-minion-1"]').first()).toBeVisible({ timeout: 15000 });
            await expect(page.locator('[data-base-index="0"]').first()).toBeVisible({ timeout: 15000 });
            await game.playCard('alien_invader', { targetBaseIndex: 0 });
            await waitForSmashUpFxToSettle(page);
            await game.waitForInteraction('smashup_reaction_choose', 10000);
            await chooseReactionBySourceDefId(page, game, 'base_treehouse', '树屋选择基地触发');
            await game.waitForInteraction('base_treehouse_choose_player', 10000);
            await waitForSmashUpFxToSettle(page);
            await expectVisibleInteractionOptionBy(
                page,
                game,
                option => option.value?.targetPlayerId === '1',
                '树屋应显示另一位玩家选项',
            );
            await game.screenshot('木精灵-树屋-手动选择另一位玩家', testInfo);
            await clickVisibleInteractionOptionBy(
                page,
                game,
                option => option.value?.targetPlayerId === '1',
                '树屋选择另一位玩家',
            );

            const targetPlayerState = await game.getState();
            await mirrorSmashUpHarnessState(targetPage, targetPlayerState);
            await targetPage.waitForFunction(
                () => (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.()?.sys?.interaction?.current?.data?.sourceId
                    === 'base_treehouse_choose_draw',
                { timeout: 10000, polling: 200 },
            );
            await waitForSmashUpFxToSettle(targetPage);
            await expect(targetPage.getByTestId('prompt-context-card')).toHaveCount(0);
            await expect(targetPage.getByRole('button', { name: '抽一张牌' })).toBeVisible({ timeout: 15000 });
            await expect(targetPage.getByRole('button', { name: '跳过' })).toBeVisible({ timeout: 15000 });
            await saveMunchkinEvidenceScreenshot(targetPage, '树屋-P2-手动选择抽牌或跳过.png');

            await targetPage.getByRole('button', { name: '抽一张牌' }).click({ force: true });
            await targetPage.waitForFunction(
                () => !(window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.()?.sys?.interaction?.current,
                { timeout: 10000, polling: 200 },
            );
            await waitForSmashUpFxToSettle(targetPage);
            const state = await targetPage.evaluate(() => (
                (window as BrowserHarnessWindow).__BG_TEST_HARNESS__?.state?.get?.()
            ));
            expect(state?.core?.players?.['1']?.hand?.map((card: any) => card.uid)).toContain('elves-treehouse-draw-1');
            await waitForSmashUpHandCardToSettle(targetPage, handCardSelector('elves-treehouse-draw-1'));
            await saveMunchkinEvidenceScreenshot(targetPage, '树屋-P2-选择抽牌后.png');
        } finally {
            await targetPage.close();
        }
    });

    test('牧师解除诅咒从真实行动卡入口手动选择场上附着行动', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true, seat1: 'human' }, 20000);
        await game.setupScene(buildMunchkinClericsRemoveCurseScene());

        await expect(page.locator('[data-card-uid="clerics-remove-curse-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-attached-action-uid="clerics-imprisonment-1"]').first()).toBeVisible({ timeout: 15000 });
        await game.playCard('munchkin_clerics_remove_curse');
        await game.waitForInteraction('munchkin_clerics_remove_curse_action', 10000);
        await waitForSmashUpFxToSettle(page);
        await expectManualChoiceVisible(
            page,
            '[data-attached-action-uid="clerics-imprisonment-1"]',
            '解除诅咒应显示场上附着行动本体供玩家手动选择',
            { forbidPromptContext: true },
        );
        await game.screenshot('牧师-解除诅咒-手动选择附着行动', testInfo);
        await page.locator('[data-attached-action-uid="clerics-imprisonment-1"]').first().click({ force: true });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        const state = await game.getState();
        expect(state.core.bases[0].minions[0].attachedActions).toEqual([]);
        expect(state.core.players['0'].discard.map((card: any) => card.uid)).toContain('clerics-imprisonment-1');
        await game.screenshot('牧师-解除诅咒-附着行动被摧毁后', testInfo);
    });

    test('牧师红衣主教从真实天赋入口随机回收两张弃牌堆牌', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinClericsCardinalScene());

        const cardinal = page.locator('[data-minion-uid="clerics-cardinal-1"]').first();
        await expect(cardinal).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-uid="clerics-cardinal-hand-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await game.screenshot('牧师-红衣主教-天赋触发前', testInfo);

        await cardinal.click({ force: true });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        const state = await game.getState();
        const core = state.core as RocketBootsCoreState;
        const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;
        const recoveredUids = player0?.hand?.map(card => card.uid).filter(uid => uid.startsWith('clerics-cardinal-discard-')) ?? [];
        const cardinalState = core.bases[0].minions.find(entry => entry.uid === 'clerics-cardinal-1');

        expect(recoveredUids).toHaveLength(2);
        expect(player0?.hand?.map(card => card.uid)).toContain('clerics-cardinal-hand-1');
        expect(player0?.discard?.map(card => card.uid)).toHaveLength(3);
        expect(player0?.discard?.every(card => card.uid.startsWith('clerics-cardinal-discard-'))).toBe(true);
        expect(cardinalState?.talentUsed).toBe(true);
        expect(state.sys?.interaction?.current ?? null).toBeNull();
        expect(state.sys?.responseWindow?.current ?? null).toBeNull();

        await expect(page.getByTestId('su-minion-used-badge-clerics-cardinal-1')).toBeVisible({ timeout: 15000 });
        await game.screenshot('牧师-红衣主教-随机回收两张牌后', testInfo);
    });

    test('牧师光盘从真实手牌入口自动回收两张弃牌堆牌', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinClericsCollectionPlateScene());

        await expect(page.locator('[data-card-uid="clerics-plate-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="clerics-plate-host"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await game.screenshot('牧师-光盘-打出前弃牌堆与手牌', testInfo);

        await game.playCard('munchkin_clerics_collection_plate');
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        const state = await game.getState();
        const core = state.core as RocketBootsCoreState;
        const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;
        const recoveredUids = player0?.hand?.map(card => card.uid).filter(uid => uid.startsWith('clerics-plate-discard-')) ?? [];

        expect(recoveredUids).toHaveLength(2);
        expect(player0?.hand?.map(card => card.uid)).not.toContain('clerics-plate-1');
        expect(player0?.discard?.map(card => card.uid)).toContain('clerics-plate-1');
        expect(player0?.discard?.map(card => card.uid)).toHaveLength(4);
        expect(player0?.actionsPlayed).toBe(1);
        expect(state.sys?.interaction?.current ?? null).toBeNull();
        expect(state.sys?.responseWindow?.current ?? null).toBeNull();
        await expect(page.getByTestId('su-hand-area')).toBeVisible({ timeout: 15000 });
        await game.screenshot('牧师-光盘-自动回收两张牌后无确认交互', testInfo);
    });

    test('牧师好习惯从真实手牌入口遵守呆瓜兽人行动保护', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinClericsGoodHabitsScene());

        await expect(page.locator('[data-card-uid="clerics-habits-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="clerics-habits-own"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="clerics-habits-other-base"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('牧师-好习惯-打出前两座基地随从', testInfo);

        await game.playCard('munchkin_clerics_good_habits');
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        const state = await game.getState();
        const core = state.core as RocketBootsCoreState;
        const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;
        const allMinions = core.bases.flatMap(base => base.minions);

        expect(allMinions.map(entry => entry.tempPowerModifier)).toEqual([1, 0, 0]);
        expect(player0?.actionsPlayed).toBe(1);
        expect(player0?.discard?.map(card => card.uid)).toEqual(['clerics-habits-1']);
        expect(state.sys?.interaction?.current ?? null).toBeNull();
        expect(state.sys?.responseWindow?.current ?? null).toBeNull();
        await game.screenshot('牧师-好习惯-呆瓜兽人不受对手行动影响', testInfo);
    });

    test('牧师加入团队从真实手牌入口先高亮基地再手动选择目标基地', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinClericsJoinTheClubScene());

        await expect(page.locator('[data-card-uid="clerics-club-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-base-index="0"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-base-index="1"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('牧师-加入团队-打出前两个基地', testInfo);

        await page.locator('[data-card-uid="clerics-club-1"]').first().click({ force: true });
        await waitForSmashUpFxToSettle(page);
        await expect(page.locator('[data-base-index="0"] > div').first()).toHaveClass(/ring-(green|emerald)-400/);
        await expect(page.locator('[data-base-index="1"] > div').first()).toHaveClass(/ring-(green|emerald)-400/);
        await game.screenshot('牧师-加入团队-手动选择目标基地', testInfo);
        await page.locator('[data-base-index="1"]').first().click({ force: true });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        const state = await game.getState();
        const core = state.core as RocketBootsCoreState;
        const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;

        expect(core.bases[0].minions.map(entry => entry.tempPowerModifier)).toEqual([0]);
        expect(core.bases[1].minions.map(entry => entry.tempPowerModifier)).toEqual([1]);
        expect(player0?.actionsPlayed).toBe(1);
        expect(player0?.discard?.map(card => card.uid)).toEqual(['clerics-club-1']);
        expect(state.sys?.interaction?.current ?? null).toBeNull();
        expect(state.sys?.responseWindow?.current ?? null).toBeNull();
        await game.screenshot('牧师-加入团队-目标基地获得临时力量', testInfo);
    });

    test('牧师监禁诅咒从真实手牌入口手动选择对手随从并附着', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinClericsCurseScene('munchkin_clerics_curse_of_imprisonment', 'clerics-imprisonment-play-1'));

        await expect(page.locator('[data-card-uid="clerics-imprisonment-play-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="clerics-curse-target"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('牧师-监禁诅咒-打出前手牌与目标随从', testInfo);

        await page.locator('[data-card-uid="clerics-imprisonment-play-1"]').first().click({ force: true });
        await waitForSmashUpFxToSettle(page);
        await expectManualMinionChoiceVisible(
            page,
            'clerics-curse-target',
            '监禁诅咒应显示对手随从本体供玩家手动选择',
            { forbidPromptContext: true },
        );
        await game.screenshot('牧师-监禁诅咒-手动选择对手随从', testInfo);
        await page.locator('[data-minion-uid="clerics-curse-target"]').first().click({ force: true });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        const state = await game.getState();
        const core = state.core as RocketBootsCoreState;
        const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;
        const target = core.bases[0].minions.find(entry => entry.uid === 'clerics-curse-target');

        expect(target?.attachedActions?.map(action => action.defId)).toContain('munchkin_clerics_curse_of_imprisonment');
        expect(player0?.hand?.map(card => card.uid)).not.toContain('clerics-imprisonment-play-1');
        expect(player0?.actionsPlayed).toBe(1);
        expect(state.sys?.interaction?.current ?? null).toBeNull();
        expect(state.sys?.responseWindow?.current ?? null).toBeNull();
        await game.screenshot('牧师-监禁诅咒-附着到目标随从后', testInfo);
    });

    test('牧师无用诅咒从真实手牌入口手动选择对手随从并排除基地力量', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinClericsCurseScene('munchkin_clerics_curse_of_uselessness', 'clerics-uselessness-play-1'));

        await expect(page.locator('[data-card-uid="clerics-uselessness-play-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-base-score-0-1')).toHaveText('5', { timeout: 15000 });
        await game.screenshot('牧师-无用诅咒-打出前基地力量', testInfo);

        await page.locator('[data-card-uid="clerics-uselessness-play-1"]').first().click({ force: true });
        await waitForSmashUpFxToSettle(page);
        await expectManualMinionChoiceVisible(
            page,
            'clerics-curse-target',
            '无用诅咒应显示对手随从本体供玩家手动选择',
            { forbidPromptContext: true },
        );
        await game.screenshot('牧师-无用诅咒-手动选择对手随从', testInfo);
        await page.locator('[data-minion-uid="clerics-curse-target"]').first().click({ force: true });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        const state = await game.getState();
        const core = state.core as RocketBootsCoreState;
        const player0 = core.players?.['0'] as SmashUpPlayerCoreSlice | undefined;
        const target = core.bases[0].minions.find(entry => entry.uid === 'clerics-curse-target');

        expect(target?.attachedActions?.map(action => action.defId)).toContain('munchkin_clerics_curse_of_uselessness');
        expect(await page.getByTestId('su-base-score-0-1').textContent()).toBe('0');
        expect(player0?.hand?.map(card => card.uid)).not.toContain('clerics-uselessness-play-1');
        expect(player0?.actionsPlayed).toBe(1);
        expect(state.sys?.interaction?.current ?? null).toBeNull();
        expect(state.sys?.responseWindow?.current ?? null).toBeNull();
        await game.screenshot('牧师-无用诅咒-附着后基地力量排除目标随从', testInfo);
    });

    test('牧师资深修士从计分后真实响应窗口先选随从再选基地', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinClericsDeepFriarScene());

        await expect(page.locator('[data-minion-uid="clerics-friar-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="clerics-friar-move"]').first()).toBeVisible({ timeout: 15000 });
        await game.advancePhase();
        await expect.poll(async () => {
            const status = await getReactionWindowStatus(page);
            const state = await game.getState();
            return {
                phase: state.sys?.phase,
                sourceId: status.sourceId,
                windowType: status.windowType,
            };
        }, { timeout: 20000, intervals: [200] }).toEqual({
            phase: 'scoreBases',
            sourceId: 'smashup_reaction_choose',
            windowType: 'afterScoring',
        });

        await game.selectInteractionOptionBy(
            option => option.value?.kind === 'activate_special'
                && option.value?.minionUid === 'clerics-friar-1'
                && option.value?.baseIndex === 0,
            '计分后选择资深修士特殊能力',
        );
        await game.waitForInteraction('munchkin_clerics_deep_friar_minion', 10000);
        await waitForSmashUpFxToSettle(page);
        await expectManualMinionChoiceVisible(
            page,
            'clerics-friar-move',
            '资深修士第一步应显示另一个己方随从本体',
            { forbidPromptContext: true },
        );
        await game.screenshot('牧师-资深修士-手动选择另一个己方随从', testInfo);
        await clickManualMinionChoice(page, 'clerics-friar-move', '资深修士选择要移动的随从');

        await game.waitForInteraction('munchkin_clerics_deep_friar_base', 10000);
        await waitForSmashUpFxToSettle(page);
        await expect(page.locator('[data-base-index="1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('prompt-context-card')).toHaveCount(0);
        await game.screenshot('牧师-资深修士-手动选择另一个基地', testInfo);
        await game.selectInteractionOptionBy(option => option.value?.baseIndex === 1, '资深修士选择目标基地');
        await game.waitForNoInteraction(15000);
        await waitForSmashUpFxToSettle(page);

        const state = await game.getState();
        expect(state.core.bases[0].minions.map((entry: any) => entry.uid)).toEqual([]);
        expect(state.core.bases[1].minions.map((entry: any) => entry.uid)).toContain('clerics-friar-move');
        expect(state.core.players['0'].discard.map((entry: any) => entry.uid)).toContain('clerics-friar-1');
        expect(state.core.players['0'].discard.map((entry: any) => entry.uid)).not.toContain('clerics-friar-move');
        await game.screenshot('牧师-资深修士-随从移动后', testInfo);
    });

    test('牧师特纳从真实打出入口先选模式再手动选亡灵怪物', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinClericsTurnerScene());

        await expect(page.locator('[data-card-uid="clerics-turner-1"]').first()).toBeVisible({ timeout: 15000 });
        await game.playCard('munchkin_clerics_turner', { targetBaseIndex: 0 });
        await game.waitForInteraction('munchkin_clerics_turner_mode', 10000);
        await waitForSmashUpFxToSettle(page);
        await expect(page.getByRole('button', { name: '摧毁这里的亡灵怪物' })).toBeVisible({ timeout: 15000 });
        await expect(page.getByRole('button', { name: '将弃牌堆随机随从重洗进牌库' })).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('prompt-context-card')).toHaveCount(0);
        await game.screenshot('牧师-特纳-手动选择效果模式', testInfo);
        await page.getByRole('button', { name: '摧毁这里的亡灵怪物' }).click({ force: true });

        await game.waitForInteraction('munchkin_clerics_turner_monster', 10000);
        await waitForSmashUpFxToSettle(page);
        await expectManualChoiceVisible(
            page,
            '[data-monster-uid="clerics-turner-undead"]',
            '特纳第二步应显示亡灵怪物本体供玩家手动选择',
            { forbidPromptContext: true },
        );
        await game.screenshot('牧师-特纳-手动选择亡灵怪物', testInfo);
        await page.locator('[data-monster-uid="clerics-turner-undead"]').first().click({ force: true });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        const state = await game.getState();
        expect(state.core.bases[0].monsters.map((entry: any) => entry.uid)).toEqual(['clerics-turner-living']);
        await game.screenshot('牧师-特纳-亡灵怪物被摧毁后', testInfo);
    });

    test('牧师圣临者从真实打出入口必须手动确认或跳过回收', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinClericsHolyRollerScene());

        await expect(page.locator('[data-card-uid="clerics-holy-roller-1"]').first()).toBeVisible({ timeout: 15000 });
        await game.playCard('munchkin_clerics_holy_roller', { targetBaseIndex: 0 });
        await game.waitForInteraction('munchkin_clerics_holy_roller_mode', 10000);
        await waitForSmashUpFxToSettle(page);
        await expect(page.getByRole('button', { name: '重洗一张' })).toBeVisible({ timeout: 15000 });
        await expect(page.getByRole('button', { name: '跳过' })).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('prompt-context-card')).toHaveCount(0);
        await game.screenshot('牧师-圣临者-手动选择回收或跳过', testInfo);
        await page.getByRole('button', { name: '跳过' }).click({ force: true });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        const state = await game.getState();
        expect(state.core.players['0'].discard.map((entry: any) => entry.uid)).toEqual(['clerics-holy-discard-1']);
        expect(state.core.players['0'].deck.map((entry: any) => entry.uid)).toEqual(['clerics-holy-deck-1']);
        expect(state.core.bases[0].minions.map((entry: any) => entry.uid)).toEqual(['clerics-holy-roller-1']);
        await game.screenshot('牧师-圣临者-跳过后弃牌堆与牌库不变', testInfo);
    });

    test('牧师垃圾处理在计分后从真实持续行动入口手动移动另一个基地的随从', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinClericsBinAndGoneScene());
        await expect(page.locator('[data-ongoing-uid="clerics-bin-1"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="clerics-bin-move"]').first()).toBeVisible({ timeout: 15000 });
        await game.advancePhase();
        await game.waitForInteraction('munchkin_clerics_bin_and_gone_minion', 20000);
        await waitForSmashUpFxToSettle(page);
        const promptState = await game.getState();
        const promptData = promptState.sys?.interaction?.current?.data;
        const promptOptions = Array.isArray(promptData?.options) ? promptData.options : [];
        expect(promptData?.targetType).toBe('field-source-target');
        expect(promptOptions).toEqual(expect.arrayContaining([
            expect.objectContaining({
                value: expect.objectContaining({
                    fieldInteractionType: 'source-target',
                    fieldSourceType: 'ongoing',
                    fieldTargetType: 'minion',
                    sourceUid: 'clerics-bin-1',
                    targetMinionUid: 'clerics-bin-move',
                    targetMinionDefId: 'alien_invader',
                }),
            }),
        ]));
        const binSource = page.locator('[data-ongoing-uid="clerics-bin-1"]').first();
        const targetMinion = page.locator('[data-minion-uid="clerics-bin-move"]').first();
        await expect(page.getByTestId('prompt-context-card')).toHaveCount(0);
        await expect(binSource).toHaveAttribute('data-highlighted', 'true');
        await expect(binSource).toHaveAttribute('data-selected', 'false');
        await expect(targetMinion).toHaveAttribute('data-highlighted', 'false');
        await game.screenshot('牧师-垃圾处理-来源持续行动可发动', testInfo);

        await clickManualOngoingChoice(page, 'clerics-bin-1', '垃圾处理选择来源持续行动');
        await expect(binSource).toHaveAttribute('data-selected', 'true');
        await expect(targetMinion).toHaveAttribute('data-highlighted', 'true');
        await game.screenshot('牧师-垃圾处理-点击来源后目标随从高亮', testInfo);

        await clickManualMinionChoice(page, 'clerics-bin-move', '垃圾处理选择移动随从');
        await game.waitForNoInteraction(15000);
        await waitForSmashUpFxToSettle(page);

        const state = await game.getState();
        expect(state.core.bases[0].minions.map((entry: any) => entry.uid)).toContain('clerics-bin-move');
        expect(state.core.bases[1].minions.map((entry: any) => entry.uid)).not.toContain('clerics-bin-move');
        await game.screenshot('牧师-垃圾处理-随从移动到持续行动基地', testInfo);
    });

    test('牧师圣洁酒店在计分后逐张手动选择随从顺序并回各自牌库顶', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinClericsHotelScene());
        await expect(page.locator('[data-minion-uid="clerics-hotel-own"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-minion-uid="clerics-hotel-other"]').first()).toBeVisible({ timeout: 15000 });
        await game.advancePhase();
        await game.waitForInteraction('munchkin_clerics_hotel_of_holiness_minion', 20000);
        await waitForSmashUpFxToSettle(page);
        await expectManualMinionChoiceVisible(page, 'clerics-hotel-own', '圣洁酒店应显示己方随从本体', { forbidPromptContext: true });
        await expectManualMinionChoiceVisible(page, 'clerics-hotel-other', '圣洁酒店应显示其他玩家随从本体', { forbidPromptContext: true });
        await game.screenshot('牧师-圣洁酒店-手动选择第一张随从', testInfo);
        await clickManualMinionChoice(page, 'clerics-hotel-other', '圣洁酒店先选择其他玩家随从');
        await game.waitForInteraction('munchkin_clerics_hotel_of_holiness_minion', 10000);
        await expectManualMinionChoiceVisible(page, 'clerics-hotel-own', '圣洁酒店第二步应保留未选己方随从', { forbidPromptContext: true });
        await game.screenshot('牧师-圣洁酒店-手动选择第二张随从', testInfo);
        await clickManualMinionChoice(page, 'clerics-hotel-own', '圣洁酒店再选择己方随从');
        await game.waitForNoInteraction(15000);
        await waitForSmashUpFxToSettle(page);

        const state = await game.getState();
        expect(state.core.players['1'].deck[0].uid).toBe('clerics-hotel-other');
        expect(state.core.players['0'].hand[0].uid).toBe('clerics-hotel-own');
        expect(state.core.players['0'].deck.map((entry: any) => entry.uid)).not.toContain('clerics-hotel-own');
        expect(state.core.bases[0].minions).toEqual([]);
        await game.screenshot('牧师-圣洁酒店-按选择顺序回牌库顶并完成正常抽牌', testInfo);
    });

    test('牧师回忆祷词从其他玩家弃牌堆手动选择一张行动作为额外行动', async ({ page, game }, testInfo) => {
        test.setTimeout(60000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinClericsWordRecallScene());
        await expect(page.locator('[data-card-uid="clerics-recall-1"]').first()).toBeVisible({ timeout: 15000 });
        await game.playCard('munchkin_clerics_word_of_recall');
        await game.waitForInteraction('munchkin_clerics_word_of_recall_action', 10000);
        await waitForSmashUpFxToSettle(page);
        await expect(page.getByTestId('prompt-card-grid')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-card-def-id="munchkin_clerics_collection_plate"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByRole('button', { name: '不打出' })).toBeVisible({ timeout: 15000 });
        await game.screenshot('牧师-回忆祷词-手动选择其他玩家行动或不打出', testInfo);
        await game.selectInteractionOptionBy(
            option => option.value?.cardUid === 'clerics-recall-target',
            '回忆祷词选择其他玩家弃牌堆行动',
        );
        await game.waitForInteraction('smashup_immediate_extra_action', 10000);
        await expect(page.locator('[data-card-uid="clerics-recall-target"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByRole('button', { name: '放弃这次额外战术', exact: true })).toBeVisible({ timeout: 15000 });
        await game.screenshot('牧师-回忆祷词-手动确认额外行动或放弃', testInfo);
        await page.getByRole('button', { name: '放弃这次额外战术', exact: true }).click({ force: true });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);

        const state = await game.getState();
        expect(state.core.players['0'].hand.map((entry: any) => entry.uid)).toContain('clerics-recall-target');
        expect(state.core.players['1'].discard.map((entry: any) => entry.uid)).not.toContain('clerics-recall-target');
        expect(state.core.players['0'].actionLimit).toBe(1);
        await game.screenshot('牧师-回忆祷词-行动转入手牌并获得额外行动', testInfo);
    });

    test('勇士大英雄从真实天赋入口先手动选择模式再手动选择怪物', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinWarriorsBigHeroScene());
        await waitForSmashUpFxToSettle(page);

        await expect(page.locator('[data-minion-uid="warriors-big-hero"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-base-monster-row-0')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-monster-uid="warriors-big-hero-monster-a"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-monster-uid="warriors-big-hero-monster-b"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('勇士-大英雄-天赋前怪物行与手牌', testInfo);

        await clickManualMinionActivation(page, 'warriors-big-hero', '大英雄天赋');
        if (await page.locator('[data-minion-uid="warriors-big-hero"]').first().getAttribute('data-activation-armed') === 'true') {
            await clickManualMinionActivation(page, 'warriors-big-hero', '大英雄天赋二次确认');
        }
        await game.waitForInteraction('munchkin_warriors_big_hero_mode', 10000);
        await expectCurrentInteractionManual(game, '大英雄模式选择');
        const modeOptions = await game.getInteractionOptions() as InteractionOption[];
        expect(modeOptions.some(option => option.value?.mode === 'destroyMonster')).toBe(true);
        expect(modeOptions.some(option => option.value?.mode === 'playMonster')).toBe(true);
        await expect(page.getByTestId('prompt-context-card')).toHaveCount(0);
        await game.screenshot('勇士-大英雄-手动选择摧毁或打出怪物', testInfo);
        await clickVisibleInteractionOptionBy(
            page,
            game,
            option => option.value?.mode === 'destroyMonster',
            '大英雄选择摧毁怪物模式',
        );

        await game.waitForInteraction('munchkin_warriors_big_hero_monster', 10000);
        await expectCurrentInteractionManual(game, '大英雄怪物选择');
        await expectManualChoiceVisible(
            page,
            '[data-monster-uid="warriors-big-hero-monster-a"]',
            '大英雄怪物选择必须显示基地下方的怪物本体',
            { forbidPromptContext: true, minVisibleHitCount: 1 },
        );
        await game.screenshot('勇士-大英雄-手动选择基地下方怪物', testInfo);
        await clickManualMonsterChoice(page, 'warriors-big-hero-monster-a', '大英雄选择怪物');
        await game.waitForNoInteraction(15000);
        await waitForSmashUpFxToSettle(page);

        const state = await game.getState();
        expect(state.core.bases[0].monsters.map((entry: any) => entry.uid)).toEqual(['warriors-big-hero-monster-b']);
        expect(state.core.bases[0].minions.find((entry: any) => entry.uid === 'warriors-star-player')?.powerCounters).toBe(1);
        expect(state.core.players['0'].hand.some((entry: any) => entry.defId === 'munchkin_treasure_dwarf_hireling')).toBe(true);
        await expect(page.getByTestId('su-minion-power-badge-warriors-star-player')).toContainText('+1');
        await game.screenshot('勇士-大英雄-怪物被手动摧毁并触发明星勇士', testInfo);
    });

    test('勇士斩杀从真实手牌入口手动选择怪物并逐张手动选择宝藏额外出牌', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinWarriorsCleaveScene());
        await waitForSmashUpFxToSettle(page);

        await expect(page.locator('[data-card-uid="warriors-cleave-action"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-monster-uid="warriors-cleave-monster"]').first()).toBeVisible({ timeout: 15000 });
        await game.playCard('munchkin_warriors_cleave');
        await game.waitForInteraction('munchkin_warriors_cleave_monster', 10000);
        await expectCurrentInteractionManual(game, '斩杀怪物选择');
        await expectManualChoiceVisible(
            page,
            '[data-monster-uid="warriors-cleave-monster"]',
            '斩杀必须显示真实怪物卡本体',
            { forbidPromptContext: true },
        );
        await game.screenshot('勇士-斩杀-手动选择怪物', testInfo);
        await clickManualMonsterChoice(page, 'warriors-cleave-monster', '斩杀选择怪物');

        await game.waitForInteraction('smashup_immediate_extra_minion', 10000);
        await expectCurrentInteractionManual(game, '斩杀宝藏额外出牌选择');
        const afterDefeat = await game.getState();
        const treasureInHand = afterDefeat.core.players['0'].hand.find((entry: any) => entry.defId === 'munchkin_treasure_dwarf_hireling');
        expect(treasureInHand, '斩杀击败怪物后应把宝藏放入当前玩家手牌').toBeTruthy();
        const extraOptions = await game.getInteractionOptions() as InteractionOption[];
        expect(extraOptions.some(option => option.value?.cardUid === treasureInHand.uid)).toBe(true);
        await expectManualChoiceVisible(
            page,
            handCardSelector(treasureInHand.uid),
            '斩杀额外出牌应显示宝藏手牌本体',
            { forbidPromptContext: false },
        );
        await game.screenshot('勇士-斩杀-手动选择宝藏额外随从', testInfo);
        await page.locator(handCardSelector(treasureInHand.uid)).first().click({ force: true });
        await page.waitForTimeout(300);

        await game.waitForInteraction('smashup_immediate_extra_minion_base', 10000);
        await expectCurrentInteractionManual(game, '斩杀额外随从基地选择');
        await expectManualChoiceVisible(page, '[data-base-index="0"]', '斩杀额外随从应显示目标基地本体', { forbidPromptContext: true });
        await game.screenshot('勇士-斩杀-手动选择额外随从基地', testInfo);
        await clickManualBaseChoice(page, 0, '斩杀选择额外随从基地');
        await game.waitForNoInteraction(15000);
        await waitForSmashUpFxToSettle(page);

        const finalState = await game.getState();
        expect(finalState.core.bases[0].minions.map((entry: any) => entry.uid)).toContain(treasureInHand.uid);
        expect(finalState.core.players['0'].discard.map((entry: any) => entry.uid)).toContain('warriors-cleave-action');
        await game.screenshot('勇士-斩杀-宝藏额外随从落到基地后收口', testInfo);
    });

    test('勇士战争怒吼从真实手牌入口先手动选择怪物再手动选择同基地随从', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinWarriorsWarCryScene());
        await waitForSmashUpFxToSettle(page);

        await expect(page.locator('[data-card-uid="warriors-war-cry-action"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-monster-uid="warriors-war-cry-monster-a"]').first()).toBeVisible({ timeout: 15000 });
        await game.playCard('munchkin_warriors_war_cry');
        await game.waitForInteraction('munchkin_warriors_war_cry_monster', 10000);
        await expectCurrentInteractionManual(game, '战争怒吼怪物选择');
        await expectManualChoiceVisible(
            page,
            '[data-monster-uid="warriors-war-cry-monster-a"]',
            '战争怒吼第一步必须显示怪物本体',
            { forbidPromptContext: true, minVisibleHitCount: 1 },
        );
        await game.screenshot('勇士-战争怒吼-第一步手动选择怪物', testInfo);
        await clickManualMonsterChoice(page, 'warriors-war-cry-monster-a', '战争怒吼选择怪物');

        await game.waitForInteraction('munchkin_warriors_war_cry_minion', 10000);
        await expectCurrentInteractionManual(game, '战争怒吼随从选择');
        const minionOptions = await game.getInteractionOptions() as InteractionOption[];
        expect(minionOptions.some(option => option.value?.minionUid === 'warriors-war-cry-own')).toBe(true);
        expect(minionOptions.some(option => option.value?.minionUid === 'warriors-war-cry-other')).toBe(true);
        await expectManualMinionChoiceVisible(
            page,
            'warriors-war-cry-own',
            '战争怒吼第二步必须显示同基地随从本体',
            { forbidPromptContext: true },
        );
        await game.screenshot('勇士-战争怒吼-第二步手动选择同基地随从', testInfo);
        await clickManualMinionChoice(page, 'warriors-war-cry-own', '战争怒吼选择同基地随从');
        await game.waitForNoInteraction(15000);
        await waitForSmashUpFxToSettle(page);

        const state = await game.getState();
        expect(state.core.bases[0].monsters).toEqual([]);
        expect(state.core.bases[0].minions.find((entry: any) => entry.uid === 'warriors-war-cry-own')?.tempPowerModifier).toBeGreaterThan(0);
        expect(state.core.bases[0].minions.some((entry: any) => entry.uid === 'warriors-war-cry-other')).toBe(true);
        await page.mouse.move(24, 24);
        await game.screenshot('勇士-战争怒吼-怪物摧毁并把力量加到所选随从', testInfo);
    });

    test('勇士骚乱从真实手牌入口先手动选择基地再手动选择效果', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinWarriorsRuckusScene());
        await waitForSmashUpFxToSettle(page);

        await expect(page.locator('[data-card-uid="warriors-ruckus-action"]').first()).toBeVisible({ timeout: 15000 });
        await game.playCard('munchkin_warriors_ruckus');
        await game.waitForInteraction('munchkin_warriors_ruckus_base', 10000);
        await expectCurrentInteractionManual(game, '骚乱基地选择');
        await expectManualChoiceVisible(page, '[data-base-index="0"]', '骚乱第一步应显示第一座基地本体', { forbidPromptContext: true });
        await expectManualChoiceVisible(page, '[data-base-index="1"]', '骚乱第一步应显示第二座基地本体', { forbidPromptContext: true });
        await game.screenshot('勇士-骚乱-第一步手动选择基地', testInfo);
        await clickManualBaseChoice(page, 0, '骚乱选择第一座基地');

        await game.waitForInteraction('munchkin_warriors_ruckus_mode', 10000);
        await expectCurrentInteractionManual(game, '骚乱效果选择');
        const modeOptions = await game.getInteractionOptions() as InteractionOption[];
        expect(modeOptions.some(option => option.value?.mode === 'playTwo')).toBe(true);
        expect(modeOptions.some(option => option.value?.mode === 'destroyAll')).toBe(true);
        await expect(page.getByTestId('prompt-context-card')).toHaveCount(0);
        await game.screenshot('勇士-骚乱-第二步手动选择打出两个怪物或摧毁全部怪物', testInfo);
        await clickVisibleInteractionOptionBy(
            page,
            game,
            option => option.value?.mode === 'playTwo',
            '骚乱选择打出两个怪物',
        );
        await game.waitForNoInteraction(15000);
        await waitForSmashUpFxToSettle(page);

        const state = await game.getState();
        expect(state.core.bases[0].monsters).toHaveLength(3);
        expect(state.core.treasureDeck).toHaveLength(2);
        await expect(page.locator('[data-testid="su-base-monster-row-0"] [data-monster-uid]')).toHaveCount(3);
        await game.screenshot('勇士-骚乱-两个怪物落到所选基地且宝藏堆不变', testInfo);
    });

    test('勇士狂战士从真实打出入口手动选择同基地不高于自身的怪物', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinWarriorsBerserkerScene());
        await waitForSmashUpFxToSettle(page);

        await expect(page.locator('[data-card-uid="warriors-berserker-hand"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-monster-uid="warriors-berserker-monster"]').first()).toBeVisible({ timeout: 15000 });
        await game.playCard('munchkin_warriors_berserker', { targetBaseIndex: 0 });
        await game.waitForInteraction('munchkin_warriors_berserker_monster', 10000);
        await expectCurrentInteractionManual(game, '狂战士怪物选择');
        await expectManualChoiceVisible(
            page,
            '[data-monster-uid="warriors-berserker-monster"]',
            '狂战士必须显示基地下方真实怪物本体',
            { forbidPromptContext: true },
        );
        await game.screenshot('勇士-狂战士-手动选择同基地怪物', testInfo);
        await clickManualMonsterChoice(page, 'warriors-berserker-monster', '狂战士选择怪物');
        await game.waitForNoInteraction(15000);
        await waitForSmashUpFxToSettle(page);

        const state = await game.getState();
        const source = state.core.bases[0].minions.find((entry: any) => entry.uid === 'warriors-berserker-hand');
        expect(state.core.bases[0].monsters).toEqual([]);
        expect(source?.powerCounters).toBe(1);
        expect(state.core.players['0'].hand.some((entry: any) => entry.defId === 'munchkin_treasure_dwarf_hireling')).toBe(true);
        await expect(page.getByTestId('su-minion-power-badge-warriors-berserker-hand')).toContainText('+1');
        await game.screenshot('勇士-狂战士-摧毁怪物并获得力量指示物', testInfo);
    });

    test('勇士嘲讽者从真实打出入口保留跳过或手动打出怪物选择', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinWarriorsTaunterScene());
        await waitForSmashUpFxToSettle(page);

        await game.playCard('munchkin_warriors_taunter', { targetBaseIndex: 0 });
        await game.waitForInteraction('munchkin_warriors_taunter_mode', 10000);
        await expectCurrentInteractionManual(game, '嘲讽者是否打出怪物');
        const options = await game.getInteractionOptions() as InteractionOption[];
        expect(options.some(option => option.value?.skip === true)).toBe(true);
        expect(options.some(option => option.value?.mode === 'playMonster')).toBe(true);
        await expect(page.getByTestId('prompt-context-card')).toHaveCount(0);
        await game.screenshot('勇士-嘲讽者-手动选择跳过或打出怪物', testInfo);
        await clickVisibleInteractionOptionBy(page, game, option => option.value?.mode === 'playMonster', '嘲讽者选择打出怪物');
        await game.waitForNoInteraction(15000);
        await waitForSmashUpFxToSettle(page);

        const state = await game.getState();
        expect(state.core.bases[0].monsters).toHaveLength(1);
        expect(state.core.bases[0].monsters[0].defId).toBe('munchkin_monster_bigfoot');
        await expect(page.locator('[data-testid="su-base-monster-row-0"] [data-monster-uid]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('勇士-嘲讽者-手动打出怪物后进入基地下方怪物行', testInfo);
    });

    test('勇士领导运动从真实手牌入口只强化有怪物基地的己方随从', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinWarriorsCampaignScene());
        await waitForSmashUpFxToSettle(page);

        await expect(page.locator('[data-card-uid="warriors-campaign-hand"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('勇士-领导运动-打出前有怪物与无怪物基地对照', testInfo);
        await game.playCard('munchkin_warriors_campaign');
        await game.waitForNoInteraction(15000);
        await waitForSmashUpFxToSettle(page);

        const state = await game.getState();
        expect(state.core.bases[0].minions.find((entry: any) => entry.uid === 'warriors-campaign-boosted')?.tempPowerModifier).toBe(2);
        expect(state.core.bases[1].minions.find((entry: any) => entry.uid === 'warriors-campaign-unboosted')?.tempPowerModifier ?? 0).toBe(0);
        expect(state.core.players['0'].discard.some((entry: any) => entry.defId === 'munchkin_warriors_campaign')).toBe(true);
        await expect(page.getByTestId('su-minion-power-badge-warriors-campaign-boosted')).toContainText('+2');
        await game.screenshot('勇士-领导运动-只有有怪物基地的己方随从获得加成', testInfo);
    });

    test('勇士地牢诱饵从真实手牌入口先选效果再手动选择怪物基地', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinWarriorsDungeonBaitScene());
        await waitForSmashUpFxToSettle(page);

        await game.playCard('munchkin_warriors_dungeon_bait');
        await game.waitForInteraction('munchkin_warriors_dungeon_bait_mode', 10000);
        await expectCurrentInteractionManual(game, '地牢诱饵效果选择');
        const modeOptions = await game.getInteractionOptions() as InteractionOption[];
        expect(modeOptions.some(option => option.value?.mode === 'playMonster')).toBe(true);
        expect(modeOptions.some(option => option.value?.mode === 'destroyMinion')).toBe(true);
        await game.screenshot('勇士-地牢诱饵-手动选择打怪或摧毁随从', testInfo);
        await clickVisibleInteractionOptionBy(page, game, option => option.value?.mode === 'playMonster', '地牢诱饵选择打出怪物');

        await game.waitForInteraction('munchkin_warriors_dungeon_bait_base', 10000);
        await expectCurrentInteractionManual(game, '地牢诱饵基地选择');
        await expectManualChoiceVisible(page, '[data-base-index="1"]', '地牢诱饵必须显示目标基地本体', { forbidPromptContext: true });
        await game.screenshot('勇士-地牢诱饵-手动选择怪物基地', testInfo);
        await clickManualBaseChoice(page, 1, '地牢诱饵选择怪物基地');
        await game.waitForNoInteraction(15000);
        await waitForSmashUpFxToSettle(page);

        const state = await game.getState();
        expect(state.core.bases[0].monsters).toEqual([]);
        expect(state.core.bases[1].monsters?.map((entry: any) => entry.defId)).toEqual(['munchkin_monster_bigfoot']);
        await expect(page.locator('[data-testid="su-base-monster-row-1"] [data-monster-uid]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('勇士-地牢诱饵-怪物进入手动选择的基地', testInfo);
    });

    test('勇士哑铃与无处不在之盾从真实手牌入口手动附着到随从', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinWarriorsOngoingScene());
        await waitForSmashUpFxToSettle(page);

        await expect(page.locator('[data-minion-uid="warriors-ongoing-host"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('勇士-附着行动-目标随从与怪物行', testInfo);
        await game.playCard('munchkin_warriors_dumbbells', { targetMinionUid: 'warriors-ongoing-host' });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);
        await expect(page.locator('[data-attached-action-uid="warriors-dumbbells-hand"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-minion-power-badge-warriors-ongoing-host')).toHaveAttribute('title', /哑铃: \+3/);
        await game.screenshot('勇士-哑铃-手动附着并获得力量', testInfo);

        await game.playCard('munchkin_warriors_shield_of_ubiquity', { targetMinionUid: 'warriors-ongoing-host' });
        await game.waitForNoInteraction(10000);
        await waitForSmashUpFxToSettle(page);
        await expect(page.locator('[data-attached-action-uid="warriors-shield-hand"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('su-minion-power-badge-warriors-ongoing-host')).toHaveAttribute('title', /无处不在之盾: \+2/);
        await game.screenshot('勇士-无处不在之盾-手动附着并按怪物数量加力', testInfo);

        const state = await game.getState();
        const host = state.core.bases[0].minions.find((entry: any) => entry.uid === 'warriors-ongoing-host');
        expect(host?.attachedActions.map((entry: any) => entry.defId)).toEqual([
            'munchkin_warriors_dumbbells',
            'munchkin_warriors_shield_of_ubiquity',
        ]);
        expect(state.core.bases[0].minions.find((entry: any) => entry.uid === 'warriors-ongoing-bystander')?.tempPowerModifier ?? 0).toBe(0);
    });

    test('勇士永恒的英雄从真实附着卡本体触发并只带宿主与自身回手', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinWarriorsEternalHeroScene());
        await waitForSmashUpFxToSettle(page);

        const host = page.locator('[data-minion-uid="warriors-eternal-host"]').first();
        const eternalHero = page.locator('[data-attached-action-uid="warriors-eternal-hero"]').first();
        const magicMissile = page.locator('[data-attached-action-uid="warriors-eternal-magic-missile"]').first();
        await expect(host).toBeVisible({ timeout: 15000 });
        await host.hover();
        await expect(eternalHero).toBeVisible({ timeout: 15000 });
        await expect(magicMissile).toBeVisible({ timeout: 15000 });
        await game.screenshot('勇士-永恒的英雄-宿主与附着行动', testInfo);

        await magicMissile.click({ force: true });
        await game.waitForInteraction('munchkin_treasure_magic_missile_destroy', 10000);
        await expectManualMinionChoiceVisible(
            page,
            'warriors-eternal-host',
            '永恒的英雄测试必须显示可被摧毁的宿主本体',
            { forbidPromptContext: true },
        );
        await game.screenshot('勇士-永恒的英雄-手动选择宿主', testInfo);
        await clickManualMinionChoice(page, 'warriors-eternal-host', '魔法导弹选择永恒英雄宿主');
        await game.waitForNoInteraction(15000);
        await waitForSmashUpFxToSettle(page);

        const state = await game.getState();
        const baseMinionUids = state.core.bases[0].minions.map((entry: any) => entry.uid);
        const player0HandUids = state.core.players['0'].hand.map((entry: any) => entry.uid);
        const player1DiscardUids = state.core.players['1'].discard.map((entry: any) => entry.uid);
        expect(baseMinionUids).toEqual([]);
        expect(player0HandUids).toContain('warriors-eternal-host');
        expect(player0HandUids).toContain('warriors-eternal-hero');
        expect(player1DiscardUids).toContain('warriors-eternal-other-action');
        expect(state.core.treasureDeck).toContain('munchkin_treasure_magic_missile');
        expect(state.core.triggerQueue ?? []).toHaveLength(0);
        await expect(page.locator('[data-minion-uid="warriors-eternal-host"]')).toHaveCount(0);
        await game.screenshot('勇士-永恒的英雄-宿主与本行动回手后收口', testInfo);
    });

    test('勇士堡垒与锦标赛从真实怪物本体入口触发同基地效果', async ({ page, game }, testInfo) => {
        test.setTimeout(90000);

        await page.setViewportSize({ width: 1440, height: 900 });
        await game.openTestGame('smashup', { skipInitialization: true }, 20000);
        await game.setupScene(buildMunchkinWarriorsBaseTriggerScene());
        await waitForSmashUpFxToSettle(page);

        await expect(page.locator('[data-monster-uid="warriors-bastion-monster"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-monster-uid="warriors-gauntlet-monster"]').first()).toBeVisible({ timeout: 15000 });
        await game.screenshot('勇士-基地触发-堡垒与锦标赛怪物行', testInfo);

        await clickManualMonsterChoice(page, 'warriors-bastion-monster', '堡垒选择同基地怪物');
        await game.waitForNoInteraction(15000);
        await waitForSmashUpFxToSettle(page);
        let state = await game.getState();
        expect(state.core.bases[0].monsters).toEqual([]);
        expect(state.core.players['0'].hand.map((entry: any) => entry.defId)).toContain('munchkin_treasure_spiky_boots');
        await game.screenshot('勇士-基地触发-堡垒抽到宝藏', testInfo);

        await clickManualMonsterChoice(page, 'warriors-gauntlet-monster', '锦标赛选择同基地怪物');
        await game.waitForNoInteraction(15000);
        await waitForSmashUpFxToSettle(page);
        state = await game.getState();
        expect(state.core.bases[1].monsters).toEqual([
            expect.objectContaining({ defId: 'munchkin_monster_bigfoot' }),
        ]);
        expect(state.core.monsterDeck).toEqual([]);
        expect(state.core.triggerQueue ?? []).toHaveLength(0);
        await game.screenshot('勇士-基地触发-锦标赛补怪物后收口', testInfo);
    });
});
