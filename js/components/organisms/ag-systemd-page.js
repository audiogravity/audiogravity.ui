import { LitElement, html } from 'lit';
import { validationField } from '../../net-errors.js';
import {
    apiGet,
    apiPost,
    apiCall,
    apiCallWithRetry,
    showToast,
    showConfirm,
    AppState,
    addToHistory,
    handleError,
} from '../../common.js';
import { FetchController } from '../../core/FetchController.js';
import { ContextConsumer } from '@lit/context';
import { appContext } from '../../core/app-context.js';
import './ag-card-grid.js';
import '../molecules/ag-systemd-card.js';
import '../molecules/ag-validation-results.js';

/**
 * @module AgSystemdPage
 * @description Page component for tuning SystemD unit properties via overrides.
 * 
 * @element ag-systemd-page
 * 
 * @property {Array} services - List of available systemd services
 * @property {boolean} loading - Data loading state
 * @property {string} error - Loading error message
 * 
 * @dependency ag-card-grid
 * @dependency ag-systemd-card
 * @dependency ag-systemd-override-editor (via ID)
 */
export class AgSystemdPage extends LitElement {
    static properties = {
        services: { type: Array }
    };

    constructor() {
        super();
        this.services = [];
        this._loaded = false;

        this.servicesFetch = new FetchController(this, {
            autoFetch: false,
            fetchFn: async () => {
                const config = await apiGet('/profiles/configuration');
                const servicesConfig = config.services || {};

                const servicesList = [];
                for (const [serviceId, serviceConfig] of Object.entries(servicesConfig)) {
                    try {
                        const props = await apiGet(`/services/${serviceConfig.systemd_unit}/properties`);
                        servicesList.push({
                            id: serviceId,
                            name: serviceConfig.label,
                            systemd_unit: serviceConfig.systemd_unit,
                            critical: serviceConfig.critical,
                            properties: props.properties,
                            has_override: props.has_override,
                            override_path: props.override_path,
                            has_backup: props.has_backup,
                            backup_path: props.backup_path,
                            is_installed: props.is_installed !== false
                        });
                    } catch (error) {
                        console.error(`Failed to load properties for ${serviceId}:`, error);
                    }
                }
                return servicesList;
            },
            onSuccess: (data) => {
                this.services = data;
            }
        });

        // Subscribe to Global App Context for Tab Changes
        new ContextConsumer(this, {
            context: appContext,
            subscribe: true,
            callback: (state) => {
                if (state && state.currentTab) {
                    this._handleTabChanged({ active: state.currentTab });
                }
            }
        });
    }

    createRenderRoot() {
        return this; // Light DOM
    }

