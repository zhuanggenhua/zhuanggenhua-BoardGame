import {
    appendActivity,
    replaceExplorers,
    syncCurrentExplorerProjection,
} from './coreStateModel';
import {
    applyPhysicalDamage,
    createPendingDamageAllocation,
} from './damageResolutionModel';
import {
    applyBetrayalJackSpiritRevivalAtMonsterTurnStart,
    buryDustDeadTraitorPossessions,
} from './deathStateReadModel';
import { applyDustSicknessSwap } from './dustHauntRules';
import {
    findExplorerByPlayerId,
    getAllExplorers,
    resolveTurnStartSpeed,
} from './explorerReadModel';
import {
    cloneDustRuntimeState,
    cloneHelpingHandsRuntimeState,
    cloneMagicCameraRuntimeState,
} from './hauntRuntimeSetupModel';
import { isBetrayalPlayerControllingMonster } from './hauntScenarioReadModel';
import { resolveDustTraitorVictoryResult } from './hauntVictoryModel';
import {
    createBloodFromStoneTurnStartVisibility,
    createInitialMonsterTurnRuntimeState,
    resolveBloodFromStoneMonsterTurnStatus,
    type BetrayalBloodFromStoneMonsterTurnRuntimeState,
} from './monsterActionReadModel';
import {
    clearPendingExtraTurnAfterCurrentTurn,
    resolveTurnStartInventoryCardIds,
} from './possessionActionReadModel';
import { resolveRecommendedAction } from './recommendedActionReadModel';
import type {
    BetrayalCore,
    BetrayalEndgameResult,
    BetrayalPendingDamageAllocationState,
    BetrayalRecentRollState,
    BetrayalTurnEndedPayload,
} from './game';
import type { BetrayalEvent } from './events';

type TurnEndedEvent = Extract<BetrayalEvent, { type: 'TURN_ENDED' }>;
type TurnEndRollAcknowledgedEvent = Extract<BetrayalEvent, { type: 'TURN_END_ROLL_ACKNOWLEDGED' }>;

export interface BetrayalTurnEndStateResolution {
    core: BetrayalCore;
    scenarioCompletedResult?: BetrayalEndgameResult;
    helpingHandsMonsterTurnStartedPayload?: BetrayalTurnEndedPayload['deferredHelpingHandsMonsterTurnStart'];
}

function startBloodFromStoneMonsterTurnAfterPlayerIfNeeded(
    core: BetrayalCore,
    previousPlayerId: string,
): BetrayalCore {
    const status = resolveBloodFromStoneMonsterTurnStatus(core);
    if (
        status.active
        || status.monsterTurnAfterPlayerId !== previousPlayerId
        || !status.controllerPlayerId
        || status.stoneCherubIds.length === 0
    ) {
        return core;
    }
    const controllerCore = replaceExplorers(core, getAllExplorers(core), status.controllerPlayerId);
    const nextBloodFromStone: BetrayalBloodFromStoneMonsterTurnRuntimeState = {
        monsterTurnAfterPlayerId: status.monsterTurnAfterPlayerId,
        activeMonsterTurn: true,
        monsterTurnControllerPlayerId: status.controllerPlayerId,
    };
    const startedCore: BetrayalCore = {
        ...controllerCore,
        turnStartSpeed: 0,
        movesRemaining: 0,
        activePlayerId: status.controllerPlayerId,
        recentRoll: null,
        recommendedAction: 'endTurn',
        scenarioRuntime: {
            ...controllerCore.scenarioRuntime,
            bloodFromStone: nextBloodFromStone,
            monsterTurn: createInitialMonsterTurnRuntimeState(),
            bloodFromStoneTurnStartVisibleStoneCherubIdsByPlayerId:
                createBloodFromStoneTurnStartVisibility(controllerCore),
            bloodFromStoneNewLineOfSightDamagePlayerIdsThisTurn: [],
        },
    };
    const syncedCore = syncCurrentExplorerProjection(startedCore);
    return {
        ...syncedCore,
        activePlayerId: status.controllerPlayerId,
        recommendedAction: 'endTurn',
        activityLog: appendActivity(syncedCore, '石像小天使怪物回合开始。', 'warning'),
    };
}

