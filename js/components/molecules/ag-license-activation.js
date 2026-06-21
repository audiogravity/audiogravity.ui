/**
 * @module AgLicenseActivation
 * @description 3-step interactive license activation stepper.
 *
 * Step 1 — KEY:     Enter license key, validate format, check against server.
 * Step 2 — CONFIRM: Confirm device ID and hostname, click Activate.
 * Step 3 — ACTIVE:  Display the activated license certificate.
 *
 * Offline resilience: if the license server is temporarily unreachable, the key
 * is persisted in localStorage so the user does not have to re-enter it on retry.
 */

import { LitElement, html, nothing } from 'lit';
import { apiGet, apiPost } from '../../api.js';
import { showToast } from '../../ui-helpers.js';

const STORAGE_KEY = 'ag_pending_license_key';
const KEY_REGEX   = /^AG-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

/**
 * 3-step license activation molecule.
 *
 * @element ag-license-activation
 * @fires license-activated - Fired on successful activation, detail: ActivateResponse
 */
export class AgLicenseActivation extends LitElement {
    static properties = {
        _step:          { state: true },  // 1 | 2 | 3
        _key:           { state: true },
        _checking:      { state: true },
        _checkError:    { state: true },
        _checkResult:   { state: true },
        _deviceId:      { state: true },
        _hostname:      { state: true },
        _activating:    { state: true },
        _spinnerMsg:    { state: true },
        _activateError: { state: true },
        _result:        { state: true },
    };

    constructor() {
        super();
        this._step          = 1;
        this._key           = localStorage.getItem(STORAGE_KEY) || '';
        this._checking      = false;
        this._checkError    = null;
        this._checkResult   = null;
        this._deviceId      = '';
        this._hostname      = '';
        this._activating    = false;
        this._spinnerMsg    = '';
        this._activateError = null;
        this._result        = null;
        this._onLicenseChanged = (e) => {
            if (e.detail?.source === 'activation') return;  // our own post-activation event
            this._reset();
        };
    }

    createRenderRoot() { return this; }

    async connectedCallback() {
        super.connectedCallback();
        window.addEventListener('ag:license-changed', this._onLicenseChanged);
        try {
            const [status, sysinfo] = await Promise.all([
                apiGet('/license/status'),
                apiGet('/sysinfo/system'),
            ]);
            if (status?.device_id)    this._deviceId = status.device_id;
            if (sysinfo?.hostname && !this._hostname) this._hostname = sysinfo.hostname;
        } catch { /* non-blocking */ }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        window.removeEventListener('ag:license-changed', this._onLicenseChanged);
    }

    /** @private Reset to step 1. */
    _reset() {
        this._step          = 1;
        this._checkResult   = null;
        this._checkError    = null;
        this._activateError = null;
        this._result        = null;
    }

    /** @private Step 1: validate key format + call /license/check. */
    async _handleCheck() {
        const key = this._key.trim().toUpperCase();
        if (!KEY_REGEX.test(key)) return;
        this._checking   = true;
        this._checkError = null;
        try {
            const data = await apiPost('/license/check', { key });
            if (!data.valid) {
                const msgs = {
                    not_found: 'No license found for this key on this device.',
                    revoked:   'This license has been revoked.',
                    expired:   `This license expired on ${data.expires_at || '?'}.`,
                };
                this._checkError = msgs[data.status] || `License ${data.status}.`;
                return;
            }
            this._checkResult = data;
            this._step        = 2;
        } catch {
            this._checkError = 'Could not reach the license server. Please try again.';
        } finally {
            this._checking = false;
        }
    }

