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
// Their own tests cover them; here they would load lit's directives for real.
vi.mock('../molecules/ag-prov-dop-switch.js', () => ({}));
vi.mock('../molecules/ag-prov-dsd-volume-switch.js', () => ({}));
vi.mock('../../ag-icons.js', () => ({
    iconRefresh: '', iconConnectorUsbA: '', iconHardDrive: '', iconRadio: '',
    iconCircle: '', iconStar: '', iconWifi: '', iconFolder: '',
}));

import { apiPost } from '../../api.js';
import { showConfirm, showToast, handleError, showPasswordConfirm } from '../../ui-helpers.js';
import { AgGuidedConfig, DSD_VOLUME_NOTE, GUIDED_FIELDS } from './ag-guided-config.js';

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
    el.serviceDop = false;
    el._dop = null;
    el.serviceDsdFullVolume = true;
    el._dsdVolume = null;
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
    it("mpd has output + DoP + the DAC's volume + library, airplay has output, upmpdcli none", () => {
        expect(GUIDED_FIELDS.mpd).toEqual(['output', 'dop', 'dsd_volume', 'library']);
        expect(GUIDED_FIELDS.airplay).toEqual(['output']);
        expect(GUIDED_FIELDS.upmpdcli).toEqual([]);
    });
});

/** The text of a template as the mocked `html` returns it, nested templates included. */
const textOf = (node) => {
    if (typeof node === 'string') return node;
    if (!node || typeof node !== 'object') return '';
    if (Array.isArray(node)) return node.map(textOf).join('');
    if (node.strings) {
        return node.strings.map((s, i) => s + (i < node.values.length ? textOf(node.values[i]) : '')).join('');
    }
    return '';
};

describe('HQPlayer Embedded — its output alone', () => {
    // Its configuration belongs to its vendor: Audiogravity sets its output there
    // like any player's, and never regenerates the file (decision of 2026-09-22).

    it('has the output as its only guided field', () => {
        expect(GUIDED_FIELDS.hqplayerd).toEqual(['output']);
    });

    it("has its output changed like any player's", async () => {
        const el = makeEl({ serviceId: 'hqplayerd', serviceOutput: null, _selectedOutputId: 'hw:0,0' });
        await el._apply();
        expect(apiPost).toHaveBeenCalledTimes(1);
        expect(apiPost).toHaveBeenCalledWith('/audio-stack/output', {
            service_id: 'hqplayerd', card_name: 'Abacus', usb_id: 'dac-a', device_id: 0,
        });
    });

    it('is offered no Reset to default', () => {
        const text = textOf(makeEl({ serviceId: 'hqplayerd', regenerable: false }).render());
        expect(text).toContain('Audio output');
        expect(text).toContain('Apply changes');
        expect(text).not.toContain('Reset to default');
    });

    it('leaves Reset to default to the services Audiogravity generates', () => {
        expect(textOf(makeEl({ regenerable: true }).render())).toContain('Reset to default');
    });

    it('keeps Reset to default when nothing says otherwise', () => {
        // A core that predates the field generates every service it lists.
        expect(new AgGuidedConfig().regenerable).toBe(true);
    });
});

describe('_initialOutputId', () => {
    it('matches the pinned output', () => {
        expect(makeEl()._initialOutputId()).toBe('hw:0,0');
    });
    it('falls back to the recommended output when no pin', () => {
        expect(makeEl({ serviceOutput: null })._initialOutputId()).toBe('hw:0,0');
    });
    it('tells apart two outputs of one card by their device', () => {
        // An onboard card: the jack on hw:0,0, HDMI on hw:0,3 — one usb_id and card_name.
        const outputs = [
            { hw: 'hw:0,0', card_name: 'PCH', usb_id: null, device_id: 0, recommended: true },
            { hw: 'hw:0,3', card_name: 'PCH', usb_id: null, device_id: 3, recommended: false },
        ];
        const el = makeEl({ outputs, serviceOutput: { usb_id: null, card_name: 'PCH', device_id: 3 } });
        expect(el._initialOutputId()).toBe('hw:0,3');
    });
});

