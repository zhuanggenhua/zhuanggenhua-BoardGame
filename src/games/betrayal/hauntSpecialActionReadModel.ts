import type { ValidationResult } from '../../engine/types';
import { BETRAYAL_COMMANDS } from './commands';
import {
    findExplorerByPlayerId,
    getAllExplorers,
} from './explorerReadModel';
import type {
    BetrayalCore,
    BetrayalExplorerSummary,
    BetrayalMonsterSummary,
    BetrayalRoomFloor,
    BetrayalRoomNode,
    BetrayalTraitKey,
} from './game';
import type { BetrayalCommandType } from './commandTypes';
import {
    findMummyMonster,
    hasLivingHeroWithBookInRoom,
    hasMagicCamera,
    hasOmenBook,
    isBetrayalLibraryRoom,
    isBloodFromStoneHaunt,
    isCrimsonJackHaunt,
    isDustHaunt,
    isDustResearchRoom,
    isMagicCameraHaunt,
    isMummyHaunt,
    isMummyNameStudyRoom,
    isStoneCherubMonster,
    isUponReflectionHaunt,
    resolveControlledRoomId,
} from './hauntScenarioReadModel';
import { resolveMonsterStatusKind } from './monsterReadModel';
import {
    isBetrayalRoomInLineOfSight,
    isStraightLineVisible,
} from './roomMapModel';

export interface BetrayalBloodFromStonePeekabooOption {
    id: string;
    sameRoomMonsterId: string;
    sameRoomMonsterName: string;
    sameRoomId: string;
    sameRoomName: string;
    lineOfSightMonsterId: string;
    lineOfSightMonsterName: string;
    lineOfSightRoomId: string;
    lineOfSightRoomName: string;
}

export interface BetrayalHauntSpecialActionTargetSelectionReadModel {
    magicCameraPhotoTargets: BetrayalExplorerSummary[];
    magicCameraPhotoTargetPlayerIds: ReadonlySet<string>;
    magicCameraPhotoTarget: BetrayalExplorerSummary | null;
    magicCameraPhotoTrait: BetrayalTraitKey;
    bloodFromStonePeekabooOptions: BetrayalBloodFromStonePeekabooOption[];
    bloodFromStonePeekabooSameRoomMonsterIds: ReadonlySet<string>;
    bloodFromStonePeekabooLineOfSightMonsterIds: ReadonlySet<string>;
    isBloodFromStonePeekabooMode: boolean;
}

const MAGIC_CAMERA_PHOTO_TRAITS: readonly BetrayalTraitKey[] = ['might', 'speed', 'knowledge', 'sanity'];

export type BetrayalHauntSpecialActionId =
    | 'learn-about-jack'
    | 'study-exorcism'
    | 'exorcise-jack'
    | 'study-mummy-name'
    | 'learn-mummy-banishment'
    | 'banish-mummy'
    | 'search-for-cure'
    | 'cure-the-dust'
    | 'sickness-exchange'
    | 'take-photo'
    | 'smash-magic-camera'
    | 'play-peekaboo'
    | 'break-mirror-curse';

interface BetrayalHauntSpecialActionDefinition {
    sourceName: string;
    commandType: BetrayalCommandType;
}

