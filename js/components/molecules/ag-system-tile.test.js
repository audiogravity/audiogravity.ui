/**
 * Unit tests for ag-system-tile.js — the captions over the System charts.
 *
 * The bars start at zero and end just above the highest measurement, so the
 * "max" caption is the chart's scale. The duration caption says how much time
 * the bars cover; the core's rate is adaptive (2 s to 30 s), so it comes from
 * the updates' arrival times, never from the number of bars.
 */
import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(() => {
    globalThis.ResizeObserver ??= class { observe() {} disconnect() {} };
});

import { AgSystemTile } from './ag-system-tile.js';

function tile(props) {
    return Object.assign(new AgSystemTile(), props);
}

describe('the max caption', () => {
    it('names the highest measurement with a percent sign glued on', () => {
        expect(tile({ unit: '%', sparklineData: [12.5, 34.24, 20] })._maxCaption()).toBe('max 34.2%');
    });

    it('spaces any other unit', () => {
        expect(tile({ unit: '°C', sparklineData: [61, 65.3] })._maxCaption()).toBe('max 65.3 °C');
        expect(tile({ unit: 'kB/s', sparklineData: [229.6] })._maxCaption()).toBe('max 229.6 kB/s');
    });

    it('ignores what was not measured', () => {
        expect(tile({ unit: '%', sparklineData: [undefined, 8, null] })._maxCaption()).toBe('max 8.0%');
    });

    it('says nothing before the first measurement', () => {
        expect(tile({ unit: '%', sparklineData: [] })._maxCaption()).toBe('');
        expect(tile({ unit: '%', sparklineData: [null] })._maxCaption()).toBe('');
    });
});

describe('the duration caption', () => {
    it('reads the span of the held measurements', () => {
        expect(tile({ sparklineSpan: 10 * 60 * 1000 })._spanCaption()).toBe('10m');
        expect(tile({ sparklineSpan: 65 * 60 * 1000 })._spanCaption()).toBe('1h 5m');
    });

    it('does not print "0m" under a minute', () => {
        expect(tile({ sparklineSpan: 25 * 1000 })._spanCaption()).toBe('<1m');
    });

    it('says nothing below two measurements', () => {
        expect(tile({ sparklineSpan: 0 })._spanCaption()).toBe('');
    });
});

describe('the chart it draws', () => {
    it('is the bars variant, on the window the dashboard keeps', async () => {
        const el = tile({
            title: 'CPU Usage', unit: '%', value: '30.4', sparklineColor: 'var(--chart-cpu)',
            sparklineData: [20, 30.4], sparklineSlots: 60, sparklineSpan: 10000,
        });
        document.body.appendChild(el);
        await el.updateComplete;
        const spark = el.querySelector('ag-sparkline');
        expect(spark.variant).toBe('bars');
        expect(spark.slots).toBe(60);
        expect(spark.captionStart).toBe('max 30.4%');
        expect(spark.captionEnd).toBe('<1m');
        el.remove();
    });
});
