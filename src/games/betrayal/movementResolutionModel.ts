import type { RandomFn } from '../../engine/types';
import { BETRAYAL_COMMANDS } from './commands';
import { rollBetrayalPip } from './diceRules';
import { findExplorerByPlayerId } from './explorerReadModel';
import {
    canUseStalkThePrey,
    resolveStalkThePreyTargets,
} from './hauntSpecialActionReadModel';
import {
    isBloodFromStoneHaunt,
    shouldDeadPlayerControlFeverish,
    shouldDeadTraitorControlJackSpirit,
} from './hauntScenarioReadModel';
import {
    resolveBloodFromStoneNewLineOfSightDamageRoll,
    resolveBloodFromStoneTurnStartVisibleStoneCherubIds,
} from './monsterActionReadModel';
import { resolveBetrayalMoveCost } from './movementReadModel';
import {
    canUseSkeletonKeyForMove,
    resolveSkeletonKeyCardId,
} from './possessionActionReadModel';
import type { BetrayalCore } from './game';
import type { BetrayalCommand } from './commandTypes';
import type { BetrayalEvent } from './events';

type MoveToRoomCommand = Extract<BetrayalCommand, { type: typeof BETRAYAL_COMMANDS.MOVE_TO_ROOM }>;
type ExplorerMovedPayload = Extract<BetrayalEvent, { type: 'EXPLORER_MOVED' }>['payload'];

export function resolveBetrayalExplorerMovedPayload(
    core: BetrayalCore,
    command: MoveToRoomCommand,
    random: RandomFn,
): ExplorerMovedPayload | null {
    const room = core.rooms.find((item) => item.id === command.payload.roomId);
    if (!room) {
        return null;
    }
    const actor = findExplorerByPlayerId(core, command.playerId) ?? core.currentExplorer;
    const bloodFromStoneTurnStartVisibleStoneCherubIds = isBloodFromStoneHaunt(core)
        ? resolveBloodFromStoneTurnStartVisibleStoneCherubIds(core, actor.playerId)
        : undefined;
    const bloodFromStoneNewLineOfSightDamageRoll = resolveBloodFromStoneNewLineOfSightDamageRoll(
        core,
        actor.playerId,
        room.id,
        random,
    );
    const isTraitor = core.phase === 'haunt' && core.scenarioRuntime.traitorPlayerId === command.playerId;
    const isDeadTraitorSpiritTurn = shouldDeadTraitorControlJackSpirit(core, actor.playerId);
    const isDeadFeverishTurn = shouldDeadPlayerControlFeverish(core, actor.playerId);
    if (command.payload.useSkeletonKey && canUseSkeletonKeyForMove(core, room.id)) {
        const skeletonKeyCardId = resolveSkeletonKeyCardId(core.currentExplorer);
        if (!skeletonKeyCardId) {
            return null;
        }
        const skeletonKeyRoll = rollBetrayalPip(random);
        const skeletonKeyBuried = skeletonKeyRoll === 0;
        return {
            playerId: command.playerId,
            roomId: room.id,
            skeletonKeyCardId,
            skeletonKeyRoll,
            skeletonKeyBuried,
            bloodFromStoneTurnStartVisibleStoneCherubIds,
            bloodFromStoneNewLineOfSightDamageRoll,
            logText: `${core.currentExplorer.displayName}使用骨制钥匙穿过墙壁到${room.name}，投出 ${skeletonKeyRoll}${skeletonKeyBuried ? '，骨制钥匙被埋葬' : ''}`,
        };
    }
    if (
        isTraitor
        && canUseStalkThePrey(core, actor)
        && resolveStalkThePreyTargets(core, actor).some((target) => target.id === room.id)
    ) {
        return {
            playerId: command.playerId,
            roomId: room.id,
            consumeMove: false,
            usedActionId: 'stalk-the-prey',
            bloodFromStoneTurnStartVisibleStoneCherubIds,
            bloodFromStoneNewLineOfSightDamageRoll,
            logText: `${actor.displayName}发动“Stalk the Prey”，潜行到了${room.name}`,
        };
    }
    if (isDeadTraitorSpiritTurn) {
        return {
            playerId: command.playerId,
            roomId: room.id,
            controlledToken: 'jack-spirit',
            bloodFromStoneTurnStartVisibleStoneCherubIds,
            bloodFromStoneNewLineOfSightDamageRoll,
            logText: `杰克之灵游荡到了${room.name}`,
        };
    }
    if (isDeadFeverishTurn) {
        return {
            playerId: command.playerId,
            roomId: room.id,
            controlledToken: 'feverish',
            bloodFromStoneTurnStartVisibleStoneCherubIds,
            bloodFromStoneNewLineOfSightDamageRoll,
            logText: `狂热病患移动到了${room.name}`,
        };
    }
    return {
        playerId: command.playerId,
        roomId: room.id,
        moveCost: resolveBetrayalMoveCost(core),
        bloodFromStoneTurnStartVisibleStoneCherubIds,
        bloodFromStoneNewLineOfSightDamageRoll,
        logText: `${core.currentExplorer.displayName}移动到${room.name}`,
    };
}
