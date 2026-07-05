/**
 * @module AgConfigCard
 * @description Molecule component for service configuration quick access card
 *
 * @element ag-config-card
 *
 * @prop {Object} service - Service object with id, name, and config info
 * @prop {string} service.id - Unique identifier for the service.
 * @prop {string} service.displayName - User-friendly name for the service.
 * @prop {string} service.path - File path or identifier for the service configuration.
 * @prop {string} [service.audioOutput] - Optional audio output device ID for the service.
 * @prop {boolean} [service.critical=false] - Indicates if the service is critical.
 * @prop {string|null} [service.status] - Systemd ActiveState (active, inactive, failed, etc.)
 * @prop {string|null} [service.fileMtime] - ISO 8601 last-modified timestamp of the config file.
 * @prop {number} [service.backupCount=0] - Number of available backups.
 * @prop {Number} delayIndex - Animation delay index for staggered appearance
 *
 * @fires edit-config - Dispatched when edit button clicked, detail: { serviceId }
 *
 * @dependency ag-audio-output - Used for displaying audio device
 * @dependency css/components/tile.css - Tile layout classes
 * @dependency css/config.css - Configuration card styling
 */
import { LitElement, html, nothing } from 'lit';
import { iconDownload } from '../../ag-icons.js';
import { AgAudioOutput } from '../atoms/ag-audio-output.js';
import { isGuest } from '../../auth.js';
import { apiGet } from '../../api.js';

/** Format an ISO 8601 mtime string to a compact locale-aware relative label. */
const _fmtMtime = (iso) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now - d;
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) return `today at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 30) return `${diffDays}d ago`;
    return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
};

export class AgConfigCard extends LitElement {
    static properties = {
        service: { type: Object },
        delayIndex: { type: Number },
        provisionable: { type: Boolean },
        configured: { type: Boolean }
    };

    constructor() {
        super();
        this.provisionable = false;
        this.configured = false;
    }

    createRenderRoot() {
        // Use light DOM
        return this;
    }

    handleEdit(e) {
        e.stopPropagation();
        this.dispatchEvent(new CustomEvent('edit-config', {
            detail: { serviceId: this.service.id },
            bubbles: true,
            composed: true
        }));
    }

    async handleDownload(e) {
        e.stopPropagation();
        try {
            const data = await apiGet(`/audio_app_config/${this.service.id}/config?type=raw`);
            const filename = this.service.path.split('/').pop();
            const blob = new Blob([data.content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
        } catch (_) {
            // Silently ignore — download is best-effort
        }
    }

    render() {
        if (!this.service) return nothing;

        // Apply delay class via lit lifecycle if needed (this can be done via connectedCallback)
        // or let ag-card-grid handle it via dataset logic like other components might.
        // For now, we mimic the existing vanilla JS class appending.
        const criticalClass = this.service.critical ? 'critical' : '';

        const tileStyle = this.delayIndex ? `--delay-index: ${this.delayIndex}` : '';
        const tileClasses = this.delayIndex ? 'stagger-delay' : '';

        const status = this.service.status;
        const statusVariant = status === 'active' ? 'running'
            : status === 'failed' ? 'failed'
            : status ? 'stopped'
            : null;
        const statusLabel = status === 'active' ? 'RUNNING'
            : status === 'failed' ? 'FAILED'
            : status ? 'STOPPED'
            : null;

        return html`
            <div class="config-tile animate-fade-in ${criticalClass} ${tileClasses}" data-service-id="${this.service.id}"
                 style=${tileStyle}>
                <div class="service-header">
                    <div class="config-service-name">${this.service.displayName}</div>
                    <div class="config-header-badges">
                        ${this.service.backupCount > 0 ? html`
                            <div class="has-tooltip">
                                <span class="badge neutral config-backup-badge">${this.service.backupCount}</span>
                                <div class="tooltip">${this.service.backupCount} backup${this.service.backupCount > 1 ? 's' : ''} available</div>
                            </div>
                        ` : nothing}
                        ${statusLabel ? html`
                            <span class="config-status-badge config-status-badge--${statusVariant}">${statusLabel}</span>
                        ` : nothing}
                        ${this.provisionable ? html`
                            <div class="has-tooltip">
                                <span class="badge ${this.configured ? 'success' : 'neutral'}">${this.configured ? 'CONFIGURED' : 'NOT CONFIGURED'}</span>
                                <div class="tooltip">${this.configured ? 'Set up by AudioGravity' : 'Using package defaults — not set up by AudioGravity'}</div>
                            </div>
                        ` : nothing}
                    </div>
                </div>

                <div class="service-body" style="flex: 1; display: flex; flex-direction: column; justify-content: center;">
                    <div class="config-service-path">${this.service.path}</div>
                    ${this.service.audioOutput ? html`
                        <ag-audio-output .value=${this.service.audioOutput}></ag-audio-output>
                    ` : nothing}
                    ${this.service.fileMtime ? html`
                        <div class="config-file-mtime">
                            Modified ${_fmtMtime(this.service.fileMtime)}
                        </div>
                    ` : nothing}
                </div>

                <div class="service-footer">
                    <div class="config-footer-left">
                        ${!isGuest() ? html`
                        <div class="has-tooltip">
                            <button class="tile-action-btn" @click="${this.handleEdit}">EDIT CONFIG</button>
                            <div class="tooltip">Configure this service</div>
                        </div>
                        ` : nothing}
                        ${this.service.critical ? html`
                            <div class="has-tooltip">
                                <span class="badge warning">CRITICAL</span>
                                <div class="tooltip">Critical Service</div>
                            </div>
                        ` : nothing}
                    </div>
                    <div class="has-tooltip">
                        <button class="tile-action-btn tile-action-btn--icon" @click="${this.handleDownload}" aria-label="Download config">
                            <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconDownload}</svg>
                        </button>
                        <div class="tooltip">Download config file</div>
                    </div>
                </div>
            </div>
        `;
    }
}

customElements.define('ag-config-card', AgConfigCard);
