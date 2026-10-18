/**
 * @module AgProvDopSwitch
 * @description The guided setup's DoP switch for MPD: whether DSD leaves for the DAC
 * MPD plays on as DoP — DSD wrapped in PCM words, which the DAC unwraps. Off, DSD
 * goes out natively when the DAC accepts it, converted to PCM otherwise. On, MPD
 * tries DoP first, even for a DAC that takes native DSD: it is for a DAC that
 * decodes DoP but that Linux cannot send DSD to.
 *
 * Controlled: the parent (ag-guided-config) holds the value and applies it with the
 * other guided fields. The switch is disabled, and says why, when MPD cannot say what
 * it applies, and while another output is chosen but not applied yet: DoP is set on
 * the output MPD plays on, and belongs to one DAC.
 *
 * @element ag-prov-dop-switch
 * @prop {boolean|null} checked - DoP on; null when MPD cannot say.
 * @prop {boolean} pending - Another output is chosen, not applied yet.
 * @prop {boolean} disabled - True while the parent applies a change.
 * @fires dop-change - Bubbles, with `{ checked }`, when the switch is flipped.
 * @dependency js/components/atoms/ag-switch.js
 * @dependency css/audio-stack.css
 */
import { LitElement, html } from 'lit';
import { live } from 'lit/directives/live.js';
import '../atoms/ag-switch.js';

/** What the switch does, shown under it. */
export const DOP_HINT = 'Off: DSD goes out as DSD when your DAC accepts it, converted to PCM '
    + 'otherwise. Turn it on only for a DAC that decodes DoP and that Linux cannot send DSD to: '
    + 'DSD then leaves as DoP, even for a DAC that takes native DSD.';

/** Why the switch is disabled when MPD cannot say what it applies. */
export const DOP_UNKNOWN = 'Unavailable: MPD cannot say how it sends DSD to this output right now.';

/** Why the switch is disabled while another output is chosen. */
export const DOP_PENDING = 'Apply the new output first: DoP is set on the output MPD plays on.';

export class AgProvDopSwitch extends LitElement {
    static properties = {
        checked: { type: Object },
        pending: { type: Boolean },
        disabled: { type: Boolean },
    };

    constructor() {
        super();
        this.checked = null;
        this.pending = false;
        this.disabled = false;
    }

    createRenderRoot() {
        return this; // Light DOM (global theme + audio-stack.css)
    }

    /** Whether MPD said what it applies. */
    get _known() {
        return this.checked === true || this.checked === false;
    }

    /**
     * Relay a flip to the parent, which owns the value.
     * @param {CustomEvent} e - ag-switch's `ag-change`, `{ checked }`.
     */
    _onChange(e) {
        this.dispatchEvent(new CustomEvent('dop-change', {
            detail: { checked: !!e.detail.checked },
            bubbles: true,
            composed: true,
        }));
    }

    /** The line under the switch: why it is disabled, else what it does. */
    get _hint() {
        if (this.pending) return DOP_PENDING;
        return this._known ? DOP_HINT : DOP_UNKNOWN;
    }

    render() {
        return html`
            <div class="ag-prov-dop">
                <div class="ag-prov-dop-row">
                    <span class="ag-prov-dop-label" aria-hidden="true">Send DSD as DoP (DSD over PCM)</span>
                    <!-- live(): the switch flips itself on a tap, so the parent's value is
                         set again whatever was bound last. Off while another output is
                         chosen: what it shows is the other DAC's. -->
                    <ag-switch .checked=${live(!this.pending && this.checked === true)}
                        ?disabled=${this.disabled || this.pending || !this._known}
                        label="Send DSD as DoP (DSD over PCM)"
                        @ag-change=${this._onChange}></ag-switch>
                </div>
                <p class="ag-prov-dop-hint">${this._hint}</p>
            </div>`;
    }
}

customElements.define('ag-prov-dop-switch', AgProvDopSwitch);
