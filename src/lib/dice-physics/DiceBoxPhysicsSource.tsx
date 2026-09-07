import React from 'react';

import {
    DiceBoxThreeEngine,
    type DiceBoxDieSkin,
    type DiceBoxStyleProfile,
} from '../dice-box-threejs/engine';
import type { DicePhysicsHighlightState, DicePhysicsRendererMode, DicePhysicsState } from './types';

const DICE_PHYSICS_HIGHLIGHT_RENDERER = 'threejs-backside-shader-shell';

export interface DicePhysicsDieInput {
    id: number;
    value: number;
    isKept?: boolean;
}

export type DiceBoxPhysicsMotion =
    | { type: 'settled' }
    | { type: 'roll'; id: string }
    | { type: 'reroll'; id: string; dieIds: number[]; previousValues?: number[] };

export interface DiceBoxPhysicsSourceProps {
    dice: DicePhysicsDieInput[];
    motion: DiceBoxPhysicsMotion;
    styleProfile?: DiceBoxStyleProfile;
    dieSkins?: Array<DiceBoxDieSkin | null>;
    highlightedDice?: DicePhysicsHighlightState[];
    requireDieSkins?: boolean;
    rendererMode?: DicePhysicsRendererMode;
    canvasTestId?: string;
    className?: string;
    style?: React.CSSProperties;
    testId?: string;
    dataAttributes?: Record<string, string>;
    onPhysicsStatesChange?: (states: DicePhysicsState[]) => void;
    onSettledChange?: (settled: boolean) => void;
}

