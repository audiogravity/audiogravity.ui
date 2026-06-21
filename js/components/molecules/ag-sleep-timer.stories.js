import './ag-sleep-timer.js';

export default {
    title: 'Molecules/AgSleepTimer',
    tags: ['autodocs'],
    argTypes: {
        playing:  { control: 'boolean' },
        sleepEnd: { control: 'number' },
    },
};

const Template = ({ playing, sleepEnd }) => {
    const el = document.createElement('ag-sleep-timer');
    el.playing  = playing;
    el.sleepEnd = sleepEnd ?? null;
    el.addEventListener('sleep-set',    (e) => console.log('sleep-set',    e.detail));
    el.addEventListener('sleep-cancel', ()  => console.log('sleep-cancel'));
    return el;
};

export const Idle = Template.bind({});
Idle.args = { playing: false, sleepEnd: null };

export const Playing = Template.bind({});
Playing.args = { playing: true, sleepEnd: null };

export const Counting = Template.bind({});
Counting.args = { playing: true, sleepEnd: Date.now() + 15 * 60 * 1000 };
