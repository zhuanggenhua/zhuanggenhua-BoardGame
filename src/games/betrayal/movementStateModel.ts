import {
    appendActivity,
    syncCurrentExplorerProjection,
} from './coreStateModel';
import { createBloodFromStoneNewLineOfSightDamageAllocation } from './damageResolutionModel';
import { collectMummyGirlByExplorerIfPresent } from './mummyHauntRules';
import { resolveRecommendedAction } from './recommendedActionReadModel';
import type { BetrayalCore } from './game';
import type { BetrayalEvent } from './events';

type ExplorerMovedEvent = Extract<BetrayalEvent, { type: 'EXPLORER_MOVED' }>;

export function applyBetrayalExplorerMovedState(
    core: BetrayalCore,
    event: ExplorerMovedEvent,
): BetrayalCore {
    if (event.payload.controlledToken === 'jack-spirit') {
        core.scenarioRuntime.jackSpiritRoomId = event.payload.roomId;
        core.scenarioRuntime.jackSpiritHasMovedSinceRelease = true;
        core.monsters = core.monsters.map((monster) => (
            monster.id === 'jack-spirit'
                ? { ...monster, roomId: event.payload.roomId }
                : monster
        ));
    } else if (event.payload.controlledToken === 'feverish') {
        core.monsters = core.monsters.map((monster) => (
            monster.id === `feverish-${event.payload.playerId}`
                ? { ...monster, roomId: event.payload.roomId }
                : monster
        ));
    } else {
        core.currentExplorer.roomId = event.payload.roomId;
    }
    if (event.payload.consumeMove !== false) {
        core.movesRemaining = Math.max(0, core.movesRemaining - (event.payload.moveCost ?? 1));
    }
    if (event.payload.skeletonKeyBuried && event.payload.skeletonKeyCardId) {
        core.currentExplorer.inventory = core.currentExplorer.inventory.filter((card) => (
            card.id !== event.payload.skeletonKeyCardId
        ));
    }
    if (event.payload.usedActionId) {
        core.usedCardIdsThisTurn = [...core.usedCardIdsThisTurn, event.payload.usedActionId];
    }
    core.highlightedDeckKind = null;
    core.latestDiscovery = null;
    core.latestDiscoveryOwnerPlayerId = null;
    core.latestRoomDrawResolution = null;
    core.pendingEventChoice = null;
    if (event.payload.bloodFromStoneTurnStartVisibleStoneCherubIds) {
        core.scenarioRuntime.bloodFromStoneTurnStartVisibleStoneCherubIdsByPlayerId = {
            ...core.scenarioRuntime.bloodFromStoneTurnStartVisibleStoneCherubIdsByPlayerId,
            [event.payload.playerId]: [...event.payload.bloodFromStoneTurnStartVisibleStoneCherubIds],
        };
    }
    const bloodFromStoneNewLineOfSightDamageRoll = event.payload.bloodFromStoneNewLineOfSightDamageRoll;
    const bloodFromStoneNewLineOfSightDamageLogText = bloodFromStoneNewLineOfSightDamageRoll
        ? `${event.payload.logText}；${bloodFromStoneNewLineOfSightDamageRoll.explorerName}进入石像小天使新视线，投出 ${bloodFromStoneNewLineOfSightDamageRoll.dice.join('、') || '0'}，承受 ${bloodFromStoneNewLineOfSightDamageRoll.amount} 点一般伤害`
        : event.payload.logText;
    if (bloodFromStoneNewLineOfSightDamageRoll) {
        core.scenarioRuntime.bloodFromStoneNewLineOfSightDamagePlayerIdsThisTurn = Array.from(new Set([
            ...core.scenarioRuntime.bloodFromStoneNewLineOfSightDamagePlayerIdsThisTurn,
            event.payload.playerId,
        ]));
    }
    const mummyGirlPickedUp = collectMummyGirlByExplorerIfPresent(
        core,
        event.payload.playerId,
        event.payload.roomId,
    );
    const synced = syncCurrentExplorerProjection(core);
    const mummyGirlPickupLog = mummyGirlPickedUp
        ? `；${synced.currentExplorer.displayName}拾起女孩`
        : '';
    if (bloodFromStoneNewLineOfSightDamageRoll) {
        const pendingBloodFromStoneNewLineOfSightDamageAllocation =
            createBloodFromStoneNewLineOfSightDamageAllocation(synced, bloodFromStoneNewLineOfSightDamageRoll);
        if (pendingBloodFromStoneNewLineOfSightDamageAllocation) {
            return {
                ...synced,
                pendingDamageAllocation: pendingBloodFromStoneNewLineOfSightDamageAllocation,
                activePlayerId: pendingBloodFromStoneNewLineOfSightDamageAllocation.playerId,
                recommendedAction: 'endTurn',
                activityLog: appendActivity(synced, bloodFromStoneNewLineOfSightDamageLogText, 'warning'),
            };
        }
        return {
            ...synced,
            recommendedAction: resolveRecommendedAction(synced),
            activityLog: appendActivity(synced, `${bloodFromStoneNewLineOfSightDamageLogText}${mummyGirlPickupLog}`, 'warning'),
        };
    }
    return {
        ...synced,
        recommendedAction: resolveRecommendedAction(synced),
        activityLog: appendActivity(synced, `${event.payload.logText}${mummyGirlPickupLog}`, 'neutral'),
    };
}
