/**
 * Unit tests for library-constants.js — stream-origin badge + searchable sources.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { originBadge, ORIGIN_LABELS, initOriginLabels, normalizeSearchSources, resolvePlayingSource, SOURCE_META, queueSourceLabel, SOURCE_MARKS, SOURCE_ICONS, ROON_IDS } from './library-constants.js';

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

    it('badges "external" properly instead of showing the raw key', () => {
        // The backend emits origin='external' whenever a third-party controller
        // drives the renderer or HQPlayer. The key was missing from both maps,
        // so the badge rendered the lowercase string with a generic icon.
        const badge = originBadge('external');
        expect(badge.label).toBe('External');
        expect(badge.icon).toBeTruthy();
    });

    it('gives "external" its own icon, not the generic fallback', () => {
        expect(originBadge('external').icon).not.toEqual(originBadge('mystery').icon);
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

describe('queueSourceLabel — header labels by playing origin', () => {
    it('shows the origin label for streams that play over MPD (radio, upnp)', () => {
        expect(queueSourceLabel('radio', 'src_mpd')).toBe('Radio');
        expect(queueSourceLabel('upnp', 'src_mpd')).toBe('UPnP');
    });

    it('keeps the full source label for local library and HIGHRESAUDIO (not "Library"/"HRA")', () => {
        // Regression guard: origin 'library' must NOT collapse to ORIGIN_LABELS.library ('Library').
        expect(queueSourceLabel('library', 'src_mpd')).toBe('Local Library');
        expect(queueSourceLabel('highresaudio', 'src_highresaudio')).toBe('HIGHRESAUDIO');
    });

    it('reuses the source label for Qobuz/Tidal (origin and source agree)', () => {
        expect(queueSourceLabel('qobuz', 'src_qobuz')).toBe('Qobuz');
        expect(queueSourceLabel('tidal', 'src_tidal')).toBe('Tidal');
    });

    it('falls back to the browsed source label when there is no origin', () => {
        expect(queueSourceLabel(null, 'src_mpd')).toBe('Local Library');
        expect(queueSourceLabel(undefined, 'upnp:abc')).toBe('upnp:abc');
    });

    it('falls back to the source label for an unknown origin', () => {
        expect(queueSourceLabel('mystery', 'src_mpd')).toBe('Local Library');
    });
});

describe('resolvePlayingSource — SOURCE vs engine', () => {
    it('resolves a Qobuz stream (MPD engine) to the Qobuz browse source, not "Local Library"', () => {
        // The bug: Qobuz plays over MPD (source_id 'src_mpd') with origin 'qobuz'.
        const r = resolvePlayingSource({ source_id: 'src_mpd', origin: 'qobuz' });
        expect(r).toEqual({ id: 'src_qobuz', group: 'qobuz', label: 'Qobuz' });
        // …and it matches the group of the Qobuz browse source (so no banner fires).
        expect(r.group).toBe(SOURCE_META.src_qobuz.group);
    });

    it('resolves Tidal and HIGHRESAUDIO streams to their own browse source', () => {
        expect(resolvePlayingSource({ source_id: 'src_mpd', origin: 'tidal' }))
            .toEqual({ id: 'src_tidal', group: 'tidal', label: 'Tidal' });
        // The name is written in full, in capitals: it is the brand as its owner
        // defines it, and there is no abbreviated label for it any more.
        expect(resolvePlayingSource({ source_id: 'src_mpd', origin: 'highresaudio' }))
            .toEqual({ id: 'src_highresaudio', group: 'highresaudio', label: 'HIGHRESAUDIO' });
    });

    it('keeps a local-file stream on the MPD engine ("Local Library")', () => {
        expect(resolvePlayingSource({ source_id: 'src_mpd', origin: 'library' }))
            .toEqual({ id: 'src_mpd', group: 'mpd', label: 'Local Library' });
    });

    it('leaves non-MPD engines (Roon) on their own source_id', () => {
        expect(resolvePlayingSource({ source_id: 'src_mono-sgen', origin: 'roon' }))
            .toEqual({ id: 'src_mono-sgen', group: 'roon', label: 'Roon' });
    });

    it('prefers an explicit origin_name (e.g. UPnP server) for the label', () => {
        const r = resolvePlayingSource({ source_id: 'upnp:abc', origin: 'upnp', origin_name: 'MinimServer' });
        expect(r.label).toBe('MinimServer');
        expect(r.group).toBe('upnp:abc');
    });

    it('falls back gracefully for an unknown source', () => {
        expect(resolvePlayingSource({ source_id: 'src_mystery' }))
            .toEqual({ id: 'src_mystery', group: 'src_mystery', label: 'mystery' });
    });
});

describe('normalizeSearchSources', () => {
    const mpd  = { source_id: 'src_mpd',  protocol: 'mpd' };
    const roon = { source_id: 'src_roon', protocol: 'roon' };
    const sgen = { source_id: 'src_mono-sgen', protocol: 'roon' };
    const airplay = { source_id: 'src_shairport', protocol: 'mpris' };

    it('maps a pipeline source to {id,label,group,location}', () => {
        expect(normalizeSearchSources([mpd])).toEqual([
            { id: 'src_mpd', label: 'Local Library', group: 'mpd', location: '' },
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

    it('drops entries the backend marks as not selectable', () => {
        // A renderer cast and an HQPlayer playback appear among the playing
        // sources so the player can render them, but they are an output and a
        // processor — neither holds a catalogue to browse.
        const cast = { source_id: 'upnp_renderer', protocol: 'upnp', selectable: false };
        const hqp  = { source_id: 'src_hqplayer', protocol: 'hqplayer', selectable: false };
        expect(normalizeSearchSources([mpd, cast, hqp])).toEqual([
            { id: 'src_mpd', label: 'Local Library', group: 'mpd', location: '' },
        ]);
    });

    it('keeps sources from a backend that does not send the flag', () => {
        expect(normalizeSearchSources([mpd])).toHaveLength(1);
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


describe('SOURCE_MARKS — a source shown by its mark instead of its name', () => {
    /* The library header renders `SOURCE_MARKS[id] ?? name`. Both halves of that
       fallback matter, and neither was covered: a mark that stops resolving would
       silently take the name's place with nothing to show, and a mark added to a
       source by accident would replace a name that was perfectly readable. */

    it('gives HIGHRESAUDIO a mark, because its owner asked to be shown rather than named', () => {
        expect(SOURCE_MARKS.src_highresaudio).toBeDefined();
    });

    it('gives Qobuz, Tidal and Roon one too — these logos ARE the name written out', () => {
        expect(SOURCE_MARKS.src_qobuz).toBeDefined();
        expect(SOURCE_MARKS.src_tidal).toBeDefined();
        expect(SOURCE_MARKS.src_roon).toBeDefined();
    });

    it('marks every id Roon answers to, not just one of them', () => {
        // A box running Roon Server reports one id, a Roon Bridge the other. Marking one
        // would show the brand on one box and name it on the next.
        for (const id of ROON_IDS) expect(SOURCE_MARKS[id], id).toBeDefined();
        expect(SOURCE_MARKS['src_mono-sgen']).toBe(SOURCE_MARKS.src_roon);
    });

    it.each([
        ['src_highresaudio', 'hra-logo', 'HIGHRESAUDIO'],
        ['src_qobuz', 'qobuz-logo', 'Qobuz'],
        ['src_tidal', 'tidal-logo', 'Tidal'],
        ['src_roon', 'roon-logo', 'Roon'],
    ])('%s carries both theme variants and the name for anyone the image cannot reach',
        (id, file, name) => {
            const rendered = JSON.stringify(SOURCE_MARKS[id]);
            expect(rendered).toContain(`${file}-light.webp`);
            expect(rendered).toContain(`${file}-dark.webp`);
            // An <img alt>, not a CSS background: a background shows nothing at all when
            // the file is missing, offline on a first load, or in forced-colours mode.
            expect(rendered).toContain(`alt=\\"${name}\\"`);
        });

    it('sizes the two wide marks apart from HIGHRESAUDIO', () => {
        // Their artwork is 3.7:1 and 7.5:1 against HRA's 1.4:1, so the height that suits
        // one would draw a 280px-wide Tidal beside a 55px HRA. The class is what the
        // stylesheet hangs the per-brand height on; without it they fall back to 40px.
        expect(JSON.stringify(SOURCE_MARKS.src_qobuz)).toContain('lib-src-mark-qobuz');
        expect(JSON.stringify(SOURCE_MARKS.src_tidal)).toContain('lib-src-mark-tidal');
        expect(JSON.stringify(SOURCE_MARKS.src_roon)).toContain('lib-src-mark-roon');
    });

    it('renders the source badge as a mask, so it survives the selected card', () => {
        // .lib-src-card.active inverts .lib-src-ic to var(--text-primary) — black under
        // the light theme. An <img> carrying the dark ink vanished there; measured in
        // all four theme x selected combinations, only the mask stays contrasted.
        const rendered = JSON.stringify(SOURCE_ICONS.src_highresaudio);
        expect(rendered).toContain('lib-src-logo-hra');
        expect(rendered).not.toContain('<img');
        // Still named for anyone the image cannot reach.
        expect(rendered).toContain('HIGHRESAUDIO');
    });

    it('leaves every other source to be named', () => {
        // The header's fallback is the normal path; a further mark is a deliberate act,
        // not something that should arrive by copy-paste. The four that have one are the
        // streaming services and Roon, whose logos ARE their names written out — the local
        // library and a UPnP server are named, because naming them says more than a glyph
        // would, and because a UPnP server's name is its own, not a brand's.
        expect(Object.keys(SOURCE_MARKS).sort())
            .toEqual(['src_highresaudio', 'src_mono-sgen', 'src_qobuz', 'src_roon', 'src_tidal']);
    });
});
