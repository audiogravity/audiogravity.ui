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

/**
 * A connected account whose plan has ended. Qobuz signs it in, keeps the whole catalogue browsable, and still hands out playable
 * URLs — 30-second MP3 excerpts, whatever format AG asks for — so the line under the name says
 * what will be heard instead of what was requested. Rendered from a fixed state, so it
 * shows without such an account at hand.
 */
export const NoSubscription = () => {
    const el = document.createElement('ag-qobuz-output');
    el.style.cssText = 'display:block;max-width:420px;padding:8px;';
    el._loadConnection = async () => {
        el._connection = { connected: true, user_id: '000000', subscription: 'NO SUBSCRIPTION', has_subscription: false, format_id: 27 };
        el._loading = false;
    };
    return el;
};
