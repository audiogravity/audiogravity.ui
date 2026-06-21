/**
 * @module AgTopBar
 * @description Organism component for the application header.
 * Displays connection status, system metrics, and main actions.
 * 
 * @element ag-top-bar
 * 
 * @attr {boolean} connected - Connection status to the backend
 * @attr {Object} metrics - System metrics (uptime, cpu, temp, memory)
 * @attr {Object} user - Current user data
 * 
 * @dependency ag-status-indicator
 * @dependency ag-tooltip
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
import { safeToFixed, formatUptime } from '../utils-lit.js';
import { iconSettings, iconTabLibrary } from '../../ag-icons.js';

export class AgTopBar extends LitElement {
    static properties = {
        connected: { type: Boolean },
        metrics: { type: Object },
    };

    constructor() {
        super();
        this.connected = false;
        this.metrics = {
            uptime: undefined,
            cpu_percent: undefined,
            temp: undefined,
            memory_percent: undefined
        };

        this._handleSysinfo = this._handleSysinfo.bind(this);
        this._handleConnection = this._handleConnection.bind(this);
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

        if (EventEmitter) {
            EventEmitter.on('sysinfo-update', this._handleSysinfo);
            EventEmitter.on('connection-status', this._handleConnection);
        } else {
            EventEmitter.on('sysinfo-update', this._handleSysinfo);
            EventEmitter.on('connection-status', this._handleConnection);
        }
        
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        const ee = EventEmitter;
        if (ee) {
            ee.off('sysinfo-update', this._handleSysinfo);
            ee.off('connection-status', this._handleConnection);
        }
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

    _getCpuActivityLevel(cpuPercent) {
        if (cpuPercent === undefined) return '';
        if (cpuPercent < 50) return 'activity-low';
        if (cpuPercent < 80) return 'activity-medium';
        return 'activity-high';
    }

    _getTempActivityLevel(tempC) {
        if (tempC === null) return '';
        if (tempC < 60) return 'activity-low';
        if (tempC < 75) return 'activity-medium';
        return 'activity-high';
    }

    _getMemoryActivityLevel(memPercent) {
        if (memPercent === undefined) return '';
        if (memPercent < 60) return 'activity-low';
        if (memPercent < 85) return 'activity-medium';
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

        const memClass = `metric-value topbar-value ${this._getMemoryActivityLevel(this.metrics.memory_percent)}`;
        const cpuClass = `metric-value topbar-value ${this._getCpuActivityLevel(this.metrics.cpu_percent)}`;
        const tempClass = `metric-value topbar-value ${this._getTempActivityLevel(this.metrics.temp)}`;

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

                <div class="system-metrics">
                    <div class="metric">
                        <span class="metric-label">Uptime:</span>
                        <span class="metric-value topbar-value">
                            ${this.metrics.uptime !== undefined ? formatUptime(this.metrics.uptime) : '--'}
                        </span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">CPU:</span>
                        <span class=${cpuClass}>${this._formatMetricValue(this.metrics.cpu_percent, '%')}</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Temp:</span>
                        <span class=${tempClass}>${this._formatMetricValue(this.metrics.temp, '°C')}</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Memory:</span>
                        <span class=${memClass}>${this._formatMetricValue(this.metrics.memory_percent, '%')}</span>
                    </div>
                </div>

                <div style="margin-right: var(--spacing-sm);">
                    <ag-tooltip position="tooltip-bottom-right" text="Library">
                        <button class="icon-btn" @click=${() => this._emitAction('library-click')} aria-label="Open Library">
                            <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconTabLibrary}</svg>
                        </button>
                    </ag-tooltip>
                </div>

                <button class="burger-menu" @click=${() => this._emitAction('burger-click')} aria-label="Open settings">
                    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconSettings}</svg>
                </button>
            </header>
        `;
    }
}

customElements.define('ag-top-bar', AgTopBar);
