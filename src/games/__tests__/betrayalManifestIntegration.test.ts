/* @vitest-environment happy-dom */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getGameById } from '../../config/games.config';
import { extractGameIdFromPlayPath } from '../../shared/mobileSupport';
import { GAME_MANIFEST_BY_ID } from '../manifest';
import { hasGameImplementation, loadGameImplementation, resolveGameTutorialManifest } from '../registry';

describe('betrayal manifest integration', () => {
    it('betrayal 会以本地预演入口暴露，并声明手机横屏地图壳适配', async () => {
        const game = getGameById('betrayal');
        expect(game).toBeDefined();
        expect(game?.enabled).toBe(true);
        expect(game?.allowLocalMode).toBe(true);
        expect(game?.playerOptions).toEqual([3, 4, 5, 6]);
        expect(game?.mobileProfile).toBe('landscape-adapted');
        expect(game?.preferredOrientation).toBe('landscape');
        expect(game?.mobileLayoutPreset).toBe('map-shell');
        expect(game?.pageShell?.keepBoardMountedOnPlayerViewChange).toBe(true);
        expect(game?.pageShell?.tutorialCatalogTheme?.className).toBe('tutorial-catalog-stage--betrayal');
        expect(game?.shellTargets).toEqual(
            expect.arrayContaining(['pwa', 'app-webview', 'mini-program-webview']),
        );

        expect(GAME_MANIFEST_BY_ID.betrayal).toBeDefined();
        expect(GAME_MANIFEST_BY_ID.betrayal?.allowLocalMode).toBe(true);

        expect(hasGameImplementation('betrayal')).toBe(true);
        const implementation = await loadGameImplementation('betrayal');
        expect(implementation?.engineConfig.gameId).toBe('betrayal');
        expect(typeof implementation?.board).toBe('function');
    });

    it('betrayal 教程路由在 Android 方向表里保持横屏，不要求游戏 Board 单独接方向锁', () => {
        const androidOrientationMap = JSON.parse(
            readFileSync(
                'android/app/src/main/assets/game-orientation-map.json',
                'utf8',
            ),
        ) as Record<string, string>;

        expect(extractGameIdFromPlayPath('/play/betrayal/tutorial/basic-setup-and-turn')).toBe('betrayal');
        expect(androidOrientationMap.betrayal).toBe('landscape');
    });

    it('betrayal 教程模块会被 manifest 生成链识别成 TutorialCollection', async () => {
        const implementation = await loadGameImplementation('betrayal', { includeTutorial: true });
        expect(implementation?.tutorialCatalog?.defaultTutorialId).toBe('basic-setup-and-turn');
        expect(Object.keys(implementation?.tutorialCatalog?.tutorials ?? {})).toEqual([
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
        expect(Object.entries(implementation?.tutorialCatalog?.tutorials ?? {})
            .filter(([, entry]) => entry.hiddenFromCatalog !== true)
            .map(([id]) => id)).toEqual([
            'basic-setup-and-turn',
            'traitor-path',
        ]);
        expect(resolveGameTutorialManifest('betrayal')).toEqual(
            implementation?.tutorialCatalog?.tutorials['basic-setup-and-turn']?.manifest ?? null,
        );
        expect(resolveGameTutorialManifest('betrayal', 'omen-confirmation-and-haunt-risk')?.id)
            .toBe('omen-confirmation-and-haunt-risk');
        expect(resolveGameTutorialManifest('betrayal', 'haunt-natural-trigger-flow')?.id)
            .toBe('haunt-natural-trigger-flow');
        expect(resolveGameTutorialManifest('betrayal', 'trade-and-agreement')?.id).toBe('trade-and-agreement');
        expect(resolveGameTutorialManifest('betrayal', 'move-explore-use')?.id).toBe('basic-setup-and-turn');
        expect(resolveGameTutorialManifest('betrayal', 'crimson-jack-objective')?.id).toBe('haunt-actions-and-finish');
        expect(resolveGameTutorialManifest('betrayal', 'haunt-actions-and-finish')?.id).toBe('haunt-actions-and-finish');
        expect(resolveGameTutorialManifest('betrayal', 'jack-spirit-path')?.id).toBe('jack-spirit-path');
        expect(resolveGameTutorialManifest('betrayal', 'mummy-traitor-victory-chain')?.id)
            .toBe('mummy-traitor-victory-chain');
        expect(resolveGameTutorialManifest('betrayal', 'mummy-monster-actions')?.id).toBe('mummy-monster-actions');
    });
});
