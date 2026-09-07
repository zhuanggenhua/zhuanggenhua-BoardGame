import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { GameModeProvider, type GameMode } from '../../../contexts/GameModeContext';
import { ToastProvider } from '../../../contexts/ToastContext';
import { TutorialProvider } from '../../../contexts/TutorialContext';
import { EventStreamRollbackContext, type EventStreamRollbackValue } from '../../../engine/hooks/EventStreamRollbackContext';
import { resetFxFrameClockForTests, type FxAnchorSnapshot, type FxBus, type FxEvent } from '../../../engine/fx';
import { createInitialSystemState } from '../../../engine/pipeline';
import { FLOW_COMMANDS } from '../../../engine/systems/FlowSystem';
import type { GameBoardProps } from '../../../engine/transport/protocol';
import type { RandomFn, SystemState } from '../../../engine/types';
import MageWarsBoard from '../Board';
import {
    getPresetSpellbookCountFromConfig,
    getPresetSpellbookEntriesFromConfig,
} from '../data/configPackage';
import { MageWarsDomain, MAGE_WARS_COMMANDS, type MageWarsArenaObjectState, type MageWarsCore } from '../domain';
import { MAGE_WARS_EVENTS } from '../domain/events';
import { engineConfig } from '../game';
import {
    ARENA_ZONE_IDS,
    MAGE_IDS,
    MAGE_WARS_MAGE_ABILITY_IDS,
    MAGE_WARS_OBJECT_ABILITY_IDS,
    STATUS_TOKEN_IDS,
} from '../domain/ids';
import {
    AttackImpactRenderer,
    DamageImpactRenderer,
    HealingImpactRenderer,
    MovementRenderer,
    SpellPushRenderer,
    SpellTeleportRenderer,
    SummonRenderer,
} from '../ui/fxRenderers';
import { mageWarsFxRegistry } from '../ui/fxSetup';
import { MAGE_WARS_ARENA_FX_SURFACE_ID, useMageWarsGameEvents } from '../ui/useGameEvents';

vi.mock('react-i18next', () => ({
    initReactI18next: { type: '3rdParty', init: vi.fn() },
    useTranslation: () => ({
        i18n: { language: 'zh-CN' },
        t: (key: string, params?: Record<string, string | number>) => {
            if (key === 'spellbook.selected') return '已选';
            if (key === 'spellbook.selectedCount') return `选 ${params?.count}`;
            return params ? `${key}:${JSON.stringify(params)}` : key;
        },
    }),
}));

vi.mock('../../../components/common/media/OptimizedImage', () => ({
    OptimizedImage: ({ src, alt, className }: { src: string; alt?: string; className?: string }) => (
        <img data-testid="mock-optimized-image" src={src} alt={alt ?? ''} className={className} />
    ),
}));

vi.mock('../../../components/common/media/CardPreview', () => ({
    CardPreview: ({ title, className }: { title?: string; className?: string }) => (
        <div data-testid="mock-card-preview" className={className}>{title}</div>
    ),
}));


vi.mock('../../../components/common/animations/BurstParticles', () => ({
    BurstParticles: ({
        active,
        preset,
        quality,
        overflow,
    }: {
        active?: boolean;
        preset?: string;
        quality?: string;
        overflow?: number;
    }) => (
        <div
            data-testid="mock-burst-particles"
            data-active={String(active)}
            data-preset={preset ?? ''}
            data-quality={quality ?? ''}
            data-overflow={String(overflow ?? '')}
        />
    ),
}));

vi.mock('../../../components/common/animations/ConeBlast', () => ({
    ConeBlast: ({
        start,
        end,
        intensity,
        quality,
        durationMs,
        motionEasing,
        color,
    }: {
        start?: { xPct?: number; yPct?: number };
        end?: { xPct?: number; yPct?: number };
        intensity?: string;
        quality?: string;
        durationMs?: number;
        motionEasing?: string;
        color?: string[];
    }) => (
        <div
            data-testid="mock-cone-blast"
            data-start-x={String(start?.xPct ?? '')}
            data-start-y={String(start?.yPct ?? '')}
            data-end-x={String(end?.xPct ?? '')}
            data-end-y={String(end?.yPct ?? '')}
            data-intensity={intensity ?? ''}
            data-quality={quality ?? ''}
            data-duration-ms={String(durationMs ?? '')}
            data-motion-easing={motionEasing ?? ''}
            data-color={color?.join('|') ?? ''}
        />
    ),
}));

vi.mock('../../../components/common/animations/SummonHybridEffect', () => ({
    SummonHybridEffect: ({
        active,
        intensity,
        color,
        originY,
        quality,
        durationScale,
        visualScale,
        dimStrength,
        onImpact,
    }: {
        active?: boolean;
        intensity?: string;
        color?: string;
        originY?: number;
        quality?: string;
        durationScale?: number;
        visualScale?: number;
        dimStrength?: number;
        onImpact?: () => void;
    }) => (
        <button
            type="button"
            data-testid="mock-summon-hybrid-effect"
            data-active={String(active)}
            data-intensity={intensity ?? ''}
            data-color={color ?? ''}
            data-origin-y={String(originY ?? '')}
            data-quality={quality ?? ''}
            data-duration-scale={String(durationScale ?? '')}
            data-visual-scale={String(visualScale ?? '')}
            data-dim-strength={String(dimStrength ?? '')}
            data-has-impact={String(Boolean(onImpact))}
            onClick={onImpact}
        />
    ),
}));

vi.mock('../../../components/common/animations/DamageFlash', () => ({
    DamageFlash: ({
        damage,
        intensity,
        showNumber = true,
        startDelayMs = 0,
        numberDelayMs = 0,
        numberTestId,
        numberFontScale,
        numberColorClass,
        numberDurationSeconds,
        showRedPulse = true,
    }: {
        damage?: number;
        intensity?: string;
        showNumber?: boolean;
        startDelayMs?: number;
        numberDelayMs?: number;
        numberTestId?: string;
        numberFontScale?: number;
        numberColorClass?: string;
        numberDurationSeconds?: number;
        showRedPulse?: boolean;
    }) => (
        <div
            data-testid="mock-damage-flash"
            data-show-number={String(showNumber)}
            data-intensity={intensity ?? ''}
            data-start-delay-ms={String(startDelayMs)}
            data-number-delay-ms={String(numberDelayMs)}
            data-number-testid={numberTestId ?? ''}
            data-number-font-scale={String(numberFontScale ?? '')}
            data-number-color-class={numberColorClass ?? ''}
            data-number-duration-seconds={String(numberDurationSeconds ?? '')}
            data-show-red-pulse={String(showRedPulse)}
        >
            {damage}
        </div>
    ),
}));

const fixedRandom: RandomFn = {
    random: () => 0.5,
    d: () => 3,
    range: (min: number) => min,
    shuffle: <T,>(array: T[]) => [...array],
};

function withConfiguredSpellbooks(core: MageWarsCore): MageWarsCore {
    return {
        ...core,
        players: Object.fromEntries(Object.entries(core.players).map(([playerId, player]) => {
            const spellbookEntries = getPresetSpellbookEntriesFromConfig(player.mageId);
            return [playerId, {
                ...player,
                spellbookEntries,
                spellbookCount: getPresetSpellbookCountFromConfig(player.mageId),
            }];
        })) as MageWarsCore['players'],
    };
}

function boardProps(
    coreOverride?: MageWarsCore,
    playerID = '0',
    sysOverride?: Partial<SystemState>,
): GameBoardProps<MageWarsCore> {
    const playerIds = ['0', '1'];
    const core = withConfiguredSpellbooks(coreOverride ?? MageWarsDomain.setup(playerIds, fixedRandom));
    return {
        G: {
            core,
            sys: {
                ...createInitialSystemState(playerIds, engineConfig.systems, 'local:mage-wars-board-fx'),
                phase: 'creatureAction',
                ...sysOverride,
            },
        },
        dispatch: vi.fn(),
        playerID,
        isMultiplayer: false,
        isConnected: true,
    };
}

function creatureObject(
    id: string,
    ownerId: string,
    sourceSpellCardId: number,
    name: string,
    zoneId: typeof ARENA_ZONE_IDS[keyof typeof ARENA_ZONE_IDS],
): MageWarsArenaObjectState {
    return {
        id,
        kind: 'creature',
        ownerId,
        sourceSpellCardId,
        sourceObjectId: `spell-${sourceSpellCardId}`,
        name,
        zoneId,
        life: 4,
        damage: 0,
        armor: 0,
        actionReady: true,
        guarding: false,
        statusTokens: {},
    };
}

const getCellPosition = (row: number, col: number) => ({
    left: col * 25,
    top: row * 33.3333,
    width: 25,
    height: 33.3333,
});

function anchorSnapshot(
    anchorId: string,
    anchorKind: FxAnchorSnapshot['anchorKind'],
    box: FxAnchorSnapshot['box'],
): FxAnchorSnapshot {
    return {
        surfaceId: MAGE_WARS_ARENA_FX_SURFACE_ID,
        anchorId,
        anchorKind,
        entityRef: anchorId,
        box,
        center: {
            xPct: box.left + box.width / 2,
            yPct: box.top + box.height / 2,
        },
        size: {
            widthPct: box.width,
            heightPct: box.height,
        },
        capturedAt: 1,
        mode: 'spawn-snapshot',
    };
}

function renderFxRenderer(
    renderer: ReactElement,
) {
    return render(
        <div style={{ position: 'relative', width: 800, height: 600 }}>
            {renderer}
        </div>,
    );
}

function withBoardProviders(board: ReactElement, mode: GameMode = 'test'): ReactElement {
    return (
        <ToastProvider>
            <GameModeProvider mode={mode}>
                <TutorialProvider>
                    {board}
                </TutorialProvider>
            </GameModeProvider>
        </ToastProvider>
    );
}

function renderBoardWithProviders(board: ReactElement, mode?: GameMode) {
    return render(withBoardProviders(board, mode));
}

function visibleDesktopSpellbookCardIds(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll<HTMLElement>('[data-testid="mage-wars-desktop-spellbook-card"]'))
        .map((card) => card.getAttribute('data-source-card-id'))
        .filter((cardId): cardId is string => cardId != null);
}

function advanceSharedFxClockDelay(delayMs: number) {
    const totalMs = delayMs + 64;
    for (let elapsed = 0; elapsed < totalMs; elapsed += 16) {
        vi.advanceTimersByTime(16);
    }
}

function createRecordingFxBus(ids: string[]): FxBus {
    const idQueue = [...ids];
    const pushed: FxEvent[] = [];
    return {
        push: vi.fn((cue, ctx, params) => {
            const id = idQueue.shift() ?? null;
            if (id) {
                pushed.push({ id, cue, ctx, params });
            }
            return id;
        }),
        pushEvent: vi.fn((input) => {
            const id = idQueue.shift() ?? null;
            if (id) {
                pushed.push({ id, ...input });
            }
            return id;
        }),
        pushSequence: vi.fn(() => null),
        cancelSequence: vi.fn(),
        activeEffects: pushed,
        removeEffect: vi.fn(),
        registry: mageWarsFxRegistry,
        fireImpact: vi.fn(),
    };
}

