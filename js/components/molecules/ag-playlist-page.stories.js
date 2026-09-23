import { html } from 'lit';
import './ag-playlist-page.js';

export default {
    title: 'Molecules/PlaylistPage',
    component: 'ag-playlist-page',
    parameters: {
        docs: {
            description: {
                component:
                    'The page of one streaming playlist, opened from the "open" button of a '
                    + 'playlist card or row and drawn in the grid\'s place. Play / Queue the '
                    + 'whole of it; a tap on a track plays it from there. On the account\'s '
                    + 'own playlist: rename, delete, and remove a track; on the service\'s '
                    + 'selections: add a track to one of the account\'s playlists. The stories '
                    + 'set its state directly and replace the read of the tracks: without a '
                    + 'core, it would fail.',
            },
        },
    },
};

const MINE = {
    id: 'mine:5549',
    title: 'Audiogravity test',
    artist: 'Playlist de test pour l’integration Audiogravity',
    cover_token: '',
};
const EDITORIAL = {
    id: 'editorial:791',
    title: 'Songs for Audiophiles',
    artist: 'Rock',
    cover_token: 'url:https://picsum.photos/seed/agplaylistbanner/410/205',
};
const TRACKS = [
    { id: 't1_a1', title: 'Stars (Live – Montreux Jazz Festival 1976)', artist: 'Nina Simone', album: 'The Montreux Years', duration: 397 },
    { id: 't2_a2', title: 'I’d Rather Go Blind (Live – Montreux 1977)', artist: 'Etta James', album: 'The Montreux Years', duration: 563 },
    { id: 't3_a3', title: 'Killing Me Softly with His Song (Live, 2005)', artist: 'Roberta Flack', album: 'The Montreux Years', duration: 365 },
    { id: 't4_a4', title: 'Pressure Down (Remastered)', artist: 'John Farnham', album: 'Whispering Jack', duration: 230 },
];

/**
 * @param {object} state - The page's inputs and own state, as it would hold them.
 */
const page = (state) => html`
    <div style="max-width:480px">
        <ag-playlist-page
            source-id="src_highresaudio"
            back-label=${state.backLabel ?? 'My playlists'}
            ?wide=${state.wide ?? false}
            ._load=${() => {}}
            .playlist=${state.playlist ?? MINE}
            ._tracks=${state.tracks === undefined ? TRACKS : state.tracks}
            ._error=${state.error ?? ''}
            ._renaming=${state.renaming ?? false}
            ._confirmingDelete=${state.confirmingDelete ?? false}>
        </ag-playlist-page>
    </div>
`;

/** One of the account's playlists: rename, delete, and a removal on every track. */
export const YourPlaylist = { render: () => page({}) };

/** One of the service's selections: its banner, and each track offered to your playlists. */
export const Editorial = {
    render: () => page({ playlist: EDITORIAL, wide: true, backLabel: 'Recommended' }),
};

/** A playlist just made: nothing to play yet, and where to fill it from. */
export const Empty = { render: () => page({ tracks: [] }) };

/** The tracks are being read. */
export const Loading = { render: () => page({ tracks: null }) };

/** The tracks could not be read: the reason, and a way to try again. */
export const Unreadable = {
    render: () => page({ tracks: null, error: 'Streaming service took too long to answer.' }),
};

/** Renaming: the name and the description, as the playlist has them. */
export const Rename = { render: () => page({ renaming: true }) };

/** Deleting: what goes, what stays, and a confirmation. */
export const Delete = { render: () => page({ confirmingDelete: true }) };
