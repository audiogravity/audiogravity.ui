/**
 * Unit tests for ag-upnp-renderer-card.js.
 *
 * Covers:
 * - _renderDiscovery(): empty list and populated list states
 * - _renderCard(): connected / offline / with playback states
 * - _onStatusEvent(): SSE event updates _status and _connection
 * - _fmt(): time formatting helper
 * - _progress(): progress bar percentage
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
    iconWifi: '', iconPlay: '', iconPause: '', iconStop: '', iconVolume: '', iconConnection: '',
}));
vi.mock('../atoms/ag-status-indicator.js', () => ({}));

import { AgUpnpRendererCard } from './ag-upnp-renderer-card.js';

/** Build a minimal AgUpnpRendererCard instance without mounting. */
function makeEl(overrides = {}) {
    const el = Object.create(AgUpnpRendererCard?.prototype ?? {});
    el._connection  = null;
    el._status      = null;
    el._loading     = false;
    el._scanning    = false;
    el._discovered  = null;
    el._acting      = false;
    el._volume      = null;
    el._play        = vi.fn();
    el._pause       = vi.fn();
    el._stop        = vi.fn();
    el._disconnect  = vi.fn();
    el._setVolume   = vi.fn();
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
// _fmt
// ---------------------------------------------------------------------------

describe('AgUpnpRendererCard._fmt()', () => {
    const el = makeEl();

    it('formats seconds to M:SS', () => {
        expect(el._fmt(90)).toBe('1:30');
        expect(el._fmt(3661)).toBe('61:01');
        expect(el._fmt(0)).toBe('0:00');
    });

    it('returns --:-- for null / NaN', () => {
        expect(el._fmt(null)).toBe('--:--');
        expect(el._fmt(NaN)).toBe('--:--');
    });
});

// ---------------------------------------------------------------------------
// _progress
// ---------------------------------------------------------------------------

describe('AgUpnpRendererCard._progress()', () => {
    it('returns 0 when no status', () => {
        const el = makeEl();
        expect(el._progress()).toBe(0);
    });

    it('returns correct percentage', () => {
        const el = makeEl({ _status: { position: 60, duration: 240 } });
        expect(el._progress()).toBe(25);
    });

    it('clamps at 100', () => {
        const el = makeEl({ _status: { position: 300, duration: 240 } });
        expect(el._progress()).toBe(100);
    });

    it('returns 0 when duration is 0', () => {
        const el = makeEl({ _status: { position: 10, duration: 0 } });
        expect(el._progress()).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// _onStatusEvent
// ---------------------------------------------------------------------------

describe('AgUpnpRendererCard._onStatusEvent()', () => {
    it('updates _status from SSE event', () => {
        const el = makeEl();
        el._onStatusEvent({ detail: {
            connected: true, transport_state: 'PLAYING',
            title: 'Heroes', artist: 'David Bowie', volume: 35,
            renderer_udn: 'uuid:test', renderer_name: 'music.#1', renderer_location: 'http://x',
        }});
        expect(el._status.transport_state).toBe('PLAYING');
        expect(el._status.title).toBe('Heroes');
        expect(el._volume).toBe(35);
    });

    it('updates _connection from SSE event', () => {
        const el = makeEl({ _connection: { friendly_name: 'old', available: false } });
        el._onStatusEvent({ detail: {
            connected: true, renderer_name: 'music.#1',
            renderer_udn: 'uuid:test', renderer_location: 'http://x', volume: null,
        }});
        expect(el._connection.friendly_name).toBe('music.#1');
        expect(el._connection.available).toBe(true);
    });

    it('does not update _volume when volume is null in event', () => {
        const el = makeEl({ _volume: 50 });
        el._onStatusEvent({ detail: { connected: true, volume: null, renderer_udn: 'u', renderer_name: 'r', renderer_location: 'l' } });
        expect(el._volume).toBe(50);
    });

    it('ignores null detail', () => {
        const el = makeEl();
        expect(() => el._onStatusEvent({ detail: null })).not.toThrow();
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

    it('shows track title and artist when status has them', () => {
        const el = makeEl({
            _connection: { available: true, friendly_name: 'Test' },
            _status: { transport_state: 'PLAYING', title: 'Heroes', artist: 'David Bowie', position: 10, duration: 214 },
        });
        const out = str(el._renderCard());
        expect(out).toContain('Heroes');
        expect(out).toContain('David Bowie');
    });

    it('shows volume slider when volume is available', () => {
        const el = makeEl({
            _connection: { available: true, friendly_name: 'Test' },
            _volume: 42,
        });
        expect(str(el._renderCard())).toContain('42');
    });

    it('shows Pause button when PLAYING', () => {
        const el = makeEl({
            _connection: { available: true, friendly_name: 'Test' },
            _status: { transport_state: 'PLAYING' },
        });
        expect(str(el._renderCard())).toContain('Pause');
    });

    it('shows Play button when STOPPED', () => {
        const el = makeEl({
            _connection: { available: true, friendly_name: 'Test' },
            _status: { transport_state: 'STOPPED' },
        });
        expect(str(el._renderCard())).toContain('Play');
    });

    it('disables Play button when current_uri is null (Fix 1)', () => {
        const el = makeEl({
            _connection: { available: true, friendly_name: 'Test' },
            _status: { transport_state: 'STOPPED', current_uri: null },
            _acting: false,
        });
        const out = str(el._renderCard());
        // ?disabled= true when current_uri is null
        expect(out).toContain('No track loaded');
    });

    it('enables Play button when current_uri is set', () => {
        const el = makeEl({
            _connection: { available: true, friendly_name: 'Test' },
            _status: { transport_state: 'STOPPED', current_uri: 'http://srv/track.flac' },
            _acting: false,
        });
        const out = str(el._renderCard());
        expect(out).toContain('Resume');
    });
});

// ---------------------------------------------------------------------------
// Fix 2 — Renderer badge condition: transport_state stored correctly in _status
// ---------------------------------------------------------------------------

describe('AgUpnpRendererCard._onStatusEvent() — transport_state for badge', () => {
    it('stores transport_state PLAYING from SSE payload', () => {
        const el = makeEl();
        el._onStatusEvent({ detail: {
            connected: true, transport_state: 'PLAYING',
            renderer_udn: 'uuid:r', renderer_name: 'R', renderer_location: 'http://x',
            volume: null,
        }});
        expect(el._status.transport_state).toBe('PLAYING');
    });

    it('stores transport_state STOPPED from SSE payload', () => {
        const el = makeEl();
        el._onStatusEvent({ detail: {
            connected: true, transport_state: 'STOPPED',
            renderer_udn: 'uuid:r', renderer_name: 'R', renderer_location: 'http://x',
            volume: null,
        }});
        expect(el._status.transport_state).toBe('STOPPED');
    });
});
