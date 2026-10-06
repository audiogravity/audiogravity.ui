/**
 * Tests for the top bar's machine metrics, and for this device's "Top Bar
 * Metrics" setting that hides them.
 *
 * The real component on the real bus (common.js), readings delivered the way the
 * stream delivers them (sse.js's handleWorkerMessage). The setting promises two
 * things — the figures are not shown, and the bar no longer handles them — and the
 * bar is what keeps or breaks both. The figures still reach the browser while hidden:
 * they travel on the stream that carries every live update, and the System and
 * Performance tabs read them. Switched back on, the bar shows the last reading of the
 * stream now open, and asks the core nothing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Partial: common.js calls initAuth as it loads, so the real module must stay.
vi.mock(import('../../auth.js'), async (importOriginal) => ({
    ...(await importOriginal()),
    // common.js gates its own module load on this and throws otherwise.
    requireAuth: () => true,
}));

import { AppState, EventEmitter } from '../../common.js';
import { handleWorkerMessage, updateConnectionStatus, updateSystemMetrics } from '../../sse.js';
import { readStylesheet, cssRuleBody, mediaBlock } from '../../test-utils.js';
import './ag-top-bar.js';

const READING = { uptime: 7200, cpu_percent: 12.5, cpu_temp: 45.2, memory_percent: 35.8 };
const LATER = { uptime: 7300, cpu_percent: 3.2, cpu_temp: 41.0, memory_percent: 36.1 };

/** Mount a bar in the document, as the app does. */
async function mount() {
    const el = document.createElement('ag-top-bar');
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
}

/** The figures as the bar shows them — none when it shows none. */
function figures(el) {
    return [...el.querySelectorAll('.system-metrics .metric-value')].map(v => v.textContent.trim());
}

/** How many handlers the bus holds for an event. */
function handlers(event) {
    return (EventEmitter.events[event] || []).length;
}

/** Tell the bar what the Settings switch says, the way the panel does. */
async function setting(el, enabled) {
    window.dispatchEvent(new CustomEvent('topbar-metrics-changed', { detail: { enabled } }));
    await el.updateComplete;
}

/**
 * A reading arriving on the stream. sse.js hands on one per second at most: the
 * clock is moved past that, so the next one is not dropped.
 */
async function streamed(el, data) {
    handleWorkerMessage({ data: { type: 'sysinfo', data: { ...data } } });
    vi.advanceTimersByTime(1000);
    await el.updateComplete;
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    AppState.topBarMetrics = true;
    // No stream open yet: nothing kept from another test.
    updateConnectionStatus(false);
});

