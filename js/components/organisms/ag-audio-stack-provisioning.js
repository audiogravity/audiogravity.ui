/**
 * @module AgAudioStackProvisioning
 * @description Guided "Initialize audio stack" panel for the AUDIO SERVICES
 * CONFIGURATION tab. Loads detected outputs + library sources from the core,
 * lets the user pick the DAC (pre-selecting the recommended one) and a music
 * library (detected USB / network mount / manual path), then provisions minimal
 * configs for mpd/upmpdcli/shairport via POST /audio-stack/provision
 * (only-if-absent). Shows a per-service result report.
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
 * @dependency js/ag-icons.js
 * @dependency css/audio-stack.css
 */
import { LitElement, html, nothing } from 'lit';
import { apiGet, apiPost } from '../../api.js';
import { showPasswordConfirm } from '../../ui-helpers.js';
import {
    iconConnectorUsbA, iconHardDrive, iconWifi, iconFolder,
    iconCheck, iconClose, iconWarning, iconRadio, iconCircle, iconStar,
} from '../../ag-icons.js';

const _svg = (icon) => html`<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none"
    stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>`;

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

    /** Library payload fragment, or null when no usable library is chosen. */
    get _libraryPayload() {
        if (this._libraryChoice === 'manual') {
            const p = this._manualPath.trim();
            return p ? { music_directory: p } : null;
        }
        if (this._libraryChoice?.startsWith('src:')) {
            const src = this._librarySources[Number(this._libraryChoice.slice(4))];
            if (!src) return null;
            return src.kind === 'usb'
                ? { library_usb_uuid: src.uuid, library_fstype: src.fstype }
                : { music_directory: src.path };
        }
        return null;
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
                password,
            });
            this._state = 'success';
            this._result = result;
            this.dispatchEvent(new CustomEvent('provisioned', {
                detail: { results: result.results }, bubbles: true, composed: true,
            }));
        } catch (e) {
            this._state = 'error';
            this._errorMsg = e.detail || e.message || 'Provisioning failed';
        }
    }

    _libraryIcon(src) {
        if (src.kind === 'usb') return iconHardDrive;
        return src.fstype && ['cifs', 'nfs', 'nfs4', 'smb3'].includes(src.fstype) ? iconWifi : iconFolder;
    }

    render() {
        if (this._loading) {
            return html`<div class="ag-prov-panel"><div class="ag-prov-loading">Loading…</div></div>`;
        }
        if (this._error) {
            return html`<div class="ag-prov-panel">
                <div class="ag-prov-error">${_svg(iconWarning)} ${this._error}
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
                    ${this._outputs.length
                        ? html`<div class="ag-prov-list">${this._outputs.map(o => this._renderOutput(o))}</div>`
                        : html`<div class="ag-prov-empty">No audio outputs detected</div>`}
                </div>

                <div class="ag-prov-section">
                    <h4>Music library <span class="ag-prov-scope">MPD</span></h4>
                    <p class="ag-prov-hint">Used by MPD only. Pick a detected source or type an existing mount path —
                        a new network share (CIFS/NFS) must be mounted at the OS level first, then it appears here.</p>
                    <div class="ag-prov-list">
                        ${this._librarySources.map((s, i) => this._renderLibrarySource(s, i))}
                        ${this._renderManualLibrary()}
                    </div>
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
            </div>
        `;
    }

    _renderOutput(o) {
        const selected = o.hw === this._selectedOutputId;
        return html`
            <button class="ag-prov-card ${selected ? 'selected' : ''}"
                    @click=${() => { this._selectedOutputId = o.hw; }}>
                ${_svg(selected ? iconRadio : iconCircle)}
                <span class="ag-prov-card-icon">${_svg(o.is_usb_dac ? iconConnectorUsbA : iconHardDrive)}</span>
                <span class="ag-prov-card-label">${o.label}</span>
                ${o.recommended
                    ? html`<span class="ag-prov-rec" title="Recommended" aria-label="Recommended">${_svg(iconStar)}</span>`
                    : nothing}
            </button>
        `;
    }

    _renderLibrarySource(s, i) {
        const key = `src:${i}`;
        const selected = this._libraryChoice === key;
        const tag = s.kind === 'usb' ? 'USB' : (s.fstype || 'mount').toUpperCase();
        return html`
            <button class="ag-prov-card ${selected ? 'selected' : ''}"
                    @click=${() => { this._libraryChoice = key; }}>
                ${_svg(selected ? iconRadio : iconCircle)}
                <span class="ag-prov-card-icon">${_svg(this._libraryIcon(s))}</span>
                <span class="ag-prov-card-label">${s.label}</span>
                <span class="badge neutral">${tag}</span>
            </button>
        `;
    }

    _renderManualLibrary() {
        const selected = this._libraryChoice === 'manual';
        return html`
            <div class="ag-prov-card ${selected ? 'selected' : ''} ag-prov-manual">
                <button class="ag-prov-manual-radio" @click=${() => { this._libraryChoice = 'manual'; }}>
                    ${_svg(selected ? iconRadio : iconCircle)}
                    <span class="ag-prov-card-icon">${_svg(iconFolder)}</span>
                    <span class="ag-prov-card-label">Manual path</span>
                </button>
                <input class="ag-prov-input" type="text" placeholder="/mnt/musics"
                       .value=${this._manualPath}
                       @focus=${() => { this._libraryChoice = 'manual'; }}
                       @input=${(e) => { this._manualPath = e.target.value; }}>
            </div>
        `;
    }

    _renderResult() {
        if (this._state === 'error') {
            return html`<div class="ag-prov-result error">
                ${_svg(iconWarning)} <span>${this._errorMsg}</span></div>`;
        }
        if (this._state === 'success' && this._result) {
            return html`
                <div class="ag-prov-result success">
                    <div class="ag-prov-result-head">${_svg(iconCheck)} Audio stack initialized</div>
                    <ul class="ag-prov-result-list">
                        ${(this._result.results || []).map(r => html`
                            <li class="ag-prov-result-item ${r.status === 'error' ? 'error' : 'ok'}">
                                ${_svg(r.status === 'error' ? iconClose : iconCheck)}
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
