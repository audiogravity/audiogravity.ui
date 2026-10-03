/**
 * Tests for reload-guard — a reload the page decides alone, once in a given time at most.
 *
 * Covers:
 * 1. allowed when none was made, or once the window is over — not within it
 * 2. a time recorded in the future counts as long past (a clock set back)
 * 3. no session storage: never allowed
 * 4. claimReload records the time, so that the next claim waits; refused, it records nothing
 * 5. each reason under its own key
 */
import { describe, it, expect } from 'vitest';
import { reloadAllowed, claimReload } from './reload-guard.js';

const KEY = 'test-reload-at';
const WINDOW = 60_000;

function memoryStorage(values = {}) {
    const map = new Map(Object.entries(values));
    return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)) };
}

describe('reloadAllowed', () => {
    it('allows a first reload', () => {
        expect(reloadAllowed(KEY, WINDOW, { storage: memoryStorage(), now: 1e9 })).toBe(true);
    });

    it('refuses one within the window, and allows it once the window is over', () => {
        const storage = memoryStorage({ [KEY]: String(1e9) });
        expect(reloadAllowed(KEY, WINDOW, { storage, now: 1e9 + WINDOW - 1 })).toBe(false);
        expect(reloadAllowed(KEY, WINDOW, { storage, now: 1e9 + WINDOW })).toBe(true);
    });

    it('takes a reload dated in the future for a long past one', () => {
        // The clock set back since: the window must not stay shut for as long.
        const storage = memoryStorage({ [KEY]: String(1e9 + 30 * 60_000) });
        expect(reloadAllowed(KEY, WINDOW, { storage, now: 1e9 })).toBe(true);
    });

    it('refuses without session storage, where nothing would stop a loop', () => {
        const storage = { getItem: () => { throw new Error('denied'); }, setItem: () => {} };
        expect(reloadAllowed(KEY, WINDOW, { storage, now: 1e9 })).toBe(false);
    });
});

describe('claimReload', () => {
    it('records the reload, so that the next claim waits', () => {
        const storage = memoryStorage();
        expect(claimReload(KEY, WINDOW, { storage, now: 1e9 })).toBe(true);
        expect(storage.getItem(KEY)).toBe(String(1e9));
        expect(claimReload(KEY, WINDOW, { storage, now: 1e9 + 1 })).toBe(false);
    });

    it('records nothing when refused', () => {
        const storage = memoryStorage({ [KEY]: String(1e9) });
        expect(claimReload(KEY, WINDOW, { storage, now: 1e9 + 1 })).toBe(false);
        expect(storage.getItem(KEY)).toBe(String(1e9));
    });

    it('refuses a reload it cannot record', () => {
        const storage = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
        expect(claimReload(KEY, WINDOW, { storage, now: 1e9 })).toBe(false);
    });

    it('keeps each reason apart', () => {
        const storage = memoryStorage();
        claimReload('one-reason', WINDOW, { storage, now: 1e9 });
        expect(claimReload('another-reason', WINDOW, { storage, now: 1e9 + 1 })).toBe(true);
    });
});