    /** @private Step 2: activate the license on this machine. */
    async _handleActivate() {
        const key = this._key.trim().toUpperCase();
        this._activating    = true;
        this._activateError = null;
        this._spinnerMsg = 'CONTACTING LICENSE SERVER…';
        await this.updateComplete;
        await new Promise(r => requestAnimationFrame(r));
        const _msgInterval = setInterval(() => {
            this._spinnerMsg = this._spinnerMsg.endsWith('…') ? 'CONTACTING LICENSE SERVER' : 'CONTACTING LICENSE SERVER…';
        }, 600);
        try {
            const result = await apiPost('/license/activate', {
                key,
                hostname: this._hostname.trim() || null,
            });
            localStorage.removeItem(STORAGE_KEY);
            this._result = result;
            this._step   = 3;
            this.dispatchEvent(new CustomEvent('license-activated', { detail: result, bubbles: true }));
            window.dispatchEvent(new CustomEvent('ag:license-changed', { detail: { source: 'activation' } }));
            showToast('success', 'License', 'License activated successfully.');
        } catch (e) {
            const status = e?.status ?? 0;
            if (status === 409) {
                this._activateError = 'This license is already activated on another machine.';
            } else if (status === 503 || status === 0) {
                this._activateError = 'License server temporarily unavailable. Please retry.';
                localStorage.setItem(STORAGE_KEY, key);
            } else {
                this._activateError = e?.message || 'Activation failed. Please try again.';
            }
        } finally {
            clearInterval(_msgInterval);
            this._activating = false;
            this._spinnerMsg = '';
        }
    }

