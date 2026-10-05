import { LitElement, html, css } from 'lit';
import { getUserFriendlyError } from '../../ui-helpers.js';
import { AppState, EventEmitter, showToast } from '../../common.js';
import { apiGet, apiPost } from '../../api.js';
import { isGuest } from '../../auth.js';
import { validateTopologyConfig, showValidationModal } from '../../validation.js';
import '../atoms/ag-badge.js';
import './ag-history-panel.js';
// ag-audio-pipeline and ag-mobile-pipeline load with the tab (lazyModules, common.js).
// css/pipeline.css lays out the right-hand column of the computer view.

export class AgPipelinePage extends LitElement {
    static properties = {
        _isActive: { type: Boolean, state: true },
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
            showToast('error', 'Save Failed', getUserFriendlyError(error));
        } finally {
            modal._isLoading = false;
        }
    }

    render() {
        if (!this._isActive) return html``;

        if (this._isMobile) {
            // The chain drawn below is only as good as the description of your
            // hi-fi it is drawn from, and that description had no way in from a
            // phone: CONFIG lived in the desktop branch alone. A box whose chain
            // shows nothing would then send its owner to a button that does not
            // exist on the device in their hand.
            return html`
                <div class="amp-mobile-view">
                    <div class="pipeline-zone tab-zone amp-mobile-bar">
                        <div class="tab-title-container">
                            <h2>AUDIO PIPELINE</h2>
                            ${!isGuest() ? html`
                                <span class="badge warning clickable"
                                      @click=${this._openTopologyConfigModal}>CONFIG</span>
                            ` : ''}
                        </div>
                    </div>
                    <ag-mobile-pipeline></ag-mobile-pipeline>
                </div>
            `;
        }

        // Beside the diagram, the phone's reading of the same chain. Opened whole, the
        // diagram draws its labels a few pixels high; the list says at a glance what
        // plays and through what, and the diagram stays there to explore. The events
        // follow under the list. They could fold into a 32 px strip, which now would
        // fold the list with them: they no longer fold.
        return html`
            <div class="content-grid">
                <!-- Visualizer Zone -->
                <div class="pipeline-zone tab-zone">
                    <div class="tab-title-container">
                        <h2>AUDIO PIPELINE</h2>
                        <ag-badge type="info" label="LIVE" pulse></ag-badge>
                        ${!isGuest() ? html`<span class="badge warning clickable" style="margin-left: auto" @click=${this._openTopologyConfigModal}>CONFIG</span>` : ''}
                    </div>

                    <ag-audio-pipeline></ag-audio-pipeline>
                </div>

                <div class="pipeline-side">
                    <ag-mobile-pipeline></ag-mobile-pipeline>
                    <ag-history-panel type="audio_pipeline" heading="AUDIO EVENTS"></ag-history-panel>
                </div>
            </div>
        `;
    }
}

customElements.define('ag-pipeline-page', AgPipelinePage);
