/**
 * Unit tests for ag-metric-detail.js — the chart a Services box opens into.
 *
 * It reads the same history as the small chart, and since 2026-10-13 it draws it in
 * bars through that chart ('bars' variant), as the System tiles do (user's choice). The
 * bars themselves — one per measurement, a gap where one is missing, a zero kept as a
 * 1 px bar — are the small chart's and tested with it (ag-sparkline.test.js). This file
 * holds what the expanded view adds: the window it passes on, the colour, the figure
 * above in the text colour, the highest measurement written above the bars.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { AgMetricDetail } from './ag-metric-detail.js';
import { readStylesheet, cssRuleBody, cssRules, mediaBlock, filesUnder, appSources } from '../../test-utils.js';

beforeAll(() => {
    // jsdom has no layout: the small chart sizes itself from a ResizeObserver.
    globalThis.ResizeObserver ??= class { observe() {} disconnect() {} };
});

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
    it('draws its history in bars, through the small chart, on the same window', async () => {
        const data = [1, 2, null, 5];
        const el = await mount({ data, slots: 30, color: 'var(--chart-cpu)' });
        const bars = el.querySelector('.detailed-chart-bars ag-sparkline');
        expect(bars, 'no bar chart').not.toBeNull();
        expect(bars.variant).toBe('bars');
        expect(bars.slots).toBe(30);
        expect(bars.data).toBe(data);            // the nulls with it: a gap, not a zero
        expect(bars.autoScale).toBe(true);       // from zero, as the System tiles
        expect(bars.lineColor).toBe('var(--chart-cpu)');
    });

    it('draws a lone first measurement: one bar, not an empty chart', async () => {
        const el = await mount({ data: [1.2], slots: 30 });
        const bars = el.querySelector('ag-sparkline');
        await bars.updateComplete;
        Object.assign(bars, { width: 100, height: 60 });
        await bars.updateComplete;
        expect(bars.querySelectorAll('rect.sparkline-bar')).toHaveLength(1);
        expect(el.innerHTML).not.toMatch(/NaN/);
    });

    it('writes its highest measurement above the bars, in the unit of the figure — the scale tops out 15 % higher', async () => {
        const el = await mount({ data: [1.5, 4.2, null, 2], slots: 5 });
        expect(el.querySelector('ag-sparkline').captionStart).toBe('max 4.2%');
    });

    it('writes its figure in the text colour: in a status colour it read 2.0 to 3.8:1 in the light themes', async () => {
        const el = await mount({ data: [1.5, 2.5], slots: 5, color: 'var(--chart-memory)' });
        const figure = el.querySelector('.detailed-chart-value');
        expect(figure.getAttribute('style')).toBeNull();   // services.css gives it --text-primary
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
        expect(el.querySelector('.detailed-chart')).toBeNull();
    });
});

describe('the header of an expanded chart', () => {
    const css = readStylesheet('css', 'services.css');

    it('sets label and figure on one line, the figure wrapping under rather than overlapping (2026-10-13)', () => {
        const body = cssRuleBody(css, '.detailed-chart-header');
        expect(body).toMatch(/flex-flow:\s*row wrap/);
        expect(body).toMatch(/justify-content:\s*space-between/);
    });

    it('is styled from one sheet: three copies once overrode one another (2026-10-14)', () => {
        // components/metrics.css stacked the label above the figure, components/sparkline.css
        // set it in a second grey, services.css — loaded last — won, partly: what showed was
        // a blend of the three, readable in none.
        const elsewhere = filesUnder('css', /\.css$/)
            .filter(file => file !== 'css/services.css')
            .flatMap(file => cssRules(readStylesheet(file))
                .flatMap(rule => rule.selectors)
                .filter(selector => selector.includes('.detailed-chart'))
                .map(selector => `${file}: ${selector}`));
        expect(elsewhere).toEqual([]);
    });

    it('has no rule in a component or a page either, where a copy would win the same way', () => {
        // A rule names the class right before its `{`; markup writes it without the dot,
        // a query between quotes. Comments are dropped: one names the class in prose.
        const RULE = /\.detailed-chart[\w-]*[^{};'"`<]*\{/;
        const uncommented = text => text
            .replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g, '')
            .replace(/(^|[^:])\/\/.*$/gm, '$1');
        const inCode = appSources().filter(file => RULE.test(uncommented(readStylesheet(file))));
        expect(inCode).toEqual([]);
    });

    it('states each of its rules once in that sheet', () => {
        // Outside a screen-size block, a second rule for the same selector is a copy again.
        const topLevel = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
        const selectors = cssRules(topLevel).flatMap(rule => rule.selectors)
            .filter(selector => selector.includes('.detailed-chart'));
        expect(selectors.length).toBeGreaterThan(0);
        expect(selectors.filter((s, i) => selectors.indexOf(s) !== i)).toEqual([]);
    });

    it('keeps the label above where two charts share the width, so a pair stays level', () => {
        // 97 to 123px each above 1200px: one figure fitted, its neighbour wrapped.
        const wide = mediaBlock(css, '(width > 1200px)');
        expect(wide, 'no rule above 1200px').toBeTruthy();
        expect(cssRuleBody(wide, '.expanded-metric-content.split .detailed-chart-header')).toMatch(/flex-direction:\s*column/);
        expect(cssRuleBody(css, '.expanded-metric-content.split')).toMatch(/grid-template-columns:\s*1fr 1fr/);
        expect(cssRuleBody(mediaBlock(css, '(width <= 1200px)'), '.expanded-metric-content.split')).toMatch(/grid-template-columns:\s*1fr;/);
    });
});
