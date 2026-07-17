/**
 * @module AgProfileCard
 * @description Molecule component representing an Audio Profile in the Profiles tab.
 * Encapsulates ag-status-indicator and ag-badge.
 * Displays an inline services summary (Starts / Stops / Output) derived from profile data.
 *
 * @element ag-profile-card
 *
 * @attr {Object} profile - Profile data object
 * @attr {boolean} isActive - Active state of the profile
 * @attr {Object} servicesConfig - Global services configuration for resolving names
 * @attr {Object} profileMetrics - Live metrics from SSE profile_metrics event (services_active, services_inactive, services_failed, total_services)
 *
 * @dependency ag-status-indicator
 * @dependency ag-health-bar
 * @dependency css/components/tile.css - Profile tile, header, and services summary styles
 * @dependency css/components/health-bar.css - Health bar segments
 *
 * @fires toggle-profile - Dispatched when ACTIVATE/DEACTIVATE button is clicked
 */

import { LitElement, html, nothing } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import '../atoms/ag-health-bar.js';
import { isGuest } from '../../auth.js';
import { formatTimestamp } from '../utils-lit.js';
import '../atoms/ag-status-indicator.js';

export class AgProfileCard extends LitElement {
    static properties = {
        profile: { type: Object },
        isActive: { type: Boolean },
        servicesConfig: { type: Object },
        pipelineOutputs: { type: Object },
        profileMetrics: { type: Object }
    };

    constructor() {
        super();
        this.profile = null;
        this.isActive = false;
        this.servicesConfig = {};
        this.pipelineOutputs = {};
        this.profileMetrics = null;
    }

    createRenderRoot() {
        return this; // Light DOM for global CSS (profiles.css, tile.css)
    }

    connectedCallback() {
        super.connectedCallback();
        // Do NOT add 'display-contents' - breaks grid layout
        // Grid CSS expects ag-profile-card to exist as a container
    }

    /**
     * Dispatches a show-profile-detail event to open the detail modal.
     */
    _handleShowDetail() {
        this.dispatchEvent(new CustomEvent('show-profile-detail', {
            detail: { profile: this.profile },
            bubbles: true,
            composed: true
        }));
    }

    _handleToggle() {
        if (!this.profile) return;
        this.dispatchEvent(new CustomEvent('toggle-profile', {
            detail: { profileId: this.profile.id },
            bubbles: true,
            composed: true
        }));
    }

    /**
     * Renders warning badges for critical services in the start list.
     * @returns {import('lit').TemplateResult}
     */
    _renderCriticalServicesList() {
        if (!this.profile) return html``;

        const startIds = this.profile.services_to_start || this.profile.start || [];
        const criticalIds = startIds.filter(id => this.servicesConfig[id]?.critical);

        if (!criticalIds.length) return html``;

        return html`
            <div class="profile-critical-services">
                ${criticalIds.map(id => html`
                    <div class="critical-service-item">${this.servicesConfig[id]?.label || id}</div>
                `)}
            </div>
        `;
    }

    /**
     * Resolves the current audio output for this profile from pipelineOutputs.
     * Tries direct ID match first, then falls back to the systemd unit name (stripped of .service).
     * Returns the raw current_output string (e.g. "usb", "toslink") or null.
     * @returns {string|null}
     */
    _extractOutput() {
        if (!this.profile || !Object.keys(this.pipelineOutputs).length) return null;

        const startIds = this.profile.services_to_start || this.profile.start || [];

        // Build a lookup: logical_name → systemd unit id (e.g. "roon" → "roonbridge")
        const unitMap = {};
        (this.profile.services_status || []).forEach(s => {
            unitMap[s.logical_name] = s.systemd_unit?.replace('.service', '');
        });

        for (const id of startIds) {
            const direct = this.pipelineOutputs[id];
            if (direct) return direct;
            const viaUnit = unitMap[id] && this.pipelineOutputs[unitMap[id]];
            if (viaUnit) return viaUnit;
        }
        return null;
    }

    /**
     * Formats an ISO datetime string as a human-readable relative time (e.g. "2h ago").
     * @param {string|null} iso - ISO 8601 datetime string
     * @returns {string}
     */
    _formatRelativeTime(iso) {
        return formatTimestamp(iso) || '---';
    }

