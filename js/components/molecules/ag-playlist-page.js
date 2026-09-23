/**
 * @module AgPlaylistPage
 * @description The page of one streaming playlist: its tracks, Play and Queue for the
 * whole of it, and a tap on a track to play the playlist from there. On one of the
 * account's own playlists (`canEditPlaylist`) it also takes a track out, renames the
 * playlist and deletes it; on the service's own selections, each track can be added to
 * one of the account's playlists instead.
 *
 * The browse opens it from the "open" button of a playlist card or row and draws it in
 * the grid's place, so going back finds the shelf as it was left.
 *
 * "Play from this track" queues the playlist from that track to its end: the tracks
 * before it are left out (`start_index`, POST /library/queue) — the one meaning every
 * output can honour, since starting a full queue in its middle is a command of each.
 *
 * The track count and the duration are the page's own sums over the tracks it lists:
 * HIGHRESAUDIO's count of a playlist lags behind its content (measured 2026-09-23: 0
 * for a playlist holding 3 tracks).
 *
 * Its two dialogs — rename, delete — are rendered on <body> (BodyPortalController):
 * inside the library tab they would stay under the top bar and the player bar.
 *
 * @element ag-playlist-page
 *
 * @attr {string}  source-id  - The streaming source the playlist belongs to.
 * @attr {string}  zone-id    - Roon zone, passed through to the queue (unused elsewhere).
 * @attr {string}  back-label - What the back button returns to ("My playlists").
 * @attr {boolean} wide       - The artwork is a 2:1 banner (HIGHRESAUDIO's selections).
 * @prop {{id: string, title: string, artist?: string, cover_token?: string}} playlist -
 *   The playlist as the browse lists it; `artist` carries its description.
 *
 * @fires playlist-back    - Bubbles. Back to the grid.
 * @fires playlist-deleted - Bubbles. detail: `{ id }` — the page's playlist was deleted.
 * @fires lib-open-np      - Bubbles. A play started: the library opens the player.
 *
 * @dependency ag-library-list-row, ag-library-cover, ag-playlist-details, ag-modal
 * @dependency css/components/playlist-page.css, css/components/button.css
 *
 * @example
 * <ag-playlist-page source-id="src_highresaudio" back-label="My playlists"
 *   .playlist=${{ id: 'mine:5549', title: 'Audiogravity test' }}
 *   @playlist-back=${this._closePlaylist}></ag-playlist-page>
 */
import { LitElement, html, nothing } from 'lit';
import {
    PLAYLISTS_CHANGED_EVENT, deletePlaylist, failureReason, fetchPlaylistTracks,
    playWithFeedback, queueItem, queueWithFeedback, removeFromPlaylist,
} from '../../library-api.js';
import { showToast } from '../../ui-helpers.js';
import { iconBack, iconPencil, iconPlay, iconPlus, iconTrash } from '../../ag-icons.js';
import { coverUrl, fmtDuration, svgIcon } from '../utils-lit.js';
import { SOURCE_LABELS, canAddToPlaylist, canEditPlaylist } from '../library-constants.js';
import { BodyPortalController } from '../../core/BodyPortalController.js';
import { requestPlaylistAdd } from './ag-playlist-picker.js';
import './ag-library-list-row.js';
import './ag-playlist-details.js';
import '../atoms/ag-library-cover.js';
import '../organisms/ag-modal.js';

/**
 * "1 track" / "8 tracks".
 * @param {number} n
 * @returns {string}
 */
const tracksWord = (n) => `${n} track${n === 1 ? '' : 's'}`;

/**
 * What the header says of the tracks listed: "4 tracks · 25 min". The duration is left
 * out when no track carries one, rather than printed as 0.
 *
 * @param {Array<{duration?: number|null}>} tracks
 * @returns {string}
 */
export function describeTracks(tracks) {
    const seconds = tracks.reduce((sum, t) => sum + (Number(t.duration) || 0), 0);
    const words = tracksWord(tracks.length);
    return seconds ? `${words} · ${Math.max(1, Math.round(seconds / 60))} min` : words;
}

/**
 * The second line of the delete dialog: what goes and what stays.
 *
 * @param {number|null} count - Tracks in the playlist; null while they are unknown.
 * @returns {string}
 */
