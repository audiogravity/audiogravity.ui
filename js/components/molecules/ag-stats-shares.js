/**
 * @module AgStatsShares
 * @description Where the time went: one row per source, output or genre — its name, a bar
 * as long as its time against the largest, and its time and share of the period.
 *
 * One series: every bar in the accent, but what names nothing — Unknown, Other — in a
 * receding grey, so that the real names lead. The values are written out on every row
 * (a handful of rows, each read on its own), so nothing hangs on the bars' lengths.
 *
 * @element ag-stats-shares
 *
 * @prop {Array<{label: (string|null), seconds: number, muted?: boolean}>} rows - The rows,
 *   largest first. A row without a label reads `Unknown`, greyed.
 * @prop {number} total - The period's whole time: what a share is of.
 *
 * @dependency css/components/library-stats.css - Classes .lib-stats-share*
 */
import { LitElement, html, nothing } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';
import { fmtListened, fmtShare } from '../stats-format.js';

export class AgStatsShares extends LitElement {
    static properties = {
        rows:  { type: Array },
        total: { type: Number },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.rows = [];
        this.total = 0;
    }

    render() {
        const rows = this.rows || [];
        if (!rows.length) return nothing;
        const largest = Math.max(...rows.map(r => r.seconds || 0)) || 1;
        return html`
            <ul class="lib-stats-shares">
                ${rows.map(row => {
                    const muted = row.muted || !row.label;
                    return html`
                        <li class="lib-stats-share ${muted ? 'lib-stats-share--muted' : ''}">
                            <span class="lib-stats-share-label">${row.label || 'Unknown'}</span>
                            <span class="lib-stats-share-track" aria-hidden="true">
                                <span class="lib-stats-share-bar"
                                      style=${styleMap({ width: `${((row.seconds || 0) / largest) * 100}%` })}></span>
                            </span>
                            <span class="lib-stats-share-value">
                                ${fmtListened(row.seconds)}
                                <span class="lib-stats-share-pct">· ${fmtShare(row.seconds, this.total)}</span>
                            </span>
                        </li>
                    `;
                })}
            </ul>
        `;
    }
}

customElements.define('ag-stats-shares', AgStatsShares);
