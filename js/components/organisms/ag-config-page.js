/**
 * @module AgConfigPage
 * @description Page component for the Audio Services Configuration tab.
 * 
 * @element ag-config-page
 * 
 * @property {Array} services - Configurable services list
 * @property {string} selectedServiceId - The ID of the currently being edited service
 * @property {Object} schema - JSON schema for form-based editing
 * @property {Object} formData - Current structured configuration data
 * @property {string} rawContent - Raw text content of the config file
 * @property {string} configFormat - File format (conf, etc.)
 * @property {Array} backups - List of available backups for the selected service
 * 
 * @dependency ag-card-grid
 * @dependency ag-config-card
 * @dependency ag-config-editor
 */
import { LitElement, html } from 'lit';
import {
    apiGet,
    apiPost,
    showToast,
    showConfirm,
    handleError,
} from '../../common.js';
import { isGuest, isAdmin } from '../../auth.js';
import { FetchController } from '../../core/FetchController.js';
import { ContextConsumer } from 'https://cdn.jsdelivr.net/npm/@lit/context@1.1.0/+esm';
import { appContext } from '../../core/app-context.js';

export class AgConfigPage extends LitElement {
    static properties = {
        services: { type: Array },
        selectedServiceId: { type: String },
        schema: { type: Object },
        formData: { type: Object },
        rawContent: { type: String },
        configFormat: { type: String },
        backups: { type: Array },
        loading: { type: Boolean },
        _provisionableIds: { state: true },
        _outputs: { state: true },
        _librarySources: { state: true },
        _statusServices: { state: true },
        _showInitModal: { state: true },
    };