const HAUNT_SPECIAL_ACTION_DEFINITIONS: Record<BetrayalHauntSpecialActionId, BetrayalHauntSpecialActionDefinition> = {
    'learn-about-jack': {
        sourceName: '调查杰克',
        commandType: BETRAYAL_COMMANDS.LEARN_ABOUT_JACK,
    },
    'study-exorcism': {
        sourceName: '研究驱魔法阵',
        commandType: BETRAYAL_COMMANDS.STUDY_EXORCISM,
    },
    'exorcise-jack': {
        sourceName: '驱魔',
        commandType: BETRAYAL_COMMANDS.EXORCISE_JACK,
    },
    'study-mummy-name': {
        sourceName: '寻找木乃伊真名',
        commandType: BETRAYAL_COMMANDS.STUDY_MUMMY_NAME,
    },
    'learn-mummy-banishment': {
        sourceName: '学习驱逐法术',
        commandType: BETRAYAL_COMMANDS.LEARN_MUMMY_BANISHMENT,
    },
    'banish-mummy': {
        sourceName: '驱逐木乃伊',
        commandType: BETRAYAL_COMMANDS.BANISH_MUMMY,
    },
    'search-for-cure': {
        sourceName: '寻找解药',
        commandType: BETRAYAL_COMMANDS.SEARCH_FOR_CURE,
    },
    'cure-the-dust': {
        sourceName: '治愈灰尘',
        commandType: BETRAYAL_COMMANDS.CURE_THE_DUST,
    },
    'sickness-exchange': {
        sourceName: '交换疾病标记',
        commandType: BETRAYAL_COMMANDS.REQUEST_SICKNESS_EXCHANGE,
    },
    'take-photo': {
        sourceName: '拍照',
        commandType: BETRAYAL_COMMANDS.TAKE_PHOTO,
    },
    'smash-magic-camera': {
        sourceName: '砸毁魔法相机',
        commandType: BETRAYAL_COMMANDS.SMASH_MAGIC_CAMERA,
    },
    'play-peekaboo': {
        sourceName: '玩躲猫猫',
        commandType: BETRAYAL_COMMANDS.PLAY_PEEKABOO,
    },
    'break-mirror-curse': {
        sourceName: '破咒',
        commandType: BETRAYAL_COMMANDS.BREAK_MIRROR_CURSE,
    },
};

export interface BetrayalHauntSpecialActionStatus {
    sourceKind: 'hauntAction';
    sourceId: string;
    sourceName: string;
    commandType: BetrayalCommandType | null;
    active: boolean;
    canUse: boolean;
    usedThisTurn: boolean;
    phaseEligible: boolean;
    actorAlive: boolean;
    reason: string | null;
}

function isBetrayalHauntSpecialActionId(actionId: string): actionId is BetrayalHauntSpecialActionId {
    return Object.prototype.hasOwnProperty.call(HAUNT_SPECIAL_ACTION_DEFINITIONS, actionId);
}

export function hasUsedHauntSpecialActionThisTurn(core: BetrayalCore): boolean {
    return core.usedCardIdsThisTurn.some(isBetrayalHauntSpecialActionId);
}

export function canUseStalkThePrey(core: BetrayalCore, actor: BetrayalExplorerSummary): boolean {
    if (core.scenarioRuntime.traitorPlayerId !== actor.playerId || core.scenarioRuntime.jackSpiritReleased) {
        return false;
    }
    if (core.usedCardIdsThisTurn.includes('haunt-attack') || core.usedCardIdsThisTurn.includes('stalk-the-prey')) {
        return false;
    }
    const room = core.rooms.find((item) => item.id === actor.roomId);
    if (!room) {
        return false;
    }
    const livingHeroes = getAllExplorers(core).filter((explorer) => (
        explorer.playerId !== core.scenarioRuntime.traitorPlayerId
        && !core.scenarioRuntime.deadExplorerPlayerIds.includes(explorer.playerId)
    ));
    return !livingHeroes.some((hero) => {
        const heroRoom = core.rooms.find((item) => item.id === hero.roomId);
        return heroRoom ? isStraightLineVisible(room, heroRoom, core.rooms) : false;
    });
}

export function resolveStalkThePreyTargets(core: BetrayalCore, actor: BetrayalExplorerSummary): BetrayalRoomNode[] {
    const livingHeroes = getAllExplorers(core).filter((explorer) => (
        explorer.playerId !== core.scenarioRuntime.traitorPlayerId
        && !core.scenarioRuntime.deadExplorerPlayerIds.includes(explorer.playerId)
    ));
    return core.rooms.filter((room) => {
        if (room.id === actor.roomId || room.state !== 'discovered' || room.floor === 'basement') {
            return false;
        }
        return !livingHeroes.some((hero) => {
            const heroRoom = core.rooms.find((item) => item.id === hero.roomId);
            return heroRoom ? isStraightLineVisible(room, heroRoom, core.rooms) : false;
        });
    });
}

