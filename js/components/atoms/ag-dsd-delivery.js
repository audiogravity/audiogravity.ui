/**
 * @module AgDsdDelivery
 * @description How a DSD track reaches the DAC, shown beside its format. The format
 * describes the track — a DSD128 file reads DSD128 whatever the player does with it —
 * so this says what the DAC receives:
 * - as DSD: nothing more, the format already says DSD;
 * - wrapped in PCM words the DAC unwraps: a "DoP" tag;
 * - converted to PCM by the player: a warning, since the DAC then receives no DSD.
 *
 * Fed by the core's `dsd_delivery` (PlayerState.format, SourceInfo), told for the
 * box's own MPD a moment after the track starts. Used by the mini player
 * (`ag-now-playing`) and the full-screen player's format strip (`ag-format-strip`).
 *
 * @element ag-dsd-delivery
 * @prop {string|null} delivery - 'native' | 'dop' | 'pcm', or null when unknown.
 * @dependency js/components/atoms/ag-badge.js
 * @dependency css/components/badge.css
 */
import { LitElement, html, nothing } from 'lit';
import './ag-badge.js';

/** The tag for each way that is worth a word, and its badge variant. */
export const DSD_DELIVERY_TAGS = {
    dop: { type: 'neutral', label: 'DoP' },
    pcm: { type: 'warning', label: 'Converted to PCM' },
};

export class AgDsdDelivery extends LitElement {
    static properties = {
        delivery: { type: String },
    };

    constructor() {
        super();
        this.delivery = null;
    }

    createRenderRoot() {
        return this; // Light DOM (global badge.css)
    }

    render() {
        const tag = DSD_DELIVERY_TAGS[this.delivery];
        if (!tag) return nothing;
        return html`<ag-badge type=${tag.type} label=${tag.label}></ag-badge>`;
    }
}

customElements.define('ag-dsd-delivery', AgDsdDelivery);