describe('MageWarsBoard FX wiring', () => {
    it('mounts the board with the event-driven FX layer attached', () => {
        renderBoardWithProviders(<MageWarsBoard {...boardProps()} />);

        expect(screen.queryByTestId('mage-wars-board')).not.toBeNull();
    });

    it('does not dispatch a local reset advance from the Board mount layer', () => {
        const props = boardProps(undefined, '0', { phase: 'reset' });
        renderBoardWithProviders(<MageWarsBoard {...props} />);

        expect(props.dispatch).not.toHaveBeenCalledWith(FLOW_COMMANDS.ADVANCE_PHASE, {});
    });

    it('uses the moved target previous anchor as relocation FX source instead of the caster', async () => {
        const baseCore = MageWarsDomain.setup(['0', '1'], fixedRandom);
        const targetBefore = creatureObject('mwobj-push-left-target', '1', 2909, '被推目标', ARENA_ZONE_IDS.C2);
        const beforeCore: MageWarsCore = {
            ...baseCore,
            objects: {
                [targetBefore.id]: targetBefore,
            },
            arena: baseCore.arena.map((zone) => (
                zone.id === ARENA_ZONE_IDS.C2
                    ? { ...zone, objectIds: [targetBefore.id] }
                    : zone
            )),
        };
        const targetAfter: MageWarsArenaObjectState = {
            ...targetBefore,
            zoneId: ARENA_ZONE_IDS.B2,
        };
        const afterCore: MageWarsCore = {
            ...baseCore,
            objects: {
                [targetAfter.id]: targetAfter,
            },
            arena: baseCore.arena.map((zone) => (
                zone.id === ARENA_ZONE_IDS.B2
                    ? { ...zone, objectIds: [targetAfter.id] }
                    : zone
            )),
        };
        const beforeTargetSnapshot = anchorSnapshot(targetBefore.id, 'entity', {
            left: 62,
            top: 40,
            width: 8,
            height: 10,
        });
        const afterTargetSnapshot = anchorSnapshot(targetAfter.id, 'entity', {
            left: 37,
            top: 40,
            width: 8,
            height: 10,
        });
        const casterSnapshot = anchorSnapshot('0', 'player', {
            left: 10,
            top: 74,
            width: 8,
            height: 10,
        });
        let renderPhase: 'before' | 'after' = 'before';
        const resolveFxAnchorSnapshot = vi.fn((anchor: { anchorId?: string; anchorKind?: string } | string | undefined | null) => {
            const anchorId = typeof anchor === 'string' ? anchor : anchor?.anchorId;
            const anchorKind = typeof anchor === 'string' ? undefined : anchor?.anchorKind;
            if (anchorId === targetBefore.id && anchorKind === 'entity') {
                return renderPhase === 'before' ? beforeTargetSnapshot : afterTargetSnapshot;
            }
            if (anchorId === '0' && anchorKind === 'player') {
                return casterSnapshot;
            }
            return null;
        });
        const fxBus = createRecordingFxBus(['fx-push-left']);
        const beforeG = boardProps(beforeCore).G;
        const { rerender } = renderHook(
            ({ currentG }) => useMageWarsGameEvents({ G: currentG, fxBus, resolveFxAnchorSnapshot }),
            { initialProps: { currentG: beforeG } },
        );

        renderPhase = 'after';
        const afterG = boardProps(afterCore, '0', {
            eventStream: {
                entries: [
                    {
                        id: 1,
                        event: {
                            type: MAGE_WARS_EVENTS.SPELL_PUSH_RESOLVED,
                            payload: {
                                playerId: '0',
                                spellCardId: 1711,
                                sourceAbilityId: 'mw.spell.1711',
                                targetObjectId: targetBefore.id,
                                fromZoneId: ARENA_ZONE_IDS.C2,
                                toZoneId: ARENA_ZONE_IDS.B2,
                            },
                            timestamp: 1,
                        },
                    },
                ],
                maxEntries: 200,
                nextId: 2,
            },
        }).G;

        act(() => {
            rerender({ currentG: afterG });
        });
        await act(async () => {});

        expect(fxBus.push).toHaveBeenCalledTimes(1);
        const pushed = fxBus.activeEffects[0];
        expect(pushed.cue).toBe('mage-wars.spell.push');
        expect((pushed.params?.sourceSnapshot as FxAnchorSnapshot | undefined)?.anchorId).toBe(targetBefore.id);
        expect((pushed.params?.targetSnapshot as FxAnchorSnapshot | undefined)?.anchorId).toBe(targetBefore.id);
        expect((pushed.params?.sourceSnapshot as FxAnchorSnapshot | undefined)?.box.top).toBe(40);
        expect((pushed.params?.targetSnapshot as FxAnchorSnapshot | undefined)?.box.top).toBe(40);
        expect((pushed.params?.sourceSnapshot as FxAnchorSnapshot | undefined)?.anchorId).not.toBe('0');
    });

    it('plays summon FX when the confirmed online state arrives during reconcile', async () => {
        let rollbackValue: EventStreamRollbackValue = {
            watermark: null,
            seq: 0,
            reconcileSeq: 0,
        };
        const renderWithRollback = (
            core: MageWarsCore,
            sysOverride?: Partial<SystemState>,
        ) => (
            <EventStreamRollbackContext.Provider value={rollbackValue}>
                <MageWarsBoard {...boardProps(core, '0', sysOverride)} />
            </EventStreamRollbackContext.Provider>
        );

        const baseCore = MageWarsDomain.setup(['0', '1'], fixedRandom);
        const summoned = creatureObject('mwobj-0-cat-confirmed', '0', 2906, '确认山猫', ARENA_ZONE_IDS.A3);
        const afterCore: MageWarsCore = {
            ...baseCore,
            objects: {
                [summoned.id]: summoned,
            },
            arena: baseCore.arena.map((zone) => (
                zone.id === ARENA_ZONE_IDS.A3
                    ? { ...zone, objectIds: [summoned.id] }
                    : zone
            )),
        };
        const sysWithSummon: Partial<SystemState> = {
            eventStream: {
                entries: [
                    {
                        id: 1,
                        event: {
                            type: MAGE_WARS_EVENTS.ARENA_OBJECT_SUMMONED,
                            payload: { object: summoned },
                            timestamp: 1,
                        },
                    },
                ],
                maxEntries: 200,
                nextId: 2,
            },
        };

        const { rerender } = render(withBoardProviders(renderWithRollback(baseCore)));

        rollbackValue = {
            watermark: null,
            seq: 0,
            reconcileSeq: 1,
        };
        act(() => {
            rerender(withBoardProviders(renderWithRollback(afterCore, sysWithSummon)));
        });

        await waitFor(() => {
            expect(screen.queryByTestId('mage-wars-fx-summon')).not.toBeNull();
        });
        expect(screen.getByTestId('mage-wars-fx-layer').getAttribute('data-fx-active-cues')).toContain('mage-wars.summon');
    });

    it('plays required summon FX when the first rendered board state already contains the summon event', async () => {
        const baseCore = MageWarsDomain.setup(['0', '1'], fixedRandom);
        const summoned = creatureObject('mwobj-0-cat-initial', '0', 2906, '首屏山猫', ARENA_ZONE_IDS.A3);
        const afterCore: MageWarsCore = {
            ...baseCore,
            objects: {
                [summoned.id]: summoned,
            },
            arena: baseCore.arena.map((zone) => (
                zone.id === ARENA_ZONE_IDS.A3
                    ? { ...zone, objectIds: [summoned.id] }
                    : zone
            )),
        };

        renderBoardWithProviders(<MageWarsBoard
                {...boardProps(afterCore, '0', {
                    eventStream: {
                        entries: [
                            {
                                id: 1,
                                event: {
                                    type: MAGE_WARS_EVENTS.ARENA_OBJECT_SUMMONED,
                                    payload: { object: summoned },
                                    timestamp: 1,
                                },
                            },
                        ],
                        maxEntries: 200,
                        nextId: 2,
                    },
                })}
            />);

        await waitFor(() => {
            expect(screen.queryByTestId('mage-wars-fx-summon')).not.toBeNull();
        });
        expect(screen.getByTestId('mage-wars-fx-layer').getAttribute('data-fx-active-cues')).toContain('mage-wars.summon');
        expect(screen.getByTestId('mage-wars-board').getAttribute('data-mage-wars-last-consumed-events')).toContain(MAGE_WARS_EVENTS.ARENA_OBJECT_SUMMONED);
    });

    it('renders summoned arena objects from core object state', () => {
        const baseCore = MageWarsDomain.setup(['0', '1'], fixedRandom);
        const object: MageWarsArenaObjectState = {
            id: 'mwobj-0-2906-1',
            kind: 'creature',
            ownerId: '0',
            sourceSpellCardId: 2906,
            sourceObjectId: 'spell-2906',
            name: '野性山猫',
            zoneId: ARENA_ZONE_IDS.A1,
            life: 4,
            damage: 2,
            armor: 0,
            actionReady: false,
            guarding: false,
            statusTokens: {},
        };
        const core: MageWarsCore = {
            ...baseCore,
            objects: {
                [object.id]: object,
            },
            arena: baseCore.arena.map((zone) => (
                zone.id === ARENA_ZONE_IDS.A1
                    ? { ...zone, objectIds: [object.id] }
                    : zone
            )),
        };

        renderBoardWithProviders(<MageWarsBoard {...boardProps(core)} />);

        const fieldCard = screen.getByText('野性山猫').closest('[data-testid="mage-wars-zone-field-card"]');
        expect(fieldCard).not.toBeNull();
        expect(fieldCard?.getAttribute('data-object-id')).toBe(object.id);
        expect(screen.getAllByTestId('mock-card-preview').some((node) => node.textContent === '野性山猫')).toBe(true);
    });

    it('shows the spent action token without dimming newly summoned creatures', () => {
        const baseCore = MageWarsDomain.setup(['0', '1'], fixedRandom);
        const wolf: MageWarsArenaObjectState = {
            ...creatureObject('mwobj-0-2819-1', '0', 2819, '丛林灰狼', ARENA_ZONE_IDS.A3),
            actionReady: false,
        };
        const readyCat: MageWarsArenaObjectState = {
            ...creatureObject('mwobj-0-2906-1', '0', 2906, '野性山猫', ARENA_ZONE_IDS.A3),
            actionReady: true,
        };
        const core: MageWarsCore = {
            ...baseCore,
            objects: {
                ...baseCore.objects,
                [wolf.id]: wolf,
                [readyCat.id]: readyCat,
            },
            arena: baseCore.arena.map((zone) => ({
                ...zone,
                occupantIds: zone.id === ARENA_ZONE_IDS.A3
                    ? ['0']
                    : zone.occupantIds.filter((id) => id !== '0'),
                objectIds: zone.id === ARENA_ZONE_IDS.A3
                    ? [wolf.id, readyCat.id]
                    : zone.objectIds.filter((id) => id !== wolf.id && id !== readyCat.id),
            })),
        };

        renderBoardWithProviders(<MageWarsBoard {...boardProps(core)} />);

        const spentWolf = screen.getByText('丛林灰狼')
            .closest<HTMLElement>('[data-testid="mage-wars-zone-field-card"]');
        const readyCatCard = screen.getByText('野性山猫')
            .closest<HTMLElement>('[data-testid="mage-wars-zone-field-card"]');

        expect(spentWolf).not.toBeNull();
        expect(spentWolf?.getAttribute('data-action-ready')).toBe('false');
        expect(spentWolf?.getAttribute('data-action-token-state')).toBe('spent');
        expect(spentWolf?.getAttribute('data-visual-action-state')).toBeNull();
        expect(spentWolf?.className).not.toContain('grayscale');
        expect(spentWolf?.className).not.toContain('opacity-55');
        expect(spentWolf?.className).not.toContain('brightness-75');
        expect(spentWolf?.className).not.toContain('saturate-50');
        const spentActionToken = spentWolf?.querySelector<HTMLElement>('[data-testid="mage-wars-action-token-slot"] img');
        const spentActionTokenSlot = spentWolf?.querySelector<HTMLElement>('[data-testid="mage-wars-action-token-slot"]');
        expect(spentActionToken).not.toBeNull();
        expect(spentActionTokenSlot?.getAttribute('data-action-token-image-key')).toContain('ready-token-back');
        expect(spentActionToken?.getAttribute('src')).toContain('ready-token-back');
        expect(spentActionTokenSlot?.getAttribute('data-action-token-position')).toBe('entity-left-inside-midline');
        expect(spentActionTokenSlot?.closest('[data-testid="mage-wars-entity-status-token-rail"]')?.getAttribute('data-token-rail-axis')).toBe('vertical');
        expect(spentActionTokenSlot?.closest('[data-testid="mage-wars-entity-status-token-rail"]')?.getAttribute('data-token-rail-position')).toBe('entity-left-inside-midline');
        expect(readyCatCard).not.toBeNull();
        expect(readyCatCard?.getAttribute('data-action-ready')).toBe('true');
        expect(readyCatCard?.getAttribute('data-action-token-state')).toBe('ready');
        expect(readyCatCard?.getAttribute('data-visual-action-state')).toBeNull();
        expect(readyCatCard?.className).not.toContain('grayscale');
        const readyActionToken = readyCatCard?.querySelector<HTMLElement>('[data-testid="mage-wars-action-token-slot"] img');
        const readyActionTokenSlot = readyCatCard?.querySelector<HTMLElement>('[data-testid="mage-wars-action-token-slot"]');
        expect(readyActionToken).not.toBeNull();
        expect(readyActionTokenSlot?.getAttribute('data-action-token-image-key')).toContain('ready-token-front');
        expect(readyActionToken?.getAttribute('src')).toContain('ready-token-front');
        expect(readyActionTokenSlot?.getAttribute('data-action-token-position')).toBe('entity-left-inside-midline');
        expect(screen.queryAllByTestId('mage-wars-mage-hud-token-icon')).toHaveLength(0);
        expect(screen.queryAllByTestId('mage-wars-mage-hud-current-badge').some((badge) => badge.querySelector('img'))).toBe(false);
    });

    it('uses public view switching for opponent discard instead of rendering a second discard pile', async () => {
        const baseCore = MageWarsDomain.setup(['0', '1'], fixedRandom);
        const core: MageWarsCore = {
            ...baseCore,
            players: {
                ...baseCore.players,
                '0': {
                    ...baseCore.players['0'],
                    discardSpellCardIds: [3403],
                },
                '1': {
                    ...baseCore.players['1'],
                    discardSpellCardIds: [1706, 2811],
                },
            },
        };

        renderBoardWithProviders(<MageWarsBoard {...boardProps(core, '0')} />);

        const board = screen.getByTestId('mage-wars-board');
        const discardPile = screen.getByTestId('mage-wars-discard-pile');
        expect(screen.queryByTestId('mage-wars-opponent-discard-pile')).toBeNull();
        expect(discardPile.getAttribute('data-discard-owner-role')).toBe('self');
        expect(discardPile.getAttribute('data-discard-owner-id')).toBe('0');
        expect(board.getAttribute('data-mage-wars-public-view-player-id')).toBe('0');

        fireEvent.click(screen.getByTestId('mage-wars-observe-player-button'));

        await waitFor(() => {
            expect(screen.getByTestId('mage-wars-board').getAttribute('data-mage-wars-public-view-player-id')).toBe('1');
            expect(screen.getByTestId('mage-wars-board').getAttribute('data-mage-wars-public-view-role')).toBe('opponent');
            expect(screen.getByTestId('mage-wars-discard-pile').getAttribute('data-discard-owner-role')).toBe('opponent');
            expect(screen.getByTestId('mage-wars-discard-pile').getAttribute('data-discard-owner-id')).toBe('1');
        });
        const publicViewBanner = screen.getByTestId('mage-wars-public-view-banner');
        expect(publicViewBanner.className).toContain('inset-x-0');
        expect(publicViewBanner.className).toContain('justify-center');
        expect(publicViewBanner.className).not.toContain('left-16');
        expect(screen.queryByTestId('mage-wars-opponent-discard-pile')).toBeNull();
    });

    it('keeps same-zone ownership lanes anchored to fixed seats instead of viewer perspective', () => {
        const baseCore = MageWarsDomain.setup(['0', '1'], fixedRandom);
        const leftSeatObject = creatureObject('mwobj-left-cat', '0', 2906, '左席位山猫', ARENA_ZONE_IDS.A2);
        const leftSeatSupport = creatureObject('mwobj-left-wolf', '0', 2819, '左席位灰狼', ARENA_ZONE_IDS.A2);
        const rightSeatObject = creatureObject('mwobj-right-knight', '1', 2909, '右席位骑士', ARENA_ZONE_IDS.A2);
        const core: MageWarsCore = {
            ...baseCore,
            objects: {
                [leftSeatObject.id]: leftSeatObject,
                [leftSeatSupport.id]: leftSeatSupport,
                [rightSeatObject.id]: rightSeatObject,
            },
            arena: baseCore.arena.map((zone) => (
                zone.id === ARENA_ZONE_IDS.A2
                    ? { ...zone, objectIds: [leftSeatObject.id, leftSeatSupport.id, rightSeatObject.id] }
                    : zone
            )),
        };

        renderBoardWithProviders(<MageWarsBoard {...boardProps(core, '1')} />);

        const leftSeatCard = screen.getByText('左席位山猫').closest('[data-testid="mage-wars-zone-field-card"]');
        const leftSeatSupportCard = screen.getByText('左席位灰狼').closest('[data-testid="mage-wars-zone-field-card"]');
        const rightSeatCard = screen.getByText('右席位骑士').closest('[data-testid="mage-wars-zone-field-card"]');
        const laneGroup = leftSeatCard?.closest('[data-testid="mage-wars-zone-ownership-lanes"]');
        const leftLane = leftSeatCard?.closest('[data-lane-owner-side]');
        const rightLane = rightSeatCard?.closest('[data-lane-owner-side]');
        expect(laneGroup?.getAttribute('data-layout-axis')).toBe('horizontal');
        expect(laneGroup?.getAttribute('data-owner-lane-axis')).toBe('horizontal');
        expect(laneGroup?.className).toContain('grid-cols-[minmax(0,1fr)_minmax(0,1fr)]');
        expect(laneGroup?.className).not.toContain('grid-rows');
        expect(leftLane?.getAttribute('data-lane-owner-side')).toBe('seat-left');
        expect(leftLane?.getAttribute('data-lane-stack-axis')).toBe('vertical');
        expect(leftLane?.querySelectorAll('[data-testid="mage-wars-zone-field-card"]')).toHaveLength(2);
        expect(leftSeatSupportCard?.closest('[data-lane-owner-side]')).toBe(leftLane);
        expect(rightLane?.getAttribute('data-lane-owner-side')).toBe('seat-right');
        expect(rightLane?.getAttribute('data-lane-stack-axis')).toBe('vertical');
        expect(rightLane?.querySelectorAll('[data-testid="mage-wars-zone-field-card"]')).toHaveLength(1);
        expect(leftSeatCard?.getAttribute('data-owner-side')).toBe('seat-left');
        expect(leftSeatSupportCard?.getAttribute('data-owner-side')).toBe('seat-left');
        expect(rightSeatCard?.getAttribute('data-owner-side')).toBe('seat-right');
    });

    it('anchors concrete arena-object tutorial highlights on the real clickable field card', async () => {
        const baseCore = MageWarsDomain.setup(['0', '1'], fixedRandom);
        const targetObject = creatureObject('mwobj-left-cleric-burn', '0', 2819, '燃烧牧师', ARENA_ZONE_IDS.A2);
        const core: MageWarsCore = {
            ...baseCore,
            objects: {
                [targetObject.id]: targetObject,
            },
            arena: baseCore.arena.map((zone) => (
                zone.id === ARENA_ZONE_IDS.A2
                    ? { ...zone, objectIds: [targetObject.id] }
                    : zone
            )),
        };
        const tutorialStep = {
            id: 'burn-rule',
            content: 'burn-rule',
            highlightTarget: `mw-arena-object-${targetObject.id}`,
        };

        renderBoardWithProviders(
            <MageWarsBoard
                {...boardProps(core, '0', {
                    tutorial: {
                        active: true,
                        manifestId: 'mage-wars-board-test',
                        stepIndex: 0,
                        steps: [tutorialStep],
                        step: tutorialStep,
                    },
                })}
            />,
            'tutorial',
        );

        const targetCard = screen.getByText('燃烧牧师')
            .closest<HTMLElement>('[data-testid="mage-wars-zone-field-card"]');
        await waitFor(() => {
            expect(targetCard?.getAttribute('data-tutorial-id')).toBe(`mw-arena-object-${targetObject.id}`);
        });
        expect(targetCard?.getAttribute('data-tutorial-object-id')).toBe(`mw-arena-object-${targetObject.id}`);
        expect(targetCard?.querySelector(`[data-tutorial-id="mw-arena-object-${targetObject.id}"]`)).toBeNull();
    });

    it('buffers arena object damage until attack impact', async () => {
        vi.useFakeTimers();
        const baseCore = MageWarsDomain.setup(['0', '1'], fixedRandom);
        const attacker = creatureObject('mwobj-left-attacker', '0', 2906, '缓冲来源', ARENA_ZONE_IDS.A2);
        const targetBefore = creatureObject('mwobj-right-target', '1', 2909, '缓冲目标', ARENA_ZONE_IDS.B2);
        const targetAfter: MageWarsArenaObjectState = {
            ...targetBefore,
            damage: 3,
        };
        const beforeCore: MageWarsCore = {
            ...baseCore,
            objects: {
                [attacker.id]: attacker,
                [targetBefore.id]: targetBefore,
            },
            arena: baseCore.arena.map((zone) => (
                zone.id === ARENA_ZONE_IDS.A2
                    ? { ...zone, objectIds: [attacker.id] }
                    : zone.id === ARENA_ZONE_IDS.B2
                        ? { ...zone, objectIds: [targetBefore.id] }
                        : zone
            )),
        };
        const afterCore: MageWarsCore = {
            ...beforeCore,
            objects: {
                [attacker.id]: attacker,
                [targetAfter.id]: targetAfter,
            },
        };
        const sysWithAttack = {
            eventStream: {
                entries: [
                    {
                        id: 1,
                        event: {
                            type: MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED,
                            payload: {
                                ownerId: '0',
                                attackerObjectId: attacker.id,
                                attackProfileId: 'bite',
                                targetObjectId: targetAfter.id,
                                targetZoneId: ARENA_ZONE_IDS.B2,
                                diceResults: [3],
                                baseDamage: 3,
                            },
                            timestamp: 1,
                        },
                    },
                    {
                        id: 2,
                        event: {
                            type: 'DAMAGE_DEALT',
                            payload: {
                                targetId: targetAfter.id,
                                amount: 3,
                                actualDamage: 3,
                                sourceAbilityId: 'test.attack',
                            },
                            timestamp: 2,
                        },
                    },
                ],
                maxEntries: 200,
                nextId: 3,
            },
        };

        try {
            const { rerender } = renderBoardWithProviders(<MageWarsBoard {...boardProps(beforeCore)} />);

            act(() => {
                rerender(withBoardProviders(<MageWarsBoard {...boardProps(afterCore, '0', sysWithAttack)} />));
            });

            const targetCard = screen.getByText('缓冲目标').closest('[data-testid="mage-wars-zone-field-card"]');
            expect(targetCard?.getAttribute('data-visual-damage')).toBe('0');
            expect(screen.queryByTestId('mage-wars-fx-attack-travel')).not.toBeNull();

            act(() => {
                advanceSharedFxClockDelay(2600);
            });
            await act(async () => {});

            const releasedTargetCard = screen.getByText('缓冲目标').closest('[data-testid="mage-wars-zone-field-card"]');
            expect(releasedTargetCard?.getAttribute('data-visual-damage')).toBe('3');
        } finally {
            resetFxFrameClockForTests();
            vi.useRealTimers();
        }
    });

    it('keeps a defeated attack target visually anchored until the attack FX completes', async () => {
        vi.useFakeTimers();
        const baseCore = MageWarsDomain.setup(['0', '1'], fixedRandom);
        const attacker = creatureObject('mwobj-left-finisher', '0', 2906, '击败来源', ARENA_ZONE_IDS.A2);
        const targetBefore = creatureObject('mwobj-right-defeated', '1', 2909, '击败目标', ARENA_ZONE_IDS.B2);
        const beforeCore: MageWarsCore = {
            ...baseCore,
            objects: {
                [attacker.id]: attacker,
                [targetBefore.id]: targetBefore,
            },
            arena: baseCore.arena.map((zone) => (
                zone.id === ARENA_ZONE_IDS.A2
                    ? { ...zone, objectIds: [attacker.id] }
                    : zone.id === ARENA_ZONE_IDS.B2
                        ? { ...zone, objectIds: [targetBefore.id] }
                        : zone
            )),
        };
        const afterCore: MageWarsCore = {
            ...beforeCore,
            objects: {
                [attacker.id]: attacker,
            },
            arena: beforeCore.arena.map((zone) => (
                zone.id === ARENA_ZONE_IDS.B2
                    ? { ...zone, objectIds: [] }
                    : zone
            )),
        };
        const sysWithDefeatingAttack = {
            eventStream: {
                entries: [
                    {
                        id: 1,
                        event: {
                            type: MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED,
                            payload: {
                                ownerId: '0',
                                attackerObjectId: attacker.id,
                                attackProfileId: 'bite',
                                targetObjectId: targetBefore.id,
                                targetZoneId: ARENA_ZONE_IDS.B2,
                                diceResults: [3],
                                baseDamage: 4,
                            },
                            timestamp: 1,
                        },
                    },
                    {
                        id: 2,
                        event: {
                            type: 'DAMAGE_DEALT',
                            payload: {
                                targetId: targetBefore.id,
                                amount: 4,
                                actualDamage: 4,
                                sourceAbilityId: 'test.attack',
                            },
                            timestamp: 2,
                        },
                    },
                    {
                        id: 3,
                        event: {
                            type: MAGE_WARS_EVENTS.ARENA_OBJECT_DEFEATED,
                            payload: {
                                objectId: targetBefore.id,
                                ownerId: targetBefore.ownerId,
                                sourceAbilityId: 'test.attack',
                            },
                            timestamp: 3,
                        },
                    },
                ],
                maxEntries: 200,
                nextId: 4,
            },
        };

        try {
            const { rerender } = renderBoardWithProviders(<MageWarsBoard {...boardProps(beforeCore)} />);

            act(() => {
                rerender(withBoardProviders(<MageWarsBoard {...boardProps(afterCore, '0', sysWithDefeatingAttack)} />));
            });

            const heldTargetCard = screen.getByText('击败目标').closest('[data-testid="mage-wars-zone-field-card"]');
            expect(heldTargetCard).not.toBeNull();
            expect(heldTargetCard?.getAttribute('data-object-id')).toBe(targetBefore.id);
            expect(heldTargetCard?.getAttribute('data-visual-held')).toBe('true');
            expect(screen.queryByTestId('mage-wars-fx-attack-travel')).toBeNull();

            act(() => {
                advanceSharedFxClockDelay(32);
            });
            await act(async () => {});
            expect(screen.queryByTestId('mage-wars-fx-attack-travel')).not.toBeNull();

            act(() => {
                advanceSharedFxClockDelay(4200);
            });
            await act(async () => {});

            expect(screen.queryByText('击败目标')).toBeNull();
        } finally {
            resetFxFrameClockForTests();
            vi.useRealTimers();
        }
    });

    it('keeps a defeated target held until every linked FX owner completes', async () => {
        vi.useFakeTimers();
        const baseCore = MageWarsDomain.setup(['0', '1'], fixedRandom);
        const attacker = creatureObject('mwobj-left-multi-owner', '0', 2906, '多段来源', ARENA_ZONE_IDS.A2);
        const targetBefore = creatureObject('mwobj-right-multi-held', '1', 2909, '多段目标', ARENA_ZONE_IDS.B2);
        const beforeCore: MageWarsCore = {
            ...baseCore,
            objects: {
                [attacker.id]: attacker,
                [targetBefore.id]: targetBefore,
            },
            arena: baseCore.arena.map((zone) => (
                zone.id === ARENA_ZONE_IDS.A2
                    ? { ...zone, objectIds: [attacker.id] }
                    : zone.id === ARENA_ZONE_IDS.B2
                        ? { ...zone, objectIds: [targetBefore.id] }
                        : zone
            )),
        };
        const afterCore: MageWarsCore = {
            ...beforeCore,
            objects: {
                [attacker.id]: attacker,
            },
            arena: beforeCore.arena.map((zone) => (
                zone.id === ARENA_ZONE_IDS.B2
                    ? { ...zone, objectIds: [] }
                    : zone
            )),
        };
        const sysWithTwoLinkedFx = {
            eventStream: {
                entries: [
                    {
                        id: 1,
                        event: {
                            type: MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED,
                            payload: {
                                ownerId: '0',
                                attackerObjectId: attacker.id,
                                attackProfileId: 'bite',
                                targetObjectId: targetBefore.id,
                                targetZoneId: ARENA_ZONE_IDS.B2,
                                diceResults: [3],
                                baseDamage: 4,
                            },
                            timestamp: 1,
                        },
                    },
                    {
                        id: 2,
                        event: {
                            type: MAGE_WARS_EVENTS.SPELL_ATTACK_ROLLED,
                            payload: {
                                playerId: '0',
                                spellCardId: 3322,
                                sourceAbilityId: 'test.second-hit',
                                targetObjectId: targetBefore.id,
                                targetZoneId: ARENA_ZONE_IDS.B2,
                                diceResults: [4],
                                baseDamage: 4,
                            },
                            timestamp: 2,
                        },
                    },
                    {
                        id: 3,
                        event: {
                            type: 'DAMAGE_DEALT',
                            payload: {
                                targetId: targetBefore.id,
                                amount: 4,
                                actualDamage: 4,
                                sourceAbilityId: 'test.attack',
                            },
                            timestamp: 3,
                        },
                    },
                    {
                        id: 4,
                        event: {
                            type: MAGE_WARS_EVENTS.ARENA_OBJECT_DEFEATED,
                            payload: {
                                objectId: targetBefore.id,
                                ownerId: targetBefore.ownerId,
                                sourceAbilityId: 'test.attack',
                            },
                            timestamp: 4,
                        },
                    },
                ],
                maxEntries: 200,
                nextId: 5,
            },
        };

        try {
            const fxBus = createRecordingFxBus(['fx-owner-a', 'fx-owner-b']);
            const beforeG = boardProps(beforeCore).G;
            const afterG = boardProps(afterCore, '0', sysWithTwoLinkedFx).G;
            const { result, rerender } = renderHook(
                ({ currentG }) => useMageWarsGameEvents({ G: currentG, fxBus }),
                { initialProps: { currentG: beforeG } },
            );

            act(() => {
                rerender({ currentG: afterG });
            });

            expect(result.current.heldObjects.map((object) => object.id)).toEqual([targetBefore.id]);
            expect(fxBus.push).not.toHaveBeenCalled();

            act(() => {
                advanceSharedFxClockDelay(32);
            });
            await act(async () => {});

            expect(fxBus.push).toHaveBeenCalledTimes(2);
            expect(result.current.heldObjects.map((object) => object.id)).toEqual([targetBefore.id]);

            act(() => {
                result.current.onEffectComplete('fx-owner-a');
            });

            expect(result.current.heldObjects.map((object) => object.id)).toEqual([targetBefore.id]);

            act(() => {
                result.current.onEffectComplete('fx-owner-b');
            });

            expect(result.current.heldObjects).toEqual([]);
        } finally {
            resetFxFrameClockForTests();
            vi.useRealTimers();
        }
    });

    it('renders summons through the shared board summon preset', () => {
        const onImpact = vi.fn();
        const event: FxEvent = {
            id: 'fx-summon',
            cue: 'mage-wars.summon',
            ctx: { cell: { row: 1, col: 2 }, intensity: 'strong', quality: 'reduced' },
            params: { objectId: 'mwobj-0-cat', objectKind: 'creature' },
        };

        renderFxRenderer(
            <SummonRenderer
                event={event}
                getCellPosition={getCellPosition}
                onImpact={onImpact}
                onComplete={vi.fn()}
            />,
        );

        const host = screen.getByTestId('mage-wars-fx-summon');
        const summonEffect = screen.getByTestId('mock-summon-hybrid-effect');
        expect(host.getAttribute('data-object-kind')).toBe('creature');
        expect(host.getAttribute('data-object-id')).toBe('mwobj-0-cat');
        expect(summonEffect.getAttribute('data-active')).toBe('true');
        expect(summonEffect.getAttribute('data-intensity')).toBe('strong');
        expect(summonEffect.getAttribute('data-color')).toBe('blue');
        expect(summonEffect.getAttribute('data-origin-y')).toBe('0.66');
        expect(summonEffect.getAttribute('data-quality')).toBe('reduced');
        expect(summonEffect.getAttribute('data-duration-scale')).toBe('2.4');
        expect(summonEffect.getAttribute('data-visual-scale')).toBe('1.55');
        expect(summonEffect.getAttribute('data-dim-strength')).toBe('0');
        expect(summonEffect.getAttribute('data-has-impact')).toBe('true');
        expect(onImpact).not.toHaveBeenCalled();

        fireEvent.click(summonEffect);
        expect(onImpact).toHaveBeenCalledTimes(1);
    });

    it('uses a distinct summon color for conjurations without fabricating travel', () => {
        const event: FxEvent = {
            id: 'fx-conjuration-summon',
            cue: 'mage-wars.summon',
            ctx: { cell: { row: 2, col: 0 }, intensity: 'normal' },
            params: { objectId: 'mwobj-0-vine', objectKind: 'conjuration' },
        };

        renderFxRenderer(
            <SummonRenderer
                event={event}
                getCellPosition={getCellPosition}
            />,
        );

        expect(screen.queryByTestId('mage-wars-fx-summon')).not.toBeNull();
        expect(screen.getByTestId('mock-summon-hybrid-effect').getAttribute('data-color')).toBe('gold');
        expect(screen.queryByTestId('mage-wars-fx-teleport-travel')).toBeNull();
    });

    it('renders attacks with a source-to-target travel cue before impact', () => {
        vi.useFakeTimers();
        const onImpact = vi.fn();
        const onComplete = vi.fn();
        const event: FxEvent = {
            id: 'fx-attack',
            cue: 'mage-wars.attack.impact',
            ctx: { cell: { row: 2, col: 3 }, intensity: 'strong' },
            params: {
                source: { row: 1, col: 0 },
                damageAmount: 6,
                diceResults: [1, 2, 3],
            },
        };

        try {
            renderFxRenderer(
                <AttackImpactRenderer
                    event={event}
                    getCellPosition={getCellPosition}
                    onImpact={onImpact}
                    onComplete={onComplete}
                />,
            );

            const travel = screen.getByTestId('mage-wars-fx-attack-travel');
            expect(screen.queryByTestId('mage-wars-fx-attack-impact')).not.toBeNull();
            expect(screen.queryByTestId('mage-wars-fx-attack-dice')).not.toBeNull();
            expect(screen.queryByTestId('mage-wars-fx-attack-source-wake')).toBeNull();
            expect(screen.getByTestId('mock-damage-flash').getAttribute('data-show-number')).toBe('true');
            expect(screen.getByTestId('mock-damage-flash').getAttribute('data-intensity')).toBe('strong');
            expect(screen.getByTestId('mock-damage-flash').getAttribute('data-start-delay-ms')).toBe('0');
            expect(screen.getByTestId('mock-damage-flash').getAttribute('data-number-delay-ms')).toBe('0');
            expect(screen.getByTestId('mock-damage-flash').getAttribute('data-number-testid')).toBe('mage-wars-fx-attack-damage-float');
            expect(screen.getByTestId('mock-damage-flash').getAttribute('data-number-font-scale')).toBe('2.55');
            expect(screen.getByTestId('mock-damage-flash').getAttribute('data-number-color-class')).toBe('text-red-100');
            expect(screen.queryByTestId('mage-wars-fx-attack-damage-host')).not.toBeNull();
            expect(travel.getAttribute('data-source-col')).toBe('0');
            expect(travel.getAttribute('data-target-row')).toBe('2');
            expect(screen.getByTestId('mock-cone-blast').getAttribute('data-intensity')).toBe('strong');
            expect(screen.getByTestId('mock-cone-blast').getAttribute('data-duration-ms')).toBe('2600');
            expect(screen.getByTestId('mock-cone-blast').getAttribute('data-motion-easing')).toBe('linear');
            expect(screen.getByTestId('mock-cone-blast').getAttribute('data-color')).toContain('#ef4444');
            expect(screen.queryByTestId('mage-wars-fx-attack-travel-mid-burst')).toBeNull();
            expect(screen.queryByTestId('mage-wars-fx-attack-impact-burst')).not.toBeNull();
            expect(screen
                .getByTestId('mage-wars-fx-attack-impact-burst')
                .querySelector('[data-testid="mock-burst-particles"]')
                ?.getAttribute('data-preset')).toBe('explosionStrong');
            expect(screen
                .getByTestId('mage-wars-fx-attack-impact-burst')
                .querySelector('[data-testid="mock-burst-particles"]')
                ?.getAttribute('data-overflow')).toBe('2.2');
            expect(screen.getByTestId('mock-damage-flash').getAttribute('data-number-duration-seconds')).toBe('1.6');
            expect(screen.getByTestId('mock-damage-flash').getAttribute('data-show-red-pulse')).toBe('false');

            act(() => {
                advanceSharedFxClockDelay(2600);
            });
            expect(onImpact).toHaveBeenCalledTimes(1);
        } finally {
            resetFxFrameClockForTests();
            vi.useRealTimers();
        }
    });

    it('renders direct damage with Mage Wars light impact tuning through the shared preset', () => {
        const event: FxEvent = {
            id: 'fx-direct-damage',
            cue: 'mage-wars.damage.impact',
            ctx: { cell: { row: 2, col: 2 }, intensity: 'normal' },
            params: {
                damageAmount: 2,
            },
        };

        renderFxRenderer(
            <DamageImpactRenderer
                event={event}
                getCellPosition={getCellPosition}
                onImpact={vi.fn()}
                onComplete={vi.fn()}
            />,
        );

        expect(screen.queryByTestId('mage-wars-fx-damage-impact')).not.toBeNull();
        expect(screen.queryByTestId('mage-wars-fx-damage-impact-host')).not.toBeNull();
        expect(screen.queryByTestId('mock-burst-particles')).toBeNull();
        expect(screen.getByTestId('mock-damage-flash').getAttribute('data-number-font-scale')).toBe('1.25');
        expect(screen.getByTestId('mock-damage-flash').getAttribute('data-number-duration-seconds')).toBe('1');
    });

    it('renders healing with a shared burst and positive recovery number', () => {
        const onImpact = vi.fn();
        const onComplete = vi.fn();
        const event: FxEvent = {
            id: 'fx-healing',
            cue: 'mage-wars.healing.impact',
            ctx: { cell: { row: 1, col: 1 }, intensity: 'normal' },
            params: {
                targetObjectId: 'mwobj-healed-cat',
                healingAmount: 3,
                actualHealing: 2,
            },
        };

        renderFxRenderer(
            <HealingImpactRenderer
                event={event}
                getCellPosition={getCellPosition}
                onImpact={onImpact}
                onComplete={onComplete}
            />,
        );

        expect(screen.queryByTestId('mage-wars-fx-healing-impact')).not.toBeNull();
        expect(screen.getByTestId('mage-wars-fx-healing-impact').getAttribute('data-target-anchor-id')).toBe('mwobj-healed-cat');
        expect(screen.queryByTestId('mage-wars-fx-healing-burst')).not.toBeNull();
        expect(screen.getByTestId('mage-wars-fx-healing-number').getAttribute('data-healing-amount')).toBe('2');
        expect(screen.getByTestId('mage-wars-fx-healing-number').textContent).toContain('+2');
    });

    it('renders force push with source-to-target travel before impact', () => {
        vi.useFakeTimers();
        const onImpact = vi.fn();
        const onComplete = vi.fn();
        const event: FxEvent = {
            id: 'fx-push',
            cue: 'mage-wars.spell.push',
            ctx: { cell: { row: 1, col: 2 }, intensity: 'normal' },
            params: {
                source: { row: 1, col: 1 },
                spellCardId: 3523,
                targetObjectId: 'mwobj-push-target',
                fromZoneId: ARENA_ZONE_IDS.B2,
                toZoneId: ARENA_ZONE_IDS.C2,
            },
        };

        try {
            renderFxRenderer(
                <SpellPushRenderer
                    event={event}
                    getCellPosition={getCellPosition}
                    onImpact={onImpact}
                    onComplete={onComplete}
                />,
            );

            const travel = screen.getByTestId('mage-wars-fx-push-travel');
            expect(screen.queryByTestId('mage-wars-fx-push-source-wake')).not.toBeNull();
            expect(screen.queryByTestId('mage-wars-fx-push-travel-mid-burst')).not.toBeNull();
            expect(screen.queryByTestId('mage-wars-fx-spell-push')).not.toBeNull();
            expect(screen.queryByTestId('mage-wars-fx-spell-push-burst')).not.toBeNull();
            expect(screen
                .getByTestId('mage-wars-fx-spell-push-burst')
                .querySelector('[data-testid="mock-burst-particles"]')
                ?.getAttribute('data-overflow')).toBe('2.35');
            expect(travel.getAttribute('data-source-col')).toBe('1');
            expect(travel.getAttribute('data-target-col')).toBe('2');
            expect(screen.getByTestId('mock-cone-blast').getAttribute('data-intensity')).toBe('strong');
            expect(screen.getByTestId('mock-cone-blast').getAttribute('data-duration-ms')).toBe('2600');
            expect(screen.getByTestId('mock-cone-blast').getAttribute('data-color')).toContain('#38bdf8');

            act(() => {
                advanceSharedFxClockDelay(2600);
            });
            expect(onImpact).toHaveBeenCalledTimes(1);
        } finally {
            resetFxFrameClockForTests();
            vi.useRealTimers();
        }
    });

    it('renders teleport with source-to-target travel before arrival burst', () => {
        vi.useFakeTimers();
        const onImpact = vi.fn();
        const onComplete = vi.fn();
        const event: FxEvent = {
            id: 'fx-teleport',
            cue: 'mage-wars.spell.teleport',
            ctx: { cell: { row: 2, col: 1 }, intensity: 'strong' },
            params: {
                source: { row: 0, col: 0 },
                spellCardId: 3410,
                targetObjectId: 'mwobj-teleport-target',
                fromZoneId: ARENA_ZONE_IDS.A1,
                toZoneId: ARENA_ZONE_IDS.B3,
                distance: 3,
            },
        };

        try {
            renderFxRenderer(
                <SpellTeleportRenderer
                    event={event}
                    getCellPosition={getCellPosition}
                    onImpact={onImpact}
                    onComplete={onComplete}
                />,
            );

            const travel = screen.getByTestId('mage-wars-fx-teleport-travel');
            expect(screen.queryByTestId('mage-wars-fx-teleport-source-wake')).not.toBeNull();
            expect(screen.queryByTestId('mage-wars-fx-teleport-travel-mid-burst')).not.toBeNull();
            expect(screen.queryByTestId('mage-wars-fx-spell-teleport')).not.toBeNull();
            expect(screen.queryByTestId('mage-wars-fx-spell-teleport-burst')).not.toBeNull();
            expect(screen
                .getByTestId('mage-wars-fx-spell-teleport-burst')
                .querySelector('[data-testid="mock-burst-particles"]')
                ?.getAttribute('data-overflow')).toBe('2.2');
            expect(travel.getAttribute('data-source-row')).toBe('0');
            expect(travel.getAttribute('data-target-row')).toBe('2');
            expect(screen.getByTestId('mock-cone-blast').getAttribute('data-intensity')).toBe('strong');
            expect(screen.getByTestId('mock-cone-blast').getAttribute('data-duration-ms')).toBe('2600');
            expect(screen.getByTestId('mock-cone-blast').getAttribute('data-color')).toContain('#f59e0b');

            act(() => {
                advanceSharedFxClockDelay(2600);
            });
            expect(onImpact).toHaveBeenCalledTimes(1);
        } finally {
            resetFxFrameClockForTests();
            vi.useRealTimers();
        }
    });

    it('renders ordinary movement left along the mover anchor row', () => {
        vi.useFakeTimers();
        const onImpact = vi.fn();
        const onComplete = vi.fn();
        const event: FxEvent = {
            id: 'fx-move-left',
            cue: 'mage-wars.move',
            ctx: { cell: { row: 1, col: 1 }, intensity: 'normal' },
            params: {
                source: { row: 1, col: 2 },
                objectId: 'mwobj-left-moving-cat',
                targetObjectId: 'mwobj-left-moving-cat',
                sourceSnapshot: anchorSnapshot('mwobj-left-moving-cat', 'entity', {
                    left: 62,
                    top: 40,
                    width: 8,
                    height: 10,
                }),
                targetSnapshot: anchorSnapshot('mwobj-left-moving-cat', 'entity', {
                    left: 37,
                    top: 40,
                    width: 8,
                    height: 10,
                }),
            },
        };

        try {
            renderFxRenderer(
                <MovementRenderer
                    event={event}
                    getCellPosition={getCellPosition}
                    onImpact={onImpact}
                    onComplete={onComplete}
                />,
            );

            const travel = screen.getByTestId('mage-wars-fx-move-travel');
            const cone = screen.getByTestId('mock-cone-blast');
            expect(travel.getAttribute('data-source-row')).toBe('1');
            expect(travel.getAttribute('data-target-row')).toBe('1');
            expect(travel.getAttribute('data-source-col')).toBe('2');
            expect(travel.getAttribute('data-target-col')).toBe('1');
            expect(travel.getAttribute('data-source-snapshot-anchor-id')).toBe('mwobj-left-moving-cat');
            expect(travel.getAttribute('data-target-snapshot-anchor-id')).toBe('mwobj-left-moving-cat');
            expect(Number(cone.getAttribute('data-start-x'))).toBeGreaterThan(Number(cone.getAttribute('data-end-x')));
            expect(cone.getAttribute('data-start-y')).toBe(cone.getAttribute('data-end-y'));

            act(() => {
                advanceSharedFxClockDelay(900);
            });
            expect(onImpact).toHaveBeenCalledTimes(1);
        } finally {
            resetFxFrameClockForTests();
            vi.useRealTimers();
        }
    });
});

