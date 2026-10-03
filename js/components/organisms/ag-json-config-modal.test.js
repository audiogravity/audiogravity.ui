/**
 * Unit tests for ag-json-config-modal.js — file transfer (Download / Upload).
 *
 * Covers:
 * - _handleDownload(): builds a blob from the current content and triggers a save
 * - _handleUploadClick(): opens the hidden file input
 * - _handleFileSelected(): loads the picked file into the editor in edit mode
 * - _initCodeMirror(): builds the editor from the library loaded on demand, read-only and
 *   filled; says so when the library cannot be loaded
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class { },
    html: (strings, ...values) => ({ strings, values }),
}));
vi.mock('../../ag-icons.js', () => ({
    iconCheck: '', iconWarning: '', iconPencil: '', iconDownload: '', iconUpload: '',
}));
// The download mechanics (anchor in the document, object URL outliving the click) are
// this helper's contract and are tested in ui-helpers.test.js. What belongs here is
// WHAT this modal hands it: the live content, under the configured filename.
vi.mock('../../ui-helpers.js', () => ({ downloadTextFile: vi.fn() }));
// CodeMirror is loaded on demand through this seam; each test says what the load gives.
vi.mock('../../core/load-codemirror.js', () => ({ loadCodeMirror: vi.fn() }));

import { downloadTextFile } from '../../ui-helpers.js';
import { loadCodeMirror } from '../../core/load-codemirror.js';
import { CodeMirrorController } from '../../core/CodeMirrorController.js';
import { flat } from '../../test-utils.js';
import { AgJsonConfigModal } from './ag-json-config-modal.js';

/** Build a bare modal instance without mounting. */
function makeEl(overrides = {}) {
    const el = Object.create(AgJsonConfigModal.prototype);
    el.filename = 'audio-topology.json';
    el.configText = '';
    el._isEditMode = false;
    el._isValid = true;
    el._validationMessage = '';
    el._isDirty = false;
    el._editor = null;
    el._fileInputId = 'json-config-file-abc';
    // What LitElement would provide, for the CodeMirror controller.
    el.addController = () => {};
    el.requestUpdate = () => {};
    el._cm = new CodeMirrorController(el);
    return Object.assign(el, overrides);
}

describe('ag-json-config-modal file transfer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('_handleDownload', () => {
        it('downloads the live editor content under the configured filename', () => {
            const el = makeEl({ _editor: { getValue: () => '{"a":1}' } });

            el._handleDownload();

            expect(downloadTextFile).toHaveBeenCalledWith(
                '{"a":1}', 'audio-topology.json', 'application/json');
        });

        it('falls back to configText when there is no editor yet', () => {
            const el = makeEl({ _editor: null, configText: '{"c":3}' });

            el._handleDownload();

            expect(downloadTextFile).toHaveBeenCalledWith(
                '{"c":3}', 'audio-topology.json', 'application/json');
        });

        it('falls back to a default name when none is configured', () => {
            const el = makeEl({ _editor: null, configText: '{}', filename: '' });

            el._handleDownload();

            expect(downloadTextFile).toHaveBeenCalledWith('{}', 'config.json', 'application/json');
        });
    });

    describe('_handleUploadClick', () => {
        it('clicks the hidden file input', () => {
            const el = makeEl({ _editor: { getValue: () => '' } });
            const click = vi.fn();
            el.querySelector = vi.fn(() => ({ click }));

            el._handleUploadClick();

            expect(el.querySelector).toHaveBeenCalledWith('#json-config-file-abc');
            expect(click).toHaveBeenCalledTimes(1);
        });
    });

    describe('_handleFileSelected', () => {
        it('loads the file content into the editor and enters edit mode', async () => {
            const setValue = vi.fn();
            const el = makeEl({
                _editor: { setValue, setOption: vi.fn(), focus: vi.fn(), getValue: () => '' },
                _isEditMode: false,
            });
            const file = { text: vi.fn().mockResolvedValue('{"x":2}') };
            const evt = { target: { files: [file], value: 'C:\\fake\\path.json' } };

            await el._handleFileSelected(evt);

            expect(el._isEditMode).toBe(true);
            expect(setValue).toHaveBeenCalledWith('{"x":2}');
            expect(evt.target.value).toBe('');  // reset so the same file can be re-picked
        });

        it('does nothing when no file is picked', async () => {
            const setValue = vi.fn();
            const el = makeEl({ _editor: { setValue, setOption: vi.fn(), focus: vi.fn() } });
            const evt = { target: { files: [], value: '' } };

            await el._handleFileSelected(evt);

            expect(setValue).not.toHaveBeenCalled();
        });

        it('surfaces a read error without throwing', async () => {
            const el = makeEl({ _editor: { setValue: vi.fn(), setOption: vi.fn(), focus: vi.fn() } });
            const file = { text: vi.fn().mockRejectedValue(new Error('boom')) };
            const evt = { target: { files: [file], value: 'x' } };

            await el._handleFileSelected(evt);

            expect(el._isValid).toBe(false);
            expect(el._validationMessage).toContain('boom');
        });
    });
});

