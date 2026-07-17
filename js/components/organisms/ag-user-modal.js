/**
 * @module AgUserModal
 * @description Organism component for the User Management modal (Create / Edit).
 * Uses ag-modal as the layout foundation.
 * 
 * @element ag-user-modal
 * 
 * @attr {boolean} is-open - Modal visibility state
 * @attr {Object} user - User object to edit (null for creation)
 * @attr {Object} currentUser - The user currently logged in (for permission checks)
 * @attr {boolean} isSaving - Loading state during API calls
 * 
 * @dependency ag-modal
 * @dependency css/components/forms.css, css/components/modal.css - Form and modal styles
 * 
 * @fires save - Dispatched when SAVE is clicked, with {payload, isEditing, originalUsername}
 * @fires cancel - Dispatched when model requests to close
 * @fires error - Dispatched when client-side validation fails
 */

import { LitElement, html } from 'lit';
import './ag-modal.js';

export class AgUserModal extends LitElement {
    static properties = {
        isOpen: { type: Boolean, attribute: 'is-open' },
        user: { type: Object }, // User object to edit, null for create
        currentUser: { type: Object },
        isSaving: { type: Boolean }
    };

    constructor() {
        super();
        this.isOpen = false;
        this.user = null;
        this.currentUser = null;
        this.isSaving = false;

        // Form state
        this._username = '';
        this._password = '';
        this._role = 'user';
        this._email = '';
        this._enabled = true;
    }

    createRenderRoot() {
        return this; // Light DOM for global CSS (modal classes, forms, etc)
    }

    willUpdate(changedProperties) {
        if (changedProperties.has('isOpen') && this.isOpen) {
            // Reset or populate form state when opened
            if (this.user) {
                this._username = this.user.username || '';
                this._password = ''; // Never populate password
                this._role = this.user.role || 'user';
                this._email = this.user.email || '';
                this._enabled = this.user.enabled !== false;
            } else {
                this._username = '';
                this._password = '';
                this._role = 'user';
                this._email = '';
                this._enabled = true;
            }
        }
    }

    _handleClose() {
        if (this.isSaving) return;
        this.isOpen = false;
        this.dispatchEvent(new CustomEvent('cancel', { bubbles: true, composed: true }));
    }

    _handleSave() {
        if (this.isSaving) return;

        // Basic frontend validation to match previous logic
        const username = this._username.trim();
        const password = this._password.trim();  // trim prevents whitespace-only passwords

        if (!this.user && username.length < 3) {
            this.dispatchEvent(new CustomEvent('error', { detail: 'Username must be at least 3 characters long.' }));
            return;
        }
        if (!this.user && password.length < 6) {
            this.dispatchEvent(new CustomEvent('error', { detail: 'Password must be at least 6 characters long.' }));
            return;
        }
        if (this.user && password && password.length < 6) {
            this.dispatchEvent(new CustomEvent('error', { detail: 'New password must be at least 6 characters long.' }));
            return;
        }

        const payload = {
            username: username,
            role: this._role,
            enabled: this._enabled
        };

        if (password) payload.password = password;
        if (this._email.trim()) payload.email = this._email.trim();

        this.dispatchEvent(new CustomEvent('save', {
            detail: {
                payload,
                isEditing: !!this.user,
                originalUsername: this.user ? this.user.username : null
            },
            bubbles: true,
            composed: true
        }));
    }

    _handleInput(field, e) {
        this[`_${field}`] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    }

    render() {
        const isEditing = !!this.user;
        const title = isEditing ? `Edit User: ${this.user.username}` : 'Create New User';

        // Disable role and enabled if editing "admin" or self
        let disableRole = false;
        let disableEnabled = false;
        let tooltipMsg = "";

        if (isEditing && this.user.username === 'admin') {
            disableRole = true;
            disableEnabled = true;
            tooltipMsg = "System account cannot be disabled or demoted.";
        } else if (isEditing && this.currentUser && this.currentUser.username === this.user.username) {
            disableRole = true;
            disableEnabled = true;
            tooltipMsg = "You cannot disable or re-role your own account.";
        }

        return html`
            <ag-modal 
                ?show=${this.isOpen} 
                @modal-close=${this._handleClose}
                size="premium"
                title="${title}"
                .bodyTemplate=${html`
                    <div class="form-section">
                        <h4>Account Information</h4>
                        <div class="form-field">
                            <label>Username</label>
                            <input type="text" 
                                .value=${this._username} 
                                @input=${(e) => this._handleInput('username', e)}
                                placeholder="e.g. john" 
                                ?disabled=${isEditing}>
                        </div>
                        <div class="form-field">
                            <label>Email (Optional)</label>
                            <input type="email" 
                                .value=${this._email}
                                @input=${(e) => this._handleInput('email', e)}
                                placeholder="Email address">
                        </div>
                    </div>

                    <div class="form-section">
                        <h4>Security & Access</h4>
                        <div class="form-field">
                            <label>Password <span class="help-text">${isEditing ? '(Leave empty to keep current password)' : ''}</span></label>
                            <input type="password" 
                                .value=${this._password}
                                @input=${(e) => this._handleInput('password', e)}
                                placeholder="Minimum 6 chars">
                        </div>
                        <div class="form-field" title=${tooltipMsg}>
                            <label>Role</label>
                            <select .value=${this._role} @change=${(e) => this._handleInput('role', e)} ?disabled=${disableRole}>
                                <option value="user">User</option>
                                <option value="guest">Guest</option>
                                <option value="admin">Admin</option>
                            </select>
                        </div>
                    </div>

                    <div class="form-section">
                        <h4>Account Status</h4>
                        <div class="checkbox-field" title=${tooltipMsg}>
                            <label>
                                <input type="checkbox" 
                                    .checked=${this._enabled}
                                    @change=${(e) => this._handleInput('enabled', e)}
                                    ?disabled=${disableEnabled}>
                                Account Enabled
                            </label>
                        </div>
                    </div>
                `}
                .footerTemplate=${html`
                    <button class="btn-action" @click=${() => this._handleClose()} ?disabled=${this.isSaving}>Cancel</button>
                    <button class="btn-action success" @click=${() => this._handleSave()} ?disabled=${this.isSaving}>
                        ${this.isSaving ? 'Saving...' : 'Save'}
                    </button>
                `}>
            </ag-modal>
            `;
    }
}

customElements.define('ag-user-modal', AgUserModal);
