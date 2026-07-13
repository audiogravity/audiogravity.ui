/**
 * @module AgLibraryQueue
 * @description Playback queue view. Shows the currently playing track and the
 * list of upcoming tracks. Fetches from GET /api/library/queue.
 * Supports track removal via DELETE /api/library/queue/{position}.
 *
 * @element ag-library-queue
 *
 * @attr {string} source-id - Active library source ID
 * @attr {string} zone-id   - Roon zone ID (required for Roon sources)
 *
 * @fires lib-open-np - Bubbles. Navigate to Now Playing
 */
import { LitElement, html, nothing } from 'lit';
import { apiGet } from '../../api.js';
import { coverUrl, fmtDuration, loadWithState } from '../utils-lit.js';
import { queueSourceLabel, originLabel } from '../library-constants.js';
import { removeQueueItem } from '../../library-api.js';
import { iconPause, iconDragHandle, iconArrowLeft } from '../../ag-icons.js';
import '../atoms/ag-library-cover.js';
import '../atoms/ag-source-badge.js';
import '../atoms/ag-filter-bar.js';

/** Sentinel filter value meaning "show every source". */
const ALL_SOURCES = 'all';

export class AgLibraryQueue extends LitElement {
    static properties = {
        sourceId:        { type: String, attribute: 'source-id' },
        zoneId:          { type: String, attribute: 'zone-id' },
        zoneDisplayName: { type: String, attribute: 'zone-display-name' },
        visible:         { type: Boolean },
        _queue:          { state: true },
        _loading:        { state: true },
        _originFilter:   { state: true },
    };


    createRenderRoot() { return this; }

    constructor() {
        super();
        this.sourceId        = '';
        this.zoneId          = '';
        this.zoneDisplayName = '';
        this.visible         = false;
        this._queue          = null;
        this._loading        = false;
        this._originFilter   = ALL_SOURCES;
    }

    updated(changed) {
        // Switching source clears any active source filter — a Qobuz-only filter
        // is meaningless once the user browses a different source. Guarded so it
        // only mutates (and schedules a re-render) when a filter is actually set.
        if (changed.has('sourceId') && this._originFilter !== ALL_SOURCES) {
            this._originFilter = ALL_SOURCES;
        }
        const becameVisible = changed.has('visible') && this.visible;
        const ctxChanged    = (changed.has('sourceId') || changed.has('zoneId')) && this.sourceId;
        if ((becameVisible || ctxChanged) && this.sourceId) {
            Promise.resolve().then(() => this._load());
        }
    }

    /**
     * Distinct stream origins present in a list, in first-seen order.
     * @param {Array<{origin?: string}>} items - Queue items.
     * @returns {string[]} Unique, truthy origin kinds in list order.
     */
    _distinctOrigins(items) {
        const seen = [];
        for (const it of items) {
            if (it.origin && !seen.includes(it.origin)) seen.push(it.origin);
        }
        return seen;
    }

    /**
     * Compute the source-filter view over the up-next list. The filter is
     * display-only: `shownNext` is a subset of `upNext` and every item keeps its
     * real MPD `position`, so removal/playback are unaffected by what is filtered
     * out. Origins are taken from `upNext` (the actually-filterable set), so an
     * origin present only as the current track never becomes a dead filter option.
     * A stale filter value (its source no longer up-next) falls back to all.
     * @param {Array<{origin?: string, position: number}>} upNext - Non-current items.
     * @returns {{mixed: boolean, activeFilter: string, shownNext: Array, filterOpts: Array<{label: string, value: string}>}}
     */
    _filterView(upNext) {
        const origins      = this._distinctOrigins(upNext);
        const mixed        = origins.length >= 2;
        const activeFilter = mixed && origins.includes(this._originFilter) ? this._originFilter : ALL_SOURCES;
        const shownNext    = activeFilter === ALL_SOURCES ? upNext : upNext.filter(i => i.origin === activeFilter);
        const filterOpts   = mixed
            ? [{ label: 'All', value: ALL_SOURCES }, ...origins.map(o => ({ label: originLabel(o), value: o }))]
            : [];
        return { mixed, activeFilter, shownNext, filterOpts };
    }

    /**
     * Update the active source filter from an ag-filter-bar change event.
     * @param {CustomEvent<{value: string}>} e - filter-change event.
     */
    _onFilterChange(e) {
        this._originFilter = e.detail.value;
    }

    _isRoon() {
        return this.sourceId === 'src_roon' || this.sourceId === 'src_mono-sgen';
    }

    async _load() {
        if (!this.sourceId) return;
        if (this.sourceId === 'src_hqplayer') return;
        if (this._isRoon() && !this.zoneId) return;
        await loadWithState(this, async () => {
            const params = new URLSearchParams({ source_id: this.sourceId });
            if (this.zoneId) params.set('zone_id', this.zoneId);
            this._queue = await apiGet(`/library/queue?${params}`);
        });
        // Drop a filter whose source has left the up-next list, so it can't
        // silently reactivate if that source reappears in a later refresh.
        const upNext = (this._queue?.items ?? []).filter(i => !i.is_current);
        if (this._originFilter !== ALL_SOURCES && !this._distinctOrigins(upNext).includes(this._originFilter)) {
            this._originFilter = ALL_SOURCES;
        }
    }

    async _remove(position) {
        if (this._isRoon()) return;
        try {
            await removeQueueItem(this.sourceId, position);
            await this._load();
        } catch (e) {
            console.error('[queue] remove failed:', e);
        }
    }