    /**
     * Renders the inline Starts / Stops / Output summary rows.
     * @returns {import('lit').TemplateResult}
     */
    _renderServicesSummary() {
        const startIds = this.profile.services_to_start || this.profile.start || this.profile.start_services || [];
        const stopIds  = this.profile.services_to_stop  || this.profile.stop  || this.profile.stop_services  || [];
        const output   = this._extractOutput();

        if (!this.profile) return html``;

        const startLabels = startIds;
        const stopLabels  = stopIds;

        return html`
            <div class="profile-services-summary">
                <div class="profile-info-row">
                    <span class="info-label">Starts</span>
                    <span class="info-value starts">${startLabels.length ? startLabels.join(' · ') : '---'}</span>
                </div>
                <div class="profile-info-row">
                    <span class="info-label">Stops</span>
                    <span class="info-value stops">${stopLabels.length ? stopLabels.join(' · ') : '---'}</span>
                </div>
                <div class="profile-info-row">
                    <span class="info-label">Output</span>
                    <span class="info-value output">${output ?? '---'}</span>
                </div>
                <div class="profile-info-row">
                    <span class="info-label">Last</span>
                    <span class="info-value last-activated">${this._formatRelativeTime(this.profile.last_activation)}</span>
                </div>
            </div>
        `;
    }

    /**
     * Renders the ag-health-bar atom with live service counts from profileMetrics.
     * @returns {import('lit').TemplateResult}
     */
    _renderHealthBar() {
        const m = this.profileMetrics;
        if (!m || !m.total_services) return html``;

        return html`
            <ag-health-bar
                .showCounters=${true}
                style="margin-top: var(--spacing-sm)"
                active=${m.services_active}
                failed=${m.services_failed}
                idle=${m.services_inactive}>
            </ag-health-bar>
        `;
    }

    /**
     * Renders a red error badge when one or more services are in a failed state.
     * @returns {import('lit').TemplateResult}
     */
    _renderFailedBadge() {
        const failed = this.profileMetrics?.services_failed;
        if (!failed) return html``;
        return html`<span class="badge error">${failed} failed</span>`;
    }

    render() {
        if (!this.profile) return html``;

        const isPending = this.profile.state === 'activating' || this.profile.state === 'deactivating';
        const isAvailable = this.profile.is_available !== false;
        const statusClass = this.profile.state === 'active' ? 'up' : isPending ? 'pending' : 'down';
        const statusText = this.profile.state === 'active' ? 'UP' : isPending ? 'PENDING' : 'IDLE';

        const tileClasses = {
            'profile-tile': true,
            'animate-fade-in': true,
            'critical': !!this.profile.critical,
            'active': this.isActive,
            'pending': isPending,
            'unavailable': !isAvailable
        };

        return html`
            <div class=${classMap(tileClasses)} data-profile-id="${this.profile.id}">
                <div class="profile-header">
                    <div>
                        <div class="profile-name profile-name-clickable"
                             @click=${this._handleShowDetail}>${this.profile.name}</div>
                    </div>
                    <ag-status-indicator
                        type="profile"
                        state=${statusClass}
                        label=${statusText}>
                    </ag-status-indicator>
                </div>

                <div class="profile-description">${this.profile.description || 'No description'}</div>

                ${this._renderServicesSummary()}
                ${this._renderHealthBar()}

                <div class="profile-footer">
                    <div class="profile-actions">
                        ${!isGuest() ? html`
                        <div class="has-tooltip">
                            <button class="tile-action-btn ${this.isActive ? 'secondary' : 'activate'}"
                                    ?disabled=${isPending || (!isAvailable && !this.isActive)}
                                    @click=${this._handleToggle}>
                                ${isPending ? (this.profile.state === 'activating' ? 'ACTIVATING...' : 'STOPPING...') : this.isActive ? 'DEACTIVATE' : 'ACTIVATE'}
                            </button>
                            <div class="tooltip tooltip-top">
                                ${!isAvailable ? 'Some services are not installed' : isPending ? 'Please wait...' : this.isActive ? 'Deactivate this profile' : 'Activate this profile'}
                            </div>
                        </div>
                        ` : nothing}
                    </div>
                    ${!isAvailable ? html`<span class="badge error">UNAVAILABLE</span>` : ''}
                    ${this._renderFailedBadge()}
                    ${this._renderCriticalServicesList()}
                </div>
            </div>
        `;
    }
}

customElements.define('ag-profile-card', AgProfileCard);
