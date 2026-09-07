import type { ReactNode } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type MatchStatusShape = {
    isLoading: boolean;
    isHost: boolean;
    players: Array<{ id: number; name?: string; isConnected?: boolean }>;
    playersRevision: number;
    opponentName: string | null;
    opponentConnected: boolean;
};

const navigateMock = vi.fn();
const setSearchParamsMock = vi.fn();
const toastWarningMock = vi.fn();
const toastErrorMock = vi.fn();
const toastSuccessMock = vi.fn();
const setPlayerIdMock = vi.fn();
const rejoinMatchMock = vi.fn();
const requestForceEndAiPhaseMock = vi.fn((onResult?: (result: { accepted: boolean }) => void) => {
    onResult?.({ accepted: true });
    return true;
});
const capturedGameProviderPlayerIds: Array<string | null> = [];
let mockSearchParams = new URLSearchParams();
let mockMatchStatus: MatchStatusShape = {
    isLoading: false,
    isHost: false,
    players: [{ id: 0, name: 'Alice', isConnected: true }],
    playersRevision: 0,
    opponentName: 'Bob',
    opponentConnected: true,
};
let mockTransportMatchPlayers: Array<{ id: number; name?: string; isConnected?: boolean }> = [];
let mockTransportConnected = false;
let mockTransportState: any = null;
let mockProviderPlayerId: string | null = '0';
let mockOnlineAiSeatControllers: Record<string, { type: 'human' | 'local-ai' | 'remote-ai' }> = {};
let mockNow = 1_000_000;

vi.mock('react-i18next', () => ({
    initReactI18next: { type: '3rdParty', init: vi.fn() },
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { resolvedLanguage: 'zh-CN', language: 'zh-CN' },
    }),
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useParams: () => ({
            gameId: 'smashup',
            matchId: 'match-1',
            playerID: undefined,
        }),
        useLocation: () => ({
            pathname: '/play/smashup/match/match-1',
            search: mockSearchParams.toString() ? `?${mockSearchParams.toString()}` : '',
        }),
        useNavigate: () => navigateMock,
        useSearchParams: () => [mockSearchParams, setSearchParamsMock],
    };
});

vi.mock('../../games/registry', () => ({
    getGameImplementation: () => ({
        board: () => null,
        ai: {},
    }),
    resolveGameTutorialManifest: () => null,
    subscribeGameImplementationReady: () => () => undefined,
}));

vi.mock('../../engine/transport/react', () => ({
    GameProvider: ({ playerId, children }: { playerId: string | null; children: ReactNode }) => {
        capturedGameProviderPlayerIds.push(playerId);
        return (
            <div data-testid="game-provider" data-player-id={playerId === null ? 'null' : playerId}>
                {children}
            </div>
        );
    },
    GameClientOverrideProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
    LocalGameProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
    BoardBridge: () => <div data-testid="board-bridge" />,
    buildAiProgressMarker: () => 'marker',
    releaseAiAttemptKeyIfMatches: vi.fn(),
    tryReserveAiAttemptKey: vi.fn(() => true),
    useGameClient: () => ({
        state: mockTransportState,
        dispatch: vi.fn(),
        requestForceEndAiPhase: requestForceEndAiPhaseMock,
        playerId: mockProviderPlayerId,
        matchPlayers: mockTransportMatchPlayers,
        isConnected: mockTransportConnected,
    }),
}));

vi.mock('../../contexts/DebugContext', () => ({
    useDebug: () => ({
        playerID: null,
        setPlayerID: setPlayerIdMock,
    }),
}));

vi.mock('../../contexts/TutorialContext', () => ({
    useTutorial: () => ({
        tutorial: {
            active: false,
            manifestId: null,
            stepIndex: 0,
            steps: [],
            step: null,
        },
        startTutorial: vi.fn(),
        closeTutorial: vi.fn(),
        isActive: false,
        currentStep: null,
        isBoardMounted: true,
    }),
}));

