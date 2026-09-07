import { beforeAll, describe, expect, it } from 'vitest';
import { initAllAbilities, resetAbilityInit } from '../../abilities';
import { createInitialSystemState } from '../../../../engine/pipeline';
import { GameTestRunner } from '../../../../engine/testing/GameTestRunner';
import { clearRegistry } from '../../domain/abilityRegistry';
import { clearBaseAbilityRegistry } from '../../domain/baseAbilities';
import { clearInteractionHandlers } from '../../domain/abilityInteractionHandlers';
import { clearOngoingEffectRegistry } from '../../domain/ongoingEffects';
import { clearPowerModifierRegistry } from '../../domain/ongoingModifiers';
import { fireTriggers } from '../../domain/ongoingEffects';
import { postProcessSystemEvents } from '../../domain';
import { getSmashUpReactionSession } from '../../domain/reactionSession';
import { SU_EVENTS, type AbilityTag, type SmashUpCommand, type SmashUpCore, type SmashUpEvent } from '../../domain/types';
import { SmashUpDomain, smashUpSystemsForTest } from '../../game';
import {
    applyEvents,
    getOptionalSimpleChoicePrompt,
    getPromptOptions,
    getSimpleChoicePrompt,
    invokeRegisteredAbilityContract,
    makeBase,
    makeCard,
    makeMatchState,
    makeMinion,
    makePlayer,
    makeState,
    respondToPromptOption,
    triggerBaseAbilityWithMS,
} from '../helpers';
import { defaultTestRandom } from '../testRunner';
import {
    getPlayerEffectivePowerOnBase,
    getTotalEffectivePowerOnBase,
} from '../../domain/ongoingModifiers';
import { isCardSuppressed } from '../../domain/ongoingEffects';

beforeAll(() => {
    clearRegistry();
    clearBaseAbilityRegistry();
    clearPowerModifierRegistry();
    clearOngoingEffectRegistry();
    clearInteractionHandlers();
    resetAbilityInit();
    initAllAbilities();
});

function invoke(core: SmashUpCore, defId: string, tag: AbilityTag, cardUid: string, baseIndex = 0) {
    return invokeRegisteredAbilityContract(defId, tag, {
        state: core,
        matchState: makeMatchState(core),
        playerId: '0',
        cardUid,
        defId,
        baseIndex,
        random: defaultTestRandom,
        now: 100,
    });
}

function createClericsScoringRunner(): GameTestRunner<SmashUpCore, SmashUpCommand, SmashUpEvent> {
    return new GameTestRunner<SmashUpCore, SmashUpCommand, SmashUpEvent>({
        domain: SmashUpDomain,
        systems: smashUpSystemsForTest,
        playerIds: ['0', '1'],
        random: defaultTestRandom,
        setup: (ids, random) => {
            const core = SmashUpDomain.setup(ids, random);
            const sys = createInitialSystemState(ids, smashUpSystemsForTest, undefined);
            core.factionSelection = undefined;
            core.currentPlayerIndex = 0;
            core.turnOrder = ['0', '1'];
            core.seatOrder = ['0', '1'];
            core.turnNumber = 43;
            core.nextUid = 4300;
            core.enabledExpansions = ['munchkin'];
            core.players = {
                '0': makePlayer('0', {
                    vp: 4,
                    factions: ['munchkin_clerics', 'munchkin_warriors'],
                    hand: [],
                    deck: [
                        makeCard('draw-a', 'munchkin_clerics_cardinal', 'minion', '0'),
                        makeCard('draw-b', 'munchkin_clerics_cardinal', 'minion', '0'),
                    ],
                    discard: [],
                    minionsPlayed: 2,
                    minionLimit: 2,
                }),
                '1': makePlayer('1', {
                    vp: 5,
                    factions: ['munchkin_orcs', 'ninjas'],
                    hand: [],
                    deck: [],
                    discard: [],
                }),
            };
            core.bases = [
                makeBase('base_the_homeworld', [
                    makeMinion('friar', 'munchkin_clerics_deep_friar', '0', 4),
                    makeMinion('move-me', 'alien_invader', '0', 19),
                ]),
                makeBase('base_the_mothership'),
            ];
            core.baseDeck = ['base_the_jungle'];
            core.baseDiscard = [];
            sys.phase = 'playCards';
            return { core, sys };
        },
    });
}