function createRoomEndTurnRecentRoll(
    event: TurnEndedEvent,
    originalRoomId: string,
    traitsBeforeEffect: BetrayalCore['currentExplorer']['traits'],
): BetrayalRecentRollState | null {
    const effect = event.payload.roomEndTurnEffect;
    if (effect?.kind !== 'speedCheckFallToBasement' || !effect.speedRollDice) {
        return null;
    }
    return {
        id: `room-end-turn-${effect.playerId}-${event.timestamp}`,
        kind: 'roomEndTurnTraitCheck',
        playerId: effect.playerId,
        sourceTitle: effect.roomName,
        trait: 'speed',
        dice: [...effect.speedRollDice],
        passiveBonus: effect.speedRollPassiveBonus ?? 0,
        latestLabel: effect.destinationRoomId
            ? '坠落到地下室起始点'
            : '没有坠落',
        roomId: effect.roomId,
        roomEndTurn: {
            kind: effect.kind,
            roomName: effect.roomName,
            roomId: effect.roomId,
            originalRoomId,
            traitsBeforeEffect,
            previousPhysicalDamage: effect.physicalDamage ?? 0,
            previousDestinationRoomId: effect.destinationRoomId,
            nextPlayerId: event.payload.nextPlayerId,
            monsterMovementRoll: event.payload.monsterMovementRoll ?? null,
            turnLogText: event.payload.turnLogText,
            helpingHandsMonsterTurnControllerPlayerId: event.payload.helpingHandsMonsterTurnControllerPlayerId,
            skipBloodFromStoneMonsterTurnStart: event.payload.skipBloodFromStoneMonsterTurnStart,
        },
        consumedRabbitFootCardIds: [],
    };
}

function createAdvancedTurnRecentRoll(
    event: TurnEndedEvent,
    originalRoomId: string,
    traitsBeforeEffect: BetrayalCore['currentExplorer']['traits'],
    monsterMovementRoll: BetrayalTurnEndedPayload['monsterMovementRoll'],
): BetrayalRecentRollState | null {
    const roomEndTurnRecentRoll = createRoomEndTurnRecentRoll(event, originalRoomId, traitsBeforeEffect);
    if (roomEndTurnRecentRoll) {
        const recentRoll: BetrayalRecentRollState = {
            ...roomEndTurnRecentRoll,
            roomEndTurn: roomEndTurnRecentRoll.roomEndTurn
                ? { ...roomEndTurnRecentRoll.roomEndTurn }
                : undefined,
        };
        if (recentRoll.roomEndTurn) {
            delete recentRoll.roomEndTurn.nextPlayerId;
            delete recentRoll.roomEndTurn.monsterMovementRoll;
            delete recentRoll.roomEndTurn.turnLogText;
        }
        return recentRoll;
    }
    return monsterMovementRoll
        ? {
            id: `monster-move-${monsterMovementRoll.monsterId}-${event.timestamp}`,
            kind: 'monsterMoveRoll',
            playerId: monsterMovementRoll.playerId,
            sourceTitle: `${monsterMovementRoll.monsterName}移动`,
            trait: 'speed',
            rollLabel: `速度 ${monsterMovementRoll.speed}`,
            dice: [...monsterMovementRoll.dice],
            passiveBonus: 0,
            latestLabel: `可移动 ${monsterMovementRoll.moveAllowance} 间`,
            consumedRabbitFootCardIds: [],
        }
        : null;
}

function createPendingTurnEndDamageCore(
    core: BetrayalCore,
    allocation: BetrayalPendingDamageAllocationState,
    logText: string,
    recommendedAction: BetrayalCore['recommendedAction'],
    options: { appendLog?: boolean } = {},
): BetrayalCore {
    const synced = syncCurrentExplorerProjection(core);
    return {
        ...synced,
        recommendedAction,
        turnEndedByDiscovery: false,
        latestDiscovery: null,
        latestDiscoveryOwnerPlayerId: null,
        highlightedDeckKind: null,
        pendingEventChoice: null,
        pendingTradeAgreement: null,
        pendingDamageAllocation: allocation,
        activePlayerId: allocation.playerId,
        recentRoll: null,
        ...(options.appendLog === false
            ? {}
            : { activityLog: appendActivity(synced, logText, 'warning') }),
    };
}

