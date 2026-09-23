/**
 * @module AgLibraryPage
 * @description Library page — rendered as a standard tab in the main navigation.
 * Manages inner view routing: browse → search → queue → library (sources) →
 * outputs → roon-browser.
 * Now Playing is handled app-level by ag-now-playing-fullscreen (np-expand event).
 *
 * Active source and zone are restored from /player/state/snapshot on connect.
 *
 * @element ag-library-page
 *
 * @dependency ag-library-browse
 * @dependency ag-library-search
 * @dependency ag-library-queue
 * @dependency ag-library-sources
 * @dependency ag-library-outputs
 * @dependency ag-library-roon-browser
 * @dependency ag-library-upnp-browser
 */
import { LitElement, html, nothing } from 'lit';
import { apiGet, apiPost } from '../../api.js';
import { getSnapshot, getRoonZones, subscribePlayerState } from '../../library-store.js';
import { iconBack, iconQueue, iconRefresh, iconOutput, iconInfo } from '../../ag-icons.js';
import { SOURCE_MARKS, SOURCE_META, normalizeSearchSources, resolvePlayingSource } from '../library-constants.js';
import '../molecules/ag-lib-tabbar.js';
import './ag-library-browse.js';
import './ag-library-outputs.js';
import './ag-library-queue.js';
import './ag-library-radio.js';
import './ag-library-roon-browser.js';
import './ag-library-search.js';
import './ag-library-sources.js';
import './ag-library-upnp-browser.js';

/* ─── shared CSS injected once into <head> ─── */
const LIB_STYLES = `
/* Audiogravity Library — shared styles, all classes prefixed lib- */

.lib-page {
    display: block;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-family: var(--font-family);
    -webkit-font-smoothing: antialiased;
}

/* View containers */
.lib-view { display: none; }
.lib-view.active { display: block; }

/* Topbar */
.lib-topbar {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: 4px 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--bg-primary);
    border-bottom: 1px solid var(--border-color);
    min-height: 44px;
}

/* 32px of gutter on each side is a sixth of a 390px phone, spent before a single tab
   is drawn. It is a desktop measure that was never revisited for the screen this page
   is used from most. The content below keeps its own 20px, so the bar and the covers
   still share an edge. */
@media (max-width: 640px) {
    .lib-topbar { padding: 4px 12px; }
}
/* The component renders into the light DOM, so the element that .lib-topbar actually
   lays out is <ag-lib-tabbar>, not .lib-nav inside it. It therefore has to carry the
   flex properties itself.

   This is what made the first attempt at a scrolling bar do nothing at all: flex and
   "min-width: 0" were put on .lib-nav, whose parent is the custom element and not a
   flex container, so both were inert. The element kept its content width, .lib-nav was
   never squeezed, scrollWidth stayed equal to clientWidth — and an overflow-x that
   never overflows has nothing to scroll. Nothing in the page reports a rule that
   applies to the wrong box. */
ag-lib-tabbar {
    display: flex;
    flex: 1;
    min-width: 0;
}

/* "min-width: 0" again, and for the same reason one level down — a flex item refuses to
   go below its content width without it. Sideways scrolling is the last resort when the
   five labelled tabs outgrow the bar, or a long source name eats their room: a bar that
   has run out of space should still be reachable, which is the answer the licence
   server's header uses too.

   The scrollbar is hidden rather than styled: it would sit across the labels on a bar
   this short, and the overflow is discovered by dragging, as on any tab strip. The
   global tab-swipe (js/gestures.js) yields to this element on its own — it walks up
   from the touch looking for an ancestor that scrolls sideways AND actually overflows,
   so the drag scrolls the bar here and still switches app tabs when the bar fits. */
.lib-nav {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
    overflow-x: auto;
    /* Spelled out rather than left to the browser: a box that scrolls on one axis and is
       "visible" on the other has that visible silently computed to auto, so the bar would
       have gained a vertical scrollbar nobody asked for. */
    overflow-y: hidden;
    scrollbar-width: none;
    /* Room for the focus ring inside the clip, taken straight back off the outside so the
       bar keeps its height. Without it a scroll container crops the 3px outline (2px
       offset) the app draws on a focused tab — and that ring is the only thing telling a
       keyboard user where they are. */
    padding-block: 5px;
    margin-block: -5px;
}
.lib-nav::-webkit-scrollbar { display: none; }
.lib-topbar-right {
    display: flex;
    align-items: center;
    gap: 14px;
    color: var(--text-secondary);
    flex-shrink: 0;
}

/* The bar's actions, named like its tabs.

   They were bare glyphs with only a title attribute, which read as an unlabelled tab
   from the moment the tabs themselves grew labels — a hole where a word should be.
   They take the tabs' geometry so the row reads as one, and a hairline keeps them from
   being mistaken for a sixth destination: these DO something, they do not take you
   somewhere. The rule 12 exception of .lib-tab covers them for the same measured
   reason — this bar is set in sentence case throughout. */
.lib-action {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 6px 10px;
    font-family: var(--font-family);
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
    background: transparent;
    border: 0;
    border-left: 1px solid var(--border-color);
    cursor: pointer;
    white-space: nowrap;
}
.lib-action svg { width: 22px; height: 22px; flex-shrink: 0; }
.lib-topbar-right svg {
    width: 22px; height: 22px;
    stroke: currentColor; fill: none;
    stroke-width: 1.7;
    stroke-linecap: round; stroke-linejoin: round;
    cursor: pointer;
}
/* Names the source being browsed — which is what this line is for, and all it is for.
 *
 * It used to open on a green pulsing dot, with the name in the success colour. Neither
 * carried any state: there was no other value the dot could take, so it said "live" at
 * the one moment that is true by construction — you have just picked this source and its
 * grid is already filled below. That spends the vocabulary of a status light on something
 * invariant, which is what leaves a reader unable to believe it the day a source really
 * is in trouble. It also animated for as long as the page stayed open.
 *
 * The class name is kept: it is what the four call-sites already hang on. */
.lib-live {
    font-family: var(--font-family);
    font-size: var(--font-size-sm);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    gap: 8px;
}

/* Body / scroll */
.lib-body { display: block; }
.lib-scroll { display: block; }

/* The source, named above the content it describes rather than in the navigation.
   It used to sit in the top bar, where "LOCAL LIBRARY" is 140px of bold uppercase
   competing with five tabs for the width of a phone — which is why the bar overflowed
   on every screen. It also reads better here: it says what you are LOOKING AT, so it
   belongs with the covers, not with the controls that take you elsewhere.
   Left padding matches .lib-filters so the source and the pills share an edge. */
.lib-context {
    display: flex;
    align-items: center;
    padding: 12px 20px 0;
}
.lib-context:empty { display: none; }

/* ag-lib-tabbar inner-nav tabs */
/* Label under the icon, and shown on a phone as well — where it used to be hidden
   outright, leaving five unlabelled glyphs on the surface people browse from most.
   Stacking is what buys the room: side by side, the five tabs are wider than the bar.

   Sentence case, and that IS a deliberate exception to the rule that a short label is
   set in capitals — noted here rather than left to be "tidied" later. It is what makes
   the labels fit at all: measured against Inter's own metrics, the five labels in
   capitals with the 0.08em tracking come to 313px, where sentence case comes to 275px.
   The tracking and the capitals alone cost 38px. It also happens to be the right
   register: this is a tab bar people navigate with a thumb, not a column heading in a
   console.

   Set at xs, not xxs. These labels are READ — they are the whole of the navigation on a
   phone since the rule that hid them was removed — and xxs is reserved for what is
   identified at a glance: a badge, a unit, a format tag. They only fit at xs because two
   other things were fixed: the source badge left this bar for the content, and the bar
   stopped spending 64px of a 390px screen on its own gutter. 366px of bar, less 80px for
   the action, leaves 286px for 275px of labels. */
.lib-tab {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 6px 10px;
    font-family: var(--font-family);
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
    background: transparent;
    border: 0;
    cursor: pointer;
    white-space: nowrap;
}
.lib-tab.on { color: var(--text-primary); }
.lib-tab svg {
    width: 22px; height: 22px;
    stroke: currentColor; fill: none;
    stroke-width: 1.7;
    stroke-linecap: round; stroke-linejoin: round;
    flex-shrink: 0;
}
.lib-tab.on svg { stroke-width: 2.2; }

/* Per-organism CSS now lives in frontend/css/components/library-*.css :
   - library-search.css, library-queue.css, library-sources.css,
     library-outputs.css, library-album-card.css, library-browser.css */

/* Source-changed banner */
.lib-source-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 16px;
    background: color-mix(in srgb, var(--color-warning) 10%, var(--bg-secondary));
    border-bottom: 1px solid color-mix(in srgb, var(--color-warning) 25%, transparent);
    font-family: var(--font-family);
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
}
.lib-source-banner-msg { flex: 1; min-width: 0; }
.lib-source-banner-name {
    font-weight: 600;
    color: var(--color-warning-text);
}
.lib-source-banner-actions { display: flex; gap: 6px; flex-shrink: 0; }

/* States */
.lib-loading { display: flex; align-items: center; justify-content: center; padding: 40px 20px; font-family: var(--font-family); font-size: var(--font-size-xxs); text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-secondary); }
.lib-empty { padding: 40px 20px; text-align: center; font-family: var(--font-family); font-size: var(--font-size-xxs); text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-tertiary); }

/* Desktop: normal flow inside main-content — main-content (overflow: hidden auto) handles scroll.
   main-content inset already starts below topbar+tabs, so top:0 sticky is correct. */
#library.tab-content.active {
    padding: 0;
}

/* Wherever main-content spans the whole screen — a phone either way up, a low window —
   the library gives back what covers it, the same pattern as .content-grid in layout.css:
   the AG topbar at the top (and the tab bar, when the tabs are a bar rather than a
   column), and --bottom-clearance at the bottom, for the mini-player or its pull tab.
   The landscape query was missing: a phone on its side had the library's own tabs under
   the topbar and its last row under the mini-player (measured at 844×390, 2026-09-23). */
@media (max-width: 768px), (orientation: landscape) and (height <= 500px) {
    #library.tab-content.active {
        padding-top: calc(var(--topbar-height) + var(--tabs-height) + env(safe-area-inset-top, 0px));
        padding-bottom: calc(var(--footer-height, 0px) + var(--bottom-clearance));
    }
    #library.tab-content.active .lib-topbar {
        top: calc(var(--topbar-height) + var(--tabs-height) + env(safe-area-inset-top, 0px));
    }
    body:has(.tabs--vertical) #library.tab-content.active {
        padding-top: calc(var(--topbar-height) + env(safe-area-inset-top, 0px));
    }
    body:has(.tabs--vertical) #library.tab-content.active .lib-topbar {
        top: calc(var(--topbar-height) + env(safe-area-inset-top, 0px));
    }
}

ag-library-page {
    display: block;
}
`;

