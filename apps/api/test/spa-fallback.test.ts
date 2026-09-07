import { describe, expect, it } from 'vitest';
import {
    LONG_CACHE_IMMUTABLE_HEADER,
    LONG_CACHE_MAX_AGE,
    NO_CACHE_HEADER,
    SHORT_CACHE_HEADER,
    getPublicAssetCacheControl,
    isNoCacheSpaEntryPath,
    isNoCacheStaticFilePath,
    shouldProxyGameServerRequest,
    shouldServeSpaFallback,
    shouldUseImmutablePublicAssetCache,
} from '../src/spa-fallback';

describe('SPA fallback guards', () => {
    it('should keep /assets requests out of SPA fallback', () => {
        expect(shouldServeSpaFallback('/assets')).toBe(false);
        expect(shouldServeSpaFallback('/assets/manifest-abc123.js')).toBe(false);
        expect(shouldServeSpaFallback('/assets/images/card.webp')).toBe(false);
    });

    it('should keep public static file directories out of SPA fallback', () => {
        expect(shouldServeSpaFallback('/logos/weixin.jpg')).toBe(false);
        expect(shouldServeSpaFallback('/logos/logo_1_grid.svg')).toBe(false);
        expect(shouldServeSpaFallback('/fonts/inter-400-latin.woff2')).toBe(false);
        expect(shouldServeSpaFallback('/game-data/qidahen.map-regions.json')).toBe(false);
        expect(shouldServeSpaFallback('/locales/zh-CN/game.json')).toBe(false);
        expect(shouldServeSpaFallback('/manifest.webmanifest')).toBe(false);
    });

    it('should keep API-style routes out of SPA fallback', () => {
        expect(shouldServeSpaFallback('/auth/login')).toBe(false);
        expect(shouldServeSpaFallback('/games/list')).toBe(false);
        expect(shouldServeSpaFallback('/feedback')).toBe(false);
        expect(shouldServeSpaFallback('/admin-api')).toBe(false);
        expect(shouldServeSpaFallback('/admin-api/stats')).toBe(false);
        expect(shouldServeSpaFallback('/admin-api/users')).toBe(false);
    });

    it('should still allow normal SPA routes to fall back to index.html', () => {
        expect(shouldServeSpaFallback('/')).toBe(true);
        expect(shouldServeSpaFallback('/ranked')).toBe(true);
        expect(shouldServeSpaFallback('/room/abc123')).toBe(true);
    });

    it('should serve every admin page route as no-cache SPA entries', () => {
        expect(isNoCacheSpaEntryPath('/admin')).toBe(true);
        expect(isNoCacheSpaEntryPath('/admin/')).toBe(true);
        expect(isNoCacheSpaEntryPath('/admin/users')).toBe(true);
        expect(isNoCacheSpaEntryPath('/admin/users/abc123')).toBe(true);
        expect(isNoCacheSpaEntryPath('/admin/matches')).toBe(true);
        expect(shouldServeSpaFallback('/admin')).toBe(true);
        expect(shouldServeSpaFallback('/admin/')).toBe(true);
        expect(shouldServeSpaFallback('/admin/users')).toBe(true);
        expect(shouldServeSpaFallback('/admin/users/abc123')).toBe(true);
        expect(shouldServeSpaFallback('/admin/matches')).toBe(true);
        expect(isNoCacheSpaEntryPath('/admin/changelogs')).toBe(true);
        expect(isNoCacheSpaEntryPath('/admin/changelogs/')).toBe(true);
        expect(isNoCacheSpaEntryPath('/admin/release-center')).toBe(true);
        expect(isNoCacheSpaEntryPath('/admin/mobile-release/')).toBe(true);
        expect(shouldServeSpaFallback('/admin/changelogs')).toBe(true);
        expect(shouldServeSpaFallback('/admin/changelogs/')).toBe(true);
        expect(shouldServeSpaFallback('/admin/release-center')).toBe(true);
        expect(shouldServeSpaFallback('/admin/mobile-release/')).toBe(true);
    });

    it('should serve config review pages as client routes instead of proxying them to the game server', () => {
        expect(isNoCacheSpaEntryPath('/games/dicethrone/config')).toBe(true);
        expect(isNoCacheSpaEntryPath('/games/dicethrone/config/cards')).toBe(true);
        expect(shouldServeSpaFallback('/games/dicethrone/config')).toBe(true);
        expect(shouldProxyGameServerRequest('/games/dicethrone/config')).toBe(false);
        expect(shouldProxyGameServerRequest('/games/dicethrone/config/cards')).toBe(false);
        expect(shouldProxyGameServerRequest('/games/list')).toBe(true);
        expect(shouldProxyGameServerRequest('/games/dicethrone/match-1')).toBe(true);
    });

    it('should keep html and editable layout files on no-cache policy', () => {
        expect(isNoCacheStaticFilePath('D:/repo/dist/index.html')).toBe(true);
        expect(isNoCacheStaticFilePath('D:\\repo\\dist\\game-data\\summonerwars.layout.json')).toBe(true);
        expect(NO_CACHE_HEADER).toBe('no-cache, no-store, must-revalidate');
    });

    it('should allow hashed public static directories to use long cache', () => {
        expect(isNoCacheStaticFilePath('D:/repo/dist/fonts/inter-400-latin.woff2')).toBe(false);
        expect(isNoCacheStaticFilePath('D:/repo/dist/logos/logo_1_grid.svg')).toBe(false);
        expect(isNoCacheStaticFilePath('D:/repo/dist/game-data/dicethrone/monk/dice-sprite.png')).toBe(false);
        expect(LONG_CACHE_MAX_AGE).toBe('1y');
    });

    it('should keep versioned public asset media on immutable cache', () => {
        expect(shouldUseImmutablePublicAssetCache('/assets/i18n/zh-CN/smashup/cards/compressed/cards1.webp?v=hash1234')).toBe(true);
        expect(shouldUseImmutablePublicAssetCache('/assets/common/audio/compressed/bgm.ogg?v=hash5678')).toBe(true);
        expect(getPublicAssetCacheControl('/assets/i18n/zh-CN/smashup/cards/compressed/cards1.webp?v=hash1234')).toBe(LONG_CACHE_IMMUTABLE_HEADER);
    });

    it('should keep non-versioned or non-media public assets on short cache', () => {
        expect(shouldUseImmutablePublicAssetCache('/assets/i18n/zh-CN/smashup/cards/compressed/cards1.webp')).toBe(false);
        expect(shouldUseImmutablePublicAssetCache('/assets/atlas-configs/dicethrone/ability-cards-common.atlas.json?v=hash1234')).toBe(false);
        expect(getPublicAssetCacheControl('/assets/i18n/zh-CN/smashup/cards/compressed/cards1.webp')).toBe(SHORT_CACHE_HEADER);
        expect(getPublicAssetCacheControl('/assets/atlas-configs/dicethrone/ability-cards-common.atlas.json?v=hash1234')).toBe(SHORT_CACHE_HEADER);
    });
});
