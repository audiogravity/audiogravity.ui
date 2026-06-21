/**
 * @module AgPerformancePage
 * @description Page component for the Performance tuning tab. Orchestrates CPU governors, Latency and Network tests.
 * 
 * @element ag-performance-page
 * 
 * @property {Array} cpuData - List of CPU core data/governors
 * @property {boolean} loading - Data loading state
 * 
 * @dependency ag-latency-test
 * @dependency ag-network-test
 * @dependency ag-governor-card
 */
import { LitElement, html } from 'lit';
import {
    apiGet,
    apiPost,
    showToast,
    showConfirm,
    AppState,
    addToHistory,
    handleError,
    getUserFriendlyError,
    EventEmitter
} from '../../common.js';
import { isGuest } from '../../auth.js';
import { FetchController } from '../../core/FetchController.js';
import { ContextConsumer } from 'https://cdn.jsdelivr.net/npm/@lit/context@1.1.0/+esm';
import { appContext } from '../../core/app-context.js';
import { logger } from '../../utils.js';
import '../../components/molecules/ag-rt-monitor.js';

/**
 * AgPerformancePage
 * Orchestrates the Performance tab: CPU Governors, Latency Test, and Network Test.
 */
export class AgPerformancePage extends LitElement {
    static properties = {
        cpuInfo: { type: Array },
        cpuGeneralInfo: { type: Object }
    };