/** Maps internal view keys to the tab key shown active in ag-lib-tabbar. */
const VIEW_TAB = {
    browse: 'browse', search: 'search', queue: 'queue',
    library: 'library', outputs: 'library',
    radio: 'radio',
    'roon-browser': 'browse', 'upnp-browser': 'browse',
    artist: 'browse',
};


/**
 * Inject the shared library styles (`lib-*`) into the document head, once.
 * Called by the page at connect time, and by Storybook stories that mount
 * library organisms (queue, browse, outputs…) outside the page shell.
 */
export function injectLibStyles() {
    if (document.getElementById('ag-lib-styles')) return;
    const s = document.createElement('style');
    s.id = 'ag-lib-styles';
    s.textContent = LIB_STYLES;
    document.head.appendChild(s);
}

export class AgLibraryPage extends LitElement {
    static properties = {
        _view:          { state: true },
        _sourceId:      { state: true },
        _zoneId:        { state: true },
        _zoneDisplayName: { state: true },
        _upnpLocation:    { state: true },
        _upnpName:        { state: true },
        _sources:         { state: true },
        _upnpServers:     { state: true },
        /** Non-null when an external source change is detected — drives the banner. */
        _pendingSource:   { state: true },
        /** What the OUTPUTS view is given — see where _syncActiveSource writes it. */
        _outputsSourceId: { state: true },
        /** Artist drill-down: the artist whose albums the browse is filtered to. */
        _artistId:        { state: true },
        _artistName:      { state: true },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this._view            = 'browse';
        this._sourceId        = '';
        this._zoneId          = '';
        this._zoneDisplayName = '';
        this._upnpLocation    = '';
        this._upnpName        = '';
        this._sources         = [];
        this._upnpServers     = [];
        this._pendingSource   = null;
        /** Source GROUP the reader waved away; not rendered, so not a Lit property. */
        this._dismissedGroup  = null;
        this._outputsSourceId = '';
        this._artistId        = '';
        this._artistName      = '';
        this._unsubscribeState = null;
        this._boundLibGoto    = (e) => this._onLibGoto(e);
        this._boundSourcesChanged = () => this._onSourcesChanged();
        this._boundRadioPlay  = () => this._onRadioStarted();
    }

