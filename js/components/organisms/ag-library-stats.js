/**
 * @module AgLibraryStats
 * @description The listening history: what this box played over a period — its time,
 * days, the hours of the week it fills, sources, outputs, sound quality and genres, the
 * most played and the latest listens — and the switch that keeps it.
 *
 * The box records on every edition; this view's figures are Pro. On a Starter box it
 * shows what Pro adds, under the padlock, and the recording's switch and erase all the
 * same (ag-stats-recording): a box that records must let its owner stop it. Roon and
 * HQPlayer are not counted yet, and the view says so.
 *
 * The summary is read when the view is shown and when the period changes — never in the
 * background. While another period loads, the last one stays, faded, rather than leaving
 * an empty page.
 *
 * While the recording is off, a line at the top says so, and leads to the switch: at the
 * bottom of the view, under the rankings, it went unseen, and Stats looked as if the box
 * had stopped counting (user report, 2026-10-16).
 *
 * @element ag-library-stats
 *
 * @attr {boolean} visible - Whether the view is the one shown; it reads the core only then.
 *
 * @dependency js/core/LicenseController.js - Keeps `_license` in step with the box's licence
 * @dependency js/listening-api.js - /listening/summary
 * @dependency ag-stats-headline, ag-stats-bars, ag-stats-hours, ag-stats-shares,
 *   ag-stats-quality, ag-stats-top, ag-stats-recent, ag-stats-recording, ag-pro-lock-card,
 *   ag-filter-bar
 * @dependency css/components/library-stats.css
 */
import { LitElement, html, nothing } from 'lit';
import { LISTENING_PERIODS, listeningSummary } from '../../listening-api.js';
import { proState } from '../../license-tiers.js';
import { LicenseController } from '../../core/LicenseController.js';
import { fmtIsoDate, svgIcon } from '../utils-lit.js';
import { iconBarChart } from '../../ag-icons.js';
import '../atoms/ag-filter-bar.js';
import '../molecules/ag-pro-lock-card.js';
import '../molecules/ag-stats-bars.js';
import '../molecules/ag-stats-headline.js';
import '../molecules/ag-stats-hours.js';
import '../molecules/ag-stats-quality.js';
import '../molecules/ag-stats-recent.js';
import '../molecules/ag-stats-recording.js';
import '../molecules/ag-stats-shares.js';
import '../molecules/ag-stats-top.js';

/** What the headline's figure covers, by period. */
const CAPTIONS = {
    '7d': 'in the last 7 days',
    '30d': 'in the last 30 days',
    '12m': 'in the last 12 months',
};

/**
 * The genres as the share rows draw them: the others and the unknown named and greyed.
 *
 * @param {Array<{label: ?string, seconds: number, kind: string}>} genres - The summary's genres.
 * @returns {Array<{label: string, seconds: number, muted: boolean}>}
 */
export function genreRows(genres) {
    return (genres || []).map(g => ({
        label: g.kind === 'other' ? 'Other' : g.kind === 'unknown' ? 'Unknown' : g.label,
        seconds: g.seconds,
        muted: g.kind !== 'genre',
    }));
}

/**
 * Whether the week's hours hold any music: a week of nothing is no section under its heading.
 *
 * @param {number[][]|undefined} week - The summary's `week_hours`; absent from an older core.
 * @returns {boolean}
 */
export function hasWeek(week) {
    return Array.isArray(week) && week.some(row => Array.isArray(row) && row.some(v => Number(v) > 0));
}

export class AgLibraryStats extends LitElement {
    static properties = {
        visible:   { type: Boolean },
        _period:   { state: true },
        _summary:  { state: true },
        _loading:  { state: true },
        _error:    { state: true },
        _license:  { state: true },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.visible = false;
        /** @type {'7d'|'30d'|'12m'|'all'} */
        this._period = '30d';
        /** The summary shown, null until read. @type {object|null} */
        this._summary = null;
        this._loading = false;
        this._error = null;
        /** Keeps `_license`; a licence that opens Pro while the view is shown reads it. */
        this._licenseCtl = new LicenseController(this, () => this._loadIfShown());
        /** The read in flight, so that an older answer never replaces a newer one. */
        this._request = 0;
    }

    updated(changed) {
        if (changed.has('visible') && this.visible) this._loadIfShown();
    }

    /** Read the summary when the view is shown and Pro is open. @returns {void} */
    _loadIfShown() {
        if (this.visible && proState(this._license) === 'open') this._load();
    }

    /** Read the summary of the period chosen. @returns {Promise<void>} */
    async _load() {
        const request = ++this._request;
        this._loading = true;
        this._error = null;
        try {
            const summary = await listeningSummary(this._period);
            if (request === this._request) this._summary = summary;
        } catch (err) {
            if (request === this._request) {
                this._error = err?.detail || err?.message || 'The history could not be read.';
            }
        } finally {
            if (request === this._request) this._loading = false;
        }
    }

    /**
     * Another period: its summary is read, the last one shown faded meanwhile.
     *
     * @param {CustomEvent} e - `filter-change`; detail.value is the period.
     * @returns {void}
     */
    _onPeriod(e) {
        this._period = e.detail.value;
        this._load();
    }

    /**
     * Bring the recording's switch into view, and give it the focus.
     *
     * @returns {void}
     */
    _goToSwitch() {
        const input = this.querySelector('ag-stats-recording ag-switch input');
        input?.scrollIntoView?.({ block: 'center' });
        input?.focus({ preventScroll: true });
    }

