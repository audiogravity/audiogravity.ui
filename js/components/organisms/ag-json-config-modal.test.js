/**
 * Unit tests for ag-json-config-modal.js — file transfer (Download / Upload).
 *
 * Covers:
 * - _handleDownload(): builds a blob from the current content and triggers a save
 * - _handleUploadClick(): opens the hidden file input
 * - _handleFileSelected(): loads the picked file into the editor in edit mode
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

import { downloadTextFile } from '../../ui-helpers.js';
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
            const el = makeEl();
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
