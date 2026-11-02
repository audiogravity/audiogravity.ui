/**
 * @module ag-vu-meter
 * @description Two analog VU meters, left and right, moved by what the box's MPD plays.
 *
 * The levels come from the core (`GET /player/levels`, library-store's subscribeLevels):
 * 25 a second, each sent when the DAC plays it, in dB below full scale. The needles move
 * as a VU meter's do — critically damped, 99 % of the way in 300 ms — between those
 * values, at the screen's frame rate. The dials are drawn once; each frame only turns
 * the two needles (no render of the component).
 *
 * Seen or not, a meter subscribed keeps MPD's copy of its stream on: it subscribes
 * while it is in the page and the page is visible, and its frames stop when the needles
 * rest.
 *
 * The scale is a VU meter's: a needle's deflection follows the signal's amplitude,
 * +3 VU at full deflection, so the marks crowd towards −20. 0 VU stands at
 * VU_REFERENCE_DBFS, set on today's loud records, measured on 2026-11-01 — "Elle" (-M-,
 * the whole track: RMS 40 ms median −12.8 dBFS, 90 % below −8.7) and "Am I Dreaming"
 * (Metro Boomin, Qobuz 96 kHz, as the meter's stream sent it: median −12.3, 90 % below
 * −10.7). At −10 the needles stay near −2.4 VU, reach the red in the loud passages (21 %
 * of "Elle", never for the other) and never pin; at −14, set first on a quiet passage,
 * "Elle" stood in the red 60 % of the time and pinned 36 %. A quiet acoustic recording in
 * DSD, near −38, barely moves them — as a real VU meter does.
 *
 * The dials are monochrome: one ink, the theme's text, in the player and the showcase
 * alike (the user's choice, 2026-11-02).
 *
 * @property {'stack'|'row'|'auto'} layout - Left above right, side by side, or side by
 *     side in landscape and stacked in portrait.
 * @property {boolean} fit - Fit the dials into the box the parent gives the meter, its
 *     height as well as its width — with layout stack (the full-screen player, in the
 *     cover's square) or auto (the showcase, which must not scroll on a phone on its
 *     side). Without it the dials take their width, and their height follows.
 * @property {boolean} live - Follow the core's stream; false to feed it with setLevels
 *     (stories, tests).
 */

import { LitElement, html, svg, nothing } from 'lit';
import { subscribeLevels } from '../../library-store.js';

/** Where 0 VU stands, in dBFS RMS. */
export const VU_REFERENCE_DBFS = -10;

/** The amplitude of full deflection, relative to 0 VU: +3 VU. */
const FULL_SCALE = 10 ** (3 / 20);

/** The needle's natural angular frequency: critically damped, 99 % in ~300 ms. */
const OMEGA = 22;

/** Degrees either side of the vertical a needle sweeps. */
const SWEEP = 45;

/** Without a level for this long, the needles fall back: the sound stopped. */
const SILENT_AFTER_MS = 300;

/** The dial's drawing, in its own units: the SVG's viewBox. */
const W = 342;
const H = 165;
const CX = W / 2;
/** The drawing's proportions, for the stylesheet's fitted size (fit): the viewBox's. */
const ASPECT = W / H;
const CY = H * 1.18;
const R = H * 0.92;
const TICK = H * 0.06;

/** The marks with a number, in VU, and the short ones between. */
const MARKS = [-20, -10, -7, -5, -3, -2, -1, 0, 1, 2, 3];
const MINOR_MARKS = [-15, -8.5, -6, -4];

/**
 * The amplitude a level asks of the needle, 1 being 0 VU.
 *
 * @param {number|null} db - The level, dB below full scale; null for silence.
 * @param {number} [reference] - Where 0 VU stands, dBFS.
 * @returns {number} The amplitude; 0 for silence.
 */
export function vuAmplitude(db, reference = VU_REFERENCE_DBFS) {
    if (db === null || db === undefined || !Number.isFinite(db)) return 0;
    return 10 ** ((db - reference) / 20);
}

/**
 * The needle's angle for an amplitude: −SWEEP at rest, +SWEEP at +3 VU, a little past it
 * when pinned.
 *
 * @param {number} amplitude - From vuAmplitude.
 * @returns {number} Degrees from the vertical.
 */
export function needleAngle(amplitude) {
    const deflection = Math.max(0, Math.min(1.06, amplitude / FULL_SCALE));
    return -SWEEP + 2 * SWEEP * deflection;
}

/**
 * One step of a VU needle's movement towards its target: critically damped.
 *
 * @param {number} position - The needle's amplitude now.
 * @param {number} velocity - Its speed, per second.
 * @param {number} target - The amplitude the signal asks.
 * @param {number} dt - Seconds since the last step; 50 ms at most is taken.
 * @returns {[number, number]} The new position and speed.
 */
