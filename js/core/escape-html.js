/**
 * @module escape-html
 * @description Escape text for an HTML element body.
 *
 * On its own, with no import and no side effect, so that any module can use it. Its former
 * home, `common.js`, runs the page's authentication guard as it loads: a module importing
 * it for this one function pulled that guard in too — and threw in a test.
 */

/**
 * Escape HTML special characters to prevent XSS.
 *
 * Exactly what a browser escapes when it serialises a text node — `&`, `<`, `>`, and a
 * no-break space written `&nbsp;` — so the output is the same as the `textContent` /
 * `innerHTML` round trip this function used to make, without building an element per call
 * or needing a document. Quotes are not escaped: safe in an element body, not in an
 * attribute value.
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML (a non-string is returned unchanged)
 */
export function escapeHtml(text) {
    if (typeof text !== 'string') return text;
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\u00a0/g, '&nbsp;');
}
