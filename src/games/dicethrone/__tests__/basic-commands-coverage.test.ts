/**
 * DiceThrone 基础命令覆盖测试
 *
 * 覆盖以下零覆盖命令：
 * 1. TOGGLE_DIE_LOCK — 锁定/解锁骰子
 * 2. REROLL_DIE — 重掷单个骰子（交互上下文中）
 * 3. RESOLVE_CHOICE — 解决选择交互
 */

import { describe, it, expect, vi } from 'vitest';
import { GameTestRunner } from '../../../engine/testing';
import { getCurrentInteractionSummary, injectRawBlockingInteraction } from '../../../engine/testing/interactionTestFacade';
import { buildAiDecisionContext, registerRemoteAiProvider, resolveNextLocalAiAction, withAiActionStrategyTags } from '../../../engine/ai';
import { resolveLocalAiActionVisibility } from '../../../engine/ai/actionVisibility';
import type { ChoiceRequest } from '../../../engine/ChoiceRequest';
import { DiceThroneDomain } from '../domain';
import { buildDiceThroneAiLegalActions, diceThroneAiRuntime } from '../ai';
import { engineConfig } from '../game';
import { createDiceThroneEventSystem } from '../domain/systems';
import {
    testSystems,
    createQueuedRandom,
    createNoResponseSetup,
    createRunner,
    assertState,
    cmd,
    createSetupWithHand,
    fixedRandom,
    fistAttackAbilityId,
    type CommandInput,
    createHeroMatchup,
    getCardById,
    advanceTo,
    getCurrentInteractionId,
    getMultistepChoicePrompt,
    injectSimpleChoicePrompt,
} from './test-utils';
import { DICETHRONE_CHARACTER_CATALOG, DICETHRONE_PLAYER_VISIBLE_CHARACTER_CATALOG, type DiceThroneCore, type DiceThroneEvent, type PendingBonusDiceSettlement, type PendingDamage, type TransferStatusCommand } from '../domain/types';
import type { MatchState, RandomFn } from '../../../engine/types';
import { createInitialSystemState, executePipeline } from '../../../engine/pipeline';
import { createInitializedState, injectPendingInteraction } from './test-utils';
import { resolveDiceThroneLocalPregameControlledPlayerId } from '../localPregameControl';
import { RESOURCE_IDS } from '../domain/resources';
import type { InteractionDescriptor } from '../domain/core-types';
import { STATUS_IDS, TOKEN_IDS } from '../domain/ids';
import { diceThroneCheatModifier } from '../domain/cheatModifier';
import { createBonusRollContextFromSettlement, createMainRollContext, getCurrentRollDice } from '../domain/rollContext';
import { ZHANSHUJIA_PASSIVE_ABILITIES } from '../heroes/zhanshujia/tokens';
import {
    buildDiceThroneTokenResponseChoiceCandidates,
    buildDiceThroneTokenResponseOpportunityId,
    DICETHRONE_TOKEN_RESPONSE_AI_POLICY_ID,
    DICETHRONE_TOKEN_RESPONSE_SOURCE_ID,
    type DiceThroneTokenResponseChoiceValue,
} from '../domain/timingOpportunities';

const pipelineConfig = { domain: DiceThroneDomain, systems: testSystems };

/** 执行命令并返回新状态 */
function execCmd(
    state: MatchState<DiceThroneCore>,
    command: CommandInput,
    random: RandomFn = fixedRandom,
): MatchState<DiceThroneCore> {
    const result = executePipeline(
        pipelineConfig,
        state,
        { type: command.type, playerId: command.playerId, payload: command.payload, timestamp: Date.now() },
        random,
        ['0', '1']
    );
    if (!result.success) {
        throw new Error(`命令执行失败: ${command.type} - ${result.error}`);
    }
    return result.state as MatchState<DiceThroneCore>;
}

/** 尝试执行命令，返回 pipeline 结果 */
function tryCmd(
    state: MatchState<DiceThroneCore>,
    command: CommandInput,
    random: RandomFn = fixedRandom,
) {
    return executePipeline(
        pipelineConfig,
        state,
        { type: command.type, playerId: command.playerId, payload: command.payload, timestamp: Date.now() },
        random,
        ['0', '1']
    );
}

function buildTokenResponseChoiceRequestContract(
    state: MatchState<DiceThroneCore>,
    pendingDamage: PendingDamage,
): ChoiceRequest<DiceThroneTokenResponseChoiceValue> {
    const requestId = buildDiceThroneTokenResponseOpportunityId(pendingDamage);
    const metadata = {
        opportunityId: requestId,
        pendingDamageId: pendingDamage.id,
        sourcePlayerId: pendingDamage.sourcePlayerId,
        targetPlayerId: pendingDamage.targetPlayerId,
        responderId: pendingDamage.responderId,
        responseType: pendingDamage.responseType,
        sourceAbilityId: pendingDamage.sourceAbilityId,
        damageScope: pendingDamage.damageScope,
        originalDamage: pendingDamage.originalDamage,
        currentDamage: pendingDamage.currentDamage,
    };

    return {
        requestId,
        gameId: engineConfig.gameId,
        playerId: pendingDamage.responderId,
        kind: 'choose-option',
        sourceId: DICETHRONE_TOKEN_RESPONSE_SOURCE_ID,
        candidates: buildDiceThroneTokenResponseChoiceCandidates(state.core, pendingDamage),
        selection: { min: 1, max: 1 },
        resolution: { type: 'candidate-commands' },
        ai: {
            status: 'game-policy',
            policyId: DICETHRONE_TOKEN_RESPONSE_AI_POLICY_ID,
        },
        metadata,
    };
}


// ============================================================================
// 1. TOGGLE_DIE_LOCK — 掷骰阶段锁定/解锁骰子
// ============================================================================

describe('TOGGLE_DIE_LOCK 锁定/解锁骰子', () => {
    it('本地 AI 可见步骤白名单应保留技能选择与被动发动，但不拖慢锁骰和响应牌', () => {
        const visibleStepConfig = diceThroneAiRuntime.localVisibleStepDelayConfig;
        expect(visibleStepConfig?.mode).toBe('whitelist');
        expect(visibleStepConfig?.actionKinds).toEqual(expect.arrayContaining([
            'play-card',
            'use-passive-ability',
            'select-ability',
            'roll-dice',
            'bonus-die-reroll',
        ]));
        expect(visibleStepConfig?.actionKinds).not.toContain('toggle-die-lock');
        expect(visibleStepConfig?.actionKinds).not.toContain('response-play-card');
        expect(resolveLocalAiActionVisibility({
            kind: 'play-card',
            commands: [{ type: 'PLAY_CARD', payload: { cardId: 'card-samesies' } }],
        }, diceThroneAiRuntime)).toBe('visible');
        expect(resolveLocalAiActionVisibility({
            kind: 'response-play-card',
            commands: [{ type: 'PLAY_CARD', payload: { cardId: 'card-next-time' } }],
            metadata: { cardId: 'card-next-time' },
        }, diceThroneAiRuntime)).toBe('hidden');
    });

    it('GTR: 掷骰后锁定骰子，再次掷骰时锁定骰子不变', () => {
        // 第一次掷骰: [3,3,3,3,3]，锁定 die 0 后第二次掷骰: [1,1,1,1]（die 0 保持 3）
        const diceValues = [3, 3, 3, 3, 3, 1, 1, 1, 1, 1, 1, 1, 1];
        const random = createQueuedRandom(diceValues);

        const runner = new GameTestRunner({
            domain: DiceThroneDomain,
            systems: testSystems,
            playerIds: ['0', '1'],
            random,
            setup: createNoResponseSetup(),
            assertFn: assertState,
            silent: true,
        });

        const result = runner.run({
            name: '锁定骰子后重掷不影响锁定骰',
            commands: [
                cmd('ADVANCE_PHASE', '0'),       // main1 -> offensiveRoll
                cmd('ROLL_DICE', '0'),            // 掷骰 [3,3,3,3,3]
                cmd('TOGGLE_DIE_LOCK', '0', { dieId: 0 }), // 锁定 die 0
                cmd('ROLL_DICE', '0'),            // 再掷，die 0 保持
            ],
        });

        // 验证 die 0 被锁定且值不变
        const core = result.finalState.core;
        expect(core.dice[0].isKept).toBe(true);
        expect(core.dice[0].value).toBe(3);
        // 其他骰子被重掷
        expect(core.rollCount).toBe(2);
    });

    it('GTR: 锁定后解锁骰子', () => {
        const diceValues = [4, 4, 4, 4, 4, 2, 2, 2, 2, 2];
        const random = createQueuedRandom(diceValues);

        const runner = new GameTestRunner({
            domain: DiceThroneDomain,
            systems: testSystems,
            playerIds: ['0', '1'],
            random,
            setup: createNoResponseSetup(),
            assertFn: assertState,
            silent: true,
        });

        const result = runner.run({
            name: '锁定后解锁骰子',
            commands: [
                cmd('ADVANCE_PHASE', '0'),
                cmd('ROLL_DICE', '0'),
                cmd('TOGGLE_DIE_LOCK', '0', { dieId: 0 }),  // 锁定
                cmd('TOGGLE_DIE_LOCK', '0', { dieId: 0 }),  // 解锁
                cmd('ROLL_DICE', '0'),                        // 全部重掷
            ],
        });

        const core = result.finalState.core;
        expect(core.dice[0].isKept).toBe(false);
        // 解锁后 die 0 也被重掷
        expect(core.dice[0].value).toBe(2);
    });

    it('防御阶段应允许防御方锁定自己的防御骰', () => {
        const state = createHeroMatchup('treant', 'ninja')(['0', '1'], fixedRandom);
        state.sys.phase = 'defensiveRoll';
        state.core.activePlayerId = '1';
        state.core.rollCount = 1;
        state.core.rollLimit = 2;
        state.core.rollConfirmed = false;
        state.core.rollDiceCount = 3;
        state.core.pendingAttack = {
            attackerId: '0',
            defenderId: '1',
            sourceAbilityId: 'shattering-fist',
            defenseAbilityId: 'blink',
            isDefendable: true,
            damage: 0,
            bonusDamage: 0,
        } as any;
        state.core.dice = [
            { id: 0, value: 1, isKept: false, definitionId: 'ninja-dice', symbol: 'katana', symbols: ['katana'] },
            { id: 1, value: 4, isKept: false, definitionId: 'ninja-dice', symbol: 'mask', symbols: ['mask'] },
            { id: 2, value: 6, isKept: false, definitionId: 'ninja-dice', symbol: 'mask', symbols: ['mask'] },
            { id: 3, value: 4, isKept: true, definitionId: 'ninja-dice', symbol: 'mask', symbols: ['mask'] },
            { id: 4, value: 5, isKept: true, definitionId: 'ninja-dice', symbol: 'shuriken', symbols: ['shuriken'] },
        ] as any;

        const result = tryCmd(state, cmd('TOGGLE_DIE_LOCK', '1', { dieId: 0 }));
        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.state.core.dice[0].isKept).toBe(true);
    });

    it('非 offensiveRoll/defensiveRoll 阶段锁定骰子失败', () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        // main1 阶段
        const result = tryCmd(state, cmd('TOGGLE_DIE_LOCK', '0', { dieId: 0 }));
        expect(result.success).toBe(false);
    });

    it('未投掷前锁定骰子失败', () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        state.sys.phase = 'offensiveRoll';

        const result = tryCmd(state, cmd('TOGGLE_DIE_LOCK', '0', { dieId: 0 }));
        expect(result.success).toBe(false);
        expect(result.error).toBe('no_roll_yet');
    });



    it('非当前玩家锁定骰子失败', () => {
        const diceValues = [3, 3, 3, 3, 3];
        const random = createQueuedRandom(diceValues);

        const runner = new GameTestRunner({
            domain: DiceThroneDomain,
            systems: testSystems,
            playerIds: ['0', '1'],
            random,
            setup: createNoResponseSetup(),
            assertFn: assertState,
            silent: true,
        });

        const result = runner.run({
            name: '非当前玩家锁定失败',
            commands: [
                cmd('ADVANCE_PHASE', '0'),
                cmd('ROLL_DICE', '0'),
            ],
        });

        // 玩家 1 尝试锁定
        const tryResult = tryCmd(result.finalState, cmd('TOGGLE_DIE_LOCK', '1', { dieId: 0 }));
        expect(tryResult.success).toBe(false);
    });

    it('确认掷骰后锁定骰子失败', () => {
        const diceValues = [3, 3, 3, 3, 3];
        const random = createQueuedRandom(diceValues);

        const runner = new GameTestRunner({
            domain: DiceThroneDomain,
            systems: testSystems,
            playerIds: ['0', '1'],
            random,
            setup: createNoResponseSetup(),
            assertFn: assertState,
            silent: true,
        });

        const result = runner.run({
            name: '确认后锁定失败',
            commands: [
                cmd('ADVANCE_PHASE', '0'),
                cmd('ROLL_DICE', '0'),
                cmd('CONFIRM_ROLL', '0'),
            ],
        });

        const tryResult = tryCmd(result.finalState, cmd('TOGGLE_DIE_LOCK', '0', { dieId: 0 }));
        expect(tryResult.success).toBe(false);
    });

    it('不存在的骰子 ID 锁定失败', () => {
        const diceValues = [3, 3, 3, 3, 3];
        const random = createQueuedRandom(diceValues);

        const runner = new GameTestRunner({
            domain: DiceThroneDomain,
            systems: testSystems,
            playerIds: ['0', '1'],
            random,
            setup: createNoResponseSetup(),
            assertFn: assertState,
            silent: true,
        });

        const result = runner.run({
            name: '无效骰子ID',
            commands: [
                cmd('ADVANCE_PHASE', '0'),
                cmd('ROLL_DICE', '0'),
            ],
        });

        const tryResult = tryCmd(result.finalState, cmd('TOGGLE_DIE_LOCK', '0', { dieId: 99 }));
        expect(tryResult.success).toBe(false);
    });
});