    /**
     * The line that says the recording is off, while it is.
     *
     * @returns {import('lit').TemplateResult|typeof nothing}
     */
    _offNotice() {
        if (this._summary?.recording !== false) return nothing;
        return html`
            <div class="lib-stats-off" role="status">
                <span>Recording is off: nothing new is recorded.</span>
                <button type="button" class="plain-btn lib-stats-off-link"
                        @click=${this._goToSwitch}>Go to the switch</button>
            </div>
        `;
    }

    /**
     * The history's header: whose it is, and since when.
     *
     * @returns {import('lit').TemplateResult}
     */
    _header() {
        const since = this._summary?.since;
        return html`
            <div class="lib-stats-header">
                <h2 class="lib-stats-title">Listening on this box</h2>
                ${since ? html`<span class="lib-stats-since">since ${fmtIsoDate(since)}</span>` : nothing}
            </div>
        `;
    }

    /**
     * A section of the view, under its heading.
     *
     * @param {string} heading - What it shows.
     * @param {import('lit').TemplateResult} body - Its content.
     * @returns {import('lit').TemplateResult}
     */
    _section(heading, body) {
        return html`
            <section class="lib-stats-section">
                <h3 class="lib-stats-heading">${heading}</h3>
                ${body}
            </section>
        `;
    }

    /** The figures of the period. @returns {import('lit').TemplateResult|typeof nothing} */
    _figures() {
        const s = this._summary;
        if (!s) return this._error ? html`<p class="lib-stats-hint">${this._error}</p>` : nothing;
        if (!s.listens && !s.recent?.length) {
            return html`<p class="lib-stats-empty">Nothing recorded yet. A listen counts once it has played for 30 seconds.</p>`;
        }
        const caption = s.period === 'all'
            ? (s.since ? `since ${fmtIsoDate(s.since)}` : '')
            : CAPTIONS[s.period];
        return html`
            <div class="lib-stats-figures ${this._loading ? 'lib-stats-figures--loading' : ''}"
                 aria-busy=${this._loading ? 'true' : 'false'}>
                ${this._error ? html`<p class="lib-stats-hint">${this._error}</p>` : nothing}
                <ag-stats-headline .summary=${s} caption=${caption}></ag-stats-headline>
                ${this._section('Listening time',
                    html`<ag-stats-bars .buckets=${s.buckets} unit=${s.unit}></ag-stats-bars>`)}
                ${hasWeek(s.week_hours) ? this._section('When you listen',
                    html`<ag-stats-hours .week=${s.week_hours}></ag-stats-hours>`) : nothing}
                ${s.sources?.length ? this._section('By source',
                    html`<ag-stats-shares .rows=${s.sources} .total=${s.total_seconds}></ag-stats-shares>`) : nothing}
                ${s.outputs?.length ? this._section('By output',
                    html`<ag-stats-shares .rows=${s.outputs} .total=${s.total_seconds}></ag-stats-shares>`) : nothing}
                ${s.total_seconds ? this._section('Sound quality',
                    html`<ag-stats-quality .classes=${s.quality}></ag-stats-quality>`) : nothing}
                ${s.genres?.length ? this._section('Genres', html`
                    <ag-stats-shares .rows=${genreRows(s.genres)} .total=${s.total_seconds}></ag-stats-shares>
                    ${s.genres.some(g => g.kind === 'unknown')
                        ? html`<p class="lib-stats-hint">Unknown: AirPlay and some streams carry no genre.</p>`
                        : nothing}
                `) : nothing}
                ${this._section('Most played', html`
                    <ag-stats-top .artists=${s.top_artists} .albums=${s.top_albums}
                        .tracks=${s.top_tracks}></ag-stats-top>
                `)}
            </div>
        `;
    }

    render() {
        const state = proState(this._license);
        if (state === 'unknown') return html`<div class="lib-stats">${this._header()}</div>`;
        const recording = this._section('Recording', html`
            <ag-stats-recording ?visible=${this.visible}
                @listening-changed=${() => this._loadIfShown()}></ag-stats-recording>
        `);
        if (state === 'locked') {
            return html`
                <div class="lib-stats">
                    ${this._header()}
                    <div class="lib-stats-lock">
                        <ag-pro-lock-card name="Listening history"
                            description="Time listened, sources, sound quality, most played"
                            .icon=${svgIcon(iconBarChart, { size: '24px' })}></ag-pro-lock-card>
                    </div>
                    ${recording}
                </div>
            `;
        }
        return html`
            <div class="lib-stats">
                ${this._header()}
                ${this._offNotice()}
                <div class="lib-stats-selector">
                    <ag-filter-bar .options=${LISTENING_PERIODS} value=${this._period}
                        @filter-change=${this._onPeriod}></ag-filter-bar>
                </div>
                ${this._figures()}
                ${this._summary?.recent?.length ? this._section('Recently played', html`
                    <ag-stats-recent .listens=${this._summary.recent}></ag-stats-recent>
                `) : nothing}
                ${recording}
                <p class="lib-stats-hint lib-stats-footnote">Roon and HQPlayer are not counted yet.</p>
            </div>
        `;
    }
}

customElements.define('ag-library-stats', AgLibraryStats);
