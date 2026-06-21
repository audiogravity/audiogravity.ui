/**
 * @module PlayerApi
 * @description Typed helpers around the backend /player/* endpoints that
 * aren't covered by the SSE/snapshot fetched via `library-store`. Mirrors
 * the `library-api.js` pattern.
 */

import { apiGet, apiPost, apiDelete } from './api.js';

/**
 * Resolve the active sleep timer.
 * @returns {Promise<{ sleep_end: string|null }>}
 */
export function getSleepTimer() {
    return apiGet('/player/sleep-timer');
}

/**
 * Arm a backend-side sleep timer. The backend pauses playback when the
 * timer expires — survives client disconnects, browser/app close, etc.
 * @param {number} minutes - 1..720.
 * @returns {Promise<{ sleep_end: string }>}
 */
export function setSleepTimer(minutes) {
    return apiPost('/player/sleep-timer', { minutes });
}

/**
 * Cancel the active sleep timer.
 * @returns {Promise<{ sleep_end: null }>}
 */
export function cancelSleepTimer() {
    return apiDelete('/player/sleep-timer');
}
