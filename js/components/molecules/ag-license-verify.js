/**
 * @module AgLicenseVerify
 * @description License verification molecule — looks up a license by order ID.
 *
 * The device_id is auto-filled from the license status and sent read-only to the
 * backend, which validates that the order belongs to this machine.
 */

import { LitElement, html, nothing } from 'lit';
import { apiGet, apiPost } from '../../api.js';

const KEY_REGEX = /^AG-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

/**
 * License verification tile molecule.
 *
 * @element ag-license-verify
 */
export class AgLicenseVerify extends LitElement {
    static properties = {
        _key:      { state: true },
        _deviceId: { state: true },
        _result:   { state: true },
        _loading:  { state: true },
        _error:    { state: true },
    };

    constructor() {
        super();
        this._key      = '';
        this._deviceId = '';
        this._result   = null;
        this._loading  = false;
        this._error    = null;
    }

    createRenderRoot() { return this; }

    async connectedCallback() {
        super.connectedCallback();
        try {
            const status = await apiGet('/license/status');
            if (status?.device_id) this._deviceId = status.device_id;
        } catch { /* non-blocking */ }
    }

    /** @private */
    async _handleVerify() {
        const key = this._key.trim().toUpperCase();
        if (!KEY_REGEX.test(key)) return;
        this._loading = true;
        this._error   = null;
        this._result  = null;
        try {
            const data = await apiPost('/license/check', { key });
            if (!data.valid && data.status === 'not_found') {
                this._error = 'No license found for this key on this device.';
                return;
            }
            this._result = data;
        } catch {
            this._error = 'Could not reach the license server. Please try again.';
        } finally {
            this._loading = false;
        }
    }

    /** @private */
    _renderResult() {
        const r = this._result;
        if (!r) return nothing;
        const plan = r.plan === 'lifetime' ? 'Perpetual · v1.x' : `Trial · expires ${r.expires_at || '?'}`;
        const statusBadge = {
            available:         html`<span class="badge warning" style="font-size:var(--font-size-xs)">NOT ACTIVATED</span>`,
            already_activated: html`<span class="badge success" style="font-size:var(--font-size-xs)">ACTIVE</span>`,
            revoked:           html`<span class="badge error"   style="font-size:var(--font-size-xs)">REVOKED</span>`,
            expired:           html`<span class="badge error"   style="font-size:var(--font-size-xs)">EXPIRED</span>`,
        }[r.status] || html`<span class="badge">${r.status?.toUpperCase()}</span>`;

        return html`
            <div class="lic-act__cert" style="margin-top:var(--spacing-md)">
                <div class="lic-act__cert-row">
                    <span class="lic-act__cert-label">LICENSE KEY</span>
                    <span class="lic-act__cert-value mono">${r.key}</span>
                </div>
                <div class="lic-act__cert-row">
                    <span class="lic-act__cert-label">PLAN</span>
                    <span class="lic-act__cert-value">${plan}</span>
                </div>
                ${r.expires_at ? html`
                    <div class="lic-act__cert-row">
                        <span class="lic-act__cert-label">EXPIRES</span>
                        <span class="lic-act__cert-value">${r.expires_at}</span>
                    </div>
                ` : nothing}
                <div class="lic-act__cert-row">
                    <span class="lic-act__cert-label">STATUS</span>
                    ${statusBadge}
                </div>
            </div>
        `;
    }

    render() {
        const keyValid = KEY_REGEX.test(this._key.trim().toUpperCase());

        return html`
            <div class="system-tile">
                <h3>VERIFY EXISTING LICENSE</h3>
                <div class="form-field">
                    <label class="form-label">LICENSE KEY</label>
                    <input
                        class="form-control ${this._error ? 'error' : ''}"
                        type="text"
                        placeholder="AG-XXXX-XXXX-XXXX-XXXX"
                        .value=${this._key}
                        @input=${e => { this._key = e.target.value; this._error = null; this._result = null; }}
                        @keydown=${e => e.key === 'Enter' && keyValid && !this._loading && this._handleVerify()}
                        autocomplete="off"
                        spellcheck="false"
                    />
                    ${this._error
                        ? html`<p class="help-text" style="color:var(--color-error)">${this._error}</p>`
                        : nothing}
                </div>
                <div class="form-field" style="margin-top:var(--spacing-sm)">
                    <label class="form-label">DEVICE ID</label>
                    <input
                        class="form-control"
                        type="text"
                        .value=${this._deviceId || '—'}
                        readonly
                        style="color:var(--text-secondary);cursor:default;font-family:var(--font-mono,monospace);font-size:var(--font-size-xs)"
                    />
                    <p class="help-text">This device's ID — automatically used for validation.</p>
                </div>
                <button
                    class="btn-action btn-action--ghost compact"
                    ?disabled=${!keyValid || this._loading}
                    @click=${this._handleVerify}
                    style="width:100%;margin-top:var(--spacing-sm)"
                >
                    ${this._loading ? 'VERIFYING…' : 'VERIFY →'}
                </button>
                ${this._renderResult()}
            </div>
        `;
    }
}

customElements.define('ag-license-verify', AgLicenseVerify);
