/**
 * @module AgPackageCard
 * @description Molecule component representing an Audio Software package card.
 * Handles the display of software state, versions, and installation actions.
 * 
 * @element ag-package-card
 * 
 * @attr {Object} pkg - Package data object
 * @attr {boolean} animationsEnabled - Global animation setting
 * @attr {boolean} isChecking - Update check state
 * 
 * @dependency css/audio-software.css - Package card and header styles
 * 
 * @fires package-action - Dispatched when INSTALL, UPDATE, or UNINSTALL is clicked
 * @fires package-check-update - Dispatched when manual update check is requested
 */

import { LitElement, html } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { isGuest } from '../../auth.js';
import { iconRepeat, iconDownload, iconTrash, iconCheckCircle, iconCircle, iconClose, iconSpinner, iconDocs, iconCpu } from '../../ag-icons.js';

export class AgPackageCard extends LitElement {
    static properties = {
        pkg: { type: Object },
        animationsEnabled: { type: Boolean },
        isChecking: { type: Boolean },
        restartRequired: { type: Boolean }
    };

    constructor() {
        super();
        this.pkg = null;
        this.animationsEnabled = true; // Set by main application state
        this.isChecking = false;
        this.restartRequired = false;
    }

    createRenderRoot() {
        return this; // Light DOM needed for audio-software.css classes
    }

    connectedCallback() {
        super.connectedCallback();
        // Do NOT add 'display-contents' - breaks grid layout
        // Grid CSS expects ag-package-card to exist as a container
    }

    _handleAction(action) {
        if (!this.pkg) return;
        this.dispatchEvent(new CustomEvent('package-action', {
            detail: { packageId: this.pkg.id, action: action },
            bubbles: true,
            composed: true
        }));
    }

    _handleRestartService() {
        if (!this.pkg?.service_id) return;
        this.dispatchEvent(new CustomEvent('package-restart-service', {
            detail: { packageId: this.pkg.id, serviceId: this.pkg.service_id },
            bubbles: true,
            composed: true
        }));
    }

    _handleCheckUpdate() {
        if (!this.pkg) return;
        this.dispatchEvent(new CustomEvent('package-check-update', {
            detail: { packageId: this.pkg.id },
            bubbles: true,
            composed: true
        }));
    }

    _renderVersions() {
        if (!this.pkg.installed_version) return '';

        let availableVersionHtml = '';

        if (this.isChecking) {
            availableVersionHtml = html`
                <div class="version-info">
                    <span class="version-label">Available:</span>
                    <span class="version-value available-version-value">Checking...</span>
                </div>
            `;
        } else if (this.pkg.available_version) {
            const hasUpdate = this.pkg.available_version !== this.pkg.installed_version;
            const badgeClass = `badge warning pill ${this.animationsEnabled ? 'animate-pulse' : ''}`;

            availableVersionHtml = html`
                <div class="version-info">
                    <span class="version-label">Available:</span>
                    <span class="version-value available-version-value">
                        <span>${this.pkg.available_version}</span>
                        ${hasUpdate ? html`<span class="${badgeClass}">Update available</span>` : ''}
                    </span>
                </div>
            `;
        } else if (this.pkg.installer_type !== 'script' && !isGuest()) {
            availableVersionHtml = html`
                <div class="version-info">
                    <span class="version-label">Available:</span>
                    <span class="version-value available-version-value">
                        <button class="btn-link" @click=${(e) => { e.stopPropagation(); this._handleCheckUpdate(); }}>
                            <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconRepeat}</svg> Check updates
                        </button>
                    </span>
                </div>
            `;
        }

        return html`
            <div class="software-version">
                <div class="version-info">
                    <span class="version-label">Installed:</span>
                    <span class="version-value"><span>${this.pkg.installed_version}</span></span>
                </div>
                ${availableVersionHtml}
            </div>
        `;
    }

    _renderActions() {
        if (!this.pkg.is_supported) {
            return html`<button class="tile-action-btn start" disabled><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconDownload}</svg> INSTALL</button>`;
        }

        if (isGuest()) {
            return html``;
        }

        if (this.pkg.status === 'not_installed') {
            return html`<button class="tile-action-btn start" @click=${() => this._handleAction('install')}><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconDownload}</svg> INSTALL</button>`;
        }

        if (this.pkg.status === 'installed') {
            return html`
                <button class="tile-action-btn secondary" @click=${() => this._handleAction('update')}><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconRepeat}</svg> UPDATE</button>
                <button class="tile-action-btn warning" @click=${() => this._handleAction('uninstall')}><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconTrash}</svg> UNINSTALL</button>
            `;
        }

        if (['installing', 'updating', 'uninstalling'].includes(this.pkg.status)) {
            // Capitalize first letter
            const statusText = this.pkg.status.charAt(0).toUpperCase() + this.pkg.status.slice(1);
            return html`
                <div class="software-progress">
                    <div class="premium-progress active">
                        <div class="premium-progress-bar">
                            <div class="premium-progress-fill" style="width: 50%;"></div>
                        </div>
                    </div>
                    <span class="progress-text">${statusText}...</span>
                </div>
            `;
        }

        return '';
    }

    render() {
        if (!this.pkg) return html``;

        const statusText = this.pkg.status.replace('_', ' ').toUpperCase();
        const _statusIconSvg = this.pkg.status === 'installed' ? iconCheckCircle
            : this.pkg.status === 'not_installed' ? iconCircle
            : this.pkg.status === 'error' ? iconClose
            : iconSpinner;

        const wrapperClasses = {
            'software-card': true,
            [this.pkg.status]: true
        };

        return html`
            <div class=${classMap(wrapperClasses)} data-package-id=${this.pkg.id}>
                <div class="software-header">
                    <div class="software-name">${this.pkg.label}</div>
                    <div class="software-status">
                        <div class="software-status-indicator ${this.pkg.status}">
                            <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${_statusIconSvg}</svg>
                            <span>${statusText}</span>
                        </div>
                    </div>
                </div>

                <div class="software-description">${this.pkg.description}</div>

                ${this._renderVersions()}

                <div class="software-actions">
                    ${this._renderActions()}
                </div>

                <div class="software-footer">
                    <div class="software-meta">
                        <span class="meta-item">
                            <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconCpu}</svg>
                            <span>${this.pkg.arch_support ? this.pkg.arch_support.join(', ') : 'Unknown'}</span>
                        </span>
                        ${this.pkg.is_test_package ? html`<span class="badge warning">Test Package</span>` : ''}
                        ${!this.pkg.is_supported ? html`<span class="badge error">Not Supported</span>` : ''}
                        ${this.restartRequired && this.pkg.service_id ? html`
                            <button class="badge warning animate-pulse restart-badge" @click=${(e) => { e.stopPropagation(); this._handleRestartService(); }}>
                                <svg class="ag-spin" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconSpinner}</svg> Restart required
                            </button>` : ''}
                    </div>
                    ${this.pkg.doc_url ? html`
                        <a class="doc-link has-tooltip" href=${this.pkg.doc_url} target="_blank" rel="noopener noreferrer" @click=${e => e.stopPropagation()}>
                            <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconDocs}</svg>
                            <div class="tooltip tooltip-top">Documentation</div>
                        </a>
                    ` : ''}
                </div>
            </div>
        `;
    }
}

customElements.define('ag-package-card', AgPackageCard);
