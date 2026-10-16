/**
 * @module AgStatsBars
 * @description The time listened, one bar per day or per month, oldest first: the chart
 * of the listening history's view.
 *
 * One series, so one colour and no legend — the section's heading says what is plotted.
 * Each bar is a button: a tap, or the keyboard's focus, puts its day and its time in the
 * readout above the chart, and its label says both to a screen reader, so no value hangs
 * on a hover. The scale is rounded to whole minutes or hours (niceCeiling) and drawn with
 * two hairlines.
 *
 * @element ag-stats-bars
 *
 * @prop {Array<{start: string, seconds: number}>} buckets - The bars, as the summary sends them.
 * @prop {'day'|'month'} unit - What a bar is.
 *
 * @dependency css/components/library-stats.css - Classes .lib-stats-bars*
 */
import { LitElement, html, nothing } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';
import { bucketLabels, fmtBucket, fmtListened, niceCeiling } from '../stats-format.js';

export class AgStatsBars extends LitElement {
    static properties = {
        buckets: { type: Array },
        unit:    { type: String },
        _picked: { state: true },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.buckets = [];
        this.unit = 'day';
        /** Index of the bar whose time the readout shows; -1 for none. @type {number} */
        this._picked = -1;
    }

    /**
     * A new period is another chart: no bar of the last one stays picked.
     *
     * @param {Map<string, unknown>} changed - Lit's changed-properties map.
     * @returns {void}
     */
    willUpdate(changed) {
        if (changed.has('buckets') || changed.has('unit')) this._picked = -1;
    }

    render() {
        const buckets = this.buckets || [];
        if (!buckets.length) return nothing;
        const top = niceCeiling(Math.max(...buckets.map(b => b.seconds || 0)));
        const labels = bucketLabels(buckets, this.unit);
        const picked = buckets[this._picked];
        return html`
            <div class="lib-stats-bars">
                <div class="lib-stats-bars-readout" aria-live="polite">
                    ${picked
                        ? html`<strong>${fmtListened(picked.seconds)}</strong>
                               <span>· ${fmtBucket(picked.start, this.unit)}</span>`
                        : html`<span class="lib-stats-hint">Tap a bar for its time</span>`}
                </div>
                <div class="lib-stats-bars-plot">
                    <div class="lib-stats-bars-scale" aria-hidden="true">
                        <span class="lib-stats-bars-tick lib-stats-bars-tick--top">${fmtListened(top)}</span>
                        <span class="lib-stats-bars-tick lib-stats-bars-tick--mid">${fmtListened(top / 2)}</span>
                        <span class="lib-stats-bars-tick lib-stats-bars-tick--zero">0</span>
                    </div>
                    <div class="lib-stats-bars-area">
                        <span class="lib-stats-bars-grid lib-stats-bars-grid--top" aria-hidden="true"></span>
                        <span class="lib-stats-bars-grid lib-stats-bars-grid--mid" aria-hidden="true"></span>
                        <span class="lib-stats-bars-grid lib-stats-bars-grid--zero" aria-hidden="true"></span>
                        <div class="lib-stats-bars-row">
                            ${buckets.map((b, i) => html`
                                <button type="button" class="plain-btn lib-stats-bar-hit"
                                        aria-label="${fmtBucket(b.start, this.unit)}: ${fmtListened(b.seconds)}"
                                        aria-pressed=${i === this._picked ? 'true' : 'false'}
                                        @click=${() => { this._picked = i; }}
                                        @focus=${() => { this._picked = i; }}>
                                    <span class="lib-stats-bar ${this._picked >= 0 && i !== this._picked ? 'lib-stats-bar--dim' : ''}"
                                          style=${styleMap({ height: `${((b.seconds || 0) / top) * 100}%` })}></span>
                                </button>
                            `)}
                        </div>
                    </div>
                </div>
                <div class="lib-stats-bars-labels ${buckets.length > 12 ? 'lib-stats-bars-labels--sparse' : ''}"
                     aria-hidden="true">
                    ${labels.map(label => html`<span>${label}</span>`)}
                </div>
            </div>
        `;
    }
}

customElements.define('ag-stats-bars', AgStatsBars);
