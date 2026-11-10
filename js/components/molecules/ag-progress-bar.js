/**
 * @module AgProgressBar
 * @description Progress bar molecule for the Now Playing fullscreen player.
 * Manages a local elapsed ticker and seek interactions independently of the
 * SSE polling interval, so the knob moves smoothly every second.
 *
 * The parent provides server-authoritative state; the molecule reconciles it:
 * - New track (another title, or another source): the position the source reports.
 *   When it reports none, 0 for a new play on the same source; for another source's
 *   track, where a bar last saw it (see `_positions`).
 * - Paused or post-seek: accept server position.
 * - Server ahead of local: snap forward.
 * - Server went back — a report lower than the source's previous one by more than
 *   WENT_BACK_S: a restart, a seek from another controller, the next track of the
 *   same name. Follow it back.
 * - Server behind local without going back: keep local. A report can be up to 2 s old
 *   (the pipeline's metadata cache) and the ticker up to a second ahead; following
 *   such a report would step the bar back at every one of them.
 * - A report of 0, or none, is no position: some sources say 0 all along (AirPlay
 *   through shairport-sync 4.3.7, Debian's — it declares an MPRIS Position and never
 *   fills it, read in its source). A restart reported as 0 is followed on the report
 *   after it, the first that is a position.
 * - A blank title is no track: the bar keeps the one it shows, and a title that comes
 *   back the same is not a new play.
 * - On a source that has given no position on this track, a new length under the same
 *   title is a new track: two tracks of the same name follow each other, and nothing
 *   else would say so.
 *
 * @element ag-progress-bar
 *
 * @prop {?number} serverElapsed - Server-authoritative playback position (seconds),
 *                                  null when the source reports none.
 * @prop {number}  duration      - Total track duration (seconds).
 * @prop {boolean} canSeek       - Whether seek interaction is enabled.
 * @prop {boolean} playing       - Whether playback is active (drives local ticker).
 * @prop {string}  title         - Current track title — change signals a new track.
 * @prop {string}  source        - The source playing it (its source_id). A new title on
 *                                  the same source is a new play; on another source, a
 *                                  track that may be well under way.
 * @attr {boolean} compact       - Mini-player variant: hides the elapsed /
 *                                  remaining times row AND the position knob.
 *                                  Seeking still follows `can-seek`; the
 *                                  mini-player passes none, so its bar shows
 *                                  the position only (seeking is the
 *                                  full-screen player's).
 * @attr {boolean} live          - A live broadcast: no end to count down to and
 *                                  no position to seek to, so the bar gives way
 *                                  to a "Live" marker (its dot dims when paused)
 *                                  and nothing ticks. See `isLiveStream()`.
 *
 * Seek interaction: pointer-events based. Tap the track to jump to that
 * position; press-and-drag to scrub (touch + mouse). The local elapsed mirrors
 * the finger/cursor position during drag and the ticker is paused so the knob
 * doesn't fight the user. The `seek` event fires once at pointerup with the
 * final position.
 *
 * @fires seek - Bubbles. detail: { secs: number } — requested playback position.
 *
 * @dependency css/components/progress-bar.css
 */
import { LitElement, html, nothing } from 'lit';
import { fmtDuration } from '../utils-lit.js';

/**
 * How far below the source's previous report a new one must fall to mean the source
 * went back (s). Reports never go back on their own: the core publishes them in the
 * order it read them, and a read served from the pipeline's 2 s cache repeats a value,
 * never an older one (read in the core, 2026-11-02: player/service.py
 * `_publish_if_current`, audio_pipeline `_metadata_cache`; none went back on MPD that
 * day, measured). The second of slack is for a UPnP speaker, whose position the core
 * runs on between two of its reports (upnp_renderer) — the next one may land a little
 * behind.
 */
const WENT_BACK_S = 1;

/**
 * How far two lengths may differ and still be the same track's (s): a source that gives
 * its track's length gives the same one all along.
 */
const SAME_LENGTH_S = 1;

/**
 * Where each source's track stands: source → { title, elapsed, report }, written by
 * every bar as it ticks and when it goes. Read back when a bar is created again — the
 * full player closed and reopened, the mini-player's bar gone with a station and back
 * with a track — and when a bar turns to another playing source that reports no position.
 *
 * Keyed by source and holding one track each, never by title: a title met again — the
 * track before, replayed with Previous — is a new play, and a page-wide map of titles
 * resumed it where it had been left, then kept it there. One entry per source also
 * bounds it; the map of titles grew with every track played while the page was open.
 *
 * `report` is the source's last position a bar received. The position kept is only
 * where the bar had got to: a track the source restarted while no bar showed it is
 * still remembered well under way, and its first report, lower than the last one
 * received, is what tells the next bar that the source went back.
 */
