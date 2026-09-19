/**
 * Unit tests for ag-services-page.js — the note shown when the box measures no memory.
 *
 * A kernel booted without the memory controller reports nothing, so every card
 * shows a dash where a figure belongs. Dashes alone are honest but mute: the
 * page says once why they are there, and offers the way out, which lives in the
 * manual (a kernel command line and a reboot, not a setting in the app).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('lit', () => ({
    // connectedCallback/disconnectedCallback are stubbed on the base class so a
    // test can subscribe the page for real and exercise the SSE handlers it
    // registers there — the wiring, not just the methods it calls.
    LitElement: class { connectedCallback() {} disconnectedCallback() {} },
    html: (strings, ...values) => ({ strings, values }),
    nothing: Symbol('nothing'),
}));
vi.mock('@lit/context', () => ({ ContextConsumer: class {} }));
vi.mock('../../api.js', () => ({ apiGet: vi.fn(), apiPost: vi.fn() }));
vi.mock('../../ag-icons.js', () => ({ iconMinimize: '', iconMaximize: '' }));
vi.mock('../../ui-helpers.js', () => ({
    showToast: vi.fn(), showConfirm: vi.fn(), handleError: vi.fn(),
}));
vi.mock('../../common.js', () => ({
    AppState: { currentTab: '' },
    EventEmitter: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
}));
vi.mock('../../history.js', () => ({ addToHistory: vi.fn() }));
vi.mock('../../core/FetchController.js', () => ({ FetchController: class {} }));
vi.mock('../../core/app-context.js', () => ({ appContext: {} }));
vi.mock('../../utils.js', () => ({ logger: { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() } }));
vi.mock('../atoms/ag-filter-bar.js', () => ({}));
vi.mock('../atoms/ag-health-bar.js', () => ({}));
vi.mock('../molecules/ag-service-detail-modal.js', () => ({}));
vi.mock('./ag-card-grid.js', () => ({}));
vi.mock('../molecules/ag-service-card.js', () => ({}));

import { AgServicesPage } from './ag-services-page.js';
import { EventEmitter } from '../../common.js';
import { flat } from '../../test-utils.js';


function page(memoryUnavailable) {
    const el = Object.create(AgServicesPage.prototype);
    el.services = [];
    el._filter = 'all';
    el._detailService = null;
    el._memoryUnavailable = memoryUnavailable;
    el._accountingOff = false;
    el._renderToggleIcon = () => '';
    el.servicesFetch = { loading: false, error: null, data: [] };
    return el;
}

function pageWith({ memory = false, accounting = false } = {}) {
    const el = page(memory);
    el._accountingOff = accounting;
    return el;
}

describe('when the box counts no memory', () => {
    it('says so once, and offers the way out', () => {
        const out = flat(page(true).render());
        expect(out).toContain('Memory is not measured on this box');
        expect(out).toContain('How to turn it on');
    });

    it('stays silent when the counter works', () => {
        expect(flat(page(false).render())).not.toContain('Memory is not measured');
    });

    it('points at the Systemd tab when a service has its accounting off', () => {
        // Disk and network go missing per service, and the remedy is a checkbox
        // in the app — not the kernel command line the memory case needs.
        const out = flat(pageWith({ accounting: true }).render());
        expect(out).toContain('Systemd');
        expect(out).toContain('not measured');
        expect(out).not.toContain('kernel was started');
    });

    it('says nothing at all when every figure is measured', () => {
        expect(flat(pageWith().render())).not.toContain('not measured');
    });

    it('stops saying it once the counter is turned on', () => {
        // Latched, the note kept accusing a box whose owner had just enabled the
        // counter and rebooted, until they reloaded the page by hand.
        const el = page(true);
        el._readMeasurementGaps({ memory_accounting: true, services: {} });
        expect(el._memoryUnavailable).toBe(false);
        expect(flat(el.render())).not.toContain('Memory is not measured');
    });

    it('reads a service with its accounting off from the event', () => {
        const el = page(false);
        el._readMeasurementGaps({
            memory_accounting: true,
            services: {
                mpd: { io_read_rate: 0, network_rx_rate: 0 },
                upmpdcli: { io_read_rate: null, network_rx_rate: null },
            },
        });
        expect(el._accountingOff).toBe(true);
    });

    it('says nothing when every service is measured', () => {
        const el = page(false);
        el._readMeasurementGaps({
            memory_accounting: true,
            services: { mpd: { io_read_rate: 0, network_rx_rate: 0.5 } },
        });
        expect(el._accountingOff).toBe(false);
        expect(flat(el.render())).not.toContain('not measured');
    });

    it('opens the manual at the chapter that explains it', () => {
        const open = vi.fn();
        vi.spyOn(document, 'getElementById').mockReturnValue({ open });
        try {
            page(true)._openMemoryHelp();
            expect(open).toHaveBeenCalledWith('09-troubleshooting');
        } finally {
            vi.restoreAllMocks();
        }
    });

    it('survives a page without the manual modal in the DOM', () => {
        vi.spyOn(document, 'getElementById').mockReturnValue(null);
        try {
            expect(() => page(true)._openMemoryHelp()).not.toThrow();
        } finally {
            vi.restoreAllMocks();
        }
    });
});


/**
 * A page subscribed for real, so the handlers it registers can be driven the
 * way the SSE layer drives them.
 */
