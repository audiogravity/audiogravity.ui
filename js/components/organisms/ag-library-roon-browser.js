/**
 * @module AgLibraryRoonBrowser
 * @description Generic Roon hierarchy browser. Navigates the Roon browse tree
 * using a stateful GET /api/library/roon-browse endpoint:
 *   - No item_key → reset to root
 *   - item_key=X  → navigate into X
 *   - back=true   → go back one level (pop_levels=1)
 * Action items (Play Now, Add to Queue, etc.) are executed via a dedicated
 * POST /api/library/roon-action call.
 *
 * @element ag-library-roon-browser
 *
 * @attr {string} source-id  - Active source ID (e.g. 'src_mono-sgen')
 * @attr {string} zone-id    - Roon zone ID (required)
 *
 * @fires lib-open-np        - Bubbles. No detail — navigate to Now Playing after play action
 * @fires lib-roon-back      - Bubbles. No detail — user pressed back at root level
 *
 * @dependency css/components/library-browser.css
 */
import { LitElement, html, nothing } from 'lit';
import { apiGet } from '../../api.js';
import { coverUrl, loadWithState } from '../utils-lit.js';
import { roonAction } from '../../library-api.js';
import { iconChevronRight, iconPlay } from '../../ag-icons.js';
import '../atoms/ag-library-cover.js';
import '../molecules/ag-library-browser-topbar.js';
import '../molecules/ag-library-breadcrumbs.js';

export class AgLibraryRoonBrowser extends LitElement {
    static properties = {
        sourceId:    { type: String, attribute: 'source-id' },
        zoneId:      { type: String, attribute: 'zone-id' },
        _stack:      { state: true },  // [{key, title}] — breadcrumb only, keys not re-used
        _depth:      { state: true },  // 0 = root
        _items:      { state: true },
        _levelTitle: { state: true },
        _total:      { state: true },
        _loading:    { state: true },
        _error:      { state: true },
        _acting:     { state: true },  // item key currently being executed
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.sourceId    = '';
        this.zoneId      = '';
        this._stack      = [];
        this._depth      = 0;
        this._items      = [];
        this._levelTitle = '';
        this._total      = 0;
        this._loading    = false;
        this._error      = null;
        this._acting     = null;
    }

    /**
     * Map a Roon action item title to the matching fallback glyph name
     * supported by ag-library-cover.
     */
    _fallbackForAction(title) {
        const t = title.toLowerCase();
        if (t.includes('radio')) return 'radio';
        if (t.includes('next') || (t.includes('add') && !t.includes('queue'))) return 'next';
        if (t.includes('queue') || t.includes('add')) return 'queue';
        return 'play';
    }

    updated(changed) {
        if ((changed.has('zoneId') || changed.has('sourceId')) && this.zoneId) {
            this._stack = [];
            this._depth = 0;
            Promise.resolve().then(() => this._browseReset());
        }
    }

    /** Reset to root level. */
    async _browseReset() {
        if (!this.zoneId) return;
        await loadWithState(this, async () => {
            const params = new URLSearchParams({ zone_id: this.zoneId, limit: '100' });
            const data   = await apiGet(`/library/roon-browse?${params}`);
            this._applyLevel(data);
        });
    }

    /**
     * Navigate into an item.
     * @param {{id: string, title: string}} item
     */
    async _browseInto(item) {
        if (!this.zoneId || !item.id) return;
        await loadWithState(this, async () => {
            const params = new URLSearchParams({ zone_id: this.zoneId, item_key: item.id, limit: '100' });
            const data   = await apiGet(`/library/roon-browse?${params}`);
            if (data.action) {
                // Roon executed an action (e.g. play) rather than showing a list
                if (data.action.toLowerCase().includes('play')) {
                    this.dispatchEvent(new CustomEvent('lib-open-np', { bubbles: true }));
                }
                return;
            }
            this._stack = [...this._stack, { key: item.id, title: item.title }];
            this._depth = this._stack.length;
            this._applyLevel(data);
        });
    }

