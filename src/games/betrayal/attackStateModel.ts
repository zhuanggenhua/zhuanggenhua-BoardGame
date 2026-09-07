import {
    appendActivity,
    cloneMonster,
    cloneScenarioRuntimeStatus,
    replaceExplorers,
    syncCurrentExplorerProjection,
} from './coreStateModel';
import {
    applyAttackDamage,
    chainPendingDamageAllocations,
    createPendingDamageAllocation,
    setExplorerTraitsToDeathsDoor,
} from './damageResolutionModel';
import {
    addFeverishMonsterForPlayer,
    markDeadExplorer,
    releaseJackSpiritForDeadTraitor,
} from './deathStateReadModel';
import {
    findExplorerByPlayerId,
    getAllExplorers,
} from './explorerReadModel';
import { MUMMY_GIRL_STEAL_CARD_ID } from './hauntAttackRewardReadModel';
import {
    isDustHaunt,
    isHelpingHandsHaunt,
    isMagicCameraHaunt,
    isMummyHaunt,
} from './hauntScenarioReadModel';
import {
    createBetrayalCrimsonJackTraitorVictoryResult,
    resolveDustTraitorVictoryResult,
    resolveHelpingHandsSoloVictoryResult,
    resolveMagicCameraHeroVictoryResult,
    resolveMagicCameraTraitorVictoryResult,
    resolveMummyTraitorVictoryResult,
} from './hauntVictoryModel';
import { applyBetrayalMonsterDamageOutcome } from './monsterReadModel';
import {
    createMummyEndgameResult,
    resolveMummyForcedDamageTraits,
} from './mummyHauntRules';
import {
    cloneInventoryCard,
    buryPossessionCardToBottom,
} from './possessionDeckModel';
import { resolveRecommendedAction } from './recommendedActionReadModel';
import {
    canDeferOrdinaryAttackDamageToDefender,
    resolveDefenseExtraDiceWhenAttacked,
} from './attackRules';
import { rotateToNextLivingPlayer } from './turnOrderReadModel';
import { applyTraitLoss } from './traitTrackModel';
import type {
    BetrayalCore,
    BetrayalEndgameResult,
    BetrayalExplorerSummary,
    BetrayalPendingDamageAllocationState,
} from './game';
import type { BetrayalEvent } from './events';

type DynamiteAttackResolvedEvent = Extract<BetrayalEvent, { type: 'DYNAMITE_ATTACK_RESOLVED' }>;
type HauntAttackResolvedEvent = Extract<BetrayalEvent, { type: 'HAUNT_ATTACK_RESOLVED' }>;
type HelpingHandsAttackRewardResolvedEvent = Extract<BetrayalEvent, { type: 'HELPING_HANDS_ATTACK_REWARD_RESOLVED' }>;
type MummyAttackRewardResolvedEvent = Extract<BetrayalEvent, { type: 'MUMMY_ATTACK_REWARD_RESOLVED' }>;
type HelpingHandsTrollHandAttackResolvedEvent = Extract<BetrayalEvent, { type: 'HELPING_HANDS_TROLL_HAND_ATTACK_RESOLVED' }>;

type AttackDeathPreventionPayload = {
    playerId: string;
    cardId: string;
    dice: number[];
    minTotal: number;
    damageAmount: number;
    damageKind: 'physical' | 'mental';
    traitsBeforeDamage: BetrayalExplorerSummary['traits'];
    releasedJackSpiritRoomId?: string;
    prevented: boolean;
};

export interface BetrayalAttackStateResolution {
    core: BetrayalCore;
    scenarioCompletedResult?: BetrayalEndgameResult;
}

function applyAttackDeathPrevention(core: BetrayalCore, deathPrevention: AttackDeathPreventionPayload | undefined, timestamp: number): void {
    if (deathPrevention?.prevented) {
        const protectedExplorer = findExplorerByPlayerId(core, deathPrevention.playerId);
        if (protectedExplorer) {
            setExplorerTraitsToDeathsDoor(protectedExplorer);
        }
    }
    if (!deathPrevention?.dice.length) {
        return;
    }
    core.recentRoll = {
        id: `${deathPrevention.playerId}-death-prevention-${timestamp}`,
        kind: 'deathPrevention',
        playerId: deathPrevention.playerId,
        sourceTitle: deathPrevention.cardId === 'skull' ? '头骨死亡保护' : '死亡保护',
        dice: [...deathPrevention.dice],
        passiveBonus: 0,
        latestLabel: deathPrevention.prevented ? '阻止死亡' : '正常死亡',
        deathPrevention: {
            cardId: deathPrevention.cardId,
            minTotal: deathPrevention.minTotal,
            damageKind: deathPrevention.damageKind,
            damageAmount: deathPrevention.damageAmount,
            traitsBeforeDamage: { ...deathPrevention.traitsBeforeDamage },
            scenarioRuntimeBeforeDefeat: cloneScenarioRuntimeStatus(core.scenarioRuntime),
            monstersBeforeDefeat: core.monsters.map(cloneMonster),
            releasedJackSpiritRoomId: deathPrevention.releasedJackSpiritRoomId,
        },
        consumedRabbitFootCardIds: [],
    };
}

