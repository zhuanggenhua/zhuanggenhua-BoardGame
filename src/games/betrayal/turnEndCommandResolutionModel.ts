import type { RandomFn } from '../../engine/types';
import { cloneTurnEndedPayload } from './cardResolutionStateModel';
import { replaceExplorers } from './coreStateModel';
import { createPendingDamageAllocation } from './damageResolutionModel';
import { canReviveTraitorFromJackSpiritAtMonsterTurnStart } from './deathStateReadModel';
import { resolveDustEndTurn } from './dustHauntRules';
import {
    findExplorerByPlayerId,
    getExplorersInTurnOrder,
    resolveExplorerRoom,
} from './explorerReadModel';
import type {
    BetrayalCore,
    BetrayalTurnEndedPayload,
} from './game';
import type { BetrayalEvent } from './events';
import {
    isHelpingHandsHaunt,
    isMagicCameraHaunt,
    resolveHelpingHandsControllerPlayerId,
} from './hauntScenarioReadModel';
import { resolveMoveTargetRooms } from './movementReadModel';
import { resolveBetrayalControlledMonsterMovementRoll } from './monsterActionReadModel';
import { createBetrayalHelpingHandsMonsterTurnStartedEvent } from './monsterActionResolutionModel';
import {
    resolveDeathsDoorTraitGainChoices,
    resolveToothNecklaceCard,
} from './possessionActionReadModel';
import {
    formatEndTurnRoomEffectLog,
    resolveEndTurnRoomEffect,
} from './roomEndTurnEffectModel';
import {
    formatRoomTargetList,
    isStraightLineVisible,
} from './roomMapModel';
import { rotateToNextLivingPlayer } from './turnOrderReadModel';

type TurnEndedEvent = Extract<BetrayalEvent, { type: 'TURN_ENDED' }>;
type ToothNecklaceChoiceStartedEvent = Extract<BetrayalEvent, { type: 'TOOTH_NECKLACE_CHOICE_STARTED' }>;

function resolveMagicCameraEndTurn(core: BetrayalCore): string[] {
    const magicCamera = core.scenarioRuntime.magicCamera;
    if (!isMagicCameraHaunt(core) || !magicCamera) {
        return [];
    }
    const actor = core.currentExplorer;
    if (
        actor.playerId === core.scenarioRuntime.traitorPlayerId
        || core.scenarioRuntime.deadExplorerPlayerIds.includes(actor.playerId)
        || !magicCamera.heroEssencePlayerIds.includes(actor.playerId)
    ) {
        return [];
    }
    const actorRoom = resolveExplorerRoom(core, actor);
    if (!actorRoom) {
        return [];
    }
    const visiblePhotographer = core.monsters.some((monster) => (
        magicCamera.phantomPhotographerIds.includes(monster.id)
        && !magicCamera.killedPhantomPhotographerIds.includes(monster.id)
        && isStraightLineVisible(
            core.rooms.find((room) => room.id === monster.roomId) ?? actorRoom,
            actorRoom,
            core.rooms,
        )
    ));
    return visiblePhotographer ? [actor.playerId] : [];
}

