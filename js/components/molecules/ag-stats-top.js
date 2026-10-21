/**
 * @module AgStatsTop
 * @description The most listened artists, albums or tracks of the period, by time: a
 * selector for the three, and the ranked rows — each with its time and its plays.
 *
 * For "All" the core ranks the whole history; the shorter periods rank their own
 * listens. Broadcasts are not ranked: a station is no artist.
 *
 * Each row shows its cover — an artist, its most listened album's — or the note when the
 * core knows none (recorded before 0.9.77, or a source that gave none).
 *
 * @element ag-stats-top
 *
 * @prop {Array<{artist: string, seconds: number, plays: number, cover_token: ?string}>} artists
 * @prop {Array<{album: string, artist: ?string, seconds: number, plays: number, cover_token: ?string}>} albums
 * @prop {Array<{title: string, artist: ?string, album: ?string, seconds: number, plays: number, cover_token: ?string}>} tracks
 *
 * @dependency ag-filter-bar - The selector
 * @dependency ag-library-cover - Each row's cover, the note behind it
 * @dependency css/components/library-stats.css - Classes .lib-stats-list*, .lib-stats-thumb
 */
import { LitElement, html } from 'lit';
import { fmtListened } from '../stats-format.js';
import { coverUrl } from '../utils-lit.js';
import '../atoms/ag-filter-bar.js';
import '../atoms/ag-library-cover.js';

const KINDS = [
    { label: 'Artists', value: 'artists' },
    { label: 'Albums',  value: 'albums' },
    { label: 'Tracks',  value: 'tracks' },
];

/**
 * A ranked row's two lines, by kind.
 *
 * @param {string} kind - `artists` | `albums` | `tracks`.
 * @param {object} entry - One entry of the summary's ranking.
 * @returns {{title: string, sub: string}}
 */
export function topLines(kind, entry) {
    if (kind === 'artists') return { title: entry.artist, sub: 'Artist' };
    if (kind === 'albums') return { title: entry.album, sub: entry.artist || '' };
    return { title: entry.title, sub: [entry.artist, entry.album].filter(Boolean).join(' — ') };
}

/**
 * How many plays, in words.
 *
 * @param {number} plays - The count.
 * @returns {string} `1 play`, `12 plays`.
 */
export function fmtPlays(plays) {
    return `${plays} ${plays === 1 ? 'play' : 'plays'}`;
}

export class AgStatsTop extends LitElement {
    static properties = {
        artists: { type: Array },
        albums:  { type: Array },
        tracks:  { type: Array },
        _kind:   { state: true },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.artists = [];
        this.albums = [];
        this.tracks = [];
        /** The ranking shown. @type {'artists'|'albums'|'tracks'} */
        this._kind = 'artists';
    }

    render() {
        const entries = this[this._kind] || [];
        return html`
            <div class="lib-stats-top">
                <div class="lib-stats-selector">
                    <ag-filter-bar .options=${KINDS} value=${this._kind}
                        @filter-change=${e => { this._kind = e.detail.value; }}></ag-filter-bar>
                </div>
                ${entries.length ? html`
                    <ol class="lib-stats-list">
                        ${entries.map((entry, i) => {
                            const { title, sub } = topLines(this._kind, entry);
                            return html`
                                <li class="lib-stats-list-row">
                                    <span class="lib-stats-rank">${i + 1}</span>
                                    <ag-library-cover class="lib-stats-thumb" aria-hidden="true" size="44"
                                        fallback="note" cover=${coverUrl(entry.cover_token)}></ag-library-cover>
                                    <span class="lib-stats-list-text">
                                        <span class="lib-stats-list-title">${title}</span>
                                        <span class="lib-stats-list-sub">${sub}</span>
                                    </span>
                                    <span class="lib-stats-list-figures">
                                        <span class="lib-stats-list-time">${fmtListened(entry.seconds)}</span>
                                        <span class="lib-stats-list-count">${fmtPlays(entry.plays)}</span>
                                    </span>
                                </li>
                            `;
                        })}
                    </ol>
                ` : html`<p class="lib-stats-hint">Nothing to rank yet.</p>`}
            </div>
        `;
    }
}

customElements.define('ag-stats-top', AgStatsTop);
