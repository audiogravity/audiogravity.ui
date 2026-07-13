/**
 * @module FavoritesController
 * @description Lit Reactive Controller that gives a component the accurate ★ state
 * for streaming albums and a toggle action, backed by the per-source favorites
 * cache in library-store. Shared by every view that shows streaming album cards /
 * rows (browse grid, search) so the fetch/toggle/optimistic-revert logic lives once.
 *
 *   this._fav = new FavoritesController(this);
 *   // on (re)load of a streaming source:
 *   this._fav.load(this.sourceId);              // fills the id set, requests an update
 *   // per album card:
 *   ?favorite=${this._fav.has(album.id)}
 *   @fav-toggle=${(e) => this._fav.toggle(this.sourceId, album.id, e.detail.favorite)}
 */

import { getFavoriteAlbumIds, setAlbumFavorited, subscribeFavorites } from '../library-store.js';
import { showToast } from '../ui-helpers.js';

export class FavoritesController {
    /** @param {import('lit').ReactiveControllerHost} host */
    constructor(host) {
        this.host = host;
        /** @type {Set<string>} favorited album ids for the current source */
        this.ids = new Set();
        this._sourceId = null;
        this._unsub = null;
        host.addController(this);
    }

    hostDisconnected() { this._unsubscribe(); }

    _unsubscribe() { if (this._unsub) { this._unsub(); this._unsub = null; } }

    /**
     * Load the favorited-album id set for a streaming source (cached, non-blocking),
     * and subscribe so a toggle in ANY view keeps this one in sync.
     * @param {string} sourceId
     */
    async load(sourceId) {
        if (this._sourceId !== sourceId) {
            this._unsubscribe();
            this._sourceId = sourceId;
            this._unsub = subscribeFavorites(sourceId, () => this._resync());
        }
        await this._resync();
    }

    /** Pull the current cached favorite set for the active source and re-render. */
    async _resync() {
        if (!this._sourceId) return;
        try {
            this.ids = await getFavoriteAlbumIds(this._sourceId);
            this.host.requestUpdate();
        } catch (_) { /* star state stays empty — non-blocking */ }
    }

    /**
     * @param {string} albumId
     * @returns {boolean} whether the album is currently favorited
     */
    has(albumId) { return this.ids.has(albumId); }

    /**
     * Toggle an album's favorite state — optimistic (instant ★) + persisted;
     * reverts the local state and toasts on failure.
     * @param {string} sourceId
     * @param {string} albumId
     * @param {boolean} favorited - desired state
     */
    async toggle(sourceId, albumId, favorited) {
        const next = new Set(this.ids);
        if (favorited) next.add(albumId); else next.delete(albumId);
        this.ids = next;                 // new ref → host re-renders
        this.host.requestUpdate();
        try {
            await setAlbumFavorited(sourceId, albumId, favorited);
        } catch (_) {
            const revert = new Set(this.ids);
            if (favorited) revert.delete(albumId); else revert.add(albumId);
            this.ids = revert;
            this.host.requestUpdate();
            showToast(`Could not ${favorited ? 'add' : 'remove'} favorite`, 'error');
        }
    }
}
