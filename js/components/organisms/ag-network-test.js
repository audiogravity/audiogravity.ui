/**
 * @module AgNetworkTest
 * @description Organism component for configuring, running, and displaying Network Stability tests (ping/iperf3).
 * Repackages the old js/performance.js logic into a Lit Web Component.
 *
 * @element ag-network-test
 *
 * @prop {String} testType - Test type ('ping', 'iperf3_udp', 'iperf3_tcp')
 * @prop {Object} config - Test configuration (targets, duration, bandwidth, etc.)
 * @prop {String} testState - Current test state ('idle', 'running', 'completed', 'failed', 'cancelled')
 * @prop {Object} statusData - Real-time test status data
 * @prop {Object} resultData - Test results and statistics
 * @prop {String} currentTestId - Current test identifier
 * @prop {Object} healthStatus - Network health status indicators
 *
 * @dependency js/api.js - apiPost function for backend communication
 * @dependency css/performance.css - Performance test page styling
 * @dependency css/components/forms.css, css/components/button.css, css/utilities.css - Forms, buttons, and utilities
 */

import { LitElement, html } from 'lit';
import { apiPost } from '../../api.js';
import { saveNetworkResult, getTestHistory, clearTestHistory } from '../../test-history.js';
import { iconHistory } from '../../ag-icons.js';
import '../atoms/ag-stat-box.js';

export class AgNetworkTest extends LitElement {
    static properties = {
        testType: { type: String }, // 'ping', 'iperf3_udp', 'iperf3_tcp'
        config: { type: Object },
        testState: { type: String }, // 'idle', 'running', 'completed', 'failed', 'cancelled'
        statusData: { type: Object },
        resultData: { type: Object },
        currentTestId: { type: String },
        healthStatus: { type: Object },
        serverHistory: { type: Array },
        suggestedServers: { type: Array },
        iperfServiceStatus: { type: String }, // 'active', 'inactive', 'failed', 'unknown'
        _testHistory: { type: Array, state: true },
        _historyOpen: { type: Boolean, state: true }
    };

    constructor() {
        super();
        this.testType = 'ping';
        this.config = {
            pingTarget: '1.1.1.1',
            pingCount: 20,
            iperf3Server: '',
            iperf3Duration: 20,
            iperf3Bandwidth: '15M',
            iperf3PacketSize: 1450
        };
        this.testState = 'idle';
        this.statusData = null;
        this.resultData = null;
        this.currentTestId = null;
        this.healthStatus = null;
        this.serverHistory = this._loadHistory();
        this.suggestedServers = [
            'localhost',
            'ping.online.net',
            'nl.iperf.014.fr:10415'
        ];

        this._bindSSE = this._handleSSEProgress.bind(this);
        this._bindServiceSSE = this._handleServiceSSE.bind(this);
        this.iperfServiceStatus = 'unknown';
        this._testHistory = getTestHistory().filter(e => e.type !== 'latency');
        this._historyOpen = false;
    }

    _loadHistory() {
        try {
            const history = localStorage.getItem('ag_iperf_history');
            return history ? JSON.parse(history) : [];
        } catch (e) {
            return [];
        }
    }

    _saveHistory(server) {
        if (!server) return;
        let history = this._loadHistory();
        history = [server, ...history.filter(s => s !== server)].slice(0, 5);
        localStorage.setItem('ag_iperf_history', JSON.stringify(history));
        this.serverHistory = history;
    }

    createRenderRoot() {
        return this; // Light DOM for global CSS
    }

    connectedCallback() {
        super.connectedCallback();
        this._loadHistory();
        EventEmitter.on('network_test_progress', this._bindSSE);
        EventEmitter.on('sse-event-received', this._bindServiceSSE);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        EventEmitter.off('network_test_progress', this._bindSSE);
        EventEmitter.off('sse-event-received', this._bindServiceSSE);
        if (this._jitterChart) {
            this._jitterChart.destroy();
            this._jitterChart = null;
        }
    }

