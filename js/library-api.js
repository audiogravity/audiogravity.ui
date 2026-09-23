/**
 * @module LibraryApi
 * @description Typed helpers around the backend /library/* endpoints.
 * Centralizes request body shapes so callers don't repeat the snake-case mapping
 * and the conditional-undefined dance on every callsite.
 */

import { apiGet, apiPost, apiPut, apiDelete } from './api.js';
import { showToast } from './ui-helpers.js';

/**
 * Enqueue or play a library item.
 * Maps a camelCase options bag to the backend's snake_case body and drops
 * undefined / empty optional fields. Returns the raw API response.
 *
 * @param {object} opts
 * @param {string} opts.sourceId      - Active library source ID (required).
 * @param {string} [opts.zoneId]      - Roon zone ID; omitted when falsy.
 * @param {string} opts.itemId        - Item identifier (track/album/artist/playlist).
 * @param {string} opts.itemType      - 'track' | 'album' | 'artist' | 'playlist' | …
 * @param {string} opts.action        - 'play' | 'add'.
 * @param {string} [opts.artistId]    - Optional artist disambiguation.
 * @param {string} [opts.hierarchy]   - 'browse' | 'search' | …
 * @param {string} [opts.searchQuery] - Original search query (search hierarchy).
 * @param {string} [opts.itemTitle]   - Display title; helps Roon refresh stale item_keys.
 * @param {number} [opts.startIndex]  - Queue an album or a playlist from this position on
 *   (0 = its first track); the tracks before it are left out. v1: HIGHRESAUDIO albums and
 *   playlists — the core refuses it elsewhere.
 * @param {string} [opts.startItemId] - The id of the track at `startIndex`. The core reads
 *   the list again when it plays: if the track moved meanwhile it starts where the track now
 *   is, and if it left, the play is refused rather than started on another track.
 */
export function queueItem({
    sourceId,
    zoneId,
    itemId,
    itemType,
    action,
    artistId,
    hierarchy,
    searchQuery,
    itemTitle,
    startIndex,
    startItemId,
}) {
    // Routing to HQPlayer, when it is the selected output, is decided by the
    // BACKEND (it owns that setting) — every client behaves identically.
    return apiPost('/library/queue', {
        source_id:    sourceId,
        zone_id:      zoneId || undefined,
        item_id:      itemId,
        item_type:    itemType,
        action,
        artist_id:    artistId,
        hierarchy,
        search_query: searchQuery || undefined,
        item_title:   itemTitle || undefined,
        start_index:  startIndex ?? undefined,
        start_item_id: startItemId || undefined,
    });
}

/**
 * Remove a single track from the queue by its stable MPD song id (QueueItem.queue_id).
 * Reindex-safe (deleteid), unlike removing by position.
 * @param {string} sourceId - Active source (required).
 * @param {string|number} queueId - The item's queue_id (MPD song id).
 */
export function removeQueueItem(sourceId, queueId) {
    return apiDelete(`/library/queue/${queueId}?source_id=${encodeURIComponent(sourceId)}`);
}

/**
 * Ids of the user's favorited items on a streaming source (v1: albums). Used to
 * render the accurate favorite (★) state on browse/search grids.
 * @param {string} sourceId - Streaming source (src_qobuz / src_tidal / src_highresaudio).
 * @param {string} [itemType='album']
 * @returns {Promise<string[]>}
 */
export async function fetchFavoriteIds(sourceId, itemType = 'album') {
    const r = await apiGet(`/library/favorite-ids?source_id=${encodeURIComponent(sourceId)}&item_type=${itemType}`);
    return r?.ids ?? [];
}

/**
 * Add an item to the user's favorites on its streaming source.
 * @param {string} sourceId
 * @param {string} itemId
 * @param {string} [itemType='album']
 */
export function addFavorite(sourceId, itemId, itemType = 'album') {
    return apiPost('/library/favorite', { source_id: sourceId, item_id: itemId, item_type: itemType });
}

/**
 * Remove an item from the user's favorites on its streaming source.
 * @param {string} sourceId
 * @param {string} itemId
 * @param {string} [itemType='album']
 */
export function removeFavorite(sourceId, itemId, itemType = 'album') {
    return apiDelete(`/library/favorite?source_id=${encodeURIComponent(sourceId)}&item_id=${encodeURIComponent(itemId)}&item_type=${itemType}`);
}

// ---------------------------------------------------------------------------
// The account's playlists (v1: HIGHRESAUDIO — PLAYLIST_EDIT_SOURCES)
// ---------------------------------------------------------------------------
// No write below is retried automatically (`false`): a request whose answer was lost
// on the way back would be sent twice — a second playlist for a creation, an error
// for a deletion that had in fact gone through. The reason is shown and the person
// tries again.

/**
 * Window event announced after a write that changed a streaming account's playlists.
 * The grid of the account's playlists and an open playlist page read theirs again on
 * it, whichever screen made the change. detail: `{ sourceId, playlistId }`.
 */
