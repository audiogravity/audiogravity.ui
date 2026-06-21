/**
 * @module AgServiceCard
 * @description Molecule component representing a single Systemd service in the Services tab.
 * Composes ag-status-indicator, ag-sparkline, and ag-tooltip.
 * 
 * @element ag-service-card
 * 
 * @attr {Object} service - Service data object
 * @attr {Object} metrics - Current metrics for the service
 * @attr {Object} history - Historical data arrays for charts
 * 
 * @dependency ag-status-indicator
 * @dependency ag-sparkline
 * @dependency css/components/tile.css, css/components/metrics.css - Tile, header, and metric styles
 * 
 * @fires toggle-service - Dispatched when START/STOP button is clicked
 * @fires toggle-enabled - Dispatched when ENABLED/DISABLED badge is clicked
 * @fires metric-expanded-changed - Dispatched when a metric box is expanded or collapsed
 * @fires restart-service - Dispatched when a restart is requested (if applicable)
 */

import { LitElement, html } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { formatRate, formatTimestamp, getActivityLevel, getActivityLevelForCPU, getActivityLevelForMemory, getActivityLevelForRate } from '../utils-lit.js';
import { isGuest } from '../../auth.js';
import { iconPower, iconArrowDown, iconArrowUp, iconFileText, iconPencil } from '../../ag-icons.js';

export class AgServiceCard extends LitElement {
    static properties = {
        service: { type: Object },
        metrics: { type: Object },
        history: { type: Object },
        _pending: { type: Boolean, state: true }
    };

    constructor() {
        super();
        this.service = null;
        this.metrics = { cpu_percent: 0, memory_mb: 0, tasks: 0 };
        this.history = { cpu: [], mem: [], net: [], netRx: [], netTx: [], disk: [], diskRead: [], diskWrite: [] };
        this._pending = false;
        this._lastActionTime = null;
        // Internal state for expanded charts
        this.expandedMetrics = { cpu: false, mem: false, net: false, disk: false };
    }

    updated(changedProperties) {
        if (changedProperties.has('service') && this._pending) {
            this._pending = false;
            this._lastActionTime = new Date().toISOString();
        }
    }

    /**
     * Formats a service uptime from its active_enter_timestamp.
     * @param {string|null} iso
     * @returns {string|null}
     */
    _formatUptime(iso) {
        if (!iso) return null;
        const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
        if (secs < 60)              return `${secs}s`;
        if (secs < 3600)            return `${Math.floor(secs / 60)}m`;
        if (secs < 86400)           return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
        return `${Math.floor(secs / 86400)}d ${Math.floor((secs % 86400) / 3600)}h`;
    }

    /**
     * Formats an ISO datetime string as a relative time label.
     * @param {string|null} iso
     * @returns {string}
     */
    _formatRelativeTime(iso) {
        return iso ? formatTimestamp(iso) : null;
    }

    connectedCallback() {
        super.connectedCallback();
        // Do NOT add 'display-contents' - breaks grid layout
        // The grid expects ag-service-card to be display:block with .service-tile inside
    }

    createRenderRoot() {
        return this; // Light DOM for global CSS (tile.css, .service-header, etc.)
    }

    // Helper functions (NOW imported from utils-lit.js)
    _getActivityLevelForCPU(cpu) {
        return getActivityLevelForCPU(cpu);
    }

    _getActivityLevelForMemory(mem) {
        return getActivityLevelForMemory(mem);
    }

    _getActivityLevelForRate(rate) {
        return getActivityLevelForRate(rate);
    }

    _formatRate(rate) {
        return formatRate(rate);
    }

    // Event Dispatchers
    _handleToggleService() {
        if (!this.service) return;
        this._pending = true;
        this.dispatchEvent(new CustomEvent('toggle-service', {
            detail: { serviceId: this.service.id },
            bubbles: true,
            composed: true
        }));
    }

    _handleToggleEnabled() {
        if (!this.service) return;
        this.dispatchEvent(new CustomEvent('toggle-enabled', {
            detail: {
                serviceId: this.service.id,
                systemdUnit: this.service.systemd_unit
            },
            bubbles: true,
            composed: true
        }));
    }

