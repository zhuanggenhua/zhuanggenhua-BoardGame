import {
    findExplorerByPlayerId,
    getAllExplorers,
} from './explorerReadModel';
import {
    findHelpingHandsTrollHand,
    isHelpingHandsHaunt,
    isMummyHaunt,
} from './hauntScenarioReadModel';
import { resolveHelpingHandsMonsterTurnStatus } from './monsterActionReadModel';
import { resolveConnectedRoomIds } from './roomMapModel';
import type {
    BetrayalCore,
    BetrayalExplorerSummary,
    BetrayalInventoryCard,
    BetrayalMonsterSummary,
    BetrayalRoomNode,
} from './game';

export const MUMMY_GIRL_STEAL_CARD_ID = 'mummy-girl-token';

export interface BetrayalMummyAttackRewardChoice {
    id: string;
    controllerPlayerId: string;
    monsterId: string;
    monsterName: string;
    defenderPlayerId: string;
    damageToHero: number;
    defenderTraitsBeforeDamage: BetrayalExplorerSummary['traits'];
    stealableCardIds: string[];
}

export interface BetrayalHelpingHandsAttackRewardChoice {
    id: string;
    attackerPlayerId: string;
    defenderPlayerId: string;
    damageToDefender: number;
    damageKind: 'physical' | 'mental';
    attackerRoll: number;
    defenderRoll: number;
    defenderTraitsBeforeDamage: BetrayalExplorerSummary['traits'];
}

export interface BetrayalHelpingHandsTrollHandAttackOption {
    id: string;
    label: string;
    trollHandIds: string[];
    roomId: string;
    might: number;
    combined: boolean;
    targetPlayerIds: string[];
}

export interface BetrayalHelpingHandsTrollHandAttackCommandPayload {
    monsterId?: string;
    targetPlayerId?: string;
    combined?: boolean;
}

export function resolveMummyGirlStealCard(): BetrayalInventoryCard {
    return {
        id: MUMMY_GIRL_STEAL_CARD_ID,
        name: '女孩',
        kind: 'omen',
    };
}

export function resolveMummyStealableCards(
    core: BetrayalCore,
    defenderPlayerId: string,
): BetrayalInventoryCard[] {
    if (!isMummyHaunt(core)) {
        return [];
    }
    const defender = findExplorerByPlayerId(core, defenderPlayerId);
    if (!defender) {
        return [];
    }
    const cards = defender.inventory.filter((card) => card.kind === 'item' || card.kind === 'omen');
    const mummy = core.scenarioRuntime.mummy;
    return mummy?.girlHolderPlayerId === defenderPlayerId
        ? [...cards, resolveMummyGirlStealCard()]
        : cards;
}

export function resolveMummyPendingAttackReward(core: BetrayalCore): BetrayalMummyAttackRewardChoice | null {
    return isMummyHaunt(core)
        ? core.scenarioRuntime.mummy?.pendingAttackReward ?? null
        : null;
}

export function resolveHelpingHandsStealableCards(
    core: BetrayalCore,
    defenderPlayerId: string,
): BetrayalInventoryCard[] {
    const defender = findExplorerByPlayerId(core, defenderPlayerId);
    return defender
        ? defender.inventory.filter((card) => card.kind === 'item' || card.kind === 'omen')
        : [];
}

export function resolveHelpingHandsPendingAttackReward(
    core: BetrayalCore,
): BetrayalHelpingHandsAttackRewardChoice | null {
    return isHelpingHandsHaunt(core)
        ? core.scenarioRuntime.helpingHands?.pendingAttackReward ?? null
        : null;
}

export function resolveHelpingHandsTrollHandAttackOptions(
    core: BetrayalCore,
): BetrayalHelpingHandsTrollHandAttackOption[] {
    const status = resolveHelpingHandsMonsterTurnStatus(core);
    if (!status.active || !core.scenarioRuntime.helpingHands) {
        return [];
    }
    const usedIds = new Set(core.scenarioRuntime.helpingHands.trollHandAttackUsedIdsThisTurn);
    const trollHands = status.trollHandIds
        .map((id) => core.monsters.find((monster) => monster.id === id) ?? null)
        .filter((monster): monster is BetrayalMonsterSummary => Boolean(monster))
        .filter((monster) => !usedIds.has(monster.id));
    const livingExplorers = getAllExplorers(core).filter((explorer) => (
        !core.scenarioRuntime.deadExplorerPlayerIds.includes(explorer.playerId)
    ));
    const options = trollHands.map((monster) => ({
        id: monster.id,
        label: monster.name,
        trollHandIds: [monster.id],
        roomId: monster.roomId,
        might: monster.might,
        combined: false,
        targetPlayerIds: livingExplorers
            .filter((explorer) => explorer.roomId === monster.roomId)
            .map((explorer) => explorer.playerId),
    }));
    if (
        trollHands.length === 2
        && trollHands[0]!.roomId === trollHands[1]!.roomId
    ) {
        options.push({
            id: 'combined-troll-hands',
            label: '巨魔手合击',
            trollHandIds: trollHands.map((monster) => monster.id),
            roomId: trollHands[0]!.roomId,
            might: 8,
            combined: true,
            targetPlayerIds: livingExplorers
                .filter((explorer) => explorer.roomId === trollHands[0]!.roomId)
                .map((explorer) => explorer.playerId),
        });
    }
    return options.filter((option) => option.targetPlayerIds.length > 0);
}

export function resolveHelpingHandsTrollHandAttackCommandPayload(
    option: BetrayalHelpingHandsTrollHandAttackOption,
    targetPlayerId: string,
): BetrayalHelpingHandsTrollHandAttackCommandPayload {
    return {
        ...(option.combined
            ? { combined: true }
            : { monsterId: option.trollHandIds[0] ?? option.id }),
        targetPlayerId,
    };
}

export function resolveHelpingHandsTrollHandMoveCost(
    core: BetrayalCore,
    monsterId: string,
): number {
    const monster = findHelpingHandsTrollHand(core, monsterId);
    if (!monster) {
        return 0;
    }
    const sharesRoomWithLivingExplorer = getAllExplorers(core).some((explorer) => (
        explorer.roomId === monster.roomId
        && !core.scenarioRuntime.deadExplorerPlayerIds.includes(explorer.playerId)
    ));
    return sharesRoomWithLivingExplorer ? 2 : 1;
}

export function resolveHelpingHandsTrollHandMoveOptions(
    core: BetrayalCore,
    monsterId: string,
): BetrayalRoomNode[] {
    const status = resolveHelpingHandsMonsterTurnStatus(core);
    const monster = findHelpingHandsTrollHand(core, monsterId);
    if (!status.active || !monster) {
        return [];
    }
    const moveCost = resolveHelpingHandsTrollHandMoveCost(core, monster.id);
    if ((status.moveRemainingById[monster.id] ?? 0) < moveCost) {
        return [];
    }
    const connectedRoomIds = resolveConnectedRoomIds(core.rooms, monster.roomId);
    return core.rooms.filter((room) => (
        room.state === 'discovered'
        && connectedRoomIds.has(room.id)
    ));
}
