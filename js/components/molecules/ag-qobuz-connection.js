/**
 * @module AgQobuzConnection
 * @description Qobuz connection card molecule for the sources view.
 * Shows connection state and handles the OAuth2 authentication flow.
 *
 * Self-contained: fetches its own state from the /qobuz/* endpoints.
 * The parent organism only needs to render `<ag-qobuz-connection>`.
 *
 * @element ag-qobuz-connection
 *
 * @fires sources-changed - Bubbles when the Qobuz connection is created or removed.
 *
 *
 * @dependency css/components/library-sources.css (lib-qb-* classes)
 */

import { LitElement, html, nothing } from 'lit';
import { apiGet, apiPost, apiDelete } from '../../api.js';
import { failureReason } from '../../library-api.js';
import { showToast } from '../../ui-helpers.js';
import { loadConnection } from '../utils-lit.js';
import { hasSubscription } from '../../library-store.js';
import '../atoms/ag-status-indicator.js';

const FORMAT_LABELS = {
    5:  'MP3 320',
    6:  'FLAC 16/44',
    7:  'FLAC 24/96',
    27: 'Hi-Res 24/192',
};

export class AgQobuzConnection extends LitElement {

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
     * Start the OAuth flow: open a popup window, then point it at the URL the core
     * returns. A popup (not a new tab) keeps the AG UI alive underneath; the backend
     * callback auto-closes it on success and polling picks up the connection,
     * so the user lands back in AG without manually closing anything.
     * (Qobuz's signin page sends X-Frame-Options: deny, so it cannot be embedded
     * in an in-app iframe/modal — a popup is the closest in-app experience.)
     *
     * The window opens on the click itself, empty, and is pointed at Qobuz once the
     * address arrives. The core first downloads Qobuz's 9 MB web player — under 2 s
     * on the x86 box, a minute on a slow line — and a browser lets a click open a
     * window for a few seconds only: Chromium blocked it, and the new-tab fallback
     * with it, 6 s after the click, while one opened on the click and pointed 30 s
     * later went through (measured on 2026-09-25; Safari not measured).
     *
     * A failure is said on screen, in the core's words: it went to the console only,
     * and the button simply read "Connect" again.
     */
    async _connect() {
        this._connecting = true;
        const popup = this._openOAuthPopup('about:blank');
        try {
            const data = await apiPost('/qobuz/connection', {
                redirect_base_url: `${window.location.origin}/api`,
            });
            if (!data?.oauth_url) throw new Error('The box gave no Qobuz sign-in address.');
            if (popup?.closed) {                 // closed while the box was answering
                this._connecting = false;
                return;
            }
            if (popup) popup.location.href = data.oauth_url;
            else window.open(data.oauth_url, '_blank'); // blocked even on the click → try a tab
            this._oauthPopup = popup;
            this._startPolling();
        } catch (e) {
            try { popup?.close(); } catch { /* already closed */ }
            console.warn('[qobuz] Start OAuth failed:', e.message);
            showToast('error', 'Qobuz sign-in failed', failureReason(e));
            this._connecting = false;
        }
    }

    /**
     * Open a centered popup for the OAuth flow.
     * @param {string} url - What it shows first (`about:blank` until the address arrives).
     * @returns {Window|null} The popup, or null when the browser blocked it.
     */
    _openOAuthPopup(url) {
        const w = 520, h = 720;
        const left = Math.max(0, window.screenX + (window.outerWidth  - w) / 2);
        const top  = Math.max(0, window.screenY + (window.outerHeight - h) / 2);
        return window.open(url, 'qobuz-oauth',
            `popup=yes,width=${w},height=${h},left=${left},top=${top}`);
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
        this.dispatchEvent(new CustomEvent('sources-changed', { bubbles: true }));
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
                    this.dispatchEvent(new CustomEvent('sources-changed', { bubbles: true }));
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

    /**
     * @private The line under the name, connected: what Qobuz will actually play.
     *
     * `format_id` is what AG **asks** for, and Qobuz keeps accepting the request
     * after a plan ends — it serves 30-second MP3 excerpts instead of tracks.
     * Printing "Studio · Hi-Res 24/192" then states the opposite of what is
     * heard. The subscribed/unknown rule lives in {@link hasSubscription}; only
     * the wording is Qobuz's.
     * @returns {string}
     */
    get _connectedDesc() {
        const c = this._connection;
        if (!hasSubscription(c)) return 'No subscription · 30-second previews';
        const fmt = FORMAT_LABELS[c.format_id] || `Format ${c.format_id}`;
        return `${c.subscription || 'Active'} · ${fmt}`;
    }

    /** @private */
    _renderConnected() {
        const desc = this._connectedDesc;

        return html`
            <div class="lib-qb-card connected">
                <div class="lib-qb-card-hd">
                    <div class="lib-qb-ic"><img src="./pics/qobuz.webp" alt="Qobuz" width="24" height="24" /></div>
                    <div class="lib-qb-col">
                        <div class="lib-qb-name">Qobuz</div>
                        <div class="lib-qb-desc">${desc}</div>
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
                    <div class="lib-qb-ic"><img src="./pics/qobuz.webp" alt="Qobuz" width="24" height="24" /></div>
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

customElements.define('ag-qobuz-connection', AgQobuzConnection);
