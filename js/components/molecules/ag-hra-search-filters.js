/**
 * @module AgHraSearchFilters
 * @description HIGHRESAUDIO's advanced search: the eight criteria their own application
 * offers, on the form that goes with them.
 *
 * Seven of the eight live here — artist, composer, label, year, format, mood and the
 * order. The eighth, the free text, is the search box already on screen: HRA searches on
 * one field or the other, never on two boxes at once, and a second text input beside the
 * first would only ask which one to type in.
 *
 * ## Why these eight and not others
 * The list is HRA's, copied deliberately, defects included (see below). Two of their shop
 * fields are absent for measured reasons: `album` is accepted and then SILENTLY IGNORED
 * by the streaming API (`artist=Queen&album=Innuendo` returns exactly the same eight
 * albums as `artist=Queen` alone), and genre has its own shelf on the browse.
 *
 * ## The defect that will be reported as a bug, and is not ours
 * Setting a format DISCARDS the words typed: `queen` and `london` with FLAC 192 both
 * return the same fifty albums, the whole 192 catalogue (measured 2026-08-31, reported to
 * HRA). Nothing here compensates for it — a form that quietly behaves differently from
 * the application people already use would be the worse surprise. The same measurement
 * shows the format filter works correctly alongside the structured fields: artist +
 * FLAC 96 narrows as it should.
 *
 * ## Why a Search button rather than searching on every change
 * This is the one slow endpoint HRA exposes — 22s measured on a cold format query, 59s on
 * a mood, then instant on a repeat. Seven controls that each fire a search would be seven
 * of those, and the core lets only two run at once so the rest queue behind them. The
 * form is applied once, when it is asked for.
 *
 * @element ag-hra-search-filters
 *
 * @fires hra-filters-change - Bubbles. detail: {artist, composer, label, release, format,
 *        mood, sort} — every value trimmed, unset ones empty. Fired when the form is
 *        applied or cleared, never on a keystroke.
 *
 * @dependency css/components/library-search.css (lib-hraf-* classes)
 */

import { LitElement, html, nothing } from 'lit';
import { getHraSearchFilters } from '../../library-store.js';

/** The seven criteria this form holds, as `[state property, emitted key]`. */
const FIELDS = [
    ['_artist',   'artist'],
    ['_composer', 'composer'],
    ['_label',    'label'],
    ['_release',  'release'],
    ['_format',   'format'],
    ['_mood',     'mood'],
    ['_sort',     'sort'],
];

export class AgHraSearchFilters extends LitElement {

    static properties = {
        _open:     { state: true },
        _artist:   { state: true },
        _composer: { state: true },
        _label:    { state: true },
        _release:  { state: true },
        _format:   { state: true },
        _mood:     { state: true },
        _sort:     { state: true },
        _formats:  { state: true },
        _moods:    { state: true },
        _sorts:    { state: true },
        _applied:  { state: true },
    };

    constructor() {
        super();
        this._open = false;
        for (const [prop] of FIELDS) this[prop] = '';
        /** @type {Array<{value: string, label: string}>} */
        this._formats = [];
        /** @type {Array<{value: string, label: string, group: string}>} */
        this._moods = [];
        /** @type {Array<{value: string, label: string}>} */
        this._sorts = [];
        /**
         * How many criteria the results on screen are actually narrowed by — what was
         * applied, not what is typed. The count sits on the closed form, where an
         * unapplied edit would otherwise claim a search that never ran.
         */
        this._applied = 0;
        /** Guard: the three lists are fetched once, on the first opening. */
        this._loaded = false;
    }

    /** @override Light DOM — inherits global CSS. */
    createRenderRoot() { return this; }

    /**
     * @returns {{artist: string, composer: string, label: string, release: string,
     *            format: string, mood: string, sort: string}} The form as typed.
     */
    get value() {
        return Object.fromEntries(FIELDS.map(([prop, key]) => [key, this[prop].trim()]));
    }

    /** @returns {boolean} Whether anything is set — an empty form must not narrow a search. */
    get isEmpty() {
        return !Object.values(this.value).some(Boolean);
    }

    /** Clear every criterion and announce it, so the results stop being narrowed. */
    reset() {
        if (this.isEmpty && !this._applied) return;
        for (const [prop] of FIELDS) this[prop] = '';
        this._emit();
    }

    /** @private Apply the form as it stands. */
    _apply() {
        this._emit();
    }

    /** @private */
    _emit() {
        const value = this.value;
        this._applied = Object.values(value).filter(Boolean).length;
        this.dispatchEvent(new CustomEvent('hra-filters-change', {
            bubbles: true,
            detail: value,
        }));
    }

    /**
     * @private
     * @param {string} prop - The state property to write, one of {@link FIELDS}.
     * @param {string} value
     */
    _set(prop, value) {
        if (this[prop] === value) return;
        this[prop] = value;
    }