function subscribedPage() {
    const el = Object.create(AgServicesPage.prototype);
    el.services = [{ id: 'mpd', systemd_unit: 'mpd.service', state: 'active' }];
    el._memoryUnavailable = false;
    el._accountingOff = false;
    el.updateComplete = Promise.resolve();
    el._loadServices = vi.fn();
    el._updateServiceMetrics = vi.fn();
    el.requestUpdate = vi.fn();
    // Bound in the constructor, which Object.create skips — reproduced here so
    // the page registers the same function the real one does.
    el._bindHandleServiceMetricsSSE = el._handleServiceMetricsSSE.bind(el);
    el.connectedCallback();
    return el;
}

/** The handler the page registered for one event name. */
function handlerFor(name) {
    const call = EventEmitter.on.mock.calls.find(c => c[0] === name);
    return call && call[1];
}

describe('the two metrics subscriptions do not overlap', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('reads the envelope for what only it carries', () => {
        const el = subscribedPage();

        handlerFor('services-metrics')({
            memory_accounting: false,
            services: { mpd: { state: 'active', cpu_percent: 5, memory_mb: null } },
        });

        expect(el._memoryUnavailable).toBe(true);
    });

    it('does not apply the figures a second time', () => {
        // Both subscriptions can reach _updateServiceMetrics for the same
        // service on the same cycle. No released build ever did — nothing
        // emitted `services-metrics` until it was revived — but from that point
        // on, every sample would enter the history twice: each sparkline drawing
        // each measurement doubled over a window covering half the time it
        // claims. The figures belong to the per-service path; the envelope is
        // read for the machine-wide fact alone.
        const el = subscribedPage();

        handlerFor('services-metrics')({
            memory_accounting: false,
            services: { mpd: { state: 'active', cpu_percent: 5, memory_mb: null } },
        });

        expect(el._updateServiceMetrics).not.toHaveBeenCalled();
    });

    it('still applies them once, on the per-service event', () => {
        const el = subscribedPage();

        handlerFor('service-metrics-sse')({
            serviceId: 'mpd',
            metrics: { state: 'active', cpu_percent: 5, memory_mb: null },
        });

        expect(el._updateServiceMetrics).toHaveBeenCalledTimes(1);
        expect(el._updateServiceMetrics).toHaveBeenCalledWith('mpd', expect.objectContaining({ cpu_percent: 5 }));
    });
});

/**
 * The history the Services charts are drawn from. Each chart places what it is
 * given on a fixed window from the right, so what this history holds is exactly
 * what the reader sees — an invented value here is an invented value on screen.
 */
