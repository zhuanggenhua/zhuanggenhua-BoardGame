import React, {
    forwardRef,
    useCallback,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from 'react';

const DRAG_THRESHOLD = 5;
const SCALE_EPSILON = 0.02;
const SCALE_BADGE_HIDE_DELAY_MS = 1200;

interface TouchPoint {
    clientX: number;
    clientY: number;
}

interface ElementSize {
    width: number;
    height: number;
}

export interface ZoomPanViewportFitInsets {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
}

export interface ZoomPanViewportPosition {
    x: number;
    y: number;
}

export interface ZoomPanViewportState {
    zoomLevel: number;
    position: ZoomPanViewportPosition;
}

export interface ZoomPanViewportZoomAnchorArgs {
    position: ZoomPanViewportPosition;
    zoomLevel: number;
    nextZoomLevel: number;
    pointer: TouchPoint;
    containerRect: DOMRect;
    coordinateSize?: ElementSize;
}

type ZoomPanViewportContainerProps = React.HTMLAttributes<HTMLDivElement> & {
    [key: `data-${string}`]: string | number | boolean | undefined;
};

const getTouchDistance = (touchA: TouchPoint, touchB: TouchPoint) => {
    const dx = touchA.clientX - touchB.clientX;
    const dy = touchA.clientY - touchB.clientY;
    return Math.sqrt(dx * dx + dy * dy);
};

const getTouchCenter = (touchA: TouchPoint, touchB: TouchPoint): TouchPoint => ({
    clientX: (touchA.clientX + touchB.clientX) / 2,
    clientY: (touchA.clientY + touchB.clientY) / 2,
});

const measureElementSize = (element: HTMLElement | null): ElementSize => {
    if (!element) {
        return { width: 0, height: 0 };
    }

    const width = element.offsetWidth || element.clientWidth || element.getBoundingClientRect().width || 0;
    const height = element.offsetHeight || element.clientHeight || element.getBoundingClientRect().height || 0;

    return { width, height };
};

const updateSizeState = (
    setSize: React.Dispatch<React.SetStateAction<ElementSize>>,
    nextSize: ElementSize,
) => {
    setSize((currentSize) => (
        currentSize.width === nextSize.width && currentSize.height === nextSize.height
            ? currentSize
            : nextSize
    ));
};

export interface ZoomPanViewportProps {
    children: ReactNode;
    initialScale?: number;
    minScale?: number;
    maxScale?: number;
    baseScaleMode?: 'contain' | 'cover';
    fitInsets?: ZoomPanViewportFitInsets;
    dragBoundsPaddingRatioY?: number;
    panBoundsMode?: 'content' | 'free';
    interactionDisabled?: boolean;
    panToTarget?: string | null;
    panToScale?: number;
    controlledViewport?: ZoomPanViewportState;
    onControlledViewportChange?: (viewport: ZoomPanViewportState) => void;
    onUserViewportChange?: () => void;
    coordinateSize?: ElementSize;
    clampViewport?: (viewport: ZoomPanViewportState) => ZoomPanViewportState;
    getZoomAnchorPosition?: (args: ZoomPanViewportZoomAnchorArgs) => ZoomPanViewportPosition;
    wheelZoomFactor?: number;
    renderContentTransform?: boolean;
    containerProps?: ZoomPanViewportContainerProps;
    containerTestId?: string;
    contentTestId?: string;
    scaleTestId?: string;
    className?: string;
    style?: React.CSSProperties;
    contentClassName?: string;
    contentStyle?: React.CSSProperties;
    scaleBadgeClassName?: string;
    scaleBadgeStyle?: React.CSSProperties;
    scaleBadgeVisibility?: 'while-zoomed' | 'interaction';
    formatScaleBadge?: (zoomLevel: number) => ReactNode;
    scaleBadgeAddon?: ReactNode;
    ariaLabel?: string;
}

export const ZoomPanViewport = forwardRef<HTMLDivElement, ZoomPanViewportProps>(({
    children,
    initialScale = 0.6,
    minScale = 0.5,
    maxScale = 3,
    baseScaleMode = 'contain',
    fitInsets,
    dragBoundsPaddingRatioY = 0,
    panBoundsMode = 'content',
    interactionDisabled = false,
    panToTarget,
    panToScale,
    controlledViewport,
    onControlledViewportChange,
    onUserViewportChange,
    coordinateSize,
    clampViewport,
    getZoomAnchorPosition,
    wheelZoomFactor,
    renderContentTransform = true,
    containerProps,
    containerTestId,
    contentTestId,
    scaleTestId,
    className = '',
    style,
    contentClassName = '',
    contentStyle,
    scaleBadgeClassName = '',
    scaleBadgeStyle,
    scaleBadgeVisibility = 'while-zoomed',
    formatScaleBadge,
    scaleBadgeAddon,
    ariaLabel,
}, forwardedRef) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    const pointerStartRef = useRef({ x: 0, y: 0 });
    const positionStartRef = useRef({ x: 0, y: 0 });
    const isPointerDownRef = useRef(false);
    const pinchStartDistanceRef = useRef<number | null>(null);
    const pinchStartZoomRef = useRef<number | null>(null);
    const scaleBadgeTimerRef = useRef<number | null>(null);
    const animationTimerRef = useRef<number | null>(null);
    const suppressNextClickRef = useRef(false);
    const suppressClickResetTimerRef = useRef<number | null>(null);
    const handledPanInstructionRef = useRef<string | null>(null);
    const [settledPanInstructionKey, setSettledPanInstructionKey] = useState<string | null>(null);

    const [zoomLevel, setZoomLevel] = useState(initialScale);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    const [contentSize, setContentSize] = useState({ width: 0, height: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);
    const [isScaleBadgeVisible, setIsScaleBadgeVisible] = useState(false);

    const isControlled = controlledViewport != null && onControlledViewportChange != null;
    const activeZoomLevel = controlledViewport?.zoomLevel ?? zoomLevel;
    const activePosition = controlledViewport?.position ?? position;
    const fitInsetTop = Math.max(0, fitInsets?.top ?? 0);
    const fitInsetRight = Math.max(0, fitInsets?.right ?? 0);
    const fitInsetBottom = Math.max(0, fitInsets?.bottom ?? 0);
    const fitInsetLeft = Math.max(0, fitInsets?.left ?? 0);
    const fitAvailableWidth = Math.max(1, containerSize.width - fitInsetLeft - fitInsetRight);
    const fitAvailableHeight = Math.max(1, containerSize.height - fitInsetTop - fitInsetBottom);
    const fitCenterOffset = {
        x: (fitInsetLeft - fitInsetRight) / 2,
        y: (fitInsetTop - fitInsetBottom) / 2,
    };

    const setContainerNode = useCallback((node: HTMLDivElement | null) => {
        containerRef.current = node;
        if (typeof forwardedRef === 'function') {
            forwardedRef(node);
            return;
        }
        if (forwardedRef) {
            forwardedRef.current = node;
        }
    }, [forwardedRef]);

    const syncContainerSize = useCallback(() => {
        updateSizeState(setContainerSize, measureElementSize(containerRef.current));
    }, []);

    const syncContentSize = useCallback(() => {
        updateSizeState(setContentSize, measureElementSize(contentRef.current));
    }, []);

    const baseScale = containerSize.width > 0
        && containerSize.height > 0
        && contentSize.width > 0
        && contentSize.height > 0
        ? baseScaleMode === 'cover'
            ? Math.max(
                fitAvailableWidth / contentSize.width,
                fitAvailableHeight / contentSize.height,
            )
            : Math.min(
                1,
                Math.min(
                    fitAvailableWidth / contentSize.width,
                    fitAvailableHeight / contentSize.height,
                ),
            )
        : 1;
    const scale = baseScale * activeZoomLevel;
    const isAtDefaultZoom = Math.abs(activeZoomLevel - initialScale) <= SCALE_EPSILON;
    const shouldShowScaleBadge = scaleBadgeVisibility === 'interaction'
        ? isScaleBadgeVisible
        : isScaleBadgeVisible || !isAtDefaultZoom || scaleBadgeAddon != null;
    const panInstructionKey = panToTarget ? `${panToTarget}:${panToScale ?? 'current'}` : null;
    const panTargetState = panToTarget
        ? settledPanInstructionKey === panInstructionKey && !isAnimating
            ? 'settled'
            : 'panning'
        : undefined;

    const clearScaleBadgeTimer = useCallback(() => {
        if (scaleBadgeTimerRef.current !== null) {
            window.clearTimeout(scaleBadgeTimerRef.current);
            scaleBadgeTimerRef.current = null;
        }
    }, []);

    const clearAnimationTimer = useCallback(() => {
        if (animationTimerRef.current !== null) {
            window.clearTimeout(animationTimerRef.current);
            animationTimerRef.current = null;
        }
    }, []);

    const clearSuppressClickResetTimer = useCallback(() => {
        if (suppressClickResetTimerRef.current !== null) {
            window.clearTimeout(suppressClickResetTimerRef.current);
            suppressClickResetTimerRef.current = null;
        }
    }, []);

    const armSuppressNextClickReset = useCallback(() => {
        if (!suppressNextClickRef.current) return;
        clearSuppressClickResetTimer();
        suppressClickResetTimerRef.current = window.setTimeout(() => {
            suppressNextClickRef.current = false;
            suppressClickResetTimerRef.current = null;
        }, 180);
    }, [clearSuppressClickResetTimer]);

    const clampZoomLevel = useCallback((nextZoomLevel: number) => (
        Math.max(minScale, Math.min(maxScale, nextZoomLevel))
    ), [maxScale, minScale]);

    const revealScaleBadge = useCallback((nextZoomLevel: number) => {
        clearScaleBadgeTimer();
        setIsScaleBadgeVisible(true);
        if (
            scaleBadgeVisibility === 'interaction'
            || Math.abs(nextZoomLevel - initialScale) <= SCALE_EPSILON
        ) {
            scaleBadgeTimerRef.current = window.setTimeout(() => {
                setIsScaleBadgeVisible(false);
                scaleBadgeTimerRef.current = null;
            }, SCALE_BADGE_HIDE_DELAY_MS);
        }
    }, [clearScaleBadgeTimer, initialScale, scaleBadgeVisibility]);

    const hideScaleBadge = useCallback(() => {
        clearScaleBadgeTimer();
        setIsScaleBadgeVisible(false);
    }, [clearScaleBadgeTimer]);

    const markUserViewportChanged = useCallback(() => {
        onUserViewportChange?.();
    }, [onUserViewportChange]);

    useEffect(() => {
        return () => {
            clearScaleBadgeTimer();
            clearAnimationTimer();
            clearSuppressClickResetTimer();
        };
    }, [clearAnimationTimer, clearScaleBadgeTimer, clearSuppressClickResetTimer]);

    const clampPosition = useCallback((x: number, y: number, nextScale = scale) => {
        if (panBoundsMode === 'free') {
            return { x, y };
        }
        if (!containerSize.width || !containerSize.height || !contentSize.width || !contentSize.height) {
            return { x, y };
        }

        const scaledWidth = contentSize.width * nextScale;
        const scaledHeight = contentSize.height * nextScale;
        const maxOffsetX = Math.max(0, (scaledWidth - fitAvailableWidth) / 2);
        const extraPaddingY = fitAvailableHeight * dragBoundsPaddingRatioY;
        const maxOffsetY = Math.max(0, (scaledHeight - fitAvailableHeight) / 2 + extraPaddingY);

        return {
            x: fitCenterOffset.x + Math.min(maxOffsetX, Math.max(-maxOffsetX, x - fitCenterOffset.x)),
            y: fitCenterOffset.y + Math.min(maxOffsetY, Math.max(-maxOffsetY, y - fitCenterOffset.y)),
        };
    }, [containerSize.height, containerSize.width, contentSize.height, contentSize.width, dragBoundsPaddingRatioY, fitAvailableHeight, fitAvailableWidth, fitCenterOffset.x, fitCenterOffset.y, panBoundsMode, scale]);

    const clampViewportState = useCallback((nextViewport: ZoomPanViewportState): ZoomPanViewportState => {
        const nextZoomLevel = clampZoomLevel(nextViewport.zoomLevel);
        const rawViewport = {
            zoomLevel: nextZoomLevel,
            position: nextViewport.position,
        };
        if (clampViewport) {
            return clampViewport(rawViewport);
        }
        return {
            zoomLevel: nextZoomLevel,
            position: clampPosition(
                rawViewport.position.x,
                rawViewport.position.y,
                baseScale * nextZoomLevel,
            ),
        };
    }, [baseScale, clampPosition, clampViewport, clampZoomLevel]);

    const applyViewport = useCallback((nextViewport: ZoomPanViewportState) => {
        const clampedViewport = clampViewportState(nextViewport);
        if (isControlled) {
            onControlledViewportChange?.(clampedViewport);
            return clampedViewport;
        }
        setZoomLevel(clampedViewport.zoomLevel);
        setPosition(clampedViewport.position);
        return clampedViewport;
    }, [clampViewportState, isControlled, onControlledViewportChange]);

    const clampedPosition = clampViewport ? activePosition : clampPosition(activePosition.x, activePosition.y, scale);

    const convertDeltaToViewportUnits = useCallback((deltaX: number, deltaY: number) => {
        if (!coordinateSize) {
            return { x: deltaX, y: deltaY };
        }
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) {
            return { x: deltaX, y: deltaY };
        }
        return {
            x: (deltaX / rect.width) * coordinateSize.width,
            y: (deltaY / rect.height) * coordinateSize.height,
        };
    }, [coordinateSize]);

    const resolveZoomPosition = useCallback((nextZoomLevel: number, pointer?: TouchPoint) => {
        if (!pointer || !getZoomAnchorPosition) {
            return clampedPosition;
        }
        const containerRect = containerRef.current?.getBoundingClientRect();
        if (!containerRect || containerRect.width <= 0 || containerRect.height <= 0) {
            return clampedPosition;
        }
        return getZoomAnchorPosition({
            position: clampedPosition,
            zoomLevel: activeZoomLevel,
            nextZoomLevel,
            pointer,
            containerRect,
            coordinateSize,
        });
    }, [activeZoomLevel, clampedPosition, coordinateSize, getZoomAnchorPosition]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return undefined;

        syncContainerSize();

        let observer: ResizeObserver | null = null;
        if (typeof ResizeObserver === 'function') {
            observer = new ResizeObserver((entries) => {
                const entry = entries[0];
                if (!entry) return;
                updateSizeState(setContainerSize, {
                    width: entry.contentRect.width,
                    height: entry.contentRect.height,
                });
            });
            observer.observe(container);
        }

        window.addEventListener('resize', syncContainerSize);
        window.addEventListener('orientationchange', syncContainerSize);

        return () => {
            observer?.disconnect();
            window.removeEventListener('resize', syncContainerSize);
            window.removeEventListener('orientationchange', syncContainerSize);
        };
    }, [syncContainerSize]);

    useEffect(() => {
        const content = contentRef.current;
        if (!content) return undefined;

        syncContentSize();

        let observer: ResizeObserver | null = null;
        if (typeof ResizeObserver === 'function') {
            observer = new ResizeObserver((entries) => {
                const entry = entries[0];
                if (!entry) return;
                updateSizeState(setContentSize, {
                    width: entry.contentRect.width,
                    height: entry.contentRect.height,
                });
            });
            observer.observe(content);
        }

        const images = Array.from(content.querySelectorAll('img'));
        images.forEach((image) => {
            image.addEventListener('load', syncContentSize);
            image.addEventListener('error', syncContentSize);
        });

        const frameId = window.requestAnimationFrame(syncContentSize);
        window.addEventListener('resize', syncContentSize);
        window.addEventListener('orientationchange', syncContentSize);

        return () => {
            observer?.disconnect();
            window.cancelAnimationFrame(frameId);
            window.removeEventListener('resize', syncContentSize);
            window.removeEventListener('orientationchange', syncContentSize);
            images.forEach((image) => {
                image.removeEventListener('load', syncContentSize);
                image.removeEventListener('error', syncContentSize);
            });
        };
    }, [syncContentSize]);

    const handleMouseDown = useCallback((event: React.MouseEvent) => {
        if (event.button !== 0 || interactionDisabled) return;

        isPointerDownRef.current = true;
        pointerStartRef.current = { x: event.clientX, y: event.clientY };
        positionStartRef.current = { x: clampedPosition.x, y: clampedPosition.y };
    }, [clampedPosition.x, clampedPosition.y, interactionDisabled]);

    const handleTouchStart = useCallback((event: React.TouchEvent) => {
        if (interactionDisabled) return;

        if (event.touches.length === 1) {
            const touch = event.touches[0];
            isPointerDownRef.current = true;
            pinchStartDistanceRef.current = null;
            pinchStartZoomRef.current = null;
            pointerStartRef.current = { x: touch.clientX, y: touch.clientY };
            positionStartRef.current = { x: clampedPosition.x, y: clampedPosition.y };
            return;
        }

        if (event.touches.length === 2) {
            isPointerDownRef.current = false;
            setIsDragging(false);
            pinchStartDistanceRef.current = getTouchDistance(event.touches[0], event.touches[1]);
            pinchStartZoomRef.current = activeZoomLevel;
        }
    }, [activeZoomLevel, clampedPosition.x, clampedPosition.y, interactionDisabled]);

    const handleTouchMove = useCallback((event: React.TouchEvent) => {
        if (interactionDisabled) return;

        if (event.touches.length === 2) {
            const startDistance = pinchStartDistanceRef.current;
            const startZoomLevel = pinchStartZoomRef.current;
            if (!startDistance || !startZoomLevel) return;

            event.preventDefault();
            clearAnimationTimer();
            setIsAnimating(false);

            const distance = getTouchDistance(event.touches[0], event.touches[1]);
            const nextZoomLevel = clampZoomLevel(startZoomLevel * (distance / startDistance));
            const nextPosition = resolveZoomPosition(nextZoomLevel, getTouchCenter(event.touches[0], event.touches[1]));
            revealScaleBadge(nextZoomLevel);
            markUserViewportChanged();
            applyViewport({
                zoomLevel: nextZoomLevel,
                position: nextPosition,
            });
            return;
        }

        if (event.touches.length !== 1 || !isPointerDownRef.current) return;

        const touch = event.touches[0];
        const dx = touch.clientX - pointerStartRef.current.x;
        const dy = touch.clientY - pointerStartRef.current.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= DRAG_THRESHOLD) return;

        event.preventDefault();
        clearAnimationTimer();
        suppressNextClickRef.current = true;
        setIsDragging(true);
        setIsAnimating(false);

        const viewportDelta = convertDeltaToViewportUnits(dx, dy);
        markUserViewportChanged();
        applyViewport({
            zoomLevel: activeZoomLevel,
            position: {
                x: positionStartRef.current.x + viewportDelta.x,
                y: positionStartRef.current.y + viewportDelta.y,
            },
        });
    }, [
        activeZoomLevel,
        applyViewport,
        clampZoomLevel,
        clearAnimationTimer,
        convertDeltaToViewportUnits,
        interactionDisabled,
        markUserViewportChanged,
        resolveZoomPosition,
        revealScaleBadge,
    ]);

    const handleTouchEnd = useCallback((event: React.TouchEvent) => {
        if (event.touches.length >= 2) return;

        if (event.touches.length === 1) {
            const touch = event.touches[0];
            isPointerDownRef.current = true;
            pointerStartRef.current = { x: touch.clientX, y: touch.clientY };
            positionStartRef.current = { ...clampedPosition };
            pinchStartDistanceRef.current = null;
            pinchStartZoomRef.current = null;
            return;
        }

        isPointerDownRef.current = false;
        pinchStartDistanceRef.current = null;
        pinchStartZoomRef.current = null;
        armSuppressNextClickReset();
        setIsDragging(false);
    }, [armSuppressNextClickReset, clampedPosition]);

    useEffect(() => {
        const handleGlobalMouseMove = (event: MouseEvent) => {
            if (!isPointerDownRef.current) return;

            const dx = event.clientX - pointerStartRef.current.x;
            const dy = event.clientY - pointerStartRef.current.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance <= DRAG_THRESHOLD) return;

            clearAnimationTimer();
            suppressNextClickRef.current = true;
            setIsDragging(true);
            setIsAnimating(false);

            const viewportDelta = convertDeltaToViewportUnits(dx, dy);
            markUserViewportChanged();
            applyViewport({
                zoomLevel: activeZoomLevel,
                position: {
                    x: positionStartRef.current.x + viewportDelta.x,
                    y: positionStartRef.current.y + viewportDelta.y,
                },
            });
        };

        const handleGlobalMouseUp = () => {
            isPointerDownRef.current = false;
            armSuppressNextClickReset();
            setIsDragging(false);
        };

        window.addEventListener('mousemove', handleGlobalMouseMove);
        window.addEventListener('mouseup', handleGlobalMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleGlobalMouseMove);
            window.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, [activeZoomLevel, applyViewport, armSuppressNextClickReset, clearAnimationTimer, convertDeltaToViewportUnits, markUserViewportChanged]);

    const handleWheel = useCallback((event: WheelEvent) => {
        if (interactionDisabled) return;

        event.preventDefault();
        clearAnimationTimer();
        setIsAnimating(false);

        const nextZoomLevel = clampZoomLevel(
            wheelZoomFactor
                ? activeZoomLevel * (event.deltaY < 0 ? wheelZoomFactor : 1 / wheelZoomFactor)
                : activeZoomLevel + (event.deltaY > 0 ? -0.1 : 0.1),
        );
        if (Math.abs(nextZoomLevel - activeZoomLevel) < 0.001) return;

        const nextPosition = resolveZoomPosition(nextZoomLevel, {
            clientX: event.clientX,
            clientY: event.clientY,
        });
        revealScaleBadge(nextZoomLevel);
        markUserViewportChanged();
        applyViewport({
            zoomLevel: nextZoomLevel,
            position: nextPosition,
        });
    }, [
        activeZoomLevel,
        applyViewport,
        clampZoomLevel,
        clearAnimationTimer,
        interactionDisabled,
        markUserViewportChanged,
        resolveZoomPosition,
        revealScaleBadge,
        wheelZoomFactor,
    ]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return undefined;

        container.addEventListener('wheel', handleWheel, { passive: false });
        return () => container.removeEventListener('wheel', handleWheel);
    }, [handleWheel]);

    useEffect(() => {
        if (!interactionDisabled || panToTarget) return undefined;
        let frameId: number | null = window.requestAnimationFrame(() => {
            clearAnimationTimer();
            hideScaleBadge();
            setIsAnimating(true);
            applyViewport({
                zoomLevel: initialScale,
                position: { x: 0, y: 0 },
            });
            animationTimerRef.current = window.setTimeout(() => {
                setIsAnimating(false);
                animationTimerRef.current = null;
            }, 400);
            frameId = null;
        });

        return () => {
            if (frameId !== null) {
                window.cancelAnimationFrame(frameId);
            }
            clearAnimationTimer();
        };
    }, [applyViewport, clearAnimationTimer, hideScaleBadge, initialScale, interactionDisabled, panToTarget]);

    useEffect(() => {
        if (!panToTarget) {
            handledPanInstructionRef.current = null;
            return undefined;
        }
        if (!contentRef.current || !containerRef.current) return undefined;
        if (!containerSize.width || !containerSize.height || !contentSize.width || !contentSize.height) return undefined;

        if (handledPanInstructionRef.current === panInstructionKey) return undefined;

        const rafId = requestAnimationFrame(() => {
            const contentEl = contentRef.current;
            const containerEl = containerRef.current;
            const targetEl = contentEl?.querySelector(
                `[data-zoom-pan-target="${panToTarget}"], [data-tutorial-id="${panToTarget}"]`,
            ) as HTMLElement | null;
            if (!contentEl || !containerEl || !targetEl) return;

            const contentWidth = contentEl.offsetWidth;
            const contentHeight = contentEl.offsetHeight;
            if (!contentWidth || !contentHeight) return;

            const currentZoomLevel = activeZoomLevel;
            const targetZoomLevel = panToScale != null
                ? clampZoomLevel(panToScale)
                : currentZoomLevel;
            const targetScale = baseScale * targetZoomLevel;

            containerEl.scrollTop = 0;
            containerEl.scrollLeft = 0;

            const savedTransform = contentEl.style.transform;
            const savedTransition = contentEl.style.transition;
            contentEl.style.transition = 'none';
            contentEl.style.transform = 'translate(0px, 0px) scale(1)';
            contentEl.getBoundingClientRect();

            const contentRect = contentEl.getBoundingClientRect();
            const containerRect = containerEl.getBoundingClientRect();
            const elementRect = targetEl.getBoundingClientRect();
            const targetCenterX = (elementRect.left + elementRect.right) / 2 - contentRect.left;
            const targetCenterY = (elementRect.top + elementRect.bottom) / 2 - contentRect.top;
            const contentOffsetX = contentRect.left - containerRect.left;
            const contentOffsetY = contentRect.top - containerRect.top;

            contentEl.style.transform = savedTransform;
            contentEl.getBoundingClientRect();
            contentEl.style.transition = savedTransition;

            const contentCenterX = contentWidth / 2;
            const contentCenterY = contentHeight / 2;
            const viewportCenterX = containerSize.width / 2;
            const viewportCenterY = containerSize.height / 2;
            const targetTx =
                viewportCenterX -
                (contentOffsetX +
                    contentCenterX +
                    (targetCenterX - contentCenterX) * targetScale);
            const targetTy =
                viewportCenterY -
                (contentOffsetY +
                    contentCenterY +
                    (targetCenterY - contentCenterY) * targetScale);
            const targetPosition = panBoundsMode === 'free'
                ? {
                    x: targetTx - fitCenterOffset.x,
                    y: targetTy - fitCenterOffset.y,
                }
                : {
                    x: targetTx,
                    y: targetTy,
                };
            const nextViewport = clampViewportState({
                zoomLevel: targetZoomLevel,
                position: targetPosition,
            });

            clearAnimationTimer();
            setIsAnimating(true);
            if (targetZoomLevel !== currentZoomLevel) {
                revealScaleBadge(nextViewport.zoomLevel);
            }
            handledPanInstructionRef.current = panInstructionKey;
            applyViewport(nextViewport);
            animationTimerRef.current = window.setTimeout(() => {
                setIsAnimating(false);
                setSettledPanInstructionKey(panInstructionKey);
                animationTimerRef.current = null;
            }, 400);
        });

        return () => cancelAnimationFrame(rafId);
    }, [
        activeZoomLevel,
        applyViewport,
        baseScale,
        clampViewportState,
        clampZoomLevel,
        clearAnimationTimer,
        containerSize.height,
        containerSize.width,
        contentSize.height,
        contentSize.width,
        fitCenterOffset.x,
        fitCenterOffset.y,
        panBoundsMode,
        panInstructionKey,
        panToScale,
        panToTarget,
        revealScaleBadge,
    ]);

    const contentRenderPosition = panBoundsMode === 'free'
        ? {
            x: clampedPosition.x + fitCenterOffset.x,
            y: clampedPosition.y + fitCenterOffset.y,
        }
        : clampedPosition;

    const contentTransformStyle: React.CSSProperties = renderContentTransform
        ? {
            transform: `translate(${contentRenderPosition.x}px, ${contentRenderPosition.y}px) scale(${scale})`,
            transition: isDragging ? 'none' : isAnimating ? 'transform 350ms ease-out' : 'transform 75ms',
            willChange: isDragging || isAnimating ? 'transform' : 'auto',
        }
        : {};

    return (
        <div
            {...containerProps}
            ref={setContainerNode}
            className={`relative overflow-hidden select-none ${containerProps?.className ?? ''} ${className}`}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            onPointerUpCapture={(event) => {
                if (!suppressNextClickRef.current) return;
                event.preventDefault();
                event.stopPropagation();
            }}
            onClickCapture={(event) => {
                if (!suppressNextClickRef.current) return;
                clearSuppressClickResetTimer();
                suppressNextClickRef.current = false;
                event.preventDefault();
                event.stopPropagation();
            }}
            onDragStart={(event) => event.preventDefault()}
            aria-label={ariaLabel ?? containerProps?.['aria-label']}
            data-testid={containerTestId ?? containerProps?.['data-testid']}
            data-zoom-pan-active-target={panToTarget ?? undefined}
            data-zoom-pan-target-state={panTargetState}
            data-zoom-pan-target-settled={panTargetState === 'settled' ? 'true' : undefined}
            style={{
                ...containerProps?.style,
                ...style,
                cursor: interactionDisabled ? 'default' : isDragging ? 'grabbing' : 'grab',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                touchAction: interactionDisabled ? 'auto' : 'none',
            }}
        >
            {scaleBadgeAddon ? (
                <div className="absolute top-3 left-3 z-40 flex items-center gap-2 pointer-events-none">
                    <div
                        className={`rounded-lg border border-white/20 bg-black/70 px-3 py-1.5 text-sm font-bold text-white shadow-lg pointer-events-none transition-opacity duration-200 ${scaleBadgeClassName} ${shouldShowScaleBadge ? 'opacity-100' : 'opacity-0'}`}
                        style={scaleBadgeStyle}
                        data-testid={scaleTestId}
                        aria-hidden={!shouldShowScaleBadge}
                    >
                        {formatScaleBadge ? formatScaleBadge(activeZoomLevel) : `${Math.round(activeZoomLevel * 100)}%`}
                    </div>
                    <div className="pointer-events-auto">
                        {scaleBadgeAddon}
                    </div>
                </div>
            ) : (
                <div
                    className={`absolute top-3 left-3 z-20 rounded-lg border border-white/20 bg-black/70 px-3 py-1.5 text-sm font-bold text-white shadow-lg pointer-events-none transition-opacity duration-200 ${scaleBadgeClassName} ${shouldShowScaleBadge ? 'opacity-100' : 'opacity-0'}`}
                    style={scaleBadgeStyle}
                    data-testid={scaleTestId}
                    aria-hidden={!shouldShowScaleBadge}
                >
                    {formatScaleBadge ? formatScaleBadge(activeZoomLevel) : `${Math.round(activeZoomLevel * 100)}%`}
                </div>
            )}

            <div
                ref={contentRef}
                className={`origin-center ${contentClassName}`}
                data-testid={contentTestId}
                style={{
                    ...contentStyle,
                    ...contentTransformStyle,
                    pointerEvents: isDragging ? 'none' : contentStyle?.pointerEvents ?? 'auto',
                }}
            >
                {children}
            </div>
        </div>
    );
});

ZoomPanViewport.displayName = 'ZoomPanViewport';
