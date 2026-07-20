/**
 * Unit tests for ag-hqplayer-output.js.
 *
 * Covers the _renderCard() connection state logic:
 * - fullyConnected (available + naa_available) → "Connected" indicator, "Use as output" toggle visible
 * - available but naa offline → "NAA offline" indicator, toggle hidden
 * - HQPlayer offline → "Offline" indicator, toggle hidden
 * - …unless the setting is ON, which must stay switchable off at all times
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Minimal stubs for Lit and custom elements used by the component.
vi.mock('lit', () => ({
    LitElement: class { connectedCallback() {} },
    html: (strings, ...values) => ({ strings, values }),
    nothing: null,
}));
vi.mock('../../api.js', () => ({ apiGet: vi.fn(), apiPut: vi.fn(), apiPost: vi.fn(), apiDelete: vi.fn() }));
vi.mock('../utils-lit.js', () => ({ loadConnection: vi.fn() }));
vi.mock('../../ag-icons.js', () => ({ iconSliders: '', iconChevronDown: '', iconWifi: '' }));
vi.mock('../atoms/ag-status-indicator.js', () => ({}));

// Import after mocks are in place.
import { AgHqplayerOutput } from './ag-hqplayer-output.js';

/** Build a minimal AgHqplayerOutput instance without mounting. */
function makeEl(connectionOverrides = {}) {
    const el = Object.create(AgHqplayerOutput?.prototype ?? {});
    el._connection = {
        host: '10.0.4.200',
        port: 4321,
        available: false,
        naa_available: false,
        ...connectionOverrides,
    };
    el._applying   = false;
    el._useAsOutput = false;
    el._status     = null;
    el._dspExpanded = false;
    el._toggleOutput = vi.fn();
    el._toggleDsp    = vi.fn();
    el._disconnect   = vi.fn();
    el._renderDsp    = vi.fn(() => null);
    el._formatRate   = (r) => `${r}Hz`;
    return el;
}

/** Stringify the Lit template tree to inspect rendered labels/classes. */
function renderToString(tpl) {
    if (!tpl || typeof tpl !== 'object') return String(tpl ?? '');
    const parts = tpl.strings ?? [];
    const vals  = tpl.values ?? [];
    let out = '';
    parts.forEach((s, i) => {
        out += s;
        if (i < vals.length) out += renderToString(vals[i]);
    });
    return out;
}

