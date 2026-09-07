import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DiceBoxPhysicsSource } from '../dice-physics/DiceBoxPhysicsSource';

const createEngineMock = vi.fn();
const settledMotion = { type: 'settled' } as const;
const rollMotion = (id: string) => ({ type: 'roll', id }) as const;
const rerollMotion = (id: string, dieIds: number[], previousValues?: number[]) =>
    ({ type: 'reroll', id, dieIds, previousValues }) as const;

vi.mock('../dice-box-threejs/engine', () => ({
    DiceBoxThreeEngine: {
        create: (...args: unknown[]) => createEngineMock(...args),
    },
}));

describe('DiceBoxPhysicsSource', () => {
    beforeEach(() => {
        createEngineMock.mockReset();
    });

    it('容器从零尺寸变为可见后才初始化物理骰子引擎', async () => {
        const originalResizeObserver = globalThis.ResizeObserver;
        const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
        let resizeCallback: ResizeObserverCallback | null = null;
        let hasLayoutSize = false;

        class MockResizeObserver {
            constructor(callback: ResizeObserverCallback) {
                resizeCallback = callback;
            }

            observe = vi.fn();
            unobserve = vi.fn();
            disconnect = vi.fn();
        }

        Object.defineProperty(globalThis, 'ResizeObserver', {
            configurable: true,
            value: MockResizeObserver,
        });
        HTMLElement.prototype.getBoundingClientRect = vi.fn(() => ({
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            right: hasLayoutSize ? 320 : 0,
            bottom: hasLayoutSize ? 240 : 0,
            width: hasLayoutSize ? 320 : 0,
            height: hasLayoutSize ? 240 : 0,
            toJSON: () => ({}),
        }));

        try {
            const engineMock = {
                resize: vi.fn(),
                destroy: vi.fn(),
                setCanvasDiagnostics: vi.fn(),
                setDieSkins: vi.fn(),
                setDiceHighlights: vi.fn(),
                getPhysicsState: vi.fn(),
                hasDice: vi.fn()
                    .mockReturnValueOnce(false)
                    .mockReturnValueOnce(false)
                    .mockReturnValueOnce(true)
                    .mockReturnValue(true),
                rollToValues: vi.fn().mockResolvedValue(undefined),
                rerollToValues: vi.fn().mockResolvedValue(undefined),
                syncSettledValues: vi.fn(),
                previewValues: vi.fn(),
                clear: vi.fn(),
                removeDice: vi.fn(),
                restoreValues: vi.fn().mockResolvedValue(undefined),
            };
            createEngineMock.mockResolvedValue(engineMock);

            render(
                <DiceBoxPhysicsSource
                    dice={[{ id: 7, value: 6, isKept: false }]}
                    motion={rollMotion('layout-roll')}
                />,
            );

            await act(async () => {});
            expect(createEngineMock).not.toHaveBeenCalled();

            hasLayoutSize = true;
            await act(async () => {
                resizeCallback?.([], {} as ResizeObserver);
            });

            await waitFor(() => {
                expect(createEngineMock).toHaveBeenCalledTimes(1);
            });
            await waitFor(() => {
                expect(engineMock.rerollToValues).toHaveBeenCalledWith([0], [6], []);
            });
            expect(engineMock.restoreValues).toHaveBeenCalledWith([6]);
            expect(engineMock.rollToValues).not.toHaveBeenCalled();
            expect(
                engineMock.restoreValues.mock.invocationCallOrder[0],
            ).toBeLessThan(engineMock.rerollToValues.mock.invocationCallOrder[0]);
        } finally {
            HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
            Object.defineProperty(globalThis, 'ResizeObserver', {
                configurable: true,
                value: originalResizeObserver,
            });
        }
    });

    it('物理状态回调身份变化时不会重建骰子引擎', async () => {
        const engineMock = {
            resize: vi.fn(),
            destroy: vi.fn(),
            setCanvasDiagnostics: vi.fn(),
            setDieSkins: vi.fn(),
            setDiceHighlights: vi.fn(),
            getPhysicsState: vi.fn(),
            hasDice: vi.fn().mockReturnValue(false),
            rollToValues: vi.fn(),
            rerollToValues: vi.fn(),
            syncSettledValues: vi.fn(),
            previewValues: vi.fn(),
            clear: vi.fn(),
            removeDice: vi.fn(),
            restoreValues: vi.fn().mockResolvedValue(undefined),
        };
        createEngineMock.mockResolvedValue(engineMock);

        const view = render(
            <DiceBoxPhysicsSource
                dice={[{ id: 7, value: 6, isKept: false }]}
                motion={settledMotion}
                onPhysicsStatesChange={vi.fn()}
            />,
        );

        await waitFor(() => {
            expect(createEngineMock).toHaveBeenCalledTimes(1);
        });

        view.rerender(
            <DiceBoxPhysicsSource
                dice={[{ id: 7, value: 6, isKept: false }]}
                motion={settledMotion}
                onPhysicsStatesChange={vi.fn()}
            />,
        );

        await act(async () => {});
        expect(createEngineMock).toHaveBeenCalledTimes(1);
        expect(engineMock.destroy).not.toHaveBeenCalled();
    });

    it('同一个投骰动画 key 的确认进度重渲染不会重新滚动骰子', async () => {
        const engineMock = {
            resize: vi.fn(),
            destroy: vi.fn(),
            setCanvasDiagnostics: vi.fn(),
            setDieSkins: vi.fn(),
            setDiceHighlights: vi.fn(),
            getPhysicsState: vi.fn(),
            hasDice: vi.fn().mockReturnValue(true),
            rollToValues: vi.fn().mockResolvedValue(undefined),
            rerollToValues: vi.fn().mockResolvedValue(undefined),
            syncSettledValues: vi.fn(),
            previewValues: vi.fn(),
            clear: vi.fn(),
            removeDice: vi.fn(),
            restoreValues: vi.fn().mockResolvedValue(undefined),
        };
        createEngineMock.mockResolvedValue(engineMock);

        const view = render(
            <DiceBoxPhysicsSource
                dice={[{ id: 7, value: 6, isKept: false }]}
                motion={rollMotion('attack-roll-1')}
            />,
        );

        await waitFor(() => {
            expect(engineMock.rerollToValues).toHaveBeenCalledTimes(1);
        });
        await waitFor(() => {
            expect(view.getByTestId('dice-box-physics-source')).toHaveAttribute('data-dice-settled', 'true');
        });

        view.rerender(
            <DiceBoxPhysicsSource
                dice={[{ id: 7, value: 6, isKept: false }]}
                motion={rollMotion('attack-roll-1')}
            />,
        );

        await act(async () => {});
        expect(engineMock.rerollToValues).toHaveBeenCalledTimes(1);
        expect(engineMock.syncSettledValues).toHaveBeenCalledWith([6]);

        view.rerender(
            <DiceBoxPhysicsSource
                dice={[{ id: 7, value: 6, isKept: false }]}
                motion={rollMotion('attack-roll-2')}
            />,
        );

        await waitFor(() => {
            expect(engineMock.rerollToValues).toHaveBeenCalledTimes(2);
        });
    });

    it('运行期渲染失败时会清空物理状态并停用 3D 物理源', async () => {
        const onPhysicsStatesChange = vi.fn();
        const engineMock = {
            resize: vi.fn(),
            destroy: vi.fn(),
            setCanvasDiagnostics: vi.fn(),
            setDieSkins: vi.fn(),
            setDiceHighlights: vi.fn(),
            getPhysicsState: vi.fn(),
            hasDice: vi.fn().mockReturnValue(false),
            rollToValues: vi.fn(),
            rerollToValues: vi.fn(),
            syncSettledValues: vi.fn(),
            previewValues: vi.fn(),
            clear: vi.fn(),
            removeDice: vi.fn(),
            restoreValues: vi.fn().mockRejectedValueOnce(new Error('renderer failed')),
        };
        createEngineMock.mockResolvedValue(engineMock);

        render(
            <DiceBoxPhysicsSource
                dice={[{ id: 7, value: 6, isKept: false }]}
                motion={settledMotion}
                onPhysicsStatesChange={onPhysicsStatesChange}
            />,
        );

        await waitFor(() => {
            expect(engineMock.destroy).toHaveBeenCalled();
        });
        expect(onPhysicsStatesChange).toHaveBeenCalledWith([]);
    });

    it('同一颗骰子的连续同面重掷不会吞掉第二次动画', async () => {
        let finishFirstReroll: (() => void) | undefined;
        const firstReroll = new Promise<void>((resolve) => {
            finishFirstReroll = resolve;
        });
        const rerollToValues = vi.fn()
            .mockImplementationOnce(() => firstReroll)
            .mockResolvedValue(undefined);
        const engineMock = {
            resize: vi.fn(),
            destroy: vi.fn(),
            setCanvasDiagnostics: vi.fn(),
            setDieSkins: vi.fn(),
            setDiceHighlights: vi.fn(),
            getPhysicsState: vi.fn(),
            hasDice: vi.fn().mockReturnValue(true),
            rerollToValues,
            syncSettledValues: vi.fn(),
            previewValues: vi.fn(),
            clear: vi.fn(),
            removeDice: vi.fn(),
            restoreValues: vi.fn(),
        };
        createEngineMock.mockResolvedValue(engineMock);

        const dice = [{ id: 7, value: 6, isKept: false }];
        const view = render(
            <DiceBoxPhysicsSource
                dice={dice}
                motion={rerollMotion('reroll-1', [7])}
            />,
        );

        await waitFor(() => {
            expect(rerollToValues).toHaveBeenCalledTimes(1);
        });

        await act(async () => {
            view.rerender(
                <DiceBoxPhysicsSource
                    dice={[{ id: 7, value: 6, isKept: false }]}
                    motion={rerollMotion('reroll-2', [7])}
                />,
            );
        });

        expect(rerollToValues).toHaveBeenCalledTimes(1);

        await act(async () => {
            finishFirstReroll?.();
        });

        await waitFor(() => {
            expect(rerollToValues).toHaveBeenCalledTimes(2);
        });
    });

    it('重掷停稳状态必须等插件真实重掷结束', async () => {
        let finishReroll: (() => void) | undefined;
        const reroll = new Promise<void>((resolve) => {
            finishReroll = resolve;
        });
        const rerollToValues = vi.fn().mockImplementation(() => reroll);
        const engineMock = {
            resize: vi.fn(),
            destroy: vi.fn(),
            setCanvasDiagnostics: vi.fn(),
            setDieSkins: vi.fn(),
            setDiceHighlights: vi.fn(),
            getPhysicsState: vi.fn(),
            hasDice: vi.fn().mockReturnValue(true),
            rerollToValues,
            syncSettledValues: vi.fn(),
            previewValues: vi.fn(),
            clear: vi.fn(),
            removeDice: vi.fn(),
            restoreValues: vi.fn(),
        };
        createEngineMock.mockResolvedValue(engineMock);

        const view = render(
            <DiceBoxPhysicsSource
                dice={[{ id: 7, value: 6, isKept: false }]}
                motion={rerollMotion('visible-reroll', [7])}
            />,
        );

        await waitFor(() => {
            expect(rerollToValues).toHaveBeenCalledTimes(1);
        });
        expect(view.getByTestId('dice-box-physics-source')).toHaveAttribute('data-dice-settled', 'false');

        await act(async () => {
            finishReroll?.();
        });

        await waitFor(() => {
            expect(view.getByTestId('dice-box-physics-source')).toHaveAttribute('data-dice-settled', 'true');
        });
    });

    it('重掷时会先恢复重掷前骰面再进入插件真实重掷', async () => {
        let finishReroll: (() => void) | undefined;
        const reroll = new Promise<void>((resolve) => {
            finishReroll = resolve;
        });
        const restoreValues = vi.fn().mockResolvedValue(undefined);
        const rerollToValues = vi.fn().mockImplementation(() => reroll);
        const engineMock = {
            resize: vi.fn(),
            destroy: vi.fn(),
            setCanvasDiagnostics: vi.fn(),
            setDieSkins: vi.fn(),
            setDiceHighlights: vi.fn(),
            getPhysicsState: vi.fn(),
            hasDice: vi.fn().mockReturnValue(false),
            rerollToValues,
            syncSettledValues: vi.fn(),
            previewValues: vi.fn(),
            clear: vi.fn(),
            removeDice: vi.fn(),
            restoreValues,
        };
        createEngineMock.mockResolvedValue(engineMock);

        render(
            <DiceBoxPhysicsSource
                dice={[{ id: 7, value: 6, isKept: false }]}
                motion={rerollMotion('visible-reroll-from-old-face', [7], [2])}
            />,
        );

        await waitFor(() => {
            expect(rerollToValues).toHaveBeenCalledWith([0], [6], []);
        });
        expect(restoreValues).toHaveBeenCalledWith([2]);
        expect(
            restoreValues.mock.invocationCallOrder[0],
        ).toBeLessThan(rerollToValues.mock.invocationCallOrder[0]);

        await act(async () => {
            finishReroll?.();
        });
    });

    it('物理投掷中不抢写骰子坐标，避免连续跳变和透视缩放抖动', async () => {
        const originalRequestAnimationFrame = window.requestAnimationFrame;
        const originalCancelAnimationFrame = window.cancelAnimationFrame;
        const animationFrames: FrameRequestCallback[] = [];
        let finishRoll: (() => void) | undefined;
        const rolling = new Promise<void>((resolve) => {
            finishRoll = resolve;
        });
        const engineMock = {
            resize: vi.fn(),
            destroy: vi.fn(),
            setCanvasDiagnostics: vi.fn(),
            setDieSkins: vi.fn(),
            setDiceHighlights: vi.fn(),
            getPhysicsState: vi.fn(),
            hasDice: vi.fn().mockReturnValue(true),
            rerollToValues: vi.fn().mockImplementation(() => rolling),
            syncSettledValues: vi.fn(),
            previewValues: vi.fn(),
            clear: vi.fn(),
            removeDice: vi.fn(),
            restoreValues: vi.fn(),
        };
        createEngineMock.mockResolvedValue(engineMock);
        window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
            animationFrames.push(callback);
            return animationFrames.length;
        });
        window.cancelAnimationFrame = vi.fn();

        try {
            render(
                <DiceBoxPhysicsSource
                    dice={[{ id: 7, value: 6, isKept: false }]}
                    motion={rollMotion('active-roll')}
                />,
            );

            await waitFor(() => {
                expect(engineMock.rerollToValues).toHaveBeenCalledWith([0], [6], []);
                expect(animationFrames.length).toBeGreaterThan(0);
            });

            await act(async () => {
                animationFrames.shift()?.(performance.now());
            });

        } finally {
            await act(async () => {
                finishRoll?.();
            });
            window.requestAnimationFrame = originalRequestAnimationFrame;
            window.cancelAnimationFrame = originalCancelAnimationFrame;
        }
    });
});
