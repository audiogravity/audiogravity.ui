/**
 * @module AgLatencyTest
 * @description Organism component for configuring, running, and displaying Latency tests (cyclictest).
 * Repackages the old js/performance.js latency logic into a Lit Web Component.
 *
 * @element ag-latency-test
 *
 * @prop {Object} config - Test configuration (threads, priority, loops, etc.)
 * @prop {String} testState - Current test state ('idle', 'running', 'completed', 'failed')
 * @prop {Object} statusData - Real-time test status data
 * @prop {Object} resultData - Test results and statistics
 * @prop {String} currentTestId - Current test identifier
 *
 * @dependency js/api.js - apiGet, apiPost functions for backend communication
 * @dependency css/performance.css - Performance test page styling
 * @dependency css/components/forms.css, css/components/button.css, css/utilities.css - Form fields, buttons, and utilities
 */

import { LitElement, html } from 'lit';
import { apiGet, apiPost, AgTimerManager, EventEmitter, showToast, handleError, addToHistory } from '../../common.js';
import { saveLatencyResult, getTestHistory, clearTestHistory } from '../../test-history.js';
import { iconHistory } from '../../ag-icons.js';

export class AgLatencyTest extends LitElement {
    static properties = {
        config: { type: Object },
        testState: { type: String }, // 'idle', 'running', 'completed', 'failed'
        statusData: { type: Object },
        resultData: { type: Object },
        currentTestId: { type: String },
        expertMode: { type: Boolean },
        _testHistory: { type: Array, state: true },
        _historyOpen: { type: Boolean, state: true }
    };

    constructor() {
        super();
        this.expertMode = false;
        this.config = {
            threads: 1,
            priority: 99,
            loops: 10000,
            interval_us: 100,
            histogram_max_us: 5000,
            cpu_affinity: '0,1,2,3',
            mlockall: true,
            quiet: true
        };
        this.testState = 'idle';
        this.statusData = null;
        this.resultData = null;
        this.currentTestId = null;
        this._chartInstance = null;
        this._pollingInterval = null;
        this._testHistory = getTestHistory().filter(e => e.type === 'latency');
        this._historyOpen = false;

        this._bindSSE = this._handleSSEProgress.bind(this);
        this._bindTheme = this.updateChartTheme.bind(this);
    }

    createRenderRoot() {
        return this; // Light DOM for global CSS
    }

    connectedCallback() {
        super.connectedCallback();
        EventEmitter.on('latency-test-progress', this._bindSSE);
        EventEmitter.on('theme-applied', this._bindTheme);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._stopPolling();
        if (this._chartInstance) {
            this._chartInstance.destroy();
            this._chartInstance = null;
        }
        EventEmitter.off('latency-test-progress', this._bindSSE);
        EventEmitter.off('theme-applied', this._bindTheme);
    }

    _handleConfigChange(e) {
        const { id, type, checked, value } = e.target;
        const key = id.replace('cfg_', '');
        if (type === 'checkbox') {
            this.config = { ...this.config, [key]: checked };
        } else if (type === 'number') {
            this.config = { ...this.config, [key]: parseInt(value) || 0 };
        } else {
            this.config = { ...this.config, [key]: value };
        }
    }

    _showInfo() {
        if (!window.UIComponents || !window.UIComponents.InfoModal) return;

        const content = window.UIComponents.InfoModal.createContent(
            'Runs cyclictest to measure real-time scheduling latency. The maximum latency (µs) is the key indicator: it represents the worst-case delay between a timer event and the thread waking up — directly linked to audio buffer underruns.',
            [
                { title: 'Threads', text: 'Number of concurrent RT threads. Use 1 for a focused single-core measurement, or match your CPU count for a stress scenario.' },
                { title: 'Priority (RT)', text: 'SCHED_FIFO priority of the test threads (1–99). Priority 99 matches the highest audio daemon priority. Using a lower value gives a pessimistic but realistic view.' },
                { title: 'Loops', text: 'Total number of measurement cycles per thread. More loops = more samples = more representative max latency. 100 000 is a quick check; 1 000 000+ for a thorough measurement.' },
                { title: 'Interval', text: 'Wake-up interval in µs. 100 µs is the standard audio reference (corresponds to a 10 kHz timer). Lower values stress the scheduler more aggressively.' },
                { title: 'Memory Lock (mlockall)', text: 'Locks the process memory to prevent page faults during the test. Always enable for a realistic audio workload simulation.' },
                { title: 'Results & History', text: 'Min/Avg/Max latency and percentiles are displayed after the test. The last 10 results are saved locally (History panel) to track improvements after governor or kernel changes.' }
            ]
        );
        window.UIComponents.InfoModal.show('About Latency Test', content);
    }

