/**
 * Unit tests for ag-services-page.js — the note shown when the box measures no memory.
 *
 * A kernel booted without the memory controller reports nothing, so every card
 * shows a dash where a figure belongs. Dashes alone are honest but mute: the
 * page says once why they are there, and offers the way out, which lives in the
 * manual (a kernel command line and a reboot, not a setting in the app).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
vi.mock('../../utils.js', () => ({ logger: { debug: vi.fn(), error: vi.fn() } }));
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
