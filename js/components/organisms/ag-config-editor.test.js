/**
 * Unit tests for ag-config-editor.js.
 *
 * Covers:
 * - disconnectedCallback destroys the CodeMirror instance to prevent memory leaks
 *   (regression for the missing lifecycle cleanup fixed in this review)
 * - disconnectedCallback is safe when CodeMirror has not been initialised yet
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgConfigEditor } from './ag-config-editor.js';

// ag-config-editor uses light DOM (createRenderRoot returns this),
// so standard LitElement rendering works in jsdom.

describe('AgConfigEditor.disconnectedCallback — CodeMirror cleanup', () => {
    let el;

    beforeEach(() => {
        el = new AgConfigEditor();
        // Simulate a mounted CodeMirror instance
        el._cmInstance = null;
    });

    it('calls toTextArea() on the CodeMirror instance and nulls the reference', () => {
        const toTextArea = vi.fn();
        el._cmInstance = { toTextArea };

        el.disconnectedCallback();

        expect(toTextArea).toHaveBeenCalledOnce();
        expect(el._cmInstance).toBeNull();
    });

    it('does not throw when _cmInstance is null (never initialised)', () => {
        el._cmInstance = null;
        expect(() => el.disconnectedCallback()).not.toThrow();
    });

    it('does not call toTextArea after a second disconnectedCallback', () => {
        const toTextArea = vi.fn();
        el._cmInstance = { toTextArea };

        el.disconnectedCallback(); // first: destroys
        el.disconnectedCallback(); // second: already null, must not throw or call again

        expect(toTextArea).toHaveBeenCalledOnce();
    });
});
