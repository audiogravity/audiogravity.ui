/**
 * @module test-utils
 * @description Helpers shared by the unit tests. Not loaded by the application.
 */

/**
 * Flatten a mocked lit template into plain text.
 *
 * The suites mock `lit` so that html`` returns `{strings, values}` rather than a
 * TemplateResult, which lets a component's render() be asserted on without a
 * DOM. This walks that structure back into the markup it would produce.
 *
 * Beware when asserting on attribute bindings: a `false` value flattens to the
 * empty string, so `?disabled=${false}` renders as `?disabled=` and an assertion
 * against the text "?disabled=false" can never fail. Assert on the true form.
 *
 * @param {*} node - A mocked template, an array of them, or any renderable value.
 * @returns {string} The flattened markup.
 */
export function flat(node) {
    if (node === null || node === undefined || node === false) return '';
    if (typeof node === 'symbol') return '';
    if (Array.isArray(node)) return node.map(flat).join('');
    if (typeof node === 'object' && node.strings) {
        return node.strings
            .map((s, i) => s + (i < node.values.length ? flat(node.values[i]) : ''))
            .join('');
    }
    if (typeof node === 'function') return '';
    return String(node);
}
