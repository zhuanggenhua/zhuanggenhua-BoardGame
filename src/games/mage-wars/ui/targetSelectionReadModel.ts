import type { ChoiceRequestDirectSelectionTarget } from '../../../engine/systems';
import type { PlayerId } from '../../../engine/types';
import {
    MAGE_WARS_COMMANDS,
    type MageWarsCastSpellCommand,
    type MageWarsCore,
} from '../domain';
import type {
    ArenaZoneId,
    MageWarsWallEdgeId,
} from '../domain/ids';
import type { MageWarsMageAbilityActivationChoiceValue } from '../domain/mageAbilityRuntime';
import type { MageWarsObjectAbilityActivationChoiceValue } from '../domain/objectAbilityRuntime';
import {
    doesMageWarsWallBlockLineOfSight,
    isArenaZoneId,
} from '../domain/utils';
import type { MageWarsSpellCastChoiceValue } from '../domain/spellCastRuntime';
import {
    isMageWarsObjectAttackTargetInRange,
    type MageWarsObjectAttackProfile,
} from '../domain/spellRules';

export function hasEnabledChoiceCandidate(
    candidates: readonly { disabled?: boolean; stale?: boolean }[] | undefined,
): boolean {
    return candidates?.some((candidate) => candidate.disabled !== true && candidate.stale !== true) === true;
}

export function compareMageAbilityTargets(
    left: ChoiceRequestDirectSelectionTarget<MageWarsMageAbilityActivationChoiceValue>,
    right: ChoiceRequestDirectSelectionTarget<MageWarsMageAbilityActivationChoiceValue>,
): number {
    const leftStatusCount = left.value?.statusTokenIds.length ?? 0;
    const rightStatusCount = right.value?.statusTokenIds.length ?? 0;
    if (leftStatusCount !== rightStatusCount) return rightStatusCount - leftStatusCount;

    const leftManaCost = left.value?.manaCost ?? 0;
    const rightManaCost = right.value?.manaCost ?? 0;
    if (leftManaCost !== rightManaCost) return rightManaCost - leftManaCost;

    return left.id.localeCompare(right.id);
}

export function buildMageAbilityTargetsByObjectId(
    targets: readonly ChoiceRequestDirectSelectionTarget<MageWarsMageAbilityActivationChoiceValue>[] | undefined,
): Map<string, ChoiceRequestDirectSelectionTarget<MageWarsMageAbilityActivationChoiceValue>[]> {
    const map = new Map<string, ChoiceRequestDirectSelectionTarget<MageWarsMageAbilityActivationChoiceValue>[]>();
    for (const target of targets ?? []) {
        if (target.disabled || target.stale || typeof target.targetRef !== 'string') continue;
        const current = map.get(target.targetRef) ?? [];
        current.push(target);
        map.set(target.targetRef, current);
    }
    for (const groupedTargets of map.values()) {
        groupedTargets.sort(compareMageAbilityTargets);
    }
    return map;
}

export function compareObjectAbilityTargets(
    left: ChoiceRequestDirectSelectionTarget<MageWarsObjectAbilityActivationChoiceValue>,
    right: ChoiceRequestDirectSelectionTarget<MageWarsObjectAbilityActivationChoiceValue>,
): number {
    const modeRank = (mode: MageWarsObjectAbilityActivationChoiceValue['mode']): number => {
        if (mode === 'melee-bonus') return 0;
        if (mode === 'heal') return 1;
        return 2;
    };
    const leftModeRank = modeRank(left.value?.mode);
    const rightModeRank = modeRank(right.value?.mode);
    if (leftModeRank !== rightModeRank) return leftModeRank - rightModeRank;
    return left.id.localeCompare(right.id);
}

export function buildObjectAbilityTargetsByObjectId(
    targets: readonly ChoiceRequestDirectSelectionTarget<MageWarsObjectAbilityActivationChoiceValue>[] | undefined,
): Map<string, ChoiceRequestDirectSelectionTarget<MageWarsObjectAbilityActivationChoiceValue>[]> {
    const map = new Map<string, ChoiceRequestDirectSelectionTarget<MageWarsObjectAbilityActivationChoiceValue>[]>();
    for (const target of targets ?? []) {
        if (target.disabled || target.stale || typeof target.targetRef !== 'string') continue;
        const current = map.get(target.targetRef) ?? [];
        current.push(target);
        map.set(target.targetRef, current);
    }
    for (const groupedTargets of map.values()) {
        groupedTargets.sort(compareObjectAbilityTargets);
    }
    return map;
}

export function buildSpellCastTargetsByObjectId(
    targets: readonly ChoiceRequestDirectSelectionTarget<MageWarsSpellCastChoiceValue>[] | undefined,
): Map<string, ChoiceRequestDirectSelectionTarget<MageWarsSpellCastChoiceValue>[]> {
    const map = new Map<string, ChoiceRequestDirectSelectionTarget<MageWarsSpellCastChoiceValue>[]>();
    for (const target of targets ?? []) {
        if (target.disabled || target.stale) continue;
        const objectId = readMageWarsCastSpellPayload(target)?.targetObjectId;
        if (!objectId) continue;
        const current = map.get(objectId) ?? [];
        current.push(target);
        map.set(objectId, current);
    }
    for (const groupedTargets of map.values()) {
        groupedTargets.sort((left, right) => left.id.localeCompare(right.id));
    }
    return map;
}

