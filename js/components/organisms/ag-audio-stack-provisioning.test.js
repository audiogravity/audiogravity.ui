/**
 * Unit tests for ag-audio-stack-provisioning.js (logic-only, no DOM mount).
 * Covers: library payload derivation, provision-readiness, the provision POST
 * payload + state machine, and status load (recommended pre-selection + event).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class { connectedCallback() {} },
    html: (strings, ...values) => ({ strings, values }),
    nothing: null,
}));
vi.mock('../../api.js', () => ({ apiGet: vi.fn(), apiPost: vi.fn() }));
vi.mock('../../ui-helpers.js', () => ({ showPasswordConfirm: vi.fn() }));
vi.mock('../../ag-icons.js', () => ({
    iconConnectorUsbA: '', iconHardDrive: '', iconWifi: '', iconFolder: '',
    iconCheck: '', iconClose: '', iconWarning: '', iconRadio: '', iconCircle: '', iconStar: '',
}));

import { apiGet, apiPost } from '../../api.js';
import { showPasswordConfirm } from '../../ui-helpers.js';
import { AgAudioStackProvisioning } from './ag-audio-stack-provisioning.js';

const OUTPUTS = [
    { hw: 'hw:0,0', card_name: 'Abacus', usb_id: '20b1:30ab', device_id: 0, is_usb_dac: true, recommended: true, label: 'Abacus' },
    { hw: 'hw:1,0', card_name: 'PCH', usb_id: null, device_id: 0, is_usb_dac: false, recommended: false, label: 'PCH' },
];
const LIB_SOURCES = [
    { kind: 'usb', uuid: 'u-1', fstype: 'ext4', path: '/mnt/aglibrary', label: 'MUSIC (ext4)' },
    { kind: 'mount', fstype: 'cifs', path: '/mnt/musics', label: '/mnt/musics (cifs)' },
];

function makeEl(overrides = {}) {
    const el = Object.create(AgAudioStackProvisioning.prototype);
    el._outputs = OUTPUTS;
    el._librarySources = LIB_SOURCES;
    el._selectedOutputId = 'hw:0,0';
    el._libraryChoice = null;
    el._manualPath = '';
    el._state = 'idle';
    el.dispatchEvent = vi.fn();
    Object.assign(el, overrides);
    return el;
}

beforeEach(() => {
    vi.clearAllMocks();
    showPasswordConfirm.mockResolvedValue('admin-pw');   // default: admin confirms
});

describe('_libraryPayload', () => {
    it('manual path → music_directory', () => {
        const el = makeEl({ _libraryChoice: 'manual', _manualPath: '/mnt/x' });
        expect(el._libraryPayload).toEqual({ music_directory: '/mnt/x' });
    });
    it('manual with empty path → null', () => {
        const el = makeEl({ _libraryChoice: 'manual', _manualPath: '  ' });
        expect(el._libraryPayload).toBeNull();
    });
    it('usb source → library_usb_uuid + fstype', () => {
        const el = makeEl({ _libraryChoice: 'src:0' });
        expect(el._libraryPayload).toEqual({ library_usb_uuid: 'u-1', library_fstype: 'ext4' });
    });
    it('mount source → music_directory', () => {
        const el = makeEl({ _libraryChoice: 'src:1' });
        expect(el._libraryPayload).toEqual({ music_directory: '/mnt/musics' });
    });
    it('no choice → null', () => {
        expect(makeEl()._libraryPayload).toBeNull();
    });
});

describe('_canProvision', () => {
    it('false without a library', () => {
        expect(makeEl()._canProvision).toBe(false);
    });
    it('true with output + library', () => {
        expect(makeEl({ _libraryChoice: 'src:0' })._canProvision).toBe(true);
    });
    it('false while provisioning', () => {
        expect(makeEl({ _libraryChoice: 'src:0', _state: 'provisioning' })._canProvision).toBe(false);
    });
});

describe('_disabledReason', () => {
    it('asks to select an output when none is selected', () => {
        expect(makeEl({ _selectedOutputId: null })._disabledReason).toContain('output');
    });
    it('asks to select a library when output is set but no library', () => {
        expect(makeEl()._disabledReason).toContain('library');
    });
    it('empty once output + library are chosen', () => {
        expect(makeEl({ _libraryChoice: 'src:0' })._disabledReason).toBe('');
    });
});

describe('_provision', () => {
    it('posts the selected output + usb library (with the admin password) and reports success', async () => {
        apiPost.mockResolvedValue({ results: [{ service_id: 'mpd', status: 'generated' }] });
        const el = makeEl({ _libraryChoice: 'src:0' });
        await el._provision();
        expect(showPasswordConfirm).toHaveBeenCalled();
        expect(apiPost).toHaveBeenCalledWith('/audio-stack/provision', {
            card_name: 'Abacus', usb_id: '20b1:30ab', device_id: 0,
            library_usb_uuid: 'u-1', library_fstype: 'ext4',
            password: 'admin-pw',
        });
        expect(el._state).toBe('success');
        expect(el.dispatchEvent).toHaveBeenCalled();
        expect(el.dispatchEvent.mock.calls[0][0].type).toBe('provisioned');
    });
    it('aborts without posting when the password prompt is cancelled', async () => {
        showPasswordConfirm.mockResolvedValue(null);
        const el = makeEl({ _libraryChoice: 'src:0' });
        await el._provision();
        expect(apiPost).not.toHaveBeenCalled();
        expect(el._state).toBe('idle');
    });
    it('posts music_directory for a manual library', async () => {
        apiPost.mockResolvedValue({ results: [] });
        const el = makeEl({ _libraryChoice: 'manual', _manualPath: '/srv/music' });
        await el._provision();
        expect(apiPost.mock.calls[0][1].music_directory).toBe('/srv/music');
    });
    it('sets error state on failure', async () => {
        apiPost.mockRejectedValue({ detail: 'mpd requires a music library' });
        const el = makeEl({ _libraryChoice: 'src:0' });
        await el._provision();
        expect(el._state).toBe('error');
        expect(el._errorMsg).toContain('music library');
    });
});

describe('_loadStatus', () => {
    it('loads outputs/sources, pre-selects the recommended output, emits status-loaded', async () => {
        apiGet.mockResolvedValue({
            outputs: OUTPUTS, library_sources: LIB_SOURCES, selected_output: null,
            services: [{ service_id: 'mpd' }],
        });
        const el = makeEl({ _outputs: [], _librarySources: [], _selectedOutputId: null });
        await el._loadStatus();
        expect(el._outputs).toHaveLength(2);
        expect(el._selectedOutputId).toBe('hw:0,0');   // recommended
        expect(el.dispatchEvent).toHaveBeenCalled();
        expect(el.dispatchEvent.mock.calls[0][0].type).toBe('status-loaded');
        expect(el._loading).toBe(false);
    });
});