export function resolveBetrayalEndTurnCommandEvents(
    core: BetrayalCore,
    random: RandomFn,
    timestamp: number,
): Array<TurnEndedEvent | ToothNecklaceChoiceStartedEvent> {
            const roomEndTurnEffect = resolveEndTurnRoomEffect(core, random);
            const dustEndTurn = resolveDustEndTurn(core, random);
            const magicCameraEndTurnCapturedEssencePlayerIds = resolveMagicCameraEndTurn(core);
            const extraTurnAfterCurrentTurn = core.pendingExtraTurnAfterCurrentTurn?.playerId === core.currentPlayer
                ? { ...core.pendingExtraTurnAfterCurrentTurn }
                : null;
            const nextPlayerId = extraTurnAfterCurrentTurn
                ? core.currentPlayer
                : core.phase === 'haunt'
                ? rotateToNextLivingPlayer(core, core.currentPlayer)
                : (() => {
                    const explorers = getExplorersInTurnOrder(core);
                    const currentIndex = explorers.findIndex((explorer) => explorer.playerId === core.currentPlayer);
                    return (explorers[(currentIndex + 1) % explorers.length] ?? explorers[0]!).playerId;
                })();
            const nextExplorer = findExplorerByPlayerId(core, nextPlayerId) ?? core.currentExplorer;
            const previewCore = replaceExplorers(core, getExplorersInTurnOrder(core), nextExplorer.playerId);
            const monsterMovementRoll = extraTurnAfterCurrentTurn
                ? null
                : canReviveTraitorFromJackSpiritAtMonsterTurnStart(previewCore, nextPlayerId)
                ? null
                : resolveBetrayalControlledMonsterMovementRoll(previewCore, nextPlayerId, random);
            const targets = resolveMoveTargetRooms(previewCore);
            const baseLogText = extraTurnAfterCurrentTurn
                ? `${extraTurnAfterCurrentTurn.sourceCardName}生效，${nextExplorer.displayName}再进行一轮行动`
                : targets.length > 0
                ? `轮到${nextExplorer.displayName}，可前往${formatRoomTargetList(targets)}`
                : `轮到${nextExplorer.displayName}`;
            const turnLogText = monsterMovementRoll
                ? `${baseLogText}；${monsterMovementRoll.monsterName}速度 ${monsterMovementRoll.speed} 投出 ${monsterMovementRoll.total}，本回合可移动 ${monsterMovementRoll.moveAllowance} 间`
                : baseLogText;
            const shouldDeferAdvanceUntilRollAcknowledged = Boolean(
                roomEndTurnEffect?.kind === 'speedCheckFallToBasement'
                && roomEndTurnEffect.speedRollDice?.length,
            );
            const helpingHandsMonsterTurnControllerPlayerId = (
                !extraTurnAfterCurrentTurn
                && (
                    isHelpingHandsHaunt(core)
                    && core.scenarioRuntime.helpingHands?.monsterTurnAfterPlayerId === core.currentPlayer
                    && !core.scenarioRuntime.helpingHands.activeMonsterTurn
                )
            )
                ? resolveHelpingHandsControllerPlayerId(core)
                : null;
            const pendingRoomDamageAllocationPreview = roomEndTurnEffect?.kind === 'physicalDamage1'
                && roomEndTurnEffect.physicalDamage !== undefined
                ? createPendingDamageAllocation({
                    id: `room-damage-${roomEndTurnEffect.playerId}-${timestamp}`,
                    explorer: core.currentExplorer,
                    sourceTitle: roomEndTurnEffect.roomName,
                    damageKind: 'physical',
                    amount: roomEndTurnEffect.physicalDamage ?? 0,
                    allowSkull: core.phase === 'haunt',
                    nextPlayerId,
                    monsterMovementRoll,
                    turnLogText,
                    helpingHandsMonsterTurnControllerPlayerId: helpingHandsMonsterTurnControllerPlayerId ?? undefined,
                    skipBloodFromStoneMonsterTurnStart: Boolean(extraTurnAfterCurrentTurn),
                })
                : null;
            const logText = roomEndTurnEffect
                ? shouldDeferAdvanceUntilRollAcknowledged || pendingRoomDamageAllocationPreview
                    ? formatEndTurnRoomEffectLog(roomEndTurnEffect, core.currentExplorer.displayName)
                    : `${formatEndTurnRoomEffectLog(roomEndTurnEffect, core.currentExplorer.displayName)}；${turnLogText}`
                : turnLogText;
            const dustLogText = dustEndTurn
                ? [
                    dustEndTurn.swaps.length > 0
                        ? `${core.currentExplorer.displayName}在回合结束时交换了 ${dustEndTurn.swaps.length} 次疾病标记`
                        : null,
                    dustEndTurn.damagePlayerId && dustEndTurn.damageAmount !== undefined
                        ? `${core.currentExplorer.displayName}本回合没有交换疾病标记，承受 ${dustEndTurn.damageAmount} 点通用伤害`
                        : null,
                ].filter(Boolean).join('；')
                : '';
            const magicCameraLogText = magicCameraEndTurnCapturedEssencePlayerIds.length > 0
                ? `${core.currentExplorer.displayName}在回合结束时处于幻影摄影师视线内，本质被夺走`
                : '';
            const hauntLogText = [dustLogText, magicCameraLogText].filter(Boolean).join('；');
            const helpingHandsLogText = (
                !extraTurnAfterCurrentTurn
                &&
                isHelpingHandsHaunt(core)
                && core.scenarioRuntime.helpingHands?.monsterTurnAfterPlayerId === core.currentPlayer
                && !helpingHandsMonsterTurnControllerPlayerId
            )
                ? '无人持有奇异护符，巨魔手怪物回合跳过'
                : '';
            const fullLogText = [
                hauntLogText,
                helpingHandsLogText,
                logText,
            ].filter(Boolean).join('；');
            const shouldStartHelpingHandsMonsterTurn = Boolean(
                helpingHandsMonsterTurnControllerPlayerId
                && !shouldDeferAdvanceUntilRollAcknowledged
                && !pendingRoomDamageAllocationPreview,
            );
            const deferredHelpingHandsMonsterTurnStart = shouldStartHelpingHandsMonsterTurn && helpingHandsMonsterTurnControllerPlayerId
                ? createBetrayalHelpingHandsMonsterTurnStartedEvent(
                    helpingHandsMonsterTurnControllerPlayerId,
                    random,
                    timestamp,
                ).payload
                : undefined;
            const turnEndedPayload: BetrayalTurnEndedPayload = {
                previousPlayerId: core.currentPlayer,
                nextPlayerId,
                logText: fullLogText,
                roomEndTurnEffect,
                monsterMovementRoll,
                helpingHandsMonsterTurnControllerPlayerId: helpingHandsMonsterTurnControllerPlayerId ?? undefined,
                deferAdvanceUntilRollAcknowledged: shouldDeferAdvanceUntilRollAcknowledged,
                turnLogText,
                dustEndTurn,
                magicCameraEndTurnCapturedEssencePlayerIds,
                deferredHelpingHandsMonsterTurnStart,
                extraTurnAfterCurrentTurn: extraTurnAfterCurrentTurn ?? undefined,
                skipBloodFromStoneMonsterTurnStart: Boolean(extraTurnAfterCurrentTurn),
            };
            const toothNecklaceCard = resolveToothNecklaceCard(core.currentExplorer);
            const toothNecklaceTraits = toothNecklaceCard
                ? resolveDeathsDoorTraitGainChoices(core.currentExplorer)
                : [];
            if (toothNecklaceCard && toothNecklaceTraits.length > 0) {
                return [{
                    type: 'TOOTH_NECKLACE_CHOICE_STARTED',
                    payload: {
                    playerId: core.currentPlayer,
                    cardId: toothNecklaceCard.id,
                    cardName: toothNecklaceCard.name,
                    allowedTraits: toothNecklaceTraits,
                    deferredTurnEnd: cloneTurnEndedPayload(turnEndedPayload),
                    logText: `${core.currentExplorer.displayName}可以使用${toothNecklaceCard.name}提升一项濒死属性`,
                },
                    timestamp,
                }];
            }
            return [{
                type: 'TURN_ENDED',
                payload: turnEndedPayload,
                timestamp,
            }];
}
