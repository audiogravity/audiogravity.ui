import { html } from 'lit';
import './ag-playlist-details.js';

export default {
    title: 'Molecules/PlaylistDetails',
    component: 'ag-playlist-details',
    parameters: {
        docs: {
            description: {
                component:
                    'The dialog that names a playlist: a name and an optional description. '
                    + '"New playlist" from the first tile of the account\'s playlists — it '
                    + 'starts empty — and "Rename playlist" from a playlist\'s page, which '
                    + 'sends both fields back since the service replaces the two together. '
                    + 'The parent opens it (`show`) and closes it on `details-close` and '
                    + '`playlist-saved`.',
            },
        },
    },
};

/**
 * @param {object|null} playlist - null to create one.
 * @param {object} [state] - The dialog's own state, when a story needs one.
 */
const dialog = (playlist, state = {}) => html`
    <ag-playlist-details
        source-id="src_highresaudio"
        .playlist=${playlist}
        ?show=${true}
        ._busy=${state.busy ?? false}
        @playlist-saved=${(e) => console.log('playlist-saved', e.detail)}
        @details-close=${() => console.log('details-close')}>
    </ag-playlist-details>
`;

/** A new playlist, from the "New playlist" tile. */
export const NewPlaylist = { render: () => dialog(null) };

/** Renaming one of the account's playlists: both fields as it has them. */
export const Rename = {
    render: () => dialog({
        id: 'mine:5549',
        title: 'Audiogravity test',
        description: 'Playlist de test pour l’integration Audiogravity',
    }),
};

/** A write under way: nothing can be pressed until the service answers. */
export const Busy = { render: () => dialog(null, { busy: true }) };
