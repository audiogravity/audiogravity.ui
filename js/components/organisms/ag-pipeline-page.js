import { LitElement, html, css } from 'lit';
import { AppState, EventEmitter, showToast } from '../../common.js';
import { apiGet, apiPost } from '../../api.js';
import { isGuest } from '../../auth.js';
import { validateTopologyConfig, showValidationModal } from '../../validation.js';
// ag-mobile-pipeline est chargé dynamiquement via lazyLoadTabContent (common.js)

export class AgPipelinePage extends LitElement {
    static properties = {
        _isActive: { type: Boolean, state: true },
        _eventsCollapsed: { type: Boolean, state: true },
        _isMobile: { type: Boolean, state: true },
    };

    static styles = css`
        :host {
            display: block;
            width: 100%;
            box-sizing: border-box;
        }
    `;

    constructor() {
        super();
        this._isActive = false;
        this._eventsCollapsed = false;
        this._isMobile = window.matchMedia('(max-width: 768px)').matches;
        this._handleTabChange = this._handleTabChange.bind(this);
        this._handleResize = () => {
            this._isMobile = window.matchMedia('(max-width: 768px)').matches;
        };
    }

    createRenderRoot() {
        return this; // Light DOM for layout consistency with other pages
    }

    connectedCallback() {
        super.connectedCallback();

        const currentTab = window.location.hash.slice(1) || (AppState ? AppState.currentTab : '');
        this._isActive = (currentTab === 'pipeline');

        if (EventEmitter) {
            EventEmitter.on('tab-changed', this._handleTabChange);
        }
        window.addEventListener('resize', this._handleResize);

        const topoModal = document.getElementById('agTopologyConfigModal');
        if (topoModal) {
            this._handleTopologyConfigSave = this._handleTopologyConfigSaveRequest.bind(this);
            topoModal.addEventListener('save-request', this._handleTopologyConfigSave);
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (EventEmitter) {
            EventEmitter.off('tab-changed', this._handleTabChange);
        }
        window.removeEventListener('resize', this._handleResize);

        const topoModal = document.getElementById('agTopologyConfigModal');
        if (topoModal && this._handleTopologyConfigSave) {
            topoModal.removeEventListener('save-request', this._handleTopologyConfigSave);
        }
    }

    _handleTabChange(data) {
        const wasActive = this._isActive;
        const tabId = data.active;
        this._isActive = (tabId === 'pipeline');

        if (this._isActive && !wasActive) {
            this.requestUpdate();
            import('../../history.js').then(m => m.renderHistory('audio_pipeline'));
        }
    }

    async _openTopologyConfigModal() {
        const modal = document.getElementById('agTopologyConfigModal');
        if (!modal) return;

        try {
            const config = await apiGet('/audio_pipeline/topology/view');
            modal.configText = JSON.stringify(config, null, 2);
            modal.modalTitle = 'Topology Configuration';
            modal.filename = 'audio-topology.json';
            modal.isGuest = isGuest();
            modal.allowFileTransfer = true;  // enable Download / Upload for the topology file
            modal.isOpen = true;
        } catch (error) {
            console.error('[Topology Modal] Failed to load config:', error);
            showToast('error', 'Load Failed', 'Failed to load audio-topology.json');
        }
    }

    async _handleTopologyConfigSaveRequest(e) {
        const newConfig = e.detail.config;
        const modal = document.getElementById('agTopologyConfigModal');
        if (!modal) return;

        modal._isLoading = true;

        // Validate structure and link integrity before persisting (SPEC §10 topology).
        // A validation outage must never block a save, so a failed call falls through.
        let validation = null;
        try {
            validation = await validateTopologyConfig(newConfig);
        } catch (error) {
            console.warn('[Topology Modal] Validation unavailable, saving without it:', error);
        }

        // Structural errors block the save and are surfaced to the user.
        if (validation && !validation.valid) {
            modal._isLoading = false;
            modal._validationMessage = '';  // clear the modal's optimistic "Saving..." label
            showValidationModal(validation);
            return;
        }

        // Non-blocking warnings (broken links, unmappable connectors): confirm first.
        if (validation && validation.warnings && validation.warnings.length > 0) {
            modal._isLoading = false;
            modal._validationMessage = '';  // clear the modal's optimistic "Saving..." label
            showValidationModal(validation, () => this._persistTopology(newConfig, modal));
            return;
        }

        await this._persistTopology(newConfig, modal);
    }

    async _persistTopology(newConfig, modal) {
        try {
            modal._isLoading = true;
            showToast('info', 'Saving', 'Saving audio-topology.json...');

            const result = await apiPost('/audio_pipeline/topology/save', newConfig);

            if (result.success) {
                showToast('success', 'Saved', 'Topology saved and reloaded');
                modal.isOpen = false;
            } else {
                showToast('error', 'Save Failed', result.message);
            }
        } catch (error) {
            console.error('[Topology Modal] Save error:', error);
            showToast('error', 'Save Failed', error.message || 'Unknown error');
        } finally {
            modal._isLoading = false;
        }
    }

    _showInfo() {
        if (!window.UIComponents || !window.UIComponents.InfoModal) return;

        const content = window.UIComponents.InfoModal.createContent(
            'Real-time visualization of your Hi-Fi signal chain, built from the audio topology configuration.',
            [
                { title: 'Controller nodes', text: 'Control apps on remote devices (Roon Remote, JPlay, etc.). Links show which streaming service they are driving.' },
                { title: 'Server nodes', text: 'Music servers such as Roon Core. Shown when actively serving a stream.' },
                { title: 'Streamer nodes', text: 'The local audio computer. Displays active services (Roon Bridge, AirPlay, MPD…) with their status.' },
                { title: 'Converter / Amplifier / Output', text: 'Physical devices in the signal chain: DAC, integrated amp, speakers.' },
                { title: 'Audio links', text: 'Animated particles indicate an active audio stream. Orange glow = signal flowing.' },
                { title: 'Control links', text: 'Dashed amber lines show control flow from a controller to its target service.' },
                { title: 'Bit-perfect', text: 'Green links indicate lossless transmission with no sample-rate conversion.' },
                { title: 'Toggles', text: 'Use CONTROLLERS, STORAGE and OUTPUTS buttons to show or hide device groups.' },
                { title: 'Mobile view', text: 'On small screens, a simplified Now Playing view is shown with per-stream output steering (USB / Optical).' },
            ]
        );
        window.UIComponents.InfoModal.show('About Audio Pipeline', content);
    }

    render() {
        if (!this._isActive) return html``;

        const gridStyle = this._eventsCollapsed ? 'grid-template-columns: 1fr 32px' : '';

        if (this._isMobile) {
            return html`<ag-mobile-pipeline></ag-mobile-pipeline>`;
        }

        return html`
            <div class="content-grid" style="${gridStyle}">
                <!-- Visualizer Zone -->
                <div class="pipeline-zone tab-zone">
                    <div class="tab-title-container">
                        <h2>AUDIO DSP PIPELINE</h2>
                        <span class="badge info clickable" @click=${this._showInfo}>INFO</span>
                        <ag-badge type="info" label="LIVE" pulse></ag-badge>
                        ${!isGuest() ? html`<span class="badge warning clickable" style="margin-left: auto" @click=${this._openTopologyConfigModal}>CONFIG</span>` : ''}
                    </div>

                    <ag-audio-pipeline></ag-audio-pipeline>
                </div>

                <!-- Events Zone -->
                <ag-history-panel
                    type="audio_pipeline"
                    title="AUDIO EVENTS"
                    collapsible
                    @panel-collapse=${() => { this._eventsCollapsed = true; }}
                    @panel-expand=${() => { this._eventsCollapsed = false; }}>
                </ag-history-panel>
            </div>
        `;
    }
}

customElements.define('ag-pipeline-page', AgPipelinePage);
