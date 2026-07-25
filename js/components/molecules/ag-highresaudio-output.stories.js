import './ag-highresaudio-output.js';

export default {
    title: 'Molecules/AgHighresaudioOutput',
    tags: ['autodocs'],
};

/**
 * Default state — the component fetches its own data from /highresaudio/connection.
 * Requires a running backend with the highresaudio module enabled.
 *
 * When not connected, shows an email + password login form (HRA uses a plain
 * credential login, unlike Qobuz's OAuth popup). When connected, shows the
 * account email and a "Disconnect" button.
 */
const Template = () => {
    const el = document.createElement('ag-highresaudio-output');
    el.style.cssText = 'display:block;max-width:420px;padding:8px;';
    el.addEventListener('sources-changed',    () => console.log('sources-changed'));
    el.addEventListener('sources-changed', () => console.log('sources-changed'));
    return el;
};

export const Default = Template.bind({});
