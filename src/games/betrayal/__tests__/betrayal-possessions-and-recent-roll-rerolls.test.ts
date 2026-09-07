import { describe, expect, it } from 'vitest';
import { resolveBetrayalHauntSpecialActionStatus } from '../hauntSpecialActionReadModel';
import {
    acknowledgePendingCardResolutions,
    applyBetrayalCommand,
    BETRAYAL_FIXED_RANDOM,
    createBetrayalCommand,
    createBetrayalScriptedRandom,
    createCrimsonJackHauntCore,
    createFirstScenarioHauntCore,
    createFirstScenarioReadyToLearnAboutJackCore,
    createFirstScenarioReadyToStudyExorcismCore,
    createStartedFirstScenarioCore,
    BETRAYAL_COMMANDS,
    BetrayalDomain,
    EXPLORER_CATALOG,
    resolveBetrayalPossessionSpecialActionStatus,
    canUseBookForPendingEventRoll,
    resolveUseEffect,
    canUseRecentRollRerollItemForRecentRoll,
    resolveRecentRollRerollSelectableDieIndices,
    BETRAYAL_DISCOVERY_POOLS,
    finalizePendingEventRollForTest,
    markRecentEventRollPendingFinalizationForTest,
    startFirstScenarioFromCharacterSelect,
    setNextDiscoverySymbolRoomsForAllFloors,
    setTestTraitTrack,
    setTestExplorerTraitsBelowCatalogStart,
    traitTrackPosition,
    criticalTraitValues,
    traitTrackPositionTotal,
    expectPendingDamageForTest,
    resolvePendingDamageForTest,
    placeActiveTestExplorerInRoom,
    lethalTraitsForPendingDamage,
    createDustHauntCore,
    placeCurrentExplorerInDustResearchRoom,
    type BetrayalCore,
} from './helpers/firstScenarioRuntimeHarness';

describe('Betrayal first scenario runtime - possessions and recent-roll rerolls', () => {
it('能在第三次恶兆且 haunt roll 达标后进入真实 haunt', () => {
        const core = createFirstScenarioHauntCore();

        expect(core.phase).toBe('haunt');
        expect(core.scenarioRuntime.hauntTriggered).toBe(true);
        expect(core.scenarioRuntime.hauntRevealerPlayerId).toBe('2');
        expect(core.scenarioRuntime.traitorPlayerId).toBe('2');
        expect(core.scenarioRuntime.hauntCardNumber).toBe(1);
        expect(core.scenarioRuntime.hauntTriggerLabel).toBe('面具');
        expect(core.scenarioRuntime.triggeringOmenName).toBe('面具');
        expect(core.scenarioRuntime.hauntScenarioCardTitle).toBe('木乃伊横行');
        expect(core.scenarioRuntime.hauntResolutionMatchedTrigger).toBe(false);
        expect(core.scenarioRuntime.hauntResolutionRepresentativeOnly).toBe(true);
        expect(core.scenarioRuntime.hauntFirstPlayerResolution).toMatchObject({
            policy: 'left-of-traitor',
            anchorPlayerId: '2',
            nextPlayerId: '0',
            representativeOnly: true,
        });
        expect(core.pendingCardResolutionQueue).toEqual([]);
        expect(core.currentPlayer).toBe('0');
        expect(core.activityLog[0]?.text).toContain('木乃伊横行');
    });

it('本回合新获得的物品或预兆不能立刻使用，直到下一次回合开始才可用', () => {
        const fixedItemDrawRandom = {
            random: () => 0.42,
            d: (max: number) => Math.max(1, Math.min(max, 1)),
            range: (min: number) => min,
            shuffle: <T,>(array: T[]) => [...array].reverse(),
        };
        let core = BetrayalDomain.setup(['0', '1', '2'], fixedItemDrawRandom);
        core = startFirstScenarioFromCharacterSelect(core);
        core.drawOrder = ['item'];
        setNextDiscoverySymbolRoomsForAllFloors(core, 'item');
        core.possessionOrderByKind.item = [
            { id: 'holy-water', name: '奇怪的药品', kind: 'item' },
        ];

        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'hallway' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'grand-staircase' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'upper-landing' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.EXPLORE_ROOM, '0', {}, 100, createBetrayalScriptedRandom(1));

        const newCardId = core.currentExplorer.inventory.at(-1)?.id;
        expect(newCardId).toBeTruthy();
        expect(core.latestDiscovery?.summary).toBe('已加入持有区');
        expect(core.turnStartInventoryCardIds).not.toContain(newCardId);

        const pendingCardUseValidation = BetrayalDomain.validate(
            { core, sys: {} as never },
            createBetrayalCommand(BETRAYAL_COMMANDS.USE_POSSESSION, '0', { cardId: newCardId }),
        );
        expect(pendingCardUseValidation.valid).toBe(false);
        if (!pendingCardUseValidation.valid) {
            expect(pendingCardUseValidation.error).toContain('请先确认当前翻牌结算');
        }

        core = acknowledgePendingCardResolutions(core);

        const immediateUseValidation = BetrayalDomain.validate(
            { core, sys: {} as never },
            createBetrayalCommand(BETRAYAL_COMMANDS.USE_POSSESSION, '0', { cardId: newCardId }),
        );
        expect(immediateUseValidation.valid).toBe(false);
        if (!immediateUseValidation.valid) {
            expect(immediateUseValidation.error).toContain('回合已经结束');
        }

        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, '0', {});
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, '1', {});
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, '2', {});

        expect(core.currentPlayer).toBe('0');
        expect(core.turnStartInventoryCardIds).toContain(newCardId);
        const nextTurnUseValidation = BetrayalDomain.validate(
            { core, sys: {} as never },
            createBetrayalCommand(BETRAYAL_COMMANDS.USE_POSSESSION, '0', { cardId: newCardId }),
        );
        expect(nextTurnUseValidation.valid).toBe(true);
    });

it('持有物效果解析会统一处理主动使用牌的抽牌后缀和预览后缀', () => {
        expect(resolveUseEffect({ id: 'holy-water', name: '奇怪的药品', kind: 'item' })).toMatchObject({
            mode: 'healTraits',
            traits: ['might', 'speed'],
            consumeOnUse: true,
        });
        expect(resolveUseEffect({ id: 'holy-water-preview-3', name: '奇怪的药品', kind: 'item' })).toMatchObject({
            mode: 'healTraits',
            traits: ['might', 'speed'],
            consumeOnUse: true,
        });
        expect(resolveUseEffect({ id: 'holy-water-12', name: '奇怪的药品', kind: 'item' })).toMatchObject({
            mode: 'healTraits',
            traits: ['might', 'speed'],
            consumeOnUse: true,
        });
        expect(resolveUseEffect({ id: 'medical-kit', name: '急救包', kind: 'item' })).toMatchObject({
            mode: 'healTraits',
            traits: ['might', 'speed', 'knowledge', 'sanity'],
            consumeOnUse: true,
            target: 'selfOrSameRoomExplorer',
        });
        expect(resolveUseEffect({ id: 'mirror', name: '镜子', kind: 'item' })).toMatchObject({
            mode: 'healTraits',
            traits: ['knowledge', 'sanity'],
            consumeOnUse: true,
            target: 'self',
        });
        expect(resolveUseEffect({ id: 'map', name: '地图', kind: 'item' })).toMatchObject({
            mode: 'placeExplorer',
            target: 'anyDiscoveredRoom',
            consumeOnUse: true,
        });
        expect(resolveUseEffect({ id: 'notebook', name: '笔记本', kind: 'item' })).toMatchObject({
            mode: 'placeExplorer',
            target: 'anyDiscoveredRoom',
            consumeOnUse: true,
        });
        expect(resolveUseEffect({ id: 'journal', name: '日记', kind: 'item' })).toMatchObject({
            mode: 'placeExplorer',
            target: 'anyDiscoveredRoom',
            consumeOnUse: true,
        });
        expect(resolveUseEffect({ id: 'manuscript', name: '手稿', kind: 'item' })).toMatchObject({
            mode: 'placeExplorer',
            target: 'anyDiscoveredRoom',
            consumeOnUse: true,
        });
    });

it('兔脚不能被主动使用成移动加成，真实重掷必须等待骰子明细窗口', () => {
        const core = createStartedFirstScenarioCore();
        core.currentExplorer = {
            ...core.currentExplorer,
            inventory: [{ id: 'rope', name: '兔脚', kind: 'item' }],
        };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['rope'];

        expect(resolveUseEffect({ id: 'rope', name: '兔脚', kind: 'item' })).toBeNull();

        const validation = BetrayalDomain.validate(
            { core, sys: {} as never },
            createBetrayalCommand(BETRAYAL_COMMANDS.USE_POSSESSION, '0', { cardId: 'rope' }),
        );

        expect(validation.valid).toBe(false);
        if (!validation.valid) {
            expect(validation.error).toContain('该持有物没有主动使用效果');
        }
    });

it('狗、圣符和雕像不能被通用使用入口误当成主动加成', () => {
        const activeCore = createStartedFirstScenarioCore();

        for (const card of [
            { id: 'dog', name: '狗', kind: 'omen' as const },
            { id: 'holy-symbol', name: '圣符', kind: 'omen' as const },
            { id: 'idol', name: '雕像', kind: 'omen' as const },
        ]) {
            const core = {
                ...activeCore,
                currentExplorer: { ...activeCore.currentExplorer, inventory: [card] },
                currentExplorerInventory: [card],
                turnStartInventoryCardIds: [card.id],
            };

            expect(resolveUseEffect(card)).toBeNull();

            const validation = BetrayalDomain.validate(
                { core, sys: {} as never },
                createBetrayalCommand(BETRAYAL_COMMANDS.USE_POSSESSION, '0', { cardId: card.id }),
            );

            expect(validation.valid).toBe(false);
            if (!validation.valid) {
                expect(validation.error).toContain('该持有物没有主动使用效果');
            }
        }
    });