const _positions = new Map();

/**
 * Forget every source's position. For tests: nothing in the application calls it.
 */
export function forgetPositions() {
    _positions.clear();
}

/**
 * Where a source's track stood when a bar last saw it.
 * @param {string} source - The source.
 * @param {string} title  - The track it must still be playing.
 * @returns {{elapsed: number, report: ?number}|undefined} Where the bar had got to and
 *   the source's last position received, or undefined when the source has moved on to
 *   another track since, or was never seen.
 */
function remembered(source, title) {
    const kept = _positions.get(source);
    return kept && kept.title === title ? kept : undefined;
}

export class AgProgressBar extends LitElement {
    static properties = {
        serverElapsed: { type: Number },
        duration:      { type: Number },
        canSeek:       { type: Boolean, attribute: 'can-seek' },
        playing:       { type: Boolean },
        title:         { type: String },
        source:        { type: String },
        compact:       { type: Boolean },
        live:          { type: Boolean },
        _elapsed:      { state: true },
        _dragging:     { state: true },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.serverElapsed = 0;
        this.duration      = 0;
        this.canSeek       = false;
        this.playing       = false;
        this.title         = '';
        this.source        = '';
        this.compact       = false;
        this.live          = false;
        this._elapsed      = 0;
        this._dragging     = false;
        this._seekPending  = false;
        this._ticker       = null;
        this._prevTitle    = null;
        this._prevSource   = null;
        this._prevDuration = 0;
        // The source's last report that was a position (> 0) on the current track.
        this._lastReport   = null;
        this._trackEl      = null;
        this._boundDragMove = (e) => this._onDragMove(e);
        this._boundDragEnd  = (e) => this._onDragEnd(e);
    }

    connectedCallback() {
        super.connectedCallback();
        // Pick the track up where a bar last saw it (survives destroy/recreate cycles),
        // and the source's last position with it, so a source that went back meanwhile
        // is seen to have.
        const kept = this.title ? remembered(this.source, this.title) : undefined;
        if (kept) {
            this._elapsed = kept.elapsed;
            this._lastReport = kept.report;
        }
        // Ensure the ticker restarts after recreate (e.g. fullscreen close/reopen).
        this.updateComplete.then(() => this._syncTicker());
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        // Leave the position behind for the next bar.
        if (this.title && this._elapsed > 0) this._remember();
        clearInterval(this._ticker);
        this._ticker = null;
        window.removeEventListener('pointermove', this._boundDragMove);
        window.removeEventListener('pointerup',   this._boundDragEnd);
        window.removeEventListener('pointercancel', this._boundDragEnd);
    }

    updated(changed) {
        // First, before the new-track branch below returns: a station giving way to a
        // track changes the title AND turns `live` off in the same update, and a
        // track can start playing as its title changes — either way the ticker has
        // to (re)start. It only arms or clears an interval, so running it before the
        // position is reconciled changes nothing else.
        if (changed.has('playing') || changed.has('live')) {
            this._syncTicker();
        }

        // A blank title is no track: a state that names none — between two tracks, or
        // the full player between two sources — leaves the bar on the track it shows.
        // Taken for one, a title blank for a moment then back meant two new plays, and
        // a source that gives no position restarted the bar at 0:00 mid-song.
        if (this.title && (changed.has('title') || changed.has('source') || changed.has('duration'))) {
            const first = this._prevTitle === null;
            const otherSource = !first && this.source !== this._prevSource;
            // Two tracks of the same name in a row: only their lengths may tell them
            // apart when the source gives no position — a position would have gone back.
            const otherLength = !first && this._lastReport === null && this._prevDuration > 0
                && this.duration > 0 && Math.abs(this.duration - this._prevDuration) > SAME_LENGTH_S;
            const trackChanged = !first && (otherSource || this.title !== this._prevTitle || otherLength);
            this._prevTitle = this.title;
            this._prevSource = this.source;
            this._prevDuration = this.duration;
            if (trackChanged) {
                const report = this._report();
                const kept = otherSource ? remembered(this.source, this.title) : undefined;
                if (report > 0) {
                    this._elapsed = report;
                    this._lastReport = report;
                } else if (kept) {
                    // Another source's track, which may be well under way: where a bar
                    // last saw it, since the source gives no position.
                    this._elapsed = kept.elapsed;
                    this._lastReport = kept.report;
                } else {
                    // A new play on the same source starts at its beginning — the track
                    // before replayed with Previous included, whose old position a bar
                    // once held.
                    this._elapsed = 0;
                    this._lastReport = null;
                }
                this._seekPending = false;
                return;
            }
        }

        if (changed.has('serverElapsed') || changed.has('playing')) {
            const report = this._report();
            if (this._seekPending) {
                // Post-seek: snap to the first answer the source gives — a 0 included,
                // the answer to a seek to the start. The 0 of a source that gives no
                // position is never this one: such a source offers no seek (AirPlay:
                // the core reads shairport-sync's CanSeek, false).
                if (report !== null) {
                    this._elapsed = report;
                    this._seekPending = false;
                }
            } else if (report > 0) {
                // A position: take it when paused (authoritative recalibration), when
                // it is ahead, or when the source went back.
                const wentBack = this._lastReport !== null && report < this._lastReport - WENT_BACK_S;
                if (!this.playing || report > this._elapsed || wentBack) {
                    this._elapsed = report;
                }
            }
            // A report of 0 or none moves nothing — see the class comment.
            if (report > 0) this._lastReport = report;
        }
    }

