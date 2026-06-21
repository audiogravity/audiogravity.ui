import { LitElement, html, nothing } from 'lit';
import { apiPost } from '../../api.js';
import { showConfirm, showPasswordConfirm, showToast } from '../../ui-helpers.js';
import { isAdmin } from '../../auth.js';
import { iconRepeat, iconPowerCord } from '../../ag-icons.js';

/**
 * System Actions Molecule
 *
 * Provides Restart Backend and Reboot OS actions with confirmation dialogs,
 * a full-screen rebooting overlay, and automatic reconnect polling.
 *
 * @element ag-system-actions
 *
 * @dependency css/system.css - Uses .system-action-card, .system-reboot-overlay classes
 */
export class AgSystemActions extends LitElement {
    static properties = {
        _restartingBackend: { state: true },
        _rebooting: { state: true }
    };

    constructor() {
        super();
        this._restartingBackend = false;
        this._rebooting = false;
        this._reconnectInterval = null;
    }

    createRenderRoot() {
        return this; // Light DOM
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._stopReconnectPolling();
    }

    /**
     * Restart the audiogravity-backend systemd service.
     * The endpoint returns immediately; the service restarts ~0.5 s later.
     * @returns {Promise<void>}
     */
    async _handleRestartBackend() {
        const confirmed = await showConfirm(
            'Restart Backend',
            'This will restart the audiogravity-backend service. The UI will reconnect automatically. Continue?'
        );
        if (!confirmed) return;

        try {
            this._restartingBackend = true;
            await apiPost('/sysinfo/actions/restart-backend', {});
            showToast('info', 'Backend Restarting', 'The service is restarting — reconnecting automatically…');
            this._startReconnectPolling(false);
        } catch (err) {
            this._restartingBackend = false;
            showToast('error', 'Restart Failed', err.message || 'Unknown error');
        }
    }

    /**
     * Reboot the OS via systemctl.
     * Requires double confirmation. Shows a full-screen overlay and polls until
     * the server responds again, then reloads the page.
     * @returns {Promise<void>}
     */
    async _handleReboot() {
        const confirmed1 = await showConfirm(
            'Reboot System',
            'This will reboot the entire system. All audio playback will stop. Are you sure?'
        );
        if (!confirmed1) return;

        const password = await showPasswordConfirm(
            'Confirm Reboot',
            'Enter your admin password to confirm the reboot.'
        );
        if (!password) return;

        try {
            await apiPost('/sysinfo/actions/reboot', { password });
            this._rebooting = true;
            showToast('warning', 'System Rebooting', 'Waiting for the system to come back online…');
            this._startReconnectPolling(true);
        } catch (err) {
            showToast('error', 'Reboot Failed', err.message || 'Unknown error');
        }
    }

    /**
     * Poll /health until the server responds, then reload the page.
     * @param {boolean} isReboot - True for full OS reboot (longer initial delay), false for backend restart
     */
    _startReconnectPolling(isReboot) {
        const initialDelay = isReboot ? 15000 : 3000;
        const interval = isReboot ? 4000 : 2000;

        setTimeout(() => {
            this._reconnectInterval = setInterval(async () => {
                try {
                    const res = await fetch('/health', { cache: 'no-store' });
                    if (res.ok) {
                        this._stopReconnectPolling();
                        window.location.reload();
                    }
                } catch {
                    // Server not yet back — keep polling
                }
            }, interval);
        }, initialDelay);
    }

    /** Stop the reconnect polling loop. */
    _stopReconnectPolling() {
        if (this._reconnectInterval) {
            clearInterval(this._reconnectInterval);
            this._reconnectInterval = null;
        }
    }

    render() {
        if (!isAdmin()) return nothing;

        return html`
            ${this._rebooting ? html`
                <div class="system-reboot-overlay">
                    <div class="system-reboot-content">
                        <div class="system-reboot-spinner"></div>
                        <div class="system-reboot-title">REBOOTING</div>
                        <div class="system-reboot-subtitle">Waiting for the system to come back online…</div>
                    </div>
                </div>
            ` : ''}

            <div class="system-actions-grid">
                <div class="system-action-card">
                    <div class="system-action-icon"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconRepeat}</svg></div>
                    <div class="system-action-info">
                        <div class="system-action-title">Restart Backend</div>
                        <div class="system-action-desc">Restart the audiogravity-backend service without rebooting the OS. The UI reconnects automatically.</div>
                    </div>
                    <button
                        class="btn-action compact ${this._restartingBackend ? 'disabled' : ''}"
                        ?disabled=${this._restartingBackend}
                        @click=${this._handleRestartBackend}>
                        ${this._restartingBackend
                            ? html`<svg class="ag-spin" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconRepeat}</svg> Restarting…`
                            : html`<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconRepeat}</svg> Restart`}
                    </button>
                </div>
                <div class="system-action-card system-action-card--danger">
                    <div class="system-action-icon"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconPowerCord}</svg></div>
                    <div class="system-action-info">
                        <div class="system-action-title">Reboot OS</div>
                        <div class="system-action-desc">Perform a full system reboot. All audio playback will stop. Double confirmation required.</div>
                    </div>
                    <button
                        class="btn-action compact error"
                        @click=${this._handleReboot}>
                        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconPowerCord}</svg> Reboot
                    </button>
                </div>
            </div>
        `;
    }
}

customElements.define('ag-system-actions', AgSystemActions);
