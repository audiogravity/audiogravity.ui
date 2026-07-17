import { LitElement, html } from 'lit';
import { ContextConsumer } from 'https://cdn.jsdelivr.net/npm/@lit/context@1.1.0/+esm';
import { appContext } from '../../core/app-context.js';
import { AppState, EventEmitter } from '../../common.js';
import { classMap } from 'lit/directives/class-map.js';
import { FetchController } from '../../core/FetchController.js';
import { formatUptime } from '../../utils.js';
import { iconInfo, iconConnection, iconMusicNote } from '../../ag-icons.js';
import '../molecules/ag-audio-card.js';
import './ag-card-grid.js';
import '../molecules/ag-network-card.js';
import '../molecules/ag-system-info.js';
import '../molecules/ag-system-tile.js';

/**
 * System Dashboard Web Component
 * @element ag-system-dashboard
 *
 * @dependency css/components/tile.css
 * @dependency css/system.css
 */
export class AgSystemDashboard extends LitElement {
    static properties = {
        metrics: { type: Object },
        lastNetworkStats: { type: Object },
        isConnected: { type: Boolean }
    };

    constructor() {
        super();
        this.metrics = {
            cpu_percent: 0,
            load_avg: [0, 0, 0],
            memory_percent: 0,
            memory_used: 0,
            memory_total: 0,
            disk_usage_percent: 0,
            disk_used_gb: 0,
            disk_total_gb: 0,
            temperature: 0,
            network_bytes_sent: 0,
            network_bytes_recv: 0,
            uptime: 0
        };
        this.lastNetworkStats = { sent: 0, recv: 0, timestamp: 0 };
        this.isConnected = false;

        this._handleConnectionStatus = ({ connected }) => {
            this.isConnected = connected;
        };

        // History references
        this._historyStore = {
            cpu: [],
            memory: [],
            temperature: [],
            network: [],
            disk: []
        };
        this.MAX_HISTORY = 60;

        // Fetch Controllers
        this.statusFetch = new FetchController(this, {
            url: '/sysinfo/status',
            onSuccess: (data) => {
                if (data && data.system && data.system.network_interfaces) {
                    this.requestUpdate(); 
                }
            }
        });

        this.audioFetch = new FetchController(this, {
            url: '/audio-hw/devices'
        });

        this.metricsFetch = new FetchController(this, {
            url: '/sysinfo/metrics',
            onSuccess: (data) => this._handleSysinfoUpdate(data)
        });

        // Subscribe to Global App Context
        new ContextConsumer(this, {
            context: appContext,
            subscribe: true,
            callback: (state) => {
                if (state && state.connected !== undefined) {
                    this.isConnected = state.connected;
                }
            }
        });
    }

    createRenderRoot() {
        return this; // Light DOM
    }

    connectedCallback() {
        super.connectedCallback();

        // Listen to global sysinfo updates
        this._onUpdate = this._handleSysinfoUpdate.bind(this);
        EventEmitter.on('sysinfo-update', this._onUpdate);

        // Initial state
        if (AppState) {
            this.isConnected = AppState.connected;
        }

        // Listen for connection status changes
        EventEmitter.on('connection-status', this._handleConnectionStatus);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        EventEmitter.off('sysinfo-update', this._onUpdate);
        EventEmitter.off('connection-status', this._handleConnectionStatus);
    }

    _addHistory(metric, value) {
        this._historyStore[metric].push(value);
        if (this._historyStore[metric].length > this.MAX_HISTORY) {
            this._historyStore[metric].shift();
        }
        return [...this._historyStore[metric]];
    }

    _handleSysinfoUpdate(data) {
        // Merge data into our metrics object to trigger reactive update
        const updated = { ...this.metrics };

        if (data.cpu_percent !== undefined) updated.cpu_percent = data.cpu_percent;
        if (data.load_avg !== undefined) updated.load_avg = data.load_avg;
        else if (data.load_1min !== undefined) updated.load_avg = [data.load_1min, data.load_5min, data.load_15min];

        if (data.memory_percent !== undefined) updated.memory_percent = data.memory_percent;
        if (data.memory_used !== undefined) updated.memory_used = data.memory_used;
        if (data.memory_total !== undefined) updated.memory_total = data.memory_total;

        if (data.disk_usage_percent !== undefined) updated.disk_usage_percent = data.disk_usage_percent;
        if (data.disk_used_gb !== undefined) updated.disk_used_gb = data.disk_used_gb;
        if (data.disk_total_gb !== undefined) updated.disk_total_gb = data.disk_total_gb;

        const temp = data.cpu_temp || data.temperature || data.max_temp;
        if (temp !== undefined) updated.temperature = temp;

        if (data.uptime !== undefined) updated.uptime = data.uptime;

        // Calculate network rate
        if (data.network_bytes_sent !== undefined && data.network_bytes_recv !== undefined) {
            const now = Date.now();
            if (this.lastNetworkStats.timestamp !== 0) {
                const timeDiff = (now - this.lastNetworkStats.timestamp) / 1000;
                if (timeDiff > 0) {
                    const sentRate = (data.network_bytes_sent - this.lastNetworkStats.sent) / 1024 / timeDiff;
                    const recvRate = (data.network_bytes_recv - this.lastNetworkStats.recv) / 1024 / timeDiff;
                    updated.network_rate = sentRate + recvRate;
                    updated.network_sent_detail = sentRate;
                    updated.network_recv_detail = recvRate;
                }
            }
            this.lastNetworkStats = { sent: data.network_bytes_sent, recv: data.network_bytes_recv, timestamp: now };
        }

        // Add to history
        this._historyStore.cpu = this._addHistory('cpu', updated.cpu_percent);
        this._historyStore.memory = this._addHistory('memory', updated.memory_percent);
        this._historyStore.temperature = this._addHistory('temperature', updated.temperature);
        if (updated.network_rate !== undefined) this._historyStore.network = this._addHistory('network', updated.network_rate);
        this._historyStore.disk = this._addHistory('disk', updated.disk_usage_percent);

        this.metrics = updated;
    }

