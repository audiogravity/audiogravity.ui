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

/** Load of each CPU core on the Performance tab (one card per core). */
export const CPU_CORE_METRICS_WINDOW = 60;

/**
 * Longest silence between two samples still drawn as one continuous series: three
 * times the core's slowest rate (30 s at rest). Beyond it the stream was cut — the
 * app hidden (sse.js closes the stream), offline, or a history restored from an
 * earlier visit — and a gap is inserted so old and new samples are not drawn side
 * by side as if they were consecutive.
 */
export const MAX_SAMPLE_GAP_MS = 90_000;

/**
 * Whether a sample arriving now follows a pause in the stream, and so opens a gap.
 * @param {number|undefined} lastSampleAt - Arrival time (ms) of the previous sample, if any.
 * @param {number} now - Arrival time (ms) of the new sample.
 * @returns {boolean}
 */
export function isPause(lastSampleAt, now) {
    return lastSampleAt !== undefined && now - lastSampleAt > MAX_SAMPLE_GAP_MS;
}

/**
 * Time covered by the newest `count` samples — what a chart holding them spans. The
 * core's rate is adaptive, so a count of samples says nothing about minutes on its own.
 * @param {number[]} times - Arrival times (ms) of the samples, oldest first.
 * @param {number} count - How many of the newest samples the chart holds.
 * @returns {number} Milliseconds from the oldest to the newest of them; 0 below two.
 */
export function spanOfLast(times, count) {
    if (count < 2 || times.length < count) return 0;
    return times[times.length - 1] - times[times.length - count];
}

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

/**
 * A chart series with one more sample — after a gap (a null) when the stream paused
 * before it (isPause). Every series of one stream takes each sample through here, and
 * the arrival times through appendSampleTime, so that they stay in step: the Nth value
 * from the end of any series was measured at the Nth time from the end.
 * @param {Array<number|null>} series - Current series.
 * @param {*} value - This sample's reading as received; not a measurement → null.
 * @param {boolean} paused - Whether the stream paused before this sample.
 * @param {number} size - Window size.
 * @returns {Array<number|null>}
 */
export function appendSample(series, value, paused, size) {
    return appendMeasured(paused ? appendMeasured(series, null, size) : series, value, size);
}

/**
 * The arrival times with this sample's — twice after a pause, once for the gap
 * appendSample inserted and once for the sample, both at `now`.
 * @param {number[]} times - Arrival times (ms) so far, oldest first.
 * @param {number} now - Arrival time of this sample.
 * @param {boolean} paused - Whether the stream paused before this sample.
 * @param {number} size - Window size.
 * @returns {number[]}
 */
export function appendSampleTime(times, now, paused, size) {
    return appendBounded(paused ? appendBounded(times, now, size) : times, now, size);
}