it('持有物特殊行动预算区分主动、被动、已用和本回合新获得', () => {
        const holyWater = { id: 'holy-water', name: '奇怪的药品', kind: 'item' as const };
        const armor = { id: 'armor', name: '盔甲', kind: 'omen' as const };
        const activeCore = createStartedFirstScenarioCore();
        let core: BetrayalCore = {
            ...activeCore,
            currentExplorer: {
                ...activeCore.currentExplorer,
                inventory: [holyWater, armor],
            },
            currentExplorerInventory: [holyWater, armor],
            turnStartInventoryCardIds: ['holy-water', 'armor'],
            usedCardIdsThisTurn: [],
            receivedCardIdsThisTurnByPlayerId: {},
        };

        expect(resolveBetrayalPossessionSpecialActionStatus(core, 'holy-water')).toMatchObject({
            active: true,
            canUse: true,
            usedThisTurn: false,
            availableAtTurnStart: true,
            receivedThisTurn: false,
            reason: null,
        });
        expect(resolveBetrayalPossessionSpecialActionStatus(core, 'armor')).toMatchObject({
            active: false,
            canUse: false,
            reason: '该持有物没有主动使用效果。',
        });

        core = { ...core, usedCardIdsThisTurn: ['holy-water'] };
        expect(resolveBetrayalPossessionSpecialActionStatus(core, 'holy-water')).toMatchObject({
            active: true,
            canUse: false,
            usedThisTurn: true,
            reason: '该持有物本回合已经使用。',
        });

        core = {
            ...core,
            usedCardIdsThisTurn: [],
            turnStartInventoryCardIds: ['armor'],
            receivedCardIdsThisTurnByPlayerId: { '0': ['holy-water'] },
        };
        expect(resolveBetrayalPossessionSpecialActionStatus(core, 'holy-water')).toMatchObject({
            active: true,
            canUse: false,
            availableAtTurnStart: false,
            receivedThisTurn: true,
            reason: '本回合新获得的持有物不能立刻使用。',
        });
    });

it('作祟特殊行动预算由统一读模型解释可用、已用和阶段原因', () => {
        let core = placeCurrentExplorerInDustResearchRoom(createDustHauntCore(), 'omen');

        expect(resolveBetrayalHauntSpecialActionStatus(core, 'search-for-cure')).toMatchObject({
            sourceKind: 'hauntAction',
            sourceId: 'search-for-cure',
            sourceName: '寻找解药',
            active: true,
            canUse: true,
            usedThisTurn: false,
            phaseEligible: true,
            reason: null,
        });

        core = { ...core, usedCardIdsThisTurn: ['search-for-cure'] };
        expect(resolveBetrayalHauntSpecialActionStatus(core, 'search-for-cure')).toMatchObject({
            active: true,
            canUse: false,
            usedThisTurn: true,
            reason: '该作祟特殊行动本回合已经使用。',
        });

        const preHauntCore = createStartedFirstScenarioCore();
        expect(resolveBetrayalHauntSpecialActionStatus(preHauntCore, 'search-for-cure')).toMatchObject({
            active: false,
            canUse: false,
            phaseEligible: false,
            reason: '作祟前不能使用作祟特殊行动。',
        });

        expect(resolveBetrayalHauntSpecialActionStatus(core, 'unknown-haunt-action')).toMatchObject({
            active: false,
            canUse: false,
            reason: '未知作祟特殊行动。',
        });
    });

it('未确认的历史占位持有物不能从通用使用入口获得效果', () => {
        for (const card of [
            { id: 'holy-medallion', name: '历史占位护符', kind: 'item' as const },
            { id: 'dark-omen', name: '历史占位预兆', kind: 'omen' as const },
            { id: 'cross', name: '历史占位十字架', kind: 'item' as const },
            { id: 'matches', name: '历史占位火柴', kind: 'item' as const },
        ]) {
            expect(resolveUseEffect(card)).toBeNull();
        }
    });

it('兔脚会重掷刚刚事件检定的一颗骰子，并回写原事件分支结算', () => {
        let core = createStartedFirstScenarioCore();
        core.drawOrder = ['event'];
        setNextDiscoverySymbolRoomsForAllFloors(core, 'event');
        core.eventOrder = [
            {
                name: '墙中低语',
                roll: {
                    trait: 'knowledge',
                    branches: [
                        { min: 5, label: '抵住低语，获得 1 点知识', effect: { mode: 'trait', trait: 'knowledge', amount: 1, recommendedAction: 'explore' } },
                        { min: 0, label: '被低语扰乱，失去 1 点知识', effect: { mode: 'trait', trait: 'knowledge', amount: -1, recommendedAction: 'endTurn' } },
                    ],
                },
            },
        ];
        core.currentExplorer = {
            ...core.currentExplorer,
            traits: {
                ...core.currentExplorer.traits,
                knowledge: 3,
            },
            inventory: [{ id: 'rope', name: '兔脚', kind: 'item' }],
        };
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['rope'];
        setTestTraitTrack(core, '0', 'knowledge', [1, 2, 3, 4, 5], 2, 2);
        const knowledgePositionBeforeWhisper = traitTrackPosition(core, '0', 'knowledge');

        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'hallway' });
        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.EXPLORE_ROOM,
            '0',
            { roomId: 'ground-north' },
            100,
            createBetrayalScriptedRandom(1, 1, 1),
            false,
        );

        expect(core.latestDiscovery?.detail).toContain('知识检定 0');
        expect(core.latestDiscovery?.detail).toContain('失去 1 点知识');
        expect(core.currentExplorer.traitTracks.knowledge.position).toBe(knowledgePositionBeforeWhisper);
        expect(core.currentExplorer.traits.knowledge).toBe(3);
        expect(core.recentRoll?.dice).toEqual([0, 0, 0]);
        expect(core.pendingEventRollResolution?.effect).toMatchObject({ mode: 'trait', trait: 'knowledge', amount: -1 });

        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.USE_RABBIT_FOOT,
            '0',
            { cardId: 'rope', dieIndex: 0 },
            100,
            createBetrayalScriptedRandom(3),
            false,
        );

        expect(core.latestDiscovery?.detail).toContain('知识检定 2');
        expect(core.latestDiscovery?.detail).toContain('失去 1 点知识');
        expect(core.currentExplorer.traitTracks.knowledge.position).toBe(knowledgePositionBeforeWhisper);
        expect(core.currentExplorer.traits.knowledge).toBe(3);
        expect(core.recentRoll?.dice).toEqual([2, 0, 0]);
        expect(core.pendingEventRollResolution).toMatchObject({
            effect: { mode: 'trait', trait: 'knowledge', amount: -1 },
            requiresAcknowledgement: false,
        });
        expect(core.usedCardIdsThisTurn).toContain('rope');

        core = finalizePendingEventRollForTest(core);

        expect(core.currentExplorer.traitTracks.knowledge.position).toBe(knowledgePositionBeforeWhisper - 1);
        expect(core.currentExplorer.traits.knowledge).toBe(2);
        expect(core.recentRoll?.dice).toEqual([2, 0, 0]);
        expect(core.pendingEventRollResolution).toBeNull();

        const secondUse = BetrayalDomain.validate(
            { core, sys: {} as never },
            createBetrayalCommand(BETRAYAL_COMMANDS.USE_RABBIT_FOOT, '0', { cardId: 'rope', dieIndex: 1 }),
        );
        expect(secondUse.valid).toBe(false);
    });

it('兔脚重掷事件骰后，普通最终分支会等待展示结束再自动结算', () => {
        let core = createStartedFirstScenarioCore();
        core.drawOrder = ['event'];
        setNextDiscoverySymbolRoomsForAllFloors(core, 'event');
        core.eventOrder = [
            {
                name: '墙中低语',
                roll: {
                    trait: 'knowledge',
                    branches: [
                        { min: 5, label: '抵住低语，获得 1 点知识', effect: { mode: 'trait', trait: 'knowledge', amount: 1, recommendedAction: 'explore' } },
                        { min: 0, label: '被低语扰乱，失去 1 点知识', effect: { mode: 'trait', trait: 'knowledge', amount: -1, recommendedAction: 'endTurn' } },
                    ],
                },
            },
        ];
        core.currentExplorer = {
            ...core.currentExplorer,
            traits: {
                ...core.currentExplorer.traits,
                knowledge: 3,
            },
            inventory: [
                { id: 'rope', name: '兔脚', kind: 'item' },
                { id: 'flashlight', name: '手电筒', kind: 'item' },
            ],
        };
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['rope', 'flashlight'];
        setTestTraitTrack(core, '0', 'knowledge', [1, 2, 3, 4, 5], 2, 2);
        const knowledgePositionBeforeCrossThreshold = traitTrackPosition(core, '0', 'knowledge');

        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'hallway' });
        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.EXPLORE_ROOM,
            '0',
            { roomId: 'ground-north' },
            100,
            createBetrayalScriptedRandom(1, 1, 1, 1, 1),
            false,
        );

        expect(core.latestDiscovery?.detail).toContain('知识检定 0');
        expect(core.currentExplorer.traitTracks.knowledge.position).toBe(knowledgePositionBeforeCrossThreshold);
        expect(core.currentExplorer.traits.knowledge).toBe(3);
        expect(core.recentRoll?.dice).toEqual([0, 0, 0, 0, 0]);
        expect(core.pendingEventRollResolution?.effect).toMatchObject({ mode: 'trait', trait: 'knowledge', amount: -1 });

        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.USE_RABBIT_FOOT,
            '0',
            { cardId: 'rope', dieIndex: 0 },
            100,
            createBetrayalScriptedRandom(3),
            false,
        );

        expect(core.latestDiscovery?.detail).toContain('知识检定 2');
        expect(core.currentExplorer.traitTracks.knowledge.position).toBe(knowledgePositionBeforeCrossThreshold);
        expect(core.currentExplorer.traits.knowledge).toBe(3);
        expect(core.pendingEventRollResolution).toMatchObject({
            effect: { mode: 'trait', trait: 'knowledge', amount: -1 },
            requiresAcknowledgement: false,
        });

        core = finalizePendingEventRollForTest(core);

        expect(core.currentExplorer.traitTracks.knowledge.position).toBe(knowledgePositionBeforeCrossThreshold - 1);
        expect(core.currentExplorer.traits.knowledge).toBe(2);
        expect(core.pendingEventRollResolution).toBeNull();

        core.recentRoll = {
            ...core.recentRoll!,
            consumedRabbitFootCardIds: [],
            dice: [2, 2, 2, 0, 0],
            latestLabel: '被低语扰乱，失去 1 点知识',
        };
        core.pendingEventRollResolution = {
            rollId: core.recentRoll!.id,
            playerId: '0',
            sourceTitle: '墙中低语',
            effect: { mode: 'trait', trait: 'knowledge', amount: -1, recommendedAction: 'endTurn' },
            requiredPlayerIds: ['0'],
            acknowledgedPlayerIds: [],
            requiresAcknowledgement: false,
        };
        core.currentExplorer.traits.knowledge = 3;
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        setTestTraitTrack(core, '0', 'knowledge', [1, 2, 3, 4, 5], 2, 2);
        core.usedCardIdsThisTurn = [];
        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.USE_RABBIT_FOOT,
            '0',
            { cardId: 'rope', dieIndex: 3 },
            100,
            createBetrayalScriptedRandom(3),
            false,
        );

        expect(core.latestDiscovery?.detail).toContain('知识检定 8');
        expect(core.latestDiscovery?.detail).toContain('获得 1 点知识');
        expect(core.currentExplorer.traitTracks.knowledge.position).toBe(knowledgePositionBeforeCrossThreshold);
        expect(core.currentExplorer.traits.knowledge).toBe(3);
        expect(core.pendingEventRollResolution).toMatchObject({
            effect: { mode: 'trait', trait: 'knowledge', amount: 1 },
            requiresAcknowledgement: false,
        });

        core = finalizePendingEventRollForTest(core);

        expect(core.currentExplorer.traitTracks.knowledge.position).toBe(knowledgePositionBeforeCrossThreshold + 1);
        expect(core.currentExplorer.traits.knowledge).toBe(4);
        expect(core.pendingEventRollResolution).toBeNull();
    });

