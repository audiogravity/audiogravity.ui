import { html } from 'lit';
import './ag-playlist-picker.js';

export default {
    title: 'Molecules/PlaylistPicker',
    component: 'ag-playlist-picker',
    parameters: {
        docs: {
            description: {
                component:
                    'The "Add to playlist" dialog. Opened by requestPlaylistAdd() from the '
                    + 'full-screen player (the track playing now) and from album cards and '
                    + 'rows. Lists the account playlists of the item\'s streaming source, '
                    + 'adds the item to the one picked, or creates a playlist and adds it '
                    + 'there. The stories set its state directly: without a core, the list '
                    + 'it reads on opening would fail.',
            },
        },
    },
};

const TRACK = {
    sourceId: 'src_highresaudio', itemType: 'track', itemId: 't1_a1',
    title: 'Tukuman', subtitle: 'Enzo Favata · Ritornare', coverToken: '',
};
const ALBUM = {
    sourceId: 'src_highresaudio', itemType: 'album', itemId: 'a1',
    title: 'Ritornare', subtitle: 'Enzo Favata', coverToken: '',
};
const PLAYLISTS = [
    { id: 'mine:5549', title: 'Audiogravity test', artist: 'Playlist de test pour l’integration Audiogravity' },
    { id: 'mine:5650', title: 'Late evening', artist: 'Quiet records for the end of the day' },
    { id: 'mine:5651', title: 'ECM favourites', artist: '' },
];

/**
 * @param {object} state - The dialog's own state, set as the picker would after opening.
 */
const picker = (state) => html`
    <ag-playlist-picker
        ._item=${state.item}
        ._open=${true}
        ._playlists=${state.playlists ?? null}
        ._loadError=${state.loadError ?? ''}
        ._mode=${state.mode ?? 'list'}
        ._name=${state.name ?? ''}
        ._busy=${state.busy ?? false}>
    </ag-playlist-picker>
`;

/** The track playing now, and the account's playlists. */
export const Track = { render: () => picker({ item: TRACK, playlists: PLAYLISTS }) };

/** An album from a card or a row: the same list, the album as the subject. */
export const Album = { render: () => picker({ item: ALBUM, playlists: PLAYLISTS }) };

/** The list is being read. */
export const Loading = { render: () => picker({ item: TRACK }) };

/** An account without a playlist yet: "New playlist" is the way in. */
export const Empty = { render: () => picker({ item: TRACK, playlists: [] }) };

/** The list could not be read: the reason, and a way to try again. */
export const Unreadable = {
    render: () => picker({
        item: TRACK, playlists: [],
        loadError: 'HIGHRESAUDIO took too long to answer. It is not the box: the service is slow to reply.',
    }),
};

/** Naming a new playlist. */
export const NewPlaylist = {
    render: () => picker({ item: TRACK, playlists: PLAYLISTS, mode: 'create', name: 'Late evening' }),
};

/** A write under way: nothing else can be pressed until the service answers. */
export const Busy = { render: () => picker({ item: TRACK, playlists: PLAYLISTS, busy: true }) };
