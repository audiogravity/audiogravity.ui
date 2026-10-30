/**
 * Unit tests for ag-systemd-page.js (logic only, no DOM mount): a refused save reads
 * the services again.
 *
 * Since 2026-09-24 the core watches a service it restarted on new settings, and puts
 * the previous ones back when it does not stay up — the save then answers 400, with
 * the settings already changed twice. What the page lists must be read again.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class { connectedCallback() {} },
    html: (strings, ...values) => ({ strings, values }),
}));
vi.mock('../../net-errors.js', async (importOriginal) => ({
    ...(await importOriginal()),
    validationField: vi.fn(),
}));
// A toast's handle: the save's outcome takes the place of its "Checking" notice.
const checking = vi.hoisted(() => ({ update: vi.fn(), close: vi.fn() }));
vi.mock('../../common.js', async () => ({
    apiGet: vi.fn(), apiPost: vi.fn(), apiCall: vi.fn(), apiCallWithRetry: vi.fn(),
    showToast: vi.fn(() => checking), showConfirm: vi.fn(), AppState: {}, addToHistory: vi.fn(),
    handleError: vi.fn(),
    // The real wording of an error.
    getUserFriendlyError: (await vi.importActual('../../ui-helpers.js')).getUserFriendlyError,
}));
// Keeps its options, so a test can run the page's own fetch.
vi.mock('../../core/FetchController.js', () => ({
    FetchController: class { constructor(host, options) { this.options = options; } },
}));
vi.mock('@lit/context', () => ({ ContextConsumer: class {} }));
vi.mock('../../core/app-context.js', () => ({ appContext: {} }));
vi.mock('./ag-card-grid.js', () => ({}));
vi.mock('../molecules/ag-systemd-card.js', () => ({}));
vi.mock('../molecules/ag-validation-results.js', () => ({}));

import { apiGet, apiPost, showConfirm, showToast } from '../../common.js';
import { validationField } from '../../net-errors.js';
import { AgSystemdPage } from './ag-systemd-page.js';

const SERVICE = { id: 'hqplayerd', name: 'HQPlayer Embedded', systemd_unit: 'hqplayerd.service' };

function makeEl() {
    const el = Object.create(AgSystemdPage.prototype);
    el._loadServices = vi.fn().mockResolvedValue(undefined);
    return el;
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('ag-systemd-page — what the editor is handed', () => {
    it('carries the priority a program gives its own sound threads, null for the others', async () => {
        // The editor keeps MPD below its own sound threads, and only knows of them
        // through this field of the core's answer.
        apiGet.mockImplementation(async (path) => {
            if (path === '/profiles/configuration') {
                return { services: {
                    mpd: { label: 'Music Player Daemon', systemd_unit: 'mpd.service' },
                    shairport: { label: 'AirPlay Receiver', systemd_unit: 'shairport-sync.service' },
                } };
            }
            return path.startsWith('/services/mpd.service/')
                ? { properties: {}, own_sound_rt_priority: 40 }
                : { properties: {} };   // a core that does not send the field
        });
        const services = await new AgSystemdPage().servicesFetch.options.fetchFn();
        expect(services.map(s => [s.systemd_unit, s.own_sound_rt_priority])).toEqual([
            ['mpd.service', 40],
            ['shairport-sync.service', null],
        ]);
    });
});

describe('ag-systemd-page — saving a service\'s properties', () => {
    it('reads the services again when the core refuses the save', async () => {
        const refused = Object.assign(new Error('refused'), {
            status: 400,
            detail: 'The service did not start with these settings: it stopped at once (exit status 214). '
                + 'The previous settings are back, and the service is running again.',
        });
        apiPost
            .mockResolvedValueOnce({ valid: true, errors: [], warnings: [] })     // validate
            .mockRejectedValueOnce(refused);                                    // apply
        const el = makeEl();
        const saved = await el._saveProperties(SERVICE, { nice: -5 }, true);
        expect(saved).toBe(false);
        expect(checking.update).toHaveBeenCalledWith('error', 'Settings not applied', refused.detail);
        expect(el._loadServices).toHaveBeenCalledTimes(1);
    });

    it('reads them again after a save that went through, as before', async () => {
        apiPost
            .mockResolvedValueOnce({ valid: true, errors: [], warnings: [] })
            .mockResolvedValueOnce({ success: true, message: 'Properties updated successfully' });
        const el = makeEl();
        expect(await el._saveProperties(SERVICE, { nice: -5 }, true)).toBe(true);
        expect(el._loadServices).toHaveBeenCalledTimes(1);
        // One toast for the save: its notice turned into the outcome, nothing stacked.
        expect(showToast).toHaveBeenCalledTimes(1);
        expect(checking.update).toHaveBeenCalledWith('success', 'Settings applied', 'Properties updated successfully');
    });

    it('closes its notice when a dialog answers instead', async () => {
        apiPost.mockResolvedValueOnce({ valid: false, errors: [{ field: 'nice', message: 'out of range' }], warnings: [] });
        expect(await makeEl()._saveProperties(SERVICE, { nice: -50 }, true)).toBe(false);
        expect(checking.close).toHaveBeenCalledTimes(1);
        expect(checking.update).not.toHaveBeenCalled();
    });
});

describe('ag-systemd-page — a refused validation', () => {
    /** Every interpolated value of a (mocked) Lit template, nested ones included. */
    function valuesOf(node) {
        if (Array.isArray(node)) return node.flatMap(valuesOf);
        if (node && Array.isArray(node.strings)) return node.values.flatMap(valuesOf);
        return [node];
    }
    /** Every literal part of the same template: what Lit takes as markup. */
    function markupOf(node) {
        if (Array.isArray(node)) return node.flatMap(markupOf);
        if (node && Array.isArray(node.strings)) return [...node.strings, ...node.values.flatMap(markupOf)];
        return [];
    }

    it("asks with a template: the field and the core's message are values, shown as text", async () => {
        validationField.mockReturnValue('properties.<b>nice</b>');
        apiPost.mockRejectedValueOnce(Object.assign(new Error('422'), {
            status: 422, validationErrors: [{ msg: '<i>out of range</i>' }],
        }));
        const el = makeEl();
        expect(await el._saveProperties(SERVICE, { nice: 99 }, true)).toBe(false);
        const message = showConfirm.mock.calls[0][1];
        expect(typeof message).not.toBe('string');
        expect(valuesOf(message)).toEqual(expect.arrayContaining(['<B>NICE</B>', '<i>out of range</i>']));
        expect(markupOf(message).join('')).not.toMatch(/NICE|out of range/);
    });

    it("does the same for a refusal that is not a field list", async () => {
        apiPost.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 500, detail: '<b>boom</b>' }));
        const el = makeEl();
        expect(await el._saveProperties(SERVICE, { nice: 99 }, true)).toBe(false);
        const message = showConfirm.mock.calls[0][1];
        expect(valuesOf(message)).toContain('<b>boom</b>');
        expect(markupOf(message).join('')).not.toContain('boom');
    });
});