    /** Go back one level. */
    async _browseBack() {
        if (this._depth === 0) {
            this.dispatchEvent(new CustomEvent('lib-roon-back', { bubbles: true }));
            return;
        }
        await loadWithState(this, async () => {
            const params = new URLSearchParams({ zone_id: this.zoneId, back: 'true', limit: '100' });
            const data   = await apiGet(`/library/roon-browse?${params}`);
            this._stack = this._stack.slice(0, -1);
            this._depth = this._stack.length;
            this._applyLevel(data);
        });
    }

    /**
     * Execute a Roon action item (Play Now, Add to Queue, etc.)
     * @param {{id: string, title: string}} item
     */
    async _executeAction(item) {
        if (!this.zoneId || !item.id || this._acting) return;
        this._acting = item.id;
        try {
            await roonAction(this.zoneId, item.id);
            if (item.title.toLowerCase().includes('play')) {
                this.dispatchEvent(new CustomEvent('lib-open-np', { bubbles: true }));
            }
        } catch (e) {
            console.error('[roon-browser] action failed:', e);
        } finally {
            this._acting = null;
        }
    }

    /** Apply a browse response to component state. */
    _applyLevel(data) {
        this._levelTitle = data.title ?? '';
        this._total      = data.total  ?? 0;
        this._items      = data.items  ?? [];
    }

    /** Handle tap on any item. */
    _onItemTap(item) {
        if (item.hint === 'action') {
            this._executeAction(item);
        } else {
            this._browseInto(item);
        }
    }

    _onCrumbRoot() {
        this._stack = [];
        this._depth = 0;
        this._browseReset();
    }

    _renderItem(item) {
        const cover    = item.image_key ? coverUrl(`roon:${item.image_key}`) : '';
        const isAct    = item.hint === 'action';
        const isBusy   = this._acting === item.id;
        const fallback = isAct ? this._fallbackForAction(item.title) : 'list';

        return html`
            <div
                class="lib-browser-row ${isAct ? 'action' : ''} ${isBusy ? 'busy' : ''}"
                @click=${() => !isBusy && this._onItemTap(item)}
            >
                <ag-library-cover
                    cover=${cover}
                    fallback=${fallback}
                    class=${isAct ? 'lib-browser-cv--act' : ''}
                ></ag-library-cover>
                <div class="lib-browser-meta">
                    <span class="lib-browser-t">${item.title}</span>
                    ${item.subtitle ? html`<span class="lib-browser-st">${item.subtitle}</span>` : nothing}
                </div>
                <div class="lib-browser-right">
                    ${isAct
                        ? html`<button class="lib-lr-add" ?disabled=${isBusy}
                                @click=${(e) => { e.stopPropagation(); !isBusy && this._onItemTap(item); }}>
                                ${isBusy
                                    ? html`<span style="font-size:10px;font-family:var(--font-mono)">…</span>`
                                    : html`<svg viewBox="0 0 24 24" width="14" height="14"
                                            fill="currentColor" stroke="none">
                                            ${iconPlay}
                                        </svg>`
                                }
                            </button>`
                        : html`<svg viewBox="0 0 24 24" width="12" height="12"
                                fill="none" stroke="currentColor" stroke-width="2"
                                stroke-linecap="round">
                                ${iconChevronRight}
                              </svg>`
                    }
                </div>
            </div>
        `;
    }

    render() {
        const { _loading, _error, _items, _levelTitle } = this;

        if (!this.zoneId) return html`<div class="lib-empty">Select a Roon zone first</div>`;
        if (_loading)     return html`<div class="lib-loading">Loading…</div>`;
        if (_error)       return html`<div class="lib-empty">Error: ${_error}</div>`;

        return html`
            <ag-library-browser-topbar
                title=${_levelTitle || 'Browse'}
                @browser-back=${() => this._browseBack()}
                @browser-refresh=${() => this._browseReset()}
            ></ag-library-browser-topbar>
            <ag-library-breadcrumbs
                .stack=${this._stack}
                root-label="Root"
                @breadcrumb-root=${() => this._onCrumbRoot()}
            ></ag-library-breadcrumbs>
            ${_items.length === 0
                ? html`<div class="lib-empty">No items</div>`
                : _items.map(item => this._renderItem(item))
            }
            <div style="height:12px"></div>
        `;
    }
}

customElements.define('ag-library-roon-browser', AgLibraryRoonBrowser);