vi.mock('../../contexts/GameModeContext', () => ({
    GameModeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
    useGameMode: () => ({ mode: 'online' }),
}));

vi.mock('../../contexts/RematchContext', () => ({
    RematchProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../../hooks/match/useMatchStatus', async () => {
    const actual = await vi.importActual<typeof import('../../hooks/match/useMatchStatus')>('../../hooks/match/useMatchStatus');
    return {
        ...actual,
        useMatchStatus: () => mockMatchStatus,
        destroyMatch: vi.fn(),
        leaveMatch: vi.fn(),
        rejoinMatch: rejoinMatchMock,
    };
});

vi.mock('../../contexts/AuthContext', () => ({
    useAuth: () => ({
        user: null,
        token: null,
    }),
}));

vi.mock('../../contexts/ModalStackContext', () => ({
    useModalStack: () => ({
        openModal: vi.fn(),
        closeModal: vi.fn(),
    }),
}));

vi.mock('../../contexts/ToastContext', () => ({
    useToast: () => ({
        warning: toastWarningMock,
        error: toastErrorMock,
        success: toastSuccessMock,
    }),
}));

vi.mock('../../config/server', () => ({
    getGameServerUrl: () => 'ws://test.example',
}));

vi.mock('../../config/games.config', () => ({
    getGameById: () => ({
        id: 'smashup',
        ai: {
            capture: false,
            localAi: false,
            remoteAi: false,
        },
    }),
}));

vi.mock('../../services/matchApi', () => ({
    getMatch: vi.fn(async () => ({
        matchID: 'match-1',
        gameName: 'smashup',
        players: [{ id: 0, name: 'Alice' }, { id: 1, name: 'AI' }],
        setupData: {
            enableAi: true,
            seatControllers: mockOnlineAiSeatControllers,
        },
    })),
}));

vi.mock('../../shared/mobileSupport', () => ({
    getGamePageDataAttributes: () => ({}),
    resolveGameMobileSupport: (config: { preferredOrientation?: unknown }) => ({
        preferredOrientation: config.preferredOrientation,
    }),
    syncGamePageDocumentAttributes: vi.fn(),
}));

vi.mock('../../components/game/framework/widgets/GameHUD', () => ({
    GameHUD: (props: { showForceEndAiPhase?: boolean; onForceEndAiPhase?: () => Promise<boolean> }) => (
        props.showForceEndAiPhase && props.onForceEndAiPhase
            ? (
                <button
                    type="button"
                    data-testid="hud-force-end-ai-phase"
                    onClick={() => {
                        void props.onForceEndAiPhase?.();
                    }}
                >
                    force
                </button>
            )
            : null
    ),
    resolveGameHudPhase: () => null,
}));

vi.mock('../../components/common/SEO', () => ({
    SEO: () => null,
}));

vi.mock('../../components/system/LoadingScreen', () => ({
    LoadingScreen: () => <div data-testid="loading-screen" />,
}));

vi.mock('../../components/system/ConnectionLoadingScreen', () => ({
    ConnectionLoadingScreen: () => <div data-testid="connection-loading-screen" />,
}));

vi.mock('../../components/system/GameNamespaceLoadError', () => ({
    GameNamespaceLoadError: () => <div data-testid="game-namespace-load-error" />,
}));

vi.mock('../../hooks/ui/usePerformanceMonitor', () => ({
    usePerformanceMonitor: vi.fn(),
}));

vi.mock('../../components/game/framework', () => ({
    CriticalImageGate: ({ children }: { children: ReactNode }) => <>{children}</>,
    MobileBoardShell: ({ children }: { children: ReactNode }) => <>{children}</>,
    resolveMatchSeatSwapContext: () => null,
}));

vi.mock('../../core', () => ({
    HudPortal: ({ children }: { children: ReactNode }) => <>{children}</>,
    UI_Z_INDEX: {},
    preloadWarmImages: vi.fn(),
}));

vi.mock('../../core/CriticalImageResolverRegistry', () => ({
    resolveCriticalImages: () => [],
}));

vi.mock('../../lib/audio/useGameAudio', () => ({
    playDeniedSound: vi.fn(),
}));

vi.mock('../../lib/matchLoadTrace', () => ({
    appendMatchLoadTrace: vi.fn(),
}));

vi.mock('../../lib/mobile/mobileRuntimeDebug', () => ({
    logMobileRuntimeCritical: vi.fn(),
}));

vi.mock('../../lib/mobile/androidRuntime', () => ({
    isNativeAndroidRuntime: () => false,
}));

vi.mock('../../lib/mobile/appVisibility', () => ({
    onAppVisible: vi.fn(() => () => undefined),
}));

vi.mock('../../lib/logger', () => ({
    createScopedLogger: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    }),
}));