    constructor() {
        super();
        this.cpuInfo = [];
        this.cpuGeneralInfo = null;
        this._loaded = false;
        this._cpuMetricsMap = new Map(); // Store real-time metrics and history

        this._onSysinfoUpdate = this._handleSysinfoUpdate.bind(this);

        this.dataFetch = new FetchController(this, {
            autoFetch: false,
            fetchFn: async () => {
                const [cpuGen, cpuDetailed] = await Promise.all([
                    apiGet('/sysinfo/cpu').catch(e => { logger.warn(e); return null; }),
                    apiGet('/performance/cpu/info')
                ]);

                const formattedCpuInfo = cpuDetailed.map(cpu => {
                    const cpusWithSameCore = cpuDetailed.filter(
                        c => c.physical_id === cpu.physical_id && c.core_id === cpu.core_id
                    );
                    const threadIndex = cpusWithSameCore.findIndex(c => c.cpu_id === cpu.cpu_id);
                    cpu.threadLabel = threadIndex > 0 ? `, Thread: ${threadIndex}` : '';

                    // Add grouping info for sibling identification
                    cpu.isSibling = cpusWithSameCore.length > 1;
                    // Use physical_id and core_id to create a unique enough stable index
                    cpu.coreGroupIndex = (cpu.physical_id * 100) + cpu.core_id;
                    
                    return cpu;
                });

                return { cpuGeneralInfo: cpuGen, cpuInfo: formattedCpuInfo };
            },
            onSuccess: (data) => {
                this.cpuGeneralInfo = data.cpuGeneralInfo;
                this.cpuInfo = data.cpuInfo;
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
        return this; // Light DOM
    }

    async connectedCallback() {
        super.connectedCallback();
        EventEmitter.on('sysinfo-update', this._onSysinfoUpdate);

        if (AppState.currentTab === 'performance' || window.location.hash === '#performance') {
            await this.updateComplete;
            this._loadData();
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        EventEmitter.off('sysinfo-update', this._onSysinfoUpdate);
    }

    _handleTabChanged(data) {
        if (data.active === 'performance' && !this._loaded) {
            this._loadData();
        }
    }

    _handleSysinfoUpdate(data) {
        if (!data || !data.cpu_per_core) return;
        
        // Skip updates if animations are globally disabled
        if (document.body.classList.contains('no-animations')) {
            // We still update the raw values but maybe not as frequently? 
            // Actually, for sparkline it matters less, but let's keep it simple.
        }

        data.cpu_per_core.forEach((usage, index) => {
            // Mapping by index should be robust as psutil returns logical core order
            let metrics = this._cpuMetricsMap.get(index);
            if (!metrics) {
                metrics = { usage: 0, temp: null, history: [] };
                this._cpuMetricsMap.set(index, metrics);
            }
            
            metrics.usage = usage;
            const newHistory = [...metrics.history, usage];
            if (newHistory.length > 30) newHistory.shift();
            metrics.history = newHistory;

            // Intelligent Temperature Mapping:
            // Find the CPU object for this index to get its core_id
            const cpu = this.cpuInfo.find(c => c.cpu_id === index);
            if (cpu && data.cpu_core_temps) {
                // Try to find a sensor named "Core X" where X is core_id
                const coreTemp = data.cpu_core_temps[`Core ${cpu.core_id}`] 
                               || data.cpu_core_temps[`Package id 0`] // Fallback to package
                               || Object.values(data.cpu_core_temps)[0]; // Fallback to first available sensor
                
                if (coreTemp !== undefined) {
                    metrics.temp = coreTemp;
                }
            }
        });
        
        // Optimization: only update if on performance tab
        if (AppState.currentTab === 'performance') {
            this.requestUpdate();
        }
    }

    _loadData() {
        this._loaded = true;
        return this.dataFetch.fetch();
    }

    async _handleGovernorChange(e) {
        const { cpuId, governor } = e.detail;
        try {
            await apiPost('/performance/cpu/governor/set', {
                governor: governor,
                cpu_id: cpuId
            });
            if (showToast) showToast('success', 'Governor Updated', `Set ${governor} on CPU ${cpuId}`);
            if (addToHistory) addToHistory('performance', `Set governor ${governor} on CPU ${cpuId}`, true);

            // Optional: refresh data to ensure sync
            // this._loadData(); 
        } catch (error) {
            console.error(`Failed to set governor for CPU ${cpuId}:`, error);
            handleError(error, 'Failed to set governor');
            this._loadData(); // Reset state on failure
        }
    }

    async _applyAllGovernors() {
        // Find common governor or ask. The API field is `current_governor`
        // (see ag-governor-card.js); using `.governor` yielded undefined, which
        // surfaced as 'Set "undefined"...' and a backend "governor: Field required".
        let governor = 'performance';
        if (this.cpuInfo.length > 0 && this.cpuInfo[0].current_governor) {
            governor = this.cpuInfo[0].current_governor;
        }

        const confirmed = await showConfirm(
            'Apply Governor to All CPUs',
            `Set "${governor}" governor on all CPUs?`
        );
        if (!confirmed) return;

        try {
            await apiPost('/performance/cpu/governor/set', {
                governor: governor,
                scope: 'all'
            });

            if (showToast) showToast('success', 'Governor Applied', `Set "${governor}" on all CPUs`);
            if (addToHistory) addToHistory('performance', `Applied governor ${governor} to all CPUs`, true);
            await this._loadData();
        } catch (error) {
            handleError(error, 'Failed to apply governor');
        }
    }

    async _saveGovernorConfig() {
        try {
            await apiPost('/performance/cpu/governor/save');
            if (showToast) showToast('success', 'Configuration Saved', 'Governor settings saved to disk');
            if (addToHistory) addToHistory('performance', 'Saved CPU governor configuration to disk', true);
        } catch (error) {
            handleError(error, 'Failed to save configuration');
        }
    }

    async _createGovernorService() {
        const confirmed = await showConfirm(
            'Create Systemd Service',
            'Create systemd service to apply CPU governors at boot?'
        );
        if (!confirmed) return;

        try {
            await apiPost('/performance/cpu/governor/systemd/create');
            if (showToast) showToast('success', 'Service Created', 'Systemd service created and enabled');
            if (addToHistory) addToHistory('performance', 'Created and enabled governor systemd service', true);
        } catch (error) {
            handleError(error, 'Failed to create service');
        }
    }

    _showInfo() {
        if (!window.UIComponents || !window.UIComponents.InfoModal) return;

        const content = window.UIComponents.InfoModal.createContent(
            'The Performance tab lets you tune CPU scheduling and monitor real-time audio process health for bit-perfect, glitch-free playback.',
            [
                { title: 'CPU Governor', text: 'Controls how the kernel scales CPU frequency. <strong>performance</strong> holds maximum frequency at all times (lowest latency, highest power). <strong>schedutil</strong> adapts to load (good compromise). <strong>powersave</strong> reduces frequency aggressively (not recommended for audio).' },
                { title: 'THROTTLED Badge', text: 'Appears on a CPU core tile when the kernel detects a thermal throttling event (core_throttle_count increased since last refresh). Indicates the CPU was forced to reduce frequency due to heat. Sustained throttling during playback causes audio glitches.' },
                { title: 'Apply All / Save Conf', text: '<strong>Apply All</strong> sets the selected governor on all cores immediately. <strong>Save Conf</strong> persists the current governor map to /etc/cpu-governor.conf. <strong>Create Service</strong> installs a systemd unit that restores governors at boot.' },
                { title: 'Latency Test', text: 'Runs cyclictest to measure real-time scheduling latency (µs). Lower max latency = fewer audio dropouts. Priority 99 + mlockall = standard audio configuration. Results are saved to history (last 10 runs).' },
                { title: 'Network Test', text: 'Measures ping jitter/loss or iperf3 UDP/TCP throughput. Essential for Roon ARC, AirPlay (shairport-sync), or NAS-based playback. Results saved to history.' },
                { title: 'RT Process Monitor', text: 'Shows the real-time scheduling policy of audio processes (mpd, shairport-sync, RoonBridge, RAATServer). <strong>SCHED_FIFO / SCHED_RR</strong> = real-time, green badge. <strong>NON-RT</strong> = SCHED_OTHER, red badge — risk of glitches under load. Configure via systemd unit CPUSchedulingPolicy=fifo.' }
            ]
        );

        window.UIComponents.InfoModal.show('About Performance Optimization', content);
    }

    render() {
        return html`
            <div class="performance-zone">
                <!-- CPU Governor Section -->
                <div class="performance-section tab-zone">
                    <div class="tab-title-container">
                        <h2>PERFORMANCE</h2>
                        <span class="badge info clickable" @click=${this._showInfo}>INFO</span>
                    </div>
                    
                    ${this.cpuGeneralInfo ? html`
                        <div class="cpu-general-info grid-fit" style="--grid-min-width: 200px;">
                            <ag-stat-box variant="tertiary" label="CPU Model" value-class="cpu-stat-value" .value=${this.cpuGeneralInfo.model}></ag-stat-box>
                            <ag-stat-box variant="tertiary" label="Architecture" value-class="cpu-stat-value" .value=${this.cpuGeneralInfo.architecture}></ag-stat-box>
                            <ag-stat-box variant="tertiary" label="Core Topology" value-class="cpu-stat-value" .value="${this.cpuGeneralInfo.physical_cores}P / ${this.cpuGeneralInfo.logical_cores}L Cores"></ag-stat-box>
                            <ag-stat-box variant="tertiary" label="Current Freq" value-class="cpu-stat-value" .value=${this.cpuGeneralInfo.current_freq.toFixed(0)} unit="MHz"></ag-stat-box>
                            <ag-stat-box variant="tertiary" label="Freq Range" value-class="cpu-stat-value" .value="${this.cpuGeneralInfo.min_freq} - ${this.cpuGeneralInfo.max_freq}" unit="MHz"></ag-stat-box>
                        </div>
                    ` : ''}

                    <ag-card-grid 
                        id="governorGrid" 
                        class="governor-grid" 
                        grid-class="governor-grid"
                        skeleton-class="governor-tile" 
                        empty-message="No CPU information available"
                        .items=${this.cpuInfo}
                        ?loading=${this.dataFetch.loading}
                        error=${this.dataFetch.error || ''}
                        .renderItem=${(cpu, index) => {
                            const metrics = this._cpuMetricsMap.get(cpu.cpu_id) || { usage: 0, temp: null, history: [] };
                            return html`
                                <ag-governor-card
                                    .cpu=${cpu}
                                    .delayIndex=${index}
                                    .usage=${metrics.usage}
                                    .temp=${metrics.temp}
                                    .usageHistory=${metrics.history}>
                                </ag-governor-card>
                            `;
                        }}
                        @governor-change=${this._handleGovernorChange}>
                    </ag-card-grid>

                    ${!isGuest() ? html`
                        <div class="config-actions" style="justify-content: flex-start; margin-top: var(--spacing-md); gap: var(--spacing-sm);">
                            <ag-button type="secondary" compact icon="icon-spinner11" label="Refresh" @click=${this._loadData}></ag-button>
                            <ag-button type="secondary" compact icon="icon-stack" label="Apply All" @click=${this._applyAllGovernors}></ag-button>
                            <ag-button type="secondary" compact icon="icon-floppy-disk" label="Save Conf" @click=${this._saveGovernorConfig}></ag-button>
                            <ag-button type="secondary" compact icon="icon-cog" label="Create Service" @click=${this._createGovernorService}></ag-button>
                        </div>
                    ` : ''}
                </div>

                ${!isGuest() ? html`
                <!-- Latency Test Component -->
                <ag-latency-test id="agLatencyTest"></ag-latency-test>

                <!-- Network Stability Test -->
                <ag-network-test id="agNetworkTest"></ag-network-test>
                ` : ''}

                <!-- RT Process Monitor -->
                <ag-rt-monitor></ag-rt-monitor>
            </div>
        `;
    }
}

customElements.define('ag-performance-page', AgPerformancePage);
