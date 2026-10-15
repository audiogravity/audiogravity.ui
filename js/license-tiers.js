/**
 * @module licenseTiers
 * @description What the Pro edition opens on this box, as the core answers it.
 *
 * The core decides both questions (`modules/license/editions.py`) and publishes the answers:
 * - whether this box has Pro — `pro` on `GET /license/status`;
 * - whether a source is a Pro one — `pro` on each entry of the player's `sources[]`, and on
 *   the player state for what plays.
 *
 * This module reads them and keeps no list of its own. The list of statuses it used to keep
 * disagreed with the core: `tampered` showed every Pro tab open while every gate of the core
 * refused it.
 *
 * It also holds the box's licence once read, for what mounts after the tab bar read it —
 * the library's views, the players.
 */

/**
 * Statuses that open Pro, read only from a core that does not publish `pro` yet.
 * Mirror of `PRO_STATUSES` in the core's `modules/license/editions.py`: anything else locks.
 *
 * @type {ReadonlyArray<string>}
 */
const PRO_STATUSES = Object.freeze(['lifetime', 'trial']);

/** @type {object|null} The box's last `GET /license/status` answer; null until read. */
let current = null;

/**
 * The status of a licence, whether given whole or as a bare status.
 *
 * @param {object|string|null|undefined} license
 * @returns {string|null|undefined}
 */
function statusOf(license) {
    return license !== null && typeof license === 'object' ? license.status : license;
}

/**
 * Whether the Pro features are open.
 *
 * @param {object|string|null} [license] - A `/license/status` answer, or a bare status; the
 *   box's licence once read when omitted.
 * @returns {boolean} True when Pro is open — and while the licence is not read yet: the
 *   padlocks appear once it is, and the core refuses what it must in the meantime.
 */
export function isLicensed(license = current) {
    if (license === null || license === undefined) return true;
    if (typeof license === 'object' && typeof license.pro === 'boolean') return license.pro;
    return PRO_STATUSES.includes(statusOf(license));
}

/**
 * What a Pro feature shows: nothing yet, its padlock, or itself.
 *
 * `unknown` while the licence is not read: a Pro section that would call the core waits
 * rather than be refused on a Starter box, and shows no padlock that a box with Pro would
 * see flash.
 *
 * @param {object|string|null} [license] - As for {@link isLicensed}; the box's licence once
 *   read when omitted.
 * @returns {'unknown'|'locked'|'open'}
 */
export function proState(license = current) {
    if (license === null || license === undefined) return 'unknown';
    return isLicensed(license) ? 'open' : 'locked';
}

/**
 * Whether the generic "get a licence" prompt is the right thing to offer.
 *
 * `version_expired` is excluded: the licence panel gives it its own upgrade flow, at a
 * preferential rate, and the generic window would talk about the wrong purchase.
 *
 * @param {object|string|null} [license] - As for {@link isLicensed}.
 * @returns {boolean} True when the prompt helps rather than misleads.
 */
export function shouldPromptForLicense(license = current) {
    return !isLicensed(license) && statusOf(license) !== 'version_expired';
}

/**
 * Record the box's licence and tell every listener (`license-status`, detail = the answer).
 *
 * @param {object|null} license - The `/license/status` answer; null forgets it.
 */
export function setLicense(license) {
    current = license ?? null;
    window.dispatchEvent(new CustomEvent('license-status', { detail: current }));
}

/**
 * The box's licence, once read.
 *
 * @returns {object|null}
 */
export function currentLicense() {
    return current;
}

/**
 * Whether using a source — browsing it, queueing from it, controlling what it plays — is a
 * Pro feature, as the core publishes it.
 *
 * Absent `pro` (a core older than the field) reads as "not Pro": such a core refuses
 * nothing to any source, so a padlock would lock what it serves.
 *
 * @param {{pro?: boolean}|null|undefined} source - An entry of `sources[]`, the player
 *   state, or anything else the core marks the same way (a service of the Config tab).
 * @returns {boolean}
 */
export function isProSource(source) {
    return source?.pro === true;
}

/**
 * Whether a source is behind a padlock on this box: a Pro source, and Pro not open.
 *
 * @param {{pro?: boolean}|null|undefined} source - As for {@link isProSource}.
 * @param {object|string|null} [license] - As for {@link isLicensed}.
 * @returns {boolean}
 */
export function isLockedSource(source, license = current) {
    return isProSource(source) && !isLicensed(license);
}

/**
 * Take the user to the licence panel: the Admin tab, with the activation window when it is
 * the right thing to offer. What tapping any padlock does — a locked tab included, which
 * is why the tab bar hands itself over rather than be looked up.
 *
 * @param {object|string|null} [license] - As for {@link isLicensed}.
 * @param {object} [options]
 * @param {boolean} [options.keepOpen=false] - Leave the tab column open (`selectTab`).
 * @param {{selectTab: Function}|null} [options.tabs] - The tab bar; the page's own when omitted.
 */
export function openLicensePanel(license = current, { keepOpen = false, tabs } = {}) {
    (tabs ?? document.querySelector('ag-tabs'))?.selectTab('admin', { keepOpen });
    if (shouldPromptForLicense(license)) window.EventEmitter?.emit('show-license-modal');
}
