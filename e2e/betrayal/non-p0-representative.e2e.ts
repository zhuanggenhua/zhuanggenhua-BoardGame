import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { BETRAYAL_DISCOVERY_POOLS } from '../../src/games/betrayal/scenarioConfig';
import { type BetrayalCore } from '../../src/games/betrayal/game';
import { BETRAYAL_COMMANDS } from '../../src/games/betrayal/commands';
import {
    resolveBetrayalMonsterMovementGroups,
    type BetrayalMonsterMovementRollGroupResult,
} from '../../src/games/betrayal/monsterActionReadModel';
import {
    applyBetrayalCommand,
    createBetrayalScriptedRandom,
    createFirstScenarioHauntCore,
    createStartedFirstScenarioCore,
} from '../../src/games/betrayal/testing/firstScenarioTestUtils';
import {
    assertNoFatalFrontendErrors,
    attachPageDiagnostics,
} from '../helpers/common';
import {
    clickDiscoveryBackdropAndExpectStillVisible,
    expectVisiblePhysicalDiceBox,
    expectPhysicalDiceSeparated,
    initBetrayalContext,
    injectCore,
    saveScreenshot,
    setHarnessRandomQueue,
    waitForBetrayalPageReady,
    waitForPhysicalDiceSettled,
} from './betrayalTestHelpers';

const EVIDENCE_DIR = resolve(process.cwd(), 'evidence/betrayal-non-p0-representatives');
const ORDINARY_ROLL_EVENT_TARGET_SCREENSHOT = `${EVIDENCE_DIR}/01-普通投骰事件-探索目标.jpg`;
const ORDINARY_ROLL_EVENT_CARD_FRONT_SCREENSHOT = `${EVIDENCE_DIR}/02-普通投骰事件-卡牌正面.jpg`;
const ORDINARY_ROLL_EVENT_DICE_SCREENSHOT = `${EVIDENCE_DIR}/03-普通投骰事件-投掷骰子.jpg`;
const ORDINARY_ROLL_EVENT_FULL_SCREENSHOT = `${EVIDENCE_DIR}/04-普通投骰事件-牌面骰盘分支.jpg`;
const IDOL_FULL_CHAIN_EVIDENCE_DIR = resolve(process.cwd(), 'evidence/山屋惊魂-雕像探索前持有物完整链路');
const IDOL_OPTION_BEFORE_SCREENSHOT = `${IDOL_FULL_CHAIN_EVIDENCE_DIR}/01-雕像选择前牌桌可操作.jpg`;
const IDOL_OPTION_SELECTED_SCREENSHOT = `${IDOL_FULL_CHAIN_EVIDENCE_DIR}/02-雕像探索前持有物已选中.jpg`;
const IDOL_EXPLORE_TARGET_SCREENSHOT = `${IDOL_FULL_CHAIN_EVIDENCE_DIR}/03-选择未知房间前.jpg`;
const IDOL_SKIP_EVENT_SCREENSHOT = `${IDOL_FULL_CHAIN_EVIDENCE_DIR}/04-雕像跳过事件结果可见.jpg`;
const IDOL_SKIP_SETTLED_SCREENSHOT = `${IDOL_FULL_CHAIN_EVIDENCE_DIR}/05-雕像跳过事件结算未扣力量.jpg`;
const IDOL_DISMISSED_SCREENSHOT = `${IDOL_FULL_CHAIN_EVIDENCE_DIR}/06-关闭后回牌桌状态清空.jpg`;
const HUNTING_KNIFE_SELECTOR_SCREENSHOT = `${EVIDENCE_DIR}/08-砍刀攻击武器-选择前.jpg`;
const HUNTING_KNIFE_TARGET_SCREENSHOT = `${EVIDENCE_DIR}/09-砍刀攻击武器-目标高亮.jpg`;
const HUNTING_KNIFE_ATTACK_DICE_SCREENSHOT = `${EVIDENCE_DIR}/10-砍刀攻击武器-攻击投骰.jpg`;
const HUNTING_KNIFE_ATTACK_FEEDBACK_SCREENSHOT = `${EVIDENCE_DIR}/11-砍刀攻击武器-攻击反馈.jpg`;
const ATTACK_WEAPON_DISABLED_REASONS_EVIDENCE_DIR = resolve(process.cwd(), 'evidence/山屋惊魂-攻击武器禁用原因完整链路');
const ATTACK_WEAPON_DISABLED_REASONS_READY_SCREENSHOT = `${ATTACK_WEAPON_DISABLED_REASONS_EVIDENCE_DIR}/01-攻击前武器选择状态.jpg`;
const ATTACK_WEAPON_DISABLED_REASONS_TARGET_SCREENSHOT = `${ATTACK_WEAPON_DISABLED_REASONS_EVIDENCE_DIR}/02-选择砍刀后目标高亮.jpg`;
const ATTACK_WEAPON_DISABLED_REASONS_FEEDBACK_SCREENSHOT = `${ATTACK_WEAPON_DISABLED_REASONS_EVIDENCE_DIR}/03-砍刀攻击后反馈.jpg`;
const UNARMED_ATTACK_EVIDENCE_DIR = resolve(process.cwd(), 'evidence/山屋惊魂-无武器攻击完整链路');
const UNARMED_ATTACK_READY_SCREENSHOT = `${UNARMED_ATTACK_EVIDENCE_DIR}/01-无武器攻击前牌桌可操作.jpg`;
const UNARMED_ATTACK_DEFAULT_SCREENSHOT = `${UNARMED_ATTACK_EVIDENCE_DIR}/02-无武器直接攻击提示可见.jpg`;
const UNARMED_ATTACK_TARGET_SCREENSHOT = `${UNARMED_ATTACK_EVIDENCE_DIR}/03-叛徒目标高亮.jpg`;
const UNARMED_ATTACK_DICE_SCREENSHOT = `${UNARMED_ATTACK_EVIDENCE_DIR}/04-无武器4骰攻击骰盘停稳.jpg`;
const UNARMED_ATTACK_RESULT_SCREENSHOT = `${UNARMED_ATTACK_EVIDENCE_DIR}/05-物理伤害结算结果可见.jpg`;
const UNARMED_ATTACK_SETTLED_SCREENSHOT = `${UNARMED_ATTACK_EVIDENCE_DIR}/06-无武器攻击后回牌桌继续可操作.jpg`;
const RING_SANITY_ATTACK_EVIDENCE_DIR = resolve(process.cwd(), 'evidence/山屋惊魂-指环神志攻击完整链路');
const RING_ATTACK_READY_SCREENSHOT = `${RING_SANITY_ATTACK_EVIDENCE_DIR}/01-指环攻击前牌桌可操作.jpg`;
const RING_ATTACK_SELECTED_SCREENSHOT = `${RING_SANITY_ATTACK_EVIDENCE_DIR}/02-指环武器已选中.jpg`;
const RING_ATTACK_TARGET_SCREENSHOT = `${RING_SANITY_ATTACK_EVIDENCE_DIR}/03-叛徒目标高亮.jpg`;
const RING_ATTACK_DICE_SCREENSHOT = `${RING_SANITY_ATTACK_EVIDENCE_DIR}/04-指环神志攻击骰盘停稳.jpg`;
const RING_ATTACK_RESULT_SCREENSHOT = `${RING_SANITY_ATTACK_EVIDENCE_DIR}/05-精神伤害结算结果可见.jpg`;
const RING_ATTACK_SETTLED_SCREENSHOT = `${RING_SANITY_ATTACK_EVIDENCE_DIR}/06-指环攻击后回牌桌继续可操作.jpg`;
const BROOCH_MENTAL_DAMAGE_EVIDENCE_DIR = resolve(process.cwd(), 'evidence/山屋惊魂-胸针精神伤害改写完整链路');
const BROOCH_MENTAL_DAMAGE_PANEL_SCREENSHOT = `${BROOCH_MENTAL_DAMAGE_EVIDENCE_DIR}/01-指环攻击胸针通用伤害分配面板.jpg`;
const BROOCH_MENTAL_DAMAGE_SETTLED_SCREENSHOT = `${BROOCH_MENTAL_DAMAGE_EVIDENCE_DIR}/02-指环攻击胸针通用伤害结算反馈.jpg`;
const DAGGER_ATTACK_EVIDENCE_DIR = resolve(process.cwd(), 'evidence/山屋惊魂-匕首攻击完整链路');
const DAGGER_ATTACK_READY_SCREENSHOT = `${DAGGER_ATTACK_EVIDENCE_DIR}/01-匕首攻击前牌桌可操作.jpg`;
const DAGGER_ATTACK_SELECTED_SCREENSHOT = `${DAGGER_ATTACK_EVIDENCE_DIR}/02-匕首武器已选中.jpg`;
const DAGGER_ATTACK_TARGET_SCREENSHOT = `${DAGGER_ATTACK_EVIDENCE_DIR}/03-叛徒目标高亮.jpg`;
const DAGGER_ATTACK_DICE_SCREENSHOT = `${DAGGER_ATTACK_EVIDENCE_DIR}/04-匕首6骰攻击骰盘停稳.jpg`;
const DAGGER_ATTACK_RESULT_SCREENSHOT = `${DAGGER_ATTACK_EVIDENCE_DIR}/05-物理伤害与速度花费结果可见.jpg`;
const DAGGER_ATTACK_SETTLED_SCREENSHOT = `${DAGGER_ATTACK_EVIDENCE_DIR}/06-匕首攻击后回牌桌继续可操作.jpg`;
const CROSSBOW_ADJACENT_ATTACK_EVIDENCE_DIR = resolve(process.cwd(), 'evidence/山屋惊魂-十字弓相邻攻击完整链路');
const CROSSBOW_ADJACENT_ATTACK_READY_SCREENSHOT = `${CROSSBOW_ADJACENT_ATTACK_EVIDENCE_DIR}/01-十字弓攻击前牌桌可操作.jpg`;
const CROSSBOW_ADJACENT_ATTACK_SELECTED_SCREENSHOT = `${CROSSBOW_ADJACENT_ATTACK_EVIDENCE_DIR}/02-十字弓武器已选中.jpg`;
const CROSSBOW_ADJACENT_ATTACK_TARGET_SCREENSHOT = `${CROSSBOW_ADJACENT_ATTACK_EVIDENCE_DIR}/03-十字弓相邻叛徒目标高亮且无视线连线.jpg`;
const GUN_LINE_OF_SIGHT_ATTACK_EVIDENCE_DIR = resolve(process.cwd(), 'evidence/山屋惊魂-枪视线攻击完整链路');
const GUN_ATTACK_READY_SCREENSHOT = `${GUN_LINE_OF_SIGHT_ATTACK_EVIDENCE_DIR}/01-枪攻击前牌桌可操作.jpg`;
const GUN_ATTACK_SELECTED_SCREENSHOT = `${GUN_LINE_OF_SIGHT_ATTACK_EVIDENCE_DIR}/02-枪武器已选中并显示视线.jpg`;
const GUN_ATTACK_TARGET_SCREENSHOT = `${GUN_LINE_OF_SIGHT_ATTACK_EVIDENCE_DIR}/03-枪视线叛徒目标高亮.jpg`;
const GUN_ATTACK_RESULT_SCREENSHOT = `${GUN_LINE_OF_SIGHT_ATTACK_EVIDENCE_DIR}/04-枪速度攻击伤害分配.jpg`;
const GUN_ATTACK_SETTLED_SCREENSHOT = `${GUN_LINE_OF_SIGHT_ATTACK_EVIDENCE_DIR}/05-枪攻击后回牌桌状态清空.jpg`;
const CHAINSAW_ATTACK_EVIDENCE_DIR = resolve(process.cwd(), 'evidence/山屋惊魂-电锯攻击完整链路');
const CHAINSAW_ATTACK_READY_SCREENSHOT = `${CHAINSAW_ATTACK_EVIDENCE_DIR}/01-电锯攻击前牌桌可操作.jpg`;
const CHAINSAW_ATTACK_SELECTED_SCREENSHOT = `${CHAINSAW_ATTACK_EVIDENCE_DIR}/02-电锯武器已选中.jpg`;
const CHAINSAW_ATTACK_TARGET_SCREENSHOT = `${CHAINSAW_ATTACK_EVIDENCE_DIR}/03-电锯叛徒目标高亮.jpg`;
const CHAINSAW_ATTACK_DICE_SCREENSHOT = `${CHAINSAW_ATTACK_EVIDENCE_DIR}/04-电锯5骰攻击骰盘停稳.jpg`;
const CHAINSAW_ATTACK_RESULT_SCREENSHOT = `${CHAINSAW_ATTACK_EVIDENCE_DIR}/05-电锯物理伤害分配.jpg`;
const CHAINSAW_ATTACK_SETTLED_SCREENSHOT = `${CHAINSAW_ATTACK_EVIDENCE_DIR}/06-电锯攻击后回牌桌状态清空.jpg`;
const LEATHER_JACKET_DEFENSE_EVIDENCE_DIR = resolve(process.cwd(), 'evidence/山屋惊魂-皮夹克防御额外骰完整链路');
const LEATHER_JACKET_READY_SCREENSHOT = `${LEATHER_JACKET_DEFENSE_EVIDENCE_DIR}/01-皮夹克防御前牌桌可操作.jpg`;
const LEATHER_JACKET_TARGET_SCREENSHOT = `${LEATHER_JACKET_DEFENSE_EVIDENCE_DIR}/02-攻击持有皮夹克的叛徒目标高亮.jpg`;
const LEATHER_JACKET_RESULT_SCREENSHOT = `${LEATHER_JACKET_DEFENSE_EVIDENCE_DIR}/03-皮夹克防御额外骰结果可见.jpg`;
const LEATHER_JACKET_SETTLED_SCREENSHOT = `${LEATHER_JACKET_DEFENSE_EVIDENCE_DIR}/04-皮夹克攻击伤害分配后回牌桌.jpg`;
const RADIO_MENTAL_DAMAGE_EVIDENCE_DIR = resolve(process.cwd(), 'evidence/山屋惊魂-头戴耳机精神减伤完整链路');
const RADIO_MENTAL_READY_SCREENSHOT = `${RADIO_MENTAL_DAMAGE_EVIDENCE_DIR}/01-头戴耳机减伤前牌桌可操作.jpg`;
const RADIO_MENTAL_TARGET_SCREENSHOT = `${RADIO_MENTAL_DAMAGE_EVIDENCE_DIR}/02-指环攻击持有头戴耳机叛徒目标高亮.jpg`;
const RADIO_MENTAL_DICE_SCREENSHOT = `${RADIO_MENTAL_DAMAGE_EVIDENCE_DIR}/03-指环精神伤害攻击骰盘停稳.jpg`;
const RADIO_MENTAL_PANEL_SCREENSHOT = `${RADIO_MENTAL_DAMAGE_EVIDENCE_DIR}/04-头戴耳机减伤后伤害分配.jpg`;
const RADIO_MENTAL_SETTLED_SCREENSHOT = `${RADIO_MENTAL_DAMAGE_EVIDENCE_DIR}/05-头戴耳机减伤结算后回牌桌.jpg`;
const STRANGE_AMULET_DAMAGE_EVIDENCE_DIR = resolve(process.cwd(), 'evidence/山屋惊魂-奇异护符物理伤害触发完整链路');
const STRANGE_AMULET_READY_SCREENSHOT = `${STRANGE_AMULET_DAMAGE_EVIDENCE_DIR}/01-奇异护符受伤前牌桌可操作.jpg`;
const STRANGE_AMULET_TARGET_SCREENSHOT = `${STRANGE_AMULET_DAMAGE_EVIDENCE_DIR}/02-攻击持有奇异护符叛徒目标高亮.jpg`;
const STRANGE_AMULET_DICE_SCREENSHOT = `${STRANGE_AMULET_DAMAGE_EVIDENCE_DIR}/03-物理攻击骰盘停稳.jpg`;
const STRANGE_AMULET_PANEL_SCREENSHOT = `${STRANGE_AMULET_DAMAGE_EVIDENCE_DIR}/04-奇异护符物理伤害分配.jpg`;
const STRANGE_AMULET_SETTLED_SCREENSHOT = `${STRANGE_AMULET_DAMAGE_EVIDENCE_DIR}/05-奇异护符触发神志加点反馈.jpg`;
const DYNAMITE_ROOM_ATTACK_EVIDENCE_DIR = resolve(process.cwd(), 'evidence/山屋惊魂-炸药房间攻击完整链路');
const DYNAMITE_ROOM_ATTACK_READY_SCREENSHOT = `${DYNAMITE_ROOM_ATTACK_EVIDENCE_DIR}/01-炸药攻击前牌桌可操作.jpg`;
const DYNAMITE_ROOM_ATTACK_TARGET_SCREENSHOT = `${DYNAMITE_ROOM_ATTACK_EVIDENCE_DIR}/02-炸药当前与相邻房间目标高亮.jpg`;
const DYNAMITE_ROOM_ATTACK_DAMAGE_SCREENSHOT = `${DYNAMITE_ROOM_ATTACK_EVIDENCE_DIR}/03-炸药速度检定失败后伤害分配.jpg`;
const DYNAMITE_ROOM_ATTACK_SETTLED_SCREENSHOT = `${DYNAMITE_ROOM_ATTACK_EVIDENCE_DIR}/04-炸药结算后回牌桌状态清空.jpg`;
const PHANTOM_PHOTOGRAPHER_LINE_OF_SIGHT_EVIDENCE_DIR = resolve(process.cwd(), 'evidence/山屋惊魂-幻影摄影师视线攻击完整链路');
const PHANTOM_PHOTOGRAPHER_READY_SCREENSHOT = `${PHANTOM_PHOTOGRAPHER_LINE_OF_SIGHT_EVIDENCE_DIR}/01-幻影摄影师攻击前牌桌可操作.jpg`;
const PHANTOM_PHOTOGRAPHER_TARGET_SCREENSHOT = `${PHANTOM_PHOTOGRAPHER_LINE_OF_SIGHT_EVIDENCE_DIR}/02-幻影摄影师视线连线与英雄目标高亮.jpg`;
const PHANTOM_PHOTOGRAPHER_DICE_SCREENSHOT = `${PHANTOM_PHOTOGRAPHER_LINE_OF_SIGHT_EVIDENCE_DIR}/03-幻影摄影师攻击骰盘.jpg`;

