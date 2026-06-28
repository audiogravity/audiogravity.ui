/**
 * Unit tests for ag-upnp-renderer-card.js.
 *
 * Covers:
 * - _onStatusEvent(): SSE updates _status and syncs _known list
 * - _renderLocalRow(): active / idle states
 * - _renderRendererRow(): active / idle / reachable / reconnecting
 * - _renderScanSection(): empty / populated / filters out known renderers
 * - _activeUdn getter
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class { connectedCallback() {} },
    html: (strings, ...values) => ({ strings, values }),
    nothing: null,
}));
vi.mock('../../api.js', () => ({ apiGet: vi.fn(), apiPut: vi.fn(), apiPost: vi.fn(), apiDelete: vi.fn() }));
vi.mock('../../ag-icons.js', () => ({ iconWifi: '', iconCast: '', iconOutput: '' }));
vi.mock('../atoms/ag-status-indicator.js', () => ({}));
vi.mock('./ag-volume-popover.js', () => ({}));
vi.mock('../../library-store.js', () => ({ subscribeRendererStatus: vi.fn(() => vi.fn()) }));

import { AgUpnpRendererCard } from './ag-upnp-renderer-card.js';

/** Build a minimal AgUpnpRendererCard instance without mounting. */
function makeEl(overrides = {}) {
    const el = Object.create(AgUpnpRendererCard?.prototype ?? {});
    el._known      = [];
    el._status     = null;
    el._volume     = null;
    el._loading    = false;
    el._scanning   = false;
    el._discovered = null;
    el._switching  = null;
    Object.assign(el, overrides);
    return el;
}

/** Recursively stringify a Lit template tree. */
function str(tpl) {
    if (tpl == null) return '';
    if (Array.isArray(tpl)) return tpl.map(str).join('');
    if (typeof tpl !== 'object') return String(tpl);
    const parts = tpl.strings ?? [];
    const vals  = tpl.values ?? [];
    let out = '';
    parts.forEach((s, i) => { out += s; if (i < vals.length) out += str(vals[i]); });
    return out;
}

// ---------------------------------------------------------------------------
// _activeUdn
// ---------------------------------------------------------------------------

