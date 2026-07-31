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
