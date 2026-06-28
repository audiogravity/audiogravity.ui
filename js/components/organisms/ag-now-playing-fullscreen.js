/**
 * @module AgNowPlayingFullscreen
 * @description Fullscreen player overlay. Opens via swipe-up (mobile) or expand
 * button (desktop) from ag-now-playing, triggered by the ``np-expand`` window event.
 *
 * Connects to GET /player/state SSE for live playback state.
 * Slides up from the bottom on open; slides down on close (back button or swipe-down).
 * Adds ``body.npfs-open`` while visible so the topbar can animate out.
 *
 * @element ag-now-playing-fullscreen
 *
 * @listens window:np-expand — Opens the fullscreen player
 * @fires   window:np-collapse — Dispatched when the fullscreen closes
 *
 * @dependency css/components/now-playing-fullscreen.css
 */

import { LitElement, html, nothing } from 'lit';
import { apiGet, apiPost } from '../../api.js';
import '../molecules/ag-sleep-timer.js';
import '../molecules/ag-playback-controls.js';
import '../molecules/ag-progress-bar.js';
import '../molecules/ag-format-strip.js';
import '../atoms/ag-connector-badge.js';
import '../atoms/ag-dsd-lock.js';
import '../atoms/ag-track-meta.js';
import { subscribePlayerState, subscribeRendererStatus } from '../../library-store.js';
import { coverUrl, fmtDuration, pickPrimaryCoverToken } from '../utils-lit.js';
import { extractDominantColor, isDsd, inTransition } from '../../player-utils.js';
import { getSleepTimer, setSleepTimer, cancelSleepTimer } from '../../player-api.js';
import { iconChevronDoubleDown, iconQueue, iconOutput, iconMusicNote } from '../../ag-icons.js';

const _ALLOWED_ACTIONS = new Set([
    'toggle', 'next', 'prev', 'seek',
    'set_volume', 'set_repeat', 'set_shuffle',
]);

// ── Drag-to-dismiss tuning (module-level so swipe handlers don't pay a
// class-static lookup per touchmove) ──
const SWIPE_COMMIT_PX   = 150;  // release past this distance commits the close
const SWIPE_REF_PX      = 600;  // normalisation denominator (≈ phone height)
const SWIPE_SCALE_MAX   = 0.08; // shrink up to 8 %
const SWIPE_RADIUS_MAX  = 24;   // corner radius up to 24 px
const SWIPE_OPACITY_MAX = 0.15; // fade up to 15 %
// Horizontal source-switch tuning
const SWIPE_SWITCH_COMMIT_PX  = 80;   // horizontal distance to commit a source switch
const SWIPE_SWITCH_RUBBER_MAX = 40;   // max translateX (px) during the rubberbanded drag
const SWIPE_DEAD_ZONE_PX      = 8;    // axis-lock dead-zone (shared with mini-player)

export class AgNowPlayingFullscreen extends LitElement {
    static properties = {
        _state:        { state: true },
        _open:         { state: true },
        _bgColor:      { state: true },
        _nextTrack:    { state: true },
        _sleepEnd:     { state: true },
        _coverSwapped: { state: true },
        /** All concurrently active sources — drives the dots source-switcher. */
        _sources:          { state: true },
        /** Latest renderer_status SSE payload — drives the renderer routing badge. */
        _rendererStatus:   { state: true },
        /** Cover token that failed to load — triggers placeholder fallback. */
        _coverErrorToken:  { state: true },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this._state        = null;
        this._open         = false;
        this._bgColor      = '';
        this._nextTrack    = null;
        this._sleepEnd     = null;
        this._coverErrorToken = null;
        // Reset on track / source / station change so a fresh listen always
        // starts in the canonical "station identity first" layout.
        this._coverSwapped = false;
        // Per-token tint cache so re-swapping doesn't re-run canvas reads.
        this._tintByToken  = new Map();
        this._sleepTimeout = null;
        this._unsubscribeState = null;
        this._prevTitle    = null;
        this._prevSourceId    = null;
        this._prevStationToken = null;
        this._targetSourceId  = null;
        /** @type {boolean} True when the user manually picked a source — suspends auto-follow. */
        this._userSourceOverride = false;
        this._touchStartY  = 0;
        this._touchStartX  = 0;
        /** 'dismiss' | 'switch' | null — locked after the dead-zone. */
        this._gestureType  = null;
        /** All concurrently active sources, populated from SSE state.sources. */
        this._sources      = [];
        this._panelEl      = null;
        this._prevCoverToken  = null;
        this._pendingColorUrl = null;
        this._licenseStatus     = 'no_license';
        this._rendererStatus    = null;
        this._controlRecentTime = null;
        this._unsubscribeRenderer = null;
        this._boundOpen      = (e) => this._openPlayer(e.detail?.source_id ?? null, e.detail?.item ?? null);
        this._boundLicStatus = (e) => { this._licenseStatus = e.detail?.status ?? 'no_license'; };
        this._boundTouchStart = this._onTouchStart.bind(this);
        this._boundTouchMove  = this._onTouchMove.bind(this);
        this._boundTouchEnd   = this._onTouchEnd.bind(this);
    }