export function canSearchForCure(core: BetrayalCore, actor: BetrayalExplorerSummary): boolean {
    const dust = core.scenarioRuntime.dust;
    const room = core.rooms.find((item) => item.id === actor.roomId);
    return Boolean(
        isDustHaunt(core)
        && dust
        && room?.state === 'discovered'
        && room.discoveryReward === 'omen'
        && !dust.researchRoomIds.includes(room.id),
    );
}

export function canCureTheDust(core: BetrayalCore, actor: BetrayalExplorerSummary): boolean {
    const dust = core.scenarioRuntime.dust;
    const room = core.rooms.find((item) => item.id === actor.roomId);
    return Boolean(
        isDustHaunt(core)
        && dust
        && room
        && (dust.researchRoomIds.includes(room.id) || isDustResearchRoom(room)),
    );
}

function hasLivingSameRoomExplorer(core: BetrayalCore, actor: BetrayalExplorerSummary): boolean {
    return getAllExplorers(core).some((explorer) => (
        explorer.playerId !== actor.playerId
        && explorer.roomId === actor.roomId
        && !core.scenarioRuntime.deadExplorerPlayerIds.includes(explorer.playerId)
    ));
}

function canLearnAboutJack(core: BetrayalCore, actor: BetrayalExplorerSummary): boolean {
    const isTraitor = core.scenarioRuntime.traitorPlayerId === actor.playerId;
    return Boolean(
        isCrimsonJackHaunt(core)
        && !isTraitor
        && isBetrayalLibraryRoom(core.rooms.find((room) => room.id === actor.roomId))
        && getAllExplorers(core).some((explorer) => (
            explorer.playerId !== core.scenarioRuntime.traitorPlayerId
            && !core.scenarioRuntime.deadExplorerPlayerIds.includes(explorer.playerId)
            && !core.scenarioRuntime.knowledgeOfJackPlayerIds.includes(explorer.playerId)
        )),
    );
}

function canStudyExorcism(core: BetrayalCore, actor: BetrayalExplorerSummary): boolean {
    const isTraitor = core.scenarioRuntime.traitorPlayerId === actor.playerId;
    return Boolean(
        isCrimsonJackHaunt(core)
        && !isTraitor
        && core.rooms.find((room) => room.id === actor.roomId)?.discoveryReward === 'event',
    );
}

function canExorciseJack(core: BetrayalCore, actor: BetrayalExplorerSummary): boolean {
    const isTraitor = core.scenarioRuntime.traitorPlayerId === actor.playerId;
    return Boolean(
        isCrimsonJackHaunt(core)
        && !isTraitor
        && core.scenarioRuntime.jackSpiritReleased
        && actor.roomId === core.scenarioRuntime.jackSpiritRoomId,
    );
}

function resolveRoomRegion(room: BetrayalRoomNode | undefined): BetrayalRoomFloor | null {
    return room?.floor ?? null;
}

export function countExorcismCirclesInRegion(
    core: BetrayalCore,
    roomId: string,
): number {
    const currentRoom = core.rooms.find((room) => room.id === roomId);
    const region = resolveRoomRegion(currentRoom);
    if (!region) {
        return 0;
    }
    return core.scenarioRuntime.exorcismCircleRoomIds.filter((circleRoomId) => {
        const circleRoom = core.rooms.find((room) => room.id === circleRoomId);
        return resolveRoomRegion(circleRoom) === region;
    }).length;
}

function isLivingMummyHero(core: BetrayalCore, actor: BetrayalExplorerSummary): boolean {
    return isMummyHaunt(core)
        && actor.playerId !== core.scenarioRuntime.traitorPlayerId
        && !core.scenarioRuntime.deadExplorerPlayerIds.includes(actor.playerId);
}