export function stepNeedle(position, velocity, target, dt) {
    // The movement's own solution over the step, not an approximation of it: right at
    // any frame rate (an Euler step at 60 fps took 370 ms, not 300, to reach 99 %).
    const step = Math.min(Math.max(dt, 0), 0.05);
    const offset = position - target;
    const k = velocity + OMEGA * offset;
    const decay = Math.exp(-OMEGA * step);
    return [target + (offset + k * step) * decay, (velocity - OMEGA * k * step) * decay];
}

function point(degrees, radius) {
    const a = degrees * Math.PI / 180;
    return [CX + radius * Math.sin(a), CY - radius * Math.cos(a)];
}

function fixed(n) { return n.toFixed(1); }

function arc(from, to, radius) {
    const [x1, y1] = point(from, radius);
    const [x2, y2] = point(to, radius);
    return `M${fixed(x1)} ${fixed(y1)} A${fixed(radius)} ${fixed(radius)} 0 0 1 ${fixed(x2)} ${fixed(y2)}`;
}

function markAngle(vu) { return needleAngle(10 ** (vu / 20)); }

/** The dial, computed once: the same for every meter. */
const DIAL = (() => {
    let ticks = '';
    const labels = [];
    for (const vu of MARKS) {
        const a = markAngle(vu);
        const [x1, y1] = point(a, R);
        const [x2, y2] = point(a, R + TICK);
        ticks += `M${fixed(x1)} ${fixed(y1)} L${fixed(x2)} ${fixed(y2)} `;
        const [lx, ly] = point(a, R + TICK + H * 0.085);
        labels.push({ x: fixed(lx), y: fixed(ly), text: vu > 0 ? `+${vu}` : String(vu).replace('-', '−'), red: vu > 0 });
    }
    for (const vu of MINOR_MARKS) {
        const a = markAngle(vu);
        const [x1, y1] = point(a, R);
        const [x2, y2] = point(a, R + TICK * 0.55);
        ticks += `M${fixed(x1)} ${fixed(y1)} L${fixed(x2)} ${fixed(y2)} `;
    }
    return {
        arc: arc(markAngle(-20), markAngle(3), R),
        red: arc(markAngle(0), markAngle(3), R + H * 0.025),
        ticks,
        labels,
        needleTop: fixed(CY - (R + TICK * 0.6)),
    };
})();

/** What the meter says when it cannot follow, by the core's reason. */
const UNAVAILABLE = {
    not_configured: 'The level meter is not set up on this box.',
    mpd_unreachable: 'The level meter cannot reach the music player right now.',
    mpd_refused: 'The music player refused to turn the level meter on.',
    pipe_missing: 'The music player has not started the level meter yet.',
    pipe_unreadable: 'The level meter cannot read the music player.',
};

export class AgVuMeter extends LitElement {
    static properties = {
        layout:  { type: String, reflect: true },
        fit:     { type: Boolean, reflect: true },
        live:    { type: Boolean },
        _status: { state: true },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.layout = 'stack';
        this.fit = false;
        this.live = true;
        /** The core's last word on the meter: off, starting, live, idle, unavailable. */
        this._status = null;
        this._unsubscribe = null;
        this._frame = null;
        this._lastFrameAt = null;
        /** The last levels, dB, and when they came. */
        this._levels = [null, null];
        this._levelsAt = -Infinity;
        /** Each needle's amplitude and speed. */
        this._needles = [[0, 0], [0, 0]];
        this._onLevel = this._onLevel.bind(this);
        this._tick = this._tick.bind(this);
        this._onVisibility = this._onVisibility.bind(this);
    }

    connectedCallback() {
        super.connectedCallback();
        document.addEventListener('visibilitychange', this._onVisibility);
        this._follow();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        document.removeEventListener('visibilitychange', this._onVisibility);
        this._unfollow();
        this._stopFrames();
    }

    updated(changed) {
        // The needles and the lamps, found once a render: the frames turn them, they do not
        // look for them (review, 2026-11-02: two lookups in the page at every frame).
        this._needleEls = [...this.querySelectorAll('.ag-vu-needle')];
        this._peakEls = [...this.querySelectorAll('.ag-vu-peak')];
        if (changed.has('live') && changed.get('live') !== undefined) {
            this._unfollow();
            this._follow();
        }
    }

    /**
     * Feed the meter by hand, as the core's stream would: stories and tests.
     *
     * @param {Array<number|null>} levels - Left and right, dB below full scale.
     */
    setLevels(levels) {
        this._onLevel('levels', levels);
    }

    /**
     * Tell the meter its state by hand, as the core's stream would: stories and tests.
     *
     * @param {{state: string, reason?: string}} status - The core's ``meter`` event.
     */
    setStatus(status) {
        this._onLevel('meter', status);
    }