vi.mock('../../engine/transport/errorI18n', () => ({
    isUiHintOnlyError: () => false,
    resolveCommandError: () => null,
}));

vi.mock('../../core/cursor', () => ({
    GameCursorProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../../hooks/useGameNamespaceReady', () => ({
    useGameNamespaceReady: () => ({
        isGameNamespaceReady: true,
        gameNamespaceError: null,
        retryGameNamespaceLoad: vi.fn(),
    }),
}));

vi.mock('../../games/useGameImplementationReady', () => ({
    useGameImplementationReady: () => ({
        isGameImplementationReady: true,
        gameImplementationError: null,
        retryGameImplementationLoad: vi.fn(),
    }),
}));

vi.mock('../../games/smashup/ui/SmashUpOverlayContext', () => ({
    SmashUpOverlayProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../../games/smashup/ui/CardMagnifyOverlay', () => ({
    SMASHUP_FORCE_DISMISS_EVENT: 'smashup-force-dismiss',
}));

vi.mock('../../components/lobby/roomActions', () => ({
    notifyExitMatchErrorToast: vi.fn(),
}));

vi.mock('../../components/lobby/gameDetailsContent', () => ({
    resolveGameDisplayName: () => 'Smash Up',
}));

vi.mock('../matchHudPresence', () => ({
    resolveOnlineHudPresence: () => ({
        opponentName: null,
        opponentConnected: false,
        presenceReady: true,
        players: [],
    }),
}));

vi.mock('../onlineAiSeats', () => ({
    haveAiSeatCredentialsChanged: () => false,
    loadOnlineAiSeatState: vi.fn(async () => ({
        seatControllers: mockOnlineAiSeatControllers,
        seatCredentials: {},
    })),
    resolveMissingOnlineAiSeatCredentialIds: () => [],
}));

vi.mock('../onlineAiForceSkip', () => ({
    applyAiAutoRecoveryRejection: vi.fn(),
    finalizeOnlineAiResolutionConfirmation: vi.fn(() => false),
    resolveCurrentPlayerId: vi.fn(() => null),
    resolveManualForceEndAiPhase: vi.fn(() => null),
    resolveOnlineAiAutoRecoveryCompletionNotice: vi.fn(() => null),
    resolveForceEndTurnRecoveryStep: vi.fn(() => null),
    resolveForceEndTurnForStalledAi: vi.fn(() => null),
    resolveForceSkippableHiddenAiInteraction: vi.fn(() => null),
    submitOnlineAiResolution: vi.fn(),
    submitOnlineAiResolutionSequence: vi.fn(),
    shouldSilentlyRetryOnlineAiBatchRejection: vi.fn(() => false),
}));

vi.mock('../../engine/ai', () => ({
    resolveLocalAiActionDelayPlan: vi.fn(() => null),
    resolveNextAiDispatch: vi.fn(async () => ({ kind: 'unavailable' })),
    getGameAiRuntime: vi.fn(() => null),
    resolveOnlineAiDecisionView: vi.fn(() => null),
    isManualSetupSelectionEnabledForSeat: vi.fn(() => false),
    startCancelableAiDelay: vi.fn(() => ({
        cancel: vi.fn(),
    })),
}));

vi.mock('../../engine/ai/actionVisibility', () => ({
    resolveLocalAiActionVisibility: vi.fn(() => null),
}));

