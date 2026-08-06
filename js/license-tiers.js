/**
 * @module licenseTiers
 * @description Which licence statuses leave the paid features locked.
 *
 * The list was written out inline wherever a feature had to be gated — the tab bar and the
 * fullscreen player each carried their own copy. Adding a status meant finding every copy,
 * and a missed one leaves a feature open to a box that has not paid for it, silently.
 *
 * Statuses come from the core's `/license/status` (`LicenseStatus.status`). Keep this in step
 * with `modules/license/models.py`.
 */

/**
 * Statuses under which the Pro features stay locked.
 *
 * - `starter` — the free tier, after a trial ran out.
 * - `version_expired` — a licence still valid in time, bought for an earlier major version.
 * - `expired` — a time-limited licence that reached its end date. The customer paid and his
 *   term ended; he keeps Starter, exactly like an expired trial, so he is gated the same way.
 *
 * `tampered` and `no_license` are deliberately absent: neither has ever gated a feature here,
 * and adding them would change what those boxes can do, which is a separate decision from
 * naming the end of a paid term.
 *
 * A frozen array, not a frozen Set: `Object.freeze` does not stop `Set.prototype.add`, so
 * `Object.freeze(new Set(…))` reads as a guarantee and provides none — `.add()` still works
 * and `Object.isFrozen` still returns true, which is what made the test asserting it pass.
 *
 * @type {ReadonlyArray<string>}
 */
export const UNLICENSED_STATUSES = Object.freeze(
    ['starter', 'version_expired', 'expired'],
);

/**
 * Whether a licence status unlocks the paid features.
 *
 * @param {string|null|undefined} status - Status from `/license/status`.
 * @returns {boolean} True when the Pro features are available.
 */
export function isLicensed(status) {
    return !UNLICENSED_STATUSES.includes(status);
}

/**
 * Whether the generic "get a licence" prompt is the right thing to offer.
 *
 * `version_expired` is excluded: the licence panel gives it its own upgrade flow, at a
 * preferential rate, and the generic modal would talk about the wrong purchase. Written out
 * inline at each gate, this rule was copied three times — and a rule copied three times is
 * one that will be changed in two places.
 *
 * @param {string|null|undefined} status - Status from `/license/status`.
 * @returns {boolean} True when the prompt helps rather than misleads.
 */
export function shouldPromptForLicense(status) {
    return !isLicensed(status) && status !== 'version_expired';
}
