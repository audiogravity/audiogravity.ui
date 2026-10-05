/**
 * @module AgTopBar
 * @description Organism component for the application header.
 * Displays connection status, system metrics, and main actions.
 * 
 * @element ag-top-bar
 * 
 * @attr {boolean} connected - Connection status to the backend
 * @attr {Object} metrics - System metrics (uptime, cpu, temp, memory)
 * @prop {boolean} showMetrics - Property only: whether the metrics are shown. This
 *   device's "Top Bar Metrics" setting (AppState.topBarMetrics), followed live through
 *   the window event 'topbar-metrics-changed'
 * @attr {Object} user - Current user data
 *
 * @dependency ag-status-indicator
 * @dependency css/layout.css, css/components/metrics.css - Topbar layout and metric styles
 * @dependency EventEmitter - For listening to 'sysinfo-update' and 'connection-status'
 *
 * @fires burger-click - Dispatched when the burger menu button is clicked
 * @fires nav-click - Dispatched when the mobile navigation button is clicked (toggles the vertical tab sidebar)
 * @fires library-click - Dispatched when the Library shortcut button is clicked (jumps to the Library tab)
 */

import { LitElement, html } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { AppState, EventEmitter } from '../../common.js';
import { getLastSystemMetrics } from '../../sse.js';
import { safeToFixed, formatUptime } from '../utils-lit.js';
import { iconSettings, iconTabLibrary } from '../../ag-icons.js';
import '../atoms/ag-status-indicator.js';

/** The metrics before any reading: every figure unknown, each shown as a dash. */
const NO_METRICS = Object.freeze({
    uptime: undefined,
    cpu_percent: undefined,
    temp: undefined,
    memory_percent: undefined
});

export class AgTopBar extends LitElement {
    static properties = {
        connected: { type: Boolean },
        metrics: { type: Object },
        // No attribute: a Boolean attribute is true whatever it says, "false" included.
        showMetrics: { type: Boolean, attribute: false },
    };

    constructor() {
        super();
        this.connected = false;
        this.metrics = { ...NO_METRICS };
        // Read here rather than on connection, so a caller (a story) can still set it.
        this.showMetrics = AppState ? AppState.topBarMetrics !== false : true;
        this._listening = false;

        this._handleSysinfo = this._handleSysinfo.bind(this);
        this._handleConnection = this._handleConnection.bind(this);
        this._handleMetricsSetting = this._handleMetricsSetting.bind(this);
    }

    createRenderRoot() {
        return this; // Light DOM
    }

    connectedCallback() {
        super.connectedCallback();

        // Initial state
        if (AppState) {
            this.connected = AppState.connected;
        }

        EventEmitter.on('connection-status', this._handleConnection);
        window.addEventListener('topbar-metrics-changed', this._handleMetricsSetting);
        this._listenToMetrics(this.showMetrics);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        EventEmitter.off('connection-status', this._handleConnection);
        window.removeEventListener('topbar-metrics-changed', this._handleMetricsSetting);
        this._listenToMetrics(false);
    }

    willUpdate(changedProperties) {
        if (!changedProperties.has('showMetrics')) return;
        if (this.showMetrics && changedProperties.get('showMetrics') === false) {
            // Shown again, whoever switched it: the last reading of the stream now open
            // (sse.js) — at most one core cycle old, dashes before its first — and never
            // the figures from before it was hidden. The core is asked nothing: its
            // /sysinfo/current answers a partial reading, with a CPU figure measured
            // over the few milliseconds since the stream's last one.
            this.metrics = { ...NO_METRICS };
            const last = getLastSystemMetrics();
            if (last) this._handleSysinfo(last);
        }
        if (this.isConnected) this._listenToMetrics(this.showMetrics);
    }

    /**
     * Follow the machine metrics, or stop following them.
     *
     * The metrics still arrive while hidden — they travel on the one stream that
     * carries every live update, and the System and Performance tabs read them — but
     * the bar no longer handles them. Idempotent: the bus would call a listener
     * added twice twice.
     *
     * @param {boolean} on - Whether the bar should handle 'sysinfo-update'.
     */
    _listenToMetrics(on) {
        if (on === this._listening) return;
        this._listening = on;
        if (on) {
            EventEmitter.on('sysinfo-update', this._handleSysinfo);
        } else {
            EventEmitter.off('sysinfo-update', this._handleSysinfo);
        }
    }

    /**
     * Apply a change of this device's "Top Bar Metrics" setting; willUpdate does the rest.
     *
     * @param {CustomEvent<{enabled: boolean}>} event - 'topbar-metrics-changed'.
     */
    _handleMetricsSetting({ detail }) {
        this.showMetrics = detail.enabled;
    }