export function describeDeletion(count) {
    const end = 'only the playlist goes. This cannot be undone.';
    if (count === null) return `Its tracks stay in the catalogue; ${end}`;
    if (count === 0) return 'It is empty. This cannot be undone.';
    if (count === 1) return `Its only track stays in the catalogue; ${end}`;
    return `Its ${count} tracks stay in the catalogue; ${end}`;
}

export class AgPlaylistPage extends LitElement {
    static properties = {
        sourceId:   { type: String, attribute: 'source-id' },
        zoneId:     { type: String, attribute: 'zone-id' },
        backLabel:  { type: String, attribute: 'back-label' },
        wide:       { type: Boolean },
        playlist:   { type: Object },
        _tracks:    { state: true },
        _error:     { state: true },
        _title:     { state: true },
        _description: { state: true },
        _removing:  { state: true },
        _renaming:  { state: true },
        _confirmingDelete: { state: true },
        _deleting:  { state: true },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.sourceId = '';
        this.zoneId = '';
        this.backLabel = 'Back';
        this.wide = false;
        this.playlist = null;
        this._tracks = null;             // null while being read
        this._error = '';
        this._title = '';
        this._description = '';
        this._removing = new Set();      // ids of the tracks being taken out
        this._renaming = false;
        this._confirmingDelete = false;
        this._deleting = false;
        this._request = 0;               // guards against a stale answer
        this._dialogs = new BodyPortalController(this, () => this._renderDialogs());
    }

    connectedCallback() {
        super.connectedCallback();
        window.addEventListener(PLAYLISTS_CHANGED_EVENT, this._onPlaylistsChanged);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        window.removeEventListener(PLAYLISTS_CHANGED_EVENT, this._onPlaylistsChanged);
    }

    willUpdate(changed) {
        if (changed.has('playlist')) {
            this._title = this.playlist?.title ?? '';
            this._description = this.playlist?.artist ?? '';
        }
    }

    updated(changed) {
        if ((changed.has('playlist') || changed.has('sourceId')) && this.playlist?.id) {
            this._load();
        }
    }

    /** @returns {boolean} Whether the playlist is one of the account's own. */
    get _editable() { return canEditPlaylist(this.sourceId, this.playlist?.id); }

    /** @returns {string} "your HIGHRESAUDIO account". */
    get _account() {
        const source = SOURCE_LABELS[this.sourceId];
        return source ? `your ${source} account` : 'your account';
    }

    /**
     * Read the tracks again.
     * @param {{quiet?: boolean}} [opts] - quiet: keep the tracks on screen until the
     *   answer lands (a reread after a change), rather than showing the page as loading.
     */
    async _load({ quiet = false } = {}) {
        const request = ++this._request;
        if (!quiet) {
            this._tracks = null;
            this._error = '';
        }
        try {
            const tracks = await fetchPlaylistTracks(this.sourceId, this.playlist.id);
            if (request !== this._request) return;
            this._tracks = tracks;
            this._error = '';
        } catch (err) {
            if (request !== this._request) return;
            if (!quiet || this._tracks === null) this._error = failureReason(err);
        }
    }

    /**
     * @private Reread after a change to this playlist made anywhere — the player adding
     * the track playing, the picker, this page's own removals.
     * @param {CustomEvent<{sourceId: string, playlistId: string}>} e
     */
    _onPlaylistsChanged = (e) => {
        const { sourceId, playlistId } = e.detail ?? {};
        if (this._deleting || !this.playlist?.id) return;
        if (sourceId !== this.sourceId || playlistId !== this.playlist.id) return;
        this._load({ quiet: true });
    };

    /**
     * @private
     * @param {string} type
     * @param {object} [detail]
     */
    _emit(type, detail) {
        this.dispatchEvent(new CustomEvent(type, { bubbles: true, detail }));
    }

    /**
     * @private
     * @param {'play'|'add'} action
     * @param {{id: string}} [from] - The track to start from, with its position.
     * @param {number} [startIndex]
     */
    _queueOpts(action, from, startIndex) {
        return {
            sourceId: this.sourceId,
            zoneId: this.zoneId,
            itemId: this.playlist.id,
            itemType: 'playlist',
            action,
            hierarchy: 'browse',
            startIndex,
            // Its id travels with its position: the core reads the playlist again, and
            // one edited elsewhere in between would otherwise start on another track.
            startItemId: from?.id,
        };
    }

