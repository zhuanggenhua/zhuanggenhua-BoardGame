import type { ValidationResult } from '../../engine/types';
import { BETRAYAL_COMMANDS } from './commands';
import type { BetrayalCore } from './game';
import type { BetrayalCommand } from './commandTypes';
import { isStoneCherubMonster } from './hauntScenarioReadModel';
import {
    hasMummyTeleportMoveAvailable,
    resolveBetrayalMonsterMoveCost,
    resolveBetrayalMonsterMovementGroups,
    resolveBetrayalMonsterMovementRollGroupPreview,
    resolveBetrayalMonsterMoveTargetRooms,
    resolveBetrayalMonsterTurnStartResolutionPreview,
    resolveBetrayalNormalMonsterAttackTargets,
    resolveBloodFromStoneMonsterTurnEndPreview,
    resolveMonsterAttackCommand,
} from './monsterActionReadModel';
import { resolveBetrayalMonsterDamageOutcome } from './monsterReadModel';
import { BETRAYAL_TRAIT_KEYS } from './traitTrackModel';

export function isBetrayalHelpingHandsMonsterTurnCommand(command: BetrayalCommand): boolean {
    return command.type === BETRAYAL_COMMANDS.MOVE_HELPING_HANDS_TROLL_HAND
        || command.type === BETRAYAL_COMMANDS.HELPING_HANDS_TROLL_HAND_ATTACK
        || command.type === BETRAYAL_COMMANDS.END_HELPING_HANDS_MONSTER_TURN;
}

export function isBetrayalBloodFromStoneMonsterTurnCommand(
    core: BetrayalCore,
    command: BetrayalCommand,
): boolean {
    switch (command.type) {
        case BETRAYAL_COMMANDS.RESOLVE_MONSTER_TURN_START: {
            const monster = core.monsters.find((item) => item.id === command.payload.monsterId);
            return Boolean(monster && isStoneCherubMonster(monster));
        }
        case BETRAYAL_COMMANDS.ROLL_MONSTER_MOVEMENT_GROUP: {
            const groupId = command.payload.groupId;
            return resolveBetrayalMonsterMovementGroups(core).some((group) => (
                group.groupId === groupId
                && group.monsterIds.some((monsterId) => {
                    const monster = core.monsters.find((item) => item.id === monsterId);
                    return Boolean(monster && isStoneCherubMonster(monster));
                })
            ));
        }
        case BETRAYAL_COMMANDS.MOVE_MONSTER_TO_ROOM: {
            const monster = core.monsters.find((item) => item.id === command.payload.monsterId);
            return Boolean(monster && isStoneCherubMonster(monster));
        }
        case BETRAYAL_COMMANDS.END_BLOOD_FROM_STONE_MONSTER_TURN:
            return true;
        default:
            return false;
    }
}

export function isBetrayalStandardMonsterTurnCommand(
    core: BetrayalCore,
    command: BetrayalCommand,
): boolean {
    return (
        command.type === BETRAYAL_COMMANDS.RESOLVE_MONSTER_TURN_START
        || command.type === BETRAYAL_COMMANDS.ROLL_MONSTER_MOVEMENT_GROUP
        || command.type === BETRAYAL_COMMANDS.MOVE_MONSTER_TO_ROOM
        || command.type === BETRAYAL_COMMANDS.MONSTER_ATTACK_HERO
        || command.type === BETRAYAL_COMMANDS.PHANTOM_PHOTOGRAPHER_ATTACK
    )
        && !isBetrayalHelpingHandsMonsterTurnCommand(command)
        && !isBetrayalBloodFromStoneMonsterTurnCommand(core, command);
}

