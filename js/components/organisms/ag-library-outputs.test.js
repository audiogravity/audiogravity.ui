/**
 * Unit tests for ag-library-outputs.js (logic-only, no DOM mount).
 * Covers the honest switch flow (SPEC §10): read the backend success/error,
 * surface failures, re-fetch the real state, and guard against redundant clicks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class {},
    html: (strings, ...values) => ({ strings, values }),
    nothing: null,
}));
vi.mock('../../api.js', () => ({ apiGet: vi.fn(), apiPost: vi.fn() }));
vi.mock('../utils-lit.js', () => ({
    loadWithState: vi.fn(async (host, cb) => { await cb(); }),
}));
vi.mock('../../ui-helpers.js', () => ({ showToast: vi.fn(), showConfirm: vi.fn() }));
vi.mock('../../ag-icons.js', () => ({
    iconConnectorUsbA: '', iconConnectorToslink: '',
    iconConnectorRj45: '', iconConnectorDefault: '',
}));

import { apiGet, apiPost } from '../../api.js';
import { showToast, showConfirm } from '../../ui-helpers.js';
import { AgLibraryOutputs } from './ag-library-outputs.js';

function makeEl(overrides = {}) {
    const el = Object.create(AgLibraryOutputs.prototype);
    el.sourceId = '';
    el._outputs = [];
    el._loading = false;
    el._switching = null;
    el.dispatchEvent = vi.fn();
    Object.assign(el, overrides);
    return el;
}

beforeEach(() => {
    vi.clearAllMocks();
    apiGet.mockResolvedValue([]);
});

describe('ag-library-outputs _activate', () => {
    it('success → posts, dispatches change, re-fetches, no toast', async () => {
        apiPost.mockResolvedValue({ success: true, verified: true });
        const el = makeEl();
        await el._activate({ id: 'usb', active: false });
        expect(apiPost).toHaveBeenCalledWith('/steering/switch-output', { service: 'mpd', output: 'usb' });
        expect(el.dispatchEvent).toHaveBeenCalled();
        expect(apiGet).toHaveBeenCalledWith('/steering/outputs');
        expect(showToast).not.toHaveBeenCalled();
        expect(el._switching).toBe(null);
    });

    it('not applied (backend raises) → surfaces the backend message, no dispatch, still re-fetches', async () => {
        // The router raises HTTPException(400, detail=error) when the switch is not
        // applied, so apiPost rejects with the backend message on e.message.
        apiPost.mockRejectedValue(Object.assign(new Error('Output switch was not applied.'), { status: 400 }));
        const el = makeEl();
        await el._activate({ id: 'usb', active: false });
        expect(showToast).toHaveBeenCalledWith('error', 'Output switch failed', 'Output switch was not applied.');
        expect(el.dispatchEvent).not.toHaveBeenCalled();
        expect(apiGet).toHaveBeenCalledWith('/steering/outputs');   // rollback to real state
        expect(el._switching).toBe(null);
    });

    it('network error → toast with fallback message, re-fetch runs in finally', async () => {
        apiPost.mockRejectedValue(new Error());
        const el = makeEl();
        await el._activate({ id: 'usb', active: false });
        expect(showToast).toHaveBeenCalledWith('error', 'Output switch failed', 'Could not switch output');
        expect(el.dispatchEvent).not.toHaveBeenCalled();
        expect(apiGet).toHaveBeenCalled();
    });

    it('clicking the already-active output is a no-op', async () => {
        const el = makeEl();
        await el._activate({ id: 'usb', active: true });
        expect(apiPost).not.toHaveBeenCalled();
    });

    it('ignores clicks while a switch is already in flight', async () => {
        const el = makeEl({ _switching: 'toslink' });
        await el._activate({ id: 'usb', active: false });
        expect(apiPost).not.toHaveBeenCalled();
    });

    it('derives the roonbridge service from a roon source', async () => {
        apiPost.mockResolvedValue({ success: true });
        const el = makeEl({ sourceId: 'src_roon' });
        await el._activate({ id: 'toslink', active: false });
        expect(apiPost).toHaveBeenCalledWith('/steering/switch-output', { service: 'roonbridge', output: 'toslink' });
    });

    it('MPD switch does not prompt for confirmation', async () => {
        apiPost.mockResolvedValue({ success: true });
        const el = makeEl();  // service → mpd
        await el._activate({ id: 'usb', active: false });
        expect(showConfirm).not.toHaveBeenCalled();
        expect(apiPost).toHaveBeenCalled();
    });

    it('AirPlay switch confirms first, then posts when accepted', async () => {
        showConfirm.mockResolvedValue(true);
        apiPost.mockResolvedValue({ success: true });
        const el = makeEl({ sourceId: 'src_airplay' });
        await el._activate({ id: 'toslink', active: false });
        expect(showConfirm).toHaveBeenCalled();
        expect(apiPost).toHaveBeenCalledWith('/steering/switch-output', { service: 'airplay', output: 'toslink' });
    });

    it('AirPlay switch is aborted when the user cancels the confirm', async () => {
        showConfirm.mockResolvedValue(false);
        const el = makeEl({ sourceId: 'src_airplay' });
        await el._activate({ id: 'toslink', active: false });
        expect(apiPost).not.toHaveBeenCalled();
        expect(el._switching).toBe(null);
    });
});
