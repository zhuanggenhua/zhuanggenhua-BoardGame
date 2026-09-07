import {
    describe,
    expect,
    it,
} from 'vitest';
import zhCNLocale from '../../../../public/locales/zh-CN/game-betrayal.json';
import enLocale from '../../../../public/locales/en/game-betrayal.json';
import {
    buildDiscoveryAtlasImageStyle,
    EVENT_FRONT_ATLAS,
    EVENT_FRONT_FRAME_BY_TITLE,
    resolveDiscoveryAtlasVisual,
} from '../discoveryAtlas';
import { resolvePossessionAtlasVisual } from '../possessionAtlas';
import { BETRAYAL_DISCOVERY_POOLS } from '../scenarioConfig';
import tutorialCatalog from '../tutorial';
import { BETRAYAL_COMMANDS } from '../commands';
import { resolveBetrayalHauntSpecialActionStatus } from '../hauntSpecialActionReadModel';
import {
    acknowledgePendingCardResolution,
    applyBetrayalCommand,
    createBetrayalScriptedRandom,
    createJackSpiritPostReviveAttackReadyTutorialCore,
    createMummyMonsterAttackRewardReadyTutorialCore,
    createMummyMonsterMoveReadyTutorialCore,
    createMummyReadyToBanishTutorialCore,
    createMummyTraitorVictoryReadyTutorialCore,
    createNaturalHauntTriggerPendingResolutionTutorialCore,
    createNaturalHauntTriggerTutorialCore,
    createSafeOmenPendingResolutionTutorialCore,
} from '../testing/firstScenarioTestUtils';

const collectPlayerText = (value: unknown): string[] => {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.flatMap(collectPlayerText);
    if (value && typeof value === 'object') {
        return Object.values(value).flatMap(collectPlayerText);
    }
    return [];
};

const LOCKED_EVENT_FRONT_FRAMES = {
    标本剥制: 0,
    不可能的房间: 1,
    磁带播放器: 2,
    大宅饿了: 3,
    地狱蝙蝠: 4,
    电话铃声: 5,
    吊死鬼: 6,
    断手: 7,
    嘎吱的木门: 8,
    怪异的镜子: 9,
    花团锦簇: 10,
    晦暗暴风夜: 11,
    技术难点: 12,
    佳馔满桌: 13,
    禁忌知识: 14,
    可怜的尤里克: 15,
    轮到约拿了: 16,
    秘密升降机: 17,
    脑状食品: 18,
    片刻希望: 19,
    肉质苔癣: 20,
    上古旧宅: 21,
    神秘液体: 22,
    '说“茄子”！': 23,
    外星几何: 24,
    无线电广播: 25,
    小丑房间: 26,
    小机器人: 27,
    摇曳灯光: 28,
    '咬一口！': 29,
    夜幕众星: 30,
    一罐器官: 31,
    一抹鲜红: 32,
    一瓶微尘: 33,
    一声呼救: 34,
    一条秘密通道: 35,
    一种怪异的感觉: 36,
    游魂: 37,
    '在你背后！': 38,
    葬礼: 39,
    着火的人: 40,
    '蜘蛛！': 41,
    最深的壁橱: 42,
} as const;

