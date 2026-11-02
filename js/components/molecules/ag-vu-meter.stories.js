import './ag-vu-meter.js';

/**
 * The dials fed by hand (no box behind Storybook): a signal that swells and fades around
 * the level asked for, 25 values a second as the core sends them. The needles move as
 * they do in the app — critically damped, 99 % of the way in 300 ms.
 */
export default {
    title: 'Molecules/AgVuMeter',
    tags: ['autodocs'],
    argTypes: {
        variant: { control: 'select', options: ['theme', 'classic'] },
        layout: { control: 'select', options: ['stack', 'row', 'auto'] },
        level: { control: { type: 'range', min: -40, max: 0, step: 1 }, description: 'dBFS RMS, around which the signal moves' },
    },
};

/** Feed a meter a moving signal for as long as it is in the page. */
function feed(meter, level) {
    let t = 0;
    const timer = setInterval(() => {
        if (!meter.isConnected && t > 0) { clearInterval(timer); return; }
        t += 0.04;
        const swell = 4 * Math.sin(t * 2.1) + 2 * Math.sin(t * 5.3);
        meter.setLevels([level + swell, level - 2 + 0.8 * swell]);
    }, 40);
}

const Template = ({ variant, layout, level, status }) => {
    const meter = document.createElement('ag-vu-meter');
    meter.live = false;
    meter.variant = variant;
    meter.layout = layout;
    meter.style.maxWidth = layout === 'stack' ? '340px' : '900px';
    if (status) {
        meter.updateComplete.then(() => meter.setStatus(status));
    } else {
        feed(meter, level);
    }
    return meter;
};

/** In the full-screen player, in the cover's place: the theme's colours, left above right. */
export const InThePlayer = Template.bind({});
InThePlayer.args = { variant: 'theme', layout: 'stack', level: -12 };

/** The showcase's dials: a backlit cream face, side by side. */
export const Classic = Template.bind({});
Classic.args = { variant: 'classic', layout: 'row', level: -12 };

/** A quiet acoustic recording, near −38 dBFS: the needles barely leave their rest. */
export const QuietRecording = Template.bind({});
QuietRecording.args = { variant: 'classic', layout: 'row', level: -36 };

/** A box whose music player has no meter output: the dials say so. */
export const NotSetUp = Template.bind({});
NotSetUp.args = { variant: 'theme', layout: 'stack', status: { state: 'unavailable', reason: 'not_configured' } };
