/**
 * @module AgSystemdCard
 * @description Molecule component for systemd service tuning control
 *
 * @element ag-systemd-card
 *
 * @prop {Object} service - Service object with id, name, override status, is_installed flag
 * @prop {Number} delayIndex - Animation delay index for staggered appearance
 *
 * @fires edit-service - Dispatched when edit button clicked, detail: { serviceId }
 * @fires remove-override - Dispatched when remove override clicked, detail: { serviceId }
 * @fires restore-backup - Dispatched when restore backup clicked, detail: { serviceId, backupFile }
 *
 * @dependency css/components/tile.css - Tile layout classes
 * @dependency css/systemd.css - Systemd-specific styling
 * @dependency js/auth.js - isGuest() helper
 */
import { LitElement, html, css, nothing } from 'lit';
import { isGuest } from '../../auth.js';

export class AgSystemdCard extends LitElement {
    static properties = {
        service: { type: Object },
        delayIndex: { type: Number }
    };

    createRenderRoot() {
        // Use light DOM for global CSS access
        return this;
    }

    handleEdit(e) {
        e.stopPropagation();
        this.dispatchEvent(new CustomEvent('edit-service', {
            detail: { serviceId: this.service.id },
            bubbles: true,
            composed: true
        }));
    }

    handleRemoveOverride(e) {
        e.stopPropagation();
        this.dispatchEvent(new CustomEvent('remove-override', {
            detail: { serviceId: this.service.id },
            bubbles: true,
            composed: true
        }));
    }

    handleRestoreBackup(e) {
        e.stopPropagation();
        this.dispatchEvent(new CustomEvent('restore-backup', {
            detail: { serviceId: this.service.id },
            bubbles: true,
            composed: true
        }));
    }

    render() {
        if (!this.service) return nothing;

        const props = this.service.properties || {};
        const isInstalled = this.service.is_installed !== false;
        const criticalClass = this.service.critical ? 'critical' : '';
        const overrideClass = this.service.has_override ? 'has-override' : '';
        const unavailableClass = !isInstalled ? 'unavailable' : '';

        return html`
            <div class="systemd-tile ${criticalClass} ${overrideClass} ${unavailableClass}" data-service-id="${this.service.id}"
                 style="animation-delay: ${this.delayIndex ? this.delayIndex * 0.05 : 0}s">
                <div class="systemd-header">
                    <div class="systemd-title">
                        <div class="systemd-name">${this.service.name}</div>
                        <div class="systemd-unit">${this.service.systemd_unit}</div>
                    </div>
                    <div class="systemd-badges">
                        ${this.service.critical ? html`<span class="badge warning">Critical</span>` : nothing}
                        ${this.service.has_override ? html`<span class="badge info">Override</span>` : nothing}
                        ${!isInstalled ? html`<span class="badge error">NOT INSTALLED</span>` : nothing}
                        <span class="badge ${props.io_accounting ? 'success-pulse' : 'error-pulse'}">I/O Acc</span>
                        <span class="badge ${props.ip_accounting ? 'success-pulse' : 'error-pulse'}">IP Acc</span>
                    </div>
                </div>
                
                <div class="systemd-properties">
                    <div class="property-group">
                        <div class="property-group-title">CPU & Scheduling</div>
                        <div class="property-item">
                            <span class="property-label">CPU Affinity:</span>
                            <span class="property-value">${props.cpu_affinity || 'default'}</span>
                        </div>
                        <div class="property-item">
                            <span class="property-label">Scheduling Policy:</span>
                            <span class="property-value">${props.cpu_scheduling_policy || 'default'}</span>
                        </div>
                        <div class="property-item">
                            <span class="property-label">Scheduling Priority:</span>
                            <span class="property-value">${props.cpu_scheduling_priority !== null ? props.cpu_scheduling_priority : 'default'}</span>
                        </div>
                        <div class="property-item">
                            <span class="property-label">Nice:</span>
                            <span class="property-value">${props.nice !== null ? props.nice : 'default'}</span>
                        </div>
                    </div>
                    
                    <div class="property-group">
                        <div class="property-group-title">I/O Scheduling</div>
                        <div class="property-item">
                            <span class="property-label">I/O Class:</span>
                            <span class="property-value">${props.io_scheduling_class || 'default'}</span>
                        </div>
                        <div class="property-item">
                            <span class="property-label">I/O Priority:</span>
                            <span class="property-value">${props.io_scheduling_priority !== null ? props.io_scheduling_priority : 'default'}</span>
                        </div>
                    </div>
                    
                    <div class="property-group">
                        <div class="property-group-title">Limits</div>
                        <div class="property-item">
                            <span class="property-label">Memory Max:</span>
                            <span class="property-value">${props.memory_max || 'unlimited'}</span>
                        </div>
                        <div class="property-item">
                            <span class="property-label">Memory High:</span>
                            <span class="property-value">${props.memory_high || 'unlimited'}</span>
                        </div>
                        <div class="property-item">
                            <span class="property-label">Tasks Max:</span>
                            <span class="property-value">${props.tasks_max || 'unlimited'}</span>
                        </div>
                        <div class="property-item">
                            <span class="property-label">MEMLOCK:</span>
                            <span class="property-value">${props.limit_memlock || 'default'}</span>
                        </div>
                        <div class="property-item">
                            <span class="property-label">RTPRIO:</span>
                            <span class="property-value">${props.limit_rtprio || 'default'}</span>
                        </div>
                        <div class="property-item">
                            <span class="property-label">NOFILE:</span>
                            <span class="property-value">${props.limit_nofile || 'default'}</span>
                        </div>
                        <div class="property-item">
                            <span class="property-label">NPROC:</span>
                            <span class="property-value">${props.limit_nproc || 'default'}</span>
                        </div>
                    </div>

                    <div class="property-group">
                        <div class="property-group-title">Accounting</div>
                        <div class="property-item">
                            <span class="property-label">I/O Accounting:</span>
                            <span class="property-value">${props.io_accounting ? 'enabled' : 'disabled'}</span>
                        </div>
                        <div class="property-item">
                            <span class="property-label">IP Accounting:</span>
                            <span class="property-value">${props.ip_accounting ? 'enabled' : 'disabled'}</span>
                        </div>
                    </div>
                </div>
                
                ${!isGuest() ? html`
                <div class="systemd-actions">
                    <div class="systemd-actions-row">
                        <div class="has-tooltip">
                            <button class="tile-action-btn secondary"
                                    ?disabled=${!isInstalled}
                                    @click="${this.handleEdit}">
                                Edit Properties
                            </button>
                            <div class="tooltip">${!isInstalled ? 'Package not installed' : 'Modify systemd service configuration (CPU affinity, priority, limits...)'}</div>
                        </div>
                    </div>
                    ${(this.service.has_override || this.service.has_backup) ? html`
                    <div class="systemd-actions-row">
                        ${this.service.has_override ? html`
                        <div class="has-tooltip">
                            <button class="tile-action-btn warning" @click="${this.handleRemoveOverride}">
                                Remove Override
                            </button>
                            <div class="tooltip">Restore default systemd configuration</div>
                        </div>
                        ` : nothing}
                        ${this.service.has_backup ? html`
                        <div class="has-tooltip">
                            <button class="tile-action-btn secondary" @click="${this.handleRestoreBackup}">
                                Restore Backup
                            </button>
                            <div class="tooltip">Restore configuration from before last update</div>
                        </div>
                        ` : nothing}
                    </div>
                    ` : nothing}
                </div >
                ` : nothing}
            </div >
        `;
    }
}

customElements.define('ag-systemd-card', AgSystemdCard);
