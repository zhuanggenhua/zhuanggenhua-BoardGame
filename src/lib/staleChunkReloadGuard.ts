import { STALE_LAZY_MODULE_MARKER } from './lazyModuleExport';

export const STALE_CHUNK_RELOAD_KEY = 'bg_stale_chunk_reload_guard';

export const isStaleChunkError = (value: unknown): boolean => {
    const message = value instanceof Error
        ? `${value.name}: ${value.message}`
        : String(value ?? '');
    const stack = value instanceof Error ? value.stack ?? '' : '';

    const normalized = `${message}\n${stack}`.toLowerCase();
    return normalized.includes(STALE_LAZY_MODULE_MARKER)
        || normalized.includes('failed to fetch dynamically imported module')
        || normalized.includes('error loading dynamically imported module')
        || normalized.includes('importing a module script failed')
        || normalized.includes('expected a javascript module script')
        || normalized.includes('is not a valid javascript mime type')
        || (normalized.includes("typeerror: cannot read properties of undefined (reading 'default')")
            && normalized.includes('/assets/vendor-react'))
        || normalized.includes('chunkloaderror')
        || normalized.includes('loading chunk');
};

type ReloadOnceDeps = {
    currentLocation: string;
    getStoredLocation: () => string | null;
    setStoredLocation: (value: string) => void;
    reload: () => void;
    shouldReload?: () => boolean;
    warn?: (message: string, payload: { reason: string }) => void;
};

export const reloadForStaleChunkOnceWithDeps = (reason: string, deps: ReloadOnceDeps): boolean => {
    if (deps.shouldReload && !deps.shouldReload()) {
        deps.warn?.('[bootstrap] stale chunk detected after bootstrap window, skip auto reload', { reason });
        return false;
    }

    try {
        const previous = deps.getStoredLocation();
        const guardValue = `${reason}\n${deps.currentLocation}`;
        if (previous === guardValue) {
            return false;
        }
        deps.setStoredLocation(guardValue);
    } catch {
        // sessionStorage 不可用时降级为直接刷新一次
    }

    deps.warn?.('[bootstrap] stale chunk detected, reloading page', { reason });
    deps.reload();
    return true;
};

export const reloadForStaleChunkOnce = (
    reason: string,
    win: Window = window,
    options?: { shouldReload?: () => boolean },
): boolean => reloadForStaleChunkOnceWithDeps(reason, {
    currentLocation: `${win.location.pathname}${win.location.search}${win.location.hash}`,
    getStoredLocation: () => win.sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY),
    setStoredLocation: (value: string) => win.sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, value),
    reload: () => win.location.reload(),
    shouldReload: options?.shouldReload,
    warn: (message, payload) => console.warn(message, payload),
});
