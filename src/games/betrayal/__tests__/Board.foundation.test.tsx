/* @vitest-environment happy-dom */
import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type {
  MatchState,
  RandomFn,
} from '../../../engine/types';
import { TutorialProvider } from '../../../contexts/TutorialContext';
import { GameModeProvider } from '../../../contexts/GameModeContext';
import { ToastProvider } from '../../../contexts/ToastContext';
import Board from '../Board';
import { resolveBetrayalRerollTargetBoxSize } from '../recentRollPresentation';
import { canUseRabbitFootForRecentRoll } from '../possessionActionReadModel';
import {
  resolvePendingEventRollResolutionRequiredPlayerIds,
  resolveRecentRollRequiredPlayerIds,
} from '../acknowledgementReadModel';
import {
  resolveExplorableRoomSlots,
  resolveRoomPlacementPreview,
} from '../roomDiscoveryModel';
import {
  BetrayalDomain,
  EXPLORER_CATALOG,
  createBetrayalCharacterSelectCore,
  createBetrayalFoundationCore,
  type BetrayalCore,
  type BetrayalTraitKey,
  type UseEffectProfile,
} from '../game';
import { BETRAYAL_COMMANDS } from '../commands';
import type { BetrayalCommandMap } from '../commandTypes';
import { resolveHelpingHandsTrollHandMoveOptions } from '../hauntAttackRewardReadModel';
import {
  resolveBetrayalMonsterActionPanel,
  resolveBetrayalMonsterMoveTargetRooms,
  resolveBetrayalMonsterMovementGroups,
  resolveBetrayalNormalMonsterAttackTargets,
  resolveMagicCameraPhantomAttackTargets,
  type BetrayalMonsterMovementRollGroupResult,
} from '../monsterActionReadModel';
import {
  applyBetrayalCommand,
  BETRAYAL_FIXED_RANDOM,
  createBetrayalCommand,
  createBetrayalScriptedRandom,
  createCorpseLootReadyCore,
  createCrimsonJackHauntCore,
  createFirstScenarioHauntCore,
  createStartedFirstScenarioCore,
  createStartedFirstScenarioTutorialCore,
  createJackSpiritMovementRollReadyCore,
  createJackSpiritPostReviveAttackReadyCore,
  createMummyTraitorVictoryReadyTutorialCore,
  playMummyScenarioToSurvivorVictory,
  playMummyScenarioToTraitorVictory,
  playFirstScenarioToSurvivorVictory,
} from '../testing/firstScenarioTestUtils';
import {
  BETRAYAL_DISCOVERY_POOLS,
  BETRAYAL_SCENARIO_CONFIGS,
  DEFAULT_BETRAYAL_SCENARIO_CARD_ID,
} from '../scenarioConfig';
import gameLocale from '../../../../public/locales/zh-CN/game-betrayal.json';
import commonLocale from '../../../../public/locales/zh-CN/common.json';

type TranslationTree = Record<string, string | TranslationTree>;

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
] as const;

function expectNoForbiddenPlayerUiInternalCopy(container: HTMLElement = document.body) {
    for (const phrase of FORBIDDEN_PLAYER_UI_INTERNAL_COPY) {
        expect(container).not.toHaveTextContent(phrase);
    }
}

function readVisibleNonSrText(container: HTMLElement) {
    const chunks: string[] = [];
    const isHiddenForPlayer = (element: HTMLElement) => {
        for (let current: HTMLElement | null = element; current; current = current.parentElement) {
            if (current.classList.contains('sr-only')) return true;
            if (current.hidden || current.getAttribute('aria-hidden') === 'true') return true;
            const style = window.getComputedStyle(current);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                return true;
            }
            if (current === container) break;
        }
        return false;
    };
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let current = walker.nextNode();
    while (current) {
        const parent = current.parentElement;
        const text = current.textContent?.replace(/\s+/g, ' ').trim() ?? '';
        if (parent && text && !isHiddenForPlayer(parent)) {
            chunks.push(text);
        }
        current = walker.nextNode();
    }
    return chunks.join(' ').replace(/\s+/g, ' ').trim();
}

function expectEventRollConfirmButtonStyle(button: HTMLElement) {
    expect(button).toHaveClass('bg-[#d6b56d]');
    expect(button).toHaveClass('border-[#d6b56d]');
    expect(button.className).not.toContain('rounded');
}

describe('Betrayal dice reroll hit targets', () => {
    it('物理骰重掷可点区贴合骰面，避免透明热区重叠抢命中', () => {
        const layout = {
            id: 2,
            x: 500,
            y: 300,
            width: 78,
            height: 74,
            visualWidth: 56,
            visualHeight: 52,
            minX: 470,
            maxX: 526,
            minY: 274,
            maxY: 326,
            rotateX: 0.2,
            rotateY: 0.1,
            rotateZ: 0.38,
        };
        const size = resolveBetrayalRerollTargetBoxSize(layout);
        const visibleMax = Math.max(56, 52);
        const transparentHitBoxPadding = (size - visibleMax) / 2;

        expect(size).toBe(56);
        expect(transparentHitBoxPadding).toBe(0);
    });

    it('物理骰较小时透明命中区仍贴合投影，不再留下外扩间隙', () => {
        const layout = {
            id: 1,
            x: 500,
            y: 300,
            width: 42,
            height: 42,
            visualWidth: 31.98,
            visualHeight: 31.98,
            minX: 484.01,
            maxX: 515.99,
            minY: 284.01,
            maxY: 315.99,
            rotateX: 0.2,
            rotateY: 0.1,
            rotateZ: 0.38,
        };
        const size = resolveBetrayalRerollTargetBoxSize(layout);
        const visibleMax = Math.max(layout.visualWidth, layout.visualHeight);
        const transparentHitBoxPadding = (size - visibleMax) / 2;

        expect(size).toBeCloseTo(31.98, 2);
        expect(transparentHitBoxPadding).toBe(0);
    });
});

function expectDiscoveryBackdropFullscreen(panel: HTMLElement = screen.getByTestId('betrayal-discovery-panel')) {
    const className = panel.className;
    expect(className).toContain('inset-0');
    expect(className).not.toContain('md:left-');
    expect(className).not.toContain('md:right-');
}

function collectCurrentRuntimePossessionCards(): BetrayalCore['currentExplorer']['inventory'] {
    const cards = [
        ...BETRAYAL_DISCOVERY_POOLS.possessions.item,
        ...BETRAYAL_DISCOVERY_POOLS.possessions.omen,
        ...Object.values(BETRAYAL_SCENARIO_CONFIGS['first-scenario'].startingInventoryByExplorerId).flat(),
    ];
    const seenCardIds = new Set<string>();
    return cards
        .filter((card) => {
            if (seenCardIds.has(card.id)) {
                return false;
            }
            seenCardIds.add(card.id);
            return true;
        })
        .map((card) => ({ ...card }));
}

function requireRuntimeOmenCard(cardId: string): BetrayalCore['currentExplorer']['inventory'][number] {
    const card = BETRAYAL_DISCOVERY_POOLS.possessions.omen.find((candidate) => candidate.id === cardId);
    if (!card) {
        throw new Error(`山屋单测缺少真实预兆卡：${cardId}`);
    }
    return { ...card };
}

function lethalDamageTraitsForPendingAllocation(core: BetrayalCore): NonNullable<BetrayalCore['pendingDamageAllocation']>['allowedTraits'] {
    const pending = core.pendingDamageAllocation;
    if (!pending) {
        throw new Error('expected pending damage allocation');
    }
    const explorer = [core.currentExplorer, ...core.otherExplorers].find((candidate) => candidate.playerId === pending.playerId);
    if (!explorer) {
        throw new Error(`missing pending damage explorer ${pending.playerId}`);
    }
    const traits: NonNullable<BetrayalCore['pendingDamageAllocation']>['allowedTraits'] = [];
    let remaining = pending.amount;
    for (const trait of pending.allowedTraits) {
        if (remaining <= 0) {
            break;
        }
        const track = explorer.traitTracks[trait];
        const floorPosition = pending.allowSkull ? track.skullPosition : track.criticalPosition;
        const take = Math.min(remaining, Math.max(0, track.position - floorPosition));
        traits.push(...Array.from({ length: take }, () => trait));
        remaining -= take;
    }
    return traits;
}

function resolveTranslation(tree: TranslationTree, key: string): string | undefined {
    return key.split('.').reduce<string | TranslationTree | undefined>((value, segment) => {
        if (!value || typeof value === 'string') {
            return undefined;
        }
        return value[segment];
    }, tree) as string | undefined;
}

function interpolate(template: string, options?: Record<string, unknown>): string {
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, token: string) => String(options?.[token] ?? ''));
}

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options?: Record<string, unknown>) => {
            const [namespace, plainKey] = key.includes(':') ? key.split(':', 2) : ['game-betrayal', key];
            const tree = namespace === 'common' ? commonLocale as TranslationTree : gameLocale as TranslationTree;
            const resolved = resolveTranslation(tree, plainKey);
            return typeof resolved === 'string' ? interpolate(resolved, options) : key;
        },
        i18n: { language: 'zh-CN' },
    }),
    initReactI18next: {
        type: '3rdParty',
        init: vi.fn(),
    },
}));

vi.mock('../../../components/common/media/OptimizedImage', () => ({
    OptimizedImage: ({ src, alt, ...rest }: React.ImgHTMLAttributes<HTMLImageElement> & { src: string }) => (
        <img alt={alt} data-src={src} {...rest} />
    ),
}));

vi.mock('../../../lib/audio/useGameAudio', () => ({
    playSound: vi.fn(),
    useGameAudio: vi.fn(),
}));

vi.mock('../../../lib/dice-physics/DiceBoxPhysicsSource', async () => {
    const ReactActual = await vi.importActual<typeof import('react')>('react');
    const actual = await vi.importActual<typeof import('../../../lib/dice-physics/DiceBoxPhysicsSource')>(
        '../../../lib/dice-physics/DiceBoxPhysicsSource',
    );

    const TestDiceBoxPhysicsSource = (
        props: React.ComponentProps<typeof actual.DiceBoxPhysicsSource>,
    ) => {
        const motionKey = props.motion.type === 'settled' ? 'settled' : `${props.motion.type}:${props.motion.id}`;
        const diceKey = props.dice.map((die) => `${die.id}:${die.value}:${die.isKept ? '1' : '0'}`).join('|');
        ReactActual.useEffect(() => {
            let active = true;
            const markSettled = () => {
                if (active) {
                    props.onSettledChange?.(true);
                }
            };
            markSettled();
            const timer = window.setTimeout(markSettled, 0);
            const retryTimer = window.setInterval(markSettled, 50);
            const stopRetryTimer = window.setTimeout(() => {
                window.clearInterval(retryTimer);
            }, 1000);
            return () => {
                active = false;
                window.clearTimeout(timer);
                window.clearInterval(retryTimer);
                window.clearTimeout(stopRetryTimer);
            };
        }, [diceKey, motionKey, props.onSettledChange]);

        return ReactActual.createElement(actual.DiceBoxPhysicsSource, {
            ...props,
            onSettledChange: (settled: boolean) => {
                props.onSettledChange?.(settled);
                if (!settled) {
                    window.setTimeout(() => props.onSettledChange?.(true), 0);
                }
            },
        });
    };

    return {
        ...actual,
        DiceBoxPhysicsSource: TestDiceBoxPhysicsSource,
    };
});

type BoardHarnessProps = {
    initialCore: ReturnType<typeof createBetrayalFoundationCore>;
    playerID?: string;
    matchData?: Array<{ id: number; name: string; isConnected: boolean }>;
    diceResults?: number[];
    finalizeEventRollDiceResults?: number[];
    autoAcknowledgeOtherPlayers?: boolean;
};

function stateOf(core: BoardHarnessProps['initialCore']): MatchState<typeof core> {
    return { core, sys: {} as MatchState<typeof core>['sys'] };
}

function acknowledgeRemainingEventRollPlayers(
    core: BoardHarnessProps['initialCore'],
    rollId: string | undefined,
    random: RandomFn,
): BoardHarnessProps['initialCore'] {
    let completedCore = core;
    let safety = 0;
    while (
        rollId &&
        completedCore.pendingEventRollResolution?.rollId === rollId
    ) {
        if (safety >= 20) {
            break;
        }
        const pendingResolution = completedCore.pendingEventRollResolution;
        const requiredPlayerIds = resolvePendingEventRollResolutionRequiredPlayerIds(
            completedCore,
            pendingResolution,
        );
        const acknowledgedPlayerIds = new Set(pendingResolution.acknowledgedPlayerIds ?? []);
        const nextPlayerId = requiredPlayerIds.find((requiredPlayerId) => !acknowledgedPlayerIds.has(requiredPlayerId));
        if (!nextPlayerId) {
            break;
        }
        const acknowledgement = createBetrayalCommand(
            BETRAYAL_COMMANDS.FINALIZE_EVENT_ROLL,
            nextPlayerId,
            { rollId },
            Date.now(),
        );
        if (!BetrayalDomain.validate(stateOf(completedCore), acknowledgement).valid) {
            break;
        }
        completedCore = BetrayalDomain.execute(stateOf(completedCore), acknowledgement, random)
            .reduce((currentCore, event) => BetrayalDomain.reduce(currentCore, event), completedCore);
        safety += 1;
    }
    return completedCore;
}

function acknowledgeRemainingRecentRollPlayers(
    core: BoardHarnessProps['initialCore'],
    rollId: string | undefined,
    random: RandomFn,
): BoardHarnessProps['initialCore'] {
    let completedCore = core;
    let safety = 0;
    while (rollId && completedCore.recentRoll?.id === rollId) {
        if (safety >= 20) {
            break;
        }
        const recentRoll = completedCore.recentRoll;
        const requiredPlayerIds = resolveRecentRollRequiredPlayerIds(completedCore, recentRoll);
        const acknowledgedPlayerIds = new Set(recentRoll.acknowledgedPlayerIds ?? []);
        const nextPlayerId = requiredPlayerIds.find((requiredPlayerId) => !acknowledgedPlayerIds.has(requiredPlayerId));
        if (!nextPlayerId) {
            break;
        }
        const acknowledgement = createBetrayalCommand(
            BETRAYAL_COMMANDS.ACKNOWLEDGE_RECENT_ROLL,
            nextPlayerId,
            {},
            Date.now(),
        );
        if (!BetrayalDomain.validate(stateOf(completedCore), acknowledgement).valid) {
            break;
        }
        completedCore = BetrayalDomain.execute(stateOf(completedCore), acknowledgement, random)
            .reduce((currentCore, event) => BetrayalDomain.reduce(currentCore, event), completedCore);
        safety += 1;
    }
    return completedCore;
}

function HarnessBoard({
    initialCore,
    playerID = '0',
    matchData,
    autoAcknowledgeOtherPlayers = true,
}: BoardHarnessProps) {
    const [core, setCore] = React.useState(initialCore);

    const dispatch = React.useCallback(<K extends keyof typeof BETRAYAL_COMMANDS extends infer _ ? string : never>(
        type: K,
        payload: unknown,
    ) => {
        const command = createBetrayalCommand(
            type as never,
            playerID,
            payload as never,
            Date.now(),
        );
        const validation = BetrayalDomain.validate(stateOf(core), command);
        if (!validation.valid) {
            throw new Error(`HarnessBoard command ${String(type)} rejected: ${validation.error}`);
        }
        const nextCore = BetrayalDomain.execute(stateOf(core), command, BETRAYAL_FIXED_RANDOM)
            .reduce((currentCore, event) => BetrayalDomain.reduce(currentCore, event), core);
        if (type === BETRAYAL_COMMANDS.FINALIZE_EVENT_ROLL && autoAcknowledgeOtherPlayers) {
            const completedCore = acknowledgeRemainingEventRollPlayers(
                nextCore,
                (payload as { rollId?: string }).rollId,
                BETRAYAL_FIXED_RANDOM,
            );
            setCore(completedCore);
            return;
        }
        if (type === BETRAYAL_COMMANDS.ACKNOWLEDGE_CARD_RESOLUTION && autoAcknowledgeOtherPlayers) {
            const resolutionId = (payload as { resolutionId?: string }).resolutionId;
            let completedCore = nextCore;
            while (completedCore.pendingCardResolutionQueue?.[0]?.id === resolutionId) {
                const pendingResolution = completedCore.pendingCardResolutionQueue[0];
                const requiredPlayerIds = pendingResolution.requiredPlayerIds?.length
                    ? pendingResolution.requiredPlayerIds
                    : [pendingResolution.playerId];
                const acknowledgedPlayerIds = new Set(pendingResolution.acknowledgedPlayerIds ?? []);
                const nextPlayerId = requiredPlayerIds.find((requiredPlayerId) => !acknowledgedPlayerIds.has(requiredPlayerId));
                if (!nextPlayerId) {
                    break;
                }
                const acknowledgement = createBetrayalCommand(
                    BETRAYAL_COMMANDS.ACKNOWLEDGE_CARD_RESOLUTION,
                    nextPlayerId,
                    { resolutionId },
                    Date.now(),
                );
                if (!BetrayalDomain.validate(stateOf(completedCore), acknowledgement).valid) {
                    break;
                }
                completedCore = BetrayalDomain.execute(stateOf(completedCore), acknowledgement, BETRAYAL_FIXED_RANDOM)
                    .reduce((currentCore, event) => BetrayalDomain.reduce(currentCore, event), completedCore);
            }
            setCore(completedCore);
            return;
        }
        if (type === BETRAYAL_COMMANDS.ACKNOWLEDGE_RECENT_ROLL && autoAcknowledgeOtherPlayers) {
            const completedCore = acknowledgeRemainingRecentRollPlayers(
                nextCore,
                core.recentRoll?.id,
                BETRAYAL_FIXED_RANDOM,
            );
            setCore(completedCore);
            return;
        }
        setCore(nextCore);
    }, [autoAcknowledgeOtherPlayers, core, playerID]);

    return (
        <ToastProvider>
            <TutorialProvider>
                <GameModeProvider mode="local">
                    <Board
                        G={{
                            core,
                            sys: {} as MatchState<unknown>['sys'],
                        } as MatchState<Record<string, unknown>>}
                        dispatch={dispatch as never}
                        playerID={playerID}
                        matchData={matchData}
                        isConnected
                    />
                </GameModeProvider>
            </TutorialProvider>
        </ToastProvider>
    );
}

function TradeAgreementHarnessBoard({ initialCore, playerID = '0', matchData }: BoardHarnessProps) {
    const [core, setCore] = React.useState(initialCore);
    const viewerPlayerId = core.pendingTradeAgreement?.targetPlayerId ?? playerID;

    const dispatch = React.useCallback(<K extends keyof typeof BETRAYAL_COMMANDS extends infer _ ? string : never>(
        type: K,
        payload: unknown,
    ) => {
        const command = createBetrayalCommand(
            type as never,
            viewerPlayerId,
            payload as never,
            Date.now(),
        );
        const validation = BetrayalDomain.validate(stateOf(core), command);
        if (!validation.valid) {
            return;
        }
        const nextCore = BetrayalDomain.execute(stateOf(core), command, BETRAYAL_FIXED_RANDOM)
            .reduce((currentCore, event) => BetrayalDomain.reduce(currentCore, event), core);
        setCore(nextCore);
    }, [core, viewerPlayerId]);

    return (
        <ToastProvider>
            <TutorialProvider>
                <GameModeProvider mode="local">
                    <Board
                        G={{
                            core,
                            sys: {} as MatchState<unknown>['sys'],
                        } as MatchState<Record<string, unknown>>}
                        dispatch={dispatch as never}
                        playerID={viewerPlayerId}
                        matchData={matchData}
                        isConnected
                    />
                </GameModeProvider>
            </TutorialProvider>
        </ToastProvider>
    );
}

function HarnessBoardWithRandom({
    initialCore,
    playerID = '0',
    matchData,
    diceResults,
    finalizeEventRollDiceResults,
    autoAcknowledgeOtherPlayers = true,
}: BoardHarnessProps) {
    const [core, setCore] = React.useState(initialCore);

    const dispatch = React.useCallback(<K extends keyof typeof BETRAYAL_COMMANDS extends infer _ ? string : never>(
        type: K,
        payload: unknown,
    ) => {
        const command = createBetrayalCommand(
            type as never,
            playerID,
            payload as never,
            Date.now(),
        );
        const validation = BetrayalDomain.validate(stateOf(core), command);
        if (!validation.valid) {
            return;
        }
        const commandDiceResults = type === BETRAYAL_COMMANDS.FINALIZE_EVENT_ROLL
            ? finalizeEventRollDiceResults ?? diceResults
            : diceResults;
        const nextCore = BetrayalDomain.execute(stateOf(core), command, createBetrayalScriptedRandom(...(commandDiceResults ?? [2, 2, 2, 2])))
            .reduce((currentCore, event) => BetrayalDomain.reduce(currentCore, event), core);
        if (type === BETRAYAL_COMMANDS.FINALIZE_EVENT_ROLL && autoAcknowledgeOtherPlayers) {
            const completedCore = acknowledgeRemainingEventRollPlayers(
                nextCore,
                (payload as { rollId?: string }).rollId,
                createBetrayalScriptedRandom(...(commandDiceResults ?? [2, 2, 2, 2])),
            );
            setCore(completedCore);
            return;
        }
        if (type === BETRAYAL_COMMANDS.ACKNOWLEDGE_CARD_RESOLUTION && autoAcknowledgeOtherPlayers) {
            const resolutionId = (payload as { resolutionId?: string }).resolutionId;
            let completedCore = nextCore;
            while (completedCore.pendingCardResolutionQueue?.[0]?.id === resolutionId) {
                const pendingResolution = completedCore.pendingCardResolutionQueue[0];
                const requiredPlayerIds = pendingResolution.requiredPlayerIds?.length
                    ? pendingResolution.requiredPlayerIds
                    : [pendingResolution.playerId];
                const acknowledgedPlayerIds = new Set(pendingResolution.acknowledgedPlayerIds ?? []);
                const nextPlayerId = requiredPlayerIds.find((requiredPlayerId) => !acknowledgedPlayerIds.has(requiredPlayerId));
                if (!nextPlayerId) {
                    break;
                }
                const acknowledgement = createBetrayalCommand(
                    BETRAYAL_COMMANDS.ACKNOWLEDGE_CARD_RESOLUTION,
                    nextPlayerId,
                    { resolutionId },
                    Date.now(),
                );
                if (!BetrayalDomain.validate(stateOf(completedCore), acknowledgement).valid) {
                    break;
                }
                completedCore = BetrayalDomain.execute(
                    stateOf(completedCore),
                    acknowledgement,
                    createBetrayalScriptedRandom(...(diceResults ?? [2, 2, 2, 2])),
                ).reduce((currentCore, event) => BetrayalDomain.reduce(currentCore, event), completedCore);
            }
            setCore(completedCore);
            return;
        }
        if (type === BETRAYAL_COMMANDS.ACKNOWLEDGE_RECENT_ROLL && autoAcknowledgeOtherPlayers) {
            const completedCore = acknowledgeRemainingRecentRollPlayers(
                nextCore,
                core.recentRoll?.id,
                createBetrayalScriptedRandom(...(diceResults ?? [2, 2, 2, 2])),
            );
            setCore(completedCore);
            return;
        }
        setCore(nextCore);
    }, [autoAcknowledgeOtherPlayers, core, diceResults, finalizeEventRollDiceResults, playerID]);

    return (
        <ToastProvider>
            <TutorialProvider>
                <GameModeProvider mode="local">
                    <Board
                        G={{
                            core,
                            sys: {} as MatchState<unknown>['sys'],
                        } as MatchState<Record<string, unknown>>}
                        dispatch={dispatch as never}
                        playerID={playerID}
                        matchData={matchData}
                        isConnected
                    />
                </GameModeProvider>
            </TutorialProvider>
        </ToastProvider>
    );
}

function MultiViewerCardResolutionHarness({ initialCore }: BoardHarnessProps) {
    const [core, setCore] = React.useState(initialCore);
    const [playerID, setPlayerID] = React.useState('0');

    const dispatch = React.useCallback(<K extends keyof typeof BETRAYAL_COMMANDS extends infer _ ? string : never>(
        type: K,
        payload: unknown,
    ) => {
        const command = createBetrayalCommand(
            type as never,
            playerID,
            payload as never,
            Date.now(),
        );
        const validation = BetrayalDomain.validate(stateOf(core), command);
        if (!validation.valid) {
            throw new Error(`HarnessBoard command ${String(type)} rejected: ${validation.error}`);
        }
        const nextCore = BetrayalDomain.execute(stateOf(core), command, BETRAYAL_FIXED_RANDOM)
            .reduce((currentCore, event) => BetrayalDomain.reduce(currentCore, event), core);
        setCore(nextCore);
    }, [core, playerID]);

    return (
        <>
            <div>
                {initialCore.playerIds.map((id) => (
                    <button
                        key={id}
                        type="button"
                        data-testid={`betrayal-test-view-as-${id}`}
                        onClick={() => setPlayerID(id)}
                    >
                        查看玩家{id}
                    </button>
                ))}
            </div>
            <ToastProvider>
                <TutorialProvider>
                    <GameModeProvider mode="local">
                        <Board
                            G={{
                                core,
                                sys: {} as MatchState<unknown>['sys'],
                            } as MatchState<Record<string, unknown>>}
                            dispatch={dispatch as never}
                            playerID={playerID}
                            matchData={defaultMatchData}
                            isConnected
                        />
                    </GameModeProvider>
                </TutorialProvider>
            </ToastProvider>
        </>
    );
}

function renderBoardTree(
    core: MatchState<Record<string, unknown>>['core'],
    options?: {
        playerID?: string;
        matchData?: Array<{ id: number; name: string; isConnected: boolean }>;
    },
) {
    return (
        <ToastProvider>
            <TutorialProvider>
                <GameModeProvider mode="local">
                    <Board
                        G={{
                            core,
                            sys: {} as MatchState<unknown>['sys'],
                        } as MatchState<Record<string, unknown>>}
                        dispatch={() => {}}
                        playerID={options?.playerID ?? '0'}
                        matchData={options?.matchData}
                        isConnected
                    />
                </GameModeProvider>
            </TutorialProvider>
        </ToastProvider>
    );
}

function renderBoardWithDispatch(
    core: MatchState<Record<string, unknown>>['core'],
    dispatch: (type: string, payload: unknown) => void,
    options?: {
        playerID?: string;
        matchData?: Array<{ id: number; name: string; isConnected: boolean }>;
    },
) {
    return render(
        <ToastProvider>
            <TutorialProvider>
                <GameModeProvider mode="local">
                    <Board
                        G={{
                            core,
                            sys: {} as MatchState<unknown>['sys'],
                        } as MatchState<Record<string, unknown>>}
                        dispatch={dispatch as never}
                        playerID={options?.playerID ?? '0'}
                        matchData={options?.matchData}
                        isConnected
                    />
                </GameModeProvider>
            </TutorialProvider>
        </ToastProvider>
    );
}

function renderBoard(
    core: MatchState<Record<string, unknown>>['core'],
    options?: {
        playerID?: string;
        matchData?: Array<{ id: number; name: string; isConnected: boolean }>;
    },
) {
    return render(
        renderBoardTree(core, options),
    );
}

const defaultMatchData = [
    { id: 0, name: '测试玩家', isConnected: true },
    { id: 1, name: '队友一', isConnected: true },
    { id: 2, name: '队友二', isConnected: true },
    { id: 3, name: '队友三', isConnected: true },
];

async function confirmPendingRoomPlacement(options: { confirmEventRoll?: boolean } = {}) {
    const { confirmEventRoll = true } = options;
    expect(screen.getByTestId('betrayal-room-placement-panel')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('betrayal-room-placement-confirm'));
    const eventRollStart = screen.queryByTestId('betrayal-event-roll-start');
    if (eventRollStart && confirmEventRoll) {
        await waitFor(() => {
            expect(screen.getByTestId('betrayal-board')).toHaveAttribute(
                'data-betrayal-visual-busy',
                'false',
            );
            expect(eventRollStart).toBeEnabled();
        });
        fireEvent.click(eventRollStart);
        await waitFor(() => {
            expect(screen.getByTestId('betrayal-discovery-continue')).toBeEnabled();
        });
        fireEvent.click(screen.getByTestId('betrayal-discovery-continue'));
    } else if (eventRollStart) {
        await waitFor(() => {
            expect(screen.getByTestId('betrayal-board')).toHaveAttribute(
                'data-betrayal-visual-busy',
                'false',
            );
            expect(eventRollStart).toBeEnabled();
        });
        fireEvent.click(eventRollStart);
    }
}

function confirmDiscoveryUntilClosed() {
    for (let safety = 0; safety < 10 && screen.queryByTestId('betrayal-discovery-continue'); safety += 1) {
        fireEvent.click(screen.getByTestId('betrayal-discovery-continue'));
    }
    expect(screen.queryByTestId('betrayal-discovery-panel')).not.toBeInTheDocument();
}

function finalizeEventRollIfVisible() {
    const recentRollConfirm = screen.queryByTestId('betrayal-roll-continue');
    if (recentRollConfirm && !recentRollConfirm.hasAttribute('disabled')) {
        fireEvent.click(recentRollConfirm);
        return;
    }
    const finalizeButton = screen.queryByTestId('betrayal-event-roll-finalize');
    if (finalizeButton) {
        fireEvent.click(finalizeButton);
        return;
    }
    const unifiedConfirmButton = screen.queryByTestId('betrayal-discovery-continue');
    if (/^确认 \d+\/\d+$/.test(unifiedConfirmButton?.textContent?.trim() ?? '')) {
        fireEvent.click(unifiedConfirmButton);
    }
}

function markRecentEventRollPendingFinalizationForBoardTest(
    core: BetrayalCore,
    effect: UseEffectProfile = { mode: 'none', recommendedAction: 'endTurn' },
) {
    expect(core.recentRoll).toBeTruthy();
    expect(core.recentRoll?.kind === 'eventTraitCheck' || core.recentRoll?.kind === 'eventDiceRoll').toBe(true);
    core.pendingEventRollResolution = {
        rollId: core.recentRoll!.id,
        playerId: core.recentRoll!.playerId,
        sourceTitle: core.recentRoll!.sourceTitle,
        requiredPlayerIds: [...core.playerIds],
        acknowledgedPlayerIds: [],
        effect,
    };
}

function cloneBoardRoomTemplate(
    room: BetrayalCore['roomDiscoveryDeck'][number]['room'],
): BetrayalCore['roomDiscoveryDeck'][number]['room'] {
    return {
        ...room,
        tags: [...room.tags],
        doorways: [...room.doorways],
    };
}

function setNextBoardDiscoveryRoom(
    core: BetrayalCore,
    floor: 'ground' | 'upper' | 'basement',
    visualId: string,
): void {
    const room = BETRAYAL_DISCOVERY_POOLS.roomDiscoveryByFloor[floor].find(
        (candidate) => candidate.visualId === visualId,
    );
    if (!room) {
        throw new Error(`山屋 Board 测试夹具缺少${floor}房间 ${visualId}`);
    }
    const clonedRoom = cloneBoardRoomTemplate(room);
    core.roomDiscoveryDeck = [{ floor, room: clonedRoom }];
    core.roomDiscoveryOrderByFloor = {
        ground: floor === 'ground' ? [cloneBoardRoomTemplate(room)] : [],
        upper: floor === 'upper' ? [cloneBoardRoomTemplate(room)] : [],
        basement: floor === 'basement' ? [cloneBoardRoomTemplate(room)] : [],
    };
}

function expectSingleEventEffectResolutionStep(...expectedTexts: string[]) {
    expect(screen.getByTestId('betrayal-discovery-panel')).toBeInTheDocument();
    if (!screen.queryByTestId('betrayal-discovery-resolution-steps')) {
        finalizeEventRollIfVisible();
    }
    const resolutionSteps = expectDiscoveryResolutionLedgerTraceOnly(1);
    expect(resolutionSteps).toHaveLength(1);
    expect(resolutionSteps[0]).toHaveTextContent('事件效果');
    for (const text of expectedTexts) {
        expect(resolutionSteps[0]).toHaveTextContent(text);
    }
    let discoveryContinue = screen.queryByTestId('betrayal-discovery-continue');
    if (discoveryContinue && /确认|已确认/.test(discoveryContinue.textContent ?? '')) {
        expect(discoveryContinue).toHaveTextContent(/确认|已确认/);
    }
    finalizeEventRollIfVisible();
    discoveryContinue = screen.queryByTestId('betrayal-discovery-continue');
    if (
        discoveryContinue
        && discoveryContinue.getAttribute('data-pending-card-resolution-id')
        && !discoveryContinue.hasAttribute('disabled')
        && /确认/.test(discoveryContinue.textContent ?? '')
    ) {
        fireEvent.click(discoveryContinue);
    }
}

async function expectEventDamageAllocation(
    sourceTitle: string,
    amountText: string,
    expectedTraits: string[],
    sourceOwner: 'panel' | 'discovery-card' = 'panel',
) {
    const rollContinue = screen.queryByTestId('betrayal-roll-continue');
    if (rollContinue && !rollContinue.hasAttribute('disabled')) {
        fireEvent.click(rollContinue);
    }
    await waitFor(() => {
        expect(screen.getByTestId('betrayal-damage-allocation-panel')).toBeInTheDocument();
    }, { timeout: 12000 });
    expect(screen.getByTestId('betrayal-damage-allocation-source')).toHaveTextContent(sourceTitle);
    expect(screen.getByTestId('betrayal-damage-allocation-source')).toHaveAttribute(
        'data-visible-source-owner',
        sourceOwner,
    );
    expect(screen.getByTestId('betrayal-damage-allocation-amount')).toHaveTextContent(amountText);
    const damageTraits = screen.getByTestId('betrayal-damage-allocation-traits');
    for (const trait of expectedTraits) {
        expect(damageTraits).toHaveTextContent(trait);
    }
}

function expectDiscoveryResolutionLedgerTraceOnly(expectedCount: number) {
    const ledger = screen.getByTestId('betrayal-discovery-resolution-steps');
    expect(ledger).toBeInTheDocument();
    expect(ledger).toHaveAttribute('hidden');
    expect(ledger).toHaveAttribute('aria-hidden', 'true');
    expect(ledger).toHaveAttribute('data-ui-role', 'nonvisual-resolution-ledger');
    const resolutionSteps = screen.getAllByTestId('betrayal-discovery-resolution-step');
    expect(resolutionSteps).toHaveLength(expectedCount);
    return resolutionSteps;
}

function dismissBlockingBoardOverlays(core: BetrayalCore): BetrayalCore {
    core.latestDiscovery = null;
    core.latestDiscoveryOwnerPlayerId = null;
    core.pendingCardResolutionQueue = [];
    core.pendingEventChoice = null;
    core.recentRoll = null;
    return core;
}

function createDustHauntRevealBoardCore(playerIds: string[] = ['0', '1', '2']): BetrayalCore {
    let core = createStartedFirstScenarioCore(playerIds);
    core.drawOrder = ['event'];
    core.eventOrder = [BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '一瓶微尘')!];
    setNextBoardDiscoveryRoom(core, 'ground', 'kitchen');
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
    core.recommendedAction = 'use';
    return core;
}

function createDustHauntBoardCore(playerIds: string[] = ['0', '1', '2']): BetrayalCore {
    const core = createDustHauntRevealBoardCore(playerIds);
    return dismissBlockingBoardOverlays(core);
}

function seedBloodFromStoneBoardTrigger(core: BetrayalCore): void {
    core.proposedScenarioCardId = 'blood-from-a-stone';
    core.drawOrder = ['omen'];
    core.possessionOrderByKind.omen = [
        { id: 'mask', name: 'Mask', kind: 'omen' },
    ];
    core.currentExplorer.inventory = [
        { id: 'omen-book', name: '书本', kind: 'omen' },
        { id: 'dog', name: '狗', kind: 'omen' },
        { id: 'skull', name: '头骨', kind: 'omen' },
        { id: 'ring', name: '指环', kind: 'omen' },
    ];
    core.currentExplorerInventory = [...core.currentExplorer.inventory];
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
}

function createBloodFromStoneManualPlacementBoardCore(): BetrayalCore {
    let core = createStartedFirstScenarioCore(['0', '1', '2']);
    seedBloodFromStoneBoardTrigger(core);
    core.rooms = core.rooms.map((room) => (
        room.id === 'upper-west'
            ? {
                ...room,
                state: 'unexplored',
                name: '未探索',
            }
            : room
    ));
    core = applyBetrayalCommand(
        core,
        BETRAYAL_COMMANDS.EXPLORE_ROOM,
        '0',
        { roomId: 'ground-east' },
        100,
        createBetrayalScriptedRandom(3, 3, 3, 3, 3),
    );
    core.latestDiscovery = null;
    core.latestDiscoveryOwnerPlayerId = null;
    core.pendingCardResolutionQueue = [];
    core.recentRoll = null;
    return core;
}

function isMagicCameraBoardCard(card: BetrayalCore['currentExplorer']['inventory'][number]): boolean {
    return card.id === 'camera' || card.name === '魔法相机';
}

function removeMagicCameraFromBoardExplorer(
    explorer: BetrayalCore['currentExplorer'],
): BetrayalCore['currentExplorer'] {
    return {
        ...explorer,
        inventory: explorer.inventory.filter((card) => !isMagicCameraBoardCard(card)),
    };
}

function activateBoardExplorer(core: BetrayalCore, playerId: string): BetrayalCore {
    const explorers = [core.currentExplorer, ...core.otherExplorers].map((explorer) => ({
        ...explorer,
        traits: { ...explorer.traits },
        inventory: explorer.inventory.map((card) => ({ ...card })),
    }));
    const active = explorers.find((explorer) => explorer.playerId === playerId);
    if (!active) {
        throw new Error(`Board 测试夹具不能切到缺失玩家 ${playerId}`);
    }
    core.currentPlayer = playerId;
    core.currentExplorer = active;
    core.otherExplorers = explorers.filter((explorer) => explorer.playerId !== playerId);
    core.activeRoomId = active.roomId;
    core.currentExplorerRoomId = active.roomId;
    core.currentExplorerTraits = { ...active.traits };
    core.currentExplorerInventory = active.inventory.map((card) => ({ ...card }));
    core.turnStartInventoryCardIds = active.inventory.map((card) => card.id);
    return core;
}

function completeMonsterPreparationForAttackSlot(
    core: BetrayalCore,
    monsterId: string,
): BetrayalCore {
    const movementGroup = resolveBetrayalMonsterMovementGroups(core)
        .find((group) => group.monsterIds.includes(monsterId));
    if (!movementGroup) {
        throw new Error(`Board 测试夹具找不到 ${monsterId} 的怪物移动骰组`);
    }
    const movementResult: BetrayalMonsterMovementRollGroupResult = {
        groupId: movementGroup.groupId,
        monsterName: movementGroup.monsterName,
        monsterIds: [...movementGroup.monsterIds],
        playerId: core.currentExplorer.playerId,
        speed: movementGroup.speed,
        diceCount: movementGroup.diceCount,
        dice: Array.from({ length: movementGroup.diceCount }, () => 0),
        total: 0,
        moveAllowance: 0,
        rollOnceForGroup: true,
        minimumMoveAllowance: movementGroup.minimumMoveAllowance,
    };
    core.scenarioRuntime.monsterTurn = {
        ...core.scenarioRuntime.monsterTurn,
        resolvedStartMonsterIds: Array.from(new Set([
            ...core.scenarioRuntime.monsterTurn.resolvedStartMonsterIds,
            ...movementGroup.monsterIds,
        ])),
        movementRollsByGroupId: {
            ...core.scenarioRuntime.monsterTurn.movementRollsByGroupId,
            [movementGroup.groupId]: movementResult,
        },
        moveRemainingById: {
            ...core.scenarioRuntime.monsterTurn.moveRemainingById,
            ...Object.fromEntries(movementGroup.monsterIds.map((id) => [id, 0])),
        },
    };
    return core;
}

function createOpenFrontierHauntBoardCore(activePlayerId: string): BetrayalCore {
    let core = createStartedFirstScenarioCore(['0', '1', '2', '3']);
    core.phase = 'haunt';
    core.scenarioRuntime.hauntTriggered = true;
    core.scenarioRuntime.hauntRevealerPlayerId = '0';
    core.scenarioRuntime.traitorPlayerId = '2';
    core.scenarioRuntime.nextHauntPlayerId = activePlayerId;
    core.scenarioRuntime.hauntCardNumber = 1;
    core.scenarioRuntime.hauntTriggerLabel = '测试作祟';
    core.scenarioRuntime.hauntScenarioCardId = DEFAULT_BETRAYAL_SCENARIO_CARD_ID;
    core.scenarioRuntime.hauntScenarioCardTitle = '赤红杰克归来';
    core.scenarioRuntime.hauntScenarioCardLabel = '作祟 1';
    core.scenarioRuntime.triggeringOmenName = '测试恶兆';
    core = activateBoardExplorer(core, activePlayerId);
    core.currentExplorer = {
        ...core.currentExplorer,
        roomId: 'entrance-hall',
    };
    core.activeRoomId = 'entrance-hall';
    core.currentExplorerRoomId = 'entrance-hall';
    core.turnEndedByDiscovery = false;
    core.pendingEventChoice = null;
    core.recentRoll = null;
    core.turnStartSpeed = Math.max(core.currentExplorer.traits.speed, 1);
    core.movesRemaining = core.turnStartSpeed;
    return dismissBlockingBoardOverlays(core);
}

function createBoardHighCapacityTraitTrack(trackId: string, value = 4, position = 14) {
    return {
        trackId,
        values: Array.from({ length: position + 2 }, () => value),
        position,
        startPosition: position,
        criticalPosition: 0,
        skullPosition: -1,
        maxPosition: position + 1,
    };
}

function createHelpingHandsHauntOpeningBoardCore(playerIds: string[] = ['0', '1', '2']): BetrayalCore {
    let core = createStartedFirstScenarioCore(playerIds);
    core.drawOrder = ['event'];
    core.eventOrder = [BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '大宅饿了')!];
    core.currentExplorer.inventory = [
        ...core.currentExplorer.inventory,
        { id: 'omen-book', name: '书本', kind: 'omen' },
        { id: 'dog', name: '狗', kind: 'omen' },
        { id: 'mask', name: '面具', kind: 'omen' },
    ];
    core.currentExplorer.traits = {
        ...core.currentExplorer.traits,
        might: 5,
        sanity: 5,
    };
    core.currentExplorerInventory = [...core.currentExplorer.inventory];
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    setNextBoardDiscoveryRoom(core, 'ground', 'kitchen');

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
    core.recommendedAction = 'use';
    return core;
}

function createHelpingHandsPendingRewardBoardCore(): BetrayalCore {
    let core = dismissBlockingBoardOverlays(createHelpingHandsHauntOpeningBoardCore(['0', '1', '2']));
    core = activateBoardExplorer(core, '0');
    core.currentExplorer = {
        ...core.currentExplorer,
        roomId: 'entrance-hall',
        traits: {
            ...core.currentExplorer.traits,
            might: 5,
        },
    };
    core.otherExplorers = core.otherExplorers.map((explorer) => (
        explorer.playerId === '1'
            ? {
                ...explorer,
                roomId: 'entrance-hall',
                inventory: [{ id: 'first-aid-kit', name: '急救包', kind: 'item' }],
                traits: {
                    ...explorer.traits,
                    might: 2,
                    speed: 2,
                },
                traitTracks: {
                    ...explorer.traitTracks,
                    might: {
                        trackId: 'test-helping-hands-defender-might',
                        values: [1, 2, 2, 2, 2, 2],
                        position: 4,
                        startPosition: 4,
                        criticalPosition: 0,
                        skullPosition: -1,
                        maxPosition: 5,
                    },
                    speed: {
                        trackId: 'test-helping-hands-defender-speed',
                        values: [1, 2, 2, 2, 2, 2],
                        position: 4,
                        startPosition: 4,
                        criticalPosition: 0,
                        skullPosition: -1,
                        maxPosition: 5,
                    },
                },
            }
            : explorer
    ));
    core.activeRoomId = 'entrance-hall';
    core.currentExplorerRoomId = 'entrance-hall';
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.currentExplorerInventory = core.currentExplorer.inventory.map((card) => ({ ...card }));
    core.turnStartInventoryCardIds = core.currentExplorer.inventory.map((card) => card.id);
    core = applyBetrayalCommand(
        core,
        BETRAYAL_COMMANDS.HAUNT_ATTACK,
        '0',
        { target: 'hero', targetPlayerId: '1' },
        100,
        createBetrayalScriptedRandom(3, 3, 1, 1, 1, 1, 1),
    );
    return core;
}

function createHelpingHandsTrollHandAttackBoardCore(): BetrayalCore {
    let core = dismissBlockingBoardOverlays(createHelpingHandsHauntOpeningBoardCore(['0', '1', '2']));
    core = activateBoardExplorer(core, '0');
    const sharedRoomId = 'entrance-hall';
    const trollHandIds = core.scenarioRuntime.helpingHands?.trollHandIds ?? [];
    core.monsters = core.monsters.map((monster) => (
        trollHandIds.includes(monster.id)
            ? { ...monster, roomId: sharedRoomId }
            : monster
    ));
    core.currentExplorer = {
        ...core.currentExplorer,
        roomId: 'hallway',
    };
    core.otherExplorers = core.otherExplorers.map((explorer) => (
        explorer.playerId === '1'
            ? {
                ...explorer,
                roomId: sharedRoomId,
                traits: {
                    ...explorer.traits,
                    might: 2,
                    speed: 2,
                },
                traitTracks: {
                    ...explorer.traitTracks,
                    might: {
                        trackId: 'test-helping-hands-troll-defender-might',
                        values: [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
                        position: 10,
                        startPosition: 10,
                        criticalPosition: 0,
                        skullPosition: -1,
                        maxPosition: 11,
                    },
                    speed: {
                        trackId: 'test-helping-hands-troll-defender-speed',
                        values: [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
                        position: 10,
                        startPosition: 10,
                        criticalPosition: 0,
                        skullPosition: -1,
                        maxPosition: 11,
                    },
                },
            }
            : explorer
    ));
    core.activeRoomId = sharedRoomId;
    core.currentExplorerRoomId = core.currentExplorer.roomId;
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.currentExplorerInventory = core.currentExplorer.inventory.map((card) => ({ ...card }));
    core.recommendedAction = 'use';
    core = applyBetrayalCommand(
        core,
        BETRAYAL_COMMANDS.END_TURN,
        '0',
        {},
        100,
        createBetrayalScriptedRandom(1, 2, 3),
    );
    return dismissBlockingBoardOverlays(core);
}

function createMagicCameraHauntRevealBoardCore(cameraOwnerPlayerId: string | null = '1'): BetrayalCore {
    let core = createStartedFirstScenarioCore(['0', '1', '2']);
    core.drawOrder = ['event'];
    core.eventOrder = [BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '说“茄子”！')!];
    setNextBoardDiscoveryRoom(core, 'ground', 'kitchen');
    core.currentExplorer = removeMagicCameraFromBoardExplorer(core.currentExplorer);
    core.otherExplorers = core.otherExplorers.map(removeMagicCameraFromBoardExplorer);
    core.currentExplorer.inventory = [
        ...core.currentExplorer.inventory,
        { id: 'omen-book', name: '书本', kind: 'omen' },
        { id: 'dog', name: '狗', kind: 'omen' },
        { id: 'mask', name: '面具', kind: 'omen' },
    ];
    if (cameraOwnerPlayerId === '0') {
        core.currentExplorer.inventory = [
            ...core.currentExplorer.inventory,
            { id: 'camera', name: '魔法相机', kind: 'item' },
        ];
    }
    core.currentExplorerInventory = [...core.currentExplorer.inventory];
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.otherExplorers = core.otherExplorers.map((explorer) => (
        explorer.playerId === cameraOwnerPlayerId
            ? { ...explorer, inventory: [...explorer.inventory, { id: 'camera', name: '魔法相机', kind: 'item' }] }
            : explorer
    ));
    if (!cameraOwnerPlayerId) {
        core.possessionOrderByKind.item = [
            { id: 'camera', name: '魔法相机', kind: 'item' },
            ...core.possessionOrderByKind.item.filter((card) => !isMagicCameraBoardCard(card)),
        ];
    }

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
    core.recommendedAction = 'use';
    return core;
}

function createMagicCameraHauntBoardCore(cameraOwnerPlayerId: string | null = '1'): BetrayalCore {
    const core = createMagicCameraHauntRevealBoardCore(cameraOwnerPlayerId);
    return dismissBlockingBoardOverlays(core);
}

function placeCurrentExplorerInDustBoardRoom(
    core: BetrayalCore,
    options: {
        roomId?: string;
        name?: string;
        visualId?: BetrayalCore['rooms'][number]['visualId'];
        discoveryReward?: BetrayalCore['rooms'][number]['discoveryReward'];
    } = {},
): BetrayalCore {
    const roomId = options.roomId ?? 'ground-north';
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
                name: options.name ?? '画廊',
                hint: '灰尘剧本 Board 测试板块',
                tags: ['恶兆'],
                discoveryReward: options.discoveryReward === undefined ? 'omen' : options.discoveryReward,
                visualId: options.visualId ?? 'gallery',
            }
            : room
    ));
    return core;
}

function setCurrentExplorerBoardTraits(
    core: BetrayalCore,
    traits: Partial<BetrayalCore['currentExplorer']['traits']>,
): BetrayalCore {
    core.currentExplorer = {
        ...core.currentExplorer,
        traits: { ...core.currentExplorer.traits, ...traits },
    };
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    return core;
}

function setBoardTraitTrack(
    core: BetrayalCore,
    playerId: string,
    trait: BetrayalTraitKey,
    values: number[],
    position: number,
    startPosition = 0,
): BetrayalCore {
    const explorer = [core.currentExplorer, ...core.otherExplorers]
        .find((candidate) => candidate.playerId === playerId);
    if (!explorer) {
        throw new Error(`Board 测试夹具不能设置缺失玩家 ${playerId} 的属性轨`);
    }
    explorer.traitTracks = {
        ...explorer.traitTracks,
        [trait]: {
            trackId: `board-test-${playerId}-${trait}`,
            values: [...values],
            position,
            startPosition,
            criticalPosition: 0,
            skullPosition: -1,
            maxPosition: values.length - 1,
        },
    };
    explorer.traits = {
        ...explorer.traits,
        [trait]: values[position] ?? 0,
    };
    if (core.currentExplorer.playerId === playerId) {
        core.currentExplorerTraits = { ...explorer.traits };
    }
    return core;
}

function createDustUsedBookRabbitFootBoardCore(rabbitFootRerollDie: number): BetrayalCore {
    let core = createDustHauntBoardCore();
    core = activateBoardExplorer(core, '1');
    core.currentExplorer = {
        ...core.currentExplorer,
        roomId: 'hallway',
        traits: {
            ...core.currentExplorer.traits,
            knowledge: 5,
            sanity: 2,
        },
        inventory: [
            { id: 'skull', name: '头骨', kind: 'omen' },
            { id: 'rope', name: '兔脚', kind: 'item' },
            { id: 'omen-book', name: '书本', kind: 'omen' },
        ],
    };
    core.activeRoomId = 'hallway';
    core.currentExplorerRoomId = 'hallway';
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.currentExplorerInventory = [...core.currentExplorer.inventory];
    core.turnStartInventoryCardIds = ['skull', 'rope', 'omen-book'];
    core.otherExplorers = core.otherExplorers.map((explorer) => (
        explorer.playerId === '0'
            ? {
                ...explorer,
                roomId: 'hallway',
                inventory: [{ id: 'map', name: '地图', kind: 'item' }],
            }
            : explorer
    ));
    core.scenarioRuntime.dust!.permanentTraitorPlayerIds = ['1'];
    core.scenarioRuntime.deadExplorerPlayerIds = [];
    core.scenarioRuntime.corpseLootedByPlayerIdsThisTurn = [];

    core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.USE_POSSESSION, '1', { cardId: 'omen-book' });
    for (const trait of ['might', 'speed', 'knowledge', 'sanity'] as BetrayalTraitKey[]) {
        core = setBoardTraitTrack(core, '1', trait, [1], 0, 0);
    }
    core.pendingDamageAllocation = {
        id: 'board-dust-used-active-card-rabbit-foot',
        playerId: '1',
        sourceTitle: '灰尘冲动',
        damageKind: 'general',
        amount: 2,
        originalAmount: 2,
        allowedTraits: ['might', 'speed', 'knowledge', 'sanity'],
        allowSkull: true,
        traitsBeforeDamage: { ...core.currentExplorer.traits },
    };
    core = applyBetrayalCommand(
        core,
        BETRAYAL_COMMANDS.RESOLVE_DAMAGE_ALLOCATION,
        '1',
        { traits: lethalDamageTraitsForPendingAllocation(core) },
        100,
        createBetrayalScriptedRandom(1, 2, 2),
    );
    expect(core.scenarioRuntime.deadExplorerPlayerIds).toContain('1');
    expect(core.recentRoll?.kind).toBe('deathPrevention');

    core = applyBetrayalCommand(
        core,
        BETRAYAL_COMMANDS.USE_RABBIT_FOOT,
        '1',
        { cardId: 'rope', dieIndex: 0 },
        101,
        createBetrayalScriptedRandom(rabbitFootRerollDie),
    );
    return core;
}

function createDustUsedMaskRabbitFootBoardCore(rabbitFootRerollDie: number): BetrayalCore {
    let core = createDustHauntBoardCore();
    core = activateBoardExplorer(core, '1');
    core.currentExplorer = {
        ...core.currentExplorer,
        roomId: 'hallway',
        traits: {
            ...core.currentExplorer.traits,
            knowledge: 5,
            sanity: 2,
        },
        inventory: [
            { id: 'skull', name: '头骨', kind: 'omen' },
            { id: 'rope', name: '兔脚', kind: 'item' },
            { id: 'mask', name: '面具', kind: 'omen' },
        ],
    };
    core.activeRoomId = 'hallway';
    core.currentExplorerRoomId = 'hallway';
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.currentExplorerInventory = [...core.currentExplorer.inventory];
    core.turnStartInventoryCardIds = ['skull', 'rope', 'mask'];
    core.otherExplorers = core.otherExplorers.map((explorer) => (
        explorer.playerId === '0'
            ? {
                ...explorer,
                roomId: 'hallway',
                inventory: [{ id: 'map', name: '地图', kind: 'item' }],
            }
            : explorer
    ));
    core.scenarioRuntime.dust!.permanentTraitorPlayerIds = ['1'];
    core.scenarioRuntime.deadExplorerPlayerIds = [];
    core.scenarioRuntime.corpseLootedByPlayerIdsThisTurn = [];

    core = applyBetrayalCommand(
        core,
        BETRAYAL_COMMANDS.USE_POSSESSION,
        '1',
        { cardId: 'mask', targetRoomId: 'entrance-hall' },
    );
    for (const trait of ['might', 'speed', 'knowledge', 'sanity'] as BetrayalTraitKey[]) {
        core = setBoardTraitTrack(core, '1', trait, [1], 0, 0);
    }
    core.pendingDamageAllocation = {
        id: 'board-dust-used-mask-rabbit-foot',
        playerId: '1',
        sourceTitle: '灰尘冲动',
        damageKind: 'general',
        amount: 2,
        originalAmount: 2,
        allowedTraits: ['might', 'speed', 'knowledge', 'sanity'],
        allowSkull: true,
        traitsBeforeDamage: { ...core.currentExplorer.traits },
    };
    core = applyBetrayalCommand(
        core,
        BETRAYAL_COMMANDS.RESOLVE_DAMAGE_ALLOCATION,
        '1',
        { traits: lethalDamageTraitsForPendingAllocation(core) },
        100,
        createBetrayalScriptedRandom(1, 2, 2),
    );
    expect(core.scenarioRuntime.deadExplorerPlayerIds).toContain('1');
    expect(core.recentRoll?.kind).toBe('deathPrevention');

    core = applyBetrayalCommand(
        core,
        BETRAYAL_COMMANDS.USE_RABBIT_FOOT,
        '1',
        { cardId: 'rope', dieIndex: 0 },
        101,
        createBetrayalScriptedRandom(rabbitFootRerollDie),
    );
    return core;
}

type DustConsumedActiveBoardCardCase = {
    cardId: string;
    cardName: string;
    kind: 'item' | 'omen';
    payload: BetrayalCommandMap[typeof BETRAYAL_COMMANDS.USE_POSSESSION];
    deathRoomId: string;
    prepare?: (core: BetrayalCore) => void;
};

const DUST_CONSUMED_ACTIVE_BOARD_CARD_CASES: DustConsumedActiveBoardCardCase[] = [
    {
        cardId: 'medical-kit',
        cardName: '急救包',
        kind: 'item',
        payload: { cardId: 'medical-kit', targetPlayerId: '1' },
        deathRoomId: 'entrance-hall',
        prepare: (core) => {
            for (const trait of ['might', 'speed', 'knowledge', 'sanity'] as BetrayalTraitKey[]) {
                setBoardTraitTrack(core, '1', trait, [1, 2, 3, 4], 0, 2);
            }
        },
    },
    {
        cardId: 'holy-water',
        cardName: '奇怪的药品',
        kind: 'item',
        payload: { cardId: 'holy-water' },
        deathRoomId: 'entrance-hall',
        prepare: (core) => {
            setBoardTraitTrack(core, '1', 'might', [1, 2, 3, 4], 0, 2);
            setBoardTraitTrack(core, '1', 'speed', [1, 2, 3, 4], 0, 2);
        },
    },
    {
        cardId: 'map',
        cardName: '地图',
        kind: 'item',
        payload: { cardId: 'map', targetRoomId: 'upper-landing' },
        deathRoomId: 'upper-landing',
    },
    {
        cardId: 'notebook',
        cardName: '笔记本',
        kind: 'item',
        payload: { cardId: 'notebook', targetRoomId: 'upper-landing' },
        deathRoomId: 'upper-landing',
    },
    {
        cardId: 'journal',
        cardName: '日记',
        kind: 'item',
        payload: { cardId: 'journal', targetRoomId: 'upper-landing' },
        deathRoomId: 'upper-landing',
    },
    {
        cardId: 'manuscript',
        cardName: '手稿',
        kind: 'item',
        payload: { cardId: 'manuscript', targetRoomId: 'upper-landing' },
        deathRoomId: 'upper-landing',
    },
];

function createDustUsedConsumedActiveRabbitFootBoardCore(
    cardCase: DustConsumedActiveBoardCardCase,
    rabbitFootRerollDie: number,
): BetrayalCore {
    let core = createDustHauntBoardCore();
    core = activateBoardExplorer(core, '1');
    core.currentExplorer = {
        ...core.currentExplorer,
        roomId: 'entrance-hall',
        traits: {
            ...core.currentExplorer.traits,
            knowledge: 5,
            sanity: 2,
        },
        inventory: [
            { id: 'skull', name: '头骨', kind: 'omen' },
            { id: 'rope', name: '兔脚', kind: 'item' },
            { id: cardCase.cardId, name: cardCase.cardName, kind: cardCase.kind },
        ],
    };
    core.activeRoomId = 'entrance-hall';
    core.currentExplorerRoomId = 'entrance-hall';
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.currentExplorerInventory = [...core.currentExplorer.inventory];
    core.turnStartInventoryCardIds = ['skull', 'rope', cardCase.cardId];
    core.otherExplorers = core.otherExplorers.map((explorer) => (
        explorer.playerId === '0'
            ? {
                ...explorer,
                roomId: cardCase.deathRoomId,
                inventory: [{ id: 'omen-book', name: '书本', kind: 'omen' }],
            }
            : explorer
    ));
    core.scenarioRuntime.dust!.permanentTraitorPlayerIds = ['1'];
    core.scenarioRuntime.deadExplorerPlayerIds = [];
    core.scenarioRuntime.corpseLootedByPlayerIdsThisTurn = [];
    cardCase.prepare?.(core);

    core = applyBetrayalCommand(
        core,
        BETRAYAL_COMMANDS.USE_POSSESSION,
        '1',
        cardCase.payload,
    );
    expect(core.currentExplorer.roomId, cardCase.cardName).toBe(cardCase.deathRoomId);
    expect(core.currentExplorer.inventory.map((card) => card.id), cardCase.cardName).not.toContain(cardCase.cardId);

    for (const trait of ['might', 'speed', 'knowledge', 'sanity'] as BetrayalTraitKey[]) {
        core = setBoardTraitTrack(core, '1', trait, [1], 0, 0);
    }
    core.pendingDamageAllocation = {
        id: `board-dust-used-${cardCase.cardId}-rabbit-foot`,
        playerId: '1',
        sourceTitle: '灰尘冲动',
        damageKind: 'general',
        amount: 2,
        originalAmount: 2,
        allowedTraits: ['might', 'speed', 'knowledge', 'sanity'],
        allowSkull: true,
        traitsBeforeDamage: { ...core.currentExplorer.traits },
    };
    core = applyBetrayalCommand(
        core,
        BETRAYAL_COMMANDS.RESOLVE_DAMAGE_ALLOCATION,
        '1',
        { traits: lethalDamageTraitsForPendingAllocation(core) },
        100,
        createBetrayalScriptedRandom(1, 2, 2),
    );
    expect(core.scenarioRuntime.deadExplorerPlayerIds).toContain('1');
    expect(core.recentRoll?.kind).toBe('deathPrevention');

    core = applyBetrayalCommand(
        core,
        BETRAYAL_COMMANDS.USE_RABBIT_FOOT,
        '1',
        { cardId: 'rope', dieIndex: 0 },
        101,
        createBetrayalScriptedRandom(rabbitFootRerollDie),
    );
    return core;
}

function placeOtherExplorerInBoardRoom(
    core: BetrayalCore,
    playerId: string,
    roomId: string,
): BetrayalCore {
    core.otherExplorers = core.otherExplorers.map((explorer) => (
        explorer.playerId === playerId
            ? { ...explorer, roomId }
            : explorer
    ));
    return core;
}

describe('Betrayal Board foundation', () => {
    it('能渲染角色选择屏并提供确认入口', () => {
        renderBoard(createBetrayalCharacterSelectCore(['0', '1', '2']), {
            playerID: '0',
            matchData: defaultMatchData.slice(0, 3),
        });

        expect(screen.getByTestId('betrayal-character-select-screen')).toBeInTheDocument();
        expect(screen.getByText('选择探索者')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-character-confirm')).toHaveTextContent('确认');
        expect(screen.getByTestId('betrayal-character-detail-scroll')).toHaveClass(
            'custom-scrollbar',
            'overflow-y-auto',
            'overflow-x-hidden',
        );
        expect(screen.getByTestId('betrayal-character-selection-grid')).toHaveClass(
            'no-scrollbar',
            'overflow-x-hidden',
            'overflow-y-auto',
        );
        expect(screen.queryByTestId('betrayal-character-mobile-pager')).not.toBeInTheDocument();
        const mobileGrid = screen.getByTestId('betrayal-character-mobile-grid');
        expect(mobileGrid).toHaveClass(
            'grid',
            'grid-cols-3',
            'overflow-x-hidden',
            'overflow-y-auto',
            'no-scrollbar',
        );
        const mobileCharacters = within(mobileGrid);
        expect(mobileCharacters.getByTestId('betrayal-character-card-isa-valencia')).not.toHaveTextContent('已选择');
        expect(mobileCharacters.getByTestId('betrayal-character-card-isa-valencia')).toHaveAttribute('aria-label', expect.stringContaining('已选择'));
        expect(mobileCharacters.getByTestId('betrayal-character-card-isa-valencia')).toHaveTextContent('P1');
        expect(mobileCharacters.getByTestId('betrayal-character-card-isa-valencia-state-outline')).toHaveAttribute('data-highlight-shape', 'pentagon');
        [
            'isa-valencia',
            'anita-hernandez',
            'father-warren-leung',
            'dan-nguyen-md',
            'michelle-monroe',
            'beat-box-bowen',
            'josef-hooper',
            'oliver-swift',
            'stephanie-richter',
            'persephone-puleri',
            'sammy-angler',
            'jaden-jones',
        ].forEach((explorerId) => {
            expect(mobileCharacters.getByTestId(`betrayal-character-card-${explorerId}`)).toBeInTheDocument();
        });
        expect(mobileCharacters.queryByTestId('betrayal-character-card-rebecca-allen')).not.toBeInTheDocument();
        expect(mobileCharacters.queryByTestId('betrayal-character-card-darryl-highla')).not.toBeInTheDocument();
        expect(mobileCharacters.queryByTestId('betrayal-character-card-lia-valencia')).not.toBeInTheDocument();
        expect(mobileCharacters.queryByTestId('betrayal-character-card-sam-yin')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-character-mobile-page-label')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-character-page-down')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-character-page-up')).not.toBeInTheDocument();

        const abilitySummary = screen.getByTestId('betrayal-character-ability-summary');
        expect(abilitySummary).toHaveTextContent('特性：');
        expect(abilitySummary).toHaveTextContent('无特殊能力');
        expect(abilitySummary).toHaveTextContent('基础版角色背景不改变规则');
        expect(abilitySummary).not.toHaveAttribute('title');
        expect(screen.queryByTestId('betrayal-character-ability-trigger')).not.toBeInTheDocument();
    });

    it('发现牌特写背景遮罩必须覆盖全屏而不是中间竖条', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2']);
        core.latestDiscovery = {
            kind: 'item',
            title: '砍刀',
            summary: '获得物品',
            detail: '获得砍刀',
            tone: 'accent',
        };
        core.latestDiscoveryOwnerPlayerId = '0';

        render(
            <HarnessBoard
                initialCore={core}
                playerID="0"
                matchData={defaultMatchData.slice(0, 3)}
            />,
        );

        const discoveryPanel = screen.getByTestId('betrayal-discovery-panel');
        expectDiscoveryBackdropFullscreen(discoveryPanel);
        expect(discoveryPanel).toHaveClass('bg-[rgba(3,7,6,0.76)]');
        expect(discoveryPanel.closest('section')?.className ?? '').toContain('z-[130]');
    });

    it('角色选择阶段展示七张剧本卡候选，默认首剧本是木乃伊横行', () => {
        render(
            <HarnessBoard
                initialCore={createBetrayalCharacterSelectCore(['0', '1', '2'])}
                playerID="0"
                matchData={defaultMatchData.slice(0, 3)}
            />,
        );

        expect(screen.getByTestId('betrayal-character-scenario-button')).toHaveTextContent('木乃伊横行');
        expect(screen.getByTestId('betrayal-character-scenario-button')).toHaveTextContent('待确认剧本卡');
        expect(screen.getByTestId('betrayal-scenario-confirmation-count')).toHaveTextContent('先选探索者');

        fireEvent.click(screen.getByTestId('betrayal-character-scenario-button'));
        expect(screen.getByTestId('betrayal-scenario-candidate-count')).toHaveTextContent('7 张候选');
        expect(screen.getByTestId('betrayal-scenario-dialog-confirmation-count')).toHaveTextContent('先选探索者');
        const candidateListElement = screen.getByTestId('betrayal-scenario-candidate-list');
        const candidateList = within(candidateListElement);
        expect(candidateList.getAllByRole('button')).toHaveLength(7);
        expect(candidateList.getByTestId('betrayal-scenario-option-mummy-rampage')).toHaveTextContent('木乃伊横行');
        expect(candidateList.getByTestId('betrayal-scenario-option-mummy-rampage')).toHaveTextContent('当前提议');
        expect(candidateList.getByTestId('betrayal-scenario-option-mummy-rampage')).toHaveAttribute('data-scenario-card-status', 'implemented');
        expect(candidateList.getByTestId('betrayal-scenario-option-crimson-jack-returns')).toHaveTextContent('赤红杰克归来');
        expect(candidateList.getByTestId('betrayal-scenario-option-crimson-jack-returns')).toHaveTextContent('暂不可选');
        expect(candidateList.getByTestId('betrayal-scenario-option-crimson-jack-returns')).toHaveAttribute('data-scenario-card-status', 'contract-pending');
        expect(candidateList.getByTestId('betrayal-scenario-option-friends-forever')).toHaveTextContent('永远的朋友');
        expect(candidateList.getByTestId('betrayal-scenario-option-friends-forever')).toHaveTextContent('暂不可选');
        expect(candidateList.getByTestId('betrayal-scenario-option-friends-forever')).toHaveAttribute('data-scenario-card-status', 'contract-pending');
        expect(candidateList.getByTestId('betrayal-scenario-option-blood-from-a-stone')).toHaveTextContent('顽石之血');
        expect(candidateList.getByTestId('betrayal-scenario-option-blood-from-a-stone')).toHaveTextContent('可开局');
        expect(candidateList.getByTestId('betrayal-scenario-option-blood-from-a-stone')).toHaveAttribute('data-scenario-card-status', 'runtime-supported');
        expect(candidateList.getByTestId('betrayal-scenario-option-upon-reflection')).toHaveTextContent('镜中回望');
        expect(candidateList.getByTestId('betrayal-scenario-option-upon-reflection')).toHaveTextContent('暂不可选');
        expect(candidateList.getByTestId('betrayal-scenario-option-upon-reflection')).toHaveAttribute('data-scenario-card-status', 'contract-pending');
        expect(candidateListElement).not.toHaveTextContent(/待接入|运行时|合同|runtime|contract/i);
        expect(screen.getByTestId('betrayal-scenario-select-current')).toBeDisabled();
        fireEvent.click(screen.getByTestId('betrayal-scenario-dialog-close'));

        fireEvent.click(
            within(screen.getByTestId('betrayal-character-mobile-grid'))
                .getByTestId('betrayal-character-card-jaden-jones'),
        );
        fireEvent.click(screen.getByTestId('betrayal-character-confirm'));
        expect(screen.getByTestId('betrayal-character-confirm')).toHaveTextContent('确认此剧本卡');
        expect(screen.getByTestId('betrayal-scenario-confirmation-count')).toHaveTextContent('剧本确认 0/1');

        fireEvent.click(screen.getByTestId('betrayal-character-scenario-button'));
        fireEvent.click(screen.getByTestId('betrayal-scenario-option-friends-forever'));
        fireEvent.click(screen.getByTestId('betrayal-scenario-select-current'));
        expect(screen.getByTestId('betrayal-character-scenario-button')).toHaveTextContent('永远的朋友');
        expect(screen.getByTestId('betrayal-character-scenario-button')).toHaveTextContent('已确认');
        expect(screen.getByTestId('betrayal-scenario-confirmation-count')).toHaveTextContent('剧本确认 1/1');
        expect(screen.getByTestId('betrayal-character-confirm')).toBeDisabled();
        expect(screen.getByTestId('betrayal-character-confirm')).toHaveTextContent('这个剧本现在不能开始');

        fireEvent.click(screen.getByTestId('betrayal-character-scenario-button'));
        fireEvent.click(screen.getByTestId('betrayal-scenario-option-blood-from-a-stone'));
        expect(screen.getByTestId('betrayal-scenario-detail-toggle')).not.toBeDisabled();
        fireEvent.click(screen.getByTestId('betrayal-scenario-detail-toggle'));
        expect(screen.queryByTestId('betrayal-scenario-opening-cinematic')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-scenario-reader-dialog')).not.toHaveTextContent('赤红杰克');
        const bloodFromStoneBook = screen.getByTestId('betrayal-scenario-book');
        expect(bloodFromStoneBook).toHaveTextContent('顽石之血');
        expect(bloodFromStoneBook).toHaveTextContent('石像小天使');
        expect(bloodFromStoneBook).not.toHaveTextContent(/运行时|合同|补齐清单|赤红杰克/);
        expect(screen.queryByTestId('betrayal-scenario-book-section-setup')).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId('betrayal-scenario-reader-close'));
        fireEvent.click(screen.getByTestId('betrayal-scenario-select-current'));
        expect(screen.getByTestId('betrayal-character-scenario-button')).toHaveTextContent('顽石之血');
        expect(screen.getByTestId('betrayal-character-confirm')).not.toBeDisabled();
        expect(screen.getByTestId('betrayal-character-confirm')).toHaveTextContent('开始剧本');

        fireEvent.click(screen.getByTestId('betrayal-character-scenario-button'));
        fireEvent.click(screen.getByTestId('betrayal-scenario-option-mummy-rampage'));
        fireEvent.click(screen.getByTestId('betrayal-scenario-select-current'));
        expect(screen.getByTestId('betrayal-character-scenario-button')).toHaveTextContent('木乃伊横行');
        expect(screen.getByTestId('betrayal-character-confirm')).not.toBeDisabled();
        expect(screen.getByTestId('betrayal-character-confirm')).toHaveTextContent('开始剧本');
    });

    it('点击开始剧本后先显示开局电影字幕，再进入牌桌', async () => {
        let openingCore = createBetrayalCharacterSelectCore(['0', '1', '2']);
        openingCore = applyBetrayalCommand(openingCore, BETRAYAL_COMMANDS.SELECT_EXPLORER, '1', { explorerId: 'anita-hernandez' });
        openingCore = applyBetrayalCommand(openingCore, BETRAYAL_COMMANDS.CONFIRM_EXPLORER, '1', {});
        openingCore = applyBetrayalCommand(openingCore, BETRAYAL_COMMANDS.SELECT_EXPLORER, '2', { explorerId: 'father-warren-leung' });
        openingCore = applyBetrayalCommand(openingCore, BETRAYAL_COMMANDS.CONFIRM_EXPLORER, '2', {});
        openingCore = applyBetrayalCommand(openingCore, BETRAYAL_COMMANDS.CONFIRM_SCENARIO_CARD, '1', {});
        openingCore = applyBetrayalCommand(openingCore, BETRAYAL_COMMANDS.CONFIRM_SCENARIO_CARD, '2', {});

        render(
            <HarnessBoard
                initialCore={openingCore}
                playerID="0"
                matchData={defaultMatchData.slice(0, 3)}
            />,
        );

        fireEvent.click(
            within(screen.getByTestId('betrayal-character-mobile-grid'))
                .getByTestId('betrayal-character-card-jaden-jones'),
        );
        fireEvent.click(screen.getByTestId('betrayal-character-confirm'));
        expect(screen.getByTestId('betrayal-character-confirm')).toHaveTextContent('确认此剧本卡');

        fireEvent.click(screen.getByTestId('betrayal-character-confirm'));
        await waitFor(() => {
            expect(screen.getByTestId('betrayal-character-confirm')).toHaveTextContent('开始剧本');
            expect(screen.getByTestId('betrayal-character-confirm')).not.toBeDisabled();
        });

        fireEvent.click(screen.getByTestId('betrayal-character-confirm'));
        await waitFor(() => {
            expect(screen.getByTestId('betrayal-start-scenario-opening-stage')).toBeInTheDocument();
        });
        const startOpening = screen.getByTestId('betrayal-start-scenario-opening-cinematic');
        expect(startOpening).toHaveTextContent('英雄开场过场');
        expect(startOpening).not.toHaveTextContent('木乃伊横行');
        expect(screen.queryByTestId('betrayal-start-scenario-opening-source-status')).not.toBeInTheDocument();
        expect(startOpening).not.toHaveTextContent('本地规则源正文');
        expect(startOpening).not.toHaveTextContent('正式中文转写');

        fireEvent.click(screen.getByTestId('betrayal-start-scenario-opening-continue'));
        await waitFor(() => {
            expect(screen.queryByTestId('betrayal-start-scenario-opening-stage')).not.toBeInTheDocument();
        });
        expect(screen.getByTestId('betrayal-room-grid')).toBeInTheDocument();
    });

    it('直接注入恶兆前牌桌时不强制弹开局电影字幕', async () => {
        const view = renderBoard(createBetrayalCharacterSelectCore(['0', '1', '2']), {
            playerID: '0',
            matchData: defaultMatchData.slice(0, 3),
        });

        expect(screen.getByTestId('betrayal-character-confirm')).toBeInTheDocument();

        view.rerender(
            renderBoardTree(createStartedFirstScenarioCore(['0', '1', '2']), {
                playerID: '0',
                matchData: defaultMatchData.slice(0, 3),
            }),
        );

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-room-grid')).toBeInTheDocument();
        });
        expect(screen.queryByTestId('betrayal-start-scenario-opening-stage')).not.toBeInTheDocument();
    });

    it('角色选择阶段必须显示共同确认进度，不能只靠单名玩家确认就开局', () => {
        let core = createBetrayalCharacterSelectCore(['0', '1', '2']);
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.SELECT_EXPLORER, '0', { explorerId: 'jaden-jones' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.CONFIRM_EXPLORER, '0', {});
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.SELECT_EXPLORER, '1', { explorerId: 'anita-hernandez' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.CONFIRM_EXPLORER, '1', {});
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.CONFIRM_SCENARIO_CARD, '0', {});

        const firstRender = renderBoard(core, {
            playerID: '0',
            matchData: defaultMatchData.slice(0, 3),
        });

        expect(screen.getByTestId('betrayal-scenario-confirmation-count')).toHaveTextContent('剧本确认 1/2');
        expect(screen.getByTestId('betrayal-character-confirm')).toBeDisabled();
        expect(screen.getByTestId('betrayal-character-confirm')).toHaveTextContent('已确认');
        firstRender.unmount();

        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.CONFIRM_SCENARIO_CARD, '1', {});
        renderBoard(core, {
            playerID: '0',
            matchData: defaultMatchData.slice(0, 3),
        });

        expect(screen.getByTestId('betrayal-scenario-confirmation-count')).toHaveTextContent('剧本确认 2/2');
        expect(screen.getByTestId('betrayal-character-confirm')).not.toBeDisabled();
        expect(screen.getByTestId('betrayal-character-confirm')).toHaveTextContent('开始剧本');
    });

    it('能渲染真实运行时基础布局', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'hallway',
        };
        core.activeRoomId = 'hallway';
        renderBoard(core, {
            playerID: '0',
            matchData: defaultMatchData,
        });

        expect(screen.getByTestId('betrayal-board')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-room-grid')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-action-explore')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-mobile-dock-explore')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-open-scenario')).toBeInTheDocument();
        const focusSelfRoomButton = screen.getByTestId('betrayal-focus-self-room');
        expect(focusSelfRoomButton).toBeInTheDocument();
        expect(focusSelfRoomButton).toHaveAttribute('data-room-focus-action', 'self-room');
        expect(focusSelfRoomButton).toHaveAttribute('data-room-focus-target-id', core.currentExplorer.roomId);
        expect(focusSelfRoomButton).toHaveAttribute('data-room-focus-icon', 'locate-fixed');
        expect(focusSelfRoomButton).toHaveAttribute('title', '聚焦到我的房间');
        expect(screen.getByTestId('betrayal-current-ability')).toHaveTextContent('特性：');
        expect(screen.getByTestId('betrayal-current-ability')).toHaveTextContent(/\S+：\S+/);
        const currentTraits = screen.getByTestId('betrayal-current-traits');
        expect(currentTraits.querySelector('[data-trait-track-rail="true"]')).toBeInTheDocument();
        expect(currentTraits.querySelector('[data-trait-track-rail-shape="continuous-segmented"]')).toBeInTheDocument();
        expect(currentTraits.querySelector('[data-trait-track-repeat-value-policy="separate-physical-slots"]')).toBeInTheDocument();
        expect(currentTraits.querySelector('[data-trait-track-segmented-rail="true"]')).toBeInTheDocument();
        expect(currentTraits.querySelector('[data-trait-track-slot="true"]')).toBeInTheDocument();
        expect(currentTraits.querySelector('[data-trait-track-pointer="true"]')).toBeInTheDocument();
        expect(currentTraits.querySelector('[data-trait-track-tick="true"]')).not.toBeInTheDocument();
        const skullEndpoint = currentTraits.querySelector('[data-trait-track-skull="true"]');
        expect(skullEndpoint).toBeInTheDocument();
        expect(skullEndpoint).toHaveAttribute('title', expect.stringContaining('死亡格'));
        expect(currentTraits.querySelector('[data-trait-track-start-marker="true"]')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-current-trait-track-might')).toHaveAttribute('data-trait-track-position');
        for (const trait of ['might', 'speed', 'knowledge', 'sanity'] as BetrayalTraitKey[]) {
            const track = screen.getByTestId(`betrayal-current-trait-track-${trait}`);
            const startSlot = track.querySelector('[data-trait-track-start="true"]');
            expect(startSlot).toBeInTheDocument();
            expect(startSlot).toHaveAttribute('data-trait-track-start-indicator', 'in-slot-green-band');
            expect(startSlot).toHaveAttribute('title', expect.stringContaining('初始格'));
        }
        expect(within(currentTraits).getByText('力量').parentElement).toHaveClass('text-[#e8b09f]');
        expect(within(currentTraits).getByText('速度').parentElement).toHaveClass('text-[#ebdca1]');
        expect(within(currentTraits).getByText('知识').parentElement).toHaveClass('text-[#cbe4ea]');
        expect(within(currentTraits).getByText('神志').parentElement).toHaveClass('text-[#d9c4ef]');
        const currentBoardToken = screen.getByTestId('betrayal-explorer-figure-token-0');
        expect(screen.queryByTestId('betrayal-current-panel-token-0')).not.toBeInTheDocument();
        expect(currentTraits).toHaveAttribute('data-player-id', currentBoardToken.getAttribute('data-player-id')!);
        expect(currentTraits).toHaveAttribute('data-explorer-id', currentBoardToken.getAttribute('data-explorer-id')!);
        expect(currentTraits).not.toHaveAttribute('data-token-asset');
        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('等待第一步');
        expect(screen.queryByRole('region', { name: '阶段提示' })).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-mobile-selected-card')).toHaveTextContent('未选卡牌');
        expect(screen.getByTestId('betrayal-action-use')).toBeDisabled();
        expect(screen.getByTestId('betrayal-inventory-row-item')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-inventory-row-omen')).toBeInTheDocument();
        expect(document.querySelector('[data-resource-count-shape="square"]')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-bottom-teammate-1')).toHaveTextContent('队友一');
        expect(screen.getByTestId('betrayal-bottom-teammate-1').querySelector('[data-trait-value-shape="square"]')).toBeInTheDocument();
        const teammatePanel = screen.getByTestId('betrayal-bottom-teammate-1');
        expect(teammatePanel).not.toHaveAttribute('data-token-asset');
        const desktopTeammatePanel = screen.getByTestId('betrayal-teammate-panel-1');
        expect(screen.getByTestId('betrayal-teammate-trait-track-1-might')).toHaveAttribute('data-trait-track-position');
        expect(screen.queryByTestId('betrayal-teammate-panel-token-1')).not.toBeInTheDocument();
        expect(desktopTeammatePanel).toHaveAttribute('data-player-id', teammatePanel.getAttribute('data-player-id')!);
        expect(desktopTeammatePanel).toHaveAttribute('data-explorer-id', teammatePanel.getAttribute('data-explorer-id')!);
        expect(desktopTeammatePanel).not.toHaveAttribute('data-token-asset');
    });

    it('当前角色板按属性轨位置显示夹子，重复数值不会吞掉位置变化', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.currentExplorer.traitTracks.speed = {
            trackId: 'test-speed-full-physical-slots',
            values: [2, 3, 3, 4, 4, 5, 6, 6],
            position: 2,
            startPosition: 1,
            criticalPosition: 0,
            skullPosition: -1,
            maxPosition: 7,
        };
        core.currentExplorer.traits.speed = 3;
        core.currentExplorerTraits = { ...core.currentExplorer.traits };

        renderBoard(core, {
            playerID: '0',
            matchData: defaultMatchData,
        });

        const speedTrack = screen.getByTestId('betrayal-current-trait-track-speed');
        expect(speedTrack).toHaveAttribute('data-trait-track-position', '2');
        expect(speedTrack).toHaveAttribute('data-trait-track-value', '3');
        expect(speedTrack.querySelector('[data-trait-track-rail="true"]')).toHaveAttribute('data-trait-track-rail-shape', 'continuous-segmented');
        expect(speedTrack.querySelector('[data-trait-track-rail="true"]')).toHaveAttribute('data-trait-track-repeat-value-policy', 'separate-physical-slots');
        expect(speedTrack.querySelector('[data-trait-track-segmented-rail="true"]')).toBeInTheDocument();
        expect(speedTrack.querySelector('[data-trait-track-segmented-rail="true"]')).toHaveAttribute('data-trait-track-visual-separation', 'continuous-rail-internal-dividers');
        expect(speedTrack.querySelectorAll('[data-trait-track-slot="true"]')).toHaveLength(9);
        expect(speedTrack.querySelectorAll('[data-trait-track-slot-boundary="rail-start"]')).toHaveLength(1);
        expect(speedTrack.querySelectorAll('[data-trait-track-slot-boundary="internal-divider"]')).toHaveLength(8);
        expect(speedTrack.querySelectorAll('[data-trait-track-pointer="true"]')).toHaveLength(1);
        expect(speedTrack.querySelector('[data-trait-track-pointer="true"]')).toHaveAttribute('data-trait-track-position', '2');
        expect(speedTrack.querySelector('[data-trait-track-pointer="true"]')).toHaveAttribute('data-trait-track-current', 'true');
        expect(speedTrack.querySelector('[data-trait-track-pointer="true"]')).toHaveAttribute('data-trait-track-pointer-shape', 'material-slot-highlight');
        expect(speedTrack.querySelector('[data-trait-track-position="2"]')).toHaveAttribute('data-trait-track-color', 'current-green');
        expect(speedTrack.querySelector('[data-trait-track-position="1"]')).toHaveAttribute('data-trait-track-color', 'start-green');
        expect(speedTrack.querySelector('[data-trait-track-position="1"]')).toHaveAttribute('data-trait-track-start-indicator', 'in-slot-green-band');
        expect(speedTrack.querySelector('[data-trait-track-position="2"] [data-trait-track-slot-label="true"]')).toHaveAttribute('data-trait-track-slot-label-align', 'center');
        expect(speedTrack.querySelector('[data-trait-track-marker-asset]')).not.toBeInTheDocument();
        expect(speedTrack.querySelector('[data-trait-track-tick="true"]')).not.toBeInTheDocument();
        expect(speedTrack.querySelector('[data-trait-track-position="1"]')).toHaveTextContent('3');
        expect(speedTrack.querySelector('[data-trait-track-position="1"]')).toHaveAttribute('data-trait-track-current', 'false');

        const boardMarker = screen.getByTestId('betrayal-explorer-board-marker-speed');
        expect(boardMarker).toHaveAttribute('data-trait-track-position', '2');
        expect(boardMarker).toHaveAttribute('data-trait-track-value', '3');
        expect(boardMarker).toHaveAttribute('data-trait-board-marker-shape', 'blank-material-marker');
        expect(boardMarker).toHaveAttribute('data-trait-board-marker-asset', 'betrayal/markers/number-blank');
        expect(boardMarker).toHaveAttribute('data-trait-board-marker-visible-value', 'false');
        expect(boardMarker).not.toHaveTextContent('3');
    });

    it('探索者玩家面板恢复人物板，地图 token 保持正式资源状态', async () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.otherExplorers = core.otherExplorers.map((explorer) => (
            explorer.playerId === '1'
                ? {
                    ...explorer,
                    roomId: core.currentExplorer.roomId,
                    inventory: [{ id: 'holy-symbol', name: '圣符', kind: 'omen' }],
                }
                : explorer.playerId === '2'
                    ? { ...explorer, roomId: 'basement-landing' }
                : explorer
        ));

        renderBoard(core, {
            playerID: '0',
            matchData: defaultMatchData,
        });

        const anita = EXPLORER_CATALOG.find((explorer) => explorer.explorerId === 'anita-hernandez')!;
        const fatherWarren = EXPLORER_CATALOG.find((explorer) => explorer.explorerId === 'father-warren-leung')!;
        expect(EXPLORER_CATALOG.some((explorer) => explorer.explorerId === 'rebecca-allen')).toBe(false);
        expect(EXPLORER_CATALOG.some((explorer) => explorer.explorerId === 'darryl-highla')).toBe(false);
        expect(anita.tokenAsset).toBe('betrayal/tokens/explorers/anita-hernandez');
        expect(fatherWarren.tokenAsset).toBe('betrayal/tokens/explorers/father-warren-leung');
        const currentPlayerPanel = screen.getByTestId('betrayal-observed-explorer-panel');
        expect(currentPlayerPanel).not.toHaveAttribute('data-token-asset');
        expect(currentPlayerPanel).toHaveAttribute('data-panel-asset', core.currentExplorer.portraitAsset);
        expect(currentPlayerPanel).not.toHaveTextContent('缺少正式标记');
        expect(screen.getByTestId('betrayal-bottom-teammate-1')).not.toHaveAttribute('data-token-asset');
        expect(screen.getByTestId('betrayal-bottom-teammate-2')).not.toHaveAttribute('data-token-asset');
        expect(screen.getByTestId('betrayal-bottom-teammate-1').querySelector('[data-player-status-tone="neutral"]')).toHaveTextContent('同房间');
        expect(screen.getByTestId('betrayal-bottom-teammate-1').querySelector('[data-player-status-tone="target"]')).toBeNull();
        expect(screen.getByTestId('betrayal-teammate-panel-1').querySelector('[data-player-status-tone="neutral"]')).toHaveTextContent('同房间');
        expect(screen.queryByTestId('betrayal-bottom-teammate-inventory-1')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-teammate-inventory-1')).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('betrayal-bottom-teammate-1'));
        expect(screen.queryByTestId('betrayal-explorer-detail-dialog-1')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-bottom-teammate-1')).toHaveAttribute('data-observed-player', 'true');
        expect(screen.getByTestId('betrayal-bottom-teammate-observed-1')).toBeInTheDocument();
       expect(screen.getByTestId('betrayal-current-traits')).toHaveAttribute('data-observed-player', 'true');
       expect(screen.getByTestId('betrayal-current-traits')).toHaveAttribute('data-player-id', '1');
       const observedPlayerPanel = screen.getByTestId('betrayal-observed-explorer-panel');
       expect(observedPlayerPanel).toHaveAttribute('data-player-id', '1');
       expect(observedPlayerPanel).not.toHaveAttribute('data-token-asset');
       expect(observedPlayerPanel).toHaveAttribute('data-panel-asset', anita.portraitAsset);
       expect(observedPlayerPanel).not.toHaveTextContent('缺少正式标记');
        expect(screen.queryByTestId('betrayal-observed-inventory-zone')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-inventory-section')).toHaveAttribute('data-observed-player', 'true');
        expect(screen.getByTestId('betrayal-inventory-section')).toHaveAttribute('data-player-id', '1');
        expect(screen.getByTestId('betrayal-inventory-owner-label')).toHaveTextContent('队友一');
        expect(screen.getByTestId('betrayal-inventory-holy-symbol')).toHaveTextContent('圣符');
        expect(screen.getByTestId('betrayal-inventory-holy-symbol')).toHaveAttribute('data-inventory-read-only', 'true');
        fireEvent.click(screen.getByTestId('betrayal-inventory-holy-symbol'));
        expect(screen.queryByTestId('betrayal-selected-inventory-card-name')).not.toBeInTheDocument();
       expect(screen.queryByTestId('betrayal-current-panel-token-1')).not.toBeInTheDocument();
        const mapOccupantToken = screen.getByTestId(`betrayal-room-occupant-${core.currentExplorer.roomId}-1`);
        expect(mapOccupantToken.querySelector('[data-testid="betrayal-explorer-figure-token-1"]')).toBeInTheDocument();
        expect(mapOccupantToken.querySelector('[data-testid="betrayal-current-panel-token-1"]')).toBeNull();

       fireEvent.click(screen.getByTestId('betrayal-bottom-teammate-2'));
        expect(screen.getByTestId('betrayal-bottom-teammate-2')).toHaveAttribute('data-observed-player', 'true');
        expect(screen.getByTestId('betrayal-current-traits')).toHaveAttribute('data-player-id', '2');
        await waitFor(() => {
            expect(screen.getByTestId('betrayal-room-grid')).toHaveAttribute(
                'data-room-focus-pan-target',
                'betrayal-room-basement-landing',
            );
        });

        fireEvent.click(screen.getByTestId('betrayal-bottom-teammate-2'));
        expect(screen.getByTestId('betrayal-bottom-teammate-1')).toHaveAttribute('data-observed-player', 'true');
        expect(screen.getByTestId('betrayal-current-traits')).toHaveAttribute('data-player-id', '1');
        await waitFor(() => {
            expect(screen.getByTestId('betrayal-room-grid')).toHaveAttribute(
                'data-room-focus-pan-target',
                `betrayal-room-${core.currentExplorer.roomId}`,
            );
        });

        fireEvent.click(screen.getByTestId('betrayal-focus-self-room'));
        expect(screen.getByTestId('betrayal-current-traits')).toHaveAttribute('data-observed-player', 'false');
        expect(screen.getByTestId('betrayal-current-traits')).toHaveAttribute('data-player-id', '0');
        expect(screen.getByTestId('betrayal-focus-self-room')).toHaveAttribute('data-room-focus-target-id', core.currentExplorer.roomId);

        fireEvent.click(screen.getByTestId(`betrayal-room-occupant-${core.currentExplorer.roomId}-1`));
        const explorerDetailsDialog = screen.getByTestId('betrayal-explorer-detail-dialog-1');
        expect(explorerDetailsDialog).toHaveTextContent('安妮塔·赫南德兹');
        expect(screen.getByTestId('betrayal-explorer-detail-token-1')).toHaveAttribute('data-token-asset', anita.tokenAsset);
        expect(within(explorerDetailsDialog).queryByText('缺少正式标记')).not.toBeInTheDocument();
        const anitaMapToken = screen.getByTestId('betrayal-explorer-figure-token-1');
        expect(anitaMapToken).toHaveAttribute('data-token-asset', anita.tokenAsset);
        expect(anitaMapToken).toHaveAttribute('data-token-state', 'official');
        expect(anitaMapToken?.querySelector('[data-testid="betrayal-explorer-figure-token-missing-1"]')).toBeNull();
    });

    it('牌堆区常驻显示预兆状态，并隐藏完整作祟检定规则说明', () => {
        const core = createStartedFirstScenarioCore(['0', '1', '2']);
        core.currentExplorer.inventory = [
            { id: 'item-alpha', name: '物品A', kind: 'item' },
        ];
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.otherExplorers = core.otherExplorers.map((explorer, index) => ({
            ...explorer,
            inventory: index === 0
                ? [
                    requireRuntimeOmenCard('omen-book'),
                    requireRuntimeOmenCard('dog'),
                ]
                : [
                    requireRuntimeOmenCard('mask'),
                ],
        }));

        renderBoard(core, {
            playerID: '0',
            matchData: defaultMatchData.slice(0, 3),
        });

        const riskStatus = screen.getByTestId('betrayal-haunt-risk-status');
        expect(riskStatus).toHaveAttribute('data-omen-count', '3');
        expect(riskStatus).toHaveAttribute('data-next-dice-count', '4');
        expect(riskStatus).toHaveAttribute('data-threshold', '5');
        expect(riskStatus).toHaveAttribute('data-haunt-started', 'false');
        expect(riskStatus).toHaveTextContent('预兆状态');
        expect(riskStatus).toHaveTextContent('预兆 3');
        expect(riskStatus).not.toHaveTextContent(/下次掷|5\+ 作祟|再抽预兆时检定/);
        expect(riskStatus).toHaveAttribute('title', expect.stringContaining('抽到预兆后'));
        expect(riskStatus).toHaveAttribute('title', expect.stringContaining('总点数达到 5 点'));
        const riskProgress = screen.getByTestId('betrayal-haunt-risk-progress');
        expect(riskProgress).toHaveAttribute('data-number-track-id', 'haunt-risk');
        expect(riskProgress).toHaveAttribute('data-track-min', '0');
        expect(riskProgress).toHaveAttribute('data-track-max', '9');
        expect(riskProgress).toHaveAttribute('data-current-omen-count', '3');
        expect(riskProgress).toHaveAttribute('data-progress-percent', '33');
        expect(riskProgress).toHaveAttribute('data-current-display', 'material-slot-highlight');
        expect(riskProgress).toHaveAttribute('data-haunt-risk-style', 'official-asset-track');
        expect(riskProgress).toHaveAttribute('data-haunt-risk-track-shape', 'material-0-9-bar');
        expect(screen.getByTestId('betrayal-haunt-risk-track-image')).toHaveAttribute('data-haunt-risk-track-image', 'official-0-9');
        expect(riskProgress.querySelector('[data-haunt-risk-slot-grid="true"]')).toBeInTheDocument();
        expect(riskProgress).toHaveAttribute('aria-valuenow', '3');
        const riskSlots = screen.getAllByTestId('betrayal-haunt-risk-slot');
        expect(riskSlots).toHaveLength(10);
        expect(riskSlots[3]).toHaveAttribute('data-haunt-risk-slot', '3');
        expect(riskSlots[3]).toHaveAttribute('data-haunt-risk-current-slot', 'true');
        expect(riskSlots[3]).toHaveAttribute('data-haunt-risk-current-cell', 'true');
        expect(riskSlots[2]).toHaveAttribute('data-haunt-risk-current-slot', 'false');
        expect(riskSlots[2]).toHaveAttribute('data-haunt-risk-current-cell', 'false');
        riskSlots.forEach((slot) => expect(slot).toHaveTextContent(''));
        expect(screen.queryByTestId('betrayal-haunt-risk-pointer')).not.toBeInTheDocument();
    });

    it('局内剧本入口按英雄身份只回看英雄目标页并隐藏叛徒秘密页', () => {
        const core = dismissBlockingBoardOverlays(createFirstScenarioHauntCore());
        expect(core.scenarioRuntime.traitorPlayerId).toBe('2');

        renderBoard(core, {
            playerID: '0',
            matchData: defaultMatchData.slice(0, 3),
        });

        fireEvent.click(screen.getByTestId('betrayal-open-scenario'));

        expect(screen.getByTestId('betrayal-scenario-reader-dialog')).toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-reference-overlay')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-reference-toggle')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-scenario-objective-page')).toHaveAttribute('data-scenario-reader-scope', 'heroes');
        expect(screen.getByTestId('betrayal-scenario-reader-role')).toHaveTextContent('英雄剧本书');
        expect(screen.getByTestId('betrayal-scenario-objective-page')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-scenario-reader-dialog')).not.toHaveTextContent('开局记录');
        expect(screen.queryByTestId('betrayal-reference-card-image')).not.toBeInTheDocument();

        expect(screen.queryByTestId('betrayal-scenario-opening-stage')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-scenario-reader-dialog')).not.toHaveTextContent('英雄开场过场');
        expect(screen.getByTestId('betrayal-scenario-reader-dialog')).not.toHaveTextContent('敢阻我者必死');
        expect(screen.getByTestId('betrayal-scenario-reader-header-progress')).toHaveTextContent('1/1');
        expect(screen.getByTestId('betrayal-scenario-reader-footer-progress')).toHaveTextContent('1/1');
        expect(screen.getByTestId('betrayal-scenario-reader-prev-zone')).toBeDisabled();
        expect(screen.getByTestId('betrayal-scenario-reader-next-zone')).toBeDisabled();

        expect(screen.getByTestId('betrayal-scenario-book')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-scenario-reader-page-label-desktop-left')).toHaveTextContent('01');
        expect(screen.getByTestId('betrayal-scenario-objective-page')).not.toHaveTextContent('木乃伊横行');
        expect(screen.getByTestId('betrayal-scenario-book-section-title-heroes')).toHaveTextContent('敌方情报 / 胜利条件');
        expect(screen.getByTestId('betrayal-scenario-book-section-heroes')).toHaveTextContent('敌方情报 / 胜利条件');
        expect(screen.getByTestId('betrayal-scenario-book-section-heroes')).toHaveTextContent('奸徒致力达成木乃伊及女孩的婚事');
        expect(screen.getByTestId('betrayal-scenario-book-section-heroes')).not.toHaveTextContent('石棺开启');
        expect(screen.getByTestId('betrayal-scenario-book-section-special')).toHaveTextContent('驱逐木乃伊');
        expect(screen.getByTestId('betrayal-scenario-book-section-special')).toHaveTextContent('每个英雄每回合只能尝试一个步骤');
        expect(screen.queryByTestId('betrayal-scenario-book-section-setup')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-scenario-reader-dialog')).not.toHaveTextContent('开局记录');
        expect(screen.queryByTestId('betrayal-scenario-book-section-traitor')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-scenario-book-section-monster')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-scenario-book-section-traitor')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-scenario-book-section-monster')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-scenario-book-section-endingHeroes')).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('betrayal-scenario-reader-close'));
        fireEvent.click(screen.getByTestId('betrayal-open-reference'));
        expect(screen.getByTestId('betrayal-reference-overlay')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-reference-card-image')).toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-scenario-objective-page')).not.toBeInTheDocument();
    });

    it('局内剧本入口按叛徒身份只回看叛徒目标页并隐藏英雄秘密页', () => {
        const core = dismissBlockingBoardOverlays(createFirstScenarioHauntCore());
        expect(core.scenarioRuntime.traitorPlayerId).toBe('2');

        renderBoard(core, {
            playerID: '2',
            matchData: defaultMatchData.slice(0, 3),
        });

        fireEvent.click(screen.getByTestId('betrayal-open-scenario'));

        expect(screen.getByTestId('betrayal-scenario-reader-dialog')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-scenario-objective-page')).toHaveAttribute('data-scenario-reader-scope', 'traitor');
        expect(screen.getByTestId('betrayal-scenario-reader-role')).toHaveTextContent('叛徒剧本书');

        expect(screen.queryByTestId('betrayal-scenario-opening-stage')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-scenario-reader-dialog')).not.toHaveTextContent('叛徒开场过场');
        expect(screen.getByTestId('betrayal-scenario-reader-dialog')).not.toHaveTextContent('牺牲朋友也在所不惜');
        expect(screen.getByTestId('betrayal-scenario-reader-header-progress')).toHaveTextContent('1/1');
        expect(screen.getByTestId('betrayal-scenario-reader-footer-progress')).toHaveTextContent('1/1');
        expect(screen.getByTestId('betrayal-scenario-reader-prev-zone')).toBeDisabled();
        expect(screen.getByTestId('betrayal-scenario-reader-next-zone')).toBeDisabled();

        expect(screen.getByTestId('betrayal-scenario-book')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-scenario-objective-page')).not.toHaveTextContent('木乃伊横行');
        expect(screen.getByTestId('betrayal-scenario-book-section-title-traitor')).toHaveTextContent('敌方情报 / 胜利条件');
        expect(screen.getByTestId('betrayal-scenario-book-section-traitor')).toHaveTextContent('敌方情报 / 胜利条件');
        expect(screen.getByTestId('betrayal-scenario-book-section-traitor')).toHaveTextContent('他们妄图将木乃伊驱逐回亡者之国');
        expect(screen.getByTestId('betrayal-scenario-book-section-monster')).toHaveTextContent('木乃伊 / 战斗要诀');
        expect(screen.getByTestId('betrayal-scenario-book-section-monster')).toHaveTextContent('速度3、力量8、神志5');
        expect(screen.queryByTestId('betrayal-scenario-book-section-setup')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-scenario-reader-dialog')).not.toHaveTextContent('开局记录');
        expect(screen.queryByTestId('betrayal-scenario-book-section-heroes')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-scenario-book-section-special')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-scenario-book-section-heroes')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-scenario-book-section-special')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-scenario-book-section-endingTraitor')).not.toBeInTheDocument();
    });

    it('作祟揭示切到下一行动者后只显示可关闭阶段横幅，并保留手动查阅入口', async () => {
        const core = createMagicCameraHauntRevealBoardCore('1');
        expect(core.phase).toBe('haunt');
        expect(core.scenarioRuntime.hauntCardNumber).toBe(33);
        expect(core.latestDiscoveryOwnerPlayerId).toBe('0');
        expect(core.currentExplorer.playerId).not.toBe(core.latestDiscoveryOwnerPlayerId);
        expect(core.latestDiscovery?.detail).toContain('剧本33');

        renderBoard(core, {
            playerID: '2',
            matchData: defaultMatchData.slice(0, 3),
        });

        expect(screen.queryByTestId('betrayal-discovery-panel')).not.toBeInTheDocument();
        await waitFor(() => {
            expect(screen.queryByTestId('betrayal-recent-roll-panel')).not.toBeInTheDocument();
        });
        expect(screen.queryByTestId('betrayal-scenario-reader-dialog')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-open-scenario')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-open-scenario')).toHaveTextContent(/^剧本$/);
        expect(screen.getByTestId('betrayal-open-scenario')).not.toHaveTextContent(/查阅/);
        expect(screen.getByTestId('betrayal-haunt-reveal-cue')).toHaveAttribute('data-haunt-setup-count', '5');
        const oneTraitorCue = screen.getByTestId('betrayal-haunt-reveal-cue');
        expect(screen.getByTestId('betrayal-haunt-reveal-player-title')).toHaveTextContent('作祟开始');
        expect(screen.getByTestId('betrayal-haunt-reveal-lead')).toHaveTextContent('剧本已切换。');
        expect(screen.getByTestId('betrayal-haunt-reveal-viewer-role')).toHaveAttribute(
            'data-scenario-reader-scope',
            'heroes',
        );
        expect(screen.getByTestId('betrayal-haunt-reveal-viewer-role')).toHaveTextContent('你是英雄：请看英雄剧本书。');
        expect(screen.getByTestId('betrayal-haunt-reveal-close')).toHaveTextContent('关闭');
        expect(screen.queryByTestId('betrayal-haunt-reveal-status-strip')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-haunt-reveal-action-panel')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-haunt-reveal-resume-hint')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-haunt-reveal-open-scenario')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-haunt-reveal-return-to-board')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-haunt-reveal-step-card-public')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-haunt-reveal-public-flow')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-haunt-reveal-secret-boundary')).not.toBeInTheDocument();
        expect(oneTraitorCue).not.toHaveTextContent(/公开朗读|各自阅读|公开读|秘密规则|目标/);
        expect(screen.queryByTestId('betrayal-haunt-setup-queue')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-haunt-setup-entry-place-phantom-photographers')).not.toBeInTheDocument();
        expect(screen.queryByText('发放英雄本质')).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('betrayal-open-scenario'));
        expect(screen.getByTestId('betrayal-scenario-reader-dialog')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-scenario-objective-page')).toHaveTextContent('剧本33');
        expect(screen.getByTestId('betrayal-scenario-objective-page')).not.toHaveTextContent(/剧本33查阅/);
        fireEvent.click(screen.getByTestId('betrayal-scenario-reader-close'));
        expect(screen.queryByTestId('betrayal-scenario-reader-dialog')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-haunt-reveal-cue')).toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-scenario-reader-dialog')).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('betrayal-open-scenario'));
        expect(screen.getByTestId('betrayal-scenario-reader-dialog')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-scenario-objective-page')).toHaveTextContent('剧本33');
        expect(screen.getByTestId('betrayal-scenario-objective-page')).not.toHaveTextContent(/剧本33查阅/);
        fireEvent.click(screen.getByTestId('betrayal-scenario-reader-close'));

        expect(screen.queryByTestId('betrayal-scenario-reader-dialog')).not.toBeInTheDocument();
    });

    it('首剧本作祟状态变化时承接一次剧本阅读，并保留手动短入口', async () => {
        const core = createFirstScenarioHauntCore();
        expect(core.phase).toBe('haunt');
        expect(core.scenarioRuntime.hauntCardNumber).toBe(1);
        expect(core.scenarioRuntime.hauntScenarioCardTitle).toBe('木乃伊横行');
        expect(core.scenarioRuntime.triggeringOmenName).toBeTruthy();
        expect(core.latestDiscovery?.detail).toContain('作祟检定');
        expect(core.latestDiscovery?.detail).toContain('已触发');
        expect(core.latestDiscovery?.detail).not.toContain(['5+', '作祟开始'].join(' '));
        expect(core.latestDiscovery?.detail).not.toContain('剧本');
        expect(core.pendingCardResolutionQueue).toEqual([]);

        const preHauntCore = createStartedFirstScenarioCore(['0', '1', '2']);
        const view = renderBoard(preHauntCore, {
            playerID: '1',
            matchData: defaultMatchData.slice(0, 3),
        });
        expect(screen.queryByTestId('betrayal-scenario-reader-dialog')).not.toBeInTheDocument();

        view.rerender(renderBoardTree(core, {
            playerID: '1',
            matchData: defaultMatchData.slice(0, 3),
        }));

        expect(screen.queryByTestId('betrayal-discovery-panel')).not.toBeInTheDocument();
        await waitFor(() => {
            expect(screen.queryByTestId('betrayal-recent-roll-panel')).not.toBeInTheDocument();
        });
        await waitFor(() => {
            expect(screen.getByTestId('betrayal-scenario-reader-dialog')).toBeInTheDocument();
        });
        expect(screen.getByTestId('betrayal-scenario-opening-stage')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-scenario-objective-page')).toHaveTextContent('剧本1');
        expect(screen.getByTestId('betrayal-scenario-objective-page')).not.toHaveTextContent('木乃伊横行');
        fireEvent.click(screen.getByTestId('betrayal-scenario-reader-close'));
        await waitFor(() => {
            expect(screen.queryByTestId('betrayal-scenario-reader-dialog')).not.toBeInTheDocument();
        });
        expect(screen.getByTestId('betrayal-open-scenario')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-open-scenario')).toHaveTextContent(/^剧本$/);
        expect(screen.getByTestId('betrayal-open-scenario')).not.toHaveTextContent(/查阅/);
        expect(screen.queryByTestId('betrayal-haunt-reveal-cue')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-haunt-reveal-status-strip')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-haunt-reveal-open-scenario')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-haunt-reveal-return-to-board')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-haunt-reveal-public-flow')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-haunt-setup-queue')).not.toBeInTheDocument();
        expect(screen.queryByText('治疗并强化叛徒')).not.toBeInTheDocument();
        expect(screen.queryByText('准备杰克标记')).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('betrayal-open-scenario'));
        expect(screen.getByTestId('betrayal-scenario-reader-dialog')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-scenario-objective-page')).toHaveTextContent('剧本1');
        expect(screen.getByTestId('betrayal-scenario-objective-page')).not.toHaveTextContent(/剧本1查阅/);
        expect(screen.getByTestId('betrayal-scenario-objective-page')).not.toHaveTextContent('木乃伊横行');
        fireEvent.click(screen.getByTestId('betrayal-scenario-reader-close'));

        await waitFor(() => {
            expect(screen.queryByTestId('betrayal-scenario-reader-dialog')).not.toBeInTheDocument();
        });
        expect(screen.queryByTestId('betrayal-haunt-reveal-cue')).not.toBeInTheDocument();
    });

    type MummyTraitorActionCard = BetrayalCore['currentExplorer']['inventory'][number];

    function createMummyTraitorActionBoardCore(options: {
        inventory?: MummyTraitorActionCard[];
        girlHolder?: 'room' | 'traitor' | 'mummy';
        carriedOmenIds?: string[];
    } = {}) {
        const core = activateBoardExplorer(createFirstScenarioHauntCore(), '2');
        const mummyRuntime = core.scenarioRuntime.mummy;
        if (!mummyRuntime) {
            throw new Error('木乃伊横行 Board 测试夹具缺少木乃伊运行态');
        }
        const traitorRoomId = core.currentExplorer.roomId;
        const girlHolder = options.girlHolder ?? 'room';
        const inventory = options.inventory ?? [{ id: 'holy-symbol', name: '圣符', kind: 'omen' as const }];
        core.scenarioRuntime.mummy = {
            ...mummyRuntime,
            sarcophagusRoomId: traitorRoomId,
            girlRoomId: girlHolder === 'room' ? traitorRoomId : null,
            girlHolderPlayerId: girlHolder === 'traitor' ? core.currentExplorer.playerId : null,
            girlHeldByMummy: girlHolder === 'mummy',
            mummyCarriedOmenIds: [...(options.carriedOmenIds ?? [])],
        };
        core.monsters = core.monsters.map((monster) => (
            monster.id === mummyRuntime.mummyMonsterId || monster.definitionId === 'mummy'
                ? { ...monster, roomId: traitorRoomId }
                : monster
        ));
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: traitorRoomId,
            inventory: inventory.map((card) => ({ ...card })),
        };
        core.activeRoomId = traitorRoomId;
        core.currentExplorerRoomId = traitorRoomId;
        core.currentExplorerInventory = core.currentExplorer.inventory.map((card) => ({ ...card }));
        core.turnStartInventoryCardIds = core.currentExplorer.inventory.map((card) => card.id);
        core.recommendedAction = 'use';
        const completedMonsterIds = core.monsters.map((monster) => monster.id);
        core.scenarioRuntime.monsterTurn = {
            ...core.scenarioRuntime.monsterTurn,
            resolvedStartMonsterIds: completedMonsterIds,
            skippedMonsterIdsThisTurn: completedMonsterIds,
            attackedMonsterIdsThisTurn: completedMonsterIds,
            movedMonsterIdsThisTurn: completedMonsterIds,
            movementRollsByGroupId: {},
            moveRemainingById: Object.fromEntries(
                completedMonsterIds.map((monsterId) => [monsterId, 0]),
            ),
        };
        dismissBlockingBoardOverlays(core);
        return { core, traitorRoomId };
    }

    function renderMummyTraitorActionBoard(core: BetrayalCore) {
        return render(
            <HarnessBoard
                initialCore={core}
                playerID="2"
                matchData={defaultMatchData.slice(0, 3)}
            />,
        );
    }

    it('木乃伊叛徒教程胜利前状态会在牌桌主动作显示拾起女孩', () => {
        const core = createMummyTraitorVictoryReadyTutorialCore();

        renderMummyTraitorActionBoard(core);

        expect(screen.getByTestId('betrayal-action-use')).toHaveTextContent('拾起女孩');
        expect(screen.queryByTestId('betrayal-action-monsterTurnStart')).not.toBeInTheDocument();
    });

    it('木乃伊横行叛徒可从牌桌主动作拾起女孩并交给木乃伊', async () => {
        const { core, traitorRoomId } = createMummyTraitorActionBoardCore();

        renderMummyTraitorActionBoard(core);

        const girlTokenId = `betrayal-room-haunt-token-${traitorRoomId}-mummy-girl-token`;
        const sarcophagusTokenId = `betrayal-room-haunt-token-${traitorRoomId}-mummy-sarcophagus`;
        expect(screen.getByTestId(sarcophagusTokenId)).toHaveTextContent('棺');
        expect(screen.getByTestId(girlTokenId)).toHaveAttribute('data-token-status', 'placed');
        expect(screen.getByTestId(girlTokenId)).toHaveAttribute('data-token-placement', 'room');
        expect(screen.getByTestId(girlTokenId)).toHaveAttribute('data-direct-target', 'true');
        expect(screen.getByTestId(girlTokenId)).toHaveAccessibleName('女孩，可拾取');
        expect(screen.getByTestId(`betrayal-girl-svg-token-${traitorRoomId}`)).toHaveAttribute(
            'data-token-asset',
            'betrayal/tokens/haunts/mummy-girl.svg',
        );
        expect(screen.getByTestId(`betrayal-girl-svg-token-${traitorRoomId}`)).toHaveAttribute(
            'data-token-visual-size',
            '54',
        );
        expect(screen.getByTestId('betrayal-action-use')).toHaveTextContent('拾起女孩');
        expect(screen.queryByTestId('betrayal-room-focus-target')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-action-use')).toHaveAttribute(
            'data-haunt-primary-action-kind',
            'use',
        );

        fireEvent.click(screen.getByTestId('betrayal-action-use'));

        await waitFor(() => {
            expect(screen.getByTestId(girlTokenId)).toHaveAttribute('data-token-status', 'held-by-player');
            expect(screen.getByTestId(girlTokenId)).toHaveAttribute('data-token-owner-player-id', '2');
            expect(screen.getByTestId(girlTokenId)).toHaveAttribute('data-token-placement', 'explorer');
            expect(screen.getByTestId(`betrayal-girl-svg-token-${traitorRoomId}`)).toHaveAttribute(
                'data-token-visual-size',
                '54',
            );
            expect(screen.getByTestId('betrayal-action-use')).toHaveTextContent('交出女孩');
            expect(screen.queryByTestId('betrayal-room-focus-target')).not.toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId('betrayal-action-use'));

        await waitFor(() => {
            expect(screen.getByTestId(girlTokenId)).toHaveAttribute('data-token-status', 'held-by-mummy');
            expect(screen.getByTestId(girlTokenId)).toHaveAttribute('data-token-placement', 'mummy');
            expect(screen.getByTestId(`betrayal-girl-svg-token-${traitorRoomId}`)).toHaveAttribute(
                'data-token-visual-size',
                '54',
            );
            expect(screen.getByTestId('betrayal-action-use')).toHaveTextContent('交出圣符');
        });

        fireEvent.click(screen.getByTestId('betrayal-action-use'));

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-endgame-screen')).toBeInTheDocument();
        });
    });

    it('木乃伊横行叛徒可从牌桌主动作把指环交给木乃伊', async () => {
        const { core } = createMummyTraitorActionBoardCore({
            inventory: [{ id: 'ring', name: '指环', kind: 'omen' }],
            girlHolder: 'mummy',
        });

        renderMummyTraitorActionBoard(core);

        expect(screen.getByTestId('betrayal-action-use')).toHaveTextContent('交出指环');

        fireEvent.click(screen.getByTestId('betrayal-action-use'));

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-endgame-screen')).toBeInTheDocument();
        });
    });

    it('木乃伊横行叛徒不会把非圣符或指环的牌交给木乃伊', () => {
        const { core } = createMummyTraitorActionBoardCore({
            inventory: [{ id: 'map', name: '地图', kind: 'item' }],
            girlHolder: 'mummy',
        });

        renderMummyTraitorActionBoard(core);

        const useAction = screen.queryByTestId('betrayal-action-use');
        if (useAction) {
            expect(useAction).not.toHaveTextContent(/交出/);
        }
        expect(screen.queryByText('交出地图')).not.toBeInTheDocument();
    });

    it('木乃伊横行叛徒已交过同一预兆后不会重复交给木乃伊', () => {
        const { core } = createMummyTraitorActionBoardCore({
            inventory: [{ id: 'ring', name: '指环', kind: 'omen' }],
            girlHolder: 'mummy',
            carriedOmenIds: ['ring'],
        });

        renderMummyTraitorActionBoard(core);

        const useAction = screen.queryByTestId('betrayal-action-use');
        if (useAction) {
            expect(useAction).not.toHaveTextContent('交出指环');
        }
    });

    function createMummyHeroActionBoardCore(stage: 'study-name' | 'learn-banishment' | 'banish') {
        let core = createFirstScenarioHauntCore();
        const traitorId = core.scenarioRuntime.traitorPlayerId;
        const heroId = core.playerIds.find((playerId) => playerId !== traitorId);
        if (!heroId) {
            throw new Error('木乃伊横行 Board 测试夹具缺少英雄玩家');
        }
        core = activateBoardExplorer(core, heroId);
        const mummyRuntime = core.scenarioRuntime.mummy;
        if (!mummyRuntime) {
            throw new Error('木乃伊横行 Board 测试夹具缺少木乃伊运行态');
        }
        const sarcophagusRoomId = mummyRuntime.sarcophagusRoomId;
        const book = { id: 'omen-book', name: '书本', kind: 'omen' as const };
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: sarcophagusRoomId,
            inventory: [
                ...core.currentExplorer.inventory.filter((card) => card.id !== book.id),
                book,
            ],
        };
        core.activeRoomId = sarcophagusRoomId;
        core.currentExplorerRoomId = sarcophagusRoomId;
        core.currentExplorerInventory = core.currentExplorer.inventory.map((card) => ({ ...card }));
        core.turnStartInventoryCardIds = core.currentExplorer.inventory.map((card) => card.id);
        core.usedCardIdsThisTurn = [];
        core.recommendedAction = 'use';
        core.recentRoll = null;
        core.scenarioRuntime.mummy = {
            ...mummyRuntime,
            girlRoomId: null,
            girlHolderPlayerId: null,
            girlHeldByMummy: false,
            knowledgeTokenCount: stage === 'study-name' ? 0 : stage === 'learn-banishment' ? 1 : 2,
            trueNameFound: stage !== 'study-name',
            banishmentSpellLearned: stage === 'banish',
        };
        core.monsters = core.monsters.map((monster) => (
            monster.id === mummyRuntime.mummyMonsterId || monster.definitionId === 'mummy'
                ? { ...monster, roomId: sarcophagusRoomId }
                : monster
        ));
        core = setBoardTraitTrack(core, heroId, 'knowledge', [4], 0, 0);
        core = setBoardTraitTrack(core, heroId, 'sanity', [6], 0, 0);
        return { core: dismissBlockingBoardOverlays(core), heroId };
    }

    it('木乃伊横行英雄线可从牌桌主动作寻找木乃伊真名', async () => {
        const { core, heroId } = createMummyHeroActionBoardCore('study-name');

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                playerID={heroId}
                matchData={defaultMatchData.slice(0, 3)}
                diceResults={[3, 3, 3, 3]}
            />,
        );

        expect(screen.getByTestId('betrayal-action-use')).toHaveTextContent('寻找木乃伊真名');
        expect(screen.getByTestId('betrayal-action-cue')).toHaveTextContent('点寻找真名');

        fireEvent.click(screen.getByTestId('betrayal-action-use'));

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-recent-roll-outcome')).toHaveTextContent('取得第 1 枚知识标记');
            expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('找到了木乃伊真名');
        });
    });

    it('木乃伊横行英雄线寻找真名失败后显示失败反馈', async () => {
        const { core, heroId } = createMummyHeroActionBoardCore('study-name');

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                playerID={heroId}
                matchData={defaultMatchData.slice(0, 3)}
                diceResults={[1, 1, 1, 1]}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-action-use'));

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-recent-roll-outcome')).toHaveTextContent('未取得知识标记');
            expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('寻找木乃伊真名失败');
        });
    });

    it('木乃伊横行英雄线可从牌桌主动作学习驱逐法术', async () => {
        const { core, heroId } = createMummyHeroActionBoardCore('learn-banishment');

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                playerID={heroId}
                matchData={defaultMatchData.slice(0, 3)}
                diceResults={[3, 3, 3, 3]}
            />,
        );

        expect(screen.getByTestId('betrayal-action-use')).toHaveTextContent('学习驱逐法术');
        expect(screen.getByTestId('betrayal-action-cue')).toHaveTextContent('点学习驱逐法术');

        fireEvent.click(screen.getByTestId('betrayal-action-use'));

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-recent-roll-outcome')).toHaveTextContent('取得第 2 枚知识标记');
            expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('学会驱逐木乃伊的法术');
        });
    });

    it('木乃伊横行英雄线学习驱逐法术失败后显示失败反馈', async () => {
        const { core, heroId } = createMummyHeroActionBoardCore('learn-banishment');

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                playerID={heroId}
                matchData={defaultMatchData.slice(0, 3)}
                diceResults={[1, 1, 1, 1]}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-action-use'));

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-recent-roll-outcome')).toHaveTextContent('未学会驱逐法术');
            expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('翻查书本失败');
        });
    });

    it('木乃伊横行英雄线可从牌桌主动作驱逐木乃伊并进入英雄终局', async () => {
        const { core, heroId } = createMummyHeroActionBoardCore('banish');

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                playerID={heroId}
                matchData={defaultMatchData.slice(0, 3)}
                diceResults={[3, 3, 3, 3, 3, 3, 1, 1, 1, 1, 1, 1]}
            />,
        );

        expect(screen.getByTestId('betrayal-action-use')).toHaveTextContent('驱逐木乃伊');
        expect(screen.getByTestId('betrayal-action-cue')).toHaveTextContent('点驱逐木乃伊');

        fireEvent.click(screen.getByTestId('betrayal-action-use'));

        if (screen.queryByTestId('betrayal-exorcise-roll-continue')) {
            fireEvent.click(screen.getByTestId('betrayal-exorcise-roll-continue'));
        }
        await waitFor(() => {
            expect(screen.getByTestId('betrayal-endgame-ending-narration')).toHaveTextContent('木乃伊犹如细砂随风飞散');
        });
    });

    it('木乃伊横行英雄线驱逐失败后显示失败反馈', async () => {
        const { core, heroId } = createMummyHeroActionBoardCore('banish');

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                playerID={heroId}
                matchData={defaultMatchData.slice(0, 3)}
                diceResults={[1, 1, 1, 1, 1, 1, 3, 3, 3, 3, 3, 3]}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-action-use'));

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-recent-roll-outcome')).toHaveTextContent('驱逐失败');
            expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('驱逐木乃伊失败');
        });
        expect(screen.queryByTestId('betrayal-endgame-ending-narration')).not.toBeInTheDocument();
    });

    it('木乃伊横行英雄线已用作祟动作后显示同回合禁用原因', () => {
        const cases: Array<{
            stage: 'study-name' | 'learn-banishment' | 'banish';
            actionId: string;
            label: string;
        }> = [
            { stage: 'study-name', actionId: 'study-mummy-name', label: '寻找木乃伊真名' },
            { stage: 'learn-banishment', actionId: 'learn-mummy-banishment', label: '学习驱逐法术' },
            { stage: 'banish', actionId: 'banish-mummy', label: '驱逐木乃伊' },
        ];

        for (const item of cases) {
            const { core, heroId } = createMummyHeroActionBoardCore(item.stage);
            core.usedCardIdsThisTurn = [item.actionId];
            core.recommendedAction = 'use';
            const view = renderBoard(core, {
                playerID: heroId,
                matchData: defaultMatchData.slice(0, 3),
            });

            const useAction = screen.getByTestId('betrayal-action-use');
            expect(useAction).toHaveTextContent(item.label);
            expect(useAction).toBeDisabled();
            expect(useAction).toHaveAttribute('data-action-disabled-reason', '本回合已使用该作祟特殊行动');
            expect(screen.getByTestId('betrayal-action-cue')).toHaveTextContent('本回合已使用该作祟特殊行动');

            view.unmount();
        }
    });

    function createMummyPendingRewardBoardCore() {
        const baseCore = createFirstScenarioHauntCore();
        const traitorId = baseCore.scenarioRuntime.traitorPlayerId!;
        const heroId = baseCore.playerIds.find((playerId) => playerId !== traitorId)!;
        const core = activateBoardExplorer(baseCore, traitorId);
        const mummyRuntime = core.scenarioRuntime.mummy;
        if (!mummyRuntime) {
            throw new Error('木乃伊横行 Board 测试夹具缺少木乃伊运行态');
        }
        core.otherExplorers = core.otherExplorers.map((explorer) => (
            explorer.playerId === heroId
                ? {
                    ...explorer,
                    inventory: [
                        { id: 'map', name: '地图', kind: 'item' },
                        { id: 'holy-symbol', name: '圣符', kind: 'omen' },
                    ],
                }
                : explorer
        ));
        core.scenarioRuntime.mummy = {
            ...mummyRuntime,
            pendingAttackReward: {
                id: 'mummy-attack-reward-test',
                controllerPlayerId: traitorId,
                monsterId: mummyRuntime.mummyMonsterId,
                monsterName: '木乃伊',
                defenderPlayerId: heroId,
                damageToHero: 3,
                defenderTraitsBeforeDamage: { ...core.otherExplorers.find((explorer) => explorer.playerId === heroId)!.traits },
                stealableCardIds: ['map', 'holy-symbol'],
            },
        };
        dismissBlockingBoardOverlays(core);
        return { core, traitorId, heroId };
    }

    it('木乃伊横行攻击奖励在牌桌上显示未决奖励选择', () => {
        const { core, traitorId } = createMummyPendingRewardBoardCore();
        const dispatch = vi.fn();

        renderBoardWithDispatch(core, dispatch, {
            playerID: traitorId,
            matchData: defaultMatchData.slice(0, 3),
        });

        expect(screen.getByTestId('betrayal-mummy-reward-banner')).toHaveTextContent('木乃伊攻击胜出');
        expect(screen.getByTestId('betrayal-mummy-reward-banner')).toHaveTextContent('测试玩家本会承受3点伤害；请选择造成伤害，或偷走一件物品/预兆代替。');
        const rewardActions = screen.getByTestId('betrayal-mummy-reward-actions');
        expect(within(rewardActions).getByTestId('betrayal-mummy-reward-damage')).toHaveTextContent('造成3伤害');
        expect(within(rewardActions).getByTestId('betrayal-mummy-reward-steal-map')).toHaveTextContent('偷走地图');
        expect(within(rewardActions).getByTestId('betrayal-mummy-reward-steal-holy-symbol')).toHaveTextContent('偷走圣符');

        fireEvent.click(within(rewardActions).getByTestId('betrayal-mummy-reward-steal-map'));

        expect(dispatch).toHaveBeenCalledWith(BETRAYAL_COMMANDS.RESOLVE_MUMMY_ATTACK_REWARD, {
            choice: 'steal',
            cardId: 'map',
        });
    });

    it('木乃伊横行攻击奖励偷取目标失效时显示提示并保留伤害选择', () => {
        const { core, traitorId, heroId } = createMummyPendingRewardBoardCore();

        core.otherExplorers = core.otherExplorers.map((explorer) => (
            explorer.playerId === heroId
                ? { ...explorer, inventory: [] }
                : explorer
        ));

        renderBoard(core, {
            playerID: traitorId,
            matchData: defaultMatchData.slice(0, 3),
        });

        expect(screen.getByTestId('betrayal-mummy-reward-banner')).toHaveTextContent('木乃伊攻击胜出');
        expect(screen.getByTestId('betrayal-mummy-reward-invalid-targets')).toHaveTextContent('2 个偷取目标已失效');
        const rewardActions = screen.getByTestId('betrayal-mummy-reward-actions');
        expect(within(rewardActions).getByTestId('betrayal-mummy-reward-damage')).toHaveTextContent('造成3伤害');
        expect(within(rewardActions).queryByTestId('betrayal-mummy-reward-steal-map')).not.toBeInTheDocument();
        expect(within(rewardActions).queryByTestId('betrayal-mummy-reward-steal-holy-symbol')).not.toBeInTheDocument();
    });

    it('木乃伊横行攻击奖励选择偷取后清空奖励并显示偷取反馈', async () => {
        const { core, traitorId } = createMummyPendingRewardBoardCore();

        render(
            <HarnessBoard
                initialCore={core}
                playerID={traitorId}
                matchData={defaultMatchData.slice(0, 3)}
            />,
        );

        const rewardActions = screen.getByTestId('betrayal-mummy-reward-actions');
        fireEvent.click(within(rewardActions).getByTestId('betrayal-mummy-reward-steal-map'));

        await waitFor(() => {
            expect(screen.queryByTestId('betrayal-mummy-reward-banner')).not.toBeInTheDocument();
        });
        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('夺走地图');
    });

    it('木乃伊横行攻击奖励选择伤害后在牌桌等待受伤方分配', async () => {
        const { core, traitorId, heroId } = createMummyPendingRewardBoardCore();

        render(
            <HarnessBoard
                initialCore={core}
                playerID={traitorId}
                matchData={defaultMatchData.slice(0, 3)}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-mummy-reward-damage'));

        await waitFor(() => {
            expect(screen.queryByTestId('betrayal-mummy-reward-banner')).not.toBeInTheDocument();
        });
        expect(screen.getByTestId('betrayal-damage-allocation-panel')).toHaveAttribute('data-player-id', heroId);
        expect(screen.getByTestId('betrayal-damage-allocation-source')).toHaveTextContent('木乃伊攻击');
        expect(screen.getByTestId('betrayal-damage-allocation-amount')).toHaveTextContent('3 点物理伤害');
        expect(screen.getByTestId('betrayal-damage-allocation-traits')).toHaveTextContent('力量');
        expect(screen.getByTestId('betrayal-damage-allocation-traits')).toHaveTextContent('速度');
        expect(screen.getByTestId('betrayal-damage-allocation-confirm')).toBeDisabled();
        expect(screen.getByTestId('betrayal-damage-allocation-confirm')).toHaveTextContent('等待');
    });

    it('木乃伊横行木乃伊移动骰为0时可从牌桌怪物动作槽瞬移到任意已发现房间', async () => {
        let core = createFirstScenarioHauntCore();
        const traitorId = core.scenarioRuntime.traitorPlayerId!;
        const mummyRuntime = core.scenarioRuntime.mummy!;
        const mummyMonsterId = mummyRuntime.mummyMonsterId;
        const girlRoomId = mummyRuntime.girlRoomId!;
        const mummyRoomId = core.monsters.find((monster) => monster.id === mummyMonsterId)?.roomId;
        const unrevealedRoomId = core.rooms.find((room) => room.state !== 'discovered')?.id;
        const quietRoomId = core.rooms.find((room) => (
            room.state === 'discovered'
            && room.id !== mummyRoomId
            && room.id !== girlRoomId
        ))?.id ?? girlRoomId;
        core = activateBoardExplorer(core, traitorId);
        core.otherExplorers = core.otherExplorers.map((explorer) => (
            explorer.playerId === traitorId
                ? explorer
                : { ...explorer, roomId: quietRoomId }
        ));
        core = dismissBlockingBoardOverlays(core);

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                playerID={traitorId}
                matchData={defaultMatchData.slice(0, 3)}
                diceResults={[1, 1, 1]}
            />,
        );

        expect(screen.getByTestId('betrayal-action-monsterTurnStart')).toHaveTextContent('木乃伊开回合');
        fireEvent.click(screen.getByTestId('betrayal-action-monsterTurnStart'));

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-action-monsterMovementRoll')).toHaveTextContent('木乃伊移动骰');
        });
        fireEvent.click(screen.getByTestId('betrayal-action-monsterMovementRoll'));

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('木乃伊移动');
            expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('可移动 0 间');
        });
        fireEvent.click(screen.getByTestId('betrayal-roll-continue'));

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-action-monsterMove')).toHaveTextContent('移动木乃伊');
        });
        fireEvent.click(screen.getByTestId('betrayal-action-monsterMove'));

        expect(screen.getByTestId(`betrayal-room-monster-${mummyRoomId}-${mummyMonsterId}`)).toHaveAttribute(
            'data-direct-target',
            'true',
        );
        expect(screen.getByTestId(`betrayal-room-monster-${mummyRoomId}-${mummyMonsterId}`)).toHaveAttribute(
            'data-token-asset',
            'betrayal/tokens/monsters/mummy.svg',
        );
        expect(screen.getByTestId(`betrayal-monster-board-token-surface-${mummyMonsterId}`)).toHaveAttribute(
            'data-token-surface-size',
            '42',
        );
        expect(screen.getByTestId(`betrayal-room-monster-move-target-${girlRoomId}`)).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-action-cue')).toHaveTextContent('只限已发现房间');
        expect(screen.getByTestId('betrayal-turn-hint')).toHaveTextContent('不能探索新房间');
        if (unrevealedRoomId) {
            expect(screen.queryByTestId(`betrayal-room-monster-move-target-${unrevealedRoomId}`)).not.toBeInTheDocument();
        }

        fireEvent.click(screen.getByTestId(`betrayal-room-${girlRoomId}`));

        await waitFor(() => {
            expect(screen.getByTestId(`betrayal-room-monster-${girlRoomId}-${mummyMonsterId}`)).toBeInTheDocument();
            expect(screen.getByTestId(`betrayal-room-haunt-token-${girlRoomId}-mummy-girl-token`)).toHaveAttribute(
                'data-token-status',
                'held-by-mummy',
            );
        });
    });

    it('木乃伊普通移动点完目标后仍保持连续移动选择态', () => {
        let core = createFirstScenarioHauntCore();
        const traitorId = core.scenarioRuntime.traitorPlayerId!;
        const mummyRuntime = core.scenarioRuntime.mummy!;
        const mummyMonsterId = mummyRuntime.mummyMonsterId;
        const mummyRoom = core.rooms.find((room) => (
            room.id === core.monsters.find((monster) => monster.id === mummyMonsterId)?.roomId
        ));
        if (!mummyRoom) {
            throw new Error('木乃伊连续移动测试夹具缺少木乃伊房间');
        }
        const quietRoomId = core.rooms.find((room) => (
            room.state === 'discovered'
            && room.id !== mummyRoom.id
            && room.id !== mummyRuntime.girlRoomId
        ))?.id ?? mummyRuntime.girlRoomId!;
        core = activateBoardExplorer(core, traitorId);
        core.otherExplorers = core.otherExplorers.map((explorer) => (
            explorer.playerId === traitorId
                ? explorer
                : { ...explorer, roomId: quietRoomId }
        ));
        core.scenarioRuntime.monsterTurn = {
            ...core.scenarioRuntime.monsterTurn,
            resolvedStartMonsterIds: [mummyMonsterId],
            movementRollsByGroupId: {
                '木乃伊:3': {
                    groupId: '木乃伊:3',
                    monsterName: '木乃伊',
                    monsterIds: [mummyMonsterId],
                    playerId: traitorId,
                    speed: 3,
                    diceCount: 3,
                    dice: [1, 1, 1],
                    total: 3,
                    moveAllowance: 3,
                    rollOnceForGroup: true,
                    minimumMoveAllowance: 0,
                },
            },
            moveRemainingById: {
                [mummyMonsterId]: 3,
            },
        };
        core = dismissBlockingBoardOverlays(core);

        const targetRoom = resolveBetrayalMonsterMoveTargetRooms(core, mummyMonsterId)
            .find((room) => room.floor === mummyRoom.floor)
            ?? resolveBetrayalMonsterMoveTargetRooms(core, mummyMonsterId)[0];
        expect(targetRoom).toBeDefined();

        const dispatch = vi.fn();
        renderBoardWithDispatch(core, dispatch, {
            playerID: traitorId,
            matchData: defaultMatchData.slice(0, 3),
        });

        fireEvent.click(screen.getByTestId('betrayal-action-monsterMove'));
        expect(screen.getByTestId('betrayal-action-monsterMove')).toHaveTextContent('取消移动');
        expect(screen.getByTestId(`betrayal-room-monster-move-target-${targetRoom!.id}`)).toBeInTheDocument();

        fireEvent.click(screen.getByTestId(`betrayal-room-${targetRoom!.id}`));

        expect(dispatch).toHaveBeenCalledWith(BETRAYAL_COMMANDS.MOVE_MONSTER_TO_ROOM, {
            monsterId: mummyMonsterId,
            roomId: targetRoom!.id,
        });
        expect(screen.getByTestId('betrayal-action-monsterMove')).toHaveTextContent('取消移动');
    });

    it('木乃伊横行木乃伊同房有英雄时必须先攻击再移动，并过滤叛徒和死亡英雄', async () => {
        let core = createFirstScenarioHauntCore();
        const traitorId = core.scenarioRuntime.traitorPlayerId!;
        const mummyRuntime = core.scenarioRuntime.mummy!;
        const mummyMonsterId = mummyRuntime.mummyMonsterId;
        const mummyRoomId = core.monsters.find((monster) => monster.id === mummyMonsterId)?.roomId;
        const [heroTarget, deadHero] = [core.currentExplorer, ...core.otherExplorers]
            .filter((explorer) => explorer.playerId !== traitorId);
        if (!heroTarget || !deadHero || !mummyRoomId) {
            throw new Error('木乃伊同房攻击测试夹具缺少英雄或木乃伊房间');
        }
        core = activateBoardExplorer(core, traitorId);
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: mummyRoomId,
        };
        core.otherExplorers = core.otherExplorers.map((explorer) => (
            explorer.playerId === heroTarget.playerId || explorer.playerId === deadHero.playerId
                ? { ...explorer, roomId: mummyRoomId }
                : explorer
        ));
        core.activeRoomId = mummyRoomId;
        core.currentExplorerRoomId = mummyRoomId;
        core.scenarioRuntime.deadExplorerPlayerIds = [deadHero.playerId];
        core = completeMonsterPreparationForAttackSlot(core, mummyMonsterId);
        core = dismissBlockingBoardOverlays(core);

        const monsterActionPanel = resolveBetrayalMonsterActionPanel(core);
        expect(monsterActionPanel.slots.find((slot) => slot.id === `move:${mummyMonsterId}`)).toMatchObject({
            enabled: false,
            reason: '木乃伊与英雄同房且尚未攻击，必须先攻击。',
        });
        expect(monsterActionPanel.slots.find((slot) => slot.id === `attack:${mummyMonsterId}`)).toMatchObject({
            enabled: true,
            command: BETRAYAL_COMMANDS.MONSTER_ATTACK_HERO,
        });

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                playerID={traitorId}
                matchData={defaultMatchData.slice(0, 3)}
                diceResults={[3, 3, 3, 3, 3, 3, 3, 3, 1, 1, 1, 1]}
            />,
        );

        expect(screen.queryByTestId('betrayal-action-monsterMove')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-action-monsterAttack')).toHaveTextContent('木乃伊攻击');

        fireEvent.click(screen.getByTestId('betrayal-action-monsterAttack'));

        await waitFor(() => {
            expect(screen.getByTestId(`betrayal-room-monster-${mummyRoomId}-${mummyMonsterId}`)).toHaveAttribute(
                'data-direct-target',
                'true',
            );
            expect(screen.queryByTestId(`betrayal-room-occupant-target-outline-${mummyRoomId}-${heroTarget.playerId}`)).not.toBeInTheDocument();
        });
        fireEvent.click(screen.getByTestId(`betrayal-room-monster-${mummyRoomId}-${mummyMonsterId}`));

        await waitFor(() => {
            expect(screen.getByTestId(`betrayal-room-monster-target-outline-${mummyRoomId}-${mummyMonsterId}`)).toHaveAttribute('data-highlight-role', 'source');
            expect(screen.getByTestId(`betrayal-room-monster-target-outline-${mummyRoomId}-${mummyMonsterId}`)).toHaveAttribute('data-highlight-color', 'red');
            expect(screen.getByTestId(`betrayal-room-monster-target-outline-${mummyRoomId}-${mummyMonsterId}`)).toHaveAttribute('data-entity-relation', 'enemy');
            expect(screen.getByTestId(`betrayal-room-occupant-${mummyRoomId}-${heroTarget.playerId}`)).toHaveAttribute('data-direct-target', 'true');
            expect(screen.getByTestId(`betrayal-room-occupant-target-outline-${mummyRoomId}-${heroTarget.playerId}`)).toHaveAttribute('data-highlight-shape', 'pentagon');
            expect(screen.queryByTestId(`betrayal-room-occupant-target-outline-${mummyRoomId}-${traitorId}`)).not.toBeInTheDocument();
            expect(screen.queryByTestId(`betrayal-room-occupant-target-outline-${mummyRoomId}-${deadHero.playerId}`)).not.toBeInTheDocument();
        });
        fireEvent.click(screen.getByTestId(`betrayal-room-occupant-${mummyRoomId}-${heroTarget.playerId}`));

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('木乃伊');
            expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('木乃伊攻击');
        });
    });

    it('木乃伊横行木乃伊攻击目标没有可偷对象时直接进入伤害分配', async () => {
        let core = createFirstScenarioHauntCore();
        const traitorId = core.scenarioRuntime.traitorPlayerId!;
        const mummyRuntime = core.scenarioRuntime.mummy!;
        const mummyMonsterId = mummyRuntime.mummyMonsterId;
        const mummyRoomId = core.monsters.find((monster) => monster.id === mummyMonsterId)?.roomId;
        const heroTarget = [core.currentExplorer, ...core.otherExplorers]
            .find((explorer) => explorer.playerId !== traitorId);
        if (!heroTarget || !mummyRoomId) {
            throw new Error('木乃伊无可偷对象测试夹具缺少英雄或木乃伊房间');
        }
        core = activateBoardExplorer(core, traitorId);
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: mummyRoomId,
        };
        core.otherExplorers = core.otherExplorers.map((explorer) => (
            explorer.playerId === heroTarget.playerId
                ? {
                    ...explorer,
                    roomId: mummyRoomId,
                    inventory: [],
                }
                : explorer
        ));
        core.activeRoomId = mummyRoomId;
        core.currentExplorerRoomId = mummyRoomId;
        core.scenarioRuntime.mummy = {
            ...mummyRuntime,
            girlHolderPlayerId: null,
            girlHeldByMummy: false,
        };
        core = setBoardTraitTrack(core, heroTarget.playerId, 'might', Array.from({ length: 16 }, () => 4), 14, 14);
        core = setBoardTraitTrack(core, heroTarget.playerId, 'speed', Array.from({ length: 16 }, () => 4), 14, 14);
        core = completeMonsterPreparationForAttackSlot(core, mummyMonsterId);
        core = dismissBlockingBoardOverlays(core);

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                playerID={traitorId}
                matchData={defaultMatchData.slice(0, 3)}
                diceResults={[2, 2, 2, 2, 1, 1, 1, 1, 1]}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-action-monsterAttack'));
        await waitFor(() => {
            expect(screen.getByTestId(`betrayal-room-monster-${mummyRoomId}-${mummyMonsterId}`)).toHaveAttribute(
                'data-direct-target',
                'true',
            );
        });
        fireEvent.click(screen.getByTestId(`betrayal-room-monster-${mummyRoomId}-${mummyMonsterId}`));
        await waitFor(() => {
            expect(screen.getByTestId(`betrayal-room-occupant-${mummyRoomId}-${heroTarget.playerId}`)).toHaveAttribute(
                'data-direct-target',
                'true',
            );
        });
        fireEvent.click(screen.getByTestId(`betrayal-room-occupant-${mummyRoomId}-${heroTarget.playerId}`));

        await waitFor(() => {
            expect(screen.queryByTestId('betrayal-mummy-reward-banner')).not.toBeInTheDocument();
            expect(screen.queryByTestId('betrayal-mummy-reward-actions')).not.toBeInTheDocument();
            expect(screen.getByTestId('betrayal-damage-allocation-panel')).toHaveAttribute(
                'data-player-id',
                heroTarget.playerId,
            );
        });
        expect(screen.getByTestId('betrayal-damage-allocation-source')).toHaveTextContent('攻击');
        expect(screen.getByTestId('betrayal-damage-allocation-amount')).toHaveTextContent('4 点物理伤害');
        expect(screen.getByTestId('betrayal-damage-allocation-traits')).toHaveTextContent('速度');
        expect(screen.getByTestId('betrayal-damage-allocation-traits')).toHaveTextContent('力量');
        expect(screen.getByTestId('betrayal-damage-allocation-confirm')).toBeDisabled();
        expect(screen.getByTestId('betrayal-damage-allocation-confirm')).toHaveTextContent('等待');
    });

    it('大宅饿了作祟只显示可关闭阶段横幅，并通过手动入口打开剧本书', async () => {
        const core = createHelpingHandsHauntOpeningBoardCore(['0', '1', '2', '3']);
        expect(core.phase).toBe('haunt');
        expect(core.scenarioRuntime.hauntCardNumber).toBe(12);
        expect(core.scenarioRuntime.traitorPlayerId).toBeNull();
        expect(core.scenarioRuntime.helpingHands).toBeTruthy();
        expect(core.latestDiscovery?.detail).toContain('剧本12');
        expect(core.recentRoll?.sourceTitle).toBe('大宅饿了');

        renderBoard(core, {
            playerID: '0',
            matchData: defaultMatchData,
        });

        await waitFor(() => {
            expect(screen.queryByTestId('betrayal-recent-roll-panel')).not.toBeInTheDocument();
        });

        expect(screen.queryByTestId('betrayal-scenario-reader-dialog')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-open-scenario')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-haunt-reveal-cue')).toHaveAttribute('data-haunt-setup-count', '4');
        expect(screen.getByTestId('betrayal-haunt-reveal-player-title')).toHaveTextContent('作祟开始');
        expect(screen.getByTestId('betrayal-haunt-reveal-lead')).toHaveTextContent('剧本已切换。');
        expect(screen.getByTestId('betrayal-haunt-reveal-close')).toHaveTextContent('关闭');
        expect(screen.queryByTestId('betrayal-haunt-reveal-status-strip')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-haunt-reveal-open-scenario')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-haunt-reveal-return-to-board')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-haunt-reveal-public-flow')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-haunt-reveal-step-traitor-intro')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-haunt-reveal-step-traitor-setup')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-haunt-setup-queue')).not.toBeInTheDocument();
        expect(screen.queryByText('找出奇异护符')).not.toBeInTheDocument();
        expect(screen.queryByText('放置 2 个巨魔手')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-action-use')).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('betrayal-open-scenario'));
        expect(screen.getByTestId('betrayal-scenario-reader-dialog')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-scenario-objective-page')).toHaveTextContent('剧本12');
        expect(screen.getByTestId('betrayal-scenario-objective-page')).not.toHaveTextContent(/剧本12查阅/);
        expect(screen.getByTestId('betrayal-scenario-reader-header-progress')).toHaveTextContent('1/2');
        expect(screen.getByTestId('betrayal-scenario-reader-footer-progress')).toHaveTextContent('1/2');
        expect(screen.getByTestId('betrayal-scenario-reader-prev-zone')).toBeDisabled();
        expect(screen.getByTestId('betrayal-scenario-reader-next-zone')).toBeEnabled();
        expect(screen.getByTestId('betrayal-scenario-reader-dialog')).not.toHaveTextContent('援手');
        expect(screen.getByTestId('betrayal-scenario-objective-page')).toHaveTextContent('自由混战目标');
        expect(screen.getByTestId('betrayal-scenario-objective-page')).toHaveTextContent('奇异护符');
        fireEvent.click(screen.getByTestId('betrayal-scenario-reader-close'));

        await waitFor(() => {
            expect(screen.queryByTestId('betrayal-scenario-reader-dialog')).not.toBeInTheDocument();
        });
        expect(screen.queryByTestId('betrayal-recent-roll-panel')).not.toBeInTheDocument();
        await waitFor(() => {
            expect(screen.queryByTestId('betrayal-haunt-reveal-cue')).not.toBeInTheDocument();
        });
        expect(screen.getByTestId('betrayal-action-use')).toBeInTheDocument();
    });

    it('大宅饿了力量攻击获胜后在牌桌显示伤害或偷牌选择', async () => {
        const core = createHelpingHandsPendingRewardBoardCore();

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData.slice(0, 3)}
            />,
        );

        const backdrop = screen.getByTestId('betrayal-roll-review-backdrop');
        expect(backdrop).toHaveAttribute('data-backdrop-dismiss', 'disabled');
        fireEvent.click(screen.getByTestId('betrayal-roll-continue'));

        const rewardBanner = screen.getByTestId('betrayal-helping-hands-reward-banner');
        expect(rewardBanner).toHaveAttribute('data-helping-hands-reward-state', 'choose');
        expect(rewardBanner).toHaveAttribute('data-prompt-placement', 'top');
        expect(rewardBanner).toHaveTextContent('伤害或偷牌');
        expect(screen.getByTestId('betrayal-helping-hands-reward-actions')).toHaveAttribute(
            'data-prompt-actions-for',
            'betrayal-helping-hands-reward-banner',
        );
        expect(screen.getByTestId('betrayal-helping-hands-reward-damage')).toHaveTextContent('造成');
        expect(screen.getByTestId('betrayal-helping-hands-reward-steal-first-aid-kit')).toHaveTextContent('偷走急救包');
        expect(screen.getByTestId('betrayal-action-use')).toBeDisabled();

        fireEvent.click(screen.getByTestId('betrayal-helping-hands-reward-steal-first-aid-kit'));

        await waitFor(() => {
            expect(screen.queryByTestId('betrayal-helping-hands-reward-banner')).not.toBeInTheDocument();
        });
        expect(screen.getByTestId('betrayal-inventory-first-aid-kit')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('偷走急救包');
    });

    it('大宅饿了选择造成伤害后在牌桌等待受伤方分配', async () => {
        const core = createHelpingHandsPendingRewardBoardCore();

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData.slice(0, 3)}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-roll-continue'));
        fireEvent.click(screen.getByTestId('betrayal-helping-hands-reward-damage'));

        await waitFor(() => {
            expect(screen.queryByTestId('betrayal-helping-hands-reward-banner')).not.toBeInTheDocument();
        });
        expect(screen.getByTestId('betrayal-damage-allocation-panel')).toHaveAttribute('data-player-id', '1');
        expect(screen.getByTestId('betrayal-damage-allocation-source')).toHaveTextContent('援手攻击');
        expect(screen.getByTestId('betrayal-damage-allocation-amount')).toHaveTextContent('4 点物理伤害');
        expect(screen.getByTestId('betrayal-damage-allocation-traits')).toHaveTextContent('力量');
        expect(screen.getByTestId('betrayal-damage-allocation-traits')).toHaveTextContent('速度');
        expect(screen.getByTestId('betrayal-damage-allocation-confirm')).toBeDisabled();
        expect(screen.getByTestId('betrayal-damage-allocation-confirm')).toHaveTextContent('等待');
    });

    it('大宅饿了巨魔手同房时在牌桌提供力量8合击入口', async () => {
        const core = createHelpingHandsTrollHandAttackBoardCore();
        const trollHandIds = core.scenarioRuntime.helpingHands?.trollHandIds ?? [];
        expect(trollHandIds).toHaveLength(2);

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                matchData={defaultMatchData.slice(0, 3)}
                diceResults={[2, 2, 2, 2, 2, 2, 2, 2, 1, 1]}
            />,
        );

        const trollBanner = screen.getByTestId('betrayal-helping-hands-troll-attack-banner');
        expect(trollBanner).toHaveTextContent('巨魔手');
        expect(trollBanner).toHaveAttribute('data-prompt-placement', 'top');
        expect(screen.getByTestId('betrayal-helping-hands-troll-target')).toHaveTextContent('队友一');
        expect(screen.getByTestId('betrayal-helping-hands-troll-attack-actions')).toHaveAttribute(
            'data-prompt-actions-for',
            'betrayal-helping-hands-troll-attack-banner',
        );
        expect(screen.getByTestId('betrayal-helping-hands-troll-combined')).toHaveTextContent('合击');
        expect(screen.getByTestId(`betrayal-helping-hands-troll-single-${trollHandIds[0]}`)).toHaveTextContent('第1只');
        expect(screen.getByTestId(`betrayal-helping-hands-troll-single-${trollHandIds[0]}`)).toHaveTextContent('攻击');
        expect(screen.getByTestId(`betrayal-helping-hands-troll-single-${trollHandIds[1]}`)).toHaveTextContent('第2只');
        expect(screen.getByTestId(`betrayal-helping-hands-troll-single-${trollHandIds[1]}`)).toHaveTextContent('攻击');
        expect(screen.getByTestId('betrayal-action-use')).toHaveTextContent('巨魔手合击');

        fireEvent.click(screen.getByTestId('betrayal-helping-hands-troll-combined'));

        await waitFor(() => {
            expect(screen.queryByTestId('betrayal-helping-hands-troll-combined')).not.toBeInTheDocument();
        });
        expect(screen.getByTestId('betrayal-damage-allocation-panel')).toHaveAttribute('data-player-id', '1');
        expect(screen.getByTestId('betrayal-damage-allocation-source')).toHaveTextContent('巨魔手攻击');
        expect(screen.getByTestId('betrayal-damage-allocation-amount')).toHaveTextContent('8 点物理伤害');
        expect(screen.getByTestId('betrayal-damage-allocation-traits')).toHaveTextContent('力量');
        expect(screen.getByTestId('betrayal-damage-allocation-traits')).toHaveTextContent('速度');
        expect(screen.getByTestId('betrayal-damage-allocation-confirm')).toBeDisabled();
        expect(screen.getByTestId('betrayal-damage-allocation-confirm')).toHaveTextContent('等待');
    });

    it('大宅饿了巨魔手怪物回合可在牌桌移动并明确结束', async () => {
        const core = createHelpingHandsTrollHandAttackBoardCore();
        const trollHandId = core.scenarioRuntime.helpingHands?.trollHandIds[0];
        expect(trollHandId).toBeDefined();
        const trollHand = core.monsters.find((monster) => monster.id === trollHandId);
        expect(trollHand).toBeDefined();
        const targetRoom = resolveHelpingHandsTrollHandMoveOptions(core, trollHandId!)
            .find((room) => room.floor === core.rooms.find((item) => item.id === trollHand!.roomId)?.floor);
        expect(targetRoom).toBeDefined();

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                matchData={defaultMatchData.slice(0, 3)}
                diceResults={[2, 2, 2, 2, 2, 2, 2, 2, 1, 1]}
            />,
        );

        expect(screen.getByTestId('betrayal-action-move')).toHaveTextContent('移动巨魔手');
        expect(screen.queryByTestId('betrayal-action-explore')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-action-endTurn')).toHaveTextContent('结束巨魔手回合');

        fireEvent.click(screen.getByTestId('betrayal-action-move'));

        expect(screen.getByTestId(`betrayal-room-monster-${trollHand!.roomId}-${trollHandId}`)).toHaveAttribute(
            'data-direct-target',
            'true',
        );
        expect(screen.getByTestId(`betrayal-room-helping-hands-troll-move-target-${targetRoom!.id}`)).toBeInTheDocument();

        fireEvent.click(screen.getByTestId(`betrayal-room-${targetRoom!.id}`));

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent(`移动到${targetRoom!.name}`);
        });

        fireEvent.click(screen.getByTestId('betrayal-action-endTurn'));

        await waitFor(() => {
            expect(screen.queryByTestId('betrayal-helping-hands-monster-turn-status')).not.toBeInTheDocument();
        });
        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('巨魔手怪物回合结束');
        expect(screen.getByTestId('betrayal-action-move')).toHaveTextContent('移动');
    });

    it('灰尘隐藏叛徒作祟揭示期读过剧本书后直接显示作祟后进度', async () => {
        let core = createDustHauntRevealBoardCore();
        core = placeCurrentExplorerInDustBoardRoom(core, {
            name: '画廊',
            visualId: 'gallery',
            discoveryReward: 'omen',
        });
        core = placeOtherExplorerInBoardRoom(core, '0', core.currentExplorer.roomId);
        core.scenarioRuntime.dust!.researchRoomIds = [];

        render(
            <HarnessBoard
                initialCore={core}
                playerID="1"
                matchData={defaultMatchData.slice(0, 3)}
            />,
        );

        expect(screen.getByTestId('betrayal-haunt-reveal-cue')).toHaveAttribute('data-haunt-type', 'hidden-traitor');
        const hiddenTraitorCue = screen.getByTestId('betrayal-haunt-reveal-cue');
        expect(screen.getByTestId('betrayal-haunt-reveal-player-title')).toHaveTextContent('作祟开始');
        expect(screen.getByTestId('betrayal-haunt-reveal-lead')).toHaveTextContent('剧本已切换。');
        expect(screen.getByTestId('betrayal-haunt-reveal-close')).toHaveTextContent('关闭');
        expect(screen.queryByTestId('betrayal-haunt-reveal-status-strip')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-haunt-reveal-resume-hint')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-haunt-reveal-open-scenario')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-haunt-reveal-return-to-board')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-haunt-reveal-step-card-public')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-haunt-reveal-public-flow')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-haunt-reveal-secret-boundary')).not.toBeInTheDocument();
        expect(hiddenTraitorCue).not.toHaveTextContent(/公开朗读|各自阅读|公开读|公开设置|秘密规则|目标|不要公开谁是叛徒|隐藏叛徒/);
        expectNoForbiddenPlayerUiInternalCopy(screen.getByTestId('betrayal-haunt-reveal-cue'));
        expect(screen.queryByTestId('betrayal-dust-progress-strip')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-action-use')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-action-trade')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-attack-weapon-selector')).not.toBeInTheDocument();
        expect(screen.queryByText('攻击灰尘')).not.toBeInTheDocument();
        expect(screen.queryByText('交换疾病')).not.toBeInTheDocument();
        expect(screen.queryByText('秘密分发疾病标记')).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('betrayal-open-scenario'));
        expect(screen.getByTestId('betrayal-scenario-reader-dialog')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-scenario-objective-page')).toHaveTextContent('剧本3');
        expect(screen.getByTestId('betrayal-scenario-objective-page')).not.toHaveTextContent(/剧本3查阅/);
        expect(screen.getByTestId('betrayal-scenario-objective-page')).toHaveTextContent('灰尘');
        fireEvent.click(screen.getByTestId('betrayal-scenario-reader-close'));
        await waitFor(() => {
            expect(screen.queryByTestId('betrayal-scenario-reader-dialog')).not.toBeInTheDocument();
        });

        await waitFor(() => {
            expect(screen.queryByTestId('betrayal-haunt-reveal-cue')).not.toBeInTheDocument();
        });
        const progressStrip = screen.getByTestId('betrayal-dust-progress-strip');
        expect(progressStrip).toHaveTextContent('剧本3');
        expect(progressStrip).not.toHaveTextContent(/查阅/);
        expect(progressStrip).toHaveTextContent('灰尘');
        expect(progressStrip).toHaveTextContent('研究');
        expect(progressStrip).toHaveTextContent('疾病标记');
        expect(progressStrip).toHaveTextContent('交换疾病');
        expect(screen.getByTestId('betrayal-action-use')).toHaveTextContent('寻找解药');
    });

    it('灰尘作祟关闭剧本后牌桌保留研究、疾病和交换短进度', () => {
        let core = createDustHauntBoardCore();
        core = placeCurrentExplorerInDustBoardRoom(core, {
            name: '画廊',
            visualId: 'gallery',
            discoveryReward: 'omen',
        });
        core = placeOtherExplorerInBoardRoom(core, '0', core.currentExplorer.roomId);
        core.scenarioRuntime.dust!.researchRoomIds = [];

        renderBoard(core, {
            playerID: '1',
            matchData: defaultMatchData.slice(0, 3),
        });

        const progressStrip = screen.getByTestId('betrayal-dust-progress-strip');
        expect(progressStrip).toHaveAttribute('data-prompt-placement', 'top');
        expect(progressStrip).toHaveTextContent('剧本3');
        expect(progressStrip).not.toHaveTextContent(/查阅/);
        expect(progressStrip).toHaveTextContent('灰尘');
        expect(progressStrip).toHaveTextContent('研究');
        expect(progressStrip).toHaveTextContent('0处');
        expect(progressStrip).toHaveTextContent('疾病标记');
        expect(progressStrip).toHaveTextContent('3枚');
        expect(progressStrip).toHaveTextContent('交换疾病');
        expect(progressStrip).toHaveTextContent('可用');
        expect(screen.getByTestId('betrayal-action-use')).toHaveTextContent('寻找解药');
    });

    it('灰尘 setup 不在牌桌右栏常驻显示', () => {
        const core = createDustHauntBoardCore();

        render(
            <HarnessBoard
                initialCore={core}
                playerID="1"
                matchData={defaultMatchData.slice(0, 3)}
            />,
        );

        expect(screen.queryByTestId('betrayal-haunt-setup-handoff')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-haunt-setup-confirm-monster-card-left-of-revealer')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-haunt-setup-confirm-prepare-research-tokens')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-dust-progress-strip')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-open-scenario')).toBeInTheDocument();
    });

    it('灰尘疾病编号只在本人玩家视图显示且不公开永久感染名单', () => {
        const core = createDustHauntBoardCore(['0', '1', '2']);
        core.scenarioRuntime.dust!.sicknessTokensByPlayerId = {
            '0': [
                { id: 'sickness-0-a', value: 1 },
                { id: 'sickness-0-b', value: 4 },
                { id: 'sickness-0-c', value: 8 },
            ],
            '1': [
                { id: 'sickness-1-a', value: 2 },
                { id: 'sickness-1-b', value: 3 },
                { id: 'sickness-1-c', value: 5 },
            ],
            '2': [
                { id: 'sickness-2-a', value: 6 },
                { id: 'sickness-2-b', value: 7 },
                { id: 'sickness-2-c', value: 9 },
            ],
        };
        core.scenarioRuntime.dust!.permanentTraitorPlayerIds = ['0'];

        const player0Render = renderBoard(core, {
            playerID: '0',
            matchData: defaultMatchData.slice(0, 3),
        });
        expect(screen.getByTestId('betrayal-dust-progress-item-own-sickness')).toHaveTextContent('你的疾病');
        expect(screen.getByTestId('betrayal-dust-progress-item-own-sickness')).toHaveTextContent('1 / 4 / 8');
        expect(screen.getByTestId('betrayal-dust-progress-item-permanent-infection')).toHaveTextContent('永久感染');
        expect(screen.getByTestId('betrayal-dust-progress-item-permanent-infection')).toHaveTextContent('是');
        expect(screen.getByTestId('betrayal-board')).not.toHaveTextContent('2 / 3 / 5');
        player0Render.unmount();

        renderBoard(core, {
            playerID: '1',
            matchData: defaultMatchData.slice(0, 3),
        });
        expect(screen.getByTestId('betrayal-dust-progress-item-own-sickness')).toHaveTextContent('你的疾病');
        expect(screen.getByTestId('betrayal-dust-progress-item-own-sickness')).toHaveTextContent('2 / 3 / 5');
        expect(screen.getByTestId('betrayal-dust-progress-item-permanent-infection')).toHaveTextContent('永久感染');
        expect(screen.getByTestId('betrayal-dust-progress-item-permanent-infection')).toHaveTextContent('否');
        expect(screen.getByTestId('betrayal-board')).not.toHaveTextContent('1 / 4 / 8');
    });

    it('第一剧本真实图书馆不在 upper-west 时也能显示调查杰克入口', async () => {
        const core = createCrimsonJackHauntCore();
        const actor = {
            ...core.currentExplorer,
            roomId: 'upper-north',
        };
        core.currentExplorer = actor;
        core.currentExplorerTraits = { ...actor.traits };
        core.currentExplorerInventory = [...actor.inventory];
        core.activeRoomId = 'upper-north';
        core.recommendedAction = 'use';
        core.rooms = core.rooms.map((room) => {
            if (room.id === 'upper-west') {
                return {
                    ...room,
                    name: '书房',
                    visualId: 'study',
                    tags: ['知识', '调查'],
                };
            }
            if (room.id === 'upper-north') {
                return {
                    ...room,
                    name: '图书馆',
                    state: 'discovered',
                    discoveryReward: null,
                    visualId: 'library',
                    tags: ['知识', '调查', '图书馆'],
                };
            }
            return room;
        });
        dismissBlockingBoardOverlays(core);

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        expect(screen.getByTestId('betrayal-action-use')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-action-use')).toHaveTextContent('调查杰克');
        fireEvent.click(screen.getByTestId('betrayal-action-use'));

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('图书馆');
            expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('Crimson Jack');
        });
    });

    it('第一剧本已掌握线索的英雄仍可在图书馆帮队友调查杰克', async () => {
        const core = createCrimsonJackHauntCore();
        const actor = {
            ...core.currentExplorer,
            roomId: 'upper-west',
        };
        core.currentExplorer = actor;
        core.currentExplorerTraits = { ...actor.traits };
        core.currentExplorerInventory = [...actor.inventory];
        const teammateName = core.otherExplorers.find((explorer) => explorer.playerId === '1')!.displayName;
        core.activeRoomId = 'upper-west';
        core.currentExplorerRoomId = 'upper-west';
        core.recommendedAction = 'use';
        core.scenarioRuntime.knowledgeOfJackPlayerIds = ['0'];
        dismissBlockingBoardOverlays(core);

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        expect(screen.getByTestId('betrayal-action-use')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-action-use')).toHaveTextContent('调查杰克');
        fireEvent.click(screen.getByTestId('betrayal-action-use'));

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('Crimson Jack');
            expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent(teammateName);
            expect(screen.getByTestId('betrayal-bottom-teammate-knowledge-1')).toHaveTextContent('掌握杰克线索');
        });
    });

    it('第一剧本杰克之灵同房时没有法阵也会从页面入口尝试驱魔', async () => {
        const core = createCrimsonJackHauntCore();
        const actor = {
            ...core.currentExplorer,
            roomId: 'upper-north',
            traits: {
                ...core.currentExplorer.traits,
                sanity: 1,
            },
        };
        core.currentExplorer = actor;
        core.currentExplorerTraits = { ...actor.traits };
        core.currentExplorerInventory = [...actor.inventory];
        core.activeRoomId = 'upper-north';
        core.currentExplorerRoomId = 'upper-north';
        core.recommendedAction = 'use';
        core.scenarioRuntime.exorcismCircleRoomIds = [];
        core.scenarioRuntime.jackSpiritReleased = true;
        core.scenarioRuntime.jackSpiritRoomId = 'upper-north';
        core.monsters = [{
            id: 'jack-spirit',
            name: '杰克之灵',
            portraitAsset: 'betrayal/monsters/spirit',
            tokenAsset: 'betrayal/tokens/monsters/jacks-spirit',
            roomId: 'upper-north',
            might: 5,
            speed: 3,
            sanity: 4,
            knowledge: 4,
            damage: 1,
        }];
        dismissBlockingBoardOverlays(core);

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        expect(screen.getByTestId('betrayal-action-use')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-action-use')).toHaveTextContent('驱散杰克之灵');
        fireEvent.click(screen.getByTestId('betrayal-action-use'));

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('驱魔');
            expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('反扑');
        });
    });

    it('真实 reducer 驱动下可以使用物品并进入移动选目标', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.currentExplorer = {
            ...core.currentExplorer,
            inventory: [{ id: 'omen-book', name: '书本', kind: 'omen' }],
        };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['omen-book'];

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        expect(screen.getByTestId('betrayal-mobile-selected-card')).toHaveTextContent('未选卡牌');
        expect(screen.getByTestId('betrayal-action-use')).toBeDisabled();
        fireEvent.click(screen.getByTestId('betrayal-inventory-omen-book'));
        expect(screen.getByTestId('betrayal-mobile-selected-card')).toHaveTextContent('书本');
        expect(screen.getByTestId('betrayal-inventory-omen-book-shell')).toHaveAttribute('data-selected-outline', 'true');
        expect(screen.getByTestId('betrayal-inventory-omen-book-selected-outline')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-inventory-omen-book-selected-outline')).toHaveAttribute('data-highlight-shape', 'card');
        expect(screen.getByTestId('betrayal-action-use')).not.toBeDisabled();

        fireEvent.click(screen.getByTestId('betrayal-action-use'));
        const usedUseButton = screen.getByTestId('betrayal-action-use');
        expect(usedUseButton).toBeDisabled();
        expect(screen.getByTestId('betrayal-use-status')).toHaveTextContent('本回合已用');
        expect(screen.getByTestId('betrayal-mobile-use-status')).toHaveTextContent('本回合已用');
        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('书本');
        fireEvent.click(screen.getByTestId('betrayal-inventory-omen-book'));
        expect(screen.getByTestId('betrayal-action-use')).toBeDisabled();
        expect(screen.getByTestId('betrayal-action-use')).toHaveAttribute('data-action-disabled-reason', '本回合已用');

        fireEvent.click(screen.getByTestId('betrayal-action-move'));
        fireEvent.click(screen.getByTestId('betrayal-room-floor-up'));
        expect(screen.getByTestId('betrayal-room-upper-landing')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-action-cue')).toHaveTextContent('现在：点绿色房间');

        fireEvent.click(screen.getByTestId('betrayal-room-upper-landing'));
        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('移动到上层起始点');
    });

    it('持有区卡牌本体只负责选择，独立放大镜负责打开大图', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.currentExplorer = {
            ...core.currentExplorer,
            inventory: [{ id: 'rope', name: '兔脚', kind: 'item' }],
        };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['rope'];

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-inventory-rope'));
        expect(screen.getByTestId('betrayal-inventory-rope')).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByTestId('betrayal-inventory-preview-overlay')).not.toBeVisible();

        fireEvent.click(screen.getByTestId('betrayal-inventory-rope-magnify'));
        expect(screen.getByTestId('betrayal-inventory-preview-overlay')).toBeVisible();
        expect(screen.getByTestId('betrayal-inventory-preview-overlay')).toHaveAttribute('data-backdrop-dismiss', 'disabled');
        expect(screen.getByTestId('betrayal-inventory-preview-card')).toHaveTextContent('兔脚');
        fireEvent.click(screen.getByTestId('betrayal-inventory-preview-overlay'));
        expect(screen.getByTestId('betrayal-inventory-preview-overlay')).toBeVisible();
        fireEvent.click(screen.getByTestId('betrayal-inventory-preview-overlay-close'));
        expect(screen.getByTestId('betrayal-inventory-preview-overlay')).not.toBeVisible();
    });

    it('被动持有物选中后保留使用按钮禁用原因', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.currentExplorer = {
            ...core.currentExplorer,
            inventory: [{ id: 'armor', name: '盔甲', kind: 'omen' }],
        };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['armor'];

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-inventory-armor'));
        const useButton = screen.getByTestId('betrayal-action-use');
        expect(useButton).toBeDisabled();
        expect(useButton).toHaveAttribute('data-action-disabled-reason', '被动效果，不能主动使用');
        expect(screen.getByTestId('betrayal-mobile-use-status')).toHaveTextContent('被动效果，不能主动使用');
    });

    it('本回合新获得的持有物选中后显示下回合可用原因', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.currentExplorer = {
            ...core.currentExplorer,
            inventory: [{ id: 'holy-water', name: '奇怪的药品', kind: 'item' }],
        };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = [];
        core.usedCardIdsThisTurn = [];

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-inventory-holy-water'));
        const useButton = screen.getByTestId('betrayal-action-use');
        expect(useButton).toBeDisabled();
        expect(useButton).toHaveAttribute('data-action-disabled-reason', '本回合新获得，下回合可用');
        expect(screen.getByTestId('betrayal-mobile-use-status')).toHaveTextContent('本回合新获得，下回合可用');
        expect(screen.getByTestId('betrayal-inventory-holy-water-shell').parentElement).toHaveTextContent('下回合');
    });

    it('教程起手持有物不会误显示为下回合才可用', () => {
        const core = createStartedFirstScenarioTutorialCore(['0', '1', '2']);

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        expect(screen.queryByTestId('betrayal-inventory-medical-kit')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-inventory-rope')).not.toHaveTextContent('下回合');
        expect(screen.getByTestId('betrayal-inventory-omen-book')).not.toHaveTextContent('下回合');
    });

    it('书本在神志临界时会在真实页面禁用并提示无法支付成本', () => {
        let core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.currentExplorer = {
            ...core.currentExplorer,
            inventory: [{ id: 'omen-book', name: '书本', kind: 'omen' }],
        };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['omen-book'];
        core.usedCardIdsThisTurn = [];
        core = setBoardTraitTrack(core, '0', 'sanity', [1, 2, 3], 0, 1);

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-inventory-omen-book'));
        const useButton = screen.getByTestId('betrayal-action-use');
        expect(useButton).toBeDisabled();
        expect(useButton).toHaveAttribute('data-action-disabled-reason', '神志不足，不能支付书本的 1 点神志。');
        expect(screen.getByTestId('betrayal-mobile-use-status')).toHaveTextContent('神志不足，不能支付书本的 1 点神志。');
    });

    it.each([
        ['map', '地图'],
        ['notebook', '笔记本'],
        ['journal', '日记'],
        ['manuscript', '手稿'],
    ] as const)('%s 会在真实页面选择已发现板块并放置当前探索者', (cardId, cardName) => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'entrance-hall',
            inventory: [{ id: cardId, name: cardName, kind: 'item' }],
        };
        core.activeRoomId = 'entrance-hall';
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = [cardId];

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        fireEvent.click(screen.getByTestId(`betrayal-inventory-${cardId}`));
        expect(screen.getByTestId('betrayal-selected-inventory-card-name')).toHaveTextContent(cardName);
        expect(screen.getByTestId('betrayal-inventory-target-room-selector')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-room-floor-up')).toBeEnabled();
        fireEvent.click(screen.getByTestId('betrayal-room-floor-up'));
        expect(screen.getByTestId('betrayal-room-inventory-target-card-highlight-upper-landing')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('betrayal-room-upper-landing'));
        fireEvent.click(screen.getByTestId('betrayal-action-use'));

        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent(`埋葬${cardName}`);
        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('上层起始点');
        expect(screen.getByTestId('betrayal-room-occupant-upper-landing-0')).toBeInTheDocument();
    });

    it('急救包会在真实页面选择同板块队友并治疗目标', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'entrance-hall',
            inventory: [{ id: 'medical-kit', name: '急救包', kind: 'item' }],
        };
        core.otherExplorers = core.otherExplorers.map((explorer) => (
            explorer.playerId === '1'
                ? (() => {
                    const mightTrack = explorer.traitTracks.might;
                    const speedTrack = explorer.traitTracks.speed;
                    const mightPosition = Math.max(mightTrack.criticalPosition, mightTrack.startPosition - 1);
                    const speedPosition = Math.max(speedTrack.criticalPosition, speedTrack.startPosition - 1);
                    return {
                        ...explorer,
                        roomId: 'entrance-hall',
                        traits: {
                            ...explorer.traits,
                            might: mightTrack.values[mightPosition] ?? explorer.traits.might,
                            speed: speedTrack.values[speedPosition] ?? explorer.traits.speed,
                        },
                        traitTracks: {
                            ...explorer.traitTracks,
                            might: { ...mightTrack, position: mightPosition },
                            speed: { ...speedTrack, position: speedPosition },
                        },
                    };
                })()
                : explorer
        ));
        core.activeRoomId = 'entrance-hall';
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['medical-kit'];
        const medicalKitTargetName = core.otherExplorers.find((explorer) => explorer.playerId === '1')!.displayName;

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-inventory-medical-kit'));
        expect(screen.getByTestId('betrayal-inventory-target-player-selector')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-room-occupant-target-outline-entrance-hall-1')).toHaveAttribute('data-highlight-shape', 'pentagon');
        expect(screen.getByTestId('betrayal-room-occupant-target-outline-entrance-hall-1')).toHaveAttribute('data-highlight-color', 'green');
        expect(screen.getByTestId('betrayal-room-occupant-target-outline-entrance-hall-1')).toHaveAttribute('data-highlight-layer-count', '1');
        expect(screen.getByTestId('betrayal-room-occupant-target-outline-entrance-hall-1')).toHaveAttribute('data-highlight-style', 'solid');
        expect(screen.getByTestId('betrayal-room-occupant-target-outline-entrance-hall-1')).toHaveAttribute('data-selected', 'false');
        fireEvent.click(screen.getByTestId('betrayal-room-occupant-entrance-hall-1'));
        expect(screen.getByTestId('betrayal-room-occupant-target-outline-entrance-hall-1')).toHaveAttribute('data-selected', 'true');
        const healPreview = screen.getByTestId('betrayal-inventory-heal-preview');
        expect(healPreview).toHaveAttribute('data-player-id', '1');
        expect(screen.getByTestId('betrayal-inventory-heal-preview-might')).toHaveAttribute('data-trait-preview-mode', 'heal');
        expect(screen.getByTestId('betrayal-inventory-heal-preview-might')).toHaveAttribute('data-trait-preview-step-count', '1');
        expect(screen.getByTestId('betrayal-inventory-heal-preview-might')).toHaveAttribute(
            'data-trait-preview-target-position',
            String(core.otherExplorers.find((explorer) => explorer.playerId === '1')!.traitTracks.might.startPosition),
        );
        fireEvent.click(screen.getByTestId('betrayal-action-use'));

        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('埋葬急救包');
        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent(`治疗${medicalKitTargetName}的力量和速度和知识和神志`);
        expect(screen.queryByTestId('betrayal-visible-feedback')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-room-occupant-feedback-entrance-hall-1')).toHaveTextContent(/治疗\s*\+4$/);
        expect(screen.getByTestId('betrayal-room-occupant-feedback-entrance-hall-1')).not.toHaveTextContent('力量 / 速度 / 知识 / 神志');
        expect(screen.getByTestId('betrayal-room-occupant-feedback-entrance-hall-1')).toHaveAttribute('data-feedback-style', 'floating-text');
        expect(screen.getByTestId('betrayal-room-occupant-feedback-entrance-hall-1')).toHaveAttribute('data-feedback-anchor', 'target-token');
        expect(screen.queryByTestId('betrayal-inventory-medical-kit')).not.toBeInTheDocument();
    });

    it('骨制钥匙会在真实页面移动模式显示穿墙目标并传入领域命令', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'upper-landing',
            inventory: [{ id: 'lockpick-tool', name: '骨制钥匙', kind: 'item' }],
        };
        core.activeRoomId = 'upper-landing';
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['lockpick-tool'];
        core.movesRemaining = 2;
        core.rooms = core.rooms.map((room) => {
            if (room.id === 'upper-landing') {
                return {
                    ...room,
                    doorways: room.doorways.filter((doorway) => doorway.connectsToRoomId !== 'upper-west'),
                };
            }
            if (room.id === 'upper-west') {
                return {
                    ...room,
                    name: '图书馆',
                    state: 'discovered',
                    hint: '已发现的相邻上层房间',
                    tags: ['知识', '调查', '图书馆'],
                    discoveryReward: 'event',
                    visualId: 'library',
                    doorways: room.doorways.filter((doorway) => doorway.connectsToRoomId !== 'upper-landing'),
                };
            }
            return room;
        });

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-action-move'));
        expect(screen.getByTestId('betrayal-room-upper-west')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('betrayal-room-upper-west'));
        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('使用骨制钥匙穿过墙壁');
        expect(screen.getByTestId('betrayal-action-move')).toHaveTextContent('移动');
        expect(screen.getByTestId('betrayal-action-move')).not.toHaveTextContent('取消移动');
    });

    it('面具会在真实页面给同板块队友和怪物分别选择相邻板块', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        const teammate = core.otherExplorers.find((explorer) => explorer.playerId === '1')!;
        const traitor = core.otherExplorers.find((explorer) => explorer.playerId === '2')!;
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'upper-landing',
            inventory: [{ id: 'mask', name: '面具', kind: 'omen' }],
        };
        core.otherExplorers = [
            { ...teammate, roomId: 'upper-landing' },
            { ...traitor, roomId: 'entrance-hall' },
        ];
        core.monsters = [
            {
                id: 'mask-test-monster',
                name: '杰克之灵',
                portraitAsset: '/assets/games/betrayal/jack-spirit.png',
                roomId: 'upper-landing',
                might: 5,
                speed: 3,
                damage: 0,
            },
        ];
        core.activeRoomId = 'upper-landing';
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['mask'];
        core.movesRemaining = 2;
        core.rooms = core.rooms.map((room) => {
            if (room.id === 'upper-landing') {
                return {
                    ...room,
                    doorways: [
                        ...room.doorways.filter((doorway) => doorway.connectsToRoomId !== 'upper-west'),
                        {
                            edge: 'left' as const,
                            connectsToRoomId: 'upper-west',
                            connectsToEdge: 'right' as const,
                        },
                    ],
                };
            }
            if (room.id === 'upper-west') {
                return {
                    ...room,
                    name: '图书馆',
                    state: 'discovered',
                    hint: '已发现的相邻上层房间',
                    tags: ['知识', '调查', '图书馆'],
                    discoveryReward: 'event',
                    visualId: 'library',
                    doorways: [
                        ...room.doorways.filter((doorway) => doorway.connectsToRoomId !== 'upper-landing'),
                        {
                            edge: 'right' as const,
                            connectsToRoomId: 'upper-landing',
                            connectsToEdge: 'left' as const,
                        },
                    ],
                };
            }
            return room;
        });

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-inventory-mask'));
        expect(screen.getByTestId('betrayal-mask-target-selector')).toBeInTheDocument();

        expect(screen.getByTestId('betrayal-room-floor-down')).toBeEnabled();
        fireEvent.click(screen.getByTestId('betrayal-room-floor-down'));
        expect(screen.getByTestId('betrayal-room-mask-target-card-highlight-grand-staircase')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('betrayal-room-grand-staircase'));
        fireEvent.click(screen.getByTestId('betrayal-room-floor-up'));
        expect(screen.getByTestId('betrayal-room-monster-upper-landing-mask-test-monster')).toHaveAttribute('data-direct-target', 'true');
        expect(screen.getByTestId('betrayal-room-monster-target-outline-upper-landing-mask-test-monster')).toHaveAttribute('data-highlight-shape', 'token');
        fireEvent.click(screen.getByTestId('betrayal-room-monster-upper-landing-mask-test-monster'));
        fireEvent.click(screen.getByTestId('betrayal-room-upper-west'));
        fireEvent.click(screen.getByTestId('betrayal-action-use'));

        fireEvent.click(screen.getByTestId('betrayal-room-floor-down'));
        expect(screen.getByTestId('betrayal-room-occupant-grand-staircase-1')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('betrayal-room-floor-up'));
        expect(screen.getByTestId('betrayal-room-monster-upper-west-mask-test-monster')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('面具');
        expect(screen.queryByTestId('betrayal-selected-inventory-card-name')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-mask-target-selector')).not.toBeInTheDocument();
    });

    it('狗会在真实页面选择 4 格内目标并交易多张牌', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        const teammate = core.otherExplorers.find((explorer) => explorer.playerId === '1')!;
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'entrance-hall',
            inventory: [
                { id: 'dog', name: '狗', kind: 'omen' },
                { id: 'medical-kit', name: '急救包', kind: 'item' },
                { id: 'map', name: '地图', kind: 'item' },
            ],
        };
        core.otherExplorers = [
            { ...teammate, roomId: 'upper-landing', inventory: [] },
        ];
        core.activeRoomId = 'entrance-hall';
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['dog', 'medical-kit', 'map'];
        core.recommendedAction = 'trade';
        dismissBlockingBoardOverlays(core);

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        expect(screen.getByTestId('betrayal-dog-trade-selector')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('betrayal-dog-trade-card-medical-kit'));
        fireEvent.click(screen.getByTestId('betrayal-dog-trade-card-map'));
        fireEvent.click(screen.getByTestId('betrayal-room-floor-up'));
        expect(screen.getByTestId('betrayal-room-occupant-target-outline-upper-landing-1')).toHaveAttribute('data-highlight-shape', 'pentagon');
        fireEvent.click(screen.getByTestId('betrayal-room-occupant-upper-landing-1'));
        const tradeRequestButton = screen.getByTestId('betrayal-action-trade');
        expectEventRollConfirmButtonStyle(tradeRequestButton);
        fireEvent.click(tradeRequestButton);

        expect(screen.getByTestId('betrayal-trade-flow-banner')).toHaveAttribute('data-trade-agreement-state', 'waiting');
        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('同意用狗交易');
        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('给出急救包、地图');
        expect(screen.getByTestId('betrayal-room-latest-feedback')).not.toHaveTextContent('不换回');
        expect(screen.getByTestId('betrayal-room-latest-feedback')).not.toHaveTextContent('换回');
    });

    it('狗交易结算预兆后预兆状态继续按全员预兆总数刷新', async () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        const teammate = core.otherExplorers.find((explorer) => explorer.playerId === '1')!;
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'entrance-hall',
            inventory: [
                { id: 'dog', name: '狗', kind: 'omen' },
                { id: 'omen-book', name: '书本', kind: 'omen' },
            ],
        };
        core.otherExplorers = [
            { ...teammate, roomId: 'upper-landing', inventory: [] },
        ];
        core.activeRoomId = 'entrance-hall';
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['dog', 'omen-book'];
        core.recommendedAction = 'trade';
        dismissBlockingBoardOverlays(core);

        render(
            <TradeAgreementHarnessBoard
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        expect(screen.getByTestId('betrayal-haunt-risk-status')).toHaveAttribute('data-omen-count', '2');
        expect(screen.getByTestId('betrayal-haunt-risk-status')).toHaveTextContent('预兆 2');
        expect(screen.getByTestId('betrayal-haunt-risk-status')).not.toHaveTextContent(/下次掷|5\+ 作祟|再抽预兆时检定/);
        expect(screen.getByTestId('betrayal-inventory-omen-book')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('betrayal-dog-trade-card-omen-book'));
        fireEvent.click(screen.getByTestId('betrayal-room-floor-up'));
        fireEvent.click(screen.getByTestId('betrayal-room-occupant-upper-landing-1'));
        fireEvent.click(screen.getByTestId('betrayal-action-trade'));

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-trade-agreement-panel')).toBeInTheDocument();
        });
        const tradeAcceptButton = screen.getByTestId('betrayal-trade-agreement-accept');
        expectEventRollConfirmButtonStyle(tradeAcceptButton);
        fireEvent.click(tradeAcceptButton);

        await waitFor(() => {
            expect(screen.queryByTestId('betrayal-trade-agreement-panel')).not.toBeInTheDocument();
        });
        expect(screen.queryByTestId('betrayal-inventory-omen-book')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-haunt-risk-status')).toHaveAttribute('data-omen-count', '2');
        expect(screen.getByTestId('betrayal-haunt-risk-status')).toHaveTextContent('预兆 2');
        expect(screen.getByTestId('betrayal-haunt-risk-status')).not.toHaveTextContent(/下次掷|5\+ 作祟|再抽预兆时检定/);
        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('使用狗完成交易');
    });

    it('灰尘剧本选中狗交易牌和目标后不会被交换疾病入口抢走', async () => {
        let core = createDustHauntBoardCore();
        core = placeCurrentExplorerInDustBoardRoom(core, {
            roomId: 'entrance-hall',
            name: '入口大厅',
            visualId: 'entranceHall',
            discoveryReward: null,
        });
        core = placeOtherExplorerInBoardRoom(core, '0', 'upper-landing');
        core = placeOtherExplorerInBoardRoom(core, '2', 'entrance-hall');
        core.otherExplorers = core.otherExplorers.map((explorer) => ({
            ...explorer,
            inventory: [],
        }));
        core.currentExplorer = {
            ...core.currentExplorer,
            inventory: [
                { id: 'dog', name: '狗', kind: 'omen' },
                { id: 'medical-kit', name: '急救包', kind: 'item' },
                { id: 'map', name: '地图', kind: 'item' },
            ],
        };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['dog', 'medical-kit', 'map'];
        core.recommendedAction = 'trade';
        dismissBlockingBoardOverlays(core);

        render(
            <HarnessBoard
                initialCore={core}
                playerID="1"
                matchData={defaultMatchData.slice(0, 3)}
            />,
        );

        expect(screen.getByTestId('betrayal-action-trade')).toHaveTextContent('交换疾病');
        expect(screen.getByTestId('betrayal-dog-trade-selector')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('betrayal-dog-trade-card-medical-kit'));
        fireEvent.click(screen.getByTestId('betrayal-room-floor-up'));
        fireEvent.click(screen.getByTestId('betrayal-room-occupant-upper-landing-0'));
        expect(screen.getByTestId('betrayal-action-trade')).toHaveTextContent('提交方案');
        fireEvent.click(screen.getByTestId('betrayal-action-trade'));

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-trade-flow-banner')).toHaveAttribute('data-trade-agreement-state', 'waiting');
        });
        expect(screen.queryByTestId('betrayal-sickness-exchange-banner')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('同意用狗交易');
        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('给出急救包');
    });

    it('狗交易候选区会保留已用持有物牌面并显示不可交易原因', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        const teammate = core.otherExplorers.find((explorer) => explorer.playerId === '1')!;
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'entrance-hall',
            inventory: [
                { id: 'dog', name: '狗', kind: 'omen' },
                { id: 'medical-kit', name: '急救包', kind: 'item' },
                { id: 'map', name: '地图', kind: 'item' },
            ],
        };
        core.otherExplorers = [
            { ...teammate, roomId: 'upper-landing', inventory: [] },
        ];
        core.activeRoomId = 'entrance-hall';
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['dog', 'medical-kit', 'map'];
        core.usedCardIdsThisTurn = ['medical-kit'];
        core.recommendedAction = 'trade';
        dismissBlockingBoardOverlays(core);

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        expect(screen.getByTestId('betrayal-dog-trade-selector')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-dog-trade-card-medical-kit')).toBeDisabled();
        expect(screen.getByTestId('betrayal-dog-trade-card-medical-kit-disabled-reason')).toHaveTextContent('本回合已经使用过的持有物不能交易');
        fireEvent.click(screen.getByTestId('betrayal-dog-trade-card-medical-kit'));
        expect(screen.queryByTestId('betrayal-dog-trade-card-medical-kit-selected-outline')).not.toBeInTheDocument();

        expect(screen.getByTestId('betrayal-dog-trade-card-map')).toBeEnabled();
        fireEvent.click(screen.getByTestId('betrayal-dog-trade-card-map'));
        expect(screen.getByTestId('betrayal-dog-trade-card-map-selected-outline')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-trade-flow-banner')).toHaveAttribute('data-trade-progress-visible', 'status-only');
        expect(screen.getByTestId('betrayal-trade-banner-status')).toHaveTextContent('选择交易方案');
        expect(screen.queryByTestId('betrayal-trade-flow-item-step')).not.toBeInTheDocument();
    });

    it('普通同房交易能在真实页面选择多张己方持有物并等待接收方同意', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        const teammate = core.otherExplorers.find((explorer) => explorer.playerId === '1')!;
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'hallway',
            inventory: [
                { id: 'rope', name: '兔脚', kind: 'item' },
                { id: 'omen-book', name: '书本', kind: 'omen' },
            ],
        };
        core.otherExplorers = [
            {
                ...teammate,
                roomId: 'hallway',
                inventory: [{ id: 'map', name: '地图', kind: 'item' }],
            },
        ];
        core.activeRoomId = 'hallway';
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['rope', 'omen-book'];
        core.recommendedAction = 'trade';
        dismissBlockingBoardOverlays(core);

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-inventory-rope'));
        fireEvent.click(screen.getByTestId('betrayal-inventory-omen-book'));
        expect(screen.getByTestId('betrayal-inventory-rope-selected-outline')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-inventory-omen-book-selected-outline')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-selected-inventory-card-name')).toHaveTextContent('兔脚、书本');

        fireEvent.click(screen.getByTestId('betrayal-room-occupant-hallway-1'));
        fireEvent.click(screen.getByTestId('betrayal-trade-return-card-map'));
        expect(within(screen.getByTestId('betrayal-trade-action-panel')).getByTestId('betrayal-trade-flow-item-step')).toHaveTextContent(/你给出.*兔脚.*书本.*对方给出.*地图/);

        fireEvent.click(screen.getByTestId('betrayal-action-trade'));

        expect(screen.getByTestId('betrayal-trade-flow-banner')).toHaveAttribute('data-trade-agreement-state', 'waiting');
        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('同意交易');
        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('给出兔脚、书本');
        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('给出地图');
    });

    it('普通回合主动点击交易后点同房目标会进入可见交易流程', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        const teammate = core.otherExplorers.find((explorer) => explorer.playerId === '1')!;
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'hallway',
            inventory: [
                { id: 'rope', name: '兔脚', kind: 'item' },
                { id: 'omen-book', name: '书本', kind: 'omen' },
            ],
        };
        core.otherExplorers = [
            {
                ...teammate,
                roomId: 'hallway',
                inventory: [{ id: 'map', name: '地图', kind: 'item' }],
            },
        ];
        core.activeRoomId = 'hallway';
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['rope', 'omen-book'];
        core.recommendedAction = 'move';
        dismissBlockingBoardOverlays(core);

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        expect(screen.queryByTestId('betrayal-room-occupant-target-outline-hallway-1')).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId('betrayal-action-trade'));

        expect(screen.getByTestId('betrayal-trade-flow-banner')).toHaveAttribute('data-trade-agreement-state', 'draft');
        expect(screen.getByTestId('betrayal-room-occupant-target-outline-hallway-1')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-action-cue')).toHaveTextContent('点同房间队友');

        fireEvent.click(screen.getByTestId('betrayal-room-occupant-hallway-1'));
        expect(screen.getByTestId('betrayal-trade-banner-status')).toHaveTextContent('选择交易方案');
        expect(screen.queryByTestId('betrayal-trade-flow-item-step')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-trade-status')).toHaveTextContent('可交易给');
        expect(screen.getByTestId('betrayal-trade-return-selector')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('betrayal-inventory-rope'));
        expect(screen.getByTestId('betrayal-inventory-rope-selected-outline')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('betrayal-trade-return-card-map'));
        expect(within(screen.getByTestId('betrayal-trade-action-panel')).getByTestId('betrayal-trade-flow-item-step')).toHaveTextContent(/你给出.*兔脚.*对方给出.*地图/);
        expect(screen.getByTestId('betrayal-action-trade')).toHaveTextContent('提交方案');
        expect(screen.getByTestId('betrayal-action-trade')).toBeEnabled();
    });

    it('普通交易在教程步切换造成运行态刷新后会保留已选己方持有物', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        const teammate = core.otherExplorers.find((explorer) => explorer.playerId === '1')!;
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'hallway',
            inventory: [
                { id: 'rope', name: '兔脚', kind: 'item' },
                { id: 'omen-book', name: '书本', kind: 'omen' },
            ],
        };
        core.otherExplorers = [
            {
                ...teammate,
                roomId: 'hallway',
                inventory: [{ id: 'map', name: '地图', kind: 'item' }],
            },
        ];
        core.activeRoomId = 'hallway';
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['rope', 'omen-book'];
        core.recommendedAction = 'trade';
        dismissBlockingBoardOverlays(core);

        const view = renderBoard(core, {
            matchData: defaultMatchData,
        });

        fireEvent.click(screen.getByTestId('betrayal-inventory-rope'));
        expect(screen.getByTestId('betrayal-inventory-rope-selected-outline')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-selected-inventory-card-name')).toHaveTextContent('兔脚');
        expect(screen.getByTestId('betrayal-action-cue')).toHaveTextContent('点同房间队友');

        view.rerender(renderBoardTree({ ...core }, {
            matchData: defaultMatchData,
        }));

        expect(screen.getByTestId('betrayal-inventory-rope-selected-outline')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-selected-inventory-card-name')).toHaveTextContent('兔脚');
        expect(screen.getByTestId('betrayal-action-cue')).toHaveTextContent('点同房间队友');
        expect(screen.getByTestId('betrayal-action-cue')).not.toHaveTextContent('点使用兔脚');
        fireEvent.click(screen.getByTestId('betrayal-room-occupant-hallway-1'));
        expect(within(screen.getByTestId('betrayal-trade-action-panel')).getByTestId('betrayal-trade-flow-item-step')).toHaveTextContent(/你给出.*兔脚/);
        expect(screen.getByTestId('betrayal-action-cue')).toHaveTextContent('确认交易方案');
        expect(screen.getByTestId('betrayal-trade-return-selector')).toBeInTheDocument();
    });

    it('普通交易会保留己方和对方已用持有物牌面并显示不可交易原因', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        const teammate = core.otherExplorers.find((explorer) => explorer.playerId === '1')!;
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'hallway',
            inventory: [
                { id: 'rope', name: '兔脚', kind: 'item' },
                { id: 'medical-kit', name: '急救包', kind: 'item' },
            ],
        };
        core.otherExplorers = [
            {
                ...teammate,
                roomId: 'hallway',
                inventory: [{ id: 'map', name: '地图', kind: 'item' }],
            },
        ];
        core.activeRoomId = 'hallway';
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['rope', 'medical-kit'];
        core.usedCardIdsThisTurn = ['medical-kit', 'map'];
        core.recommendedAction = 'trade';
        dismissBlockingBoardOverlays(core);

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        expect(screen.getByTestId('betrayal-inventory-medical-kit')).toBeDisabled();
        expect(screen.getByTestId('betrayal-inventory-medical-kit-disabled-reason')).toHaveTextContent('本回合已经使用过的持有物不能交易');
        fireEvent.click(screen.getByTestId('betrayal-inventory-medical-kit'));
        expect(screen.queryByTestId('betrayal-inventory-medical-kit-selected-outline')).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('betrayal-inventory-rope'));
        expect(screen.getByTestId('betrayal-inventory-rope-selected-outline')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('betrayal-room-occupant-hallway-1'));

        expect(screen.getByTestId('betrayal-trade-return-card-map')).toBeDisabled();
        expect(screen.getByTestId('betrayal-trade-return-card-map-disabled-reason')).toHaveTextContent('本回合已经使用过的持有物不能交易');
        fireEvent.click(screen.getByTestId('betrayal-trade-return-card-map'));
        expect(screen.queryByTestId('betrayal-trade-return-card-map-selected-outline')).not.toBeInTheDocument();
        expect(within(screen.getByTestId('betrayal-trade-action-panel')).getByTestId('betrayal-trade-flow-item-step')).toHaveTextContent(/你给出.*兔脚/);
        expect(within(screen.getByTestId('betrayal-trade-action-panel')).getByTestId('betrayal-trade-flow-item-step')).not.toHaveTextContent('对方给出');
    });

    it('灰尘主动牌已用后兔脚成功回滚在真实页面保留已用和不可交易状态', () => {
        const core = createDustUsedBookRabbitFootBoardCore(3);
        expect(core.scenarioRuntime.deadExplorerPlayerIds).not.toContain('1');
        expect(core.usedCardIdsThisTurn).toEqual(expect.arrayContaining(['omen-book', 'rope']));

        core.recommendedAction = 'use';
        dismissBlockingBoardOverlays(core);
        const useView = renderBoard(core, {
            playerID: '1',
            matchData: defaultMatchData.slice(0, 3),
        });

        expect(screen.getByTestId('betrayal-inventory-omen-book')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('betrayal-inventory-omen-book'));
        expect(screen.getByTestId('betrayal-use-status')).toHaveTextContent('本回合已用');
        expect(screen.getByTestId('betrayal-action-use')).toBeDisabled();
        expect(screen.queryByTestId('betrayal-corpse-loot-card-selector')).not.toBeInTheDocument();
        useView.unmount();

        core.recommendedAction = 'trade';
        renderBoard(core, {
            playerID: '1',
            matchData: defaultMatchData.slice(0, 3),
        });

        expect(screen.getByTestId('betrayal-action-trade')).not.toHaveTextContent('搜尸');
        expect(screen.getByTestId('betrayal-inventory-omen-book')).toBeDisabled();
        expect(screen.getByTestId('betrayal-inventory-omen-book-disabled-reason')).toHaveTextContent('本回合已经使用过的持有物不能交易');
        fireEvent.click(screen.getByTestId('betrayal-inventory-omen-book'));
        expect(screen.queryByTestId('betrayal-inventory-omen-book-selected-outline')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-corpse-loot-card-selector')).not.toBeInTheDocument();
    });

    it('灰尘面具已用后兔脚成功回滚在真实页面保留已用且不再选择目标', () => {
        const core = createDustUsedMaskRabbitFootBoardCore(3);
        expect(core.scenarioRuntime.deadExplorerPlayerIds).not.toContain('1');
        expect(core.usedCardIdsThisTurn).toEqual(expect.arrayContaining(['mask', 'rope']));

        core.recommendedAction = 'use';
        dismissBlockingBoardOverlays(core);
        renderBoard(core, {
            playerID: '1',
            matchData: defaultMatchData.slice(0, 3),
        });

        expect(screen.getByTestId('betrayal-inventory-mask')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('betrayal-inventory-mask'));
        expect(screen.getByTestId('betrayal-use-status')).toHaveTextContent('本回合已用');
        expect(screen.getByTestId('betrayal-action-use')).toBeDisabled();
        expect(screen.queryByTestId('betrayal-mask-target-selector')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-corpse-loot-card-selector')).not.toBeInTheDocument();
    });

    it('灰尘面具已用后兔脚仍失败在真实页面掩埋遗物且没有搜尸或目标选择入口', () => {
        let core = createDustUsedMaskRabbitFootBoardCore(1);
        expect(core.scenarioRuntime.deadExplorerPlayerIds).toContain('1');
        expect(core.scenarioRuntime.dust?.feverishPlayerIds).toContain('1');
        expect(core.currentExplorer.inventory).toEqual([]);
        expect(core.currentExplorerInventory).toEqual([]);
        expect(core.usedCardIdsThisTurn).toEqual(expect.arrayContaining(['mask', 'rope']));

        core = activateBoardExplorer(core, '0');
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'hallway',
        };
        core.activeRoomId = 'hallway';
        core.currentExplorerRoomId = 'hallway';
        core.recommendedAction = 'trade';
        dismissBlockingBoardOverlays(core);
        renderBoard(core, {
            playerID: '0',
            matchData: defaultMatchData.slice(0, 3),
        });

        expect(screen.getByTestId('betrayal-action-trade')).not.toHaveTextContent('搜尸');
        expect(screen.queryByTestId('betrayal-inventory-mask')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-mask-target-selector')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-corpse-loot-card-selector')).not.toBeInTheDocument();
    });

    it.each(DUST_CONSUMED_ACTIVE_BOARD_CARD_CASES)(
        '灰尘消耗型主动牌「$cardName」已用后兔脚成功回滚在真实页面不会恢复已埋葬牌',
        (cardCase) => {
            const core = createDustUsedConsumedActiveRabbitFootBoardCore(cardCase, 3);
            expect(core.scenarioRuntime.deadExplorerPlayerIds).not.toContain('1');
            expect(core.usedCardIdsThisTurn).toEqual(expect.arrayContaining([cardCase.cardId, 'rope']));
            expect(core.currentExplorer.inventory.map((card) => card.id)).toEqual(['skull', 'rope']);

            core.recommendedAction = 'use';
            dismissBlockingBoardOverlays(core);
            renderBoard(core, {
                playerID: '1',
                matchData: defaultMatchData.slice(0, 3),
            });

            expect(screen.queryByTestId(`betrayal-inventory-${cardCase.cardId}`)).not.toBeInTheDocument();
            expect(screen.getByTestId('betrayal-inventory-skull')).toBeInTheDocument();
            expect(screen.getByTestId('betrayal-inventory-rope')).toBeInTheDocument();
            expect(screen.queryByTestId('betrayal-corpse-loot-card-selector')).not.toBeInTheDocument();
        },
    );

    it.each(DUST_CONSUMED_ACTIVE_BOARD_CARD_CASES)(
        '灰尘消耗型主动牌「$cardName」已用后兔脚仍失败在真实页面掩埋剩余遗物且没有搜尸入口',
        (cardCase) => {
            let core = createDustUsedConsumedActiveRabbitFootBoardCore(cardCase, 1);
            expect(core.scenarioRuntime.deadExplorerPlayerIds).toContain('1');
            expect(core.scenarioRuntime.dust?.feverishPlayerIds).toContain('1');
            expect(core.currentExplorer.inventory).toEqual([]);
            expect(core.currentExplorerInventory).toEqual([]);
            expect(core.usedCardIdsThisTurn).toEqual(expect.arrayContaining([cardCase.cardId, 'rope']));

            core = activateBoardExplorer(core, '0');
            core.currentExplorer = {
                ...core.currentExplorer,
                roomId: cardCase.deathRoomId,
            };
            core.activeRoomId = cardCase.deathRoomId;
            core.currentExplorerRoomId = cardCase.deathRoomId;
            core.recommendedAction = 'trade';
            dismissBlockingBoardOverlays(core);
            renderBoard(core, {
                playerID: '0',
                matchData: defaultMatchData.slice(0, 3),
            });

            expect(screen.getByTestId('betrayal-action-trade')).not.toHaveTextContent('搜尸');
            expect(screen.queryByTestId(`betrayal-inventory-${cardCase.cardId}`)).not.toBeInTheDocument();
            expect(screen.queryByTestId('betrayal-corpse-loot-card-selector')).not.toBeInTheDocument();
        },
    );

    it('灰尘主动牌已用后兔脚仍失败在真实页面掩埋遗物且没有搜尸入口', () => {
        let core = createDustUsedBookRabbitFootBoardCore(1);
        expect(core.scenarioRuntime.deadExplorerPlayerIds).toContain('1');
        expect(core.scenarioRuntime.dust?.feverishPlayerIds).toContain('1');
        expect(core.currentExplorer.inventory).toEqual([]);
        expect(core.currentExplorerInventory).toEqual([]);
        expect(core.usedCardIdsThisTurn).toEqual(expect.arrayContaining(['omen-book', 'rope']));

        core = activateBoardExplorer(core, '0');
        core.recommendedAction = 'trade';
        dismissBlockingBoardOverlays(core);
        renderBoard(core, {
            playerID: '0',
            matchData: defaultMatchData.slice(0, 3),
        });

        expect(screen.getByTestId('betrayal-action-trade')).not.toHaveTextContent('搜尸');
        expect(screen.queryByTestId('betrayal-inventory-omen-book')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-corpse-loot-card-selector')).not.toBeInTheDocument();
    });

    it('搜尸必须在真实页面选择尸体和具体持有物，不能默认拿第一张', async () => {
        render(
            <HarnessBoard
                initialCore={createCorpseLootReadyCore()}
                playerID="1"
                matchData={defaultMatchData.slice(0, 3)}
            />,
        );

        expect(screen.getByTestId('betrayal-action-trade')).toHaveTextContent('搜尸');
        fireEvent.click(screen.getByTestId('betrayal-action-trade'));
        expect(screen.getByTestId('betrayal-room-latest-feedback')).not.toHaveTextContent('拿走');

        expect(screen.getByTestId('betrayal-room-occupant-target-outline-hallway-0')).toHaveAttribute('data-highlight-shape', 'pentagon');
        fireEvent.click(screen.getByTestId('betrayal-room-occupant-hallway-0'));
        expect(screen.getByTestId('betrayal-corpse-loot-card-selector')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('betrayal-corpse-loot-card-corpse-omen-1'));
        fireEvent.click(screen.getByTestId('betrayal-action-trade'));

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('拿走了黑暗预兆');
        });
    });

    it('圣符和雕像会在真实页面探索入口传入声明', async () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        const firstEventRoom = BETRAYAL_DISCOVERY_POOLS.roomDiscoveryByFloor.ground.find((room) => room.visualId === 'kitchen')!;
        const secondEventRoom = BETRAYAL_DISCOVERY_POOLS.roomDiscoveryByFloor.ground.find((room) => room.visualId === 'diningRoom')!;
        core.drawOrder = ['event'];
        core.roomDiscoveryDeck = [
            { floor: 'ground', room: cloneBoardRoomTemplate(firstEventRoom) },
            { floor: 'ground', room: cloneBoardRoomTemplate(secondEventRoom) },
        ];
        core.roomDiscoveryOrderByFloor = {
            ground: [
                cloneBoardRoomTemplate(firstEventRoom),
                cloneBoardRoomTemplate(secondEventRoom),
            ],
            upper: [],
            basement: [],
        };
        core.eventOrder = [
            {
                name: '阴影扑面',
                text: '阴影扑向你。失去 1 点力量。',
                effect: { mode: 'trait', trait: 'might', amount: -1, recommendedAction: 'endTurn' },
            },
        ];
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'hallway',
            inventory: [
                { id: 'holy-symbol', name: '圣符', kind: 'omen' },
                { id: 'idol', name: '雕像', kind: 'omen' },
            ],
        };
        core.activeRoomId = 'hallway';
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['holy-symbol', 'idol'];

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        expect(screen.getByTestId('betrayal-explore-options')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('betrayal-explore-option-holy-symbol'));
        fireEvent.click(screen.getByTestId('betrayal-explore-option-idol'));
        fireEvent.click(screen.getByTestId('betrayal-action-explore'));
        expect(screen.getByTestId('betrayal-room-explore-target-ground-north')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('betrayal-room-ground-north'));
        await confirmPendingRoomPlacement();

        expect(screen.queryByTestId('betrayal-discovery-panel')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-discovery-no-card-result')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('圣符埋葬');
        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('使用雕像跳过了事件：阴影扑面');
    });

    it('刚获得圣符或雕像时真实页面不会显示探索前持有物按钮', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.drawOrder = ['event'];
        core.eventOrder = [
            {
                name: '阴影扑面',
                text: '阴影扑向你。失去 1 点力量。',
                effect: { mode: 'trait', trait: 'might', amount: -1, recommendedAction: 'endTurn' },
            },
        ];
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'hallway',
            inventory: [
                { id: 'holy-symbol', name: '圣符', kind: 'omen' },
                { id: 'idol', name: '雕像', kind: 'omen' },
            ],
        };
        core.activeRoomId = 'hallway';
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = [];

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        expect(screen.queryByTestId('betrayal-explore-options')).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId('betrayal-action-explore'));
        expect(screen.queryByTestId('betrayal-explore-options')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-explore-option-holy-symbol')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-explore-option-idol')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-room-explore-target-ground-north')).toBeInTheDocument();
    });

    it('叛徒作祟后翻出事件符号后才选择是否跳过事件', async () => {
        const core = createOpenFrontierHauntBoardCore('2');
        core.currentExplorer = {
            ...core.currentExplorer,
            inventory: [],
        };
        core.currentExplorerInventory = [];
        core.turnStartInventoryCardIds = [];
        core.drawOrder = ['event'];
        core.eventOrder = [
            {
                name: '阴影扑面',
                text: '阴影扑向你。失去 1 点力量。',
                effect: { mode: 'trait', trait: 'might', amount: -1, recommendedAction: 'endTurn' },
            },
        ];
        core.deckCounts.event = core.eventOrder.length;
        setNextBoardDiscoveryRoom(core, 'ground', 'kitchen');
        const targetRoomId = resolveExplorableRoomSlots(core)[0]?.id;
        expect(targetRoomId).toBeTruthy();

        render(
            <HarnessBoard
                initialCore={core}
                playerID="2"
                matchData={defaultMatchData}
            />,
        );

        expect(screen.getByTestId('betrayal-action-explore')).toHaveTextContent('探索');
        expect(screen.queryByTestId('betrayal-explore-options')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-explore-option-traitor-event-skip')).not.toBeInTheDocument();
        expect(screen.queryByText('叛徒忽略事件')).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('betrayal-action-explore'));
        expect(screen.getByTestId(`betrayal-room-explore-target-${targetRoomId}`)).toBeInTheDocument();
        fireEvent.click(screen.getByTestId(`betrayal-room-${targetRoomId}`));
        await confirmPendingRoomPlacement();

        expect(screen.getByTestId('betrayal-event-choice-panel')).toHaveAccessibleName(/事件符号/);
        expect(screen.getByTestId('betrayal-event-choice-confirm')).toHaveTextContent('跳过事件');
        expect(screen.getByTestId('betrayal-event-choice-confirm')).not.toBeDisabled();
        expect(screen.getByTestId('betrayal-event-choice-decline')).toHaveTextContent('抽取事件牌');
        fireEvent.click(screen.getByTestId('betrayal-event-choice-confirm'));

        await waitFor(() => {
            expect(screen.queryByTestId('betrayal-event-choice-panel')).not.toBeInTheDocument();
            expect(screen.queryByTestId('betrayal-discovery-panel')).not.toBeInTheDocument();
            expect(screen.queryByTestId('betrayal-discovery-no-card-result')).not.toBeInTheDocument();
        });
        expect(screen.queryByText('叛徒忽略事件')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('跳过了事件');
    });

    it('探索只在进入选择态后高亮未知房间，并在发现结束回合后退出探索入口', async () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.drawOrder = ['item'];
        core.roomDiscoveryOrderByFloor.ground = [
            BETRAYAL_DISCOVERY_POOLS.roomDiscoveryByFloor.ground.find((room) => room.visualId === 'armory')!,
        ];
        core.possessionOrderByKind.item = [
            BETRAYAL_DISCOVERY_POOLS.possessions.item.find((card) => card.id === 'hunting-knife')!,
        ];
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'hallway',
            inventory: [],
        };
        core.activeRoomId = 'hallway';
        core.currentExplorerInventory = [];

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        expect(screen.queryByTestId('betrayal-room-explore-target-ground-north')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-action-explore')).not.toBeDisabled();

        fireEvent.click(screen.getByTestId('betrayal-action-explore'));
        expect(screen.getByTestId('betrayal-room-explore-target-ground-north')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('betrayal-room-ground-north'));
        await confirmPendingRoomPlacement();

        confirmDiscoveryUntilClosed();
        await waitFor(() => {
            expect(screen.queryByTestId('betrayal-action-explore')).not.toBeInTheDocument();
        });
        expect(screen.getByTestId('betrayal-action-endTurn')).not.toBeDisabled();
        expect(screen.queryByTestId('betrayal-room-explore-target-ground-north')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('探索到器械库');
    });

    it('探索结算结束后行动栏只保留结束回合入口', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        const teammate = core.otherExplorers[0]!;
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'hallway',
            inventory: [{ id: 'rope', name: '兔脚', kind: 'item' }],
        };
        core.otherExplorers = [
            {
                ...teammate,
                roomId: 'hallway',
                inventory: [{ id: 'omen-book', name: '书本', kind: 'omen' }],
            },
            ...core.otherExplorers.slice(1),
        ];
        core.activeRoomId = 'hallway';
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['rope'];
        core.movesRemaining = 0;
        core.turnEndedByDiscovery = true;
        core.recommendedAction = 'endTurn';

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        expect(screen.getByText('探索完成，结束回合')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-action-endTurn')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-action-endTurn')).not.toBeDisabled();
        expect(screen.queryByTestId('betrayal-action-move')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-action-explore')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-action-trade')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-action-use')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-action-roomEffect')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-mobile-dock-endTurn')).toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-mobile-dock-move')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-mobile-dock-trade')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-mobile-dock-use')).not.toBeInTheDocument();
    });

    it('探索放置面板会提示区域不匹配板块已被掩埋', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        const upperRoom = BETRAYAL_DISCOVERY_POOLS.roomDiscoveryByFloor.upper.find((room) => room.visualId === 'tower')!;
        const basementRoom = BETRAYAL_DISCOVERY_POOLS.roomDiscoveryByFloor.basement.find((room) => room.visualId === 'larder')!;
        const groundRoom = BETRAYAL_DISCOVERY_POOLS.roomDiscoveryByFloor.ground.find((room) => room.visualId === 'furnaceRoom')!;
        core.drawOrder = ['item'];
        core.roomDiscoveryDeck = [
            { floor: 'upper', room: upperRoom },
            { floor: 'basement', room: basementRoom },
            { floor: 'ground', room: groundRoom },
        ];
        core.roomDiscoveryOrderByFloor = {
            ground: [groundRoom],
            upper: [upperRoom],
            basement: [basementRoom],
        };
        core.possessionOrderByKind.item = [
            BETRAYAL_DISCOVERY_POOLS.possessions.item.find((card) => card.id === 'hunting-knife')!,
        ];
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'hallway',
            inventory: [],
        };
        core.activeRoomId = 'hallway';
        core.currentExplorerInventory = [];

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-action-explore'));
        fireEvent.click(screen.getByTestId('betrayal-room-ground-north'));

        expect(screen.getByTestId('betrayal-room-placement-panel')).toHaveTextContent('火炉房');
        expect(screen.getByTestId('betrayal-room-placement-buried-rooms')).toHaveTextContent('已掩埋：塔楼、储物间');
    });

    it('探索放置面板在教程步切换造成运行态刷新后会保留待放置房间', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        const groundRoom = BETRAYAL_DISCOVERY_POOLS.roomDiscoveryByFloor.ground.find((room) => room.visualId === 'furnaceRoom')!;
        core.drawOrder = ['item'];
        core.roomDiscoveryDeck = [
            { floor: 'ground', room: groundRoom },
        ];
        core.roomDiscoveryOrderByFloor = {
            ground: [groundRoom],
            upper: [],
            basement: [],
        };
        core.possessionOrderByKind.item = [
            BETRAYAL_DISCOVERY_POOLS.possessions.item.find((card) => card.id === 'hunting-knife')!,
        ];
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'hallway',
            inventory: [],
        };
        core.activeRoomId = 'hallway';
        core.currentExplorerInventory = [];

        const view = renderBoard(core, {
            matchData: defaultMatchData,
        });

        fireEvent.click(screen.getByTestId('betrayal-action-explore'));
        fireEvent.click(screen.getByTestId('betrayal-room-ground-north'));

        expect(screen.getByTestId('betrayal-room-placement-panel')).toHaveTextContent('火炉房');

        view.rerender(renderBoardTree({ ...core }, {
            matchData: defaultMatchData,
        }));

        expect(screen.getByTestId('betrayal-room-placement-panel')).toHaveTextContent('火炉房');
        expect(screen.getByTestId('betrayal-room-placement-confirm')).not.toBeDisabled();
    });

    it('探索放置面板会把玩家选择的新房间朝向交给正式探索命令', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        const baseRoom = BETRAYAL_DISCOVERY_POOLS.roomDiscoveryByFloor.ground.find((room) => room.visualId === 'furnaceRoom')!;
        const roomWithChoice = {
            ...baseRoom,
            name: '测试多朝向房',
            doorways: ['south', 'east', 'west'] as const,
        };
        core.drawOrder = ['item'];
        core.roomDiscoveryDeck = [
            { floor: 'ground', room: roomWithChoice },
        ];
        core.roomDiscoveryOrderByFloor = {
            ground: [roomWithChoice],
            upper: [],
            basement: [],
        };
        core.possessionOrderByKind.item = [
            BETRAYAL_DISCOVERY_POOLS.possessions.item.find((card) => card.id === 'hunting-knife')!,
        ];
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'hallway',
            inventory: [],
        };
        core.activeRoomId = 'hallway';
        core.currentExplorerInventory = [];

        const preview = resolveRoomPlacementPreview(core, { roomId: 'ground-north' });
        expect(preview?.orientationOptions.length).toBeGreaterThan(1);

        const dispatch = vi.fn();
        renderBoardWithDispatch(core, dispatch, {
            matchData: defaultMatchData,
        });

        fireEvent.click(screen.getByTestId('betrayal-action-explore'));
        fireEvent.click(screen.getByTestId('betrayal-room-ground-north'));

        const initialOrientation = screen
            .getByTestId('betrayal-room-placement-panel')
            .getAttribute('data-room-orientation-turns');
        const rotateRightButton = screen.getByTestId('betrayal-room-placement-rotate-right');
        expect(rotateRightButton).toHaveAttribute('data-tutorial-id', 'betrayal-room-placement-rotate-right');
        expect(rotateRightButton).not.toBeDisabled();

        fireEvent.click(rotateRightButton);

        const selectedOrientation = screen
            .getByTestId('betrayal-room-placement-panel')
            .getAttribute('data-room-orientation-turns');
        expect(selectedOrientation).not.toBe(initialOrientation);

        const roomPlacementConfirm = screen.getByTestId('betrayal-room-placement-confirm');
        expectEventRollConfirmButtonStyle(roomPlacementConfirm);
        fireEvent.click(roomPlacementConfirm);

        expect(dispatch).toHaveBeenCalledWith(
            BETRAYAL_COMMANDS.EXPLORE_ROOM,
            expect.objectContaining({
                roomId: 'ground-north',
                orientationTurns: Number(selectedOrientation),
            }),
        );
    });

    it('探索区域耗尽时会提示房间池已耗尽', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.drawOrder = ['item'];
        core.roomDiscoveryDeck = [];
        core.roomDiscoveryOrderByFloor = {
            ground: [],
            upper: [],
            basement: [],
        };
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'hallway',
            inventory: [],
        };
        core.activeRoomId = 'hallway';
        core.currentExplorerInventory = [];

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-action-explore'));
        fireEvent.click(screen.getByTestId('betrayal-room-ground-north'));

        expect(screen.getByTestId('betrayal-room-placement-failure')).toHaveTextContent('一层房间已耗尽');
        expect(screen.queryByTestId('betrayal-room-placement-panel')).not.toBeInTheDocument();
    });

    it('最后一张同区域房间会封死区域时提示先调整已有板块', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        const sealedBaseRoom = BETRAYAL_DISCOVERY_POOLS.roomDiscoveryByFloor.ground.find((room) => room.visualId === 'vault')!;
        const sealedRoom = {
            ...sealedBaseRoom,
            name: '测试最后死路房',
            hint: '测试用：最后一张同区域房间仍会封死当前区域',
            tags: ['测试'],
            doorways: ['south' as const],
        };
        core.drawOrder = ['item'];
        core.roomDiscoveryDeck = [
            { floor: 'ground', room: sealedRoom },
        ];
        core.roomDiscoveryOrderByFloor = {
            ground: [sealedRoom],
            upper: [],
            basement: [],
        };
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'hallway',
            inventory: [],
        };
        core.activeRoomId = 'hallway';
        core.currentExplorerInventory = [];
        core.rooms = core.rooms
            .filter((room) => room.id !== 'ground-south' && room.id !== 'ground-east')
            .map((room) => {
                if (room.id === 'hallway') {
                    return {
                        ...room,
                        connectedRoomIds: room.connectedRoomIds.filter((roomId) => roomId !== 'ground-south'),
                        doorways: room.doorways.filter((doorway) => doorway.connectsToRoomId !== 'ground-south'),
                    };
                }
                if (room.id === 'entrance-hall') {
                    return {
                        ...room,
                        connectedRoomIds: room.connectedRoomIds.filter((roomId) => roomId !== 'ground-east'),
                        doorways: room.doorways.filter((doorway) => doorway.connectsToRoomId !== 'ground-east'),
                    };
                }
                return room;
            });

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-action-explore'));
        fireEvent.click(screen.getByTestId('betrayal-room-ground-north'));

        expect(screen.getByTestId('betrayal-room-placement-panel')).toHaveTextContent('测试最后死路房');
        expect(screen.getByTestId('betrayal-room-placement-adjustment-required')).toHaveTextContent('需先最小调整本区域已有板块，保留开放走廊');
        expect(screen.getByTestId('betrayal-room-placement-confirm')).toBeDisabled();

        const adjustmentOption = screen.getAllByTestId('betrayal-room-tile-adjustment-option')[0];
        expect(screen.getByTestId('betrayal-room-tile-adjustment-options')).toHaveTextContent('选择调整板块');
        expect(adjustmentOption).toHaveTextContent('调整');
        expect(adjustmentOption).toHaveTextContent('开放走廊');

        fireEvent.click(adjustmentOption);

        expect(adjustmentOption).toHaveAttribute('data-selected', 'true');
        expect(screen.getByTestId('betrayal-room-placement-confirm')).toBeEnabled();

        fireEvent.click(screen.getByTestId('betrayal-room-placement-confirm'));

        expect(screen.queryByTestId('betrayal-room-placement-panel')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-room-ground-north')).toHaveTextContent('测试最后死路房');
    });

    it('器械库会在真实页面展示发现结果并把武器放入持有区', async () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.drawOrder = ['item'];
        core.roomDiscoveryOrderByFloor.ground = [
            BETRAYAL_DISCOVERY_POOLS.roomDiscoveryByFloor.ground.find((room) => room.visualId === 'armory')!,
        ];
        core.possessionOrderByKind.item = [
            BETRAYAL_DISCOVERY_POOLS.possessions.item.find((card) => card.id === 'medical-kit')!,
            BETRAYAL_DISCOVERY_POOLS.possessions.item.find((card) => card.id === 'hunting-knife')!,
        ];
        core.deckCounts.item = core.possessionOrderByKind.item.length;
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'hallway',
            inventory: [],
        };
        core.activeRoomId = 'hallway';
        core.currentExplorerInventory = [];

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-action-explore'));
        fireEvent.click(screen.getByTestId('betrayal-room-ground-north'));
        await confirmPendingRoomPlacement();

        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute(
            'aria-label',
            expect.stringContaining('物品牌 急救包'),
        );
        expectDiscoveryBackdropFullscreen();
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('器械库获得砍刀');
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('展示后埋葬急救包');
        expect(screen.queryByTestId('betrayal-discovery-card-front-missing')).not.toBeInTheDocument();
        expect(screen.queryByText('无发现牌')).not.toBeInTheDocument();
        const armorySteps = expectDiscoveryResolutionLedgerTraceOnly(2);
        expect(armorySteps[0]).toHaveTextContent('展示后埋葬急救包');
        expect(armorySteps[1]).toHaveTextContent('器械库获得砍刀');
        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('探索到器械库');
        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('房间没有发现符号');
        expect(screen.queryByTestId('betrayal-inventory-hunting-knife-armory-0-1')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-inventory-medical-kit-0')).not.toBeInTheDocument();

        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute('data-backdrop-dismiss', 'disabled');
        expect(screen.getByTestId('betrayal-discovery-search-step')).toHaveTextContent('展示后埋葬急救包');
        expect(screen.getByTestId('betrayal-discovery-search-step')).toHaveAttribute('data-room-discovery-search-index', '1');
        expect(screen.getByTestId('betrayal-discovery-search-step')).toHaveAttribute('data-room-discovery-search-total', '2');
        expect(screen.getByTestId('betrayal-discovery-search-step')).toHaveAttribute('data-room-discovery-search-outcome', 'buried');
        expect(screen.queryByTestId('betrayal-discovery-final-effect')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-discovery-continue')).toHaveTextContent('下一张');
        expect(screen.getByTestId('betrayal-discovery-continue')).toHaveAttribute('data-pending-card-resolution-step', '1/1');
        fireEvent.click(screen.getByTestId('betrayal-discovery-continue'));
        expect(screen.getByTestId('betrayal-discovery-panel')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute(
            'aria-label',
            expect.stringContaining('物品牌 砍刀'),
        );
        expect(screen.getByTestId('betrayal-discovery-search-step')).toHaveTextContent('器械库获得砍刀');
        expect(screen.getByTestId('betrayal-discovery-search-step')).toHaveAttribute('data-room-discovery-search-index', '2');
        expect(screen.getByTestId('betrayal-discovery-search-step')).toHaveAttribute('data-room-discovery-search-total', '2');
        expect(screen.getByTestId('betrayal-discovery-search-step')).toHaveAttribute('data-room-discovery-search-outcome', 'gained');
        expect(screen.getByTestId('betrayal-discovery-final-effect')).toHaveTextContent('展示后埋葬急救包；器械库获得砍刀');
        expect(screen.getByTestId('betrayal-discovery-continue')).toHaveTextContent('确认 0/4');
        expect(screen.getByTestId('betrayal-discovery-continue')).toHaveAttribute('data-event-roll-confirmed-count', '0');
        expect(screen.getByTestId('betrayal-discovery-continue')).toHaveAttribute('data-event-roll-required-count', '4');
        expect(screen.getByTestId('betrayal-discovery-continue')).not.toHaveAttribute('data-pending-card-resolution-step');
        fireEvent.click(screen.getByTestId('betrayal-discovery-continue'));
        expect(screen.queryByTestId('betrayal-discovery-panel')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-inventory-hunting-knife-armory-0-1')).toBeInTheDocument();

        expect(screen.queryByTestId('betrayal-deck-resolution-ledger')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-deck-resolution-ledger-step')).not.toBeInTheDocument();
    });

    it('翻牌结算必须由所有玩家确认，当前玩家确认后窗口仍保留并显示最终效果', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2']);
        const finalEffectText = '事件效果：知识检定 6：获得 1 点知识；知识 +1';
        core.latestDiscovery = {
            kind: 'event',
            title: '外星几何',
            summary: '即时生效',
            detail: '知识检定 6：获得 1 点知识；知识 +1',
            tone: 'accent',
            resolutionSteps: [{
                id: 'test-event-effect',
                kind: 'event-effect',
                text: finalEffectText,
                deckKind: 'event',
            }],
        };
        core.latestDiscoveryOwnerPlayerId = '0';
        core.pendingCardResolutionQueue = [{
            id: 'test-event-effect-resolution',
            playerId: '0',
            requiredPlayerIds: [...core.playerIds],
            acknowledgedPlayerIds: [],
            deckKind: 'event',
            cardName: '外星几何',
            discoveryTitle: '外星几何',
            stepKind: 'event-effect',
            text: finalEffectText,
            index: 1,
            total: 1,
        }];

        render(
            <MultiViewerCardResolutionHarness initialCore={core} />,
        );

        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute('aria-label', '事件牌 外星几何');
        expect(screen.queryByTestId('betrayal-discovery-confirmation-status')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-discovery-final-effect-confirmation')).not.toBeInTheDocument();
        const continueButton = screen.getByTestId('betrayal-discovery-continue');
        expect(continueButton).not.toBeDisabled();
        fireEvent.click(continueButton);

        expect(screen.getByTestId('betrayal-discovery-panel')).toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-discovery-confirmation-status')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-discovery-final-effect-confirmation')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-discovery-continue')).toHaveTextContent('已确认 1/3');
        expect(screen.getByTestId('betrayal-discovery-continue')).toBeDisabled();

        fireEvent.click(screen.getByTestId('betrayal-test-view-as-1'));
        expect(screen.getByTestId('betrayal-discovery-panel')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute('aria-label', '事件牌 外星几何');
        expect(screen.getByTestId('betrayal-discovery-continue')).not.toBeDisabled();
        fireEvent.click(screen.getByTestId('betrayal-discovery-continue'));
        expect(screen.queryByTestId('betrayal-discovery-confirmation-status')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-discovery-final-effect-confirmation')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-discovery-continue')).toHaveTextContent('已确认 2/3');

        fireEvent.click(screen.getByTestId('betrayal-test-view-as-2'));
        expect(screen.getByTestId('betrayal-discovery-panel')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute('aria-label', '事件牌 外星几何');
        expect(screen.getByTestId('betrayal-discovery-continue')).not.toBeDisabled();
        fireEvent.click(screen.getByTestId('betrayal-discovery-continue'));
        expect(screen.queryByTestId('betrayal-discovery-panel')).not.toBeInTheDocument();
    });

    it('即时事件效果会在真实页面展示确认步骤', async () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.drawOrder = ['event'];
        core.eventOrder = [BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '外星几何')!];
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'hallway',
            traits: {
                ...core.currentExplorer.traits,
                knowledge: 3,
                speed: 4,
            },
            inventory: [],
        };
        core.activeRoomId = 'hallway';
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = [];
        setNextBoardDiscoveryRoom(core, 'ground', 'kitchen');

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                matchData={defaultMatchData}
                diceResults={[3, 3, 3]}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-action-explore'));
        fireEvent.click(screen.getByTestId('betrayal-room-ground-north'));
        await confirmPendingRoomPlacement({ confirmEventRoll: false });

        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute(
            'aria-label',
            expect.stringContaining('事件牌 外星几何'),
        );
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('知识检定');
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('知识 +1');
        const alienGeometrySteps = expectDiscoveryResolutionLedgerTraceOnly(1);
        expect(alienGeometrySteps[0]).toHaveTextContent('事件效果');
        expect(alienGeometrySteps[0]).toHaveTextContent('知识 +1');
        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute('data-backdrop-dismiss', 'disabled');
        expect(screen.getByTestId('betrayal-discovery-continue')).toHaveTextContent('确认 0/1');
        expect(screen.getByTestId('betrayal-discovery-continue')).toHaveAttribute('data-event-roll-confirmed-count', '0');
        expect(screen.getByTestId('betrayal-discovery-continue')).toHaveAttribute('data-event-roll-required-count', '1');
        expect(screen.getByTestId('betrayal-discovery-continue')).not.toHaveAttribute('data-pending-card-resolution-step');
        fireEvent.click(screen.getByTestId('betrayal-discovery-continue'));
        await waitFor(() => {
            expect(screen.queryByTestId('betrayal-discovery-panel')).not.toBeInTheDocument();
        });
    });

    it('事件骰待确认时点击书本直接派发使用命令，不再进入二次确认', () => {
        let core = createStartedFirstScenarioCore(['0', '1', '2', '3']);
        core.drawOrder = ['event'];
        core.eventOrder = [BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '标本剥制')!];
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'hallway',
            inventory: [{ id: 'omen-book', name: '书本', kind: 'omen' }],
        };
        core.activeRoomId = 'hallway';
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['omen-book'];
        setNextBoardDiscoveryRoom(core, 'ground', 'kitchen');
        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.EXPLORE_ROOM,
            '0',
            { roomId: 'ground-north' },
            100,
            createBetrayalScriptedRandom(1, 1, 1),
            false,
        );
        const dispatch = vi.fn();

        renderBoardWithDispatch(core, dispatch, { matchData: defaultMatchData });

        const book = screen.getByTestId('betrayal-inventory-omen-book');
        expect(book).toHaveAttribute('data-event-roll-book-available', 'true');
        expect(book).toHaveAttribute('data-roll-modifier-available', 'true');
        expect(screen.queryByTestId('betrayal-action-use')).not.toBeInTheDocument();

        fireEvent.click(book);

        expect(dispatch).toHaveBeenCalledWith(BETRAYAL_COMMANDS.USE_POSSESSION, {
            cardId: 'omen-book',
        });
        expect(screen.queryByTestId('betrayal-action-use')).not.toBeInTheDocument();
    });

    it('房间文字效果会先于同房间事件效果进入真实页面确认步骤', async () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.drawOrder = ['event'];
        core.eventOrder = [BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '外星几何')!];
        core.roomDiscoveryOrderByFloor.ground = [
            BETRAYAL_DISCOVERY_POOLS.roomDiscoveryByFloor.ground.find((room) => room.visualId === 'chapel')!,
        ];
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'hallway',
            traits: {
                ...core.currentExplorer.traits,
                knowledge: 3,
                sanity: 4,
            },
            inventory: [],
        };
        core.activeRoomId = 'hallway';
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = [];

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                matchData={defaultMatchData}
                diceResults={[3, 3, 3]}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-action-explore'));
        fireEvent.click(screen.getByTestId('betrayal-room-ground-north'));
        await confirmPendingRoomPlacement({ confirmEventRoll: false });

        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute(
            'aria-label',
            expect.stringContaining('事件牌 外星几何'),
        );
        const steps = expectDiscoveryResolutionLedgerTraceOnly(2);
        expect(steps[0]).toHaveTextContent('房间效果：礼拜堂，神志 +1');
        expect(steps[1]).toHaveTextContent('事件效果');
        expect(steps[1]).toHaveTextContent('知识 +1');
        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute('data-backdrop-dismiss', 'disabled');
        expect(screen.getByTestId('betrayal-discovery-continue')).toHaveTextContent('确认');
        expect(screen.getByTestId('betrayal-discovery-continue')).toHaveAttribute('data-pending-card-resolution-step', '1/2');
        fireEvent.click(screen.getByTestId('betrayal-discovery-continue'));
        expect(screen.getByTestId('betrayal-discovery-continue')).toHaveAttribute('data-pending-card-resolution-step', '2/2');
        fireEvent.click(screen.getByTestId('betrayal-discovery-continue'));
        expect(screen.queryByTestId('betrayal-discovery-panel')).not.toBeInTheDocument();

        expect(screen.queryByTestId('betrayal-deck-resolution-ledger')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-deck-resolution-ledger-step')).not.toBeInTheDocument();
    });

    it('圣符预兆翻出后同屏显示作祟检定骰盘', async () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.drawOrder = ['omen'];
        core.possessionOrderByKind.omen = [
            { id: 'holy-symbol', name: '圣符', kind: 'omen' },
        ];
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'hallway',
            inventory: [],
        };
        core.activeRoomId = 'hallway';
        core.currentExplorerInventory = [];
        const expectedHauntDiceCount = 1 + [core.currentExplorer, ...core.otherExplorers]
            .reduce((count, explorer) => count + explorer.inventory.filter((card) => card.kind === 'omen').length, 0);

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-action-explore'));
        fireEvent.click(screen.getByTestId('betrayal-room-ground-north'));
        await confirmPendingRoomPlacement({ confirmEventRoll: false });

        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute(
            'aria-label',
            expect.stringContaining('预兆牌 圣符'),
        );
        expect(screen.getByTestId('betrayal-discovery-card-front-atlas')).toHaveAttribute(
            'data-atlas-frame-index',
            '4',
        );
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('作祟检定');
        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute('data-backdrop-dismiss', 'disabled');
        expect(screen.getByTestId('betrayal-discovery-continue')).toHaveTextContent('确认');
        expect(screen.getByTestId('betrayal-discovery-continue')).toHaveAttribute('data-pending-card-resolution-step', '1/1');
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute(
            'data-dice-count',
            String(expectedHauntDiceCount),
        );
        expect(screen.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute(
            'data-dice-surface-mode',
            'transparent-virtual',
        );
        expect(screen.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute(
            'data-dice-rule-subtotal',
            String(expectedHauntDiceCount),
        );
        const diceTraySurface = screen.getByTestId('betrayal-house-dice-tray-surface');
        expect(diceTraySurface).toHaveAttribute('data-dice-tray-surface', 'transparent');
        expect(diceTraySurface.className).toContain('bg-transparent');
        expect(diceTraySurface.className).not.toContain('gradient');
        expect(screen.getByTestId('betrayal-recent-roll-result-stage')).toHaveAttribute(
            'data-result-layout',
            'split-primary-total',
        );
        expect(screen.getByTestId('betrayal-recent-roll-total')).toHaveAttribute(
            'data-result-emphasis',
            'primary-total',
        );
        expect(screen.getByTestId('betrayal-recent-roll-outcome')).toHaveTextContent('未触发作祟');
        expect(screen.queryByTestId('betrayal-recent-roll-stage-surface')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-recent-roll-breakdown')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-recent-roll-subtotal')).toHaveTextContent('骰面合计');
        expect(screen.getByTestId('betrayal-recent-roll-passive-bonus')).toHaveTextContent('加值');

        const discoveryContinue = screen.queryByTestId('betrayal-discovery-continue');
        if (discoveryContinue) {
            fireEvent.click(discoveryContinue);
        }
        expect(screen.queryByTestId('betrayal-discovery-panel')).not.toBeInTheDocument();
    });

    it('普通预兆触发作祟时先同屏显示获得预兆和作祟检定，确认后打开剧本书并直接回牌桌', async () => {
        const core = createStartedFirstScenarioCore(['0', '1', '2']);
        core.drawOrder = ['omen'];
        core.possessionOrderByKind.omen = [
            { id: 'omen-crimson-splash', name: 'A Splash of Crimson', kind: 'omen' },
        ];
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'hallway',
            inventory: [
                requireRuntimeOmenCard('omen-book'),
            ],
        };
        core.activeRoomId = 'hallway';
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.otherExplorers = core.otherExplorers.map((explorer, index) => ({
            ...explorer,
            inventory: [
                requireRuntimeOmenCard(index === 0 ? 'dog' : 'mask'),
            ],
        }));
        const expectedHauntDiceCount = 1 + [core.currentExplorer, ...core.otherExplorers]
            .reduce((count, explorer) => count + explorer.inventory.filter((card) => card.kind === 'omen').length, 0);

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                matchData={defaultMatchData.slice(0, 3)}
                diceResults={[3, 3, 3, 3]}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-action-explore'));
        fireEvent.click(screen.getByTestId('betrayal-room-ground-north'));
        await confirmPendingRoomPlacement();

        expect(screen.getByTestId('betrayal-runtime-header-grid')).toHaveTextContent(/作祟中|Haunt/i);
        expect(screen.queryByTestId('betrayal-haunt-reveal-cue')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-scenario-reader-dialog')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute(
            'aria-label',
            expect.stringContaining('预兆牌 A Splash of Crimson'),
        );
        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute('data-backdrop-dismiss', 'disabled');
        const omenSteps = expectDiscoveryResolutionLedgerTraceOnly(2);
        expect(omenSteps[0]).toHaveTextContent('已加入持有区');
        expect(omenSteps[1]).toHaveTextContent('作祟检定');
        expect(screen.getByTestId('betrayal-discovery-continue')).toHaveTextContent('确认');
        expect(screen.getByTestId('betrayal-discovery-continue')).toHaveAttribute('data-pending-card-resolution-step', '1/1');
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute(
            'data-dice-count',
            String(expectedHauntDiceCount),
        );
        expect(screen.getByTestId('betrayal-recent-roll-total')).toHaveTextContent('总点数');

        const discoveryContinue = screen.queryByTestId('betrayal-discovery-continue');
        if (discoveryContinue) {
            fireEvent.click(discoveryContinue);
        }
        expect(screen.queryByTestId('betrayal-discovery-panel')).not.toBeInTheDocument();
        await waitFor(() => {
            expect(screen.getByTestId('betrayal-scenario-reader-dialog')).toBeInTheDocument();
        });
        expect(screen.getByTestId('betrayal-scenario-objective-page')).not.toHaveTextContent('木乃伊横行');
        fireEvent.click(screen.getByTestId('betrayal-scenario-reader-close'));
        await waitFor(() => {
            expect(screen.queryByTestId('betrayal-scenario-reader-dialog')).not.toBeInTheDocument();
        });
        expect(screen.queryByTestId('betrayal-haunt-reveal-cue')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-discovery-panel')).not.toBeInTheDocument();
    });

    it('持有物卡片会暴露主动、被动和特殊触发规则摘要，避免误判为空效果', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        const runtimePossessionCards = collectCurrentRuntimePossessionCards();
        expect(runtimePossessionCards.map((card) => card.id)).toEqual([
            'camera',
            'scary-doll',
            'medical-kit',
            'mirror',
            'holy-water',
            'lucky-coin',
            'leather-jacket',
            'tooth-necklace',
            'flashlight',
            'radio',
            'map',
            'strange-amulet',
            'brooch',
            'gun',
            'crossbow',
            'rope',
            'lockpick-tool',
            'mysterious-stopwatch',
            'hunting-knife',
            'chainsaw',
            'dynamite',
            'angel-feather',
            'omen-book',
            'dog',
            'mask',
            'skull',
            'holy-symbol',
            'armor',
            'idol',
            'ring',
            'dagger',
        ]);
        core.currentExplorer = {
            ...core.currentExplorer,
            inventory: runtimePossessionCards,
        };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = core.currentExplorer.inventory.map((card) => card.id);

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        expect(screen.getByTestId('betrayal-inventory-omen-book-shell')).toHaveAttribute(
            'data-rules-summary',
            expect.stringContaining('下一次非战斗检定可用知识替换'),
        );
        expect(screen.getByTestId('betrayal-inventory-omen-book-shell')).toHaveAttribute(
            'data-rules-summary',
            expect.stringContaining('知识检定 +1'),
        );
        expect(screen.getByTestId('betrayal-inventory-dog-shell')).toHaveAttribute(
            'data-rules-summary',
            expect.stringContaining('可与 4 格内队友交易'),
        );
        expect(screen.getByTestId('betrayal-inventory-mask-shell')).toHaveAttribute(
            'data-rules-summary',
            expect.stringContaining('移动同板块其他角色到相邻板块'),
        );
        expect(screen.getByTestId('betrayal-inventory-skull-shell')).toHaveAttribute(
            'data-rules-summary',
            expect.stringContaining('濒死时投 3 骰'),
        );
        expect(screen.getByTestId('betrayal-inventory-holy-symbol-shell')).toHaveAttribute(
            'data-rules-summary',
            expect.stringContaining('探索时可埋葬第一张板块'),
        );
        expect(screen.getByTestId('betrayal-inventory-camera-shell')).toHaveAttribute(
            'data-rules-summary',
            expect.stringContaining('说茄子'),
        );
        expect(screen.getByTestId('betrayal-inventory-medical-kit-shell')).toHaveAttribute(
            'data-rules-summary',
            expect.stringContaining('治疗力量和速度和知识和神志'),
        );
        expect(screen.getByTestId('betrayal-inventory-holy-water-shell')).toHaveAttribute(
            'data-rules-summary',
            expect.stringContaining('治疗力量和速度'),
        );
        expect(screen.getByTestId('betrayal-inventory-flashlight-shell')).toHaveAttribute(
            'data-rules-summary',
            expect.stringContaining('事件属性检定额外投 2 骰'),
        );
        expect(screen.getByTestId('betrayal-inventory-map-shell')).toHaveAttribute(
            'data-rules-summary',
            expect.stringContaining('放置到已发现板块'),
        );
        expect(screen.getByTestId('betrayal-inventory-strange-amulet-shell')).toHaveAttribute(
            'data-rules-summary',
            expect.stringContaining('援手作祟中决定胜利并控制巨魔手'),
        );
        expect(screen.getByTestId('betrayal-inventory-strange-amulet-shell')).toHaveAttribute(
            'data-rules-summary',
            expect.stringContaining('实际承受物理伤害后 +1 神志'),
        );
        expect(screen.getByTestId('betrayal-inventory-rope-shell')).toHaveAttribute(
            'data-rules-summary',
            expect.stringContaining('可重掷刚刚的投骰结果'),
        );
        expect(screen.getByTestId('betrayal-inventory-armor-shell')).toHaveAttribute(
            'data-rules-summary',
            expect.stringContaining('受到物理伤害 -1'),
        );
        expect(screen.getByTestId('betrayal-inventory-idol-shell')).toHaveAttribute(
            'data-rules-summary',
            expect.stringContaining('发现事件符号板块时可跳过事件'),
        );
        expect(screen.getByTestId('betrayal-inventory-ring-shell')).toHaveAttribute(
            'data-rules-summary',
            expect.stringContaining('攻击时可改用神志造成精神伤害'),
        );
        expect(screen.getByTestId('betrayal-inventory-dagger-shell')).toHaveAttribute(
            'data-rules-summary',
            expect.stringContaining('攻击时可选择匕首'),
        );
        expect(screen.getByTestId('betrayal-inventory-radio-shell')).toHaveAttribute(
            'data-rules-summary',
            expect.stringContaining('受到精神伤害 -1'),
        );
        expect(screen.getByTestId('betrayal-inventory-lockpick-tool-shell')).toHaveAttribute(
            'data-rules-summary',
            expect.stringContaining('穿过一格同层相邻墙体'),
        );
        expect(screen.getByTestId('betrayal-inventory-hunting-knife-shell')).toHaveAttribute(
            'data-rules-summary',
            expect.stringContaining('攻击时可选择砍刀'),
        );
    });

    it('兔脚会在真实页面展示最近投骰并重掷指定骰子', async () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.currentExplorer = {
            ...core.currentExplorer,
            traits: {
                ...core.currentExplorer.traits,
                knowledge: 3,
            },
            inventory: [{ id: 'rope', name: '兔脚', kind: 'item' }],
        };
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['rope'];
        core.usedCardIdsThisTurn = [];
        core.recentRoll = {
            id: 'board-rabbit-foot-roll',
            kind: 'eventTraitCheck',
            playerId: '0',
            sourceTitle: '墙中低语',
            trait: 'knowledge',
            dice: [0, 0, 0],
            passiveBonus: 0,
            latestLabel: '失去 1 点知识',
            consumedRabbitFootCardIds: [],
            branchThresholds: [
                {
                    min: 4,
                    label: '获得 1 点知识',
                    effect: { mode: 'trait', trait: 'knowledge', amount: 1, recommendedAction: 'explore' },
                },
                {
                    min: 0,
                    label: '失去 1 点知识',
                    effect: { mode: 'trait', trait: 'knowledge', amount: -1, recommendedAction: 'endTurn' },
                },
            ],
        };
        core.latestDiscovery = {
            kind: 'event',
            title: '墙中低语',
            summary: '即时生效',
            detail: '知识检定 0：失去 1 点知识；知识 -1',
            tone: 'warning',
            resolutionSteps: [{
                id: 'event-effect-墙中低语',
                kind: 'event-effect',
                text: '事件效果：知识检定 0：失去 1 点知识；知识 -1',
                deckKind: 'event',
            }],
        };
        core.latestDiscoveryOwnerPlayerId = '0';
        core.pendingEventRollResolution = {
            rollId: 'board-rabbit-foot-roll',
            playerId: '0',
            sourceTitle: '墙中低语',
            effect: { mode: 'trait', trait: 'knowledge', amount: -1, recommendedAction: 'endTurn' },
            requiresAcknowledgement: true,
        };

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        const discoveryPanel = screen.getByTestId('betrayal-discovery-panel');
        expect(discoveryPanel).toHaveAttribute('data-backdrop-dismiss', 'disabled');
        expectDiscoveryBackdropFullscreen(discoveryPanel);
        fireEvent.click(discoveryPanel);
        expect(screen.getByTestId('betrayal-discovery-panel')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('betrayal-inventory-rope'));
        expect(Number(screen.getByTestId('betrayal-rabbit-foot-dice').getAttribute('data-reroll-target-count'))).toBeGreaterThan(0);
        expect(screen.getByTestId('betrayal-house-dice-reroll-target-1')).toHaveAttribute('data-reroll-target-source', 'fallback-projection');

        fireEvent.click(screen.getByTestId('betrayal-house-dice-reroll-target-1'));
        expect(screen.getByTestId('betrayal-roll-modifier-confirm')).toHaveTextContent('确认使用兔脚');
        fireEvent.click(screen.getByTestId('betrayal-roll-modifier-confirm'));
        expect(screen.queryByTestId('betrayal-rabbit-foot-dice')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute('data-backdrop-dismiss', 'disabled');
        expect(screen.queryByTestId('betrayal-event-roll-finalize')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-discovery-continue')).not.toBeInTheDocument();
    });

    it('别人触发的普通事件投骰只要求触发者确认，观看方点击空白仍不能关闭发现面板', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2']);
        core.currentExplorer = {
            ...core.currentExplorer,
            traits: {
                ...core.currentExplorer.traits,
                knowledge: 3,
            },
        };
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.recentRoll = {
            id: 'board-other-player-event-roll',
            kind: 'eventTraitCheck',
            playerId: '0',
            sourceTitle: '墙中低语',
            trait: 'knowledge',
            dice: [1, 1, 0],
            passiveBonus: 0,
            latestLabel: '获得 1 点知识',
            consumedRabbitFootCardIds: [],
            branchThresholds: [
                {
                    min: 4,
                    label: '获得 1 点知识',
                    effect: { mode: 'trait', trait: 'knowledge', amount: 1, recommendedAction: 'explore' },
                },
                {
                    min: 0,
                    label: '失去 1 点知识',
                    effect: { mode: 'trait', trait: 'knowledge', amount: -1, recommendedAction: 'endTurn' },
                },
            ],
        };
        core.pendingEventRollResolution = {
            rollId: 'board-other-player-event-roll',
            playerId: '0',
            sourceTitle: '墙中低语',
            effect: { mode: 'trait', trait: 'knowledge', amount: 1, recommendedAction: 'explore' },
            requiresAcknowledgement: true,
        };
        core.latestDiscovery = {
            kind: 'event',
            title: '墙中低语',
            summary: '等待投骰结算',
            detail: '知识检定 2：等待触发者确认最终结果',
            tone: 'accent',
        };
        core.latestDiscoveryOwnerPlayerId = '0';

        render(
            <HarnessBoard
                initialCore={core}
                playerID="1"
                matchData={defaultMatchData}
                autoAcknowledgeOtherPlayers={false}
            />,
        );

        const discoveryPanel = screen.getByTestId('betrayal-discovery-panel');
        expect(discoveryPanel).toHaveAttribute('data-backdrop-dismiss', 'disabled');
        expectDiscoveryBackdropFullscreen(discoveryPanel);
        expect(screen.getByTestId('betrayal-recent-roll-actor')).toHaveTextContent('由 测试玩家 触发');
        expect(screen.queryByTestId('betrayal-event-roll-finalize')).not.toBeInTheDocument();
        const eventRollConfirm = screen.getByTestId('betrayal-discovery-continue');
        expect(eventRollConfirm).toHaveTextContent('确认 0/1');
        expectEventRollConfirmButtonStyle(eventRollConfirm);
        expect(eventRollConfirm).toBeDisabled();

        fireEvent.click(eventRollConfirm);

        expect(screen.getByTestId('betrayal-discovery-continue')).toHaveTextContent('确认 0/1');
        expect(screen.getByTestId('betrayal-discovery-continue')).toBeDisabled();

        fireEvent.click(discoveryPanel);

        expect(screen.getByTestId('betrayal-discovery-panel')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-discovery-continue')).toHaveTextContent('确认 0/1');
    });

    it('别人触发的普通事件投骰在横屏观看方不能被误确认或空白关闭', async () => {
        const originalInnerWidthDescriptor = Object.getOwnPropertyDescriptor(window, 'innerWidth');
        const originalInnerHeightDescriptor = Object.getOwnPropertyDescriptor(window, 'innerHeight');
        const originalVisualViewportDescriptor = Object.getOwnPropertyDescriptor(window, 'visualViewport');
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 900 });
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 500 });
        Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined });

        try {
            const core = createBetrayalFoundationCore(['0', '1', '2']);
            core.currentExplorer = {
                ...core.currentExplorer,
                traits: {
                    ...core.currentExplorer.traits,
                    knowledge: 3,
                },
            };
            core.currentExplorerTraits = { ...core.currentExplorer.traits };
            core.recentRoll = {
                id: 'board-other-player-event-roll-mobile',
                kind: 'eventTraitCheck',
                playerId: '0',
                sourceTitle: '墙中低语',
                trait: 'knowledge',
                dice: [1, 1, 0],
                passiveBonus: 0,
                latestLabel: '获得 1 点知识',
                consumedRabbitFootCardIds: [],
                branchThresholds: [
                    {
                        min: 4,
                        label: '获得 1 点知识',
                        effect: { mode: 'trait', trait: 'knowledge', amount: 1, recommendedAction: 'explore' },
                    },
                    {
                        min: 0,
                        label: '失去 1 点知识',
                        effect: { mode: 'trait', trait: 'knowledge', amount: -1, recommendedAction: 'endTurn' },
                    },
                ],
            };
            core.pendingEventRollResolution = {
                rollId: 'board-other-player-event-roll-mobile',
                playerId: '0',
                sourceTitle: '墙中低语',
                effect: { mode: 'trait', trait: 'knowledge', amount: 1, recommendedAction: 'explore' },
                requiresAcknowledgement: true,
            };
            core.latestDiscovery = {
                kind: 'event',
                title: '墙中低语',
                summary: '等待投骰结算',
                detail: '知识检定 2：等待触发者确认最终结果',
                tone: 'accent',
            };
            core.latestDiscoveryOwnerPlayerId = '0';

            render(
                <HarnessBoard
                    initialCore={core}
                    playerID="1"
                    matchData={defaultMatchData}
                    autoAcknowledgeOtherPlayers={false}
                />,
            );

            expect(screen.queryByTestId('betrayal-event-roll-finalize')).not.toBeInTheDocument();
            expect(screen.getByTestId('betrayal-discovery-panel')).toBeInTheDocument();
            expect(screen.getByTestId('betrayal-recent-roll-panel')).toBeInTheDocument();
            await waitFor(() => {
                expect(screen.getByTestId('betrayal-discovery-continue')).toBeDisabled();
            });

            const eventRollConfirm = screen.getByTestId('betrayal-discovery-continue');
            expect(eventRollConfirm).toHaveTextContent('确认 0/1');
            expectEventRollConfirmButtonStyle(eventRollConfirm);
            fireEvent.click(eventRollConfirm);

            expect(screen.getByTestId('betrayal-discovery-continue')).toHaveTextContent('确认 0/1');
            expect(screen.getByTestId('betrayal-discovery-continue')).toBeDisabled();
        } finally {
            if (originalInnerWidthDescriptor) {
                Object.defineProperty(window, 'innerWidth', originalInnerWidthDescriptor);
            }
            if (originalInnerHeightDescriptor) {
                Object.defineProperty(window, 'innerHeight', originalInnerHeightDescriptor);
            }
            if (originalVisualViewportDescriptor) {
                Object.defineProperty(window, 'visualViewport', originalVisualViewportDescriptor);
            }
        }
    });

    it('兔脚在死亡保护由非当前行动者投骰时仍显示受伤玩家持有牌', () => {
        let core = createFirstScenarioHauntCore();
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'upper-landing' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'grand-staircase' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'hallway' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'ground-north' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, '0', {});
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '1', { roomId: 'hallway' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '1', { roomId: 'ground-north' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, '1', {});
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '2', { roomId: 'basement-landing' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '2', { roomId: 'grand-staircase' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '2', { roomId: 'hallway' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '2', { roomId: 'ground-north' });
        core.otherExplorers = core.otherExplorers.map((explorer) => (
            explorer.playerId === '0'
                ? {
                    ...explorer,
                    inventory: [
                        { id: 'skull', name: '头骨', kind: 'omen' },
                        { id: 'rope', name: '兔脚', kind: 'item' },
                    ],
                }
                : explorer
        ));
        core = setBoardTraitTrack(core, '0', 'might', [1, 2], 1, 1);
        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.HAUNT_ATTACK,
            '2',
            { target: 'hero', targetPlayerId: '0' },
            100,
            createBetrayalScriptedRandom(3, 3, 3, 3, 3, 1, 1, 1, 1),
        );
        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.RESOLVE_DAMAGE_ALLOCATION,
            '0',
            { traits: lethalDamageTraitsForPendingAllocation(core) },
            101,
            createBetrayalScriptedRandom(1, 2, 2),
        );
        expect(core.recentRoll?.kind).toBe('deathPrevention');
        expect(core.recentRoll?.playerId).toBe('0');
        expect(core.recentRoll?.latestLabel).toBe('正常死亡');
        expect(core.scenarioRuntime.deadExplorerPlayerIds).toContain('0');
        core = activateBoardExplorer(core, '1');

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                playerID="0"
                matchData={defaultMatchData.slice(0, 3)}
                diceResults={[3]}
            />,
        );

        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('正常死亡');
        expect(screen.getByTestId('betrayal-inventory-rope')).toHaveAttribute('data-roll-modifier-available', 'true');
        expect(screen.getByTestId('betrayal-inventory-rope-roll-modifier')).toHaveAttribute('data-highlight-shape', 'card');
        fireEvent.click(screen.getByTestId('betrayal-inventory-rope'));
        expect(screen.getByTestId('betrayal-selected-inventory-card-name')).toHaveTextContent('兔脚');
        expect(screen.getByTestId('betrayal-rabbit-foot-dice')).toHaveAttribute('data-reroll-target-count', '3');

        fireEvent.click(screen.getByTestId('betrayal-house-dice-reroll-target-0'));
        expect(screen.getByTestId('betrayal-roll-modifier-confirm')).toHaveTextContent('确认使用兔脚');
        fireEvent.click(screen.getByTestId('betrayal-roll-modifier-confirm'));

        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('阻止死亡');
        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('使用兔脚重掷第 1 颗骰子');
    });

    it('幸运硬币在真实页面只允许选择最近属性检定的空白骰', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.currentExplorer = {
            ...core.currentExplorer,
            inventory: [{ id: 'lucky-coin', name: '幸运硬币', kind: 'item' }],
        };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['lucky-coin'];
        core.usedCardIdsThisTurn = [];
        core.recentRoll = {
            id: 'board-lucky-coin-roll',
            kind: 'eventTraitCheck',
            playerId: '0',
            sourceTitle: '幸运硬币属性检定',
            trait: 'knowledge',
            dice: [0, 1, 0],
            passiveBonus: 0,
            latestLabel: '属性检定空白骰',
            consumedRabbitFootCardIds: [],
        };
        core.latestDiscovery = {
            kind: 'event',
            title: '幸运硬币属性检定',
            summary: '即时生效',
            detail: '知识检定 1：属性检定空白骰',
            tone: 'warning',
        };
        core.latestDiscoveryOwnerPlayerId = '0';
        markRecentEventRollPendingFinalizationForBoardTest(core);

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-inventory-lucky-coin'));

        expect(screen.getByTestId('betrayal-rabbit-foot-dice')).toHaveAttribute('data-reroll-target-count', '2');
        expect(screen.getByTestId('betrayal-house-dice-reroll-target-0')).toHaveAttribute('data-reroll-target-source', 'fallback-projection');
        expect(screen.queryByTestId('betrayal-house-dice-reroll-target-1')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-house-dice-reroll-target-2')).toHaveAttribute('data-reroll-target-source', 'fallback-projection');
    });

    it('恐怖玩偶在真实页面允许重掷最近属性检定的全部骰子', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.currentExplorer = {
            ...core.currentExplorer,
            inventory: [{ id: 'scary-doll', name: '恐怖玩偶', kind: 'item' }],
        };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['scary-doll'];
        core.usedCardIdsThisTurn = [];
        core.recentRoll = {
            id: 'board-scary-doll-roll',
            kind: 'eventTraitCheck',
            playerId: '0',
            sourceTitle: '恐怖玩偶属性检定',
            trait: 'knowledge',
            dice: [0, 1, 2],
            passiveBonus: 0,
            latestLabel: '属性检定全部骰',
            consumedRabbitFootCardIds: [],
        };
        core.latestDiscovery = {
            kind: 'event',
            title: '恐怖玩偶属性检定',
            summary: '即时生效',
            detail: '知识检定：可用恐怖玩偶重掷全部骰子',
            tone: 'warning',
        };
        core.latestDiscoveryOwnerPlayerId = '0';
        markRecentEventRollPendingFinalizationForBoardTest(core);

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-inventory-scary-doll'));

        expect(screen.getByTestId('betrayal-rabbit-foot-dice')).toHaveAttribute('data-reroll-target-count', '3');
        expect(screen.getByTestId('betrayal-house-dice-reroll-target-0')).toHaveAttribute('data-reroll-target-source', 'fallback-projection');
        expect(screen.getByTestId('betrayal-house-dice-reroll-target-1')).toHaveAttribute('data-reroll-target-source', 'fallback-projection');
        expect(screen.getByTestId('betrayal-house-dice-reroll-target-2')).toHaveAttribute('data-reroll-target-source', 'fallback-projection');
    });

    it('兔脚不能改其他玩家的最近投骰', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.currentExplorer = {
            ...core.currentExplorer,
            inventory: [{ id: 'rope', name: '兔脚', kind: 'item' }],
        };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['rope'];
        core.usedCardIdsThisTurn = [];
        core.receivedCardIdsThisTurnByPlayerId = {
            ...core.receivedCardIdsThisTurnByPlayerId,
            0: [],
        };
        core.recentRoll = {
            id: 'other-player-roll',
            kind: 'eventTraitCheck',
            playerId: '1',
            sourceTitle: '外星几何',
            trait: 'knowledge',
            rollLabel: '知识检定',
            dice: [0, 1, 0],
            passiveBonus: 0,
            latestLabel: '知识 +1',
            consumedRabbitFootCardIds: [],
        };

        expect(canUseRabbitFootForRecentRoll(core, '0', 'rope')).toBe(false);
        expect(
            BetrayalDomain.validate(
                stateOf(core),
                createBetrayalCommand(
                    BETRAYAL_COMMANDS.USE_RABBIT_FOOT,
                    '0',
                    { cardId: 'rope', dieIndex: 0 },
                    100,
                ),
            ),
        ).toEqual({
            valid: false,
            error: '当前没有可被兔脚重掷的最近投骰。',
        });
    });

    it('普通投骰结果没有可改骰时点击空白不关闭，只能用明确按钮关闭', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.currentExplorer = {
            ...core.currentExplorer,
            inventory: [],
        };
        core.currentExplorerInventory = [];
        core.turnStartInventoryCardIds = [];
        core.usedCardIdsThisTurn = [];
        core.latestDiscovery = null;
        core.latestDiscoveryOwnerPlayerId = null;
        core.recentRoll = {
            id: 'board-open-roll-backdrop-close',
            kind: 'mysticElevator',
            playerId: '0',
            sourceTitle: '神秘电梯',
            rollLabel: '房间移动',
            dice: [1, 1],
            passiveBonus: 0,
            latestLabel: '移动到未探索',
            consumedRabbitFootCardIds: [],
        };

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        const backdrop = screen.getByTestId('betrayal-roll-result-backdrop');
        expect(backdrop).toHaveAttribute('data-backdrop-dismiss', 'disabled');
        fireEvent.click(screen.getByTestId('betrayal-roll-result-dock'));
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toBeInTheDocument();
        fireEvent.click(backdrop);
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('betrayal-roll-continue'));
        expect(screen.queryByTestId('betrayal-recent-roll-panel')).not.toBeInTheDocument();
    });

    it('普通投骰结果仍可改骰时点击空白不关闭，只能用明确按钮关闭', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.currentExplorer = {
            ...core.currentExplorer,
            inventory: [{ id: 'rope', name: '兔脚', kind: 'item' }],
        };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['rope'];
        core.usedCardIdsThisTurn = [];
        core.latestDiscovery = null;
        core.latestDiscoveryOwnerPlayerId = null;
        core.recentRoll = {
            id: 'board-roll-modifier-requires-button-close',
            kind: 'roomEndTurnTraitCheck',
            playerId: '0',
            sourceTitle: '倒塌房间',
            trait: 'speed',
            rollLabel: '速度检定',
            dice: [0, 0, 0],
            passiveBonus: 0,
            latestLabel: '坠落到地下室起始点',
            consumedRabbitFootCardIds: [],
        };

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        const backdrop = screen.getByTestId('betrayal-roll-result-backdrop');
        expect(backdrop).toHaveAttribute('data-backdrop-dismiss', 'disabled');
        fireEvent.click(backdrop);
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('betrayal-roll-continue'));
        expect(screen.queryByTestId('betrayal-recent-roll-panel')).not.toBeInTheDocument();
    });

    it('倒塌房间投骰未确认前阻塞行动链，点击继续后先分配坠落伤害', async () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'basement-landing',
            inventory: [],
        };
        core.currentPlayer = '0';
        core.activeRoomId = core.currentExplorer.roomId;
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = [];
        core.turnStartInventoryCardIds = [];
        core.usedCardIdsThisTurn = [];
        core.latestDiscovery = null;
        core.latestDiscoveryOwnerPlayerId = null;
        core.recommendedAction = 'endTurn';
        core.recentRoll = {
            id: 'pending-room-end-turn-roll',
            kind: 'roomEndTurnTraitCheck',
            playerId: '0',
            sourceTitle: '倒塌房间',
            trait: 'speed',
            rollLabel: '速度检定',
            dice: [0, 0, 0],
            passiveBonus: 0,
            latestLabel: '坠落到地下室起始点',
            roomEndTurn: {
                kind: 'speedCheckFallToBasement',
                roomName: '倒塌房间',
                roomId: 'upper-north',
                originalRoomId: 'upper-north',
                traitsBeforeEffect: { ...core.currentExplorer.traits },
                previousPhysicalDamage: 1,
                previousDestinationRoomId: 'basement-landing',
                nextPlayerId: '1',
                monsterMovementRoll: null,
                turnLogText: '轮到玩家 2',
            },
            consumedRabbitFootCardIds: [],
        };

        render(
            <HarnessBoard
                initialCore={core}
                playerID="0"
                matchData={defaultMatchData}
            />,
        );

        expect(screen.getByTestId('betrayal-roll-result-backdrop')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('倒塌房间');
        expect(screen.queryByTestId('betrayal-current-panel-token-0')).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('betrayal-roll-continue'));
        await waitFor(() => {
            expect(screen.queryByTestId('betrayal-recent-roll-panel')).not.toBeInTheDocument();
        });

        expect(screen.queryByTestId('betrayal-current-panel-token-0')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-damage-allocation-panel')).toHaveAttribute('data-player-id', '0');
        expect(screen.getByTestId('betrayal-damage-allocation-source')).toHaveTextContent('倒塌房间');
        expect(screen.getByTestId('betrayal-damage-allocation-amount')).toHaveTextContent('1 点物理伤害');

        fireEvent.click(screen.getByTestId('betrayal-damage-allocation-trait-speed-increase'));
        expect(screen.getByTestId('betrayal-damage-allocation-confirm')).not.toBeDisabled();
        fireEvent.click(screen.getByTestId('betrayal-damage-allocation-confirm'));

        expect(screen.queryByTestId('betrayal-current-panel-token-1')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-action-endTurn')).toBeInTheDocument();
    });

    it('攻击投骰结果必须方形按钮确认，投骰者确认后退场且空白不能关闭', async () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        const defender = core.otherExplorers[0]!;
        core.currentExplorer = {
            ...core.currentExplorer,
            inventory: [],
        };
        core.currentExplorerInventory = [];
        core.turnStartInventoryCardIds = [];
        core.usedCardIdsThisTurn = [];
        core.latestDiscovery = null;
        core.latestDiscoveryOwnerPlayerId = null;
        core.recentRoll = {
            id: 'board-attack-roll-backdrop-close',
            kind: 'attackRoll',
            playerId: '0',
            sourceTitle: '攻击投骰',
            rollLabel: '攻击投骰',
            dice: [2, 2, 0, 0],
            passiveBonus: 0,
            latestLabel: '造成 2 点伤害',
            consumedRabbitFootCardIds: [],
            attack: {
                target: 'hero',
                defenderPlayerId: defender.playerId,
                damageKind: 'physical',
                previousDamageToAttacker: 0,
                previousDamageToDefender: 2,
                defenderRoll: 2,
                attackerTraitsBeforeDamage: { ...core.currentExplorer.traits },
                defenderTraitsBeforeDamage: { ...defender.traits },
            },
        };

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData}
                autoAcknowledgeOtherPlayers={false}
            />,
        );

        const backdrop = screen.getByTestId('betrayal-roll-review-backdrop');
        expect(backdrop).toHaveAttribute('data-backdrop-dismiss', 'disabled');
        fireEvent.click(screen.getByTestId('betrayal-attack-roll-review'));
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toBeInTheDocument();
        const confirmButton = screen.getByTestId('betrayal-roll-continue');
        expect(confirmButton).toHaveTextContent('确认 0/1');
        expect(confirmButton).toHaveAttribute('data-recent-roll-confirmed-count', '0');
        expect(confirmButton).toHaveAttribute('data-recent-roll-required-count', '1');
        expectEventRollConfirmButtonStyle(confirmButton);
        fireEvent.click(backdrop);
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toBeInTheDocument();
        fireEvent.click(confirmButton);
        await waitFor(() => {
            expect(screen.queryByTestId('betrayal-recent-roll-panel')).not.toBeInTheDocument();
        });
    });

    it('驱魔投骰结果也走统一确认按钮，不能靠空白关闭', async () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.currentExplorer = {
            ...core.currentExplorer,
            inventory: [],
        };
        core.currentExplorerInventory = [];
        core.turnStartInventoryCardIds = [];
        core.usedCardIdsThisTurn = [];
        core.latestDiscovery = null;
        core.latestDiscoveryOwnerPlayerId = null;
        core.recentRoll = {
            id: 'board-exorcise-roll-backdrop-close',
            kind: 'hauntActionTraitCheck',
            playerId: '0',
            sourceTitle: '驱魔',
            trait: 'sanity',
            rollLabel: '神志检定',
            dice: [0, 0, 0],
            passiveBonus: 0,
            latestLabel: '驱魔失败',
            consumedRabbitFootCardIds: [],
        };

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        const backdrop = screen.getByTestId('betrayal-roll-review-backdrop');
        expect(backdrop).toHaveAttribute('data-backdrop-dismiss', 'disabled');
        fireEvent.click(screen.getByTestId('betrayal-exorcise-roll-review'));
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-exorcise-roll-continue')).not.toBeInTheDocument();
        const confirmButton = screen.getByTestId('betrayal-roll-continue');
        expect(confirmButton).toHaveTextContent('确认 0/1');
        expectEventRollConfirmButtonStyle(confirmButton);
        fireEvent.click(backdrop);
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toBeInTheDocument();
        fireEvent.click(confirmButton);
        await waitFor(() => {
            expect(screen.queryByTestId('betrayal-recent-roll-panel')).not.toBeInTheDocument();
        });
    });

    it('运行时房间会读取正式空间规则字段', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        const entranceHall = core.rooms.find((room) => room.id === 'entrance-hall');
        const upperLanding = core.rooms.find((room) => room.id === 'upper-landing');
        const hallway = core.rooms.find((room) => room.id === 'hallway');
        const grandStaircase = core.rooms.find((room) => room.id === 'grand-staircase');
        const basementLanding = core.rooms.find((room) => room.id === 'basement-landing');

        expect(entranceHall?.visualId).toBe('startTriple');
        expect(entranceHall?.doorways.map((doorway) => doorway.connectsToRoomId)).not.toContain('basement-landing');
        expect(entranceHall?.doorways.map((doorway) => doorway.connectsToRoomId)).toContain('hallway');
        expect(upperLanding?.visualId).toBe('upperLanding');
        expect(upperLanding?.doorways.some((doorway) => doorway.leadsToFloor === 'ground')).toBe(true);
        expect(hallway?.visualId).toBe('startHallway');
        expect(hallway?.doorways.map((doorway) => doorway.connectsToRoomId)).toEqual(
            expect.arrayContaining(['grand-staircase', 'entrance-hall', 'ground-north', 'ground-south']),
        );
        expect(grandStaircase?.doorways.map((doorway) => doorway.connectsToRoomId)).toContain('basement-landing');
        expect(basementLanding?.doorways.map((doorway) => doorway.connectsToRoomId)).toContain('grand-staircase');
    });

    it('房间障碍物标记会显示在对应房间格上', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        const hallway = core.rooms.find((room) => room.id === 'hallway')!;
        hallway.markerTokens = ['obstacle'];

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        const marker = screen.getByTestId('betrayal-room-marker-hallway-obstacle');
        expect(marker).toBeInTheDocument();
        expect(within(marker).getByAltText('障碍物')).toHaveAttribute('data-src', 'betrayal/markers/obstacle');
    });

    it('房间祝福标记会显示在对应房间格上', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        const hallway = core.rooms.find((room) => room.id === 'hallway')!;
        hallway.markerTokens = ['blessing'];

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        const marker = screen.getByTestId('betrayal-room-marker-hallway-blessing');
        expect(marker).toBeInTheDocument();
        expect(within(marker).getByAltText('祝福')).toHaveAttribute('data-src', 'betrayal/markers/blessing');
    });

    it('地图主视区默认只显示当前楼层，避免同坐标跨楼层房间叠住', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        const upperLanding = core.rooms.find((room) => room.id === 'upper-landing')!;
        const grandStaircase = core.rooms.find((room) => room.id === 'grand-staircase')!;
        const basementLanding = core.rooms.find((room) => room.id === 'basement-landing')!;
        upperLanding.x = 2;
        upperLanding.y = 1;
        grandStaircase.x = 2;
        grandStaircase.y = 1;
        basementLanding.x = 2;
        basementLanding.y = 1;
        core.currentExplorer.roomId = 'upper-landing';
        core.activeRoomId = 'upper-landing';
        core.otherExplorers[0]!.roomId = 'grand-staircase';
        core.otherExplorers[1]!.roomId = 'upper-landing';
        core.otherExplorers[2]!.roomId = 'upper-landing';

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        expect(screen.getByTestId('betrayal-room-floor-upper')).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByTestId('betrayal-room-floor-up')).toBeDisabled();
        expect(screen.getByTestId('betrayal-room-floor-down')).not.toBeDisabled();
        expect(screen.getByTestId('betrayal-room-shell-upper-landing')).toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-room-shell-grand-staircase')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-room-shell-basement-landing')).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('betrayal-room-floor-down'));
        expect(screen.getByTestId('betrayal-room-floor-ground')).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByTestId('betrayal-room-shell-grand-staircase')).toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-room-shell-upper-landing')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-room-shell-basement-landing')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-room-floor-up')).not.toBeDisabled();
        expect(screen.getByTestId('betrayal-room-floor-down')).toBeDisabled();

        fireEvent.click(screen.getByTestId('betrayal-room-floor-down'));
        expect(screen.getByTestId('betrayal-room-floor-ground')).toHaveAttribute('aria-pressed', 'true');
        expect(screen.queryByTestId('betrayal-room-floor-basement')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-room-shell-basement-landing')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-room-shell-upper-landing')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-room-shell-grand-staircase')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-room-floor-up')).not.toBeDisabled();
        expect(screen.getByTestId('betrayal-room-floor-down')).toBeDisabled();
    });

    it('其他玩家接手行动时不自动把地图楼层拉到对方位置', async () => {
        const core = createBetrayalFoundationCore(['0', '1', '2']);
        const playerZero = core.currentExplorer;
        const playerOne = core.otherExplorers.find((explorer) => explorer.playerId === '1')!;
        const playerTwo = core.otherExplorers.find((explorer) => explorer.playerId === '2')!;

        core.currentExplorer = { ...playerOne, roomId: 'grand-staircase' };
        core.otherExplorers = [
            { ...playerZero, roomId: 'upper-landing' },
            { ...playerTwo, roomId: 'basement-landing' },
        ];
        core.currentPlayer = '1';
        core.activeRoomId = 'grand-staircase';
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.movesRemaining = 0;

        render(
            <HarnessBoard
                initialCore={core}
                playerID="1"
                matchData={defaultMatchData.slice(0, 3)}
            />,
        );

        expect(screen.getByTestId('betrayal-room-floor-ground')).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(screen.getByTestId('betrayal-room-floor-up'));
        expect(screen.getByTestId('betrayal-room-floor-upper')).toHaveAttribute('aria-pressed', 'true');

        fireEvent.click(screen.getByTestId('betrayal-action-endTurn'));

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-room-floor-upper')).toHaveAttribute('aria-pressed', 'true');
        });
        expect(screen.getByTestId('betrayal-room-shell-upper-landing')).toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-room-shell-basement-landing')).not.toBeInTheDocument();
    });

    it('移动模式会把跨层相邻房间所在楼层加入切换链并允许移动', async () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        const upperLanding = core.rooms.find((room) => room.id === 'upper-landing')!;
        const grandStaircase = core.rooms.find((room) => room.id === 'grand-staircase')!;
        const basementLanding = core.rooms.find((room) => room.id === 'basement-landing')!;
        upperLanding.x = 2;
        upperLanding.y = 1;
        grandStaircase.x = 2;
        grandStaircase.y = 1;
        basementLanding.x = 2;
        basementLanding.y = 1;
        core.currentExplorer.roomId = 'upper-landing';
        core.activeRoomId = 'upper-landing';
        core.otherExplorers[0]!.roomId = 'upper-landing';
        core.otherExplorers[1]!.roomId = 'upper-landing';
        core.otherExplorers[2]!.roomId = 'upper-landing';

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        expect(screen.getByTestId('betrayal-room-floor-upper')).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByTestId('betrayal-room-floor-down')).not.toBeDisabled();
        fireEvent.click(screen.getByTestId('betrayal-room-floor-down'));
        expect(screen.getByTestId('betrayal-room-floor-ground')).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByTestId('betrayal-room-shell-grand-staircase')).toBeInTheDocument();
        const grandStaircaseButton = screen.getByTestId('betrayal-room-grand-staircase');
        expect(grandStaircaseButton).toBeDisabled();

        fireEvent.click(screen.getByTestId('betrayal-action-move'));
        expect(grandStaircaseButton).not.toBeDisabled();
        fireEvent.click(grandStaircaseButton);

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-room-floor-ground')).toHaveAttribute('aria-pressed', 'true');
            expect(screen.getByTestId('betrayal-room-occupant-grand-staircase-0')).toBeInTheDocument();
        });
        expect(screen.queryByTestId('betrayal-room-floor-upper')).not.toBeInTheDocument();
    });

    it('当前房间是神秘电梯时才显示并执行房间效果按钮', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        const elevatorRoom = core.rooms.find((room) => room.id === 'upper-landing')!;
        elevatorRoom.name = '神秘电梯';
        elevatorRoom.visualId = 'mysticElevator';
        elevatorRoom.enterEffect = 'mysticElevator';
        core.currentExplorer.roomId = 'upper-landing';
        core.activeRoomId = 'upper-landing';

        const hiddenCheck = renderBoard(createBetrayalFoundationCore(['0', '1', '2', '3']), {
            playerID: '0',
            matchData: defaultMatchData,
        });
        expect(screen.queryByTestId('betrayal-action-roomEffect')).not.toBeInTheDocument();
        hiddenCheck.unmount();

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        const roomEffectButton = screen.getByTestId('betrayal-action-roomEffect');
        expect(roomEffectButton).toHaveTextContent('神秘电梯');

        fireEvent.click(roomEffectButton);
        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('神秘电梯');
    });

    it('神秘电梯本回合已用后仍保留房间效果按钮和禁用原因', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        const elevatorRoom = core.rooms.find((room) => room.id === 'upper-landing')!;
        elevatorRoom.name = '神秘电梯';
        elevatorRoom.visualId = 'mysticElevator';
        elevatorRoom.enterEffect = 'mysticElevator';
        core.currentExplorer.roomId = 'upper-landing';
        core.activeRoomId = 'upper-landing';
        core.scenarioRuntime.usedRoomEffectIdsThisTurn = ['mysticElevator'];

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        const roomEffectButton = screen.getByTestId('betrayal-action-roomEffect');
        expect(roomEffectButton).toHaveTextContent('神秘电梯');
        expect(roomEffectButton).toBeDisabled();
        expect(roomEffectButton).toHaveAttribute('data-action-disabled-reason', '该房间效果本回合已用');
    });

    it('结束回合房间效果会提前提示并在结算后反馈', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        const furnaceRoom = core.rooms.find((room) => room.id === 'upper-landing')!;
        furnaceRoom.name = '火炉房';
        furnaceRoom.visualId = 'furnaceRoom';
        furnaceRoom.endTurnEffect = 'physicalDamage1';
        core.currentExplorer.roomId = 'upper-landing';
        core.activeRoomId = 'upper-landing';
        core.currentExplorer.traits.might = 4;
        core.currentExplorer.traits.speed = 4;

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        expect(screen.getByTestId('betrayal-room-end-turn-effect-status')).toHaveTextContent('火炉房');
        expect(screen.getByTestId('betrayal-room-end-turn-effect-status')).toHaveTextContent('1 点物理伤害');
        expect(screen.getByTestId('betrayal-room-end-turn-effect-hint')).toHaveTextContent('结束回合受伤');
        expect(screen.getByTestId('betrayal-action-endTurn')).toHaveTextContent('结束回合');
        expect(screen.getByTestId('betrayal-action-endTurn')).not.toHaveTextContent('结算房间');

        fireEvent.click(screen.getByTestId('betrayal-action-endTurn'));

        expect(screen.getByTestId('betrayal-damage-allocation-panel')).toHaveTextContent('伤害分配');
        expect(screen.getByTestId('betrayal-damage-allocation-source')).toHaveTextContent('火炉房');
        expect(screen.getByTestId('betrayal-damage-allocation-amount')).toHaveTextContent('1 点物理伤害');
        expect(screen.getByTestId('betrayal-damage-allocation-traits')).toHaveTextContent('力量');
        expect(screen.getByTestId('betrayal-damage-allocation-traits')).toHaveTextContent('速度');
        expect(screen.getByTestId('betrayal-damage-allocation-confirm')).toBeDisabled();

        fireEvent.click(screen.getByTestId('betrayal-damage-allocation-trait-speed-increase'));
        expect(screen.getByTestId('betrayal-damage-allocation-confirm')).not.toBeDisabled();
        expect(screen.getByTestId('betrayal-damage-allocation-trait-speed')).toHaveAttribute('data-trait-preview-step-count', '1');

        fireEvent.click(screen.getByTestId('betrayal-damage-allocation-confirm'));

        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('火炉房');
        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('分配');
    });

    it('胸针在伤害分配页可以把物理伤害改为通用伤害', () => {
        let core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.currentExplorer = {
            ...core.currentExplorer,
            inventory: [{ id: 'brooch', name: '胸针', kind: 'item' }],
        };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['brooch'];
        core = setBoardTraitTrack(core, '0', 'might', [1, 2, 3, 4], 2, 2);
        core = setBoardTraitTrack(core, '0', 'speed', [1, 2, 3, 4], 2, 2);
        core = setBoardTraitTrack(core, '0', 'knowledge', [1, 2, 3, 4], 2, 2);
        core = setBoardTraitTrack(core, '0', 'sanity', [1, 2, 3, 4], 2, 2);
        core.pendingDamageAllocation = {
            id: 'board-brooch-physical-damage',
            playerId: '0',
            sourceTitle: '测试物理伤害',
            damageKind: 'physical',
            amount: 1,
            originalAmount: 1,
            allowedTraits: ['might', 'speed'],
            allowSkull: false,
            traitsBeforeDamage: { ...core.currentExplorer.traits },
            damageReplacement: {
                kind: 'brooch-general-damage',
                cardId: 'brooch',
                cardName: '胸针',
            },
        };
        const dispatch = vi.fn();

        renderBoardWithDispatch(core, dispatch, {
            playerID: '0',
            matchData: defaultMatchData,
        });

        const broochToggle = screen.getByTestId('betrayal-damage-allocation-brooch-toggle');
        const traits = within(screen.getByTestId('betrayal-damage-allocation-traits'));
        expect(broochToggle).toHaveAttribute('data-brooch-active', 'false');
        expect(broochToggle).toHaveTextContent('使用胸针改为通用伤害');
        expect(traits.getByText('力量')).toBeInTheDocument();
        expect(traits.getByText('速度')).toBeInTheDocument();
        expect(traits.queryByText('知识')).not.toBeInTheDocument();
        expect(traits.queryByText('神志')).not.toBeInTheDocument();

        fireEvent.click(broochToggle);

        expect(broochToggle).toHaveAttribute('data-brooch-active', 'true');
        expect(screen.getByTestId('betrayal-damage-allocation-brooch-note')).toHaveTextContent(
            '改为通用伤害后，可从力量、速度、知识、神志中分配。',
        );
        expect(screen.getByTestId('betrayal-damage-allocation-amount')).toHaveTextContent('1 点一般伤害');
        expect(traits.getByText('知识')).toBeInTheDocument();
        expect(traits.getByText('神志')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('betrayal-damage-allocation-trait-knowledge-increase'));
        expect(screen.getByTestId('betrayal-damage-allocation-confirm')).not.toBeDisabled();
        fireEvent.click(screen.getByTestId('betrayal-damage-allocation-confirm'));

        expect(dispatch).toHaveBeenCalledWith(BETRAYAL_COMMANDS.RESOLVE_DAMAGE_ALLOCATION, {
            traits: ['knowledge'],
            useBrooch: true,
        });
    });

    it('盔甲物理减伤会在伤害分配页显示原始伤害和实际分配', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.currentExplorer = {
            ...core.currentExplorer,
            inventory: [{ id: 'armor', name: '盔甲', kind: 'omen' }],
        };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['armor'];
        core.pendingDamageAllocation = {
            id: 'board-armor-physical-damage',
            playerId: '0',
            sourceTitle: '测试物理伤害',
            damageKind: 'physical',
            amount: 1,
            originalAmount: 2,
            allowedTraits: ['might', 'speed'],
            allowSkull: false,
            traitsBeforeDamage: { ...core.currentExplorer.traits },
        };
        const dispatch = vi.fn();

        renderBoardWithDispatch(core, dispatch, {
            playerID: '0',
            matchData: defaultMatchData,
        });

        expect(screen.getByTestId('betrayal-damage-allocation-amount')).toHaveTextContent('1 点物理伤害');
        expect(screen.getByTestId('betrayal-damage-allocation-reduction')).toHaveTextContent('原始 2 点物理伤害');
        expect(screen.getByTestId('betrayal-damage-allocation-reduction')).toHaveTextContent('盔甲减免 1 点');

        fireEvent.click(screen.getByTestId('betrayal-damage-allocation-trait-speed-increase'));
        expect(screen.getByTestId('betrayal-damage-allocation-confirm')).not.toBeDisabled();
        fireEvent.click(screen.getByTestId('betrayal-damage-allocation-confirm'));

        expect(dispatch).toHaveBeenCalledWith(BETRAYAL_COMMANDS.RESOLVE_DAMAGE_ALLOCATION, {
            traits: ['speed'],
        });
    });

    it('头戴耳机精神减伤会在伤害分配页显示原始伤害和实际分配', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.currentExplorer = {
            ...core.currentExplorer,
            inventory: [{ id: 'radio', name: '头戴耳机', kind: 'item' }],
        };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['radio'];
        core.pendingDamageAllocation = {
            id: 'board-radio-mental-damage',
            playerId: '0',
            sourceTitle: '测试精神伤害',
            damageKind: 'mental',
            amount: 1,
            originalAmount: 2,
            allowedTraits: ['knowledge', 'sanity'],
            allowSkull: false,
            traitsBeforeDamage: { ...core.currentExplorer.traits },
        };
        const dispatch = vi.fn();

        renderBoardWithDispatch(core, dispatch, {
            playerID: '0',
            matchData: defaultMatchData,
        });

        expect(screen.getByTestId('betrayal-damage-allocation-amount')).toHaveTextContent('1 点精神伤害');
        expect(screen.getByTestId('betrayal-damage-allocation-reduction')).toHaveTextContent('原始 2 点精神伤害');
        expect(screen.getByTestId('betrayal-damage-allocation-reduction')).toHaveTextContent('头戴耳机减免 1 点');

        fireEvent.click(screen.getByTestId('betrayal-damage-allocation-trait-sanity-increase'));
        expect(screen.getByTestId('betrayal-damage-allocation-confirm')).not.toBeDisabled();
        fireEvent.click(screen.getByTestId('betrayal-damage-allocation-confirm'));

        expect(dispatch).toHaveBeenCalledWith(BETRAYAL_COMMANDS.RESOLVE_DAMAGE_ALLOCATION, {
            traits: ['sanity'],
        });
    });

    it('洗衣滑槽会提示结束回合移动到地下室起始点', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        const chuteRoom = core.rooms.find((room) => room.id === 'upper-landing')!;
        chuteRoom.name = '洗衣滑槽';
        chuteRoom.visualId = 'laundryChute';
        chuteRoom.endTurnEffect = 'moveToBasementLanding';
        core.currentExplorer.roomId = 'upper-landing';
        core.activeRoomId = 'upper-landing';

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        expect(screen.getByTestId('betrayal-room-end-turn-effect-status')).toHaveTextContent('洗衣滑槽');
        expect(screen.getByTestId('betrayal-room-end-turn-effect-status')).toHaveTextContent('地下室起始点');
        fireEvent.click(screen.getByTestId('betrayal-action-endTurn'));
        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('洗衣滑槽');
        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('地下室起始点');
    });

    it('倒塌房间会提示结束回合速度检定并反馈坠落结算', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        const collapsedRoom = core.rooms.find((room) => room.id === 'upper-landing')!;
        collapsedRoom.name = '倒塌房间';
        collapsedRoom.visualId = 'collapsedRoom';
        collapsedRoom.endTurnEffect = 'speedCheckFallToBasement';
        core.currentExplorer.roomId = 'upper-landing';
        core.activeRoomId = 'upper-landing';
        core.currentExplorer.traits.speed = 1;

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        expect(screen.getByTestId('betrayal-room-end-turn-effect-status')).toHaveTextContent('倒塌房间');
        expect(screen.getByTestId('betrayal-room-end-turn-effect-status')).toHaveTextContent('投速度');
        expect(screen.getByTestId('betrayal-room-end-turn-effect-hint')).toHaveTextContent('结束回合检定');
        fireEvent.click(screen.getByTestId('betrayal-action-endTurn'));
        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('倒塌房间');
        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('坠落到地下室起始点');
    });

    it('能渲染首剧本真实 haunt 态的关键入口', () => {
        renderBoard(dismissBlockingBoardOverlays(createFirstScenarioHauntCore()), {
            playerID: '0',
            matchData: defaultMatchData.slice(0, 3),
        });

        expect(screen.getByTestId('betrayal-phase-chip')).toHaveTextContent('作祟中');
        expect(screen.queryByRole('region', { name: '阶段提示' })).not.toBeInTheDocument();
        expect(screen.queryByText('推荐动作：移动')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-action-move')).toHaveTextContent('移动');
        expect(screen.getByTestId('betrayal-action-explore')).toHaveTextContent('探索');
        expect(screen.getByTestId('betrayal-mobile-dock-explore')).toHaveTextContent('探索');
        expect(screen.queryByTestId('betrayal-explore-options')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-room-grid')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-open-scenario')).toBeInTheDocument();
    });

    it('顽石之血额外石像不足时必须在真实房间本体选择补放位置', async () => {
        const core = createBloodFromStoneManualPlacementBoardCore();

        render(
            <HarnessBoard
                initialCore={core}
                playerID="1"
                matchData={defaultMatchData.slice(0, 3)}
            />,
        );

        const placementAction = screen.getByTestId('betrayal-action-bloodFromStoneSetupPlacement');
        expect(placementAction).toHaveTextContent('选择石像房间');
        expect(placementAction).not.toBeDisabled();
        expect(screen.queryByTestId('betrayal-action-explore')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-action-bloodFromStoneConfirmSetupPlacement')).not.toBeInTheDocument();

        fireEvent.click(placementAction);

        const targetRoom = screen.getByTestId('betrayal-room-entrance-hall');
        expect(targetRoom).toHaveAttribute('data-direct-action', 'blood-from-stone-setup-placement');
        expect(screen.getByTestId('betrayal-room-blood-from-stone-setup-target-entrance-hall')).toHaveAttribute(
            'data-blood-from-stone-setup-selectable',
            'true',
        );
        expect(screen.getByTestId('betrayal-action-cue')).toHaveTextContent('点金色房间');

        fireEvent.click(targetRoom);

        expect(screen.getByTestId('betrayal-room-blood-from-stone-setup-count-entrance-hall')).toHaveTextContent('×1');
        const confirmAction = screen.getByTestId('betrayal-action-bloodFromStoneConfirmSetupPlacement');
        expect(confirmAction).toHaveTextContent('确认补放');
        expect(confirmAction).not.toBeDisabled();

        fireEvent.click(confirmAction);

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-room-monster-entrance-hall-stone-cherub-extra-3')).toBeInTheDocument();
        });
        expect(screen.queryByTestId('betrayal-action-bloodFromStoneSetupPlacement')).not.toBeInTheDocument();
        expectNoForbiddenPlayerUiInternalCopy();
    });

    it('魔法相机剧本真实页面能执行拍照并显示本质夺取反馈', async () => {
        let core = createMagicCameraHauntBoardCore('1');
        core = activateBoardExplorer(core, '1');
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'hallway',
            traits: { ...core.currentExplorer.traits, speed: 6 },
        };
        core.activeRoomId = 'hallway';
        core.currentExplorerRoomId = 'hallway';
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core = placeOtherExplorerInBoardRoom(core, '0', 'hallway');

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                playerID="1"
                matchData={defaultMatchData.slice(0, 3)}
                diceResults={[3, 3, 3, 3, 3, 3]}
            />,
        );

        expect(screen.getByTestId('betrayal-action-use')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-action-use')).toHaveTextContent('拍摄队友二');
        expect(screen.getByTestId('betrayal-action-cue')).toHaveTextContent('夺取队友二的本质');
        expect(screen.getByTestId('betrayal-bottom-teammate-2')).toHaveTextContent('拍照');
        fireEvent.click(screen.getByTestId('betrayal-action-use'));

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('夺取本质');
            expect(screen.getByTestId('betrayal-recent-roll-detail')).toHaveTextContent('骰面合计');
        });
    });

    it('魔法相机剧本幻影摄影师攻击槽点击后才高亮视线目标', async () => {
        let core = createMagicCameraHauntBoardCore('1');
        core = activateBoardExplorer(core, '1');
        const magicCamera = core.scenarioRuntime.magicCamera!;
        const phantomPhotographerId = magicCamera.phantomPhotographerIds[0]!;
        core.scenarioRuntime.magicCamera = {
            ...magicCamera,
            heroEssencePlayerIds: [],
        };
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'hallway',
        };
        core.activeRoomId = 'hallway';
        core.currentExplorerRoomId = 'hallway';
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnEndedByDiscovery = false;
        core.otherExplorers = core.otherExplorers.map((explorer) => (
            explorer.playerId === '0' || explorer.playerId === '2'
                ? { ...explorer, roomId: 'entrance-hall' }
                : explorer
        ));
        core.monsters = core.monsters.map((monster) => (
            monster.id === phantomPhotographerId
                ? { ...monster, roomId: 'grand-staircase' }
                : monster
        ));
        core = completeMonsterPreparationForAttackSlot(core, phantomPhotographerId);
        const monsterActionPanel = resolveBetrayalMonsterActionPanel(core);
        expect(core.phase).toBe('haunt');
        expect(core.scenarioRuntime.hauntCardNumber).toBe(33);
        expect(core.scenarioRuntime.traitorPlayerId).toBe('1');
        expect(core.turnEndedByDiscovery).toBe(false);
        expect(monsterActionPanel.slots.find((slot) => slot.id === `attack:${phantomPhotographerId}`)).toMatchObject({
            kind: 'attack',
            enabled: true,
        });
        const phantomPhotographer = core.monsters.find((monster) => monster.id === phantomPhotographerId)!;
        expect(resolveMagicCameraPhantomAttackTargets(core, phantomPhotographer).map((target) => target.playerId).sort()).toEqual(['0', '2']);

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                playerID="1"
                matchData={defaultMatchData.slice(0, 3)}
                diceResults={[3, 3, 3, 3, 3, 3]}
            />,
        );

        expect(screen.getByTestId('betrayal-action-monsterAttack')).toHaveTextContent('幻影摄影师攻击');
        expect(screen.queryByTestId('betrayal-room-occupant-target-outline-entrance-hall-0')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-room-occupant-target-outline-entrance-hall-2')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-bottom-teammate-0')).not.toHaveTextContent('摄影师攻击');
        expect(screen.getByTestId('betrayal-bottom-teammate-2')).not.toHaveTextContent('摄影师攻击');

        fireEvent.click(screen.getByTestId('betrayal-action-monsterAttack'));

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-action-monsterAttack')).toHaveTextContent('取消攻击');
            expect(screen.getByTestId(`betrayal-room-monster-grand-staircase-${phantomPhotographerId}`)).toHaveAttribute(
                'data-direct-target',
                'true',
            );
            expect(screen.queryByTestId('betrayal-room-occupant-target-outline-entrance-hall-0')).not.toBeInTheDocument();
        });
        fireEvent.click(screen.getByTestId(`betrayal-room-monster-grand-staircase-${phantomPhotographerId}`));
        await waitFor(() => {
            expect(screen.getByTestId(`betrayal-room-monster-target-outline-grand-staircase-${phantomPhotographerId}`)).toHaveAttribute('data-highlight-role', 'source');
            expect(screen.getByTestId('betrayal-bottom-teammate-0')).toHaveTextContent('摄影师攻击');
            expect(screen.getByTestId('betrayal-bottom-teammate-2')).toHaveTextContent('摄影师攻击');
            expect(screen.getByTestId('betrayal-room-occupant-target-outline-entrance-hall-0')).toBeInTheDocument();
            expect(screen.getByTestId('betrayal-room-occupant-entrance-hall-0')).toHaveAttribute('data-direct-target', 'true');
        });
        fireEvent.click(screen.getByTestId('betrayal-room-occupant-entrance-hall-0'));

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('幻影摄影师');
            expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('神志攻击');
        });
    });

    it('普通怪物可从怪物动作槽点怪物再点同房英雄攻击', async () => {
        let core = createFirstScenarioHauntCore();
        const traitorId = core.scenarioRuntime.traitorPlayerId!;
        core = activateBoardExplorer(core, traitorId);
        core = dismissBlockingBoardOverlays(core);
        const [heroTarget, deadHero] = [core.currentExplorer, ...core.otherExplorers]
            .filter((explorer) => explorer.playerId !== traitorId);
        if (!heroTarget || !deadHero) {
            throw new Error('普通怪物 Board 测试夹具缺少英雄目标');
        }
        const monsterId = 'test-normal-monster';
        const roomId = 'entrance-hall';
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId,
        };
        core.otherExplorers = core.otherExplorers.map((explorer) => ({
            ...explorer,
            roomId,
        }));
        core.activeRoomId = roomId;
        core.currentExplorerRoomId = roomId;
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.scenarioRuntime.deadExplorerPlayerIds = [deadHero.playerId];
        core.monsters = [{
            id: monsterId,
            name: '测试怪物',
            portraitAsset: 'betrayal/monsters/spirit',
            tokenAsset: 'betrayal/tokens/monsters/ghost',
            roomId,
            might: 4,
            speed: 3,
            sanity: 4,
            knowledge: 4,
            damage: 1,
        }];
        core = completeMonsterPreparationForAttackSlot(core, monsterId);
        const monsterActionPanel = resolveBetrayalMonsterActionPanel(core);
        const normalAttackTargets = resolveBetrayalNormalMonsterAttackTargets(core, monsterId);

        expect(monsterActionPanel.slots.find((slot) => slot.id === `attack:${monsterId}`)).toMatchObject({
            kind: 'attack',
            command: BETRAYAL_COMMANDS.MONSTER_ATTACK_HERO,
            enabled: true,
        });
        expect(normalAttackTargets).toMatchObject({
            canResolveWithExistingCommand: true,
            targetPlayerIds: [heroTarget.playerId],
            contractGaps: [],
        });
        expect(normalAttackTargets?.targetPlayerIds).not.toContain(traitorId);
        expect(normalAttackTargets?.targetPlayerIds).not.toContain(deadHero.playerId);

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                playerID={traitorId}
                matchData={defaultMatchData.slice(0, 3)}
                diceResults={[3, 3, 3, 3, 1, 1, 1, 1]}
            />,
        );

        expect(screen.getByTestId('betrayal-action-monsterAttack')).toHaveTextContent('测试怪物攻击');
        expect(screen.queryByTestId(`betrayal-room-occupant-target-outline-${roomId}-${heroTarget.playerId}`)).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('betrayal-action-monsterAttack'));

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-action-monsterAttack')).toHaveTextContent('取消攻击');
            expect(screen.getByTestId(`betrayal-room-monster-${roomId}-${monsterId}`)).toHaveAttribute(
                'data-direct-target',
                'true',
            );
        });

        fireEvent.click(screen.getByTestId(`betrayal-room-monster-${roomId}-${monsterId}`));

        await waitFor(() => {
            expect(screen.getByTestId(`betrayal-room-occupant-${roomId}-${heroTarget.playerId}`)).toHaveAttribute('data-direct-target', 'true');
            expect(screen.getByTestId(`betrayal-room-occupant-target-outline-${roomId}-${heroTarget.playerId}`)).toHaveAttribute('data-highlight-shape', 'pentagon');
            expect(screen.getByTestId(`betrayal-bottom-teammate-${heroTarget.playerId}`)).toHaveTextContent('攻击');
            expect(screen.queryByTestId(`betrayal-room-occupant-target-outline-${roomId}-${traitorId}`)).not.toBeInTheDocument();
            expect(screen.queryByTestId(`betrayal-room-occupant-target-outline-${roomId}-${deadHero.playerId}`)).not.toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId(`betrayal-room-occupant-${roomId}-${heroTarget.playerId}`));

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('测试怪物');
            expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('测试怪物攻击');
        });
    });

    it('杰克之灵可从怪物动作槽点怪物再点同房英雄攻击', async () => {
        let core = createJackSpiritMovementRollReadyCore();
        const jackSpiritId = 'jack-spirit';
        core = dismissBlockingBoardOverlays(core);
        core = completeMonsterPreparationForAttackSlot(core, jackSpiritId);
        const jackSpiritRoomId = core.scenarioRuntime.jackSpiritRoomId!;
        const traitorId = core.scenarioRuntime.traitorPlayerId!;
        const [heroTarget, deadHero] = [core.currentExplorer, ...core.otherExplorers]
            .filter((explorer) => explorer.playerId !== traitorId);
        if (!heroTarget || !deadHero) {
            throw new Error('杰克之灵 Board 测试夹具缺少英雄目标');
        }
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: jackSpiritRoomId,
        };
        core.otherExplorers = core.otherExplorers.map((explorer) => ({
            ...explorer,
            roomId: jackSpiritRoomId,
        }));
        core.activeRoomId = core.currentExplorer.roomId;
        core.currentExplorerRoomId = core.currentExplorer.roomId;
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.scenarioRuntime.deadExplorerPlayerIds = Array.from(new Set([
            ...core.scenarioRuntime.deadExplorerPlayerIds,
            deadHero.playerId,
        ]));
        const monsterActionPanel = resolveBetrayalMonsterActionPanel(core);
        const normalAttackTargets = resolveBetrayalNormalMonsterAttackTargets(core, jackSpiritId);

        expect(core.phase).toBe('haunt');
        expect(core.currentExplorer.playerId).toBe('2');
        expect(core.scenarioRuntime.jackSpiritReleased).toBe(true);
        expect(monsterActionPanel.slots.find((slot) => slot.id === `attack:${jackSpiritId}`)).toMatchObject({
            kind: 'attack',
            enabled: true,
        });
        expect(normalAttackTargets).toMatchObject({
            canResolveWithExistingCommand: true,
            targetPlayerIds: [heroTarget.playerId],
            contractGaps: [],
        });
        expect(normalAttackTargets?.targetPlayerIds).not.toContain(traitorId);
        expect(normalAttackTargets?.targetPlayerIds).not.toContain(deadHero.playerId);

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                playerID="2"
                matchData={defaultMatchData.slice(0, 3)}
                diceResults={[3, 3, 3, 3, 1, 1, 1, 1]}
            />,
        );

        expect(screen.getByTestId('betrayal-action-monsterAttack')).toHaveTextContent('杰克之灵攻击');
        expect(screen.queryByTestId(`betrayal-room-occupant-target-outline-${jackSpiritRoomId}-${heroTarget.playerId}`)).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('betrayal-action-monsterAttack'));

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-action-monsterAttack')).toHaveTextContent('取消攻击');
            expect(screen.getByTestId(`betrayal-room-monster-${jackSpiritRoomId}-${jackSpiritId}`)).toHaveAttribute(
                'data-direct-target',
                'true',
            );
        });

        fireEvent.click(screen.getByTestId(`betrayal-room-monster-${jackSpiritRoomId}-${jackSpiritId}`));

        await waitFor(() => {
            expect(screen.getByTestId(`betrayal-room-occupant-${jackSpiritRoomId}-${heroTarget.playerId}`)).toHaveAttribute('data-direct-target', 'true');
            expect(screen.getByTestId(`betrayal-room-occupant-target-outline-${jackSpiritRoomId}-${heroTarget.playerId}`)).toHaveAttribute('data-highlight-shape', 'pentagon');
            expect(screen.getByTestId(`betrayal-bottom-teammate-${heroTarget.playerId}`)).toHaveTextContent('攻击');
            expect(screen.queryByTestId(`betrayal-room-occupant-target-outline-${jackSpiritRoomId}-${traitorId}`)).not.toBeInTheDocument();
            expect(screen.queryByTestId(`betrayal-room-occupant-target-outline-${jackSpiritRoomId}-${deadHero.playerId}`)).not.toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId(`betrayal-room-occupant-${jackSpiritRoomId}-${heroTarget.playerId}`));

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('杰克之灵');
            expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('攻击投骰');
        });
    });

    it('击晕怪物在房间 token 显示翻面状态并开回合后恢复跳过', async () => {
        let core = createMagicCameraHauntBoardCore('1');
        core = activateBoardExplorer(core, '1');
        const stunnedMonsterId = core.scenarioRuntime.magicCamera!.phantomPhotographerIds[0]!;
        core.scenarioRuntime.magicCamera = {
            ...core.scenarioRuntime.magicCamera!,
            stunnedPhantomPhotographerIds: [stunnedMonsterId],
        };
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'hallway',
        };
        core.activeRoomId = 'hallway';
        core.currentExplorerRoomId = 'hallway';
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.monsters = core.monsters
            .filter((monster) => monster.id === stunnedMonsterId)
            .map((monster) => ({ ...monster, roomId: 'hallway' }));
        const monsterActionPanel = resolveBetrayalMonsterActionPanel(core);
        expect(monsterActionPanel.slots.find((slot) => slot.id === `turn-start:${stunnedMonsterId}`)).toMatchObject({
            kind: 'turn-start',
            enabled: true,
        });

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                playerID="1"
                matchData={defaultMatchData.slice(0, 3)}
            />,
        );

        expect(screen.getByTestId(`betrayal-room-monster-hallway-${stunnedMonsterId}`)).toHaveAttribute(
            'data-monster-status',
            'stunned',
        );
        expect(screen.getByTestId(`betrayal-monster-board-token-${stunnedMonsterId}`)).toHaveAttribute(
            'data-monster-status',
            'stunned',
        );
        expect(screen.getByTestId(`betrayal-monster-board-token-status-${stunnedMonsterId}`)).toHaveTextContent('击晕');
        expect(screen.getByTestId('betrayal-action-monsterTurnStart')).toHaveTextContent('幻影摄影师开回合');

        fireEvent.click(screen.getByTestId('betrayal-action-monsterTurnStart'));

        await waitFor(() => {
            expect(screen.getByTestId(`betrayal-room-monster-hallway-${stunnedMonsterId}`)).toHaveAttribute(
                'data-monster-status',
                'active',
            );
            expect(screen.queryByTestId(`betrayal-monster-board-token-status-${stunnedMonsterId}`)).not.toBeInTheDocument();
            expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('翻回正面');
            expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('跳过');
            expect(screen.queryByTestId('betrayal-action-monsterMovementRoll')).not.toBeInTheDocument();
            expect(screen.queryByTestId('betrayal-action-monsterAttack')).not.toBeInTheDocument();
        });
    });

    it('魔法相机剧本幻影摄影师可从通用怪物动作槽掷骰并移动', async () => {
        let core = createMagicCameraHauntBoardCore('1');
        core = activateBoardExplorer(core, '1');
        const magicCamera = core.scenarioRuntime.magicCamera!;
        const phantomPhotographerId = magicCamera.phantomPhotographerIds[0]!;
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'grand-staircase',
        };
        core.activeRoomId = 'grand-staircase';
        core.currentExplorerRoomId = 'grand-staircase';
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.monsters = core.monsters
            .filter((monster) => monster.id === phantomPhotographerId)
            .map((monster) => ({ ...monster, roomId: 'hallway' }));
        const targetRoom = resolveBetrayalMonsterMoveTargetRooms(core, phantomPhotographerId)[0];
        expect(targetRoom).toBeDefined();

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                playerID="1"
                matchData={defaultMatchData.slice(0, 3)}
                diceResults={[1, 1, 1, 1, 1, 1]}
            />,
        );

        expect(screen.getByTestId('betrayal-action-monsterTurnStart')).toHaveTextContent('幻影摄影师开回合');
        fireEvent.click(screen.getByTestId('betrayal-action-monsterTurnStart'));

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-action-monsterMovementRoll')).toHaveTextContent('幻影摄影师移动骰');
        });
        fireEvent.click(screen.getByTestId('betrayal-action-monsterMovementRoll'));

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('幻影摄影师移动');
        });
        fireEvent.click(screen.getByTestId('betrayal-roll-continue'));

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-action-monsterMove')).toHaveTextContent('移动幻影摄影师');
        });
        fireEvent.click(screen.getByTestId('betrayal-action-monsterMove'));

        expect(screen.getByTestId(`betrayal-room-monster-hallway-${phantomPhotographerId}`)).toHaveAttribute(
            'data-direct-target',
            'true',
        );
        expect(screen.getByTestId(`betrayal-room-monster-move-target-${targetRoom!.id}`)).toBeInTheDocument();

        fireEvent.click(screen.getByTestId(`betrayal-room-${targetRoom!.id}`));

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent(`移动到${targetRoom!.name}`);
        });
    });


    it('灰尘剧本真实页面能在恶兆板块寻找解药并放置研究标记', async () => {
        let core = createDustHauntBoardCore();
        core = placeCurrentExplorerInDustBoardRoom(core, {
            name: '画廊',
            visualId: 'gallery',
            discoveryReward: 'omen',
        });
        core = setCurrentExplorerBoardTraits(core, {
            knowledge: 5,
            sanity: 1,
        });

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                playerID="1"
                matchData={defaultMatchData.slice(0, 3)}
                diceResults={[3, 3, 3, 3, 3]}
            />,
        );

        expect(screen.getByTestId('betrayal-action-use')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-action-use')).toHaveTextContent('寻找解药');
        fireEvent.click(screen.getByTestId('betrayal-action-use'));

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('寻找解药');
            expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('研究标记');
        });

        await waitFor(() => {
            const marker = screen.getByTestId('betrayal-room-haunt-token-ground-north-dust-research-token-ground-north');
            expect(marker).toHaveTextContent('研');
            expect(marker).toHaveAttribute('data-token-kind', 'haunt-objective');
        });
    });

    it('灰尘剧本已用寻找解药后作祟入口显示统一预算禁用原因', () => {
        let core = createDustHauntBoardCore();
        core = placeCurrentExplorerInDustBoardRoom(core, {
            name: '画廊',
            visualId: 'gallery',
            discoveryReward: 'omen',
        });
        core.usedCardIdsThisTurn = ['search-for-cure'];
        core.recommendedAction = 'use';

        renderBoard(core, {
            playerID: '1',
            matchData: defaultMatchData.slice(0, 3),
        });

        const useAction = screen.getByTestId('betrayal-action-use');
        expect(useAction).toHaveTextContent('寻找解药');
        expect(useAction).toBeDisabled();
        expect(useAction).toHaveAttribute('data-action-disabled-reason', '本回合已使用该作祟特殊行动');
        expect(useAction).toHaveAttribute('title', '本回合已使用该作祟特殊行动');
        expect(screen.getByTestId('betrayal-action-cue')).toHaveTextContent('本回合已使用该作祟特殊行动');
    });

    it('灰尘剧本真实页面必须点击同房探索者 token 才会发起疾病标记交换', async () => {
        let core = createDustHauntBoardCore();
        core = placeCurrentExplorerInDustBoardRoom(core, {
            roomId: 'hallway',
            name: '门厅',
            visualId: 'startHallway',
            discoveryReward: null,
        });
        core = placeOtherExplorerInBoardRoom(core, '0', 'hallway');
        core.recommendedAction = 'trade';
        dismissBlockingBoardOverlays(core);
        const sicknessExchangeTargetName = core.otherExplorers.find((explorer) => explorer.playerId === '0')!.displayName;

        render(
            <HarnessBoard
                initialCore={core}
                playerID="1"
                matchData={defaultMatchData.slice(0, 3)}
            />,
        );

        expect(screen.getByTestId('betrayal-action-trade')).toHaveTextContent('交换疾病');
        fireEvent.click(screen.getByTestId('betrayal-action-trade'));
        expect(screen.queryByTestId('betrayal-sickness-exchange-banner')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-trade-flow-banner')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-action-use')).toHaveAttribute('data-haunt-targeting-status', 'true');
        expect(screen.getByTestId('betrayal-action-cue')).toHaveTextContent(sicknessExchangeTargetName);
        expect(screen.getByTestId('betrayal-room-occupant-target-cue-hallway-0')).toHaveTextContent(`点${sicknessExchangeTargetName}交换疾病`);
        const desktopCancelTargetButton = screen.getAllByTestId('betrayal-haunt-target-cancel')[0];
        expect(desktopCancelTargetButton).toHaveStyle({
            bottom: '0px',
            left: '50%',
            position: 'absolute',
            transform: 'translateX(208px)',
        });

        const targetToken = screen.getByTestId('betrayal-room-occupant-hallway-0');
        expect(targetToken).toHaveAttribute('data-direct-target', 'true');
        fireEvent.click(targetToken);

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-sickness-exchange-banner')).toHaveAttribute('data-sickness-exchange-state', 'waiting');
            expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('请求交换疾病标记');
        });
    });

    it('灰尘剧本攻击同房探索者时必须先点攻击入口，再点击探索者 token', async () => {
        let core = createDustHauntBoardCore();
        core = placeCurrentExplorerInDustBoardRoom(core, {
            roomId: 'hallway',
            name: '门厅',
            visualId: 'startHallway',
            discoveryReward: null,
        });
        core = placeOtherExplorerInBoardRoom(core, '0', 'hallway');
        core.recommendedAction = 'attack';
        dismissBlockingBoardOverlays(core);

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                playerID="1"
                matchData={defaultMatchData.slice(0, 3)}
                diceResults={[3, 3, 3, 3, 3, 0, 0, 0]}
            />,
        );

        const targetToken = screen.getByTestId('betrayal-room-occupant-hallway-0');
        expect(targetToken).not.toHaveAttribute('data-direct-target', 'true');
        expect(screen.getByTestId('betrayal-action-use')).toHaveTextContent('攻击灰尘');

        fireEvent.click(screen.getByTestId('betrayal-action-use'));
        expect(screen.getByTestId('betrayal-action-use')).toHaveAttribute(
            'data-haunt-targeting-status',
            'true',
        );
        expect(screen.queryByTestId('betrayal-trade-flow-banner')).not.toBeInTheDocument();
        const desktopCancelTargetButton = screen.getAllByTestId('betrayal-haunt-target-cancel')[0];
        expect(desktopCancelTargetButton).toHaveStyle({
            bottom: '0px',
            left: '50%',
            position: 'absolute',
            transform: 'translateX(208px)',
        });

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-room-occupant-hallway-0')).toHaveAttribute('data-direct-target', 'true');
        });
        fireEvent.click(screen.getByTestId('betrayal-room-occupant-hallway-0'));

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-attack-roll-review')).toBeInTheDocument();
        });
    });

    it('灰尘剧本真实页面能由交换目标同意疾病标记交换', async () => {
        let core = createDustHauntBoardCore();
        core = placeCurrentExplorerInDustBoardRoom(core, {
            roomId: 'hallway',
            name: '门厅',
            visualId: 'startHallway',
            discoveryReward: null,
        });
        core = placeOtherExplorerInBoardRoom(core, '0', 'hallway');
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.REQUEST_SICKNESS_EXCHANGE, '1', {
            targetPlayerId: '0',
        });

        render(
            <HarnessBoard
                initialCore={core}
                playerID="0"
                matchData={defaultMatchData.slice(0, 3)}
            />,
        );

        expect(screen.getByTestId('betrayal-sickness-exchange-banner')).toHaveAttribute('data-sickness-exchange-state', 'incoming');
        fireEvent.click(screen.getByTestId('betrayal-sickness-exchange-accept'));

        await waitFor(() => {
            expect(screen.queryByTestId('betrayal-sickness-exchange-banner')).not.toBeInTheDocument();
            expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('同意了');
        });
    });

    it('能渲染首剧本真实终局屏', () => {
        renderBoard(playFirstScenarioToSurvivorVictory(), {
            playerID: '0',
            matchData: defaultMatchData.slice(0, 3),
        });

        if (screen.queryByTestId('betrayal-exorcise-roll-continue')) {
            fireEvent.click(screen.getByTestId('betrayal-exorcise-roll-continue'));
        }

        expect(screen.getByTestId('betrayal-endgame-screen')).toBeInTheDocument();
        const endgameMain = screen.getByTestId('betrayal-endgame-screen');
        expect(screen.getByTestId('betrayal-endgame-ending-stage')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-endgame-ending-narration')).toHaveTextContent('结局朗读');
        expect(screen.getByTestId('betrayal-endgame-ending-narration')).toHaveAttribute('data-cinematic-narration', 'ending-survivors');
        expect(screen.getByTestId('betrayal-endgame-ending-narration')).toHaveAttribute('data-cinematic-stage', 'standalone');
        expect(screen.queryByTestId('betrayal-endgame-result-report')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-endgame-ending-narration')).toHaveTextContent('杰克之灵消失');

        fireEvent.click(screen.getByTestId('betrayal-endgame-ending-continue'));

        expect(screen.queryByTestId('betrayal-endgame-ending-narration')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-endgame-result-report')).toBeInTheDocument();
        expect(screen.getAllByText('幸存者逃脱').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Crimson Jack Returns').length).toBeGreaterThan(0);
        expect(endgameMain).not.toHaveTextContent('总点数 8');
        expect(within(endgameMain).getByText('测试玩家')).toBeInTheDocument();
        expect(within(endgameMain).getByText('队友一')).toBeInTheDocument();
        expect(endgameMain.querySelector('[data-trait-value-shape="square"]')).toBeInTheDocument();
    });

    it('木乃伊英雄终局朗读使用英雄结局正文而不是翻译键', () => {
        renderBoard(playMummyScenarioToSurvivorVictory(), {
            playerID: '0',
            matchData: defaultMatchData.slice(0, 3),
        });

        if (screen.queryByTestId('betrayal-exorcise-roll-continue')) {
            fireEvent.click(screen.getByTestId('betrayal-exorcise-roll-continue'));
        }

        const narration = screen.getByTestId('betrayal-endgame-ending-narration');
        expect(screen.getByTestId('betrayal-endgame-ending-stage')).toBeInTheDocument();
        expect(narration).toHaveTextContent('木乃伊犹如细砂随风飞散');
        expect(narration).not.toHaveTextContent('board.haunts.mummyRampage.reader.endingSurvivors');
        expect(screen.queryByTestId('betrayal-endgame-ending-source-status')).not.toBeInTheDocument();
        expect(narration).not.toHaveTextContent('官方 If You Win 原文');
        expect(narration).not.toHaveTextContent('正式翻译');
    });

    it('木乃伊叛徒终局朗读使用叛徒结局正文', () => {
        renderBoard(playMummyScenarioToTraitorVictory(), {
            playerID: '2',
            matchData: defaultMatchData.slice(0, 3),
        });

        const narration = screen.getByTestId('betrayal-endgame-ending-narration');
        expect(screen.getByTestId('betrayal-endgame-ending-stage')).toBeInTheDocument();
        expect(narration).toHaveTextContent('整个世界不久都将臣服于我俩脚下');
        expect(narration).not.toHaveTextContent('board.haunts.mummyRampage.reader.endingTraitor');
        expect(screen.queryByTestId('betrayal-endgame-ending-source-status')).not.toBeInTheDocument();
        expect(narration).not.toHaveTextContent('官方 If You Win 原文');
        expect(narration).not.toHaveTextContent('正式翻译');
    });

    it('灰尘终局朗读显示英雄胜利正文且隐藏文本来源状态', () => {
        let core = createDustHauntBoardCore();
        core = placeCurrentExplorerInDustBoardRoom(core, {
            name: '画廊',
            visualId: 'gallery',
            discoveryReward: 'omen',
        });
        core.scenarioRuntime.dust!.researchRoomIds = ['ground-north', 'hallway'];
        core = setCurrentExplorerBoardTraits(core, { knowledge: 5 });
        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.CURE_THE_DUST,
            '1',
            { trait: 'knowledge' },
            100,
            createBetrayalScriptedRandom(3, 3, 3, 3, 3),
        );

        renderBoard(core, {
            playerID: '1',
            matchData: defaultMatchData.slice(0, 3),
        });

        const narration = screen.getByTestId('betrayal-endgame-ending-narration');
        expect(screen.getByTestId('betrayal-endgame-ending-stage')).toBeInTheDocument();
        expect(narration).toHaveTextContent('结局朗读');
        expect(narration).toHaveTextContent('你把临时做成的注射器扎进手臂');
        expect(screen.queryByTestId('betrayal-endgame-ending-source-status')).not.toBeInTheDocument();
        expect(narration).not.toHaveTextContent('官方 If You Win 原文');
        expect(narration).not.toHaveTextContent('正式翻译');
        expect(narration).not.toHaveTextContent('非原文摘要');

        fireEvent.click(screen.getByTestId('betrayal-endgame-ending-continue'));

        expect(screen.getByTestId('betrayal-endgame-result-report')).toBeInTheDocument();
        expect(screen.getAllByText('幸存者逃脱').length).toBeGreaterThan(0);
        expect(screen.getAllByText('灰尘').length).toBeGreaterThan(0);
    });

    it('叛徒攻击同房英雄时必须先点攻击入口，再点击英雄对象', async () => {
        render(
            <HarnessBoard
                initialCore={createJackSpiritPostReviveAttackReadyCore()}
                playerID="2"
                matchData={defaultMatchData.slice(0, 3)}
            />,
        );

        expect(screen.queryByTestId('betrayal-room-focus-target')).not.toBeInTheDocument();
        const heroToken = screen.getByTestId('betrayal-room-occupant-basement-east-0');
        expect(heroToken).not.toHaveAttribute('data-direct-target', 'true');

        expect(screen.getByTestId('betrayal-action-use')).toHaveAttribute(
            'data-haunt-primary-action-kind',
            'attack-hero',
        );
        expect(screen.getByTestId('betrayal-action-use')).toHaveTextContent(/攻击英雄|Attack hero/);
        expect(screen.getByTestId('betrayal-action-use')).not.toHaveTextContent(/测试玩家|队友/);
        fireEvent.click(screen.getByTestId('betrayal-action-use'));
        expect(screen.getByTestId('betrayal-action-use')).toHaveAttribute(
            'data-haunt-targeting-status',
            'true',
        );

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-room-occupant-basement-east-0')).toHaveAttribute('data-direct-target', 'true');
        });
        expect(screen.getByTestId('betrayal-room-occupant-target-outline-basement-east-0')).toHaveAttribute('data-highlight-shape', 'pentagon');
        fireEvent.click(screen.getByTestId('betrayal-room-occupant-basement-east-0'));
        await waitFor(() => {
            expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('扑向英雄');
        });
        await waitFor(() => {
            expect(screen.getByTestId('betrayal-attack-roll-review')).toBeInTheDocument();
        });
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('攻击投骰');
        expect(Number(screen.getByTestId('betrayal-house-dice-3d-group').getAttribute('data-dice-count'))).toBeGreaterThan(0);
    });

    it('头骨死亡保护会在真实页面显示死亡保护骰盘与最终存活反馈', () => {
        let core = createFirstScenarioHauntCore();
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'upper-landing' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'grand-staircase' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'hallway' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'ground-north' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, '0', {});
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '1', { roomId: 'hallway' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '1', { roomId: 'ground-north' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, '1', {});
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '2', { roomId: 'basement-landing' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '2', { roomId: 'grand-staircase' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '2', { roomId: 'hallway' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '2', { roomId: 'ground-north' });
        core.otherExplorers = core.otherExplorers.map((explorer) => (
            explorer.playerId === '0'
                ? { ...explorer, inventory: [{ id: 'skull', name: '头骨', kind: 'omen' }] }
                : explorer
        ));
        core = setBoardTraitTrack(core, '0', 'might', [1, 2], 1, 1);
        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.HAUNT_ATTACK,
            '2',
            { target: 'hero', targetPlayerId: '0' },
            100,
            createBetrayalScriptedRandom(3, 3, 3, 3, 3, 1, 1, 1, 1),
        );

        expect(core.pendingDamageAllocation).toMatchObject({
            playerId: '0',
            sourceTitle: '攻击',
            allowSkull: true,
        });

        const pendingRender = renderBoard(core, {
            playerID: '0',
            matchData: defaultMatchData.slice(0, 3),
        });
        expect(screen.getByTestId('betrayal-damage-allocation-panel')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-damage-allocation-source')).toHaveTextContent('攻击');
        pendingRender.unmount();

        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.RESOLVE_DAMAGE_ALLOCATION,
            '0',
            { traits: lethalDamageTraitsForPendingAllocation(core) },
            101,
            createBetrayalScriptedRandom(3, 3, 1),
        );

        renderBoard(core, {
            playerID: '0',
            matchData: defaultMatchData.slice(0, 3),
        });

        expect(screen.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute('data-dice-count', '3');
        expect(screen.getByTestId('betrayal-recent-roll-detail')).toHaveTextContent('骰面合计 4');
        expect(screen.getByTestId('betrayal-recent-roll-total')).toHaveTextContent('总点数 4');
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('阻止死亡');
        expect(screen.getAllByText('阻止死亡').length).toBeGreaterThan(0);
        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('头骨投出 4，阻止死亡');
    });

    it('砍刀会在真实页面攻击入口选择武器并等待叛徒分配攻击伤害', async () => {
        const core = createFirstScenarioHauntCore();
        const traitor = core.otherExplorers.find((explorer) => explorer.playerId === '2')!;
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'entrance-hall',
            inventory: [{ id: 'hunting-knife', name: '砍刀', kind: 'item' }],
        };
        core.otherExplorers = [
            { ...core.otherExplorers.find((explorer) => explorer.playerId === '1')! },
            { ...traitor, roomId: 'entrance-hall' },
        ];
        core.activeRoomId = 'entrance-hall';
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['hunting-knife'];
        dismissBlockingBoardOverlays(core);

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData.slice(0, 3)}
            />,
        );

        expect(screen.getByTestId('betrayal-attack-weapon-selector')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('betrayal-attack-weapon-hunting-knife'));
        fireEvent.click(screen.getByTestId('betrayal-action-use'));
        const traitorToken = screen.getByTestId('betrayal-room-occupant-entrance-hall-2');
        expect(traitorToken).toHaveAttribute('data-direct-target', 'true');
        expect(screen.getByTestId('betrayal-room-occupant-target-outline-entrance-hall-2')).toHaveAttribute('data-highlight-shape', 'pentagon');
        fireEvent.click(traitorToken);

        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('使用砍刀');
        await waitFor(() => {
            expect(screen.getByTestId('betrayal-damage-allocation-panel')).toHaveAttribute('data-player-id', '2');
        });
        expect(screen.getByTestId('betrayal-damage-allocation-source')).toHaveTextContent('攻击');
        expect(screen.getByTestId('betrayal-damage-allocation-amount')).toHaveTextContent('物理伤害');
        expect(screen.getByTestId('betrayal-damage-allocation-traits')).toHaveTextContent('力量');
        expect(screen.getByTestId('betrayal-damage-allocation-traits')).toHaveTextContent('速度');
        expect(screen.getByTestId('betrayal-damage-allocation-confirm')).toBeDisabled();
        expect(screen.getByTestId('betrayal-damage-allocation-confirm')).toHaveTextContent('等待');
    });

    it('攻击武器选择区保留刚获得和已使用武器并显示禁用原因', () => {
        const core = createFirstScenarioHauntCore();
        const traitor = core.otherExplorers.find((explorer) => explorer.playerId === '2')!;
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'entrance-hall',
            inventory: [
                { id: 'hunting-knife', name: '砍刀', kind: 'item' },
                { id: 'dagger', name: '匕首', kind: 'omen' },
                { id: 'ring', name: '指环', kind: 'omen' },
            ],
        };
        core.otherExplorers = [
            { ...core.otherExplorers.find((explorer) => explorer.playerId === '1')! },
            { ...traitor, roomId: 'entrance-hall' },
        ];
        core.activeRoomId = 'entrance-hall';
        core.currentExplorerInventory = core.currentExplorer.inventory.map((card) => ({ ...card }));
        core.turnStartInventoryCardIds = ['hunting-knife', 'ring'];
        core.usedCardIdsThisTurn = ['ring'];
        dismissBlockingBoardOverlays(core);

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData.slice(0, 3)}
            />,
        );

        expect(screen.getByTestId('betrayal-attack-weapon-selector')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-attack-weapon-none')).toHaveClass('underline');
        expect(screen.getByTestId('betrayal-attack-weapon-hunting-knife')).not.toBeDisabled();
        expect(screen.getByTestId('betrayal-attack-weapon-option-hunting-knife')).toHaveAttribute(
            'data-attack-weapon-can-use',
            'true',
        );
        expect(screen.getByTestId('betrayal-attack-weapon-dagger')).toBeDisabled();
        expect(screen.getByTestId('betrayal-attack-weapon-option-dagger')).toHaveAttribute(
            'data-attack-weapon-can-use',
            'false',
        );
        expect(screen.getByTestId('betrayal-attack-weapon-dagger-disabled-reason')).toHaveTextContent(
            '本回合新获得的武器不能立刻使用',
        );
        expect(screen.getByTestId('betrayal-attack-weapon-ring')).toBeDisabled();
        expect(screen.getByTestId('betrayal-attack-weapon-option-ring')).toHaveAttribute(
            'data-action-disabled-reason',
            '这把武器本回合已经使用。',
        );
        expect(screen.getByTestId('betrayal-attack-weapon-ring-disabled-reason')).toHaveTextContent(
            '这把武器本回合已经使用',
        );
    });

    it('皮夹克会在攻击投骰复盘显示防御额外骰', async () => {
        const core = createCrimsonJackHauntCore();
        const traitor = core.otherExplorers.find((explorer) => explorer.playerId === '2')!;
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'entrance-hall',
            inventory: [],
            traits: {
                ...core.currentExplorer.traits,
                might: 2,
            },
            traitTracks: {
                ...core.currentExplorer.traitTracks,
                might: createBoardHighCapacityTraitTrack('leather-jacket-attacker-might', 2),
            },
        };
        core.otherExplorers = [
            { ...core.otherExplorers.find((explorer) => explorer.playerId === '1')! },
            {
                ...traitor,
                roomId: 'entrance-hall',
                inventory: [{ id: 'leather-jacket', name: '皮夹克', kind: 'item' }],
                traits: {
                    ...traitor.traits,
                    might: 1,
                },
                traitTracks: {
                    ...traitor.traitTracks,
                    might: createBoardHighCapacityTraitTrack('leather-jacket-defender-might', 1),
                },
            },
        ];
        core.activeRoomId = 'entrance-hall';
        core.currentExplorerInventory = [];
        core.turnStartInventoryCardIds = [];
        dismissBlockingBoardOverlays(core);

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                matchData={defaultMatchData.slice(0, 3)}
                diceResults={[2, 2, 2, 2]}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-action-use'));
        const traitorToken = screen.getByTestId('betrayal-room-occupant-entrance-hall-2');
        expect(traitorToken).toHaveAttribute('data-direct-target', 'true');
        fireEvent.click(traitorToken);

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-attack-roll-review')).toBeInTheDocument();
        });
        expect(screen.getByTestId('betrayal-recent-roll-outcome')).toHaveTextContent('平手无伤害');
        expect(screen.getByTestId('betrayal-recent-roll-attack-comparison')).toHaveTextContent(
            /进攻总点 \d+ \/ 防御总点 \d+（防御额外 1 骰）/,
        );
    });

    it('叛徒攻击英雄后在牌桌等待受伤英雄分配攻击伤害', async () => {
        let core = createFirstScenarioHauntCore();
        core = activateBoardExplorer(core, '2');
        const hero = core.otherExplorers.find((explorer) => explorer.playerId === '0')!;
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'entrance-hall',
            traits: {
                ...core.currentExplorer.traits,
                might: 5,
            },
        };
        core.otherExplorers = core.otherExplorers.map((explorer) => (
            explorer.playerId === '0'
                ? {
                    ...hero,
                    roomId: 'entrance-hall',
                    traits: {
                        ...hero.traits,
                        might: 4,
                        speed: 4,
                    },
                    traitTracks: {
                        ...hero.traitTracks,
                        might: createBoardHighCapacityTraitTrack('board-hero-might'),
                        speed: createBoardHighCapacityTraitTrack('board-hero-speed'),
                    },
                }
                : explorer
        ));
        core.activeRoomId = 'entrance-hall';
        core.currentExplorerRoomId = 'entrance-hall';
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = core.currentExplorer.inventory.map((card) => ({ ...card }));
        core.turnStartInventoryCardIds = core.currentExplorer.inventory.map((card) => card.id);
        dismissBlockingBoardOverlays(core);

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                playerID="2"
                matchData={defaultMatchData.slice(0, 3)}
                diceResults={[3, 3, 3, 3, 3, 1, 1, 1, 1]}
            />,
        );

        expect(screen.getByTestId('betrayal-action-use')).toHaveAttribute(
            'data-haunt-primary-action-kind',
            'attack-hero',
        );
        fireEvent.click(screen.getByTestId('betrayal-action-use'));
        const heroToken = screen.getByTestId('betrayal-room-occupant-entrance-hall-0');
        expect(heroToken).toHaveAttribute('data-direct-target', 'true');
        fireEvent.click(heroToken);

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-damage-allocation-panel')).toHaveAttribute('data-player-id', '0');
        });
        expect(screen.getByTestId('betrayal-damage-allocation-source')).toHaveTextContent('攻击');
        expect(screen.getByTestId('betrayal-damage-allocation-amount')).toHaveTextContent('物理伤害');
        expect(screen.getByTestId('betrayal-damage-allocation-traits')).toHaveTextContent('力量');
        expect(screen.getByTestId('betrayal-damage-allocation-traits')).toHaveTextContent('速度');
        expect(screen.getByTestId('betrayal-damage-allocation-confirm')).toBeDisabled();
        expect(screen.getByTestId('betrayal-damage-allocation-confirm')).toHaveTextContent('等待');
    });

    it('匕首会在真实页面攻击入口选择武器并等待叛徒分配物理伤害', async () => {
        const core = createCrimsonJackHauntCore();
        const traitor = core.otherExplorers.find((explorer) => explorer.playerId === '2')!;
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'entrance-hall',
            inventory: [{ id: 'dagger', name: '匕首', kind: 'omen' }],
        };
        core.otherExplorers = [
            { ...core.otherExplorers.find((explorer) => explorer.playerId === '1')! },
            { ...traitor, roomId: 'entrance-hall' },
        ];
        core.activeRoomId = 'entrance-hall';
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['dagger'];
        dismissBlockingBoardOverlays(core);

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                matchData={defaultMatchData.slice(0, 3)}
                diceResults={[1, 1, 1, 1, 3, 1, 1, 1]}
            />,
        );

        expect(screen.getByTestId('betrayal-attack-weapon-selector')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('betrayal-attack-weapon-dagger'));
        fireEvent.click(screen.getByTestId('betrayal-action-use'));
        const traitorToken = screen.getByTestId('betrayal-room-occupant-entrance-hall-2');
        expect(traitorToken).toHaveAttribute('data-direct-target', 'true');
        expect(screen.getByTestId('betrayal-room-occupant-target-outline-entrance-hall-2')).toHaveAttribute('data-highlight-shape', 'pentagon');
        fireEvent.click(traitorToken);

        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('使用匕首');
        await waitFor(() => {
            expect(screen.getByTestId('betrayal-damage-allocation-panel')).toHaveAttribute('data-player-id', '2');
        });
        expect(screen.getByTestId('betrayal-damage-allocation-source')).toHaveTextContent('攻击');
        expect(screen.getByTestId('betrayal-damage-allocation-amount')).toHaveTextContent('物理伤害');
        expect(screen.getByTestId('betrayal-damage-allocation-traits')).toHaveTextContent('力量');
        expect(screen.getByTestId('betrayal-damage-allocation-traits')).toHaveTextContent('速度');
        expect(screen.getByTestId('betrayal-damage-allocation-confirm')).toBeDisabled();
        expect(screen.getByTestId('betrayal-damage-allocation-confirm')).toHaveTextContent('等待');
    });

    it('指环会在真实页面攻击入口选择武器并等待叛徒分配精神伤害', async () => {
        const core = createCrimsonJackHauntCore();
        const traitor = core.otherExplorers.find((explorer) => explorer.playerId === '2')!;
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'entrance-hall',
            inventory: [{ id: 'ring', name: '指环', kind: 'omen' }],
        };
        core.otherExplorers = [
            { ...core.otherExplorers.find((explorer) => explorer.playerId === '1')! },
            { ...traitor, roomId: 'entrance-hall' },
        ];
        core.activeRoomId = 'entrance-hall';
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['ring'];
        dismissBlockingBoardOverlays(core);

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                matchData={defaultMatchData.slice(0, 3)}
                diceResults={[2, 1, 1, 1, 1, 1, 1, 1]}
            />,
        );

        expect(screen.getByTestId('betrayal-attack-weapon-selector')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('betrayal-attack-weapon-ring'));
        fireEvent.click(screen.getByTestId('betrayal-action-use'));
        const traitorToken = screen.getByTestId('betrayal-room-occupant-entrance-hall-2');
        expect(traitorToken).toHaveAttribute('data-direct-target', 'true');
        expect(screen.getByTestId('betrayal-room-occupant-target-outline-entrance-hall-2')).toHaveAttribute('data-highlight-shape', 'pentagon');
        fireEvent.click(traitorToken);

        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('使用指环');
        await waitFor(() => {
            expect(screen.getByTestId('betrayal-damage-allocation-panel')).toHaveAttribute('data-player-id', '2');
        });
        expect(screen.getByTestId('betrayal-damage-allocation-source')).toHaveTextContent('攻击');
        expect(screen.getByTestId('betrayal-damage-allocation-amount')).toHaveTextContent('精神伤害');
        expect(screen.getByTestId('betrayal-damage-allocation-traits')).toHaveTextContent('知识');
        expect(screen.getByTestId('betrayal-damage-allocation-traits')).toHaveTextContent('神志');
        expect(screen.getByTestId('betrayal-damage-allocation-confirm')).toBeDisabled();
        expect(screen.getByTestId('betrayal-damage-allocation-confirm')).toHaveTextContent('等待');
    });

    it('枪会在真实页面选择武器后高亮并连线视线内非同房间叛徒', () => {
        const core = createCrimsonJackHauntCore();
        const traitor = core.otherExplorers.find((explorer) => explorer.playerId === '2')!;
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'grand-staircase',
            inventory: [{ id: 'gun', name: '枪', kind: 'item' }],
        };
        core.otherExplorers = [
            { ...core.otherExplorers.find((explorer) => explorer.playerId === '1')! },
            { ...traitor, roomId: 'entrance-hall' },
        ];
        core.activeRoomId = 'grand-staircase';
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['gun'];
        dismissBlockingBoardOverlays(core);

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData.slice(0, 3)}
            />,
        );

        expect(screen.getByTestId('betrayal-attack-weapon-selector')).toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-line-of-sight-overlay')).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId('betrayal-attack-weapon-gun'));
        fireEvent.click(screen.getByTestId('betrayal-action-use'));
        const traitorToken = screen.getByTestId('betrayal-room-occupant-entrance-hall-2');
        expect(traitorToken).toHaveAttribute('data-direct-target', 'true');
        expect(screen.getByTestId('betrayal-room-occupant-target-outline-entrance-hall-2')).toHaveAttribute('data-highlight-shape', 'pentagon');
        const lineOfSightLine = screen.getByTestId(
            'betrayal-line-of-sight-line-grand-staircase-entrance-hall-2',
        );
        expect(lineOfSightLine).toHaveAttribute(
            'data-line-of-sight-source-room',
            'grand-staircase',
        );
        expect(lineOfSightLine).toHaveAttribute(
            'data-line-of-sight-target-room',
            'entrance-hall',
        );
        expect(lineOfSightLine).toHaveAttribute('data-line-of-sight-weapon', 'gun');
        fireEvent.click(traitorToken);

        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('使用枪');
    });

    it('十字弓会高亮相邻板块目标但不画视线连线', () => {
        const core = createCrimsonJackHauntCore();
        const traitor = core.otherExplorers.find((explorer) => explorer.playerId === '2')!;
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'grand-staircase',
            inventory: [{ id: 'crossbow', name: '十字弓', kind: 'item' }],
        };
        core.otherExplorers = [
            { ...core.otherExplorers.find((explorer) => explorer.playerId === '1')! },
            { ...traitor, roomId: 'hallway' },
        ];
        core.activeRoomId = 'grand-staircase';
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['crossbow'];
        dismissBlockingBoardOverlays(core);

        render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData.slice(0, 3)}
            />,
        );

        expect(screen.getByTestId('betrayal-attack-weapon-selector')).toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-line-of-sight-overlay')).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId('betrayal-attack-weapon-crossbow'));
        fireEvent.click(screen.getByTestId('betrayal-action-use'));
        const traitorToken = screen.getByTestId('betrayal-room-occupant-hallway-2');
        expect(traitorToken).toHaveAttribute('data-direct-target', 'true');
        expect(screen.getByTestId('betrayal-room-occupant-target-outline-hallway-2')).toHaveAttribute('data-highlight-shape', 'pentagon');
        expect(screen.queryByTestId('betrayal-line-of-sight-overlay')).not.toBeInTheDocument();
        fireEvent.click(traitorToken);

        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('使用十字弓');
    });

    it('炸药会在真实页面选择当前或相邻板块目标并完成结算', () => {
        const core = createCrimsonJackHauntCore();
        const traitor = core.otherExplorers.find((explorer) => explorer.playerId === '2')!;
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'grand-staircase',
            inventory: [{ id: 'dynamite', name: '炸药', kind: 'item' }],
        };
        core.otherExplorers = [
            { ...core.otherExplorers.find((explorer) => explorer.playerId === '1')!, roomId: 'entrance-hall' },
            { ...traitor, roomId: 'entrance-hall' },
        ];
        core.activeRoomId = 'grand-staircase';
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['dynamite'];
        dismissBlockingBoardOverlays(core);

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                matchData={defaultMatchData.slice(0, 3)}
                diceResults={[3, 3, 3, 3]}
            />,
        );

        expect(screen.getByTestId('betrayal-attack-weapon-selector')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-attack-weapon-dynamite')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('betrayal-action-use'));

        expect(screen.getByTestId('betrayal-room-dynamite-target-card-highlight-grand-staircase')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-room-dynamite-target-card-highlight-hallway')).toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-room-dynamite-target-card-highlight-entrance-hall')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-room-hallway')).toHaveAttribute('data-direct-action', 'dynamite-room');
        expect(screen.getByTestId('betrayal-room-hallway')).toHaveAttribute('data-direct-target', 'true');
        expect(screen.queryByTestId('betrayal-room-occupant-target-outline-entrance-hall-2')).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('betrayal-room-hallway'));

        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('使用炸药攻击');
        expect(screen.queryByTestId('betrayal-room-dynamite-target-card-highlight-hallway')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-inventory-dynamite')).not.toBeInTheDocument();
    });

    it('普通投骰事件牌会在真实页面同屏承接牌面、骰盘和分支结果', async () => {
        const ordinaryRollEvents = [
            '标本剥制',
            '外星几何',
            '小丑房间',
            '咬一口！',
            '电话铃声',
            '小机器人',
            '嘎吱的木门',
            '最深的壁橱',
            '磁带播放器',
            '在你背后！',
            '一种怪异的感觉',
            '葬礼',
        ];

        for (const eventName of ordinaryRollEvents) {
            const eventCard = BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === eventName);
            expect(eventCard?.roll).toBeTruthy();

            const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
            core.drawOrder = ['event'];
            core.eventOrder = [eventCard!];
            core.currentExplorer = {
                ...core.currentExplorer,
                roomId: 'hallway',
                traits: {
                    ...core.currentExplorer.traits,
                    might: 4,
                    speed: 4,
                    knowledge: 4,
                    sanity: 4,
                },
                inventory: [],
            };
            core.activeRoomId = 'hallway';
            core.currentExplorerTraits = { ...core.currentExplorer.traits };
            core.currentExplorerInventory = [];
            setNextBoardDiscoveryRoom(core, 'ground', 'kitchen');

            const view = render(
                <HarnessBoardWithRandom
                    initialCore={core}
                    matchData={defaultMatchData}
                />,
            );

            fireEvent.click(screen.getByTestId('betrayal-action-explore'));
            fireEvent.click(screen.getByTestId('betrayal-room-ground-north'));
            await confirmPendingRoomPlacement({ confirmEventRoll: false });

            expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute(
                'aria-label',
                expect.stringContaining(eventName),
            );
            expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute(
                'data-card-testid',
                'betrayal-discovery-card-reveal',
            );
            expect(screen.queryByTestId('betrayal-discovery-top-banner')).not.toBeInTheDocument();
            expect(screen.queryByTestId('betrayal-discovery-top-banner-title')).not.toBeInTheDocument();
            expect(screen.queryByTestId('betrayal-discovery-top-banner-detail')).not.toBeInTheDocument();
            const discoveryDetailText = screen.getByTestId('betrayal-discovery-detail').textContent ?? '';
            expect(discoveryDetailText).toMatch(/检定|投|骰/);
            expect(
                eventCard!.roll!.branches.some((branch) => discoveryDetailText.includes(branch.label)),
            ).toBe(true);
            expect(screen.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute(
                'data-dice-count',
                String(eventCard!.roll!.kind === 'dice' ? eventCard!.roll!.dice : 4),
            );
            expect(screen.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute(
                'data-dice-preload-state',
                'none',
            );
            expect(screen.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute(
                'data-dice-surface-mode',
                'transparent-virtual',
            );
            expect(screen.queryByTestId('betrayal-house-dice-preloaded-faces')).not.toBeInTheDocument();
            expect(screen.getByTestId('betrayal-recent-roll-result-stage')).toHaveAttribute(
                'data-result-layout',
                'split-primary-total',
            );
            const rollOutcomeText = screen.getByTestId('betrayal-recent-roll-outcome').textContent ?? '';
            expect(eventCard!.roll!.branches.some((branch) => rollOutcomeText.includes(branch.label))).toBe(true);
            expect(screen.queryByTestId('betrayal-recent-roll-stage-surface')).not.toBeInTheDocument();
            expect(screen.getByTestId('betrayal-recent-roll-breakdown')).toBeInTheDocument();
            expect(screen.getByTestId('betrayal-recent-roll-subtotal')).toHaveTextContent('骰面合计');
            expect(screen.getByTestId('betrayal-recent-roll-passive-bonus')).toHaveTextContent('加值');

            view.unmount();
        }
    });

    it('不可能的房间会在真实页面承接神志检定、抽物品和精神伤害分支', async () => {
        const impossibleRoom = BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '不可能的房间');
        expect(impossibleRoom?.roll?.trait).toBe('sanity');

        const rewardCore = createBetrayalFoundationCore(['0', '1', '2', '3']);
        rewardCore.drawOrder = ['event'];
        rewardCore.eventOrder = [impossibleRoom!];
        rewardCore.possessionOrderByKind.item = [{ id: 'camera', name: '魔法相机', kind: 'item' }];
        rewardCore.currentExplorer = {
            ...rewardCore.currentExplorer,
            roomId: 'hallway',
            traits: {
                ...rewardCore.currentExplorer.traits,
                sanity: 4,
            },
            inventory: [],
        };
        rewardCore.activeRoomId = 'hallway';
        rewardCore.currentExplorerTraits = { ...rewardCore.currentExplorer.traits };
        rewardCore.currentExplorerInventory = [];
        setNextBoardDiscoveryRoom(rewardCore, 'ground', 'kitchen');

        const rewardView = render(
            <HarnessBoardWithRandom
                initialCore={rewardCore}
                matchData={defaultMatchData}
                diceResults={[3, 3, 3, 3]}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-action-explore'));
        fireEvent.click(screen.getByTestId('betrayal-room-ground-north'));
        await confirmPendingRoomPlacement({ confirmEventRoll: false });

        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute(
            'aria-label',
            expect.stringContaining('不可能的房间'),
        );
        expect(screen.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute('data-dice-count', '4');
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('神志检定');
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('总点数 8');
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('抽取一张物品卡');
        expectSingleEventEffectResolutionStep('抽取一张物品卡');
        await waitFor(() => {
            expect(within(screen.getByTestId('betrayal-inventory-row-item')).getByText('魔法相机')).toBeInTheDocument();
        }, { timeout: 20000 });
        rewardView.unmount();

        const damageCore = createBetrayalFoundationCore(['0', '1', '2', '3']);
        damageCore.drawOrder = ['event'];
        damageCore.eventOrder = [impossibleRoom!];
        damageCore.currentExplorer = {
            ...damageCore.currentExplorer,
            roomId: 'hallway',
            traits: {
                ...damageCore.currentExplorer.traits,
                sanity: 4,
            },
            inventory: [],
        };
        damageCore.activeRoomId = 'hallway';
        damageCore.currentExplorerTraits = { ...damageCore.currentExplorer.traits };
        damageCore.currentExplorerInventory = [];
        setNextBoardDiscoveryRoom(damageCore, 'ground', 'kitchen');

        render(
            <HarnessBoardWithRandom
                initialCore={damageCore}
                matchData={defaultMatchData}
                diceResults={[1, 1, 1, 3, 3]}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-action-explore'));
        fireEvent.click(screen.getByTestId('betrayal-room-ground-north'));
        await confirmPendingRoomPlacement({ confirmEventRoll: false });

        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute(
            'aria-label',
            expect.stringContaining('不可能的房间'),
        );
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('神志检定');
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('总点数 2');
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('受到一颗骰子的精神伤害');
        expectSingleEventEffectResolutionStep('受到一颗骰子的精神伤害');
    });

    it('断手会在真实页面承接可选伤害、抽物品和拒绝路径', async () => {
        const severedHand = BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '断手');
        expect(severedHand?.effect?.mode).toBe('optionalEffect');

        const declineCore = createBetrayalFoundationCore(['0', '1', '2', '3']);
        declineCore.drawOrder = ['event'];
        declineCore.eventOrder = [severedHand!];
        declineCore.currentExplorer = {
            ...declineCore.currentExplorer,
            roomId: 'hallway',
            inventory: [],
        };
        declineCore.activeRoomId = 'hallway';
        declineCore.currentExplorerInventory = [];
        setNextBoardDiscoveryRoom(declineCore, 'ground', 'kitchen');

        const declineView = render(
            <HarnessBoardWithRandom
                initialCore={declineCore}
                matchData={defaultMatchData}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-action-explore'));
        fireEvent.click(screen.getByTestId('betrayal-room-ground-north'));
        await confirmPendingRoomPlacement();

        expect(screen.getByTestId('betrayal-event-choice-panel')).toHaveAttribute('aria-label', '断手');
        expect(screen.getByTestId('betrayal-event-choice-card-front-atlas')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-event-choice-confirm')).toHaveTextContent('承受伤害并抽取物品');
        expect(screen.getByTestId('betrayal-event-choice-decline')).toHaveTextContent('不触碰断手');
        fireEvent.click(screen.getByTestId('betrayal-event-choice-decline'));

        expect(screen.queryByTestId('betrayal-event-choice-panel')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('无事发生');
        expectSingleEventEffectResolutionStep('无事发生');
        declineView.unmount();

        const acceptCore = createBetrayalFoundationCore(['0', '1', '2', '3']);
        acceptCore.drawOrder = ['event'];
        acceptCore.eventOrder = [severedHand!];
        acceptCore.possessionOrderByKind.item = [{ id: 'camera', name: '魔法相机', kind: 'item' }];
        acceptCore.currentExplorer = {
            ...acceptCore.currentExplorer,
            roomId: 'hallway',
            inventory: [],
        };
        acceptCore.activeRoomId = 'hallway';
        acceptCore.currentExplorerInventory = [];
        setNextBoardDiscoveryRoom(acceptCore, 'ground', 'kitchen');

        render(
            <HarnessBoardWithRandom
                initialCore={acceptCore}
                matchData={defaultMatchData}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-action-explore'));
        fireEvent.click(screen.getByTestId('betrayal-room-ground-north'));
        await confirmPendingRoomPlacement();

        expect(screen.getByTestId('betrayal-event-choice-panel')).toHaveAttribute('aria-label', '断手');
        fireEvent.click(screen.getByTestId('betrayal-event-choice-confirm'));

        expect(screen.queryByTestId('betrayal-event-choice-panel')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('受到 2 点物理伤害');
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('抽取一张物品卡');
        expectSingleEventEffectResolutionStep('受到 2 点物理伤害', '抽取一张物品卡');
        expect(within(screen.getByTestId('betrayal-inventory-row-item')).getByText('魔法相机')).toBeInTheDocument();
    });

    it('晦暗暴风夜会在真实页面承接知识检定、神志提升和精神伤害结果', async () => {
        const darkAndStormyNight = BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '晦暗暴风夜');
        expect(darkAndStormyNight?.roll?.trait).toBe('knowledge');

        const createDarkAndStormyNightCore = () => {
            const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
            core.drawOrder = ['event'];
            core.eventOrder = [darkAndStormyNight!];
            core.currentExplorer = {
                ...core.currentExplorer,
                roomId: 'hallway',
                traits: {
                    ...core.currentExplorer.traits,
                    knowledge: 4,
                    sanity: 4,
                },
                inventory: [],
            };
            core.activeRoomId = 'hallway';
            core.currentExplorerTraits = { ...core.currentExplorer.traits };
            core.currentExplorerInventory = [];
            setNextBoardDiscoveryRoom(core, 'ground', 'kitchen');
            return core;
        };

        const rewardView = render(
            <HarnessBoardWithRandom
                initialCore={createDarkAndStormyNightCore()}
                matchData={defaultMatchData}
                diceResults={[3, 3, 3, 3]}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-action-explore'));
        fireEvent.click(screen.getByTestId('betrayal-room-ground-north'));
        await confirmPendingRoomPlacement({ confirmEventRoll: false });

        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute(
            'aria-label',
            expect.stringContaining('晦暗暴风夜'),
        );
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('获得 1 点神志');
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('神志 +1');
        expect(screen.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute('data-dice-count', '4');
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('知识检定');
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('总点数 8');
        expectSingleEventEffectResolutionStep('神志 +1');
        rewardView.unmount();

        render(
            <HarnessBoardWithRandom
                initialCore={createDarkAndStormyNightCore()}
                matchData={defaultMatchData}
                diceResults={[1, 1, 1, 1]}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-action-explore'));
        fireEvent.click(screen.getByTestId('betrayal-room-ground-north'));
        await confirmPendingRoomPlacement({ confirmEventRoll: false });

        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute(
            'aria-label',
            expect.stringContaining('晦暗暴风夜'),
        );
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('受到 1 点精神伤害');
        expect(screen.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute('data-dice-count', '4');
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('知识检定');
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('总点数 0');
        expectSingleEventEffectResolutionStep('受到 1 点精神伤害');
    });

    it('技术难点会在真实页面按当前楼层放置到起始点并承接地下室精神伤害', async () => {
        const technicalDifficulties = BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '技术难点');
        expect(technicalDifficulties?.effect?.mode).toBe('placeExplorerInNextFloorStartingRoom');

        const createTechnicalDifficultiesCore = (
            roomId: 'hallway' | 'basement-landing',
            floor: 'ground' | 'basement',
            visualId: string,
        ) => {
            const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
            core.drawOrder = ['event'];
            core.eventOrder = [technicalDifficulties!];
            core.currentExplorer = {
                ...core.currentExplorer,
                roomId,
                traits: {
                    ...core.currentExplorer.traits,
                    knowledge: 4,
                    sanity: 4,
                },
                inventory: [],
            };
            core.activeRoomId = roomId;
            core.currentExplorerTraits = { ...core.currentExplorer.traits };
            core.currentExplorerInventory = [];
            setNextBoardDiscoveryRoom(core, floor, visualId);
            return core;
        };

        const groundView = render(
            <HarnessBoard
                initialCore={createTechnicalDifficultiesCore('hallway', 'ground', 'kitchen')}
                matchData={defaultMatchData}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-action-explore'));
        fireEvent.click(screen.getByTestId('betrayal-room-ground-north'));
        await confirmPendingRoomPlacement();

        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute(
            'aria-label',
            expect.stringContaining('技术难点'),
        );
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('放置到下一楼层起始点');
        expect(screen.getByTestId('betrayal-current-traits')).toHaveAttribute('data-room-id', 'basement-landing');
        expectSingleEventEffectResolutionStep('放置到下一楼层起始点');
        groundView.unmount();

        render(
            <HarnessBoard
                initialCore={createTechnicalDifficultiesCore('basement-landing', 'basement', 'undergroundCavern')}
                matchData={defaultMatchData}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-action-explore'));
        if (!screen.queryByTestId('betrayal-room-basement-east')) {
            fireEvent.click(screen.getByTestId('betrayal-room-floor-down'));
        }
        fireEvent.click(screen.getByTestId('betrayal-room-basement-east'));
        await confirmPendingRoomPlacement();

        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute(
            'aria-label',
            expect.stringContaining('技术难点'),
        );
        expect(screen.getByTestId('betrayal-current-traits')).toHaveAttribute('data-room-id', 'upper-landing');
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('放置到下一楼层起始点');
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('受到 1 点精神伤害');
        expectSingleEventEffectResolutionStep('放置到下一楼层起始点', '受到 1 点精神伤害');
    });

    it('禁忌知识会在真实页面承接神志检定、中档属性变化和低档精神伤害结果', async () => {
        const forbiddenKnowledge = BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '禁忌知识');
        expect(forbiddenKnowledge?.roll?.trait).toBe('sanity');

        const createForbiddenKnowledgeCore = () => {
            const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
            core.drawOrder = ['event'];
            core.eventOrder = [forbiddenKnowledge!];
            core.currentExplorer = {
                ...core.currentExplorer,
                roomId: 'hallway',
                traits: {
                    ...core.currentExplorer.traits,
                    knowledge: 4,
                    sanity: 4,
                },
                inventory: [],
            };
            core.activeRoomId = 'hallway';
            core.currentExplorerTraits = { ...core.currentExplorer.traits };
            core.currentExplorerInventory = [];
            setNextBoardDiscoveryRoom(core, 'ground', 'kitchen');
            return core;
        };

        const middleView = render(
            <HarnessBoardWithRandom
                initialCore={createForbiddenKnowledgeCore()}
                matchData={defaultMatchData}
                diceResults={[2, 2, 1, 1]}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-action-explore'));
        fireEvent.click(screen.getByTestId('betrayal-room-ground-north'));
        await confirmPendingRoomPlacement({ confirmEventRoll: false });

        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute(
            'aria-label',
            expect.stringContaining('禁忌知识'),
        );
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('获得 1 点知识并失去 1 点神志');
        expect(screen.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute('data-dice-count', '4');
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('神志检定');
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('总点数 2');
        expectSingleEventEffectResolutionStep('知识 +1', '神志 -1');
        middleView.unmount();

        render(
            <HarnessBoardWithRandom
                initialCore={createForbiddenKnowledgeCore()}
                matchData={defaultMatchData}
                diceResults={[1, 1, 1, 1, 2, 2]}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-action-explore'));
        fireEvent.click(screen.getByTestId('betrayal-room-ground-north'));
        await confirmPendingRoomPlacement({ confirmEventRoll: false });

        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute(
            'aria-label',
            expect.stringContaining('禁忌知识'),
        );
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('受到两颗骰子的精神伤害');
        expect(screen.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute('data-dice-count', '4');
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('神志检定');
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('总点数 0');
        expectSingleEventEffectResolutionStep('受到两颗骰子的精神伤害');
    });

    it('可怜的尤里克会在真实页面承接神志检定、知识提升和精神伤害结果', async () => {
        const poorYorick = BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '可怜的尤里克');
        expect(poorYorick?.roll?.trait).toBe('sanity');

        const rewardCore = createBetrayalFoundationCore(['0', '1', '2', '3']);
        rewardCore.drawOrder = ['event'];
        rewardCore.eventOrder = [poorYorick!];
        rewardCore.currentExplorer = {
            ...rewardCore.currentExplorer,
            roomId: 'hallway',
            traits: {
                ...rewardCore.currentExplorer.traits,
                knowledge: 4,
                sanity: 4,
            },
            inventory: [],
        };
        rewardCore.activeRoomId = 'hallway';
        rewardCore.currentExplorerTraits = { ...rewardCore.currentExplorer.traits };
        rewardCore.currentExplorerInventory = [];
        setNextBoardDiscoveryRoom(rewardCore, 'ground', 'kitchen');

        const rewardView = render(
            <HarnessBoardWithRandom
                initialCore={rewardCore}
                matchData={defaultMatchData}
                diceResults={[3, 3, 3, 3]}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-action-explore'));
        fireEvent.click(screen.getByTestId('betrayal-room-ground-north'));
        await confirmPendingRoomPlacement({ confirmEventRoll: false });

        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute(
            'aria-label',
            expect.stringContaining('可怜的尤里克'),
        );
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('获得 1 点知识');
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('知识 +1');
        expect(screen.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute('data-dice-count', '4');
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('神志检定');
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('总点数 8');
        expectSingleEventEffectResolutionStep('知识 +1');
        rewardView.unmount();

        const damageCore = createBetrayalFoundationCore(['0', '1', '2', '3']);
        damageCore.drawOrder = ['event'];
        damageCore.eventOrder = [poorYorick!];
        damageCore.currentExplorer = {
            ...damageCore.currentExplorer,
            roomId: 'hallway',
            traits: {
                ...damageCore.currentExplorer.traits,
                sanity: 4,
            },
            inventory: [],
        };
        damageCore.activeRoomId = 'hallway';
        damageCore.currentExplorerTraits = { ...damageCore.currentExplorer.traits };
        damageCore.currentExplorerInventory = [];
        setNextBoardDiscoveryRoom(damageCore, 'ground', 'kitchen');

        render(
            <HarnessBoardWithRandom
                initialCore={damageCore}
                matchData={defaultMatchData}
                diceResults={[1, 1, 1, 1]}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-action-explore'));
        fireEvent.click(screen.getByTestId('betrayal-room-ground-north'));
        await confirmPendingRoomPlacement({ confirmEventRoll: false });

        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute(
            'aria-label',
            expect.stringContaining('可怜的尤里克'),
        );
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('神志检定');
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('总点数 0');
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('受到 1 点精神伤害');
        expectSingleEventEffectResolutionStep('受到 1 点精神伤害');
    });

    it('着火的人会在真实页面承接神志检定和入口大厅移动结果', async () => {
        const burningMan = BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '着火的人');
        expect(burningMan?.roll?.trait).toBe('sanity');

        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.drawOrder = ['event'];
        core.eventOrder = [burningMan!];
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'hallway',
            traits: {
                ...core.currentExplorer.traits,
                sanity: 4,
            },
            inventory: [],
        };
        core.activeRoomId = 'hallway';
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = [];
        setNextBoardDiscoveryRoom(core, 'ground', 'kitchen');

        const moveView = render(
            <HarnessBoardWithRandom
                initialCore={core}
                matchData={defaultMatchData}
                diceResults={[2, 2, 1, 1]}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-action-explore'));
        fireEvent.click(screen.getByTestId('betrayal-room-ground-north'));
        await confirmPendingRoomPlacement({ confirmEventRoll: false });

        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute(
            'aria-label',
            expect.stringContaining('着火的人'),
        );
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('放置到入口大厅');
        expect(screen.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute('data-dice-count', '4');
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('神志检定');
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('总点数 2');
        expectSingleEventEffectResolutionStep('放置到入口大厅');
        await waitFor(() => {
            expect(screen.getByTestId('betrayal-current-traits')).toHaveAttribute('data-room-id', 'entrance-hall');
        }, { timeout: 20000 });
        moveView.unmount();

        const damageCore = createBetrayalFoundationCore(['0', '1', '2', '3']);
        damageCore.drawOrder = ['event'];
        damageCore.eventOrder = [burningMan!];
        damageCore.currentExplorer = {
            ...damageCore.currentExplorer,
            roomId: 'hallway',
            traits: {
                ...damageCore.currentExplorer.traits,
                sanity: 4,
            },
            inventory: [],
        };
        damageCore.activeRoomId = 'hallway';
        damageCore.currentExplorerTraits = { ...damageCore.currentExplorer.traits };
        damageCore.currentExplorerInventory = [];
        setNextBoardDiscoveryRoom(damageCore, 'ground', 'kitchen');

        render(
            <HarnessBoardWithRandom
                initialCore={damageCore}
                matchData={defaultMatchData}
                diceResults={[1, 1, 1, 1, 2, 2]}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-action-explore'));
        fireEvent.click(screen.getByTestId('betrayal-room-ground-north'));
        await confirmPendingRoomPlacement({ confirmEventRoll: false });

        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute(
            'aria-label',
            expect.stringContaining('着火的人'),
        );
        expect(screen.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute('data-dice-count', '4');
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('神志检定');
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('总点数 0');
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('受到一颗骰子的物理伤害和一颗骰子的精神伤害');
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('重新投掷 1 颗骰子，按合计值分配物理伤害');
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('重新投掷 1 颗骰子，按合计值分配精神伤害');
        expectSingleEventEffectResolutionStep(
            '受到一颗骰子的物理伤害和一颗骰子的精神伤害',
            '重新投掷 1 颗骰子，按合计值分配物理伤害',
            '重新投掷 1 颗骰子，按合计值分配精神伤害',
        );
    });

    it('无线电广播会在真实页面承接固定 2 骰、知识提升和精神伤害结果', async () => {
        const radio = BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '无线电广播');
        expect(radio?.roll?.kind).toBe('dice');
        expect(radio?.roll?.dice).toBe(2);
        expect(radio?.description).toBe('华盛顿展开了一次核物理打击');

        const rewardCore = createBetrayalFoundationCore(['0', '1', '2', '3']);
        rewardCore.drawOrder = ['event'];
        rewardCore.eventOrder = [radio!];
        rewardCore.currentExplorer = {
            ...rewardCore.currentExplorer,
            roomId: 'hallway',
            traits: {
                ...rewardCore.currentExplorer.traits,
                knowledge: 4,
            },
            inventory: [],
        };
        rewardCore.activeRoomId = 'hallway';
        rewardCore.currentExplorerTraits = { ...rewardCore.currentExplorer.traits };
        rewardCore.currentExplorerInventory = [];
        setNextBoardDiscoveryRoom(rewardCore, 'ground', 'kitchen');

        const rewardView = render(
            <HarnessBoardWithRandom
                initialCore={rewardCore}
                matchData={defaultMatchData}
                diceResults={[3, 3]}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-action-explore'));
        fireEvent.click(screen.getByTestId('betrayal-room-ground-north'));
        await confirmPendingRoomPlacement({ confirmEventRoll: false });

        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute(
            'aria-label',
            expect.stringContaining('无线电广播'),
        );
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('获得 1 点知识');
        expect(screen.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute('data-dice-count', '2');
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveAttribute('data-visible-dice-source', 'recent-roll');
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('总点数 4');
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('获得 1 点知识');
        rewardView.unmount();

        const damageCore = createBetrayalFoundationCore(['0', '1', '2', '3']);
        damageCore.drawOrder = ['event'];
        damageCore.eventOrder = [radio!];
        damageCore.currentExplorer = {
            ...damageCore.currentExplorer,
            roomId: 'hallway',
            traits: {
                ...damageCore.currentExplorer.traits,
                sanity: 4,
            },
            inventory: [],
        };
        damageCore.activeRoomId = 'hallway';
        damageCore.currentExplorerTraits = { ...damageCore.currentExplorer.traits };
        damageCore.currentExplorerInventory = [];
        setNextBoardDiscoveryRoom(damageCore, 'ground', 'kitchen');

        render(
            <HarnessBoardWithRandom
                initialCore={damageCore}
                matchData={defaultMatchData}
                diceResults={[1, 1]}
                finalizeEventRollDiceResults={[3]}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-action-explore'));
        fireEvent.click(screen.getByTestId('betrayal-room-ground-north'));
        await confirmPendingRoomPlacement({ confirmEventRoll: false });

        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute(
            'aria-label',
            expect.stringContaining('无线电广播'),
        );
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveAttribute('data-visible-dice-source', 'recent-roll');
        expect(screen.getByTestId('betrayal-recent-roll-outcome')).toHaveTextContent('受到一颗骰子的精神伤害');
        expect(screen.getByTestId('betrayal-recent-roll-total')).toHaveTextContent('总点数 0');
        expect(screen.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute('data-dice-count', '2');
        expect(screen.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute('data-dice-rule-subtotal', '0');
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('受到一颗骰子的精神伤害');
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('重新投掷 1 颗骰子');
        expect(screen.getByTestId('betrayal-discovery-continue')).toHaveTextContent('确认 0/1');
        fireEvent.click(screen.getByTestId('betrayal-discovery-continue'));

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveAttribute(
                'data-visible-dice-source',
                'event-rolled-damage',
            );
        }, { timeout: 12000 });

        const damageRollPanel = screen.getByTestId('betrayal-recent-roll-panel');
        expect(damageRollPanel).toHaveAttribute('data-visible-dice-source', 'event-rolled-damage');
        expect(within(damageRollPanel).queryByTestId('betrayal-recent-roll-source-title')).not.toBeInTheDocument();
        expect(within(damageRollPanel).queryByTestId('betrayal-recent-roll-outcome')).not.toBeInTheDocument();
        expect(within(damageRollPanel).getByTestId('betrayal-recent-roll-event-description')).toHaveTextContent(
            '华盛顿展开了一次核物理打击',
        );
        expect(within(damageRollPanel).getByTestId('betrayal-recent-roll-event-description')).toHaveAttribute(
            'data-result-role',
            'event-damage-description',
        );
        expect(within(damageRollPanel).getByTestId('betrayal-recent-roll-event-subtitle')).toHaveTextContent(
            '受到一颗骰子的精神伤害',
        );
        expect(within(damageRollPanel).getByTestId('betrayal-recent-roll-event-subtitle')).toHaveAttribute(
            'data-result-role',
            'event-damage-subtitle',
        );
        expect(within(damageRollPanel).getByTestId('betrayal-recent-roll-event-effect')).toHaveTextContent(
            '实际效果：造成 2 点精神伤害',
        );
        expect(within(damageRollPanel).getByTestId('betrayal-recent-roll-event-effect')).toHaveAttribute(
            'data-result-role',
            'event-damage-effect',
        );
        expect(screen.getByTestId('betrayal-reroll-prompt-outside-dice')).toHaveTextContent('');
        expect(screen.getByTestId('betrayal-reroll-prompt-outside-dice')).toHaveAttribute('aria-hidden', 'true');
        expect(screen.getByTestId('betrayal-recent-roll-total')).toHaveTextContent('伤害骰合计 2');
        expect(screen.getByTestId('betrayal-recent-roll-total')).not.toHaveTextContent('事件总点数 0');
        const damageRollVisibleText = readVisibleNonSrText(damageRollPanel);
        expect(damageRollVisibleText).not.toContain('无线电广播');
        expect((damageRollVisibleText.match(/华盛顿展开了一次核物理打击/g) ?? [])).toHaveLength(1);
        expect((damageRollVisibleText.match(/受到一颗骰子的精神伤害/g) ?? [])).toHaveLength(1);
        expect((damageRollVisibleText.match(/实际效果：造成 2 点精神伤害/g) ?? [])).toHaveLength(1);
        expect(damageRollVisibleText).toContain('伤害骰合计 2');
        expect(damageRollVisibleText).not.toContain('待分配 2 点精神伤害');
        expect(damageRollVisibleText).not.toContain('重新投掷的伤害骰');
        expect(screen.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute('data-dice-count', '1');
        expect(screen.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute('data-dice-rule-subtotal', '2');
        expect(screen.queryByTestId('betrayal-recent-roll-damage-dice')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-recent-roll-effect-damage')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-recent-roll-breakdown')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-damage-allocation-panel')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-roll-continue')).toHaveTextContent('确认 0/1');
        fireEvent.click(screen.getByTestId('betrayal-roll-continue'));

        await waitFor(() => {
            expect(screen.getByTestId('betrayal-damage-allocation-panel')).toBeInTheDocument();
        }, { timeout: 12000 });

        expect(screen.queryByTestId('betrayal-recent-roll-panel')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-damage-allocation-panel')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-damage-allocation-amount')).toHaveTextContent('分配 2 点精神伤害');
        expect(screen.getByTestId('betrayal-damage-allocation-source')).toHaveTextContent('无线电广播');
        expect(screen.getByTestId('betrayal-damage-allocation-source')).toHaveAttribute(
            'data-visible-source-owner',
            'discovery-card',
        );
        expect(screen.getByTestId('betrayal-damage-allocation-source')).toHaveClass('sr-only');

        fireEvent.click(screen.getByTestId('betrayal-damage-allocation-trait-knowledge-increase'));
        fireEvent.click(screen.getByTestId('betrayal-damage-allocation-trait-sanity-increase'));
        expect(screen.getByTestId('betrayal-damage-allocation-trait-sanity-selected-count')).toHaveTextContent('1');
        fireEvent.click(screen.getByTestId('betrayal-damage-allocation-trait-sanity-decrease'));
        expect(screen.getByTestId('betrayal-damage-allocation-trait-sanity-selected-count')).toHaveTextContent('0');
        fireEvent.click(screen.getByTestId('betrayal-damage-allocation-trait-sanity-increase'));

        const knowledgeDamageCard = screen.getByTestId('betrayal-damage-allocation-trait-knowledge');
        const sanityDamageCard = screen.getByTestId('betrayal-damage-allocation-trait-sanity');
        expect(knowledgeDamageCard).toHaveAttribute('data-damage-selected-count', '1');
        expect(knowledgeDamageCard).toHaveAttribute('data-trait-preview-step-count', '1');
        expect(screen.getByTestId('betrayal-damage-allocation-trait-knowledge-selected-count')).toHaveTextContent('1');
        expect(Number(knowledgeDamageCard.getAttribute('data-trait-preview-target-position'))).toBeLessThan(
            Number(knowledgeDamageCard.getAttribute('data-trait-preview-current-position')),
        );
        expect(sanityDamageCard).toHaveAttribute('data-damage-selected-count', '1');
        expect(sanityDamageCard).toHaveAttribute('data-trait-preview-step-count', '1');
        expect(screen.getByTestId('betrayal-damage-allocation-trait-sanity-selected-count')).toHaveTextContent('1');
        expect(Number(sanityDamageCard.getAttribute('data-trait-preview-target-position'))).toBeLessThan(
            Number(sanityDamageCard.getAttribute('data-trait-preview-current-position')),
        );
        expect(screen.getByTestId('betrayal-damage-allocation-traits')).not.toHaveTextContent(
            /承担\s*\d+\s*点|×\d|[+-]\s*\d+\s*步|[+-]\s*\d+\s*steps/i,
        );
    });

    it('一罐器官会在真实页面承接神志检定、抽物品和力量降低结果', async () => {
        const jarOfOrgans = BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '一罐器官');
        expect(jarOfOrgans?.roll?.trait).toBe('sanity');

        const rewardCore = createBetrayalFoundationCore(['0', '1', '2', '3']);
        rewardCore.drawOrder = ['event'];
        rewardCore.eventOrder = [jarOfOrgans!];
        rewardCore.possessionOrderByKind.item = [{ id: 'camera', name: '魔法相机', kind: 'item' }];
        rewardCore.currentExplorer = {
            ...rewardCore.currentExplorer,
            roomId: 'hallway',
            traits: {
                ...rewardCore.currentExplorer.traits,
                sanity: 4,
            },
            inventory: [],
        };
        rewardCore.activeRoomId = 'hallway';
        rewardCore.currentExplorerTraits = { ...rewardCore.currentExplorer.traits };
        rewardCore.currentExplorerInventory = [];
        setNextBoardDiscoveryRoom(rewardCore, 'ground', 'kitchen');

        const rewardView = render(
            <HarnessBoardWithRandom
                initialCore={rewardCore}
                matchData={defaultMatchData}
                diceResults={[3, 3, 3, 3]}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-action-explore'));
        fireEvent.click(screen.getByTestId('betrayal-room-ground-north'));
        await confirmPendingRoomPlacement({ confirmEventRoll: false });

        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute(
            'aria-label',
            expect.stringContaining('一罐器官'),
        );
        expect(screen.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute('data-dice-count', '4');
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('神志检定');
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('总点数 8');
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('抽取一张物品卡');
        expectSingleEventEffectResolutionStep('抽取一张物品卡');
        await waitFor(() => {
            expect(within(screen.getByTestId('betrayal-inventory-row-item')).getByText('魔法相机')).toBeInTheDocument();
        }, { timeout: 12000 });
        rewardView.unmount();

        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.drawOrder = ['event'];
        core.eventOrder = [jarOfOrgans!];
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'hallway',
            traits: {
                ...core.currentExplorer.traits,
                might: 4,
                sanity: 4,
            },
            inventory: [],
        };
        core.activeRoomId = 'hallway';
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = [];
        setNextBoardDiscoveryRoom(core, 'ground', 'kitchen');

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                matchData={defaultMatchData}
                diceResults={[1, 1, 1, 1]}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-action-explore'));
        fireEvent.click(screen.getByTestId('betrayal-room-ground-north'));
        await confirmPendingRoomPlacement({ confirmEventRoll: false });

        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute(
            'aria-label',
            expect.stringContaining('一罐器官'),
        );
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('失去 1 点力量');
        expect(screen.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute('data-dice-count', '4');
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('神志检定');
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('总点数 0');
        expectSingleEventEffectResolutionStep('力量 -1');
    });

    it('一声呼救会在真实页面承接知识检定和同区域目标板块选择', async () => {
        const cryForHelp = BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '一声呼救');
        expect(cryForHelp?.roll?.trait).toBe('knowledge');

        let core = createStartedFirstScenarioCore(['0', '1', '2', '3']);
        core.drawOrder = ['event'];
        core.eventOrder = [cryForHelp!];
        core.currentExplorer = {
            ...core.currentExplorer,
            traits: {
                ...core.currentExplorer.traits,
                knowledge: 4,
            },
            inventory: [],
        };
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = [];
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'hallway' });
        setNextBoardDiscoveryRoom(core, 'ground', 'kitchen');
        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.EXPLORE_ROOM,
            '0',
            { roomId: 'ground-north' },
            100,
            createBetrayalScriptedRandom(3, 3, 3, 3),
        );

        expect(core.latestDiscovery?.title).toBe('一声呼救');
        expect(core.recentRoll?.kind).toBe('eventTraitCheck');
        expect(core.recentRoll?.trait).toBe('knowledge');
        expect(core.recentRoll?.sourceTitle).toBe('一声呼救');
        expect(core.recentRoll?.latestLabel).toContain('放置在所在区域的任意板块');
        expect(core.pendingEventChoice?.sourceTitle).toBe('一声呼救');

        const targetView = render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        expect(screen.getByTestId('betrayal-event-choice-panel')).toHaveAttribute('aria-label', '一声呼救');
        expect(screen.getByTestId('betrayal-event-choice-card-front-atlas')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute('data-dice-count', '4');
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('知识检定');
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('总点数 8');
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('放置在所在区域的任意板块');
        expect(screen.queryByTestId('betrayal-discovery-panel')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-room-event-choice-target-hallway')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-room-event-choice-target-entrance-hall')).toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-room-event-choice-target-upper-landing')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-room-event-choice-target-basement-landing')).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('betrayal-room-hallway'));

        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('放置到门厅');
        expect(screen.getByTestId('betrayal-current-traits')).toHaveAttribute('data-room-id', 'hallway');
        expectSingleEventEffectResolutionStep('放置到门厅');
        targetView.unmount();

        const damageCore = createBetrayalFoundationCore(['0', '1', '2', '3']);
        damageCore.drawOrder = ['event'];
        damageCore.eventOrder = [cryForHelp!];
        damageCore.currentExplorer = {
            ...damageCore.currentExplorer,
            roomId: 'hallway',
            traits: {
                ...damageCore.currentExplorer.traits,
                knowledge: 4,
                sanity: 4,
            },
            inventory: [],
        };
        damageCore.activeRoomId = 'hallway';
        damageCore.currentExplorerTraits = { ...damageCore.currentExplorer.traits };
        damageCore.currentExplorerInventory = [];
        setNextBoardDiscoveryRoom(damageCore, 'ground', 'kitchen');

        render(
            <HarnessBoardWithRandom
                initialCore={damageCore}
                matchData={defaultMatchData}
                diceResults={[1, 1, 1, 1]}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-action-explore'));
        fireEvent.click(screen.getByTestId('betrayal-room-ground-north'));
        await confirmPendingRoomPlacement();

        await expectEventDamageAllocation('一声呼救', '分配 1 点精神伤害', ['知识', '神志']);
        expect(screen.queryByTestId('betrayal-discovery-panel')).not.toBeInTheDocument();
    });

    it('花团锦簇待选事件在真实页面展示地面/地下室候选并强制温室', () => {
        const bouquetEvent = BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '花团锦簇');
        expect(bouquetEvent?.effect?.mode).toBe('compound');
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'hallway',
            traits: {
                ...core.currentExplorer.traits,
                might: 4,
                speed: 4,
                knowledge: 4,
                sanity: 4,
            },
            inventory: [],
        };
        core.activeRoomId = 'hallway';
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = [];
        core.pendingEventChoice = {
            id: 'test-bouquet-room-choice',
            playerId: '0',
            sourceTitle: '花团锦簇',
            effect: bouquetEvent!.effect!,
        };

        const normalView = render(
            <HarnessBoardWithRandom
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        expect(screen.getByTestId('betrayal-event-choice-panel')).toHaveAttribute('aria-label', '花团锦簇');
        expect(screen.getByTestId('betrayal-event-choice-card-front-atlas')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-room-event-choice-target-hallway')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-room-event-choice-target-entrance-hall')).toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-room-event-choice-target-upper-landing')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-event-choice-damage-might')).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('betrayal-room-floor-down'));
        expect(screen.getByTestId('betrayal-room-floor-basement')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-room-event-choice-target-basement-landing')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('betrayal-room-basement-landing'));
        expect(screen.getByTestId('betrayal-event-choice-damage-might')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('betrayal-event-choice-damage-might-increase'));

        expect(screen.queryByTestId('betrayal-event-choice-panel')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-current-traits')).toHaveAttribute('data-room-id', 'basement-landing');
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('通用伤害 1（力量）');
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('放置到地下室起始点');
        normalView.unmount();

        const greenhouseCore = createBetrayalFoundationCore(['0', '1', '2', '3']);
        greenhouseCore.rooms = greenhouseCore.rooms.map((room) => (
            room.id === 'hallway'
                ? { ...room, visualId: 'conservatory', name: '温室' }
                : room
        ));
        greenhouseCore.currentExplorer = {
            ...greenhouseCore.currentExplorer,
            roomId: 'entrance-hall',
            traits: {
                ...greenhouseCore.currentExplorer.traits,
                might: 4,
                speed: 4,
                knowledge: 4,
                sanity: 4,
            },
            inventory: [],
        };
        greenhouseCore.activeRoomId = 'entrance-hall';
        greenhouseCore.currentExplorerTraits = { ...greenhouseCore.currentExplorer.traits };
        greenhouseCore.currentExplorerInventory = [];
        greenhouseCore.pendingEventChoice = {
            id: 'test-bouquet-greenhouse-choice',
            playerId: '0',
            sourceTitle: '花团锦簇',
            effect: bouquetEvent!.effect!,
        };

        render(
            <HarnessBoardWithRandom
                initialCore={greenhouseCore}
                matchData={defaultMatchData}
            />,
        );

        expect(screen.getByTestId('betrayal-event-choice-panel')).toHaveAttribute('aria-label', '花团锦簇');
        expect(screen.getByTestId('betrayal-room-event-choice-target-hallway')).toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-room-event-choice-target-entrance-hall')).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId('betrayal-room-floor-down'));
        expect(screen.getByTestId('betrayal-room-floor-basement')).toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-room-event-choice-target-basement-landing')).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId('betrayal-room-floor-up'));
        expect(screen.getByTestId('betrayal-room-floor-ground')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('betrayal-room-hallway'));
        fireEvent.click(screen.getByTestId('betrayal-event-choice-damage-might-increase'));

        expect(screen.getByTestId('betrayal-current-traits')).toHaveAttribute('data-room-id', 'hallway');
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('通用伤害 1（力量）');
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('放置到温室');
    });

    it('上古旧宅待选事件能在真实页面选择属性、目标板块和通用伤害', () => {
        const oldMansion = BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '上古旧宅');
        expect(oldMansion?.effect).toBeTruthy();
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'hallway',
            traits: {
                ...core.currentExplorer.traits,
                speed: 4,
                might: 4,
                knowledge: 4,
                sanity: 4,
            },
            inventory: [],
        };
        core.activeRoomId = 'hallway';
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = [];
        core.pendingEventChoice = {
            id: 'test-old-mansion-choice',
            playerId: '0',
            sourceTitle: '上古旧宅',
            effect: oldMansion!.effect!,
        };

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        const eventChoicePanel = screen.getByTestId('betrayal-event-choice-panel');
        expect(eventChoicePanel).toHaveAttribute('aria-label', '上古旧宅');
        expect(eventChoicePanel).toHaveAttribute('data-layout', 'main-stage');
        expect(eventChoicePanel).toHaveAttribute('data-surface', 'open-table');
        expect(screen.getByTestId('betrayal-event-choice-card-front-atlas')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-event-choice-trait-might')).toHaveClass('min-h-[76px]');
        expect(screen.queryByTestId('betrayal-event-choice-confirm')).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId('betrayal-event-choice-trait-might'));
        expect(screen.getByTestId('betrayal-room-event-choice-target-hallway')).toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-event-choice-panel')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-event-choice-card-front-atlas')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-recent-roll-panel')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-event-choice-damage-might')).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId('betrayal-room-hallway'));
        expect(screen.getByTestId('betrayal-event-choice-damage-might')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('betrayal-event-choice-damage-might-increase'));

        expect(screen.queryByTestId('betrayal-event-choice-panel')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('力量检定');
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('放置到门厅');
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('通用伤害 1（力量）');
        expectSingleEventEffectResolutionStep('力量检定', '放置到门厅', '通用伤害 1（力量）');
        const discoveryContinue = screen.queryByTestId('betrayal-discovery-continue');
        if (discoveryContinue) {
            fireEvent.click(discoveryContinue);
        }
        expect(screen.queryByTestId('betrayal-discovery-panel')).not.toBeInTheDocument();
    });

    it('肉质苔癣待选事件能在真实页面跳过可选效果', () => {
        const fleshMoss = BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '肉质苔癣');
        expect(fleshMoss?.effect).toBeTruthy();
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.pendingEventChoice = {
            id: 'test-flesh-moss-choice',
            playerId: '0',
            sourceTitle: '肉质苔癣',
            acceptLabel: '大口吸入芳香',
            declineLabel: '不吸入芳香',
            effect: fleshMoss!.effect!,
        };

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        expect(screen.getByTestId('betrayal-event-choice-panel')).toHaveAttribute('aria-label', '肉质苔癣');
        expect(screen.getByTestId('betrayal-event-choice-confirm')).toHaveTextContent('大口吸入芳香');
        fireEvent.click(screen.getByTestId('betrayal-event-choice-decline'));

        expect(screen.queryByTestId('betrayal-event-choice-panel')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('无事发生');
    });

    it('神秘液体待选事件能在真实页面拒绝或喝下后承接固定 3 骰结果', () => {
        const mysteriousLiquid = BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '神秘液体');
        expect(mysteriousLiquid?.effect?.mode).toBe('optionalEventRoll');

        const declineCore = createBetrayalFoundationCore(['0', '1', '2', '3']);
        declineCore.pendingEventChoice = {
            id: 'test-mysterious-liquid-decline-choice',
            playerId: '0',
            sourceTitle: '神秘液体',
            acceptLabel: '喝下神秘液体',
            declineLabel: '不喝',
            effect: mysteriousLiquid!.effect!,
        };

        const declineView = render(
            <HarnessBoardWithRandom
                initialCore={declineCore}
                matchData={defaultMatchData}
            />,
        );

        expect(screen.getByTestId('betrayal-event-choice-panel')).toHaveAttribute('aria-label', '神秘液体');
        expect(screen.getByTestId('betrayal-event-choice-card-front-atlas')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-event-choice-confirm')).toHaveTextContent('喝下神秘液体');
        expect(screen.getByTestId('betrayal-event-choice-decline')).toHaveTextContent('不喝');
        fireEvent.click(screen.getByTestId('betrayal-event-choice-decline'));

        expect(screen.queryByTestId('betrayal-event-choice-panel')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-recent-roll-panel')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('无事发生');
        declineView.unmount();

        const acceptCore = createBetrayalFoundationCore(['0', '1', '2', '3']);
        acceptCore.pendingEventChoice = {
            id: 'test-mysterious-liquid-accept-choice',
            playerId: '0',
            sourceTitle: '神秘液体',
            acceptLabel: '喝下神秘液体',
            declineLabel: '不喝',
            effect: mysteriousLiquid!.effect!,
        };

        render(
            <HarnessBoardWithRandom
                initialCore={acceptCore}
                matchData={defaultMatchData}
                diceResults={[3, 3, 3]}
            />,
        );

        expect(screen.getByTestId('betrayal-event-choice-panel')).toHaveAttribute('aria-label', '神秘液体');
        fireEvent.click(screen.getByTestId('betrayal-event-choice-confirm'));

        expect(screen.queryByTestId('betrayal-event-choice-panel')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute(
            'aria-label',
            expect.stringContaining('神秘液体'),
        );
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('投 3 颗骰子');
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('总点数 6');
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('每项属性 +1');
        expectSingleEventEffectResolutionStep('每项属性 +1');
    });

    it('摇曳灯光待选事件能在真实页面选择速度并承接属性检定结果', () => {
        const flickeringLights = BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '摇曳灯光');
        expect(flickeringLights?.effect?.mode).toBe('chooseTraitRoll');

        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.currentExplorer = {
            ...core.currentExplorer,
            traits: {
                ...core.currentExplorer.traits,
                speed: 4,
                might: 4,
            },
            inventory: [],
        };
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = [];
        core.pendingEventChoice = {
            id: 'test-flickering-lights-choice',
            playerId: '0',
            sourceTitle: '摇曳灯光',
            effect: flickeringLights!.effect!,
        };

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                matchData={defaultMatchData}
                diceResults={[3, 3, 3, 3]}
            />,
        );

        expect(screen.getByTestId('betrayal-event-choice-panel')).toHaveAttribute('aria-label', '摇曳灯光');
        expect(screen.getByTestId('betrayal-event-choice-card-front-atlas')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-event-choice-trait-speed')).toHaveTextContent('速度');
        expect(screen.getByTestId('betrayal-event-choice-trait-might')).toHaveTextContent('力量');
        expect(screen.queryByTestId('betrayal-event-choice-confirm')).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('betrayal-event-choice-trait-speed'));

        expect(screen.queryByTestId('betrayal-event-choice-panel')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute(
            'aria-label',
            expect.stringContaining('摇曳灯光'),
        );
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('速度检定');
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('总点数 8');
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('速度 +1');
        expectSingleEventEffectResolutionStep('速度 +1');
    });

    it('佳馔满桌待选事件能在真实页面选择知识并承接速度提升和通用伤害分配', () => {
        const feast = BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '佳馔满桌');
        expect(feast?.effect?.mode).toBe('chooseTraitRoll');

        const createFeastCore = (id: string) => {
            const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
            core.currentExplorer = {
                ...core.currentExplorer,
                inventory: [],
            };
            core.currentExplorerInventory = [];
            setBoardTraitTrack(core, '0', 'speed', [1, 2, 3, 4, 5], 3, 3);
            setBoardTraitTrack(core, '0', 'knowledge', [1, 2, 3, 4], 3, 3);
            setBoardTraitTrack(core, '0', 'sanity', [1, 2, 3, 4], 3, 3);
            core.pendingEventChoice = {
                id,
                playerId: '0',
                sourceTitle: '佳馔满桌',
                effect: feast!.effect!,
            };
            return core;
        };

        const successView = render(
            <HarnessBoardWithRandom
                initialCore={createFeastCore('test-feast-success-choice')}
                matchData={defaultMatchData}
                diceResults={[3, 3, 3, 3]}
            />,
        );

        expect(screen.getByTestId('betrayal-event-choice-panel')).toHaveAttribute('aria-label', '佳馔满桌');
        expect(screen.getByTestId('betrayal-event-choice-card-front-atlas')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-event-choice-trait-knowledge')).toHaveTextContent('知识');
        expect(screen.getByTestId('betrayal-event-choice-trait-sanity')).toHaveTextContent('神志');
        expect(screen.queryByTestId('betrayal-event-choice-confirm')).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('betrayal-event-choice-trait-knowledge'));
        expect(screen.getByTestId('betrayal-event-choice-panel')).toHaveAttribute('aria-label', '佳馔满桌');
        expect(screen.getByTestId('betrayal-event-choice-damage-might')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('betrayal-event-choice-damage-might-increase'));

        expect(screen.queryByTestId('betrayal-event-choice-panel')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute(
            'aria-label',
            expect.stringContaining('佳馔满桌'),
        );
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('知识检定');
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('总点数 8');
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('速度 +1');
        expectSingleEventEffectResolutionStep('速度 +1');
        successView.unmount();

        render(
            <HarnessBoardWithRandom
                initialCore={createFeastCore('test-feast-failure-choice')}
                matchData={defaultMatchData}
                diceResults={[1, 1, 1, 1]}
            />,
        );

        expect(screen.getByTestId('betrayal-event-choice-panel')).toHaveAttribute('aria-label', '佳馔满桌');
        expect(screen.getByTestId('betrayal-event-choice-card-front-atlas')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-event-choice-trait-knowledge')).toHaveTextContent('知识');
        expect(screen.getByTestId('betrayal-event-choice-trait-sanity')).toHaveTextContent('神志');
        expect(screen.queryByTestId('betrayal-event-choice-confirm')).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('betrayal-event-choice-trait-knowledge'));

        expect(screen.getByTestId('betrayal-event-choice-panel')).toHaveAttribute('aria-label', '佳馔满桌');
        expect(screen.getByTestId('betrayal-event-choice-damage-might')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('betrayal-event-choice-damage-might-increase'));

        expect(screen.queryByTestId('betrayal-event-choice-panel')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute(
            'aria-label',
            expect.stringContaining('佳馔满桌'),
        );
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('知识检定');
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('通用伤害 1（力量）');
        expectSingleEventEffectResolutionStep('通用伤害 1（力量）');
    });

    it('地狱蝙蝠会在真实页面承接速度检定、相邻板块选择和物理伤害', async () => {
        const hellBeasts = BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '地狱蝙蝠');
        expect(hellBeasts?.roll?.trait).toBe('speed');

        let core = createStartedFirstScenarioCore(['0', '1', '2', '3']);
        core.drawOrder = ['event'];
        core.eventOrder = [hellBeasts!];
        core.currentExplorer = {
            ...core.currentExplorer,
            traits: {
                ...core.currentExplorer.traits,
                speed: 4,
            },
            inventory: [],
        };
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = [];
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'hallway' });
        setNextBoardDiscoveryRoom(core, 'ground', 'kitchen');
        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.EXPLORE_ROOM,
            '0',
            { roomId: 'ground-north' },
            100,
            createBetrayalScriptedRandom(3, 3, 3, 3),
        );

        expect(core.latestDiscovery?.title).toBe('地狱蝙蝠');
        expect(core.recentRoll?.kind).toBe('eventTraitCheck');
        expect(core.recentRoll?.trait).toBe('speed');
        expect(core.recentRoll?.sourceTitle).toBe('地狱蝙蝠');
        expect(core.recentRoll?.latestLabel).toContain('放置到相邻板块');
        expect(core.pendingEventChoice?.sourceTitle).toBe('地狱蝙蝠');

        const targetView = render(
            <HarnessBoard
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        expect(screen.getByTestId('betrayal-event-choice-panel')).toHaveAttribute('aria-label', '地狱蝙蝠');
        expect(screen.getByTestId('betrayal-event-choice-card-front-atlas')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute('data-dice-count', '4');
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('速度检定');
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('总点数 8');
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('放置到相邻板块');
        expect(screen.getByTestId('betrayal-room-event-choice-target-hallway')).toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-room-event-choice-target-entrance-hall')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-room-event-choice-target-upper-landing')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-room-event-choice-target-basement-landing')).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('betrayal-room-hallway'));

        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('放置到门厅');
        expect(screen.getByTestId('betrayal-current-traits')).toHaveAttribute('data-room-id', 'hallway');
        expectSingleEventEffectResolutionStep('放置到门厅');
        targetView.unmount();

        let damageCore = createStartedFirstScenarioCore(['0', '1', '2', '3']);
        damageCore.drawOrder = ['event'];
        damageCore.eventOrder = [hellBeasts!];
        damageCore.currentExplorer = {
            ...damageCore.currentExplorer,
            traits: {
                ...damageCore.currentExplorer.traits,
                speed: 4,
            },
            inventory: [],
        };
        damageCore.currentExplorerTraits = { ...damageCore.currentExplorer.traits };
        damageCore.currentExplorerInventory = [];
        damageCore = applyBetrayalCommand(damageCore, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'hallway' });
        setNextBoardDiscoveryRoom(damageCore, 'ground', 'kitchen');
        damageCore = applyBetrayalCommand(
            damageCore,
            BETRAYAL_COMMANDS.EXPLORE_ROOM,
            '0',
            { roomId: 'ground-north' },
            100,
            createBetrayalScriptedRandom(1, 1, 1, 1),
        );

        render(
            <HarnessBoard
                initialCore={damageCore}
                matchData={defaultMatchData}
            />,
        );

        await expectEventDamageAllocation('地狱蝙蝠', '分配 1 点物理伤害', ['力量', '速度'], 'discovery-card');
        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute(
            'aria-label',
            expect.stringContaining('地狱蝙蝠'),
        );
    });

    it('轮到约拿了待选事件会在真实页面只展示可弃置的非武器物品并承接拒绝精神伤害', async () => {
        const jonah = BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '轮到约拿了');
        expect(jonah?.effect?.mode).toBe('optionalItemEffect');
        const createJonahChoiceCore = (id: string) => {
            const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
            core.currentExplorer = {
                ...core.currentExplorer,
                inventory: [
                    { id: 'map', name: '地图', kind: 'item' },
                    { id: 'hunting-knife', name: '砍刀', kind: 'item' },
                ],
            };
            core.currentExplorerInventory = core.currentExplorer.inventory.map((card) => ({ ...card }));
            core.pendingEventChoice = {
                id,
                playerId: '0',
                sourceTitle: '轮到约拿了',
                acceptLabel: '弃置非武器物品并获得 1 点神志',
                declineLabel: '不弃置物品',
                effect: jonah!.effect!,
            };
            return core;
        };
        const dispatch = vi.fn();

        const itemChoiceView = renderBoardWithDispatch(createJonahChoiceCore('test-jonah-choice'), dispatch, {
            matchData: defaultMatchData,
        });

        expect(screen.getByTestId('betrayal-event-choice-panel')).toHaveAttribute('aria-label', '轮到约拿了');
        expect(screen.getByTestId('betrayal-event-choice-items')).toHaveTextContent('选择物品');
        expect(screen.getByTestId('betrayal-event-choice-card-map')).toHaveTextContent('地图');
        expect(screen.queryByTestId('betrayal-event-choice-card-hunting-knife')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-event-choice-confirm')).toBeDisabled();

        fireEvent.click(screen.getByTestId('betrayal-event-choice-card-map'));
        expect(screen.getByTestId('betrayal-event-choice-confirm')).not.toBeDisabled();
        fireEvent.click(screen.getByTestId('betrayal-event-choice-confirm'));

        expect(dispatch).toHaveBeenCalledWith(BETRAYAL_COMMANDS.RESOLVE_EVENT_CHOICE, {
            accept: true,
            cardId: 'map',
        });
        itemChoiceView.unmount();

        render(
            <HarnessBoardWithRandom
                initialCore={createJonahChoiceCore('test-jonah-decline-damage-choice')}
                matchData={defaultMatchData}
                diceResults={[3]}
            />,
        );

        expect(screen.getByTestId('betrayal-event-choice-panel')).toHaveAttribute('aria-label', '轮到约拿了');
        fireEvent.click(screen.getByTestId('betrayal-event-choice-decline'));

        expect(screen.queryByTestId('betrayal-event-choice-panel')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveAttribute(
            'data-visible-dice-source',
            'event-rolled-damage',
        );
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('造成 2 点精神伤害');
        await expectEventDamageAllocation('轮到约拿了', '分配 2 点精神伤害', ['知识', '神志'], 'discovery-card');
    });

    it('游魂待选事件会在真实页面同时要求选择埋葽物品和奖励属性', () => {
        const wanderingSpirit = BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '游魂');
        expect(wanderingSpirit?.effect?.mode).toBe('optionalItemEffect');
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.currentExplorer = {
            ...core.currentExplorer,
            inventory: [
                { id: 'map', name: '地图', kind: 'item' },
                { id: 'hunting-knife', name: '砍刀', kind: 'item' },
            ],
        };
        core.currentExplorerInventory = core.currentExplorer.inventory.map((card) => ({ ...card }));
        core.pendingEventChoice = {
            id: 'test-wandering-spirit-choice',
            playerId: '0',
            sourceTitle: '游魂',
            acceptLabel: '埋葬一件物品并获得 1 点任意属性',
            declineLabel: '不埋葬物品',
            effect: wanderingSpirit!.effect!,
        };
        const dispatch = vi.fn();

        renderBoardWithDispatch(core, dispatch, {
            matchData: defaultMatchData,
        });

        expect(screen.getByTestId('betrayal-event-choice-panel')).toHaveAttribute('aria-label', '游魂');
        expect(screen.getByTestId('betrayal-event-choice-items')).toHaveTextContent('选择物品');
        expect(screen.getByTestId('betrayal-event-choice-card-map')).toHaveTextContent('地图');
        expect(screen.getByTestId('betrayal-event-choice-card-hunting-knife')).toHaveTextContent('砍刀');
        expect(screen.getByTestId('betrayal-event-choice-trait-might')).toHaveTextContent('力量');
        expect(screen.getByTestId('betrayal-event-choice-trait-speed')).toHaveTextContent('速度');
        expect(screen.getByTestId('betrayal-event-choice-trait-knowledge')).toHaveTextContent('知识');
        expect(screen.getByTestId('betrayal-event-choice-trait-sanity')).toHaveTextContent('神志');
        expect(screen.getByTestId('betrayal-event-choice-confirm')).toBeDisabled();

        fireEvent.click(screen.getByTestId('betrayal-event-choice-card-map'));
        expect(screen.getByTestId('betrayal-event-choice-confirm')).toBeDisabled();

        fireEvent.click(screen.getByTestId('betrayal-event-choice-trait-knowledge'));
        expect(screen.getByTestId('betrayal-event-choice-confirm')).not.toBeDisabled();
        fireEvent.click(screen.getByTestId('betrayal-event-choice-confirm'));

        expect(dispatch).toHaveBeenCalledWith(BETRAYAL_COMMANDS.RESOLVE_EVENT_CHOICE, {
            accept: true,
            cardId: 'map',
            trait: 'knowledge',
        });
    });

    it('牙齿项链结束回合选择能在真实页面跳过或选择濒死属性', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.pendingEventChoice = {
            id: 'test-tooth-necklace-end-turn-choice',
            playerId: '0',
            sourceTitle: '牙齿项链',
            acceptLabel: '获得属性',
            declineLabel: '跳过',
            sourceKind: 'item',
            itemResolution: 'tooth-necklace-end-turn',
            itemCardId: 'tooth-necklace',
            effect: {
                mode: 'chosenTrait',
                amount: 1,
                allowedTraits: ['might'],
                recommendedAction: 'endTurn',
            },
        };
        const dispatch = vi.fn();

        renderBoardWithDispatch(core, dispatch, { matchData: defaultMatchData });

        expect(screen.getByTestId('betrayal-event-choice-panel')).toHaveAttribute('aria-label', '牙齿项链');
        expect(screen.getByTestId('betrayal-event-choice-trait-might')).toHaveTextContent('力量');
        expect(screen.getByTestId('betrayal-event-choice-confirm')).toBeDisabled();
        expect(screen.getByTestId('betrayal-event-choice-decline')).not.toBeDisabled();

        fireEvent.click(screen.getByTestId('betrayal-event-choice-decline'));
        expect(dispatch).toHaveBeenCalledWith(BETRAYAL_COMMANDS.RESOLVE_EVENT_CHOICE, {
            accept: false,
        });

        dispatch.mockClear();
        fireEvent.click(screen.getByTestId('betrayal-event-choice-trait-might'));
        expect(screen.getByTestId('betrayal-event-choice-confirm')).not.toBeDisabled();
        fireEvent.click(screen.getByTestId('betrayal-event-choice-confirm'));
        expect(dispatch).toHaveBeenCalledWith(BETRAYAL_COMMANDS.RESOLVE_EVENT_CHOICE, {
            accept: true,
            trait: 'might',
        });
    });

    it('肉质苔癣选择型事件效果会在真实页面展示成功属性和失败精神伤害分配步骤', async () => {
        const fleshMoss = BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '肉质苔癣');
        expect(fleshMoss?.effect).toBeTruthy();
        const createFleshMossCore = (id: string) => {
            const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
            core.currentExplorer = {
                ...core.currentExplorer,
                traits: {
                    ...core.currentExplorer.traits,
                    knowledge: 4,
                    sanity: 4,
                },
                inventory: [],
            };
            core.currentExplorerTraits = { ...core.currentExplorer.traits };
            core.currentExplorerInventory = [];
            core.pendingEventChoice = {
                id,
                playerId: '0',
                sourceTitle: '肉质苔癣',
                acceptLabel: '大口吸入芳香',
                declineLabel: '不吸入芳香',
                effect: fleshMoss!.effect!,
            };
            return core;
        };

        const successView = render(
            <HarnessBoardWithRandom
                initialCore={createFleshMossCore('test-flesh-moss-choice-success-step')}
                matchData={defaultMatchData}
                diceResults={[3, 3]}
            />,
        );

        expect(screen.getByTestId('betrayal-event-choice-panel')).toHaveAttribute('aria-label', '肉质苔癣');
        fireEvent.click(screen.getByTestId('betrayal-event-choice-confirm'));
        expect(screen.queryByTestId('betrayal-event-choice-panel')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute('aria-label', expect.stringContaining('肉质苔癣'));
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('投 2 颗骰子');
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('总点数 4');
        expect(screen.getByTestId('betrayal-discovery-continue')).toHaveTextContent('确认 0/4');
        expect(screen.getByTestId('betrayal-discovery-continue')).toHaveAttribute('data-event-roll-confirmed-count', '0');
        expect(screen.getByTestId('betrayal-discovery-continue')).toHaveAttribute('data-event-roll-required-count', '4');
        expect(screen.getByTestId('betrayal-discovery-continue')).not.toHaveAttribute('data-pending-card-resolution-step');
        fireEvent.click(screen.getByTestId('betrayal-discovery-continue'));
        await waitFor(() => {
            expect(screen.getByTestId('betrayal-event-choice-panel')).toHaveAttribute('aria-label', '肉质苔癣');
        }, { timeout: 12000 });
        fireEvent.click(screen.getByTestId('betrayal-event-choice-trait-knowledge'));

        expect(screen.queryByTestId('betrayal-event-choice-panel')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('知识 +1');
        expectSingleEventEffectResolutionStep('知识 +1');
        const discoveryContinue = screen.queryByTestId('betrayal-discovery-continue');
        if (discoveryContinue) {
            fireEvent.click(discoveryContinue);
        }
        expect(screen.queryByTestId('betrayal-discovery-panel')).not.toBeInTheDocument();
        successView.unmount();

        render(
            <HarnessBoardWithRandom
                initialCore={createFleshMossCore('test-flesh-moss-choice-damage-step')}
                matchData={defaultMatchData}
                diceResults={[1, 1, 3]}
            />,
        );

        expect(screen.getByTestId('betrayal-event-choice-panel')).toHaveAttribute('aria-label', '肉质苔癣');
        fireEvent.click(screen.getByTestId('betrayal-event-choice-confirm'));

        expect(screen.queryByTestId('betrayal-event-choice-panel')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute(
            'aria-label',
            expect.stringContaining('肉质苔癣'),
        );
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('投 2 颗骰子');
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('总点数 0');
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('受到一颗骰子的精神伤害');
        expectSingleEventEffectResolutionStep('受到一颗骰子的精神伤害');
    });

    it('大宅饿了待选事件能在真实页面选择属性并跳过作祟检定', () => {
        const helpingHandsEvent = BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '大宅饿了');
        expect(helpingHandsEvent?.effect).toBeTruthy();
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.pendingEventChoice = {
            id: 'test-hungry-house-choice',
            playerId: '0',
            sourceTitle: '大宅饿了',
            acceptLabel: '进行作祟检定',
            declineLabel: '跳过作祟检定',
            effect: helpingHandsEvent!.effect!,
        };

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        expect(screen.getByTestId('betrayal-event-choice-panel')).toHaveAttribute('aria-label', '大宅饿了');
        fireEvent.click(screen.getByTestId('betrayal-event-choice-trait-knowledge'));
        fireEvent.click(screen.getByTestId('betrayal-event-choice-decline'));

        expect(screen.queryByTestId('betrayal-event-choice-panel')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute('aria-label', '事件牌 大宅饿了');
        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute('data-backdrop-dismiss', 'disabled');
        expect(screen.getByTestId('betrayal-discovery-continue')).toHaveTextContent('确认');
        expect(screen.getByTestId('betrayal-discovery-continue')).toHaveAttribute('data-pending-card-resolution-step', '1/1');

        const discoveryContinue = screen.queryByTestId('betrayal-discovery-continue');
        if (discoveryContinue) {
            fireEvent.click(discoveryContinue);
        }

        expect(screen.queryByTestId('betrayal-discovery-panel')).not.toBeInTheDocument();
    });

    it('蜘蛛！真实探索先神志检定，并在待选项同屏保留投骰结果，点最终房间后进入事件效果确认', () => {
        const spider = BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '蜘蛛！');
        expect(spider?.roll?.trait).toBe('sanity');
        let core = createStartedFirstScenarioCore(['0', '1', '2', '3']);
        core.drawOrder = ['event'];
        core.eventOrder = [spider!];
        core.currentExplorer = {
            ...core.currentExplorer,
            traits: {
                ...core.currentExplorer.traits,
                sanity: 4,
                speed: 4,
            },
            inventory: [],
        };
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = [];
        setNextBoardDiscoveryRoom(core, 'ground', 'kitchen');
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'hallway' });
        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.EXPLORE_ROOM,
            '0',
            { roomId: 'ground-north' },
            100,
            createBetrayalScriptedRandom(2, 2, 2, 2),
        );

        expect(core.latestDiscovery?.title).toBe('蜘蛛！');
        expect(core.recentRoll?.kind).toBe('eventTraitCheck');
        expect(core.recentRoll?.trait).toBe('sanity');
        expect(core.recentRoll?.sourceTitle).toBe('蜘蛛！');
        expect(core.recentRoll?.latestLabel).toContain('获得 1 点神志或速度');
        expect(core.pendingEventChoice?.sourceTitle).toBe('蜘蛛！');

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        const eventChoicePanel = screen.getByTestId('betrayal-event-choice-panel');
        expect(eventChoicePanel).toHaveAttribute('aria-label', '蜘蛛！');
        const rollPanel = screen.getByTestId('betrayal-recent-roll-panel');
        expect(rollPanel).toHaveTextContent('神志检定');
        expect(rollPanel).toHaveTextContent('总点数 4');
        expect(rollPanel).toHaveTextContent('获得 1 点神志或速度');
        fireEvent.click(screen.getByTestId('betrayal-event-choice-trait-speed'));
        expect(screen.getByTestId('betrayal-room-event-choice-target-hallway')).toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-event-choice-panel')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-event-choice-card-front-atlas')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-recent-roll-panel')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-event-choice-rooms')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-event-choice-room-hallway')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-event-choice-confirm')).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId('betrayal-room-hallway'));

        expect(screen.queryByTestId('betrayal-event-choice-panel')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-discovery-panel')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('速度 +1');
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('放置到门厅');
        const spiderSteps = expectDiscoveryResolutionLedgerTraceOnly(1);
        expect(spiderSteps[0]).toHaveTextContent('事件效果');
        expect(spiderSteps[0]).toHaveTextContent('速度 +1');
        expect(spiderSteps[0]).toHaveTextContent('放置到门厅');
        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute('data-backdrop-dismiss', 'disabled');
        expect(screen.getByTestId('betrayal-discovery-continue')).toHaveTextContent('确认');
        expect(screen.getByTestId('betrayal-discovery-continue')).toHaveAttribute('data-pending-card-resolution-step', '1/1');

        const discoveryContinue = screen.queryByTestId('betrayal-discovery-continue');
        if (discoveryContinue) {
            fireEvent.click(discoveryContinue);
        }

        expect(screen.queryByTestId('betrayal-discovery-panel')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('速度 +1');
        expect(screen.getByTestId('betrayal-room-latest-feedback')).toHaveTextContent('放置到门厅');
    });

    it('吊死鬼待选事件能在真实页面选择奖励属性', () => {
        const hangingTree = BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '吊死鬼');
        expect(hangingTree?.effect?.mode).toBe('allTraitChecks');
        const hangingTreeEffect = hangingTree!.effect!;
        if (hangingTreeEffect.mode !== 'allTraitChecks') {
            throw new Error('吊死鬼应为四项属性检定事件');
        }
        const passedResults = hangingTreeEffect.traits.map((trait) => ({
            trait,
            total: 6,
            dice: [2, 2, 2],
            passiveBonus: 0,
            passed: true,
        }));
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.recentAllTraitCheck = {
            sourceTitle: '吊死鬼',
            playerId: '0',
            results: passedResults,
        };
        core.pendingEventChoice = {
            id: 'test-hanging-tree-trait-choice',
            playerId: '0',
            sourceTitle: '吊死鬼',
            effect: {
                ...hangingTreeEffect,
                results: passedResults,
            },
        };

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        expect(screen.getByTestId('betrayal-event-choice-panel')).toHaveAttribute('aria-label', '吊死鬼');
        expect(screen.getByTestId('betrayal-event-choice-all-trait-check')).toHaveTextContent('四项属性检定');
        expect(screen.queryByTestId('betrayal-event-choice-confirm')).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId('betrayal-event-choice-trait-knowledge'));

        expect(screen.queryByTestId('betrayal-event-choice-panel')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('知识 +1');
    });

    it('一条秘密通道待选事件能在真实页面选择第二目标板块', () => {
        const secretPassage = BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '一条秘密通道');
        expect(secretPassage?.roll?.branches).toBeTruthy();
        const successBranch = secretPassage!.roll!.branches.find((branch) => branch.min === 5);
        expect(successBranch?.effect).toBeTruthy();
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'ground-north',
            traits: {
                ...core.currentExplorer.traits,
                knowledge: 4,
            },
            inventory: [],
        };
        core.activeRoomId = 'ground-north';
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = [];
        core.pendingEventChoice = {
            id: 'test-secret-passage-room-choice',
            playerId: '0',
            sourceTitle: '一条秘密通道',
            effect: successBranch!.effect,
        };

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        expect(screen.getByTestId('betrayal-event-choice-panel')).toHaveAttribute('aria-label', '一条秘密通道');
        expect(screen.getByTestId('betrayal-room-event-choice-target-hallway')).toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-event-choice-confirm')).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId('betrayal-room-hallway'));

        expect(screen.queryByTestId('betrayal-event-choice-panel')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('在当前板块放置秘密通道标志物');
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('在门厅放置秘密通道标志物');
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('知识 +1');
        expectSingleEventEffectResolutionStep('在当前板块放置秘密通道标志物', '在门厅放置秘密通道标志物', '知识 +1');
        const discoveryContinue = screen.queryByTestId('betrayal-discovery-continue');
        if (discoveryContinue) {
            fireEvent.click(discoveryContinue);
        }
        expect(screen.queryByTestId('betrayal-discovery-panel')).not.toBeInTheDocument();
    });

    it('秘密升降机待选事件只在真实页面展示不同区域已发现板块', () => {
        const mysticElevatorEvent = BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '秘密升降机');
        expect(mysticElevatorEvent?.effect).toBeTruthy();
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'hallway',
        };
        core.activeRoomId = 'hallway';
        core.pendingEventChoice = {
            id: 'test-mystic-elevator-room-choice',
            playerId: '0',
            sourceTitle: '秘密升降机',
            effect: mysticElevatorEvent!.effect!,
        };
        const dispatch = vi.fn();

        renderBoardWithDispatch(core, dispatch, {
            matchData: defaultMatchData,
        });

        expect(screen.getByTestId('betrayal-event-choice-panel')).toHaveAttribute('aria-label', '秘密升降机');
        expect(screen.queryByTestId('betrayal-room-event-choice-target-hallway')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-room-event-choice-target-entrance-hall')).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('betrayal-room-floor-up'));
        expect(screen.getByTestId('betrayal-room-floor-upper')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-room-event-choice-target-upper-landing')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('betrayal-room-floor-down'));
        fireEvent.click(screen.getByTestId('betrayal-room-floor-down'));
        expect(screen.getByTestId('betrayal-room-floor-basement')).toBeInTheDocument();
        expect(screen.getByTestId('betrayal-room-event-choice-target-basement-landing')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('betrayal-room-basement-landing'));

        expect(dispatch).toHaveBeenCalledWith(BETRAYAL_COMMANDS.RESOLVE_EVENT_CHOICE, {
            accept: true,
            targetRoomId: 'basement-landing',
        });
    });

    it('脑状食品待选事件能在真实页面选择奖励属性和通用伤害属性', () => {
        const brainFood = BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '脑状食品');
        expect(brainFood?.roll?.branches).toBeTruthy();
        const rewardBranch = brainFood!.roll!.branches.find((branch) => branch.min === 5);
        const damageBranch = brainFood!.roll!.branches.find((branch) => branch.min === 0);
        expect(rewardBranch?.effect).toBeTruthy();
        expect(damageBranch?.effect).toBeTruthy();

        const rewardCore = createBetrayalFoundationCore(['0', '1', '2', '3']);
        rewardCore.pendingEventChoice = {
            id: 'test-brain-food-reward-choice',
            playerId: '0',
            sourceTitle: '脑状食品',
            effect: rewardBranch!.effect,
        };

        const rewardRender = render(
            <HarnessBoardWithRandom
                initialCore={rewardCore}
                matchData={defaultMatchData}
            />,
        );

        expect(screen.getByTestId('betrayal-event-choice-panel')).toHaveAttribute('aria-label', '脑状食品');
        expect(screen.queryByTestId('betrayal-event-choice-confirm')).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId('betrayal-event-choice-trait-speed'));

        expect(screen.queryByTestId('betrayal-event-choice-panel')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('速度 +1');
        expectSingleEventEffectResolutionStep('速度 +1');
        const discoveryContinue = screen.queryByTestId('betrayal-discovery-continue');
        if (discoveryContinue) {
            fireEvent.click(discoveryContinue);
        }
        expect(screen.queryByTestId('betrayal-discovery-panel')).not.toBeInTheDocument();
        rewardRender.unmount();

        const damageCore = createBetrayalFoundationCore(['0', '1', '2', '3']);
        damageCore.pendingEventChoice = {
            id: 'test-brain-food-damage-choice',
            playerId: '0',
            sourceTitle: '脑状食品',
            effect: damageBranch!.effect,
        };

        render(
            <HarnessBoardWithRandom
                initialCore={damageCore}
                matchData={defaultMatchData}
            />,
        );

        expect(screen.getByTestId('betrayal-event-choice-panel')).toHaveAttribute('aria-label', '脑状食品');
        fireEvent.click(screen.getByTestId('betrayal-event-choice-damage-might-increase'));
        expect(screen.getByTestId('betrayal-event-choice-damage-might')).toHaveAttribute('data-damage-selected-count', '1');
        expect(screen.getByTestId('betrayal-event-choice-damage-might')).toHaveAttribute('data-trait-preview-mode', 'damage');
        expect(screen.getByTestId('betrayal-event-choice-damage-might')).toHaveAttribute('data-trait-preview-step-count', '1');
        expect(screen.getByTestId('betrayal-event-choice-damage-traits')).not.toHaveTextContent(/承担\s*\d+\s*点|×\d/);
        expect(screen.queryByTestId('betrayal-event-choice-confirm')).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId('betrayal-event-choice-damage-knowledge-increase'));

        expect(screen.queryByTestId('betrayal-event-choice-panel')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('通用伤害 2（力量、知识）');
        expectSingleEventEffectResolutionStep('通用伤害 2（力量、知识）');
        const brainFoodDamageContinue = screen.queryByTestId('betrayal-discovery-continue');
        if (brainFoodDamageContinue) {
            fireEvent.click(brainFoodDamageContinue);
        }
        expect(screen.queryByTestId('betrayal-discovery-panel')).not.toBeInTheDocument();
    });

    it('通用伤害能把多点分到同一条属性轨并显示扣减预览', () => {
        const brainFood = BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '脑状食品');
        const damageBranch = brainFood!.roll!.branches.find((branch) => branch.min === 0);
        expect(damageBranch?.effect).toBeTruthy();

        let core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core = setBoardTraitTrack(core, '0', 'might', [1, 2, 3, 4], 2, 2);
        core.pendingEventChoice = {
            id: 'test-brain-food-repeat-damage-choice',
            playerId: '0',
            sourceTitle: '脑状食品',
            effect: damageBranch!.effect,
        };

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        fireEvent.click(screen.getByTestId('betrayal-event-choice-damage-might-increase'));
        expect(screen.queryByTestId('betrayal-event-choice-confirm')).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId('betrayal-event-choice-damage-might-increase'));

        expect(screen.queryByTestId('betrayal-event-choice-panel')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('通用伤害 2（力量、力量）');
    });

    it('作祟前临界属性不能继续分配伤害，并在预览里标记临界', () => {
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        const mightTrack = core.currentExplorer.traitTracks.might;
        core.currentExplorer = {
            ...core.currentExplorer,
            traits: {
                ...core.currentExplorer.traits,
                might: mightTrack.values[mightTrack.criticalPosition] ?? core.currentExplorer.traits.might,
            },
            traitTracks: {
                ...core.currentExplorer.traitTracks,
                might: { ...mightTrack, position: mightTrack.criticalPosition },
            },
        };
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.pendingEventChoice = {
            id: 'test-critical-damage-choice',
            playerId: '0',
            sourceTitle: '临界伤害测试',
            effect: {
                mode: 'generalDamageChoice',
                amount: 1,
                allowedTraits: ['might', 'speed'],
                recommendedAction: 'endTurn',
            },
        };

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        expect(screen.getByTestId('betrayal-event-choice-damage-might-increase')).toBeDisabled();
        expect(screen.getByTestId('betrayal-event-choice-damage-might')).toHaveAttribute('data-damage-locked', 'true');
        expect(screen.getByTestId('betrayal-event-choice-damage-might')).toHaveAttribute('data-trait-preview-locked', 'true');
        expect(screen.queryByTestId('betrayal-event-choice-confirm')).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId('betrayal-event-choice-damage-might-increase'));
        expect(screen.getByTestId('betrayal-event-choice-panel')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('betrayal-event-choice-damage-speed-increase'));
        expect(screen.queryByTestId('betrayal-event-choice-panel')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('通用伤害 1（速度）');
    });

    it('夜幕众星待选事件能在真实页面选择检定属性', async () => {
        const nightStars = BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '夜幕众星');
        expect(nightStars?.effect).toBeTruthy();
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.currentExplorer = {
            ...core.currentExplorer,
            traits: {
                ...core.currentExplorer.traits,
                knowledge: 4,
            },
            inventory: [],
        };
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = [];
        core.pendingEventChoice = {
            id: 'test-night-stars-trait-choice',
            playerId: '0',
            sourceTitle: '夜幕众星',
            effect: nightStars!.effect!,
        };

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        expect(screen.getByTestId('betrayal-event-choice-panel')).toHaveAttribute('aria-label', '夜幕众星');
        expect(screen.queryByTestId('betrayal-recent-roll-panel')).not.toBeInTheDocument();
        expect(screen.queryByTestId('betrayal-event-choice-confirm')).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId('betrayal-event-choice-trait-knowledge'));

        expect(screen.queryByTestId('betrayal-event-choice-panel')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-recent-roll-panel')).toHaveTextContent('总点数 4');
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('知识检定');
        expect(screen.getByTestId('betrayal-discovery-detail')).toHaveTextContent('知识 -1');
        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute('data-backdrop-dismiss', 'disabled');
        expect(screen.queryByTestId('betrayal-event-roll-finalize')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-discovery-continue')).toBeVisible();
        expect(screen.getByTestId('betrayal-discovery-continue')).toHaveTextContent(/确认/);
        confirmDiscoveryUntilClosed();
        expect(screen.queryByTestId('betrayal-discovery-panel')).not.toBeInTheDocument();
    });

    it('一抹鲜红待选事件能在真实页面跳过作祟检定并进入伤害分配', async () => {
        const crimsonSplash = BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '一抹鲜红');
        expect(crimsonSplash?.effect).toBeTruthy();
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.pendingEventChoice = {
            id: 'test-crimson-splash-choice',
            playerId: '0',
            sourceTitle: '一抹鲜红',
            acceptLabel: '进行作祟检定',
            declineLabel: '跳过作祟检定',
            effect: crimsonSplash!.effect!,
        };

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        expect(screen.getByTestId('betrayal-event-choice-panel')).toHaveAttribute('aria-label', '一抹鲜红');
        fireEvent.click(screen.getByTestId('betrayal-event-choice-decline'));

        expect(screen.queryByTestId('betrayal-event-choice-panel')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-roll-continue')).toHaveTextContent('确认 0/1');
        await waitFor(() => {
            expect(screen.getByTestId('betrayal-roll-continue')).toBeEnabled();
        });
        fireEvent.click(screen.getByTestId('betrayal-roll-continue'));
        await waitFor(() => {
            expect(screen.getByTestId('betrayal-damage-allocation-panel')).toBeInTheDocument();
        }, { timeout: 12000 });
    });

    it('一瓶微尘待选事件能在真实页面跳过作祟检定并结算双属性变化', () => {
        const dustyVial = BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '一瓶微尘');
        expect(dustyVial?.effect).toBeTruthy();
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.pendingEventChoice = {
            id: 'test-dusty-vial-choice',
            playerId: '0',
            sourceTitle: '一瓶微尘',
            acceptLabel: '进行作祟检定',
            declineLabel: '跳过作祟检定',
            effect: dustyVial!.effect!,
        };

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        expect(screen.getByTestId('betrayal-event-choice-panel')).toHaveAttribute('aria-label', '一瓶微尘');
        fireEvent.click(screen.getByTestId('betrayal-event-choice-decline'));

        expect(screen.queryByTestId('betrayal-event-choice-panel')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute('aria-label', '事件牌 一瓶微尘');
        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute('data-backdrop-dismiss', 'disabled');
        expect(screen.getByTestId('betrayal-discovery-continue')).toHaveTextContent('确认');
        expect(screen.getByTestId('betrayal-discovery-continue')).toHaveAttribute('data-pending-card-resolution-step', '1/1');

        const discoveryContinue = screen.queryByTestId('betrayal-discovery-continue');
        if (discoveryContinue) {
            fireEvent.click(discoveryContinue);
        }

        expect(screen.queryByTestId('betrayal-discovery-panel')).not.toBeInTheDocument();
    });

    it('说“茄子”！待选事件能在真实页面跳过作祟检定并抽取物品', () => {
        const sayCheese = BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '说“茄子”！');
        expect(sayCheese?.effect).toBeTruthy();
        const core = createBetrayalFoundationCore(['0', '1', '2', '3']);
        core.possessionOrderByKind.item = [{ id: 'camera', name: '魔法相机', kind: 'item' }];
        core.currentExplorer.inventory = [];
        core.currentExplorerInventory = [];
        core.pendingEventChoice = {
            id: 'test-say-cheese-choice',
            playerId: '0',
            sourceTitle: '说“茄子”！',
            acceptLabel: '进行作祟检定',
            declineLabel: '跳过作祟检定',
            effect: sayCheese!.effect!,
        };

        render(
            <HarnessBoardWithRandom
                initialCore={core}
                matchData={defaultMatchData}
            />,
        );

        expect(screen.getByTestId('betrayal-event-choice-panel')).toHaveAttribute('aria-label', '说“茄子”！');
        fireEvent.click(screen.getByTestId('betrayal-event-choice-decline'));

        expect(screen.queryByTestId('betrayal-event-choice-panel')).not.toBeInTheDocument();
        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute('aria-label', '事件牌 说“茄子”！');
        expect(screen.getByTestId('betrayal-discovery-panel')).toHaveAttribute('data-backdrop-dismiss', 'disabled');
        expect(screen.getByTestId('betrayal-discovery-continue')).toHaveTextContent('确认');
        expect(screen.getByTestId('betrayal-discovery-continue')).toHaveAttribute('data-pending-card-resolution-step', '1/1');
        expect(within(screen.getByTestId('betrayal-inventory-row-item')).getByText('魔法相机')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('betrayal-discovery-continue'));

        expect(screen.queryByTestId('betrayal-discovery-panel')).not.toBeInTheDocument();
    });
});