    connectedCallback() {
        super.connectedCallback();
        window.addEventListener('np-expand', this._boundOpen);
        window.addEventListener('license-status', this._boundLicStatus);
        this._unsubscribeRenderer = subscribeRendererStatus((data) => {
            this._rendererStatus = data;
            // Keep "Up next" in sync with the renderer queue whenever the status
            // changes — avoids the timing race between the renderer_status SSE and
            // the player_state SSE that triggers _fetchNextTrack.
            if (data?.connected && !data.bypassed && data.queue_total != null) {
                this._nextTrack = data.queue_next_title != null
                    ? { title: data.queue_next_title, artist: data.queue_next_artist ?? null, album: data.queue_next_album ?? null, cover_token: data.queue_next_cover_token ?? null }
                    : null;
            } else if (!data?.connected) {
                // Renderer went offline — clear stale "Up next" entry
                // so the strip does not show a track from a queue that no longer exists.
                this._nextTrack = null;
            }
        });
        // Fetch initial renderer status so the badge shows immediately on open.
        apiGet('/upnp-renderer/known')
            .then(known => {
                const active = known?.find(r => r.active);
                return active?.udn ? apiGet(`/upnp-renderer/${active.udn}/status`) : null;
            })
            .then(d => { if (d) this._rendererStatus = d; })
            .catch(() => {});
        // Restore any backend-armed sleep timer (e.g. set before the app
        // was reloaded / closed). The backend is authoritative.
        this._syncSleepTimer();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        window.removeEventListener('np-expand', this._boundOpen);
        window.removeEventListener('license-status', this._boundLicStatus);
        this._unsubscribeRenderer?.();
        this._closeSse();
        // Only clear the local UI timeout — the backend timer must keep running.
        this._clearLocalSleepTimeout();
        this._pendingColorUrl = null;
    }

    // ------------------------------------------------------------------
    // Open / close
    // ------------------------------------------------------------------

    _isLicensed() {
        return this._licenseStatus !== 'starter' && this._licenseStatus !== 'version_expired';
    }

    /**
     * Seed an immediate partial state from a NowPlayingItem so the fullscreen renders
     * without a flash while the SSE delivers the full PlayerState.
     * Fields unavailable in NowPlayingItem (format, signal_path) are left null and
     * will be populated by the first SSE event.
     * @param {object} item - NowPlayingItem from the mini-player poll.
     */
    _seedStateFromItem(item) {
        this._state = {
            source_id:        item.source_id,
            origin:           item.origin ?? null,
            origin_name:      item.origin_name ?? null,
            title:            item.title,
            artist:           item.artist,
            album:            item.album,
            year:             item.year ?? null,
            cover_token:      item.cover_token ?? null,
            station_logo_token: item.station_logo_token ?? null,
            playing:          item.playback_status === 'Playing',
            playback_status:  item.playback_status,
            elapsed:          item.elapsed ?? 0,
            duration:         item.duration ?? 0,
            volume:           item.volume ?? null,
            repeat:           item.repeat ?? false,
            shuffle:          item.shuffle ?? false,
            can_next:         item.can_next ?? false,
            can_prev:         item.can_prev ?? false,
            can_seek:         item.can_seek ?? false,
            can_set_volume:   item.can_set_volume ?? false,
            format:           null,
            signal_path:      null,
            output_label:     null,
            output_connector: null,
            sources:          null,
        };
    }

    _openPlayer(sourceId = null, item = null) {
        if (!this._isLicensed()) {
            document.querySelector('ag-tabs')?.selectTab('admin');
            if (this._licenseStatus === 'starter' && window.EventEmitter)
                window.EventEmitter.emit('show-license-modal');
            return;
        }
        this._targetSourceId = sourceId;
        this._userSourceOverride = false;
        if (sourceId && this._state?.source_id !== sourceId) {
            // Different source — seed from the mini-player item or clear.
            if (item) this._seedStateFromItem(item);
            else this._state = null;
        }
        // Same source reopened — keep existing _state (preserves elapsed).
        this._open = true;
        document.body.classList.add('npfs-open');
        this._connectSse();
        // Attach touch listeners after render
        this.updateComplete.then(() => {
            this._panelEl = this.querySelector('.npfs-panel');
            if (this._panelEl) {
                this._panelEl.addEventListener('touchstart', this._boundTouchStart, { passive: false });
                this._panelEl.addEventListener('touchmove',  this._boundTouchMove,  { passive: false });
                this._panelEl.addEventListener('touchend',   this._boundTouchEnd,   { passive: true });
            }
        });
    }