    connectedCallback() {
        super.connectedCallback();

        if (AppState.currentTab === 'systemd' || window.location.hash === '#systemd') {
            this.updateComplete.then(() => this._loadServices());
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
    }

    _handleTabChanged(data) {
        if (data.active === 'systemd' && !this._loaded) {
            this._loadServices();
        }
    }

    _loadServices() {
        this._loaded = true;
        return this.servicesFetch.fetch();
    }

    async _handleEditService(e) {
        const serviceId = e.detail.serviceId;
        const service = this.services.find(s => s.id === serviceId);
        if (!service) return;

        const editor = document.getElementById('agSystemdOverrideEditor');
        if (!editor) return;

        // Clean up previous event listener if it exists
        if (editor._saveHandler) {
            editor.removeEventListener('save', editor._saveHandler);
        }

        const saveHandler = async (ev) => {
            const success = await this._saveProperties(ev.detail.service, ev.detail.properties, ev.detail.apply_immediately);
            if (success) {
                editor.close();
            }
        };

        editor._saveHandler = saveHandler;
        editor.addEventListener('save', saveHandler, { once: true });
        editor.open(service);
    }

    async _saveProperties(service, properties, apply_immediately) {
        if (!service || !properties) return false;

        const editor = document.getElementById('agSystemdOverrideEditor');
        if (editor) editor.isSaving = true;

        try {
            // Validate properties
            if (showToast) showToast('info', 'Validating...', 'Checking systemd configuration validity');

            let validation;
            try {
                validation = await apiPost(`/services/${service.systemd_unit}/properties/validate`, properties);
            } catch (validationError) {
                // A Lit template: the markup is ours, and Lit renders the field names and
                // the core's messages as text.
                let errorContent;
                if (validationError.status === 422 && validationError.validationErrors) {
                    errorContent = html`<div class="validation-section validation-errors"><h4 class="validation-section-title">❌ Invalid Input Values</h4><ul class="validation-list">${
                        validationError.validationErrors.map(err => {
                            const fieldName = validationField(err).replace('properties.', '').replace(/_/g, ' ').toUpperCase();
                            return html`<li class="validation-error"><strong>${fieldName}:</strong> ${err.msg || 'Invalid value'}</li>`;
                        })
                    }</ul></div>`;
                } else {
                    const errorMsg = validationError.detail || validationError.message || 'Unknown validation error';
                    errorContent = html`<div class="validation-section validation-errors"><h4 class="validation-section-title">❌ Validation Failed</h4><p class="validation-error"><strong>${errorMsg}</strong></p></div>`;
                }

                if (showConfirm) showConfirm('❌ Validation Error', html`<div class="validation-results">${errorContent}</div>`, { isInfo: true });
                return false;
            }

            if (!validation.valid) {
                const content = html`<ag-validation-results .result=${validation}></ag-validation-results>`;
                if (showConfirm) showConfirm('Invalid Configuration', content, { isInfo: true });
                return false;
            }

            if (validation.warnings && validation.warnings.length > 0) {
                const content = html`<ag-validation-results .result=${validation}></ag-validation-results><p><strong>Continue with these warnings?</strong></p>`;
                const confirmed = await showConfirm('Validation Warnings', content, 'Apply anyway', 'Cancel');
                if (!confirmed) return false;
            }

            // Apply properties
            const result = await apiPost(`/services/${service.systemd_unit}/properties`, {
                properties: properties,
                apply_immediately: apply_immediately,
                skip_validation: true
            });

            if (showToast) showToast('success', 'Properties Updated', result.message || 'Systemd properties updated successfully');
            if (addToHistory) addToHistory('systemd', `Updated: ${service.name}`, true);

            await this._loadServices();
            return true;
        } catch (error) {
            console.error('Failed to apply properties:', error);
            handleError(error, 'Failed to update properties');
            // A refused save may have been applied and undone meanwhile: the core puts
            // the previous settings back when the service does not start on the new
            // ones, so the listed settings are read again.
            await this._loadServices();
            return false;
        } finally {
            if (editor) editor.isSaving = false;
        }
    }

    async _handleRemoveOverride(e) {
        const serviceId = e.detail.serviceId;
        const service = this.services.find(s => s.id === serviceId);
        if (!service) return;

        const confirmed = await showConfirm('Remove Override', html`Restore default settings for "<strong>${service.name}</strong>"? If it is running, it is restarted.`, { destructive: true });
        if (!confirmed) return;

        try {
            // The core says whether the service was restarted on its own settings.
            const result = await apiCall(`/services/${service.systemd_unit}/properties/override`, { method: 'DELETE' });
            if (showToast) showToast('success', 'Configuration Restored', result?.message || `Override removed for ${service.name}`);
            if (addToHistory) addToHistory('systemd', `Removed override: ${service.name}`, true);
            await this._loadServices();
        } catch (error) {
            handleError(error, 'Failed to remove override');
        }
    }

    async _handleRestoreBackup(e) {
        const serviceId = e.detail.serviceId;
        const service = this.services.find(s => s.id === serviceId);
        if (!service) return;

        const confirmed = await showConfirm('Restore Backup', html`Restore previous configuration for "<strong>${service.name}</strong>"? If it is running, it is restarted.`,
            // Destructive: the backup replaces the current override, then is deleted —
            // the settings in place are gone (core services/service.py, restore_service_backup).
            { destructive: true });
        if (!confirmed) return;

        try {
            // The core says whether the service was restarted on the restored settings.
            const result = await apiCallWithRetry(`/services/${service.systemd_unit}/properties/restore`, { method: 'POST' });
            if (showToast) showToast('success', 'Backup Restored', result?.message || `Previous config restored for ${service.name}`);
            if (addToHistory) addToHistory('systemd', `Restored backup: ${service.name}`, true);
            await this._loadServices();
        } catch (error) {
            handleError(error, 'Failed to restore backup');
        }
    }

    render() {
        return html`
            <div class="systemd-zone tab-zone">
                <div class="tab-title-container">
                    <h2>SYSTEMD CONFIGURATION</h2>
                </div>
                
                <ag-card-grid 
                    id="systemdGrid" 
                    class="systemd-grid" 
                    grid-class="systemd-grid-container"
                    skeleton-class="systemd-tile" 
                    empty-message="No services available"
                    .items=${this.services}
                    ?loading=${this.servicesFetch.loading}
                    error=${this.servicesFetch.error || ''}
                    .renderItem=${(service, index) => html`
                        <ag-systemd-card
                            .service=${service}
                            .delayIndex=${index}>
                        </ag-systemd-card>
                    `}
                    @edit-service=${this._handleEditService}
                    @remove-override=${this._handleRemoveOverride}
                    @restore-backup=${this._handleRestoreBackup}>
                </ag-card-grid>
            </div>
        `;
    }
}

customElements.define('ag-systemd-page', AgSystemdPage);