describe('AI legal actions', () => {
    it('setup 阶段应为本地 AI 生成选角动作', () => {
        const core = DiceThroneDomain.setup(['0', '1'], fixedRandom);
        const state: MatchState<DiceThroneCore> = {
            core,
            sys: {
                phase: 'setup',
                interaction: { queue: [] },
            } as MatchState<DiceThroneCore>['sys'],
        };

        const actions = buildDiceThroneAiLegalActions({
            playerId: '1',
            state,
        });

        expect(actions.some((action) =>
            action.kind === 'setup-select-character'
            && action.commands[0]?.type === 'SELECT_CHARACTER'
        )).toBe(true);
    });

    it('setup 阶段原始 AI 候选包含实施中角色，但共享 AI 上下文应过滤它们', () => {
        const core = DiceThroneDomain.setup(['0', '1'], fixedRandom);
        const state: MatchState<DiceThroneCore> = {
            core,
            sys: {
                phase: 'setup',
                interaction: { queue: [] },
            } as MatchState<DiceThroneCore>['sys'],
        };

        const rawCharacterIds = buildDiceThroneAiLegalActions({
            playerId: '1',
            state,
        })
            .filter((action) => action.kind === 'setup-select-character')
            .map((action) => (action.commands[0]?.payload as { characterId?: string } | undefined)?.characterId);
        const context = buildAiDecisionContext({
            gameId: engineConfig.gameId,
            matchId: 'dicethrone:setup-option-status',
            playerId: '1',
            visibleState: state,
            rulesVersion: null,
            decisionBudgetMs: 250,
            source: 'local',
            seatController: { type: 'local-ai' },
        });
        const contextCharacterIds = context.legalActions
            .filter((action) => action.kind === 'setup-select-character')
            .map((action) => (action.commands[0]?.payload as { characterId?: string } | undefined)?.characterId);

        expect(rawCharacterIds).toContain('lieren');
        expect(rawCharacterIds).toContain('vampire_lord');
        expect(contextCharacterIds).not.toContain('lieren');
        expect(contextCharacterIds).not.toContain('vampire_lord');
    });

    it('在线 AI 尚未选角和准备时，房主开始命令必须被拒绝，AI 仍能生成选角动作', () => {
        const core = DiceThroneDomain.setup(['0', '1'], fixedRandom);
        core.selectedCharacters['0'] = 'monk';
        core.seatControllers = {
            '1': { type: 'local-ai', minimumActionDelayMs: 2000 },
        };
        const state: MatchState<DiceThroneCore> = {
            core,
            sys: {
                phase: 'setup',
                interaction: { queue: [], isBlocked: false },
                undo: { aiSeatIds: ['1'] },
            } as MatchState<DiceThroneCore>['sys'],
        };

        expect(DiceThroneDomain.validate(state, {
            type: 'HOST_START_GAME',
            playerId: '0',
            payload: {},
            timestamp: 0,
        } as never)).toEqual({ valid: false, error: 'players_not_ready' });

        const actions = buildDiceThroneAiLegalActions({ playerId: '1', state });
        expect(actions).toContainEqual(expect.objectContaining({
            kind: 'setup-select-character',
            commands: [expect.objectContaining({ type: 'SELECT_CHARACTER' })],
        }));
    });

    it('在线 AI 房主只在全员选角并准备后生成一次开始动作', () => {
        const core = DiceThroneDomain.setup(['0', '1'], fixedRandom);
        core.selectedCharacters['0'] = 'monk';
        core.seatControllers = {
            '0': { type: 'local-ai', minimumActionDelayMs: 2000 },
        };
        const state: MatchState<DiceThroneCore> = {
            core,
            sys: {
                phase: 'setup',
                interaction: { queue: [], isBlocked: false },
                undo: { aiSeatIds: ['0'] },
            } as MatchState<DiceThroneCore>['sys'],
        };

        expect(buildDiceThroneAiLegalActions({ playerId: '0', state }))
            .not.toContainEqual(expect.objectContaining({ kind: 'setup-host-start' }));

        core.selectedCharacters['1'] = 'barbarian';
        core.readyPlayers['1'] = true;
        const startActions = buildDiceThroneAiLegalActions({ playerId: '0', state })
            .filter((action) => action.kind === 'setup-host-start');

        expect(startActions).toHaveLength(1);
        expect(startActions[0]?.commands).toEqual([{ type: 'HOST_START_GAME', payload: {} }]);
    });

    it('主流程阶段应生成推进回合动作', () => {
        const state = createInitializedState(['0', '1'], fixedRandom);

        const actions = buildDiceThroneAiLegalActions({
            playerId: '0',
            state,
        });

        expect(actions.some((action) => action.kind === 'advance-phase')).toBe(true);
    });

    it('主流程 AI 有净化和 token 形态负面状态时，应生成 USE_PURIFY 动作', () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        state.core.activePlayerId = '0';
        state.sys.phase = 'main1';
        state.core.players['0'].tokens[TOKEN_IDS.PURIFY] = 1;
        state.core.players['0'].tokens[TOKEN_IDS.BOUNTY] = 1;

        const actions = buildDiceThroneAiLegalActions({
            playerId: '0',
            state,
        });

        expect(actions).toContainEqual(expect.objectContaining({
            kind: 'use-purify',
            commands: [{
                type: 'USE_PURIFY',
                payload: { statusId: TOKEN_IDS.BOUNTY },
            }],
            metadata: expect.objectContaining({
                statusId: TOKEN_IDS.BOUNTY,
                strategyTags: expect.arrayContaining(['purify-control']),
            }),
        }));
    });

    it('本地 AI 不应生成 UNDO_SELL_CARD（避免卖牌↔撤回卖牌循环导致卡死）', () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        state.core.activePlayerId = '0';
        state.sys.phase = 'main1';

        const player = state.core.players['0'];
        expect(player).toBeTruthy();
        const soldCard = player.hand[0];
        expect(soldCard).toBeTruthy();

        // 构造“可撤回卖牌”的状态：lastSoldCardId + discard 中存在该牌
        player.hand = player.hand.slice(1);
        player.discard = [soldCard, ...player.discard];
        (state.core as any).lastSoldCardId = soldCard.id;

        const actions = buildDiceThroneAiLegalActions({
            playerId: '0',
            state,
        });

        expect(actions.some((action) =>
            action.commands.some((cmd) => cmd.type === 'UNDO_SELL_CARD')
        )).toBe(false);
    });

    it('displayOnly 奖励骰结算只给 AI 生成一次确认动作，不生成重掷动作', () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        state.core.activePlayerId = '0';
        state.sys.phase = 'main2';
        (state.core as any).pendingBonusDiceSettlement = {
            id: 'display-only-bonus',
            attackerId: '0',
            targetId: '1',
            dice: [{ index: 0, value: 2 }],
            rerollCount: 0,
            displayOnly: true,
        };

        const actions = buildDiceThroneAiLegalActions({
            playerId: '0',
            state,
        });

        expect(actions.filter((action) => action.kind === 'bonus-die-reroll')).toHaveLength(0);
        expect(actions.filter((action) => action.kind === 'confirm-roll')).toHaveLength(1);
    });

    it('本地 AI 面对右侧奖励骰确认交互时应确认结算，而不是取消交互', () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        state.core.activePlayerId = '0';
        state.sys.phase = 'main2';
        (state.core as any).pendingBonusDiceSettlement = {
            id: 'right-tray-bonus-ai-confirm',
            sourceAbilityId: 'test-bonus',
            attackerId: '0',
            targetId: '1',
            dice: [{ index: 0, value: 4, face: 'fist' }],
            rerollCount: 0,
            displayOnly: true,
        };
        injectRawBlockingInteraction(state, {
            id: 'dt-bonus-dice-right-tray-bonus-ai-confirm',
            kind: 'dt:bonus-dice',
            playerId: '0',
        });

        const actions = buildDiceThroneAiLegalActions({
            playerId: '0',
            state,
        });

        expect(actions).toContainEqual(expect.objectContaining({
            kind: 'confirm-roll',
            commands: [{ type: 'CONFIRM_ROLL', payload: {} }],
        }));
        expect(actions.some((action) => action.kind === 'interaction-cancel')).toBe(false);

        const result = execCmd(state, cmd('CONFIRM_ROLL', '0'));
        expect(result.core.pendingBonusDiceSettlement).toBeUndefined();
        expect(getCurrentInteractionSummary(result).kind).toBeUndefined();
    });

    it('AI bonus dice modify-or-confirm: 右侧奖励骰允许改骰时应同时枚举合法改骰牌和确认动作', () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        state.core.activePlayerId = '0';
        state.sys.phase = 'offensiveRoll';
        state.core.players['0'].resources[RESOURCE_IDS.CP] = 2;
        state.core.players['0'].hand = [getCardById('card-surprise')];
        const settlement: PendingBonusDiceSettlement = {
            id: 'right-tray-bonus-ai-modify-or-confirm',
            sourceAbilityId: 'test-bonus',
            attackerId: '0',
            targetId: '1',
            dice: [{ index: 0, value: 4, face: 'fist' }],
            rerollCount: 0,
            allowDiceModification: true,
        };
        state.core.pendingBonusDiceSettlement = settlement;
        state.core.currentRollContext = createBonusRollContextFromSettlement(state.core, settlement);
        injectRawBlockingInteraction(state, {
            id: 'dt-bonus-dice-right-tray-bonus-ai-modify-or-confirm',
            kind: 'dt:bonus-dice',
            playerId: '0',
        });

        expect(DiceThroneDomain.validate(state, {
            type: 'PLAY_CARD',
            playerId: '0',
            payload: { cardId: 'card-surprise' },
            timestamp: 0,
        } as never)).toEqual({ valid: true });

        const actions = buildDiceThroneAiLegalActions({
            playerId: '0',
            state,
        });

        expect(actions).toContainEqual(expect.objectContaining({
            kind: 'play-card',
            commands: [{ type: 'PLAY_CARD', payload: { cardId: 'card-surprise' } }],
        }));
        expect(actions).toContainEqual(expect.objectContaining({
            kind: 'confirm-roll',
            commands: [{ type: 'CONFIRM_ROLL', payload: {} }],
        }));
    });

    it('AI bonus dice opponent-interference: 右侧奖励骰期间非骰主只应枚举合法改骰牌，不应枚举战术优势', () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        state.core.activePlayerId = '0';
        state.sys.phase = 'offensiveRoll';
        state.core.players['1'].resources[RESOURCE_IDS.CP] = 5;
        state.core.players['1'].hand = [getCardById('card-give-hand')];
        state.core.players['1'].characterId = 'zhanshujia';
        state.core.players['1'].passiveAbilities = ZHANSHUJIA_PASSIVE_ABILITIES;
        state.core.players['1'].tokens[TOKEN_IDS.TACTICAL_ADVANTAGE] = 1;
        const settlement: PendingBonusDiceSettlement = {
            id: 'right-tray-bonus-ai-opponent-interference',
            sourceAbilityId: 'test-bonus',
            attackerId: '0',
            targetId: '1',
            dice: [{ index: 0, value: 4, face: 'fist' }],
            rerollCount: 0,
            allowDiceModification: true,
        };
        state.core.pendingBonusDiceSettlement = settlement;
        state.core.currentRollContext = createBonusRollContextFromSettlement(state.core, settlement);
        injectRawBlockingInteraction(state, {
            id: 'dt-bonus-dice-right-tray-bonus-ai-opponent-interference',
            kind: 'dt:bonus-dice',
            playerId: '0',
        });

        expect(DiceThroneDomain.validate(state, {
            type: 'PLAY_CARD',
            playerId: '1',
            payload: { cardId: 'card-give-hand' },
            timestamp: 0,
        } as never)).toEqual({ valid: true });

        const actions = buildDiceThroneAiLegalActions({
            playerId: '1',
            state,
        });

        expect(actions).toContainEqual(expect.objectContaining({
            kind: 'play-card',
            commands: [{ type: 'PLAY_CARD', payload: { cardId: 'card-give-hand' } }],
        }));
        expect(actions).not.toContainEqual(expect.objectContaining({
            kind: 'use-passive-ability',
            commands: [expect.objectContaining({
                type: 'USE_PASSIVE_ABILITY',
                payload: expect.objectContaining({
                    passiveId: 'zhanshujia-tactical-advantage',
                    actionIndex: 1,
                    targetDieId: 0,
                }),
            })],
        }));
        expect(actions.some((action) => action.kind === 'skip-bonus-dice-reroll')).toBe(false);
    });

    it('AI bonus dice no-modify: 没有合法改骰牌时仍应只保留奖励骰动作和确认', () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        state.core.activePlayerId = '0';
        state.sys.phase = 'offensiveRoll';
        state.core.players['0'].resources[RESOURCE_IDS.CP] = 0;
        state.core.players['0'].hand = [getCardById('card-surprise')];
        const settlement: PendingBonusDiceSettlement = {
            id: 'right-tray-bonus-ai-no-modify',
            sourceAbilityId: 'test-bonus',
            attackerId: '0',
            targetId: '1',
            dice: [{ index: 0, value: 4, face: 'fist' }],
            rerollCount: 0,
        };
        state.core.pendingBonusDiceSettlement = settlement;
        state.core.currentRollContext = createBonusRollContextFromSettlement(state.core, settlement);
        injectRawBlockingInteraction(state, {
            id: 'dt-bonus-dice-right-tray-bonus-ai-no-modify',
            kind: 'dt:bonus-dice',
            playerId: '0',
        });

        const actions = buildDiceThroneAiLegalActions({
            playerId: '0',
            state,
        });

        expect(actions.some((action) => action.kind === 'play-card')).toBe(false);
        expect(actions.some((action) => action.kind === 'bonus-die-reroll')).toBe(true);
        expect(actions).toContainEqual(expect.objectContaining({
            kind: 'confirm-roll',
            commands: [{ type: 'CONFIRM_ROLL', payload: {} }],
        }));
    });

    it('旧 pendingBonusDiceSettlement 脏 dice shape 不应让 AI 构建奖励骰动作时崩溃', () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        state.core.activePlayerId = '0';
        state.sys.phase = 'main2';
        (state.core as any).pendingBonusDiceSettlement = {
            id: 'legacy-bonus-dice-shape',
            sourceAbilityId: 'test-bonus',
            attackerId: '0',
            targetId: '1',
            dice: { legacy: true },
            rerollCostTokenId: TOKEN_IDS.TAIJI,
            rerollCostAmount: 1,
            rerollCount: 0,
            readyToSettle: false,
            resolutionMode: 'damage',
        };

        const actions = buildDiceThroneAiLegalActions({
            playerId: '0',
            state,
        });

        expect(actions.some((action) =>
            action.kind === 'bonus-die-reroll' || action.kind === 'confirm-roll'
        )).toBe(true);
        expect(actions.filter((action) => action.kind === 'bonus-die-reroll')).toHaveLength(0);
        expect(actions.some((action) => action.kind === 'confirm-roll')).toBe(true);
    });

    it('本地 AI 在奖励骰未达阈值且重掷低骰有正期望时，应优先重掷该骰', async () => {
        const state = createHeroMatchup('monk', 'paladin')(['0', '1'], fixedRandom);
        state.core.players['0'].tokens[TOKEN_IDS.TAIJI] = 1;
        (state.core as any).pendingBonusDiceSettlement = {
            id: 'bonus-reroll-threshold-push',
            sourceAbilityId: 'test-bonus',
            attackerId: '0',
            targetId: '1',
            dice: [
                { index: 0, value: 1, face: 'fist' },
                { index: 1, value: 6, face: 'lotus' },
            ],
            rerollCostTokenId: TOKEN_IDS.TAIJI,
            rerollCostAmount: 1,
            rerollCount: 0,
            threshold: 10,
            thresholdEffect: 'knockdown',
            readyToSettle: false,
            resolutionMode: 'damage',
        };

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'dicethrone-ai-bonus-reroll-threshold-push',
            seatControllers: {
                '0': { type: 'local-ai', difficulty: 'expert' },
            },
        });

        expect(resolution?.action.kind).toBe('bonus-die-reroll');
        expect(resolution?.action.metadata).toMatchObject({ dieIndex: 0 });
    });

    it('本地 AI 在奖励骰已接近最优时应直接确认，而不是为了重掷而重掷', async () => {
        const state = createHeroMatchup('monk', 'paladin')(['0', '1'], fixedRandom);
        state.core.players['0'].tokens[TOKEN_IDS.TAIJI] = 1;
        (state.core as any).pendingBonusDiceSettlement = {
            id: 'bonus-reroll-already-good',
            sourceAbilityId: 'test-bonus',
            attackerId: '0',
            targetId: '1',
            dice: [
                { index: 0, value: 6, face: 'lotus' },
                { index: 1, value: 6, face: 'lotus' },
            ],
            rerollCostTokenId: TOKEN_IDS.TAIJI,
            rerollCostAmount: 1,
            rerollCount: 0,
            threshold: 10,
            thresholdEffect: 'knockdown',
            readyToSettle: false,
            resolutionMode: 'damage',
        };

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'dicethrone-ai-bonus-reroll-already-good',
            seatControllers: {
                '0': { type: 'local-ai', difficulty: 'expert' },
            },
        });

        expect(resolution?.action.kind).toBe('confirm-roll');
    });

    it('dt:card-interaction 的 selectPlayer 交互应生成 RESOLVE_INTERACTION 动作', () => {
        const state = createInitializedState(['0', '1', '2', '3'], fixedRandom);
        const interaction: InteractionDescriptor = {
            id: 'ai-select-player',
            playerId: '0',
            sourceCardId: 'moon-shadow-strike',
            type: 'selectPlayer',
            titleKey: 'interaction.selectPlayer',
            selectCount: 1,
            selected: [],
            targetPlayerIds: ['1', '3'],
        };
        injectPendingInteraction(state, interaction);

        const actions = buildDiceThroneAiLegalActions({
            playerId: '0',
            state,
        });

        expect(actions).toHaveLength(2);
        expect(actions.every((action) => action.kind === 'interaction-select-player')).toBe(true);
        expect(actions.map((action) => action.commands[0])).toEqual([
            { type: 'RESOLVE_INTERACTION', payload: { selectedPlayerIds: ['1'] } },
            { type: 'RESOLVE_INTERACTION', payload: { selectedPlayerIds: ['3'] } },
        ]);
    });

    it('本地 AI runner 在 selectPlayer 交互里不会卡死', async () => {
        const state = createInitializedState(['0', '1', '2', '3'], fixedRandom);
        const interaction: InteractionDescriptor = {
            id: 'ai-select-player',
            playerId: '0',
            sourceCardId: 'moon-shadow-strike',
            type: 'selectPlayer',
            titleKey: 'interaction.selectPlayer',
            selectCount: 1,
            selected: [],
            targetPlayerIds: ['1', '3'],
        };
        injectPendingInteraction(state, interaction);

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '0': { type: 'local-ai' },
            },
        });

        expect(resolution?.playerId).toBe('0');
        expect(resolution?.action.kind).toBe('interaction-select-player');
        expect(resolution?.action.commands[0]?.type).toBe('RESOLVE_INTERACTION');
        expect([['1'], ['3']]).toContainEqual(
            (resolution?.action.commands[0]?.payload as { selectedPlayerIds?: string[] } | undefined)?.selectedPlayerIds,
        );
    });

    it('本地 AI 在 simple-choice 多选最少数量不可达时，应走通用 emergency skip fallback 而不是卡死', async () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        state.core.activePlayerId = '0';
        state.sys.phase = 'main2';
        state.sys.interaction = {
            current: {
                id: 'unsat-multi-choice',
                kind: 'simple-choice',
                playerId: '0',
                data: {
                    title: 'interaction.unsatMulti',
                    sourceId: 'test-unsat-multi',
                    multi: { min: 2, max: 2 },
                    options: [
                        {
                            id: 'disabled-only',
                            label: '唯一但不可选',
                            value: { targetId: 'm-1' },
                            disabled: true,
                        },
                        {
                            id: '__emergency_skip__',
                            label: '跳过（当前无可执行选项）',
                            value: {
                                __emergency_skip__: true,
                                __emergency_skip_reason__: 'min-selection-unreachable',
                            },
                        },
                    ],
                },
            } as unknown as NonNullable<typeof state.sys.interaction.current>,
            queue: [],
            isBlocked: false,
        };

        const context = buildAiDecisionContext({
            gameId: engineConfig.gameId,
            matchId: 'local:test-unsat-multi',
            playerId: '0',
            visibleState: state as MatchState<unknown>,
            rulesVersion: null,
            decisionBudgetMs: 250,
            source: 'local',
            seatController: { type: 'local-ai' },
        });

        expect(context.legalActions).toEqual(expect.arrayContaining([
            expect.objectContaining({
                kind: 'interaction-choice',
                commands: [{
                    type: 'SYS_INTERACTION_RESPOND',
                    payload: { interactionId: 'unsat-multi-choice', optionIds: ['__emergency_skip__'] },
                }],
            }),
        ]));

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test-unsat-multi',
            seatControllers: {
                '0': { type: 'local-ai' },
            },
        });

        expect(resolution?.playerId).toBe('0');
        expect(resolution?.action.commands[0]).toEqual({
            type: 'SYS_INTERACTION_RESPOND',
            payload: { interactionId: 'unsat-multi-choice', optionIds: ['__emergency_skip__'] },
        });
    });

    it('本地 AI 在 simple-choice 多选最少数量不可达且没有显式 emergency 选项时，应主动取消交互而不是返回空动作', () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        state.core.activePlayerId = '0';
        state.sys.phase = 'main2';
        state.sys.interaction = {
            current: {
                id: 'unsat-multi-choice-no-fallback-option',
                kind: 'simple-choice',
                playerId: '0',
                data: {
                    title: 'interaction.unsatMultiNoFallbackOption',
                    sourceId: 'test-unsat-multi-no-fallback-option',
                    multi: { min: 2, max: 2 },
                    options: [{
                        id: 'only-one-option',
                        label: '唯一可选项',
                        value: { customId: 'only-one-option' },
                    }],
                },
            } as unknown as NonNullable<typeof state.sys.interaction.current>,
            queue: [],
            isBlocked: false,
        };

        const actions = buildDiceThroneAiLegalActions({
            playerId: '0',
            state,
        });

        expect(actions).toEqual([expect.objectContaining({
            kind: 'interaction-cancel',
            commands: [{
                type: 'SYS_INTERACTION_CANCEL',
                payload: { interactionId: 'unsat-multi-choice-no-fallback-option', reason: 'no-legal-actions' },
            }],
        })]);
    });

    it('本地 AI 遇到暂未支持的 dt:card-interaction 类型时，应主动取消交互而不是卡死', () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        const interaction = {
            id: 'ai-unsupported-card-interaction',
            playerId: '0',
            sourceCardId: 'card-unsupported',
            type: 'selectCardFromDiscard',
            titleKey: 'interaction.unsupported',
            selected: [],
        };

        injectPendingInteraction(state, interaction as unknown as InteractionDescriptor);

        const actions = buildDiceThroneAiLegalActions({
            playerId: '0',
            state,
        });
        const currentInteractionId = getCurrentInteractionId(state);

        expect(actions).toEqual([expect.objectContaining({
            kind: 'interaction-cancel',
            commands: [{
                type: 'SYS_INTERACTION_CANCEL',
                payload: { interactionId: currentInteractionId, reason: 'no-legal-actions' },
            }],
        })]);
    });

    it('simple-choice 的 token/skip 选项会生成 aiHint，并优先选择增益选项', async () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        state.core.activePlayerId = '0';
        state.sys.phase = 'main2';
        state.sys.interaction = {
            current: {
                id: 'ai-choice-token',
                kind: 'simple-choice',
                playerId: '0',
                data: {
                    title: 'interaction.chooseToken',
                    sourceId: 'offensive-roll-end-token',
                    options: [
                        {
                            id: 'option-0',
                            label: '使用暴击',
                            value: { tokenId: TOKEN_IDS.CRIT, value: 1, customId: 'use-crit' },
                        },
                        {
                            id: 'option-1',
                            label: '跳过',
                            value: { value: 0, customId: 'skip' },
                        },
                    ],
                },
            } as unknown as NonNullable<typeof state.sys.interaction.current>,
            queue: [],
            isBlocked: false,
        };

        const actions = buildDiceThroneAiLegalActions({
            playerId: '0',
            state,
        });

        const useAction = actions.find((action) => action.metadata?.optionId === 'option-0');
        const skipAction = actions.find((action) => action.metadata?.optionId === 'option-1');

        expect(useAction?.aiHints?.some((hint) =>
            hint.effectIntent === 'resource' && hint.relationToActor === 'self'
        )).toBe(true);
        expect(skipAction?.aiHints?.some((hint) => hint.effectIntent === 'optional-skip')).toBe(true);

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test-choice',
            seatControllers: {
                '0': { type: 'local-ai' },
            },
        });

        expect(resolution?.action.commands[0]).toEqual({
            type: 'SYS_INTERACTION_RESPOND',
            payload: { interactionId: 'ai-choice-token', optionId: 'option-0' },
        });
    });

    it('semantic simple-choice 的 skip option 仍会生成 optional-skip hint', () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        state.core.activePlayerId = '0';
        state.sys.phase = 'main2';
        state.sys.interaction = {
            ...state.sys.interaction,
            current: {
                id: 'semantic-choice-skip',
                kind: 'simple-choice',
                playerId: '0',
                data: {
                    title: 'interaction.choose',
                    sourceId: 'semantic-skip-source',
                    options: [
                        {
                            id: 'take-token',
                            label: '获得气',
                            value: {
                                value: 1,
                                targetPlayerId: '0',
                                tokenGrantConfig: { tokenId: TOKEN_IDS.CHI, amount: 1 },
                            },
                        },
                        {
                            id: 'skip',
                            label: '跳过',
                            value: { value: 0, customId: 'skip' },
                        },
                    ],
                    ai: {
                        status: 'semantic',
                        decisions: [{
                            kind: 'choose-option',
                            interactionId: 'semantic-choice-skip',
                            actorPlayerId: '0',
                            sourceId: 'semantic-skip-source',
                            selection: { min: 1, max: 1 },
                            skipPolicy: 'forbidden',
                            candidates: [
                                { id: 'take-token', label: '获得气' },
                                { id: 'skip', label: '跳过' },
                            ],
                        }],
                    },
                },
            } as any,
        };

        const actions = buildDiceThroneAiLegalActions({ playerId: '0', state });
        const skipAction = actions.find((action) => action.metadata?.optionId === 'skip');

        expect(skipAction?.commands[0]).toEqual({
            type: 'SYS_INTERACTION_RESPOND',
            payload: { interactionId: 'semantic-choice-skip', optionId: 'skip' },
        });
        expect(skipAction?.aiHints?.some((hint) => hint.effectIntent === 'optional-skip')).toBe(true);
    });

    it('semantic simple-choice 多选应生成 optionIds payload 并保留被选项 metadata', () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        state.core.activePlayerId = '0';
        state.sys.phase = 'main2';
        state.sys.interaction = {
            ...state.sys.interaction,
            current: {
                id: 'semantic-choice-multi',
                kind: 'simple-choice',
                playerId: '0',
                data: {
                    title: 'interaction.chooseMany',
                    sourceId: 'semantic-multi-source',
                    options: [
                        { id: 'opt-a', label: 'A', value: { value: 1, customId: 'a' } },
                        { id: 'opt-b', label: 'B', value: { value: 2, customId: 'b' } },
                        { id: 'opt-c', label: 'C', value: { value: 3, customId: 'c' } },
                    ],
                    multi: { min: 2, max: 2 },
                    ai: {
                        status: 'semantic',
                        decisions: [{
                            kind: 'choose-option',
                            interactionId: 'semantic-choice-multi',
                            actorPlayerId: '0',
                            sourceId: 'semantic-multi-source',
                            selection: { min: 2, max: 2 },
                            skipPolicy: 'forbidden',
                            candidates: [
                                { id: 'opt-a', label: 'A' },
                                { id: 'opt-b', label: 'B' },
                                { id: 'opt-c', label: 'C' },
                            ],
                        }],
                    },
                },
            } as any,
        };

        const actions = buildDiceThroneAiLegalActions({ playerId: '0', state });
        const payloads = actions
            .filter((action) => action.kind === 'interaction-choice')
            .map((action) => ({
                payload: action.commands[0]?.payload,
                metadata: action.metadata,
            }));

        expect(payloads).toEqual(expect.arrayContaining([
            {
                payload: { interactionId: 'semantic-choice-multi', optionIds: ['opt-a', 'opt-b'] },
                metadata: expect.objectContaining({
                    interactionId: 'semantic-choice-multi',
                    optionIds: ['opt-a', 'opt-b'],
                    sourceId: 'semantic-multi-source',
                }),
            },
            {
                payload: { interactionId: 'semantic-choice-multi', optionIds: ['opt-a', 'opt-c'] },
                metadata: expect.objectContaining({
                    interactionId: 'semantic-choice-multi',
                    optionIds: ['opt-a', 'opt-c'],
                    sourceId: 'semantic-multi-source',
                }),
            },
            {
                payload: { interactionId: 'semantic-choice-multi', optionIds: ['opt-b', 'opt-c'] },
                metadata: expect.objectContaining({
                    interactionId: 'semantic-choice-multi',
                    optionIds: ['opt-b', 'opt-c'],
                    sourceId: 'semantic-multi-source',
                }),
            },
        ]));
    });

    it('semantic simple-choice 缺少当前 AI actor 决策时应取消交互而不是返回空动作', () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        state.core.activePlayerId = '0';
        state.sys.phase = 'main2';
        state.sys.interaction = {
            ...state.sys.interaction,
            current: {
                id: 'semantic-choice-wrong-actor',
                kind: 'simple-choice',
                playerId: '0',
                data: {
                    title: 'interaction.choose',
                    sourceId: 'semantic-wrong-actor-source',
                    options: [
                        { id: 'opt-a', label: 'A', value: { value: 1, customId: 'a' } },
                    ],
                    ai: {
                        status: 'semantic',
                        decisions: [{
                            kind: 'choose-option',
                            interactionId: 'semantic-choice-wrong-actor',
                            actorPlayerId: '1',
                            sourceId: 'semantic-wrong-actor-source',
                            selection: { min: 1, max: 1 },
                            skipPolicy: 'forbidden',
                            candidates: [{ id: 'opt-a', label: 'A' }],
                        }],
                    },
                },
            } as any,
        };

        const actions = buildDiceThroneAiLegalActions({ playerId: '0', state });

        expect(actions).toEqual([expect.objectContaining({
            kind: 'interaction-cancel',
            commands: [{
                type: 'SYS_INTERACTION_CANCEL',
                payload: { interactionId: 'semantic-choice-wrong-actor', reason: 'missing-actions' },
            }],
        })]);
    });

    it('simple-choice 的目标授予语义会让 AI 把正面 token 给自己而不是敌人', async () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        state.core.activePlayerId = '0';
        state.sys.phase = 'main1';
        injectSimpleChoicePrompt(state, {
            id: 'ai-choice-targeted-buff',
            playerId: '0',
            title: 'interaction.chooseTarget',
            sourceId: 'generic-targeted-buff',
            options: [
                {
                    id: 'buff-self',
                    label: '给自己飞行',
                    value: {
                        value: 0,
                        targetPlayerId: '0',
                        tokenGrantConfig: { tokenId: TOKEN_IDS.FLIGHT, amount: 1 },
                    },
                },
                {
                    id: 'buff-enemy',
                    label: '给敌人飞行',
                    value: {
                        value: 1,
                        targetPlayerId: '1',
                        tokenGrantConfig: { tokenId: TOKEN_IDS.FLIGHT, amount: 1 },
                    },
                },
            ],
        });

        const actions = buildDiceThroneAiLegalActions({
            playerId: '0',
            state,
        });
        const selfAction = actions.find((action) => action.metadata?.optionId === 'buff-self');
        const enemyAction = actions.find((action) => action.metadata?.optionId === 'buff-enemy');

        expect(selfAction?.aiHints?.some((hint) =>
            (hint.effectIntent === 'buff' || hint.effectIntent === 'resource')
            && hint.relationToActor === 'self'
        )).toBe(true);
        expect(enemyAction?.aiHints?.some((hint) =>
            (hint.effectIntent === 'buff' || hint.effectIntent === 'resource')
            && hint.relationToActor === 'enemy'
        )).toBe(true);

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test-targeted-buff',
            seatControllers: {
                '0': { type: 'local-ai' },
            },
        });

        expect(resolution?.action.metadata?.optionId).toBe('buff-self');
    });

    it('simple-choice 支持 grant 自带目标，AI 不需要从 label/customId 猜状态作用对象', async () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        state.core.activePlayerId = '0';
        state.sys.phase = 'main1';
        injectSimpleChoicePrompt(state, {
            id: 'ai-choice-config-targeted-debuff',
            playerId: '0',
            title: 'interaction.chooseEffect',
            sourceId: 'generic-config-targeted-debuff',
            options: [
                {
                    id: 'apply-enemy',
                    label: '让目标获得火药桶',
                    value: {
                        value: 1,
                        statusGrantConfig: {
                            statusId: STATUS_IDS.POWDER_KEG,
                            amount: 1,
                            targetPlayerId: '1',
                        },
                    },
                },
                {
                    id: 'apply-self',
                    label: '让自己获得火药桶',
                    value: {
                        value: 0,
                        statusGrantConfig: {
                            statusId: STATUS_IDS.POWDER_KEG,
                            amount: 1,
                            targetPlayerId: '0',
                        },
                    },
                },
            ],
        });

        const actions = buildDiceThroneAiLegalActions({
            playerId: '0',
            state,
        });
        const enemyAction = actions.find((action) => action.metadata?.optionId === 'apply-enemy');
        const selfAction = actions.find((action) => action.metadata?.optionId === 'apply-self');

        expect(enemyAction?.aiHints?.some((hint) =>
            hint.effectIntent === 'debuff' && hint.relationToActor === 'enemy'
        )).toBe(true);
        expect(selfAction?.aiHints?.some((hint) =>
            hint.effectIntent === 'debuff' && hint.relationToActor === 'self'
        )).toBe(true);

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test-config-targeted-debuff',
            seatControllers: {
                '0': { type: 'local-ai' },
            },
        });

        expect(resolution?.action.metadata?.optionId).toBe('apply-enemy');
    });

    it('本地 AI 在敌方单选交互中优先选择更低血量的目标', async () => {
        const state = createInitializedState(['0', '1', '2', '3'], fixedRandom);
        state.core.players['1'].resources[RESOURCE_IDS.HP] = 30;
        state.core.players['3'].resources[RESOURCE_IDS.HP] = 8;

        const interaction: InteractionDescriptor = {
            id: 'ai-select-player-low-hp',
            playerId: '0',
            sourceCardId: 'moon-shadow-strike',
            type: 'selectPlayer',
            titleKey: 'interaction.selectPlayer',
            selectCount: 1,
            selected: [],
            targetPlayerIds: ['1', '3'],
        };
        injectPendingInteraction(state, interaction);

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '0': { type: 'local-ai' },
            },
        });

        expect(resolution?.action.kind).toBe('interaction-select-player');
        expect(resolution?.action.commands[0]).toEqual({
            type: 'RESOLVE_INTERACTION',
            payload: { selectedPlayerIds: ['3'] },
        });
    });

    it('本地 AI 在全体候选的增益选人交互里优先选择更需要增益的队友', async () => {
        const state = createInitializedState(['0', '1', '2', '3'], fixedRandom);
        state.core.players['0'].resources[RESOURCE_IDS.HP] = 40;
        state.core.players['2'].resources[RESOURCE_IDS.HP] = 9;

        const interaction: InteractionDescriptor = {
            id: 'ai-select-friendly-buff-target',
            playerId: '0',
            sourceCardId: 'card-consecrate',
            type: 'selectPlayer',
            titleKey: 'interaction.selectPlayerForConsecrate',
            selectCount: 1,
            selected: [],
            targetPlayerIds: ['0', '1', '2', '3'],
            tokenGrantConfigs: [
                { tokenId: TOKEN_IDS.PROTECT, amount: 1 },
                { tokenId: TOKEN_IDS.RETRIBUTION, amount: 1 },
                { tokenId: TOKEN_IDS.CRIT, amount: 1 },
                { tokenId: TOKEN_IDS.ACCURACY, amount: 1 },
            ],
        };
        injectPendingInteraction(state, interaction);

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '0': { type: 'local-ai' },
            },
        });

        expect(resolution?.action.kind).toBe('interaction-select-player');
        expect(resolution?.action.commands[0]).toEqual({
            type: 'RESOLVE_INTERACTION',
            payload: { selectedPlayerIds: ['2'] },
        });
    });

    it('本地 AI 在移除全部状态交互里优先清理净收益更高的目标', async () => {
        const state = createInitializedState(['0', '1', '2', '3'], fixedRandom);
        state.core.players['0'].statusEffects[STATUS_IDS.BURN] = 1;
        state.core.players['3'].tokens[TOKEN_IDS.CRIT] = 1;
        state.core.players['3'].tokens[TOKEN_IDS.PROTECT] = 1;

        const interaction: InteractionDescriptor = {
            id: 'ai-select-best-cleanse-target',
            playerId: '0',
            sourceCardId: 'card-what-status',
            type: 'selectPlayer',
            titleKey: 'interaction.selectPlayerToRemoveAllStatus',
            selectCount: 1,
            selected: [],
            targetPlayerIds: ['0', '1', '2', '3'],
            requiresTargetWithStatus: true,
        };
        injectPendingInteraction(state, interaction);

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '0': { type: 'local-ai' },
            },
        });

        expect(resolution?.action.kind).toBe('interaction-select-player');
        expect(resolution?.action.commands[0]).toEqual({
            type: 'RESOLVE_INTERACTION',
            payload: { selectedPlayerIds: ['3'] },
        });
    });

    it('移除全部状态交互不会误移除诅咒金币这类不可移除状态', () => {
        const state = createHeroMatchup('cursed_pirate', 'zhanshujia')(['0', '1'], fixedRandom);
        state.core.players['0'].statusEffects[STATUS_IDS.CURSED_COIN] = 2;
        state.core.players['0'].statusEffects[STATUS_IDS.BURN] = 1;

        const interaction: InteractionDescriptor = {
            id: 'remove-all-status-but-keep-cursed-coin',
            playerId: '1',
            sourceCardId: 'card-what-status',
            type: 'selectPlayer',
            titleKey: 'interaction.selectPlayerToRemoveAllStatus',
            selectCount: 1,
            selected: [],
            targetPlayerIds: ['0'],
            requiresTargetWithStatus: true,
        };
        injectPendingInteraction(state, interaction);

        const next = execCmd(state, cmd('RESOLVE_INTERACTION', '1', { selectedPlayerIds: ['0'] }));
        expect(next.core.players['0'].statusEffects[STATUS_IDS.BURN] ?? 0).toBe(0);
        expect(next.core.players['0'].statusEffects[STATUS_IDS.CURSED_COIN]).toBe(2);
    });

    it('dt:card-interaction 的 selectStatus 交互应生成 REMOVE_STATUS 动作', () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        state.core.players['1'].statusEffects.poison = 1;

        const interaction: InteractionDescriptor = {
            id: 'ai-select-status',
            playerId: '0',
            sourceCardId: 'remove-status-test',
            type: 'selectStatus',
            titleKey: 'interaction.selectStatusToRemove',
            selectCount: 1,
            selected: [],
            targetPlayerIds: ['1'],
        };
        injectPendingInteraction(state, interaction);

        const actions = buildDiceThroneAiLegalActions({
            playerId: '0',
            state,
        });

        expect(actions).toContainEqual(expect.objectContaining({
            kind: 'interaction-remove-status',
            commands: [{
                type: 'REMOVE_STATUS',
                payload: { targetPlayerId: '1', statusId: 'poison' },
            }],
            metadata: expect.objectContaining({
                strategyTags: ['purify-control'],
            }),
        }));
    });

    it('REMOVE_STATUS 指定状态时只移除一层状态', () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        state.core.players['1'].statusEffects[STATUS_IDS.POISON] = 3;
        injectPendingInteraction(state, {
            id: 'remove-one-status-stack',
            playerId: '0',
            sourceCardId: 'remove-status-test',
            type: 'selectStatus',
            titleKey: 'interaction.selectStatusToRemove',
            selectCount: 1,
            selected: [],
            targetPlayerIds: ['1'],
        });

        const next = execCmd(state, cmd('REMOVE_STATUS', '0', {
            targetPlayerId: '1',
            statusId: STATUS_IDS.POISON,
        }));

        expect(next.core.players['1'].statusEffects[STATUS_IDS.POISON]).toBe(2);
    });

    it('REMOVE_STATUS 指定僧侣气这类多层标记时只移除一层', () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        state.core.players['1'].tokens[TOKEN_IDS.TAIJI] = 5;
        injectPendingInteraction(state, {
            id: 'remove-one-token-stack',
            playerId: '0',
            sourceCardId: 'remove-status-test',
            type: 'selectStatus',
            titleKey: 'interaction.selectStatusToRemove',
            selectCount: 1,
            selected: [],
            targetPlayerIds: ['1'],
        });

        const next = execCmd(state, cmd('REMOVE_STATUS', '0', {
            targetPlayerId: '1',
            statusId: TOKEN_IDS.TAIJI,
        }));

        expect(next.core.players['1'].tokens[TOKEN_IDS.TAIJI]).toBe(4);
    });

    it('带 transferConfig 的 selectStatus 交互应生成 TRANSFER_STATUS 动作', () => {
        const state = createInitializedState(['0', '1', '2'], fixedRandom);
        state.core.players['1'].statusEffects.poison = 1;

        const interaction: InteractionDescriptor = {
            id: 'ai-transfer-status',
            playerId: '0',
            sourceCardId: 'transfer-status-test',
            type: 'selectStatus',
            titleKey: 'interaction.selectStatusToTransfer',
            selectCount: 1,
            selected: [],
            targetPlayerIds: ['0', '1', '2'],
            transferConfig: {},
        };
        injectPendingInteraction(state, interaction);

        const actions = buildDiceThroneAiLegalActions({
            playerId: '0',
            state,
        });

        expect(actions).toContainEqual(expect.objectContaining({
            kind: 'interaction-transfer-status',
            commands: [{
                type: 'TRANSFER_STATUS',
                payload: { fromPlayerId: '1', toPlayerId: '0', statusId: 'poison' },
            }],
            metadata: expect.objectContaining({
                strategyTags: ['purify-control'],
            }),
        }));
        expect(actions).toContainEqual(expect.objectContaining({
            kind: 'interaction-transfer-status',
            commands: [{
                type: 'TRANSFER_STATUS',
                payload: { fromPlayerId: '1', toPlayerId: '2', statusId: 'poison' },
            }],
            metadata: expect.objectContaining({
                strategyTags: ['purify-control'],
            }),
        }));
    });


    it('本地 AI 在 remove-status 交互里优先移除己方减益，而不是敌方减益', async () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        state.core.players['0'].statusEffects[STATUS_IDS.BURN] = 1;
        state.core.players['1'].statusEffects[STATUS_IDS.POISON] = 1;
        state.core.players['0'].resources[RESOURCE_IDS.HP] = 12;
        state.core.players['1'].resources[RESOURCE_IDS.HP] = 28;

        const interaction: InteractionDescriptor = {
            id: 'ai-remove-own-debuff-first',
            playerId: '0',
            sourceCardId: 'remove-status-test',
            type: 'selectStatus',
            titleKey: 'interaction.selectStatusToRemove',
            selectCount: 1,
            selected: [],
            targetPlayerIds: ['0', '1'],
        };
        injectPendingInteraction(state, interaction);

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '0': { type: 'local-ai' },
            },
        });

        expect(resolution?.action.kind).toBe('interaction-remove-status');
        expect(resolution?.action.commands[0]).toEqual({
            type: 'REMOVE_STATUS',
            payload: { targetPlayerId: '0', statusId: STATUS_IDS.BURN },
        });
    });

    it('本地 AI 只有敌方减益可移除时不应浪费移除状态牌', async () => {
        const state = createSetupWithHand(['card-get-away'], {
            cp: 1,
            mutate: (core) => {
                core.activePlayerId = '0';
                core.players['1'].statusEffects[STATUS_IDS.BURN] = 1;
            },
        })(['0', '1'], fixedRandom);

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:avoid-negative-status-card',
            seatControllers: {
                '0': { type: 'local-ai' },
            },
        });

        expect(resolution?.playerId).toBe('0');
        expect(resolution?.action.kind).toBe('advance-phase');
    });

    it('本地 AI 有己方减益可清理时仍应出移除状态牌', async () => {
        const state = createSetupWithHand(['card-get-away'], {
            cp: 1,
            mutate: (core) => {
                core.activePlayerId = '0';
                core.players['0'].statusEffects[STATUS_IDS.BURN] = 1;
            },
        })(['0', '1'], fixedRandom);

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:keep-positive-status-card',
            seatControllers: {
                '0': { type: 'local-ai' },
            },
        });

        expect(resolution?.playerId).toBe('0');
        expect(resolution?.action.kind).toBe('play-card');
        expect(resolution?.action.metadata).toMatchObject({ cardId: 'card-get-away' });
    });

    it('remove-status 交互会带 purify-control tag，并让通用 strategy profile scorer 参与评分', async () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        state.core.players['0'].statusEffects[STATUS_IDS.BURN] = 1;
        state.core.players['1'].tokens[TOKEN_IDS.PROTECT] = 1;
        state.core.players['0'].resources[RESOURCE_IDS.HP] = 12;

        const interaction: InteractionDescriptor = {
            id: 'ai-remove-status-strategy-tag',
            playerId: '0',
            sourceCardId: 'remove-status-test',
            type: 'selectStatus',
            titleKey: 'interaction.selectStatusToRemove',
            selectCount: 1,
            selected: [],
            targetPlayerIds: ['0', '1'],
        };
        injectPendingInteraction(state, interaction);

        const context = buildAiDecisionContext({
            gameId: 'dicethrone',
            matchId: 'dicethrone-remove-status-strategy-tag',
            playerId: '0',
            visibleState: state,
            rulesVersion: null,
            decisionBudgetMs: 250,
            source: 'local',
            seatController: { type: 'local-ai', difficulty: 'expert' },
        });

        const decision = await diceThroneAiRuntime.localPolicies.baseline.decide(context);
        const ownCleanupAction = context.legalActions.find((action) => {
            const command = action.commands[0];
            if (action.kind !== 'interaction-remove-status' || command?.type !== 'REMOVE_STATUS') return false;
            const payload = command.payload as { targetPlayerId?: string; statusId?: string } | undefined;
            return payload?.targetPlayerId === '0' && payload?.statusId === STATUS_IDS.BURN;
        });
        const evaluations = (decision?.providerMetadata?.evaluations ?? []) as Array<{
            actionId: string;
            contributions: Array<{ scorerId: string; score: number }>;
        }>;
        const ownCleanupEval = evaluations.find((item) => item.actionId === ownCleanupAction?.actionId);

        expect(ownCleanupAction?.metadata?.strategyTags).toEqual(['purify-control']);
        expect(ownCleanupEval?.contributions.some((item) => item.scorerId === 'strategy-profile-fit' && item.score > 0)).toBe(true);
    });

    it('本地 AI 在 transfer-status 交互里优先把己方减益转给低血量敌人', async () => {
        const state = createInitializedState(['0', '1', '2', '3'], fixedRandom);
        state.core.players['0'].statusEffects[STATUS_IDS.POISON] = 1;
        state.core.players['1'].resources[RESOURCE_IDS.HP] = 8;
        state.core.players['3'].resources[RESOURCE_IDS.HP] = 30;

        const interaction: InteractionDescriptor = {
            id: 'ai-transfer-own-debuff-to-enemy',
            playerId: '0',
            sourceCardId: 'transfer-status-test',
            type: 'selectStatus',
            titleKey: 'interaction.selectStatusToTransfer',
            selectCount: 1,
            selected: [],
            targetPlayerIds: ['0', '1', '2', '3'],
            transferConfig: {},
        };
        injectPendingInteraction(state, interaction);

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '0': { type: 'local-ai' },
            },
        });

        expect(resolution?.action.kind).toBe('interaction-transfer-status');
        expect(resolution?.action.commands[0]).toEqual({
            type: 'TRANSFER_STATUS',
            payload: { fromPlayerId: '0', toPlayerId: '1', statusId: STATUS_IDS.POISON },
        });
    });

    it('线上反馈 6a98e4b5：transfer-status 合法动作应能执行并关闭交互', () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        state.core.players['0'].tokens[TOKEN_IDS.PROTECT] = 1;
        state.core.players['1'].tokens[TOKEN_IDS.PROTECT] = 0;

        const interaction: InteractionDescriptor = {
            id: 'dt-interaction-card-transfer-status-feedback',
            playerId: '1',
            sourceCardId: 'card-transfer-status',
            type: 'selectStatus',
            titleKey: 'interaction.selectStatusToTransfer',
            selectCount: 1,
            selected: [],
            targetPlayerIds: ['0', '1'],
            transferConfig: {},
        };
        injectPendingInteraction(state, interaction);

        const actions = buildDiceThroneAiLegalActions({
            playerId: '1',
            state,
        });
        const transferProtect = actions.find((action) => {
            const command = action.commands[0];
            return action.kind === 'interaction-transfer-status'
                && command?.type === 'TRANSFER_STATUS'
                && (command.payload as { fromPlayerId?: string; toPlayerId?: string; statusId?: string })?.fromPlayerId === '0'
                && (command.payload as { fromPlayerId?: string; toPlayerId?: string; statusId?: string })?.toPlayerId === '1'
                && (command.payload as { fromPlayerId?: string; toPlayerId?: string; statusId?: string })?.statusId === TOKEN_IDS.PROTECT;
        });

        expect(transferProtect).toBeDefined();
        const result = tryCmd(state, cmd('TRANSFER_STATUS', '1', {
            fromPlayerId: '0',
            toPlayerId: '1',
            statusId: TOKEN_IDS.PROTECT,
        }));

        expect(result.success).toBe(true);
        expect(result.state.core.players['0'].tokens[TOKEN_IDS.PROTECT]).toBe(0);
        expect(result.state.core.players['1'].tokens[TOKEN_IDS.PROTECT]).toBe(1);
        expect(result.state.sys.interaction?.current).toBeUndefined();
    });


    it('本地 AI 在 selectTargetStatus 交互里会把已选中的己方减益转给更脆弱的敌人', async () => {
        const state = createInitializedState(['0', '1', '2', '3'], fixedRandom);
        state.core.players['0'].statusEffects[STATUS_IDS.POISON] = 1;
        state.core.players['1'].resources[RESOURCE_IDS.HP] = 7;
        state.core.players['3'].resources[RESOURCE_IDS.HP] = 26;

        const interaction: InteractionDescriptor = {
            id: 'ai-transfer-selected-status-target',
            playerId: '0',
            sourceCardId: 'transfer-status-test',
            type: 'selectTargetStatus',
            titleKey: 'interaction.selectTransferTarget',
            selectCount: 1,
            selected: [],
            targetPlayerIds: ['0', '1', '3'],
            transferConfig: {
                sourcePlayerId: '0',
                statusId: STATUS_IDS.POISON,
            },
        };
        injectPendingInteraction(state, interaction);

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '0': { type: 'local-ai' },
            },
        });

        expect(resolution?.action.kind).toBe('interaction-transfer-status');
        expect(resolution?.action.commands[0]).toEqual({
            type: 'TRANSFER_STATUS',
            payload: { fromPlayerId: '0', toPlayerId: '1', statusId: STATUS_IDS.POISON },
        });
    });

    it('TRANSFER_STATUS 只转移状态效果的一层，而不是整组层数', () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        state.core.players['0'].statusEffects[STATUS_IDS.POISON] = 3;

        const command: TransferStatusCommand = {
            type: 'TRANSFER_STATUS',
            playerId: '0',
            payload: { fromPlayerId: '0', toPlayerId: '1', statusId: STATUS_IDS.POISON },
            timestamp: Date.now(),
        };
        const events = DiceThroneDomain.execute(state, command, fixedRandom);
        const nextCore = events.reduce((core, event) => DiceThroneDomain.reduce(core, event), state.core);

        expect(events.find(event => event.type === 'STATUS_REMOVED')?.payload).toMatchObject({
            targetId: '0',
            statusId: STATUS_IDS.POISON,
            stacks: 1,
        });
        expect(events.find(event => event.type === 'STATUS_APPLIED')?.payload).toMatchObject({
            targetId: '1',
            statusId: STATUS_IDS.POISON,
            stacks: 1,
        });
        expect(nextCore.players['0'].statusEffects[STATUS_IDS.POISON]).toBe(2);
        expect(nextCore.players['1'].statusEffects[STATUS_IDS.POISON]).toBe(1);
    });

    it('TRANSFER_STATUS 只转移标记的一层，两个闪避只会转走一个', () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        state.core.players['0'].tokens[TOKEN_IDS.EVASIVE] = 2;
        state.core.players['1'].tokens[TOKEN_IDS.EVASIVE] = 0;

        const command: TransferStatusCommand = {
            type: 'TRANSFER_STATUS',
            playerId: '0',
            payload: { fromPlayerId: '0', toPlayerId: '1', statusId: TOKEN_IDS.EVASIVE },
            timestamp: Date.now(),
        };
        const events = DiceThroneDomain.execute(state, command, fixedRandom);
        const nextCore = events.reduce((core, event) => DiceThroneDomain.reduce(core, event), state.core);

        expect(events.find(event => event.type === 'TOKEN_CONSUMED')?.payload).toMatchObject({
            playerId: '0',
            tokenId: TOKEN_IDS.EVASIVE,
            amount: 1,
            newTotal: 1,
        });
        expect(events.find(event => event.type === 'TOKEN_GRANTED')?.payload).toMatchObject({
            targetId: '1',
            tokenId: TOKEN_IDS.EVASIVE,
            amount: 1,
            newTotal: 1,
        });
        expect(nextCore.players['0'].tokens[TOKEN_IDS.EVASIVE]).toBe(1);
        expect(nextCore.players['1'].tokens[TOKEN_IDS.EVASIVE]).toBe(1);
    });

    it('selectDie 多骰交互应枚举 1..selectCount 的合法骰子组合，而不是只生成单骰动作', () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        state.core.dice = state.core.dice.slice(0, 3).map((die, index) => ({
            ...die,
            id: index,
            value: [1, 2, 5][index],
        }));

        const interaction: InteractionDescriptor = {
            id: 'ai-select-dice-multi',
            playerId: '0',
            sourceCardId: 'reroll-two-test',
            type: 'selectDie',
            titleKey: 'interaction.selectDiceToReroll',
            selectCount: 2,
            selected: [],
        };
        injectPendingInteraction(state, interaction);

        const actions = buildDiceThroneAiLegalActions({
            playerId: '0',
            state,
        });

        const rerollPayloads = actions
            .filter((action) => action.kind === 'interaction-multistep')
            .map((action) => action.commands
                .filter((command) => command.type === 'REROLL_DIE')
                .map((command) => (command.payload as { dieId: number }).dieId)
                .join(','))
            .sort();

        expect(rerollPayloads).toEqual([
            '0',
            '0,1',
            '0,2',
            '1',
            '1,2',
            '2',
        ]);
    });

    it('AI selectDie 允许重复时应枚举同一颗骰子重复重掷', () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        state.core.dice = state.core.dice.slice(0, 2).map((die, index) => ({
            ...die,
            id: index,
            value: [1, 6][index],
        }));

        injectPendingInteraction(state, {
            id: 'ai-select-dice-repeatable',
            playerId: '0',
            sourceCardId: 'reroll-two-repeatable-test',
            type: 'selectDie',
            titleKey: 'interaction.selectDiceToReroll',
            selectCount: 2,
            selected: [],
            allowRepeatedDieSelection: true,
        });

        const rerollPayloads = buildDiceThroneAiLegalActions({ playerId: '0', state })
            .filter((action) => action.kind === 'interaction-multistep')
            .map((action) => action.commands
                .filter((command) => command.type === 'REROLL_DIE')
                .map((command) => (command.payload as { dieId: number }).dieId)
                .join(','))
            .sort();

        expect(rerollPayloads).toEqual([
            '0',
            '0,0',
            '0,1',
            '1',
            '1,1',
        ]);
    });

    it('AI selectDie 允许重复且已完成一步时只生成剩余一步，可再次选择同一骰', () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        state.core.dice = state.core.dice.slice(0, 2).map((die, index) => ({
            ...die,
            id: index,
            value: [1, 6][index],
        }));

        injectPendingInteraction(state, {
            id: 'ai-select-dice-repeatable-remaining',
            playerId: '0',
            sourceCardId: 'reroll-two-repeatable-test',
            type: 'selectDie',
            titleKey: 'interaction.selectDiceToReroll',
            selectCount: 2,
            selected: [],
            allowRepeatedDieSelection: true,
            completedDieIds: [0],
            completedSteps: 1,
        });

        const rerollPayloads = buildDiceThroneAiLegalActions({ playerId: '0', state })
            .filter((action) => action.kind === 'interaction-multistep')
            .map((action) => action.commands
                .filter((command) => command.type === 'REROLL_DIE')
                .map((command) => (command.payload as { dieId: number }).dieId)
                .join(','))
            .sort();

        expect(rerollPayloads).toEqual(['0', '1']);
    });

    it('AI selectDie 默认不可重复且已完成一步时只生成剩余未完成骰子', () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        state.core.dice = state.core.dice.slice(0, 3).map((die, index) => ({
            ...die,
            id: index,
            value: [1, 2, 5][index],
        }));

        injectPendingInteraction(state, {
            id: 'ai-select-dice-non-repeatable-remaining',
            playerId: '0',
            sourceCardId: 'reroll-two-test',
            type: 'selectDie',
            titleKey: 'interaction.selectDiceToReroll',
            selectCount: 2,
            selected: [],
            completedDieIds: [0],
        });

        const rerollPayloads = buildDiceThroneAiLegalActions({ playerId: '0', state })
            .filter((action) => action.kind === 'interaction-multistep')
            .map((action) => action.commands
                .filter((command) => command.type === 'REROLL_DIE')
                .map((command) => (command.payload as { dieId: number }).dieId)
                .join(','))
            .sort();

        expect(rerollPayloads).toEqual(['1', '2']);
    });

    it('本地 AI 在 selectDie=2 时应优先一次处理两颗低点骰，而不是只选第一颗', async () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        state.core.dice = state.core.dice.slice(0, 3).map((die, index) => ({
            ...die,
            id: index,
            value: [1, 2, 6][index],
        }));

        const interaction: InteractionDescriptor = {
            id: 'ai-select-dice-low-values',
            playerId: '0',
            sourceCardId: 'reroll-two-test',
            type: 'selectDie',
            titleKey: 'interaction.selectDiceToReroll',
            selectCount: 2,
            selected: [],
        };
        injectPendingInteraction(state, interaction);

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '0': { type: 'local-ai' },
            },
        });

        expect(resolution?.action.kind).toBe('interaction-multistep');
        expect(
            resolution?.action.commands
                .filter((command) => command.type === 'REROLL_DIE')
                .map((command) => (command.payload as { dieId: number }).dieId),
        ).toEqual([0, 1]);
    });

    it('targetOpponentDice 的 selectDie=2 应优先重掷对手高点骰子', async () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        state.core.dice = state.core.dice.slice(0, 3).map((die, index) => ({
            ...die,
            id: index,
            value: [1, 5, 6][index],
        }));

        const interaction: InteractionDescriptor = {
            id: 'ai-select-opponent-dice-high',
            playerId: '0',
            sourceCardId: 'reroll-opponent-dice-test',
            type: 'selectDie',
            titleKey: 'interaction.selectDiceToReroll',
            selectCount: 2,
            selected: [],
            diceOwnerId: '1',
            targetOpponentDice: true,
        };
        injectPendingInteraction(state, interaction);

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '0': { type: 'local-ai' },
            },
        });

        expect(resolution?.action.kind).toBe('interaction-multistep');
        expect(
            resolution?.action.commands
                .filter((command) => command.type === 'REROLL_DIE')
                .map((command) => (command.payload as { dieId: number }).dieId),
        ).toEqual([1, 2]);
    });

    it('线上反馈：main1 中抬一手应从当前奖励骰区枚举可重掷骰子，而不是空选项取消', () => {
        const state = createInitializedState(['0', '1', '2', '3'], fixedRandom);
        state.sys.phase = 'main1';
        state.core.activePlayerId = '0';
        state.core.dice = [];
        state.core.rollDiceCount = 0;
        state.core.rollCount = 0;
        state.core.rollConfirmed = false;
        const settlement = {
            id: 'online-card-give-hand-bonus',
            sourceAbilityId: 'card-give-hand',
            attackerId: '0',
            targetId: '3',
            dice: [{ index: 0, value: 6, face: 'fist' }],
            rerollCostTokenId: '',
            rerollCostAmount: 0,
            rerollCount: 0,
            readyToSettle: false,
            allowDiceModification: true,
        } satisfies PendingBonusDiceSettlement;
        state.core.pendingBonusDiceSettlement = settlement;
        state.core.currentRollContext = createBonusRollContextFromSettlement(state.core, settlement);
        injectRawBlockingInteraction(state, {
            id: 'dt-dice-select-card-give-hand-online',
            kind: 'multistep-choice',
            playerId: '3',
            data: {
                title: 'interaction.selectDiceToReroll',
                sourceId: 'card-give-hand',
                minSteps: 1,
                initialResult: { selectedDiceIds: [] },
                allowedDieIds: [0],
                meta: {
                    dtType: 'selectDie',
                    selectCount: 1,
                    diceOwnerId: '0',
                    targetOpponentDice: true,
                },
            },
        });

        const actions = buildDiceThroneAiLegalActions({ playerId: '3', state });
        const rerollAction = actions.find((action) => (
            action.kind === 'interaction-multistep'
            && action.commands.some((command) => (
                command.type === 'REROLL_DIE'
                && (command.payload as { dieId?: number }).dieId === 0
            ))
        ));

        expect(actions).not.toContainEqual(expect.objectContaining({
            kind: 'interaction-cancel',
            metadata: expect.objectContaining({ reason: 'empty-options' }),
        }));
        expect(rerollAction).toBeDefined();
    });

    it('线上反馈：main1 中抬一手应从已确认普通骰区生成可执行重掷，而不是空选项取消', () => {
        const state = createInitializedState(['0', '1', '2', '3'], fixedRandom);
        state.sys.phase = 'main1';
        state.core.activePlayerId = '0';
        state.core.rollCount = 1;
        state.core.rollLimit = 3;
        state.core.rollDiceCount = 5;
        state.core.rollConfirmed = true;
        state.core.dice = state.core.dice.slice(0, 5).map((die, index) => ({
            ...die,
            id: index,
            value: [6, 5, 4, 2, 1][index],
            ownerId: '0',
            isKept: false,
        }));
        delete state.core.currentRollContext;
        injectRawBlockingInteraction(state, {
            id: 'dt-dice-select-card-give-hand-confirmed-main-roll',
            kind: 'multistep-choice',
            playerId: '1',
            data: {
                title: 'interaction.selectDiceToReroll',
                sourceId: 'card-give-hand',
                minSteps: 1,
                initialResult: { selectedDiceIds: [] },
                allowedDieIds: [0, 1, 2, 3, 4],
                meta: {
                    dtType: 'selectDie',
                    selectCount: 1,
                    diceOwnerId: '0',
                    targetOpponentDice: true,
                },
            },
        });

        const actions = buildDiceThroneAiLegalActions({ playerId: '1', state });
        const rerollAction = actions.find((action) => (
            action.kind === 'interaction-multistep'
            && action.commands.some((command) => command.type === 'REROLL_DIE')
        ));
        const rerollCommand = rerollAction?.commands.find((command) => command.type === 'REROLL_DIE');

        expect(actions).not.toContainEqual(expect.objectContaining({
            kind: 'interaction-cancel',
            metadata: expect.objectContaining({ reason: 'empty-options' }),
        }));
        expect(rerollCommand).toBeDefined();
        const result = tryCmd(
            state,
            cmd('REROLL_DIE', '1', rerollCommand?.payload as Record<string, unknown>),
            createQueuedRandom([3]),
        );
        expect(result.success).toBe(true);
    });

    it('modifyDie copy 双骰交互应生成有顺序的源骰→目标骰批动作，而不是单骰确认', () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        state.core.dice = state.core.dice.slice(0, 3).map((die, index) => ({
            ...die,
            id: index,
            value: [6, 2, 4][index],
        }));

        const interaction: InteractionDescriptor = {
            id: 'ai-copy-die-multi',
            playerId: '0',
            sourceCardId: 'copy-die-test',
            type: 'modifyDie',
            titleKey: 'interaction.selectDieToCopy',
            selectCount: 2,
            selected: [],
            dieModifyConfig: { mode: 'copy' },
        };
        injectPendingInteraction(state, interaction);

        const actions = buildDiceThroneAiLegalActions({
            playerId: '0',
            state,
        });

        const modifyPayloads = actions
            .filter((action) => action.kind === 'interaction-multistep')
            .map((action) => action.commands
                .filter((command) => command.type === 'MODIFY_DIE')
                .map((command) => {
                    const payload = command.payload as { dieId: number; newValue: number };
                    return `${payload.dieId}:${payload.newValue}`;
                })
                .join(','))
            .sort();

        expect(modifyPayloads).toEqual([
            '0:6,1:6',
            '0:6,2:6',
            '1:2,0:2',
            '1:2,2:2',
            '2:4,0:4',
            '2:4,1:4',
        ]);
    });

    it('modifyDie set 双骰交互应生成两条改骰命令后再确认，而不是单骰确认', () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        state.core.dice = state.core.dice.slice(0, 3).map((die, index) => ({
            ...die,
            id: index,
            value: [1, 2, 5][index],
        }));

        injectPendingInteraction(state, {
            id: 'ai-set-two-dice',
            playerId: '0',
            sourceCardId: 'set-two-dice-test',
            type: 'modifyDie',
            titleKey: 'interaction.selectDiceToModify',
            selectCount: 2,
            selected: [],
            dieModifyConfig: { mode: 'set', targetValue: 6 },
        });

        const actions = buildDiceThroneAiLegalActions({
            playerId: '0',
            state,
        }).filter((action) => action.kind === 'interaction-multistep');

        expect(actions.length).toBeGreaterThan(0);
        expect(actions.every((action) =>
            action.commands.filter((command) => command.type === 'MODIFY_DIE').length === 2
        )).toBe(true);
        expect(actions.every((action) =>
            action.commands.at(-1)?.type === 'SYS_INTERACTION_CONFIRM'
        )).toBe(true);
        expect(actions.some((action) =>
            action.commands
                .filter((command) => command.type === 'MODIFY_DIE')
                .map((command) => {
                    const payload = command.payload as { dieId: number; newValue: number };
                    return `${payload.dieId}:${payload.newValue}`;
                })
                .join(',') === '0:6,1:6'
        )).toBe(true);
    });

    it('AI modifyDie 已完成一步时只生成剩余一步，不再按总额度继续改两颗', () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        state.core.dice = state.core.dice.slice(0, 3).map((die, index) => ({
            ...die,
            id: index,
            value: [1, 2, 5][index],
        }));

        injectPendingInteraction(state, {
            id: 'ai-modify-any-two-remaining',
            playerId: '0',
            sourceCardId: 'modify-any-two-test',
            type: 'modifyDie',
            titleKey: 'interaction.selectDiceToModify',
            selectCount: 2,
            selected: [],
            dieModifyConfig: { mode: 'any' },
            completedDieIds: [0],
        });

        const actions = buildDiceThroneAiLegalActions({ playerId: '0', state })
            .filter((action) => action.kind === 'interaction-multistep');

        expect(actions.length).toBeGreaterThan(0);
        expect(actions.every((action) =>
            action.commands.filter((command) => command.type === 'MODIFY_DIE').length === 1
        )).toBe(true);
        expect(actions.every((action) =>
            action.commands
                .filter((command) => command.type === 'MODIFY_DIE')
                .every((command) => (command.payload as { dieId: number }).dieId !== 0)
        )).toBe(true);
    });

    it('modifyDie set 双骰交互未达到最少步数时服务端不应允许提前确认', () => {
        let state = createInitializedState(['0', '1'], fixedRandom);
        state.core.dice = state.core.dice.slice(0, 3).map((die, index) => ({
            ...die,
            id: index,
            value: [1, 2, 5][index],
        }));

        injectPendingInteraction(state, {
            id: 'set-two-dice-confirm-gate',
            playerId: '0',
            sourceCardId: 'set-two-dice-test',
            type: 'modifyDie',
            titleKey: 'interaction.selectDiceToModify',
            selectCount: 2,
            selected: [],
            dieModifyConfig: { mode: 'set', targetValue: 6 },
        });

        state = execCmd(state, cmd('MODIFY_DIE', '0', { dieId: 0, newValue: 6 }));

        const prompt = getMultistepChoicePrompt(state, 'set-two-dice-test');
        expect(prompt.completedSteps).toBe(1);
        expect(prompt.minSteps).toBe(2);

        const earlyConfirm = tryCmd(state, cmd('SYS_INTERACTION_CONFIRM', '0'));
        expect(earlyConfirm.success).toBe(false);
        expect(earlyConfirm.error).toContain('多步交互尚未达到最少步骤数');
    });

    it('DiceThrone 改骰与重掷交互应由确认按钮收口，不应选满后自动确认', () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        state.sys.phase = 'offensiveRoll';
        const system = createDiceThroneEventSystem();

        const runInteractionRequest = (interaction: InteractionDescriptor) => {
            const requested: DiceThroneEvent = {
                type: 'INTERACTION_REQUESTED',
                payload: { interaction },
                timestamp: 200,
            } as DiceThroneEvent;
            const result = system.afterEvents?.({
                state,
                events: [requested],
                random: fixedRandom,
            } as any);
            if (!result || Array.isArray(result) || !('state' in result)) {
                throw new Error('未创建骰子交互');
            }
            const current = (result.state as MatchState<DiceThroneCore>).sys.interaction.current;
            if (current?.kind !== 'multistep-choice') {
                throw new Error('未创建 multistep-choice 骰子交互');
            }
            return current.data as any;
        };

        const setData = runInteractionRequest({
            id: 'manual-set-die',
            playerId: '0',
            sourceCardId: 'set-die-test',
            type: 'modifyDie',
            titleKey: 'interaction.selectDieToModify',
            selectCount: 1,
            selected: [],
            dieModifyConfig: { mode: 'set', targetValue: 6 },
        });
        expect(setData.maxSteps).toBeUndefined();
        expect(setData.minSteps).toBe(1);

        const rerollData = runInteractionRequest({
            id: 'manual-select-die',
            playerId: '0',
            sourceCardId: 'reroll-die-test',
            type: 'selectDie',
            titleKey: 'interaction.selectDiceToReroll',
            selectCount: 1,
            selected: [],
        });
        expect(rerollData.maxSteps).toBeUndefined();
        expect(rerollData.minSteps).toBe(1);
        expect(rerollData.confirmationMode).toBeUndefined();

        const repeatedRerollData = runInteractionRequest({
            id: 'manual-repeatable-select-die',
            playerId: '0',
            sourceCardId: 'reroll-repeatable-test',
            type: 'selectDie',
            titleKey: 'interaction.selectDiceToReroll',
            selectCount: 2,
            selected: [],
            allowRepeatedDieSelection: true,
        });
        expect(repeatedRerollData.maxSteps).toBe(2);
        expect(repeatedRerollData.minSteps).toBe(1);
        expect(repeatedRerollData.confirmationMode).toBe('submitBatch');
    });

    it('copy 交互不能把同值骰当作源骰和目标骰，避免 AI 消耗牌但骰面不变', () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        state.core.dice = state.core.dice.slice(0, 3).map((die, index) => ({
            ...die,
            id: index,
            value: 4,
        }));

        injectPendingInteraction(state, {
            id: 'ai-copy-die-no-effective-target',
            playerId: '0',
            sourceCardId: 'copy-die-test',
            type: 'modifyDie',
            titleKey: 'interaction.selectDieToCopy',
            selectCount: 2,
            selected: [],
            dieModifyConfig: { mode: 'copy' },
        });

        const actions = buildDiceThroneAiLegalActions({ playerId: '0', state });
        expect(actions).toHaveLength(1);
        expect(actions[0]).toMatchObject({
            kind: 'interaction-cancel',
            metadata: { reason: 'no-effective-copy-target' },
        });
        expect(actions[0]?.commands).toEqual([expect.objectContaining({
                type: 'SYS_INTERACTION_CANCEL',
                payload: expect.objectContaining({ reason: 'no-effective-copy-target' }),
            })]);
    });

    it('targetOpponentDice 的 copy 交互应优先复制低点数压制对手骰面', async () => {
        const state = createHeroMatchup('monk', 'paladin')(['0', '1'], fixedRandom);
        state.sys.phase = 'offensiveRoll';
        state.core.dice = state.core.dice.slice(0, 3).map((die, index) => ({
            ...die,
            id: index,
            value: [6, 1, 4][index],
            symbol: ['lotus', 'fist', 'taiji'][index],
            symbols: [['lotus'], ['fist'], ['taiji']][index],
        }));

        const interaction: InteractionDescriptor = {
            id: 'ai-copy-opponent-dice-low',
            playerId: '0',
            sourceCardId: 'copy-opponent-die-test',
            type: 'modifyDie',
            titleKey: 'interaction.selectDieToCopy',
            selectCount: 2,
            selected: [],
            dieModifyConfig: { mode: 'copy' },
            diceOwnerId: '1',
            targetOpponentDice: true,
        };
        injectPendingInteraction(state, interaction);

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '0': { type: 'local-ai' },
            },
        });

        const modifyCommands = resolution?.action.commands
            .filter((command) => command.type === 'MODIFY_DIE')
            .map((command) => command.payload as { dieId: number; newValue: number }) ?? [];

        expect(modifyCommands.length).toBeGreaterThan(0);
        expect(modifyCommands.every((command) => command.newValue === 1)).toBe(true);
        expect(modifyCommands.some((command) => command.dieId === 1)).toBe(true);
    });

    it('copy 交互在 offensiveRoll 应优先复制到更接近技能线的值，而不是一味抬高点数', async () => {
        const state = createHeroMatchup('monk', 'paladin')(['0', '1'], fixedRandom);
        state.sys.phase = 'offensiveRoll';
        state.core.activePlayerId = '0';
        state.core.rollCount = 1;
        state.core.rollLimit = 1;
        state.core.rollDiceCount = 5;
        state.core.rollConfirmed = false;
        state.core.dice = state.core.dice.slice(0, 5).map((die, index) => ({
            ...die,
            id: index,
            value: [1, 1, 3, 6, 6][index],
            symbol: ['fist', 'fist', 'palm', 'lotus', 'lotus'][index],
            symbols: [['fist'], ['fist'], ['palm'], ['lotus'], ['lotus']][index],
        }));

        const interaction: InteractionDescriptor = {
            id: 'ai-copy-self-plan-aware',
            playerId: '0',
            sourceCardId: 'copy-self-plan-test',
            type: 'modifyDie',
            titleKey: 'interaction.selectDieToCopy',
            selectCount: 2,
            selected: [],
            dieModifyConfig: { mode: 'copy' },
            diceOwnerId: '0',
            targetOpponentDice: false,
        };
        injectPendingInteraction(state, interaction);

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '0': { type: 'local-ai' },
            },
        });

        const modifyCommands = resolution?.action.commands
            .filter((command) => command.type === 'MODIFY_DIE')
            .map((command) => command.payload as { dieId: number; newValue: number }) ?? [];

        expect(modifyCommands.some((command) => command.dieId >= 2 && command.newValue === 1)).toBe(true);
        expect(modifyCommands.some((command) => command.dieId === 0 || command.dieId === 1)).toBe(true);
    });

    it('targetOpponentDice 的 set 交互应优先压低高点骰子', async () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        state.core.dice = state.core.dice.slice(0, 3).map((die, index) => ({
            ...die,
            id: index,
            value: [6, 2, 3][index],
        }));

        const interaction: InteractionDescriptor = {
            id: 'ai-set-opponent-dice-low',
            playerId: '0',
            sourceCardId: 'set-opponent-die-test',
            type: 'modifyDie',
            titleKey: 'interaction.selectDieToSet',
            selectCount: 1,
            selected: [],
            dieModifyConfig: { mode: 'set', targetValue: 1 },
            diceOwnerId: '1',
            targetOpponentDice: true,
        };
        injectPendingInteraction(state, interaction);

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '0': { type: 'local-ai' },
            },
        });

        const modifyCommand = resolution?.action.commands.find((command) => command.type === 'MODIFY_DIE');
        expect(modifyCommand?.payload).toEqual({ dieId: 0, newValue: 1 });
    });

    it('any 模式交互不应选择对当前骰面无变化的空操作', async () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        state.core.dice = state.core.dice.slice(0, 3).map((die, index) => ({
            ...die,
            id: index,
            value: [6, 2, 3][index],
        }));

        const interaction: InteractionDescriptor = {
            id: 'ai-any-self-no-noop',
            playerId: '0',
            sourceCardId: 'modify-any-self-test',
            type: 'modifyDie',
            titleKey: 'interaction.selectDieToChange',
            selectCount: 1,
            selected: [],
            dieModifyConfig: { mode: 'any' },
            diceOwnerId: '0',
            targetOpponentDice: false,
        };
        injectPendingInteraction(state, interaction);

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '0': { type: 'local-ai' },
            },
        });

        const modifyCommand = resolution?.action.commands.find((command) => command.type === 'MODIFY_DIE');
        expect(modifyCommand?.payload).toEqual({ dieId: 1, newValue: 6 });
    });

    it('targetOpponentDice 的 any 交互应实际改变对手关键骰面，而不是保留 6 点不变', async () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        state.core.dice = state.core.dice.slice(0, 3).map((die, index) => ({
            ...die,
            id: index,
            value: [6, 2, 3][index],
        }));

        const interaction: InteractionDescriptor = {
            id: 'ai-any-opponent-lower',
            playerId: '0',
            sourceCardId: 'modify-any-opponent-test',
            type: 'modifyDie',
            titleKey: 'interaction.selectDieToChange',
            selectCount: 1,
            selected: [],
            dieModifyConfig: { mode: 'any' },
            diceOwnerId: '1',
            targetOpponentDice: true,
        };
        injectPendingInteraction(state, interaction);

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '0': { type: 'local-ai' },
            },
        });

        const modifyCommand = resolution?.action.commands.find((command) => command.type === 'MODIFY_DIE');
        expect(modifyCommand).toBeDefined();
        expect((modifyCommand?.payload as { dieId: number; newValue: number }).dieId).toBe(0);
        expect((modifyCommand?.payload as { dieId: number; newValue: number }).newValue).not.toBe(6);
    });

    it('targetOpponentDice 的 adjust 交互应生成向下调整方案，而不是只能 +1', async () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        state.core.dice = state.core.dice.slice(0, 3).map((die, index) => ({
            ...die,
            id: index,
            value: [1, 4, 6][index],
        }));

        const interaction: InteractionDescriptor = {
            id: 'ai-adjust-opponent-dice-low',
            playerId: '0',
            sourceCardId: 'adjust-opponent-die-test',
            type: 'modifyDie',
            titleKey: 'interaction.selectDieToAdjust',
            selectCount: 1,
            selected: [],
            dieModifyConfig: { mode: 'adjust' },
            diceOwnerId: '1',
            targetOpponentDice: true,
        };
        injectPendingInteraction(state, interaction);

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '0': { type: 'local-ai' },
            },
        });

        const modifyCommand = resolution?.action.commands.find((command) => command.type === 'MODIFY_DIE');
        expect(modifyCommand).toBeDefined();
        const payload = modifyCommand?.payload as { dieId: number; newValue: number };
        const originalValue = state.core.dice.find((die) => die.id === payload.dieId)?.value ?? 0;
        expect(payload.newValue).toBeLessThan(originalValue);
    });

    it('simple-choice exact-multi 交互应枚举所有合法组合，而不是固定前两个选项', () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        state.sys.interaction = {
            ...state.sys.interaction,
            current: {
                id: 'ai-simple-choice-multi',
                kind: 'simple-choice',
                playerId: '0',
                data: {
                    sourceId: 'test_multi_simple_choice',
                    options: [
                        { id: 'opt-a', label: '选项 A' },
                        { id: 'opt-b', label: '选项 B' },
                        { id: 'opt-c', label: '选项 C' },
                    ],
                    multi: { min: 2, max: 2 },
                },
            } as any,
        };

        const actions = buildDiceThroneAiLegalActions({
            playerId: '0',
            state,
        });

        const payloads = actions
            .filter((action) => action.kind === 'interaction-choice')
            .map((action) => ((action.commands[0]?.payload as { optionIds?: string[] } | undefined)?.optionIds ?? []).join(','))
            .sort();

        expect(payloads).toEqual([
            'opt-a,opt-b',
            'opt-a,opt-c',
            'opt-b,opt-c',
        ]);
    });

    it('本地 AI runner 在真人未选角前不应抢先选角', async () => {
        const core = DiceThroneDomain.setup(['0', '1'], fixedRandom);
        core.seatControllers = {
            '0': { type: 'human' },
            '1': { type: 'local-ai' },
        };
        const state: MatchState<DiceThroneCore> = {
            core,
            sys: {
                phase: 'setup',
                interaction: { queue: [] },
            } as MatchState<DiceThroneCore>['sys'],
        };

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '1': { type: 'local-ai' },
            },
        });

        expect(resolution).toBeNull();
    });

    it('本地 AI runner 应在真人完成选角后再选择角色', async () => {
        const core = DiceThroneDomain.setup(['0', '1'], fixedRandom);
        core.selectedCharacters['0'] = 'monk';
        core.seatControllers = {
            '0': { type: 'human' },
            '1': { type: 'local-ai' },
        };
        const state: MatchState<DiceThroneCore> = {
            core,
            sys: {
                phase: 'setup',
                interaction: { queue: [] },
            } as MatchState<DiceThroneCore>['sys'],
        };

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '1': { type: 'local-ai' },
            },
        });

        expect(resolution?.playerId).toBe('1');
        expect(resolution?.action.kind).toBe('setup-select-character');
        expect(resolution?.action.commands[0]).toMatchObject({
            type: 'SELECT_CHARACTER',
        });
        const selectedCharacterId = (resolution?.action.commands[0]?.payload as { characterId?: string } | undefined)?.characterId;
        expect(DICETHRONE_CHARACTER_CATALOG.map((item) => item.id)).toContain(selectedCharacterId);
        expect(DICETHRONE_PLAYER_VISIBLE_CHARACTER_CATALOG.map((item) => item.id)).toContain(selectedCharacterId);
        expect(selectedCharacterId).not.toBe('monk');
        expect(selectedCharacterId).not.toBe('lieren');
        expect(selectedCharacterId).not.toBe('vampire_lord');
    });

    it('setup 阶段应避开已被其他玩家选走的角色', () => {
        const core = DiceThroneDomain.setup(['0', '1'], fixedRandom);
        core.selectedCharacters['0'] = 'monk';

        const state: MatchState<DiceThroneCore> = {
            core,
            sys: {
                phase: 'setup',
                interaction: { queue: [] },
            } as MatchState<DiceThroneCore>['sys'],
        };

        const actions = buildDiceThroneAiLegalActions({
            playerId: '1',
            state,
        });

        const selectableCharacterIds = actions
            .filter((action) => action.kind === 'setup-select-character')
            .map((action) => (action.commands[0]?.payload as { characterId?: string } | undefined)?.characterId);

        expect(selectableCharacterIds.length).toBeGreaterThan(0);
        expect(selectableCharacterIds).not.toContain('monk');
        expect(selectableCharacterIds).toContain('vampire_lord');
    });

    it('setup 阶段直接选择实施中吸血鬼领主应成功', () => {
        const core = DiceThroneDomain.setup(['0', '1'], fixedRandom);
        const state: MatchState<DiceThroneCore> = {
            core,
            sys: {
                ...createInitialSystemState(['0', '1'], testSystems, undefined),
                phase: 'setup',
            },
        };

        const result = tryCmd(state, cmd('SELECT_CHARACTER', '0', { characterId: 'vampire_lord' }));

        expect(result.success).toBe(true);
        expect((result.state as MatchState<DiceThroneCore>).core.selectedCharacters['0']).toBe('vampire_lord');
    });

    it('玩家选择 AI 已选角色时，应释放 AI 角色并让 AI 重新准备', () => {
        const core = DiceThroneDomain.setup(['0', '1'], fixedRandom, {
            seatControllers: {
                '0': { type: 'human' },
                '1': { type: 'local-ai' },
            },
        });
        core.selectedCharacters['1'] = 'monk';
        core.readyPlayers['1'] = true;
        core.players['1'] = {
            ...core.players['1'],
            characterId: 'monk',
        };
        const state: MatchState<DiceThroneCore> = {
            core,
            sys: {
                ...createInitialSystemState(['0', '1'], testSystems, undefined),
                phase: 'setup',
            },
        };

        const result = tryCmd(state, cmd('SELECT_CHARACTER', '0', { characterId: 'monk' }));

        expect(result.success).toBe(true);
        const nextState = result.state as MatchState<DiceThroneCore>;
        expect(nextState.core.selectedCharacters['0']).toBe('monk');
        expect(nextState.core.selectedCharacters['1']).toBe('unselected');
        expect(nextState.core.readyPlayers['1']).toBe(false);
        expect(nextState.core.players['1']?.characterId).toBe('unselected');
    });

    it('本地 AI 在已选角色后应进入准备动作，而不是重复选角', () => {
        const core = DiceThroneDomain.setup(['0', '1'], fixedRandom);
        core.selectedCharacters['1'] = 'monk';

        const state: MatchState<DiceThroneCore> = {
            core,
            sys: {
                phase: 'setup',
                interaction: { queue: [] },
            } as MatchState<DiceThroneCore>['sys'],
        };

        const actions = buildDiceThroneAiLegalActions({
            playerId: '1',
            state,
        });

        expect(actions.some((action) => action.kind === 'setup-select-character')).toBe(false);
        expect(actions).toContainEqual(expect.objectContaining({
            kind: 'setup-ready',
        }));
    });

    it('本地 AI 在 main1 应优先打出可用升级牌而不是直接推进阶段', async () => {
        const state = createSetupWithHand(['card-storm-assault-2'], { cp: 1 })(['0', '1'], fixedRandom);

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '0': { type: 'local-ai' },
            },
        });

        expect(resolution?.playerId).toBe('0');
        expect(resolution?.action.kind).toBe('play-upgrade-card');
        expect(resolution?.action.commands[0]).toMatchObject({
            type: 'PLAY_UPGRADE_CARD',
            payload: {
                cardId: 'card-storm-assault-2',
                targetAbilityId: 'thunder-strike',
            },
        });
    });

    it('本地 AI 在 defensiveRoll 已选防御技能后应直接掷骰，而不是重复选择技能', async () => {
        const state = createHeroMatchup('monk', 'shadow_thief')(['0', '1'], fixedRandom);
        state.sys.phase = 'defensiveRoll';
        state.core.rollCount = 0;
        state.core.pendingAttack = {
            attackerId: '0',
            defenderId: '1',
            isDefendable: true,
            sourceAbilityId: 'fist-technique-5',
            defenseAbilityId: 'shadow-defense',
        };

        const actions = buildDiceThroneAiLegalActions({
            playerId: '1',
            state,
        });
        expect(actions.some((action) => action.kind === 'select-ability')).toBe(false);
        expect(actions).toContainEqual(expect.objectContaining({
            kind: 'roll-dice',
        }));

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '1': { type: 'local-ai' },
            },
        });

        expect(resolution?.playerId).toBe('1');
        expect(resolution?.action.kind).toBe('roll-dice');
        expect(resolution?.action.commands[0]).toMatchObject({
            type: 'ROLL_DICE',
        });
    });

    it('抢手 AI 在 defensiveRoll 已选决斗后应正常掷防御骰，而不是卡在无合法动作', async () => {
        const state = createHeroMatchup('monk', 'gunslinger')(['0', '1'], fixedRandom);
        state.sys.phase = 'defensiveRoll';
        state.core.rollCount = 0;
        state.core.rollLimit = 1;
        state.core.rollDiceCount = 1;
        state.core.rollConfirmed = false;
        state.core.dice = state.core.dice.slice(0, 1);
        state.core.pendingAttack = {
            attackerId: '0',
            defenderId: '1',
            isDefendable: true,
            sourceAbilityId: 'fist-technique-5',
            defenseAbilityId: 'duel',
        };

        const actions = buildDiceThroneAiLegalActions({
            playerId: '1',
            state,
        });
        expect(actions.some((action) => action.kind === 'select-ability')).toBe(false);
        expect(actions).toContainEqual(expect.objectContaining({
            kind: 'roll-dice',
        }));

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:gunslinger-defense-roll',
            seatControllers: {
                '1': { type: 'local-ai' },
            },
        });

        expect(resolution?.playerId).toBe('1');
        expect(resolution?.action.kind).toBe('roll-dice');
        expect(resolution?.action.commands[0]).toMatchObject({
            type: 'ROLL_DICE',
        });
    });

    it('防御阶段掷骰后若已选防御技能，AI 不应再暴露 select-ability，避免循环切换', () => {
        const state = createHeroMatchup('monk', 'shadow_thief')(['0', '1'], fixedRandom);
        state.sys.phase = 'defensiveRoll';
        state.core.rollCount = 1;
        state.core.rollLimit = 1;
        state.core.rollDiceCount = 4;
        state.core.rollConfirmed = false;
        state.core.dice = state.core.dice.slice(0, 4);
        state.core.pendingAttack = {
            attackerId: '0',
            defenderId: '1',
            isDefendable: true,
            sourceAbilityId: 'fist-technique-5',
            defenseAbilityId: 'fearless-riposte',
        };

        const actions = buildDiceThroneAiLegalActions({
            playerId: '1',
            state,
        });
        const abilityIds = actions
            .filter((action) => action.kind === 'select-ability')
            .map((action) => action.metadata?.abilityId);

        expect(abilityIds).toEqual([]);
        expect(actions.some((action) => action.kind === 'confirm-roll')).toBe(true);
        expect(actions.some((action) => action.kind === 'advance-phase')).toBe(false);
        expect(tryCmd(state, cmd('ADVANCE_PHASE', '1')).success).toBe(false);
    });

    it('本地 AI 在 defensiveRoll 骰面已确认且最终防御技能已选定后应推进阶段，而不是重复确认或重复选技能', async () => {
        const state = createHeroMatchup('monk', 'shadow_thief')(['0', '1'], fixedRandom);
        state.sys.phase = 'defensiveRoll';
        state.core.rollCount = 1;
        state.core.rollLimit = 1;
        state.core.rollDiceCount = 4;
        state.core.rollConfirmed = true;
        state.core.dice = state.core.dice.slice(0, 4);
        state.core.pendingAttack = {
            attackerId: '0',
            defenderId: '1',
            isDefendable: true,
            sourceAbilityId: 'fist-technique-5',
            defenseAbilityId: 'shadow-defense',
        };

        const actions = buildDiceThroneAiLegalActions({
            playerId: '1',
            state,
        });
        expect(actions.some((action) => action.kind === 'select-ability')).toBe(false);
        expect(actions.some((action) => action.kind === 'confirm-roll')).toBe(false);
        expect(actions).toContainEqual(expect.objectContaining({
            kind: 'advance-phase',
        }));

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '1': { type: 'local-ai' },
            },
        });

        expect(resolution?.playerId).toBe('1');
        expect(resolution?.action.kind).toBe('advance-phase');
        expect(resolution?.action.commands[0]).toMatchObject({
            type: 'ADVANCE_PHASE',
        });
    });

    it('本地 AI 在 defensiveRoll 应能连续自动执行到离开防御阶段，而不是在重复动作上卡住', async () => {
        const random = createQueuedRandom([1, 1, 1, 1]);
        let state = createHeroMatchup('monk', 'shadow_thief')(['0', '1'], random);
        state.sys.phase = 'defensiveRoll';
        state.core.rollCount = 0;
        state.core.rollLimit = 1;
        state.core.rollDiceCount = 0;
        state.core.rollConfirmed = false;
        state.core.pendingAttack = {
            attackerId: '0',
            defenderId: '1',
            isDefendable: true,
            sourceAbilityId: 'fist-technique-5',
            defenseAbilityId: 'shadow-defense',
        };

        const executedKinds: string[] = [];
        for (let step = 0; step < 3; step += 1) {
            const resolution = await resolveNextLocalAiAction({
                engineConfig,
                state,
                matchId: 'local:test',
                seatControllers: {
                    '1': { type: 'local-ai' },
                },
            });

            expect(resolution?.playerId).toBe('1');
            expect(resolution?.action).toBeTruthy();
            executedKinds.push(resolution!.action.kind);

            for (const command of resolution!.action.commands) {
                state = execCmd(
                    state,
                    cmd(command.type as CommandInput['type'], resolution!.playerId, command.payload ?? {}),
                    random,
                );
            }
        }

        expect(executedKinds).toEqual(['roll-dice', 'confirm-roll', 'advance-phase']);
        expect(state.sys.phase).toBe('main2');
    });

    it('本地 AI 在四人 targetingRoll 应能继续掷目标骰并推进，而不是 idle 卡思考', async () => {
        const playerIds = ['0', '1', '2', '3'] as const;
        const random = createQueuedRandom([1, 1, 1, 1, 1, 2]);
        let state = createNoResponseSetup()(playerIds as unknown as string[], random);

        const setupCommands: CommandInput[] = [
            ...advanceTo('offensiveRoll', '0'),
            cmd('ROLL_DICE', '0'),
            cmd('CONFIRM_ROLL', '0'),
            cmd('SELECT_ABILITY', '0', { abilityId: 'fist-technique-5' }),
            cmd('ADVANCE_PHASE', '0'),
        ];

        for (const input of setupCommands) {
            const result = executePipeline(
                pipelineConfig,
                state,
                { type: input.type, playerId: input.playerId, payload: input.payload, timestamp: Date.now() },
                random,
                [...playerIds],
            );
            expect(result.success).toBe(true);
            state = result.state as MatchState<DiceThroneCore>;
        }

        expect(state.sys.phase).toBe('targetingRoll');

        const initialActions = buildDiceThroneAiLegalActions({
            playerId: '0',
            state,
        });
        expect(initialActions.some((action) => action.kind === 'roll-dice')).toBe(true);
        expect(initialActions.some((action) => action.kind === 'select-ability')).toBe(false);

        const executedKinds: string[] = [];
        for (let step = 0; step < 3; step += 1) {
            const resolution = await resolveNextLocalAiAction({
                engineConfig,
                state,
                matchId: 'local:test',
                seatControllers: {
                    '0': { type: 'local-ai' },
                },
            });

            expect(resolution?.playerId).toBe('0');
            expect(resolution?.action).toBeTruthy();
            executedKinds.push(resolution!.action.kind);

            for (const command of resolution!.action.commands) {
                const result = executePipeline(
                    pipelineConfig,
                    state,
                    {
                        type: command.type,
                        playerId: resolution!.playerId,
                        payload: command.payload ?? {},
                        timestamp: Date.now(),
                    },
                    random,
                    [...playerIds],
                );
                expect(result.success).toBe(true);
                state = result.state as MatchState<DiceThroneCore>;
            }
        }

        expect(executedKinds).toEqual(['roll-dice', 'confirm-roll', 'advance-phase']);
        expect(state.sys.phase).toBe('defensiveRoll');
        expect(state.core.pendingAttack?.defenderId).toBe('3');
    });

    it('本地 AI 在四人 targetingRoll 掷出 5 时，应替防守方选定受击目标而不是停住', async () => {
        const playerIds = ['0', '1', '2', '3'] as const;
        const random = createQueuedRandom([1, 1, 1, 1, 1, 5]);
        let state = createNoResponseSetup()(playerIds as unknown as string[], random);

        for (const player of Object.values(state.core.players)) {
            player.hand = [];
            player.deck = [];
            player.discard = [];
        }

        const setupCommands: CommandInput[] = [
            ...advanceTo('offensiveRoll', '0'),
            cmd('ROLL_DICE', '0'),
            cmd('CONFIRM_ROLL', '0'),
            cmd('SELECT_ABILITY', '0', { abilityId: 'fist-technique-5' }),
            cmd('ADVANCE_PHASE', '0'),
            cmd('ROLL_DICE', '0'),
            cmd('CONFIRM_ROLL', '0'),
            cmd('ADVANCE_PHASE', '0'),
        ];

        for (const input of setupCommands) {
            const result = executePipeline(
                pipelineConfig,
                state,
                { type: input.type, playerId: input.playerId, payload: input.payload, timestamp: Date.now() },
                random,
                [...playerIds],
            );
            expect(result.success).toBe(true);
            state = result.state as MatchState<DiceThroneCore>;
        }

        expect(state.sys.phase).toBe('targetingRoll');
        expect(getCurrentInteractionSummary(state)).toMatchObject({
            kind: 'dt:defender-choice',
            playerId: '3',
        });

        const legalActions = buildDiceThroneAiLegalActions({
            playerId: '3',
            state,
        });
        expect(legalActions.some((action) =>
            action.commands.some((command) => command.type === 'SELECT_DEFENDER_TARGET')
        )).toBe(true);

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '3': { type: 'local-ai' },
            },
        });

        expect(resolution?.playerId).toBe('3');
        expect(resolution?.action).toBeTruthy();
        expect(resolution?.action.commands).toHaveLength(1);
        expect(resolution?.action.commands[0]?.type).toBe('SELECT_DEFENDER_TARGET');
        expect(['1', '3']).toContain(resolution?.action.commands[0]?.payload?.defenderId);

        const result = executePipeline(
            pipelineConfig,
            state,
            {
                type: resolution!.action.commands[0]!.type,
                playerId: resolution!.playerId,
                payload: resolution!.action.commands[0]!.payload ?? {},
                timestamp: Date.now(),
            },
            random,
            [...playerIds],
        );
        expect(result.success).toBe(true);
        state = result.state as MatchState<DiceThroneCore>;

        expect(state.sys.phase).toBe('defensiveRoll');
        expect(['1', '3']).toContain(state.core.pendingAttack?.defenderId);
    });

    it('本地 AI 在四人 targetingRoll 掷出 6 时，应替进攻方选定受击目标而不是停住', async () => {
        const playerIds = ['0', '1', '2', '3'] as const;
        const random = createQueuedRandom([1, 1, 1, 1, 1, 6]);
        let state = createNoResponseSetup()(playerIds as unknown as string[], random);

        for (const player of Object.values(state.core.players)) {
            player.hand = [];
            player.deck = [];
            player.discard = [];
        }

        const setupCommands: CommandInput[] = [
            ...advanceTo('offensiveRoll', '0'),
            cmd('ROLL_DICE', '0'),
            cmd('CONFIRM_ROLL', '0'),
            cmd('SELECT_ABILITY', '0', { abilityId: 'fist-technique-5' }),
            cmd('ADVANCE_PHASE', '0'),
            cmd('ROLL_DICE', '0'),
            cmd('CONFIRM_ROLL', '0'),
            cmd('ADVANCE_PHASE', '0'),
        ];

        for (const input of setupCommands) {
            const result = executePipeline(
                pipelineConfig,
                state,
                { type: input.type, playerId: input.playerId, payload: input.payload, timestamp: Date.now() },
                random,
                [...playerIds],
            );
            expect(result.success).toBe(true);
            state = result.state as MatchState<DiceThroneCore>;
        }

        expect(state.sys.phase).toBe('targetingRoll');
        expect(getCurrentInteractionSummary(state)).toMatchObject({
            kind: 'dt:defender-choice',
            playerId: '0',
        });

        const legalActions = buildDiceThroneAiLegalActions({
            playerId: '0',
            state,
        });
        expect(legalActions.some((action) =>
            action.commands.some((command) => command.type === 'SELECT_DEFENDER_TARGET')
        )).toBe(true);

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '0': { type: 'local-ai' },
            },
        });

        expect(resolution?.playerId).toBe('0');
        expect(resolution?.action).toBeTruthy();
        expect(resolution?.action.commands).toHaveLength(1);
        expect(resolution?.action.commands[0]?.type).toBe('SELECT_DEFENDER_TARGET');
        expect(['1', '2', '3']).toContain(resolution?.action.commands[0]?.payload?.defenderId);

        const result = executePipeline(
            pipelineConfig,
            state,
            {
                type: resolution!.action.commands[0]!.type,
                playerId: resolution!.playerId,
                payload: resolution!.action.commands[0]!.payload ?? {},
                timestamp: Date.now(),
            },
            random,
            [...playerIds],
        );
        expect(result.success).toBe(true);
        state = result.state as MatchState<DiceThroneCore>;

        expect(state.sys.phase).toBe('defensiveRoll');
        expect(['1', '2', '3']).toContain(state.core.pendingAttack?.defenderId);
    });

    it('本地 AI 在 displayOnly 奖励骰结算伴随响应与交互链时，应沿真实链路收口且不误生成 bonus-die 动作', async () => {
        const random = createQueuedRandom([1, 1, 1, 1]);
        let state = createHeroMatchup('monk', 'shadow_thief')(['0', '1'], random);
        state.core.activePlayerId = '0';
        state.sys.phase = 'defensiveRoll';
        state.core.players['1'].tokens[TOKEN_IDS.TAIJI] = 1;
        state.core.rollCount = 1;
        state.core.rollLimit = 1;
        state.core.rollDiceCount = 0;
        state.core.rollConfirmed = true;
        state.core.pendingAttack = {
            attackerId: '0',
            defenderId: '1',
            isDefendable: true,
            sourceAbilityId: 'fist-technique-5',
            defenseAbilityId: 'meditation',
        };
        (state.core as typeof state.core & { pendingBonusDiceSettlement?: unknown }).pendingBonusDiceSettlement = {
            id: 'display-only-bonus-hybrid',
            attackerId: '0',
            defenderId: '1',
            dice: [{ index: 0, value: 2 }],
            rerollCount: 0,
            displayOnly: true,
        };
        state.core.pendingDamage = {
            id: 'dmg-displayonly-hybrid',
            sourcePlayerId: '0',
            targetPlayerId: '1',
            originalDamage: 4,
            currentDamage: 4,
            responseType: 'beforeDamageReceived',
            responderId: '1',
            isFullyEvaded: false,
        };
        state.sys.responseWindow = {
            current: {
                id: 'rw-displayonly-hybrid',
                windowType: 'afterAttackResolved',
                responderQueue: ['1'],
                currentResponderIndex: 0,
                passedPlayers: [],
            },
        };

        const executedKinds: string[] = [];
        const assertNoBonusDieActions = () => {
            const actions = buildDiceThroneAiLegalActions({
                playerId: '1',
                state,
            });
            expect(actions.some((action) =>
                action.kind === 'bonus-die-reroll' || action.kind === 'confirm-roll'
            )).toBe(false);
        };

        assertNoBonusDieActions();

        const first = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test-displayonly-hybrid',
            seatControllers: {
                '1': { type: 'local-ai' },
            },
        });
        expect(first?.playerId).toBe('1');
        expect(first?.action.kind).toBe('token-response');
        executedKinds.push(first!.action.kind);
        for (const command of first!.action.commands) {
            state = execCmd(
                state,
                cmd(command.type as CommandInput['type'], first!.playerId, command.payload ?? {}),
                random,
            );
        }

        assertNoBonusDieActions();

        const second = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test-displayonly-hybrid',
            seatControllers: {
                '1': { type: 'local-ai' },
            },
        });
        expect(second?.playerId).toBe('1');
        expect(second?.action.kind).toBe('skip-token-response');
        executedKinds.push(second!.action.kind);
        for (const command of second!.action.commands) {
            state = execCmd(
                state,
                cmd(command.type as CommandInput['type'], second!.playerId, command.payload ?? {}),
                random,
            );
        }

        expect(state.core.pendingDamage).toBeUndefined();
        expect(state.sys.responseWindow?.current).toBeUndefined();

        injectPendingInteraction(state, {
            id: 'displayonly-chain-select-player',
            playerId: '1',
            sourceCardId: 'card-give-hand',
            type: 'selectPlayer',
            titleKey: 'interaction.selectPlayer',
            selectCount: 1,
            selected: [],
            targetPlayerIds: ['0'],
        });

        assertNoBonusDieActions();

        const third = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test-displayonly-hybrid',
            seatControllers: {
                '1': { type: 'local-ai' },
            },
        });
        expect(third?.playerId).toBe('1');
        expect(third?.action.kind).toBe('interaction-select-player');
        executedKinds.push(third!.action.kind);
        for (const command of third!.action.commands) {
            state = execCmd(
                state,
                cmd(command.type as CommandInput['type'], third!.playerId, command.payload ?? {}),
                random,
            );
        }

        // injectPendingInteraction 是测试注入态；AI 应生成真实的 RESOLVE_INTERACTION，
        // 但 pipeline 不会像真实运行时那样帮我们把这段测试注入的交互自动清掉。
        state.sys.interaction = {
            ...state.sys.interaction,
            current: undefined,
        };
        assertNoBonusDieActions();

        expect(executedKinds).toEqual([
            'token-response',
            'skip-token-response',
            'interaction-select-player',
        ]);
        expect((state.core as typeof state.core & { pendingBonusDiceSettlement?: { id?: string; displayOnly?: boolean } }).pendingBonusDiceSettlement)
            .toMatchObject({ id: 'display-only-bonus-hybrid', displayOnly: true });
    });

    it('本地 AI 在 offensiveRoll 且 pendingAttack 已创建时不应重复选择技能或重复确认骰面', async () => {
        const state = createHeroMatchup('monk', 'shadow_thief')(['0', '1'], fixedRandom);
        state.sys.phase = 'offensiveRoll';
        state.core.rollCount = 1;
        state.core.rollLimit = 3;
        state.core.rollDiceCount = 5;
        state.core.rollConfirmed = true;
        state.core.pendingAttack = {
            attackerId: '0',
            defenderId: '1',
            isDefendable: true,
            sourceAbilityId: 'fist-technique-5',
        };

        const actions = buildDiceThroneAiLegalActions({
            playerId: '0',
            state,
        });
        expect(actions.some((action) => action.kind === 'select-ability')).toBe(false);
        expect(actions.some((action) => action.kind === 'confirm-roll')).toBe(false);
        expect(actions).toContainEqual(expect.objectContaining({
            kind: 'advance-phase',
        }));

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '0': { type: 'local-ai' },
            },
        });

        expect(resolution?.playerId).toBe('0');
        expect(resolution?.action.kind).not.toBe('select-ability');
        expect(resolution?.action.kind).not.toBe('confirm-roll');
    });

    it('本地 AI 在太极响应窗口应执行一次 token 后跳过响应，并正确关闭窗口', async () => {
        const random = createQueuedRandom([1, 1]);
        let state = createHeroMatchup('monk', 'paladin')(['0', '1'], random);
        state.core.players['0'].tokens.taiji = 2;
        state.core.pendingDamage = {
            id: 'dmg-ai-token',
            sourcePlayerId: '0',
            targetPlayerId: '1',
            originalDamage: 5,
            currentDamage: 5,
            responseType: 'beforeDamageDealt',
            responderId: '0',
            isFullyEvaded: false,
        };
        state.sys.responseWindow = {
            current: {
                id: 'rw-token',
                windowType: 'afterAttackResolved',
                responderQueue: ['0'],
                currentResponderIndex: 0,
                passedPlayers: [],
            },
        };

        const executedKinds: string[] = [];
        const attemptKeys: string[] = [];
        for (let step = 0; step < 3; step += 1) {
            const resolution = await resolveNextLocalAiAction({
                engineConfig,
                state,
                matchId: 'local:test',
                seatControllers: {
                    '0': { type: 'local-ai' },
                },
            });

            expect(resolution?.playerId).toBe('0');
            expect(resolution?.action).toBeTruthy();
            expect(resolution?.attemptKey).toBeTruthy();
            executedKinds.push(resolution!.action.kind);
            attemptKeys.push(resolution!.attemptKey);

            for (const command of resolution!.action.commands) {
                state = execCmd(
                    state,
                    cmd(command.type as CommandInput['type'], resolution!.playerId, command.payload ?? {}),
                    random,
                );
            }
        }

        expect(executedKinds).toEqual(['token-response', 'token-response', 'skip-token-response']);
        expect(new Set(attemptKeys).size).toBe(3);
        expect(state.core.players['0'].tokens.taiji).toBe(0);
        expect(state.core.pendingDamage).toBeUndefined();
        expect(state.sys.interaction.current).toBeUndefined();
        expect(state.sys.responseWindow?.current).toBeUndefined();
        expect(state.core.activePlayerId).toBe('0');

        const next = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '0': { type: 'local-ai' },
            },
        });

        expect(next?.playerId).toBe('0');
        expect(next?.action.kind).toBe('advance-phase');
    });

    it('本地 AI 在致命伤害响应窗口应优先使用保命 token，而不是直接跳过响应', async () => {
        const state = createHeroMatchup('monk', 'paladin')(['0', '1'], fixedRandom);
        state.core.players['0'].tokens[TOKEN_IDS.TAIJI] = 1;
        state.core.players['0'].resources[RESOURCE_IDS.HP] = 2;
        state.core.pendingDamage = {
            id: 'dmg-ai-lethal-response',
            sourcePlayerId: '1',
            targetPlayerId: '0',
            originalDamage: 5,
            currentDamage: 5,
            responseType: 'beforeDamageReceived',
            responderId: '0',
            isFullyEvaded: false,
        };
        state.sys.responseWindow = {
            current: {
                id: 'rw-ai-lethal-response',
                windowType: 'afterAttackResolved',
                responderQueue: ['0'],
                currentResponderIndex: 0,
                passedPlayers: [],
            },
        };

        const legalActions = buildDiceThroneAiLegalActions({
            playerId: '0',
            state,
        });

        expect(legalActions.some((action) => action.kind === 'response-pass')).toBe(true);
        expect(legalActions.some((action) => action.kind === 'skip-token-response')).toBe(true);
        expect(legalActions.some((action) => action.kind === 'token-response')).toBe(true);

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '0': { type: 'local-ai' },
            },
        });

        expect(resolution?.playerId).toBe('0');
        expect(resolution?.action.kind).toBe('token-response');
        expect(resolution?.action.metadata).toMatchObject({
            tokenId: TOKEN_IDS.TAIJI,
        });
    });

    it('本地 AI 在武士 Honor 造成伤害前响应窗口应使用 Honor 增伤', async () => {
        const state = createHeroMatchup('gunslinger', 'samurai')(['0', '1'], fixedRandom);
        state.sys.phase = 'defensiveRoll';
        state.core.activePlayerId = '1';
        state.core.players['1'].tokens[TOKEN_IDS.HONOR] = 1;
        state.core.pendingAttack = {
            attackerId: '1',
            defenderId: '0',
            isDefendable: true,
            sourceAbilityId: 'wakizashi',
            damage: 4,
            bonusDamage: 0,
        };
        state.core.pendingDamage = {
            id: 'dmg-ai-honor-response',
            sourcePlayerId: '1',
            targetPlayerId: '0',
            originalDamage: 4,
            currentDamage: 4,
            sourceAbilityId: 'wakizashi',
            damageScope: 'attack',
            responseType: 'beforeDamageDealt',
            responderId: '1',
            isFullyEvaded: false,
        };
        state.sys.responseWindow = {
            current: null,
        };
        injectRawBlockingInteraction(state, {
            id: 'dt-token-response-dmg-ai-honor-response',
            kind: 'dt:token-response',
            playerId: '1',
        });

        const legalActions = buildDiceThroneAiLegalActions({
            playerId: '1',
            state,
        });

        expect(legalActions.some((action) => (
            action.kind === 'token-response'
            && action.commands.some((command) => (
                command.type === 'USE_TOKEN'
                && (command.payload as Record<string, unknown> | undefined)?.tokenId === TOKEN_IDS.HONOR
            ))
        ))).toBe(true);
        expect(legalActions.some((action) => action.kind === 'skip-token-response')).toBe(true);

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '1': { type: 'local-ai' },
            },
        });

        expect(resolution?.playerId).toBe('1');
        expect(resolution?.action.kind).toBe('token-response');
        expect(resolution?.action.metadata).toMatchObject({
            tokenId: TOKEN_IDS.HONOR,
        });
    });

    it('本地 AI 优先从 Token 响应 ChoiceRequest 合同生成合法动作', async () => {
        const state = createHeroMatchup('monk', 'paladin')(['0', '1'], fixedRandom);
        state.sys.phase = 'defensiveRoll';
        state.core.players['0'].tokens[TOKEN_IDS.TAIJI] = 1;
        state.core.players['0'].resources[RESOURCE_IDS.HP] = 2;
        const pendingDamage: PendingDamage = {
            id: 'dmg-ai-choice-request-token-response',
            sourcePlayerId: '1',
            targetPlayerId: '0',
            originalDamage: 5,
            currentDamage: 5,
            responseType: 'beforeDamageReceived',
            responderId: '0',
            isFullyEvaded: false,
        };
        state.core.pendingDamage = pendingDamage;
        const choiceRequestContract = buildTokenResponseChoiceRequestContract(state, pendingDamage);
        injectRawBlockingInteraction(state, {
            id: 'dt-token-response-dmg-ai-choice-request-token-response',
            kind: 'dt:token-response',
            playerId: '0',
            data: { choiceRequestContract },
        });

        const legalActions = buildDiceThroneAiLegalActions({
            playerId: '0',
            state,
        });

        expect(legalActions.some((action) => (
            action.kind === 'token-response'
            && action.metadata?.requestId === choiceRequestContract.requestId
            && action.metadata?.tokenId === TOKEN_IDS.TAIJI
        ))).toBe(true);
        expect(legalActions.some((action) => action.kind === 'skip-token-response')).toBe(true);

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '0': { type: 'local-ai' },
            },
        });

        expect(resolution?.playerId).toBe('0');
        expect(resolution?.action.kind).toBe('token-response');
        expect(resolution?.action.metadata).toMatchObject({
            requestId: choiceRequestContract.requestId,
            tokenId: TOKEN_IDS.TAIJI,
        });
    });

    it('Token 响应 ChoiceRequest 合同缺少某 Token 时，AI 不从 pendingDamage 私自补合法动作', () => {
        const state = createHeroMatchup('gunslinger', 'samurai')(['0', '1'], fixedRandom);
        state.sys.phase = 'defensiveRoll';
        state.core.activePlayerId = '1';
        state.core.players['1'].tokens[TOKEN_IDS.HONOR] = 1;
        const pendingDamage: PendingDamage = {
            id: 'dmg-ai-choice-request-restricted',
            sourcePlayerId: '1',
            targetPlayerId: '0',
            originalDamage: 4,
            currentDamage: 4,
            sourceAbilityId: 'wakizashi',
            damageScope: 'attack',
            responseType: 'beforeDamageDealt',
            responderId: '1',
            isFullyEvaded: false,
        };
        state.core.pendingDamage = pendingDamage;
        const choiceRequestContract = buildTokenResponseChoiceRequestContract(state, pendingDamage);
        injectRawBlockingInteraction(state, {
            id: 'dt-token-response-dmg-ai-choice-request-restricted',
            kind: 'dt:token-response',
            playerId: '1',
            data: {
                choiceRequestContract: {
                    ...choiceRequestContract,
                    candidates: choiceRequestContract.candidates.filter(candidate => candidate.id === 'skip'),
                },
            },
        });

        const legalActions = buildDiceThroneAiLegalActions({
            playerId: '1',
            state,
        });

        expect(legalActions.some((action) => action.kind === 'token-response')).toBe(false);
        expect(legalActions.some((action) => action.kind === 'skip-token-response')).toBe(true);
    });

    it('响应窗口被 pendingInteractionId 锁定时 AI 不应暴露 RESPONSE_PASS', () => {
        const state = createHeroMatchup('monk', 'paladin')(['0', '1'], fixedRandom);
        state.sys.phase = 'targetingRoll';
        state.sys.responseWindow = {
            current: {
                id: 'rw-ai-hidden-response-lock',
                windowType: 'afterAttackResolved',
                responderQueue: ['0'],
                currentResponderIndex: 0,
                passedPlayers: [],
                pendingInteractionId: 'hidden-after-attack-choice',
            },
        };

        const legalActions = buildDiceThroneAiLegalActions({
            playerId: '0',
            state,
        });

        expect(legalActions.some((action) => action.kind === 'response-pass')).toBe(false);
    });

    it('本地 AI 在多个防御 token 可用时，应优先选择保命收益更高的 token', async () => {
        const state = createHeroMatchup('monk', 'paladin')(['0', '1'], fixedRandom);
        state.core.players['0'].tokens[TOKEN_IDS.TAIJI] = 1;
        state.core.players['0'].tokens[TOKEN_IDS.EVASIVE] = 1;
        state.core.players['0'].resources[RESOURCE_IDS.HP] = 2;
        state.core.pendingDamage = {
            id: 'dmg-ai-token-tiebreak',
            sourcePlayerId: '1',
            targetPlayerId: '0',
            originalDamage: 5,
            currentDamage: 5,
            responseType: 'beforeDamageReceived',
            responderId: '0',
            isFullyEvaded: false,
        };
        state.sys.responseWindow = {
            current: {
                id: 'rw-ai-token-tiebreak',
                windowType: 'afterAttackResolved',
                responderQueue: ['0'],
                currentResponderIndex: 0,
                passedPlayers: [],
            },
        };

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '0': { type: 'local-ai' },
            },
        });

        expect(resolution?.playerId).toBe('0');
        expect(resolution?.action.kind).toBe('token-response');
        expect(resolution?.action.metadata).toMatchObject({
            tokenId: TOKEN_IDS.EVASIVE,
        });
    });

    it('本地 AI 在响应窗口同时拥有 token 与减伤牌时，应优先选择更稳妥的保命响应', async () => {
        const state = createHeroMatchup('monk', 'paladin')(['0', '1'], fixedRandom);
        state.core.players['0'].tokens[TOKEN_IDS.TAIJI] = 1;
        state.core.players['0'].tokens[TOKEN_IDS.EVASIVE] = 1;
        state.core.players['0'].resources[RESOURCE_IDS.HP] = 2;
        state.core.players['0'].resources[RESOURCE_IDS.CP] = 1;
        state.core.players['0'].hand = [getCardById('card-next-time')];
        state.core.pendingDamage = {
            id: 'dmg-ai-card-vs-token',
            sourcePlayerId: '1',
            targetPlayerId: '0',
            originalDamage: 6,
            currentDamage: 6,
            responseType: 'beforeDamageReceived',
            responderId: '0',
            isFullyEvaded: false,
        };
        state.sys.responseWindow = {
            current: {
                id: 'rw-ai-card-vs-token',
                windowType: 'afterAttackResolved',
                responderQueue: ['0'],
                currentResponderIndex: 0,
                passedPlayers: [],
            },
        };

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '0': { type: 'local-ai' },
            },
        });

        expect(resolution?.playerId).toBe('0');
        expect(resolution?.action.kind).toBe('response-play-card');
        expect(resolution?.action.metadata).toMatchObject({
            cardId: 'card-next-time',
        });
    });

    it('pendingDamage 仍存在但 responseWindow 已空时，本地 AI 仍应生成 token 响应动作', () => {
        const state = createHeroMatchup('monk', 'paladin')(['0', '1'], fixedRandom);
        state.core.players['0'].tokens[TOKEN_IDS.TAIJI] = 1;
        state.core.pendingDamage = {
            id: 'dmg-ai-token-no-window',
            sourcePlayerId: '1',
            targetPlayerId: '0',
            originalDamage: 4,
            currentDamage: 4,
            responseType: 'beforeDamageReceived',
            responderId: '0',
            isFullyEvaded: false,
        };
        state.sys.phase = 'defensiveRoll';
        state.sys.responseWindow = { current: undefined } as typeof state.sys.responseWindow;

        const legalActions = buildDiceThroneAiLegalActions({
            playerId: '0',
            state,
        });

        expect(legalActions.some((action) => action.kind === 'token-response')).toBe(true);
        expect(legalActions.some((action) => action.kind === 'skip-token-response')).toBe(true);
        expect(legalActions.some((action) => action.kind === 'advance-phase')).toBe(false);
    });

    it('攻击方 pendingDamage 仍存在但 responseWindow 已空时，本地 AI 仍应生成加伤或跳过动作', () => {
        const state = createHeroMatchup('treant', 'shadow_thief')(['0', '1'], fixedRandom);
        state.core.players['0'].tokens[TOKEN_IDS.TREANT_DIVINE] = 1;
        state.core.pendingDamage = {
            id: 'dmg-ai-boost-no-window',
            sourcePlayerId: '0',
            targetPlayerId: '1',
            originalDamage: 5,
            currentDamage: 5,
            sourceAbilityId: 'shattering-fist-2-3',
            damageScope: 'attack',
            responseType: 'beforeDamageDealt',
            responderId: '0',
            isFullyEvaded: false,
        };
        state.sys.phase = 'defensiveRoll';
        state.sys.responseWindow = { current: undefined } as typeof state.sys.responseWindow;

        const legalActions = buildDiceThroneAiLegalActions({
            playerId: '0',
            state,
        });

        expect(legalActions.some((action) => (
            action.kind === 'token-response'
            && action.commands.some(command => command.payload?.tokenId === TOKEN_IDS.TREANT_DIVINE)
        ))).toBe(true);
        expect(legalActions.some((action) => action.kind === 'skip-token-response')).toBe(true);
        expect(legalActions.some((action) => action.kind === 'advance-phase')).toBe(false);
    });

    it('树精复仇枝蔓防御结算后 responseWindow 已空时，本地 AI 仍应响应神圣树灵', async () => {
        const state = createHeroMatchup('shadow_thief', 'treant')(['0', '1'], fixedRandom);
        state.sys.phase = 'defensiveRoll';
        state.core.activePlayerId = '1';
        state.core.players['1'].tokens[TOKEN_IDS.TREANT_DIVINE] = 1;
        state.core.pendingAttack = {
            attackerId: '1',
            defenderId: '0',
            settlementStage: 'afterDefense',
            isDefendable: true,
            sourceAbilityId: 'vengeful-vines',
            isUltimate: false,
            damageResolved: false,
            resolvedDamage: 0,
            statusEffectsAppliedThisAttack: {},
            attackDiceFaceCounts: {
                fist: 0,
                palm: 0,
                taiji: 0,
                lotus: 0,
                sword: 0,
                heart: 0,
                strength: 0,
                branch: 1,
                leaf: 3,
                spirit: 1,
                ninja_katana: 0,
                shuriken: 0,
                mask: 0,
            },
            attackDiceValues: [3, 4, 4, 6, 5],
            bonusDamage: 0,
            attackModifierBonusDamage: 0,
            preDefenseResolved: true,
            defenseAbilityId: 'shadow-defense',
            defenseResolved: true,
        };
        state.core.pendingDamage = {
            id: 'dmg-ai-treant-vengeful-vines-no-window',
            sourcePlayerId: '1',
            targetPlayerId: '0',
            originalDamage: 7,
            currentDamage: 7,
            sourceAbilityId: 'vengeful-vines',
            damageScope: 'attack',
            responseType: 'beforeDamageDealt',
            responderId: '1',
            isFullyEvaded: false,
        };
        state.sys.responseWindow = { current: undefined } as typeof state.sys.responseWindow;

        const legalActions = buildDiceThroneAiLegalActions({
            playerId: '1',
            state,
        });

        expect(legalActions.some((action) => (
            action.kind === 'token-response'
            && action.commands.some(command => command.payload?.tokenId === TOKEN_IDS.TREANT_DIVINE)
        ))).toBe(true);
        expect(legalActions.some((action) => action.kind === 'skip-token-response')).toBe(true);
        expect(legalActions.some((action) => action.kind === 'advance-phase')).toBe(false);

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '1': { type: 'local-ai' },
            },
        });

        expect(resolution?.playerId).toBe('1');
        expect(resolution?.action.kind).toBe('token-response');
        expect(resolution?.action.metadata).toMatchObject({
            tokenId: TOKEN_IDS.TREANT_DIVINE,
        });
    });

    it('pendingDamage 仍存在但 responseWindow 已空时，本地 AI 仍应优先走 skip-token-response 而不是普通阶段动作', async () => {
        const state = createHeroMatchup('monk', 'paladin')(['0', '1'], fixedRandom);
        state.core.players['0'].tokens[TOKEN_IDS.TAIJI] = 0;
        state.core.pendingDamage = {
            id: 'dmg-ai-skip-no-window',
            sourcePlayerId: '1',
            targetPlayerId: '0',
            originalDamage: 4,
            currentDamage: 4,
            responseType: 'beforeDamageReceived',
            responderId: '0',
            isFullyEvaded: false,
        };
        state.sys.phase = 'defensiveRoll';
        state.sys.responseWindow = { current: undefined } as typeof state.sys.responseWindow;

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '0': { type: 'local-ai' },
            },
        });

        expect(resolution?.playerId).toBe('0');
        expect(resolution?.action.kind).toBe('skip-token-response');
    });

    it('本地 AI 不应在 main1 把下次不算当成主动出牌', async () => {
        const state = createHeroMatchup('gunslinger', 'monk')(['0', '1'], fixedRandom);
        state.core.players['0'].hand = [getCardById('card-next-time')];
        state.core.players['0'].resources[RESOURCE_IDS.CP] = 1;
        state.sys.phase = 'main1';

        const legalActions = buildDiceThroneAiLegalActions({
            playerId: '0',
            state,
        });

        expect(legalActions.some((action) =>
            action.kind === 'play-card'
            && action.metadata?.cardId === 'card-next-time'
        )).toBe(false);

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '0': { type: 'local-ai' },
            },
        });

        expect(resolution?.playerId).toBe('0');
        expect(resolution?.action.kind).not.toBe('play-card');
    });

    it('本地 AI 在受伤响应窗口应能把下次不算作为 response-play-card 打出', async () => {
        let state = createHeroMatchup('gunslinger', 'monk')(['0', '1'], fixedRandom);
        state.core.players['0'].hand = [getCardById('card-next-time')];
        state.core.players['0'].resources[RESOURCE_IDS.CP] = 1;
        state.core.pendingDamage = {
            id: 'dmg-ai-next-time-response',
            sourcePlayerId: '1',
            targetPlayerId: '0',
            originalDamage: 6,
            currentDamage: 6,
            responseType: 'beforeDamageReceived',
            responderId: '0',
            isFullyEvaded: false,
        };
        state.sys.responseWindow = {
            current: {
                id: 'rw-ai-next-time-response',
                windowType: 'afterAttackResolved',
                responderQueue: ['0'],
                currentResponderIndex: 0,
                passedPlayers: [],
            },
        };

        const legalActions = buildDiceThroneAiLegalActions({
            playerId: '0',
            state,
        });

        expect(legalActions.some((action) =>
            action.kind === 'response-play-card'
            && action.metadata?.cardId === 'card-next-time'
        )).toBe(true);

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '0': { type: 'local-ai' },
            },
        });

        expect(resolution?.playerId).toBe('0');
        expect(resolution?.action.kind).toBe('response-play-card');
        expect(resolution?.action.metadata).toMatchObject({
            cardId: 'card-next-time',
        });
        expect(resolveLocalAiActionVisibility(resolution!.action, diceThroneAiRuntime)).toBe('hidden');

        for (const command of resolution!.action.commands) {
            state = execCmd(
                state,
                cmd(command.type as CommandInput['type'], resolution!.playerId, command.payload ?? {}),
            );
        }

        expect(state.core.players['0'].damageShields).toEqual([
            expect.objectContaining({
                sourceId: 'card-next-time',
                value: 6,
            }),
        ]);
        expect(state.core.players['0'].discard.map((card) => card.id)).toContain('card-next-time');
    });

    it('本地 AI 在 afterAttackResolved 窗口只应把 card-dizzy 作为 response-play-card', async () => {
        const state = createHeroMatchup('barbarian', 'barbarian')(['0', '1'], fixedRandom);
        state.core.players['0'].hand = [
            getCardById('card-head-blow'),
            getCardById('card-dizzy'),
        ];
        state.core.players['0'].resources[RESOURCE_IDS.CP] = 1;
        state.core.lastResolvedAttackDamage = 13;
        state.sys.responseWindow = {
            current: {
                id: 'rw-ai-card-dizzy-response',
                windowType: 'afterAttackResolved',
                responderQueue: ['0'],
                currentResponderIndex: 0,
                passedPlayers: [],
            },
        };

        const legalActions = buildDiceThroneAiLegalActions({
            playerId: '0',
            state,
        });

        expect(legalActions.some((action) =>
            action.kind === 'response-play-card'
            && action.metadata?.cardId === 'card-dizzy'
        )).toBe(true);
        expect(legalActions.some((action) =>
            action.kind === 'response-play-card'
            && action.metadata?.cardId === 'card-head-blow'
        )).toBe(false);

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '0': { type: 'local-ai' },
            },
        });

        expect(resolution?.playerId).toBe('0');
        expect(resolution?.action.kind).toBe('response-play-card');
        expect(resolution?.action.metadata).toMatchObject({
            cardId: 'card-dizzy',
        });
    });

    it('本地 AI 在响应窗口但不是当前响应者时不应生成响应动作', async () => {
        const state = createHeroMatchup('monk', 'paladin')(['0', '1'], fixedRandom);
        state.sys.phase = 'offensiveRoll';
        state.core.rollCount = 1;
        state.core.rollLimit = 3;
        state.core.rollConfirmed = true;
        state.core.players['0'].resources[RESOURCE_IDS.CP] = 10;
        state.core.players['0'].hand = [getCardById('card-flick')];
        state.sys.responseWindow = {
            current: {
                id: 'rw-not-responder',
                windowType: 'afterRollConfirmed',
                responderQueue: ['1'],
                currentResponderIndex: 0,
                passedPlayers: [],
            },
        };

        const legalActions = buildDiceThroneAiLegalActions({
            playerId: '0',
            state,
        });

        expect(legalActions.length).toBe(0);

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '0': { type: 'local-ai' },
            },
        });

        expect(resolution).toBeNull();
    });

    it('本地 AI 在 afterRollConfirmed 响应窗口不应枚举战术优势重掷对手骰', () => {
        const state = createHeroMatchup('monk', 'zhanshujia')(['0', '1'], fixedRandom);
        state.sys.phase = 'offensiveRoll';
        state.core.activePlayerId = '0';
        state.core.rollCount = 1;
        state.core.rollLimit = 3;
        state.core.rollDiceCount = 5;
        state.core.rollConfirmed = true;
        state.core.players['1'].hand = [];
        state.core.players['1'].passiveAbilities = ZHANSHUJIA_PASSIVE_ABILITIES;
        state.core.players['1'].tokens[TOKEN_IDS.TACTICAL_ADVANTAGE] = 1;
        state.core.dice = state.core.dice.slice(0, 5).map((die, index) => ({
            ...die,
            id: index,
            value: [6, 2, 3, 4, 5][index],
            isKept: false,
        }));
        state.sys.responseWindow = {
            current: {
                id: 'rw-tactical-advantage-passive',
                windowType: 'afterRollConfirmed',
                responderQueue: ['1'],
                currentResponderIndex: 0,
                passedPlayers: [],
            },
        };

        const legalActions = buildDiceThroneAiLegalActions({
            playerId: '1',
            state,
        });

        expect(legalActions).not.toContainEqual(expect.objectContaining({
            kind: 'use-passive-ability',
            commands: [expect.objectContaining({
                type: 'USE_PASSIVE_ABILITY',
                payload: expect.objectContaining({
                    passiveId: 'zhanshujia-tactical-advantage',
                    actionIndex: 1,
                    targetDieId: 0,
                }),
            })],
        }));
    });

    it('本地 AI 在 afterRollConfirmed 面对高点对手骰子时，应主动打出改骰牌而不是直接 pass', async () => {
        const state = createHeroMatchup('monk', 'paladin')(['0', '1'], fixedRandom);
        state.sys.phase = 'offensiveRoll';
        state.core.activePlayerId = '0';
        state.core.rollCount = 1;
        state.core.rollLimit = 3;
        state.core.rollDiceCount = 5;
        state.core.rollConfirmed = true;
        state.core.players['1'].resources[RESOURCE_IDS.CP] = 10;
        state.core.players['1'].hand = [getCardById('card-surprise')];
        state.core.players['0'].hand = [];
        state.core.dice = state.core.dice.slice(0, 5).map((die, index) => ({
            ...die,
            id: index,
            value: [6, 2, 3, 4, 5][index],
        }));
        state.sys.responseWindow = {
            current: {
                id: 'rw-surprise-beneficial',
                windowType: 'afterRollConfirmed',
                responderQueue: ['1'],
                currentResponderIndex: 0,
                passedPlayers: [],
            },
        };

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '1': { type: 'local-ai' },
            },
        });

        expect(resolution?.playerId).toBe('1');
        expect(resolution?.action.kind).toBe('response-play-card');
        expect(resolution?.action.metadata).toMatchObject({ cardId: 'card-surprise' });
    });

    it('本地 AI 在 afterRollConfirmed 遇到已成型的对手技能线时，应主动打出改骰牌破坏技能而不是 pass', async () => {
        const state = createHeroMatchup('monk', 'paladin')(['0', '1'], fixedRandom);
        state.sys.phase = 'offensiveRoll';
        state.core.activePlayerId = '0';
        state.core.rollCount = 1;
        state.core.rollLimit = 3;
        state.core.rollDiceCount = 5;
        state.core.rollConfirmed = true;
        state.core.players['1'].resources[RESOURCE_IDS.CP] = 10;
        state.core.players['1'].hand = [getCardById('card-surprise')];
        state.core.players['0'].hand = [];
        state.core.dice = state.core.dice.slice(0, 5).map((die, index) => ({
            ...die,
            id: index,
            value: [1, 1, 1, 1, 1][index],
        }));
        state.sys.responseWindow = {
            current: {
                id: 'rw-surprise-noop',
                windowType: 'afterRollConfirmed',
                responderQueue: ['1'],
                currentResponderIndex: 0,
                passedPlayers: [],
            },
        };

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '1': { type: 'local-ai' },
            },
        });

        expect(resolution?.playerId).toBe('1');
        expect(resolution?.action.kind).toBe('response-play-card');
        expect(resolution?.action.metadata).toMatchObject({ cardId: 'card-surprise' });
    });

    it('本地 AI 在 afterRollConfirmed 面对高点对手骰子时，应主动打出重掷牌而不是直接 pass', async () => {
        const state = createHeroMatchup('monk', 'paladin')(['0', '1'], fixedRandom);
        state.sys.phase = 'offensiveRoll';
        state.core.activePlayerId = '0';
        state.core.rollCount = 1;
        state.core.rollLimit = 3;
        state.core.rollDiceCount = 5;
        state.core.rollConfirmed = true;
        state.core.players['1'].resources[RESOURCE_IDS.CP] = 10;
        state.core.players['1'].hand = [getCardById('card-give-hand')];
        state.core.players['0'].hand = [];
        state.core.dice = state.core.dice.slice(0, 5).map((die, index) => ({
            ...die,
            id: index,
            value: [6, 5, 4, 2, 1][index],
        }));
        state.sys.responseWindow = {
            current: {
                id: 'rw-reroll-beneficial',
                windowType: 'afterRollConfirmed',
                responderQueue: ['1'],
                currentResponderIndex: 0,
                passedPlayers: [],
            },
        };

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '1': { type: 'local-ai' },
            },
        });

        expect(resolution?.playerId).toBe('1');
        expect(resolution?.action.kind).toBe('response-play-card');
        expect(resolution?.action.metadata).toMatchObject({ cardId: 'card-give-hand' });
    });

    it('本地 AI 在 afterRollConfirmed 遇到已成型的对手技能线时，应主动打出重掷牌干扰而不是 pass', async () => {
        const state = createHeroMatchup('monk', 'paladin')(['0', '1'], fixedRandom);
        state.sys.phase = 'offensiveRoll';
        state.core.activePlayerId = '0';
        state.core.rollCount = 1;
        state.core.rollLimit = 3;
        state.core.rollDiceCount = 5;
        state.core.rollConfirmed = true;
        state.core.players['1'].resources[RESOURCE_IDS.CP] = 10;
        state.core.players['1'].hand = [getCardById('card-give-hand')];
        state.core.players['0'].hand = [];
        state.core.dice = state.core.dice.slice(0, 5).map((die, index) => ({
            ...die,
            id: index,
            value: [1, 1, 1, 1, 1][index],
        }));
        state.sys.responseWindow = {
            current: {
                id: 'rw-reroll-noop',
                windowType: 'afterRollConfirmed',
                responderQueue: ['1'],
                currentResponderIndex: 0,
                passedPlayers: [],
            },
        };

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '1': { type: 'local-ai' },
            },
        });

        expect(resolution?.playerId).toBe('1');
        expect(resolution?.action.kind).toBe('response-play-card');
        expect(resolution?.action.metadata).toMatchObject({ cardId: 'card-give-hand' });
    });

    it('本地 AI 在 afterRollConfirmed 两张响应骰牌都可打时，应优先选择更能破坏技能线的那张', async () => {
        const state = createHeroMatchup('monk', 'paladin')(['0', '1'], fixedRandom);
        state.sys.phase = 'offensiveRoll';
        state.core.activePlayerId = '0';
        state.core.rollCount = 1;
        state.core.rollLimit = 3;
        state.core.rollDiceCount = 5;
        state.core.rollConfirmed = true;
        state.core.players['1'].resources[RESOURCE_IDS.CP] = 10;
        state.core.players['1'].hand = [getCardById('card-surprise'), getCardById('card-flick')];
        state.core.players['0'].hand = [];
        state.core.dice = state.core.dice.slice(0, 5).map((die, index) => ({
            ...die,
            id: index,
            value: [1, 1, 1, 1, 1][index],
            symbol: ['fist', 'fist', 'fist', 'fist', 'fist'][index],
            symbols: [['fist'], ['fist'], ['fist'], ['fist'], ['fist']][index],
        }));
        state.sys.responseWindow = {
            current: {
                id: 'rw-plan-aware-card-choice',
                windowType: 'afterRollConfirmed',
                responderQueue: ['1'],
                currentResponderIndex: 0,
                passedPlayers: [],
            },
        };

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '1': { type: 'local-ai', difficulty: 'expert' },
            },
        });

        expect(resolution?.playerId).toBe('1');
        expect(resolution?.action.kind).toBe('response-play-card');
        expect(resolution?.action.metadata).toMatchObject({ cardId: 'card-surprise' });
    });

    it('本地 AI 在 offensiveRoll 应先锁住高价值技能关键骰，再继续后续重投决策', async () => {
        const random = createQueuedRandom([6]);
        let state = createHeroMatchup('paladin', 'monk')(['0', '1'], random);
        state.sys.phase = 'offensiveRoll';
        state.core.rollCount = 1;
        state.core.rollLimit = 2;
        state.core.rollDiceCount = 5;
        state.core.rollConfirmed = false;
        state.core.players['0'].resources[RESOURCE_IDS.CP] = 2;
        state.core.dice = [
            { id: 0, value: 1, symbol: 'fist', isKept: false },
            { id: 1, value: 2, symbol: 'sword', isKept: false },
            { id: 2, value: 6, symbol: 'pray', isKept: false },
            { id: 3, value: 2, symbol: 'sword', isKept: false },
            { id: 4, value: 6, symbol: 'pray', isKept: false },
        ];

        const first = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '0': { type: 'local-ai' },
            },
        });

        expect(first?.playerId).toBe('0');
        expect(first?.action.kind).toBe('toggle-die-lock');
        expect(typeof first?.action.metadata?.dieId).toBe('number');
        expect(first?.attemptKey).toBeTruthy();

        for (const command of first!.action.commands) {
            state = execCmd(
                state,
                cmd(command.type as CommandInput['type'], first!.playerId, command.payload ?? {}),
                random,
            );
        }

        const lockedDieId = first?.action.metadata?.dieId as number;
        expect(state.core.dice.find((die) => die.id === lockedDieId)?.isKept).toBe(true);

        const second = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '0': { type: 'local-ai' },
            },
        });

        expect(second?.playerId).toBe('0');
        expect(second?.action).toBeTruthy();
        expect(second?.attemptKey).toBeTruthy();
        expect(second?.attemptKey).not.toBe(first?.attemptKey);
    });

    it('本地 AI 在自己的进攻掷骰阶段应生成改骰牌候选，而不是只剩锁骰/确认', () => {
        const state = createHeroMatchup('paladin', 'monk')(['0', '1'], fixedRandom);
        state.sys.phase = 'offensiveRoll';
        state.core.activePlayerId = '0';
        state.core.rollCount = 1;
        state.core.rollLimit = 2;
        state.core.rollDiceCount = 5;
        state.core.rollConfirmed = false;
        state.core.players['0'].resources[RESOURCE_IDS.CP] = 10;
        state.core.players['0'].hand = [getCardById('card-surprise')];
        state.core.dice = state.core.dice.map((die, index) => ({
            ...die,
            id: index,
            value: [1, 1, 1, 6, 5][index],
            symbol: ['sword', 'sword', 'sword', 'pray', 'heart'][index],
            symbols: [[
                ['sword', 'sword', 'sword', 'pray', 'heart'][index],
            ][0]],
            isKept: false,
        }));

        const actions = buildDiceThroneAiLegalActions({
            playerId: '0',
            state,
        });

        expect(actions.some((action) => (
            action.kind === 'play-card'
            && action.metadata?.cardId === 'card-surprise'
            && action.commands[0]?.type === 'PLAY_CARD'
        ))).toBe(true);
    });

    it('本地 AI 在自己的进攻掷骰阶段应生成重掷牌候选，而不是漏掉 roll 时机手牌', () => {
        const state = createHeroMatchup('paladin', 'monk')(['0', '1'], fixedRandom);
        state.sys.phase = 'offensiveRoll';
        state.core.activePlayerId = '0';
        state.core.rollCount = 1;
        state.core.rollLimit = 2;
        state.core.rollDiceCount = 5;
        state.core.rollConfirmed = false;
        state.core.players['0'].resources[RESOURCE_IDS.CP] = 10;
        state.core.players['0'].hand = [getCardById('card-worthy-of-me')];
        state.core.dice = state.core.dice.map((die, index) => ({
            ...die,
            id: index,
            value: [1, 2, 2, 6, 5][index],
            symbol: ['sword', 'shield', 'shield', 'pray', 'heart'][index],
            symbols: [[
                ['sword', 'shield', 'shield', 'pray', 'heart'][index],
            ][0]],
            isKept: false,
        }));

        const actions = buildDiceThroneAiLegalActions({
            playerId: '0',
            state,
        });

        expect(actions.some((action) => (
            action.kind === 'play-card'
            && action.metadata?.cardId === 'card-worthy-of-me'
            && action.commands[0]?.type === 'PLAY_CARD'
        ))).toBe(true);
    });

    it('本地 AI 在自己的进攻掷骰阶段完成首个关键锁骰后，应继续主动打出改骰牌', async () => {
        let state = createHeroMatchup('paladin', 'monk')(['0', '1'], fixedRandom);
        state.sys.phase = 'offensiveRoll';
        state.core.activePlayerId = '0';
        state.core.rollCount = 1;
        state.core.rollLimit = 2;
        state.core.rollDiceCount = 5;
        state.core.rollConfirmed = false;
        state.core.players['0'].resources[RESOURCE_IDS.CP] = 10;
        state.core.players['0'].hand = [getCardById('card-surprise')];
        state.core.dice = state.core.dice.map((die, index) => ({
            ...die,
            id: index,
            value: [1, 1, 1, 6, 5][index],
            symbol: ['sword', 'sword', 'sword', 'pray', 'heart'][index],
            symbols: [[
                ['sword', 'sword', 'sword', 'pray', 'heart'][index],
            ][0]],
            isKept: index === 3 || index === 4,
        }));

        const first = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'dicethrone-ai-offensive-roll-play-surprise',
            seatControllers: {
                '0': { type: 'local-ai', difficulty: 'expert' },
            },
        });

        expect(first?.playerId).toBe('0');
        expect(first?.action.kind).toBe('toggle-die-lock');

        for (const command of first!.action.commands) {
            state = execCmd(
                state,
                cmd(command.type as CommandInput['type'], first!.playerId, command.payload ?? {}),
            );
        }

        const second = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'dicethrone-ai-offensive-roll-play-surprise',
            seatControllers: {
                '0': { type: 'local-ai', difficulty: 'expert' },
            },
        });

        expect(second?.playerId).toBe('0');
        expect(second?.action.kind).toBe('play-card');
        expect(second?.action.metadata).toMatchObject({ cardId: 'card-surprise' });
    });

    it('本地 AI 在响应窗口存在可打补牌牌时，应优先出牌而不是直接 pass', async () => {
        let state = createHeroMatchup('paladin', 'monk')(['0', '1'], fixedRandom);
        state.sys.phase = 'main2';
        state.core.activePlayerId = '1';
        state.core.players['0'].resources[RESOURCE_IDS.CP] = 2;
        state.core.players['0'].hand = [
            {
                id: 'card-super-double',
                name: 'Undefendable',
                type: 'action',
                cpCost: 2,
                timing: 'instant',
                description: 'draw 3',
                effects: [{ description: '抽取3张牌', action: { type: 'drawCard', target: 'self', drawCount: 3 }, timing: 'immediate' }],
            },
        ];
        state.sys.responseWindow = {
            current: {
                id: 'rw-then-breakpoint',
                windowType: 'thenBreakpoint',
                responderQueue: ['0'],
                currentResponderIndex: 0,
                passedPlayers: [],
            },
        };

        const first = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '0': { type: 'local-ai' },
            },
        });

        expect(first?.playerId).toBe('0');
        expect(first?.action.kind).toBe('response-play-card');
        expect(first?.action.metadata).toMatchObject({ cardId: 'card-super-double' });

        for (const command of first!.action.commands) {
            state = execCmd(
                state,
                cmd(command.type as CommandInput['type'], first!.playerId, command.payload ?? {}),
            );
        }

        expect(state.sys.responseWindow?.current).toBeUndefined();
        expect(state.core.players['0'].hand.length).toBe(3);

        const second = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '0': { type: 'local-ai' },
            },
        });

        expect(second).toBeNull();
    });

    it('本地 AI 在手牌偏少时应优先使用教皇税抽牌，而不是直接推进阶段', async () => {
        const random = createQueuedRandom([6]);
        let state = createHeroMatchup('paladin', 'monk')(['0', '1'], random);
        state.sys.phase = 'main2';
        state.core.activePlayerId = '0';
        state.core.players['0'].resources[RESOURCE_IDS.CP] = 3;
        state.core.players['0'].hand = [];

        const first = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '0': { type: 'local-ai' },
            },
        });

        expect(first?.playerId).toBe('0');
        expect(first?.action.kind).toBe('use-passive-ability');
        expect(first?.action.metadata).toMatchObject({
            passiveId: 'tithes',
            actionIndex: 1,
        });

        for (const command of first!.action.commands) {
            state = execCmd(
                state,
                cmd(command.type as CommandInput['type'], first!.playerId, command.payload ?? {}),
                random,
            );
        }

        expect(state.core.players['0'].resources[RESOURCE_IDS.CP]).toBe(0);
        expect(state.core.players['0'].hand.length).toBe(1);

        const second = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'local:test',
            seatControllers: {
                '0': { type: 'local-ai' },
            },
        });

        expect(second?.playerId).toBe('0');
        expect(second?.action).toBeTruthy();
        expect(second?.attemptKey).toBeTruthy();
        expect(second?.attemptKey).not.toBe(first?.attemptKey);
    });

    it('本地 AI 在已确认骰面时不应再使用教皇税重掷骰子（避免反复打开响应窗口打扰真人）', () => {
        const state = createHeroMatchup('paladin', 'monk')(['0', '1'], fixedRandom);
        state.sys.phase = 'offensiveRoll';
        state.core.activePlayerId = '0';
        state.core.rollCount = 1;
        state.core.rollLimit = 3;
        state.core.rollDiceCount = 5;
        state.core.rollConfirmed = true;
        state.core.players['0'].resources[RESOURCE_IDS.CP] = 3;

        const actions = buildDiceThroneAiLegalActions({
            playerId: '0',
            state,
        });

        const rerollPassiveActions = actions.filter((action) => (
            action.kind === 'use-passive-ability'
            && action.commands.some((cmd) => {
                if (cmd.type !== 'USE_PASSIVE_ABILITY') return false;
                const payload = cmd.payload as { passiveId?: string; actionIndex?: number } | undefined;
                return payload?.passiveId === 'tithes' && payload?.actionIndex === 0;
            })
        ));
        expect(rerollPassiveActions).toHaveLength(0);
    });

    it('本地 AI 在未确认骰面且有可重掷骰子时应能使用教皇税重掷骰子', () => {
        const state = createHeroMatchup('paladin', 'monk')(['0', '1'], fixedRandom);
        state.sys.phase = 'offensiveRoll';
        state.core.activePlayerId = '0';
        state.core.rollCount = 1;
        state.core.rollLimit = 3;
        state.core.rollDiceCount = 5;
        state.core.rollConfirmed = false;
        state.core.players['0'].resources[RESOURCE_IDS.CP] = 3;
        // 保证至少存在一个未锁定骰子
        state.core.dice = state.core.dice.map((die, index) => (index === 0 ? { ...die, isKept: false } : die));

        const actions = buildDiceThroneAiLegalActions({
            playerId: '0',
            state,
        });

        expect(actions.some((action) => (
            action.kind === 'use-passive-ability'
            && action.commands.some((cmd) => {
                if (cmd.type !== 'USE_PASSIVE_ABILITY') return false;
                const payload = cmd.payload as { passiveId?: string; actionIndex?: number; targetDieId?: number } | undefined;
                return payload?.passiveId === 'tithes'
                    && payload?.actionIndex === 0
                    && typeof payload?.targetDieId === 'number';
            })
        ))).toBe(true);
    });

    it('本地 AI 的被动重掷候选应包含已锁定骰子', () => {
        const state = createHeroMatchup('paladin', 'monk')(['0', '1'], fixedRandom);
        state.sys.phase = 'offensiveRoll';
        state.core.activePlayerId = '0';
        state.core.rollCount = 1;
        state.core.rollLimit = 3;
        state.core.rollDiceCount = 5;
        state.core.rollConfirmed = false;
        state.core.players['0'].resources[RESOURCE_IDS.CP] = 3;
        state.core.dice = state.core.dice.map((die, index) => ({ ...die, id: index, isKept: true }));

        const actions = buildDiceThroneAiLegalActions({
            playerId: '0',
            state,
        });

        const passiveRerollTargetDieIds = actions.flatMap((action) => {
            if (action.kind !== 'use-passive-ability') return [];
            return action.commands.flatMap((cmd) => {
                if (cmd.type !== 'USE_PASSIVE_ABILITY') return [];
                const payload = cmd.payload as { passiveId?: string; actionIndex?: number; targetDieId?: number } | undefined;
                const targetDieId = payload?.targetDieId;
                return payload?.passiveId === 'tithes'
                    && payload?.actionIndex === 0
                    && typeof targetDieId === 'number'
                    ? [targetDieId]
                    : [];
            });
        });

        expect([...new Set(passiveRerollTargetDieIds)].sort()).toEqual([0, 1, 2, 3, 4]);
    });

    it('本地 AI 用教皇税重掷时应按技能线选废面，而不是只盯低点数', async () => {
        const state = createHeroMatchup('paladin', 'monk')(['0', '1'], fixedRandom);
        state.sys.phase = 'offensiveRoll';
        state.core.activePlayerId = '0';
        state.core.rollCount = 1;
        state.core.rollLimit = 3;
        state.core.rollDiceCount = 5;
        state.core.rollConfirmed = false;
        state.core.players['0'].resources[RESOURCE_IDS.CP] = 3;
        state.core.dice = state.core.dice.map((die, index) => ({
            ...die,
            id: index,
            value: [1, 2, 2, 6, 5][index],
            symbol: ['sword', 'sword', 'sword', 'pray', 'heart'][index],
            isKept: false,
        }));

        const context = buildAiDecisionContext({
            gameId: 'dicethrone',
            matchId: 'dicethrone-ai-tithes-plan-aware-reroll',
            playerId: '0',
            visibleState: state,
            rulesVersion: null,
            decisionBudgetMs: 250,
            source: 'local',
            seatController: { type: 'local-ai', difficulty: 'expert' },
        });
        const passiveOnlyContext = {
            ...context,
            legalActions: context.legalActions.filter((action) => (
                action.kind === 'use-passive-ability'
                && action.commands.some((cmd) => {
                    if (cmd.type !== 'USE_PASSIVE_ABILITY') return false;
                    const payload = cmd.payload as { passiveId?: string; actionIndex?: number } | undefined;
                    return payload?.passiveId === 'tithes' && payload?.actionIndex === 0;
                })
            )),
        };

        const decision = await diceThroneAiRuntime.localPolicies.baseline.decide(passiveOnlyContext);
        const chosenAction = passiveOnlyContext.legalActions.find((action) => action.actionId === decision?.actionId);

        expect(chosenAction?.kind).toBe('use-passive-ability');
        expect(chosenAction?.commands[0]?.type).toBe('USE_PASSIVE_ABILITY');
        expect(chosenAction?.commands[0]?.payload).toMatchObject({
            passiveId: 'tithes',
            actionIndex: 0,
        });
        expect((chosenAction?.commands[0]?.payload as { targetDieId?: number } | undefined)?.targetDieId).toBe(4);
    });

    it('教皇税同值重掷不应清掉已确认骰面', () => {
        let state = createHeroMatchup('paladin', 'monk')(['0', '1'], fixedRandom);
        state.sys.phase = 'offensiveRoll';
        state.core.activePlayerId = '0';
        state.core.rollCount = 1;
        state.core.rollLimit = 3;
        state.core.rollDiceCount = 5;
        state.core.rollConfirmed = true;
        state.core.players['0'].resources[RESOURCE_IDS.CP] = 3;

        const originalValue = state.core.dice[0].value;
        const sameValueRandom = createQueuedRandom([originalValue]);

        state = execCmd(
            state,
            cmd('USE_PASSIVE_ABILITY', '0', {
                passiveId: 'tithes',
                actionIndex: 0,
                targetDieId: 0,
            }),
            sameValueRandom,
        );

        expect(state.core.players['0'].resources[RESOURCE_IDS.CP]).toBe(2);
        expect(state.core.dice[0].value).toBe(originalValue);
        expect(state.core.rollConfirmed).toBe(true);
    });

    it('教皇税异值重掷仍应清掉已确认骰面', () => {
        let state = createHeroMatchup('paladin', 'monk')(['0', '1'], fixedRandom);
        state.sys.phase = 'offensiveRoll';
        state.core.activePlayerId = '0';
        state.core.rollCount = 1;
        state.core.rollLimit = 3;
        state.core.rollDiceCount = 5;
        state.core.rollConfirmed = true;
        state.core.players['0'].resources[RESOURCE_IDS.CP] = 3;

        const originalValue = state.core.dice[0].value;
        const changedValue = originalValue === 6 ? 5 : 6;
        const changedValueRandom = createQueuedRandom([changedValue]);

        state = execCmd(
            state,
            cmd('USE_PASSIVE_ABILITY', '0', {
                passiveId: 'tithes',
                actionIndex: 0,
                targetDieId: 0,
            }),
            changedValueRandom,
        );

        expect(state.core.players['0'].resources[RESOURCE_IDS.CP]).toBe(2);
        expect(state.core.dice[0].value).toBe(changedValue);
        expect(state.core.rollConfirmed).toBe(false);
    });

    it('确认骰面后若被对手改骰且仍有剩余投掷次数，应允许继续重投', () => {
        const random = createQueuedRandom([1, 1, 1, 1, 1, 4, 4, 4, 4, 4]);
        const runner = createRunner(random, true);

        const afterModify = runner.run({
            name: 'afterRollConfirmed 对手改骰后应撤销已确认',
            setup: createSetupWithHand(['card-flick'], {
                playerId: '1',
                cp: 10,
                mutate: (core) => {
                    core.players['0'].hand = [];
                    core.players['0'].deck = [];
                    core.players['1'].deck = [];
                },
            }),
            commands: [
                ...advanceTo('offensiveRoll'),
                cmd('ROLL_DICE', '0'),
                cmd('CONFIRM_ROLL', '0'),
                cmd('SELECT_ABILITY', '0', { abilityId: fistAttackAbilityId }),
                cmd('PLAY_CARD', '1', { cardId: 'card-flick' }),
                cmd('MODIFY_DIE', '1', { dieId: 0, newValue: 2 }),
                cmd('SYS_INTERACTION_CONFIRM', '1'),
            ],
        });

        expect(afterModify.finalState.core.rollLimit).toBe(3);
        expect(afterModify.finalState.core.rollCount).toBe(1);
        expect(afterModify.finalState.core.rollConfirmed).toBe(false);

        runner.setState(afterModify.finalState);
        const rerollAttempt = runner.dispatch('ROLL_DICE', { playerId: '0' });

        expect(rerollAttempt.success).toBe(true);
        expect(rerollAttempt.finalState.core.rollCount).toBe(2);
        expect(rerollAttempt.finalState.core.rollConfirmed).toBe(false);
    });

    it('afterRollConfirmed 响应者改骰后，骰主重新确认不应再次打开同类响应窗口', () => {
        const runner = createRunner(createQueuedRandom([1, 1, 1, 1, 6]), true);

        const afterModify = runner.run({
            name: 'afterRollConfirmed 响应者改骰后等待骰主重新确认',
            setup: createSetupWithHand(['card-surprise', 'card-flick'], {
                playerId: '1',
                cp: 10,
                mutate: (core) => {
                    core.players['0'].hand = [];
                    core.players['0'].deck = [];
                    core.players['1'].deck = [];
                },
            }),
            commands: [
                ...advanceTo('offensiveRoll'),
                cmd('ROLL_DICE', '0'),
                cmd('CONFIRM_ROLL', '0'),
                cmd('PLAY_CARD', '1', { cardId: 'card-surprise' }),
                cmd('MODIFY_DIE', '1', { dieId: 4, newValue: 5 }),
                cmd('SYS_INTERACTION_CONFIRM', '1'),
            ],
        });

        expect(afterModify.assertionErrors).toEqual([]);
        expect(afterModify.finalState.sys.responseWindow?.current).toBeUndefined();
        expect(afterModify.finalState.core.dice[4]?.value).toBe(5);
        expect(afterModify.finalState.core.rollConfirmed).toBe(false);

        runner.setState(afterModify.finalState);
        const confirmAgain = runner.dispatch('CONFIRM_ROLL', { playerId: '0' });

        expect(confirmAgain.success).toBe(true);
        expect(confirmAgain.events.map((event) => event.type)).toEqual(['ROLL_CONFIRMED']);
        expect(confirmAgain.finalState.core.rollConfirmed).toBe(true);
        expect(confirmAgain.finalState.sys.responseWindow?.current).toBeUndefined();

        runner.setState(confirmAgain.finalState);
        const declareAttack = runner.dispatch('SELECT_ABILITY', { playerId: '0', abilityId: 'fist-technique-4' });

        expect(declareAttack.success).toBe(true);
        expect(declareAttack.events.map((event) => event.type)).toEqual([
            'ABILITY_ACTIVATED',
            'ATTACK_INITIATED',
            'RESPONSE_WINDOW_OPENED',
        ]);
        expect(declareAttack.finalState.core.pendingAttack?.sourceAbilityId).toBe('fist-technique-4');
        expect(declareAttack.finalState.sys.responseWindow?.current).toMatchObject({
            windowType: 'afterRollConfirmed',
            responderQueue: ['1'],
        });
    });

    it('defensiveRoll 响应者改骰后，防御方重新确认应再次打开攻击方响应窗口', () => {
        const runner = createRunner(createQueuedRandom([
            1, 1, 1, 4, 5,
            1, 1, 1,
        ]), true);

        const afterModify = runner.run({
            name: '防御骰被攻击方改动后等待防御方重新确认',
            setup: createSetupWithHand(['card-surprise', 'card-flick'], {
                playerId: '0',
                cp: 10,
                mutate: (core) => {
                    core.players['0'].deck = [];
                    core.players['1'].hand = [];
                    core.players['1'].deck = [];
                },
            }),
            commands: [
                ...advanceTo('offensiveRoll'),
                cmd('ROLL_DICE', '0'),
                cmd('CONFIRM_ROLL', '0'),
                cmd('SELECT_ABILITY', '0', { abilityId: 'fist-technique-3' }),
                cmd('ADVANCE_PHASE', '0'),
                cmd('ROLL_DICE', '1'),
                cmd('CONFIRM_ROLL', '1'),
                cmd('PLAY_CARD', '0', { cardId: 'card-surprise' }),
                cmd('MODIFY_DIE', '0', { dieId: 0, newValue: 2 }),
                cmd('SYS_INTERACTION_CONFIRM', '0'),
            ],
        });

        expect(afterModify.assertionErrors).toEqual([]);
        expect(afterModify.finalState.sys.responseWindow?.current).toBeUndefined();
        expect(afterModify.finalState.core.rollConfirmed).toBe(false);
        expect(afterModify.finalState.core.dice[0]?.value).toBe(2);

        runner.setState(afterModify.finalState);
        const confirmAgain = runner.dispatch('CONFIRM_ROLL', { playerId: '1' });

        expect(confirmAgain.success).toBe(true);
        expect(confirmAgain.events.map((event) => event.type)).toEqual([
            'ROLL_CONFIRMED',
            'RESPONSE_WINDOW_OPENED',
        ]);
        expect(confirmAgain.finalState.core.rollConfirmed).toBe(true);
        expect(confirmAgain.finalState.sys.responseWindow?.current).toMatchObject({
            windowType: 'afterRollConfirmed',
            responderQueue: ['0'],
        });
    });

    it('不同难度会影响搜索行为，专家玩法噪声保持为 0', async () => {
        const state = createSetupWithHand(['card-enlightenment', 'card-boss-generous'], { cp: 0 })(['0', '1'], fixedRandom);
        const matchId = 'probe';

        const easyResolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId,
            seatControllers: {
                '0': { type: 'local-ai', difficulty: 'easy' },
            },
        });
        const expertResolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId,
            seatControllers: {
                '0': { type: 'local-ai', difficulty: 'expert' },
            },
        });

        expect(easyResolution?.action.kind).toBe('play-card');
        expect(expertResolution?.action.kind).toBe('play-card');
        expect(expertResolution?.action.metadata).toMatchObject({ cardId: 'card-enlightenment' });
        expect(easyResolution?.action.metadata).toMatchObject({ cardId: 'card-enlightenment' });

        const easyContext = buildAiDecisionContext({
            gameId: 'dicethrone',
            matchId,
            playerId: '0',
            visibleState: state,
            rulesVersion: null,
            decisionBudgetMs: 250,
            source: 'local',
            seatController: { type: 'local-ai', difficulty: 'easy' },
        });
        const expertContext = buildAiDecisionContext({
            gameId: 'dicethrone',
            matchId,
            playerId: '0',
            visibleState: state,
            rulesVersion: null,
            decisionBudgetMs: 250,
            source: 'local',
            seatController: { type: 'local-ai', difficulty: 'expert' },
        });

        const easyDecision = await diceThroneAiRuntime.localPolicies.baseline.decide(easyContext);
        const expertDecision = await diceThroneAiRuntime.localPolicies.baseline.decide(expertContext);
        const easyEvaluations = (easyDecision?.providerMetadata?.evaluations ?? []) as Array<{ searched?: boolean; noiseScore?: number }>;
        const expertEvaluations = (expertDecision?.providerMetadata?.evaluations ?? []) as Array<{ searched?: boolean; noiseScore?: number }>;

        expect(easyEvaluations.some((item) => item.searched)).toBe(false);
        expect(expertEvaluations.some((item) => item.searched)).toBe(true);
        expect(expertEvaluations.every((item) => item.noiseScore === 0)).toBe(true);
    });

    it('本地 AI 不应再把纯资源牌与真实 token 收益牌打平，应优先打出 card-inner-peace', async () => {
        const state = createSetupWithHand(['card-inner-peace', 'card-boss-generous'], { cp: 0 })(['0', '1'], fixedRandom);

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'dicethrone-ai-prioritize-real-token-value',
            seatControllers: {
                '0': { type: 'local-ai', difficulty: 'expert' },
            },
        });

        expect(resolution?.action.kind).toBe('play-card');
        expect(resolution?.action.metadata).toMatchObject({ cardId: 'card-inner-peace' });
    });

    it('响应窗口 legal action 会附带 survive-response strategy tags', () => {
        const state = createHeroMatchup('monk', 'paladin')(['0', '1'], fixedRandom);
        state.core.players['0'].tokens[TOKEN_IDS.TAIJI] = 1;
        state.core.players['0'].resources[RESOURCE_IDS.HP] = 2;
        state.core.pendingDamage = {
            id: 'dmg-strategy-tags',
            sourcePlayerId: '1',
            targetPlayerId: '0',
            originalDamage: 5,
            currentDamage: 5,
            responseType: 'beforeDamageReceived',
            responderId: '0',
            isFullyEvaded: false,
        };
        state.sys.responseWindow = {
            current: {
                id: 'rw-strategy-tags',
                windowType: 'afterAttackResolved',
                responderQueue: ['0'],
                currentResponderIndex: 0,
                passedPlayers: [],
            },
        };

        const actions = buildDiceThroneAiLegalActions({
            playerId: '0',
            state,
        });
        const tokenAction = actions.find((action) => action.kind === 'token-response');
        const skipAction = actions.find((action) => action.kind === 'skip-token-response');

        expect(tokenAction?.metadata?.strategyTags).toContain('survive-response');
        expect(tokenAction?.metadata?.cardStrategyTags).toBeUndefined();
        expect(tokenAction?.commands).toContainEqual({
            type: 'USE_TOKEN',
            payload: { tokenId: TOKEN_IDS.TAIJI, amount: 1, pendingDamageId: 'dmg-strategy-tags' },
        });
        expect(skipAction?.commands).toContainEqual({
            type: 'SKIP_TOKEN_RESPONSE',
            payload: { pendingDamageId: 'dmg-strategy-tags' },
        });
    });

    it('withAiActionStrategyTags 默认只写 strategyTags，显式 opt-in 才镜像 legacy 字段', () => {
        expect(withAiActionStrategyTags({ foo: 'bar' }, ['survive-response'])).toEqual({
            foo: 'bar',
            strategyTags: ['survive-response'],
        });
        expect(withAiActionStrategyTags({ foo: 'bar' }, ['survive-response'], {
            mirrorLegacyCardStrategyTags: true,
        })).toEqual({
            foo: 'bar',
            strategyTags: ['survive-response'],
            cardStrategyTags: ['survive-response'],
        });
    });

    it('strategy profile scorer 会在高压响应窗口继续抬高保命动作评分', async () => {
        const state = createHeroMatchup('monk', 'paladin')(['0', '1'], fixedRandom);
        state.core.players['0'].tokens[TOKEN_IDS.TAIJI] = 1;
        state.core.players['0'].resources[RESOURCE_IDS.HP] = 2;
        state.core.pendingDamage = {
            id: 'dmg-strategy-priority',
            sourcePlayerId: '1',
            targetPlayerId: '0',
            originalDamage: 5,
            currentDamage: 5,
            responseType: 'beforeDamageReceived',
            responderId: '0',
            isFullyEvaded: false,
        };
        state.sys.responseWindow = {
            current: {
                id: 'rw-strategy-priority',
                windowType: 'afterAttackResolved',
                responderQueue: ['0'],
                currentResponderIndex: 0,
                passedPlayers: [],
            },
        };

        const context = buildAiDecisionContext({
            gameId: 'dicethrone',
            matchId: 'dicethrone-strategy-priority',
            playerId: '0',
            visibleState: state,
            rulesVersion: null,
            decisionBudgetMs: 250,
            source: 'local',
            seatController: { type: 'local-ai', difficulty: 'expert' },
        });

        const decision = await diceThroneAiRuntime.localPolicies.baseline.decide(context);
        const evaluations = (decision?.providerMetadata?.evaluations ?? []) as Array<{
            actionId: string;
            kind: string;
            contributions: Array<{ scorerId: string; score: number }>;
        }>;
        const tokenAction = context.legalActions.find((action) => action.kind === 'token-response');
        const passAction = context.legalActions.find((action) => action.kind === 'response-pass');
        const tokenEval = evaluations.find((item) => item.actionId === tokenAction?.actionId);
        const passEval = evaluations.find((item) => item.actionId === passAction?.actionId);

        expect(tokenAction?.metadata?.strategyTags).toContain('survive-response');
        expect(tokenEval?.contributions.some((item) => item.scorerId === 'strategy-profile-fit' && item.score > 0)).toBe(true);
        expect(passEval?.contributions.some((item) => item.scorerId === 'strategy-profile-fit' && item.score > 0)).toBe(false);
        expect(decision?.actionId).toBe(tokenAction?.actionId);
    });

    it('专家难度 trace 会记录 strategy 驱动的 searchPriority，供通用搜索层复用', async () => {
        const state = createSetupWithHand(['card-enlightenment', 'card-boss-generous', 'card-unexpected', 'card-double'], { cp: 0 })(['0', '1'], fixedRandom);
        const expertContext = buildAiDecisionContext({
            gameId: 'dicethrone',
            matchId: 'probe-strategy-priority',
            playerId: '0',
            visibleState: state,
            rulesVersion: null,
            decisionBudgetMs: 250,
            source: 'local',
            seatController: { type: 'local-ai', difficulty: 'expert' },
        });

        const expertDecision = await diceThroneAiRuntime.localPolicies.baseline.decide(expertContext);
        const expertEvaluations = (expertDecision?.providerMetadata?.evaluations ?? []) as Array<{
            kind: string;
            searchPriority?: number;
            shortlisted?: boolean;
        }>;

        expect(expertEvaluations.some((item) => (item.searchPriority ?? 0) > 0)).toBe(true);
        expect(expertEvaluations.some((item) => item.shortlisted)).toBe(true);
    });

    it('主阶段卖牌只在能立刻解锁可打出的牌时才生成，避免 AI 开局无脑清手', async () => {
        const state = createSetupWithHand(['card-unexpected', 'card-surprise'], { cp: 0 })(['0', '1'], fixedRandom);
        const legalActions = buildDiceThroneAiLegalActions({
            playerId: '0',
            state,
        });

        expect(legalActions.some((action) => action.kind === 'sell-card')).toBe(false);
        expect(legalActions.some((action) => action.kind === 'advance-phase')).toBe(true);

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'dicethrone-ai-no-blind-opening-sell',
            seatControllers: {
                '0': { type: 'local-ai', difficulty: 'expert' },
            },
        });

        expect(resolution?.playerId).toBe('0');
        expect(resolution?.action.kind).toBe('advance-phase');
    });

    it('主阶段卖牌在能立刻解锁 1CP 动作时仍应保留该行动线', () => {
        const state = createSetupWithHand(['card-unexpected', 'card-double'], { cp: 0 })(['0', '1'], fixedRandom);
        const legalActions = buildDiceThroneAiLegalActions({
            playerId: '0',
            state,
        });

        expect(
            legalActions.filter((action) => action.kind === 'sell-card').map((action) => action.metadata?.cardId),
        ).toEqual(['card-unexpected']);
        expect(
            legalActions.some((action) => action.kind === 'play-card' && action.metadata?.cardId === 'card-double'),
        ).toBe(false);
    });

    it('高动作密度下应启用 candidate loop 批次搜索，并产出 lookahead 前瞻贡献', async () => {
        const state = createHeroMatchup('paladin', 'monk', (core) => {
            const player = core.players['0'];
            const uniqueDeckCards: typeof player.deck = [];
            const seenIds = new Set<string>();
            for (const card of player.deck) {
                if (seenIds.has(card.id)) continue;
                seenIds.add(card.id);
                uniqueDeckCards.push(card);
                if (uniqueDeckCards.length >= 13) break;
            }
            player.hand = uniqueDeckCards.map((card) => ({ ...card }));
            player.deck = player.deck.filter((card) => !seenIds.has(card.id));
            player.resources[RESOURCE_IDS.CP] = 99;
        })(['0', '1'], fixedRandom);
        state.sys.phase = 'main1';
        state.core.activePlayerId = '0';

        const expertContext = buildAiDecisionContext({
            gameId: 'dicethrone',
            matchId: 'probe-candidate-loop-density',
            playerId: '0',
            visibleState: state,
            rulesVersion: null,
            decisionBudgetMs: 250,
            source: 'local',
            seatController: { type: 'local-ai', difficulty: 'expert' },
        });

        expect(expertContext.legalActions.length).toBeGreaterThan(12);

        const expertDecision = await diceThroneAiRuntime.localPolicies.baseline.decide(expertContext);
        const expertEvaluations = (expertDecision?.providerMetadata?.evaluations ?? []) as Array<{
            searched?: boolean;
            contributions: Array<{ scorerId: string }>;
        }>;

        expect(expertEvaluations.length).toBe(expertContext.legalActions.length);
        expect(expertEvaluations.some((item) => item.searched === true)).toBe(true);
        expect(expertEvaluations.some((item) => item.searched === false)).toBe(true);
        expect(
            expertEvaluations.some((item) => item.contributions.some((contribution) => contribution.scorerId === 'lookahead')),
        ).toBe(true);
        expect(
            expertEvaluations.some((item) => item.contributions.some((contribution) => contribution.scorerId === 'relative-utility')),
        ).toBe(true);
    });

    it('专家难度不会把无 projection 模型的骰面微操作抬进 strategy shortlist', async () => {
        const state = createHeroMatchup('paladin', 'monk')(['0', '1'], fixedRandom);
        state.sys.phase = 'offensiveRoll';
        state.core.rollCount = 1;
        state.core.rollLimit = 2;
        state.core.rollDiceCount = 5;
        state.core.rollConfirmed = false;
        state.core.players['0'].resources[RESOURCE_IDS.CP] = 2;
        state.core.dice = [
            { id: 0, value: 1, symbol: 'fist', isKept: false },
            { id: 1, value: 2, symbol: 'sword', isKept: false },
            { id: 2, value: 6, symbol: 'pray', isKept: false },
            { id: 3, value: 2, symbol: 'sword', isKept: false },
            { id: 4, value: 6, symbol: 'pray', isKept: false },
        ];

        const expertContext = buildAiDecisionContext({
            gameId: 'dicethrone',
            matchId: 'probe-micro-priority-guard',
            playerId: '0',
            visibleState: state,
            rulesVersion: null,
            decisionBudgetMs: 250,
            source: 'local',
            seatController: { type: 'local-ai', difficulty: 'expert' },
        });

        const expertDecision = await diceThroneAiRuntime.localPolicies.baseline.decide(expertContext);
        const expertEvaluations = (expertDecision?.providerMetadata?.evaluations ?? []) as Array<{
            kind: string;
            searchPriority?: number;
        }>;

        expect(expertEvaluations.some((item) => item.kind === 'toggle-die-lock')).toBe(true);
        expect(expertEvaluations.some((item) => item.kind === 'roll-dice')).toBe(true);
        expect(
            expertEvaluations
                .filter((item) => item.kind === 'toggle-die-lock' || item.kind === 'roll-dice' || item.kind === 'confirm-roll')
                .every((item) => (item.searchPriority ?? 0) === 0),
        ).toBe(true);
    });

    it('本地 AI 在紧缚且 0CP 无法继续重投时，不应继续锁骰循环', async () => {
        const state = createHeroMatchup('zhanshujia', 'paladin')(['0', '1'], fixedRandom);
        state.sys.phase = 'offensiveRoll';
        state.core.activePlayerId = '0';
        state.core.rollCount = 2;
        state.core.rollLimit = 3;
        state.core.rollConfirmed = false;
        state.core.players['0'].statusEffects[STATUS_IDS.BIND] = 1;
        state.core.players['0'].resources[RESOURCE_IDS.CP] = 0;
        state.core.dice = [
            { id: 0, value: 6, symbol: 'medal', isKept: false },
            { id: 1, value: 3, symbol: 'sabre', isKept: false },
            { id: 2, value: 3, symbol: 'sabre', isKept: false },
            { id: 3, value: 3, symbol: 'sabre', isKept: true },
            { id: 4, value: 6, symbol: 'medal', isKept: false },
        ];

        const legalActions = buildDiceThroneAiLegalActions({
            playerId: '0',
            state,
        });

        expect(legalActions.some((action) => action.kind === 'toggle-die-lock')).toBe(false);
        expect(legalActions.some((action) => action.kind === 'roll-dice')).toBe(false);
        expect(legalActions.some((action) => action.kind === 'confirm-roll')).toBe(true);

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'dicethrone-ai-bind-zero-cp-confirm',
            seatControllers: {
                '0': { type: 'local-ai', difficulty: 'expert' },
            },
        });

        expect(resolution?.playerId).toBe('0');
        expect(resolution?.action.kind).toBe('confirm-roll');
    });

    it('远程 AI 在可见大动作决策点应调用 provider', async () => {
        const providerId = 'test-remote-major-visible';
        const decide = vi.fn(async (context) => {
            const action = context.legalActions.find((candidate) => candidate.kind === 'play-card');
            return action ? { actionId: action.actionId } : null;
        });
        registerRemoteAiProvider({
            id: providerId,
            decide,
        });

        const state = createSetupWithHand(['card-enlightenment'], { cp: 0 })(['0', '1'], fixedRandom);
        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'remote-major-visible',
            seatControllers: {
                '0': { type: 'remote-ai', providerId, fallbackPolicyId: 'baseline' },
            },
        });

        expect(decide).toHaveBeenCalledTimes(1);
        expect(resolution?.playerId).toBe('0');
        expect(resolution?.source).toBe('remote-ai');
        expect(resolution?.action.kind).toBe('play-card');
        expect(resolution?.action.metadata).toMatchObject({ cardId: 'card-enlightenment' });
    });

    it('远程 AI 在开局选角色时应直接走本地 fallback，不发远程请求', async () => {
        const providerId = 'test-remote-setup-bypass';
        const decide = vi.fn(async (context) => {
            const action = context.legalActions[0];
            return action ? { actionId: action.actionId } : null;
        });
        registerRemoteAiProvider({
            id: providerId,
            decide,
        });

        const core = DiceThroneDomain.setup(['0', '1'], fixedRandom);
        core.selectedCharacters['0'] = 'monk';
        const state: MatchState<DiceThroneCore> = {
            core,
            sys: {
                phase: 'setup',
                interaction: { queue: [] },
            } as MatchState<DiceThroneCore>['sys'],
        };

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'remote-setup-bypass',
            seatControllers: {
                '1': { type: 'remote-ai', providerId, fallbackPolicyId: 'baseline' },
            },
        });

        expect(decide).not.toHaveBeenCalled();
        expect(resolution?.playerId).toBe('1');
        expect(resolution?.source).toBe('remote-ai-fallback');
        expect(resolution?.action.kind).toBe('setup-select-character');
    });

    it('远程 AI 在响应窗口打响应牌时应直接走本地 fallback，不发远程请求', async () => {
        const providerId = 'test-remote-response-card-bypass';
        const decide = vi.fn(async (context) => {
            const action = context.legalActions[0];
            return action ? { actionId: action.actionId } : null;
        });
        registerRemoteAiProvider({
            id: providerId,
            decide,
        });

        const state = createHeroMatchup('gunslinger', 'monk')(['0', '1'], fixedRandom);
        state.core.players['0'].hand = [getCardById('card-next-time')];
        state.core.players['0'].resources[RESOURCE_IDS.CP] = 1;
        state.core.pendingDamage = {
            id: 'dmg-remote-response-card',
            sourcePlayerId: '1',
            targetPlayerId: '0',
            originalDamage: 6,
            currentDamage: 6,
            responseType: 'beforeDamageReceived',
            responderId: '0',
            isFullyEvaded: false,
        };
        state.sys.responseWindow = {
            current: {
                id: 'rw-remote-response-card',
                windowType: 'afterAttackResolved',
                responderQueue: ['0'],
                currentResponderIndex: 0,
                passedPlayers: [],
            },
        };

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'remote-response-card-bypass',
            seatControllers: {
                '0': { type: 'remote-ai', providerId, fallbackPolicyId: 'baseline' },
            },
        });

        expect(decide).not.toHaveBeenCalled();
        expect(resolution?.playerId).toBe('0');
        expect(resolution?.source).toBe('remote-ai-fallback');
        expect(resolution?.action.kind).toBe('response-play-card');
        expect(resolution?.action.metadata).toMatchObject({
            cardId: 'card-next-time',
        });
    });

    it('远程 AI 在微决策响应窗口应直接走本地 fallback，不发远程请求', async () => {
        const providerId = 'test-remote-micro-bypass';
        const decide = vi.fn(async (context) => {
            const action = context.legalActions[0];
            return action ? { actionId: action.actionId } : null;
        });
        registerRemoteAiProvider({
            id: providerId,
            decide,
        });

        const state = createHeroMatchup('monk', 'paladin')(['0', '1'], fixedRandom);
        state.core.players['0'].tokens[TOKEN_IDS.TAIJI] = 1;
        state.core.players['0'].resources[RESOURCE_IDS.HP] = 2;
        state.core.pendingDamage = {
            id: 'dmg-remote-micro-response',
            sourcePlayerId: '1',
            targetPlayerId: '0',
            originalDamage: 5,
            currentDamage: 5,
            responseType: 'beforeDamageReceived',
            responderId: '0',
            isFullyEvaded: false,
        };
        state.sys.responseWindow = {
            current: {
                id: 'rw-remote-micro-response',
                windowType: 'afterAttackResolved',
                responderQueue: ['0'],
                currentResponderIndex: 0,
                passedPlayers: [],
            },
        };

        const resolution = await resolveNextLocalAiAction({
            engineConfig,
            state,
            matchId: 'remote-micro-bypass',
            seatControllers: {
                '0': { type: 'remote-ai', providerId, fallbackPolicyId: 'baseline' },
            },
        });

        expect(decide).not.toHaveBeenCalled();
        expect(resolution?.playerId).toBe('0');
        expect(resolution?.source).toBe('remote-ai-fallback');
        expect(resolution?.action.kind).toBe('token-response');
        expect(resolution?.action.metadata).toMatchObject({
            tokenId: TOKEN_IDS.TAIJI,
        });
    });
});