    _closePlayer() {
        const panel = this._panelEl ?? this.querySelector('.npfs-panel');
        if (panel) {
            // Animate the three props the drag was driving so the close
            // finishes the in-flight visual state (scale, fade, radius)
            // instead of snapping to its terminal value.
            panel.style.transition = 'transform 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.35s ease, border-radius 0.35s ease';
            panel.style.transform  = 'translateY(100%) scale(1)';
            panel.style.opacity      = '';
            panel.style.borderRadius = '';
        }
        if (this._panelEl) {
            this._panelEl.removeEventListener('touchstart', this._boundTouchStart);
            this._panelEl.removeEventListener('touchmove',  this._boundTouchMove);
            this._panelEl.removeEventListener('touchend',   this._boundTouchEnd);
            this._panelEl = null;
        }
        setTimeout(() => {
            this._open       = false;
            this._bgColor    = '';
            this._nextTrack  = null;
            this._prevTitle  = null;
            this._prevSourceId = null;
            this._prevStationToken = null;
            this._prevCoverToken = null;
            this._coverSwapped = false;
            document.body.classList.remove('npfs-open');
            this._closeSse();
            window.dispatchEvent(new CustomEvent('np-collapse'));
        }, 360);
    }

    // ------------------------------------------------------------------
    // SSE
    // ------------------------------------------------------------------

    _connectSse() {
        this._closeSse();
        this._unsubscribeState = subscribePlayerState(
            (state) => this._applyState(state),
            { sourceId: this._targetSourceId },
        );
    }

    _closeSse() {
        if (this._unsubscribeState) {
            this._unsubscribeState();
            this._unsubscribeState = null;
        }
    }

    /**
     * Auto-follow a newly active source without blanking the UI.
     * Unlike _switchSource (user-initiated), this keeps _state intact so there
     * is no loading flash — the displayed content stays visible while the SSE
     * reconnects to the new source_id.
     * @param {string} sourceId - Source that just became active.
     */
    _followSource(sourceId) {
        if (sourceId === this._targetSourceId) return;
        this._targetSourceId = sourceId;
        this._connectSse();
    }

    /**
     * Switch the fullscreen player to a different active source.
     * Clears current state immediately so the UI shows a loading placeholder
     * while the new SSE delivers its first event.
     * @param {string} sourceId - Target source_id to display.
     */
    _switchSource(sourceId) {
        if (sourceId === this._targetSourceId) return;
        this._userSourceOverride = true;
        this._targetSourceId   = sourceId;
        this._state            = null;
        this._nextTrack        = null;
        this._coverSwapped     = false;
        this._bgColor          = '';
        this._prevTitle        = null;
        this._prevSourceId     = null;
        this._prevStationToken = null;
        this._prevCoverToken   = null;
        this._connectSse();
    }

    _applyState(state) {
        // SSE pushes a title-less state during track transitions — keep previous state visible.
        if (!state.title && inTransition(this._controlRecentTime)) return;
        if (state.title) this._controlRecentTime = null;

        const trackChanged   = state.title !== this._prevTitle;
        const sourceChanged  = state.source_id !== this._prevSourceId;
        const stationChanged = state.station_logo_token !== this._prevStationToken;
        if (trackChanged && this._open) this._fetchNextTrack(state);
        if (trackChanged || sourceChanged || stationChanged) this._coverSwapped = false;
        // Reset the cover-error token on track change so a new cover is always
        // attempted, even if a previous track with the same token had a 404.
        if (trackChanged || sourceChanged) this._coverErrorToken = null;
        this._prevTitle         = state.title;
        this._prevSourceId      = state.source_id;
        this._prevStationToken  = state.station_logo_token;
        // state.sources lists all configured sources; filter to those with active
        // playback so dots mirror the mini-player's NowPlayingItem count.
        // Keep the freshest non-empty snapshot so dots remain stable across SSE
        // ticks where sources is omitted.
        const playing = state.sources?.filter(s => s.playing);
        if (playing?.length) this._sources = playing;
        // If the user had overridden the source, lift the override when their
        // chosen source stops playing so auto-follow resumes.
        if (this._userSourceOverride && !this._sources.find(s => s.source_id === this._targetSourceId)) {
            this._userSourceOverride = false;
            // Immediately follow the new active source. The current SSE tick comes
            // from the now-dead source (state.playing is false), so we cannot rely
            // on the condition below — use _sources directly instead.
            const next = this._sources.find(s => s.playing);
            if (next) this._followSource(next.source_id);
        }
        // Auto-follow: when the backend switches its active source (e.g. Roon
        // starts while MPD was displayed), update the dot and reconnect SSE
        // without blanking the UI — unless the user has manually navigated.
        if (!this._userSourceOverride && state.source_id && state.playing && state.source_id !== this._targetSourceId) {
            this._followSource(state.source_id);
        }
        // Preserve locally interpolated elapsed when the server reports 0
        // (AirPlay/shairport-sync never provides a real position).
        if (state.elapsed === 0 && this._state?.elapsed > 0
            && state.source_id === this._state.source_id) {
            state = { ...state, elapsed: this._state.elapsed };
        }
        this._state             = state;
        this._setPrimaryCover(pickPrimaryCoverToken(state, { swapped: this._coverSwapped }));
    }

