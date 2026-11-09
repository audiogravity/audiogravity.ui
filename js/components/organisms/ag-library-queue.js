/**
 * @module AgLibraryQueue
 * @description Playback queue view. Shows the currently playing track and the
 * list of upcoming tracks. Fetches from GET /api/library/queue.
 * Supports track removal (button + left-swipe) via DELETE
 * /api/library/queue/{queue_id} — keyed on the stable MPD song id, not the
 * position, so removal is reindex-safe.
 *
 * The list stays on screen while it is read again: a removed track leaves it at once,
 * before the box answers, and the rows around it stay where they are — the reader keeps
 * their place and no cover is drawn again. "Loading…" stands in only while there is
 * nothing to show. A refused removal puts the track back, with the box's reason.
 *
 * While shown, the view follows the player: it reads the queue again a moment after
 * what plays changes, and its play/pause button turns with the music.
 *
 * On a box without Pro, a track of a streaming service (`pro` on the item, as the core
 * answers it) wears the Pro tint and the padlock: its relay refuses it there and the
 * player skips it, those queued during the trial included. Tapping the padlock leads to
 * the licence panel; the track can still be removed.
 *
 * @element ag-library-queue
 *
 * @attr {string} source-id - Active library source ID
 * @attr {string} zone-id   - Roon zone ID (required for Roon sources)
 *
 * @dependency js/core/LicenseController.js - Keeps `_license` in step with the box's licence
 * @dependency js/core/PlayerChangeController.js - Follows the player while the view is shown
 * @dependency ag-pro-lock - The padlock of a track a box without Pro skips
 */
