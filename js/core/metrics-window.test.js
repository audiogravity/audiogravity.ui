/**
 * Unit tests for metrics-window.js — the helpers every chart history goes through.
 *
 * The Services page and the System dashboard each had their own way of appending a
 * sample (one built a new array, the other pushed in place) and three copies of the
 * "is this a measurement?" test. Both now call these, so the rules below hold for
 * every chart at once.
 */
import { describe, it, expect } from 'vitest';
import { isMeasured, appendBounded, appendMeasured, MAX_SAMPLE_GAP_MS } from './metrics-window.js';

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
