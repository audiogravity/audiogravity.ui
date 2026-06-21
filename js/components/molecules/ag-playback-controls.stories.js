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
    },
};

const Template = ({ playing, canNext, canPrev, repeat, shuffle }) => {
    const el = document.createElement('ag-playback-controls');
    el.playing  = playing;
    el.canNext  = canNext;
    el.canPrev  = canPrev;
    el.repeat   = repeat;
    el.shuffle  = shuffle;
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
