import {
    useLayoutEffect,
    useId,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type Dispatch,
    type SetStateAction,
    type SVGProps,
} from 'react';
import { useTranslation } from 'react-i18next';
import { ZoomIn } from 'lucide-react';
import type { CardPreviewRef } from '../../core';
import { EndgameOverlay } from '../../components/game/framework/widgets/EndgameOverlay';
import { ZoomPanViewport } from '../../components/game/framework';
import { OptimizedImage } from '../../components/common/media/OptimizedImage';
import { CardPreview } from '../../components/common/media/CardPreview';
import { MagnifyOverlay } from '../../components/common/overlays/MagnifyOverlay';
import { BoardDamageStateOverlay } from '../../components/common/animations/BoardDamageStateOverlay';
import { FxLayer, useFxAnchorRegistry, useFxBus, type FxAnchorRegistry, type FxBus } from '../../engine/fx';
import { useRenderPipelineSettings } from '../../engine/renderPipeline';
import { FLOW_COMMANDS } from '../../engine/systems/FlowSystem';
import {
    projectChoiceRequestToDirectSelectionTargets,
    type ChoiceRequestDirectSelectionTarget,
} from '../../engine/systems';
import {
    INTERACTION_COMMANDS,
    asSimpleChoice,
    type InteractionDescriptor,
} from '../../engine/systems/InteractionSystem';
import { buildChoiceRequestFromOpportunity } from '../../engine/TimingOpportunity';
import type { PlayerId } from '../../engine/types';
import type { GameBoardProps } from '../../engine/transport/protocol';
import { useRuntimeViewport } from '../../hooks/ui/useRuntimeViewport';
import { useEndgame } from '../../hooks/game/useEndgame';
import { useTutorial, useTutorialBridge } from '../../contexts/TutorialContext';
import {
    MAGE_WARS_OBJECT_ABILITY_IDS,
    type ArenaZoneId,
    type MageWarsMageAbilityId,
    type MageWarsObjectAbilityId,
    type MageWarsWallEdgeId,
} from './domain/ids';
import {
    MAGE_WARS_COMMANDS,
    MAGE_WARS_MAX_PREPARED_SPELLS,
    type MageWarsArenaObjectState,
    type MageWarsCastSpellCommand,
    type MageWarsCore,
    type MageWarsPhase,
    type MageWarsPlayerState,
} from './domain';
import type { MageWarsWallState } from './domain/types';
import {
    getMageWarsMageAbilityFromConfig,
    getMageWarsSpellCardFromConfig,
} from './data/configPackage';
import { areAdjacentZones } from './domain/utils';
import { mageWarsObjectAbilityRegistry } from './domain/abilityCatalog';
import {
    buildMageWarsObjectAbilityActivationOpportunity,
    type MageWarsObjectAbilityActivationChoiceValue,
} from './domain/objectAbilityRuntime';
import {
    buildMageWarsMageAbilityActivationOpportunity,
    resolveMageWarsPriestessRestoreAbilityIdForPhase,
    type MageWarsMageAbilityActivationChoiceValue,
} from './domain/mageAbilityRuntime';
import {
    buildMageWarsSpellCastOpportunity,
    type MageWarsSpellCastChoiceValue,
} from './domain/spellCastRuntime';
import {
    getMageWarsMagePreviewRef,
    getMageWarsMagePreviewAspectRatio,
    getMageWarsSpellCardAspectRatio,
    getMageWarsSpellCardName,
    getMageWarsSpellCardPreviewRef,
} from './ui/cardAtlas';
import { mageWarsFxRegistry } from './ui/fxSetup';
import {
    mageWarsObjectDamageKey,
    mageWarsPlayerDamageKey,
    useMageWarsGameEvents,
    MAGE_WARS_ARENA_FX_SURFACE_ID,
} from './ui/useGameEvents';
import {
    canMageWarsObjectUsePostMoveQuickAction,
    getMageWarsObjectAttackProfiles,
    isMageWarsArenaObjectRestrained,
    resolveMageWarsObjectEffectiveLife,
} from './domain/spellRules';
import {
    MAGE_WARS_ARENA_WORLD_HEIGHT,
    MAGE_WARS_ARENA_WORLD_WIDTH,
    ZONE_RECTS,
    buildMageWarsWallEdgeDescriptors,
    getZoneFieldCardOffsetStyle,
    getZoneLaneItemStyle,
    getZoneOwnerLaneLayoutClassName,
    getZoneOwnerLaneOverflowMode,
    isBottomArenaRowZone,
    pct,
    type WallEdgeDescriptor,
    type ZoneEntityDensity,
} from './ui/arenaPresentation';
import { getMageWarsSpellbookDisplayEntries } from './ui/spellbookPresentation';
import {
    buildMageAbilityTargetsByObjectId,
    buildNonEmptySet,
    buildObjectAbilityTargetsByObjectId,
    buildSpellCastTargetsByObjectId,
    buildSpellCastTargetsByPlayerId,
    buildSpellCastTargetsByWallEdgeId,
    buildSpellCastTargetsByZoneId,
    compareObjectAbilityTargets,
    hasEnabledChoiceCandidate,
    hasSameObjectPath,
    isMageWarsObjectAttackTargetSelectable,
    readMageWarsCastSpellChainObjectIds,
    readMageWarsCastSpellPayload,
    startsWithObjectPath,
} from './ui/targetSelectionReadModel';
import { buildMageWarsTutorialRuntimeSyncKey } from './ui/tutorialRuntimeSyncKey';
import {
    getMageDisplayLabel,
    isMageWarsAttachmentObject,
    isMageWarsMageAttachmentObject,
    isMageWarsObjectAttachmentObject,
    isMageWarsZoneAttachmentObject,
    isPlayerId,
    resolveMageWarsPhaseActorId,
    resolveOpponentId,
    resolveSeatOwnerSide,
    resolveViewingPlayerId,
    type SeatOwnerSide,
} from './ui/arenaEntityPresentation';
import {
    canMageWarsObjectStartAction,
    isCreatureActionPhase,
    isMageWarsActionableCreatureObject,
} from './ui/actionReadModel';
import { MageWarsSelectedAbilityActionDock } from './ui/selectedAbilityActionDock';

type Props = GameBoardProps<MageWarsCore>;

const MAGE_WARS_DESKTOP_UI_DESIGN_WIDTH = 1920;
const MAGE_WARS_DESKTOP_UI_DESIGN_HEIGHT = 1080;
const MAGE_WARS_DESKTOP_BOTTOM_GAP_PX = 8;
const MAGE_WARS_SPELLBOOK_VISIBLE_CARD_COUNT = 6;
const MAGE_WARS_TUTORIAL_JUNGLE_WOLF_CARD_ID = 2819;
const MAGE_WARS_TUTORIAL_ROUSE_THE_BEAST_CARD_ID = 3403;
const MAGE_WARS_LOCAL_PLANNING_TUTORIAL_STEP_IDS = new Set([
    'plan-open-creature-category',
    'plan-creature-next-page',
    'plan-select-wolf',
    'plan-open-incantation-category',
    'plan-incantation-next-page',
    'plan-select-rouse',
]);
// 与大杀四方手牌放大镜同量级：2vw / 8.5vw ≈ 23.5% 卡宽；用卡牌容器宽度自适应，避免 16:9 放大后图标相对变小。
const MAGE_WARS_REFERENCE_INSPECT_BUTTON_SIZE = 'clamp(28px, 18.5cqw, 34px)';
const MAGE_WARS_REFERENCE_INSPECT_ICON_SIZE = 'clamp(15px, 10cqw, 19px)';
const MAGE_WARS_HUD_HINT_CARD_HEIGHT_CSS_VAR = 'var(--mage-wars-desktop-hud-hint-card-height, 15.75rem)';
const MAGE_WARS_HUD_COMPACT_HINT_CARD_HEIGHT_REM = 4.5;
const MAGE_WARS_MIN_CAMERA_BOTTOM_UI_INSET = 316;
const MAGE_WARS_CAMERA_BOTTOM_UI_INSET_RATIO = 0.28;
const MAGE_WARS_MAX_CAMERA_BOTTOM_UI_INSET_RATIO = 0.45;
const MAGE_WARS_TUTORIAL_ARENA_TARGET_PREFIXES = [
    'mw-zone-',
    'mw-field-object-',
    'mw-arena-object-',
    'mw-mage-entity-',
] as const;

type MageWarsMagnifiedPreview = {
    previewRef: CardPreviewRef;
    title: string;
    aspectRatio: number;
    sourceCardId?: number;
    mageId?: string;
};

const TOKEN_IMAGES = {
    actionReady: 'mage-wars/tokens/action/ready-token-front',
    actionSpent: 'mage-wars/tokens/action/ready-token-back',
    quickcastReady: 'mage-wars/tokens/quickcast/quickcast-marker-front',
    quickcastSpent: 'mage-wars/tokens/quickcast/quickcast-marker-back',
    guard: 'mage-wars/tokens/status/guard-token',
    burn: 'mage-wars/tokens/status/burn-token',
    daze: 'mage-wars/tokens/status/daze-token',
    weak: 'mage-wars/tokens/status/weak-token',
    cripple: 'mage-wars/tokens/status/cripple-token',
    rot: 'mage-wars/tokens/status/rot-token',
    stun: 'mage-wars/tokens/status/stun-token',
    sleep: 'mage-wars/tokens/status/sleep-token',
    channeling: 'mage-wars/tokens/channeling/channeling-token-front',
} as const;

const resolveMageWarsTutorialArenaPanTarget = (highlightTarget?: string): string | null => {
    if (!highlightTarget) return null;
    if (MAGE_WARS_TUTORIAL_ARENA_TARGET_PREFIXES.some((prefix) => highlightTarget.startsWith(prefix))) {
        return highlightTarget;
    }
    return null;
};

const VISIBLE_STATUS_TOKENS = [
    { id: 'burn', image: TOKEN_IMAGES.burn, labelKey: 'tokens.burn' },
    { id: 'daze', image: TOKEN_IMAGES.daze, labelKey: 'tokens.daze' },
    { id: 'weak', image: TOKEN_IMAGES.weak, labelKey: 'tokens.weak' },
    { id: 'cripple', image: TOKEN_IMAGES.cripple, labelKey: 'tokens.cripple' },
    { id: 'rot', image: TOKEN_IMAGES.rot, labelKey: 'tokens.rot' },
    { id: 'stun', image: TOKEN_IMAGES.stun, labelKey: 'tokens.stun' },
    { id: 'sleep', image: TOKEN_IMAGES.sleep, labelKey: 'tokens.sleep' },
] as const;

type VisibleStatusTokenId = (typeof VISIBLE_STATUS_TOKENS)[number]['id'];

const MAGE_WARS_LIFE_BADGE_CONTAINER_STYLE = {
    containerType: 'inline-size',
} as CSSProperties;

const MAGE_WARS_LIFE_BADGE_STYLE: CSSProperties = {
    fontSize: 'clamp(12px, 18cqw, 24px)',
    lineHeight: 0.95,
    paddingInline: '0.18em',
    paddingBlock: '0.04em',
    boxShadow: '0 2px 8px rgba(0,0,0,0.65)',
    textShadow: '0 1px 3px rgba(0,0,0,0.9)',
};

const getVisibleStatusTokenLabel = (
    t: ReturnType<typeof useTranslation>['t'],
    statusTokenId: VisibleStatusTokenId,
) => {
    switch (statusTokenId) {
        case 'burn': return t('tokens.burn');
        case 'daze': return t('tokens.daze');
        case 'weak': return t('tokens.weak');
        case 'cripple': return t('tokens.cripple');
        case 'rot': return t('tokens.rot');
        case 'stun': return t('tokens.stun');
        case 'sleep': return t('tokens.sleep');
    }
};

const SPELL_CARD_BACK = 'mage-wars/cards/backs/spell-card-back';
const SPELL_CARD_BACK_ASPECT_RATIO = 992 / 1391;

function resolvePhaseAdvanceActionLabelKey(phase: MageWarsPhase): string {
    switch (phase) {
        case 'reset':
            return 'actions.advanceReset';
        case 'channel':
            return 'actions.advanceChannel';
        case 'upkeep':
            return 'actions.advanceUpkeep';
        case 'planning':
            return 'actions.passPlanning';
        case 'deployment':
            return 'actions.passDeployment';
        case 'initiativeQuickcast':
        case 'finalQuickcast':
            return 'actions.passQuickcast';
        case 'creatureAction':
            return 'actions.endAction';
    }
}

const CAST_PHASES = new Set(['deployment', 'initiativeQuickcast', 'creatureAction', 'finalQuickcast']);
const SIMULTANEOUS_PREPARATION_PHASES = new Set(['reset', 'channel', 'upkeep', 'planning']);

type SpellbookCategoryId = 'all' | 'attack' | 'enchantment' | 'creature' | 'incantation' | 'equipment';

type FieldCardRole = 'source' | 'target';

const ZONE_LOOSE_ENTITY_HEIGHT_CLASS = 'h-[clamp(13rem,19.25vh,16rem)]';
const ZONE_PACKED_ENTITY_HEIGHT_CLASS = 'h-[clamp(9.5rem,14.075vh,13rem)]';

type PendingObjectAbilitySelection = {
    objectId: string;
    abilityId: MageWarsObjectAbilityId;
};
type PendingMageAbilitySelection = {
    playerId: PlayerId;
    abilityId: MageWarsMageAbilityId;
};
type PendingSpellCastSelection =
    | { kind: 'object'; objectId: string; chainTargetObjectIds: string[] }
    | { kind: 'player'; playerId: PlayerId };

const MAGE_WARS_OBJECT_ABILITY_ID_LIST = Object.values(MAGE_WARS_OBJECT_ABILITY_IDS) as MageWarsObjectAbilityId[];

function cx(...classes: Array<string | false | null | undefined>): string {
    return classes.filter(Boolean).join(' ');
}

function escapeCssAttributeValue(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function CardInspectButton({
    title,
    sourceCardId,
    compact = false,
    onInspect,
}: {
    title: string;
    sourceCardId?: number;
    compact?: boolean;
    onInspect: () => void;
}) {
    const { t } = useTranslation('game-mage-wars');
    const referenceButtonStyle: CSSProperties | undefined = compact
        ? undefined
        : {
            width: MAGE_WARS_REFERENCE_INSPECT_BUTTON_SIZE,
            height: MAGE_WARS_REFERENCE_INSPECT_BUTTON_SIZE,
        };
    const referenceIconStyle: CSSProperties | undefined = compact
        ? undefined
        : {
            width: MAGE_WARS_REFERENCE_INSPECT_ICON_SIZE,
            height: MAGE_WARS_REFERENCE_INSPECT_ICON_SIZE,
        };
    return (
        <button
            type="button"
            className={cx(
                'pointer-events-auto absolute right-1 top-1 z-40 grid place-items-center rounded-full border border-amber-100/55 bg-black/74 text-amber-50 shadow-[0_6px_14px_rgba(0,0,0,0.5)] transition hover:border-amber-100 hover:bg-amber-300 hover:text-stone-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-100',
                compact && 'h-5 w-5',
            )}
            style={referenceButtonStyle}
            data-testid="mage-wars-card-inspect-button"
            data-source-card-id={sourceCardId}
            data-browse-inspectable="true"
            data-secondary-inspect="true"
            aria-label={t('ui.inspectCardAria', { name: title })}
            title={t('ui.inspectCardTitle')}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onInspect();
            }}
        >
            <ZoomIn aria-hidden="true" className={compact ? 'h-3 w-3' : undefined} style={referenceIconStyle} strokeWidth={2.3} />
        </button>
    );
}

function TokenImage({
    src,
    alt,
    className,
}: {
    src: string;
    alt: string;
    className?: string;
}) {
    return (
        <OptimizedImage
            src={src}
            alt={alt}
            className={cx('object-contain drop-shadow-[0_8px_18px_rgba(0,0,0,0.45)]', className)}
            placeholder={false}
        />
    );
}

function EntityStatusTokenRail({
    guarding,
    actionReady,
    quickcastReady,
    statusTokens,
    compact = false,
}: {
    guarding?: boolean;
    actionReady?: boolean;
    quickcastReady?: boolean;
    statusTokens: MageWarsArenaObjectState['statusTokens'] | MageWarsPlayerState['statusTokens'];
    compact?: boolean;
}) {
    const { t } = useTranslation('game-mage-wars');
    const visibleStatusTokens = VISIBLE_STATUS_TOKENS
        .map(({ id, image }) => ({
            id,
            image,
            count: statusTokens[id] ?? 0,
        }))
        .filter((token) => token.count > 0);

    const hasActionToken = actionReady !== undefined;
    const hasQuickcastToken = quickcastReady !== undefined;
    const hasTokenRail = Boolean(hasActionToken || hasQuickcastToken || guarding || visibleStatusTokens.length > 0);
    if (!hasTokenRail) return null;

    const tokenSizeClass = compact ? 'h-6 w-6' : 'h-7 w-7';
    const renderActionToken = (position: string) => (hasActionToken ? (
        <span
            className={cx(
                'grid place-items-center rounded-full',
                tokenSizeClass,
            )}
            data-testid="mage-wars-action-token-slot"
            data-token-kind="action"
            data-action-token-state={actionReady ? 'ready' : 'spent'}
            data-action-token-image-key={actionReady ? TOKEN_IMAGES.actionReady : TOKEN_IMAGES.actionSpent}
            data-action-token-position={position}
        >
            <TokenImage
                src={actionReady ? TOKEN_IMAGES.actionReady : TOKEN_IMAGES.actionSpent}
                alt={t(actionReady ? 'tokens.actionReady' : 'tokens.actionSpent')}
                className="h-full w-full"
            />
        </span>
    ) : null);
    const renderQuickcastToken = (position: string) => (hasQuickcastToken ? (
        <span
            className={cx(
                'grid place-items-center rounded-full',
                tokenSizeClass,
            )}
            data-testid="mage-wars-quickcast-token-slot"
            data-token-kind="quickcast"
            data-quickcast-token-state={quickcastReady ? 'ready' : 'spent'}
            data-quickcast-token-image-key={quickcastReady ? TOKEN_IMAGES.quickcastReady : TOKEN_IMAGES.quickcastSpent}
            data-quickcast-token-position={position}
        >
            <TokenImage
                src={quickcastReady ? TOKEN_IMAGES.quickcastReady : TOKEN_IMAGES.quickcastSpent}
                alt={t(quickcastReady ? 'tokens.quickcastReady' : 'tokens.quickcastSpent')}
                className="h-full w-full"
            />
        </span>
    ) : null);
    const renderGuardToken = (position: string) => (guarding ? (
        <span
            className={cx(
                'flex items-center justify-center',
                tokenSizeClass,
            )}
            data-testid="mage-wars-guard-token-slot"
            data-guard-token-position={position}
        >
            <TokenImage src={TOKEN_IMAGES.guard} alt={t('tokens.guard')} className={compact ? 'h-5 w-5' : 'h-6 w-6'} />
        </span>
    ) : null);
    const statusTokenRow = visibleStatusTokens.length > 0 ? (
        <span
            className="flex flex-col items-center gap-0.5"
            data-testid="mage-wars-status-token-row"
        >
            {visibleStatusTokens.map(({ id, image, count }) => (
                <span
                    key={id}
                    className="inline-flex min-h-7 min-w-7 items-center justify-center gap-0.5 rounded-full bg-black/62 px-1 py-0.5 text-[0.62rem] font-bold text-amber-50 shadow-[0_4px_12px_rgba(0,0,0,0.38)]"
                >
                    <TokenImage src={image} alt={getVisibleStatusTokenLabel(t, id)} className="h-5 w-5" />
                    {count > 1 ? count : null}
                </span>
            ))}
        </span>
    ) : null;

    return (
        <div className={cx(
            'pointer-events-none absolute left-1 top-1/2 z-40 flex -translate-y-1/2 flex-col items-center justify-start gap-0.5',
            compact && 'origin-left scale-[0.86]',
        )}
            data-testid="mage-wars-entity-status-token-rail"
            data-token-rail-position="entity-left-inside-midline"
            data-token-rail-axis="vertical"
            data-token-rail-placement="inside"
            data-token-rail-layout="stack"
        >
            {renderActionToken('entity-left-inside-midline')}
            {renderQuickcastToken('entity-left-inside-midline')}
            {renderGuardToken('entity-left-inside-midline')}
            {statusTokenRow}
        </div>
    );
}

function MageWarsLifeDamageReadout({
    damage,
    life,
    testId,
    showLifeTotals,
}: {
    damage: number;
    life: number;
    testId: string;
    showLifeTotals: boolean;
}) {
    if (life <= 0) return null;

    const remaining = Math.max(0, life - damage);
    const damageRatio = Math.min(1, Math.max(0, damage / life));

    return (
        <div
            aria-hidden="true"
            className={cx(
                'pointer-events-none absolute inset-0 z-20 flex items-center justify-end pr-[8%] transition-opacity',
                showLifeTotals ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
            )}
            data-testid={testId}
            data-damage={damage}
            data-life={life}
            data-life-remaining={remaining}
            data-life-visible={showLifeTotals ? 'true' : 'false'}
            data-life-readout-position="entity-right-midline"
            data-damage-ratio={damageRatio.toFixed(3)}
            style={MAGE_WARS_LIFE_BADGE_CONTAINER_STYLE}
        >
            <span
                className={cx(
                    'rounded font-bold',
                    damage > 0 ? 'bg-red-900/80 text-red-200' : 'bg-black/60 text-white',
                )}
                data-testid={`${testId}-text`}
                style={MAGE_WARS_LIFE_BADGE_STYLE}
            >
                {remaining}/{life}
            </span>
        </div>
    );
}

function MageWarsLifeVisibilityIcon() {
    return (
        <svg
            aria-hidden="true"
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
        >
            <path
                d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
        </svg>
    );
}

function MageWarsObservePlayerButton({
    observed,
    onObserve,
}: {
    observed: boolean;
    onObserve: () => void;
}) {
    const { t } = useTranslation('game-mage-wars');
    const label = observed ? t('ui.backToSelfView') : t('ui.observeOpponentPublicView');

    return (
        <button
            type="button"
            className={cx(
                'pointer-events-auto absolute left-1 top-1 z-40 grid h-7 w-7 place-items-center rounded-full border text-amber-50 shadow-[0_6px_14px_rgba(0,0,0,0.5)] transition hover:border-amber-100 hover:bg-amber-300 hover:text-stone-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-100',
                observed
                    ? 'border-amber-200 bg-amber-400 text-stone-950 shadow-[0_0_16px_rgba(251,191,36,0.48)]'
                    : 'border-amber-100/55 bg-black/74',
            )}
            aria-label={label}
            aria-pressed={observed}
            title={label}
            data-testid="mage-wars-observe-player-button"
            data-tutorial-id="mw-opponent-view-toggle"
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onObserve();
            }}
        >
            <MageWarsLifeVisibilityIcon />
        </button>
    );
}

function MageWarsLifeToggle({
    pressed,
    onToggle,
    className,
    style,
}: {
    pressed: boolean;
    onToggle: () => void;
    className?: string;
    style?: CSSProperties;
}) {
    const { t } = useTranslation('game-mage-wars');
    const label = t(pressed ? 'ui.hideAllLifeTotals' : 'ui.showAllLifeTotals');

    return (
        <button
            type="button"
            className={cx(
                'pointer-events-auto absolute z-30 flex h-10 w-10 items-center justify-center rounded-lg border text-white shadow-lg transition-[background-color,border-color,box-shadow] duration-150 focus:outline-none focus:ring-2 focus:ring-amber-200/80',
                pressed
                    ? 'border-amber-300/70 bg-amber-500/80 shadow-[0_0_14px_rgba(245,158,11,0.45)]'
                    : 'border-white/20 bg-black/70 hover:border-amber-300/60 hover:bg-slate-800/90',
                className,
            )}
            aria-label={label}
            aria-pressed={pressed}
            title={label}
            data-testid="mage-wars-life-toggle"
            data-tutorial-id="mw-life-toggle"
            data-life-visible={pressed ? 'true' : 'false'}
            style={style}
            onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onToggle();
            }}
        >
            <MageWarsLifeVisibilityIcon />
        </button>
    );
}

type MageHudStatKind = 'life' | 'mana' | 'channeling';
type MageHudIconTooltipSide = 'left' | 'right';

const MAGE_WARS_HUD_MANA_PROGRESS_MAX = 20;
const MAGE_WARS_HUD_CHANNELING_PROGRESS_MAX = 12;

function clampPercent(value: number): number {
    return Math.max(0, Math.min(100, value));
}

function MageHudStatGlyph({ stat, className }: { stat: MageHudStatKind; className?: string }) {
    const sharedProps: SVGProps<SVGSVGElement> = {
        className,
        viewBox: '0 0 24 24',
        'aria-hidden': true,
    };

    if (stat === 'life') {
        return (
            <svg {...sharedProps} data-stat-glyph-kind="vital-heart">
                <path
                    d="M12 21.15c-.34-.28-.81-.64-1.36-1.06C6.18 16.68 3 13.73 3 9.84 3 6.9 5.2 4.75 8.17 4.75c1.46 0 2.84.68 3.83 1.86.99-1.18 2.37-1.86 3.83-1.86C18.8 4.75 21 6.9 21 9.84c0 3.89-3.18 6.84-7.64 10.25-.55.42-1.02.78-1.36 1.06Z"
                    fill="currentColor"
                />
                <path
                    d="M6.15 12.15h3.08l1.16-2.46 2.32 4.92 1.16-2.46h3.98"
                    fill="none"
                    stroke="rgba(0,0,0,0.62)"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.65"
                />
            </svg>
        );
    }

    if (stat === 'mana') {
        return (
            <svg {...sharedProps} data-stat-glyph-kind="mana-crystal">
                <path
                    d="M12 1.9 20.35 9.2 12 22.2 3.65 9.2 12 1.9Z"
                    fill="currentColor"
                />
                <path
                    d="M12 1.9v20.3M3.65 9.2h16.7M7.65 9.2 12 1.9l4.35 7.3M7.65 9.2 12 22.2l4.35-13"
                    fill="none"
                    stroke="rgba(0,0,0,0.48)"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.15"
                />
            </svg>
        );
    }

    return (
        <svg {...sharedProps} data-stat-glyph-kind="channel-rune">
            <path
                d="M12.55 1.95 6.85 13h4.25l-1.65 9.05 7.7-12.45h-4.5l-.1-7.65Z"
                fill="currentColor"
            />
            <path
                d="M5.15 7.25a8.4 8.4 0 0 1 13.7 0M3.65 12a8.35 8.35 0 0 0 2.62 6.1M20.35 12a8.35 8.35 0 0 1-2.62 6.1"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.9"
            />
        </svg>
    );
}

