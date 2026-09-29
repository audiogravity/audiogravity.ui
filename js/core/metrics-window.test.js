/**
 * Unit tests for metrics-window.js — the helpers every chart history goes through.
 *
 * The Services page and the System dashboard each had their own way of appending a
 * sample (one built a new array, the other pushed in place) and three copies of the
 * "is this a measurement?" test. Both now call these, so the rules below hold for
 * every chart at once.
 */
import { describe, it, expect } from 'vitest';
import {
    isMeasured, appendBounded, appendMeasured, MAX_SAMPLE_GAP_MS, isPause, spanOfLast,
    appendSample, appendSampleTime,
} from './metrics-window.js';

describe('isMeasured', () => {
    it('accepts any finite number, zero included', () => {
        expect([0, -1, 2.5].every(isMeasured)).toBe(true);
    });

    it('rejects what the core sends when it has no reading', () => {
        expect([null, undefined, NaN, Infinity, '12', {}].some(isMeasured)).toBe(false);
    });
});

describe('appendBounded', () => {
    it('returns a new array, leaving the one a chart holds untouched', () => {
        const held = [1, 2];
        const next = appendBounded(held, 3, 5);
        expect(next).toEqual([1, 2, 3]);
        expect(next).not.toBe(held);
        expect(held).toEqual([1, 2]);
    });

    it('keeps only the newest entries', () => {
        expect(appendBounded([1, 2, 3], 4, 3)).toEqual([2, 3, 4]);
    });

    it('starts a series that does not exist yet', () => {
        expect(appendBounded(undefined, 1, 3)).toEqual([1]);
    });
});

describe('appendMeasured', () => {
    it('stores a missing reading as null, a gap, never a zero', () => {
        expect(appendMeasured([4], undefined, 5)).toEqual([4, null]);
        expect(appendMeasured([4], NaN, 5)).toEqual([4, null]);
    });

    it('keeps a reading of zero', () => {
        expect(appendMeasured([], 0, 5)).toEqual([0]);
    });
});

describe('MAX_SAMPLE_GAP_MS', () => {
    it('lies above the core slowest rate (30 s), so a normal sample never opens a gap', () => {
        expect(MAX_SAMPLE_GAP_MS).toBeGreaterThan(30_000);
    });
});

describe('isPause', () => {
    it('sees no pause before the first sample', () => {
        expect(isPause(undefined, 1_000_000)).toBe(false);
    });

    it('sees one only past the longest normal silence', () => {
        expect(isPause(0, MAX_SAMPLE_GAP_MS)).toBe(false);
        expect(isPause(0, MAX_SAMPLE_GAP_MS + 1)).toBe(true);
    });
});

describe('appendSample and appendSampleTime', () => {
    it('append the sample and its time, nothing more, on a steady stream', () => {
        expect(appendSample([1, 2], 3, false, 5)).toEqual([1, 2, 3]);
        expect(appendSampleTime([0, 10], 20, false, 5)).toEqual([0, 10, 20]);
    });

    it('put a gap before the sample after a pause, and time both, so series and times stay in step', () => {
        expect(appendSample([1, 2], 3, true, 5)).toEqual([1, 2, null, 3]);
        expect(appendSampleTime([0, 10], 200, true, 5)).toEqual([0, 10, 200, 200]);
    });

    it('store a reading that is not a measurement as a gap, and keep the window', () => {
        expect(appendSample([1, 2, 3], undefined, false, 3)).toEqual([2, 3, null]);
        expect(appendSample([1, 2, 3], 4, true, 3)).toEqual([3, null, 4]);
    });
});

describe('spanOfLast', () => {
    const times = [0, 10_000, 20_000, 50_000];

    it('measures from the oldest to the newest of the samples a chart holds', () => {
        expect(spanOfLast(times, 4)).toBe(50_000);
        expect(spanOfLast(times, 2)).toBe(30_000);
    });

    it('covers nothing below two samples, or when the times do not reach back that far', () => {
        expect(spanOfLast(times, 1)).toBe(0);
        expect(spanOfLast(times, 0)).toBe(0);
        expect(spanOfLast(times, 5)).toBe(0);
    });
});