    async _checkIperfServiceStatus() {
        try {
            const info = await apiGet('/services/iperf3.service');
            this.iperfServiceStatus = info.state || 'unknown';
        } catch (error) {
            console.warn('Failed to fetch iperf3.service status:', error);
            this.iperfServiceStatus = 'unknown';
        }
    }

    _handleServiceSSE({ type, data }) {
        if (type === 'services_metrics') {
            const iperfInfo = data.services?.iperf3;
            if (iperfInfo && this.testType.startsWith('iperf3')) {
                this.iperfServiceStatus = iperfInfo.state || 'unknown';
            }
        } else if (type === 'service_action') {
            if (data.service === 'iperf3' || data.service === 'iperf3.service') {
                this.iperfServiceStatus = data.new_state || 'unknown';
            }
        }
    }

    async _toggleIperfService() {
        if (!this.iperfServiceStatus || this.iperfServiceStatus === 'loading') return;
        
        const action = this.iperfServiceStatus === 'active' ? 'stop' : 'start';
        const oldStatus = this.iperfServiceStatus;
        this.iperfServiceStatus = 'loading';

        try {
            await apiPost(`/services/iperf3.service/${action}`);
            showToast('success', 'Service Updated', `iperf3.service ${action === 'start' ? 'started' : 'stopped'} successfully.`);
            // No more setTimeout polling, we wait for SSE
        } catch (error) {
            handleError(error, `Failed to ${action} iperf3.service`);
            this.iperfServiceStatus = oldStatus;
        }
    }

    _handleConfigChange(e) {
        const { id, type, value, name } = e.target;

        if (name === 'networkTestType') {
            this.testType = value;
            return;
        }

        const key = id.replace('cfg_', '');
        if (type === 'number') {
            this.config = { ...this.config, [key]: parseInt(value) || 0 };
        } else {
            this.config = { ...this.config, [key]: value };
        }

        if (name === 'networkTestType' && value.startsWith('iperf3')) {
            this._checkIperfServiceStatus();
        }
    }

    _showInfo() {
        if (!window.UIComponents || !window.UIComponents.InfoModal) return;

        const content = window.UIComponents.InfoModal.createContent(
            'Measures network stability for audio streaming (AirPlay, Roon ARC, NAS). Three test modes: Ping for quick latency checks, iperf3 UDP to simulate real-time streaming, iperf3 TCP for raw throughput.',
            [
                { title: 'Ping (Quick Check)', text: 'Measures round-trip time, jitter, and packet loss to a target host. Key metrics: <strong>Avg</strong> (baseline latency), <strong>Jitter</strong> (variance — critical for real-time streaming), <strong>Loss</strong> (any loss causes audible dropouts). Target: 1.1.1.1 for WAN, router IP for LAN.' },
                { title: 'Iperf3 UDP (Audio Streaming)', text: 'Simulates a constant-bitrate audio stream. Measures jitter and packet loss at a defined bandwidth. Use packet size 1450 bytes (standard Ethernet MTU minus headers). Run an iperf3 server on another machine: <code>iperf3 -s</code>.' },
                { title: 'Iperf3 TCP (Throughput)', text: 'Measures sustainable TCP bandwidth and retransmits. Useful to confirm the link can carry uncompressed audio (DSD512 ≈ 15 Mbps, PCM 768kHz/32bit ≈ 12 Mbps). High retransmits indicate an unreliable link.' },
                { title: 'History', text: 'The last 10 test results are saved locally (History panel). Compare before/after a network change: cable vs Wi-Fi, different iperf3 server, router QoS configuration.' },
                {
                    title: 'Network Health Scores',
                    text: 'Scoring system:<ul class="info-list">' +
                        '<li class="info-list-item"><span class="health-badge excellent">EXCELLENT</span> Ping: Jitter &lt; 2ms, Loss = 0% | Iperf3: Jitter &lt; 0.1ms, Loss &lt; 0.001%, BW ≥ 15 Mbps</li>' +
                        '<li class="info-list-item"><span class="health-badge good">GOOD</span> Ping: Jitter &lt; 5ms, Loss &lt; 0.5% | Iperf3: Jitter &lt; 0.1ms, Loss &lt; 0.001%, BW ≥ 15 Mbps (one criterion)</li>' +
                        '<li class="info-list-item"><span class="health-badge fair">FAIR</span> Ping: Jitter &lt; 10ms, Loss &lt; 2% | Iperf3: Jitter &lt; 0.5ms, Loss &lt; 0.01%, BW ≥ 10 Mbps</li>' +
                        '<li class="info-list-item"><span class="health-badge critical">CRITICAL</span> Ping: Jitter ≥ 10ms or Loss ≥ 2% | Iperf3: Jitter ≥ 2ms, Loss ≥ 0.1%, or BW &lt; 5 Mbps</li>' +
                        '</ul>'
                }
            ]
        );
        window.UIComponents.InfoModal.show('About Network Stability Test', content);
    }

