/**
 * @module AgLogViewer
 * @description Organism component for viewing system logs with filtering and auto-refresh.
 * Transitions log management from Vanilla JS to a declarative Lit component.
 * 
 * @element ag-log-viewer
 * 
 * @attr {string} title - Viewer title
 * @attr {string} syslog-identifier - Target service identifier (e.g., 'python')
 * @attr {string} grep-pattern - Search pattern to filter logs server-side
 * @attr {number} lines - Number of lines to fetch
 * @attr {Array} activeLevels - Filter levels: ['info', 'warning', 'error', 'debug']
 * @attr {boolean} auto-refresh - Enabled periodic refresh
 * @attr {number} refresh-interval - Milliseconds between refreshes
 * @attr {boolean} reverse - Newest on top
 * 
 * @dependency ag-badge
 * @dependency ag-tooltip
 * @dependency css/components/badge.css, css/components/forms.css - Log entry, level and control styles
 * 
 * @fires filter-changed - Dispatched when log level filters change
 * @fires auto-refresh-toggled - Dispatched when auto-refresh state changes
 */

import { LitElement, html } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { apiGet, apiPost, escapeHtml, showToast, AgTimerManager } from '../../common.js';
import { FetchController } from '../../core/FetchController.js';
import { logger } from '../../utils.js';

export class AgLogViewer extends LitElement {
    static properties = {
        title: { type: String },
        syslogIdentifier: { type: String, attribute: 'syslog-identifier' },
        grepPattern: { type: String, attribute: 'grep-pattern' },
        lines: { type: Number },
        activeLevels: { type: Array }, // ['info', 'warning', 'error', 'debug']
        autoRefresh: { type: Boolean, attribute: 'auto-refresh' },
        refreshInterval: { type: Number, attribute: 'refresh-interval' },
        reverse: { type: Boolean }, // If true, newest on top and scroll to top
        logs: { type: Array },
        animationsEnabled: { type: Boolean }
    };

    constructor() {
        super();
        this.title = 'Backend Logs';
        this.syslogIdentifier = '';
        this.grepPattern = '';
        this.lines = 50;
        this.activeLevels = ['info', 'warning', 'error'];
        this.autoRefresh = true;
        this.refreshInterval = 10000;
        this.reverse = false;
        this.logs = [];
        this._timerId = `log-viewer-${Math.random().toString(36).substr(2, 9)}`;
        this.animationsEnabled = window.AppState ? window.AppState.animationsEnabled !== false : true;
        
        this._bindLogUpdate = this._handleLogUpdate.bind(this);

        this.logsFetch = new FetchController(this, {
            autoFetch: false,
            fetchFn: async () => {
                let url = `/sysinfo/logs?lines=${this.lines}&syslog_identifier=${this.syslogIdentifier}`;
                if (this.grepPattern) {
                    url += `&grep_pattern=${encodeURIComponent(this.grepPattern)}`;
                }
                const data = await apiGet(url);
                if (!data || !data.entries) {
                    throw new Error('No log entries received');
                }
                return data.entries;
            },
            onSuccess: (entries) => {
                this.logs = entries;
            },
            onError: (err) => {
                console.error('LogViewer Error:', err);
                this.logs = [];
            }
        });
    }

    createRenderRoot() {
        return this; // Light DOM for global styles
    }

    connectedCallback() {
        super.connectedCallback();
        this.loadLogs();
        if (this.autoRefresh) {
            this._startStream();
        }
        
        window.addEventListener('sys-log-update', this._bindLogUpdate);

        this._boundAnimations = (e) => {
            this.animationsEnabled = e.detail.enabled;
        };
        window.addEventListener('animations-changed', this._boundAnimations);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._stopStream();
        window.removeEventListener('sys-log-update', this._bindLogUpdate);
        window.removeEventListener('animations-changed', this._boundAnimations);
    }

    // _handleAppHidden and _handleAppVisible are now handled by AgTimerManager

    updated(changedProperties) {
        if (changedProperties.has('logs') || changedProperties.has('activeLevels')) {
            this._scrollToTarget();
        }
        if (changedProperties.has('syslogIdentifier') || changedProperties.has('grepPattern')) {
            this.loadLogs();
            if (this.autoRefresh) {
                this._startStream();
            }
        }
    }

    loadLogs() {
        return this.logsFetch.fetch();
    }

    _handleLogUpdate(e) {
        if (!this.autoRefresh) return;
        
        const { unit, syslog_identifier, entries, entry } = e.detail;
        const newEntries = entries || (entry ? [entry] : []);
        
        if (newEntries.length === 0) return;
        
        // Filter by syslog identifier (e.g. 'python') or unit (e.g. 'audiogravity-backend.service')
        if (this.syslogIdentifier) {
            const matchesId = syslog_identifier === this.syslogIdentifier;
            const matchesUnit = unit === this.syslogIdentifier || unit.replace('.service', '') === this.syslogIdentifier;
            if (!matchesId && !matchesUnit) return;
        }

        let filteredEntries = newEntries;
        // Filter by grep pattern client-side for SSE updates
        if (this.grepPattern) {
            const pattern = this.grepPattern.toLowerCase();
            filteredEntries = newEntries.filter(ent => 
                ent.message.toLowerCase().includes(pattern)
            );
        }

        if (filteredEntries.length === 0) return;

        // Append logs and maintain buffer size
        this.logs = [...this.logs, ...filteredEntries].slice(-this.lines);
        this.requestUpdate();
    }

    async _startStream() {
        if (!this.syslogIdentifier || !this.autoRefresh) return;
        
        try {
            const { unit, identifier } = this._getStreamParams();
            await apiPost(`/sysinfo/logs/stream/start?unit=${unit}${identifier ? `&syslog_identifier=${identifier}` : ''}`);
        } catch (error) {
            logger.warn('Failed to start log stream:', error);
        }
    }

