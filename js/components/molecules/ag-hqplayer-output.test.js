/**
 * Unit tests for ag-hqplayer-output.js.
 *
 * Covers the _renderCard() connection state logic:
 * - fullyConnected (available + naa_available) → "Connected" indicator, "Use as output" toggle visible
 * - available but naa offline → "NAA offline" indicator, toggle hidden
 * - HQPlayer offline → "Offline" indicator, toggle hidden
 * - …unless the setting is ON, which must stay switchable off at all times —
 *   since the automatic clear was removed, the toggle is the ONLY way out.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Minimal stubs for Lit and custom elements used by the component.
vi.mock('lit', () => ({
    LitElement: class { connectedCallback() {} disconnectedCallback() {} },
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

describe('AgHqplayerOutput — a view must not mutate the shared setting', () => {
    // The old updated() hook cleared the flag when the NAA went offline. Once
    // the setting moved server-side that stopped being a local preference and
    // became a WRITE to the box: any browser merely displaying this panel while
    // networkaudiod restarted (the steering restarts it on every ALSA output
    // switch) turned the output off for every client. The backend owns the
    // invariant now — it refuses to enable, and refuses to route, without a NAA.

    function makeElWithOutput(connectionOverrides = {}) {
        const el = Object.create(AgHqplayerOutput?.prototype ?? {});
        el._connection = { host: '10.0.4.200', port: 4321, available: true, naa_available: true, ...connectionOverrides };
        el._useAsOutput = true;
        return el;
    }

    it('no longer defines an updated() hook that writes the setting', () => {
        expect(AgHqplayerOutput.prototype.updated).toBeUndefined();
    });

    it('keeps the setting untouched when the NAA goes offline', () => {
        const el = makeElWithOutput({ naa_available: false });
        const calls = [];
        el._setUseAsOutput = (v) => { calls.push(v); el._useAsOutput = v; };

        // Whatever lifecycle runs, nothing may write on an observed NAA drop.
        el.updated?.(new Map([['_connection', { naa_available: true }]]));

        expect(calls).toEqual([]);
        expect(el._useAsOutput).toBe(true);
    });

    it('leaves the toggle reachable so the user can turn it off themselves', () => {
        // With the automatic clear gone, the switch is the only way out — it
        // must stay rendered while the setting is ON even if HQPlayer/NAA is
        // unreachable, or the user is trapped with failing plays.
        const el = makeEl({ available: true, naa_available: false });
        el._useAsOutput = true;
        expect(renderToString(el._renderCard())).toContain('Use as output');
    });
});

describe('AgHqplayerOutput._handleNaaMetrics() — SSE real-time update', () => {
    function makeEl(naaAvailable = true) {
        const el = Object.create(AgHqplayerOutput?.prototype ?? {});
        el._connection = { host: '10.0.4.200', port: 4321, available: true, naa_available: naaAvailable };
        el._useAsOutput = false;
        return el;
    }

    it('updates naa_available to false when the naa service goes inactive', () => {
        const el = makeEl(true);
        el._handleNaaMetrics({ serviceId: 'naa', metrics: { state: 'inactive' } });
        expect(el._connection.naa_available).toBe(false);
    });

    it('updates naa_available to true when the naa service becomes active', () => {
        const el = makeEl(false);
        el._handleNaaMetrics({ serviceId: 'naa', metrics: { state: 'active' } });
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
        expect(() => el._handleNaaMetrics({ serviceId: 'naa', metrics: { state: 'inactive' } })).not.toThrow();
    });

    it('does not mutate _connection when state is unchanged', () => {
        const el = makeEl(true);
        const ref = el._connection;
        el._handleNaaMetrics({ serviceId: 'naa', metrics: { state: 'active' } });
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


describe('AgHqplayerOutput._toggleOutput — one write at a time', () => {
    // Two quick flips used to race: both PUTs went out and the SLOWER response
    // won, so the switch could end up showing the opposite of the stored value.
    function el() {
        const c = Object.create(AgHqplayerOutput.prototype);
        c._useAsOutput = false;
        c._connection = null;
        return c;
    }

    beforeEach(() => vi.clearAllMocks());

    it('ignores a second flip while the first is still in flight', async () => {
        const c = el();
        let release;
        apiPut.mockReturnValueOnce(new Promise(r => { release = r; }));

        const first = c._toggleOutput({ detail: { checked: true } });
        await c._toggleOutput({ detail: { checked: false } });   // must be dropped
        expect(apiPut).toHaveBeenCalledTimes(1);

        release({ use_as_output: true });
        await first;
        expect(c._useAsOutput).toBe(true);
    });

    it('accepts the next flip once the first has settled', async () => {
        const c = el();
        apiPut.mockResolvedValueOnce({ use_as_output: true });
        await c._toggleOutput({ detail: { checked: true } });
        apiPut.mockResolvedValueOnce({ use_as_output: false });
        await c._toggleOutput({ detail: { checked: false } });
        expect(apiPut).toHaveBeenCalledTimes(2);
        expect(c._useAsOutput).toBe(false);
    });

    it('releases the lock even when the call fails', async () => {
        const c = el();
        apiPut.mockRejectedValueOnce(new Error('backend down'));
        await c._toggleOutput({ detail: { checked: true } });
        apiPut.mockResolvedValueOnce({ use_as_output: true });
        await c._toggleOutput({ detail: { checked: true } });
        expect(apiPut).toHaveBeenCalledTimes(2);
    });
});

describe('AgHqplayerOutput._renderDsp — volume label', () => {
    /**
     * Flatten a mocked-lit template tree into the list of its interpolated
     * values, so an assertion can look at what the template would print.
     */
    function flatValues(tpl, out = []) {
        if (tpl == null) return out;
        if (Array.isArray(tpl)) { tpl.forEach(t => flatValues(t, out)); return out; }
        if (typeof tpl === 'object' && tpl.values) { tpl.values.forEach(v => flatValues(v, out)); return out; }
        out.push(tpl);
        return out;
    }

    it('prints the volume rounded to the slider step, not the float32 artifact', () => {
        // HQPlayer stores the volume in single precision; -13.8 widened to a
        // double through the XML path comes back as -13.800000190734863, and
        // the label used to print it raw. The slider moves in 0.5 dB steps, so
        // one decimal is the honest display.
        const el = Object.create(AgHqplayerOutput.prototype);
        el._status = { volume_db: -13.800000190734863 };
        el._filters = []; el._shapers = []; el._modes = [];

        const values = flatValues(el._renderDsp()).map(String);
        expect(values).toContain('-13.8');
        expect(values.join('|')).not.toContain('0.190734863');
    });

    it('shows 0.0 dB when the status has no volume yet', () => {
        const el = Object.create(AgHqplayerOutput.prototype);
        el._status = null;
        el._filters = []; el._shapers = []; el._modes = [];
        expect(flatValues(el._renderDsp()).map(String)).toContain('0.0');
    });
});

