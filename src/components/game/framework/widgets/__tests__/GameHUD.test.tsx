/* @vitest-environment happy-dom */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { GameHUD } from '../GameHUD';

vi.mock('../../../../../contexts/UndoContext', () => ({
    useUndo: () => ({ canUndo: false, undo: vi.fn() }),
    useUndoStatus: () => ({ canUndo: false, undoAvailable: false }),
}));

vi.mock('../../../../../core', () => ({
    UI_Z_INDEX: { overlayRaised: 1000 },
    HudPortal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../../../system/FabMenu', () => ({
    FabMenu: ({
        items,
        position,
        storageKey,
    }: {
        items: Array<{
            id: string;
            label: string;
            content?: React.ReactNode | ((context: { closePanel: () => void }) => React.ReactNode);
        }>;
        position?: string;
        storageKey?: string;
    }) => {
        const renderContent = (
            content?: React.ReactNode | ((context: { closePanel: () => void }) => React.ReactNode),
        ) => (typeof content === 'function'
            ? content({ closePanel: () => undefined })
            : content);

        return (
            <div
                data-testid="fab-menu-stub"
                data-fab-position={position}
                data-fab-storage-key={storageKey}
            >
                {items.map((item) => (
                    <div key={item.id}>
                        <span data-testid={`fab-action-${item.id}`}>
                            {item.label}
                        </span>
                        {item.content && (
                            <div data-testid={`fab-content-${item.id}`}>
                                {renderContent(item.content)}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        );
    },
}));

vi.mock('../../../../system/AboutModal', () => ({
    AboutModal: () => null,
}));

vi.mock('../../../../system/FeedbackModal', () => ({
    FeedbackModal: () => null,
}));

vi.mock('../../../../../contexts/ToastContext', () => ({
    useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

vi.mock('../../../../../contexts/AuthContext', () => ({
    useAuth: () => ({ user: null }),
}));

vi.mock('../../../../../services/matchSocket', () => ({
    matchSocket: {
        on: vi.fn(),
        off: vi.fn(),
        emit: vi.fn(),
        joinChat: vi.fn(),
        leaveChat: vi.fn(),
        subscribeChat: vi.fn(() => vi.fn()),
        subscribeChatHistory: vi.fn(() => vi.fn()),
        joinEmotes: vi.fn(),
        leaveEmotes: vi.fn(),
        subscribeEmote: vi.fn(() => vi.fn()),
    },
}));

vi.mock('../../../../../contexts/ModalStackContext', () => ({
    useModalStack: () => ({
        stack: [],
        topModalId: null,
        closeTop: vi.fn(),
        closeModal: vi.fn(),
    }),
}));

vi.mock('../../../../../contexts/SocialContext', () => ({
    useOptionalSocial: () => null,
}));

vi.mock('../../../utils/actionLogFormat', () => ({
    buildActionLogRows: () => [],
    createStateBackedActionLogPlayerLabel: () => () => '',
}));

vi.mock('../ActionLogSegments', () => ({
    ActionLogSegments: () => null,
}));

vi.mock('../AudioControlSection', () => ({
    AudioControlSection: () => <div data-testid="audio-control-section-stub" />,
}));

vi.mock('../../../registry/cardPreviewRegistry', () => ({
    getCardPreviewGetter: () => null,
    getCardPreviewMaxDim: () => 0,
}));

vi.mock('../../../../../lib/utils', () => ({
    generateId: () => 'id',
    copyToClipboard: vi.fn(),
}));

vi.mock('../../../../../lib/logger', () => ({
    logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
    createScopedLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../../../../../lib/mobile/androidRuntime', () => ({
    isNativeAndroidRuntime: () => false,
}));

vi.mock('../../../../common/media/OptimizedImage', () => ({
    OptimizedImage: () => null,
}));

vi.mock('../../../../social/FriendsChatModal', () => ({
    FriendsChatModal: () => null,
}));

vi.mock('../EmotePicker', () => ({
    EmotePicker: () => null,
}));

vi.mock('../SeatEmoteOverlay', () => ({
    SeatEmoteOverlay: () => null,
}));

vi.mock('../../../../../lib/feedback/gameFeedbackDiagnostics', () => ({
    buildGameFeedbackActionLog: () => [],
    buildGameFeedbackStateSnapshot: () => ({}),
}));

describe('GameHUD', () => {
    const renderHud = (node: React.ReactElement) => render(
        <MemoryRouter>
            {node}
        </MemoryRouter>,
    );

    it('联机正式进行阶段不再显示等待对手加入横幅', () => {
        renderHud(
            <GameHUD
                mode="online"
                matchId="match-1"
                gameId="fantasyrealms"
                myPlayerId="0"
                opponentName={null}
                opponentConnected={false}
                presenceReady={true}
                players={[
                    { id: 0, name: '玩家1', isConnected: true },
                    { id: 1, name: undefined, isConnected: false },
                ]}
                isPregameSetupPhase={false}
            />,
        );

        expect(screen.queryByTestId('opponent-offline-banner')).toBeNull();
    });

    it('联机赛前 setup 阶段仍显示等待对手加入横幅', () => {
        renderHud(
            <GameHUD
                mode="online"
                matchId="match-1"
                gameId="fantasyrealms"
                myPlayerId="0"
                opponentName={null}
                opponentConnected={false}
                presenceReady={true}
                players={[
                    { id: 0, name: '玩家1', isConnected: true },
                    { id: 1, name: undefined, isConnected: false },
                ]}
                isPregameSetupPhase={true}
            />,
        );

        expect(screen.getByTestId('opponent-offline-banner')).toBeInTheDocument();
    });

    it('联机加载期不显示对手离线横幅', () => {
        renderHud(
            <GameHUD
                mode="online"
                matchId="match-1"
                gameId="dicethrone"
                myPlayerId="0"
                opponentName="玩家2"
                opponentConnected={false}
                presenceReady={true}
                players={[
                    { id: 0, name: '玩家1', isConnected: true },
                    { id: 1, name: '玩家2', isConnected: false },
                ]}
                isPregameSetupPhase={true}
                isLoading={true}
            />,
        );

        expect(screen.queryByTestId('opponent-offline-banner')).toBeNull();
    });

    it('联机状态未确认前不显示对手离线横幅', () => {
        renderHud(
            <GameHUD
                mode="online"
                matchId="match-1"
                gameId="dicethrone"
                myPlayerId="0"
                opponentName="玩家2"
                opponentConnected={false}
                presenceReady={false}
                players={[
                    { id: 0, name: '玩家1', isConnected: true },
                    { id: 1, name: '玩家2', isConnected: false },
                ]}
                isPregameSetupPhase={true}
            />,
        );

        expect(screen.queryByTestId('opponent-offline-banner')).toBeNull();
    });

    it('联机赛前 setup 阶段仍显示强制结束 AI 阶段入口', () => {
        renderHud(
            <GameHUD
                mode="online"
                matchId="match-1"
                gameId="dicethrone"
                myPlayerId="0"
                isPregameSetupPhase={true}
                showForceEndAiPhase={true}
                onForceEndAiPhase={vi.fn()}
            />,
        );

        expect(screen.getByTestId('fab-action-force-actions')).toBeInTheDocument();
    });

    it('联机赛前 setup 阶段不因普通弹窗强关单独显示强制操作入口', () => {
        renderHud(
            <GameHUD
                mode="online"
                matchId="match-1"
                gameId="dicethrone"
                myPlayerId="0"
                isPregameSetupPhase={true}
                showForceDismissPopup={true}
            />,
        );

        expect(screen.queryByTestId('fab-action-force-actions')).toBeNull();
    });

    it('具体游戏不得在共享 HUD 层整体隐藏 FAB 菜单', () => {
        const { rerender } = renderHud(
            <GameHUD
                mode="online"
                matchId="match-1"
                gameId="qidahen"
                myPlayerId="0"
                isPregameSetupPhase={true}
            />,
        );

        expect(screen.getByTestId('fab-menu-stub')).toBeInTheDocument();
        expect(screen.getByTestId('fab-action-feedback')).toBeInTheDocument();
        expect(screen.getByTestId('fab-action-display-theme')).toBeInTheDocument();

        rerender(
            <MemoryRouter>
                <GameHUD
                    mode="online"
                    matchId="match-1"
                    gameId="betrayal"
                    myPlayerId="0"
                    isPregameSetupPhase={true}
                />
            </MemoryRouter>,
        );

        expect(screen.getByTestId('fab-menu-stub')).toBeInTheDocument();
        expect(screen.getByTestId('fab-action-feedback')).toBeInTheDocument();
        expect(screen.getByTestId('fab-action-display-theme')).toBeInTheDocument();
    });

    it('Mage Wars 游戏内悬浮菜单默认避开底部准备牌区', () => {
        renderHud(
            <GameHUD
                mode="tutorial"
                matchId="match-1"
                gameId="mage-wars"
                myPlayerId="0"
                isPregameSetupPhase={false}
            />,
        );

        const fabMenu = screen.getByTestId('fab-menu-stub');
        expect(fabMenu).toHaveAttribute('data-fab-position', 'top-left');
        expect(fabMenu).toHaveAttribute('data-fab-storage-key', 'game_hud_fab_position:mage-wars');
        expect(screen.getByTestId('fab-action-feedback')).toBeInTheDocument();
        expect(screen.getByTestId('fab-action-display-theme')).toBeInTheDocument();
    });

    it('设置面板渲染调用方注入的游戏运行时设置', () => {
        renderHud(
            <GameHUD
                mode="online"
                matchId="match-1"
                gameId="fantasyrealms"
                myPlayerId="0"
                isPregameSetupPhase={false}
                renderRuntimeSettings={() => (
                    <div data-testid="runtime-settings-slot">runtime settings</div>
                )}
            />,
        );

        expect(screen.getByTestId('fab-content-settings')).toBeInTheDocument();
        expect(screen.getByTestId('runtime-settings-slot')).toHaveTextContent('runtime settings');
    });
});
