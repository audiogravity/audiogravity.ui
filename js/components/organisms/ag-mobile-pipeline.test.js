/**
 * Unit tests for ag-mobile-pipeline.js — data acquisition only, no DOM mount.
 *
 * What these tests really pin down is that the pipeline tab STOPS POLLING.
 * It used to re-request /audio_pipeline/current every 5 s; measured on the box
 * (2026-07-27) that endpoint costs ~570 ms of server time, so an open tab burned
 * roughly seven minutes of CPU per hour on the machine that plays the music
 * (CLAUDE.md rule 12). Reintroducing a poll on that endpoint has to fail here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class {
        connectedCallback() {}
        disconnectedCallback() {}
    },
    html: (strings, ...values) => ({ strings, values }),
    nothing: null,
}));
vi.mock('../../api.js', () => ({ apiGet: vi.fn(), apiPost: vi.fn() }));
vi.mock('../../ag-icons.js', () => ({
    iconSmartphone: '', iconServer: '', iconCpu: '', iconAudioWaveform: '',
    iconAudioLines: '', iconVolume: '', iconMusicNote: '', iconDatabase: '',
    iconConnection: '',
    // Pulled in by library-constants, which the origin badge resolves through.
    iconRadio: '', iconHardDrive: '', iconWifi: '', iconLibrary: '',
    iconExternalLink: '', iconCast: '',
}));
vi.mock('../atoms/ag-source-badge.js', () => ({}));
// The player-state stream is the component's second input. Subscribing is
// recorded rather than opened: the real store would build an EventSource.
const playerSubs = [];
vi.mock('../../library-store.js', () => ({
    subscribePlayerState: vi.fn((cb) => {
        playerSubs.push(cb);
        return () => { playerSubs.splice(playerSubs.indexOf(cb), 1); };
    }),
}));

import { apiGet } from '../../api.js';
import { subscribePlayerState } from '../../library-store.js';
import { AgMobilePipeline } from './ag-mobile-pipeline.js';

const PIPELINE = '/audio_pipeline/current';
const STEERING = '/steering/status';

/** Count the calls made to one endpoint. */
const callsTo = (path) => apiGet.mock.calls.filter(([p]) => p === path).length;

function makeEl() {
    const el = new AgMobilePipeline();
    // customElements.define ran at import time; the lifecycle is driven by hand here.
    AgMobilePipeline._injectStyles = vi.fn();
    return el;
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    apiGet.mockResolvedValue({});
    playerSubs.length = 0;
});

afterEach(() => {
    vi.useRealTimers();
});

describe('ag-mobile-pipeline data acquisition', () => {
    it('requests the pipeline exactly once, then listens', async () => {
        const el = makeEl();
        el.connectedCallback();
        await vi.advanceTimersByTimeAsync(0);

        expect(callsTo(PIPELINE)).toBe(1);
    });

    it('never polls the pipeline endpoint again, however long the tab stays open', async () => {
        const el = makeEl();
        el.connectedCallback();
        await vi.advanceTimersByTimeAsync(5 * 60_000);

        // The old code would sit at 60 calls here.
        expect(callsTo(PIPELINE)).toBe(1);
    });

    it('takes its updates from the SSE event instead', () => {
        const el = makeEl();
        el.connectedCallback();

        window.dispatchEvent(new CustomEvent('audio-pipeline-update', {
            detail: { streams: [{ id: 'src_mpd' }] },
        }));

        expect(el._pipeline).toEqual({ streams: [{ id: 'src_mpd' }] });
        expect(callsTo(PIPELINE)).toBe(1);  // the event costs no request
    });

    it('still polls steering, which has no event on the dashboard channel', async () => {
        const el = makeEl();
        el.connectedCallback();
        await vi.advanceTimersByTimeAsync(45_000);

        expect(callsTo(STEERING)).toBe(4);  // once on connect, then every 15 s
    });

    it('stops listening and polling once disconnected', async () => {
        const el = makeEl();
        el.connectedCallback();
        await vi.advanceTimersByTimeAsync(0);
        el._pipeline = 'untouched';
        const steeringBefore = callsTo(STEERING);

        el.disconnectedCallback();
        window.dispatchEvent(new CustomEvent('audio-pipeline-update', { detail: { streams: [] } }));
        await vi.advanceTimersByTimeAsync(60_000);

        expect(el._pipeline).toBe('untouched');
        expect(callsTo(STEERING)).toBe(steeringBefore);
    });

    it('survives a failing backend without leaving the tab on the loader', async () => {
        apiGet.mockRejectedValue(new Error('backend down'));
        const el = makeEl();

        el.connectedCallback();
        await vi.advanceTimersByTimeAsync(0);

        expect(el._loading).toBe(false);
    });
});