    /** @private Download the .lic file to disk. */
    _downloadLic() {
        if (!this._result?.lic_content) return;
        const key      = (this._result.license_key || 'audiogravity').slice(0, 12).toLowerCase();
        const filename = `audiogravity-${key}.lic`;
        const blob     = new Blob([this._result.lic_content], { type: 'application/octet-stream' });
        const url      = URL.createObjectURL(blob);
        const a        = Object.assign(document.createElement('a'), { href: url, download: filename });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /** @private Step 1 — enter and check the license key. */
    _renderStep1() {
        const key      = this._key.trim().toUpperCase();
        const keyValid = KEY_REGEX.test(key);

        return html`
            <div class="lic-act__body">
                <div class="form-field">
                    <label class="form-label">LICENSE KEY</label>
                    <input
                        class="form-control ${this._checkError ? 'error' : ''}"
                        type="text"
                        placeholder="AG-XXXX-XXXX-XXXX-XXXX"
                        .value=${this._key}
                        @input=${e => { this._key = e.target.value; this._checkError = null; }}
                        @keydown=${e => e.key === 'Enter' && keyValid && !this._checking && this._handleCheck()}
                        autocomplete="off"
                        spellcheck="false"
                    />
                    ${this._checkError ? html`
                        <p class="help-text" style="color:var(--color-error)">${this._checkError}</p>
                    ` : keyValid ? html`
                        <p class="help-text" style="color:var(--color-success)">✓ Valid format</p>
                    ` : html`
                        <p class="help-text">Format: AG-XXXX-XXXX-XXXX-XXXX</p>
                    `}
                </div>
                <button
                    class="btn-action compact"
                    ?disabled=${!keyValid || this._checking}
                    @click=${this._handleCheck}
                    style="width:100%;margin-top:var(--spacing-sm)"
                >
                    ${this._checking ? 'CHECKING…' : 'CHECK KEY →'}
                </button>
            </div>
        `;
    }

    /** @private Step 2 — confirm device and hostname, then activate. */
    _renderStep2() {
        if (this._activating) {
            return html`
                <div class="lic-act__body lic-act__spinner-wrap">
                    <div class="spinner"></div>
                    <p class="lic-act__spinner-title">${this._spinnerMsg}</p>
                </div>
            `;
        }

        const r            = this._checkResult;
        const plan         = r?.plan === 'lifetime' ? 'Perpetual · v1.x' : `Trial · expires ${r?.expires_at || '?'}`;
        const reactivation = r?.activations_remaining === 0;

        return html`
            <div class="lic-act__body">
                <div class="lic-act__success-banner">
                    ✓ <strong>Key validated</strong>
                    <p>${reactivation ? 'Re-activation available on this device.' : '1 activation available.'} · ${plan}</p>
                </div>
                <div class="form-field" style="margin-top:var(--spacing-md)">
                    <label class="form-label">DEVICE ID</label>
                    <input
                        class="form-control"
                        type="text"
                        .value=${this._deviceId || '—'}
                        readonly
                        style="color:var(--text-secondary);cursor:default;font-family:var(--font-mono, monospace);font-size:var(--font-size-xs)"
                    />
                    <p class="help-text">Auto-detected — this machine will be bound to the license.</p>
                </div>
                <div class="form-field" style="margin-top:var(--spacing-sm)">
                    <label class="form-label">HOSTNAME <span style="font-weight:400;opacity:.6">(optional)</span></label>
                    <input
                        class="form-control"
                        type="text"
                        placeholder="e.g. audiogravity-server"
                        .value=${this._hostname}
                        @input=${e => { this._hostname = e.target.value; }}
                        @keydown=${e => e.key === 'Enter' && !this._activating && this._handleActivate()}
                        autocomplete="off"
                    />
                </div>
                ${this._activateError ? html`
                    <p class="help-text" style="color:var(--color-error);margin-top:var(--spacing-xs)">${this._activateError}</p>
                ` : nothing}
                <div style="display:flex;gap:var(--spacing-sm);margin-top:var(--spacing-sm)">
                    <button
                        class="btn-action btn-action--ghost compact"
                        @click=${this._reset}
                        style="flex:1"
                    >← BACK</button>
                    <button
                        class="btn-action compact"
                        ?disabled=${this._activating}
                        @click=${this._handleActivate}
                        style="flex:2"
                    >ACTIVATE THIS MACHINE →</button>
                </div>
            </div>
        `;
    }

    /** @private Step 3 — display the activated license certificate. */
    _renderStep3() {
        const r    = this._result;
        const plan = r?.plan === 'lifetime' ? 'Perpetual · v1.x' : `Trial · expires ${r?.expires_at || '?'}`;
        return html`
            <div class="lic-act__body">
                <div class="lic-act__success-banner">
                    ✓ <strong>Activation successful</strong>
                    <p>Your license is now active on this device.</p>
                </div>
                <div class="lic-act__cert" style="margin-top:var(--spacing-md)">
                    <div class="lic-act__cert-row">
                        <span class="lic-act__cert-label">LICENSE KEY</span>
                        <span class="lic-act__cert-value mono">${r?.license_key}</span>
                    </div>
                    <div class="lic-act__cert-row">
                        <span class="lic-act__cert-label">DEVICE ID</span>
                        <span class="lic-act__cert-value mono">${this._deviceId || r?.bound_to}</span>
                    </div>
                    <div class="lic-act__cert-row">
                        <span class="lic-act__cert-label">ACTIVATED</span>
                        <span class="lic-act__cert-value">${r?.activated_at}</span>
                    </div>
                    <div class="lic-act__cert-row">
                        <span class="lic-act__cert-label">PLAN</span>
                        <span class="lic-act__cert-value">${plan}</span>
                    </div>
                    <div class="lic-act__cert-row">
                        <span class="lic-act__cert-label">STATUS</span>
                        <span class="badge success" style="font-size:var(--font-size-xs)">ACTIVE</span>
                    </div>
                </div>
                <button
                    class="btn-action compact"
                    @click=${this._downloadLic}
                    style="width:100%;margin-top:var(--spacing-md)"
                >
                    DOWNLOAD .LIC FILE ↓
                </button>
            </div>
        `;
    }

    /** @private Step progress bar. */
    _renderStepper() {
        const steps = [
            { n: 1, label: 'KEY' },
            { n: 2, label: 'HOST' },
            { n: 3, label: 'ACTIVATE' },
        ];
        return html`
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--spacing-sm);margin-bottom:var(--spacing-md)">
                ${steps.map(({ n, label }) => {
                    const done    = this._step > n;
                    const current = this._step === n;
                    const color   = done ? 'var(--color-success)' : current ? 'var(--text-primary)' : 'var(--text-secondary)';
                    const barBg   = done ? 'var(--color-success)' : current ? 'var(--text-primary)' : 'var(--border-color)';
                    return html`
                        <div style="display:flex;flex-direction:column;gap:4px">
                            <span style="font-size:var(--font-size-xs);letter-spacing:1px;font-weight:600;color:${color}">
                                0${n} · ${label}
                            </span>
                            <div style="height:2px;background:${barBg};border-radius:1px;transition:background var(--transition-normal)"></div>
                        </div>
                    `;
                })}
            </div>
        `;
    }

    render() {
        const stepRenders = {
            1: () => this._renderStep1(),
            2: () => this._renderStep2(),
            3: () => this._renderStep3(),
        };
        return html`
            <div class="system-tile lic-act">
                <h3>ACTIVATION</h3>
                ${this._renderStepper()}
                ${stepRenders[this._step]?.()}
            </div>
        `;
    }
}

customElements.define('ag-license-activation', AgLicenseActivation);