function canStudyMummyName(core: BetrayalCore, actor: BetrayalExplorerSummary): boolean {
    const mummy = core.scenarioRuntime.mummy;
    return Boolean(
        mummy
        && isLivingMummyHero(core, actor)
        && mummy.knowledgeTokenCount < 1
        && !mummy.trueNameFound
        && isMummyNameStudyRoom(core, actor.roomId),
    );
}

function canLearnMummyBanishment(core: BetrayalCore, actor: BetrayalExplorerSummary): boolean {
    const mummy = core.scenarioRuntime.mummy;
    return Boolean(
        mummy
        && isLivingMummyHero(core, actor)
        && mummy.trueNameFound
        && !mummy.banishmentSpellLearned
        && mummy.knowledgeTokenCount < 2
        && hasOmenBook(actor),
    );
}

function canBanishMummy(core: BetrayalCore, actor: BetrayalExplorerSummary): boolean {
    const mummy = core.scenarioRuntime.mummy;
    const monster = findMummyMonster(core);
    return Boolean(
        mummy
        && monster
        && isLivingMummyHero(core, actor)
        && mummy.knowledgeTokenCount >= 2
        && mummy.banishmentSpellLearned
        && actor.roomId === monster.roomId
        && hasLivingHeroWithBookInRoom(core, monster.roomId),
    );
}

function resolveExplorerRoom(core: BetrayalCore, explorer: BetrayalExplorerSummary | null): BetrayalRoomNode | null {
    return explorer ? core.rooms.find((room) => room.id === explorer.roomId) ?? null : null;
}

function canTraitorSeeMagicCameraTarget(
    core: BetrayalCore,
    traitor: BetrayalExplorerSummary,
    target: BetrayalExplorerSummary,
): boolean {
    if (traitor.roomId === target.roomId) {
        return true;
    }
    if (!hasMagicCamera(traitor) || core.scenarioRuntime.magicCamera?.cameraDestroyed) {
        return false;
    }
    const traitorRoom = resolveExplorerRoom(core, traitor);
    const targetRoom = resolveExplorerRoom(core, target);
    return Boolean(traitorRoom && targetRoom && isStraightLineVisible(traitorRoom, targetRoom, core.rooms));
}

export function resolveMagicCameraPhotoTargets(
    core: BetrayalCore,
    actor: BetrayalExplorerSummary,
): BetrayalExplorerSummary[] {
    const magicCamera = core.scenarioRuntime.magicCamera;
    if (!isMagicCameraHaunt(core) || !magicCamera || actor.playerId !== core.scenarioRuntime.traitorPlayerId) {
        return [];
    }
    return getAllExplorers(core).filter((explorer) => (
        explorer.playerId !== actor.playerId
        && explorer.playerId !== core.scenarioRuntime.traitorPlayerId
        && !core.scenarioRuntime.deadExplorerPlayerIds.includes(explorer.playerId)
        && magicCamera.heroEssencePlayerIds.includes(explorer.playerId)
        && canTraitorSeeMagicCameraTarget(core, actor, explorer)
    ));
}

export function canTakeMagicCameraPhoto(
    core: BetrayalCore,
    actor: BetrayalExplorerSummary,
    targetPlayerId?: string,
): boolean {
    return !core.usedCardIdsThisTurn.includes('take-photo')
        && resolveMagicCameraPhotoTargets(core, actor).some((target) => (
            !targetPlayerId || target.playerId === targetPlayerId
        ));
}

function canSmashMagicCameraIgnoringBudget(core: BetrayalCore, actor: BetrayalExplorerSummary): boolean {
    const magicCamera = core.scenarioRuntime.magicCamera;
    const traitor = core.scenarioRuntime.traitorPlayerId
        ? findExplorerByPlayerId(core, core.scenarioRuntime.traitorPlayerId)
        : null;
    return Boolean(
        isMagicCameraHaunt(core)
        && magicCamera
        && !magicCamera.cameraDestroyed
        && actor.playerId !== core.scenarioRuntime.traitorPlayerId
        && traitor
        && traitor.roomId === actor.roomId
        && (magicCamera.cameraHolderPlayerId === traitor.playerId || hasMagicCamera(traitor))
    );
}