describe('the chart history holds only what was measured', () => {
    // Clean up whatever a case left, even one that failed half-way.
    afterEach(() => { localStorage.clear(); vi.useRealTimers(); });

    function historyPage() {
        const el = Object.create(AgServicesPage.prototype);
        el.metricsHistory = {};
        el._lastSampleAt = {};
        el.services = [{ id: 'mpd', state: 'active' }];
        el._saveMetricsHistory = () => {};
        el.requestUpdate = () => {};
        return el;
    }

    it('starts empty, not with a window of zeros', () => {
        // Thirty zeros drew five to fifteen minutes of a flat line at zero ahead
        // of the first real measurement: the core reports every 10 s, 30 s at rest.
        const el = historyPage();
        el._initMetricsHistory('mpd');
        for (const series of Object.values(el.metricsHistory.mpd)) expect(series).toEqual([]);
    });

    it('keeps a measurement the service did not report as a gap, not a zero', () => {
        const el = historyPage();
        el._updateServiceMetrics('mpd', { state: 'active', cpu_percent: 1.5, memory_mb: 80 });
        el._updateServiceMetrics('mpd', { state: 'active', cpu_percent: 1.2, memory_mb: null });

        expect(el.metricsHistory.mpd.cpu).toEqual([1.5, 1.2]);
        expect(el.metricsHistory.mpd.mem).toEqual([80, null]);
    });

    it('keeps rates the machine does not count as gaps too', () => {
        // No IP or IO accounting: neither the rate nor its per-second fallback exists.
        const el = historyPage();
        el._updateServiceMetrics('mpd', { state: 'active', cpu_percent: 1 });

        expect(el.metricsHistory.mpd.netRx).toEqual([null]);
        expect(el.metricsHistory.mpd.diskWrite).toEqual([null]);
    });

    it('keeps only the series a card draws', () => {
        // Network and disk totals were computed, kept and saved, and read by nothing.
        const el = historyPage();
        el._initMetricsHistory('mpd');
        expect(Object.keys(el.metricsHistory.mpd).sort()).toEqual(['cpu', 'diskRead', 'diskWrite', 'mem', 'netRx', 'netTx']);
    });

    it('opens a gap after a pause in the stream', () => {
        // The stream stops while the app is hidden; resumed samples must not be drawn
        // against the old ones as if they were consecutive.
        vi.useFakeTimers();
        const el = historyPage();
        vi.setSystemTime(1_000_000);
        el._updateServiceMetrics('mpd', { state: 'active', cpu_percent: 1 });
        vi.setSystemTime(1_000_000 + 10_000);
        el._updateServiceMetrics('mpd', { state: 'active', cpu_percent: 2 });
        vi.setSystemTime(1_000_000 + 10_000 + 3_600_000);
        el._updateServiceMetrics('mpd', { state: 'active', cpu_percent: 3 });

        expect(el.metricsHistory.mpd.cpu).toEqual([1, 2, null, 3]);
    });

    it('opens no gap at the core slowest rate', () => {
        vi.useFakeTimers();
        const el = historyPage();
        vi.setSystemTime(2_000_000);
        el._updateServiceMetrics('mpd', { state: 'active', cpu_percent: 1 });
        vi.setSystemTime(2_000_000 + 30_000);
        el._updateServiceMetrics('mpd', { state: 'active', cpu_percent: 2 });

        expect(el.metricsHistory.mpd.cpu).toEqual([1, 2]);
    });

    it('holds no more than the chart window', () => {
        const el = historyPage();
        for (let i = 1; i <= 40; i++) el._updateServiceMetrics('mpd', { state: 'active', cpu_percent: i });

        expect(el.metricsHistory.mpd.cpu).toHaveLength(30);
        expect(el.metricsHistory.mpd.cpu[0]).toBe(11);
        expect(el.metricsHistory.mpd.cpu[29]).toBe(40);
    });

    it('hands the chart a new array at every measurement', () => {
        // The chart redraws only when given a different array. Pushed in place,
        // it kept showing whatever it held at its last redraw — measured in the
        // dev UI: two values held, the drawing made from none.
        const el = historyPage();
        el._updateServiceMetrics('mpd', { state: 'active', cpu_percent: 1 });
        const before = el.metricsHistory.mpd.cpu;
        el._updateServiceMetrics('mpd', { state: 'active', cpu_percent: 2 });

        expect(el.metricsHistory.mpd.cpu).not.toBe(before);
        expect(before).toEqual([1]);
    });

    it('drops the history saved before this change, which starts with the invented zeros', () => {
        localStorage.setItem('ag_metricsHistory', JSON.stringify({ mpd: { cpu: [0, 0, 0, 1.2] } }));
        localStorage.setItem('ag_metricsHistory_v2', JSON.stringify({ savedAt: 5, histories: { mpd: { cpu: [1.2, 1.3] } } }));
        const el = Object.create(AgServicesPage.prototype);

        expect(el._loadMetricsHistory()).toEqual({ mpd: { cpu: [1.2, 1.3] } });
        expect(localStorage.getItem('ag_metricsHistory')).toBeNull();
    });

    it('opens a gap between a restored history and the first new sample', () => {
        vi.useFakeTimers();
        vi.setSystemTime(10_000_000);
        localStorage.setItem('ag_metricsHistory_v2', JSON.stringify({ savedAt: 10_000_000 - 86_400_000, histories: { mpd: { cpu: [1.2, 1.3] } } }));
        const el = historyPage();
        el.metricsHistory = el._loadMetricsHistory();
        el._updateServiceMetrics('mpd', { state: 'active', cpu_percent: 2 });

        expect(el.metricsHistory.mpd.cpu).toEqual([1.2, 1.3, null, 2]);
    });

    it('is written within 30 s even while samples keep arriving', () => {
        // A debounce restarted by every sample never reached its delay: nothing was
        // saved while the tab was in use.
        vi.useFakeTimers();
        const el = historyPage();
        delete el._saveMetricsHistory;   // the real one
        el._saveTimer = null;
        for (let t = 0; t < 40_000; t += 2_000) {
            el._updateServiceMetrics('mpd', { state: 'active', cpu_percent: 1 });
            vi.advanceTimersByTime(2_000);
        }
        const saved = JSON.parse(localStorage.getItem('ag_metricsHistory_v2'));
        expect(saved.histories.mpd.cpu.length).toBeGreaterThan(0);
        expect(typeof saved.savedAt).toBe('number');
    });
});
