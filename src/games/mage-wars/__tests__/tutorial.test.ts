import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createInitialSystemState, executePipeline } from '../../../engine/pipeline';
import { FLOW_COMMANDS } from '../../../engine/systems/FlowSystem';
import type { Command, MatchState, RandomFn, TutorialManifest } from '../../../engine/types';
import { engineConfig } from '../game';
import MageWarsTutorialCatalog, {
    MageWarsTutorial,
} from '../tutorial';
import { MageWarsDomain, MAGE_WARS_COMMANDS, MAGE_WARS_EVENTS } from '../domain';
import type { MageWarsCommand, MageWarsCore } from '../domain/types';

const playerIds = ['0', '1'];
const JUNGLE_WOLF_CARD_ID = 2819;
const ROUSE_THE_BEAST_CARD_ID = 3403;
const ASYRAN_CLERIC_CARD_ID = 2811;
const PILLAR_OF_LIGHT_CARD_ID = 1706;
const PLAYER_ZERO_WOLF_OBJECT_ID = 'mwobj-0-2819-1';
const PLAYER_ONE_CLERIC_OBJECT_ID = 'mwobj-1-2811-1';

const fixedRandom: RandomFn = {
    random: () => 0.5,
    d: () => 3,
    range: (min: number) => min,
    shuffle: <T,>(array: T[]) => [...array],
};

const loadLocale = (locale: 'zh-CN' | 'en') => JSON.parse(fs.readFileSync(
    path.join(process.cwd(), 'public', 'locales', locale, 'game-mage-wars.json'),
    'utf8',
)) as Record<string, unknown>;

const resolveLocaleKey = (locale: Record<string, unknown>, content: string): unknown => {
    const key = content.replace(/^game-mage-wars:/, '');
    return key.split('.').reduce<unknown>((current, part) => {
        if (!current || typeof current !== 'object') return undefined;
        return (current as Record<string, unknown>)[part];
    }, locale);
};

const flattenStrings = (value: unknown): string[] => {
    if (typeof value === 'string') return [value];
    if (!value || typeof value !== 'object') return [];
    return Object.values(value).flatMap(flattenStrings);
};

const allTutorialManifests = (): TutorialManifest[] => Object.values(MageWarsTutorialCatalog.tutorials)
    .map((entry) => entry.manifest);

function setupState(): MatchState<MageWarsCore> {
    return {
        core: MageWarsDomain.setup(playerIds, fixedRandom),
        sys: createInitialSystemState(playerIds, engineConfig.systems, 'local:mage-wars-tutorial-test'),
    };
}

function runCommand(
    state: MatchState<MageWarsCore>,
    command: Command<string, unknown>,
): MatchState<MageWarsCore> {
    const result = executePipeline(
        {
            domain: engineConfig.domain,
            systems: engineConfig.systems,
            systemsConfig: engineConfig.systemsConfig,
        },
        state,
        command as unknown as MageWarsCommand,
        fixedRandom,
        playerIds,
    );
    expect(result.success, `${command.type} failed with ${result.error ?? 'unknown error'}`).toBe(true);
    return result.state;
}

const advancePhaseCommand = (playerId: string): Command<typeof FLOW_COMMANDS.ADVANCE_PHASE, Record<string, never>> => ({
    type: FLOW_COMMANDS.ADVANCE_PHASE,
    playerId,
    payload: {},
});

const castSpellCommand = (
    playerId: string,
    payload: Extract<MageWarsCommand, { type: typeof MAGE_WARS_COMMANDS.CAST_SPELL }>['payload'],
): Extract<MageWarsCommand, { type: typeof MAGE_WARS_COMMANDS.CAST_SPELL }> => ({
    type: MAGE_WARS_COMMANDS.CAST_SPELL,
    playerId,
    payload,
});

