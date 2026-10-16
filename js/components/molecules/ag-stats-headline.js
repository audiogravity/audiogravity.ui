/**
 * @module AgStatsHeadline
 * @description The period in one figure — the time listened — and three beside it: the
 * listens, the albums, the days with music.
 *
 * The time is the view's one headline figure; the three tiles qualify it.
 *
 * @element ag-stats-headline
 *
 * @prop {object} summary - The summary: `total_seconds`, `listens`, `albums`,
 *   `active_days`, `days`.
 * @prop {string} caption - What the figure covers, e.g. "in the last 30 days".
 *
 * @dependency css/components/library-stats.css - Classes .lib-stats-headline*, .lib-stats-tile*
 */
import { LitElement, html, nothing } from 'lit';
import { fmtListened } from '../stats-format.js';

export class AgStatsHeadline extends LitElement {
    static properties = {
        summary: { type: Object },
        caption: { type: String },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.summary = null;
        this.caption = '';
    }

    render() {
        const s = this.summary;
        if (!s) return nothing;
        const count = (n) => Number(n || 0).toLocaleString();
        return html`
            <div class="lib-stats-headline">
                <div class="lib-stats-hero">
                    <span class="lib-stats-hero-value">${fmtListened(s.total_seconds)}</span>
                    <span class="lib-stats-hero-caption">listened ${this.caption}</span>
                </div>
                <div class="lib-stats-tiles">
                    <div class="lib-stats-tile">
                        <span class="lib-stats-tile-value">${count(s.listens)}</span>
                        <span class="lib-stats-tile-label">${s.listens === 1 ? 'listen' : 'listens'}</span>
                    </div>
                    <div class="lib-stats-tile">
                        <span class="lib-stats-tile-value">${count(s.albums)}</span>
                        <span class="lib-stats-tile-label">${s.albums === 1 ? 'album' : 'albums'}</span>
                    </div>
                    <div class="lib-stats-tile">
                        <span class="lib-stats-tile-value">${count(s.active_days)} / ${count(s.days)}</span>
                        <span class="lib-stats-tile-label">days with music</span>
                    </div>
                </div>
            </div>
        `;
    }
}

customElements.define('ag-stats-headline', AgStatsHeadline);