    _toggleCoverSwap = () => {
        const s = this._state;
        if (!s?.station_logo_token || !s?.cover_token) return;
        // Identical tokens (degenerate case) → swap is a visual no-op.
        if (s.station_logo_token === s.cover_token) return;
        this._coverSwapped = !this._coverSwapped;
        this._setPrimaryCover(pickPrimaryCoverToken(s, { swapped: this._coverSwapped }));
    };

    /**
     * Set the primary cover token and refresh the background tint. Cached by
     * token in ``_tintByToken`` so re-swapping doesn't re-run canvas reads
     * for a previously extracted cover.
     */
    _setPrimaryCover(token) {
        if (!token || token === this._prevCoverToken) return;
        this._prevCoverToken = token;
        const cached = this._tintByToken.get(token);
        if (cached) {
            this._bgColor = cached;
            return;
        }
        this._extractDominantColor(coverUrl(token), token);
    }

    async _extractDominantColor(url, token = null) {
        this._pendingColorUrl = url;
        const rgb = await extractDominantColor(url);
        if (!rgb || this._pendingColorUrl !== url) return;
        const tint = `rgb(${rgb.r} ${rgb.g} ${rgb.b})`;
        this._bgColor = tint;
        if (token) this._tintByToken.set(token, tint);
    }

    // ------------------------------------------------------------------
    // Sleep timer
    // ------------------------------------------------------------------

    /**
     * Arm the sleep timer. The backend owns the authoritative timeout so the
     * pause fires even if this client closes. The local `setTimeout` is a
     * UI-only fallback that pauses instantly if the app happens to be open
     * at expiry — idempotent with the backend pause.
     */
    async _setSleepTimer(minutes) {
        this._clearLocalSleepTimeout();
        try {
            const { sleep_end } = await setSleepTimer(minutes);
            this._sleepEnd = sleep_end ? new Date(sleep_end).getTime() : null;
            this._armLocalSleepTimeout();
        } catch (e) {
            console.error('[npfs] set sleep timer failed:', e);
        }
    }

    async _cancelSleepTimer() {
        this._clearLocalSleepTimeout();
        this._sleepEnd = null;
        try { await cancelSleepTimer(); }
        catch (e) { console.error('[npfs] cancel sleep timer failed:', e); }
    }

    /**
     * Local UI timeout that clears `_sleepEnd` at expiry so the countdown
     * disappears without waiting for the next SSE state push. Does NOT issue
     * a transport command — the backend is the single source of truth for
     * the pause (otherwise we'd race the backend's own toggle and risk
     * re-resuming playback).
     */
    _armLocalSleepTimeout() {
        if (!this._sleepEnd) return;
        const ms = this._sleepEnd - Date.now();
        if (ms <= 0) {
            this._sleepEnd = null;
            return;
        }
        this._sleepTimeout = setTimeout(() => {
            this._sleepTimeout = null;
            this._sleepEnd     = null;
        }, ms);
    }

    _clearLocalSleepTimeout() {
        if (this._sleepTimeout) {
            clearTimeout(this._sleepTimeout);
            this._sleepTimeout = null;
        }
    }

    async _syncSleepTimer() {
        try {
            const { sleep_end } = await getSleepTimer();
            const next = sleep_end ? new Date(sleep_end).getTime() : null;
            if (next === this._sleepEnd) return;
            this._clearLocalSleepTimeout();
            this._sleepEnd = next;
            this._armLocalSleepTimeout();
        } catch (_) {
            // Non-blocking — the timer will simply not display.
        }
    }

    // ------------------------------------------------------------------
    // Up Next
    // ------------------------------------------------------------------

    async _fetchNextTrack(state) {
        const s = state ?? this._state;
        if (!s?.source_id || s.source_id === 'src_hqplayer') return;

        // When the UPnP renderer is active and routing, use the queue info the
        // backend exposes in renderer_status (updated live via SSE) instead of the
        // MPD queue — which is always empty when tracks are sent via AVTransport.
        const rs = this._rendererStatus;
        if (rs?.connected && !rs.bypassed && rs.queue_next_title != null) {
            this._nextTrack = {
                title:       rs.queue_next_title,
                artist:      rs.queue_next_artist      ?? null,
                album:       rs.queue_next_album       ?? null,
                cover_token: rs.queue_next_cover_token ?? null,
            };
            return;
        }
        if (rs?.connected && !rs.bypassed && rs.queue_total != null) {
            // Renderer queue active but no next track (end of queue).
            this._nextTrack = null;
            return;
        }

        try {
            const params = new URLSearchParams({ source_id: s.source_id });
            if (s.zone_id) params.set('zone_id', s.zone_id);
            const queue = await apiGet(`/library/queue?${params}`);
            const items = queue?.items ?? [];
            const curIdx = items.findIndex(i => i.is_current);
            this._nextTrack = curIdx >= 0 ? (items[curIdx + 1] ?? null) : null;
        } catch (_) {
            this._nextTrack = null;
        }
    }


