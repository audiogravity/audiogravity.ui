/**
 * @module AgPerfMonitor
 * @description Real-time frontend performance monitoring dashboard.
 * Visualizes SSE traffic, active timers, and power optimization status.
 * 
 * @element ag-perf-monitor
 */
import { LitElement, html } from 'lit';
import { AgTimerManager, sseStats } from '../../common.js';
import { logger } from '../../utils.js';
import { iconZap } from '../../ag-icons.js';
import '../atoms/ag-button.js';
import '../atoms/ag-stat-box.js';

export class AgPerfMonitor extends LitElement {
    static properties = {
        timers: { type: Array },
        sse: { type: Object },
        lowPower: { type: Boolean },
        memory: { type: Object },
        expanded: { type: Boolean },
        batteryLevel: { type: Number },
        isCharging: { type: Boolean }
    };

    createRenderRoot() {
        return this; // Use Light DOM for external CSS & Icons
    }

    constructor() {
        super();
        this.timers = [];
        this.sse = sseStats;
        this.lowPower = AgTimerManager._lowPowerMode;
        this.memory = null;
        this.expanded = false;
        this.batteryLevel = null; // null = not available
        this.isCharging = false;
        this._updateTimer = null;
        this._batterySupported = false;
    }

    connectedCallback() {
        super.connectedCallback();

        // Initialize battery monitoring once
        this._initBatteryMonitoring();

        // Start live updates (every 1s) — only re-render if data actually changed
        this._lastTotal = 0;
        this._lastEps = 0;
        this._lastTimerCount = 0;
        this._lastLowPower = false;

        this._updateTimer = AgTimerManager.setInterval('perf-monitor-ui', () => {
            const newLowPower = !!AgTimerManager._lowPowerMode;
            const newTotal = sseStats.totalEvents;
            const newEps = sseStats.eventsInLastSecond;
            const newTimerCount = AgTimerManager.listActiveTimers().length;

            let changed = newLowPower !== this._lastLowPower ||
                          newTotal !== this._lastTotal ||
                          newEps !== this._lastEps ||
                          newTimerCount !== this._lastTimerCount;

            if (window.performance && window.performance.memory) {
                const newUsed = Math.round(window.performance.memory.usedJSHeapSize / 1024 / 1024);
                if (!this.memory || newUsed !== this.memory.used) {
                    this.memory = {
                        used: newUsed,
                        total: Math.round(window.performance.memory.totalJSHeapSize / 1024 / 1024),
                        limit: Math.round(window.performance.memory.jsHeapLimit / 1024 / 1024)
                    };
                    changed = true;
                }
            }

            if (changed) {
                this.timers = AgTimerManager.listActiveTimers();
                this.sse = { ...sseStats };
                this.lowPower = newLowPower;
                this._lastLowPower = newLowPower;
                this._lastTotal = newTotal;
                this._lastEps = newEps;
                this._lastTimerCount = newTimerCount;
            }
        }, 1000, false); // Don't pause on hidden if we want to trace background activity
    }

    async _initBatteryMonitoring() {
        // Check if Battery API is supported
        if (!navigator || !navigator.getBattery) {
            logger.warn('[AgPerfMonitor] Battery Status API not supported in this browser');
            this._batterySupported = false;
            return;
        }

        try {
            const battery = await navigator.getBattery();
            this._batterySupported = true;
            this._battery = battery;

            this._updateBatteryStatus(battery);

            this._onBatteryLevel = () => this._updateBatteryStatus(battery);
            this._onBatteryCharging = () => this._updateBatteryStatus(battery);
            battery.addEventListener('levelchange', this._onBatteryLevel);
            battery.addEventListener('chargingchange', this._onBatteryCharging);

            logger.log('[AgPerfMonitor] Battery monitoring initialized');
        } catch (error) {
            logger.warn('[AgPerfMonitor] Failed to access Battery API:', error);
            this._batterySupported = false;
        }
    }

