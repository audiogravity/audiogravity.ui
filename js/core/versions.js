/**
 * @module versions
 * @description Version strings as the boxes and the licence server write them —
 * `v0.9.65`, `0.9.65`, `0.9.65-dev`, `0.9.65+build` — read as one release number, and a
 * pre-release — `1.0.0-rc.1` — as a release of its own.
 */

/**
 * A version as a bare release number: no leading `v`, no `-dev` or `+build` suffix
 * ("v0.9.10-dev" → "0.9.10"). A pre-release stays ("1.0.0-rc.1"): stripped down to
 * "1.0.0", a failed update to a release candidate was shown against the offer of its
 * final release. The core's updater reads versions the same way (`health_ok` in
 * self-update.sh).
 * @param {*} version - A version string, or nothing.
 * @returns {string} The bare number, or '' for nothing.
 */
export function bareVersion(version) {
    const v = String(version || '').trim().replace(/^v/i, '').split('+')[0];
    return v.endsWith('-dev') ? v.slice(0, -'-dev'.length) : v;
}