const renderMatchRoom = async () => {
    const { MatchRoom } = await import('../MatchRoom');
    return {
        MatchRoom,
        view: render(<MatchRoom />),
    };
};

describe('MatchRoom online route identity', () => {
    beforeEach(() => {
        cleanup();
        vi.clearAllMocks();
        vi.spyOn(Date, 'now').mockImplementation(() => mockNow);
        mockSearchParams = new URLSearchParams();
        mockMatchStatus = {
            isLoading: false,
            isHost: false,
            players: [{ id: 0, name: 'Alice', isConnected: true }],
            playersRevision: 0,
            opponentName: 'Bob',
            opponentConnected: true,
        };
        mockNow = 1_000_000;
        mockTransportMatchPlayers = [];
        mockTransportConnected = false;
        mockTransportState = null;
        mockProviderPlayerId = '0';
        mockOnlineAiSeatControllers = {};
        capturedGameProviderPlayerIds.length = 0;
        requestForceEndAiPhaseMock.mockClear();
        rejoinMatchMock.mockReset();
        localStorage.clear();
        localStorage.setItem('match_creds_match-1', JSON.stringify({
            matchID: 'match-1',
            playerID: '0',
            playerName: 'Alice',
            credentials: 'cred-0',
            gameName: 'smashup',
            updatedAt: Date.now() - 20_000,
        }));
    });

    afterEach(() => {
        cleanup();
        localStorage.clear();
        vi.restoreAllMocks();
    });

    it('无 URL 但有 stored seat 时，GameProvider 仍应收到 seat playerId', async () => {
        await renderMatchRoom();

        await waitFor(() => {
            expect(screen.getByTestId('game-provider')).toHaveAttribute('data-player-id', '0');
        });
        expect(capturedGameProviderPlayerIds).toContain('0');
        expect(navigateMock).toHaveBeenCalledWith('/play/smashup/match/match-1?playerID=0', { replace: true });
    });

    it('在线 AI 房房主应看到强制结束 AI 阶段按钮，并通过服务端恢复请求执行', async () => {
        mockMatchStatus = {
            ...mockMatchStatus,
            isHost: true,
            players: [
                { id: 0, name: 'Alice', isConnected: true },
                { id: 1, name: 'AI', isConnected: true },
            ],
        };
        mockOnlineAiSeatControllers = {
            '0': { type: 'human' },
            '1': { type: 'local-ai' },
        };

        await renderMatchRoom();

        await waitFor(() => {
            expect(screen.getByTestId('hud-force-end-ai-phase')).toBeInTheDocument();
        });
        await act(async () => {
            screen.getByTestId('hud-force-end-ai-phase').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(requestForceEndAiPhaseMock).toHaveBeenCalledTimes(1);
    });

    it('在线 AI 房服务端 runtime 应保留旧调试 API 读取当前权威状态', async () => {
        mockMatchStatus = {
            ...mockMatchStatus,
            isHost: true,
            players: [
                { id: 0, name: 'Alice', isConnected: true },
                { id: 1, name: 'AI', isConnected: true },
            ],
        };
        mockOnlineAiSeatControllers = {
            '0': { type: 'human' },
            '1': { type: 'local-ai' },
        };
        mockTransportState = {
            core: { activePlayerId: '1' },
            sys: {
                phase: 'main1',
                interaction: { current: undefined, queue: [], isBlocked: false },
                responseWindow: { current: undefined },
            },
        };

        await renderMatchRoom();

        await waitFor(() => {
            expect((window as any).__BG_ONLINE_AI_DEBUG__?.getSeatLatestState?.('1')).toBe(mockTransportState);
        });
        expect((window as any).__BG_ONLINE_AI_DEBUG__?.getSeatDecisionState?.('1')).toMatchObject({
            stage: 'server-authority-observed',
            playerId: '1',
            authority: 'server-online-ai-executor',
        });

        const overrideState = {
            core: { activePlayerId: '0' },
            sys: { phase: 'override' },
        };
        (window as any).__BG_ONLINE_AI_DEBUG__?.setSeatLatestStateOverride?.('1', overrideState);
        expect((window as any).__BG_ONLINE_AI_DEBUG__?.getSeatLatestState?.('1')).toBe(overrideState);
        (window as any).__BG_ONLINE_AI_DEBUG__?.clearSeatLatestStateOverride?.('1');
        expect((window as any).__BG_ONLINE_AI_DEBUG__?.getSeatLatestState?.('1')).toBe(mockTransportState);
    });

    it('当 URL seat 与本地 stored seat 冲突时，GameProvider 应以 stored seat 建立身份并修正 URL', async () => {
        mockSearchParams = new URLSearchParams('playerID=1');

        await renderMatchRoom();

        await waitFor(() => {
            expect(screen.getByTestId('game-provider')).toHaveAttribute('data-player-id', '0');
        });
        expect(capturedGameProviderPlayerIds).toContain('0');
        expect(navigateMock).toHaveBeenCalledWith('/play/smashup/match/match-1?playerID=0', { replace: true });
    });

    it('缺少 matchID 的半残本地凭据不应被当成有效 stored seat', async () => {
        localStorage.setItem('match_creds_match-1', JSON.stringify({
            playerID: '0',
            playerName: 'Alice',
            credentials: 'cred-0',
            gameName: 'smashup',
        }));

        await renderMatchRoom();

        await waitFor(() => {
            expect(screen.getByTestId('game-provider')).toHaveAttribute('data-player-id', 'null');
        });
        expect(capturedGameProviderPlayerIds).toContain(null);
        expect(navigateMock).not.toHaveBeenCalledWith('/play/smashup/match/match-1?playerID=0', { replace: true });
    });

    it('无 stored seat 且显式带 spectate=1 时，GameProvider 应保持 spectator/null 而不是借用 seat 身份', async () => {
        localStorage.clear();
        mockSearchParams = new URLSearchParams('spectate=1');

        await renderMatchRoom();

        await waitFor(() => {
            expect(screen.getByTestId('game-provider')).toHaveAttribute('data-player-id', 'null');
        });
        expect(capturedGameProviderPlayerIds).toContain(null);
        expect(navigateMock).not.toHaveBeenCalledWith('/play/smashup/match/match-1?playerID=0', { replace: true });
        expect(rejoinMatchMock).not.toHaveBeenCalled();
    });

    it('第一次缺 seat 只应挂起 pending clear，不应立刻把页面打回 spectator', async () => {
        mockMatchStatus = {
            ...mockMatchStatus,
            players: [{ id: 1, name: 'Bob', isConnected: true }],
        };

        const { MatchRoom, view } = await renderMatchRoom();

        await waitFor(() => {
            expect(screen.getByTestId('game-provider')).toHaveAttribute('data-player-id', '0');
        });
        await act(async () => {
            await Promise.resolve();
        });

        expect(localStorage.getItem('match_creds_match-1')).not.toBeNull();
        expect(screen.getByTestId('game-provider')).toHaveAttribute('data-player-id', '0');
        expect(toastWarningMock).not.toHaveBeenCalled();

        mockMatchStatus = {
            ...mockMatchStatus,
            playersRevision: mockMatchStatus.playersRevision + 1,
            players: [{ id: 1, name: 'Bob', isConnected: true }],
        };
        view.rerender(<MatchRoom />);

        await waitFor(() => {
            expect(localStorage.getItem('match_creds_match-1')).toBeNull();
        });
        expect(toastWarningMock).toHaveBeenCalledTimes(1);
    });

    it('transport 已确认 seat 时，REST 坏快照不应触发本地 seat 清理', async () => {
        mockTransportConnected = true;
        mockTransportMatchPlayers = [
            { id: 0, name: 'Alice', isConnected: true },
            { id: 1, name: 'Bob', isConnected: true },
        ];
        mockMatchStatus = {
            ...mockMatchStatus,
            players: [{ id: 1, name: 'Bob', isConnected: true }],
        };

        const { MatchRoom, view } = await renderMatchRoom();

        await waitFor(() => {
            expect(screen.getByTestId('game-provider')).toHaveAttribute('data-player-id', '0');
        });
        view.rerender(<MatchRoom />);

        expect(localStorage.getItem('match_creds_match-1')).not.toBeNull();
        expect(toastWarningMock).not.toHaveBeenCalled();
    });

    it('transport 已 ready 且不再包含 stored seat 时，不应被 REST 旧 seat 掩盖', async () => {
        mockTransportConnected = true;
        mockTransportMatchPlayers = [
            { id: 1, name: 'Bob', isConnected: true },
        ];
        mockMatchStatus = {
            ...mockMatchStatus,
            players: [
                { id: 0, name: 'Alice', isConnected: true },
                { id: 1, name: 'Bob', isConnected: true },
            ],
        };

        const { MatchRoom, view } = await renderMatchRoom();

        await waitFor(() => {
            expect(screen.getByTestId('game-provider')).toHaveAttribute('data-player-id', '0');
        });

        expect(localStorage.getItem('match_creds_match-1')).not.toBeNull();
        expect(toastWarningMock).not.toHaveBeenCalled();

        mockMatchStatus = {
            ...mockMatchStatus,
            playersRevision: mockMatchStatus.playersRevision + 1,
            players: [
                { id: 0, name: 'Alice', isConnected: true },
                { id: 1, name: 'Bob', isConnected: true },
            ],
        };
        view.rerender(<MatchRoom />);
        await waitFor(() => {
            expect(localStorage.getItem('match_creds_match-1')).toBeNull();
        });
        expect(toastWarningMock).toHaveBeenCalledTimes(1);
    });

    it('transport 刚断线仍在 grace 内时，REST 坏快照不应立刻清 seat；超出 grace 后才重新按两拍累计', async () => {
        mockTransportConnected = true;
        mockTransportMatchPlayers = [
            { id: 0, name: 'Alice', isConnected: true },
            { id: 1, name: 'Bob', isConnected: true },
        ];

        const { MatchRoom, view } = await renderMatchRoom();
        await waitFor(() => {
            expect(screen.getByTestId('game-provider')).toHaveAttribute('data-player-id', '0');
        });

        mockTransportConnected = false;
        mockMatchStatus = {
            ...mockMatchStatus,
            players: [{ id: 1, name: 'Bob', isConnected: true }],
        };
        mockNow += 5_000;
        view.rerender(<MatchRoom />);

        expect(localStorage.getItem('match_creds_match-1')).not.toBeNull();
        expect(toastWarningMock).not.toHaveBeenCalled();

        mockNow += 11_000;
        view.rerender(<MatchRoom />);
        expect(localStorage.getItem('match_creds_match-1')).not.toBeNull();
        expect(toastWarningMock).not.toHaveBeenCalled();

        mockMatchStatus = {
            ...mockMatchStatus,
            playersRevision: mockMatchStatus.playersRevision + 1,
            players: [{ id: 1, name: 'Bob', isConnected: true }],
        };
        view.rerender(<MatchRoom />);
        await waitFor(() => {
            expect(localStorage.getItem('match_creds_match-1')).toBeNull();
        });
        expect(toastWarningMock).toHaveBeenCalledTimes(1);
    });

    it('transport 在 resync 短窗口里临时回空时，仍应沿用最近确认过的 seat 快照而不是立刻按 REST 坏快照清 seat', async () => {
        mockTransportConnected = true;
        mockTransportMatchPlayers = [
            { id: 0, name: 'Alice', isConnected: true },
            { id: 1, name: 'Bob', isConnected: true },
        ];

        const { MatchRoom, view } = await renderMatchRoom();
        await waitFor(() => {
            expect(screen.getByTestId('game-provider')).toHaveAttribute('data-player-id', '0');
        });

        mockTransportConnected = true;
        mockTransportMatchPlayers = [];
        mockMatchStatus = {
            ...mockMatchStatus,
            players: [{ id: 1, name: 'Bob', isConnected: true }],
        };
        mockNow += 5_000;
        view.rerender(<MatchRoom />);

        expect(localStorage.getItem('match_creds_match-1')).not.toBeNull();
        expect(toastWarningMock).not.toHaveBeenCalled();

        mockNow += 11_000;
        view.rerender(<MatchRoom />);
        expect(localStorage.getItem('match_creds_match-1')).not.toBeNull();
        expect(toastWarningMock).not.toHaveBeenCalled();

        mockMatchStatus = {
            ...mockMatchStatus,
            playersRevision: mockMatchStatus.playersRevision + 1,
            players: [{ id: 1, name: 'Bob', isConnected: true }],
        };
        view.rerender(<MatchRoom />);
        await waitFor(() => {
            expect(localStorage.getItem('match_creds_match-1')).toBeNull();
        });
        expect(toastWarningMock).toHaveBeenCalledTimes(1);
    });

    it('合法 seat 快照恢复后应重置 pending clear，不应让后续单次坏快照直接清 seat', async () => {
        const { MatchRoom, view } = await renderMatchRoom();

        await waitFor(() => {
            expect(screen.getByTestId('game-provider')).toHaveAttribute('data-player-id', '0');
        });

        mockMatchStatus = {
            ...mockMatchStatus,
            players: [{ id: 1, name: 'Bob', isConnected: true }],
        };
        view.rerender(<MatchRoom />);

        expect(localStorage.getItem('match_creds_match-1')).not.toBeNull();
        expect(toastWarningMock).not.toHaveBeenCalled();

        mockMatchStatus = {
            ...mockMatchStatus,
            players: [
                { id: 0, name: 'Alice', isConnected: true },
                { id: 1, name: 'Bob', isConnected: true },
            ],
        };
        view.rerender(<MatchRoom />);

        expect(localStorage.getItem('match_creds_match-1')).not.toBeNull();
        expect(toastWarningMock).not.toHaveBeenCalled();

        mockMatchStatus = {
            ...mockMatchStatus,
            players: [{ id: 1, name: 'Bob', isConnected: true }],
        };
        view.rerender(<MatchRoom />);

        expect(localStorage.getItem('match_creds_match-1')).not.toBeNull();
        expect(toastWarningMock).not.toHaveBeenCalled();

        mockMatchStatus = {
            ...mockMatchStatus,
            playersRevision: mockMatchStatus.playersRevision + 1,
            players: [{ id: 1, name: 'Bob', isConnected: true }],
        };
        view.rerender(<MatchRoom />);
        await waitFor(() => {
            expect(localStorage.getItem('match_creds_match-1')).toBeNull();
        });
        expect(toastWarningMock).toHaveBeenCalledTimes(1);
    });

    it('live debug snapshot 应从 responseWindow.current 暴露 sourceId 与当前 responder', async () => {
        mockTransportState = {
            core: { currentPlayerIndex: 0 },
            sys: {
                phase: 'playCards',
                interaction: {
                    current: undefined,
                    queue: [],
                    isBlocked: false,
                },
                responseWindow: {
                    current: {
                        id: 'rw-1',
                        windowType: 'beforeScoring',
                        sourceId: 'secret-volcano',
                        responderQueue: ['1', '0'],
                        currentResponderIndex: 0,
                        passedPlayers: [],
                    },
                },
            },
        };
        mockTransportConnected = true;
        mockTransportMatchPlayers = [
            { id: 0, name: 'Alice', isConnected: true },
            { id: 1, name: 'Bob', isConnected: true },
        ];

        await renderMatchRoom();

        const liveSnapshot = (window as any).__BG_MATCHROOM_DEBUG__?.getLiveSnapshot?.();
        expect(liveSnapshot?.stateView?.responseWindowSourceId).toBe('secret-volcano');
        expect(liveSnapshot?.stateView?.responseWindowPlayerId).toBe('1');
    });
});
