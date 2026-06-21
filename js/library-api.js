/**
 * @module LibraryApi
 * @description Typed helpers around the backend /library/* endpoints.
 * Centralizes request body shapes so callers don't repeat the snake-case mapping
 * and the conditional-undefined dance on every callsite.
 */

import { apiPost, apiDelete } from './api.js';
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
    // Route through HQPlayer when the user has enabled it as output.
    // The flag is set by ag-hqplayer-output's "Use as output" toggle.
    if (localStorage.getItem('hqplayer_output') === 'true') {
        return apiPost('/hqplayer/play-library', {
            item_id:   itemId,
            item_type: itemType,
            action,
            source_id: sourceId,
        });
    }

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
 * Remove a single track from the queue by position.
 * @param {string} sourceId - Active source (required).
 * @param {number} position - 0-based position in the queue.
 */
export function removeQueueItem(sourceId, position) {
    return apiDelete(`/library/queue/${position}?source_id=${encodeURIComponent(sourceId)}`);
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
    // Route UPnP play through HQPlayer when the user has enabled it as output.
    if (localStorage.getItem('hqplayer_output') === 'true') {
        return apiPost('/hqplayer/play', { uri: res, title, art_uri: artUri || null, duration: duration || null });
    }

    return apiPost('/library/upnp-play', {
        source_id:   sourceId,
        res,
        title,
        art_uri:     artUri || null,
        server_name: serverName || null,
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