export function canSmashMagicCamera(core: BetrayalCore, actor: BetrayalExplorerSummary): boolean {
    return canSmashMagicCameraIgnoringBudget(core, actor)
        && !core.scenarioRuntime.deadExplorerPlayerIds.includes(actor.playerId)
        && !core.usedCardIdsThisTurn.includes('smash-magic-camera');
}

export function canBreakMirrorCurse(core: BetrayalCore, actor: BetrayalExplorerSummary): boolean {
    return Boolean(
        isUponReflectionHaunt(core)
        && core.scenarioRuntime.uponReflection?.secretCombination
        && actor.playerId !== core.scenarioRuntime.hauntRevealerPlayerId
        && !core.scenarioRuntime.deadExplorerPlayerIds.includes(actor.playerId)
        && actor.inventory.some((card) => card.kind === 'omen')
    );
}

function resolveActiveStoneCherubMonster(
    core: BetrayalCore,
    monsterId: string | undefined,
): BetrayalMonsterSummary | null {
    if (!monsterId) {
        return null;
    }
    const monster = core.monsters.find((item) => item.id === monsterId);
    if (!monster || !isStoneCherubMonster(monster) || resolveMonsterStatusKind(core, monster.id) === 'killed') {
        return null;
    }
    return monster;
}

export function resolveBloodFromStonePeekabooOptions(
    core: BetrayalCore,
    playerId = core.currentExplorer.playerId,
): BetrayalBloodFromStonePeekabooOption[] {
    if (!isBloodFromStoneHaunt(core)) {
        return [];
    }
    const actor = findExplorerByPlayerId(core, playerId);
    if (
        !actor
        || actor.playerId === core.scenarioRuntime.traitorPlayerId
        || core.scenarioRuntime.deadExplorerPlayerIds.includes(actor.playerId)
    ) {
        return [];
    }
    const actorRoomId = resolveControlledRoomId(core, actor);
    const actorRoom = core.rooms.find((room) => room.id === actorRoomId && room.state === 'discovered');
    if (!actorRoom) {
        return [];
    }
    const activeStoneCherubs = core.monsters.filter((monster) => (
        isStoneCherubMonster(monster)
        && resolveMonsterStatusKind(core, monster.id) !== 'killed'
        && core.rooms.some((room) => room.id === monster.roomId && room.state === 'discovered')
    ));
    const sameRoomStoneCherubs = activeStoneCherubs.filter((monster) => monster.roomId === actorRoom.id);
    const options: BetrayalBloodFromStonePeekabooOption[] = [];
    for (const sameRoomStoneCherub of sameRoomStoneCherubs) {
        for (const lineOfSightStoneCherub of activeStoneCherubs) {
            if (lineOfSightStoneCherub.id === sameRoomStoneCherub.id) {
                continue;
            }
            if (!isBetrayalRoomInLineOfSight(core, actorRoom.id, lineOfSightStoneCherub.roomId)) {
                continue;
            }
            const lineOfSightRoom = core.rooms.find((room) => room.id === lineOfSightStoneCherub.roomId);
            if (!lineOfSightRoom) {
                continue;
            }
            options.push({
                id: `${sameRoomStoneCherub.id}->${lineOfSightStoneCherub.id}`,
                sameRoomMonsterId: sameRoomStoneCherub.id,
                sameRoomMonsterName: sameRoomStoneCherub.name,
                sameRoomId: actorRoom.id,
                sameRoomName: actorRoom.name,
                lineOfSightMonsterId: lineOfSightStoneCherub.id,
                lineOfSightMonsterName: lineOfSightStoneCherub.name,
                lineOfSightRoomId: lineOfSightRoom.id,
                lineOfSightRoomName: lineOfSightRoom.name,
            });
        }
    }
    return options;
}

