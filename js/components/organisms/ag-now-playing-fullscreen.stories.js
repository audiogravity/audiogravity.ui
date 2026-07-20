import './ag-now-playing-fullscreen.js';

/**
 * The organism is driven by the player_state SSE in the app; in Storybook
 * (no backend) the panel is opened and its state set directly, so the stories
 * exercise the real render paths: cover, track meta with signal path, hi-fi
 * format strip, transport, progress, next-track peek and the output bar.
 * SSE subscriptions fail silently without a backend and leave the state as set.
 */

export default {
    title: 'Organisms/NowPlayingFullscreen',
    component: 'ag-now-playing-fullscreen',
    parameters: {
        docs: {
            description: {
                component:
                    'Fullscreen player: cover with dynamic tint, track metadata, '
                    + 'live hi-fi readout, transport, seekable progress, source '
                    + 'switcher dots and the active-output bar.',
            },
        },
    },
};

/** A hi-res local-library track, mid-playback. */
const PLAYING_STATE = {
    source_id: 'src_mpd',
    playing: true,
    title: 'So What',
    artist: 'Miles Davis',
    album: 'Kind of Blue',
    year: 1959,
    elapsed: 74,
    duration: 545,
    can_seek: true,
    can_next: true,
    can_prev: true,
    repeat: false,
    shuffle: false,
    can_set_volume: true,
    volume: 62,
    format: { format: 'FLAC', sample_rate: '192 kHz', bitrate: '4.6 Mbps', codec: 'flac' },
    cover_token: 'demo:kind-of-blue',
    signal_path: [{ label: 'MPD' }, { label: 'USB' }, { label: 'DAC' }],
    output_label: 'Abacus USB DAC',
    output_connector: 'usb-a',
};

/**
 * Mount the fullscreen player opened on a fixed state (no backend).
 * @param {object} state - PlayerState-shaped snapshot.
 * @param {object} [opts] - Optional extras.
 * @param {Array<object>} [opts.sources] - Active sources (drives the dots).
 * @param {object|null} [opts.nextTrack] - Up-next peek entry.
 * @returns {HTMLElement} Wrapped, ready-to-render element.
 */
const mount = (state, { sources = [], nextTrack = null } = {}) => {
    const el = document.createElement('ag-now-playing-fullscreen');
    el._open = true;
    el._state = state;
    el._sources = sources;
    el._nextTrack = nextTrack;
    const wrap = document.createElement('div');
    // The panel is position:fixed; give the story a phone-sized stage.
    wrap.style.cssText = 'position: relative; min-height: 780px;';
    wrap.appendChild(el);
    return wrap;
};

/** Hi-res FLAC playing from the local library, next track queued. */
export const Playing = {
    render: () => mount(PLAYING_STATE, {
        nextTrack: {
            title: 'Freddie Freeloader',
            artist: 'Miles Davis',
            cover_token: 'demo:kind-of-blue',
        },
    }),
};

/** Two concurrent sources — the switcher dots appear under the header. */
export const MultiSource = {
    render: () => mount(PLAYING_STATE, {
        sources: [
            { source_id: 'src_mpd', display_name: 'MPD', playing: true },
            { source_id: 'src_shairport-sync', display_name: 'AirPlay', playing: true },
        ],
    }),
};

/**
 * A Qobuz album cast to a network speaker.
 *
 * The point of the shot: the card is badged with what the music IS (Qobuz),
 * while the speaker is where it COMES OUT — the renderer is an output, not a
 * source. `control_id` stays `upnp_renderer` because that is the device the
 * transport commands must reach.
 */
export const CastToRenderer = {
    render: () => mount({
        ...PLAYING_STATE,
        source_id: 'upnp_renderer',
        control_id: 'upnp_renderer',
        played_on: 'uuid:marantz',
        origin: 'qobuz',
        title: 'Blue in Green',
        signal_path: [{ label: 'Qobuz' }, { label: 'Marantz SR8015' }],
        output_label: 'Marantz SR8015',
        output_connector: null,
        outputs: [
            { id: 'local', type: 'local', name: 'Abacus USB DAC', active: false, transport_state: 'STOPPED' },
            { id: 'uuid:marantz', type: 'upnp_renderer', name: 'Marantz SR8015', active: true, transport_state: 'PLAYING' },
        ],
        active_output_id: 'uuid:marantz',
        queue_next: { title: 'All Blues', artist: 'Miles Davis', cover_token: 'demo:kind-of-blue' },
    }, {
        nextTrack: { title: 'All Blues', artist: 'Miles Davis', cover_token: 'demo:kind-of-blue' },
    }),
};

/**
 * The sound card is held by another player, so nothing comes out.
 *
 * The reason is shown under the output instead of leaving the user with silence
 * and no explanation — the engine's exact wording stays available as a tooltip.
 */
export const OutputBusy = {
    render: () => mount({
        ...PLAYING_STATE,
        playing: false,
        elapsed: 0,
        outputs: [{
            id: 'local',
            type: 'local',
            name: 'Abacus USB DAC',
            active: true,
            transport_state: 'PAUSED',
            error: 'Failed to open ALSA device "hw:0,0": Device or resource busy',
        }],
        active_output_id: 'local',
    }),
};
