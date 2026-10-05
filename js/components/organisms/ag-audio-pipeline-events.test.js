/**
 * What the Audio events panel records from the pipeline's live updates.
 *
 * It recorded playbacks that never happened. Each update was compared with the previous
 * pipeline by its LIST of nodes, and any node missing from the previous one was written
 * up as a source that "started playback". When the diagram's own first reading of the
 * pipeline failed or had not come back yet, the first update was compared with the empty
 * pipeline the diagram starts from — and the speakers, the amplifier, the turntable, the
 * tuner, the CD player and the phone all "started playback", twelve lines at once.
 * Reproduced on the dev instance (2026-10-04) by failing that first reading.
 *
 * Covers:
 * 1. which node is a player that plays
 * 2. the lines a change records — and the changes that record none
 * 3. the first pipeline the diagram receives is a starting point, not a change
 * 4. an older pipeline than the one shown changes nothing and records nothing
 * 5. the last update of a burst is drawn too
 * 6. a report that goes missing, or comes back, is not a change of state
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class {},
    html: (strings, ...values) => ({ strings, values }),
    css: (strings, ...values) => ({ strings, values }),
    svg: (strings, ...values) => ({ strings, values }),
    nothing: null,
}));
vi.mock('../../api.js', () => ({ apiGet: vi.fn(), apiPost: vi.fn() }));
// The page's newest pipeline: read here from a test's own answer; the ordering is real.
vi.mock('../../core/pipeline-state.js', async (importOriginal) => ({
    ...(await importOriginal()),
    currentPipeline: vi.fn(),
}));
vi.mock('../../ag-icons.js', () => ({
    iconMusicNote: '', iconCrosshair: '', iconZoomIn: '', iconZoomOut: '',
}));
vi.mock('../atoms/ag-pipeline-node.js', () => ({ renderPipelineNode: () => '' }));
vi.mock('../atoms/ag-pipeline-link.js', () => ({ renderPipelineLink: () => '' }));
vi.mock('../../history.js', () => ({ addToHistory: vi.fn() }));

const { AgAudioPipeline, isPlayingNode, playbackEvents } = await import('./ag-audio-pipeline.js');
const { currentPipeline } = await import('../../core/pipeline-state.js');
const { addToHistory } = await import('../../history.js');

/**
 * A player node, as the core sends it.
 * @param {string} name
 * @param {object} [state] - status and metadata overrides.
 * @returns {object}
 */
const player = (name, { status = 'active', ...metadata } = {}) => ({
    id: `src_${name.toLowerCase()}`, name, type: 'service', status, metadata,
});

/**
 * A device node of the topology.
 * @param {string} id
 * @param {string} name
 * @param {string} [status]
 * @returns {object}
 */
const device = (id, name, status = 'inactive') => ({ id, name, type: 'device', device_type: 'source', status });

/** The devices of the dev instance's topology that do not play by themselves. */
const DEVICES = [
    device('turntable_01', 'Vinyl Player'),
    device('tuner_01', 'FM Tuner'),
    device('cdp_01', 'CD Player'),
    device('iphone_01', 'iPhone 15 Pro'),
    device('speakers_01', 'Rogers LS3/5a', 'active'),
];

const PLAYING = player('MPD', { playback_status: 'Playing', artist: 'Miles Davis', title: 'So What' });
const PAUSED = player('MPD', { playback_status: 'Paused', artist: 'Miles Davis', title: 'So What' });
const STOPPED_AIRPLAY = player('AirPlay', { status: 'inactive', playback_status: 'Stopped' });

describe('a player that plays', () => {
    it('is a service the core reports playing', () => {
        expect(isPlayingNode(PLAYING)).toBe(true);
    });

    it('is not a paused service still holding the sound card', () => {
        // The core marks it active (it holds the card); the player says it is paused.
        expect(PAUSED.status).toBe('active');
        expect(isPlayingNode(PAUSED)).toBe(false);
    });

    it('is not a stopped service', () => {
        expect(isPlayingNode(STOPPED_AIRPLAY)).toBe(false);
    });

    it('is, for a service that reports no state, one the core marks active', () => {
        expect(isPlayingNode(player('HQPlayer NAA'))).toBe(true);
        expect(isPlayingNode(player('HQPlayer NAA', { status: 'inactive' }))).toBe(false);
    });

    it('is never a device, even one the sound flows through', () => {
        expect(isPlayingNode(device('speakers_01', 'Rogers LS3/5a', 'active'))).toBe(false);
    });

    it('is not a node that is not there', () => {
        expect(isPlayingNode(undefined)).toBe(false);
    });
});

