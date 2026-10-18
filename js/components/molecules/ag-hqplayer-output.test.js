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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Minimal stubs for Lit and custom elements used by the component.
vi.mock('lit', () => ({
    LitElement: class { connectedCallback() {} disconnectedCallback() {} },
    html: (strings, ...values) => ({ strings, values }),
    nothing: null,
}));
vi.mock('../../api.js', () => ({ apiGet: vi.fn(), apiPut: vi.fn(), apiPost: vi.fn(), apiDelete: vi.fn() }));
vi.mock('../utils-lit.js', () => ({ loadConnection: vi.fn() }));
vi.mock('../../ag-icons.js', () => ({
    iconSliders: '', iconChevronDown: '', iconWifi: '', iconExternalLink: '',
}));
vi.mock('../atoms/ag-status-indicator.js', () => ({}));

// Import after mocks are in place.
import { AgHqplayerOutput } from './ag-hqplayer-output.js';
import { readStylesheet, cssRuleBody } from '../../test-utils.js';
import { AgTimerManager } from '../../timer.js';
import { apiGet } from '../../api.js';

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

// ---------------------------------------------------------------------------
// HQPlayer's volume, on the card's face
// ---------------------------------------------------------------------------
// It sat in the DSP menu, closed by default, over a fixed −60..0: on the Mac's
// HQPlayer (Volume max −3 dB) the top of the slider moved nothing (2026-10-18).

describe('AgHqplayerOutput._renderVolume — what the face shows', () => {
    /** A card whose last status read answered `status`. */
    function el(status, drag = null) {
        const c = Object.create(AgHqplayerOutput.prototype);
        c._status = status;
        c._volumeDrag = drag;
        return c;
    }
    const MAC = { volume_db: -6, volume_min_db: -60, volume_max_db: -3, volume_fixed: false };

    it('prints the volume rounded to the slider step, not the float32 artifact', () => {
        // HQPlayer stores the volume in single precision; -13.8 widened to a
        // double through the XML path comes back as -13.800000190734863, and
        // the label used to print it raw. The slider moves in 0.1 dB steps, so
        // one decimal is the honest display.
        const values = flatValues(el({ volume_db: -13.800000190734863 })._renderVolume()).map(String);
        expect(values).toContain('-13.8 dB');
        expect(values.join('|')).not.toContain('0.190734863');
    });

    it('spreads the slider over the range set in HQPlayer', () => {
        const html = renderToString(el(MAC)._renderVolume());
        expect(html).toContain('min=-60');
        expect(html).toContain('max=-3');
        expect(html).toContain('-6.0 dB');
    });

    it('uses the range the core gives, its own fallback included, and makes none up', () => {
        // The core sends −60..0 itself while HQPlayer has not said a range: a
        // status without one has no slider rather than a range of the card's.
        const html = renderToString(el({ volume_db: -6 })._renderVolume());
        expect(html).toContain('-6.0 dB');
        expect(html).not.toContain('lib-hqp-slider');
    });

    it('shows a dash, not 0.0 dB, when the volume is not known — and no slider', () => {
        // 0.0 dB is the loudest setting there is: it is not a way to say "unknown".
        for (const status of [null, { volume_db: null }]) {
            const html = renderToString(el(status)._renderVolume());
            expect(html).toContain('—');
            expect(html).not.toContain('0.0 dB');
            expect(html).not.toContain('lib-hqp-slider');
        }
    });

    it('offers no slider for a volume fixed in HQPlayer, and says why', () => {
        // HQPlayer refuses every change then (measured on Embedded 6.2.6).
        const html = renderToString(el({ volume_db: -3.01, volume_fixed: true })._renderVolume());
        expect(html).toContain('-3.0 dB');
        expect(html).toContain("Fixed in HQPlayer's settings");
        expect(html).not.toContain('lib-hqp-slider');
    });

    it('shows the value under the finger while the slider moves', () => {
        const html = renderToString(el(MAC, -20.5)._renderVolume());
        expect(html).toContain('-20.5 dB');
    });

    it('is on the face of a card whose HQPlayer answers, and not in the DSP menu', () => {
        const card = makeEl({ available: true, naa_available: true });
        card._renderVolume = AgHqplayerOutput.prototype._renderVolume;
        card._status = MAC;
        expect(renderToString(card._renderCard())).toContain('HQPlayer volume');

        const dsp = Object.create(AgHqplayerOutput.prototype);
        dsp._status = MAC;
        dsp._connection = { host: '10.0.4.200', available: true };
        dsp._filters = []; dsp._shapers = []; dsp._modes = [];
        expect(renderToString(dsp._renderDsp())).not.toContain('Volume');
    });

    it("is on this box's own HQPlayer card too", () => {
        const card = makeEl({ ...LOCAL });
        card._renderVolume = AgHqplayerOutput.prototype._renderVolume;
        card._status = { volume_db: -3, volume_min_db: -60, volume_max_db: 0 };
        expect(renderToString(card._renderCard())).toContain('HQPlayer volume');
    });

    it('is not shown while HQPlayer does not answer', () => {
        const card = makeEl({ available: false });
        card._renderVolume = AgHqplayerOutput.prototype._renderVolume;
        card._status = MAC;
        expect(renderToString(card._renderCard())).not.toContain('HQPlayer volume');
    });
});

