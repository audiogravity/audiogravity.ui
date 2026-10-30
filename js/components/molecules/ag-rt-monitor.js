/**
 * @module AgRtMonitor
 * @description RT Process Monitor — displays real-time scheduling status for audio processes.
 * Polls GET /performance/rt-processes periodically and shows per-process SCHED_FIFO/OTHER badges.
 *
 * @element ag-rt-monitor
 *
 * @dependency css/performance.css - .rt-monitor-* styles
 * @dependency js/api.js - apiGet
 */

import { LitElement, html, nothing } from 'lit';
import { getUserFriendlyError } from '../../ui-helpers.js';
import { apiGet } from '../../api.js';
import { iconSpinner } from '../../ag-icons.js';

const POLL_INTERVAL_MS = 10000;

export class AgRtMonitor extends LitElement {
    static properties = {
        _processes: { type: Array, state: true },
        _loading: { type: Boolean, state: true },
        _error: { type: String, state: true }
    };

    constructor() {
        super();
        this._processes = [];
        this._loading = true;
        this._error = null;
        this._timer = null;
    }

    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        this._load();
        this._timer = setInterval(() => this._load(), POLL_INTERVAL_MS);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        clearInterval(this._timer);
        this._timer = null;
    }

    async _load() {
        try {
            const data = await apiGet('/performance/rt-processes');
            this._processes = Array.isArray(data) ? data : [];
            this._error = null;
        } catch (e) {
            this._error = getUserFriendlyError(e);
        } finally {
            this._loading = false;
        }
    }

    /**
     * Render a single process row.
     * @param {Object} proc
     * @returns {import('lit').TemplateResult}
     */
    _renderRow(proc) {
        if (!proc.running) {
            return html`
                <tr class="rt-monitor-row">
                    <td class="rt-monitor-name">${proc.name}</td>
                    <td><span class="rt-badge stopped">STOPPED</span></td>
                    <td class="rt-monitor-meta">—</td>
                    <td class="rt-monitor-meta">—</td>
                </tr>
            `;
        }

        // MPD is read on the threads that carry its sound (the core's `audio_threads`):
        // its main thread is not real time, and need not be. `outranked` — another of
        // its threads runs at or above them — is what a real-time policy on the whole
        // service does, and it made the sound drop out while MPD read cover art.
        const badgeClass = proc.outranked ? 'outranked' : proc.is_rt ? 'rt' : 'non-rt';
        const badgeLabel = proc.outranked ? 'OUTRANKED' : proc.is_rt ? proc.policy : 'NON-RT';

        return html`
            <tr class="rt-monitor-row">
                <td class="rt-monitor-name">${proc.name}${proc.audio_threads
                    ? html`<span class="rt-monitor-basis">sound threads</span>` : nothing}</td>
                <td><span class="rt-badge ${badgeClass}">${badgeLabel}</span></td>
                <td class="rt-monitor-meta">${proc.priority ?? '—'}</td>
                <td class="rt-monitor-meta">${proc.pid ?? '—'}</td>
            </tr>
        `;
    }

    render() {
        return html`
            <div class="performance-section tab-zone">
                <div class="test-header">
                    <div class="test-title-wrapper">
                        <h2>RT Process Monitor</h2>
                    </div>
                    <div class="test-actions">
                        <button class="action-btn secondary compact" @click=${() => this._load()}
>
                            <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconSpinner}</svg> Refresh
                        </button>
                    </div>
                </div>

                ${this._loading ? html`
                    <div class="services-loading">
                        <svg class="ag-spin" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconSpinner}</svg>&nbsp;Loading…
                    </div>
                ` : this._error ? html`
                    <div class="services-empty">${this._error}</div>
                ` : html`
                    <table class="rt-monitor-table">
                        <thead>
                            <tr>
                                <th>Process</th>
                                <th>Scheduler</th>
                                <th>Priority</th>
                                <th>PID</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${this._processes.map(p => this._renderRow(p))}
                        </tbody>
                    </table>
                    ${this._processes.some(p => p.outranked) ? html`
                        <p class="rt-monitor-hint">
                            OUTRANKED: another part of the program runs ahead of its sound, which
                            can then drop out. In Systemd tuning, apply Audio Optimized to it and
                            save: on MPD it leaves the policy and the priority empty.
                        </p>
                    ` : nothing}
                    <p class="rt-monitor-hint">
                        SCHED_FIFO/RR = real time: the program is not held up while the box is
                        busy. MPD makes its own sound threads real time, and is read on them.
                    </p>
                `}
            </div>
        `;
    }
}

customElements.define('ag-rt-monitor', AgRtMonitor);