describe('the DoP switch (mpd)', () => {
    it('shows what MPD applies until it is flipped', () => {
        expect(makeEl({ serviceDop: true })._dopValue).toBe(true);
        expect(makeEl({ serviceDop: null })._dopValue).toBeNull();
        expect(makeEl({ serviceDop: true, _dop: false })._dopValue).toBe(false);
    });

    it('a flip back to what MPD applies is no change', () => {
        expect(makeEl({ _dop: false })._canApply).toBe(false);
        expect(makeEl({ _dop: true })._canApply).toBe(true);
    });

    it('is applied on its own route, and forgotten once applied', async () => {
        const el = makeEl({ _dop: true });
        await el._apply();
        expect(apiPost).toHaveBeenCalledTimes(1);
        expect(apiPost).toHaveBeenCalledWith('/audio-stack/dop', { dop: true });
        expect(el._dop).toBeNull();
        expect(el.dispatchEvent).toHaveBeenCalled();
    });

    it('before the library, whose change restarts MPD', async () => {
        const el = makeEl({ _dop: true, _libraryChoice: 'src:0' });
        await el._apply();
        expect(apiPost.mock.calls.map(c => c[0])).toEqual(['/audio-stack/dop', '/audio-stack/library']);
    });

    it('waits while another output is chosen: what it holds is the other DAC\'s', async () => {
        const el = makeEl({ serviceDop: true, _selectedOutputId: 'hw:1,0', _dop: false });
        expect(el._dopChanged).toBe(false);
        await el._apply();
        expect(apiPost.mock.calls.map(c => c[0])).toEqual(['/audio-stack/output']);
    });

    it('a reset onto another output sends it off', async () => {
        await makeEl({ serviceDop: true, _selectedOutputId: 'hw:1,0' })._reset();
        expect(apiPost).toHaveBeenCalledWith('/audio-stack/provision', expect.objectContaining({
            card_name: 'Topaz', dop: false }));
    });

    it('is drawn waiting while another output is chosen', () => {
        // The DSD field's template: .checked, ?pending, ?disabled, @dop-change.
        const dopField = (el) => el.render().values
            .find(v => v?.strings?.join('').includes('ag-prov-dop-switch'));
        expect(dopField(makeEl({ _selectedOutputId: 'hw:1,0' })).values[1]).toBe(true);
        expect(dopField(makeEl()).values[1]).toBe(false);
    });

    it('is not offered to a service other than mpd', async () => {
        const el = makeEl({ serviceId: 'airplay', _dop: true });
        expect(el._canApply).toBe(false);
        await el._reset();
        expect(apiPost.mock.calls[0][1]).not.toHaveProperty('dop');
    });

    it('is kept through a reset, as the output is', async () => {
        await makeEl({ serviceDop: true })._reset();
        expect(apiPost).toHaveBeenCalledWith('/audio-stack/provision', expect.objectContaining({ dop: true }));
    });

    it('a reset with MPD silent leaves it off', async () => {
        await makeEl({ serviceDop: null })._reset();
        expect(apiPost).toHaveBeenCalledWith('/audio-stack/provision', expect.objectContaining({ dop: false }));
    });

    it('is drawn for mpd under its own heading', () => {
        expect(textOf(makeEl().render())).toContain('<h4>DSD</h4>');
        expect(textOf(makeEl({ serviceId: 'airplay' }).render())).not.toContain('<h4>DSD</h4>');
    });
});