export function resolveBetrayalHauntSpecialActionTargetSelectionReadModel({
    core,
    selectedMagicCameraTargetPlayerId,
    selectedPeekabooSameRoomMonsterId,
    hauntTargetingActionKind,
}: {
    core: BetrayalCore;
    selectedMagicCameraTargetPlayerId: string | null;
    selectedPeekabooSameRoomMonsterId: string | null;
    hauntTargetingActionKind: string | null;
}): BetrayalHauntSpecialActionTargetSelectionReadModel {
    const magicCameraPhotoTargets = core.phase === 'haunt'
        ? resolveMagicCameraPhotoTargets(core, core.currentExplorer)
        : [];
    const magicCameraPhotoTarget =
        (selectedMagicCameraTargetPlayerId
            && magicCameraPhotoTargets.find((explorer) => explorer.playerId === selectedMagicCameraTargetPlayerId))
        || magicCameraPhotoTargets[0]
        || null;
    const magicCameraPhotoTrait = MAGIC_CAMERA_PHOTO_TRAITS.reduce(
        (lowestTrait, trait) => (
            core.currentExplorer.traits[trait] < core.currentExplorer.traits[lowestTrait]
                ? trait
                : lowestTrait
        ),
        'might' as BetrayalTraitKey,
    );
    const bloodFromStonePeekabooOptions = resolveBloodFromStonePeekabooOptions(
        core,
        core.currentExplorer.playerId,
    );
    const peekabooLineOfSightOptions = selectedPeekabooSameRoomMonsterId
        ? bloodFromStonePeekabooOptions.filter(
            (option) => option.sameRoomMonsterId === selectedPeekabooSameRoomMonsterId,
        )
        : bloodFromStonePeekabooOptions;

    return {
        magicCameraPhotoTargets,
        magicCameraPhotoTargetPlayerIds: new Set(
            magicCameraPhotoTargets.map((target) => target.playerId),
        ),
        magicCameraPhotoTarget,
        magicCameraPhotoTrait,
        bloodFromStonePeekabooOptions,
        bloodFromStonePeekabooSameRoomMonsterIds: new Set(
            bloodFromStonePeekabooOptions.map((option) => option.sameRoomMonsterId),
        ),
        bloodFromStonePeekabooLineOfSightMonsterIds: new Set(
            peekabooLineOfSightOptions.map((option) => option.lineOfSightMonsterId),
        ),
        isBloodFromStonePeekabooMode:
            hauntTargetingActionKind === 'play-peekaboo'
            && bloodFromStonePeekabooOptions.length > 0,
    };
}

export function resolveBloodFromStonePeekabooSelection(
    core: BetrayalCore,
    actor: BetrayalExplorerSummary,
    sameRoomMonsterId: string | undefined,
    lineOfSightMonsterId: string | undefined,
): { option: BetrayalBloodFromStonePeekabooOption | null; reason: string | null } {
    if (!sameRoomMonsterId || !lineOfSightMonsterId) {
        return { option: null, reason: '玩躲猫猫必须选择同房间石像小天使和视线内另一只石像小天使。' };
    }
    const sameRoomMonster = resolveActiveStoneCherubMonster(core, sameRoomMonsterId);
    const lineOfSightMonster = resolveActiveStoneCherubMonster(core, lineOfSightMonsterId);
    if (!sameRoomMonster || !lineOfSightMonster || sameRoomMonster.id === lineOfSightMonster.id) {
        return { option: null, reason: '玩躲猫猫必须选择两只不同的活跃石像小天使。' };
    }
    const actorRoomId = resolveControlledRoomId(core, actor);
    if (sameRoomMonster.roomId !== actorRoomId) {
        return { option: null, reason: '第一只石像小天使必须与当前英雄同房间。' };
    }
    if (!isBetrayalRoomInLineOfSight(core, actorRoomId, lineOfSightMonster.roomId)) {
        return { option: null, reason: '第二只石像小天使必须在当前英雄视线内。' };
    }
    const option = resolveBloodFromStonePeekabooOptions(core, actor.playerId)
        .find((item) => (
            item.sameRoomMonsterId === sameRoomMonster.id
            && item.lineOfSightMonsterId === lineOfSightMonster.id
        )) ?? null;
    return option
        ? { option, reason: null }
        : { option: null, reason: '当前没有合法的玩躲猫猫目标组合。' };
}

