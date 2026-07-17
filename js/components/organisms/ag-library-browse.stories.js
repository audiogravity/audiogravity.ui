import './ag-library-browse.js';
import { injectLibStyles } from './ag-library-page.js';

/**
 * The organism fetches GET /api/library/albums on connect; in Storybook
 * (no backend) `_load` and the favorites lookup are stubbed out and the album
 * list is set directly, so the stories exercise the real grid: cover cards,
 * category pills, add-to-queue and — on streaming sources — the favorite star.
 */

export default {
    title: 'Organisms/LibraryBrowse',
    component: 'ag-library-browse',
    parameters: {
        docs: {
            description: {
                component:
                    'Album browse grid for the active source, with cover art, '
                    + 'category pills, add-to-queue and (streaming sources) a '
                    + 'favorite star per album.',
            },
        },
    },
};

/** Build one album with the GET /library/albums shape. */
const album = (id, title, artist, year) => ({
    id,
    title,
    artist,
    year,
    cover_token: `demo:${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
});

const ALBUMS = [
    album('al-1', 'Kind of Blue', 'Miles Davis', 1959),
    album('al-2', 'Time Out', 'The Dave Brubeck Quartet', 1959),
    album('al-3', 'A Love Supreme', 'John Coltrane', 1965),
    album('al-4', 'Getz/Gilberto', 'Stan Getz & João Gilberto', 1964),
    album('al-5', 'Moanin’', 'Art Blakey & The Jazz Messengers', 1959),
    album('al-6', 'Mingus Ah Um', 'Charles Mingus', 1959),
];

/**
 * Mount the browse grid with a fixed album list (no backend).
 * @param {string} sourceId - Active source (streaming ids show the ★).
 * @returns {HTMLElement} Wrapped, ready-to-render element.
 */
const mount = (sourceId) => {
    injectLibStyles();
    const el = document.createElement('ag-library-browse');
    el._load = async () => {};
    el.sourceId = sourceId;
    el._albums = ALBUMS;
    el._fav.load = async () => {};
    el._fav.ids = new Set(['al-2']);
    const wrap = document.createElement('div');
    wrap.style.cssText =
        'background: var(--bg-primary); color: var(--text-primary); '
        + 'max-width: 900px; min-height: 520px; padding: var(--spacing-md);';
    wrap.appendChild(el);
    return wrap;
};

/** Local library grid. */
export const LocalLibrary = { render: () => mount('src_mpd') };

/** Streaming source (Qobuz): category pills + favorite stars. */
export const Streaming = { render: () => mount('src_qobuz') };
