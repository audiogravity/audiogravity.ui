/**
 * Unit tests for ag-config-editor.js.
 *
 * Covers:
 * - disconnectedCallback destroys the CodeMirror instance to prevent memory leaks
 *   (regression for the missing lifecycle cleanup fixed in this review)
 * - disconnectedCallback is safe when CodeMirror has not been initialised yet
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// The guided child pulls the API/toast stack (auth-gated at load); this suite only
// exercises the editor's own mode logic, so stub it out.
vi.mock('./ag-guided-config.js', () => ({}));

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

describe('AgConfigEditor — guided/structured/expert mode switching', () => {
    function makeEl(overrides = {}) {
        const el = new AgConfigEditor();
        Object.assign(el, overrides);
        return el;
    }

    it('_applyMode sets the mode and reverts unsaved changes', () => {
        const el = makeEl({ currentMode: 'form', isDirty: true, formData: { a: 1 }, _originalFormData: { a: 0 } });
        el._applyMode('guided');
        expect(el.currentMode).toBe('guided');
        expect(el.isDirty).toBe(false);
        expect(el.formData).toEqual({ a: 0 });
    });

    it('_setMode is a no-op when already in that mode', () => {
        const el = makeEl({ currentMode: 'guided' });
        const spy = vi.spyOn(el, '_applyMode');
        el._setMode('guided');
        expect(spy).not.toHaveBeenCalled();
    });

    it('_setMode applies directly when not dirty', () => {
        const el = makeEl({ currentMode: 'guided', isDirty: false });
        el._setMode('raw');
        expect(el.currentMode).toBe('raw');
    });

    it('_setMode confirms before applying when there are unsaved changes', async () => {
        window.showConfirm = vi.fn().mockResolvedValue(true);
        const el = makeEl({ currentMode: 'form', isDirty: true });
        el._setMode('raw');
        await Promise.resolve();
        await Promise.resolve();
        expect(window.showConfirm).toHaveBeenCalled();
        expect(el.currentMode).toBe('raw');
    });

    it('willUpdate opens a provisionable service in guided mode', () => {
        const el = makeEl({ guided: true, currentMode: 'form' });
        el.willUpdate(new Map([['service', null]]));
        expect(el.currentMode).toBe('guided');
    });

    it('willUpdate opens a non-provisionable service in form mode', () => {
        const el = makeEl({ guided: false, currentMode: 'guided' });
        el.willUpdate(new Map([['service', null]]));
        expect(el.currentMode).toBe('form');
    });
});
