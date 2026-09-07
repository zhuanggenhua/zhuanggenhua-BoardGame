import { expect, test, type Page } from '@playwright/test';
import {
    createBetrayalMonsterFromDefinition,
    type BetrayalCore,
} from '../../src/games/betrayal/game';
import { BETRAYAL_COMMANDS } from '../../src/games/betrayal/commands';
import {
    resolveBetrayalMonsterMoveTargetRooms,
    resolveBetrayalMonsterMovementGroups,
} from '../../src/games/betrayal/monsterActionReadModel';
import {
    applyBetrayalCommand,
    createBetrayalScriptedRandom,
    createStartedFirstScenarioCore,
} from '../../src/games/betrayal/testing/firstScenarioTestUtils';
import {
    assertNoFatalFrontendErrors,
    attachPageDiagnostics,
} from '../helpers/common';
import {
    createFirstScenarioHauntRuntimeCore,
    initBetrayalContext,
    injectCore,
    saveScreenshot,
    setHarnessRandomQueue,
    waitForBetrayalPageReady,
    warmBetrayalFrontend,
} from './betrayalTestHelpers';

const EVIDENCE_DIR = 'evidence/山屋惊魂-石像小天使怪物定义真实入口';
const SETUP_PLACEMENT_SCREENSHOT = `${EVIDENCE_DIR}/00a-顽石之血setup一层石像小天使.jpg`;
const SETUP_UPPER_FLOOR_SCREENSHOT = `${EVIDENCE_DIR}/00b-顽石之血setup上层石像小天使.jpg`;
const LINE_OF_SIGHT_SCREENSHOT = `${EVIDENCE_DIR}/01-石像小天使视线内不开移动骰.jpg`;
const ROLL_RESULT_SCREENSHOT = `${EVIDENCE_DIR}/02-石像小天使移动骰结果.jpg`;
const MOVE_READY_SCREENSHOT = `${EVIDENCE_DIR}/03-石像小天使移动入口.jpg`;
const TARGET_SCREENSHOT = `${EVIDENCE_DIR}/04-石像小天使目标房间高亮.jpg`;
const MOVED_SCREENSHOT = `${EVIDENCE_DIR}/05-石像小天使进入视线后停步.jpg`;
const GAZE_DAMAGE_SCREENSHOT = `${EVIDENCE_DIR}/06-石像小天使怪物回合结束凝视伤害.jpg`;
const HERO_NEW_LINE_OF_SIGHT_DAMAGE_SCREENSHOT = `${EVIDENCE_DIR}/07-英雄进入石像小天使新视线伤害.jpg`;
const GAZE_MULTI_HERO_FIRST_DAMAGE_SCREENSHOT = `${EVIDENCE_DIR}/17-石像小天使凝视-第一名英雄分配.jpg`;
const GAZE_MULTI_HERO_SECOND_DAMAGE_SCREENSHOT = `${EVIDENCE_DIR}/18-石像小天使凝视-第二名英雄接续分配.jpg`;
const GAZE_MULTI_HERO_DONE_SCREENSHOT = `${EVIDENCE_DIR}/19-石像小天使凝视-连续分配完成.jpg`;
const PEEKABOO_SAME_ROOM_SCREENSHOT = `${EVIDENCE_DIR}/08-玩躲猫猫选择同房石像小天使.jpg`;
const PEEKABOO_LINE_OF_SIGHT_SCREENSHOT = `${EVIDENCE_DIR}/09-玩躲猫猫选择视线内石像小天使.jpg`;
const PEEKABOO_SUCCESS_SCREENSHOT = `${EVIDENCE_DIR}/10-玩躲猫猫成功移除石像小天使.jpg`;
const PEEKABOO_HERO_ENDGAME_SCREENSHOT = `${EVIDENCE_DIR}/11-玩躲猫猫移除最后两只后英雄终局.jpg`;
const PEEKABOO_HAUNT_DAMAGE_SCREENSHOT = `${EVIDENCE_DIR}/12-玩躲猫猫失败全灭前伤害分配.jpg`;
const PEEKABOO_HAUNT_ENDGAME_SCREENSHOT = `${EVIDENCE_DIR}/13-玩躲猫猫失败全灭后作祟终局.jpg`;
const SETUP_PLAYER_CHOICE_READY_SCREENSHOT = `${EVIDENCE_DIR}/14-顽石之血setup-需要补放石像房间.jpg`;
const SETUP_PLAYER_CHOICE_SELECTING_SCREENSHOT = `${EVIDENCE_DIR}/15-顽石之血setup-房间高亮选择中.jpg`;
const SETUP_PLAYER_CHOICE_DONE_SCREENSHOT = `${EVIDENCE_DIR}/16-顽石之血setup-补放完成石像出现.jpg`;
const SETUP_MULTI_GAP_SAME_ROOM_SELECTING_SCREENSHOT = `${EVIDENCE_DIR}/20-顽石之血setup-多缺口同房重复选择中.jpg`;
const SETUP_MULTI_GAP_SAME_ROOM_DONE_SCREENSHOT = `${EVIDENCE_DIR}/21-顽石之血setup-同房重复补放完成.jpg`;
const NATURAL_TURN_BEFORE_REVEALER_END_SCREENSHOT = `${EVIDENCE_DIR}/22-石像小天使自然回合-英雄结束回合前.jpg`;
const NATURAL_TURN_MONSTER_ACTIONS_SCREENSHOT = `${EVIDENCE_DIR}/23-石像小天使自然回合-怪物动作槽.jpg`;
const NATURAL_TURN_AFTER_GAZE_SCREENSHOT = `${EVIDENCE_DIR}/24-石像小天使自然回合-凝视后下一玩家.jpg`;
const HUMAN_PLAYER_TEST_URL = '/play/betrayal?players=3&playerID=0&seat0=human&seat1=human&seat2=human';
const HUMAN_PLAYER_ONE_TEST_URL = '/play/betrayal?players=3&playerID=1&seat0=human&seat1=human&seat2=human';
const humanPlayerTestUrl = (playerId: string): string => (
    `/play/betrayal?players=3&playerID=${playerId}&seat0=human&seat1=human&seat2=human`
);
const STONE_CHERUB_ID = 'stone-cherub-1';
const PEEKABOO_SAME_ROOM_CHERUB_ID = 'stone-cherub-same-room';
const PEEKABOO_LINE_OF_SIGHT_CHERUB_ID = 'stone-cherub-in-sight';
const PEEKABOO_SPARED_CHERUB_ID = 'stone-cherub-spared';
const HERO_LINE_OF_SIGHT_ROOM_ID = 'entrance-hall';
const STONE_CHERUB_APPROACH_ROOM_ID = 'ground-north';
const STONE_CHERUB_STOP_ROOM_ID = 'hallway';
const STONE_CHERUB_GROUP_ID = '石像小天使:4';

type StoneCherubFixture = {
    core: BetrayalCore;
    targetRoomId: string;
    targetRoomName: string;
};

type StoneCherubState = {
    currentPlayer?: string;
    phase?: string;
    traitorPlayerId?: string | null;
    monsterIds?: string[];
    monsterName?: string | null;
    monsterRoomId?: string | null;
    movementGroups?: string[];
    rolledMovementGroups?: string[];
    moveRemaining?: number | null;
    recentRollTitle?: string | null;
    pendingDamageAllocation?: {
        playerId?: string;
        sourceTitle?: string;
        damageKind?: string;
        amount?: number;
        nextDamageAllocationCount?: number;
    } | null;
    bloodFromStoneMonsterTurn?: {
        active?: boolean;
        controllerPlayerId?: string | null;
        monsterTurnAfterPlayerId?: string | null;
    } | null;
    endgameResult?: {
        hauntId?: string;
        hauntTitle?: string;
        outcome?: string;
        winners?: string[];
        survivorsEscaped?: string[];
        traitorPlayerId?: string;
    } | null;
};

type StoneCherubSetupState = {
    currentPlayer?: string;
    phase?: string;
    hauntCardNumber?: number | null;
    traitorPlayerId?: string | null;
    setupManualCheckEntryIds?: string[];
    monsterPlacements?: Array<{
        id: string;
        name: string;
        roomId: string | null;
    }>;
};