describe('作弊发牌 atlas 索引保护', () => {
    const createUpgradeAtlasState = () => createHeroMatchup('gunslinger', 'monk', (core) => {
        const player = core.players['0'];
        player.hand = [];
        player.discard = [];
        player.deck = [
            getCardById('upgrade-take-cover-2'),
            getCardById('upgrade-deadeye-2'),
            ...player.deck.filter((card) => card.id !== 'upgrade-take-cover-2' && card.id !== 'upgrade-deadeye-2'),
        ];
    })(['0', '1'], fixedRandom);

    it('gunslinger slot 23 现在只对应 upgrade-take-cover-2，按 atlas index 应可唯一发牌', () => {
        const state = createUpgradeAtlasState();
        const nextCore = diceThroneCheatModifier.dealCardByAtlasIndex!(state.core, '0', 23);

        expect(nextCore.players['0'].hand.map((card) => card.id)).toEqual(['upgrade-take-cover-2']);
        expect(nextCore.players['0'].deck).toHaveLength(state.core.players['0'].deck.length - 1);
    });

    it('gunslinger slot 24 现在只对应 upgrade-deadeye-2，按 atlas index 应可唯一发牌', () => {
        const state = createUpgradeAtlasState();
        const nextCore = diceThroneCheatModifier.dealCardByAtlasIndex!(state.core, '0', 24);

        expect(nextCore.players['0'].hand.map((card) => card.id)).toEqual(['upgrade-deadeye-2']);
        expect(nextCore.players['0'].deck).toHaveLength(state.core.players['0'].deck.length - 1);
    });

    it('精确 deckIndex 发牌仍可发出 upgrade-deadeye-2', () => {
        const state = createUpgradeAtlasState();
        const nextCore = diceThroneCheatModifier.dealCardByIndex!(state.core, '0', 1);

        expect(nextCore.players['0'].hand.map((card) => card.id)).toEqual(['upgrade-deadeye-2']);
        expect(nextCore.players['0'].deck.map((card) => card.id)).not.toContain('upgrade-deadeye-2');
    });

    it('atlas 对应卡已不在剩余牌库时，仍可直接补到手牌', () => {
        const state = createHeroMatchup('barbarian', 'monk', (core) => {
            const player = core.players['0'];
            player.hand = [getCardById('card-bye-bye')];
            player.discard = [];
            player.deck = player.deck.filter((card) => card.id !== 'card-bye-bye');
        })(['0', '1'], fixedRandom);

        const nextCore = diceThroneCheatModifier.dealCardByAtlasIndex!(state.core, '0', 26);

        expect(nextCore.players['0'].deck).toHaveLength(state.core.players['0'].deck.length);
        expect(nextCore.players['0'].hand.filter((card) => card.id === 'card-bye-bye')).toHaveLength(2);
    });

    it('可按 cardId 直接补牌到手牌，不依赖剩余牌库', () => {
        const state = createHeroMatchup('barbarian', 'monk', (core) => {
            const player = core.players['0'];
            player.hand = [];
            player.discard = [getCardById('card-bye-bye')];
            player.deck = player.deck.filter((card) => card.id !== 'card-bye-bye');
        })(['0', '1'], fixedRandom);

        const nextCore = diceThroneCheatModifier.addCardToHandByCardId!(state.core, '0', 'card-bye-bye');

        expect(nextCore.players['0'].deck).toHaveLength(state.core.players['0'].deck.length);
        expect(nextCore.players['0'].discard).toHaveLength(state.core.players['0'].discard.length);
        expect(nextCore.players['0'].hand.filter((card) => card.id === 'card-bye-bye')).toHaveLength(1);
    });

    it('samurai atlas 4 应发出 card-super-double，而不是 card-me-too', () => {
        const state = createHeroMatchup('samurai', 'monk', (core) => {
            const player = core.players['0'];
            player.hand = [];
            player.discard = [];
            player.deck = [
                getCardById('card-super-double'),
                getCardById('card-me-too'),
                ...player.deck.filter((card) => card.id !== 'card-super-double' && card.id !== 'card-me-too'),
            ];
        })(['0', '1'], fixedRandom);

        const nextCore = diceThroneCheatModifier.dealCardByAtlasIndex!(state.core, '0', 4);
        const dealtCard = nextCore.players['0'].hand[0];

        expect(dealtCard?.id).toBe('card-super-double');
        expect(dealtCard?.effects?.[0]?.action).toMatchObject({
            type: 'drawCard',
            drawCount: 3,
        });
    });
});

