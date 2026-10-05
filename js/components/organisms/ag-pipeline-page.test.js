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
import { readStylesheet, cssRuleBody, mediaBlock, flat } from '../../test-utils.js';
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
    function mobilePage() {
        const el = Object.create(AgPipelinePage.prototype);
        el._isActive = true;
        el._isMobile = true;
        return el;
    }

    it('offers CONFIG on a phone, as the desktop view does', () => {
        // It did not: CONFIG lived in the desktop branch alone, so a chain that
        // shows nothing sent its owner to a button absent from the device in
        // their hand.
        const out = flat(mobilePage().render());
        expect(out).toContain('CONFIG');
        expect(out).toContain('ag-mobile-pipeline');
    });

    it('withholds it from a guest, exactly as the desktop view does', async () => {
        const { isGuest } = await import('../../auth.js');
        isGuest.mockReturnValueOnce(true);
        const out = flat(mobilePage().render());
        expect(out).not.toContain('CONFIG');
        expect(out).toContain('ag-mobile-pipeline');
    });
});

describe('on a computer, the list reads beside the diagram', () => {
    /** The template of the computer view, its interpolations in order. */
    function desktopPage() {
        const el = Object.create(AgPipelinePage.prototype);
        el._isActive = true;
        el._isMobile = false;
        return el.render();
    }


    it('puts the phone\'s list in the right-hand column, the events under it', () => {
        // Opened whole, the diagram draws its labels a few pixels high: the list says
        // what plays at a glance (user's choice, 2026-10-04).
        const out = flat(desktopPage());
        const side = out.slice(out.indexOf('class="pipeline-side"'));
        expect(side).toContain('<ag-mobile-pipeline>');
        expect(side.indexOf('<ag-mobile-pipeline>')).toBeLessThan(side.indexOf('<ag-history-panel'));
        expect(out.indexOf('<ag-audio-pipeline>')).toBeLessThan(out.indexOf('class="pipeline-side"'));
    });

    it('no longer folds the events, which would fold the list with them', () => {
        const out = flat(desktopPage());
        expect(out).not.toContain('collapsible');
        expect(out).not.toMatch(/grid-template-columns/);
    });
});

describe('the right-hand column is laid out (css/pipeline.css)', () => {
    const CSS = readStylesheet('css', 'pipeline.css');

    it('is loaded with the app — a stylesheet left out breaks nothing, it just never applies', () => {
        expect(readStylesheet('css', 'main.css')).toMatch(/@import 'pipeline\.css';/);
    });

    it('stacks the list over the events, the list no taller than its content', () => {
        expect(cssRuleBody(CSS, '.pipeline-side')).toMatch(/flex-direction:\s*column/);
        // The phone's view fills its screen; here that would push the events down.
        expect(cssRuleBody(CSS, '.pipeline-side ag-mobile-pipeline')).toMatch(/min-height:\s*0/);
    });

    it('keeps the diagram\'s card its own height beside a taller column', () => {
        // Stretched to the column — twenty events under the list — the card grew to
        // 1222 px around a 271 px drawing, its minimap below the screen.
        expect(cssRuleBody(CSS, '.content-grid > .pipeline-zone')).toMatch(/align-self:\s*start/);
    });

    it('wraps the output pills, which a mouse cannot scroll sideways', () => {
        const pills = cssRuleBody(CSS, '.pipeline-side ag-mobile-pipeline .amp-output-switcher');
        expect(pills).toMatch(/flex-wrap:\s*wrap/);
        expect(pills).toMatch(/overflow-x:\s*visible/);
    });

    it('sets them side by side under the diagram where the page is one column', () => {
        // .content-grid turns two columns at 1201 px (layout.css): the same edge.
        expect(readStylesheet('css', 'layout.css')).toMatch(/@media \(width >=1201px\) \{\s*\.content-grid/);
        const narrow = mediaBlock(CSS, /@media\s*\(width\s*<\s*1201px\)/);
        expect(cssRuleBody(narrow, '.pipeline-side')).toMatch(/grid-template-columns:\s*repeat\(2,/);
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
