import type { PlayerId } from '../../../engine/types';
import type { MageWarsArenaObjectState } from '../domain';
import {
    canMageWarsObjectUsePostMoveQuickAction,
    getMageWarsObjectAttackProfiles,
    hasMageWarsStunStatus,
} from '../domain/spellRules';

export function isCreatureActionPhase(phase: string): boolean {
    return phase === 'creatureAction';
}

export function isMageWarsActionableCreatureObject(
    object: MageWarsArenaObjectState | undefined,
    ownerId: PlayerId | undefined,
): object is MageWarsArenaObjectState {
    return Boolean(
        object
        && ownerId
        && object.ownerId === ownerId
        && object.kind === 'creature'
        && !hasMageWarsStunStatus(object),
    );
}

export function canMageWarsObjectStartAction(
    object: MageWarsArenaObjectState | undefined,
    ownerId: PlayerId | undefined,
): object is MageWarsArenaObjectState {
    if (!isMageWarsActionableCreatureObject(object, ownerId)) return false;
    if (object.actionReady) return true;
    return getMageWarsObjectAttackProfiles(object)
        .some((profile) => canMageWarsObjectUsePostMoveQuickAction(object, profile));
}
