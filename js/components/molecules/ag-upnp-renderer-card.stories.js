import './ag-upnp-renderer-card.js';

export default {
    title: 'Molecules/AgUpnpRendererCard',
    tags: ['autodocs'],
};

/**
 * Default state — the component loads from /upnp-renderer/connection and
 * listens for renderer-status-update events from the SSE stream.
 *
 * When no renderer is connected, shows a "Scan network" discovery panel.
 * When connected, shows playback status and controls (play/pause/stop/volume).
 *
 * Requires a running backend with the upnp_renderer module enabled.
 */
const Template = () => {
    const el = document.createElement('ag-upnp-renderer-card');
    el.style.cssText = 'display:block;max-width:420px;padding:8px;';
    el.addEventListener('renderer-connected',    () => console.log('renderer-connected'));
    el.addEventListener('renderer-disconnected', () => console.log('renderer-disconnected'));
    return el;
};

export const Default = Template.bind({});