    async _startTest() {
        let payload;

        if (this.testType === 'ping') {
            if (!this.config.pingTarget || !this.config.pingCount) {
                showToast('error', 'Missing Config', 'Please provide target and count.');
                return;
            }
            payload = {
                test_type: 'ping',
                target: this.config.pingTarget,
                count: this.config.pingCount
            };
        } else {
            if (!this.config.iperf3Server) {
                showToast('error', 'Missing Server', 'Please specify iperf3 server (IP:port)');
                return;
            }
            payload = {
                test_type: this.testType,
                iperf3_config: {
                    server: this.config.iperf3Server,
                    duration: this.config.iperf3Duration,
                    bandwidth: this.config.iperf3Bandwidth || '10M',
                    protocol: this.testType === 'iperf3_udp' ? 'udp' : 'tcp',
                    packet_size: this.config.iperf3PacketSize || 1450,
                    streams: 1
                }
            };
            this._saveHistory(this.config.iperf3Server);
        }

        this.testState = 'running';
        this.statusData = { status: 'starting', progress: 0 };
        this.resultData = null;
        this.healthStatus = null;

        try {
            const result = await apiPost('/performance/network/test/start', payload);
            this.currentTestId = result.test_id;

            const historyTarget = this.testType === 'ping' ? payload.target : payload.iperf3_config.server;
            const testTypeName = this.testType === 'ping' ? 'ping' : `iperf3 ${payload.iperf3_config.protocol.toUpperCase()}`;
            addToHistory('performance', `Started ${testTypeName} test to ${historyTarget}`, true);
        } catch (error) {
            console.error('Failed to start network test:', error);
            handleError(error, 'Failed to start network test');
            this.testState = 'idle';
            this.statusData = null;
        }
    }

    async _cancelTest() {
        if (!this.currentTestId) return;

        try {
            await apiPost(`/performance/network/test/${this.currentTestId}/cancel`);
            this.testState = 'cancelled';
            this.statusData = { status: 'cancelled', progress: 0 };
            this.currentTestId = null;
        } catch (error) {
            handleError(error, 'Failed to cancel network test');
        }
    }

    _handleSSEProgress(data) {
        if (data.test_id === this.currentTestId) {
            this.statusData = data;

            if (data.status === 'completed') {
                this.testState = 'completed';
                if (data.result) {
                    this.resultData = data.result;
                    saveNetworkResult(data.result);
                    this._testHistory = getTestHistory().filter(e => e.type !== 'latency');
                    this._calculateHealth();
                    if (data.result.stats.test_type === 'iperf3_udp') {
                        this.updateComplete.then(() => this._renderJitterChart());
                    }
                }
                const target = data.result?.config?.target || 'unknown';
                addToHistory('performance', `Network test to ${target} completed`, true);
                this.currentTestId = null;
            } else if (data.status === 'failed') {
                this.testState = 'failed';
                addToHistory('performance', `Network test failed: ${data.message}`, false);
                showToast('error', 'Network Test Failed', data.message || 'Unknown error');
                this.currentTestId = null;
            }
        }
    }