describe('调试改骰与当前骰区一致', () => {
    it('当前骰区存在时，调试改骰必须同步玩家实际看到的骰面', () => {
        const core = createHeroMatchup('monk', 'paladin')(['0', '1'], fixedRandom).core;
        const currentRollContext = createMainRollContext(core, {
            phase: 'offensiveRoll',
            ownerPlayerId: '0',
            dice: core.dice,
        });

        const nextCore = diceThroneCheatModifier.setDice!({
            ...core,
            currentRollContext,
        }, [6, 5, 4, 3, 2]);

        expect(nextCore.dice.map((die) => die.value)).toEqual([6, 5, 4, 3, 2]);
        expect(getCurrentRollDice(nextCore, 'offensiveRoll').map((die) => die.value)).toEqual([6, 5, 4, 3, 2]);
    });

    it('奖励骰当前骰区存在时，调试改骰必须同步奖励骰骰面和结算参数', () => {
        const core = createHeroMatchup('pyromancer', 'barbarian')(['0', '1'], fixedRandom).core;
        core.dice = core.dice.map((die, index) => ({
            ...die,
            id: index,
            value: 1,
            symbol: 'fire',
            symbols: ['fire'],
            ownerId: '0',
        }));
        const settlement: PendingBonusDiceSettlement = {
            id: 'debug-pyro-blast-bonus',
            sourceAbilityId: 'pyro-blast-2-roll',
            attackerId: '0',
            targetId: '1',
            dice: [{
                index: 0,
                value: 1,
                face: 'fire',
                effectKey: 'bonusDie.effect.pyroBlast2Die',
                effectParams: { value: 1 },
            }],
            rerollCostTokenId: TOKEN_IDS.TAIJI,
            rerollCostAmount: 0,
            rerollCount: 0,
            readyToSettle: false,
            customResolutionId: 'pyro-blast-roll',
            resolutionMode: 'attackBonus',
        };
        const coreWithBonus: DiceThroneCore = {
            ...core,
            pendingBonusDiceSettlement: settlement,
        };

        const nextCore = diceThroneCheatModifier.setDice!({
            ...coreWithBonus,
            currentRollContext: createBonusRollContextFromSettlement(coreWithBonus, settlement),
        }, [6]);

        expect(nextCore.pendingBonusDiceSettlement?.dice[0]).toMatchObject({
            value: 6,
            face: 'meteor',
            effectParams: { value: 6 },
        });
        expect(nextCore.currentRollContext?.dice[0]).toMatchObject({
            value: 6,
            symbol: 'meteor',
            symbols: ['meteor'],
        });
        expect(nextCore.dice.map((die) => die.value)).toEqual([1, 1, 1, 1, 1]);
    });

    it('主投骰阶段存在回看骰时，调试改骰必须优先写入真实当前骰池', () => {
        const core = createHeroMatchup('monk', 'paladin')(['0', '1'], fixedRandom).core;
        const replayContext = createMainRollContext(core, {
            phase: 'offensiveRoll',
            ownerPlayerId: '0',
            dice: core.dice.map((die) => ({ ...die, value: 1 })),
        });

        const nextCore = diceThroneCheatModifier.setDice!({
            ...core,
            rollCount: 1,
            rollConfirmed: true,
            currentRollContext: {
                ...replayContext,
                status: 'settled',
                display: { ...replayContext.display, replayOnly: true },
            },
        }, [6, 5, 4, 3, 2], { phase: 'offensiveRoll' });

        expect(nextCore.dice.map((die) => die.value)).toEqual([6, 5, 4, 3, 2]);
    });

    it('非投骰阶段只剩回看骰时，调试改骰必须同步玩家当前看到的回看骰面', () => {
        const core = createHeroMatchup('monk', 'paladin')(['0', '1'], fixedRandom).core;
        const replayContext = createMainRollContext(core, {
            phase: 'offensiveRoll',
            ownerPlayerId: '0',
            dice: core.dice.map((die) => ({ ...die, value: 1 })),
        });

        const nextCore = diceThroneCheatModifier.setDice!({
            ...core,
            rollCount: 1,
            rollConfirmed: true,
            currentRollContext: {
                ...replayContext,
                status: 'settled',
                display: { ...replayContext.display, replayOnly: true },
            },
        }, [6, 5, 4, 3, 2], { phase: 'main2' });

        expect(nextCore.currentRollContext?.dice.map((die) => die.value)).toEqual([6, 5, 4, 3, 2]);
    });

    it('已选角但骰子数组缺失时，调试改骰应创建真实角色骰并写入输入值', () => {
        const core = createHeroMatchup('monk', 'paladin')(['0', '1'], fixedRandom).core;

        const nextCore = diceThroneCheatModifier.setDice!({
            ...core,
            dice: [],
            rollCount: 0,
            rollConfirmed: false,
            currentRollContext: undefined,
        }, [6, 5, 4, 3, 2], { phase: 'offensiveRoll' });

        expect(nextCore.dice.map((die) => die.value)).toEqual([6, 5, 4, 3, 2]);
        expect(nextCore.dice.map((die) => die.definitionId)).toEqual([
            'monk-dice',
            'monk-dice',
            'monk-dice',
            'monk-dice',
            'monk-dice',
        ]);
        expect(nextCore.rollCount).toBe(1);
    });

    it('主投骰阶段存在回看骰时，调试改骰必须优先写入真实当前骰池', () => {
        const core = createHeroMatchup('monk', 'paladin')(['0', '1'], fixedRandom).core;
        const replayContext = createMainRollContext(core, {
            phase: 'offensiveRoll',
            ownerPlayerId: '0',
            dice: core.dice.map((die) => ({ ...die, value: 1 })),
        });

        const nextCore = diceThroneCheatModifier.setDice!({
            ...core,
            rollCount: 1,
            rollConfirmed: true,
            currentRollContext: {
                ...replayContext,
                status: 'settled',
                display: { ...replayContext.display, replayOnly: true },
            },
        }, [6, 5, 4, 3, 2], { phase: 'offensiveRoll' });

        expect(nextCore.dice.map((die) => die.value)).toEqual([6, 5, 4, 3, 2]);
    });

    it('非投骰阶段只剩回看骰时，调试改骰必须同步玩家当前看到的回看骰面', () => {
        const core = createHeroMatchup('monk', 'paladin')(['0', '1'], fixedRandom).core;
        const replayContext = createMainRollContext(core, {
            phase: 'offensiveRoll',
            ownerPlayerId: '0',
            dice: core.dice.map((die) => ({ ...die, value: 1 })),
        });

        const nextCore = diceThroneCheatModifier.setDice!({
            ...core,
            rollCount: 1,
            rollConfirmed: true,
            currentRollContext: {
                ...replayContext,
                status: 'settled',
                display: { ...replayContext.display, replayOnly: true },
            },
        }, [6, 5, 4, 3, 2], { phase: 'main2' });

        expect(nextCore.currentRollContext?.dice.map((die) => die.value)).toEqual([6, 5, 4, 3, 2]);
    });

    it('已选角但骰子数组缺失时，调试改骰应创建真实角色骰并写入输入值', () => {
        const core = createHeroMatchup('monk', 'paladin')(['0', '1'], fixedRandom).core;

        const nextCore = diceThroneCheatModifier.setDice!({
            ...core,
            dice: [],
            rollCount: 0,
            rollConfirmed: false,
            currentRollContext: undefined,
        }, [6, 5, 4, 3, 2], { phase: 'offensiveRoll' });

        expect(nextCore.dice.map((die) => die.value)).toEqual([6, 5, 4, 3, 2]);
        expect(nextCore.dice.map((die) => die.definitionId)).toEqual([
            'monk-dice',
            'monk-dice',
            'monk-dice',
            'monk-dice',
            'monk-dice',
        ]);
        expect(nextCore.rollCount).toBe(1);
    });
});

