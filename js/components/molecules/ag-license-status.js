/**
 * @module AgLicenseStatus
 * @description Molecule displaying the full license status panel with device ID and upload CTA.
 * Fetches GET /license/status on mount and exposes device_id for copy.
 * Provides .lic file upload to activate a lifetime license and deletion with password confirmation.
 */

import { LitElement, html, nothing } from 'lit';
import { apiGet, apiCall } from '../../api.js';
import { API_BASE_URL, API_KEY_HEADER, API_KEY } from '../../core/config.js';
import { LICENSE_TERMS_TITLE, LICENSE_TERMS_HTML } from '../../core/license-docs.js';
import { getAuthToken } from '../../auth.js';
import { showPasswordConfirm, showToast, copyToClipboard } from '../../ui-helpers.js';
import '../atoms/ag-license-badge.js';
import { iconTrash, iconCreditCard, iconExternalLink, iconDownload, iconUpload, iconCopy } from '../../ag-icons.js';

/**
 * License status panel molecule.
 * Shows badge, message, device ID (copyable), days remaining, upload and delete actions.
 *
 * @element ag-license-status
 *
 * @example
 * <ag-license-status></ag-license-status>
 */
export class AgLicenseStatus extends LitElement {
    static properties = {
        _status:        { state: true },
        _loading:       { state: true },
        _error:         { state: true },
        _copied:        { state: true },
        _uploading:     { state: true },
        _deleting:      { state: true },
        _onlineStatus:  { state: true },
        _paypalUrl:     { state: true },
        _price:         { state: true },
        _upgradePrice:  { state: true },
        _portalUrl:     { state: true },
        _contactEmail:  { state: true },
    };

    constructor() {
        super();
        this._status       = null;
        this._loading      = true;
        this._error        = null;
        this._copied       = false;
        this._uploading    = false;
        this._deleting     = false;
        this._onlineStatus = null;
        this._paypalUrl    = '';
        this._price        = '';
        this._upgradePrice = '';
        this._portalUrl    = '';
        this._contactEmail = '';
        this._onLicenseChanged = () => { this._fetchStatus(); this._fetchOnlineStatus(); };
    }

    createRenderRoot() {
        return this;
    }

    async connectedCallback() {
        super.connectedCallback();
        await Promise.all([this._fetchStatus(), this._fetchPublicConfig()]);
        this._fetchOnlineStatus();
        window.addEventListener('ag:license-changed', this._onLicenseChanged);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        window.removeEventListener('ag:license-changed', this._onLicenseChanged);
    }

    /**
     * Fetch PayPal URL and license price from the license server (via backend proxy).
     * Falls back to AG_CONFIG values on failure.
     * @returns {Promise<void>}
     */
    async _fetchPublicConfig() {
        try {
            const data = await apiGet('/license/public-config');
            if (data?.paypal_url)    this._paypalUrl    = data.paypal_url;
            if (data?.license_price) this._price        = data.license_price;
            if (data?.upgrade_price) this._upgradePrice = data.upgrade_price;
            if (data?.portal_url)    this._portalUrl    = data.portal_url;
            if (data?.contact_email) this._contactEmail = data.contact_email;
        } catch {
            // Non-blocking — component renders without portal/contact info if unreachable
        }
    }

    /**
     * Fetch the online license status from the backend (cached remote check).
     * Silently ignored on failure or when the checker is unconfigured.
     * @returns {Promise<void>}
     */
    async _fetchOnlineStatus() {
        try {
            const data = await apiGet('/license/online-status');
            if (data?.status !== 'unconfigured') {
                this._onlineStatus = data;
            }
        } catch {
            // Non-blocking — online status is best-effort
        }
    }

    /**
     * Fetch the license status from the backend API.
     * @returns {Promise<void>}
     */
    async _fetchStatus() {
        this._loading = true;
        this._error   = null;
        try {
            this._status = await apiGet('/license/status');
        } catch (err) {
            this._error = err.message || 'Unable to fetch license status.';
            showToast('error', 'License error', this._error);
        } finally {
            this._loading = false;
        }
    }

