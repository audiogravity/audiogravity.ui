/**
 * @module AgAdminPage
 * @description Page component for the User Management tab. Orchestrates UserCards and AgUserModal.
 * 
 * @element ag-admin-page
 * 
 * @property {Array} users - List of all registered users
 * @property {Array} activeUsers - List of currently online usernames
 * @property {boolean} loading - Data loading state
 * @property {string} error - Loading error message
 * 
 * @dependency ag-card-grid
 * @dependency ag-user-card
 * @dependency ag-user-modal (via ID)
 * @dependency AppState - Global state for roles and tab active
 */
import { LitElement, html } from 'lit';
import {
    apiCall,
    apiGet,
    apiPost,
    showToast,
    showConfirm,
    handleError,
    AppState,
    escapeHtml,
} from '../../common.js';
import { getCurrentUser, isAdmin } from '../../auth.js';
import { FetchController } from '../../core/FetchController.js';
import { ContextConsumer } from 'https://cdn.jsdelivr.net/npm/@lit/context@1.1.0/+esm';
import { appContext } from '../../core/app-context.js';

export class AgAdminPage extends LitElement {
    static properties = {
        users:              { type: Array },
        activeUsers:        { type: Array },
        _licenseModalOpen:  { state: true },
    };

    constructor() {
        super();
        this.users             = [];
        this.activeUsers       = [];
        this._licenseModalOpen = false;

        this._bindActiveUsersUpdate = this._handleActiveUsersUpdate.bind(this);

        this.usersFetch = new FetchController(this, {
            autoFetch: false,
            fetchFn: async () => {
                if (!isAdmin()) return { users: [], activeUsers: [] };
                const [users, activeUsersList] = await Promise.all([
                    apiGet('/auth/users'),
                    apiGet('/auth/users/active').catch(() => [])
                ]);
                return { users, activeUsersList };
            },
            onSuccess: (data) => {
                this.users = data.users;
                this.activeUsers = data.activeUsersList;
                if (window.EventEmitter) {
                    window.EventEmitter.emit('users-stats', { num: data.activeUsersList.length, den: data.users.length });
                }
            }
        });

        this._lastTab = null;

        // Subscribe to Global App Context for Tab Changes
        new ContextConsumer(this, {
            context: appContext,
            subscribe: true,
            callback: (state) => {
                const tab = state?.currentTab;
                if (tab && tab !== this._lastTab) {
                    this._lastTab = tab;
                    this._handleTabChanged({ active: tab });
                }
            }
        });
    }

    createRenderRoot() {
        return this; // Light DOM for external CSS
    }