    async _clear() {
        if (this._isRoon()) return;
        // Clear only what the active filter is showing (all up-next when unfiltered),
        // so Clear matches what the user actually sees. Delete in descending order
        // to avoid MPD reindexing shifting subsequent positions.
        const upNext = (this._queue?.items ?? []).filter(i => !i.is_current);
        const { shownNext } = this._filterView(upNext);
        const toDelete = [...shownNext].sort((a, b) => b.position - a.position);
        for (const item of toDelete) {
            try {
                await removeQueueItem(this.sourceId, item.position);
            } catch (_) { /* ignore individual failures */ }
        }
        await this._load();
    }

    render() {
        if (!this.sourceId) return html`<div class="lib-empty">Select a source</div>`;
        if (this._loading) return html`<div class="lib-loading">Loading…</div>`;

        const queue       = this._queue;
        const items       = queue?.items ?? [];
        const current     = items.find(i => i.is_current);
        const upNext      = items.filter(i => !i.is_current);
        // Label by what is actually playing (origin) rather than the MPD engine:
        // a radio stream queued from "Local Library" is still radio.
        const sourceLabel = queueSourceLabel(current?.origin, this.sourceId);
        const ctxLabel    = this.zoneDisplayName ? `${sourceLabel} · ${this.zoneDisplayName}` : sourceLabel;

        // Source-filter + per-row badges only make sense once the shared MPD
        // queue mixes providers (Qobuz + radio + local…). A single-source queue
        // stays clean — its one source is already named in the header above.
        const { mixed, activeFilter, shownNext, filterOpts } = this._filterView(upNext);

        return html`
            <div class="lib-queue-ctx">
                <span class="lib-queue-ctx-lbl">Queue of</span>
                <span class="lib-queue-ctx-val">${ctxLabel}</span>
            </div>
            ${current ? html`
                <div class="lib-queue-now">
                    <div class="lib-queue-lbl">Now playing</div>
                    <div class="lib-queue-now-row">
                        <ag-library-cover
                            cover=${coverUrl(current.cover_token)}
                            fallback="track"
                            size="54"
                        ></ag-library-cover>
                        <div class="lib-queue-now-col">
                            <span class="lib-queue-now-t">${current.title}</span>
                            <span class="lib-queue-now-a">${current.artist ?? ''}</span>
                            ${current.album ? html`<span class="lib-queue-now-meta">${current.album}</span>` : nothing}
                        </div>
                        <button
                            class="lib-queue-now-play"
                            @click=${() => this.dispatchEvent(new CustomEvent('lib-open-np', { bubbles: true }))}
                        >
                            <svg viewBox="0 0 24 24">${iconPause}</svg>
                        </button>
                    </div>
                </div>
            ` : nothing}

            <div class="lib-queue-list-hd">
                <span class="lib-queue-list-lbl">Up next</span>
                <span class="lib-queue-total">
                    ${activeFilter === ALL_SOURCES
                        ? html`${upNext.length} track${upNext.length !== 1 ? 's' : ''}`
                        : html`${shownNext.length} of ${upNext.length} track${upNext.length !== 1 ? 's' : ''}`}
                    ·
                    <button class="lib-queue-action" @click=${() => this._load()}>Refresh</button>
                    ${upNext.length > 0 ? html`·
                        <span class=${this._isRoon() ? 'lib-queue-tip' : ''}
                              data-tip=${this._isRoon() ? 'Roon does not expose a clear-queue API — use the Roon app to manage the queue.' : ''}>
                            <button
                                class="lib-queue-action ${this._isRoon() ? 'disabled' : ''}"
                                ?disabled=${this._isRoon()}
                                @click=${() => this._isRoon() ? null : this._clear()}
                            >Clear</button>
                        </span>
                    ` : nothing}
                </span>
            </div>

            ${mixed ? html`
                <div class="lib-queue-filter">
                    <ag-filter-bar
                        .options=${filterOpts}
                        value=${activeFilter}
                        @filter-change=${e => this._onFilterChange(e)}
                    ></ag-filter-bar>
                </div>
            ` : nothing}

            ${upNext.length === 0 && !current
                ? html`<div class="lib-empty">Queue is empty</div>`
                : nothing
            }
            ${upNext.length > 0 && shownNext.length === 0
                ? html`<div class="lib-empty">No upcoming ${originLabel(activeFilter)} tracks</div>`
                : nothing
            }

            ${shownNext.map(item => html`
                <div class="lib-queue-row">
                    <div class="lib-queue-grip">
                        <svg viewBox="0 0 24 24">${iconDragHandle}</svg>
                    </div>
                    <ag-library-cover
                        cover=${coverUrl(item.cover_token)}
                        fallback="track"
                        size="36"
                    ></ag-library-cover>
                    <div class="lib-queue-col">
                        <span class="lib-queue-col-t">${item.title}</span>
                        <span class="lib-queue-col-a">${item.artist ?? ''}${item.album ? ` — ${item.album}` : ''}</span>
                        ${mixed ? html`<ag-source-badge origin=${item.origin}></ag-source-badge>` : nothing}
                    </div>
                    <span class="lib-queue-dur">${fmtDuration(item.duration)}</span>
                    ${!this._isRoon() ? html`
                    <button class="lib-queue-more" @click=${() => this._remove(item.position)} title="Remove">
                        <svg viewBox="0 0 24 24">${iconArrowLeft}</svg>
                    </button>` : nothing}
                </div>
            `)}

            <div style="height:12px"></div>
        `;
    }
}

customElements.define('ag-library-queue', AgLibraryQueue);
