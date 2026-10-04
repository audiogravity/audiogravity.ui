/**
 * Unit tests for ag-system-tile.js — the reading and the captions over the
 * System charts.
 *
 * The reading puts the unit on the number's line: as two blocks, "12.4" stood
 * with "%" alone on the line below.
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

/** Mount a tile and return the text of its reading line. */
async function reading(props) {
    const el = tile(props);
    document.body.appendChild(el);
    await el.updateComplete;
    const line = el.querySelector('.metric-reading');
    const text = line.textContent;
    const hasUnit = line.querySelector('.metric-unit') !== null;
    el.remove();
    return { text, hasUnit };
}

describe('the reading', () => {
    it('puts a percent sign against the number, on its line', async () => {
        expect(await reading({ value: '12.4', unit: '%' })).toEqual({ text: '12.4%', hasUnit: true });
    });

    it('puts any other unit after a space, on its line', async () => {
        expect(await reading({ value: '54.3', unit: '°C' })).toEqual({ text: '54.3 °C', hasUnit: true });
        expect(await reading({ value: '839.8', unit: 'kB/s' })).toEqual({ text: '839.8 kB/s', hasUnit: true });
    });

    it('writes no unit when the tile has none', async () => {
        expect(await reading({ value: '4d 16h' })).toEqual({ text: '4d 16h', hasUnit: false });
    });
});

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

describe('the connection tile', () => {
    /** Mount a connection tile and return its heading and its state. */
    async function connection(props) {
        const el = tile({ type: 'connection', ...props });
        document.body.appendChild(el);
        await el.updateComplete;
        const out = {
            heading: el.querySelector('h3').textContent.trim(),
            state: el.querySelector('.connection-text-large').textContent.trim(),
        };
        el.remove();
        return out;
    }

    it('reads "Live updates: Connected" — "SSE stream" is a word only a developer knows', async () => {
        expect(await connection({ connected: true })).toEqual({ heading: 'Live updates', state: 'Connected' });
    });

    it('says when the updates are not coming', async () => {
        expect((await connection({ connected: false })).state).toBe('Disconnected');
    });
});
