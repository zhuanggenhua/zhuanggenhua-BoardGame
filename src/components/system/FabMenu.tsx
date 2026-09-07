import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { motion, AnimatePresence, useMotionValue } from 'framer-motion';
import { createPortal } from 'react-dom';
import { PulseGlow } from '../common/animations/PulseGlow';
import { UI_Z_INDEX } from '../../core';
import { OverlayLayerProvider } from '../common/overlays/OverlayLayerContext';
import { MOBILE_MAX_VIEWPORT_WIDTH } from '../../shared/mobileSupport';
import { useDocumentScrollLock } from '../../hooks/ui/useDocumentScrollLock';
import { useRuntimeViewport } from '../../hooks/ui/useRuntimeViewport';
import { logger } from '../../lib/logger';
import { readLocalStorageItem, removeLocalStorageItem, writeLocalStorageItem } from '../../lib/browserStorage';
import { shouldAllowFabDragFromTarget } from './fabDrag';
import { resolveExpandedFabLayout } from './fabLayout';
import { resolveFabStoredPosition, serializeFabPositionPercent } from './fabPosition';

export interface FabAction {
    id: string;
    icon: ReactNode;
    label: string;
    onClick?: () => void;
    content?: ReactNode | ((context: FabPanelRenderContext) => ReactNode); // 侧边面板内容
    color?: string;      // 颜色覆盖
    active?: boolean;    // 通知提示
    onActivate?: (isActive: boolean) => void;
    preview?: ReactNode; // 通知简略信息
    mobilePopoverVerticalAnchor?: 'button' | 'column';
}

export type FabPanelRenderContext = {
    closePanel: () => void;
};

export type FabMenuPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

interface FabMenuProps {
    items: FabAction[];
    position?: FabMenuPosition;
    isDark?: boolean;
    /** 覆盖悬浮球整体层级（默认 UI_Z_INDEX.hud） */
    zIndex?: number;
    /** 可选的位置存储键；游戏内特殊布局可用独立键，避免共享位置挡住主操作区。 */
    storageKey?: string;
    legacyOffsetStorageKey?: string;
}

type FabAlignment = { v: 'top' | 'bottom'; h: 'left' | 'right' };
type SafeAreaInsets = { top: number; right: number; bottom: number; left: number };
type FabPosition = { left: number; top: number };
type FabAnchorRect = { left: number; top: number; right: number; bottom: number; width: number; height: number };
const FAB_RECT_EPSILON = 0.5;
const FAB_EDGE_PEEK_SIZE_MOBILE = 32;
const FAB_EDGE_PEEK_SIZE_DESKTOP = 20;
const FAB_PANEL_GAP_MOBILE = 14;
const FAB_PANEL_GAP_DESKTOP = 10;
const HUD_FAB_POSITION_KEY = 'hud_fab_position';
const HUD_FAB_LEGACY_OFFSET_KEY = 'hud_fab_offset';
export const MOBILE_FAB_VISIBLE_ITEM_LIMIT = 7;

export type FabLayerZIndex = {
    panel: number;
    root: number;
    sheetBackdrop: number;
    sheet: number;
    floatingText: number;
};

export const resolveFabLayerZIndex = (baseZIndex: number = UI_Z_INDEX.hud): FabLayerZIndex => ({
    panel: baseZIndex + 1,
    root: baseZIndex + 2,
    sheetBackdrop: baseZIndex + 1,
    sheet: baseZIndex + 2,
    floatingText: baseZIndex + 3,
});

export interface FabAction {
    mobilePanelVariant?: 'popover' | 'sheet';
}

export const resolveFabSatellitesToRender = <T,>(items: T[]) => [...items].reverse();

export const resolveMobileFabOverflowWarning = (
    items: Array<Pick<FabAction, 'id' | 'label'>>,
    isMobileViewport: boolean,
) => {
    if (!isMobileViewport || items.length <= MOBILE_FAB_VISIBLE_ITEM_LIMIT) {
        return null;
    }

    return {
        count: items.length,
        limit: MOBILE_FAB_VISIBLE_ITEM_LIMIT,
        itemIds: items.map((item) => item.id),
        labels: items.map((item) => item.label),
    };
};

export const shouldTrackFabButtonRect = ({
    showTooltip,
    showPreview,
    isActive,
    hasContent,
}: {
    showTooltip: boolean;
    showPreview: boolean;
    isActive: boolean;
    hasContent: boolean;
}) => showTooltip || showPreview || (isActive && hasContent);

export const areFabAnchorRectsEqual = (left: FabAnchorRect | null, right: FabAnchorRect | null) => {
    if (left === right) return true;
    if (!left || !right) return false;
    return Math.abs(left.left - right.left) < FAB_RECT_EPSILON
        && Math.abs(left.top - right.top) < FAB_RECT_EPSILON
        && Math.abs(left.right - right.right) < FAB_RECT_EPSILON
        && Math.abs(left.bottom - right.bottom) < FAB_RECT_EPSILON
        && Math.abs(left.width - right.width) < FAB_RECT_EPSILON
        && Math.abs(left.height - right.height) < FAB_RECT_EPSILON;
};