function createMonsterMoveRecentRoll(
    monsterMovementRoll: BetrayalTurnEndedPayload['monsterMovementRoll'],
    timestamp: number,
): BetrayalRecentRollState | null {
    return monsterMovementRoll
        ? {
            id: `monster-move-${monsterMovementRoll.monsterId}-${timestamp}`,
            kind: 'monsterMoveRoll',
            playerId: monsterMovementRoll.playerId,
            sourceTitle: `${monsterMovementRoll.monsterName}移动`,
            trait: 'speed',
            rollLabel: `速度 ${monsterMovementRoll.speed}`,
            dice: [...monsterMovementRoll.dice],
            passiveBonus: 0,
            latestLabel: `可移动 ${monsterMovementRoll.moveAllowance} 间`,
            consumedRabbitFootCardIds: [],
        }
        : null;
}

function advanceTurnEndState(
    core: BetrayalCore,
    input: {
        previousPlayerId: string;
        nextPlayerId: string;
        logText: string;
        monsterMovementRoll?: BetrayalTurnEndedPayload['monsterMovementRoll'];
        skipBloodFromStoneMonsterTurnStart?: boolean;
        deferredHelpingHandsMonsterTurnStart?: BetrayalTurnEndedPayload['deferredHelpingHandsMonsterTurnStart'];
        recommendationUsesRecentRoll: boolean;
        createRecentRoll: (
            monsterMovementRoll: BetrayalTurnEndedPayload['monsterMovementRoll'],
        ) => BetrayalRecentRollState | null;
    },
): BetrayalTurnEndStateResolution {
    const explorers = getAllExplorers(core);
    const next = replaceExplorers(core, explorers, input.nextPlayerId);
    const revived = applyBetrayalJackSpiritRevivalAtMonsterTurnStart(next, input.nextPlayerId);
    const nextCore = revived ? syncCurrentExplorerProjection(next) : next;
    const monsterMovementRoll = !revived
        && isBetrayalPlayerControllingMonster(nextCore, input.nextPlayerId)
        ? input.monsterMovementRoll ?? null
        : null;
    const nextTurnStartSpeed = monsterMovementRoll?.speed ?? resolveTurnStartSpeed(nextCore, input.nextPlayerId);
    const nextMovesRemaining = monsterMovementRoll?.moveAllowance ?? nextTurnStartSpeed;
    const recentRoll = input.createRecentRoll(monsterMovementRoll);
    const resetScenarioRuntime = {
        ...nextCore.scenarioRuntime,
        corpseLootedByPlayerIdsThisTurn: [],
        usedRoomEffectIdsThisTurn: [],
        monsterTurn: createInitialMonsterTurnRuntimeState(),
        bloodFromStoneTurnStartVisibleStoneCherubIdsByPlayerId: createBloodFromStoneTurnStartVisibility(nextCore),
        bloodFromStoneNewLineOfSightDamagePlayerIdsThisTurn: [],
        dust: nextCore.scenarioRuntime.dust
            ? {
                ...cloneDustRuntimeState(nextCore.scenarioRuntime.dust),
                exchangedSicknessThisTurnPlayerIds: [],
            }
            : undefined,
        helpingHands: nextCore.scenarioRuntime.helpingHands
            ? {
                ...cloneHelpingHandsRuntimeState(nextCore.scenarioRuntime.helpingHands),
                trollHandAttackUsedIdsThisTurn: [],
            }
            : undefined,
        magicCamera: nextCore.scenarioRuntime.magicCamera
            ? cloneMagicCameraRuntimeState(nextCore.scenarioRuntime.magicCamera)
            : undefined,
    };
    const activityCore = {
        ...nextCore,
        scenarioRuntime: resetScenarioRuntime,
    };
    const advancedCore: BetrayalCore = {
        ...nextCore,
        turnStartSpeed: nextTurnStartSpeed,
        movesRemaining: nextMovesRemaining,
        recommendedAction: resolveRecommendedAction({
            ...nextCore,
            movesRemaining: nextMovesRemaining,
            recentRoll: input.recommendationUsesRecentRoll ? recentRoll : null,
            turnEndedByDiscovery: false,
        }),
        usedCardIdsThisTurn: [],
        tradeUsedThisTurnPlayerIds: [],
        receivedCardIdsThisTurnByPlayerId: {
            ...nextCore.receivedCardIdsThisTurnByPlayerId,
            [input.previousPlayerId]: [],
        },
        nextNonCombatTraitReplacement: null,
        nextNonCombatTraitRollTotalReplacement: null,
        pendingExtraTurnAfterCurrentTurn: clearPendingExtraTurnAfterCurrentTurn(nextCore, input.previousPlayerId),
        turnEndedByDiscovery: false,
        turnStartInventoryCardIds: resolveTurnStartInventoryCardIds(nextCore, input.nextPlayerId),
        scenarioRuntime: resetScenarioRuntime,
        latestDiscovery: null,
        latestDiscoveryOwnerPlayerId: null,
        highlightedDeckKind: null,
        pendingTradeAgreement: null,
        activePlayerId: null,
        recentRoll,
        activityLog: revived
            ? appendActivity(
                {
                    ...activityCore,
                    activityLog: appendActivity(activityCore, input.logText, 'accent'),
                },
                '杰克之灵回到了尸体所在房间，叛徒恢复肉身并重新回到宅邸中。',
                'warning',
            )
            : appendActivity(activityCore, input.logText, 'accent'),
    };
    const withBloodFromStone = input.skipBloodFromStoneMonsterTurnStart
        ? advancedCore
        : startBloodFromStoneMonsterTurnAfterPlayerIfNeeded(
            advancedCore,
            input.previousPlayerId,
        );
    return {
        core: withBloodFromStone,
        helpingHandsMonsterTurnStartedPayload: input.deferredHelpingHandsMonsterTurnStart
            ? {
                ...input.deferredHelpingHandsMonsterTurnStart,
                moveDice: [...input.deferredHelpingHandsMonsterTurnStart.moveDice],
            }
            : undefined,
    };
}