it('恐怖玩偶重掷事件属性检定后，普通最终分支会等待展示结束再自动结算', () => {
        let core = createStartedFirstScenarioCore();
        core.drawOrder = ['event'];
        setNextDiscoverySymbolRoomsForAllFloors(core, 'event');
        core.eventOrder = [
            {
                name: '墙中低语',
                roll: {
                    trait: 'knowledge',
                    branches: [
                        { min: 5, label: '抵住低语，获得 1 点知识', effect: { mode: 'trait', trait: 'knowledge', amount: 1, recommendedAction: 'explore' } },
                        { min: 0, label: '被低语扰乱，失去 1 点知识', effect: { mode: 'trait', trait: 'knowledge', amount: -1, recommendedAction: 'endTurn' } },
                    ],
                },
            },
        ];
        core.currentExplorer = {
            ...core.currentExplorer,
            traits: {
                ...core.currentExplorer.traits,
                knowledge: 3,
            },
            inventory: [{ id: 'scary-doll', name: '恐怖玩偶', kind: 'item' }],
        };
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['scary-doll'];
        setTestTraitTrack(core, '0', 'knowledge', [1, 2, 3, 4, 5], 2, 2);
        const knowledgePositionBeforeScaryDoll = traitTrackPosition(core, '0', 'knowledge');

        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'hallway' });
        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.EXPLORE_ROOM,
            '0',
            { roomId: 'ground-north' },
            100,
            createBetrayalScriptedRandom(1, 1, 1),
            false,
        );

        expect(core.latestDiscovery?.detail).toContain('知识检定 0');
        expect(core.latestDiscovery?.detail).toContain('失去 1 点知识');
        expect(core.currentExplorer.traitTracks.knowledge.position).toBe(knowledgePositionBeforeScaryDoll);
        expect(core.currentExplorer.traits.knowledge).toBe(3);
        expect(core.recentRoll?.dice).toEqual([0, 0, 0]);
        expect(canUseRecentRollRerollItemForRecentRoll(core, '0', 'scary-doll')).toBe(true);
        expect(resolveRecentRollRerollSelectableDieIndices(core.recentRoll!, 'scary-doll')).toEqual([0, 1, 2]);

        const scaryDollValidation = BetrayalDomain.validate(
            { core, sys: {} as never },
            createBetrayalCommand(BETRAYAL_COMMANDS.USE_ROLL_REROLL_ITEM, '0', { cardId: 'scary-doll', dieIndex: 1 }),
        );
        expect(scaryDollValidation.valid).toBe(true);

        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.USE_ROLL_REROLL_ITEM,
            '0',
            { cardId: 'scary-doll', dieIndex: 1 },
            101,
            createBetrayalScriptedRandom(3, 3, 3),
            false,
        );

        expect(core.latestDiscovery?.detail).toContain('知识检定 6');
        expect(core.latestDiscovery?.detail).toContain('获得 1 点知识');
        expect(core.currentExplorer.traitTracks.knowledge.position).toBe(knowledgePositionBeforeScaryDoll);
        expect(core.currentExplorer.traits.knowledge).toBe(3);
        expect(core.recentRoll?.dice).toEqual([2, 2, 2]);
        expect(core.usedCardIdsThisTurn).toContain('scary-doll');
        expect(core.pendingEventRollResolution).toMatchObject({
            effect: { mode: 'trait', trait: 'knowledge', amount: 1 },
            requiresAcknowledgement: false,
        });

        core = finalizePendingEventRollForTest(core);

        expect(core.currentExplorer.traitTracks.knowledge.position).toBe(knowledgePositionBeforeScaryDoll + 1);
        expect(core.currentExplorer.traits.knowledge).toBe(4);
        expect(core.recentRoll?.dice).toEqual([2, 2, 2]);
        expect(core.pendingEventRollResolution).toBeNull();

        const secondUse = BetrayalDomain.validate(
            { core, sys: {} as never },
            createBetrayalCommand(BETRAYAL_COMMANDS.USE_ROLL_REROLL_ITEM, '0', { cardId: 'scary-doll', dieIndex: 0 }),
        );
        expect(secondUse.valid).toBe(false);
    });

it('作祟检定只在确认最终结果后进入灰尘剧本', () => {
        let core = createStartedFirstScenarioCore();
        core.drawOrder = ['event'];
        setNextDiscoverySymbolRoomsForAllFloors(core, 'event');
        core.eventOrder = [BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '一瓶微尘')!];
        core.currentExplorer.inventory = [
            ...core.currentExplorer.inventory,
            { id: 'omen-book', name: '书本', kind: 'omen' },
            { id: 'dog', name: '狗', kind: 'omen' },
            { id: 'mask', name: '面具', kind: 'omen' },
        ];
        core.currentExplorerInventory = [...core.currentExplorer.inventory];

        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'hallway' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.EXPLORE_ROOM, '0', { roomId: 'ground-north' });
        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.RESOLVE_EVENT_CHOICE,
            '0',
            { accept: true },
            100,
            createBetrayalScriptedRandom(3, 3, 3),
            false,
        );

        expect(core.phase).toBe('preHaunt');
        expect(core.scenarioRuntime.dust).toBeUndefined();
        expect(core.pendingEventRollResolution).toMatchObject({
            hauntTriggered: true,
            hauntCardNumber: 3,
            hauntTriggerLabel: 'A Dusty Vial',
        });

        core = finalizePendingEventRollForTest(core);

        expect(core.pendingEventRollResolution).toBeNull();
        expect(core.phase).toBe('haunt');
        expect(core.scenarioRuntime.dust).toBeDefined();
    });

it('幸运硬币只重掷刚刚属性检定的空白骰，重投后空白会生成精神伤害分配', () => {
        let core = createStartedFirstScenarioCore();
        core.currentExplorer = {
            ...core.currentExplorer,
            inventory: [{ id: 'lucky-coin', name: '幸运硬币', kind: 'item' }],
        };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['lucky-coin'];
        setTestTraitTrack(core, '0', 'knowledge', [1, 2, 3, 4], 2, 0);
        setTestTraitTrack(core, '0', 'sanity', [1, 2, 3, 4], 2, 0);
        const sanityPositionBeforeDamage = traitTrackPosition(core, '0', 'sanity');
        core.recentRoll = {
            id: 'lucky-coin-trait-check',
            kind: 'eventTraitCheck',
            playerId: '0',
            sourceTitle: '幸运硬币属性检定',
            trait: 'knowledge',
            dice: [0, 1, 0],
            passiveBonus: 0,
            latestLabel: '属性检定空白骰',
            consumedRabbitFootCardIds: [],
        } as BetrayalCore['recentRoll'];
        markRecentEventRollPendingFinalizationForTest(core);

        expect(canUseRecentRollRerollItemForRecentRoll(core, '0', 'lucky-coin')).toBe(true);
        expect(resolveRecentRollRerollSelectableDieIndices(core.recentRoll!, 'lucky-coin')).toEqual([0, 2]);

        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.USE_ROLL_REROLL_ITEM,
            '0',
            { cardId: 'lucky-coin', dieIndex: 0 },
            100,
            createBetrayalScriptedRandom(1, 3),
        );

        expect(core.recentRoll?.dice).toEqual([0, 1, 2]);
        expect(core.usedCardIdsThisTurn).toContain('lucky-coin');
        expect(core.pendingDamageAllocation).toMatchObject({
            sourceTitle: '幸运硬币',
            damageKind: 'mental',
            amount: 1,
            allowedTraits: ['knowledge', 'sanity'],
            playerId: '0',
        });
        expect(core.activityLog[0]?.text).toContain('重投后仍有 1 个空白');

        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.RESOLVE_DAMAGE_ALLOCATION, '0', {
            traits: ['sanity'],
        });

        expect(core.pendingDamageAllocation).toBeNull();
        expect(traitTrackPosition(core, '0', 'sanity')).toBe(sanityPositionBeforeDamage - 1);
    });

it('幸运硬币重投后没有空白时不会生成精神伤害分配', () => {
        let core = createStartedFirstScenarioCore();
        core.currentExplorer = {
            ...core.currentExplorer,
            inventory: [{ id: 'lucky-coin', name: '幸运硬币', kind: 'item' }],
        };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['lucky-coin'];
        core.recentRoll = {
            id: 'lucky-coin-clean-reroll',
            kind: 'eventTraitCheck',
            playerId: '0',
            sourceTitle: '幸运硬币属性检定',
            trait: 'knowledge',
            dice: [0, 1, 0],
            passiveBonus: 0,
            latestLabel: '属性检定空白骰',
            consumedRabbitFootCardIds: [],
        } as BetrayalCore['recentRoll'];
        markRecentEventRollPendingFinalizationForTest(core);

        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.USE_ROLL_REROLL_ITEM,
            '0',
            { cardId: 'lucky-coin', dieIndex: 0 },
            100,
            createBetrayalScriptedRandom(3, 3),
        );

        expect(core.recentRoll?.dice).toEqual([2, 1, 2]);
        expect(core.usedCardIdsThisTurn).toContain('lucky-coin');
        expect(core.pendingDamageAllocation).toBeNull();
    });