    _handleExpandMetric(metricType) {
        if (!this.service) return;
        this.expandedMetrics = {
            ...this.expandedMetrics,
            [metricType]: !this.expandedMetrics[metricType]
        };
        this.requestUpdate();

        // Notify parent to update the toggle all button icon
        this.dispatchEvent(new CustomEvent('metric-expanded-changed', {
            bubbles: true,
            composed: true
        }));
    }

    /**
     * Renders a compact CPU / Memory / I/O summary below the service header,
     * mirroring the Starts / Stops / Output rows in ag-profile-card.
     * @returns {import('lit').TemplateResult}
     */
    _renderServiceSummary() {
        const cpu      = this.metrics?.cpu_percent    || 0;
        const memory   = this.metrics?.memory_mb      || 0;
        const netRx    = this.metrics?.network_rx_rate || 0;
        const netTx    = this.metrics?.network_tx_rate || 0;
        const diskRead  = this.metrics?.io_read_rate   || 0;
        const diskWrite = this.metrics?.io_write_rate  || 0;

        return html`
            <div class="profile-services-summary">
                <div class="profile-info-row">
                    <span class="info-label">CPU / MEM</span>
                    <span class="info-value stops">${cpu.toFixed(1)} % / ${memory.toFixed(0)} MB</span>
                </div>
                <div class="profile-info-row">
                    <span class="info-label">Disk</span>
                    <span class="info-value stops net-value">
                        <span>↓ ${this._formatRate(diskRead)}</span>
                        <span>↑ ${this._formatRate(diskWrite)}</span>
                    </span>
                </div>
                <div class="profile-info-row">
                    <span class="info-label">NET</span>
                    <span class="info-value stops net-value">
                        <span>↓ ${this._formatRate(netRx)}</span>
                        <span>↑ ${this._formatRate(netTx)}</span>
                    </span>
                </div>
                <div class="profile-info-row">
                    <span class="info-label">Tasks</span>
                    <span class="info-value stops">${this.metrics?.tasks ?? 0}</span>
                </div>
            </div>
        `;
    }

    expandAll(expand = true) {
        this.expandedMetrics = {
            cpu: expand,
            mem: expand,
            net: expand,
            disk: expand
        };
        this.requestUpdate();
    }

    _handleRestart() {
        if (!this.service) return;
        this.dispatchEvent(new CustomEvent('restart-service', {
            detail: { serviceId: this.service.id },
            bubbles: true,
            composed: true
        }));
    }

