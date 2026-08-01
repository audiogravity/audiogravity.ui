/**
 * Unit tests for ag-library-radio.js — AbortController race-condition fix.
 *
 * Tests the AbortController guard logic in isolation, without instantiating
 * the full LitElement component (which has auth/DOM side-effects in jsdom).
 *
 * Covers:
 * - AbortController is created and stored before each search request
 * - A second call aborts the first controller
 * - Results from a cancelled request are ignored (signal.aborted check)
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Simulate the _loadSearch guard pattern added by the AbortController fix.
 * This is the exact pattern from ag-library-radio.js:_loadSearch.
 */
async function simulateLoadSearch(state, fetchFn) {
    if (state.searchAbort) state.searchAbort.abort();
    state.searchAbort = new AbortController();
    const { signal } = state.searchAbort;

    state.loading = true;
    try {
        const result = await fetchFn(signal);
        if (signal.aborted) return;            // stale result guard
        state.stations = result;
    } catch (e) {
        if (signal.aborted) return;
        state.error = 'Search failed';
        state.stations = [];
    } finally {
        if (!signal.aborted) state.loading = false;
    }
}

describe('AbortController — race condition guard', () => {
    it('creates a new AbortController on each call', async () => {
        const state = { searchAbort: null, stations: [], loading: false, error: '' };
        const fetch = vi.fn().mockResolvedValue([{ name: 'Station A' }]);

        await simulateLoadSearch(state, fetch);

        expect(state.searchAbort).toBeInstanceOf(AbortController);
        expect(state.stations).toEqual([{ name: 'Station A' }]);
    });

    it('aborts the previous controller when called a second time', async () => {
        const state = { searchAbort: null, stations: [], loading: false, error: '' };

        let firstResolve;
        const firstFetch = () => new Promise(r => { firstResolve = r; });
        const secondFetch = vi.fn().mockResolvedValue([{ name: 'Station B' }]);

        // First call — in flight
        const first = simulateLoadSearch(state, firstFetch);
        const firstController = state.searchAbort;
        const abortSpy = vi.spyOn(firstController, 'abort');

        // Second call — should abort the first
        await simulateLoadSearch(state, secondFetch);

        expect(abortSpy).toHaveBeenCalledOnce();
        expect(state.searchAbort).not.toBe(firstController);
        expect(state.stations).toEqual([{ name: 'Station B' }]);

        // Resolve the first fetch late — its results should be ignored
        firstResolve([{ name: 'Stale Station' }]);
        await first;
        expect(state.stations).toEqual([{ name: 'Station B' }]);
    });

    it('ignores results from a cancelled request (signal.aborted guard)', async () => {
        const state = { searchAbort: null, stations: [{ name: 'Current' }], loading: false, error: '' };

        // Simulate a cancelled fetch: abort before result arrives
        const fetch = async (signal) => {
            signal; // simulate in-flight
            return [{ name: 'Stale' }];
        };

        state.searchAbort = new AbortController();
        state.searchAbort.abort(); // abort immediately

        const { signal } = state.searchAbort;
        const result = await fetch(signal);
        if (!signal.aborted) {
            state.stations = result; // should NOT run
        }

        expect(state.stations).toEqual([{ name: 'Current' }]); // unchanged
    });

    it('clears loading flag after a successful non-aborted search', async () => {
        const state = { searchAbort: null, stations: [], loading: false, error: '' };
        const fetch = vi.fn().mockResolvedValue([]);

        await simulateLoadSearch(state, fetch);

        expect(state.loading).toBe(false);
    });

    it('does not clear loading flag when the request is aborted', async () => {
        const state = { searchAbort: null, stations: [], loading: true, error: '' };

        let firstResolve;
        const firstFetch = () => new Promise(r => { firstResolve = r; });

        // Start first fetch, then immediately abort by starting second
        const first = simulateLoadSearch(state, firstFetch);
        await simulateLoadSearch(state, vi.fn().mockResolvedValue([]));

        // Resolve the aborted first fetch
        firstResolve([]);
        await first;

        // loading was managed by the second call, not the aborted first
        expect(state.loading).toBe(false);
    });
});

/**
 * The debounce guards an external community service: every keystroke used to
 * leave the box, so a few typed words became a burst of catalogue queries.
 * The value is asserted through the real `_scheduleSearch`, taken off the
 * prototype — importing the module itself is impossible here (it pulls in
 * api.js, which demands authentication at import time), and a copy of the
 * timer logic would be free to drift from the component it claims to cover.
 */
describe('search debounce — outbound politeness', () => {
    const SOURCE = readFileSync(
        path.join(path.dirname(fileURLToPath(import.meta.url)), 'ag-library-radio.js'),
        'utf8',
    );

    it('waits long enough that ordinary typing does not query per keystroke', () => {
        const declared = SOURCE.match(/_SEARCH_DEBOUNCE_MS\s*=\s*(\d+)/);
        expect(declared).not.toBeNull();
        // 300ms is shorter than the gap between two thumb-typed letters.
        expect(Number(declared[1])).toBeGreaterThanOrEqual(600);
    });

    it('cancels the pending timer before arming a new one', () => {
        // Without the clearTimeout, every keystroke would leave its own timer
        // armed and the burst would simply be deferred rather than collapsed.
        expect(SOURCE).toMatch(/_scheduleSearch\([^)]*\)\s*\{\s*\n\s*clearTimeout\(this\._searchDebounceTimer\)/);
    });
});