describe('mage-wars tutorial', () => {
    it('exports one visible tutorial entry without hidden continuation chapters', () => {
        expect(MageWarsTutorialCatalog.defaultTutorialId).toBe('mage-wars-basic');
        expect(Object.keys(MageWarsTutorialCatalog.tutorials)).toEqual(['mage-wars-basic']);
        expect(Object.values(MageWarsTutorialCatalog.tutorials).map((entry) => entry.hiddenFromCatalog)).toEqual([
            undefined,
        ]);
        expect(MageWarsTutorialCatalog.tutorials['mage-wars-basic']).toMatchObject({
            titleKey: 'tutorial.catalog.basic.title',
            descriptionKey: 'tutorial.catalog.basic.description',
            manifest: MageWarsTutorial,
        });
        expect(MageWarsTutorialCatalog.tutorials['mage-wars-basic'].nextTutorialId).toBeUndefined();
    });

    it('defines a basic Beastmaster apprentice flow with stable anchors and commands', () => {
        expect(MageWarsTutorial).toMatchObject({
            id: 'mage-wars-basic',
            numPlayers: 2,
            allowManualSkip: true,
        });
        expect(MageWarsTutorial.randomPolicy).toEqual({ mode: 'fixed', values: [3] });

        const stepIds = MageWarsTutorial.steps.map((step) => step.id);
        expect(stepIds).toEqual([
            'intro',
            'self-hud',
            'opponent-hud',
            'stage',
            'channel-result',
            'spell-card-reading',
            'plan-open-creature-category',
            'plan-creature-next-page',
            'plan-select-wolf',
            'plan-open-incantation-category',
            'plan-incantation-next-page',
            'plan-select-rouse',
            'plan-confirm',
            'prepare-opponent-spells',
            'prepared-and-hidden',
            'deploy-select-wolf',
            'deploy-target-zone',
            'wolf-summoned',
            'attack-bar-reading',
            'rouse-select-spell',
            'rouse-target-wolf',
            'pass-your-deployment',
            'opponent-deployment-results',
            'opponent-public-view',
            'discard-reading',
            'back-to-self-view',
            'opponent-pass-deployment',
            'skip-initiative-quickcast',
            'opponent-pass-initiative-quickcast',
            'move-select-wolf',
            'move-target-zone',
            'finish',
        ]);
        expect(stepIds.filter((stepId) => stepId.startsWith('setup-'))).toEqual([]);
        expect(stepIds).not.toEqual(expect.arrayContaining([
            'opponent-deploy',
            'opponent-attack-spell',
        ]));
        expect(stepIds).not.toEqual(expect.arrayContaining([
            'wall-purpose',
            'guard-rule',
            'healing-rule',
            'burn-rule',
        ]));

        const commandCoverage = new Set(MageWarsTutorial.steps.flatMap((step) => step.allowedCommands ?? []));
        expect([...commandCoverage]).toEqual(expect.arrayContaining([
            FLOW_COMMANDS.ADVANCE_PHASE,
            MAGE_WARS_COMMANDS.PLAN_SPELLS,
            MAGE_WARS_COMMANDS.CAST_SPELL,
            MAGE_WARS_COMMANDS.MOVE_ARENA_OBJECT,
        ]));

        expect(MageWarsTutorial.steps.find((step) => step.id === 'spell-card-reading')).toMatchObject({
            infoStep: true,
            highlightTarget: 'mw-spellbook',
            visual: {
                src: 'mage-wars/references/spell-card-legend',
                alt: 'game-mage-wars:tutorial.visuals.spellCardLegendAlt',
                caption: 'game-mage-wars:tutorial.visuals.spellCardLegendCaption',
            },
        });
        const attackBarReading = MageWarsTutorial.steps.find((step) => step.id === 'attack-bar-reading');
        expect(attackBarReading).toMatchObject({
            infoStep: true,
            highlightTarget: `mw-field-object-${JUNGLE_WOLF_CARD_ID}`,
            visual: {
                src: 'mage-wars/references/attack-bar-legend',
                alt: 'game-mage-wars:tutorial.visuals.attackBarLegendAlt',
                caption: 'game-mage-wars:tutorial.visuals.attackBarLegendCaption',
            },
        });
        expect(stepIds.indexOf('attack-bar-reading')).toBeGreaterThan(stepIds.indexOf('wolf-summoned'));
        expect(stepIds.indexOf('attack-bar-reading')).toBeLessThan(stepIds.indexOf('rouse-select-spell'));

        const planningSteps = [
            ['plan-open-creature-category', 'mw-spellbook-category-creature'],
            ['plan-creature-next-page', 'mw-spellbook-next-page'],
            ['plan-select-wolf', `mw-spellbook-card-${JUNGLE_WOLF_CARD_ID}`],
            ['plan-open-incantation-category', 'mw-spellbook-category-incantation'],
            ['plan-incantation-next-page', 'mw-spellbook-next-page'],
            ['plan-select-rouse', `mw-spellbook-card-${ROUSE_THE_BEAST_CARD_ID}`],
        ] as const;
        for (const [stepId, targetId] of planningSteps) {
            const step = MageWarsTutorial.steps.find((item) => item.id === stepId);
            expect(step, `${stepId} should exist`).toMatchObject({
                requireAction: true,
                highlightTarget: targetId,
                allowedCommands: [],
                allowedTargets: [targetId],
            });
        }

        const planConfirm = MageWarsTutorial.steps.find((step) => step.id === 'plan-confirm');
        expect(planConfirm).toMatchObject({
            requireAction: true,
            highlightTarget: 'mw-plan-spells',
            allowedCommands: [MAGE_WARS_COMMANDS.PLAN_SPELLS],
            allowedTargets: ['mw-plan-spells'],
        });
        expect(planConfirm?.advanceOnEvents).toContainEqual({
            type: MAGE_WARS_EVENTS.SPELLS_PLANNED,
            match: { playerId: '0' },
        });

        const singleTargetActionSteps = [
            ['deploy-select-wolf', `mw-prepared-card-${JUNGLE_WOLF_CARD_ID}`, MAGE_WARS_COMMANDS.CAST_SPELL],
            ['deploy-target-zone', 'mw-zone-a3', MAGE_WARS_COMMANDS.CAST_SPELL],
            ['rouse-select-spell', `mw-prepared-card-${ROUSE_THE_BEAST_CARD_ID}`, MAGE_WARS_COMMANDS.CAST_SPELL],
            ['rouse-target-wolf', `mw-field-object-${JUNGLE_WOLF_CARD_ID}`, MAGE_WARS_COMMANDS.CAST_SPELL],
            ['move-select-wolf', `mw-field-object-${JUNGLE_WOLF_CARD_ID}`, MAGE_WARS_COMMANDS.MOVE_ARENA_OBJECT],
            ['move-target-zone', 'mw-zone-a2', MAGE_WARS_COMMANDS.MOVE_ARENA_OBJECT],
        ] as const;
        for (const [stepId, targetId, commandType] of singleTargetActionSteps) {
            const step = MageWarsTutorial.steps.find((item) => item.id === stepId);
            expect(step, `${stepId} should exist`).toMatchObject({
                requireAction: true,
                highlightTarget: targetId,
                allowedCommands: [commandType],
                allowedTargets: [targetId],
            });
        }

        const deployTargetZone = MageWarsTutorial.steps.find((step) => step.id === 'deploy-target-zone');
        expect(deployTargetZone?.advanceOnEvents).toContainEqual({
            type: MAGE_WARS_EVENTS.ARENA_OBJECT_SUMMONED,
        });
        const rouseTargetWolf = MageWarsTutorial.steps.find((step) => step.id === 'rouse-target-wolf');
        expect(rouseTargetWolf?.advanceOnEvents).toContainEqual({
            type: MAGE_WARS_EVENTS.ARENA_OBJECT_ROUSED,
            match: { ownerId: '0' },
        });
        const moveTargetZone = MageWarsTutorial.steps.find((step) => step.id === 'move-target-zone');
        expect(moveTargetZone?.advanceOnEvents).toContainEqual({
            type: MAGE_WARS_EVENTS.ARENA_OBJECT_MOVED,
            match: { ownerId: '0' },
        });

        const wolfSummoned = MageWarsTutorial.steps.find((step) => step.id === 'wolf-summoned');
        expect(wolfSummoned).toMatchObject({
            infoStep: true,
            highlightTarget: `mw-field-object-${JUNGLE_WOLF_CARD_ID}`,
        });

        const passYourDeployment = MageWarsTutorial.steps.find((step) => step.id === 'pass-your-deployment');
        expect(passYourDeployment).toMatchObject({
            requireAction: true,
            highlightTarget: 'mw-turn-end',
            allowedCommands: [FLOW_COMMANDS.ADVANCE_PHASE],
            allowedTargets: ['mw-turn-end'],
        });
        expect(passYourDeployment?.aiActions).toBeUndefined();
        expect(passYourDeployment?.advanceOnEvents).toContainEqual({
            type: MAGE_WARS_EVENTS.PHASE_WINDOW_COMPLETED,
            match: { playerId: '0', phase: 'deployment' },
        });

        const pureAutomaticStepIds = [
            'prepare-opponent-spells',
            'opponent-deployment-results',
            'opponent-pass-deployment',
            'opponent-pass-initiative-quickcast',
        ];
        for (const stepId of pureAutomaticStepIds) {
            const step = MageWarsTutorial.steps.find((item) => item.id === stepId);
            expect(step, `${stepId} should exist`).toBeDefined();
            expect(step?.aiActions?.length, `${stepId} should be driven by formal AI/system actions`).toBeGreaterThan(0);
            expect(step?.requireAction, `${stepId} must not ask the current player to act`).toBeUndefined();
            expect(step?.infoStep, `${stepId} must not stop as a visible tutorial page`).toBeUndefined();
            expect(step?.autoAdvanceAfterAi, `${stepId} must auto-advance after its actions`).not.toBe(false);
        }

        const opponentDeploymentResults = MageWarsTutorial.steps.find((step) => step.id === 'opponent-deployment-results');
        expect(opponentDeploymentResults?.aiActions).toEqual([
            expect.objectContaining({
                commandType: MAGE_WARS_COMMANDS.CAST_SPELL,
                playerId: '1',
                payload: expect.objectContaining({
                    spellCardId: ASYRAN_CLERIC_CARD_ID,
                    targetZoneId: 'd1',
                }),
            }),
            expect.objectContaining({
                commandType: MAGE_WARS_COMMANDS.CAST_SPELL,
                playerId: '1',
                payload: expect.objectContaining({
                    spellCardId: PILLAR_OF_LIGHT_CARD_ID,
                    targetObjectId: PLAYER_ONE_CLERIC_OBJECT_ID,
                }),
            }),
        ]);

        const skipInitiativeQuickcast = MageWarsTutorial.steps.find((step) => step.id === 'skip-initiative-quickcast');
        expect(skipInitiativeQuickcast).toMatchObject({
            requireAction: true,
            highlightTarget: 'mw-turn-end',
            allowedCommands: [FLOW_COMMANDS.ADVANCE_PHASE],
            allowedTargets: ['mw-turn-end'],
        });
        expect(skipInitiativeQuickcast?.aiActions).toBeUndefined();
        expect(skipInitiativeQuickcast?.advanceOnEvents).toContainEqual({
            type: MAGE_WARS_EVENTS.PHASE_WINDOW_COMPLETED,
            match: { playerId: '0', phase: 'initiativeQuickcast' },
        });

        expect(MageWarsTutorial.steps.map((step) => step.highlightTarget).filter(Boolean)).toEqual(expect.arrayContaining([
            'mw-board',
            'mw-self-hud',
            'mw-opponent-hud',
            'mw-stage',
            'mw-spellbook',
            'mw-spellbook-category-creature',
            'mw-spellbook-category-incantation',
            'mw-spellbook-next-page',
            'mw-plan-spells',
            'mw-opponent-prepared',
            'mw-opponent-view-toggle',
            'mw-discard',
            'mw-back-to-self-view',
            `mw-prepared-card-${JUNGLE_WOLF_CARD_ID}`,
            `mw-prepared-card-${ROUSE_THE_BEAST_CARD_ID}`,
            `mw-field-object-${JUNGLE_WOLF_CARD_ID}`,
        ]));
        expect(MageWarsTutorial.steps.map((step) => step.highlightTarget)).not.toContain('mw-opponent-discard');
    });

    it('has localized tutorial text and no implementation-facing wording', () => {
        const locales = [loadLocale('zh-CN'), loadLocale('en')];
        for (const locale of locales) {
            for (const [tutorialId, entry] of Object.entries(MageWarsTutorialCatalog.tutorials)) {
                expect(resolveLocaleKey(locale, `game-mage-wars:${entry.titleKey}`), `${tutorialId} title is missing`)
                    .toEqual(expect.any(String));
                expect(resolveLocaleKey(locale, `game-mage-wars:${entry.descriptionKey}`), `${tutorialId} description is missing`)
                    .toEqual(expect.any(String));
                for (const step of entry.manifest.steps) {
                    expect(resolveLocaleKey(locale, step.content), `${step.content} is missing`).toEqual(expect.any(String));
                    if (step.visual) {
                        expect(resolveLocaleKey(locale, step.visual.alt), `${step.visual.alt} is missing`).toEqual(expect.any(String));
                        if (step.visual.caption) {
                            expect(resolveLocaleKey(locale, step.visual.caption), `${step.visual.caption} is missing`).toEqual(expect.any(String));
                        }
                    }
                }
            }
        }

        const forbiddenTerms = [
            '同一画面',
            '结果面板',
            '摘要',
            '队列',
            '为了演示',
            '主视区',
            '待放置状态',
            'E2E',
            '真实链路',
            '运行态',
            '女祭司：守卫',
            '守卫、治疗与状态',
            '位置选择本身变成威胁',
            '三类不同承接',
            '能力小卡片',
            '必须先选来源',
            '这一章',
            '本章',
            '五章节',
            'result panel',
            'queue',
            'for demonstration',
            'runtime',
            'priestess: guard',
            'guard, healing, status',
            'position becomes a threat',
            'mini-card',
            'source first',
            'this chapter',
            'chapter teaches',
            'chapter covered',
            'five-chapter',
            'opponent casts asyran cleric',
            'pillar of light: attack',
            '点击“回合结束”',
            'click “end turn”',
            '对手施放阿希拉牧师',
            '圣光之柱：攻击',
            '设计意图',
            '后续复用',
            '只按这些位置',
            '坐标判断',
            'design intent',
            'reuse these positions',
            'coordinate judgement',
        ];
        const tutorialText = locales.flatMap((locale) => flattenStrings(locale.tutorial)).join('\n').toLowerCase();
        for (const term of forbiddenTerms) {
            expect(tutorialText).not.toContain(term.toLowerCase());
        }

        const zhLocale = loadLocale('zh-CN') as { actions?: { guardCreature?: string } };
        const enLocale = loadLocale('en');
        expect(resolveLocaleKey(zhLocale, 'game-mage-wars:tutorial.steps.spellCardReading'))
            .toBe('先看计划法术会用到的基础字段：费用、行动、范围、目标、类型、派系和等级决定能不能计划与施放。');
        expect(resolveLocaleKey(zhLocale, 'game-mage-wars:tutorial.visuals.spellCardLegendAlt'))
            .toBe('法术牌图例：施法费用、行动类型、范围、目标、类型、派系、等级和攻击条位置');
        expect(resolveLocaleKey(zhLocale, 'game-mage-wars:tutorial.visuals.spellCardLegendCaption'))
            .toBe('这张图例先说明计划法术会用到的基础字段。');
        expect(resolveLocaleKey(zhLocale, 'game-mage-wars:tutorial.steps.attackBarReading'))
            .toBe('丛林灰狼已经在场上，现在只读攻击条，不选择它：左侧图标区分快速或标准行动、近战或远程；右侧读范围、伤害类型、攻击骰子、附加效果和特性。读完点下一步继续。');
        expect(resolveLocaleKey(zhLocale, 'game-mage-wars:tutorial.visuals.attackBarLegendAlt'))
            .toBe('攻击条图例：快速行动、标准行动、近战攻击、远程攻击、范围、伤害类型、攻击骰子、附加效果和特性');
        expect(resolveLocaleKey(zhLocale, 'game-mage-wars:tutorial.visuals.attackBarLegendCaption'))
            .toBe('这张图例说明攻击条各栏含义；当前用场上的丛林灰狼读第一次。');
        expect(resolveLocaleKey(enLocale, 'game-mage-wars:tutorial.steps.spellCardReading'))
            .toBe('Use this spell-card legend first: cost, action, range, target, type, school, and level determine how you prepare and cast.');
        expect(resolveLocaleKey(enLocale, 'game-mage-wars:tutorial.visuals.spellCardLegendAlt'))
            .toBe('Spell-card legend showing mana cost, action type, range, target, type, school, level, and attack bar locations');
        expect(resolveLocaleKey(enLocale, 'game-mage-wars:tutorial.visuals.spellCardLegendCaption'))
            .toBe('This legend covers the basic fields needed for preparing spells.');
        expect(resolveLocaleKey(enLocale, 'game-mage-wars:tutorial.steps.attackBarReading'))
            .toBe('Jungle Wolf is now in the arena. This is only a reading step, not a selection: the left icons tell quick or full action and melee or ranged attack; the right side shows range, damage type, attack dice, extra effects, and traits. Click Next when done.');
        expect(resolveLocaleKey(enLocale, 'game-mage-wars:tutorial.visuals.attackBarLegendAlt'))
            .toBe('Attack-bar legend showing quick action, full action, melee attack, ranged attack, range, damage type, attack dice, additional effects, and traits');
        expect(resolveLocaleKey(enLocale, 'game-mage-wars:tutorial.visuals.attackBarLegendCaption'))
            .toBe('This legend explains the attack-bar fields; use Jungle Wolf on the board as the first example.');
        const singleActionStepTexts = [
            ['planOpenCreatureCategory', '点击“生物”分类。', 'Click the Creature category.'],
            ['planCreatureNextPage', '点击下一页，找到“丛林灰狼”。', 'Click the next page to find Jungle Wolf.'],
            ['planSelectWolf', '丛林灰狼是生物类法术，生物会被召唤到竞技场并持续战斗。点击“丛林灰狼”卡牌本体，把它放进第一个计划槽。', 'Jungle Wolf is a Creature spell: it summons a creature into the arena to keep fighting. Click the Jungle Wolf card body to put it into the first prepared slot.'],
            ['planOpenIncantationCategory', '点击“咒语”分类。', 'Click the Incantation category.'],
            ['planIncantationNextPage', '点击下一页，找到“兽性觉醒”。', 'Click the next page to find Rouse the Beast.'],
            ['planSelectRouse', '兽性觉醒是咒语类法术，咒语按牌面效果结算后进入弃牌堆。点击“兽性觉醒”卡牌本体，把它放进第二个计划槽。', 'Rouse the Beast is an Incantation spell: it resolves a one-time text effect, then goes to your discard pile. Click the Rouse the Beast card body to put it into the second prepared slot.'],
            ['planConfirm', '点击“确认计划 2/2”提交本回合计划。', 'Click “Confirm prep 2/2” to submit this round\'s plan.'],
            ['deploySelectWolf', '点击准备区的“丛林灰狼”。', 'Click Jungle Wolf in your prepared spells.'],
            ['deployTargetZone', '点击兽王所在区域。', 'Click the Beastmaster\'s zone.'],
            ['wolfSummoned', '丛林灰狼已经被召唤到兽王所在区域；刚进场时行动未就绪，行动标记显示已用面表示它现在还不能行动。这一步先读状态，不点灰狼，点下一步继续。', 'Jungle Wolf has been summoned into the Beastmaster\'s zone. It enters without a ready action, so the spent action marker means it cannot act yet. This is a reading step: do not click the wolf yet, click Next to continue.'],
            ['rouseSelectSpell', '点击准备区的“兽性觉醒”。', 'Click Rouse the Beast in your prepared spells.'],
            ['rouseTargetWolf', '点击场上的“丛林灰狼”卡牌本体，让兽性觉醒作用到它。', 'Click the Jungle Wolf card body in the arena so Rouse the Beast targets it.'],
            ['moveSelectWolf', '点击场上的“丛林灰狼”卡牌本体，选它作为这次移动的来源。', 'Click the Jungle Wolf card body in the arena to choose it as the moving creature.'],
            ['moveTargetZone', '点击相邻区域移动。', 'Click an adjacent zone to move.'],
        ] as const;
        for (const [key, zhText, enText] of singleActionStepTexts) {
            expect(resolveLocaleKey(zhLocale, `game-mage-wars:tutorial.steps.${key}`)).toBe(zhText);
            expect(resolveLocaleKey(enLocale, `game-mage-wars:tutorial.steps.${key}`)).toBe(enText);
            expect(zhText).not.toMatch(/然后|接着|再点击|再选择|再确认/);
            expect(enText.toLowerCase()).not.toMatch(/and then|then click|then select|then confirm/);
        }
        expect(zhLocale.actions?.guardCreature).toBe('守卫');
        expect(resolveLocaleKey(zhLocale, 'game-mage-wars:tutorial.steps.finish'))
            .toBe('你已经走过首局读局、读牌、聚魔、计划、召唤、攻击条、唤醒、公开弃牌、快速施法窗口和一次生物移动。基础教程完成。');
        expect(resolveLocaleKey(enLocale, 'game-mage-wars:tutorial.steps.finish'))
            .toBe('You have now read the board and spell cards, channeled, prepared spells, summoned Jungle Wolf, read its attack bar, roused it, checked public discard, passed the quickcast window, and moved a creature. The basic tutorial is complete.');
    });

    it('keeps the spell-card and attack-bar legends in the localized Mage Wars asset manifest', () => {
        const manifest = JSON.parse(fs.readFileSync(
            path.join(process.cwd(), 'public', 'assets', 'i18n', 'zh-CN', 'mage-wars', 'assets-manifest.json'),
            'utf8',
        )) as { files?: Record<string, unknown> };

        expect(Object.keys(manifest.files ?? {})).toEqual(expect.arrayContaining([
            'references/attack-bar-legend',
            'references/compressed/attack-bar-legend',
            'references/spell-card-legend',
            'references/compressed/spell-card-legend',
        ]));
    });

    it('keeps the tutorial command chain legal through rousing and moving Jungle Wolf', () => {
        let state = setupState();

        // 仅触发一次正式流程；reset/channel/upkeep 自动推进到首个玩家决策点 planning。
        state = runCommand(state, advancePhaseCommand('0'));
        expect(state.sys.phase).toBe('planning');
        expect(state.core.players['0'].mana).toBe(20);
        expect(state.core.players['1'].mana).toBe(20);

        state = runCommand(state, {
            type: MAGE_WARS_COMMANDS.PLAN_SPELLS,
            playerId: '1',
            payload: { spellCardIds: [ASYRAN_CLERIC_CARD_ID, PILLAR_OF_LIGHT_CARD_ID] },
        });
        state = runCommand(state, {
            type: MAGE_WARS_COMMANDS.PLAN_SPELLS,
            playerId: '0',
            payload: { spellCardIds: [JUNGLE_WOLF_CARD_ID, ROUSE_THE_BEAST_CARD_ID] },
        });
        expect(state.sys.phase).toBe('deployment');
        expect(state.core.players['0'].preparedSpellCardIds).toEqual([
            JUNGLE_WOLF_CARD_ID,
            ROUSE_THE_BEAST_CARD_ID,
        ]);

        state = runCommand(state, castSpellCommand('0', {
            spellCardId: JUNGLE_WOLF_CARD_ID,
            manaCost: 9,
            targetZoneId: 'a3',
        }));
        expect(state.core.objects[PLAYER_ZERO_WOLF_OBJECT_ID]).toMatchObject({
            sourceSpellCardId: JUNGLE_WOLF_CARD_ID,
            zoneId: 'a3',
            actionReady: false,
        });

        state = runCommand(state, castSpellCommand('0', {
            spellCardId: ROUSE_THE_BEAST_CARD_ID,
            manaCost: 2,
            targetObjectId: PLAYER_ZERO_WOLF_OBJECT_ID,
        }));
        expect(state.core.objects[PLAYER_ZERO_WOLF_OBJECT_ID]).toMatchObject({
            actionReady: true,
            rousedBySpellTurnNumber: state.core.turnNumber,
        });
        expect(state.core.players['0'].discardSpellCardIds).toEqual([
            ROUSE_THE_BEAST_CARD_ID,
            JUNGLE_WOLF_CARD_ID,
        ]);

        state = runCommand(state, advancePhaseCommand('0'));
        expect(state.sys.phase).toBe('deployment');
        expect(state.core.phaseActorId).toBe('1');

        state = runCommand(state, castSpellCommand('1', {
            spellCardId: ASYRAN_CLERIC_CARD_ID,
            manaCost: 5,
            targetZoneId: 'd1',
        }));
        expect(state.core.objects[PLAYER_ONE_CLERIC_OBJECT_ID]).toMatchObject({
            sourceSpellCardId: ASYRAN_CLERIC_CARD_ID,
            zoneId: 'd1',
        });

        state = runCommand(state, castSpellCommand('1', {
            spellCardId: PILLAR_OF_LIGHT_CARD_ID,
            manaCost: 5,
            targetObjectId: PLAYER_ONE_CLERIC_OBJECT_ID,
        }));
        expect(state.core.objects[PLAYER_ONE_CLERIC_OBJECT_ID].damage).toBeGreaterThan(0);
        expect(state.core.players['1'].discardSpellCardIds).toEqual([
            PILLAR_OF_LIGHT_CARD_ID,
            ASYRAN_CLERIC_CARD_ID,
        ]);

        state = runCommand(state, advancePhaseCommand('1'));
        expect(state.sys.phase).toBe('initiativeQuickcast');
        expect(state.core.phaseActorId).toBe('0');
        state = runCommand(state, advancePhaseCommand('0'));
        expect(state.sys.phase).toBe('initiativeQuickcast');
        expect(state.core.phaseActorId).toBe('1');
        state = runCommand(state, advancePhaseCommand('1'));
        expect(state.sys.phase).toBe('creatureAction');
        expect(state.core.phaseActorId).toBe('0');

        state = runCommand(state, {
            type: MAGE_WARS_COMMANDS.MOVE_ARENA_OBJECT,
            playerId: '0',
            payload: {
                objectId: PLAYER_ZERO_WOLF_OBJECT_ID,
                toZoneId: 'a2',
            },
        });
        expect(state.core.objects[PLAYER_ZERO_WOLF_OBJECT_ID]).toMatchObject({
            zoneId: 'a2',
            actionReady: false,
        });
    });

    it('keeps Board and direct surface tutorial anchors available for the manifest targets', () => {
        const boardSource = fs.readFileSync(path.join(process.cwd(), 'src', 'games', 'mage-wars', 'Board.tsx'), 'utf8');
        const selectedAbilityActionDockSource = fs.readFileSync(
            path.join(process.cwd(), 'src', 'games', 'mage-wars', 'ui', 'selectedAbilityActionDock.tsx'),
            'utf8',
        );
        const tutorialAnchorSources = [boardSource, selectedAbilityActionDockSource].join('\n');
        for (const anchor of [
            'mw-board',
            'mw-stage',
            'mw-self-hud',
            'mw-opponent-hud',
            'mw-opponent-prepared',
            'mw-opponent-view-toggle',
            'mw-discard',
            'mw-back-to-self-view',
            'mw-spellbook',
            'mw-plan-spells',
            'mw-prepared',
            'mw-turn-end',
            'mw-arena',
            'mw-zone-',
            'mw-field-object-',
            'mw-arena-object-',
            'mw-spellbook-category-',
            'mw-spellbook-next-page',
            'mw-spellbook-card-',
            'mw-prepared-card-',
            'mw-wall-edge-',
            'mw-wall-card-',
            'mw-selected-unit-guard',
            'mw-life-toggle',
            'mw-ability-action-dock',
            'mw-ability-healing-light',
            'mw-ability-restore',
            'mw-mage-entity-',
            'data-tutorial-object-id',
        ]) {
            expect(tutorialAnchorSources).toContain(anchor);
        }
        expect(boardSource).not.toContain('mw-opponent-discard');
        expect(boardSource).not.toContain('mage-wars-opponent-discard-pile');
        const highlightTargets = allTutorialManifests()
            .flatMap((manifest) => manifest.steps.map((step) => step.highlightTarget))
            .filter((target): target is string => Boolean(target));
        expect(highlightTargets).toEqual(expect.arrayContaining([
            'mw-board',
            'mw-self-hud',
            'mw-opponent-view-toggle',
            'mw-discard',
            `mw-field-object-${JUNGLE_WOLF_CARD_ID}`,
        ]));
        expect(highlightTargets.some((target) => target.includes('mw-wall-card-'))).toBe(false);
        expect(highlightTargets.some((target) => target.includes('mw-arena-object-mw-tutorial-'))).toBe(false);
    });
});
