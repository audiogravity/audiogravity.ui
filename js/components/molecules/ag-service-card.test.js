/**
 * Unit tests for ag-service-card.js — what a card says when a figure was never measured.
 *
 * Three of the numbers come from counters that can be off: memory (the kernel's,
 * on a Raspberry Pi), disk and network (the unit's, a checkbox in the Systemd
 * tab). The card shows a dash for those, because printing 0 under a flat graph
 * is what an idle service looks like — a claim, not a gap.
 *
 * The traps these tests exist for are the places the zero crept back in: the
 * tooltips, which format their own copy of the values through a helper that
 * answers "0.0 MB/s" for anything that is not a number, and the expanded charts,
 * which are opened by "Toggle all metrics" without asking whether there is
 * anything to draw.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class {},
    html: (strings, ...values) => ({ strings, values }),
    nothing: Symbol('nothing'),
}));
vi.mock('lit/directives/class-map.js', () => ({ classMap: () => '' }));
// Every icon the card imports, whatever its name: the module is a flat bag of
// SVG strings, and listing them by hand only dates the test.
vi.mock('../../ag-icons.js', () => ({
    __esModule: true,
    ...Object.fromEntries(
        ['iconPower', 'iconRefresh', 'iconTrash', 'iconArrowUp', 'iconArrowDown',
         'iconFileText', 'iconPencil', 'iconPlay', 'iconStop', 'iconSettings',
         'iconInfo', 'iconCheck', 'iconAlert', 'iconClock', 'iconCpu',
         'iconActivity', 'iconChevronDown', 'iconChevronRight', 'iconLock',
         'iconExternalLink', 'iconZap', 'iconDatabase', 'iconServer',
        ].map(name => [name, '']),
    ),
}));
vi.mock('../utils-lit.js', () => ({
    formatRate: (rate) => (typeof rate !== 'number' ? '0.0 MB/s' : `${rate.toFixed(1)} MB/s`),
    formatTimestamp: () => '',
    getActivityLevel: () => 'low',
    getActivityLevelForCPU: () => 'low',
    getActivityLevelForMemory: () => 'low',
    getActivityLevelForRate: () => 'low',
}));
vi.mock('../atoms/ag-sparkline.js', () => ({}));
vi.mock('../atoms/ag-status-indicator.js', () => ({}));
vi.mock('../atoms/ag-metric-detail.js', () => ({}));

import { AgServiceCard } from './ag-service-card.js';
import { flat } from '../../test-utils.js';


const NOTHING_MEASURED = {
    cpu_percent: 1.5,
    memory_mb: null,
    tasks: 4,
    io_read_rate: null,
    io_write_rate: null,
    network_rx_rate: null,
    network_tx_rate: null,
};

const ALL_MEASURED = {
    cpu_percent: 1.5,
    memory_mb: 42,
    tasks: 4,
    io_read_rate: 2,
    io_write_rate: 1,
    network_rx_rate: 3,
    network_tx_rate: 1,
};

function card(metrics, { expanded = false } = {}) {
    const el = Object.create(AgServiceCard.prototype);
    el.service = { id: 'mpd', name: 'mpd', display_name: 'MPD', state: 'active' };
    el.metrics = metrics;
    el.history = { cpu: [], mem: [], net: [], netRx: [], netTx: [], disk: [], diskRead: [], diskWrite: [] };
    el.expandedMetrics = { cpu: expanded, mem: expanded, net: expanded, disk: expanded };
    el._pending = false;
    return el;
}

describe('a figure nobody measured', () => {
    it('is a dash on the tile', () => {
        const out = flat(card(NOTHING_MEASURED).render());
        expect(out).toContain('—');
        expect(out).not.toContain('0 MB');
    });

    it('is a dash in the tooltip too, where a zero used to creep back in', () => {
        // The tooltips format their own copy of the values; the shared helper
        // answers '0.0 MB/s' for a null, so an unguarded one said "idle".
        const out = flat(card(NOTHING_MEASURED).render());
        expect(out).not.toContain('0.0 MB/s');
    });

    it('draws no sparkline for it — while CPU keeps its own', () => {
        const out = flat(card(NOTHING_MEASURED).render());
        expect(out.match(/ag-sparkline/g)?.length).toBe(2);   // one CPU sparkline: open + close
    });

    it('opens no expanded chart for it, even when everything is expanded', () => {
        // "Toggle all metrics" expands unconditionally; a flat zero graph under a
        // tile that says the figure is not measured contradicts it.
        // Matched on the section marker, not the heading: "Network Activity" and
        // "Disk I/O" are also the tooltip titles on the tiles themselves.
        const out = flat(card(NOTHING_MEASURED, { expanded: true }).render());
        expect(out).toContain('data-expanded="cpu"');   // CPU is measured, it expands
        expect(out).not.toContain('data-expanded="mem"');
        expect(out).not.toContain('data-expanded="net"');
        expect(out).not.toContain('data-expanded="disk"');
    });
});

describe('a figure that was measured', () => {
    it('is printed, with its sparkline', () => {
        const out = flat(card(ALL_MEASURED).render());
        expect(out).toContain('42 MB');
        expect(out).toContain('ag-sparkline');
    });

    it('still expands', () => {
        const out = flat(card(ALL_MEASURED, { expanded: true }).render());
        expect(out).toContain('data-expanded="mem"');
        expect(out).toContain('data-expanded="net"');
        expect(out).toContain('data-expanded="disk"');
    });

    it('keeps a genuine zero as a zero — an idle service reads nothing', () => {
        const idle = { ...ALL_MEASURED, io_read_rate: 0, io_write_rate: 0 };
        const out = flat(card(idle).render());
        expect(out).toContain('0.0 MB/s');
    });
});