describe('本地 AI setup 视角切换', () => {
    it('应先保留房主视角，房主选完后切到 AI 座位，AI 准备后回到房主', () => {
        const core = DiceThroneDomain.setup(['0', '1'], fixedRandom);
        const state: MatchState<DiceThroneCore> = {
            core,
            sys: {
                phase: 'setup',
                interaction: { queue: [] },
            } as MatchState<DiceThroneCore>['sys'],
        };

        expect(resolveDiceThroneLocalPregameControlledPlayerId({
            state,
            localPlayerId: '0',
            seatControllers: {
                '0': { type: 'human' },
                '1': { type: 'local-ai' },
            },
        })).toBe('0');

        core.selectedCharacters['0'] = 'barbarian';
        expect(resolveDiceThroneLocalPregameControlledPlayerId({
            state,
            localPlayerId: '0',
            seatControllers: {
                '0': { type: 'human' },
                '1': { type: 'local-ai' },
            },
        })).toBe('1');

        core.selectedCharacters['1'] = 'monk';
        expect(resolveDiceThroneLocalPregameControlledPlayerId({
            state,
            localPlayerId: '0',
            seatControllers: {
                '0': { type: 'human' },
                '1': { type: 'local-ai' },
            },
        })).toBe('1');

        core.readyPlayers['1'] = true;
        expect(resolveDiceThroneLocalPregameControlledPlayerId({
            state,
            localPlayerId: '0',
            seatControllers: {
                '0': { type: 'human' },
                '1': { type: 'local-ai' },
            },
        })).toBe('0');
    });
});


