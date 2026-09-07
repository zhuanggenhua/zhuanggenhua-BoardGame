import { beforeAll, describe, expect, it } from 'vitest';

import { initAllAbilities, resetAbilityInit } from '../../abilities';
import { clearRegistry } from '../../domain/abilityRegistry';
import { clearBaseAbilityRegistry } from '../../domain/baseAbilities';
import { clearInteractionHandlers } from '../../domain/abilityInteractionHandlers';
import { clearOngoingEffectRegistry } from '../../domain/ongoingEffects';
import { clearPowerModifierRegistry, getBasePowerModifiers, getEffectivePower, getPlayerEffectivePowerOnBase } from '../../domain/ongoingModifiers';
import { collectTriggers } from '../../domain/ongoingEffects';
import { maybeResolveReactionQueue } from '../../domain/reactionQueue';
import { SU_EVENTS, type SmashUpCore, type SmashUpEvent } from '../../domain/types';
import {
    applyEvents,
    getReactionPrompt,
    getReactionPromptOptionBySourceDefId,
    getPromptMulti,
    getSimpleChoicePrompt,
    invokeRegisteredAbilityContract,
    makeBase,
    makeCard,
    makeMatchState,
    makeMinion,
    makePlayer,
    makeState,
    respondToPromptOption,
    respondToPromptOptions,
    triggerBaseAbilityWithMS,
} from '../helpers';
import { defaultTestRandom } from '../testRunner';

beforeAll(() => {
    clearRegistry();
    clearBaseAbilityRegistry();
    clearPowerModifierRegistry();
    clearOngoingEffectRegistry();
    clearInteractionHandlers();
    resetAbilityInit();
    initAllAbilities();
});

function invoke(core: SmashUpCore, defId: string, tag: 'onPlay' | 'talent' | 'special', cardUid: string, baseIndex = 0, targetBaseIndex?: number) {
    return invokeRegisteredAbilityContract(defId, tag, {
        state: core,
        matchState: makeMatchState(core),
        playerId: '0',
        cardUid,
        defId,
        baseIndex,
        targetBaseIndex,
        random: defaultTestRandom,
        now: 100,
    });
}

