import { afterEach, describe, expect, it } from 'vitest';
import type { MatchChatMessage } from '../../services/matchSocket';
import { UI_Z_INDEX } from '../../core';
import type { MatchState } from '../../engine/types';
import {
    buildGameHudFeedbackActionLog,
    buildGameHudFeedbackStateSnapshot,
    GAME_HUD_FAB_Z_INDEX,
    getLatestIncomingMessage,
    isSelfChatMessage,
    resolveGameHudPhase,
    trimChatMessages,
} from '../game/framework/widgets/gameHudModel';
import {
    areFabAnchorRectsEqual,
    MOBILE_FAB_VISIBLE_ITEM_LIMIT,
    resolveFabLayerZIndex,
    resolveFabSatellitesToRender,
    resolveMobileFabOverflowWarning,
    shouldTrackFabButtonRect,
} from '../system/FabMenu';
import { GLOBAL_HUD_FAB_Z_INDEX } from '../system/GlobalHUD';
import { shouldAllowFabDragFromTarget } from '../system/fabDrag';
import { resolveExpandedFabLayout } from '../system/fabLayout';
import { resolveFabStoredPosition, serializeFabPositionPercent } from '../system/fabPosition';

const buildMessage = (override: Partial<MatchChatMessage> = {}): MatchChatMessage => ({
    id: 'msg-1',
    matchId: 'room-1',
    senderId: '1',
    senderName: '玩家1',
    text: '你好',
    createdAt: '2025-01-01T00:00:00.000Z',
    ...override,
});

const buildFeedbackState = (): MatchState<unknown> => ({
    core: {
        gameId: 'smashup',
        players: {
            '0': { id: '0', hand: [], deck: [], discard: [], factions: ['robots'] },
        },
    },
    sys: {
        phase: 'scoreBases',
        turnNumber: 7,
        flow: { phase: 'scoreBases' },
        actionLog: {
            maxEntries: 50,
            entries: [
                {
                    text: '基地开始结算',
                    timestamp: 1700000000000,
                    event: { type: 'BASE_SCORING_STARTED' },
                },
            ],
        },
        eventStream: {
            nextId: 18,
            entries: [
                {
                    id: 17,
                    type: 'BASE_SCORING_STARTED',
                    timestamp: 1700000000000,
                    payload: { baseId: 'base_wyrms_desolation' },
                },
            ],
        },
        interaction: {
            current: {
                id: 'interaction-1',
                kind: 'simple-choice',
                playerId: '0',
                data: { title: '选择要先结算的基地', options: [{ id: 'base-a' }] },
            },
            queue: [],
            isBlocked: false,
        },
        responseWindow: {
            current: {
                triggerEvent: { type: 'BASE_SCORING_STARTED' },
                responderQueue: ['0'],
                currentResponderIndex: 0,
            },
        },
        undo: {
            snapshots: [
                {
                    core: { gameId: 'smashup', bases: ['before-score'] },
                    sys: { turnNumber: 6, phase: 'playCards' },
                },
            ],
        },
    },
} as MatchState<unknown>);

