/**
 * @module AgHraSearchFilters
 * @description The filter row of a HIGHRESAUDIO search: narrow the words you typed by
 * composer, or by record label.
 *
 * Composer answers the classical case, where the name you want is on none of the other
 * fields; label answers the ECM / Pentatone case. Both were verified to intersect with
 * the search: a term that matches nothing returns nothing, filter or no filter.
 *
 * Two filters HRA offers are deliberately NOT here, though the core still accepts them:
 *
 *   - **format**, because HRA ignores the words typed as soon as one is given —
 *     measured: `queen`, `London` and a nonsense term all return the same fifty albums
 *     FLAC 192, in a different order. A control that quietly replaces your search with
 *     something else is worse than no control. Their defect, reported to them.
 *   - **mood**, because HRA computes a cold mood search in about a minute (59s
 *     measured, then instant on a repeat, their side having cached it).
 *
 * @element ag-hra-search-filters
 *
 * @fires hra-filters-change - Bubbles. detail: {composer, label} — every value trimmed,
 *        absent ones empty. Fired on each change, so the organism decides when to
 *        search rather than being told.
 *
 * @dependency css/components/library-search.css (lib-hraf-* classes)
 */

import { LitElement, html, nothing } from 'lit';

export class AgHraSearchFilters extends LitElement {

    static properties = {
        _composer: { state: true },
        _label:    { state: true },
    };

    constructor() {
        super();
        this._composer = '';
        this._label    = '';
    }

    /** @override Light DOM — inherits global CSS. */
    createRenderRoot() { return this; }

    /** @returns {{composer: string, label: string}} The current filters. */
    get value() {
        return {
            composer: this._composer.trim(),
            label:    this._label.trim(),
        };
    }

    /** @returns {boolean} Whether anything is set — an empty row must not narrow a search. */
    get isEmpty() {
        const v = this.value;
        return !v.composer && !v.label;
    }

    /** Clear every filter and announce it. */
    reset() {
        if (this.isEmpty) return;
        this._composer = this._label = '';
        this._emit();
    }

    /** @private */
    _emit() {
        this.dispatchEvent(new CustomEvent('hra-filters-change', {
            bubbles: true,
            detail: this.value,
        }));
    }

    /**
     * @private
     * @param {'_composer'|'_label'} field
     * @param {string} value
     */
    _set(field, value) {
        if (this[field] === value) return;
        this[field] = value;
        this._emit();
    }

    render() {
        return html`
            <div class="lib-hraf">
                <input
                    class="lib-hraf-input"
                    type="text"
                    placeholder="Composer"
                    aria-label="Composer"
                    .value=${this._composer}
                    @change=${(e) => this._set('_composer', e.target.value)}
                >

                <input
                    class="lib-hraf-input"
                    type="text"
                    placeholder="Label"
                    aria-label="Record label"
                    .value=${this._label}
                    @change=${(e) => this._set('_label', e.target.value)}
                >

                ${this.isEmpty ? nothing : html`
                    <button class="lib-hraf-clear" @click=${() => this.reset()}>Clear</button>
                `}
            </div>
        `;
    }
}

customElements.define('ag-hra-search-filters', AgHraSearchFilters);