    _follow() {
        if (!this.live || this._unsubscribe || document.visibilityState === 'hidden') return;
        this._unsubscribe = subscribeLevels(this._onLevel);
    }

    _unfollow() {
        if (this._unsubscribe) {
            this._unsubscribe();
            this._unsubscribe = null;
        }
    }

    _onVisibility() {
        // Hidden, nobody sees the needles: let the core turn MPD's copy off.
        if (document.visibilityState === 'hidden') {
            this._unfollow();
            this._stopFrames();
        } else {
            this._follow();
            this._startFrames();    // needles left up when it was hidden fall back
        }
    }

    _onLevel(name, payload) {
        if (name === 'meter') {
            this._status = payload;
            this._startFrames();    // stopped or gone: the needles fall back
            return;
        }
        if (name !== 'levels' || !Array.isArray(payload)) return;
        this._levels = [payload[0] ?? null, payload[1] ?? null];
        this._levelsAt = performance.now();
        // Digital silence with the needles at rest: nothing to draw (review, 2026-11-02 —
        // the frames ran on, 60 a second, for nothing).
        if (this._levels.some((db) => db !== null) || !this._needlesAtRest()) this._startFrames();
    }

    /** Whether both needles are at rest, and still. */
    _needlesAtRest() {
        return this._needles.every(([position, velocity]) =>
            Math.abs(position) <= 1e-3 && Math.abs(velocity) <= 1e-3);
    }

    _startFrames() {
        if (this._frame === null) this._frame = requestAnimationFrame(this._tick);
    }

    _stopFrames() {
        if (this._frame !== null) {
            cancelAnimationFrame(this._frame);
            this._frame = null;
        }
        this._lastFrameAt = null;
    }

    _tick(now) {
        this._frame = null;
        const dt = this._lastFrameAt === null ? 0 : (now - this._lastFrameAt) / 1000;
        this._lastFrameAt = now;
        const silent = now - this._levelsAt > SILENT_AFTER_MS;
        let moving = !silent && this._levels.some((db) => db !== null);
        const needles = this._needleEls ?? [];
        const peaks = this._peakEls ?? [];
        for (let ch = 0; ch < 2; ch++) {
            const db = silent ? null : this._levels[ch];
            const [position, velocity] = stepNeedle(...this._needles[ch], vuAmplitude(db), dt);
            this._needles[ch] = [position, velocity];
            if (Math.abs(position) > 1e-3 || Math.abs(velocity) > 1e-3) moving = true;
            needles[ch]?.setAttribute('transform', `rotate(${needleAngle(position).toFixed(2)} ${CX} ${fixed(CY)})`);
            // The peak lamp: the window just played went into the red.
            peaks[ch]?.classList.toggle('on', db !== null && db > VU_REFERENCE_DBFS + 3);
        }
        if (moving) {
            this._startFrames();
        } else {
            this._lastFrameAt = null;   // at rest: no frame until a level comes
        }
    }

    _face(channel, label) {
        const rest = `rotate(${-SWEEP} ${CX} ${fixed(CY)})`;
        return html`
            <div class="ag-vu-face" role="img" aria-label=${`${label} channel level meter`}>
                <svg class="ag-vu-dial" viewBox="0 0 ${W} ${H}" aria-hidden="true">
                    <path class="ag-vu-arc" d=${DIAL.arc}></path>
                    <path class="ag-vu-red" d=${DIAL.red}></path>
                    <path class="ag-vu-ticks" d=${DIAL.ticks}></path>
                    ${DIAL.labels.map((l) => svg`
                        <text class=${l.red ? 'ag-vu-label red' : 'ag-vu-label'} x=${l.x} y=${l.y}>${l.text}</text>`)}
                    <text class="ag-vu-name" x=${CX} y=${fixed(H * 0.63)}>VU</text>
                    <text class="ag-vu-channel" x="16" y=${fixed(H - 14)}>${channel}</text>
                    <text class="ag-vu-peak-label" x=${W - 34} y=${fixed(H - 14)}>PEAK</text>
                    <circle class="ag-vu-peak" cx=${W - 20} cy=${fixed(H - 18)} r="4"></circle>
                    <line class="ag-vu-needle" x1=${CX} y1=${fixed(CY)} x2=${CX} y2=${DIAL.needleTop}
                          transform=${rest}></line>
                </svg>
            </div>
        `;
    }

    render() {
        const status = this._status?.state;
        const message = status === 'unavailable'
            ? (UNAVAILABLE[this._status.reason] ?? 'The level meter is not available right now.')
            : null;
        return html`
            <div class="ag-vu-faces" style="--ag-vu-aspect: ${ASPECT}">
                ${this._face('L', 'Left')}
                ${this._face('R', 'Right')}
            </div>
            ${message ? html`<p class="ag-vu-message">${message}</p>` : nothing}
        `;
    }
}

customElements.define('ag-vu-meter', AgVuMeter);
