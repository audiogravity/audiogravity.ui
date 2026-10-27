/**
 * Unit tests for js/core/link-bands.js — the bands a link's latency and buffer fill fall in.
 *
 * The thresholds were written in three places for the latency (a link, its bubble, the
 * latency test's histogram) and in two for the buffer, and in the legends as text as well:
 * a threshold moved in one place would have left the others, and their legends, behind.
 *
 * Covers:
 * 1. each threshold opens its band; what is not a figure falls in the first one
 * 2. the Pipeline and the latency test read the bands, and write no threshold of their own
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { BUFFER_BANDS, LATENCY_BANDS, bufferBand, latencyBand } from './link-bands.js';

describe('latencyBand', () => {
    it('puts each threshold in the band it opens', () => {
        expect([0, 49, 50, 199, 200, 499, 500, 5000].map(latencyBand))
            .toEqual(['excellent', 'excellent', 'good', 'good', 'average', 'average', 'critical', 'critical']);
    });

    it('puts what is not a latency in the first band, as the Pipeline drew it before', () => {
        // In 'critical' it would have been written in red.
        expect([undefined, null, NaN, 'x'].map(latencyBand)).toEqual(['excellent', 'excellent', 'excellent', 'excellent']);
    });

    it('starts the bands where the legends say', () => {
        expect(LATENCY_BANDS).toEqual({ good: 50, average: 200, critical: 500 });
    });
});

describe('bufferBand', () => {
    it('puts each threshold in the band it opens', () => {
        expect([0, 79, 80, 89, 90, 100].map(bufferBand))
            .toEqual(['healthy', 'healthy', 'warning', 'warning', 'critical', 'critical']);
        expect(BUFFER_BANDS).toEqual({ warning: 80, critical: 90 });
    });

    it('puts what is not a fill in the first band', () => {
        expect([undefined, null, NaN].map(bufferBand)).toEqual(['healthy', 'healthy', 'healthy']);
    });
});

describe('the readers of the bands', () => {
    it.each([
        ['js/components/atoms/ag-pipeline-link.js'],
        ['js/components/organisms/ag-audio-pipeline.js'],
        ['js/components/organisms/ag-latency-test.js'],
    ])('— %s — writes no threshold of its own', (file) => {
        const source = readFileSync(file, 'utf8');
        expect(source).toContain('latencyBand(');
        // No comparison against a threshold…
        expect(source).not.toMatch(/(latency(_us|Us)|buffer_fill_percent)\s*(>=|<=|>|<)\s*\d/);
        // …and none written out in a legend.
        // (`&lt;` is how the Pipeline's legend writes "<".)
        expect(source).not.toMatch(/\b(50|200|500)\s*[–-]\s*(200|500)\b|(?:[<≥]|&lt;)\s*(50|80|90|500)\s*(µs|%)/);
    });
});
