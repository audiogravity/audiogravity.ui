/**
 * @module AgPlaylistPicker
 * @description The "Add to playlist" dialog. Lists the account's own playlists on the
 * item's streaming source, adds the item to the one picked, or creates a playlist
 * and adds the item to it. Mounted once, beside the full-screen player, and opened
 * from anywhere through {@link requestPlaylistAdd} — the full-screen player for the
 * track playing now, album cards and album rows for an album.
 *
 * The core does the careful part (`POST /library/playlists/add`): it reads the
 * playlist first and writes only what it lacks, since HIGHRESAUDIO keeps a duplicate
 * and later removes every copy at once. This dialog reports what it answered —
 * `added` and `already` — in words.
 *
 * Neither write is retried automatically (see the playlist helpers of library-api.js):
 * a creation whose answer was lost on the way back would otherwise create a second
 * playlist. The error names the reason and the person tries again; an add is safe to
 * repeat. The helpers also announce the change, so a grid of the account's playlists
 * on screen reads itself again.
 *
 * A playlist created a moment ago is listed by the core until the service lists it
 * itself (HIGHRESAUDIO shows a newcomer only seconds later): the dialog shows what
 * `GET /library/playlists` answers, as every other reader of the account does.
 *
 * @element ag-playlist-picker
 *
 * @dependency ag-modal, ag-library-cover
 * @dependency css/components/playlist-picker.css, css/components/modal.css,
 *             css/components/forms.css, css/components/button.css
 *
 * @example
 * <ag-playlist-picker></ag-playlist-picker>   <!-- once, in index.html -->
 * requestPlaylistAdd({ sourceId: 'src_highresaudio', itemType: 'track',
 *     itemId: 't1_a1', title: 'Tukuman', subtitle: 'Enzo Favata', coverToken: 'url:…' });
 */
import { LitElement, html, nothing } from 'lit';
import { apiGet } from '../../api.js';
import { addToPlaylist, createPlaylist, failureReason } from '../../library-api.js';
import { showToast } from '../../ui-helpers.js';
import { iconPlus } from '../../ag-icons.js';
import { coverUrl } from '../utils-lit.js';
import { SOURCE_LABELS } from '../library-constants.js';
import '../organisms/ag-modal.js';
import '../atoms/ag-library-cover.js';

/** Window event that opens the dialog; its detail is the item to add. */
export const PLAYLIST_ADD_EVENT = 'ag-playlist-add';

/**
 * Ask the dialog to open for an item. The single way in: a caller never holds a
 * reference to the element.
 *
 * @param {{sourceId: string, itemType: 'track'|'album', itemId: string,
 *          title: string, subtitle?: string, coverToken?: string}} item
 */
export function requestPlaylistAdd(item) {
    window.dispatchEvent(new CustomEvent(PLAYLIST_ADD_EVENT, { detail: item }));
}

/**
 * "1 track" / "8 tracks".
 * @param {number} n
 * @returns {string}
 */
const tracks = (n) => `${n} track${n === 1 ? '' : 's'}`;

/**
 * The toast that says what an add did, from the core's two counts.
 *
 * @param {'track'|'album'} itemType
 * @param {string} title - The item's title.
 * @param {string} playlist - The playlist's name.
 * @param {{added: number, already: number}} result
 * @returns {{type: string, title: string, message: string}}
 */
export function describeAdd(itemType, title, playlist, { added, already }) {
    if (added === 0) {
        return {
            type: 'info',
            title: 'Already in this playlist',
            message: itemType === 'album'
                ? `Every track of ${title} is already in ${playlist}. Nothing was added.`
                : `${title} is already in ${playlist}. Nothing was added.`,
        };
    }
    if (itemType !== 'album') {
        return { type: 'success', title: 'Added', message: `${title} was added to ${playlist}.` };
    }
    const lead = `${tracks(added)} of ${title} ${added === 1 ? 'was' : 'were'} added to ${playlist}.`;
    const rest = already
        ? ` The other ${already} ${already === 1 ? 'was' : 'were'} already there.`
        : '';
    return { type: 'success', title: 'Added', message: lead + rest };
}

