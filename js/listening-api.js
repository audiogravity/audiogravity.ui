/**
 * @module ListeningApi
 * @description Typed helpers around the core's /listening/* endpoints: the history of
 * what the box played. It records on every edition; its summary is Pro, while switching
 * it off and erasing it stay open to Starter (a box that records must let its owner
 * stop it).
 */

import { apiGet, apiPut, apiDelete } from './api.js';

/** The periods the summary offers, in the order the view shows them. */
export const LISTENING_PERIODS = [
    { value: '7d',  label: '7 days' },
    { value: '30d', label: '30 days' },
    { value: '12m', label: '12 months' },
    { value: 'all', label: 'All' },
];

/**
 * What the box played over a period (Pro).
 *
 * @param {'7d'|'30d'|'12m'|'all'} period - The period.
 * @returns {Promise<object>} The `ListeningSummary` (API.md, /listening/summary).
 */
export function listeningSummary(period) {
    return apiGet(`/listening/summary?period=${encodeURIComponent(period)}`);
}

/**
 * Whether the history records, how many listens it counts — those in progress too — since when.
 *
 * @returns {Promise<{recording: boolean, listens: number, since: (string|null)}>}
 */
export function listeningSettings() {
    return apiGet('/listening/settings');
}

/**
 * Switch the recording on or off. Off, the listen in progress is dropped too.
 *
 * @param {boolean} recording - Whether listens are recorded.
 * @returns {Promise<{recording: boolean, listens: number, since: (string|null)}>}
 */
export function setListeningRecording(recording) {
    return apiPut('/listening/settings', { recording });
}

/**
 * Erase the history.
 *
 * @returns {Promise<null>} The core answers 204.
 */
export function clearListeningHistory() {
    return apiDelete('/listening/history');
}
