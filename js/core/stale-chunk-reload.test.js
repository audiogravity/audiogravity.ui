/**
 * Tests for stale-chunk-reload — reloading when on-demand code is missing because the
 * box now serves another version.
 *
 * Covers:
 * 1. another start bundle on the box: the page reloads
 * 2. the same one (a network blip, a box restarting): no reload
 * 3. the box not answering, or answering an error: no reload
 * 4. at most once a minute, a clock set back since included, and not at all without
 *    session storage
 * 5. the question goes to the box, past any cache
 * 6. the start bundle read from a page's HTML as the page itself is read
 * 7. watchStaleChunks: one question at a time, and the error left to go on
 */
import { describe, it, expect, vi } from 'vitest';
import {
    reloadIfStale, startBundle, watchStaleChunks, RELOAD_WINDOW_MS, VERSION_CHECK_PARAM,
} from './stale-chunk-reload.js';

const PAGE_HTML = (main) => `<html><head><script src="/ag-config.js"></script>`
    + `<script type="module" crossorigin src="/assets/${main}.js"></script></head></html>`;

function memoryStorage() {
    const values = new Map();
    return { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
}

/** The page as it was loaded, with its own start bundle. */
function loadedPage(main = 'main-OLD') {
    const doc = document.implementation.createHTMLDocument();
    doc.documentElement.innerHTML = PAGE_HTML(main);
    return doc;
}

/** What the box serves now. */
function box(html, ok = true) {
    return vi.fn(async () => ({ ok, text: async () => html }));
}

describe('reloadIfStale', () => {
    it('reloads when the box now serves another version', async () => {
        const location = { reload: vi.fn() };

        const reloaded = await reloadIfStale({ fetchFn: box(PAGE_HTML('main-NEW')), page: loadedPage(), location, storage: memoryStorage(), now: 1e6 });

        expect(reloaded).toBe(true);
        expect(location.reload).toHaveBeenCalledOnce();
    });

    it('asks the box itself, with a query no cached entry carries', async () => {
        // A service worker from an older version answers a plain /index.html from its
        // cache when the box is down — the page it stored, of another version: a reload
        // onto a box that is restarting.
        const fetchFn = box(PAGE_HTML('main-OLD'));

        await reloadIfStale({ fetchFn, page: loadedPage(), location: { reload: vi.fn() }, storage: memoryStorage(), now: 5e6 });

        expect(fetchFn).toHaveBeenCalledWith(`/index.html?${VERSION_CHECK_PARAM}=5000000`, { cache: 'no-store' });
    });

    it('does not reload when the version in place is this one', async () => {
        // A network blip, or the box restarting its server: a reload could land on an
        // error page, and would lose what was typed elsewhere.
        const location = { reload: vi.fn() };

        expect(await reloadIfStale({ fetchFn: box(PAGE_HTML('main-OLD')), page: loadedPage(), location, storage: memoryStorage(), now: 1e6 })).toBe(false);
        expect(location.reload).not.toHaveBeenCalled();
    });

    it('does not reload when the box does not answer, or answers an error', async () => {
        const location = { reload: vi.fn() };
        const down = vi.fn(async () => { throw new TypeError('Failed to fetch'); });

        expect(await reloadIfStale({ fetchFn: down, page: loadedPage(), location, storage: memoryStorage(), now: 1e6 })).toBe(false);
        expect(await reloadIfStale({ fetchFn: box('', false), page: loadedPage(), location, storage: memoryStorage(), now: 1e6 })).toBe(false);
        expect(location.reload).not.toHaveBeenCalled();
    });

    it('reloads once a minute at most', async () => {
        const storage = memoryStorage();
        const location = { reload: vi.fn() };
        const env = { fetchFn: box(PAGE_HTML('main-NEW')), page: loadedPage(), location, storage };

        await reloadIfStale({ ...env, now: 1e6 });
        expect(await reloadIfStale({ ...env, now: 1e6 + RELOAD_WINDOW_MS - 1 })).toBe(false);
        expect(await reloadIfStale({ ...env, now: 1e6 + RELOAD_WINDOW_MS })).toBe(true);
        expect(location.reload).toHaveBeenCalledTimes(2);
    });

    it('takes a reload dated in the future for a long past one', async () => {
        // The tablet's clock set back half an hour after a reload — a resynchronisation
        // after its sleep: the window must not stay shut for that half hour.
        const storage = memoryStorage();
        const location = { reload: vi.fn() };
        const env = { fetchFn: box(PAGE_HTML('main-NEW')), page: loadedPage(), location, storage };
        await reloadIfStale({ ...env, now: 10e6 });

        expect(await reloadIfStale({ ...env, now: 10e6 - 30 * 60_000 })).toBe(true);
    });

    it('does not reload without session storage to guard against a loop', async () => {
        const storage = { getItem: () => { throw new Error('denied'); }, setItem: vi.fn() };
        const location = { reload: vi.fn() };

        expect(await reloadIfStale({ fetchFn: box(PAGE_HTML('main-NEW')), page: loadedPage(), location, storage, now: 1 })).toBe(false);
        expect(location.reload).not.toHaveBeenCalled();
    });
});

describe('startBundle', () => {
    it('reads the module script of a page, however its tag is written', () => {
        expect(startBundle(PAGE_HTML('main-ABC'))).toBe('/assets/main-ABC.js');
        expect(startBundle('<script src="/assets/main-Z.js" type="module"></script>')).toBe('/assets/main-Z.js');
        expect(startBundle("<script crossorigin type='module' src='/assets/main-Q.js'></script>")).toBe('/assets/main-Q.js');
    });

    it('finds none in a page without a module script', () => {
        expect(startBundle('<script src="/ag-config.js"></script>')).toBeNull();
        expect(startBundle('<p>no script</p>')).toBeNull();
    });
});

describe('watchStaleChunks', () => {
    /** A question to the box that stays pending until settled by hand. */
    function pendingCheck() {
        let settle;
        const check = vi.fn(() => new Promise((resolve) => { settle = resolve; }));
        return { check, settle: () => settle(false) };
    }

    it('asks the box once for errors that come together', async () => {
        const win = new EventTarget();
        const { check, settle } = pendingCheck();
        watchStaleChunks(win, check);

        win.dispatchEvent(new Event('vite:preloadError'));
        win.dispatchEvent(new Event('vite:preloadError'));
        expect(check).toHaveBeenCalledOnce();

        settle();
        await vi.waitFor(() => {
            win.dispatchEvent(new Event('vite:preloadError'));
            expect(check).toHaveBeenCalledTimes(2);
        });
    });

    it("leaves Vite's error to go on", () => {
        // Prevented, Vite would swallow it: the import would resolve to nothing, and the
        // screen's own handling of the failure would never run.
        const win = new EventTarget();
        watchStaleChunks(win, vi.fn(async () => false));
        const event = new Event('vite:preloadError', { cancelable: true });

        win.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(false);
    });
});