describe('AgHqplayerOutput._setVolume — sent when the slider is let go', () => {
    beforeEach(() => { apiPut.mockReset(); apiPut.mockResolvedValue({ success: true, db: -3 }); });

    function card() {
        const c = Object.create(AgHqplayerOutput.prototype);
        c._applying = false;
        c._volumeDrag = null;
        c._loadStatus = vi.fn(async () => {});
        c._flashField = vi.fn();
        return c;
    }

    it('shows the dragged value without sending anything', () => {
        const c = card();
        c._dragVolume({ target: { value: '-12.5' } });
        expect(c._volumeDrag).toBe(-12.5);
        expect(apiPut).not.toHaveBeenCalled();
    });

    it('sends the value let go on, then shows what HQPlayer took', async () => {
        const c = card();
        await c._setVolume({ target: { value: '0' } });
        expect(apiPut).toHaveBeenCalledWith('/hqplayer/volume', { db: 0 });
        expect(c._loadStatus).toHaveBeenCalledTimes(1);
        expect(c._volumeDrag).toBeNull();      // the status read back is shown again
    });

    it('goes back to the volume HQPlayer has when the change is refused', async () => {
        apiPut.mockRejectedValueOnce(new Error("HQPlayer's volume is fixed in its own settings"));
        const c = card();
        await c._setVolume({ target: { value: '-10' } });
        expect(c._volumeDrag).toBeNull();
    });
});

describe('AgHqplayerOutput._endDrag — a slider let go where it started', () => {
    // Measured in Chromium (2026-10-18): a drag that ends on its starting value
    // fires no `change`; and on letting go the order is pointerup, render, change.
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    function card() {
        const c = Object.create(AgHqplayerOutput.prototype);
        c._applying = false;
        c._volumeDrag = null;
        return c;
    }

    it('releases the value under the finger when nothing was sent', () => {
        const c = card();
        c._dragVolume({ target: { value: '-6' } });
        c._endDrag();
        expect(c._volumeDrag).toBe(-6);        // not at once: `change` may still come
        vi.advanceTimersByTime(AgHqplayerOutput.DRAG_RELEASE_MS);
        expect(c._volumeDrag).toBeNull();      // the card follows HQPlayer again
    });

    it('keeps it while the value let go on is being sent', () => {
        const c = card();
        c._dragVolume({ target: { value: '-12' } });
        c._endDrag();
        c._applying = true;                    // `change` came: _setVolume applies it
        vi.advanceTimersByTime(AgHqplayerOutput.DRAG_RELEASE_MS);
        expect(c._volumeDrag).toBe(-12);
    });

    it('waits from the last time the finger let go', () => {
        const c = card();
        c._dragVolume({ target: { value: '-6' } });
        c._endDrag();
        vi.advanceTimersByTime(AgHqplayerOutput.DRAG_RELEASE_MS - 50);
        c._dragVolume({ target: { value: '-8' } });
        c._endDrag();
        vi.advanceTimersByTime(AgHqplayerOutput.DRAG_RELEASE_MS - 50);
        expect(c._volumeDrag).toBe(-8);
        vi.advanceTimersByTime(50);
        expect(c._volumeDrag).toBeNull();
    });

    it('listens on the slider for the finger letting go, or the gesture taken back', () => {
        const c = card();
        c._status = { volume_db: -6, volume_min_db: -60, volume_max_db: -3 };
        const html = renderToString(c._renderVolume());
        expect(html).toContain('@pointerup=');
        expect(html).toContain('@pointercancel=');
    });
});