// ============================================================================
// 2. REROLL_DIE — 交互上下文中重掷单个骰子
// ============================================================================

describe('REROLL_DIE 交互中重掷骰子', () => {
    it('普通重投与战术优势重投共享同一颗当前骰的重投事件结果', () => {
        const random = createQueuedRandom([6]);
        const state = createHeroMatchup('zhanshujia', 'barbarian')(['0', '1'], random);
        state.sys.phase = 'offensiveRoll';
        state.core.activePlayerId = '0';
        state.core.rollCount = 1;
        state.core.rollConfirmed = false;
        state.core.dice = state.core.dice.map((die, index) => ({
            ...die,
            id: index,
            value: 3,
            isKept: false,
            ownerId: '0',
        }));
        state.core.players['0'].passiveAbilities = ZHANSHUJIA_PASSIVE_ABILITIES;
        state.core.players['0'].tokens[TOKEN_IDS.TACTICAL_ADVANTAGE] = 1;

        const normalEvents = DiceThroneDomain.execute(
            state,
            cmd('REROLL_DIE', '0', { dieId: 0 }),
            createQueuedRandom([6]),
        );
        const passiveEvents = DiceThroneDomain.execute(
            state,
            cmd('USE_PASSIVE_ABILITY', '0', {
                passiveId: 'zhanshujia-tactical-advantage',
                actionIndex: 1,
                targetDieId: 0,
            }),
            createQueuedRandom([6]),
        );
        const normalReroll = normalEvents.find((event) => event.type === 'DIE_REROLLED');
        const passiveReroll = passiveEvents.find((event) => event.type === 'DIE_REROLLED');

        expect(passiveReroll?.payload).toMatchObject(normalReroll?.payload ?? {});
        expect(passiveEvents.some((event) => event.type === 'TOKEN_CONSUMED')).toBe(true);
    });

    it('有 pendingInteraction 时重掷骰子成功', () => {
        const diceValues = [3, 3, 3, 3, 3, 5]; // 第 6 个值用于重掷
        const random = createQueuedRandom(diceValues);

        // 先推进到 offensiveRoll 并掷骰
        let state = createInitializedState(['0', '1'], random);
        state = execCmd(state, cmd('ADVANCE_PHASE', '0'), random);
        state = execCmd(state, cmd('ROLL_DICE', '0'), random);

        const dieBefore = state.core.dice[0].value;
        expect(dieBefore).toBe(3);

        // 注入 pendingInteraction（模拟卡牌效果触发重掷交互）
        injectPendingInteraction(state, {
            id: 'reroll-test',
            playerId: '0',
            sourceCardId: 'test-card',
            type: 'rerollDie',
            titleKey: 'test',
            selectCount: 1,
            selected: [],
        });

        // 重掷 die 0
        state = execCmd(state, cmd('REROLL_DIE', '0', { dieId: 0 }), random);
        expect(state.core.dice[0].value).toBe(5);
    });

    it('无 pendingInteraction 时重掷失败', () => {
        const diceValues = [3, 3, 3, 3, 3];
        const random = createQueuedRandom(diceValues);

        let state = createInitializedState(['0', '1'], random);
        state = execCmd(state, cmd('ADVANCE_PHASE', '0'), random);
        state = execCmd(state, cmd('ROLL_DICE', '0'), random);

        const result = tryCmd(state, cmd('REROLL_DIE', '0', { dieId: 0 }), random);
        expect(result.success).toBe(false);
    });

    it('非交互玩家重掷失败', () => {
        const diceValues = [3, 3, 3, 3, 3];
        const random = createQueuedRandom(diceValues);

        let state = createInitializedState(['0', '1'], random);
        state = execCmd(state, cmd('ADVANCE_PHASE', '0'), random);
        state = execCmd(state, cmd('ROLL_DICE', '0'), random);

        injectPendingInteraction(state, {
            id: 'reroll-test',
            playerId: '0',
            sourceCardId: 'test-card',
            type: 'rerollDie',
            titleKey: 'test',
            selectCount: 1,
            selected: [],
        });

        // 玩家 1 尝试重掷
        const result = tryCmd(state, cmd('REROLL_DIE', '1', { dieId: 0 }), random);
        expect(result.success).toBe(false);
    });

    it('不存在的骰子 ID 重掷失败', () => {
        const diceValues = [3, 3, 3, 3, 3];
        const random = createQueuedRandom(diceValues);

        let state = createInitializedState(['0', '1'], random);
        state = execCmd(state, cmd('ADVANCE_PHASE', '0'), random);
        state = execCmd(state, cmd('ROLL_DICE', '0'), random);

        injectPendingInteraction(state, {
            id: 'reroll-test',
            playerId: '0',
            sourceCardId: 'test-card',
            type: 'rerollDie',
            titleKey: 'test',
            selectCount: 1,
            selected: [],
        });

        const result = tryCmd(state, cmd('REROLL_DIE', '0', { dieId: 99 }), random);
        expect(result.success).toBe(false);
    });
});