    connectedCallback() {
        super.connectedCallback();
        this._injectStyles();
        // The one call allowed to open a screen: arriving on the page, landing on
        // what plays is the answer. Every later sync only refreshes state.
        this._syncActiveSource({ navigate: true });
        window.addEventListener('lib-goto', this._boundLibGoto);
        // One event for every way the source list can change — a streaming
        // service connected or disconnected, a UPnP server forgotten. Without
        // it the list waits for the next player poll (up to 10 s when nothing
        // plays), and the UPnP half never refreshed at all: its servers are
        // fetched once, on mount.
        this.addEventListener('sources-changed', this._boundSourcesChanged);
        // A station that STARTED is the reader saying the radio is what they listen
        // to, so the page adopts it as the browsed source — the picker's own gesture,
        // reached from the radio screen. Without it the radio was only ever what the
        // VIEW showed, and stepping off that view (to the queue, to the sources) put
        // the banner back up, offering a switch to the station just started by hand.
        // `radio-started` fires after the play call resolves, unlike `radio-play`,
        // which carries the intent and would move the bar under an error message.
        this.addEventListener('radio-started', this._boundRadioPlay);
        // BACKLOG item resolved: subscribe permanently so the library stays in sync
        // even when the fullscreen player is closed.
        this._unsubscribeState = subscribePlayerState(s => this._onPlayerState(s));
        // Known UPnP/DLNA media servers (e.g. MinimServer) aren't part of the
        // playback pipeline sources, so fetch them so they appear in search too.
        // BACKLOG: this races _syncActiveSource's own lookup when a UPnP stream plays
        // at mount — both may GET /library/upnp-known-servers. See BACKLOG.md.
        this._loadUpnpServers();
    }

    /** Load persisted UPnP servers and merge them into the searchable sources. */
    /**
     * Re-read both halves of the source list after something changed it.
     *
     * The player snapshot is forced past its cache — the change just happened,
     * a cached answer would describe the state before it.
     */
    async _onSourcesChanged() {
        await Promise.all([this._syncActiveSource({ force: true }), this._loadUpnpServers()]);
        // The browse stays mounted across tabs (the views only toggle a class), so
        // nothing remounts it when an account changes on the sources view — it kept
        // offering what the PREVIOUS account could do, however the reader came back
        // to it. This event is the one signal every such change sends; reloading
        // here repairs the browse for all of them, invisibly when it is off-screen.
        this._refreshBrowse();
    }

    /**
     * Adopt the radio as the browsed source, because a station the reader started by
     * hand has actually begun playing. Nothing is posted to /player/source:
     * `src_radio` is a content id, not a pipeline node, and the core resolves the
     * transport on its own — measured, it answers `src_mpd` either way.
     *
     * `_outputsSourceId` is deliberately left alone: a station plays over MPD, so
     * the outputs view must keep steering the engine, not a content id.
     *
     * @returns {void}
     */
    _onRadioStarted() {
        this._pendingSource = null;
        this._dismissedGroup = null;
        this._sourceId = 'src_radio';
        this._setView('radio');
    }

