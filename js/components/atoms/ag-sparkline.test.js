/**
 * Unit tests for ag-sparkline.js — the measured variants ('area', 'bars').
 *
 * What these variants promise the reader: only what was measured is drawn, where
 * it was measured. Three measurements sit in three slots on the right of the
 * window instead of stretching across it; a missing one is a gap, never a zero;
 * with auto-scale the scale starts at zero, so a flat line is a stable value and
 * not a magnified wobble. The 'line' variant, used elsewhere, must not move.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';

beforeAll(() => {
    // jsdom has no layout: the component sizes itself from a ResizeObserver.
    globalThis.ResizeObserver ??= class { observe() {} disconnect() {} };
});

import { AgSparkline, placeOnSlots, measuredRuns, monotonePath } from './ag-sparkline.js';

const mounted = [];
afterEach(() => { mounted.splice(0).forEach(el => el.remove()); });

/**
 * Mount a sparkline at a known size and wait for it to draw. Removed after each test.
 * @param {Object} props - Properties to set before the first render.
 * @returns {Promise<AgSparkline>}
 */
async function mount(props) {
    const el = document.createElement('ag-sparkline');
    Object.assign(el, { width: 100, height: 20 }, props);
    document.body.appendChild(el);
    mounted.push(el);
    await el.updateComplete;
    return el;
}

describe('placeOnSlots — a window with a width of its own', () => {
    it('puts the newest measurement in the last slot', () => {
        const { count, points } = placeOnSlots([4, 5, 6], 30);
        expect(count).toBe(30);
        expect(points.map(p => p.slot)).toEqual([27, 28, 29]);
    });

    it('skips what was not measured but keeps its slot', () => {
        const { points } = placeOnSlots([4, null, 6, undefined, 8], 5);
        expect(points).toEqual([{ slot: 0, value: 4 }, { slot: 2, value: 6 }, { slot: 4, value: 8 }]);
    });

    it('keeps only the newest values when there are more than slots', () => {
        const { points } = placeOnSlots([1, 2, 3, 4], 2);
        expect(points.map(p => p.value)).toEqual([3, 4]);
    });

    it('uses one slot per value without a window', () => {
        expect(placeOnSlots([1, 2, 3], 0).count).toBe(3);
    });

    it('survives no data at all', () => {
        expect(placeOnSlots(undefined, 30)).toEqual({ count: 30, points: [] });
    });
});

describe('measuredRuns — a gap splits the line', () => {
    it('cuts where a slot has no measurement', () => {
        const { points } = placeOnSlots([1, 2, null, 4, 5], 5);
        expect(measuredRuns(points).map(r => r.map(p => p.value))).toEqual([[1, 2], [4, 5]]);
    });
});

describe('monotonePath — smooth, never beyond a measurement', () => {
    it('keeps every control point within the measured range', () => {
        const pts = [[0, 10], [10, 2], [20, 18], [30, 3], [40, 3], [50, 12]];
        const ys = monotonePath(pts).match(/-?\d+(\.\d+)?/g).map(Number).filter((_, i) => i % 2 === 1);
        expect(Math.min(...ys)).toBeGreaterThanOrEqual(2);
        expect(Math.max(...ys)).toBeLessThanOrEqual(18);
    });

    it('draws a straight segment between two points', () => {
        expect(monotonePath([[0, 1], [5, 2]])).toBe('M 0,1 L 5,2');
    });
});