describe('AgHqplayerOutput — the volume follows HQPlayer while the card is on screen', () => {
    beforeEach(() => {
        vi.spyOn(AgTimerManager, 'setInterval').mockImplementation(() => {});
        vi.spyOn(AgTimerManager, 'clearInterval').mockImplementation(() => {});
    });
    afterEach(() => vi.restoreAllMocks());

    function card(connection = { host: '10.0.4.200', port: 4321, available: true }) {
        const c = Object.create(AgHqplayerOutput.prototype);
        c._connection = connection;
        c._timerId = 'hqplayer-volume-test';
        c._watching = false;
        c._onScreen = false;
        c._applying = false;
        c._volumeDrag = null;
        c._loadStatus = vi.fn(async () => {});
        return c;
    }

    it('reads the status at once and every few seconds once the card is on screen', () => {
        const c = card();
        c._onScreen = true;
        c._syncVolumeWatch();
        expect(AgTimerManager.setInterval).toHaveBeenCalledWith(
            'hqplayer-volume-test', expect.any(Function), AgHqplayerOutput.VOLUME_POLL_MS);
        expect(c._loadStatus).toHaveBeenCalledTimes(1);
    });

    it('asks nothing while the card is out of sight', () => {
        const c = card();
        c._syncVolumeWatch();
        expect(AgTimerManager.setInterval).not.toHaveBeenCalled();
        expect(c._loadStatus).not.toHaveBeenCalled();
    });

    it('asks nothing of an HQPlayer that does not answer', () => {
        const c = card({ host: '10.0.4.200', port: 4321, available: false });
        c._onScreen = true;
        c._syncVolumeWatch();
        expect(AgTimerManager.setInterval).not.toHaveBeenCalled();
    });

    it('stops when the card leaves the screen, and starts once only', () => {
        const c = card();
        c._onScreen = true;
        c._syncVolumeWatch();
        c._syncVolumeWatch();
        expect(AgTimerManager.setInterval).toHaveBeenCalledTimes(1);
        c._onScreen = false;
        c._syncVolumeWatch();
        expect(AgTimerManager.clearInterval).toHaveBeenCalledWith('hqplayer-volume-test');
    });

    it('stops when the card goes away', () => {
        const c = card();
        c._onScreen = true;
        c._syncVolumeWatch();
        c.disconnectedCallback();
        expect(AgTimerManager.clearInterval).toHaveBeenCalledWith('hqplayer-volume-test');
    });

    it('skips a read while a change is applied, the slider moves, or a read is out', async () => {
        const c = card();
        c._applying = true;
        await c._followStatus();
        c._applying = false;
        c._volumeDrag = -20;
        await c._followStatus();
        c._volumeDrag = null;
        let answer;
        c._loadStatus = vi.fn(() => new Promise(r => { answer = r; }));
        const first = c._followStatus();
        await c._followStatus();               // a slow HQPlayer is not asked twice
        expect(c._loadStatus).toHaveBeenCalledTimes(1);
        answer();
        await first;
    });
});

describe('AgHqplayerOutput._loadStatus — only the latest read is kept', () => {
    beforeEach(() => apiGet.mockReset());

    it('drops an answer that lands after a later read', async () => {
        // A read of the watch in flight when a volume is applied answers with
        // HQPlayer as it was: landing last, it put the old volume back on screen.
        const c = Object.create(AgHqplayerOutput.prototype);
        c._statusSeq = 0;
        let late;
        apiGet.mockImplementationOnce(() => new Promise(r => { late = r; }));
        apiGet.mockResolvedValueOnce({ volume_db: -20 });
        const before = c._loadStatus();
        await c._loadStatus();
        late({ volume_db: -6 });
        await before;
        expect(c._status).toEqual({ volume_db: -20 });
    });
});