function MageHudStatIcon({
    stat,
    label,
    value,
    max,
    activeClassName,
    compact = false,
    tooltipSide = 'right',
}: {
    stat: MageHudStatKind;
    label: string;
    value: number;
    max: number;
    activeClassName: string;
    compact?: boolean;
    tooltipSide?: MageHudIconTooltipSide;
}) {
    const tooltipId = useId();
    const iconRef = useRef<HTMLDivElement | null>(null);
    const [pointerHovering, setPointerHovering] = useState(false);
    const fillPercent = clampPercent(max > 0 ? (value / max) * 100 : 0);
    const clipTopPercent = 100 - fillPercent;
    const tooltipText = `${label}: ${value}/${max}`;

    useLayoutEffect(() => {
        if (typeof window === 'undefined') return undefined;

        const updatePointerHovering = (clientX: number, clientY: number) => {
            const rect = iconRef.current?.getBoundingClientRect();
            const hovering = Boolean(
                rect
                && clientX >= rect.left
                && clientX <= rect.right
                && clientY >= rect.top
                && clientY <= rect.bottom,
            );
            setPointerHovering((current) => (current === hovering ? current : hovering));
        };
        const handlePointerMove = (event: PointerEvent) => {
            updatePointerHovering(event.clientX, event.clientY);
        };
        const clearPointerHovering = () => {
            setPointerHovering(false);
        };

        window.addEventListener('pointermove', handlePointerMove, { passive: true });
        window.addEventListener('pointerleave', clearPointerHovering);
        window.addEventListener('blur', clearPointerHovering);

        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerleave', clearPointerHovering);
            window.removeEventListener('blur', clearPointerHovering);
        };
    }, []);

    return (
        <div
            ref={iconRef}
            className={cx(
                'group pointer-events-none relative grid place-items-start overflow-visible focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-100',
                compact
                    ? 'h-9 w-9'
                    : 'h-[var(--mage-wars-hud-icon-size,3.75rem)] w-[var(--mage-wars-hud-icon-size,3.75rem)]',
            )}
            data-testid="mage-wars-mage-hud-stat-icon"
            data-hud-icon-frame="none"
            data-hud-icon-tooltip-trigger="hover-focus"
            data-hud-hit-surface="visual-pass-through"
            data-stat={stat}
            data-stat-value={value}
            data-stat-max={max}
            data-fill-percent={fillPercent.toFixed(2)}
            title={tooltipText}
            aria-label={tooltipText}
            aria-describedby={tooltipId}
            role="img"
            tabIndex={0}
        >
            <MageHudStatGlyph
                stat={stat}
                className={cx(
                    'absolute inset-0 h-full w-full text-stone-500/64 drop-shadow-[0_2px_5px_rgba(0,0,0,0.52)]',
                    compact && 'text-stone-500/66',
                )}
            />
            <span
                className="pointer-events-none absolute inset-0 overflow-hidden"
                style={{ clipPath: `inset(${clipTopPercent}% 0 0 0)` }}
                data-testid="mage-wars-mage-hud-stat-icon-fill"
                data-stat={stat}
            >
                <MageHudStatGlyph
                    stat={stat}
                    className={cx(
                        'h-full w-full drop-shadow-[0_0_10px_rgba(255,255,255,0.28)]',
                        activeClassName,
                    )}
                />
            </span>
            <span
                className={cx(
                    'pointer-events-none absolute inset-0 grid place-items-center font-black leading-none text-white tabular-nums drop-shadow-[0_2px_4px_rgba(0,0,0,0.92)]',
                    compact ? 'text-[0.86rem]' : 'text-[1.26rem]',
                )}
                style={{
                    WebkitTextStroke: compact ? '0.65px rgba(0,0,0,0.78)' : '0.8px rgba(0,0,0,0.78)',
                    textShadow: '0 2px 4px rgba(0,0,0,0.92), 0 0 8px rgba(0,0,0,0.82)',
                }}
                data-testid="mage-wars-mage-hud-stat-value"
                data-stat={stat}
            >
                {value}
            </span>
            <span
                id={tooltipId}
                className={cx(
                    'pointer-events-none absolute top-1/2 z-30 -translate-y-1/2 whitespace-nowrap rounded-md border border-amber-100/25 bg-stone-950/94 px-2 py-1 text-[0.72rem] font-bold leading-none text-amber-50 shadow-[0_8px_18px_rgba(0,0,0,0.56)] transition-opacity duration-150 group-focus-visible:opacity-100',
                    pointerHovering ? 'opacity-100' : 'opacity-0',
                    tooltipSide === 'right'
                        ? 'left-full ml-2 text-left'
                        : 'right-full mr-2 text-right',
                )}
                data-testid="mage-wars-mage-hud-icon-tooltip"
                data-tooltip-owner={stat}
            >
                {tooltipText}
            </span>
        </div>
    );
}

function MageHudIconRail({
    player,
    visualDamage = player.damage,
    compact = false,
    tooltipSide = 'right',
}: {
    player: MageWarsPlayerState;
    visualDamage?: number;
    compact?: boolean;
    tooltipSide?: MageHudIconTooltipSide;
}) {
    const { t } = useTranslation('game-mage-wars');
    const lifeRemaining = Math.max(0, player.life - visualDamage);

    return (
        <div
            className={cx(
                'pointer-events-none flex flex-col items-start justify-start',
                compact ? 'gap-1.5' : 'gap-[var(--mage-wars-hud-icon-gap,0.28rem)]',
            )}
            data-testid="mage-wars-mage-hud-icon-rail"
            data-hud-icon-rail-align="left"
        >
            <MageHudStatIcon
                stat="life"
                label={t('stats.life')}
                value={lifeRemaining}
                max={player.life}
                activeClassName="text-rose-300"
                compact={compact}
                tooltipSide={tooltipSide}
            />
            <MageHudStatIcon
                stat="mana"
                label={t('stats.mana')}
                value={player.mana}
                max={MAGE_WARS_HUD_MANA_PROGRESS_MAX}
                activeClassName="text-cyan-200"
                compact={compact}
                tooltipSide={tooltipSide}
            />
            <MageHudStatIcon
                stat="channeling"
                label={t('stats.channeling')}
                value={player.channeling}
                max={MAGE_WARS_HUD_CHANNELING_PROGRESS_MAX}
                activeClassName="text-amber-100"
                compact={compact}
                tooltipSide={tooltipSide}
            />
        </div>
    );
}

function MageHud({
    player,
    current,
    self,
    role,
    compact = false,
    layout = 'vertical',
    visualDamage = player.damage,
    onInspect,
    onObserve,
    observed = false,
}: {
    player: MageWarsPlayerState;
    current: boolean;
    self: boolean;
    role?: 'source' | 'target';
    compact?: boolean;
    layout?: 'vertical' | 'horizontal';
    visualDamage?: number;
    onInspect?: () => void;
    onObserve?: () => void;
    observed?: boolean;
}) {
    const { t } = useTranslation('game-mage-wars');
    const mageLabel = getMageDisplayLabel(player);
    const mageHintCardAspectRatio = getMageWarsMagePreviewAspectRatio();
    const fullHintCardStyle: CSSProperties = {
        height: MAGE_WARS_HUD_HINT_CARD_HEIGHT_CSS_VAR,
        width: `calc(${MAGE_WARS_HUD_HINT_CARD_HEIGHT_CSS_VAR} * ${mageHintCardAspectRatio.toFixed(6)})`,
    };
    const compactHintCardStyle: CSSProperties = {
        height: `${MAGE_WARS_HUD_COMPACT_HINT_CARD_HEIGHT_REM}rem`,
        width: `${(MAGE_WARS_HUD_COMPACT_HINT_CARD_HEIGHT_REM * mageHintCardAspectRatio).toFixed(3)}rem`,
    };
    if (!compact) {
        const hintCard = (
            <div
                className="pointer-events-none relative flex-none rounded-[0.2rem]"
                style={fullHintCardStyle}
                data-testid="mage-wars-mage-hud-hint-card"
                data-mage-preview-kind="card"
                data-mage-ui-role="player-hint-card"
                data-hud-hit-surface="visual-pass-through"
                aria-label={mageLabel}
                title={mageLabel}
            >
                <CardPreview
                    previewRef={getMageWarsMagePreviewRef(player.mageId, 'card')}
                    className="pointer-events-none h-full w-full rounded-[0.2rem] shadow-[0_12px_28px_rgba(0,0,0,0.52)]"
                    title={mageLabel}
                    alt={mageLabel}
                />
                <div
                    className="pointer-events-none absolute left-2 top-2 z-10 rounded-full bg-black/72 px-2.5 py-1 text-[0.78rem] font-black leading-none text-stone-50 shadow-[0_6px_16px_rgba(0,0,0,0.46)]"
                    data-testid="mage-wars-mage-hud-name-badge"
                    data-mage-label={mageLabel}
                >
                    {mageLabel}
                </div>
                {onInspect ? (
                    <CardInspectButton title={mageLabel} onInspect={onInspect} />
                ) : null}
                {!self && onObserve ? (
                    <MageWarsObservePlayerButton observed={observed} onObserve={onObserve} />
                ) : null}
                {current ? (
                    <div
                        className="absolute bottom-2 left-2 z-10 inline-flex items-center gap-1.5 rounded-full bg-black/72 px-2 py-1 text-[0.68rem] font-black leading-none text-amber-100 shadow-[0_6px_16px_rgba(0,0,0,0.46)]"
                        data-testid="mage-wars-mage-hud-current-badge"
                    >
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-200 shadow-[0_0_8px_rgba(252,211,77,0.7)]" aria-hidden="true" />
                        {t('player.active')}
                    </div>
                ) : null}
                {role ? (
                    <span
                        className={cx(
                            'pointer-events-none absolute inset-0 z-10 rounded-[inherit] border shadow-[inset_0_0_0_1px_rgba(251,191,36,0.24),0_0_18px_rgba(251,191,36,0.28)]',
                            role === 'source'
                                ? 'border-cyan-200/90 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.22),0_0_18px_rgba(34,211,238,0.4)]'
                                : 'border-emerald-300/95 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.24),0_0_18px_rgba(16,185,129,0.42)]',
                        )}
                        data-testid={`mage-wars-mage-hud-${role}-frame`}
                        data-mage-hud-role={role}
                    />
                ) : null}
            </div>
        );
        const iconRail = <MageHudIconRail player={player} visualDamage={visualDamage} tooltipSide={self ? 'right' : 'left'} />;

        return (
            <section
                className={cx(
                    'pointer-events-none relative flex items-start gap-[var(--mage-wars-hud-icon-rail-gap,0.38rem)] text-left text-stone-100',
                    self ? 'justify-start' : 'justify-end',
                )}
                style={{
                    width: 'max-content',
                    maxWidth: 'var(--mage-wars-desktop-hud-width, 23.25rem)',
                    marginLeft: self ? undefined : 'auto',
                }}
                data-testid={self ? 'mage-wars-mage-hud-self' : 'mage-wars-mage-hud-opponent'}
                data-tutorial-id={self ? 'mw-self-hud' : 'mw-opponent-hud'}
                data-mage-wars-hud-density="full"
                data-mage-wars-hud-layout={layout}
                aria-label={`${self ? t('player.you') : t('player.opponent')} ${mageLabel}`}
            >
                {hintCard}
                {iconRail}
            </section>
        );
    }

    return (
        <section
            className={cx(
                'relative inline-flex items-start gap-1.5 rounded-[0.35rem] bg-gradient-to-r from-black/70 via-black/38 to-transparent p-1.5',
                current && 'before:absolute before:bottom-2 before:left-0 before:top-2 before:w-1 before:rounded-r-full before:bg-amber-300/80',
            )}
            data-testid={self ? 'mage-wars-mage-hud-self' : 'mage-wars-mage-hud-opponent'}
            data-tutorial-id={self ? 'mw-self-hud' : 'mw-opponent-hud'}
            data-mage-wars-hud-density={compact ? 'compact' : 'full'}
            aria-label={`${self ? t('player.you') : t('player.opponent')} ${mageLabel}`}
        >
            <div
                className="pointer-events-none relative flex-none rounded-[0.2rem]"
                style={compactHintCardStyle}
                data-testid="mage-wars-mage-hud-hint-card"
                data-mage-preview-kind="card"
                data-mage-ui-role="player-hint-card"
                data-hud-hit-surface="visual-pass-through"
                aria-label={mageLabel}
                title={mageLabel}
            >
                <CardPreview
                    previewRef={getMageWarsMagePreviewRef(player.mageId, 'card')}
                    className="pointer-events-none h-full w-full rounded-[0.2rem] shadow-[0_8px_22px_rgba(0,0,0,0.48)]"
                    title={mageLabel}
                    alt={mageLabel}
                />
                <div
                    className="pointer-events-none absolute left-1 top-1 z-10 rounded-full bg-black/72 px-1.5 py-0.5 text-[0.58rem] font-black leading-none text-stone-50 shadow-[0_4px_12px_rgba(0,0,0,0.42)]"
                    data-testid="mage-wars-mage-hud-name-badge"
                    data-mage-label={mageLabel}
                >
                    {mageLabel}
                </div>
                {onInspect ? (
                    <CardInspectButton title={mageLabel} compact onInspect={onInspect} />
                ) : null}
                {!self && onObserve ? (
                    <MageWarsObservePlayerButton observed={observed} onObserve={onObserve} />
                ) : null}
                {current ? (
                    <div
                        className="absolute bottom-1 left-1 z-10 inline-flex items-center gap-1 rounded-full bg-black/72 px-1.5 py-0.5 text-[0.54rem] font-black leading-none text-amber-100 shadow-[0_4px_12px_rgba(0,0,0,0.42)]"
                        data-testid="mage-wars-mage-hud-current-badge"
                    >
                        <span className="h-1 w-1 rounded-full bg-amber-200 shadow-[0_0_6px_rgba(252,211,77,0.68)]" aria-hidden="true" />
                        {t('player.active')}
                    </div>
                ) : null}
                {role ? (
                    <span
                        className={cx(
                            'pointer-events-none absolute inset-0 z-10 rounded-[inherit] border shadow-[inset_0_0_0_1px_rgba(251,191,36,0.2),0_0_14px_rgba(251,191,36,0.24)]',
                            role === 'source'
                                ? 'border-amber-200/80'
                                : 'border-emerald-200/85',
                        )}
                        data-testid={`mage-wars-mage-hud-${role}-frame`}
                        data-mage-hud-role={role}
                    />
                ) : null}
            </div>
            <MageHudIconRail player={player} visualDamage={visualDamage} compact tooltipSide={self ? 'right' : 'left'} />
        </section>
    );
}

function PreparedSpellCard({
    cardId,
    hidden,
    label,
    role,
    compact = false,
    testId,
    preparedScope,
    selected = false,
    selectedCount = 0,
    planningDraft = false,
    planSlotIndex,
    copyCount,
    disabled = false,
    onClick,
    onInspect,
    tutorialId,
}: {
    cardId?: number;
    hidden?: boolean;
    label: string;
    role?: 'source';
    compact?: boolean;
    testId?: string;
    preparedScope?: 'self' | 'opponent';
    selected?: boolean;
    selectedCount?: number;
    planningDraft?: boolean;
    planSlotIndex?: number;
    copyCount?: number;
    disabled?: boolean;
    onClick?: () => void;
    onInspect?: () => void;
    tutorialId?: string;
}) {
    const previewRef = cardId == null || hidden ? null : getMageWarsSpellCardPreviewRef(cardId);
    const title = cardId == null ? label : getMageWarsSpellCardName(cardId) ?? label;
    const showLabel = hidden || cardId == null;
    const cardAspectRatio = cardId == null || hidden
        ? SPELL_CARD_BACK_ASPECT_RATIO
        : getMageWarsSpellCardAspectRatio(cardId) ?? SPELL_CARD_BACK_ASPECT_RATIO;
    const cardSizeClass = compact ? 'h-[5.05rem]' : '';
    const cardSizeStyle: CSSProperties = {
        aspectRatio: cardAspectRatio,
        ...(!compact ? { containerType: 'inline-size' as const } : {}),
        ...(!compact ? { height: 'var(--mage-wars-desktop-card-height, 14rem)' } : {}),
    };
    const handleCardClick = onClick ?? onInspect;
    const canInteract = Boolean(handleCardClick);
    const hasSecondaryInspect = Boolean(onClick && onInspect);

    const content = (
        <>
            {previewRef ? (
                <CardPreview
                    previewRef={previewRef}
                    className="h-full w-full rounded-[0.18rem] shadow-[0_10px_24px_rgba(0,0,0,0.5)]"
                    title={title}
                />
            ) : hidden ? (
                <OptimizedImage
                    src={SPELL_CARD_BACK}
                    alt={title}
                    className="h-full w-full rounded-[0.18rem] object-cover shadow-[0_10px_24px_rgba(0,0,0,0.5)]"
                    placeholder={false}
                />
            ) : (
                <div className="h-full w-full rounded-[0.18rem] border border-dashed border-amber-100/22 bg-stone-950/28 shadow-[inset_0_0_30px_rgba(0,0,0,0.35)]" />
            )}
            {showLabel ? (
                <div
                    className={cx(
                        'absolute inset-x-1 bottom-1 rounded-sm bg-black/65 px-1 py-0.5 text-center text-amber-50',
                        compact ? 'text-[0.48rem] leading-none' : 'text-[0.62rem]',
                    )}
                >
                    {hidden ? label : title}
                </div>
            ) : null}
            {selected ? (
                <span
                    className="pointer-events-none absolute inset-0 z-20 rounded-[0.18rem] border-2 border-amber-200 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.22),0_0_18px_rgba(251,191,36,0.5)]"
                    data-testid="mage-wars-selected-card-frame"
                />
            ) : null}
            {copyCount && copyCount > 1 ? (
                <span
                    className="pointer-events-none absolute bottom-1 z-30 rounded-full border border-stone-950/60 bg-stone-950/90 px-2.5 py-1 text-[0.82rem] font-black leading-none text-amber-100 shadow-[0_6px_14px_rgba(0,0,0,0.54)]"
                    data-testid="mage-wars-spellbook-copy-count"
                    style={{ left: '50%', transform: 'translateX(-50%)' }}
                >
                    x{copyCount}
                </span>
            ) : null}
            {role === 'source' ? (
                <span
                    className="pointer-events-none absolute inset-0 z-10 rounded-[0.18rem] border border-amber-200/70 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.18),0_0_14px_rgba(251,191,36,0.32)]"
                    data-testid="mage-wars-prepared-source-frame"
                />
            ) : null}
        </>
    );

    if (canInteract) {
        if (hasSecondaryInspect) {
            return (
                <div className={cx('relative shrink-0 overflow-visible', cardSizeClass)} style={cardSizeStyle}>
                    <button
                        type="button"
                        className={cx(
                            'relative block h-full w-full cursor-pointer text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-100',
                            disabled && !onInspect && 'cursor-not-allowed opacity-45',
                        )}
                        data-testid={testId}
                        data-tutorial-id={tutorialId}
                        data-mage-wars-prepared-card={preparedScope}
                        data-source-card-id={cardId ?? undefined}
                        data-spell-type={cardId == null ? undefined : getMageWarsSpellCardFromConfig(cardId)?.spellType}
                        data-copy-count={copyCount ?? undefined}
                        data-selected-count={selectedCount > 0 ? selectedCount : undefined}
                        data-selected={selected ? 'true' : undefined}
                        data-planning-draft={planningDraft ? 'true' : undefined}
                        data-plan-slot-index={planSlotIndex ?? undefined}
                        data-primary-action="true"
                        data-secondary-inspect="true"
                        disabled={disabled}
                        onClick={(event) => {
                            event.stopPropagation();
                            onClick?.();
                        }}
                        aria-label={title}
                        title={title}
                    >
                        {content}
                    </button>
                    <CardInspectButton
                        title={title}
                        sourceCardId={cardId}
                        compact={compact}
                        onInspect={onInspect!}
                    />
                </div>
            );
        }

        return (
            <button
                type="button"
                className={cx(
                    'relative block shrink-0 cursor-zoom-in text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-100',
                    cardSizeClass,
                    disabled && !onInspect && 'cursor-not-allowed opacity-45',
                    onClick && 'cursor-pointer',
                )}
                style={cardSizeStyle}
                data-testid={testId}
                data-tutorial-id={tutorialId}
                data-mage-wars-prepared-card={preparedScope}
                data-source-card-id={cardId ?? undefined}
                data-spell-type={cardId == null ? undefined : getMageWarsSpellCardFromConfig(cardId)?.spellType}
                data-copy-count={copyCount ?? undefined}
                data-selected-count={selectedCount > 0 ? selectedCount : undefined}
                data-selected={selected ? 'true' : undefined}
                data-planning-draft={planningDraft ? 'true' : undefined}
                data-plan-slot-index={planSlotIndex ?? undefined}
                data-browse-inspectable={onInspect ? 'true' : undefined}
                disabled={!canInteract}
                onClick={(event) => {
                    event.stopPropagation();
                    handleCardClick?.();
                }}
                aria-label={title}
                title={title}
            >
                {content}
            </button>
        );
    }

    return (
        <div
            className={cx('relative shrink-0', cardSizeClass)}
            style={cardSizeStyle}
            data-testid={testId}
            data-tutorial-id={tutorialId}
            data-mage-wars-prepared-card={preparedScope}
            data-source-card-id={cardId ?? undefined}
            data-copy-count={copyCount ?? undefined}
            data-selected-count={selectedCount > 0 ? selectedCount : undefined}
            data-selected={selected ? 'true' : undefined}
            data-planning-draft={planningDraft ? 'true' : undefined}
            data-plan-slot-index={planSlotIndex ?? undefined}
            aria-label={title}
            title={title}
        >
            {content}
        </div>
    );
}

function ZoneFieldCard({
    cardId,
    object,
    role,
    density = 'solo',
    ownerSide,
    tutorialHighlightTarget,
    onClick,
    onInspect,
    visualDamage = object?.damage,
    visualLife,
    visualHeld = false,
    showLifeTotals = false,
    fxAnchorRef,
}: {
    cardId: number;
    object?: MageWarsArenaObjectState;
    role?: FieldCardRole;
    density?: ZoneEntityDensity;
    ownerSide?: SeatOwnerSide;
    tutorialHighlightTarget?: string;
    onClick?: () => void;
    onInspect?: () => void;
    visualDamage?: number;
    visualLife?: number;
    visualHeld?: boolean;
    showLifeTotals?: boolean;
    fxAnchorRef?: (element: HTMLButtonElement | null) => void;
}) {
    const { t } = useTranslation('game-mage-wars');
    const previewRef = getMageWarsSpellCardPreviewRef(cardId);
    const title = object?.name ?? getMageWarsSpellCardName(cardId) ?? t('privateZones.spell');
    const compact = density === 'dense' || density === 'packed';
    const cardHeightClass = density === 'packed'
        ? ZONE_PACKED_ENTITY_HEIGHT_CLASS
        : density === 'dense'
            ? ZONE_LOOSE_ENTITY_HEIGHT_CLASS
            : density === 'duel'
                ? 'h-[8rem]'
                : ZONE_LOOSE_ENTITY_HEIGHT_CLASS;
    const cardAspectRatio = getMageWarsSpellCardAspectRatio(cardId) ?? SPELL_CARD_BACK_ASPECT_RATIO;
    const cardSizeStyle: CSSProperties = { aspectRatio: cardAspectRatio };
    const life = visualLife ?? object?.life ?? 0;
    const damage = visualDamage ?? 0;

    if (!previewRef) return null;
    const handleCardClick = onClick ?? onInspect;
    const hasSecondaryInspect = Boolean(onClick && onInspect);
    const objectTutorialTargetId = object ? `mw-arena-object-${object.id}` : undefined;
    const primaryTutorialId = objectTutorialTargetId && tutorialHighlightTarget === objectTutorialTargetId
        ? objectTutorialTargetId
        : object
            ? `mw-field-object-${object.sourceSpellCardId}`
            : `mw-field-card-${cardId}`;

    const content = (
        <>
            <CardPreview
                previewRef={previewRef}
                className={cx(
                    'h-full w-full rounded-[0.18rem]',
                )}
                title={title}
            />
            <BoardDamageStateOverlay
                damage={damage}
                life={life}
                testId="mage-wars-field-card-damage-overlay"
                showValueBadge={false}
            />
            <MageWarsLifeDamageReadout
                damage={damage}
                life={life}
                testId="mage-wars-field-card-life-readout"
                showLifeTotals={showLifeTotals}
            />
            {object ? (
                <EntityStatusTokenRail
                    guarding={object.guarding}
                    actionReady={object.kind === 'creature' ? object.actionReady : undefined}
                    statusTokens={object.statusTokens}
                    compact={compact}
                />
            ) : null}
            {role === 'target' ? (
                <>
                    <span
                        className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] border-2 border-emerald-300/95 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.36),0_0_12px_rgba(16,185,129,0.42)]"
                        data-testid="mage-wars-field-card-target-frame"
                    />
                </>
            ) : null}
            {role === 'source' ? (
                <span
                    className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] border-2 border-cyan-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.34),0_0_18px_rgba(34,211,238,0.56)]"
                    data-testid="mage-wars-field-card-source-frame"
                />
            ) : null}
        </>
    );

    const primaryButton = (
        <button
            type="button"
            className={cx(
                'group relative block h-full w-full rounded-[0.18rem] text-left shadow-[0_14px_30px_rgba(0,0,0,0.48)] transition-[filter,box-shadow,opacity] duration-150',
                compact && 'shadow-[0_8px_16px_rgba(0,0,0,0.42)]',
                role === 'target' && 'shadow-[0_0_32px_rgba(16,185,129,0.46)]',
                role === 'source' && '-translate-y-2 shadow-[0_0_36px_rgba(34,211,238,0.62)]',
                handleCardClick ? (onClick ? 'cursor-pointer' : 'cursor-zoom-in') : 'pointer-events-none',
                handleCardClick && 'hover:brightness-110 hover:shadow-[0_0_24px_rgba(251,191,36,0.32)]',
            )}
            ref={fxAnchorRef}
            style={cardSizeStyle}
            disabled={!handleCardClick}
            onClick={(event) => {
                event.stopPropagation();
                handleCardClick?.();
            }}
            aria-label={title}
            title={title}
            data-testid="mage-wars-zone-field-card"
            data-tutorial-id={primaryTutorialId}
            data-tutorial-object-id={objectTutorialTargetId}
            data-object-id={object?.id}
            data-source-card-id={cardId}
            data-owner-side={ownerSide}
            data-field-card-role={role}
            data-visual-damage={visualDamage ?? 0}
            data-visual-held={visualHeld ? 'true' : undefined}
            data-action-ready={object ? String(object.actionReady) : undefined}
            data-action-token-state={object?.kind === 'creature' ? (object.actionReady ? 'ready' : 'spent') : undefined}
            data-browse-inspectable={onInspect ? 'true' : undefined}
            data-secondary-inspect={hasSecondaryInspect ? 'true' : undefined}
            data-primary-action={onClick ? 'true' : undefined}
        >
            {object ? (
                <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0"
                />
            ) : null}
            {content}
        </button>
    );

    return (
        <div className={cx('relative z-20 shrink-0 overflow-visible', cardHeightClass)} style={cardSizeStyle}>
            {primaryButton}
            {hasSecondaryInspect ? (
                <CardInspectButton
                    title={title}
                    sourceCardId={cardId}
                    compact={compact}
                    onInspect={onInspect!}
                />
            ) : null}
        </div>
    );
}