    connectedCallback() {
        super.connectedCallback();
        window.addEventListener('active_users_update', this._bindActiveUsersUpdate);

        this._handleShowLicenseModal = () => { if (!this._licenseModalOpen) this._licenseModalOpen = true; };
        if (window.EventEmitter) window.EventEmitter.on('show-license-modal', this._handleShowLicenseModal);

        // Portal the license modal to document.body to escape the .main-content stacking
        // context (position:fixed + overflow:hidden + view-transition-name = clipped fixed descendants).
        if (this._licenseModal) return;
        this._licenseModal = document.createElement('ag-modal');
        this._licenseModal.setAttribute('title', 'License Activation');
        this._licenseModal.setAttribute('size', 'large');
        this._licenseModal.bodyTemplate = html`
            <div style="display:flex;flex-direction:column;gap:var(--spacing-md)">
                <ag-license-activation></ag-license-activation>
                <ag-license-verify></ag-license-verify>
            </div>
        `;
        this._licenseModal.addEventListener('modal-close', () => { this._licenseModalOpen = false; });
        document.body.appendChild(this._licenseModal);

        // Global Modal Event Listeners
        const modal = document.getElementById('agUserModal');
        if (modal) {
            this._onSaveUser = this._handleSaveUser.bind(this);
            this._onModalError = this._handleModalError.bind(this);
            modal.addEventListener('save', this._onSaveUser);
            modal.addEventListener('error', this._onModalError);
        }

        if (AppState.currentTab === 'admin' && isAdmin()) {
            this._loadUsers();
            if (window.renderHistory) window.renderHistory('admin');
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        window.removeEventListener('active_users_update', this._bindActiveUsersUpdate);
        if (window.EventEmitter && this._handleShowLicenseModal) {
            window.EventEmitter.off('show-license-modal', this._handleShowLicenseModal);
        }

        if (this._licenseModal) {
            document.body.removeChild(this._licenseModal);
            this._licenseModal = null;
        }

        // Remove Global Modal Event Listeners
        const modal = document.getElementById('agUserModal');
        if (modal && this._onSaveUser) {
            modal.removeEventListener('save', this._onSaveUser);
            modal.removeEventListener('error', this._onModalError);
        }
    }

    updated(changedProps) {
        if (changedProps.has('_licenseModalOpen') && this._licenseModal) {
            this._licenseModal.show = this._licenseModalOpen;
        }
    }

    _handleTabChanged(data) {
        if (data.active === 'admin' && isAdmin()) {
            this._loadUsers();
            if (window.renderHistory) window.renderHistory('admin');
        }
    }

    _handleActiveUsersUpdate(e) {
        if (Array.isArray(e.detail)) {
            this.activeUsers = e.detail;
            this.requestUpdate();
            if (window.EventEmitter) {
                window.EventEmitter.emit('users-stats', { num: e.detail.length, den: this.users.length });
            }
        }
    }

    _loadUsers() {
        if (!isAdmin()) return Promise.resolve();
        return this.usersFetch.fetch();
    }

    async _toggleUserEnabled(e) {
        const { username, currentStatus } = e.detail;
        if (username === 'admin') {
            showToast('error', 'Security', 'The main admin account cannot be disabled.');
            return;
        }

        const newEnabled = !currentStatus;

        try {
            await apiCall(`/auth/users/${encodeURIComponent(username)}`, {
                method: 'PATCH',
                body: JSON.stringify({ enabled: newEnabled })
            });

            showToast('success', 'User Status', `User ${username} is now ${newEnabled ? 'enabled' : 'disabled'}.`);
            addToHistory('admin', `${newEnabled ? 'Enabled' : 'Disabled'} user: ${username}`, true);

            this._loadUsers();
        } catch (error) {
            handleError(error, 'Toggling User status');
        }
    }

    async _toggleUserPersistence(e) {
        const { username, isPersistent } = e.detail;

        try {
            await apiCall(`/auth/users/${encodeURIComponent(username)}`, {
                method: 'PATCH',
                body: JSON.stringify({ persistent_auth: isPersistent })
            });

            showToast('success', 'User Config', `Session persistence ${isPersistent ? 'enabled' : 'disabled'} for ${username}.`);
            addToHistory('admin', `${isPersistent ? 'Enabled' : 'Disabled'} persistence for: ${username}`, true);

            this._loadUsers();
        } catch (error) {
            handleError(error, 'Toggling User persistence');
        }
    }

    _openUserModal(userObj = null) {
        const modal = document.getElementById('agUserModal');
        if (modal) {
            modal.user = userObj;
            modal.currentUser = getCurrentUser();
            modal.isOpen = true;
        }
    }

    _handleEditUser(e) {
        const userObj = this.users.find(u => u.username === e.detail.username);
        if (userObj) {
            this._openUserModal(userObj);
        }
    }

    async _handleDeleteUser(e) {
        const username = e.detail.username;
        const confirmed = await showConfirm(
            'Delete User',
            `Are you sure you want to completely delete the user <strong>${escapeHtml(username)}</strong>? This cannot be undone.`
        );

        if (confirmed) {
            try {
                await apiCall(`/auth/users/${encodeURIComponent(username)}`, {
                    method: 'DELETE'
                });
                showToast('success', 'User Deleted', `User ${username} has been deleted.`);
                addToHistory('admin', `Deleted user: ${username}`, true);
                this._loadUsers();
            } catch (error) {
                handleError(error, 'Deleting User');
                addToHistory('admin', `Delete user failed: ${username}`, false);
            }
        }
    }

    async _handleSaveUser(e) {
        const { payload, isEditing, originalUsername } = e.detail;
        const username = payload.username;

        const modal = document.getElementById('agUserModal');
        if (!modal) return;

        modal.isSaving = true;

        try {
            if (isEditing) {
                const patchPayload = { ...payload };
                delete patchPayload.username;

                await apiCall(`/auth/users/${encodeURIComponent(originalUsername)}`, {
                    method: 'PATCH',
                    body: JSON.stringify(patchPayload)
                });
                showToast('success', 'User Updated', `User ${username} successfully updated.`);
                addToHistory('admin', `Updated user: ${username} (Enabled: ${payload.enabled})`, true);
            } else {
                await apiPost('/auth/users', payload);
                showToast('success', 'User Created', `User ${username} successfully created.`);
                addToHistory('admin', `Created user: ${username} (Enabled: ${payload.enabled})`, true);
            }

            modal.isOpen = false;
            this._loadUsers();
        } catch (error) {
            handleError(error, 'Saving User');
            addToHistory('admin', `${isEditing ? 'Update' : 'Create'} user failed: ${username}`, false);
        } finally {
            modal.isSaving = false;
        }
    }

    _handleModalError(e) {
        showToast('error', 'Validation Error', e.detail);
    }

    _showInfo() {
        if (!window.UIComponents || !window.UIComponents.InfoModal) return;

        const content = window.UIComponents.InfoModal.createContent(
            'The User Management section allows administrators to manage access to the Audiogravity platform.',
            [
                { title: 'Admin Role', text: 'Full access to all system features and user management. Cannot be deleted or demoted by others.' },
                { title: 'User Role', text: 'Standard access to system features but cannot manage users or core system settings.' },
                { title: 'Guest Role', text: 'Read-only access. Can view status and logs but cannot change settings or toggle services.' },
                { title: 'Persistence', text: 'Use the PERSIST toggle in the footer to choose how your session is stored. Persistent storage (localStorage) keeps you logged in even if you close your browser. Session-based storage (sessionStorage) automatically logs you out when you close the tab. This choice takes effect upon your next login.' },
                { title: 'Passkeys', text: 'The <strong>PASSKEYS</strong> button (visible on your own card) lets you register WebAuthn passkeys — Face ID, Touch ID or a hardware key. Each passkey is tied to a specific device and can be removed individually. Passkeys can be used instead of a password at login.' },
                { title: 'Security', text: 'Admins cannot delete their own account. Password changes take effect immediately on current sessions.' }
            ]
        );
        window.UIComponents.InfoModal.show('About User Management', content);
    }

    render() {
        const currentUser = getCurrentUser();

        return html`
            <div class="admin-zone tab-zone">
                <ag-license-status
                    @license-key-click=${() => { this._licenseModalOpen = true; }}
                ></ag-license-status>

                <div class="tab-title-container">
                        <h2>USER MANAGEMENT</h2>
                        <span class="badge info clickable" @click=${this._showInfo}
                            style="margin-right: var(--spacing-sm);">INFO</span>
                        <span class="badge warning clickable" @click=${() => this._openUserModal()}>NEW USER</span>
                    </div>
                    
                    <ag-card-grid 
                        class="users-grid" 
                        grid-class="users-grid-container"
                        skeleton-class="system-tile" 
                        empty-message="Aucun utilisateur trouvé."
                        .items=${this.users}
                        ?loading=${this.usersFetch.loading}
                        error=${this.usersFetch.error || ''}
                        .renderItem=${(user, index) => html`
                            <ag-user-card 
                                .user=${user}
                                .isMe=${currentUser && currentUser.username === user.username}
                                .isActive=${this.activeUsers.includes(user.username)}
                                .delayIndex=${index}>
                            </ag-user-card>
                        `}
                        @edit-user=${this._handleEditUser}
                        @delete-user=${this._handleDeleteUser}
                        @toggle-user-status=${this._toggleUserEnabled}
                        @toggle-user-persistence=${this._toggleUserPersistence}>
                    </ag-card-grid>

                    <div style="margin-top: calc(var(--spacing-xl) * 2);">
                        <ag-perf-monitor></ag-perf-monitor>
                    </div>
            </div>
        `;
    }
}

customElements.define('ag-admin-page', AgAdminPage);
