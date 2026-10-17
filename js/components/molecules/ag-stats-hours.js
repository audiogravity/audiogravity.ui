/**
 * @module AgStatsHours
 * @description When the box plays in the week: seven rows, Monday first, of 24 local
 * hours, each square as dark as the time listened in it — on average per week over the
 * period, as the summary sends it (`week_hours`).
 *
 * One measure, so one ramp: four steps of the text's colour, the darkest the busiest
 * hour — the steps of the sound-quality chart, validated in the six palettes — and the
 * hours of no music in a pale tint of the same colour, which is no step of it. Each square
 * is a button: a tap, or the keyboard's focus, puts its day, hour and time in the readout
 * above the grid, and its label says them to a screen reader, so no value hangs on a
 * colour or a hover.
 *
 * @element ag-stats-hours
 *
 * @prop {number[][]} week - Seven rows of 24 numbers: seconds listened on average per week.
 *
 * @dependency css/components/library-stats.css - Classes .lib-stats-hours*
 */
import { LitElement, html, nothing } from 'lit';
import { HEAT_LEVELS, fmtHour, fmtListened, heatLevel, weekdayNames } from '../stats-format.js';

/** The hours named under the grid. */
const HOUR_MARKS = [0, 6, 12, 18];

/** The days' names, in the browser's language: read once, not at every tap. */
const SHORT_DAYS = weekdayNames('short');
const LONG_DAYS = weekdayNames('long');

export class AgStatsHours extends LitElement {
    static properties = {
        week:    { type: Array },
        _picked: { state: true },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.week = [];
        /** The square the readout shows, as `{ day, hour }`; null for none. @type {?{day: number, hour: number}} */
        this._picked = null;
        /**
         * The grid as drawn, worked out once per week rather than at every tap: a tap only
         * moves the picked square. Seven rows of `{seconds, level, label}`.
         * @type {Array<Array<{seconds: number, level: number, label: string}>>}
         */
        this._cells = [];
        /** The busiest hour's time; 0 when the week holds no music. @type {number} */
        this._busiest = 0;
    }

    /**
     * Another period is another grid: it is worked out anew, and no square of the last one
     * stays picked.
     *
     * @param {Map<string, unknown>} changed - Lit's changed-properties map.
     * @returns {void}
     */
    willUpdate(changed) {
        if (!changed.has('week')) return;
        this._picked = null;
        const rows = this._rows();
        this._busiest = Math.max(0, ...rows.flat());
        this._cells = rows.map((hours, day) => hours.map((seconds, hour) => ({
            seconds,
            level: heatLevel(seconds, this._busiest),
            label: `${LONG_DAYS[day]} ${fmtHour(hour)}: ${seconds ? fmtListened(seconds) : 'nothing'} on average`,
        })));
    }

    /**
     * The grid's seven rows of 24 numbers, whatever came: a missing value reads as nothing.
     *
     * @returns {number[][]}
     */
    _rows() {
        const week = Array.isArray(this.week) ? this.week : [];
        return Array.from({ length: 7 }, (_, day) =>
            Array.from({ length: 24 }, (_, hour) => Math.max(0, Number(week[day]?.[hour]) || 0)));
    }

    /**
     * A square tapped or reached by the keyboard: one listener for the grid, the square
     * naming itself by its data attributes.
     *
     * @param {Event} e - `click` or `focusin` on the grid.
     * @returns {void}
     */
    _onPick(e) {
        const square = e.target?.closest?.('button[data-day]');
        if (square) this._picked = { day: Number(square.dataset.day), hour: Number(square.dataset.hour) };
    }

    render() {
        if (!this._busiest) return nothing;
        const picked = this._picked;
        const pickedSeconds = picked ? this._cells[picked.day][picked.hour].seconds : 0;
        return html`
            <div class="lib-stats-hours">
                <div class="lib-stats-bars-readout" aria-live="polite">
                    ${picked
                        ? html`<strong>${pickedSeconds ? fmtListened(pickedSeconds) : 'Nothing'}</strong>
                               <span>· ${SHORT_DAYS[picked.day]} ${fmtHour(picked.hour)}</span>`
                        : html`<span class="lib-stats-hint">Tap a square for its time</span>`}
                </div>
                <div class="lib-stats-hours-grid" @click=${this._onPick} @focusin=${this._onPick}>
                    ${this._cells.map((hours, day) => html`
                        <div class="lib-stats-hours-row">
                            <span class="lib-stats-hours-day" aria-hidden="true">${SHORT_DAYS[day]}</span>
                            ${hours.map((cell, hour) => html`
                                <button type="button" data-day=${day} data-hour=${hour}
                                        class="plain-btn lib-stats-hour lib-stats-heat--${cell.level}"
                                        aria-label=${cell.label}
                                        aria-pressed=${picked?.day === day && picked?.hour === hour ? 'true' : 'false'}></button>
                            `)}
                        </div>
                    `)}
                </div>
                <div class="lib-stats-hours-marks" aria-hidden="true">
                    ${HOUR_MARKS.map(hour => html`<span>${hour} h</span>`)}
                </div>
                <div class="lib-stats-hours-legend" aria-hidden="true">
                    <span>Less</span>
                    ${Array.from({ length: HEAT_LEVELS + 1 }, (_, level) =>
                        html`<span class="lib-stats-hours-swatch lib-stats-heat--${level}"></span>`)}
                    <span>More</span>
                    <span class="lib-stats-hours-note">average per week</span>
                </div>
            </div>
        `;
    }
}

customElements.define('ag-stats-hours', AgStatsHours);