    /**
     * Copy the device_id to the clipboard.
     * @returns {Promise<void>}
     */
    async _copyDeviceId() {
        if (!this._status?.device_id) return;
        try {
            await copyToClipboard(this._status.device_id);
            this._copied = true;
            setTimeout(() => { this._copied = false; }, 2000);
        } catch {
            showToast('error', 'Copy failed', 'Could not access clipboard.');
        }
    }

    /** Build a PayPal payment URL from the base URL and a price string. */
    _buildPaypalUrl(price) {
        if (!this._paypalUrl || !price) return null;
        const amount = parseFloat(price);
        return isNaN(amount)
            ? this._paypalUrl
            : `${this._paypalUrl.replace(/\/$/, '')}/${amount}EUR`;
    }

    /** Format a price string for display (e.g. "29" → "€29"). */
    _formatPrice(price) {
        const amount = parseFloat(price);
        return isNaN(amount) ? price : `€${amount}`;
    }

    get _paypalPaymentUrl() { return this._buildPaypalUrl(this._price); }
    get _paypalUpgradeUrl()  { return this._buildPaypalUrl(this._upgradePrice); }
    get _priceDisplay()      { return this._formatPrice(this._price); }
    get _upgradePriceDisplay() { return this._formatPrice(this._upgradePrice); }

    /**
     * Open the PayPal payment page directly.
     * @returns {void}
     */
    _handlePayPal() {
        window.open(this._paypalPaymentUrl, '_blank', 'noopener,noreferrer');
    }

    /** Trigger the hidden file input. */
    _triggerFileInput() {
        this.querySelector('#lic-file-input')?.click();
    }

    /**
     * Upload the selected .lic file to POST /license/upload.
     * @param {Event} e
     * @returns {Promise<void>}
     */
    async _handleFileSelected(e) {
        const file = e.target.files?.[0];
        if (!file) return;

        this._uploading = true;
        try {
            const formData = new FormData();
            formData.append('file', file);

            const headers = { [API_KEY_HEADER]: API_KEY };
            const token = getAuthToken();
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(`${API_BASE_URL}/license/upload`, {
                method: 'POST',
                headers,
                body: formData,
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || `HTTP ${res.status}`);
            }

            this._status = await res.json();
            showToast('success', 'License activated', 'Your lifetime license is now active.');
        } catch (err) {
            showToast('error', 'Activation failed', err.message || 'Could not activate the license.');
        } finally {
            this._uploading = false;
            e.target.value = '';
        }
    }

    /**
     * Delete the active license after password confirmation.
     * The system reverts to trial (or expired) mode.
     * @returns {Promise<void>}
     */
    async _handleDeleteLicense() {
        const password = await showPasswordConfirm(
            'Delete License',
            'This will remove the lifetime license. The system will revert to trial mode. Enter your password to confirm.'
        );
        if (!password) return;

        this._deleting = true;
        try {
            this._status = await apiCall('/license/license', {
                method: 'DELETE',
                body: JSON.stringify({ password }),
            });
            window.dispatchEvent(new CustomEvent('ag:license-changed'));
            showToast('success', 'License removed', 'The license has been deleted. Trial mode is now active.');
        } catch (err) {
            showToast('error', 'Deletion failed', err.message || 'Could not delete the license.');
        } finally {
            this._deleting = false;
        }
    }

    /**
     * Render the online verification badge (server-side revocation check).
     * @returns {TemplateResult|nothing}
     */
    _renderOnlineBadge() {
        const s = this._onlineStatus;
        if (!s) return nothing;

        const MAP = {
            valid:             { cls: 'success', label: 'Server: Active' },
            revoked:           { cls: 'error',   label: 'Server: Revoked' },
            expired:           { cls: 'warning', label: 'Server: Expired' },
            not_found:         { cls: 'error',   label: 'Server: Not found' },
            invalid_signature: { cls: 'error',   label: 'Server: Invalid' },
            invalid_json:      { cls: 'error',   label: 'Server: Invalid' },
            unreachable:       { cls: 'info',    label: 'Server: Offline' },
            no_license:        { cls: 'info',    label: 'Server: No license' },
            pending:           { cls: 'info',    label: 'Server: Checking…' },
        };
        const { cls, label } = MAP[s.status] ?? { cls: 'info', label: `Server: ${s.status}` };
        const title = s.checked_at ? `Last checked: ${new Date(s.checked_at).toLocaleString()}` : '';

        return html`<span class="badge ${cls}" title="${title}" style="font-size:var(--font-size-xs)">${label}</span>`;
    }