function ArenaAttachmentCard({
    object,
    role,
    density = 'solo',
    ownerSide,
    onClick,
    onInspect,
    fxAnchorRef,
}: {
    object: MageWarsArenaObjectState;
    role?: FieldCardRole;
    density?: ZoneEntityDensity;
    ownerSide?: SeatOwnerSide;
    onClick?: () => void;
    onInspect?: () => void;
    fxAnchorRef?: (element: HTMLElement | null) => void;
}) {
    const { t } = useTranslation('game-mage-wars');
    const previewRef = getMageWarsSpellCardPreviewRef(object.sourceSpellCardId);
    const title = object.name ?? getMageWarsSpellCardName(object.sourceSpellCardId) ?? t('privateZones.spell');
    const heightClass = density === 'packed'
        ? 'h-8'
        : density === 'dense'
            ? 'h-10'
            : density === 'duel'
                ? 'h-12'
                : 'h-14';
    const cardAspectRatio = getMageWarsSpellCardAspectRatio(object.sourceSpellCardId) ?? SPELL_CARD_BACK_ASPECT_RATIO;
    const cardSizeStyle: CSSProperties = { aspectRatio: cardAspectRatio };

    if (!previewRef) return null;
    const handleCardClick = onClick ?? onInspect;
    const hasSecondaryInspect = Boolean(onClick && onInspect);

    const content = (
        <>
            <CardPreview
                previewRef={previewRef}
                className={cx(
                    'h-full w-full rounded-[0.12rem]',
                    object.kind === 'equipment' ? 'ring-1 ring-sky-200/75' : 'ring-1 ring-violet-200/75',
                )}
                title={title}
            />
            {role === 'target' ? (
                <span
                    className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] border border-emerald-200/95 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.34),0_0_12px_rgba(16,185,129,0.42)]"
                    data-testid="mage-wars-attachment-target-frame"
                />
            ) : null}
            {role === 'source' ? (
                <span
                    className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] border border-cyan-100/90 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.32),0_0_12px_rgba(34,211,238,0.44)]"
                    data-testid="mage-wars-attachment-source-frame"
                />
            ) : null}
        </>
    );

    const className = cx(
        'relative block h-full w-full rounded-[0.16rem] text-left shadow-[0_7px_14px_rgba(0,0,0,0.48)]',
        role === 'target' && 'shadow-[0_0_18px_rgba(16,185,129,0.45)]',
        role === 'source' && 'shadow-[0_0_18px_rgba(34,211,238,0.52)]',
        handleCardClick ? (onClick ? 'cursor-pointer' : 'cursor-zoom-in') : 'pointer-events-none',
    );

    const dataProps = {
        'data-testid': 'mage-wars-attached-card',
        'data-object-id': object.id,
        'data-source-card-id': object.sourceSpellCardId,
        'data-owner-side': ownerSide,
        'data-attachment-kind': object.kind,
        'data-attachment-role': role,
        'data-browse-inspectable': onInspect ? 'true' : undefined,
        'data-secondary-inspect': hasSecondaryInspect ? 'true' : undefined,
    };

    if (handleCardClick) {
        const primaryButton = (
            <button
                type="button"
                className={className}
                ref={fxAnchorRef as (element: HTMLButtonElement | null) => void}
                onClick={(event) => {
                    event.stopPropagation();
                    handleCardClick();
                }}
                aria-label={title}
                title={title}
                style={cardSizeStyle}
                {...dataProps}
            >
                {content}
            </button>
        );

        return (
            <div className={cx('relative shrink-0 overflow-visible', heightClass)} style={cardSizeStyle}>
                {primaryButton}
                {hasSecondaryInspect ? (
                    <CardInspectButton
                        title={title}
                        sourceCardId={object.sourceSpellCardId}
                        compact
                        onInspect={onInspect!}
                    />
                ) : null}
            </div>
        );
    }

    return (
        <div
            className={cx('relative shrink-0 overflow-visible', heightClass)}
            ref={fxAnchorRef as (element: HTMLDivElement | null) => void}
            style={cardSizeStyle}
        >
            <div
                className={className}
                aria-label={title}
                title={title}
                {...dataProps}
            >
                {content}
            </div>
        </div>
    );
}

function ArenaAttachmentStrip({
    objects,
    density = 'solo',
    hostKind,
    ownerSide,
    selectedObjectId,
    shouldShowSelectedAbilityActionDock = false,
    getRole,
    getOnClick,
    getOnInspect,
    getFxAnchorRef,
}: {
    objects: MageWarsArenaObjectState[];
    density?: ZoneEntityDensity;
    hostKind: 'mage' | 'object' | 'zone';
    ownerSide?: SeatOwnerSide;
    selectedObjectId?: string | null;
    shouldShowSelectedAbilityActionDock?: boolean;
    getRole: (object: MageWarsArenaObjectState) => FieldCardRole | undefined;
    getOnClick: (object: MageWarsArenaObjectState) => (() => void) | undefined;
    getOnInspect?: (object: MageWarsArenaObjectState) => (() => void) | undefined;
    getFxAnchorRef?: (object: MageWarsArenaObjectState) => (element: HTMLElement | null) => void;
}) {
    if (objects.length === 0) return null;

    return (
        <div
            className={cx(
                'pointer-events-auto absolute z-30 flex gap-1',
                hostKind === 'mage' && '-right-3 top-1 flex-col items-end',
                hostKind === 'object' && '-right-3 -top-2 flex-col items-end',
                hostKind === 'zone' && 'right-1 top-1 flex-row items-start',
            )}
            data-testid={`mage-wars-${hostKind}-attachment-strip`}
        >
            {objects.map((object) => (
                <div
                    key={object.id}
                    className={cx(
                        'relative shrink-0',
                        selectedObjectId === object.id && shouldShowSelectedAbilityActionDock && 'pointer-events-auto z-50',
                    )}
                    data-mage-wars-ability-source={selectedObjectId === object.id && shouldShowSelectedAbilityActionDock
                        ? `object:${object.id}`
                        : undefined}
                >
                    <ArenaAttachmentCard
                        object={object}
                        density={density}
                        role={getRole(object)}
                        ownerSide={ownerSide}
                        onClick={getOnClick(object)}
                        onInspect={getOnInspect?.(object)}
                        fxAnchorRef={getFxAnchorRef?.(object)}
                    />
                </div>
            ))}
        </div>
    );
}

function OpponentPlanMirror({ player, compact = false }: { player: MageWarsPlayerState; compact?: boolean }) {
    const { t } = useTranslation('game-mage-wars');

    if (compact) {
        return (
            <section
                className="pointer-events-auto flex items-center gap-1.5 rounded-[0.35rem] bg-black/34 p-1.5 shadow-[0_8px_20px_rgba(0,0,0,0.32)]"
                data-testid="mage-wars-opponent-prepared-mirror"
                data-tutorial-id="mw-opponent-prepared"
                data-mage-wars-compact="true"
            >
                <div className="flex items-end gap-1">
                    {[0, 1].map((slot) => (
                        <OptimizedImage
                            key={`${player.id}-opponent-plan-compact-${slot}`}
                            src={SPELL_CARD_BACK}
                            alt={t('privateZones.hiddenPrepared')}
                            className="h-12 w-[2.15rem] rounded-[0.12rem] object-cover shadow-[0_6px_14px_rgba(0,0,0,0.45)]"
                            placeholder={false}
                        />
                    ))}
                </div>
                <div className="max-w-[4.7rem] text-[0.58rem] font-semibold leading-tight text-amber-100">
                    {t('privateZones.opponentPlansWithCount', { count: player.preparedSpellSlots })}
                </div>
            </section>
        );
    }

    return (
        <section className="pointer-events-auto flex flex-col items-end gap-3 text-right" data-testid="mage-wars-opponent-prepared-mirror" data-tutorial-id="mw-opponent-prepared">
            <div className="flex items-end gap-1.5">
                {[0, 1].map((slot) => (
                    <OptimizedImage
                        key={`${player.id}-opponent-plan-${slot}`}
                        src={SPELL_CARD_BACK}
                        alt={t('privateZones.hiddenPrepared')}
                        className="h-28 w-[4.95rem] rounded-[0.16rem] object-cover shadow-[0_10px_24px_rgba(0,0,0,0.5)]"
                        placeholder={false}
                    />
                ))}
            </div>
            <div className="pr-0.5 text-[0.68rem] font-semibold leading-tight text-amber-100">
                {t('privateZones.opponentPlansWithCount', { count: player.preparedSpellSlots })}
            </div>
        </section>
    );
}

function DiscardPile({
    player,
    onInspectCard,
    testId = 'mage-wars-discard-pile',
    tutorialId = 'mw-discard',
    ownerRole = 'self',
}: {
    player: MageWarsPlayerState;
    onInspectCard?: (cardId: number, label?: string) => void;
    testId?: string;
    tutorialId?: string;
    ownerRole?: 'self' | 'opponent';
}) {
    const { t } = useTranslation('game-mage-wars');
    const discardSpellCardIds = player.discardSpellCardIds ?? [];
    const topCardId = discardSpellCardIds[0];
    const topCardPreviewRef = topCardId == null ? null : getMageWarsSpellCardPreviewRef(topCardId);
    const count = discardSpellCardIds.length;

    return (
        <section
            className="pointer-events-auto flex h-[6.25rem] w-[8.65rem] shrink-0 items-center gap-2"
            data-testid={testId}
            data-tutorial-id={tutorialId}
            data-discard-owner-role={ownerRole}
            data-discard-owner-id={player.id}
        >
            <button
                type="button"
                className={cx(
                    'relative h-[6.25rem] w-[5.15rem] overflow-visible rounded-[0.12rem] text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-100',
                    topCardId != null ? 'cursor-zoom-in' : 'cursor-default',
                )}
                aria-label={t('privateZones.discardPileAria', { count })}
                disabled={topCardId == null}
                data-browse-inspectable={topCardId != null ? 'true' : undefined}
                data-source-card-id={topCardId ?? undefined}
                onClick={() => {
                    if (topCardId != null) {
                        onInspectCard?.(topCardId, getMageWarsSpellCardName(topCardId) ?? t('privateZones.discardPile'));
                    }
                }}
            >
                {topCardPreviewRef ? (
                    <>
                        <div className="absolute left-2 top-2 h-[5.85rem] w-[4.25rem] rotate-[-7deg] rounded-[0.16rem] bg-amber-100/18 shadow-[0_10px_18px_rgba(0,0,0,0.28)]" />
                        <CardPreview
                            previewRef={topCardPreviewRef}
                            className="absolute left-1 top-0.5 h-[6.1rem] w-auto rotate-[2deg] rounded-[0.14rem] shadow-[0_10px_20px_rgba(0,0,0,0.48)]"
                            title={getMageWarsSpellCardName(topCardId) ?? t('privateZones.discardPile')}
                        />
                    </>
                ) : (
                    <div className="absolute inset-1 rounded-[0.2rem] border border-dashed border-amber-100/18 bg-stone-950/12" />
                )}
            </button>
            <div className="text-center text-[0.66rem] font-semibold text-amber-100">
                {t('privateZones.discardPileWithCount', { count })}
            </div>
        </section>
    );
}

function SpellbookShelf({
    player,
    phase,
    canAct,
    canPlan,
    selectedCardIds,
    onSelectedCardIdsChange,
    onInspectCard,
    tutorialStepId,
    onTutorialPlanningStepComplete,
    visibleCardCount = MAGE_WARS_SPELLBOOK_VISIBLE_CARD_COUNT,
}: {
    player: MageWarsPlayerState;
    phase: string;
    canAct: boolean;
    canPlan: boolean;
    selectedCardIds: number[];
    onSelectedCardIdsChange: Dispatch<SetStateAction<number[]>>;
    onInspectCard?: (cardId: number, label?: string) => void;
    tutorialStepId?: string;
    onTutorialPlanningStepComplete?: (stepId: string) => void;
    visibleCardCount?: number;
}) {
    const { t } = useTranslation('game-mage-wars');
    const [category, setCategory] = useState<SpellbookCategoryId>('all');
    const [page, setPage] = useState(0);
    const planning = phase === 'planning' && canAct && canPlan;
    const categories: Array<{ id: SpellbookCategoryId; label: string }> = [
        { id: 'all', label: t('spellbook.categories.all') },
        { id: 'attack', label: t('spellbook.categories.attack') },
        { id: 'enchantment', label: t('spellbook.categories.enchantment') },
        { id: 'creature', label: t('spellbook.categories.creature') },
        { id: 'incantation', label: t('spellbook.categories.incantation') },
        { id: 'equipment', label: t('spellbook.categories.equipment') },
    ];
    const spellbookEntries = useMemo(() => (
        getMageWarsSpellbookDisplayEntries(player)
    ), [player]);
    const filteredEntries = useMemo(() => spellbookEntries.filter((entry) => {
        const cardId = entry.spellCardId;
        if (category === 'all') return true;
        const spellType = getMageWarsSpellCardFromConfig(cardId)?.spellType;
        if (category === 'creature') return spellType === '生物' || spellType === '魔物';
        if (category === 'enchantment') return spellType === '结界';
        if (category === 'attack') return spellType === '攻击';
        if (category === 'incantation') return spellType === '咒语';
        return spellType === '装备';
    }), [category, spellbookEntries]);
    const selectedCountsByCardId = useMemo(() => (
        selectedCardIds.reduce((counts, cardId) => {
            counts.set(cardId, (counts.get(cardId) ?? 0) + 1);
            return counts;
        }, new Map<number, number>())
    ), [selectedCardIds]);
    const cardsPerPage = Math.max(1, Math.min(MAGE_WARS_SPELLBOOK_VISIBLE_CARD_COUNT, Math.floor(visibleCardCount)));
    const pageCount = Math.max(1, Math.ceil(filteredEntries.length / cardsPerPage));
    const currentPage = Math.min(page, pageCount - 1);
    const previewEntries = filteredEntries.slice(currentPage * cardsPerPage, currentPage * cardsPerPage + cardsPerPage);
    const completeTutorialPlanningStep = (expectedStepId: string) => {
        if (tutorialStepId === expectedStepId) {
            onTutorialPlanningStepComplete?.(expectedStepId);
        }
    };
    const togglePlannedCard = (cardId: number, copyCount: number) => {
        if (!planning) return;
        const selectedCount = selectedCardIds.filter((id) => id === cardId).length;
        const willRemove = selectedCount > 0 && (
            selectedCount >= Math.min(copyCount, MAGE_WARS_MAX_PREPARED_SPELLS)
            || selectedCardIds.length >= MAGE_WARS_MAX_PREPARED_SPELLS
        );
        const willAdd = !willRemove && selectedCardIds.length < MAGE_WARS_MAX_PREPARED_SPELLS;
        onSelectedCardIdsChange((current) => {
            const selectedCount = current.filter((id) => id === cardId).length;
            if (selectedCount > 0 && (
                selectedCount >= Math.min(copyCount, MAGE_WARS_MAX_PREPARED_SPELLS)
                || current.length >= MAGE_WARS_MAX_PREPARED_SPELLS
            )) {
                return current.filter((id) => id !== cardId);
            }
            if (current.length >= MAGE_WARS_MAX_PREPARED_SPELLS) return current;
            return [...current, cardId];
        });
        if (willAdd && cardId === MAGE_WARS_TUTORIAL_JUNGLE_WOLF_CARD_ID) {
            completeTutorialPlanningStep('plan-select-wolf');
        }
        if (willAdd && cardId === MAGE_WARS_TUTORIAL_ROUSE_THE_BEAST_CARD_ID) {
            completeTutorialPlanningStep('plan-select-rouse');
        }
    };

    return (
        <section
            className="pointer-events-auto flex w-full items-end px-1.5 pt-3"
            style={{
                containerType: 'inline-size',
                gap: 'var(--mage-wars-desktop-section-gap, 1.125rem)',
                '--mage-wars-desktop-card-height': 'var(--mage-wars-desktop-spellbook-card-height, clamp(13.75rem, 20cqw, 19.5rem))',
            } as CSSProperties}
            data-testid="mage-wars-desktop-spellbook-shelf"
            data-tutorial-id="mw-spellbook"
            aria-label={t('privateZones.spellbook')}
            data-planning-enabled={planning ? 'true' : 'false'}
            data-visible-card-count={cardsPerPage}
        >
            <span className="sr-only">{t('privateZones.spellbook')}</span>
            <div
                className="flex h-[var(--mage-wars-spellbook-category-stack-height,13.25rem)] shrink-0 flex-col justify-end gap-[0.25rem]"
                style={{ width: 'var(--mage-wars-spellbook-control-width, 5rem)' }}
            >
                {categories.map(({ id, label }) => (
                    <button
                        key={id}
                        type="button"
                        className={cx(
                            'min-h-[2rem] whitespace-nowrap rounded-[0.28rem] px-2.5 text-[0.78rem] font-bold leading-none transition',
                            category === id
                                ? 'bg-amber-200/85 text-stone-950 shadow-[0_6px_14px_rgba(0,0,0,0.25)]'
                                : 'bg-black/26 text-stone-200 hover:bg-black/38',
                        )}
                        aria-pressed={category === id}
                        data-testid={`mage-wars-spellbook-category-${id}`}
                        data-tutorial-id={`mw-spellbook-category-${id}`}
                        onClick={() => {
                            setCategory(id);
                            setPage(0);
                            if (id === 'creature') {
                                completeTutorialPlanningStep('plan-open-creature-category');
                            }
                            if (id === 'incantation') {
                                completeTutorialPlanningStep('plan-open-incantation-category');
                            }
                        }}
                    >
                        {label}
                    </button>
                ))}
            </div>
            <div
                className="relative z-10 flex min-w-0 shrink-0 items-end overflow-visible"
                style={{ gap: 'var(--mage-wars-desktop-card-gap, 0.75rem)' }}
            >
                {previewEntries.map((entry) => (
                    <PreparedSpellCard
                        key={`${player.id}-spellbook-desktop-${entry.spellCardId}`}
                        cardId={entry.spellCardId}
                        label={getMageWarsSpellCardName(entry.spellCardId) ?? t('privateZones.spell')}
                        testId="mage-wars-desktop-spellbook-card"
                        tutorialId={`mw-spellbook-card-${entry.spellCardId}`}
                        selected={(selectedCountsByCardId.get(entry.spellCardId) ?? 0) > 0}
                        selectedCount={selectedCountsByCardId.get(entry.spellCardId) ?? 0}
                        copyCount={entry.count}
                        disabled={!planning}
                        onClick={planning ? () => togglePlannedCard(entry.spellCardId, entry.count) : undefined}
                        onInspect={() => onInspectCard?.(
                            entry.spellCardId,
                            getMageWarsSpellCardName(entry.spellCardId) ?? t('privateZones.spell'),
                        )}
                    />
                ))}
            </div>
            <div
                className="relative z-20 flex h-[11.75rem] shrink-0 flex-col items-center justify-center gap-2 text-stone-100"
                style={{ width: 'var(--mage-wars-spellbook-page-rail-width, 3rem)' }}
            >
                <button
                    type="button"
                    className="grid place-items-center rounded-[0.3rem] bg-black/32 text-lg font-bold text-amber-100"
                    style={{
                        height: 'var(--mage-wars-spellbook-page-button-size, 2.5rem)',
                        width: 'var(--mage-wars-spellbook-page-button-size, 2.5rem)',
                    }}
                    aria-label={t('spellbook.previousPage')}
                    disabled={currentPage === 0}
                    data-testid="mage-wars-spellbook-previous-page"
                    data-tutorial-id="mw-spellbook-previous-page"
                    onClick={() => setPage((value) => Math.max(0, value - 1))}
                >
                    ‹
                </button>
                <div className="rounded-[0.2rem] bg-black/18 px-1.5 py-1 text-center text-[0.62rem] leading-tight text-stone-200">
                    {t('spellbook.pageSummary', { page: currentPage + 1, total: pageCount })}
                </div>
                <button
                    type="button"
                    className="grid place-items-center rounded-[0.3rem] bg-black/32 text-lg font-bold text-amber-100"
                    style={{
                        height: 'var(--mage-wars-spellbook-page-button-size, 2.5rem)',
                        width: 'var(--mage-wars-spellbook-page-button-size, 2.5rem)',
                    }}
                    aria-label={t('spellbook.nextPage')}
                    disabled={currentPage >= pageCount - 1}
                    data-testid="mage-wars-spellbook-next-page"
                    data-tutorial-id="mw-spellbook-next-page"
                    onClick={() => {
                        setPage((value) => Math.min(pageCount - 1, value + 1));
                        if (category === 'creature') {
                            completeTutorialPlanningStep('plan-creature-next-page');
                        }
                        if (category === 'incantation') {
                            completeTutorialPlanningStep('plan-incantation-next-page');
                        }
                    }}
                >
                    ›
                </button>
            </div>
        </section>
    );
}

function PreparedSpellsDock({
    player,
    phase,
    canAct,
    canCast,
    selectedCardId,
    planningDraftCardIds = [],
    onSelect,
    onInspectCard,
    onPlanningDraftRemove,
}: {
    player: MageWarsPlayerState;
    phase: string;
    canAct: boolean;
    canCast: boolean;
    selectedCardId: number | null;
    planningDraftCardIds?: number[];
    onSelect: (cardId: number) => void;
    onInspectCard?: (cardId: number, label?: string) => void;
    onPlanningDraftRemove?: (slotIndex: number) => void;
}) {
    const { t } = useTranslation('game-mage-wars');
    const preparedIds = player.preparedSpellCardIds.slice(0, MAGE_WARS_MAX_PREPARED_SPELLS);
    const planningDraftIds = phase === 'planning'
        ? planningDraftCardIds.slice(0, MAGE_WARS_MAX_PREPARED_SPELLS)
        : [];
    const showingPlanningDraft = planningDraftIds.length > 0;
    const visibleIds = showingPlanningDraft ? planningDraftIds : preparedIds;
    const visibleSlotTotal = showingPlanningDraft ? MAGE_WARS_MAX_PREPARED_SPELLS : player.preparedSpellSlots;
    const canSelectSpell = canAct && canCast && CAST_PHASES.has(phase);

    return (
        <section
            className="pointer-events-auto flex h-auto flex-col justify-start gap-[0.875rem]"
            style={{ width: 'var(--mage-wars-desktop-prepared-width, 22.5rem)' }}
            data-testid="mage-wars-desktop-prepared-spells"
            data-tutorial-id="mw-prepared"
            data-layout-position="below-turn-action"
        >
            <div className="text-center text-[0.66rem] font-semibold text-amber-100">
                {t('privateZones.preparedSpellsWithCount', {
                    count: visibleIds.length,
                    total: visibleSlotTotal,
                })}
            </div>
            <div
                className="flex flex-row-reverse justify-end"
                style={{
                    gap: 'var(--mage-wars-prepared-card-gap, 0.875rem)',
                    paddingLeft: 'var(--mage-wars-prepared-row-padding-left, 1.5rem)',
                    paddingRight: 'var(--mage-wars-prepared-row-padding-right, 0.375rem)',
                }}
            >
                {Array.from({ length: MAGE_WARS_MAX_PREPARED_SPELLS }, (_, slot) => {
                    const visibleCardId = visibleIds[slot];
                    const isPlanningDraftCard = showingPlanningDraft && visibleCardId != null;
                    const canRemovePlanningDraft = isPlanningDraftCard && Boolean(onPlanningDraftRemove);
                    return (
                        <PreparedSpellCard
                            key={`${player.id}-${showingPlanningDraft ? 'planning-draft' : 'prepared'}-desktop-${slot}-${visibleCardId ?? 'empty'}`}
                            cardId={visibleCardId}
                            label={slot < player.preparedSpellSlots
                                ? t('privateZones.preparedSpell')
                                : t('privateZones.emptySlot')}
                            role={!showingPlanningDraft && slot === 0 && visibleCardId != null ? 'source' : undefined}
                            testId="mage-wars-desktop-prepared-card"
                            tutorialId={visibleCardId == null ? undefined : `mw-prepared-card-${visibleCardId}`}
                            preparedScope="self"
                            selected={visibleCardId === selectedCardId || isPlanningDraftCard}
                            planningDraft={isPlanningDraftCard}
                            planSlotIndex={slot + 1}
                            disabled={visibleCardId == null || (!canSelectSpell && !canRemovePlanningDraft)}
                            onClick={visibleCardId == null
                                ? undefined
                                : canRemovePlanningDraft
                                    ? () => onPlanningDraftRemove?.(slot)
                                    : canSelectSpell
                                        ? () => onSelect(visibleCardId)
                                        : undefined}
                            onInspect={visibleCardId == null
                                ? undefined
                                : () => onInspectCard?.(
                                    visibleCardId,
                                    getMageWarsSpellCardName(visibleCardId) ?? t('privateZones.preparedSpell'),
                                )}
                        />
                    );
                })}
            </div>
        </section>
    );
}