    /**
     * The position the source reports.
     * @returns {number|null} Seconds, or null when it reports none.
     */
    _report() {
        return Number.isFinite(this.serverElapsed) ? this.serverElapsed : null;
    }

    /** Leave where this source's track stands for the next bar to read. */
    _remember() {
        _positions.set(this.source, { title: this.title, elapsed: this._elapsed, report: this._lastReport });
    }

    _syncTicker() {
        // A live broadcast shows no time: nothing to tick.
        if (this.playing && !this.live) {
            if (!this._ticker) {
                this._ticker = setInterval(() => {
                    if (this._dragging) return;
                    this._elapsed += 1;
                    if (this.title) this._remember();
                }, 1000);
            }
        } else {
            clearInterval(this._ticker);
            this._ticker = null;
        }
    }

    _pct() {
        if (!this.duration || !this._elapsed) return 0;
        return Math.min(100, (this._elapsed / this.duration) * 100);
    }

    _secsFromPointer(clientX) {
        if (!this._trackEl || !this.duration) return 0;
        const rect = this._trackEl.getBoundingClientRect();
        const pos  = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        return Math.round(pos * this.duration);
    }

    _onPointerDown(e) {
        if (!this.canSeek || !this.duration) return;
        // Block native click/scroll fallbacks so the drag owns the gesture.
        e.preventDefault();
        this._trackEl = e.currentTarget;
        this._dragging = true;
        this._elapsed = this._secsFromPointer(e.clientX);
        window.addEventListener('pointermove',   this._boundDragMove);
        window.addEventListener('pointerup',     this._boundDragEnd);
        window.addEventListener('pointercancel', this._boundDragEnd);
    }

    _onDragMove(e) {
        if (!this._dragging) return;
        this._elapsed = this._secsFromPointer(e.clientX);
    }

    _onDragEnd(e) {
        if (!this._dragging) return;
        this._dragging = false;
        const secs = this._secsFromPointer(e.clientX);
        this._elapsed     = secs;
        this._seekPending = true;
        window.removeEventListener('pointermove',   this._boundDragMove);
        window.removeEventListener('pointerup',     this._boundDragEnd);
        window.removeEventListener('pointercancel', this._boundDragEnd);
        this.dispatchEvent(new CustomEvent('seek', {
            bubbles: true, composed: true, detail: { secs },
        }));
    }

    render() {
        if (this.live) {
            return html`
                <div class="ag-pb-live ${this.playing ? '' : 'ag-pb-live--paused'}">
                    <span class="ag-pb-live-dot" aria-hidden="true"></span>Live
                </div>
            `;
        }
        const pct = this._pct();
        const dur = this.duration;
        return html`
            <div class="ag-pb-track ${this.canSeek ? '' : 'no-seek'} ${this._dragging ? 'dragging' : ''}"
                 @pointerdown=${this._onPointerDown}>
                <div class="ag-pb-cap ag-pb-cap--start"></div>
                <div class="ag-pb-cap ag-pb-cap--end"></div>
                <div class="ag-pb-fill" style="width:${pct}%"></div>
                ${this.compact ? nothing : html`<div class="ag-pb-knob" style="left:${pct}%"></div>`}
            </div>
            ${this.compact ? nothing : html`
                <div class="ag-pb-times">
                    <span>${fmtDuration(this._elapsed)}</span>
                    <span>−${fmtDuration(Math.max(0, dur - this._elapsed))}</span>
                </div>
            `}
        `;
    }
}

customElements.define('ag-progress-bar', AgProgressBar);