describe('Munchkin 木精灵派系能力', () => {
    it('优雅贵族只有一个目标时仍停在手动选择，并让双方各抽一张', () => {
        const core = makeState({
            players: {
                '0': makePlayer('0', { deck: [makeCard('self-draw', 'test_minion', '0')] }),
                '1': makePlayer('1', { deck: [makeCard('other-draw', 'test_minion', '1')] }),
            },
        });
        const started = invoke(core, 'munchkin_elves_lord_of_the_prance', 'talent', 'lord');
        const prompt = getSimpleChoicePrompt(started.matchState!, 'munchkin_elves_lord_of_the_prance_choose_player');
        expect(prompt.autoResolveIfSingle).toBe(false);
        expect(prompt.options).toHaveLength(1);

        const resolved = respondToPromptOption(started.matchState!, option => option.value?.targetPlayerId === '1', '选择玩家1', '0');
        expect(resolved.success).toBe(true);
        expect(resolved.finalState.core.players['0'].hand.map(card => card.uid)).toContain('self-draw');
        expect(resolved.finalState.core.players['1'].hand.map(card => card.uid)).toContain('other-draw');
    });

    it('花之子先选玩家，再选力量不超过3的随从，并交换控制权', () => {
        const core = makeState({
            players: { '0': makePlayer('0'), '1': makePlayer('1') },
            bases: [makeBase('test_base', [
                makeMinion('flower', 'munchkin_elves_flower_child', '0', 2),
                makeMinion('weak', 'test_minion', '1', 3),
                makeMinion('strong', 'test_minion', '1', 4),
            ])],
        });
        const started = invoke(core, 'munchkin_elves_flower_child', 'onPlay', 'flower');
        const playerPrompt = getSimpleChoicePrompt(started.matchState!, 'munchkin_elves_flower_child_choose_player');
        expect(playerPrompt.autoResolveIfSingle).toBe(false);
        const afterPlayer = respondToPromptOption(started.matchState!, option => option.value?.targetPlayerId === '1', '选择玩家1', '0');
        const minionPrompt = getSimpleChoicePrompt(afterPlayer.finalState, 'munchkin_elves_flower_child_choose_minion');
        expect(minionPrompt.options.some((option: any) => option.value?.minionUid === 'weak')).toBe(true);
        expect(minionPrompt.options.some((option: any) => option.value?.minionUid === 'strong')).toBe(false);

        const resolved = respondToPromptOption(afterPlayer.finalState, option => option.value?.minionUid === 'weak', '选择弱随从', '0');
        expect(resolved.finalState.core.bases[0].minions.find(minion => minion.uid === 'flower')?.controller).toBe('1');
        expect(resolved.finalState.core.bases[0].minions.find(minion => minion.uid === 'weak')?.controller).toBe('0');
        expect(resolved.finalState.core.bases[0].minions.find(minion => minion.uid === 'flower')?.metadata?.flowerChildPartnerUid).toBe('weak');
    });

    it('力量训练让两位玩家分别手动选目标，效果分别为+2和+3', () => {
        const core = makeState({
            players: {
                '0': makePlayer('0'),
                '1': makePlayer('1'),
            },
            bases: [makeBase('test_base', [
                makeMinion('self', 'test_minion', '0', 2),
                makeMinion('other', 'test_minion', '1', 2),
            ])],
        });
        const started = invoke(core, 'munchkin_elves_pumping_iron', 'onPlay', 'pumping');
        const afterPlayer = respondToPromptOption(started.matchState!, option => option.value?.targetPlayerId === '1', '选择玩家1', '0');
        const otherPrompt = getSimpleChoicePrompt(afterPlayer.finalState, 'munchkin_elves_pumping_iron_choose_other_minion');
        expect(otherPrompt.playerId).toBe('1');
        const afterOther = respondToPromptOption(afterPlayer.finalState, option => option.value?.minionUid === 'other', '选择对方随从', '1');
        const selfPrompt = getSimpleChoicePrompt(afterOther.finalState, 'munchkin_elves_pumping_iron_choose_self_minion');
        expect(selfPrompt.playerId).toBe('0');
        const resolved = respondToPromptOption(afterOther.finalState, option => option.value?.minionUid === 'self', '选择己方随从', '0');
        expect(resolved.finalState.core.bases[0].minions.find(minion => minion.uid === 'other')?.tempPowerModifier).toBe(2);
        expect(resolved.finalState.core.bases[0].minions.find(minion => minion.uid === 'self')?.tempPowerModifier).toBe(3);
    });

    it('赶紧逃跑吧允许多选0个，并且多选1个时移动到手动选择的基地', () => {
        const core = makeState({
            players: { '0': makePlayer('0'), '1': makePlayer('1') },
            bases: [
                makeBase('source', [makeMinion('elf', 'test_minion', '0', 2)]),
                makeBase('destination'),
            ],
        });
        const started = invoke(core, 'munchkin_elves_run_away_more', 'special', 'run-more', 0, 0);
        const destinationPrompt = getSimpleChoicePrompt(started.matchState!, 'munchkin_elves_run_away_more_choose_destination');
        expect(destinationPrompt.autoResolveIfSingle).toBe(false);
        const afterDestination = respondToPromptOption(started.matchState!, option => option.value?.baseIndex === 1, '选择基地2', '0');
        const minionPrompt = getSimpleChoicePrompt(afterDestination.finalState, 'munchkin_elves_run_away_more_choose_minions');
        expect(getPromptMulti(minionPrompt)).toMatchObject({ min: 0, max: 1 });

        const skipped = respondToPromptOptions(afterDestination.finalState, [], '0');
        expect(skipped.success).toBe(true);
        expect(skipped.finalState.core.bases[0].minions.map(minion => minion.uid)).toEqual(['elf']);

        const afterDestinationAgain = respondToPromptOption(started.matchState!, option => option.value?.baseIndex === 1, '再次选择基地2', '0');
        const movedMinionId = getSimpleChoicePrompt(afterDestinationAgain.finalState, 'munchkin_elves_run_away_more_choose_minions').options.find((option: any) => option.value?.minionUid === 'elf')?.id;
        const moved = respondToPromptOptions(afterDestinationAgain.finalState, [movedMinionId], '0');
        expect(moved.finalState.core.bases[0].minions).toHaveLength(0);
        expect(moved.finalState.core.bases[1].minions.map(minion => minion.uid)).toEqual(['elf']);
    });

    it('援助山谷按当前回合玩家给其他玩家随从+1，树屋保留两段手动交互', () => {
        const core = makeState({
            currentPlayerIndex: 0,
            bases: [makeBase('base_helpers_hollow', [
                makeMinion('own', 'test_minion', '0', 2),
                makeMinion('other', 'test_minion', '1', 2),
            ])],
        });
        expect(getBasePowerModifiers(core, 0, '0')).toBe(0);
        expect(getBasePowerModifiers(core, 0, '1')).toBe(1);
        expect(getPlayerEffectivePowerOnBase(core, core.bases[0], 0, '1')).toBe(3);

        const treehouseState = makeState({
            bases: [makeBase('base_treehouse', [makeMinion('played', 'test_minion', '0', 2)])],
        });
        const result = triggerBaseAbilityWithMS('base_treehouse', 'onMinionPlayed', {
            state: treehouseState,
            baseIndex: 0,
            baseDefId: 'base_treehouse',
            playerId: '0',
            minionUid: 'played',
            now: 100,
        });
        const playerPrompt = getSimpleChoicePrompt(result.matchState!, 'base_treehouse_choose_player');
        expect(playerPrompt.autoResolveIfSingle).toBe(false);
        const afterPlayer = respondToPromptOption(result.matchState!, option => option.value?.targetPlayerId === '1', '选择玩家1', '0');
        const drawPrompt = getSimpleChoicePrompt(afterPlayer.finalState, 'base_treehouse_choose_draw');
        expect(drawPrompt.playerId).toBe('1');
    });

    it('舞动之根先重洗每位玩家，再从最新牌库抽牌', () => {
        const core = makeState({
            players: {
                '0': makePlayer('0', { deck: [makeCard('deck-card', 'test_minion', '0')], discard: [makeCard('discard-card', 'test_action', 'action', '0')] }),
                '1': makePlayer('1', { discard: [makeCard('other-discard', 'test_minion', '1')] }),
            },
        });
        const result = invoke(core, 'munchkin_elves_dancing_root', 'onPlay', 'root');
        expect(result.events.filter(event => event.type === SU_EVENTS.DECK_RESHUFFLED)).toHaveLength(2);
        expect(result.events.some(event => event.type === SU_EVENTS.CARDS_DRAWN)).toBe(true);
        const finalState = applyEvents(core, result.events);
        expect(finalState.players['0'].deck.map(card => card.uid)).toContain('discard-card');
        expect(finalState.players['0'].discard).toHaveLength(0);
    });

    it('贸易把贸易本卡交给目标玩家，而不是随机交出自己的普通手牌', () => {
        const core = makeState({
            players: {
                '0': makePlayer('0', {
                    hand: [
                        makeCard('trade', 'munchkin_elves_trade', 'action', '0'),
                        makeCard('keep', 'test_minion', '0'),
                    ],
                }),
                '1': makePlayer('1', {
                    hand: [makeCard('target', 'test_action', 'action', '1')],
                }),
            },
        });

        const started = invoke(core, 'munchkin_elves_trade', 'onPlay', 'trade');
        const prompt = getSimpleChoicePrompt(started.matchState!, 'munchkin_elves_trade_choose_player');
        expect(prompt.autoResolveIfSingle).toBe(false);

        const resolved = respondToPromptOption(started.matchState!, option => option.value?.targetPlayerId === '1', '选择玩家1', '0');
        expect(resolved.success).toBe(true);
        expect(resolved.finalState.core.players['0'].hand.map(card => card.uid)).toEqual(expect.arrayContaining(['keep', 'target']));
        expect(resolved.finalState.core.players['0'].hand.map(card => card.uid)).not.toContain('trade');
        expect(resolved.finalState.core.players['1'].hand.map(card => card.uid)).toEqual(['trade']);
    });

    it('逃跑吧！没有对手随从时不会排出空的第二步选择', () => {
        const core = makeState({
            players: { '0': makePlayer('0'), '1': makePlayer('1') },
            bases: [makeBase('source', [makeMinion('own', 'test_minion', '0', 2)])],
        });

        const started = invoke(core, 'munchkin_elves_run_away', 'special', 'run-away', 0, 0);
        const ownPrompt = getSimpleChoicePrompt(started.matchState!, 'munchkin_elves_run_away_choose_own_minion');
        const afterOwn = respondToPromptOption(started.matchState!, option => option.value?.minionUid === 'own', '选择己方随从', '0');

        expect(ownPrompt.options).toHaveLength(1);
        expect(afterOwn.success).toBe(true);
        expect(afterOwn.finalState.sys.interaction?.current).toBeUndefined();
    });

    it('精灵斗士在对手打出随从后让双方手动完成力量指示物选择', () => {
        const core = makeState({
            players: {
                '0': makePlayer('0'),
                '1': makePlayer('1'),
            },
            bases: [makeBase('test_base', [
                makeMinion('fae', 'munchkin_elves_fae_fighter', '0', 5),
                makeMinion('played', 'test_minion', '1', 2),
                makeMinion('ally', 'test_minion', '0', 2),
            ])],
        });
        const played = core.bases[0].minions.find(minion => minion.uid === 'played');
        const queued = collectTriggers(core, 'onMinionPlayed', {
            state: core,
            matchState: makeMatchState(core),
            playerId: '1',
            baseIndex: 0,
            triggerMinionUid: 'played',
            triggerMinionDefId: 'test_minion',
            triggerMinion: played,
            random: defaultTestRandom,
            now: 200,
        });
        expect(queued?.payload.triggers).toHaveLength(1);
        expect(queued?.payload.triggers[0].ownerPlayerId).toBe('0');

        const queuedState = maybeResolveReactionQueue(
            makeMatchState({ ...core, triggerQueue: queued!.payload.triggers }),
            defaultTestRandom,
            201,
        );
        expect(queuedState).toBeDefined();
        const reactionPrompt = getReactionPrompt(queuedState!.state);
        const reactionOption = getReactionPromptOptionBySourceDefId(
            queuedState!.state,
            reactionPrompt,
            'munchkin_elves_fae_fighter',
        );
        const choseTrigger = respondToPromptOption(
            queuedState!.state,
            option => option.id === reactionOption.id,
            '选择精灵斗士反应',
            '0',
        );
        const targetPrompt = getSimpleChoicePrompt(
            choseTrigger.finalState,
            'munchkin_elves_fae_fighter_choose_target',
        );
        expect(targetPrompt.autoResolveIfSingle).toBe(false);
        const resolved = respondToPromptOption(
            choseTrigger.finalState,
            option => option.value?.minionUid === 'ally',
            '选择己方随从',
            '0',
        );
        const finalBase = resolved.finalState.core.bases[0];
        expect(finalBase.minions.find(minion => minion.uid === 'played')?.powerCounters).toBe(1);
        expect(finalBase.minions.find(minion => minion.uid === 'ally')?.powerCounters).toBe(1);
    });

    it('精灵帮助大师只给同基地其他玩家的随从临时加 1 力量', () => {
        const core = makeState({
            bases: [
                makeBase('test_base', [
                    makeMinion('guru', 'munchkin_elves_elf_help_guru', '0', 2),
                    makeMinion('same-base-opponent', 'test_minion', '1', 2),
                ]),
                makeBase('other-base', [makeMinion('other-base-opponent', 'test_minion', '1', 2)]),
            ],
        });
        const result = invoke(core, 'munchkin_elves_elf_help_guru', 'talent', 'guru', 0);
        const finalState = applyEvents(core, result.events);
        expect(getEffectivePower(finalState, finalState.bases[0].minions.find(minion => minion.uid === 'guru')!, 0)).toBe(2);
        expect(getEffectivePower(finalState, finalState.bases[0].minions.find(minion => minion.uid === 'same-base-opponent')!, 0)).toBe(3);
        expect(getEffectivePower(finalState, finalState.bases[1].minions.find(minion => minion.uid === 'other-base-opponent')!, 1)).toBe(2);
    });

    it('木精灵临时力量和临时基地力量在下一回合开始清理', () => {
        const pumpingCore = makeState({
            players: {
                '0': makePlayer('0'),
                '1': makePlayer('1'),
            },
            bases: [makeBase('test_base', [
                makeMinion('self', 'test_minion', '0', 2),
                makeMinion('other', 'test_minion', '1', 2),
            ])],
        });
        const pumpingStarted = invoke(pumpingCore, 'munchkin_elves_pumping_iron', 'onPlay', 'pumping');
        const afterPlayer = respondToPromptOption(pumpingStarted.matchState!, option => option.value?.targetPlayerId === '1', '选择玩家1', '0');
        const afterOther = respondToPromptOption(afterPlayer.finalState, option => option.value?.minionUid === 'other', '选择对方随从', '1');
        const boosted = respondToPromptOption(afterOther.finalState, option => option.value?.minionUid === 'self', '选择己方随从', '0').finalState.core;

        expect(getEffectivePower(boosted, boosted.bases[0].minions.find(minion => minion.uid === 'other')!, 0)).toBe(4);
        expect(getEffectivePower(boosted, boosted.bases[0].minions.find(minion => minion.uid === 'self')!, 0)).toBe(5);

        const clearedMinions = applyEvents(boosted, [{
            type: SU_EVENTS.TURN_STARTED,
            payload: { playerId: '1', turnNumber: 2 },
            timestamp: 200,
        } as SmashUpEvent]);
        expect(getEffectivePower(clearedMinions, clearedMinions.bases[0].minions.find(minion => minion.uid === 'other')!, 0)).toBe(2);
        expect(getEffectivePower(clearedMinions, clearedMinions.bases[0].minions.find(minion => minion.uid === 'self')!, 0)).toBe(2);

        const helpingCore = makeState({
            players: {
                '0': makePlayer('0', { vp: 2 }),
                '1': makePlayer('1', { vp: 3 }),
            },
            bases: [makeBase('test_base', [
                makeMinion('helper', 'test_minion', '0', 1),
                makeMinion('target', 'test_minion', '1', 4),
            ])],
        });
        const helpingStarted = invoke(helpingCore, 'munchkin_elves_helping_hands', 'special', 'helping-hands', 0, 0);
        const helpingAfterPlayer = respondToPromptOption(helpingStarted.matchState!, option => option.value?.targetPlayerId === '1', '选择目标玩家', '0');
        const armed = respondToPromptOption(helpingAfterPlayer.finalState, option => option.value?.minionUid === 'helper', '选择己方随从', '0').finalState.core;

        expect(getPlayerEffectivePowerOnBase(armed, armed.bases[0], 0, '1')).toBe(6);
        expect(getEffectivePower(armed, armed.bases[0].minions.find(minion => minion.uid === 'helper')!, 0)).toBe(0);

        const clearedBasePower = applyEvents(armed, [{
            type: SU_EVENTS.TURN_STARTED,
            payload: { playerId: '1', turnNumber: 2 },
            timestamp: 201,
        } as SmashUpEvent]);
        expect(clearedBasePower.tempBasePowerModifiers).toBeUndefined();
        expect(getPlayerEffectivePowerOnBase(clearedBasePower, clearedBasePower.bases[0], 0, '1')).toBe(4);
        expect(getEffectivePower(clearedBasePower, clearedBasePower.bases[0].minions.find(minion => minion.uid === 'helper')!, 0)).toBe(1);
    });

    it('在你之后按游戏人数让自己抽牌，并让每个其他玩家各抽一张', () => {
        const core = makeState({
            turnOrder: ['0', '1', '2'],
            players: {
                '0': makePlayer('0', { deck: [makeCard('self-1', 'test_minion', '0'), makeCard('self-2', 'test_minion', '0'), makeCard('self-3', 'test_minion', '0')] }),
                '1': makePlayer('1', { deck: [makeCard('other-1', 'test_minion', '1')] }),
                '2': makePlayer('2', { deck: [makeCard('third-1', 'test_minion', '2')] }),
            },
        });
        const result = invoke(core, 'munchkin_elves_after_you', 'onPlay', 'after-you');
        const finalState = applyEvents(core, result.events);
        expect(finalState.players['0'].hand.map(card => card.uid)).toEqual(['self-1', 'self-2', 'self-3']);
        expect(finalState.players['1'].hand.map(card => card.uid)).toEqual(['other-1']);
        expect(finalState.players['2'].hand.map(card => card.uid)).toEqual(['third-1']);
    });

    it('援手计分前先手动选择玩家和己方随从，并记录计分后 VP 选择', () => {
        const core = makeState({
            players: {
                '0': makePlayer('0', { vp: 2 }),
                '1': makePlayer('1', { vp: 3 }),
            },
            bases: [makeBase('test_base', [
                makeMinion('helper', 'test_minion', '0', 1),
                makeMinion('target', 'test_minion', '1', 4),
            ])],
        });
        const started = invoke(core, 'munchkin_elves_helping_hands', 'special', 'helping-hands', 0, 0);
        const playerPrompt = getSimpleChoicePrompt(started.matchState!, 'munchkin_elves_helping_hands_choose_player');
        expect(playerPrompt.autoResolveIfSingle).toBe(false);
        const afterPlayer = respondToPromptOption(started.matchState!, option => option.value?.targetPlayerId === '1', '选择目标玩家', '0');
        const minionPrompt = getSimpleChoicePrompt(afterPlayer.finalState, 'munchkin_elves_helping_hands_choose_minion');
        expect(minionPrompt.autoResolveIfSingle).toBe(false);
        const armed = respondToPromptOption(afterPlayer.finalState, option => option.value?.minionUid === 'helper', '选择己方随从', '0');
        expect(getPlayerEffectivePowerOnBase(armed.finalState.core, armed.finalState.core.bases[0], 0, '1')).toBe(6);
        expect(getEffectivePower(armed.finalState.core, armed.finalState.core.bases[0].minions.find(minion => minion.uid === 'helper')!, 0)).toBe(0);
        expect(armed.finalState.core.pendingAfterScoringSpecials).toEqual([
            expect.objectContaining({ sourceDefId: 'munchkin_elves_helping_hands', metadata: { targetPlayerId: '1' } }),
        ]);

        const queued = collectTriggers(armed.finalState.core, 'afterScoring', {
            state: armed.finalState.core,
            matchState: makeMatchState(armed.finalState.core),
            playerId: '0',
            baseIndex: 0,
            rankings: [{ playerId: '1', power: 6, vp: 3 }, { playerId: '0', power: 0, vp: 2 }],
            random: defaultTestRandom,
            now: 202,
        });
        expect(queued?.payload.triggers).toHaveLength(1);
        const afterScoring = maybeResolveReactionQueue(
            makeMatchState({ ...armed.finalState.core, triggerQueue: queued!.payload.triggers }),
            defaultTestRandom,
            203,
        );
        expect(afterScoring).toBeDefined();
        const vpPrompt = getSimpleChoicePrompt(afterScoring!.state, 'munchkin_elves_helping_hands_choose_vp');
        expect(vpPrompt.autoResolveIfSingle).toBe(false);
        const taken = respondToPromptOption(afterScoring!.state, option => option.value?.take === true, '获得 1 VP', '0');
        expect(taken.finalState.core.players['0'].vp).toBe(3);
        expect(taken.finalState.core.players['1'].vp).toBe(2);
    });

    it('旅行精灵的天赋移动宿主，并让附着行动随宿主一起移动', () => {
        const core = makeState({
            bases: [
                makeBase('source', [makeMinion('host', 'test_minion', '0', 3, {
                    attachedActions: [{ uid: 'travel', defId: 'munchkin_elves_traveling_elf', ownerId: '0' } as any],
                })]),
                makeBase('destination'),
            ],
        });
        const started = invoke(core, 'munchkin_elves_traveling_elf', 'talent', 'travel', 0);
        const prompt = getSimpleChoicePrompt(started.matchState!, 'munchkin_elves_traveling_elf_choose_destination');
        expect(prompt.autoResolveIfSingle).toBe(false);
        const resolved = respondToPromptOption(started.matchState!, option => option.value?.baseIndex === 1, '选择基地2', '0');
        expect(resolved.finalState.core.bases[0].minions).toHaveLength(0);
        expect(resolved.finalState.core.bases[1].minions).toEqual([
            expect.objectContaining({
                uid: 'host',
                attachedActions: [expect.objectContaining({ uid: 'travel', defId: 'munchkin_elves_traveling_elf' })],
            }),
        ]);
    });
});