// ============================================================================
// 3. RESOLVE_CHOICE — 选择交互解决
//
// 注意：RESOLVE_CHOICE 在 execute 层是 no-op（break），validate 始终返回 ok()。
// 实际选择流程通过 SYS_INTERACTION_RESPOND 命令走 InteractionSystem。
// 这里测试 RESOLVE_CHOICE 命令本身的通过性，以及通过 GTR 测试完整选择流程。
// ============================================================================

describe('RESOLVE_CHOICE 选择交互', () => {
    it('RESOLVE_CHOICE 命令始终通过验证（no-op）', () => {
        const state = createInitializedState(['0', '1'], fixedRandom);
        const result = tryCmd(state, cmd('RESOLVE_CHOICE', '0', { statusId: 'knockdown' }));
        // validate 始终返回 ok()，execute 是 break（no-op）
        expect(result.success).toBe(true);
    });

    it('完整选择流程已在 monk-coverage.test.ts 中覆盖', () => {
        // RESOLVE_CHOICE 在 execute 层是 no-op（break），validate 始终返回 ok()。
        // 实际选择流程通过 SYS_INTERACTION_RESPOND 走 InteractionSystem：
        //   CHOICE_REQUESTED 事件 → InteractionSystem 队列 simple-choice →
        //   SYS_INTERACTION_RESPOND → SYS_INTERACTION_RESOLVED → CHOICE_RESOLVED
        // 完整选择流程（禅忘二选一等）已在 monk-coverage.test.ts 中通过 GTR 覆盖。
        // 这里仅验证 RESOLVE_CHOICE 命令本身的通过性。
        const state = createInitializedState(['0', '1'], fixedRandom);

        // 在任意阶段都能通过验证（因为 validate 始终返回 ok）
        const result1 = tryCmd(state, cmd('RESOLVE_CHOICE', '0', { statusId: 'knockdown' }));
        expect(result1.success).toBe(true);

        // 不同玩家也能通过
        const result2 = tryCmd(state, cmd('RESOLVE_CHOICE', '1', { statusId: 'poison' }));
        expect(result2.success).toBe(true);
    });
});
