import './ag-tidal-output.js';

export default {
    title: 'Molecules/AgTidalOutput',
    tags: ['autodocs'],
};

const Template = () => {
    const el = document.createElement('ag-tidal-output');
    el.style.cssText = 'display:block;max-width:420px;padding:8px;';
    el.addEventListener('sources-changed',    () => console.log('sources-changed'));
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
    const el = document.createElement('ag-tidal-output');
    el.style.cssText = 'display:block;max-width:420px;padding:8px;';
    el._loadConnection = async () => {
        el._connection = { connected: true, quality: 'HI_RES_LOSSLESS', country_code: 'FR', subscription: 'NO SUBSCRIPTION', has_subscription: false };
        el._loading = false;
    };
    return el;
};
