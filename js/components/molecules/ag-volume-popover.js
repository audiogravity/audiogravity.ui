/**
 * @module AgVolumePopover
 * @description Volume control molecule — trigger button + floating popover.
 * Renders a speaker icon button; on click, shows a popover with a range slider,
 * a numeric volume value, 0/100 labels, and ±1 step buttons.
 *
 * Open/close and live drag state are managed internally.
 * The popover anchors to the right of the trigger button so it never overflows
 * the right edge of the screen.
 *
 * @element ag-volume-popover
 *
 * @prop {number} volume - Current volume level (0–100), provided by the parent
 *
 * @fires volume-change - When the user changes the volume.
 *   detail: { volume: number }
 */

import { LitElement, html, nothing } from 'lit';
import { iconVolume } from '../../ag-icons.js';

/* ─── CSS injected once into <head> ─── */
const AVP_STYLES = `
ag-volume-popover { display: block; }

/* ── Trigger button ── */
.avp-wrap { position: relative; }
.avp-btn {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: var(--text-primary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    transition: background var(--transition-fast, .15s), color var(--transition-fast, .15s);
    flex-shrink: 0;
}
@media (hover: hover) {
    .avp-btn:hover { background: var(--bg-hover, var(--bg-tertiary)); }
}
.avp-btn:focus-visible { outline: 2px solid var(--accent-primary, #6366f1); outline-offset: 2px; }
.avp-btn.active { color: var(--accent-primary, #6366f1); }

/* ── Popover ── */
.avp-popover {
    position: absolute;
    bottom: calc(100% + 10px);
    right: 0;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: 10px 14px;
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.2);
    z-index: calc(var(--z-tabs, 100) + 3);
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 12px;
    white-space: nowrap;
}

/* Arrow pointing down, right-aligned */
.avp-popover::before,
.avp-popover::after {
    content: '';
    position: absolute;
    top: 100%;
    right: 10px;
    border-style: solid;
    border-left-color: transparent;
    border-right-color: transparent;
    border-bottom-color: transparent;
}
.avp-popover::before {
    border-width: 6px;
    border-top-color: var(--border-color);
}
.avp-popover::after {
    border-width: 5px;
    border-top-color: var(--bg-secondary);
    margin-top: -1px;
    right: 11px;
}

/* ── Popover internals ── */
.avp-header {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
}
.avp-icon { font-size: 18px; color: var(--text-secondary); }
.avp-val {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--text-primary);
    min-width: 2ch;
    line-height: 1;
}
.avp-track-wrap {
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.avp-labels {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: var(--text-tertiary);
    user-select: none;
    padding: 0 2px;
}
.avp-steps {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
}
.avp-step-btn {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: none;
    background: var(--bg-tertiary);
    color: var(--text-primary);
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background var(--transition-fast, .15s);
}
@media (hover: hover) {
    .avp-step-btn:hover { background: var(--bg-hover, var(--bg-tertiary)); }
}

/* ── Range slider ── */
.avp-slider {
    appearance: none;
    width: 160px;
    height: 20px;
    background: transparent;
    outline: none;
    cursor: pointer;
    padding: 0;
    margin: 0;
}
.avp-slider:focus-visible { outline: 2px solid var(--accent-primary, #6366f1); outline-offset: 2px; }
.avp-slider::-webkit-slider-runnable-track {
    height: 3px;
    background: linear-gradient(
        to right,
        var(--accent-primary, #6366f1) var(--avp-pct, 50%),
        var(--border-color) var(--avp-pct, 50%)
    );
    border-radius: var(--radius-full, 9999px);
}
.avp-slider::-webkit-slider-thumb {
    appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--accent-primary, #6366f1);
    cursor: pointer;
    margin-top: -4.5px;
}
.avp-slider::-moz-range-track {
    height: 3px;
    background: var(--border-color);
    border-radius: var(--radius-full, 9999px);
}
.avp-slider::-moz-range-progress {
    height: 3px;
    background: var(--accent-primary, #6366f1);
    border-radius: var(--radius-full, 9999px);
}
.avp-slider::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: none;
    background: var(--accent-primary, #6366f1);
    cursor: pointer;
}
`;