describe('AgHqplayerOutput — which HQPlayer this is, and whether it pairs', () => {
    it('trims the vendor prefix so the useful word is what shows', () => {
        const el = makeEl();
        expect(el._identity('Signalyst HQPlayer Desktop', '5.28.1')).toBe('Desktop 5.28.1');
        expect(el._identity('Signalyst HQPlayer Embedded', '6.0.2')).toBe('Embedded 6.0.2');
    });

    it('shows an unexpected product whole rather than trimming it on a guess', () => {
        const el = makeEl();
        expect(el._identity('Something Else', '1.0')).toBe('Something Else 1.0');
    });

    it('says nothing when the instance has not answered', () => {
        const el = makeEl();
        expect(el._identity(null, null)).toBe('');
        expect(el._identity('Signalyst HQPlayer Desktop', null)).toBe('Desktop');
    });

    it('puts the engine version beside the name on the connected card', () => {
        const el = makeEl({ available: true, naa_available: true, engine_version: '5.28.1' });
        expect(renderToString(el._renderCard())).toContain('5.28.1');
    });

    it('warns when the two major lines do not match, naming both', () => {
        const el = makeEl({
            available: true, naa_available: true,
            pairing_ok: false, major: 5, naa_version: '6.1.4-71',
        });
        const html = renderToString(el._renderCard());
        expect(html).toContain('lib-hqp-pairing');
        expect(html).toContain('6.1.4-71');
        expect(html).toContain('5');
    });

    it('stays quiet when the pairing is fine', () => {
        const el = makeEl({ available: true, naa_available: true, pairing_ok: true });
        expect(renderToString(el._renderCard())).not.toContain('lib-hqp-pairing');
    });

    it('stays quiet when the pairing is unknown — unknown is not broken', () => {
        const el = makeEl({ available: true, naa_available: true, pairing_ok: null });
        expect(renderToString(el._renderCard())).not.toContain('lib-hqp-pairing');
    });
});

