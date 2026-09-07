import { describe, expect, it } from 'vitest';
import type { MatchState } from '../../../engine/types';
import { MAGE_WARS_COMMANDS } from '../domain';
import { MAGE_IDS } from '../domain/ids';
import type { MageWarsCore } from '../domain/types';
import {
    makeArenaObject,
    PLAYER_ZERO_START_ZONE,
    setupState,
    validateCommand,
    withArenaObject,
    withPreparedPlayerMage,
} from './helpers/domainFlowHarness';

describe('mage-wars spell cast family gate', () => {
    it('rejects standard spellbook spells that are not admitted by a spell-cast Choice family', () => {
        const unsupportedSpellId = 1804;
        const baseState = setupState('creatureAction');
        const target = makeArenaObject('unsupported-curse-target', '1', PLAYER_ZERO_START_ZONE);
        const state: MatchState<MageWarsCore> = {
            ...baseState,
            core: withArenaObject(
                withPreparedPlayerMage(
                    baseState.core,
                    '0',
                    MAGE_IDS.WARLOCK_APPRENTICE,
                    [unsupportedSpellId],
                    20,
                ),
                target,
            ),
        };

        expect(validateCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: unsupportedSpellId,
                manaCost: 5,
                targetObjectId: target.id,
            },
        })).toBe('spellRequiresCodeSupport');
    });
});
