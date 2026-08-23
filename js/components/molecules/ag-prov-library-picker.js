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
 * @prop {string} choice - Current choice: `src:<idx>` | `manual` | `none` | null.
 * @prop {string} manualPath - Current manual path value.
 * @fires library-change - Bubbles. detail: { choice, manualPath, payload } —
 *   payload is the API fragment (music_directory OR library_usb_uuid/fstype), or null.
 * @dependency js/components/utils-lit.js
 * @dependency js/ag-icons.js
 * @dependency js/components/molecules/ag-network-mount-form.js — embedded "Add
 *   network share" panel; parents listen to its bubbling `mount-created` /
 *   `mount-removed` to refresh their source list and reconcile the selection
 *   (see the static reindexChoice helper).
 * @dependency css/audio-stack.css
 */
import { LitElement, html } from 'lit';
import { svgIcon } from '../utils-lit.js';
import { iconHardDrive, iconWifi, iconFolder, iconCircleDot, iconCircle, iconCloud } from '../../ag-icons.js';
import './ag-network-mount-form.js';

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
     * @param {string|null} choice - `src:<idx>` | `manual` | `none` | null.
     * @param {string} manualPath - Manual path value.
     * @param {Array} [sources] - Detected sources.
     * @returns {object|null} { music_directory } | { library_usb_uuid, library_fstype }
     *   | { music_directory: '' } for a deliberate "no library" | null when nothing
     *   usable is chosen. Never `{}`: an absent field tells the core to KEEP the
     *   library mpd already has, which is the opposite of what `none` means.
     */
    static payloadFor(choice, manualPath, sources = []) {
        // A box with no local music is a legitimate setup — the streaming
        // services, the AirPlay receiver and the UPnP bridge need no file on
        // disk. Sent as an EMPTY path, not as an absent field: to the core those
        // mean different things, and they must. An absent field says "I am not
        // talking about the library", which keeps the one mpd already has — so
        // sending nothing here would re-inherit the old library on any box that
        // has one, which is every box that was ever configured. The empty string
        // says "no library", and the core then omits mpd's directive rather than
        // writing it empty, which would stop mpd from starting.
        // Distinct from null, which means "nothing chosen yet" and keeps
        // INITIALIZE disabled.
        if (choice === 'none') return { music_directory: '' };
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
     * A source's stable identity across a source-list refresh: the USB uuid, or
     * the mount path. Used to re-anchor a positional selection when the list is
     * re-fetched (a share added/removed shifts every later index).
     * @param {object} source - A detected source.
     * @returns {string|undefined} The identity key, or undefined if none.
     */
    static sourceKey(source) {
        return source?.uuid || source?.path || undefined;
    }

    /**
     * Reconcile a positional `src:<idx>` selection across a source-list change,
     * keyed on source identity, so a removed or re-ordered list never leaves the
     * selection silently pointing at a *different* source. `manual` and `null`
     * choices pass through unchanged (a manual path is index-independent).
     *
     * Shared so every picker host reconciles identically (mirrors payloadFor).
     * @param {string|null} choice - Current choice: `src:<idx>` | `manual` | `none` | null.
     * @param {Array} oldSources - The sources the choice indexed into.
     * @param {Array} newSources - The refreshed sources.
     * @returns {string|null} The reconciled choice: a new `src:<idx>`, or null if
     *   the selected source is gone.
     */
    static reindexChoice(choice, oldSources = [], newSources = []) {
        if (!choice?.startsWith('src:')) return choice;
        const key = AgProvLibraryPicker.sourceKey(oldSources[Number(choice.slice(4))]);
        if (!key) return null;
        const idx = newSources.findIndex(s => AgProvLibraryPicker.sourceKey(s) === key);
        return idx >= 0 ? `src:${idx}` : null;
    }

    /**
     * Drop a `manual` selection that points at a now-removed mountpoint, so a
     * deleted share can't stay selected. Any other choice passes through.
     * Shared so every picker host reconciles removals identically.
     * @param {string|null} choice - Current choice: `src:<idx>` | `manual` | `none` | null.
     * @param {string} manualPath - The current manual path.
     * @param {string} [removedMountpoint] - The removed share's mountpoint.
     * @returns {{choice: string|null, manualPath: string}} The reconciled pair.
     */
    static clearRemovedManual(choice, manualPath, removedMountpoint) {
        if (choice === 'manual' && manualPath === removedMountpoint) {
            return { choice: null, manualPath: '' };
        }
        return { choice, manualPath };
    }

    /**
     * Update the choice/path and notify the parent with the resolved payload.
     * @param {string} choice - New choice: `src:<idx>` | `manual` | `none`.
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
                ${this._none()}
                <ag-network-mount-form></ag-network-mount-form>
            </div>`;
    }

    /**
     * The explicit "no local library" choice.
     *
     * Listed as an option rather than left as an empty selection: without it the
     * only way past a disabled INITIALIZE was to invent a path, which the box
     * then accepted and turned into an empty library nobody could explain.
     * @returns {import('lit').TemplateResult}
     */
    _none() {
        const selected = this.choice === 'none';
        return html`
            <button class="ag-prov-card ${selected ? 'selected' : ''}"
                    @click=${() => this._emit('none', this.manualPath)}>
                ${svgIcon(selected ? iconCircleDot : iconCircle)}
                <span class="ag-prov-card-icon">${svgIcon(iconCloud)}</span>
                <span class="ag-prov-card-label">No music library — online listening only</span>
            </button>`;
    }

    _srcCard(s, i) {
        const key = `src:${i}`;
        const selected = this.choice === key;
        const tag = s.kind === 'usb' ? 'USB' : (s.fstype || 'mount').toUpperCase();
        return html`
            <button class="ag-prov-card ${selected ? 'selected' : ''}"
                    @click=${() => this._emit(key, this.manualPath)}>
                ${svgIcon(selected ? iconCircleDot : iconCircle)}
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
                    ${svgIcon(selected ? iconCircleDot : iconCircle)}
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
