import './ag-progress-bar.js';

export default {
    title: 'Molecules/AgProgressBar',
    tags: ['autodocs'],
    argTypes: {
        serverElapsed: { control: { type: 'range', min: 0, max: 300, step: 1 } },
        duration:      { control: { type: 'range', min: 0, max: 300, step: 1 } },
        canSeek:       { control: 'boolean' },
        playing:       { control: 'boolean' },
        title:         { control: 'text' },
    },
};

const Template = ({ serverElapsed, duration, canSeek, playing, title }) => {
    const el = document.createElement('ag-progress-bar');
    el.serverElapsed = serverElapsed;
    el.duration      = duration;
    el.canSeek       = canSeek;
    el.playing       = playing;
    el.title         = title;
    el.style.cssText = 'display:block;max-width:400px;padding:24px 16px;';
    el.addEventListener('seek', (e) => console.log('seek', e.detail));
    return el;
};

export const Default = Template.bind({});
Default.args = { serverElapsed: 90, duration: 240, canSeek: true, playing: false, title: 'Track A' };

export const Playing = Template.bind({});
Playing.args = { serverElapsed: 45, duration: 180, canSeek: true, playing: true, title: 'Track B' };

export const NoDuration = Template.bind({});
NoDuration.args = { serverElapsed: 0, duration: 0, canSeek: false, playing: false, title: '' };

export const NoSeek = Template.bind({});
NoSeek.args = { serverElapsed: 30, duration: 120, canSeek: false, playing: true, title: 'Track C' };