it('恐怖玩偶和幸运硬币只开放各自允许的属性检定重掷窗口', () => {
        const core = createStartedFirstScenarioCore();
        core.currentExplorer = {
            ...core.currentExplorer,
            inventory: [
                { id: 'scary-doll', name: '恐怖玩偶', kind: 'item' },
                { id: 'lucky-coin', name: '幸运硬币', kind: 'item' },
            ],
        };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['scary-doll', 'lucky-coin'];

        for (const kind of ['eventDiceRoll', 'attackRoll', 'hauntRoll', 'hauntActionTraitCheck'] as const) {
            core.recentRoll = {
                id: `blocked-${kind}`,
                kind,
                playerId: '0',
                sourceTitle: `阻塞窗口：${kind}`,
                dice: [0, 1, 2],
                passiveBonus: 0,
                latestLabel: '不应开放恐怖玩偶',
                consumedRabbitFootCardIds: [],
            } as BetrayalCore['recentRoll'];

            expect(canUseRecentRollRerollItemForRecentRoll(core, '0', 'scary-doll'), kind).toBe(false);
            expect(resolveRecentRollRerollSelectableDieIndices(core.recentRoll!, 'scary-doll'), kind).toEqual([]);
            expect(canUseRecentRollRerollItemForRecentRoll(core, '0', 'lucky-coin'), kind).toBe(false);
            expect(resolveRecentRollRerollSelectableDieIndices(core.recentRoll!, 'lucky-coin'), kind).toEqual([]);
        }

        core.recentRoll = {
            id: 'trait-check-with-blanks',
            kind: 'eventTraitCheck',
            playerId: '0',
            sourceTitle: '属性检定空白骰',
            trait: 'knowledge',
            dice: [0, 1, 0],
            passiveBonus: 0,
            latestLabel: '属性检定',
            consumedRabbitFootCardIds: [],
        } as BetrayalCore['recentRoll'];
        markRecentEventRollPendingFinalizationForTest(core);

        expect(canUseRecentRollRerollItemForRecentRoll(core, '0', 'scary-doll')).toBe(true);
        expect(resolveRecentRollRerollSelectableDieIndices(core.recentRoll!, 'scary-doll')).toEqual([0, 1, 2]);
        expect(canUseRecentRollRerollItemForRecentRoll(core, '0', 'lucky-coin')).toBe(true);
        expect(resolveRecentRollRerollSelectableDieIndices(core.recentRoll!, 'lucky-coin')).toEqual([0, 2]);

        core.recentRoll = {
            ...core.recentRoll,
            id: 'trait-check-without-blanks',
            dice: [1, 2, 1],
        } as BetrayalCore['recentRoll'];
        markRecentEventRollPendingFinalizationForTest(core);
        expect(canUseRecentRollRerollItemForRecentRoll(core, '0', 'lucky-coin')).toBe(false);
        expect(resolveRecentRollRerollSelectableDieIndices(core.recentRoll!, 'lucky-coin')).toEqual([]);

        core.recentRoll = {
            id: 'room-end-turn-trait-check',
            kind: 'roomEndTurnTraitCheck',
            playerId: '0',
            sourceTitle: '房间回合末属性检定',
            trait: 'might',
            dice: [2, 0, 1],
            passiveBonus: 0,
            latestLabel: '房间回合末属性检定',
            consumedRabbitFootCardIds: [],
        } as BetrayalCore['recentRoll'];
        core.pendingEventRollResolution = null;
        expect(canUseRecentRollRerollItemForRecentRoll(core, '0', 'scary-doll')).toBe(true);
        expect(resolveRecentRollRerollSelectableDieIndices(core.recentRoll!, 'scary-doll')).toEqual([0, 1, 2]);
        expect(canUseRecentRollRerollItemForRecentRoll(core, '0', 'lucky-coin')).toBe(true);
        expect(resolveRecentRollRerollSelectableDieIndices(core.recentRoll!, 'lucky-coin')).toEqual([1]);

        const luckyCoinValidation = BetrayalDomain.validate(
            { core, sys: {} as never },
            createBetrayalCommand(BETRAYAL_COMMANDS.USE_ROLL_REROLL_ITEM, '0', { cardId: 'lucky-coin', dieIndex: 0 }),
        );
        expect(luckyCoinValidation.valid).toBe(true);
    });

it('兔脚可以重掷刚刚事件固定投骰，并回写原事件分支结算', () => {
        let core = createStartedFirstScenarioCore();
        core.drawOrder = ['event'];
        setNextDiscoverySymbolRoomsForAllFloors(core, 'event');
        core.eventOrder = [BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '一种怪异的感觉')!];
        core.currentExplorer = {
            ...core.currentExplorer,
            traits: {
                ...core.currentExplorer.traits,
                speed: 4,
                sanity: 4,
            },
            inventory: [{ id: 'rope', name: '兔脚', kind: 'item' }],
        };
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['rope'];
        const mightPositionBeforeWeirdFeeling = traitTrackPosition(core, '0', 'might');
        const sanityPositionBeforeWeirdFeeling = traitTrackPosition(core, '0', 'sanity');

        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'hallway' });
        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.EXPLORE_ROOM,
            '0',
            { roomId: 'ground-north' },
            100,
            createBetrayalScriptedRandom(1, 1),
            false,
        );

        expect(core.latestDiscovery?.detail).toContain('投 2 颗骰子 0');
        expect(core.latestDiscovery?.detail).toContain('失去 1 点力量');
        expect(traitTrackPosition(core, '0', 'might')).toBe(mightPositionBeforeWeirdFeeling);
        expect(traitTrackPosition(core, '0', 'sanity')).toBe(sanityPositionBeforeWeirdFeeling);
        expect(core.recentRoll?.kind).toBe('eventDiceRoll');
        expect(core.recentRoll?.dice).toEqual([0, 0]);
        expect(core.pendingEventRollResolution?.effect).toMatchObject({ mode: 'trait', trait: 'might', amount: -1 });

        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.USE_RABBIT_FOOT,
            '0',
            { cardId: 'rope', dieIndex: 0 },
            100,
            createBetrayalScriptedRandom(6),
            false,
        );

        expect(core.latestDiscovery?.detail).toContain('投 2 颗骰子 2');
        expect(core.latestDiscovery?.detail).toContain('失去 1 点神志');
        expect(core.latestDiscovery?.tone).toBe('warning');
        expect(traitTrackPosition(core, '0', 'might')).toBe(mightPositionBeforeWeirdFeeling);
        expect(traitTrackPosition(core, '0', 'sanity')).toBe(sanityPositionBeforeWeirdFeeling);
        expect(core.recentRoll?.dice).toEqual([2, 0]);
        expect(core.pendingEventRollResolution).toMatchObject({
            effect: { mode: 'trait', trait: 'sanity', amount: -1 },
            requiresAcknowledgement: false,
        });
        expect(traitTrackPosition(core, '0', 'might')).toBe(mightPositionBeforeWeirdFeeling);
        expect(core.usedCardIdsThisTurn).toContain('rope');

        core = finalizePendingEventRollForTest(core);

        expect(traitTrackPosition(core, '0', 'sanity')).toBe(sanityPositionBeforeWeirdFeeling - 1);
        expect(core.pendingEventRollResolution).toBeNull();
        expect(traitTrackPosition(core, '0', 'might')).toBe(mightPositionBeforeWeirdFeeling);
    });

it('兔脚可以重掷标本剥制力量检定，并在展示结束后只应用新分支', () => {
        let core = createStartedFirstScenarioCore();
        core.drawOrder = ['event'];
        setNextDiscoverySymbolRoomsForAllFloors(core, 'event');
        core.eventOrder = [BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '标本剥制')!];
        core.currentExplorer = {
            ...core.currentExplorer,
            traits: {
                ...core.currentExplorer.traits,
                might: 4,
                speed: 4,
                sanity: 4,
            },
            inventory: [{ id: 'rope', name: '兔脚', kind: 'item' }],
        };
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['rope'];

        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'hallway' });
        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.EXPLORE_ROOM,
            '0',
            { roomId: 'ground-north' },
            100,
            createBetrayalScriptedRandom(1, 1, 1, 1),
            false,
        );

        expect(core.latestDiscovery?.detail).toContain('力量检定 0');
        expect(core.currentExplorer.traits.might).toBe(4);
        expect(core.currentExplorer.traits.sanity).toBe(4);
        expect(core.rooms.find((room) => room.id === 'ground-north')?.markerTokens ?? []).not.toContain('obstacle');

        core.recentRoll = {
            ...core.recentRoll!,
            consumedRabbitFootCardIds: [],
            dice: [2, 2, 2, 0],
            latestLabel: '受到 1 点物理伤害；放置障碍物',
        };
        core.usedCardIdsThisTurn = [];
        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.USE_RABBIT_FOOT,
            '0',
            { cardId: 'rope', dieIndex: 3 },
            100,
            createBetrayalScriptedRandom(3),
            false,
        );

        expect(core.latestDiscovery?.detail).toContain('力量检定 8');
        expect(core.latestDiscovery?.detail).toContain('获得 1 点神志');
        expect(core.currentExplorer.traits.might).toBe(4);
        expect(core.currentExplorer.traits.sanity).toBe(4);
        expect(core.rooms.find((room) => room.id === 'ground-north')?.markerTokens ?? []).not.toContain('obstacle');
        expect(core.pendingEventRollResolution).toMatchObject({
            effect: { mode: 'trait', trait: 'sanity', amount: 1 },
            requiresAcknowledgement: false,
        });
        expect(core.currentExplorer.traits.might).toBe(4);
        expect(core.rooms.find((room) => room.id === 'ground-north')?.markerTokens ?? []).not.toContain('obstacle');
        expect(core.usedCardIdsThisTurn).toContain('rope');

        core = finalizePendingEventRollForTest(core);

        expect(core.currentExplorer.traits.sanity).toBe(5);
        expect(core.pendingEventRollResolution).toBeNull();
        expect(core.currentExplorer.traits.might).toBe(4);
        expect(core.rooms.find((room) => room.id === 'ground-north')?.markerTokens ?? []).not.toContain('obstacle');
    });

it('事件骰出现后使用书本会立即支付神志并按知识重新投骰，展示结束后自动结算', () => {
        let core = createStartedFirstScenarioCore();
        core.drawOrder = ['event'];
        setNextDiscoverySymbolRoomsForAllFloors(core, 'event');
        core.eventOrder = [BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '标本剥制')!];
        core.currentExplorer = {
            ...core.currentExplorer,
            traits: {
                ...core.currentExplorer.traits,
                might: 3,
                knowledge: 2,
                sanity: 4,
            },
            inventory: [{ id: 'omen-book', name: '书本', kind: 'omen' }],
        };
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['omen-book'];
        setTestTraitTrack(core, '0', 'might', [1, 2, 3, 4, 5], 2, 2);
        setTestTraitTrack(core, '0', 'knowledge', [1, 2, 3, 4, 5], 1, 1);
        setTestTraitTrack(core, '0', 'sanity', [1, 2, 3, 4, 5], 3, 3);
        const sanityPositionBeforeBook = traitTrackPosition(core, '0', 'sanity');

        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'hallway' });
        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.EXPLORE_ROOM,
            '0',
            { roomId: 'ground-north' },
            100,
            createBetrayalScriptedRandom(1, 1, 1),
            false,
        );

        expect(core.recentRoll?.trait).toBe('might');
        expect(core.recentRoll?.dice).toHaveLength(3);
        expect(canUseBookForPendingEventRoll(core, '0', 'omen-book')).toBe(true);
        expect(BetrayalDomain.validate(
            { core, sys: {} as never },
            createBetrayalCommand(BETRAYAL_COMMANDS.USE_POSSESSION, '0', { cardId: 'omen-book' }),
        )).toMatchObject({ valid: true });

        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.USE_POSSESSION,
            '0',
            { cardId: 'omen-book' },
            101,
            createBetrayalScriptedRandom(3, 3),
            false,
        );

        expect(traitTrackPosition(core, '0', 'sanity')).toBe(sanityPositionBeforeBook - 1);
        expect(core.usedCardIdsThisTurn).toContain('omen-book');
        expect(core.nextNonCombatTraitReplacement).toBeNull();
        expect(core.recentRoll?.kind).toBe('eventTraitCheck');
        expect(core.recentRoll?.trait).toBe('knowledge');
        expect(core.recentRoll?.rollLabel).toBe('知识检定');
        expect(core.recentRoll?.dice).toHaveLength(2);
        expect(core.pendingEventRollResolution).toMatchObject({
            rollId: core.recentRoll?.id,
            sourceTitle: '标本剥制',
            requiredPlayerIds: ['0'],
            requiresAcknowledgement: false,
            effect: { mode: 'trait', trait: 'sanity', amount: 1 },
        });
        expect(core.latestDiscovery?.title).toBe('标本剥制');
        expect(core.latestDiscovery?.detail).toContain('知识检定');

        core = finalizePendingEventRollForTest(core, BETRAYAL_FIXED_RANDOM);
        expect(core.pendingEventRollResolution).toBeNull();
        expect(core.pendingCardResolutionQueue).toEqual([]);
        expect(traitTrackPosition(core, '0', 'sanity')).toBe(sanityPositionBeforeBook);
        expect(core.currentExplorer.traits.sanity).toBe(4);
    });

