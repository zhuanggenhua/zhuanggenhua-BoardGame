import { getPresetSpellbookEntriesFromConfig } from '../data/configPackage';
import type { MageWarsPlayerState } from '../domain';
import {
    getMageWarsPlayerSpellbookEntries,
    type MageWarsPlayerSpellbookEntry,
} from '../domain/spellbook';

export function getMageWarsSpellbookDisplayEntries(
    player: Pick<MageWarsPlayerState, 'mageId' | 'spellbookEntries'>,
): MageWarsPlayerSpellbookEntry[] {
    const presetOrder = new Map(
        getPresetSpellbookEntriesFromConfig(player.mageId)
            .map((entry, index) => [entry.spellCardId, index] as const),
    );

    return [...getMageWarsPlayerSpellbookEntries(player)].sort((left, right) => {
        const leftOrder = presetOrder.get(left.spellCardId);
        const rightOrder = presetOrder.get(right.spellCardId);
        if (leftOrder !== undefined || rightOrder !== undefined) {
            return (leftOrder ?? Number.MAX_SAFE_INTEGER) - (rightOrder ?? Number.MAX_SAFE_INTEGER);
        }
        return left.spellCardId - right.spellCardId;
    });
}
