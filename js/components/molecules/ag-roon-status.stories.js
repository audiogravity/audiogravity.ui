import './ag-roon-status.js';

export default {
    title: 'Molecules/AgRoonStatus',
    tags: ['autodocs'],
    parameters: {
        docs: {
            description: {
                component:
                    'Says where the Roon setup stands, inside an expanded Roon source card. ' +
                    'The last step of connecting a box to Roon happens inside Roon itself — ' +
                    'enabling the extension — and the box cannot see the owner do it. Each ' +
                    'state names the situation and, when the next move is theirs, what it is.',
            },
        },
    },
};

/**
 * The component fetches its own state, so the stories install a fixed answer
 * rather than reaching for a box that is not there.
 *
 * @param {object} status - The payload /library/roon-status would return.
 * @returns {HTMLElement} The element, pre-loaded with that state.
 */
const Template = (status) => {
    const el = document.createElement('ag-roon-status');
    el.refresh = async () => { el._status = status; el._loading = false; };
    el.style.cssText = 'display:block;max-width:420px;border:1px solid #8883;border-radius:8px;';
    return el;
};

export const NoRoonOnTheBox = () =>
    Template({ state: 'no_endpoint', zones: 0, extension_name: 'Audiogravity' });

export const NoCoreAnswering = () =>
    Template({ state: 'core_not_found', zones: 0, extension_name: 'Audiogravity' });

export const WaitingForAuthorization = () =>
    Template({ state: 'waiting_authorization', zones: 0, extension_name: 'Audiogravity' });

export const Connected = () =>
    Template({ state: 'connected', zones: 2, extension_name: 'Audiogravity' });

export const OneZone = () =>
    Template({ state: 'connected', zones: 1, extension_name: 'Audiogravity' });

export const NothingKnownYet = () =>
    Template({ state: 'unknown', zones: 0, extension_name: 'Audiogravity' });