it('书本改骰后兔脚仍失败时，展示结束后进入固定物理伤害分配', () => {
        let core = createStartedFirstScenarioCore();
        core.drawOrder = ['event'];
        setNextDiscoverySymbolRoomsForAllFloors(core, 'event');
        core.eventOrder = [BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '标本剥制')!];
        core.currentExplorer = {
            ...core.currentExplorer,
            traits: {
                ...core.currentExplorer.traits,
                might: 3,
                speed: 5,
                knowledge: 5,
                sanity: 4,
            },
            inventory: [
                { id: 'omen-book', name: '书本', kind: 'omen' },
                { id: 'rope', name: '兔脚', kind: 'item' },
            ],
        };
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['omen-book', 'rope'];
        setTestTraitTrack(core, '0', 'might', [1, 2, 3, 4, 5], 2, 2);
        setTestTraitTrack(core, '0', 'speed', [1, 2, 3, 4, 5, 6], 4, 4);
        setTestTraitTrack(core, '0', 'knowledge', [1, 2, 3, 4, 5], 4, 4);
        setTestTraitTrack(core, '0', 'sanity', [1, 2, 3, 4, 5], 3, 3);
        const physicalPositionBeforeDamage = traitTrackPositionTotal(core, '0', ['might', 'speed']);
        const sanityPositionBeforeBook = traitTrackPosition(core, '0', 'sanity');

        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'hallway' });
        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.EXPLORE_ROOM,
            '0',
            { roomId: 'ground-north' },
            100,
            createBetrayalScriptedRandom(1, 1, 1),
            false,
        );

        expect(core.recentRoll?.trait).toBe('might');
        expect(core.pendingEventRollResolution?.effect).toMatchObject({
            mode: 'compound',
            effects: expect.arrayContaining([
                expect.objectContaining({ mode: 'fixedDamage', amount: 1, damageKind: 'physical' }),
                expect.objectContaining({ mode: 'placeObstacleToken' }),
            ]),
        });

        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.USE_POSSESSION,
            '0',
            { cardId: 'omen-book' },
            101,
            createBetrayalScriptedRandom(3, 1, 1, 1, 1),
            false,
        );

        expect(traitTrackPosition(core, '0', 'sanity')).toBe(sanityPositionBeforeBook - 1);
        expect(core.recentRoll?.trait).toBe('knowledge');
        expect(core.recentRoll?.dice).toEqual([2, 0, 0, 0, 0]);
        expect(core.pendingEventRollResolution).toMatchObject({
            sourceTitle: '标本剥制',
            requiresAcknowledgement: false,
            effect: expect.objectContaining({ mode: 'compound' }),
        });
        expect(core.pendingDamageAllocation).toBeNull();

        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.USE_RABBIT_FOOT,
            '0',
            { cardId: 'rope', dieIndex: 0 },
            102,
            createBetrayalScriptedRandom(1),
            false,
        );

        expect(core.recentRoll?.dice).toEqual([0, 0, 0, 0, 0]);
        expect(core.pendingEventRollResolution).toMatchObject({
            sourceTitle: '标本剥制',
            requiresAcknowledgement: false,
            effect: expect.objectContaining({ mode: 'compound' }),
        });
        expect(core.pendingDamageAllocation).toBeNull();

        core = finalizePendingEventRollForTest(core);

        expect(core.pendingEventRollResolution).toBeNull();
        expectPendingDamageForTest(core, {
            sourceTitle: '标本剥制',
            playerId: '0',
            damageKind: 'physical',
            originalAmount: 1,
            amount: 1,
            allowedTraits: ['might', 'speed'],
        });
        expect(core.rooms.find((room) => room.id === 'ground-north')?.markerTokens ?? []).toContain('obstacle');
        expect(traitTrackPositionTotal(core, '0', ['might', 'speed'])).toBe(physicalPositionBeforeDamage);

        core = resolvePendingDamageForTest(core, ['speed']);

        expect(core.pendingDamageAllocation).toBeNull();
        expect(traitTrackPositionTotal(core, '0', ['might', 'speed'])).toBe(physicalPositionBeforeDamage - 1);
    });

it('兔脚重掷电话铃声时会在展示结束后应用新分支', () => {
        let core = createStartedFirstScenarioCore();
        core.drawOrder = ['event'];
        setNextDiscoverySymbolRoomsForAllFloors(core, 'event');
        core.eventOrder = [BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '电话铃声')!];
        core.currentExplorer = {
            ...core.currentExplorer,
            traits: {
                ...core.currentExplorer.traits,
                might: 4,
                speed: 4,
                knowledge: 4,
                sanity: 4,
            },
            inventory: [{ id: 'rope', name: '兔脚', kind: 'item' }],
        };
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['rope'];
        setTestTraitTrack(core, '0', 'knowledge', [2, 3, 4, 5, 6], 2, 2);
        const knowledgePositionBeforePhoneReroll = traitTrackPosition(core, '0', 'knowledge');

        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'hallway' });
        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.EXPLORE_ROOM,
            '0',
            { roomId: 'ground-north' },
            100,
            createBetrayalScriptedRandom(2, 2, 3),
            false,
        );

        expect(core.latestDiscovery?.detail).toContain('受到一颗骰子的精神伤害');
        expect(core.currentExplorer.traitTracks.knowledge.position).toBe(knowledgePositionBeforePhoneReroll);
        expect(core.currentExplorer.traits.knowledge).toBe(4);
        expect(core.currentExplorer.traits.sanity).toBe(4);

        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.USE_RABBIT_FOOT,
            '0',
            { cardId: 'rope', dieIndex: 0 },
            100,
            createBetrayalScriptedRandom(6),
            false,
        );

        expect(core.latestDiscovery?.detail).toContain('投 2 颗骰子 3');
        expect(core.latestDiscovery?.detail).toContain('获得 1 点知识');
        expect(core.currentExplorer.traitTracks.knowledge.position).toBe(knowledgePositionBeforePhoneReroll);
        expect(core.currentExplorer.traits.knowledge).toBe(4);
        expect(core.currentExplorer.traits.sanity).toBe(4);
        expect(core.pendingEventRollResolution).toMatchObject({
            effect: { mode: 'trait', trait: 'knowledge', amount: 1 },
            requiresAcknowledgement: false,
        });
        expect(core.currentExplorer.traits.sanity).toBe(4);
        expect(core.usedCardIdsThisTurn).toContain('rope');

        core = finalizePendingEventRollForTest(core);

        expect(core.currentExplorer.traitTracks.knowledge.position).toBe(knowledgePositionBeforePhoneReroll + 1);
        expect(core.currentExplorer.traits.knowledge).toBe(5);
        expect(core.pendingEventRollResolution).toBeNull();
        expect(core.currentExplorer.traits.sanity).toBe(4);
    });

it('兔脚重掷小机器人时会在展示结束后应用新分支', () => {
        let core = createStartedFirstScenarioCore();
        core.drawOrder = ['event'];
        setNextDiscoverySymbolRoomsForAllFloors(core, 'event');
        core.eventOrder = [BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '小机器人')!];
        core.currentExplorer = {
            ...core.currentExplorer,
            traits: {
                ...core.currentExplorer.traits,
                might: 4,
                speed: 4,
                knowledge: 4,
            },
            inventory: [{ id: 'rope', name: '兔脚', kind: 'item' }],
        };
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['rope'];
        setTestTraitTrack(core, '0', 'might', [2, 3, 4, 5, 6], 2, 2);
        const mightPositionBeforeRobotReroll = traitTrackPosition(core, '0', 'might');
        const itemDeckBefore = core.deckCounts.item;

        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'hallway' });
        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.EXPLORE_ROOM,
            '0',
            { roomId: 'ground-north' },
            100,
            createBetrayalScriptedRandom(3, 2, 2, 2),
            false,
        );

        expect(core.latestDiscovery?.detail).toContain('知识检定 5');
        expect(core.latestDiscovery?.detail).toContain('抽取一张物品卡');
        expect(core.currentExplorer.inventory).toEqual([{ id: 'rope', name: '兔脚', kind: 'item' }]);
        expect(core.deckCounts.item).toBe(itemDeckBefore);

        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.USE_RABBIT_FOOT,
            '0',
            { cardId: 'rope', dieIndex: 0 },
            100,
            createBetrayalScriptedRandom(1, 3),
            false,
        );

        expect(core.latestDiscovery?.detail).toContain('知识检定 3');
        expect(core.latestDiscovery?.detail).toContain('受到一颗骰子的物理伤害');
        expect(core.currentExplorer.inventory).toEqual([{ id: 'rope', name: '兔脚', kind: 'item' }]);
        expect(core.currentExplorerInventory).toEqual([{ id: 'rope', name: '兔脚', kind: 'item' }]);
        expect(core.deckCounts.item).toBe(itemDeckBefore);
        expect(core.currentExplorer.traitTracks.might.position).toBe(mightPositionBeforeRobotReroll);
        expect(core.currentExplorer.traits.might).toBe(4);
        expect(core.currentExplorer.traits.speed).toBe(4);
        expect(core.pendingEventRollResolution).toMatchObject({
            effect: { mode: 'rolledDamage', dice: 1, damageKind: 'physical' },
            requiresAcknowledgement: false,
        });
        expect(core.pendingDamageAllocation).toBeNull();

        core = finalizePendingEventRollForTest(core);

        expect(core.pendingEventRollResolution).toBeNull();
        expectPendingDamageForTest(core, {
            sourceTitle: '小机器人',
            damageKind: 'physical',
            originalAmount: 2,
            allowedTraits: ['might', 'speed'],
        });
        expect(core.currentExplorer.inventory).toEqual([{ id: 'rope', name: '兔脚', kind: 'item' }]);
        expect(core.currentExplorerInventory).toEqual([{ id: 'rope', name: '兔脚', kind: 'item' }]);
        expect(core.deckCounts.item).toBe(itemDeckBefore);
        expect(core.currentExplorer.traitTracks.might.position).toBe(mightPositionBeforeRobotReroll);
        core = resolvePendingDamageForTest(core, ['might', 'might']);
        expect(core.currentExplorer.traitTracks.might.position).toBe(mightPositionBeforeRobotReroll - 2);
        expect(core.currentExplorer.traits.might).toBe(2);
        expect(core.currentExplorer.traits.speed).toBe(4);
        expect(core.usedCardIdsThisTurn).toContain('rope');
    });