describe('MageWarsBoard browse interactions', () => {
    it('keeps the default spellbook controls clickable for browsing and card magnification', () => {
        const { container } = renderBoardWithProviders(<MageWarsBoard {...boardProps()} />);

        const shelf = screen.getByTestId('mage-wars-desktop-spellbook-shelf');
        expect(shelf.getAttribute('data-planning-enabled')).toBe('false');

        const firstCard = container.querySelector<HTMLElement>('[data-testid="mage-wars-desktop-spellbook-card"][data-source-card-id]');
        expect(firstCard).not.toBeNull();
        const firstCardId = firstCard!.getAttribute('data-source-card-id');
        expect(firstCard?.getAttribute('data-browse-inspectable')).toBe('true');

        fireEvent.click(firstCard!);

        expect(screen.getByTestId('mage-wars-card-magnify-overlay').getAttribute('aria-hidden')).toBe('false');
        expect(screen.getByTestId('mage-wars-card-magnify-content').getAttribute('data-source-card-id')).toBe(firstCardId);

        fireEvent.click(screen.getByTestId('mage-wars-card-magnify-overlay-close'));
        expect(screen.getByTestId('mage-wars-card-magnify-overlay').getAttribute('aria-hidden')).toBe('true');

        const beforeIds = visibleDesktopSpellbookCardIds(container);
        const categoryIds = ['attack', 'enchantment', 'creature', 'incantation', 'equipment'];
        let changedCategory: HTMLElement | null = null;
        let changedIds: string[] = [];
        for (const categoryId of categoryIds) {
            const categoryButton = screen.getByTestId(`mage-wars-spellbook-category-${categoryId}`);
            fireEvent.click(categoryButton);
            const nextIds = visibleDesktopSpellbookCardIds(container);
            if (nextIds.length > 0 && nextIds.join('|') !== beforeIds.join('|')) {
                changedCategory = categoryButton;
                changedIds = nextIds;
                break;
            }
        }

        expect(changedCategory).not.toBeNull();
        expect(changedCategory?.getAttribute('aria-pressed')).toBe('true');
        expect(changedIds).not.toEqual(beforeIds);
    });

    it('opens mage description magnification from the player hint card inspect button', () => {
        const { container } = renderBoardWithProviders(<MageWarsBoard {...boardProps()} />);
        const selfHintCard = container.querySelector<HTMLElement>(
            '[data-testid="mage-wars-mage-hud-self"] [data-testid="mage-wars-mage-hud-hint-card"]',
        );
        const inspectButton = selfHintCard?.querySelector<HTMLButtonElement>(
            '[data-testid="mage-wars-card-inspect-button"]',
        );

        expect(selfHintCard).not.toBeNull();
        expect(selfHintCard?.getAttribute('role')).toBeNull();
        expect(selfHintCard?.getAttribute('tabindex')).toBeNull();
        expect(selfHintCard?.getAttribute('data-hud-hit-surface')).toBe('visual-pass-through');
        expect(inspectButton).not.toBeNull();
        const statIcons = Array.from(container.querySelectorAll<HTMLElement>(
            '[data-testid="mage-wars-mage-hud-self"] [data-testid="mage-wars-mage-hud-stat-icon"]',
        ));
        expect(statIcons).toHaveLength(3);
        for (const statIcon of statIcons) {
            expect(statIcon.getAttribute('data-hud-hit-surface')).toBe('visual-pass-through');
            expect(statIcon.className).toContain('pointer-events-none');
            expect(statIcon.querySelector('[data-testid="mage-wars-mage-hud-icon-tooltip"]')?.textContent).toContain('/');
        }

        fireEvent.click(selfHintCard!);
        expect(screen.getByTestId('mage-wars-card-magnify-overlay').getAttribute('aria-hidden')).toBe('true');

        fireEvent.click(inspectButton!);
        expect(screen.getByTestId('mage-wars-card-magnify-overlay').getAttribute('aria-hidden')).toBe('false');
        expect(screen.getByTestId('mage-wars-card-magnify-content').getAttribute('data-mage-id')).not.toBeNull();

        fireEvent.click(screen.getByTestId('mage-wars-card-magnify-overlay-close'));
        expect(screen.getByTestId('mage-wars-card-magnify-overlay').getAttribute('aria-hidden')).toBe('true');

        fireEvent.keyDown(selfHintCard!, { key: 'Enter' });
        expect(screen.getByTestId('mage-wars-card-magnify-overlay').getAttribute('aria-hidden')).toBe('true');

        fireEvent.click(inspectButton!);
        expect(screen.getByTestId('mage-wars-card-magnify-overlay').getAttribute('aria-hidden')).toBe('false');
    });

    it('uses the shared free pan and zoom viewport without permanently swallowing card clicks', async () => {
        const { container } = renderBoardWithProviders(<MageWarsBoard {...boardProps()} />);
        const viewport = screen.getByTestId('mage-wars-arena-viewport');
        const content = screen.getByTestId('mage-wars-arena-viewport-content');

        await act(async () => {
            fireEvent.mouseDown(viewport, { button: 0, clientX: 0, clientY: 0 });
            fireEvent.mouseMove(window, { clientX: 80, clientY: 35 });
            fireEvent.mouseUp(window);
        });

        await waitFor(() => {
            expect(content.style.transform).toContain('translate(80px, 35px)');
        });
        const scaleBeforeWheel = Number(content.style.transform.match(/scale\(([^)]+)\)/)?.[1] ?? '0');
        expect(scaleBeforeWheel).toBeGreaterThan(0);

        await act(async () => {
            fireEvent.wheel(viewport, { deltaY: -100, clientX: 50, clientY: 50 });
        });

        await waitFor(() => {
            const scaleAfterWheel = Number(content.style.transform.match(/scale\(([^)]+)\)/)?.[1] ?? '0');
            expect(scaleAfterWheel).toBeGreaterThan(scaleBeforeWheel);
        });

        const firstCard = container.querySelector<HTMLElement>('[data-testid="mage-wars-desktop-spellbook-card"][data-source-card-id]');
        expect(firstCard).not.toBeNull();

        fireEvent.click(firstCard!);
        expect(screen.getByTestId('mage-wars-card-magnify-overlay').getAttribute('aria-hidden')).toBe('false');
    });
});