describe('an empty signal path explains itself', () => {
    /**
     * Flatten the nested template objects the lit mock produces into plain text.
     * @param {*} node
     * @returns {string}
     */
    function text(node) {
        if (node === null || node === undefined || node === false) return '';
        if (Array.isArray(node)) return node.map(text).join('');
        if (typeof node === 'object' && node.strings) {
            return node.strings
                .map((s, i) => s + (i < node.values.length ? text(node.values[i]) : ''))
                .join('');
        }
        return String(node);
    }

    function withPipeline(pipeline) {
        const el = Object.create(AgMobilePipeline.prototype);
        el._pipeline = pipeline;
        return el;
    }

    it('names the output it found when the described chain does not mention it', () => {
        // Measured on a box: a HiFiBerry HAT playing, a chain describing USB and
        // optical, every device inactive — and a blank space where the path goes.
        const out = text(withPipeline({
            nodes: [{
                type: 'device',
                device_type: 'streamer',
                outputs: [{ id: 'usb', label: 'USB Audio Output' },
                          { id: 'toslink', label: 'Optical Output' }],
                metadata: { unmatched_outputs: [{ label: 'HiFiBerry DAC+ Pro', output_type: 'analog' }] },
            }],
        })._renderNoChain());

        expect(out).toContain('HiFiBerry DAC+ Pro');
        expect(out).toContain('USB Audio Output');
        expect(out).toContain('CONFIG');
    });

    it('puts what is playing next to what is declared', () => {
        // Which of the two has to change is the whole question, and reading them
        // side by side answers it without knowing how the matching works.
        const out = text(withPipeline({
            nodes: [{
                type: 'device',
                device_type: 'streamer',
                outputs: [{ id: 'usb', label: 'USB Audio Output' }],
                metadata: { unmatched_outputs: [{ label: 'HiFiBerry DAC+ Pro', output_type: 'analog' }] },
            }],
        })._renderNoChain());

        expect(out).toContain('Playing through');
        expect(out).toContain('Your chain declares');
    });

    it('names the box, not the whole chain, when its outputs are missing', () => {
        const out = text(withPipeline({
            nodes: [{ type: 'device', device_type: 'streamer', outputs: [], metadata: {} }],
        })._renderNoChain());

        expect(out).toContain('no output on this box');
    });

    it('says the route could not be traced when music plays and nothing is undeclared', () => {
        // A correctly described HAT board: the kind is declared, so nothing is
        // reported undeclared — but the port never lit, because the activity
        // matcher works from the card's name. "Nothing is flowing" would be
        // flatly false while music plays.
        const out = text(withPipeline({
            nodes: [{ type: 'device', device_type: 'streamer', outputs: [{ id: 'rca', label: 'Analog Out' }], metadata: {} }],
        })._renderNoChain({ playing: true }));

        // Template line-wrapping puts a newline inside the sentence: collapse
        // whitespace before matching, as a browser would render it.
        expect(out.replace(/\s+/g, ' ')).toContain('could not be traced');
        expect(out).not.toContain('Nothing is flowing');
    });

    it('says something plain when everything matches but nothing is playing', () => {
        const out = text(withPipeline({
            nodes: [{ type: 'device', device_type: 'streamer', outputs: [], metadata: {} }],
        })._renderNoChain());

        expect(out).toContain('Nothing is flowing');
        // Assert on words the other branch really writes: 'does not mention'
        // appears nowhere in the component, so the negative was always true and
        // the two branch bodies could have been swapped unnoticed.
        expect(out).not.toContain('not one your described chain');
    });

    it('explains instead of drawing nothing when no device is active', () => {
        // The old behaviour: streams exist, no device is active, render ''.
        const el = withPipeline({
            nodes: [
                { id: 'src_mpd', type: 'service', status: 'active' },
                { id: 'streamer_01', type: 'device', device_type: 'streamer', status: 'inactive', outputs: [], metadata: {} },
            ],
        });
        el._getActiveStreams = () => [{ id: 'src_mpd', label: 'MPD', color: 'mpd' }];

        expect(text(el._renderChain())).toContain('Signal chain');
    });
});