function returnPendingDamageAllocation(
    core: BetrayalCore,
    allocation: BetrayalPendingDamageAllocationState,
    logText: string,
): BetrayalCore {
    const syncedCore = syncCurrentExplorerProjection(core);
    return {
        ...syncedCore,
        pendingDamageAllocation: allocation,
        activePlayerId: allocation.playerId,
        recommendedAction: 'endTurn',
        activityLog: appendActivity(syncedCore, logText, 'warning'),
    };
}

function rotateToNextLivingExplorerAfterAttack(
    core: BetrayalCore,
    logText: string,
    tone: 'neutral' | 'accent' | 'warning',
): BetrayalCore {
    const nextPlayerId = rotateToNextLivingPlayer(core, core.currentPlayer);
    const nextCore = replaceExplorers(core, getAllExplorers(core), nextPlayerId);
    return {
        ...nextCore,
        currentPlayer: nextPlayerId,
        recommendedAction: 'move',
        activityLog: appendActivity(nextCore, logText, tone),
    };
}

function returnCurrentAttackExplorerIfStillActive(
    core: BetrayalCore,
    attackerPlayerId: string,
    logText: string,
    tone: 'neutral' | 'accent' | 'warning',
): BetrayalCore | null {
    if (
        attackerPlayerId !== core.currentPlayer
        || core.scenarioRuntime.deadExplorerPlayerIds.includes(attackerPlayerId)
    ) {
        return null;
    }
    const syncedCore = syncCurrentExplorerProjection(core);
    return {
        ...syncedCore,
        recommendedAction: resolveRecommendedAction(syncedCore),
        activityLog: appendActivity(syncedCore, logText, tone),
    };
}

export function applyBetrayalDynamiteAttackResolvedState(
    core: BetrayalCore,
    event: DynamiteAttackResolvedEvent,
): BetrayalCore {
    core.usedCardIdsThisTurn = Array.from(new Set([
        ...core.usedCardIdsThisTurn,
        'haunt-attack',
        event.payload.cardId,
    ]));
    const attacker = findExplorerByPlayerId(core, event.payload.attackerPlayerId);
    if (attacker) {
        attacker.inventory = attacker.inventory.filter((card) => card.id !== event.payload.cardId);
    }
    buryPossessionCardToBottom(core, 'item', event.payload.cardId);
    for (const monsterRoll of event.payload.monsterRolls) {
        if (monsterRoll.monsterDamageOutcome) {
            applyBetrayalMonsterDamageOutcome(core, monsterRoll.monsterDamageOutcome);
        }
    }
    const damageAllocations = event.payload.explorerRolls
        .filter((roll) => !roll.passed)
        .map((roll) => {
            const explorer = findExplorerByPlayerId(core, roll.playerId);
            return explorer
                ? createPendingDamageAllocation({
                    id: `dynamite-damage-${roll.playerId}-${event.timestamp}`,
                    explorer,
                    sourceTitle: event.payload.cardName,
                    damageKind: 'physical',
                    amount: 4,
                    allowSkull: true,
                })
                : null;
        })
        .filter((allocation): allocation is BetrayalPendingDamageAllocationState => Boolean(allocation));
    const pendingDynamiteDamageAllocation = chainPendingDamageAllocations(damageAllocations);
    const syncedCore = syncCurrentExplorerProjection(core);
    if (pendingDynamiteDamageAllocation) {
        return {
            ...syncedCore,
            pendingDamageAllocation: pendingDynamiteDamageAllocation,
            activePlayerId: pendingDynamiteDamageAllocation.playerId,
            recommendedAction: 'endTurn',
            activityLog: appendActivity(syncedCore, event.payload.logText, 'warning'),
        };
    }
    return {
        ...syncedCore,
        recommendedAction: resolveRecommendedAction(syncedCore),
        activityLog: appendActivity(
            syncedCore,
            event.payload.logText,
            event.payload.monsterRolls.some((roll) => !roll.passed) ? 'warning' : 'accent',
        ),
    };
}