export class AgPlaylistPicker extends LitElement {
    static properties = {
        _open:      { state: true },
        _item:      { state: true },
        _playlists: { state: true },
        _loadError: { state: true },
        _mode:      { state: true },
        _name:      { state: true },
        _busy:      { state: true },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this._open = false;
        this._item = null;
        this._playlists = null;     // null while loading
        this._loadError = '';
        this._mode = 'list';        // 'list' | 'create'
        this._name = '';
        this._busy = false;
        this._request = 0;          // guards against a stale list answer
    }

    connectedCallback() {
        super.connectedCallback();
        window.addEventListener(PLAYLIST_ADD_EVENT, this._onRequest);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        window.removeEventListener(PLAYLIST_ADD_EVENT, this._onRequest);
    }

    /** @private */
    _onRequest = (e) => this.open(e.detail);

    /**
     * Open the dialog for an item and read the account's playlists.
     * Ignored while a write is under way: the dialog belongs to that item until
     * the service has answered.
     *
     * @param {object} item - See {@link requestPlaylistAdd}.
     */
    open(item) {
        if (this._busy || !item?.sourceId || !item?.itemId) return;
        this._item = item;
        this._mode = 'list';
        this._name = '';
        this._open = true;
        this._load();
    }

    /** @private Close and forget the item. */
    _close() {
        if (this._busy) return;
        this._open = false;
        this._request += 1;
    }

    /** @private Read the account's playlists on the item's source. */
    async _load() {
        const request = ++this._request;
        const source = this._item.sourceId;
        this._playlists = null;
        this._loadError = '';
        try {
            const listed = await apiGet(`/library/playlists?source_id=${encodeURIComponent(source)}`);
            if (request !== this._request) return;
            this._playlists = Array.isArray(listed) ? listed : [];
        } catch (err) {
            if (request !== this._request) return;
            this._loadError = failureReason(err);
            this._playlists = [];
        }
    }

    /**
     * @private Add the item to a playlist and say what happened.
     * @param {{id: string, title: string}} playlist
     * @returns {Promise<boolean>} Whether the add went through.
     */
    async _addTo(playlist) {
        const item = this._item;
        this._busy = true;
        try {
            const result = await addToPlaylist({
                sourceId: item.sourceId,
                playlistId: playlist.id,
                itemId: item.itemId,
                itemType: item.itemType,
            });
            const toast = describeAdd(item.itemType, item.title, playlist.title, result ?? {});
            showToast(toast.type, toast.title, toast.message);
            this._busy = false;
            this._close();
            return true;
        } catch (err) {
            showToast('error', 'Not added', failureReason(err));
            this._busy = false;
            return false;
        }
    }

    /** @private Create a playlist named as typed, then add the item to it. */
    async _create() {
        const name = this._name.trim();
        if (!name || this._busy) return;
        const item = this._item;
        this._busy = true;
        let created;
        try {
            created = await createPlaylist({ sourceId: item.sourceId, title: name });
        } catch (err) {
            showToast('error', 'Not created', failureReason(err));
            this._busy = false;
            return;
        }
        this._busy = false;
        const added = await this._addTo(created);
        if (!added) {
            // The playlist exists: show it in the list, where one tap retries the add.
            // At the end, where the core lists a playlist just made.
            this._mode = 'list';
            this._playlists = [...(this._playlists ?? []).filter((p) => p.id !== created.id), created];
        }
    }

    /** @private Switch to the name field. */
    _startCreate() {
        this._mode = 'create';
        this.updateComplete.then(() => this.querySelector('#ag-plp-name')?.focus());
    }