describe('AgHqplayerOutput — another HQPlayer shown, nothing of the first kept', () => {
    beforeEach(() => { loadConnection.mockReset(); apiGet.mockReset(); });
    afterEach(() => loadConnection.mockReset());

    /** A card that has read `connection`'s status and lists, then reloads to `next`. */
    async function switched(connection, next) {
        const c = Object.create(AgHqplayerOutput.prototype);
        c._connection = connection;
        c._status = { volume_db: -6, volume_min_db: -60, volume_max_db: -3 };
        c._filters = [{ value: 66, name: 'sinc-short' }];
        c._shapers = [{ value: 4, name: 'ASDM5' }];
        c._modes = [{ value: 1, name: 'SDM (DSD)' }];
        c._statusSeq = 3;
        c._dspExpanded = false;
        c._watching = false;
        c._syncVolumeWatch = vi.fn();
        loadConnection.mockImplementationOnce(async (host) => { host._connection = next; });
        await c._loadConnection();
        return c;
    }

    it("drops the Mac's volume and lists when this box's own HQPlayer starts", async () => {
        const c = await switched({ host: '10.0.4.200', port: 4321, local: false, available: true },
                                 { ...LOCAL });
        expect(c._status).toBeNull();
        expect(c._filters).toEqual([]);
        expect(c._statusSeq).toBe(4);          // a read in flight for the Mac is dropped
    });

    it('keeps them when the card still shows the same HQPlayer', async () => {
        const mac = { host: '10.0.4.200', port: 4321, local: false, available: true };
        const c = await switched(mac, { ...mac, naa_available: true });
        expect(c._status).not.toBeNull();
        expect(c._filters).toHaveLength(1);
    });

    it('reads the new lists at once when the DSP menu is open', async () => {
        const c = Object.create(AgHqplayerOutput.prototype);
        c._connection = { ...LOCAL };
        c._dspExpanded = true;
        c._watching = true;
        c._statusSeq = 0;
        c._loadDspOptions = vi.fn(async () => {});
        c._loadStatus = vi.fn(async () => {});
        c._forgetInstance();
        expect(c._loadDspOptions).toHaveBeenCalledTimes(1);
        expect(c._loadStatus).toHaveBeenCalledTimes(1);
    });

    it('reads the new one at once even while a read of the one left is out', () => {
        // The watch skips a read while one is out — 2.4 s to the Mac's HQPlayer —
        // and the card showed a dash for up to one interval.
        const c = Object.create(AgHqplayerOutput.prototype);
        c._connection = { ...LOCAL };
        c._dspExpanded = false;
        c._watching = true;
        c._following = true;
        c._statusSeq = 0;
        c._loadStatus = vi.fn(async () => {});
        c._forgetInstance();
        expect(c._loadStatus).toHaveBeenCalledTimes(1);
    });
});

