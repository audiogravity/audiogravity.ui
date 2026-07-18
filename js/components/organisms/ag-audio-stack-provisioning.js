/**
 * @module AgAudioStackProvisioning
 * @description Guided "Initialize audio stack" panel for the AUDIO SERVICES
 * CONFIGURATION tab. Loads detected outputs + library sources from the core,
 * lets the user pick the DAC (pre-selecting the recommended one) and a music
 * library (detected USB / network mount / manual path), then provisions minimal
 * configs for mpd/upmpdcli/shairport via POST /audio-stack/provision. Shows a
 * per-service result report.
 *
 * The output/library pickers are delegated to the reusable molecules
 * ag-prov-output-picker / ag-prov-library-picker (shared with the guided config
 * editor and the INITIALIZE-all dialog).
 *
 * Admin-only: the panel is mounted by ag-config-page only for administrators,
 * and the initial provision re-authenticates with the admin password
 * (showPasswordConfirm) — the backend rejects a wrong/missing password.
 *
 * Single status fetch lives here: on load it re-emits the status via
 * `status-loaded` so the parent page can flag which service tiles are
 * provisionable and reuse the pinned output for per-tile regeneration.
 *
 * @element ag-audio-stack-provisioning
 * @fires status-loaded - Bubbles. detail: the /audio-stack/status payload
 * @fires provisioned - Bubbles. detail: { results } — a successful provision (parent should refresh)
 * @dependency js/api.js
 * @dependency js/ui-helpers.js
 * @dependency js/components/utils-lit.js
 * @dependency js/components/molecules/ag-prov-output-picker.js
 * @dependency js/components/molecules/ag-prov-library-picker.js
 * @dependency css/audio-stack.css
 */
import { LitElement, html, nothing } from 'lit';
import { apiGet, apiPost } from '../../api.js';
import { showPasswordConfirm } from '../../ui-helpers.js';
import { svgIcon } from '../utils-lit.js';
import { iconCheck, iconClose, iconWarning } from '../../ag-icons.js';
import '../molecules/ag-prov-output-picker.js';
import '../molecules/ag-library-scan-indicator.js';
import { AgProvLibraryPicker } from '../molecules/ag-prov-library-picker.js';

export class AgAudioStackProvisioning extends LitElement {
    static properties = {
        _loading: { state: true },
        _error: { state: true },
        _outputs: { state: true },
        _librarySources: { state: true },
        _selectedOutputId: { state: true },   // hw string of the chosen output candidate
        _libraryChoice: { state: true },       // 'src:<idx>' for a detected source, or 'manual'
        _manualPath: { state: true },
        _state: { state: true },               // 'idle' | 'provisioning' | 'success' | 'error'
        _result: { state: true },
        _errorMsg: { state: true },
    };

    constructor() {
        super();
        this._loading = true;
        this._error = '';
        this._outputs = [];
        this._librarySources = [];
        this._selectedOutputId = null;
        this._libraryChoice = null;
        this._manualPath = '';
        this._state = 'idle';
        this._result = null;
        this._errorMsg = '';
    }

    createRenderRoot() {
        return this; // Light DOM (global theme CSS)
    }

    connectedCallback() {
        super.connectedCallback();
        this._loadStatus();
    }

    async _loadStatus() {
        this._loading = true;
        this._error = '';
        try {
            const status = await apiGet('/audio-stack/status');
            this._outputs = status.outputs || [];
            this._librarySources = status.library_sources || [];
            // Pre-select the recommended output, else the pinned one.
            const recommended = this._outputs.find(o => o.recommended);
            const pinned = status.selected_output;
            this._selectedOutputId =
                (recommended && recommended.hw)
                || (pinned && this._outputs.find(o =>
                    o.usb_id === pinned.usb_id && o.card_name === pinned.card_name)?.hw)
                || (this._outputs[0]?.hw ?? null);
            // Bubble the full status so the page can configure the service tiles.
            this.dispatchEvent(new CustomEvent('status-loaded', {
                detail: status, bubbles: true, composed: true,
            }));
        } catch (e) {
            this._error = e.detail || e.message || 'Failed to load audio stack status';
        } finally {
            this._loading = false;
        }
    }

