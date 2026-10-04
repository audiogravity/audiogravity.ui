/**
 * @module stored-value
 * @description How the app reads back a value it kept in localStorage.
 *
 * MemoryCache.set (common.js) writes a string as it is and anything else as JSON, so a
 * value comes back as JSON when it parses and as the string itself when it does not.
 * Two readers need that rule — MemoryCache.get, and appearance.js, which also runs on the
 * login page, where common.js is not loaded. public/theme-boot.js keeps its own copy: it
 * runs before any module and can import nothing.
 */

/**
 * A stored value, decoded the way MemoryCache.set encoded it.
 *
 * @param {string} raw - What localStorage.getItem returned (not null).
 * @returns {*} The parsed JSON — a number, a boolean, an object — or the string itself.
 */
export function parseStoredValue(raw) {
    try {
        return JSON.parse(raw);
    } catch {
        return raw;
    }
}
