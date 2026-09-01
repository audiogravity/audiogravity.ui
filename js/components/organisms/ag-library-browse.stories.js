import { expect } from 'storybook/test';
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

/** The shelves the core lists on /library/qobuz-shelves, in its order. */
const QOBUZ_SHELVES = [
    { title: 'new-releases', label: 'New Releases' },
    { title: 'new-releases-full', label: 'All New Releases' },
    { title: 'editor-picks', label: 'Selection' },
    { title: 'qobuzissims', label: 'Qobuzissims' },
    { title: 'press-awards', label: 'Press Awards' },
    { title: 'best-sellers', label: 'Best Sellers' },
    { title: 'most-streamed', label: 'Most Streamed' },
    { title: 'ideal-discography', label: 'Ideal Discography' },
    { title: 'harmonia-mundi', label: 'Harmonia Mundi' },
];

/**
 * The Qobuz genre tree. Paths are OPAQUE numeric ids, not readable title paths:
 * four of the thirteen genres carry a `/` in their own name, so a `Genre/Sub-genre`
 * key could not be read back at the separator.
 */
const QOBUZ_GENRES = [
    { title: 'Blues/Country/Folk', path: '2', subgenres: [
        { title: 'Blues', path: '3' }, { title: 'Country', path: '4' },
        { title: 'Folk', path: '5' },
    ] },
    { title: 'Hip-Hop/Rap', path: '133', subgenres: [] },
    { title: 'Jazz', path: '80', subgenres: [
        { title: 'Be Bop', path: '81' }, { title: 'Cool jazz', path: '82' },
        { title: 'Free jazz & Avant-garde', path: '85' },
    ] },
    { title: 'Pop/Rock', path: '112', subgenres: [
        { title: 'Pop', path: '117' }, { title: 'Rock', path: '118' },
        { title: 'Variété internationale', path: '119' },
    ] },
];

/**
 * Mount the browse grid with a fixed album list (no backend).
 * @param {string} sourceId - Active source (streaming ids show the ★).
 * @param {object} [state] - Extra state to set before the first render, so a story
 *   can stand on a shelf that would otherwise need a fetch to reach.
 * @returns {HTMLElement} Wrapped, ready-to-render element.
 */
const mount = (sourceId, state = {}) => {
    injectLibStyles();
    const el = document.createElement('ag-library-browse');
    el._load = async () => {};
    el.sourceId = sourceId;
    el._albums = ALBUMS;
    el._fav.load = async () => {};
    el._fav.ids = new Set(['al-2']);
    // AFTER the first update, never before it. A property assigned to a Lit element
    // that is not connected yet still lands in the first render's changedProperties,
    // so `updated()` sees `sourceId` as changed and runs its source-switch reset —
    // which clears exactly the five fields a story sets. Assigned up front, all five
    // Qobuz stories rendered the Favorites grid while claiming to show a shelf.
    // `_albums` is spared by that reset and can stay above; only `_load()` clears it,
    // and it is stubbed out here.
    if (Object.keys(state).length) {
        el.updateComplete.then(() => Object.assign(el, state));
    }
    const wrap = document.createElement('div');
    wrap.style.cssText =
        'background: var(--bg-primary); color: var(--text-primary); '
        + 'max-width: 900px; min-height: 520px; padding: var(--spacing-md);';
    wrap.appendChild(el);
    return wrap;
};

/**
 * Assert a story really stands where it says it does.
 *
 * These five set state on a mounted component, and the component resets that very
 * state on its first render — so a story could claim a shelf and quietly render the
 * Favorites grid, which is exactly what happened. A screenshot would not have said so
 * and neither would a smoke render; this runs in the test suite with the story.
 *
 * @param {(el: HTMLElement) => void} assert - Reads the mounted component.
 * @returns {(ctx: {canvasElement: HTMLElement}) => Promise<void>} a Storybook play fn.
 */
const standsOn = (assert) => async ({ canvasElement }) => {
    const el = canvasElement.querySelector('ag-library-browse');
    await el.updateComplete;
    await el.updateComplete;   // the state lands in the update after the first
    assert(el);
};

/** Local library grid. */
export const LocalLibrary = { render: () => mount('src_mpd') };

/** Streaming source (Qobuz): the five shelves, and favorite stars on the grid. */
export const Streaming = { render: () => mount('src_qobuz') };

/** Qobuz Shelves: the nine catalogue shelves on the strip below the pill. */
export const QobuzShelves = {
    render: () => mount('src_qobuz', {
        _filter: 'shelves', _qobuzShelves: QOBUZ_SHELVES, _category: 'editor-picks',
    }),
    play: standsOn((el) => {
        expect(el._filter).toBe('shelves');
        expect(el._qobuzShelves).toHaveLength(9);
        expect(el._sectionLabel).toBe('Selection');
    }),
};

/** Qobuz Genres, list level: the thirteen genres, none chosen yet. */
export const QobuzGenres = {
    render: () => mount('src_qobuz', {
        _filter: 'genres', _genres: QOBUZ_GENRES, _genre: null,
    }),
    play: standsOn((el) => {
        expect(el._filter).toBe('genres');
        expect(el._genrePills.map(([, label]) => label)).toContain('Jazz');
    }),
};

/**
 * Qobuz Genres, drilled in: the whole genre as "All", then its sub-genres, and the
 * heading naming both. The genre chosen here carries a `/` in its own name — the
 * case that proves the strip reads the path as a key and never splits it.
 */
export const QobuzSubGenres = {
    render: () => mount('src_qobuz', {
        _filter: 'genres', _genres: QOBUZ_GENRES, _genre: '118',
    }),
    play: standsOn((el) => {
        // The heading proves the path was matched against the tree and not split on
        // its separator: the genre chosen here carries a '/' in its own name.
        expect(el._sectionLabel).toBe('Pop/Rock · Rock');
    }),
};

/** Qobuz Playlists: the two trees Qobuz has — the selections, and the account's own. */
export const QobuzPlaylists = {
    render: () => mount('src_qobuz', { _filter: 'playlists', _playlistKind: 'mine' }),
    play: standsOn((el) => {
        expect(el._playlistKind).toBe('mine');
        expect(el._sectionLabel).toBe('My playlists');
    }),
};

/** Qobuz Purchases: the albums the account bought, an ordinary album grid. */
export const QobuzPurchases = {
    render: () => mount('src_qobuz', { _filter: 'purchases' }),
    play: standsOn((el) => {
        expect(el._filter).toBe('purchases');
        expect(el._showsPlaylists).toBe(false);
    }),
};