    // ------------------------------------------------------------------
    // Hi-res label helper
    // ------------------------------------------------------------------

    _hiResLabel(fmt) {
        if (!fmt) return null;
        const f  = (fmt.format || '').toUpperCase();
        const sr = parseFloat(fmt.sample_rate || '0');
        if (f.includes('DSD')) return fmt.format;
        if (f.includes('MQA')) return 'MQA';
        if (sr >= 88.2) return 'Hi·Res';
        return null;
    }

    // ------------------------------------------------------------------
    // Transport
    // ------------------------------------------------------------------

    async _control(action, value) {
        if (!_ALLOWED_ACTIONS.has(action)) return;
        if (action === 'toggle' && this._state) {
            this._state = { ...this._state,
                playing: !this._state.playing,
                playback_status: !this._state.playing ? 'Playing' : 'Paused',
            };
        }
        // When the renderer has an active queue, route next/prev directly to the
        // renderer instead of MPD — MPD only holds one track and would stop.
        const rs = this._rendererStatus;
        const rendererQueueActive = rs?.connected && rs?.queue_total != null;
        if (rendererQueueActive && (action === 'next' || action === 'prev')) {
            const udn = rs.renderer_udn;
            if (udn) {
                try {
                    this._controlRecentTime = Date.now();
                    await apiPost(`/upnp-renderer/${udn}/${action}`);
                } catch (e) {
                    console.error('[npfs] renderer queue control failed:', e);
                }
                return;
            }
        }
        try {
            const body = { action };
            if (value !== undefined) body.value = value;
            if (this._targetSourceId) body.source_id = this._targetSourceId;
            if (action === 'next' || action === 'prev') this._controlRecentTime = Date.now();
            await apiPost('/player/control', body);
        } catch (e) {
            console.error('[npfs] control failed:', e);
        }
    }

    // ------------------------------------------------------------------
    // Swipe gestures (dismiss vertical / source-switch horizontal)
    // ------------------------------------------------------------------

    _onTouchStart(e) {
        if (e.touches.length !== 1) {
            // Multi-touch — reset any in-flight gesture so a subsequent
            // single-finger touch starts clean.
            this._gestureType = null;
            return;
        }
        this._touchStartY  = e.touches[0].clientY;
        this._touchStartX  = e.touches[0].clientX;
        this._gestureType  = null;
        if (this._panelEl) {
            // Kill any in-flight CSS animation (the .npfs-panel--enter slide-in
            // uses animation-fill-mode: both, which on iOS Safari keeps the
            // keyframe's transform as the computed value and silently overrides
            // inline ``style.transform`` writes during the drag).
            this._panelEl.style.animation  = 'none';
            this._panelEl.style.transition = 'none';
            this._panelEl.style.willChange = 'transform, opacity, border-radius';
        }
    }

    /** Apply "card iOS" physical feedback during a downward dismiss swipe. */
    _applySwipeProgress(dy) {
        if (!this._panelEl) return;
        const progress = Math.min(dy / SWIPE_REF_PX, 1);
        const scale   = 1 - SWIPE_SCALE_MAX   * progress;
        const radius  =     SWIPE_RADIUS_MAX  * progress;
        const opacity = 1 - SWIPE_OPACITY_MAX * progress;
        this._panelEl.style.transform    = `translateY(${dy}px) scale(${scale})`;
        this._panelEl.style.borderRadius = `${radius}px`;
        this._panelEl.style.opacity      = opacity;
    }

    _onTouchMove(e) {
        const dy    = e.touches[0].clientY - this._touchStartY;
        const dx    = e.touches[0].clientX - this._touchStartX;
        const absDX = Math.abs(dx);
        const absDY = Math.abs(dy);

        // Lock gesture direction once past dead-zone.
        if (this._gestureType === null) {
            if (absDX < SWIPE_DEAD_ZONE_PX && absDY < SWIPE_DEAD_ZONE_PX) return;
            if (absDX > absDY && this._sources.length > 1) {
                this._gestureType = 'switch';
            } else if (dy > 0) {
                // Pull-down dismiss only from the top of the scroll area; if the
                // content is scrolled down, a downward swipe must scroll it back up,
                // not dismiss the player.
                const sc = e.target?.closest?.('.npfs-scroll');
                this._gestureType = (sc && sc.scrollTop > 0) ? 'ignore' : 'dismiss';
            } else {
                this._gestureType = 'ignore';
            }
        }

        if (this._gestureType === 'dismiss') {
            if (dy <= 0) return;
            e.preventDefault();
            this._applySwipeProgress(dy);
        } else if (this._gestureType === 'switch') {
            e.preventDefault();
            if (this._panelEl) {
                // Rubberbanded translateX — resistance increases as finger travels further.
                const rubber = Math.sign(dx) * Math.min(absDX * 0.3, SWIPE_SWITCH_RUBBER_MAX);
                this._panelEl.style.transform = `translateX(${rubber}px)`;
            }
        }
    }

