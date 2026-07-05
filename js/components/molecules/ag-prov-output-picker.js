/**
 * @module AgProvOutputPicker
 * @description Audio-output picker for the audio-stack provisioning flow. Renders
 * the detected output candidates as selectable radio cards (USB DAC / onboard /
 * HDMI), marking the recommended one. Controlled component: the parent owns the
 * selection and passes it via `selected` (the candidate `hw` string); each click
 * emits `output-select` with the chosen candidate.
 *
 * Extracted from ag-audio-stack-provisioning so the same picker serves the guided
 * config editor, the INITIALIZE-all dialog and (for now) the provisioning panel.
 *
 * @element ag-prov-output-picker
 * @prop {Array} outputs - Detected output candidates (from /audio-stack/status).
 * @prop {string} selected - `hw` of the currently selected candidate.
 * @fires output-select - Bubbles. detail: { output } — the chosen candidate.
 * @dependency js/components/utils-lit.js
 * @dependency js/ag-icons.js
 * @dependency css/audio-stack.css
 */
import { LitElement, html, nothing } from 'lit';
import { svgIcon } from '../utils-lit.js';
import { iconConnectorUsbA, iconHardDrive, iconRadio, iconCircle, iconStar } from '../../ag-icons.js';

export class AgProvOutputPicker extends LitElement {
    static properties = {
        outputs: { type: Array },
        selected: { type: String },
    };

    constructor() {
        super();
        this.outputs = [];
        this.selected = null;
    }

    createRenderRoot() {
        return this; // Light DOM (global theme + audio-stack.css)
    }

    /**
     * Select a candidate and notify the parent.
     * @param {object} output - The chosen output candidate.
     */
    _select(output) {
        this.selected = output.hw;
        this.dispatchEvent(new CustomEvent('output-select', {
            detail: { output }, bubbles: true, composed: true,
        }));
    }

    render() {
        if (!this.outputs?.length) {
            return html`<div class="ag-prov-empty">No audio outputs detected</div>`;
        }
        return html`<div class="ag-prov-list">${this.outputs.map(o => this._card(o))}</div>`;
    }

    _card(o) {
        const selected = o.hw === this.selected;
        return html`
            <button class="ag-prov-card ${selected ? 'selected' : ''}" @click=${() => this._select(o)}>
                ${svgIcon(selected ? iconRadio : iconCircle)}
                <span class="ag-prov-card-icon">${svgIcon(o.is_usb_dac ? iconConnectorUsbA : iconHardDrive)}</span>
                <span class="ag-prov-card-label">${o.label}</span>
                ${o.recommended
                    ? html`<span class="ag-prov-rec" title="Recommended" aria-label="Recommended">${svgIcon(iconStar)}</span>`
                    : nothing}
            </button>`;
    }
}

customElements.define('ag-prov-output-picker', AgProvOutputPicker);
