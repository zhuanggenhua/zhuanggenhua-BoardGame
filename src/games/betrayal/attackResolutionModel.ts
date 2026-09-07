import type { RandomFn } from '../../engine/types';
import {
    isAttackTargetInWeaponRange,
    resolveAttackWeaponEffect,
    resolveDynamiteInventoryCard,
    resolveFailedAttackDamage,
    rollAttackDefense,
    rollAttackWithDice,
} from './attackRules';
import {
    formatDeathPreventionLog,
    rollDeathPrevention,
    wouldExplorerDieFromAttackDamage,
} from './damageResolutionModel';
import { rollBetrayalDicePips } from './diceRules';
import {
    findExplorerByPlayerId,
    getAllExplorers,
} from './explorerReadModel';
import type { BetrayalCore } from './game';
import type { BetrayalCommand } from './commandTypes';
import type { BetrayalEvent } from './events';
import { resolveHelpingHandsStealableCards } from './hauntAttackRewardReadModel';
import {
    findFeverishMonster,
    findHelpingHandsTrollHand,
    findJackSpirit,
    findPhantomPhotographer,
    isDustHaunt,
    isHelpingHandsHaunt,
    isMagicCameraHaunt,
    resolveControlledRoomId,
    resolveJackSpiritSpawnRoomId,
    shouldDeadPlayerControlFeverish,
    shouldDeadTraitorControlJackSpirit,
} from './hauntScenarioReadModel';
import {
    resolveBetrayalMonsterDamageOutcome,
    resolveMonsterStatusKind,
    resolveMonsterTrait,
} from './monsterReadModel';
import {
    rollTrait,
    rollTraitCheckWithDice,
} from './traitRollModel';

type HauntAttackCommand = Extract<BetrayalCommand, { type: 'HAUNT_ATTACK' }>;
type DynamiteAttackResolvedEvent = Extract<BetrayalEvent, { type: 'DYNAMITE_ATTACK_RESOLVED' }>;
type HauntAttackResolvedEvent = Extract<BetrayalEvent, { type: 'HAUNT_ATTACK_RESOLVED' }>;
type BetrayalDynamiteExplorerRoll = DynamiteAttackResolvedEvent['payload']['explorerRolls'][number];
type BetrayalDynamiteMonsterRoll = DynamiteAttackResolvedEvent['payload']['monsterRolls'][number];