// ---------------------------------------------------------------------------
// This box's own HQPlayer (HQPlayer Embedded)
// ---------------------------------------------------------------------------
// While it runs, the core plays through it whatever the card says, and returns
// to the instance chosen in the card when it stops (decision of 2026-09-22).
// The card has to show which one plays — and must not offer a switch the core
// refuses, nor a Disconnect that would blank a card still in use.

import { apiDelete } from '../../api.js';
import { loadConnection } from '../utils-lit.js';

const LOCAL = {
    host: '127.0.0.1', port: 4321, local: true,
    configured_host: null, configured_port: 4321,
    available: true, naa_available: false, use_as_output: true,
    product: 'Signalyst HQPlayer Embedded', engine_version: '5.16.2',
};

describe("AgHqplayerOutput._renderCard — this box's own HQPlayer", () => {
    it('shows it as this box, by the name it reports', () => {
        const html = renderToString(makeEl(LOCAL)._renderCard());
        expect(html).toContain('HQPlayer Embedded 5.16.2');
        expect(html).toContain('This box');
        expect(html).not.toContain('127.0.0.1');
    });

    it('is connected with no NAA — it plays straight to the DAC', () => {
        const html = renderToString(makeEl(LOCAL)._renderCard());
        expect(html).toContain('Connected');
        expect(html).not.toContain('NAA offline');
    });

    it('says offline when it runs without answering', () => {
        const html = renderToString(makeEl({ ...LOCAL, available: false })._renderCard());
        expect(html).toContain('Offline');
        expect(html).toContain('This box');
    });

    it('locks the output switch on, and says why', () => {
        const html = renderToString(makeEl(LOCAL)._renderCard());
        expect(html).toMatch(/<ag-switch \.checked=true disabled>/);
        expect(html).not.toContain('@ag-change');
        expect(html).toContain('HQPlayer is running on this box: the music plays through it until it stops.');
    });

    it('names the instance chosen in the card, which comes back when it stops', () => {
        const html = renderToString(makeEl({ ...LOCAL, configured_host: '10.0.4.200' })._renderCard());
        // Its own output setting comes back with it: the music goes to it only if
        // that was on — the sentence must not promise more (seen in the real run).
        expect(html).toContain('The card then returns to HQPlayer at 10.0.4.200:4321, with its own output setting.');
        expect(html).toContain('Forget 10.0.4.200:4321');
        expect(html).not.toContain('Disconnect');
    });

    it('offers nothing to disconnect when no other instance was chosen', () => {
        const html = renderToString(makeEl(LOCAL)._renderCard());
        expect(html).not.toContain('Disconnect');
        expect(html).not.toContain('Forget');
        expect(html).not.toContain('returns to HQPlayer');
    });

    it('leaves the card of another HQPlayer as it was', () => {
        const html = renderToString(makeEl({ available: true, naa_available: true })._renderCard());
        expect(html).toContain('10.0.4.200:4321');
        expect(html).toContain('Disconnect');
        expect(html).not.toContain('This box');
        expect(html).not.toContain('disabled');
    });
});

