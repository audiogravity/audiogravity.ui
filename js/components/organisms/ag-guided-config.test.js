/**
 * Unit tests for ag-guided-config.js (logic-only, no DOM mount).
 * Covers the field descriptor, output-change detection, apply (targeted patches)
 * and reset (regenerate + password) contracts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class {},
    html: (strings, ...values) => ({ strings, values }),
    nothing: null,
}));
vi.mock('../../common.js', () => ({ apiPost: vi.fn(), showToast: vi.fn(), handleError: vi.fn() }));
vi.mock('../../ui-helpers.js', () => ({ showPasswordConfirm: vi.fn() }));
vi.mock('../utils-lit.js', () => ({ svgIcon: vi.fn() }));
vi.mock('../../ag-icons.js', () => ({
    iconRefresh: '', iconConnectorUsbA: '', iconHardDrive: '', iconRadio: '',
    iconCircle: '', iconStar: '', iconWifi: '', iconFolder: '',
}));

import { apiPost, showToast, handleError } from '../../common.js';
import { showPasswordConfirm } from '../../ui-helpers.js';
import { AgGuidedConfig, GUIDED_FIELDS } from './ag-guided-config.js';

const OUTPUTS = [
    { hw: 'hw:0,0', card_name: 'Abacus', usb_id: 'dac-a', device_id: 0, recommended: true },
    { hw: 'hw:1,0', card_name: 'Topaz', usb_id: 'dac-b', device_id: 0, recommended: false },
];

function makeEl(overrides = {}) {
    const el = Object.create(AgGuidedConfig.prototype);
    el.serviceId = 'mpd';
    el.outputs = OUTPUTS;
    el.librarySources = [{ kind: 'usb', uuid: 'u-1', fstype: 'ext4', path: '/mnt/lib', label: 'MUSIC' }];
    el.serviceOutput = { usb_id: 'dac-a', card_name: 'Abacus', device_id: 0 };
    el._selectedOutputId = 'hw:0,0';
    el._libraryChoice = null;
    el._manualPath = '';
    el._busy = false;
    el.dispatchEvent = vi.fn();
    Object.assign(el, overrides);
    return el;
}

beforeEach(() => {
    vi.clearAllMocks();
    apiPost.mockResolvedValue({});
    showPasswordConfirm.mockResolvedValue('pw');
});

describe('descriptor', () => {
    it('mpd has output + library, airplay has output, upmpdcli none', () => {
        expect(GUIDED_FIELDS.mpd).toEqual(['output', 'library']);
        expect(GUIDED_FIELDS.airplay).toEqual(['output']);
        expect(GUIDED_FIELDS.upmpdcli).toEqual([]);
    });
});

describe('_initialOutputId', () => {
    it('matches the pinned output', () => {
        expect(makeEl()._initialOutputId()).toBe('hw:0,0');
    });
    it('falls back to the recommended output when no pin', () => {
        expect(makeEl({ serviceOutput: null })._initialOutputId()).toBe('hw:0,0');
    });
});

describe('_outputChanged', () => {
    it('false when selection equals the pin', () => {
        expect(makeEl()._outputChanged).toBe(false);
    });
    it('true when selection differs from the pin', () => {
        expect(makeEl({ _selectedOutputId: 'hw:1,0' })._outputChanged).toBe(true);
    });
});

describe('_canApply', () => {
    it('false with no changes', () => {
        expect(makeEl()._canApply).toBe(false);
    });
    it('true when the output changed', () => {
        expect(makeEl({ _selectedOutputId: 'hw:1,0' })._canApply).toBe(true);
    });
    it('true when a library is chosen', () => {
        expect(makeEl({ _libraryChoice: 'src:0' })._canApply).toBe(true);
    });
    it('false while busy', () => {
        expect(makeEl({ _selectedOutputId: 'hw:1,0', _busy: true })._canApply).toBe(false);
    });
});

describe('_apply', () => {
    it('patches only the output when only the output changed (airplay)', async () => {
        const el = makeEl({ serviceId: 'airplay', _selectedOutputId: 'hw:1,0' });
        await el._apply();
        expect(apiPost).toHaveBeenCalledTimes(1);
        expect(apiPost).toHaveBeenCalledWith('/audio-stack/output', {
            service_id: 'airplay', card_name: 'Topaz', usb_id: 'dac-b', device_id: 0,
        });
        expect(el.dispatchEvent).toHaveBeenCalled();
    });

    it('patches output AND library for mpd, and clears the library choice', async () => {
        const el = makeEl({ _selectedOutputId: 'hw:1,0', _libraryChoice: 'src:0' });
        await el._apply();
        expect(apiPost).toHaveBeenCalledWith('/audio-stack/output', expect.objectContaining({ service_id: 'mpd', card_name: 'Topaz' }));
        expect(apiPost).toHaveBeenCalledWith('/audio-stack/library', { library_usb_uuid: 'u-1', library_fstype: 'ext4' });
        expect(el._libraryChoice).toBeNull();
        expect(showToast).toHaveBeenCalledWith('success', 'Applied', expect.any(String));
    });

    it('does nothing when there is no change', async () => {
        await makeEl()._apply();
        expect(apiPost).not.toHaveBeenCalled();
    });

    it('reports an error and does not emit on failure', async () => {
        apiPost.mockRejectedValue(new Error('boom'));
        const el = makeEl({ _selectedOutputId: 'hw:1,0' });
        await el._apply();
        expect(handleError).toHaveBeenCalled();
        expect(el.dispatchEvent).not.toHaveBeenCalled();
    });
});

describe('_reset', () => {
    it('regenerates with the admin password and emits guided-changed', async () => {
        const el = makeEl();
        await el._reset();
        expect(showPasswordConfirm).toHaveBeenCalled();
        expect(apiPost).toHaveBeenCalledWith('/audio-stack/provision', expect.objectContaining({
            card_name: 'Abacus', services: ['mpd'], regenerate: true, password: 'pw',
        }));
        expect(el.dispatchEvent).toHaveBeenCalled();
    });

    it('aborts when the password prompt is cancelled', async () => {
        showPasswordConfirm.mockResolvedValue(null);
        await makeEl()._reset();
        expect(apiPost).not.toHaveBeenCalled();
    });
});
