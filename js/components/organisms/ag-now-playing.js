import { LitElement, html, nothing } from 'lit';
import { apiGet, apiPost } from '../../api.js';
import { subscribePlayerState, subscribeRendererStatus, getOfflinePlayerSnapshot } from '../../library-store.js';
import { coverUrl, pickPrimaryCoverToken } from '../utils-lit.js';
import { extractDominantColor, isDsd, inTransition } from '../../player-utils.js';
import { iconChevronUp, iconMusicNote, iconRepeat, iconShuffle, iconSkipBack, iconUpNext, iconPause, iconPlay, iconVolume } from '../../ag-icons.js';
import '../molecules/ag-progress-bar.js';
import '../atoms/ag-connector-badge.js';
import '../atoms/ag-dsd-lock.js';
import '../atoms/ag-track-meta.js';

/**
 * @module AgNowPlaying
 * @description Sticky "Now Playing" banner that shows all active audio sources
 * and provides transport controls (play/pause, next, volume).
 *
 * Placed above the footer, it updates `--now-playing-height` on `:root` via
 * ResizeObserver so `.main-content` can adjust its bottom inset automatically.
 *
 * Supported sources: MPD, AirPlay (shairport-sync), Spotify (librespot),
 * Roon Bridge (mono-sgen), UPnP (upmpdcli).
 *
 * Swipe gestures (mobile):
 * - Swipe down on the banner: dismiss (slides off screen downward)
 * - Tap or swipe up on the pull-tab that appears after dismissal: re-open
 * The banner auto-reappears when playback starts from idle.
 *
 * @element ag-now-playing
 *
 * @dependency api.js - apiGet / apiPost for now-playing and control endpoints
 * @dependency css/layout.css - Sets --now-playing-height on :root
 */
export class AgNowPlaying extends LitElement {
    static properties = {
        /** @type {Array} Active now-playing items from the backend */
        _items: { state: true },
        /** @type {boolean} Whether any source is currently active */
        _hasItems: { state: true },
        /** @type {boolean} Whether the banner was dismissed by a swipe gesture */
        _dismissed: { state: true },
        /** @type {string|null} source_id whose detail popover is currently open */
        _detailOpenId: { state: true },
        /** @type {Map<string, Array>} Tracklist per source_id */
        _albumTracks: { state: true },
        /** @type {number} Index of the currently displayed source (multi-source swipe) */
        _activeSourceIdx: { state: true },
        /** @type {Map<string, string>} Dominant color per cover_token */
        _bgColors: { state: true },
        /** @type {Set<string>} Cover tokens whose image URL failed to load (404/network). */
        _brokenCovers: { state: true },
        /** @type {string} License status for gating controls */
        _licenseStatus: { state: true },
        /** @type {object|null} Latest renderer_status SSE payload (null if no renderer) */
        _rendererStatus: { state: true },
        /** @type {boolean} True when the browser has no network connectivity. */
        _offline: { state: true },
    };

    constructor() {
        super();
        this._items = [];
        this._hasItems = false;
        this._dismissed = false;
        this._detailOpenId = null;
        this._albumTracks = new Map();
        this._activeSourceIdx = 0;
        /** @type {boolean} True when the user manually navigated sources — suspends auto-follow. */
        this._userSourceOverride = false;
        this._bgColors = new Map();
        this._licenseStatus = 'no_license';
        this._rendererStatus = null;
        this._offline = !navigator.onLine;
        this._unsubscribeState = null;
        this._resizeObserver = null;
        /** @type {Set<string>} Tokens for which the dominant-color extraction has been run. */
        this._extractedColors = new Set();
        this._brokenCovers = new Set();
        // Touch state — dismiss / switch gestures
        this._touchStartX = 0;
        this._touchStartY = 0;
        this._touchIgnored = false;
        this._gestureType = null; // null | 'dismiss' | 'switch' | 'ignore'
        this._barEl = null;
        this._rafId = null;
        this._pendingTouchY = 0;
        this._pendingTouchX = 0;

        // Timer handle for post-control metadata refresh
        this._controlRecentTime = null;

        this._boundCloseDetail = this._closeDetailPopover.bind(this);
        /** @type {boolean} Whether the document click-outside listener for detail is active */
        this._detailListenerActive = false;

        // Pre-bind handlers — bar listeners use manual add/remove (passive: false requires explicit options match)
        this._boundTouchStart = this._handleTouchStart.bind(this);
        this._boundTouchMove = this._handleTouchMove.bind(this);
        this._boundTouchEnd = this._handleTouchEnd.bind(this);

        this._boundRestore   = () => { this._dismissed = false; this._reportHeight(); };
        this._boundLicStatus = (e) => { this._licenseStatus = e.detail?.status ?? 'no_license'; };
        this._unsubscribeRenderer = null;
        this._boundOnline  = () => { this._offline = false; };
        this._boundOffline = () => { this._offline = true; };
    }

    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        this._unsubscribeState = subscribePlayerState(state => this._onState(state));
        this._setupResizeObserver();