it('手电筒只在事件属性检定多投 2 颗骰，不能被主动使用成通用加成', () => {
        let core = createStartedFirstScenarioCore();
        core.drawOrder = ['event'];
        setNextDiscoverySymbolRoomsForAllFloors(core, 'event');
        core.eventOrder = [
            {
                name: '墙中低语',
                roll: {
                    trait: 'knowledge',
                    branches: [
                        { min: 5, label: '抵住低语，获得 1 点知识', effect: { mode: 'trait', trait: 'knowledge', amount: 1, recommendedAction: 'explore' } },
                        { min: 0, label: '被低语扰乱，失去 1 点知识', effect: { mode: 'trait', trait: 'knowledge', amount: -1, recommendedAction: 'endTurn' } },
                    ],
                },
            },
        ];
        core.currentExplorer = {
            ...core.currentExplorer,
            traits: {
                ...core.currentExplorer.traits,
                knowledge: 3,
            },
            inventory: [{ id: 'flashlight', name: '手电筒', kind: 'item' }],
        };
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['flashlight'];

        const validation = BetrayalDomain.validate(
            { core, sys: {} as never },
            createBetrayalCommand(BETRAYAL_COMMANDS.USE_POSSESSION, '0', { cardId: 'flashlight' }),
        );
        expect(validation.valid).toBe(false);
        if (!validation.valid) {
            expect(validation.error).toContain('没有主动使用效果');
        }

        const knowledgeBefore = core.currentExplorer.traits.knowledge;
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'hallway' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.EXPLORE_ROOM, '0', { roomId: 'ground-north' }, 100, createBetrayalScriptedRandom(3, 3, 3, 1, 1));

        expect(core.latestDiscovery?.kind).toBe('event');
        expect(core.latestDiscovery?.detail).toContain('知识检定 6');
        expect(core.currentExplorer.traits.knowledge).toBe(knowledgeBefore + 1);
    });

it('盔甲是被动物理减伤防具，不能被主动使用成通用移动效果', () => {
        const core = createStartedFirstScenarioCore();
        core.currentExplorer = {
            ...core.currentExplorer,
            inventory: [{ id: 'armor', name: '盔甲', kind: 'omen' }],
        };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['armor'];

        const validation = BetrayalDomain.validate(
            { core, sys: {} as never },
            createBetrayalCommand(BETRAYAL_COMMANDS.USE_POSSESSION, '0', { cardId: 'armor' }),
        );

        expect(validation.valid).toBe(false);
        if (!validation.valid) {
            expect(validation.error).toContain('没有主动使用效果');
        }
    });

it('头戴耳机会把承受的精神伤害降低 1 点', () => {
        let core = createCrimsonJackHauntCore();
        core.currentExplorer = {
            ...core.currentExplorer,
            traits: {
                ...core.currentExplorer.traits,
                knowledge: 4,
                sanity: 4,
            },
            inventory: [{ id: 'radio', name: '头戴耳机', kind: 'item' }],
        };
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.activeRoomId = core.currentExplorer.roomId;

        placeActiveTestExplorerInRoom(core, '0', 'ground-north');
        const mentalPositionBeforeStudy = traitTrackPositionTotal(core, '0', ['knowledge', 'sanity']);

        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.STUDY_EXORCISM,
            '0',
            {},
            100,
            createBetrayalScriptedRandom(1, 1, 1, 1),
        );

        expect(core.scenarioRuntime.exorcismCircleRoomIds).toEqual([]);
        expect(traitTrackPositionTotal(core, '0', ['knowledge', 'sanity'])).toBe(mentalPositionBeforeStudy - 1);
    });

it('头戴耳机不会阻挡对知识属性的直接降低，也不能被主动使用成通用移动效果', () => {
        let core = createStartedFirstScenarioCore();
        core.drawOrder = ['event'];
        setNextDiscoverySymbolRoomsForAllFloors(core, 'event');
        core.eventOrder = [
            {
                name: '墙中低语',
                text: '墙里的声音扰乱了你的判断。失去 1 点知识。',
                effect: { mode: 'trait', trait: 'knowledge', amount: -1, recommendedAction: 'endTurn' },
            },
        ];
        core.currentExplorer = {
            ...core.currentExplorer,
            inventory: [{ id: 'radio', name: '头戴耳机', kind: 'item' }],
        };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['radio'];
        const knowledgeBefore = core.currentExplorer.traits.knowledge;

        const validation = BetrayalDomain.validate(
            { core, sys: {} as never },
            createBetrayalCommand(BETRAYAL_COMMANDS.USE_POSSESSION, '0', { cardId: 'radio' }),
        );
        expect(validation.valid).toBe(false);
        if (!validation.valid) {
            expect(validation.error).toContain('没有主动使用效果');
        }

        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'hallway' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.EXPLORE_ROOM, '0', { roomId: 'ground-north' });

        expect(core.latestDiscovery?.kind).toBe('event');
        expect(core.currentExplorer.traits.knowledge).toBe(knowledgeBefore - 1);
    });

it('魔法相机会让知识检定改用更高的神志属性，且不能被主动使用成通用属性加成', () => {
        let learnCore = createFirstScenarioReadyToLearnAboutJackCore();
        learnCore.currentExplorer = {
            ...learnCore.currentExplorer,
            traits: {
                ...learnCore.currentExplorer.traits,
                knowledge: 1,
                sanity: 4,
            },
            inventory: [{ id: 'camera', name: '魔法相机', kind: 'item' }],
        };
        learnCore.currentExplorerTraits = { ...learnCore.currentExplorer.traits };
        learnCore.currentExplorerInventory = [...learnCore.currentExplorer.inventory];
        learnCore.turnStartInventoryCardIds = ['camera'];

        const validation = BetrayalDomain.validate(
            { core: learnCore, sys: {} as never },
            createBetrayalCommand(BETRAYAL_COMMANDS.USE_POSSESSION, '0', { cardId: 'camera' }),
        );
        expect(validation.valid).toBe(false);
        if (!validation.valid) {
            expect(validation.error).toContain('没有主动使用效果');
        }

        learnCore = applyBetrayalCommand(
            learnCore,
            BETRAYAL_COMMANDS.LEARN_ABOUT_JACK,
            '0',
            {},
            100,
            createBetrayalScriptedRandom(3, 3, 2, 1),
        );
        expect(learnCore.scenarioRuntime.knowledgeOfJackPlayerIds).toContain('0');

        learnCore.currentExplorer = {
            ...learnCore.currentExplorer,
            roomId: 'upper-west',
        };
        learnCore.activeRoomId = 'upper-west';
        learnCore.currentExplorerRoomId = 'upper-west';
        learnCore.usedCardIdsThisTurn = [];
        learnCore = applyBetrayalCommand(
            learnCore,
            BETRAYAL_COMMANDS.LEARN_ABOUT_JACK,
            '0',
            {},
            101,
            createBetrayalScriptedRandom(3, 3, 2, 1),
        );
        expect(learnCore.scenarioRuntime.knowledgeOfJackPlayerIds).toContain('1');

        let studyCore = createFirstScenarioReadyToStudyExorcismCore();
        studyCore.currentExplorer = {
            ...studyCore.currentExplorer,
            traits: {
                ...studyCore.currentExplorer.traits,
                knowledge: 1,
                sanity: 4,
            },
            inventory: [{ id: 'camera', name: '魔法相机', kind: 'item' }],
        };
        studyCore.currentExplorerTraits = { ...studyCore.currentExplorer.traits };
        studyCore.currentExplorerInventory = [...studyCore.currentExplorer.inventory];
        const circleCountBefore = studyCore.scenarioRuntime.exorcismCircleRoomIds.length;

        studyCore = applyBetrayalCommand(
            studyCore,
            BETRAYAL_COMMANDS.STUDY_EXORCISM,
            '0',
            {},
            100,
            createBetrayalScriptedRandom(3, 3, 2, 1),
        );
        expect(studyCore.scenarioRuntime.exorcismCircleRoomIds).toHaveLength(circleCountBefore + 1);
    });

it('奇怪的药品会埋葬并治疗当前探索者的力量和速度', () => {
        let core = createStartedFirstScenarioCore();
        core.currentExplorer = {
            ...core.currentExplorer,
            traits: {
                ...core.currentExplorer.traits,
                might: 2,
                speed: 1,
            },
            inventory: [
                { id: 'holy-water', name: '奇怪的药品', kind: 'item' },
            ],
        };
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['holy-water'];
        setTestTraitTrack(core, '0', 'might', [1, 2, 3, 4, 5], 1, 3);
        setTestTraitTrack(core, '0', 'speed', [1, 1, 2, 3, 4], 1, 3);

        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.USE_POSSESSION, '0', { cardId: 'holy-water' });

        expect(core.currentExplorer.traits.might).toBe(4);
        expect(core.currentExplorer.traits.speed).toBe(3);
        expect(core.currentExplorer.inventory).toEqual([]);
        expect(core.currentExplorerInventory).toEqual([]);
        expect(core.usedCardIdsThisTurn).toContain('holy-water');
        expect(core.activityLog[0]?.text).toContain('埋葬奇怪的药品');

        const secondUseValidation = BetrayalDomain.validate(
            { core, sys: {} as never },
            createBetrayalCommand(BETRAYAL_COMMANDS.USE_POSSESSION, '0', { cardId: 'holy-water' }),
        );
        expect(secondUseValidation.valid).toBe(false);
        if (!secondUseValidation.valid) {
            expect(secondUseValidation.error).toContain('当前没有可使用持有物');
        }
    });

it('急救包会埋葬并治疗当前探索者的所有濒死属性', () => {
        let core = createStartedFirstScenarioCore();
        core.currentExplorer = {
            ...core.currentExplorer,
            inventory: [
                { id: 'medical-kit', name: '急救包', kind: 'item' },
            ],
        };
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['medical-kit'];
        setTestExplorerTraitsBelowCatalogStart(core, '0');

        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.USE_POSSESSION, '0', { cardId: 'medical-kit', targetPlayerId: '0' });

        expect(core.currentExplorer.traits).toEqual(
            EXPLORER_CATALOG.find((explorer) => explorer.explorerId === core.currentExplorer.explorerId)!.traits,
        );
        expect(core.currentExplorer.inventory).toEqual([]);
        expect(core.currentExplorerInventory).toEqual([]);
        expect(core.usedCardIdsThisTurn).toContain('medical-kit');
        expect(core.activityLog[0]?.text).toContain('埋葬急救包');
    });