export function applyBetrayalHauntAttackResolvedState(
    core: BetrayalCore,
    event: HauntAttackResolvedEvent,
): BetrayalAttackStateResolution {
    core.usedCardIdsThisTurn = Array.from(new Set([
        ...core.usedCardIdsThisTurn,
        'haunt-attack',
        ...(event.payload.weaponCardId ? [event.payload.weaponCardId] : []),
    ]));
    const attacker = findExplorerByPlayerId(core, event.payload.attackerPlayerId);
    const defender = event.payload.defenderPlayerId
        ? findExplorerByPlayerId(core, event.payload.defenderPlayerId)
        : null;
    const canDeferOrdinaryDefenderAttackDamage = canDeferOrdinaryAttackDamageToDefender(
        core,
        event.payload.target,
    );
    let pendingAttackDamageAllocation: BetrayalPendingDamageAllocationState | null = null;
    if (attacker && event.payload.damageToAttacker) {
        applyAttackDamage(attacker, event.payload.damageToAttacker, event.payload.damageKind ?? 'physical');
    }
    if (attacker && event.payload.weaponSpeedCost) {
        applyTraitLoss(attacker, ['speed'], event.payload.weaponSpeedCost);
    }
    if (defender && event.payload.damageToDefender) {
        if (canDeferOrdinaryDefenderAttackDamage) {
            pendingAttackDamageAllocation = createPendingDamageAllocation({
                id: `haunt-attack-damage-${defender.playerId}-${event.timestamp}`,
                explorer: defender,
                sourceTitle: '攻击',
                damageKind: event.payload.damageKind ?? 'physical',
                amount: event.payload.damageToDefender,
                allowSkull: true,
            });
        }
        if (!pendingAttackDamageAllocation) {
            applyAttackDamage(defender, event.payload.damageToDefender, event.payload.damageKind ?? 'physical');
        }
    }
    applyAttackDeathPrevention(core, event.payload.deathPrevention, event.timestamp);
    if (
        event.payload.attackRoll
        && event.payload.attackRoll.dice.length > 0
    ) {
        core.recentRoll = {
            id: event.payload.attackRoll.id,
            kind: 'attackRoll',
            playerId: event.payload.attackerPlayerId,
            sourceTitle: '攻击投骰',
            dice: [...event.payload.attackRoll.dice],
            passiveBonus: event.payload.attackRoll.passiveBonus,
            latestLabel: event.payload.attackRoll.latestLabel,
            attack: {
                target: event.payload.target,
                defenderPlayerId: event.payload.defenderPlayerId,
                damageKind: event.payload.damageKind ?? 'physical',
                previousDamageToAttacker: event.payload.damageToAttacker ?? 0,
                previousDamageToDefender: event.payload.damageToDefender ?? 0,
                defenderRoll: event.payload.defenderRoll ?? 0,
                defenderDefenseExtraDice: defender
                    ? resolveDefenseExtraDiceWhenAttacked(defender)
                    : 0,
                attackerTraitsBeforeDamage: { ...event.payload.attackRoll.attackerTraitsBeforeDamage },
                defenderTraitsBeforeDamage: event.payload.attackRoll.defenderTraitsBeforeDamage
                    ? { ...event.payload.attackRoll.defenderTraitsBeforeDamage }
                    : undefined,
                weaponCardId: event.payload.weaponCardId,
                weaponName: event.payload.weaponName,
                weaponAttackBonus: event.payload.weaponAttackBonus,
                weaponExtraDice: event.payload.weaponExtraDice,
                weaponSpeedCost: event.payload.weaponSpeedCost,
                weaponAttackTrait: event.payload.weaponAttackTrait,
            },
            consumedRabbitFootCardIds: [],
        };
    }
    if (event.payload.deathPrevention?.dice.length) {
        applyAttackDeathPrevention(core, event.payload.deathPrevention, event.timestamp);
    }
    if (pendingAttackDamageAllocation) {
        return {
            core: returnPendingDamageAllocation(core, pendingAttackDamageAllocation, event.payload.logText),
        };
    }
    if (isMagicCameraHaunt(core)) {
        const magicCamera = core.scenarioRuntime.magicCamera;
        if (magicCamera && event.payload.monsterDamageOutcome) {
            applyBetrayalMonsterDamageOutcome(core, event.payload.monsterDamageOutcome);
        } else if (magicCamera && event.payload.defeatedMonsterId) {
            magicCamera.killedPhantomPhotographerIds = Array.from(new Set([
                ...magicCamera.killedPhantomPhotographerIds,
                event.payload.defeatedMonsterId,
            ]));
            magicCamera.stunnedPhantomPhotographerIds = magicCamera.stunnedPhantomPhotographerIds
                .filter((id) => id !== event.payload.defeatedMonsterId);
            core.monsters = core.monsters.filter((monster) => monster.id !== event.payload.defeatedMonsterId);
        } else if (magicCamera && event.payload.outcome === 'phantom-stunned' && event.payload.defenderMonsterId) {
            magicCamera.stunnedPhantomPhotographerIds = Array.from(new Set([
                ...magicCamera.stunnedPhantomPhotographerIds,
                event.payload.defenderMonsterId,
            ]));
        }
        if (event.payload.defeatedPlayerId) {
            markDeadExplorer(core, event.payload.defeatedPlayerId);
        }
        const scenarioCompletedResult = resolveMagicCameraHeroVictoryResult(core)
            ?? resolveMagicCameraTraitorVictoryResult(core);
        if (scenarioCompletedResult) {
            return { core, scenarioCompletedResult };
        }
        return {
            core: rotateToNextLivingExplorerAfterAttack(
                core,
                event.payload.logText,
                event.payload.outcome === 'no-damage' ? 'neutral' : 'accent',
            ),
        };
    }
    if (isDustHaunt(core)) {
        if (event.payload.defeatedPlayerId) {
            markDeadExplorer(core, event.payload.defeatedPlayerId);
            if (core.scenarioRuntime.dust?.permanentTraitorPlayerIds.includes(event.payload.defeatedPlayerId)) {
                addFeverishMonsterForPlayer(core, event.payload.defeatedPlayerId);
            }
        }
        const scenarioCompletedResult = resolveDustTraitorVictoryResult(core);
        if (scenarioCompletedResult) {
            return { core, scenarioCompletedResult };
        }
        return {
            core: rotateToNextLivingExplorerAfterAttack(
                core,
                event.payload.logText,
                event.payload.defeatedPlayerId ? 'warning' : 'accent',
            ),
        };
    }
    if (isHelpingHandsHaunt(core)) {
        const helpingHands = core.scenarioRuntime.helpingHands;
        if (helpingHands && event.payload.helpingHandsAttackRewardChoice) {
            helpingHands.pendingAttackReward = {
                ...event.payload.helpingHandsAttackRewardChoice,
                defenderTraitsBeforeDamage: { ...event.payload.helpingHandsAttackRewardChoice.defenderTraitsBeforeDamage },
            };
        }
        if (event.payload.defeatedPlayerId) {
            markDeadExplorer(core, event.payload.defeatedPlayerId);
        }
        const scenarioCompletedResult = resolveHelpingHandsSoloVictoryResult(core);
        if (scenarioCompletedResult) {
            return { core, scenarioCompletedResult };
        }
        const tone = event.payload.defeatedPlayerId
            ? 'warning'
            : event.payload.outcome === 'no-damage'
                ? 'neutral'
                : 'accent';
        return {
            core: returnCurrentAttackExplorerIfStillActive(
                core,
                event.payload.attackerPlayerId,
                event.payload.logText,
                tone,
            ) ?? rotateToNextLivingExplorerAfterAttack(core, event.payload.logText, tone),
        };
    }
    if (
        event.payload.outcome === 'traitor-defeated'
        && event.payload.defeatedPlayerId
        && !isMummyHaunt(core)
    ) {
        releaseJackSpiritForDeadTraitor(
            core,
            event.payload.defeatedPlayerId,
            core.activeRoomId,
            event.payload.releasedJackSpiritRoomId,
        );
    }
    if (event.payload.outcome === 'hero-defeated' && event.payload.defeatedPlayerId) {
        core.scenarioRuntime.deadExplorerPlayerIds = Array.from(new Set([
            ...core.scenarioRuntime.deadExplorerPlayerIds,
            event.payload.defeatedPlayerId,
        ]));
        const livingHeroes = getAllExplorers(core).filter((explorer) => (
            explorer.playerId !== core.scenarioRuntime.traitorPlayerId
            && !core.scenarioRuntime.deadExplorerPlayerIds.includes(explorer.playerId)
        ));
        if (livingHeroes.length === 0) {
            return {
                core,
                scenarioCompletedResult: isMummyHaunt(core)
                    ? createMummyEndgameResult(core, 'traitor')
                    : createBetrayalCrimsonJackTraitorVictoryResult(core),
            };
        }
    }
    const tone = event.payload.outcome === 'hero-defeated' ? 'warning' : 'accent';
    return {
        core: returnCurrentAttackExplorerIfStillActive(
            core,
            event.payload.attackerPlayerId,
            event.payload.logText,
            tone,
        ) ?? rotateToNextLivingExplorerAfterAttack(core, event.payload.logText, tone),
    };
}