describe('what the panel says is declared', () => {
    /** Flatten the mocked lit templates into plain text. */
    function flat(node) {
        if (node === null || node === undefined || node === false) return '';
        if (Array.isArray(node)) return node.map(flat).join('');
        if (typeof node === 'object' && node.strings) {
            return node.strings
                .map((s, i) => s + (i < node.values.length ? flat(node.values[i]) : ''))
                .join('');
        }
        return String(node);
    }

    function view(nodes) {
        const el = Object.create(AgMobilePipeline.prototype);
        el._pipeline = { nodes };
        return el;
    }

    it('names the box when only its own outputs are missing', () => {
        // A streamer with no declared ports serialises outputs: null, which says
        // nothing about the rest of the description. "No output at all" sent the
        // owner of a described DAC → amp → speakers chain to fix what was there.
        const out = flat(view([
            { type: 'device', device_type: 'streamer', outputs: null, metadata: {} },
            { type: 'device', device_type: 'converter', outputs: [] },
            { type: 'device', device_type: 'amplifier', outputs: [] },
        ])._renderNoChain());

        expect(out).toContain('no output on this box');
        expect(out).not.toContain('no output at all');
    });

    it('lists the declared outputs when there are some', () => {
        const out = flat(view([{
            type: 'device',
            device_type: 'streamer',
            outputs: [{ id: 'usb', label: 'USB Audio Output' }, { id: 'toslink', label: 'Optical Output' }],
            metadata: {},
        }])._renderNoChain());

        expect(out).toContain('USB Audio Output, Optical Output');
    });
});