describe('GameHUD chat preview helpers', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('isSelfChatMessage 使用 senderId 判断自身消息', () => {
        const message = buildMessage({ senderId: '2', senderName: '玩家2' });
        expect(isSelfChatMessage(message, '2', '玩家1')).toBe(true);
        expect(isSelfChatMessage(message, '1', '玩家1')).toBe(false);
    });

    it('isSelfChatMessage 使用 senderName 判断自身消息', () => {
        const message = buildMessage({ senderId: undefined, senderName: '玩家A' });
        expect(isSelfChatMessage(message, '1', '玩家A')).toBe(true);
        expect(isSelfChatMessage(message, '1', '玩家B')).toBe(false);
    });

    it('getLatestIncomingMessage 返回最新的非自身消息', () => {
        const messages = [
            buildMessage({ id: 'msg-1', senderId: '1', senderName: '玩家1', text: '我发的' }),
            buildMessage({ id: 'msg-2', senderId: '2', senderName: '玩家2', text: '对方1' }),
            buildMessage({ id: 'msg-3', senderId: '1', senderName: '玩家1', text: '我发的2' }),
            buildMessage({ id: 'msg-4', senderId: '3', senderName: '玩家3', text: '对方2' }),
        ];
        const latest = getLatestIncomingMessage(messages, '1', '玩家1');
        expect(latest?.id).toBe('msg-4');
    });

    it('getLatestIncomingMessage 无非自身消息时返回 null', () => {
        const messages = [
            buildMessage({ id: 'msg-1', senderId: '1', senderName: '玩家1', text: '我发的' }),
            buildMessage({ id: 'msg-2', senderId: '1', senderName: '玩家1', text: '我发的2' }),
        ];
        const latest = getLatestIncomingMessage(messages, '1', '玩家1');
        expect(latest).toBeNull();
    });

    it('trimChatMessages 超过上限时保留最新消息', () => {
        const messages = [
            buildMessage({ id: 'msg-1' }),
            buildMessage({ id: 'msg-2' }),
            buildMessage({ id: 'msg-3' }),
            buildMessage({ id: 'msg-4' }),
        ];
        const trimmed = trimChatMessages(messages, 3);
        expect(trimmed.map((msg) => msg.id)).toEqual(['msg-2', 'msg-3', 'msg-4']);
    });

    it('trimChatMessages 未超过上限时保持原数组', () => {
        const messages = [
            buildMessage({ id: 'msg-1' }),
            buildMessage({ id: 'msg-2' }),
        ];
        const trimmed = trimChatMessages(messages, 3);
        expect(trimmed).toEqual(messages);
    });

    it('resolveGameHudPhase 优先使用 sys.phase，并兼容 flow.phase', () => {
        expect(resolveGameHudPhase({ sys: { phase: 'setup', flow: { phase: 'main1' } } })).toBe('setup');
        expect(resolveGameHudPhase({ sys: { flow: { phase: 'setup' } } })).toBe('setup');
        expect(resolveGameHudPhase({ sys: { phase: 1 } })).toBeNull();
    });

    it('手工反馈操作日志应带机器可读诊断窗口', () => {
        document.body.innerHTML = `
            <div
                data-testid="dt-opponent-player-1-hp"
                data-feedback-game="dicethrone"
                data-feedback-player-id="1"
                data-feedback-resource="hp"
                data-feedback-resource-value="49"
                aria-label="HP 49"
                title="HP 49"
            >49</div>
        `;

        const payload = JSON.parse(buildGameHudFeedbackActionLog(buildFeedbackState(), [
            { timeLabel: '08:00:00', playerLabel: '矞皇', text: '开始回合' },
        ]));

        expect(payload).toMatchObject({
            kind: 'user-feedback-diagnostic',
            phase: 'scoreBases',
            turnNumber: 7,
            humanReadableLog: '[08:00:00] 矞皇: 开始回合',
        });
        expect(payload.visibleResourceSnapshot).toEqual([
            expect.objectContaining({
                gameId: 'dicethrone',
                playerId: '1',
                resource: 'hp',
                value: 49,
                text: '49',
                testId: 'dt-opponent-player-1-hp',
                ariaLabel: 'HP 49',
                title: 'HP 49',
            }),
        ]);
        expect(payload.actionLogTail).toEqual([
            expect.objectContaining({ text: '基地开始结算', type: 'BASE_SCORING_STARTED' }),
        ]);
        expect(payload.eventStreamTail).toEqual([
            expect.objectContaining({ type: 'BASE_SCORING_STARTED' }),
        ]);
        expect(payload.interaction).toMatchObject({ id: 'interaction-1', kind: 'simple-choice' });
        expect(payload.responseWindow).toMatchObject({
            triggerEvent: { type: 'BASE_SCORING_STARTED' },
        });
        expect(payload.undoSnapshots).toEqual([
            expect.objectContaining({ phase: 'playCards', turnNumber: 6 }),
        ]);
        expect(payload.currentStateSummary).toMatchObject({
            phase: 'scoreBases',
            turnNumber: 7,
        });
    });

    it('手工反馈状态快照应直接保留完整 MatchState', () => {
        const state = buildFeedbackState();
        expect(buildGameHudFeedbackStateSnapshot(state)).toBe(JSON.stringify(state, null, 2));
    });
});

