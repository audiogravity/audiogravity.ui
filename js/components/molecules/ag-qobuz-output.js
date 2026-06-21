/**
 * @module AgQobuzOutput
 * @description Qobuz connection card molecule for the sources view.
 * Shows connection state and handles the OAuth2 authentication flow.
 *
 * Self-contained: fetches its own state from the /qobuz/* endpoints.
 * The parent organism only needs to render `<ag-qobuz-output>`.
 *
 * @element ag-qobuz-output
 *
 * @fires qobuz-connected    - Bubbles when Qobuz authentication succeeds.
 * @fires qobuz-disconnected - Bubbles when Qobuz connection is removed.
 *
 * @dependency css/components/library-sources.css (lib-qb-* classes)
 */

import { LitElement, html, nothing } from 'lit';
import { apiGet, apiPost, apiDelete } from '../../api.js';
import { loadConnection } from '../utils-lit.js';
import '../atoms/ag-status-indicator.js';

const FORMAT_LABELS = {
    5:  'MP3 320',
    6:  'FLAC 16/44',
    7:  'FLAC 24/96',
    27: 'Hi-Res 24/192',
};

class AgQobuzOutput extends LitElement {

    static properties = {
        _connection: { state: true },
        _loading:    { state: true },
        _connecting: { state: true },
    };

    constructor() {
        super();
        this._connection = null;
        this._loading    = true;
        this._connecting = false;
        this._pollTimer  = null;
        this._oauthPopup = null;
    }

    /** @override Light DOM — inherits global CSS. */
    createRenderRoot() { return this; }

    connectedCallback() {
        super.connectedCallback();
        this._loadConnection();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._stopPolling();
    }

    // ── Data fetching ──────────────────────────────────────────────────────

    /** Fetch current connection state. */
    async _loadConnection() {
        await loadConnection(this, () => apiGet('/qobuz/connection'), 'qobuz');
    }

    /**
     * Start the OAuth flow: get the URL and open it in a popup window.
     * A popup (not a new tab) keeps the AG UI alive underneath; the backend
     * callback auto-closes it on success and polling picks up the connection,
     * so the user lands back in AG without manually closing anything.
     * (Qobuz's signin page sends X-Frame-Options: deny, so it cannot be embedded
     * in an in-app iframe/modal — a popup is the closest in-app experience.)
     */
    async _connect() {
        this._connecting = true;
        try {
            const data = await apiPost('/qobuz/connection', {
                redirect_base_url: `${window.location.origin}/api`,
            });
            if (data?.oauth_url) {
                this._oauthPopup = this._openOAuthPopup(data.oauth_url);
                this._startPolling();
            }
        } catch (e) {
            console.warn('[qobuz] Start OAuth failed:', e.message);
            this._connecting = false;
        }
    }

    /** Open the OAuth URL as a centered popup; fall back to a new tab if blocked. */
    _openOAuthPopup(url) {
        const w = 520, h = 720;
        const left = Math.max(0, window.screenX + (window.outerWidth  - w) / 2);
        const top  = Math.max(0, window.screenY + (window.outerHeight - h) / 2);
        const popup = window.open(url, 'qobuz-oauth',
            `popup=yes,width=${w},height=${h},left=${left},top=${top}`);
        if (!popup) window.open(url, '_blank'); // popup blocked → new tab fallback
        return popup;
    }

    /** Disconnect from Qobuz. */
    async _disconnect() {
        try {
            await apiDelete('/qobuz/connection');
        } catch (e) {
            console.warn('[qobuz] Disconnect failed:', e.message);
        }
        this._connection = null;
        this._connecting = false;
        this.dispatchEvent(new CustomEvent('qobuz-disconnected', { bubbles: true }));
        await this._loadConnection();
    }

    /** Poll for connection state after OAuth tab is opened. */
    _startPolling() {
        this._stopPolling();
        this._pollTimer = setInterval(async () => {
            try {
                const conn = await apiGet('/qobuz/connection');
                if (conn?.connected) {
                    this._connection = conn;
                    this._connecting = false;
                    this._stopPolling();
                    // Close the OAuth popup if it's still open (belt-and-suspenders
                    // alongside the callback's own auto-close).
                    try { this._oauthPopup?.close(); } catch { /* cross-origin/closed */ }
                    this._oauthPopup = null;
                    this.dispatchEvent(new CustomEvent('qobuz-connected', { bubbles: true }));
                }
            } catch { /* ignore */ }
        }, 3000);
    }

    _stopPolling() {
        if (this._pollTimer) {
            clearInterval(this._pollTimer);
            this._pollTimer = null;
        }
    }

    /** Refresh connection state (called by parent via querySelector). */
    async _refresh() {
        await this._loadConnection();
    }

    // ── Render ─────────────────────────────────────────────────────────────

    render() {
        if (this._loading) {
            return html`<div class="lib-qb-card"><div class="lib-qb-card-hd">Loading…</div></div>`;
        }

        const connected = this._connection?.connected;
        return connected ? this._renderConnected() : this._renderDisconnected();
    }

    /** @private */
    _renderConnected() {
        const sub = this._connection.subscription || 'Active';
        const fmt = FORMAT_LABELS[this._connection.format_id] || `Format ${this._connection.format_id}`;

        return html`
            <div class="lib-qb-card connected">
                <div class="lib-qb-card-hd">
                    <div class="lib-qb-ic"><img src="/pics/qobuz.webp" alt="Qobuz" width="24" height="24" /></div>
                    <div class="lib-qb-col">
                        <div class="lib-qb-name">Qobuz</div>
                        <div class="lib-qb-desc">${sub} · ${fmt}</div>
                    </div>
                    <ag-status-indicator state="up" label="Connected"></ag-status-indicator>
                </div>
                <div class="lib-qb-actions">
                    <button class="action-btn compact secondary" @click=${this._disconnect}>
                        Disconnect
                    </button>
                </div>
            </div>
        `;
    }

    /** @private */
    _renderDisconnected() {
        return html`
            <div class="lib-qb-card">
                <div class="lib-qb-card-hd">
                    <div class="lib-qb-ic"><img src="/pics/qobuz.webp" alt="Qobuz" width="24" height="24" /></div>
                    <div class="lib-qb-col">
                        <div class="lib-qb-name">Qobuz</div>
                        <div class="lib-qb-desc">Hi-Res streaming</div>
                    </div>
                </div>
                <div class="lib-qb-actions">
                    <button
                        class="action-btn compact"
                        ?disabled=${this._connecting}
                        @click=${this._connect}
                    >
                        ${this._connecting ? 'Waiting for login…' : 'Connect'}
                    </button>
                </div>
            </div>
        `;
    }
}

customElements.define('ag-qobuz-output', AgQobuzOutput);
