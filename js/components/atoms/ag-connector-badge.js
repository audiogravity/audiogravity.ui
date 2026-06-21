/**
 * @module AgConnectorBadge
 * @description Compact badge showing the physical output connector currently
 * carrying the active stream (e.g. ``USB``, ``TOSLINK``, ``COAX``, ``HDMI``).
 *
 * Rendered next to a service badge in the mini player and inside the output
 * bar of the fullscreen player. The raw `connector` string (e.g.
 * ``toslink``) is resolved to a human label via `connectorLabel()` — when
 * the resolved label is empty the atom emits nothing.
 *
 * @element ag-connector-badge
 *
 * @attr {string} connector - Raw connector identifier from PlayerState
 *                            (``usb``, ``toslink``, …). Empty / unknown
 *                            values render nothing.
 *
 * @dependency css/components/connector-badge.css
 */
import { LitElement, html, nothing } from 'lit';
import { connectorLabel } from '../utils-lit.js';

export class AgConnectorBadge extends LitElement {
    static properties = {
        connector: { type: String },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.connector = '';
    }

    render() {
        const label = connectorLabel(this.connector);
        if (!label) return nothing;
        return html`${label}`;
    }
}

customElements.define('ag-connector-badge', AgConnectorBadge);