function TurnStatusDock({
    dispatch,
    disabled,
    phase,
    compact = false,
    planSpellCount = 0,
    planSpellTotal = MAGE_WARS_MAX_PREPARED_SPELLS,
    onPlanSpells,
}: {
    dispatch: Props['dispatch'];
    disabled?: boolean;
    phase: MageWarsPhase;
    compact?: boolean;
    planSpellCount?: number;
    planSpellTotal?: number;
    onPlanSpells?: () => void;
}) {
    const { t } = useTranslation('game-mage-wars');
    const planningActionVisible = planSpellCount > 0;
    const planningActionActive = Boolean(onPlanSpells && planningActionVisible);
    const actionDisabled = planningActionVisible ? !planningActionActive : disabled;
    const buttonTestId = planningActionVisible ? 'mage-wars-plan-spells' : 'mage-wars-turn-end';
    const tutorialId = planningActionVisible ? 'mw-plan-spells' : 'mw-turn-end';
    const actionLabel = planningActionVisible
        ? t('spellbook.planSelected', { count: planSpellCount, total: planSpellTotal })
        : t(resolvePhaseAdvanceActionLabelKey(phase));

    return (
        <section
            className="pointer-events-auto"
            data-testid="mage-wars-turn-end-dock"
            data-layout-position="above-prepared-spells"
        >
            <button
                type="button"
                className={cx(
                    'grid place-items-center whitespace-nowrap rounded-[0.32rem] border border-amber-200/24 font-black text-amber-50 shadow-[0_8px_18px_rgba(0,0,0,0.32)] transition',
                    compact ? 'min-h-11 min-w-28 w-max px-3 py-2 text-base' : 'min-h-[3.25rem] min-w-[13rem] w-max px-5 py-2 text-xl',
                    actionDisabled
                        ? 'cursor-not-allowed bg-black/20 text-stone-500'
                        : planningActionActive
                            ? 'bg-emerald-300 text-emerald-950 hover:bg-emerald-200'
                            : 'bg-amber-950/36 hover:bg-amber-900/42',
                )}
                disabled={actionDisabled}
                onClick={() => {
                    if (planningActionActive) {
                        onPlanSpells?.();
                        return;
                    }
                    dispatch(FLOW_COMMANDS.ADVANCE_PHASE, {});
                }}
                data-testid={buttonTestId}
                data-tutorial-id={tutorialId}
                data-main-action-mode={planningActionVisible ? 'plan-spells' : 'advance-phase'}
                data-main-action-phase={phase}
                data-plan-progress={planningActionVisible ? `${planSpellCount}/${planSpellTotal}` : undefined}
            >
                {actionLabel}
            </button>
        </section>
    );
}

function ZoneOccupant({
    player,
    role,
    ownerSide,
    crowded,
    density = 'solo',
    onClick,
    visualDamage = player.damage,
    showLifeTotals = false,
    fxAnchorRef,
}: {
    player: MageWarsPlayerState;
    role?: 'source' | 'target';
    ownerSide?: SeatOwnerSide;
    crowded?: boolean;
    density?: ZoneEntityDensity;
    onClick?: () => void;
    visualDamage?: number;
    showLifeTotals?: boolean;
    fxAnchorRef?: (element: HTMLDivElement | null) => void;
}) {
    const { t } = useTranslation('game-mage-wars');
    const mageLabel = getMageDisplayLabel(player);
    const portraitHeightClass = density === 'packed'
        ? ZONE_PACKED_ENTITY_HEIGHT_CLASS
        : density === 'dense'
            ? ZONE_LOOSE_ENTITY_HEIGHT_CLASS
            : density === 'duel'
                ? 'h-[8rem]'
                : crowded
                    ? 'h-[10.35rem]'
                    : ZONE_LOOSE_ENTITY_HEIGHT_CLASS;
    const portraitStyle: CSSProperties = { aspectRatio: getMageWarsMagePreviewAspectRatio() };

    return (
        <div
            className={cx(
                'group relative z-20 shrink-0 rounded-[0.18rem] shadow-[0_14px_30px_rgba(0,0,0,0.48)] transition-[filter,box-shadow] duration-150',
                portraitHeightClass,
                role === 'source' && '-translate-y-2 shadow-[0_0_30px_rgba(34,211,238,0.58)]',
                role === 'target' && 'shadow-[0_0_30px_rgba(16,185,129,0.48)]',
                'pointer-events-auto',
                onClick && 'cursor-pointer',
                onClick && 'hover:brightness-110 hover:shadow-[0_0_24px_rgba(251,191,36,0.32)]',
            )}
            style={portraitStyle}
            ref={fxAnchorRef}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            onClick={(event) => {
                if (!onClick) return;
                event.stopPropagation();
                onClick();
            }}
            onKeyDown={(event) => {
                if (!onClick) return;
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    onClick();
                }
            }}
            aria-label={t(`mages.${player.mageId}`)}
            data-testid="mage-wars-zone-mage-entity"
            data-tutorial-id={`mw-mage-entity-${player.id}`}
            data-player-id={player.id}
            data-mage-id={player.mageId}
            data-owner-side={ownerSide}
            data-mage-preview-kind="portrait"
            data-mage-ui-role="mage-battle-entity"
            data-mage-role={role}
            data-action-ready={String(player.actionReady)}
            data-action-token-state={player.actionReady ? 'ready' : 'spent'}
            data-quickcast-ready={String(player.quickcastReady)}
            data-quickcast-token-state={player.quickcastReady ? 'ready' : 'spent'}
            data-primary-action={onClick ? 'true' : undefined}
        >
            <CardPreview
                previewRef={getMageWarsMagePreviewRef(player.mageId, 'portrait')}
                className="h-full w-full rounded-[0.18rem]"
                title={mageLabel}
                alt={mageLabel}
            />
            {role ? (
                <span
                    className={cx(
                        'pointer-events-none absolute inset-0 z-10 rounded-[inherit] border-2',
                        role === 'target'
                            ? 'border-emerald-200/95 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.34),0_0_16px_rgba(16,185,129,0.44)]'
                            : 'border-cyan-100/90 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.32),0_0_16px_rgba(34,211,238,0.44)]',
                    )}
                    data-testid={`mage-wars-mage-entity-${role}-frame`}
                />
            ) : null}
            <BoardDamageStateOverlay
                damage={visualDamage}
                life={player.life}
                testId="mage-wars-mage-entity-damage-overlay"
                showValueBadge={false}
            />
            <MageWarsLifeDamageReadout
                damage={visualDamage}
                life={player.life}
                testId="mage-wars-mage-entity-life-readout"
                showLifeTotals={showLifeTotals}
            />
            <EntityStatusTokenRail
                guarding={player.guarding}
                actionReady={player.actionReady}
                quickcastReady={player.quickcastReady}
                statusTokens={player.statusTokens}
            />
        </div>
    );
}

