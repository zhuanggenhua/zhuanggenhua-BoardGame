import {
    appendActivity,
    replaceExplorers,
    syncCurrentExplorerProjection,
} from './coreStateModel';
import {
    createBloodFromStoneGazeDamageAllocationQueue,
    createPendingDamageAllocation,
} from './damageResolutionModel';
import {
    findExplorerByPlayerId,
    getAllExplorers,
} from './explorerReadModel';
import type { BetrayalCore } from './game';
import type { BetrayalEvent } from './events';
import { resolveMummyStealableCards } from './hauntAttackRewardReadModel';
import {
    findHelpingHandsTrollHand,
    isMummyMonster,
} from './hauntScenarioReadModel';
import {
    cloneMonsterMovementRollGroupResult,
    cloneMonsterTurnRuntimeState,
    createInitialMonsterTurnRuntimeState,
} from './monsterActionReadModel';
import {
    applyBetrayalMonsterDamageOutcome,
    flipStunnedMonsterSideUp,
} from './monsterReadModel';
import {
    collectMummyGirlByMummyIfPresent,
    resolveMummyForcedDamageTraits,
} from './mummyHauntRules';
import { resolveRecommendedAction } from './recommendedActionReadModel';
import { resolveDefenseExtraDiceWhenAttacked } from './attackRules';

type MonsterDamageResolvedEvent = Extract<BetrayalEvent, { type: 'MONSTER_DAMAGE_RESOLVED' }>;
type MonsterTurnStartResolvedEvent = Extract<BetrayalEvent, { type: 'MONSTER_TURN_START_RESOLVED' }>;
type MonsterMovementGroupRolledEvent = Extract<BetrayalEvent, { type: 'MONSTER_MOVEMENT_GROUP_ROLLED' }>;
type MonsterMovedEvent = Extract<BetrayalEvent, { type: 'MONSTER_MOVED' }>;
type MonsterAttackHeroResolvedEvent = Extract<BetrayalEvent, { type: 'MONSTER_ATTACK_HERO_RESOLVED' }>;
type BloodFromStoneMonsterTurnEndedEvent = Extract<BetrayalEvent, { type: 'BLOOD_FROM_STONE_MONSTER_TURN_ENDED' }>;
type HelpingHandsMonsterTurnStartedEvent = Extract<BetrayalEvent, { type: 'HELPING_HANDS_MONSTER_TURN_STARTED' }>;
type HelpingHandsTrollHandMovedEvent = Extract<BetrayalEvent, { type: 'HELPING_HANDS_TROLL_HAND_MOVED' }>;
type HelpingHandsMonsterTurnEndedEvent = Extract<BetrayalEvent, { type: 'HELPING_HANDS_MONSTER_TURN_ENDED' }>;
type TurnEndRollAcknowledgedPayload = Extract<BetrayalEvent, { type: 'TURN_END_ROLL_ACKNOWLEDGED' }>['payload'];

export interface BetrayalBloodFromStoneMonsterTurnEndedStateResolution {
    core: BetrayalCore;
    turnEndRollAcknowledgedPayload?: TurnEndRollAcknowledgedPayload;
}

export function applyBetrayalMonsterDamageResolvedState(
    core: BetrayalCore,
    event: MonsterDamageResolvedEvent,
): BetrayalCore {
    applyBetrayalMonsterDamageOutcome(core, event.payload.monsterDamageOutcome);
    const syncedCore = syncCurrentExplorerProjection(core);
    return {
        ...syncedCore,
        recentRoll: null,
        recommendedAction: resolveRecommendedAction(syncedCore),
        activityLog: appendActivity(
            syncedCore,
            event.payload.logText,
            event.payload.monsterDamageOutcome.kind === 'none' ? 'warning' : 'accent',
        ),
    };
}

