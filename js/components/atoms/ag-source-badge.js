/**
 * @module AgSourceBadge
 * @description Compact badge showing the origin / provider of the current stream
 * (Tidal, Qobuz, a UPnP server, radio, a local file, Roon…). Used in the mini
 * and fullscreen Now Playing players so the listener can tell where the audio
 * comes from — everything streamed through MPD otherwise looks identical.
 */

import { LitElement, html } from 'lit';
import { originBadge } from '../library-constants.js';

/**
 * Stream origin badge.
 * @element ag-source-badge
 *
 * @attr {string} origin - Origin kind from the now-playing payload: `tidal`,
 *   `qobuz`, `roon`, `radio`, `upnp`, `library`, `airplay`,
 *   `hqplayer`, `mpris`. Renders nothing when empty/unknown.
 * @attr {string} name - Specific provider name (e.g. a UPnP server like
 *   "MinimServer") that overrides the generic label.
 *
 * @dependency css/components/source-badge.css - Classes .ag-source-badge
 *
 * @example
 * <ag-source-badge origin="tidal"></ag-source-badge>
 * <ag-source-badge origin="upnp" name="MinimServer"></ag-source-badge>
 */
export class AgSourceBadge extends LitElement {
    static properties = {
        origin: { type: String },
        name: { type: String },
    };

    constructor() {
        super();
        this.origin = '';
        this.name = '';
    }

    // Light DOM so the badge inherits global tokens / source-badge.css.
    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        this.style.display = 'contents';
    }

    render() {
        const badge = originBadge(this.origin, this.name);
        if (!badge) return null;
        return html`
            <span class="ag-source-badge" title=${badge.label}>
                <span class="ag-source-badge__icon">${badge.icon}</span>
                <span class="ag-source-badge__label">${badge.label}</span>
            </span>
        `;
    }
}

customElements.define('ag-source-badge', AgSourceBadge);