it('急救包可以治疗同板块另一位探索者并从当前探索者持有区移除', () => {
        let core = createStartedFirstScenarioCore();
        const targetPlayerId = core.otherExplorers[0]!.playerId;
        core.currentExplorer = {
            ...core.currentExplorer,
            inventory: [
                { id: 'medical-kit', name: '急救包', kind: 'item' },
            ],
        };
        core.otherExplorers = core.otherExplorers.map((explorer) => (
            explorer.playerId === targetPlayerId
                ? {
                    ...explorer,
                    roomId: core.currentExplorer.roomId,
                }
                : explorer
        ));
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['medical-kit'];
        setTestExplorerTraitsBelowCatalogStart(core, targetPlayerId);
        const currentTraitsBefore = { ...core.currentExplorer.traits };

        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.USE_POSSESSION, '0', {
            cardId: 'medical-kit',
            targetPlayerId,
        });

        const target = core.otherExplorers.find((explorer) => explorer.playerId === targetPlayerId)!;
        expect(target.traits).toEqual(
            EXPLORER_CATALOG.find((explorer) => explorer.explorerId === target.explorerId)!.traits,
        );
        expect(core.currentExplorer.traits).toEqual(currentTraitsBefore);
        expect(core.currentExplorer.inventory).toEqual([]);
        expect(core.currentExplorerInventory).toEqual([]);
        expect(core.usedCardIdsThisTurn).toContain('medical-kit');
        expect(core.activityLog[0]?.text).toContain(target.displayName);
    });

it('急救包不能治疗不同板块的另一位探索者', () => {
        const core = createStartedFirstScenarioCore();
        const targetPlayerId = core.otherExplorers[0]!.playerId;
        core.currentExplorer = {
            ...core.currentExplorer,
            inventory: [
                { id: 'medical-kit', name: '急救包', kind: 'item' },
            ],
        };
        core.otherExplorers = core.otherExplorers.map((explorer) => (
            explorer.playerId === targetPlayerId
                ? { ...explorer, roomId: 'upper-landing' }
                : explorer
        ));
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['medical-kit'];

        const validation = BetrayalDomain.validate(
            { core, sys: {} as never },
            createBetrayalCommand(BETRAYAL_COMMANDS.USE_POSSESSION, '0', {
                cardId: 'medical-kit',
                targetPlayerId,
            }),
        );

        expect(validation.valid).toBe(false);
        if (!validation.valid) {
            expect(validation.error).toContain('急救包只能治疗自己或同板块的另一位探索者');
        }
    });

it.each([
        ['map', '地图'],
        ['notebook', '笔记本'],
        ['journal', '日记'],
        ['manuscript', '手稿'],
    ] as const)('%s 会埋葬并把当前探索者放置到任一已发现板块', (cardId, cardName) => {
        let core = createStartedFirstScenarioCore();
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'entrance-hall',
            inventory: [
                { id: cardId, name: cardName, kind: 'item' },
            ],
        };
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = [cardId];

        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.USE_POSSESSION, '0', {
            cardId,
            targetRoomId: 'upper-landing',
        });

        expect(core.currentExplorer.roomId).toBe('upper-landing');
        expect(core.activeRoomId).toBe('upper-landing');
        expect(core.currentExplorer.inventory).toEqual([]);
        expect(core.currentExplorerInventory).toEqual([]);
        expect(core.usedCardIdsThisTurn).toContain(cardId);
        expect(core.activityLog[0]?.text).toContain(`埋葬${cardName}`);
    });

it.each([
        ['map', '地图'],
        ['notebook', '笔记本'],
        ['journal', '日记'],
        ['manuscript', '手稿'],
    ] as const)('%s 不能把当前探索者放置到未发现板块', (cardId, cardName) => {
        const core = createStartedFirstScenarioCore();
        core.currentExplorer.inventory = [
            { id: cardId, name: cardName, kind: 'item' },
        ];
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = [cardId];

        const validation = BetrayalDomain.validate(
            { core, sys: {} as never },
            createBetrayalCommand(BETRAYAL_COMMANDS.USE_POSSESSION, '0', {
                cardId,
                targetRoomId: 'upper-north',
            }),
        );

        expect(validation.valid).toBe(false);
        if (!validation.valid) {
            expect(validation.error).toContain(`${cardName}只能把探索者放置到已发现板块`);
        }
    });

it('骨制钥匙可以穿过墙壁移动到已发现相邻板块，且不会作为主动移动加成使用', () => {
        let core = createStartedFirstScenarioCore();
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'upper-landing',
            inventory: [{ id: 'lockpick-tool', name: '骨制钥匙', kind: 'item' }],
        };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['lockpick-tool'];
        core.activeRoomId = 'upper-landing';
        core.movesRemaining = 2;
        core.rooms = core.rooms.map((room) => {
            if (room.id === 'upper-landing') {
                return {
                    ...room,
                    doorways: room.doorways.filter((doorway) => doorway.connectsToRoomId !== 'upper-west'),
                };
            }
            if (room.id === 'upper-west') {
                return {
                    ...room,
                    doorways: room.doorways.filter((doorway) => doorway.connectsToRoomId !== 'upper-landing'),
                };
            }
            return room;
        });

        const normalMove = BetrayalDomain.validate(
            { core, sys: {} as never },
            createBetrayalCommand(BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'upper-west' }),
        );
        expect(normalMove.valid).toBe(false);
        expect(resolveUseEffect({ id: 'lockpick-tool', name: '骨制钥匙', kind: 'item' })).toBeNull();

        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.MOVE_TO_ROOM,
            '0',
            { roomId: 'upper-west', useSkeletonKey: true },
            100,
            createBetrayalScriptedRandom(2),
        );

        expect(core.currentExplorer.roomId).toBe('upper-west');
        expect(core.movesRemaining).toBe(1);
        expect(core.currentExplorer.inventory).toEqual([{ id: 'lockpick-tool', name: '骨制钥匙', kind: 'item' }]);
        expect(core.activityLog[0]?.text).toContain('使用骨制钥匙穿过墙壁');
    });

it('骨制钥匙穿墙投到空白会被埋葬，且不能用于发现新房间', () => {
        let core = createStartedFirstScenarioCore();
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'upper-landing',
            inventory: [{ id: 'lockpick-tool', name: '骨制钥匙', kind: 'item' }],
        };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['lockpick-tool'];
        core.activeRoomId = 'upper-landing';
        core.movesRemaining = 2;
        core.rooms = core.rooms.map((room) => {
            if (room.id === 'upper-landing') {
                return {
                    ...room,
                    doorways: room.doorways.filter((doorway) => doorway.connectsToRoomId !== 'upper-west'),
                };
            }
            if (room.id === 'upper-west') {
                return {
                    ...room,
                    doorways: room.doorways.filter((doorway) => doorway.connectsToRoomId !== 'upper-landing'),
                };
            }
            return room;
        });

        const undiscoveredMove = BetrayalDomain.validate(
            { core, sys: {} as never },
            createBetrayalCommand(BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', {
                roomId: 'upper-north',
                useSkeletonKey: true,
            }),
        );
        expect(undiscoveredMove.valid).toBe(false);

        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.MOVE_TO_ROOM,
            '0',
            { roomId: 'upper-west', useSkeletonKey: true },
            100,
            createBetrayalScriptedRandom(1),
        );

        expect(core.currentExplorer.roomId).toBe('upper-west');
        expect(core.movesRemaining).toBe(1);
        expect(core.currentExplorer.inventory).toEqual([]);
        expect(core.currentExplorerInventory).toEqual([]);
        expect(core.activityLog[0]?.text).toContain('骨制钥匙被埋葬');
    });

it('书本会让知识检定结果 +1，并影响调查杰克和研究法阵', () => {
        let learnCore = createFirstScenarioReadyToLearnAboutJackCore();
        learnCore.currentExplorer = {
            ...learnCore.currentExplorer,
            traits: {
                ...learnCore.currentExplorer.traits,
                knowledge: 4,
            },
            inventory: [
                { id: 'omen-book', name: '书本', kind: 'omen' },
            ],
        };
        learnCore.currentExplorerTraits = { ...learnCore.currentExplorer.traits };
        learnCore.currentExplorerInventory = [...learnCore.currentExplorer.inventory];

        learnCore = applyBetrayalCommand(
            learnCore,
            BETRAYAL_COMMANDS.LEARN_ABOUT_JACK,
            '0',
            {},
            100,
            createBetrayalScriptedRandom(2, 2, 2, 2),
        );

        expect(learnCore.scenarioRuntime.knowledgeOfJackPlayerIds).toContain('0');
        expect(learnCore.activityLog[0]?.text).toContain('查到了 Crimson Jack 的线索');

        let studyCore = createFirstScenarioReadyToStudyExorcismCore();
        studyCore.currentExplorer = {
            ...studyCore.currentExplorer,
            traits: {
                ...studyCore.currentExplorer.traits,
                knowledge: 4,
            },
            inventory: [
                { id: 'omen-book', name: '书本', kind: 'omen' },
            ],
        };
        studyCore.currentExplorerTraits = { ...studyCore.currentExplorer.traits };
        studyCore.currentExplorerInventory = [...studyCore.currentExplorer.inventory];
        const circleCountBefore = studyCore.scenarioRuntime.exorcismCircleRoomIds.length;

        studyCore = applyBetrayalCommand(
            studyCore,
            BETRAYAL_COMMANDS.STUDY_EXORCISM,
            '0',
            {},
            100,
            createBetrayalScriptedRandom(2, 2, 2, 2),
        );

        expect(studyCore.scenarioRuntime.exorcismCircleRoomIds.length).toBe(circleCountBefore + 1);
        expect(studyCore.activityLog[0]?.text).toContain('布置了一处驱魔法阵');
    });

it('书本每回合一次：失去 1 点神志，并让下一次非战斗检定可用知识替换', () => {
        let core = createCrimsonJackHauntCore();
        core.currentExplorer = {
            ...core.currentExplorer,
            traits: {
                ...core.currentExplorer.traits,
                knowledge: 5,
                sanity: 2,
            },
            inventory: [
                { id: 'omen-book', name: '书本', kind: 'omen' },
            ],
        };
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['omen-book'];

        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.USE_POSSESSION, '0', { cardId: 'omen-book' });
        expect(core.currentExplorer.traits.sanity).toBe(1);
        expect(core.usedCardIdsThisTurn).toContain('omen-book');
        expect(core.nextNonCombatTraitReplacement).toMatchObject({
            playerId: '0',
            sourceCardId: 'omen-book',
            replacementTrait: 'knowledge',
        });

        const secondUse = BetrayalDomain.validate(
            { core, sys: {} as never },
            createBetrayalCommand(BETRAYAL_COMMANDS.USE_POSSESSION, '0', { cardId: 'omen-book' }),
        );
        expect(secondUse.valid).toBe(false);

        core.scenarioRuntime.exorcismCircleRoomIds = ['upper-north', 'upper-west'];
        core.scenarioRuntime.jackSpiritReleased = true;
        core.scenarioRuntime.jackSpiritRoomId = core.currentExplorer.roomId;
        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.EXORCISE_JACK,
            '0',
            {},
            100,
            createBetrayalScriptedRandom(3, 3, 3, 3, 3, 3),
        );

        expect(core.phase).toBe('endgame');
        expect(core.nextNonCombatTraitReplacement).toBeNull();
    });