export const FabMenu = ({
    items,
    position: initialPosition = 'bottom-right',
    isDark = true,
    zIndex = UI_Z_INDEX.hud,
    storageKey = HUD_FAB_POSITION_KEY,
    legacyOffsetStorageKey = HUD_FAB_LEGACY_OFFSET_KEY,
}: FabMenuProps) => {
    // 响应式尺寸
    const viewport = useRuntimeViewport();
    const viewportWidth = viewport.width;
    const viewportHeight = viewport.height;
    const safeAreaInsets: SafeAreaInsets = viewport.safeArea;
    const isMobileViewport = viewportWidth > 0 && viewportWidth <= MOBILE_MAX_VIEWPORT_WIDTH;
    const dockedButtonSize = isMobileViewport ? 44 : 48;
    const dockedButtonGap = isMobileViewport ? 8 : 12;
    const expandedButtonSize = dockedButtonSize;
    const expandedButtonGap = dockedButtonGap;
    const edgePadding = isMobileViewport ? 12 : 32;
    const edgePeekSize = isMobileViewport ? FAB_EDGE_PEEK_SIZE_MOBILE : FAB_EDGE_PEEK_SIZE_DESKTOP;
    
    const [isOpen, setIsOpen] = useState(false);
    const [activeItemId, setActiveItemId] = useState<string | null>(null);
    const prevActiveItemIdRef = useRef<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [fabPosition, setFabPosition] = useState<FabPosition | null>(null);
    const dragX = useMotionValue(0);
    const dragY = useMotionValue(0);
    const didDragRef = useRef(false);
    const [isDragging, setIsDragging] = useState(false);
    const [liveDragOffset, setLiveDragOffset] = useState({ x: 0, y: 0 });
    const renderButtonSize = isOpen ? expandedButtonSize : dockedButtonSize;
    const renderButtonGap = isOpen ? expandedButtonGap : dockedButtonGap;
    const lastMobileOverflowWarningKeyRef = useRef<string | null>(null);

    // 动态对齐状态
    const [alignment, setAlignment] = useState<FabAlignment>({ v: 'bottom', h: 'right' });
    const tooltipPortalRoot = useMemo(() => {
        if (typeof document === 'undefined') return null;
        return document.getElementById('modal-root') ?? document.body;
    }, []);
    const activeItem = useMemo(
        () => items.find((item) => item.id === activeItemId) ?? null,
        [activeItemId, items],
    );
    const shouldLockDocumentScroll = isOpen
        && isMobileViewport
        && activeItem?.mobilePanelVariant === 'sheet'
        && Boolean(activeItem.content);
    useDocumentScrollLock(shouldLockDocumentScroll);

    const normalizePosition = useCallback((target: FabPosition) => ({
        left: Number.isFinite(target.left) ? target.left : 0,
        top: Number.isFinite(target.top) ? target.top : 0,
    }), []);

    const clampPosition = useCallback((
        target: FabPosition,
        options?: { allowOverflow?: boolean; resolvedButtonSize?: number },
    ) => {
        if (viewportWidth <= 0 || viewportHeight <= 0) {
            return target;
        }
        const allowOverflow = options?.allowOverflow ?? true;
        const resolvedButtonSize = options?.resolvedButtonSize ?? dockedButtonSize;
        const minLeft = allowOverflow
            ? edgePeekSize - resolvedButtonSize
            : edgePadding + safeAreaInsets.left;
        const minTop = allowOverflow
            ? edgePeekSize - resolvedButtonSize
            : edgePadding + safeAreaInsets.top;
        const maxLeft = allowOverflow
            ? Math.max(minLeft, viewportWidth - edgePeekSize)
            : Math.max(minLeft, viewportWidth - resolvedButtonSize - edgePadding - safeAreaInsets.right);
        const maxTop = allowOverflow
            ? Math.max(minTop, viewportHeight - edgePeekSize)
            : Math.max(minTop, viewportHeight - resolvedButtonSize - edgePadding - safeAreaInsets.bottom);
        return {
            left: Math.min(Math.max(target.left, minLeft), maxLeft),
            top: Math.min(Math.max(target.top, minTop), maxTop),
        };
    }, [dockedButtonSize, edgePadding, edgePeekSize, safeAreaInsets.bottom, safeAreaInsets.left, safeAreaInsets.right, safeAreaInsets.top, viewportHeight, viewportWidth]);

    const getAlignmentForPosition = useCallback((target: FabPosition, resolvedButtonSize = dockedButtonSize): FabAlignment => {
        const centerY = viewportHeight / 2;
        const centerX = viewportWidth / 2;
        const anchorX = target.left + resolvedButtonSize / 2;
        const anchorY = target.top + resolvedButtonSize / 2;
        const v: FabAlignment['v'] = anchorY < centerY ? 'top' : 'bottom';
        const h: FabAlignment['h'] = anchorX < centerX ? 'right' : 'left';
        return { v, h };
    }, [dockedButtonSize, viewportHeight, viewportWidth]);

    const getInitialPosition = useCallback(() => {
        if (viewportWidth <= 0 || viewportHeight <= 0) {
            return { left: 0, top: 0 };
        }
        const minLeft = edgePadding + safeAreaInsets.left;
        const minTop = edgePadding + safeAreaInsets.top;
        const maxLeft = Math.max(minLeft, viewportWidth - dockedButtonSize - edgePadding - safeAreaInsets.right);
        const maxTop = Math.max(minTop, viewportHeight - dockedButtonSize - edgePadding - safeAreaInsets.bottom);
        // 默认位置往内偏移，不贴边
        const DEFAULT_INSET = Math.max(dockedButtonSize, 48);
        if (initialPosition === 'bottom-right') return { left: maxLeft - DEFAULT_INSET, top: maxTop - DEFAULT_INSET };
        if (initialPosition === 'bottom-left') return { left: minLeft + DEFAULT_INSET, top: maxTop - DEFAULT_INSET };
        if (initialPosition === 'top-right') return { left: maxLeft - DEFAULT_INSET, top: minTop + DEFAULT_INSET };
        return { left: minLeft + DEFAULT_INSET, top: minTop + DEFAULT_INSET };
    }, [dockedButtonSize, edgePadding, initialPosition, safeAreaInsets.bottom, safeAreaInsets.left, safeAreaInsets.right, safeAreaInsets.top, viewportHeight, viewportWidth]);

    // 加载保存的位置（支持百分比格式，兼容旧绝对坐标）
    useEffect(() => {
        if (viewportWidth <= 0 || viewportHeight <= 0) {
            return undefined;
        }
        const frameId = window.requestAnimationFrame(() => {
            try {
                const resolved = resolveFabStoredPosition({
                    savedPosition: readLocalStorageItem(storageKey),
                    legacyOffset: readLocalStorageItem(legacyOffsetStorageKey),
                    viewportWidth,
                    viewportHeight,
                    basePosition: getInitialPosition(),
                    normalizePosition,
                    clampPosition,
                    resolvedButtonSize: dockedButtonSize,
                });
                if (resolved.shouldPersist) {
                    writeLocalStorageItem(storageKey, JSON.stringify(resolved.percent));
                }
                if (resolved.clearLegacyOffset) {
                    removeLocalStorageItem(legacyOffsetStorageKey);
                }
                setFabPosition(resolved.position);
                setAlignment(getAlignmentForPosition(resolved.position, dockedButtonSize));
            } catch (error) {
                logger.error('FabMenu: 加载悬浮球位置失败', { error });
            }
        });

        return () => window.cancelAnimationFrame(frameId);
    }, [clampPosition, dockedButtonSize, getAlignmentForPosition, getInitialPosition, legacyOffsetStorageKey, normalizePosition, storageKey, viewportHeight, viewportWidth]);

    const handleDragEnd = (_: any, info: any) => {
        if (!fabPosition || viewportWidth <= 0 || viewportHeight <= 0) return;
        setIsDragging(false);
        const next = normalizePosition({
            left: fabPosition.left + info.offset.x,
            top: fabPosition.top + info.offset.y,
        });
        flushSync(() => {
            setFabPosition(next);
            setLiveDragOffset({ x: 0, y: 0 });
            setAlignment(getAlignmentForPosition(next, dockedButtonSize));
        });
        dragX.set(0);
        dragY.set(0);
        // 保存为百分比格式
        writeLocalStorageItem(
            storageKey,
            JSON.stringify(serializeFabPositionPercent(next, viewportWidth, viewportHeight)),
        );
    };

    const handleDragStart = () => {
        didDragRef.current = true;
        setIsDragging(true);
        setLiveDragOffset({ x: 0, y: 0 });
    };

    const handleDrag = (_: any, info: any) => {
        setLiveDragOffset({
            x: info.offset.x,
            y: info.offset.y,
        });
    };

    const handlePointerDownCapture = (event: React.PointerEvent) => {
        if (!shouldAllowFabDragFromTarget(event.target)) {
            return;
        }
        didDragRef.current = false;
    };

    const handleMainClick = () => {
        if (didDragRef.current) {
            didDragRef.current = false;
            return;
        }

        const shouldDeferMainActivation = isMobileViewport && items[0]?.mobilePanelVariant === 'sheet';

        if (!isOpen) {
            // 第一次点击：展开菜单；移动端 sheet 主球不立刻弹层，避免挡住其他入口。
            setIsOpen(true);
            setActiveItemId(shouldDeferMainActivation ? null : items[0].id);
            return;
        }

        // 已展开时：
        // - 若当前没选中主球，则只"选中主球"（不折叠）
        // - 若已选中主球，再次点击才折叠
        if (activeItemId !== items[0].id) {
            setActiveItemId(items[0].id);
            return;
        }

        setIsOpen(false);
        setActiveItemId(null);
    };

    const handleSatelliteClick = (item: FabAction) => {
        if (didDragRef.current) {
            didDragRef.current = false;
            return;
        }
        if (item.content) {
            if (activeItemId === item.id) {
                setActiveItemId(null);
            } else {
                setActiveItemId(item.id);
            }
        } else {
            if (item.onClick) item.onClick();
        }
    };

    // 已展开时不允许"点空白就折叠"，只能再次点击主球关闭；
    // 避免误触导致面板闪退。
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (!isOpen) return;
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                const target = event.target as HTMLElement;
                if (target.closest('[role="dialog"]')) return;
                if (activeItemId === null) {
                    setIsOpen(false);
                }
            }
        };
        if (isOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [activeItemId, isOpen]);

    useEffect(() => {
        if (!fabPosition || viewportWidth <= 0 || viewportHeight <= 0) return;
        const handleResize = () => {
            // 从 localStorage 读取百分比，按新尺寸重新计算
            try {
                const resolved = resolveFabStoredPosition({
                    savedPosition: readLocalStorageItem(storageKey),
                    legacyOffset: null,
                    viewportWidth,
                    viewportHeight,
                    basePosition: fabPosition,
                    normalizePosition,
                    clampPosition,
                    resolvedButtonSize: dockedButtonSize,
                });
                if (resolved.shouldPersist) {
                    writeLocalStorageItem(storageKey, JSON.stringify(resolved.percent));
                }
                setFabPosition(resolved.position);
                setAlignment(getAlignmentForPosition(resolved.position, dockedButtonSize));
                return;
            } catch (error) {
                logger.error('FabMenu: 处理窗口缩放失败', { error });
            }
            // 降级：直接 clamp 当前位置
            const next = clampPosition(fabPosition, { allowOverflow: false, resolvedButtonSize: dockedButtonSize });
            setFabPosition(next);
            setAlignment(getAlignmentForPosition(next, dockedButtonSize));
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [clampPosition, dockedButtonSize, fabPosition, getAlignmentForPosition, normalizePosition, storageKey, viewportHeight, viewportWidth]);

    useEffect(() => {
        if (prevActiveItemIdRef.current === activeItemId) return;

        const prevItem = items.find((item) => item.id === prevActiveItemIdRef.current);
        if (prevItem?.onActivate) {
            prevItem.onActivate(false);
        }

        const nextItem = items.find((item) => item.id === activeItemId);
        if (nextItem?.onActivate) {
            nextItem.onActivate(true);
        }

        prevActiveItemIdRef.current = activeItemId;
    }, [activeItemId, items]);

    useEffect(() => {
        const warning = resolveMobileFabOverflowWarning(items, isMobileViewport);
        if (!warning) {
            lastMobileOverflowWarningKeyRef.current = null;
            return;
        }

        const warningKey = warning.itemIds.join('|');
        if (lastMobileOverflowWarningKeyRef.current === warningKey) {
            return;
        }

        lastMobileOverflowWarningKeyRef.current = warningKey;
        logger.warn('移动端悬浮球数量超过上限', {
            event: 'mobile_fab_visible_item_overflow',
            ...warning,
        });
    }, [isMobileViewport, items]);

    const getExpandedLayout = useCallback((target: FabPosition) => {
        const rawPosition = normalizePosition(target);
        return resolveExpandedFabLayout({
            position: rawPosition,
            alignment,
            satelliteCount: Math.max(items.length - 1, 0),
            buttonSize: expandedButtonSize,
            buttonGap: expandedButtonGap,
            viewportHeight,
            safeAreaTop: safeAreaInsets.top,
            safeAreaBottom: safeAreaInsets.bottom,
            getHorizontalAlignment: (resolvedPosition, resolvedButtonSize) => (
                getAlignmentForPosition(resolvedPosition, resolvedButtonSize).h
            ),
        });
    }, [
        alignment,
        items.length,
        expandedButtonGap,
        expandedButtonSize,
        getAlignmentForPosition,
        normalizePosition,
        safeAreaInsets.bottom,
        safeAreaInsets.top,
        viewportHeight,
    ]);

    const renderLayout = useMemo(() => {
        if (!fabPosition) {
            return null;
        }
        if (!isOpen) {
            return {
                position: fabPosition,
                alignment,
                listOffset: { x: 0, y: 0 },
                columnCount: 1,
                itemsPerColumn: Math.max(items.length - 1, 1),
                columnGap: expandedButtonSize + Math.max(expandedButtonGap, 8),
            };
        }
        return getExpandedLayout(fabPosition);
    }, [alignment, fabPosition, getExpandedLayout, isOpen]);

    if (!renderLayout) return null;

    const renderPosition = renderLayout.position;
    const liveRenderPosition = {
        left: renderPosition.left + liveDragOffset.x,
        top: renderPosition.top + liveDragOffset.y,
    };
    const renderAlignment = renderLayout.alignment;
    const satellitesToRender = resolveFabSatellitesToRender(items.slice(1));
    const layerZIndex = resolveFabLayerZIndex(zIndex);

    const hasAnyNotification = items.some((item) => item.active);
    // 波纹/辉光颜色跟随"选中态"同色系，避免不明显
    const glowColor = isDark ? 'rgba(0, 243, 255, 0.55)' : 'rgba(140, 123, 100, 0.85)';

    return (
        <motion.div
            ref={containerRef}
            className="fixed font-sans"
            initial={false}
            drag
            dragMomentum={false}
            onDragStart={handleDragStart}
            onDrag={handleDrag}
            onDragEnd={handleDragEnd}
            onPointerDownCapture={handlePointerDownCapture}
            style={{
                left: renderPosition.left,
                top: renderPosition.top,
                x: dragX,
                y: dragY,
                zIndex: layerZIndex.root,
                touchAction: 'none',
            }}
            data-testid="fab-menu"
            data-fab-position={initialPosition}
            data-fab-storage-key={storageKey}
        >
            {/* 主球：锚点，位置固定 */}
            <FabButtonSlot
                item={items[0]}
                isActive={activeItemId === items[0].id && isOpen}
                onClick={handleMainClick}
                showGlow={!isOpen ? hasAnyNotification : Boolean(items[0].active)}
                isMain={true}
                isDark={isDark}
                alignment={renderAlignment}
                tooltipPortalRoot={tooltipPortalRoot}
                glowColor={glowColor}
                isDragging={isDragging}
                buttonSize={renderButtonSize}
                buttonGap={renderButtonGap}
                edgePadding={edgePadding}
                safeAreaInsets={safeAreaInsets}
                isMobileViewport={isMobileViewport}
                viewportWidth={viewportWidth}
                viewportHeight={viewportHeight}
                panelAnchorPosition={liveRenderPosition}
                layerZIndex={layerZIndex}
                onRequestClose={() => {
                    setIsOpen(false);
                    setActiveItemId(null);
                }}
            />

            {/* 卫星按钮：绝对定位，相对主球偏移 */}
            <SatelliteList
                isOpen={isOpen}
                items={satellitesToRender}
                activeId={activeItemId}
                onItemClick={handleSatelliteClick}
                alignment={renderAlignment}
                isDark={isDark}
                tooltipPortalRoot={tooltipPortalRoot}
                glowColor={glowColor}
                isDragging={isDragging}
                fabPosition={liveRenderPosition}
                listOffset={renderLayout.listOffset}
                columnCount={renderLayout.columnCount}
                itemsPerColumn={renderLayout.itemsPerColumn}
                columnGap={renderLayout.columnGap}
                buttonSize={renderButtonSize}
                buttonGap={renderButtonGap}
                edgePadding={edgePadding}
                safeAreaInsets={safeAreaInsets}
                isMobileViewport={isMobileViewport}
                viewportWidth={viewportWidth}
                viewportHeight={viewportHeight}
                layerZIndex={layerZIndex}
            />
        </motion.div>
    );
};

const SatelliteList = ({
    isOpen,
    items,
    activeId,
    onItemClick,
    alignment,
    isDark,
    tooltipPortalRoot,
    glowColor,
    isDragging,
    fabPosition,
    listOffset,
    columnCount: resolvedColumnCount,
    itemsPerColumn: resolvedItemsPerColumn,
    columnGap: resolvedColumnGap,
    buttonSize,
    buttonGap,
    edgePadding,
    safeAreaInsets,
    isMobileViewport,
    viewportWidth,
    viewportHeight,
    layerZIndex,
}: any) => {
    const isButtonBottom = alignment.v === 'bottom';
    const isRightOpening = alignment.h === 'right';
    const columnCount = Math.max(1, Number(resolvedColumnCount ?? 1));
    const itemsPerColumn = Math.max(1, Number(resolvedItemsPerColumn ?? (items.length || 1)));
    const columnGap = Math.max(buttonSize + Math.max(buttonGap, 8), Number(resolvedColumnGap ?? 0));
    const itemGroups = Array.from({ length: columnCount }, (_, columnIndex) => (
        items.slice(columnIndex * itemsPerColumn, (columnIndex + 1) * itemsPerColumn)
    )).filter((group) => group.length > 0);
    const effectiveColumnCount = Math.max(1, itemGroups.length);
    const flexDirection = isButtonBottom ? 'flex-col-reverse' : 'flex-col';
    const rowDirection = isRightOpening ? 'row' : 'row-reverse';
    const alignItems = alignment.h === 'right' ? 'items-start' : 'items-end';
    const offset = buttonSize + buttonGap;
    const columnHeights = itemGroups.map((group) => group.length * (buttonSize + buttonGap));
    const visibleColumnTop = isButtonBottom
        ? fabPosition.top + (listOffset?.y ?? 0) - Math.max(...columnHeights, buttonSize)
        : fabPosition.top + (listOffset?.y ?? 0) + offset;
    const visibleColumnBottom = isButtonBottom
        ? fabPosition.top + (listOffset?.y ?? 0) - offset + buttonSize
        : fabPosition.top + (listOffset?.y ?? 0) + Math.max(...columnHeights, buttonSize) + offset;
    const panelReferenceRect = {
        left: fabPosition.left + (listOffset?.x ?? 0),
        right: fabPosition.left + (listOffset?.x ?? 0) + buttonSize + ((effectiveColumnCount - 1) * columnGap),
        top: visibleColumnTop,
        bottom: visibleColumnBottom,
        width: buttonSize + ((effectiveColumnCount - 1) * columnGap),
        height: Math.max(visibleColumnBottom - visibleColumnTop, buttonSize),
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className={`absolute left-0 flex ${alignItems}`}
                    style={{
                        [isButtonBottom ? 'bottom' : 'top']: offset,
                        flexDirection: rowDirection,
                        columnGap: itemGroups.length > 1 ? columnGap - buttonSize : 0,
                        transform: `translate(${listOffset?.x ?? 0}px, ${listOffset?.y ?? 0}px)`,
                    }}
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    variants={{
                        hidden: { opacity: 0 },
                        visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
                    }}
                >
                    {itemGroups.map((group, columnIndex) => (
                        <div
                            key={`fab-column-${columnIndex}`}
                            className={`flex ${flexDirection} ${alignItems}`}
                            style={{
                                gap: isMobileViewport ? buttonGap : Math.max(buttonGap, 12),
                            }}
                        >
                            {group.map((item: FabAction, index: number) => {
                                const distanceFromMain = index + 1;
                                const columnX = (isRightOpening ? 1 : -1) * columnIndex * columnGap;
                                const anchorPosition: FabPosition = {
                                    left: fabPosition.left + (listOffset?.x ?? 0) + columnX,
                                    top: isButtonBottom
                                        ? fabPosition.top + (listOffset?.y ?? 0) - distanceFromMain * (buttonSize + buttonGap)
                                        : fabPosition.top + (listOffset?.y ?? 0) + distanceFromMain * (buttonSize + buttonGap),
                                };

                                return (
                                    <FabButtonSlot
                                        key={item.id}
                                        item={item}
                                        isActive={activeId === item.id}
                                        onClick={() => onItemClick(item)}
                                        showGlow={Boolean(item.active) && activeId !== item.id}
                                        isMain={false}
                                        isDark={isDark}
                                        alignment={alignment}
                                        tooltipPortalRoot={tooltipPortalRoot}
                                        glowColor={glowColor}
                                        isDragging={isDragging}
                                        buttonSize={buttonSize}
                                        buttonGap={buttonGap}
                                        edgePadding={edgePadding}
                                        safeAreaInsets={safeAreaInsets}
                                        isMobileViewport={isMobileViewport}
                                        viewportWidth={viewportWidth}
                                        viewportHeight={viewportHeight}
                                        panelAnchorPosition={anchorPosition}
                                        panelReferenceRect={panelReferenceRect}
                                        layerZIndex={layerZIndex}
                                        onRequestClose={() => onItemClick(item)}
                                    />
                                );
                            })}
                        </div>
                    ))}
                </motion.div>
            )}
        </AnimatePresence>
    );
};