    _renderProgress() {
        if (this._status?.status !== 'trial') return nothing;
        const days = this._status.days_remaining ?? 0;
        const pct  = Math.round((days / 30) * 100);
        return html`
            <div class="license-trial-progress">
                <div class="license-trial-bar" style="width: ${pct}%"></div>
            </div>
            <p class="license-days">${days} / 30 days remaining</p>
        `;
    }

    /**
     * Build the ordered acquisition steps as an HTML string for the info modal.
     * @returns {string}
     */
    /** @returns {import('lit').TemplateResult} */
    _renderAcquisitionSteps() {
        return html`
            <ol style="margin:0;padding-left:1.4em;display:flex;flex-direction:column;gap:.4em">
                ${this._paypalPaymentUrl ? html`
                    <li>Click <strong>Pay with PayPal</strong> — one-time payment of ${this._priceDisplay}.</li>
                ` : ''}
                <li>You will receive your license key <strong>by email</strong> within seconds.</li>
                <li>Click <strong>License Key</strong>, enter your key and click <strong>Activate this machine</strong> — no restart required.</li>
            </ol>`;
    }

    /** Show the combined license options + EULA modal. */
    _showLicenseTerms() {
        window.UIComponents?.InfoModal?.show(LICENSE_TERMS_TITLE, LICENSE_TERMS_HTML);
    }

    /** Render a "Need help?" contact line, or nothing if no contact email is configured. */
    _renderContactHelp() {
        if (!this._contactEmail) return nothing;
        return html`
            <span style="color:var(--text-tertiary);font-size:var(--font-size-xs)">
                Need help? <a href="mailto:${this._contactEmail}" style="color:var(--text-secondary)">${this._contactEmail}</a>
            </span>`;
    }

    /** Show an informational modal about the license system. */
    _showInfo() {
        // Validate portal URL before embedding in HTML string to prevent javascript: injection.
        const safePortalUrl = /^https?:\/\//i.test(this._portalUrl || '') ? this._portalUrl : null;
        const portalSection = safePortalUrl
            ? `<h4 style="margin:1em 0 .4em">Lost or re-installing?</h4>
               <p style="margin:0">If you already purchased a license and need to download your <code>.lic</code> file (e.g. after an OS reinstall), use the self-service portal — no account required, just your purchase email and this Device ID: <a href="${safePortalUrl}" target="_blank" rel="noopener noreferrer">Download .lic →</a></p>`
            : '';
        const content = [
            '<p><strong>Trial license</strong> — 30 days of full access, automatically activated on first run. No action required.</p>',
            '<p><strong>Lifetime license</strong> — a single-device <code>.lic</code> file cryptographically tied to this device\'s hardware fingerprint. One-time payment, no expiry, no subscription.</p>',
            '<h4 style="margin:1em 0 .4em">How to get a license</h4>',
            this._acquisitionStepsHtml(),
            portalSection,
            '<h4 style="margin:1em 0 .4em">About the Device ID</h4>',
            '<p style="margin:0">A SHA-256 fingerprint of this device\'s hardware, used to bind the license to this specific machine. Displayed for reference — you do not need it to activate.</p>',
        ].join('');
        window.UIComponents?.InfoModal?.show('About Licensing', content);
    }

