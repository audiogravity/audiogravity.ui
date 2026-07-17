/**
 * @module AgServicesPage
 * @description Page component for Systemd Services management. Orchestrates Live metric updates and service controls.
 * 
 * @element ag-services-page
 * 
 * @property {Array} services - List of systemd services
 * @property {Object} metrics - Real-time metrics from SSE
 * @property {Object} history - Historical metrics for sparklines
 * @property {boolean} loading - Data loading state
 * 
 * @dependency ag-card-grid
 * @dependency ag-service-card
 * @dependency AppState - Used for connection status
 */
import { LitElement, html } from 'lit';
import { apiGet, apiPost } from '../../api.js';
import { iconMinimize, iconMaximize } from '../../ag-icons.js';
import { showToast, showConfirm, handleError } from '../../ui-helpers.js';
import { AppState, EventEmitter } from '../../common.js';
import { addToHistory } from '../../history.js';
import { FetchController } from '../../core/FetchController.js';
import { ContextConsumer } from 'https://cdn.jsdelivr.net/npm/@lit/context@1.1.0/+esm';
import { appContext } from '../../core/app-context.js';
import { logger } from '../../utils.js';
import '../atoms/ag-filter-bar.js';
import '../atoms/ag-health-bar.js';
import '../molecules/ag-service-detail-modal.js';
import './ag-card-grid.js';
import '../molecules/ag-service-card.js';

export class AgServicesPage extends LitElement {
    static properties = {
        services: { type: Array },
        config: { type: Object },
        metricsHistory: { type: Object },
        _filter: { type: String, state: true },
        _detailService: { type: Object, state: true }
    };

