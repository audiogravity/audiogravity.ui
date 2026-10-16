/**
 * @module AgLibTabbar
 * @description Inner navigation tabbar for the library player overlay.
 * Renders six tabs: Browse, Search, Queue, Sources, Radio, Stats.
 *
 * @element ag-lib-tabbar
 *
 * @attr {string} tab - Active tab key: 'browse' | 'search' | 'queue' | 'library' | 'radio' | 'stats'
 * @attr {Array<string>} tabs - Which tabs to show, in order. Omitted shows all
 *   six. A source that holds no /library catalogue passes a shorter list rather
 *   than leaving tabs that lead nowhere: the radio's stations are neither albums
 *   nor artists, so Browse answered an empty grid and Search an error.
 *
 * @fires lib-tab-change - Bubbles. detail: { tab: string }
 */
import { LitElement, html, nothing } from 'lit';
import { keepInView } from '../../core/keep-in-view.js';
import { iconQueue, iconSearch, iconQueuePlay, iconLibraryGrid, iconRadio, iconBarChart } from '../../ag-icons.js';

// The 'library' tab opens the list of sources to browse, and says so: called Library,
// it read twice in the tab menu, right under the Library entry it belongs to. The key
// stays, since the page's views are named after it.
const TABS = [
    { key: 'browse',  label: 'Browse',  icon: iconQueue       },
    { key: 'search',  label: 'Search',  icon: iconSearch      },
    { key: 'queue',   label: 'Queue',   icon: iconQueuePlay   },
    { key: 'library', label: 'Sources', icon: iconLibraryGrid },
    { key: 'radio',   label: 'Radio',   icon: iconRadio       },
    // The listening history: what the box played, whatever the source browsed.
    { key: 'stats',   label: 'Stats',   icon: iconBarChart    },
];

export class AgLibTabbar extends LitElement {
    static properties = {
        tab:  { type: String },
        tabs: { type: Array },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.tab = 'browse';
        /** @type {Array<string>|null} Keys to show; null shows every tab. */
        this.tabs = null;
        /** Whether the bar has already positioned itself once — the first scroll is
         *  instant, so the bar does not glide into place as the page appears.
         *  @type {boolean} */
        this._hasScrolled = false;
        /** Watches the bar's size, to say when its tabs ran onto a new line. */
        this._resizeObserver = null;
    }

    /**
     * Start watching the bar's size: a wrap follows the bar's width and the text size,
     * neither of which re-renders it.
     *
     * The copy in the tab menu only (`lib-menu`, set by ag-tabs as it creates it): the
     * page's bars scroll and never wrap, and the page holds one per view — eleven
     * watchers for nothing (review, 2026-10-16).
     *
     * @returns {void}
     */
    firstUpdated() {
        if (typeof ResizeObserver === 'undefined' || !this.classList.contains('lib-menu')) return;
        this._resizeObserver = new ResizeObserver(() => this._markWrap());
        this._resizeObserver.observe(this);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._resizeObserver?.disconnect();
        this._resizeObserver = null;
    }

    /**
     * Keep the active tab in view — see js/core/keep-in-view.js for the why.
     *
     * @param {Map<string, unknown>} changed - Lit's changed-properties map.
     * @returns {void}
     */
    updated(changed) {
        if (changed.has('tabs')) this._markWrap();
        if (!changed.has('tab')) return;
        keepInView(this.querySelector('.lib-tab.on'), { first: !this._hasScrolled });
        this._hasScrolled = true;
    }

    /**
     * Say on the bar whether its tabs ran onto a new line (`lib-nav--wrapped`).
     *
     * Only the copy in the tab menu wraps — the page's bar scrolls — and there the tabs
     * share their line's width. A tab sent alone to a new line took all of it, its label
     * centred under the row above (Stats, the sixth tab, 2026-10-16): the class lets the
     * menu's styles start that line at the left instead (LIB_STYLES, `.lib-menu`), and a
     * bar that fits on one line keeps sharing it.
     *
     * @returns {void}
     */
    _markWrap() {
        const nav = this.querySelector('.lib-nav');
        const tabs = this.querySelectorAll('.lib-tab');
        if (!nav) return;
        const wrapped = tabs.length > 1 && tabs[tabs.length - 1].offsetTop > tabs[0].offsetTop;
        nav.classList.toggle('lib-nav--wrapped', wrapped);
    }

    /**
     * Bring the active tab into view instantly — for when the BAR just became
     * visible, not the tab just changed.
     *
     * The library page renders one bar per view inside display:none containers,
     * and several views share a highlighted tab (outputs shows Sources; the
     * artist, Roon and UPnP browsers show Browse). Switching between them
     * changes no `tab` attribute, so updated() never fires — and any scroll
     * that ran while the bar was display:none had no layout box and silently
     * did nothing. The page calls this on every view switch; instant, because
     * positioning a bar that just appeared is not feedback to animate.
     *
     * @returns {void}
     */
    syncScroll() {
        keepInView(this.querySelector('.lib-tab.on'), { first: true });
    }

    /**
     * Announce the tap, whether or not it lands on the tab already highlighted.
     *
     * It used to return early when the key matched, which looked like sensible
     * de-duplication and was not: several views map onto a tab they are not — outputs
     * shows Sources highlighted, and the artist, Roon and UPnP browsers all show
     * Browse. Tapping that highlighted tab is the obvious way back out of those views,
     * and it did nothing at all. Harmless while the labels were hidden on a phone; a
     * visibly named, visibly selected, completely dead control once they were shown.
     *
     * The page decides what a tap means — `_onTabChange` clears the artist context and
     * resolves the view — so re-announcing costs a re-render it would have done anyway.
     *
     * @param {string} key - Tab key that was tapped.
     * @returns {void}
     */
    _select(key) {
        this.tab = key;
        this.dispatchEvent(new CustomEvent('lib-tab-change', {
            detail: { tab: key },
            bubbles: true,
        }));
    }

    /**
     * The icons are sized by attributes, not by an inline style: an inline style outranks
     * every stylesheet, and the copy of this bar in the tab menu draws them smaller
     * (LIB_STYLES, `.lib-menu`). The page's size is in LIB_STYLES too; the attributes
     * only hold it where those styles are not loaded.
     *
     * @returns {import('lit').TemplateResult}
     */
    render() {
        return html`
            <div class="lib-nav">
                ${TABS.filter(t => !this.tabs || this.tabs.includes(t.key)).map(t => html`
                    <button
                        class="lib-tab ${this.tab === t.key ? 'on' : ''}"
                        @click=${() => this._select(t.key)}
                        aria-label=${t.label}
                        aria-current=${this.tab === t.key ? 'page' : nothing}
                    >
                        <svg viewBox="0 0 24 24" width="22" height="22"
                            stroke="currentColor" fill="none"
                            stroke-width="${this.tab === t.key ? '2.2' : '1.7'}"
                            stroke-linecap="round" stroke-linejoin="round">${t.icon}</svg>
                        <span>${t.label}</span>
                    </button>
                `)}
            </div>
        `;
    }
}

customElements.define('ag-lib-tabbar', AgLibTabbar);
