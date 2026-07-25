import './ag-qobuz-output.js';

export default {
    title: 'Molecules/AgQobuzOutput',
    tags: ['autodocs'],
};

/**
 * Default state — the component fetches its own data from /qobuz/connection.
 * Requires a running backend with the qobuz module enabled.
 *
 * When not connected, shows a "Connect" button that starts the OAuth2 flow
 * (opens the Qobuz login page in a new tab). When connected, shows the
 * subscription level and a "Disconnect" button.
 */
const Template = () => {
    const el = document.createElement('ag-qobuz-output');
    el.style.cssText = 'display:block;max-width:420px;padding:8px;';
    el.addEventListener('sources-changed',    () => console.log('sources-changed'));
    el.addEventListener('sources-changed', () => console.log('sources-changed'));
    return el;
};

export const Default = Template.bind({});
