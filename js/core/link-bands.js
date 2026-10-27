/**
 * @module LinkBands
 * @description The bands a link's figures fall in — its latency and its buffer fill — as the
 * Pipeline writes them and the latency test's histogram draws them. The thresholds live here
 * and nowhere else: the colours and the legends that give them both read them (rule 9 — DRY;
 * the latency thresholds were written in three places, the buffer's in two, until 2026-10-26).
 */

/** Where each latency band starts, in microseconds; under the first is 'excellent'. */
export const LATENCY_BANDS = Object.freeze({ good: 50, average: 200, critical: 500 });

/**
 * The band a latency falls in.
 *
 * @param {number} us - A latency, in microseconds. What is not one — undefined, NaN — falls
 *   in the first band, as the Pipeline drew it before this module.
 * @returns {'excellent'|'good'|'average'|'critical'} The band, which names its colours:
 *   --histogram-<band> for a bar, --latency-text-<band> for a figure written as text.
 */
export function latencyBand(us) {
    if (!(us >= LATENCY_BANDS.good)) return 'excellent';
    if (us < LATENCY_BANDS.average) return 'good';
    if (us < LATENCY_BANDS.critical) return 'average';
    return 'critical';
}

/** Where each buffer-fill band starts, in percent; under the first is 'healthy'. */
export const BUFFER_BANDS = Object.freeze({ warning: 80, critical: 90 });

/**
 * The band a buffer fill falls in.
 *
 * @param {number} percent - How full the buffer is, 0 to 100. What is not a number falls in
 *   the first band, as the Pipeline drew it.
 * @returns {'healthy'|'warning'|'critical'} The band, which names its text colour:
 *   --buffer-text-<band>.
 */
export function bufferBand(percent) {
    if (percent >= BUFFER_BANDS.critical) return 'critical';
    if (percent >= BUFFER_BANDS.warning) return 'warning';
    return 'healthy';
}