export function applyBetrayalHelpingHandsAttackRewardResolvedState(
    core: BetrayalCore,
    event: HelpingHandsAttackRewardResolvedEvent,
): BetrayalAttackStateResolution {
    const helpingHands = core.scenarioRuntime.helpingHands;
    if (!helpingHands) {
        return { core };
    }
    const attacker = findExplorerByPlayerId(core, event.payload.attackerPlayerId);
    const defender = findExplorerByPlayerId(core, event.payload.defenderPlayerId);
    helpingHands.pendingAttackReward = undefined;
    if (event.payload.choice === 'steal' && attacker && defender && event.payload.stolenCardId) {
        const stolenCard = defender.inventory.find((card) => card.id === event.payload.stolenCardId);
        if (stolenCard) {
            defender.inventory = defender.inventory.filter((card) => card.id !== stolenCard.id);
            attacker.inventory = [...attacker.inventory, cloneInventoryCard(stolenCard)];
            core.receivedCardIdsThisTurnByPlayerId = {
                ...core.receivedCardIdsThisTurnByPlayerId,
                [attacker.playerId]: Array.from(new Set([
                    ...(core.receivedCardIdsThisTurnByPlayerId[attacker.playerId] ?? []),
                    stolenCard.id,
                ])),
            };
        }
    }
    let pendingHelpingHandsDamageAllocation: BetrayalPendingDamageAllocationState | null = null;
    if (defender && event.payload.damageToDefender && event.payload.damageKind) {
        if (!event.payload.defeatedPlayerId && !event.payload.deathPrevention) {
            pendingHelpingHandsDamageAllocation = createPendingDamageAllocation({
                id: `helping-hands-attack-damage-${event.payload.defenderPlayerId}-${event.timestamp}`,
                explorer: defender,
                sourceTitle: '援手攻击',
                damageKind: event.payload.damageKind,
                amount: event.payload.damageToDefender,
                allowSkull: true,
            });
        }
        if (!pendingHelpingHandsDamageAllocation) {
            applyAttackDamage(defender, event.payload.damageToDefender, event.payload.damageKind);
        }
    }
    applyAttackDeathPrevention(core, event.payload.deathPrevention, event.timestamp);
    if (event.payload.defeatedPlayerId) {
        markDeadExplorer(core, event.payload.defeatedPlayerId);
    }
    if (pendingHelpingHandsDamageAllocation) {
        return {
            core: returnPendingDamageAllocation(core, pendingHelpingHandsDamageAllocation, event.payload.logText),
        };
    }
    const scenarioCompletedResult = resolveHelpingHandsSoloVictoryResult(core);
    if (scenarioCompletedResult) {
        return { core, scenarioCompletedResult };
    }
    const syncedCore = syncCurrentExplorerProjection(core);
    return {
        core: {
            ...syncedCore,
            recommendedAction: resolveRecommendedAction(syncedCore),
            activityLog: appendActivity(syncedCore, event.payload.logText, event.payload.defeatedPlayerId ? 'warning' : 'accent'),
        },
    };
}