describe('AgHqplayerOutput — whether the card is on screen', () => {
    afterEach(() => { delete globalThis.IntersectionObserver; });

    it('goes by the latest entry when several queued up', () => {
        // Off screen and back before the callback ran: the oldest entry first.
        let callback;
        globalThis.IntersectionObserver = class {
            constructor(cb) { callback = cb; }
            observe() {}
            disconnect() {}
        };
        const c = Object.create(AgHqplayerOutput.prototype);
        c._loadConnection = vi.fn();
        c._syncVolumeWatch = vi.fn();
        c.connectedCallback();
        callback([{ isIntersecting: false }, { isIntersecting: true }]);
        expect(c._onScreen).toBe(true);
        callback([{ isIntersecting: true }, { isIntersecting: false }]);
        expect(c._onScreen).toBe(false);
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

    it('names a network HQPlayer Desktop or Embedded, as the card of this box does', () => {
        const desktop = makeEl({
            available: true, naa_available: true,
            product: 'Signalyst HQPlayer Desktop', engine_version: '5.28.1',
        });
        expect(renderToString(desktop._renderCard())).toContain('HQPlayer Desktop 5.28.1');
        const embedded = makeEl({
            available: true, naa_available: true,
            product: 'Signalyst HQPlayer Embedded', engine_version: '6.2.3',
        });
        expect(renderToString(embedded._renderCard())).toContain('HQPlayer Embedded 6.2.3');
    });

    it('keeps the plain name when the instance has not said what it is', () => {
        const el = makeEl({ available: true, naa_available: true, engine_version: '5.28.1' });
        expect(renderToString(el._renderCard())).toContain('HQPlayer 5.28.1');
    });

    it('does not name HQPlayer twice when the product already says it', () => {
        // Shown whole when the vendor prefix is missing — and it may start with HQPlayer.
        const el = makeEl({ available: true, product: 'HQPlayer 4 Desktop', engine_version: '4.22.0' });
        expect(el._cardName()).toBe('HQPlayer 4 Desktop 4.22.0');
        expect(renderToString(el._renderCard())).not.toContain('HQPlayer HQPlayer');
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
        expect(html).not.toContain('Disconnect');
    });

    it('labels the button Forget, and keeps the address in its accessible name', () => {
        // With the address in the label, the button left the card on a phone
        // (measured 2026-09-27: a 420 px row in a 270-380 px card, 320-430 px wide).
        const html = renderToString(makeEl({ ...LOCAL, configured_host: '10.0.4.200' })._renderCard());
        expect(html).toMatch(/>\s*Forget\s*<\/button>/);
        // No tooltip in the app: a screen reader reads the accessible name.
        expect(html).not.toContain('title=');
        expect(html).toContain('aria-label="Forget 10.0.4.200:4321"');
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

// ---------------------------------------------------------------------------
// The link to HQPlayer's own settings page. What this card does not do — the
// DSD rate, the licence key — is done there, and the manual already sends the
// reader to it.

describe('AgHqplayerOutput._webInterfaceUrl — the box\'s own settings page', () => {
    it('builds it on the host the browser reached this box with', () => {
        // Not an address the core composed: it cannot know whether the browser
        // came by a name, a LAN address or a tunnel.
        const el = makeEl({ ...LOCAL, web_port: 8088 });
        expect(el._webInterfaceUrl()).toBe(`http://${window.location.hostname}:8088`);
    });

    it('offers it on the card', () => {
        const html = renderToString(makeEl({ ...LOCAL, web_port: 8088 })._renderCard());
        expect(html).toContain(`href="http://${window.location.hostname}:8088"`);
        expect(html).toContain('Web UI');
        expect(html).toContain('target="_blank"');
        expect(html).toContain('rel="noopener noreferrer"');
    });

    it('offers nothing for an HQPlayer on the network', () => {
        // HQPlayer Desktop serves no web interface, and nothing of ours listens
        // on that port there — the core sends no port for it either.
        const el = makeEl({ available: true, naa_available: true, web_port: null });
        expect(el._webInterfaceUrl()).toBeNull();
        expect(renderToString(el._renderCard())).not.toContain('Web UI');
    });

    it('offers nothing when the instance declares no web interface', () => {
        const el = makeEl({ ...LOCAL, web_port: null });
        expect(el._webInterfaceUrl()).toBeNull();
        expect(renderToString(el._renderCard())).not.toContain('Web UI');
    });

    it('still offers it while HQPlayer does not answer', () => {
        // Its web port keeps answering while its control port refuses — measured
        // on an expired trial — and that page is where a licence key is entered.
        const html = renderToString(
            makeEl({ ...LOCAL, available: false, web_port: 8088 })._renderCard());
        expect(html).toContain('Offline');
        expect(html).toContain('Web UI');
    });
});

// ---------------------------------------------------------------------------
// The action row on a phone
// ---------------------------------------------------------------------------
// The card clips what overflows it. With DSP, Web UI and Forget, the row
// is wider than a phone's card: without wrapping, the last button was cut off
// (measured 2026-09-27 at 320 px, still true after the label was shortened).

describe('AgHqplayerOutput — action row', () => {
    const css = readStylesheet('css', 'components', 'library-sources.css');

    it('wraps its buttons rather than letting the card cut the last one', () => {
        expect(cssRuleBody(css, '.lib-hqp-actions')).toMatch(/flex-wrap:\s*wrap/);
    });

    it('is never told not to wrap by a later rule', () => {
        // A more specific selector or a media query would win over the rule above.
        expect(css).not.toMatch(/\.lib-hqp-actions[^{}]*\{[^}]*flex-wrap:\s*nowrap/);
    });
});