export function validateBetrayalMonsterActionCommand(
    core: BetrayalCore,
    command: BetrayalCommand,
): ValidationResult | null {
    switch (command.type) {
        case BETRAYAL_COMMANDS.RESOLVE_MONSTER_DAMAGE: {
            const monsterId = command.payload.monsterId;
            if (!monsterId) {
                return { valid: false, error: '必须选择要结算受伤的怪物。' };
            }
            const monster = core.monsters.find((item) => item.id === monsterId);
            if (!monster) {
                return { valid: false, error: '当前宅邸中找不到该怪物。' };
            }
            const damageAmount = command.payload.damageAmount;
            if (!Number.isInteger(damageAmount) || damageAmount < 0) {
                return { valid: false, error: '怪物受伤点数必须是非负整数。' };
            }
            const damageTrait = command.payload.damageTrait;
            if (!damageTrait || !BETRAYAL_TRAIT_KEYS.includes(damageTrait)) {
                return { valid: false, error: '怪物受伤必须指定有效伤害属性。' };
            }
            const outcome = resolveBetrayalMonsterDamageOutcome(core, monsterId, {
                damageAmount,
                damageTrait,
            });
            if (!outcome) {
                return { valid: false, error: '当前无法结算该怪物受伤。' };
            }
            return { valid: true };
        }
        case BETRAYAL_COMMANDS.RESOLVE_MONSTER_TURN_START: {
            const monsterId = command.payload.monsterId;
            if (!monsterId) {
                return { valid: false, error: '必须选择要开始回合的怪物。' };
            }
            const preview = resolveBetrayalMonsterTurnStartResolutionPreview(core, monsterId);
            return preview.canResolve
                ? { valid: true }
                : { valid: false, error: preview.reason ?? '当前怪物不能开始回合。' };
        }
        case BETRAYAL_COMMANDS.ROLL_MONSTER_MOVEMENT_GROUP: {
            const groupId = command.payload.groupId;
            if (!groupId) {
                return { valid: false, error: '必须选择怪物移动骰组。' };
            }
            const preview = resolveBetrayalMonsterMovementRollGroupPreview(core, groupId);
            return preview.canRoll
                ? { valid: true }
                : { valid: false, error: preview.reason ?? '当前怪物移动骰组不能掷骰。' };
        }
        case BETRAYAL_COMMANDS.MOVE_MONSTER_TO_ROOM: {
            const monsterId = command.payload.monsterId;
            const roomId = command.payload.roomId;
            if (!monsterId || !roomId) {
                return { valid: false, error: '必须选择怪物和目标房间。' };
            }
            const monster = core.monsters.find((item) => item.id === monsterId);
            if (!monster) {
                return { valid: false, error: '当前宅邸中找不到该怪物。' };
            }
            const moveRemaining = core.scenarioRuntime.monsterTurn?.moveRemainingById?.[monsterId] ?? 0;
            const canMummyTeleportNow = hasMummyTeleportMoveAvailable(core, monsterId);
            if (moveRemaining <= 0 && !canMummyTeleportNow) {
                return { valid: false, error: '该怪物本回合没有剩余移动额度。' };
            }
            const moveCost = resolveBetrayalMonsterMoveCost(core, monsterId);
            if (moveRemaining < moveCost && !canMummyTeleportNow) {
                return { valid: false, error: '该怪物本回合剩余移动不足。' };
            }
            const canMoveToTarget = resolveBetrayalMonsterMoveTargetRooms(core, monsterId)
                .some((room) => room.id === roomId);
            return canMoveToTarget
                ? { valid: true }
                : { valid: false, error: '怪物只能移动到已发现且真实连接的房间。' };
        }
        case BETRAYAL_COMMANDS.END_BLOOD_FROM_STONE_MONSTER_TURN: {
            const preview = resolveBloodFromStoneMonsterTurnEndPreview(core);
            return preview.canEnd
                ? { valid: true }
                : { valid: false, error: preview.reason ?? '当前不能结束石像小天使怪物回合。' };
        }
        case BETRAYAL_COMMANDS.MONSTER_ATTACK_HERO: {
            const monsterId = command.payload.monsterId;
            const targetPlayerId = command.payload.targetPlayerId;
            if (!monsterId || !targetPlayerId) {
                return { valid: false, error: '必须选择怪物和攻击目标英雄。' };
            }
            if (resolveMonsterAttackCommand(core, monsterId) !== BETRAYAL_COMMANDS.MONSTER_ATTACK_HERO) {
                return { valid: false, error: '该怪物需要使用作祟专属攻击命令。' };
            }
            const targets = resolveBetrayalNormalMonsterAttackTargets(core, monsterId);
            if (!targets?.canResolveWithExistingCommand) {
                return { valid: false, error: targets?.reason ?? '该怪物当前不能发动普通攻击。' };
            }
            if (!targets.targetPlayerIds.includes(targetPlayerId)) {
                return { valid: false, error: '普通怪物只能攻击同板块的存活英雄。' };
            }
            return { valid: true };
        }
        default:
            return null;
    }
}
