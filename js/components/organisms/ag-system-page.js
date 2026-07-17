import { LitElement, html, nothing } from 'lit';
import { AppState, EventEmitter } from '../../common.js';
import { isGuest, isAdmin } from '../../auth.js';
import { iconTrash } from '../../ag-icons.js';
import '../atoms/ag-badge.js';
import '../molecules/ag-event-item.js';
import './ag-log-viewer.js';
import '../molecules/ag-system-actions.js';
import '../molecules/ag-terminal.js';

/**
 * @module AgSystemPage
 * @description Page component for the System tab: Vitals, Events log, Backend logs, and System Actions.
 *
 * @element ag-system-page
 *
 * @property {Array} events - List of SSE events received
 * @property {boolean} eventsEnabled - Whether event polling/capture is active
 * @property {boolean} isConnected - Connection status to SSE stream
 *
 * @dependency ag-system-dashboard
 * @dependency ag-system-actions
 * @dependency ag-event-item
 * @dependency ag-log-viewer
 * @dependency ag-event-detail-modal (via ID)
 */
export class AgSystemPage extends LitElement {
    static properties = {
        events: { type: Array },
        eventsEnabled: { type: Boolean },
        isConnected: { type: Boolean }
    };

    constructor() {
        super();
        this.events = [];
        this.eventsEnabled = true;
        this.isConnected = false;

        this._onSSEEvent = this._handleSSEEvent.bind(this);
    }

    createRenderRoot() {
        return this; // Light DOM
    }

    connectedCallback() {
        super.connectedCallback();

            EventEmitter.on('sse-event-received', this._onSSEEvent);

        // Initial event
        this._addEvent({
            type: 'info',
            data: { message: 'System monitoring active' },
            timestamp: Date.now()
        });

        // PERFORMANCE OPTIMIZATION (Phase 1):
        // Replace polling with event listener for connection status
        // Removed setInterval that checked AppState.connected every 1000ms
        this._handleConnectionStatus = ({ connected }) => {
            this.isConnected = connected;
        };

            EventEmitter.on('connection-status', this._handleConnectionStatus);

        // Initial state
        this.isConnected = AppState.connected;
    }

    disconnectedCallback() {
        super.disconnectedCallback();

            EventEmitter.off('sse-event-received', this._onSSEEvent);
            EventEmitter.off('connection-status', this._handleConnectionStatus);
    }

    _handleSSEEvent(payload) {
        if (!this.eventsEnabled) return;

        const { type } = payload;
        // Ignore frequent sysinfo/metrics/sys_log events to avoid clutter
        if (type === 'sysinfo' || type === 'service_metrics' || type === 'sys_log') return;

        this._addEvent(payload);
    }

    _addEvent(payload) {
        this.events = [payload, ...this.events].slice(0, 50);
    }

    _toggleEvents() {
        this.eventsEnabled = !this.eventsEnabled;
    }

    _clearEvents() {
        this.events = [];
    }

    _showInfo() {
        if (!window.UIComponents || !window.UIComponents.InfoModal) return;

        const content = window.UIComponents.InfoModal.createContent(
            'The System tab provides real-time monitoring of your system\'s vital metrics, hardware information, and system management actions.',
            [
                { title: 'Real-time Metrics', text: 'Monitor CPU usage, temperature, memory, disk space, and network I/O — updated every few seconds via SSE.' },
                { title: 'System Information', text: 'Detailed hardware specs: hostname, OS, kernel version, CPU model, and core count.' },
                { title: 'Audio Hardware', text: 'All connected audio devices with card details, USB interfaces, and available subdevices.' },
                { title: 'Live Connection', text: 'The LIVE badge indicates active real-time data streaming from the server.' },
                { title: 'Event Log', text: 'Track system events and SSE messages. Use RUNNING/STOPPED to pause capture, CLEAR to reset.' },
                { title: 'System Actions (admin)', text: '<strong>Restart Backend</strong> restarts the audiogravity service without rebooting. <strong>Reboot OS</strong> performs a full system reboot (double confirmation required). The UI reconnects automatically in both cases.' },
                { title: 'Terminal (admin)', text: 'Full interactive bash shell over WebSocket. The session runs as the backend user — use with care.' }
            ]
        );
        window.UIComponents.InfoModal.show('About System Monitoring', content);
    }

    _handleEventClick(e) {
        const modal = document.getElementById('agEventDetailModal');
        if (modal && e.detail && e.detail.payload) {
            modal.open(e.detail.payload);
        }
    }

    render() {
        return html`
            <div class="content-grid">
                <!-- Vitals Zone -->
                <div class="system-zone tab-zone">
                    <div class="tab-title-container">
                        <h2>SYSTEM VITALS</h2>
                        <span class="badge info clickable" @click=${this._showInfo}>INFO</span>
                        <ag-badge type="info" label="LIVE" ?pulse=${this.isConnected}></ag-badge>
                    </div>
                    <ag-system-dashboard id="systemGrid" class="system-grid"></ag-system-dashboard>
                </div>

                <!-- Events Zone -->
                <div class="history-zone tab-zone">
                    <div class="history-header">
                        <h2>EVENTS</h2>
                        <div style="display: flex; gap: var(--spacing-sm); align-items: center;">
                            <button class="event-toggle-btn compact ${this.eventsEnabled ? 'started' : 'stopped'}"
                                     @click=${this._toggleEvents}>
                                ${this.eventsEnabled ? 'RUNNING' : 'STOPPED'}
                            </button>
                            <button class="clear-btn compact" @click=${this._clearEvents}>
                                <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconTrash}</svg> Clear
                            </button>
                        </div>
                    </div>
                    <div class="history-list" @event-click=${this._handleEventClick}>
                        ${this.events.map(event => html`
                            <ag-event-item .payload=${event}></ag-event-item>
                        `)}
                        ${this.events.length === 0 ? html`<div class="history-empty">No events recorded</div>` : ''}
                    </div>
                </div>

                ${!isGuest() ? html`
                <ag-log-viewer
                    class="backend-logs-zone tab-zone"
                    title="BACKEND LOGS"
                    syslog-identifier="">
                </ag-log-viewer>
                ` : nothing}

                ${isAdmin() ? html`
                <div class="system-actions-zone tab-zone">
                    <div class="tab-title-container">
                        <h2>SYSTEM ACTIONS</h2>
                    </div>
                    <ag-system-actions></ag-system-actions>
                </div>
                <div class="system-terminal-zone tab-zone">
                    <div class="tab-title-container">
                        <h2>TERMINAL</h2>
                    </div>
                    <ag-terminal></ag-terminal>
                </div>
                ` : nothing}
            </div>
        `;
    }
}

customElements.define('ag-system-page', AgSystemPage);
