/**
 * @module AgAudioSoftwarePage
 * @description Page component for Audio Software management. Handles package installation, logs and config.
 * 
 * @element ag-audio-software-page
 * 
 * @property {Array} packages - List of audio software packages
 * @property {boolean} loading - Data loading state
 * @property {string} error - Loading error message
 * @property {boolean} dryRun - Whether to simulate installations
 * 
 * @dependency ag-card-grid
 * @dependency ag-package-card
 * @dependency ag-logs-modal (via ID)
 */
import { LitElement, html } from 'lit';
import '../atoms/ag-filter-bar.js';
import { iconRepeat, iconDownload } from '../../ag-icons.js';
import {
    apiGet,
    apiPost,
    showToast,
    showConfirm,
    handleError,
    AppState,
    MemoryCache,
    AgTimerManager,
    EventEmitter,
    addToHistory
} from '../../common.js';
import { isGuest, isAdmin } from '../../auth.js';
import { FetchController } from '../../core/FetchController.js';
import { ContextConsumer } from 'https://cdn.jsdelivr.net/npm/@lit/context@1.1.0/+esm';
import { appContext } from '../../core/app-context.js';

export class AgAudioSoftwarePage extends LitElement {
    static properties = {
        packages: { type: Array },
        dryRun: { type: Boolean },
        isCheckingAll: { type: Boolean },
        _filter: { type: String, state: true },
        _isRefreshing: { type: Boolean, state: true }
    };

    constructor() {
        super();
        this.packages = [];
        this.dryRun = false;
        this.isCheckingAll = false;
        this._filter = 'all';
        this._isRefreshing = false;
        this._pollInterval = null;
        this._loaded = false;
        this._restartNeeded = new Set(MemoryCache.get('softwareRestartNeeded', []));

        this._bindAppVisible = this._handleAppVisible.bind(this);
        this._bindSyncEvent = this._handleSyncEvent.bind(this);
        this._bindPackageState = this._handlePackageStateUpdate.bind(this);
        this._bindPackageLog = this._handlePackageLogUpdate.bind(this);

        this.packagesFetch = new FetchController(this, {
            autoFetch: false,
            fetchFn: async () => {
                const response = await apiGet('/packages/');
                let loadedPackages = response || [];
                
                // Restore previous update checks from cache to prevent update loss on refresh
                const cachedUpdates = MemoryCache.get('audioSoftwareUpdatesCache', {});
                if (Object.keys(cachedUpdates).length > 0) {
                    loadedPackages = loadedPackages.map(pkg => {
                        const cachedVersion = cachedUpdates[pkg.id];
                        if (cachedVersion && (!pkg.available_version || pkg.available_version === pkg.installed_version)) {
                            return { ...pkg, available_version: cachedVersion };
                        }
                        return pkg;
                    });
                }
                return loadedPackages;
            },
            onSuccess: (data) => {
                this.packages = data;
                this._updateGlobalUpdateBadge();
            }
        });

        // Subscribe to Global App Context for Tab Changes
        new ContextConsumer(this, {
            context: appContext,
            subscribe: true,
            callback: (state) => {
                if (state && state.currentTab) {
                    this._handleTabChanged({ active: state.currentTab });
                }
            }
        });
    }

    _handleSyncEvent() {
        console.debug('Syncing packages from background event');
        this._loadPackages();
    }

    createRenderRoot() {
        return this; // Light DOM for external CSS
    }

