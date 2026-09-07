import {
    appendActivity,
    syncCurrentExplorerProjection,
} from './coreStateModel';
import { applyMentalDamage } from './damageResolutionModel';
import { markDeadExplorer } from './deathStateReadModel';
import {
    findExplorerByPlayerId,
    getAllExplorers,
} from './explorerReadModel';
import { removeMagicCameraFromExplorer } from './hauntRuntimeSetupModel';
import {
    resolveMagicCameraHeroVictoryResult,
    resolveMagicCameraTraitorVictoryResult,
} from './hauntVictoryModel';
import { clearNextNonCombatTraitRollReplacementsForPlayer } from './possessionActionReadModel';
import { moveExplorerTraitSteps } from './traitTrackModel';
import type {
    BetrayalCore,
    BetrayalEndgameResult,
} from './game';
import type { BetrayalEvent } from './events';

type PhotoTakenEvent = Extract<BetrayalEvent, { type: 'PHOTO_TAKEN' }>;
type MagicCameraSmashedEvent = Extract<BetrayalEvent, { type: 'MAGIC_CAMERA_SMASHED' }>;
type PhantomPhotographerAttackResolvedEvent = Extract<BetrayalEvent, { type: 'PHANTOM_PHOTOGRAPHER_ATTACK_RESOLVED' }>;

export interface BetrayalMagicCameraHauntStateResolution {
    core: BetrayalCore;
    scenarioCompletedResult?: BetrayalEndgameResult;
}

export function applyBetrayalPhotoTakenState(
    core: BetrayalCore,
    event: PhotoTakenEvent,
): BetrayalCore {
    const magicCamera = core.scenarioRuntime.magicCamera;
    const actor = findExplorerByPlayerId(core, event.payload.playerId);
    if (!magicCamera || !actor) {
        return core;
    }
    core.usedCardIdsThisTurn = [...core.usedCardIdsThisTurn, 'take-photo'];
    clearNextNonCombatTraitRollReplacementsForPlayer(core, event.payload.playerId);
    core.recentRoll = {
        id: `${event.payload.playerId}-take-photo-${event.timestamp}`,
        kind: 'hauntActionTraitCheck',
        playerId: event.payload.playerId,
        sourceTitle: '拍照',
        trait: 'speed',
        rollLabel: '速度检定',
        dice: [...event.payload.dice],
        passiveBonus: event.payload.passiveBonus,
        latestLabel: event.payload.success ? '夺取本质' : '拍照失败',
        consumedRabbitFootCardIds: [],
    };
    if (event.payload.success) {
        magicCamera.heroEssencePlayerIds = magicCamera.heroEssencePlayerIds
            .filter((playerId) => playerId !== event.payload.targetPlayerId);
        magicCamera.capturedEssencePlayerIds = Array.from(new Set([
            ...magicCamera.capturedEssencePlayerIds,
            event.payload.targetPlayerId,
        ]));
        moveExplorerTraitSteps(actor, event.payload.trait, 1);
    }
    const synced = syncCurrentExplorerProjection(core);
    return {
        ...synced,
        recommendedAction: 'endTurn',
        activityLog: appendActivity(synced, event.payload.logText, event.payload.success ? 'accent' : 'warning'),
    };
}

export function applyBetrayalMagicCameraSmashedState(
    core: BetrayalCore,
    event: MagicCameraSmashedEvent,
): BetrayalMagicCameraHauntStateResolution {
    const magicCamera = core.scenarioRuntime.magicCamera;
    if (!magicCamera) {
        return { core };
    }
    core.usedCardIdsThisTurn = [...core.usedCardIdsThisTurn, 'smash-magic-camera'];
    clearNextNonCombatTraitRollReplacementsForPlayer(core, event.payload.playerId);
    core.recentRoll = {
        id: `${event.payload.playerId}-smash-magic-camera-${event.timestamp}`,
        kind: 'hauntActionTraitCheck',
        playerId: event.payload.playerId,
        sourceTitle: '砸毁魔法相机',
        trait: 'sanity',
        rollLabel: '神志检定',
        dice: [...event.payload.dice],
        passiveBonus: event.payload.passiveBonus,
        latestLabel: event.payload.success ? '相机摧毁' : '摧毁失败',
        consumedRabbitFootCardIds: [],
    };
    if (event.payload.success) {
        magicCamera.cameraDestroyed = true;
        magicCamera.cameraHolderPlayerId = null;
        getAllExplorers(core).forEach(removeMagicCameraFromExplorer);
    }
    const scenarioCompletedResult = resolveMagicCameraHeroVictoryResult(core);
    if (scenarioCompletedResult) {
        return { core, scenarioCompletedResult };
    }
    const synced = syncCurrentExplorerProjection(core);
    return {
        core: {
            ...synced,
            recommendedAction: 'endTurn',
            activityLog: appendActivity(synced, event.payload.logText, event.payload.success ? 'accent' : 'warning'),
        },
    };
}

export function applyBetrayalPhantomPhotographerAttackResolvedState(
    core: BetrayalCore,
    event: PhantomPhotographerAttackResolvedEvent,
): BetrayalMagicCameraHauntStateResolution {
    const magicCamera = core.scenarioRuntime.magicCamera;
    const target = findExplorerByPlayerId(core, event.payload.targetPlayerId);
    if (!magicCamera || !target) {
        return { core };
    }
    if (event.payload.damageToHero) {
        applyMentalDamage(target, event.payload.damageToHero, { allowSkull: true });
    }
    if (event.payload.defeatedPlayerId) {
        markDeadExplorer(core, event.payload.defeatedPlayerId);
    }
    core.recentRoll = {
        id: `${event.payload.monsterId}-phantom-attack-${event.timestamp}`,
        kind: 'hauntActionTraitCheck',
        playerId: event.payload.targetPlayerId,
        sourceTitle: '幻影摄影师攻击',
        trait: 'sanity',
        rollLabel: '神志攻击',
        dice: [...event.payload.dice],
        passiveBonus: 0,
        latestLabel: event.payload.damageToHero ? `精神伤害 ${event.payload.damageToHero}` : '未造成伤害',
        consumedRabbitFootCardIds: [],
    };
    const scenarioCompletedResult = resolveMagicCameraTraitorVictoryResult(core);
    if (scenarioCompletedResult) {
        return { core, scenarioCompletedResult };
    }
    const synced = syncCurrentExplorerProjection(core);
    return {
        core: {
            ...synced,
            recommendedAction: 'move',
            activityLog: appendActivity(synced, event.payload.logText, event.payload.damageToHero ? 'warning' : 'neutral'),
        },
    };
}
