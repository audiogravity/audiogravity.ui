import './ag-library-outputs.js';
import { injectLibStyles } from './ag-library-page.js';

/**
 * The organism fetches GET /api/steering/outputs on connect; in Storybook
 * (no backend) `_load` is stubbed out and the output list is set directly.
 */

export default {
    title: 'Organisms/LibraryOutputs',
    component: 'ag-library-outputs',
    parameters: {
        docs: {
            description: {
                component:
                    'Output selector: every physical output the box exposes '
                    + '(USB, optical, HDMI…), with the active one highlighted. '
                    + 'Picking a card switches the audio output.',
            },
        },
    },
};

const OUTPUTS = [
    {
        id: 'usb',
        label: 'USB DAC',
        connector: 'usb-a',
        alsa_card_name: 'Abacus',
        target_device_id: 'dac_01',
        active: true,
    },
    {
        id: 'optical',
        label: 'Optical out',
        connector: 'toslink',
        alsa_card_name: 'PCH',
        target_device_id: 'amp_01',
        active: false,
    },
    {
        id: 'hdmi',
        label: 'HDMI audio',
        connector: 'hdmi',
        alsa_card_name: 'HDA Intel',
        active: false,
    },
];

/**
 * Mount the output selector with a fixed list (no backend).
 * @param {Array<object>} outputs - /steering/outputs-shaped entries.
 * @param {boolean} [locked=false] - The source is a Pro one on a Starter box.
 * @returns {HTMLElement} Wrapped, ready-to-render element.
 */
const mount = (outputs, locked = false) => {
    injectLibStyles();
    const el = document.createElement('ag-library-outputs');
    el.sourceId = locked ? 'src_mono-sgen' : 'src_mpd';
    el.locked = locked;
    el._load = async () => {};
    el._outputs = outputs;
    const wrap = document.createElement('div');
    wrap.style.cssText =
        'background: var(--bg-primary); color: var(--text-primary); '
        + 'max-width: 430px; padding: var(--spacing-md);';
    wrap.appendChild(el);
    return wrap;
};

/** USB active, optical and HDMI ready. */
export const Default = { render: () => mount(OUTPUTS) };

/** No outputs detected — empty state. */
export const Empty = { render: () => mount([]) };

/** Roon playing on a Starter box: its zones are Pro, so the padlock stands where READY
 *  stood, and a tap leads to the licence panel. */
export const LockedOnStarter = { render: () => mount(OUTPUTS, true) };