    connectedCallback() {
        super.connectedCallback();

        EventEmitter.on('app-visible', this._bindAppVisible);

        window.addEventListener('packages_sync', this._bindSyncEvent);
        window.addEventListener('package-state-update', this._bindPackageState);
        window.addEventListener('package-log-update', this._bindPackageLog);

        const logsModal = document.getElementById('agLogsModal');
        if (logsModal) {
            this._handleLogsClose = this._handleModalCloseRequest.bind(this);
            this._handleLogsCancel = this._handleModalCancelRequest.bind(this);
            logsModal.addEventListener('close-request', this._handleLogsClose);
            logsModal.addEventListener('cancel-request', this._handleLogsCancel);
        }

        // Load packages once on startup to show update badges, regardless of active tab
        setTimeout(() => {
            this._loadPackages();
        }, 100);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        window.removeEventListener('packages_sync', this._bindSyncEvent);
        window.removeEventListener('package-state-update', this._bindPackageState);
        window.removeEventListener('package-log-update', this._bindPackageLog);

        EventEmitter.off('app-visible', this._bindAppVisible);

        const logsModal = document.getElementById('agLogsModal');
        if (logsModal) {
            if (this._handleLogsClose) logsModal.removeEventListener('close-request', this._handleLogsClose);
            if (this._handleLogsCancel) logsModal.removeEventListener('cancel-request', this._handleLogsCancel);
        }

        this._stopPolling();
    }

    _handleTabChanged(data) {
        if (data.active === 'audio-software') {
            if (!this._loaded) {
                this._loadPackages();
            }
        }
    }

    _handleAppVisible(currentTab) {
        if (currentTab === 'audio-software') {
            // Full refresh on visibility to ensure sync
            this._loadPackages();
        }
    }

    /**
     * React to package state changes pushed via SSE (Phase 3)
     */
    _handlePackageStateUpdate(e) {
        const pkg = e.detail;
        if (!pkg || !pkg.id) return;

        console.debug(`SSE: Package state update for ${pkg.id}: ${pkg.status}`);

        const pkgIndex = this.packages.findIndex(p => p.id === pkg.id);
        if (pkgIndex !== -1) {
            const prevStatus = this.packages[pkgIndex].status;
            const justInstalled = ['installing', 'updating'].includes(prevStatus) && pkg.status === 'installed';
            if (justInstalled && pkg.service_id) {
                this._restartNeeded.add(pkg.id);
                MemoryCache.set('softwareRestartNeeded', [...this._restartNeeded]);
            } else if (pkg.status === 'not_installed') {
                this._restartNeeded.delete(pkg.id);
                MemoryCache.set('softwareRestartNeeded', [...this._restartNeeded]);
            }
            this.packages[pkgIndex] = { ...pkg };
            this._saveUpdatesCache();
            this.requestUpdate();
            this._updateGlobalUpdateBadge();
        }

        // If the logs modal is open for this package, update it
        const modal = document.getElementById('agLogsModal');
        if (modal && modal.isOpen) {
            this._updateLogsModal(pkg);
            
            // If operation is finished, update modal actions
            const terminalStates = ['installed', 'not_installed', 'error'];
            if (terminalStates.includes(pkg.status)) {
                modal.showCancel = false;
            }
        }
    }

    /**
     * React to package logs pushed via SSE (Phase 3)
     */
    _handlePackageLogUpdate(e) {
        const { package_id, entry } = e.detail;
        if (!package_id || !entry) return;

        // Only append logs if they belong to the package currently being viewed/installed
        const modal = document.getElementById('agLogsModal');
        if (modal && modal.isOpen) {
            modal.appendLogs([entry]);
        }
    }

    _loadPackages() {
        this._loaded = true;
        return this.packagesFetch.fetch();
    }

    _saveUpdatesCache() {
        const cacheObj = {};
        this.packages.forEach(pkg => {
            if (pkg.installed_version && pkg.available_version && pkg.installed_version !== pkg.available_version) {
                cacheObj[pkg.id] = pkg.available_version;
            }
        });
        MemoryCache.set('audioSoftwareUpdatesCache', cacheObj);
    }