export function buildSpellCastTargetsByPlayerId(
    targets: readonly ChoiceRequestDirectSelectionTarget<MageWarsSpellCastChoiceValue>[] | undefined,
): Map<PlayerId, ChoiceRequestDirectSelectionTarget<MageWarsSpellCastChoiceValue>[]> {
    const map = new Map<PlayerId, ChoiceRequestDirectSelectionTarget<MageWarsSpellCastChoiceValue>[]>();
    for (const target of targets ?? []) {
        if (target.disabled || target.stale) continue;
        const playerId = readMageWarsCastSpellPayload(target)?.targetPlayerId;
        if (!playerId) continue;
        const current = map.get(playerId) ?? [];
        current.push(target);
        map.set(playerId, current);
    }
    for (const groupedTargets of map.values()) {
        groupedTargets.sort((left, right) => left.id.localeCompare(right.id));
    }
    return map;
}

export function buildSpellCastTargetsByZoneId(
    targets: readonly ChoiceRequestDirectSelectionTarget<MageWarsSpellCastChoiceValue>[] | undefined,
): Map<ArenaZoneId, ChoiceRequestDirectSelectionTarget<MageWarsSpellCastChoiceValue>[]> {
    const map = new Map<ArenaZoneId, ChoiceRequestDirectSelectionTarget<MageWarsSpellCastChoiceValue>[]>();
    for (const target of targets ?? []) {
        if (target.disabled || target.stale || !isArenaZoneId(target.targetRef)) continue;
        const current = map.get(target.targetRef) ?? [];
        current.push(target);
        map.set(target.targetRef, current);
    }
    for (const groupedTargets of map.values()) {
        groupedTargets.sort((left, right) => left.id.localeCompare(right.id));
    }
    return map;
}

export function buildSpellCastTargetsByWallEdgeId(
    targets: readonly ChoiceRequestDirectSelectionTarget<MageWarsSpellCastChoiceValue>[] | undefined,
): Map<MageWarsWallEdgeId, ChoiceRequestDirectSelectionTarget<MageWarsSpellCastChoiceValue>[]> {
    const map = new Map<MageWarsWallEdgeId, ChoiceRequestDirectSelectionTarget<MageWarsSpellCastChoiceValue>[]>();
    for (const target of targets ?? []) {
        if (target.disabled || target.stale) continue;
        const payload = readMageWarsCastSpellPayload(target);
        const edgeId = payload?.targetWallEdgeId;
        if (!edgeId) continue;
        const current = map.get(edgeId) ?? [];
        current.push(target);
        map.set(edgeId, current);
    }
    for (const groupedTargets of map.values()) {
        groupedTargets.sort((left, right) => left.id.localeCompare(right.id));
    }
    return map;
}

export function readMageWarsCastSpellPayload(
    targetSelection: ChoiceRequestDirectSelectionTarget<MageWarsSpellCastChoiceValue>,
): MageWarsCastSpellCommand['payload'] | null {
    const command = targetSelection.commandPreview.find((candidateCommand) => (
        candidateCommand.type === MAGE_WARS_COMMANDS.CAST_SPELL
    ));
    if (!command || !command.payload || typeof command.payload !== 'object') return null;
    return command.payload as MageWarsCastSpellCommand['payload'];
}

export function readMageWarsCastSpellChainObjectIds(
    targetSelection: ChoiceRequestDirectSelectionTarget<MageWarsSpellCastChoiceValue>,
): string[] {
    const payload = readMageWarsCastSpellPayload(targetSelection);
    if (!payload?.targetObjectId) return [];
    return [
        payload.targetObjectId,
        ...(payload.chainLightningTargets ?? []).map((target) => target.targetObjectId),
    ];
}

export function startsWithObjectPath(path: readonly string[], prefix: readonly string[]): boolean {
    return prefix.length <= path.length && prefix.every((objectId, index) => path[index] === objectId);
}

export function hasSameObjectPath(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length && startsWithObjectPath(left, right);
}

export function buildNonEmptySet<T>(values: Iterable<T>): Set<T> | undefined {
    const set = new Set(values);
    return set.size > 0 ? set : undefined;
}

export function isMageWarsObjectAttackTargetSelectable(
    core: MageWarsCore,
    attackerZoneId: ArenaZoneId,
    targetZoneId: ArenaZoneId,
    profile: MageWarsObjectAttackProfile,
): boolean {
    if (!isMageWarsObjectAttackTargetInRange(core, attackerZoneId, targetZoneId, profile)) return false;
    return profile.rangeKind !== 'ranged'
        || !doesMageWarsWallBlockLineOfSight(core, attackerZoneId, targetZoneId);
}
