import { describe, expect, it, vi } from 'vitest';
import {
    isStaleChunkError,
    reloadForStaleChunkOnceWithDeps,
} from '../staleChunkReloadGuard';
import { requireLazyModuleExport } from '../lazyModuleExport';

describe('staleChunkReloadGuard', () => {
    it('detects known stale chunk error signatures', () => {
        expect(isStaleChunkError(new Error('Failed to fetch dynamically imported module'))).toBe(true);
        expect(isStaleChunkError(new Error('error loading dynamically imported module: https://easyboardgame.top/assets/cursor-BonIRdwH.js'))).toBe(true);
        expect(isStaleChunkError('ChunkLoadError: Loading chunk 42 failed')).toBe(true);
        expect(isStaleChunkError('Importing a module script failed')).toBe(true);
        expect(isStaleChunkError(new Error('Expected a JavaScript module script but the server responded with text/html'))).toBe(true);
        expect(isStaleChunkError(new Error("'text/html' is not a valid JavaScript MIME type."))).toBe(true);
        const reactLazyDefaultError = new TypeError("Cannot read properties of undefined (reading 'default')");
        reactLazyDefaultError.stack = "TypeError: Cannot read properties of undefined (reading 'default')\n    at w (https://easyboardgame.top/assets/vendor-react-BClYuNVW.js:1:4646)";
        expect(isStaleChunkError(reactLazyDefaultError)).toBe(true);
        expect(() => requireLazyModuleExport<{ default: unknown }, 'default'>(undefined, 'default', './splendor/Board')).toThrow('[stale-lazy-module]');
        try {
            requireLazyModuleExport<{ default: unknown }, 'default'>(undefined, 'default', './splendor/Board');
        } catch (error) {
            expect(isStaleChunkError(error)).toBe(true);
        }
        expect(isStaleChunkError(new Error('Network request failed'))).toBe(false);
        expect(isStaleChunkError(new TypeError("Cannot read properties of undefined (reading 'default')"))).toBe(false);
    });

    it('reloads once per reason and location and records the guard key before reload', () => {
        let stored: string | null = null;
        const reload = vi.fn();
        const warn = vi.fn();

        const first = reloadForStaleChunkOnceWithDeps('vite:preloadError', {
            currentLocation: '/ranked?tab=1#deck',
            getStoredLocation: () => stored,
            setStoredLocation: (value) => {
                stored = value;
            },
            reload,
            warn,
        });

        const second = reloadForStaleChunkOnceWithDeps('vite:preloadError', {
            currentLocation: '/ranked?tab=1#deck',
            getStoredLocation: () => stored,
            setStoredLocation: (value) => {
                stored = value;
            },
            reload,
            warn,
        });

        expect(first).toBe(true);
        expect(second).toBe(false);
        expect(stored).toBe('vite:preloadError\n/ranked?tab=1#deck');
        expect(reload).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('allows a second reload on the same route for a different stale chunk reason', () => {
        let stored: string | null = null;
        const reload = vi.fn();
        const warn = vi.fn();
        const currentLocation = '/play/dicethrone/match/abc?playerID=0';

        const first = reloadForStaleChunkOnceWithDeps('react-error-boundary', {
            currentLocation,
            getStoredLocation: () => stored,
            setStoredLocation: (value) => {
                stored = value;
            },
            reload,
            warn,
        });

        const second = reloadForStaleChunkOnceWithDeps('game-runtime-load-failed:dicethrone', {
            currentLocation,
            getStoredLocation: () => stored,
            setStoredLocation: (value) => {
                stored = value;
            },
            reload,
            warn,
        });

        const third = reloadForStaleChunkOnceWithDeps('game-runtime-load-failed:dicethrone', {
            currentLocation,
            getStoredLocation: () => stored,
            setStoredLocation: (value) => {
                stored = value;
            },
            reload,
            warn,
        });

        expect(first).toBe(true);
        expect(second).toBe(true);
        expect(third).toBe(false);
        expect(reload).toHaveBeenCalledTimes(2);
        expect(warn).toHaveBeenCalledTimes(2);
    });

    it('still reloads when storage is unavailable', () => {
        const reload = vi.fn();
        const warn = vi.fn();

        const reloaded = reloadForStaleChunkOnceWithDeps('unhandledrejection', {
            currentLocation: '/room/abc',
            getStoredLocation: () => {
                throw new Error('storage blocked');
            },
            setStoredLocation: () => {
                throw new Error('storage blocked');
            },
            reload,
            warn,
        });

        expect(reloaded).toBe(true);
        expect(reload).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('skips auto reload after bootstrap window closes', () => {
        const reload = vi.fn();
        const warn = vi.fn();

        const reloaded = reloadForStaleChunkOnceWithDeps('vite:preloadError', {
            currentLocation: '/play/smashup/match/abc?playerID=0',
            getStoredLocation: () => null,
            setStoredLocation: vi.fn(),
            reload,
            warn,
            shouldReload: () => false,
        });

        expect(reloaded).toBe(false);
        expect(reload).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledTimes(1);
    });
});
