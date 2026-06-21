/**
 * @module AgUserCard
 * @description Molecule component for representing a user config tile.
 * 
 * @element ag-user-card
 * 
 * @attr {Object} user - The user object containing all user information.
 * @attr {boolean} is-me - True if this card represents the current logged-in user.
 * @attr {boolean} is-active - True if the user is currently online.
 * @attr {number} delayIndex - Index for stagger animation delay.
 * 
 * @dependency ag-badge
 * @dependency ag-button
 * @dependency ag-status-indicator
 * @dependency css/components/tile.css - .tile, .system-tile classes
 * 
 * @fires edit-user - Dispatched when the edit button is clicked. Contains { username }.
 * @fires delete-user - Dispatched when the delete button is clicked. Contains { username }.
 * @fires toggle-user-status - Dispatched when the status badge is clicked. Contains { username, currentStatus }.
 * @fires toggle-user-persistence - Dispatched when the persistence switch is toggled. Contains { username, isPersistent }.
 */

import { LitElement, html } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { isWebAuthnAvailable } from '../../webauthn.js';
import { iconUser, iconUserAdmin, iconEye, iconKey } from '../../ag-icons.js';

export class AgUserCard extends LitElement {
    static properties = {
        user: { type: Object },
        isMe: { type: Boolean, attribute: 'is-me' },
        isActive: { type: Boolean, attribute: 'is-active' },
        delayIndex: { type: Number },
        _showPasskeys: { state: true }
    };

    constructor() {
        super();
        this.user = null;
        this.isMe = false;
        this.isActive = false;
        this.delayIndex = 0;
        this._showPasskeys = false;
    }

    createRenderRoot() {
        return this; // Light DOM
    }

    connectedCallback() {
        super.connectedCallback();
        // Do NOT add 'display-contents' - breaks grid layout
        // Grid CSS expects ag-user-card to exist as a container
    }

    _handleEdit() {
        this.dispatchEvent(new CustomEvent('edit-user', {
            bubbles: true,
            composed: true,
            detail: { username: this.user.username }
        }));
    }

    _handleDelete() {
        this.dispatchEvent(new CustomEvent('delete-user', {
            bubbles: true,
            composed: true,
            detail: { username: this.user.username }
        }));
    }

    _handleToggleStatus() {
        if (this.user.username === 'admin') {
            showToast('error', 'Security', 'The main admin account cannot be disabled.');
            return;
        }
        this.dispatchEvent(new CustomEvent('toggle-user-status', {
            bubbles: true,
            composed: true,
            detail: { username: this.user.username, currentStatus: this.user.enabled }
        }));
    }

    _handleTogglePersistence(e) {
        this.dispatchEvent(new CustomEvent('toggle-user-persistence', {
            bubbles: true,
            composed: true,
            detail: { username: this.user.username, isPersistent: e.detail.checked }
        }));
    }

    render() {
        if (!this.user) return html``;

        const tileClasses = {
            'tile': true,
            'system-tile': true, // User cards sit in usersGrid, which uses system-tile styling 
            'animate-stagger': true,
            'disabled-user': this.user.enabled === false,
            'active': this.isActive
        };

        const _roleIconSvg = this.user.role === 'admin' ? iconUserAdmin
            : this.user.role === 'guest' ? iconEye
            : iconUser;

        const usernameText = window.escapeHtml ? window.escapeHtml(this.user.username) : this.user.username;

        return html`
            <div class=${classMap(tileClasses)} style="animation-delay: ${this.delayIndex * 0.05}s">
                <!-- Header -->
                <div class="tile-header" style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
                    <div class="tile-title-group" style="display: flex; align-items: center; gap: var(--spacing-sm);">
                        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${_roleIconSvg}</svg>
                        <h3 data-username="${usernameText}" style="margin: 0; text-transform: uppercase;">
                            ${usernameText} ${this.isMe ? '(YOU)' : ''}
                        </h3>
                    </div>
                    <div class="active-indicator-container" style="display: ${this.isActive ? 'flex' : 'none'}; align-items: center; justify-content: flex-end; width: 24px; height: 24px;">
                        ${this.isActive ? html`<ag-status-indicator state="up" title="User is currently online"></ag-status-indicator>` : ''}
                    </div>
                </div>

                <!-- Content -->
                <div class="tile-content">
                    <div class="metric-row">
                        <span class="metric-label">Role:</span>
                        <span class="metric-value-text" style="font-weight: bold; text-transform: capitalize;">${this.user.role}</span>
                    </div>
                    ${this.user.email ? html`
                    <div class="metric-row">
                        <span class="metric-label">Email:</span>
                        <span class="metric-value-text">${this.user.email}</span>
                    </div>` : ''}
                    <div class="metric-row">
                        <span class="metric-label">Status:</span>
                        <span class="metric-value-text">
                            ${this.user.enabled
                ? html`<ag-badge type="success" label="Enabled" ?clickable=${this.user.username !== 'admin'} title=${this.user.username === 'admin' ? 'System account' : 'Click to disable user'} @badge-click=${this._handleToggleStatus}></ag-badge>`
                : html`<ag-badge type="error" label="Disabled" clickable title="Click to enable user" @badge-click=${this._handleToggleStatus}></ag-badge>`
            }
                        </span>
                    </div>
                    <div class="metric-row">
                        <span class="metric-label">Last Login:</span>
                        <span class="metric-value-text">${this.user.last_login ? new Date(this.user.last_login).toLocaleString() : 'Never'}</span>
                    </div>
                </div>

                <!-- Footer Actions -->
                <div class="admin-user-footer" style="display: flex; justify-content: space-between; align-items: center; gap: var(--spacing-sm); margin-top: auto; padding-top: var(--spacing-sm); border-top: 1px solid var(--border-color);">
                    <div class="persistence-toggle-footer" style="display: flex; align-items: center; gap: 6px;" title="Session Persistante : si activé, la session reste valide 12h même après fermeture du navigateur">
                        <span class="metric-label" style="font-size: 10px; margin: 0; opacity: 0.8;">PERSIST</span>
                        <ag-switch
                            .compact=${true}
                            .checked=${this.user.persistent_auth !== false}
                            @ag-change=${this._handleTogglePersistence}>
                        </ag-switch>
                    </div>
                    <div style="display: flex; gap: var(--spacing-xs);">
                        ${this.isMe && isWebAuthnAvailable() ? html`
                            <ag-button
                                type="secondary"
                                icon="icon-key"
                                label="PASSKEYS"
                                compact
                                title="Manage passkeys for this account"
                                @btn-click=${() => { this._showPasskeys = !this._showPasskeys; }}>
                            </ag-button>
                        ` : ''}
                        <ag-button type="secondary" icon="icon-pencil" label="EDIT" compact @btn-click=${this._handleEdit}></ag-button>
                        ${!this.isMe ? html`
                        <ag-button type="warning" icon="icon-bin" label="DELETE" compact @btn-click=${this._handleDelete}></ag-button>
                        ` : ''}
                    </div>
                </div>

                ${this.isMe && this._showPasskeys ? html`
                    <div class="passkey-panel">
                        <div class="passkey-panel-title">
                            <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconKey}</svg> Passkeys
                        </div>
                        <ag-passkey-manager></ag-passkey-manager>
                    </div>
                ` : ''}
            </div>
        `;
    }
}

customElements.define('ag-user-card', AgUserCard);