function ArenaStage({
    core,
    phase,
    canAct,
    activePlayer,
    activeOpponent,
    selectedSpellCardId,
    pendingSpellCastSelection,
    selectedObjectId,
    selectedMageId,
    objectAbilitySourceIds,
    selectedObjectAvailableAbilities,
    selectedMageRestoreAbility,
    canGuardSelectedActor,
    shouldShowSelectedAbilityActionDock,
    selectedSpellCastTargetIds,
    selectedSpellCastTargetZoneIds,
    selectedSpellCastTargetWallEdgeIds,
    selectedSpellCastDestinationZoneIds,
    selectedSpellCastNewTargetObjectIds,
    selectedSpellCastTargetPlayerIds,
    selectedSpellCastNewTargetPlayerIds,
    selectedSpellCastNewTargetZoneIds,
    selectedSpellCastChainPathObjectIds,
    selectedSpellCastNextChainTargetObjectIds,
    selectedSpellCastCurrentChainSubmitObjectId,
    mageRestoreAvailablePlayerIds,
    pendingObjectAbility,
    pendingObjectAbilityTargetIds,
    pendingMageAbility,
    pendingMageAbilityTargetIds,
    onZoneSelect,
    onObjectSelect,
    onWallEdgeSelect,
    onActorObjectSelect,
    onPlayerSelect,
    onActorPlayerSelect,
    onGuard,
    onObjectAbilitySelect,
    onMageAbilitySelect,
    onInspectCard,
    fxBus,
    onFxImpact,
    onFxComplete,
    fxAnchors,
    getVisualObjectDamage,
    getVisualPlayerDamage,
    showLifeTotals = false,
    visualHeldObjects = [],
    tutorialHighlightTarget,
}: {
    core: MageWarsCore;
    phase: string;
    canAct: boolean;
    activePlayer?: MageWarsPlayerState;
    activeOpponent?: MageWarsPlayerState | null;
    selectedSpellCardId?: number | null;
    pendingSpellCastSelection?: PendingSpellCastSelection | null;
    selectedObjectId?: string | null;
    selectedMageId?: PlayerId | null;
    objectAbilitySourceIds?: ReadonlySet<string>;
    selectedObjectAvailableAbilities?: readonly { id: MageWarsObjectAbilityId; name: string }[];
    selectedMageRestoreAbility?: { abilityId: MageWarsMageAbilityId; name: string };
    canGuardSelectedActor?: boolean;
    shouldShowSelectedAbilityActionDock?: boolean;
    selectedSpellCastTargetIds?: ReadonlySet<string>;
    selectedSpellCastTargetZoneIds?: ReadonlySet<ArenaZoneId>;
    selectedSpellCastTargetWallEdgeIds?: ReadonlySet<MageWarsWallEdgeId>;
    selectedSpellCastDestinationZoneIds?: ReadonlySet<ArenaZoneId>;
    selectedSpellCastNewTargetObjectIds?: ReadonlySet<string>;
    selectedSpellCastTargetPlayerIds?: ReadonlySet<PlayerId>;
    selectedSpellCastNewTargetPlayerIds?: ReadonlySet<PlayerId>;
    selectedSpellCastNewTargetZoneIds?: ReadonlySet<ArenaZoneId>;
    selectedSpellCastChainPathObjectIds?: ReadonlySet<string>;
    selectedSpellCastNextChainTargetObjectIds?: ReadonlySet<string>;
    selectedSpellCastCurrentChainSubmitObjectId?: string;
    mageRestoreAvailablePlayerIds?: ReadonlySet<PlayerId>;
    pendingObjectAbility?: PendingObjectAbilitySelection | null;
    pendingObjectAbilityTargetIds?: ReadonlySet<string>;
    pendingMageAbility?: PendingMageAbilitySelection | null;
    pendingMageAbilityTargetIds?: ReadonlySet<string>;
    onZoneSelect?: (zoneId: ArenaZoneId) => void;
    onObjectSelect?: (objectId: string) => void;
    onWallEdgeSelect?: (edgeId: MageWarsWallEdgeId) => void;
    onActorObjectSelect?: (objectId: string) => void;
    onPlayerSelect?: (playerId: PlayerId) => void;
    onActorPlayerSelect?: (playerId: PlayerId) => void;
    onGuard?: () => void;
    onObjectAbilitySelect?: (sourceObjectId: string, abilityId: MageWarsObjectAbilityId) => void;
    onMageAbilitySelect?: (playerId: PlayerId, abilityId: MageWarsMageAbilityId) => void;
    onInspectCard?: (cardId: number, label?: string) => void;
    fxBus: FxBus;
    onFxImpact?: (id: string, cue: string) => void;
    onFxComplete?: (id: string, cue: string) => void;
    fxAnchors: FxAnchorRegistry;
    getVisualObjectDamage: (object: MageWarsArenaObjectState) => number;
    getVisualPlayerDamage: (player: MageWarsPlayerState) => number;
    showLifeTotals?: boolean;
    visualHeldObjects?: MageWarsArenaObjectState[];
    tutorialHighlightTarget?: string;
}) {
    const { t } = useTranslation('game-mage-wars');
    const creatureActionActive = isCreatureActionPhase(phase) && canAct;
    const canUseMageAction = creatureActionActive && activePlayer?.actionReady === true;
    const selectedSpell = selectedSpellCardId == null
        ? undefined
        : getMageWarsSpellCardFromConfig(selectedSpellCardId);
    const spellNeedsZoneTarget = selectedSpellCastTargetZoneIds !== undefined;
    const spellNeedsObjectTarget = Boolean(
        selectedSpellCastTargetIds
        || selectedSpellCastTargetPlayerIds
        || selectedSpellCastNewTargetObjectIds
        || selectedSpellCastNewTargetPlayerIds
        || selectedSpellCastNextChainTargetObjectIds
        || selectedSpellCastCurrentChainSubmitObjectId,
    );
    const spellNeedsNewAnchorTarget = Boolean(
        selectedSpellCastNewTargetObjectIds
        || selectedSpellCastNewTargetPlayerIds
        || selectedSpellCastNewTargetZoneIds,
    );
    const spellNeedsChainTargets = Boolean(
        selectedSpellCastNextChainTargetObjectIds
        || selectedSpellCastCurrentChainSubmitObjectId,
    );
    const pendingSpellTargetObjectId = pendingSpellCastSelection?.kind === 'object'
        ? pendingSpellCastSelection.objectId
        : undefined;
    const pendingSpellTargetPlayerId = pendingSpellCastSelection?.kind === 'player'
        ? pendingSpellCastSelection.playerId
        : undefined;
    const pendingSpellTargetObject = pendingSpellTargetObjectId ? core.objects[pendingSpellTargetObjectId] : undefined;
    const pendingSpellTargetPlayer = pendingSpellTargetPlayerId ? core.players[pendingSpellTargetPlayerId] : undefined;
    const pendingSpellTargetZoneId = pendingSpellTargetObject?.zoneId ?? pendingSpellTargetPlayer?.mageZoneId;
    const selectedObject = selectedObjectId ? core.objects[selectedObjectId] : undefined;
    const selectedMage = selectedMageId ? core.players[selectedMageId] : undefined;
    const selectedMageRestoreAbilityId = selectedMage ? resolveMageWarsPriestessRestoreAbilityIdForPhase(phase) : undefined;
    const canUseSelectedMageRestoreAbility = Boolean(
        selectedMage
        && selectedMage.id === activePlayer?.id
        && selectedMageRestoreAbilityId
        && mageRestoreAvailablePlayerIds?.has(selectedMage.id),
    );
    const hasPendingAbilityTarget = Boolean(pendingObjectAbility || pendingMageAbility);
    const selectedObjectAttackProfile = selectedObject
        ? getMageWarsObjectAttackProfiles(selectedObject).find((profile) => (
            selectedObject.actionReady || canMageWarsObjectUsePostMoveQuickAction(selectedObject, profile)
        ))
        : undefined;
    const selectedMageCanAct = Boolean(
        selectedMage
        && selectedMage.id === activePlayer?.id
        && canUseMageAction,
    );
    const selectedObjectCanMove = Boolean(
        selectedObject
        && canMageWarsObjectStartAction(selectedObject, activePlayer?.id)
        && selectedObject.actionReady
        && !isMageWarsArenaObjectRestrained(selectedObject),
    );
    const selectedObjectCanAttack = Boolean(
        selectedObject
        && isMageWarsActionableCreatureObject(selectedObject, activePlayer?.id)
        && selectedObjectAttackProfile,
    );
    const selectedActorZoneId = selectedObject?.zoneId
        ?? (selectedMageCanAct || canUseSelectedMageRestoreAbility ? selectedMage?.mageZoneId : undefined);
    const hasSelectedActor = selectedActorZoneId != null;
    const hasPendingSpellDestination = Boolean(
        (pendingSpellTargetObject || pendingSpellTargetPlayer)
        && (
            selectedSpellCastDestinationZoneIds
            || spellNeedsNewAnchorTarget
            || spellNeedsChainTargets
        ),
    );
    const isSelectedSpellObjectTarget = (object: MageWarsArenaObjectState): boolean => {
        if (!spellNeedsObjectTarget) return false;
        if (pendingSpellTargetObject && spellNeedsChainTargets && selectedSpellCastNextChainTargetObjectIds) {
            return selectedSpellCastNextChainTargetObjectIds.has(object.id)
                || selectedSpellCastCurrentChainSubmitObjectId === object.id;
        }
        if (pendingSpellTargetObject && selectedSpellCastNewTargetObjectIds) {
            return selectedSpellCastNewTargetObjectIds.has(object.id);
        }
        if (pendingSpellTargetObject && spellNeedsNewAnchorTarget && selectedSpellCastTargetIds) return false;
        if (pendingSpellTargetObject && spellNeedsChainTargets && selectedSpellCastTargetIds) return false;
        if (selectedSpellCastTargetIds) return selectedSpellCastTargetIds.has(object.id);
        return false;
    };
    const isSelectedSpellPlayerTarget = (player: MageWarsPlayerState): boolean => Boolean(
        spellNeedsObjectTarget
        && (
            (
                pendingSpellTargetObject
                && selectedSpellCastNewTargetPlayerIds?.has(player.id)
            )
            || selectedSpellCastTargetPlayerIds?.has(player.id)
        ),
    );
    const targeting = Boolean(selectedSpell) || hasSelectedActor || hasPendingAbilityTarget;
    const legalMoveZoneIds = new Set(
        !hasPendingAbilityTarget
            && creatureActionActive
            && selectedActorZoneId
            && (selectedObject ? selectedObjectCanMove : selectedMageCanAct)
            ? core.arena
                .filter((zone) => areAdjacentZones(core, selectedActorZoneId, zone.id))
                .map((zone) => zone.id)
            : [],
    );
    const legalAttackTargetId = activeOpponent
        && !hasPendingAbilityTarget
        && (selectedObject && selectedObjectCanAttack && selectedObjectAttackProfile
            ? isMageWarsObjectAttackTargetSelectable(
                core,
                selectedObject.zoneId,
                activeOpponent.mageZoneId,
                selectedObjectAttackProfile,
            )
            : selectedMageCanAct && activeOpponent.mageZoneId === selectedMage?.mageZoneId)
        ? activeOpponent.id
        : null;
    const targetZoneId = legalAttackTargetId ? activeOpponent?.mageZoneId ?? null : null;
    const legalSpellTargetZoneIds = new Set(
        selectedSpellCardId != null
            ? core.arena
                .filter((zone) => {
                    const fieldObjects = zone.objectIds
                        .map((objectId) => core.objects[objectId])
                        .filter((object): object is MageWarsArenaObjectState => object != null);
                    const zoneOccupants = zone.occupantIds
                        .map((occupantId) => core.players[occupantId])
                        .filter((occupant): occupant is MageWarsPlayerState => occupant != null);
                    if (pendingSpellTargetObject && spellNeedsNewAnchorTarget) {
                        return selectedSpellCastNewTargetZoneIds?.has(zone.id) === true
                            || fieldObjects.some((object) => isSelectedSpellObjectTarget(object))
                            || zoneOccupants.some((occupant) => isSelectedSpellPlayerTarget(occupant));
                    }
                    if ((pendingSpellTargetObject || pendingSpellTargetPlayer) && selectedSpellCastDestinationZoneIds) {
                        return selectedSpellCastDestinationZoneIds.has(zone.id);
                    }
                    if (!pendingSpellTargetObject && selectedSpellCastTargetZoneIds) {
                        return selectedSpellCastTargetZoneIds.has(zone.id);
                    }
                    return fieldObjects.some((object) => isSelectedSpellObjectTarget(object))
                        || zoneOccupants.some((occupant) => isSelectedSpellPlayerTarget(occupant));
                })
                .map((zone) => zone.id)
            : [],
    );
    const wallEdgeDescriptors = buildMageWarsWallEdgeDescriptors(core);
    const legalWallEdgeIds = new Set(
        selectedSpellCastTargetWallEdgeIds
            ? wallEdgeDescriptors
                .filter((edge) => selectedSpellCastTargetWallEdgeIds.has(edge.edgeId))
                .map((edge) => edge.edgeId)
            : [],
    );

    return (
        <section
            className="relative h-full w-full overflow-hidden"
            data-testid="mage-wars-arena-stage"
            data-tutorial-id="mw-arena"
            ref={(element) => {
                fxAnchors.registerSurface(element);
            }}
        >
            <OptimizedImage
                src="mage-wars/board/standard-arena"
                alt={t('arena.standardArenaAlt')}
                className="absolute inset-0 h-full w-full max-w-none object-contain"
                placeholder={false}
            />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,231,166,0.06),rgba(6,5,4,0.1)_56%,rgba(3,2,1,0.44))]" />
            {core.arena.map((zone) => {
                const rect = ZONE_RECTS[zone.id];
                const fieldCardIds = zone.fieldCardIds ?? [];
                const coreZoneObjects = zone.objectIds
                    .map((objectId) => core.objects[objectId])
                    .filter((object): object is MageWarsArenaObjectState => object != null);
                const zoneHeldObjects = visualHeldObjects.filter((object) => (
                    object.zoneId === zone.id
                    && core.objects[object.id] == null
                    && !coreZoneObjects.some((current) => current.id === object.id)
                ));
                const zoneObjects = [...coreZoneObjects, ...zoneHeldObjects];
                const zoneHeldObjectIds = new Set(zoneHeldObjects.map((object) => object.id));
                const attachedObjects = zoneObjects.filter(isMageWarsAttachmentObject);
                const fieldObjects = zoneObjects.filter((object) => !isMageWarsAttachmentObject(object));
                const zoneAttachmentObjects = attachedObjects.filter((object) => (
                    isMageWarsZoneAttachmentObject(object, zone.id)
                ));
                const zoneOccupants = zone.occupantIds
                    .map((occupantId) => core.players[occupantId])
                    .filter((occupant): occupant is MageWarsPlayerState => occupant != null);
                const hasFieldCards = fieldCardIds.length > 0 || fieldObjects.length > 0;
                const isSourceZone = (hasSelectedActor && zone.id === selectedActorZoneId)
                    || (hasPendingSpellDestination && zone.id === pendingSpellTargetZoneId);
                const isLegalMoveZone = legalMoveZoneIds.has(zone.id);
                const isLegalAttackZone = targetZoneId != null && zone.id === targetZoneId;
                const isLegalSpellTargetZone = legalSpellTargetZoneIds.has(zone.id);
                const isLegalObjectAbilityTargetZone = Boolean(
                    pendingObjectAbility
                    && pendingObjectAbilityTargetIds
                    && fieldObjects.some((object) => pendingObjectAbilityTargetIds.has(object.id)),
                );
                const isLegalMageAbilityTargetZone = Boolean(
                    pendingMageAbility
                    && pendingMageAbilityTargetIds
                    && fieldObjects.some((object) => pendingMageAbilityTargetIds.has(object.id)),
                );
                const isLegalTargetZone = isLegalAttackZone
                    || isLegalSpellTargetZone
                    || isLegalObjectAbilityTargetZone
                    || isLegalMageAbilityTargetZone;
                const isLegalExplicitZoneTarget = Boolean(
                    selectedSpellCastDestinationZoneIds?.has(zone.id) === true
                    || selectedSpellCastNewTargetZoneIds?.has(zone.id) === true
                    || (
                        selectedSpellCastTargetZoneIds?.has(zone.id) === true
                        && spellNeedsZoneTarget
                    ),
                );
                const isLegalObjectOrPlayerTargetZone = isLegalTargetZone && !isLegalExplicitZoneTarget;
                const zoneAriaLabel = [
                    t('arena.zoneAria', { zone: t(`zones.${zone.id}`) }),
                    isSourceZone ? t('arena.source') : null,
                    isLegalMoveZone && !isLegalTargetZone ? t('arena.legalMove') : null,
                    isLegalTargetZone ? t('arena.legalTarget') : null,
                ].filter(Boolean).join('，');
                const entityCount = fieldObjects.length + zoneOccupants.length;
                const usesOwnershipLanes = fieldCardIds.length === 0 && entityCount > 0;
                const leftSeatPlayerId = core.playerOrder[0];
                const rightSeatPlayerId = core.playerOrder[1];
                const leftSeatFieldObjects = fieldObjects.filter((object) => object.ownerId === leftSeatPlayerId);
                const rightSeatFieldObjects = fieldObjects.filter((object) => object.ownerId === rightSeatPlayerId);
                const leftSeatZoneOccupants = zoneOccupants.filter((occupant) => occupant.id === leftSeatPlayerId);
                const rightSeatZoneOccupants = zoneOccupants.filter((occupant) => occupant.id === rightSeatPlayerId);
                const shouldRaiseLeftSeatFieldObjects = isBottomArenaRowZone(zone.id);
                const largestLaneCount = Math.max(
                    leftSeatFieldObjects.length + leftSeatZoneOccupants.length,
                    rightSeatFieldObjects.length + rightSeatZoneOccupants.length,
                );
                const entityDensity: ZoneEntityDensity = !usesOwnershipLanes
                    ? 'solo'
                    : largestLaneCount <= 1
                        ? 'solo'
                        : largestLaneCount <= 2
                            ? 'dense'
                            : 'packed';
                const ownerLaneLayoutClassName = getZoneOwnerLaneLayoutClassName(entityDensity);
                const ownerLaneOverflowMode = getZoneOwnerLaneOverflowMode(entityDensity);
                const resolveAttachmentRole = (object: MageWarsArenaObjectState): FieldCardRole | undefined => {
                    const isSpellObjectTarget = isSelectedSpellObjectTarget(object);
                    if (selectedSpellCastChainPathObjectIds?.has(object.id)) return 'source';
                    if (object.id === pendingSpellTargetObjectId) return 'source';
                    if (isSpellObjectTarget) return 'target';
                    return object.id === selectedObjectId ? 'source' : undefined;
                };
                const resolveAttachmentClick = (object: MageWarsArenaObjectState): (() => void) | undefined => {
                    const isSpellObjectTarget = isSelectedSpellObjectTarget(object);
                    if (isSpellObjectTarget || selectedSpellCastCurrentChainSubmitObjectId === object.id) {
                        return () => onObjectSelect?.(object.id);
                    }
                    if (!selectedSpell && !hasPendingAbilityTarget && objectAbilitySourceIds?.has(object.id)) {
                        return () => onActorObjectSelect?.(object.id);
                    }
                    return undefined;
                };
                const resolveCardInspect = (cardId: number, label?: string): (() => void) | undefined => {
                    if (!onInspectCard) return undefined;
                    return () => onInspectCard(
                        cardId,
                        label ?? getMageWarsSpellCardName(cardId) ?? t('privateZones.spell'),
                    );
                };
                const resolveAttachmentInspect = (object: MageWarsArenaObjectState): (() => void) | undefined => (
                    resolveCardInspect(
                        object.sourceSpellCardId,
                        object.name ?? getMageWarsSpellCardName(object.sourceSpellCardId) ?? t('privateZones.spell'),
                    )
                );
                const renderFieldObject = (
                    object: MageWarsArenaObjectState,
                    density: ZoneEntityDensity = 'solo',
                    laneIndex?: number,
                ) => {
                    const visualHeld = zoneHeldObjectIds.has(object.id);
                    const objectAttachments = attachedObjects.filter((attachment) => (
                        isMageWarsObjectAttachmentObject(attachment, object.id)
                    ));
                    const isObjectAttackTarget = Boolean(
                        selectedObject
                        && selectedObjectCanAttack
                        && selectedObjectAttackProfile
                        && object.ownerId !== activePlayer?.id
                        && isMageWarsObjectAttackTargetSelectable(
                            core,
                            selectedObject.zoneId,
                            object.zoneId,
                            selectedObjectAttackProfile,
                        ),
                    );
                    const isSpellObjectTarget = isSelectedSpellObjectTarget(object);
                    const isObjectAbilitySource = object.id === pendingObjectAbility?.objectId;
                    const isObjectAbilityTarget = Boolean(
                        pendingObjectAbility
                        && pendingObjectAbilityTargetIds?.has(object.id),
                    );
                    const isMageAbilityTarget = Boolean(
                        pendingMageAbility
                        && pendingMageAbilityTargetIds?.has(object.id),
                    );
                    const isObjectAbilityActor = objectAbilitySourceIds?.has(object.id) === true;
                    const canSelectObjectActor = Boolean(
                        !selectedSpell
                        && !hasPendingAbilityTarget
                        && (
                            (
                                creatureActionActive
                                && canMageWarsObjectStartAction(object, activePlayer?.id)
                            )
                            || isObjectAbilityActor
                        ),
                    );
                    const fieldRole = object.id === pendingSpellTargetObjectId
                        || selectedSpellCastChainPathObjectIds?.has(object.id)
                        || object.id === selectedObjectId
                        || isObjectAbilitySource
                        ? 'source'
                        : isSpellObjectTarget || isObjectAttackTarget || isObjectAbilityTarget || isMageAbilityTarget
                            ? 'target'
                            : undefined;
                    return (
                        <div
                            key={object.id}
                            className="relative flex shrink-0 items-center justify-center"
                            style={getZoneLaneItemStyle(laneIndex, fieldRole != null)}
                            data-testid="mage-wars-zone-lane-item"
                            data-lane-item-kind="field"
                            data-lane-item-index={laneIndex}
                        >
                            <div className={cx(
                                'relative shrink-0',
                                'pointer-events-auto',
                                selectedObjectId === object.id && shouldShowSelectedAbilityActionDock && 'z-50',
                            )}
                                data-mage-wars-ability-source={selectedObjectId === object.id && shouldShowSelectedAbilityActionDock
                                    ? `object:${object.id}`
                                    : undefined}
                            >
                                <ZoneFieldCard
                                    cardId={object.sourceSpellCardId}
                                    object={object}
                                    density={density}
                                    ownerSide={resolveSeatOwnerSide(core, object.ownerId)}
                                    tutorialHighlightTarget={tutorialHighlightTarget}
                                    visualDamage={getVisualObjectDamage(object)}
                                    visualLife={resolveMageWarsObjectEffectiveLife(core, object)}
                                    visualHeld={visualHeld}
                                    showLifeTotals={showLifeTotals}
                                    role={fieldRole}
                                    onClick={isObjectAbilityTarget || isMageAbilityTarget
                                        ? () => onObjectSelect?.(object.id)
                                        : isSpellObjectTarget
                                        ? () => onObjectSelect?.(object.id)
                                        : selectedSpellCastCurrentChainSubmitObjectId === object.id
                                            ? () => onObjectSelect?.(object.id)
                                        : isObjectAttackTarget
                                            ? () => onObjectSelect?.(object.id)
                                            : canSelectObjectActor
                                                ? () => onActorObjectSelect?.(object.id)
                                                : undefined}
                                    onInspect={resolveCardInspect(
                                        object.sourceSpellCardId,
                                        object.name ?? getMageWarsSpellCardName(object.sourceSpellCardId) ?? t('privateZones.spell'),
                                    )}
                                    fxAnchorRef={(element) => {
                                        fxAnchors.registerAnchor({
                                            anchorId: object.id,
                                            anchorKind: 'entity',
                                            entityRef: object.id,
                                        })(element);
                                    }}
                                />
                            </div>
                            <ArenaAttachmentStrip
                                objects={objectAttachments}
                                density={density}
                                hostKind="object"
                                ownerSide={resolveSeatOwnerSide(core, object.ownerId)}
                                selectedObjectId={selectedObjectId}
                                shouldShowSelectedAbilityActionDock={shouldShowSelectedAbilityActionDock}
                                getRole={resolveAttachmentRole}
                                getOnClick={resolveAttachmentClick}
                                getOnInspect={resolveAttachmentInspect}
                                getFxAnchorRef={(attachment) => (element) => {
                                    fxAnchors.registerAnchor({
                                        anchorId: attachment.id,
                                        anchorKind: 'attachment-slot',
                                        entityRef: attachment.id,
                                    })(element);
                                }}
                            />
                        </div>
                    );
                };
                const renderZoneOccupant = (
                    occupant: MageWarsPlayerState,
                    density: ZoneEntityDensity = 'solo',
                    laneIndex?: number,
                ) => {
                    const mageAttachments = attachedObjects.filter((attachment) => (
                        isMageWarsMageAttachmentObject(attachment, occupant.id)
                    ));
                    const role = occupant.id === selectedMageId
                        ? 'source'
                        : occupant.id === legalAttackTargetId
                            || isSelectedSpellPlayerTarget(occupant)
                            ? 'target'
                            : undefined;
                    const occupantRestoreAbilityId = resolveMageWarsPriestessRestoreAbilityIdForPhase(phase);
                    const occupantCanUseRestoreAbility = Boolean(
                        canAct
                        && !selectedSpell
                        && !hasPendingAbilityTarget
                        && occupant.id === activePlayer?.id
                        && occupantRestoreAbilityId
                        && mageRestoreAvailablePlayerIds?.has(occupant.id),
                    );
                    const canSelectMageActor = Boolean(
                        !hasPendingAbilityTarget
                        && !selectedSpell
                        && occupant.id === activePlayer?.id
                        && ((creatureActionActive && canUseMageAction) || occupantCanUseRestoreAbility),
                    );
                    return (
                        <div
                            key={occupant.id}
                            className="relative flex shrink-0 items-center justify-center"
                            style={{ ...(getZoneLaneItemStyle(laneIndex, true) ?? {}), zIndex: 90 }}
                            data-testid="mage-wars-zone-lane-item"
                            data-lane-item-kind="mage"
                            data-lane-item-index={laneIndex}
                        >
                            <div className={cx(
                                'relative shrink-0 pointer-events-auto',
                                selectedMageId === occupant.id && shouldShowSelectedAbilityActionDock && 'z-50',
                            )}
                                data-mage-wars-ability-source={selectedMageId === occupant.id && shouldShowSelectedAbilityActionDock
                                    ? `mage:${occupant.id}`
                                    : undefined}
                            >
                                <ZoneOccupant
                                    player={occupant}
                                    role={role}
                                    ownerSide={resolveSeatOwnerSide(core, occupant.id)}
                                    crowded={hasFieldCards || mageAttachments.length > 0}
                                    density={density}
                                    visualDamage={getVisualPlayerDamage(occupant)}
                                    showLifeTotals={showLifeTotals}
                                    fxAnchorRef={(element) => {
                                        fxAnchors.registerAnchor({
                                            anchorId: occupant.id,
                                            anchorKind: 'player',
                                            entityRef: occupant.id,
                                        })(element);
                                    }}
                                    onClick={occupant.id === legalAttackTargetId || spellNeedsObjectTarget
                                        ? () => onPlayerSelect?.(occupant.id)
                                        : canSelectMageActor
                                            ? () => onActorPlayerSelect?.(occupant.id)
                                            : undefined}
                                />
                            </div>
                            <ArenaAttachmentStrip
                                objects={mageAttachments}
                                density={density}
                                hostKind="mage"
                                ownerSide={resolveSeatOwnerSide(core, occupant.id)}
                                selectedObjectId={selectedObjectId}
                                shouldShowSelectedAbilityActionDock={shouldShowSelectedAbilityActionDock}
                                getRole={resolveAttachmentRole}
                                getOnClick={resolveAttachmentClick}
                                getOnInspect={resolveAttachmentInspect}
                                getFxAnchorRef={(attachment) => (element) => {
                                    fxAnchors.registerAnchor({
                                        anchorId: attachment.id,
                                        anchorKind: 'attachment-slot',
                                        entityRef: attachment.id,
                                    })(element);
                                }}
                            />
                        </div>
                    );
                };
                const renderLeftSeatLaneItems = () => {
                    const fieldNodes = leftSeatFieldObjects.map((object, index) => renderFieldObject(
                        object,
                        entityDensity,
                        index,
                    ));
                    const occupantNodes = leftSeatZoneOccupants.map((occupant, index) => renderZoneOccupant(
                        occupant,
                        entityDensity,
                        leftSeatFieldObjects.length + index,
                    ));
                    if (shouldRaiseLeftSeatFieldObjects) {
                        return [...fieldNodes, ...occupantNodes];
                    }
                    return [
                        ...leftSeatZoneOccupants.map((occupant, index) => renderZoneOccupant(
                            occupant,
                            entityDensity,
                            index,
                        )),
                        ...leftSeatFieldObjects.map((object, index) => renderFieldObject(
                            object,
                            entityDensity,
                            leftSeatZoneOccupants.length + index,
                        )),
                    ];
                };
                return (
                    <div
                        key={zone.id}
                        data-testid={`mage-wars-arena-zone-${zone.id}`}
                        data-tutorial-id={`mw-zone-${zone.id}`}
                        data-source-zone={isSourceZone ? 'true' : undefined}
                        data-legal-move-zone={isLegalMoveZone ? 'true' : undefined}
                        data-legal-target-zone={isLegalTargetZone ? 'true' : undefined}
                        data-zone-target-scope={isLegalExplicitZoneTarget ? 'zone' : isLegalObjectOrPlayerTargetZone ? 'object' : undefined}
                        className={cx(
                            'absolute rounded-[0.25rem] text-left transition',
                            'outline outline-1 outline-transparent',
                            zone.occupantIds.length > 0 && 'bg-black/5',
                            entityCount > 0 && 'z-10',
                            isSourceZone && 'outline-cyan-200/35',
                            isLegalMoveZone && 'bg-sky-300/8 outline-sky-200/70 shadow-[inset_0_0_0_1px_rgba(125,211,252,0.34)]',
                            isLegalExplicitZoneTarget && 'bg-emerald-300/8 outline-emerald-200/80 shadow-[inset_0_0_0_1px_rgba(110,231,183,0.38)]',
                        )}
                        style={{
                            left: pct(rect.left),
                            top: pct(rect.top),
                            width: pct(rect.width),
                            height: pct(rect.height),
                        }}
                        aria-label={zoneAriaLabel}
                        role="button"
                        tabIndex={targeting ? 0 : -1}
                        onClick={() => {
                            if (targeting) onZoneSelect?.(zone.id);
                        }}
                        onKeyDown={(event) => {
                            if ((event.key === 'Enter' || event.key === ' ') && targeting) {
                                event.preventDefault();
                                onZoneSelect?.(zone.id);
                            }
                        }}
                        >
                        {usesOwnershipLanes ? (
                            <div
                                className="absolute inset-[1.4%] grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-[3.5%]"
                                data-testid="mage-wars-zone-ownership-lanes"
                                data-zone-id={zone.id}
                                data-layout-axis="horizontal"
                                data-owner-lane-axis="horizontal"
                            >
                                <div className={cx(
                                    'relative h-full min-w-0 rounded-[0.22rem] bg-rose-900/10 px-1.5 shadow-[inset_0_0_0_1px_rgba(248,113,113,0.16)]',
                                    ownerLaneLayoutClassName,
                                )} data-lane-owner-side="seat-left" data-lane-player-id={leftSeatPlayerId} data-lane-stack-axis="vertical" data-lane-overflow-mode={ownerLaneOverflowMode} data-lane-max-rows={entityDensity === 'packed' ? 3 : undefined}>
                                    {renderLeftSeatLaneItems()}
                                </div>
                                <div className={cx(
                                    'relative h-full min-w-0 rounded-[0.22rem] bg-sky-900/10 px-1.5 shadow-[inset_0_0_0_1px_rgba(125,211,252,0.16)]',
                                    ownerLaneLayoutClassName,
                                )} data-lane-owner-side="seat-right" data-lane-player-id={rightSeatPlayerId} data-lane-stack-axis="vertical" data-lane-overflow-mode={ownerLaneOverflowMode} data-lane-max-rows={entityDensity === 'packed' ? 3 : undefined}>
                                    {rightSeatZoneOccupants.map((occupant, index) => renderZoneOccupant(
                                        occupant,
                                        entityDensity,
                                        index,
                                    ))}
                                    {rightSeatFieldObjects.map((object, index) => renderFieldObject(
                                        object,
                                        entityDensity,
                                        rightSeatZoneOccupants.length + index,
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div
                                className={cx(
                                    'absolute inset-0 flex flex-wrap items-center gap-3 py-5',
                                    'justify-center px-4',
                                )}
                                style={getZoneFieldCardOffsetStyle(zone.id, hasFieldCards)}
                            >
                                {fieldCardIds.map((cardId, index) => (
                                    <ZoneFieldCard
                                        key={`${zone.id}-field-card-${cardId}-${index}`}
                                        cardId={cardId}
                                        ownerSide="neutral"
                                        tutorialHighlightTarget={tutorialHighlightTarget}
                                        role={isLegalAttackZone && index === 0 ? 'target' : undefined}
                                        onInspect={resolveCardInspect(
                                            cardId,
                                            getMageWarsSpellCardName(cardId) ?? t('privateZones.spell'),
                                        )}
                                    />
                                ))}
                                {fieldObjects.map((object) => renderFieldObject(object))}
                                {zoneOccupants.map((occupant) => renderZoneOccupant(occupant))}
                            </div>
                        )}
                        <ArenaAttachmentStrip
                            objects={zoneAttachmentObjects}
                            density={entityDensity}
                            hostKind="zone"
                            ownerSide="neutral"
                            selectedObjectId={selectedObjectId}
                            shouldShowSelectedAbilityActionDock={shouldShowSelectedAbilityActionDock}
                            getRole={resolveAttachmentRole}
                            getOnClick={resolveAttachmentClick}
                            getOnInspect={resolveAttachmentInspect}
                            getFxAnchorRef={(attachment) => (element) => {
                                fxAnchors.registerAnchor({
                                    anchorId: attachment.id,
                                    anchorKind: 'attachment-slot',
                                    entityRef: attachment.id,
                                })(element);
                            }}
                        />
                    </div>
                );
            })}
            {wallEdgeDescriptors.map((edge) => {
                const wall = core.walls?.[edge.edgeId];
                const isLegalWallTarget = legalWallEdgeIds.has(edge.edgeId);
                if (!wall && !isLegalWallTarget) return null;

                const [fromZoneId, toZoneId] = edge.zoneIds;
                const label = wall
                    ? t('arena.wallAria', {
                        wall: wall.name,
                        from: t(`zones.${fromZoneId}`),
                        to: t(`zones.${toZoneId}`),
                    })
                    : t('arena.wallEdgeAria', {
                        from: t(`zones.${fromZoneId}`),
                        to: t(`zones.${toZoneId}`),
                    });

                return (
                    <button
                        key={edge.edgeId}
                        type="button"
                        className={cx(
                            'absolute z-30 rounded-full border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-100',
                            edge.orientation === 'vertical'
                                ? 'shadow-[0_0_18px_rgba(251,146,60,0.34)]'
                                : 'shadow-[0_0_16px_rgba(251,146,60,0.3)]',
                            wall
                                ? 'border-amber-100/70 bg-amber-950/18'
                                : 'border-amber-100/82 bg-amber-300/18 hover:bg-amber-300/30',
                        )}
                        style={edge.style}
                        aria-label={label}
                        title={label}
                        disabled={!isLegalWallTarget && !wall}
                        data-testid={`mage-wars-wall-edge-${edge.edgeId}`}
                        data-tutorial-id={`mw-wall-edge-${edge.edgeId}`}
                        data-wall-edge-id={edge.edgeId}
                        data-legal-target-wall-edge={isLegalWallTarget ? 'true' : undefined}
                        data-wall-object={wall ? 'true' : undefined}
                        data-wall-spell-card-id={wall?.sourceSpellCardId}
                        data-browse-inspectable={wall ? 'true' : undefined}
                        onClick={(event) => {
                            event.stopPropagation();
                            if (isLegalWallTarget) {
                                onWallEdgeSelect?.(edge.edgeId);
                                return;
                            }
                            if (wall) {
                                onInspectCard?.(
                                    wall.sourceSpellCardId,
                                    wall.name || getMageWarsSpellCardName(wall.sourceSpellCardId) || label,
                                );
                            }
                        }}
                    >
                        {wall ? (
                            <WallSpellCardOnEdge
                                wall={wall}
                                orientation={edge.orientation}
                                label={label}
                            />
                        ) : (
                            <span
                                className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_0_0_1px_rgba(254,243,199,0.5),0_0_18px_rgba(251,191,36,0.38)]"
                            />
                        )}
                    </button>
                );
            })}
            {shouldShowSelectedAbilityActionDock && selectedObjectId ? (
                <MageWarsSelectedAbilityActionDock
                    objectId={selectedObjectId}
                    objectAbilities={selectedObjectAvailableAbilities ?? []}
                    canGuard={canGuardSelectedActor === true}
                    onGuard={onGuard ?? (() => undefined)}
                    onObjectAbilitySelect={onObjectAbilitySelect ?? (() => undefined)}
                    onMageAbilitySelect={onMageAbilitySelect ?? (() => undefined)}
                />
            ) : shouldShowSelectedAbilityActionDock && selectedMageId ? (
                <MageWarsSelectedAbilityActionDock
                    magePlayerId={selectedMageId}
                    mageAbility={selectedMageRestoreAbility}
                    canGuard={canGuardSelectedActor === true}
                    onGuard={onGuard ?? (() => undefined)}
                    onObjectAbilitySelect={onObjectAbilitySelect ?? (() => undefined)}
                    onMageAbilitySelect={onMageAbilitySelect ?? (() => undefined)}
                />
            ) : null}
            <FxLayer
                bus={fxBus}
                getCellPosition={(row, col) => ({
                    left: (col / 4) * 100,
                    top: (row / 3) * 100,
                    width: 100 / 4,
                    height: 100 / 3,
                })}
                className="z-40"
                data-testid="mage-wars-fx-layer"
                onEffectImpact={onFxImpact}
                onEffectComplete={onFxComplete}
            />
        </section>
    );
}

function WallSpellCardOnEdge({
    wall,
    orientation,
    label,
}: {
    wall: MageWarsWallState;
    orientation: WallEdgeDescriptor['orientation'];
    label: string;
}) {
    const previewRef = getMageWarsSpellCardPreviewRef(wall.sourceSpellCardId);
    const title = wall.name || getMageWarsSpellCardName(wall.sourceSpellCardId) || label;
    const cardAspectRatio = getMageWarsSpellCardAspectRatio(wall.sourceSpellCardId) ?? SPELL_CARD_BACK_ASPECT_RATIO;
    const isVerticalEdge = orientation === 'vertical';

    if (!previewRef) return null;

    return (
        <span
            className="pointer-events-none absolute inset-[-0.18rem] z-20 rounded-full border border-amber-100/55 bg-amber-950/18 shadow-[0_0_20px_rgba(251,146,60,0.32)]"
            data-testid="mage-wars-wall-object"
            data-source-card-id={wall.sourceSpellCardId}
            data-wall-visual="spell-card"
            data-wall-edge-orientation={orientation}
            aria-hidden="true"
        >
            <span
                className={cx(
                    'absolute left-1/2 top-1/2 block overflow-hidden rounded-[0.24rem] border border-orange-100/90 bg-stone-950/92',
                    'shadow-[0_12px_28px_rgba(0,0,0,0.62),0_0_18px_rgba(251,146,60,0.42)]',
                    isVerticalEdge ? 'origin-center' : '',
                )}
                style={{
                    width: isVerticalEdge
                        ? 'clamp(4.9rem, 9.4vmin, 6.4rem)'
                        : 'clamp(5.8rem, 11vmin, 8.2rem)',
                    aspectRatio: cardAspectRatio,
                    transform: `translate(-50%, -50%)${isVerticalEdge ? ' rotate(90deg)' : ''}`,
                }}
                data-testid="mage-wars-wall-card-preview"
                data-tutorial-id={`mw-wall-card-${wall.sourceSpellCardId}`}
                data-source-card-id={wall.sourceSpellCardId}
                data-wall-visual="spell-card"
                data-wall-edge-orientation={orientation}
            >
                <CardPreview
                    previewRef={previewRef}
                    className="h-full w-full rounded-[0.2rem]"
                    title={title}
                    alt={title}
                />
            </span>
        </span>
    );
}

function getObjectAbilityChoiceLabel(
    selection: ChoiceRequestDirectSelectionTarget<MageWarsObjectAbilityActivationChoiceValue>,
): string {
    if (selection.value?.mode === 'melee-bonus') return '近战加成';
    if (selection.value?.mode === 'heal') return '治疗';
    return selection.label ?? String(selection.value?.boundSpellCardId ?? selection.id);
}

function getSpellCastChoiceLabel(
    selection: ChoiceRequestDirectSelectionTarget<MageWarsSpellCastChoiceValue>,
): string {
    if (selection.value?.boundSpellCardId === undefined && selection.metadata?.targetMode === 'player-bound-spell') {
        return '不绑定法术';
    }
    return selection.label ?? String(selection.value?.boundSpellCardId ?? selection.id);
}

