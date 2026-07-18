/**
 * @module AgGuidedConfig
 * @description Guided ("zero-conf") editor for a provisionable audio service,
 * shown as the default mode of ag-config-editor. Presents package-specific,
 * hardware-aware fields (audio output, music library) driven by a per-service
 * descriptor, and applies them as TARGETED patches (POST /audio-stack/output,
 * /audio-stack/library) that preserve the rest of the config. Also offers a
 * "Reset to default" action that regenerates a minimal working config
 * (POST /audio-stack/provision, admin password required).
 *
 * The descriptor (GUIDED_FIELDS) is intentionally data-driven so new fields can
 * be added per package without reworking the component.
 *
 * @element ag-guided-config
 * @prop {string} serviceId - Provisionable service id (mpd | airplay | upmpdcli).
 * @prop {Array} outputs - Detected output candidates (from /audio-stack/status).
 * @prop {Array} librarySources - Detected library sources.
 * @prop {Object} serviceOutput - The service's currently pinned output, or null.
 * @fires guided-changed - Bubbles, after a successful apply or reset (parent refreshes).
 * @dependency js/api.js
 * @dependency js/ui-helpers.js
 * @dependency js/components/utils-lit.js
 * @dependency js/components/molecules/ag-prov-output-picker.js
 * @dependency js/components/molecules/ag-prov-library-picker.js
 * @dependency css/audio-stack.css
 */
import { LitElement, html, nothing } from 'lit';
import { apiPost } from '../../api.js';
import { showToast, handleError, showPasswordConfirm } from '../../ui-helpers.js';
import { svgIcon } from '../utils-lit.js';
import { iconRefresh } from '../../ag-icons.js';
import '../molecules/ag-prov-output-picker.js';
import '../molecules/ag-prov-library-picker.js';
import '../molecules/ag-library-scan-indicator.js';
import { AgProvLibraryPicker } from '../molecules/ag-prov-library-picker.js';

/**
 * Guided fields per provisionable service. Data-driven so it can grow (a future
 * "name" field for airplay/upmpdcli lands here once a targeted patch exists).
 */
export const GUIDED_FIELDS = {
    mpd: ['output', 'library'],
    airplay: ['output'],
    upmpdcli: [],
};

export class AgGuidedConfig extends LitElement {
    static properties = {
        serviceId: { type: String },
        outputs: { type: Array },
        librarySources: { type: Array },
        serviceOutput: { type: Object },
        _selectedOutputId: { state: true },
        _libraryChoice: { state: true },
        _manualPath: { state: true },
        _busy: { state: true },
    };

    constructor() {
        super();
        this.serviceId = null;
        this.outputs = [];
        this.librarySources = [];
        this.serviceOutput = null;
        this._selectedOutputId = null;
        this._libraryChoice = null;
        this._manualPath = '';
        this._busy = false;
    }

    createRenderRoot() {
        return this; // Light DOM (global theme + audio-stack.css)
    }

    /** Fields configured for the current service. */
    get _fields() {
        return GUIDED_FIELDS[this.serviceId] || [];
    }

    /** Pre-select the pinned output, and re-anchor the library selection when
     * the parent re-fetches the sources under us. */
    willUpdate(changed) {
        if ((changed.has('outputs') || changed.has('serviceOutput')) && this._selectedOutputId == null) {
            this._selectedOutputId = this._initialOutputId();
        }
        // librarySources is parent-owned; when it is re-fetched (e.g. after a
        // share is removed) a positional `src:<idx>` selection would silently
        // shift onto a different source. Re-anchor it by identity.
        if (changed.has('librarySources') && this._libraryChoice?.startsWith('src:')) {
            this._libraryChoice = AgProvLibraryPicker.reindexChoice(
                this._libraryChoice, changed.get('librarySources') || [], this.librarySources);
        }
    }

    _initialOutputId() {
        const pin = this.serviceOutput;
        const match = pin && this.outputs.find(o => o.usb_id === pin.usb_id && o.card_name === pin.card_name);
        return match?.hw || this.outputs.find(o => o.recommended)?.hw || this.outputs[0]?.hw || null;
    }

    get _selectedOutput() {
        return this.outputs.find(o => o.hw === this._selectedOutputId) || null;
    }

    /** True when the selected output differs from the service's current pin. */
    get _outputChanged() {
        const o = this._selectedOutput;
        const pin = this.serviceOutput;
        if (!o) return false;
        return !pin
            || o.usb_id !== pin.usb_id
            || o.card_name !== pin.card_name
            || (o.device_id ?? 0) !== (pin.device_id ?? 0);
    }

    get _libraryPayload() {
        return AgProvLibraryPicker.payloadFor(this._libraryChoice, this._manualPath, this.librarySources);
    }

    /**
     * A share was just mounted from the embedded form: select it via the
     * manual-path choice. `librarySources` is parent-owned (a later parent
     * render would clobber a local append, stranding a `src:<idx>` choice on
     * the wrong entry) — the manual path lives in this component's own state
     * and resolves to the exact mountpoint whatever the array does.
     * @param {{mountpoint: string}} mount - The created mount (already live).
     */
    _onMountCreated(mount) {
        if (!mount?.mountpoint) return;
        this._libraryChoice = 'manual';
        this._manualPath = mount.mountpoint;
    }