describe('Betrayal 教程配置', () => {
    it('导出合并后的 TutorialCollection，并只把主线和叛徒视角放进玩家目录', () => {
        expect(tutorialCatalog.defaultTutorialId).toBe('basic-setup-and-turn');
        expect(Object.keys(tutorialCatalog.tutorials)).toEqual([
            'basic-setup-and-turn',
            'omen-confirmation-and-haunt-risk',
            'haunt-natural-trigger-flow',
            'trade-and-agreement',
            'move-explore-use',
            'crimson-jack-objective',
            'haunt-actions-and-finish',
            'hero-attack-path',
            'jack-spirit-path',
            'traitor-path',
            'mummy-traitor-victory-chain',
            'mummy-monster-actions',
        ]);
        expect(Object.entries(tutorialCatalog.tutorials)
            .filter(([, entry]) => entry.hiddenFromCatalog !== true)
            .map(([id]) => id)).toEqual([
            'basic-setup-and-turn',
            'traitor-path',
        ]);
        expect(tutorialCatalog.tutorials['basic-setup-and-turn']?.titleKey).toBe('tutorial.mainPath.title');
        for (const hiddenTutorialId of [
            'omen-confirmation-and-haunt-risk',
            'haunt-natural-trigger-flow',
            'trade-and-agreement',
            'move-explore-use',
            'crimson-jack-objective',
            'haunt-actions-and-finish',
            'hero-attack-path',
            'jack-spirit-path',
            'mummy-traitor-victory-chain',
            'mummy-monster-actions',
        ]) {
            expect(tutorialCatalog.tutorials[hiddenTutorialId]?.hiddenFromCatalog).toBe(true);
        }
        expect(tutorialCatalog.tutorials['traitor-path']?.hiddenFromCatalog).not.toBe(true);
    });

    it('默认教程沿真实基础回合主线推进，只有叛徒视角另列目录章节', () => {
        const manifest = tutorialCatalog.tutorials['basic-setup-and-turn']?.manifest;
        expect(manifest?.steps.map((step) => step.id)).toEqual([
            'setup-runtime',
            'objective-and-turn',
            'traits-and-speed',
            'trait-track-reading',
            'moves-remaining',
            'room-board',
            'observe-teammate',
            'focus-self-room',
            'haunt-risk-track',
            'inventory-and-help',
            'open-move-targets',
            'move-to-hallway',
            'explore-upper',
            'rotate-room-placement',
            'confirm-room-placement',
            'discovery-card-type',
            'roll-event',
            'view-book',
            'use-book',
            'use-rabbit-foot',
            'rabbit-foot-result',
            'finish',
            'return-to-table-after-damage',
            'end-turn-after-event',
            'watch-teammate-one-omen-turn',
            'teammate-one-omen-results',
            'watch-teammate-two-omen-turn',
            'teammate-two-omen-results',
            'move-to-grand-staircase',
            'switch-to-upper-floor',
            'move-to-upper-landing',
            'end-turn-from-upper-landing',
            'watch-teammate-haunt-trigger',
            'teammate-confirm-haunt-trigger',
            'haunt-hero-reader',
            'haunt-hero-reader-turn-page',
            'haunt-hero-reader-goal',
            'haunt-hero-reader-close',
            'wait-for-hero-turn-after-haunt',
            'open-library-move-after-goal',
            'move-to-library-after-goal',
            'hero-study-name-roll',
            'hero-study-name-result',
            'hero-study-name-closeout',
        ]);
        expect(new Set(manifest?.steps.map((step) => step.id)).size).toBe(manifest?.steps.length);

        const setupStep = manifest?.steps.find((step) => step.id === 'setup-runtime');
        expect(setupStep?.aiActions).toHaveLength(1);
        expect(setupStep?.aiActions?.[0]?.commandType).toBe('SYS_CHEAT_MERGE_STATE');
        expect(manifest?.steps.find((step) => step.id === 'objective-and-turn')?.highlightTarget).toBe('betrayal-action-move');
        expect(manifest?.steps.find((step) => step.id === 'traits-and-speed')?.highlightTarget).toBe('betrayal-current-traits');
        expect(manifest?.steps.find((step) => step.id === 'trait-track-reading')?.highlightTarget).toBe('betrayal-current-traits');
        expect(manifest?.steps.find((step) => step.id === 'moves-remaining')?.highlightTarget).toBe('betrayal-moves-remaining');
        expect(manifest?.steps.find((step) => step.id === 'observe-teammate')?.highlightTarget).toBe('betrayal-bottom-teammate-1');
        expect(manifest?.steps.find((step) => step.id === 'focus-self-room')?.highlightTarget).toBe('betrayal-focus-self-room');
        expect(manifest?.steps.find((step) => step.id === 'haunt-risk-track')?.highlightTarget).toBe('betrayal-haunt-risk-status');
        for (const tradeStepId of [
            'start-trade',
            'choose-trade-item',
            'choose-trade-target',
            'choose-trade-return',
            'send-trade-request',
            'request-waiting',
            'trade-review',
        ]) {
            expect(manifest?.steps.find((step) => step.id === tradeStepId)).toBeUndefined();
        }
        expect(manifest?.steps.some((step) => step.id === 'accept-trade-request')).toBe(false);
        expect(manifest?.steps.find((step) => step.id === 'rotate-room-placement')?.highlightTarget).toBe('betrayal-room-placement-rotate-right');
        expect(manifest?.steps.find((step) => step.id === 'rotate-room-placement')?.requireAction).toBe(true);
        expect(manifest?.steps.find((step) => step.id === 'rotate-room-placement')?.allowedCommands).toEqual([]);
        expect(manifest?.steps.find((step) => step.id === 'confirm-room-placement')?.highlightTarget).toBe('betrayal-room-placement-confirm');
        expect(manifest?.steps.find((step) => step.id === 'discovery-card-type')?.highlightTarget).toBe('betrayal-latest-discovery');
        expect(manifest?.steps.find((step) => step.id === 'discovery-card-type')?.infoStep).toBe(true);
        expect(manifest?.steps.find((step) => step.id === 'view-book')?.highlightTarget).toBe('betrayal-inventory-omen-book-magnify');
        expect(manifest?.steps.find((step) => step.id === 'view-book')?.infoStep).toBe(true);
        expect(manifest?.steps.find((step) => step.id === 'use-book')?.highlightTarget).toBe('betrayal-inventory-omen-book');
        expect(manifest?.steps.find((step) => step.id === 'use-rabbit-foot')?.highlightTarget).toBe('betrayal-inventory-rope');
        expect(manifest?.steps.find((step) => step.id === 'rabbit-foot-result')?.highlightTarget).toBe('betrayal-latest-discovery');
        expect(manifest?.steps.find((step) => step.id === 'rabbit-foot-result')?.infoStep).toBe(true);
        expect(manifest?.steps.find((step) => step.id === 'rabbit-foot-result')?.allowedCommands).toEqual(['FINALIZE_EVENT_ROLL']);
        expect(manifest?.steps.find((step) => step.id === 'rabbit-foot-result')?.advanceOnEvents).toEqual([
            { type: 'EVENT_ROLL_FINALIZED', match: { isFullyAcknowledged: true } },
        ]);
        expect(manifest?.steps.find((step) => step.id === 'finish')).toMatchObject({
            requireAction: true,
            allowedCommands: ['RESOLVE_DAMAGE_ALLOCATION'],
            advanceOnEvents: [{ type: 'DAMAGE_ALLOCATION_RESOLVED', match: { playerId: '0' } }],
        });
        expect(manifest?.steps.find((step) => step.id === 'return-to-table-after-damage')).toMatchObject({
            highlightTarget: 'betrayal-discovery-continue',
            requireAction: true,
            allowedCommands: [],
            viewAs: '0',
        });
        expect(manifest?.steps.find((step) => step.id === 'end-turn-after-event')).toMatchObject({
            highlightTarget: 'betrayal-action-endTurn',
            requireAction: true,
            allowedCommands: ['END_TURN'],
            advanceOnEvents: [{ type: 'TURN_ENDED', match: { previousPlayerId: '0', nextPlayerId: '1' } }],
            viewAs: '0',
        });
        expect(manifest?.steps.find((step) => step.id === 'watch-teammate-one-omen-turn')).toMatchObject({
            infoStep: true,
            viewAs: '0',
            randomPolicy: { mode: 'fixed', values: [1] },
            autoAdvanceAfterAi: false,
        });
        expect(manifest?.steps.find((step) => step.id === 'watch-teammate-one-omen-turn')?.aiActions?.map((action) => ({
            commandType: action.commandType,
            playerId: action.playerId,
            payload: action.payload,
        }))).toEqual([
            { commandType: 'MOVE_TO_ROOM', playerId: '1', payload: { roomId: 'entrance-hall' } },
            { commandType: 'EXPLORE_ROOM', playerId: '1', payload: { roomId: 'ground-east' } },
        ]);
        expect(manifest?.steps.find((step) => step.id === 'teammate-one-omen-results')?.aiActions?.map((action) => ({
            commandType: action.commandType,
            playerId: action.playerId,
            payload: action.payload,
        }))).toEqual([
            { commandType: 'ACKNOWLEDGE_CARD_RESOLUTION', playerId: '1', payload: undefined },
            { commandType: 'END_TURN', playerId: '1', payload: undefined },
        ]);
        expect(manifest?.steps.find((step) => step.id === 'watch-teammate-two-omen-turn')).toMatchObject({
            infoStep: true,
            viewAs: '0',
            randomPolicy: { mode: 'fixed', values: [1] },
            autoAdvanceAfterAi: false,
        });
        expect(manifest?.steps.find((step) => step.id === 'move-to-grand-staircase')).toMatchObject({
            highlightTarget: 'betrayal-action-move',
            requireAction: true,
            allowedCommands: ['MOVE_TO_ROOM'],
            allowedTargets: ['hallway', 'grand-staircase'],
            advanceOnEvents: [{ type: 'EXPLORER_MOVED', match: { playerId: '0', roomId: 'grand-staircase' } }],
            viewAs: '0',
        });
        expect(manifest?.steps.find((step) => step.id === 'switch-to-upper-floor')).toMatchObject({
            highlightTarget: 'betrayal-room-floor-up',
            requireAction: true,
            allowedCommands: [],
            viewAs: '0',
        });
        expect(manifest?.steps.find((step) => step.id === 'move-to-upper-landing')).toMatchObject({
            highlightTarget: 'betrayal-room-upper-landing',
            requireAction: true,
            allowedCommands: ['MOVE_TO_ROOM'],
            allowedTargets: ['upper-landing'],
            advanceOnEvents: [{ type: 'EXPLORER_MOVED', match: { playerId: '0', roomId: 'upper-landing' } }],
            viewAs: '0',
        });
        expect(manifest?.steps.find((step) => step.id === 'move-to-library-room')).toBeUndefined();
        expect(manifest?.steps.find((step) => step.id === 'end-turn-from-library')).toBeUndefined();
        expect(manifest?.steps.find((step) => step.id === 'end-turn-from-upper-landing')).toMatchObject({
            highlightTarget: 'betrayal-action-endTurn',
            requireAction: true,
            allowedCommands: ['END_TURN'],
            advanceOnEvents: [{ type: 'TURN_ENDED', match: { previousPlayerId: '0', nextPlayerId: '1' } }],
            viewAs: '0',
        });
        expect(manifest?.steps.find((step) => step.id === 'watch-teammate-haunt-trigger')).toMatchObject({
            infoStep: true,
            viewAs: '0',
            randomPolicy: { mode: 'fixed', values: [3] },
            autoAdvanceAfterAi: false,
        });
        expect(manifest?.steps.find((step) => step.id === 'watch-teammate-haunt-trigger')?.aiActions?.map((action) => ({
            commandType: action.commandType,
            playerId: action.playerId,
            payload: action.payload,
        }))).toEqual([
            { commandType: 'EXPLORE_ROOM', playerId: '1', payload: { roomId: 'frontier-ground-east-south' } },
        ]);
        expect(manifest?.steps.find((step) => step.id === 'teammate-confirm-haunt-trigger')?.aiActions?.map((action) => ({
            commandType: action.commandType,
            playerId: action.playerId,
            payload: action.payload,
        }))).toEqual([
            { commandType: 'ACKNOWLEDGE_CARD_RESOLUTION', playerId: '1', payload: undefined },
        ]);
        expect(manifest?.steps.filter((step) => (
            (step.viewAs === '1' || step.viewAs === '2') &&
            step.requireAction === true
        ))).toEqual([]);
        expect(manifest?.steps.find((step) => step.id === 'haunt-hero-reader')).toMatchObject({
            infoStep: true,
            viewAs: '0',
        });
        expect(manifest?.steps.find((step) => step.id === 'open-library-move-after-goal')).toMatchObject({
            highlightTarget: 'betrayal-action-move',
            requireAction: true,
            allowedCommands: [],
            viewAs: '0',
        });
        expect(manifest?.steps.find((step) => step.id === 'move-to-library-after-goal')).toMatchObject({
            highlightTarget: 'betrayal-room-upper-west',
            requireAction: true,
            allowedCommands: [BETRAYAL_COMMANDS.MOVE_TO_ROOM],
            allowedTargets: ['upper-west'],
            advanceOnEvents: [{ type: 'EXPLORER_MOVED', match: { playerId: '0', roomId: 'upper-west' } }],
            viewAs: '0',
        });
        expect(manifest?.steps.find((step) => step.id === 'hero-study-name-roll')).toMatchObject({
            highlightTarget: 'betrayal-action-use',
            requireAction: true,
            allowedCommands: [BETRAYAL_COMMANDS.STUDY_MUMMY_NAME],
            randomPolicy: { mode: 'fixed', values: [3] },
            advanceOnEvents: [{ type: 'MUMMY_NAME_STUDIED', match: { playerId: '0', success: true } }],
            viewAs: '0',
        });
        expect(manifest?.steps.find((step) => step.id === 'confirm-omen-card')).toBeUndefined();
        expect(manifest?.steps.find((step) => step.id === 'banish-mummy')).toBeUndefined();
    });

    it('玩家可见教程注入态不使用测试专用假对象', () => {
        const injectedPayloads = Object.values(tutorialCatalog.tutorials)
            .flatMap(({ manifest }) => manifest.steps)
            .flatMap((step) => step.aiActions ?? [])
            .map((action) => JSON.stringify(action.payload ?? {}))
            .join('\n');

        expect(injectedPayloads).not.toContain('测试中性事件');
        expect(injectedPayloads).not.toMatch(/测试牌|测试事件|中性占位结果/);
    });

    it('基础回合兼容入口保留真实的移动、探索、使用和伤害命令链', () => {
        const defaultManifest = tutorialCatalog.tutorials['basic-setup-and-turn']?.manifest;
        const manifest = tutorialCatalog.tutorials['move-explore-use']?.manifest;
        const setupStep = manifest?.steps.find((step) => step.id === 'setup-runtime');
        const setupFields = setupStep?.aiActions?.[0]?.payload?.fields as { eventOrder?: Array<{ name?: string }> } | undefined;
        const setupInventory = setupFields && 'currentExplorer' in setupFields
            ? (setupFields as { currentExplorer?: { inventory?: Array<{ id?: string; name?: string }> } }).currentExplorer?.inventory
            : undefined;
        const actionSteps = manifest?.steps.filter((step) => step.requireAction) ?? [];
        expect(actionSteps.map((step) => step.id)).toEqual([
            'move-to-hallway',
            'explore-upper',
            'rotate-room-placement',
            'confirm-room-placement',
            'roll-event',
            'use-book',
            'use-rabbit-foot',
            'finish',
            'return-to-table-after-damage',
        ]);
        expect(defaultManifest?.steps.slice(0, manifest?.steps.length).map((step) => step.id))
            .toEqual(manifest?.steps.map((step) => step.id));
        expect(tutorialCatalog.tutorials['move-explore-use']?.hiddenFromCatalog).toBe(true);
        expect(manifest?.steps.map((step) => step.id)).toContain('open-move-targets');
        expect(manifest?.steps.find((step) => step.id === 'open-move-targets')?.highlightTarget).toBe('betrayal-action-move');
        expect(actionSteps.map((step) => step.allowedCommands)).toEqual([
            ['MOVE_TO_ROOM'],
            [],
            [],
            ['EXPLORE_ROOM'],
            ['ROLL_EVENT'],
            ['USE_POSSESSION'],
            ['USE_RABBIT_FOOT', 'USE_ROLL_REROLL_ITEM'],
            ['RESOLVE_DAMAGE_ALLOCATION'],
            [],
        ]);
        expect(actionSteps.map((step) => step.allowedTargets ?? null)).toEqual([
            ['hallway'],
            null,
            null,
            null,
            null,
            ['omen-book'],
            ['rope'],
            null,
            null,
        ]);
        expect(manifest?.steps.find((step) => step.id === 'start-trade')).toBeUndefined();
        expect(manifest?.steps.find((step) => step.id === 'choose-trade-item')).toBeUndefined();
        expect(actionSteps.find((step) => step.id === 'use-book')?.highlightTarget).toBe('betrayal-inventory-omen-book');
        expect(actionSteps.find((step) => step.id === 'use-rabbit-foot')?.highlightTarget).toBe('betrayal-inventory-rope');
        expect(actionSteps.find((step) => step.id === 'finish')?.highlightTarget).toBe('betrayal-damage-allocation-panel');
        expect(actionSteps.at(-1)?.highlightTarget).toBe('betrayal-discovery-continue');
        expect(setupInventory?.map((card) => card.id)).toEqual(['rope', 'omen-book']);
        expect(JSON.stringify(setupFields)).toContain('地图');
        expect(JSON.stringify(setupFields)).not.toContain('头骨');
        expect(setupFields?.eventOrder?.map((event) => event.name)).toEqual(['标本剥制']);
        expect(JSON.stringify(setupFields)).not.toContain('测试中性事件');
    });

    it('交易教程会实际走同房间请求、接收方同意和结算链', () => {
        const manifest = tutorialCatalog.tutorials['trade-and-agreement']?.manifest;
        expect(manifest?.steps.map((step) => step.id)).toEqual([
            'setup-trade',
            'start-trade',
            'choose-trade-item',
            'choose-trade-target',
            'choose-trade-return',
            'send-trade-request',
            'request-waiting',
            'trade-review',
        ]);

        const setupStep = manifest?.steps.find((step) => step.id === 'setup-trade');
        const setupFields = setupStep?.aiActions?.[0]?.payload?.fields as { eventOrder?: Array<{ name?: string }> } | undefined;
        expect(setupStep?.aiActions?.[0]?.commandType).toBe('SYS_CHEAT_MERGE_STATE');
        expect(setupStep?.autoAdvanceAfterAi).toBe(false);
        expect(JSON.stringify(setupFields)).not.toContain('测试中性事件');
        expect(JSON.stringify(setupFields)).toContain('急救包');
        expect(JSON.stringify(setupFields)).toContain('地图');
        expect(manifest?.steps.find((step) => step.id === 'start-trade')?.highlightTarget).toBe('betrayal-action-trade');
        expect(manifest?.steps.find((step) => step.id === 'start-trade')?.infoStep).toBe(true);
        expect(manifest?.steps.find((step) => step.id === 'choose-trade-item')?.highlightTarget).toBe('betrayal-inventory-medical-kit');
        expect(manifest?.steps.find((step) => step.id === 'choose-trade-target')?.highlightTarget).toBe('betrayal-room-occupant-hallway-1');
        expect(manifest?.steps.find((step) => step.id === 'choose-trade-return')?.highlightTarget).toBe('betrayal-trade-return-selector');
        expect(manifest?.steps.find((step) => step.id === 'request-waiting')?.highlightTarget).toBe('betrayal-trade-flow-banner');

        const actionSteps = manifest?.steps.filter((step) => step.requireAction) ?? [];
        expect(actionSteps.map((step) => step.id)).toEqual([
            'send-trade-request',
        ]);
        expect(actionSteps.map((step) => step.allowedCommands)).toEqual([
            ['TRADE_POSSESSION'],
        ]);
        expect(actionSteps[0]?.advanceOnEvents).toEqual([
            { type: 'POSSESSION_TRADE_REQUESTED', match: { playerId: '0', targetPlayerId: '1' } },
        ]);
        const requestWaitingStep = manifest?.steps.find((step) => step.id === 'request-waiting');
        expect(requestWaitingStep?.aiActions).toEqual([
            {
                commandType: 'RESOLVE_TRADE_AGREEMENT',
                playerId: '1',
                payload: { accept: true },
                waitForBoardSyncAfter: true,
            },
        ]);
        expect(requestWaitingStep?.viewAs).toBe('0');
        expect(manifest?.steps.some((step) => step.viewAs === '1' && step.id.includes('trade'))).toBe(false);
        expect(manifest?.steps.find((step) => step.id === 'trade-review')?.highlightTarget).toBe('betrayal-room-latest-feedback');
    });

    it('预兆教程使用规则原文解释作祟检定，并保留一次确认动作', () => {
        const manifest = tutorialCatalog.tutorials['omen-confirmation-and-haunt-risk']?.manifest;
        expect(manifest?.steps.map((step) => step.id)).toEqual([
            'setup-omen-confirmation',
            'confirm-omen-card',
            'omen-confirmation-review',
            'haunt-risk-track',
        ]);

        const setupStep = manifest?.steps.find((step) => step.id === 'setup-omen-confirmation');
        expect(setupStep?.aiActions).toHaveLength(1);
        expect(setupStep?.aiActions?.[0]?.commandType).toBe('SYS_CHEAT_MERGE_STATE');
        const omenCore = createSafeOmenPendingResolutionTutorialCore();
        expect(omenCore.pendingCardResolutionQueue[0]).toMatchObject({
            playerId: '0',
            requiredPlayerIds: ['0'],
            acknowledgedPlayerIds: [],
        });

        expect(manifest?.steps.find((step) => step.id === 'haunt-risk-track')?.highlightTarget).toBe('betrayal-haunt-risk-status');
        expect(manifest?.steps.find((step) => step.id === 'confirm-omen-card')?.highlightTarget).toBe('betrayal-latest-discovery');
        expect(manifest?.steps.find((step) => step.id === 'omen-confirmation-review')?.highlightTarget).toBe('betrayal-inventory-zone');

        const actionSteps = manifest?.steps.filter((step) => step.requireAction) ?? [];
        expect(actionSteps.map((step) => step.id)).toEqual([
            'confirm-omen-card',
        ]);
        expect(actionSteps.map((step) => step.allowedCommands)).toEqual([
            ['ACKNOWLEDGE_CARD_RESOLUTION'],
        ]);
        expect(actionSteps[0]?.aiActions).toBeUndefined();
        expect(actionSteps[0]?.autoAdvanceAfterAi).toBeUndefined();
        expect(actionSteps[0]?.advanceOnEvents).toEqual([
            { type: 'CARD_RESOLUTION_ACKNOWLEDGED', match: { playerId: '0', remainingCount: 0 } },
        ]);
    });

    it('作祟自然触发流程优先展示多数英雄视角，叛徒视角只留独立章节', () => {
        const manifest = tutorialCatalog.tutorials['haunt-natural-trigger-flow']?.manifest;
        expect(manifest?.steps.map((step) => step.id)).toEqual([
            'setup-natural-haunt-flow',
            'hand-off-to-teammate-one',
            'watch-teammate-omen-turns',
            'teammate-omen-results',
            'watch-teammate-two-omen-turn',
            'teammate-two-omen-results',
            'hand-off-to-teammate-second-cycle',
            'watch-teammate-haunt-trigger',
            'teammate-confirm-haunt-trigger',
            'haunt-hero-reader',
            'haunt-hero-reader-turn-page',
            'haunt-hero-reader-goal',
            'haunt-hero-reader-close',
            'wait-for-hero-turn-after-haunt',
            'open-library-move-after-goal',
            'move-to-library-after-goal',
            'hero-study-name-roll',
            'hero-study-name-result',
            'hero-study-name-closeout',
        ]);
        expect(new Set(manifest?.steps.map((step) => step.id)).size).toBe(manifest?.steps.length);
        expect(tutorialCatalog.tutorials['haunt-natural-trigger-flow']?.hiddenFromCatalog).toBe(true);
        expect(manifest?.randomPolicy).toEqual({ mode: 'sequence', values: [1, 3, 3, 3, 3, 3], cursor: 0 });

        const setupStep = manifest?.steps.find((step) => step.id === 'setup-natural-haunt-flow');
        expect(setupStep?.aiActions).toHaveLength(1);
        expect(setupStep?.aiActions?.[0]?.commandType).toBe('SYS_CHEAT_MERGE_STATE');
        expect(setupStep?.autoAdvanceAfterAi).toBeUndefined();
        expect(setupStep?.infoStep).toBeUndefined();
        expect(setupStep?.showMask).toBeUndefined();
        expect(setupStep?.requireAction).toBeUndefined();
        expect(manifest?.steps.find((step) => step.id === 'hand-off-to-teammate-one')?.allowedCommands)
            .toEqual(['END_TURN']);
        const teammateAutomationStep = manifest?.steps.find((step) => step.id === 'watch-teammate-omen-turns');
        expect(teammateAutomationStep).toMatchObject({
            infoStep: true,
            viewAs: '0',
            highlightTarget: 'betrayal-haunt-risk-status',
        });
        expect(teammateAutomationStep?.requireAction).toBeUndefined();
        expect(teammateAutomationStep?.allowedCommands).toBeUndefined();
        expect(teammateAutomationStep?.aiActions?.map((action) => ({
            commandType: action.commandType,
            playerId: action.playerId,
            payload: action.payload,
        }))).toEqual([
            { commandType: 'EXPLORE_ROOM', playerId: '1', payload: { roomId: 'ground-east' } },
            { commandType: 'ACKNOWLEDGE_CARD_RESOLUTION', playerId: '1', payload: undefined },
            { commandType: 'END_TURN', playerId: '1', payload: undefined },
        ]);
        expect(teammateAutomationStep?.autoAdvanceAfterAi).toBe(false);
        expect(manifest?.steps.find((step) => step.id === 'teammate-omen-results')).toMatchObject({
            infoStep: true,
            viewAs: '0',
            highlightTarget: 'betrayal-haunt-risk-status',
        });
        const teammateTwoOmenStep = manifest?.steps.find((step) => step.id === 'watch-teammate-two-omen-turn');
        expect(teammateTwoOmenStep).toMatchObject({
            infoStep: true,
            viewAs: '0',
            highlightTarget: 'betrayal-haunt-risk-status',
            autoAdvanceAfterAi: false,
        });
        expect(teammateTwoOmenStep?.aiActions?.map((action) => ({
            commandType: action.commandType,
            playerId: action.playerId,
            payload: action.payload,
        }))).toEqual([
            { commandType: 'MOVE_TO_ROOM', playerId: '2', payload: { roomId: 'ground-east' } },
            { commandType: 'EXPLORE_ROOM', playerId: '2', payload: { roomId: 'frontier-ground-east-east' } },
        ]);
        const teammateTwoResultStep = manifest?.steps.find((step) => step.id === 'teammate-two-omen-results');
        expect(teammateTwoResultStep).toMatchObject({
            infoStep: true,
            viewAs: '0',
            highlightTarget: 'betrayal-haunt-risk-status',
            autoAdvanceAfterAi: false,
        });
        expect(teammateTwoResultStep?.aiActions?.map((action) => ({
            commandType: action.commandType,
            playerId: action.playerId,
            payload: action.payload,
        }))).toEqual([
            { commandType: 'ACKNOWLEDGE_CARD_RESOLUTION', playerId: '2', payload: undefined },
            { commandType: 'END_TURN', playerId: '2', payload: undefined },
        ]);
        expect(manifest?.steps.find((step) => step.id === 'hand-off-to-teammate-second-cycle')?.allowedCommands)
            .toEqual(['END_TURN']);
        const teammateHauntTriggerStep = manifest?.steps.find((step) => step.id === 'watch-teammate-haunt-trigger');
        expect(teammateHauntTriggerStep).toMatchObject({
            infoStep: true,
            viewAs: '0',
            highlightTarget: 'betrayal-haunt-risk-status',
            autoAdvanceAfterAi: false,
        });
        expect(teammateHauntTriggerStep?.aiActions?.map((action) => ({
            commandType: action.commandType,
            playerId: action.playerId,
            payload: action.payload,
        }))).toEqual([
            { commandType: 'EXPLORE_ROOM', playerId: '1', payload: { roomId: 'frontier-ground-east-south' } },
        ]);
        const teammateConfirmStep = manifest?.steps.find((step) => step.id === 'teammate-confirm-haunt-trigger');
        expect(teammateConfirmStep?.aiActions?.map((action) => ({
            commandType: action.commandType,
            playerId: action.playerId,
            payload: action.payload,
        }))).toEqual([
            { commandType: 'ACKNOWLEDGE_CARD_RESOLUTION', playerId: '1', payload: undefined },
        ]);
        expect(teammateConfirmStep?.viewAs).toBe('0');
        expect(manifest?.steps.filter((step) => (
            (step.viewAs === '1' || step.viewAs === '2') &&
            step.requireAction === true
        ))).toEqual([]);
        expect(manifest?.steps.filter((step) => (
            (step.viewAs === '1' || step.viewAs === '2') &&
            (step.allowedCommands?.length ?? 0) > 0
        ))).toEqual([]);
        expect(manifest?.steps.find((step) => step.id === 'haunt-hero-reader')?.infoStep).toBe(true);
        expect(manifest?.steps.find((step) => step.id === 'haunt-hero-reader')?.highlightTarget)
            .toBeUndefined();
        expect(manifest?.steps.find((step) => step.id === 'haunt-hero-reader-turn-page')).toMatchObject({
            highlightTarget: 'betrayal-scenario-reader-next-zone',
            requireAction: true,
            allowedCommands: [],
            viewAs: '0',
        });
        expect(manifest?.steps.find((step) => step.id === 'haunt-hero-reader-goal')).toMatchObject({
            highlightTarget: 'betrayal-scenario-book-section-special',
            position: 'left',
            infoStep: true,
            viewAs: '0',
        });
        expect(manifest?.steps.find((step) => step.id === 'haunt-hero-reader-close')).toMatchObject({
            highlightTarget: 'betrayal-scenario-reader-close',
            requireAction: true,
            allowedCommands: [],
            viewAs: '0',
        });
        expect(manifest?.steps.find((step) => step.id === 'haunt-trigger-board')).toBeUndefined();
        const waitForHeroTurnStep = manifest?.steps.find((step) => step.id === 'wait-for-hero-turn-after-haunt');
        expect(waitForHeroTurnStep).toMatchObject({
            infoStep: true,
            viewAs: '0',
            autoAdvanceAfterAi: false,
        });
        expect(waitForHeroTurnStep?.requireAction).toBeUndefined();
        expect(waitForHeroTurnStep?.allowedCommands).toBeUndefined();
        expect(waitForHeroTurnStep?.aiActions?.map((action) => ({
            commandType: action.commandType,
            playerId: action.playerId,
            payload: action.payload,
        }))).toEqual([
            { commandType: 'END_TURN', playerId: '2', payload: undefined },
        ]);
        expect(manifest?.steps.find((step) => step.id === 'open-library-move-after-goal')).toMatchObject({
            highlightTarget: 'betrayal-action-move',
            requireAction: true,
            allowedCommands: [],
            viewAs: '0',
        });
        expect(manifest?.steps.find((step) => step.id === 'move-to-library-after-goal')).toMatchObject({
            highlightTarget: 'betrayal-room-upper-west',
            requireAction: true,
            allowedCommands: [BETRAYAL_COMMANDS.MOVE_TO_ROOM],
            allowedTargets: ['upper-west'],
            advanceOnEvents: [{ type: 'EXPLORER_MOVED', match: { playerId: '0', roomId: 'upper-west' } }],
            viewAs: '0',
        });
        const studyNameStep = manifest?.steps.find((step) => step.id === 'hero-study-name-roll');
        expect(studyNameStep).toMatchObject({
            highlightTarget: 'betrayal-action-use',
            requireAction: true,
            allowedCommands: [BETRAYAL_COMMANDS.STUDY_MUMMY_NAME],
            randomPolicy: { mode: 'fixed', values: [3] },
            advanceOnEvents: [{ type: 'MUMMY_NAME_STUDIED', match: { playerId: '0', success: true } }],
            viewAs: '0',
        });
        expect(manifest?.steps.find((step) => step.id === 'hero-study-name-result')).toMatchObject({
            highlightTarget: 'betrayal-recent-roll-panel',
            highlightFrame: 'none',
            requireAction: true,
            allowedCommands: [BETRAYAL_COMMANDS.ACKNOWLEDGE_RECENT_ROLL],
            advanceOnEvents: [{ type: 'RECENT_ROLL_ACKNOWLEDGED', match: { isFullyAcknowledged: true } }],
            viewAs: '0',
        });
        expect(manifest?.steps.find((step) => step.id === 'hero-study-name-closeout')).toMatchObject({
            highlightTarget: 'betrayal-action-endTurn',
            infoStep: true,
            viewAs: '0',
        });

        const readyCore = createNaturalHauntTriggerTutorialCore();
        const readyExplorers = [readyCore.currentExplorer, ...readyCore.otherExplorers];
        expect(readyCore.phase).toBe('preHaunt');
        expect(readyCore.scenarioRuntime.hauntTriggered).toBe(false);
        expect(readyCore.latestDiscovery).toBeNull();
        expect(readyCore.pendingCardResolutionQueue).toEqual([]);
        expect(readyCore.currentPlayer).toBe('0');
        expect(readyCore.currentExplorer.roomId).toBe('upper-landing');
        expect(readyCore.rooms.find((room) => room.id === 'upper-west')).toMatchObject({
            name: '图书馆',
            visualId: 'library',
            state: 'discovered',
        });
        expect(readyCore.recommendedAction).toBe('endTurn');
        expect(readyCore.drawOrder).toEqual(['omen']);
        expect(readyCore.possessionOrderByKind.omen[0]).toMatchObject({
            id: 'ring',
            name: '指环',
            kind: 'omen',
        });
        expect(readyCore.possessionOrderByKind.omen[1]).toMatchObject({
            id: 'dog',
            name: '狗',
            kind: 'omen',
        });
        expect(readyCore.possessionOrderByKind.omen[2]).toMatchObject({
            id: 'mask',
            name: '面具',
            kind: 'omen',
        });
        expect(readyExplorers.flatMap((explorer) => explorer.inventory)
            .filter((card) => card.kind === 'omen')).toHaveLength(0);

        const triggeredCore = createNaturalHauntTriggerPendingResolutionTutorialCore();
        const triggeredExplorers = [triggeredCore.currentExplorer, ...triggeredCore.otherExplorers];
        const omenNamesByPlayerId = Object.fromEntries(triggeredExplorers.map((explorer) => [
            explorer.playerId,
            explorer.inventory.filter((card) => card.kind === 'omen').map((card) => card.name),
        ]));
        expect(triggeredCore.phase).toBe('haunt');
        expect(triggeredCore.scenarioRuntime.hauntTriggered).toBe(true);
        expect(triggeredCore.scenarioRuntime.hauntScenarioCardId).toBe('mummy-rampage');
        expect(triggeredCore.scenarioRuntime.hauntScenarioCardTitle).toBe('木乃伊横行');
        expect(triggeredCore.scenarioRuntime.traitorPlayerId).toBe('1');
        expect(triggeredCore.scenarioRuntime.traitorPlayerId).not.toBe('0');
        expect(triggeredCore.latestDiscovery).toMatchObject({
            kind: 'omen',
            title: '面具',
        });
        expect(triggeredCore.recentRoll).toMatchObject({
            kind: 'hauntRoll',
        });
        expect(triggeredCore.recentRoll?.dice).toHaveLength(3);
        expect(omenNamesByPlayerId).toMatchObject({
            '0': [],
            '1': ['指环', '面具'],
            '2': ['狗'],
        });
        expect(triggeredCore.pendingCardResolutionQueue[0]).toMatchObject({
            playerId: '1',
            requiredPlayerIds: ['1'],
            acknowledgedPlayerIds: [],
        });
        const heroReaderClosedCore = acknowledgePendingCardResolution(triggeredCore, '1');
        const heroTurnCore = applyBetrayalCommand(
            heroReaderClosedCore,
            BETRAYAL_COMMANDS.END_TURN,
            '2',
            {},
        );
        expect(heroTurnCore.currentPlayer).toBe('0');
        expect(heroTurnCore.currentExplorer.roomId).toBe('upper-landing');
        expect(resolveBetrayalHauntSpecialActionStatus(heroTurnCore, 'study-mummy-name', '0')).toMatchObject({
            active: false,
            canUse: false,
            reason: '当前没有满足条件的作祟特殊行动。',
        });
        const libraryReadyCore = applyBetrayalCommand(
            heroTurnCore,
            BETRAYAL_COMMANDS.MOVE_TO_ROOM,
            '0',
            { roomId: 'upper-west' },
        );
        expect(libraryReadyCore.currentPlayer).toBe('0');
        expect(libraryReadyCore.currentExplorer.roomId).toBe('upper-west');
        expect(resolveBetrayalHauntSpecialActionStatus(libraryReadyCore, 'study-mummy-name', '0')).toMatchObject({
            active: true,
            canUse: true,
            reason: null,
        });
        const studyResultCore = applyBetrayalCommand(
            libraryReadyCore,
            BETRAYAL_COMMANDS.STUDY_MUMMY_NAME,
            '0',
            {},
            200,
            createBetrayalScriptedRandom(3, 3, 3, 3),
        );
        expect(studyResultCore.scenarioRuntime.mummy?.knowledgeTokenCount).toBe(1);
        expect(studyResultCore.scenarioRuntime.mummy?.trueNameFound).toBe(true);
        expect(studyResultCore.recentRoll).toMatchObject({
            kind: 'hauntActionTraitCheck',
            playerId: '0',
            sourceTitle: '寻找木乃伊真名',
            rollLabel: '知识检定',
            latestLabel: '取得第 1 枚知识标记',
        });
        expect(studyResultCore.recommendedAction).toBe('endTurn');
        const acknowledgedStudyResultCore = applyBetrayalCommand(
            studyResultCore,
            BETRAYAL_COMMANDS.ACKNOWLEDGE_RECENT_ROLL,
            '0',
            {},
            201,
        );
        expect(acknowledgedStudyResultCore.recentRoll).toBeNull();
        expect(acknowledgedStudyResultCore.scenarioRuntime.mummy?.knowledgeTokenCount).toBe(1);
        expect(acknowledgedStudyResultCore.scenarioRuntime.mummy?.trueNameFound).toBe(true);
        expect(acknowledgedStudyResultCore.currentPlayer).toBe('0');
        expect(acknowledgedStudyResultCore.currentExplorer.roomId).toBe('upper-west');
        expect(acknowledgedStudyResultCore.recommendedAction).toBe('endTurn');
        expect(resolveBetrayalHauntSpecialActionStatus(
            acknowledgedStudyResultCore,
            'learn-mummy-banishment',
            '0',
        )).toMatchObject({
            active: false,
            canUse: false,
            reason: '当前没有满足条件的作祟特殊行动。',
        });
        expect(resolveBetrayalHauntSpecialActionStatus(
            acknowledgedStudyResultCore,
            'learn-about-jack',
            '0',
        )).toMatchObject({
            active: false,
            canUse: false,
            reason: '当前没有满足条件的作祟特殊行动。',
        });
        expect(acknowledgedStudyResultCore.scenarioRuntime.mummy?.banishmentSpellLearned).toBe(false);
    });

    it('教程发现事件使用正式 9x5 事件牌图集，不再按错误大格裁切', () => {
        expect(EVENT_FRONT_ATLAS).toMatchObject({
            imageW: 6076,
            imageH: 6376,
            cols: 9,
            rows: 5,
            colStarts: [0, 675, 1350, 2025, 2700, 3375, 4050, 4725, 5400],
            colWidths: [675, 675, 675, 675, 675, 675, 675, 675, 676],
            rowStarts: [0, 1275, 2550, 3825, 5100],
            rowHeights: [1275, 1275, 1275, 1275, 1276],
        });
        expect(EVENT_FRONT_FRAME_BY_TITLE).toEqual(LOCKED_EVENT_FRONT_FRAMES);
        expect(Object.keys(EVENT_FRONT_FRAME_BY_TITLE).sort()).toEqual(
            BETRAYAL_DISCOVERY_POOLS.events.map((event) => event.name).sort(),
        );
        expect(Object.values(EVENT_FRONT_FRAME_BY_TITLE).every((frameIndex) => (
            Number.isInteger(frameIndex)
            && frameIndex >= 0
            && frameIndex < 43
        ))).toBe(true);
        expect(EVENT_FRONT_FRAME_BY_TITLE.标本剥制).toBe(0);

        const visual = resolveDiscoveryAtlasVisual({
            kind: 'event',
            title: '标本剥制',
            summary: '进行一次力量检定。',
            detail: '5+ 获得 1 点神志。',
        }, []);

        expect(visual).toMatchObject({
            image: 'betrayal/cards/event-front-atlas',
            frameIndex: 0,
        });
        const style = buildDiscoveryAtlasImageStyle(visual!);
        expect(Number.parseFloat(String(style.width))).toBeCloseTo(900.148, 3);
        expect(Number.parseFloat(String(style.height))).toBeCloseTo(500.078, 3);
        expect(String(style.transform)).toContain('translate(-0%, -0%)');
    });

    it('发现牌展示能识别带运行时来源后缀的物品牌 ID', () => {
        expect(resolvePossessionAtlasVisual({
            id: 'medical-kit-armory-0-1',
            name: '急救包',
            kind: 'item',
        })).toMatchObject({
            image: 'betrayal/cards/item-front-atlas',
            frameIndex: 4,
        });
    });

    it('教程教学的发现牌分类必须保持事件、物品和预兆三类', () => {
        expect(BETRAYAL_DISCOVERY_POOLS.drawOrder).toEqual(['event', 'item', 'omen']);
        expect(BETRAYAL_DISCOVERY_POOLS.events.length).toBeGreaterThan(0);
        expect(BETRAYAL_DISCOVERY_POOLS.possessions.item.length).toBeGreaterThan(0);
        expect(BETRAYAL_DISCOVERY_POOLS.possessions.omen.length).toBeGreaterThan(0);
        expect(BETRAYAL_DISCOVERY_POOLS.possessions.item.map((card) => card.id)).not.toContain('dog');
        expect(BETRAYAL_DISCOVERY_POOLS.possessions.omen).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: 'dog', name: '狗', kind: 'omen' }),
            ]),
        );
    });

    it('haunt 章节会合并第一剧本目标与真实收尾入口', () => {
        const objectiveManifest = tutorialCatalog.tutorials['crimson-jack-objective']?.manifest;
        const hauntActionsManifest = tutorialCatalog.tutorials['haunt-actions-and-finish']?.manifest;
        const heroAttackManifest = tutorialCatalog.tutorials['hero-attack-path']?.manifest;
        const jackSpiritManifest = tutorialCatalog.tutorials['jack-spirit-path']?.manifest;
        const traitorManifest = tutorialCatalog.tutorials['traitor-path']?.manifest;
        const traitorVictoryManifest = tutorialCatalog.tutorials['mummy-traitor-victory-chain']?.manifest;
        const mummyMonsterManifest = tutorialCatalog.tutorials['mummy-monster-actions']?.manifest;
        expect(objectiveManifest).toBe(hauntActionsManifest);
        expect(hauntActionsManifest?.steps.find((step) => step.id === 'help-entry')?.highlightTarget).toBe('betrayal-open-scenario');
        expect(hauntActionsManifest?.steps.find((step) => step.id === 'haunt-actions')?.highlightTarget).toBe('betrayal-action-use');
        expect(hauntActionsManifest?.steps.find((step) => step.id === 'banish-mummy')?.allowedCommands)
            .toEqual(['BANISH_MUMMY']);
        expect(hauntActionsManifest?.steps.find((step) => step.id === 'banish-mummy')?.randomPolicy).toEqual({
            mode: 'sequence',
            values: [3, 3, 3, 3, 3, 1, 1, 1, 1, 1],
            cursor: 0,
        });
        expect(hauntActionsManifest?.steps.find((step) => step.id === 'banish-mummy')?.advanceOnEvents).toEqual([
            { type: 'MUMMY_BANISHED', match: { playerId: '0', success: true } },
        ]);
        expect(hauntActionsManifest?.steps.find((step) => step.id === 'endgame-review')?.highlightTarget).toBe('betrayal-endgame-screen');
        expect(heroAttackManifest?.steps.map((step) => step.id)).toEqual([
            'setup-hero-attack',
            'hero-attack-objective',
            'attack-traitor',
            'hero-attack-review',
        ]);
        const heroAttackObjective = heroAttackManifest?.steps.find((step) => step.id === 'hero-attack-objective');
        expect(heroAttackObjective?.highlightTarget).toBe('betrayal-open-scenario');
        expect(heroAttackObjective?.requireAction).toBe(true);
        expect(heroAttackObjective?.allowedCommands).toEqual([]);
        expect(heroAttackObjective?.infoStep).not.toBe(true);
        expect(heroAttackManifest?.steps.find((step) => step.id === 'attack-traitor')?.allowedCommands).toEqual(['HAUNT_ATTACK']);
        expect(heroAttackManifest?.steps.find((step) => step.id === 'attack-traitor')?.advanceOnEvents).toEqual([
            { type: 'HAUNT_ATTACK_RESOLVED', match: { attackerPlayerId: '0', target: 'traitor' } },
        ]);
        expect(heroAttackManifest?.steps.find((step) => step.id === 'hero-attack-review')?.highlightTarget).toBe('betrayal-attack-roll-review');
        expect(jackSpiritManifest?.steps.map((step) => step.id)).toEqual([
            'setup-jack-spirit',
            'jack-spirit-objective',
            'jack-spirit-attack',
            'jack-spirit-review',
        ]);
        const jackSpiritObjective = jackSpiritManifest?.steps.find((step) => step.id === 'jack-spirit-objective');
        expect(jackSpiritObjective?.highlightTarget).toBe('betrayal-open-scenario');
        expect(jackSpiritObjective?.requireAction).toBe(true);
        expect(jackSpiritObjective?.allowedCommands).toEqual([]);
        expect(jackSpiritObjective?.infoStep).not.toBe(true);
        expect(jackSpiritManifest?.steps.find((step) => step.id === 'jack-spirit-attack')?.allowedCommands).toEqual(['HAUNT_ATTACK']);
        expect(jackSpiritManifest?.steps.find((step) => step.id === 'jack-spirit-attack')?.advanceOnEvents).toEqual([
            { type: 'HAUNT_ATTACK_RESOLVED', match: { attackerPlayerId: '2', target: 'hero' } },
        ]);
        expect(jackSpiritManifest?.steps.find((step) => step.id === 'jack-spirit-review')?.highlightTarget).toBe('betrayal-attack-roll-review');
        expect(traitorManifest?.steps.map((step) => step.id)).toEqual([
            'setup-traitor-monster-actions',
            'traitor-objective',
            'mummy-monster-turn-start',
            'mummy-monster-roll',
            'mummy-monster-roll-review',
            'mummy-monster-move-target',
            'mummy-monster-move-result',
            'setup-mummy-attack',
            'mummy-attack-forced',
            'mummy-attack-target',
            'mummy-attack-roll-review',
            'mummy-attack-reward',
            'mummy-steal-result',
        ]);
        expect(traitorManifest?.steps.map((step) => step.id)).not.toContain('pick-up-girl');
        expect(traitorManifest?.steps.map((step) => step.id)).not.toContain('give-girl-to-mummy');
        const traitorSetup = traitorManifest?.steps.find((step) => step.id === 'setup-traitor-monster-actions');
        expect(traitorSetup?.aiActions).toHaveLength(1);
        expect(traitorSetup?.infoStep).toBeUndefined();
        expect(traitorSetup?.showMask).toBeUndefined();
        expect(traitorSetup?.autoAdvanceAfterAi).not.toBe(false);
        const traitorObjective = traitorManifest?.steps.find((step) => step.id === 'traitor-objective');
        expect(traitorObjective?.highlightTarget).toBe('betrayal-open-scenario');
        expect(traitorObjective?.requireAction).toBe(true);
        expect(traitorObjective?.allowedCommands).toEqual([]);
        expect(traitorObjective?.infoStep).not.toBe(true);
        expect(traitorVictoryManifest?.steps.map((step) => step.id)).toEqual([
            'setup-traitor-turn',
            'traitor-objective',
            'pick-up-girl',
            'give-girl-to-mummy',
            'give-omen-to-mummy',
            'traitor-finish',
        ]);
        expect(tutorialCatalog.tutorials['mummy-traitor-victory-chain']?.hiddenFromCatalog).toBe(true);
        expect(traitorVictoryManifest?.steps.find((step) => step.id === 'setup-traitor-turn')?.viewAs).toBe('2');
        expect(traitorVictoryManifest?.steps.find((step) => step.id === 'pick-up-girl')?.allowedCommands).toEqual(['PICK_UP_MUMMY_GIRL']);
        expect(traitorVictoryManifest?.steps.find((step) => step.id === 'pick-up-girl')?.advanceOnEvents).toEqual([
            { type: 'MUMMY_GIRL_PICKED_UP', match: { playerId: '2' } },
        ]);
        expect(traitorVictoryManifest?.steps.find((step) => step.id === 'give-girl-to-mummy')?.allowedCommands).toEqual(['GIVE_GIRL_TO_MUMMY']);
        expect(traitorVictoryManifest?.steps.find((step) => step.id === 'give-girl-to-mummy')?.advanceOnEvents).toEqual([
            { type: 'MUMMY_GIRL_GIVEN', match: { playerId: '2' } },
        ]);
        expect(traitorVictoryManifest?.steps.find((step) => step.id === 'give-omen-to-mummy')?.allowedCommands).toEqual(['GIVE_OMEN_TO_MUMMY']);
        expect(traitorVictoryManifest?.steps.find((step) => step.id === 'give-omen-to-mummy')?.advanceOnEvents).toEqual([
            { type: 'MUMMY_OMEN_GIVEN', match: { playerId: '2', cardId: 'holy-symbol' } },
        ]);
        expect(mummyMonsterManifest?.steps.map((step) => step.id)).toEqual([
            'setup-mummy-monster-move',
            'mummy-monster-turn-start',
            'mummy-monster-roll',
            'mummy-monster-roll-review',
            'mummy-monster-move-target',
            'mummy-monster-move-result',
            'setup-mummy-attack',
            'mummy-attack-forced',
            'mummy-attack-target',
            'mummy-attack-roll-review',
            'mummy-attack-reward',
            'mummy-steal-result',
        ]);
        expect(mummyMonsterManifest?.steps.find((step) => step.id === 'mummy-monster-turn-start')?.allowedCommands)
            .toEqual(['RESOLVE_MONSTER_TURN_START']);
        expect(mummyMonsterManifest?.steps.find((step) => step.id === 'mummy-monster-roll')?.allowedCommands)
            .toEqual(['ROLL_MONSTER_MOVEMENT_GROUP']);
        expect(mummyMonsterManifest?.steps.find((step) => step.id === 'mummy-monster-roll')?.randomPolicy).toEqual({
            mode: 'sequence',
            values: [1, 1, 1],
            cursor: 0,
        });
        expect(mummyMonsterManifest?.steps.find((step) => step.id === 'mummy-monster-roll-review')?.allowedCommands)
            .toEqual(['ACKNOWLEDGE_RECENT_ROLL']);
        expect(mummyMonsterManifest?.steps.find((step) => step.id === 'mummy-monster-roll-review')?.advanceOnEvents).toEqual([
            { type: 'RECENT_ROLL_ACKNOWLEDGED', match: { isFullyAcknowledged: true } },
        ]);
        expect(mummyMonsterManifest?.steps.find((step) => step.id === 'mummy-monster-roll-review')?.highlightFrame)
            .toBe('none');
        expect(mummyMonsterManifest?.steps.find((step) => step.id === 'mummy-monster-move-target')?.allowedCommands)
            .toEqual(['MOVE_MONSTER_TO_ROOM']);
        expect(mummyMonsterManifest?.steps.find((step) => step.id === 'mummy-attack-target')?.allowedCommands)
            .toEqual(['MONSTER_ATTACK_HERO']);
        expect(mummyMonsterManifest?.steps.find((step) => step.id === 'mummy-attack-target')?.randomPolicy).toEqual({
            mode: 'sequence',
            values: [3, 3, 3, 3, 3, 3, 3, 3, 1, 1, 1, 1],
            cursor: 0,
        });
        expect(mummyMonsterManifest?.steps.find((step) => step.id === 'mummy-attack-roll-review')?.highlightFrame)
            .toBe('none');
        expect(mummyMonsterManifest?.steps.find((step) => step.id === 'mummy-attack-roll-review')?.advanceOnEvents).toEqual([
            { type: 'RECENT_ROLL_ACKNOWLEDGED', match: { isFullyAcknowledged: true } },
        ]);
        expect(mummyMonsterManifest?.steps.find((step) => step.id === 'mummy-attack-reward')?.allowedCommands)
            .toEqual(['RESOLVE_MUMMY_ATTACK_REWARD']);
        expect(mummyMonsterManifest?.steps.find((step) => step.id === 'mummy-attack-reward')?.advanceOnEvents).toEqual([
            {
                type: 'MUMMY_ATTACK_REWARD_RESOLVED',
                match: { monsterId: 'mummy', choice: 'steal', stolenCardId: 'map' },
            },
        ]);
    });

    it('木乃伊叛徒教程必须停在女孩、木乃伊、石棺和圣符同房的真实胜利前状态', () => {
        const core = createMummyTraitorVictoryReadyTutorialCore();
        const traitorId = core.scenarioRuntime.traitorPlayerId;
        const mummy = core.scenarioRuntime.mummy;
        const mummyMonster = core.monsters.find((monster) => monster.id === mummy?.mummyMonsterId);
        const completedMonsterIds = core.monsters.map((monster) => monster.id);

        expect(core.scenarioRuntime.hauntScenarioCardId).toBe('mummy-rampage');
        expect(core.scenarioRuntime.hauntScenarioCardTitle).toBe('木乃伊横行');
        expect(core.currentPlayer).toBe(traitorId);
        expect(core.currentExplorer.playerId).toBe(traitorId);
        expect(core.currentExplorer.inventory.map((card) => card.id)).toContain('holy-symbol');
        expect(mummy?.sarcophagusRoomId).toBe(core.currentExplorer.roomId);
        expect(mummy?.girlRoomId).toBe(core.currentExplorer.roomId);
        expect(mummy?.girlHeldByMummy).toBe(false);
        expect(mummy?.mummyCarriedOmenIds).toEqual([]);
        expect(mummyMonster?.roomId).toBe(core.currentExplorer.roomId);
        expect(core.scenarioRuntime.monsterTurn.resolvedStartMonsterIds).toEqual(completedMonsterIds);
        expect(core.scenarioRuntime.monsterTurn.skippedMonsterIdsThisTurn).toEqual(completedMonsterIds);
        expect(core.scenarioRuntime.monsterTurn.attackedMonsterIdsThisTurn).toEqual(completedMonsterIds);
        expect(core.scenarioRuntime.monsterTurn.movedMonsterIdsThisTurn).toEqual(completedMonsterIds);
        expect(core.scenarioRuntime.monsterTurn.movementRollsByGroupId).toEqual({});
        expect(core.scenarioRuntime.monsterTurn.moveRemainingById).toEqual(
            Object.fromEntries(completedMonsterIds.map((monsterId) => [monsterId, 0])),
        );
        expect(core.recentRoll).toBeNull();
    });

    it('木乃伊怪物移动教程必须停在叛徒操控木乃伊、女孩远处且无阻塞弹层的状态', () => {
        const core = createMummyMonsterMoveReadyTutorialCore();
        const traitorId = core.scenarioRuntime.traitorPlayerId;
        const mummy = core.scenarioRuntime.mummy;
        const mummyMonster = core.monsters.find((monster) => monster.id === mummy?.mummyMonsterId);

        expect(core.scenarioRuntime.hauntScenarioCardId).toBe('mummy-rampage');
        expect(core.currentPlayer).toBe(traitorId);
        expect(core.currentExplorer.playerId).toBe(traitorId);
        expect(mummyMonster?.roomId).toBe(mummy?.sarcophagusRoomId);
        expect(mummy?.girlRoomId).toBeTruthy();
        expect(mummy?.girlRoomId).not.toBe(mummy?.sarcophagusRoomId);
        expect(mummy?.girlHolderPlayerId).toBeNull();
        expect(mummy?.girlHeldByMummy).toBe(false);
        expect(core.latestDiscovery).toBeNull();
        expect(core.pendingCardResolutionQueue).toEqual([]);
        expect(core.pendingEventChoice).toBeNull();
        expect(core.pendingDamageAllocation).toBeNull();
        expect(core.recentRoll).toBeNull();
    });

    it('木乃伊攻击奖励教程必须停在同房先攻击且英雄有地图和圣符的状态', () => {
        const core = createMummyMonsterAttackRewardReadyTutorialCore();
        const traitorId = core.scenarioRuntime.traitorPlayerId;
        const mummy = core.scenarioRuntime.mummy;
        const mummyMonster = core.monsters.find((monster) => monster.id === mummy?.mummyMonsterId);
        const livingHero = [core.currentExplorer, ...core.otherExplorers]
            .find((explorer) => (
                explorer.playerId !== traitorId
                && !core.scenarioRuntime.deadExplorerPlayerIds.includes(explorer.playerId)
            ));

        expect(core.scenarioRuntime.hauntScenarioCardId).toBe('mummy-rampage');
        expect(core.currentPlayer).toBe(traitorId);
        expect(core.currentExplorer.playerId).toBe(traitorId);
        expect(mummyMonster?.roomId).toBe(mummy?.sarcophagusRoomId);
        expect(livingHero?.roomId).toBe(mummyMonster?.roomId);
        expect(livingHero?.inventory.map((card) => card.id)).toEqual(['map', 'holy-symbol']);
        expect(core.scenarioRuntime.monsterTurn.movementRollsByGroupId['木乃伊:3']).toMatchObject({
            dice: [0, 0, 0],
            total: 0,
            moveAllowance: 0,
        });
        expect(core.scenarioRuntime.monsterTurn.moveRemainingById[mummy?.mummyMonsterId ?? '']).toBe(0);
        expect(core.latestDiscovery).toBeNull();
        expect(core.pendingDamageAllocation).toBeNull();
        expect(core.recentRoll).toBeNull();
    });

    it('杰克之灵攻击教程必须停在灵体已释放且英雄同房的真实攻击态', () => {
        const core = createJackSpiritPostReviveAttackReadyTutorialCore();
        const hero = [core.currentExplorer, ...core.otherExplorers]
            .find((explorer) => explorer.playerId === '0');

        expect(core.currentPlayer).toBe('2');
        expect(core.scenarioRuntime.deadExplorerPlayerIds).toContain('2');
        expect(core.scenarioRuntime.jackSpiritReleased).toBe(true);
        expect(core.scenarioRuntime.jackSpiritRoomId).toBeTruthy();
        expect(core.monsters.find((monster) => monster.id === 'jack-spirit')?.roomId)
            .toBe(core.scenarioRuntime.jackSpiritRoomId);
        expect(core.recentRoll).toBeNull();
        expect(hero?.roomId).toBe(core.scenarioRuntime.jackSpiritRoomId);
    });

    it('木乃伊作祟收尾教程必须停在已找真名、已学法术、可驱逐的真实状态', () => {
        const core = createMummyReadyToBanishTutorialCore();

        expect(core.scenarioRuntime.hauntScenarioCardId).toBe('mummy-rampage');
        expect(core.scenarioRuntime.hauntScenarioCardTitle).toBe('木乃伊横行');
        expect(core.scenarioRuntime.mummy?.knowledgeTokenCount).toBe(2);
        expect(core.recentRoll).toBeNull();
        expect(core.currentPlayer).toBe('0');
        expect(core.currentExplorer.roomId).toBe(core.scenarioRuntime.mummy?.sarcophagusRoomId);
        expect(core.monsters.find((monster) => monster.id === core.scenarioRuntime.mummy?.mummyMonsterId)?.roomId)
            .toBe(core.currentExplorer.roomId);
    });

    it('中文教程文案会聚焦玩家能理解的规则动作与结果', () => {
        const officialOmenRuleZh = '抽到预兆卡时，大声朗读，把它放在自己面前并获得。然后进行作祟检定：按所有玩家持有的预兆总数掷骰；若作祟检定结果为 5+，作祟开始。';
        const officialOmenRuleEn = 'When you draw an Omen card, read its text aloud, place it face-up in front of you, and make a haunt roll. Roll dice equal to the total number of Omens held by all players; on a result of 5+, the haunt begins.';
        const omenSymbolBridgeZh = '带预兆符号的房间会翻出预兆牌。';
        const omenSymbolBridgeEn = 'A room with an Omen symbol reveals an Omen card.';
        const basicSteps = zhCNLocale.tutorial.basicSetup.steps;
        const tradeSteps = zhCNLocale.tutorial.tradeAndAgreement.steps;
        const hauntTriggerSteps = zhCNLocale.tutorial.hauntNaturalTrigger.steps;
        expect(zhCNLocale.tutorial.mainPath.title).toContain('主线教程');
        expect(zhCNLocale.tutorial.mainPath.description).toContain('基础回合');
        expect(zhCNLocale.tutorial.mainPath.description).toContain('事件处理');
        expect(zhCNLocale.tutorial.mainPath.description).not.toContain('交易');
        expect(zhCNLocale.tutorial.mainPath.description).not.toContain('驱逐木乃伊');
        expect(enLocale.tutorial.mainPath.title).toContain('Main Tutorial');
        expect(enLocale.tutorial.mainPath.description).toContain('core turn');
        expect(enLocale.tutorial.mainPath.description).toContain('event resolution');
        expect(enLocale.tutorial.mainPath.description).not.toContain('trading');
        expect(enLocale.tutorial.mainPath.description).not.toContain('banishing the Mummy');
        expect(zhCNLocale.tutorial.basicSetup.description).toContain('按任意顺序');
        expect(zhCNLocale.tutorial.basicSetup.description).toContain('探索新房间会结束你的回合');
        expect(enLocale.tutorial.basicSetup.description).toContain('in any order');
        expect(enLocale.tutorial.basicSetup.description).toContain('Discovering a new room ends your turn');
        expect(zhCNLocale.tutorial.omenConfirmation.description).toBe(`${omenSymbolBridgeZh}${officialOmenRuleZh}`);
        expect(zhCNLocale.tutorial.omenConfirmation.steps.setupOmenConfirmation).toBe(`${omenSymbolBridgeZh}${officialOmenRuleZh}`);
        expect(enLocale.tutorial.omenConfirmation.description).toBe(`${omenSymbolBridgeEn} ${officialOmenRuleEn}`);
        expect(enLocale.tutorial.omenConfirmation.steps.setupOmenConfirmation).toBe(`${omenSymbolBridgeEn} ${officialOmenRuleEn}`);
        expect(zhCNLocale.tutorial.basicSetup.steps.setupRuntime).toContain('基础回合');
        expect(zhCNLocale.tutorial.basicSetup.steps.objectiveAndTurn).toContain('现在是你的回合');
        expect(zhCNLocale.tutorial.basicSetup.steps.traitsAndSpeed).toContain('速度');
        expect(zhCNLocale.tutorial.basicSetup.steps.traitTrackReading).toContain('绿色数字');
        expect(zhCNLocale.tutorial.basicSetup.steps.traitTrackReading).toContain('骷髅');
        expect(zhCNLocale.tutorial.basicSetup.steps.traitTrackReading).toContain('重复的数字仍分别占格');
        expect(zhCNLocale.tutorial.basicSetup.steps.movesRemaining).toContain('本回合还剩的移动力');
        expect(zhCNLocale.tutorial.basicSetup.steps.observeTeammate).toContain('观察该探险者');
        expect(zhCNLocale.tutorial.basicSetup.steps.observeTeammate).toContain('进入观察前的位置');
        expect(zhCNLocale.tutorial.basicSetup.steps.focusSelfRoom).toContain('聚焦到我的房间');
        expect(zhCNLocale.tutorial.basicSetup.steps.focusSelfRoom).toContain('回到自己所在房间');
        expect(zhCNLocale.tutorial.basicSetup.steps.hauntRiskTrack).toContain('预兆进度条');
        expect(zhCNLocale.tutorial.basicSetup.steps.hauntRiskTrack).toContain('所有玩家持有的预兆总数');
        expect(zhCNLocale.tutorial.basicSetup.steps.hauntRiskTrack).toContain('5+');
        expect(basicSteps.viewBook).toContain('放大按钮');
        expect(basicSteps.viewBook).toContain('读它的牌面');
        expect(basicSteps.viewBook).toContain('花费 1 点神志改用知识');
        expect(basicSteps.viewBook).not.toContain('兔脚');
        expect(basicSteps.viewBook).not.toContain('伤害');
        expect(basicSteps.useBook).toContain('扣除 1 点神志');
        expect(basicSteps.useBook).toContain('使用书本本体');
        expect(basicSteps.useBook).toContain('改用知识重新投骰');
        expect(basicSteps.useBook).not.toContain('事件牌公开后');
        expect(basicSteps.rollEvent).toContain('给所有玩家看清');
        expect(zhCNLocale.tutorial.basicSetup.steps.exploreUpper).toContain('可探索的盖着房间');
        expect(zhCNLocale.tutorial.basicSetup.steps.exploreUpper).toContain('房间牌面');
        expect(basicSteps.rotateRoomPlacement).toContain('旋转新房间');
        expect(basicSteps.rotateRoomPlacement).toContain('未探索走廊相连');
        expect(basicSteps.rotateRoomPlacement).toContain('朝向');
        expect(zhCNLocale.tutorial.basicSetup.steps.confirmRoomPlacement).toContain('确认放置');
        expect(zhCNLocale.tutorial.basicSetup.steps.confirmRoomPlacement).toContain('结算房间文字和符号');
        expect(basicSteps.discoveryCardType).toContain('事件符号');
        expect(basicSteps.discoveryCardType).toContain('事件牌');
        expect(basicSteps.discoveryCardType).toContain('物品牌');
        expect(basicSteps.discoveryCardType).toContain('预兆牌');
        expect(basicSteps.rollEvent).not.toContain('兔脚');
        expect(basicSteps.rollEvent).not.toContain('伤害');
        expect(basicSteps.useBook).not.toContain('兔脚');
        expect(basicSteps.useBook).not.toContain('其他玩家确认');
        expect(basicSteps.useRabbitFoot).toContain('书本已把检定改成知识');
        expect(basicSteps.useRabbitFoot).toContain('确认使用兔脚');
        expect(basicSteps.useRabbitFoot).not.toContain('其他玩家确认');
        expect(basicSteps.useRabbitFoot).not.toContain('伤害');
        expect(basicSteps.rabbitFootResult).toContain('重掷完成');
        expect(basicSteps.rabbitFootResult).toContain('公开投掷');
        expect(basicSteps.rabbitFootResult).toContain('伤害分配');
        expect(basicSteps.rabbitFootResult).not.toContain('其他玩家确认');
        expect(basicSteps.rabbitFootResult).not.toContain('确认 1/3');
        expect(basicSteps.finish).toContain('承受 1 点物理伤害');
        expect(basicSteps.finish).not.toContain('改用知识重新投骰');
        expect(basicSteps.finish).not.toContain('兔脚');
        expect([
            [basicSteps.moveToHallway, tradeSteps.startTrade],
            [tradeSteps.startTrade, tradeSteps.chooseTradeItem],
            [tradeSteps.chooseTradeItem, tradeSteps.chooseTradeTarget],
            [tradeSteps.chooseTradeTarget, tradeSteps.chooseTradeReturn],
            [tradeSteps.chooseTradeReturn, tradeSteps.sendTradeRequest],
            [tradeSteps.sendTradeRequest, tradeSteps.requestWaiting],
            [tradeSteps.requestWaiting, tradeSteps.tradeReview],
            [tradeSteps.tradeReview, basicSteps.exploreUpper],
            [basicSteps.exploreUpper, basicSteps.rotateRoomPlacement],
            [basicSteps.rotateRoomPlacement, basicSteps.confirmRoomPlacement],
            [basicSteps.confirmRoomPlacement, basicSteps.discoveryCardType],
            [basicSteps.discoveryCardType, basicSteps.rollEvent],
            [basicSteps.rollEvent, basicSteps.viewBook],
            [basicSteps.viewBook, basicSteps.useBook],
            [basicSteps.useBook, basicSteps.useRabbitFoot],
            [basicSteps.useRabbitFoot, basicSteps.rabbitFootResult],
            [basicSteps.rabbitFootResult, basicSteps.finish],
        ].flatMap(([previous, current]) => {
            const previousSentences = previous.split(/[。；]/).map((part) => part.trim()).filter((part) => part.length >= 8);
            return previousSentences.filter((sentence) => current.includes(sentence));
        })).toEqual([]);
        expect(zhCNLocale.tutorial.omenConfirmation.title).toContain('预兆');
        expect(zhCNLocale.tutorial.omenConfirmation.description).toContain('预兆符号');
        expect(zhCNLocale.tutorial.omenConfirmation.description).toContain('翻出预兆牌');
        expect(zhCNLocale.tutorial.omenConfirmation.description).toContain('所有玩家持有的预兆总数');
        expect(zhCNLocale.tutorial.omenConfirmation.description).toContain('5+');
        expect(zhCNLocale.tutorial.omenConfirmation.steps.confirmOmenCard).toContain('预兆符号');
        expect(zhCNLocale.tutorial.omenConfirmation.steps.confirmOmenCard).toContain('翻出的预兆牌');
        expect(zhCNLocale.tutorial.omenConfirmation.steps.confirmOmenCard).toContain('点“确认”');
        expect(zhCNLocale.tutorial.omenConfirmation.steps.confirmOmenCard).toContain('所有玩家持有的预兆总数');
        expect(zhCNLocale.tutorial.omenConfirmation.steps.confirmOmenCard).toContain('5+');
        expect(zhCNLocale.tutorial.omenConfirmation.steps.confirmOmenCard).toContain('完成这次检定');
        expect(zhCNLocale.tutorial.omenConfirmation.steps.confirmOmenCard).not.toContain('预兆牌和作祟检定结果');
        expect(zhCNLocale.tutorial.omenConfirmation.steps.review).toContain('结果低于 5+');
        expect(zhCNLocale.tutorial.omenConfirmation.steps.review).toContain('你获得这张预兆');
        expect(zhCNLocale.tutorial.hauntNaturalTrigger.title).toContain('作祟自然触发');
        expect(zhCNLocale.tutorial.hauntNaturalTrigger.description).toContain('正常回合');
        expect(zhCNLocale.tutorial.hauntNaturalTrigger.description).toContain('队友行动作为公开结果推进');
        expect(zhCNLocale.tutorial.hauntNaturalTrigger.description).toContain('你以英雄视角阅读英雄剧本书');
        expect(zhCNLocale.tutorial.hauntNaturalTrigger.description).toContain('第一个英雄目标行动');
        expect(zhCNLocale.tutorial.hauntNaturalTrigger.description).not.toContain('两个英雄目标行动');
        expect(zhCNLocale.tutorial.hauntNaturalTrigger.description).not.toContain('你探索预兆房间');
        expect(enLocale.tutorial.hauntNaturalTrigger.title).toContain('Natural Haunt Trigger');
        expect(enLocale.tutorial.hauntNaturalTrigger.description).toContain('normal turns');
        expect(enLocale.tutorial.hauntNaturalTrigger.description).toContain('teammate turns advance as public results');
        expect(enLocale.tutorial.hauntNaturalTrigger.description).toContain('Hero Scenario Book');
        expect(enLocale.tutorial.hauntNaturalTrigger.description).toContain('first hero objective action');
        expect(enLocale.tutorial.hauntNaturalTrigger.description).not.toContain('first two hero objective actions');
        expect(hauntTriggerSteps.setupNaturalHauntFlow).toContain('多数英雄视角');
        expect(hauntTriggerSteps.setupNaturalHauntFlow).toContain('你在图书馆旁边结束自己的回合');
        expect(hauntTriggerSteps.setupNaturalHauntFlow).toContain('叛徒读本另有独立章节');
        expect(hauntTriggerSteps.handOffToTeammateOne).toContain('结束回合');
        expect(hauntTriggerSteps.watchTeammateOmenTurns).toContain('现在不是你的回合');
        expect(hauntTriggerSteps.watchTeammateOmenTurns).toContain('等待队友 1 探索预兆房间');
        expect(hauntTriggerSteps.watchTeammateOmenTurns).not.toContain('点“探索”');
        expect(hauntTriggerSteps.watchTeammateOmenTurns).not.toContain('点“结束回合”');
        expect(hauntTriggerSteps.teammateOmenResults).toContain('队友 1 获得指环');
        expect(hauntTriggerSteps.teammateOmenResults).toContain('1 颗作祟骰低于 5+');
        expect(hauntTriggerSteps.teammateOmenResults).toContain('交给队友 2');
        expect(hauntTriggerSteps.watchTeammateTwoOmenTurn).toContain('队友 2');
        expect(hauntTriggerSteps.watchTeammateTwoOmenTurn).toContain('翻出狗');
        expect(hauntTriggerSteps.watchTeammateTwoOmenTurn).toContain('2 颗骰');
        expect(hauntTriggerSteps.teammateTwoOmenResults).toContain('回合回到你');
        expect(hauntTriggerSteps.teammateTwoOmenResults).toContain('下一张预兆会掷 3 颗骰');
        expect(hauntTriggerSteps.handOffToTeammateSecondCycle).toContain('现在又轮到你');
        expect(hauntTriggerSteps.handOffToTeammateSecondCycle).toContain('不会替队友操作');
        expect(hauntTriggerSteps.watchTeammateHauntTrigger).toContain('队友 1 继续探索');
        expect(hauntTriggerSteps.watchTeammateHauntTrigger).toContain('获得面具');
        expect(hauntTriggerSteps.watchTeammateHauntTrigger).toContain('3 颗作祟骰');
        expect(hauntTriggerSteps.teammateConfirmHauntTrigger).toContain('队友 1');
        expect(hauntTriggerSteps.teammateConfirmHauntTrigger).toContain('3 颗作祟骰');
        expect(hauntTriggerSteps.teammateConfirmHauntTrigger).toContain('触发者看清公开结果');
        expect(hauntTriggerSteps.heroReaderOpened).toContain('队友 1 是揭秘者并成为叛徒');
        expect(hauntTriggerSteps.heroReaderOpened).toContain('你仍是英雄');
        expect(hauntTriggerSteps.heroReaderOpened).toContain('英雄开场过场');
        expect(hauntTriggerSteps.heroReaderOpened).toContain('不是剧本书目标页');
        expect(hauntTriggerSteps.heroReaderOpened).toContain('一次性开场');
        expect(hauntTriggerSteps.heroReaderOpened).not.toContain('再合上档案');
        expect(hauntTriggerSteps.heroReaderTurnPage).toContain('开场过场读完后');
        expect(hauntTriggerSteps.heroReaderTurnPage).toContain('底部“进入剧本书”');
        expect(hauntTriggerSteps.heroReaderTurnPage).toContain('英雄剧本书目标页');
        expect(hauntTriggerSteps.heroReaderGoal).toContain('英雄剧本书目标页写明');
        expect(hauntTriggerSteps.heroReaderGoal).toContain('石棺房、研究室或图书馆');
        expect(hauntTriggerSteps.heroReaderGoal).toContain('你当前就在图书馆旁边');
        expect(hauntTriggerSteps.heroReaderGoal).toContain('先移动进图书馆');
        expect(hauntTriggerSteps.heroReaderClose).toContain('点关闭回到牌桌');
        expect(hauntTriggerSteps.heroReaderOpened).not.toContain('叛徒开场过场');
        expect(hauntTriggerSteps.heroReaderOpened).not.toContain('先读叛徒');
        expect(hauntTriggerSteps.waitForHeroTurnAfterHaunt).toContain('作祟后轮序继续');
        expect(hauntTriggerSteps.waitForHeroTurnAfterHaunt).toContain('队友 2 按正式流程结束回合');
        expect(hauntTriggerSteps.waitForHeroTurnAfterHaunt).toContain('你仍在上层平台');
        expect(hauntTriggerSteps.waitForHeroTurnAfterHaunt).toContain('图书馆可用于');
        expect(hauntTriggerSteps.openLibraryMoveAfterGoal).toContain('已经读到英雄目标');
        expect(hauntTriggerSteps.openLibraryMoveAfterGoal).toContain('先点“移动”');
        expect(hauntTriggerSteps.moveToLibraryAfterGoal).toContain('相邻移动目标');
        expect(hauntTriggerSteps.moveToLibraryAfterGoal).toContain('点击图书馆移动进去');
        expect(hauntTriggerSteps.moveToLibraryAfterGoal).toContain('进去后才能执行');
        expect(hauntTriggerSteps.heroStudyNameRoll).toContain('石棺房、研究室或图书馆');
        expect(hauntTriggerSteps.heroStudyNameRoll).toContain('寻找木乃伊真名');
        expect(hauntTriggerSteps.heroStudyNameRoll).toContain('6+ 知识检定');
        expect(hauntTriggerSteps.heroStudyNameRoll).toContain('第 1 枚知识标记');
        expect(hauntTriggerSteps.heroStudyNameResult).toContain('检定成功');
        expect(hauntTriggerSteps.heroStudyNameResult).toContain('第 1 枚知识标记');
        expect(hauntTriggerSteps.heroStudyNameResult).toContain('点“确认”回到牌桌');
        expect(hauntTriggerSteps.heroStudyNameCloseout).toContain('结果已经落到英雄目标进度上');
        expect(hauntTriggerSteps.heroStudyNameCloseout).toContain('每名英雄每回合只能尝试一个');
        expect(hauntTriggerSteps.heroStudyNameCloseout).toContain('结束回合');
        expect(hauntTriggerSteps.heroStudyNameCloseout).toContain('后续合法持书回合');
        expect([
            [hauntTriggerSteps.setupNaturalHauntFlow, hauntTriggerSteps.handOffToTeammateOne],
            [hauntTriggerSteps.handOffToTeammateOne, hauntTriggerSteps.watchTeammateOmenTurns],
            [hauntTriggerSteps.watchTeammateOmenTurns, hauntTriggerSteps.teammateOmenResults],
            [hauntTriggerSteps.teammateOmenResults, hauntTriggerSteps.watchTeammateTwoOmenTurn],
            [hauntTriggerSteps.watchTeammateTwoOmenTurn, hauntTriggerSteps.teammateTwoOmenResults],
            [hauntTriggerSteps.teammateTwoOmenResults, hauntTriggerSteps.handOffToTeammateSecondCycle],
            [hauntTriggerSteps.handOffToTeammateSecondCycle, hauntTriggerSteps.watchTeammateHauntTrigger],
            [hauntTriggerSteps.watchTeammateHauntTrigger, hauntTriggerSteps.teammateConfirmHauntTrigger],
            [hauntTriggerSteps.teammateConfirmHauntTrigger, hauntTriggerSteps.heroReaderOpened],
            [hauntTriggerSteps.heroReaderOpened, hauntTriggerSteps.heroReaderTurnPage],
            [hauntTriggerSteps.heroReaderTurnPage, hauntTriggerSteps.heroReaderGoal],
            [hauntTriggerSteps.heroReaderGoal, hauntTriggerSteps.heroReaderClose],
            [hauntTriggerSteps.heroReaderClose, hauntTriggerSteps.waitForHeroTurnAfterHaunt],
            [hauntTriggerSteps.waitForHeroTurnAfterHaunt, hauntTriggerSteps.openLibraryMoveAfterGoal],
            [hauntTriggerSteps.openLibraryMoveAfterGoal, hauntTriggerSteps.moveToLibraryAfterGoal],
            [hauntTriggerSteps.moveToLibraryAfterGoal, hauntTriggerSteps.heroStudyNameRoll],
            [hauntTriggerSteps.heroStudyNameRoll, hauntTriggerSteps.heroStudyNameResult],
            [hauntTriggerSteps.heroStudyNameResult, hauntTriggerSteps.heroStudyNameCloseout],
        ].flatMap(([previous, current]) => {
            const previousSentences = previous.split(/[。；]/).map((part) => part.trim()).filter((part) => part.length >= 8);
            return previousSentences.filter((sentence) => current.includes(sentence));
        })).toEqual([]);
        expect(zhCNLocale.tutorial.tradeAndAgreement.title).toContain('交易');
        expect(zhCNLocale.tutorial.tradeAndAgreement.steps.setupTrade).toContain('同一房间');
        expect(zhCNLocale.tutorial.tradeAndAgreement.steps.setupTrade).not.toContain('同一板块');
        expect(zhCNLocale.tutorial.tradeAndAgreement.steps.setupTrade).toContain('双方都要同意');
        expect(zhCNLocale.tutorial.tradeAndAgreement.steps.startTrade).toContain('点“交易”');
        expect(zhCNLocale.tutorial.tradeAndAgreement.steps.startTrade).toContain('交易选择态');
        expect(zhCNLocale.tutorial.tradeAndAgreement.steps.chooseTradeItem).toContain('急救包');
        expect(zhCNLocale.tutorial.tradeAndAgreement.steps.chooseTradeItem).toContain('书本和兔脚留在你这里');
        expect(zhCNLocale.tutorial.tradeAndAgreement.steps.chooseTradeTarget).toContain('同房间队友');
        expect(zhCNLocale.tutorial.tradeAndAgreement.steps.chooseTradeReturn).toContain('地图');
        expect(zhCNLocale.tutorial.tradeAndAgreement.steps.sendTradeRequest).toContain('提交方案');
        expect(zhCNLocale.tutorial.tradeAndAgreement.steps.sendTradeRequest).toContain('交易方案');
        expect(zhCNLocale.tutorial.tradeAndAgreement.steps.requestWaiting).toContain('接收方同意前');
        expect(zhCNLocale.tutorial.tradeAndAgreement.steps.requestWaiting).toContain('不用切视角');
        expect(zhCNLocale.tutorial.tradeAndAgreement.steps.tradeReview).toContain('队友已同意交易');
        expect(zhCNLocale.tutorial.tradeAndAgreement.steps.tradeReview).toContain('急救包进入队友持有区');
        expect(zhCNLocale.tutorial.tradeAndAgreement.steps.tradeReview).toContain('书本和兔脚仍留给后续事件使用');
        expect(zhCNLocale.tutorial.hauntActions.title).toContain('英雄目标与驱逐');
        expect(zhCNLocale.tutorial.hauntActions.steps.setupReadyToExorcise).toContain('英雄胜利条件');
        expect(zhCNLocale.tutorial.hauntActions.steps.setupReadyToExorcise).toContain('让木乃伊与女孩成婚');
        expect(zhCNLocale.tutorial.hauntActions.steps.helpEntry).toContain('打开剧本书');
        expect(zhCNLocale.tutorial.hauntActions.steps.helpEntry).toContain('目标与胜利条件');
        expect(zhCNLocale.tutorial.hauntActions.steps.hauntActions).toContain('6+ 知识考验');
        expect(zhCNLocale.tutorial.hauntActions.steps.hauntActions).toContain('石棺房、研究室或图书馆');
        expect(zhCNLocale.tutorial.hauntActions.steps.hauntActions).toContain('找到真名');
        expect(zhCNLocale.tutorial.hauntActions.steps.hauntActions).toContain('驱逐法术');
        expect(zhCNLocale.tutorial.hauntActions.steps.hauntActions).toContain('每名英雄每回合只能尝试一个步骤');
        expect(zhCNLocale.tutorial.hauntActions.steps.banishMummy).toContain('用神志攻击木乃伊');
        expect(zhCNLocale.tutorial.hauntActions.steps.endgameReview).toContain('英雄胜利');
        expect(zhCNLocale.tutorial.hauntActions.steps.endgameReview).toContain('细砂');
        expect(zhCNLocale.tutorial.heroAttackPath.steps.heroAttackObjective).toContain('打开英雄剧本');
        expect(zhCNLocale.tutorial.heroAttackPath.steps.attackTraitor).toContain('攻击叛徒');
        expect(zhCNLocale.tutorial.heroAttackPath.steps.heroAttackReview).toContain('按差值结算伤害');
        expect(zhCNLocale.tutorial.jackSpiritPath.title).toContain('杰克之灵');
        expect(zhCNLocale.tutorial.jackSpiritPath.steps.setupJackSpirit).toContain('作为怪物继续行动');
        expect(zhCNLocale.tutorial.jackSpiritPath.steps.jackSpiritObjective).toContain('叛徒尸体所在房间');
        expect(zhCNLocale.tutorial.jackSpiritPath.steps.jackSpiritAttack).toContain('同房间的英雄');
        expect(zhCNLocale.tutorial.jackSpiritPath.steps.jackSpiritReview).toContain('按差值结算伤害');
        expect(zhCNLocale.tutorial.traitorPath.title).toContain('叛徒视角');
        expect(zhCNLocale.tutorial.traitorPath.description).toContain('木乃伊移动');
        expect(zhCNLocale.tutorial.traitorPath.description).toContain('胜利前局面');
        expect(zhCNLocale.tutorial.traitorPath.victoryTitle).toContain('胜利链');
        expect(zhCNLocale.tutorial.traitorPath.victoryDescription).toContain('合法起点');
        expect(zhCNLocale.tutorial.traitorPath.steps.setupTraitorTurn).toContain('合法起点');
        expect(zhCNLocale.tutorial.traitorPath.steps.traitorObjective).toContain('打开叛徒剧本');
        expect(zhCNLocale.tutorial.traitorPath.steps.pickUpGirl).toContain('拾起女孩');
        expect(zhCNLocale.tutorial.traitorPath.steps.giveGirlToMummy).toContain('交出女孩');
        expect(zhCNLocale.tutorial.traitorPath.steps.giveOmenToMummy).toContain('交出圣符');
        expect(zhCNLocale.tutorial.traitorPath.steps.traitorFinish).toContain('叛徒胜利');
        expect(zhCNLocale.tutorial.mummyMonsterActions.title).toContain('木乃伊怪物行动');
        expect(zhCNLocale.tutorial.mummyMonsterActions.steps.setupMonsterMove).toContain('石棺房间');
        expect(zhCNLocale.tutorial.mummyMonsterActions.steps.monsterTurnStart).toContain('木乃伊开回合');
        expect(zhCNLocale.tutorial.mummyMonsterActions.steps.monsterRoll).toContain('木乃伊移动骰');
        expect(zhCNLocale.tutorial.mummyMonsterActions.steps.monsterRollReview).toContain('移动骰结果');
        expect(zhCNLocale.tutorial.mummyMonsterActions.steps.monsterRollReview).not.toContain('0 点');
        expect(zhCNLocale.tutorial.mummyMonsterActions.steps.monsterMoveTarget).toContain('结果为 0 或 1');
        expect(zhCNLocale.tutorial.mummyMonsterActions.steps.monsterMoveTarget).toContain('已发现房间');
        expect(zhCNLocale.tutorial.mummyMonsterActions.steps.monsterMoveResult).toContain('会携带女孩');
        expect(zhCNLocale.tutorial.mummyMonsterActions.steps.monsterMoveResult).not.toContain('拾起女孩');
        expect(zhCNLocale.tutorial.mummyMonsterActions.steps.setupAttack).toContain('同房攻击');
        expect(zhCNLocale.tutorial.mummyMonsterActions.steps.setupAttack).toContain('木乃伊攻击英雄');
        expect(zhCNLocale.tutorial.mummyMonsterActions.steps.attackForced).toContain('必须先攻击英雄');
        expect(zhCNLocale.tutorial.mummyMonsterActions.steps.attackTarget).toContain('叛徒和已死亡探险者不是攻击目标');
        expect(zhCNLocale.tutorial.mummyMonsterActions.steps.attackRollReview).toContain('攻击投骰比较');
        expect(zhCNLocale.tutorial.mummyMonsterActions.steps.attackRollReview).toContain('后续选择');
        expect(zhCNLocale.tutorial.mummyMonsterActions.steps.attackRollReview).not.toContain('选择造成伤害或偷窃');
        expect(zhCNLocale.tutorial.mummyMonsterActions.steps.attackReward).toContain('现在才是木乃伊奖励选择');
        expect(zhCNLocale.tutorial.mummyMonsterActions.steps.attackReward).toContain('偷走地图');
        expect(zhCNLocale.tutorial.mummyMonsterActions.steps.stealResult).toContain('被偷的英雄不扣减能力');
        const playerTutorialText = collectPlayerText(zhCNLocale.tutorial).join('\n');
        const englishTutorialText = collectPlayerText(enLocale.tutorial).join('\n');
        expect(playerTutorialText).not.toMatch(/真实链路|运行态|不是动画|不是说明图层|不是教程按钮|E2E|正式验证|收口|收尾|终局页|房间焦点入口|对攻/);
        expect(playerTutorialText).not.toMatch(/不常驻|写满公式|业务公式|悬浮提示才|验收|测试|AI|HUD|为什么和|不是凭空出现|同一画面|同屏|同一次发现|结果面板|日志摘要|奖励条|行动槽|终幕报告|背景说明|为了演示|演示|面板会|面板|摘要|队列|待放置状态|主视区|动作区|结果区|横幅|提示条|底部动作|移动圆牌|读完骰盘|读完攻击骰盘|在这里|实现|运行态/);
        expect(englishTutorialText).not.toMatch(/same screen|same frame|result panel|summary|queue|for this .*demo|demo|placement preview|bottom actions|movement medallion|dice table|attack dice, bonus, and result|screen|panel|summary|queue|banner|implementation|runtime|here\./i);
    });
});
