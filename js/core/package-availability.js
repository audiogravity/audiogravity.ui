/**
 * @module package-availability
 * @description What to call each availability verdict the core gives for a package
 * (`GET /packages/`, and the support report's `packages` section), so the software
 * card and the support report say the same thing.
 *
 * The core tells three cases apart and they are not equivalent for the reader: "the
 * vendor publishes nothing for this box" is permanent, "the source could not be
 * reached" is worth retrying, and "another installed package forbids it" is something
 * the user can act on. The support report used to fold all three into "not supported
 * on this architecture" — false for the last two on a box whose architecture is.
 */

/** Words per verdict; `fallback` stands in when the core sends no reason. */
const WORDS = {
    unsupported: { label: 'Not available here', fallback: 'no build for this system' },
    unknown: { label: 'Cannot be checked', fallback: 'the source could not be reached' },
    blocked: { label: 'Unavailable', fallback: 'another installed package prevents it' },
};

/**
 * Describe why a package cannot be installed here.
 *
 * A verdict this module does not know yet degrades to a neutral word rather than to
 * a vendor claim that may be false — "no build for this system" is wrong for a
 * local conflict.
 * @param {string|null|undefined} availability - The core's verdict.
 * @param {string|null|undefined} reason - The core's sentence, when it sent one.
 * @returns {{label: string, reason: string}|null} Null when the package is available,
 *   or when the core sent no verdict at all (a core older than the field).
 */
export function describeAvailability(availability, reason) {
    if (!availability || availability === 'available') return null;
    const words = WORDS[availability] || { label: 'Unavailable', fallback: '' };
    return { label: words.label, reason: reason || words.fallback };
}