const openBetrayalPage = async (page: Page, context: Parameters<typeof initBetrayalContext>[0], label: string) => {
    await initBetrayalContext(context);
    const diagnostics = attachPageDiagnostics(page, label);
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('/play/betrayal?players=3&seat0=human&seat1=human&seat2=human', { waitUntil: 'domcontentloaded' });
    await waitForBetrayalPageReady(page);
    return diagnostics;
};

const saveLocatorScreenshot = async (locator: Locator, path: string) => {
    mkdirSync(dirname(path), { recursive: true });
    await locator.screenshot({ path });
};

const confirmPendingRoomPlacement = async (page: Page) => {
    const placementPanel = page.getByTestId('betrayal-room-placement-panel');
    await expect(placementPanel).toBeVisible({ timeout: 30000 });
    await page.getByTestId('betrayal-room-placement-confirm').click();
    await expect(placementPanel).toHaveCount(0);
};

const cloneE2ERoomTemplate = (
    room: BetrayalCore['roomDiscoveryDeck'][number]['room'],
): BetrayalCore['roomDiscoveryDeck'][number]['room'] => ({
    ...room,
    tags: [...room.tags],
    doorways: [...room.doorways],
});

const setNextE2EDiscoveryRoom = (
    core: BetrayalCore,
    floor: 'ground' | 'upper' | 'basement',
    visualId: string,
) => {
    const room = BETRAYAL_DISCOVERY_POOLS.roomDiscoveryByFloor[floor].find(
        (candidate) => candidate.visualId === visualId,
    );
    if (!room) {
        throw new Error(`山屋 E2E 夹具缺少${floor}房间 ${visualId}`);
    }
    core.roomDiscoveryDeck = [{ floor, room: cloneE2ERoomTemplate(room) }];
    core.roomDiscoveryOrderByFloor = {
        ground: floor === 'ground' ? [cloneE2ERoomTemplate(room)] : [],
        upper: floor === 'upper' ? [cloneE2ERoomTemplate(room)] : [],
        basement: floor === 'basement' ? [cloneE2ERoomTemplate(room)] : [],
    };
};

const enterAttackTargeting = async (page: Page) => {
    const attackAction = page.getByTestId('betrayal-action-use');
    await expect(attackAction).toHaveAttribute('data-haunt-primary-action-kind', 'attack-traitor');
    await expect(attackAction).toHaveAttribute('data-haunt-primary-action-mode', 'choose-target');
    await attackAction.click();
    await expect(attackAction).toHaveAttribute('data-haunt-primary-action-kind', 'attack-traitor');
    await expect(attackAction).toHaveAttribute('data-haunt-primary-action-mode', 'targeting');
};

const resolveRequiredTraitorPlayerId = (core: BetrayalCore): string => {
    const traitorPlayerId = core.scenarioRuntime.traitorPlayerId;
    if (!traitorPlayerId) {
        throw new Error('山屋攻击代表链缺少叛徒玩家');
    }
    return traitorPlayerId;
};

const expectTraitorTargetHighlighted = async (
    page: Page,
    roomId: string,
    traitorPlayerId: string,
) => {
    const traitorToken = page.getByTestId(`betrayal-room-occupant-${roomId}-${traitorPlayerId}`);
    await expect(traitorToken).toHaveAttribute('data-direct-target', 'true');
    await expect(page.getByTestId(`betrayal-room-occupant-target-outline-${roomId}-${traitorPlayerId}`))
        .toHaveAttribute('data-highlight-shape', 'pentagon');
    return traitorToken;
};

const dismissDiscoveryPanel = async (page: Page) => {
    const discoveryPanel = page.getByTestId('betrayal-discovery-panel');
    await clickDiscoveryBackdropAndExpectStillVisible(page, discoveryPanel);
    const continueButton = page.getByTestId('betrayal-discovery-continue');
    await expect(
        continueButton,
        '发现牌浮层必须通过明确继续/确认按钮关闭，不能用空白点击关闭。',
    ).toBeEnabled();
    await continueButton.click();
    await expect(discoveryPanel).toBeHidden();
};

const createOrdinaryRollEventCore = () => {
    const eventCard = BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '标本剥制');
    if (!eventCard) {
        throw new Error('山屋事件池缺少普通投骰事件：标本剥制');
    }

    const core = createStartedFirstScenarioCore(['0', '1', '2']);
    core.drawOrder = ['event'];
    core.eventOrder = [eventCard];
    setNextE2EDiscoveryRoom(core, 'ground', 'kitchen');
    core.currentExplorer = {
        ...core.currentExplorer,
        roomId: 'hallway',
        traits: {
            ...core.currentExplorer.traits,
            might: 4,
            speed: 4,
            knowledge: 4,
            sanity: 4,
        },
        inventory: [],
    };
    core.activeRoomId = 'hallway';
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.currentExplorerInventory = [];
    return core;
};

const createIdolSkipEventCore = () => {
    const core = createStartedFirstScenarioCore(['0', '1', '2']);
    core.drawOrder = ['event'];
    setNextE2EDiscoveryRoom(core, 'ground', 'kitchen');
    core.eventOrder = [
        {
            name: '阴影扑面',
            text: '阴影扑向你。失去 1 点力量。',
            effect: { mode: 'trait', trait: 'might', amount: -1, recommendedAction: 'endTurn' },
        },
    ];
    core.currentExplorer = {
        ...core.currentExplorer,
        roomId: 'hallway',
        inventory: [{ id: 'idol', name: '雕像', kind: 'omen' }],
    };
    core.activeRoomId = 'hallway';
    core.currentExplorerInventory = [...core.currentExplorer.inventory];
    core.turnStartInventoryCardIds = ['idol'];
    return core;
};

const createHuntingKnifeAttackCore = () => {
    const core = createFirstScenarioHauntCore();
    activateE2EExplorer(core, '0');
    const traitor = core.otherExplorers.find((explorer) => explorer.playerId === core.scenarioRuntime.traitorPlayerId);
    const helper = core.otherExplorers.find((explorer) => explorer.playerId !== traitor?.playerId);
    if (!helper || !traitor) {
        throw new Error('山屋首剧本攻击夹具缺少英雄或叛徒');
    }

    core.currentExplorer = {
        ...core.currentExplorer,
        roomId: 'entrance-hall',
        inventory: [{ id: 'hunting-knife', name: '砍刀', kind: 'item' }],
    };
    core.otherExplorers = [
        { ...helper },
        { ...traitor, roomId: 'entrance-hall' },
    ];
    core.activeRoomId = 'entrance-hall';
    core.currentExplorerInventory = [...core.currentExplorer.inventory];
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.turnStartInventoryCardIds = ['hunting-knife'];
    core.latestDiscovery = null;
    core.latestDiscoveryOwnerPlayerId = null;
    core.recentRoll = null;
    return core;
};

const isMagicCameraTestCard = (card: BetrayalCore['currentExplorer']['inventory'][number]) =>
    card.id === 'camera' || card.name === '魔法相机';

const removeMagicCameraFromE2EExplorer = (
    explorer: BetrayalCore['currentExplorer'],
): BetrayalCore['currentExplorer'] => ({
    ...explorer,
    inventory: explorer.inventory.filter((card) => !isMagicCameraTestCard(card)),
});

const activateE2EExplorer = (core: BetrayalCore, playerId: string) => {
    const explorers = [core.currentExplorer, ...core.otherExplorers].map((explorer) => ({
        ...explorer,
        inventory: explorer.inventory.map((card) => ({ ...card })),
    }));
    const actor = explorers.find((explorer) => explorer.playerId === playerId);
    if (!actor) {
        throw new Error(`山屋 E2E 夹具缺少玩家 ${playerId}`);
    }
    core.currentExplorer = { ...actor };
    core.otherExplorers = explorers.filter((explorer) => explorer.playerId !== playerId);
    core.currentPlayer = actor.playerId;
    core.activeRoomId = actor.roomId;
    core.currentExplorerInventory = [...actor.inventory];
    core.currentExplorerTraits = { ...actor.traits };
    core.turnStartInventoryCardIds = actor.inventory.map((card) => card.id);
    core.usedCardIdsThisTurn = [];
    core.latestDiscovery = null;
    core.latestDiscoveryOwnerPlayerId = null;
    core.recentRoll = null;
};

const createUnarmedAttackCore = () => {
    const core = createFirstScenarioHauntCore();
    activateE2EExplorer(core, '0');
    const traitor = core.otherExplorers.find((explorer) => explorer.playerId === core.scenarioRuntime.traitorPlayerId);
    const helper = core.otherExplorers.find((explorer) => explorer.playerId !== traitor?.playerId);
    if (!helper || !traitor) {
        throw new Error('山屋首剧本无武器攻击夹具缺少英雄或叛徒');
    }

    core.currentExplorer = {
        ...core.currentExplorer,
        roomId: 'entrance-hall',
        traits: {
            might: 4,
            speed: 4,
            knowledge: 4,
            sanity: 4,
        },
        inventory: [],
    };
    core.otherExplorers = [
        { ...helper },
        {
            ...traitor,
            roomId: 'entrance-hall',
            traits: {
                might: 8,
                speed: 8,
                knowledge: 4,
                sanity: 4,
            },
        },
    ];
    core.currentPlayer = core.currentExplorer.playerId;
    core.activeRoomId = 'entrance-hall';
    core.currentExplorerInventory = [];
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.turnStartInventoryCardIds = [];
    core.usedCardIdsThisTurn = [];
    core.activityLog = [];
    core.latestDiscovery = null;
    core.latestDiscoveryOwnerPlayerId = null;
    core.recentRoll = null;
    return core;
};

const createStrangeAmuletPhysicalDamageCore = () => {
    const core = createUnarmedAttackCore();
    core.otherExplorers = core.otherExplorers.map((explorer) => (
        explorer.playerId === core.scenarioRuntime.traitorPlayerId
            ? {
                ...explorer,
                inventory: [{ id: 'strange-amulet', name: '奇异护符', kind: 'item' }],
            }
            : explorer
    ));
    return core;
};

const createAttackWeaponDisabledReasonsCore = () => {
    const core = createHuntingKnifeAttackCore();
    core.currentExplorer = {
        ...core.currentExplorer,
        inventory: [
            { id: 'hunting-knife', name: '砍刀', kind: 'item' },
            { id: 'dagger', name: '匕首', kind: 'omen' },
            { id: 'ring', name: '指环', kind: 'omen' },
        ],
    };
    core.currentExplorerInventory = [...core.currentExplorer.inventory];
    core.turnStartInventoryCardIds = ['hunting-knife', 'ring'];
    core.usedCardIdsThisTurn = ['ring'];
    return core;
};

const createRingAttackCore = () => {
    const core = createFirstScenarioHauntCore();
    activateE2EExplorer(core, '0');
    const traitor = core.otherExplorers.find((explorer) => explorer.playerId === core.scenarioRuntime.traitorPlayerId);
    const helper = core.otherExplorers.find((explorer) => explorer.playerId !== traitor?.playerId);
    if (!helper || !traitor) {
        throw new Error('山屋首剧本指环攻击夹具缺少英雄或叛徒');
    }

    core.currentExplorer = {
        ...core.currentExplorer,
        roomId: 'entrance-hall',
        traits: {
            might: 4,
            speed: 4,
            knowledge: 4,
            sanity: 4,
        },
        inventory: [{ id: 'ring', name: '指环', kind: 'omen' }],
    };
    core.otherExplorers = [
        { ...helper },
        {
            ...traitor,
            roomId: 'entrance-hall',
            traits: {
                might: 4,
                speed: 4,
                knowledge: 8,
                sanity: 8,
            },
        },
    ];
    core.currentPlayer = core.currentExplorer.playerId;
    core.activeRoomId = 'entrance-hall';
    core.currentExplorerInventory = [...core.currentExplorer.inventory];
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.turnStartInventoryCardIds = ['ring'];
    core.usedCardIdsThisTurn = [];
    core.activityLog = [];
    core.latestDiscovery = null;
    core.latestDiscoveryOwnerPlayerId = null;
    core.recentRoll = null;
    return core;
};

const createRingAttackBroochCore = () => {
    const core = createRingAttackCore();
    core.otherExplorers = core.otherExplorers.map((explorer) => (
        explorer.playerId === core.scenarioRuntime.traitorPlayerId
            ? {
                ...explorer,
                inventory: [{ id: 'brooch', name: '胸针', kind: 'item' }],
            }
            : explorer
    ));
    return core;
};

const createRingAttackRadioCore = () => {
    const core = createRingAttackCore();
    core.otherExplorers = core.otherExplorers.map((explorer) => (
        explorer.playerId === core.scenarioRuntime.traitorPlayerId
            ? {
                ...explorer,
                inventory: [{ id: 'radio', name: '头戴耳机', kind: 'item' }],
            }
            : explorer
    ));
    return core;
};

const createDaggerAttackCore = () => {
    const core = createFirstScenarioHauntCore();
    activateE2EExplorer(core, '0');
    const traitor = core.otherExplorers.find((explorer) => explorer.playerId === core.scenarioRuntime.traitorPlayerId);
    const helper = core.otherExplorers.find((explorer) => explorer.playerId !== traitor?.playerId);
    if (!helper || !traitor) {
        throw new Error('山屋首剧本匕首攻击夹具缺少英雄或叛徒');
    }

    core.currentExplorer = {
        ...core.currentExplorer,
        roomId: 'entrance-hall',
        traits: {
            might: 4,
            speed: 4,
            knowledge: 4,
            sanity: 4,
        },
        inventory: [{ id: 'dagger', name: '匕首', kind: 'omen' }],
    };
    core.otherExplorers = [
        { ...helper },
        {
            ...traitor,
            roomId: 'entrance-hall',
            traits: {
                might: 4,
                speed: 8,
                knowledge: 4,
                sanity: 4,
            },
        },
    ];
    core.currentPlayer = core.currentExplorer.playerId;
    core.activeRoomId = 'entrance-hall';
    core.currentExplorerInventory = [...core.currentExplorer.inventory];
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.turnStartInventoryCardIds = ['dagger'];
    core.usedCardIdsThisTurn = [];
    core.activityLog = [];
    core.latestDiscovery = null;
    core.latestDiscoveryOwnerPlayerId = null;
    core.recentRoll = null;
    return core;
};

const createCrossbowAdjacentAttackCore = () => {
    const core = createFirstScenarioHauntCore();
    activateE2EExplorer(core, '0');
    const traitor = core.otherExplorers.find((explorer) => explorer.playerId === core.scenarioRuntime.traitorPlayerId);
    const helper = core.otherExplorers.find((explorer) => explorer.playerId !== traitor?.playerId);
    if (!helper || !traitor) {
        throw new Error('山屋首剧本十字弓相邻攻击夹具缺少英雄或叛徒');
    }

    core.currentExplorer = {
        ...core.currentExplorer,
        roomId: 'grand-staircase',
        inventory: [{ id: 'crossbow', name: '十字弓', kind: 'item' }],
    };
    if (core.scenarioRuntime.mummy?.girlRoomId === 'grand-staircase') {
        core.scenarioRuntime.mummy.girlRoomId = 'upper-landing';
    }
    core.otherExplorers = [
        { ...helper },
        {
            ...traitor,
            roomId: 'hallway',
            traits: {
                might: 4,
                speed: 8,
                knowledge: 4,
                sanity: 4,
            },
        },
    ];
    core.currentPlayer = core.currentExplorer.playerId;
    core.activeRoomId = 'grand-staircase';
    core.currentExplorerInventory = [...core.currentExplorer.inventory];
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.turnStartInventoryCardIds = ['crossbow'];
    core.usedCardIdsThisTurn = [];
    core.activityLog = [];
    core.latestDiscovery = null;
    core.latestDiscoveryOwnerPlayerId = null;
    core.recentRoll = null;
    return core;
};

