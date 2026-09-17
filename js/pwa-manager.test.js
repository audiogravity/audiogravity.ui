/**
 * What snapshotting costs the main thread, and what it must never lose.
 *
 * `localStorage.setItem` is synchronous. The metrics stream fires every 10 s and the audio
 * pipeline on every change, and each one used to serialise a payload and write it straight
 * away — several blocking writes a minute, for as long as the interface stayed open, on a
 * box whose spare CPU is the audio's. Only the last value of a key is ever read back, so
 * every write before it bought nothing.
 *
 * Coalescing them is only safe if nothing is lost when the app goes away, which on iOS
 * happens far more often than a real close. Both halves are pinned here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./common.js', () => ({
    EventEmitter: { on: vi.fn(), emit: vi.fn(), off: vi.fn() },
}));
vi.mock('./core/FetchController.js', () => ({ setSnapshotStore: vi.fn() }));

import { PWAManager } from './pwa-manager.js';

/** Count the writes that actually reach storage. */
let writes;

beforeEach(() => {
    vi.useFakeTimers();
    writes = [];
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (k, v) {
        writes.push([k, v]);
    });
    PWAManager._pending.clear();
    PWAManager._flushTimer = null;
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('snapshots are coalesced instead of written on every event', () => {
    it('writes once for a burst on the same key', () => {
        for (let i = 0; i < 30; i++) PWAManager._saveSnapshot('metrics', { cpu: i });

        expect(writes.length, 'une écriture synchrone par événement').toBe(0);
        vi.advanceTimersByTime(5_000);
        expect(writes.length, '30 événements ont coûté plus d\'une écriture').toBe(1);
    });

    it('keeps the last value, not the first', () => {
        PWAManager._saveSnapshot('metrics', { cpu: 1 });
        PWAManager._saveSnapshot('metrics', { cpu: 2 });
        PWAManager._saveSnapshot('metrics', { cpu: 3 });
        vi.advanceTimersByTime(5_000);

        expect(JSON.parse(writes[0][1]).data).toEqual({ cpu: 3 });
    });

    it('writes every distinct key in the same pass', () => {
        PWAManager._saveSnapshot('metrics', { cpu: 1 });
        PWAManager._saveSnapshot('pipeline', { nodes: [] });
        vi.advanceTimersByTime(5_000);

        expect(writes.map(w => w[0]).sort())
            .toEqual(['ag_snapshot_metrics', 'ag_snapshot_pipeline']);
    });

    it('dates a snapshot when it was taken, not when it was written', () => {
        // Otherwise the debounce would silently backdate every reading by up to 5 s, and
        // the timestamp is what a reader uses to judge how old the data on screen is.
        const t0 = Date.now();
        PWAManager._saveSnapshot('metrics', { cpu: 1 });
        vi.advanceTimersByTime(5_000);

        const written = JSON.parse(writes[0][1]).timestamp;
        expect(written - t0).toBeLessThan(1_000);
    });

    it('starts a new window after a flush', () => {
        PWAManager._saveSnapshot('metrics', { cpu: 1 });
        vi.advanceTimersByTime(5_000);
        PWAManager._saveSnapshot('metrics', { cpu: 2 });
        vi.advanceTimersByTime(5_000);

        expect(writes.length).toBe(2);
        expect(JSON.parse(writes[1][1]).data).toEqual({ cpu: 2 });
    });
});

describe('nothing queued is lost when the app is put away', () => {
    it('writes immediately rather than waiting out the window', () => {
        // An installed app is backgrounded constantly. A snapshot still in the queue would
        // be lost for the next cold start — the one moment it exists for.
        PWAManager._saveSnapshot('metrics', { cpu: 7 });
        expect(writes.length).toBe(0);

        PWAManager._flushSnapshots();

        expect(writes.length).toBe(1);
        expect(JSON.parse(writes[0][1]).data).toEqual({ cpu: 7 });
    });

    it('does not write the same value twice when the timer then fires', () => {
        PWAManager._saveSnapshot('metrics', { cpu: 7 });
        PWAManager._flushSnapshots();
        vi.advanceTimersByTime(10_000);

        expect(writes.length, 'la purge n\'a pas désarmé le minuteur').toBe(1);
    });

    it('survives a storage quota error without dropping the rest', () => {
        let first = true;
        Storage.prototype.setItem.mockImplementation(function (k, v) {
            if (first) { first = false; throw new Error('QuotaExceededError'); }
            writes.push([k, v]);
        });

        PWAManager._saveSnapshot('a', { x: 1 });
        PWAManager._saveSnapshot('b', { x: 2 });
        expect(() => PWAManager._flushSnapshots()).not.toThrow();

        expect(writes.length, 'une clé en échec a emporté les suivantes').toBe(1);
    });
});

describe('a reading is served from the queue while it waits there', () => {
    it('hands back the queued value, not the older stored one', () => {
        // A panel that loads and then fails within the window would otherwise be restored
        // to the reading BEFORE the one it just had.
        vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(
            JSON.stringify({ timestamp: 0, data: { cpu: 'ancien' } }));

        PWAManager._saveSnapshot('metrics', { cpu: 'frais' });

        expect(PWAManager.readSnapshot('metrics')).toEqual({ cpu: 'frais' });
    });

    it('falls back to storage once the queue is empty', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(
            JSON.stringify({ timestamp: 0, data: { cpu: 'stocké' } }));

        expect(PWAManager.readSnapshot('metrics')).toEqual({ cpu: 'stocké' });
    });
});