    /**
     * Render the collapsible history table for network tests.
     * @returns {import('lit').TemplateResult}
     */
    _renderHistory() {
        if (!this._testHistory?.length) return html``;
        const fmt = (v, dec = 2) => (v !== undefined && v !== null) ? Number(v).toFixed(dec) : '--';
        const fmtDate = ts => {
            try { return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
            catch { return ts; }
        };
        return html`
            <div class="test-history">
                <div class="test-history-header" @click=${() => { this._historyOpen = !this._historyOpen; }}>
                    <span class="test-history-title">
                        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconHistory}</svg>
                        History (${this._testHistory.length})
                    </span>
                    <div style="display:flex;align-items:center;gap:var(--spacing-sm)">
                        ${this._historyOpen ? html`
                            <button class="test-history-clear" title="Clear history"
                                @click=${e => { e.stopPropagation(); clearTestHistory(); this._testHistory = []; }}>
                                Clear
                            </button>
                        ` : ''}
                        <span class="test-history-toggle ${this._historyOpen ? 'open' : ''}">▾</span>
                    </div>
                </div>
                ${this._historyOpen ? html`
                    <div class="test-history-scroll">
                        <table class="test-history-table network-history-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Type</th>
                                    <th>Target/Server</th>
                                    <th>Min ms</th>
                                    <th>Avg ms</th>
                                    <th>Max ms</th>
                                    <th>Jitter</th>
                                    <th>Loss %</th>
                                    <th>BW Mbps</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${this._testHistory.map(e => html`
                                    <tr>
                                        <td>${fmtDate(e.timestamp)}</td>
                                        <td><span class="test-history-badge">${e.type}</span></td>
                                        <td>${e.target ?? e.server ?? '--'}</td>
                                        <td>${fmt(e.min)}</td>
                                        <td>${fmt(e.avg)}</td>
                                        <td>${fmt(e.max)}</td>
                                        <td>${fmt(e.jitter)}</td>
                                        <td>${fmt(e.loss, 1)}</td>
                                        <td>${e.bandwidth !== undefined ? fmt(e.bandwidth, 1) : '--'}</td>
                                    </tr>
                                `)}
                            </tbody>
                        </table>
                    </div>
                ` : ''}
            </div>
        `;
    }

    _calculateHealth() {
        if (!this.resultData || !this.resultData.stats) return;

        const testType = this.resultData.stats.test_type;

        if (testType === 'ping') {
            const jitter = this.resultData.stats.jitter_ms;
            const loss = this.resultData.stats.packet_loss;

            if (loss >= 2 || jitter >= 10) {
                this.healthStatus = { label: 'CRITICAL', class: 'critical' };
            } else if (loss >= 0.5 || jitter >= 5) {
                this.healthStatus = { label: 'FAIR', class: 'fair' };
            } else if (loss > 0 || jitter >= 2) {
                this.healthStatus = { label: 'GOOD', class: 'good' };
            } else {
                this.healthStatus = { label: 'EXCELLENT', class: 'excellent' };
            }
        } else {
            const stats = this.resultData.stats.iperf3_stats;
            const loss = stats.packet_loss_percent;
            const jitter = stats.jitter_ms;
            const bandwidth = stats.bandwidth_mbps;

            if (loss >= 0.1 || jitter >= 2 || bandwidth < 5) {
                this.healthStatus = { label: 'CRITICAL', class: 'critical' };
            } else if (loss >= 0.01 || jitter >= 0.5 || bandwidth < 10) {
                this.healthStatus = { label: 'FAIR', class: 'fair' };
            } else if (jitter >= 0.1 || loss >= 0.001 || bandwidth < 15) {
                this.healthStatus = { label: 'GOOD', class: 'good' };
            } else {
                this.healthStatus = { label: 'EXCELLENT', class: 'excellent' };
            }
        }
    }

    _formatStat(val, decimals = 2) {
        return (val !== undefined && val !== null) ? Number(val).toFixed(decimals) : '--';
    }

    _renderJitterChart() {
        const ctx = this.querySelector('#jitterChart');
        if (!ctx || !this.resultData || !this.resultData.stats.iperf3_stats?.jitter_history) return;

        if (this._jitterChart) {
            this._jitterChart.destroy();
        }

        const history = this.resultData.stats.iperf3_stats.jitter_history;
        const labels = history.map((_, i) => `${i + 1}s`);

        const rootStyle = getComputedStyle(document.body);
        const accentColor = rootStyle.getPropertyValue('--color-accent').trim() || '#3b82f6';
        const textColor = rootStyle.getPropertyValue('--text-primary').trim() || '#ffffff';
        const gridColor = rootStyle.getPropertyValue('--border-color').trim() || 'rgba(255,255,255,0.1)';

        this._jitterChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Jitter (ms)',
                    data: history,
                    borderColor: accentColor,
                    backgroundColor: accentColor + '33',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    title: {
                        display: true,
                        text: 'Jitter Variation Over Time',
                        color: textColor,
                        font: { size: 14, weight: 'bold' }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: gridColor },
                        ticks: { color: rootStyle.getPropertyValue('--text-secondary').trim() || '#888' },
                        title: { display: true, text: 'ms', color: textColor }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: rootStyle.getPropertyValue('--text-secondary').trim() || '#888' }
                    }
                }
            }
        });
    }

    render() {
        return html`
            <div class="performance-section tab-zone" id="networkTestSection">
                <div class="test-header">
                    <div class="test-title-wrapper tab-title-container">
                        <h2>NETWORK STABILITY TEST</h2>
                        <span class="badge info clickable" @click=${this._showInfo}>INFO</span>
                        ${this.healthStatus ? html`
                            <div class="health-badge ${this.healthStatus.class} inline-flex">${this.healthStatus.label}</div>
                        ` : ''}
                    </div>
                    <div class="test-actions">
                        <button class="btn-action compact success" @click=${this._startTest} ?disabled=${this.testState === 'running'}>
                            ${this.testState === 'running' ? 'STARTING...' : 'TEST'}
                        </button>
                        ${this.testState === 'running' ? html`
                            <button class="btn-action compact error" @click=${this._cancelTest}>CANCEL</button>
                        ` : ''}
                    </div>
                </div>

                <!-- Test Type Selector -->
                <div class="test-type-selector">
                    <label class="radio-label">
                        <input type="radio" name="networkTestType" value="ping" .checked=${this.testType === 'ping'} @change=${this._handleConfigChange} ?disabled=${this.testState === 'running'}>
                        <span>PING (Quick Check)</span>
                    </label>
                    <label class="radio-label">
                        <input type="radio" name="networkTestType" value="iperf3_udp" .checked=${this.testType === 'iperf3_udp'} @change=${this._handleConfigChange} ?disabled=${this.testState === 'running'}>
                        <span>IPERF3 UDP (Audio Streaming)</span>
                    </label>
                    <label class="radio-label">
                        <input type="radio" name="networkTestType" value="iperf3_tcp" .checked=${this.testType === 'iperf3_tcp'} @change=${this._handleConfigChange} ?disabled=${this.testState === 'running'}>
                        <span>IPERF3 TCP (Throughput)</span>
                    </label>
                </div>

                <!-- Config Ping -->
                ${this.testType === 'ping' ? html`
                    <div class="test-config">
                        <div class="field-group inline">
                            <label>Target IP/Host:</label>
                            <input type="text" id="cfg_pingTarget" .value=${this.config.pingTarget} @input=${this._handleConfigChange} class="config-input" ?disabled=${this.testState === 'running'}>
                        </div>
                        <div class="field-group inline">
                            <label>Packet Count:</label>
                            <input type="number" id="cfg_pingCount" .value=${this.config.pingCount} min="5" max="100" @input=${this._handleConfigChange} class="config-input compact" ?disabled=${this.testState === 'running'}>
                        </div>
                    </div>
                ` : ''}

                <!-- Config iperf3 -->
                ${this.testType.startsWith('iperf3') ? html`
                    <div class="test-config">
                        <div class="field-group inline">
                            <label>Server (IP:port):</label>
                            <input type="text" id="cfg_iperf3Server" .value=${this.config.iperf3Server} placeholder="192.168.1.100:5201" @input=${this._handleConfigChange} list="serverSuggestions" class="config-input" ?disabled=${this.testState === 'running'}>
                            <datalist id="serverSuggestions">
                                ${[...new Set([...this.serverHistory, ...this.suggestedServers])].map(s => html`<option value="${s}">`)}
                            </datalist>
                        </div>
                        <div class="field-group inline">
                            <label>Duration (s):</label>
                            <input type="number" id="cfg_iperf3Duration" .value=${this.config.iperf3Duration} min="10" max="120" @input=${this._handleConfigChange} class="config-input compact" ?disabled=${this.testState === 'running'}>
                        </div>
                        <div class="field-group inline">
                            <label>Bandwidth:</label>
                            <input type="text" id="cfg_iperf3Bandwidth" .value=${this.config.iperf3Bandwidth} @input=${this._handleConfigChange} class="config-input compact" placeholder="10M" ?disabled=${this.testState === 'running'}>
                        </div>
                        <div class="field-group inline">
                            <label>Packet Size:</label>
                            <input type="number" id="cfg_iperf3PacketSize" .value=${this.config.iperf3PacketSize} min="64" max="1500" @input=${this._handleConfigChange} class="config-input compact" ?disabled=${this.testState === 'running'}>
                        </div>
                        <div class="field-group inline service-control-row">
                            <label>Internal Server Service:</label>
                            <div class="service-status-badge ${this.iperfServiceStatus || 'unknown'}">
                                ${this.iperfServiceStatus?.toUpperCase() || 'UNKNOWN'}
                            </div>
                            <button class="btn-action compact ${this.iperfServiceStatus === 'active' ? 'error' : 'success'}" 
                                @click=${this._toggleIperfService}
                                ?disabled=${this.iperfServiceStatus === 'loading'}>
                                ${this.iperfServiceStatus === 'active' ? 'STOP SERVICE' : 'START SERVICE'}
                            </button>
                        </div>
                    </div>
                ` : ''}

                <!-- Network Test Status -->
                ${this.testState === 'running' || this.testState === 'cancelled' ? html`
                    <div>
                        <div class="test-status">
                            <div class="status-info">
                                <span>Target: <span>${this.testType === 'ping' ? this.config.pingTarget : this.config.iperf3Server}</span></span>
                                <span>Status: <span>${this.statusData?.status || '--'}</span></span>
                            </div>
                            <div class="premium-progress ${this.statusData?.status === 'running' ? 'active' : ''}">
                                <div class="premium-progress-bar">
                                    <div class="premium-progress-fill" style="width: ${this.statusData?.progress || 0}%"></div>
                                </div>
                            </div>
                            <div class="test-metrics grid-fit grid-fit-120 mt-md">
                                <ag-stat-box variant="secondary" custom-class="stagger-item animate-stagger" custom-style="--delay-index: 1"
                                    label="Latency (ms)" value-class="monospace"
                                    .value=${this.statusData?.current_latency ? this._formatStat(this.statusData.current_latency) : '--'}>
                                </ag-stat-box>
                                <ag-stat-box variant="secondary" custom-class="stagger-item animate-stagger" custom-style="--delay-index: 2"
                                    label="Samples" value-class="monospace"
                                    .value=${this.statusData?.samples_done ? (this.statusData.samples_done + '/' + (this.statusData.total_samples || '?')) : '--'}>
                                </ag-stat-box>
                            </div>
                        </div>
                    </div>
                ` : ''}

                ${this._renderHistory()}

                <!-- Network Test Result -->
                ${this.testState === 'completed' && this.resultData ? html`
                    <div>
                        ${this.resultData.stats.test_type === 'ping' ? html`
                            <div class="test-result">
                                <div class="result-stats grid-fit grid-fit-120">
                                    <ag-stat-box variant="tertiary" custom-class="stagger-item animate-stagger" custom-style="--delay-index: 1"
                                        label="Min (ms)" value-class="monospace"
                                        .value=${this._formatStat(this.resultData.stats.min_ms)}>
                                    </ag-stat-box>
                                    <ag-stat-box variant="tertiary" custom-class="stagger-item animate-stagger" custom-style="--delay-index: 2"
                                        label="Avg (ms)" value-class="monospace"
                                        .value=${this._formatStat(this.resultData.stats.avg_ms)}>
                                    </ag-stat-box>
                                    <ag-stat-box variant="tertiary" custom-class="stagger-item animate-stagger" custom-style="--delay-index: 3"
                                        label="Max (ms)" value-class="monospace"
                                        .value=${this._formatStat(this.resultData.stats.max_ms)}>
                                    </ag-stat-box>
                                    <ag-stat-box variant="tertiary" custom-class="stagger-item animate-stagger" custom-style="--delay-index: 4"
                                        label="Jitter (ms)" value-class="monospace"
                                        .value=${this._formatStat(this.resultData.stats.jitter_ms, 3)}>
                                    </ag-stat-box>
                                    <ag-stat-box variant="tertiary" custom-class="stagger-item animate-stagger" custom-style="--delay-index: 5"
                                        label="Loss (%)" value-class="monospace"
                                        .value=${this._formatStat(this.resultData.stats.packet_loss, 1)}>
                                    </ag-stat-box>
                                </div>
                            </div>
                        ` : ''}

                        ${this.resultData.stats.test_type.startsWith('iperf3') ? html`
                            <div class="test-result">
                                <div class="result-stats grid-fit grid-fit-140">
                                    <ag-stat-box variant="tertiary" custom-class="stagger-item animate-stagger" custom-style="--delay-index: 1"
                                        label="Bandwidth (Mbps)" value-class="xlarge monospace"
                                        .value=${this._formatStat(this.resultData.stats.iperf3_stats.bandwidth_mbps)}>
                                    </ag-stat-box>
                                    <ag-stat-box variant="tertiary" custom-class="stagger-item animate-stagger" custom-style="--delay-index: 2"
                                        label="Jitter (ms)" value-class="monospace"
                                        .value=${this._formatStat(this.resultData.stats.iperf3_stats.jitter_ms, 3)}>
                                    </ag-stat-box>
                                    <ag-stat-box variant="tertiary" custom-class="stagger-item animate-stagger" custom-style="--delay-index: 3"
                                        label="Loss (%)" value-class="monospace"
                                        .value=${this._formatStat(this.resultData.stats.iperf3_stats.packet_loss_percent)}>
                                    </ag-stat-box>
                                    <ag-stat-box variant="tertiary" custom-class="stagger-item animate-stagger" custom-style="--delay-index: 4"
                                        label="Packets (rcv/sent)" value-class="small"
                                        .value=${this.resultData.stats.iperf3_stats.packets_received + '/' + this.resultData.stats.iperf3_stats.packets_sent}>
                                    </ag-stat-box>
                                    <ag-stat-box variant="tertiary" custom-class="stagger-item animate-stagger" custom-style="--delay-index: 5"
                                        label="Retransmits" value-class="monospace"
                                        .value=${this.resultData.stats.iperf3_stats.retransmits !== null && this.resultData.stats.iperf3_stats.retransmits !== undefined ? this.resultData.stats.iperf3_stats.retransmits : 'N/A'}>
                                    </ag-stat-box>
                                </div>

                                ${this.resultData.stats.test_type === 'iperf3_udp' && this.resultData.stats.iperf3_stats.jitter_history ? html`
                                    <div class="result-chart-small animate-fade-in mt-md">
                                        <canvas id="jitterChart"></canvas>
                                    </div>
                                ` : ''}
                            </div>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
        `;
    }
}

customElements.define('ag-network-test', AgNetworkTest);