describe("AgHqplayerOutput._renderDsp — this box's own HQPlayer", () => {
    // The reset drops the settings Audiogravity keeps, which are those of the
    // HQPlayer chosen in the card — kept for when this box's own stops, and
    // refused by the core meanwhile.
    function el(connection) {
        const c = Object.create(AgHqplayerOutput.prototype);
        c._connection = connection;
        c._status = null;
        c._filters = []; c._shapers = []; c._modes = [];
        return c;
    }

    it('offers no reset while it runs', () => {
        const html = renderToString(el(LOCAL)._renderDsp());
        expect(html).not.toContain('Reset to HQPlayer defaults');
        expect(html).toContain('Filter');
    });

    it('keeps the reset for the HQPlayer chosen in the card', () => {
        const html = renderToString(el({ host: '10.0.4.200', available: true })._renderDsp());
        expect(html).toContain('Reset to HQPlayer defaults');
    });
});

describe('AgHqplayerOutput._disconnect — what forgetting leaves', () => {
    function el(connection) {
        const c = makeEl(connection);
        c._disconnect = AgHqplayerOutput.prototype._disconnect;   // makeEl stubs it
        c.dispatchEvent = vi.fn();
        return c;
    }

    beforeEach(() => vi.clearAllMocks());

    it("keeps showing this box's HQPlayer, which the core still plays through", async () => {
        apiDelete.mockResolvedValueOnce(LOCAL);
        const c = el({ ...LOCAL, configured_host: '10.0.4.200' });
        await c._disconnect();
        expect(c._connection).toEqual(LOCAL);
        expect(c._useAsOutput).toBe(true);
        expect(c.dispatchEvent).toHaveBeenCalled();
    });

    it('clears the card when nothing remains', async () => {
        apiDelete.mockResolvedValueOnce({ host: null, port: 4321, local: false, use_as_output: false });
        const c = el({ available: true, naa_available: true });
        await c._disconnect();
        expect(c._connection).toBeNull();
        expect(c._useAsOutput).toBe(false);
    });

    it('clears the card when the call fails, as before', async () => {
        apiDelete.mockRejectedValueOnce(new Error('boom'));
        const c = el({ available: true, naa_available: true });
        await c._disconnect();
        expect(c._connection).toBeNull();
    });
});

