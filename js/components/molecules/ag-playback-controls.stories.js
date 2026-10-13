import './ag-playback-controls.js';

export default {
    title: 'Molecules/AgPlaybackControls',
    tags: ['autodocs'],
    argTypes: {
        playing:  { control: 'boolean' },
        canNext:  { control: 'boolean' },
        canPrev:  { control: 'boolean' },
        repeat:   { control: 'boolean' },
        shuffle:  { control: 'boolean' },
        live:     { control: 'boolean' },
    },
};

const Template = ({ playing, canNext, canPrev, repeat, shuffle, live = false }) => {
    const el = document.createElement('ag-playback-controls');
    el.playing  = playing;
    el.canNext  = canNext;
    el.canPrev  = canPrev;
    el.repeat   = repeat;
    el.shuffle  = shuffle;
    el.live     = live;
    el.style.cssText = 'display:block;max-width:400px;padding:16px;';
    el.addEventListener('playback-control', (e) => console.log('playback-control', e.detail));
    return el;
};

export const Default = Template.bind({});
Default.args = { playing: false, canNext: true, canPrev: true, repeat: false, shuffle: false };

export const Playing = Template.bind({});
Playing.args = { playing: true, canNext: true, canPrev: true, repeat: false, shuffle: false };

export const WithRepeatAndShuffle = Template.bind({});
WithRepeatAndShuffle.args = { playing: true, canNext: true, canPrev: true, repeat: true, shuffle: true };

/** A station played alone: nothing to skip to, no mode to set — all greyed but Play / Pause. */
export const Station = Template.bind({});
Station.args = { playing: true, canNext: false, canPrev: false, repeat: false, shuffle: false, live: true };

/** A station with tracks queued behind it: Next and the modes, which act on them. */
export const StationWithTracksBehind = Template.bind({});
StationWithTracksBehind.args = { playing: true, canNext: true, canPrev: false, repeat: false, shuffle: false, live: true };