export const PLAYLISTS_CHANGED_EVENT = 'ag-playlists-changed';

/**
 * @param {string} sourceId
 * @param {string} [playlistId] - '' when the write names none.
 */
function announcePlaylistChange(sourceId, playlistId) {
    window.dispatchEvent(new CustomEvent(PLAYLISTS_CHANGED_EVENT, {
        detail: { sourceId, playlistId: playlistId ?? '' },
    }));
}

/**
 * The reason to show for a failed request: the core's own words when it gave some.
 * Not getUserFriendlyError: that one answers a 400 with a generic sentence, and the
 * core's refusals here are precise ("This playlist no longer exists").
 *
 * @param {Error & {detail?: string}} err
 * @returns {string}
 */
export const failureReason = (err) => err?.detail || err?.message || 'The request failed.';

/**
 * The tracks of a playlist, the account's own or the service's.
 *
 * @param {string} sourceId
 * @param {string} playlistId - As the browse lists it (`mine:5549`, `editorial:791`).
 * @returns {Promise<Array<object>>} LibraryTrack entries. A track's position in this
 *   list is the `startIndex` queueItem takes to play the playlist from it.
 */
export async function fetchPlaylistTracks(sourceId, playlistId) {
    const params = new URLSearchParams({ source_id: sourceId, playlist_id: playlistId });
    const tracks = await apiGet(`/library/playlist-tracks?${params}`);
    return Array.isArray(tracks) ? tracks : [];
}

/**
 * Create a playlist in the account behind a streaming source.
 *
 * @param {{sourceId: string, title: string, description?: string}} opts
 * @returns {Promise<{id: string, title: string}>} Its id as the browse lists it.
 */
export async function createPlaylist({ sourceId, title, description = '' }) {
    const created = await apiPost('/library/playlists', {
        source_id: sourceId, title, description,
    }, false);
    announcePlaylistChange(sourceId, created?.id);
    return created;
}

/**
 * Add a track or a whole album to one of the account's playlists. The core writes
 * only what the playlist lacks.
 *
 * @param {{sourceId: string, playlistId: string, itemId: string,
 *          itemType: 'track'|'album'}} opts
 * @returns {Promise<{added: number, already: number}>}
 */
export async function addToPlaylist({ sourceId, playlistId, itemId, itemType }) {
    const result = await apiPost('/library/playlists/add', {
        source_id: sourceId, playlist_id: playlistId, item_id: itemId, item_type: itemType,
    }, false);
    if (result?.added) announcePlaylistChange(sourceId, playlistId);
    return result;
}

/**
 * Take a track out of one of the account's playlists — every copy of it, which is
 * what the service does.
 *
 * @param {{sourceId: string, playlistId: string, itemId: string}} opts
 * @returns {Promise<{removed: number}>} 1 when it was taken out, 0 when the playlist
 *   no longer held it.
 */
export async function removeFromPlaylist({ sourceId, playlistId, itemId }) {
    const result = await apiPost('/library/playlists/remove', {
        source_id: sourceId, playlist_id: playlistId, item_id: itemId,
    }, false);
    if (result?.removed) announcePlaylistChange(sourceId, playlistId);
    return result;
}

/**
 * Save the name, and the description, of one of the account's playlists. The service
 * replaces both together; a description left out is read back and kept by the core,
 * and an empty one clears it.
 *
 * @param {{sourceId: string, playlistId: string, title: string, description?: string}} opts
 * @returns {Promise<{id: string, title: string}>}
 */
export async function renamePlaylist({ sourceId, playlistId, title, description }) {
    const saved = await apiPut('/library/playlists', {
        source_id: sourceId, playlist_id: playlistId, title, description,
    }, false);
    announcePlaylistChange(sourceId, playlistId);
    return saved;
}

/**
 * Delete one of the account's playlists.
 *
 * @param {{sourceId: string, playlistId: string}} opts
 * @returns {Promise<{deleted: boolean}>}
 */
export async function deletePlaylist({ sourceId, playlistId }) {
    const params = new URLSearchParams({ source_id: sourceId, playlist_id: playlistId });
    const result = await apiDelete(`/library/playlists?${params}`, false);
    announcePlaylistChange(sourceId, playlistId);
    return result;
}

/**
 * Play a UPnP `res` URI on the given source.
 * @param {object} opts
 * @param {string} opts.sourceId  - Active source.
 * @param {string} opts.res       - DIDL-Lite `res` URI of the item.
 * @param {string} [opts.title]   - Track title (recommended; the backend uses
 *                                  it to register MPD stream titles since MPD
 *                                  otherwise falls back to the file path).
 * @param {string} [opts.artUri]  - Optional cover URL.
 * @param {number} [opts.duration] - Optional duration in seconds.
 * @param {string} opts.action    - 'play' | 'add'.
 */