describe('MageWarsBoard spell cast choices', () => {
    function createRouseChoiceCore(): MageWarsCore {
        const baseCore = MageWarsDomain.setup(['0', '1'], fixedRandom);
        const beastmaster = baseCore.players['0'];
        const freshCat: MageWarsArenaObjectState = {
            ...creatureObject('fresh-cat-0', '0', 2906, 'Fresh Cat', ARENA_ZONE_IDS.A3),
            actionReady: false,
            summonedTurnNumber: baseCore.turnNumber,
        };

        return {
            ...baseCore,
            currentPlayerId: '0',
            phaseActorId: '0',
            objects: {
                ...baseCore.objects,
                [freshCat.id]: freshCat,
            },
            players: {
                ...baseCore.players,
                '0': {
                    ...beastmaster,
                    mageId: MAGE_IDS.BEASTMASTER_APPRENTICE,
                    mageZoneId: ARENA_ZONE_IDS.A3,
                    mana: 20,
                    actionReady: true,
                    quickcastReady: true,
                    preparedSpellSlots: 1,
                    preparedSpellCardIds: [3403],
                },
            },
            arena: baseCore.arena.map((zone) => ({
                ...zone,
                occupantIds: zone.id === ARENA_ZONE_IDS.A3
                    ? ['0']
                    : zone.occupantIds.filter((id) => id !== '0'),
                objectIds: zone.id === freshCat.zoneId
                    ? [freshCat.id]
                    : zone.objectIds.filter((id) => id !== freshCat.id),
            })),
        };
    }

    function createCallOfTheWildInsufficientManaCore(): MageWarsCore {
        const baseCore = MageWarsDomain.setup(['0', '1'], fixedRandom);
        const beastmaster = baseCore.players['0'];

        return {
            ...baseCore,
            currentPlayerId: '0',
            phaseActorId: '0',
            players: {
                ...baseCore.players,
                '0': {
                    ...beastmaster,
                    mageId: MAGE_IDS.BEASTMASTER_APPRENTICE,
                    mageZoneId: ARENA_ZONE_IDS.A3,
                    mana: 0,
                    actionReady: true,
                    quickcastReady: true,
                    preparedSpellSlots: 1,
                    preparedSpellCardIds: [3417],
                },
            },
            arena: baseCore.arena.map((zone) => ({
                ...zone,
                occupantIds: zone.id === ARENA_ZONE_IDS.A3
                    ? ['0']
                    : zone.occupantIds.filter((id) => id !== '0'),
            })),
        };
    }

    function createSummonZoneChoiceCore(): MageWarsCore {
        const baseCore = MageWarsDomain.setup(['0', '1'], fixedRandom);
        const beastmaster = baseCore.players['0'];

        return {
            ...baseCore,
            currentPlayerId: '0',
            phaseActorId: '0',
            players: {
                ...baseCore.players,
                '0': {
                    ...beastmaster,
                    mageId: MAGE_IDS.BEASTMASTER_APPRENTICE,
                    mageZoneId: ARENA_ZONE_IDS.A3,
                    mana: 20,
                    actionReady: true,
                    quickcastReady: true,
                    preparedSpellSlots: 1,
                    preparedSpellCardIds: [2906],
                },
            },
            arena: baseCore.arena.map((zone) => ({
                ...zone,
                occupantIds: zone.id === ARENA_ZONE_IDS.A3
                    ? ['0']
                    : zone.occupantIds.filter((id) => id !== '0'),
            })),
        };
    }

    function createForcePushChoiceCore(): MageWarsCore {
        const baseCore = MageWarsDomain.setup(['0', '1'], fixedRandom);
        const warlock = baseCore.players['0'];
        const forcePushTarget = creatureObject(
            'force-push-target-1',
            '1',
            2906,
            'Force Push Target',
            ARENA_ZONE_IDS.A2,
        );

        return {
            ...baseCore,
            currentPlayerId: '0',
            phaseActorId: '0',
            objects: {
                ...baseCore.objects,
                [forcePushTarget.id]: forcePushTarget,
            },
            players: {
                ...baseCore.players,
                '0': {
                    ...warlock,
                    mageId: MAGE_IDS.WARLOCK_APPRENTICE,
                    mageZoneId: ARENA_ZONE_IDS.A3,
                    mana: 20,
                    actionReady: true,
                    quickcastReady: true,
                    preparedSpellSlots: 1,
                    preparedSpellCardIds: [3425],
                },
            },
            arena: baseCore.arena.map((zone) => ({
                ...zone,
                occupantIds: zone.id === ARENA_ZONE_IDS.A3
                    ? ['0']
                    : zone.occupantIds.filter((id) => id !== '0'),
                objectIds: zone.id === forcePushTarget.zoneId
                    ? [forcePushTarget.id]
                    : zone.objectIds.filter((id) => id !== forcePushTarget.id),
            })),
        };
    }

    function createJetStreamChoiceCore(): MageWarsCore {
        const baseCore = MageWarsDomain.setup(['0', '1'], fixedRandom);
        const beastmaster = baseCore.players['0'];
        const jetStreamTarget = creatureObject(
            'jet-stream-target-1',
            '1',
            2906,
            'Jet Stream Target',
            ARENA_ZONE_IDS.A2,
        );

        return {
            ...baseCore,
            currentPlayerId: '0',
            phaseActorId: '0',
            objects: {
                ...baseCore.objects,
                [jetStreamTarget.id]: jetStreamTarget,
            },
            players: {
                ...baseCore.players,
                '0': {
                    ...beastmaster,
                    mageId: MAGE_IDS.BEASTMASTER_APPRENTICE,
                    mageZoneId: ARENA_ZONE_IDS.A3,
                    mana: 20,
                    actionReady: true,
                    quickcastReady: true,
                    preparedSpellSlots: 1,
                    preparedSpellCardIds: [1711],
                },
            },
            arena: baseCore.arena.map((zone) => ({
                ...zone,
                occupantIds: zone.id === ARENA_ZONE_IDS.A3
                    ? ['0']
                    : zone.occupantIds.filter((id) => id !== '0'),
                objectIds: zone.id === jetStreamTarget.zoneId
                    ? [jetStreamTarget.id]
                    : zone.objectIds.filter((id) => id !== jetStreamTarget.id),
            })),
        };
    }

    function createJetStreamPlayerChoiceCore(): MageWarsCore {
        const core = createJetStreamChoiceCore();
        return {
            ...core,
            players: {
                ...core.players,
                '1': {
                    ...core.players['1'],
                    mageZoneId: ARENA_ZONE_IDS.A2,
                },
            },
            arena: core.arena.map((zone) => ({
                ...zone,
                occupantIds: zone.id === ARENA_ZONE_IDS.A2
                    ? Array.from(new Set([...zone.occupantIds.filter((id) => id !== '1'), '1']))
                    : zone.occupantIds.filter((id) => id !== '1'),
            })),
        };
    }

    function createLifeDrainChoiceCore(): MageWarsCore {
        const baseCore = MageWarsDomain.setup(['0', '1'], fixedRandom);
        const warlock = baseCore.players['0'];
        const opponent = baseCore.players['1'];

        return {
            ...baseCore,
            currentPlayerId: '0',
            phaseActorId: '0',
            players: {
                ...baseCore.players,
                '0': {
                    ...warlock,
                    mageId: MAGE_IDS.WARLOCK_APPRENTICE,
                    mageZoneId: ARENA_ZONE_IDS.A3,
                    mana: 20,
                    damage: 5,
                    actionReady: true,
                    quickcastReady: true,
                    preparedSpellSlots: 1,
                    preparedSpellCardIds: [3400],
                },
                '1': {
                    ...opponent,
                    mageZoneId: ARENA_ZONE_IDS.A3,
                },
            },
            arena: baseCore.arena.map((zone) => ({
                ...zone,
                occupantIds: zone.id === ARENA_ZONE_IDS.A3
                    ? ['0', '1']
                    : zone.occupantIds.filter((id) => id !== '0' && id !== '1'),
            })),
        };
    }

    function createLeatherGlovesChoiceCore(): MageWarsCore {
        const baseCore = MageWarsDomain.setup(['0', '1'], fixedRandom);
        const warlock = baseCore.players['0'];

        return {
            ...baseCore,
            currentPlayerId: '0',
            phaseActorId: '0',
            players: {
                ...baseCore.players,
                '0': {
                    ...warlock,
                    mageId: MAGE_IDS.WARLOCK_APPRENTICE,
                    mageZoneId: ARENA_ZONE_IDS.A3,
                    mana: 20,
                    actionReady: true,
                    quickcastReady: true,
                    preparedSpellSlots: 1,
                    preparedSpellCardIds: [3702],
                },
            },
            arena: baseCore.arena.map((zone) => ({
                ...zone,
                occupantIds: zone.id === ARENA_ZONE_IDS.A3
                    ? ['0']
                    : zone.occupantIds.filter((id) => id !== '0'),
            })),
        };
    }

    function createDemonCuirassChoiceCore(): MageWarsCore {
        const baseCore = MageWarsDomain.setup(['0', '1'], fixedRandom);
        const warlock = baseCore.players['0'];

        return {
            ...baseCore,
            currentPlayerId: '0',
            phaseActorId: '0',
            players: {
                ...baseCore.players,
                '0': {
                    ...warlock,
                    mageId: MAGE_IDS.WARLOCK_APPRENTICE,
                    mageZoneId: ARENA_ZONE_IDS.A3,
                    mana: 20,
                    actionReady: true,
                    quickcastReady: true,
                    preparedSpellSlots: 1,
                    preparedSpellCardIds: [3700],
                },
            },
            arena: baseCore.arena.map((zone) => ({
                ...zone,
                occupantIds: zone.id === ARENA_ZONE_IDS.A3
                    ? ['0']
                    : zone.occupantIds.filter((id) => id !== '0'),
            })),
        };
    }

    function createElementalStaffCastChoiceCore(): MageWarsCore {
        const baseCore = MageWarsDomain.setup(['0', '1'], fixedRandom);
        const wizard = baseCore.players['0'];

        return {
            ...baseCore,
            currentPlayerId: '0',
            phaseActorId: '0',
            players: {
                ...baseCore.players,
                '0': {
                    ...wizard,
                    mageId: MAGE_IDS.WIZARD_APPRENTICE,
                    mageZoneId: ARENA_ZONE_IDS.A3,
                    mana: 20,
                    actionReady: true,
                    quickcastReady: true,
                    preparedSpellSlots: 1,
                    preparedSpellCardIds: [3716],
                },
            },
            arena: baseCore.arena.map((zone) => ({
                ...zone,
                occupantIds: zone.id === ARENA_ZONE_IDS.A3
                    ? ['0']
                    : zone.occupantIds.filter((id) => id !== '0'),
            })),
        };
    }

    function createFireballChoiceCore(): MageWarsCore {
        const baseCore = MageWarsDomain.setup(['0', '1'], fixedRandom);
        const warlock = baseCore.players['0'];
        const opponent = baseCore.players['1'];

        return {
            ...baseCore,
            currentPlayerId: '0',
            phaseActorId: '0',
            players: {
                ...baseCore.players,
                '0': {
                    ...warlock,
                    mageId: MAGE_IDS.WARLOCK_APPRENTICE,
                    mageZoneId: ARENA_ZONE_IDS.A3,
                    mana: 20,
                    actionReady: true,
                    quickcastReady: true,
                    preparedSpellSlots: 1,
                    preparedSpellCardIds: [1700],
                },
                '1': {
                    ...opponent,
                    mageZoneId: ARENA_ZONE_IDS.A3,
                },
            },
            arena: baseCore.arena.map((zone) => ({
                ...zone,
                occupantIds: zone.id === ARENA_ZONE_IDS.A3
                    ? ['0', '1']
                    : zone.occupantIds.filter((id) => id !== '0' && id !== '1'),
            })),
        };
    }

    function createDoomChoiceCore(): MageWarsCore {
        const baseCore = MageWarsDomain.setup(['0', '1'], fixedRandom);
        const wizard = baseCore.players['0'];
        const opponent = baseCore.players['1'];

        return {
            ...baseCore,
            currentPlayerId: '0',
            phaseActorId: '0',
            players: {
                ...baseCore.players,
                '0': {
                    ...wizard,
                    mageId: MAGE_IDS.WIZARD_APPRENTICE,
                    mageZoneId: ARENA_ZONE_IDS.A3,
                    mana: 20,
                    actionReady: true,
                    quickcastReady: true,
                    preparedSpellSlots: 1,
                    preparedSpellCardIds: [1825],
                },
                '1': {
                    ...opponent,
                    mageZoneId: ARENA_ZONE_IDS.A3,
                },
            },
            arena: baseCore.arena.map((zone) => ({
                ...zone,
                occupantIds: zone.id === ARENA_ZONE_IDS.A3
                    ? ['0', '1']
                    : zone.occupantIds.filter((id) => id !== '0' && id !== '1'),
            })),
        };
    }

    function createStealEnchantmentChoiceCore(): MageWarsCore {
        const baseCore = MageWarsDomain.setup(['0', '1'], fixedRandom);
        const wizard = baseCore.players['0'];
        const opponent = baseCore.players['1'];
        const friendlyCreature = creatureObject('steal-friendly-cat-0', '0', 2906, 'Friendly Cat', ARENA_ZONE_IDS.A3);
        const enchantedCreature = creatureObject('steal-enchanted-cat-1', '1', 2906, 'Enemy Cat', ARENA_ZONE_IDS.A2);
        const visibleEnchantment: MageWarsArenaObjectState = {
            ...creatureObject('steal-visible-enchantment-1800', '1', 1800, '剧痛难当', ARENA_ZONE_IDS.A2),
            kind: 'enchantment',
            sourceObjectId: 'spell-card-1800',
            life: 1,
            actionReady: false,
            typeLine: '结界 / 诅咒',
            attackOrTraitLine: undefined,
            rulesText: '每当本生物进行非法术远程或近战攻击时，少投掷2颗攻击骰子。',
            revealed: true,
            anchoredToObjectId: enchantedCreature.id,
        };

        return {
            ...baseCore,
            currentPlayerId: '0',
            phaseActorId: '0',
            objects: {
                ...baseCore.objects,
                [friendlyCreature.id]: friendlyCreature,
                [enchantedCreature.id]: enchantedCreature,
                [visibleEnchantment.id]: visibleEnchantment,
            },
            players: {
                ...baseCore.players,
                '0': {
                    ...wizard,
                    mageId: MAGE_IDS.WIZARD_APPRENTICE,
                    mageZoneId: ARENA_ZONE_IDS.A3,
                    mana: 20,
                    actionReady: true,
                    quickcastReady: true,
                    preparedSpellSlots: 1,
                    preparedSpellCardIds: [3409],
                },
                '1': {
                    ...opponent,
                    mageZoneId: ARENA_ZONE_IDS.A2,
                },
            },
            arena: baseCore.arena.map((zone) => ({
                ...zone,
                occupantIds: zone.id === ARENA_ZONE_IDS.A3
                    ? ['0']
                    : zone.id === ARENA_ZONE_IDS.A2
                        ? ['1']
                        : zone.occupantIds.filter((id) => id !== '0' && id !== '1'),
                objectIds: zone.id === ARENA_ZONE_IDS.A3
                    ? [friendlyCreature.id]
                    : zone.id === ARENA_ZONE_IDS.A2
                        ? [enchantedCreature.id, visibleEnchantment.id]
                        : zone.objectIds.filter((id) => ![
                            friendlyCreature.id,
                            enchantedCreature.id,
                            visibleEnchantment.id,
                        ].includes(id)),
            })),
        };
    }

    function createChainLightningChoiceCore(): MageWarsCore {
        const baseCore = MageWarsDomain.setup(['0', '1'], fixedRandom);
        const wizard = baseCore.players['0'];
        const firstTarget = creatureObject('chain-first-1', '1', 2906, 'Chain First', ARENA_ZONE_IDS.A3);
        const secondTarget = creatureObject('chain-second-1', '1', 2906, 'Chain Second', ARENA_ZONE_IDS.B3);
        const thirdTarget = creatureObject('chain-third-1', '1', 2906, 'Chain Third', ARENA_ZONE_IDS.B2);

        return {
            ...baseCore,
            currentPlayerId: '0',
            phaseActorId: '0',
            objects: {
                ...baseCore.objects,
                [firstTarget.id]: firstTarget,
                [secondTarget.id]: secondTarget,
                [thirdTarget.id]: thirdTarget,
            },
            players: {
                ...baseCore.players,
                '0': {
                    ...wizard,
                    mageId: MAGE_IDS.WIZARD_APPRENTICE,
                    mageZoneId: ARENA_ZONE_IDS.A3,
                    mana: 20,
                    actionReady: true,
                    quickcastReady: true,
                    preparedSpellSlots: 1,
                    preparedSpellCardIds: [1703],
                },
            },
            arena: baseCore.arena.map((zone) => ({
                ...zone,
                occupantIds: zone.id === ARENA_ZONE_IDS.A3
                    ? ['0']
                    : zone.occupantIds.filter((id) => id !== '0'),
                objectIds: zone.id === ARENA_ZONE_IDS.A3
                    ? [firstTarget.id]
                    : zone.id === ARENA_ZONE_IDS.B3
                        ? [secondTarget.id]
                        : zone.id === ARENA_ZONE_IDS.B2
                            ? [thirdTarget.id]
                            : zone.objectIds.filter((id) => ![
                                firstTarget.id,
                                secondTarget.id,
                                thirdTarget.id,
                            ].includes(id)),
            })),
        };
    }

    it('casts Rouse the Beast from the spell ChoiceRequest target command', async () => {
        const dispatch = vi.fn();
        const { container } = renderBoardWithProviders(
            <MageWarsBoard
                {...boardProps(createRouseChoiceCore(), '0', { phase: 'finalQuickcast' })}
                dispatch={dispatch}
            />,
        );

        const rousePreparedCard = container.querySelector<HTMLElement>(
            '[data-testid="mage-wars-desktop-prepared-card"][data-source-card-id="3403"]',
        );
        expect(rousePreparedCard).not.toBeNull();
        fireEvent.click(rousePreparedCard!);

        const targetCard = screen.getByText('Fresh Cat')
            .closest<HTMLElement>('[data-testid="mage-wars-zone-field-card"]');
        expect(targetCard).not.toBeNull();
        await waitFor(() => {
            expect(targetCard?.getAttribute('data-field-card-role')).toBe('target');
        });

        fireEvent.click(targetCard!);

        expect(dispatch).toHaveBeenCalledWith(MAGE_WARS_COMMANDS.CAST_SPELL, {
            spellCardId: 3403,
            manaCost: 1,
            targetObjectId: 'fresh-cat-0',
        });
    });

    it('does not fall back to a hand-built no-target cast when confirm ChoiceRequest is disabled', () => {
        const dispatch = vi.fn();
        const { container } = renderBoardWithProviders(
            <MageWarsBoard
                {...boardProps(createCallOfTheWildInsufficientManaCore(), '0', { phase: 'initiativeQuickcast' })}
                dispatch={dispatch}
            />,
        );

        const callOfTheWildPreparedCard = container.querySelector<HTMLElement>(
            '[data-testid="mage-wars-desktop-prepared-card"][data-source-card-id="3417"]',
        );
        expect(callOfTheWildPreparedCard).not.toBeNull();
        fireEvent.click(callOfTheWildPreparedCard!);

        expect(dispatch).not.toHaveBeenCalled();
    });

    it('marks creature summon targets as explicit zone targets for whole-zone highlighting', async () => {
        const dispatch = vi.fn();
        const { container } = renderBoardWithProviders(
            <MageWarsBoard
                {...boardProps(createSummonZoneChoiceCore(), '0', { phase: 'creatureAction' })}
                dispatch={dispatch}
            />,
        );

        const bobcatPreparedCard = container.querySelector<HTMLElement>(
            '[data-testid="mage-wars-desktop-prepared-card"][data-source-card-id="2906"]',
        );
        expect(bobcatPreparedCard).not.toBeNull();
        fireEvent.click(bobcatPreparedCard!);

        await waitFor(() => {
            expect(container.querySelector('[data-legal-target-zone="true"][data-zone-target-scope="zone"]')).not.toBeNull();
        });
        expect(container.querySelector('[data-legal-target-zone="true"][data-zone-target-scope="object"]')).toBeNull();
        expect(dispatch).not.toHaveBeenCalled();
    });

    it('does not fall back to a hand-built Force Push command for an illegal destination zone', async () => {
        const dispatch = vi.fn();
        const { container } = renderBoardWithProviders(
            <MageWarsBoard
                {...boardProps(createForcePushChoiceCore(), '0', { phase: 'creatureAction' })}
                dispatch={dispatch}
            />,
        );

        const forcePushPreparedCard = container.querySelector<HTMLElement>(
            '[data-testid="mage-wars-desktop-prepared-card"][data-source-card-id="3425"]',
        );
        expect(forcePushPreparedCard).not.toBeNull();
        fireEvent.click(forcePushPreparedCard!);

        const targetCard = container.querySelector<HTMLElement>(
            '[data-testid="mage-wars-zone-field-card"][data-object-id="force-push-target-1"]',
        );
        expect(targetCard).not.toBeNull();
        await waitFor(() => {
            expect(targetCard?.getAttribute('data-field-card-role')).toBe('target');
        });
        fireEvent.click(targetCard!);

        await waitFor(() => {
            expect(targetCard?.getAttribute('data-field-card-role')).toBe('source');
            expect(screen.getByTestId('mage-wars-arena-zone-a3').getAttribute('data-legal-target-zone')).toBe('true');
        });

        fireEvent.click(screen.getByTestId('mage-wars-arena-zone-c3'));

        expect(dispatch).not.toHaveBeenCalledWith(MAGE_WARS_COMMANDS.CAST_SPELL, expect.anything());
    });

    it('casts Jet Stream by selecting an object and legal push destination from ChoiceRequest', async () => {
        const dispatch = vi.fn();
        const { container } = renderBoardWithProviders(
            <MageWarsBoard
                {...boardProps(createJetStreamChoiceCore(), '0', { phase: 'initiativeQuickcast' })}
                dispatch={dispatch}
            />,
        );

        const jetStreamPreparedCard = container.querySelector<HTMLElement>(
            '[data-testid="mage-wars-desktop-prepared-card"][data-source-card-id="1711"]',
        );
        expect(jetStreamPreparedCard).not.toBeNull();
        fireEvent.click(jetStreamPreparedCard!);

        const targetCard = container.querySelector<HTMLElement>(
            '[data-testid="mage-wars-zone-field-card"][data-object-id="jet-stream-target-1"]',
        );
        expect(targetCard).not.toBeNull();
        await waitFor(() => {
            expect(targetCard?.getAttribute('data-field-card-role')).toBe('target');
        });
        fireEvent.click(targetCard!);

        await waitFor(() => {
            expect(targetCard?.getAttribute('data-field-card-role')).toBe('source');
            expect(screen.getByTestId('mage-wars-arena-zone-a3').getAttribute('data-legal-target-zone')).toBe('true');
        });

        fireEvent.click(screen.getByTestId('mage-wars-arena-zone-a3'));

        expect(dispatch).toHaveBeenCalledWith(MAGE_WARS_COMMANDS.CAST_SPELL, {
            spellCardId: 1711,
            manaCost: 4,
            targetObjectId: 'jet-stream-target-1',
            pushToZoneId: ARENA_ZONE_IDS.A3,
        });
    });

    it('casts Jet Stream by selecting an opposing mage and legal push destination from ChoiceRequest', async () => {
        const dispatch = vi.fn();
        const { container } = renderBoardWithProviders(
            <MageWarsBoard
                {...boardProps(createJetStreamPlayerChoiceCore(), '0', { phase: 'initiativeQuickcast' })}
                dispatch={dispatch}
            />,
        );

        const jetStreamPreparedCard = container.querySelector<HTMLElement>(
            '[data-testid="mage-wars-desktop-prepared-card"][data-source-card-id="1711"]',
        );
        expect(jetStreamPreparedCard).not.toBeNull();
        fireEvent.click(jetStreamPreparedCard!);

        const opponentMage = container.querySelector<HTMLElement>(
            '[data-testid="mage-wars-zone-mage-entity"][data-player-id="1"]',
        );
        expect(opponentMage).not.toBeNull();
        await waitFor(() => {
            expect(opponentMage?.getAttribute('role')).toBe('button');
            expect(opponentMage?.className).toContain('rgba(16,185,129,0.48)');
        });
        const opponentMageFrame = opponentMage?.querySelector<HTMLElement>('[data-testid="mage-wars-mage-entity-target-frame"]');
        expect(opponentMage?.className).not.toContain('outline');
        expect(opponentMageFrame?.className).toContain('inset-0');
        expect(opponentMageFrame?.className).not.toContain('-inset');
        fireEvent.click(opponentMage!);

        await waitFor(() => {
            expect(screen.getByTestId('mage-wars-arena-zone-a3').getAttribute('data-legal-target-zone')).toBe('true');
        });
        fireEvent.click(screen.getByTestId('mage-wars-arena-zone-a3'));

        expect(dispatch).toHaveBeenCalledWith(MAGE_WARS_COMMANDS.CAST_SPELL, {
            spellCardId: 1711,
            manaCost: 4,
            targetPlayerId: '1',
            pushToZoneId: ARENA_ZONE_IDS.A3,
        });
    });

    it('casts Life Drain on an opposing mage from the spell ChoiceRequest player target command', async () => {
        const dispatch = vi.fn();
        const { container } = renderBoardWithProviders(
            <MageWarsBoard
                {...boardProps(createLifeDrainChoiceCore(), '0', { phase: 'initiativeQuickcast' })}
                dispatch={dispatch}
            />,
        );

        const lifeDrainPreparedCard = container.querySelector<HTMLElement>(
            '[data-testid="mage-wars-desktop-prepared-card"][data-source-card-id="3400"]',
        );
        expect(lifeDrainPreparedCard).not.toBeNull();
        fireEvent.click(lifeDrainPreparedCard!);

        const opponentMage = container.querySelector<HTMLElement>(
            '[data-testid="mage-wars-zone-mage-entity"][data-player-id="1"]',
        );
        expect(opponentMage).not.toBeNull();
        await waitFor(() => {
            expect(opponentMage?.getAttribute('role')).toBe('button');
            expect(opponentMage?.className).toContain('rgba(16,185,129,0.48)');
        });
        expect(opponentMage?.querySelector('[data-testid="mage-wars-mage-entity-target-frame"]')?.className).toContain('inset-0');

        fireEvent.click(opponentMage!);

        expect(dispatch).toHaveBeenCalledWith(MAGE_WARS_COMMANDS.CAST_SPELL, {
            spellCardId: 3400,
            manaCost: 12,
            targetPlayerId: '1',
        });
    });

    it('casts Leather Gloves on own mage from the spell ChoiceRequest player target command', async () => {
        const dispatch = vi.fn();
        const { container } = renderBoardWithProviders(
            <MageWarsBoard
                {...boardProps(createLeatherGlovesChoiceCore(), '0', { phase: 'initiativeQuickcast' })}
                dispatch={dispatch}
            />,
        );

        const leatherGlovesPreparedCard = container.querySelector<HTMLElement>(
            '[data-testid="mage-wars-desktop-prepared-card"][data-source-card-id="3702"]',
        );
        expect(leatherGlovesPreparedCard).not.toBeNull();
        fireEvent.click(leatherGlovesPreparedCard!);

        const ownMage = container.querySelector<HTMLElement>(
            '[data-testid="mage-wars-zone-mage-entity"][data-player-id="0"]',
        );
        expect(ownMage).not.toBeNull();
        await waitFor(() => {
            expect(ownMage?.getAttribute('role')).toBe('button');
            expect(ownMage?.className).toContain('rgba(16,185,129,0.48)');
        });

        fireEvent.click(ownMage!);

        expect(dispatch).toHaveBeenCalledWith(MAGE_WARS_COMMANDS.CAST_SPELL, {
            spellCardId: 3702,
            manaCost: 2,
            targetPlayerId: '0',
        });
    });

    it('casts Demon Cuirass on own mage from the spell ChoiceRequest player target command', async () => {
        const dispatch = vi.fn();
        const { container } = renderBoardWithProviders(
            <MageWarsBoard
                {...boardProps(createDemonCuirassChoiceCore(), '0', { phase: 'initiativeQuickcast' })}
                dispatch={dispatch}
            />,
        );

        const demonCuirassPreparedCard = container.querySelector<HTMLElement>(
            '[data-testid="mage-wars-desktop-prepared-card"][data-source-card-id="3700"]',
        );
        expect(demonCuirassPreparedCard).not.toBeNull();
        fireEvent.click(demonCuirassPreparedCard!);

        const ownMage = container.querySelector<HTMLElement>(
            '[data-testid="mage-wars-zone-mage-entity"][data-player-id="0"]',
        );
        expect(ownMage).not.toBeNull();
        await waitFor(() => {
            expect(ownMage?.getAttribute('role')).toBe('button');
            expect(ownMage?.className).toContain('rgba(16,185,129,0.48)');
        });

        fireEvent.click(ownMage!);

        expect(dispatch).toHaveBeenCalledWith(MAGE_WARS_COMMANDS.CAST_SPELL, {
            spellCardId: 3700,
            manaCost: 8,
            targetPlayerId: '0',
        });
    });

    it('casts Elemental Staff by choosing a bound spell from the spell ChoiceRequest candidates', async () => {
        const dispatch = vi.fn();
        const { container } = renderBoardWithProviders(
            <MageWarsBoard
                {...boardProps(createElementalStaffCastChoiceCore(), '0', { phase: 'initiativeQuickcast' })}
                dispatch={dispatch}
            />,
        );

        const elementalStaffPreparedCard = container.querySelector<HTMLElement>(
            '[data-testid="mage-wars-desktop-prepared-card"][data-source-card-id="3716"]',
        );
        expect(elementalStaffPreparedCard).not.toBeNull();
        fireEvent.click(elementalStaffPreparedCard!);

        const ownMage = container.querySelector<HTMLElement>(
            '[data-testid="mage-wars-zone-mage-entity"][data-player-id="0"]',
        );
        expect(ownMage).not.toBeNull();
        await waitFor(() => {
            expect(ownMage?.getAttribute('role')).toBe('button');
            expect(ownMage?.className).toContain('rgba(16,185,129,0.48)');
        });

        fireEvent.click(ownMage!);

        expect(dispatch).not.toHaveBeenCalled();
        await waitFor(() => {
            expect(screen.queryByTestId('mage-wars-spell-cast-choice-dock')).not.toBeNull();
        });

        const boundSpellOption = screen.getAllByTestId('mage-wars-spell-cast-choice-option')
            .find((option) => option.getAttribute('data-bound-spell-card-id') === '1705');
        expect(boundSpellOption).not.toBeUndefined();
        fireEvent.click(boundSpellOption!);

        expect(dispatch).toHaveBeenCalledWith(MAGE_WARS_COMMANDS.CAST_SPELL, {
            spellCardId: 3716,
            manaCost: 5,
            targetPlayerId: '0',
            boundSpellCardId: 1705,
        });
    });

    it('casts Fireball on an opposing mage from the spell ChoiceRequest player target command', async () => {
        const dispatch = vi.fn();
        const { container } = renderBoardWithProviders(
            <MageWarsBoard
                {...boardProps(createFireballChoiceCore(), '0', { phase: 'initiativeQuickcast' })}
                dispatch={dispatch}
            />,
        );

        const fireballPreparedCard = container.querySelector<HTMLElement>(
            '[data-testid="mage-wars-desktop-prepared-card"][data-source-card-id="1700"]',
        );
        expect(fireballPreparedCard).not.toBeNull();
        fireEvent.click(fireballPreparedCard!);

        const opponentMage = container.querySelector<HTMLElement>(
            '[data-testid="mage-wars-zone-mage-entity"][data-player-id="1"]',
        );
        expect(opponentMage).not.toBeNull();
        await waitFor(() => {
            expect(opponentMage?.getAttribute('role')).toBe('button');
            expect(opponentMage?.className).toContain('rgba(16,185,129,0.48)');
        });

        fireEvent.click(opponentMage!);

        expect(dispatch).toHaveBeenCalledWith(MAGE_WARS_COMMANDS.CAST_SPELL, {
            spellCardId: 1700,
            manaCost: 8,
            targetPlayerId: '1',
        });
    });

    it('casts Doom on an opposing mage from the spell ChoiceRequest player target command', async () => {
        const dispatch = vi.fn();
        const { container } = renderBoardWithProviders(
            <MageWarsBoard
                {...boardProps(createDoomChoiceCore(), '0', { phase: 'initiativeQuickcast' })}
                dispatch={dispatch}
            />,
        );

        const doomPreparedCard = container.querySelector<HTMLElement>(
            '[data-testid="mage-wars-desktop-prepared-card"][data-source-card-id="1825"]',
        );
        expect(doomPreparedCard).not.toBeNull();
        fireEvent.click(doomPreparedCard!);

        const opponentMage = container.querySelector<HTMLElement>(
            '[data-testid="mage-wars-zone-mage-entity"][data-player-id="1"]',
        );
        expect(opponentMage).not.toBeNull();
        await waitFor(() => {
            expect(opponentMage?.getAttribute('role')).toBe('button');
            expect(opponentMage?.className).toContain('rgba(16,185,129,0.48)');
        });

        fireEvent.click(opponentMage!);

        expect(dispatch).toHaveBeenCalledWith(MAGE_WARS_COMMANDS.CAST_SPELL, {
            spellCardId: 1825,
            manaCost: 3,
            targetPlayerId: '1',
        });
    });

    it('casts Steal Enchantment by selecting the visible enchantment and then a new legal target', async () => {
        const dispatch = vi.fn();
        const { container } = renderBoardWithProviders(
            <MageWarsBoard
                {...boardProps(createStealEnchantmentChoiceCore(), '0', { phase: 'creatureAction' })}
                dispatch={dispatch}
            />,
        );

        const stealPreparedCard = container.querySelector<HTMLElement>(
            '[data-testid="mage-wars-desktop-prepared-card"][data-source-card-id="3409"]',
        );
        expect(stealPreparedCard).not.toBeNull();
        fireEvent.click(stealPreparedCard!);

        const visibleEnchantmentCard = container.querySelector<HTMLElement>(
            '[data-testid="mage-wars-attached-card"][data-object-id="steal-visible-enchantment-1800"]',
        );
        expect(visibleEnchantmentCard).not.toBeNull();
        await waitFor(() => {
            expect(visibleEnchantmentCard?.getAttribute('data-attachment-role')).toBe('target');
        });
        const attachmentTargetFrame = visibleEnchantmentCard?.querySelector<HTMLElement>('[data-testid="mage-wars-attachment-target-frame"]');
        expect(attachmentTargetFrame?.className).toContain('inset-0');
        expect(attachmentTargetFrame?.className).not.toContain('-inset');
        fireEvent.click(visibleEnchantmentCard!);

        await waitFor(() => {
            expect(container.querySelector<HTMLElement>(
                '[data-testid="mage-wars-attached-card"][data-object-id="steal-visible-enchantment-1800"]',
            )?.getAttribute('data-attachment-role')).toBe('source');
        });
        const attachmentSourceFrame = container.querySelector<HTMLElement>(
            '[data-testid="mage-wars-attached-card"][data-object-id="steal-visible-enchantment-1800"] [data-testid="mage-wars-attachment-source-frame"]',
        );
        expect(attachmentSourceFrame?.className).toContain('inset-0');
        expect(attachmentSourceFrame?.className).not.toContain('-inset');
        const friendlyTargetCard = container.querySelector<HTMLElement>(
            '[data-testid="mage-wars-zone-field-card"][data-object-id="steal-friendly-cat-0"]',
        );
        expect(friendlyTargetCard).not.toBeNull();
        await waitFor(() => {
            expect(friendlyTargetCard?.getAttribute('data-field-card-role')).toBe('target');
        });

        fireEvent.click(friendlyTargetCard!);

        expect(dispatch).toHaveBeenCalledWith(MAGE_WARS_COMMANDS.CAST_SPELL, {
            spellCardId: 3409,
            manaCost: 10,
            targetObjectId: 'steal-visible-enchantment-1800',
            newTargetObjectId: 'steal-friendly-cat-0',
        });
    });

    it('casts Chain Lightning by selecting each object in the ChoiceRequest chain', async () => {
        const dispatch = vi.fn();
        const { container } = renderBoardWithProviders(
            <MageWarsBoard
                {...boardProps(createChainLightningChoiceCore(), '0', { phase: 'creatureAction' })}
                dispatch={dispatch}
            />,
        );

        const chainPreparedCard = container.querySelector<HTMLElement>(
            '[data-testid="mage-wars-desktop-prepared-card"][data-source-card-id="1703"]',
        );
        expect(chainPreparedCard).not.toBeNull();
        fireEvent.click(chainPreparedCard!);

        const firstCard = container.querySelector<HTMLElement>(
            '[data-testid="mage-wars-zone-field-card"][data-object-id="chain-first-1"]',
        );
        expect(firstCard).not.toBeNull();
        await waitFor(() => {
            expect(firstCard?.getAttribute('data-field-card-role')).toBe('target');
        });
        fireEvent.click(firstCard!);

        const secondCard = container.querySelector<HTMLElement>(
            '[data-testid="mage-wars-zone-field-card"][data-object-id="chain-second-1"]',
        );
        expect(secondCard).not.toBeNull();
        await waitFor(() => {
            expect(firstCard?.getAttribute('data-field-card-role')).toBe('source');
            expect(secondCard?.getAttribute('data-field-card-role')).toBe('target');
        });
        expect(dispatch).not.toHaveBeenCalled();
        fireEvent.click(secondCard!);

        const thirdCard = container.querySelector<HTMLElement>(
            '[data-testid="mage-wars-zone-field-card"][data-object-id="chain-third-1"]',
        );
        expect(thirdCard).not.toBeNull();
        await waitFor(() => {
            expect(secondCard?.getAttribute('data-field-card-role')).toBe('source');
            expect(thirdCard?.getAttribute('data-field-card-role')).toBe('target');
        });
        expect(dispatch).not.toHaveBeenCalled();
        fireEvent.click(thirdCard!);

        expect(dispatch).toHaveBeenCalledWith(MAGE_WARS_COMMANDS.CAST_SPELL, {
            spellCardId: 1703,
            manaCost: 12,
            targetObjectId: 'chain-first-1',
            chainLightningTargets: [
                { targetObjectId: 'chain-second-1' },
                { targetObjectId: 'chain-third-1' },
            ],
        });
    });

    it('allows Chain Lightning to stop at the current chain target without forcing the longest chain', async () => {
        const dispatch = vi.fn();
        const { container } = renderBoardWithProviders(
            <MageWarsBoard
                {...boardProps(createChainLightningChoiceCore(), '0', { phase: 'creatureAction' })}
                dispatch={dispatch}
            />,
        );

        const chainPreparedCard = container.querySelector<HTMLElement>(
            '[data-testid="mage-wars-desktop-prepared-card"][data-source-card-id="1703"]',
        );
        expect(chainPreparedCard).not.toBeNull();
        fireEvent.click(chainPreparedCard!);

        const firstCard = container.querySelector<HTMLElement>(
            '[data-testid="mage-wars-zone-field-card"][data-object-id="chain-first-1"]',
        );
        const secondCard = container.querySelector<HTMLElement>(
            '[data-testid="mage-wars-zone-field-card"][data-object-id="chain-second-1"]',
        );
        const thirdCard = container.querySelector<HTMLElement>(
            '[data-testid="mage-wars-zone-field-card"][data-object-id="chain-third-1"]',
        );
        expect(firstCard).not.toBeNull();
        expect(secondCard).not.toBeNull();
        expect(thirdCard).not.toBeNull();

        fireEvent.click(firstCard!);
        await waitFor(() => {
            expect(secondCard?.getAttribute('data-field-card-role')).toBe('target');
        });
        fireEvent.click(secondCard!);
        await waitFor(() => {
            expect(secondCard?.getAttribute('data-field-card-role')).toBe('source');
            expect(thirdCard?.getAttribute('data-field-card-role')).toBe('target');
        });
        fireEvent.click(secondCard!);

        expect(dispatch).toHaveBeenCalledWith(MAGE_WARS_COMMANDS.CAST_SPELL, {
            spellCardId: 1703,
            manaCost: 12,
            targetObjectId: 'chain-first-1',
            chainLightningTargets: [
                { targetObjectId: 'chain-second-1' },
            ],
        });
    });
});

