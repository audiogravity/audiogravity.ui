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
    }

    _select(key) {
        if (this.tab === key) return;
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
