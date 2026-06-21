import './ag-hqplayer-output.js';

export default {
    title: 'Molecules/AgHqplayerOutput',
    tags: ['autodocs'],
};

/**
 * Default state — the component fetches its own data from /hqplayer/connection.
 * Requires a running backend with the hqplayer module enabled.
 *
 * When no HQPlayer is connected, the discovery panel offers two paths:
 * a local-subnet "Scan network" sweep, and a manual IP field for hosts on a
 * different (but routable) subnet that the scan cannot reach.
 */
const Template = () => {
    const el = document.createElement('ag-hqplayer-output');
    el.style.cssText = 'display:block;max-width:420px;padding:8px;';
    el.addEventListener('hqp-connected',    () => console.log('hqp-connected'));
    el.addEventListener('hqp-disconnected', () => console.log('hqp-disconnected'));
    return el;
};

export const Default = Template.bind({});
