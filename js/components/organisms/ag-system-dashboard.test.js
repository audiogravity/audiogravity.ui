/**
 * Unit tests for ag-system-dashboard.js — the time a System chart covers.
 *
 * The core sends machine metrics at an adaptive rate (2 s while something is
 * active, 10 s by default, 30 s at rest), so sixty bars can be two minutes or
 * thirty. The duration printed over the bars is therefore measured from the
 * updates' arrival, and must follow the window as it slides.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

// Only the history code is under test: the app shell (auth, fetch, context,
// sibling components) stays out, as in ag-services-page.test.js.
vi.mock('lit', () => ({
    LitElement: class { connectedCallback() {} disconnectedCallback() {} },
    html: (strings, ...values) => ({ strings, values }),
}));
vi.mock('lit/directives/class-map.js', () => ({ classMap: () => '' }));
vi.mock('@lit/context', () => ({ ContextConsumer: class {} }));
vi.mock('../../core/app-context.js', () => ({ appContext: {} }));
vi.mock('../../common.js', () => ({
    AppState: { currentTab: '' },
    EventEmitter: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
}));
vi.mock('../../core/FetchController.js', () => ({ FetchController: class {} }));
vi.mock('../../utils.js', () => ({ formatUptime: () => '' }));
vi.mock('../../ag-icons.js', () => ({ iconInfo: '', iconConnection: '', iconMusicNote: '' }));
vi.mock('../molecules/ag-audio-card.js', () => ({}));
vi.mock('./ag-card-grid.js', () => ({}));
vi.mock('../molecules/ag-network-card.js', () => ({}));
vi.mock('../molecules/ag-system-info.js', () => ({}));
vi.mock('../molecules/ag-system-tile.js', () => ({}));

import { AgSystemDashboard } from './ag-system-dashboard.js';

/** A dashboard with only what the history code reads, no DOM, no fetch. */
function dashboard() {
    const el = Object.create(AgSystemDashboard.prototype);
    el._historyStore = { cpu: [], memory: [], temperature: [], network: [], disk: [] };
    el._historyTimes = [];
    el.MAX_HISTORY = 60;
    el.lastNetworkStats = { sent: 0, recv: 0, timestamp: 0 };
    el.metrics = { load_avg: [0, 0, 0] };
    return el;
}

afterEach(() => { vi.useRealTimers(); });

describe('the span of a chart', () => {
    it('is zero below two measurements', () => {
        const el = dashboard();
        expect(el._spanOf('cpu')).toBe(0);
    });

    it('runs from the oldest held measurement to the newest, whatever the rate', () => {
        vi.useFakeTimers();
        const el = dashboard();
        const start = Date.now();
        for (const step of [0, 2000, 2000, 30000]) {   // fast, fast, then at rest
            vi.setSystemTime(Date.now() + step);
            el._handleSysinfoUpdate({ cpu_percent: 10 });
        }
        expect(el._spanOf('cpu')).toBe(Date.now() - start);
        expect(el._spanOf('cpu')).toBe(34000);
    });

    it('slides with the window once it is full', () => {
        vi.useFakeTimers();
        const el = dashboard();
        el.MAX_HISTORY = 3;
        for (let i = 0; i < 5; i++) {
            vi.setSystemTime(1_000_000 + i * 10000);
            el._handleSysinfoUpdate({ cpu_percent: i });
        }
        expect(el._historyTimes).toHaveLength(3);
        expect(el._spanOf('cpu')).toBe(20000);
    });

    it('starts the network series with a gap, not a zero', () => {
        // The rate needs two readings; the first update has none to give.
        vi.useFakeTimers();
        const el = dashboard();
        for (let i = 0; i < 3; i++) {
            vi.setSystemTime(2_000_000 + i * 10000);
            el._handleSysinfoUpdate({ cpu_percent: 5, network_bytes_sent: i * 1024, network_bytes_recv: i * 1024 });
        }
        expect(el._historyStore.network[0]).toBeNull();
        expect(el._historyStore.network.slice(1).every(v => v > 0)).toBe(true);
        expect(el._spanOf('network')).toBe(20000);
    });
});

describe('only what an update measured enters a chart', () => {
    it('adds nothing for an update that carries no charted metric', () => {
        // sse.js emits {uptime} on its own; it used to add a sample to every chart,
        // copied from the previous one — or the constructor's zeros.
        const el = dashboard();
        el._handleSysinfoUpdate({ uptime: 1234 });
        expect(el._historyStore.cpu).toEqual([]);
        expect(el._historyTimes).toEqual([]);
    });

    it('keeps a metric the update did not carry as a gap, not the last value', () => {
        const el = dashboard();
        el._handleSysinfoUpdate({ cpu_percent: 10, memory_percent: 40 });
        el._handleSysinfoUpdate({ cpu_percent: 12 });
        expect(el._historyStore.cpu).toEqual([10, 12]);
        expect(el._historyStore.memory).toEqual([40, null]);
    });

    it('draws no temperature on a machine without a sensor', () => {
        // Its absence was a 0 from the constructor, sixty times: "max 0.0 °C".
        const el = dashboard();
        el._handleSysinfoUpdate({ cpu_percent: 10 });
        el._handleSysinfoUpdate({ cpu_percent: 11, cpu_temp: null });
        expect(el._historyStore.temperature).toEqual([null, null]);
    });

    it('takes a reading of 0 as a reading', () => {
        const el = dashboard();
        el._handleSysinfoUpdate({ cpu_percent: 0, temperature: 0 });
        expect(el._historyStore.cpu).toEqual([0]);
        expect(el._historyStore.temperature).toEqual([0]);
    });
});

describe('a pause in the stream', () => {
    it('opens a gap in every chart', () => {
        // The stream is closed while the app is hidden (sse.js). Resumed samples
        // drawn right after the old ones read as one continuous series.
        vi.useFakeTimers();
        const el = dashboard();
        vi.setSystemTime(3_000_000);
        el._handleSysinfoUpdate({ cpu_percent: 10 });
        vi.setSystemTime(3_000_000 + 3_600_000);
        el._handleSysinfoUpdate({ cpu_percent: 20 });
        expect(el._historyStore.cpu).toEqual([10, null, 20]);
        expect(el._historyTimes).toHaveLength(3);
    });

    it('opens none at the core slowest rate', () => {
        vi.useFakeTimers();
        const el = dashboard();
        vi.setSystemTime(4_000_000);
        el._handleSysinfoUpdate({ cpu_percent: 10 });
        vi.setSystemTime(4_000_000 + 30_000);
        el._handleSysinfoUpdate({ cpu_percent: 20 });
        expect(el._historyStore.cpu).toEqual([10, 20]);
    });

    it('gives no network rate across it, which would average the whole silence', () => {
        vi.useFakeTimers();
        const el = dashboard();
        vi.setSystemTime(5_000_000);
        el._handleSysinfoUpdate({ cpu_percent: 1, network_bytes_sent: 0, network_bytes_recv: 0 });
        vi.setSystemTime(5_000_000 + 3_600_000);
        el._handleSysinfoUpdate({ cpu_percent: 1, network_bytes_sent: 9e9, network_bytes_recv: 9e9 });
        expect(el._historyStore.network).toEqual([null, null, null]);
    });
});