const activateExplorer = (core: BetrayalCore, playerId: string): BetrayalCore => {
    const explorers = [core.currentExplorer, ...core.otherExplorers].map((explorer) => ({
        ...explorer,
        traits: { ...explorer.traits },
        traitTracks: Object.fromEntries(
            Object.entries(explorer.traitTracks).map(([trait, track]) => [
                trait,
                { ...track, values: [...track.values] },
            ]),
        ) as BetrayalCore['currentExplorer']['traitTracks'],
        inventory: explorer.inventory.map((card) => ({ ...card })),
    }));
    const active = explorers.find((explorer) => explorer.playerId === playerId);
    if (!active) {
        throw new Error(`山屋石像小天使 E2E 夹具缺少玩家 ${playerId}`);
    }
    core.currentPlayer = playerId;
    core.currentExplorer = active;
    core.otherExplorers = explorers.filter((explorer) => explorer.playerId !== playerId);
    core.activeRoomId = active.roomId;
    core.currentExplorerRoomId = active.roomId;
    core.currentExplorerTraits = { ...active.traits };
    core.currentExplorerInventory = active.inventory.map((card) => ({ ...card }));
    core.turnStartInventoryCardIds = active.inventory.map((card) => card.id);
    return core;
};

const activateBloodFromStoneMonsterTurn = (core: BetrayalCore, controllerPlayerId = '0'): BetrayalCore => {
    activateExplorer(core, controllerPlayerId);
    core.scenarioRuntime.hauntCardNumber = 5;
    core.scenarioRuntime.traitorPlayerId = null;
    core.scenarioRuntime.bloodFromStone = {
        monsterTurnAfterPlayerId: controllerPlayerId,
        activeMonsterTurn: true,
        monsterTurnControllerPlayerId: controllerPlayerId,
    };
    core.activePlayerId = controllerPlayerId;
    core.recommendedAction = 'endTurn';
    return core;
};

const setHighCapacityGeneralDamageTracks = (core: BetrayalCore, playerId: string): void => {
    const explorers = [core.currentExplorer, ...core.otherExplorers];
    const explorer = explorers.find((candidate) => candidate.playerId === playerId);
    if (!explorer) {
        throw new Error(`山屋石像小天使 E2E 夹具缺少玩家 ${playerId}`);
    }
    const values = Array.from({ length: 18 }, () => 4);
    for (const trait of ['might', 'speed', 'knowledge', 'sanity'] as const) {
        explorer.traitTracks[trait] = {
            trackId: `stone-cherub-e2e-${playerId}-${trait}`,
            values: [...values],
            position: 14,
            startPosition: 14,
            criticalPosition: 0,
            skullPosition: -1,
            maxPosition: values.length - 1,
        };
        explorer.traits[trait] = 4;
    }
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
};
const placeExplorersInRoom = (core: BetrayalCore, roomId: string): void => {
    core.currentExplorer = {
        ...core.currentExplorer,
        roomId,
    };
    core.otherExplorers = core.otherExplorers.map((explorer) => ({
        ...explorer,
        roomId,
    }));
    core.activeRoomId = roomId;
    core.currentExplorerRoomId = roomId;
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.currentExplorerInventory = core.currentExplorer.inventory.map((card) => ({ ...card }));
    core.turnStartInventoryCardIds = core.currentExplorer.inventory.map((card) => card.id);
};

const createStoneCherubBaseCore = (): BetrayalCore => {
    let core = createFirstScenarioHauntRuntimeCore();
    core.scenarioRuntime.hauntCardNumber = 5;
    core.scenarioRuntime.traitorPlayerId = null;
    core.scenarioRuntime.deadExplorerPlayerIds = [];
    core = activateExplorer(core, '0');
    core.pendingDamageAllocation = null;
    core.recommendedAction = 'use';
    core.recentRoll = null;
    core.latestDiscovery = null;
    core.latestDiscoveryOwnerPlayerId = null;
    return core;
};

const createStoneCherubInLineOfSightCore = (): BetrayalCore => {
    const core = createStoneCherubBaseCore();
    placeExplorersInRoom(core, HERO_LINE_OF_SIGHT_ROOM_ID);
    core.monsters = [
        createBetrayalMonsterFromDefinition(
            'blood-from-stone-stone-cherub',
            STONE_CHERUB_ID,
            HERO_LINE_OF_SIGHT_ROOM_ID,
        ),
    ];
    core.scenarioRuntime.monsterTurn = {
        ...core.scenarioRuntime.monsterTurn,
        resolvedStartMonsterIds: [STONE_CHERUB_ID],
        skippedMonsterIdsThisTurn: [STONE_CHERUB_ID],
        attackedMonsterIdsThisTurn: [],
        movementRollsByGroupId: {},
        moveRemainingById: {},
    };

    const movementGroups = resolveBetrayalMonsterMovementGroups(core).map((group) => group.groupId);
    expect(movementGroups).toEqual([]);
    activateBloodFromStoneMonsterTurn(core, '0');
    return core;
};

const createStoneCherubApproachCore = (): StoneCherubFixture => {
    const core = createStoneCherubBaseCore();
    placeExplorersInRoom(core, HERO_LINE_OF_SIGHT_ROOM_ID);
    core.monsters = [
        createBetrayalMonsterFromDefinition(
            'blood-from-stone-stone-cherub',
            STONE_CHERUB_ID,
            STONE_CHERUB_APPROACH_ROOM_ID,
        ),
    ];
    core.scenarioRuntime.monsterTurn = {
        ...core.scenarioRuntime.monsterTurn,
        resolvedStartMonsterIds: [STONE_CHERUB_ID],
        skippedMonsterIdsThisTurn: [],
        attackedMonsterIdsThisTurn: [],
        movementRollsByGroupId: {},
        moveRemainingById: {},
    };

    const movementGroups = resolveBetrayalMonsterMovementGroups(core).map((group) => group.groupId);
    expect(movementGroups).toEqual([STONE_CHERUB_GROUP_ID]);
    const targetRoom = resolveBetrayalMonsterMoveTargetRooms(core, STONE_CHERUB_ID)
        .find((room) => room.id === STONE_CHERUB_STOP_ROOM_ID);
    if (!targetRoom) {
        throw new Error('山屋石像小天使 E2E 夹具缺少进入英雄视线的移动目标房间');
    }
    activateBloodFromStoneMonsterTurn(core, '0');
    return {
        core,
        targetRoomId: targetRoom.id,
        targetRoomName: targetRoom.name,
    };
};

const createHeroNewLineOfSightCore = (): BetrayalCore => {
    const core = createStoneCherubBaseCore();
    placeExplorersInRoom(core, STONE_CHERUB_APPROACH_ROOM_ID);
    core.recommendedAction = 'move';
    core.turnStartSpeed = 6;
    core.movesRemaining = 6;
    setHighCapacityGeneralDamageTracks(core, '0');
    core.monsters = [
        createBetrayalMonsterFromDefinition(
            'blood-from-stone-stone-cherub',
            STONE_CHERUB_ID,
            HERO_LINE_OF_SIGHT_ROOM_ID,
        ),
    ];
    core.scenarioRuntime.bloodFromStoneTurnStartVisibleStoneCherubIdsByPlayerId = { '0': [] };
    core.scenarioRuntime.bloodFromStoneNewLineOfSightDamagePlayerIdsThisTurn = [];
    return core;
};

const createStoneCherubMultiHeroGazeCore = (): BetrayalCore => {
    const core = createStoneCherubBaseCore();
    core.currentExplorer = {
        ...core.currentExplorer,
        roomId: HERO_LINE_OF_SIGHT_ROOM_ID,
    };
    core.otherExplorers = core.otherExplorers.map((explorer) => {
        if (explorer.playerId === '1') {
            return { ...explorer, roomId: HERO_LINE_OF_SIGHT_ROOM_ID };
        }
        if (explorer.playerId === '2') {
            return { ...explorer, roomId: 'basement-landing' };
        }
        return explorer;
    });
    core.activeRoomId = HERO_LINE_OF_SIGHT_ROOM_ID;
    core.currentExplorerRoomId = HERO_LINE_OF_SIGHT_ROOM_ID;
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.currentExplorerInventory = core.currentExplorer.inventory.map((card) => ({ ...card }));
    setHighCapacityGeneralDamageTracks(core, '0');
    setHighCapacityGeneralDamageTracks(core, '1');
    core.monsters = [
        createBetrayalMonsterFromDefinition(
            'blood-from-stone-stone-cherub',
            STONE_CHERUB_ID,
            HERO_LINE_OF_SIGHT_ROOM_ID,
        ),
        createBetrayalMonsterFromDefinition(
            'blood-from-stone-stone-cherub',
            'stone-cherub-2',
            STONE_CHERUB_STOP_ROOM_ID,
        ),
    ];
    core.scenarioRuntime.monsterTurn = {
        ...core.scenarioRuntime.monsterTurn,
        resolvedStartMonsterIds: [STONE_CHERUB_ID, 'stone-cherub-2'],
        skippedMonsterIdsThisTurn: [STONE_CHERUB_ID, 'stone-cherub-2'],
        attackedMonsterIdsThisTurn: [],
        movementRollsByGroupId: {},
        moveRemainingById: {},
    };
    activateBloodFromStoneMonsterTurn(core, '0');
    return core;
};

