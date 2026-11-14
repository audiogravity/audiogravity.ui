import './ag-tidal-connection.js';

export default {
    title: 'Molecules/AgTidalConnection',
    tags: ['autodocs'],
};

const Template = () => {
    const el = document.createElement('ag-tidal-connection');
    el.style.cssText = 'display:block;max-width:420px;padding:8px;';
    el.addEventListener('sources-changed', () => console.log('sources-changed'));
    return el;
};

export const Default = Template.bind({});

/**
 * A connected account whose plan has ended. Tidal keeps signing it in and keeps streaming — 30-second excerpts, whatever
 * quality AG asks for — so the line under the name says
 * what will be heard instead of what was requested. Rendered from a fixed state, so it
 * shows without such an account at hand.
 */
export const NoSubscription = () => {
    const el = document.createElement('ag-tidal-connection');
    el.style.cssText = 'display:block;max-width:420px;padding:8px;';
    el._loadConnection = async () => {
        el._connection = { connected: true, quality: 'HI_RES_LOSSLESS', country_code: 'FR', subscription: 'NO SUBSCRIPTION', has_subscription: false };
        el._loading = false;
    };
    return el;
};

/**
 * A card waiting for Tidal's return address, rendered from a fixed state.
 *
 * Its clipboard reading is switched off: in a story, coming back to the window would
 * otherwise ask for clipboard access, and send what it found to a core that is not
 * there.
 * @param {object} state - Fields to set on top of the waiting state.
 * @returns {HTMLElement}
 */
const waiting = (state = {}) => {
    const el = document.createElement('ag-tidal-connection');
    el.style.cssText = 'display:block;max-width:420px;padding:8px;';
    el._onReturn = () => {};
    el._loadConnection = async () => {
        Object.assign(el, { _connection: { connected: false }, _loading: false, _awaiting: true }, state);
    };
    return el;
};

/**
 * The step after Connect: Tidal's sign-in page is open in another tab and the card
 * waits for the address of the page Tidal leaves the user on. There is no button to
 * finish — pasting that address completes the login. **Reopen Tidal page** starts
 * over, for a closed tab or a refusal. Without a core behind Storybook, a paste here
 * ends on the refusal message.
 */
export const WaitingForPaste = () => waiting();

/**
 * The same step in a browser that reads the clipboard once allowed (Chromium, over
 * https): coming back to the app is enough, and the hint warns of the browser's
 * prompt so that it is expected.
 */
export const WaitingWithClipboard = () => waiting({ _clipboardAuto: true });

/**
 * The address is being sent: Reopen Tidal page is unavailable meanwhile, since a new
 * sign-in would replace the one this address completes.
 */
export const Connecting = () => waiting({
    _submitting: true,
    _redirect: 'https://tidal.com/android/login/auth?code=eyJ…',
});

/**
 * The browser refused to open Tidal's page — a popup blocker: the card offers the
 * page as a link, which a tap opens.
 */
export const TidalPageBlocked = () => waiting({ _blockedUrl: 'https://login.tidal.com/authorize' });