describe('AgHqplayerOutput._renderCard — connection state display', () => {
    let el;

    describe('fully connected (available + naa_available)', () => {
        beforeEach(() => {
            el = makeEl({ available: true, naa_available: true });
        });

        it('adds "connected" CSS class to the card', () => {
            const html = renderToString(el._renderCard());
            expect(html).toContain('connected');
        });

        it('shows "Connected" status label', () => {
            const html = renderToString(el._renderCard());
            expect(html).toContain('Connected');
            expect(html).not.toContain('NAA offline');
            expect(html).not.toContain('Offline');
        });

        it('renders the "Use as output" toggle', () => {
            const html = renderToString(el._renderCard());
            expect(html).toContain('Use as output');
        });
    });

    describe('HQPlayer reachable but NAA offline (available + !naa_available)', () => {
        beforeEach(() => {
            el = makeEl({ available: true, naa_available: false });
        });

        it('does not add "connected" CSS class', () => {
            const html = renderToString(el._renderCard());
            // The class expression produces "lib-hqp-card " (no "connected" appended)
            expect(html).not.toMatch(/lib-hqp-card connected/);
        });

        it('shows "NAA offline" status label', () => {
            const html = renderToString(el._renderCard());
            expect(html).toContain('NAA offline');
            expect(html).not.toContain('Connected');
        });

        it('hides the "Use as output" toggle', () => {
            const html = renderToString(el._renderCard());
            expect(html).not.toContain('Use as output');
        });
    });

    describe('HQPlayer offline (!available)', () => {
        beforeEach(() => {
            el = makeEl({ available: false, naa_available: false });
        });

        it('does not add "connected" CSS class', () => {
            const html = renderToString(el._renderCard());
            expect(html).not.toMatch(/lib-hqp-card connected/);
        });

        it('shows "Offline" status label', () => {
            const html = renderToString(el._renderCard());
            expect(html).toContain('Offline');
            expect(html).not.toContain('Connected');
            expect(html).not.toContain('NAA offline');
        });

        it('hides the "Use as output" toggle', () => {
            const html = renderToString(el._renderCard());
            expect(html).not.toContain('Use as output');
        });
    });

    describe('setting is ON but HQPlayer cannot be reached', () => {
        // Dead end otherwise: the setting is server-side and keeps routing every
        // play to an unreachable HQPlayer, while the control that turns it off is
        // hidden. The updated() guard does not save us — it watches the LOCAL NAA,
        // which stays active when the HQPlayer host goes away.
        it('keeps the toggle visible when HQPlayer is offline', () => {
            const el = makeEl({ available: false, naa_available: true });
            el._useAsOutput = true;
            const html = renderToString(el._renderCard());
            expect(html).toContain('Use as output');
        });

        it('keeps the toggle visible when the NAA is offline', () => {
            const el = makeEl({ available: true, naa_available: false });
            el._useAsOutput = true;
            const html = renderToString(el._renderCard());
            expect(html).toContain('Use as output');
        });

        it('still reports the connection as offline — visibility is not connectivity', () => {
            const el = makeEl({ available: false, naa_available: true });
            el._useAsOutput = true;
            const html = renderToString(el._renderCard());
            expect(html).toContain('Offline');
            expect(html).not.toMatch(/lib-hqp-card connected/);
        });
    });
});

describe('AgHqplayerOutput.updated() — clears output flag when NAA goes offline', () => {
    function makeElWithOutput(connectionOverrides = {}) {
        const el = Object.create(AgHqplayerOutput?.prototype ?? {});
        el._connection = { host: '10.0.4.200', port: 4321, available: true, naa_available: true, ...connectionOverrides };
        el._useAsOutput = true;
        return el;
    }

    it('turns the output off ON THE SERVER when naa_available transitions to false', () => {
        // The setting is server-side now (spec §8.1.3 step 2): clearing it only
        // locally would leave the backend still routing plays to HQPlayer.
        const el = makeElWithOutput({ naa_available: false });
        const calls = [];
        el._setUseAsOutput = (v) => { calls.push(v); el._useAsOutput = v; };

        el.updated(new Map([['_connection', { naa_available: true }]]));

        expect(calls).toEqual([false]);
        expect(el._useAsOutput).toBe(false);
    });

    it('does NOT clear flag when naa_available is undefined (transient fetch failure)', () => {
        const el = makeElWithOutput();
        el._connection = null; // fetch failed
        const removed = [];
        global.localStorage = { removeItem: (k) => removed.push(k) };

        const changed = new Map([['_connection', { naa_available: true }]]);
        el.updated(changed);

        expect(el._useAsOutput).toBe(true);
        expect(removed).toHaveLength(0);
    });

    it('does NOT clear flag when _connection was not in changedProps', () => {
        const el = makeElWithOutput({ naa_available: false });
        const removed = [];
        global.localStorage = { removeItem: (k) => removed.push(k) };

        el.updated(new Map()); // no _connection change

        expect(el._useAsOutput).toBe(true);
        expect(removed).toHaveLength(0);
    });
});