describe('MageWarsBoard object ability choices', () => {
    function createBlueGremlinAbilityCore(): MageWarsCore {
        const baseCore = MageWarsDomain.setup(['0', '1'], fixedRandom);
        const wizard = baseCore.players['0'];
        const gremlin = creatureObject('blue-gremlin-0', '0', 2822, 'Blue Gremlin', ARENA_ZONE_IDS.A3);

        return {
            ...baseCore,
            currentPlayerId: '0',
            phaseActorId: '0',
            objects: {
                ...baseCore.objects,
                [gremlin.id]: gremlin,
            },
            players: {
                ...baseCore.players,
                '0': {
                    ...wizard,
                    mageId: MAGE_IDS.WIZARD_APPRENTICE,
                    mageZoneId: ARENA_ZONE_IDS.A3,
                    mana: 5,
                    actionReady: true,
                },
            },
            arena: baseCore.arena.map((zone) => ({
                ...zone,
                occupantIds: zone.id === ARENA_ZONE_IDS.A3
                    ? ['0']
                    : zone.occupantIds.filter((id) => id !== '0'),
                objectIds: zone.id === gremlin.zoneId
                    ? [gremlin.id]
                    : zone.objectIds.filter((id) => id !== gremlin.id),
            })),
        };
    }

    function createGreyAngelAbilityCore(): MageWarsCore {
        const baseCore = MageWarsDomain.setup(['0', '1'], fixedRandom);
        const priestess = baseCore.players['0'];
        const angel = creatureObject('grey-angel-0', '0', 2907, 'Grey Angel', ARENA_ZONE_IDS.A3);
        const woundedCat: MageWarsArenaObjectState = {
            ...creatureObject('wounded-cat-0', '0', 2906, 'Wounded Cat', ARENA_ZONE_IDS.A2),
            damage: 3,
        };

        return {
            ...baseCore,
            currentPlayerId: '0',
            phaseActorId: '0',
            objects: {
                ...baseCore.objects,
                [angel.id]: angel,
                [woundedCat.id]: woundedCat,
            },
            players: {
                ...baseCore.players,
                '0': {
                    ...priestess,
                    mageId: MAGE_IDS.PRIESTESS_APPRENTICE,
                    mageZoneId: ARENA_ZONE_IDS.A3,
                    mana: 10,
                    actionReady: true,
                },
            },
            arena: baseCore.arena.map((zone) => ({
                ...zone,
                occupantIds: zone.id === ARENA_ZONE_IDS.A3
                    ? ['0']
                    : zone.occupantIds.filter((id) => id !== '0'),
                objectIds: zone.id === angel.zoneId
                    ? [angel.id]
                    : zone.id === woundedCat.zoneId
                        ? [woundedCat.id]
                        : zone.objectIds.filter((id) => ![angel.id, woundedCat.id].includes(id)),
            })),
        };
    }

    function createAsyranClericHealingLightCore(): MageWarsCore {
        const baseCore = MageWarsDomain.setup(['0', '1'], fixedRandom);
        const priestess = baseCore.players['0'];
        const cleric = creatureObject('asyran-cleric-0', '0', 2811, 'Asyran Cleric', ARENA_ZONE_IDS.A3);
        const woundedCat: MageWarsArenaObjectState = {
            ...creatureObject('healing-target-cat-0', '0', 2906, 'Healing Target Cat', ARENA_ZONE_IDS.A2),
            damage: 2,
        };

        return {
            ...baseCore,
            currentPlayerId: '0',
            phaseActorId: '0',
            objects: {
                ...baseCore.objects,
                [cleric.id]: cleric,
                [woundedCat.id]: woundedCat,
            },
            players: {
                ...baseCore.players,
                '0': {
                    ...priestess,
                    mageId: MAGE_IDS.PRIESTESS_APPRENTICE,
                    mageZoneId: ARENA_ZONE_IDS.A3,
                    mana: 10,
                    actionReady: true,
                },
            },
            arena: baseCore.arena.map((zone) => ({
                ...zone,
                occupantIds: zone.id === ARENA_ZONE_IDS.A3
                    ? ['0']
                    : zone.occupantIds.filter((id) => id !== '0'),
                objectIds: zone.id === cleric.zoneId
                    ? [cleric.id]
                    : zone.id === woundedCat.zoneId
                        ? [woundedCat.id]
                        : zone.objectIds.filter((id) => ![cleric.id, woundedCat.id].includes(id)),
            })),
        };
    }

    function createBeastStaffAbilityCore(): MageWarsCore {
        const baseCore = MageWarsDomain.setup(['0', '1'], fixedRandom);
        const beastmaster = baseCore.players['0'];
        const beastStaff: MageWarsArenaObjectState = {
            ...creatureObject('beast-staff-0', '0', 3710, '群兽法杖', ARENA_ZONE_IDS.A3),
            kind: 'equipment',
            sourceObjectId: 'spell-card-3710',
            typeLine: '装备 / 武器',
            attackOrTraitLine: '蛮力一击：快速近战 4 骰',
            combatProfilesSource: 'config',
            combatTraitsSource: 'config',
            anchoredToPlayerId: '0',
            actionReady: false,
        };
        const friendlyWolf: MageWarsArenaObjectState = {
            ...creatureObject('friendly-wolf-0', '0', 2819, 'Friendly Wolf', ARENA_ZONE_IDS.A3),
            typeLine: '生物 / 动物',
            damage: 2,
        };

        return {
            ...baseCore,
            currentPlayerId: '0',
            phaseActorId: '0',
            objects: {
                ...baseCore.objects,
                [beastStaff.id]: beastStaff,
                [friendlyWolf.id]: friendlyWolf,
            },
            players: {
                ...baseCore.players,
                '0': {
                    ...beastmaster,
                    mageId: MAGE_IDS.BEASTMASTER_APPRENTICE,
                    mageZoneId: ARENA_ZONE_IDS.A3,
                    mana: 10,
                    actionReady: true,
                },
            },
            arena: baseCore.arena.map((zone) => ({
                ...zone,
                occupantIds: zone.id === ARENA_ZONE_IDS.A3
                    ? ['0']
                    : zone.occupantIds.filter((id) => id !== '0'),
                objectIds: zone.id === ARENA_ZONE_IDS.A3
                    ? [beastStaff.id, friendlyWolf.id]
                    : zone.objectIds.filter((id) => ![beastStaff.id, friendlyWolf.id].includes(id)),
            })),
        };
    }

    function createElementalStaffAbilityCore(): MageWarsCore {
        const baseCore = MageWarsDomain.setup(['0', '1'], fixedRandom);
        const wizard = baseCore.players['0'];
        const elementalStaff: MageWarsArenaObjectState = {
            ...creatureObject('elemental-staff-0', '0', 3716, '元素魔杖', ARENA_ZONE_IDS.A3),
            kind: 'equipment',
            sourceObjectId: 'spell-card-3716',
            typeLine: '装备 / 法杖',
            attackOrTraitLine: '法术绑定',
            rulesText: '你可以从你的法术书中绑定一个非史诗攻击类法术到元素魔杖上。',
            anchoredToPlayerId: '0',
            boundSpellCardId: 1704,
            actionReady: false,
        };

        return {
            ...baseCore,
            currentPlayerId: '0',
            phaseActorId: '0',
            objects: {
                ...baseCore.objects,
                [elementalStaff.id]: elementalStaff,
            },
            players: {
                ...baseCore.players,
                '0': {
                    ...wizard,
                    mageId: MAGE_IDS.WIZARD_APPRENTICE,
                    mageZoneId: ARENA_ZONE_IDS.A3,
                    mana: 10,
                    quickcastReady: true,
                },
            },
            arena: baseCore.arena.map((zone) => ({
                ...zone,
                occupantIds: zone.id === ARENA_ZONE_IDS.A3
                    ? ['0']
                    : zone.occupantIds.filter((id) => id !== '0'),
                objectIds: zone.id === ARENA_ZONE_IDS.A3
                    ? [elementalStaff.id]
                    : zone.objectIds.filter((id) => id !== elementalStaff.id),
            })),
        };
    }

    it('submits Blue Gremlin self ability from its ChoiceRequest command', () => {
        const dispatch = vi.fn();
        renderBoardWithProviders(
            <MageWarsBoard {...boardProps(createBlueGremlinAbilityCore())} dispatch={dispatch} />,
        );

        const gremlinCard = screen.getByText('Blue Gremlin')
            .closest<HTMLElement>('[data-testid="mage-wars-zone-field-card"]');
        expect(gremlinCard).not.toBeNull();
        fireEvent.click(gremlinCard!);

        const abilityButton = document.querySelector<HTMLElement>(
            `[data-ability-id="${MAGE_WARS_OBJECT_ABILITY_IDS.BLUE_GREMLIN_SWIFT_TELEPORT}"]`,
        );
        expect(abilityButton).not.toBeNull();
        fireEvent.click(abilityButton!);

        expect(dispatch).toHaveBeenCalledWith(MAGE_WARS_COMMANDS.USE_ARENA_OBJECT_ABILITY, {
            objectId: 'blue-gremlin-0',
            abilityId: MAGE_WARS_OBJECT_ABILITY_IDS.BLUE_GREMLIN_SWIFT_TELEPORT,
            manaCost: 1,
        });
    });

    it('casts Grey Angel redemption sacrifice by selecting a living object target', async () => {
        const dispatch = vi.fn();
        renderBoardWithProviders(
            <MageWarsBoard {...boardProps(createGreyAngelAbilityCore())} dispatch={dispatch} />,
        );

        const angelCard = screen.getByText('Grey Angel')
            .closest<HTMLElement>('[data-testid="mage-wars-zone-field-card"]');
        expect(angelCard).not.toBeNull();
        fireEvent.click(angelCard!);

        const abilityButton = document.querySelector<HTMLElement>(
            `[data-ability-id="${MAGE_WARS_OBJECT_ABILITY_IDS.GREY_ANGEL_REDEMPTION_SACRIFICE}"]`,
        );
        expect(abilityButton).not.toBeNull();
        fireEvent.click(abilityButton!);
        expect(dispatch).not.toHaveBeenCalled();

        const targetCard = screen.getByText('Wounded Cat')
            .closest<HTMLElement>('[data-testid="mage-wars-zone-field-card"]');
        expect(targetCard).not.toBeNull();
        await waitFor(() => {
            expect(targetCard?.getAttribute('data-field-card-role')).toBe('target');
        });
        const targetZone = targetCard?.closest<HTMLElement>('[data-testid^="mage-wars-arena-zone-"]');
        expect(targetZone?.getAttribute('data-zone-target-scope')).toBe('object');
        expect(targetZone?.className).not.toContain('hover:bg-amber-200/8');
        expect(targetCard?.className).toContain('hover:brightness-110');
        expect(targetZone?.className).not.toContain('outline-emerald');
        expect(targetZone?.className).not.toContain('rgba(110,231,183');
        const targetFrame = targetCard?.querySelector<HTMLElement>('[data-testid="mage-wars-field-card-target-frame"]');
        expect(targetFrame?.className).toContain('emerald');
        expect(targetFrame?.className).toContain('inset-0');
        expect(targetFrame?.className).not.toContain('-inset');
        fireEvent.click(targetCard!);

        expect(dispatch).toHaveBeenCalledWith(MAGE_WARS_COMMANDS.USE_ARENA_OBJECT_ABILITY, {
            objectId: 'grey-angel-0',
            abilityId: MAGE_WARS_OBJECT_ABILITY_IDS.GREY_ANGEL_REDEMPTION_SACRIFICE,
            manaCost: 0,
            targetObjectId: 'wounded-cat-0',
        });
    });

    it('requires Asyran Cleric Healing Light to select a highlighted living object target', async () => {
        const dispatch = vi.fn();
        renderBoardWithProviders(
            <MageWarsBoard {...boardProps(createAsyranClericHealingLightCore())} dispatch={dispatch} />,
        );

        const clericCard = screen.getByText('Asyran Cleric')
            .closest<HTMLElement>('[data-testid="mage-wars-zone-field-card"]');
        expect(clericCard).not.toBeNull();
        fireEvent.click(clericCard!);

        const abilityButton = document.querySelector<HTMLElement>(
            `[data-ability-id="${MAGE_WARS_OBJECT_ABILITY_IDS.ASYRAN_CLERIC_HEALING_LIGHT}"]`,
        );
        expect(abilityButton).not.toBeNull();
        const abilityDock = screen.getByTestId('mage-wars-selected-ability-action-dock');
        expect(abilityDock.getAttribute('data-ability-action-placement')).toBe('source-card-below');
        expect(abilityDock.className).toContain('fixed');
        expect(abilityDock.getAttribute('data-ability-source-key')).toBe('object:asyran-cleric-0');
        expect(abilityDock.className).not.toContain('bottom-[15.75rem]');
        expect(abilityDock).toContainElement(abilityButton);
        expect(abilityDock.parentElement).toBe(document.body);
        expect(abilityButton?.getAttribute('data-ability-visual')).toBe('text-action');
        expect(abilityButton?.getAttribute('data-ability-action-placement')).toBe('source-card-below');
        expect(abilityButton?.textContent).toContain('治疗之光');
        expect(abilityButton?.querySelector('img')).toBeNull();
        expect(abilityButton?.querySelector('svg')).toBeNull();
        expect(abilityButton?.className).toContain('rounded-[0.25rem]');
        expect(abilityButton?.className).not.toContain('rounded-[0.22rem]');
        fireEvent.click(abilityButton!);
        expect(dispatch).not.toHaveBeenCalled();

        const targetCard = screen.getByText('Healing Target Cat')
            .closest<HTMLElement>('[data-testid="mage-wars-zone-field-card"]');
        expect(targetCard).not.toBeNull();
        await waitFor(() => {
            expect(targetCard?.getAttribute('data-field-card-role')).toBe('target');
        });
        const targetFrame = targetCard?.querySelector<HTMLElement>('[data-testid="mage-wars-field-card-target-frame"]');
        expect(targetFrame?.className).toContain('emerald');
        expect(targetFrame?.className).toContain('inset-0');
        expect(targetFrame?.className).not.toContain('-inset');
        fireEvent.click(targetCard!);

        expect(dispatch).toHaveBeenCalledWith(MAGE_WARS_COMMANDS.USE_ARENA_OBJECT_ABILITY, {
            objectId: 'asyran-cleric-0',
            abilityId: MAGE_WARS_OBJECT_ABILITY_IDS.ASYRAN_CLERIC_HEALING_LIGHT,
            manaCost: 0,
            targetObjectId: 'healing-target-cat-0',
        });
    });

    it('requires a Beast Staff mode choice when one target has multiple legal candidates', async () => {
        const dispatch = vi.fn();
        const { container } = renderBoardWithProviders(
            <MageWarsBoard {...boardProps(createBeastStaffAbilityCore())} dispatch={dispatch} />,
        );

        const staffCard = container.querySelector<HTMLElement>(
            '[data-testid="mage-wars-attached-card"][data-object-id="beast-staff-0"]',
        );
        expect(staffCard).not.toBeNull();
        fireEvent.click(staffCard!);

        const abilityButton = document.querySelector<HTMLElement>(
            `[data-ability-id="${MAGE_WARS_OBJECT_ABILITY_IDS.BEAST_STAFF}"]`,
        );
        expect(abilityButton).not.toBeNull();
        fireEvent.click(abilityButton!);

        const wolfCard = screen.getByText('Friendly Wolf')
            .closest<HTMLElement>('[data-testid="mage-wars-zone-field-card"]');
        expect(wolfCard).not.toBeNull();
        await waitFor(() => {
            expect(wolfCard?.getAttribute('data-field-card-role')).toBe('target');
        });
        fireEvent.click(wolfCard!);

        expect(dispatch).not.toHaveBeenCalled();
        expect(screen.queryByTestId('mage-wars-object-ability-choice-dock')).not.toBeNull();

        const healOption = screen.getAllByTestId('mage-wars-object-ability-choice-option')
            .find((option) => option.getAttribute('data-mode') === 'heal');
        expect(healOption).not.toBeUndefined();
        fireEvent.click(healOption!);

        expect(dispatch).toHaveBeenCalledWith(MAGE_WARS_COMMANDS.USE_ARENA_OBJECT_ABILITY, {
            objectId: 'beast-staff-0',
            abilityId: MAGE_WARS_OBJECT_ABILITY_IDS.BEAST_STAFF,
            manaCost: 2,
            targetObjectId: 'friendly-wolf-0',
            mode: 'heal',
        });
    });

    it('rebinds Elemental Staff by selecting a spell card candidate from ChoiceRequest', async () => {
        const dispatch = vi.fn();
        const { container } = renderBoardWithProviders(
            <MageWarsBoard
                {...boardProps(createElementalStaffAbilityCore(), '0', { phase: 'finalQuickcast' })}
                dispatch={dispatch}
            />,
        );

        const staffCard = container.querySelector<HTMLElement>(
            '[data-testid="mage-wars-attached-card"][data-object-id="elemental-staff-0"]',
        );
        expect(staffCard).not.toBeNull();
        fireEvent.click(staffCard!);

        const abilityButton = document.querySelector<HTMLElement>(
            `[data-ability-id="${MAGE_WARS_OBJECT_ABILITY_IDS.ELEMENTAL_STAFF_BIND}"]`,
        );
        expect(abilityButton).not.toBeNull();
        fireEvent.click(abilityButton!);

        await waitFor(() => {
            expect(screen.queryByTestId('mage-wars-object-ability-choice-dock')).not.toBeNull();
        });

        const spellOption = screen.getAllByTestId('mage-wars-object-ability-choice-option')
            .find((option) => option.getAttribute('data-bound-spell-card-id') === '1705');
        expect(spellOption).not.toBeUndefined();
        fireEvent.click(spellOption!);

        expect(dispatch).toHaveBeenCalledWith(MAGE_WARS_COMMANDS.USE_ARENA_OBJECT_ABILITY, {
            objectId: 'elemental-staff-0',
            abilityId: MAGE_WARS_OBJECT_ABILITY_IDS.ELEMENTAL_STAFF_BIND,
            manaCost: 3,
            boundSpellCardId: 1705,
        });
    });
});

