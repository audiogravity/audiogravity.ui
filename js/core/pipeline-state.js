/**
 * @module pipeline-state
 * @description The audio pipeline the page knows: the newest one the core has sent.
 *
 * On a computer two components show it side by side, the diagram and the phone's list.
 * Each kept its own copy, read when it opened and replaced by every live update
 * ('audio-pipeline-update'), whatever its age:
 * - a reading that came back after a live update put the older state back;
 * - offline, pwa-manager.js replays the pipeline it saved, up to 5 s old, and the diagram's
 *   Audio events wrote the difference up as playbacks;
 * - a component opened again shortly after another had read the pipeline started from a
 *   state older than the updates it had not been there to hear;
 * - opened together, the two asked the core twice — about 570 ms of server time per
 *   reading on the box (CLAUDE.md rule 12).
 *
 * Every pipeline carries the moment the core started computing it, `timestamp`: a
 * pipeline older than the one already held changes nothing. This module holds the newest
 * one for the page, also while no component shows it, and reads the core only when it
 * holds none — the core hands the last pipeline to a screen joining its stream, too.
 */
import { apiGet } from '../api.js';

/** The newest pipeline seen on this page, or null before the first one. */
let latest = null;

/** The reading of the core in flight, shared by the callers of the moment. */
let reading = null;

/**
 * The instant an ISO 8601 stamp names, in milliseconds, its microseconds kept.
 *
 * Compared as instants, never as text: the core stamps a pipeline in universal time with
 * its offset — written "…Z" over REST and "…+00:00" over the stream (read on the dev
 * instance, 2026-10-04) — and stamped it in local time without one, where the hour
 * repeated when the clocks go back sorted before the one already shown: the page kept
 * the older pipeline for an hour (review, 2026-10-04). Date.parse reads three digits of
 * a fraction, the core writes six — the other three are added back. A stamp without an
 * offset is local time, as Date.parse reads it.
 *
 * @param {string|undefined} stamp - The `timestamp` of a pipeline.
 * @returns {number} Milliseconds since the epoch, NaN when it names no instant.
 */
export function instantOf(stamp) {
    // The shape matched in full: past it, Date.parse guesses — "soon.000" is the year 2000.
    const parts = typeof stamp === 'string'
        && /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})?$/.exec(stamp);
    if (!parts) return NaN;
    const [, whole, digits = '', zone = ''] = parts;
    return Date.parse(`${whole}.${digits.slice(0, 3).padEnd(3, '0')}${zone}`)
        + Number(`0.${digits.slice(3) || '0'}`);
}

/**
 * Whether a pipeline was computed after another.
 *
 * @param {{timestamp?: string}|null|undefined} candidate - The pipeline just received.
 * @param {{timestamp?: string}|null|undefined} held - The pipeline held until now.
 * @returns {boolean} True when nothing is held, when either carries no instant to
 *   order them by, or when the candidate is the newer; false for no candidate.
 */
export function isNewerPipeline(candidate, held) {
    if (!candidate) return false;
    const next = instantOf(candidate.timestamp);
    const before = instantOf(held?.timestamp);
    if (Number.isNaN(next) || Number.isNaN(before)) return true;
    return next > before;
}

/**
 * Hold a pipeline if it is the newest yet.
 *
 * @param {object|null} pipeline - A pipeline from the core.
 * @returns {object|null} The pipeline held now.
 */
function keep(pipeline) {
    if (isNewerPipeline(pipeline, latest)) latest = pipeline;
    return latest;
}

// Every live update is kept, also while no component listens: one that opens later starts
// from it rather than from a reading of the core, which would cost the box a computation.
window.addEventListener('audio-pipeline-update', (e) => keep(e.detail));

/**
 * The newest pipeline known: the last live update, or else a reading of the core,
 * shared by every caller of the moment.
 *
 * @returns {Promise<object|null>} The pipeline; rejects when the core could not be read.
 */
export function currentPipeline() {
    if (latest) return Promise.resolve(latest);
    reading ??= apiGet('/audio_pipeline/current')
        .then(keep)
        .finally(() => { reading = null; });
    return reading;
}