export function upnpPlay({ sourceId, res, title, artUri, duration, serverName, action }) {
    // HQPlayer routing is decided by the backend (see queueItem).
    return apiPost('/library/upnp-play', {
        source_id:   sourceId,
        res,
        title,
        art_uri:     artUri || null,
        server_name: serverName || null,
        duration:    duration ?? null,
        action,
    });
}

/**
 * Execute a Roon browse action (Play Now, Add to Queue, …) by item_key.
 * @param {string} zoneId
 * @param {string} itemKey
 */
export function roonAction(zoneId, itemKey) {
    const params = new URLSearchParams({ zone_id: zoneId, item_key: itemKey });
    return apiPost(`/library/roon-action?${params}`, {});
}

/**
 * Wrap queueItem with success/error toast feedback.
 * Shared by ag-library-search and ag-library-browse to avoid duplicate toast logic.
 *
 * @param {Function} queueFn  - Async function that performs the queue operation.
 * @param {string}   label    - Human-readable item name shown in the toast.
 */
export async function queueWithFeedback(queueFn, label = '') {
    try {
        await queueFn();
        showToast('success', 'Added to queue', label || 'Item');
    } catch (e) {
        console.error('[library] add to queue failed:', e);
        showToast('error', 'Add failed', e?.message || 'Could not add to queue');
    }
}

/**
 * Run a play action, surfacing a failure as a toast.
 *
 * The backend explains precisely why a play was refused — an expired stream, an
 * unreachable UPnP server, a source that cannot be routed to the current output.
 * Every play entry point used to drop that explanation into console.error, so a
 * refused play looked exactly like a click that did nothing. This relays the
 * server's own wording instead of inventing a second vocabulary for it.
 *
 * Failure only: a successful play is already announced by the music starting and
 * the player opening, so a toast there would be noise.
 *
 * @param {Function} playFn - Async function performing the play request.
 * @returns {Promise<boolean>} True when the play was accepted — callers use it to
 *                             decide whether to open the now-playing view.
 */
export async function playWithFeedback(playFn) {
    const notice = setTimeout(
        () => showToast('info', 'Starting playback',
                        'Sending the tracks to the player…', PLAY_NOTICE_DURATION),
        PLAY_NOTICE_AFTER);
    try {
        warnAboutRefusedTracks(await playFn());
        return true;
    } catch (e) {
        console.error('[library] play failed:', e);
        showToast('error', 'Playback failed', e?.message || 'Could not start playback');
        return false;
    } finally {
        clearTimeout(notice);
    }
}

/**
 * How long a play may take before the interface admits it is working on it.
 *
 * A push to HQPlayer is not instant: it goes out as one exchange — stop, clear,
 * one add per track, read back, play — and HQPlayer answers the first command
 * of a connection only after an announcement delay of its own. MEASURED
 * (2026-09-22) against HQPlayer Embedded on the box, which is the quick case:
 * 0.47 s for a single track, 1.86 s for eight, 2.39 s for sixteen. A remote
 * instance is slower still — 2.37 s before it answers anything at all. Until
 * this notice, those seconds passed with nothing on screen, and the album was
 * clicked again.
 *
 * Above the one-track figure and below the eight-track one, so a single track —
 * the common click, and the one that feels instant — says nothing at all.
 */
const PLAY_NOTICE_AFTER = 1500;

/** Short: the music itself takes over as the feedback, usually within a second. */
const PLAY_NOTICE_DURATION = 2500;

/** How many dropped titles the notice names before trailing off. */
const MAX_NAMED_REFUSALS = 5;

/**
 * Warn about the tracks HQPlayer dropped from a push that otherwise succeeded.
 *
 * HQPlayer answers "OK" to a URL it then drops without an error of its own — a
 * file it cannot open, an address it cannot reach — and the only trace is the
 * entry missing from its playlist. `POST /library/queue` reports that: `tracks`
 * is what it kept, `refused` how many it lost and `refused_titles` which ones
 * (empty when a CDN redirect hides them). Nothing read those fields, so an
 * album simply played short, with nothing said.
 *
 * A warning and not an error, because what was kept IS playing: this explains a
 * gap. Only a play can get here — a play that keeps nothing, and an add that
 * loses anything, answer 503 and travel as errors (see API.md, /library/queue).
 *
 * @param {object} [result] - The queue response, when the caller returned one.
 */
function warnAboutRefusedTracks(result) {
    const refused = result?.refused;
    if (!refused) return;
    const titles = result.refused_titles || [];
    const named = titles.slice(0, MAX_NAMED_REFUSALS).join(', ')
        + (titles.length > MAX_NAMED_REFUSALS ? '…' : '');
    const kept = result.tracks;
    const what = refused === 1 && named
        ? `HQPlayer could not open ${named}`
        : `HQPlayer could not open ${refused} of ${refused + (kept || 0)} tracks`
          + (named ? `: ${named}` : '');
    showToast('warning', 'Some tracks were skipped', `${what}.`);
}