describe('MageWarsBoard mage ability status choices', () => {
    function createPriestessRestoreChoiceCore(): MageWarsCore {
        const baseCore = MageWarsDomain.setup(['0', '1'], fixedRandom);
        const priestess = baseCore.players['0'];
        const afflictedAngel: MageWarsArenaObjectState = {
            ...creatureObject('afflicted-angel-0', '1', 2907, 'Afflicted Angel', ARENA_ZONE_IDS.A2),
            statusTokens: {
                [STATUS_TOKEN_IDS.BURN]: 1,
                [STATUS_TOKEN_IDS.STUN]: 1,
                [STATUS_TOKEN_IDS.SLEEP]: 1,
            },
        };

        return {
            ...baseCore,
            currentPlayerId: '0',
            phaseActorId: '0',
            objects: {
                ...baseCore.objects,
                [afflictedAngel.id]: afflictedAngel,
            },
            players: {
                ...baseCore.players,
                '0': {
                    ...priestess,
                    mageId: MAGE_IDS.PRIESTESS_APPRENTICE,
                    mageZoneId: ARENA_ZONE_IDS.A3,
                    mana: 20,
                    actionReady: true,
                    quickcastReady: true,
                },
            },
            arena: baseCore.arena.map((zone) => ({
                ...zone,
                occupantIds: zone.id === ARENA_ZONE_IDS.A3
                    ? ['0']
                    : zone.occupantIds.filter((id) => id !== '0'),
                objectIds: zone.id === afflictedAngel.zoneId
                    ? [afflictedAngel.id]
                    : zone.objectIds.filter((id) => id !== afflictedAngel.id),
            })),
        };
    }

    it('requires an explicit status combination selection for Priestess standard restoration', async () => {
        const dispatch = vi.fn();
        const { container } = renderBoardWithProviders(
            <MageWarsBoard {...boardProps(createPriestessRestoreChoiceCore())} dispatch={dispatch} />,
        );

        const priestessMage = container.querySelector<HTMLElement>(
            '[data-testid="mage-wars-zone-mage-entity"][data-player-id="0"]',
        );
        expect(priestessMage).not.toBeNull();
        fireEvent.click(priestessMage!);

        const restoreButton = screen.getByTestId('mage-wars-selected-mage-ability-restore');
        const restoreDock = screen.getByTestId('mage-wars-selected-ability-action-dock');
        expect(restoreDock.getAttribute('data-ability-action-placement')).toBe('source-card-below');
        expect(restoreDock.className).toContain('fixed');
        expect(restoreDock.getAttribute('data-ability-source-key')).toBe('mage:0');
        expect(restoreDock.className).not.toContain('bottom-[15.75rem]');
        expect(restoreDock).toContainElement(restoreButton);
        expect(restoreButton.getAttribute('data-ability-visual')).toBe('text-action');
        expect(restoreButton.getAttribute('data-ability-action-placement')).toBe('source-card-below');
        expect(restoreButton.textContent).toContain('复原术');
        expect(restoreButton.querySelector('img')).toBeNull();
        expect(restoreButton.querySelector('svg')).toBeNull();
        expect(restoreButton.className).toContain('rounded-[0.25rem]');
        expect(restoreButton.className).not.toContain('rounded-[0.22rem]');
        fireEvent.click(restoreButton);

        const targetCard = screen.getByText('Afflicted Angel')
            .closest<HTMLElement>('[data-testid="mage-wars-zone-field-card"]');
        expect(targetCard).not.toBeNull();
        await waitFor(() => {
            expect(targetCard?.getAttribute('data-field-card-role')).toBe('target');
        });

        fireEvent.click(targetCard!);

        expect(dispatch).not.toHaveBeenCalledWith(MAGE_WARS_COMMANDS.USE_MAGE_ABILITY, expect.anything());
        expect(screen.queryByTestId('mage-wars-mage-ability-status-choice-dock')).not.toBeNull();

        const fullRestoreOption = screen.getAllByTestId('mage-wars-mage-ability-status-option')
            .find((option) => option.getAttribute('data-status-token-ids') === [
                STATUS_TOKEN_IDS.BURN,
                STATUS_TOKEN_IDS.STUN,
                STATUS_TOKEN_IDS.SLEEP,
            ].join(','));
        expect(fullRestoreOption).not.toBeUndefined();
        expect(fullRestoreOption?.getAttribute('data-mana-cost')).toBe('9');

        fireEvent.click(fullRestoreOption!);

        expect(dispatch).toHaveBeenCalledWith(MAGE_WARS_COMMANDS.USE_MAGE_ABILITY, {
            abilityId: MAGE_WARS_MAGE_ABILITY_IDS.PRIESTESS_RESTORE_STANDARD,
            manaCost: 9,
            targetObjectId: 'afflicted-angel-0',
            statusTokenIds: [STATUS_TOKEN_IDS.BURN, STATUS_TOKEN_IDS.STUN, STATUS_TOKEN_IDS.SLEEP],
        });
    });
});