const setDiscoveredBloodFromStoneSetupRoom = (
    core: BetrayalCore,
    roomId: string,
    overrides: Partial<BetrayalCore['rooms'][number]>,
): void => {
    core.rooms = core.rooms.map((room) => (
        room.id === roomId
            ? {
                ...room,
                state: 'discovered',
                ...overrides,
            }
            : room
    ));
};

const seedBloodFromStoneSetupTrigger = (core: BetrayalCore): void => {
    core.proposedScenarioCardId = 'blood-from-a-stone';
    core.drawOrder = ['omen'];
    core.possessionOrderByKind.omen = [
        { id: 'mask', name: 'Mask', kind: 'omen' },
    ];
    core.currentExplorer.inventory = [
        { id: 'omen-book', name: '书本', kind: 'omen' },
        { id: 'dog', name: '狗', kind: 'omen' },
        { id: 'skull', name: '头骨', kind: 'omen' },
        { id: 'ring', name: '指环', kind: 'omen' },
    ];
    core.currentExplorerInventory = [...core.currentExplorer.inventory];
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
};

const createBloodFromStoneSetupPlacementCore = (): BetrayalCore => {
    let core = createStartedFirstScenarioCore(['0', '1', '2']);
    setDiscoveredBloodFromStoneSetupRoom(core, 'ground-north', {
        name: '北侧房间',
        hint: '顽石之血 setup E2E 用视线外房间。',
        tags: ['测试', '一层'],
        discoveryReward: null,
        visualId: 'study',
    });
    setDiscoveredBloodFromStoneSetupRoom(core, 'ground-south', {
        name: '南侧房间',
        hint: '顽石之血 setup E2E 用视线外房间。',
        tags: ['测试', '一层'],
        discoveryReward: null,
        visualId: 'gallery',
    });
    seedBloodFromStoneSetupTrigger(core);

    core = applyBetrayalCommand(
        core,
        BETRAYAL_COMMANDS.EXPLORE_ROOM,
        '0',
        { roomId: 'ground-east' },
        100,
        createBetrayalScriptedRandom(3, 3, 3, 3, 3),
    );

    return core;
};

const createBloodFromStoneNaturalMonsterTurnCore = (): BetrayalCore => {
    const core = createBloodFromStoneSetupPlacementCore();
    core.latestDiscovery = null;
    core.latestDiscoveryOwnerPlayerId = null;
    core.pendingCardResolutionQueue = [];
    core.pendingDamageAllocation = null;
    core.recentRoll = null;
    core.recommendedAction = 'endTurn';
    for (const playerId of ['0', '1', '2']) {
        setHighCapacityGeneralDamageTracks(core, playerId);
    }
    return core;
};

const createBloodFromStoneSetupManualChoiceCore = (): BetrayalCore => {
    let core = createStartedFirstScenarioCore(['0', '1', '2']);
    seedBloodFromStoneSetupTrigger(core);
    core.rooms = core.rooms.map((room) => (
        room.id === 'upper-west'
            ? {
                ...room,
                state: 'unexplored',
                name: '未探索',
            }
            : room
    ));

    core = applyBetrayalCommand(
        core,
        BETRAYAL_COMMANDS.EXPLORE_ROOM,
        '0',
        { roomId: 'ground-east' },
        100,
        createBetrayalScriptedRandom(3, 3, 3, 3, 3),
    );
    core.latestDiscovery = null;
    core.latestDiscoveryOwnerPlayerId = null;
    core.pendingCardResolutionQueue = [];
    core.recentRoll = null;
    return core;
};

const createBloodFromStoneSetupMultiGapManualChoiceCore = (): BetrayalCore => {
    let core = createStartedFirstScenarioCore(['0', '1', '2']);
    seedBloodFromStoneSetupTrigger(core);
    core.rooms = core.rooms.map((room) => (
        room.id === 'upper-west' || room.id === 'basement-landing'
            ? {
                ...room,
                state: 'unexplored',
                name: '未探索',
            }
            : room
    ));

    core = applyBetrayalCommand(
        core,
        BETRAYAL_COMMANDS.EXPLORE_ROOM,
        '0',
        { roomId: 'ground-east' },
        100,
        createBetrayalScriptedRandom(3, 3, 3, 3, 3),
    );
    core.latestDiscovery = null;
    core.latestDiscoveryOwnerPlayerId = null;
    core.pendingCardResolutionQueue = [];
    core.recentRoll = null;
    return core;
};

const createStoneCherubPeekabooCore = (): BetrayalCore => {
    const core = createStoneCherubBaseCore();
    placeExplorersInRoom(core, HERO_LINE_OF_SIGHT_ROOM_ID);
    core.currentExplorer.inventory = [{ id: 'mirror', name: 'Mirror', kind: 'item' }];
    core.currentExplorer.traitTracks.knowledge = {
        trackId: 'stone-cherub-e2e-peekaboo-knowledge',
        values: [1, 1, 1],
        position: 1,
        startPosition: 1,
        criticalPosition: 0,
        skullPosition: -1,
        maxPosition: 2,
    };
    core.currentExplorer.traits.knowledge = 1;
    core.currentExplorerInventory = core.currentExplorer.inventory.map((card) => ({ ...card }));
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.turnStartInventoryCardIds = core.currentExplorer.inventory.map((card) => card.id);
    core.monsters = [
        createBetrayalMonsterFromDefinition(
            'blood-from-stone-stone-cherub',
            PEEKABOO_SAME_ROOM_CHERUB_ID,
            HERO_LINE_OF_SIGHT_ROOM_ID,
        ),
        createBetrayalMonsterFromDefinition(
            'blood-from-stone-stone-cherub',
            PEEKABOO_LINE_OF_SIGHT_CHERUB_ID,
            STONE_CHERUB_STOP_ROOM_ID,
        ),
        createBetrayalMonsterFromDefinition(
            'blood-from-stone-stone-cherub',
            PEEKABOO_SPARED_CHERUB_ID,
            'basement-landing',
        ),
    ];
    return core;
};

const createStoneCherubPeekabooLastPairCore = (): BetrayalCore => {
    const core = createStoneCherubPeekabooCore();
    core.monsters = core.monsters.filter((monster) => monster.id !== PEEKABOO_SPARED_CHERUB_ID);
    return core;
};

const createStoneCherubPeekabooLastHeroCore = (): BetrayalCore => {
    const core = createStoneCherubPeekabooLastPairCore();
    core.currentExplorer.inventory = [];
    core.currentExplorerInventory = [];
    core.turnStartInventoryCardIds = [];
    core.scenarioRuntime.deadExplorerPlayerIds = ['1', '2'];
    for (const trait of ['might', 'speed', 'knowledge', 'sanity'] as const) {
        core.currentExplorer.traitTracks[trait] = {
            trackId: `stone-cherub-e2e-last-hero-${trait}`,
            values: [1],
            position: 0,
            startPosition: 0,
            criticalPosition: 0,
            skullPosition: -1,
            maxPosition: 0,
        };
        core.currentExplorer.traits[trait] = 1;
    }
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    return core;
};