    render() {
        if (!this.service || !this.service.id) return html``;

        const isRunning = this.service.state === 'active';
        const isInstalled = this.service.is_installed !== false;

        // Metrics processing
        const cpu = this.metrics?.cpu_percent || 0;
        const memory = this.metrics?.memory_mb || 0;

        const netRx = this.metrics?.network_rx_rate || 0;
        const netTx = this.metrics?.network_tx_rate || 0;
        const totalNet = netRx + netTx;

        const diskRead = this.metrics?.io_read_rate || 0;
        const diskWrite = this.metrics?.io_write_rate || 0;
        const totalDisk = diskRead + diskWrite;

        const tileClasses = {
            'service-tile': true,
            'animate-fade-in': true,
            'active': isRunning && !this._pending,
            'running': isRunning && !this._pending,
            'stopped': !isRunning && !this._pending,
            'pending': this._pending,
            'critical': this.service.critical,
            'unavailable': !isInstalled
        };

        return html`
            <div class=${classMap(tileClasses)} data-service-id=${this.service.id}>
                
                <div class="service-header">
                    <div>
                        <div class="service-name service-name-clickable"
                             @click=${() => this.dispatchEvent(new CustomEvent('show-service-detail', { detail: { service: this.service }, bubbles: true, composed: true }))}>
                            ${this.service.name}
                            ${this.service.enabled
                                ? html`<svg class="service-boot-icon enabled" title="Enabled at boot" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconPower}</svg>`
                                : html`<svg class="service-boot-icon disabled" title="Disabled at boot" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconPower}</svg>`}
                        </div>
                        <div class="service-unit">
                            ${this.service.systemd_unit}
                            ${isRunning && this._formatUptime(this.service.active_enter_timestamp)
                                ? html`<span class="service-uptime">${this._formatUptime(this.service.active_enter_timestamp)}</span>`
                                : ''}
                        </div>
                    </div>
                    <ag-status-indicator
                        state=${this._pending ? 'pending' : this.service.state === 'failed' ? 'down' : isRunning ? 'up' : 'down'}
                        label=${this._pending ? 'PENDING' : this.service.state === 'failed' ? 'FAILED' : isRunning ? 'UP' : 'IDLE'}>
                    </ag-status-indicator>
                </div>

                ${this._renderServiceSummary()}

                <div class="service-metrics">
                    <div class="metric-box">
                        <div class="metric-label">CPU</div>
                        <div class="metric-value activity-${this._getActivityLevelForCPU(cpu)}">
                            ${cpu.toFixed(1)}%
                        </div>
                        <div class="sparkline-container" @click=${() => this._handleExpandMetric('cpu')}>
                            <ag-sparkline
                                .data=${this.history?.cpu || []}
                                auto-scale
                                smooth
                                line-color="var(--chart-cpu)"
                                fill-color="var(--chart-cpu-bg)">
                            </ag-sparkline>
                        </div>
                    </div>
                    <div class="metric-box">
                        <div class="metric-label">MEM</div>
                        <div class="metric-value activity-${this._getActivityLevelForMemory(memory)}">
                            ${memory.toFixed(0)} MB
                        </div>
                        <div class="sparkline-container" @click=${() => this._handleExpandMetric('mem')}>
                            <ag-sparkline
                                .data=${this.history?.mem || []}
                                auto-scale
                                smooth
                                line-color="var(--chart-memory)"
                                fill-color="var(--chart-memory-bg)">
                            </ag-sparkline>
                        </div>
                    </div>
                    <div class="metric-box">
                        <div class="metric-label">NET</div>
                        <div class="metric-value activity-${this._getActivityLevelForRate(totalNet)}">
                            ${this._formatRate(totalNet)}
                            <div class="metric-tooltip">
                                <strong>Network Activity</strong><br>
                                <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconArrowDown}</svg> Ingress: ${this._formatRate(netRx)}<br>
                                <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconArrowUp}</svg> Egress: ${this._formatRate(netTx)}<br>
                                Total: ${this._formatRate(totalNet)}
                            </div>
                        </div>
                        <div class="sparkline-container" @click=${() => this._handleExpandMetric('net')}>
                            <ag-sparkline
                                .data=${this.history?.netRx || []}
                                .data2=${this.history?.netTx || []}
                                auto-scale
                                smooth
                                line-color="var(--chart-network)"
                                fill-color="var(--chart-network-bg)"
                                second-line-color="var(--chart-network-tx, var(--color-warning))">
                            </ag-sparkline>
                        </div>
                    </div>
                    <div class="metric-box">
                        <div class="metric-label">DISK</div>
                        <div class="metric-value activity-${this._getActivityLevelForRate(totalDisk)}">
                            ${this._formatRate(totalDisk)}
                            <div class="metric-tooltip">
                                <strong>Disk I/O</strong><br>
                                <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconFileText}</svg> Read: ${this._formatRate(diskRead)}<br>
                                <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconPencil}</svg> Write: ${this._formatRate(diskWrite)}<br>
                                Total: ${this._formatRate(totalDisk)}
                            </div>
                        </div>
                        <div class="sparkline-container" @click=${() => this._handleExpandMetric('disk')}>
                            <ag-sparkline
                                .data=${this.history?.diskRead || []}
                                .data2=${this.history?.diskWrite || []}
                                auto-scale
                                smooth
                                line-color="var(--chart-disk)"
                                fill-color="var(--chart-disk-bg)"
                                second-line-color="var(--chart-disk-write, var(--color-warning))">
                            </ag-sparkline>
                        </div>
                    </div>
                </div>

                ${this.expandedMetrics.cpu ? html`
                    <div class="metric-expanded-section expanded" data-expanded="cpu">
                        <div class="expanded-metric-header">
                            <h4>CPU Usage</h4>
                            <button class="metric-close-btn" @click=${() => this._handleExpandMetric('cpu')}>×</button>
                        </div>
                        <div class="expanded-metric-content">
                            <ag-metric-detail label="CPU" .data=${this.history?.cpu || []} color="var(--color-info)" unit="%"></ag-metric-detail>
                        </div>
                    </div>
                ` : ''}

                ${this.expandedMetrics.mem ? html`
                    <div class="metric-expanded-section expanded" data-expanded="mem">
                        <div class="expanded-metric-header">
                            <h4>Memory Usage</h4>
                            <button class="metric-close-btn" @click=${() => this._handleExpandMetric('mem')}>×</button>
                        </div>
                        <div class="expanded-metric-content">
                            <ag-metric-detail label="Memory" .data=${this.history?.mem || []} color="var(--color-success)" unit="mem"></ag-metric-detail>
                        </div>
                    </div>
                ` : ''}

                ${this.expandedMetrics.net ? html`
                    <div class="metric-expanded-section expanded" data-expanded="net">
                        <div class="expanded-metric-header">
                            <h4>Network Activity</h4>
                            <button class="metric-close-btn" @click=${() => this._handleExpandMetric('net')}>×</button>
                        </div>
                        <div class="expanded-metric-content split">
                            <ag-metric-detail label="↓ Ingress" .data=${this.history?.netRx || []} color="var(--color-success)" unit="rate"></ag-metric-detail>
                            <ag-metric-detail label="↑ Egress" .data=${this.history?.netTx || []} color="var(--color-warning)" unit="rate"></ag-metric-detail>
                        </div>
                    </div>
                ` : ''}

                ${this.expandedMetrics.disk ? html`
                    <div class="metric-expanded-section expanded" data-expanded="disk">
                        <div class="expanded-metric-header">
                            <h4>Disk I/O</h4>
                            <button class="metric-close-btn" @click=${() => this._handleExpandMetric('disk')}>×</button>
                        </div>
                        <div class="expanded-metric-content split">
                            <ag-metric-detail label="Read" .data=${this.history?.diskRead || []} color="var(--color-info)" unit="rate"></ag-metric-detail>
                            <ag-metric-detail label="Write" .data=${this.history?.diskWrite || []} color="var(--color-error)" unit="rate"></ag-metric-detail>
                        </div>
                    </div>
                ` : ''}
                
                <div class="service-footer">
                    <div class="service-actions">
                        ${!isGuest() ? html`
                        <div class="has-tooltip">
                            <button class="tile-action-btn ${this._pending ? 'secondary' : isRunning ? 'secondary' : 'start'}"
                                    ?disabled=${this._pending || !isInstalled}
                                    @click=${this._handleToggleService}>
                                ${this._pending ? 'PENDING...' : isRunning ? 'STOP' : 'START'}
                            </button>
                            <div class="tooltip tooltip-top">
                                ${!isInstalled ? 'Package not installed' : this._pending ? 'Please wait...' : isRunning ? 'Stop this service' : 'Start this service'}
                            </div>
                        </div>

                        <div class="has-tooltip">
                            <button class="tile-action-btn secondary"
                                    ?disabled=${this._pending || !isRunning || !isInstalled}
                                    @click=${this._handleRestart}>
                                RESTART
                            </button>
                            <div class="tooltip tooltip-top">Restart this service</div>
                        </div>

                        <div class="has-tooltip">
                            <span class="badge service-enabled-badge ${this.service.enabled ? 'success' : 'neutral'} ${isInstalled ? 'clickable' : ''}"
                                  @click=${isInstalled ? this._handleToggleEnabled : null}>
                                ${this.service.enabled ? 'ENABLED' : 'DISABLED'}
                            </span>
                            <div class="tooltip tooltip-top">
                                ${this.service.enabled ? 'Disable service at boot' : 'Enable service at boot'}
                            </div>
                        </div>
                        ` : html`
                        <div class="has-tooltip">
                            <span class="badge ${this.service.enabled ? 'success' : 'neutral'}">
                                ${this.service.enabled ? 'ENABLED' : 'DISABLED'}
                            </span>
                        </div>
                        `}

                        ${!isInstalled ? html`<span class="badge error">NOT INSTALLED</span>` : ''}
                        ${this.service.state === 'failed' ? html`<span class="badge error">FAILED</span>` : ''}
                        ${this.service.critical ? html`<span class="badge warning">Critical</span>` : ''}
                    </div>

                    ${this._lastActionTime ? html`
                        <span class="service-last-action">${this._formatRelativeTime(this._lastActionTime)}</span>
                    ` : ''}
                </div>
            </div>
        `;
    }
}

customElements.define('ag-service-card', AgServiceCard);