describe('AgHqplayerOutput._handleNaaMetrics() — SSE real-time update', () => {
    function makeEl(naaAvailable = true) {
        const el = Object.create(AgHqplayerOutput?.prototype ?? {});
        el._connection = { host: '10.0.4.200', port: 4321, available: true, naa_available: naaAvailable };
        el._useAsOutput = false;
        return el;
    }

    it('updates naa_available to false when hqplayer service goes inactive', () => {
        const el = makeEl(true);
        el._handleNaaMetrics({ serviceId: 'hqplayer', metrics: { state: 'inactive' } });
        expect(el._connection.naa_available).toBe(false);
    });

    it('updates naa_available to true when hqplayer service becomes active', () => {
        const el = makeEl(false);
        el._handleNaaMetrics({ serviceId: 'hqplayer', metrics: { state: 'active' } });
        expect(el._connection.naa_available).toBe(true);
    });

    it('ignores events for other services', () => {
        const el = makeEl(true);
        el._handleNaaMetrics({ serviceId: 'mpd', metrics: { state: 'inactive' } });
        expect(el._connection.naa_available).toBe(true);
    });

    it('does nothing when _connection is null', () => {
        const el = makeEl(true);
        el._connection = null;
        expect(() => el._handleNaaMetrics({ serviceId: 'hqplayer', metrics: { state: 'inactive' } })).not.toThrow();
    });

    it('does not mutate _connection when state is unchanged', () => {
        const el = makeEl(true);
        const ref = el._connection;
        el._handleNaaMetrics({ serviceId: 'hqplayer', metrics: { state: 'active' } });
        expect(el._connection).toBe(ref); // same object reference — no spurious re-render
    });
});

// ---------------------------------------------------------------------------
// "Use as output" toggle — releasing the local DAC
// ---------------------------------------------------------------------------
// Regression: the toggle only wrote localStorage, so switching it OFF left
// HQPlayer loaded and the NAA holding the ALSA device. Local playback then
// failed with `Failed to open ALSA device "hw:0,0": Device or resource busy`.
// Turning it off must stop HQPlayer so the NAA hands the DAC back to MPD.

import { apiPost, apiPut } from '../../api.js';

describe('AgHqplayerOutput._toggleOutput — server-side setting', () => {
    /** Minimal instance carrying just the toggle behaviour. */
    function el() {
        const c = Object.create(AgHqplayerOutput.prototype);
        c._useAsOutput = false;
        c._connection = null;
        return c;
    }

    beforeEach(() => vi.clearAllMocks());

    it('switching ON persists the choice on the backend', async () => {
        const c = el();
        apiPut.mockResolvedValueOnce({ use_as_output: true });
        await c._toggleOutput({ detail: { checked: true } });
        expect(apiPut).toHaveBeenCalledWith('/hqplayer/use-as-output', { enabled: true });
        expect(c._useAsOutput).toBe(true);
    });

    it('never overwrites _connection with the toggle response', async () => {
        // Regression: assigning the response to _connection dropped
        // naa_available, so the NAA-offline guard in updated() fired and
        // switched the toggle straight back off — the feature was unusable.
        const c = el();
        c._connection = { host: '10.0.4.200', available: true, naa_available: true };
        apiPut.mockResolvedValueOnce({ use_as_output: true });
        await c._toggleOutput({ detail: { checked: true } });
        expect(c._connection.naa_available).toBe(true);
        expect(c._connection.available).toBe(true);
    });

    it('switching OFF persists it too — the backend releases the sound card', async () => {
        // The stop that frees the exclusive device now lives server-side, so the
        // UI no longer calls /hqplayer/stop itself on a toggle.
        const c = el();
        c._useAsOutput = true;
        apiPut.mockResolvedValueOnce({ use_as_output: false });
        await c._toggleOutput({ detail: { checked: false } });
        expect(apiPut).toHaveBeenCalledWith('/hqplayer/use-as-output', { enabled: false });
        expect(apiPost).not.toHaveBeenCalledWith('/hqplayer/stop');
        expect(c._useAsOutput).toBe(false);
    });

    it('adopts the server answer even if it differs from the request', async () => {
        const c = el();
        apiPut.mockResolvedValueOnce({ use_as_output: false });   // backend refused
        await c._toggleOutput({ detail: { checked: true } });
        expect(c._useAsOutput).toBe(false);
    });

    it('reverts the switch when the call fails', async () => {
        const c = el();
        apiPut.mockRejectedValueOnce(new Error('backend unreachable'));
        await c._toggleOutput({ detail: { checked: true } });
        expect(c._useAsOutput).toBe(false);
    });
});