export function applyBetrayalTurnEndedState(
    core: BetrayalCore,
    event: TurnEndedEvent,
): BetrayalTurnEndStateResolution {
    let roomEffectCore = core;
    let pendingRoomDamageAllocation: BetrayalPendingDamageAllocationState | null = null;
    let pendingDustEndTurnDamageAllocation: BetrayalPendingDamageAllocationState | null = null;
    const roomEndTurnTraitsBeforeEffect = { ...roomEffectCore.currentExplorer.traits };
    const roomEndTurnOriginalRoomId = roomEffectCore.currentExplorer.roomId;
    const shouldDeferRoomEndTurnDamage = Boolean(
        event.payload.deferAdvanceUntilRollAcknowledged
        && event.payload.roomEndTurnEffect?.kind === 'speedCheckFallToBasement',
    );
    if (event.payload.roomEndTurnEffect?.playerId === roomEffectCore.currentExplorer.playerId) {
        if (event.payload.roomEndTurnEffect.destinationRoomId) {
            roomEffectCore.currentExplorer.roomId = event.payload.roomEndTurnEffect.destinationRoomId;
        }
        if (event.payload.roomEndTurnEffect.physicalDamage) {
            if (event.payload.roomEndTurnEffect.kind === 'physicalDamage1') {
                pendingRoomDamageAllocation = createPendingDamageAllocation({
                    id: `room-damage-${event.payload.roomEndTurnEffect.playerId}-${event.timestamp}`,
                    explorer: roomEffectCore.currentExplorer,
                    sourceTitle: event.payload.roomEndTurnEffect.roomName,
                    damageKind: 'physical',
                    amount: event.payload.roomEndTurnEffect.physicalDamage,
                    allowSkull: roomEffectCore.phase === 'haunt',
                    nextPlayerId: event.payload.nextPlayerId,
                    monsterMovementRoll: event.payload.monsterMovementRoll ?? null,
                    turnLogText: event.payload.turnLogText,
                    helpingHandsMonsterTurnControllerPlayerId: event.payload.helpingHandsMonsterTurnControllerPlayerId,
                    skipBloodFromStoneMonsterTurnStart: event.payload.skipBloodFromStoneMonsterTurnStart,
                });
            } else if (!shouldDeferRoomEndTurnDamage) {
                applyPhysicalDamage(roomEffectCore.currentExplorer, event.payload.roomEndTurnEffect.physicalDamage);
            }
        }
        roomEffectCore = syncCurrentExplorerProjection(roomEffectCore);
    }
    if (event.payload.dustEndTurn && roomEffectCore.scenarioRuntime.dust) {
        for (const swap of event.payload.dustEndTurn.swaps) {
            applyDustSicknessSwap(roomEffectCore.scenarioRuntime.dust, swap);
        }
        const damageTarget = event.payload.dustEndTurn.damagePlayerId
            ? findExplorerByPlayerId(roomEffectCore, event.payload.dustEndTurn.damagePlayerId)
            : null;
        if (damageTarget && event.payload.dustEndTurn.damageAmount !== undefined) {
            pendingDustEndTurnDamageAllocation = createPendingDamageAllocation({
                id: `dust-end-turn-${event.payload.dustEndTurn.damagePlayerId}-${event.timestamp}`,
                explorer: damageTarget,
                sourceTitle: '灰尘冲动',
                damageKind: 'general',
                amount: event.payload.dustEndTurn.damageAmount,
                allowSkull: true,
                nextPlayerId: event.payload.nextPlayerId,
                monsterMovementRoll: event.payload.monsterMovementRoll ?? null,
                turnLogText: event.payload.turnLogText,
                helpingHandsMonsterTurnControllerPlayerId: event.payload.helpingHandsMonsterTurnControllerPlayerId,
                skipBloodFromStoneMonsterTurnStart: event.payload.skipBloodFromStoneMonsterTurnStart,
            });
        }
        roomEffectCore = syncCurrentExplorerProjection(roomEffectCore);
        const scenarioCompletedResult = resolveDustTraitorVictoryResult(roomEffectCore);
        if (scenarioCompletedResult) {
            return { core: roomEffectCore, scenarioCompletedResult };
        }
    }
    if (
        event.payload.magicCameraEndTurnCapturedEssencePlayerIds?.length
        && roomEffectCore.scenarioRuntime.magicCamera
    ) {
        const magicCamera = roomEffectCore.scenarioRuntime.magicCamera;
        for (const playerId of event.payload.magicCameraEndTurnCapturedEssencePlayerIds) {
            magicCamera.heroEssencePlayerIds = magicCamera.heroEssencePlayerIds
                .filter((heroPlayerId) => heroPlayerId !== playerId);
            magicCamera.capturedEssencePlayerIds = Array.from(new Set([
                ...magicCamera.capturedEssencePlayerIds,
                playerId,
            ]));
        }
        roomEffectCore = syncCurrentExplorerProjection(roomEffectCore);
    }
    if (pendingRoomDamageAllocation) {
        return {
            core: createPendingTurnEndDamageCore(
                roomEffectCore,
                pendingRoomDamageAllocation,
                event.payload.logText,
                'endTurn',
            ),
        };
    }
    if (pendingDustEndTurnDamageAllocation) {
        return {
            core: createPendingTurnEndDamageCore(
                roomEffectCore,
                pendingDustEndTurnDamageAllocation,
                event.payload.logText,
                'damage',
            ),
        };
    }
    if (
        event.payload.deferAdvanceUntilRollAcknowledged
        && event.payload.roomEndTurnEffect?.kind === 'speedCheckFallToBasement'
        && event.payload.roomEndTurnEffect.speedRollDice
    ) {
        const recentRoll = createRoomEndTurnRecentRoll(
            event,
            roomEndTurnOriginalRoomId,
            roomEndTurnTraitsBeforeEffect,
        );
        const synced = syncCurrentExplorerProjection(roomEffectCore);
        return {
            core: {
                ...synced,
                recommendedAction: 'endTurn',
                turnEndedByDiscovery: false,
                latestDiscovery: null,
                latestDiscoveryOwnerPlayerId: null,
                highlightedDeckKind: null,
                pendingTradeAgreement: null,
                activePlayerId: null,
                recentRoll,
                activityLog: appendActivity(synced, event.payload.logText, 'accent'),
            },
        };
    }
    return advanceTurnEndState(roomEffectCore, {
        previousPlayerId: event.payload.previousPlayerId,
        nextPlayerId: event.payload.nextPlayerId,
        logText: event.payload.logText,
        monsterMovementRoll: event.payload.monsterMovementRoll ?? null,
        skipBloodFromStoneMonsterTurnStart: event.payload.skipBloodFromStoneMonsterTurnStart,
        deferredHelpingHandsMonsterTurnStart: event.payload.deferredHelpingHandsMonsterTurnStart,
        recommendationUsesRecentRoll: true,
        createRecentRoll: (monsterMovementRoll) => createAdvancedTurnRecentRoll(
            event,
            roomEndTurnOriginalRoomId,
            roomEndTurnTraitsBeforeEffect,
            monsterMovementRoll,
        ),
    });
}

