/**
 * @module AgPerfMonitor
 * @description Real-time frontend performance monitoring dashboard.
 * Visualizes SSE traffic, active timers and memory use.
 * 
 * @element ag-perf-monitor
 */
import { LitElement, html } from 'lit';
import { AgTimerManager, sseStats } from '../../common.js';
import '../atoms/ag-button.js';
import '../atoms/ag-stat-box.js';

export class AgPerfMonitor extends LitElement {
    static properties = {
        timers: { type: Array },
        sse: { type: Object },
        memory: { type: Object },
        expanded: { type: Boolean }
    };

    createRenderRoot() {
        return this; // Use Light DOM for external CSS & Icons
    }

    constructor() {
        super();
        this.timers = [];
        this.sse = sseStats;
        this.memory = null;
        this.expanded = false;
        this._updateTimer = null;
    }

    connectedCallback() {
        super.connectedCallback();

        // Start live updates (every 1s) — only re-render if data actually changed
        this._lastTotal = 0;
        this._lastEps = 0;
        this._lastTimerCount = 0;

        this._updateTimer = AgTimerManager.setInterval('perf-monitor-ui', () => {
            const newTotal = sseStats.totalEvents;
            const newEps = sseStats.eventsInLastSecond;
            const newTimerCount = AgTimerManager.listActiveTimers().length;

            let changed = newTotal !== this._lastTotal ||
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
                this._lastTotal = newTotal;
                this._lastEps = newEps;
                this._lastTimerCount = newTimerCount;
            }
        }, 1000, false); // Don't pause on hidden if we want to trace background activity
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        AgTimerManager.clearInterval('perf-monitor-ui');
    }

    render() {
        const activeTimerCount = this.timers.filter(t => t.running).length;
        const uptime = Math.round((Date.now() - this.sse.startTime) / 1000);

        return html`
            <div class="perf-container">
                <div class="perf-header">
                    <div class="tab-title-container">
                        <span class="perf-title">UI Performance Cockpit</span>
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
                            <th>Interval</th>
                            <th>Ticks</th>
                            <th>PauseHidden</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.timers.map(t => html`
                            <tr>
                                <td class="td-id">${t.id}</td>
                                <td>${t.interval}ms</td>
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
}

customElements.define('ag-perf-monitor', AgPerfMonitor);