export function applyBetrayalMonsterTurnStartResolvedState(
    core: BetrayalCore,
    event: MonsterTurnStartResolvedEvent,
): BetrayalCore {
    const monsterTurn = cloneMonsterTurnRuntimeState(core.scenarioRuntime.monsterTurn);
    monsterTurn.resolvedStartMonsterIds = Array.from(new Set([
        ...monsterTurn.resolvedStartMonsterIds,
        event.payload.monsterId,
    ]));
    if (event.payload.skippedTurn) {
        monsterTurn.skippedMonsterIdsThisTurn = Array.from(new Set([
            ...monsterTurn.skippedMonsterIdsThisTurn,
            event.payload.monsterId,
        ]));
        monsterTurn.moveRemainingById = Object.fromEntries(
            Object.entries(monsterTurn.moveRemainingById)
                .filter(([monsterId]) => monsterId !== event.payload.monsterId),
        );
    }
    if (event.payload.flippedStunnedSideUp) {
        flipStunnedMonsterSideUp(core, event.payload.monsterId);
    }
    core.scenarioRuntime.monsterTurn = monsterTurn;
    const syncedCore = syncCurrentExplorerProjection(core);
    return {
        ...syncedCore,
        recentRoll: null,
        recommendedAction: resolveRecommendedAction(syncedCore),
        activityLog: appendActivity(
            syncedCore,
            event.payload.logText,
            event.payload.skippedTurn ? 'warning' : 'accent',
        ),
    };
}

export function applyBetrayalMonsterMovementGroupRolledState(
    core: BetrayalCore,
    event: MonsterMovementGroupRolledEvent,
): BetrayalCore {
    const monsterTurn = cloneMonsterTurnRuntimeState(core.scenarioRuntime.monsterTurn);
    const result = cloneMonsterMovementRollGroupResult(event.payload.result);
    monsterTurn.movementRollsByGroupId = {
        ...monsterTurn.movementRollsByGroupId,
        [result.groupId]: result,
    };
    monsterTurn.moveRemainingById = {
        ...monsterTurn.moveRemainingById,
        ...Object.fromEntries(
            result.monsterIds.map((monsterId) => [monsterId, result.moveAllowance]),
        ),
    };
    core.scenarioRuntime.monsterTurn = monsterTurn;
    const syncedCore = syncCurrentExplorerProjection(core);
    return {
        ...syncedCore,
        recentRoll: {
            id: `monster-move-group-${result.groupId}-${event.timestamp}`,
            kind: 'monsterMoveRoll',
            playerId: result.playerId,
            sourceTitle: `${result.monsterName}移动`,
            trait: 'speed',
            rollLabel: `速度 ${result.speed}`,
            dice: [...result.dice],
            passiveBonus: 0,
            latestLabel: `每只可移动 ${result.moveAllowance} 间`,
            consumedRabbitFootCardIds: [],
        },
        recommendedAction: resolveRecommendedAction(syncedCore),
        activityLog: appendActivity(syncedCore, event.payload.logText, 'accent'),
    };
}

export function applyBetrayalMonsterMovedState(
    core: BetrayalCore,
    event: MonsterMovedEvent,
): BetrayalCore {
    const monsterTurn = cloneMonsterTurnRuntimeState(core.scenarioRuntime.monsterTurn);
    core.monsters = core.monsters.map((monster) => (
        monster.id === event.payload.monsterId
            ? { ...monster, roomId: event.payload.toRoomId }
            : monster
    ));
    if (event.payload.monsterId === 'jack-spirit') {
        core.scenarioRuntime.jackSpiritRoomId = event.payload.toRoomId;
        core.scenarioRuntime.jackSpiritHasMovedSinceRelease = true;
    }
    if (event.payload.teleportMove) {
        monsterTurn.movedMonsterIdsThisTurn = Array.from(new Set([
            ...monsterTurn.movedMonsterIdsThisTurn,
            event.payload.monsterId,
        ]));
    }
    monsterTurn.moveRemainingById = {
        ...monsterTurn.moveRemainingById,
        [event.payload.monsterId]: event.payload.moveRemaining,
    };
    core.scenarioRuntime.monsterTurn = monsterTurn;
    const mummyGirlPickedUp = collectMummyGirlByMummyIfPresent(
        core,
        event.payload.monsterId,
        event.payload.toRoomId,
    );
    const mummyGirlPickupLog = mummyGirlPickedUp ? '；木乃伊拾起女孩' : '';
    const syncedCore = syncCurrentExplorerProjection(core);
    return {
        ...syncedCore,
        recommendedAction: resolveRecommendedAction(syncedCore),
        activityLog: appendActivity(syncedCore, `${event.payload.logText}${mummyGirlPickupLog}`, 'accent'),
    };
}

