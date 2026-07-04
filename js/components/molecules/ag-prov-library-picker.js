/**
 * @module AgProvLibraryPicker
 * @description Music-library picker for the audio-stack provisioning flow. Renders
 * the detected library sources (USB drive / network or local mount) as selectable
 * cards plus a manual-path option, and derives the API payload fragment for the
 * chosen source. Controlled component: the parent owns `choice`/`manualPath`;
 * every change emits `library-change` with the choice and the resolved payload.
 *
 * Extracted from ag-audio-stack-provisioning so the same picker serves the guided
 * config editor, the INITIALIZE-all dialog and (for now) the provisioning panel.
 *
 * @element ag-prov-library-picker
 * @prop {Array} sources - Detected library sources (from /audio-stack/status).
 * @prop {string} choice - Current choice: `src:<idx>` | `manual` | null.
 * @prop {string} manualPath - Current manual path value.
 * @fires library-change - Bubbles. detail: { choice, manualPath, payload } —
 *   payload is the API fragment (music_directory OR library_usb_uuid/fstype), or null.
 * @dependency js/components/utils-lit.js
 * @dependency js/ag-icons.js
 * @dependency css/audio-stack.css
 */
import { LitElement, html } from 'lit';
import { svgIcon } from '../utils-lit.js';
import { iconHardDrive, iconWifi, iconFolder, iconRadio, iconCircle } from '../../ag-icons.js';

const NETWORK_FS = ['cifs', 'nfs', 'nfs4', 'smb3'];

export class AgProvLibraryPicker extends LitElement {
    static properties = {
        sources: { type: Array },
        choice: { type: String },
        manualPath: { type: String },
    };

    constructor() {
        super();
        this.sources = [];
        this.choice = null;
        this.manualPath = '';
    }

    createRenderRoot() {
        return this; // Light DOM (global theme + audio-stack.css)
    }

    /**
     * Derive the API library payload fragment for a choice, or null if unusable.
     * Shared so parents (panel, guided editor, dialog) don't re-implement it.
     * @param {string|null} choice - `src:<idx>` | `manual` | null.
     * @param {string} manualPath - Manual path value.
     * @param {Array} [sources] - Detected sources.
     * @returns {object|null} { music_directory } | { library_usb_uuid, library_fstype } | null.
     */
    static payloadFor(choice, manualPath, sources = []) {
        if (choice === 'manual') {
            const p = (manualPath || '').trim();
            return p ? { music_directory: p } : null;
        }
        if (choice?.startsWith('src:')) {
            const src = sources[Number(choice.slice(4))];
            if (!src) return null;
            return src.kind === 'usb'
                ? { library_usb_uuid: src.uuid, library_fstype: src.fstype }
                : { music_directory: src.path };
        }
        return null;
    }

    /**
     * Update the choice/path and notify the parent with the resolved payload.
     * @param {string} choice - New choice.
     * @param {string} manualPath - New manual path.
     */
    _emit(choice, manualPath) {
        this.choice = choice;
        this.manualPath = manualPath;
        this.dispatchEvent(new CustomEvent('library-change', {
            detail: {
                choice, manualPath,
                payload: AgProvLibraryPicker.payloadFor(choice, manualPath, this.sources),
            },
            bubbles: true, composed: true,
        }));
    }

    _icon(s) {
        if (s.kind === 'usb') return iconHardDrive;
        return s.fstype && NETWORK_FS.includes(s.fstype) ? iconWifi : iconFolder;
    }

    render() {
        return html`
            <div class="ag-prov-list">
                ${this.sources.map((s, i) => this._srcCard(s, i))}
                ${this._manual()}
            </div>`;
    }

    _srcCard(s, i) {
        const key = `src:${i}`;
        const selected = this.choice === key;
        const tag = s.kind === 'usb' ? 'USB' : (s.fstype || 'mount').toUpperCase();
        return html`
            <button class="ag-prov-card ${selected ? 'selected' : ''}"
                    @click=${() => this._emit(key, this.manualPath)}>
                ${svgIcon(selected ? iconRadio : iconCircle)}
                <span class="ag-prov-card-icon">${svgIcon(this._icon(s))}</span>
                <span class="ag-prov-card-label">${s.label}</span>
                <span class="badge neutral">${tag}</span>
            </button>`;
    }

    _manual() {
        const selected = this.choice === 'manual';
        return html`
            <div class="ag-prov-card ${selected ? 'selected' : ''} ag-prov-manual">
                <button class="ag-prov-manual-radio" @click=${() => this._emit('manual', this.manualPath)}>
                    ${svgIcon(selected ? iconRadio : iconCircle)}
                    <span class="ag-prov-card-icon">${svgIcon(iconFolder)}</span>
                    <span class="ag-prov-card-label">Manual path</span>
                </button>
                <input class="ag-prov-input" type="text" placeholder="/mnt/musics"
                       .value=${this.manualPath}
                       @focus=${() => this._emit('manual', this.manualPath)}
                       @input=${(e) => this._emit('manual', e.target.value)}>
            </div>`;
    }
}

customElements.define('ag-prov-library-picker', AgProvLibraryPicker);