    constructor() {
        super();
        this.services = [];
        this.selectedServiceId = null;
        this.schema = null;
        this.formData = {};
        this.rawContent = '';
        this.configFormat = 'conf';
        this.backups = [];
        this._provisionableIds = [];
        this._outputs = [];
        this._librarySources = [];
        this._statusServices = [];
        this._showInitModal = false;
        this._boundHandleServiceMetrics = this._handleServiceMetricsSSE.bind(this);

        this.servicesFetch = new FetchController(this, {
            autoFetch: false,
            fetchFn: async () => {
                const [configServices, allServices] = await Promise.all([
                    apiGet('/audio_app_config/services'),
                    apiGet('/services/').catch(() => [])
                ]);
                // /services/ returns names without .service suffix — normalise both
                const statusMap = new Map([
                    ...allServices.map(s => [s.name, s.state]),
                    ...allServices.map(s => [`${s.name}.service`, s.state])
                ]);
                return configServices.map(s => ({
                    id: s.id,
                    name: s.label,
                    displayName: s.label,
                    path: s.config_file,
                    critical: s.critical,
                    audioOutput: s.audio_output || null,
                    systemdUnit: s.systemd_unit || null,
                    status: s.systemd_unit ? (statusMap.get(s.systemd_unit) || null) : null,
                    fileMtime: s.file_mtime || null,
                    backupCount: s.backup_count ?? 0,
                }));
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
        return this; // Light DOM for external CSS
    }

    connectedCallback() {
        super.connectedCallback();
        this._loadServices();
        if (window.EventEmitter) {
            window.EventEmitter.on('service-metrics-sse', this._boundHandleServiceMetrics);
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (window.EventEmitter) {
            window.EventEmitter.off('service-metrics-sse', this._boundHandleServiceMetrics);
        }
    }

    /** Update the status badge of a config tile when SSE fires a service state change. */
    _handleServiceMetricsSSE({ serviceId, metrics }) {
        if (!this.services?.length || !metrics?.state) return;
        const idx = this.services.findIndex(s =>
            s.systemdUnit === serviceId ||
            s.systemdUnit === `${serviceId}.service`
        );
        if (idx === -1) return;
        const updated = { ...this.services[idx], status: metrics.state };
        this.services = [...this.services.slice(0, idx), updated, ...this.services.slice(idx + 1)];
    }

    _handleTabChanged(data) {
        if (data.active !== 'config') {
            this._resetState();
        }
    }

    _loadServices() {
        this._loadAudioStatus();
        return this.servicesFetch.fetch();
    }

    /** Receives the /audio-stack/status payload from the provisioning panel. */
    _handleStatusLoaded(e) {
        this._storeAudioStatus(e.detail || {});
    }

    _storeAudioStatus(status) {
        this._outputs = status.outputs || [];
        this._librarySources = status.library_sources || [];
        this._statusServices = status.services || [];
        this._provisionableIds = this._statusServices.map(s => s.service_id);
    }

    /** Fetch the audio-stack status for the editor's guided mode (admin only). */
    async _loadAudioStatus() {
        if (!isAdmin()) return;
        try {
            this._storeAudioStatus(await apiGet('/audio-stack/status'));
        } catch (e) {
            // Non-fatal: the guided mode simply shows no detected outputs/sources.
        }
    }

    /** The pinned output of a service, from the last status load (or null). */
    _serviceOutputFor(serviceId) {
        return this._statusServices.find(s => s.service_id === serviceId)?.output || null;
    }

    /** A provision generated/changed configs — refresh the grid and the box state. */
    async _handleProvisioned() {
        await this._loadServices();
    }

    /** Whether the box is unconfigured: provisionable services exist, none AG-provisioned. */
    get _boxIsNew() {
        return this._statusServices.length > 0 && this._statusServices.every(s => !s.configured);
    }

    /** Whether a service carries the AG marker (from the last status load). */
    _serviceConfigured(serviceId) {
        return !!this._statusServices.find(s => s.service_id === serviceId)?.configured;
    }

    /** A guided apply/reset changed the config — reload the editor data + status. */
    async _handleGuidedChanged() {
        if (this.selectedServiceId) {
            await this._reloadServiceConfig(this.selectedServiceId);
        }
        await this._loadAudioStatus();
    }

    async _reloadServiceConfig(serviceId) {
        const [jsonConfig, rawConfig] = await Promise.all([
            apiGet(`/audio_app_config/${serviceId}/config?type=structured`),
            apiGet(`/audio_app_config/${serviceId}/config?type=raw`)
        ]);
        this.schema = jsonConfig.config_schema || jsonConfig.schema;
        this.formData = jsonConfig.data || {};
        this.rawContent = rawConfig.content || '';
        this.configFormat = rawConfig.format || jsonConfig.format || 'conf';
        await this._loadBackups(serviceId);
    }

    async _handleServiceSelect(e) {
        const serviceId = e.detail?.serviceId;
        if (!serviceId) return;

        this.loading = true;

        try {
            const [jsonConfig, rawConfig] = await Promise.all([
                apiGet(`/audio_app_config/${serviceId}/config?type=structured`),
                apiGet(`/audio_app_config/${serviceId}/config?type=raw`),
                this._loadAudioStatus()
            ]);

            this.schema = jsonConfig.config_schema || jsonConfig.schema;
            this.formData = jsonConfig.data || {};
            this.rawContent = rawConfig.content || '';
            this.configFormat = rawConfig.format || jsonConfig.format || 'conf';

            await this._loadBackups(serviceId);

            this.selectedServiceId = serviceId; // Setting this now mounts the editor with loaded data
            addToHistory('config', `Opened ${serviceId} configuration`, true);
        } catch (error) {
            handleError(error, `Failed to load ${serviceId} configuration`);
            this._resetState();
        } finally {
            this.loading = false;
        }
    }

    async _loadBackups(serviceId) {
        try {
            const data = await apiGet(`/audio_app_config/${serviceId}/backups`);
            this.backups = data.backups || [];
        } catch (error) {
            handleError(error, `Failed to load backups for ${serviceId}`);
            this.backups = [];
        }
    }

    async _handleSave(e) {
        if (!this.selectedServiceId) return;

        try {
            const restart = e.detail.restart !== false;
            const payload = e.detail.mode === 'raw' ? { content: e.detail.rawContent } : { data: e.detail.data };
            await apiPost(`/audio_app_config/${this.selectedServiceId}/config?restart=${restart}`, payload);

            showToast('success', 'Configuration Saved', 'Configuration updated successfully');
            addToHistory('config', `Saved ${this.selectedServiceId} configuration`, true);

            // Reload fresh data to ensure we have the latest
            const [jsonConfig, rawConfig] = await Promise.all([
                apiGet(`/audio_app_config/${this.selectedServiceId}/config?type=structured`),
                apiGet(`/audio_app_config/${this.selectedServiceId}/config?type=raw`)
            ]);

            this.schema = jsonConfig.config_schema || jsonConfig.schema;
            this.formData = jsonConfig.data || {};
            this.rawContent = rawConfig.content || '';
            this.configFormat = rawConfig.format || jsonConfig.format || 'conf';

            await this._loadBackups(this.selectedServiceId);

        } catch (error) {
            addToHistory('config', `Failed to save ${this.selectedServiceId} configuration`, false);
            showToast('error', 'Save Failed', error.message || 'Unknown error');
        }
    }

    async _handleRestore(e) {
        const filename = e.detail?.filename;
        if (!filename || !this.selectedServiceId) return;

        const confirmed = await showConfirm(
            'Restore Backup',
            `This will restore the configuration from ${filename}. Current configuration will be backed up. Continue?`
        );

        if (!confirmed) return;

        try {
            await apiPost(`/audio_app_config/${this.selectedServiceId}/backups/${filename}/restore`);
            showToast('success', 'Backup Restored', 'Configuration restored successfully');
            addToHistory('config', `Restored ${this.selectedServiceId} from ${filename}`, true);

            // Reload config
            const [jsonConfig, rawConfig] = await Promise.all([
                apiGet(`/audio_app_config/${this.selectedServiceId}/config?type=structured`),
                apiGet(`/audio_app_config/${this.selectedServiceId}/config?type=raw`)
            ]);

            this.schema = jsonConfig.config_schema || jsonConfig.schema;
            this.formData = jsonConfig.data || {};
            this.rawContent = rawConfig.content || '';
            this.configFormat = rawConfig.format || jsonConfig.format || 'conf';

            await this._loadBackups(this.selectedServiceId);

        } catch (error) {
            addToHistory('config', `Failed to restore ${this.selectedServiceId} from ${filename}`, false);
            handleError(error, `Failed to restore backup ${filename}`);
        }
    }

    _handleBack() {
        this._resetState();
    }

    _resetState() {
        this.selectedServiceId = null;
        this.schema = null;
        this.formData = {};
        this.rawContent = '';
        this.configFormat = 'conf';
        this.backups = [];
    }

    _showInfo() {
        if (!window.UIComponents || !window.UIComponents.InfoModal) return;

        const content = window.UIComponents.InfoModal.createContent(
            'The Configuration tab allows you to safely edit the actual configuration files of your audio services.',
            [
                { title: 'First-time setup', text: 'On a new box (administrators only), an <strong>Initialize audio stack</strong> panel auto-detects your DAC and music library and generates a minimal working configuration for MPD, AirPlay (shairport-sync) and UPnP (upmpdcli), all wired to the chosen output. It asks for your admin password before applying. Once at least one service is set up, the panel disappears.' },
                { title: 'Guided mode', text: 'For MPD, AirPlay and UPnP, the editor opens in a <strong>Guided</strong> view where you change the audio output or music library in a couple of clicks — only the changed setting is rewritten, the rest of your config is preserved. A <strong>Reset to default</strong> action there regenerates a minimal working config (admin password required; the current file is backed up first). Each MPD/AirPlay/UPnP tile shows a <strong>CONFIGURED</strong> badge once set up by AudioGravity.' },
                { title: 'Service Status', text: 'Each tile shows a <strong>RUNNING</strong> (green) or <strong>STOPPED</strong> (grey) badge reflecting the current systemd state of the service — so you know what is active before editing.' },
                { title: 'Form Mode', text: 'Edit common settings through a user-friendly interface with field descriptions and validation. Ideal for day-to-day configuration.' },
                { title: 'Expert Mode (Raw)', text: 'Directly edit the raw configuration file for advanced parameters not exposed in Form Mode. Includes syntax validation before save.' },
                { title: 'Audio Output', text: 'The badge on each tile shows the current active audio output device configured for that service.' },
                { title: 'Restart after save', text: 'Checked by default — the service is automatically restarted after saving to apply changes immediately. Uncheck to save the file without restarting (useful when making multiple edits or when a manual restart is preferred).' },
                { title: 'Preview Changes (Diff)', text: 'Appears when you have unsaved edits. In Raw mode: shows a unified diff with added lines in green and removed lines in red. In Form mode: shows a table of changed fields with before/after values.' },
                { title: 'Automatic Backups', text: 'Every save creates a timestamped backup. Use the <strong>Backups</strong> button to browse and restore any previous version — the current file is backed up first.' }
            ]
        );
        window.UIComponents.InfoModal.show('About Audio Services Configuration', content);
    }

    render() {
        return html`
            <div class="tab-title-container">
                <h2>AUDIO SERVICES CONFIGURATION</h2>
                <span class="badge info clickable" @click=${this._showInfo}>INFO</span>
            </div>
            
            ${this.selectedServiceId ? html`
                <ag-config-editor
                    .service=${this.services.find(s => s.id === this.selectedServiceId)}
                    .schema=${this.schema}
                    .formData=${this.formData}
                    .rawContent=${this.rawContent}
                    .configFormat=${this.configFormat}
                    .backups=${this.backups}
                    .isGuest=${!!(window.isGuest && isGuest())}
                    .guided=${isAdmin() && this._provisionableIds.includes(this.selectedServiceId)}
                    .outputs=${this._outputs}
                    .librarySources=${this._librarySources}
                    .serviceOutput=${this._serviceOutputFor(this.selectedServiceId)}
                    @back=${this._handleBack}
                    @save=${this._handleSave}
                    @restore=${this._handleRestore}
                    @guided-changed=${this._handleGuidedChanged}>
                </ag-config-editor>
            ` : html`
                ${isAdmin() && this._boxIsNew ? html`
                    <div class="config-init-cta">
                        <div class="config-init-cta-text">
                            <strong>Set up your audio stack</strong>
                            <span>Detect your DAC and music library, then generate a minimal working
                                configuration for MPD, AirPlay and UPnP.</span>
                        </div>
                        <button class="action-btn primary" @click=${() => { this._showInitModal = true; }}>
                            Configure audio stack
                        </button>
                    </div>
                ` : ''}
                ${this._showInitModal ? html`
                    <ag-modal title="First-time setup" ?show=${this._showInitModal} size="large"
                        .bodyTemplate=${html`
                            <ag-audio-stack-provisioning
                                @status-loaded=${this._handleStatusLoaded}
                                @provisioned=${this._handleProvisioned}>
                            </ag-audio-stack-provisioning>
                        `}
                        @modal-close=${() => { this._showInitModal = false; }}>
                    </ag-modal>
                ` : ''}
                <ag-card-grid
                    class="config-selector-grid"
                    grid-class="config-selector-grid-container"
                    skeleton-class="config-tile"
                    empty-message="No configurable services available"
                    .items=${this.services}
                    ?loading=${this.servicesFetch.loading}
                    error=${this.servicesFetch.error || ''}
                    .renderItem=${(service, index) => html`
                        <ag-config-card
                            style="display: block; height: 100%;"
                            .service=${service}
                            .delayIndex=${index}
                            ?provisionable=${this._provisionableIds.includes(service.id)}
                            ?configured=${this._serviceConfigured(service.id)}>
                        </ag-config-card>
                    `}
                    @edit-config=${this._handleServiceSelect}>
                </ag-card-grid>
            `}
        `;
    }
}

customElements.define('ag-config-page', AgConfigPage);
