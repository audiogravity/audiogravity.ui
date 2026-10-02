/**
 * @module versions
 * @description Version strings as the boxes and the licence server write them —
 * `v0.9.65`, `0.9.65`, `0.9.65-dev`, `0.9.65+build` — read as one release number.
 */

/**
 * A version as a bare release number: no leading `v`, no `-dev` or `+build` suffix
 * ("v0.9.10-dev" → "0.9.10"). The core's updater compares versions the same way
 * (`health_ok` in self-update.sh).
 * @param {*} version - A version string, or nothing.
 * @returns {string} The bare number, or '' for nothing.
 */
export function bareVersion(version) {
    return String(version || '').trim().replace(/^v/i, '').split('-')[0].split('+')[0];
}
