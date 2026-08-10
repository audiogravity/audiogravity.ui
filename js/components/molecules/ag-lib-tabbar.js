/**
 * @module AgLibTabbar
 * @description Inner navigation tabbar for the library player overlay.
 * Renders five tabs: Browse, Search, Queue, Library, Radio.
 *
 * @element ag-lib-tabbar
 *
 * @attr {string} tab - Active tab key: 'browse' | 'search' | 'queue' | 'library' | 'radio'
 *
 * @fires lib-tab-change - Bubbles. detail: { tab: string }
 */
import { LitElement, html } from 'lit';
import { keepInView } from '../../core/keep-in-view.js';
import { iconQueue, iconSearch, iconQueuePlay, iconLibraryGrid, iconRadio } from '../../ag-icons.js';

const TABS = [
    { key: 'browse',  label: 'Browse',  icon: iconQueue       },
    { key: 'search',  label: 'Search',  icon: iconSearch      },
    { key: 'queue',   label: 'Queue',   icon: iconQueuePlay   },
    { key: 'library', label: 'Library', icon: iconLibraryGrid },
    { key: 'radio',   label: 'Radio',   icon: iconRadio       },
];

export class AgLibTabbar extends LitElement {
    static properties = {
        tab: { type: String },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.tab = 'browse';
        /** Whether the bar has already positioned itself once — the first scroll is
         *  instant, so the bar does not glide into place as the page appears.
         *  @type {boolean} */
        this._hasScrolled = false;
    }

    /**
     * Keep the active tab in view — see js/core/keep-in-view.js for the why.
     *
     * @param {Map<string, unknown>} changed - Lit's changed-properties map.
     * @returns {void}
     */
    updated(changed) {
        if (!changed.has('tab')) return;
        keepInView(this.querySelector('.lib-tab.on'), { first: !this._hasScrolled });
        this._hasScrolled = true;
    }

    /**
     * Announce the tap, whether or not it lands on the tab already highlighted.
     *
     * It used to return early when the key matched, which looked like sensible
     * de-duplication and was not: several views map onto a tab they are not — outputs
     * shows Library highlighted, and the artist, Roon and UPnP browsers all show
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

    render() {
        return html`
            <div class="lib-nav">
                ${TABS.map(t => html`
                    <button
                        class="lib-tab ${this.tab === t.key ? 'on' : ''}"
                        @click=${() => this._select(t.key)}
                        aria-label=${t.label}
                    >
                        <svg viewBox="0 0 24 24" style="width:22px;height:22px;flex-shrink:0"
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