    _onTouchEnd(e) {
        const dy = e.changedTouches[0].clientY - this._touchStartY;
        const dx = e.changedTouches[0].clientX - this._touchStartX;

        if (this._gestureType === 'dismiss') {
            if (dy > SWIPE_COMMIT_PX) {
                // Commit — _closePlayer's transition covers transform / opacity /
                // border-radius so the in-flight visual state finishes coherently.
                this._closePlayer();
            } else if (this._panelEl) {
                // Snap back — animate every prop the swipe was driving.
                this._panelEl.style.transition   = 'transform 0.25s ease, border-radius 0.25s ease, opacity 0.25s ease';
                this._panelEl.style.transform    = 'translateY(0) scale(1)';
                this._panelEl.style.borderRadius = '';
                this._panelEl.style.opacity      = '';
                this._panelEl.style.willChange   = '';
            }
        } else if (this._gestureType === 'switch' && Math.abs(dx) > SWIPE_SWITCH_COMMIT_PX
                   && this._sources.length > 0) {
            const curIdx = this._sources.findIndex(s => s.source_id === this._targetSourceId);
            const base   = curIdx >= 0 ? curIdx : 0;
            const newIdx = dx < 0
                ? (base + 1) % this._sources.length
                : (base - 1 + this._sources.length) % this._sources.length;
            if (this._panelEl) {
                this._panelEl.style.transition = 'transform 0.2s ease';
                this._panelEl.style.transform  = 'translateX(0)';
                this._panelEl.style.willChange = '';
            }
            this._switchSource(this._sources[newIdx].source_id);
        } else {
            // Snap back from any incomplete or cancelled gesture.
            const panel = this._panelEl ?? this.querySelector('.npfs-panel');
            if (panel) {
                panel.style.transition   = 'transform 0.2s ease, border-radius 0.2s ease, opacity 0.2s ease';
                panel.style.transform    = 'translateX(0) translateY(0) scale(1)';
                panel.style.borderRadius = '';
                panel.style.opacity      = '';
                panel.style.willChange   = '';
            }
        }
        this._gestureType = null;
    }

    // ------------------------------------------------------------------
    // Computed state
    // ------------------------------------------------------------------

    /** @returns {boolean} True when the UPnP renderer is the active audio destination. */
    get _rendererActive() {
        return !!(this._rendererStatus?.connected && !this._rendererStatus?.bypassed);
    }

    // ------------------------------------------------------------------
    // Render helpers
    // ------------------------------------------------------------------

    /**
     * Render source-switcher dots. Hidden when only one source is active.
     * Each dot represents a concurrently active source; tap or swipe to switch.
     */
    _renderDots() {
        if (this._sources.length <= 1) return nothing;
        return html`
            <div class="npfs-dots" aria-label="Active sources">
                ${this._sources.map(src => html`
                    <div
                        class="npfs-dot ${src.source_id === this._targetSourceId ? 'npfs-dot--active' : ''}"
                        role="button"
                        tabindex="0"
                        aria-label=${src.display_name ?? src.source_id}
                        title=${src.display_name ?? src.source_id}
                        @click=${() => this._switchSource(src.source_id)}
                        @keydown=${(e) => e.key === 'Enter' && this._switchSource(src.source_id)}
                    ></div>
                `)}
            </div>
        `;
    }