    /**
     * @private Play the playlist, from a track when one is given.
     * @param {{id: string}} [from] - The track tapped.
     * @param {number} [startIndex] - Its position in the list (0 = the first).
     */
    async _play(from, startIndex) {
        const ok = await playWithFeedback(() => queueItem(this._queueOpts('play', from, startIndex)));
        if (ok) this._emit('lib-open-np');
    }

    /** @private Add the whole playlist to the queue. */
    _queue() {
        queueWithFeedback(() => queueItem(this._queueOpts('add')), this._title || 'Playlist');
    }

    /**
     * @private Take a track out of the playlist — every copy of it, as the service does.
     * No confirmation: it is one tap to add it back.
     * @param {{id: string, title: string}} track
     */
    async _remove(track) {
        if (this._removing.has(track.id)) return;
        this._removing = new Set(this._removing).add(track.id);
        try {
            const result = await removeFromPlaylist({
                sourceId: this.sourceId, playlistId: this.playlist.id, itemId: track.id,
            });
            this._tracks = (this._tracks ?? []).filter((t) => t.id !== track.id);
            if (result?.removed) {
                showToast('success', 'Removed', `${track.title} was removed from ${this._title}.`);
            } else {
                showToast('info', 'Already removed', `${track.title} was no longer in ${this._title}.`);
            }
        } catch (err) {
            showToast('error', 'Not removed', failureReason(err));
        } finally {
            const next = new Set(this._removing);
            next.delete(track.id);
            this._removing = next;
        }
    }

    /**
     * @private Offer a track of the service's selection to one of the account's playlists.
     * @param {{id: string, title: string, artist?: string, cover_token?: string}} track
     */
    _toPlaylist(track) {
        requestPlaylistAdd({
            sourceId: this.sourceId,
            itemType: 'track',
            itemId: track.id,
            title: track.title,
            subtitle: track.artist ?? '',
            coverToken: track.cover_token,
        });
    }

    /**
     * @private The rename dialog saved: the page shows the new name at once.
     * @param {CustomEvent<{title: string, description: string}>} e
     */
    _onRenamed = (e) => {
        this._title = e.detail.title;
        this._description = e.detail.description;
        this._renaming = false;
    };

    /** @private Delete the playlist, once the dialog has been confirmed. */
    async _delete() {
        if (this._deleting) return;
        this._deleting = true;
        const title = this._title;
        try {
            await deletePlaylist({ sourceId: this.sourceId, playlistId: this.playlist.id });
            showToast('success', 'Deleted', `${title} was deleted from ${this._account}.`);
            this._confirmingDelete = false;
            this._emit('playlist-deleted', { id: this.playlist.id });
        } catch (err) {
            showToast('error', 'Not deleted', failureReason(err));
        } finally {
            this._deleting = false;
        }
    }

    /**
     * @private A track's second line: its artist, and its album when it has one of its
     * own — HIGHRESAUDIO fills a missing album with the playlist's title, which would
     * print the page's own name under every track.
     * @param {{artist?: string, album?: string}} track
     * @returns {string}
     */
    _byline(track) {
        const album = track.album && track.album !== this.playlist?.title ? track.album : '';
        return [track.artist, album].filter(Boolean).join(' · ');
    }

    _renderHeader() {
        const tracks = this._tracks;
        const source = SOURCE_LABELS[this.sourceId] ?? '';
        return html`
            <div class="ag-pp-head ${this.wide ? 'ag-pp-head--wide' : ''}">
                <ag-library-cover class="ag-pp-cover" cover=${coverUrl(this.playlist.cover_token)}
                    fallback="list" ?wide=${this.wide} size=${this.wide ? 240 : 112}></ag-library-cover>
                <div class="ag-pp-info">
                    <span class="ag-pp-kicker">${this._editable
                        ? 'Your playlist' : (source ? `Playlist · ${source}` : 'Playlist')}</span>
                    <h2 class="ag-pp-title">${this._title}</h2>
                    ${this._description
                        ? html`<span class="ag-pp-desc">${this._description}</span>` : nothing}
                    ${Array.isArray(tracks)
                        ? html`<span class="ag-pp-count">${describeTracks(tracks)}</span>` : nothing}
                </div>
            </div>
        `;
    }

