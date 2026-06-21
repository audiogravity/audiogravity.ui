/**
 * @module AgProfileDetailModal
 * @description Molecule component displaying a profile's service status and session history
 * inside an ag-modal. Opened by the Profiles page when the user clicks a profile name.
 *
 * @element ag-profile-detail-modal
 *
 * @attr {Object} profile - Profile data object (services_status, name, …)
 * @attr {boolean} show - Whether the modal is visible
 * @attr {Array} history - Filtered session history items [{ action, timestamp, success }]
 *
 * @fires modal-close - Re-fired from ag-modal when the user closes the dialog
 *
 * @dependency ag-modal
 * @dependency css/profiles.css - detail-section, detail-services-table, detail-history-* styles
 */

import { LitElement, html } from 'lit';
import '../organisms/ag-modal.js';

export class AgProfileDetailModal extends LitElement {
    static properties = {
        profile: { type: Object },
        show:    { type: Boolean },
        history: { type: Array }
    };

    constructor() {
        super();
        this.profile = null;
        this.show    = false;
        this.history = [];
    }

    createRenderRoot() {
        return this; // Light DOM for global CSS
    }

    /**
     * Returns an inline status dot for a service row.
     * @param {Object} svc - Service status object
     * @returns {import('lit').TemplateResult}
     */
    _stateIcon(svc) {
        if (svc.state === 'active' || svc.is_running) return html`<span class="profile-status-dot up"></span>`;
        if (svc.state === 'failed')                   return html`<span class="profile-status-dot error"></span>`;
        return html`<span class="profile-status-dot down"></span>`;
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
     * Builds the modal body template: services table + session history.
     * @returns {import('lit').TemplateResult}
     */
    _renderBody() {
        const p = this.profile;
        if (!p) return html``;

        return html`
            <section class="detail-section">
                <div class="detail-section-title">Services</div>
                <table class="detail-services-table">
                    <thead>
                        <tr>
                            <th></th>
                            <th>Service</th>
                            <th>State</th>
                            <th class="col-unit">Unit</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(p.services_status || []).map(svc => html`
                            <tr>
                                <td>${this._stateIcon(svc)}</td>
                                <td>${svc.label || svc.logical_name}</td>
                                <td class="detail-state ${svc.is_running ? 'up' : svc.state === 'failed' ? 'error' : 'down'}">
                                    ${svc.state}
                                </td>
                                <td class="detail-unit col-unit">${svc.systemd_unit}</td>
                            </tr>
                        `)}
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
        if (!this.profile) return html``;

        return html`
            <ag-modal
                title="${this.profile.name}"
                ?show=${this.show}
                size="large"
                .bodyTemplate=${this._renderBody()}
                @modal-close=${() => this.dispatchEvent(new CustomEvent('modal-close', { bubbles: true, composed: true }))}>
            </ag-modal>
        `;
    }
}

customElements.define('ag-profile-detail-modal', AgProfileDetailModal);