export class AgVolumePopover extends LitElement {
    static properties = {
        /** @type {number} Current volume from the parent (0–100) */
        volume:      { type: Number },
        _open:       { state: true },
        _liveVolume: { state: true },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.volume               = 0;
        this._open                = false;
        this._liveVolume          = null;
        this._pendingListenerTimer = null;
        this._boundClose = () => {
            this._open       = false;
            this._liveVolume = null;
        };
    }

    connectedCallback() {
        super.connectedCallback();
        this._injectStyles();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        clearTimeout(this._pendingListenerTimer);
        document.removeEventListener('click', this._boundClose);
    }

    // ------------------------------------------------------------------
    // Styles
    // ------------------------------------------------------------------

    _injectStyles() {
        if (document.getElementById('ag-avp-styles')) return;
        const s = document.createElement('style');
        s.id = 'ag-avp-styles';
        s.textContent = AVP_STYLES;
        document.head.appendChild(s);
    }

    // ------------------------------------------------------------------
    // Open / close
    // ------------------------------------------------------------------

    toggle(e) {
        e?.stopPropagation();
        if (this._open) {
            this._open       = false;
            this._liveVolume = null;
            clearTimeout(this._pendingListenerTimer);
            this._pendingListenerTimer = null;
            document.removeEventListener('click', this._boundClose);
        } else {
            this._open = true;
            this._pendingListenerTimer = setTimeout(() => {
                this._pendingListenerTimer = null;
                document.addEventListener('click', this._boundClose, { once: true });
            }, 0);
        }
    }

    close() {
        if (!this._open) return;
        this._open       = false;
        this._liveVolume = null;
        document.removeEventListener('click', this._boundClose);
    }

    // ------------------------------------------------------------------
    // Volume helpers
    // ------------------------------------------------------------------

    _onInput(e) {
        const vol = parseInt(e.target.value, 10);
        e.target.style.setProperty('--avp-pct', `${vol}%`);
        this._liveVolume = vol;
        this._emit(vol);
    }

    _step(delta) {
        const current = this._liveVolume ?? this.volume ?? 50;
        const vol = Math.max(0, Math.min(100, current + delta));
        this._liveVolume = vol;
        this._emit(vol);
    }

    _emit(volume) {
        this.dispatchEvent(new CustomEvent('volume-change', {
            detail: { volume },
            bubbles: true,
        }));
    }

    // ------------------------------------------------------------------
    // Render
    // ------------------------------------------------------------------

    render() {
        const vol = this._liveVolume ?? this.volume ?? 0;
        return html`
            <div class="avp-wrap">
                <button class="avp-btn ${this._open ? 'active' : ''}"
                    aria-label="Volume" title="Volume"
                    @click=${(e) => this.toggle(e)}>
                    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconVolume}</svg>
                </button>

                ${this._open ? html`
                    <div class="avp-popover"
                        @click=${(e) => e.stopPropagation()}
                        @touchstart=${(e) => e.stopPropagation()}
                        @touchmove=${(e) => e.stopPropagation()}
                        @touchend=${(e) => e.stopPropagation()}>
                        <div class="avp-header">
                            <svg class="avp-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconVolume}</svg>
                            <span class="avp-val">${vol}</span>
                        </div>
                        <div class="avp-track-wrap">
                            <input class="avp-slider" type="range" min="0" max="100"
                                .value=${String(vol)}
                                style="--avp-pct: ${vol}%"
                                aria-label="Volume"
                                @input=${(e) => this._onInput(e)}
                            />
                            <div class="avp-labels">
                                <span>0</span>
                                <span>100</span>
                            </div>
                        </div>
                        <div class="avp-steps">
                            <button class="avp-step-btn" aria-label="Volume down"
                                @click=${() => this._step(-1)}>−</button>
                            <button class="avp-step-btn" aria-label="Volume up"
                                @click=${() => this._step(1)}>+</button>
                        </div>
                    </div>
                ` : nothing}
            </div>
        `;
    }
}

customElements.define('ag-volume-popover', AgVolumePopover);