    _renderActions() {
        // Known to be empty: nothing to play. While the tracks are still being read, or
        // could not be, the core reads them itself and says why if it cannot either.
        const empty = Array.isArray(this._tracks) && !this._tracks.length;
        return html`
            <div class="ag-pp-actions">
                <button class="action-btn primary" ?disabled=${empty} @click=${() => this._play()}>
                    ${svgIcon(iconPlay, { size: '14px' })} Play
                </button>
                <button class="action-btn secondary" ?disabled=${empty} @click=${() => this._queue()}>
                    ${svgIcon(iconPlus, { size: '14px' })} Queue
                </button>
                ${this._editable ? html`
                    <span class="ag-pp-spacer"></span>
                    <button class="ag-pp-icon-btn" title="Rename" aria-label="Rename the playlist"
                        @click=${() => { this._renaming = true; }}>${svgIcon(iconPencil, { size: '18px' })}</button>
                    <button class="ag-pp-icon-btn" title="Delete" aria-label="Delete the playlist"
                        @click=${() => { this._confirmingDelete = true; }}>${svgIcon(iconTrash, { size: '18px' })}</button>
                ` : nothing}
            </div>
        `;
    }

    _renderTracks() {
        if (this._error) {
            return html`
                <p class="ag-pp-note ag-pp-error">
                    The playlist could not be read: ${this._error}
                    <button class="action-btn compact secondary" @click=${() => this._load()}>Retry</button>
                </p>
            `;
        }
        const tracks = this._tracks;
        if (tracks === null) return html`<p class="ag-pp-note">Reading the playlist…</p>`;
        if (!tracks.length) {
            return html`<p class="ag-pp-note">${this._editable
                ? 'This playlist is empty. Fill it from the player or an album, with the Add to playlist button.'
                : 'This playlist holds no track.'}</p>`;
        }
        const editable = this._editable;
        return html`
            <div class="ag-pp-tracks">
                ${tracks.map((t, i) => html`
                    <ag-library-list-row
                        class=${this._removing.has(t.id) ? 'ag-pp-pending' : ''}
                        cover=${coverUrl(t.cover_token)}
                        fallback="track"
                        title=${t.title}
                        subtitle=${this._byline(t)}
                        position=${i + 1}
                        note=${t.duration ? fmtDuration(t.duration) : ''}
                        ?removable=${editable}
                        ?playlistable=${!editable && canAddToPlaylist(this.sourceId, t.id)}
                        @row-click=${() => this._play(t, i)}
                        @playlist-remove=${() => this._remove(t)}
                        @playlist-add=${() => this._toPlaylist(t)}
                    ></ag-library-list-row>
                `)}
            </div>
        `;
    }

    _renderDeleteDialog() {
        const count = Array.isArray(this._tracks) ? this._tracks.length : null;
        return html`
            <ag-modal
                class="ag-pp-delete"
                title="Delete playlist"
                ?show=${this._confirmingDelete}
                .bodyTemplate=${html`
                    <p class="ag-pp-delete-q">Delete <strong>${this._title}</strong> from ${this._account}?</p>
                    <p class="ag-pp-delete-note">${describeDeletion(count)}</p>
                `}
                .footerTemplate=${html`
                    <button class="action-btn secondary" ?disabled=${this._deleting}
                        @click=${() => { this._confirmingDelete = false; }}>Cancel</button>
                    <button class="action-btn error" ?disabled=${this._deleting}
                        @click=${() => this._delete()}>${this._deleting ? 'Deleting…' : 'Delete'}</button>
                `}
                @modal-close=${() => { if (!this._deleting) this._confirmingDelete = false; }}>
            </ag-modal>
        `;
    }

    /** The rename and delete dialogs, on the account's own playlist; rendered on <body>. */
    _renderDialogs() {
        if (!this.playlist?.id || !this._editable) return nothing;
        return html`
            <ag-playlist-details
                source-id=${this.sourceId}
                .playlist=${{ id: this.playlist.id, title: this._title, description: this._description }}
                ?show=${this._renaming}
                @details-close=${() => { this._renaming = false; }}
                @playlist-saved=${this._onRenamed}
            ></ag-playlist-details>
            ${this._renderDeleteDialog()}
        `;
    }

    render() {
        if (!this.playlist?.id) return nothing;
        return html`
            <div class="ag-pp">
                <button class="ag-pp-back" @click=${() => this._emit('playlist-back')}>
                    ${svgIcon(iconBack, { size: '18px' })}<span>${this.backLabel}</span>
                </button>
                ${this._renderHeader()}
                ${this._renderActions()}
                ${this._renderTracks()}
            </div>
        `;
    }
}

customElements.define('ag-playlist-page', AgPlaylistPage);
