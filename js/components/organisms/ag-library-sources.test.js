/**
 * Unit tests for ag-library-sources.js — which card the screen lights, and which
 * entries it lists at all.
 *
 * The real methods are called on a bare instance rather than reimplemented here:
 * a copy of the logic would keep passing after the component stopped agreeing
 * with it, which is exactly how the defect these tests guard went unnoticed.
 *
 * Covers:
 * - The badge follows the SOURCE (a station), not the engine carrying it (MPD)
 * - Nothing playing lights nothing, even though a source stays selected
 * - An input lights up on its own node — its origin names a door, not a catalogue
 * - The list is split by type, so a new source needs no edit here
 */
import { describe, it, expect, vi } from 'vitest';

// api.js demands authentication at import time and throws in this environment,
// so it is stubbed the way library-constants.test.js already stubs it. The
// component itself is imported for real — a copy of its logic would keep passing
// after the component stopped agreeing with it.
vi.mock('../../api.js', () => ({
    apiGet: vi.fn(), apiPost: vi.fn(), apiPut: vi.fn(), apiDelete: vi.fn(),
}));
vi.mock('../../library-store.js', () => ({
    getSnapshot: vi.fn(), subscribePlayerState: vi.fn(() => () => {}),
    getRoonZones: vi.fn(), hasSubscription: vi.fn(),
}));

const { AgLibrarySources } = await import('./ag-library-sources.js');
const { BROWSE_KINDS, INPUT_KINDS } = await import('../library-constants.js');

/**
 * Build an instance with no DOM and no lifecycle.
 *
 * `_playingId` is defined as an own data property: Lit turns declared state into
 * a reactive accessor on the prototype, and assigning through it on an object
 * that never ran a constructor reaches for internals that do not exist.
 *
 * @param {string} [playingId] - Value to shadow the reactive property with.
 * @returns {AgLibrarySources} The instance.
 */
function bare(playingKey) {
    const el = Object.create(AgLibrarySources.prototype);
    if (playingKey !== undefined) {
        Object.defineProperty(el, '_playingKey', { value: playingKey, writable: true });
    }
    return el;
}

/**
 * @param {AgLibrarySources} el - Instance under test.
 * @param {object} state - PlayerState.
 * @returns {Array<string>} The sources it would light, sorted.
 */
function lit(el, state) {
    const key = el._playingKeyFrom(state);
    return key ? key.split('\n') : [];
}

/** Origin → content source, mirroring the backend's CONTENT_SOURCE_BY_ORIGIN.
 *  `library` is in it for the same reason it is there: a local track played by
 *  something else (a push to HQPlayer) still comes from the local library, and
 *  naming the thing playing it would name a routing handle no card can match.
 *  A UPnP server is absent on purpose — nothing derives its udn from an origin,
 *  which is why those tests pass `contentSourceId` explicitly. */
const CONTENT_SOURCE = {
    library: 'src_mpd', qobuz: 'src_qobuz', tidal: 'src_tidal',
    highresaudio: 'src_highresaudio', radio: 'src_radio',
};

/**
 * Build a PlayerState as the backend sends it.
 *
 * @param {object} o - Overrides.
 * @param {string} o.sourceId - Transport node that is playing.
 * @param {string} [o.origin] - Content provider of that audio.
 * @param {string} [o.originName] - Specific provider name (a media server's).
 * @param {boolean} [o.playing] - Whether any entry carries the active flag.
 * @param {string|null} [o.contentSourceId] - The published content source. Left
 *   out, it is derived as the backend derives it; passed as `null`, it stands for
 *   a source the backend could not name, which is a case of its own.
 * @returns {object} The state.
 */
function state({ sourceId, origin = null, originName = null, playing = true,
                 contentSourceId: csid = undefined }) {
    const content = csid !== undefined
        ? csid : (CONTENT_SOURCE[origin] || sourceId || null);
    return {
        source_id: sourceId,
        origin,
        origin_name: originName,
        content_source_id: content,
        sources: [
            {
                source_id: sourceId, kind: 'library', playing,
                origin, origin_name: originName,
                content_source_id: content,
                active: playing,
            },
            { source_id: 'src_radio', kind: 'radio', playing: false, origin: null },
            { source_id: 'src_qobuz', kind: 'streaming', playing: false, origin: null },
        ],
    };
}

