/**
 * @module codemirror
 * @description CodeMirror 5 as AG's two editors use it: the library, the four modes
 * they configure and the six addons the JSON editor turns on. The expert-mode editor
 * (ag-config-editor) and the JSON editor (ag-json-config-modal) both take it from here.
 *
 * **Never import it statically** — go through loadCodeMirror() (js/core/load-codemirror.js),
 * which imports it dynamically. ag-json-config-modal is part of the main bundle (main.js
 * imports it), so one static import would put the whole editor on every start of the app,
 * for a window most sessions never open. Dynamically imported, it is a chunk of its own,
 * fetched from the box the first time an editor opens. js/module-imports.test.js holds
 * that line.
 *
 * It used to come from jsDelivr: eleven `<script defer>` in index.html, without an
 * integrity hash, fetched on every page load whether an editor opened or not, and two
 * stylesheets in the `<head>` that held the first paint until the CDN answered.
 *
 * The stylesheets are not imported here: css/main.css carries them, ahead of AG's own
 * overrides, and says why the order matters.
 */
import CodeMirror from 'codemirror';
// Modes: properties = INI and .conf, clike = libconfig (as text/x-csrc), xml,
// javascript = JSON.
import 'codemirror/mode/properties/properties.js';
import 'codemirror/mode/clike/clike.js';
import 'codemirror/mode/xml/xml.js';
import 'codemirror/mode/javascript/javascript.js';
// Addons the JSON editor enables: folding (and its gutter), bracket matching and
// auto-closing.
import 'codemirror/addon/fold/foldcode.js';
import 'codemirror/addon/fold/foldgutter.js';
import 'codemirror/addon/fold/brace-fold.js';
import 'codemirror/addon/fold/comment-fold.js';
import 'codemirror/addon/edit/matchbrackets.js';
import 'codemirror/addon/edit/closebrackets.js';

export default CodeMirror;