export function applyBetrayalMummyAttackRewardResolvedState(
    core: BetrayalCore,
    event: MummyAttackRewardResolvedEvent,
): BetrayalAttackStateResolution {
    const mummy = core.scenarioRuntime.mummy;
    if (!mummy) {
        return { core };
    }
    const defender = findExplorerByPlayerId(core, event.payload.defenderPlayerId);
    mummy.pendingAttackReward = undefined;
    if (event.payload.choice === 'steal' && defender && event.payload.stolenCardId) {
        if (
            event.payload.stolenCardId === MUMMY_GIRL_STEAL_CARD_ID
            && mummy.girlHolderPlayerId === defender.playerId
        ) {
            mummy.girlRoomId = null;
            mummy.girlHolderPlayerId = null;
            mummy.girlHeldByMummy = true;
        } else {
            const stolenCard = defender.inventory.find((card) => card.id === event.payload.stolenCardId);
            if (stolenCard) {
                defender.inventory = defender.inventory.filter((card) => card.id !== stolenCard.id);
                mummy.mummyCarriedCards = [
                    ...mummy.mummyCarriedCards.filter((card) => card.id !== stolenCard.id),
                    cloneInventoryCard(stolenCard),
                ];
                if (stolenCard.kind === 'omen') {
                    mummy.mummyCarriedOmenIds = Array.from(new Set([
                        ...mummy.mummyCarriedOmenIds,
                        stolenCard.id,
                    ]));
                }
            }
        }
    }
    const pendingMummyDamageAllocation = defender && event.payload.choice === 'damage' && event.payload.damageToHero
        ? createPendingDamageAllocation({
            id: `mummy-attack-damage-${event.payload.defenderPlayerId}-${event.timestamp}`,
            explorer: defender,
            sourceTitle: '木乃伊攻击',
            damageKind: 'physical',
            amount: event.payload.damageToHero,
            allowSkull: true,
            forcedTraitSequence: resolveMummyForcedDamageTraits(
                defender,
                event.payload.damageToHero,
                { allowSkull: true },
            ),
        })
        : null;
    const syncedCore = syncCurrentExplorerProjection(core);
    if (pendingMummyDamageAllocation) {
        return {
            core: {
                ...syncedCore,
                pendingDamageAllocation: pendingMummyDamageAllocation,
                activePlayerId: pendingMummyDamageAllocation.playerId,
                recommendedAction: 'endTurn',
                activityLog: appendActivity(syncedCore, event.payload.logText, 'warning'),
            },
        };
    }
    const loggedCore = {
        ...syncedCore,
        activePlayerId: null,
        recommendedAction: resolveRecommendedAction(syncedCore),
        activityLog: appendActivity(
            syncedCore,
            event.payload.logText,
            event.payload.choice === 'damage' ? 'warning' : 'accent',
        ),
    };
    const scenarioCompletedResult = resolveMummyTraitorVictoryResult(loggedCore);
    return scenarioCompletedResult
        ? { core: loggedCore, scenarioCompletedResult }
        : { core: loggedCore };
}