function MageSpellCastChoiceDock({
    spellName,
    targetPlayer,
    selections,
    onSelect,
    onCancel,
}: {
    spellName?: string;
    targetPlayer?: MageWarsPlayerState;
    selections: readonly ChoiceRequestDirectSelectionTarget<MageWarsSpellCastChoiceValue>[];
    onSelect: (selection: ChoiceRequestDirectSelectionTarget<MageWarsSpellCastChoiceValue>) => void;
    onCancel: () => void;
}) {
    const { t } = useTranslation('game-mage-wars');
    if (selections.length === 0) return null;

    return (
        <aside
            className="pointer-events-none absolute inset-x-0 top-[9.25rem] z-50 flex justify-center px-4"
            data-testid="mage-wars-spell-cast-choice-dock"
        >
            <section className="pointer-events-auto w-full max-w-[34rem] rounded-[0.35rem] border border-sky-100/18 bg-stone-950/90 px-4 py-3 shadow-[0_18px_42px_rgba(0,0,0,0.55)]">
                <div className="mb-3 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <div className="text-sm font-bold text-sky-100">
                            {spellName ?? t('interaction.spellCastChoice.fallbackTitle')}
                        </div>
                        {targetPlayer ? (
                            <div className="mt-0.5 truncate text-xs font-semibold text-stone-300">
                                {targetPlayer.mageId}
                            </div>
                        ) : null}
                    </div>
                    <button
                        type="button"
                        className="shrink-0 rounded-[0.25rem] border border-stone-500/60 px-2.5 py-1 text-xs font-bold text-stone-200 transition hover:border-stone-300 hover:bg-stone-800"
                        data-testid="mage-wars-spell-cast-choice-cancel"
                        onClick={onCancel}
                    >
                        {t('interaction.mageAbilityStatusChoice.cancel')}
                    </button>
                </div>
                <div className="grid gap-2">
                    {selections.map((selection) => {
                        const manaCost = selection.value?.manaCost ?? 0;
                        return (
                            <button
                                key={selection.id}
                                type="button"
                                className="flex min-h-12 items-center justify-between gap-3 rounded-[0.28rem] border border-sky-100/16 bg-sky-950/30 px-3 py-2 text-left transition hover:border-sky-100/48 hover:bg-sky-900/42"
                                data-testid="mage-wars-spell-cast-choice-option"
                                data-choice-id={selection.id}
                                data-bound-spell-card-id={selection.value?.boundSpellCardId}
                                data-mana-cost={manaCost}
                                onClick={() => onSelect(selection)}
                            >
                                <span className="min-w-0 truncate text-xs font-bold text-stone-100">
                                    {getSpellCastChoiceLabel(selection)}
                                </span>
                                <span className="shrink-0 rounded-full border border-sky-200/30 bg-sky-950/38 px-2.5 py-1 text-xs font-black text-sky-100">
                                    {t('interaction.mageAbilityStatusChoice.manaCost', { manaCost })}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </section>
        </aside>
    );
}

function MageObjectAbilityChoiceDock({
    abilityName,
    targetObject,
    selections,
    onSelect,
    onCancel,
}: {
    abilityName?: string;
    targetObject?: MageWarsArenaObjectState;
    selections: readonly ChoiceRequestDirectSelectionTarget<MageWarsObjectAbilityActivationChoiceValue>[];
    onSelect: (selection: ChoiceRequestDirectSelectionTarget<MageWarsObjectAbilityActivationChoiceValue>) => void;
    onCancel: () => void;
}) {
    const { t } = useTranslation('game-mage-wars');
    if (selections.length === 0) return null;

    return (
        <aside
            className="pointer-events-none absolute inset-x-0 top-[9.25rem] z-50 flex justify-center px-4"
            data-testid="mage-wars-object-ability-choice-dock"
        >
            <section className="pointer-events-auto w-full max-w-[34rem] rounded-[0.35rem] border border-amber-100/18 bg-stone-950/90 px-4 py-3 shadow-[0_18px_42px_rgba(0,0,0,0.55)]">
                <div className="mb-3 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <div className="text-sm font-bold text-amber-100">
                            {abilityName ?? t('interaction.objectAbilityChoice.fallbackTitle')}
                        </div>
                        {targetObject ? (
                            <div className="mt-0.5 truncate text-xs font-semibold text-stone-300">
                                {targetObject.name}
                            </div>
                        ) : null}
                    </div>
                    <button
                        type="button"
                        className="shrink-0 rounded-[0.25rem] border border-stone-500/60 px-2.5 py-1 text-xs font-bold text-stone-200 transition hover:border-stone-300 hover:bg-stone-800"
                        data-testid="mage-wars-object-ability-choice-cancel"
                        onClick={onCancel}
                    >
                        {t('interaction.mageAbilityStatusChoice.cancel')}
                    </button>
                </div>
                <div className="grid gap-2">
                    {selections.map((selection) => {
                        const manaCost = selection.value?.manaCost ?? 0;
                        return (
                            <button
                                key={selection.id}
                                type="button"
                                className="flex min-h-12 items-center justify-between gap-3 rounded-[0.28rem] border border-amber-100/16 bg-amber-950/30 px-3 py-2 text-left transition hover:border-amber-100/48 hover:bg-amber-900/42"
                                data-testid="mage-wars-object-ability-choice-option"
                                data-choice-id={selection.id}
                                data-mode={selection.value?.mode}
                                data-bound-spell-card-id={selection.value?.boundSpellCardId}
                                data-mana-cost={manaCost}
                                onClick={() => onSelect(selection)}
                            >
                                <span className="min-w-0 truncate text-xs font-bold text-stone-100">
                                    {getObjectAbilityChoiceLabel(selection)}
                                </span>
                                <span className="shrink-0 rounded-full border border-amber-200/30 bg-amber-950/38 px-2.5 py-1 text-xs font-black text-amber-100">
                                    {t('interaction.mageAbilityStatusChoice.manaCost', { manaCost })}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </section>
        </aside>
    );
}

function MageAbilityStatusChoiceDock({
    targetObject,
    selections,
    onSelect,
    onCancel,
}: {
    targetObject?: MageWarsArenaObjectState;
    selections: readonly ChoiceRequestDirectSelectionTarget<MageWarsMageAbilityActivationChoiceValue>[];
    onSelect: (selection: ChoiceRequestDirectSelectionTarget<MageWarsMageAbilityActivationChoiceValue>) => void;
    onCancel: () => void;
}) {
    const { t } = useTranslation('game-mage-wars');
    if (!targetObject || selections.length <= 1) return null;

    return (
        <aside
            className="pointer-events-none absolute inset-x-0 top-[9.25rem] z-50 flex justify-center px-4"
            data-testid="mage-wars-mage-ability-status-choice-dock"
        >
            <section className="pointer-events-auto w-full max-w-[34rem] rounded-[0.35rem] border border-cyan-100/18 bg-stone-950/90 px-4 py-3 shadow-[0_18px_42px_rgba(0,0,0,0.55)]">
                <div className="mb-3 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <div className="text-sm font-bold text-cyan-100">
                            {t('interaction.mageAbilityStatusChoice.title')}
                        </div>
                        <div className="mt-0.5 truncate text-xs font-semibold text-stone-300">
                            {targetObject.name}
                        </div>
                    </div>
                    <button
                        type="button"
                        className="shrink-0 rounded-[0.25rem] border border-stone-500/60 px-2.5 py-1 text-xs font-bold text-stone-200 transition hover:border-stone-300 hover:bg-stone-800"
                        data-testid="mage-wars-mage-ability-status-choice-cancel"
                        onClick={onCancel}
                    >
                        {t('interaction.mageAbilityStatusChoice.cancel')}
                    </button>
                </div>
                <div className="grid gap-2">
                    {selections.map((selection) => {
                        const statusTokenIds = selection.value?.statusTokenIds ?? [];
                        const manaCost = selection.value?.manaCost ?? 0;
                        const statusNames = statusTokenIds
                            .map((statusTokenId) => getVisibleStatusTokenLabel(t, statusTokenId))
                            .join(' + ');
                        return (
                            <button
                                key={selection.id}
                                type="button"
                                className="flex min-h-12 items-center justify-between gap-3 rounded-[0.28rem] border border-cyan-100/16 bg-cyan-950/30 px-3 py-2 text-left transition hover:border-cyan-100/48 hover:bg-cyan-900/42"
                                data-testid="mage-wars-mage-ability-status-option"
                                data-choice-id={selection.id}
                                data-status-token-ids={statusTokenIds.join(',')}
                                data-mana-cost={manaCost}
                                onClick={() => onSelect(selection)}
                            >
                                <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                                    {statusTokenIds.map((statusTokenId) => {
                                        const token = VISIBLE_STATUS_TOKENS.find((candidate) => candidate.id === statusTokenId);
                                        return token ? (
                                            <span
                                                key={statusTokenId}
                                                className="inline-flex items-center gap-1 rounded-full bg-black/45 px-2 py-1 text-xs font-bold text-cyan-50"
                                            >
                                                <TokenImage src={token.image} alt={getVisibleStatusTokenLabel(t, statusTokenId)} className="h-5 w-5" />
                                                {getVisibleStatusTokenLabel(t, statusTokenId)}
                                            </span>
                                        ) : null;
                                    })}
                                    {statusTokenIds.length === 0 ? (
                                        <span className="text-xs font-bold text-stone-200">{statusNames}</span>
                                    ) : null}
                                </span>
                                <span className="shrink-0 rounded-full border border-amber-200/30 bg-amber-950/38 px-2.5 py-1 text-xs font-black text-amber-100">
                                    {t('interaction.mageAbilityStatusChoice.manaCost', { manaCost })}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </section>
        </aside>
    );
}

function MageWarsInteractionDock({
    interaction,
    playerId,
    dispatch,
}: {
    interaction?: InteractionDescriptor;
    playerId: PlayerId;
    dispatch: Props['dispatch'];
}) {
    const { t } = useTranslation('game-mage-wars');
    const prompt = asSimpleChoice(interaction);
    if (!prompt || prompt.playerId !== playerId) return null;

    const title = t(prompt.titleKey ?? prompt.title, {
        ...(prompt.titleParams ?? {}),
        defaultValue: prompt.title,
    });

    return (
        <aside
            className="pointer-events-none absolute inset-x-0 top-[5.5rem] z-50 flex justify-center px-4"
            data-testid="mage-wars-interaction-dock"
        >
            <section className="pointer-events-auto flex max-w-[38rem] items-center gap-3 rounded-[0.35rem] bg-stone-950/88 px-4 py-3 shadow-[0_16px_38px_rgba(0,0,0,0.52)]">
                <div className="min-w-0 text-sm font-semibold text-amber-100">{title}</div>
                <div className="flex shrink-0 items-center gap-2">
                    {prompt.options.filter((option) => !option.disabled).map((option) => (
                        <button
                            key={option.id}
                            type="button"
                            className="min-h-9 rounded-[0.25rem] bg-amber-200 px-3 py-1.5 text-xs font-bold text-stone-950 transition hover:bg-amber-100"
                            data-testid="mage-wars-interaction-option"
                            data-option-id={option.id}
                            onClick={() => dispatch(INTERACTION_COMMANDS.RESPOND, {
                                interactionId: prompt.id,
                                optionId: option.id,
                            })}
                        >
                            {t(option.labelKey ?? option.label, {
                                ...(option.labelParams ?? {}),
                                defaultValue: option.label,
                            })}
                        </button>
                    ))}
                </div>
            </section>
        </aside>
    );
}

export default function MageWarsBoard({ G, playerID, dispatch, reset, matchData, isMultiplayer }: Props) {
    const { t } = useTranslation('game-mage-wars');
    const [selectedSpellCardId, setSelectedSpellCardId] = useState<number | null>(null);
    const [selectedPlanningSpellCardIds, setSelectedPlanningSpellCardIds] = useState<number[]>([]);
    const [pendingSpellCastSelection, setPendingSpellCastSelection] = useState<PendingSpellCastSelection | null>(null);
    const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
    const [selectedMageId, setSelectedMageId] = useState<PlayerId | null>(null);
    const [pendingObjectAbility, setPendingObjectAbility] = useState<PendingObjectAbilitySelection | null>(null);
    const [pendingObjectAbilityTargetObjectId, setPendingObjectAbilityTargetObjectId] = useState<string | null>(null);
    const [pendingMageAbility, setPendingMageAbility] = useState<PendingMageAbilitySelection | null>(null);
    const [pendingMageAbilityStatusTargetObjectId, setPendingMageAbilityStatusTargetObjectId] = useState<string | null>(null);
    const [showBoardLifeTotals, setShowBoardLifeTotals] = useState(false);
    const [magnifiedPreview, setMagnifiedPreview] = useState<MageWarsMagnifiedPreview | null>(null);
    const [publicViewTargetPlayerId, setPublicViewTargetPlayerId] = useState<PlayerId | null>(null);
    const viewport = useRuntimeViewport();
    const isLandscapeMobileViewport = viewport.width <= 1023 && viewport.width > viewport.height;
    const desktopBottomGap = isLandscapeMobileViewport ? 0 : MAGE_WARS_DESKTOP_BOTTOM_GAP_PX;
    const cameraFitInsets = useMemo(() => {
        if (!isLandscapeMobileViewport) {
            return undefined;
        }

        return {
            bottom: Math.min(
                Math.max(
                    MAGE_WARS_MIN_CAMERA_BOTTOM_UI_INSET,
                    Math.round(viewport.height * MAGE_WARS_CAMERA_BOTTOM_UI_INSET_RATIO),
                ),
                Math.round(viewport.height * MAGE_WARS_MAX_CAMERA_BOTTOM_UI_INSET_RATIO),
            ) + desktopBottomGap,
        };
    }, [desktopBottomGap, isLandscapeMobileViewport, viewport.height]);
    const phase = G.sys.phase ?? 'reset';
    const core = G.core;
    const players = core.playerOrder.map((id) => core.players[id]).filter(Boolean);
    const viewingPlayerId = resolveViewingPlayerId(core, playerID);
    const phaseActorId = resolveMageWarsPhaseActorId(core);
    const activePlayer = core.players[phaseActorId] ?? players[0];
    const activeOpponentId = resolveOpponentId(core, activePlayer?.id ?? viewingPlayerId);
    const activeOpponent = activeOpponentId ? core.players[activeOpponentId] ?? null : null;
    const viewingPlayer = core.players[viewingPlayerId] ?? activePlayer;
    const publicViewPlayerId = publicViewTargetPlayerId
        && publicViewTargetPlayerId !== viewingPlayerId
        && core.players[publicViewTargetPlayerId]
        ? publicViewTargetPlayerId
        : viewingPlayerId;
    const publicViewPlayer = core.players[publicViewPlayerId] ?? viewingPlayer;
    const isOpponentPublicView = publicViewPlayerId !== viewingPlayerId;
    const opponentId = resolveOpponentId(core, viewingPlayerId);
    const opponent = opponentId ? core.players[opponentId] ?? null : null;
    const gameOverResult = G.sys.gameover;
    const { overlayProps: endgameProps } = useEndgame({
        result: gameOverResult || undefined,
        playerID,
        reset,
        matchData,
        isMultiplayer,
    });
    const readyPlayerIds = core.phaseReadyPlayerIds ?? [];
    const tutorialRuntimeSyncKey = buildMageWarsTutorialRuntimeSyncKey({
        core,
        phase,
        phaseActorId,
        sys: G.sys,
    });
    useTutorialBridge(G.sys.tutorial, dispatch, tutorialRuntimeSyncKey);
    const { isActive: isTutorialActive, currentStep: tutorialStep, nextStep } = useTutorial();
    const boardTutorialStep = G.sys.tutorial.step ?? G.sys.tutorial.steps[G.sys.tutorial.stepIndex] ?? tutorialStep;
    const boardTutorialActive = isTutorialActive || G.sys.tutorial.active;
    const boardTutorialHighlightTarget = boardTutorialActive ? boardTutorialStep?.highlightTarget : undefined;
    const isCommandAllowed = (commandType: string) => {
        if (!isTutorialActive || !tutorialStep) return true;
        if (tutorialStep.allowedCommands) return tutorialStep.allowedCommands.includes(commandType);
        return !tutorialStep.infoStep;
    };
    const isLocalPlanningTutorialStep = isTutorialActive
        && tutorialStep?.id != null
        && MAGE_WARS_LOCAL_PLANNING_TUTORIAL_STEP_IDS.has(tutorialStep.id);
    const canAdvance = isPlayerId(playerID)
        && !readyPlayerIds.includes(playerID)
        && (SIMULTANEOUS_PREPARATION_PHASES.has(phase) || playerID === phaseActorId)
        && isCommandAllowed(FLOW_COMMANDS.ADVANCE_PHASE);
    const canAct = isPlayerId(playerID)
        && !readyPlayerIds.includes(playerID)
            && (phase === 'planning' || playerID === phaseActorId);
    const canPlanSpells = isCommandAllowed(MAGE_WARS_COMMANDS.PLAN_SPELLS);
    const canEditPlanningDrafts = canPlanSpells || isLocalPlanningTutorialStep;
    const canSubmitSelectedPlanningSpells = phase === 'planning'
        && canAct
        && canPlanSpells
        && selectedPlanningSpellCardIds.length > 0;
    const togglePublicViewTarget = (targetPlayerId: PlayerId | null) => {
        if (!targetPlayerId || targetPlayerId === viewingPlayerId) {
            setPublicViewTargetPlayerId(null);
            if (isTutorialActive && tutorialStep?.id === 'back-to-self-view') {
                nextStep('manual');
            }
            return;
        }
        const willObserveTarget = publicViewPlayerId !== targetPlayerId;
        setPublicViewTargetPlayerId((current) => (current === targetPlayerId ? null : targetPlayerId));
        if (willObserveTarget && isTutorialActive && tutorialStep?.id === 'opponent-public-view') {
            nextStep('manual');
        }
    };

    const planSelectedSpells = () => {
        if (!canSubmitSelectedPlanningSpells) return;
        dispatch(MAGE_WARS_COMMANDS.PLAN_SPELLS, { spellCardIds: selectedPlanningSpellCardIds });
        setSelectedPlanningSpellCardIds([]);
    };
    const removePlanningDraftAtSlot = (slotIndex: number) => {
        setSelectedPlanningSpellCardIds((current) => current.filter((_, index) => index !== slotIndex));
    };
    const completeLocalTutorialStep = (expectedStepId: string) => {
        if (isTutorialActive && tutorialStep?.id === expectedStepId) {
            nextStep('manual');
        }
    };
    const availableObjectAbilityIdsByObjectId = new Map<string, MageWarsObjectAbilityId[]>();
    if (canAct && activePlayer && isCommandAllowed(MAGE_WARS_COMMANDS.USE_ARENA_OBJECT_ABILITY)) {
        for (const object of Object.values(core.objects)) {
            if (object.ownerId !== activePlayer.id) continue;
            const abilityIds = MAGE_WARS_OBJECT_ABILITY_ID_LIST.filter((abilityId) => {
                const opportunity = buildMageWarsObjectAbilityActivationOpportunity({
                    state: G,
                    playerId: object.ownerId,
                    objectId: object.id,
                    abilityId,
                });
                const request = opportunity ? buildChoiceRequestFromOpportunity(opportunity) : null;
                return hasEnabledChoiceCandidate(request?.candidates);
            });
            if (abilityIds.length > 0) availableObjectAbilityIdsByObjectId.set(object.id, abilityIds);
        }
    }
    const objectAbilitySourceIds = new Set(availableObjectAbilityIdsByObjectId.keys());
    const pendingObjectAbilityOpportunity = (() => {
        if (!pendingObjectAbility) return null;
        const sourceObject = core.objects[pendingObjectAbility.objectId];
        if (!sourceObject) return null;
        return buildMageWarsObjectAbilityActivationOpportunity({
            state: G,
            playerId: sourceObject.ownerId,
            objectId: sourceObject.id,
            abilityId: pendingObjectAbility.abilityId,
        });
    })();
    const pendingObjectAbilityRequest = pendingObjectAbilityOpportunity
        ? buildChoiceRequestFromOpportunity(pendingObjectAbilityOpportunity)
        : null;
    const pendingObjectAbilityTargetSurface = pendingObjectAbilityRequest
        ? projectChoiceRequestToDirectSelectionTargets<MageWarsObjectAbilityActivationChoiceValue>(
            pendingObjectAbilityRequest,
            { playerId: pendingObjectAbilityRequest.playerId },
        )
        : null;
    const pendingObjectAbilityTargetsByObjectId = buildObjectAbilityTargetsByObjectId(
        pendingObjectAbilityTargetSurface?.targets,
    );
    const pendingObjectAbilityTargetIds = new Set(pendingObjectAbilityTargetsByObjectId.keys());
    const pendingObjectAbilityTargetObject = pendingObjectAbilityTargetObjectId
        ? core.objects[pendingObjectAbilityTargetObjectId]
        : undefined;
    const pendingObjectAbilityTargetSelections = pendingObjectAbilityTargetObjectId
        ? pendingObjectAbilityTargetsByObjectId.get(pendingObjectAbilityTargetObjectId) ?? []
        : [];
    const pendingObjectAbilityCardSelections = pendingObjectAbilityTargetSurface?.targets
        .filter((target) => !target.disabled && !target.stale && typeof target.targetRef === 'number')
        .sort(compareObjectAbilityTargets) ?? [];
    const pendingObjectAbilityDef = pendingObjectAbility
        ? mageWarsObjectAbilityRegistry.get(pendingObjectAbility.abilityId)
        : undefined;
    const pendingObjectAbilityChoiceSelections = pendingObjectAbilityTargetSelections.length > 1
        ? pendingObjectAbilityTargetSelections
        : pendingObjectAbilityRequest?.kind === 'select-card'
            ? pendingObjectAbilityCardSelections
            : [];
    const pendingMageAbilityOpportunity = pendingMageAbility
        ? buildMageWarsMageAbilityActivationOpportunity({
            state: G,
            playerId: pendingMageAbility.playerId,
            abilityId: pendingMageAbility.abilityId,
        })
        : null;
    const pendingMageAbilityRequest = pendingMageAbilityOpportunity
        ? buildChoiceRequestFromOpportunity(pendingMageAbilityOpportunity)
        : null;
    const pendingMageAbilityTargetSurface = pendingMageAbilityRequest
        ? projectChoiceRequestToDirectSelectionTargets<MageWarsMageAbilityActivationChoiceValue>(
            pendingMageAbilityRequest,
            { playerId: pendingMageAbilityRequest.playerId },
        )
        : null;
    const pendingMageAbilityTargetsByObjectId = buildMageAbilityTargetsByObjectId(
        pendingMageAbilityTargetSurface?.targets,
    );
    const pendingMageAbilityTargetIds = new Set(pendingMageAbilityTargetsByObjectId.keys());
    const pendingMageAbilityStatusTargetObject = pendingMageAbilityStatusTargetObjectId
        ? core.objects[pendingMageAbilityStatusTargetObjectId]
        : undefined;
    const pendingMageAbilityStatusSelections = pendingMageAbilityStatusTargetObjectId
        ? pendingMageAbilityTargetsByObjectId.get(pendingMageAbilityStatusTargetObjectId) ?? []
        : [];
    const phasePriestessRestoreAbilityId = resolveMageWarsPriestessRestoreAbilityIdForPhase(phase);
    const mageRestoreAvailablePlayerIds = new Set<PlayerId>(
        phasePriestessRestoreAbilityId
            ? players
                .filter((player) => {
                    const opportunity = buildMageWarsMageAbilityActivationOpportunity({
                        state: G,
                        playerId: player.id,
                        abilityId: phasePriestessRestoreAbilityId,
                    });
                    const request = opportunity ? buildChoiceRequestFromOpportunity(opportunity) : null;
                    return hasEnabledChoiceCandidate(request?.candidates);
                })
                .map((player) => player.id)
            : [],
    );
    const selectedSpell = selectedSpellCardId == null
        ? undefined
        : getMageWarsSpellCardFromConfig(selectedSpellCardId);
    const selectedSpellCastOpportunity = selectedSpellCardId != null && activePlayer
        ? buildMageWarsSpellCastOpportunity({
            state: G,
            playerId: activePlayer.id,
            spellCardId: selectedSpellCardId,
        })
        : null;
    const selectedSpellCastRequest = selectedSpellCastOpportunity
        ? buildChoiceRequestFromOpportunity(selectedSpellCastOpportunity)
        : null;
    const selectedSpellCastTargetSurface = selectedSpellCastRequest
        ? projectChoiceRequestToDirectSelectionTargets<MageWarsSpellCastChoiceValue>(
            selectedSpellCastRequest,
            { playerId: selectedSpellCastRequest.playerId },
        )
        : null;
    const hasSelectedSpellCastContract = selectedSpellCastTargetSurface != null;
    const selectedSpellCastTargetsByObjectId = selectedSpellCastTargetSurface
        ? buildSpellCastTargetsByObjectId(selectedSpellCastTargetSurface.targets)
        : undefined;
    const selectedSpellCastTargetIds = selectedSpellCastTargetsByObjectId
        ? new Set(selectedSpellCastTargetsByObjectId.keys())
        : undefined;
    const selectedSpellCastTargetsByPlayerId = selectedSpellCastTargetSurface
        ? buildSpellCastTargetsByPlayerId(selectedSpellCastTargetSurface.targets)
        : undefined;
    const selectedSpellCastTargetPlayerIds = selectedSpellCastTargetsByPlayerId && selectedSpellCastTargetsByPlayerId.size > 0
        ? new Set(selectedSpellCastTargetsByPlayerId.keys())
        : undefined;
    const selectedSpellCastTargetsByZoneId = selectedSpellCastTargetSurface
        ? buildSpellCastTargetsByZoneId(selectedSpellCastTargetSurface.targets)
        : undefined;
    const selectedSpellCastTargetZoneIds = selectedSpellCastTargetsByZoneId && selectedSpellCastTargetsByZoneId.size > 0
        ? new Set(selectedSpellCastTargetsByZoneId.keys())
        : undefined;
    const selectedSpellCastTargetsByWallEdgeId = selectedSpellCastTargetSurface
        ? buildSpellCastTargetsByWallEdgeId(selectedSpellCastTargetSurface.targets)
        : undefined;
    const selectedSpellCastTargetWallEdgeIds = selectedSpellCastTargetsByWallEdgeId && selectedSpellCastTargetsByWallEdgeId.size > 0
        ? new Set(selectedSpellCastTargetsByWallEdgeId.keys())
        : undefined;
    const selectedSpellCastEnabledPayloads = (selectedSpellCastTargetSurface?.targets ?? [])
        .filter((targetSelection) => targetSelection.disabled !== true && targetSelection.stale !== true)
        .map(readMageWarsCastSpellPayload)
        .filter((payload): payload is MageWarsCastSpellCommand['payload'] => payload != null);
    const pendingSpellTargetObjectId = pendingSpellCastSelection?.kind === 'object'
        ? pendingSpellCastSelection.objectId
        : null;
    const pendingSpellTargetPlayerId = pendingSpellCastSelection?.kind === 'player'
        ? pendingSpellCastSelection.playerId
        : null;
    const pendingSpellChainTargetObjectIds = pendingSpellCastSelection?.kind === 'object'
        ? pendingSpellCastSelection.chainTargetObjectIds
        : [];
    const pendingSpellCastTargetSelections = pendingSpellTargetObjectId && selectedSpellCastTargetsByObjectId
        ? selectedSpellCastTargetsByObjectId.get(pendingSpellTargetObjectId) ?? []
        : [];
    const pendingSpellCastPlayerSelections = pendingSpellTargetPlayerId && selectedSpellCastTargetsByPlayerId
        ? selectedSpellCastTargetsByPlayerId.get(pendingSpellTargetPlayerId) ?? []
        : [];
    const pendingSpellTargetPlayer = pendingSpellTargetPlayerId
        ? core.players[pendingSpellTargetPlayerId]
        : undefined;
    const pendingSpellCastDestinationSelections = pendingSpellCastTargetSelections.length > 0
        ? pendingSpellCastTargetSelections
        : pendingSpellCastPlayerSelections;
    const selectedSpellCastDestinationZoneIds = pendingSpellCastDestinationSelections.length > 0
        ? buildNonEmptySet(pendingSpellCastDestinationSelections
            .map((targetSelection) => {
                const payload = readMageWarsCastSpellPayload(targetSelection);
                return payload?.pushToZoneId ?? payload?.targetZoneId;
            })
            .filter((zoneId): zoneId is ArenaZoneId => zoneId !== undefined))
        : undefined;
    const selectedSpellCastNewTargetObjectIds = pendingSpellCastTargetSelections.length > 0
        ? buildNonEmptySet(pendingSpellCastTargetSelections
            .map((targetSelection) => readMageWarsCastSpellPayload(targetSelection)?.newTargetObjectId)
            .filter((objectId): objectId is string => objectId !== undefined))
        : undefined;
    const selectedSpellCastNewTargetPlayerIds = pendingSpellCastTargetSelections.length > 0
        ? buildNonEmptySet(pendingSpellCastTargetSelections
            .map((targetSelection) => readMageWarsCastSpellPayload(targetSelection)?.newTargetPlayerId)
            .filter((playerId): playerId is PlayerId => playerId !== undefined))
        : undefined;
    const selectedSpellCastNewTargetZoneIds = pendingSpellCastTargetSelections.length > 0
        ? buildNonEmptySet(pendingSpellCastTargetSelections
            .map((targetSelection) => readMageWarsCastSpellPayload(targetSelection)?.newTargetZoneId)
            .filter((zoneId): zoneId is ArenaZoneId => zoneId !== undefined))
        : undefined;
    const selectedObject = selectedObjectId ? core.objects[selectedObjectId] : undefined;
    const selectedObjectAvailableAbilityIds = new Set<MageWarsObjectAbilityId>(
        selectedObject ? availableObjectAbilityIdsByObjectId.get(selectedObject.id) ?? [] : [],
    );
    const selectedMage = selectedMageId ? core.players[selectedMageId] : undefined;
    const selectedMageAvailableAbilityIds = new Set<MageWarsMageAbilityId>(
        selectedMage && phasePriestessRestoreAbilityId && mageRestoreAvailablePlayerIds.has(selectedMage.id)
            ? [phasePriestessRestoreAbilityId]
            : [],
    );
    const selectedObjectAvailableAbilities = selectedObject
        ? MAGE_WARS_OBJECT_ABILITY_ID_LIST.flatMap((abilityId) => {
            if (!selectedObjectAvailableAbilityIds.has(abilityId)) return [];
            const ability = mageWarsObjectAbilityRegistry.get(abilityId);
            return ability ? [ability] : [];
        })
        : [];
    const selectedMageRestoreAbility = selectedMage && phasePriestessRestoreAbilityId
        && selectedMageAvailableAbilityIds.has(phasePriestessRestoreAbilityId)
        ? getMageWarsMageAbilityFromConfig(selectedMage.mageId, phasePriestessRestoreAbilityId)
        : undefined;
    const canGuardSelectedActor = Boolean(
        canAct
        && isCreatureActionPhase(phase)
        && isCommandAllowed(MAGE_WARS_COMMANDS.GUARD)
        && !selectedSpell
        && !pendingSpellCastSelection
        && !pendingObjectAbility
        && !pendingMageAbility
        && !G.sys.interaction?.current
        && (
            (selectedObject?.ownerId === activePlayer?.id && selectedObject.actionReady)
            || (selectedMage?.id === activePlayer?.id && selectedMage.actionReady)
        ),
    );
    const shouldShowSelectedAbilityActionDock = Boolean(
        !selectedSpell
        && !pendingSpellCastSelection
        && !pendingObjectAbility
        && !pendingMageAbility
        && !G.sys.interaction?.current
        && (selectedObjectAvailableAbilities.length > 0 || selectedMageRestoreAbility || canGuardSelectedActor),
    );
    const spellNeedsWallEdgeTarget = selectedSpellCastTargetWallEdgeIds !== undefined;
    const selectedSpellUsesConfirmChoice = selectedSpellCastRequest?.kind === 'confirm';
    const spellNeedsDestinationZone = selectedSpellCastEnabledPayloads.some((payload) => (
        (payload.targetObjectId !== undefined || payload.targetPlayerId !== undefined)
        && (payload.pushToZoneId !== undefined || payload.targetZoneId !== undefined)
    ));
    const spellNeedsNewAnchorTarget = selectedSpellCastEnabledPayloads.some((payload) => (
        payload.targetObjectId !== undefined
        && (
            payload.newTargetObjectId !== undefined
            || payload.newTargetPlayerId !== undefined
            || payload.newTargetZoneId !== undefined
        )
    ));
    const spellNeedsChainTargets = selectedSpellCastEnabledPayloads.some((payload) => (
        payload.targetObjectId !== undefined
        && payload.chainLightningTargets !== undefined
    ));
    const pendingSpellChainPathObjectIds = pendingSpellTargetObjectId
        ? [pendingSpellTargetObjectId, ...pendingSpellChainTargetObjectIds]
        : [];
    const pendingSpellChainSelections = spellNeedsChainTargets && pendingSpellChainPathObjectIds.length > 0
        ? pendingSpellCastTargetSelections.filter((targetSelection) => (
            startsWithObjectPath(readMageWarsCastSpellChainObjectIds(targetSelection), pendingSpellChainPathObjectIds)
        ))
        : [];
    const selectedSpellCastChainPathObjectIds = pendingSpellChainPathObjectIds.length > 0
        ? buildNonEmptySet(pendingSpellChainPathObjectIds)
        : undefined;
    const selectedSpellCastNextChainTargetObjectIds = pendingSpellChainSelections.length > 0
        ? buildNonEmptySet(pendingSpellChainSelections
            .map((targetSelection) => readMageWarsCastSpellChainObjectIds(targetSelection)[pendingSpellChainPathObjectIds.length])
            .filter((objectId): objectId is string => objectId !== undefined))
        : undefined;
    const selectedSpellCastCurrentChainSelection = pendingSpellChainSelections.find((targetSelection) => (
        hasSameObjectPath(readMageWarsCastSpellChainObjectIds(targetSelection), pendingSpellChainPathObjectIds)
    ));
    const selectedSpellCastCurrentChainSubmitObjectId = selectedSpellCastCurrentChainSelection
        ? pendingSpellChainPathObjectIds[pendingSpellChainPathObjectIds.length - 1]
        : undefined;
    const tutorialLaneScrollTargetKey = (() => {
        if (!boardTutorialActive) return '';
        const arenaObjectTargetIds = new Set<string>();
        const addArenaObjectTarget = (objectId: string) => {
            arenaObjectTargetIds.add(`mw-arena-object-${objectId}`);
        };
        if (pendingObjectAbility) {
            pendingObjectAbilityTargetIds.forEach(addArenaObjectTarget);
        }
        if (pendingMageAbility) {
            pendingMageAbilityTargetIds.forEach(addArenaObjectTarget);
        }
        if (selectedSpellCardId != null) {
            selectedSpellCastTargetIds?.forEach(addArenaObjectTarget);
            selectedSpellCastNewTargetObjectIds?.forEach(addArenaObjectTarget);
            selectedSpellCastNextChainTargetObjectIds?.forEach(addArenaObjectTarget);
            if (selectedSpellCastCurrentChainSubmitObjectId) {
                addArenaObjectTarget(selectedSpellCastCurrentChainSubmitObjectId);
            }
        }
        if (arenaObjectTargetIds.size > 0) {
            return Array.from(arenaObjectTargetIds).sort().join('|');
        }
        const targetIds = new Set<string>();
        if (boardTutorialHighlightTarget) targetIds.add(boardTutorialHighlightTarget);
        return Array.from(targetIds).sort().join('|');
    })();
    const tutorialArenaPanTarget = useMemo(() => (
        boardTutorialActive
            ? resolveMageWarsTutorialArenaPanTarget(boardTutorialHighlightTarget)
            : null
    ), [boardTutorialActive, boardTutorialHighlightTarget]);
    useLayoutEffect(() => {
        if (!tutorialLaneScrollTargetKey || typeof document === 'undefined' || typeof window === 'undefined') {
            return undefined;
        }
        const targetIds = tutorialLaneScrollTargetKey.split('|').filter(Boolean);
        const scrollVisibleTutorialTargetsIntoLane = () => {
            for (const targetId of targetIds) {
                const escapedTargetId = escapeCssAttributeValue(targetId);
                const target = document.querySelector<HTMLElement>(
                    `[data-tutorial-id="${escapedTargetId}"],[data-tutorial-object-id="${escapedTargetId}"]`,
                );
                const lane = target?.closest<HTMLElement>('[data-lane-owner-side][data-lane-stack-axis="vertical"]');
                if (!target || !lane) continue;

                const laneRect = lane.getBoundingClientRect();
                const targetRect = target.getBoundingClientRect();
                if (laneRect.height <= 0 || targetRect.height <= 0) continue;

                const targetIsAboveLane = targetRect.top < laneRect.top;
                const targetIsBelowLane = targetRect.bottom > laneRect.bottom;
                if (!targetIsAboveLane && !targetIsBelowLane) continue;

                const targetCenterY = targetRect.top + targetRect.height / 2;
                const laneCenterY = laneRect.top + lane.clientHeight / 2;
                lane.scrollTop += targetCenterY - laneCenterY;
            }
        };
        scrollVisibleTutorialTargetsIntoLane();
        const frameId = window.requestAnimationFrame(scrollVisibleTutorialTargetsIntoLane);
        return () => window.cancelAnimationFrame(frameId);
    }, [tutorialLaneScrollTargetKey]);
    const submitSpellCastTargetSelection = (
        targetSelection: ChoiceRequestDirectSelectionTarget<MageWarsSpellCastChoiceValue>,
    ): boolean => {
        const command = targetSelection.commandPreview.find((candidateCommand) => (
            candidateCommand.type === MAGE_WARS_COMMANDS.CAST_SPELL
        ));
        if (!command || !isCommandAllowed(MAGE_WARS_COMMANDS.CAST_SPELL)) return false;
        dispatch(MAGE_WARS_COMMANDS.CAST_SPELL, command.payload);
        setSelectedSpellCardId(null);
        setPendingSpellCastSelection(null);
        setSelectedObjectId(null);
        setSelectedMageId(null);
        setPendingObjectAbility(null);
        setPendingObjectAbilityTargetObjectId(null);
        setPendingMageAbility(null);
        setPendingMageAbilityStatusTargetObjectId(null);
        return true;
    };
    const submitObjectAbilityTargetSelection = (
        targetSelection: ChoiceRequestDirectSelectionTarget<MageWarsObjectAbilityActivationChoiceValue>,
    ): boolean => {
        const command = targetSelection.commandPreview.find((candidateCommand) => (
            candidateCommand.type === MAGE_WARS_COMMANDS.USE_ARENA_OBJECT_ABILITY
        ));
        if (!command || !isCommandAllowed(MAGE_WARS_COMMANDS.USE_ARENA_OBJECT_ABILITY)) return false;
        dispatch(MAGE_WARS_COMMANDS.USE_ARENA_OBJECT_ABILITY, command.payload);
        setPendingObjectAbility(null);
        setPendingObjectAbilityTargetObjectId(null);
        setSelectedObjectId(null);
        setPendingMageAbility(null);
        setPendingMageAbilityStatusTargetObjectId(null);
        return true;
    };
    const submitMageAbilityTargetSelection = (
        targetSelection: ChoiceRequestDirectSelectionTarget<MageWarsMageAbilityActivationChoiceValue>,
    ): boolean => {
        const command = targetSelection.commandPreview.find((candidateCommand) => (
            candidateCommand.type === MAGE_WARS_COMMANDS.USE_MAGE_ABILITY
        ));
        if (!command || !isCommandAllowed(MAGE_WARS_COMMANDS.USE_MAGE_ABILITY)) return false;
        dispatch(MAGE_WARS_COMMANDS.USE_MAGE_ABILITY, command.payload);
        setPendingMageAbility(null);
        setSelectedMageId(null);
        setPendingMageAbilityStatusTargetObjectId(null);
        return true;
    };
    const findSpellCastDestinationSelection = (
        objectId: string,
        zoneId: ArenaZoneId,
    ): ChoiceRequestDirectSelectionTarget<MageWarsSpellCastChoiceValue> | undefined => (
        selectedSpellCastTargetsByObjectId?.get(objectId)?.find((targetSelection) => {
            const payload = readMageWarsCastSpellPayload(targetSelection);
            return payload?.pushToZoneId === zoneId || payload?.targetZoneId === zoneId;
        })
    );
    const findSpellCastPlayerDestinationSelection = (
        playerId: PlayerId,
        zoneId: ArenaZoneId,
    ): ChoiceRequestDirectSelectionTarget<MageWarsSpellCastChoiceValue> | undefined => (
        selectedSpellCastTargetsByPlayerId?.get(playerId)?.find((targetSelection) => {
            const payload = readMageWarsCastSpellPayload(targetSelection);
            return payload?.pushToZoneId === zoneId || payload?.targetZoneId === zoneId;
        })
    );
    const findSpellCastNewTargetObjectSelection = (
        sourceObjectId: string,
        newTargetObjectId: string,
    ): ChoiceRequestDirectSelectionTarget<MageWarsSpellCastChoiceValue> | undefined => (
        selectedSpellCastTargetsByObjectId?.get(sourceObjectId)?.find((targetSelection) => (
            readMageWarsCastSpellPayload(targetSelection)?.newTargetObjectId === newTargetObjectId
        ))
    );
    const findSpellCastNewTargetPlayerSelection = (
        sourceObjectId: string,
        newTargetPlayerId: PlayerId,
    ): ChoiceRequestDirectSelectionTarget<MageWarsSpellCastChoiceValue> | undefined => (
        selectedSpellCastTargetsByObjectId?.get(sourceObjectId)?.find((targetSelection) => (
            readMageWarsCastSpellPayload(targetSelection)?.newTargetPlayerId === newTargetPlayerId
        ))
    );
    const findSpellCastNewTargetZoneSelection = (
        sourceObjectId: string,
        newTargetZoneId: ArenaZoneId,
    ): ChoiceRequestDirectSelectionTarget<MageWarsSpellCastChoiceValue> | undefined => (
        selectedSpellCastTargetsByObjectId?.get(sourceObjectId)?.find((targetSelection) => (
            readMageWarsCastSpellPayload(targetSelection)?.newTargetZoneId === newTargetZoneId
        ))
    );
    const findSpellCastChainSelection = (
        pathObjectIds: readonly string[],
    ): ChoiceRequestDirectSelectionTarget<MageWarsSpellCastChoiceValue> | undefined => (
        pendingSpellCastTargetSelections.find((targetSelection) => (
            hasSameObjectPath(readMageWarsCastSpellChainObjectIds(targetSelection), pathObjectIds)
        ))
    );
    const hasSpellCastChainContinuation = (pathObjectIds: readonly string[]): boolean => (
        pendingSpellCastTargetSelections.some((targetSelection) => {
            const path = readMageWarsCastSpellChainObjectIds(targetSelection);
            return startsWithObjectPath(path, pathObjectIds) && path.length > pathObjectIds.length;
        })
    );
    const findSpellCastZoneSelection = (
        zoneId: ArenaZoneId,
    ): ChoiceRequestDirectSelectionTarget<MageWarsSpellCastChoiceValue> | undefined => {
        const zoneSelections = selectedSpellCastTargetsByZoneId?.get(zoneId) ?? [];
        if (zoneSelections.length > 1) {
            throw new Error(`Mage Wars spell cast zone ${zoneId} has multiple direct selections`);
        }
        return zoneSelections[0];
    };
    const findSpellCastWallEdgeSelection = (
        edgeId: MageWarsWallEdgeId,
    ): ChoiceRequestDirectSelectionTarget<MageWarsSpellCastChoiceValue> | undefined => {
        const edgeSelections = selectedSpellCastTargetsByWallEdgeId?.get(edgeId) ?? [];
        if (edgeSelections.length > 1) {
            throw new Error(`Mage Wars spell cast wall edge ${edgeId} has multiple direct selections`);
        }
        return edgeSelections[0];
    };
    const handleZoneSelect = (zoneId: ArenaZoneId) => {
        if (pendingObjectAbility || pendingMageAbility) return;
        const pendingSpellTargetObject = pendingSpellTargetObjectId ? core.objects[pendingSpellTargetObjectId] : undefined;
        const pendingSpellTargetPlayer = pendingSpellTargetPlayerId ? core.players[pendingSpellTargetPlayerId] : undefined;
        if (selectedSpellCardId != null && selectedSpell && pendingSpellTargetObject) {
            const destinationSelection = findSpellCastDestinationSelection(pendingSpellTargetObject.id, zoneId);
            if (destinationSelection) {
                submitSpellCastTargetSelection(destinationSelection);
                return;
            }
            const newTargetZoneSelection = findSpellCastNewTargetZoneSelection(pendingSpellTargetObject.id, zoneId);
            if (newTargetZoneSelection) {
                submitSpellCastTargetSelection(newTargetZoneSelection);
                return;
            }
            return;
        }
        if (selectedSpellCardId != null && selectedSpell && pendingSpellTargetPlayer) {
            const destinationSelection = findSpellCastPlayerDestinationSelection(pendingSpellTargetPlayer.id, zoneId);
            if (destinationSelection) {
                submitSpellCastTargetSelection(destinationSelection);
                return;
            }
            return;
        }
        if (selectedSpellCardId != null && selectedSpell && !pendingSpellTargetObject && !pendingSpellTargetPlayer) {
            const zoneSelection = findSpellCastZoneSelection(zoneId);
            if (zoneSelection) {
                submitSpellCastTargetSelection(zoneSelection);
                return;
            }
            return;
        }
        const selectedObject = selectedObjectId ? core.objects[selectedObjectId] : undefined;
        const selectedMage = selectedMageId ? core.players[selectedMageId] : undefined;
        if (selectedObject) {
            if (
                !canAct
                || !isCommandAllowed(MAGE_WARS_COMMANDS.MOVE_ARENA_OBJECT)
                || !isCreatureActionPhase(phase)
                || !selectedObject.actionReady
                || isMageWarsArenaObjectRestrained(selectedObject)
                || !areAdjacentZones(core, selectedObject.zoneId, zoneId)
            ) return;
            dispatch(MAGE_WARS_COMMANDS.MOVE_ARENA_OBJECT, {
                objectId: selectedObject.id,
                toZoneId: zoneId,
            });
            setSelectedObjectId(null);
            return;
        }
        if (selectedMage) {
            if (
                !canAct
                || !isCommandAllowed(MAGE_WARS_COMMANDS.MOVE_MAGE)
                || !isCreatureActionPhase(phase)
                || selectedMage.id !== activePlayer?.id
                || !selectedMage.actionReady
                || !areAdjacentZones(core, selectedMage.mageZoneId, zoneId)
            ) return;
            dispatch(MAGE_WARS_COMMANDS.MOVE_MAGE, { toZoneId: zoneId });
            setSelectedMageId(null);
            return;
        }
    };
    const handleWallEdgeSelect = (edgeId: MageWarsWallEdgeId) => {
        if (pendingObjectAbility || pendingMageAbility) return;
        if (selectedSpellCardId == null || !selectedSpell || !spellNeedsWallEdgeTarget) return;
        const wallEdgeSelection = findSpellCastWallEdgeSelection(edgeId);
        if (wallEdgeSelection) {
            submitSpellCastTargetSelection(wallEdgeSelection);
            return;
        }
    };
    const handleObjectSelect = (objectId: string) => {
        const target = core.objects[objectId];
        if (pendingObjectAbility) {
            const targetSelections = pendingObjectAbilityTargetsByObjectId.get(objectId) ?? [];
            if (targetSelections.length === 1) submitObjectAbilityTargetSelection(targetSelections[0]);
            if (targetSelections.length > 1) setPendingObjectAbilityTargetObjectId(objectId);
            return;
        }
        if (pendingMageAbility) {
            const targetSelections = pendingMageAbilityTargetsByObjectId.get(objectId) ?? [];
            if (targetSelections.length === 1) submitMageAbilityTargetSelection(targetSelections[0]);
            if (targetSelections.length > 1) setPendingMageAbilityStatusTargetObjectId(objectId);
            return;
        }
        const attacker = selectedObjectId ? core.objects[selectedObjectId] : undefined;
        const profile = attacker
            ? getMageWarsObjectAttackProfiles(attacker).find((candidate) => (
                attacker.actionReady || canMageWarsObjectUsePostMoveQuickAction(attacker, candidate)
            ))
            : undefined;
        if (
            attacker
            && target
            && profile
            && isCommandAllowed(MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK)
            && attacker.ownerId === activePlayer?.id
            && target.ownerId !== activePlayer?.id
            && isMageWarsObjectAttackTargetSelectable(core, attacker.zoneId, target.zoneId, profile)
        ) {
            dispatch(MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK, {
                attackerObjectId: attacker.id,
                attackProfileId: profile.id,
                targetObjectId: target.id,
            });
            setSelectedObjectId(null);
            return;
        }
        if (selectedSpellCardId != null && !selectedSpellUsesConfirmChoice) {
            if (pendingSpellTargetObjectId) {
                if (spellNeedsChainTargets) {
                    const currentChainSelection = findSpellCastChainSelection(pendingSpellChainPathObjectIds);
                    if (objectId === selectedSpellCastCurrentChainSubmitObjectId && currentChainSelection) {
                        submitSpellCastTargetSelection(currentChainSelection);
                        return;
                    }

                    const candidatePath = [...pendingSpellChainPathObjectIds, objectId];
                    const nextChainSelection = findSpellCastChainSelection(candidatePath);
                    if (nextChainSelection) {
                        if (hasSpellCastChainContinuation(candidatePath)) {
                            setPendingSpellCastSelection({
                                kind: 'object',
                                objectId: pendingSpellTargetObjectId,
                                chainTargetObjectIds: candidatePath.slice(1),
                            });
                            return;
                        }
                        submitSpellCastTargetSelection(nextChainSelection);
                        return;
                    }

                    if (hasSelectedSpellCastContract) return;
                }
                const newTargetObjectSelection = findSpellCastNewTargetObjectSelection(pendingSpellTargetObjectId, objectId);
                if (newTargetObjectSelection) {
                    submitSpellCastTargetSelection(newTargetObjectSelection);
                    return;
                }
                if (hasSelectedSpellCastContract) return;
            }
            const spellCastTargetSelections = selectedSpellCastTargetsByObjectId?.get(objectId) ?? [];
            if (selectedSpell && (spellNeedsDestinationZone || spellNeedsNewAnchorTarget)) {
                if (spellCastTargetSelections.length > 0) {
                    setPendingSpellCastSelection({ kind: 'object', objectId, chainTargetObjectIds: [] });
                    return;
                }
                return;
            }
            if (selectedSpell && spellNeedsChainTargets) {
                const firstPath = [objectId];
                const firstChainSelection = spellCastTargetSelections.find((targetSelection) => (
                    hasSameObjectPath(readMageWarsCastSpellChainObjectIds(targetSelection), firstPath)
                ));
                const hasFirstChainContinuation = spellCastTargetSelections.some((targetSelection) => {
                    const path = readMageWarsCastSpellChainObjectIds(targetSelection);
                    return startsWithObjectPath(path, firstPath) && path.length > firstPath.length;
                });
                if (hasFirstChainContinuation) {
                    setPendingSpellCastSelection({ kind: 'object', objectId, chainTargetObjectIds: [] });
                    return;
                }
                if (firstChainSelection) {
                    submitSpellCastTargetSelection(firstChainSelection);
                    return;
                }
                if (hasSelectedSpellCastContract) return;
            }
            if (spellCastTargetSelections.length === 1) {
                submitSpellCastTargetSelection(spellCastTargetSelections[0]);
                return;
            }
            if (spellCastTargetSelections.length > 1) {
                setPendingSpellCastSelection({ kind: 'object', objectId, chainTargetObjectIds: [] });
                return;
            }
            return;
        }
    };
    const handlePlayerSelect = (targetPlayerId: PlayerId) => {
        if (pendingObjectAbility || pendingMageAbility) return;
        const target = core.players[targetPlayerId];
        if (selectedSpellCardId != null && pendingSpellTargetObjectId) {
            const newTargetPlayerSelection = findSpellCastNewTargetPlayerSelection(
                pendingSpellTargetObjectId,
                targetPlayerId,
            );
            if (newTargetPlayerSelection) {
                submitSpellCastTargetSelection(newTargetPlayerSelection);
                return;
            }
            if (hasSelectedSpellCastContract) return;
        }
        if (selectedSpellCardId != null && !pendingSpellTargetObjectId) {
            const playerSelections = selectedSpellCastTargetsByPlayerId?.get(targetPlayerId) ?? [];
            if (selectedSpell && spellNeedsDestinationZone) {
                if (playerSelections.length > 0) {
                    setPendingSpellCastSelection({ kind: 'player', playerId: targetPlayerId });
                    return;
                }
                return;
            }
            if (playerSelections.length === 1) {
                submitSpellCastTargetSelection(playerSelections[0]);
                return;
            }
            if (playerSelections.length > 1) {
                setPendingSpellCastSelection({ kind: 'player', playerId: targetPlayerId });
                return;
            }
            if (hasSelectedSpellCastContract) return;
        }
        const attacker = selectedObjectId ? core.objects[selectedObjectId] : undefined;
        const selectedMage = selectedMageId ? core.players[selectedMageId] : undefined;
        const profile = attacker
            ? getMageWarsObjectAttackProfiles(attacker).find((candidate) => (
                attacker.actionReady || canMageWarsObjectUsePostMoveQuickAction(attacker, candidate)
            ))
            : undefined;
        if (target && target.id === activeOpponent?.id && attacker && profile) {
            if (
                attacker.ownerId !== activePlayer?.id
                || !isCommandAllowed(MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK)
                || !isMageWarsObjectAttackTargetSelectable(core, attacker.zoneId, target.mageZoneId, profile)
            ) return;
            dispatch(MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK, {
                attackerObjectId: attacker.id,
                attackProfileId: profile.id,
                targetPlayerId,
            });
            setSelectedObjectId(null);
            return;
        }
        if (target && target.id === activeOpponent?.id && selectedMage) {
            if (
                !canAct
                || !isCommandAllowed(MAGE_WARS_COMMANDS.DECLARE_ATTACK)
                || !isCreatureActionPhase(phase)
                || selectedMage.id !== activePlayer?.id
                || !selectedMage.actionReady
                || selectedMage.mageZoneId !== target.mageZoneId
            ) return;
            dispatch(MAGE_WARS_COMMANDS.DECLARE_ATTACK, { targetPlayerId });
            setSelectedMageId(null);
            return;
        }
    };
    const handleActorObjectSelect = (objectId: string) => {
        const object = core.objects[objectId];
        const willSelectObject = selectedObjectId !== objectId;
        setSelectedSpellCardId(null);
        setPendingSpellCastSelection(null);
        setSelectedMageId(null);
        setPendingObjectAbility(null);
        setPendingObjectAbilityTargetObjectId(null);
        setPendingMageAbility(null);
        setPendingMageAbilityStatusTargetObjectId(null);
        setSelectedObjectId((current) => current === objectId ? null : objectId);
        if (willSelectObject && object?.sourceSpellCardId === MAGE_WARS_TUTORIAL_JUNGLE_WOLF_CARD_ID) {
            completeLocalTutorialStep('move-select-wolf');
        }
    };
    const handleActorMageSelect = (mageId: PlayerId) => {
        setSelectedSpellCardId(null);
        setPendingSpellCastSelection(null);
        setSelectedObjectId(null);
        setPendingObjectAbility(null);
        setPendingObjectAbilityTargetObjectId(null);
        setPendingMageAbility(null);
        setPendingMageAbilityStatusTargetObjectId(null);
        setSelectedMageId((current) => current === mageId ? null : mageId);
    };
    const handleGuard = () => {
        if (!canAct || !isCommandAllowed(MAGE_WARS_COMMANDS.GUARD) || !isCreatureActionPhase(phase)) return;
        const selectedObject = selectedObjectId ? core.objects[selectedObjectId] : undefined;
        const selectedMage = selectedMageId ? core.players[selectedMageId] : undefined;
        if (selectedObject?.ownerId === activePlayer?.id && selectedObject.actionReady) {
            dispatch(MAGE_WARS_COMMANDS.GUARD, { objectId: selectedObject.id });
            setSelectedObjectId(null);
            setPendingObjectAbility(null);
            setPendingObjectAbilityTargetObjectId(null);
            setPendingMageAbility(null);
            setPendingMageAbilityStatusTargetObjectId(null);
            return;
        }
        if (selectedMage?.id === activePlayer?.id && selectedMage.actionReady) {
            dispatch(MAGE_WARS_COMMANDS.GUARD, {});
            setSelectedMageId(null);
            setPendingObjectAbility(null);
            setPendingObjectAbilityTargetObjectId(null);
            setPendingMageAbility(null);
            setPendingMageAbilityStatusTargetObjectId(null);
        }
    };
    const handleObjectAbilitySelect = (sourceObjectId: string, abilityId: MageWarsObjectAbilityId) => {
        if (!isCommandAllowed(MAGE_WARS_COMMANDS.USE_ARENA_OBJECT_ABILITY)) return;
        setSelectedSpellCardId(null);
        setPendingSpellCastSelection(null);
        setSelectedMageId(null);
        setSelectedObjectId(sourceObjectId);
        setPendingMageAbility(null);
        setPendingMageAbilityStatusTargetObjectId(null);
        setPendingObjectAbilityTargetObjectId(null);
        const sourceObject = core.objects[sourceObjectId];
        const opportunity = sourceObject
            ? buildMageWarsObjectAbilityActivationOpportunity({
                state: G,
                playerId: sourceObject.ownerId,
                objectId: sourceObject.id,
                abilityId,
            })
            : null;
        const request = opportunity ? buildChoiceRequestFromOpportunity(opportunity) : null;
        const enabledCandidates = request?.candidates.filter((candidate) => (
            candidate.disabled !== true && candidate.stale !== true
        )) ?? [];
        if (request?.kind === 'confirm' && enabledCandidates.length === 1) {
            const command = enabledCandidates[0].commands?.find((candidateCommand) => (
                candidateCommand.type === MAGE_WARS_COMMANDS.USE_ARENA_OBJECT_ABILITY
            ));
            if (command) {
                dispatch(MAGE_WARS_COMMANDS.USE_ARENA_OBJECT_ABILITY, command.payload);
                setSelectedObjectId(null);
                setPendingObjectAbility(null);
                return;
            }
        }
        setPendingObjectAbility({ objectId: sourceObjectId, abilityId });
    };
    const handleMageAbilitySelect = (sourcePlayerId: PlayerId, abilityId: MageWarsMageAbilityId) => {
        if (!isCommandAllowed(MAGE_WARS_COMMANDS.USE_MAGE_ABILITY)) return;
        setSelectedSpellCardId(null);
        setPendingSpellCastSelection(null);
        setSelectedObjectId(null);
        setSelectedMageId(sourcePlayerId);
        setPendingObjectAbility(null);
        setPendingObjectAbilityTargetObjectId(null);
        setPendingMageAbilityStatusTargetObjectId(null);
        setPendingMageAbility({ playerId: sourcePlayerId, abilityId });
    };
    const handlePreparedSpellSelect = (cardId: number) => {
        if (!isCommandAllowed(MAGE_WARS_COMMANDS.CAST_SPELL)) return;
        const willSelectPreparedSpell = selectedSpellCardId !== cardId;
        if (canAct && activePlayer) {
            const opportunity = buildMageWarsSpellCastOpportunity({
                state: G,
                playerId: activePlayer.id,
                spellCardId: cardId,
            });
            const request = opportunity ? buildChoiceRequestFromOpportunity(opportunity) : null;
            if (request?.kind === 'confirm') {
                const surface = projectChoiceRequestToDirectSelectionTargets<MageWarsSpellCastChoiceValue>(
                    request,
                    { playerId: request.playerId },
                );
                const enabledSelections = surface.targets.filter((target) => (
                    target.disabled !== true && target.stale !== true
                ));
                if (enabledSelections.length === 1) {
                    submitSpellCastTargetSelection(enabledSelections[0]);
                }
                return;
            }
        }
        setSelectedObjectId(null);
        setSelectedMageId(null);
        setPendingSpellCastSelection(null);
        setPendingObjectAbility(null);
        setPendingObjectAbilityTargetObjectId(null);
        setPendingMageAbility(null);
        setPendingMageAbilityStatusTargetObjectId(null);
        setSelectedSpellCardId((current) => current === cardId ? null : cardId);
        if (willSelectPreparedSpell && cardId === MAGE_WARS_TUTORIAL_JUNGLE_WOLF_CARD_ID) {
            completeLocalTutorialStep('deploy-select-wolf');
        }
        if (willSelectPreparedSpell && cardId === MAGE_WARS_TUTORIAL_ROUSE_THE_BEAST_CARD_ID) {
            completeLocalTutorialStep('rouse-select-spell');
        }
    };
    const renderPipelineSettings = useRenderPipelineSettings();
    const fxBus = useFxBus(mageWarsFxRegistry, {
        quality: renderPipelineSettings.fxQuality,
        reduceWhenHighCostActiveAt: renderPipelineSettings.reduceWhenHighCostActiveAt,
        dropWhenHighCostActiveAt: renderPipelineSettings.dropWhenHighCostActiveAt,
        maxDpr: renderPipelineSettings.maxDpr,
        reducedMaxDpr: renderPipelineSettings.reducedMaxDpr,
    });
    const fxAnchors = useFxAnchorRegistry(MAGE_WARS_ARENA_FX_SURFACE_ID, 'board');
    const mageWarsEvents = useMageWarsGameEvents({
        G,
        fxBus,
        resolveFxAnchorSnapshot: fxAnchors.resolveSnapshot,
    });
    const getVisualPlayerDamage = (player: MageWarsPlayerState) => (
        mageWarsEvents.damageBuffer.get(mageWarsPlayerDamageKey(player.id), player.damage)
    );
    const getVisualObjectDamage = (object: MageWarsArenaObjectState) => (
        mageWarsEvents.damageBuffer.get(mageWarsObjectDamageKey(object.id), object.damage)
    );
    const handleInspectSpellCard = (cardId: number, label?: string) => {
        const previewRef = getMageWarsSpellCardPreviewRef(cardId);
        if (!previewRef) return;
        setMagnifiedPreview({
            previewRef,
            title: label ?? getMageWarsSpellCardName(cardId) ?? t('privateZones.spell'),
            aspectRatio: getMageWarsSpellCardAspectRatio(cardId) ?? SPELL_CARD_BACK_ASPECT_RATIO,
            sourceCardId: cardId,
        });
    };
    const handleInspectMage = (player: MageWarsPlayerState) => {
        const previewRef = getMageWarsMagePreviewRef(player.mageId, 'card');
        if (!previewRef) return;
        setMagnifiedPreview({
            previewRef,
            title: getMageDisplayLabel(player),
            aspectRatio: getMageWarsMagePreviewAspectRatio(),
            mageId: player.mageId,
        });
    };
    const shouldCompactPlayerHud = isLandscapeMobileViewport;
    const desktopUiScale = 1;
    const desktopUiPlaneStyle: CSSProperties | undefined = isLandscapeMobileViewport
        ? undefined
        : {
            inset: 0,
            '--mage-wars-desktop-hud-width': 'clamp(18.25rem, 17vw, 21.5rem)',
            '--mage-wars-desktop-self-hud-left': 'var(--mage-wars-desktop-side-inset, 1rem)',
            '--mage-wars-desktop-hud-hint-card-height': 'clamp(15.75rem, 22vh, 18.75rem)',
            '--mage-wars-hud-icon-size': 'clamp(3.75rem, 5vh, 4.25rem)',
            '--mage-wars-hud-icon-gap': 'clamp(0.16rem, 0.22vh, 0.3rem)',
            '--mage-wars-hud-icon-rail-gap': 'clamp(0.35rem, 0.48vw, 0.6rem)',
            '--mage-wars-desktop-prepared-width': 'clamp(19.125rem, 19vw, 31rem)',
            '--mage-wars-desktop-prepared-card-height': 'clamp(13.5rem, 20.75vh, 17rem)',
            '--mage-wars-desktop-card-height': 'var(--mage-wars-desktop-prepared-card-height, 14rem)',
            '--mage-wars-desktop-spellbook-card-height': 'clamp(13.75rem, 29vh, 24rem)',
            '--mage-wars-desktop-top-inset': 'clamp(0.625rem, 1vw, 0.875rem)',
            '--mage-wars-desktop-side-inset': 'clamp(0.5rem, 1.17vw, 1rem)',
            '--mage-wars-desktop-bottom-side-inset': 'clamp(0.5rem, calc(1.5vw - 0.8rem), 1rem)',
            '--mage-wars-desktop-grid-gap': 'clamp(0.375rem, 0.45vw, 0.75rem)',
            '--mage-wars-desktop-section-gap': 'clamp(0.5rem, calc(1.805vw - 1.041rem), 1.125rem)',
            '--mage-wars-desktop-card-gap': 'clamp(0.375rem, calc(1.083vw - 0.551rem), 0.75rem)',
            '--mage-wars-spellbook-control-width': 'clamp(4.75rem, 4.7vw, 5.5rem)',
            '--mage-wars-spellbook-page-rail-width': 'clamp(2.25rem, 2.5vw, 3rem)',
            '--mage-wars-spellbook-page-button-size': 'clamp(2.25rem, 2.1vw, 2.5rem)',
            '--mage-wars-prepared-card-gap': 'clamp(0.25rem, calc(1.083vw - 0.8rem), 0.875rem)',
            '--mage-wars-prepared-row-padding-left': 'clamp(0rem, calc(4.333vw - 3.7rem), 1.5rem)',
            '--mage-wars-prepared-row-padding-right': 'clamp(0rem, calc(1.083vw - 0.925rem), 0.375rem)',
        } as CSSProperties;
    const spellbookVisibleCardCount = MAGE_WARS_SPELLBOOK_VISIBLE_CARD_COUNT;
    return (
        <div
            className="relative h-full min-h-0 w-full overflow-hidden text-stone-100"
            data-testid="mage-wars-board"
            data-tutorial-id="mw-board"
            data-mage-wars-phase={phase}
            data-mage-wars-current-player-id={core.currentPlayerId}
            data-mage-wars-phase-actor-id={phaseActorId}
            data-mage-wars-turn-number={core.turnNumber}
            data-mage-wars-ready-player-ids={readyPlayerIds.join(',')}
            data-mage-wars-event-count={mageWarsEvents.debug.eventCount}
            data-mage-wars-event-latest-id={mageWarsEvents.debug.latestEntryId}
            data-mage-wars-event-cursor={mageWarsEvents.debug.cursor}
            data-mage-wars-last-consumed-events={mageWarsEvents.debug.lastConsumedTypes.join(',')}
            data-mage-wars-last-fx-cues={mageWarsEvents.debug.lastFxCues.join(',')}
            data-mage-wars-viewing-player-id={viewingPlayerId}
            data-mage-wars-public-view-player-id={publicViewPlayerId}
            data-mage-wars-public-view-role={isOpponentPublicView ? 'opponent' : 'self'}
            style={{ background: '#151311' }}
        >
            <div
                className="absolute inset-0 z-10"
                data-testid="mage-wars-arena-viewport-shell"
                data-tutorial-id="mw-stage"
            >
                <ZoomPanViewport
                    initialScale={1}
                    minScale={1}
                    maxScale={2.6}
                    baseScaleMode={isLandscapeMobileViewport ? 'contain' : 'cover'}
                    panBoundsMode="free"
                    fitInsets={cameraFitInsets}
                    panToTarget={tutorialArenaPanTarget}
                    containerTestId="mage-wars-arena-viewport"
                    contentTestId="mage-wars-arena-viewport-content"
                    scaleTestId="mage-wars-arena-viewport-scale"
                    scaleBadgeVisibility="interaction"
                    scaleBadgeStyle={isLandscapeMobileViewport ? undefined : {
                        left: 'calc(var(--mage-wars-desktop-side-inset, 1rem) + 3.5rem)',
                        top: '1rem',
                    }}
                    className="flex h-full w-full items-center justify-center"
                    contentClassName="relative shrink-0"
                    contentStyle={{
                        width: MAGE_WARS_ARENA_WORLD_WIDTH + 'px',
                        height: MAGE_WARS_ARENA_WORLD_HEIGHT + 'px',
                    }}
                    ariaLabel={t('arena.standardArenaAlt')}
                >
                    <ArenaStage
                        core={core}
                        phase={phase}
                        canAct={canAct}
                        activePlayer={activePlayer}
                        activeOpponent={activeOpponent}
                        selectedSpellCardId={selectedSpellCardId}
                        pendingSpellCastSelection={pendingSpellCastSelection}
                        selectedObjectId={selectedObjectId}
                        selectedMageId={selectedMageId}
                        objectAbilitySourceIds={objectAbilitySourceIds}
                        selectedObjectAvailableAbilities={selectedObjectAvailableAbilities}
                        selectedMageRestoreAbility={selectedMageRestoreAbility}
                        canGuardSelectedActor={canGuardSelectedActor}
                        shouldShowSelectedAbilityActionDock={shouldShowSelectedAbilityActionDock}
                        selectedSpellCastTargetIds={selectedSpellCastTargetIds}
                        selectedSpellCastTargetZoneIds={selectedSpellCastTargetZoneIds}
                        selectedSpellCastTargetWallEdgeIds={selectedSpellCastTargetWallEdgeIds}
                        selectedSpellCastDestinationZoneIds={selectedSpellCastDestinationZoneIds}
                        selectedSpellCastNewTargetObjectIds={selectedSpellCastNewTargetObjectIds}
                        selectedSpellCastTargetPlayerIds={selectedSpellCastTargetPlayerIds}
                        selectedSpellCastNewTargetPlayerIds={selectedSpellCastNewTargetPlayerIds}
                        selectedSpellCastNewTargetZoneIds={selectedSpellCastNewTargetZoneIds}
                        selectedSpellCastChainPathObjectIds={selectedSpellCastChainPathObjectIds}
                        selectedSpellCastNextChainTargetObjectIds={selectedSpellCastNextChainTargetObjectIds}
                        selectedSpellCastCurrentChainSubmitObjectId={selectedSpellCastCurrentChainSubmitObjectId}
                        mageRestoreAvailablePlayerIds={mageRestoreAvailablePlayerIds}
                        pendingObjectAbility={pendingObjectAbility}
                        pendingObjectAbilityTargetIds={pendingObjectAbilityTargetIds}
                        pendingMageAbility={pendingMageAbility}
                        pendingMageAbilityTargetIds={pendingMageAbilityTargetIds}
                        onZoneSelect={handleZoneSelect}
                        onObjectSelect={handleObjectSelect}
                        onWallEdgeSelect={handleWallEdgeSelect}
                        onActorObjectSelect={handleActorObjectSelect}
                        onPlayerSelect={handlePlayerSelect}
                        onActorPlayerSelect={handleActorMageSelect}
                        onGuard={handleGuard}
                        onObjectAbilitySelect={handleObjectAbilitySelect}
                        onMageAbilitySelect={handleMageAbilitySelect}
                        onInspectCard={handleInspectSpellCard}
                        fxBus={fxBus}
                        onFxImpact={mageWarsEvents.onEffectImpact}
                        onFxComplete={mageWarsEvents.onEffectComplete}
                        fxAnchors={fxAnchors}
                        getVisualObjectDamage={getVisualObjectDamage}
                        getVisualPlayerDamage={getVisualPlayerDamage}
                        showLifeTotals={showBoardLifeTotals}
                        visualHeldObjects={mageWarsEvents.heldObjects}
                        tutorialHighlightTarget={boardTutorialHighlightTarget}
                    />
                </ZoomPanViewport>
            </div>
            <div
                className="pointer-events-none absolute inset-0 z-20"
                data-testid={isLandscapeMobileViewport ? 'mage-wars-mobile-desktop-mirror-layer' : 'mage-wars-hud-anchor-layer'}
                data-mage-wars-layout-source={isLandscapeMobileViewport ? 'desktop-mirror' : 'viewport-anchored'}
            >
            <div
                className="pointer-events-none absolute inset-0"
                style={desktopUiPlaneStyle}
                data-testid="mage-wars-desktop-ui-plane"
                data-mage-wars-desktop-ui-scale={desktopUiScale.toFixed(6)}
                data-mage-wars-spellbook-visible-card-count={spellbookVisibleCardCount}
                data-mage-wars-desktop-design-width={MAGE_WARS_DESKTOP_UI_DESIGN_WIDTH}
                data-mage-wars-desktop-design-height={MAGE_WARS_DESKTOP_UI_DESIGN_HEIGHT}
            >
            <MageWarsLifeToggle
                pressed={showBoardLifeTotals}
                onToggle={() => setShowBoardLifeTotals((value) => !value)}
                style={isLandscapeMobileViewport ? undefined : {
                    left: 'var(--mage-wars-desktop-side-inset, 1rem)',
                    top: 'var(--mage-wars-desktop-top-inset, 0.875rem)',
                }}
                className={isLandscapeMobileViewport ? 'left-4 top-4' : undefined}
            />

            <MageWarsInteractionDock
                interaction={G.sys.interaction?.current}
                playerId={playerID ?? viewingPlayerId}
                dispatch={dispatch}
            />
            <MageSpellCastChoiceDock
                spellName={selectedSpell?.name}
                targetPlayer={pendingSpellTargetPlayer}
                selections={pendingSpellCastPlayerSelections}
                onSelect={submitSpellCastTargetSelection}
                onCancel={() => setPendingSpellCastSelection(null)}
            />
            <MageObjectAbilityChoiceDock
                abilityName={pendingObjectAbilityDef?.name}
                targetObject={pendingObjectAbilityTargetObject}
                selections={pendingObjectAbilityChoiceSelections}
                onSelect={submitObjectAbilityTargetSelection}
                onCancel={() => {
                    setPendingObjectAbilityTargetObjectId(null);
                    if (pendingObjectAbilityRequest?.kind === 'select-card') {
                        setPendingObjectAbility(null);
                    }
                }}
            />
            <MageAbilityStatusChoiceDock
                targetObject={pendingMageAbilityStatusTargetObject}
                selections={pendingMageAbilityStatusSelections}
                onSelect={submitMageAbilityTargetSelection}
                onCancel={() => setPendingMageAbilityStatusTargetObjectId(null)}
            />

            <aside
                className="pointer-events-none absolute z-20"
                style={{
                    left: 'var(--mage-wars-desktop-self-hud-left, var(--mage-wars-desktop-side-inset, 1rem))',
                    bottom: `calc(${desktopBottomGap}px + var(--mage-wars-desktop-spellbook-card-height, var(--mage-wars-desktop-card-height, 14rem)) + var(--mage-wars-desktop-section-gap, 1.125rem) + 0.25rem)`,
                    width: 'var(--mage-wars-desktop-hud-width, 23.25rem)',
                }}
                data-layout-position="self-lower-left"
            >
                <div className="pointer-events-none">
                    {viewingPlayer ? (
                        <MageHud
                            player={viewingPlayer}
                            current={viewingPlayer.id === phaseActorId}
                            self
                            compact={shouldCompactPlayerHud}
                            visualDamage={getVisualPlayerDamage(viewingPlayer)}
                            onInspect={() => handleInspectMage(viewingPlayer)}
                        />
                    ) : null}
                </div>
            </aside>

            <aside
                className="pointer-events-none absolute z-20"
                style={{
                    right: 'var(--mage-wars-desktop-side-inset, 1rem)',
                    top: 'var(--mage-wars-desktop-top-inset, 0.875rem)',
                    width: 'var(--mage-wars-desktop-hud-width, 23.25rem)',
                }}
            >
                <div className="pointer-events-none">
                    {opponent ? (
                        <MageHud
                            player={opponent}
                            current={opponent.id === phaseActorId}
                            self={false}
                            compact={shouldCompactPlayerHud}
                            visualDamage={getVisualPlayerDamage(opponent)}
                            onInspect={() => handleInspectMage(opponent)}
                            onObserve={() => togglePublicViewTarget(opponent.id)}
                            observed={publicViewPlayerId === opponent.id}
                        />
                    ) : null}
                </div>
            </aside>

            {opponent ? (
                <aside
                    className="pointer-events-none absolute z-20"
                    style={{
                        right: 'calc(var(--mage-wars-desktop-side-inset, 1rem) + var(--mage-wars-desktop-hud-width, 23.25rem) + 0.75rem)',
                        top: 'var(--mage-wars-desktop-top-inset, 0.875rem)',
                    }}
                    data-layout-position="opponent-top-right-adjacent-to-hud"
                >
                    <OpponentPlanMirror player={opponent} />
                </aside>
            ) : null}
            {isOpponentPublicView ? (
                <aside
                    className="pointer-events-none absolute inset-x-0 top-[5.5rem] z-30 flex justify-center"
                    data-testid="mage-wars-public-view-banner"
                    data-tutorial-id="mw-public-view-banner"
                >
                    <div className="pointer-events-auto flex min-h-10 items-center gap-2 rounded-lg border border-amber-200/45 bg-black/74 px-3 py-1.5 text-sm font-bold text-amber-50 shadow-[0_8px_20px_rgba(0,0,0,0.42)]">
                        <MageWarsLifeVisibilityIcon />
                        <span>{t('ui.opponentPublicView')}</span>
                        <button
                            type="button"
                            className="ml-1 rounded bg-amber-200 px-2.5 py-1 text-xs font-black text-stone-950 transition hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-100"
                            data-testid="mage-wars-back-to-self-view"
                            data-tutorial-id="mw-back-to-self-view"
                            onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                togglePublicViewTarget(null);
                            }}
                        >
                            {t('ui.backToSelfView')}
                        </button>
                    </div>
                </aside>
            ) : null}
            {publicViewPlayer ? (
                <aside className="pointer-events-none absolute right-14 top-[50.5%] z-20">
                    <DiscardPile
                        player={publicViewPlayer}
                        onInspectCard={handleInspectSpellCard}
                        ownerRole={isOpponentPublicView ? 'opponent' : 'self'}
                    />
                </aside>
            ) : null}
            <div
                className="pointer-events-none absolute z-30 grid items-end"
                style={{
                    left: 'var(--mage-wars-desktop-bottom-side-inset, var(--mage-wars-desktop-side-inset, 1rem))',
                    right: 'var(--mage-wars-desktop-bottom-side-inset, var(--mage-wars-desktop-side-inset, 1rem))',
                    bottom: desktopBottomGap,
                    columnGap: 'var(--mage-wars-desktop-grid-gap, 0.75rem)',
                    gridTemplateColumns: 'minmax(0, 1fr) var(--mage-wars-desktop-prepared-width, 22.5rem)',
                }}
                data-testid="mage-wars-bottom-viewport-grid"
                data-mage-wars-layout-source="viewport-grid-anchored"
                data-mage-wars-bottom-gap-px={desktopBottomGap}
            >
                <aside className="pointer-events-none w-full min-w-0 justify-self-stretch">
                    {viewingPlayer ? (
                        <SpellbookShelf
                            player={viewingPlayer}
                            phase={phase}
                            canAct={canAct}
                            canPlan={canEditPlanningDrafts}
                            selectedCardIds={selectedPlanningSpellCardIds}
                            onSelectedCardIdsChange={setSelectedPlanningSpellCardIds}
                            onInspectCard={handleInspectSpellCard}
                            tutorialStepId={tutorialStep?.id}
                            onTutorialPlanningStepComplete={() => nextStep('manual')}
                            visibleCardCount={spellbookVisibleCardCount}
                        />
                    ) : null}
                </aside>
                <aside className="pointer-events-none flex flex-col items-center gap-2 justify-self-end">
                    <div className="pointer-events-auto">
                        <TurnStatusDock
                            dispatch={dispatch}
                            disabled={!canAdvance}
                            phase={phase}
                            planSpellCount={selectedPlanningSpellCardIds.length}
                            planSpellTotal={MAGE_WARS_MAX_PREPARED_SPELLS}
                            onPlanSpells={canSubmitSelectedPlanningSpells ? planSelectedSpells : undefined}
                        />
                    </div>
                    {viewingPlayer ? (
                        <PreparedSpellsDock
                            player={viewingPlayer}
                            phase={phase}
                            canAct={canAct}
                            canCast={isCommandAllowed(MAGE_WARS_COMMANDS.CAST_SPELL)}
                            selectedCardId={selectedSpellCardId}
                            planningDraftCardIds={selectedPlanningSpellCardIds}
                            onSelect={handlePreparedSpellSelect}
                            onInspectCard={handleInspectSpellCard}
                            onPlanningDraftRemove={removePlanningDraftAtSlot}
                        />
                    ) : null}
                </aside>
            </div>
            </div>
            </div>
            <MagnifyOverlay
                isOpen={magnifiedPreview != null}
                onClose={() => setMagnifiedPreview(null)}
                overlayTestId="mage-wars-card-magnify-overlay"
                closeLabel={t('actions.close')}
                containerClassName="max-h-[88vh] max-w-[90vw]"
            >
                {magnifiedPreview ? (
                    <div
                        data-testid="mage-wars-card-magnify-content"
                        data-source-card-id={magnifiedPreview.sourceCardId}
                        data-mage-id={magnifiedPreview.mageId}
                        style={{
                            width: magnifiedPreview.aspectRatio >= 1
                                ? 'min(90vw, 72rem)'
                                : 'min(54vw, 32rem)',
                            aspectRatio: magnifiedPreview.aspectRatio,
                        }}
                    >
                        <CardPreview
                            previewRef={magnifiedPreview.previewRef}
                            className="h-full w-full rounded-xl shadow-2xl"
                            title={magnifiedPreview.title}
                            alt={magnifiedPreview.title}
                        />
                    </div>
                ) : null}
            </MagnifyOverlay>
            <EndgameOverlay {...endgameProps} />
        </div>
    );
}