const FabButtonSlot = ({
    item,
    isActive,
    onClick,
    showGlow,
    isMain,
    isDark,
    alignment,
    tooltipPortalRoot,
    glowColor,
    isDragging,
    buttonSize,
    buttonGap,
    edgePadding,
    safeAreaInsets,
    isMobileViewport,
    viewportWidth,
    viewportHeight,
    panelAnchorPosition,
    panelReferenceRect,
    layerZIndex,
    onRequestClose,
}: any) => {
    const [anchorRect, setAnchorRect] = useState<FabAnchorRect | null>(null);

    return (
        <div className={`relative flex items-center justify-center ${isActive ? 'z-50' : 'z-20'}`}>
            <Panel
                item={item}
                isActive={isActive}
                alignment={alignment}
                isDark={isDark}
                anchorPosition={panelAnchorPosition}
                anchorRect={anchorRect}
                buttonSize={buttonSize}
                buttonGap={buttonGap}
                edgePadding={edgePadding}
                safeAreaInsets={safeAreaInsets}
                isMobileViewport={isMobileViewport}
                viewportWidth={viewportWidth}
                viewportHeight={viewportHeight}
                tooltipPortalRoot={tooltipPortalRoot}
                layerZIndex={layerZIndex}
                referenceRect={panelReferenceRect}
                onRequestClose={onRequestClose}
            />
            <MenuButton
                item={item}
                onClick={onClick}
                isActive={isActive}
                showGlow={showGlow}
                isMain={isMain}
                isDark={isDark}
                alignment={alignment}
                tooltipPortalRoot={tooltipPortalRoot}
                layerZIndex={layerZIndex}
                glowColor={glowColor}
                isDragging={isDragging}
                buttonSize={buttonSize}
                isMobileViewport={isMobileViewport}
                viewportWidth={viewportWidth}
                anchorPosition={panelAnchorPosition}
                onRectChange={setAnchorRect}
            />
        </div>
    );
};

