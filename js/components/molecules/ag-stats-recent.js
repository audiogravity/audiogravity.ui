/**
 * @module AgStatsRecent
 * @description The latest listens, newest first, whatever the period: what played, where
 * it came from and came out, when, and for how long.
 *
 * A station's listen is the station, with the time it was listened to — the songs it
 * announced are not kept.
 *
 * A listen still going (`in_progress`) — playing, paused, or its source gone a moment —
 * says IN PROGRESS where the others say when they started, above the time it has played
 * so far: the core counts it as if it ended when the summary was read. A station left
 * playing all evening is one listen that has not ended, and showed nowhere before.
 *
 * Each listen shows its cover — a station, its logo —, or the note (the radio for a
 * station) when the core knows none.
 *
 * @element ag-stats-recent
 *
 * @prop {Array<object>} listens - The summary's `recent`.
 *
 * @dependency ag-library-cover - Each listen's cover, the glyph behind it
 * @dependency css/components/library-stats.css - Classes .lib-stats-list*, .lib-stats-thumb
 */
import { LitElement, html, nothing } from 'lit';
import { fmtListened, fmtWhen } from '../stats-format.js';
import { coverUrl } from '../utils-lit.js';
import '../atoms/ag-library-cover.js';

/**
 * A listen's two lines.
 *
 * @param {object} listen - One entry of the summary's `recent`.
 * @returns {{title: string, sub: string}}
 */
export function recentLines(listen) {
    if (listen.live) return { title: listen.station || 'Live stream', sub: 'Live radio' };
    return {
        title: listen.title || 'Unknown track',
        sub: [listen.artist, listen.album].filter(Boolean).join(' — '),
    };
}

export class AgStatsRecent extends LitElement {
    static properties = {
        listens: { type: Array },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.listens = [];
    }

    render() {
        const listens = this.listens || [];
        if (!listens.length) return html`<p class="lib-stats-hint">Nothing played yet.</p>`;
        return html`
            <ul class="lib-stats-list">
                ${listens.map(listen => {
                    const { title, sub } = recentLines(listen);
                    const where = [listen.source, listen.output].filter(Boolean).join(' · ');
                    return html`
                        <li class="lib-stats-list-row lib-stats-list-row--recent">
                            <ag-library-cover class="lib-stats-thumb" aria-hidden="true" size="44"
                                fallback=${listen.live ? 'radio' : 'note'}
                                cover=${coverUrl(listen.cover_token)}></ag-library-cover>
                            <span class="lib-stats-list-text">
                                <span class="lib-stats-list-title">${title}</span>
                                ${sub ? html`<span class="lib-stats-list-sub">${sub}</span>` : nothing}
                                ${where ? html`<span class="lib-stats-where">${where}</span>` : nothing}
                            </span>
                            <span class="lib-stats-list-figures">
                                ${listen.in_progress
                                    ? html`<span class="badge success lib-stats-in-progress">IN PROGRESS</span>`
                                    : html`<span class="lib-stats-list-time">${fmtWhen(listen.started_at)}</span>`}
                                <span class="lib-stats-list-count">${fmtListened(listen.seconds)}</span>
                            </span>
                        </li>
                    `;
                })}
            </ul>
        `;
    }
}

customElements.define('ag-stats-recent', AgStatsRecent);