    get _selectedOutput() {
        return this._outputs.find(o => o.hw === this._selectedOutputId) || null;
    }

    /**
     * Re-fetch the detected sources/outputs WITHOUT the full-load side effects:
     * no `_loading` flip (which would blank the panel and collapse the embedded
     * form) and no `_selectedOutputId` reset (which would discard the user's DAC
     * pick). A positional `src:<idx>` selection is re-anchored by identity so it
     * can't silently shift onto a different source.
     * @returns {Promise<void>}
     */
    async _refreshSources() {
        try {
            const previous = this._librarySources;
            const status = await apiGet('/audio-stack/status');
            this._outputs = status.outputs || [];
            this._librarySources = status.library_sources || [];
            this._libraryChoice = AgProvLibraryPicker.reindexChoice(
                this._libraryChoice, previous, this._librarySources);
        } catch (e) {
            // Keep the current view on a transient failure.
            console.error('[provisioning] source refresh failed:', e);
        }
    }

    /**
     * A share was just mounted from the embedded form: refresh the detected
     * sources and select the new mountpoint via the manual-path choice (which
     * is index-independent).
     * @param {{mountpoint: string}} mount - The created mount (already live).
     */
    async _onMountCreated(mount) {
        await this._refreshSources();
        if (mount?.mountpoint) {
            this._libraryChoice = 'manual';
            this._manualPath = mount.mountpoint;
        }
    }

    /**
     * A share was just removed from the embedded form: drop a manual selection
     * pointing at it, then refresh (which re-anchors any card selection and
     * drops the removed source's card).
     * @param {{mountpoint?: string}} detail - The removed mount's mountpoint.
     */
    async _onMountRemoved({ mountpoint } = {}) {
        ({ choice: this._libraryChoice, manualPath: this._manualPath } =
            AgProvLibraryPicker.clearRemovedManual(this._libraryChoice, this._manualPath, mountpoint));
        await this._refreshSources();
    }

    /** Library payload fragment, or null when no usable library is chosen. */
    get _libraryPayload() {
        return AgProvLibraryPicker.payloadFor(this._libraryChoice, this._manualPath, this._librarySources);
    }

    get _canProvision() {
        return !!this._selectedOutput && !!this._libraryPayload && this._state !== 'provisioning';
    }

    /** Why INITIALIZE is disabled — shown as an inline hint next to the button. */
    get _disabledReason() {
        if (!this._selectedOutput) return 'Select an audio output above to enable.';
        if (!this._libraryPayload) return 'Select a music library above to enable.';
        return '';
    }

    async _provision() {
        const out = this._selectedOutput;
        const lib = this._libraryPayload;
        if (!out || !lib) return;

        // Re-authenticate the admin before applying the initial configuration.
        const password = await showPasswordConfirm(
            'Initialize audio stack',
            'This generates minimal configurations for the audio services and wires '
            + 'them to the selected output. Enter your admin password to confirm.'
        );
        if (!password) return;

        this._state = 'provisioning';
        this._result = null;
        this._errorMsg = '';
        try {
            const result = await apiPost('/audio-stack/provision', {
                card_name: out.card_name,
                usb_id: out.usb_id ?? null,
                device_id: out.device_id ?? 0,
                ...lib,
                admin_password: password,
            });
            this._state = 'success';
            this._result = result;
            this.dispatchEvent(new CustomEvent('provisioned', {
                detail: { results: result.results }, bubbles: true, composed: true,
            }));
            // Re-fetch the status so the pinned output + service tiles refresh and
            // `status-loaded` is re-emitted — otherwise the parent page keeps a
            // stale selected-output after INITIALIZE (would show "No output selected").
            await this._loadStatus();
            // INITIALIZE generated mpd.conf and triggered a rescan — surface it
            // on the indicator that _loadStatus just (re)rendered. Must run AFTER
            // _loadStatus: its `_loading` flip tears down and rebuilds the panel
            // (and the indicator with it), which would discard an earlier start().
            if (typeof this.querySelector === 'function') {
                await this.updateComplete;
                this.querySelector('ag-library-scan-indicator')?.start();
            }
        } catch (e) {
            this._state = 'error';
            this._errorMsg = e.detail || e.message || 'Provisioning failed';
        }
    }

