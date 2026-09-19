/**
 * @module metrics-window
 * @description How many measurements a sparkline window holds, in one place.
 *
 * The history that keeps the measurements and the chart that places them on a
 * fixed window have to agree on this number: if the chart's window is wider than
 * the history, the left of every chart stays empty for good; if it is narrower,
 * the oldest measurements are kept and never shown.
 *
 * These are counts of measurements, not durations. The core sends them at an
 * adaptive rate (2 s while something is active, 10 s by default, 30 s at rest —
 * `AdaptiveMonitoring` in audiogravity.core), so the time a full window covers
 * varies; a chart that states a duration must derive it from timestamps.
 */

/** Per-service metrics on the Services tab (CPU, MEM, NET, DISK boxes). */
export const SERVICE_METRICS_WINDOW = 30;

/** Machine-wide metrics on the System tab (CPU, memory, temperature, disk, network tiles). */
export const SYSTEM_METRICS_WINDOW = 60;

/**
 * Longest silence between two samples still drawn as one continuous series: three
 * times the core's slowest rate (30 s at rest). Beyond it the stream was cut — the
 * app hidden (sse.js closes the stream), offline, or a history restored from an
 * earlier visit — and a gap is inserted so old and new samples are not drawn side
 * by side as if they were consecutive.
 */
export const MAX_SAMPLE_GAP_MS = 90_000;

/**
 * Whether a value is a measurement: a finite number. null, undefined and NaN are
 * "not measured" — a gap in a chart, never a zero.
 * @param {*} value
 * @returns {boolean}
 */
export const isMeasured = (value) => typeof value === 'number' && Number.isFinite(value);

/**
 * A NEW array: `series` followed by `value`, keeping the last `size` entries. New
 * rather than pushed in place, because a chart redraws only when it is handed a
 * different array.
 * @param {Array} series - Current series (may be undefined).
 * @param {*} value - Entry to append, as is.
 * @param {number} size - Maximum length.
 * @returns {Array}
 */
export function appendBounded(series, value, size) {
    return [...(series || []), value].slice(-size);
}

/**
 * appendBounded for chart data: anything that is not a measurement is stored as null.
 * @param {Array<number|null>} series - Current series.
 * @param {*} value - Sample as received.
 * @param {number} size - Window size.
 * @returns {Array<number|null>}
 */
export function appendMeasured(series, value, size) {
    return appendBounded(series, isMeasured(value) ? value : null, size);
}