describe("AgHqplayerOutput — following this box's HQPlayer as it starts and stops", () => {
    function el() {
        const c = Object.create(AgHqplayerOutput.prototype);
        c._loadConnection = vi.fn();
        return c;
    }
    const state = (c, serviceId, s) => c._handleLocalHqplayerMetrics({ serviceId, metrics: { state: s } });

    it('reloads the connection when it starts', () => {
        const c = el();
        state(c, 'hqplayerd', 'inactive');
        state(c, 'hqplayerd', 'active');
        expect(c._loadConnection).toHaveBeenCalledTimes(1);
    });

    it('reloads the connection when it stops', () => {
        const c = el();
        state(c, 'hqplayerd', 'active');
        state(c, 'hqplayerd', 'inactive');
        expect(c._loadConnection).toHaveBeenCalledTimes(1);
    });

    it('with nothing loaded, takes the first event as where it stands', () => {
        const c = el();
        state(c, 'hqplayerd', 'active');
        expect(c._loadConnection).not.toHaveBeenCalled();
    });

    /** A card whose first load answered `connection`, then watched for reloads. */
    async function loaded(connection) {
        loadConnection.mockImplementationOnce(async (host) => { host._connection = connection; });
        const c = Object.create(AgHqplayerOutput.prototype);
        await c._loadConnection();
        c._loadConnection = vi.fn();
        return c;
    }

    it('sees a start that comes between its load and the first event', async () => {
        // The case measured on the dev box: state events come every 10 to 30 s
        // on a quiet box, and HQPlayer was started 7 s after the page opened.
        const c = await loaded({ host: '10.0.4.200', local: false });
        state(c, 'hqplayerd', 'active');
        expect(c._loadConnection).toHaveBeenCalledTimes(1);
    });

    it('sees a stop that comes between its load and the first event', async () => {
        const c = await loaded(LOCAL);
        state(c, 'hqplayerd', 'inactive');
        expect(c._loadConnection).toHaveBeenCalledTimes(1);
    });

    it('asks nothing when the first event says what it loaded', async () => {
        const c = await loaded(LOCAL);
        state(c, 'hqplayerd', 'active');
        expect(c._loadConnection).not.toHaveBeenCalled();
    });

    it('asks once, not on every event, when the core does not see it running', async () => {
        // Its unit runs, but the core reads no declaration: every load says
        // "not local". Through the real load, so a re-seed on each of them —
        // the loop this guards against — would show as one reload per event.
        loadConnection.mockReset();
        loadConnection.mockImplementation(async (host) => { host._connection = { host: '10.0.4.200', local: false }; });
        try {
            const c = Object.create(AgHqplayerOutput.prototype);
            await c._loadConnection();
            for (let i = 0; i < 5; i++) {
                state(c, 'hqplayerd', 'active');
                await new Promise(r => setTimeout(r, 0));   // let a reload land
            }
            expect(loadConnection).toHaveBeenCalledTimes(2);   // the load, then one reload
        } finally {
            loadConnection.mockReset();
        }
    });

    it('asks nothing while its state stays put', () => {
        // A running HQPlayer that does not answer must not turn every metrics
        // tick into a request to the core, and from the core to HQPlayer.
        const c = el();
        for (let i = 0; i < 5; i++) state(c, 'hqplayerd', 'active');
        expect(c._loadConnection).not.toHaveBeenCalled();
    });

    it('ignores the other services', () => {
        const c = el();
        state(c, 'naa', 'inactive');
        state(c, 'naa', 'active');
        expect(c._loadConnection).not.toHaveBeenCalled();
    });

    it('listens from the moment it is shown, and stops when it goes', () => {
        const c = Object.create(AgHqplayerOutput.prototype);
        c._loadConnection = vi.fn();
        window.EventEmitter = { on: vi.fn(), off: vi.fn() };
        try {
            c.connectedCallback();
            expect(window.EventEmitter.on).toHaveBeenCalledWith('service-metrics-sse', c._boundHandleLocalMetrics);
            c.disconnectedCallback();
            expect(window.EventEmitter.off).toHaveBeenCalledWith('service-metrics-sse', c._boundHandleLocalMetrics);
        } finally {
            delete window.EventEmitter;
        }
    });
});

// ---------------------------------------------------------------------------
// _setMode — the filter and shaper lists belong to the mode
// ---------------------------------------------------------------------------

describe('AgHqplayerOutput._setMode — the lists follow the mode', () => {
    /** A card with the DSP calls stubbed, as the panel uses them. */
    function card() {
        const c = Object.create(AgHqplayerOutput.prototype);
        c._applying = false;
        c._status = { active_mode: 'SDM (DSD)' };
        c._loadStatus = vi.fn(async () => {});
        c._loadDspOptions = vi.fn(async () => {});
        c._flashField = vi.fn();
        return c;
    }

    beforeEach(() => { apiPut.mockReset(); apiPut.mockResolvedValue({ success: true }); });

    it('re-reads the filters and shapers after the mode changed', async () => {
        // HQPlayer takes a POSITION in a list that is not the same in PCM and in
        // SDM: kept from the previous mode, a pick applied another filter.
        const c = card();
        await c._setMode({ target: { value: '1' } });
        expect(apiPut).toHaveBeenCalledWith('/hqplayer/mode', { value: 1 });
        expect(c._loadDspOptions).toHaveBeenCalledTimes(1);
    });

    it('does not re-read them for a filter, a shaper or the volume', async () => {
        const c = card();
        await c._setFilter({ target: { value: '9' } });
        await c._setShaper({ target: { value: '3' } });
        await c._setVolume({ target: { value: '-30' } });
        expect(apiPut).toHaveBeenCalledTimes(3);
        expect(c._loadDspOptions).not.toHaveBeenCalled();
    });
});