const readStoneCherubState = async (page: Page): Promise<StoneCherubState> =>
    page.evaluate(({ monsterId, groupId }) => {
        const state = (window as typeof window & {
            __BG_TEST_HARNESS__?: {
                state?: {
                    get?: () => {
                        core?: {
                            currentPlayer?: string;
                            phase?: string;
                            monsters?: Array<{ id: string; name: string; roomId: string | null }>;
                            recentRoll?: { sourceTitle?: string | null } | null;
                            pendingDamageAllocation?: {
                                playerId?: string;
                                sourceTitle?: string;
                                damageKind?: string;
                                amount?: number;
                                nextDamageAllocations?: unknown[];
                            } | null;
                            scenarioRuntime?: {
                                traitorPlayerId?: string | null;
                                bloodFromStone?: {
                                    activeMonsterTurn?: boolean;
                                    monsterTurnControllerPlayerId?: string | null;
                                    monsterTurnAfterPlayerId?: string | null;
                                };
                                monsterTurn?: {
                                    movementRollsByGroupId?: Record<string, { monsterIds?: string[] }>;
                                    moveRemainingById?: Record<string, number>;
                                };
                            };
                            endgameResult?: {
                                hauntId?: string;
                                hauntTitle?: string;
                                outcome?: string;
                                winners?: string[];
                                survivorsEscaped?: string[];
                                traitorPlayerId?: string;
                            } | null;
                        };
                    };
                };
            };
        }).__BG_TEST_HARNESS__?.state?.get?.();
        const core = state?.core;
        const monster = core?.monsters?.find((candidate) => candidate.id === monsterId);
        const rolledMovementGroups = Object.keys(core?.scenarioRuntime?.monsterTurn?.movementRollsByGroupId ?? {});
        return {
            currentPlayer: core?.currentPlayer,
            phase: core?.phase,
            traitorPlayerId: core?.scenarioRuntime?.traitorPlayerId ?? null,
            monsterIds: core?.monsters?.map((candidate) => candidate.id) ?? [],
            monsterName: monster?.name ?? null,
            monsterRoomId: monster?.roomId ?? null,
            movementGroups: [groupId],
            rolledMovementGroups,
            moveRemaining: core?.scenarioRuntime?.monsterTurn?.moveRemainingById?.[monsterId] ?? null,
            recentRollTitle: core?.recentRoll?.sourceTitle ?? null,
            pendingDamageAllocation: core?.pendingDamageAllocation
                ? {
                    playerId: core.pendingDamageAllocation.playerId,
                    sourceTitle: core.pendingDamageAllocation.sourceTitle,
                    damageKind: core.pendingDamageAllocation.damageKind,
                    amount: core.pendingDamageAllocation.amount,
                    nextDamageAllocationCount: core.pendingDamageAllocation.nextDamageAllocations?.length ?? 0,
                }
                : null,
            bloodFromStoneMonsterTurn: core?.scenarioRuntime?.bloodFromStone
                ? {
                    active: core.scenarioRuntime.bloodFromStone.activeMonsterTurn,
                    controllerPlayerId: core.scenarioRuntime.bloodFromStone.monsterTurnControllerPlayerId,
                    monsterTurnAfterPlayerId: core.scenarioRuntime.bloodFromStone.monsterTurnAfterPlayerId,
                }
                : null,
            endgameResult: core?.endgameResult
                ? {
                    hauntId: core.endgameResult.hauntId,
                    hauntTitle: core.endgameResult.hauntTitle,
                    outcome: core.endgameResult.outcome,
                    winners: [...core.endgameResult.winners],
                    survivorsEscaped: [...core.endgameResult.survivorsEscaped],
                    traitorPlayerId: core.endgameResult.traitorPlayerId,
                }
                : null,
        };
    }, { monsterId: STONE_CHERUB_ID, groupId: STONE_CHERUB_GROUP_ID });

const readStoneCherubSetupState = async (page: Page): Promise<StoneCherubSetupState> =>
    page.evaluate(() => {
        const state = (window as typeof window & {
            __BG_TEST_HARNESS__?: {
                state?: {
                    get?: () => {
                        core?: {
                            currentPlayer?: string;
                            phase?: string;
                            monsters?: Array<{ id: string; name: string; roomId: string | null }>;
                            scenarioRuntime?: {
                                hauntCardNumber?: number | null;
                                traitorPlayerId?: string | null;
                                hauntSetupQueue?: Array<{ id: string; status: string }>;
                            };
                        };
                    };
                };
            };
        }).__BG_TEST_HARNESS__?.state?.get?.();
        const core = state?.core;
        return {
            currentPlayer: core?.currentPlayer,
            phase: core?.phase,
            hauntCardNumber: core?.scenarioRuntime?.hauntCardNumber ?? null,
            traitorPlayerId: core?.scenarioRuntime?.traitorPlayerId ?? null,
            setupManualCheckEntryIds: (core?.scenarioRuntime?.hauntSetupQueue ?? [])
                .filter((entry) => entry.status === 'manual-check')
                .map((entry) => entry.id),
            monsterPlacements: (core?.monsters ?? []).map((monster) => ({
                id: monster.id,
                name: monster.name,
                roomId: monster.roomId,
            })),
        };
    });

const readBetrayalCoreFromPage = async (page: Page): Promise<BetrayalCore> =>
    page.evaluate(() => {
        const snapshot = (window as typeof window & {
            __BG_TEST_HARNESS__?: {
                state?: {
                    get?: () => {
                        core?: BetrayalCore;
                    };
                };
            };
        }).__BG_TEST_HARNESS__?.state?.get?.();
        if (!snapshot?.core) {
            throw new Error('山屋石像小天使 E2E 未能读取当前 core 状态');
        }
        return snapshot.core;
    });

const closeRecentRollPanel = async (page: Page) => {
    const rollPanel = page.getByTestId('betrayal-recent-roll-panel');
    await expect(rollPanel).toBeVisible();
    await page.getByTestId('betrayal-roll-continue').click();
    await expect(rollPanel).toHaveCount(0);
};

const selectPeekabooStoneCherubs = async (page: Page) => {
    const peekabooAction = page.getByTestId('betrayal-action-use');
    const sameRoomCherub = page.getByTestId(
        `betrayal-room-monster-${HERO_LINE_OF_SIGHT_ROOM_ID}-${PEEKABOO_SAME_ROOM_CHERUB_ID}`,
    );
    const lineOfSightCherub = page.getByTestId(
        `betrayal-room-monster-${STONE_CHERUB_STOP_ROOM_ID}-${PEEKABOO_LINE_OF_SIGHT_CHERUB_ID}`,
    );

    await expect(peekabooAction).toBeVisible();
    await expect(peekabooAction).toContainText('玩躲猫猫');
    await peekabooAction.click();
    await expect(sameRoomCherub).toHaveAttribute('data-direct-target', 'true');
    await sameRoomCherub.click();
    await expect(lineOfSightCherub).toHaveAttribute('data-direct-target', 'true');
    return lineOfSightCherub;
};

const resolveDamageAllocationWith = async (page: Page, traits: string[]) => {
    for (const trait of traits) {
        await page.getByTestId(`betrayal-damage-allocation-trait-${trait}`).click();
    }
    const confirmButton = page.getByTestId('betrayal-damage-allocation-confirm');
    await expect(confirmButton).toBeEnabled();
    await confirmButton.click();
};

const openPlayerPageWithCore = async (page: Page, playerId: string, core: BetrayalCore): Promise<void> => {
    await page.goto(humanPlayerTestUrl(playerId), { waitUntil: 'domcontentloaded' });
    await waitForBetrayalPageReady(page);
    await injectCore(page, core);
    await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });
};

const resolveAllPendingDamageAllocations = async (page: Page): Promise<void> => {
    for (let index = 0; index < 10; index += 1) {
        const core = await readBetrayalCoreFromPage(page);
        const pending = core.pendingDamageAllocation;
        if (!pending) {
            return;
        }
        await openPlayerPageWithCore(page, pending.playerId, core);
        await expect(page.getByTestId('betrayal-damage-allocation-panel')).toBeVisible();
        const amount = Math.max(0, pending.amount ?? 0);
        const traitCycle = ['might', 'speed', 'knowledge', 'sanity'];
        await resolveDamageAllocationWith(
            page,
            Array.from({ length: amount }, (_, traitIndex) => traitCycle[traitIndex % traitCycle.length]),
        );
    }
    throw new Error('石像小天使 E2E 凝视伤害队列超过预期长度');
};

