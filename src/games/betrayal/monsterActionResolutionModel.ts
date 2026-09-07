import type { RandomFn } from '../../engine/types';
import { rollBetrayalDicePips } from './diceRules';
import { findExplorerByPlayerId } from './explorerReadModel';
import type { BetrayalCore } from './game';
import type { BetrayalCommandMap } from './commandTypes';
import type { BetrayalEvent } from './events';
import {
    createBetrayalMonsterMovementRollGroupResult,
    hasMummyTeleportMoveAvailable,
    resolveBetrayalMonsterMoveCost,
    resolveBetrayalMonsterTurnStartResolutionPreview,
    resolveBloodFromStoneGazeDamageRolls,
    resolveBloodFromStoneMonsterTurnEndPreview,
    resolveStoneCherubMoveRemainingAfterMove,
} from './monsterActionReadModel';
import {
    resolveBetrayalMonsterDamageOutcome,
    resolveMonsterDefaultAttackTrait,
    resolveMonsterTrait,
} from './monsterReadModel';
import {
    resolveAttackDamageKind,
    rollAttackDefense,
} from './attackRules';

type MonsterDamageResolvedPayload = Extract<BetrayalEvent, { type: 'MONSTER_DAMAGE_RESOLVED' }>['payload'];
type MonsterTurnStartResolvedPayload = Extract<BetrayalEvent, { type: 'MONSTER_TURN_START_RESOLVED' }>['payload'];
type MonsterMovementGroupRolledPayload = Extract<BetrayalEvent, { type: 'MONSTER_MOVEMENT_GROUP_ROLLED' }>['payload'];
type MonsterMovedPayload = Extract<BetrayalEvent, { type: 'MONSTER_MOVED' }>['payload'];
type BloodFromStoneMonsterTurnEndedPayload = Extract<BetrayalEvent, { type: 'BLOOD_FROM_STONE_MONSTER_TURN_ENDED' }>['payload'];
type MonsterAttackHeroResolvedPayload = Extract<BetrayalEvent, { type: 'MONSTER_ATTACK_HERO_RESOLVED' }>['payload'];
type HelpingHandsMonsterTurnStartedEvent = Extract<BetrayalEvent, { type: 'HELPING_HANDS_MONSTER_TURN_STARTED' }>;

export function createBetrayalHelpingHandsMonsterTurnStartedEvent(
    controllerPlayerId: string,
    random: RandomFn,
    timestamp: number,
): HelpingHandsMonsterTurnStartedEvent {
    const moveDice = rollBetrayalDicePips(random, 3);
    const moveAllowance = Math.max(1, moveDice.reduce((sum, pip) => sum + pip, 0));
    return {
        type: 'HELPING_HANDS_MONSTER_TURN_STARTED',
        payload: {
            controllerPlayerId,
            moveAllowance,
            moveDice,
            logText: `巨魔手怪物回合开始：速度 3 投出 ${moveDice.join('、')}，每只巨魔手本回合可移动 ${moveAllowance} 间`,
        },
        timestamp,
    };
}

export function resolveBetrayalMonsterDamageResolvedPayload(
    core: BetrayalCore,
    command: {
        playerId: string;
        payload: BetrayalCommandMap['RESOLVE_MONSTER_DAMAGE'];
    },
): MonsterDamageResolvedPayload | null {
    const outcome = resolveBetrayalMonsterDamageOutcome(core, command.payload.monsterId!, {
        damageAmount: command.payload.damageAmount!,
        damageTrait: command.payload.damageTrait!,
    });
    if (!outcome) {
        return null;
    }
    return {
        playerId: command.playerId,
        monsterId: outcome.monsterId,
        monsterName: outcome.name,
        damageAmount: outcome.damageAmount,
        damageTrait: outcome.damageTrait,
        monsterDamageOutcome: outcome,
        logText: `${outcome.name}承受 ${outcome.damageAmount} 点伤害：${outcome.logLabel}`,
    };
}

export function resolveBetrayalMonsterTurnStartResolvedPayload(
    core: BetrayalCore,
    command: {
        playerId: string;
        payload: BetrayalCommandMap['RESOLVE_MONSTER_TURN_START'];
    },
): MonsterTurnStartResolvedPayload | null {
    const monsterId = command.payload.monsterId!;
    const preview = resolveBetrayalMonsterTurnStartResolutionPreview(core, monsterId);
    if (!preview.canResolve || !preview.name || !preview.status || !preview.nextStatus) {
        return null;
    }
    const logText = preview.willFlipStunnedSideUp
        ? `${preview.name}翻回正面，并跳过本次怪物回合`
        : preview.willSkipTurn
            ? `${preview.name}跳过本次怪物回合`
            : `${preview.name}开始怪物回合`;
    return {
        playerId: command.playerId,
        monsterId,
        monsterName: preview.name,
        previousStatus: preview.status,
        nextStatus: preview.nextStatus,
        flippedStunnedSideUp: preview.willFlipStunnedSideUp,
        skippedTurn: preview.willSkipTurn,
        startedTurn: preview.willStartTurn,
        movementGroupId: preview.movementGroupId ?? undefined,
        logText,
    };
}

export function resolveBetrayalMonsterMovementGroupRolledPayload(
    core: BetrayalCore,
    command: {
        playerId: string;
        payload: BetrayalCommandMap['ROLL_MONSTER_MOVEMENT_GROUP'];
    },
    random: RandomFn,
): MonsterMovementGroupRolledPayload | null {
    const result = createBetrayalMonsterMovementRollGroupResult(
        core,
        command.payload.groupId!,
        command.playerId,
        random,
    );
    if (!result) {
        return null;
    }
    return {
        result,
        logText: `${result.monsterName}速度 ${result.speed} 投出 ${result.dice.join('、')}，每只本回合可移动 ${result.moveAllowance} 间`,
    };
}