describe("'area' variant", () => {
    it('draws the first measurements on the right, not across the chart', async () => {
        const el = await mount({ variant: 'area', slots: 10, autoScale: true, data: [1, 2] });
        const dot = el.querySelector('circle.sparkline-dot');
        // Slot 9 of 10 on a 100px chart: centre at 95.
        expect(Number(dot.getAttribute('cx'))).toBeCloseTo(95);
        expect(el.querySelectorAll('path.sparkline-line')).toHaveLength(1);
    });

    it('leaves a gap where a measurement is missing', async () => {
        const el = await mount({ variant: 'area', slots: 6, autoScale: true, data: [1, 2, null, 3, 4, 5] });
        expect(el.querySelectorAll('path.sparkline-line')).toHaveLength(2);
        expect(el.querySelectorAll('path.sparkline-area')).toHaveLength(2);
    });

    it('starts its scale at zero: a stable value is a line high up, not mid-chart', async () => {
        // The old auto-scale stretched the range around the values, so a memory
        // figure steady at 80 MB could be drawn anywhere in the box.
        const el = await mount({ variant: 'area', slots: 3, autoScale: true, data: [80, 80, 80] });
        const cy = Number(el.querySelector('circle.sparkline-dot').getAttribute('cy'));
        expect(cy).toBeLessThan(6);
    });

    it('draws the second series as a thin line in its own colour', async () => {
        const el = await mount({
            variant: 'area', slots: 4, autoScale: true, data: [4, 5, 6, 7], data2: [1, 1, 2, 2],
            secondLineColor: '#949494',
        });
        const second = el.querySelector('path.sparkline-line-secondary');
        expect(second.style.stroke).toBe('rgb(148, 148, 148)'); // #949494, as the DOM reports it
        expect(second.getAttribute('stroke-width')).toBe('1');
    });

    it('takes its colours as CSS, so a var() resolves without JS', async () => {
        // An SVG attribute does not resolve var(); the old path read every colour back
        // with getComputedStyle on each draw, which the charts now do on every sample.
        const el = await mount({
            variant: 'area', slots: 3, autoScale: true, data: [1, 2, 3],
            lineColor: 'var(--chart-cpu)', fillColor: 'var(--chart-cpu-bg)',
        });
        expect(el.querySelector('path.sparkline-line').style.stroke).toBe('var(--chart-cpu)');
        expect(el.querySelector('path.sparkline-area').style.fill).toBe('var(--chart-cpu-bg)');
        expect(el.querySelector('path.sparkline-line').hasAttribute('stroke')).toBe(false);
    });

    it('draws a measurement alone between two gaps as a point', async () => {
        const el = await mount({ variant: 'area', slots: 7, autoScale: true, data: [1, 2, null, 5, null, 3, 4] });
        const points = el.querySelectorAll('circle.sparkline-point');
        expect(points).toHaveLength(1);
        // Slot 3 of 7 on 100px: centre at 50.
        expect(Number(points[0].getAttribute('cx'))).toBeCloseTo(50);
    });

    it('draws a lone point of the second series too', async () => {
        const el = await mount({
            variant: 'area', slots: 4, autoScale: true, data: [4, 5, 6, 7], data2: [1, 1, null, 2],
        });
        expect(el.querySelectorAll('path.sparkline-line-secondary')).toHaveLength(1);
        expect(el.querySelectorAll('circle.sparkline-point-secondary')).toHaveLength(1);
    });

    it('marks no current value when the newest slot is empty', async () => {
        // A dot on an old value would present it as the current one.
        const el = await mount({ variant: 'area', slots: 5, autoScale: true, data: [3, 4, 5, null, null] });
        expect(el.querySelector('circle.sparkline-dot')).toBeNull();
        expect(el.querySelectorAll('path.sparkline-line')).toHaveLength(1);
    });

    it('lines both series up on the right when no window is set', async () => {
        const el = await mount({ variant: 'area', autoScale: true, data: [1, 2, 3, 4, 5, 6], data2: [1, 1] });
        const d = el.querySelector('path.sparkline-line-secondary').getAttribute('d');
        const xs = d.match(/-?\d+(\.\d+)?,/g).map(v => parseFloat(v));
        // Six slots on 100px: the two last centres are 75 and 91.67.
        expect(xs[0]).toBeCloseTo(75);
        expect(xs[1]).toBeCloseTo(91.67, 1);
    });

    it('draws nothing but its base line before the first measurement', async () => {
        const el = await mount({ variant: 'area', slots: 30, autoScale: true, data: [] });
        expect(el.querySelector('line.sparkline-baseline')).not.toBeNull();
        expect(el.querySelector('path')).toBeNull();
        expect(el.querySelector('circle')).toBeNull();
    });
});

describe("'bars' variant", () => {
    it('draws one bar per measured value, the latest marked', async () => {
        const el = await mount({ variant: 'bars', slots: 60, autoScale: true, data: [10, null, 30, 20] });
        const bars = el.querySelectorAll('rect.sparkline-bar');
        expect(bars).toHaveLength(3);
        expect(bars[2].classList.contains('is-last')).toBe(true);
        expect(el.querySelectorAll('rect.is-last')).toHaveLength(1);
    });

    it('marks no bar as current when the newest slot is empty', async () => {
        const el = await mount({ variant: 'bars', slots: 4, autoScale: true, data: [10, 20, 30, null] });
        expect(el.querySelectorAll('rect.sparkline-bar')).toHaveLength(3);
        expect(el.querySelector('rect.is-last')).toBeNull();
    });

    it('places its bars from the right of the window', async () => {
        const el = await mount({ variant: 'bars', slots: 10, autoScale: true, data: [5] });
        // Slot 9 of 10 on 100px: starts at 90 (+0.5 of separation).
        expect(Number(el.querySelector('rect').getAttribute('x'))).toBeCloseTo(90.5);
    });

    it('prints its captions above the bars', async () => {
        const el = await mount({
            variant: 'bars', slots: 60, autoScale: true, height: 40, data: [10, 20],
            captionStart: 'max 20.0%', captionEnd: '10m',
        });
        const texts = [...el.querySelectorAll('text.sparkline-caption')].map(t => t.textContent);
        expect(texts).toEqual(['max 20.0%', '10m']);
        for (const bar of el.querySelectorAll('rect')) expect(Number(bar.getAttribute('y'))).toBeGreaterThanOrEqual(12);
    });
});

describe("'line' variant — unchanged for the charts that use it", () => {
    it('keeps its 2px stroke and its gradient fill by default', async () => {
        const el = await mount({ data: [1, 2, 3] });
        expect(el.querySelector('path.sparkline-line').getAttribute('stroke-width')).toBe('2');
        expect(el.querySelector('linearGradient')).not.toBeNull();
    });

    it('still honours an explicit width', async () => {
        const el = await mount({ data: [1, 2, 3], lineWidth: 1.5 });
        expect(el.querySelector('path.sparkline-line').getAttribute('stroke-width')).toBe('1.5');
    });

    it('is what a sparkline without a variant draws', () => {
        expect(new AgSparkline().variant).toBe('line');
    });
});