    _renderCover(s) {
        // Radio dual-cover: track cover is canonical, station logo is the
        // overlay (and clickable to swap). When only the station logo is
        // available, it takes the main slot and no overlay is rendered.
        const primaryToken   = pickPrimaryCoverToken(s, { swapped: this._coverSwapped });
        const secondaryToken = s?.station_logo_token && s?.cover_token
            ? pickPrimaryCoverToken(s, { swapped: !this._coverSwapped })
            : null;
        const primary = coverUrl(primaryToken);
        const overlay = coverUrl(secondaryToken);
        const swapLabel = this._coverSwapped ? 'Show track cover' : 'Show station logo';

        const dur     = s?.duration ?? 0;
        const tn      = s?.track_number;
        const hiLabel = this._hiResLabel(s?.format);
        const tnLabel = tn
            ? `A${Math.ceil(parseInt(tn) / 10)} · TRACK ${tn.toString().padStart(2, '0')}`
            : null;

        // A hidden probe <img> detects 404s on the CSS background-image URL (CSS
        // background-image errors are silent — there is no onerror event on the div).
        const coverFailed = primary && this._coverErrorToken === primaryToken;
        const showCover   = primary && !coverFailed;

        return html`
            <div class="npfs-cover-wrap">
                <div class="npfs-cover" style=${showCover ? `background-image:url('${primary}')` : ''}>
                    ${showCover ? html`
                        <img src="${primary}" style="display:none" alt=""
                             @error=${() => { this._coverErrorToken = primaryToken; }}>
                    ` : nothing}
                    ${!showCover ? html`
                        <div class="npfs-cover-placeholder">
                            <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconMusicNote}</svg>
                        </div>
                    ` : nothing}
                    ${overlay ? html`
                        <button class="npfs-cover-overlay"
                                aria-label=${swapLabel}
                                title=${swapLabel}
                                @click=${this._toggleCoverSwap}
                                style="background-image:url('${overlay}')"></button>
                    ` : nothing}
                    ${tnLabel  ? html`<div class="npfs-cover-corner">${tnLabel}</div>` : nothing}
                    ${dur      ? html`<div class="npfs-cover-corner right">${fmtDuration(dur)}</div>` : nothing}
                    ${hiLabel  ? html`<div class="npfs-cover-hires">${hiLabel}</div>` : nothing}
                </div>
            </div>
        `;
    }

    _renderMeta(s) {
        const hasSignal = s?.signal_path?.length || s?.output_label;
        return html`
            <div class="npfs-meta">
                ${s?.origin || s?.source_name || hasSignal || this._rendererActive ? html`
                    <div class="npfs-source-row">
                        ${s?.origin
                            ? html`<ag-source-badge .origin=${s.origin} .name=${s.origin_name ?? ''}></ag-source-badge>`
                            : s?.source_name ? html`
                                <div class="npfs-source-badge">
                                    <span class="npfs-source-dot"></span>
                                    ${s.source_name.toUpperCase()}
                                </div>
                            ` : nothing}
                        ${hasSignal ? this._renderSignalPath(s?.signal_path, s?.output_label) : nothing}
                        ${!hasSignal && this._rendererActive ? html`
                            <span class="np-renderer-badge npfs-renderer-badge"
                                  title="Routed to UPnP renderer">
                                → ${this._rendererStatus?.renderer_name ?? 'Renderer'}
                            </span>
                        ` : nothing}
                    </div>
                ` : nothing}
                <ag-track-meta show-album
                    .title=${s?.title ?? ''}
                    .artist=${s?.artist ?? ''}
                    .album=${s?.album ?? ''}
                    .year=${s?.year ?? null}
                    placeholder-title="Nothing playing"
                ></ag-track-meta>
            </div>
        `;
    }

    /**
     * Render the audio signal path, or a single-hop fallback when topology data is unavailable.
     * @param {Array|null} steps - Ordered signal path steps from PlayerState.
     * @param {string|null} outputLabel - DAC/output label, used as fallback when steps is empty.
     */
    _renderSignalPath(steps, outputLabel) {
        if (steps?.length) {
            return html`
                <div class="npfs-signal-path">
                    ${steps.map((step, i) => html`
                        <span class="npfs-sp-step">
                            <span class="npfs-sp-dot"></span>
                            ${step.label}
                        </span>
                        ${i < steps.length - 1 ? html`<span class="npfs-sp-arrow">→</span>` : nothing}
                    `)}
                </div>
            `;
        }
        if (outputLabel) {
            return html`
                <div class="npfs-signal-path">
                    <span class="npfs-sp-arrow">→</span>
                    <span class="npfs-sp-step">
                        <span class="npfs-sp-dot"></span>
                        ${outputLabel}
                    </span>
                </div>
            `;
        }
        return nothing;
    }

    _renderProgress(s) {
        return html`
            <ag-progress-bar
                style="flex:none"
                .serverElapsed=${s?.elapsed ?? 0}
                .duration=${s?.duration ?? 0}
                ?can-seek=${s?.can_seek ?? false}
                ?playing=${s?.playing ?? false}
                .title=${s?.title ?? ''}
                @seek=${(e) => this._control('seek', e.detail.secs)}
            ></ag-progress-bar>
        `;
    }

    _renderOutputBar(s) {
        const label = s?.output_label ?? 'No output selected';
        return html`
            <div class="npfs-output-bar">
                <div class="npfs-out-info">
                    <span class="npfs-out-icon">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5">
                            ${iconOutput}
                        </svg>
                    </span>
                    <div class="npfs-out-col">
                        <span class="npfs-out-label">Output → DAC</span>
                        <div class="npfs-out-value-row">
                            <span class="npfs-out-value">${label}</span>
                            ${s?.output_connector
                                ? html`<ag-connector-badge .connector=${s.output_connector}></ag-connector-badge>`
                                : nothing}
                        </div>
                    </div>
                </div>
                <button class="npfs-switch-btn"
                    @click=${() => {
                        // Pass the source currently shown in the fullscreen so the library
                        // opens the OUTPUTS view pinned to *that* source — not whatever
                        // the library considers its active source.
                        const source_id = this._state?.source_id;
                        this._closePlayer();
                        window.dispatchEvent(new CustomEvent('lib-goto', {
                            detail: { view: 'outputs', source_id },
                        }));
                    }}>
                    Switch
                </button>
            </div>
        `;
    }

    _renderUpNext() {
        const t = this._nextTrack;
        if (!t) return nothing;
        const cover = t.cover_token ? coverUrl(t.cover_token) : null;
        return html`
            <div class="npfs-up-next">
                <span class="npfs-up-next-lbl">Next</span>
                <div class="npfs-up-next-cv">
                    <svg class="npfs-up-next-cv-ph" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                        ${iconMusicNote}
                    </svg>
                    ${cover ? html`<img src=${cover} alt="" @error=${e => e.target.remove()}>` : nothing}
                </div>
                <div class="npfs-up-next-info">
                    <span class="npfs-up-next-title">${t.title ?? '—'}</span>
                    ${t.artist ? html`<span class="npfs-up-next-artist">${t.artist}</span>` : nothing}
                </div>
            </div>
        `;
    }

    // ------------------------------------------------------------------
    // Main render
    // ------------------------------------------------------------------

    render() {
        if (!this._open) return nothing;

        const s = this._state;

        const bgStyle = this._bgColor
            ? `--npfs-bg: ${this._bgColor}`
            : '';

        return html`
            <div class="npfs-panel npfs-panel--enter" style=${bgStyle}>
                <div class="npfs-header">
                    <button class="npfs-back" @click=${() => this._closePlayer()} aria-label="Close player">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
                            stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            ${iconChevronDoubleDown}
                        </svg>
                    </button>
                    <span class="npfs-title">Now Playing</span>
                    <div class="npfs-header-actions">
                        <button class="npfs-header-btn" title="Queue"
                            @click=${() => { this._closePlayer(); window.dispatchEvent(new CustomEvent('lib-goto', { detail: { view: 'queue' } })); }}>
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                                ${iconQueue}
                            </svg>
                        </button>
                        <ag-sleep-timer
                            ?playing=${s?.playing ?? false}
                            .sleepEnd=${this._sleepEnd}
                            @sleep-set=${(e) => this._setSleepTimer(e.detail.minutes)}
                            @sleep-cancel=${() => this._cancelSleepTimer()}
                        ></ag-sleep-timer>
                    </div>
                </div>

                ${this._renderDots()}

                <div class="npfs-scroll">
                    ${this._renderCover(s)}
                    ${this._renderMeta(s)}
                    <ag-format-strip .format=${s?.format ?? null}></ag-format-strip>
                    <div class="npfs-controls-row">
                        <ag-playback-controls
                            ?playing=${s?.playing ?? false}
                            ?can-next=${(() => {
                                const rs = this._rendererStatus;
                                return rs?.connected && !rs.bypassed && rs.queue_total != null
                                    ? rs.queue_next_title != null
                                    : (s?.can_next ?? false);
                            })()}
                            ?can-prev=${(() => {
                                const rs = this._rendererStatus;
                                return rs?.connected && !rs.bypassed && rs.queue_total != null
                                    ? (rs.queue_position ?? 0) > 0
                                    : (s?.can_prev ?? false);
                            })()}
                            ?repeat=${s?.repeat ?? false}
                            ?shuffle=${s?.shuffle ?? false}
                            @playback-control=${(e) => this._control(e.detail.action, e.detail.value)}
                        ></ag-playback-controls>
                        ${s?.can_set_volume && (!isDsd(s?.format) || s?.source_id === 'src_hqplayer') ? html`
                            <div class="npfs-controls-vol">
                                <ag-volume-popover
                                    .volume=${s.volume ?? 0}
                                    @volume-change=${(e) => this._control('set_volume', e.detail.volume)}
                                ></ag-volume-popover>
                            </div>
                        ` : nothing}
                        ${isDsd(s?.format) && s?.source_id !== 'src_hqplayer' ? html`<ag-dsd-lock class="npfs-dsd-lock"></ag-dsd-lock>` : nothing}
                    </div>
                    ${this._renderProgress(s)}
                    ${this._renderUpNext()}
                    ${this._renderOutputBar(s)}
                </div>
            </div>
        `;
    }
}

customElements.define('ag-now-playing-fullscreen', AgNowPlayingFullscreen);
