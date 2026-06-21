/**
 * @module AgTidalOutput
 * @description Tidal connection card molecule for the sources view.
 *
 * Mirrors `ag-qobuz-output` but Tidal uses the PKCE flow: there is no server
 * callback to poll — the user logs in, lands on Tidal's fixed redirect page
 * (`tidal.com/android/login/auth?code=…`) and pastes that URL back here (a PWA
 * cannot intercept the cross-origin redirect). Reuses the `lib-qb-*` card CSS.
 *
 * Self-contained: talks to the `/tidal/*` endpoints. The parent only renders
 * `<ag-tidal-output>`.
 *
 * @element ag-tidal-output
 * @fires tidal-connected    - Bubbles when Tidal authentication succeeds.
 * @fires tidal-disconnected - Bubbles when the Tidal connection is removed.
 * @dependency css/components/library-sources.css (lib-qb-*, lib-tidal-* classes)
 */

import { LitElement, html, nothing } from 'lit';
import { apiGet, apiPost, apiDelete } from '../../api.js';
import { loadConnection } from '../utils-lit.js';
import '../atoms/ag-status-indicator.js';

class AgTidalOutput extends LitElement {

    static properties = {
        _connection: { state: true },
        _loading:    { state: true },
        _awaiting:   { state: true },   // Connect clicked, waiting for the pasted URL
        _redirect:   { state: true },   // pasted redirect URL
        _submitting: { state: true },
        _error:      { state: true },
    };

    constructor() {
        super();
        this._connection = null;
        this._loading    = true;
        this._awaiting   = false;
        this._redirect   = '';
        this._submitting = false;
        this._error      = '';
    }

    /** @override Light DOM — inherits global CSS. */
    createRenderRoot() { return this; }

    connectedCallback() {
        super.connectedCallback();
        this._loadConnection();
    }

    // ── Data ───────────────────────────────────────────────────────────────

    async _loadConnection() {
        await loadConnection(this, () => apiGet('/tidal/connection'), 'tidal');
    }

    /** Start the PKCE flow: get the authorize URL, open it, await the pasted redirect. */
    async _connect() {
        this._error = '';
        try {
            const data = await apiPost('/tidal/connection');
            if (data?.authorize_url) {
                window.open(data.authorize_url, '_blank');
                this._awaiting = true;
            }
        } catch (e) {
            console.warn('[tidal] Start login failed:', e.message);
            this._error = 'Could not start login.';
        }
    }

    /** Complete the flow from the pasted redirect URL. */
    async _submit() {
        const url = this._redirect.trim();
        if (!url) return;
        this._submitting = true;
        this._error = '';
        try {
            const conn = await apiPost('/tidal/connection/submit', { redirect_url: url });
            if (conn?.connected) {
                this._connection = conn;
                this._awaiting = false;
                this._redirect = '';
                this.dispatchEvent(new CustomEvent('tidal-connected', { bubbles: true }));
            } else {
                this._error = 'Login failed — check the pasted URL and try again.';
            }
        } catch (e) {
            console.warn('[tidal] Submit failed:', e.message);
            this._error = 'Login failed — please retry.';
        }
        this._submitting = false;
    }

    async _disconnect() {
        try {
            await apiDelete('/tidal/connection');
        } catch (e) {
            console.warn('[tidal] Disconnect failed:', e.message);
        }
        this._connection = null;
        this._awaiting = false;
        this.dispatchEvent(new CustomEvent('tidal-disconnected', { bubbles: true }));
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
        const tier = c.quality === 'HI_RES_LOSSLESS' ? 'Hi-Res' : 'Lossless';
        const desc = c.country_code ? `${tier} · ${c.country_code}` : tier;
        return html`
            <div class="lib-qb-card connected">
                <div class="lib-qb-card-hd">
                    <div class="lib-qb-ic"><span class="lib-src-logo-tidal" role="img" aria-label="Tidal"></span></div>
                    <div class="lib-qb-col">
                        <div class="lib-qb-name">Tidal</div>
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
                    <div class="lib-qb-ic"><span class="lib-src-logo-tidal" role="img" aria-label="Tidal"></span></div>
                    <div class="lib-qb-col">
                        <div class="lib-qb-name">Tidal</div>
                        <div class="lib-qb-desc">Hi-Res streaming</div>
                    </div>
                </div>
                ${this._awaiting ? html`
                    <div class="lib-tidal-paste">
                        <span class="lib-tidal-hint">
                            After logging in, copy the page URL (it contains <code>code=</code>) and paste it here:
                        </span>
                        <input
                            class="lib-inline-input"
                            type="text"
                            placeholder="https://tidal.com/android/login/auth?code=…"
                            .value=${this._redirect}
                            @input=${(e) => { this._redirect = e.target.value; }}
                        />
                        ${this._error ? html`<span class="lib-tidal-err">${this._error}</span>` : nothing}
                        <button
                            class="action-btn compact"
                            ?disabled=${this._submitting || !this._redirect.trim()}
                            @click=${this._submit}
                        >
                            ${this._submitting ? 'Connecting…' : 'Finish login'}
                        </button>
                    </div>
                ` : html`
                    <div class="lib-qb-actions">
                        <button class="action-btn compact" @click=${this._connect}>Connect</button>
                    </div>
                    ${this._error
                        ? html`<div class="lib-tidal-paste"><span class="lib-tidal-err">${this._error}</span></div>`
                        : nothing}
                `}
            </div>
        `;
    }
}

customElements.define('ag-tidal-output', AgTidalOutput);