const createGunLineOfSightAttackCore = () => {
    const core = createFirstScenarioHauntCore();
    activateE2EExplorer(core, '0');
    const traitor = core.otherExplorers.find((explorer) => explorer.playerId === core.scenarioRuntime.traitorPlayerId);
    const helper = core.otherExplorers.find((explorer) => explorer.playerId !== traitor?.playerId);
    if (!helper || !traitor) {
        throw new Error('山屋首剧本枪视线攻击夹具缺少英雄或叛徒');
    }

    core.currentExplorer = {
        ...core.currentExplorer,
        roomId: 'grand-staircase',
        traits: {
            might: 4,
            speed: 4,
            knowledge: 4,
            sanity: 4,
        },
        inventory: [{ id: 'gun', name: '枪', kind: 'item' }],
    };
    if (core.scenarioRuntime.mummy?.girlRoomId === 'grand-staircase' || core.scenarioRuntime.mummy?.girlRoomId === 'entrance-hall') {
        core.scenarioRuntime.mummy.girlRoomId = 'upper-landing';
    }
    core.otherExplorers = [
        { ...helper, roomId: 'hallway' },
        {
            ...traitor,
            roomId: 'entrance-hall',
            inventory: [],
            traits: {
                might: 8,
                speed: 2,
                knowledge: 4,
                sanity: 4,
            },
        },
    ];
    core.currentPlayer = core.currentExplorer.playerId;
    core.activeRoomId = 'grand-staircase';
    core.currentExplorerInventory = [...core.currentExplorer.inventory];
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.turnStartInventoryCardIds = ['gun'];
    core.usedCardIdsThisTurn = [];
    core.activityLog = [];
    core.latestDiscovery = null;
    core.latestDiscoveryOwnerPlayerId = null;
    core.recentRoll = null;
    return core;
};

const createChainsawAttackCore = () => {
    const core = createFirstScenarioHauntCore();
    activateE2EExplorer(core, '0');
    const traitor = core.otherExplorers.find((explorer) => explorer.playerId === core.scenarioRuntime.traitorPlayerId);
    const helper = core.otherExplorers.find((explorer) => explorer.playerId !== traitor?.playerId);
    if (!helper || !traitor) {
        throw new Error('山屋首剧本电锯攻击夹具缺少英雄或叛徒');
    }

    core.currentExplorer = {
        ...core.currentExplorer,
        roomId: 'entrance-hall',
        traits: {
            might: 4,
            speed: 4,
            knowledge: 4,
            sanity: 4,
        },
        inventory: [{ id: 'chainsaw', name: '电锯', kind: 'item' }],
    };
    core.otherExplorers = [
        { ...helper },
        {
            ...traitor,
            roomId: 'entrance-hall',
            inventory: [],
            traits: {
                might: 8,
                speed: 8,
                knowledge: 4,
                sanity: 4,
            },
        },
    ];
    core.currentPlayer = core.currentExplorer.playerId;
    core.activeRoomId = 'entrance-hall';
    core.currentExplorerInventory = [...core.currentExplorer.inventory];
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.turnStartInventoryCardIds = ['chainsaw'];
    core.usedCardIdsThisTurn = [];
    core.activityLog = [];
    core.latestDiscovery = null;
    core.latestDiscoveryOwnerPlayerId = null;
    core.recentRoll = null;
    return core;
};

const createLeatherJacketDefenseCore = () => {
    const core = createFirstScenarioHauntCore();
    activateE2EExplorer(core, '0');
    const traitor = core.otherExplorers.find((explorer) => explorer.playerId === core.scenarioRuntime.traitorPlayerId);
    const helper = core.otherExplorers.find((explorer) => explorer.playerId !== traitor?.playerId);
    if (!helper || !traitor) {
        throw new Error('山屋首剧本皮夹克防御夹具缺少英雄或叛徒');
    }

    core.currentExplorer = {
        ...core.currentExplorer,
        roomId: 'entrance-hall',
        traits: {
            might: 4,
            speed: 4,
            knowledge: 4,
            sanity: 4,
        },
        inventory: [],
    };
    core.otherExplorers = [
        { ...helper },
        {
            ...traitor,
            roomId: 'entrance-hall',
            inventory: [{ id: 'leather-jacket', name: '皮夹克', kind: 'item' }],
            traits: {
                might: 8,
                speed: 8,
                knowledge: 4,
                sanity: 4,
            },
        },
    ];
    core.currentPlayer = core.currentExplorer.playerId;
    core.activeRoomId = 'entrance-hall';
    core.currentExplorerInventory = [];
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.turnStartInventoryCardIds = [];
    core.usedCardIdsThisTurn = [];
    core.activityLog = [];
    core.latestDiscovery = null;
    core.latestDiscoveryOwnerPlayerId = null;
    core.recentRoll = null;
    return core;
};

const createDynamiteRoomAttackCore = () => {
    const core = createFirstScenarioHauntCore();
    activateE2EExplorer(core, '0');
    const traitor = core.otherExplorers.find((explorer) => explorer.playerId === core.scenarioRuntime.traitorPlayerId);
    const helper = core.otherExplorers.find((explorer) => explorer.playerId !== traitor?.playerId);
    if (!helper || !traitor) {
        throw new Error('山屋首剧本炸药夹具缺少英雄或叛徒');
    }

    core.currentExplorer = {
        ...core.currentExplorer,
        roomId: 'grand-staircase',
        inventory: [{ id: 'dynamite', name: '炸药', kind: 'item' }],
    };
    if (core.scenarioRuntime.mummy?.girlRoomId === 'grand-staircase' || core.scenarioRuntime.mummy?.girlRoomId === 'hallway') {
        core.scenarioRuntime.mummy.girlRoomId = 'upper-landing';
    }
    core.otherExplorers = [
        { ...helper, roomId: 'entrance-hall' },
        {
            ...traitor,
            roomId: 'hallway',
            traits: {
                might: 8,
                speed: 2,
                knowledge: 4,
                sanity: 4,
            },
        },
    ];
    core.currentPlayer = core.currentExplorer.playerId;
    core.activeRoomId = 'grand-staircase';
    core.currentExplorerInventory = [...core.currentExplorer.inventory];
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.turnStartInventoryCardIds = ['dynamite'];
    core.usedCardIdsThisTurn = [];
    core.activityLog = [];
    core.latestDiscovery = null;
    core.latestDiscoveryOwnerPlayerId = null;
    core.recentRoll = null;
    core.pendingDamageAllocation = null;
    return core;
};

const completeMonsterPreparationForAttackSlot = (
    core: BetrayalCore,
    monsterId: string,
): void => {
    const movementGroup = resolveBetrayalMonsterMovementGroups(core)
        .find((group) => group.monsterIds.includes(monsterId));
    if (!movementGroup) {
        throw new Error(`找不到 ${monsterId} 的怪物移动骰组`);
    }
    const movementResult: BetrayalMonsterMovementRollGroupResult = {
        groupId: movementGroup.groupId,
        monsterName: movementGroup.monsterName,
        monsterIds: [...movementGroup.monsterIds],
        playerId: core.currentExplorer.playerId,
        speed: movementGroup.speed,
        diceCount: movementGroup.diceCount,
        dice: Array.from({ length: movementGroup.diceCount }, () => 0),
        total: 0,
        moveAllowance: 0,
        rollOnceForGroup: true,
        minimumMoveAllowance: movementGroup.minimumMoveAllowance,
    };
    core.scenarioRuntime.monsterTurn = {
        ...core.scenarioRuntime.monsterTurn,
        resolvedStartMonsterIds: Array.from(new Set([
            ...core.scenarioRuntime.monsterTurn.resolvedStartMonsterIds,
            ...movementGroup.monsterIds,
        ])),
        movementRollsByGroupId: {
            ...core.scenarioRuntime.monsterTurn.movementRollsByGroupId,
            [movementGroup.groupId]: movementResult,
        },
        moveRemainingById: {
            ...core.scenarioRuntime.monsterTurn.moveRemainingById,
            ...Object.fromEntries(movementGroup.monsterIds.map((id) => [id, 0])),
        },
    };
};

const createPhantomPhotographerLineOfSightAttackCore = () => {
    const eventCard = BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '说“茄子”！');
    if (!eventCard) {
        throw new Error('山屋事件池缺少魔法相机事件：说“茄子”！');
    }

    let core = createStartedFirstScenarioCore(['0', '1', '2']);
    core.drawOrder = ['event'];
    core.eventOrder = [eventCard];
    core.currentExplorer = removeMagicCameraFromE2EExplorer(core.currentExplorer);
    core.otherExplorers = core.otherExplorers.map(removeMagicCameraFromE2EExplorer);
    core.currentExplorer.inventory = [
        ...core.currentExplorer.inventory,
        { id: 'omen-book', name: '书本', kind: 'omen' },
        { id: 'dog', name: '狗', kind: 'omen' },
        { id: 'mask', name: '面具', kind: 'omen' },
    ];
    core.currentExplorerInventory = [...core.currentExplorer.inventory];
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.otherExplorers = core.otherExplorers.map((explorer) => (
        explorer.playerId === '1'
            ? { ...explorer, inventory: [...explorer.inventory, { id: 'camera', name: '魔法相机', kind: 'item' }] }
            : explorer
    ));

    core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'hallway' });
    core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.EXPLORE_ROOM, '0', { roomId: 'ground-north' });
    core = applyBetrayalCommand(
        core,
        BETRAYAL_COMMANDS.RESOLVE_EVENT_CHOICE,
        '0',
        { accept: true },
        100,
        createBetrayalScriptedRandom(3, 3, 3),
    );

    activateE2EExplorer(core, '1');
    const magicCamera = core.scenarioRuntime.magicCamera;
    const monsterId = magicCamera?.phantomPhotographerIds[0];
    if (!magicCamera || !monsterId) {
        throw new Error('山屋魔法相机夹具缺少幻影摄影师');
    }
    core.scenarioRuntime.magicCamera = {
        ...magicCamera,
        heroEssencePlayerIds: ['0'],
    };
    core.currentExplorer = {
        ...core.currentExplorer,
        roomId: 'hallway',
        inventory: [
            ...core.currentExplorer.inventory.filter((card) => !isMagicCameraTestCard(card)),
            { id: 'camera', name: '魔法相机', kind: 'item' },
        ],
    };
    core.otherExplorers = core.otherExplorers.map((explorer) => {
        if (explorer.playerId === '0') {
            return { ...explorer, roomId: 'upper-landing' };
        }
        if (explorer.playerId === '2') {
            return {
                ...explorer,
                roomId: 'entrance-hall',
                traits: {
                    might: 4,
                    speed: 4,
                    knowledge: 4,
                    sanity: 1,
                },
            };
        }
        return explorer;
    });
    core.monsters = core.monsters.map((monster) => (
        monster.id === monsterId
            ? { ...monster, roomId: 'grand-staircase', sanity: 6 }
            : monster
    ));
    core.activeRoomId = core.currentExplorer.roomId;
    core.currentExplorerInventory = [...core.currentExplorer.inventory];
    core.currentExplorerTraits = { ...core.currentExplorer.traits };
    core.turnEndedByDiscovery = false;
    core.turnStartInventoryCardIds = core.currentExplorer.inventory.map((card) => card.id);
    core.usedCardIdsThisTurn = [];
    core.recentRoll = null;
    core.latestDiscovery = null;
    core.latestDiscoveryOwnerPlayerId = null;
    completeMonsterPreparationForAttackSlot(core, monsterId);
    return core;
};

const readWeaponAttackState = async (page: Page) => page.evaluate(() => {
    const core = (window as Window & {
        __BG_TEST_HARNESS__?: { state?: { get?: () => { core: {
            currentExplorer: {
                playerId: string;
                roomId: string;
                inventory: { id: string }[];
                traits: { might: number; speed: number; knowledge: number; sanity: number };
            };
            otherExplorers: Array<{
                playerId: string;
                inventory: { id: string }[];
                traits: { might: number; speed: number; knowledge: number; sanity: number };
            }>;
            activePlayerId: string;
            scenarioRuntime: { traitorPlayerId: string | null };
            usedCardIdsThisTurn: string[];
            activityLog: Array<{ text: string }>;
            possessionOrderByKind: { item: { id: string }[] };
            pendingDamageAllocation?: {
                playerId: string;
                amount: number;
                originalAmount: number;
                damageKind: string;
                allowedTraits: string[];
                sourceTitle: string;
                damageReplacement?: {
                    kind: string;
                    cardId: string;
                    cardName: string;
                };
            } | null;
            recentRoll: {
                kind: string;
                dice: number[];
                latestLabel: string;
                attack?: {
                    damageKind?: string;
                    weaponCardId?: string;
                    weaponAttackTrait?: string;
                    weaponExtraDice?: number;
                    weaponSpeedCost?: number;
                    defenderRoll?: number;
                    defenderDefenseExtraDice?: number;
                    previousDamageToDefender?: number;
                    previousDamageToAttacker?: number;
                };
            } | null;
        } } } };
    }).__BG_TEST_HARNESS__?.state?.get?.().core;
    if (!core) {
        throw new Error('山屋测试 harness 未返回 core');
    }
    const attacker = [core.currentExplorer, ...core.otherExplorers].find((explorer) => explorer.playerId === '0');
    const traitor = [core.currentExplorer, ...core.otherExplorers]
        .find((explorer) => explorer.playerId === core.scenarioRuntime.traitorPlayerId);
    if (!attacker) {
        throw new Error('山屋攻击夹具缺少攻击者状态');
    }
    if (!traitor) {
        throw new Error('山屋攻击夹具缺少叛徒状态');
    }
    return {
        attackerRoomId: attacker.roomId,
        attackerInventoryIds: attacker.inventory.map((card) => card.id),
        attackerTraits: { ...attacker.traits },
        traitorPlayerId: traitor.playerId,
        traitorInventoryIds: traitor.inventory.map((card) => card.id),
        traitorTraits: { ...traitor.traits },
        activePlayerId: core.activePlayerId,
        usedCardIdsThisTurn: [...core.usedCardIdsThisTurn],
        activityLogTexts: core.activityLog.map((entry) => entry.text),
        possessionItemIds: core.possessionOrderByKind.item.map((card) => card.id),
        pendingDamageAllocation: core.pendingDamageAllocation
            ? {
                playerId: core.pendingDamageAllocation.playerId,
                amount: core.pendingDamageAllocation.amount,
                originalAmount: core.pendingDamageAllocation.originalAmount,
                damageKind: core.pendingDamageAllocation.damageKind,
                allowedTraits: [...core.pendingDamageAllocation.allowedTraits],
                sourceTitle: core.pendingDamageAllocation.sourceTitle,
                damageReplacement: core.pendingDamageAllocation.damageReplacement
                    ? { ...core.pendingDamageAllocation.damageReplacement }
                    : undefined,
            }
            : null,
        recentRoll: core.recentRoll
            ? {
                kind: core.recentRoll.kind,
                dice: [...core.recentRoll.dice],
                latestLabel: core.recentRoll.latestLabel,
                attack: core.recentRoll.attack
                    ? { ...core.recentRoll.attack }
                    : undefined,
            }
            : null,
    };
});

const resolveAttackDamageAllocation = async (
    page: Page,
    options: {
        playerId: string;
        damageKind: 'physical' | 'mental';
        trait: 'might' | 'speed' | 'knowledge' | 'sanity';
        allowedTraits: Array<'might' | 'speed' | 'knowledge' | 'sanity'>;
    },
) => {
    const state = await readWeaponAttackState(page);
    const pending = state.pendingDamageAllocation;
    const amount = pending?.amount ?? state.recentRoll?.attack?.previousDamageToDefender ?? 0;
    expect(amount).toBeGreaterThan(0);
    expect(pending).toMatchObject({
        playerId: options.playerId,
        amount,
        damageKind: options.damageKind,
        allowedTraits: expect.arrayContaining(options.allowedTraits),
    });
    await expect(page.getByTestId('betrayal-damage-allocation-panel')).toBeVisible();
    await expect(page.getByTestId('betrayal-damage-allocation-source')).toContainText('攻击');
    await expect(page.getByTestId('betrayal-damage-allocation-amount')).toContainText(
        `${amount} 点${options.damageKind === 'mental' ? '精神' : '物理'}伤害`,
    );
    await expect(page.getByTestId('betrayal-damage-allocation-confirm')).toBeDisabled();
    const traitDamage = page.getByTestId(`betrayal-damage-allocation-trait-${options.trait}`);
    for (let index = 0; index < amount; index += 1) {
        await traitDamage.click();
    }
    await expect(traitDamage).toHaveAttribute('data-damage-selected-count', String(amount));
    await expect(page.getByTestId('betrayal-damage-allocation-confirm')).toBeEnabled();
    return { amount, state };
};