describe('the lines a change records', () => {
    it('none for devices that appear — the twelve fake playbacks', () => {
        const lines = playbackEvents({ nodes: [] }, { nodes: [...DEVICES, STOPPED_AIRPLAY] });
        expect(lines).toEqual([]);
    });

    it('a start, then the track, when a player starts on a new track', () => {
        const before = { nodes: [player('MPD', { status: 'inactive', playback_status: 'Stopped' }), ...DEVICES] };
        expect(playbackEvents(before, { nodes: [PLAYING, ...DEVICES] })).toEqual([
            "Source 'MPD' started playback",
            "Now playing on 'MPD': Miles Davis - So What",
        ]);
    });

    it('only the start when a player resumes the same track', () => {
        expect(playbackEvents({ nodes: [PAUSED] }, { nodes: [PLAYING] })).toEqual([
            "Source 'MPD' started playback",
        ]);
    });

    it('a stop when a player pauses', () => {
        expect(playbackEvents({ nodes: [PLAYING] }, { nodes: [PAUSED] })).toEqual([
            "Source 'MPD' stopped playback",
        ]);
    });

    it('only the track when a playing player moves on', () => {
        const next = player('MPD', { playback_status: 'Playing', artist: 'Miles Davis', title: 'Freddie Freeloader' });
        expect(playbackEvents({ nodes: [PLAYING] }, { nodes: [next] })).toEqual([
            "Now playing on 'MPD': Miles Davis - Freddie Freeloader",
        ]);
    });

    it('nothing when the track changes on a paused player', () => {
        const next = player('MPD', { playback_status: 'Paused', artist: 'Miles Davis', title: 'Freddie Freeloader' });
        expect(playbackEvents({ nodes: [PAUSED] }, { nodes: [next] })).toEqual([]);
    });

    it('an unknown artist as such', () => {
        const next = player('MPD', { playback_status: 'Playing', title: 'Radio Choco' });
        expect(playbackEvents({ nodes: [PLAYING] }, { nodes: [next] })).toEqual([
            "Now playing on 'MPD': Unknown - Radio Choco",
        ]);
    });

    it('a stop when a playing player leaves the pipeline, nothing when an idle one does', () => {
        expect(playbackEvents({ nodes: [PLAYING, STOPPED_AIRPLAY] }, { nodes: [] })).toEqual([
            "Source 'MPD' stopped playback",
        ]);
    });

    it('nothing when the same pipeline comes again', () => {
        const pipeline = { nodes: [PLAYING, STOPPED_AIRPLAY, ...DEVICES] };
        expect(playbackEvents(pipeline, structuredClone(pipeline))).toEqual([]);
    });

    it('nothing when either side carries no node list', () => {
        expect(playbackEvents(null, { nodes: [PLAYING] })).toEqual([]);
        expect(playbackEvents({ nodes: [PLAYING] }, {})).toEqual([]);
    });

    it('nothing when a paused player does not answer once, then answers again', () => {
        // MPD asked while the card it paused on is still held: active, and no report.
        const silent = player('MPD');
        expect(playbackEvents({ nodes: [PAUSED] }, { nodes: [silent] })).toEqual([]);
        expect(playbackEvents({ nodes: [silent] }, { nodes: [PAUSED] })).toEqual([]);
    });

    it('nothing either when a playing one does', () => {
        const silent = player('MPD', { status: 'inactive' });
        expect(playbackEvents({ nodes: [PLAYING] }, { nodes: [silent] })).toEqual([]);
        expect(playbackEvents({ nodes: [silent] }, { nodes: [PLAYING] })).toEqual([]);
    });

    it('a start for a player that appears playing, its report or not', () => {
        expect(playbackEvents({ nodes: [] }, { nodes: [PLAYING] })).toEqual([
            "Source 'MPD' started playback",
            "Now playing on 'MPD': Miles Davis - So What",
        ]);
        expect(playbackEvents({ nodes: [] }, { nodes: [player('HQPlayer NAA')] })).toEqual([
            "Source 'HQPlayer NAA' started playback",
        ]);
    });

    it('still a start and a stop for a player that never reports — the NAA', () => {
        const idle = player('HQPlayer NAA', { status: 'inactive' });
        const busy = player('HQPlayer NAA');
        expect(playbackEvents({ nodes: [idle] }, { nodes: [busy] })).toEqual([
            "Source 'HQPlayer NAA' started playback",
        ]);
        expect(playbackEvents({ nodes: [busy] }, { nodes: [idle] })).toEqual([
            "Source 'HQPlayer NAA' stopped playback",
        ]);
    });
});