describe('_playingFrom — the source, not the engine', () => {
    it('lights the radio, not Local Library, while a station plays', () => {
        // The defect that started this: a webradio plays through MPD, so the
        // transport flag lands on src_mpd and the screen said "Local Library".
        expect(lit(bare(), state({ sourceId: 'src_mpd', origin: 'radio' })))
            .toEqual(['src_radio']);
    });

    it.each([
        ['qobuz', 'src_qobuz'],
        ['tidal', 'src_tidal'],
        ['highresaudio', 'src_highresaudio'],
    ])('lights %s rather than the engine it streams over', (origin, expected) => {
        expect(lit(bare(), state({ sourceId: 'src_mpd', origin })))
            .toEqual([expected]);
    });

    it('leaves a local file on Local Library — there the engine IS the source', () => {
        expect(lit(bare(), state({ sourceId: 'src_mpd', origin: 'library' })))
            .toEqual(['src_mpd']);
    });

    it('lights an input on its own node', () => {
        // An input hides the source behind it, so the door is all there is to
        // name: 'airplay' maps to no catalogue, and the node stands for it.
        expect(lit(bare(), state({ sourceId: 'src_shairport-sync', origin: 'airplay' })))
            .toEqual(['src_shairport-sync']);
    });

    it('lights nothing when nothing is playing', () => {
        // A source stays selected after playback stops, and the state still
        // names it — reading it without this guard would leave a card lit.
        expect(lit(bare(), state({ sourceId: 'src_mpd', origin: 'radio', playing: false })))
            .toEqual([]);
    });

    it('lights nothing on an empty state', () => {
        expect(lit(bare(), null)).toEqual([]);
        expect(lit(bare(), {})).toEqual([]);
    });
});

describe('a UPnP server is a source too, and must not be mistaken for the engine', () => {
    /*
     * The screen no longer consults its own list of servers here: it reads the id
     * the backend publishes. Telling two servers that share a friendly name apart
     * is therefore a backend property, pinned by
     * tests/test_now_playing.py::test_two_servers_sharing_a_name_are_told_apart.
     * What is left to check here is what this screen decides: that it uses that
     * id verbatim, and what it does when there is none.
     */
    const MINIM = { id: 'upnp:uuid:a3f9b925', friendly_name: 'Music Library' };

    it('lights the server the track came from', () => {
        expect(lit(bare(), state({
            sourceId: 'src_mpd', origin: 'upnp', originName: 'Music Library',
            contentSourceId: MINIM.id,
        }))).toEqual([MINIM.id]);
    });

    it('never lights Local Library for a server this screen does not know', () => {
        // The regression this branch exists for: read off `source_id` the answer
        // would be the MPD engine, and the local library would claim a track
        // served by a machine down the hall. The backend names the server, so it
        // is named here too — no card carries that id, so none lights.
        expect(lit(bare(), state({
            sourceId: 'src_mpd', origin: 'upnp', originName: 'Gone Server',
            contentSourceId: 'upnp:uuid:gone',
        }))).toEqual(['upnp:uuid:gone']);
    });

    it('names nothing when the backend could not identify the server', () => {
        // A stream queued before the server could be named, or by a core that
        // predates the field: falling through to the engine is the one answer
        // that must never happen.
        expect(lit(bare(), state({
            sourceId: 'src_mpd', origin: 'upnp', originName: 'Music Library',
            contentSourceId: null,
        }))).toEqual([]);
    });

    it('uses the id, not the name, for two servers that share one', () => {
        // The name is identical on both; only the id says which is playing. Read
        // off `origin_name`, as this screen used to, both cards lit.
        const twin = 'upnp:uuid:twin';
        expect(lit(bare(), state({
            sourceId: 'src_mpd', origin: 'upnp', originName: MINIM.friendly_name,
            contentSourceId: twin,
        }))).toEqual([twin]);
    });
});

describe('several sources can diffuse at once', () => {
    /*
     * Measured on the box: AirPlay to the toslink and Qobuz to the USB DAC, both
     * audible. The player state names ONE of them — whichever started first — so
     * reading it lit that one and left the other grey. Each entry carries its own
     * `playing` and its own `origin`, which is what the screen reads now.
     */
    const BOTH = {
        source_id: 'src_shairport-sync',
        origin: 'airplay',
        sources: [
            { source_id: 'src_mpd', kind: 'library', playing: true,
              playback_status: 'Playing', origin: 'qobuz',
              content_source_id: 'src_qobuz', active: false },
            { source_id: 'src_shairport-sync', kind: 'input', playing: true,
              playback_status: 'Playing', origin: 'airplay',
              content_source_id: 'src_shairport-sync', active: true },
            { source_id: 'src_qobuz', kind: 'streaming', playing: false, origin: null },
        ],
    };

    it('lights both, whichever one the player is following', () => {
        expect(lit(bare(), BOTH)).toEqual(['src_qobuz', 'src_shairport-sync']);
    });

    it('lights both when the OTHER one started first', () => {
        // The same audio, the flag on the other entry: the answer must not move.
        const swapped = {
            ...BOTH,
            source_id: 'src_mpd',
            origin: 'qobuz',
            sources: BOTH.sources.map(s => ({ ...s, active: s.source_id === 'src_mpd' })),
        };
        expect(lit(bare(), swapped)).toEqual(['src_qobuz', 'src_shairport-sync']);
    });

    it('names each stream by its own content, not by the engine carrying it', () => {
        // The Qobuz stream travels over MPD: read off `source_id` it would be a
        // second "Local Library", and the Qobuz card would stay dark.
        expect(lit(bare(), BOTH)).not.toContain('src_mpd');
    });
});