        this.addEventListener('touchstart', this._boundTouchStart, { passive: false });
        this.addEventListener('touchmove', this._boundTouchMove, { passive: false });
        this.addEventListener('touchend', this._boundTouchEnd, { passive: true });

        document.addEventListener('ag-np-restore', this._boundRestore);
        window.addEventListener('license-status', this._boundLicStatus);
        this._unsubscribeRenderer = subscribeRendererStatus((data) => { this._rendererStatus = data; });
        // Fetch initial renderer status so the badge is correct on load,
        // without waiting for the next SSE heartbeat (up to 30s delay).
        apiGet('/upnp-renderer/status').then(d => { this._rendererStatus = d; }).catch(() => {});

        // Online/offline connectivity listeners — drive the offline indicator.
        window.addEventListener('online',  this._boundOnline);
        window.addEventListener('offline', this._boundOffline);

        // Restore last known state from localStorage when starting offline so
        // the player is not empty on a cold load without network.
        if (!navigator.onLine && this._items.length === 0) {
            const saved = getOfflinePlayerSnapshot();
            if (saved) this._onState(saved);
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._unsubscribeState) { this._unsubscribeState(); this._unsubscribeState = null; }
        window.removeEventListener('online',  this._boundOnline);
        window.removeEventListener('offline', this._boundOffline);
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }
        if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
        document.removeEventListener('click', this._boundCloseDetail);
        window.removeEventListener('license-status', this._boundLicStatus);
        this._unsubscribeRenderer?.();

        // Options must match the addEventListener call to remove correctly
        this.removeEventListener('touchstart', this._boundTouchStart, { passive: false });
        this.removeEventListener('touchmove', this._boundTouchMove, { passive: false });
        this.removeEventListener('touchend', this._boundTouchEnd, { passive: true });

        document.removeEventListener('ag-np-restore', this._boundRestore);
    }

    updated(changedProperties) {
        if (changedProperties.has('_dismissed') || changedProperties.has('_hasItems')) {
            document.dispatchEvent(new CustomEvent('ag-np-state', {
                detail: { dismissed: this._dismissed, hasItems: this._hasItems }
            }));
            this._reportHeight();
        }

        // Check title/artist overflow for marquee scroll animation
        this.querySelectorAll('.np-track').forEach(el => {
            const overflow = el.scrollWidth - el.clientWidth;
            if (overflow > 0) {
                el.style.setProperty('--np-scroll-dist', `-${overflow}px`);
                el.classList.add('np-text--scroll');
            } else {
                el.classList.remove('np-text--scroll');
                el.style.removeProperty('--np-scroll-dist');
            }
        });
    }

    // ------------------------------------------------------------------
    // Polling
    // ------------------------------------------------------------------

    /** @returns {boolean} True within the transition guard window after a control action. */
    get _inTransition() {
        return inTransition(this._controlRecentTime);
    }

    /**
     * Handle a PlayerState event from the SSE stream.
     * Maps state.sources (enriched SourceInfo) to the _items array
     * that the template renders.
     */
    _onState(state) {
        if (!state?.sources) return;

        const items = state.sources.filter(s => s.playing).map(s => {
            // For the active source, prefer root state values (fresher than
            // the stabilized SourceInfo which may lag by a few poll cycles).
            if (s.active && state.source_id === s.source_id) {
                return { ...s,
                    volume: state.volume ?? s.volume,
                    can_set_volume: state.can_set_volume ?? s.can_set_volume,
                    elapsed: state.elapsed ?? s.elapsed,
                };
            }
            return s;
        });

        // Don't collapse during the post-control transition guard.
        if (items.length === 0 && this._inTransition) return;

        const wasEmpty = !this._hasItems;

        // Capture the user's chosen source BEFORE replacing _items so the
        // override-lift check below identifies the right source_id even after
        // the index is clamped to fit the shorter new list.
        const prevShownId = this._userSourceOverride
            ? this._items[this._activeSourceIdx]?.source_id
            : null;

        this._items = items;
        this._hasItems = items.length > 0;

        if (wasEmpty && this._hasItems) {
            this._dismissed = false;
            this._reportHeight();
        }

        for (const item of items) {
            const token = pickPrimaryCoverToken(item, { preferStation: true });
            if (!token || this._extractedColors.has(token)) continue;
            this._extractedColors.add(token);
            this._extractDominantColor(token);
        }

        if (this._activeSourceIdx >= items.length) this._activeSourceIdx = 0;

        // If the user had overridden the source, check if their chosen source
        // is still playing. If not, lift the override so auto-follow resumes.
        if (this._userSourceOverride) {
            if (!prevShownId || !items.find(s => s.source_id === prevShownId)) {
                this._userSourceOverride = false;
            }
        }

        // Auto-follow: switch to the backend-active source unless the user
        // has manually navigated to a different source.
        if (!this._userSourceOverride) {
            const activeIdx = items.findIndex(s => s.active);
            if (activeIdx !== -1 && activeIdx !== this._activeSourceIdx) {
                this._activeSourceIdx = activeIdx;
            }
        }
    }

    /**
     * Extract a dominant tint from a cover and store it in `_bgColors` keyed
     * by token. Uses the backend cover URL directly — the browser handles
     * caching, CORS is required so the canvas can read pixels.
     * @param {string} token
     */
    async _extractDominantColor(token) {
        const url = coverUrl(token);
        if (!url) return;
        const rgb = await extractDominantColor(url);
        if (!rgb) return;
        this._bgColors = new Map(this._bgColors).set(token, `rgb(${rgb.r} ${rgb.g} ${rgb.b} / 0.18)`);
    }

    // ------------------------------------------------------------------
    // Layout height reporting
    // ------------------------------------------------------------------

    _setupResizeObserver() {
        this._resizeObserver = new ResizeObserver(() => this._reportHeight());
        this._resizeObserver.observe(this);
        // Also observe the fixed bar directly (ag-now-playing has 0 layout height)
        this.updateComplete.then(() => {
            const bar = this.querySelector('.now-playing-bar');
            if (bar) this._resizeObserver.observe(bar);
        });
    }

    _reportHeight() {
        const bar = this.querySelector('.now-playing-bar');
        const h = (this._hasItems && !this._dismissed && bar) ? bar.getBoundingClientRect().height : 0;
        document.documentElement.style.setProperty('--now-playing-height', `${h}px`);
    }

    // ------------------------------------------------------------------
    // Controls
    // ------------------------------------------------------------------

    _isLicensed() {
        return this._licenseStatus !== 'starter' && this._licenseStatus !== 'version_expired';
    }

    async _sendControl(sourceId, action, volume = null, item = null) {
        if (!this._isLicensed()) {
            document.querySelector('ag-tabs')?.selectTab('admin');
            if (this._licenseStatus === 'starter' && window.EventEmitter)
                window.EventEmitter.emit('show-license-modal');
            return;
        }
        // Optimistic update: toggle playback_status locally before the server
        // confirms, so the progress bar stops/starts immediately.
        // Replace _items with a new array so Lit detects the state change.
        if (action === 'toggle' && item) {
            const isPlaying = item.playback_status === 'Playing';
            item.playback_status = isPlaying ? 'Paused' : 'Playing';
            this._items = [...this._items];
        }
        try {
            const body = { source_id: sourceId, action };
            if (action === 'seek' && volume !== null) {
                body.seek_position = volume;
            } else if (volume !== null) {
                body.volume = volume;
            }
            if (item?.zone_id) body.zone_id = item.zone_id;
            if (item?.output_id) body.output_id = item.output_id;
            await apiPost('/audio_pipeline/control', body);
            this._controlRecentTime = Date.now();
        } catch (_e) {
            // ignore
        }
    }

    /**
     * Toggle the album detail popover for a given source.
     * Fetches the tracklist on first open.
     * @param {string} sourceId
     * @param {Event} e
     */
    _toggleDetailPopover(sourceId, e) {
        e.stopPropagation();
        if (this._detailOpenId === sourceId) {
            this._closeDetailPopover();
        } else {
            this._detailOpenId = sourceId;
            this._fetchAlbumTracks(sourceId);
            requestAnimationFrame(() => {
                document.addEventListener('click', this._boundCloseDetail, { once: true });
                this._detailListenerActive = true;
            });
        }
    }

    /**
     * Fetch album tracklist for a source and store in _albumTracks.
     * @param {string} sourceId
     */
    async _fetchAlbumTracks(sourceId) {
        try {
            const data = await apiGet(`/audio_pipeline/album-tracks?source_id=${encodeURIComponent(sourceId)}`);
            if (data?.tracks) {
                this._albumTracks = new Map(this._albumTracks).set(sourceId, data.tracks);
            }
        } catch (_e) {
            // silently ignore
        }
    }

    /** Close the detail popover. */
    _closeDetailPopover() {
        this._detailOpenId = null;
        this._detailListenerActive = false;
    }

    // ------------------------------------------------------------------
    // Touch — dismiss gesture (swipe down on the bar)
    // ------------------------------------------------------------------

    _handleTouchStart(e) {
        if (!this._hasItems || this._dismissed) return;
        if (e.touches.length > 1) return; // ignore pinch-zoom
        if (e.target.closest('.np-controls, .np-mode-btns, .np-cover-wrap, ag-progress-bar')) {
            this._touchIgnored = true;
            return;
        }
        this._touchIgnored = false;
        // Prevent iOS Safari from claiming this gesture for native scroll/bounce
        e.preventDefault();
        this._gestureType = null;
        this._touchStartX = e.touches[0].clientX;
        this._touchStartY = e.touches[0].clientY;
        this._touchStartTime = Date.now();
        this._barEl = this.querySelector('.now-playing-bar');
        if (this._barEl) {
            this._barEl.style.transition = 'none';
            this._barEl.style.willChange = 'transform';
        }
    }

    _handleTouchMove(e) {
        if (!this._hasItems || this._dismissed) return;
        if (this._touchIgnored) return;
        if (e.touches.length > 1) return; // ignore pinch-zoom

        const deltaY = e.touches[0].clientY - this._touchStartY;
        const deltaX = e.touches[0].clientX - this._touchStartX;
        const absDX = Math.abs(deltaX);
        const absDY = Math.abs(deltaY);

        // Commit to a gesture type once movement crosses the dead-zone
        if (this._gestureType === null) {
            if (absDX > 8 || absDY > 8) {
                if (absDX > absDY) {
                    this._gestureType = this._items.length > 1 ? 'switch' : 'ignore';
                } else if (deltaY > 0) {
                    this._gestureType = 'dismiss';
                } else {
                    this._gestureType = 'open-player';
                }
            }
        }
        if (this._gestureType === null || this._gestureType === 'ignore') return;

        e.preventDefault();
        this._pendingTouchY = e.touches[0].clientY;
        this._pendingTouchX = e.touches[0].clientX;
        if (this._rafId) return;
        this._rafId = requestAnimationFrame(() => {
            this._rafId = null;
            const freshEl = this.querySelector('.now-playing-bar');
            if (freshEl && freshEl !== this._barEl) {
                // Lit re-rendered mid-gesture: suppress transition on the new element
                freshEl.style.transition = 'none';
                freshEl.style.willChange = 'transform';
                this._barEl = freshEl;
            }
            if (!this._barEl) return;
            if (this._gestureType === 'dismiss') {
                const dy = this._pendingTouchY - this._touchStartY;
                if (dy > 0) {
                    this._barEl.style.setProperty('transform', `translate3d(0, ${dy}px, 0)`, 'important');
                }
            } else if (this._gestureType === 'open-player') {
                const dy = this._pendingTouchY - this._touchStartY;
                if (dy < 0) {
                    this._barEl.style.setProperty('transform', `translate3d(0, ${dy * 0.3}px, 0)`, 'important');
                }
            } else if (this._gestureType === 'switch') {
                const dx = this._pendingTouchX - this._touchStartX;
                this._barEl.style.setProperty('transform', `translate3d(${dx}px, 0, 0)`, 'important');
            }
        });
    }

    _handleTouchEnd(e) {
        if (!this._hasItems || this._dismissed) return;
        if (this._touchIgnored) { this._touchIgnored = false; return; }
        if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }

        const deltaY = e.changedTouches[0].clientY - this._touchStartY;
        const deltaX = e.changedTouches[0].clientX - this._touchStartX;
        const barEl = this.querySelector('.now-playing-bar') || this._barEl;
        const gesture = this._gestureType;
        this._gestureType = null;

        const elapsed = Date.now() - (this._touchStartTime || 0);
        const velocityY = elapsed > 0 ? deltaY / elapsed : 0;

        const isOpenPlayer = gesture === 'open-player' && deltaY < -Math.abs(deltaX) &&
            (velocityY < -0.3 || deltaY < -40);
        if (isOpenPlayer) {
            if (barEl) {
                barEl.style.willChange = '';
                barEl.style.transition = 'transform 0.2s ease';
                barEl.style.removeProperty('transform');
            }
            window.dispatchEvent(new CustomEvent('np-expand', {
                detail: {
                    source_id: this._items[this._activeSourceIdx]?.source_id,
                    item:      this._items[this._activeSourceIdx] ?? null,
                },
            }));
            return;
        }

        const isDismiss = gesture === 'dismiss' && deltaY > Math.abs(deltaX) &&
            (velocityY > 0.4 || deltaY > 50);
        if (isDismiss) {
            // Animate bar off screen, then commit dismissed state.
            // setTimeout is used instead of transitionend because a poll firing during
            // the 200ms animation causes Lit to re-render, orphaning the transitionend
            // listener on the old element — _dismissed would never be set to true.
            if (barEl) {
                barEl.style.willChange = '';
                barEl.style.transition = 'transform 0.25s ease';
                barEl.style.setProperty('transform', 'translate3d(0, 100%, 0)', 'important');
            }
            setTimeout(() => {
                this._dismissed = true;
                this._reportHeight();
            }, 260);
        } else if (gesture === 'switch' && Math.abs(deltaX) > 80 && this._items.length > 1) {
            // Switch to next or previous source
            const newIdx = deltaX < 0
                ? (this._activeSourceIdx + 1) % this._items.length
                : (this._activeSourceIdx - 1 + this._items.length) % this._items.length;
            this._activeSourceIdx = newIdx;
            this._userSourceOverride = true;
            if (barEl) {
                barEl.style.willChange = '';
                barEl.style.transition = 'transform 0.2s ease';
                barEl.style.setProperty('transform', 'translate3d(0, 0, 0)', 'important');
                barEl.addEventListener('transitionend', () => {
                    barEl.style.transition = '';
                    barEl.style.removeProperty('transform');
                }, { once: true });
            }
        } else {
            // Snap back to original position
            if (barEl) {
                barEl.style.transition = '';
                barEl.style.removeProperty('transform');
                barEl.style.willChange = '';
            }
        }
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    /**
     * Format seconds into mm:ss or h:mm:ss.
     * @param {number} seconds
     * @returns {string}
     */
    _formatDuration(seconds) {
        const s = Math.floor(seconds);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
        return `${m}:${String(sec).padStart(2, '0')}`;
    }

    // ------------------------------------------------------------------
    // Text scroll
    // ------------------------------------------------------------------


    // ------------------------------------------------------------------
    // Render
    // ------------------------------------------------------------------

    _renderItem(item) {
        const primaryToken = pickPrimaryCoverToken(item, { preferStation: true });
        const coverSrc = coverUrl(primaryToken);
        const isPlaying = item.playback_status === 'Playing';
        const statusLabel = isPlaying ? 'Pause' : 'Play';
        const bgColor = primaryToken ? (this._bgColors.get(primaryToken) ?? '') : '';

        return html`
            <div class="np-row" data-source="${item.source_id}" style="--np-bg-color: ${bgColor}">
                <!-- Cover art + detail popover -->
                <div class="np-cover-wrap"
                    role="button"
                    tabindex="0"
                    aria-label="Album details"
                    title="Album details"
                    @click="${(e) => this._toggleDetailPopover(item.source_id, e)}"
                >
                    ${coverSrc && !this._brokenCovers.has(primaryToken)
                        ? html`<img class="np-cover" src="${coverSrc}" alt="Album cover" loading="lazy"
                              @error=${() => { this._brokenCovers = new Set([...this._brokenCovers, primaryToken]); }}>`
                        : html`<div class="np-cover np-cover--placeholder"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconMusicNote}</svg></div>`
                    }
                    ${this._detailOpenId === item.source_id ? html`
                        <div class="np-detail-popover" @click="${(e) => e.stopPropagation()}">
                            <!-- Left: cover + metadata -->
                            <div class="np-detail-left">
                                ${coverSrc ? html`<img class="np-detail-cover" src="${coverSrc}" alt="Album cover">` : nothing}
                                <div class="np-detail-meta">
                                    ${item.album       ? html`<div class="np-detail-row"><span class="np-detail-label">Album</span><span class="np-detail-value">${item.album}</span></div>` : nothing}
                                    ${item.artist      ? html`<div class="np-detail-row"><span class="np-detail-label">Artist</span><span class="np-detail-value">${item.artist}</span></div>` : nothing}
                                    ${item.year        ? html`<div class="np-detail-row"><span class="np-detail-label">Year</span><span class="np-detail-value">${item.year}</span></div>` : nothing}
                                    ${item.genre       ? html`<div class="np-detail-row"><span class="np-detail-label">Genre</span><span class="np-detail-value">${item.genre}</span></div>` : nothing}
                                    ${item.source_format ? html`<div class="np-detail-row"><span class="np-detail-label">Format</span><span class="np-detail-value">${item.source_format}</span></div>` : nothing}
                                    ${item.elapsed !== null && item.elapsed !== undefined && item.duration ? html`<div class="np-detail-row"><span class="np-detail-label">Position</span><span class="np-detail-value">${this._formatDuration(item.elapsed)} / ${this._formatDuration(item.duration)}</span></div>` : nothing}
                                    <div class="np-detail-row"><span class="np-detail-label">Source</span><span class="np-detail-value">${item.display_name}</span></div>
                                </div>
                            </div>
                            <!-- Right: tracklist -->
                            ${(this._albumTracks.get(item.source_id) ?? []).length > 0 ? html`
                                <div class="np-detail-tracks">
                                    <div class="np-detail-tracks-title">Tracklist</div>
                                    <ol class="np-tracklist">
                                        ${(this._albumTracks.get(item.source_id) ?? []).map(t => html`
                                            <li class="np-tracklist-item ${t.track_number === item.track_number ? 'np-tracklist-item--active' : ''}">
                                                <span class="np-tracklist-num">${t.track_number ?? ''}</span>
                                                <span class="np-tracklist-title">${t.title}</span>
                                                ${t.duration ? html`<span class="np-tracklist-dur">${this._formatDuration(t.duration)}</span>` : nothing}
                                            </li>
                                        `)}
                                    </ol>
                                </div>
                            ` : nothing}
                        </div>
                    ` : nothing}
                </div>

                <!-- Track info -->
                <div class="np-info">
                    <div class="np-source-row">
                        ${item.origin
                            ? html`<ag-source-badge .origin=${item.origin} .name=${item.origin_name ?? ''}></ag-source-badge>`
                            : html`<span class="np-service-badge">${item.display_name}</span>`}
                        ${item.output_connector
                            ? html`<ag-connector-badge .connector=${item.output_connector}></ag-connector-badge>`
                            : nothing}
                        ${this._rendererStatus?.connected && !this._rendererStatus?.bypassed
                            ? html`<span class="np-renderer-badge" title="Routed to UPnP renderer">→ ${this._rendererStatus.renderer_name ?? 'Renderer'}</span>`
                            : nothing}
                        ${this._offline
                            ? html`<span class="np-offline-badge" title="No network — showing last known state">Offline</span>`
                            : nothing}
                    </div>
                    <div class="np-track">
                        <ag-track-meta
                            .title=${item.title ?? ''}
                            .artist=${item.artist ?? ''}
                        ></ag-track-meta>
                    </div>
                    ${item.source_format ? html`<span class="np-format">${item.source_format}</span>` : nothing}
                    ${item.can_seek ? html`
                        <div class="np-mode-btns">
                            <button
                                class="np-mode-btn ${item.repeat ? 'np-btn--active' : ''}"
                                aria-label="Repeat"
                                title="Repeat"
                                @click="${() => this._sendControl(item.source_id, 'set_repeat', item.repeat ? 0 : 1, item)}"
                            ><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconRepeat}</svg></button>
                            <button
                                class="np-mode-btn ${item.shuffle ? 'np-btn--active' : ''}"
                                aria-label="Shuffle"
                                title="Shuffle"
                                @click="${() => this._sendControl(item.source_id, 'set_shuffle', item.shuffle ? 0 : 1, item)}"
                            ><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconShuffle}</svg></button>
                        </div>
                    ` : nothing}
                </div>

                <!-- Transport controls -->
                <div class="np-controls ${this._isLicensed() ? '' : 'np-gated'}">
                    ${item.can_prev ? html`
                        <button
                            class="np-btn"
                            aria-label="Previous"
                            title="Previous"
                            @click="${() => this._sendControl(item.source_id, 'prev', null, item)}"
                        >
                            <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconSkipBack}</svg>
                        </button>
                    ` : nothing}
                    <button
                        class="np-btn"
                        aria-label="${statusLabel}"
                        title="${statusLabel}"
                        @click="${() => this._sendControl(item.source_id, 'toggle', null, item)}"
                    >
                        ${isPlaying
                            ? html`<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconPause}</svg>`
                            : html`<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconPlay}</svg>`}
                    </button>
                    ${item.can_next ? html`
                        <button
                            class="np-btn"
                            aria-label="Next"
                            title="Next"
                            @click="${() => this._sendControl(item.source_id, 'next', null, item)}"
                        >
                            <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconUpNext}</svg>
                        </button>
                    ` : nothing}
                    ${item.can_set_volume && (!isDsd(item.source_format) || item.source_id === 'src_hqplayer') ? html`
                        <ag-volume-popover
                            .volume=${item.volume ?? 0}
                            @volume-change=${(e) => this._sendControl(item.source_id, 'set_volume', e.detail.volume, item)}
                        ></ag-volume-popover>
                    ` : nothing}
                    ${isDsd(item.source_format) && item.source_id !== 'src_hqplayer' ? html`<ag-dsd-lock></ag-dsd-lock>` : nothing}
                </div>
            </div>
            ${item.duration ? html`
                <ag-progress-bar
                    compact
                    .serverElapsed=${item.elapsed ?? 0}
                    .duration=${item.duration}
                    ?can-seek=${item.can_seek}
                    ?playing=${isPlaying}
                    .title=${item.title ?? ''}
                    @seek=${(e) => this._sendControl(item.source_id, 'seek', e.detail.secs, item)}
                ></ag-progress-bar>
            ` : nothing}
        `;
    }

    render() {
        if (!this._hasItems) return nothing;

        if (this._dismissed) {
            // Pull-tab is handled by <ag-pull-tab> (sibling in index.html)
            return nothing;
        }

        const activeItem = this._items[this._activeSourceIdx] ?? this._items[0];

        return html`
            <div class="now-playing-bar">
                ${!window.matchMedia('(pointer: coarse)').matches ? html`
                <button
                    aria-label="Open fullscreen player"
                    title="Open fullscreen player"
                    style="position:absolute;top:-24px;right:0;z-index:104;width:32px;height:24px;display:flex;align-items:center;justify-content:center;background:var(--bg-secondary);border:1px solid var(--border-color);border-bottom:none;border-radius:var(--radius-sm,4px) var(--radius-sm,4px) 0 0;padding:0;color:var(--text-secondary);cursor:pointer;"
                    @click="${() => window.dispatchEvent(new CustomEvent('np-expand', {
                        detail: {
                            source_id: this._items[this._activeSourceIdx]?.source_id,
                            item:      this._items[this._activeSourceIdx] ?? null,
                        },
                    }))}"
                >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        ${iconChevronUp}
                    </svg>
                </button>` : nothing}
                <div class="np-inner">
                    ${activeItem ? this._renderItem(activeItem) : nothing}
                    ${this._items.length > 1 ? html`
                        <div class="np-dots" aria-label="Sources">
                            ${this._items.map((_, idx) => html`
                                <div
                                    class="np-dot ${idx === this._activeSourceIdx ? 'np-dot--active' : ''}"
                                    role="button"
                                    tabindex="0"
                                    aria-label="Source ${idx + 1}"
                                    @click="${() => { this._activeSourceIdx = idx; this._userSourceOverride = true; }}"
                                ></div>
                            `)}
                        </div>
                    ` : nothing}
                </div>
            </div>
        `;
    }
}

customElements.define('ag-now-playing', AgNowPlaying);