    async _loadUpnpServers() {
        try {
            const servers = await apiGet('/library/upnp-known-servers');
            if (Array.isArray(servers)) {
                this._upnpServers = servers;
                this._sources = this._normalizeSources(this._rawSources ?? []);
            }
        } catch {
            // Non-blocking: search just won't list UPnP servers.
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        window.removeEventListener('lib-goto', this._boundLibGoto);
        this.removeEventListener('sources-changed', this._boundSourcesChanged);
        this.removeEventListener('radio-started', this._boundRadioPlay);
        if (this._unsubscribeState) {
            this._unsubscribeState();
            this._unsubscribeState = null;
        }
    }

    _injectStyles() {
        injectLibStyles();
    }

    /**
     * Adopt the source the snapshot is playing, with the zone that goes with it.
     *
     * The id taken is the CONTENT's, never the transport's. A station, a Qobuz
     * album and a UPnP stream all travel over MPD, so ``source_id`` reads
     * ``src_mpd`` for the three of them, while ``content_source_id`` names the
     * source each came from. Measured on the box while a station played:
     * ``source_id=src_mpd``, ``content_source_id=src_radio``, and
     * ``origin_name="Radio Choco HD"``.
     *
     * This used to read ``source_id``, and it was the ONE writer of ``_sourceId``
     * that did: every other path here — the picker, the search bar, the banner —
     * already stores a content id. The banner compares at the content level too,
     * so the two halves of one screen answered "which source?" off two different
     * fields, and a reader sitting on the radio screen was offered a switch to the
     * radio.
     *
     * @param {Object}  [opts]
     * @param {boolean} [opts.force=false] - Bypass the snapshot cache.
     * @param {boolean} [opts.navigate=false] - Allow this call to OPEN a screen the
     *   reader did not ask for. True on mount only. `sources-changed` lands here too,
     *   fired by the account cards that live on the sources screen itself, so a
     *   Qobuz sign-in while a UPnP stream played would have thrown the reader into a
     *   media browser mid-task.
     * @returns {Promise<void>}
     */
    async _syncActiveSource({ force = false, navigate = false } = {}) {
        try {
            const state = await getSnapshot({ force });
            if (state?.sources) {
                this._rawSources = state.sources;
                this._sources = this._normalizeSources(state.sources);
            }
            // A refresh refreshes, and adopts nothing. `sources-changed` lands here
            // from the account cards on the sources screen, and adopting there moved
            // the reader off what they were browsing — onto the radio screen when a
            // station happened to play, and off a Roon pick for the outputs view,
            // which then rewrote MPD's ALSA output and called it a success.
            if (!navigate || !state?.source_id) return;
            const playing = resolvePlayingSource(state);
            // Degrade to the transport rather than adopting nothing. A core older
            // than the one that added `content_source_id` makes the resolver fall
            // back to a local table, which can name `src_qobuz` while `sources[]`
            // still lists only `src_mpd` — and this is the ONLY writer of
            // `_sourceId`, so refusing outright left the library on "Select a
            // source" with nothing able to repair it.
            let adopt = playing?.id;
            if (!this._isBrowsable(state.sources, adopt)) adopt = state.source_id;
            if (!this._isBrowsable(state.sources, adopt)) return;
            // The OUTPUTS view asks a different question — which SERVICE feeds the
            // DAC — so it is fed separately. That view DERIVES a service name from
            // what it is handed, which is wrong for every content source and worse
            // for a stale Roon id; this field only preserves what it used to get.
            // BACKLOG: have that view ask /steering/status instead — see BACKLOG.md.
            // Fed with exactly what `_sourceId` used to hold before this method
            // started storing content ids: the transport on arrival, the reader's own
            // pick on the gesture paths below. Handing it `src_qobuz` instead posted
            // `{service:'qobuz'}` to /steering/switch-output, unknown to the core.
            //
            // Written on arrival and on those gestures, never on a refresh and never
            // on a live state — both would have erased the reader's pick before they
            // reached the Outputs button, and an SSE arrives every three seconds.
            this._outputsSourceId = state.source_id;
            if (state.zone_id) this._zoneId = state.zone_id;
            this._zoneDisplayName = state.zone_display_name || '';
            if (this._isUpnp(adopt)) {
                // A media server is browsed by ADDRESS, and no player state carries
                // one — fetch it and open the server, the path the banner's Switch
                // takes. When nothing opens (not allowed to navigate, or the server
                // no longer known) the transport is a better answer than adopting a
                // udn whose browser would render an address-less blank page — but it
                // has to pass the same test, or a UPnP stream pushed to HQPlayer
                // falls back onto the very handle the guard above refuses.
                if (await this._fetchUpnpServerAndSwitch(adopt)) return;
                if (!this._isBrowsable(state.sources, state.source_id)) return;
                this._sourceId = state.source_id;
            } else {
                this._sourceId = adopt;
            }
            // Re-apply the view mapping for the source we just adopted: it is keyed
            // on the source, and this assignment changed it. Without this, coming
            // back with the radio selected left the view on 'browse' while the
            // Browse tab had just been taken out of the bar — no tab highlighted,
            // and an empty grid.
            this._setView(this._view);
        } catch (_) {}
    }

    /**
     * Handle live PlayerState SSE events.
     * Keeps the source list fresh and surfaces a banner when what plays is NOT what
     * the screen shows (e.g. Roon starts playing while the user browses MPD).
     * mpris sources (AirPlay, Spotify) are ignored — they have no library API.
     * @param {object} state - PlayerState from the SSE stream.
     */
    _onPlayerState(state) {
        // Refresh source list from live data.
        if (state.sources?.length) {
            this._rawSources = state.sources;
            this._sources = this._normalizeSources(state.sources);
        }

        // Banner logic — skip until the initial snapshot has set _sourceId.
        if (!this._sourceId || !state.source_id) return;

        // Distinguish SOURCE from engine: Qobuz/Tidal/HIGHRESAUDIO, stations and
        // local files all play over the MPD engine ('src_mpd') but carry a distinct
        // `origin`. Compare at the source level, and against what the screen SHOWS
        // (`_shownGroup`) rather than what it browses, so neither playing Qobuz
        // while browsing Qobuz nor sitting on the radio screen while a station
        // plays offers a switch to the source already on screen.
        const playing = resolvePlayingSource(state);
        if (this._shownGroups.has(playing.group)) {
            this._pendingSource = null;   // same source — only the engine differs
            // The refusal lapses only when the BROWSED source catches up with what
            // plays. Merely glancing at the radio screen is not a change of mind,
            // and clearing it there brought a dismissed banner back three seconds
            // after the reader stepped away.
            if (playing.group === this._groupOf(this._sourceId)) this._dismissedGroup = null;
            return;
        }
        // Skip mpris receivers (AirPlay, Spotify) — no library to browse.
        const info = state.sources?.find(s => s.source_id === state.source_id);
        if (info?.protocol === 'mpris') return;
        // And skip what is no source at all. Under external control the core names
        // no content source, so the resolver hands back a routing handle: the banner
        // then offered "HQPlayer is now playing", and its Switch adopted `src_hqplayer`
        // as the browsed source — POSTing it to /player/source and sending the browse
        // to /library/albums?source_id=src_hqplayer.
        //
        // Judged against the LAST KNOWN list rather than this event's. Measured on
        // the box, every `state` event does carry `sources`, so the two agree today;
        // `_rawSources` is preferred because it is refreshed from this very event a
        // few lines above and still answers if one ever arrives without the list.
        if (!this._isBrowsable(this._rawSources, playing.id)) return;
        // Don't re-raise the banner if it's already showing for this source, nor
        // after the reader has waved it away. The core republishes this state about
        // every three seconds while something plays (measured on the box: three
        // events in ten seconds), so a Dismiss that only cleared _pendingSource was
        // undone before the finger left the screen — the button did nothing at all.
        if (this._pendingSource?.id === playing.id) return;
        if (this._dismissedGroup === playing.group) return;
        // Something else plays now: the earlier refusal was about another source
        // and lapses with it, so that source can raise the banner again later.
        this._dismissedGroup = null;
        this._pendingSource = { id: playing.id, name: playing.label };
    }

    /**
     * Wave the banner away, and remember WHICH source was refused.
     *
     * Clearing `_pendingSource` alone did not survive: the core republishes the
     * player state about every three seconds while something plays, and the next
     * one raised the banner again — the button looked broken because it was.
     *
     * Refused by GROUP, like every other test here. Roon answers under two ids —
     * `src_roon` is a documented alias of the `src_mono-sgen` node — so a refusal
     * pinned to an id would be undone the moment the core named the other one.
     *
     * @returns {void}
     */
    _dismissBanner() {
        const id = this._pendingSource?.id;
        this._dismissedGroup = id ? this._groupOf(id) : null;
        this._pendingSource = null;
    }

    /**
     * @param {string} id - A source id.
     * @returns {string} Its dedup group, or the id itself when it has none.
     */
    _groupOf(id) {
        return SOURCE_META[id]?.group ?? id;
    }

    /**
     * Whether an id names something this page can actually open.
     *
     * What merely CARRIES audio without holding a catalogue — HQPlayer, a network
     * renderer — the core publishes ``selectable: false``, and under external
     * control it names no content source at all, so the resolver's fallback hands
     * back exactly such a handle. Read the core's answer rather than keeping a copy
     * of its list here: the copy named HQPlayer alone, and let an externally driven
     * renderer through as a source nobody can browse.
     *
     * An entry MISSING from ``sources[]`` is refused too, not waved through: once
     * playback stops the handle stays in ``source_id`` while its entry is gone, and
     * reading absence as consent re-adopted the very thing this refuses. Every real
     * content source is listed — measured on the box: mpd, radio, qobuz, tidal,
     * highresaudio, roon and the inputs. The one legitimate absentee is a media
     * server, which is no pipeline node at all.
     *
     * @param {Array<{source_id:string, selectable?:boolean}>} [sources] - `sources[]`.
     * @param {string} [id] - The source id to judge.
     * @returns {boolean}
     */
    _isBrowsable(sources, id) {
        if (!id) return false;
        if (this._isUpnp(id)) return true;
        const node = sources?.find(s => s.source_id === id);
        return node !== undefined && node.selectable !== false;
    }

    /**
     * The groups the screen is showing the reader — usually one, sometimes two.
     *
     * The radio has a screen of its own, reached from the tab bar WITHOUT changing
     * the browsed source: ``_onTabChange`` moves the view alone. So a reader can sit
     * on the radio screen, start a station there (``ag-library-radio`` plays it and
     * tells nobody), and leave ``_sourceId`` still naming the local library. They
     * are looking at the radio all the same, and there is nothing to offer them a
     * switch to — which is what the banner did, naming the very station playing.
     *
     * The radio ADDS to what the screen shows; it does not replace it. Reading the
     * radio screen while the local library plays is ordinary, and answering "radio"
     * alone there offered a switch to the library the reader was already browsing.
     *
     * @returns {Set<string>} Source group keys, as SOURCE_META spells them.
     */
    get _shownGroups() {
        const groups = new Set([this._groupOf(this._sourceId)]);
        if (this._view === 'radio') groups.add(this._groupOf('src_radio'));
        return groups;
    }

    /**
     * Map raw sources from /player/state/snapshot to normalized source objects.
     * Deduplicates by group (e.g. src_roon + src_mono-sgen → one "Roon" badge).
     * @param {Array} raw
     * @returns {Array<{id:string, label:string, group:string, controlUrl:string}>}
     */
    _normalizeSources(raw) {
        return normalizeSearchSources(raw, this._upnpServers);
    }

    /**
     * Show a view, mapping 'browse' to the UPnP browser when the active source is
     * one — the ONE home of that mapping. No reload: the tab bar goes through here,
     * and a tab switch must stay free (the browse keeps its grid and its scroll).
     * @param {string} view
     */
    _setView(view) {
        if (view === 'browse' && this._isUpnp(this._sourceId)) view = 'upnp-browser';
        // Same mapping, one source further: the radio browses on its own screen.
        if (view === 'browse' && this._isRadio(this._sourceId)) view = 'radio';
        this._view = view;
    }

    _navigate(view) {
        this._setView(view);
        if (this._view === 'browse') this._refreshBrowse();
    }

    /**
     * Reload the browse view.
     *
     * Takes an object, not a positional boolean, and for a reason this file makes easy
     * to meet: three handlers in the same render are bound as `@click=${this._x}`, and
     * that shorthand would hand this one a PointerEvent — truthy — turning an ordinary
     * binding into a full MPD re-enumeration with nothing on screen to say so.
     *
     * @param {Object}  [opts]
     * @param {boolean} [opts.refresh=false] - Pass true only for the Refresh control. A
     *   refresh makes the core walk the source again — one MPD round trip per album —
     *   which is what a reader pressing ↻ asks for, and what coming back to the tab or
     *   repairing after an account change does not.
     * @private
     */
    _refreshBrowse({ refresh = false } = {}) {
        this.updateComplete.then(() => {
            this.querySelector('ag-library-browse')?._load({ refresh });
        });
    }

    /**
     * Open an artist's albums (drill-down) from a search result. An artist is not
     * a playable item, so tapping it browses its discography instead of queueing.
     * @param {CustomEvent} e - detail: { artistId, artistName }
     */
    _onOpenArtist(e) {
        // UPnP has no artist-albums endpoint and Roon search item_keys aren't
        // navigable on the browse hierarchy — never enter the artist view for
        // them (defensive; the search also keeps those rows inert).
        if (this._isUpnp(this._sourceId) || this._isRoon(this._sourceId)) return;
        this._pendingSource = null;
        this._artistId   = e.detail?.artistId ?? '';
        this._artistName = e.detail?.artistName ?? '';
        this._navigate('artist');
    }

    /**
     * Leave artist mode and return to the normal album browse. The artist view
     * has its own ag-library-browse instance (unmounted here), so the main browse
     * keeps its loaded albums + scroll — no reload, no double fetch.
     */
    _onArtistBack() {
        this._artistId   = '';
        this._artistName = '';
        this._view       = 'browse';
    }

    async _onLibGoto(e) {
        this._pendingSource = null;
        const { view, source_id } = e.detail ?? {};
        if (!view) return;
        document.querySelector('ag-tabs')?.selectTab('library');
        // Honour an explicit source_id passed by the caller — today that is the
        // fullscreen player opening the OUTPUTS view for the source it is showing,
        // which may differ from the library's. What it hands over is a TRANSPORT
        // (`state.source_id`), so it goes to the outputs view and NOT to the browsed
        // source: writing it there turned a correctly-adopted `src_radio` back into
        // `src_mpd`, and the next state re-raised the very banner this page now
        // suppresses. For Roon we still resolve a zone_id — several views read it.
        // We don't POST /player/source here: this is a navigation, not a switch.
        if (source_id && source_id !== this._outputsSourceId) {
            if (this._isRoon(source_id)) {
                try {
                    const zones = await getRoonZones();
                    if (Array.isArray(zones) && zones.length > 0) {
                        this._zoneId          = zones[0].zone_id;
                        this._zoneDisplayName = zones[0].display_name || '';
                    } else {
                        this._zoneId          = '';
                        this._zoneDisplayName = '';
                    }
                } catch (_) {
                    this._zoneId          = '';
                    this._zoneDisplayName = '';
                }
            }
            this._outputsSourceId = source_id;
        }
        this._navigate(view);
    }

    _onTabChange(e) {
        this._artistId = '';
        this._artistName = '';
        const map = { browse: 'browse', search: 'search', queue: 'queue', library: 'library', radio: 'radio' };
        this._setView(map[e.detail.tab] ?? 'browse');
    }

    _isRoon(sourceId) {
        return sourceId === 'src_mono-sgen' || sourceId === 'src_roon';
    }

    _isUpnp(sourceId) {
        return sourceId.startsWith('upnp:');
    }

    _isRadio(sourceId) {
        return sourceId === 'src_radio';
    }

    /**
     * The tabs the browsed source can actually serve, or null for all of them.
     *
     * Stations are neither albums nor artists: the radio's catalogue lives on its
     * own screen, with its own country/genre/codec filters. Leaving Browse and
     * Search in the bar for it offered an empty grid and an error — measured,
     * `/library/search?source_id=src_radio` answers 400. Reading it off `kind`
     * rather than off the id is the point of the field: the next source that
     * serves a subset says so, and nothing here has to be edited.
     *
     * @returns {Array<string>|null} Tab keys to show, or null for the full bar.
     */
    get _sourceTabs() {
        const kind = this._rawSources?.find(s => s.source_id === this._sourceId)?.kind;
        return kind === 'radio' ? ['queue', 'library', 'radio'] : null;
    }

    _onSourceChange(e) {
        this._pendingSource = null;
        this._artistId = '';
        this._artistName = '';
        const { sourceId, zoneId = '', zoneDisplayName = '', location = '', serverName = '' } = e.detail;
        if (this._isRoon(sourceId) && !zoneId) {
            this._fetchRoonZoneAndSwitch(sourceId);
        } else if (this._isUpnp(sourceId)) {
            this._upnpLocation   = location;
            this._upnpName       = serverName;
            this._sourceId       = sourceId;
            // Left behind, the outputs view kept steering the source picked BEFORE
            // this one — and a stale Roon id there moves the Roon zone's output and
            // reports success, which is worse than the visible failure an unknown
            // service gives. Fixing what that view derives is its own job.
            this._outputsSourceId = sourceId;
            this._zoneId         = '';
            this._zoneDisplayName = '';
            this._view           = this._view === 'search' ? 'search' : 'upnp-browser';
            if (!this._sources.some(s => s.id === sourceId)) {
                this._sources = [...this._sources, {
                    id: sourceId, label: serverName || 'UPnP',
                    group: sourceId, location,
                }];
            }
        } else {
            this._sourceId       = sourceId;
            // The outputs view steers a SERVICE, and picking a source is the reader
            // naming it — Roon steers `roonbridge`, and deriving that from the
            // transport of what happens to play would steer MPD instead.
            this._outputsSourceId = sourceId;
            this._zoneId         = zoneId;
            this._zoneDisplayName = zoneDisplayName;
            this._setView('browse');
            apiPost('/player/source', { source_id: sourceId }).catch(err =>
                console.error('[library-page] set source failed:', err)
            );
        }
    }

    async _fetchRoonZoneAndSwitch(sourceId) {
        try {
            const zones  = await getRoonZones();
            if (Array.isArray(zones) && zones.length > 0) {
                this._zoneId          = zones[0].zone_id;
                this._zoneDisplayName = zones[0].display_name || '';
            } else {
                this._zoneId          = '';
                this._zoneDisplayName = '';
            }
        } catch (_) {
            this._zoneId = '';
            this._zoneDisplayName = '';
        }
        this._sourceId = sourceId;
        this._outputsSourceId = sourceId;   // see _onSourceChange — Roon steers roonbridge
        this._setView('browse');
        apiPost('/player/source', { source_id: sourceId }).catch(err =>
            console.error('[library-page] set source failed:', err)
        );
    }


    /**
     * Open a UPnP media server named by the banner, fetching what opening it needs.
     *
     * A server is not a pipeline source: it is browsed by ADDRESS, and nothing is
     * posted to `/player/source` for it — the normal path gets that address from
     * the picker's event, which the banner has not got. So it is fetched here, the
     * way the Roon branch fetches its zone.
     *
     * Naming a server the screen no longer knows leaves the view alone rather than
     * opening an empty browser: an address-less `ag-library-upnp-browser` renders
     * a blank page, which is worse than not switching.
     *
     * @param {string} sourceId - `upnp:<udn>`.
     * @returns {Promise<boolean>} Whether the server was opened. The banner ignores
     *   the answer — it has nowhere better to go — but `_syncActiveSource` needs it:
     *   a false there falls back to the transport rather than leaving the reader on
     *   an empty browse with no source at all.
     */
    async _fetchUpnpServerAndSwitch(sourceId) {
        let server = this._sources.find(s => s.id === sourceId);
        if (!server?.location) {
            try {
                const known = await apiGet('/library/upnp-known-servers');
                const hit = Array.isArray(known)
                    ? known.find(s => s.id === sourceId) : null;
                if (hit) {
                    // `location`, not `last_location`: that is the persisted model's
                    // own field name, which the route renames on the way out
                    // (core router.py, and API.md says so). Reading the internal name
                    // here left every lookup address-less, so this branch always
                    // failed — silently, because an empty address is a valid miss.
                    server = { id: hit.id, label: hit.friendly_name || 'UPnP',
                               group: hit.id, location: hit.location || '' };
                }
            } catch (err) {
                console.error('[library-page] known UPnP servers failed:', err);
            }
        }
        if (!server?.location) return false;
        this._upnpLocation    = server.location;
        this._upnpName        = server.label;
        this._sourceId        = sourceId;
        this._outputsSourceId = sourceId;   // see _onSourceChange's UPnP branch

        this._zoneId          = '';
        this._zoneDisplayName = '';
        this._view            = 'upnp-browser';
        if (!this._sources.some(s => s.id === sourceId)) {
            this._sources = [...this._sources, server];
        }
        return true;
    }

    /**
     * The line naming (or marking) the source, above the content it describes.
     *
     * @param {string|import('lit').TemplateResult} label - The source's name, or the
     *   source's own mark when it has one (SOURCE_MARKS). Both render as a child
     *   binding, so a fragment is as valid here as a string.
     * @returns {import('lit').TemplateResult|typeof nothing} The line, or nothing when
     *   there is no source to name — the row would otherwise take its space and its
     *   spacing for no content at all. A fragment is always truthy, which is correct:
     *   a source that has a mark always has something to show.
     */
    _contextLine(label) {
        if (!label) return nothing;
        return html`<div class="lib-context"><span class="lib-live">${label}</span></div>`;
    }

    /**
     * After a view switch, reposition the tab bar that just became visible.
     *
     * Each view carries its own bar; the one that was display:none until now
     * could not lay out, so any keep-in-view scroll it ran was a silent no-op —
     * and when the old and new views share a highlighted tab (outputs/library,
     * artist-roon-upnp/browse) the bar's own updated() has no attribute change
     * to react to. Without this, the bar of the view you just entered can sit
     * scrolled to its far left with the highlighted tab clipped off-screen.
     *
     * @param {Map<string, unknown>} changed - Lit's changed-properties map.
     * @returns {void}
     */
    updated(changed) {
        if (!changed.has('_view')) return;
        this.querySelector('.lib-view.active ag-lib-tabbar')?.syncScroll?.();
    }

    render() {
        const { _view, _sourceId, _zoneId, _zoneDisplayName } = this;

        const isBrowse   = _view === 'browse';
        const isArtist   = _view === 'artist';
        const isSearch   = _view === 'search';
        const isQueue    = _view === 'queue';
        const isLibrary  = _view === 'library';
        const isOutputs  = _view === 'outputs';
        const isRoonBrow = _view === 'roon-browser';
        const isUpnpBrow = _view === 'upnp-browser';
        const isRadio    = _view === 'radio';

        const srcName = this._isUpnp(_sourceId)
            ? (this._upnpName || 'UPnP')
            : (SOURCE_META[_sourceId]?.label ?? _sourceId.replace('src_', ''));

        // A source with a mark of its own is shown by it rather than named — HIGHRESAUDIO,
        // Qobuz, Tidal and Roon, whose logos ARE wordmarks, so setting the name beside one
        // would say the same thing twice. Anything without a mark is named, as before.
        const srcLabel = SOURCE_MARKS[_sourceId] ?? srcName;

        return html`
            <div class="lib-page">

                ${this._pendingSource ? html`
                    <div class="lib-source-banner" role="status">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
                             stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">
                            ${iconInfo}
                        </svg>
                        <span class="lib-source-banner-msg">
                            <span class="lib-source-banner-name">${this._pendingSource.name}</span>
                            is now playing
                        </span>
                        <div class="lib-source-banner-actions">
                            <button class="action-btn compact primary"
                                @click=${() => {
                                    const id = this._pendingSource.id;
                                    this._pendingSource = null;
                                    if (this._isRoon(id)) {
                                        this._fetchRoonZoneAndSwitch(id);
                                    } else if (this._isUpnp(id)) {
                                        this._fetchUpnpServerAndSwitch(id);
                                    } else {
                                        this._sourceId = id;
                                        // _outputsSourceId is NOT touched: the banner
                                        // names what is already playing, so the engine
                                        // feeding the DAC has not moved. Writing the
                                        // content id here would have sent the outputs
                                        // view a service the core does not know.
                                        this._setView('browse');
                                        apiPost('/player/source', { source_id: id }).catch(err =>
                                            console.error('[library-page] banner switch failed:', err)
                                        );
                                    }
                                }}>
                                Switch
                            </button>
                            <button class="action-btn compact"
                                @click=${() => this._dismissBanner()}>
                                Dismiss
                            </button>
                        </div>
                    </div>
                ` : nothing}

                <div class="lib-view ${isBrowse ? 'active' : ''}">
                    <div class="lib-topbar">
                        <ag-lib-tabbar tab=${VIEW_TAB[_view] ?? 'browse'} .tabs=${this._sourceTabs} @lib-tab-change=${this._onTabChange}></ag-lib-tabbar>
                        <div class="lib-topbar-right">
                            ${this._isRoon(_sourceId) ? html`
                                <button class="lib-action" @click=${() => this._navigate('roon-browser')}
                                        title="Browse Roon" aria-label="Browse Roon">
                                    <svg viewBox="0 0 24 24" stroke="currentColor" fill="none"
                                         stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                                        ${iconQueue}
                                    </svg>
                                    <span>Roon</span>
                                </button>
                            ` : html`
                                <button class="lib-action" @click=${() => this._refreshBrowse({ refresh: true })}
                                        title="Refresh library" aria-label="Refresh library">
                                    <svg viewBox="0 0 24 24" stroke="currentColor" fill="none"
                                         stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                                        ${iconRefresh}
                                    </svg>
                                    <span>Refresh</span>
                                </button>
                            `}
                        </div>
                    </div>
                    <div class="lib-body">
                        <div class="lib-scroll">
                            ${this._contextLine(srcLabel)}
                            <ag-library-browse
                                source-id=${this._isUpnp(_sourceId) || this._isRadio(_sourceId) ? '' : _sourceId}
                                zone-id=${_zoneId}
                                @lib-open-np=${() => window.dispatchEvent(new CustomEvent('np-expand'))}
                            ></ag-library-browse>
                        </div>
                    </div>
                </div>

                <div class="lib-view ${isArtist ? 'active' : ''}">
                    <div class="lib-topbar">
                        <ag-lib-tabbar tab=${VIEW_TAB[_view] ?? 'browse'} .tabs=${this._sourceTabs} @lib-tab-change=${this._onTabChange}></ag-lib-tabbar>
                    </div>
                    <div class="lib-body">
                        <div class="lib-scroll">
                            ${isArtist ? html`
                                ${this._contextLine(srcLabel)}
                            <ag-library-browse
                                    source-id=${_sourceId}
                                    zone-id=${_zoneId}
                                    artist-id=${this._artistId}
                                    artist-name=${this._artistName}
                                    @lib-open-np=${() => window.dispatchEvent(new CustomEvent('np-expand'))}
                                    @lib-artist-back=${this._onArtistBack}
                                ></ag-library-browse>
                            ` : nothing}
                        </div>
                    </div>
                </div>

                <div class="lib-view ${isSearch ? 'active' : ''}">
                    <div class="lib-topbar">
                        <ag-lib-tabbar tab=${VIEW_TAB[_view] ?? 'browse'} .tabs=${this._sourceTabs} @lib-tab-change=${this._onTabChange}></ag-lib-tabbar>
                    </div>
                    <div class="lib-body">
                        <div class="lib-scroll">
                            <ag-library-search
                                source-id=${_sourceId}
                                zone-id=${_zoneId}
                                .sources=${this._sources}
                                @lib-open-np=${() => window.dispatchEvent(new CustomEvent('np-expand'))}
                                @lib-source-change=${this._onSourceChange}
                                @lib-open-artist=${this._onOpenArtist}
                            ></ag-library-search>
                        </div>
                    </div>
                </div>

                <div class="lib-view ${isQueue ? 'active' : ''}">
                    <div class="lib-topbar">
                        <ag-lib-tabbar tab=${VIEW_TAB[_view] ?? 'browse'} .tabs=${this._sourceTabs} @lib-tab-change=${this._onTabChange}></ag-lib-tabbar>
                    </div>
                    <div class="lib-body">
                        <div class="lib-scroll">
                            <ag-library-queue
                                source-id=${this._isUpnp(_sourceId) ? (this._sources.find(s => s.group === 'mpd')?.id || '') : _sourceId}
                                zone-id=${_zoneId}
                                zone-display-name=${_zoneDisplayName}
                                ?visible=${isQueue}
                                @lib-open-np=${() => window.dispatchEvent(new CustomEvent('np-expand'))}
                            ></ag-library-queue>
                        </div>
                    </div>
                </div>

                <div class="lib-view ${isLibrary ? 'active' : ''}">
                    <div class="lib-topbar">
                        <ag-lib-tabbar tab=${VIEW_TAB[_view] ?? 'browse'} .tabs=${this._sourceTabs} @lib-tab-change=${this._onTabChange}></ag-lib-tabbar>
                        <div class="lib-topbar-right">
                            <button class="lib-action" @click=${() => this._navigate('outputs')}
                                    title="Outputs" aria-label="Outputs">
                                <svg viewBox="0 0 24 24" stroke="currentColor" fill="none"
                                     stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                                    ${iconOutput}
                                </svg>
                                <span>Outputs</span>
                            </button>
                        </div>
                    </div>
                    <div class="lib-body">
                        <div class="lib-scroll">
                            <ag-library-sources
                                source-id=${_sourceId}
                                zone-id=${_zoneId}
                                zone-display-name=${_zoneDisplayName}
                                @lib-source-change=${this._onSourceChange}
                            ></ag-library-sources>
                        </div>
                    </div>
                </div>

                <div class="lib-view ${isOutputs ? 'active' : ''}">
                    <div class="lib-topbar">
                        <ag-lib-tabbar tab=${VIEW_TAB[_view] ?? 'browse'} .tabs=${this._sourceTabs} @lib-tab-change=${this._onTabChange}></ag-lib-tabbar>
                        <div class="lib-topbar-right">
                            <button class="lib-action" @click=${() => this._navigate('library')}
                                    title="Back to library" aria-label="Back to library">
                                <svg viewBox="0 0 24 24" stroke="currentColor" fill="none"
                                     stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                                    ${iconBack}
                                </svg>
                                <span>Back</span>
                            </button>
                        </div>
                    </div>
                    <div class="lib-body">
                        <div class="lib-scroll">
                            <ag-library-outputs
                                source-id=${this._outputsSourceId || _sourceId}
                                @lib-output-change=${() => this._navigate('library')}
                            ></ag-library-outputs>
                        </div>
                    </div>
                </div>

                <div class="lib-view ${isRoonBrow ? 'active' : ''}">
                    <div class="lib-topbar">
                        <ag-lib-tabbar tab=${VIEW_TAB[_view] ?? 'browse'} .tabs=${this._sourceTabs} @lib-tab-change=${this._onTabChange}></ag-lib-tabbar>
                    </div>
                    <div class="lib-body">
                        <div class="lib-scroll">
                            ${this._contextLine(srcLabel)}
                            <ag-library-roon-browser
                                source-id=${_sourceId}
                                zone-id=${_zoneId}
                                @lib-open-np=${() => window.dispatchEvent(new CustomEvent('np-expand'))}
                                @lib-roon-back=${() => this._navigate('browse')}
                            ></ag-library-roon-browser>
                        </div>
                    </div>
                </div>

                <div class="lib-view ${isUpnpBrow ? 'active' : ''}">
                    <div class="lib-topbar">
                        <ag-lib-tabbar tab=${VIEW_TAB[_view] ?? 'browse'} .tabs=${this._sourceTabs} @lib-tab-change=${this._onTabChange}></ag-lib-tabbar>
                    </div>
                    <div class="lib-body">
                        <div class="lib-scroll">
                            ${this._contextLine(this._upnpName || 'UPnP')}
                            <ag-library-upnp-browser
                                location=${this._upnpLocation}
                                server-name=${this._upnpName}
                                source-id=${_sourceId}
                                @lib-open-np=${() => window.dispatchEvent(new CustomEvent('np-expand'))}
                                @lib-upnp-back=${() => this._navigate('library')}
                            ></ag-library-upnp-browser>
                        </div>
                    </div>
                </div>

                <div class="lib-view ${isRadio ? 'active' : ''}">
                    <div class="lib-topbar">
                        <ag-lib-tabbar tab=${VIEW_TAB[_view] ?? 'browse'} .tabs=${this._sourceTabs} @lib-tab-change=${this._onTabChange}></ag-lib-tabbar>
                    </div>
                    <div class="lib-body">
                        <div class="lib-scroll">
                            <ag-library-radio></ag-library-radio>
                        </div>
                    </div>
                </div>

            </div>
        `;
    }
}

customElements.define('ag-library-page', AgLibraryPage);