describe('FabMenu helpers', () => {
    it('大厅全局悬浮球层级必须高于看板娘且低于反馈弹窗', () => {
        expect(GLOBAL_HUD_FAB_Z_INDEX).toBe(UI_Z_INDEX.globalHudFab);
        expect(GLOBAL_HUD_FAB_Z_INDEX).toBeGreaterThan(UI_Z_INDEX.tooltip - 1);
        expect(resolveFabLayerZIndex(GLOBAL_HUD_FAB_Z_INDEX).root).toBeGreaterThan(UI_Z_INDEX.tooltip - 1);
        expect(resolveFabLayerZIndex(GLOBAL_HUD_FAB_Z_INDEX).floatingText).toBeLessThan(UI_Z_INDEX.modalOverlay);
    });

    it('游戏内应急悬浮球层级必须高于所有常规 modal 内容层', () => {
        expect(GAME_HUD_FAB_Z_INDEX).toBe(UI_Z_INDEX.emergencyHud);
        expect(GAME_HUD_FAB_Z_INDEX).toBeGreaterThan(UI_Z_INDEX.modalContent);
        expect(GAME_HUD_FAB_Z_INDEX).toBeGreaterThan(UI_Z_INDEX.tutorial);
    });

    it('操作日志卡牌预览层级必须高于悬浮球，且不改变悬浮球层级', () => {
        expect(GAME_HUD_FAB_Z_INDEX).toBe(UI_Z_INDEX.emergencyHud);
        expect(UI_Z_INDEX.cardPreviewTooltip).toBeGreaterThan(GAME_HUD_FAB_Z_INDEX);
    });

    it('FAB 内部浮层层级必须由同一个基准层级派生', () => {
        const layers = resolveFabLayerZIndex(GAME_HUD_FAB_Z_INDEX);

        expect(layers.panel).toBeGreaterThan(GAME_HUD_FAB_Z_INDEX);
        expect(layers.root).toBeGreaterThan(layers.panel);
        expect(layers.floatingText).toBeGreaterThan(layers.root);
        expect(layers.floatingText).toBeLessThan(UI_Z_INDEX.cardPreviewTooltip);
    });

    it('卫星按钮顺序始终按业务定义靠近主球的一端优先渲染', () => {
        expect(resolveFabSatellitesToRender(['feedback', 'fullscreen', 'action-log', 'settings'])).toEqual([
            'settings',
            'action-log',
            'fullscreen',
            'feedback',
        ]);
    });

    it('移动端悬浮球超过 7 个时生成告警 payload，桌面端不告警', () => {
        const actions = Array.from({ length: MOBILE_FAB_VISIBLE_ITEM_LIMIT + 1 }, (_, index) => ({
            id: `action-${index}`,
            label: `Action ${index}`,
        }));

        expect(resolveMobileFabOverflowWarning(actions, false)).toBeNull();
        expect(resolveMobileFabOverflowWarning(actions, true)).toMatchObject({
            count: MOBILE_FAB_VISIBLE_ITEM_LIMIT + 1,
            limit: MOBILE_FAB_VISIBLE_ITEM_LIMIT,
            itemIds: actions.map((action) => action.id),
        });
    });

    it('预览、tooltip 和激活中的内容面板都需要持续追踪按钮锚点位置', () => {
        expect(shouldTrackFabButtonRect({
            showTooltip: false,
            showPreview: false,
            isActive: true,
            hasContent: true,
        })).toBe(true);
        expect(shouldTrackFabButtonRect({
            showTooltip: false,
            showPreview: false,
            isActive: true,
            hasContent: false,
        })).toBe(false);
        expect(shouldTrackFabButtonRect({
            showTooltip: true,
            showPreview: false,
            isActive: false,
            hasContent: false,
        })).toBe(true);
    });

    it('悬浮按钮锚点矩形未实际变化时应视为相同，避免每帧重复更新状态', () => {
        const rect = { left: 10, top: 20, right: 58, bottom: 68, width: 48, height: 48 };

        expect(areFabAnchorRectsEqual(rect, { ...rect })).toBe(true);
        expect(areFabAnchorRectsEqual(rect, { ...rect, left: 10.25, right: 58.25 })).toBe(true);
        expect(areFabAnchorRectsEqual(rect, { ...rect, left: 11, right: 59 })).toBe(false);
    });

    it('设置面板内的滑块拖动不应触发悬浮球拖拽', () => {
        const panel = document.createElement('div');
        panel.setAttribute('data-fab-panel-interactive', 'true');
        const slider = document.createElement('input');
        slider.type = 'range';
        panel.appendChild(slider);

        const button = document.createElement('button');

        expect(shouldAllowFabDragFromTarget(slider)).toBe(false);
        expect(shouldAllowFabDragFromTarget(panel)).toBe(false);
        expect(shouldAllowFabDragFromTarget(button)).toBe(true);
    });

    it('恢复保存的越界百分比位置时会收回到视口内并要求回写存储', () => {
        const resolved = resolveFabStoredPosition({
            savedPosition: JSON.stringify({ leftPercent: 1.4, topPercent: -0.25 }),
            legacyOffset: null,
            viewportWidth: 100,
            viewportHeight: 100,
            basePosition: { left: 24, top: 24 },
            normalizePosition: (target) => target,
            clampPosition: (target) => ({
                left: Math.min(Math.max(target.left, 12), 60),
                top: Math.min(Math.max(target.top, 8), 72),
            }),
            resolvedButtonSize: 48,
        });

        expect(resolved.position).toEqual({ left: 60, top: 8 });
        expect(resolved.percent).toEqual({ leftPercent: 0.6, topPercent: 0.08 });
        expect(resolved.shouldPersist).toBe(true);
        expect(resolved.clearLegacyOffset).toBe(false);
    });

    it('旧版 offset 恢复时也会收回到视口内并清理旧存储键', () => {
        const resolved = resolveFabStoredPosition({
            savedPosition: null,
            legacyOffset: JSON.stringify({ x: 120, y: -80 }),
            viewportWidth: 200,
            viewportHeight: 120,
            basePosition: { left: 40, top: 32 },
            normalizePosition: (target) => target,
            clampPosition: (target) => ({
                left: Math.min(Math.max(target.left, 16), 120),
                top: Math.min(Math.max(target.top, 10), 84),
            }),
            resolvedButtonSize: 48,
        });

        expect(resolved.position).toEqual({ left: 120, top: 10 });
        expect(resolved.percent).toEqual(serializeFabPositionPercent({ left: 120, top: 10 }, 200, 120));
        expect(resolved.shouldPersist).toBe(true);
        expect(resolved.clearLegacyOffset).toBe(true);
    });

    it('展开态靠近底部时会整体上移，但保持主球与最近卫星按钮的固定间距', () => {
        const layout = resolveExpandedFabLayout({
            position: { left: 120, top: 130 },
            alignment: { v: 'bottom', h: 'right' },
            satelliteCount: 2,
            buttonSize: 44,
            buttonGap: 8,
            viewportHeight: 160,
            safeAreaTop: 0,
            safeAreaBottom: 0,
            getHorizontalAlignment: () => 'left',
        });

        expect(layout.position).toEqual({ left: 120, top: 130 });
        expect(layout.listOffset).toEqual({ x: 0, y: 0 });
        expect(layout.alignment).toEqual({ v: 'bottom', h: 'left' });
        expect(layout.columnCount).toBe(1);
    });

    it('展开态靠近顶部时会整体下移，而不是只把卫星按钮单独推开', () => {
        const layout = resolveExpandedFabLayout({
            position: { left: 120, top: 6 },
            alignment: { v: 'top', h: 'left' },
            satelliteCount: 2,
            buttonSize: 44,
            buttonGap: 8,
            viewportHeight: 180,
            safeAreaTop: 12,
            safeAreaBottom: 6,
            getHorizontalAlignment: () => 'right',
        });

        expect(layout.position).toEqual({ left: 120, top: 6 });
        expect(layout.listOffset).toEqual({ x: 0, y: -32 });
        expect(layout.alignment).toEqual({ v: 'top', h: 'right' });
    });

    it('横屏高度不足时悬浮球卫星按钮应自动拆成多列', () => {
        const layout = resolveExpandedFabLayout({
            position: { left: 640, top: 260 },
            alignment: { v: 'bottom', h: 'left' },
            satelliteCount: 8,
            buttonSize: 44,
            buttonGap: 8,
            viewportHeight: 320,
            safeAreaTop: 8,
            safeAreaBottom: 8,
            getHorizontalAlignment: () => 'left',
        });

        expect(layout.columnCount).toBeGreaterThan(1);
        expect(layout.itemsPerColumn).toBeLessThan(8);
        expect(layout.listOffset.y).toBeGreaterThanOrEqual(0);
    });
});