export function applyBetrayalHelpingHandsTrollHandAttackResolvedState(
    core: BetrayalCore,
    event: HelpingHandsTrollHandAttackResolvedEvent,
): BetrayalAttackStateResolution {
    const helpingHands = core.scenarioRuntime.helpingHands;
    if (!helpingHands) {
        return { core };
    }
    const target = findExplorerByPlayerId(core, event.payload.targetPlayerId);
    helpingHands.trollHandAttackUsedIdsThisTurn = Array.from(new Set([
        ...helpingHands.trollHandAttackUsedIdsThisTurn,
        ...event.payload.trollHandIds,
    ]));
    const pendingTrollHandDamageAllocation = target && event.payload.damageToDefender
        ? createPendingDamageAllocation({
            id: `helping-hands-troll-hand-damage-${event.payload.targetPlayerId}-${event.timestamp}`,
            explorer: target,
            sourceTitle: '巨魔手攻击',
            damageKind: 'physical',
            amount: event.payload.damageToDefender,
            allowSkull: true,
        })
        : null;
    if (pendingTrollHandDamageAllocation) {
        return {
            core: returnPendingDamageAllocation(core, pendingTrollHandDamageAllocation, event.payload.logText),
        };
    }
    applyAttackDeathPrevention(core, event.payload.deathPrevention, event.timestamp);
    if (event.payload.defeatedPlayerId) {
        markDeadExplorer(core, event.payload.defeatedPlayerId);
    }
    const scenarioCompletedResult = resolveHelpingHandsSoloVictoryResult(core);
    if (scenarioCompletedResult) {
        return { core, scenarioCompletedResult };
    }
    const syncedCore = syncCurrentExplorerProjection(core);
    return {
        core: {
            ...syncedCore,
            recommendedAction: helpingHands.activeMonsterTurn
                ? 'endTurn'
                : resolveRecommendedAction(syncedCore),
            activityLog: appendActivity(syncedCore, event.payload.logText, event.payload.defeatedPlayerId ? 'warning' : 'accent'),
        },
    };
}