    render() {
        const memTotalGB = (this.metrics.memory_total / (1024 * 1024 * 1024)).toFixed(1);
        const memUsedGB = (this.metrics.memory_used / (1024 * 1024 * 1024)).toFixed(1);

        const sysinfo = this.statusFetch.data;
        const interfaces = sysinfo?.system?.network_interfaces || [];
        const audioDevices = this.audioFetch.data?.cards || [];

        return html`
                <!-- System Info Tile -->
                <div class="system-tile span-2">
                    <h3><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconInfo}</svg> System Information</h3>
                    <ag-system-info 
                        .system=${sysinfo ? sysinfo.system : null}
                        .cpu=${sysinfo ? sysinfo.cpu : null}
                        .loadAvg=${this.metrics.load_avg}
                        .bootTime=${sysinfo ? sysinfo.boot_time : null}>
                    </ag-system-info>
                </div>

                <!-- Connection Tile -->
                <ag-system-tile 
                    type="connection" 
                    title="SSE Stream" 
                    icon="icon-wifi"
                    ?connected=${this.isConnected}
                    connection-id=${AppState.connectionId || ''}>
                </ag-system-tile>

                <!-- CPU Tile -->
                <ag-system-tile 
                    title="CPU Usage" 
                    icon="icon-chip" 
                    unit="%" 
                    detail="Load: ${this.metrics.load_avg.map(n => typeof n === 'number' ? n.toFixed(2) : n).join(', ')}"
                    .value=${this.metrics.cpu_percent.toFixed(1)}
                    .sparklineData=${this._historyStore.cpu}
                    sparkline-color="var(--chart-cpu)" 
                    sparkline-fill="var(--chart-cpu-bg)">
                </ag-system-tile>

                <!-- Temperature Tile -->
                <ag-system-tile 
                    title="Temperature" 
                    icon="icon-thermometer" 
                    unit="°C" 
                    detail="${this.metrics.temperature > 80 ? 'Critical Overheat!' : 'Core Temp'}"
                    .value=${this.metrics.temperature.toFixed(1)}
                    .sparklineData=${this._historyStore.temperature}
                    sparkline-color="var(--chart-temperature)" 
                    sparkline-fill="var(--chart-temperature-bg)">
                </ag-system-tile>

                <!-- Memory Tile -->
                <ag-system-tile 
                    title="Memory" 
                    icon="icon-memory" 
                    unit="%" 
                    detail="${memUsedGB} GB / ${memTotalGB} GB"
                    .value=${this.metrics.memory_percent.toFixed(1)}
                    .sparklineData=${this._historyStore.memory}
                    sparkline-color="var(--chart-memory)" 
                    sparkline-fill="var(--chart-memory-bg)">
                </ag-system-tile>

                <!-- Disk Tile -->
                <ag-system-tile 
                    title="Disk Usage" 
                    icon="icon-drive" 
                    unit="%" 
                    detail="${this.metrics.disk_used_gb?.toFixed(1) || '--'} GB / ${this.metrics.disk_total_gb?.toFixed(1) || '--'} GB"
                    .value=${this.metrics.disk_usage_percent.toFixed(1)}
                    .sparklineData=${this._historyStore.disk}
                    sparkline-color="var(--chart-disk)" 
                    sparkline-fill="var(--chart-disk-bg)">
                </ag-system-tile>

                <!-- Network Tile -->
                <ag-system-tile 
                    title="Network I/O" 
                    icon="icon-connection" 
                    unit="kB/s" 
                    detail="↑ ${this.metrics.network_sent_detail?.toFixed(1) || '0.0'} / ↓ ${this.metrics.network_recv_detail?.toFixed(1) || '0.0'}"
                    .value=${(this.metrics.network_rate || 0).toFixed(1)}
                    .sparklineData=${this._historyStore.network}
                    sparkline-color="var(--chart-network)" 
                    sparkline-fill="var(--chart-network-bg)">
                </ag-system-tile>
                
                <!-- Uptime Tile -->
                <ag-system-tile 
                    title="Uptime" 
                    icon="icon-clock" 
                    unit="Session" 
                    detail="Since last boot"
                    .value=${formatUptime(this.metrics.uptime || 0)}>
                </ag-system-tile>

                <!-- Network Interfaces Tile -->
                <div class="system-tile">
                    <h3><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconConnection}</svg> Network Interfaces</h3>
                    <ag-card-grid 
                        grid-class="network-interfaces-grid" 
                        skeleton-class="network-interface" 
                        empty-message="No network interfaces found"
                        ?loading=${this.statusFetch.loading}
                        error=${this.statusFetch.error || ''}
                        .items=${interfaces}
                        .renderItem=${(iface) => html`<ag-network-card .iface=${iface}></ag-network-card>`}>
                    </ag-card-grid>
                </div>

                <!-- Audio Devices Tile -->
                <div class="system-tile span-2">
                    <h3><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconMusicNote}</svg> Audio Devices</h3>
                    <ag-card-grid
                        grid-class="audio-devices-grid"
                        skeleton-class="audio-card"
                        empty-message="No audio devices found"
                        ?loading=${this.audioFetch.loading}
                        error=${this.audioFetch.error || ''}
                        .items=${audioDevices}
                        .renderItem=${(card) => html`<ag-audio-card .card=${card}></ag-audio-card>`}>
                    </ag-card-grid>
                </div>

        `;
    }
}

customElements.define('ag-system-dashboard', AgSystemDashboard);
