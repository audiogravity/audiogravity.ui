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
vi.mock('../../api.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../ui-helpers.js', () => ({ showToast: vi.fn(), handleError: vi.fn(), showConfirm: vi.fn(), showPasswordConfirm: vi.fn() }));
vi.mock('../utils-lit.js', () => ({ svgIcon: vi.fn() }));
vi.mock('../../ag-icons.js', () => ({
    iconRefresh: '', iconConnectorUsbA: '', iconHardDrive: '', iconRadio: '',
    iconCircle: '', iconStar: '', iconWifi: '', iconFolder: '',
}));

import { apiPost } from '../../api.js';
import { showConfirm, showToast, handleError, showPasswordConfirm } from '../../ui-helpers.js';
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
            card_name: 'Abacus', services: ['mpd'], regenerate: true, admin_password: 'pw',
        }));
        expect(el.dispatchEvent).toHaveBeenCalled();
    });

    it('aborts when the password prompt is cancelled', async () => {
        showPasswordConfirm.mockResolvedValue(null);
        await makeEl()._reset();
        expect(apiPost).not.toHaveBeenCalled();
    });
});

describe('_onMountCreated', () => {
    it('selects the freshly mounted share via the manual path (index-proof)', () => {
        const el = makeEl();
        el._onMountCreated({ mountpoint: '/mnt/nas-salon', label: 'NAS Salon' });
        expect(el._libraryChoice).toBe('manual');
        expect(el._manualPath).toBe('/mnt/nas-salon');
        // The payload resolves to the exact mountpoint regardless of how the
        // parent-owned librarySources array is later re-fetched or re-ordered.
        expect(el._libraryPayload).toEqual({ music_directory: '/mnt/nas-salon' });
    });

    it('ignores a malformed event', () => {
        const el = makeEl();
        el._onMountCreated(undefined);
        expect(el._libraryChoice).toBe(null);
    });
});

describe('_onMountRemoved', () => {
    it('clears the selection when it pointed at the removed share', () => {
        const el = makeEl();
        el._libraryChoice = 'manual';
        el._manualPath = '/mnt/nas-salon';
        el._onMountRemoved({ mountpoint: '/mnt/nas-salon' });
        expect(el._libraryChoice).toBe(null);
        expect(el._manualPath).toBe('');
    });

    it('leaves a selection that pointed elsewhere untouched', () => {
        const el = makeEl();
        el._libraryChoice = 'manual';
        el._manualPath = '/mnt/other';
        el._onMountRemoved({ mountpoint: '/mnt/nas-salon' });
        expect(el._manualPath).toBe('/mnt/other');
    });
});

describe('willUpdate — library selection re-anchor', () => {
    const src = (over) => ({ kind: 'mount', path: '/mnt/x', ...over });
    it('re-anchors a card selection when the parent re-fetches librarySources', () => {
        const older = [src({ path: '/mnt/nas-a' }), src({ path: '/mnt/nas-b' })];
        const el = makeEl({ librarySources: [src({ path: '/mnt/nas-b' })], _libraryChoice: 'src:1' });
        // nas-a dropped → nas-b moved from index 1 to index 0.
        el.willUpdate(new Map([['librarySources', older]]));
        expect(el._libraryChoice).toBe('src:0');
    });
    it('clears a card selection whose source disappeared', () => {
        const older = [src({ path: '/mnt/nas-a' })];
        const el = makeEl({ librarySources: [], _libraryChoice: 'src:0' });
        el.willUpdate(new Map([['librarySources', older]]));
        expect(el._libraryChoice).toBe(null);
    });
    it('leaves a manual selection untouched', () => {
        const el = makeEl({ librarySources: [], _libraryChoice: 'manual', _manualPath: '/mnt/x' });
        el.willUpdate(new Map([['librarySources', [src()]]]));
        expect(el._libraryChoice).toBe('manual');
    });
});


describe('removing the music library from the guided editor', () => {
    // The picker is shared with the provisioning panel, so the new "No music
    // library" card appears here too — where Apply changes is one click, with no
    // password and no summary of what it does. Every other library choice points
    // MPD somewhere else and is undone by pointing it back; this one TAKES the
    // collection away and restarts MPD.

    beforeEach(() => {
        // clearAllMocks() forgets the CALLS but keeps an implementation set
        // earlier, so a preceding test leaving apiPost rejecting would make every
        // assertion here depend on file order.
        apiPost.mockResolvedValue({});
    });

    it('asks before detaching', async () => {
        showConfirm.mockResolvedValue(true);
        const el = makeEl({ _libraryChoice: 'none' });

        await el._apply();

        expect(showConfirm).toHaveBeenCalledTimes(1);
        expect(apiPost).toHaveBeenCalledWith('/audio-stack/library', { music_directory: '' });
    });

    it('does nothing when the question is declined', async () => {
        showConfirm.mockResolvedValue(false);
        const el = makeEl({ _libraryChoice: 'none' });

        await el._apply();

        expect(apiPost).not.toHaveBeenCalled();
    });

    it('does not ask when a library is being SET', async () => {
        // Confirming every library change would train the reader to dismiss it.
        const el = makeEl({ _libraryChoice: 'src:0' });

        await el._apply();

        expect(showConfirm).not.toHaveBeenCalled();
        expect(apiPost).toHaveBeenCalledWith('/audio-stack/library', { library_usb_uuid: 'u-1', library_fstype: 'ext4' });
    });

    it('does not announce an indexing run that will not happen', async () => {
        // The core skips the rescan with no library — there is nothing to walk —
        // so the indicator would show "Indexing library…" and poll for a job
        // that was never started.
        showConfirm.mockResolvedValue(true);
        const started = vi.fn();
        const el = makeEl({ _libraryChoice: 'none' });
        el.querySelector = () => ({ start: started });

        await el._apply();

        expect(started).not.toHaveBeenCalled();
    });

    it('still announces one when a library IS set', async () => {
        const started = vi.fn();
        const el = makeEl({ _libraryChoice: 'src:0' });
        el.querySelector = () => ({ start: started });

        await el._apply();

        expect(started).toHaveBeenCalled();
    });
});