    async _startTest() {
        const affinityStr = this.config.cpu_affinity || '';
        const cpuAffinity = affinityStr.split(',')
            .map(n => parseInt(n.trim()))
            .filter(n => !isNaN(n));

        const payload = {
            threads: this.config.threads,
            priority: this.config.priority,
            loops: this.config.loops,
            interval_us: this.config.interval_us,
            histogram_max_us: this.config.histogram_max_us,
            cpu_affinity: cpuAffinity.length > 0 ? cpuAffinity : null,
            mlockall: this.config.mlockall,
            quiet: this.config.quiet
        };

        this.testState = 'running';
        this.statusData = { status: 'starting', progress: 0 };
        this.resultData = null;

        try {
            const result = await apiPost('/performance/latency/test/start', payload);
            this.currentTestId = result.test_id;

            addToHistory('performance', `Started latency test (ID: ${result.test_id})`, true);

            this._startPolling();
        } catch (error) {
            handleError(error, 'Failed to start test');
            addToHistory('performance', 'Failed to start latency test', false);
            this.testState = 'idle';
            this.statusData = null;
        }
    }

    _handleExpertMode(e) {
        this.expertMode = e.detail.checked;
        showToast('info', this.expertMode ? 'Expert Mode Enabled' : 'Expert Mode Disabled',
                this.expertMode ? 'Advanced settings shown' : 'Advanced settings hidden');
    }

    async _cancelTest() {
        if (!this.currentTestId) return;

        try {
            await apiPost(`/performance/latency/test/${this.currentTestId}/cancel`);
            this._stopPolling();
            this.testState = 'idle';
            this.statusData = null;
        } catch (error) {
            handleError(error, 'Failed to cancel test');
        }
    }

    _startPolling() {
        // Polling removed in favor of SSE (Phase 3)
    }

    _stopPolling() {
        // Polling removed in favor of SSE (Phase 3)
    }

    _handleSSEProgress(data) {
        if (data.test_id === this.currentTestId) {
            this._updateStatus(data);
            this._stopPolling(); // SSE active, stop manual poll
        }
    }

    async _updateStatus(status) {
        this.statusData = status;

        if (status.status === 'completed' || status.status === 'failed') {
            this._stopPolling();
            this.testState = status.status;

            if (status.status === 'completed') {
                addToHistory('performance', `Latency test ${this.currentTestId} completed`, true);
                await this._loadResult();
            } else {
                addToHistory('performance', `Latency test ${this.currentTestId} failed`, false);
            }
        }
    }

    async _loadResult() {
        if (!this.currentTestId) return;

        try {
            this.resultData = await apiGet(`/performance/latency/test/${this.currentTestId}/result`);
            saveLatencyResult(this.resultData);
            this._testHistory = getTestHistory().filter(e => e.type === 'latency');

            // Wait for DOM to update with result section before rendering chart
            await this.updateComplete;
            this._renderChart();
        } catch (error) {
            console.error('Failed to load test result:', error);
            handleError(error, 'Failed to load test result');
        }
    }

