/**
 * @module load-codemirror
 * @description The way into js/core/codemirror.js for the two editors that use it — the
 * expert-mode editor (ag-config-editor) and the JSON editor (ag-json-config-modal).
 *
 * A module of its own so that it can be imported statically while what it loads cannot:
 * the import below is dynamic, so the bundler makes CodeMirror a chunk fetched the first
 * time an editor opens, instead of a part of every start (ag-json-config-modal is in the
 * main bundle). It is also the seam the editors' tests replace, to load the library or
 * to fail to.
 */

/**
 * Load CodeMirror 5 with every mode and addon AG's editors configure.
 *
 * The browser keeps the module once it has arrived, so every later call resolves at once.
 *
 * @returns {Promise<Function>} The CodeMirror constructor.
 */
export function loadCodeMirror() {
    return import('./codemirror.js').then(module => module.default);
}