describe("the DAC's volume during DSD (mpd)", () => {
    /** The switch's template, nested in the DSD field's: .checked, ?pending, ?disabled, @…. */
    const volumeSwitch = (el) => el.render().values
        .find(v => v?.strings?.join('').includes('ag-prov-dop-switch'))
        .values.find(v => v?.strings?.join('').includes('ag-prov-dsd-volume-switch'));

    it("shows the DAC's setting until it is flipped", () => {
        expect(makeEl({ serviceDsdFullVolume: true })._dsdVolumeValue).toBe(true);
        expect(makeEl({ serviceDsdFullVolume: null })._dsdVolumeValue).toBeNull();
        expect(makeEl({ serviceDsdFullVolume: true, _dsdVolume: false })._dsdVolumeValue).toBe(false);
    });

    it("a flip back to the DAC's setting is no change", () => {
        expect(makeEl({ _dsdVolume: true })._canApply).toBe(false);
        expect(makeEl({ _dsdVolume: false })._canApply).toBe(true);
    });

    it('is applied on its own route, and forgotten once applied', async () => {
        const el = makeEl({ _dsdVolume: false });
        await el._apply();
        expect(apiPost).toHaveBeenCalledTimes(1);
        expect(apiPost).toHaveBeenCalledWith('/audio-stack/dsd-full-volume', { enabled: false });
        expect(el._dsdVolume).toBeNull();
        expect(el.dispatchEvent).toHaveBeenCalled();
    });

    it('after DoP and before the library, whose change restarts MPD', async () => {
        const el = makeEl({ _dop: true, _dsdVolume: false, _libraryChoice: 'src:0' });
        await el._apply();
        expect(apiPost.mock.calls.map(c => c[0])).toEqual(
            ['/audio-stack/dop', '/audio-stack/dsd-full-volume', '/audio-stack/library']);
    });

    it("waits while another output is chosen: what it holds is the other DAC's", async () => {
        const el = makeEl({ _selectedOutputId: 'hw:1,0', _dsdVolume: false });
        expect(el._dsdVolumeChanged).toBe(false);
        await el._apply();
        expect(apiPost.mock.calls.map(c => c[0])).toEqual(['/audio-stack/output']);
    });

    it("is not sent by a reset: it is the DAC's, not MPD's configuration", async () => {
        const el = makeEl({ _dsdVolume: false });
        await el._reset();
        expect(apiPost.mock.calls[0][0]).toBe('/audio-stack/provision');
        expect(apiPost.mock.calls[0][1]).not.toHaveProperty('enabled');
        expect(apiPost.mock.calls[0][1]).not.toHaveProperty('dsd_full_volume');
        expect(el._dsdVolume).toBeNull();
    });

    it('is not offered to a service other than mpd', () => {
        expect(makeEl({ serviceId: 'airplay', _dsdVolume: false })._canApply).toBe(false);
    });

    it('is drawn under the DoP switch, waiting while another output is chosen', () => {
        expect(volumeSwitch(makeEl({ _selectedOutputId: 'hw:1,0' })).values[1]).toBe(true);
        const shown = volumeSwitch(makeEl({ serviceDsdFullVolume: false }));
        expect(shown.values[0]).toBe(false);
        expect(shown.values[1]).toBe(false);
    });

    it('is drawn for mpd only', () => {
        expect(textOf(makeEl().render())).toContain('ag-prov-dsd-volume-switch');
        expect(textOf(makeEl({ serviceId: 'airplay' }).render())).not.toContain('ag-prov-dsd-volume-switch');
    });
});

describe('what MPD does with DSD, said under DSD (mpd)', () => {
    // On a box where no output takes DSD as it is, MPD turns DSD into PCM before its
    // volume: the players keep their slider on DSD, and the guided view says why.

    it('says the volume works on DSD when MPD converts it before the volume', () => {
        const text = textOf(makeEl({ serviceVolumeOnDsd: true }).render());
        expect(text).toContain(DSD_VOLUME_NOTE);
        // Under the two switches, in the DSD field.
        expect(text.indexOf(DSD_VOLUME_NOTE)).toBeGreaterThan(text.indexOf('ag-prov-dsd-volume-switch'));
    });

    it('says nothing when MPD does not, or when the status cannot say', () => {
        expect(textOf(makeEl({ serviceVolumeOnDsd: false }).render())).not.toContain(DSD_VOLUME_NOTE);
        expect(textOf(makeEl({ serviceVolumeOnDsd: null }).render())).not.toContain(DSD_VOLUME_NOTE);
    });

    it('is said for mpd only', () => {
        expect(textOf(makeEl({ serviceId: 'airplay', serviceVolumeOnDsd: true }).render()))
            .not.toContain(DSD_VOLUME_NOTE);
    });

    it('says only what holds whoever set the conversion', () => {
        // The status says it for a format written by hand in MPD's configuration too:
        // there no output need lack DSD, and DoP changes nothing — neither is said.
        expect(DSD_VOLUME_NOTE).toMatch(/volume works on DSD/);
        expect(DSD_VOLUME_NOTE).not.toMatch(/DoP|no output/);
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
