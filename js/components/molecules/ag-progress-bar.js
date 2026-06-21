/**
 * @module AgProgressBar
 * @description Progress bar molecule for the Now Playing fullscreen player.
 * Manages a local elapsed ticker and seek interactions independently of the
 * SSE polling interval, so the knob moves smoothly every second.
 *
 * The parent provides server-authoritative state; the molecule reconciles it:
 * - New track (title change): snap to server position.
 * - Paused or post-seek: accept server position.
 * - Server ahead of local: snap forward.
 * - Server behind local (stale cache): keep local — never rewind.
 *
 * @element ag-progress-bar
 *
 * @prop {number}  serverElapsed - Server-authoritative playback position (seconds).
 * @prop {number}  duration      - Total track duration (seconds).
 * @prop {boolean} canSeek       - Whether seek interaction is enabled.
 * @prop {boolean} playing       - Whether playback is active (drives local ticker).
 * @prop {string}  title         - Current track title — change signals a new track.
 * @attr {boolean} compact       - Mini-player variant: hides the elapsed /
 *                                  remaining times row AND the position knob
 *                                  (the bar stays scrubbable — the dragging
 *                                  highlight on the track is the only visual).
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

// Shared elapsed cache — survives component destroy/recreate cycles.
// Keyed by track title so the progress bar can restore its position
// when the DOM node is recreated (e.g. fullscreen open/close, mini-player re-render).
const _elapsedCache = new Map();

export class AgProgressBar extends LitElement {
    static properties = {
        serverElapsed: { type: Number },
        duration:      { type: Number },
        canSeek:       { type: Boolean, attribute: 'can-seek' },
        playing:       { type: Boolean },
        title:         { type: String },
        compact:       { type: Boolean },
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
        this.compact       = false;
        this._elapsed      = 0;
        this._dragging     = false;
        this._seekPending  = false;
        this._ticker       = null;
        this._prevTitle    = null;
        this._trackEl      = null;
        this._boundDragMove = (e) => this._onDragMove(e);
        this._boundDragEnd  = (e) => this._onDragEnd(e);
    }

    connectedCallback() {
        super.connectedCallback();
        // Restore elapsed from shared cache (survives destroy/recreate cycles).
        if (this.title && _elapsedCache.has(this.title)) {
            this._elapsed = _elapsedCache.get(this.title);
        }
        // Ensure the ticker restarts after recreate (e.g. fullscreen close/reopen).
        this.updateComplete.then(() => this._syncTicker());
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        // Save elapsed to shared cache before destruction.
        if (this.title && this._elapsed > 0) {
            _elapsedCache.set(this.title, this._elapsed);
        }
        clearInterval(this._ticker);
        this._ticker = null;
        window.removeEventListener('pointermove', this._boundDragMove);
        window.removeEventListener('pointerup',   this._boundDragEnd);
        window.removeEventListener('pointercancel', this._boundDragEnd);
    }

    updated(changed) {
        if (changed.has('title')) {
            const trackChanged = this._prevTitle !== null && this.title !== this._prevTitle;
            this._prevTitle = this.title;
            if (trackChanged) {
                // New track — use server value, or restore from cache.
                this._elapsed = this.serverElapsed > 0
                    ? this.serverElapsed
                    : (_elapsedCache.get(this.title) ?? 0);
                this._seekPending = false;
                return;
            }
        }

        if (changed.has('serverElapsed') || changed.has('playing')) {
            if (this._seekPending) {
                // Post-seek: always snap to server position.
                this._elapsed = this.serverElapsed;
                this._seekPending = false;
            } else if (this.serverElapsed > 0) {
                // Server reports a real position — use it if it moved forward
                // or if we're paused (authoritative recalibration).
                if (!this.playing || this.serverElapsed > this._elapsed) {
                    this._elapsed = this.serverElapsed;
                }
            }
            // When serverElapsed is 0 (AirPlay) and _elapsed > 0:
            // keep the locally interpolated value — never reset to 0.
        }

        if (changed.has('playing')) {
            this._syncTicker();
        }
    }

    _syncTicker() {
        if (this.playing) {
            if (!this._ticker) {
                this._ticker = setInterval(() => {
                    if (this._dragging) return;
                    this._elapsed += 1;
                    if (this.title) _elapsedCache.set(this.title, this._elapsed);
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