describe('ag-json-config-modal editor loading', () => {
    // The modal is in the main bundle; CodeMirror is a chunk of its own, loaded the first
    // time the modal opens. The textarea is never filled without it.
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    /** A modal whose textarea exists, as it does once ag-modal has rendered. */
    function openModal(overrides = {}) {
        const textarea = { id: 'json-config-editor-abc' };
        return makeEl({
            isOpen: true,
            _editorId: 'json-config-editor-abc',
            configText: '{"a":1}',
            querySelector: vi.fn(() => textarea),
            textarea,
            ...overrides,
        });
    }

    it('builds the editor on the textarea, read-only and filled, once the library has loaded', async () => {
        vi.useFakeTimers();
        const editor = {
            on: vi.fn(), setOption: vi.fn(), setValue: vi.fn(), refresh: vi.fn(),
            getWrapperElement: () => ({ parentElement: { classList: { add: vi.fn() } } }),
        };
        const fromTextArea = vi.fn(() => editor);
        vi.mocked(loadCodeMirror).mockResolvedValueOnce({ fromTextArea });
        const el = openModal();

        const shown = el._initCodeMirror();
        await vi.runAllTimersAsync();   // the modal waits for its textarea to be in the DOM
        await shown;

        expect(fromTextArea).toHaveBeenCalledOnce();
        const [textarea, options] = fromTextArea.mock.calls[0];
        expect(textarea).toBe(el.textarea);
        expect(options).toMatchObject({ mode: { name: 'javascript', json: true }, readOnly: true, foldGutter: true });
        expect(editor.setValue).toHaveBeenCalledWith('{"a":1}');
        expect(el._editor).toBe(editor);
    });

    it('says the editor could not be loaded instead of showing an empty file', async () => {
        vi.useFakeTimers();
        vi.mocked(loadCodeMirror).mockRejectedValueOnce(new Error('offline'));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const el = openModal();

        const shown = el._initCodeMirror();
        await vi.runAllTimersAsync();
        await shown;

        expect(el._editor).toBeNull();
        expect(el._isValid).toBe(false);
        expect(el._validationMessage).toMatch(/could not be loaded/);
        // Shown as an error, although the modal is not in edit mode.
        expect(flat(el.render())).toContain('class="validation-message validation-error"');
    });

    it('says the editor is loading, and keeps Edit and Upload unavailable, until it is built', async () => {
        // On a first open the editor takes a moment: an empty textarea and two buttons
        // that do nothing looked like an empty file and a broken modal (review, 2026-10-02).
        vi.useFakeTimers();
        let release;
        const editor = {
            on: vi.fn(), setOption: vi.fn(), setValue: vi.fn(), refresh: vi.fn(),
            getWrapperElement: () => ({ parentElement: { classList: { add: vi.fn() } } }),
        };
        vi.mocked(loadCodeMirror).mockImplementationOnce(
            () => new Promise(resolve => { release = () => resolve({ fromTextArea: () => editor }); }));
        const el = openModal({ allowFileTransfer: true, isGuest: false, _fileInputId: 'json-config-file-abc' });

        const loading = el._initCodeMirror();
        const markup = flat(el.render());
        expect(markup).toContain('Loading the editor…');
        expect(markup.match(/aria-disabled="true"/g)).toHaveLength(2);   // Upload and Edit
        el._handleUploadClick();
        expect(el.querySelector).not.toHaveBeenCalledWith('#json-config-file-abc');

        release();
        await vi.runAllTimersAsync();
        await loading;

        expect(el._cm.state).toBe('ready');
        const ready = flat(el.render());
        expect(ready).not.toContain('Loading the editor…');
        expect(ready).not.toContain('aria-disabled="true"');
    });

    it('says the build failed when the textarea is missing once rendered, instead of loading for ever', async () => {
        vi.mocked(loadCodeMirror).mockResolvedValueOnce({ fromTextArea: vi.fn() });
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const el = openModal({ querySelector: vi.fn(() => null) });

        await el._initCodeMirror();

        expect(el._cm.state).toBe('failed');
        expect(el._validationMessage).toMatch(/could not be loaded/);
    });

    it('builds nothing for a modal closed before it had rendered', async () => {
        const fromTextArea = vi.fn();
        vi.mocked(loadCodeMirror).mockResolvedValueOnce({ fromTextArea });
        const el = openModal();

        const shown = el._initCodeMirror();
        el.isOpen = false;
        await shown;

        expect(fromTextArea).not.toHaveBeenCalled();
        expect(el._cm.state).toBe('idle');
        expect(el._validationMessage).toBe('');
    });

    it('waits for its ag-modal to render before looking for the textarea', async () => {
        // Deterministic rather than a guess at how long rendering takes.
        let rendered = false;
        const textarea = { id: 'json-config-editor-abc' };
        // The body is there only once the ag-modal's update is awaited — not before.
        const modal = { get updateComplete() { return Promise.resolve().then(() => { rendered = true; }); } };
        const fromTextArea = vi.fn(() => ({
            on: vi.fn(), setOption: vi.fn(), setValue: vi.fn(), refresh: vi.fn(),
            getWrapperElement: () => ({ parentElement: null }),
        }));
        vi.mocked(loadCodeMirror).mockResolvedValueOnce({ fromTextArea });
        const el = openModal({ querySelector: vi.fn((sel) => (sel === 'ag-modal' ? modal : rendered ? textarea : null)) });

        await el._initCodeMirror();

        expect(fromTextArea).toHaveBeenCalledWith(textarea, expect.any(Object));
        expect(el._cm.state).toBe('ready');
    });

    it('leaves the editor writable when Edit was pressed while it reopened', async () => {
        // Reopened, the editor is refreshed once the modal has rendered: Edit can be
        // pressed before that, and the refresh used to put it back to read-only.
        const editor = {
            setOption: vi.fn(), setValue: vi.fn(), refresh: vi.fn(),
            getWrapperElement: () => ({ parentElement: null }),
        };
        const el = openModal({ _editor: editor, _isEditMode: true });

        await el._initCodeMirror();

        expect(editor.setOption).not.toHaveBeenCalledWith('readOnly', true);
        expect(editor.setValue).not.toHaveBeenCalled();
        expect(editor.refresh).toHaveBeenCalled();
    });
});
