/* @vitest-environment happy-dom */
import { createElement, useEffect } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

type MatchPlayer = { id: number; name: string; isConnected?: boolean };

async function loadMatchRoomWithOnlineMocks(args?: {
    storedMatchCreds?: Record<string, unknown> | null;
    matchPlayers?: MatchPlayer[];
    matchPlayersRef?: { current: MatchPlayer[] };
    matchPlayersRevisionRef?: { current: number };
    searchParams?: string;
    gameClientStateRef?: { current: any };
    resolveCurrentPlayerId?: (state: any) => string | null;
}) {
    vi.resetModules();
    localStorage.clear();
    if (args?.storedMatchCreds) {
        localStorage.setItem('match_creds_match-1', JSON.stringify(args.storedMatchCreds));
    }

    const gameProviderSpy = vi.fn();
    const gameModeSpy = vi.fn();
    const navigateMock = vi.fn();
    const setPlayerIDMock = vi.fn();
    const clearMatchCredentialsSpy = vi.fn();

    vi.doMock('react-i18next', () => ({
        initReactI18next: { type: '3rdParty', init: vi.fn() },
        useTranslation: () => ({
            t: (key: string) => key,
            i18n: { resolvedLanguage: 'zh-CN', language: 'zh-CN' },
        }),
    }));

    vi.doMock('react-router-dom', async () => {
        const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
        const searchParams = new URLSearchParams(args?.searchParams ?? '');
        const search = searchParams.toString();
        return {
            ...actual,
            useParams: () => ({ gameId: 'smashup', matchId: 'match-1', tutorialId: undefined }),
            useLocation: () => ({
                pathname: '/play/smashup/match/match-1',
                search: search ? `?${search}` : '',
                hash: '',
                state: null,
                key: 'match-room-route',
            }),
            useSearchParams: () => [searchParams, vi.fn()],
            useNavigate: () => navigateMock,
        };
    });

    vi.doMock('../../games/registry', () => ({
        getGameImplementation: () => ({
            board: () => createElement('div', { 'data-testid': 'board-stub' }, 'board'),
            engineConfig: {
                gameId: 'smashup',
                domain: {
                    gameId: 'smashup',
                    setup: () => ({ turnOrder: ['0', '1'], currentPlayerIndex: 0 }),
                    validate: () => ({ valid: true }),
                    execute: () => [],
                    reduce: (core: unknown) => core,
                },
                systems: [],
                onlineAiRecovery: {
                    resolveManualSetupSelectionActionKindFromCommand: ({ type, payload }: {
                        type: string;
                        payload: unknown;
                    }) => (
                        type === 'su:select_faction'
                        && typeof (payload as { factionId?: unknown } | undefined)?.factionId === 'string'
                            ? 'select-faction'
                            : undefined
                    ),
                },
            },
            latencyConfig: undefined,
            ai: null,
        }),
        resolveGameTutorialManifest: () => null,
        subscribeGameImplementationReady: () => () => undefined,
    }));

    vi.doMock('../../engine/transport/react', () => ({
        GameProvider: (props: any) => {
            gameProviderSpy(props);
            return createElement(
                'div',
                {
                    'data-testid': 'game-provider-probe',
                    'data-player-id': String(props.playerId),
                    'data-match-id': String(props.matchId),
                },
                'game-provider',
            );
        },
        LocalGameProvider: ({ children }: any) => createElement('div', null, children),
        BoardBridge: () => createElement('div', { 'data-testid': 'board-bridge-stub' }, 'board-bridge'),
        GameClientOverrideProvider: ({ children, dispatch, playerId }: any) => createElement(
            'div',
            {
                'data-testid': 'game-client-override-probe',
                'data-player-id': String(playerId ?? ''),
            },
            children,
            createElement('button', {
                type: 'button',
                'data-testid': 'override-select-robots',
                onClick: () => dispatch?.('su:select_faction', { factionId: 'robots' }),
            }, 'select robots'),
            createElement('button', {
                type: 'button',
                'data-testid': 'override-select-zombies',
                onClick: () => dispatch?.('su:select_faction', { factionId: 'zombies' }),
            }, 'select zombies'),
        ),
        buildAiProgressMarker: () => 'marker',
        releaseAiAttemptKeyIfMatches: () => undefined,
        tryReserveAiAttemptKey: () => true,
        useGameClient: () => ({
            state: args?.gameClientStateRef?.current ?? { core: {}, sys: {} },
            playerId: '0',
            dispatch: vi.fn(),
            commandError: null,
            reset: vi.fn(),
        }),
    }));

    vi.doMock('../../engine/transport/client', () => ({
        GameTransportClient: class {
            connect(): void {}
            disconnect(): void {}
        },
    }));

    vi.doMock('../../contexts/DebugContext', () => ({
        useDebug: () => ({ playerID: null, setPlayerID: setPlayerIDMock }),
    }));

    vi.doMock('../../contexts/TutorialContext', () => ({
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

    vi.doMock('../../contexts/ModalStackContext', () => ({
        useModalStack: () => ({
            openModal: vi.fn(() => 'modal-1'),
            closeModal: vi.fn(),
        }),
    }));

    vi.doMock('../../contexts/ToastContext', () => ({
        useToast: () => ({
            warning: vi.fn(),
            error: vi.fn(),
        }),
    }));

    vi.doMock('../../contexts/AuthContext', () => ({
        useAuth: () => ({
            user: null,
            token: null,
        }),
    }));

    vi.doMock('../../hooks/useGameNamespaceReady', () => ({
        useGameNamespaceReady: () => ({
            isGameNamespaceReady: true,
            gameNamespaceError: null,
            retryGameNamespaceLoad: vi.fn(),
        }),
    }));

    vi.doMock('../../games/useGameImplementationReady', () => ({
        useGameImplementationReady: () => ({
            isGameImplementationReady: true,
            gameImplementationError: null,
            retryGameImplementationLoad: vi.fn(),
        }),
    }));

    vi.doMock('../../hooks/ui/usePerformanceMonitor', () => ({
        usePerformanceMonitor: () => undefined,
    }));

    vi.doMock('../../hooks/match/useMatchStatus', async () => {
        const actual = await vi.importActual<typeof import('../../hooks/match/useMatchStatus')>('../../hooks/match/useMatchStatus');
        return {
            ...actual,
            useMatchStatus: () => ({
                isHost: false,
                players: args?.matchPlayersRef?.current ?? args?.matchPlayers ?? [
                    { id: 0, name: 'Alice', isConnected: true },
                    { id: 1, name: 'Bob', isConnected: true },
                ],
                playersRevision: args?.matchPlayersRevisionRef?.current ?? 0,
                opponentName: 'Bob',
                opponentConnected: true,
                isLoading: false,
            }),
            clearMatchCredentials: (matchId: string) => {
                clearMatchCredentialsSpy(matchId);
                return actual.clearMatchCredentials(matchId);
            },
            leaveMatch: vi.fn(async () => ({ success: true })),
            destroyMatch: vi.fn(async () => ({ success: true })),
            rejoinMatch: vi.fn(async () => ({ success: false, error: 'not_found' })),
        };
    });

    vi.doMock('../../config/server', () => ({
        getGameServerUrl: () => 'ws://test-server',
    }));

    vi.doMock('../../config/games.config', () => ({
        getGameById: () => ({
            id: 'smashup',
            mobileBattlefieldZoom: undefined,
            cursorTheme: undefined,
            fontFamily: undefined,
        }),
    }));

    vi.doMock('../../shared/mobileSupport', () => ({
        getGamePageDataAttributes: () => ({}),
        resolveGameMobileSupport: (config: { preferredOrientation?: unknown }) => ({
            preferredOrientation: config.preferredOrientation,
        }),
        syncGamePageDocumentAttributes: () => undefined,
    }));

    vi.doMock('../../components/game/framework/widgets/GameHUD', () => ({
        GameHUD: () => null,
        resolveGameHudPhase: () => null,
    }));

    vi.doMock('../../contexts/GameModeContext', () => ({
        GameModeProvider: (props: any) => {
            gameModeSpy(props);
            return createElement(
                'div',
                {
                    'data-testid': 'game-mode-probe',
                    'data-spectator': String(Boolean(props.isSpectator)),
                },
                props.children,
            );
        },
        useGameMode: () => ({ mode: 'online' }),
    }));

    vi.doMock('../../components/common/SEO', () => ({
        SEO: () => null,
    }));

    vi.doMock('../../components/system/LoadingScreen', () => ({
        LoadingScreen: () => createElement('div', { 'data-testid': 'loading-screen-stub' }, 'loading'),
    }));

    vi.doMock('../../components/system/ConnectionLoadingScreen', () => ({
        ConnectionLoadingScreen: () => null,
    }));

    vi.doMock('../../components/system/GameNamespaceLoadError', () => ({
        GameNamespaceLoadError: () => null,
    }));

    vi.doMock('../../components/game/framework', () => ({
        CriticalImageGate: ({ children }: any) => createElement('div', null, children),
        MobileBoardShell: ({ children }: any) => createElement('div', { 'data-testid': 'mobile-board-shell-stub' }, children),
        resolveMatchSeatSwapContext: () => null,
    }));

    vi.doMock('../../core', () => ({
        preloadWarmImages: () => undefined,
        UI_Z_INDEX: { loading: 1 },
        HudPortal: ({ children }: any) => createElement('div', null, children),
    }));

    vi.doMock('../../core/CriticalImageResolverRegistry', () => ({
        resolveCriticalImages: () => [],
    }));

    vi.doMock('../../lib/audio/useGameAudio', () => ({
        playDeniedSound: () => undefined,
    }));

    vi.doMock('../../lib/matchLoadTrace', () => ({
        appendMatchLoadTrace: () => undefined,
    }));

    vi.doMock('../../lib/mobile/mobileRuntimeDebug', () => ({
        logMobileRuntimeCritical: () => undefined,
    }));

    vi.doMock('../../lib/mobile/androidRuntime', () => ({
        isNativeAndroidRuntime: () => false,
    }));

    vi.doMock('../../lib/mobile/appVisibility', () => ({
        onAppVisible: () => () => undefined,
    }));

    vi.doMock('../../lib/logger', () => ({
        createScopedLogger: () => ({
            info: () => undefined,
            warn: () => undefined,
            error: () => undefined,
            debug: () => undefined,
        }),
    }));

    vi.doMock('../../engine/transport/errorI18n', () => ({
        isUiHintOnlyError: () => false,
        resolveCommandError: () => 'command_error',
    }));

    vi.doMock('../../engine/transport/onlineAiRecovery', async () => {
        const actual = await vi.importActual<typeof import('../../engine/transport/onlineAiRecovery')>('../../engine/transport/onlineAiRecovery');
        return {
            ...actual,
            resolveOnlineAiCurrentPlayerId: (state: any) => args?.resolveCurrentPlayerId?.(state) ?? '0',
        };
    });

    vi.doMock('../../core/cursor', () => ({
        GameCursorProvider: ({ children }: any) => createElement('div', null, children),
    }));

    vi.doMock('../../games/smashup/ui/SmashUpOverlayContext', () => ({
        SmashUpOverlayProvider: ({ children }: any) => createElement('div', null, children),
    }));

    vi.doMock('../../games/smashup/ui/CardMagnifyOverlay', () => ({
        SMASHUP_FORCE_DISMISS_EVENT: 'smashup-force-dismiss',
    }));

    vi.doMock('../../components/lobby/roomActions', () => ({
        notifyExitMatchErrorToast: () => undefined,
        resolveExitMatchErrorMessageKey: () => 'exit.error',
    }));

    vi.doMock('../../components/lobby/gameDetailsContent', () => ({
        resolveGameDisplayName: () => 'SmashUp',
    }));

    vi.doMock('../matchHudPresence', () => ({
        resolveOnlineHudPresence: () => ({
            opponentName: 'Bob',
            opponentConnected: true,
            presenceReady: true,
            players: args?.matchPlayers ?? [
                { id: 0, name: 'Alice', isConnected: true },
                { id: 1, name: 'Bob', isConnected: true },
            ],
        }),
    }));

    vi.doMock('../onlineAiSeats', () => ({
        haveAiSeatCredentialsChanged: () => false,
        loadOnlineAiSeatState: () => ({}),
        resolveMissingOnlineAiSeatCredentialIds: () => [],
    }));

    vi.doMock('../onlineAiForceSkip', () => ({
        applyAiAutoRecoveryRejection: () => undefined,
        finalizeOnlineAiResolutionConfirmation: () => undefined,
        resolveCurrentPlayerId: (state: any) => args?.resolveCurrentPlayerId?.(state) ?? '0',
        resolveManualForceEndAiPhase: () => null,
        resolveOnlineAiAutoRecoveryCompletionNotice: () => null,
        resolveForceEndTurnRecoveryStep: () => null,
        resolveForceEndTurnForStalledAi: () => null,
        resolveForceSkippableHiddenAiInteraction: () => null,
        submitOnlineAiResolution: () => undefined,
        submitOnlineAiResolutionSequence: () => undefined,
        shouldSilentlyRetryOnlineAiBatchRejection: () => false,
    }));

    vi.doMock('../../engine/ai', () => ({
        resolveLocalAiActionDelayPlan: () => null,
        resolveNextAiDispatch: vi.fn(async () => ({ kind: 'none' })),
        getGameAiRuntime: () => null,
        resolveOnlineAiDecisionView: () => null,
        startCancelableAiDelay: () => ({ cancel: () => undefined }),
        isManualSetupSelectionEnabledForSeat: (controller: {
            type?: unknown;
            manualSetupSelection?: unknown;
            manualFactionSelection?: unknown;
        } | null | undefined) => (
            controller?.type !== 'human'
            && (
                controller?.manualSetupSelection === true
                || controller?.manualFactionSelection === true
            )
        ),
    }));

    vi.doMock('../../engine/ai/actionVisibility', () => ({
        resolveLocalAiActionVisibility: () => null,
    }));

    vi.doMock('../../engine/systems', () => ({
        INTERACTION_COMMANDS: {},
    }));

    vi.doMock('../../components/tutorial/TutorialOverlay', () => ({
        TutorialOverlay: () => null,
    }));

    vi.doMock('../../components/common/overlays/ConfirmModal', () => ({
        ConfirmModal: () => null,
    }));

    vi.doMock('../../contexts/RematchContext', () => ({
        RematchProvider: ({ children }: any) => createElement('div', null, children),
    }));

    const { MatchRoom, OnlineManualFactionSelectionBridge } = await import('../MatchRoom');
    return {
        MatchRoom,
        OnlineManualFactionSelectionBridge,
        clearMatchCredentialsSpy,
        gameModeSpy,
        gameProviderSpy,
        navigateMock,
        setPlayerIDMock,
    };
}

describe('MatchRoom route identity integration', () => {
    afterEach(() => {
        cleanup();
        localStorage.clear();
        vi.resetModules();
    });

    it('无 URL playerID 但 localStorage 已有 seat 时，首帧不应把 GameProvider 挂成 spectator/null', async () => {
        const {
            MatchRoom,
            gameModeSpy,
            gameProviderSpy,
            navigateMock,
            setPlayerIDMock,
        } = await loadMatchRoomWithOnlineMocks({
            storedMatchCreds: {
                matchID: 'match-1',
                playerID: '0',
                credentials: 'cred-0',
                gameName: 'smashup',
                updatedAt: Date.now(),
            },
        });

        render(createElement(MatchRoom));

        await waitFor(() => {
            expect(screen.getByTestId('game-provider-probe')).toHaveAttribute('data-player-id', '0');
        });
        expect(screen.getByTestId('game-mode-probe')).toHaveAttribute('data-spectator', 'false');
        expect(navigateMock).toHaveBeenCalledWith('/play/smashup/match/match-1?playerID=0', { replace: true });
        expect(gameProviderSpy).toHaveBeenCalled();
        expect(gameModeSpy).toHaveBeenCalled();
        expect(setPlayerIDMock).toHaveBeenCalledWith('0');
    });

    it('即使 URL 显式带 spectate=1，只要 localStorage 仍有 stored seat，集成链也不应把 GameProvider 挂成 spectator/null', async () => {
        const {
            MatchRoom,
            navigateMock,
        } = await loadMatchRoomWithOnlineMocks({
            storedMatchCreds: {
                matchID: 'match-1',
                playerID: '0',
                credentials: 'cred-0',
                gameName: 'smashup',
                updatedAt: Date.now(),
            },
            searchParams: 'spectate=1',
        });

        render(createElement(MatchRoom));

        await waitFor(() => {
            expect(screen.getByTestId('game-provider-probe')).toHaveAttribute('data-player-id', '0');
        });
        expect(screen.getByTestId('game-mode-probe')).toHaveAttribute('data-spectator', 'false');
        expect(navigateMock).not.toHaveBeenCalled();
    });

    it('最近刚写入的 stored seat 即使 matchStatus 暂时缺少该座位，也不应立刻清空凭据并退回 spectator', async () => {
        const {
            MatchRoom,
            clearMatchCredentialsSpy,
        } = await loadMatchRoomWithOnlineMocks({
            storedMatchCreds: {
                matchID: 'match-1',
                playerID: '0',
                credentials: 'cred-0',
                gameName: 'smashup',
                updatedAt: Date.now(),
            },
            matchPlayers: [
                { id: 1, name: 'Bob', isConnected: true },
            ],
        });

        render(createElement(MatchRoom));

        await waitFor(() => {
            expect(screen.getByTestId('game-provider-probe')).toHaveAttribute('data-player-id', '0');
        });
        expect(screen.getByTestId('game-mode-probe')).toHaveAttribute('data-spectator', 'false');
        expect(clearMatchCredentialsSpy).not.toHaveBeenCalled();
        expect(localStorage.getItem('match_creds_match-1')).not.toBeNull();
    });

    it('过期 stored seat 且 matchStatus 持续缺少该座位时，必须连续两次稳定坏快照后才清空凭据并退回 spectator', async () => {
        const matchPlayersRef = {
            current: [
                { id: 1, name: 'Bob', isConnected: true },
            ] satisfies MatchPlayer[],
        };
        const matchPlayersRevisionRef = { current: 0 };
        const {
            MatchRoom,
            clearMatchCredentialsSpy,
        } = await loadMatchRoomWithOnlineMocks({
            storedMatchCreds: {
                matchID: 'match-1',
                playerID: '0',
                credentials: 'cred-0',
                gameName: 'smashup',
                updatedAt: Date.now() - 20_000,
            },
            matchPlayersRef,
            matchPlayersRevisionRef,
        });

        render(createElement(MatchRoom));

        await waitFor(() => {
            expect(screen.getByTestId('game-provider-probe')).toHaveAttribute('data-player-id', '0');
        });
        expect(screen.getByTestId('game-mode-probe')).toHaveAttribute('data-spectator', 'false');
        expect(clearMatchCredentialsSpy).not.toHaveBeenCalled();
        expect(localStorage.getItem('match_creds_match-1')).not.toBeNull();

        matchPlayersRef.current = [
            { id: 1, name: 'Bob', isConnected: true },
        ];
        matchPlayersRevisionRef.current += 1;
        await act(async () => {
            window.dispatchEvent(new Event('owner-active-match-changed'));
        });

        await waitFor(() => {
            expect(clearMatchCredentialsSpy).toHaveBeenCalledWith('match-1');
        });
        await waitFor(() => {
            expect(screen.getByTestId('game-provider-probe')).toHaveAttribute('data-player-id', 'null');
        });
        expect(screen.getByTestId('game-mode-probe')).toHaveAttribute('data-spectator', 'true');
        expect(localStorage.getItem('match_creds_match-1')).toBeNull();
    });

    it('stale seat 在中间恢复正常后必须重置 pending clear，后续新的坏快照仍需重新累计两拍', async () => {
        const matchPlayersRef = {
            current: [
                { id: 1, name: 'Bob', isConnected: true },
            ] satisfies MatchPlayer[],
        };
        const matchPlayersRevisionRef = { current: 0 };
        const {
            MatchRoom,
            clearMatchCredentialsSpy,
        } = await loadMatchRoomWithOnlineMocks({
            storedMatchCreds: {
                matchID: 'match-1',
                playerID: '0',
                credentials: 'cred-0',
                gameName: 'smashup',
                updatedAt: Date.now() - 20_000,
            },
            matchPlayersRef,
            matchPlayersRevisionRef,
        });

        render(createElement(MatchRoom));

        await waitFor(() => {
            expect(screen.getByTestId('game-provider-probe')).toHaveAttribute('data-player-id', '0');
        });
        expect(clearMatchCredentialsSpy).not.toHaveBeenCalled();

        matchPlayersRef.current = [
            { id: 0, name: 'Alice', isConnected: true },
            { id: 1, name: 'Bob', isConnected: true },
        ];
        matchPlayersRevisionRef.current += 1;
        await act(async () => {
            window.dispatchEvent(new Event('owner-active-match-changed'));
        });
        expect(clearMatchCredentialsSpy).not.toHaveBeenCalled();
        await waitFor(() => {
            expect(screen.getByTestId('game-provider-probe')).toHaveAttribute('data-player-id', '0');
        });

        matchPlayersRef.current = [
            { id: 1, name: 'Bob', isConnected: true },
        ];
        matchPlayersRevisionRef.current += 1;
        await act(async () => {
            window.dispatchEvent(new Event('owner-active-match-changed'));
        });
        expect(clearMatchCredentialsSpy).not.toHaveBeenCalled();
        await waitFor(() => {
            expect(screen.getByTestId('game-provider-probe')).toHaveAttribute('data-player-id', '0');
        });

        matchPlayersRef.current = [
            { id: 1, name: 'Bob', isConnected: true },
        ];
        matchPlayersRevisionRef.current += 1;
        await act(async () => {
            window.dispatchEvent(new Event('owner-active-match-changed'));
        });
        await waitFor(() => {
            expect(clearMatchCredentialsSpy).toHaveBeenCalledWith('match-1');
        });
        await waitFor(() => {
            expect(screen.getByTestId('game-provider-probe')).toHaveAttribute('data-player-id', 'null');
        });
    });

    it('手动代 AI 选派系时，接管座位切换不应重挂载整个对局子树', async () => {
        const gameClientStateRef = {
            current: {
                core: {
                    hostStarted: false,
                    factionSelection: {
                        playerSelections: {
                            '0': ['aliens'],
                            '1': [],
                            '2': [],
                        },
                    },
                },
                sys: {
                    phase: 'factionSelect',
                    currentPlayerId: '0',
                },
            },
        };

        const {
            OnlineManualFactionSelectionBridge,
        } = await loadMatchRoomWithOnlineMocks({
            gameClientStateRef,
            resolveCurrentPlayerId: (state) => state?.sys?.currentPlayerId ?? null,
        });

        const mountSpy = vi.fn();
        const unmountSpy = vi.fn();

        const MountProbe = () => {
            useEffect(() => {
                mountSpy();
                return () => {
                    unmountSpy();
                };
            }, []);
            return createElement('div', { 'data-testid': 'manual-ai-bridge-child' }, 'bridge-child');
        };

        const seatControllers = {
            '0': { type: 'human' },
            '1': { type: 'local-ai', manualFactionSelection: true },
            '2': { type: 'local-ai', manualFactionSelection: true },
        } as const;

        const dispatchManualAiCommand = vi.fn();
        const { rerender } = render(createElement(
            OnlineManualFactionSelectionBridge,
            {
                seatControllers,
                dispatchManualAiCommand,
            },
            createElement(MountProbe),
        ));

        await waitFor(() => {
            expect(screen.getByTestId('manual-ai-bridge-child')).toBeInTheDocument();
        });
        expect(mountSpy).toHaveBeenCalledTimes(1);
        expect(unmountSpy).not.toHaveBeenCalled();

        gameClientStateRef.current = {
            ...gameClientStateRef.current,
            sys: {
                ...gameClientStateRef.current.sys,
                currentPlayerId: '1',
            },
        };

        rerender(createElement(
            OnlineManualFactionSelectionBridge,
            {
                seatControllers,
                dispatchManualAiCommand,
            },
            createElement(MountProbe),
        ));

        await waitFor(() => {
            expect(screen.getByTestId('manual-ai-bridge-child')).toBeInTheDocument();
        });
        expect(mountSpy).toHaveBeenCalledTimes(1);
        expect(unmountSpy).not.toHaveBeenCalled();

        gameClientStateRef.current = {
            ...gameClientStateRef.current,
            sys: {
                ...gameClientStateRef.current.sys,
                currentPlayerId: '2',
            },
        };

        rerender(createElement(
            OnlineManualFactionSelectionBridge,
            {
                seatControllers,
                dispatchManualAiCommand,
            },
            createElement(MountProbe),
        ));

        await waitFor(() => {
            expect(screen.getByTestId('manual-ai-bridge-child')).toBeInTheDocument();
        });
        expect(mountSpy).toHaveBeenCalledTimes(1);
        expect(unmountSpy).not.toHaveBeenCalled();
    });

    it('手动代 AI 选派系提交未被 shared state 吸收前，应抑制旧状态下的重复提交', async () => {
        const gameClientStateRef = {
            current: {
                core: {
                    factionSelection: {
                        playerSelections: {
                            '0': ['aliens'],
                            '1': [],
                            '2': [],
                        },
                    },
                },
                sys: {
                    phase: 'factionSelect',
                    currentPlayerId: '1',
                },
            },
        };

        const {
            OnlineManualFactionSelectionBridge,
        } = await loadMatchRoomWithOnlineMocks({
            gameClientStateRef,
            resolveCurrentPlayerId: (state) => state?.sys?.currentPlayerId ?? null,
        });

        const seatControllers = {
            '0': { type: 'human' },
            '1': { type: 'local-ai', manualFactionSelection: true },
            '2': { type: 'local-ai', manualFactionSelection: true },
        } as const;
        const dispatchManualAiCommand = vi.fn(() => true);
        const { rerender } = render(createElement(
            OnlineManualFactionSelectionBridge,
            {
                seatControllers,
                dispatchManualAiCommand,
            },
            createElement('div', { 'data-testid': 'manual-ai-bridge-child' }, 'bridge-child'),
        ));

        await act(async () => {
            screen.getByTestId('override-select-robots').dispatchEvent(new MouseEvent('click', { bubbles: true }));
            screen.getByTestId('override-select-zombies').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(dispatchManualAiCommand).toHaveBeenCalledTimes(1);
        expect(dispatchManualAiCommand).toHaveBeenCalledWith('1', 'su:select_faction', { factionId: 'robots' });

        gameClientStateRef.current = {
            core: {
                factionSelection: {
                    playerSelections: {
                        '0': ['aliens'],
                        '1': ['robots'],
                        '2': [],
                    },
                },
            },
            sys: {
                phase: 'factionSelect',
                currentPlayerId: '2',
            },
        };

        rerender(createElement(
            OnlineManualFactionSelectionBridge,
            {
                seatControllers,
                dispatchManualAiCommand,
            },
            createElement('div', { 'data-testid': 'manual-ai-bridge-child' }, 'bridge-child'),
        ));

        await act(async () => {
            screen.getByTestId('override-select-zombies').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(dispatchManualAiCommand).toHaveBeenCalledTimes(2);
        expect(dispatchManualAiCommand).toHaveBeenLastCalledWith('2', 'su:select_faction', { factionId: 'zombies' });
    });

    it('手动代 AI 选派系提交未被 shared state 吸收前，应临时退出 AI 座位接管避免 UI 继续可点', async () => {
        const gameClientStateRef = {
            current: {
                core: {
                    factionSelection: {
                        playerSelections: {
                            '0': ['aliens'],
                            '1': [],
                            '2': [],
                        },
                    },
                },
                sys: {
                    phase: 'factionSelect',
                    currentPlayerId: '1',
                },
            },
        };

        const {
            OnlineManualFactionSelectionBridge,
        } = await loadMatchRoomWithOnlineMocks({
            gameClientStateRef,
            resolveCurrentPlayerId: (state) => state?.sys?.currentPlayerId ?? null,
        });

        const seatControllers = {
            '0': { type: 'human' },
            '1': { type: 'local-ai', manualFactionSelection: true },
            '2': { type: 'local-ai', manualFactionSelection: true },
        } as const;
        const dispatchManualAiCommand = vi.fn(() => true);
        const { rerender } = render(createElement(
            OnlineManualFactionSelectionBridge,
            {
                seatControllers,
                dispatchManualAiCommand,
            },
            createElement('div', { 'data-testid': 'manual-ai-bridge-child' }, 'bridge-child'),
        ));

        expect(screen.getByTestId('game-client-override-probe')).toHaveAttribute('data-player-id', '1');

        await act(async () => {
            screen.getByTestId('override-select-robots').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(dispatchManualAiCommand).toHaveBeenCalledTimes(1);
        await waitFor(() => {
            expect(screen.getByTestId('game-client-override-probe')).toHaveAttribute('data-player-id', '');
        });

        await act(async () => {
            screen.getByTestId('override-select-zombies').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(dispatchManualAiCommand).toHaveBeenCalledTimes(1);

        gameClientStateRef.current = {
            core: {
                factionSelection: {
                    playerSelections: {
                        '0': ['aliens'],
                        '1': ['robots'],
                        '2': [],
                    },
                },
            },
            sys: {
                phase: 'factionSelect',
                currentPlayerId: '2',
            },
        };

        rerender(createElement(
            OnlineManualFactionSelectionBridge,
            {
                seatControllers,
                dispatchManualAiCommand,
            },
            createElement('div', { 'data-testid': 'manual-ai-bridge-child' }, 'bridge-child'),
        ));

        await waitFor(() => {
            expect(screen.getByTestId('game-client-override-probe')).toHaveAttribute('data-player-id', '2');
        });
    });
});