test.describe('山屋惊魂非 P0 发布级代表链', () => {
    test('普通投骰事件代表链：真实页面同屏展示牌面、骰盘和分支结果', async ({ page, context }) => {
        test.setTimeout(120000);
        const diagnostics = await openBetrayalPage(page, context, 'betrayal-non-p0-ordinary-roll-event');

        await injectCore(page, createOrdinaryRollEventCore());
        await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });
        await setHarnessRandomQueue(page, [0.5, 0.01, 0.99, 0.01]);
        await page.getByTestId('betrayal-action-explore').click();
        await expect(page.getByTestId('betrayal-room-explore-target-ground-north')).toBeVisible();
        await saveScreenshot(page, ORDINARY_ROLL_EVENT_TARGET_SCREENSHOT);

        await page.getByTestId('betrayal-room-ground-north').click();
        await confirmPendingRoomPlacement(page);

        await expect(page.getByTestId('betrayal-discovery-panel')).toHaveAttribute('aria-label', /标本剥制/);
        await expect(page.getByTestId('betrayal-discovery-panel')).toHaveAttribute('data-card-testid', 'betrayal-discovery-card-reveal');
        await expect(page.getByTestId('betrayal-discovery-top-banner')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-discovery-resolution-steps')).toBeHidden();
        await expect(page.getByTestId('betrayal-event-roll-start')).toBeVisible();
        await expect(page.getByTestId('betrayal-event-roll-start')).toBeEnabled();
        await saveScreenshot(page, ORDINARY_ROLL_EVENT_CARD_FRONT_SCREENSHOT);
        await page.getByTestId('betrayal-event-roll-start').click();

        await expect(page.getByTestId('betrayal-discovery-detail')).toContainText(/检定|投|骰/);
        await expect(page.getByTestId('betrayal-discovery-detail')).toContainText('力量检定 3');
        await expect(page.getByTestId('betrayal-discovery-detail')).toContainText(/受到 1 点物理伤害|放置障碍物/);
        const eventRollPanel = page.getByTestId('betrayal-recent-roll-panel');
        await expect(page.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute('data-dice-count', '4');
        await expect(page.getByTestId('betrayal-recent-roll-breakdown')).toContainText('骰面合计');
        await expect(page.getByTestId('betrayal-recent-roll-breakdown')).toContainText('加值');
        const eventResultConfirm = page.getByTestId('betrayal-discovery-continue');
        await expect(eventResultConfirm).toBeVisible();
        await expect(eventResultConfirm).toHaveText('确认 0/1');
        await expect(eventResultConfirm).toHaveAttribute('data-event-roll-required-count', '1');
        await expect(eventResultConfirm).toHaveClass(/bg-\[#d6b56d\]/);
        await expect(eventResultConfirm).toHaveClass(/border-\[#d6b56d\]/);
        await expect(eventResultConfirm).toHaveCSS('border-radius', '0px');
        await expectVisiblePhysicalDiceBox(eventRollPanel);
        await waitForPhysicalDiceSettled(eventRollPanel);
        await expectPhysicalDiceSeparated(eventRollPanel, { minDiceCount: 4 });
        await saveScreenshot(page, ORDINARY_ROLL_EVENT_DICE_SCREENSHOT);
        await expect(eventResultConfirm).toBeVisible();
        await eventResultConfirm.click();
        await expect(page.getByTestId('betrayal-damage-allocation-panel')).toBeVisible();
        await saveScreenshot(page, ORDINARY_ROLL_EVENT_FULL_SCREENSHOT);

        assertNoFatalFrontendErrors([{ label: 'betrayal-non-p0-ordinary-roll-event', diagnostics }]);
    });

    test('雕像探索前持有物真实链路从选择到跳过事件结算关闭', async ({ page, context }) => {
        test.setTimeout(120000);
        const diagnostics = await openBetrayalPage(page, context, 'betrayal-non-p0-idol-skip-event');

        await injectCore(page, createIdolSkipEventCore());
        await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });
        await expect(page.getByTestId('betrayal-explore-options')).toBeVisible();
        await expect(page.getByTestId('betrayal-inventory-idol')).toBeVisible();
        await expect(page.getByTestId('betrayal-explore-option-idol')).toBeVisible();
        await expect(page.getByTestId('betrayal-explore-option-idol')).not.toHaveClass(/bg-\[rgba\(214,181,109,0\.24\)\]/);
        await saveScreenshot(page, IDOL_OPTION_BEFORE_SCREENSHOT);

        await page.getByTestId('betrayal-explore-option-idol').click();
        await expect(page.getByTestId('betrayal-explore-option-idol')).toHaveClass(/bg-\[rgba\(214,181,109,0\.24\)\]/);
        await expect(page.getByTestId('betrayal-action-explore')).toBeEnabled();
        await saveScreenshot(page, IDOL_OPTION_SELECTED_SCREENSHOT);

        await page.getByTestId('betrayal-action-explore').click();
        await expect(page.getByTestId('betrayal-room-explore-target-ground-north')).toBeVisible();
        await saveScreenshot(page, IDOL_EXPLORE_TARGET_SCREENSHOT);
        await page.getByTestId('betrayal-room-ground-north').click();
        await confirmPendingRoomPlacement(page);

        const discoveryPanel = page.getByTestId('betrayal-discovery-panel');
        await expect(discoveryPanel).toBeVisible({ timeout: 30000 });
        await expect(discoveryPanel).toHaveAttribute('aria-label', /事件牌 阴影扑面/);
        await expect(page.getByTestId('betrayal-discovery-detail')).toContainText('没有抽取或结算事件卡');
        await expect(page.getByTestId('betrayal-room-latest-feedback')).toContainText('使用雕像跳过了事件：阴影扑面');
        await saveScreenshot(page, IDOL_SKIP_EVENT_SCREENSHOT);

        const coreAfterSkip = await page.evaluate(() => (window as Window & {
            __BG_TEST_HARNESS__?: { state?: { get?: () => { core: {
                currentExplorer: { traits: { might: number }; inventory: { id: string }[] };
                discardCounts: { event: number };
            } } } };
        }).__BG_TEST_HARNESS__!.state!.get!().core);
        expect(coreAfterSkip.currentExplorer.traits.might).toBe(4);
        expect(coreAfterSkip.discardCounts.event).toBe(0);
        expect(coreAfterSkip.currentExplorer.inventory.some((card) => card.id === 'idol')).toBe(true);
        await saveScreenshot(page, IDOL_SKIP_SETTLED_SCREENSHOT);

        await dismissDiscoveryPanel(page);
        await expect(page.getByTestId('betrayal-discovery-panel')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-event-choice-panel')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-action-rail')).toBeVisible();
        await expect(page.getByTestId('betrayal-action-endTurn')).toBeVisible();
        await expect(page.getByTestId('betrayal-room-occupant-ground-north-0')).toBeVisible();
        await saveScreenshot(page, IDOL_DISMISSED_SCREENSHOT);

        assertNoFatalFrontendErrors([{ label: 'betrayal-non-p0-idol-skip-event', diagnostics }]);
    });

    test('砍刀攻击武器代表链：真实页面可选择武器并完成攻击反馈', async ({ page, context }) => {
        test.setTimeout(120000);
        const diagnostics = await openBetrayalPage(page, context, 'betrayal-non-p0-hunting-knife-attack');

        const injectedCore = createHuntingKnifeAttackCore();
        const traitorPlayerId = resolveRequiredTraitorPlayerId(injectedCore);
        await injectCore(page, injectedCore);
        await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });
        await expect(page.getByTestId('betrayal-attack-weapon-selector')).toBeVisible();
        await saveScreenshot(page, HUNTING_KNIFE_SELECTOR_SCREENSHOT);

        await page.getByTestId('betrayal-attack-weapon-hunting-knife').click();
        await enterAttackTargeting(page);
        const traitorToken = await expectTraitorTargetHighlighted(page, 'entrance-hall', traitorPlayerId);
        await saveScreenshot(page, HUNTING_KNIFE_TARGET_SCREENSHOT);

        await traitorToken.click();

        await expect(page.getByTestId('betrayal-room-latest-feedback')).toContainText('使用砍刀');
        const attackRollPanel = page.getByTestId('betrayal-recent-roll-panel');
        await expect(page.getByTestId('betrayal-house-dice-3d-group')).toBeVisible();
        await expect(attackRollPanel).toBeVisible();
        await expectVisiblePhysicalDiceBox(attackRollPanel);
        await waitForPhysicalDiceSettled(attackRollPanel);
        await expectPhysicalDiceSeparated(attackRollPanel, { minDiceCount: 4 });
        await saveLocatorScreenshot(attackRollPanel, HUNTING_KNIFE_ATTACK_DICE_SCREENSHOT);
        await saveScreenshot(page, HUNTING_KNIFE_ATTACK_FEEDBACK_SCREENSHOT);

        assertNoFatalFrontendErrors([{ label: 'betrayal-non-p0-hunting-knife-attack', diagnostics }]);
    });

    test('攻击武器禁用原因真实链路：保留刚获得和已使用武器但只允许可用武器攻击', async ({ page, context }) => {
        test.setTimeout(120000);
        const diagnostics = await openBetrayalPage(page, context, 'betrayal-non-p0-attack-weapon-disabled-reasons');

        const injectedCore = createAttackWeaponDisabledReasonsCore();
        const traitorPlayerId = resolveRequiredTraitorPlayerId(injectedCore);
        expect(injectedCore.currentExplorer.inventory.map((card) => card.id)).toEqual(['hunting-knife', 'dagger', 'ring']);
        expect(injectedCore.turnStartInventoryCardIds).toEqual(['hunting-knife', 'ring']);
        expect(injectedCore.usedCardIdsThisTurn).toEqual(['ring']);
        await injectCore(page, injectedCore);
        await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });
        await expect(page.getByTestId('betrayal-inventory-section')).toContainText('砍刀');
        await expect(page.getByTestId('betrayal-inventory-section')).toContainText('匕首');
        await expect(page.getByTestId('betrayal-inventory-section')).toContainText('指环');
        await expect(page.getByTestId('betrayal-attack-weapon-selector')).toBeVisible();
        await expect(page.getByTestId('betrayal-attack-weapon-none')).toHaveClass(/underline/);

        const huntingKnifeOption = page.getByTestId('betrayal-attack-weapon-option-hunting-knife');
        await expect(huntingKnifeOption).toHaveAttribute('data-attack-weapon-can-use', 'true');
        await expect(page.getByTestId('betrayal-attack-weapon-hunting-knife')).toBeEnabled();

        const daggerOption = page.getByTestId('betrayal-attack-weapon-option-dagger');
        await expect(daggerOption).toHaveAttribute('data-attack-weapon-can-use', 'false');
        await expect(daggerOption).toHaveAttribute('data-action-disabled-reason', '本回合新获得的武器不能立刻使用。');
        await expect(page.getByTestId('betrayal-attack-weapon-dagger')).toBeDisabled();
        await expect(page.getByTestId('betrayal-attack-weapon-dagger-disabled-reason')).toContainText('本回合新获得的武器不能立刻使用');

        const ringOption = page.getByTestId('betrayal-attack-weapon-option-ring');
        await expect(ringOption).toHaveAttribute('data-attack-weapon-can-use', 'false');
        await expect(ringOption).toHaveAttribute('data-action-disabled-reason', '这把武器本回合已经使用。');
        await expect(page.getByTestId('betrayal-attack-weapon-ring')).toBeDisabled();
        await expect(page.getByTestId('betrayal-attack-weapon-ring-disabled-reason')).toContainText('这把武器本回合已经使用');
        await saveScreenshot(page, ATTACK_WEAPON_DISABLED_REASONS_READY_SCREENSHOT);

        await page.getByTestId('betrayal-attack-weapon-hunting-knife').click();
        await expect(page.getByTestId('betrayal-attack-weapon-hunting-knife')).toHaveClass(/underline/);
        await expect(page.getByTestId('betrayal-attack-weapon-dagger')).toBeDisabled();
        await expect(page.getByTestId('betrayal-attack-weapon-ring')).toBeDisabled();
        await enterAttackTargeting(page);

        const traitorToken = await expectTraitorTargetHighlighted(page, 'entrance-hall', traitorPlayerId);
        await saveScreenshot(page, ATTACK_WEAPON_DISABLED_REASONS_TARGET_SCREENSHOT);

        await setHarnessRandomQueue(page, [0.5, 0.5, 0.5, 0.5, 0, 0, 0, 0]);
        await traitorToken.click();

        await expect(page.getByTestId('betrayal-room-latest-feedback')).toContainText('使用砍刀');
        await expect(page.getByTestId('betrayal-room-latest-feedback')).not.toContainText('使用匕首');
        await expect(page.getByTestId('betrayal-room-latest-feedback')).not.toContainText('使用指环');
        const attackRollPanel = page.getByTestId('betrayal-recent-roll-panel');
        await expect(attackRollPanel).toBeVisible();
        await expect(attackRollPanel).toContainText('攻击投骰');
        await expect(page.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute('data-dice-count', '4');
        await expectVisiblePhysicalDiceBox(attackRollPanel);
        await waitForPhysicalDiceSettled(attackRollPanel);
        await expectPhysicalDiceSeparated(attackRollPanel, { minDiceCount: 4 });
        await saveScreenshot(page, ATTACK_WEAPON_DISABLED_REASONS_FEEDBACK_SCREENSHOT);

        const afterAttack = await readWeaponAttackState(page);
        expect(afterAttack.recentRoll?.kind).toBe('attackRoll');
        expect(afterAttack.recentRoll?.attack?.weaponCardId).toBe('hunting-knife');
        expect(afterAttack.usedCardIdsThisTurn).toContain('hunting-knife');
        expect(afterAttack.usedCardIdsThisTurn).toContain('ring');
        expect(afterAttack.usedCardIdsThisTurn).not.toContain('dagger');

        assertNoFatalFrontendErrors([{ label: 'betrayal-non-p0-attack-weapon-disabled-reasons', diagnostics }]);
    });

    test('十字弓相邻攻击代表链：真实页面选择十字弓后高亮相邻叛徒且不画视线线', async ({ page, context }) => {
        test.setTimeout(120000);
        const diagnostics = await openBetrayalPage(page, context, 'betrayal-non-p0-crossbow-adjacent-attack');

        const injectedCore = createCrossbowAdjacentAttackCore();
        const traitorPlayerId = resolveRequiredTraitorPlayerId(injectedCore);
        expect(injectedCore.currentExplorer.inventory.map((card) => card.id)).toEqual(['crossbow']);
        await injectCore(page, injectedCore);
        await expect.poll(async () => {
            const state = await readWeaponAttackState(page);
            return {
                roomId: state.attackerRoomId,
                inventoryIds: state.attackerInventoryIds,
            };
        }, { timeout: 30000 }).toEqual({
            roomId: 'grand-staircase',
            inventoryIds: ['crossbow'],
        });
        await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });
        await expect(page.getByTestId('betrayal-inventory-crossbow')).toBeVisible();
        await expect(page.getByTestId('betrayal-attack-weapon-selector')).toBeVisible();
        await expect(page.getByTestId('betrayal-attack-weapon-crossbow')).toBeVisible();
        await expect(page.getByTestId('betrayal-line-of-sight-overlay')).toHaveCount(0);
        await saveScreenshot(page, CROSSBOW_ADJACENT_ATTACK_READY_SCREENSHOT);

        await page.getByTestId('betrayal-attack-weapon-crossbow').click();
        await expect(page.getByTestId('betrayal-attack-weapon-crossbow')).toHaveClass(/underline/);
        await expect(page.getByTestId('betrayal-line-of-sight-overlay')).toHaveCount(0);
        await saveScreenshot(page, CROSSBOW_ADJACENT_ATTACK_SELECTED_SCREENSHOT);
        await enterAttackTargeting(page);

        await expectTraitorTargetHighlighted(page, 'hallway', traitorPlayerId);
        await expect(page.getByTestId('betrayal-line-of-sight-overlay')).toHaveCount(0);
        await saveScreenshot(page, CROSSBOW_ADJACENT_ATTACK_TARGET_SCREENSHOT);

        assertNoFatalFrontendErrors([{ label: 'betrayal-non-p0-crossbow-adjacent-attack', diagnostics }]);
    });

    test('枪视线攻击真实链路：选择枪后连线视线目标并按速度造成物理伤害', async ({ page, context }) => {
        test.setTimeout(120000);
        const diagnostics = await openBetrayalPage(page, context, 'betrayal-non-p0-gun-line-of-sight-attack');

        const injectedCore = createGunLineOfSightAttackCore();
        const traitorPlayerId = resolveRequiredTraitorPlayerId(injectedCore);
        expect(injectedCore.currentExplorer.inventory.map((card) => card.id)).toEqual(['gun']);
        await injectCore(page, injectedCore);
        await expect.poll(async () => {
            const state = await readWeaponAttackState(page);
            return {
                roomId: state.attackerRoomId,
                inventoryIds: state.attackerInventoryIds,
                traitorInventoryIds: state.traitorInventoryIds,
            };
        }, { timeout: 30000 }).toEqual({
            roomId: 'grand-staircase',
            inventoryIds: ['gun'],
            traitorInventoryIds: [],
        });
        await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });
        await expect(page.getByTestId('betrayal-inventory-gun')).toBeVisible();
        await expect(page.getByTestId('betrayal-attack-weapon-selector')).toBeVisible();
        await expect(page.getByTestId('betrayal-attack-weapon-gun')).toBeVisible();
        await expect(page.getByTestId('betrayal-line-of-sight-overlay')).toHaveCount(0);
        const beforeAttack = await readWeaponAttackState(page);
        await saveScreenshot(page, GUN_ATTACK_READY_SCREENSHOT);

        await page.getByTestId('betrayal-attack-weapon-gun').click();
        await expect(page.getByTestId('betrayal-attack-weapon-gun')).toHaveClass(/underline/);
        await enterAttackTargeting(page);
        await expect(page.getByTestId('betrayal-line-of-sight-overlay')).toBeVisible();
        const lineOfSightLine = page.getByTestId('betrayal-line-of-sight-line-grand-staircase-entrance-hall-2');
        await expect(lineOfSightLine).toHaveAttribute('data-line-of-sight-source-room', 'grand-staircase');
        await expect(lineOfSightLine).toHaveAttribute('data-line-of-sight-target-room', 'entrance-hall');
        await expect(lineOfSightLine).toHaveAttribute('data-line-of-sight-weapon', 'gun');
        await saveScreenshot(page, GUN_ATTACK_SELECTED_SCREENSHOT);

        const traitorToken = await expectTraitorTargetHighlighted(page, 'entrance-hall', traitorPlayerId);
        await saveScreenshot(page, GUN_ATTACK_TARGET_SCREENSHOT);

        await setHarnessRandomQueue(page, [0.5, 0.5, 0, 0, 0, 0]);
        await traitorToken.click();

        await expect(page.getByTestId('betrayal-room-latest-feedback')).toContainText('使用枪');
        await expect(page.getByTestId('betrayal-room-latest-feedback')).toContainText('physical damage');
        const attackRollPanel = page.getByTestId('betrayal-recent-roll-panel');
        await expect(attackRollPanel).toBeVisible();
        await expect(page.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute('data-dice-count', '4');
        await expectVisiblePhysicalDiceBox(attackRollPanel);
        await waitForPhysicalDiceSettled(attackRollPanel);
        await expectPhysicalDiceSeparated(attackRollPanel, { minDiceCount: 4 });

        const afterAttackRoll = await readWeaponAttackState(page);
        expect(afterAttackRoll.recentRoll?.kind).toBe('attackRoll');
        expect(afterAttackRoll.recentRoll?.dice).toHaveLength(4);
        expect(afterAttackRoll.recentRoll?.attack?.weaponCardId).toBe('gun');
        expect(afterAttackRoll.recentRoll?.attack?.weaponAttackTrait).toBe('speed');
        expect(afterAttackRoll.recentRoll?.attack?.previousDamageToDefender).toBeGreaterThan(0);
        expect(afterAttackRoll.recentRoll?.attack?.previousDamageToAttacker).toBe(0);
        expect(afterAttackRoll.usedCardIdsThisTurn).toContain('gun');
        await resolveAttackDamageAllocation(page, {
            playerId: traitorPlayerId,
            damageKind: 'physical',
            trait: 'might',
            allowedTraits: ['might', 'speed'],
        });
        await saveScreenshot(page, GUN_ATTACK_RESULT_SCREENSHOT);
        await page.getByTestId('betrayal-damage-allocation-confirm').click();
        await expect(page.getByTestId('betrayal-damage-allocation-panel')).toHaveCount(0);

        const afterAllocation = await readWeaponAttackState(page);
        expect(afterAllocation.pendingDamageAllocation).toBeNull();
        expect(afterAllocation.traitorTraits.might + afterAllocation.traitorTraits.speed).toBeLessThan(
            beforeAttack.traitorTraits.might + beforeAttack.traitorTraits.speed,
        );
        expect(afterAllocation.attackerTraits).toEqual(beforeAttack.attackerTraits);
        await expect(page.getByTestId('betrayal-attack-weapon-gun')).toHaveCount(0);
        const gunAttackRollBackdrop = page.getByTestId('betrayal-roll-review-backdrop');
        await expect(gunAttackRollBackdrop).toHaveAttribute('data-backdrop-dismiss', 'disabled');
        await gunAttackRollBackdrop.click({ position: { x: 16, y: 16 } });
        await expect(page.getByTestId('betrayal-recent-roll-panel')).toBeVisible();
        await page.getByTestId('betrayal-roll-continue').click();
        await expect(page.getByTestId('betrayal-recent-roll-panel')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-action-rail')).toBeVisible();
        await expect(page.getByTestId('betrayal-board')).toBeVisible();
        await saveScreenshot(page, GUN_ATTACK_SETTLED_SCREENSHOT);

        assertNoFatalFrontendErrors([{ label: 'betrayal-non-p0-gun-line-of-sight-attack', diagnostics }]);
    });

    test('电锯攻击真实链路：选择电锯后额外1骰攻击并造成物理伤害', async ({ page, context }) => {
        test.setTimeout(120000);
        const diagnostics = await openBetrayalPage(page, context, 'betrayal-non-p0-chainsaw-attack');

        const injectedCore = createChainsawAttackCore();
        const traitorPlayerId = resolveRequiredTraitorPlayerId(injectedCore);
        expect(injectedCore.currentExplorer.inventory.map((card) => card.id)).toEqual(['chainsaw']);
        await injectCore(page, injectedCore);
        await expect.poll(async () => {
            const state = await readWeaponAttackState(page);
            return {
                roomId: state.attackerRoomId,
                inventoryIds: state.attackerInventoryIds,
            };
        }, { timeout: 30000 }).toEqual({
            roomId: 'entrance-hall',
            inventoryIds: ['chainsaw'],
        });
        await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });
        await expect(page.getByTestId('betrayal-inventory-chainsaw')).toBeVisible();
        await expect(page.getByTestId('betrayal-attack-weapon-selector')).toBeVisible();
        await expect(page.getByTestId('betrayal-attack-weapon-chainsaw')).toBeVisible();
        const beforeAttack = await readWeaponAttackState(page);
        await saveScreenshot(page, CHAINSAW_ATTACK_READY_SCREENSHOT);

        await page.getByTestId('betrayal-attack-weapon-chainsaw').click();
        await expect(page.getByTestId('betrayal-attack-weapon-chainsaw')).toHaveClass(/underline/);
        await saveScreenshot(page, CHAINSAW_ATTACK_SELECTED_SCREENSHOT);
        await enterAttackTargeting(page);

        const traitorToken = await expectTraitorTargetHighlighted(page, 'entrance-hall', traitorPlayerId);
        await saveScreenshot(page, CHAINSAW_ATTACK_TARGET_SCREENSHOT);

        await setHarnessRandomQueue(page, [
            0.5, 0.5, 0.5, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0,
        ]);
        await traitorToken.click();

        await expect(page.getByTestId('betrayal-room-latest-feedback')).toContainText('使用电锯');
        await expect(page.getByTestId('betrayal-room-latest-feedback')).toContainText('physical damage');
        const attackRollPanel = page.getByTestId('betrayal-recent-roll-panel');
        await expect(attackRollPanel).toBeVisible();
        await expect(page.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute('data-dice-count', '5');
        await expectVisiblePhysicalDiceBox(attackRollPanel);
        await waitForPhysicalDiceSettled(attackRollPanel);
        await expectPhysicalDiceSeparated(attackRollPanel, { minDiceCount: 5 });
        await saveScreenshot(page, CHAINSAW_ATTACK_DICE_SCREENSHOT);

        const afterAttackRoll = await readWeaponAttackState(page);
        expect(afterAttackRoll.recentRoll?.kind).toBe('attackRoll');
        expect(afterAttackRoll.recentRoll?.dice).toHaveLength(5);
        expect(afterAttackRoll.recentRoll?.attack?.damageKind).toBe('physical');
        expect(afterAttackRoll.recentRoll?.attack?.weaponCardId).toBe('chainsaw');
        expect(afterAttackRoll.recentRoll?.attack?.weaponAttackTrait).toBe('might');
        expect(afterAttackRoll.recentRoll?.attack?.weaponExtraDice).toBe(1);
        expect(afterAttackRoll.recentRoll?.attack?.previousDamageToDefender).toBeGreaterThan(0);
        expect(afterAttackRoll.usedCardIdsThisTurn).toContain('chainsaw');
        await resolveAttackDamageAllocation(page, {
            playerId: traitorPlayerId,
            damageKind: 'physical',
            trait: 'might',
            allowedTraits: ['might', 'speed'],
        });
        await saveScreenshot(page, CHAINSAW_ATTACK_RESULT_SCREENSHOT);
        await page.getByTestId('betrayal-damage-allocation-confirm').click();
        await expect(page.getByTestId('betrayal-damage-allocation-panel')).toHaveCount(0);

        const afterAllocation = await readWeaponAttackState(page);
        expect(afterAllocation.pendingDamageAllocation).toBeNull();
        expect(afterAllocation.traitorTraits.might + afterAllocation.traitorTraits.speed).toBeLessThan(
            beforeAttack.traitorTraits.might + beforeAttack.traitorTraits.speed,
        );
        await expect(page.getByTestId('betrayal-attack-weapon-chainsaw')).toHaveCount(0);
        const chainsawAttackRollBackdrop = page.getByTestId('betrayal-roll-review-backdrop');
        await expect(chainsawAttackRollBackdrop).toHaveAttribute('data-backdrop-dismiss', 'disabled');
        await chainsawAttackRollBackdrop.click({ position: { x: 16, y: 16 } });
        await expect(page.getByTestId('betrayal-recent-roll-panel')).toBeVisible();
        await page.getByTestId('betrayal-roll-continue').click();
        await expect(page.getByTestId('betrayal-recent-roll-panel')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-action-rail')).toBeVisible();
        await expect(page.getByTestId('betrayal-board')).toBeVisible();
        await saveScreenshot(page, CHAINSAW_ATTACK_SETTLED_SCREENSHOT);

        assertNoFatalFrontendErrors([{ label: 'betrayal-non-p0-chainsaw-attack', diagnostics }]);
    });

    test('皮夹克防御真实链路：攻击持有者时防御额外1骰并在复盘显示', async ({ page, context }) => {
        test.setTimeout(120000);
        const diagnostics = await openBetrayalPage(page, context, 'betrayal-non-p0-leather-jacket-defense');

        const injectedCore = createLeatherJacketDefenseCore();
        const traitorPlayerId = resolveRequiredTraitorPlayerId(injectedCore);
        expect(injectedCore.currentExplorer.inventory).toEqual([]);
        await injectCore(page, injectedCore);
        await expect.poll(async () => {
            const state = await readWeaponAttackState(page);
            return {
                roomId: state.attackerRoomId,
                inventoryIds: state.attackerInventoryIds,
                traitorInventoryIds: state.traitorInventoryIds,
            };
        }, { timeout: 30000 }).toEqual({
            roomId: 'entrance-hall',
            inventoryIds: [],
            traitorInventoryIds: ['leather-jacket'],
        });
        await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });
        const beforeAttack = await readWeaponAttackState(page);
        await saveScreenshot(page, LEATHER_JACKET_READY_SCREENSHOT);

        await enterAttackTargeting(page);
        const traitorToken = await expectTraitorTargetHighlighted(page, 'entrance-hall', traitorPlayerId);
        await saveScreenshot(page, LEATHER_JACKET_TARGET_SCREENSHOT);

        await setHarnessRandomQueue(page, [
            0.5, 0.5, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0,
        ]);
        await traitorToken.click();

        const attackRollPanel = page.getByTestId('betrayal-recent-roll-panel');
        await expect(attackRollPanel).toBeVisible();
        await expect(page.getByTestId('betrayal-recent-roll-attack-comparison')).toContainText('防御额外 1 骰');
        await expect(page.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute('data-dice-count', '4');
        await expectVisiblePhysicalDiceBox(attackRollPanel);
        await waitForPhysicalDiceSettled(attackRollPanel);
        await saveScreenshot(page, LEATHER_JACKET_RESULT_SCREENSHOT);

        const afterAttackRoll = await readWeaponAttackState(page);
        expect(afterAttackRoll.recentRoll?.kind).toBe('attackRoll');
        expect(afterAttackRoll.recentRoll?.dice).toHaveLength(4);
        expect(afterAttackRoll.recentRoll?.attack?.defenderDefenseExtraDice).toBe(1);
        expect(afterAttackRoll.recentRoll?.attack?.defenderRoll).toBe(0);
        expect(afterAttackRoll.recentRoll?.attack?.previousDamageToDefender).toBeGreaterThan(0);
        await resolveAttackDamageAllocation(page, {
            playerId: traitorPlayerId,
            damageKind: 'physical',
            trait: 'speed',
            allowedTraits: ['might', 'speed'],
        });
        await page.getByTestId('betrayal-damage-allocation-confirm').click();
        await expect(page.getByTestId('betrayal-damage-allocation-panel')).toHaveCount(0);

        const afterAllocation = await readWeaponAttackState(page);
        expect(afterAllocation.pendingDamageAllocation).toBeNull();
        expect(afterAllocation.traitorTraits.might + afterAllocation.traitorTraits.speed).toBeLessThan(
            beforeAttack.traitorTraits.might + beforeAttack.traitorTraits.speed,
        );
        const leatherJacketAttackRollBackdrop = page.getByTestId('betrayal-roll-review-backdrop');
        await expect(leatherJacketAttackRollBackdrop).toHaveAttribute('data-backdrop-dismiss', 'disabled');
        await leatherJacketAttackRollBackdrop.click({ position: { x: 16, y: 16 } });
        await expect(page.getByTestId('betrayal-recent-roll-panel')).toBeVisible();
        await page.getByTestId('betrayal-roll-continue').click();
        await expect(page.getByTestId('betrayal-recent-roll-panel')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-action-rail')).toBeVisible();
        await expect(page.getByTestId('betrayal-board')).toBeVisible();
        await saveScreenshot(page, LEATHER_JACKET_SETTLED_SCREENSHOT);

        assertNoFatalFrontendErrors([{ label: 'betrayal-non-p0-leather-jacket-defense', diagnostics }]);
    });

    test('炸药房间攻击真实链路：直点当前或相邻房间后消耗炸药并进入伤害分配', async ({ page, context }) => {
        test.setTimeout(120000);
        const diagnostics = await openBetrayalPage(page, context, 'betrayal-non-p0-dynamite-room-attack');

        const injectedCore = createDynamiteRoomAttackCore();
        const traitorPlayerId = resolveRequiredTraitorPlayerId(injectedCore);
        expect(injectedCore.currentExplorer.inventory.map((card) => card.id)).toEqual(['dynamite']);
        await injectCore(page, injectedCore);
        await expect.poll(async () => {
            const state = await readWeaponAttackState(page);
            return {
                roomId: state.attackerRoomId,
                inventoryIds: state.attackerInventoryIds,
            };
        }, { timeout: 30000 }).toEqual({
            roomId: 'grand-staircase',
            inventoryIds: ['dynamite'],
        });
        await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });
        await expect(page.getByTestId('betrayal-inventory-dynamite')).toBeVisible();
        await expect(page.getByTestId('betrayal-attack-weapon-selector')).toBeVisible();
        await expect(page.getByTestId('betrayal-attack-weapon-dynamite')).toBeVisible();
        await expect(page.getByTestId('betrayal-room-dynamite-target-card-highlight-grand-staircase')).toHaveCount(0);
        await saveScreenshot(page, DYNAMITE_ROOM_ATTACK_READY_SCREENSHOT);

        await page.getByTestId('betrayal-action-use').click();
        await expect(page.getByTestId('betrayal-room-dynamite-target-card-highlight-grand-staircase')).toBeVisible();
        await expect(page.getByTestId('betrayal-room-dynamite-target-card-highlight-hallway')).toBeVisible();
        await expect(page.getByTestId('betrayal-room-entrance-hall')).not.toHaveAttribute('data-direct-action', 'dynamite-room');
        await expect(page.getByTestId('betrayal-room-hallway')).toHaveAttribute('data-direct-action', 'dynamite-room');
        await expect(page.getByTestId('betrayal-room-hallway')).toHaveAttribute('data-direct-target', 'true');
        await expect(page.getByTestId(`betrayal-room-occupant-target-outline-hallway-${traitorPlayerId}`)).toHaveCount(0);
        await saveScreenshot(page, DYNAMITE_ROOM_ATTACK_TARGET_SCREENSHOT);

        await setHarnessRandomQueue(page, [0, 0, 0, 0]);
        await page.getByTestId('betrayal-room-hallway').click({ position: { x: 20, y: 20 } });

        await expect(page.getByTestId('betrayal-room-latest-feedback')).toContainText('使用炸药攻击');
        await expect(page.getByTestId('betrayal-room-latest-feedback')).toContainText('速度检定失败');
        await expect(page.getByTestId('betrayal-inventory-dynamite')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-room-dynamite-target-card-highlight-hallway')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-damage-allocation-panel')).toBeVisible();
        await expect(page.getByTestId('betrayal-damage-allocation-source')).toContainText('炸药');
        await expect(page.getByTestId('betrayal-damage-allocation-amount')).toContainText('4 点物理伤害');
        await expect(page.getByTestId('betrayal-damage-allocation-traits')).toContainText('力量');
        await expect(page.getByTestId('betrayal-damage-allocation-traits')).toContainText('速度');

        const afterDynamite = await readWeaponAttackState(page);
        expect(afterDynamite.pendingDamageAllocation).toMatchObject({
            playerId: traitorPlayerId,
            sourceTitle: '炸药',
            damageKind: 'physical',
            amount: 4,
            allowedTraits: expect.arrayContaining(['might', 'speed']),
        });
        expect(afterDynamite.activePlayerId).toBe(traitorPlayerId);
        expect(afterDynamite.attackerInventoryIds).not.toContain('dynamite');
        expect(afterDynamite.usedCardIdsThisTurn).toEqual(expect.arrayContaining(['haunt-attack', 'dynamite']));
        expect(afterDynamite.possessionItemIds.at(-1)).toBe('dynamite');
        await saveScreenshot(page, DYNAMITE_ROOM_ATTACK_DAMAGE_SCREENSHOT);

        const mightDamage = page.getByTestId('betrayal-damage-allocation-trait-might');
        for (let index = 0; index < 4; index += 1) {
            await mightDamage.click();
        }
        await expect(mightDamage).toHaveAttribute('data-damage-selected-count', '4');
        await expect(page.getByTestId('betrayal-damage-allocation-confirm')).toBeEnabled();
        await page.getByTestId('betrayal-damage-allocation-confirm').click();
        await expect(page.getByTestId('betrayal-damage-allocation-panel')).toHaveCount(0);

        const afterAllocation = await readWeaponAttackState(page);
        expect(afterAllocation.pendingDamageAllocation).toBeNull();
        expect(afterAllocation.attackerInventoryIds).not.toContain('dynamite');
        expect(afterAllocation.traitorTraits.might + afterAllocation.traitorTraits.speed).toBeLessThan(
            afterDynamite.traitorTraits.might + afterDynamite.traitorTraits.speed,
        );
        await expect(page.getByTestId('betrayal-action-rail')).toBeVisible();
        await expect(page.getByTestId('betrayal-board')).toBeVisible();
        await saveScreenshot(page, DYNAMITE_ROOM_ATTACK_SETTLED_SCREENSHOT);

        assertNoFatalFrontendErrors([{ label: 'betrayal-non-p0-dynamite-room-attack', diagnostics }]);
    });

    test('幻影摄影师视线攻击代表链：真实页面高亮视线内英雄并显示非交互连线', async ({ page, context }) => {
        test.setTimeout(120000);
        const diagnostics = await openBetrayalPage(page, context, 'betrayal-non-p0-phantom-photographer-line-of-sight');

        const injectedCore = createPhantomPhotographerLineOfSightAttackCore();
        await injectCore(page, injectedCore);
        await expect.poll(async () => {
            const state = await readPhantomPhotographerAttackState(page);
            return {
                currentPlayer: state.currentPlayer,
                currentExplorerPlayerId: state.currentExplorerPlayerId,
                currentExplorerRoomId: state.currentExplorerRoomId,
                hauntCardNumber: state.hauntCardNumber,
                traitorPlayerId: state.traitorPlayerId,
                targetHeroRoomId: state.targetHero?.roomId,
                phantomRoomId: state.phantomPhotographer?.roomId,
            };
        }, { timeout: 30000 }).toEqual({
            currentPlayer: '1',
            currentExplorerPlayerId: '1',
            currentExplorerRoomId: 'hallway',
            hauntCardNumber: 33,
            traitorPlayerId: '1',
            targetHeroRoomId: 'entrance-hall',
            phantomRoomId: 'grand-staircase',
        });
        await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });
        const monsterAttackAction = page.getByTestId('betrayal-action-monsterAttack');
        await expect(monsterAttackAction).toBeVisible();
        await expect(monsterAttackAction).toContainText('幻影摄影师攻击');
        const phantomPhotographerToken = page.getByTestId('betrayal-room-monster-grand-staircase-phantom-photographer-1');
        await expect(phantomPhotographerToken).toBeVisible();
        const targetHeroToken = page.getByTestId('betrayal-room-occupant-entrance-hall-2');
        await expect(targetHeroToken).toBeVisible();
        await expect(targetHeroToken).not.toHaveAttribute('data-direct-target', 'true');
        await expect(page.getByTestId('betrayal-room-occupant-target-outline-entrance-hall-2')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-line-of-sight-overlay')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-bottom-teammate-2')).not.toContainText('摄影师攻击');
        await saveScreenshot(page, PHANTOM_PHOTOGRAPHER_READY_SCREENSHOT);

        await monsterAttackAction.click();
        await expect(monsterAttackAction).toContainText('取消攻击');
        await expect(page.getByTestId('betrayal-action-cue')).toContainText('幻影摄影师');
        await expect(phantomPhotographerToken).toHaveAttribute('data-direct-target', 'true');
        await phantomPhotographerToken.click();
        await expect(targetHeroToken).toHaveAttribute('data-direct-target', 'true');
        const targetHeroOutline = page.getByTestId('betrayal-room-occupant-target-outline-entrance-hall-2');
        await expect(targetHeroOutline).toHaveAttribute('data-highlight-shape', 'pentagon');
        await expect(page.getByTestId('betrayal-line-of-sight-overlay')).toBeVisible();
        const lineOfSightLine = page.getByTestId('betrayal-line-of-sight-line-grand-staircase-entrance-hall-2');
        await expect(lineOfSightLine).toHaveAttribute('data-line-of-sight-source-room', 'grand-staircase');
        await expect(lineOfSightLine).toHaveAttribute('data-line-of-sight-source-monster', 'phantom-photographer-1');
        await expect(lineOfSightLine).toHaveAttribute('data-line-of-sight-target-room', 'entrance-hall');
        await expect(lineOfSightLine).toHaveAttribute('data-line-of-sight-target-player', '2');
        await expect(lineOfSightLine).toHaveAttribute('data-line-of-sight-kind', 'phantom-photographer');
        await expect(lineOfSightLine.locator('line')).toHaveCount(2);
        await expect(lineOfSightLine.locator('circle')).toHaveCount(1);
        await saveScreenshot(page, PHANTOM_PHOTOGRAPHER_TARGET_SCREENSHOT);

        await setHarnessRandomQueue(page, [0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0]);
        await targetHeroToken.click();

        await expect(page.getByTestId('betrayal-room-latest-feedback')).toContainText('幻影摄影师');
        await expect(page.getByTestId('betrayal-room-latest-feedback')).toContainText('精神伤害');
        const attackRollPanel = page.getByTestId('betrayal-recent-roll-panel');
        await expect(attackRollPanel).toBeVisible();
        await expect(attackRollPanel).toContainText('幻影摄影师攻击');
        await expect(attackRollPanel).toContainText('神志攻击');
        await expect(page.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute('data-dice-count', '6');
        await expectVisiblePhysicalDiceBox(attackRollPanel);
        await waitForPhysicalDiceSettled(attackRollPanel);
        await expectPhysicalDiceSeparated(attackRollPanel, { minDiceCount: 6 });
        await saveScreenshot(page, PHANTOM_PHOTOGRAPHER_DICE_SCREENSHOT);

        const afterAttack = await readPhantomPhotographerAttackState(page);
        expect(afterAttack.recentRoll?.kind).toBe('hauntActionTraitCheck');
        expect(afterAttack.targetHero?.traits.sanity).toBeLessThan(1);

        assertNoFatalFrontendErrors([{ label: 'betrayal-non-p0-phantom-photographer-line-of-sight', diagnostics }]);
    });

    test('无武器攻击真实链路：默认徒手目标高亮后4骰攻击并造成物理伤害', async ({ page, context }) => {
        test.setTimeout(120000);
        const diagnostics = await openBetrayalPage(page, context, 'betrayal-non-p0-unarmed-attack');

        const injectedCore = createUnarmedAttackCore();
        const traitorPlayerId = resolveRequiredTraitorPlayerId(injectedCore);
        await injectCore(page, injectedCore);
        await expect.poll(async () => {
            const state = await readWeaponAttackState(page);
            return {
                roomId: state.attackerRoomId,
                inventoryIds: state.attackerInventoryIds,
            };
        }, { timeout: 30000 }).toEqual({
            roomId: 'entrance-hall',
            inventoryIds: [],
        });
        await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });
        await expect(page.getByTestId('betrayal-inventory-section')).not.toContainText('匕首');
        await expect(page.getByTestId('betrayal-inventory-section')).not.toContainText('指环');
        await expect(page.getByTestId('betrayal-inventory-section')).not.toContainText('砍刀');
        const beforeAttack = await readWeaponAttackState(page);
        expect(beforeAttack.recentRoll).toBeNull();
        await saveScreenshot(page, UNARMED_ATTACK_READY_SCREENSHOT);

        await expect(page.getByTestId('betrayal-action-cue')).toContainText('点攻击叛徒');
        await expect(page.getByTestId('betrayal-attack-weapon-selector')).toHaveCount(0);
        await saveScreenshot(page, UNARMED_ATTACK_DEFAULT_SCREENSHOT);
        await enterAttackTargeting(page);

        const traitorToken = await expectTraitorTargetHighlighted(page, 'entrance-hall', traitorPlayerId);
        await saveScreenshot(page, UNARMED_ATTACK_TARGET_SCREENSHOT);

        await setHarnessRandomQueue(page, [0.5, 0.5, 0.5, 0.5, 0, 0, 0, 0]);
        await traitorToken.click();

        await expect(page.getByTestId('betrayal-room-latest-feedback')).toContainText('physical damage');
        await expect(page.getByTestId('betrayal-room-latest-feedback')).not.toContainText('使用匕首');
        await expect(page.getByTestId('betrayal-room-latest-feedback')).not.toContainText('使用指环');
        const attackRollPanel = page.getByTestId('betrayal-recent-roll-panel');
        await expect(attackRollPanel).toBeVisible();
        await expect(attackRollPanel).toContainText('攻击投骰');
        await expect(page.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute('data-dice-count', '4');
        await expectVisiblePhysicalDiceBox(attackRollPanel);
        await waitForPhysicalDiceSettled(attackRollPanel);
        await expectPhysicalDiceSeparated(attackRollPanel, { minDiceCount: 4 });
        await saveScreenshot(page, UNARMED_ATTACK_DICE_SCREENSHOT);

        const afterAttackRoll = await readWeaponAttackState(page);
        expect(afterAttackRoll.recentRoll?.kind).toBe('attackRoll');
        expect(afterAttackRoll.recentRoll?.dice).toHaveLength(4);
        expect(afterAttackRoll.recentRoll?.attack?.damageKind).toBe('physical');
        expect(afterAttackRoll.recentRoll?.attack?.weaponCardId).toBeUndefined();
        expect(afterAttackRoll.recentRoll?.attack?.weaponAttackTrait).toBeUndefined();
        expect(afterAttackRoll.recentRoll?.attack?.weaponExtraDice).toBeUndefined();
        expect(afterAttackRoll.recentRoll?.attack?.weaponSpeedCost).toBeUndefined();
        expect(afterAttackRoll.recentRoll?.attack?.previousDamageToDefender).toBeGreaterThan(0);
        expect(afterAttackRoll.recentRoll?.attack?.previousDamageToAttacker).toBe(0);
        expect(afterAttackRoll.usedCardIdsThisTurn).toContain('haunt-attack');
        expect(afterAttackRoll.usedCardIdsThisTurn).not.toContain('dagger');
        expect(afterAttackRoll.usedCardIdsThisTurn).not.toContain('ring');
        expect(afterAttackRoll.pendingDamageAllocation).toMatchObject({
            playerId: traitorPlayerId,
            damageKind: 'physical',
            allowedTraits: expect.arrayContaining(['might', 'speed']),
        });
        const damageToDefender = afterAttackRoll.recentRoll?.attack?.previousDamageToDefender ?? 0;
        await expect(page.getByTestId('betrayal-damage-allocation-panel')).toBeVisible();
        await expect(page.getByTestId('betrayal-damage-allocation-source')).toContainText('攻击');
        await expect(page.getByTestId('betrayal-damage-allocation-amount')).toContainText(`${damageToDefender} 点物理伤害`);
        await expect(page.getByTestId('betrayal-damage-allocation-traits')).toContainText('力量');
        await expect(page.getByTestId('betrayal-damage-allocation-traits')).toContainText('速度');
        await expect(page.getByTestId('betrayal-damage-allocation-confirm')).toBeDisabled();
        const mightDamage = page.getByTestId('betrayal-damage-allocation-trait-might');
        for (let index = 0; index < damageToDefender; index += 1) {
            await mightDamage.click();
        }
        await expect(mightDamage).toHaveAttribute('data-damage-selected-count', String(damageToDefender));
        await expect(page.getByTestId('betrayal-damage-allocation-confirm')).toBeEnabled();
        await saveScreenshot(page, UNARMED_ATTACK_RESULT_SCREENSHOT);
        await page.getByTestId('betrayal-damage-allocation-confirm').click();
        await expect(page.getByTestId('betrayal-damage-allocation-panel')).toHaveCount(0);

        const afterAllocation = await readWeaponAttackState(page);
        expect(afterAllocation.pendingDamageAllocation).toBeNull();
        expect(afterAllocation.traitorTraits.might + afterAllocation.traitorTraits.speed).toBeLessThan(
            beforeAttack.traitorTraits.might + beforeAttack.traitorTraits.speed,
        );
        expect(afterAllocation.traitorTraits.knowledge + afterAllocation.traitorTraits.sanity).toBe(
            beforeAttack.traitorTraits.knowledge + beforeAttack.traitorTraits.sanity,
        );
        expect(afterAllocation.attackerTraits).toEqual(beforeAttack.attackerTraits);

        const attackRollBackdrop = page.getByTestId('betrayal-roll-review-backdrop');
        await expect(attackRollBackdrop).toHaveAttribute('data-backdrop-dismiss', 'disabled');
        await attackRollBackdrop.click({ position: { x: 16, y: 16 } });
        await expect(page.getByTestId('betrayal-recent-roll-panel')).toBeVisible();
        await page.getByTestId('betrayal-roll-continue').click();
        await expect(page.getByTestId('betrayal-recent-roll-panel')).toHaveCount(0);
        await expect(page.getByTestId(`betrayal-room-occupant-target-outline-entrance-hall-${traitorPlayerId}`)).toHaveCount(0);
        await expect(page.getByTestId('betrayal-action-rail')).toBeVisible();
        await expect(page.getByTestId('betrayal-board')).toBeVisible();
        await saveScreenshot(page, UNARMED_ATTACK_SETTLED_SCREENSHOT);

        assertNoFatalFrontendErrors([{ label: 'betrayal-non-p0-unarmed-attack', diagnostics }]);
    });

    test('奇异护符物理伤害真实链路：实际承受物理伤害后获得 1 点神志', async ({ page, context }) => {
        test.setTimeout(120000);
        const diagnostics = await openBetrayalPage(page, context, 'betrayal-non-p0-strange-amulet-physical-damage');

        const injectedCore = createStrangeAmuletPhysicalDamageCore();
        const traitorPlayerId = resolveRequiredTraitorPlayerId(injectedCore);
        expect(injectedCore.currentExplorer.inventory).toEqual([]);
        expect(injectedCore.otherExplorers.find((explorer) => explorer.playerId === traitorPlayerId)?.inventory.map((card) => card.id))
            .toEqual(['strange-amulet']);
        await injectCore(page, injectedCore);
        await expect.poll(async () => {
            const state = await readWeaponAttackState(page);
            return {
                roomId: state.attackerRoomId,
                inventoryIds: state.attackerInventoryIds,
                traitorInventoryIds: state.traitorInventoryIds,
            };
        }, { timeout: 30000 }).toEqual({
            roomId: 'entrance-hall',
            inventoryIds: [],
            traitorInventoryIds: ['strange-amulet'],
        });
        await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });
        const beforeAttack = await readWeaponAttackState(page);
        expect(beforeAttack.recentRoll).toBeNull();
        await saveScreenshot(page, STRANGE_AMULET_READY_SCREENSHOT);

        await enterAttackTargeting(page);
        const traitorToken = await expectTraitorTargetHighlighted(page, 'entrance-hall', traitorPlayerId);
        await saveScreenshot(page, STRANGE_AMULET_TARGET_SCREENSHOT);

        await setHarnessRandomQueue(page, [0.5, 0.5, 0.5, 0.5, 0, 0, 0, 0]);
        await traitorToken.click();

        await expect(page.getByTestId('betrayal-room-latest-feedback')).toContainText('physical damage');
        const attackRollPanel = page.getByTestId('betrayal-recent-roll-panel');
        await expect(attackRollPanel).toBeVisible();
        await expect(attackRollPanel).toContainText('攻击投骰');
        await expect(page.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute('data-dice-count', '4');
        await expectVisiblePhysicalDiceBox(attackRollPanel);
        await waitForPhysicalDiceSettled(attackRollPanel);
        await expectPhysicalDiceSeparated(attackRollPanel, { minDiceCount: 4 });
        await saveScreenshot(page, STRANGE_AMULET_DICE_SCREENSHOT);

        const afterAttackRoll = await readWeaponAttackState(page);
        const pendingDamage = afterAttackRoll.pendingDamageAllocation;
        expect(afterAttackRoll.recentRoll?.kind).toBe('attackRoll');
        expect(afterAttackRoll.recentRoll?.attack?.damageKind).toBe('physical');
        expect(afterAttackRoll.recentRoll?.attack?.weaponCardId).toBeUndefined();
        expect(afterAttackRoll.recentRoll?.attack?.previousDamageToDefender).toBeGreaterThan(0);
        expect(pendingDamage).toMatchObject({
            playerId: traitorPlayerId,
            damageKind: 'physical',
            allowedTraits: expect.arrayContaining(['might', 'speed']),
        });
        expect(pendingDamage?.originalAmount).toBe(afterAttackRoll.recentRoll?.attack?.previousDamageToDefender);
        const damageAmount = pendingDamage?.amount ?? 0;
        expect(damageAmount).toBeGreaterThan(0);
        await expect(page.getByTestId('betrayal-damage-allocation-panel')).toBeVisible();
        await expect(page.getByTestId('betrayal-damage-allocation-amount')).toContainText(`${damageAmount} 点物理伤害`);
        await expect(page.getByTestId('betrayal-damage-allocation-traits')).toContainText('力量');
        await expect(page.getByTestId('betrayal-damage-allocation-traits')).toContainText('速度');
        const mightDamage = page.getByTestId('betrayal-damage-allocation-trait-might');
        const mightDamageCount = Math.min(1, damageAmount);
        for (let index = 0; index < mightDamageCount; index += 1) {
            await mightDamage.click();
        }
        await expect(mightDamage).toHaveAttribute('data-damage-selected-count', String(mightDamageCount));
        const speedDamage = page.getByTestId('betrayal-damage-allocation-trait-speed');
        const speedDamageCount = damageAmount - mightDamageCount;
        for (let index = 0; index < speedDamageCount; index += 1) {
            await speedDamage.click();
        }
        await expect(speedDamage).toHaveAttribute('data-damage-selected-count', String(speedDamageCount));
        await expect(page.getByTestId('betrayal-damage-allocation-confirm')).toBeEnabled();
        await saveScreenshot(page, STRANGE_AMULET_PANEL_SCREENSHOT);
        await page.getByTestId('betrayal-damage-allocation-confirm').click();
        await expect(page.getByTestId('betrayal-damage-allocation-panel')).toHaveCount(0);

        const afterAllocation = await readWeaponAttackState(page);
        expect(afterAllocation.pendingDamageAllocation).toBeNull();
        expect(afterAllocation.traitorTraits.might + afterAllocation.traitorTraits.speed).toBe(
            beforeAttack.traitorTraits.might + beforeAttack.traitorTraits.speed - damageAmount,
        );
        expect(afterAllocation.traitorTraits.sanity).toBe(beforeAttack.traitorTraits.sanity + 1);
        expect(afterAllocation.traitorTraits.knowledge).toBe(beforeAttack.traitorTraits.knowledge);
        expect(afterAllocation.activityLogTexts.join('\n')).toContain('奇异护符使神志 +1');
        await expect(page.getByTestId('betrayal-room-latest-feedback')).toContainText('奇异护符使神志 +1');

        const attackRollBackdrop = page.getByTestId('betrayal-roll-review-backdrop');
        await expect(attackRollBackdrop).toHaveAttribute('data-backdrop-dismiss', 'disabled');
        await attackRollBackdrop.click({ position: { x: 16, y: 16 } });
        await expect(page.getByTestId('betrayal-recent-roll-panel')).toBeVisible();
        await page.getByTestId('betrayal-roll-continue').click();
        await expect(page.getByTestId('betrayal-recent-roll-panel')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-action-rail')).toBeVisible();
        await saveScreenshot(page, STRANGE_AMULET_SETTLED_SCREENSHOT);

        assertNoFatalFrontendErrors([{ label: 'betrayal-non-p0-strange-amulet-physical-damage', diagnostics }]);
    });

    test('指环神志攻击真实链路：选择指环后用神志对攻并造成精神伤害', async ({ page, context }) => {
        test.setTimeout(120000);
        const diagnostics = await openBetrayalPage(page, context, 'betrayal-non-p0-ring-sanity-attack');

        const injectedCore = createRingAttackCore();
        const traitorPlayerId = resolveRequiredTraitorPlayerId(injectedCore);
        expect(injectedCore.currentExplorer.inventory.map((card) => card.id)).toEqual(['ring']);
        await injectCore(page, injectedCore);
        await expect.poll(async () => {
            const state = await readWeaponAttackState(page);
            return {
                roomId: state.attackerRoomId,
                inventoryIds: state.attackerInventoryIds,
            };
        }, { timeout: 30000 }).toEqual({
            roomId: 'entrance-hall',
            inventoryIds: ['ring'],
        });
        await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });
        await expect(page.getByTestId('betrayal-inventory-ring')).toBeVisible();
        await expect(page.getByTestId('betrayal-inventory-section')).toContainText('指环');
        await expect(page.getByTestId('betrayal-inventory-section')).not.toContainText('兔脚');
        await expect(page.getByTestId('betrayal-inventory-section')).not.toContainText('地图');
        await expect(page.getByTestId('betrayal-inventory-section')).not.toContainText('魔法相机');
        await expect(page.getByTestId('betrayal-attack-weapon-selector')).toBeVisible();
        await expect(page.getByTestId('betrayal-attack-weapon-ring')).toBeVisible();
        await expect(page.getByTestId('betrayal-attack-weapon-none')).toHaveClass(/underline/);
        const beforeAttack = await readWeaponAttackState(page);
        expect(beforeAttack.recentRoll).toBeNull();
        await saveScreenshot(page, RING_ATTACK_READY_SCREENSHOT);

        await page.getByTestId('betrayal-attack-weapon-ring').click();
        await expect(page.getByTestId('betrayal-attack-weapon-ring')).toHaveClass(/underline/);
        await saveScreenshot(page, RING_ATTACK_SELECTED_SCREENSHOT);
        await enterAttackTargeting(page);

        const traitorToken = await expectTraitorTargetHighlighted(page, 'entrance-hall', traitorPlayerId);
        await saveScreenshot(page, RING_ATTACK_TARGET_SCREENSHOT);

        await setHarnessRandomQueue(page, [0.5, 0.5, 0.5, 0.5, 0, 0, 0, 0]);
        await traitorToken.click();

        await expect(page.getByTestId('betrayal-room-latest-feedback')).toContainText('使用指环');
        await expect(page.getByTestId('betrayal-room-latest-feedback')).toContainText('mental damage');
        const attackRollPanel = page.getByTestId('betrayal-recent-roll-panel');
        await expect(attackRollPanel).toBeVisible();
        await expect(attackRollPanel).toContainText('攻击投骰');
        await expect(page.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute('data-dice-count', '4');
        await expectVisiblePhysicalDiceBox(attackRollPanel);
        await waitForPhysicalDiceSettled(attackRollPanel);

        const ringImpact = page.getByTestId(`betrayal-attack-impact-map-${traitorPlayerId}`);
        await expect(ringImpact).toBeVisible();
        await expect(ringImpact).toHaveAttribute('data-attack-impact-active', 'true');
        await expect(ringImpact).toHaveAttribute('data-attack-impact-kind', 'mental');
        await expect(page.getByTestId(`betrayal-attack-impact-flash-map-${traitorPlayerId}`)).toBeVisible();
        const ringImpactSlash = page.getByTestId(`betrayal-attack-impact-slash-map-${traitorPlayerId}`);
        await expect(ringImpactSlash).toBeVisible();
        await expect(ringImpactSlash.locator('canvas')).toBeVisible();
        const ringImpactTrait = ringImpact.locator('[data-attack-impact-trait="knowledge"], [data-attack-impact-trait="sanity"]').first();
        await expect(ringImpactTrait).toBeVisible();
        await expect(ringImpactTrait).toContainText(/知识|神志/);
        await expectPhysicalDiceSeparated(attackRollPanel, { minDiceCount: 4 });
        await saveScreenshot(page, RING_ATTACK_DICE_SCREENSHOT);

        const afterAttackRoll = await readWeaponAttackState(page);
        expect(afterAttackRoll.recentRoll?.kind).toBe('attackRoll');
        expect(afterAttackRoll.recentRoll?.dice).toHaveLength(4);
        expect(afterAttackRoll.recentRoll?.attack?.damageKind).toBe('mental');
        expect(afterAttackRoll.recentRoll?.attack?.weaponCardId).toBe('ring');
        expect(afterAttackRoll.recentRoll?.attack?.weaponAttackTrait).toBe('sanity');
        expect(afterAttackRoll.recentRoll?.attack?.previousDamageToDefender).toBeGreaterThan(0);
        expect(afterAttackRoll.recentRoll?.attack?.previousDamageToAttacker).toBe(0);
        expect(afterAttackRoll.usedCardIdsThisTurn).toContain('ring');
        await resolveAttackDamageAllocation(page, {
            playerId: traitorPlayerId,
            damageKind: 'mental',
            trait: 'sanity',
            allowedTraits: ['knowledge', 'sanity'],
        });
        await saveScreenshot(page, RING_ATTACK_RESULT_SCREENSHOT);
        await page.getByTestId('betrayal-damage-allocation-confirm').click();
        await expect(page.getByTestId('betrayal-damage-allocation-panel')).toHaveCount(0);

        const afterAllocation = await readWeaponAttackState(page);
        expect(afterAllocation.pendingDamageAllocation).toBeNull();
        expect(afterAllocation.traitorTraits.might + afterAllocation.traitorTraits.speed).toBe(
            beforeAttack.traitorTraits.might + beforeAttack.traitorTraits.speed,
        );
        expect(afterAllocation.traitorTraits.knowledge + afterAllocation.traitorTraits.sanity).toBeLessThan(
            beforeAttack.traitorTraits.knowledge + beforeAttack.traitorTraits.sanity,
        );
        expect(afterAllocation.attackerTraits).toEqual(beforeAttack.attackerTraits);

        await expect(page.getByTestId('betrayal-attack-weapon-ring')).toHaveCount(0);
        const ringAttackRollBackdrop = page.getByTestId('betrayal-roll-review-backdrop');
        await expect(ringAttackRollBackdrop).toHaveAttribute('data-backdrop-dismiss', 'disabled');
        await ringAttackRollBackdrop.click({ position: { x: 16, y: 16 } });
        await expect(page.getByTestId('betrayal-recent-roll-panel')).toBeVisible();
        await page.getByTestId('betrayal-roll-continue').click();
        await expect(page.getByTestId('betrayal-recent-roll-panel')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-action-rail')).toBeVisible();
        await expect(page.getByTestId('betrayal-board')).toBeVisible();
        await saveScreenshot(page, RING_ATTACK_SETTLED_SCREENSHOT);

        assertNoFatalFrontendErrors([{ label: 'betrayal-non-p0-ring-sanity-attack', diagnostics }]);
    });

    test('头戴耳机精神减伤真实链路：指环造成精神伤害后减 1 点再分配', async ({ page, context }) => {
        test.setTimeout(120000);
        const diagnostics = await openBetrayalPage(page, context, 'betrayal-non-p0-radio-mental-damage');

        const injectedCore = createRingAttackRadioCore();
        const traitorPlayerId = resolveRequiredTraitorPlayerId(injectedCore);
        expect(injectedCore.currentExplorer.inventory.map((card) => card.id)).toEqual(['ring']);
        expect(injectedCore.otherExplorers.find((explorer) => explorer.playerId === traitorPlayerId)?.inventory.map((card) => card.id))
            .toEqual(['radio']);
        await injectCore(page, injectedCore);
        await expect.poll(async () => {
            const state = await readWeaponAttackState(page);
            return {
                roomId: state.attackerRoomId,
                inventoryIds: state.attackerInventoryIds,
                traitorInventoryIds: state.traitorInventoryIds,
            };
        }, { timeout: 30000 }).toEqual({
            roomId: 'entrance-hall',
            inventoryIds: ['ring'],
            traitorInventoryIds: ['radio'],
        });
        await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });
        await expect(page.getByTestId('betrayal-inventory-ring')).toBeVisible();
        const beforeAttack = await readWeaponAttackState(page);
        await saveScreenshot(page, RADIO_MENTAL_READY_SCREENSHOT);

        await page.getByTestId('betrayal-attack-weapon-ring').click();
        await expect(page.getByTestId('betrayal-attack-weapon-ring')).toHaveClass(/underline/);
        await enterAttackTargeting(page);

        const traitorToken = await expectTraitorTargetHighlighted(page, 'entrance-hall', traitorPlayerId);
        await saveScreenshot(page, RADIO_MENTAL_TARGET_SCREENSHOT);

        await setHarnessRandomQueue(page, [0.5, 0.5, 0.5, 0.5, 0, 0, 0, 0]);
        await traitorToken.click();

        await expect(page.getByTestId('betrayal-room-latest-feedback')).toContainText('使用指环');
        await expect(page.getByTestId('betrayal-room-latest-feedback')).toContainText('mental damage');
        const attackRollPanel = page.getByTestId('betrayal-recent-roll-panel');
        await expect(attackRollPanel).toBeVisible();
        await expect(attackRollPanel).toContainText('攻击投骰');
        await expect(page.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute('data-dice-count', '4');
        await expectVisiblePhysicalDiceBox(attackRollPanel);
        await waitForPhysicalDiceSettled(attackRollPanel);
        await expectPhysicalDiceSeparated(attackRollPanel, { minDiceCount: 4 });
        await saveScreenshot(page, RADIO_MENTAL_DICE_SCREENSHOT);

        const afterAttackRoll = await readWeaponAttackState(page);
        const pendingDamage = afterAttackRoll.pendingDamageAllocation;
        expect(afterAttackRoll.recentRoll?.kind).toBe('attackRoll');
        expect(afterAttackRoll.recentRoll?.attack?.damageKind).toBe('mental');
        expect(afterAttackRoll.recentRoll?.attack?.weaponCardId).toBe('ring');
        expect(afterAttackRoll.recentRoll?.attack?.weaponAttackTrait).toBe('sanity');
        expect(afterAttackRoll.recentRoll?.attack?.previousDamageToDefender).toBeGreaterThan(1);
        expect(pendingDamage).toMatchObject({
            playerId: traitorPlayerId,
            damageKind: 'mental',
            allowedTraits: expect.arrayContaining(['knowledge', 'sanity']),
        });
        expect(pendingDamage?.originalAmount).toBe(afterAttackRoll.recentRoll?.attack?.previousDamageToDefender);
        expect(pendingDamage?.amount).toBe((pendingDamage?.originalAmount ?? 0) - 1);
        const damageAmount = pendingDamage?.amount ?? 0;
        expect(damageAmount).toBeGreaterThan(0);
        await expect(page.getByTestId('betrayal-damage-allocation-panel')).toBeVisible();
        await expect(page.getByTestId('betrayal-damage-allocation-source')).toContainText('攻击');
        await expect(page.getByTestId('betrayal-damage-allocation-amount')).toContainText(`${damageAmount} 点精神伤害`);
        await expect(page.getByTestId('betrayal-damage-allocation-reduction')).toContainText(`原始 ${pendingDamage?.originalAmount} 点精神伤害`);
        await expect(page.getByTestId('betrayal-damage-allocation-reduction')).toContainText('头戴耳机减免 1 点');
        await expect(page.getByTestId('betrayal-damage-allocation-traits')).toContainText('知识');
        await expect(page.getByTestId('betrayal-damage-allocation-traits')).toContainText('神志');
        const sanityDamage = page.getByTestId('betrayal-damage-allocation-trait-sanity');
        for (let index = 0; index < damageAmount; index += 1) {
            await sanityDamage.click();
        }
        await expect(sanityDamage).toHaveAttribute('data-damage-selected-count', String(damageAmount));
        await expect(page.getByTestId('betrayal-damage-allocation-confirm')).toBeEnabled();
        await saveScreenshot(page, RADIO_MENTAL_PANEL_SCREENSHOT);
        await page.getByTestId('betrayal-damage-allocation-confirm').click();
        await expect(page.getByTestId('betrayal-damage-allocation-panel')).toHaveCount(0);

        const afterAllocation = await readWeaponAttackState(page);
        expect(afterAllocation.pendingDamageAllocation).toBeNull();
        expect(afterAllocation.traitorTraits.might + afterAllocation.traitorTraits.speed).toBe(
            beforeAttack.traitorTraits.might + beforeAttack.traitorTraits.speed,
        );
        expect(afterAllocation.traitorTraits.knowledge + afterAllocation.traitorTraits.sanity).toBe(
            beforeAttack.traitorTraits.knowledge + beforeAttack.traitorTraits.sanity - damageAmount,
        );
        expect(afterAllocation.usedCardIdsThisTurn).toContain('ring');

        const attackRollBackdrop = page.getByTestId('betrayal-roll-review-backdrop');
        await expect(attackRollBackdrop).toHaveAttribute('data-backdrop-dismiss', 'disabled');
        await attackRollBackdrop.click({ position: { x: 16, y: 16 } });
        await expect(page.getByTestId('betrayal-recent-roll-panel')).toBeVisible();
        await page.getByTestId('betrayal-roll-continue').click();
        await expect(page.getByTestId('betrayal-recent-roll-panel')).toHaveCount(0);
        await expect(page.getByTestId('betrayal-action-rail')).toBeVisible();
        await saveScreenshot(page, RADIO_MENTAL_SETTLED_SCREENSHOT);

        assertNoFatalFrontendErrors([{ label: 'betrayal-non-p0-radio-mental-damage', diagnostics }]);
    });

    test('胸针精神伤害真实链路：指环造成精神伤害后可改为通用伤害', async ({ page, context }) => {
        test.setTimeout(120000);
        const diagnostics = await openBetrayalPage(page, context, 'betrayal-non-p0-brooch-mental-damage');

        const injectedCore = createRingAttackBroochCore();
        const traitorPlayerId = resolveRequiredTraitorPlayerId(injectedCore);
        expect(injectedCore.currentExplorer.inventory.map((card) => card.id)).toEqual(['ring']);
        expect(injectedCore.otherExplorers.find((explorer) => explorer.playerId === traitorPlayerId)?.inventory.map((card) => card.id))
            .toEqual(['brooch']);
        await injectCore(page, injectedCore);
        await expect.poll(async () => {
            const state = await readWeaponAttackState(page);
            return {
                roomId: state.attackerRoomId,
                inventoryIds: state.attackerInventoryIds,
                traitorInventoryIds: state.traitorInventoryIds,
            };
        }, { timeout: 30000 }).toEqual({
            roomId: 'entrance-hall',
            inventoryIds: ['ring'],
            traitorInventoryIds: ['brooch'],
        });
        await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });
        await expect(page.getByTestId('betrayal-inventory-ring')).toBeVisible();
        const beforeAttack = await readWeaponAttackState(page);

        await page.getByTestId('betrayal-attack-weapon-ring').click();
        await enterAttackTargeting(page);
        const traitorToken = await expectTraitorTargetHighlighted(page, 'entrance-hall', traitorPlayerId);

        await setHarnessRandomQueue(page, [0.5, 0.5, 0.5, 0.5, 0, 0, 0, 0]);
        await traitorToken.click();
        await expect(page.getByTestId('betrayal-room-latest-feedback')).toContainText('使用指环');

        await expect.poll(async () => {
            const state = await readWeaponAttackState(page);
            return state.pendingDamageAllocation;
        }, { timeout: 30000 }).toMatchObject({
            playerId: traitorPlayerId,
            damageKind: 'mental',
            allowedTraits: ['knowledge', 'sanity'],
            damageReplacement: {
                kind: 'brooch-general-damage',
                cardId: 'brooch',
                cardName: '胸针',
            },
        });
        const pendingDamage = (await readWeaponAttackState(page)).pendingDamageAllocation;
        expect(pendingDamage).not.toBeNull();
        const damageAmount = pendingDamage.amount;
        expect(damageAmount).toBeGreaterThan(0);

        const damagePanel = page.getByTestId('betrayal-damage-allocation-panel');
        await expect(damagePanel).toBeVisible();
        await expect(damagePanel).toHaveAttribute('data-player-id', traitorPlayerId);
        await expect(page.getByTestId('betrayal-damage-allocation-source')).toContainText('攻击');
        await expect(page.getByTestId('betrayal-damage-allocation-amount')).toContainText(`${damageAmount} 点精神伤害`);
        await expect(page.getByTestId('betrayal-damage-allocation-traits')).toContainText('知识');
        await expect(page.getByTestId('betrayal-damage-allocation-traits')).toContainText('神志');
        await expect(page.getByTestId('betrayal-damage-allocation-traits')).not.toContainText('力量');
        await expect(page.getByTestId('betrayal-damage-allocation-traits')).not.toContainText('速度');

        const broochToggle = page.getByTestId('betrayal-damage-allocation-brooch-toggle');
        await expect(broochToggle).toBeVisible();
        await expect(broochToggle).toHaveAttribute('data-brooch-active', 'false');
        await expect(broochToggle).toContainText('使用胸针改为通用伤害');
        await broochToggle.click();
        await expect(broochToggle).toHaveAttribute('data-brooch-active', 'true');
        await expect(page.getByTestId('betrayal-damage-allocation-amount')).toContainText(`${damageAmount} 点一般伤害`);
        await expect(page.getByTestId('betrayal-damage-allocation-traits')).toContainText('力量');
        await expect(page.getByTestId('betrayal-damage-allocation-traits')).toContainText('速度');
        await expect(page.getByTestId('betrayal-damage-allocation-traits')).toContainText('知识');
        await expect(page.getByTestId('betrayal-damage-allocation-traits')).toContainText('神志');
        await saveScreenshot(page, BROOCH_MENTAL_DAMAGE_PANEL_SCREENSHOT);

        const mightDamage = page.getByTestId('betrayal-damage-allocation-trait-might');
        for (let index = 0; index < damageAmount; index += 1) {
            await mightDamage.click();
        }
        await expect(mightDamage).toHaveAttribute('data-damage-selected-count', String(damageAmount));
        await expect(page.getByTestId('betrayal-damage-allocation-confirm')).toBeEnabled();
        await page.getByTestId('betrayal-damage-allocation-confirm').click();
        await expect(page.getByTestId('betrayal-damage-allocation-panel')).toHaveCount(0);

        const afterAllocation = await readWeaponAttackState(page);
        expect(afterAllocation.pendingDamageAllocation).toBeNull();
        expect(afterAllocation.traitorTraits.might + afterAllocation.traitorTraits.speed).toBeLessThan(
            beforeAttack.traitorTraits.might + beforeAttack.traitorTraits.speed,
        );
        expect(afterAllocation.traitorTraits.knowledge + afterAllocation.traitorTraits.sanity).toBe(
            beforeAttack.traitorTraits.knowledge + beforeAttack.traitorTraits.sanity,
        );
        expect(afterAllocation.usedCardIdsThisTurn).toContain('ring');
        await expect(page.getByTestId('betrayal-room-latest-feedback')).toContainText('使用胸针将精神伤害替换为通用伤害');
        await saveScreenshot(page, BROOCH_MENTAL_DAMAGE_SETTLED_SCREENSHOT);

        assertNoFatalFrontendErrors([{ label: 'betrayal-non-p0-brooch-mental-damage', diagnostics }]);
    });

    test('匕首攻击真实链路：选择匕首后6骰攻击并花费速度造成物理伤害', async ({ page, context }) => {
        test.setTimeout(120000);
        const diagnostics = await openBetrayalPage(page, context, 'betrayal-non-p0-dagger-attack');

        const injectedCore = createDaggerAttackCore();
        const traitorPlayerId = resolveRequiredTraitorPlayerId(injectedCore);
        expect(injectedCore.currentExplorer.inventory.map((card) => card.id)).toEqual(['dagger']);
        await injectCore(page, injectedCore);
        await expect.poll(async () => {
            const state = await readWeaponAttackState(page);
            return {
                roomId: state.attackerRoomId,
                inventoryIds: state.attackerInventoryIds,
            };
        }, { timeout: 30000 }).toEqual({
            roomId: 'entrance-hall',
            inventoryIds: ['dagger'],
        });
        await expect(page.getByTestId('betrayal-board')).toBeVisible({ timeout: 30000 });
        await expect(page.getByTestId('betrayal-inventory-dagger')).toBeVisible();
        await expect(page.getByTestId('betrayal-inventory-section')).toContainText('匕首');
        await expect(page.getByTestId('betrayal-inventory-section')).not.toContainText('指环');
        await expect(page.getByTestId('betrayal-inventory-section')).not.toContainText('兔脚');
        await expect(page.getByTestId('betrayal-inventory-section')).not.toContainText('地图');
        await expect(page.getByTestId('betrayal-attack-weapon-selector')).toBeVisible();
        await expect(page.getByTestId('betrayal-attack-weapon-dagger')).toBeVisible();
        await expect(page.getByTestId('betrayal-attack-weapon-none')).toHaveClass(/underline/);
        const beforeAttack = await readWeaponAttackState(page);
        expect(beforeAttack.recentRoll).toBeNull();
        await saveScreenshot(page, DAGGER_ATTACK_READY_SCREENSHOT);

        await page.getByTestId('betrayal-attack-weapon-dagger').click();
        await expect(page.getByTestId('betrayal-attack-weapon-dagger')).toHaveClass(/underline/);
        await saveScreenshot(page, DAGGER_ATTACK_SELECTED_SCREENSHOT);
        await enterAttackTargeting(page);

        const traitorToken = await expectTraitorTargetHighlighted(page, 'entrance-hall', traitorPlayerId);
        await saveScreenshot(page, DAGGER_ATTACK_TARGET_SCREENSHOT);

        await setHarnessRandomQueue(page, [
            0.5, 0, 0, 0, 0, 0,
            0, 0, 0, 0,
        ]);
        await traitorToken.click();

        await expect(page.getByTestId('betrayal-room-latest-feedback')).toContainText('使用匕首');
        await expect(page.getByTestId('betrayal-room-latest-feedback')).toContainText('physical damage');
        const attackRollPanel = page.getByTestId('betrayal-recent-roll-panel');
        await expect(attackRollPanel).toBeVisible();
        await expect(attackRollPanel).toContainText('攻击投骰');
        await expect(page.getByTestId('betrayal-house-dice-3d-group')).toHaveAttribute('data-dice-count', '6');
        await expectVisiblePhysicalDiceBox(attackRollPanel);
        await waitForPhysicalDiceSettled(attackRollPanel);

        const daggerImpact = page.getByTestId(`betrayal-attack-impact-map-${traitorPlayerId}`);
        await expect(daggerImpact).toBeVisible();
        await expect(daggerImpact).toHaveAttribute('data-attack-impact-active', 'true');
        await expect(daggerImpact).toHaveAttribute('data-attack-impact-kind', 'physical');
        await expect(page.getByTestId(`betrayal-attack-impact-flash-map-${traitorPlayerId}`)).toBeVisible();
        const daggerImpactSlash = page.getByTestId(`betrayal-attack-impact-slash-map-${traitorPlayerId}`);
        await expect(daggerImpactSlash).toBeVisible();
        await expect(daggerImpactSlash.locator('canvas')).toBeVisible();
        const daggerImpactTrait = daggerImpact.locator('[data-attack-impact-trait="might"], [data-attack-impact-trait="speed"]').first();
        await expect(daggerImpactTrait).toBeVisible();
        await expect(daggerImpactTrait).toContainText(/力量|速度/);
        await expectPhysicalDiceSeparated(attackRollPanel, { minDiceCount: 6 });
        await saveScreenshot(page, DAGGER_ATTACK_DICE_SCREENSHOT);

        const afterAttackRoll = await readWeaponAttackState(page);
        expect(afterAttackRoll.recentRoll?.kind).toBe('attackRoll');
        expect(afterAttackRoll.recentRoll?.dice).toHaveLength(6);
        expect(afterAttackRoll.recentRoll?.attack?.damageKind).toBe('physical');
        expect(afterAttackRoll.recentRoll?.attack?.weaponCardId).toBe('dagger');
        expect(afterAttackRoll.recentRoll?.attack?.weaponAttackTrait).toBe('might');
        expect(afterAttackRoll.recentRoll?.attack?.weaponExtraDice).toBe(2);
        expect(afterAttackRoll.recentRoll?.attack?.weaponSpeedCost).toBe(1);
        expect(afterAttackRoll.recentRoll?.attack?.previousDamageToDefender).toBeGreaterThan(0);
        expect(afterAttackRoll.recentRoll?.attack?.previousDamageToAttacker).toBe(0);
        expect(afterAttackRoll.usedCardIdsThisTurn).toContain('dagger');
        expect(afterAttackRoll.attackerTraits.speed).toBe(beforeAttack.attackerTraits.speed - 1);
        await resolveAttackDamageAllocation(page, {
            playerId: traitorPlayerId,
            damageKind: 'physical',
            trait: 'might',
            allowedTraits: ['might', 'speed'],
        });
        await saveScreenshot(page, DAGGER_ATTACK_RESULT_SCREENSHOT);
        await page.getByTestId('betrayal-damage-allocation-confirm').click();
        await expect(page.getByTestId('betrayal-damage-allocation-panel')).toHaveCount(0);

        const afterAllocation = await readWeaponAttackState(page);
        expect(afterAllocation.pendingDamageAllocation).toBeNull();
        expect(afterAllocation.attackerTraits.speed).toBe(beforeAttack.attackerTraits.speed - 1);
        expect(afterAllocation.traitorTraits.might + afterAllocation.traitorTraits.speed).toBeLessThan(
            beforeAttack.traitorTraits.might + beforeAttack.traitorTraits.speed,
        );
        expect(afterAllocation.traitorTraits.knowledge + afterAllocation.traitorTraits.sanity).toBe(
            beforeAttack.traitorTraits.knowledge + beforeAttack.traitorTraits.sanity,
        );

        await expect(page.getByTestId('betrayal-attack-weapon-dagger')).toHaveCount(0);
        const daggerAttackRollBackdrop = page.getByTestId('betrayal-roll-review-backdrop');
        await expect(daggerAttackRollBackdrop).toHaveAttribute('data-backdrop-dismiss', 'disabled');
        await daggerAttackRollBackdrop.click({ position: { x: 16, y: 16 } });
        await expect(page.getByTestId('betrayal-recent-roll-panel')).toBeVisible();
        await page.getByTestId('betrayal-roll-continue').click();
        await expect(page.getByTestId('betrayal-recent-roll-panel')).toHaveCount(0);
        await expect(page.getByTestId(`betrayal-room-occupant-target-outline-entrance-hall-${traitorPlayerId}`)).toHaveCount(0);
        await expect(page.getByTestId('betrayal-action-rail')).toBeVisible();
        await expect(page.getByTestId('betrayal-board')).toBeVisible();
        await saveScreenshot(page, DAGGER_ATTACK_SETTLED_SCREENSHOT);

        assertNoFatalFrontendErrors([{ label: 'betrayal-non-p0-dagger-attack', diagnostics }]);
    });
});