describe('AgUpnpRendererCard._activeUdn', () => {
    it('returns null when no renderer is active', () => {
        const el = makeEl({ _known: [{ udn: 'uuid:r1', active: false }] });
        expect(el._activeUdn).toBeNull();
    });

    it('returns the UDN of the active renderer', () => {
        const el = makeEl({ _known: [{ udn: 'uuid:r1', active: true }] });
        expect(el._activeUdn).toBe('uuid:r1');
    });

    it('returns null when _known is empty', () => {
        const el = makeEl({ _known: [] });
        expect(el._activeUdn).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// _onStatusEvent
// ---------------------------------------------------------------------------

describe('AgUpnpRendererCard._onStatusEvent()', () => {
    it('updates _status from SSE event', () => {
        const el = makeEl();
        el._onStatusEvent({ connected: true, transport_state: 'PLAYING', renderer_udn: 'uuid:r1', volume: 35 });
        expect(el._status.transport_state).toBe('PLAYING');
        expect(el._volume).toBe(35);
    });

    it('does not update _volume when volume is null in event', () => {
        const el = makeEl({ _volume: 50 });
        el._onStatusEvent({ connected: true, volume: null, renderer_udn: 'uuid:r1' });
        expect(el._volume).toBe(50);
    });

    it('ignores null payload', () => {
        const el = makeEl();
        expect(() => el._onStatusEvent(null)).not.toThrow();
    });

    it('syncs reachable in _known list', () => {
        const el = makeEl({ _known: [{ udn: 'uuid:r1', active: true, reachable: false }] });
        el._onStatusEvent({ renderer_udn: 'uuid:r1', connected: true, reachable: true, volume: null });
        expect(el._known[0].reachable).toBe(true);
    });

    it('clears active flag in _known when connected=false', () => {
        const el = makeEl({ _known: [{ udn: 'uuid:r1', active: true, reachable: true }] });
        el._onStatusEvent({ renderer_udn: 'uuid:r1', connected: false, reachable: false, volume: null });
        expect(el._known[0].active).toBe(false);
    });

    it('does not change other renderers reachable when connected=false', () => {
        const el = makeEl({ _known: [
            { udn: 'uuid:r1', active: true,  reachable: true },
            { udn: 'uuid:r2', active: false, reachable: false },
        ]});
        el._onStatusEvent({ renderer_udn: 'uuid:r1', connected: false, reachable: false, volume: null });
        expect(el._known[1].active).toBe(false);
        expect(el._known[1].reachable).toBe(false);
    });

    it('clears active on all other renderers when connected=true (prevents double-active)', () => {
        const el = makeEl({ _known: [
            { udn: 'uuid:r1', active: true,  reachable: true },
            { udn: 'uuid:r2', active: false, reachable: false },
        ]});
        // r2 becomes the active renderer
        el._onStatusEvent({ renderer_udn: 'uuid:r2', connected: true, reachable: true, volume: null });
        expect(el._known.find(r => r.udn === 'uuid:r2').active).toBe(true);
        // r1 must be deactivated, not left stale
        expect(el._known.find(r => r.udn === 'uuid:r1').active).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// _renderLocalRow
// ---------------------------------------------------------------------------

describe('AgUpnpRendererCard._renderLocalRow()', () => {
    it('shows Active indicator when Local DAC is the output', () => {
        const el = makeEl({ _known: [] }); // _activeUdn = null → local is active
        expect(str(el._renderLocalRow())).toContain('Active');
    });

    it('shows Idle indicator when a renderer is active', () => {
        const el = makeEl({ _known: [{ udn: 'uuid:r1', active: true, reachable: true }] });
        expect(str(el._renderLocalRow())).toContain('Idle');
    });

    it('shows Switching label while switching to local', () => {
        const el = makeEl({ _switching: 'local' });
        expect(str(el._renderLocalRow())).toContain('Switching');
    });

    it('shows Local DAC label', () => {
        const el = makeEl();
        expect(str(el._renderLocalRow())).toContain('Local DAC');
    });
});

// ---------------------------------------------------------------------------
// _renderRendererRow
// ---------------------------------------------------------------------------

describe('AgUpnpRendererCard._renderRendererRow()', () => {
    const baseRenderer = {
        udn: 'uuid:r1', friendly_name: 'music.#1',
        reachable: true, active: false,
    };

    it('shows renderer name', () => {
        const el = makeEl();
        expect(str(el._renderRendererRow(baseRenderer))).toContain('music.#1');
    });

    it('shows Active indicator when active and reachable', () => {
        const el = makeEl({ _status: { transport_state: 'PLAYING' } });
        const r = { ...baseRenderer, active: true, reachable: true };
        expect(str(el._renderRendererRow(r))).toContain('Active');
    });

    it('shows Reconnecting indicator when active but not reachable', () => {
        const el = makeEl();
        const r = { ...baseRenderer, active: true, reachable: false };
        expect(str(el._renderRendererRow(r))).toContain('Reconnecting');
    });

    it('shows Idle indicator when not active', () => {
        const el = makeEl();
        expect(str(el._renderRendererRow(baseRenderer))).toContain('Idle');
    });

    it('shows Disconnect button when active', () => {
        const el = makeEl({ _selectLocal: vi.fn() });
        const r = { ...baseRenderer, active: true, reachable: true };
        expect(str(el._renderRendererRow(r))).toContain('Disconnect');
    });

    it('does not show Disconnect button when idle', () => {
        const el = makeEl();
        expect(str(el._renderRendererRow(baseRenderer))).not.toContain('Disconnect');
    });

    it('shows volume popover when active and volume available', () => {
        const el = makeEl({ _volume: 42 });
        const r = { ...baseRenderer, active: true, reachable: true };
        expect(str(el._renderRendererRow(r))).toContain('ag-volume-popover');
    });

    it('does not show volume popover when volume is null', () => {
        const el = makeEl({ _volume: null, _status: null });
        const r = { ...baseRenderer, active: true, reachable: true };
        expect(str(el._renderRendererRow(r))).not.toContain('ag-volume-popover');
    });

    it('shows Switching label while switching', () => {
        const el = makeEl({ _switching: 'uuid:r1' });
        expect(str(el._renderRendererRow(baseRenderer))).toContain('Switching');
    });

    it('shows transport state description when active', () => {
        const el = makeEl({ _status: { transport_state: 'PLAYING' } });
        const r = { ...baseRenderer, active: true, reachable: true };
        expect(str(el._renderRendererRow(r))).toContain('playing');
    });
});

// ---------------------------------------------------------------------------
// _renderScanSection
// ---------------------------------------------------------------------------

describe('AgUpnpRendererCard._renderScanSection()', () => {
    it('shows Scan network button when not scanning', () => {
        const el = makeEl({ _scanning: false });
        expect(str(el._renderScanSection())).toContain('Scan network');
    });

    it('shows Scanning… while scanning', () => {
        const el = makeEl({ _scanning: true });
        expect(str(el._renderScanSection())).toContain('Scanning');
    });

    it('shows discovered renderers not in known list', () => {
        const el = makeEl({
            _known: [],
            _discovered: [{ udn: 'uuid:new', friendly_name: 'New Renderer', manufacturer: 'JF', model_name: 'UpMPD' }],
        });
        expect(str(el._renderScanSection())).toContain('New Renderer');
    });

    it('filters out renderers already in known list', () => {
        const el = makeEl({
            _known: [{ udn: 'uuid:r1' }],
            _discovered: [
                { udn: 'uuid:r1', friendly_name: 'Known Renderer' },
                { udn: 'uuid:r2', friendly_name: 'New Renderer' },
            ],
        });
        const out = str(el._renderScanSection());
        expect(out).not.toContain('Known Renderer');
        expect(out).toContain('New Renderer');
    });

    it('shows "No new renderer found" when all discovered are already known', () => {
        const el = makeEl({
            _known:      [{ udn: 'uuid:r1', friendly_name: 'R1' }],
            _discovered: [{ udn: 'uuid:r1', friendly_name: 'R1' }],
        });
        expect(str(el._renderScanSection())).toContain('No new renderer found');
    });

    it('shows "No UPnP renderer found" when known list is empty and nothing discovered', () => {
        const el = makeEl({ _known: [], _discovered: [] });
        expect(str(el._renderScanSection())).toContain('No UPnP renderer found on the network');
    });

    it('shows nothing when discovered is null (before first scan)', () => {
        const el = makeEl({ _known: [], _discovered: null });
        const out = str(el._renderScanSection());
        expect(out).not.toContain('No UPnP renderer found');
        expect(out).not.toContain('No new renderer found');
    });
});