    _updateBatteryStatus(battery) {
        this.batteryLevel = Math.round(battery.level * 100);
        this.isCharging = battery.charging;

        // Auto-enable Low Power Mode when battery is low (≤20%) and not charging
        if (this.batteryLevel <= 20 && !this.isCharging && !AgTimerManager._manualOverride) {
            if (!AgTimerManager._lowPowerMode) {
                logger.log(`[AgPerfMonitor] Auto-enabling Low Power Mode (battery: ${this.batteryLevel}%)`);
                AgTimerManager.setLowPowerMode(true, false); // false = not manual
            }
        } else if (this.batteryLevel > 25 && !AgTimerManager._manualOverride) {
            // Auto-disable when battery recovers above 25%
            if (AgTimerManager._lowPowerMode) {
                logger.log(`[AgPerfMonitor] Auto-disabling Low Power Mode (battery: ${this.batteryLevel}%)`);
                AgTimerManager.setLowPowerMode(false, false);
            }
        }

        this.requestUpdate();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        AgTimerManager.clearInterval('perf-monitor-ui');
        if (this._battery) {
            this._battery.removeEventListener('levelchange', this._onBatteryLevel);
            this._battery.removeEventListener('chargingchange', this._onBatteryCharging);
            this._battery = null;
        }
    }

    render() {
        const activeTimerCount = this.timers.filter(t => t.running).length;
        const uptime = Math.round((Date.now() - this.sse.startTime) / 1000);

        return html`
            <div class="perf-container">
                <div class="perf-header">
                    <div class="tab-title-container">
                        <span class="perf-title">FRONTEND PERFORMANCE Cockpit</span>
                        <span class="badge info clickable" @click=${this._showInfo}
                            style="margin-right: var(--spacing-sm);">INFO</span>
                        <div class="badge pill subtle ${this.lowPower ? 'warning' : 'success'} clickable"
                             @click=${this._toggleLowPower}
                             title="${this.lowPower ? 'Click to disable manual override' : 'Click to force Low Power Mode'}">
                              <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconZap}</svg>
                              LOW POWER ${this.lowPower ? (AgTimerManager._manualOverride ? 'MANUAL (x3)' : 'ACTIVE (x3)') : 'OFF'}
                        </div>
                    </div>
                    <ag-button
                        type="secondary"
                        compact
                        icon=${this.expanded ? 'icon-eye-blocked' : 'icon-eye'}
                        label=${this.expanded ? 'Hide Details' : 'Show Timers'}
                        @click=${() => this.expanded = !this.expanded}>
                    </ag-button>
                </div>

                <div class="perf-grid">
                    <ag-stat-box
                        label="SSE Events / Sec"
                        .value=${this.sse.eventsInLastSecond}
                        state=${this.sse.eventsInLastSecond > 5 ? 'warning' : 'active'}>
                    </ag-stat-box>
                    <ag-stat-box
                        label="Total SSE Events"
                        .value=${this.sse.totalEvents}>
                    </ag-stat-box>
                    <ag-stat-box
                        label="Active Timers"
                        .value="${activeTimerCount} / ${this.timers.length}"
                        state="active">
                    </ag-stat-box>
                    ${this.memory ? html`
                        <ag-stat-box
                            label="Memory Usage"
                            .value=${this.memory.used}
                            unit="MB">
                        </ag-stat-box>
                    ` : ''}
                    <ag-stat-box
                        label="Uptime (Web)"
                        .value=${uptime}
                        unit="s">
                    </ag-stat-box>
                    <ag-stat-box
                        label="Device Battery"
                        .value=${this.batteryLevel !== null ? `${this.batteryLevel}% ${this.isCharging ? '⚡' : '🔋'}` : 'N/A'}
                        state=${this.batteryLevel !== null && this.batteryLevel <= 20 && !this.isCharging ? 'error' : ''}>
                    </ag-stat-box>
                </div>

                ${this.expanded ? this._renderDetails() : ''}
            </div>
        `;
    }