import { LitElement, html, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { apiGet, apiPost } from '../../api.js';
import { coverUrl, fmtDuration, loadWithState } from '../utils-lit.js';
import { queueSourceLabel, originLabel } from '../library-constants.js';
import { removeQueueItem } from '../../library-api.js';
import { showToast } from '../../ui-helpers.js';
import { iconPause, iconPlay, iconArrowLeft } from '../../ag-icons.js';
import { SwipeToDismissController, swipeRow } from '../../core/SwipeToDismissController.js';
import { isLockedSource, openLicensePanel } from '../../license-tiers.js';
import { LicenseController } from '../../core/LicenseController.js';
import { PlayerChangeController } from '../../core/PlayerChangeController.js';
import { playPauseIntent } from '../../player-utils.js';
import '../atoms/ag-library-cover.js';
import '../atoms/ag-pro-lock.js';
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
        _toggling:       { state: true },
        _playPending:    { state: true },
        _refreshing:     { state: true },
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
        /** Song ids whose removal is on its way: kept out of every reading until it is answered. */
        this._removing       = new Set();
        /** Which queue `_queue` was read from (see _queueKey). */
        this._queueOf        = null;
        /** A play/pause sent and not answered yet. */
        this._toggling       = false;
        /** What a play/pause tap showed ahead of the box: `{playing, changes}`, or null. */
        this._playPending    = null;
        /** A reading asked by the Refresh button and not answered yet. */
        this._refreshing     = false;
        // Swipe an up-next row left to remove it (same gesture as radio / UPnP
        // lists). Keyed by the row's stable MPD song id.
        this._swipe = new SwipeToDismissController(this, {
            onCommit: (queueId) => this._remove(queueId),
        });
        this._licenseCtl = new LicenseController(this);
        // While shown: read the queue again once what plays has changed (a track that
        // ended, a skip from another screen), and keep the play/pause button in step.
        this._follow = new PlayerChangeController(this, () => this._load());
    }

    /**
     * Which queue this view shows. The box's own sources — the library, the streaming
     * services, the radio — all play through its one MPD queue; Roon holds one per zone.
     * @returns {string}
     */
    _queueKey() {
        return this._isRoon() ? `roon:${this.zoneId}` : 'box';
    }

    /**
     * Let go of what is on screen when the view moves to another queue altogether — a
     * Roon zone, or Roon against the box's own player: it belongs to the queue left, and
     * "Loading…" stands in until the new one is read. A reading still out for the old
     * one is dropped when it answers (see _load). Moving between the box's own sources
     * keeps the list: it is the same queue.
     * @param {Map<string, unknown>} changed - Properties changed since the last update.
     */
    willUpdate(changed) {
        if ((changed.has('sourceId') || changed.has('zoneId'))
                && this._queue && this._queueOf !== this._queueKey()) {
            this._queue = null;
        }
    }

    updated(changed) {
        if (changed.has('visible')) this._follow.follow(this.visible);
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

    /**
     * Whether a queued track is one this box will skip: a streaming service's, and Pro
     * not open. Nothing is locked while the licence is not read yet.
     * @param {{pro?: boolean}} item - Queue item.
     * @returns {boolean}
     */
    _isLocked(item) {
        return isLockedSource(item, this._license);
    }

    /**
     * The padlock of a track this box will skip: a real button, leading to the licence
     * panel as every padlock does. Not at the end of a swipe — the row moved under the
     * finger, as for the Remove button.
     * @returns {import('lit').TemplateResult}
     */
    _renderLock() {
        return html`
            <button class="plain-btn pro-lock-btn"
                @click=${() => !this._swipe.swiping && openLicensePanel(this._license)}>
                <ag-pro-lock></ag-pro-lock>
            </button>`;
    }

    /**
     * The player that holds this queue, as the player state lists it: the box's own MPD
     * for its sources — whatever else plays meanwhile, an AirPlay phone or Roon — and the
     * zone shown for Roon. Null while the state is not known.
     *
     * The box's MPD counts stopped too: it then has no track in the state — only what
     * plays or is paused does — but its queue still names a current track (a Stop from
     * another screen, the box restarted), and the core takes a Play for it. A Roon zone
     * is reached only through what it plays: null when it plays nothing.
     * @returns {?object} An entry of the state's `sources`.
     */
    _playerEntry() {
        const sources = this._follow.state?.sources ?? [];
        if (this._isRoon()) {
            return sources.find(s => s.protocol === 'roon' && s.playing
                && (!this.zoneId || !s.zone_id || s.zone_id === this.zoneId)) ?? null;
        }
        return sources.find(s => s.protocol === 'mpd') ?? null;
    }

    /**
     * Whether the play/pause button shows the music playing: what a tap showed ahead of
     * the box, until the box says what plays now; what the box says otherwise.
     * @param {?object} entry - The player's entry (see _playerEntry).
     * @returns {boolean}
     */
    _shownPlaying(entry) {
        const pending = this._playPending;
        if (pending && pending.changes === this._follow.changes) return pending.playing;
        return entry?.playback_status === 'Playing';
    }

    /**
     * Play or pause the player that holds this queue (POST /player/control), sending the
     * intent the button shows — never a toggle for the core to guess (playPauseIntent).
     * The button turns at once, as the players' do, and holds until the box tells a
     * change: a state it sent before taking the tap tells none. Refused, it goes back to
     * what the box says — with the reason when it is the licence (403), silently when
     * the device declined (503), as the players do.
     * @returns {Promise<void>}
     */
    async _togglePlay() {
        const entry = this._playerEntry();
        if (!entry || this._toggling) return;
        const action = playPauseIntent(this._shownPlaying(entry));
        this._playPending = { playing: action === 'play', changes: this._follow.changes };
        this._toggling = true;
        try {
            const body = { action, source_id: entry.source_id };
            if (entry.control_id) body.control_id = entry.control_id;
            await apiPost('/player/control', body);
        } catch (e) {
            this._playPending = null;
            if (e?.status === 403 && e.detail) showToast('error', 'Playback blocked', e.detail);
            else if (e?.status !== 503) console.error('[queue] play/pause failed:', e);
        } finally {
            this._toggling = false;
        }
    }

    /**
     * The play/pause button of the track playing. Unavailable — greyed, never removed, so
     * nothing moves under the finger — while the player's state is not known, and while a
     * tap is on its way.
     * @returns {import('lit').TemplateResult}
     */
    _renderPlayPause() {
        const entry = this._playerEntry();
        const playing = this._shownPlaying(entry);
        const busy = !entry || this._toggling;
        return html`
            <button class="lib-queue-now-play"
                aria-label=${playing ? 'Pause' : 'Play'}
                aria-disabled=${busy ? 'true' : 'false'}
                @click=${() => this._togglePlay()}>
                <svg viewBox="0 0 24 24">${playing ? iconPause : iconPlay}</svg>
            </button>`;
    }

    async _load() {
        if (!this.sourceId) return;
        if (this.sourceId === 'src_hqplayer') return;
        if (this._isRoon() && !this.zoneId) return;
        // Reads overlap — a removal, a track that ends, a Refresh. An answer overtaken by
        // a newer read, or read for a queue the view has left, no longer tells what is
        // shown: it is dropped. A track whose removal is on its way stays out of every
        // answer, whenever that answer left (see _dropFromView).
        const key = this._queueKey();
        await loadWithState(this, async (isLatest) => {
            const params = new URLSearchParams({ source_id: this.sourceId });
            if (this.zoneId) params.set('zone_id', this.zoneId);
            const queue = await apiGet(`/library/queue?${params}`);
            if (!isLatest() || key !== this._queueKey()) return;
            this._queue   = this._withoutRemovals(queue);
            this._queueOf = key;
        });
        // Drop a filter whose source has left the up-next list, so it can't
        // silently reactivate if that source reappears in a later refresh.
        const upNext = (this._queue?.items ?? []).filter(i => !i.is_current);
        if (this._originFilter !== ALL_SOURCES && !this._distinctOrigins(upNext).includes(this._originFilter)) {
            this._originFilter = ALL_SOURCES;
        }
    }

    /**
     * A queue as read, less the tracks whose removal is still on its way: a reading that
     * left before the box took a removal still lists that track.
     * @param {?object} queue - GET /library/queue answer.
     * @returns {?object}
     */
    _withoutRemovals(queue) {
        if (!queue?.items || this._removing.size === 0) return queue;
        return { ...queue, items: queue.items.filter(i => !this._removing.has(i.queue_id)) };
    }

    /**
     * Take tracks off the list on screen at once, before the box answers: the row leaves
     * under the finger and the rows around it stay put. Each stays out of every reading
     * until its removal is answered (see _withoutRemovals) — a reading can leave before
     * the box takes it: a second removal's, the one that follows a change of track, a
     * Refresh, all of them during a Clear.
     * @param {string[]} queueIds - Song ids of the tracks removed.
     */
    _dropFromView(queueIds) {
        for (const id of queueIds) this._removing.add(id);
        this._queue = this._withoutRemovals(this._queue);
    }

    async _remove(queueId) {
        if (this._isRoon()) return;
        this._dropFromView([queueId]);
        try {
            await removeQueueItem(this.sourceId, queueId);
        } catch (e) {
            // The backend now refuses truthfully (503 with MPD's reason, e.g.
            // the id is no longer in the queue) — relay it like every other
            // queue action instead of a console line nobody sees; the reload
            // re-syncs the list with what MPD actually holds, and puts back a
            // track that was not removed.
            console.error('[queue] remove failed:', e);
            showToast('error', 'Remove failed', e?.message || 'Could not remove the track');
        } finally {
            // Answered: what MPD holds tells it from now on. The reading below starts at
            // once, so any older one still out is overtaken by it (see _load).
            this._removing.delete(queueId);
        }
        await this._load();
    }

    /**
     * Read the queue again, at the reader's tap. The list stays on screen, so the button
     * is what shows the reading: unavailable until it is answered — a second tap meanwhile
     * does nothing.
     * @returns {Promise<void>}
     */
    async _refresh() {
        if (this._refreshing) return;
        this._refreshing = true;
        try {
            await this._load();
        } finally {
            this._refreshing = false;
        }
    }

    async _clear() {
        if (this._isRoon()) return;
        // Clear only what the active filter is showing (all up-next when unfiltered),
        // so Clear matches what the user actually sees. Removing by stable song id
        // (deleteid) is reindex-safe, so order doesn't matter.
        const upNext = (this._queue?.items ?? []).filter(i => !i.is_current);
        const { shownNext } = this._filterView(upNext);
        // Off the screen at once, as a single removal is — and nothing left for a second
        // tap to clear while the first is still at work.
        const ids = shownNext.map(i => i.queue_id);
        this._dropFromView(ids);
        // Per-item failures don't abort the sweep (the rest must still clear);
        // they are summarised in ONE toast — the reload shows the survivors,
        // the toast says why they survived.
        let failed = 0;
        let lastReason = null;
        for (const item of shownNext) {
            try {
                await removeQueueItem(this.sourceId, item.queue_id);
            } catch (e) {
                failed += 1;
                lastReason = e?.message || null;
            }
        }
        // All answered — kept out until now: a reading during the sweep left before the
        // later removals were taken.
        for (const id of ids) this._removing.delete(id);
        if (failed > 0) {
            showToast('error', 'Clear incomplete',
                `${failed} track${failed > 1 ? 's' : ''} could not be removed`
                + (lastReason ? ` — ${lastReason}` : ''));
        }
        await this._load();
    }

    render() {
        if (!this.sourceId) return html`<div class="lib-empty">Select a source</div>`;
        // Only while there is nothing to show: a list read again stays on screen.
        if (this._loading && !this._queue) return html`<div class="lib-loading">Loading…</div>`;

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
                <div class="lib-queue-now ${this._isLocked(current) ? 'lib-queue-now--locked' : ''}">
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
                        ${this._isLocked(current) ? this._renderLock() : nothing}
                        ${this._renderPlayPause()}
                    </div>
                </div>
            ` : nothing}

            <div class="lib-queue-list-hd">
                <span class="lib-queue-list-lbl">Up next</span>
                <span class="lib-queue-total">
                    ${activeFilter === ALL_SOURCES
                        ? html`${upNext.length} track${upNext.length !== 1 ? 's' : ''}`
                        : html`${shownNext.length} of ${upNext.length} track${upNext.length !== 1 ? 's' : ''}`}
                    <button class="lib-queue-action"
                        aria-disabled=${this._refreshing ? 'true' : 'false'}
                        @click=${() => this._refresh()}>Refresh</button>
                    ${upNext.length > 0 ? html`
                        <button
                            class="lib-queue-action ${this._isRoon() ? 'disabled' : ''}"
                            ?disabled=${this._isRoon()}
                            @click=${() => this._isRoon() ? null : this._clear()}
                        >Clear</button>
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
                ? html`<div class="lib-empty ag-hw-haunt">Queue is empty</div>`
                : nothing
            }
            ${upNext.length > 0 && shownNext.length === 0
                ? html`<div class="lib-empty ag-hw-haunt">No upcoming ${originLabel(activeFilter)} tracks</div>`
                : nothing
            }

            ${repeat(shownNext, item => item.queue_id ?? `position:${item.position}`, item => {
                // Keyed by the stable song id, so each row keeps its own elements: a
                // removal takes one row away and leaves the others — covers included —
                // as they are, and a row being swiped stays the same row when the list
                // is read again under the finger. A Roon row has no id: its position.
                // Roon queues can't be edited; and removal needs the stable song id,
                // so a row without queue_id is not swipeable/removable.
                const swipeable = !this._isRoon() && item.queue_id != null;
                const locked = this._isLocked(item);
                // BACKLOG: no way to change the order of the queue — the drag handle
                // these rows wore moved nothing and is gone. See /BACKLOG.md.
                return html`
                <div class="ag-swipe-wrap">
                    ${swipeable ? html`<div class="ag-swipe-reveal" aria-hidden="true">Remove</div>` : nothing}
                    <div class="lib-queue-row ${locked ? 'lib-queue-row--locked' : ''}" ${swipeRow(this._swipe, item.queue_id, swipeable)}>
                        <ag-library-cover
                            cover=${coverUrl(item.cover_token)}
                            fallback="track"
                            size="36"
                        ></ag-library-cover>
                        <div class="lib-queue-col">
                            <span class="lib-queue-col-t">${item.title}</span>
                            <span class="lib-queue-col-a">${item.artist ?? ''}${item.album ? ` — ${item.album}` : ''}</span>
                            <!-- BACKLOG: no specific name here — a queue item carries the origin
                                 kind but not the provider name, so two media servers or two
                                 stations read alike. The players show the name. See /BACKLOG.md. -->
                            ${mixed ? html`<ag-source-badge origin=${item.origin}></ag-source-badge>` : nothing}
                        </div>
                        ${locked
                            ? this._renderLock()
                            : html`<span class="lib-queue-dur">${fmtDuration(item.duration)}</span>`}
                        ${swipeable ? html`
                        <button class="lib-queue-more" @click=${() => !this._swipe.swiping && this._remove(item.queue_id)} aria-label="Remove">
                            <svg viewBox="0 0 24 24">${iconArrowLeft}</svg>
                        </button>` : nothing}
                    </div>
                </div>
            `})}

            <div style="height:12px"></div>
        `;
    }
}

customElements.define('ag-library-queue', AgLibraryQueue);
