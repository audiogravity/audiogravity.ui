import './ag-library-scan-indicator.js';
import { html } from 'lit';

/**
 * Transient "Indexing library…" indicator. In the app a host calls `start()`
 * after a library change and the molecule polls MPD's scan status; here the
 * internal `_state` is set directly so the two visible states can be inspected
 * without a backend.
 */
export default {
    title: 'Molecules/LibraryScanIndicator',
    component: 'ag-library-scan-indicator',
    parameters: {
        docs: {
            description: {
                component:
                    'Shown after Apply / INITIALIZE while MPD reindexes its database. '
                    + 'Spins on "Indexing library…", flashes "Library indexed" on '
                    + 'completion, then hides. Renders nothing when idle.',
            },
        },
    },
};

/** Force a given internal state on the element after it mounts. */
const withState = (state) => {
    const el = document.createElement('ag-library-scan-indicator');
    // eslint-disable-next-line no-underscore-dangle
    el._state = state;
    return el;
};

export const Indexing = () => withState('indexing');
export const Done = () => withState('done');
export const Idle = () => html`
    <p style="color:var(--text-tertiary)">Idle — the element renders nothing.</p>
    ${withState('idle')}`;
