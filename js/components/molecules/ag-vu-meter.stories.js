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
        layout: { control: 'select', options: ['stack', 'row', 'auto'] },
        fit: { control: 'boolean', description: 'Fit the dials into the box the parent gives (stack or auto)' },
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

const Template = ({ layout, level, status, fit = false }) => {
    const meter = document.createElement('ag-vu-meter');
    meter.live = false;
    meter.layout = layout;
    meter.fit = fit;
    meter.style.maxWidth = layout === 'stack' ? '340px' : '900px';
    if (status) {
        meter.updateComplete.then(() => meter.setStatus(status));
    } else {
        feed(meter, level);
    }
    return meter;
};

/**
 * A meter fitted into a box of the given size, as its parent gives it one.
 * @param {object} args - The story's args, and the box's width and height.
 * @returns {HTMLElement} The box, the meter in it.
 */
function fitted({ width, height, ...args }) {
    const box = document.createElement('div');
    box.style.width = width;
    box.style.height = height;
    const meter = Template({ ...args, fit: true });
    meter.style.maxWidth = 'none';
    meter.style.height = '100%';
    box.append(meter);
    return box;
}

/** In the full-screen player, in the cover's square: left above right, fitted in it. */
export const InThePlayer = (args) => fitted({ ...args, width: '340px', height: '340px' });
InThePlayer.args = { layout: 'stack', level: -12 };

/**
 * The showcase on a phone on its side: the dials as large as the height left allows, side
 * by side in landscape — the box is lower than their width would make them.
 */
export const FittedToALowBox = (args) => fitted({ ...args, width: '700px', height: '160px' });
FittedToALowBox.args = { layout: 'auto', level: -12 };

/** The showcase's dials, side by side. */
export const SideBySide = Template.bind({});
SideBySide.args = { layout: 'row', level: -12 };

/** A quiet acoustic recording, near −38 dBFS: the needles barely leave their rest. */
export const QuietRecording = Template.bind({});
QuietRecording.args = { layout: 'row', level: -36 };

/** A box whose music player has no meter output: the dials say so. */
export const NotSetUp = Template.bind({});
NotSetUp.args = { layout: 'stack', status: { state: 'unavailable', reason: 'not_configured' } };
