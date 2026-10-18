/**
 * @module AgProvGuidedSwitch
 * @description The shape of a switch in the guided setup (ag-guided-config): a labelled
 * on/off with, under it, what it does — or why it is disabled. Not an element of its
 * own: each switch extends it with its texts and the event it fires
 * (ag-prov-dop-switch, ag-prov-dsd-volume-switch).
 *
 * Controlled: the parent holds the value and applies it with the other guided fields.
 * The switch is disabled, and says why, when its value cannot be read (`checked` null),
 * and while another output is chosen but not applied yet: what it shows then is the
 * other DAC's.
 *
 * @prop {boolean|null} checked - On or off; null when the value cannot be read.
 * @prop {boolean} pending - Another output is chosen, not applied yet.
 * @prop {boolean} disabled - True while the parent applies a change.
 * @dependency js/components/atoms/ag-switch.js
 * @dependency css/audio-stack.css
 */
import { LitElement, html } from 'lit';
import { live } from 'lit/directives/live.js';
import '../atoms/ag-switch.js';

export class AgProvGuidedSwitch extends LitElement {
    static properties = {
        checked: { type: Object },
        pending: { type: Boolean },
        disabled: { type: Boolean },
    };

    /** The switch's label — set by each switch. */
    static label = '';

    /** What the switch does, shown under it. */
    static hint = '';

    /** Why the switch is disabled when its value cannot be read. */
    static unknownHint = '';

    /** Why the switch is disabled while another output is chosen. */
    static pendingHint = '';

    /** The event fired, with `{ checked }`, when the switch is flipped. */
    static eventName = '';

    constructor() {
        super();
        this.checked = null;
        this.pending = false;
        this.disabled = false;
    }

    createRenderRoot() {
        return this; // Light DOM (global theme + audio-stack.css)
    }

    /** Whether the value could be read. */
    get _known() {
        return this.checked === true || this.checked === false;
    }

    /**
     * Relay a flip to the parent, which owns the value.
     * @param {CustomEvent} e - ag-switch's `ag-change`, `{ checked }`.
     */
    _onChange(e) {
        this.dispatchEvent(new CustomEvent(this.constructor.eventName, {
            detail: { checked: !!e.detail.checked },
            bubbles: true,
            composed: true,
        }));
    }

    /** The line under the switch: why it is disabled, else what it does. */
    get _hint() {
        const texts = this.constructor;
        if (this.pending) return texts.pendingHint;
        return this._known ? texts.hint : texts.unknownHint;
    }

    render() {
        const { label } = this.constructor;
        return html`
            <div class="ag-prov-switch">
                <div class="ag-prov-switch-row">
                    <span class="ag-prov-switch-label" aria-hidden="true">${label}</span>
                    <!-- live(): the switch flips itself on a tap, so the parent's value is
                         set again whatever was bound last. Off while another output is
                         chosen: what it shows is the other DAC's. -->
                    <ag-switch .checked=${live(!this.pending && this.checked === true)}
                        ?disabled=${this.disabled || this.pending || !this._known}
                        label=${label}
                        @ag-change=${this._onChange}></ag-switch>
                </div>
                <p class="ag-prov-switch-hint">${this._hint}</p>
            </div>`;
    }
}
