/**
 * Unit tests for ag-metric-detail.js — the chart a Services box opens into.
 *
 * It reads the same history as the small chart. That history no longer starts
 * with thirty zeros, so this view meets what it never used to: a single
 * measurement (a division by zero on the x axis) and missing ones (drawn as
 * zeros). It must draw them as the small chart does.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { AgMetricDetail } from './ag-metric-detail.js';

const mounted = [];
afterEach(() => { mounted.splice(0).forEach(el => el.remove()); });

async function mount(props) {
    const el = Object.assign(new AgMetricDetail(), { label: 'CPU', unit: '%' }, props);
    document.body.appendChild(el);
    mounted.push(el);
    await el.updateComplete;
    return el;
}

describe('the expanded chart', () => {
    it('draws a lone first measurement, as a point on the right', async () => {
        // A one-vertex polyline draws nothing: the view used to open empty.
        const el = await mount({ data: [1.2], slots: 30 });
        const point = el.querySelector('path.detailed-chart-point');
        expect(point, 'no point drawn').not.toBeNull();
        expect(point.getAttribute('d')).toMatch(/^M 100,/);
        expect(el.innerHTML).not.toMatch(/NaN/);
    });

    it('draws a measurement alone between two gaps', async () => {
        const el = await mount({ data: [1, 2, null, 5, null, 3, 4], slots: 7 });
        expect(el.querySelectorAll('polyline')).toHaveLength(2);
        expect(el.querySelectorAll('path.detailed-chart-point')).toHaveLength(1);
    });

    it('places measurements on the right of the window, like the small chart', async () => {
        const el = await mount({ data: [1, 2], slots: 30 });
        const xs = el.querySelector('polyline').getAttribute('points').split(' ').map(p => Number(p.split(',')[0]));
        expect(xs[1]).toBeCloseTo(100);
        expect(xs[0]).toBeCloseTo((28 / 29) * 100);
    });

    it('leaves a gap where a measurement is missing', async () => {
        const el = await mount({ data: [1, 2, null, 3, 4], slots: 5 });
        expect(el.querySelectorAll('polyline')).toHaveLength(2);
    });

    it('shows the newest value when it was measured', async () => {
        const el = await mount({ data: [1.5, 2.5], slots: 5 });
        expect(el.querySelector('.detailed-chart-value').textContent).toBe('2.5%');
    });

    it('shows a dash, not an older value, when the newest one is missing', async () => {
        // An older figure in large type would read as the current one.
        const el = await mount({ data: [1.5, null], slots: 5 });
        expect(el.querySelector('.detailed-chart-value').textContent).toBe('—');
    });

    it('shows nothing before the first measurement', async () => {
        const el = await mount({ data: [null, null], slots: 5 });
        expect(el.querySelector('svg')).toBeNull();
    });
});
