/**
 * Unit tests for ag-pipeline-page.js — topology save flow.
 *
 * Covers _handleTopologyConfigSaveRequest():
 * - structural errors block the save and surface the validation modal
 * - non-blocking warnings ask for confirmation before persisting
 * - a clean topology is persisted directly
 * - a validation outage falls through to the save (never blocks)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

/**
 * Install a fake topology modal reachable via document.getElementById.
 *
 * Answers for that one id only, and is restored after every test: a blanket
 * mockReturnValue survives the whole file (nothing in vite.config.js restores
 * mocks, and clearAllMocks empties call history without putting the real
 * implementation back), so every later lookup — a component's own
 * connectedCallback, say — receives this stub instead of a DOM node, and fails
 * somewhere that gives no hint where the stub came from.
 *
 * @returns {object} The fake modal the page will find.
 */
function installModal() {
    const modal = { _isLoading: false, isOpen: true };
    const real = document.getElementById.bind(document);
    vi.spyOn(document, 'getElementById').mockImplementation(
        id => (id === 'agTopologyConfigModal' ? modal : real(id)),
    );
    return modal;
}

const CONFIG = { hifi_topology: { devices: {} } };
const evt = { detail: { config: CONFIG } };

afterEach(() => {
    // Puts spied-on globals back; clearAllMocks alone would not.
    vi.restoreAllMocks();
});

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

describe('the mobile view can reach the configuration', () => {
    /** Flatten the mocked lit templates into plain text. */
    function text(node) {
        if (node === null || node === undefined || node === false) return '';
        if (typeof node === 'symbol') return '';
        if (Array.isArray(node)) return node.map(text).join('');
        if (typeof node === 'object' && node.strings) {
            return node.strings
                .map((str, i) => str + (i < node.values.length ? text(node.values[i]) : ''))
                .join('');
        }
        if (typeof node === 'function') return '[handler]';
        return String(node);
    }

    function mobilePage() {
        const el = Object.create(AgPipelinePage.prototype);
        el._isActive = true;
        el._isMobile = true;
        el._eventsCollapsed = false;
        return el;
    }

    it('offers CONFIG on a phone, as the desktop view does', () => {
        // It did not: CONFIG lived in the desktop branch alone, so a chain that
        // shows nothing sent its owner to a button absent from the device in
        // their hand.
        const out = text(mobilePage().render());
        expect(out).toContain('CONFIG');
        expect(out).toContain('ag-mobile-pipeline');
    });

    it('withholds it from a guest, exactly as the desktop view does', async () => {
        const { isGuest } = await import('../../auth.js');
        isGuest.mockReturnValueOnce(true);
        const out = text(mobilePage().render());
        expect(out).not.toContain('CONFIG');
        expect(out).toContain('ag-mobile-pipeline');
    });
});

describe('the test stubs do not leak', () => {
    it('leaves document.getElementById alone for other ids', () => {
        // The guard for the trap above: a blanket stub answered every lookup in
        // the file, and the failure surfaced in whichever test was added next.
        installModal();
        expect(document.getElementById('agTopologyConfigModal')).toMatchObject({ isOpen: true });
        expect(document.getElementById('somethingElse')).toBe(null);
    });
});
