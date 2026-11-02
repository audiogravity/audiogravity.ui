import './ag-vu-showcase.js';

/**
 * In the app the showcase opens from the full-screen player and follows the player's
 * state stream; in Storybook (no box) it is opened and its state set directly. Its
 * dials, without a stream, rest: their own story (Molecules/AgVuMeter) shows them moving.
 * Exit closes it — reload the story to open it again.
 */
export default {
    title: 'Organisms/AgVuShowcase',
    component: 'ag-vu-showcase',
    parameters: { layout: 'fullscreen' },
};

const Template = ({ state }) => {
    const showcase = document.createElement('ag-vu-showcase');
    queueMicrotask(() => {
        showcase.open(null);
        showcase._state = state;
    });
    return showcase;
};

/** A CD-quality track of the box's library. */
export const Playing = Template.bind({});
Playing.args = {
    state: {
        title: 'Elle', artist: '-M-', album: 'Îl', level_meter: true, playing: true,
        format: { format: 'FLAC', sample_rate: '44.1kHz', bitrate: '16bit', codec: 'FLAC' },
    },
};

/** AirPlay plays: the meter follows the box's own player only, and says so. */
export const AnotherPlayer = Template.bind({});
AnotherPlayer.args = {
    state: { title: 'From the phone', artist: 'Someone', level_meter: false, playing: true },
};