export function applyBetrayalMonsterAttackHeroResolvedState(
    core: BetrayalCore,
    event: MonsterAttackHeroResolvedEvent,
): BetrayalCore {
    const monsterTurn = cloneMonsterTurnRuntimeState(core.scenarioRuntime.monsterTurn);
    monsterTurn.attackedMonsterIdsThisTurn = Array.from(new Set([
        ...monsterTurn.attackedMonsterIdsThisTurn,
        event.payload.monsterId,
    ]));
    core.scenarioRuntime.monsterTurn = monsterTurn;
    const defender = findExplorerByPlayerId(core, event.payload.targetPlayerId);
    if (event.payload.monsterDamageOutcome) {
        applyBetrayalMonsterDamageOutcome(core, event.payload.monsterDamageOutcome);
    }
    const mummyStealableCards = defender && event.payload.damageToHero && event.payload.damageToHero >= 2
        ? resolveMummyStealableCards(core, defender.playerId)
        : [];
    const pendingMummyAttackReward = defender
        && isMummyMonster(core, event.payload.monsterId)
        && event.payload.damageToHero
        && event.payload.damageToHero >= 2
        && mummyStealableCards.length > 0
        && core.scenarioRuntime.mummy
        ? {
            id: `mummy-attack-reward-${event.payload.monsterId}-${defender.playerId}-${event.timestamp}`,
            controllerPlayerId: event.payload.playerId,
            monsterId: event.payload.monsterId,
            monsterName: event.payload.monsterName,
            defenderPlayerId: defender.playerId,
            damageToHero: event.payload.damageToHero,
            defenderTraitsBeforeDamage: { ...event.payload.defenderTraitsBeforeDamage },
            stealableCardIds: mummyStealableCards.map((card) => card.id),
        }
        : undefined;
    if (pendingMummyAttackReward && core.scenarioRuntime.mummy) {
        core.scenarioRuntime.mummy.pendingAttackReward = pendingMummyAttackReward;
    }
    const damageKind = event.payload.damageKind ?? 'physical';
    const pendingMonsterAttackDamageAllocation = defender && event.payload.damageToHero && !pendingMummyAttackReward
        ? createPendingDamageAllocation({
            id: `monster-attack-damage-${defender.playerId}-${event.timestamp}`,
            explorer: defender,
            sourceTitle: '攻击',
            damageKind,
            amount: event.payload.damageToHero,
            allowSkull: true,
            forcedTraitSequence: isMummyMonster(core, event.payload.monsterId)
                ? resolveMummyForcedDamageTraits(defender, event.payload.damageToHero, { allowSkull: true })
                : undefined,
        })
        : null;
    const monsterTraits = core.monsters.find((monster) => monster.id === event.payload.monsterId);
    const syncedCore = syncCurrentExplorerProjection(core);
    return {
        ...syncedCore,
        pendingDamageAllocation: pendingMonsterAttackDamageAllocation,
        activePlayerId: pendingMonsterAttackDamageAllocation?.playerId
            ?? pendingMummyAttackReward?.controllerPlayerId
            ?? null,
        recentRoll: {
            id: `${event.payload.monsterId}-normal-attack-${event.timestamp}`,
            kind: 'attackRoll',
            playerId: event.payload.playerId,
            sourceTitle: `${event.payload.monsterName}攻击`,
            dice: [...event.payload.dice],
            passiveBonus: 0,
            latestLabel: event.payload.monsterRoll === event.payload.heroRoll
                ? '平手无伤害'
                : event.payload.damageToHero
                    ? pendingMummyAttackReward
                        ? `本会造成 ${event.payload.damageToHero} 点伤害，满足木乃伊偷取条件`
                        : `造成 ${event.payload.damageToHero} 点伤害`
                    : (event.payload.monsterDamageOutcome?.logLabel ?? '怪物受伤'),
            attack: {
                target: 'hero',
                defenderPlayerId: event.payload.targetPlayerId,
                damageKind,
                previousDamageToAttacker: event.payload.monsterDamageOutcome?.damageAmount ?? 0,
                previousDamageToDefender: event.payload.damageToHero ?? 0,
                defenderRoll: event.payload.heroRoll,
                defenderDefenseExtraDice: defender
                    ? resolveDefenseExtraDiceWhenAttacked(defender)
                    : 0,
                attackerTraitsBeforeDamage: {
                    might: monsterTraits?.might ?? 0,
                    speed: monsterTraits?.speed ?? 0,
                    knowledge: monsterTraits?.knowledge ?? 0,
                    sanity: monsterTraits?.sanity ?? 0,
                },
                defenderTraitsBeforeDamage: { ...event.payload.defenderTraitsBeforeDamage },
                weaponAttackTrait: event.payload.attackTrait,
            },
            consumedRabbitFootCardIds: [],
        },
        recommendedAction: pendingMonsterAttackDamageAllocation || pendingMummyAttackReward
            ? 'endTurn'
            : resolveRecommendedAction(syncedCore),
        activityLog: appendActivity(
            syncedCore,
            event.payload.logText,
            event.payload.damageToHero ? 'warning' : 'accent',
        ),
    };
}

