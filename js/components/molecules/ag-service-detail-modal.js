/**
 * @module AgServiceDetailModal
 * @description Molecule displaying a service's live metrics and session history
 * inside an ag-modal. Opened when the user clicks a service name in the Services tab.
 *
 * @element ag-service-detail-modal
 *
 * @attr {Object}  service - Service data object (name, state, systemd_unit, metrics, …)
 * @attr {boolean} show    - Whether the modal is visible
 * @attr {Array}   history - Filtered session history items [{ action, timestamp, success }]
 *
 * @fires modal-close - Re-fired from ag-modal when the user closes the dialog
 *
 * @dependency ag-modal
 * @dependency css/profiles.css - detail-section, detail-history-* styles
 * @dependency css/services.css - service-detail-* styles
 */

import { LitElement, html } from 'lit';
import '../organisms/ag-modal.js';

export class AgServiceDetailModal extends LitElement {
    static properties = {
        service: { type: Object },
        show:    { type: Boolean },
        history: { type: Array }
    };

    constructor() {
        super();
        this.service = null;
        this.show    = false;
        this.history = [];
    }

    createRenderRoot() {
        return this; // Light DOM for global CSS
    }

    /**
     * Formats an ISO datetime string as HH:MM:SS.
     * @param {string|null} iso
     * @returns {string}
     */
    _formatTime(iso) {
        if (!iso) return '—';
        return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    /**
     * Formats a rate value (MB/s) for display.
     * @param {number} rate
     * @returns {string}
     */
    _fmt(rate) {
        if (!rate) return '0 B/s';
        if (rate < 0.001) return `${(rate * 1024 * 1024).toFixed(0)} B/s`;
        if (rate < 1)     return `${(rate * 1024).toFixed(1)} KB/s`;
        return `${rate.toFixed(2)} MB/s`;
    }

    /**
     * Builds the modal body: metrics table + session history.
     * @returns {import('lit').TemplateResult}
     */
    _renderBody() {
        const s = this.service;
        if (!s) return html``;
        const m = s.metrics || {};

        return html`
            <section class="detail-section">
                <div class="detail-section-title">Live Metrics</div>
                <table class="detail-services-table">
                    <tbody>
                        <tr>
                            <td class="detail-unit">CPU</td>
                            <td class="detail-state">${(m.cpu_percent || 0).toFixed(1)} %</td>
                        </tr>
                        <tr>
                            <td class="detail-unit">Memory</td>
                            <td class="detail-state">${(m.memory_mb || 0).toFixed(0)} MB</td>
                        </tr>
                        <tr>
                            <td class="detail-unit">Tasks</td>
                            <td class="detail-state">${m.tasks ?? 0}</td>
                        </tr>
                        <tr>
                            <td class="detail-unit">NET ↓</td>
                            <td class="detail-state">${this._fmt(m.network_rx_rate)}</td>
                        </tr>
                        <tr>
                            <td class="detail-unit">NET ↑</td>
                            <td class="detail-state">${this._fmt(m.network_tx_rate)}</td>
                        </tr>
                        <tr>
                            <td class="detail-unit">Disk Read</td>
                            <td class="detail-state">${this._fmt(m.io_read_rate)}</td>
                        </tr>
                        <tr>
                            <td class="detail-unit">Disk Write</td>
                            <td class="detail-state">${this._fmt(m.io_write_rate)}</td>
                        </tr>
                        <tr>
                            <td class="detail-unit">Unit</td>
                            <td class="detail-state">${s.systemd_unit}</td>
                        </tr>
                        <tr>
                            <td class="detail-unit">Boot</td>
                            <td class="detail-state">${s.enabled ? 'Enabled' : 'Disabled'}</td>
                        </tr>
                    </tbody>
                </table>
            </section>

            <section class="detail-section">
                <div class="detail-section-title">Session History</div>
                ${this.history.length ? html`
                    <ul class="detail-history-list">
                        ${this.history.map(h => html`
                            <li class="detail-history-item ${h.success ? 'success' : 'error'}">
                                <span class="detail-history-time">${this._formatTime(h.timestamp)}</span>
                                <span class="detail-history-action">${h.action}</span>
                            </li>
                        `)}
                    </ul>
                ` : html`<p class="detail-empty">No activity this session.</p>`}
            </section>
        `;
    }

    render() {
        if (!this.service) return html``;

        return html`
            <ag-modal
                title="${this.service.name}"
                ?show=${this.show}
                size="large"
                .bodyTemplate=${this._renderBody()}
                @modal-close=${() => this.dispatchEvent(new CustomEvent('modal-close', { bubbles: true, composed: true }))}>
            </ag-modal>
        `;
    }
}

customElements.define('ag-service-detail-modal', AgServiceDetailModal);