const readPhantomPhotographerAttackState = async (page: Page) => page.evaluate(() => {
    const core = (window as Window & {
        __BG_TEST_HARNESS__?: { state?: { get?: () => { core: {
            currentPlayer: string;
            phase: string;
            activeRoomId: string;
            currentExplorer: { playerId: string; roomId: string; inventory: { id: string }[] };
            otherExplorers: Array<{ playerId: string; roomId: string; traits: { sanity: number } }>;
            monsters: Array<{ id: string; roomId: string; sanity?: number }>;
            scenarioRuntime: {
                hauntCardNumber?: number;
                traitorPlayerId: string | null;
                magicCamera?: {
                    phantomPhotographerIds: string[];
                    killedPhantomPhotographerIds: string[];
                    stunnedPhantomPhotographerIds: string[];
                };
            };
            recentRoll: null | {
                kind: string;
                monsterMovementRoll?: unknown;
            };
        } } } };
    }).__BG_TEST_HARNESS__?.state?.get?.()?.core;
    if (!core) {
        throw new Error('missing betrayal test harness state');
    }
    return {
        currentPlayer: core.currentPlayer,
        phase: core.phase,
        activeRoomId: core.activeRoomId,
        currentExplorerPlayerId: core.currentExplorer.playerId,
        currentExplorerRoomId: core.currentExplorer.roomId,
        currentExplorerInventoryIds: core.currentExplorer.inventory.map((card) => card.id),
        hauntCardNumber: core.scenarioRuntime.hauntCardNumber,
        traitorPlayerId: core.scenarioRuntime.traitorPlayerId,
        magicCamera: core.scenarioRuntime.magicCamera,
        targetHero: core.otherExplorers.find((explorer) => explorer.playerId === '2'),
        phantomPhotographer: core.monsters.find((monster) => (
            core.scenarioRuntime.magicCamera?.phantomPhotographerIds.includes(monster.id)
        )),
        recentRoll: core.recentRoll,
    };
});