    render() {
        if (this._loading) {
            return html`<div class="ag-prov-panel"><div class="ag-prov-loading">Loading…</div></div>`;
        }
        if (this._error) {
            return html`<div class="ag-prov-panel">
                <div class="ag-prov-error">${svgIcon(iconWarning)} ${this._error}
                    <button class="action-btn compact secondary" @click=${this._loadStatus}>RETRY</button>
                </div></div>`;
        }

        return html`
            <div class="ag-prov-panel">
                <div class="ag-prov-head">
                    <h3>Initialize audio stack</h3>
                    <p class="ag-prov-sub">Detect your DAC and music library, then generate a minimal
                        working configuration for the audio services.</p>
                </div>

                <div class="ag-prov-section">
                    <h4>Audio output</h4>
                    <p class="ag-prov-hint">Wired into MPD and AirPlay (shairport-sync). To use a different output
                        per service, edit that service's config below after initializing.</p>
                    <ag-prov-output-picker .outputs=${this._outputs} .selected=${this._selectedOutputId}
                        @output-select=${(e) => { this._selectedOutputId = e.detail.output.hw; }}></ag-prov-output-picker>
                </div>

                <div class="ag-prov-section">
                    <h4>Music library <span class="ag-prov-scope">MPD</span></h4>
                    <p class="ag-prov-hint">Used by MPD only. Pick a detected source, type an existing mount path,
                        or add a NAS share below — it is mounted and tested on the spot.</p>
                    <ag-prov-library-picker .sources=${this._librarySources} .choice=${this._libraryChoice}
                        .manualPath=${this._manualPath}
                        @library-change=${(e) => { this._libraryChoice = e.detail.choice; this._manualPath = e.detail.manualPath; }}
                        @mount-created=${(e) => this._onMountCreated(e.detail.mount)}
                        @mount-removed=${(e) => this._onMountRemoved(e.detail)}></ag-prov-library-picker>
                </div>

                <div class="ag-prov-actions">
                    <button class="tile-action-btn" ?disabled=${!this._canProvision} @click=${this._provision}>
                        ${this._state === 'provisioning' ? 'INITIALIZING…' : 'INITIALIZE'}
                    </button>
                    ${this._state === 'idle' && this._disabledReason
                        ? html`<span class="ag-prov-hint-inline">${this._disabledReason}</span>`
                        : nothing}
                </div>

                ${this._renderResult()}
                <ag-library-scan-indicator></ag-library-scan-indicator>
            </div>
        `;
    }

    _renderResult() {
        if (this._state === 'error') {
            return html`<div class="ag-prov-result error">
                ${svgIcon(iconWarning)} <span>${this._errorMsg}</span></div>`;
        }
        if (this._state === 'success' && this._result) {
            return html`
                <div class="ag-prov-result success">
                    <div class="ag-prov-result-head">${svgIcon(iconCheck)} Audio stack initialized</div>
                    <ul class="ag-prov-result-list">
                        ${(this._result.results || []).map(r => html`
                            <li class="ag-prov-result-item ${r.status === 'error' ? 'error' : 'ok'}">
                                ${svgIcon(r.status === 'error' ? iconClose : iconCheck)}
                                <span class="ag-prov-result-svc">${r.service_id}</span>
                                <span class="ag-prov-result-status">${r.status}</span>
                                ${r.error ? html`<span class="ag-prov-result-err">${r.error}</span>` : nothing}
                            </li>
                        `)}
                    </ul>
                </div>`;
        }
        return nothing;
    }
}

customElements.define('ag-audio-stack-provisioning', AgAudioStackProvisioning);