    _renderDetails() {
        return html`
            <div class="timer-list">
                <div class="details-section-title">
                    ACTIVE TIMERS REGISTRY
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Identifier</th>
                            <th>Base</th>
                            <th>Effective</th>
                            <th>Ticks</th>
                            <th>PauseHidden</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.timers.map(t => html`
                            <tr>
                                <td class="td-id">${t.id}</td>
                                <td>${t.interval}ms</td>
                                <td class="${t.effectiveInterval > t.interval ? 'td-warning' : ''}">${t.effectiveInterval}ms</td>
                                <td>${t.ticks}</td>
                                <td>${t.pauseOnHidden ? '✅' : '❌'}</td>
                            </tr>
                        `)}
                    </tbody>
                </table>

                <div class="details-section-title">
                    EVENT DISTRIBUTION (By Type)
                </div>
                <div>
                    ${Object.entries(this.sse.eventsByType).map(([type, count]) => html`
                        <span class="type-pill">${type}: ${count}</span>
                    `)}
                </div>
            </div>
        `;
    }
    _showInfo() {
        if (!window.UIComponents || !window.UIComponents.InfoModal) return;

        const content = window.UIComponents.InfoModal.createContent(
            'The Frontend Performance Cockpit monitors client-side performance metrics and resource usage in real-time.',
            [
                {
                    title: 'SSE Events',
                    text: 'Tracks Server-Sent Events received per second and total count. High rates (>5/sec) indicate heavy real-time updates.'
                },
                {
                    title: 'Active Timers',
                    text: 'Shows running JavaScript timers managed by AgTimerManager. These handle periodic updates for metrics, sparklines, and UI refresh.'
                },
                {
                    title: 'Memory Usage',
                    text: 'Displays JavaScript heap memory consumption. Available only in Chromium-based browsers (Chrome, Edge, Opera).'
                },
                {
                    title: 'Low Power Mode',
                    text: 'Multiplies all timer intervals by 3× to reduce CPU usage and battery drain. Automatically activates when device battery drops below 20% (if not charging). Click the badge to manually override automatic behavior.'
                },
                {
                    title: 'Device Battery Detection',
                    text: 'Monitors the <strong>client device</strong> battery level using the Battery Status API.<ul class="info-list">' +
                        '<li class="info-list-item"><strong>Supported:</strong> Chromium-based browsers (Chrome, Edge, Opera) on devices with batteries</li>' +
                        '<li class="info-list-item"><strong>Requires HTTPS:</strong> Chrome 103+ blocks battery access on HTTP connections for privacy</li>' +
                        '<li class="info-list-item"><strong>Not supported:</strong> Firefox (removed 2016), Safari (never implemented), desktop PCs without batteries</li>' +
                        '<li class="info-list-item"><strong>Privacy:</strong> Some browsers block this API to prevent device fingerprinting</li>' +
                        '<li class="info-list-item"><strong>Display:</strong> Shows "N/A" when API is unavailable or blocked</li>' +
                        '</ul>' +
                        '<div class="info-reference-box"><strong>Note:</strong> This detects the battery of the device <em>viewing</em> the web interface (laptop, tablet), not the server (Raspberry Pi/DietPi) battery. The server typically runs on AC power or UPS.</div>'
                },
                {
                    title: 'Timer Details',
                    text: 'Expand to view detailed information about all active timers, their intervals (base and effective with Low Power multiplier), tick counts, and pause-on-hidden behavior.'
                }
            ]
        );
        window.UIComponents.InfoModal.show('About Frontend Performance Cockpit', content);
    }

    _toggleLowPower() {
        const newState = !this.lowPower;
        logger.log(`[AgPerfMonitor] Manual toggle: ${newState}`);

        if (this.lowPower && AgTimerManager._manualOverride) {
            // Already in manual mode, reset to automatic
            AgTimerManager.resetPowerMode();
        } else {
            // Force manual mode
            AgTimerManager.setLowPowerMode(newState, true);
        }

        this.lowPower = AgTimerManager._lowPowerMode;
        this.requestUpdate();
    }
}

customElements.define('ag-perf-monitor', AgPerfMonitor);