    constructor() {
        super();
        this.services = [];
        this.config = {};
        this.metricsHistory = this._loadMetricsHistory();
        this._filter = 'all';
        this._detailService = null;
        this._loaded = false;

        this._bindAppVisible = this._handleAppVisible.bind(this);
        this._bindProfileChanged = this._handleProfileChanged.bind(this);
        this._bindHandleServiceMetricsSSE = this._handleServiceMetricsSSE.bind(this);

        this.servicesFetch = new FetchController(this, {
            autoFetch: false,
            fetchFn: async () => {
                const config = await apiGet('/profiles/configuration');
                const servicesConfig = config.services || {};
                
                const servicesList = [];
                for (const [serviceId, serviceConfig] of Object.entries(servicesConfig)) {
                    try {
                        const info = await apiGet(`/services/${serviceConfig.systemd_unit}`);
                        servicesList.push({
                            id: serviceId,
                            systemd_unit: serviceConfig.systemd_unit,
                            critical: serviceConfig.critical,
                            ...info,
                            name: serviceConfig.label
                        });
                    } catch (error) {
                        console.error(`Failed to load service ${serviceId}:`, error);
                        servicesList.push({
                            id: serviceId,
                            systemd_unit: serviceConfig.systemd_unit,
                            critical: serviceConfig.critical,
                            state: 'unknown',
                            enabled: false,
                            is_installed: false,
                            metrics: { cpu_percent: 0, memory_mb: 0, tasks: 0 },
                            name: serviceConfig.label
                        });
                    }
                }
                return { config: servicesConfig, servicesList };
            },
            onSuccess: (data) => {
                this.config = data.config;
                this.services = data.servicesList;
                
                // PWA Snapshot support
                if (EventEmitter) {
                    EventEmitter.emit('services-list-update', this.services);
                }
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

    createRenderRoot() {
        return this; // Light DOM for external CSS
    }

    connectedCallback() {
        super.connectedCallback();
        if (EventEmitter) {
            EventEmitter.on('app-visible', this._bindAppVisible);
            EventEmitter.on('profile-changed', this._bindProfileChanged);

            // PHASE 3.7: Reactive live updates for service states (Mirror of Profiles logic)
            this._onServicesMetrics = (data) => {
                if (!this.services || !data.services) return;
                const servicesData = data.services;
                this.services.forEach((service, index) => {
                    const metrics = servicesData[service.id] || servicesData[service.systemd_unit.replace('.service', '')];
                    if (metrics && metrics.state) {
                        this._updateServiceMetrics(service.id, metrics);
                    }
                });
            };

            this._onServiceAction = (data) => {
                if (!this.services || !data.service) return;
                const serviceIndex = this.services.findIndex(s =>
                    s.id === data.service || s.systemd_unit.replace('.service', '') === data.service
                );
                if (serviceIndex !== -1 && data.new_state) {
                    this.services[serviceIndex] = {
                        ...this.services[serviceIndex],
                        state: data.new_state.toLowerCase()
                    };
                    this.requestUpdate('services');
                    if (EventEmitter) EventEmitter.emit('services-list-update', this.services);
                }
            };

            EventEmitter.on('services-metrics', this._onServicesMetrics);
            EventEmitter.on('service-action', this._onServiceAction);
            EventEmitter.on('service-metrics-sse', this._bindHandleServiceMetricsSSE);
        }

        if (AppState.currentTab === 'services' || window.location.hash === '#services') {
            this.updateComplete.then(() => this._loadServices());
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (EventEmitter) {
            EventEmitter.off('app-visible', this._bindAppVisible);
            EventEmitter.off('profile-changed', this._bindProfileChanged);
            EventEmitter.off('services-metrics', this._onServicesMetrics);
            EventEmitter.off('service-action', this._onServiceAction);
            EventEmitter.off('service-metrics-sse', this._bindHandleServiceMetricsSSE);
        }
    }

    _handleTabChanged(data) {
        if (data.active === 'services') {
            if (!this._loaded) {
                this._loadServices();
            }
        }
    }

    _handleAppVisible(currentTab) {
        if (currentTab === 'services') {
            // Re-fetch or re-sync if needed when coming back to foreground
            // But usually SSE should handle it
        }
    }

    _handleProfileChanged() {
        if (AppState.currentTab === 'services') {
            // Speed up reload from 1500ms to 300ms 
            // Most updates are now handled by SSE anyway
            setTimeout(() => this._loadServices(), 300);
        } else {
            this._loaded = false; // force reload next time tab is active
        }
    }

    _loadServices() {
        this._loaded = true;
        return this.servicesFetch.fetch();
    }

    _handleServiceMetricsSSE({ serviceId, metrics }) {
        if (!this.services) return;

        const service = this.services.find(s =>
            s.id === serviceId ||
            s.systemd_unit === serviceId ||
            s.systemd_unit === `${serviceId}.service`
        );

        if (service) {
            this._updateServiceMetrics(service.id, metrics);
        }
    }

    _initMetricsHistory(serviceId) {
        if (!this.metricsHistory[serviceId]) {
            this.metricsHistory[serviceId] = {
                cpu: Array(30).fill(0),
                mem: Array(30).fill(0),
                net: Array(30).fill(0),
                netRx: Array(30).fill(0),
                netTx: Array(30).fill(0),
                disk: Array(30).fill(0),
                diskRead: Array(30).fill(0),
                diskWrite: Array(30).fill(0)
            };
        }
    }

    _addMetricToHistory(serviceId, metric, value) {
        const history = this.metricsHistory[serviceId];
        if (!history) return;

        history[metric].shift();
        history[metric].push(value || 0);

        // Save to localStorage periodically (debounced by natural SSE frequency)
        this._saveMetricsHistory();
    }

    _loadMetricsHistory() {
        try {
            const saved = localStorage.getItem('ag_metricsHistory');
            if (saved) {
                const parsed = JSON.parse(saved);
                // Validate structure
                if (typeof parsed === 'object' && parsed !== null) {
                    logger.log('Restored metrics history from localStorage');
                    return parsed;
                }
            }
        } catch (e) {
            logger.warn('Failed to load metrics history from localStorage:', e);
        }
        return {};
    }

    _saveMetricsHistory() {
        // Debounce: écriture localStorage max toutes les 30s (synchrone et coûteux)
        clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => {
            try {
                const toSave = {};
                for (const [serviceId, history] of Object.entries(this.metricsHistory)) {
                    const hasData = Object.values(history).some(arr =>
                        arr.some(val => val !== 0)
                    );
                    if (hasData) {
                        toSave[serviceId] = history;
                    }
                }
                localStorage.setItem('ag_metricsHistory', JSON.stringify(toSave));
            } catch (e) {
                // Quota exceeded or other error - ignore silently
                if (e.name === 'QuotaExceededError') {
                    logger.warn('localStorage quota exceeded, clearing old metrics history');
                    localStorage.removeItem('ag_metricsHistory');
                }
            }
        }, 30000);
    }

    _updateServiceMetrics(serviceId, metrics) {
        const serviceIndex = this.services.findIndex(s => s.id === serviceId);
        if (serviceIndex === -1) return;

        const service = this.services[serviceIndex];

        this._initMetricsHistory(serviceId);

        if (metrics.cpu_percent !== undefined) this._addMetricToHistory(serviceId, 'cpu', metrics.cpu_percent);
        if (metrics.memory_mb !== undefined) this._addMetricToHistory(serviceId, 'mem', metrics.memory_mb);

        let rxMBps = metrics.network_rx_rate !== undefined ? metrics.network_rx_rate : (metrics.ip_ingress_mb_per_sec || 0);
        let txMBps = metrics.network_tx_rate !== undefined ? metrics.network_tx_rate : (metrics.ip_egress_mb_per_sec || 0);
        this._addMetricToHistory(serviceId, 'net', rxMBps + txMBps);
        this._addMetricToHistory(serviceId, 'netRx', rxMBps);
        this._addMetricToHistory(serviceId, 'netTx', txMBps);

        let read = metrics.io_read_rate !== undefined ? metrics.io_read_rate : (metrics.io_read_mb_per_sec || 0);
        let write = metrics.io_write_rate !== undefined ? metrics.io_write_rate : (metrics.io_write_mb_per_sec || 0);
        this._addMetricToHistory(serviceId, 'disk', read + write);
        this._addMetricToHistory(serviceId, 'diskRead', read);
        this._addMetricToHistory(serviceId, 'diskWrite', write);

        // Update service in state including its live state from metrics
        this.services[serviceIndex] = { 
            ...service, 
            metrics: { ...metrics },
            state: metrics.state || service.state
        };

        // Trigger Lit reactive rendering
        this.requestUpdate('services');

        // Also we want to ensure the specific card receives the updated history object reference
        // to re-render its sparklines. This is done by requesting an update on `metricsHistory`
        this.metricsHistory = { ...this.metricsHistory };
    }

    async _handleRestartService(e) {
        const serviceId = e.detail.serviceId;
        const service = this.services.find(s => s.id === serviceId);
        if (!service) return;

        const confirmed = await showConfirm(
            'Restart Service',
            `Are you sure you want to restart "${service.name}"?`
        );
        if (!confirmed) return;

        try {
            const result = await apiPost(`/services/${service.systemd_unit}/restart`);
            if (result.success) {
                if (addToHistory) addToHistory('service', `Restarted: ${service.name}`, true);
                if (showToast) showToast('success', 'Service Restarted', service.name);
                setTimeout(() => this._loadServices(), 1500);
            } else {
                throw new Error(result.message || 'restart failed');
            }
        } catch (error) {
            console.error('Service restart failed:', error);
            addToHistory('service', `Failed restart: ${service.name} - ${error.message}`, false);
            handleError(error, 'Service restart failed');
        }
    }

    async _handleToggleEnabled(e) {
        const { serviceId, systemdUnit } = e.detail;
        const service = this.services.find(s => s.id === serviceId);
        if (!service) return;

        const currentlyEnabled = service.enabled;
        const action = currentlyEnabled ? 'disable' : 'enable';
        const actionLabel = currentlyEnabled ? 'Disable' : 'Enable';

        const confirmed = await showConfirm(
            `${actionLabel} Service`,
            `Are you sure you want to ${action} "${service.name}"?`
        );
        if (!confirmed) return;

        try {
            const result = await apiPost(`/services/${systemdUnit}/action?action=${action}`, {});

            if (result.success) {
                if (addToHistory) addToHistory('service', `${actionLabel}d: ${service.name}`, true);
                if (showToast) showToast('success', `${actionLabel} Service`, `Service "${service.name}" ${action}d successfully`);

                setTimeout(async () => {
                    await this._loadServices();
                    if (EventEmitter) {
                        EventEmitter.emit('service-changed', {
                            service_id: service.id,
                            systemd_unit: service.systemd_unit,
                            action: action
                        });
                    }
                }, 1000);
            } else {
                throw new Error(result.message || `${action} failed`);
            }
        } catch (error) {
            console.error(`Service ${action} failed:`, error);
            addToHistory('service', `Failed ${action}: ${service.name} - ${error.message}`, false);
            handleError(error, `Failed to ${action} service`);
        }
    }

    async _handleToggleService(e) {
        const serviceId = e.detail.serviceId;
        const service = this.services.find(s => s.id === serviceId);
        if (!service) return;

        const isRunning = service.state === 'active';
        const action = isRunning ? 'stop' : 'start';

        const confirmed = await showConfirm(
            `${action.charAt(0).toUpperCase() + action.slice(1)} Service`,
            `Are you sure you want to ${action} "${service.name}"?`
        );
        if (!confirmed) return;

        try {
            const result = await apiPost(`/services/${service.systemd_unit}/${action}`);

            if (result.success) {
                if (addToHistory) addToHistory('service', `${action}: ${service.name}`, true);
                if (showToast) {
                    showToast(
                        'success',
                        action === 'start' ? 'Service Started' : 'Service Stopped',
                        service.name
                    );
                }

                setTimeout(async () => {
                    await this._loadServices();
                    if (EventEmitter) {
                        EventEmitter.emit('service-changed', {
                            serviceId: serviceId,
                            action: action,
                            service: service
                        });
                    }
                }, 1000);
            } else {
                throw new Error(result.message || `${action} failed`);
            }
        } catch (error) {
            console.error('Service action failed:', error);
            addToHistory('service', `Failed ${action}: ${service.name} - ${error.message}`, false);
            handleError(error, 'Service operation failed');
        }
    }

    _toggleAllMetrics() {
        let expandedCount = 0;
        let totalCount = 0;

        const cards = Array.from(this.querySelectorAll('ag-service-card'));
        cards.forEach(card => {
            totalCount += 4; // usually 4 metrics per card
            if (card.expandedMetrics) {
                expandedCount += Object.values(card.expandedMetrics).filter(Boolean).length;
            }
        });

        const shouldExpand = expandedCount < totalCount / 2;

        cards.forEach(card => {
            if (typeof card.expandAll === 'function') {
                card.expandAll(shouldExpand);
            }
        });

        this.requestUpdate();
    }

    _renderToggleIcon() {
        let expandedCount = 0;
        let totalCount = 0;

        const cards = Array.from(this.querySelectorAll('ag-service-card'));
        cards.forEach(card => {
            totalCount += 4;
            if (card.expandedMetrics) {
                expandedCount += Object.values(card.expandedMetrics).filter(Boolean).length;
            }
        });

        const svgContent = (totalCount > 0 && expandedCount >= totalCount / 2) ? iconMinimize : iconMaximize;
        return html`<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${svgContent}</svg>`;
    }

    _showInfo() {
        if (!window.UIComponents || !window.UIComponents.InfoModal) return;

        const content = window.UIComponents.InfoModal.createContent(
            'The Services tab allows you to monitor and control individual systemd services in real-time.',
            [
                { title: 'Real-time Status', text: 'Monitor whether services are active (green dot), inactive (gray dot), or failed (red dot). The status dot blinks orange while a start/stop action is pending.' },
                { title: 'Health Bar', text: 'The segmented bar at the top shows the proportion of running / stopped / failed services at a glance, with live counters.' },
                { title: 'Quick Filter', text: 'Use ALL / RUNNING / STOPPED / FAILED to instantly narrow the service list to the state you care about.' },
                { title: 'Manual Control', text: 'Start, stop, or restart any listed service directly from its tile. The ENABLED / DISABLED badge controls whether the service starts automatically at boot.' },
                { title: 'Uptime', text: 'When a service is running, its uptime (e.g. 54m, 2h 10m, 3d 4h) is displayed next to the systemd unit name.' },
                { title: 'Service Detail', text: 'Click the service name to open a detail modal with live metrics (CPU, Memory, Tasks, NET ↓/↑, Disk Read/Write, boot state) and the session action history.' },
                { title: 'Sparklines — NET dual-line', text: 'The NET sparkline displays two lines simultaneously: solid for download (↓ RX) and dashed for upload (↑ TX). Both share the same auto-scaled axis.' },
                { title: 'Detailed Metrics', text: 'Click any metric box or sparkline to expand a full chart with historical data. CPU and MEM show a single series; NET shows separate Ingress / Egress panels; Disk shows Read / Write panels.' },
                {
                    title: 'Activity Level Colors',
                    text: 'Service metrics use color coding to indicate activity levels optimized for individual audio services:<ul class="info-list">' +
                        '<li class="info-list-item"><strong>CPU Usage:</strong></li>' +
                        '<li class="info-list-item"><span class="info-badge activity-low">● LOW</span> ≤ 5% — Service idle or minimal activity</li>' +
                        '<li class="info-list-item"><span class="info-badge activity-medium">● MEDIUM</span> 5–20% — Active streaming, normal playback</li>' +
                        '<li class="info-list-item"><span class="info-badge activity-high">● HIGH</span> &gt; 20% — DSP processing, upsampling, multiple streams</li>' +
                        '<li class="info-list-item" style="margin-top: 8px;"><strong>Memory Usage:</strong></li>' +
                        '<li class="info-list-item"><span class="info-badge activity-low">● LOW</span> ≤ 30 MB — Idle or minimal footprint</li>' +
                        '<li class="info-list-item"><span class="info-badge activity-medium">● MEDIUM</span> 30–100 MB — Active streaming with normal buffers</li>' +
                        '<li class="info-list-item"><span class="info-badge activity-high">● HIGH</span> &gt; 100 MB — Large buffers, cache, multiple streams</li>' +
                        '<li class="info-list-item" style="margin-top: 8px;"><strong>Network / Disk I/O:</strong></li>' +
                        '<li class="info-list-item"><span class="info-badge activity-low">● LOW</span> ≤ 1 MB/s — Idle, compressed audio, single stream</li>' +
                        '<li class="info-list-item"><span class="info-badge activity-medium">● MEDIUM</span> 1–5 MB/s — Active FLAC / Hi-Res streaming</li>' +
                        '<li class="info-list-item"><span class="info-badge activity-high">● HIGH</span> &gt; 5 MB/s — Multiple Hi-Res streams, DSD, heavy I/O</li>' +
                        '</ul><div class="info-reference-box"><strong>Audio Format Reference:</strong> CD Quality (16/44.1) ≈1.4 MB/s • Hi-Res (24/96) ≈4–5 MB/s • Hi-Res (24/192) ≈9–10 MB/s • DSD64 ≈5–6 MB/s • FLAC lossless ≈1–2 MB/s per stream</div>'
                }
            ]
        );
        window.UIComponents.InfoModal.show('About Audiogravity Services', content);
    }

    render() {
        const filterOptions = [
            { label: 'ALL',     value: 'all'      },
            { label: 'RUNNING', value: 'running'  },
            { label: 'STOPPED', value: 'stopped'  },
            { label: 'FAILED',  value: 'failed'   }
        ];

        const filtered = this.services.filter(s => {
            if (this._filter === 'running') return s.state === 'active';
            if (this._filter === 'stopped') return s.state === 'inactive' || s.state === 'unknown';
            if (this._filter === 'failed')  return s.state === 'failed';
            return true;
        });

        const running = this.services.filter(s => s.state === 'active').length;
        const failed  = this.services.filter(s => s.state === 'failed').length;
        const idle    = this.services.length - running - failed;

        return html`
            <ag-service-detail-modal
                .service=${this._detailService}
                .history=${this._detailService ? (AppState.serviceHistory || []).filter(h => h.action?.includes(this._detailService.name)).slice(0, 8) : []}
                ?show=${!!this._detailService}
                @modal-close=${() => { this._detailService = null; }}>
            </ag-service-detail-modal>

            <div class="services-zone tab-zone">
                <div class="tab-title-container">
                    <h2>SERVICES</h2>
                    <span class="badge info clickable" @click=${this._showInfo}>INFO</span>
                    <span class="toggle-metrics-icon"
                        title="Toggle all metrics"
                        @click=${this._toggleAllMetrics}>${this._renderToggleIcon()}</span>
                </div>
                <div class="tab-filter-row">
                    <ag-filter-bar
                        .options=${filterOptions}
                        value=${this._filter}
                        @filter-change=${e => { this._filter = e.detail.value; }}>
                    </ag-filter-bar>
                </div>

                <ag-health-bar
                    .showCounters=${true}
                    active=${running}
                    failed=${failed}
                    idle=${idle}
                    style="margin-bottom: var(--spacing-md)">
                </ag-health-bar>

                <ag-card-grid
                    class="services-grid"
                    grid-class="services-grid-container"
                    skeleton-class="service-tile"
                    empty-message="No services available"
                    .items=${filtered}
                    ?loading=${this.servicesFetch.loading}
                    error=${this.servicesFetch.error || ''}
                    .renderItem=${(service, _index) => {
                // Ensure there is history initialized for this service
                if (!this.metricsHistory[service.id]) {
                    this._initMetricsHistory(service.id);
                }
                return html`
                            <ag-service-card 
                                id="ag-service-${service.id}"
                                .service=${service}
                                .metrics=${service.metrics}
                                .history=${this.metricsHistory[service.id]}
                                .delayIndex=${_index}>
                            </ag-service-card>
                        `;
            }}
                    @toggle-service=${this._handleToggleService}
                    @toggle-enabled=${this._handleToggleEnabled}
                    @restart-service=${this._handleRestartService}
                    @metric-expanded-changed=${() => this.requestUpdate()}
                    @show-service-detail=${e => { this._detailService = e.detail?.service || null; }}>
                </ag-card-grid>
            </div>
        `;
    }
}

customElements.define('ag-services-page', AgServicesPage);