describe('_withStatus — the status is derived, never stored', () => {
    it('marks every playing card and no other', () => {
        const el = bare();
        const playing = new Set(['src_radio', 'src_qobuz']);
        expect(el._withStatus({ id: 'src_radio' }, playing).status).toBe('active');
        expect(el._withStatus({ id: 'src_qobuz' }, playing).status).toBe('active');
        expect(el._withStatus({ id: 'src_mpd' }, playing).status).toBe('');
    });

    it('keeps the node it was given', () => {
        const node = { id: 'src_qobuz', name: 'Qobuz', kind: 'streaming' };
        expect(bare()._withStatus(node, new Set())).toMatchObject(node);
    });

    it('reads the key back as a set, so a quiet tick re-renders nothing', () => {
        expect([...bare('a\nb')._playingIds].sort()).toEqual(['a', 'b']);
        expect(bare('')._playingIds.size).toBe(0);
    });
});

describe('a core that does not send the type must not empty the screen', () => {
    // Built through the component's own mapping, not by hand: the first attempt
    // hand-rolled these shapes, so it kept passing while the mapping quietly
    // dropped the two fields the fallback reads.
    const OLD_CORE = [
        { source_id: 'src_mpd', name: 'MPD', protocol: 'mpd', selectable: true },
        { source_id: 'src_shairport-sync', name: 'AirPlay', protocol: 'mpris', selectable: true },
        { source_id: 'upnp_renderer', name: 'Marantz', protocol: 'upnp', selectable: false },
    ].map(AgLibrarySources.toNode);

    it('falls back to what the old filter meant, without its list of names', () => {
        // The two packages install separately and the version banner only warns
        // across a major.minor gap, so a frontend one patch ahead would render
        // no cards at all — worse than the defect being fixed.
        const { libSources, inputs } = bare()._splitByType(OLD_CORE);
        expect(libSources.map(n => n.id)).toEqual(['src_mpd']);
        expect(inputs.map(n => n.id)).toEqual(['src_shairport-sync']);
    });

    it('keeps a routing handle out of both halves', () => {
        const { libSources, inputs } = bare()._splitByType(OLD_CORE);
        expect([...libSources, ...inputs].map(n => n.id)).not.toContain('upnp_renderer');
    });

    it('carries the two fields the fallback reads', () => {
        // The guard that was missing: without them every entry passes as a
        // source and the Inputs section comes out empty.
        const node = AgLibrarySources.toNode(
            { source_id: 'x', name: 'X', protocol: 'mpris', selectable: false });
        expect(node.protocol).toBe('mpris');
        expect(node.selectable).toBe(false);
    });

    it('uses the type as soon as one entry carries it', () => {
        const mixed = [
            { id: 'src_radio', kind: 'radio', protocol: 'radio' },
            { id: 'src_shairport-sync', kind: 'input', protocol: 'mpris' },
        ];
        const { libSources, inputs } = bare()._splitByType(mixed);
        expect(libSources.map(n => n.id)).toEqual(['src_radio']);
        expect(inputs.map(n => n.id)).toEqual(['src_shairport-sync']);
    });
});

describe('the list is split by type, not by a list of names', () => {
    it('offers every browsable kind, including the radio', () => {
        // The six hard-coded ids this replaces had no src_radio, which is why
        // the station had no card to light in the first place.
        for (const kind of ['library', 'streaming', 'roon', 'radio']) {
            expect(BROWSE_KINDS.has(kind)).toBe(true);
        }
    });

    it('keeps inputs out of the browsable half', () => {
        expect(BROWSE_KINDS.has('input')).toBe(false);
        expect(INPUT_KINDS.has('input')).toBe(true);
    });

    it('lists no routing handle: a renderer and HQPlayer carry no kind', () => {
        expect(BROWSE_KINDS.has(undefined)).toBe(false);
        expect(INPUT_KINDS.has(undefined)).toBe(false);
    });
});
