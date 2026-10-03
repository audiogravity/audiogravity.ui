/**
 * js/core/codemirror.js and js/core/load-codemirror.js — the CodeMirror both editors get.
 *
 * The editors name modes and options that CodeMirror only knows once the matching file
 * has run. A mode left out falls back to plain text and an option left out is ignored —
 * both without a word. So every mode and option the editors configure is checked against
 * the instance the loader hands out, the modes taken from the Expert editor's own table
 * rather than copied here.
 *
 * Covers:
 * 1. the loader resolves to CodeMirror 5, the same instance on every call
 * 2. every mode the Expert editor maps a format to, and the JSON editor's, is registered
 * 3. the options and fold helpers the JSON editor turns on are registered
 */
import { describe, it, expect, vi } from 'vitest';

// The editor pulls the guided view (API and toasts, auth-gated at load); only its mode
// table is read here.
vi.mock('../components/organisms/ag-guided-config.js', () => ({}));

import { loadCodeMirror } from './load-codemirror.js';
import { AgConfigEditor } from '../components/organisms/ag-config-editor.js';

const CodeMirror = await loadCodeMirror();

describe('the CodeMirror the editors load', () => {
    it('is CodeMirror 5, the same instance on every call', async () => {
        expect(typeof CodeMirror).toBe('function');
        expect(CodeMirror.version).toMatch(/^5\./);
        expect(await loadCodeMirror()).toBe(CodeMirror);
    });

    it.each(['ini', 'conf', 'libconfig', 'xml', 'something-else'])(
        'knows the mode the Expert editor uses for %s', (format) => {
            const mode = AgConfigEditor.prototype._getCodeMirrorMode(format);
            // An unknown mode does not throw: it resolves to the plain-text mode, 'null'.
            expect(CodeMirror.getMode({}, mode).name, `${format} → ${mode}`).not.toBe('null');
        });

    it('knows the JSON editor\'s mode', () => {
        expect(CodeMirror.getMode({}, { name: 'javascript', json: true }).name).toBe('javascript');
    });

    it('knows the options the JSON editor turns on', () => {
        // defineOption() adds each to the defaults; an option nobody defined is dropped.
        for (const option of ['foldGutter', 'matchBrackets', 'autoCloseBrackets']) {
            expect(CodeMirror.defaults, option).toHaveProperty(option);
        }
        // What the fold gutter folds with: braces and comments.
        expect(typeof CodeMirror.fold?.brace).toBe('function');
        expect(typeof CodeMirror.fold?.comment).toBe('function');
    });
});