    _renderSubject() {
        const item = this._item;
        return html`
            <div class="ag-plp-subject">
                <ag-library-cover cover=${coverUrl(item.coverToken)}
                    fallback=${item.itemType === 'album' ? 'album' : 'track'} size="40"></ag-library-cover>
                <div class="ag-plp-col">
                    <span class="ag-plp-t">${item.title}</span>
                    ${item.subtitle ? html`<span class="ag-plp-s">${item.subtitle}</span>` : nothing}
                </div>
            </div>
        `;
    }

    _renderList() {
        const source = SOURCE_LABELS[this._item.sourceId] ?? '';
        const playlists = this._playlists ?? [];
        const loading = this._playlists === null;
        return html`
            ${this._renderSubject()}
            <div class="ag-plp-label">Your ${source} playlists</div>
            <ul class="ag-plp-list">
                <li>
                    <button class="ag-plp-row" ?disabled=${this._busy} @click=${() => this._startCreate()}>
                        <span class="ag-plp-new-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                stroke-width="2" stroke-linecap="round">${iconPlus}</svg>
                        </span>
                        <span class="ag-plp-t">New playlist</span>
                    </button>
                </li>
                ${playlists.map((p) => html`
                    <li>
                        <button class="ag-plp-row" ?disabled=${this._busy} @click=${() => this._addTo(p)}>
                            <ag-library-cover cover=${coverUrl(p.cover_token)} fallback="list" size="40"></ag-library-cover>
                            <span class="ag-plp-col">
                                <span class="ag-plp-t">${p.title}</span>
                                ${p.artist ? html`<span class="ag-plp-s">${p.artist}</span>` : nothing}
                            </span>
                        </button>
                    </li>
                `)}
            </ul>
            ${loading ? html`<p class="ag-plp-note">Reading your playlists…</p>` : nothing}
            ${this._loadError ? html`
                <p class="ag-plp-note ag-plp-error">
                    Your playlists could not be read: ${this._loadError}
                    <button class="action-btn compact secondary" @click=${() => this._load()}>Retry</button>
                </p>
            ` : nothing}
            ${!loading && !this._loadError && !playlists.length
                ? html`<p class="ag-plp-note">No playlist yet — create the first one.</p>`
                : nothing}
        `;
    }

    _renderCreate() {
        const source = SOURCE_LABELS[this._item.sourceId] ?? '';
        const what = this._item.itemType === 'album' ? 'will be added to it' : 'will be its first track';
        return html`
            ${this._renderSubject()}
            <form class="ag-plp-form" @submit=${(e) => { e.preventDefault(); this._create(); }}>
                <div class="form-field">
                    <label class="form-label" for="ag-plp-name">Name</label>
                    <input id="ag-plp-name" class="form-control form-control--dialog" type="text"
                        maxlength="100" autocomplete="off" .value=${this._name}
                        ?disabled=${this._busy}
                        @input=${(e) => { this._name = e.target.value; }}>
                </div>
                <p class="ag-plp-help">${this._item.title} ${what}. The playlist is saved in your ${source} account.</p>
            </form>
        `;
    }

    _renderFooter() {
        if (this._mode === 'create') {
            return html`
                <button class="action-btn secondary" ?disabled=${this._busy}
                    @click=${() => { this._mode = 'list'; }}>Back</button>
                <button class="action-btn primary" ?disabled=${this._busy || !this._name.trim()}
                    @click=${() => this._create()}>${this._busy ? 'Creating…' : 'Create and add'}</button>
            `;
        }
        return html`
            <button class="action-btn secondary" ?disabled=${this._busy} @click=${() => this._close()}>Cancel</button>
        `;
    }

    render() {
        if (!this._item) return nothing;
        return html`
            <ag-modal
                class="ag-plp"
                title=${this._mode === 'create' ? 'New playlist' : 'Add to playlist'}
                ?show=${this._open}
                .bodyTemplate=${this._mode === 'create' ? this._renderCreate() : this._renderList()}
                .footerTemplate=${this._renderFooter()}
                @modal-close=${() => this._close()}>
            </ag-modal>
        `;
    }
}

customElements.define('ag-playlist-picker', AgPlaylistPicker);
