import { buildAiDecisionContext } from '../../../engine/ai';
import { resolveNextLocalAiAction } from '../../../engine/ai/localRunner';
import { createReplayAdapter } from '../../../engine/adapter';
import {
    createInitialSystemState,
    createSeededRandom,
    executePipeline,
} from '../../../engine/pipeline';
import type {
    MatchState,
    RandomFn,
} from '../../../engine/types';
import { resolveForceEndTurnForStalledAi } from '../../../engine/transport/onlineAiRecovery';
import { BETRAYAL_AI_ACTION_KINDS } from '../ai';
import {
    BetrayalDomain,
    betrayalAiRuntime,
    engineConfig,
    type BetrayalCore,
} from '../game';
import { BETRAYAL_COMMANDS } from '../commands';
import type { BetrayalCommand } from '../commandTypes';
import { BETRAYAL_MANIFEST } from '../manifest';
import { BETRAYAL_DISCOVERY_POOLS } from '../scenarioConfig';
import {
    BETRAYAL_AI_MINIMUM_VISIBLE_STEP_DELAY_MS,
    BETRAYAL_VISUAL_TRANSITION_DURATION_MS,
} from '../visualTiming';
import {
    applyBetrayalCommand,
    BETRAYAL_FIXED_RANDOM,
    createBetrayalScriptedRandom,
    createDustHauntCore as createDustAiCore,
    createFirstScenarioReadyToExorciseCore,
    createFirstScenarioReadyToLearnAboutJackCore,
    createFirstScenarioReadyToStudyExorcismCore,
    createFirstScenarioReadyToTraitorVictoryCore,
    createFirstScenarioHauntCore,
    createHelpingHandsHauntCore as createHelpingHandsAiCore,
    createHeroAttackTraitorReadyCore,
    createJackSpiritMovementRollReadyCore,
    createMagicCameraHauntCore as createMagicCameraAiCore,
    createMummyMonsterMoveReadyTutorialCore,
    createMummyReadyToBanishCore,
    createMummyTraitorVictoryReadyTutorialCore,
    createStartedFirstScenarioCore,
    createTradeReadyCore,
} from '../testing/firstScenarioTestUtils';

function stateOf(core: BetrayalCore, seed = 'betrayal-ai-test'): MatchState<BetrayalCore> {
    const adapter = createReplayAdapter(BetrayalDomain, seed);
    return {
        ...adapter.setup(core.playerIds),
        core,
    };
}

function buildContext(state: MatchState<BetrayalCore>, playerId: string) {
    return buildAiDecisionContext({
        gameId: 'betrayal',
        matchId: 'betrayal-ai-test',
        playerId,
        visibleState: state,
        rulesVersion: null,
        decisionBudgetMs: 250,
        source: 'local',
        seatController: { type: 'local-ai', minimumActionDelayMs: 0 },
    });
}

function buildActions(state: MatchState<BetrayalCore>, playerId: string) {
    return betrayalAiRuntime.buildLegalActions({ playerId, state });
}

function activateTestExplorer(core: BetrayalCore, playerId: string): void {
    const explorers = [core.currentExplorer, ...core.otherExplorers].map((explorer) => ({
        ...explorer,
        traits: { ...explorer.traits },
        inventory: explorer.inventory.map((card) => ({ ...card })),
    }));
    const active = explorers.find((explorer) => explorer.playerId === playerId);
    if (!active) {
        throw new Error(`山屋 AI 测试夹具不能切到缺失玩家 ${playerId}`);
    }
    core.currentPlayer = playerId;
    core.currentExplorer = active;
    core.otherExplorers = explorers.filter((explorer) => explorer.playerId !== playerId);
    core.activeRoomId = active.roomId;
    core.currentExplorerTraits = { ...active.traits };
    core.currentExplorerInventory = active.inventory.map((card) => ({ ...card }));
    core.turnStartInventoryCardIds = active.inventory.map((card) => card.id);
    core.usedCardIdsThisTurn = [];
}

function setExplorerRoom(core: BetrayalCore, playerId: string, roomId: string): void {
    if (core.currentExplorer.playerId === playerId) {
        core.currentExplorer.roomId = roomId;
        core.activeRoomId = roomId;
        return;
    }
    core.otherExplorers = core.otherExplorers.map((explorer) => (
        explorer.playerId === playerId ? { ...explorer, roomId } : explorer
    ));
}

test('Betrayal 本地 AI 的可见动作等待覆盖对象过渡动画', () => {
    expect(betrayalAiRuntime.defaultMinimumActionDelayMs).toBe(
        BETRAYAL_AI_MINIMUM_VISIBLE_STEP_DELAY_MS,
    );
    expect(BETRAYAL_AI_MINIMUM_VISIBLE_STEP_DELAY_MS).toBeGreaterThanOrEqual(
        BETRAYAL_VISUAL_TRANSITION_DURATION_MS,
    );
    expect(betrayalAiRuntime.localVisibleStepDelayConfig?.actionKinds).toEqual(
        expect.arrayContaining([
            BETRAYAL_AI_ACTION_KINDS.MOVE_TO_ROOM,
            BETRAYAL_AI_ACTION_KINDS.ACKNOWLEDGE_CARD_RESOLUTION,
        ]),
    );
});

function startHelpingHandsMonsterTurn(core: BetrayalCore): BetrayalCore {
    activateTestExplorer(core, '0');
    return applyBetrayalCommand(
        core,
        BETRAYAL_COMMANDS.END_TURN,
        '0',
        {},
        100,
        createBetrayalScriptedRandom(1, 2, 3),
    );
}

function applyAiResolution(
    state: MatchState<BetrayalCore>,
    resolution: NonNullable<Awaited<ReturnType<typeof resolveNextLocalAiAction>>>,
    random: RandomFn = createBetrayalScriptedRandom(),
): MatchState<BetrayalCore> {
    return resolution.action.commands.reduce((nextState, command) => executePipeline(
        {
            domain: engineConfig.domain,
            systems: engineConfig.systems,
        },
        nextState,
        {
            type: command.type,
            playerId: resolution.playerId,
            payload: command.payload,
            timestamp: 100,
        } as BetrayalCommand,
        random,
        nextState.core.playerIds,
    ).state, state);
}

