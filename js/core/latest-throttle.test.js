/**
 * Unit tests for latestThrottle — at most one value per interval, the last one never lost.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { latestThrottle } from './latest-throttle.js';

describe('latestThrottle', () => {
    let sent;
    let t;

    beforeEach(() => {
        vi.useFakeTimers();
        sent = [];
        t = latestThrottle((v) => sent.push(v), 250);
    });

    afterEach(() => { vi.useRealTimers(); });

    it('sends the first value at once', () => {
        t.push(10);
        expect(sent).toEqual([10]);
    });

    it('sends the values offered within the interval once, the latest, when it ends', () => {
        t.push(10);
        t.push(11);
        t.push(12);
        t.push(13);
        expect(sent).toEqual([10]);
        vi.advanceTimersByTime(250);
        expect(sent).toEqual([10, 13]);
    });

    it('lets at most one value through per interval during a long stream', () => {
        const at = [];
        t = latestThrottle((v) => { sent.push(v); at.push(Date.now()); }, 250);
        for (let ms = 0; ms < 1000; ms += 16) { // one value per frame for a second
            t.push(ms);
            vi.advanceTimersByTime(16);
        }
        vi.advanceTimersByTime(250);
        // Every send at least one interval after the one before — not merely few in all.
        for (let i = 1; i < at.length; i++) expect(at[i] - at[i - 1]).toBeGreaterThanOrEqual(250);
        expect(sent.at(-1)).toBe(992); // the last value offered
    });

    it('flush sends the waiting value at once, and nothing more afterwards', () => {
        t.push(10);
        t.push(20);
        t.flush();
        expect(sent).toEqual([10, 20]);
        vi.advanceTimersByTime(1000);
        expect(sent).toEqual([10, 20]);
    });

    it('keeps working after a flush — the next drag is not held', () => {
        t.push(10);
        t.push(20);
        t.flush();
        vi.advanceTimersByTime(300);
        t.push(30);
        t.push(40);
        vi.advanceTimersByTime(250);
        expect(sent).toEqual([10, 20, 30, 40]);
    });

    it('flush with nothing waiting sends nothing', () => {
        t.push(10);
        t.flush();
        expect(sent).toEqual([10]);
    });

    it('cancel drops the waiting value — a later flush has nothing to send', () => {
        t.push(10);
        t.push(20);
        t.cancel();
        t.flush();
        vi.advanceTimersByTime(1000);
        expect(sent).toEqual([10]);
    });

    it('a value of 0 is sent like any other', () => {
        t.push(5);
        t.push(0);
        vi.advanceTimersByTime(250);
        expect(sent).toEqual([5, 0]);
    });

    it('after a quiet interval, the next value goes at once again', () => {
        t.push(10);
        vi.advanceTimersByTime(300);
        t.push(20);
        expect(sent).toEqual([10, 20]);
    });

    it('a clock set back never holds a value longer than one interval', () => {
        vi.setSystemTime(new Date('2026-09-29T20:00:00Z'));
        t.push(10);
        vi.setSystemTime(new Date('2026-09-29T19:00:00Z')); // an hour back
        t.push(20);
        vi.advanceTimersByTime(250);
        expect(sent).toEqual([10, 20]);
    });
});