    _renderChart() {
        const ctx = this.querySelector('#latencyChart');
        if (!ctx || !this.resultData || !this.resultData.histogram) return;

        if (this._chartInstance) {
            this._chartInstance.destroy();
        }

        const histogram = this.resultData.histogram;
        let labels, data, latencyValues;

        if (histogram.buckets) {
            const buckets = Object.entries(histogram.buckets)
                .map(([k, v]) => ({ x: parseInt(k), y: v }))
                .sort((a, b) => a.x - b.x);
            labels = buckets.map(b => `${b.x} µs`);
            data = buckets.map(b => b.y);
            latencyValues = buckets.map(b => b.x);
        } else {
            const entries = Object.entries(histogram)
                .map(([k, v]) => ({ x: parseInt(k), y: v }))
                .sort((a, b) => a.x - b.x);
            labels = entries.map(e => `${e.x} µs`);
            data = entries.map(e => e.y);
            latencyValues = entries.map(e => e.x);
        }

        const rootStyle = getComputedStyle(document.body);
        const latencyColors = {
            excellent: rootStyle.getPropertyValue('--histogram-excellent').trim() || '#22c55e',
            good: rootStyle.getPropertyValue('--histogram-good').trim() || '#3b82f6',
            average: rootStyle.getPropertyValue('--histogram-average').trim() || '#f59e0b',
            critical: rootStyle.getPropertyValue('--histogram-critical').trim() || '#ef4444',
        };

        const getLatencyColor = (latencyUs) => {
            if (latencyUs < 50) return { bg: latencyColors.excellent + 'b3', border: latencyColors.excellent };
            if (latencyUs < 200) return { bg: latencyColors.good + 'b3', border: latencyColors.good };
            if (latencyUs < 500) return { bg: latencyColors.average + 'b3', border: latencyColors.average };
            return { bg: latencyColors.critical + 'b3', border: latencyColors.critical };
        };

        const backgroundColors = latencyValues.map(val => getLatencyColor(val).bg);
        const borderColors = latencyValues.map(val => getLatencyColor(val).border);

        this._chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Sample Count',
                    data: data,
                    backgroundColor: backgroundColors,
                    borderColor: borderColors,
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        labels: {
                            color: getComputedStyle(document.body).getPropertyValue('--text-primary').trim(),
                            generateLabels: () => {
                                const textColor = getComputedStyle(document.body).getPropertyValue('--text-primary').trim();
                                return [
                                    { text: 'Excellent (< 50 µs)', fillStyle: latencyColors.excellent + 'b3', strokeStyle: latencyColors.excellent, lineWidth: 1, fontColor: textColor },
                                    { text: 'Good (50-200 µs)', fillStyle: latencyColors.good + 'b3', strokeStyle: latencyColors.good, lineWidth: 1, fontColor: textColor },
                                    { text: 'Average (200-500 µs)', fillStyle: latencyColors.average + 'b3', strokeStyle: latencyColors.average, lineWidth: 1, fontColor: textColor },
                                    { text: 'Critical (≥ 500 µs)', fillStyle: latencyColors.critical + 'b3', strokeStyle: latencyColors.critical, lineWidth: 1, fontColor: textColor }
                                ];
                            }
                        }
                    },
                    title: {
                        display: true,
                        text: 'Latency Histogram',
                        color: getComputedStyle(document.body).getPropertyValue('--text-primary')
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Count', color: getComputedStyle(document.body).getPropertyValue('--text-secondary') },
                        ticks: { color: getComputedStyle(document.body).getPropertyValue('--text-secondary') },
                        grid: { color: getComputedStyle(document.body).getPropertyValue('--border-color') }
                    },
                    x: {
                        title: { display: true, text: 'Latency (µs)', color: getComputedStyle(document.body).getPropertyValue('--text-secondary') },
                        ticks: { color: getComputedStyle(document.body).getPropertyValue('--text-secondary') },
                        grid: { color: getComputedStyle(document.body).getPropertyValue('--border-color') }
                    }
                }
            }
        });

        // Apply correct theme colors immediately after creation (handles dark mode being active at creation time)
        this.updateChartTheme();
    }

    _formatStat(val) {
        return (val !== undefined && val !== null) ? Number(val).toFixed(2) : '--';
    }

    /**
     * Render the collapsible history table for latency tests.
     * @returns {import('lit').TemplateResult}
     */
    _renderHistory() {
        if (!this._testHistory?.length) return html``;
        const fmt = v => (v !== undefined && v !== null) ? Number(v).toFixed(2) : '--';
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
                        <table class="test-history-table latency-history-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Min µs</th>
                                    <th>Avg µs</th>
                                    <th>Max µs</th>
                                    <th>Std µs</th>
                                    <th>Thr/Pri</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${this._testHistory.map(e => html`
                                    <tr>
                                        <td>${fmtDate(e.timestamp)}</td>
                                        <td>${fmt(e.min)}</td>
                                        <td>${fmt(e.avg)}</td>
                                        <td>${fmt(e.max)}</td>
                                        <td>${fmt(e.stddev)}</td>
                                        <td>${e.threads ?? '--'}/${e.priority ?? '--'}</td>
                                    </tr>
                                `)}
                            </tbody>
                        </table>
                    </div>
                ` : ''}
            </div>
        `;
    }

    updateChartTheme() {
        if (!this._chartInstance) return;

        const textPrimary = getComputedStyle(document.body).getPropertyValue('--text-primary').trim();
        const textSecondary = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim();
        const borderColor = getComputedStyle(document.body).getPropertyValue('--border-color').trim();

        // ✅ Set Chart.js global default color - this is what actually controls legend label text
        // legend.labels.color alone is not always sufficient in Chart.js v4
        if (window.Chart && window.Chart.defaults) {
            window.Chart.defaults.color = textPrimary;
        }

        if (this._chartInstance.options.plugins.title) {
            this._chartInstance.options.plugins.title.color = textPrimary;
        }

        if (this._chartInstance.options.plugins.legend) {
            this._chartInstance.options.plugins.legend.labels.color = textPrimary;
        }

        if (this._chartInstance.options.scales.y) {
            this._chartInstance.options.scales.y.title.color = textSecondary;
            this._chartInstance.options.scales.y.ticks.color = textSecondary;
            this._chartInstance.options.scales.y.grid.color = borderColor;
        }

        if (this._chartInstance.options.scales.x) {
            this._chartInstance.options.scales.x.title.color = textSecondary;
            this._chartInstance.options.scales.x.ticks.color = textSecondary;
            this._chartInstance.options.scales.x.grid.color = borderColor;
        }

        this._chartInstance.update();
    }

    render() {
        return html`
            <!-- Latency Test Configuration -->
            <div class="performance-section tab-zone">
                <div class="test-header">
                    <div class="tab-title-container">
                        <h2>LATENCE TEST</h2>
                        <span class="badge info clickable" id="latencyInfoBtn" @click=${this._showInfo}>INFO</span>
                    </div>
                    <div class="test-actions">
                        <button class="btn-action compact success" @click=${this._startTest} ?disabled=${this.testState === 'running'}>
                            ${this.testState === 'running' ? 'STARTING...' : 'TEST'}
                        </button>
                        ${this.testState === 'running' ? html`
                            <button class="btn-action compact error" @click=${this._cancelTest}>CANCEL</button>
                        ` : ''}
                        <div style="display: flex; align-items: center; gap: var(--spacing-sm);">
                            <label class="form-label compact" style="margin-bottom: 0; font-size: 10px; letter-spacing: 0.05rem;">EXPERT</label>
                            <ag-switch .checked=${this.expertMode} @ag-change=${this._handleExpertMode}></ag-switch>
                        </div>
                    </div>
                </div>
                <div class="latency-config">
                    <div class="config-row">
                        <div class="config-field">
                            <label>Threads</label>
                            <input type="number" id="cfg_threads" .value=${this.config.threads} min="1" max="32" @input=${this._handleConfigChange} ?disabled=${this.testState === 'running'}>
                        </div>
                        <div class="config-field">
                            <label>Priority (RT)</label>
                            <input type="number" id="cfg_priority" .value=${this.config.priority} min="0" max="99" @input=${this._handleConfigChange} ?disabled=${this.testState === 'running'}>
                        </div>
                        <div class="config-field">
                            <label>Loops</label>
                            <input type="number" id="cfg_loops" .value=${this.config.loops} min="100" @input=${this._handleConfigChange} ?disabled=${this.testState === 'running'}>
                        </div>
                        
                        ${this.expertMode ? html`
                            <div class="config-field animate-fade-in">
                                <label>Interval (µs)</label>
                                <input type="number" id="cfg_interval_us" .value=${this.config.interval_us} min="10" @input=${this._handleConfigChange} ?disabled=${this.testState === 'running'}>
                            </div>
                            <div class="config-field animate-fade-in">
                                <label>Histogram Max (µs)</label>
                                <input type="number" id="cfg_histogram_max_us" .value=${this.config.histogram_max_us} min="100" @input=${this._handleConfigChange} ?disabled=${this.testState === 'running'}>
                            </div>
                            <div class="config-field animate-fade-in">
                                <label>CPU Affinity</label>
                                <input type="text" id="cfg_cpu_affinity" .value=${this.config.cpu_affinity} placeholder="0,1,2,3" @input=${this._handleConfigChange} ?disabled=${this.testState === 'running'}>
                            </div>
                        ` : ''}
                    </div>
                    
                    ${this.expertMode ? html`
                        <div class="config-row animate-fade-in">
                            <div class="config-field checkbox">
                                <label>
                                    <input type="checkbox" id="cfg_mlockall" .checked=${this.config.mlockall} @change=${this._handleConfigChange} ?disabled=${this.testState === 'running'}>
                                    Memory Lock
                                </label>
                            </div>
                            <div class="config-field checkbox">
                                <label>
                                    <input type="checkbox" id="cfg_quiet" .checked=${this.config.quiet} @change=${this._handleConfigChange} ?disabled=${this.testState === 'running'}>
                                    Quiet Mode
                                </label>
                            </div>
                        </div>
                    ` : ''}
                </div>
                ${this._renderHistory()}
            </div>

            <!-- Test Status -->
            ${this.testState === 'running' ? html`
                <div class="performance-section tab-zone">
                    <h2>Test Status</h2>
                    <div class="test-status">
                        <div class="status-info">
                            <span>Test ID: <span>${this.currentTestId || '--'}</span></span>
                            <span>Status: <span>${this.statusData?.status || '--'}</span></span>
                        </div>
                        <div class="premium-progress active">
                            <div class="premium-progress-bar">
                                <div class="premium-progress-fill" style="width: ${this.statusData?.progress || 0}%"></div>
                            </div>
                        </div>
                        <div class="test-metrics grid-fit grid-fit-120">
                            <ag-stat-box variant="secondary" custom-class="stagger-item animate-stagger" custom-style="--delay-index: 1"
                                label="Min" value-class="monospace"
                                .value=${this.statusData?.current_stats ? this._formatStat(this.statusData.current_stats.min_us) : '--'}>
                            </ag-stat-box>
                            <ag-stat-box variant="secondary" custom-class="stagger-item animate-stagger" custom-style="--delay-index: 2"
                                label="Avg" value-class="monospace"
                                .value=${this.statusData?.current_stats ? this._formatStat(this.statusData.current_stats.avg_us) : '--'}>
                            </ag-stat-box>
                            <ag-stat-box variant="secondary" custom-class="stagger-item animate-stagger" custom-style="--delay-index: 3"
                                label="Max" value-class="monospace"
                                .value=${this.statusData?.current_stats ? this._formatStat(this.statusData.current_stats.max_us) : '--'}>
                            </ag-stat-box>
                            <ag-stat-box variant="secondary" custom-class="stagger-item animate-stagger" custom-style="--delay-index: 4"
                                label="Samples"
                                .value=${this.statusData?.current_stats ? this.statusData.current_stats.samples : '--'}>
                            </ag-stat-box>
                        </div>
                    </div>
                </div>
            ` : ''}

            <!-- Test Result -->
            ${this.testState === 'completed' && this.resultData ? html`
                <div class="performance-section tab-zone">
                    <h2>Latency Test Result</h2>
                    <div class="test-result">
                        <div class="result-stats grid-fit grid-fit-150 mb-md">
                            <ag-stat-box variant="tertiary" custom-class="stagger-item animate-stagger" custom-style="--delay-index: 1"
                                label="Min Latency (µs)" value-class="xlarge monospace"
                                .value=${this._formatStat(this.resultData.stats.min_us)}>
                            </ag-stat-box>
                            <ag-stat-box variant="tertiary" custom-class="stagger-item animate-stagger" custom-style="--delay-index: 2"
                                label="Avg Latency (µs)" value-class="xlarge monospace"
                                .value=${this._formatStat(this.resultData.stats.avg_us)}>
                            </ag-stat-box>
                            <ag-stat-box variant="tertiary" custom-class="stagger-item animate-stagger" custom-style="--delay-index: 3"
                                label="Max Latency (µs)" value-class="xlarge monospace"
                                .value=${this._formatStat(this.resultData.stats.max_us)}>
                            </ag-stat-box>
                            <ag-stat-box variant="tertiary" custom-class="stagger-item animate-stagger" custom-style="--delay-index: 4"
                                label="Std Dev (µs)" value-class="xlarge monospace"
                                .value=${this._formatStat(this.resultData.stats.stddev_us !== undefined ? this.resultData.stats.stddev_us : this.resultData.stats.std_dev_us)}>
                            </ag-stat-box>
                        </div>
                        
                        <div class="result-percentiles grid-fit grid-fit-120 mb-lg">
                            ${Object.entries(this.resultData.percentiles || {}).map(([key, val], index) => {
            const labels = { p50: '50% (P50)', p90: '90% (P90)', p95: '95% (P95)', p99: '99% (P99)', p999: '99.9% (P999)', p9999: '99.99% (P9999)' };
            if (!labels[key]) return '';
            return html`
                                    <ag-stat-box variant="secondary" custom-class="stagger-item animate-stagger" custom-style="--delay-index: ${index + 5}"
                                        label="${labels[key]}" value-class="monospace"
                                        .value="${this._formatStat(val)} µs">
                                    </ag-stat-box>
                                `;
        })}
                        </div>
                        
                        <div class="result-chart animate-fade-in">
                            <canvas id="latencyChart"></canvas>
                        </div>
                    </div>
                </div>
            ` : ''}
        `;
    }
}

customElements.define('ag-latency-test', AgLatencyTest);