describe('小黑屋本地 AI', () => {
    test('manifest 开启本地 AI，默认把其余座位设为 AI，远程 AI 保持关闭', () => {
        expect(BETRAYAL_MANIFEST.ai).toEqual({
            capture: true,
            localAi: true,
            remoteAi: false,
            defaultLocalAiSeats: 'all-opponents',
        });
    });

    test('选角阶段只生成未被占用的探索者，并在选中后确认', () => {
        const adapter = createReplayAdapter(BetrayalDomain, 'betrayal-ai-character-select');
        let state = adapter.setup(['0', '1', '2']);
        state = adapter.execute(state, {
            type: BETRAYAL_COMMANDS.SELECT_EXPLORER,
            playerId: '0',
            payload: { explorerId: 'jaden-jones' },
            timestamp: 1,
        }).state;

        const selectActions = buildActions(state, '1');
        expect(selectActions.length).toBeGreaterThan(0);
        expect(selectActions.every((action) => action.kind === BETRAYAL_AI_ACTION_KINDS.SELECT_EXPLORER)).toBe(true);
        expect(selectActions.some((action) => action.metadata?.explorerId === 'jaden-jones')).toBe(false);

        const selectedAction = selectActions[0]!;
        state = adapter.execute(state, {
            type: selectedAction.commands[0]!.type,
            playerId: '1',
            payload: selectedAction.commands[0]!.payload,
            timestamp: 2,
        }).state;

        expect(buildActions(state, '1'))
            .toHaveLength(1);
        expect(buildActions(state, '1')[0]?.kind)
            .toBe(BETRAYAL_AI_ACTION_KINDS.CONFIRM_EXPLORER);
    });

    test('非当前 AI 不会生成运行时动作', () => {
        const state = stateOf(createStartedFirstScenarioCore());

        expect(buildActions(state, '1')).toEqual([]);
    });

    test('翻牌确认缺少非当前 AI 座位时，watchdog 应代该座位确认而不是推进当前 AI 阶段', () => {
        const core = createStartedFirstScenarioCore();
        core.pendingCardResolutionQueue = [{
            id: 'ai-card-resolution',
            playerId: '2',
            requiredPlayerIds: ['0', '1', '2'],
            acknowledgedPlayerIds: ['1', '2'],
            deckKind: 'item',
            cardId: 'lucky-coin-2',
            cardName: '幸运硬币',
            discoveryTitle: '幸运硬币',
            stepKind: 'drawn-card',
            text: '已加入持有区：幸运硬币（按卡面规则持有）',
            index: 1,
            total: 1,
        }];
        const state = stateOf(core, 'betrayal-ai-pending-card-recovery');
        state.sys.phase = 'preHaunt';

        const candidate = resolveForceEndTurnForStalledAi({
            sharedState: state,
            seatControllers: {
                '0': { type: 'local-ai' },
                '1': { type: 'local-ai' },
                '2': { type: 'local-ai' },
            },
            seatStates: {},
            engineConfig,
            gameId: 'betrayal',
        });

        expect(candidate?.reason).toBe('seat-legal-only');
        expect(candidate?.playerId).toBe('0');
        expect(candidate?.resolution.action.commands).toEqual([{
            type: BETRAYAL_COMMANDS.ACKNOWLEDGE_CARD_RESOLUTION,
            payload: { resolutionId: 'ai-card-resolution' },
        }]);
    });

    test('翻牌确认缺少真人座位时，watchdog 不应替当前 AI 强推阶段', () => {
        const core = createStartedFirstScenarioCore();
        core.pendingCardResolutionQueue = [{
            id: 'human-card-resolution',
            playerId: '0',
            requiredPlayerIds: ['0', '1', '2'],
            acknowledgedPlayerIds: ['1', '2'],
            deckKind: 'item',
            cardId: 'lucky-coin-2',
            cardName: '幸运硬币',
            discoveryTitle: '幸运硬币',
            stepKind: 'drawn-card',
            text: '已加入持有区：幸运硬币（按卡面规则持有）',
            index: 1,
            total: 1,
        }];
        const state = stateOf(core, 'betrayal-human-card-recovery');
        state.sys.phase = 'preHaunt';

        const candidate = resolveForceEndTurnForStalledAi({
            sharedState: state,
            seatControllers: {
                '0': { type: 'human' },
                '1': { type: 'local-ai' },
                '2': { type: 'local-ai' },
            },
            seatStates: {},
            engineConfig,
            gameId: 'betrayal',
        });

        expect(candidate).toBeNull();
    });

    test('事件骰确认缺少非当前 AI 座位时，watchdog 应代该座位确认而不是推进当前 AI 阶段', () => {
        const core = createStartedFirstScenarioCore(['0', '1', '2']);
        core.pendingEventRollResolution = {
            rollId: 'ai-event-roll-recovery',
            playerId: '0',
            sourceTitle: '墙中低语',
            requiredPlayerIds: ['0', '1', '2'],
            acknowledgedPlayerIds: ['1', '2'],
            effect: { mode: 'trait', trait: 'knowledge', amount: 1, recommendedAction: 'explore' },
        };
        const state = stateOf(core, 'betrayal-ai-event-roll-recovery');
        state.sys.phase = 'preHaunt';

        const candidate = resolveForceEndTurnForStalledAi({
            sharedState: state,
            seatControllers: {
                '0': { type: 'local-ai' },
                '1': { type: 'local-ai' },
                '2': { type: 'local-ai' },
            },
            seatStates: {},
            engineConfig,
            gameId: 'betrayal',
        });

        expect(candidate?.reason).toBe('seat-legal-only');
        expect(candidate?.playerId).toBe('0');
        expect(candidate?.resolution.action.commands).toEqual([{
            type: BETRAYAL_COMMANDS.FINALIZE_EVENT_ROLL,
            payload: { rollId: 'ai-event-roll-recovery' },
        }]);
    });

    test('事件待投骰缺少非当前 AI 座位时，watchdog 应代触发者投骰而不是推进当前 AI 阶段', () => {
        const core = createStartedFirstScenarioCore(['0', '1', '2']);
        activateTestExplorer(core, '1');
        core.pendingEventRollStart = {
            playerId: '2',
            roomId: 'frontier-ground-east-south',
            sourceTitle: '着火的人',
        };
        const state = stateOf(core, 'betrayal-ai-event-roll-start-recovery');
        state.sys.phase = 'preHaunt';

        const currentPlayerActions = buildActions(state, '1');
        expect(currentPlayerActions.map((action) => action.kind)).not.toContain(BETRAYAL_AI_ACTION_KINDS.EXPLORE_ROOM);

        const candidate = resolveForceEndTurnForStalledAi({
            sharedState: state,
            seatControllers: {
                '0': { type: 'human' },
                '1': { type: 'local-ai' },
                '2': { type: 'local-ai' },
            },
            seatStates: {},
            engineConfig,
            gameId: 'betrayal',
        });

        expect(candidate?.reason).toBe('seat-legal-only');
        expect(candidate?.playerId).toBe('2');
        expect(candidate?.resolution.action.commands).toEqual([{
            type: BETRAYAL_COMMANDS.ROLL_EVENT,
            payload: { sourceTitle: '着火的人' },
        }]);
    });

    test('AI 代投带房间效果的无线电广播时不会在同轮裸结算伤害骰', () => {
        const core = createStartedFirstScenarioCore(['0', '1', '2', '3']);
        const radioEvent = BETRAYAL_DISCOVERY_POOLS.events.find((event) => event.name === '无线电广播');
        if (!radioEvent) {
            throw new Error('山屋测试夹具缺少事件牌：无线电广播');
        }
        activateTestExplorer(core, '2');
        core.eventOrder = [radioEvent];
        core.deckCounts.event = core.eventOrder.length;
        core.pendingEventRollStart = {
            playerId: '2',
            roomId: 'frontier-ground-east-south',
            sourceTitle: '无线电广播',
            eventDescription: radioEvent.description,
        };
        core.latestDiscovery = {
            kind: 'event',
            title: '无线电广播',
            summary: '事件牌已公开，等待投掷',
            detail: radioEvent.description,
            tone: 'accent',
            resolutionSteps: [{
                id: 'room-effect-gainSanity1',
                kind: 'room-effect',
                text: '房间效果：礼拜堂，神志 +1',
            }],
        };
        core.latestDiscoveryOwnerPlayerId = '2';
        core.turnEndedByDiscovery = true;

        const result = executePipeline(
            {
                domain: engineConfig.domain,
                systems: engineConfig.systems,
            },
            stateOf(core, 'betrayal-ai-radio-event-roll-start'),
            {
                type: BETRAYAL_COMMANDS.ROLL_EVENT,
                playerId: '2',
                payload: { sourceTitle: '无线电广播' },
                timestamp: 200,
            } as BetrayalCommand,
            createBetrayalScriptedRandom(0, 0),
            core.playerIds,
        );

        expect(result.success).toBe(true);
        expect(result.state.core.pendingEventRollStart).toBeNull();
        expect(result.state.core.recentRoll).toMatchObject({
            kind: 'eventDiceRoll',
            playerId: '2',
            sourceTitle: '无线电广播',
            dice: [0, 0],
            latestLabel: '受到一颗骰子的精神伤害',
        });
        expect(result.state.core.pendingEventRollResolution).toMatchObject({
            playerId: '2',
            sourceTitle: '无线电广播',
            effect: {
                mode: 'rolledDamage',
                dice: 1,
                damageKind: 'mental',
            },
        });
        expect((result.state.core.pendingEventRollResolution?.effect as { rolls?: number[] } | undefined)?.rolls)
            .toBeUndefined();
        expect(result.state.core.pendingDamageAllocation).toBeNull();

        const finalized = executePipeline(
            {
                domain: engineConfig.domain,
                systems: engineConfig.systems,
            },
            result.state,
            {
                type: BETRAYAL_COMMANDS.FINALIZE_EVENT_ROLL,
                playerId: '2',
                payload: { rollId: result.state.core.pendingEventRollResolution?.rollId },
                timestamp: 201,
            } as BetrayalCommand,
            createBetrayalScriptedRandom(3),
            core.playerIds,
        );

        expect(finalized.success).toBe(true);
        expect(finalized.state.core.pendingEventRollResolution).toBeNull();
        expect(finalized.state.core.recentRoll).toMatchObject({
            kind: 'eventRolledDamage',
            playerId: '2',
            sourceTitle: '无线电广播',
            dice: [2],
            latestLabel: '造成 2 点精神伤害',
        });
        expect(finalized.state.core.pendingDamageAllocation).toMatchObject({
            playerId: '2',
            sourceTitle: '无线电广播',
            damageKind: 'mental',
            amount: 2,
        });
    });

    test('事件待投骰缺少真人座位时，watchdog 不应替当前 AI 探索或强推阶段', () => {
        const core = createStartedFirstScenarioCore(['0', '1', '2']);
        activateTestExplorer(core, '1');
        core.pendingEventRollStart = {
            playerId: '2',
            roomId: 'frontier-ground-east-south',
            sourceTitle: '着火的人',
        };
        const state = stateOf(core, 'betrayal-human-event-roll-start-recovery');
        state.sys.phase = 'preHaunt';

        const candidate = resolveForceEndTurnForStalledAi({
            sharedState: state,
            seatControllers: {
                '0': { type: 'human' },
                '1': { type: 'local-ai' },
                '2': { type: 'human' },
            },
            seatStates: {},
            engineConfig,
            gameId: 'betrayal',
        });

        expect(candidate).toBeNull();
    });

    test('事件骰确认缺少真人座位时，watchdog 不应替当前 AI 强推阶段', () => {
        const core = createStartedFirstScenarioCore(['0', '1', '2']);
        core.pendingEventRollResolution = {
            rollId: 'human-event-roll-recovery',
            playerId: '0',
            sourceTitle: '墙中低语',
            requiredPlayerIds: ['0', '1', '2'],
            acknowledgedPlayerIds: ['1', '2'],
            effect: { mode: 'trait', trait: 'knowledge', amount: 1, recommendedAction: 'explore' },
        };
        const state = stateOf(core, 'betrayal-human-event-roll-recovery');
        state.sys.phase = 'preHaunt';

        const candidate = resolveForceEndTurnForStalledAi({
            sharedState: state,
            seatControllers: {
                '0': { type: 'human' },
                '1': { type: 'local-ai' },
                '2': { type: 'local-ai' },
            },
            seatStates: {},
            engineConfig,
            gameId: 'betrayal',
        });

        expect(candidate).toBeNull();
    });

    test('AI 会先确认翻牌结算，避免在线 watchdog 裸过阶段被拒', async () => {
        let core = createStartedFirstScenarioCore();
        core.roomDiscoveryOrderByFloor.ground = [
            BETRAYAL_DISCOVERY_POOLS.roomDiscoveryByFloor.ground.find((room) => room.visualId === 'chapel')!,
        ];

        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.MOVE_TO_ROOM, '0', { roomId: 'hallway' });
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.EXPLORE_ROOM, '0', { roomId: 'ground-north' });
        expect(core.pendingCardResolutionQueue.length).toBeGreaterThan(0);

        let state = stateOf(core, 'betrayal-ai-card-resolution-ack');
        expect(BetrayalDomain.validate(
            state,
            {
                type: BETRAYAL_COMMANDS.END_TURN,
                playerId: '0',
                payload: {},
                timestamp: 1,
            } as BetrayalCommand,
        )).toMatchObject({
            valid: false,
            error: '请先确认当前翻牌结算。',
        });

        const seatControllers = {
            '0': { type: 'local-ai' as const, minimumActionDelayMs: 0 },
            '1': { type: 'local-ai' as const, minimumActionDelayMs: 0 },
            '2': { type: 'local-ai' as const, minimumActionDelayMs: 0 },
        };

        for (let step = 0; step < 6 && state.core.pendingCardResolutionQueue.length > 0; step += 1) {
            const resolution = await resolveNextLocalAiAction({
                engineConfig,
                state,
                matchId: `betrayal-ai-card-resolution-ack-${step}`,
                seatControllers,
            });

            expect(resolution?.action.kind).toBe(BETRAYAL_AI_ACTION_KINDS.ACKNOWLEDGE_CARD_RESOLUTION);
            expect(resolution?.action.commands[0]?.type).toBe(BETRAYAL_COMMANDS.ACKNOWLEDGE_CARD_RESOLUTION);
            state = applyAiResolution(state, resolution!);
        }

        expect(state.core.pendingCardResolutionQueue).toEqual([]);
        expect(BetrayalDomain.validate(
            state,
            {
                type: BETRAYAL_COMMANDS.END_TURN,
                playerId: '0',
                payload: {},
                timestamp: 1,
            } as BetrayalCommand,
        ).valid).toBe(true);
    });

    test('AI 会按投票制确认事件投骰，且全员确认前不会结算事件效果', () => {
        let core = createStartedFirstScenarioCore(['0', '1', '2']);
        core.currentExplorer = {
            ...core.currentExplorer,
            traits: {
                ...core.currentExplorer.traits,
                knowledge: 3,
            },
        };
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        core.latestDiscovery = {
            kind: 'event',
            title: '墙中低语',
            summary: '等待投票确认',
            detail: '知识检定：等待全员确认最终结果',
            tone: 'accent',
        };
        core.latestDiscoveryOwnerPlayerId = '0';
        core.pendingEventRollResolution = {
            rollId: 'ai-event-roll',
            playerId: '0',
            sourceTitle: '墙中低语',
            requiredPlayerIds: [...core.playerIds],
            acknowledgedPlayerIds: [],
            effect: { mode: 'trait', trait: 'knowledge', amount: 1, recommendedAction: 'explore' },
        };

        let state = stateOf(core, 'betrayal-ai-event-roll-ack');
        const playerOneActions = buildActions(state, '1');
        expect(playerOneActions).toHaveLength(1);
        expect(playerOneActions[0]?.kind).toBe(BETRAYAL_AI_ACTION_KINDS.ACKNOWLEDGE_EVENT_ROLL);
        expect(playerOneActions[0]?.commands[0]).toEqual({
            type: BETRAYAL_COMMANDS.FINALIZE_EVENT_ROLL,
            payload: { rollId: 'ai-event-roll' },
        });

        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.FINALIZE_EVENT_ROLL,
            '1',
            { rollId: 'ai-event-roll' },
            100,
            BETRAYAL_FIXED_RANDOM,
            false,
        );
        expect(core.pendingEventRollResolution?.acknowledgedPlayerIds).toEqual(['1']);
        expect(core.currentExplorer.traits.knowledge).toBe(3);
        state = stateOf(core, 'betrayal-ai-event-roll-ack-after-one');
        expect(buildActions(state, '1')).toEqual([]);
        expect(buildActions(state, '2')[0]?.kind).toBe(BETRAYAL_AI_ACTION_KINDS.ACKNOWLEDGE_EVENT_ROLL);

        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.FINALIZE_EVENT_ROLL,
            '2',
            { rollId: 'ai-event-roll' },
            101,
            BETRAYAL_FIXED_RANDOM,
            false,
        );
        expect(core.pendingEventRollResolution).toBeTruthy();
        expect(core.currentExplorer.traits.knowledge).toBe(3);

        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.FINALIZE_EVENT_ROLL,
            '0',
            { rollId: 'ai-event-roll' },
            102,
            BETRAYAL_FIXED_RANDOM,
            false,
        );
        expect(core.pendingEventRollResolution).toBeNull();
        expect(core.currentExplorer.traits.knowledge).toBe(4);
    });

    test('待分配伤害时必须生成并执行伤害分配动作，不能把阶段推进当成唯一动作', async () => {
        const core = createFirstScenarioHauntCore();
        const target = core.currentExplorer;
        core.currentPlayer = target.playerId;
        core.activePlayerId = target.playerId;
        core.pendingDamageAllocation = {
            id: 'ai-pending-damage',
            playerId: target.playerId,
            sourceTitle: '攻击',
            damageKind: 'physical',
            amount: 2,
            originalAmount: 2,
            allowedTraits: ['might', 'speed'],
            allowSkull: true,
            traitsBeforeDamage: { ...target.traits },
        };

        const state = stateOf(core, 'betrayal-ai-pending-damage');
        const actions = buildActions(state, target.playerId);

        expect(actions.some((action) => (
            action.kind === 'resolve-damage-allocation'
            && action.commands[0]?.type === BETRAYAL_COMMANDS.RESOLVE_DAMAGE_ALLOCATION
        ))).toBe(true);

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'betrayal-ai-pending-damage-execution',
            seatControllers: {
                [target.playerId]: { type: 'local-ai', minimumActionDelayMs: 0 },
            },
        });

        expect(resolution?.action.kind).toBe(BETRAYAL_AI_ACTION_KINDS.RESOLVE_DAMAGE_ALLOCATION);
        expect(resolution?.action.commands[0]?.type).toBe(BETRAYAL_COMMANDS.RESOLVE_DAMAGE_ALLOCATION);

        const nextState = applyAiResolution(state, resolution!);
        expect(nextState.core.pendingDamageAllocation).toBeNull();
    });

    test('待处理事件选择只生成领域校验通过的动作', () => {
        const core = createStartedFirstScenarioCore();
        core.pendingEventChoice = {
            id: 'ai-choice',
            playerId: '0',
            sourceTitle: '选择属性',
            effect: {
                mode: 'chooseTraitRoll',
                prompt: '选择一个属性',
                allowedTraits: ['knowledge', 'sanity'],
                branches: [{
                    min: 0,
                    label: '完成',
                    effect: { mode: 'none', recommendedAction: 'endTurn' },
                }],
                recommendedAction: 'endTurn',
            },
        };
        const state = stateOf(core);
        const actions = buildActions(state, '0');

        expect(actions.map((action) => action.metadata?.trait)).toEqual(['knowledge', 'sanity']);
        for (const action of actions) {
            const command = action.commands[0]!;
            expect(BetrayalDomain.validate(state, {
                type: command.type,
                playerId: '0',
                payload: command.payload,
                timestamp: 1,
            } as never).valid).toBe(true);
        }
    });

    test('英雄 AI 在图书馆优先调查杰克', () => {
        const state = stateOf(createFirstScenarioReadyToLearnAboutJackCore());
        const actions = buildActions(state, '0');

        expect(actions.some((action) => action.kind === BETRAYAL_AI_ACTION_KINDS.LEARN_ABOUT_JACK)).toBe(true);
        expect(betrayalAiRuntime.localPolicies?.baseline.decide(buildContext(state, '0'))?.actionId)
            .toBe(BETRAYAL_AI_ACTION_KINDS.LEARN_ABOUT_JACK);
    });

    test('英雄 AI 在事件房间优先研究驱魔法阵', () => {
        const state = stateOf(createFirstScenarioReadyToStudyExorcismCore());
        const actions = buildActions(state, '0');

        expect(actions.some((action) => action.kind === BETRAYAL_AI_ACTION_KINDS.STUDY_EXORCISM)).toBe(true);
        expect(betrayalAiRuntime.localPolicies?.baseline.decide(buildContext(state, '0'))?.actionId)
            .toBe(BETRAYAL_AI_ACTION_KINDS.STUDY_EXORCISM);
    });

    test('英雄 AI 在两处法阵完成后会驱魔并进入英雄终局', async () => {
        const state = stateOf(createFirstScenarioReadyToExorciseCore());
        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'betrayal-ai-exorcise-finish',
            seatControllers: {
                '0': { type: 'local-ai', minimumActionDelayMs: 0 },
                '1': { type: 'human' },
                '2': { type: 'human' },
            },
        });

        expect(resolution?.action.kind).toBe(BETRAYAL_AI_ACTION_KINDS.EXORCISE_JACK);
        expect(resolution).not.toBeNull();
        if (!resolution) return;

        const nextState = applyAiResolution(
            state,
            resolution,
            createBetrayalScriptedRandom(3, 3, 3, 3, 3, 3),
        );
        expect(nextState.core.phase).toBe('endgame');
        expect(nextState.core.endgameResult?.outcome).toBe('survivors');
    });

    test('魔法相机叛徒 AI 会优先拍摄仍有本质的英雄', () => {
        const core = createMagicCameraAiCore('1');
        activateTestExplorer(core, '1');
        core.currentExplorer.traits = {
            ...core.currentExplorer.traits,
            might: 1,
            speed: 5,
            knowledge: 5,
            sanity: 5,
        };
        core.currentExplorerTraits = { ...core.currentExplorer.traits };
        setExplorerRoom(core, '2', core.currentExplorer.roomId);

        const state = stateOf(core, 'betrayal-ai-magic-camera-photo');
        const photoActions = buildActions(state, '1')
            .filter((action) => action.kind === BETRAYAL_AI_ACTION_KINDS.TAKE_PHOTO);
        const preferredPhoto = photoActions.find((action) => (
            (action.commands[0]?.payload as { targetPlayerId?: string; trait?: string }).targetPlayerId === '2'
            && (action.commands[0]?.payload as { targetPlayerId?: string; trait?: string }).trait === 'might'
        ));

        expect(photoActions.length).toBeGreaterThan(0);
        expect(preferredPhoto).toBeDefined();
        expect(betrayalAiRuntime.localPolicies?.baseline.decide(buildContext(state, '1'))?.actionId)
            .toBe(preferredPhoto?.actionId);
    });

    test('魔法相机叛徒 AI 在没有可拍本质时会让幻影摄影师攻击', () => {
        const core = createMagicCameraAiCore('1');
        activateTestExplorer(core, '1');
        core.scenarioRuntime.magicCamera!.heroEssencePlayerIds = [];
        const monsterId = core.scenarioRuntime.magicCamera!.phantomPhotographerIds[0]!;
        const hero = core.otherExplorers.find((explorer) => explorer.playerId === '2')!;
        core.monsters = core.monsters.map((monster) => (
            monster.id === monsterId
                ? { ...monster, roomId: hero.roomId }
                : monster
        ));

        const state = stateOf(core, 'betrayal-ai-magic-camera-photographer');
        const photographerActions = buildActions(state, '1')
            .filter((action) => action.kind === BETRAYAL_AI_ACTION_KINDS.PHANTOM_PHOTOGRAPHER_ATTACK);

        expect(photographerActions.some((action) => (
            (action.commands[0]?.payload as { monsterId?: string; targetPlayerId?: string }).monsterId === monsterId
            && (action.commands[0]?.payload as { monsterId?: string; targetPlayerId?: string }).targetPlayerId === '2'
        ))).toBe(true);
        const preferredPhotographerAttack = photographerActions
            .toSorted((left, right) => (
                (right.metadata?.strategicScore ?? 0) - (left.metadata?.strategicScore ?? 0)
            ))[0];
        expect(betrayalAiRuntime.localPolicies?.baseline.decide(buildContext(state, '1'))?.actionId)
            .toBe(preferredPhotographerAttack?.actionId);
    });

    test('魔法相机英雄 AI 与叛徒同房时优先砸毁相机', () => {
        const core = createMagicCameraAiCore('1');
        activateTestExplorer(core, '2');
        setExplorerRoom(core, '1', core.currentExplorer.roomId);

        const state = stateOf(core, 'betrayal-ai-magic-camera-smash');
        const smashAction = buildActions(state, '2')
            .find((action) => action.kind === BETRAYAL_AI_ACTION_KINDS.SMASH_MAGIC_CAMERA);

        expect(smashAction).toBeDefined();
        expect(betrayalAiRuntime.localPolicies?.baseline.decide(buildContext(state, '2'))?.actionId)
            .toBe(smashAction?.actionId);
    });

    test('魔法相机英雄 AI 与幻影摄影师同房时会优先攻击摄影师', () => {
        const core = createMagicCameraAiCore('1');
        activateTestExplorer(core, '2');
        setExplorerRoom(core, '2', 'ground-north');
        setExplorerRoom(core, '1', 'entrance-hall');
        const monsterId = core.scenarioRuntime.magicCamera!.phantomPhotographerIds[0]!;
        core.monsters = core.monsters.map((monster) => (
            monster.id === monsterId
                ? { ...monster, roomId: core.currentExplorer.roomId }
                : monster
        ));

        const state = stateOf(core, 'betrayal-ai-magic-camera-attack-photographer');
        const photographerAttack = buildActions(state, '2')
            .find((action) => action.kind === BETRAYAL_AI_ACTION_KINDS.ATTACK_PHANTOM_PHOTOGRAPHER);

        expect(photographerAttack).toBeDefined();
        expect(photographerAttack?.commands[0]?.payload).toMatchObject({
            target: 'phantom-photographer',
            targetMonsterId: monsterId,
        });
        expect(betrayalAiRuntime.localPolicies?.baseline.decide(buildContext(state, '2'))?.actionId)
            .toBe(photographerAttack?.actionId);
    });

    test('灰尘 AI 在恶兆房间会寻找解药', () => {
        const core = createDustAiCore();
        activateTestExplorer(core, '1');
        setExplorerRoom(core, '1', 'hallway');
        const hallway = core.rooms.find((room) => room.id === 'hallway')!;
        hallway.discoveryReward = 'omen';
        core.scenarioRuntime.dust!.researchRoomIds = [];

        const state = stateOf(core, 'betrayal-ai-dust-search');
        const searchAction = buildActions(state, '1')
            .find((action) => action.kind === BETRAYAL_AI_ACTION_KINDS.SEARCH_FOR_CURE);

        expect(searchAction?.commands[0]?.payload).toMatchObject({
            trait: expect.stringMatching(/knowledge|sanity/),
        });
        const decision = betrayalAiRuntime.localPolicies?.baseline.decide(buildContext(state, '1'));
        expect(buildActions(state, '1').find((action) => action.actionId === decision?.actionId)?.kind)
            .toBe(BETRAYAL_AI_ACTION_KINDS.SEARCH_FOR_CURE);
    });

    test('灰尘 AI 在研究标记房间会尝试治愈灰尘', () => {
        const core = createDustAiCore();
        activateTestExplorer(core, '1');
        setExplorerRoom(core, '1', 'hallway');
        const hallway = core.rooms.find((room) => room.id === 'hallway')!;
        hallway.discoveryReward = 'event';
        core.scenarioRuntime.dust!.researchRoomIds = ['hallway'];

        const state = stateOf(core, 'betrayal-ai-dust-cure');
        const cureAction = buildActions(state, '1')
            .find((action) => action.kind === BETRAYAL_AI_ACTION_KINDS.CURE_THE_DUST);

        expect(cureAction?.commands[0]?.payload).toMatchObject({
            trait: expect.stringMatching(/might|speed|knowledge|sanity/),
        });
        const decision = betrayalAiRuntime.localPolicies?.baseline.decide(buildContext(state, '1'));
        expect(buildActions(state, '1').find((action) => action.actionId === decision?.actionId)?.kind)
            .toBe(BETRAYAL_AI_ACTION_KINDS.CURE_THE_DUST);
    });

    test('灰尘 AI 会请求同房探索者交换疾病标记', () => {
        const core = createDustAiCore();
        activateTestExplorer(core, '1');
        setExplorerRoom(core, '1', 'hallway');
        setExplorerRoom(core, '2', 'hallway');
        const hallway = core.rooms.find((room) => room.id === 'hallway')!;
        hallway.discoveryReward = 'event';
        core.scenarioRuntime.dust!.researchRoomIds = [];

        const state = stateOf(core, 'betrayal-ai-dust-exchange');
        const exchangeAction = buildActions(state, '1')
            .find((action) => action.kind === BETRAYAL_AI_ACTION_KINDS.REQUEST_SICKNESS_EXCHANGE);

        expect(exchangeAction?.commands[0]?.payload).toMatchObject({
            targetPlayerId: '2',
        });
    });

    test('灰尘 AI 会同意别人发起的疾病标记交换', () => {
        const core = createDustAiCore();
        core.scenarioRuntime.dust!.pendingSicknessExchange = {
            requesterPlayerId: '1',
            targetPlayerId: '2',
        };

        const state = stateOf(core, 'betrayal-ai-dust-resolve-exchange');
        const actions = buildActions(state, '2');

        expect(actions).toHaveLength(1);
        expect(actions[0]?.kind).toBe(BETRAYAL_AI_ACTION_KINDS.RESOLVE_SICKNESS_EXCHANGE);
        expect(actions[0]?.commands[0]?.payload).toEqual({ accept: true });
    });

    test('木乃伊英雄 AI 会优先执行驱逐木乃伊目标动作', () => {
        const state = stateOf(createMummyReadyToBanishCore(), 'betrayal-ai-mummy-banish');
        const actions = buildActions(state, '0');
        const banishAction = actions.find((action) => action.kind === BETRAYAL_AI_ACTION_KINDS.BANISH_MUMMY);

        expect(state.core.scenarioRuntime.hauntScenarioCardId).toBe('mummy-rampage');
        expect(banishAction?.commands[0]?.type).toBe(BETRAYAL_COMMANDS.BANISH_MUMMY);
        expect(actions.some((action) => action.kind === BETRAYAL_AI_ACTION_KINDS.LEARN_ABOUT_JACK)).toBe(false);
        expect(betrayalAiRuntime.localPolicies?.baseline.decide(buildContext(state, '0'))?.actionId)
            .toBe(banishAction?.actionId);
    });

    test('木乃伊叛徒 AI 会枚举交女孩和交婚礼预兆动作', () => {
        const core = createMummyTraitorVictoryReadyTutorialCore();
        const traitorId = core.scenarioRuntime.traitorPlayerId!;
        const state = stateOf(core, 'betrayal-ai-mummy-traitor-objective');
        const actions = buildActions(state, traitorId);

        expect(actions.some((action) => action.kind === BETRAYAL_AI_ACTION_KINDS.PICK_UP_MUMMY_GIRL)).toBe(true);
        expect(actions.some((action) => action.kind === BETRAYAL_AI_ACTION_KINDS.GIVE_OMEN_TO_MUMMY)).toBe(true);
        expect(actions.some((action) => action.kind === BETRAYAL_AI_ACTION_KINDS.TRAITOR_ATTACK_HERO)).toBe(false);
    });

    test('木乃伊怪物控制 AI 会生成开回合、移动骰和怪物移动候选', () => {
        let core = createMummyMonsterMoveReadyTutorialCore();
        const traitorId = core.scenarioRuntime.traitorPlayerId!;
        const mummyMonsterId = core.scenarioRuntime.mummy!.mummyMonsterId;
        const mummyMonster = core.monsters.find((monster) => monster.id === mummyMonsterId)!;
        const movementGroupId = `${mummyMonster.name}:${mummyMonster.speed}`;
        const state = stateOf(core, 'betrayal-ai-mummy-monster-actions');
        const actions = buildActions(state, traitorId);

        expect(actions.some((action) => action.kind === BETRAYAL_AI_ACTION_KINDS.RESOLVE_MONSTER_TURN_START)).toBe(true);
        expect(actions.some((action) => action.kind === BETRAYAL_AI_ACTION_KINDS.ROLL_MONSTER_MOVEMENT_GROUP)).toBe(true);
        expect(betrayalAiRuntime.localPolicies?.baseline.decide(buildContext(state, traitorId))?.actionId)
            .toMatch(/^resolve-monster-turn-start:/);

        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.RESOLVE_MONSTER_TURN_START, traitorId, {
            monsterId: mummyMonsterId,
        });
        core = applyBetrayalCommand(
            core,
            BETRAYAL_COMMANDS.ROLL_MONSTER_MOVEMENT_GROUP,
            traitorId,
            { groupId: movementGroupId },
            100,
            createBetrayalScriptedRandom(3, 3, 3),
        );
        expect(buildActions(stateOf(core, 'betrayal-ai-mummy-monster-move'), traitorId)
            .some((action) => action.kind === BETRAYAL_AI_ACTION_KINDS.MOVE_MONSTER_TO_ROOM)).toBe(true);
    });

    test('大宅饿了 AI 会在独立巨魔手回合移动、合击并结束，不会误走探索者回合', async () => {
        let core = createHelpingHandsAiCore();
        const helpingHands = core.scenarioRuntime.helpingHands!;
        const sharedRoomId = 'entrance-hall';
        core.monsters = core.monsters.map((monster) => (
            helpingHands.trollHandIds.includes(monster.id)
                ? { ...monster, roomId: sharedRoomId }
                : monster
        ));
        setExplorerRoom(core, '1', sharedRoomId);
        core = startHelpingHandsMonsterTurn(core);

        const state = stateOf(core, 'betrayal-ai-helping-hands-monster-turn');
        const controllerActions = buildActions(state, '0');
        const nonControllerActions = buildActions(state, '1');
        const combinedAttack = controllerActions.find((action) => (
            action.kind === BETRAYAL_AI_ACTION_KINDS.TROLL_HAND_ATTACK
            && action.metadata?.combined === true
        ));

        expect(core.currentPlayer).toBe('0');
        expect(controllerActions.some((action) => action.kind === BETRAYAL_AI_ACTION_KINDS.MOVE_TROLL_HAND)).toBe(true);
        expect(combinedAttack).toBeDefined();
        expect(controllerActions.some((action) => (
            action.kind === BETRAYAL_AI_ACTION_KINDS.END_TROLL_HAND_MONSTER_TURN
        ))).toBe(true);
        expect(controllerActions.some((action) => action.kind === BETRAYAL_AI_ACTION_KINDS.END_TURN)).toBe(false);
        expect(nonControllerActions).toEqual([]);
        expect(betrayalAiRuntime.localPolicies?.baseline.decide(buildContext(state, '0'))?.actionId)
            .toBe(combinedAttack?.actionId);

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'betrayal-ai-helping-hands-monster-turn',
            seatControllers: {
                '0': { type: 'local-ai', minimumActionDelayMs: 0 },
                '1': { type: 'local-ai', minimumActionDelayMs: 0 },
                '2': { type: 'human' },
            },
        });

        expect(resolution?.playerId).toBe('0');
        expect(resolution?.action.kind).toBe(BETRAYAL_AI_ACTION_KINDS.TROLL_HAND_ATTACK);
        expect(resolution?.action.commands[0]?.payload).toMatchObject({
            combined: true,
            targetPlayerId: '1',
        });
    });

    test('AI 会用急救包治疗同房受伤队友，并通过正式领域管线生效', async () => {
        const core = createStartedFirstScenarioCore();
        const teammate = core.otherExplorers.find((explorer) => explorer.playerId === '1')!;
        const healthyTraits = { ...teammate.traits };
        teammate.roomId = core.currentExplorer.roomId;
        teammate.traits = {
            might: Math.max(1, teammate.traits.might - 1),
            speed: Math.max(1, teammate.traits.speed - 1),
            knowledge: Math.max(1, teammate.traits.knowledge - 1),
            sanity: Math.max(1, teammate.traits.sanity - 1),
        };
        core.currentExplorer.inventory = [{ id: 'medical-kit', name: '急救包', kind: 'item' }];
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['medical-kit'];
        const state = stateOf(core, 'betrayal-ai-medical-kit');

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'betrayal-ai-medical-kit',
            seatControllers: {
                '0': { type: 'local-ai', minimumActionDelayMs: 0 },
                '1': { type: 'human' },
                '2': { type: 'human' },
            },
        });

        expect(resolution?.action.kind).toBe(BETRAYAL_AI_ACTION_KINDS.USE_POSSESSION);
        expect(resolution?.action.commands[0]?.payload).toMatchObject({
            cardId: 'medical-kit',
            targetPlayerId: '1',
        });
        expect(resolution).not.toBeNull();
        if (!resolution) return;

        const nextState = applyAiResolution(state, resolution);
        const healedTeammate = nextState.core.otherExplorers.find((explorer) => explorer.playerId === '1')!;
        expect(healedTeammate.traits).toEqual(healthyTraits);
        expect(nextState.core.currentExplorer.inventory).toEqual([]);
    });

    test('AI 会为地图和面具生成领域校验通过的目标房间参数', () => {
        const core = createFirstScenarioReadyToLearnAboutJackCore();
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'entrance-hall',
            inventory: [
                { id: 'map', name: '地图', kind: 'item' },
                { id: 'mask', name: '面具', kind: 'omen' },
            ],
        };
        core.activeRoomId = 'entrance-hall';
        core.otherExplorers = core.otherExplorers.map((explorer) => (
            explorer.playerId === '1'
                ? { ...explorer, roomId: 'entrance-hall' }
                : explorer
        ));
        core.monsters = [{
            id: 'jack-spirit',
            name: '杰克之灵',
            portraitAsset: 'betrayal/monsters/spirit',
            roomId: 'entrance-hall',
            might: 5,
            speed: 3,
            damage: 1,
        }];
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['map', 'mask'];
        const state = stateOf(core, 'betrayal-ai-possession-targets');
        const actions = buildActions(state, '0')
            .filter((action) => action.kind === BETRAYAL_AI_ACTION_KINDS.USE_POSSESSION);

        expect(actions.some((action) => action.metadata?.possessionEffectId === 'map')).toBe(true);
        expect(actions.some((action) => action.metadata?.possessionEffectId === 'mask')).toBe(true);
        for (const action of actions) {
            const command = action.commands[0]!;
            expect(BetrayalDomain.validate(state, {
                type: command.type,
                playerId: '0',
                payload: command.payload,
                timestamp: 1,
            } as never).valid).toBe(true);
        }
    });

    test('AI 只在持有物更适合队友时生成普通交易和狗的远程交易', () => {
        const core = createStartedFirstScenarioCore();
        core.currentExplorer = {
            ...core.currentExplorer,
            roomId: 'entrance-hall',
            traits: {
                ...core.currentExplorer.traits,
                speed: 1,
                knowledge: 1,
            },
            inventory: [
                { id: 'dog', name: '狗', kind: 'omen' },
                { id: 'map', name: '地图', kind: 'item' },
            ],
        };
        core.activeRoomId = 'entrance-hall';
        core.otherExplorers = core.otherExplorers.map((explorer) => {
            if (explorer.playerId === '1') {
                return {
                    ...explorer,
                    roomId: 'entrance-hall',
                    traits: { ...explorer.traits, speed: 6, knowledge: 6 },
                };
            }
            if (explorer.playerId === '2') {
                return {
                    ...explorer,
                    roomId: 'upper-landing',
                    traits: { ...explorer.traits, speed: 6, knowledge: 6 },
                };
            }
            return explorer;
        });
        core.currentExplorerInventory = [...core.currentExplorer.inventory];
        core.turnStartInventoryCardIds = ['dog', 'map'];
        const state = stateOf(core, 'betrayal-ai-trade');
        const tradeActions = buildActions(state, '0')
            .filter((action) => action.kind === BETRAYAL_AI_ACTION_KINDS.TRADE_POSSESSION);

        expect(tradeActions.some((action) => (
            action.metadata?.targetPlayerId === '1'
            && action.metadata?.cardId === 'map'
            && action.metadata?.useDog === false
        ))).toBe(true);
        expect(tradeActions.some((action) => (
            action.metadata?.targetPlayerId === '2'
            && action.metadata?.cardId === 'map'
            && action.metadata?.useDog === true
        ))).toBe(true);

        const noGainCore = createStartedFirstScenarioCore();
        noGainCore.currentExplorer.inventory = [{ id: 'map', name: '地图', kind: 'item' }];
        noGainCore.currentExplorerInventory = [...noGainCore.currentExplorer.inventory];
        noGainCore.turnStartInventoryCardIds = ['map'];
        noGainCore.otherExplorers = noGainCore.otherExplorers.map((explorer) => ({
            ...explorer,
            roomId: noGainCore.currentExplorer.roomId,
            traits: {
                ...explorer.traits,
                speed: 1,
                knowledge: 1,
            },
        }));
        expect(buildActions(stateOf(noGainCore, 'betrayal-ai-no-trade-gain'), '0')
            .some((action) => action.kind === BETRAYAL_AI_ACTION_KINDS.TRADE_POSSESSION))
            .toBe(false);
    });

    test('AI 接收方会同意待处理的交易请求并完成转移', async () => {
        let core = createTradeReadyCore();
        core = applyBetrayalCommand(core, BETRAYAL_COMMANDS.TRADE_POSSESSION, '0', {
            cardId: 'rope',
            targetPlayerId: '1',
        });
        const state = stateOf(core, 'betrayal-ai-accept-trade');

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'betrayal-ai-accept-trade',
            seatControllers: {
                '0': { type: 'human' },
                '1': { type: 'local-ai', minimumActionDelayMs: 0 },
                '2': { type: 'human' },
            },
        });

        expect(resolution?.playerId).toBe('1');
        expect(resolution?.action.kind).toBe(BETRAYAL_AI_ACTION_KINDS.RESOLVE_TRADE_AGREEMENT);
        expect(resolution?.action.commands[0]?.payload).toEqual({ accept: true });
        expect(resolution).not.toBeNull();
        if (!resolution) return;

        const nextState = applyAiResolution(state, resolution);
        expect(nextState.core.pendingTradeAgreement).toBeNull();
        expect(nextState.core.activePlayerId).toBeNull();
        expect(nextState.core.currentExplorer.inventory.map((card) => card.id)).toEqual(['medical-kit', 'omen-book']);
        expect(nextState.core.otherExplorers.find((explorer) => explorer.playerId === '1')?.inventory.map((card) => card.id)).toEqual(['map', 'skull', 'rope']);
    });

    test('AI 会选择尸体上的具体持有物并完成搜刮', async () => {
        const core = createStartedFirstScenarioCore();
        const corpse = core.otherExplorers.find((explorer) => explorer.playerId === '1')!;
        corpse.roomId = core.currentExplorer.roomId;
        corpse.inventory = [{ id: 'map', name: '地图', kind: 'item' }];
        core.scenarioRuntime.deadExplorerPlayerIds = ['1'];
        const state = stateOf(core, 'betrayal-ai-loot');

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'betrayal-ai-loot',
            seatControllers: {
                '0': { type: 'local-ai', minimumActionDelayMs: 0 },
                '1': { type: 'human' },
                '2': { type: 'human' },
            },
        });

        expect(resolution?.action.kind).toBe(BETRAYAL_AI_ACTION_KINDS.LOOT_CORPSE);
        expect(resolution?.action.commands[0]?.payload).toEqual({
            sourcePlayerId: '1',
            cardId: 'map',
        });
        expect(resolution).not.toBeNull();
        if (!resolution) return;

        const nextState = applyAiResolution(state, resolution);
        expect(nextState.core.currentExplorer.inventory.map((card) => card.id)).toContain('map');
        expect(nextState.core.otherExplorers.find((explorer) => explorer.playerId === '1')?.inventory).toEqual([]);
    });

    test('AI 会重掷失败结果中的最低点兔脚骰子，但不会破坏成功结果', () => {
        const failedCore = createStartedFirstScenarioCore();
        failedCore.currentExplorer.inventory = [{ id: 'rope', name: '兔脚', kind: 'item' }];
        failedCore.currentExplorerInventory = [...failedCore.currentExplorer.inventory];
        failedCore.turnStartInventoryCardIds = ['rope'];
        failedCore.recentRoll = {
            id: 'failed-attack-roll',
            kind: 'attackRoll',
            playerId: '0',
            sourceTitle: '攻击投骰',
            dice: [2, 0, 1],
            passiveBonus: 0,
            latestLabel: '反受 2 点伤害',
            attack: {
                target: 'traitor',
                defenderPlayerId: '1',
                damageKind: 'physical',
                previousDamageToAttacker: 2,
                previousDamageToDefender: 0,
                defenderRoll: 4,
                attackerTraitsBeforeDamage: { ...failedCore.currentExplorer.traits },
                defenderTraitsBeforeDamage: {
                    ...failedCore.otherExplorers.find((explorer) => explorer.playerId === '1')!.traits,
                },
            },
            consumedRabbitFootCardIds: [],
        };
        const failedState = stateOf(failedCore, 'betrayal-ai-rabbit-foot-failed');
        const failedActions = buildActions(failedState, '0');

        expect(failedActions.every((action) => action.kind === BETRAYAL_AI_ACTION_KINDS.USE_RABBIT_FOOT)).toBe(true);
        expect(betrayalAiRuntime.localPolicies?.baseline.decide(buildContext(failedState, '0'))?.actionId)
            .toBe('use-rabbit-foot:rope:1');

        const successfulCore = createStartedFirstScenarioCore();
        successfulCore.currentExplorer.inventory = [{ id: 'rope', name: '兔脚', kind: 'item' }];
        successfulCore.currentExplorerInventory = [...successfulCore.currentExplorer.inventory];
        successfulCore.turnStartInventoryCardIds = ['rope'];
        successfulCore.recentRoll = {
            ...failedCore.recentRoll,
            id: 'successful-attack-roll',
            dice: [3, 3, 2],
            latestLabel: '造成 4 点伤害',
            attack: {
                ...failedCore.recentRoll.attack!,
                defenderRoll: 4,
            },
        };
        expect(buildActions(stateOf(successfulCore, 'betrayal-ai-rabbit-foot-success'), '0')
            .some((action) => action.kind === BETRAYAL_AI_ACTION_KINDS.USE_RABBIT_FOOT))
            .toBe(false);
    });

    test('AI 会优先使用当前可用的神秘电梯房间效果', async () => {
        const core = createStartedFirstScenarioCore();
        core.rooms = core.rooms.map((room) => (
            room.id === core.activeRoomId
                ? { ...room, enterEffect: 'mysticElevator' }
                : room
        ));
        const state = stateOf(core, 'betrayal-ai-room-effect');
        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'betrayal-ai-room-effect',
            seatControllers: {
                '0': { type: 'local-ai', minimumActionDelayMs: 0 },
                '1': { type: 'human' },
                '2': { type: 'human' },
            },
        });

        expect(resolution?.action.kind).toBe(BETRAYAL_AI_ACTION_KINDS.USE_ROOM_EFFECT);
        expect(resolution).not.toBeNull();
        if (!resolution) return;

        const nextState = applyAiResolution(
            state,
            resolution,
            createBetrayalScriptedRandom(3, 3),
        );
        expect(nextState.core.scenarioRuntime.usedRoomEffectIdsThisTurn).toContain('mysticElevator');
        expect(nextState.core.recentRoll?.kind).toBe('mysticElevator');
    });

    test('叛徒 AI 与英雄同房时优先攻击英雄', () => {
        const state = stateOf(createFirstScenarioReadyToTraitorVictoryCore());
        const actions = buildActions(state, '2');

        expect(actions.some((action) => action.kind === BETRAYAL_AI_ACTION_KINDS.TRAITOR_ATTACK_HERO)).toBe(true);
        expect(betrayalAiRuntime.localPolicies?.baseline.decide(buildContext(state, '2'))?.actionId)
            .toMatch(/^traitor-attack-hero:/);
    });

    test('英雄 AI 与叛徒同房时优先攻击叛徒', () => {
        const state = stateOf(createHeroAttackTraitorReadyCore());
        const actions = buildActions(state, '0');

        expect(actions.some((action) => action.kind === BETRAYAL_AI_ACTION_KINDS.HERO_ATTACK_TRAITOR)).toBe(true);
        expect(betrayalAiRuntime.localPolicies?.baseline.decide(buildContext(state, '0'))?.actionId)
            .toBe('hero-attack-traitor');
    });

    test('叛徒死亡后轮到其行动时会生成杰克之灵移动动作', () => {
        const core = createJackSpiritMovementRollReadyCore();
        const state = stateOf(core);
        const actions = buildActions(state, '2');

        expect(core.currentPlayer).toBe('2');
        expect(core.scenarioRuntime.deadExplorerPlayerIds).toContain('2');
        expect(core.scenarioRuntime.jackSpiritReleased).toBe(true);
        expect(actions.some((action) => action.kind === BETRAYAL_AI_ACTION_KINDS.MOVE_TO_ROOM)).toBe(true);
        expect(actions.some((action) => action.kind === BETRAYAL_AI_ACTION_KINDS.END_TURN)).toBe(true);
    });

    test('公共 AI runner 能在英雄目标状态解析出真实命令', async () => {
        const state = stateOf(createFirstScenarioReadyToLearnAboutJackCore());
        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'betrayal-ai-runner-test',
            seatControllers: {
                '0': { type: 'local-ai', minimumActionDelayMs: 0 },
                '1': { type: 'human' },
                '2': { type: 'human' },
            },
        });

        expect(resolution?.playerId).toBe('0');
        expect(resolution?.action.kind).toBe(BETRAYAL_AI_ACTION_KINDS.LEARN_ABOUT_JACK);
        expect(resolution?.action.commands[0]?.type).toBe(BETRAYAL_COMMANDS.LEARN_ABOUT_JACK);
    });

    test('公共 AI runner 能连续执行恶兆前动作并把回合交给下一位玩家', async () => {
        let state = stateOf(createStartedFirstScenarioCore(), 'betrayal-ai-continuous-turn');
        const initialPlayerId = state.core.currentPlayer;
        const seenActionKinds: string[] = [];
        const seatControllers = {
            '0': { type: 'local-ai' as const, minimumActionDelayMs: 0 },
            '1': { type: 'local-ai' as const, minimumActionDelayMs: 0 },
            '2': { type: 'local-ai' as const, minimumActionDelayMs: 0 },
        };

        for (let step = 0; step < 8 && state.core.currentPlayer === initialPlayerId; step += 1) {
            const resolution = await resolveNextLocalAiAction({
                engineConfig,
                state,
                matchId: `betrayal-ai-continuous-turn-${step}`,
                seatControllers,
            });

            expect(resolution).not.toBeNull();
            if (!resolution) break;

            seenActionKinds.push(resolution.action.kind);
            state = applyAiResolution(state, resolution);
        }

        expect(seenActionKinds).toContain(BETRAYAL_AI_ACTION_KINDS.EXPLORE_ROOM);
        expect(state.core.currentPlayer).not.toBe(initialPlayerId);
    });

    test('全 AI 对局会真实分配 AI 叛徒并通过合法阵营动作推进到有胜者的终局', async () => {
        const playerIds = ['0', '1', '2'];
        const random = createSeededRandom('betrayal-ai-full-audit');
        let state: MatchState<BetrayalCore> = {
            core: engineConfig.domain.setup(playerIds, random),
            sys: createInitialSystemState(playerIds, engineConfig.systems, engineConfig.systemsConfig),
        };
        const seatControllers = Object.fromEntries(playerIds.map((playerId) => [
            playerId,
            { type: 'local-ai' as const, minimumActionDelayMs: 0 },
        ]));
        let sawAiTraitor = false;
        let sawMummyTraitorObjective = false;
        let sawMummyMonsterAction = false;
        let sawOldJackAction = false;
        let executedSteps = 0;

        for (; executedSteps < 260 && !state.core.endgameResult; executedSteps += 1) {
            const resolution = await resolveNextLocalAiAction({
                engineConfig,
                state,
                matchId: `betrayal-ai-full-audit-${executedSteps}`,
                seatControllers,
            });

            expect(resolution).not.toBeNull();
            if (!resolution) break;

            const traitorPlayerId = state.core.scenarioRuntime.traitorPlayerId;
            if (traitorPlayerId) {
                sawAiTraitor = true;
                sawMummyTraitorObjective ||= [
                    BETRAYAL_AI_ACTION_KINDS.PICK_UP_MUMMY_GIRL,
                    BETRAYAL_AI_ACTION_KINDS.GIVE_GIRL_TO_MUMMY,
                    BETRAYAL_AI_ACTION_KINDS.GIVE_OMEN_TO_MUMMY,
                    BETRAYAL_AI_ACTION_KINDS.RESOLVE_MUMMY_ATTACK_REWARD,
                ].includes(resolution.action.kind);
                sawMummyMonsterAction ||= [
                    BETRAYAL_AI_ACTION_KINDS.RESOLVE_MONSTER_TURN_START,
                    BETRAYAL_AI_ACTION_KINDS.ROLL_MONSTER_MOVEMENT_GROUP,
                    BETRAYAL_AI_ACTION_KINDS.MOVE_MONSTER_TO_ROOM,
                    BETRAYAL_AI_ACTION_KINDS.MONSTER_ATTACK_HERO,
                ].includes(resolution.action.kind);
                sawOldJackAction ||= [
                    BETRAYAL_AI_ACTION_KINDS.LEARN_ABOUT_JACK,
                    BETRAYAL_AI_ACTION_KINDS.STUDY_EXORCISM,
                    BETRAYAL_AI_ACTION_KINDS.EXORCISE_JACK,
                    BETRAYAL_AI_ACTION_KINDS.HERO_ATTACK_TRAITOR,
                    BETRAYAL_AI_ACTION_KINDS.TRAITOR_ATTACK_HERO,
                ].includes(resolution.action.kind);
            }

            state = applyAiResolution(state, resolution, random);
        }

        expect(new Set(Object.values(state.core.selectedExplorerByPlayerId))).toHaveLength(playerIds.length);
        expect(state.core.readyPlayerIds).toHaveLength(playerIds.length);
        expect(sawAiTraitor).toBe(true);
        expect(state.core.scenarioRuntime.traitorPlayerId).toBe(state.core.scenarioRuntime.hauntRevealerPlayerId);
        expect(state.core.scenarioRuntime.hauntScenarioCardId).toBe('mummy-rampage');
        expect(sawMummyTraitorObjective).toBe(true);
        expect(sawMummyMonsterAction).toBe(true);
        expect(sawOldJackAction).toBe(false);
        expect(executedSteps).toBeLessThan(260);
        expect(state.core.phase).toBe('endgame');
        expect(state.core.endgameResult?.winners.length).toBeGreaterThan(0);
    });
});
