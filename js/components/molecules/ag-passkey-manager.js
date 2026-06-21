import { LitElement, html, nothing } from 'lit';
import { apiGet, apiCall } from '../../api.js';
import { showConfirm, showToast } from '../../ui-helpers.js';
import { registerPasskey, isWebAuthnAvailable } from '../../webauthn.js';
import { getCurrentUser } from '../../auth.js';
import { iconKey, iconTrash, iconCheck, iconRepeat, iconPlus } from '../../ag-icons.js';

/**
 * Passkey Manager Molecule
 *
 * Displays and manages WebAuthn / Passkey credentials for the currently
 * authenticated user. Shows a list of registered devices with creation dates,
 * a delete action per entry, and an "Add Passkey" flow with a device name input.
 *
 * Only renders when the browser supports WebAuthn (`PublicKeyCredential`).
 *
 * @element ag-passkey-manager
 *
 * @dependency css/admin.css - Uses .passkey-list, .passkey-item, .passkey-add-form classes
 * @dependency webauthn.js - registerPasskey(), isWebAuthnAvailable()
 */
export class AgPasskeyManager extends LitElement {
    static properties = {
        _credentials: { state: true },
        _loading: { state: true },
        _registering: { state: true },
        _showAddForm: { state: true },
        _deviceName: { state: true }
    };

    constructor() {
        super();
        this._credentials = [];
        this._loading = true;
        this._registering = false;
        this._showAddForm = false;
        this._deviceName = '';
    }

    createRenderRoot() {
        return this; // Light DOM
    }

    connectedCallback() {
        super.connectedCallback();
        this._loadCredentials();
    }

    /** Fetch registered passkeys for the current user. */
    async _loadCredentials() {
        this._loading = true;
        try {
            this._credentials = await apiGet('/auth/webauthn/credentials');
        } catch {
            this._credentials = [];
        } finally {
            this._loading = false;
        }
    }

    /**
     * Delete a passkey after confirmation.
     * @param {string} credentialId
     * @param {string} deviceName
     */
    async _handleDelete(credentialId, deviceName) {
        const confirmed = await showConfirm(
            'Remove Passkey',
            `Remove passkey <strong>${deviceName}</strong>? You will no longer be able to sign in with this device.`
        );
        if (!confirmed) return;

        try {
            await apiCall(`/auth/webauthn/credentials/${encodeURIComponent(credentialId)}`, { method: 'DELETE' });
            showToast('success', 'Passkey Removed', `${deviceName} has been removed.`);
            await this._loadCredentials();
        } catch (err) {
            showToast('error', 'Delete Failed', err.message || 'Unknown error');
        }
    }

    /** Start the WebAuthn registration ceremony. */
    async _handleAddPasskey() {
        const name = this._deviceName.trim() || 'My Device';
        const user = getCurrentUser();
        if (!user) return;

        this._registering = true;
        try {
            await registerPasskey(user.username, name);
            showToast('success', 'Passkey Added', `${name} is now registered.`);
            this._showAddForm = false;
            this._deviceName = '';
            await this._loadCredentials();
        } catch (err) {
            if (err.name === 'NotAllowedError') {
                showToast('warning', 'Cancelled', 'Passkey registration was cancelled.');
            } else {
                showToast('error', 'Registration Failed', err.message || 'Unknown error');
            }
        } finally {
            this._registering = false;
        }
    }

    _handleKeyDown(e) {
        if (e.key === 'Enter') this._handleAddPasskey();
        if (e.key === 'Escape') { this._showAddForm = false; this._deviceName = ''; }
    }

    /**
     * Format an ISO date string as a short locale date.
     * @param {string} iso
     * @returns {string}
     */
    _formatDate(iso) {
        try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
    }

    render() {
        if (!isWebAuthnAvailable()) return nothing;

        return html`
            <div class="passkey-manager">
                ${this._loading ? html`
                    <div class="passkey-loading">Loading passkeys…</div>
                ` : html`
                    ${this._credentials.length === 0 ? html`
                        <div class="passkey-empty">No passkeys registered yet.</div>
                    ` : html`
                        <ul class="passkey-list">
                            ${this._credentials.map(c => html`
                                <li class="passkey-item">
                                    <svg class="passkey-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconKey}</svg>
                                    <div class="passkey-info">
                                        <span class="passkey-name">${c.device_name}</span>
                                        <span class="passkey-date">Added ${this._formatDate(c.created_at)}</span>
                                    </div>
                                    <button
                                        class="btn-action compact error"
                                        title="Remove passkey"
                                        @click=${() => this._handleDelete(c.credential_id, c.device_name)}>
                                        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconTrash}</svg>
                                    </button>
                                </li>
                            `)}
                        </ul>
                    `}

                    ${this._showAddForm ? html`
                        <div class="passkey-add-form">
                            <input
                                class="passkey-name-input"
                                type="text"
                                placeholder="Device name (e.g. iPhone 15)"
                                maxlength="100"
                                .value=${this._deviceName}
                                @input=${e => { this._deviceName = e.target.value; }}
                                @keydown=${this._handleKeyDown}
                                autofocus>
                            <button
                                class="btn-action compact success"
                                ?disabled=${this._registering}
                                @click=${this._handleAddPasskey}>
                                ${this._registering
                                    ? html`<svg class="ag-spin" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconRepeat}</svg> Registering…`
                                    : html`<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconCheck}</svg> Register`}
                            </button>
                            <button
                                class="btn-action compact"
                                @click=${() => { this._showAddForm = false; this._deviceName = ''; }}>
                                Cancel
                            </button>
                        </div>
                    ` : html`
                        <button
                            class="btn-action compact"
                            @click=${() => { this._showAddForm = true; }}>
                            <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconPlus}</svg> Add Passkey
                        </button>
                    `}
                `}
            </div>
        `;
    }
}

customElements.define('ag-passkey-manager', AgPasskeyManager);