export function applyBetrayalHelpingHandsMonsterTurnStartedState(
    core: BetrayalCore,
    event: HelpingHandsMonsterTurnStartedEvent,
): BetrayalCore {
    const helpingHands = core.scenarioRuntime.helpingHands;
    const controller = findExplorerByPlayerId(core, event.payload.controllerPlayerId);
    if (!helpingHands || !controller) {
        return core;
    }
    const nextCore = replaceExplorers(
        core,
        getAllExplorers(core),
        event.payload.controllerPlayerId,
    );
    const nextHelpingHands = nextCore.scenarioRuntime.helpingHands;
    if (!nextHelpingHands) {
        return nextCore;
    }
    nextHelpingHands.activeMonsterTurn = true;
    nextHelpingHands.monsterTurnControllerPlayerId = event.payload.controllerPlayerId;
    nextHelpingHands.trollHandMoveAllowance = event.payload.moveAllowance;
    nextHelpingHands.trollHandMoveDice = [...event.payload.moveDice];
    nextHelpingHands.trollHandMoveRemainingById = Object.fromEntries(
        nextHelpingHands.trollHandIds
            .filter((id) => nextCore.monsters.some((monster) => monster.id === id))
            .map((id) => [id, event.payload.moveAllowance]),
    );
    nextHelpingHands.trollHandAttackUsedIdsThisTurn = [];
    const syncedCore = syncCurrentExplorerProjection(nextCore);
    return {
        ...syncedCore,
        activePlayerId: event.payload.controllerPlayerId,
        recommendedAction: 'endTurn',
        recentRoll: {
            id: `helping-hands-monster-move-${event.timestamp}`,
            kind: 'monsterMoveRoll',
            playerId: event.payload.controllerPlayerId,
            sourceTitle: '巨魔手移动',
            trait: 'speed',
            rollLabel: '速度 3',
            dice: [...event.payload.moveDice],
            passiveBonus: 0,
            latestLabel: `每只巨魔手可移动 ${event.payload.moveAllowance} 间`,
            consumedRabbitFootCardIds: [],
        },
        activityLog: appendActivity(syncedCore, event.payload.logText, 'warning'),
    };
}

