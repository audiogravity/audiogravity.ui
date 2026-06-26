/**
 * Unit tests for ag-upnp-renderer-card.js.
 *
 * Covers:
 * - _renderDiscovery(): empty list and populated list states
 * - _renderCard(): connected / offline / with volume
 * - _onStatusEvent(): SSE event updates _status and _connection
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class { connectedCallback() {} },
    html: (strings, ...values) => ({ strings, values }),
    nothing: null,
}));
vi.mock('../../api.js', () => ({ apiGet: vi.fn(), apiPut: vi.fn(), apiPost: vi.fn(), apiDelete: vi.fn() }));
vi.mock('../utils-lit.js', () => ({ loadConnection: vi.fn() }));
vi.mock('../../ag-icons.js', () => ({
    iconWifi: '', iconCast: '',
}));
vi.mock('../atoms/ag-status-indicator.js', () => ({}));
vi.mock('./ag-volume-popover.js', () => ({}));
vi.mock('../../library-store.js', () => ({ subscribeRendererStatus: vi.fn(() => vi.fn()) }));

import { AgUpnpRendererCard } from './ag-upnp-renderer-card.js';

/** Build a minimal AgUpnpRendererCard instance without mounting. */
function makeEl(overrides = {}) {
    const el = Object.create(AgUpnpRendererCard?.prototype ?? {});
    el._connection  = null;
    el._status      = null;
    el._loading     = false;
    el._scanning    = false;
    el._discovered  = null;
    el._volume      = null;
    el._connect     = vi.fn();
    el._disconnect  = vi.fn();
    Object.assign(el, overrides);
    return el;
}

/** Recursively stringify a Lit template tree (handles arrays from .map()). */
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
// _onStatusEvent
// ---------------------------------------------------------------------------

describe('AgUpnpRendererCard._onStatusEvent()', () => {
    it('updates _status from SSE event', () => {
        const el = makeEl();
        el._onStatusEvent({
            connected: true, transport_state: 'PLAYING',
            renderer_udn: 'uuid:test', renderer_name: 'music.#1', renderer_location: 'http://x',
            volume: 35,
        });
        expect(el._status.transport_state).toBe('PLAYING');
        expect(el._volume).toBe(35);
    });

    it('updates _connection from SSE event', () => {
        const el = makeEl({ _connection: { friendly_name: 'old', available: false } });
        el._onStatusEvent({
            connected: true, renderer_name: 'music.#1',
            renderer_udn: 'uuid:test', renderer_location: 'http://x', volume: null,
        });
        expect(el._connection.friendly_name).toBe('music.#1');
        expect(el._connection.available).toBe(true);
    });

    it('does not update _volume when volume is null in event', () => {
        const el = makeEl({ _volume: 50 });
        el._onStatusEvent({ connected: true, volume: null, renderer_udn: 'u', renderer_name: 'r', renderer_location: 'l' });
        expect(el._volume).toBe(50);
    });

    it('ignores null detail', () => {
        const el = makeEl();
        expect(() => el._onStatusEvent(null)).not.toThrow();
    });

    it('stores transport_state PLAYING from SSE payload', () => {
        const el = makeEl();
        el._onStatusEvent({ connected: true, transport_state: 'PLAYING',
            renderer_udn: 'uuid:r', renderer_name: 'R', renderer_location: 'http://x', volume: null });
        expect(el._status.transport_state).toBe('PLAYING');
    });

    it('stores transport_state STOPPED from SSE payload', () => {
        const el = makeEl();
        el._onStatusEvent({ connected: true, transport_state: 'STOPPED',
            renderer_udn: 'uuid:r', renderer_name: 'R', renderer_location: 'http://x', volume: null });
        expect(el._status.transport_state).toBe('STOPPED');
    });
});

// ---------------------------------------------------------------------------
// _renderDiscovery
// ---------------------------------------------------------------------------

describe('AgUpnpRendererCard._renderDiscovery()', () => {
    it('shows scan button when not scanning', () => {
        const el = makeEl({ _scanning: false });
        expect(str(el._renderDiscovery())).toContain('Scan network');
    });

    it('shows "Scanning…" while scanning', () => {
        const el = makeEl({ _scanning: true });
        expect(str(el._renderDiscovery())).toContain('Scanning');
    });

    it('renders discovered renderers as selectable cards', () => {
        const el = makeEl({
            _discovered: [
                { udn: 'uuid:1', friendly_name: 'Living Room', location: 'http://x', manufacturer: 'JF Light', model_name: 'UpMPD' },
            ],
        });
        const out = str(el._renderDiscovery());
        expect(out).toContain('Living Room');
        expect(out).toContain('JF Light');
    });

    it('shows "No UPnP renderer found" when list is empty', () => {
        const el = makeEl({ _discovered: [] });
        expect(str(el._renderDiscovery())).toContain('No UPnP renderer found');
    });
});

// ---------------------------------------------------------------------------
// _renderCard
// ---------------------------------------------------------------------------

describe('AgUpnpRendererCard._renderCard()', () => {
    it('shows Connected indicator when available', () => {
        const el = makeEl({ _connection: { available: true, friendly_name: 'Test' } });
        expect(str(el._renderCard())).toContain('Connected');
    });

    it('shows Offline indicator when not available', () => {
        const el = makeEl({ _connection: { available: false, friendly_name: 'Test', udn: 'u' } });
        expect(str(el._renderCard())).toContain('Offline');
    });

    it('shows transport state in description', () => {
        const el = makeEl({
            _connection: { available: true, friendly_name: 'Test' },
            _status: { transport_state: 'PLAYING' },
        });
        expect(str(el._renderCard())).toContain('playing');
    });

    it('shows Disconnect button when available', () => {
        const el = makeEl({ _connection: { available: true, friendly_name: 'Test' } });
        expect(str(el._renderCard())).toContain('Disconnect');
    });

    it('shows volume popover when volume is available', () => {
        const el = makeEl({
            _connection: { available: true, friendly_name: 'Test' },
            _volume: 42,
        });
        expect(str(el._renderCard())).toContain('ag-volume-popover');
    });

    it('does not show volume popover when volume is null', () => {
        const el = makeEl({
            _connection: { available: true, friendly_name: 'Test' },
            _volume: null,
            _status: { volume: null },
        });
        expect(str(el._renderCard())).not.toContain('ag-volume-popover');
    });
});
