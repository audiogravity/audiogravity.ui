/**
 * @module AgStatsRecent
 * @description The latest listens, newest first, whatever the period: what played, where
 * it came from and came out, when, and for how long.
 *
 * A station's listen is the station, with the time it was listened to — the songs it
 * announced are not kept.
 *
 * @element ag-stats-recent
 *
 * @prop {Array<object>} listens - The summary's `recent`.
 *
 * @dependency css/components/library-stats.css - Classes .lib-stats-list*
 */
import { LitElement, html, nothing } from 'lit';
import { fmtListened, fmtWhen } from '../stats-format.js';
import { iconMusicNote, iconRadio } from '../../ag-icons.js';
import { svgIcon } from '../utils-lit.js';

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
                            <span class="lib-stats-thumb" aria-hidden="true">
                                ${svgIcon(listen.live ? iconRadio : iconMusicNote, { size: '18px' })}
                            </span>
                            <span class="lib-stats-list-text">
                                <span class="lib-stats-list-title">${title}</span>
                                ${sub ? html`<span class="lib-stats-list-sub">${sub}</span>` : nothing}
                                ${where ? html`<span class="lib-stats-where">${where}</span>` : nothing}
                            </span>
                            <span class="lib-stats-list-figures">
                                <span class="lib-stats-list-time">${fmtWhen(listen.started_at)}</span>
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