it('书本在神志临界时不能支付成本或写入非战斗替代状态', () => {
        const core = createFirstScenarioHauntCore();
        core.currentExplorer = {
            ...core.currentExplorer,
            traits: {
                ...core.currentExplorer.traits,
                knowledge: 5,
            },
            inventory: [
                { id: 'omen-book', name: '书本', kind: 'omen' },
            ],
        };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['omen-book'];
        setTestTraitTrack(core, '0', 'sanity', [1, 2, 3], 0, 1);

        const actionStatus = resolveBetrayalPossessionSpecialActionStatus(core, 'omen-book');
        expect(actionStatus).toMatchObject({
            active: true,
            canUse: false,
            usedThisTurn: false,
        });
        expect(actionStatus.reason).toContain('神志不足');

        const validation = BetrayalDomain.validate(
            { core, sys: {} as never },
            createBetrayalCommand(BETRAYAL_COMMANDS.USE_POSSESSION, '0', { cardId: 'omen-book' }),
        );
        expect(validation.valid).toBe(false);
        if (!validation.valid) {
            expect(validation.error).toContain('神志不足');
        }
        expect(() => applyBetrayalCommand(core, BETRAYAL_COMMANDS.USE_POSSESSION, '0', { cardId: 'omen-book' }))
            .toThrow(/神志不足/);
        expect(core.usedCardIdsThisTurn).not.toContain('omen-book');
        expect(core.nextNonCombatTraitReplacement).toBeNull();
        expect(core.currentExplorer.traitTracks.sanity.position).toBe(0);
    });

it('书本替换只作用于非战斗检定，不会让战斗对攻改用知识', () => {
        let core = createFirstScenarioHauntCore();
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'upper-landing' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'grand-staircase' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'basement-landing' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'basement-east' });
        core.currentExplorer = {
            ...core.currentExplorer,
            traits: {
                ...core.currentExplorer.traits,
                might: 1,
                knowledge: 6,
                sanity: 2,
            },
            inventory: [
                ...core.currentExplorer.inventory,
                { id: 'omen-book', name: '书本', kind: 'omen' },
            ],
        };
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = [...core.turnStartInventoryCardIds, 'omen-book'];

        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.USE_POSSESSION, '0', { cardId: 'omen-book' });
        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.HAUNT_ATTACK,
            '0',
            { target: 'traitor' },
            100,
            createBetrayalScriptedRandom(1, 1, 1, 1, 1, 1),
        );

        expect(core.scenarioRuntime.jackSpiritReleased).toBe(false);
        expect(core.nextNonCombatTraitReplacement).toMatchObject({
            playerId: '0',
            sourceCardId: 'omen-book',
        });
    });

it('头骨会让知识检定结果 +1，并影响调查杰克', () => {
        let core = createFirstScenarioReadyToLearnAboutJackCore();
        core.currentExplorer = {
            ...core.currentExplorer,
            traits: {
                ...core.currentExplorer.traits,
                knowledge: 4,
            },
            inventory: [
                { id: 'skull', name: '头骨', kind: 'omen' },
            ],
        };
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.currentExplorerInventory = [...core.currentExplorer.inventory];

        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.LEARN_ABOUT_JACK,
            '0',
            {},
            100,
            createBetrayalScriptedRandom(2, 2, 2, 2),
        );

        expect(core.scenarioRuntime.knowledgeOfJackPlayerIds).toContain('0');
        expect(core.activityLog[0]?.text).toContain('查到了 Crimson Jack 的线索');
    });

it('头骨在探索者将要死亡前投 3 骰，4-6 时不死亡并把所有属性调至濒死', () => {
        let core = createCrimsonJackHauntCore();
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'upper-landing' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'grand-staircase' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'hallway' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'ground-north' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, '0', {});
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '1', { roomId: 'hallway' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '1', { roomId: 'ground-north' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, '1', {});
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '2', { roomId: 'basement-landing' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '2', { roomId: 'grand-staircase' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '2', { roomId: 'hallway' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '2', { roomId: 'ground-north' });
        core.otherExplorers = core.otherExplorers.map((explorer) => (
            explorer.playerId === '0'
                ? { ...explorer, inventory: [{ id: 'skull', name: '头骨', kind: 'omen' }] }
                : explorer
        ));

        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.HAUNT_ATTACK,
            '2',
            { target: 'hero', targetPlayerId: '0' },
            100,
            createBetrayalScriptedRandom(3, 3, 3, 3, 3, 1, 1, 1, 1),
        );

        expect(core.pendingDamageAllocation).toMatchObject({
            playerId: '0',
            sourceTitle: '攻击',
            allowSkull: true,
        });
        expect(core.recentRoll?.kind).toBe('attackRoll');
        expect(core.scenarioRuntime.deadExplorerPlayerIds).not.toContain('0');

        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.RESOLVE_DAMAGE_ALLOCATION,
            '0',
            { traits: lethalTraitsForPendingDamage(core, 'might') },
            101,
            createBetrayalScriptedRandom(3, 3, 1),
        );

        const protectedHero = [core.currentExplorer, ...core.otherExplorers]
            .find((explorer) => explorer.playerId === '0')!;
        expect(core.scenarioRuntime.deadExplorerPlayerIds).not.toContain('0');
        expect(protectedHero.traits).toEqual(criticalTraitValues(core, '0'));
        expect(core.phase).toBe('haunt');
        expect(core.endgameResult).toBeNull();
        expect(core.activityLog[0]?.text).toContain('头骨投出 4，阻止死亡');
    });

it('头骨死亡前投 3 骰为 0-3 时仍正常死亡', () => {
        let core = createFirstScenarioHauntCore();
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'upper-landing' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'grand-staircase' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'hallway' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'ground-north' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, '0', {});
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '1', { roomId: 'hallway' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '1', { roomId: 'ground-north' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, '1', {});
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '2', { roomId: 'basement-landing' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '2', { roomId: 'grand-staircase' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '2', { roomId: 'hallway' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '2', { roomId: 'ground-north' });
        core.otherExplorers = core.otherExplorers.map((explorer) => (
            explorer.playerId === '0'
                ? { ...explorer, inventory: [{ id: 'skull', name: '头骨', kind: 'omen' }] }
                : explorer
        ));

        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.HAUNT_ATTACK,
            '2',
            { target: 'hero', targetPlayerId: '0' },
            100,
            createBetrayalScriptedRandom(3, 3, 3, 3, 1, 1, 1, 1),
        );

        expect(core.pendingDamageAllocation).toMatchObject({
            playerId: '0',
            sourceTitle: '攻击',
            allowSkull: true,
        });
        expect(core.scenarioRuntime.deadExplorerPlayerIds).not.toContain('0');

        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.RESOLVE_DAMAGE_ALLOCATION,
            '0',
            { traits: lethalTraitsForPendingDamage(core, 'might') },
            101,
            createBetrayalScriptedRandom(1, 1, 1),
        );

        expect(core.scenarioRuntime.deadExplorerPlayerIds).toContain('0');
    });

it('兔脚可以重掷头骨死亡保护的一颗骰子，并按新结果阻止死亡', () => {
        let core = createFirstScenarioHauntCore();
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'upper-landing' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'grand-staircase' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'hallway' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'ground-north' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, '0', {});
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '1', { roomId: 'hallway' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '1', { roomId: 'ground-north' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.END_TURN, '1', {});
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '2', { roomId: 'basement-landing' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '2', { roomId: 'grand-staircase' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '2', { roomId: 'hallway' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '2', { roomId: 'ground-north' });
        core.otherExplorers = core.otherExplorers.map((explorer) => (
            explorer.playerId === '0'
                ? {
                    ...explorer,
                    inventory: [
                        { id: 'skull', name: '头骨', kind: 'omen' },
                        { id: 'rope', name: '兔脚', kind: 'item' },
                    ],
                }
                : explorer
        ));

        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.HAUNT_ATTACK,
            '2',
            { target: 'hero', targetPlayerId: '0' },
            100,
            createBetrayalScriptedRandom(3, 3, 3, 3, 1, 1, 1, 1),
        );

        expect(core.pendingDamageAllocation).toMatchObject({
            playerId: '0',
            sourceTitle: '攻击',
            allowSkull: true,
        });
        expect(core.scenarioRuntime.deadExplorerPlayerIds).not.toContain('0');

        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.RESOLVE_DAMAGE_ALLOCATION,
            '0',
            { traits: lethalTraitsForPendingDamage(core, 'might') },
            101,
            createBetrayalScriptedRandom(1, 2, 2),
        );

        expect(core.scenarioRuntime.deadExplorerPlayerIds).toContain('0');
        expect(core.recentRoll?.kind).toBe('deathPrevention');
        expect(core.recentRoll?.playerId).toBe('0');
        expect(BetrayalDomain.validate(
            { core, sys: {} as never },
            createBetrayalCommand(BETRAYAL_COMMANDS.USE_RABBIT_FOOT, '0', { cardId: 'rope', dieIndex: 0 }),
        ).valid).toBe(true);

        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.USE_RABBIT_FOOT,
            '0',
            { cardId: 'rope', dieIndex: 0 },
            101,
            createBetrayalScriptedRandom(3),
        );

        const protectedHero = [core.currentExplorer, ...core.otherExplorers]
            .find((explorer) => explorer.playerId === '0')!;
        expect(core.scenarioRuntime.deadExplorerPlayerIds).not.toContain('0');
        expect(protectedHero.traits).toEqual(criticalTraitValues(core, '0'));
        expect(core.recentRoll?.latestLabel).toContain('阻止死亡');
        expect(core.usedCardIdsThisTurn).toContain('rope');
        expect(BetrayalDomain.validate(
            { core, sys: {} as never },
            createBetrayalCommand(BETRAYAL_COMMANDS.USE_RABBIT_FOOT, '0', { cardId: 'rope', dieIndex: 1 }),
        ).valid).toBe(false);
    });

it('头骨不能被主动使用成通用知识加成', () => {
        const core = createStartedFirstScenarioCore();
        core.currentExplorer.inventory = [
            { id: 'skull', name: '头骨', kind: 'omen' },
        ];
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['skull'];

        const validation = BetrayalDomain.validate(
            { core, sys: {} as never },
            createBetrayalCommand(BETRAYAL_COMMANDS.USE_POSSESSION, '0', { cardId: 'skull' }),
        );

        expect(validation.valid).toBe(false);
    });
});