function resolveBetrayalHauntSpecialActionActive(
    core: BetrayalCore,
    actionId: BetrayalHauntSpecialActionId,
    actor: BetrayalExplorerSummary,
): boolean {
    switch (actionId) {
        case 'learn-about-jack':
            return canLearnAboutJack(core, actor);
        case 'study-exorcism':
            return canStudyExorcism(core, actor);
        case 'exorcise-jack':
            return canExorciseJack(core, actor);
        case 'study-mummy-name':
            return canStudyMummyName(core, actor);
        case 'learn-mummy-banishment':
            return canLearnMummyBanishment(core, actor);
        case 'banish-mummy':
            return canBanishMummy(core, actor);
        case 'search-for-cure':
            return canSearchForCure(core, actor);
        case 'cure-the-dust':
            return canCureTheDust(core, actor);
        case 'sickness-exchange':
            return isDustHaunt(core) && hasLivingSameRoomExplorer(core, actor);
        case 'take-photo':
            return resolveMagicCameraPhotoTargets(core, actor).length > 0;
        case 'smash-magic-camera':
            return canSmashMagicCameraIgnoringBudget(core, actor);
        case 'play-peekaboo':
            return resolveBloodFromStonePeekabooOptions(core, actor.playerId).length > 0;
        case 'break-mirror-curse':
            return canBreakMirrorCurse(core, actor);
        default:
            return false;
    }
}

export function resolveBetrayalHauntSpecialActionStatus(
    core: BetrayalCore,
    actionId: string,
    playerId = core.currentExplorer.playerId,
): BetrayalHauntSpecialActionStatus {
    const actor = findExplorerByPlayerId(core, playerId) ?? core.currentExplorer;
    const definition = isBetrayalHauntSpecialActionId(actionId)
        ? HAUNT_SPECIAL_ACTION_DEFINITIONS[actionId]
        : null;
    const phaseEligible = core.phase === 'haunt';
    const actorAlive = !core.scenarioRuntime.deadExplorerPlayerIds.includes(actor.playerId);
    const usedThisTurn = core.usedCardIdsThisTurn.includes(actionId);
    const active = Boolean(
        definition
        && phaseEligible
        && actorAlive
        && resolveBetrayalHauntSpecialActionActive(core, actionId as BetrayalHauntSpecialActionId, actor),
    );
    let reason: string | null = null;
    if (!definition) {
        reason = '未知作祟特殊行动。';
    } else if (!phaseEligible) {
        reason = '作祟前不能使用作祟特殊行动。';
    } else if (!actorAlive) {
        reason = '死亡探索者不能使用作祟特殊行动。';
    } else if (usedThisTurn) {
        reason = '该作祟特殊行动本回合已经使用。';
    } else if (!active) {
        reason = '当前没有满足条件的作祟特殊行动。';
    }

    return {
        sourceKind: 'hauntAction',
        sourceId: actionId,
        sourceName: definition?.sourceName ?? actionId,
        commandType: definition?.commandType ?? null,
        active,
        canUse: reason === null,
        usedThisTurn,
        phaseEligible,
        actorAlive,
        reason,
    };
}

export function validateHauntSpecialActionBudget(
    core: BetrayalCore,
    actionId: BetrayalHauntSpecialActionId,
    actor: BetrayalExplorerSummary,
): ValidationResult | null {
    const status = resolveBetrayalHauntSpecialActionStatus(core, actionId, actor.playerId);
    return status.canUse ? null : { valid: false, error: status.reason ?? '当前不能使用该作祟特殊行动。' };
}