describe('the diagram records', () => {
    beforeEach(() => {
        addToHistory.mockClear();
        currentPipeline.mockReset();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    /** Let the history module's dynamic import resolve. */
    const settle = () => vi.dynamicImportSettled();

    /** @param {object} pipeline @returns {{detail: object}} */
    const update = (pipeline) => ({ detail: pipeline });

    it('nothing on its first pipeline, its own reading having failed', async () => {
        const diagram = new AgAudioPipeline();
        diagram._handleUpdate(update({ nodes: [PLAYING, STOPPED_AIRPLAY, ...DEVICES] }));
        await settle();
        expect(addToHistory).not.toHaveBeenCalled();
        expect(diagram.pipeline.nodes).toHaveLength(7);
    });

    it('the changes after that first pipeline', async () => {
        const diagram = new AgAudioPipeline();
        diagram._handleUpdate(update({ nodes: [PLAYING, ...DEVICES] }));
        diagram._handleUpdate(update({ nodes: [PAUSED, ...DEVICES] }));
        await settle();
        expect(addToHistory).toHaveBeenCalledExactlyOnceWith('audio_pipeline', "Source 'MPD' stopped playback", true);
    });

    it('nothing for its own first reading, and the changes from it', async () => {
        currentPipeline.mockResolvedValue({ nodes: [PAUSED, ...DEVICES] });
        const diagram = new AgAudioPipeline();
        await diagram._fetchInitialState();
        await settle();
        expect(addToHistory).not.toHaveBeenCalled();

        diagram._handleUpdate(update({ nodes: [PLAYING, ...DEVICES] }));
        await settle();
        expect(addToHistory).toHaveBeenCalledExactlyOnceWith('audio_pipeline', "Source 'MPD' started playback", true);
    });

    it('nothing for an older pipeline — the offline replay of a saved one — and keeps the newer', async () => {
        // pwa-manager.js replays the pipeline it saved, up to 5 s old, when the device
        // goes offline: compared with the state shown, a pause became a "started playback".
        const diagram = new AgAudioPipeline();
        diagram._handleUpdate(update({ timestamp: '2026-10-04T13:40:01', nodes: [PLAYING] }));
        diagram._handleUpdate(update({ timestamp: '2026-10-04T13:40:04', nodes: [PAUSED] }));
        await settle();
        addToHistory.mockClear();

        diagram._handleUpdate(update({ timestamp: '2026-10-04T13:40:01', nodes: [PLAYING] }));
        await settle();

        expect(addToHistory).not.toHaveBeenCalled();
        expect(diagram.pipeline.timestamp).toBe('2026-10-04T13:40:04');
    });

    it('keeps a live update that arrived while its own reading was on its way, if newer', async () => {
        let answer;
        currentPipeline.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
        const diagram = new AgAudioPipeline();
        const reading = diagram._fetchInitialState();

        diagram._handleUpdate(update({ timestamp: '2026-10-04T13:40:04', nodes: [PAUSED] }));
        answer({ timestamp: '2026-10-04T13:40:01', nodes: [PLAYING] });
        await reading;

        expect(diagram.pipeline.timestamp).toBe('2026-10-04T13:40:04');
    });

    it('draws the last update of a burst too, once the 500 ms are up', () => {
        // It drew the first of a burst and dropped the rest, the final state included.
        vi.useFakeTimers();
        const diagram = new AgAudioPipeline();
        const first = { timestamp: '2026-10-04T13:40:01', nodes: [PLAYING] };
        const last = { timestamp: '2026-10-04T13:40:01.300000', nodes: [PAUSED] };

        diagram._boundHandleUpdate(update(first));
        diagram._boundHandleUpdate(update(last));
        expect(diagram.pipeline).toBe(first);

        vi.advanceTimersByTime(500);
        expect(diagram.pipeline).toBe(last);
    });
});
