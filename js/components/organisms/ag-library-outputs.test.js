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
vi.mock('../../license-tiers.js', () => ({ openLicensePanel: vi.fn() }));
vi.mock('../atoms/ag-pro-lock.js', () => ({}));

import { apiGet, apiPost } from '../../api.js';
import { showToast, showConfirm } from '../../ui-helpers.js';
import { openLicensePanel } from '../../license-tiers.js';
import { AgLibraryOutputs } from './ag-library-outputs.js';
import { flat } from '../../test-utils.js';

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

describe('the outputs of a Pro source on a Starter box', () => {
    // Roon's zones and HQPlayer's output are Pro: the core refuses the switch
    // (review, 2026-10-15), so the panel leads to the licence panel instead.
    const OUTPUTS = [{ id: 'usb', label: 'USB', active: true }, { id: 'toslink', label: 'Optical', active: false }];

    it('leads a tap to the licence panel, and switches nothing', async () => {
        const el = makeEl({ sourceId: 'src_mono-sgen', locked: true });
        await el._activate({ id: 'toslink', active: false });
        expect(openLicensePanel).toHaveBeenCalledTimes(1);
        expect(apiPost).not.toHaveBeenCalled();
        expect(el._switching).toBe(null);
    });

    it('puts the padlock where READY stood, and keeps ACTIVE', () => {
        const el = makeEl({ locked: true, _outputs: OUTPUTS });
        const out = flat(el.render());
        expect(out).toContain('<ag-pro-lock></ag-pro-lock>');
        expect(out).toContain('ACTIVE');
        expect(out).not.toContain('READY');
    });

    it('gives the cards that show the padlock the Pro tint, not the active one', () => {
        const out = flat(makeEl({ locked: true, _outputs: OUTPUTS }).render());
        const cards = out.split('class="lib-out-card').slice(1);
        expect(cards[0]).not.toContain('lib-out-card--locked');   // USB, active
        expect(cards[1]).toContain('lib-out-card--locked');       // Optical, padlocked
    });

    it('shows READY and no padlock when the source is free', () => {
        const out = flat(makeEl({ locked: false, _outputs: OUTPUTS }).render());
        expect(out).toContain('READY');
        expect(out).not.toContain('ag-pro-lock');
    });

    it('defaults to unlocked', () => {
        expect(new AgLibraryOutputs().locked).toBe(false);
    });
});
