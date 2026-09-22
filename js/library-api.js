/**
 * @module LibraryApi
 * @description Typed helpers around the backend /library/* endpoints.
 * Centralizes request body shapes so callers don't repeat the snake-case mapping
 * and the conditional-undefined dance on every callsite.
 */

import { apiGet, apiPost, apiDelete } from './api.js';
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