    _updateGlobalUpdateBadge() {
        const updateCount = this.packages.filter(pkg =>
            pkg.installed_version && pkg.available_version && pkg.installed_version !== pkg.available_version
        ).length;

        if (window.EventEmitter) {
            window.EventEmitter.emit('audio-software-stats', { num: updateCount, den: this.packages.length });
        }

        const agTabs = document.querySelector('ag-tabs');
        if (agTabs) {
            agTabs.setTabBadge('audio-software', updateCount > 0 ? updateCount : null, 'info');
            return;
        }

        // Fallback logic
        const tabBtn = document.querySelector('.tab-btn[data-tab="audio-software"]');
        if (!tabBtn) return;
        let badge = tabBtn.querySelector('.tab-badge');
        if (updateCount > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'badge info tab-badge';
                badge.style.marginLeft = '8px';
                tabBtn.appendChild(badge);
            }
            badge.textContent = updateCount;
            badge.style.display = 'inline-block';
        } else if (badge) {
            badge.style.display = 'none';
        }
    }

    async _handleAction(e) {
        const { packageId, action } = e.detail;
        const pkgIndex = this.packages.findIndex(p => p.id === packageId);
        if (pkgIndex === -1) return;
        const pkg = this.packages[pkgIndex];

        if (action === 'update') {
            if (!pkg.available_version) {
                showToast('info', 'Checking Version', 'Checking for available updates...');
                try {
                    const latestPkg = await apiGet(`/packages/${packageId}`);
                    if (!latestPkg.available_version) {
                        showToast('warning', 'No Version Info', 'Unable to determine available version');
                        return;
                    }
                    // update it in state
                    this.packages[pkgIndex] = { ...pkg, ...latestPkg };
                    this._saveUpdatesCache();
                    this.requestUpdate();
                    this._updateGlobalUpdateBadge();
                } catch (error) {
                    showToast('error', 'Check Failed', 'Failed to check available version');
                    return;
                }
            }

            const currentPkg = this.packages[pkgIndex];
            if (currentPkg.available_version === currentPkg.installed_version) {
                showToast('info', 'Already Up-to-Date', `${currentPkg.label} is already at version ${currentPkg.installed_version}`);
                return;
            }
        }

        const currentPkg = this.packages[pkgIndex];
        const actionLabel = action.charAt(0).toUpperCase() + action.slice(1);

        let confirmMessage = `Are you sure you want to ${action} ${currentPkg.label}?`;
        if (action === 'update' && currentPkg.available_version) {
            confirmMessage = `Update ${currentPkg.label} from version ${currentPkg.installed_version} to ${currentPkg.available_version}?`;
        }

        const confirmed = await showConfirm(
            `${actionLabel} Package`,
            confirmMessage
        );

        if (!confirmed) return;

        this._openLogsModal(currentPkg, action);
        this._startPolling(packageId);

        try {
            const result = await apiPost(`/packages/${packageId}/${action}?dry_run=${this.dryRun}`);

            if (result.success) {
                addToHistory('software', `${actionLabel} ${currentPkg.label}`, true);
                showToast('success', `${actionLabel} Successful`, `${currentPkg.label} ${action}ed successfully`);
            } else {
                addToHistory('software', `${actionLabel} ${currentPkg.label}`, false);
                showToast('error', `${actionLabel} Failed`, `Failed to ${action} ${currentPkg.label}`);
            }
        } catch (error) {
            console.error('[Audio Software] Error:', error);
            addToHistory('software', `${actionLabel} ${currentPkg.label}`, false);
            showToast('error', 'Error', error.message);
        }
    }

    async _handleCheckUpdate(e) {
        const { packageId } = e.detail;
        const pkgIndex = this.packages.findIndex(p => p.id === packageId);
        if (pkgIndex === -1) return;

        // Visual feedback by marking that package as checking
        const pkg = this.packages[pkgIndex];
        this.packages[pkgIndex] = { ...pkg, isChecking: true };
        this.requestUpdate();

        try {
            const updatedPkg = await apiGet(`/packages/${packageId}`);
            this.packages[pkgIndex] = { ...updatedPkg };
            this._saveUpdatesCache();
            this.requestUpdate();
            this._updateGlobalUpdateBadge();
        } catch (error) {
            console.error('Failed to check available version:', error);
            this.packages[pkgIndex] = { ...pkg, isChecking: false };
            this.requestUpdate();
            showToast('error', 'Version Check Failed', 'Failed to check available version');
        }
    }

    async _handleRestartService(e) {
        const { packageId, serviceId } = e.detail;
        try {
            await apiPost(`/services/${serviceId}/restart`);
            this._restartNeeded.delete(packageId);
            MemoryCache.set('softwareRestartNeeded', [...this._restartNeeded]);
            this.requestUpdate();
            showToast('success', 'Service Restarted', `${serviceId} restarted successfully`);
        } catch (error) {
            handleError(error, 'Service restart failed');
        }
    }

    async _checkAllUpdates() {
        if (this.isCheckingAll) return;
        this.isCheckingAll = true;
        showToast('info', 'Checking Updates', 'Checking all packages for updates...');

        try {
            // Call the bulk update check (takes a few seconds)
            const updatedPackages = await apiGet('/packages/?check_updates=true');
            if (updatedPackages && Array.isArray(updatedPackages)) {
                this.packages = updatedPackages;
                this._saveUpdatesCache(); // Store the results to MemoryCache
                this._updateGlobalUpdateBadge();
                showToast('success', 'Check Complete', 'Update check finished');
            }
        } catch (error) {
            console.error('Failed to check all updates:', error);
            showToast('error', 'Check Failed', 'Failed to check all package updates');
        } finally {
            this.isCheckingAll = false;
        }
    }

    async _handleUpdateAll() {
        const updates = this.packages.filter(pkg =>
            pkg.installed_version && pkg.available_version && pkg.installed_version !== pkg.available_version
        );

        if (updates.length === 0) {
            showToast('info', 'Up-to-Date', 'All packages are already at the latest version');
            return;
        }

        const pkgListHtml = `
            <div class="package-update-list">
                <p class="package-update-intro">The following ${updates.length} packages will be updated:</p>
                <div class="package-list-container">
                    ${updates.map(pkg => `
                        <div class="package-list-item">
                            <span><strong>${escapeHtml(pkg.label)}</strong></span>
                            <span class="package-version-info">${escapeHtml(pkg.installed_version || '')} → ${escapeHtml(pkg.available_version || '')}</span>
                        </div>
                    `).join('')}
                </div>
                <p class="package-update-note">Note: Packages will be updated sequentially. This may take a few minutes.</p>
            </div>
        `;

        const confirmed = await window.showConfirm(
            `Update All Packages`,
            pkgListHtml
        );

        if (!confirmed) return;

        const pkgIds = updates.map(p => p.id);
        
        // Use the logs modal for the first package or a generic one?
        // Let's use a generic toast for now, or we could open the logs modal for the first one.
        // For simplicity, let's start them and reload once done.
        
        showToast('info', 'Updating All', 'Starting bulk update process...');

        try {
            const results = await apiPost(`/packages/update_all?dry_run=${this.dryRun}`, pkgIds);
            
            const successCount = results.filter(r => r.success).length;
            const failCount = results.length - successCount;

            if (failCount === 0) {
                showToast('success', 'All Updates Complete', `Successfully updated ${successCount} packages`);
            } else {
                showToast('warning', 'Updates Completed with Errors', `${successCount} updated, ${failCount} failed`);
            }

            // Reload all packages to get final state
            await this._loadPackages();
        } catch (error) {
            console.error('Bulk update failed:', error);
            showToast('error', 'Batch Update Failed', error.message);
        }
    }

    _openLogsModal(pkg, action) {
        const modal = document.getElementById('agLogsModal');
        if (!modal) return;

        const actionLabel = action.charAt(0).toUpperCase() + action.slice(1);

        modal.title = `${actionLabel}ing ${pkg.label}...`;
        modal.clearLogs();
        modal.progress = 0;
        modal.statusText = 'Starting...';
        modal.showCancel = true;
        modal.isActive = true;
        modal.isOpen = true;
    }

    _updateLogsModal(pkg, logsResponse) {
        const modal = document.getElementById('agLogsModal');
        if (!modal) return;

        // Map each status to a meaningful progress percentage
        const progressMap = {
            'installing': 50,
            'updating': 50,
            'uninstalling': 50,
            'installed': 100,
            'not_installed': 100,  // Uninstall completed successfully
            'error': 100
        };
        const progress = progressMap[pkg.status] ?? 25;

        modal.progress = progress;
        modal.statusText = pkg.status.replace(/_/g, ' ').charAt(0).toUpperCase() + pkg.status.slice(1).replace(/_/g, ' ');

        // Stop animation when the operation is done (any terminal state)
        const terminalStates = ['installed', 'not_installed', 'error'];
        if (terminalStates.includes(pkg.status)) {
            modal.isActive = false;
        } else if (['installing', 'updating', 'uninstalling'].includes(pkg.status)) {
            modal.isActive = true;
        }

        if (logsResponse && logsResponse.entries) {
            modal.appendLogs(logsResponse.entries);
        }
    }

    _startPolling(packageId) {
        // Polling removed in favor of SSE (Phase 3)
    }

    _stopPolling() {
        // Polling removed in favor of SSE (Phase 3)
    }

    _handleModalCloseRequest() {
        const modal = document.getElementById('agLogsModal');
        if (modal) modal.isOpen = false;
        this._stopPolling();
    }

    _handleModalCancelRequest() {
        this._stopPolling();
        const modal = document.getElementById('agLogsModal');
        if (modal) modal.isOpen = false;
        showToast('warning', 'Operation Cancelled', 'Modal closed, but backend may still be processing');
    }

    async _refreshConfig() {
        if (isGuest()) {
            showToast('warning', 'Access Denied', 'Guests cannot refresh configuration');
            return;
        }
        this._isRefreshing = true;
        try {
            showToast('info', 'Refreshing', 'Probing sources and regenerating package configuration...');
            const result = await apiPost('/packages/config/refresh');
            if (result.success) {
                showToast('success', 'Refreshed', result.message);
                await this._loadPackages();
            } else {
                showToast('error', 'Refresh Failed', result.message || 'Unknown error');
            }
        } catch (error) {
            showToast('error', 'Refresh Failed', error.message || 'Unknown error');
        } finally {
            this._isRefreshing = false;
        }
    }

    _showInfo() {
        if (!window.UIComponents || !window.UIComponents.InfoModal) return;

        const content = window.UIComponents.InfoModal.createContent(
            'Manage audio software packages — install, update, and uninstall the services used by Audiogravity.',
            [
                { title: 'Filter', text: 'Use ALL / INSTALLED / UPDATES to quickly narrow the package list.' },
                { title: 'Package States', text: 'NOT INSTALLED (gray), INSTALLED (green), INSTALLING / UPDATING / UNINSTALLING (orange progress bar), ERROR (red).' },
                { title: 'Actions', text: 'INSTALL adds the package to the system. UPDATE upgrades to the latest available version. UNINSTALL removes it.' },
                { title: 'Version Check', text: 'Click "Check updates" on a card to fetch the latest available version on demand. Use CHECK UPDATES in the header to refresh all packages at once.' },
                { title: 'Restart Required', text: 'After an install or update, a pulsing badge appears on cards whose associated service needs a restart. Click it to restart the service immediately.' },
                { title: 'Documentation', text: 'The book icon in the footer of each card opens the official documentation in a new tab.' },
                { title: 'DRY-RUN Mode', text: 'Simulates operations without executing them — safe for testing before making real changes.' },
                { title: 'Architecture Support', text: 'The CPU badge shows which architectures are supported (amd64, arm64, armhf, all). Cards for unsupported architectures are dimmed.' }
            ]
        );

        window.UIComponents.InfoModal.show('Audio Software Management', content);
    }

    _toggleDryRun(e) {
        this.dryRun = e.target.checked;
    }

    async _downloadConfig() {
        try {
            const response = await apiGet('/packages/config/view');
            if (response && response.error) {
                showToast('error', 'Error', response.error);
                return;
            }
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(response, null, 2));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", "packages-config.json");
            document.body.appendChild(downloadAnchorNode); // required for firefox
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
            showToast('success', 'Success', 'Configuration downloaded successfully');
        } catch (error) {
            console.error('Failed to download configuration:', error);
            showToast('error', 'Download Failed', 'Failed to download configuration');
        }
    }

    render() {
        const hasUpdates = pkg => pkg.installed_version && pkg.available_version && pkg.installed_version !== pkg.available_version;

        const filteredPackages = this.packages.filter(pkg => {
            if (this._filter === 'installed') return pkg.status === 'installed';
            if (this._filter === 'updates')   return hasUpdates(pkg);
            return true;
        });

        const filterOptions = [
            { label: 'ALL',     value: 'all'       },
            { label: 'INSTALLED', value: 'installed' },
            { label: 'UPDATES', value: 'updates'   }
        ];

        return html`
            <div class="software-zone tab-zone">
                <div class="tab-title-container">
                    <h2>AUDIO SOFTWARE</h2>
                    <span class="badge info clickable" @click=${this._showInfo}>INFO</span>
                    ${!isGuest() ? html`
                    <span class="badge warning ${this._isRefreshing ? 'animate-pulse' : 'clickable'}" title="Refresh package config (re-probe sources)" @click=${this._isRefreshing ? null : this._refreshConfig}><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconRepeat}</svg></span>
                    <span class="badge neutral clickable" title="Download resolved configuration" @click=${this._downloadConfig}><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconDownload}</svg></span>
                    <span class="badge success clickable ${this.isCheckingAll ? 'animate-pulse' : ''}"
                          @click=${this._checkAllUpdates}>
                        ${this.isCheckingAll ? 'CHECKING...' : 'CHECK UPDATES'}
                    </span>
                    ${this.packages.some(hasUpdates) ? html`
                        <span class="badge error clickable" @click=${this._handleUpdateAll}>UPDATE ALL</span>
                    ` : ''}
                    ` : ''}
                    ${isAdmin() ? html`
                    <!-- Admin-only: a catalog-validation tool (command preview + config check),
                         not a dependency-resolving simulation — kept out of the regular User UI. -->
                    <div class="dry-run-toggle has-tooltip">
                        <label class="switch">
                            <input type="checkbox" .checked=${this.dryRun} @change=${this._toggleDryRun}>
                            <span class="slider"></span>
                        </label>
                        <span class="dry-run-label">DRY-RUN</span>
                        <div class="tooltip tooltip-bottom">Test mode: simulate operations without executing them</div>
                    </div>
                    ` : ''}
                </div>

                <div class="tab-filter-row">
                    <ag-filter-bar
                        .options=${filterOptions}
                        value=${this._filter}
                        @filter-change=${e => { this._filter = e.detail.value; }}>
                    </ag-filter-bar>
                </div>

                <ag-card-grid
                    class="software-grid"
                    grid-class="software-grid-container"
                    skeleton-class="service-tile"
                    empty-message="No audio software available"
                    .items=${filteredPackages}
                    ?loading=${this.packagesFetch.loading}
                    error=${this.packagesFetch.error || ''}
                    .renderItem=${(pkg, index) => html`
                        <ag-package-card
                            id="ag-package-${pkg.id}"
                            .pkg=${pkg}
                            .animationsEnabled=${AppState.animationsEnabled}
                            .isChecking=${pkg.isChecking || false}
                            .restartRequired=${this._restartNeeded.has(pkg.id)}
                            .delayIndex=${index}>
                        </ag-package-card>
                    `}
                    @package-action=${this._handleAction}
                    @package-check-update=${this._handleCheckUpdate}
                    @package-restart-service=${this._handleRestartService}>
                </ag-card-grid>
            </div>
        `;
    }
}

customElements.define('ag-audio-software-page', AgAudioSoftwarePage);