describe('MageWarsBoard spellbook planning UI', () => {
    it.each([
        ['planning', 'actions.passPlanning'],
        ['deployment', 'actions.passDeployment'],
        ['initiativeQuickcast', 'actions.passQuickcast'],
        ['creatureAction', 'actions.endAction'],
        ['finalQuickcast', 'actions.passQuickcast'],
    ])('labels the phase advance action for %s instead of reusing end turn', (phase, expectedLabel) => {
        const { unmount } = renderBoardWithProviders(
            <MageWarsBoard
                {...boardProps(undefined, '0', { phase })}
            />,
        );

        const mainAction = screen.getByTestId('mage-wars-turn-end');
        expect(mainAction.textContent).toBe(expectedLabel);
        expect(mainAction.getAttribute('data-main-action-mode')).toBe('advance-phase');
        expect(mainAction.getAttribute('data-main-action-phase')).toBe(phase);
        expect(mainAction.textContent).not.toBe('actions.endTurn');
        unmount();
    });

    it('shows spellbook copy counts and lets one visible card select multiple owned copies', () => {
        const dispatch = vi.fn();
        const { container } = renderBoardWithProviders(
            <MageWarsBoard
                {...boardProps(undefined, '0', { phase: 'planning' })}
                dispatch={dispatch}
            />,
        );

        let tanglevine = container.querySelector<HTMLElement>(
            '[data-testid="mage-wars-desktop-spellbook-card"][data-source-card-id="2224"]',
        );
        for (let pageIndex = 0; pageIndex < 6 && !tanglevine; pageIndex += 1) {
            const nextPage = screen.getByTestId('mage-wars-spellbook-next-page') as HTMLButtonElement;
            if (nextPage.disabled) break;
            fireEvent.click(nextPage);
            tanglevine = container.querySelector<HTMLElement>(
                '[data-testid="mage-wars-desktop-spellbook-card"][data-source-card-id="2224"]',
            );
        }
        const initialMainAction = screen.getByTestId('mage-wars-turn-end');
        expect(screen.getByTestId('mage-wars-turn-end-dock')).toContainElement(initialMainAction);
        expect(initialMainAction.getAttribute('data-main-action-mode')).toBe('advance-phase');
        expect(initialMainAction.textContent).toBe('actions.passPlanning');
        expect(screen.queryByTestId('mage-wars-plan-spells')).toBeNull();
        expect(screen.getByTestId('mage-wars-mage-hud-self').getAttribute('data-mage-wars-hud-density')).toBe('full');
        expect(screen.getByTestId('mage-wars-mage-hud-opponent').getAttribute('data-mage-wars-hud-density')).toBe('full');

        expect(tanglevine).not.toBeNull();
        expect(tanglevine?.getAttribute('data-copy-count')).toBe('3');
        const copyCountBadge = tanglevine?.querySelector<HTMLElement>('[data-testid="mage-wars-spellbook-copy-count"]');
        expect(copyCountBadge?.textContent).toBe('x3');
        expect(copyCountBadge?.className).toContain('bottom-1');
        expect(copyCountBadge?.className).toContain('text-[0.82rem]');
        expect(copyCountBadge?.className).toContain('px-2.5');
        expect(copyCountBadge?.className).not.toContain('right-1');
        expect(copyCountBadge?.className).not.toContain('top-1');
        expect(copyCountBadge?.style.left).toBe('50%');
        expect(copyCountBadge?.style.transform).toBe('translateX(-50%)');

        const inspectButton = container.querySelector<HTMLElement>(
            '[data-testid="mage-wars-card-inspect-button"][data-source-card-id="2224"]',
        );
        expect(inspectButton).not.toBeNull();
        expect(tanglevine?.contains(inspectButton)).toBe(false);

        fireEvent.click(inspectButton!);
        expect(tanglevine?.getAttribute('data-selected-count')).toBeNull();
        expect(screen.getByTestId('mage-wars-card-magnify-overlay').getAttribute('aria-hidden')).toBe('false');
        expect(screen.getByTestId('mage-wars-card-magnify-content').getAttribute('data-source-card-id')).toBe('2224');
        fireEvent.click(screen.getByTestId('mage-wars-card-magnify-overlay-close'));

        fireEvent.click(tanglevine!);
        expect(tanglevine?.getAttribute('data-selected-count')).toBe('1');
        expect(tanglevine?.querySelector('[data-testid="mage-wars-spellbook-selected-count"]')).toBeNull();
        expect(container.querySelectorAll('[data-testid="mage-wars-desktop-prepared-card"][data-planning-draft="true"][data-source-card-id="2224"]'))
            .toHaveLength(1);

        fireEvent.click(tanglevine!);
        expect(tanglevine?.getAttribute('data-selected-count')).toBe('2');
        expect(tanglevine?.querySelector('[data-testid="mage-wars-spellbook-selected-count"]')).toBeNull();
        expect(screen.getByTestId('mage-wars-mage-hud-self').getAttribute('data-mage-wars-hud-density')).toBe('full');
        expect(screen.getByTestId('mage-wars-mage-hud-opponent').getAttribute('data-mage-wars-hud-density')).toBe('full');
        const draftSlots = Array.from(container.querySelectorAll<HTMLElement>(
            '[data-testid="mage-wars-desktop-prepared-card"][data-planning-draft="true"][data-source-card-id="2224"]',
        ));
        expect(draftSlots).toHaveLength(2);
        expect(draftSlots.map((slot) => slot.getAttribute('data-plan-slot-index')).sort()).toEqual(['1', '2']);

        const planButton = screen.getByTestId('mage-wars-plan-spells');
        expect(planButton.getAttribute('data-main-action-mode')).toBe('plan-spells');
        expect(planButton.getAttribute('data-plan-progress')).toBe('2/2');
        expect(screen.getByTestId('mage-wars-turn-end-dock')).toContainElement(planButton);
        expect(screen.getByTestId('mage-wars-desktop-spellbook-shelf')).not.toContainElement(planButton);
        expect(screen.queryByTestId('mage-wars-turn-end')).toBeNull();

        fireEvent.click(planButton);
        expect(dispatch).toHaveBeenCalledWith(MAGE_WARS_COMMANDS.PLAN_SPELLS, {
            spellCardIds: [2224, 2224],
        });
    });
});