export function DiceBoxPhysicsSource({
    dice,
    motion,
    styleProfile,
    dieSkins,
    highlightedDice = [],
    requireDieSkins = false,
    rendererMode = 'physics-only',
    canvasTestId,
    className,
    style,
    testId = 'dice-box-physics-source',
    dataAttributes,
    onPhysicsStatesChange,
    onSettledChange,
}: DiceBoxPhysicsSourceProps) {
    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const engineRef = React.useRef<DiceBoxThreeEngine | null>(null);
    const diceLengthRef = React.useRef(dice.length);
    const onPhysicsStatesChangeRef = React.useRef(onPhysicsStatesChange);
    const onSettledChangeRef = React.useRef(onSettledChange);
    const previousDiceIdsRef = React.useRef<number[]>([]);
    const activeMotionRef = React.useRef<{ type: 'roll' | 'reroll'; key: string } | null>(null);
    const completedRollMotionKeyRef = React.useRef<string | null>(null);
    const completedRerollMotionKeyRef = React.useRef<string | null>(null);
    const pendingRerollMotionRef = React.useRef<{
        key: string;
        indices: number[];
        previousValues: number[];
        values: number[];
        lockedIndices: number[];
    } | null>(null);
    const settledRef = React.useRef(dice.length === 0);
    const lastPhysicsSnapshotRef = React.useRef('');
    const [engineVersion, setEngineVersion] = React.useState(0);
    const [engineReady, setEngineReady] = React.useState(false);
    const [settled, setSettled] = React.useState(() => dice.length === 0);
    const [engineFailureMessage, setEngineFailureMessage] = React.useState('');
    const [containerSizeReady, setContainerSizeReady] = React.useState(() => typeof ResizeObserver !== 'function');

    diceLengthRef.current = dice.length;

    React.useEffect(() => {
        onPhysicsStatesChangeRef.current = onPhysicsStatesChange;
    }, [onPhysicsStatesChange]);

    React.useEffect(() => {
        onSettledChangeRef.current = onSettledChange;
    }, [onSettledChange]);

    const failEngine = React.useCallback((error: unknown) => {
        console.warn('[DiceBoxPhysicsSource] dice-box-threejs failed; disabling physics source', error);
        const engine = engineRef.current;
        engineRef.current = null;
        previousDiceIdsRef.current = [];
        activeMotionRef.current = null;
        completedRollMotionKeyRef.current = null;
        completedRerollMotionKeyRef.current = null;
        pendingRerollMotionRef.current = null;
        const nextSettled = diceLengthRef.current === 0;
        settledRef.current = nextSettled;
        lastPhysicsSnapshotRef.current = '';
        setEngineReady(false);
        setSettled(nextSettled);
        setEngineFailureMessage(error instanceof Error ? error.message : String(error));
        onSettledChangeRef.current?.(nextSettled);
        onPhysicsStatesChangeRef.current?.([]);
        try {
            engine?.destroy();
        } catch {
            // Ignore cleanup failures after WebGL errors.
        }
    }, []);

    const values = React.useMemo(() => dice.map((die) => die.value), [dice]);
    const diceHighlightsForEngine = React.useMemo(
        () =>
            highlightedDice
                .map((highlight) => {
                    const dieIndex = dice.findIndex((die) => die.id === highlight.dieId);
                    if (dieIndex < 0) return null;
                    return {
                        ...highlight,
                        dieIndex,
                    };
                })
                .filter((highlight): highlight is DicePhysicsHighlightState => Boolean(highlight)),
        [dice, highlightedDice],
    );
    const valuesKey = React.useMemo(() => values.join(','), [values]);
    const rollingIndices = React.useMemo(
        () => dice
            .map((die, index) => (die.isKept ? -1 : index))
            .filter((index) => index >= 0),
        [dice],
    );
    const lockedIndices = React.useMemo(
        () => dice
            .map((die, index) => (die.isKept ? index : -1))
            .filter((index) => index >= 0),
        [dice],
    );
    const motionType = motion.type;
    const rollMotionId = motion.type === 'roll' ? motion.id : '';
    const rerollMotionId = motion.type === 'reroll' ? motion.id : '';
    const rerollMotionDieIds = React.useMemo(
        () => (motion.type === 'reroll' ? [...motion.dieIds] : []),
        [motion],
    );
    const rerollPreviousValues = React.useMemo(
        () => (motion.type === 'reroll' && motion.previousValues ? [...motion.previousValues] : []),
        [motion],
    );
    const rerollPreviousValuesKey = React.useMemo(
        () => rerollPreviousValues.join(','),
        [rerollPreviousValues],
    );
    const rollingKey = React.useMemo(
        () => `${rollMotionId}|${valuesKey}|${rollingIndices.join(',')}`,
        [rollMotionId, rollingIndices, valuesKey],
    );
    const rerollIds = React.useMemo(
        () => [...rerollMotionDieIds]
            .filter((dieId) => !dice.find((die) => die.id === dieId)?.isKept)
            .sort((left, right) => left - right),
        [dice, rerollMotionDieIds],
    );
    const rerollKey = React.useMemo(() => rerollIds.join(','), [rerollIds]);
    const rerollMotionKey = React.useMemo(
        () => (rerollIds.length > 0 ? `${rerollMotionId}|${rerollKey}|${rerollPreviousValuesKey}|${valuesKey}` : ''),
        [rerollIds.length, rerollKey, rerollMotionId, rerollPreviousValuesKey, valuesKey],
    );
    const requiredDieSkinsReady = React.useMemo(
        () => !requireDieSkins
            || dice.length === 0
            || (Array.isArray(dieSkins)
                && dieSkins.length >= dice.length
                && dieSkins.slice(0, dice.length).every(Boolean)),
        [dice.length, dieSkins, requireDieSkins],
    );

    React.useLayoutEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        if (typeof ResizeObserver !== 'function') {
            setContainerSizeReady(true);
            return;
        }

        let frameId = 0;
        const updateContainerSize = () => {
            const rect = container.getBoundingClientRect();
            const width = container.offsetWidth || container.clientWidth || rect.width;
            const height = container.offsetHeight || container.clientHeight || rect.height;
            setContainerSizeReady(width >= 32 && height >= 32);
        };

        updateContainerSize();
        const observer = new ResizeObserver(updateContainerSize);
        observer.observe(container);
        frameId = window.requestAnimationFrame(updateContainerSize);

        return () => {
            observer.disconnect();
            window.cancelAnimationFrame(frameId);
        };
    }, []);

    const emitPhysicsStates = React.useCallback((engine: DiceBoxThreeEngine, nextSettled: boolean) => {
        const states = dice
            .map((die, index) => engine.getPhysicsState(index, die.id, nextSettled))
            .filter((state): state is DicePhysicsState => Boolean(state));

        const snapshot = states.map((state) => [
            state.id,
            Math.round(state.layout.x),
            Math.round(state.layout.y),
            Math.round(state.layout.width),
            Math.round(state.layout.height),
            state.motion.rotateX.toFixed(2),
            state.motion.rotateY.toFixed(2),
            state.motion.rotateZ.toFixed(2),
            state.settled ? '1' : '0',
        ].join(':')).join('|');

        if (snapshot !== lastPhysicsSnapshotRef.current) {
            lastPhysicsSnapshotRef.current = snapshot;
            onPhysicsStatesChangeRef.current?.(states);
        }
    }, [dice]);

    const restoreVisibleSettledDice = React.useCallback(async (
        engine: DiceBoxThreeEngine,
        nextValues: number[],
    ) => {
        if (nextValues.length === 0) return;
        await engine.restoreValues(nextValues);
        emitPhysicsStates(engine, true);
    }, [emitPhysicsStates]);

    const restoreRerollStartValues = React.useCallback(async (
        engine: DiceBoxThreeEngine,
        startValues: number[],
        targetValues: number[],
    ) => {
        const valuesToRestore = startValues.length === targetValues.length ? startValues : targetValues;
        if (valuesToRestore.length === 0) return;
        if (engine.hasDice(valuesToRestore.length)) {
            engine.syncSettledValues(valuesToRestore);
            emitPhysicsStates(engine, true);
            return;
        }
        await restoreVisibleSettledDice(engine, valuesToRestore);
    }, [emitPhysicsStates, restoreVisibleSettledDice]);

    const finalizeVisibleSettledDice = React.useCallback((
        engine: DiceBoxThreeEngine,
    ) => {
        emitPhysicsStates(engine, true);
    }, [emitPhysicsStates]);

    const setSettledState = React.useCallback((nextSettled: boolean) => {
        const previousSettled = settledRef.current;
        settledRef.current = nextSettled;
        const container = containerRef.current;
        if (container) {
            container.dataset.diceSettled = nextSettled ? 'true' : 'false';
            container.dataset.diceVisualSettled = nextSettled ? 'true' : 'false';
        }
        engineRef.current?.setCanvasDiagnostics({
            settled: nextSettled,
        });
        setSettled(nextSettled);
        if (previousSettled !== nextSettled) {
            onSettledChangeRef.current?.(nextSettled);
        }
    }, []);

    React.useEffect(() => {
        let cancelled = false;

        const init = async () => {
            const container = containerRef.current;
            if (!container || engineRef.current || !containerSizeReady) return;
            try {
                const engine = await DiceBoxThreeEngine.create(container, {
                    styleProfile,
                    rendererMode,
                    canvasTestId,
                });
                if (cancelled) {
                    engine.destroy();
                    return;
                }
                engineRef.current = engine;
                setEngineFailureMessage('');
                engine.resize();
                engine.setCanvasDiagnostics({
                    settled: settledRef.current,
                    skinsReady: !requireDieSkins || diceLengthRef.current === 0,
                });
                setEngineReady(true);
                setEngineVersion((count) => count + 1);
            } catch (error) {
                if (cancelled) return;
                failEngine(error);
            }
        };

        void init();

        return () => {
            cancelled = true;
            activeMotionRef.current = null;
            engineRef.current?.destroy();
            engineRef.current = null;
        };
    }, [canvasTestId, containerSizeReady, failEngine, rendererMode, requireDieSkins, styleProfile]);

    React.useEffect(() => {
        const engine = engineRef.current;
        if (!engine) return;
        if (dieSkins) {
            engine.setDieSkins(dieSkins);
            engine.setCanvasDiagnostics({
                settled: settledRef.current,
                skinsReady: requiredDieSkinsReady,
            });
        }
    }, [dieSkins, engineVersion, requiredDieSkinsReady]);

    React.useEffect(() => {
        const engine = engineRef.current;
        if (!engine) return;
        engine.setDiceHighlights(diceHighlightsForEngine);
    }, [diceHighlightsForEngine, engineVersion]);

    React.useEffect(() => {
        const engine = engineRef.current;
        if (!engine) return;

        let frameId = 0;
        let lastEmitAt = 0;
        const tick = () => {
            const now = performance.now();
            const minIntervalMs = settledRef.current ? 120 : 33;
            if (now - lastEmitAt < minIntervalMs) {
                frameId = window.requestAnimationFrame(tick);
                return;
            }
            lastEmitAt = now;
            try {
                emitPhysicsStates(engine, settledRef.current);
            } catch (error) {
                failEngine(error);
                return;
            }
            frameId = window.requestAnimationFrame(tick);
        };

        frameId = window.requestAnimationFrame(tick);

        let observer: ResizeObserver | null = null;
        if (typeof ResizeObserver === 'function' && containerRef.current) {
            observer = new ResizeObserver(() => engine.resize());
            observer.observe(containerRef.current);
        }

        return () => {
            window.cancelAnimationFrame(frameId);
            observer?.disconnect();
        };
    }, [dice, emitPhysicsStates, engineVersion, failEngine]);

    React.useEffect(() => {
        const engine = engineRef.current;
        if (!engineReady || !engine) return;
        if (!requiredDieSkinsReady) {
            engine.setCanvasDiagnostics({
                settled: true,
                skinsReady: false,
            });
            return;
        }

        const run = async () => {
            if (dice.length === 0) {
                if (previousDiceIdsRef.current.length > 0) {
                    await engine.removeDice(previousDiceIdsRef.current.map((_, index) => index).reverse());
                    previousDiceIdsRef.current = [];
                } else {
                    engine.clear();
                }
                completedRollMotionKeyRef.current = null;
                completedRerollMotionKeyRef.current = null;
                setSettledState(true);
                return;
            }

            if (motionType === 'roll') {
                if (completedRollMotionKeyRef.current === rollingKey && engine.hasDice(dice.length)) {
                    engine.syncSettledValues(values);
                    previousDiceIdsRef.current = dice.map((die) => die.id);
                    setSettledState(true);
                    return;
                }
                if (engine.hasDice(dice.length) && rollingIndices.length === 0) {
                    engine.syncSettledValues(values);
                    previousDiceIdsRef.current = dice.map((die) => die.id);
                    setSettledState(true);
                    return;
                }
                if (!engine.hasDice(dice.length) && values.length > 0) {
                    await restoreVisibleSettledDice(engine, values);
                    previousDiceIdsRef.current = dice.map((die) => die.id);
                }
                setSettledState(false);
                if (activeMotionRef.current?.type !== 'roll' || activeMotionRef.current.key !== rollingKey) {
                    activeMotionRef.current = { type: 'roll', key: rollingKey };
                    try {
                        if (engine.hasDice(dice.length)) {
                            await engine.rerollToValues(rollingIndices, values, lockedIndices);
                        } else {
                            await engine.rollToValues(values);
                        }
                    } finally {
                        finalizeVisibleSettledDice(engine);
                        if (activeMotionRef.current?.type === 'roll' && activeMotionRef.current.key === rollingKey) {
                            activeMotionRef.current = null;
                        }
                        completedRollMotionKeyRef.current = rollingKey;
                        completedRerollMotionKeyRef.current = null;
                        previousDiceIdsRef.current = dice.map((die) => die.id);
                        setSettledState(true);
                    }
                    return;
                }
                engine.previewValues(values);
                return;
            }

            const playRerollMotion = async (
                key: string,
                rerollIndices: number[],
                startValues: number[],
                targetValues: number[],
                targetLockedIndices: number[],
            ) => {
                activeMotionRef.current = { type: 'reroll', key };
                try {
                    await restoreRerollStartValues(engine, startValues, targetValues);
                    previousDiceIdsRef.current = dice.map((die) => die.id);
                    setSettledState(false);
                    await engine.rerollToValues(rerollIndices, targetValues, targetLockedIndices);
                } finally {
                    finalizeVisibleSettledDice(engine);
                    if (activeMotionRef.current?.type === 'reroll' && activeMotionRef.current.key === key) {
                        activeMotionRef.current = null;
                    }
                    completedRerollMotionKeyRef.current = key;
                    previousDiceIdsRef.current = dice.map((die) => die.id);
                    setSettledState(true);
                    const pending = pendingRerollMotionRef.current;
                    if (pending) {
                        pendingRerollMotionRef.current = null;
                        setSettledState(false);
                        await playRerollMotion(pending.key, pending.indices, pending.previousValues, pending.values, pending.lockedIndices);
                    }
                }
            };

            if (motionType === 'reroll' && rerollIds.length > 0) {
                const rerollIndices = rerollIds
                    .map((dieId) => dice.findIndex((die) => die.id === dieId))
                    .filter((index) => index >= 0);
                if (rerollIndices.length > 0) {
                    if (completedRerollMotionKeyRef.current === rerollMotionKey && engine.hasDice(dice.length)) {
                        engine.syncSettledValues(values);
                        previousDiceIdsRef.current = dice.map((die) => die.id);
                        setSettledState(true);
                        return;
                    }
                    setSettledState(false);
                    if (activeMotionRef.current?.type === 'reroll') {
                        if (activeMotionRef.current.key !== rerollMotionKey) {
                            pendingRerollMotionRef.current = {
                                key: rerollMotionKey,
                                indices: rerollIndices,
                                previousValues: [...rerollPreviousValues],
                                values: [...values],
                                lockedIndices: [...lockedIndices],
                            };
                        }
                    } else {
                        await playRerollMotion(rerollMotionKey, rerollIndices, rerollPreviousValues, values, lockedIndices);
                    }
                    return;
                }
            }

            if (activeMotionRef.current) return;

            if (!engine.hasDice(dice.length)) {
                const previousIds = previousDiceIdsRef.current;
                const removedIndices = previousIds
                    .map((dieId, index) => (dice.some((die) => die.id === dieId) ? -1 : index))
                    .filter((index) => index >= 0)
                    .sort((left, right) => right - left);
                if (previousIds.length > dice.length && removedIndices.length === previousIds.length - dice.length) {
                    setSettledState(false);
                    await engine.removeDice(removedIndices);
                    engine.syncValues(values);
                    previousDiceIdsRef.current = dice.map((die) => die.id);
                    setSettledState(true);
                    return;
                }

                setSettledState(true);
                await restoreVisibleSettledDice(engine, values);
                previousDiceIdsRef.current = dice.map((die) => die.id);
                setSettledState(true);
                return;
            }

            engine.syncSettledValues(values);
            emitPhysicsStates(engine, true);
            previousDiceIdsRef.current = dice.map((die) => die.id);
            setSettledState(true);
        };

        void run().catch((error) => {
            failEngine(error);
        });
    }, [dice, emitPhysicsStates, engineReady, failEngine, finalizeVisibleSettledDice, lockedIndices, motionType, rerollIds, rerollMotionKey, rerollPreviousValues, requiredDieSkinsReady, restoreRerollStartValues, restoreVisibleSettledDice, rollingIndices, rollingKey, setSettledState, values]);

    return (
        <div
            ref={containerRef}
            className={className}
            style={style}
            data-testid={testId}
            data-dice-physics-source="dice-box-threejs"
            data-dice-physics-mode={rendererMode}
            data-dice-settled={settled ? 'true' : 'false'}
            data-dice-engine-ready={engineReady ? 'true' : 'false'}
            data-dice-engine-failure={engineFailureMessage || undefined}
            data-dice-skins-ready={requiredDieSkinsReady ? 'true' : 'false'}
            data-dice-highlight-renderer={diceHighlightsForEngine.length > 0 ? DICE_PHYSICS_HIGHLIGHT_RENDERER : 'none'}
            data-dice-highlight-count={diceHighlightsForEngine.length}
            data-dice-highlight-candidate-count={
                diceHighlightsForEngine.filter((highlight) => highlight.variant === 'candidate').length
            }
            data-dice-highlight-selected-count={
                diceHighlightsForEngine.filter((highlight) => highlight.variant === 'selected').length
            }
            data-dice-container-size-ready={containerSizeReady ? 'true' : 'false'}
            data-dice-motion-type={motion.type}
            data-dice-motion-id={motion.type === 'settled' ? undefined : motion.id}
            {...dataAttributes}
        />
    );
}