function resolvePromptBy(
    runner: GameTestRunner<SmashUpCore, SmashUpCommand, SmashUpEvent>,
    playerId: string,
    sourceId: string,
    predicate: (option: any) => boolean,
    description: string,
) {
    const prompt = getSimpleChoicePrompt(runner.getState(), sourceId);
    const option = getPromptOptions(prompt).find(predicate);
    expect(option?.id, description).toBeTruthy();
    const result = runner.resolveInteraction(playerId, { optionId: option!.id });
    expect(result.success).toBe(true);
    return result;
}

function drainScoringUntilIdle(
    runner: GameTestRunner<SmashUpCore, SmashUpCommand, SmashUpEvent>,
    eventLog: SmashUpEvent[],
) {
    for (let guard = 0; guard < 8; guard += 1) {
        const state = runner.getState();
        if (getOptionalSimpleChoicePrompt(state)) return;
        if (state.sys.phase !== 'scoreBases') return;
        const result = runner.dispatch('ADVANCE_PHASE', { playerId: '0' });
        expect(result.success).toBe(true);
        eventLog.push(...result.events as SmashUpEvent[]);
    }
}

describe('萌奇金牧师派系', () => {
    it('红衣主教天赋从至少五张弃牌堆随机回收两张到手牌', () => {
        const core = makeState({
            players: {
                '0': makePlayer('0', {
                    discard: [
                        makeCard('discard-1', 'test_action', 'action', '0'),
                        makeCard('discard-2', 'test_action', 'action', '0'),
                        makeCard('discard-3', 'test_minion', 'minion', '0'),
                        makeCard('discard-4', 'test_action', 'action', '0'),
                        makeCard('discard-5', 'test_minion', 'minion', '0'),
                    ],
                }),
                '1': makePlayer('1'),
            },
            bases: [makeBase('test_base', [makeMinion('cardinal', 'munchkin_clerics_cardinal', '0', 5)])],
        });

        const ability = invoke(core, 'munchkin_clerics_cardinal', 'talent', 'cardinal');
        expect(ability.events).toContainEqual(expect.objectContaining({
            type: SU_EVENTS.CARD_RECOVERED_FROM_DISCARD,
            payload: expect.objectContaining({ playerId: '0', cardUids: ['discard-1', 'discard-2'] }),
        }));

        const finalCore = applyEvents(core, ability.events);
        expect(finalCore.players['0'].hand.map(card => card.uid)).toEqual(['discard-1', 'discard-2']);
        expect(finalCore.players['0'].discard.map(card => card.uid)).toEqual(['discard-3', 'discard-4', 'discard-5']);
    });

    it('资深修士计分后先手动选另一个己方仆从，再手动选其他基地移动', () => {
        const core = makeState({
            players: {
                '0': makePlayer('0'),
                '1': makePlayer('1'),
            },
            bases: [
                makeBase('base_scoring', [
                    makeMinion('friar', 'munchkin_clerics_deep_friar', '0', 4),
                    makeMinion('move-me', 'test_minion', '0', 2),
                ]),
                makeBase('base-destination'),
            ],
        });

        const ability = invoke(core, 'munchkin_clerics_deep_friar', 'special', 'friar');
        const minionPrompt = getSimpleChoicePrompt(ability.matchState!, 'munchkin_clerics_deep_friar_minion');
        expect(minionPrompt.options).toHaveLength(2);
        expect(minionPrompt.autoResolveIfSingle).toBe(false);
        expect(minionPrompt.options.some(option => (option.value as { skip?: boolean })?.skip)).toBe(true);
        expect(minionPrompt.options.some(option => (option.value as { minionUid?: string })?.minionUid === 'move-me')).toBe(true);

        const selectedMinion = respondToPromptOption(
            ability.matchState!,
            option => (option.value as { minionUid?: string })?.minionUid === 'move-me',
            '选择资深修士移动的随从',
            '0',
            defaultTestRandom,
        );
        const basePrompt = getSimpleChoicePrompt(selectedMinion.finalState, 'munchkin_clerics_deep_friar_base');
        expect(basePrompt.options).toHaveLength(1);
        expect(basePrompt.autoResolveIfSingle).toBe(false);

        const resolved = respondToPromptOption(
            selectedMinion.finalState,
            option => (option.value as { baseIndex?: number })?.baseIndex === 1,
            '选择资深修士目标基地',
            '0',
            defaultTestRandom,
        );
        expect(resolved.success).toBe(true);
        expect(resolved.finalState.core.bases[0].minions.map(minion => minion.uid)).toEqual(['friar']);
        expect(resolved.finalState.core.bases[1].minions.map(minion => minion.uid)).toEqual(['move-me']);
    });

    it('资深修士在完整计分响应窗口中移动的仆从不会被后续清场弃置', () => {
        const runner = createClericsScoringRunner();
        const eventLog: SmashUpEvent[] = [];

        const advance = runner.dispatch('ADVANCE_PHASE', { playerId: '0' });
        expect(advance.success).toBe(true);
        eventLog.push(...advance.events as SmashUpEvent[]);
        expect(runner.getState().sys.phase).toBe('scoreBases');
        expect(getSmashUpReactionSession(runner.getState())?.responseWindowType).toBe('afterScoring');

        eventLog.push(...resolvePromptBy(
            runner,
            '0',
            'smashup_reaction_choose',
            option => option.value?.kind === 'activate_special'
                && option.value?.minionUid === 'friar'
                && option.value?.baseIndex === 0,
            '计分后响应窗口应提供资深修士特殊能力',
        ).events as SmashUpEvent[]);
        eventLog.push(...resolvePromptBy(
            runner,
            '0',
            'munchkin_clerics_deep_friar_minion',
            option => option.value?.minionUid === 'move-me',
            '资深修士第一步应选择同基地另一个己方仆从',
        ).events as SmashUpEvent[]);
        const chooseBase = resolvePromptBy(
            runner,
            '0',
            'munchkin_clerics_deep_friar_base',
            option => option.value?.baseIndex === 1,
            '资深修士第二步应选择另一个基地',
        );
        eventLog.push(...chooseBase.events as SmashUpEvent[]);

        drainScoringUntilIdle(runner, eventLog);

        const finalState = runner.getState();
        expect(eventLog.map(event => event.type)).toContain(SU_EVENTS.MINION_MOVED);
        expect(eventLog.map(event => event.type)).toContain(SU_EVENTS.BASE_CLEARED);
        expect(finalState.core.bases[0].minions.map(minion => minion.uid)).toEqual([]);
        expect(finalState.core.bases[0].defId).toBe('base_the_jungle');
        expect(finalState.core.bases[1].minions.map(minion => minion.uid)).toEqual(['move-me']);
        expect(finalState.core.players['0'].discard.map(card => card.uid)).toContain('friar');
        expect(finalState.core.players['0'].discard.map(card => card.uid)).not.toContain('move-me');
    });

    it('特纳在两个合法模式都存在时必须先手动选择模式，再手动选择亡灵怪物', () => {
        const core = makeState({
            players: {
                '0': makePlayer('0', {
                    discard: [makeCard('discard-minion', 'test_minion', 'minion', '0')],
                }),
                '1': makePlayer('1'),
            },
            bases: [makeBase({
                defId: 'test_base',
                minions: [makeMinion('turner', 'munchkin_clerics_turner', '0', 3)],
                monsters: [
                    { uid: 'undead', defId: 'munchkin_monster_ghoul' },
                    { uid: 'living', defId: 'munchkin_monster_bigfoot' },
                ],
            })],
            treasureDeck: [],
        });

        const ability = invoke(core, 'munchkin_clerics_turner', 'onPlay', 'turner');
        const modePrompt = getSimpleChoicePrompt(ability.matchState!, 'munchkin_clerics_turner_mode');
        expect(modePrompt.options).toHaveLength(2);
        expect(modePrompt.autoResolveIfSingle).toBe(false);

        const selectedMode = respondToPromptOption(
            ability.matchState!,
            option => (option.value as { mode?: string })?.mode === 'destroyUndead',
            '选择特纳摧毁亡灵模式',
            '0',
            defaultTestRandom,
        );
        const monsterPrompt = getSimpleChoicePrompt(selectedMode.finalState, 'munchkin_clerics_turner_monster');
        expect(monsterPrompt.options).toHaveLength(1);
        expect(monsterPrompt.autoResolveIfSingle).toBe(false);
        expect((monsterPrompt.options[0].value as { monsterUid?: string }).monsterUid).toBe('undead');

        const resolved = respondToPromptOption(
            selectedMode.finalState,
            option => (option.value as { monsterUid?: string })?.monsterUid === 'undead',
            '选择特纳要摧毁的亡灵怪物',
            '0',
            defaultTestRandom,
        );
        expect(resolved.success).toBe(true);
        expect(resolved.finalState.core.bases[0].monsters?.map(monster => monster.uid)).toEqual(['living']);
    });

    it('圣临者的可选回收必须停在手动确认态，跳过时弃牌堆不变', () => {
        const core = makeState({
            players: {
                '0': makePlayer('0', {
                    discard: [
                        makeCard('roller', 'munchkin_clerics_holy_roller', 'action', '0'),
                        makeCard('discard-card', 'test_action', 'action', '0'),
                    ],
                    deck: [makeCard('deck-card', 'test_minion', 'minion', '0')],
                }),
                '1': makePlayer('1'),
            },
            bases: [makeBase('test_base', [makeMinion('roller-minion', 'munchkin_clerics_holy_roller', '0', 2)])],
        });

        const ability = invoke(core, 'munchkin_clerics_holy_roller', 'onPlay', 'roller');
        const prompt = getSimpleChoicePrompt(ability.matchState!, 'munchkin_clerics_holy_roller_mode');
        expect(prompt.options).toHaveLength(2);
        expect(prompt.autoResolveIfSingle).toBe(false);

        const skipped = respondToPromptOption(
            ability.matchState!,
            option => (option.value as { skip?: boolean })?.skip === true,
            '跳过圣临者回收',
            '0',
            defaultTestRandom,
        );
        expect(skipped.success).toBe(true);
        expect(skipped.finalState.core.players['0'].discard.map(card => card.uid)).toEqual(['roller', 'discard-card']);

        const resolved = respondToPromptOption(
            ability.matchState!,
            option => (option.value as { shuffle?: boolean })?.shuffle === true,
            '发动圣临者回收',
            '0',
            defaultTestRandom,
        );
        expect(resolved.success).toBe(true);
        expect(resolved.finalState.core.players['0'].discard).toHaveLength(1);
        expect(resolved.finalState.core.players['0'].deck.map(card => card.uid)).toContain('roller');
    });

    it('光盘从弃牌堆随机回收两张，弃牌堆不足时只回收现有牌', () => {
        const core = makeState({
            players: {
                '0': makePlayer('0', {
                    discard: [
                        makeCard('plate-a', 'test_action', 'action', '0'),
                        makeCard('plate-b', 'test_minion', 'minion', '0'),
                        makeCard('plate-c', 'test_action', 'action', '0'),
                    ],
                }),
                '1': makePlayer('1'),
            },
        });

        const ability = invoke(core, 'munchkin_clerics_collection_plate', 'onPlay', 'plate');
        expect(ability.events).toContainEqual(expect.objectContaining({
            type: SU_EVENTS.CARD_RECOVERED_FROM_DISCARD,
            payload: expect.objectContaining({ playerId: '0', cardUids: ['plate-a', 'plate-b'] }),
        }));
        const recovered = applyEvents(core, ability.events);
        expect(recovered.players['0'].hand.map(card => card.uid)).toEqual(['plate-a', 'plate-b']);
        expect(recovered.players['0'].discard.map(card => card.uid)).toEqual(['plate-c']);
    });

    it('好习惯影响当前所有基地的仆从，并在回合结束清理临时力量', () => {
        const core = makeState({
            players: { '0': makePlayer('0'), '1': makePlayer('1') },
            bases: [
                makeBase('base-a', [makeMinion('ally', 'test_minion', '0', 2)]),
                makeBase('base-b', [makeMinion('enemy', 'test_minion', '1', 3)]),
            ],
        });

        const ability = invoke(core, 'munchkin_clerics_good_habits', 'onPlay', 'habits');
        const boosted = applyEvents(core, ability.events);
        expect(boosted.bases.flatMap(base => base.minions).map(minion => minion.tempPowerModifier)).toEqual([1, 1]);
        expect(getPlayerEffectivePowerOnBase(boosted, boosted.bases[0], 0, '0')).toBe(3);
        expect(getPlayerEffectivePowerOnBase(boosted, boosted.bases[1], 1, '1')).toBe(4);

        const ended = applyEvents(boosted, [{
            type: SU_EVENTS.TURN_ENDED,
            payload: { playerId: '0', nextPlayerIndex: 1 },
            timestamp: 101,
        } as any]);
        expect(ended.bases.flatMap(base => base.minions).map(minion => minion.tempPowerModifier)).toEqual([0, 0]);
    });

    it('加入团队只给目标基地的现有仆从增加临时力量', () => {
        const core = makeState({
            players: { '0': makePlayer('0'), '1': makePlayer('1') },
            bases: [
                makeBase('base-a', [makeMinion('outside', 'test_minion', '0', 2)]),
                makeBase('base-b', [makeMinion('inside', 'test_minion', '1', 3)]),
            ],
        });

        const ability = invoke(core, 'munchkin_clerics_join_the_club', 'onPlay', 'club', 1);
        const boosted = applyEvents(core, ability.events);
        expect(boosted.bases[0].minions[0].tempPowerModifier ?? 0).toBe(0);
        expect(boosted.bases[1].minions[0].tempPowerModifier).toBe(1);
    });

    it('监禁诅咒压制宿主能力，无用诅咒排除宿主基地力量，移除后恢复', () => {
        const core = makeState({
            players: { '0': makePlayer('0'), '1': makePlayer('1') },
            bases: [makeBase({
                minions: [
                    makeMinion('cursed', 'munchkin_clerics_cardinal', '0', 5, {
                        attachedActions: [
                            { uid: 'imprisonment', defId: 'munchkin_clerics_curse_of_imprisonment', ownerId: '1' },
                            { uid: 'uselessness', defId: 'munchkin_clerics_curse_of_uselessness', ownerId: '1' },
                        ],
                    }),
                    makeMinion('other', 'test_minion', '0', 2),
                ],
            })],
        });

        expect(isCardSuppressed(core, 'cursed')).toBe(true);
        expect(getTotalEffectivePowerOnBase(core, core.bases[0], 0)).toBe(2);

        const restored = applyEvents(core, [{
            type: SU_EVENTS.ONGOING_DETACHED,
            payload: {
                cardUid: 'imprisonment',
                defId: 'munchkin_clerics_curse_of_imprisonment',
                ownerId: '1',
                reason: 'test_remove_curse',
            },
            timestamp: 102,
        } as any, {
            type: SU_EVENTS.ONGOING_DETACHED,
            payload: {
                cardUid: 'uselessness',
                defId: 'munchkin_clerics_curse_of_uselessness',
                ownerId: '1',
                reason: 'test_remove_curse',
            },
            timestamp: 103,
        } as any]);
        expect(isCardSuppressed(restored, 'cursed')).toBe(false);
        expect(getTotalEffectivePowerOnBase(restored, restored.bases[0], 0)).toBe(7);
    });

    it('解除诅咒只显示基地或仆从身上的附着行动，并且单候选也必须手动选择', () => {
        const core = makeState({
            players: { '0': makePlayer('0'), '1': makePlayer('1') },
            bases: [makeBase({
                ongoingActions: [{ uid: 'base-curse', defId: 'munchkin_clerics_curse_of_uselessness', ownerId: '1' }],
                minions: [makeMinion('host', 'test_minion', '0', 2, {
                    attachedActions: [{ uid: 'minion-curse', defId: 'munchkin_clerics_curse_of_imprisonment', ownerId: '1' }],
                })],
            })],
        });

        const ability = invoke(core, 'munchkin_clerics_remove_curse', 'onPlay', 'remove');
        const prompt = getSimpleChoicePrompt(ability.matchState!, 'munchkin_clerics_remove_curse_action');
        expect(prompt.options).toHaveLength(2);
        expect(prompt.autoResolveIfSingle).toBe(false);
        expect(prompt.options.every((option: any) => option.displayMode === 'card')).toBe(true);

        const resolved = respondToPromptOption(
            ability.matchState!,
            option => option.value?.cardUid === 'minion-curse',
            '选择要解除的仆从附着行动',
            '0',
            defaultTestRandom,
        );
        expect(resolved.success).toBe(true);
        expect(resolved.finalState.core.bases[0].minions[0].attachedActions).toEqual([]);
        expect(resolved.finalState.core.players['1'].discard.map(card => card.uid)).toContain('minion-curse');
        expect(resolved.finalState.core.bases[0].ongoingActions.map(action => action.uid)).toEqual(['base-curse']);
    });

    it('回忆祷词每个其他玩家随机展示一张行动，选择后进入额外行动且未选牌仍留在原弃牌堆', () => {
        const core = makeState({
            players: {
                '0': makePlayer('0'),
                '1': makePlayer('1', { discard: [makeCard('borrow-1', 'test_action', 'action', '1')] }),
                '2': makePlayer('2', { discard: [makeCard('borrow-2', 'test_action', 'action', '2')] }),
            },
            turnOrder: ['0', '1', '2'],
        });

        const ability = invoke(core, 'munchkin_clerics_word_of_recall', 'onPlay', 'recall');
        const prompt = getSimpleChoicePrompt(ability.matchState!, 'munchkin_clerics_word_of_recall_action');
        expect(prompt.options).toHaveLength(3);
        expect(prompt.autoResolveIfSingle).toBe(false);
        expect(prompt.options.some((option: any) => option.value?.cardUid === 'borrow-1')).toBe(true);
        expect(prompt.options.some((option: any) => option.value?.cardUid === 'borrow-2')).toBe(true);

        const selected = respondToPromptOption(
            ability.matchState!,
            option => option.value?.cardUid === 'borrow-1',
            '选择其他玩家弃牌堆行动',
            '0',
            defaultTestRandom,
        );
        expect(selected.success).toBe(true);
        expect(selected.finalState.core.players['1'].discard).toEqual([]);
        expect(selected.finalState.core.players['2'].discard.map(card => card.uid)).toEqual(['borrow-2']);
        expect(selected.finalState.core.players['0'].hand.map(card => card.uid)).toContain('borrow-1');
        expect(selected.finalState.core.players['0'].actionLimit).toBe(1);
    });

    it('圣洁酒店逐张手动选择顺序，并把随从放到各自拥有者牌库顶', () => {
        const core = makeState({
            players: {
                '0': makePlayer('0', { deck: [makeCard('deck-0', 'test_action', 'action', '0')] }),
                '1': makePlayer('1', { deck: [makeCard('deck-1', 'test_action', 'action', '1')] }),
            },
            bases: [makeBase({
                defId: 'base_hotel_of_holiness',
                minions: [
                    makeMinion('hotel-0', 'test_minion', '0', 2),
                    makeMinion('hotel-1', 'test_minion', '1', 3),
                ],
            })],
        });

        const ability = triggerBaseAbilityWithMS('base_hotel_of_holiness', 'afterScoring', {
            state: core,
            baseIndex: 0,
            baseDefId: 'base_hotel_of_holiness',
            playerId: '0',
            now: 200,
        });
        const prompt = getSimpleChoicePrompt(ability.matchState!, 'munchkin_clerics_hotel_of_holiness_minion');
        expect(prompt.options).toHaveLength(2);
        expect(prompt.autoResolveIfSingle).toBe(false);
        const first = respondToPromptOption(
            ability.matchState!,
            option => option.value?.minionUid === 'hotel-1',
            '选择圣洁酒店第一张牌库顶随从',
            '0',
            defaultTestRandom,
        );
        const secondPrompt = getSimpleChoicePrompt(first.finalState, 'munchkin_clerics_hotel_of_holiness_minion');
        expect(secondPrompt.options).toHaveLength(1);
        expect(secondPrompt.autoResolveIfSingle).toBe(false);
        const resolved = respondToPromptOption(
            first.finalState,
            option => option.value?.minionUid === 'hotel-0',
            '选择圣洁酒店第二张牌库顶随从',
            '0',
            defaultTestRandom,
        );
        expect(resolved.success).toBe(true);
        expect(resolved.finalState.core.bases[0].minions).toEqual([]);
        expect(resolved.finalState.core.players['1'].deck.map(card => card.uid)).toEqual(['hotel-1', 'deck-1']);
        expect(resolved.finalState.core.players['0'].deck.map(card => card.uid)).toEqual(['hotel-0', 'deck-0']);
    });

    it('垃圾处理在另一个基地计分后先手动选择随从，再移动到持续行动所在基地', () => {
        const core = makeState({
            players: { '0': makePlayer('0'), '1': makePlayer('1') },
            bases: [makeBase({
                defId: 'base-bin',
                ongoingActions: [{ uid: 'bin', defId: 'munchkin_clerics_bin_and_gone', ownerId: '0' }],
                minions: [],
            }), makeBase({
                defId: 'base-scoring',
                minions: [makeMinion('move-to-bin', 'test_minion', '0', 3)],
            })],
        });

        const triggered = fireTriggers(core, 'afterScoring', {
            state: core,
            matchState: makeMatchState(core),
            playerId: '0',
            baseIndex: 1,
            now: 300,
        });
        const prompt = getSimpleChoicePrompt(triggered.matchState!, 'munchkin_clerics_bin_and_gone_minion');
        expect(prompt.options).toHaveLength(2);
        expect(prompt.autoResolveIfSingle).toBe(false);
        expect(prompt.options.some((option: any) =>
            option.value?.sourceUid === 'bin'
            && option.value?.fieldSourceType === 'ongoing'
            && option.value?.targetMinionUid === 'move-to-bin',
        )).toBe(true);

        const resolved = respondToPromptOption(
            triggered.matchState!,
            option => option.value?.targetMinionUid === 'move-to-bin',
            '选择垃圾处理移动的随从',
            '0',
            defaultTestRandom,
        );
        expect(resolved.success).toBe(true);
        expect(resolved.finalState.core.bases[0].minions.map(minion => minion.uid)).toEqual(['move-to-bin']);
        expect(resolved.finalState.core.bases[1].minions).toEqual([]);
    });

    it('抓鬼只自动拦截打入基地的亡灵怪物，并把它放到怪物牌库底', () => {
        const core = makeState({
            bases: [makeBase({ defId: 'base_whack_a_ghoul', monsters: [] })],
            monsterDeck: ['munchkin_monster_ghoul', 'munchkin_monster_bigfoot'],
        });
        const monsterPlayed = {
            type: SU_EVENTS.MUNCHKIN_MONSTER_PLAYED,
            payload: {
                playerId: '0',
                baseIndex: 0,
                monsterDefId: 'munchkin_monster_ghoul',
                monsterUid: 'monster-1',
                reason: 'test_play_monster',
            },
            timestamp: 301,
        } as any;

        const processed = postProcessSystemEvents(core, [monsterPlayed], defaultTestRandom, makeMatchState(core));
        expect(processed.events).toContainEqual(expect.objectContaining({
            type: SU_EVENTS.MUNCHKIN_MONSTER_TO_DECK_BOTTOM,
            payload: expect.objectContaining({ monsterUid: 'monster-1', monsterDefId: 'munchkin_monster_ghoul' }),
        }));
        const finalCore = applyEvents(core, [monsterPlayed, ...processed.events]);
        expect(finalCore.bases[0].monsters).toEqual([]);
        expect(finalCore.monsterDeck).toEqual(['munchkin_monster_bigfoot', 'munchkin_monster_ghoul']);
    });

    it('抓鬼的亡灵怪物归还怪物牌库底事件不发放宝藏，普通怪物不受影响', () => {
        const core = makeState({
            bases: [makeBase({
                defId: 'base_whack_a_ghoul',
                monsters: [
                    { uid: 'undead', defId: 'munchkin_monster_ghoul' },
                    { uid: 'living', defId: 'munchkin_monster_bigfoot' },
                ],
            })],
            monsterDeck: ['munchkin_monster_fowl_fiend'],
            treasureDeck: ['munchkin_treasure_dwarf_hireling'],
        });

        const bottomed = applyEvents(core, [{
            type: SU_EVENTS.MUNCHKIN_MONSTER_TO_DECK_BOTTOM,
            payload: { baseIndex: 0, monsterUid: 'undead', monsterDefId: 'munchkin_monster_ghoul', reason: 'base_whack_a_ghoul' },
            timestamp: 201,
        } as any]);
        expect(bottomed.bases[0].monsters?.map(monster => monster.uid)).toEqual(['living']);
        expect(bottomed.monsterDeck).toEqual(['munchkin_monster_fowl_fiend', 'munchkin_monster_ghoul']);
        expect(bottomed.monsterDiscard ?? []).toEqual([]);
        expect(bottomed.players['0'].hand).toEqual([]);
    });
});
