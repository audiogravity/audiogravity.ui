/**
 * @module AgHighresaudioOutput
 * @description HIGHRESAUDIO (HRA) connection card molecule for the sources view.
 * Unlike Qobuz (OAuth popup) or Tidal (device paste), HRA authenticates with a
 * plain email + password form (official API). Shows connection state and handles
 * login / logout.
 *
 * Self-contained: fetches its own state from the /highresaudio/* endpoints.
 * The parent organism only needs to render `<ag-highresaudio-output>`.
 *
 * @element ag-highresaudio-output
 *
 * @fires highresaudio-connected    - Bubbles when HRA authentication succeeds.
 * @fires highresaudio-disconnected - Bubbles when the HRA connection is removed.
 *
 * @dependency css/components/library-sources.css (lib-qb-* and lib-hra-* classes)
 */

import { LitElement, html } from 'lit';
import { apiGet, apiPost, apiDelete } from '../../api.js';
import { loadConnection } from '../utils-lit.js';
import '../atoms/ag-status-indicator.js';

export class AgHighresaudioOutput extends LitElement {

    static properties = {
        _connection: { state: true },
        _loading:    { state: true },
        _connecting: { state: true },
        _error:      { state: true },
    };

    constructor() {
        super();
        this._connection = null;
        this._loading    = true;
        this._connecting = false;
        this._error      = '';
    }

    /** @override Light DOM — inherits global CSS. */
    createRenderRoot() { return this; }

    connectedCallback() {
        super.connectedCallback();
        this._loadConnection();
    }

    // ── Data fetching ──────────────────────────────────────────────────────

    /** Fetch current connection state. */
    async _loadConnection() {
        await loadConnection(this, () => apiGet('/highresaudio/connection'), 'highresaudio');
    }

    /**
     * Log in with email + password.
     * @param {Event} e - The submit event from the login form.
     */
    async _connect(e) {
        e?.preventDefault();
        const form = this.querySelector('#hra-login-form');
        const username = form?.username?.value?.trim();
        const password = form?.password?.value ?? '';
        if (!username || !password) {
            this._error = 'Enter your HRA email and password.';
            return;
        }
        this._connecting = true;
        this._error = '';
        try {
            const conn = await apiPost('/highresaudio/connection', { username, password });
            this._connection = conn;
            this._connecting = false;
            if (conn?.connected) {
                this.dispatchEvent(new CustomEvent('highresaudio-connected', { bubbles: true }));
            }
        } catch (err) {
            this._connecting = false;
            this._error = err?.message || 'Login failed. Check your credentials.';
        }
    }

    /** Disconnect from HRA. */
    async _disconnect() {
        try {
            await apiDelete('/highresaudio/connection');
        } catch (e) {
            console.warn('[highresaudio] Disconnect failed:', e.message);
        }
        this._connection = null;
        this._connecting = false;
        this._error = '';
        this.dispatchEvent(new CustomEvent('highresaudio-disconnected', { bubbles: true }));
        await this._loadConnection();
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
        return this._connection?.connected ? this._renderConnected() : this._renderDisconnected();
    }

    /** @private */
    _renderConnected() {
        const c = this._connection;
        const desc = c.username || 'Connected';
        return html`
            <div class="lib-qb-card connected">
                <div class="lib-qb-card-hd">
                    <div class="lib-qb-ic"><img src="./pics/highresaudio.webp" alt="Highresaudio" width="24" height="24" /></div>
                    <div class="lib-qb-col">
                        <div class="lib-qb-name">Highresaudio</div>
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
                    <div class="lib-qb-ic"><img src="./pics/highresaudio.webp" alt="Highresaudio" width="24" height="24" /></div>
                    <div class="lib-qb-col">
                        <div class="lib-qb-name">Highresaudio</div>
                        <div class="lib-qb-desc">Hi-Res streaming</div>
                    </div>
                </div>
                <form id="hra-login-form" class="lib-hra-form" @submit=${this._connect}>
                    <input
                        class="lib-hra-input"
                        name="username"
                        type="email"
                        autocomplete="username"
                        placeholder="Email"
                        ?disabled=${this._connecting}
                    />
                    <input
                        class="lib-hra-input"
                        name="password"
                        type="password"
                        autocomplete="current-password"
                        placeholder="Password"
                        ?disabled=${this._connecting}
                    />
                    <p class="lib-hra-note">
                        HRA allows a single active device — connecting here signs you
                        out of your other HRA players.
                    </p>
                    ${this._error ? html`<p class="lib-hra-err">${this._error}</p>` : ''}
                    <button class="action-btn compact" type="submit" ?disabled=${this._connecting}>
                        ${this._connecting ? 'Connecting…' : 'Connect'}
                    </button>
                </form>
            </div>
        `;
    }
}

customElements.define('ag-highresaudio-output', AgHighresaudioOutput);