export function resolveBetrayalMonsterMovedPayload(
    core: BetrayalCore,
    command: {
        playerId: string;
        payload: BetrayalCommandMap['MOVE_MONSTER_TO_ROOM'];
    },
): MonsterMovedPayload | null {
    const monster = core.monsters.find((item) => item.id === command.payload.monsterId);
    const targetRoom = command.payload.roomId
        ? core.rooms.find((room) => room.id === command.payload.roomId)
        : null;
    if (!monster || !targetRoom) {
        return null;
    }
    const canMummyTeleportNow = hasMummyTeleportMoveAvailable(core, monster.id);
    const moveCost = canMummyTeleportNow ? 0 : resolveBetrayalMonsterMoveCost(core, monster.id);
    const moveRemainingAfterCost = Math.max(
        0,
        (core.scenarioRuntime.monsterTurn?.moveRemainingById?.[monster.id] ?? 0) - moveCost,
    );
    const moveRemaining = canMummyTeleportNow
        ? 0
        : resolveStoneCherubMoveRemainingAfterMove(
            core,
            monster,
            targetRoom.id,
            moveRemainingAfterCost,
        );
    const stoppedInHeroLineOfSight = moveRemainingAfterCost > 0 && moveRemaining === 0;
    const sourceRoomName = core.rooms.find((room) => room.id === monster.roomId)?.name ?? monster.roomId;
    return {
        playerId: command.playerId,
        monsterId: monster.id,
        monsterName: monster.name,
        fromRoomId: monster.roomId,
        toRoomId: targetRoom.id,
        moveCost,
        moveRemaining,
        teleportMove: canMummyTeleportNow,
        logText: canMummyTeleportNow
            ? `${monster.name}从${sourceRoomName}瞬移到${targetRoom.name}`
            : `${monster.name}从${sourceRoomName}移动到${targetRoom.name}，消耗 ${moveCost} 点移动${stoppedInHeroLineOfSight ? '；进入英雄视线后立即停止' : ''}`,
    };
}

export function resolveBloodFromStoneMonsterTurnEndedPayload(
    core: BetrayalCore,
    command: {
        playerId: string;
    },
    random: RandomFn,
): BloodFromStoneMonsterTurnEndedPayload | null {
    const preview = resolveBloodFromStoneMonsterTurnEndPreview(core);
    if (!preview.canEnd || !preview.nextPlayerId) {
        return null;
    }
    const damageRolls = resolveBloodFromStoneGazeDamageRolls(core, random);
    const nextExplorer = findExplorerByPlayerId(core, preview.nextPlayerId);
    const turnLogText = nextExplorer ? `轮到${nextExplorer.displayName}` : '进入下一位玩家回合';
    const damageLogText = damageRolls.length > 0
        ? damageRolls.map((roll) => (
            `${roll.explorerName}视线内有 ${roll.visibleStoneCherubIds.length} 个石像小天使，投出 ${roll.dice.join('、') || '0'}，承受 ${roll.amount} 点一般伤害`
        )).join('；')
        : '没有英雄处于石像小天使视线内';
    return {
        controllerPlayerId: command.playerId,
        nextPlayerId: preview.nextPlayerId,
        damageRolls,
        logText: `石像小天使怪物回合结束；${damageLogText}`,
        turnLogText,
    };
}

export function resolveBetrayalMonsterAttackHeroResolvedPayload(
    core: BetrayalCore,
    command: {
        playerId: string;
        payload: BetrayalCommandMap['MONSTER_ATTACK_HERO'];
    },
    random: RandomFn,
): MonsterAttackHeroResolvedPayload | null {
    const monster = core.monsters.find((item) => item.id === command.payload.monsterId);
    const target = command.payload.targetPlayerId
        ? findExplorerByPlayerId(core, command.payload.targetPlayerId)
        : null;
    if (!monster || !target) {
        return null;
    }
    const attackTrait = resolveMonsterDefaultAttackTrait(monster);
    const damageKind = resolveAttackDamageKind(attackTrait);
    const monsterDice = rollBetrayalDicePips(random, resolveMonsterTrait(monster, attackTrait));
    const monsterRoll = monsterDice.reduce((sum, pip) => sum + pip, 0);
    const heroRoll = rollAttackDefense(random, target, null, attackTrait);
    const damageToHero = Math.max(0, monsterRoll - heroRoll);
    const damageToMonster = Math.max(0, heroRoll - monsterRoll);
    const monsterDamageOutcome = damageToMonster > 0
        ? resolveBetrayalMonsterDamageOutcome(core, monster.id, {
            damageAmount: damageToMonster,
            damageTrait: attackTrait,
        })
        : null;
    const resultText = monsterRoll === heroRoll
        ? '双方都没有受伤'
        : damageToHero > 0
            ? `造成 ${damageToHero} 点 ${damageKind} damage`
            : (monsterDamageOutcome?.logLabel ?? `承受 ${damageToMonster} 点伤害`);
    return {
        playerId: command.playerId,
        monsterId: monster.id,
        monsterName: monster.name,
        targetPlayerId: target.playerId,
        attackTrait,
        damageKind,
        monsterRoll,
        heroRoll,
        damageToHero: damageToHero || undefined,
        monsterDamageOutcome: monsterDamageOutcome ?? undefined,
        dice: monsterDice,
        defenderTraitsBeforeDamage: { ...target.traits },
        logText: `${monster.name}攻击${target.displayName}，${resultText}`,
    };
}
