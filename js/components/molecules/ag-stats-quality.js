/**
 * @module AgStatsQuality
 * @description The time listened by sound quality: one bar cut in its classes, best first
 * — DSD, Hi-Res, CD quality, lossy — and a legend that writes each class's time and share.
 *
 * The classes are ordered, so they are steps of one colour, the strongest for the best,
 * each segment parted from the next by a 2px gap. The legend names every class with its figures,
 * so the colour never has to be told apart on its own; the bar carries the whole as one
 * image for a screen reader.
 *
 * @element ag-stats-quality
 *
 * @prop {Array<{key: string, seconds: number}>} classes - As the summary sends them: the
 *   four classes always, in order, then `unknown` when there is some.
 *
 * @dependency css/components/library-stats.css - Classes .lib-stats-quality*
 */
import { LitElement, html, nothing } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';
import { fmtListened, fmtShare } from '../stats-format.js';

/** What each class is called, and what it holds. */
export const QUALITY_CLASSES = {
    dsd:     { label: 'DSD',        hint: '' },
    hires:   { label: 'Hi-Res',     hint: 'above 16 bit or 48 kHz' },
    cd:      { label: 'CD quality', hint: '16 bit, up to 48 kHz' },
    lossy:   { label: 'Lossy',      hint: 'MP3, AAC…' },
    unknown: { label: 'Unknown',    hint: 'format not shown' },
};

export class AgStatsQuality extends LitElement {
    static properties = {
        classes: { type: Array },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.classes = [];
    }

    render() {
        const classes = (this.classes || []).filter(c => QUALITY_CLASSES[c.key]);
        const total = classes.reduce((sum, c) => sum + (c.seconds || 0), 0);
        if (!total) return nothing;
        const shown = classes.filter(c => c.seconds > 0);
        const summary = shown
            .map(c => `${QUALITY_CLASSES[c.key].label} ${fmtShare(c.seconds, total)}`).join(', ');
        return html`
            <div class="lib-stats-quality">
                <div class="lib-stats-quality-bar" role="img" aria-label=${summary}>
                    ${shown.map(c => html`
                        <span class="lib-stats-quality-seg lib-stats-q--${c.key}"
                              style=${styleMap({ flexGrow: String(c.seconds) })}></span>
                    `)}
                </div>
                <ul class="lib-stats-quality-legend">
                    ${classes.map(c => html`
                        <li class="lib-stats-quality-row">
                            <span class="lib-stats-quality-swatch lib-stats-q--${c.key}" aria-hidden="true"></span>
                            <span class="lib-stats-quality-name">
                                <span class="lib-stats-quality-label">${QUALITY_CLASSES[c.key].label}</span>
                                ${QUALITY_CLASSES[c.key].hint
                                    ? html`<span class="lib-stats-hint">${QUALITY_CLASSES[c.key].hint}</span>`
                                    : nothing}
                            </span>
                            <span class="lib-stats-share-value">
                                ${fmtListened(c.seconds)}
                                <span class="lib-stats-share-pct">· ${fmtShare(c.seconds, total)}</span>
                            </span>
                        </li>
                    `)}
                </ul>
            </div>
        `;
    }
}

customElements.define('ag-stats-quality', AgStatsQuality);