export function resolveBetrayalHauntAttackCommandEvents(
    core: BetrayalCore,
    command: HauntAttackCommand,
    random: RandomFn,
    timestamp: number,
): Array<DynamiteAttackResolvedEvent | HauntAttackResolvedEvent> {
            const isTraitor = core.scenarioRuntime.traitorPlayerId === command.playerId;
            const attacker = findExplorerByPlayerId(core, command.playerId) ?? core.currentExplorer;
            const attackerTraitsBeforeDamage = { ...attacker.traits };
            const attackerRoomId = resolveControlledRoomId(core, attacker);
            const attackingWithJackSpirit = shouldDeadTraitorControlJackSpirit(core, attacker.playerId);
            const jackSpirit = attackingWithJackSpirit ? findJackSpirit(core) : null;
            const weaponEffect = attackingWithJackSpirit
                ? null
                : resolveAttackWeaponEffect(attacker, command.payload.weaponCardId);
            const attackDamageKind = weaponEffect?.damageKind ?? 'physical';
            const attackDamageLabel = `${attackDamageKind} damage`;
            if (command.payload.target === 'dynamite-room') {
                const dynamiteCard = resolveDynamiteInventoryCard(attacker, command.payload.weaponCardId);
                const targetRoom = command.payload.targetRoomId
                    ? core.rooms.find((room) => room.id === command.payload.targetRoomId && room.state === 'discovered')
                    : null;
                if (!dynamiteCard || !targetRoom) {
                    return [];
                }
                const explorerRolls = getAllExplorers(core)
                    .filter((explorer) => (
                        !core.scenarioRuntime.deadExplorerPlayerIds.includes(explorer.playerId)
                        && resolveControlledRoomId(core, explorer) === targetRoom.id
                    ))
                    .map((explorer): BetrayalDynamiteExplorerRoll => {
                        const speedRoll = rollTraitCheckWithDice(random, explorer, 'speed', core);
                        return {
                            playerId: explorer.playerId,
                            displayName: explorer.displayName,
                            dice: speedRoll.dice,
                            passiveBonus: speedRoll.passiveBonus,
                            total: speedRoll.total,
                            passed: speedRoll.total >= 4,
                            traitsBeforeDamage: { ...explorer.traits },
                        };
                    });
                const monsterRolls = core.monsters
                    .filter((monster) => monster.roomId === targetRoom.id && resolveMonsterStatusKind(core, monster.id) === 'active')
                    .map((monster): BetrayalDynamiteMonsterRoll => {
                        const dice = rollBetrayalDicePips(random, resolveMonsterTrait(monster, 'speed'));
                        const total = dice.reduce((sum, pip) => sum + pip, 0);
                        const passed = total >= 4;
                        return {
                            monsterId: monster.id,
                            monsterName: monster.name,
                            dice,
                            total,
                            passed,
                            monsterDamageOutcome: passed
                                ? null
                                : resolveBetrayalMonsterDamageOutcome(core, monster.id, {
                                    damageAmount: 4,
                                    damageTrait: 'speed',
                                }),
                        };
                    });
                const failedExplorerNames = explorerRolls.filter((roll) => !roll.passed).map((roll) => roll.displayName);
                const failedMonsterNames = monsterRolls.filter((roll) => !roll.passed).map((roll) => roll.monsterName);
                const failedNames = [...failedExplorerNames, ...failedMonsterNames];
                const resultText = failedNames.length > 0
                    ? `${failedNames.join('、')}速度检定失败，需承受 4 点物理伤害`
                    : '所有人速度检定均为 4+，无人受伤';
                return [{
                    type: 'DYNAMITE_ATTACK_RESOLVED',
                    payload: {
                    attackerPlayerId: attacker.playerId,
                    cardId: dynamiteCard.id,
                    cardName: dynamiteCard.name,
                    targetRoomId: targetRoom.id,
                    targetRoomName: targetRoom.name,
                    explorerRolls,
                    monsterRolls,
                    logText: `${attacker.displayName}使用炸药攻击${targetRoom.name}，${resultText}`,
                },
                    timestamp,
                }];
            }
            if (isHelpingHandsHaunt(core)) {
                if (command.payload.target === 'troll-hand') {
                    const trollHand = findHelpingHandsTrollHand(core, command.payload.targetMonsterId);
                    if (!trollHand) {
                        return [];
                    }
                    const attackRoll = rollAttackWithDice(random, attacker, weaponEffect);
                    const attackerRoll = attackRoll.total;
                    const defenderRoll = rollTrait(
                        random,
                        resolveMonsterTrait(trollHand, weaponEffect?.attackTrait ?? 'might'),
                    );
                    const damageToMonster = Math.max(0, attackerRoll - defenderRoll);
                    const monsterDamageOutcome = resolveBetrayalMonsterDamageOutcome(core, trollHand.id, {
                        damageAmount: damageToMonster,
                        damageTrait: weaponEffect?.attackTrait ?? 'might',
                    });
                    const damageToAttacker = resolveFailedAttackDamage(defenderRoll, attackerRoll, weaponEffect);
                    const attackerDeathPrevention = wouldExplorerDieFromAttackDamage(attacker, damageToAttacker, attackDamageKind)
                        ? rollDeathPrevention(random, attacker)
                        : null;
                    const attackerDefeated = wouldExplorerDieFromAttackDamage(attacker, damageToAttacker, attackDamageKind)
                        && !attackerDeathPrevention?.prevented;
                    const deathPrevention = attackerDeathPrevention
                        ? {
                            ...attackerDeathPrevention,
                            damageAmount: damageToAttacker,
                            damageKind: attackDamageKind,
                            traitsBeforeDamage: { ...attackerTraitsBeforeDamage },
                        }
                        : undefined;
                    const deathPreventionLog = formatDeathPreventionLog(deathPrevention);
                    return [{
                    type: 'HAUNT_ATTACK_RESOLVED',
                    payload: {
                        attackerPlayerId: attacker.playerId,
                        target: 'troll-hand',
                        defenderMonsterId: trollHand.id,
                        defeatedPlayerId: attackerDefeated ? attacker.playerId : undefined,
                        monsterDamageOutcome: monsterDamageOutcome ?? undefined,
                        outcome: monsterDamageOutcome?.kind === 'resisted'
                            ? 'troll-hand-resisted'
                            : attackerDefeated
                                ? 'hero-defeated'
                                : attackerRoll === defenderRoll
                                    ? 'no-damage'
                                    : 'wound',
                        attackerRoll,
                        defenderRoll,
                        damageToAttacker: damageToAttacker || undefined,
                        damageKind: attackDamageKind,
                        weaponCardId: weaponEffect?.card.id,
                        weaponName: weaponEffect?.card.name,
                        weaponAttackBonus: weaponEffect?.bonus || undefined,
                        weaponExtraDice: weaponEffect?.extraDice || undefined,
                        weaponSpeedCost: weaponEffect?.speedCost || undefined,
                        weaponAttackTrait: weaponEffect?.attackTrait,
                        attackRoll: {
                            id: `${attacker.playerId}-${trollHand.id}-helping-hands-${timestamp}`,
                            dice: attackRoll.dice,
                            passiveBonus: attackRoll.passiveBonus,
                            latestLabel: monsterDamageOutcome?.kind === 'resisted'
                                ? monsterDamageOutcome.logLabel
                                : damageToAttacker > 0
                                    ? `反受 ${damageToAttacker} 点伤害`
                                    : '平手无伤害',
                            attackerTraitsBeforeDamage,
                        },
                        deathPrevention,
                        logText: monsterDamageOutcome?.kind === 'resisted'
                            ? `${attacker.displayName}${weaponEffect ? `使用${weaponEffect.card.name}` : ''}击败巨魔手，但${monsterDamageOutcome.logLabel}`
                            : attackerDefeated
                                ? `${attacker.displayName}${weaponEffect ? `使用${weaponEffect.card.name}` : ''}攻击巨魔手失败并被击倒${deathPreventionLog}`
                                : damageToAttacker > 0
                                    ? `${attacker.displayName}${weaponEffect ? `使用${weaponEffect.card.name}` : ''}攻击巨魔手失败，反受 ${damageToAttacker} 点 ${attackDamageLabel}${deathPreventionLog}`
                                    : `${attacker.displayName}${weaponEffect ? `使用${weaponEffect.card.name}` : ''}攻击巨魔手，双方都没有受伤`,
                    },
                    timestamp,
                }];
                }
                const defender = command.payload.targetPlayerId
                    ? findExplorerByPlayerId(core, command.payload.targetPlayerId)
                    : null;
                if (!defender || defender.playerId === attacker.playerId) {
                    return [];
                }
                const defenderTraitsBeforeDamage = { ...defender.traits };
                const attackRoll = rollAttackWithDice(random, attacker, weaponEffect);
                const attackerRoll = attackRoll.total;
                const defenderRoll = rollAttackDefense(random, defender, weaponEffect);
                const damageToDefender = Math.max(0, attackerRoll - defenderRoll);
                const damageToAttacker = resolveFailedAttackDamage(defenderRoll, attackerRoll, weaponEffect);
                const attackTrait = weaponEffect?.attackTrait ?? 'might';
                const canChooseSteal = attackTrait === 'might'
                    && damageToDefender > 0
                    && resolveHelpingHandsStealableCards(core, defender.playerId).length > 0;
                const defenderDeathPrevention = !canChooseSteal && wouldExplorerDieFromAttackDamage(defender, damageToDefender, attackDamageKind)
                    ? rollDeathPrevention(random, defender)
                    : null;
                const attackerDeathPrevention = wouldExplorerDieFromAttackDamage(attacker, damageToAttacker, attackDamageKind)
                    ? rollDeathPrevention(random, attacker)
                    : null;
                const defenderDefeated = !canChooseSteal
                    && wouldExplorerDieFromAttackDamage(defender, damageToDefender, attackDamageKind)
                    && !defenderDeathPrevention?.prevented;
                const attackerDefeated = wouldExplorerDieFromAttackDamage(attacker, damageToAttacker, attackDamageKind)
                    && !attackerDeathPrevention?.prevented;
                const deathPrevention = defenderDeathPrevention
                    ? {
                        ...defenderDeathPrevention,
                        damageAmount: damageToDefender,
                        damageKind: attackDamageKind,
                        traitsBeforeDamage: defenderTraitsBeforeDamage,
                    }
                    : attackerDeathPrevention
                        ? {
                            ...attackerDeathPrevention,
                            damageAmount: damageToAttacker,
                            damageKind: attackDamageKind,
                            traitsBeforeDamage: { ...attackerTraitsBeforeDamage },
                        }
                        : undefined;
                const deathPreventionLog = formatDeathPreventionLog(deathPrevention);
                const helpingHandsAttackRewardChoice = canChooseSteal
                    ? {
                        id: `${attacker.playerId}-${defender.playerId}-helping-hands-reward-${timestamp}`,
                        attackerPlayerId: attacker.playerId,
                        defenderPlayerId: defender.playerId,
                        damageToDefender,
                        damageKind: attackDamageKind,
                        attackerRoll,
                        defenderRoll,
                        defenderTraitsBeforeDamage,
                    }
                    : undefined;
                return [{
                    type: 'HAUNT_ATTACK_RESOLVED',
                    payload: {
                    attackerPlayerId: attacker.playerId,
                    target: 'hero',
                    defenderPlayerId: defender.playerId,
                    defeatedPlayerId: defenderDefeated
                        ? defender.playerId
                        : attackerDefeated
                            ? attacker.playerId
                            : undefined,
                    outcome: attackerRoll === defenderRoll
                        ? 'no-damage'
                        : defenderDefeated || attackerDefeated
                            ? 'hero-defeated'
                            : 'wound',
                    attackerRoll,
                    defenderRoll,
                    damageToAttacker: damageToAttacker || undefined,
                    damageToDefender: canChooseSteal ? undefined : damageToDefender || undefined,
                    damageKind: attackDamageKind,
                    weaponCardId: weaponEffect?.card.id,
                    weaponName: weaponEffect?.card.name,
                    weaponAttackBonus: weaponEffect?.bonus || undefined,
                    weaponExtraDice: weaponEffect?.extraDice || undefined,
                    weaponSpeedCost: weaponEffect?.speedCost || undefined,
                    weaponAttackTrait: weaponEffect?.attackTrait,
                    attackRoll: {
                        id: `${attacker.playerId}-helping-hands-explorer-${timestamp}`,
                        dice: attackRoll.dice,
                        passiveBonus: attackRoll.passiveBonus,
                        latestLabel: attackerRoll === defenderRoll
                            ? '平手无伤害'
                            : canChooseSteal
                                ? `可偷牌或造成 ${damageToDefender} 点伤害`
                                : damageToDefender > 0
                                    ? `造成 ${damageToDefender} 点伤害`
                                    : `反受 ${damageToAttacker} 点伤害`,
                        attackerTraitsBeforeDamage,
                        defenderTraitsBeforeDamage,
                    },
                    deathPrevention,
                    helpingHandsAttackRewardChoice,
                    logText: canChooseSteal
                        ? `${attacker.displayName}${weaponEffect ? `使用${weaponEffect.card.name}` : ''}用力量攻击赢过${defender.displayName}，可选择造成 ${damageToDefender} 点伤害或偷取 1 张物品/预兆`
                        : attackerRoll === defenderRoll
                            ? `${attacker.displayName}${weaponEffect ? `使用${weaponEffect.card.name}` : ''}攻击${defender.displayName}，双方都没有受伤`
                            : defenderDefeated
                                ? `${attacker.displayName}${weaponEffect ? `使用${weaponEffect.card.name}` : ''}击倒了${defender.displayName}${deathPreventionLog}`
                                : attackerDefeated
                                    ? `${attacker.displayName}${weaponEffect ? `使用${weaponEffect.card.name}` : ''}攻击失败并被${defender.displayName}击倒${deathPreventionLog}`
                                    : damageToDefender > 0
                                        ? `${attacker.displayName}${weaponEffect ? `使用${weaponEffect.card.name}` : ''}攻击${defender.displayName}，造成 ${damageToDefender} 点 ${attackDamageLabel}${deathPreventionLog}`
                                        : `${attacker.displayName}${weaponEffect ? `使用${weaponEffect.card.name}` : ''}攻击${defender.displayName}失败，反受 ${damageToAttacker} 点 ${attackDamageLabel}${deathPreventionLog}`,
                },
                    timestamp,
                }];
            }
            if (isMagicCameraHaunt(core)) {
                if (command.payload.target === 'phantom-photographer') {
                    const monster = findPhantomPhotographer(core, command.payload.targetMonsterId);
                    if (!monster) {
                        return [];
                    }
                    const attackRoll = rollAttackWithDice(random, attacker, weaponEffect);
                    const attackTrait = weaponEffect?.attackTrait ?? 'might';
                    const attackerRoll = attackRoll.total;
                    const defenderRoll = rollTrait(random, resolveMonsterTrait(monster, attackTrait));
                    const damageToMonster = Math.max(0, attackerRoll - defenderRoll);
                    const monsterDamageOutcome = resolveBetrayalMonsterDamageOutcome(core, monster.id, {
                        damageAmount: damageToMonster,
                        damageTrait: attackTrait,
                    });
                    const killed = monsterDamageOutcome?.kind === 'killed';
                    const stunned = monsterDamageOutcome?.kind === 'stunned';
                    return [{
                    type: 'HAUNT_ATTACK_RESOLVED',
                    payload: {
                        attackerPlayerId: attacker.playerId,
                        target: 'phantom-photographer',
                        defenderMonsterId: monster.id,
                        defeatedMonsterId: killed ? monster.id : undefined,
                        monsterDamageOutcome: monsterDamageOutcome ?? undefined,
                        outcome: killed
                            ? 'phantom-killed'
                            : stunned
                                ? 'phantom-stunned'
                                : 'no-damage',
                        attackerRoll,
                        defenderRoll,
                        weaponCardId: weaponEffect?.card.id,
                        weaponName: weaponEffect?.card.name,
                        weaponAttackBonus: weaponEffect?.bonus || undefined,
                        weaponExtraDice: weaponEffect?.extraDice || undefined,
                        weaponSpeedCost: weaponEffect?.speedCost || undefined,
                        weaponAttackTrait: weaponEffect?.attackTrait,
                        attackRoll: {
                            id: `${attacker.playerId}-phantom-photographer-${timestamp}`,
                            dice: attackRoll.dice,
                            passiveBonus: attackRoll.passiveBonus,
                            latestLabel: killed
                                ? (monsterDamageOutcome?.logLabel ?? '击杀幻影摄影师')
                                : stunned
                                    ? (monsterDamageOutcome?.logLabel ?? '击晕幻影摄影师')
                                    : '未伤到幻影摄影师',
                            attackerTraitsBeforeDamage,
                        },
                        logText: killed
                            ? `${attacker.displayName}${weaponEffect ? `使用${weaponEffect.card.name}` : ''}用力量击杀了幻影摄影师`
                            : stunned
                                ? `${attacker.displayName}${weaponEffect ? `使用${weaponEffect.card.name}` : ''}压制了幻影摄影师，使其眩晕`
                                : `${attacker.displayName}${weaponEffect ? `使用${weaponEffect.card.name}` : ''}攻击幻影摄影师，但没造成伤害`,
                    },
                    timestamp,
                }];
                }
                const defender = command.payload.target === 'traitor'
                    ? findExplorerByPlayerId(core, core.scenarioRuntime.traitorPlayerId ?? '')
                    : command.payload.targetPlayerId
                        ? findExplorerByPlayerId(core, command.payload.targetPlayerId)
                        : null;
                if (!defender) {
                    return [];
                }
                const defenderTraitsBeforeDamage = { ...defender.traits };
                const attackRoll = rollAttackWithDice(random, attacker, weaponEffect);
                const essenceBonus = (
                    command.payload.target === 'hero'
                    && core.scenarioRuntime.magicCamera?.capturedEssencePlayerIds.includes(defender.playerId)
                ) ? 2 : 0;
                const attackerRoll = attackRoll.total + essenceBonus;
                const defenderRoll = rollAttackDefense(random, defender, weaponEffect);
                const damageToDefender = Math.max(0, attackerRoll - defenderRoll);
                const damageToAttacker = resolveFailedAttackDamage(defenderRoll, attackerRoll, weaponEffect);
                const defenderDeathPrevention = wouldExplorerDieFromAttackDamage(defender, damageToDefender, attackDamageKind)
                    ? rollDeathPrevention(random, defender)
                    : null;
                const attackerDeathPrevention = wouldExplorerDieFromAttackDamage(attacker, damageToAttacker, attackDamageKind)
                    ? rollDeathPrevention(random, attacker)
                    : null;
                const defenderDefeated = wouldExplorerDieFromAttackDamage(defender, damageToDefender, attackDamageKind)
                    && !defenderDeathPrevention?.prevented;
                const attackerDefeated = wouldExplorerDieFromAttackDamage(attacker, damageToAttacker, attackDamageKind)
                    && !attackerDeathPrevention?.prevented;
                const deathPrevention = defenderDeathPrevention
                    ? {
                        ...defenderDeathPrevention,
                        damageAmount: damageToDefender,
                        damageKind: attackDamageKind,
                        traitsBeforeDamage: defenderTraitsBeforeDamage,
                    }
                    : attackerDeathPrevention
                        ? {
                            ...attackerDeathPrevention,
                            damageAmount: damageToAttacker,
                            damageKind: attackDamageKind,
                            traitsBeforeDamage: { ...attackerTraitsBeforeDamage },
                        }
                        : undefined;
                const deathPreventionLog = formatDeathPreventionLog(deathPrevention);
                return [{
                    type: 'HAUNT_ATTACK_RESOLVED',
                    payload: {
                    attackerPlayerId: attacker.playerId,
                    target: command.payload.target,
                    defenderPlayerId: defender.playerId,
                    defeatedPlayerId: defenderDefeated
                        ? defender.playerId
                        : attackerDefeated
                            ? attacker.playerId
                            : undefined,
                    outcome: attackerRoll === defenderRoll
                        ? 'no-damage'
                        : defenderDefeated
                            ? (command.payload.target === 'traitor' ? 'traitor-defeated' : 'hero-defeated')
                            : attackerDefeated
                                ? (isTraitor ? 'traitor-defeated' : 'hero-defeated')
                                : 'wound',
                    attackerRoll,
                    defenderRoll,
                    damageToAttacker: damageToAttacker || undefined,
                    damageToDefender: damageToDefender || undefined,
                    damageKind: attackDamageKind,
                    weaponCardId: weaponEffect?.card.id,
                    weaponName: weaponEffect?.card.name,
                    weaponAttackBonus: weaponEffect?.bonus || undefined,
                    weaponExtraDice: weaponEffect?.extraDice || undefined,
                    weaponSpeedCost: weaponEffect?.speedCost || undefined,
                    weaponAttackTrait: weaponEffect?.attackTrait,
                    attackRoll: {
                        id: `${attacker.playerId}-magic-camera-attack-${timestamp}`,
                        dice: attackRoll.dice,
                        passiveBonus: attackRoll.passiveBonus + essenceBonus,
                        latestLabel: attackerRoll === defenderRoll
                            ? '平手无伤害'
                            : damageToDefender > 0
                                ? `造成 ${damageToDefender} 点伤害`
                                : `反受 ${damageToAttacker} 点伤害`,
                        attackerTraitsBeforeDamage,
                        defenderTraitsBeforeDamage,
                    },
                    deathPrevention,
                    logText: attackerRoll === defenderRoll
                        ? `${attacker.displayName}${weaponEffect ? `使用${weaponEffect.card.name}` : ''}发起攻击，双方都没有受伤`
                        : defenderDefeated
                            ? `${attacker.displayName}${weaponEffect ? `使用${weaponEffect.card.name}` : ''}击倒了${defender.displayName}${deathPreventionLog}`
                            : attackerDefeated
                                ? `${attacker.displayName}${weaponEffect ? `使用${weaponEffect.card.name}` : ''}攻击失败并被击倒${deathPreventionLog}`
                                : damageToDefender > 0
                                    ? `${attacker.displayName}${weaponEffect ? `使用${weaponEffect.card.name}` : ''}造成 ${damageToDefender} 点 ${attackDamageLabel}${essenceBonus ? '（本质 +2）' : ''}${deathPreventionLog}`
                                    : `${attacker.displayName}${weaponEffect ? `使用${weaponEffect.card.name}` : ''}攻击失败，反受 ${damageToAttacker} 点 ${attackDamageLabel}${deathPreventionLog}`,
                },
                    timestamp,
                }];
            }
            if (isHelpingHandsHaunt(core)) {
                const defender = command.payload.targetPlayerId
                    ? findExplorerByPlayerId(core, command.payload.targetPlayerId)
                    : null;
                if (!defender) {
                    return [];
                }
                const defenderTraitsBeforeDamage = { ...defender.traits };
                const attackRoll = rollAttackWithDice(random, attacker, weaponEffect);
                const attackerRoll = attackRoll.total;
                const defenderRoll = rollAttackDefense(random, defender, weaponEffect);
                const damageToDefender = Math.max(0, attackerRoll - defenderRoll);
                const damageToAttacker = resolveFailedAttackDamage(defenderRoll, attackerRoll, weaponEffect);
                const defenderStealableCards = resolveHelpingHandsStealableCards(core, defender.playerId);
                const pendingAttackReward = damageToDefender > 0 && defenderStealableCards.length > 0
                    ? {
                        id: `helping-hands-attack-reward-${attacker.playerId}-${defender.playerId}-${timestamp}`,
                        attackerPlayerId: attacker.playerId,
                        defenderPlayerId: defender.playerId,
                        damageToDefender,
                        damageKind: attackDamageKind,
                        attackerRoll,
                        defenderRoll,
                        defenderTraitsBeforeDamage,
                    }
                    : undefined;
                const defenderDeathPrevention = !pendingAttackReward && wouldExplorerDieFromAttackDamage(defender, damageToDefender, attackDamageKind)
                    ? rollDeathPrevention(random, defender)
                    : null;
                const attackerDeathPrevention = wouldExplorerDieFromAttackDamage(attacker, damageToAttacker, attackDamageKind)
                    ? rollDeathPrevention(random, attacker)
                    : null;
                const defenderDefeated = !pendingAttackReward
                    && wouldExplorerDieFromAttackDamage(defender, damageToDefender, attackDamageKind)
                    && !defenderDeathPrevention?.prevented;
                const attackerDefeated = wouldExplorerDieFromAttackDamage(attacker, damageToAttacker, attackDamageKind)
                    && !attackerDeathPrevention?.prevented;
                const deathPrevention = defenderDeathPrevention
                    ? {
                        ...defenderDeathPrevention,
                        damageAmount: damageToDefender,
                        damageKind: attackDamageKind,
                        traitsBeforeDamage: defenderTraitsBeforeDamage,
                    }
                    : attackerDeathPrevention
                        ? {
                            ...attackerDeathPrevention,
                            damageAmount: damageToAttacker,
                            damageKind: attackDamageKind,
                            traitsBeforeDamage: { ...attackerTraitsBeforeDamage },
                        }
                        : undefined;
                const deathPreventionLog = formatDeathPreventionLog(deathPrevention);
                return [{
                    type: 'HAUNT_ATTACK_RESOLVED',
                    payload: {
                    attackerPlayerId: attacker.playerId,
                    target: 'hero',
                    defenderPlayerId: defender.playerId,
                    defeatedPlayerId: defenderDefeated
                        ? defender.playerId
                        : attackerDefeated
                            ? attacker.playerId
                            : undefined,
                    outcome: attackerRoll === defenderRoll
                        ? 'no-damage'
                        : defenderDefeated || attackerDefeated
                            ? 'hero-defeated'
                            : 'wound',
                    attackerRoll,
                    defenderRoll,
                    damageToAttacker: damageToAttacker || undefined,
                    damageToDefender: pendingAttackReward ? undefined : damageToDefender || undefined,
                    damageKind: attackDamageKind,
                    weaponCardId: weaponEffect?.card.id,
                    weaponName: weaponEffect?.card.name,
                    weaponAttackBonus: weaponEffect?.bonus || undefined,
                    weaponExtraDice: weaponEffect?.extraDice || undefined,
                    weaponSpeedCost: weaponEffect?.speedCost || undefined,
                    weaponAttackTrait: weaponEffect?.attackTrait,
                    attackRoll: {
                        id: `${attacker.playerId}-helping-hands-explorer-${timestamp}`,
                        dice: attackRoll.dice,
                        passiveBonus: attackRoll.passiveBonus,
                        latestLabel: attackerRoll === defenderRoll
                            ? '平手无伤害'
                            : damageToDefender > 0
                                ? pendingAttackReward
                                    ? '胜出，选择造成伤害或偷牌'
                                    : `造成 ${damageToDefender} 点伤害`
                                : `反受 ${damageToAttacker} 点伤害`,
                        attackerTraitsBeforeDamage,
                        defenderTraitsBeforeDamage,
                    },
                    deathPrevention,
                    helpingHandsAttackRewardChoice: pendingAttackReward,
                    logText: attackerRoll === defenderRoll
                        ? `${attacker.displayName}${weaponEffect ? `使用${weaponEffect.card.name}` : ''}攻击${defender.displayName}，双方都没有受伤`
                        : pendingAttackReward
                            ? `${attacker.displayName}${weaponEffect ? `使用${weaponEffect.card.name}` : ''}压制了${defender.displayName}，可以选择造成 ${damageToDefender} 点 ${attackDamageLabel}或偷取物品/预兆`
                            : defenderDefeated
                                ? `${attacker.displayName}${weaponEffect ? `使用${weaponEffect.card.name}` : ''}击倒了${defender.displayName}${deathPreventionLog}`
                                : attackerDefeated
                                    ? `${attacker.displayName}${weaponEffect ? `使用${weaponEffect.card.name}` : ''}攻击失败并被${defender.displayName}击倒${deathPreventionLog}`
                                    : damageToDefender > 0
                                        ? `${attacker.displayName}${weaponEffect ? `使用${weaponEffect.card.name}` : ''}攻击${defender.displayName}，造成 ${damageToDefender} 点 ${attackDamageLabel}${deathPreventionLog}`
                                        : `${attacker.displayName}${weaponEffect ? `使用${weaponEffect.card.name}` : ''}攻击${defender.displayName}失败，反受 ${damageToAttacker} 点 ${attackDamageLabel}${deathPreventionLog}`,
                },
                    timestamp,
                }];
            }
            if (isDustHaunt(core)) {
                const attackingWithFeverish = shouldDeadPlayerControlFeverish(core, attacker.playerId);
                const feverish = attackingWithFeverish ? findFeverishMonster(core, attacker.playerId) : null;
                const targetExplorer = command.payload.targetPlayerId
                    ? findExplorerByPlayerId(core, command.payload.targetPlayerId)
                    : null;
                if (!targetExplorer) {
                    return [];
                }
                const defenderTraitsBeforeDamage = { ...targetExplorer.traits };
                const dustAttackRoll = feverish
                    ? {
                        dice: rollBetrayalDicePips(random, feverish.might),
                        passiveBonus: 0,
                    }
                    : rollAttackWithDice(random, attacker, weaponEffect);
                const attackerRoll = dustAttackRoll.dice.reduce((sum, pip) => sum + pip, 0) + dustAttackRoll.passiveBonus;
                const defenderRoll = rollAttackDefense(random, targetExplorer, weaponEffect);
                const damageToDefender = Math.max(0, attackerRoll - defenderRoll);
                const damageToAttacker = feverish ? 0 : resolveFailedAttackDamage(defenderRoll, attackerRoll, weaponEffect);
                const defenderDeathPrevention = wouldExplorerDieFromAttackDamage(targetExplorer, damageToDefender, attackDamageKind)
                    ? rollDeathPrevention(random, targetExplorer)
                    : null;
                const attackerDeathPrevention = !feverish && wouldExplorerDieFromAttackDamage(attacker, damageToAttacker, attackDamageKind)
                    ? rollDeathPrevention(random, attacker)
                    : null;
                const defenderDefeated = wouldExplorerDieFromAttackDamage(targetExplorer, damageToDefender, attackDamageKind)
                    && !defenderDeathPrevention?.prevented;
                const attackerDefeated = !feverish
                    && wouldExplorerDieFromAttackDamage(attacker, damageToAttacker, attackDamageKind)
                    && !attackerDeathPrevention?.prevented;
                const deathPrevention = defenderDeathPrevention
                    ? {
                        ...defenderDeathPrevention,
                        damageAmount: damageToDefender,
                        damageKind: attackDamageKind,
                        traitsBeforeDamage: defenderTraitsBeforeDamage,
                    }
                    : attackerDeathPrevention
                        ? {
                            ...attackerDeathPrevention,
                            damageAmount: damageToAttacker,
                            damageKind: attackDamageKind,
                            traitsBeforeDamage: { ...attackerTraitsBeforeDamage },
                        }
                        : undefined;
                const deathPreventionLog = formatDeathPreventionLog(deathPrevention);
                return [{
                    type: 'HAUNT_ATTACK_RESOLVED',
                    payload: {
                    attackerPlayerId: attacker.playerId,
                    target: 'hero',
                    defenderPlayerId: targetExplorer.playerId,
                    defeatedPlayerId: defenderDefeated
                        ? targetExplorer.playerId
                        : attackerDefeated
                            ? attacker.playerId
                            : undefined,
                    outcome: attackerRoll === defenderRoll
                        ? 'no-damage'
                        : defenderDefeated
                            ? 'hero-defeated'
                            : attackerDefeated
                                ? 'traitor-defeated'
                                : 'wound',
                    attackerRoll,
                    defenderRoll,
                    damageToAttacker: damageToAttacker || undefined,
                    damageToDefender: damageToDefender || undefined,
                    damageKind: attackDamageKind,
                    weaponCardId: weaponEffect?.card.id,
                    weaponName: weaponEffect?.card.name,
                    weaponAttackBonus: weaponEffect?.bonus || undefined,
                    weaponExtraDice: weaponEffect?.extraDice || undefined,
                    weaponSpeedCost: weaponEffect?.speedCost || undefined,
                    weaponAttackTrait: weaponEffect?.attackTrait,
                    attackRoll: feverish
                        ? undefined
                        : {
                            id: `${attacker.playerId}-dust-attack-${timestamp}`,
                            dice: dustAttackRoll.dice,
                            passiveBonus: dustAttackRoll.passiveBonus,
                            latestLabel: attackerRoll === defenderRoll
                                ? '平手无伤害'
                                : damageToDefender > 0
                                    ? `造成 ${damageToDefender} 点伤害`
                                    : `反受 ${damageToAttacker} 点伤害`,
                            attackerTraitsBeforeDamage,
                            defenderTraitsBeforeDamage,
                        },
                    deathPrevention,
                    logText: attackerRoll === defenderRoll
                        ? `${feverish ? '狂热病患' : attacker.displayName}${weaponEffect ? `使用${weaponEffect.card.name}` : ''}发起攻击，双方都没有受伤`
                        : defenderDefeated
                            ? `${feverish ? '狂热病患' : attacker.displayName}${weaponEffect ? `使用${weaponEffect.card.name}` : ''}击倒了${targetExplorer.displayName}${deathPreventionLog}`
                            : attackerDefeated
                                ? `${attacker.displayName}${weaponEffect ? `使用${weaponEffect.card.name}` : ''}攻击失败并被击倒${deathPreventionLog}`
                                : damageToDefender > 0
                                    ? `${feverish ? '狂热病患' : attacker.displayName}${weaponEffect ? `使用${weaponEffect.card.name}` : ''}造成 ${damageToDefender} 点 ${attackDamageLabel}${deathPreventionLog}`
                                    : `${attacker.displayName}${weaponEffect ? `使用${weaponEffect.card.name}` : ''}攻击失败，反受 ${damageToAttacker} 点 ${attackDamageLabel}${deathPreventionLog}`,
                },
                    timestamp,
                }];
            }
            if (!isTraitor && command.payload.target === 'traitor') {
                const traitor = findExplorerByPlayerId(core, core.scenarioRuntime.traitorPlayerId ?? '') ?? core.otherExplorers[0];
                const defenderTraitsBeforeDamage = traitor ? { ...traitor.traits } : undefined;
                const heroBonus = core.scenarioRuntime.knowledgeOfJackPlayerIds.includes(attacker.playerId) ? 2 : 0;
                const attackRoll = rollAttackWithDice(random, attacker, weaponEffect);
                const attackerRoll = attackRoll.total + heroBonus;
                const defenderRoll = traitor ? rollAttackDefense(random, traitor, weaponEffect) : 0;
                const damageToDefender = Math.max(0, attackerRoll - defenderRoll);
                const damageToAttacker = resolveFailedAttackDamage(defenderRoll, attackerRoll, weaponEffect);
                const attackerDeathPrevention = wouldExplorerDieFromAttackDamage(attacker, damageToAttacker, attackDamageKind)
                    ? rollDeathPrevention(random, attacker)
                    : null;
                const attackerDefeated = wouldExplorerDieFromAttackDamage(attacker, damageToAttacker, attackDamageKind)
                    && !attackerDeathPrevention?.prevented;
                const deathPrevention = attackerDeathPrevention
                    ? {
                        ...attackerDeathPrevention,
                        damageAmount: damageToAttacker,
                        damageKind: attackDamageKind,
                        traitsBeforeDamage: { ...attackerTraitsBeforeDamage },
                    }
                    : undefined;
                const deathPreventionLog = formatDeathPreventionLog(deathPrevention);
                return [{
                    type: 'HAUNT_ATTACK_RESOLVED',
                    payload: {
                    attackerPlayerId: attacker.playerId,
                    target: 'traitor',
                    defenderPlayerId: traitor?.playerId,
                    defeatedPlayerId: attackerDefeated ? attacker.playerId : undefined,
                    releasedJackSpiritRoomId: undefined,
                    outcome: attackerRoll === defenderRoll
                        ? 'no-damage'
                        : attackerDefeated
                            ? 'hero-defeated'
                            : 'wound',
                    attackerRoll,
                    defenderRoll,
                    damageToAttacker: damageToAttacker || undefined,
                    damageToDefender: damageToDefender || undefined,
                    damageKind: attackDamageKind,
                    weaponCardId: weaponEffect?.card.id,
                    weaponName: weaponEffect?.card.name,
                    weaponAttackBonus: weaponEffect?.bonus || undefined,
                    weaponExtraDice: weaponEffect?.extraDice || undefined,
                    weaponSpeedCost: weaponEffect?.speedCost || undefined,
                    weaponAttackTrait: weaponEffect?.attackTrait,
                    attackRoll: {
                        id: `${attacker.playerId}-${command.payload.target}-${timestamp}`,
                        dice: attackRoll.dice,
                        passiveBonus: attackRoll.passiveBonus + heroBonus,
                        latestLabel: attackerRoll === defenderRoll
                            ? '平手无伤害'
                            : damageToDefender > 0
                                ? `造成 ${damageToDefender} 点伤害`
                                : `反受 ${damageToAttacker} 点伤害`,
                        attackerTraitsBeforeDamage,
                        defenderTraitsBeforeDamage,
                    },
                    deathPrevention,
                    logText: attackerRoll === defenderRoll
                        ? `${attacker.displayName}${weaponEffect ? `使用${weaponEffect.card.name}` : ''}与叛徒正面对攻，双方都没有受伤`
                        : attackerDefeated
                            ? `${attacker.displayName}${weaponEffect ? `使用${weaponEffect.card.name}` : ''}在对攻中落败并被叛徒击倒${deathPreventionLog}`
                            : damageToDefender > 0
                                ? `${attacker.displayName}${weaponEffect ? `使用${weaponEffect.card.name}` : ''}在对攻中压制了叛徒，造成 ${damageToDefender} 点 ${attackDamageLabel}${deathPreventionLog}`
                                : `${attacker.displayName}${weaponEffect ? `使用${weaponEffect.card.name}` : ''}攻击叛徒失败，反受 ${damageToAttacker} 点 ${attackDamageLabel}${deathPreventionLog}`,
                },
                    timestamp,
                }];
            }
            if (isTraitor && command.payload.target === 'hero') {
                const heroTargets = getAllExplorers(core).filter((explorer) => (
                    explorer.playerId !== core.scenarioRuntime.traitorPlayerId
                    && !core.scenarioRuntime.deadExplorerPlayerIds.includes(explorer.playerId)
                    && isAttackTargetInWeaponRange(core, attackerRoomId, explorer.roomId, weaponEffect)
                ));
                const targetHero = heroTargets.find((explorer) => explorer.playerId === command.payload.targetPlayerId);
                if (!targetHero) {
                    return [];
                }
                const defenderTraitsBeforeDamage = targetHero ? { ...targetHero.traits } : undefined;
                const attackRoll = jackSpirit
                    ? (() => {
                        const dice = rollBetrayalDicePips(random, jackSpirit.might);
                        return {
                            total: dice.reduce((sum, pip) => sum + pip, 0),
                            dice,
                            passiveBonus: 0,
                        };
                    })()
                    : rollAttackWithDice(random, attacker, weaponEffect);
                const attackerRoll = attackRoll.total;
                const defenderBonus = jackSpirit && targetHero && core.scenarioRuntime.knowledgeOfJackPlayerIds.includes(targetHero.playerId)
                    ? 2
                    : 0;
                const defenderRoll = targetHero ? rollAttackDefense(random, targetHero, weaponEffect) + defenderBonus : 0;
                const damageToDefender = Math.max(0, attackerRoll - defenderRoll);
                const damageToAttacker = jackSpirit ? 0 : resolveFailedAttackDamage(defenderRoll, attackerRoll, weaponEffect);
                const traitorDeathPrevention = !jackSpirit && wouldExplorerDieFromAttackDamage(attacker, damageToAttacker, attackDamageKind)
                    ? rollDeathPrevention(random, attacker)
                    : null;
                const traitorDefeated = !jackSpirit
                    && wouldExplorerDieFromAttackDamage(attacker, damageToAttacker, attackDamageKind)
                    && !traitorDeathPrevention?.prevented;
                const releasedJackSpiritRoomId = resolveJackSpiritSpawnRoomId(core, attacker.roomId);
                const deathPrevention = traitorDeathPrevention
                    ? {
                        ...traitorDeathPrevention,
                        damageAmount: damageToAttacker,
                        damageKind: attackDamageKind,
                        traitsBeforeDamage: { ...attackerTraitsBeforeDamage },
                        releasedJackSpiritRoomId,
                    }
                    : undefined;
                const deathPreventionLog = formatDeathPreventionLog(deathPrevention);
                return [{
                    type: 'HAUNT_ATTACK_RESOLVED',
                    payload: {
                    attackerPlayerId: attacker.playerId,
                    target: 'hero',
                    defenderPlayerId: targetHero?.playerId,
                    defeatedPlayerId: traitorDefeated ? attacker.playerId : undefined,
                    releasedJackSpiritRoomId: traitorDefeated ? releasedJackSpiritRoomId : undefined,
                    outcome: attackerRoll === defenderRoll
                        ? 'no-damage'
                        : traitorDefeated
                            ? 'traitor-defeated'
                            : 'wound',
                    attackerRoll,
                    defenderRoll,
                    damageToAttacker: damageToAttacker || undefined,
                    damageToDefender: damageToDefender || undefined,
                    damageKind: attackDamageKind,
                    weaponCardId: weaponEffect?.card.id,
                    weaponName: weaponEffect?.card.name,
                    weaponAttackBonus: weaponEffect?.bonus || undefined,
                    weaponExtraDice: weaponEffect?.extraDice || undefined,
                    weaponSpeedCost: weaponEffect?.speedCost || undefined,
                    weaponAttackTrait: weaponEffect?.attackTrait,
                    attackRoll: {
                        id: `${jackSpirit ? jackSpirit.id : attacker.playerId}-${command.payload.target}-${timestamp}`,
                        dice: attackRoll.dice,
                        passiveBonus: attackRoll.passiveBonus,
                        latestLabel: attackerRoll === defenderRoll
                            ? '平手无伤害'
                            : damageToDefender > 0
                                ? `造成 ${damageToDefender} 点伤害`
                                : `反受 ${damageToAttacker} 点伤害`,
                        attackerTraitsBeforeDamage: jackSpirit
                            ? {
                                might: jackSpirit.might,
                                speed: jackSpirit.speed ?? 3,
                                knowledge: jackSpirit.knowledge ?? 3,
                                sanity: jackSpirit.sanity ?? 3,
                            }
                            : attackerTraitsBeforeDamage,
                        defenderTraitsBeforeDamage,
                    },
                    deathPrevention,
                    logText: attackerRoll === defenderRoll
                        ? `${jackSpirit ? '杰克之灵' : `${attacker.displayName}${weaponEffect ? `使用${weaponEffect.card.name}` : ''}`}扑向英雄，但双方对攻后都没有受伤`
                        : traitorDefeated
                            ? `${attacker.displayName}${weaponEffect ? `使用${weaponEffect.card.name}` : ''}攻击失手，反而在对攻中被英雄击倒${deathPreventionLog}`
                            : damageToDefender > 0
                                ? `${jackSpirit ? '杰克之灵' : `${attacker.displayName}${weaponEffect ? `使用${weaponEffect.card.name}` : ''}`}在对攻中压制了英雄，造成 ${damageToDefender} 点 ${attackDamageLabel}${deathPreventionLog}`
                                : `${attacker.displayName}${weaponEffect ? `使用${weaponEffect.card.name}` : ''}发起攻击失败，反受 ${damageToAttacker} 点 ${attackDamageLabel}${deathPreventionLog}`,
                },
                    timestamp,
                }];
            }
            const heroBonus = core.scenarioRuntime.knowledgeOfJackPlayerIds.includes(attacker.playerId) ? 2 : 0;
            const attackRoll = rollAttackWithDice(random, attacker, weaponEffect);
            const attackerRoll = attackRoll.total + heroBonus;
            const jackSpiritDefense = rollTrait(random, 5);
            return [{
                    type: 'HAUNT_ATTACK_RESOLVED',
                    payload: {
                attackerPlayerId: attacker.playerId,
                target: 'jack-spirit',
                outcome: attackerRoll > jackSpiritDefense ? 'jack-damaged' : 'wound',
                attackerRoll,
                defenderRoll: jackSpiritDefense,
                weaponCardId: weaponEffect?.card.id,
                weaponName: weaponEffect?.card.name,
                weaponAttackBonus: weaponEffect?.bonus || undefined,
                weaponExtraDice: weaponEffect?.extraDice || undefined,
                weaponSpeedCost: weaponEffect?.speedCost || undefined,
                weaponAttackTrait: weaponEffect?.attackTrait,
                attackRoll: {
                    id: `${attacker.playerId}-${command.payload.target}-${timestamp}`,
                    dice: attackRoll.dice,
                    passiveBonus: attackRoll.passiveBonus + heroBonus,
                    latestLabel: attackerRoll > jackSpiritDefense ? '压制杰克之灵' : '未压制杰克之灵',
                    attackerTraitsBeforeDamage,
                },
                logText: attackerRoll > jackSpiritDefense
                    ? `${attacker.displayName}${weaponEffect ? `使用${weaponEffect.card.name}` : ''}压制住了杰克之灵`
                    : `${attacker.displayName}${weaponEffect ? `使用${weaponEffect.card.name}` : ''}尝试攻击杰克之灵，但没能造成有效压制`,
            },
                    timestamp,
                }];
}