test.describe('山屋惊魂石像小天使怪物定义真实入口', () => {
    test('顽石之血 setup 触发后会按探索者位置和视线外优先规则全量放置石像小天使', async ({ page, context }) => {
        test.setTimeout(120000);
        await initBetrayalContext(context);
        const diagnostics = attachPageDiagnostics(page, 'betrayal-stone-cherub-setup-placement');
        const core = createBloodFromStoneSetupPlacementCore();

        await page.setViewportSize({ width: 1600, height: 900 });
        await warmBetrayalFrontend(context);
        await page.goto(HUMAN_PLAYER_TEST_URL, { waitUntil: 'domcontentloaded' });
        await waitForBetrayalPageReady(page);

        await injectCore(page, core);
        await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });
        await expect.poll(async () => {
            const setupState = await readStoneCherubSetupState(page);
            return setupState.monsterPlacements?.length ?? 0;
        }).toBe(6);

        const setupState = await readStoneCherubSetupState(page);
        expect(setupState).toMatchObject({
            currentPlayer: '1',
            phase: 'haunt',
            hauntCardNumber: 5,
            traitorPlayerId: null,
            setupManualCheckEntryIds: ['monster-card-left-of-revealer'],
            monsterPlacements: expect.arrayContaining([
                { id: 'stone-cherub-explorer-0', name: '石像小天使', roomId: 'ground-east' },
                { id: 'stone-cherub-explorer-1', name: '石像小天使', roomId: 'entrance-hall' },
                { id: 'stone-cherub-explorer-2', name: '石像小天使', roomId: 'entrance-hall' },
                { id: 'stone-cherub-extra-1', name: '石像小天使', roomId: 'ground-north' },
                { id: 'stone-cherub-extra-2', name: '石像小天使', roomId: 'ground-south' },
                { id: 'stone-cherub-extra-3', name: '石像小天使', roomId: 'upper-west' },
            ]),
        });

        for (const placement of (setupState.monsterPlacements ?? []).filter((item) => item.roomId !== 'upper-west')) {
            await expect(page.getByTestId(`betrayal-room-monster-${placement.roomId}-${placement.id}`)).toBeVisible();
        }
        await expect(page.getByTestId('betrayal-action-monsterMovementRoll')).toHaveCount(0);
        await saveScreenshot(page, SETUP_PLACEMENT_SCREENSHOT);
        await page.getByRole('button', { name: '切到上一层' }).click();
        await expect(page.getByTestId('betrayal-room-monster-upper-west-stone-cherub-extra-3')).toBeVisible();
        await saveScreenshot(page, SETUP_UPPER_FLOOR_SCREENSHOT);

        assertNoFatalFrontendErrors([{ label: 'betrayal-stone-cherub-setup-placement', diagnostics }]);
    });

    test('顽石之血 setup 视线外房间不足时玩家必须在真实房间补放石像小天使', async ({ page, context }) => {
        test.setTimeout(120000);
        await initBetrayalContext(context);
        const diagnostics = attachPageDiagnostics(page, 'betrayal-stone-cherub-setup-player-choice');
        const core = createBloodFromStoneSetupManualChoiceCore();

        await page.setViewportSize({ width: 1600, height: 900 });
        await warmBetrayalFrontend(context);
        await page.goto(HUMAN_PLAYER_ONE_TEST_URL, { waitUntil: 'domcontentloaded' });
        await waitForBetrayalPageReady(page);

        await injectCore(page, core);
        await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });
        await expect.poll(() => readStoneCherubSetupState(page)).toMatchObject({
            currentPlayer: '1',
            phase: 'haunt',
            hauntCardNumber: 5,
            traitorPlayerId: null,
            setupManualCheckEntryIds: ['place-additional-stone-cherubs', 'monster-card-left-of-revealer'],
        });

        const placementAction = page.getByTestId('betrayal-action-bloodFromStoneSetupPlacement');
        await expect(placementAction).toBeVisible();
        await expect(placementAction).toContainText('选择石像房间');
        await expect(page.getByTestId('betrayal-action-explore')).toHaveCount(0);
        await saveScreenshot(page, SETUP_PLAYER_CHOICE_READY_SCREENSHOT);

        await placementAction.click();
        const entranceHallTarget = page.getByTestId('betrayal-room-blood-from-stone-setup-target-entrance-hall');
        await expect(entranceHallTarget).toBeVisible();
        await expect(entranceHallTarget).toHaveAttribute('data-blood-from-stone-setup-selectable', 'true');
        await expect(page.getByTestId('betrayal-room-entrance-hall')).toHaveAttribute(
            'data-direct-action',
            'blood-from-stone-setup-placement',
        );
        await saveScreenshot(page, SETUP_PLAYER_CHOICE_SELECTING_SCREENSHOT);

        await page.getByTestId('betrayal-room-entrance-hall').click();
        await expect(page.getByTestId('betrayal-room-blood-from-stone-setup-count-entrance-hall')).toContainText('×1');
        const confirmAction = page.getByTestId('betrayal-action-bloodFromStoneConfirmSetupPlacement');
        await expect(confirmAction).toBeEnabled();
        await confirmAction.click();

        await expect(page.getByTestId('betrayal-room-monster-entrance-hall-stone-cherub-extra-3')).toBeVisible();
        await expect.poll(() => readStoneCherubSetupState(page)).toMatchObject({
            setupManualCheckEntryIds: ['monster-card-left-of-revealer'],
            monsterPlacements: expect.arrayContaining([
                { id: 'stone-cherub-extra-3', name: '石像小天使', roomId: 'entrance-hall' },
            ]),
        });
        await saveScreenshot(page, SETUP_PLAYER_CHOICE_DONE_SCREENSHOT);

        assertNoFatalFrontendErrors([{ label: 'betrayal-stone-cherub-setup-player-choice', diagnostics }]);
    });

    test('顽石之血 setup 多缺口时玩家可以重复点击同一真实房间补放石像小天使', async ({ page, context }) => {
        test.setTimeout(120000);
        await initBetrayalContext(context);
        const diagnostics = attachPageDiagnostics(page, 'betrayal-stone-cherub-setup-multi-gap-same-room');
        const core = createBloodFromStoneSetupMultiGapManualChoiceCore();

        await page.setViewportSize({ width: 1600, height: 900 });
        await warmBetrayalFrontend(context);
        await page.goto(HUMAN_PLAYER_ONE_TEST_URL, { waitUntil: 'domcontentloaded' });
        await waitForBetrayalPageReady(page);

        await injectCore(page, core);
        await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });
        await expect.poll(() => readStoneCherubSetupState(page)).toMatchObject({
            currentPlayer: '1',
            phase: 'haunt',
            hauntCardNumber: 5,
            traitorPlayerId: null,
            setupManualCheckEntryIds: ['place-additional-stone-cherubs', 'monster-card-left-of-revealer'],
        });

        const placementAction = page.getByTestId('betrayal-action-bloodFromStoneSetupPlacement');
        await expect(placementAction).toBeVisible();
        await expect(placementAction).toContainText('选择石像房间');
        await placementAction.click();

        const entranceHallRoom = page.getByTestId('betrayal-room-entrance-hall');
        const entranceHallTarget = page.getByTestId('betrayal-room-blood-from-stone-setup-target-entrance-hall');
        await expect(entranceHallTarget).toBeVisible();
        await expect(entranceHallTarget).toHaveAttribute('data-blood-from-stone-setup-selectable', 'true');
        await expect(entranceHallRoom).toHaveAttribute(
            'data-direct-action',
            'blood-from-stone-setup-placement',
        );

        await entranceHallRoom.click();
        await expect(page.getByTestId('betrayal-room-blood-from-stone-setup-count-entrance-hall')).toContainText('×1');
        await expect(entranceHallTarget).toHaveAttribute('data-blood-from-stone-setup-selectable', 'true');
        await entranceHallRoom.click();
        await expect(page.getByTestId('betrayal-room-blood-from-stone-setup-count-entrance-hall')).toContainText('×2');
        await expect(entranceHallTarget).toHaveAttribute('data-blood-from-stone-setup-selectable', 'false');

        const confirmAction = page.getByTestId('betrayal-action-bloodFromStoneConfirmSetupPlacement');
        await expect(confirmAction).toBeEnabled();
        await saveScreenshot(page, SETUP_MULTI_GAP_SAME_ROOM_SELECTING_SCREENSHOT);
        await confirmAction.click();

        await expect(page.getByTestId('betrayal-room-monster-entrance-hall-stone-cherub-extra-2')).toBeVisible();
        await expect(page.getByTestId('betrayal-room-monster-entrance-hall-stone-cherub-extra-3')).toBeVisible();
        await expect.poll(() => readStoneCherubSetupState(page)).toMatchObject({
            setupManualCheckEntryIds: ['monster-card-left-of-revealer'],
            monsterPlacements: expect.arrayContaining([
                { id: 'stone-cherub-extra-2', name: '石像小天使', roomId: 'entrance-hall' },
                { id: 'stone-cherub-extra-3', name: '石像小天使', roomId: 'entrance-hall' },
            ]),
        });
        await saveScreenshot(page, SETUP_MULTI_GAP_SAME_ROOM_DONE_SCREENSHOT);

        assertNoFatalFrontendErrors([{ label: 'betrayal-stone-cherub-setup-multi-gap-same-room', diagnostics }]);
    });

    test('石像小天使会在揭秘者结束回合后自然进入怪物回合并在凝视后交给下一玩家', async ({ page, context }) => {
        test.setTimeout(120000);
        await initBetrayalContext(context);
        const diagnostics = attachPageDiagnostics(page, 'betrayal-stone-cherub-natural-monster-turn');
        let core = createBloodFromStoneNaturalMonsterTurnCore();

        await page.setViewportSize({ width: 1600, height: 900 });
        await warmBetrayalFrontend(context);

        await openPlayerPageWithCore(page, '1', core);
        await expect.poll(() => readStoneCherubState(page)).toMatchObject({
            currentPlayer: '1',
            bloodFromStoneMonsterTurn: {
                active: false,
                controllerPlayerId: null,
                monsterTurnAfterPlayerId: '0',
            },
        });
        await page.getByTestId('betrayal-action-endTurn').click();
        await expect.poll(() => readStoneCherubState(page)).toMatchObject({
            currentPlayer: '2',
            bloodFromStoneMonsterTurn: {
                active: false,
                monsterTurnAfterPlayerId: '0',
            },
        });

        core = await readBetrayalCoreFromPage(page);
        await openPlayerPageWithCore(page, '2', core);
        await page.getByTestId('betrayal-action-endTurn').click();
        await expect.poll(() => readStoneCherubState(page)).toMatchObject({
            currentPlayer: '0',
            bloodFromStoneMonsterTurn: {
                active: false,
                monsterTurnAfterPlayerId: '0',
            },
        });

        core = await readBetrayalCoreFromPage(page);
        await openPlayerPageWithCore(page, '0', core);
        await expect(page.getByTestId('betrayal-action-endTurn')).toBeVisible();
        await expect(page.getByTestId('betrayal-action-bloodFromStoneMonsterTurnEnd')).toHaveCount(0);
        await saveScreenshot(page, NATURAL_TURN_BEFORE_REVEALER_END_SCREENSHOT);

        await page.getByTestId('betrayal-action-endTurn').click();
        await expect.poll(() => readStoneCherubState(page)).toMatchObject({
            currentPlayer: '0',
            bloodFromStoneMonsterTurn: {
                active: true,
                controllerPlayerId: '0',
                monsterTurnAfterPlayerId: '0',
            },
        });
        await expect(page.getByTestId('betrayal-action-monsterTurnStart')).toBeVisible();
        await saveScreenshot(page, NATURAL_TURN_MONSTER_ACTIONS_SCREENSHOT);

        core = await readBetrayalCoreFromPage(page);
        const stoneCherubIds = core.monsters
            .filter((monster) => monster.definitionId === 'blood-from-stone-stone-cherub')
            .map((monster) => monster.id);
        core.scenarioRuntime.monsterTurn = {
            ...core.scenarioRuntime.monsterTurn,
            resolvedStartMonsterIds: stoneCherubIds,
            skippedMonsterIdsThisTurn: stoneCherubIds,
            attackedMonsterIdsThisTurn: [],
            movementRollsByGroupId: {},
            moveRemainingById: {},
        };
        await injectCore(page, core);
        const gazeEndTurnAction = page.getByTestId('betrayal-action-bloodFromStoneMonsterTurnEnd');
        await expect(gazeEndTurnAction).toBeVisible();
        await setHarnessRandomQueue(page, Array.from({ length: 24 }, () => 0.5));
        await gazeEndTurnAction.click();
        await expect(page.getByTestId('betrayal-damage-allocation-panel')).toBeVisible();
        await expect(page.getByTestId('betrayal-damage-allocation-source')).toContainText('石像小天使凝视');

        await resolveAllPendingDamageAllocations(page);
        core = await readBetrayalCoreFromPage(page);
        await openPlayerPageWithCore(page, core.currentPlayer, core);
        await expect.poll(() => readStoneCherubState(page)).toMatchObject({
            currentPlayer: '1',
            pendingDamageAllocation: null,
            bloodFromStoneMonsterTurn: {
                active: false,
                monsterTurnAfterPlayerId: '0',
            },
        });
        await expect(page.getByTestId('betrayal-action-bloodFromStoneMonsterTurnEnd')).toHaveCount(0);
        await saveScreenshot(page, NATURAL_TURN_AFTER_GAZE_SCREENSHOT);

        assertNoFatalFrontendErrors([{ label: 'betrayal-stone-cherub-natural-monster-turn', diagnostics }]);
    });

    test('石像小天使读取官方定义后不会攻击，视线内不开移动骰，进入视线后停步并在回合结束触发凝视伤害', async ({ page, context }) => {
        test.setTimeout(120000);
        await initBetrayalContext(context);
        const diagnostics = attachPageDiagnostics(page, 'betrayal-stone-cherub-monster-definition');
        const lineOfSightCore = createStoneCherubInLineOfSightCore();
        const fixture = createStoneCherubApproachCore();

        await page.setViewportSize({ width: 1600, height: 900 });
        await warmBetrayalFrontend(context);
        await page.goto(HUMAN_PLAYER_TEST_URL, { waitUntil: 'domcontentloaded' });
        await waitForBetrayalPageReady(page);

        await injectCore(page, lineOfSightCore);
        await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });
        await expect.poll(() => readStoneCherubState(page)).toMatchObject({
            currentPlayer: '0',
            traitorPlayerId: null,
            monsterName: '石像小天使',
            monsterRoomId: HERO_LINE_OF_SIGHT_ROOM_ID,
            rolledMovementGroups: [],
            moveRemaining: null,
        });
        await expect(page.getByTestId('betrayal-action-monsterMovementRoll')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-action-monsterAttack')).toHaveCount(0);
        await expect(page.getByTestId(`betrayal-room-monster-${HERO_LINE_OF_SIGHT_ROOM_ID}-${STONE_CHERUB_ID}`)).toBeVisible();
        await saveScreenshot(page, LINE_OF_SIGHT_SCREENSHOT);

        await injectCore(page, fixture.core);
        await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });
        await expect.poll(() => readStoneCherubState(page)).toMatchObject({
            currentPlayer: '0',
            traitorPlayerId: null,
            monsterName: '石像小天使',
            monsterRoomId: STONE_CHERUB_APPROACH_ROOM_ID,
            rolledMovementGroups: [],
            moveRemaining: null,
        });

        const movementRollAction = page.getByTestId('betrayal-action-monsterMovementRoll');
        const stoneCherubToken = page.getByTestId(`betrayal-room-monster-${STONE_CHERUB_APPROACH_ROOM_ID}-${STONE_CHERUB_ID}`);
        await expect(movementRollAction).toBeVisible();
        await expect(movementRollAction).toContainText('石像小天使移动骰');
        await expect(page.getByTestId('betrayal-action-monsterAttack')).toHaveCount(0);
        await expect(stoneCherubToken).toBeVisible();

        await setHarnessRandomQueue(page, [0.99, 0.99, 0.99, 0.99]);
        await movementRollAction.click();
        const rollPanel = page.getByTestId('betrayal-recent-roll-panel');
        await expect(rollPanel).toContainText('石像小天使移动');
        await expect.poll(() => readStoneCherubState(page)).toMatchObject({
            rolledMovementGroups: [STONE_CHERUB_GROUP_ID],
            recentRollTitle: '石像小天使移动',
        });
        await expect.poll(async () => {
            const state = await readStoneCherubState(page);
            return state.moveRemaining ?? 0;
        }).toBeGreaterThan(0);
        await saveScreenshot(page, ROLL_RESULT_SCREENSHOT);
        await closeRecentRollPanel(page);

        const monsterMoveAction = page.getByTestId('betrayal-action-monsterMove');
        await expect(monsterMoveAction).toBeVisible();
        await expect(monsterMoveAction).toContainText('移动石像小天使');
        await expect(page.getByTestId('betrayal-action-monsterAttack')).toHaveCount(0);
        await saveScreenshot(page, MOVE_READY_SCREENSHOT);

        await monsterMoveAction.click();
        await expect(stoneCherubToken).toHaveAttribute('data-direct-target', 'true');
        await stoneCherubToken.click();
        const targetRoom = page.getByTestId(`betrayal-room-${fixture.targetRoomId}`);
        await expect(page.getByTestId(`betrayal-room-monster-move-target-${fixture.targetRoomId}`)).toBeVisible();
        await saveScreenshot(page, TARGET_SCREENSHOT);

        await targetRoom.click();
        await expect(page.getByTestId('betrayal-room-latest-feedback')).toContainText(
            new RegExp(`石像小天使.*移动到${fixture.targetRoomName}`),
        );
        await expect.poll(() => readStoneCherubState(page)).toMatchObject({
            monsterRoomId: fixture.targetRoomId,
            moveRemaining: 0,
        });
        await expect(page.getByTestId('betrayal-action-monsterAttack')).toHaveCount(0);
        await saveScreenshot(page, MOVED_SCREENSHOT);

        const gazeEndTurnAction = page.getByTestId('betrayal-action-bloodFromStoneMonsterTurnEnd');
        await expect(gazeEndTurnAction).toBeVisible();
        await expect(gazeEndTurnAction).toContainText('结束石像小天使回合');
        await setHarnessRandomQueue(page, [0.99, 0, 0]);
        await gazeEndTurnAction.click();
        await expect(page.getByTestId('betrayal-damage-allocation-panel')).toBeVisible();
        await expect(page.getByTestId('betrayal-damage-allocation-source')).toContainText('石像小天使凝视');
        await expect(page.getByTestId('betrayal-damage-allocation-amount')).toContainText('2 点一般伤害');
        await expect.poll(() => readStoneCherubState(page)).toMatchObject({
            pendingDamageAllocation: {
                playerId: '0',
                sourceTitle: '石像小天使凝视',
                damageKind: 'general',
                amount: 2,
                nextDamageAllocationCount: 0,
            },
        });
        await saveScreenshot(page, GAZE_DAMAGE_SCREENSHOT);
        const heroNewLineCore = createHeroNewLineOfSightCore();
        await injectCore(page, heroNewLineCore);
        await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });
        await expect(page.getByTestId('betrayal-action-move')).toBeVisible();
        await expect(page.getByTestId(`betrayal-room-move-card-highlight-${STONE_CHERUB_STOP_ROOM_ID}`)).toBeVisible();
        await page.getByTestId('betrayal-action-move').click();
        await expect(page.getByTestId('betrayal-action-move')).toContainText('取消移动');
        await expect(page.getByTestId(`betrayal-room-${STONE_CHERUB_STOP_ROOM_ID}`)).toBeEnabled();
        await setHarnessRandomQueue(page, [0.99, 0.99]);
        await page.getByTestId(`betrayal-room-${STONE_CHERUB_STOP_ROOM_ID}`).click();
        await expect(page.getByTestId('betrayal-damage-allocation-panel')).toBeVisible();
        await expect(page.getByTestId('betrayal-damage-allocation-source')).toContainText('石像小天使新视线伤害');
        await expect(page.getByTestId('betrayal-damage-allocation-amount')).toContainText('4 点一般伤害');
        await expect.poll(() => readStoneCherubState(page)).toMatchObject({
            pendingDamageAllocation: {
                playerId: '0',
                sourceTitle: '石像小天使新视线伤害',
                damageKind: 'general',
                amount: 4,
                nextDamageAllocationCount: 0,
            },
        });
        await saveScreenshot(page, HERO_NEW_LINE_OF_SIGHT_DAMAGE_SCREENSHOT);

        assertNoFatalFrontendErrors([{ label: 'betrayal-stone-cherub-monster-definition', diagnostics }]);
    });

    test('石像小天使怪物回合结束凝视伤害必须按英雄连续分配', async ({ page, context }) => {
        test.setTimeout(120000);
        await initBetrayalContext(context);
        const diagnostics = attachPageDiagnostics(page, 'betrayal-stone-cherub-multi-hero-gaze');
        const core = createStoneCherubMultiHeroGazeCore();
        const playerOnePage = await context.newPage();

        try {
            await page.setViewportSize({ width: 1600, height: 900 });
            await warmBetrayalFrontend(context);
            await page.goto(HUMAN_PLAYER_TEST_URL, { waitUntil: 'domcontentloaded' });
            await waitForBetrayalPageReady(page);

            await injectCore(page, core);
            await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });
            const gazeEndTurnAction = page.getByTestId('betrayal-action-bloodFromStoneMonsterTurnEnd');
            await expect(gazeEndTurnAction).toBeVisible();
            await expect(gazeEndTurnAction).toContainText('结束石像小天使回合');

            await setHarnessRandomQueue(page, [0.99, 0.99, 0.99, 0.99]);
            await gazeEndTurnAction.click();
            await expect(page.getByTestId('betrayal-damage-allocation-panel')).toBeVisible();
            await expect(page.getByTestId('betrayal-damage-allocation-panel')).toHaveAttribute('data-player-id', '0');
            await expect(page.getByTestId('betrayal-damage-allocation-source')).toContainText('石像小天使凝视');
            await expect(page.getByTestId('betrayal-damage-allocation-amount')).toContainText('4 点一般伤害');
            await expect.poll(() => readStoneCherubState(page)).toMatchObject({
                pendingDamageAllocation: {
                    playerId: '0',
                    sourceTitle: '石像小天使凝视',
                    damageKind: 'general',
                    amount: 4,
                    nextDamageAllocationCount: 1,
                },
            });
            await saveScreenshot(page, GAZE_MULTI_HERO_FIRST_DAMAGE_SCREENSHOT);

            await resolveDamageAllocationWith(page, ['might', 'speed', 'knowledge', 'sanity']);
            await expect.poll(() => readStoneCherubState(page)).toMatchObject({
                pendingDamageAllocation: {
                    playerId: '1',
                    sourceTitle: '石像小天使凝视',
                    damageKind: 'general',
                    amount: 4,
                    nextDamageAllocationCount: 0,
                },
            });

            const coreAfterFirstAllocation = await readBetrayalCoreFromPage(page);
            await playerOnePage.setViewportSize({ width: 1600, height: 900 });
            await playerOnePage.goto(HUMAN_PLAYER_ONE_TEST_URL, { waitUntil: 'domcontentloaded' });
            await waitForBetrayalPageReady(playerOnePage);
            await injectCore(playerOnePage, coreAfterFirstAllocation);

            await expect(playerOnePage.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });
            await expect(playerOnePage.getByTestId('betrayal-damage-allocation-panel')).toBeVisible();
            await expect(playerOnePage.getByTestId('betrayal-damage-allocation-panel')).toHaveAttribute('data-player-id', '1');
            await expect(playerOnePage.getByTestId('betrayal-damage-allocation-source')).toContainText('石像小天使凝视');
            await expect(playerOnePage.getByTestId('betrayal-damage-allocation-amount')).toContainText('4 点一般伤害');
            await saveScreenshot(playerOnePage, GAZE_MULTI_HERO_SECOND_DAMAGE_SCREENSHOT);

            await resolveDamageAllocationWith(playerOnePage, ['might', 'speed', 'knowledge', 'sanity']);
            await expect.poll(() => readStoneCherubState(playerOnePage)).toMatchObject({
                currentPlayer: '1',
                pendingDamageAllocation: null,
            });
            await expect(playerOnePage.getByTestId('betrayal-damage-allocation-panel')).toHaveCount(0);
            await saveScreenshot(playerOnePage, GAZE_MULTI_HERO_DONE_SCREENSHOT);
        } finally {
            await playerOnePage.close();
        }

        assertNoFatalFrontendErrors([{ label: 'betrayal-stone-cherub-multi-hero-gaze', diagnostics }]);
    });

    test('英雄玩躲猫猫时必须在真实牌桌点同房与视线内两只石像小天使，成功后移除这两只', async ({ page, context }) => {
        test.setTimeout(120000);
        await initBetrayalContext(context);
        const diagnostics = attachPageDiagnostics(page, 'betrayal-stone-cherub-peekaboo');
        const core = createStoneCherubPeekabooCore();

        await page.setViewportSize({ width: 1600, height: 900 });
        await warmBetrayalFrontend(context);
        await page.goto(HUMAN_PLAYER_TEST_URL, { waitUntil: 'domcontentloaded' });
        await waitForBetrayalPageReady(page);

        await injectCore(page, core);
        await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });
        await expect.poll(() => readStoneCherubState(page)).toMatchObject({
            currentPlayer: '0',
            traitorPlayerId: null,
            monsterIds: [
                PEEKABOO_SAME_ROOM_CHERUB_ID,
                PEEKABOO_LINE_OF_SIGHT_CHERUB_ID,
                PEEKABOO_SPARED_CHERUB_ID,
            ],
        });

        const peekabooAction = page.getByTestId('betrayal-action-use');
        const sameRoomCherub = page.getByTestId(
            `betrayal-room-monster-${HERO_LINE_OF_SIGHT_ROOM_ID}-${PEEKABOO_SAME_ROOM_CHERUB_ID}`,
        );
        const lineOfSightCherub = page.getByTestId(
            `betrayal-room-monster-${STONE_CHERUB_STOP_ROOM_ID}-${PEEKABOO_LINE_OF_SIGHT_CHERUB_ID}`,
        );
        await expect(peekabooAction).toBeVisible();
        await expect(peekabooAction).toContainText('玩躲猫猫');
        await expect(peekabooAction).toHaveAttribute('data-haunt-primary-action-kind', 'play-peekaboo');
        await expect(sameRoomCherub).toBeVisible();
        await expect(lineOfSightCherub).toBeVisible();

        await peekabooAction.click();
        await expect(peekabooAction).toHaveAttribute('data-haunt-primary-action-mode', 'targeting');
        await expect(sameRoomCherub).toHaveAttribute('data-direct-target', 'true');
        await expect(sameRoomCherub).toHaveAttribute('data-haunt-target-hitbox', 'true');
        await expect(
            page.getByTestId(
                `betrayal-room-monster-target-cue-${HERO_LINE_OF_SIGHT_ROOM_ID}-${PEEKABOO_SAME_ROOM_CHERUB_ID}`,
            ),
        ).toContainText('点同房石像');
        await saveScreenshot(page, PEEKABOO_SAME_ROOM_SCREENSHOT);

        await sameRoomCherub.click();
        await expect(lineOfSightCherub).toHaveAttribute('data-direct-target', 'true');
        await expect(lineOfSightCherub).toHaveAttribute('data-haunt-target-hitbox', 'true');
        await expect(
            page.getByTestId(
                `betrayal-room-monster-target-cue-${STONE_CHERUB_STOP_ROOM_ID}-${PEEKABOO_LINE_OF_SIGHT_CHERUB_ID}`,
            ),
        ).toContainText('点视线内石像');
        await saveScreenshot(page, PEEKABOO_LINE_OF_SIGHT_SCREENSHOT);

        await setHarnessRandomQueue(page, [0.99]);
        await lineOfSightCherub.click();
        const rollPanel = page.getByTestId('betrayal-recent-roll-panel');
        await expect(rollPanel).toBeVisible();
        await expect(rollPanel).toContainText('玩躲猫猫');
        await expect(rollPanel).toContainText('移除石像小天使');
        await expect.poll(() => readStoneCherubState(page)).toMatchObject({
            monsterIds: [PEEKABOO_SPARED_CHERUB_ID],
            recentRollTitle: '玩躲猫猫',
        });
        await saveScreenshot(page, PEEKABOO_SUCCESS_SCREENSHOT);

        assertNoFatalFrontendErrors([{ label: 'betrayal-stone-cherub-peekaboo', diagnostics }]);
    });

    test('玩躲猫猫移除最后两只石像小天使后，通过真实牌桌进入英雄终局', async ({ page, context }) => {
        test.setTimeout(120000);
        await initBetrayalContext(context);
        const diagnostics = attachPageDiagnostics(page, 'betrayal-stone-cherub-peekaboo-hero-endgame');

        await page.setViewportSize({ width: 1600, height: 900 });
        await warmBetrayalFrontend(context);
        await page.goto(HUMAN_PLAYER_TEST_URL, { waitUntil: 'domcontentloaded' });
        await waitForBetrayalPageReady(page);

        await injectCore(page, createStoneCherubPeekabooLastPairCore());
        await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });
        await expect.poll(() => readStoneCherubState(page)).toMatchObject({
            currentPlayer: '0',
            traitorPlayerId: null,
            phase: 'haunt',
            monsterIds: [
                PEEKABOO_SAME_ROOM_CHERUB_ID,
                PEEKABOO_LINE_OF_SIGHT_CHERUB_ID,
            ],
            endgameResult: null,
        });

        const lineOfSightCherub = await selectPeekabooStoneCherubs(page);
        await setHarnessRandomQueue(page, [0.99]);
        await lineOfSightCherub.click();
        await expect(page.getByTestId('betrayal-recent-roll-panel')).toContainText('移除石像小天使');
        await expect.poll(() => readStoneCherubState(page)).toMatchObject({
            phase: 'endgame',
            monsterIds: [],
            endgameResult: {
                hauntId: 'blood-from-a-stone',
                hauntTitle: '顽石之血',
                outcome: 'survivors',
                winners: ['0', '1', '2'],
                survivorsEscaped: ['0', '1', '2'],
                traitorPlayerId: '',
            },
        });

        const endgameScreen = page.getByTestId('betrayal-endgame-screen');
        await expect(endgameScreen).toBeVisible({ timeout: 30000 });
        await expect(endgameScreen).toContainText('顽石之血');
        await expect(endgameScreen.getByRole('main').getByText('幸存者逃脱', { exact: true }).first()).toBeVisible();
        await expect(endgameScreen).toContainText('胜利');
        await expect(endgameScreen).not.toContainText('叛徒得逞');
        await saveScreenshot(page, PEEKABOO_HERO_ENDGAME_SCREENSHOT);

        assertNoFatalFrontendErrors([{ label: 'betrayal-stone-cherub-peekaboo-hero-endgame', diagnostics }]);
    });

    test('玩躲猫猫失败造成最后英雄死亡后，通过真实伤害分配进入作祟终局', async ({ page, context }) => {
        test.setTimeout(120000);
        await initBetrayalContext(context);
        const diagnostics = attachPageDiagnostics(page, 'betrayal-stone-cherub-peekaboo-haunt-endgame');

        await page.setViewportSize({ width: 1600, height: 900 });
        await warmBetrayalFrontend(context);
        await page.goto(HUMAN_PLAYER_TEST_URL, { waitUntil: 'domcontentloaded' });
        await waitForBetrayalPageReady(page);

        await injectCore(page, createStoneCherubPeekabooLastHeroCore());
        await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });
        await expect.poll(() => readStoneCherubState(page)).toMatchObject({
            currentPlayer: '0',
            traitorPlayerId: null,
            phase: 'haunt',
            monsterIds: [
                PEEKABOO_SAME_ROOM_CHERUB_ID,
                PEEKABOO_LINE_OF_SIGHT_CHERUB_ID,
            ],
            endgameResult: null,
        });

        const lineOfSightCherub = await selectPeekabooStoneCherubs(page);
        await setHarnessRandomQueue(page, [0, 0.99, 0.99]);
        await lineOfSightCherub.click();
        await expect(page.getByTestId('betrayal-recent-roll-panel')).toContainText('一般伤害');

        const damagePanel = page.getByTestId('betrayal-damage-allocation-panel');
        await expect(damagePanel).toBeVisible();
        await expect(damagePanel).toHaveAttribute('data-player-id', '0');
        await expect(page.getByTestId('betrayal-damage-allocation-source')).toContainText('玩躲猫猫');
        await expect(page.getByTestId('betrayal-damage-allocation-amount')).toContainText('4 点一般伤害');
        await expect.poll(() => readStoneCherubState(page)).toMatchObject({
            pendingDamageAllocation: {
                playerId: '0',
                sourceTitle: '玩躲猫猫',
                damageKind: 'general',
                amount: 4,
                nextDamageAllocationCount: 0,
            },
        });
        await saveScreenshot(page, PEEKABOO_HAUNT_DAMAGE_SCREENSHOT);

        await resolveDamageAllocationWith(page, ['might', 'speed', 'knowledge', 'sanity']);
        const endgameScreen = page.getByTestId('betrayal-endgame-screen');
        await expect(endgameScreen).toBeVisible({ timeout: 30000 });
        await expect.poll(() => readStoneCherubState(page)).toMatchObject({
            phase: 'endgame',
            pendingDamageAllocation: null,
            endgameResult: {
                hauntId: 'blood-from-a-stone',
                hauntTitle: '顽石之血',
                outcome: 'haunt',
                winners: [],
                survivorsEscaped: [],
                traitorPlayerId: '',
            },
        });
        await expect(endgameScreen).toContainText('顽石之血');
        await expect(endgameScreen).toContainText('作祟吞没探索者');
        await expect(endgameScreen.getByRole('main').getByText('作祟', { exact: true }).first()).toBeVisible();
        await expect(endgameScreen).not.toContainText('叛徒得逞');
        await saveScreenshot(page, PEEKABOO_HAUNT_ENDGAME_SCREENSHOT);

        assertNoFatalFrontendErrors([{ label: 'betrayal-stone-cherub-peekaboo-haunt-endgame', diagnostics }]);
    });
});