export function applyBetrayalHelpingHandsTrollHandMovedState(
    core: BetrayalCore,
    event: HelpingHandsTrollHandMovedEvent,
): BetrayalCore {
    const helpingHands = core.scenarioRuntime.helpingHands;
    const monster = findHelpingHandsTrollHand(core, event.payload.monsterId);
    if (!helpingHands || !monster) {
        return core;
    }
    monster.roomId = event.payload.toRoomId;
    helpingHands.trollHandMoveRemainingById = {
        ...helpingHands.trollHandMoveRemainingById,
        [monster.id]: event.payload.moveRemaining,
    };
    const syncedCore = syncCurrentExplorerProjection(core);
    return {
        ...syncedCore,
        recommendedAction: 'endTurn',
        activityLog: appendActivity(syncedCore, event.payload.logText, 'accent'),
    };
}

export function applyBetrayalHelpingHandsMonsterTurnEndedState(
    core: BetrayalCore,
    event: HelpingHandsMonsterTurnEndedEvent,
): BetrayalCore {
    const helpingHands = core.scenarioRuntime.helpingHands;
    if (!helpingHands) {
        return core;
    }
    helpingHands.activeMonsterTurn = false;
    helpingHands.monsterTurnControllerPlayerId = null;
    helpingHands.trollHandMoveAllowance = 0;
    helpingHands.trollHandMoveDice = [];
    helpingHands.trollHandMoveRemainingById = {};
    helpingHands.trollHandAttackUsedIdsThisTurn = [];
    const nextCore = replaceExplorers(
        core,
        getAllExplorers(core),
        event.payload.nextPlayerId,
    );
    const syncedCore = syncCurrentExplorerProjection(nextCore);
    return {
        ...syncedCore,
        currentPlayer: event.payload.nextPlayerId,
        activePlayerId: null,
        recommendedAction: resolveRecommendedAction(syncedCore),
        recentRoll: null,
        activityLog: appendActivity(syncedCore, event.payload.logText, 'accent'),
    };
}

export function applyBloodFromStoneMonsterTurnEndedState(
    core: BetrayalCore,
    event: BloodFromStoneMonsterTurnEndedEvent,
): BetrayalBloodFromStoneMonsterTurnEndedStateResolution {
    if (core.scenarioRuntime.bloodFromStone) {
        core.scenarioRuntime.bloodFromStone = {
            ...core.scenarioRuntime.bloodFromStone,
            activeMonsterTurn: false,
            monsterTurnControllerPlayerId: null,
        };
    }
    core.scenarioRuntime.monsterTurn = createInitialMonsterTurnRuntimeState();
    const pendingGazeDamageAllocation = createBloodFromStoneGazeDamageAllocationQueue(
        core,
        event.payload.damageRolls,
        event.payload.nextPlayerId,
        event.payload.turnLogText,
    );
    const syncedCore = syncCurrentExplorerProjection(core);
    if (pendingGazeDamageAllocation) {
        return {
            core: {
                ...syncedCore,
                pendingDamageAllocation: pendingGazeDamageAllocation,
                activePlayerId: pendingGazeDamageAllocation.playerId,
                recommendedAction: 'endTurn',
                recentRoll: null,
                activityLog: appendActivity(syncedCore, event.payload.logText, 'warning'),
            },
        };
    }
    return {
        core: syncedCore,
        turnEndRollAcknowledgedPayload: {
            previousPlayerId: event.payload.controllerPlayerId,
            nextPlayerId: event.payload.nextPlayerId,
            monsterMovementRoll: null,
            skipBloodFromStoneMonsterTurnStart: true,
            logText: [event.payload.logText, event.payload.turnLogText].filter(Boolean).join('；'),
        },
    };
}
