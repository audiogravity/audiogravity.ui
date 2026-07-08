import { LitElement, html } from 'lit';
import { EventEmitter, UI_VERSION, API_BASE_URL, apiGet, AppState } from '../../common.js';
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
        connected: { type: Boolean }
    };

    constructor() {
        super();
        this.apiUrl = 'Connecting...';
        this.connected = false;
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
        const fullApiUrl = API_BASE_URL.startsWith('http')
            ? API_BASE_URL
            : window.location.origin + API_BASE_URL;

        const docsUrl = `${fullApiUrl}/docs?url=${fullApiUrl}/openapi.json`;

        const agDocsModal = document.getElementById('agDocsModal');
        if (agDocsModal) {
            agDocsModal.open('API Reference (Swagger)', docsUrl);
        } else {
            window.open(docsUrl, '_blank');
        }
    }

    render() {
        return html`
            <footer class="footer" role="contentinfo">
                <div class="footer-logo" @click="${this._openLogoModal}">
                    <img src="/pics/apple-touch-180.png" alt="Audiogravity" style="width:var(--footer-height); height:var(--footer-height); border-radius:var(--radius-sm); display:block">
                </div>
                
                <span><a href="https://audiogravity.app" target="_blank" rel="noopener">Audiogravi<sup>ty</sup></a> © 2026 — <a
                        href="https://github.com/audiogravity/audiogravity.site/blob/main/EULA.md" target="_blank" rel="noopener">Proprietary License</a></span>

                <div style="display: flex; align-items: center; gap: var(--spacing-sm);">
                    <span id="footerApiUrl">API: ${this.apiUrl}</span>
                    <div class="has-tooltip">
                        <button class="icon-btn" id="footerApiDocsBtn" title="API Documentation"
                            @click="${this._openApiDocs}"
                            style="width: 32px; height: 32px; font-size: 18px;">
                            <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconApiTree}</svg>
                        </button>
                        <div class="tooltip tooltip-top">Open API Documentation (Swagger UI)</div>
                    </div>
                </div>
            </footer>
        `;
    }
}

customElements.define('ag-footer', AgFooter);