describe('a card names where the audio comes from, not just what carries it', () => {
    /**
     * A pipeline with one active service and its now-playing block, which is all
     * `_getActiveStreams` reads.
     */
    function pipelineWith(serviceId, serviceName, npKey = 'mpd') {
        return {
            nodes: [
                {
                    type: 'device', device_type: 'streamer', status: 'active',
                    internal_services: [{ id: npKey, label: serviceName }],
                    metadata: { service_now_playing: { [npKey]: { title: 'Hot Slob', state: 'playing' } } },
                },
                { type: 'service', id: serviceId, name: serviceName, status: 'active' },
            ],
        };
    }

    /** Component with a pipeline and a player state already delivered. */
    function view(pipeline, sources) {
        const el = makeEl();
        el.connectedCallback();
        el._pipeline = pipeline;
        el._onPlayerState({ sources });
        return el;
    }

    it('reads the provider from the player state, which the pipeline does not carry', () => {
        // Measured on the box: /audio_pipeline/current has title/format and no
        // origin, so the card could only ever say "MPD" for a Qobuz album.
        const el = view(pipelineWith('src_mpd', 'MPD'), [
            { source_id: 'src_mpd', playing: true, origin: 'qobuz', protocol: 'mpd' },
        ]);
        const [stream] = el._getActiveStreams();

        expect(stream.origin).toBe('qobuz');
        expect(el._showOrigin(stream)).toBe(true);
    });

    it('prefers the server or station name over the generic word', () => {
        const el = view(pipelineWith('src_mpd', 'MPD'), [
            { source_id: 'src_mpd', playing: true, origin: 'upnp', origin_name: 'MinimServer', protocol: 'mpd' },
        ]);

        expect(el._getActiveStreams()[0].originName).toBe('MinimServer');
    });

    it('joins HQPlayer across the two ids the sides use for it', () => {
        // The pipeline node is the local daemon holding the PCM
        // (src_networkaudiod); the player's item is the engine (src_hqplayer).
        // Without the alias the card would find no origin at all.
        const el = view(pipelineWith('src_networkaudiod', 'HQPlayer NAA', 'networkaudiod'), [
            { source_id: 'src_hqplayer', playing: true, origin: 'qobuz', protocol: 'hqplayer' },
        ]);
        const [stream] = el._getActiveStreams();

        expect(stream.origin).toBe('qobuz');
        expect(el._showOrigin(stream)).toBe(true);
    });

    it('stays quiet when the provider would only repeat the transport', () => {
        const el = view(pipelineWith('src_shairport-sync', 'AirPlay', 'shairport-sync'), [
            { source_id: 'src_shairport-sync', playing: true, origin: 'airplay', protocol: 'mpris' },
        ]);

        expect(el._showOrigin(el._getActiveStreams()[0])).toBe(false);
    });

    it('stays quiet when the two pills merely word the same thing differently', () => {
        // "HQPlayer NAA" beside "HQPlayer" says one thing twice. The name is
        // still what the players need, where no transport pill stands next to
        // it — this is the pipeline declining a repeat, not the name being wrong.
        const el = view(pipelineWith('src_networkaudiod', 'HQPlayer NAA', 'networkaudiod'), [
            { source_id: 'src_hqplayer', playing: true, origin: 'external', protocol: 'hqplayer' },
        ]);
        const [stream] = el._getActiveStreams();

        expect(stream.originName).toBe('HQPlayer');
        expect(el._showOrigin(stream)).toBe(false);
    });

    it('stays quiet for an origin that names no provider at all', () => {
        // upmpdcli streams report origin 'mpris' — the core's "a player is
        // streaming and AG cannot say from where", shown as "Stream". Beside a
        // pill already reading "UPnP Bridge" it is furniture.
        const el = view(pipelineWith('src_upmpdcli', 'UPnP Bridge', 'upmpdcli'), [
            { source_id: 'src_upmpdcli', playing: true, origin: 'mpris', protocol: 'mpris' },
        ]);

        expect(el._showOrigin(el._getActiveStreams()[0])).toBe(false);
    });

    it('says nothing rather than guessing when the player knows no origin', () => {
        const el = view(pipelineWith('src_mpd', 'MPD'), [
            { source_id: 'src_mpd', playing: true, origin: null, protocol: 'mpd' },
        ]);

        expect(el._showOrigin(el._getActiveStreams()[0])).toBe(false);
    });
});

describe('reading the player stream costs the box nothing', () => {
    it('joins the stream the mini player already holds open, without a request', () => {
        const el = makeEl();
        el.connectedCallback();

        expect(subscribePlayerState).toHaveBeenCalledTimes(1);
        expect(callsTo('/player/state')).toBe(0);
        expect(callsTo('/player/state/snapshot')).toBe(0);
    });

    it('ignores a tick that changes nothing, instead of re-rendering the tab', () => {
        // The stream carries the playback position: it fires about once a second
        // whether the origin moved or not (CLAUDE.md rule 12).
        const el = makeEl();
        el.connectedCallback();
        const sources = [{ source_id: 'src_mpd', playing: true, origin: 'qobuz', protocol: 'mpd' }];

        el._onPlayerState({ sources });
        const first = el._origins;
        el._onPlayerState({ sources: [{ ...sources[0], elapsed: 42 }] });

        expect(el._origins).toBe(first);       // same object — no state change
    });

    it('does take the change when the track moves to another provider', () => {
        const el = makeEl();
        el.connectedCallback();

        el._onPlayerState({ sources: [{ source_id: 'src_mpd', playing: true, origin: 'qobuz', protocol: 'mpd' }] });
        const first = el._origins;
        el._onPlayerState({ sources: [{ source_id: 'src_mpd', playing: true, origin: 'radio', origin_name: 'FIP', protocol: 'mpd' }] });

        expect(el._origins).not.toBe(first);
        expect(el._origins.src_mpd).toEqual({ origin: 'radio', name: 'FIP' });
    });

    it('lets go of the stream when the tab is left', () => {
        const el = makeEl();
        el.connectedCallback();
        expect(playerSubs.length).toBe(1);

        el.disconnectedCallback();

        expect(playerSubs.length).toBe(0);
    });
});
