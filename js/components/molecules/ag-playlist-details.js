/**
 * @module AgPlaylistDetails
 * @description The dialog that names a playlist: a name and an optional description,
 * the two things a streaming account keeps about one. Two uses — creating an empty
 * playlist from the "New playlist" tile of the account's playlists, and saving both
 * fields of an existing one from its page (renaming it). Adding an item to a playlist,
 * creating the playlist on the way, is ag-playlist-picker's: that one names the item.
 *
 * The parent owns whether the dialog is open (`show`): it closes it on `details-close`
 * and on `playlist-saved`. The write goes through the playlist helpers of
 * library-api.js, which never retry it and announce the change.
 *
 * @element ag-playlist-details
 *
 * @attr {string}  source-id - The streaming source whose account keeps the playlist.
 * @attr {boolean} show      - Whether the dialog is open.
 * @prop {{id: string, title: string, description?: string}|null} playlist - The
 *   playlist to rename; null to create one.
 *
 * @fires playlist-saved - Bubbles. detail: `{ id, title, description }`, as saved — the
 *   id as the browse lists it.
 * @fires details-close  - Bubbles. Dismissed, or saved with nothing changed.
 *
 * @dependency ag-modal
 * @dependency css/components/playlist-picker.css (.ag-pld-*), css/components/modal.css,
 *             css/components/forms.css, css/components/button.css
 *
 * @example
 * <ag-playlist-details source-id="src_highresaudio" ?show=${this._creating}
 *   @playlist-saved=${this._onCreated} @details-close=${() => { this._creating = false; }}>
 * </ag-playlist-details>
 */
import { LitElement, html, nothing } from 'lit';
import { createPlaylist, failureReason, renamePlaylist } from '../../library-api.js';
import { showToast } from '../../ui-helpers.js';
import { SOURCE_LABELS } from '../library-constants.js';
import '../organisms/ag-modal.js';

/** The core's limits (PlaylistCreateRequest / PlaylistRenameRequest). */
const NAME_MAX = 100;
const DESCRIPTION_MAX = 500;

/** Numbers the instances, so two dialogs on one screen never share a field id. */
let instances = 0;

export class AgPlaylistDetails extends LitElement {
    static properties = {
        sourceId:     { type: String, attribute: 'source-id' },
        show:         { type: Boolean },
        playlist:     { type: Object },
        _name:        { state: true },
        _description: { state: true },
        _busy:        { state: true },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.sourceId = '';
        this.show = false;
        this.playlist = null;
        this._name = '';
        this._description = '';
        this._busy = false;
        this._uid = ++instances;
    }

    /** @returns {boolean} Whether the dialog renames a playlist rather than creating one. */
    get _renaming() { return Boolean(this.playlist?.id); }

    /** @returns {string} The id of the name field. */
    get _nameId() { return `ag-pld-name-${this._uid}`; }

    /** @returns {string} The id of the description field. */
    get _descriptionId() { return `ag-pld-description-${this._uid}`; }

    willUpdate(changed) {
        // The fields start from the playlist each time the dialog opens: what was typed
        // and cancelled last time is not what the playlist is called.
        if (changed.has('show') && this.show) {
            this._name = this.playlist?.title ?? '';
            this._description = this.playlist?.description ?? '';
        }
    }

    async updated(changed) {
        if (!changed.has('show') || !this.show) return;
        // The fields are drawn by the modal, which renders after this element does.
        await this.querySelector('ag-modal')?.updateComplete;
        this.querySelector(`#${this._nameId}`)?.focus();
    }

    /**
     * @private
     * @param {string} type
     * @param {object} [detail]
     */
    _emit(type, detail) {
        this.dispatchEvent(new CustomEvent(type, { bubbles: true, detail }));
    }

    /** @private Dismiss, unless a write is under way: the dialog waits for its answer. */
    _cancel = () => {
        if (!this._busy) this._emit('details-close');
    };

    /** @private Create the playlist, or save both fields of the one being renamed. */
    async _save() {
        const title = this._name.trim();
        if (!title || this._busy) return;
        const description = this._description.trim();
        const renaming = this._renaming;
        if (renaming && title === this.playlist.title
            && description === (this.playlist.description ?? '')) {
            this._emit('details-close');     // nothing changed: nothing to write
            return;
        }
        const source = SOURCE_LABELS[this.sourceId];
        const account = source ? `your ${source} account` : 'your account';
        this._busy = true;
        try {
            const saved = renaming
                ? await renamePlaylist({
                    sourceId: this.sourceId, playlistId: this.playlist.id, title, description,
                })
                : await createPlaylist({ sourceId: this.sourceId, title, description });
            const name = saved?.title || title;
            if (!renaming) {
                showToast('success', 'Created', `${name} is ready in ${account}.`);
            } else if (title !== this.playlist.title) {
                showToast('success', 'Renamed', `The playlist is now called ${name}.`);
            } else {
                showToast('success', 'Saved', `The description of ${name} was saved.`);
            }
            this._busy = false;
            this._emit('playlist-saved', { id: saved?.id || this.playlist?.id, title: name, description });
        } catch (err) {
            this._busy = false;
            showToast('error', renaming ? 'Not saved' : 'Not created', failureReason(err));
        }
    }

    /**
     * @private Enter saves, from either field. A form with two text fields and no
     * submit button of its own is never submitted by the keyboard — the buttons live
     * in the modal's footer, outside the form.
     * @param {KeyboardEvent} e
     */
    _onKeydown = (e) => {
        if (e.key !== 'Enter' || e.isComposing) return;
        e.preventDefault();
        this._save();
    };

    _renderBody() {
        return html`
            <form class="ag-pld-form" @submit=${(e) => { e.preventDefault(); this._save(); }}
                @keydown=${this._onKeydown}>
                <div class="form-field">
                    <label class="form-label" for=${this._nameId}>Name</label>
                    <input id=${this._nameId} class="form-control form-control--dialog" type="text"
                        maxlength=${NAME_MAX} autocomplete="off" .value=${this._name}
                        ?disabled=${this._busy}
                        @input=${(e) => { this._name = e.target.value; }}>
                </div>
                <div class="form-field">
                    <label class="form-label" for=${this._descriptionId}>
                        Description <span class="ag-pld-optional">(optional)</span>
                    </label>
                    <input id=${this._descriptionId} class="form-control form-control--dialog"
                        type="text" maxlength=${DESCRIPTION_MAX} autocomplete="off"
                        placeholder="What it is for" .value=${this._description}
                        ?disabled=${this._busy}
                        @input=${(e) => { this._description = e.target.value; }}>
                </div>
                ${this._renaming ? nothing : html`
                    <p class="ag-plp-help">It starts empty. Fill it from the player or an album,
                        with the Add to playlist button.</p>
                `}
            </form>
        `;
    }

    _renderFooter() {
        const [idle, working] = this._renaming ? ['Save', 'Saving…'] : ['Create', 'Creating…'];
        return html`
            <button class="action-btn secondary" ?disabled=${this._busy} @click=${this._cancel}>Cancel</button>
            <button class="action-btn primary" ?disabled=${this._busy || !this._name.trim()}
                @click=${() => this._save()}>${this._busy ? working : idle}</button>
        `;
    }

    render() {
        return html`
            <ag-modal
                class="ag-pld"
                title=${this._renaming ? 'Rename playlist' : 'New playlist'}
                ?show=${this.show}
                .bodyTemplate=${this._renderBody()}
                .footerTemplate=${this._renderFooter()}
                @modal-close=${this._cancel}>
            </ag-modal>
        `;
    }
}

customElements.define('ag-playlist-details', AgPlaylistDetails);
