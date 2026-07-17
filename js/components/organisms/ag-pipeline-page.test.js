/**
 * Unit tests for ag-pipeline-page.js — topology save flow.
 *
 * Covers _handleTopologyConfigSaveRequest():
 * - structural errors block the save and surface the validation modal
 * - non-blocking warnings ask for confirmation before persisting
 * - a clean topology is persisted directly
 * - a validation outage falls through to the save (never blocks)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class { },
    html: (strings, ...values) => ({ strings, values }),
    css: (strings, ...values) => ({ strings, values }),
    svg: (strings, ...values) => ({ strings, values }),
    nothing: Symbol('nothing'),
}));
vi.mock('../../common.js', () => ({
    AppState: { currentTab: '' },
    EventEmitter: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
    showToast: vi.fn(),
}));
vi.mock('../../api.js', () => ({ apiGet: vi.fn(), apiPost: vi.fn() }));
vi.mock('../../auth.js', () => ({ isGuest: vi.fn(() => false) }));
vi.mock('../../validation.js', () => ({
    validateTopologyConfig: vi.fn(),
    showValidationModal: vi.fn(),
}));

import { apiPost } from '../../api.js';
import { showToast } from '../../common.js';
import { validateTopologyConfig, showValidationModal } from '../../validation.js';
import { AgPipelinePage } from './ag-pipeline-page.js';

/** Build a bare AgPipelinePage instance without mounting. */
function makeEl() {
    return Object.create(AgPipelinePage.prototype);
}

/** Install a fake topology modal reachable via document.getElementById. */
function installModal() {
    const modal = { _isLoading: false, isOpen: true };
    vi.spyOn(document, 'getElementById').mockReturnValue(modal);
    return modal;
}

const CONFIG = { hifi_topology: { devices: {} } };
const evt = { detail: { config: CONFIG } };

describe('ag-pipeline-page topology save', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('persists directly when the topology is valid with no warnings', async () => {
        const modal = installModal();
        validateTopologyConfig.mockResolvedValue({ valid: true, errors: [], warnings: [] });
        apiPost.mockResolvedValue({ success: true });

        await makeEl()._handleTopologyConfigSaveRequest(evt);

        expect(apiPost).toHaveBeenCalledWith('/audio_pipeline/topology/save', CONFIG);
        expect(showValidationModal).not.toHaveBeenCalled();
        expect(modal.isOpen).toBe(false);
        expect(modal._isLoading).toBe(false);
    });

    it('blocks the save and shows the modal on structural errors', async () => {
        const modal = installModal();
        modal._validationMessage = 'Valid JSON - Saving...';
        const validation = { valid: false, errors: [{ message: 'bad type' }], warnings: [] };
        validateTopologyConfig.mockResolvedValue(validation);

        await makeEl()._handleTopologyConfigSaveRequest(evt);

        expect(showValidationModal).toHaveBeenCalledWith(validation);
        expect(apiPost).not.toHaveBeenCalled();
        // The modal's optimistic "Saving..." label must be cleared, not left stale.
        expect(modal._validationMessage).toBe('');
        expect(modal._isLoading).toBe(false);
    });

    it('asks for confirmation before persisting when there are warnings', async () => {
        const modal = installModal();
        modal._validationMessage = 'Valid JSON - Saving...';
        const validation = { valid: true, errors: [], warnings: ['broken link'] };
        validateTopologyConfig.mockResolvedValue(validation);

        await makeEl()._handleTopologyConfigSaveRequest(evt);

        // Warnings must not save immediately; a confirm callback is provided.
        expect(apiPost).not.toHaveBeenCalled();
        expect(showValidationModal).toHaveBeenCalledTimes(1);
        expect(showValidationModal.mock.calls[0][0]).toBe(validation);
        expect(typeof showValidationModal.mock.calls[0][1]).toBe('function');
        // The optimistic "Saving..." label is cleared while awaiting confirmation.
        expect(modal._validationMessage).toBe('');
    });

    it('persists once the warning confirmation callback runs', async () => {
        const modal = installModal();
        validateTopologyConfig.mockResolvedValue({ valid: true, errors: [], warnings: ['w'] });
        apiPost.mockResolvedValue({ success: true });

        const el = makeEl();
        await el._handleTopologyConfigSaveRequest(evt);
        const onContinue = showValidationModal.mock.calls[0][1];
        await onContinue();

        expect(apiPost).toHaveBeenCalledWith('/audio_pipeline/topology/save', CONFIG);
        expect(modal.isOpen).toBe(false);
    });

    it('falls through to the save when validation is unreachable', async () => {
        installModal();
        validateTopologyConfig.mockRejectedValue(new Error('offline'));
        apiPost.mockResolvedValue({ success: true });

        await makeEl()._handleTopologyConfigSaveRequest(evt);

        expect(apiPost).toHaveBeenCalledWith('/audio_pipeline/topology/save', CONFIG);
        expect(showValidationModal).not.toHaveBeenCalled();
    });

    it('reports a backend save failure without closing the modal', async () => {
        const modal = installModal();
        validateTopologyConfig.mockResolvedValue({ valid: true, errors: [], warnings: [] });
        apiPost.mockResolvedValue({ success: false, message: 'disk full' });

        await makeEl()._handleTopologyConfigSaveRequest(evt);

        expect(showToast).toHaveBeenCalledWith('error', 'Save Failed', 'disk full');
        expect(modal.isOpen).toBe(true);
        expect(modal._isLoading).toBe(false);
    });
});