describe('MageWarsBoard token placement', () => {
    function createGuardTokenPlacementCore(): MageWarsCore {
        const baseCore = MageWarsDomain.setup(['0', '1'], fixedRandom);
        const guardedCat: MageWarsArenaObjectState = {
            ...creatureObject('guarded-cat-0', '0', 2906, 'Guarded Cat', ARENA_ZONE_IDS.A3),
            guarding: true,
        };

        return {
            ...baseCore,
            objects: {
                ...baseCore.objects,
                [guardedCat.id]: guardedCat,
            },
            players: {
                ...baseCore.players,
                '0': {
                    ...baseCore.players['0'],
                    mageZoneId: ARENA_ZONE_IDS.A3,
                    guarding: true,
                },
            },
            arena: baseCore.arena.map((zone) => ({
                ...zone,
                occupantIds: zone.id === ARENA_ZONE_IDS.A3
                    ? ['0']
                    : zone.occupantIds.filter((id) => id !== '0'),
                objectIds: zone.id === ARENA_ZONE_IDS.A3
                    ? [guardedCat.id]
                    : zone.objectIds.filter((id) => id !== guardedCat.id),
            })),
        };
    }

    function createWoundedTokenPlacementCore(): MageWarsCore {
        const baseCore = MageWarsDomain.setup(['0', '1'], fixedRandom);
        const woundedCat: MageWarsArenaObjectState = {
            ...creatureObject('wounded-overlay-cat-0', '0', 2906, 'Wounded Overlay Cat', ARENA_ZONE_IDS.A3),
            damage: 2,
        };

        return {
            ...baseCore,
            objects: {
                ...baseCore.objects,
                [woundedCat.id]: woundedCat,
            },
            players: {
                ...baseCore.players,
                '0': {
                    ...baseCore.players['0'],
                    mageZoneId: ARENA_ZONE_IDS.A3,
                    damage: 6,
                },
            },
            arena: baseCore.arena.map((zone) => ({
                ...zone,
                occupantIds: zone.id === ARENA_ZONE_IDS.A3
                    ? ['0']
                    : zone.occupantIds.filter((id) => id !== '0'),
                objectIds: zone.id === ARENA_ZONE_IDS.A3
                    ? [woundedCat.id]
                    : zone.objectIds.filter((id) => id !== woundedCat.id),
            })),
        };
    }

    it('keeps creature and mage tokens in a left-inside vertical rail', () => {
        const { container } = renderBoardWithProviders(<MageWarsBoard {...boardProps(createGuardTokenPlacementCore())} />);

        expect(screen.queryAllByTestId('mage-wars-mage-hud-token-icon')).toHaveLength(0);

        const guardedCat = screen.getByText('Guarded Cat')
            .closest<HTMLElement>('[data-testid="mage-wars-zone-field-card"]');
        expect(guardedCat).not.toBeNull();
        const guardedCatRail = guardedCat?.querySelector<HTMLElement>(
            '[data-testid="mage-wars-entity-status-token-rail"]',
        );
        expect(guardedCatRail).not.toBeNull();
        expect(guardedCatRail?.querySelector('img[alt="tokens.guard"]')).not.toBeNull();
        expect(guardedCatRail?.className).toContain('left-1');
        expect(guardedCatRail?.className).toContain('top-1/2');
        expect(guardedCatRail?.className).toContain('-translate-y-1/2');
        expect(guardedCatRail?.getAttribute('data-token-rail-position')).toBe('entity-left-inside-midline');
        expect(guardedCatRail?.getAttribute('data-token-rail-axis')).toBe('vertical');
        expect(guardedCatRail?.getAttribute('data-token-rail-placement')).toBe('inside');
        expect(guardedCatRail?.getAttribute('data-token-rail-layout')).toBe('stack');
        expect(guardedCatRail?.className).not.toContain('top-full');
        expect(guardedCatRail?.className).not.toContain('-translate-x');
        const guardedCatRailOrder = Array.from(guardedCatRail?.children ?? []).map((child) => (
            (child as HTMLElement).dataset.tokenKind ?? (child as HTMLElement).dataset.testid
        ));
        expect(guardedCatRailOrder.slice(0, 2)).toEqual(['action', 'mage-wars-guard-token-slot']);

        const mageEntity = container.querySelector<HTMLElement>(
            '[data-testid="mage-wars-zone-mage-entity"][data-player-id="0"]',
        );
        expect(mageEntity).not.toBeNull();
        expect(mageEntity?.getAttribute('data-action-ready')).toBe('true');
        expect(mageEntity?.getAttribute('data-action-token-state')).toBe('ready');
        expect(mageEntity?.getAttribute('data-quickcast-ready')).toBe('true');
        expect(mageEntity?.getAttribute('data-quickcast-token-state')).toBe('ready');
        const mageTokenRail = mageEntity?.querySelector<HTMLElement>('[data-testid="mage-wars-entity-status-token-rail"]');
        expect(mageTokenRail?.getAttribute('data-token-rail-position')).toBe('entity-left-inside-midline');
        expect(mageTokenRail?.getAttribute('data-token-rail-axis')).toBe('vertical');
        expect(mageTokenRail?.getAttribute('data-token-rail-layout')).toBe('stack');
        expect(mageTokenRail?.getAttribute('data-token-rail-placement')).toBe('inside');
        expect(mageEntity?.querySelector('[data-testid="mage-wars-action-token-slot"]')?.getAttribute('data-action-token-position')).toBe('entity-left-inside-midline');
        expect(mageEntity?.querySelector('[data-testid="mage-wars-quickcast-token-slot"]')?.getAttribute('data-quickcast-token-position')).toBe('entity-left-inside-midline');
        expect(mageEntity?.querySelector('[data-testid="mage-wars-guard-token-slot"]')?.getAttribute('data-guard-token-position')).toBe('entity-left-inside-midline');
        fireEvent.click(guardedCat!);

        const guardAction = screen.getByTestId('mage-wars-selected-unit-guard');
        expect(guardAction.getAttribute('data-action-kind')).toBe('guard');
        expect(guardAction.getAttribute('data-action-visual')).toBe('text-action');
        expect(guardAction.getAttribute('data-action-placement')).toBe('source-card-below');
        expect(guardAction.className).toContain('bg-emerald-200');
        expect(guardAction.textContent).toContain('actions.guardCreature');
        expect(guardAction.className).not.toContain('rounded-[0.22rem]');
        expect(guardAction.className).not.toContain('bg-emerald-950');
        expect(guardAction.querySelector('img[alt="tokens.guard"]')).toBeNull();
        expect(guardAction.querySelector('svg')).toBeNull();
    });

    it('renders wounded state as a Summoner Wars style life readout instead of generic badges or damage token images', () => {
        const { container } = renderBoardWithProviders(<MageWarsBoard {...boardProps(createWoundedTokenPlacementCore())} />);

        const lifeToggle = screen.getByTestId('mage-wars-life-toggle');
        expect(lifeToggle.getAttribute('aria-pressed')).toBe('false');
        expect(lifeToggle.getAttribute('data-life-visible')).toBe('false');

        const creatureCard = screen.getByText('Wounded Overlay Cat')
            .closest<HTMLElement>('[data-testid="mage-wars-zone-field-card"]');
        expect(creatureCard).not.toBeNull();
        const creatureOverlay = creatureCard?.querySelector<HTMLElement>('[data-testid="mage-wars-field-card-damage-overlay"]');
        expect(creatureOverlay).not.toBeNull();
        expect(creatureOverlay?.getAttribute('data-damage')).toBe('2');
        expect(creatureOverlay?.getAttribute('data-life')).toBe('4');
        expect(creatureOverlay?.querySelector('[data-testid="mage-wars-field-card-damage-overlay-value"]')).toBeNull();
        const creatureLifeReadout = creatureCard?.querySelector<HTMLElement>('[data-testid="mage-wars-field-card-life-readout"]');
        expect(creatureLifeReadout).not.toBeNull();
        expect(creatureLifeReadout?.getAttribute('data-life-remaining')).toBe('2');
        expect(creatureLifeReadout?.getAttribute('data-life-visible')).toBe('false');
        expect(creatureLifeReadout?.className).toContain('opacity-0');
        expect(creatureLifeReadout?.className).toContain('group-hover:opacity-100');
        expect(creatureLifeReadout?.querySelector('[data-testid="mage-wars-field-card-life-readout-text"]')?.textContent).toBe('2/4');

        const mageEntity = container.querySelector<HTMLElement>(
            '[data-testid="mage-wars-zone-mage-entity"][data-player-id="0"]',
        );
        expect(mageEntity).not.toBeNull();
        const mageOverlay = mageEntity?.querySelector<HTMLElement>('[data-testid="mage-wars-mage-entity-damage-overlay"]');
        expect(mageOverlay).not.toBeNull();
        expect(mageOverlay?.getAttribute('data-damage')).toBe('6');
        expect(mageOverlay?.querySelector('[data-testid="mage-wars-mage-entity-damage-overlay-value"]')).toBeNull();
        const mageLifeReadout = mageEntity?.querySelector<HTMLElement>('[data-testid="mage-wars-mage-entity-life-readout"]');
        expect(mageLifeReadout).not.toBeNull();
        expect(mageLifeReadout?.getAttribute('data-life-remaining')).toBe('18');
        expect(mageLifeReadout?.getAttribute('data-life-visible')).toBe('false');
        expect(mageLifeReadout?.getAttribute('data-life-readout-position')).toBe('entity-right-midline');
        expect(mageLifeReadout?.querySelector('[data-testid="mage-wars-mage-entity-life-readout-text"]')?.textContent).toBe('18/24');
        const mageTokenRail = mageEntity?.querySelector<HTMLElement>('[data-testid="mage-wars-entity-status-token-rail"]');
        expect(mageTokenRail?.getAttribute('data-token-rail-layout')).toBe('stack');
        expect(mageTokenRail?.getAttribute('data-token-rail-position')).toBe('entity-left-inside-midline');

        fireEvent.click(lifeToggle);
        expect(lifeToggle.getAttribute('aria-pressed')).toBe('true');
        expect(lifeToggle.getAttribute('data-life-visible')).toBe('true');
        expect(creatureLifeReadout?.getAttribute('data-life-visible')).toBe('true');
        expect(creatureLifeReadout?.className).toContain('opacity-100');
        expect(mageLifeReadout?.getAttribute('data-life-visible')).toBe('true');
        expect(mageTokenRail?.getAttribute('data-token-rail-layout')).toBe('stack');
        expect(mageTokenRail?.getAttribute('data-token-rail-placement')).toBe('inside');

        expect(screen.queryByAltText('tokens.damage')).toBeNull();
    });
});

describe('MageWarsBoard wall targeting', () => {
    function createWallReadyCore(): MageWarsCore {
        const baseCore = MageWarsDomain.setup(['0', '1'], fixedRandom);
        const beastmaster = baseCore.players['0'];
        return {
            ...baseCore,
            currentPlayerId: '0',
            phaseActorId: '0',
            players: {
                ...baseCore.players,
                '0': {
                    ...beastmaster,
                    mageId: MAGE_IDS.BEASTMASTER_APPRENTICE,
                    mageZoneId: ARENA_ZONE_IDS.A3,
                    mana: 20,
                    actionReady: true,
                    quickcastReady: true,
                    preparedSpellSlots: 1,
                    preparedSpellCardIds: [25700],
                },
            },
            arena: baseCore.arena.map((zone) => ({
                ...zone,
                occupantIds: zone.id === ARENA_ZONE_IDS.A3 ? ['0'] : zone.occupantIds.filter((id) => id !== '0'),
            })),
        };
    }

    it('casts an implemented wall spell by selecting a legal arena edge', async () => {
        const dispatch = vi.fn();
        const { container } = renderBoardWithProviders(<MageWarsBoard {...boardProps(createWallReadyCore())} dispatch={dispatch} />);

        const wallPreparedCard = container.querySelector<HTMLElement>('[data-testid="mage-wars-desktop-prepared-card"][data-source-card-id="25700"]');
        expect(wallPreparedCard).not.toBeNull();
        fireEvent.click(wallPreparedCard!);

        await waitFor(() => {
            expect(screen.getByTestId('mage-wars-wall-edge-a3-b3').getAttribute('data-legal-target-wall-edge')).toBe('true');
        });

        fireEvent.click(screen.getByTestId('mage-wars-wall-edge-a3-b3'));

        expect(dispatch).toHaveBeenCalledWith(MAGE_WARS_COMMANDS.CAST_SPELL, expect.objectContaining({
            spellCardId: 25700,
            targetWallEdgeId: 'a3-b3',
        }));
    });

    it('renders existing wall objects on arena edges', () => {
        const core = createWallReadyCore();
        const wallCore: MageWarsCore = {
            ...core,
            walls: {
                'a3-b3': {
                    id: 'mwwall-0-a3-b3-1',
                    ownerId: '0',
                    sourceSpellCardId: 25700,
                    sourceObjectId: 'spell-25700',
                    name: '荆棘之墙',
                    edgeId: 'a3-b3',
                    zoneIds: [ARENA_ZONE_IDS.A3, ARENA_ZONE_IDS.B3],
                    blocksLineOfSight: true,
                    passageDamage: { amount: 3, damageTypes: ['穿越墙体'] },
                },
            },
        };

        renderBoardWithProviders(<MageWarsBoard {...boardProps(wallCore)} />);

        const wallEdge = screen.getByTestId('mage-wars-wall-edge-a3-b3');
        expect(wallEdge.getAttribute('data-wall-object')).toBe('true');
        expect(wallEdge.getAttribute('data-wall-spell-card-id')).toBe('25700');
        expect(screen.queryByTestId('mage-wars-wall-object')).not.toBeNull();
        const wallCardPreview = screen.getByTestId('mage-wars-wall-card-preview');
        expect(wallCardPreview.getAttribute('data-source-card-id')).toBe('25700');
        expect(wallCardPreview.getAttribute('data-wall-visual')).toBe('spell-card');
        expect(wallCardPreview.textContent).toContain('荆棘之墙');
    });
});