    _handleSysinfo(data) {
        let temp = this.metrics.temp;
        if (data.cpu_temp !== undefined && data.cpu_temp !== null) {
            temp = data.cpu_temp;
        } else if (data.temperature !== undefined && data.temperature !== null) {
            temp = data.temperature;
        } else if (data.max_temp !== undefined && data.max_temp !== null && data.max_temp < 150) {
            temp = data.max_temp;
        }

        this.metrics = {
            ...this.metrics,
            uptime: data.uptime !== undefined ? data.uptime : this.metrics.uptime,
            cpu_percent: data.cpu_percent !== undefined ? data.cpu_percent : this.metrics.cpu_percent,
            temp: temp,
            memory_percent: data.memory_percent !== undefined ? data.memory_percent : this.metrics.memory_percent
        };
    }

    _handleConnection(data) {
        this.connected = data.connected;
    }

    /**
     * The colour band of a figure — low, medium or high — or none when it is unknown.
     *
     * Unknown until the first reading, and for good for the temperature of a machine
     * without a sensor: a dash, never a colour. The three figures had a copy each, one
     * testing `=== null` and two `=== undefined`, and the temperature's dash glowed red
     * as critical.
     *
     * @param {number|null|undefined} value - The figure.
     * @param {number} medium - Where the medium band starts.
     * @param {number} high - Where the high band starts.
     * @returns {string} The class to add; empty for an unknown figure.
     */
    _activityLevel(value, medium, high) {
        if (value === null || value === undefined) return '';
        if (value < medium) return 'activity-low';
        if (value < high) return 'activity-medium';
        return 'activity-high';
    }

    _formatMetricValue(value, suffix = '') {
        if (value === undefined || value === null) return '--' + suffix;
        return `${safeToFixed(value)}${suffix}`;
    }

    _emitAction(eventName) {
        this.dispatchEvent(new CustomEvent(eventName, { bubbles: true, composed: true }));
    }

    render() {
        const statusState = this.connected ? 'up' : 'down';
        const statusLabel = this.connected ? 'Connected' : 'Connecting...';

        const memClass = `metric-value topbar-value ${this._activityLevel(this.metrics.memory_percent, 60, 85)}`;
        const cpuClass = `metric-value topbar-value ${this._activityLevel(this.metrics.cpu_percent, 50, 80)}`;
        const tempClass = `metric-value topbar-value ${this._activityLevel(this.metrics.temp, 60, 75)}`;

        return html`
            <header class="topbar" role="banner">
                <button class="nav-menu" @click=${() => this._emitAction('nav-click')} aria-label="Toggle navigation menu">
                    <span></span>
                    <span></span>
                    <span></span>
                </button>

                <div class="connection-status">
                    <ag-status-indicator 
                        type="service" 
                        state=${statusState}>
                    </ag-status-indicator>
                    <span>${statusLabel}</span>
                </div>

                <!-- Kept when empty: it is the flexible middle that holds the Library
                     and Settings buttons at the right-hand end. -->
                <!-- Each figure has its label: inline ("CPU: 12%") wherever there is room,
                     over the figure on a phone under 430px; it used to be hidden under
                     1025px, which left three numbers nobody could name (layout.css). Short
                     words, for the phone's width. -->
                <div class="system-metrics">
                    ${this.showMetrics ? html`
                    <div class="metric metric--uptime">
                        <span class="metric-label">Uptime</span>
                        <span class="metric-value topbar-value">
                            ${this.metrics.uptime !== undefined ? formatUptime(this.metrics.uptime) : '--'}
                        </span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">CPU</span>
                        <span class=${cpuClass}>${this._formatMetricValue(this.metrics.cpu_percent, '%')}</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Temp</span>
                        <span class=${tempClass}>${this._formatMetricValue(this.metrics.temp, '°C')}</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">RAM</span>
                        <span class=${memClass}>${this._formatMetricValue(this.metrics.memory_percent, '%')}</span>
                    </div>` : ''}
                </div>

                <div style="margin-right: var(--spacing-sm);">
                    <button class="icon-btn" @click=${() => this._emitAction('library-click')} aria-label="Open Library">
                        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconTabLibrary}</svg>
                    </button>
                </div>

                <button class="burger-menu" @click=${() => this._emitAction('burger-click')} aria-label="Open settings">
                    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconSettings}</svg>
                </button>
            </header>
        `;
    }
}

customElements.define('ag-top-bar', AgTopBar);
