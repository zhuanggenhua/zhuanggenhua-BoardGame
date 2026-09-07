import { useLayoutEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import type { PlayerId } from '../../../engine/types';
import {
    MAGE_WARS_OBJECT_ABILITY_IDS,
    type MageWarsMageAbilityId,
    type MageWarsObjectAbilityId,
} from '../domain/ids';

function getMageWarsObjectAbilityButtonTestId(abilityId: MageWarsObjectAbilityId): string {
    if (abilityId === MAGE_WARS_OBJECT_ABILITY_IDS.ASYRAN_CLERIC_HEALING_LIGHT) {
        return 'mage-wars-selected-object-ability-healing-light';
    }
    return `mage-wars-selected-object-ability-${abilityId.replace(/[^a-z0-9]+/gi, '-')}`;
}

export function MageWarsSelectedAbilityActionDock({
    objectId,
    objectAbilities,
    magePlayerId,
    mageAbility,
    canGuard,
    onGuard,
    onObjectAbilitySelect,
    onMageAbilitySelect,
}: {
    objectId?: string;
    objectAbilities?: readonly { id: MageWarsObjectAbilityId; name: string }[];
    magePlayerId?: PlayerId;
    mageAbility?: { abilityId: MageWarsMageAbilityId; name: string };
    canGuard: boolean;
    onGuard: () => void;
    onObjectAbilitySelect: (sourceObjectId: string, abilityId: MageWarsObjectAbilityId) => void;
    onMageAbilitySelect: (playerId: PlayerId, abilityId: MageWarsMageAbilityId) => void;
}) {
    const { t } = useTranslation('game-mage-wars');
    const availableObjectAbilities = objectAbilities ?? [];

    const sourceKey = objectId != null
        ? `object:${objectId}`
        : magePlayerId != null
            ? `mage:${magePlayerId}`
            : null;
    const [dockPosition, setDockPosition] = useState<{ left: number; top: number } | null>(null);

    useLayoutEffect(() => {
        if (!sourceKey || typeof document === 'undefined') return undefined;

        const findSource = (): HTMLElement | undefined => {
            const [sourceKind, sourceId] = sourceKey.split(':');
            if (sourceKind === 'object' && sourceId) {
                const candidates = [
                    ...document.querySelectorAll<HTMLElement>('[data-testid="mage-wars-zone-field-card"]'),
                    ...document.querySelectorAll<HTMLElement>('[data-testid="mage-wars-attached-card"]'),
                ];
                const entityCard = candidates.find((element) => element.dataset.objectId === sourceId);
                if (entityCard) return entityCard;
            }
            if (sourceKind === 'mage' && sourceId) {
                const entity = document.querySelector<HTMLElement>(
                    `[data-testid="mage-wars-zone-mage-entity"][data-player-id="${sourceId}"]`,
                );
                if (entity) return entity;
            }
            return Array.from(
                document.querySelectorAll<HTMLElement>('[data-mage-wars-ability-source]'),
            ).find((element) => element.dataset.mageWarsAbilitySource === sourceKey);
        };
        const measure = () => {
            const source = findSource();
            if (!source) return;
            const rect = source.getBoundingClientRect();
            const next = { left: rect.left + rect.width / 2, top: rect.bottom + 8 };
            setDockPosition((current) => (
                current
                && Math.abs(current.left - next.left) < 0.5
                && Math.abs(current.top - next.top) < 0.5
                    ? current
                    : next
            ));
        };

        measure();
        let frameId: number | null = null;
        const tick = () => {
            measure();
            frameId = window.requestAnimationFrame(tick);
        };
        frameId = window.requestAnimationFrame(tick);
        window.addEventListener('resize', measure);
        window.addEventListener('orientationchange', measure);

        return () => {
            if (frameId != null) window.cancelAnimationFrame(frameId);
            window.removeEventListener('resize', measure);
            window.removeEventListener('orientationchange', measure);
        };
    }, [sourceKey]);

    if (availableObjectAbilities.length === 0 && !mageAbility && !canGuard) return null;
    if (!dockPosition || typeof document === 'undefined') return null;

    const dock = (
        <aside
            className="pointer-events-none fixed z-[10000] flex -translate-x-1/2 justify-center"
            style={{ left: dockPosition.left, top: dockPosition.top, transform: 'translateX(-50%)' }}
            data-testid="mage-wars-selected-ability-action-dock"
            data-tutorial-id="mw-ability-action-dock"
            data-ability-action-placement="source-card-below"
            data-ability-source-key={sourceKey}
        >
            <section className="pointer-events-auto flex max-w-[min(38rem,calc(100vw-2rem))] flex-wrap items-center justify-center gap-2 rounded-[0.35rem] border border-amber-100/18 bg-stone-950/90 px-3 py-2.5 shadow-[0_16px_38px_rgba(0,0,0,0.52)]">
                {canGuard ? (
                    <button
                        type="button"
                        className="min-h-9 rounded-[0.25rem] border border-emerald-100/30 bg-emerald-200 px-3 py-1.5 text-xs font-black text-stone-950 shadow-[0_8px_18px_rgba(0,0,0,0.36)] transition hover:bg-emerald-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-100"
                        aria-label={t('actions.guardCreature')}
                        title={t('actions.guardCreature')}
                        data-testid="mage-wars-selected-unit-guard"
                        data-tutorial-id="mw-selected-unit-guard"
                        data-action-kind="guard"
                        data-action-visual="text-action"
                        data-action-placement="source-card-below"
                        onClick={onGuard}
                    >
                        {t('actions.guardCreature')}
                    </button>
                ) : null}
                {objectId ? availableObjectAbilities.map((ability) => (
                    <button
                        key={ability.id}
                        type="button"
                        className="min-h-9 rounded-[0.25rem] border border-amber-100/28 bg-amber-200 px-3 py-1.5 text-xs font-black text-stone-950 shadow-[0_8px_18px_rgba(0,0,0,0.36)] transition hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-100"
                        aria-label={ability.name}
                        title={ability.name}
                        data-testid={getMageWarsObjectAbilityButtonTestId(ability.id)}
                        data-tutorial-id={ability.id === MAGE_WARS_OBJECT_ABILITY_IDS.ASYRAN_CLERIC_HEALING_LIGHT
                            ? 'mw-ability-healing-light'
                            : `mw-object-ability-${ability.id.replace(/[^a-z0-9]+/gi, '-')}`}
                        data-ability-id={ability.id}
                        data-ability-visual="text-action"
                        data-ability-action-placement="source-card-below"
                        onClick={() => onObjectAbilitySelect(objectId, ability.id)}
                    >
                        {ability.name}
                    </button>
                )) : null}
                {magePlayerId && mageAbility ? (
                    <button
                        type="button"
                        className="min-h-9 rounded-[0.25rem] border border-cyan-100/32 bg-cyan-200 px-3 py-1.5 text-xs font-black text-stone-950 shadow-[0_8px_18px_rgba(0,0,0,0.36)] transition hover:bg-cyan-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-100"
                        aria-label={mageAbility.name}
                        title={mageAbility.name}
                        data-testid="mage-wars-selected-mage-ability-restore"
                        data-tutorial-id="mw-ability-restore"
                        data-ability-visual="text-action"
                        data-ability-action-placement="source-card-below"
                        onClick={() => onMageAbilitySelect(magePlayerId, mageAbility.abilityId)}
                    >
                        {mageAbility.name}
                    </button>
                ) : null}
            </section>
        </aside>
    );

    return createPortal(dock, document.body);
}