export function applyBetrayalTurnEndRollAcknowledgedState(
    core: BetrayalCore,
    event: TurnEndRollAcknowledgedEvent,
): BetrayalTurnEndStateResolution {
    const pendingDeathPreventionRecentRoll = core.recentRoll?.kind === 'deathPrevention'
        ? core.recentRoll
        : null;
    const pendingRoomEndTurnRecentRoll = core.recentRoll?.kind === 'roomEndTurnTraitCheck'
        ? core.recentRoll
        : null;
    const pendingRoomEndTurnRoll = pendingRoomEndTurnRecentRoll?.roomEndTurn ?? null;
    const pendingRoomEndTurnExplorer = pendingRoomEndTurnRecentRoll
        ? findExplorerByPlayerId(core, pendingRoomEndTurnRecentRoll.playerId)
        : null;
    const pendingRoomEndTurnDamageAllocation = (
        pendingRoomEndTurnRoll?.kind === 'speedCheckFallToBasement'
        && pendingRoomEndTurnRoll.previousDestinationRoomId
        && pendingRoomEndTurnRoll.previousPhysicalDamage > 0
        && pendingRoomEndTurnExplorer
    )
        ? createPendingDamageAllocation({
            id: `room-fall-damage-${pendingRoomEndTurnRecentRoll.playerId}-${event.timestamp}`,
            explorer: pendingRoomEndTurnExplorer,
            sourceTitle: pendingRoomEndTurnRoll.roomName,
            damageKind: 'physical',
            amount: pendingRoomEndTurnRoll.previousPhysicalDamage,
            allowSkull: core.phase === 'haunt',
            nextPlayerId: event.payload.nextPlayerId,
            monsterMovementRoll: event.payload.monsterMovementRoll ?? null,
            turnLogText: event.payload.logText,
            helpingHandsMonsterTurnControllerPlayerId: event.payload.helpingHandsMonsterTurnControllerPlayerId,
            skipBloodFromStoneMonsterTurnStart: event.payload.skipBloodFromStoneMonsterTurnStart,
        })
        : null;
    if (pendingRoomEndTurnDamageAllocation) {
        return {
            core: createPendingTurnEndDamageCore(
                core,
                pendingRoomEndTurnDamageAllocation,
                event.payload.logText,
                'endTurn',
                { appendLog: false },
            ),
        };
    }
    if (pendingDeathPreventionRecentRoll) {
        buryDustDeadTraitorPossessions(core, pendingDeathPreventionRecentRoll.playerId, {
            deferForRabbitFoot: false,
        });
        const scenarioCompletedResult = resolveDustTraitorVictoryResult(core, {
            deferForRabbitFoot: false,
        });
        if (scenarioCompletedResult) {
            return { core, scenarioCompletedResult };
        }
    }
    return advanceTurnEndState(core, {
        previousPlayerId: event.payload.previousPlayerId,
        nextPlayerId: event.payload.nextPlayerId,
        logText: event.payload.logText,
        monsterMovementRoll: event.payload.monsterMovementRoll ?? null,
        skipBloodFromStoneMonsterTurnStart: event.payload.skipBloodFromStoneMonsterTurnStart,
        recommendationUsesRecentRoll: false,
        createRecentRoll: (monsterMovementRoll) => createMonsterMoveRecentRoll(
            monsterMovementRoll,
            event.timestamp,
        ),
    });
}
