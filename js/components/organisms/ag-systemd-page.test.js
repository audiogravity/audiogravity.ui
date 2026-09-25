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
vi.mock('../../net-errors.js', () => ({ validationField: vi.fn() }));
vi.mock('../../common.js', () => ({
    apiGet: vi.fn(), apiPost: vi.fn(), apiCall: vi.fn(), apiCallWithRetry: vi.fn(),
    showToast: vi.fn(), showConfirm: vi.fn(), AppState: {}, addToHistory: vi.fn(),
    handleError: vi.fn(), escapeHtml: (s) => s,
}));
vi.mock('../../core/FetchController.js', () => ({ FetchController: class {} }));
vi.mock('@lit/context', () => ({ ContextConsumer: class {} }));
vi.mock('../../core/app-context.js', () => ({ appContext: {} }));
vi.mock('./ag-card-grid.js', () => ({}));
vi.mock('../molecules/ag-systemd-card.js', () => ({}));
vi.mock('../molecules/ag-validation-results.js', () => ({}));

import { apiPost, handleError } from '../../common.js';
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
        expect(handleError).toHaveBeenCalledWith(refused, 'Failed to update properties');
        expect(el._loadServices).toHaveBeenCalledTimes(1);
    });

    it('reads them again after a save that went through, as before', async () => {
        apiPost
            .mockResolvedValueOnce({ valid: true, errors: [], warnings: [] })
            .mockResolvedValueOnce({ success: true, message: 'Properties updated successfully' });
        const el = makeEl();
        expect(await el._saveProperties(SERVICE, { nice: -5 }, true)).toBe(true);
        expect(el._loadServices).toHaveBeenCalledTimes(1);
    });
});
