/**
 * Unit tests for ag-prov-library-picker.js (logic-only, no DOM mount).
 * Covers the payload derivation (payloadFor) and the change event contract.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class {},
    html: (strings, ...values) => ({ strings, values }),
    nothing: null,
}));
vi.mock('../utils-lit.js', () => ({ svgIcon: vi.fn() }));
vi.mock('../../ag-icons.js', () => ({
    iconHardDrive: '', iconWifi: '', iconFolder: '', iconRadio: '', iconCircle: '',
}));

import { AgProvLibraryPicker } from './ag-prov-library-picker.js';

const SOURCES = [
    { kind: 'usb', uuid: 'u-1', fstype: 'ext4', path: '/mnt/aglibrary', label: 'MUSIC (ext4)' },
    { kind: 'mount', fstype: 'cifs', path: '/mnt/musics', label: '/mnt/musics (cifs)' },
];

describe('payloadFor', () => {
    it('manual path → music_directory', () => {
        expect(AgProvLibraryPicker.payloadFor('manual', '/mnt/x', SOURCES)).toEqual({ music_directory: '/mnt/x' });
    });
    it('manual empty/whitespace → null', () => {
        expect(AgProvLibraryPicker.payloadFor('manual', '  ', SOURCES)).toBeNull();
    });
    it('usb source → library_usb_uuid + fstype', () => {
        expect(AgProvLibraryPicker.payloadFor('src:0', '', SOURCES)).toEqual({ library_usb_uuid: 'u-1', library_fstype: 'ext4' });
    });
    it('mount source → music_directory', () => {
        expect(AgProvLibraryPicker.payloadFor('src:1', '', SOURCES)).toEqual({ music_directory: '/mnt/musics' });
    });
    it('no choice → null', () => {
        expect(AgProvLibraryPicker.payloadFor(null, '', SOURCES)).toBeNull();
    });
    it('out-of-range source index → null', () => {
        expect(AgProvLibraryPicker.payloadFor('src:9', '', SOURCES)).toBeNull();
    });
});

describe('_emit', () => {
    function makeEl(overrides = {}) {
        const el = Object.create(AgProvLibraryPicker.prototype);
        el.sources = SOURCES;
        el.choice = null;
        el.manualPath = '';
        el.dispatchEvent = vi.fn();
        Object.assign(el, overrides);
        return el;
    }

    beforeEach(() => vi.clearAllMocks());

    it('updates state and emits library-change with the resolved payload (usb)', () => {
        const el = makeEl();
        el._emit('src:0', '');
        expect(el.choice).toBe('src:0');
        expect(el.manualPath).toBe('');
        const ev = el.dispatchEvent.mock.calls[0][0];
        expect(ev.type).toBe('library-change');
        expect(ev.detail).toEqual({
            choice: 'src:0', manualPath: '',
            payload: { library_usb_uuid: 'u-1', library_fstype: 'ext4' },
        });
    });

    it('emits null payload for an empty manual path', () => {
        const el = makeEl();
        el._emit('manual', '   ');
        expect(el.dispatchEvent.mock.calls[0][0].detail.payload).toBeNull();
    });
});
