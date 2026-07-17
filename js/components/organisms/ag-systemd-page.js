import { LitElement, html } from 'lit';
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
    escapeHtml
} from '../../common.js';
import { FetchController } from '../../core/FetchController.js';
import { ContextConsumer } from 'https://cdn.jsdelivr.net/npm/@lit/context@1.1.0/+esm';
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
                let errorContent = '';
                if (validationError.status === 422 && validationError.validationErrors) {
                    errorContent = '<div class="validation-section validation-errors">';
                    errorContent += '<h4 class="validation-section-title">❌ Invalid Input Values</h4>';
                    errorContent += '<ul class="validation-list">';
                    validationError.validationErrors.forEach(err => {
                        const field = err.loc ? err.loc.slice(1).join('.') : 'unknown';
                        const fieldName = field.replace('properties.', '').replace(/_/g, ' ').toUpperCase();
                        errorContent += `<li class="validation-error"><strong>${escapeHtml(fieldName)}:</strong> ${escapeHtml(err.msg || 'Invalid value')}</li>`;
                    });
                    errorContent += '</ul></div>';
                } else {
                    const errorMsg = validationError.detail || validationError.message || 'Unknown validation error';
                    errorContent = `<div class="validation-section validation-errors"><h4 class="validation-section-title">❌ Validation Failed</h4><p class="validation-error"><strong>${escapeHtml(errorMsg)}</strong></p></div>`;
                }

                if (showConfirm) showConfirm('❌ Validation Error', `<div class="validation-results">${errorContent}</div>`, { isInfo: true });
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
            return false;
        } finally {
            if (editor) editor.isSaving = false;
        }
    }

    async _handleRemoveOverride(e) {
        const serviceId = e.detail.serviceId;
        const service = this.services.find(s => s.id === serviceId);
        if (!service) return;

        const confirmed = await showConfirm('Remove Override', html`Restore default settings for "<strong>${service.name}</strong>"?`);
        if (!confirmed) return;

        try {
            await apiCall(`/services/${service.systemd_unit}/properties/override`, { method: 'DELETE' });
            if (showToast) showToast('success', 'Configuration Restored', `Override removed for ${service.name}`);
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

        const confirmed = await showConfirm('Restore Backup', html`Restore previous configuration for "<strong>${service.name}</strong>"?`);
        if (!confirmed) return;

        try {
            await apiCallWithRetry(`/services/${service.systemd_unit}/properties/restore`, { method: 'POST' });
            if (showToast) showToast('success', 'Backup Restored', `Previous config restored for ${service.name}`);
            if (addToHistory) addToHistory('systemd', `Restored backup: ${service.name}`, true);
            await this._loadServices();
        } catch (error) {
            handleError(error, 'Failed to restore backup');
        }
    }

    _showInfo() {
        const infoHtml = `
            <div class="lh-16">
                <p class="mb-md text-primary-color" style="font-size: var(--font-size-md);">The Systemd tab allows low-level operating system tuning for audio-critical services using systemd's robust <em>"drop-in"</em> architecture.</p>

                <h4 class="mb-sm text-primary-color" style="font-weight:600; letter-spacing: 0.5px;">CORE CAPABILITIES</h4>
                <ul class="pl-20 list-disc text-secondary-color mb-md">
                    <li class="mb-sm"><strong class="text-primary-color">CPU Affinity (Taskset)</strong>: Pin services to specific CPU cores. By isolating audio logic from background system tasks, you drastically reduce context switching and jitter.</li>
                    <li class="mb-sm"><strong class="text-primary-color">RT Scheduling (Real-Time)</strong>: Assign Real-Time FIFO or RR scheduling policies and high priorities (1 to 99) to force the kernel to guarantee immediate CPU scheduling for audio rendering.</li>
                    <li class="mb-sm"><strong class="text-primary-color">CPU Weight</strong>: Adjust the cgroup v2 CPU scheduler weight (1–10 000, default 100). A value of 1 000 gives a service 10× more CPU time than a default process during contention — ideal for audio daemons.</li>
                    <li class="mb-sm"><strong class="text-primary-color">I/O Priority</strong>: Adjust Disk/Network I/O latency classes to ensure audio buffers never under-run while writing logs or reading network packets.</li>
                    <li class="mb-sm"><strong class="text-primary-color">OOM Score Adjust</strong>: Bias the kernel's Out-Of-Memory killer score. A negative value (e.g. −500) makes the service much less likely to be killed under memory pressure, protecting continuous audio playback.</li>
                    <li class="mb-sm"><strong class="text-primary-color">Process Limits</strong>: Overrides properly synchronize with <code>LimitRTPRIO</code>, <code>LimitMEMLOCK</code>, and <code>LimitNOFILE</code> so your elevated Real-Time requests are honored by the OS without permission lockouts.</li>
                </ul>

                <h4 class="mb-sm text-primary-color" style="font-weight:600; letter-spacing: 0.5px;">RT PRESETS</h4>
                <ul class="pl-20 list-disc text-secondary-color mb-md">
                    <li class="mb-sm"><strong class="text-primary-color">Audio Optimized</strong>: One click pre-fills the editor with a battle-tested RT configuration — SCHED_FIFO 80, LimitRTPRIO 99, LimitMEMLOCK infinity, I/O Realtime, OOMScoreAdjust −500, CPUWeight 1 000. Review the values before saving.</li>
                    <li class="mb-sm"><strong class="text-primary-color">Reset to Defaults</strong>: Clears all fields so the drop-in inherits the distribution defaults after save.</li>
                </ul>

                <h4 class="mb-sm text-primary-color" style="font-weight:600; letter-spacing: 0.5px;">DIFF PREVIEW</h4>
                <ul class="pl-20 list-disc text-secondary-color mb-md">
                    <li class="mb-sm">Before any change is applied, a unified diff of the generated <code>override.conf</code> is displayed — lines removed in red, lines added in green. You can cancel and adjust before committing.</li>
                </ul>

                <h4 class="mb-sm text-primary-color" style="font-weight:600; letter-spacing: 0.5px;">SAFETY & RECOVERY</h4>
                <ul class="pl-20 list-disc text-secondary-color">
                    <li class="mb-sm"><strong class="text-primary-color">Drop-in Overrides</strong>: The native distribution <code>.service</code> files are <strong>never modified</strong>. All custom properties are safely kept in an isolated <code>.d/override.conf</code> configuration tree.</li>
                    <li class="mb-sm"><strong class="text-primary-color">Automatic Backups</strong>: When overwriting an existing drop-in, the previous state is automatically backed up, allowing you to quickly <em>"Restore Backup"</em> if the new tuning proves unstable.</li>
                    <li class="mb-sm"><strong class="text-primary-color">Absolute Reversion</strong>: If a configuration breaks service startup, simply click <em>"Remove Override"</em>. Audiogravi<sup>ty</sup> will delete the drop-in file and instantly rollback the service to its original factory behavior.</li>
                </ul>
            </div>
        `;
        if (showConfirm) showConfirm('Systemd Ecosystem & Tuning', infoHtml, { isInfo: true });
    }

    render() {
        return html`
            <div class="systemd-zone tab-zone">
                <div class="tab-title-container">
                    <h2>SYSTEMD CONFIGURATION</h2>
                    <span class="badge info clickable" @click=${this._showInfo}>INFO</span>
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
