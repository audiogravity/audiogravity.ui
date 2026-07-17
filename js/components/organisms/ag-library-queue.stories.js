import './ag-library-queue.js';
import { injectLibStyles } from './ag-library-page.js';

/**
 * The organism normally fetches GET /api/library/queue on show; in Storybook
 * (no backend) `_load` is stubbed out and the queue state is set directly, so
 * the stories exercise the real render paths: current track, up-next rows,
 * per-source badges and the source filter bar (mixed queues only).
 */

export default {
    title: 'Organisms/LibraryQueue',
    component: 'ag-library-queue',
    parameters: {
        docs: {
            description: {
                component:
                    'Playback queue view: current track, up-next list with '
                    + 'swipe-to-remove, and — when the queue mixes providers — '
                    + 'per-row source badges plus a display-only source filter.',
            },
        },
    },
};

/** Build one queue item with the GET /library/queue shape. */
const item = (queueId, position, origin, title, artist, album, duration, extra = {}) => ({
    queue_id: queueId,
    position,
    is_current: false,
    origin,
    title,
    artist,
    album,
    duration,
    cover_token: `demo:${album ? album.toLowerCase().replace(/[^a-z0-9]+/g, '-') : origin}`,
    ...extra,
});

const MIXED_ITEMS = [
    item(101, 0, 'qobuz', 'So What', 'Miles Davis', 'Kind of Blue', 545, { is_current: true }),
    item(102, 1, 'qobuz', 'Freddie Freeloader', 'Miles Davis', 'Kind of Blue', 589),
    item(103, 2, 'qobuz', 'Blue in Green', 'Miles Davis', 'Kind of Blue', 327),
    item(104, 3, 'radio', 'FIP', 'Live stream', null, null),
    item(105, 4, 'library', 'Take Five', 'The Dave Brubeck Quartet', 'Time Out', 324),
    item(106, 5, 'library', 'Blue Rondo à la Turk', 'The Dave Brubeck Quartet', 'Time Out', 404),
];

const SINGLE_ITEMS = [
    item(201, 0, 'library', 'So What', 'Miles Davis', 'Kind of Blue', 545, { is_current: true }),
    item(202, 1, 'library', 'Freddie Freeloader', 'Miles Davis', 'Kind of Blue', 589),
    item(203, 2, 'library', 'Blue in Green', 'Miles Davis', 'Kind of Blue', 327),
];

/**
 * Mount the queue with a fixed state (no backend).
 * @param {Array<object>} items - Queue items (one flagged `is_current`).
 * @returns {HTMLElement} Wrapped, ready-to-render element.
 */
const mount = (items) => {
    injectLibStyles();
    const el = document.createElement('ag-library-queue');
    el.sourceId = 'src_mpd';
    el._load = async () => {};
    el._queue = { items };
    const wrap = document.createElement('div');
    wrap.style.cssText =
        'background: var(--bg-primary); color: var(--text-primary); '
        + 'max-width: 430px; min-height: 480px; padding: var(--spacing-md);';
    wrap.appendChild(el);
    return wrap;
};

/** Mixed providers: per-row source badges + the source filter bar. */
export const MixedSources = { render: () => mount(MIXED_ITEMS) };

/** Single provider: no badges, no filter — the header already names it. */
export const SingleSource = { render: () => mount(SINGLE_ITEMS) };
