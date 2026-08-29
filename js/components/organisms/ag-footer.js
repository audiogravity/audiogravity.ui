import { LitElement, html } from 'lit';
import { EventEmitter, API_BASE_URL, AppState } from '../../common.js';
import { apiDocsUrl, openApiDocs } from '../../api-docs.js';
import { iconApiTree } from '../../ag-icons.js';

/**
 * @module AgFooter
 * @description Centralized footer component for Audiogravity.
 * 
 * @element ag-footer
 * 
 * @attr {string} apiUrl - Current API base URL (displayed in footer)
 * @attr {boolean} connected - Connection status for status display
 * 
 * @dependency css/layout.css - Footer layout and link styles
 * @dependency EventEmitter - For listening to 'connection-status'
 * @dependency ag-modal - For displaying the logo preview
 */
export class AgFooter extends LitElement {
    static properties = {
        apiUrl: { type: String },
        connected: { type: Boolean },
        /** URL of the API reference, or null when this core does not serve it. */
        _docsUrl: { type: String, state: true },
    };

    constructor() {
        super();
        this.apiUrl = 'Connecting...';
        this.connected = false;
        this._docsUrl = null;
    }

    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();

        // Listen for connection status changes if not passed as property
        this._connListener = (data) => {
            this.connected = data.connected;
        };
        EventEmitter.on('connection-status', this._connListener);

        // Initial check 
        if (AppState && AppState.connected !== undefined) {
            this.connected = AppState.connected;
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._connListener) {
            EventEmitter.off('connection-status', this._connListener);
        }
    }

    willUpdate(changedProperties) {
        // willUpdate runs before render, so setting properties here avoids an extra render cycle
        if (changedProperties.has('connected')) {
            if (this.connected) {
                const baseUrl = API_BASE_URL.startsWith('http') ? API_BASE_URL : window.location.origin + API_BASE_URL;
                this.apiUrl = baseUrl;
                // Asked once per page and shared with the configuration panel: the core
                // serves the API reference only if its owner turned it on.
                apiDocsUrl().then(url => { this._docsUrl = url; });
            } else {
                this.apiUrl = 'Connecting...';
            }
        }
    }

    _openLogoModal() {
        const modal = document.getElementById('logoModal');
        if (!modal) return;

        modal.bodyTemplate = html`
            <div class="logo-preview-body" style="display: flex; justify-content: center; padding: var(--spacing-lg);">
                <img src="/pics/apple-touch-180.png" alt="Audiogravity" style="width:192px; height:192px; border-radius:var(--radius-md); display:block">
            </div>
        `;

        modal.show = true;

        // Close logic (ag-modal emits modal-close)
        const closeHandler = () => {
            modal.show = false;
            modal.removeEventListener('modal-close', closeHandler);
        };
        modal.addEventListener('modal-close', closeHandler);
    }

    _openApiDocs() {
        openApiDocs(this._docsUrl);
    }

    render() {
        return html`
            <footer class="footer" role="contentinfo">
                <div class="footer-logo" @click="${this._openLogoModal}">
                    <img src="/pics/apple-touch-180.png" alt="Audiogravity" style="width:var(--footer-height); height:var(--footer-height); border-radius:var(--radius-sm); display:block">
                </div>
                
                <span><a href="https://audiogravity.app" target="_blank" rel="noopener"><span
                            class="ag-wordmark ag-wordmark--in-text">Audiogravi<sup>ty</sup></span></a> © 2026 — <a
                        href="https://github.com/audiogravity/audiogravity.site/blob/main/EULA.md" target="_blank" rel="noopener">Proprietary License</a></span>

                <div style="display: flex; align-items: center; gap: var(--spacing-sm);">
                    <!-- The address of the box's core, named the way the sign-in badge,
                         the installer and the service unit name it. The button beside it
                         keeps "API": what it opens really is the API reference. -->
                    <span id="footerApiUrl">CORE: ${this.apiUrl}</span>
                    ${this._docsUrl ? html`
                    <div class="has-tooltip">
                        <button class="icon-btn" id="footerApiDocsBtn" title="API Documentation"
                            @click="${this._openApiDocs}"
                            /* rule 12 exception — this sizes an icon, not text: the SVG inside is width/height 1em,
                            so the value is the geometry of a control rather than typography. The page scale has
                            no step between 20 and 28; forced onto it, the transport's three sizes collapsed into
                            two and the largest grew 17 percent. See css/components/playback-controls.css. */
                            style="width: 32px; height: 32px; font-size: 18px;">
                            <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconApiTree}</svg>
                        </button>
                        <div class="tooltip tooltip-top">Open API Documentation (Swagger UI)</div>
                    </div>` : ''}
                </div>
            </footer>
        `;
    }
}

customElements.define('ag-footer', AgFooter);