afterEach(() => {
    document.body.innerHTML = '';
    AppState.topBarMetrics = true;
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('ag-top-bar — machine metrics', () => {
    it('shows the four figures of a reading', async () => {
        const el = await mount();
        await streamed(el, READING);

        const [uptime, cpu, temp, memory] = figures(el);
        expect(uptime).not.toBe('--');
        expect([cpu, temp, memory]).toEqual(['12.5%', '45.2°C', '35.8%']);
    });

    it('does not show an unknown temperature as a hot one', async () => {
        // Before the first reading — and for good on a machine with no sensor —
        // the temperature is unknown: a dash, not the red glow of a critical one.
        const el = await mount();
        const temp = el.querySelectorAll('.system-metrics .metric-value')[2];

        expect(temp.textContent.trim()).toBe('--°C');
        expect(temp.classList.contains('activity-high')).toBe(false);
    });

    it('gives no colour to any figure it does not know', async () => {
        const el = await mount();
        await streamed(el, { uptime: 60, cpu_percent: null, memory_percent: null, cpu_temp: null });

        const bands = [...el.querySelectorAll('.system-metrics .metric-value')]
            .map(v => [...v.classList].filter(c => c.startsWith('activity-')));
        expect(bands).toEqual([[], [], [], []]);
    });

    it('colours each figure by its own bands', async () => {
        // Values chosen where the bands differ: CPU from 50 % and 80 %, temperature
        // from 60 °C and 75 °C, memory from 60 % and 85 %. Read with another figure's
        // bands, each would change colour.
        const el = await mount();
        await streamed(el, { cpu_percent: 82, cpu_temp: 55, memory_percent: 82 });

        const [, cpu, temp, memory] = el.querySelectorAll('.system-metrics .metric-value');
        expect([cpu, temp, memory].map(v => [...v.classList].find(c => c.startsWith('activity-'))))
            .toEqual(['activity-high', 'activity-low', 'activity-medium']);
    });

    it('names each figure, in words short enough for a phone', async () => {
        // A narrow screen hid the names, which left numbers no one could name.
        const el = await mount();
        const labels = [...el.querySelectorAll('.system-metrics .metric-label')].map(l => l.textContent.trim());
        expect(labels).toEqual(['Uptime', 'CPU', 'Temp', 'RAM']);
        expect(el.querySelector('.system-metrics .metric').classList.contains('metric--uptime')).toBe(true);
    });
});

describe('ag-top-bar — how the figures read (layout.css)', () => {
    const CSS = readStylesheet('css', 'layout.css');


    it('gives a figure in its normal range no colour — it comes past a threshold', () => {
        // Green on all three figures all the time told nothing (user's choice, 2026-10-04).
        const low = cssRuleBody(CSS, '.topbar .metric-value.activity-low');
        expect(low).toMatch(/color:\s*var\(--text-primary\)/);
        expect(low).not.toMatch(/background/);
        // Nor does the chip every figure carries: orange and red bring their own.
        expect(cssRuleBody(CSS, '.topbar .topbar-value')).not.toMatch(/background/);
    });

    it('lays each name on its figure\'s line, not centred against it', () => {
        // Centred, the smaller name sat 2px above its figure; its card margin from
        // components/metrics.css lifted it too (measured in Chromium, 2026-10-06).
        expect(cssRuleBody(CSS, '.metric')).toMatch(/align-items:\s*baseline/);
        expect(cssRuleBody(CSS, '.topbar .system-metrics .metric-label')).toMatch(/margin:\s*0/);
        // Only the stacked phone layout centres a figure, under its name.
        const phone = mediaBlock(CSS, /@media\s*\(width\s*<\s*430px\)/);
        expect(CSS.replace(phone, '')).not.toMatch(/\.metric\s*\{[^}]*align-items:\s*center/);
    });

    it('puts the same space between every name and its figure, the uptime included', async () => {
        // The chip's padding sat on the three banded figures only: 10px from their
        // names, 4px for the uptime's.
        const el = await mount();
        expect(figures(el)).toHaveLength(4);
        for (const figure of el.querySelectorAll('.system-metrics .metric-value')) {
            expect(figure.classList.contains('topbar-value')).toBe(true);
        }
        expect(cssRuleBody(CSS, '.topbar .topbar-value')).toMatch(/padding:\s*2px var\(--spacing-xs\)/);
        expect(cssRuleBody(CSS, '.metric')).toMatch(/gap:\s*var\(--spacing-xs\)/);
        // At every inline width: a small-phone block had cut it to 2px.
        const phone = mediaBlock(CSS, /@media\s*\(width\s*<\s*430px\)/);
        const gaps = [...CSS.replace(phone, '').matchAll(/(?:^|[\s}])\.metric\s*\{([^}]*)\}/g)]
            .filter(([, body]) => /gap:/.test(body));
        expect(gaps).toHaveLength(1);
    });

    it('keeps two pairs further apart than a name from its figure, at every inline width', () => {
        // 8px inside a pair, 16px between two: the phone and tablet blocks had cut
        // the second to 8 and 10px, so a figure read with the next name.
        expect(cssRuleBody(CSS, '.system-metrics')).toMatch(/gap:\s*var\(--spacing-md\)/);
        const phone = mediaBlock(CSS, /@media\s*\(width\s*<\s*430px\)/);
        const inline = CSS.replace(phone, '');
        expect(inline.match(/(^|[\s}])\.system-metrics\s*\{/g)).toHaveLength(1);
    });

    it('keeps the stacked phone layout\'s spacing', () => {
        const phone = mediaBlock(CSS, /@media\s*\(width\s*<\s*430px\)/);
        expect(cssRuleBody(phone, '.system-metrics')).toMatch(/gap:\s*var\(--spacing-xs\)/);
        expect(cssRuleBody(phone, '.topbar .system-metrics .topbar-value')).toMatch(/padding-inline:\s*var\(--spacing-sm\)/);
    });

    it('reads each name inline on a computer: "CPU: 12%"', () => {
        expect(cssRuleBody(CSS, '.topbar .system-metrics .metric-label::after')).toMatch(/content:\s*':'/);
    });

    it('puts each name over its figure on a phone under 430px, without the colon', () => {
        // Inline, the three figures take 246px of the 246 to 252px a 375 or 390px
        // phone leaves between the menu and the buttons (measured, 2026-10-04).
        const phone = mediaBlock(CSS, /@media\s*\(width\s*<\s*430px\)/);
        expect(cssRuleBody(phone, '.system-metrics .metric')).toMatch(/flex-direction:\s*column/);
        expect(cssRuleBody(phone, '.topbar .system-metrics .metric-label::after')).toMatch(/content:\s*none/);
        expect(cssRuleBody(phone, '.system-metrics .metric-label')).not.toMatch(/display:\s*none/);
    });

    it('reads them inline wherever there is room: a large phone, a tablet, a computer', () => {
        // Measured in Chromium (2026-10-04), the menu shown and the widest figures:
        // from 430px, 11px to spare each side; from 481px, where the dot comes back,
        // 27px; from 769px, where the words come back as well, 68px. With the pairs
        // evened out (2026-10-06), 3.8px at 430px — three figures at 100 — then 24px
        // from 481px and 81px from 769px.
        const phone = mediaBlock(CSS, /@media\s*\(width\s*<\s*430px\)/);
        const elsewhere = CSS.replace(phone, '');
        expect(elsewhere).not.toMatch(/\.metric\s*\{[^}]*flex-direction:\s*column/);
        expect(elsewhere).not.toMatch(/metric-label[^{]*\{[^}]*display:\s*none/);
    });

    it('keeps the dot without its words on a phone layout, and neither under 481px', () => {
        // With the words, "Connecting..." sat on "CPU:" from 481 to 520px and squeezed
        // the menu button to 8px (measured, 2026-10-04).
        const phone = mediaBlock(CSS, /@media\s*\(width\s*<=\s*768px\)/);
        expect(cssRuleBody(phone, '.connection-status > span')).toMatch(/display:\s*none/);
        const small = mediaBlock(CSS, /@media\s*\(width\s*<=\s*480px\)/);
        expect(cssRuleBody(small, '.connection-status span')).toMatch(/display:\s*none/);
    });

    it('keeps on a phone the three figures that can call for attention', () => {
        const phone = mediaBlock(CSS, /@media\s*\(width\s*<=\s*768px\)/);
        expect(cssRuleBody(phone, '.system-metrics .metric--uptime')).toMatch(/display:\s*none/);
    });
});

describe('ag-top-bar — the "Top Bar Metrics" setting', () => {
    it('shows nothing on a device where it is off, and handles no reading', async () => {
        AppState.topBarMetrics = false;
        const before = handlers('sysinfo-update');
        const el = await mount();

        expect(figures(el)).toEqual([]);
        expect(handlers('sysinfo-update')).toBe(before);

        await streamed(el, READING);
        expect(el.metrics.cpu_percent).toBeUndefined();
        expect(figures(el)).toEqual([]);
    });

    it('keeps the middle of the bar, so its buttons stay at the right-hand end', async () => {
        AppState.topBarMetrics = false;
        const el = await mount();

        const middle = el.querySelector('.topbar > .system-metrics');
        expect(middle).not.toBeNull();
        expect(middle.nextElementSibling.querySelector('[aria-label="Open Library"]')).not.toBeNull();
    });

    it('hides the figures and stops handling readings when switched off', async () => {
        const before = handlers('sysinfo-update');
        const el = await mount();
        expect(handlers('sysinfo-update')).toBe(before + 1);
        await streamed(el, READING);

        await setting(el, false);

        expect(figures(el)).toEqual([]);
        expect(handlers('sysinfo-update')).toBe(before);
        await streamed(el, LATER);
        expect(el.metrics.cpu_percent).toBe(READING.cpu_percent);
    });

    it('shows the last reading of the stream at once when switched back on, and asks the core nothing', async () => {
        // /sysinfo/current answers a partial reading, and a CPU figure measured over
        // the few milliseconds since the stream's last one: the bar asks it nothing.
        const fetch = vi.fn();
        vi.stubGlobal('fetch', fetch);
        const el = await mount();
        await streamed(el, READING);
        await setting(el, false);
        await streamed(el, LATER);          // arrives while the bar does not listen

        await setting(el, true);

        expect(figures(el).slice(1)).toEqual(['3.2%', '41.0°C', '36.1%']);
        expect(fetch).not.toHaveBeenCalled();
    });

    it('never shows a figure from before it was switched off', async () => {
        // The last reading may lack a figure: its place stays a dash, not the old value.
        const el = await mount();
        await streamed(el, READING);
        await setting(el, false);
        await streamed(el, { uptime: 7400, cpu_percent: 7.5 });

        await setting(el, true);

        expect(figures(el).slice(1)).toEqual(['7.5%', '--°C', '--%']);
    });

    it('shows dashes, not old figures, when the stream closed in between', async () => {
        // Back from hours in the background, before the reopened stream's first
        // reading: the kept one would pass hours-old figures off as current.
        const el = await mount();
        await streamed(el, READING);
        await setting(el, false);
        updateConnectionStatus(false);

        await setting(el, true);

        expect(figures(el).slice(1)).toEqual(['--%', '--°C', '--%']);
    });

    it('keeps nothing of the core\'s own answer, only the stream\'s readings', async () => {
        // The answer to /sysinfo/current, asked at start, is partial and its CPU
        // figure covers a few milliseconds.
        const el = await mount();
        await setting(el, false);
        updateSystemMetrics({ uptime: 10, cpu_percent: 100, memory_percent: 30 });

        await setting(el, true);

        expect(figures(el).slice(1)).toEqual(['--%', '--°C', '--%']);
    });

    it('keeps the reading as sent, whatever a view does to the one it is handed', async () => {
        const meddler = (data) => { data.cpu_percent = 99; };
        EventEmitter.on('sysinfo-update', meddler);
        const el = await mount();
        await setting(el, false);
        await streamed(el, READING);
        EventEmitter.off('sysinfo-update', meddler);

        await setting(el, true);

        expect(figures(el)[1]).toBe('12.5%');
    });

    it('does the same when the property itself is switched, not only the setting', async () => {
        const el = await mount();
        await streamed(el, READING);
        el.showMetrics = false;
        await el.updateComplete;
        await streamed(el, LATER);

        el.showMetrics = true;
        await el.updateComplete;

        expect(figures(el).slice(1)).toEqual(['3.2%', '41.0°C', '36.1%']);
    });

    it('keeps the figures it is given before its first render', async () => {
        // As the stories do: a first render is no switching back on.
        const el = document.createElement('ag-top-bar');
        el.metrics = { uptime: 3600, cpu_percent: 12.5, temp: 45.2, memory_percent: 35.8 };
        document.body.appendChild(el);
        await el.updateComplete;

        expect(figures(el).slice(1)).toEqual(['12.5%', '45.2°C', '35.8%']);
    });

    it('takes no order from an attribute: a Boolean attribute is true whatever it says', async () => {
        AppState.topBarMetrics = false;
        const el = await mount();

        el.setAttribute('showmetrics', 'false');
        await el.updateComplete;

        expect(el.showMetrics).toBe(false);
        expect(figures(el)).toEqual([]);
    });

    it('hands the other views nothing extra when switched back on', async () => {
        // The System tab counts every reading it is handed as a point of its charts.
        const el = await mount();
        await streamed(el, READING);
        await setting(el, false);
        const handed = vi.fn();
        EventEmitter.on('sysinfo-update', handed);

        await setting(el, true);

        EventEmitter.off('sysinfo-update', handed);
        expect(handed).not.toHaveBeenCalled();
    });

    it('follows the readings again once switched back on', async () => {
        const el = await mount();
        await setting(el, false);
        await setting(el, true);

        await streamed(el, LATER);

        expect(figures(el).slice(1)).toEqual(['3.2%', '41.0°C', '36.1%']);
    });

    it('listens once, however often the same value is applied', async () => {
        const before = handlers('sysinfo-update');
        const el = await mount();

        await setting(el, true);
        await setting(el, true);
        expect(handlers('sysinfo-update')).toBe(before + 1);

        await setting(el, false);
        await setting(el, false);
        expect(handlers('sysinfo-update')).toBe(before);
    });

    it('leaves nothing listening once removed', async () => {
        const before = ['sysinfo-update', 'connection-status'].map(handlers);
        const el = await mount();

        el.remove();

        expect(['sysinfo-update', 'connection-status'].map(handlers)).toEqual(before);
        await setting(el, false);
        expect(el.showMetrics).toBe(true);
    });
});