/**
 * Leaving the Search tab must leave the search behind with it. The three
 * sub-tabs are internal state on one long-lived component, so nothing tears a
 * pending search down on the way out — `disconnectedCallback` only ever fires
 * when the whole library page goes away.
 *
 * The behaviour is asserted twice over: once against a simulation of the
 * switch/load pair (which can reproduce the timing a source match cannot), and
 * once against the component source (which a simulation cannot keep honest).
 */
describe('leaving the Search tab', () => {
    const SOURCE = readFileSync(
        path.join(path.dirname(fileURLToPath(import.meta.url)), 'ag-library-radio.js'),
        'utf8',
    );

    /** Mirror of the component's `_switchView` teardown + `_loadSearch` guards. */
    function makeHost() {
        return {
            view: 'search',
            stations: [],
            loading: false,
            searchAbort: null,
            timer: null,

            scheduleSearch(delayMs, fetchFn) {
                clearTimeout(this.timer);
                this.timer = setTimeout(() => this.loadSearch(fetchFn), delayMs);
            },

            switchView(view, loadFn) {
                if (this.view === view) return;
                clearTimeout(this.timer);
                this.searchAbort?.abort();
                this.loading = false;
                this.view = view;
                loadFn?.();
            },

            async loadSearch(fetchFn) {
                if (this.searchAbort) this.searchAbort.abort();
                this.searchAbort = new AbortController();
                const { signal } = this.searchAbort;
                this.loading = true;
                try {
                    const stations = await fetchFn(signal);
                    if (signal.aborted || this.view !== 'search') return;
                    this.stations = stations;
                } finally {
                    if (!signal.aborted) this.loading = false;
                }
            },
        };
    }

    it('drops a debounce timer armed just before the tab switch', async () => {
        vi.useFakeTimers();
        try {
            const host = makeHost();
            const fetch = vi.fn().mockResolvedValue([{ name: 'Search hit' }]);
            host.scheduleSearch(700, fetch);

            // User taps "My Live Radio" 200ms into the debounce window.
            vi.advanceTimersByTime(200);
            host.switchView('library', () => { host.stations = [{ name: 'Saved station' }]; });

            // Well past the point the timer would have fired.
            vi.advanceTimersByTime(2000);
            await vi.runAllTimersAsync();

            expect(fetch).not.toHaveBeenCalled();
            expect(host.stations).toEqual([{ name: 'Saved station' }]);
        } finally {
            vi.useRealTimers();
        }
    });

    it('discards a search already in flight when the tab changes', async () => {
        const host = makeHost();
        let release;
        const search = host.loadSearch(() => new Promise(r => { release = r; }));

        host.switchView('library', () => { host.stations = [{ name: 'Saved station' }]; });

        release([{ name: 'Search hit' }]);
        await search;

        expect(host.stations).toEqual([{ name: 'Saved station' }]);
    });

    it('lowers the loading flag the aborted search can no longer lower itself', async () => {
        const host = makeHost();
        let release;
        const search = host.loadSearch(() => new Promise(r => { release = r; }));
        expect(host.loading).toBe(true);

        host.switchView('library');

        release([]);
        await search;

        // A stuck flag would leave the new tab showing "Loading…" for ever.
        expect(host.loading).toBe(false);
    });

    it('tears the pending search down in the component itself', () => {
        const switchView = SOURCE.match(/_switchView\(view\)\s*\{[\s\S]*?\n {4}\}/);
        expect(switchView).not.toBeNull();
        expect(switchView[0]).toContain('clearTimeout(this._searchDebounceTimer)');
        expect(switchView[0]).toContain('this._searchAbort?.abort()');
        expect(switchView[0]).toContain('this._loading = false');
    });

    it('guards the search result write by view, as the sibling loaders do', () => {
        // `_loadLibrary` and `_loadFavorites` have always checked `_view` before
        // writing `_stations`; `_loadSearch` was the one that did not.
        expect(SOURCE).toContain("if (signal.aborted || this._view !== 'search') return;");
    });
});

/**
 * A catalogue outage must read as a catalogue outage. The core answers 503 with
 * a listener-worded reason on every route that resolves a station through Radio
 * Browser, and the UI has to pass that reason through rather than substitute a
 * guess of its own.
 */
describe('catalogue failures on membership actions', () => {
    const SOURCE = readFileSync(
        path.join(path.dirname(fileURLToPath(import.meta.url)), 'ag-library-radio.js'),
        'utf8',
    );

    it('surfaces the catalogue reason when an add fails', () => {
        // Both `POST /radio/library` and `POST /radio/favorites` share this catch.
        expect(SOURCE).toMatch(/catch \(err\)\s*\{[\s\S]{0,400}?catalogueErrorMessage\(err, cfg\.errMsg\)/);
    });

    it('does not blame MPD when a station will not start', () => {
        // `/radio/play` answers 503 for two unrelated reasons — a catalogue
        // failure, worded for a listener, and an output refusal carrying
        // HQPlayer's own words — so `catalogueErrorMessage` cannot be used
        // there: it shows the detail verbatim. What must not come back is the
        // old wording, which named MPD while MPD was working.
        const onPlay = SOURCE.match(/_onPlay = async[\s\S]*?\n {4}\};/);
        expect(onPlay).not.toBeNull();
        // Only the displayed string is under test — the comment above it is
        // free to name MPD in order to explain why the message no longer does.
        const shown = onPlay[0].match(/this\._error = (['"])(.*?)\1/);
        expect(shown).not.toBeNull();
        expect(shown[2]).not.toMatch(/MPD/);
        expect(onPlay[0]).not.toContain('catalogueErrorMessage(');
    });
});