    /**
     * Render in-tile actions: upload/delete buttons and the hidden file input.
     * @returns {TemplateResult}
     */
    _renderActions() {
        const { status } = this._status || {};

        if (status === 'lifetime') {
            return html`
                <div style="margin-top: var(--spacing-lg); display: flex; flex-direction: column; gap: var(--spacing-sm);">
                    <div>
                        <button class="btn-action btn-action--error compact"
                                ?disabled=${this._deleting}
                                @click=${this._handleDeleteLicense}>
                            <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconTrash}</svg>
                            ${this._deleting ? 'Deleting…' : 'Delete license'}
                        </button>
                    </div>
                </div>
            `;
        }

        if (status === 'version_expired') {
            return html`
                <div style="margin-top: var(--spacing-lg); display: flex; flex-direction: column; gap: var(--spacing-sm);">
                    <span style="color: var(--text-secondary); font-size: var(--font-size-sm);">
                        Your license is for a previous major version and is not compatible with this release.
                        Upgrade at a preferential rate${this._upgradePriceDisplay ? ` (${this._upgradePriceDisplay})` : ''}.
                    </span>
                    <div style="display: flex; gap: var(--spacing-sm); flex-wrap: wrap; align-items: flex-start;">
                        ${this._paypalUpgradeUrl ? html`
                        <button class="btn-action btn-action--ghost compact"
                                @click=${() => window.open(this._paypalUpgradeUrl, '_blank', 'noopener,noreferrer')}>
                            <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconCreditCard}</svg>
                            Upgrade — ${this._upgradePriceDisplay || 'Pay with PayPal'}
                        </button>` : nothing}
                        <div style="margin-left: auto; display: flex; gap: var(--spacing-sm); flex-wrap: wrap;">
                            ${this._portalUrl ? html`
                            <a class="btn-action btn-action--ghost compact"
                               href="${this._portalUrl}#upgrade"
                               target="_blank"
                               rel="noopener noreferrer"
                               title="Activate your upgrade order and download the new .lic">
                                <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconExternalLink}</svg>
                                Upgrade portal
                            </a>` : nothing}
                            <button class="btn-action btn-action--ghost compact"
                                    ?disabled=${this._uploading}
                                    @click=${this._triggerFileInput}>
                                <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconUpload}</svg>
                                ${this._uploading ? 'Activating…' : 'Import .lic'}
                            </button>
                        </div>
                    </div>
                    <input id="lic-file-input" type="file" accept=".lic"
                           style="display: none;"
                           @change=${this._handleFileSelected}>
                    ${this._renderContactHelp()}
                </div>
            `;
        }

        return html`
            <div style="margin-top: var(--spacing-lg); display: flex; flex-direction: column; gap: var(--spacing-sm);">
                <span style="color: var(--text-secondary); font-size: var(--font-size-sm);">
                    ${status === 'starter'
                        ? 'Your trial has ended. Purchase a lifetime license to continue.'
                        : `Lifetime license — one-time payment of ${this._priceDisplay}, no subscription.`}
                </span>
                <div style="color: var(--text-secondary); font-size: var(--font-size-sm); margin: var(--spacing-xs) 0 0;">
                    ${this._renderAcquisitionSteps()}
                </div>
                <div style="display: flex; gap: var(--spacing-sm); flex-wrap: wrap; align-items: flex-start;">
                    ${this._paypalPaymentUrl ? html`
                    <button class="btn-action btn-action--ghost compact"
                            @click=${this._handlePayPal}>
                        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconCreditCard}</svg>
                        Pay with PayPal
                    </button>` : nothing}
                    <div style="margin-left: auto; display: flex; gap: var(--spacing-sm); flex-wrap: wrap;">
                        ${this._portalUrl ? html`
                        <a class="btn-action btn-action--ghost compact"
                           href="${this._portalUrl}"
                           target="_blank"
                           rel="noopener noreferrer"
                           title="Re-download your .lic file (email + device ID required)">
                            <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconDownload}</svg>
                            Download .lic
                        </a>` : nothing}
                        <button class="btn-action btn-action--ghost compact"
                                ?disabled=${this._uploading}
                                @click=${this._triggerFileInput}>
                            <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconUpload}</svg>
                            ${this._uploading ? 'Activating…' : 'Import .lic'}
                        </button>
                    </div>
                    <input id="lic-file-input" type="file" accept=".lic"
                           style="display: none;"
                           @change=${this._handleFileSelected}>
                </div>
                ${this._renderContactHelp()}
            </div>
        `;
    }

    /** @private */
    _renderHeader(showInfo = false) {
        return html`
            <div class="tab-title-container">
                <h2>LICENSE</h2>
                ${showInfo ? html`
                    <span class="badge info clickable"
                          style="margin-right: var(--spacing-sm);"
                          @click=${this._showInfo}>INFO</span>
                ` : nothing}
                <div style="margin-left:auto;display:flex;gap:var(--spacing-sm)">
                    <button class="btn-action btn-action--ghost compact" @click=${this._showLicenseTerms}>EDITIONS & LICENSE</button>
                    <button class="btn-action compact"
                            @click=${() => this.dispatchEvent(new CustomEvent('license-key-click', { bubbles: true }))}>
                        LICENSE KEY
                    </button>
                </div>
            </div>
        `;
    }

    render() {
        if (this._loading) {
            return html`
                ${this._renderHeader()}
                <div class="system-tile" style="margin-bottom: var(--spacing-xl); max-width: 100%;">
                    <p style="color: var(--text-secondary); margin: 0;">Loading license…</p>
                </div>
            `;
        }
        if (this._error) {
            return html`
                ${this._renderHeader(true)}
                <div class="system-tile" style="margin-bottom: var(--spacing-xl); max-width: 100%;">
                    <p style="color: var(--color-error); margin: 0;">${this._error}</p>
                </div>
            `;
        }

        const { status, device_id, message, order_id, plan, activated_at } = this._status || {};
        const shortId = device_id
            ? `${device_id.slice(0, 10)}…${device_id.slice(-8)}`
            : '—';

        return html`
            ${this._renderHeader(true)}

            <div class="system-tile" style="margin-bottom: var(--spacing-xl); max-width: 100%;">
                <div class="profile-info-row" style="margin-bottom: var(--spacing-md);">
                    <ag-license-badge
                        status="${status}"
                        days-remaining="${this._status?.days_remaining ?? ''}"
                        pill>
                    </ag-license-badge>
                    ${this._renderOnlineBadge()}
                    <span style="color: var(--text-secondary); font-size: var(--font-size-sm);">${message}</span>
                </div>

                ${this._renderProgress()}

                <div class="profile-info-row" style="margin-top: var(--spacing-sm); align-items: center;">
                    <span class="info-label" style="flex-shrink: 0;">Device ID</span>
                    <span style="display: flex; align-items: center; gap: var(--spacing-sm);">
                        <code style="font-size: var(--font-size-xs);"
                              title="${device_id}">${shortId}</code>
                        <button class="btn-action btn-action--ghost compact"
                                @click=${this._copyDeviceId}
                                title="Copy full device ID">
                            <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconCopy}</svg>
                            ${this._copied ? 'Copied' : 'Copy'}
                        </button>
                    </span>
                </div>

                ${status === 'lifetime' && order_id ? html`
                    <div class="profile-info-row" style="margin-top: var(--spacing-xs); align-items: center;">
                        <span class="info-label" style="flex-shrink: 0;">Order ID</span>
                        <span style="display: flex; align-items: center; gap: var(--spacing-sm); margin-left: auto;">
                            <code style="font-size: var(--font-size-xs);">${order_id}</code>
                            <button class="btn-action btn-action--ghost compact"
                                    @click=${() => copyToClipboard(order_id)}
                                    title="Copy Order ID">
                                <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconCopy}</svg>
                                Copy
                            </button>
                        </span>
                    </div>
                ` : nothing}
                ${status === 'lifetime' && activated_at ? html`
                    <div class="profile-info-row" style="margin-top: var(--spacing-xs); align-items: center;">
                        <span class="info-label" style="flex-shrink: 0;">Activated</span>
                        <span style="font-size: var(--font-size-xs); color: var(--text-secondary); margin-left: auto;">
                            ${new Date(activated_at).toLocaleDateString()}
                        </span>
                    </div>
                ` : nothing}
                ${status === 'lifetime' && plan ? html`
                    <div class="profile-info-row" style="margin-top: var(--spacing-xs); align-items: center;">
                        <span class="info-label" style="flex-shrink: 0;">Plan</span>
                        <span style="font-size: var(--font-size-xs); color: var(--text-secondary); margin-left: auto;">
                            ${plan === 'lifetime'
                                ? `Perpetual · v${this._status?.version_scope ?? '1'}.x`
                                : plan}
                        </span>
                    </div>
                ` : nothing}

                ${this._renderActions()}
            </div>
        `;
    }
}

customElements.define('ag-license-status', AgLicenseStatus);