    /**
     * A share was just removed from the embedded form: drop a manual selection
     * pointing at it. A card (`src:<idx>`) selection is re-anchored in
     * willUpdate once the owner (ag-config-page) reloads and re-passes the
     * detected sources.
     * @param {{mountpoint?: string}} detail - The removed mount's mountpoint.
     */
    _onMountRemoved({ mountpoint } = {}) {
        ({ choice: this._libraryChoice, manualPath: this._manualPath } =
            AgProvLibraryPicker.clearRemovedManual(this._libraryChoice, this._manualPath, mountpoint));
    }

    get _canApply() {
        if (this._busy) return false;
        const outChange = this._fields.includes('output') && this._outputChanged;
        const libChange = this._fields.includes('library') && !!this._libraryPayload;
        return outChange || libChange;
    }

    /** Apply the changed fields as targeted patches (preserves the rest of the config). */
    async _apply() {
        if (!this._canApply) return;
        this._busy = true;
        try {
            if (this._fields.includes('output') && this._outputChanged) {
                const o = this._selectedOutput;
                await apiPost('/audio-stack/output', {
                    service_id: this.serviceId,
                    card_name: o.card_name,
                    usb_id: o.usb_id ?? null,
                    device_id: o.device_id ?? 0,
                });
            }
            const libraryChanged = this._fields.includes('library') && !!this._libraryPayload;
            if (libraryChanged) {
                await apiPost('/audio-stack/library', this._libraryPayload);
            }
            showToast('success', 'Applied', `${this.serviceId} configuration updated.`);
            this._libraryChoice = null;
            this._manualPath = '';
            this._emitChanged();
            // A library change triggers an MPD rescan server-side — surface it.
            if (libraryChanged && typeof this.querySelector === 'function') {
                this.querySelector('ag-library-scan-indicator')?.start();
            }
        } catch (e) {
            handleError(e, `Failed to update ${this.serviceId}`);
        } finally {
            this._busy = false;
        }
    }

    /** Regenerate a minimal working config for this service (full overwrite + password). */
    async _reset() {
        const o = this._selectedOutput;
        if (!o) {
            showToast('warning', 'No audio output', 'Select an audio output first.');
            return;
        }
        const password = await showPasswordConfirm(
            `Reset ${this.serviceId} to a working default?`,
            'This regenerates a minimal working configuration (the current one is backed up first). '
            + 'Enter your admin password to confirm.'
        );
        if (!password) return;
        this._busy = true;
        try {
            await apiPost('/audio-stack/provision', {
                card_name: o.card_name,
                usb_id: o.usb_id ?? null,
                device_id: o.device_id ?? 0,
                services: [this.serviceId],
                regenerate: true,
                ...(this._libraryPayload || {}),
                admin_password: password,
            });
            showToast('success', 'Reset', `${this.serviceId} reset to a working default.`);
            this._emitChanged();
        } catch (e) {
            handleError(e, `Failed to reset ${this.serviceId}`);
        } finally {
            this._busy = false;
        }
    }

    _emitChanged() {
        this.dispatchEvent(new CustomEvent('guided-changed', { bubbles: true, composed: true }));
    }

    render() {
        const fields = this._fields;
        return html`
            <div class="ag-guided">
                ${fields.includes('output') ? html`
                    <div class="ag-guided-field">
                        <h4>Audio output</h4>
                        <ag-prov-output-picker .outputs=${this.outputs} .selected=${this._selectedOutputId}
                            @output-select=${(e) => { this._selectedOutputId = e.detail.output.hw; }}></ag-prov-output-picker>
                    </div>` : nothing}

                ${fields.includes('library') ? html`
                    <div class="ag-guided-field">
                        <h4>Music library</h4>
                        <ag-prov-library-picker .sources=${this.librarySources} .choice=${this._libraryChoice}
                            .manualPath=${this._manualPath}
                            @library-change=${(e) => { this._libraryChoice = e.detail.choice; this._manualPath = e.detail.manualPath; }}
                            @mount-created=${(e) => this._onMountCreated(e.detail.mount)}
                            @mount-removed=${(e) => this._onMountRemoved(e.detail)}></ag-prov-library-picker>
                    </div>` : nothing}

                ${!fields.length ? html`
                    <p class="ag-guided-note">No guided settings for this service yet — it renders via MPD.
                        You can still reset it to a working default below.</p>` : nothing}

                <div class="ag-guided-actions">
                    ${fields.length ? html`
                        <button class="action-btn primary compact" ?disabled=${!this._canApply}
                                @click=${this._apply}>Apply changes</button>` : nothing}
                    <button class="action-btn secondary compact" ?disabled=${this._busy} @click=${this._reset}>
                        ${svgIcon(iconRefresh)} Reset to default
                    </button>
                </div>

                ${fields.includes('library')
                    ? html`<ag-library-scan-indicator></ag-library-scan-indicator>` : nothing}
            </div>`;
    }
}

customElements.define('ag-guided-config', AgGuidedConfig);
