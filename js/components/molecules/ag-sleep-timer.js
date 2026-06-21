/**
 * @module AgSleepTimer
 * @description Sleep timer popover button. Stateless on the timer itself —
 * the parent owns the expiry timestamp and the timeout/tick lifecycle so the
 * countdown survives the parent's UI being torn down and remounted (e.g. the
 * fullscreen player closing and reopening).
 *
 * The molecule renders a clock button. On click it opens a popover with
 * preset durations (15/30/45/60 min) — selecting one emits `sleep-set`.
 * When `sleepEnd` is set, the button displays the remaining time and the
 * popover offers a `Cancel` option that emits `sleep-cancel`.
 *
 * @element ag-sleep-timer
 *
 * @attr {boolean} playing   - Whether playback is currently active.
 * @prop {number|null} sleepEnd - Expiry timestamp (Date.now() + ms), or null.
 *
 * @fires sleep-set    - Bubbles. detail: { minutes: number }.
 * @fires sleep-cancel - Bubbles. No detail.
 *
 * @dependency css/components/sleep-timer.css
 */
import { LitElement, html, nothing } from 'lit';
import { iconAlarm } from '../../ag-icons.js';

export class AgSleepTimer extends LitElement {
    static properties = {
        playing:  { type: Boolean },
        sleepEnd: { attribute: false },
        _open:    { state: true },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.playing  = false;
        this.sleepEnd = null;
        this._open    = false;
        this._tick    = null;
        this._boundClose = () => { this._open = false; };
    }

    updated(changed) {
        if (changed.has('sleepEnd')) this._syncTicker();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        clearInterval(this._tick);
        this._tick = null;
        document.removeEventListener('click', this._boundClose);
    }

    /** Local UI ticker — refreshes the countdown label every second. The
     *  authoritative timeout lives in the parent so expiry survives unmount. */
    _syncTicker() {
        clearInterval(this._tick);
        this._tick = this.sleepEnd
            ? setInterval(() => this.requestUpdate(), 1_000)
            : null;
    }

    _remaining() {
        if (!this.sleepEnd) return null;
        const secs = Math.max(0, Math.round((this.sleepEnd - Date.now()) / 1000));
        return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    }

    _emit(type, detail) {
        this.dispatchEvent(new CustomEvent(type, {
            detail, bubbles: true, composed: true,
        }));
    }

    _onSet(minutes) {
        this._open = false;
        this._emit('sleep-set', { minutes });
    }

    _onCancel() {
        this._open = false;
        this._emit('sleep-cancel');
    }

    _toggleOpen(e) {
        e.stopPropagation();
        this._open = !this._open;
        if (this._open) {
            setTimeout(() => document.addEventListener('click', this._boundClose, { once: true }), 0);
        }
    }

    render() {
        const active = !!this.sleepEnd;
        return html`
            <div class="ag-st-wrap">
                <button class="npfs-header-btn ${active ? 'active' : ''}" title="Sleep timer"
                    @click=${this._toggleOpen}>
                    ${active
                        ? html`<span class="ag-st-countdown">${this._remaining()}</span>`
                        : html`<svg viewBox="0 0 24 24" width="18" height="18" fill="none"
                                stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                                ${iconAlarm}
                            </svg>`
                    }
                </button>
                ${this._open ? html`
                    <div class="ag-st-popover" @click=${(e) => e.stopPropagation()}>
                        ${[15, 30, 45, 60].map(m => html`
                            <button class="ag-st-opt" @click=${() => this._onSet(m)}>${m} min</button>
                        `)}
                        ${active ? html`
                            <button class="ag-st-opt cancel"
                                @click=${() => this._onCancel()}>Cancel</button>
                        ` : nothing}
                    </div>
                ` : nothing}
            </div>
        `;
    }
}

customElements.define('ag-sleep-timer', AgSleepTimer);
