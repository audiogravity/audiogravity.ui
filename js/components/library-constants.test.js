/**
 * Unit tests for library-constants.js — stream-origin badge + searchable sources.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { originBadge, ORIGIN_LABELS, initOriginLabels, normalizeSearchSources } from './library-constants.js';

vi.mock('../api.js', () => ({ apiGet: vi.fn() }));
const { apiGet } = await import('../api.js');

describe('originBadge', () => {
    it('returns null for empty/unknown origin', () => {
        expect(originBadge(null)).toBeNull();
        expect(originBadge('')).toBeNull();
        expect(originBadge(undefined)).toBeNull();
    });

    it('maps a known origin to its label and an icon', () => {
        const badge = originBadge('tidal');
        expect(badge.label).toBe('Tidal');
        expect(badge.icon).toBeTruthy();
    });

    it('uses the explicit name over the generic label', () => {
        expect(originBadge('upnp', 'MinimServer').label).toBe('MinimServer');
        // empty name falls back to the generic label
        expect(originBadge('upnp', '').label).toBe('UPnP');
    });

    it('falls back to the library icon for an unknown but truthy origin', () => {
        const badge = originBadge('mystery');
        expect(badge.label).toBe('mystery');
        expect(badge.icon).toBeTruthy();
    });

    it('exposes a label for every mapped origin', () => {
        for (const origin of Object.keys(ORIGIN_LABELS)) {
            expect(originBadge(origin).label).toBe(ORIGIN_LABELS[origin]);
        }
    });
});

describe('initOriginLabels', () => {
    beforeEach(() => vi.clearAllMocks());

    afterEach(() => {
        // Clean up any keys added by tests so they don't leak into other tests.
        delete ORIGIN_LABELS.__test_bluetooth;
    });

    it('merges new origin keys from the backend into ORIGIN_LABELS', async () => {
        apiGet.mockResolvedValue({ __test_bluetooth: 'Bluetooth' });
        await initOriginLabels();
        expect(ORIGIN_LABELS.__test_bluetooth).toBe('Bluetooth');
    });

    it('overwrites existing labels with backend values', async () => {
        const original = ORIGIN_LABELS.mpris;
        apiGet.mockResolvedValue({ mpris: 'Streaming' });
        await initOriginLabels();
        expect(ORIGIN_LABELS.mpris).toBe('Streaming');
        ORIGIN_LABELS.mpris = original; // restore
    });

    it('keeps static fallbacks intact when the backend is unreachable', async () => {
        apiGet.mockRejectedValue(new Error('network error'));
        const snapshot = { ...ORIGIN_LABELS };
        await initOriginLabels();
        for (const [key, val] of Object.entries(snapshot)) {
            expect(ORIGIN_LABELS[key]).toBe(val);
        }
    });

    it('calls GET /player/origins', async () => {
        apiGet.mockResolvedValue({});
        await initOriginLabels();
        expect(apiGet).toHaveBeenCalledWith('/player/origins');
    });
});

describe('normalizeSearchSources', () => {
    const mpd  = { source_id: 'src_mpd',  protocol: 'mpd' };
    const roon = { source_id: 'src_roon', protocol: 'roon' };
    const sgen = { source_id: 'src_mono-sgen', protocol: 'roon' };
    const airplay = { source_id: 'src_shairport', protocol: 'mpris' };

    it('maps a pipeline source to {id,label,group,location}', () => {
        expect(normalizeSearchSources([mpd])).toEqual([
            { id: 'src_mpd', label: 'MPD', group: 'mpd', location: '' },
        ]);
    });

    it('dedups Roon (src_roon + src_mono-sgen → one)', () => {
        const out = normalizeSearchSources([roon, sgen]);
        expect(out).toHaveLength(1);
        expect(out[0].group).toBe('roon');
    });

    it('drops mpris receivers (no library API)', () => {
        expect(normalizeSearchSources([airplay])).toEqual([]);
    });

    it('appends known UPnP servers with their location URL', () => {
        const out = normalizeSearchSources([mpd], [
            { id: 'upnp:abc', friendly_name: 'MinimServer', location: 'http://srv/device.xml' },
        ]);
        expect(out).toHaveLength(2);
        expect(out[1]).toEqual({
            id: 'upnp:abc', label: 'MinimServer', group: 'upnp:abc', location: 'http://srv/device.xml',
        });
    });

    it('falls back to "UPnP" label and empty location when missing', () => {
        const [srv] = normalizeSearchSources([], [{ id: 'upnp:x' }]);
        expect(srv.label).toBe('UPnP');
        expect(srv.location).toBe('');
    });

    it('does not add the same UPnP server twice', () => {
        const dup = { id: 'upnp:x', friendly_name: 'S', location: 'http://srv/device.xml' };
        const out = normalizeSearchSources([], [dup, dup]);
        expect(out).toHaveLength(1);
        expect(out[0].location).toBe('http://srv/device.xml');
    });

    it('tolerates null/undefined inputs', () => {
        expect(normalizeSearchSources(null)).toEqual([]);
        expect(normalizeSearchSources(undefined, undefined)).toEqual([]);
    });
});
