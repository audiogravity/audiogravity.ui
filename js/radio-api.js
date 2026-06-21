/**
 * @module RadioApi
 * @description Typed helpers around the backend /radio/* endpoints (internet
 * radio catalogue via Radio Browser API + saved stations split across two
 * orthogonal collections — My Live Radio and Favorites — + push-to-MPD).
 */

import { apiGet, apiPost, apiPut, apiDelete } from './api.js';

/**
 * Search the Radio Browser catalogue.
 *
 * @param {object} [params]
 * @param {string} [params.q]            - Station name fragment (case-insensitive).
 * @param {string} [params.country_code] - ISO 3166-1 alpha-2 country code (e.g. ``FR``).
 * @param {string} [params.codec]        - MP3 / AAC / FLAC / OGG / OPUS.
 * @param {string} [params.tag]          - Free-form genre tag.
 * @param {boolean}[params.hi_res_only]  - Filter ≥ 256 kbps or lossless codec.
 * @param {number} [params.limit=50]     - 1..200, defaults to 50.
 * @param {number} [params.offset=0]
 * @returns {Promise<{ stations: Array, total: number }>}
 */
export function radioSearch(params = {}) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null || v === '') continue;
        qs.append(k, v);
    }
    const suffix = qs.toString();
    return apiGet(`/radio/search${suffix ? `?${suffix}` : ''}`);
}

/* ─── My Live Radio ──────────────────────────────────────────────── */

/** List My Live Radio entries. */
export function radioLibrary() {
    return apiGet('/radio/library');
}

/**
 * Add an RBI catalogue station to My Live Radio.
 * @param {string} stationUuid
 * @returns {Promise<object>} the saved entry.
 */
export function radioAddToLibrary(stationUuid) {
    return apiPost('/radio/library', { station_uuid: stationUuid });
}

/**
 * Add a user-created station to My Live Radio (bypasses Radio Browser).
 * Re-posting the same `url` refreshes the existing entry in place.
 *
 * @param {object} data
 * @param {string} data.title
 * @param {string} data.url        - must be http:// or https://
 * @param {string} [data.image_url]
 * @param {string} [data.genre]    - comma-separated tags
 * @returns {Promise<object>} the saved entry.
 */
export function radioAddCustomStation(data) {
    return apiPost('/radio/library/custom', data);
}

/**
 * Remove a station from My Live Radio (favorite flag preserved).
 * @param {string} stationUuid
 * @returns {Promise<void>}
 */
export function radioRemoveFromLibrary(stationUuid) {
    return apiDelete(`/radio/library/${stationUuid}`);
}

/* ─── Favorites ──────────────────────────────────────────────────── */

/** List Favorites. */
export function radioFavorites() {
    return apiGet('/radio/favorites');
}

/**
 * Star a station (in_library flag preserved).
 * @param {string} stationUuid
 * @returns {Promise<object>} the saved entry.
 */
export function radioAddFavorite(stationUuid) {
    return apiPost('/radio/favorites', { station_uuid: stationUuid });
}

/**
 * Unstar a station.
 * @param {string} stationUuid
 * @returns {Promise<void>}
 */
export function radioRemoveFavorite(stationUuid) {
    return apiDelete(`/radio/favorites/${stationUuid}`);
}

/* ─── Edit ───────────────────────────────────────────────────────── */

/**
 * Edit a saved station's editable fields in place (full replace).
 * Works on any saved station regardless of which tab(s) it sits in.
 *
 * @param {string} stationUuid
 * @param {object} data — same shape as `radioAddCustomStation`
 * @returns {Promise<object>} the updated entry.
 */
export function radioEditStation(stationUuid, data) {
    return apiPut(`/radio/${stationUuid}`, data);
}

/* ─── Playback ───────────────────────────────────────────────────── */

/**
 * Resolve the station and push it to MPD (clear queue, add, play).
 * @param {string} stationUuid
 * @returns {Promise<object>} the station that was played.
 */
export function radioPlay(stationUuid) {
    return apiPost('/radio/play', { station_uuid: stationUuid });
}