    /**
     * @private Open or close the form, fetching the three option lists the first time.
     * Lazily: someone who never opens this never pays for the request.
     */
    async _toggle() {
        this._open = !this._open;
        if (!this._open || this._loaded) return;
        this._loaded = true;
        const { formats, moods, sorts } = await getHraSearchFilters();
        this._formats = formats;
        this._moods = moods;
        this._sorts = sorts;
        // An empty answer is a failure the store does not cache, so let the next
        // opening ask again rather than leaving three menus permanently bare.
        if (!formats.length || !moods.length) this._loaded = false;
    }

    /**
     * @private One text criterion.
     * @param {string} prop - State property to bind.
     * @param {string} label - Placeholder and accessible name.
     * @param {object} [opts]
     * @param {string} [opts.inputmode] - Soft-keyboard hint, for the year.
     */
    _text(prop, label, { inputmode = '' } = {}) {
        return html`
            <input
                class="lib-hraf-input"
                type="text"
                placeholder=${label}
                aria-label=${label}
                inputmode=${inputmode || nothing}
                .value=${this[prop]}
                @input=${(e) => this._set(prop, e.target.value)}
                @keydown=${(e) => { if (e.key === 'Enter') { this._set(prop, e.target.value); this._apply(); } }}
            >
        `;
    }

    /**
     * @private One menu criterion. The empty option is the criterion being unset, and
     * it must stay first: a menu that opens on a value nobody chose narrows a search
     * without saying so.
     * @param {string} prop - State property to bind.
     * @param {string} label - Accessible name.
     * @param {string} unset - Wording of the empty option.
     * @param {Array<{value: string, label: string, group?: string}>} options
     */
    _menu(prop, label, unset, options) {
        // HRA types its moods by family — forty of them read as a list of forty
        // without the headings, and their own application groups them too.
        const groups = [...new Set(options.map(o => o.group).filter(Boolean))];
        // Selected on the option rather than `.value` on the menu: lit commits the
        // menu's own bindings before it builds its children, so a `.value` set while
        // the list is still empty is dropped — which is what folding the form away and
        // opening it again does. The criterion stayed applied and the menu read "Any".
        const option = (o) => html`
            <option value=${o.value} .selected=${this[prop] === o.value}>${o.label}</option>
        `;
        return html`
            <select
                class="lib-hraf-select"
                aria-label=${label}
                @change=${(e) => this._set(prop, e.target.value)}
            >
                <option value="" .selected=${!this[prop]}>${unset}</option>
                <!-- Ungrouped first, then the headings. Rendering the headings ALONE
                     as soon as one option carries a group drops every option that
                     does not: the core types a mood by HRA's own field and falls back
                     to "" when it is absent, so such a mood would be missing from the
                     menu with nothing to say it had been. -->
                ${options.filter(o => !o.group).map(option)}
                ${groups.map(g => html`
                    <optgroup label=${g}>
                        ${options.filter(o => o.group === g).map(option)}
                    </optgroup>
                `)}
            </select>
        `;
    }

    render() {
        // The order menu publishes its own "Default" as an empty value, so it needs no
        // unset option of ours — offering both would list Default twice.
        const sorts = this._sorts.filter(s => s.value);
        const sortDefault = this._sorts.find(s => !s.value)?.label ?? 'Default order';

        return html`
            <div class="lib-hraf">
                <button
                    class="lib-hraf-toggle ${this._open ? 'open' : ''}"
                    aria-expanded=${this._open ? 'true' : 'false'}
                    @click=${() => this._toggle()}
                >
                    Advanced search${this._applied ? html`<span class="lib-hraf-count">${this._applied}</span>` : nothing}
                </button>

                ${this._open ? html`
                    <div class="lib-hraf-form">
                        ${this._text('_artist', 'Artist')}
                        ${this._text('_composer', 'Composer')}
                        ${this._text('_label', 'Label')}
                        <!-- HRA's own name for it. It is the year the album went online,
                             not the year it was recorded: Innuendo was produced in 1991
                             and reads 2026 here. Their application calls it Year, and
                             this form is a copy of theirs. -->
                        ${this._text('_release', 'Year', { inputmode: 'numeric' })}
                        ${this._menu('_format', 'Audio format', 'Any format', this._formats)}
                        ${this._menu('_mood', 'Mood', 'Any mood', this._moods)}
                        ${this._menu('_sort', 'Sort order', sortDefault, sorts)}

                        <div class="lib-hraf-actions">
                            <!-- Shown on the same condition reset() acts on, not on the
                                 fields alone: emptying them by hand after a search
                                 leaves the results narrowed by what was applied, and
                                 hiding Clear there took away the way to widen them. -->
                            ${this.isEmpty && !this._applied ? nothing : html`
                                <button class="lib-hraf-clear" @click=${() => this.reset()}>Clear</button>
                            `}
                            <button class="lib-hraf-apply" @click=${() => this._apply()}>Search</button>
                        </div>
                    </div>
                ` : nothing}
            </div>
        `;
    }
}

customElements.define('ag-hra-search-filters', AgHraSearchFilters);