const Panel = ({
    item,
    isActive,
    alignment,
    isDark,
    anchorPosition,
    anchorRect,
    referenceRect,
    buttonSize,
    edgePadding,
    safeAreaInsets,
    isMobileViewport,
    viewportWidth,
    viewportHeight,
    tooltipPortalRoot,
    layerZIndex,
    onRequestClose,
}: any) => {
    const panelGap = isMobileViewport ? FAB_PANEL_GAP_MOBILE : FAB_PANEL_GAP_DESKTOP;
    const logicalAnchor = {
        left: anchorPosition.left,
        top: anchorPosition.top,
        right: anchorPosition.left + buttonSize,
        bottom: anchorPosition.top + buttonSize,
        width: buttonSize,
        height: buttonSize,
    };
    const resolvedAnchor = anchorRect ?? logicalAnchor;
    const resolvedReference = referenceRect ?? resolvedAnchor;
    const verticalAnchorMode = item.mobilePopoverVerticalAnchor === 'column' ? 'column' : 'button';
    const resolvedVerticalAnchor = verticalAnchorMode === 'column' ? resolvedReference : resolvedAnchor;
    const panelAnchorOffset = resolvedAnchor.width + panelGap;
    const isMobileSheetPanel = isMobileViewport && item.mobilePanelVariant === 'sheet';
    const panelWidth = isMobileViewport ? 260 : 300;
    const spaceRight = Math.max(
        0,
        Math.floor(viewportWidth - resolvedAnchor.right - panelGap - safeAreaInsets.right - edgePadding),
    );
    const spaceLeft = Math.max(
        0,
        Math.floor(resolvedAnchor.left - panelGap - safeAreaInsets.left - edgePadding),
    );
    const anchorSpaceBelow = Math.max(
        0,
        Math.floor(viewportHeight - resolvedVerticalAnchor.top - safeAreaInsets.bottom - edgePadding),
    );
    const anchorSpaceAbove = Math.max(
        0,
        Math.floor(resolvedVerticalAnchor.bottom - safeAreaInsets.top - edgePadding),
    );

    const horizontalPlacement: FabAlignment['h'] = referenceRect
        ? (spaceRight === spaceLeft ? alignment.h : (spaceRight >= spaceLeft ? 'right' : 'left'))
        : alignment.h;
    const verticalPlacement: FabAlignment['v'] = anchorSpaceBelow === anchorSpaceAbove
        ? alignment.v
        : (anchorSpaceBelow >= anchorSpaceAbove ? 'top' : 'bottom');
    const safeAvailableWidth = horizontalPlacement === 'right' ? spaceRight : spaceLeft;
    const safeAvailableHeight = verticalPlacement === 'top' ? anchorSpaceBelow : anchorSpaceAbove;
    const panelContainerTopMin = safeAreaInsets.top;
    const panelContainerTopMax = Math.max(
        panelContainerTopMin,
        viewportHeight - safeAreaInsets.bottom - resolvedVerticalAnchor.height,
    );
    const panelContainerTop = Math.min(
        Math.max(resolvedVerticalAnchor.top, panelContainerTopMin),
        panelContainerTopMax,
    );
    const resolvedPanelWidth = safeAvailableWidth > 0 ? Math.min(panelWidth, safeAvailableWidth) : panelWidth;
    const panelMaxWidth = safeAvailableWidth > 0 ? `${safeAvailableWidth}px` : undefined;
    const panelMaxHeight = safeAvailableHeight > 0 ? `${safeAvailableHeight}px` : undefined;
    const panelHeading = (
        <div className="mb-2 truncate border-b border-white/10 pb-2 text-[10px] font-bold uppercase tracking-wider opacity-70">
            {item.label}
        </div>
    );
    const panelContext: FabPanelRenderContext = {
        closePanel: () => {
            onRequestClose?.();
        },
    };
    const renderedContent = typeof item.content === 'function'
        ? item.content(panelContext)
        : item.content;
    const layeredContent = (
        <OverlayLayerProvider tooltipZIndex={layerZIndex.floatingText}>
            {renderedContent}
        </OverlayLayerProvider>
    );

    if (isMobileSheetPanel) {
        const sheetHorizontalMargin = 12;
        const sheetBottomOffset = safeAreaInsets.bottom + 4;
        const availableSheetWidth = Math.max(
            0,
            viewportWidth - safeAreaInsets.left - safeAreaInsets.right - (sheetHorizontalMargin * 2),
        );
        const resolvedSheetWidth = Math.min(availableSheetWidth, 420);
        const resolvedSheetLeft = Math.max(
            safeAreaInsets.left + sheetHorizontalMargin,
            (viewportWidth - resolvedSheetWidth) / 2,
        );

        if (!isActive || !item.content || !tooltipPortalRoot) {
            return null;
        }

        return createPortal(
            <>
                <div
                    className="fixed inset-0 bg-black/55 backdrop-blur-[2px]"
                    style={{ zIndex: layerZIndex.sheetBackdrop }}
                    onClick={(event) => {
                        event.stopPropagation();
                        onRequestClose?.();
                    }}
                    data-testid={`fab-sheet-backdrop-${item.id}`}
                />
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.16 }}
                    className="fixed"
                    style={{
                        left: resolvedSheetLeft,
                        bottom: sheetBottomOffset,
                        width: resolvedSheetWidth > 0 ? resolvedSheetWidth : undefined,
                        zIndex: layerZIndex.sheet,
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                    role="dialog"
                    aria-modal="true"
                    aria-label={item.label}
                    data-testid={`fab-sheet-${item.id}`}
                >
                    <div
                        className={`
                            overflow-hidden rounded-[22px] border shadow-2xl
                            ${isDark
                                ? 'border-white/10 bg-black/95 text-white shadow-black/70'
                                : 'border-[#d3ccba] bg-[#fcfbf9]/98 text-[#433422] shadow-[#433422]/20'}
                        `}
                        data-fab-panel-interactive="true"
                        data-testid={`fab-panel-${item.id}`}
                    >
                        <div className="px-4 pt-4">
                            <div className="truncate border-b border-white/10 pb-2 text-[11px] font-bold uppercase tracking-[0.22em] opacity-70">
                                {item.label}
                            </div>
                        </div>
                        <div className="px-3 pb-3 pt-3">
                            {layeredContent}
                        </div>
                    </div>
                </motion.div>
            </>,
            tooltipPortalRoot,
        );
    }

    if (!isActive || !item.content || !tooltipPortalRoot) {
        return null;
    }

    return createPortal(
        <AnimatePresence>
            <div
                style={{
                    position: 'fixed',
                    left: resolvedAnchor.left,
                    top: panelContainerTop,
                    width: resolvedAnchor.width,
                    height: resolvedVerticalAnchor.height,
                    zIndex: layerZIndex.panel,
                    pointerEvents: 'none',
                }}
            >
                <motion.div
                    key="panel"
                    initial={{ opacity: 0, scale: 0.95, x: horizontalPlacement === 'right' ? -10 : 10 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.95, x: horizontalPlacement === 'right' ? -10 : 10 }}
                    className={`
                        absolute p-4 max-md:p-3 rounded-xl shadow-2xl backdrop-blur-xl border-l-[3px]
                        ${isDark ? "bg-black/95 border-white/20 border-l-neon-blue text-white" : "bg-[#fcfbf9]/95 border-[#d3ccba] border-l-[#8c7b64] text-[#433422]"}
                        overflow-y-auto overflow-x-hidden custom-scrollbar
                    `}
                    style={{
                        width: resolvedPanelWidth,
                        maxWidth: panelMaxWidth,
                        maxHeight: panelMaxHeight,
                        minWidth: 0,
                        pointerEvents: 'auto',
                        [horizontalPlacement === 'right' ? 'left' : 'right']: panelAnchorOffset,
                        [verticalPlacement === 'top' ? 'top' : 'bottom']: 0,
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerDownCapture={(e) => e.stopPropagation()}
                    data-fab-panel-interactive="true"
                    data-testid={`fab-panel-${item.id}`}
                >
                    {panelHeading}
                    {layeredContent}
                </motion.div>
            </div>,
        </AnimatePresence>,
        tooltipPortalRoot,
    );
};

const MenuButton = ({
    item,
    onClick,
    isActive,
    isMain,
    isDark,
    alignment,
    tooltipPortalRoot,
    layerZIndex,
    showGlow,
    glowColor,
    isDragging,
    buttonSize,
    isMobileViewport,
    viewportWidth,
    anchorPosition,
    onRectChange,
}: any) => {
    const [isHovered, setIsHovered] = useState(false);
    const showTooltip = !isMobileViewport && isHovered && !isDragging && !(isActive && item.content);
    const showPreview = !isMobileViewport && Boolean(item.preview) && !isDragging && !isActive;
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [tooltipRect, setTooltipRect] = useState<DOMRect | null>(null);
    const visualButtonSize = isMobileViewport ? Math.max(buttonSize - 4, 40) : buttonSize;
    const shouldTrackRect = shouldTrackFabButtonRect({
        showTooltip,
        showPreview,
        isActive,
        hasContent: Boolean(item.content),
    });

    const updateTooltipRect = useCallback(() => {
        if (!buttonRef.current) return;
        const rect = buttonRef.current.getBoundingClientRect();
        const nextRect = {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
        };
        if (areFabAnchorRectsEqual(tooltipRect, nextRect)) return;
        setTooltipRect(rect);
        onRectChange?.(nextRect);
    }, [onRectChange, tooltipRect]);

    useEffect(() => {
        if (!shouldTrackRect) return;
        updateTooltipRect();
        let frameId = window.requestAnimationFrame(function syncRect() {
            updateTooltipRect();
            frameId = window.requestAnimationFrame(syncRect);
        });
        window.addEventListener('resize', updateTooltipRect);
        window.addEventListener('scroll', updateTooltipRect, true);
        return () => {
            window.cancelAnimationFrame(frameId);
            window.removeEventListener('resize', updateTooltipRect);
            window.removeEventListener('scroll', updateTooltipRect, true);
        };
    }, [shouldTrackRect, updateTooltipRect]);

    useEffect(() => {
        updateTooltipRect();
    }, [anchorPosition?.left, anchorPosition?.top, buttonSize, isActive, updateTooltipRect]);

    const tooltipSide = useMemo(() => {
        // tooltip 出现在"展开方向"的一侧：对齐规则与 Panel 一致
        return alignment.h === 'right' ? 'left' : 'right';
    }, [alignment.h]);

    const previewSide = useMemo(() => (tooltipSide === 'left' ? 'right' : 'left'), [tooltipSide]);

    const tooltipVerticalOffset = -(tooltipRect?.height ?? 0) / 2 + 8;
    const floatingMaxWidth = isMobileViewport ? 'min(220px, 56vw)' : 'min(360px, 70vw)';
    const gap = 8; // tooltip/preview 与按钮边缘的间隙

    const activeStyle = isActive
        ? isDark
            ? 'bg-neon-blue text-black border-neon-blue shadow-neon-blue/50 ring-2 ring-white/20'
            : 'bg-[#8c7b64] text-white border-[#8c7b64] shadow-lg'
        : isDark
            ? "bg-black/90 border border-white/20 text-white shadow-xl shadow-black/50"
            : "bg-white border border-[#d3ccba] text-[#433422] shadow-xl shadow-[#433422]/10";

    return (
        <PulseGlow
            isGlowing={Boolean(showGlow)}
            glowColor={glowColor}
            className="relative"
            loop={Boolean(showGlow)}
            effect={showGlow ? 'ripple' : 'glow'}
        >
            <motion.button
                ref={buttonRef}
                variants={!isMain ? {
                    hidden: { opacity: 0, scale: 0.5, y: isMain ? 0 : 10 },
                    visible: { opacity: 1, scale: 1, y: 0 }
                } : undefined}
                onClick={(e) => {
                    e.stopPropagation();
                    onClick();
                }}
                onMouseEnter={() => {
                    setIsHovered(true);
                    updateTooltipRect();
                }}
                onMouseLeave={() => setIsHovered(false)}
                onPointerDown={(e) => e.stopPropagation()}
                aria-label={item.label}
                data-fab-id={item.id}
                className={`
                    relative flex items-center justify-center
                    bg-transparent border-0 p-0
                    transition-transform duration-300 hover:scale-105
                    cursor-pointer
                    z-20
                `}
                style={{
                    width: buttonSize,
                    height: buttonSize,
                    minWidth: buttonSize,
                    minHeight: buttonSize,
                }}
            >
                {tooltipPortalRoot && createPortal(
                    <>
                        <AnimatePresence>
                            {showTooltip && tooltipRect && (
                                <motion.div
                                    key={`tooltip-${item.id}`}
                                    initial={{ opacity: 0, x: tooltipSide === 'right' ? 10 : -10, scale: 0.9 }}
                                    animate={{ opacity: 1, x: 0, scale: 1 }}
                                    exit={{ opacity: 0, x: tooltipSide === 'right' ? 10 : -10, scale: 0.9 }}
                                    data-testid={`fab-tooltip-${item.id}`}
                                    className={`
                                        pointer-events-none overflow-hidden text-ellipsis whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold
                                        ${isDark ? 'bg-black text-white border border-white/20 shadow-lg shadow-black/50' : 'bg-white text-[#433422] border border-[#d3ccba] shadow-xl'}
                                    `}
                                    style={{
                                        position: 'fixed',
                                        top: tooltipRect.top + tooltipRect.height / 2 + tooltipVerticalOffset,
                                        left: tooltipSide === 'right'
                                            ? tooltipRect.right + gap
                                            : undefined,
                                        right: tooltipSide === 'left'
                                            ? viewportWidth - tooltipRect.left + gap
                                            : undefined,
                                        transform: `translate(${tooltipSide === 'right' ? '0' : '-100%'}, -50%)`,
                                        zIndex: layerZIndex.floatingText,
                                        maxWidth: floatingMaxWidth,
                                    }}
                                >
                                    {item.label}
                                </motion.div>
                            )}
                        </AnimatePresence>
                        <AnimatePresence>
                            {showPreview && tooltipRect && (
                                <motion.div
                                    key={`preview-${item.id}`}
                                    initial={{ opacity: 0, x: previewSide === 'right' ? 8 : -8 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: previewSide === 'right' ? 8 : -8 }}
                                    data-testid={`fab-preview-${item.id}`}
                                    className={`
                                        pointer-events-none px-3 py-2 rounded-lg text-xs font-medium
                                        overflow-hidden text-ellipsis whitespace-nowrap
                                        ${isDark ? 'bg-black/90 text-white border border-white/20 shadow-lg shadow-black/50' : 'bg-white text-[#433422] border border-[#d3ccba] shadow-xl'}
                                    `}
                                    style={{
                                        position: 'fixed',
                                        top: tooltipRect.top + tooltipRect.height / 2 + tooltipVerticalOffset,
                                        left: previewSide === 'right'
                                            ? tooltipRect.right + gap
                                            : undefined,
                                        right: previewSide === 'left'
                                            ? viewportWidth - tooltipRect.left + gap
                                            : undefined,
                                        transform: `translate(${previewSide === 'right' ? '0' : '-100%'}, -50%)`,
                                        zIndex: layerZIndex.floatingText,
                                        maxWidth: floatingMaxWidth,
                                    }}
                                >
                                    {item.preview}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </>,
                    tooltipPortalRoot
                )}

                {/* 移动端保留 44px 命中区，但缩小视觉圆球，避免遮挡主棋盘。 */}
                <div
                    data-fab-visual-id={item.id}
                    className={`
                        pointer-events-none flex items-center justify-center
                        rounded-full backdrop-blur-md border
                        ${activeStyle}
                        ${item.color || ''}
                        shadow-lg transition-shadow duration-300 hover:shadow-xl
                    `}
                    style={{
                        width: visualButtonSize,
                        height: visualButtonSize,
                    }}
                >
                    <div
                        className="flex h-full w-full items-center justify-center"
                        style={{ transform: isMobileViewport ? 'scale(0.92)' : undefined }}
                    >
                        {item.icon}
                    </div>
                </div>
            </motion.button>
        </PulseGlow>
    );
};
