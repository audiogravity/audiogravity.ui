/**
 * Tests for CodeMirrorController — loading CodeMirror on demand for an editor.
 *
 * Covers:
 * 1. a build loads the library, hands it to the host's builder, and ends 'ready'
 * 2. a builder that no longer wants an editor ends 'idle'
 * 3. a missing chunk, or a builder that throws, ends 'failed' — no unhandled rejection
 * 4. a build asked for while one runs is left to that one
 * 5. the host re-renders at each change; reset() starts afresh
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./load-codemirror.js', () => ({ loadCodeMirror: vi.fn() }));

import { loadCodeMirror } from './load-codemirror.js';
import { CodeMirrorController, EDITOR_LOAD_FAILED } from './CodeMirrorController.js';

const CodeMirror = { fromTextArea: vi.fn(() => ({ id: 'editor' })) };

function host() {
    return { addController: vi.fn(), requestUpdate: vi.fn() };
}

describe('CodeMirrorController', () => {
    beforeEach(() => {
        vi.mocked(loadCodeMirror).mockReset().mockResolvedValue(CodeMirror);
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('registers with its host and starts idle', () => {
        const h = host();
        const cm = new CodeMirrorController(h);
        expect(h.addController).toHaveBeenCalledWith(cm);
        expect(cm.state).toBe('idle');
    });

    it('builds the editor with the loaded library and ends ready', async () => {
        const cm = new CodeMirrorController(host());
        const create = vi.fn((lib) => lib.fromTextArea());

        const editor = await cm.build(create);

        expect(create).toHaveBeenCalledWith(CodeMirror);
        expect(editor).toEqual({ id: 'editor' });
        expect(cm.state).toBe('ready');
    });

    it('ends idle when the view no longer wants an editor', async () => {
        const cm = new CodeMirrorController(host());
        expect(await cm.build(() => null)).toBeNull();
        expect(cm.state).toBe('idle');
    });

    it('ends failed when the chunk does not arrive', async () => {
        vi.mocked(loadCodeMirror).mockRejectedValueOnce(new Error('offline'));
        const cm = new CodeMirrorController(host());
        const create = vi.fn();

        expect(await cm.build(create)).toBeNull();

        expect(create).not.toHaveBeenCalled();
        expect(cm.state).toBe('failed');
    });

    it('ends failed, without a rejection, when the editor fails to build', async () => {
        const cm = new CodeMirrorController(host());
        await expect(cm.build(() => { throw new Error('bad mode'); })).resolves.toBeNull();
        expect(cm.state).toBe('failed');
    });

    it('leaves a build asked for during another to that one', async () => {
        let release;
        vi.mocked(loadCodeMirror).mockImplementationOnce(() => new Promise(r => { release = () => r(CodeMirror); }));
        const cm = new CodeMirrorController(host());
        const first = cm.build(() => ({ id: 'first' }));

        expect(await cm.build(() => ({ id: 'second' }))).toBeNull();
        release();

        expect(await first).toEqual({ id: 'first' });
        expect(loadCodeMirror).toHaveBeenCalledOnce();
    });

    it('re-renders its host at each change, after the update under way', async () => {
        // build() starts from a host's updated(): asked for synchronously, the update made
        // Lit warn (change-in-update) and schedule one more.
        const h = host();
        const cm = new CodeMirrorController(h);
        const building = cm.build(() => ({}));
        expect(cm.state).toBe('loading');
        expect(h.requestUpdate).not.toHaveBeenCalled();

        await building;
        await Promise.resolve();
        expect(h.requestUpdate).toHaveBeenCalledTimes(2);   // loading, ready

        cm.reset();
        await Promise.resolve();
        expect(cm.state).toBe('idle');
        expect(h.requestUpdate).toHaveBeenCalledTimes(3);

        cm.reset();
        await Promise.resolve();
        expect(h.requestUpdate, 'no update for a state that did not change').toHaveBeenCalledTimes(3);
    });

    it('sends the user to a reload, the one thing that loads it again', () => {
        // Opening the editor again asks nothing of the box: the browser keeps a failed
        // import for the life of the page (Chromium 145, measured 2026-10-03).
        expect(EDITOR_LOAD_FAILED).toMatch(/Reload the page/);
        expect(EDITOR_LOAD_FAILED).not.toMatch(/again,|Open it/);
    });
});
