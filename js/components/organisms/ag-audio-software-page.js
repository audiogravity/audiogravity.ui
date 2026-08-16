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
    addToHistory,
    escapeHtml
} from '../../common.js';
import { isGuest, isAdmin } from '../../auth.js';
import { FetchController } from '../../core/FetchController.js';
import { ContextConsumer } from '@lit/context';
import { appContext } from '../../core/app-context.js';
import './ag-card-grid.js';
import '../molecules/ag-package-card.js';

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
        // Services the box runs on the packaged defaults rather than on a
        // configuration Audiogravity wrote. Installing a package never
        // configures it — deliberately — so the card has to say so, or a
        // freshly installed service looks ready while it plays to the wrong
        // output. Empty until the first read, and stays empty if the read
        // fails: a missing answer must not accuse anything.
        this._unconfigured = new Set();

        // Log lines arrive as live SSE events; anything missed while the stream was
        // down is unrecoverable without this cursor. It tracks which package the
        // modal shows and the highest `seq` displayed, so a catch-up fetch can ask
        // the core for exactly the missing lines.
        this._logCursor = { packageId: null, lastSeq: 0 };

        this._bindAppVisible = this._handleAppVisible.bind(this);
        this._bindSyncEvent = this._handleSyncEvent.bind(this);
        this._bindPackageState = this._handlePackageStateUpdate.bind(this);
        this._bindPackageLog = this._handlePackageLogUpdate.bind(this);
        this._bindConnectionStatus = this._handleConnectionStatus.bind(this);

        this.packagesFetch = new FetchController(this, {
            autoFetch: false,
            // No browser-side cache of the published versions any more. It
            // existed because the core could not answer without an expensive
            // check; it now remembers them itself and re-checks daily, so a
            // plain listing already carries them. Worse, the cache had no
            // expiry and was applied OVER a fresh "up to date" answer, so a
            // version that had stopped being offered could keep an update badge
            // lit on that browser indefinitely.
            fetchFn: async () => await apiGet('/packages/') || [],
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

    /**
     * Note which audio services are NOT running on a configuration AG wrote.
     *
     * "Configured" is not "a config file exists" — every package ships one.
     * The core judges it on a marker it writes itself, which is also what makes
     * this survive a package upgrade replacing the file. Failures are swallowed
     * on purpose: a guest, or an unreachable endpoint, must leave the cards
     * saying nothing rather than saying something wrong.
     * @returns {Promise<void>}
     * @private
     */
    async _loadConfiguredServices() {
        // Admin-only on the core side: a guest asking would take a guaranteed
        // 403 on every load. And it probes the box's block devices to answer,
        // so it is read when this tab is actually shown — never on the startup
        // fetch that runs for the update badge alone.
        if (!isAdmin()) return;
        try {
            const status = await apiGet('/audio-stack/status');
            this._unconfigured = new Set(
                (status?.services || [])
                    .filter(s => s.configured === false)
                    .map(s => s.service_id)
            );
        } catch {
            this._unconfigured = new Set();
        }
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
        EventEmitter.on('connection-status', this._bindConnectionStatus);

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
        EventEmitter.off('connection-status', this._bindConnectionStatus);

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
            // Every time the tab is shown, not only the first: the user may have
            // just provisioned a service in the Config tab, and a card still
            // saying "not configured" would be accusing it of something it no
            // longer is.
            this._loadConfiguredServices().then(() => this.requestUpdate());
        }
    }

    _handleAppVisible(currentTab) {
        if (currentTab === 'audio-software') {
            // Full refresh on visibility to ensure sync
            this._loadPackages();
            this._loadConfiguredServices().then(() => this.requestUpdate());
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
            this.requestUpdate();
            this._updateGlobalUpdateBadge();
        }

        // If the logs modal is open for this package, update it
        const modal = document.getElementById('agLogsModal');
        if (modal && modal.isOpen) {
            this._updateLogsModal(pkg);

            // A state change is the one moment the browser is told the operation
            // moved on, so it is also the moment to claim any line it missed —
            // notably the closing burst, which apt emits all at once.
            this._syncLogsFromServer();

            // If operation is finished, update modal actions
            const terminalStates = ['installed', 'not_installed', 'error'];
            if (terminalStates.includes(pkg.status)) {
                modal.showCancel = false;
            }
        }
    }

    /**
     * React to package logs pushed via SSE (Phase 3)
     *
     * Entries carry a `seq` that is monotonic per package and never restarts,
     * not even across operations; tracking the
     * highest one seen is what makes catch-up possible after a missed event.
     *
     * @param {CustomEvent} e - `package-log-update` with `{package_id, entry}`.
     */
    _handlePackageLogUpdate(e) {
        const { package_id, entry } = e.detail;
        if (!package_id || !entry) return;

        // Only append logs if they belong to the package currently being viewed.
        // Without this test a concurrent operation on another package bled its
        // output into the open modal.
        if (package_id !== this._logCursor.packageId) return;

        const modal = document.getElementById('agLogsModal');
        if (modal && modal.isOpen) {
            modal.appendLogs([entry]);
            this._logCursor.lastSeq = Math.max(this._logCursor.lastSeq, entry.seq ?? 0);
        }
    }

    /**
     * Re-sync the open log modal when the event stream comes back.
     *
     * A dropped stream used to leave the modal frozen on the last line it happened
     * to receive — the operation could complete seconds later and the panel would
     * never say so, because nothing ever asked the core what it had missed.
     *
     * @param {{connected: boolean}} status - Connection status payload.
     */
    _handleConnectionStatus(status) {
        if (!status?.connected) return;
        this._syncLogsFromServer();
    }

    /**
     * Fetch the log lines the browser is missing and append them in order.
     *
     * Asks only for entries after the highest `seq` already displayed, so this is
     * idempotent and never duplicates a line that arrived live. Only ever called
     * once the operation has started server-side (state change or reconnect) —
     * calling it earlier would return the previous operation's buffer.
     *
     * @returns {Promise<void>} Resolves once the modal is up to date.
     */
    async _syncLogsFromServer() {
        const packageId = this._logCursor.packageId;
        if (!packageId) return;

        const modal = document.getElementById('agLogsModal');
        if (!modal || !modal.isOpen) return;

        try {
            const response = await apiGet(
                `/packages/${packageId}/logs?after_seq=${this._logCursor.lastSeq}`
            );
            // Re-filter against the cursor as it stands *now*, not as it stood when
            // the request left: live events keep arriving during the round-trip, and
            // two catch-ups can overlap (a reconnect and a state change fire together).
            // Both would otherwise append the same lines twice.
            const entries = (response?.entries || [])
                .filter(entry => (entry.seq ?? 0) > this._logCursor.lastSeq);
            if (entries.length) {
                modal.appendLogs(entries);
                // Math.max, never a plain assignment: a live event may already have
                // pushed the cursor past this response, and moving it backwards would
                // make the next catch-up re-fetch lines already on screen.
                this._logCursor.lastSeq = Math.max(
                    this._logCursor.lastSeq,
                    entries[entries.length - 1].seq ?? 0
                );
            }
        } catch (error) {
            // A failed catch-up must never break the operation being watched:
            // the live stream may still be feeding the modal.
            console.warn('Log catch-up failed:', error);
        }
    }

    _loadPackages() {
        this._loaded = true;
        return this.packagesFetch.fetch();
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

    /**
     * Decide what an UPDATE press means for one package.
     *
     * Some vendors publish no version at all — Roon's installer points at a
     * fixed filename and ships no version file, so there is nothing to compare
     * against. Updating one means re-running its installer, which always
     * fetches the current build; refusing on the grounds that no number could
     * be shown left those packages with no way to update from here at all. A
     * package that *should* have a version and has none is a different matter:
     * that is a symptom, and a blind reinstall would hide it.
     *
     * `installer_type === 'script'` stands in for "publishes no version",
     * which is true of every script package in the registry — none declares a
     * version check. The day one does, its check failing would look the same
     * from here, and the distinction would have to come from the core, which is
     * the only side that knows whether a check was configured or merely failed.
     *
     * @param {Object} pkg - Package as returned by the core.
     * @returns {'proceed'|'reinstall'|'up-to-date'|'no-version'} What to do.
     */
    _decideUpdate(pkg) {
        if (!pkg.available_version) {
            return pkg.installer_type === 'script' ? 'reinstall' : 'no-version';
        }
        return pkg.available_version === pkg.installed_version ? 'up-to-date' : 'proceed';
    }

    /**
     * Warn that an operation will interrupt whatever is playing through it.
     *
     * Updating a package restarts the service it drives — the package's own
     * post-install script does it, so nothing here can avoid it — and
     * uninstalling stops it outright. Said in the confirmation rather than
     * enforced by a guard: the only reliable way to know whether that service is
     * currently playing is to rebuild the whole audio pipeline, ALSA probing
     * included, which is far too much to pay before every operation and is blind
     * to Roon anyway. The person pressing the button knows whether they are
     * listening; this makes sure they know what the button does.
     *
     * @param {Object} pkg - Package the action targets.
     * @param {string} action - install | update | uninstall.
     * @returns {string} A sentence to append, or '' when nothing is at stake.
     */
    _playbackWarning(pkg, action) {
        // No service_id: nothing AG starts or stops (Roon Server), so nothing to
        // warn about. Installing something that is not running yet is harmless.
        if (!pkg.service_id || action === 'install') return '';

        const label = escapeHtml(pkg.label);
        return action === 'uninstall'
            ? ` This stops and removes ${label} — anything playing through it will stop.`
            : ` This restarts ${label} — anything playing through it will stop.`;
    }

    async _handleAction(e) {
        const { packageId, action } = e.detail;
        const pkgIndex = this.packages.findIndex(p => p.id === packageId);
        if (pkgIndex === -1) return;
        const pkg = this.packages[pkgIndex];

        let reinstallOnly = false;

        if (action === 'update') {
            // A package whose vendor publishes no version has nothing to fetch:
            // asking anyway cost a round-trip and put "checking for available
            // updates…" on screen a moment before a dialogue that says there is
            // nothing to compare.
            if (!pkg.available_version && this._decideUpdate(pkg) !== 'reinstall') {
                showToast('info', 'Checking Version', 'Checking for available updates...');
                try {
                    const latestPkg = await apiGet(`/packages/${packageId}`);
                    // update it in state
                    this.packages[pkgIndex] = { ...pkg, ...latestPkg };
                    this.requestUpdate();
                    this._updateGlobalUpdateBadge();
                } catch (error) {
                    showToast('error', 'Check Failed', 'Failed to check available version');
                    return;
                }
            }

            const decision = this._decideUpdate(this.packages[pkgIndex]);
            if (decision === 'no-version') {
                showToast('warning', 'No Version Info', 'Unable to determine available version');
                return;
            }
            if (decision === 'up-to-date') {
                const upToDate = this.packages[pkgIndex];
                showToast('info', 'Already Up-to-Date', `${upToDate.label} is already at version ${upToDate.installed_version}`);
                return;
            }
            reinstallOnly = decision === 'reinstall';
        }

        const currentPkg = this.packages[pkgIndex];
        const actionLabel = action.charAt(0).toUpperCase() + action.slice(1);
        const label = escapeHtml(currentPkg.label);

        // Escaped: showConfirm renders this through unsafeHTML, and both the
        // label and the version can carry vendor text — a version string is read
        // straight out of a file the vendor's installer wrote.
        let confirmMessage = `Are you sure you want to ${action} ${label}?`;
        if (action === 'update' && reinstallOnly) {
            const installed = currentPkg.installed_version
                ? ` You currently have ${escapeHtml(currentPkg.installed_version)}.` : '';
            confirmMessage = `${label} publishes no version number, so there is nothing to compare against. Reinstall it from the vendor's latest published build?${installed}`;
        } else if (action === 'update' && currentPkg.available_version) {
            // The installed version can be absent — a failed install leaves the
            // card in error with nothing on disk — and printing it unguarded
            // offered to update "from version null".
            confirmMessage = currentPkg.installed_version
                ? `Update ${label} from version ${escapeHtml(currentPkg.installed_version)} to ${escapeHtml(currentPkg.available_version)}?`
                : `Install ${label} version ${escapeHtml(currentPkg.available_version)}?`;
        }

        confirmMessage += this._playbackWarning(currentPkg, action);

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

        // Track the package, but do NOT fetch the log yet: this runs *before* the
        // action is POSTed, so the server buffer still holds the previous operation
        // on this package and would be rendered as if it were the new one. The first
        // `package-state-update` (INSTALLING/…) is published after the server clears
        // the buffer, and that handler fetches — early enough to miss nothing.
        this._logCursor = { packageId: pkg.id, lastSeq: 0 };
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
        this._logCursor = { packageId: null, lastSeq: 0 };
        this._stopPolling();
    }

    _handleModalCancelRequest() {
        this._stopPolling();
        const modal = document.getElementById('agLogsModal');
        if (modal) modal.isOpen = false;
        this._logCursor = { packageId: null, lastSeq: 0 };
        showToast('warning', 'Operation Cancelled', 'Modal closed, but the core may still be processing');
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
            'Manage audio software packages — install, update, and uninstall the services used by Audiogravi<sup>ty</sup>.',
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
                            .configuredByAg=${!this._unconfigured.has(pkg.service_id)}
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