    async _stopStream() {
        if (!this.syslogIdentifier) return;
        
        try {
            const { unit } = this._getStreamParams();
            await apiPost(`/sysinfo/logs/stream/stop?unit=${unit}`);
        } catch (error) {
            // Ignored on disconnect
        }
    }

    _getStreamParams() {
        const isUnit = this.syslogIdentifier.endsWith('.service');
        const unit = isUnit ? this.syslogIdentifier : 'audiogravity-backend.service';
        const identifier = isUnit ? null : this.syslogIdentifier;
        return { unit, identifier };
    }

    _scrollToTarget() {
        // Small delay to ensure DOM is updated
        setTimeout(() => {
            const container = this.querySelector('.log-container');
            if (container) {
                if (this.reverse) {
                    container.scrollTop = 0;
                } else {
                    container.scrollTop = container.scrollHeight;
                }
            }
        }, 50);
    }

    _toggleLevel(level) {
        if (this.activeLevels.includes(level)) {
            this.activeLevels = this.activeLevels.filter(l => l !== level);
        } else {
            this.activeLevels = [...this.activeLevels, level];
        }
        this.dispatchEvent(new CustomEvent('filter-changed', {
            detail: { levels: this.activeLevels },
            bubbles: true,
            composed: true
        }));
    }

    _handleLinesChange(e) {
        this.lines = parseInt(e.target.value, 10);
        this.loadLogs();
    }

    _toggleAutoRefresh() {
        this.autoRefresh = !this.autoRefresh;
        this.dispatchEvent(new CustomEvent('auto-refresh-toggled', {
            detail: { enabled: this.autoRefresh },
            bubbles: true,
            composed: true
        }));
        if (this.autoRefresh) {
            this.loadLogs();
            this._startStream();
        } else {
            this._stopStream();
        }
    }

    render() {
        let displayLogs = this.logs.filter(log => this.activeLevels.includes(log.level));
        if (this.reverse) {
            displayLogs = [...displayLogs].reverse();
        }

        return html`
                <div class="tab-title-container">
                    <div style="display: flex; align-items: center; gap: var(--spacing-sm);">
                        <h2>${this.title}</h2>
                        ${this.autoRefresh
                ? html`<ag-badge type="info" ?pulse=${this.animationsEnabled} label="LIVE" id="sys-logs-badge-${this.syslogIdentifier}"></ag-badge>`
                : html`<ag-badge label="PAUSED" id="sys-logs-badge-${this.syslogIdentifier}"></ag-badge>`}
                    </div>

                    
                    <div class="log-controls">
                        <div class="log-filter-group">
                            <ag-tooltip position="tooltip-top" text="Toggle INFO logs">
                                <button class="log-filter-btn log-filter-info ${this.activeLevels.includes('info') ? 'active' : ''}" 
                                        @click=${() => this._toggleLevel('info')}>I</button>
                            </ag-tooltip>
                            <ag-tooltip position="tooltip-top" text="Toggle WARNING logs">
                                <button class="log-filter-btn log-filter-warning ${this.activeLevels.includes('warning') ? 'active' : ''}" 
                                        @click=${() => this._toggleLevel('warning')}>W</button>
                            </ag-tooltip>
                            <ag-tooltip position="tooltip-top" text="Toggle ERROR logs">
                                <button class="log-filter-btn log-filter-error ${this.activeLevels.includes('error') ? 'active' : ''}" 
                                        @click=${() => this._toggleLevel('error')}>E</button>
                            </ag-tooltip>
                            <ag-tooltip position="tooltip-top" text="Toggle DEBUG logs">
                                <button class="log-filter-btn log-filter-debug ${this.activeLevels.includes('debug') ? 'active' : ''}" 
                                        @click=${() => this._toggleLevel('debug')}>D</button>
                            </ag-tooltip>
                        </div>

                        <select class="log-select" .value=${String(this.lines)} @change=${this._handleLinesChange}>
                            <option value="50">50 lines</option>
                            <option value="100">100 lines</option>
                            <option value="200">200 lines</option>
                            <option value="500">500 lines</option>
                        </select>

                        <ag-tooltip position="tooltip-top" text="Force refresh logs">
                            <button class="log-btn" @click=${this.loadLogs} ?disabled=${this.logsFetch.loading}>
                                ${this.logsFetch.loading ? html`<span class="spinner small"></span>` : '↻'}
                            </button>
                        </ag-tooltip>

                        <button class="log-btn ${this.autoRefresh ? 'log-btn-active' : ''}" 
                                @click=${this._toggleAutoRefresh}>
                            ${this.autoRefresh ? 'Live' : 'Paused'}
                        </button>
                    </div>
                </div>

                <div class="log-container">
                    ${this.logsFetch.error ? html`<div class="log-error">${this.logsFetch.error}</div>` : ''}
                    ${!this.logsFetch.error && displayLogs.length === 0 ? html`<div class="log-empty">No log entries match the current filters.</div>` : ''}
                    
                    ${displayLogs.map(log => {
                    const time = log.timestamp ? log.timestamp.replace('T', ' ').replace(/\+\d{4}$/, '') : '';
                    return html`
                            <div class="log-entry log-level-${log.level}">
                                <span class="log-time">${time}</span>
                                <span class="log-badge log-badge-${log.level}">${log.level.toUpperCase()}</span>
                                <span class="log-msg">${escapeHtml(log.message)}</span>
                            </div>
                        `;
                })}
                </div>
        `;
    }
}

customElements.define('ag-log-viewer', AgLogViewer);
