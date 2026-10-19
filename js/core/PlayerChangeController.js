/**
 * @module PlayerChangeController
 * @description Lit Reactive Controller that tells a view when what the box plays changes,
 * for as long as the view follows it: a source that starts or stops, another track or
 * station, play or pause.
 *
 * Built for Library → Stats, whose figures count the listen in progress as of the moment
 * they are read: a view left open went on saying IN PROGRESS for a track long over (review,
 * 2026-10-19). It reads the player stream the mini player already holds open
 * (library-store.js), so the core reads nothing more for it.
 *
 *   this._player = new PlayerChangeController(this, () => this._load(), { counts: 30 });
 *   this._player.follow(shown);
 *
 * It calls back:
 * - a moment after what plays changes (SETTLE_MS): the states of one change come in a
 *   burst — a title, then its artist — and are one reading;
 * - once what plays has played `counts` seconds, when it had not yet when seen: a listen
 *   counts from 30 seconds, so a track just started shows only then;
 * - when the page is shown again — a phone woken up — since what it showed may be old.
 */
import { subscribePlayerState } from '../library-store.js';

/** How long the states of one change are waited for, in milliseconds. */
export const SETTLE_MS = 1500;

/**
 * Whether a source of the player state is a live broadcast — the same reading as the
 * history's (core: modules/listening/tracker.py, _is_live).
 *
 * @param {object} source - An entry of the state's `sources`.
 * @returns {boolean}
 */
function isLive(source) {
    return source.live === true || source.origin === 'radio';
}

/**
 * What the box plays, as a view of the history tells it apart: each active source, what
 * it plays and whether it plays or is paused. A station is its station, whatever song it
 * announces — one listen, as the history counts it (core: tracker.py, _identity).
 *
 * @param {?object} state - A player state, as the player stream sends it.
 * @returns {string} The same string for the same music in the same state.
 */
export function playingSignature(state) {
    const active = (state?.sources || []).filter(s => s && s.playing);
    return JSON.stringify(active.map(s => [
        s.control_id || s.source_id || null, s.playback_status || null,
        ...(isLive(s)
            ? ['live', s.origin, s.origin_name, s.content_source_id]
            : ['track', s.origin, s.content_source_id, s.content_item_id, s.title]),
    ].map(v => v ?? null)).sort());
}

/**
 * How long until everything playing has played some seconds: the moment it counts.
 *
 * @param {?object} state - A player state.
 * @param {number} counts - The seconds that make a listen count; 0 for none.
 * @returns {?number} Milliseconds, a second past the last to count; null when all that
 *   plays counts already, or nothing plays.
 */
export function untilCounted(state, counts) {
    if (!counts) return null;
    const left = (state?.sources || [])
        .filter(s => s && s.playing && s.playback_status === 'Playing')
        .map(s => counts - (Number(s.elapsed) || 0))
        .filter(seconds => seconds > 0);
    return left.length ? (Math.max(...left) + 1) * 1000 : null;
}

export class PlayerChangeController {
    /**
     * @param {import('lit').ReactiveControllerHost & object} host - The view.
     * @param {() => void} onChange - What the view does when what plays has changed.
     * @param {object} [options]
     * @param {number} [options.counts=0] - Call back too once what plays has played this
     *   many seconds, when it had not yet when seen; 0 for never.
     */
    constructor(host, onChange, { counts = 0 } = {}) {
        this.host = host;
        this._onChange = onChange;
        this._counts = counts;
        /** Whether the view asked to follow; kept while it is out of the page. */
        this._wanted = false;
        /** @type {?() => void} */
        this._unsubscribe = null;
        /** What played at the last state; undefined until the first. @type {string|undefined} */
        this._seen = undefined;
        this._soon = null;
        this._later = null;
        this._onState = this._onState.bind(this);
        this._onPageShown = this._onPageShown.bind(this);
        // Optional: the unit tests stand LitElement in with a bare class.
        host.addController?.(this);
    }

    /**
     * Follow the player, or stop. Asked again in the same sense, it does nothing.
     *
     * @param {boolean} on - Whether to follow.
     * @returns {void}
     */
    follow(on) {
        this._wanted = Boolean(on);
        if (this._wanted) this._start();
        else this._stop();
    }

    /** Back in the page: follow again if the view had asked to. */
    hostConnected() {
        if (this._wanted) this._start();
    }

    /** Out of the page: stop, and keep whether the view had asked to follow. */
    hostDisconnected() {
        this._stop();
    }

    _start() {
        if (this._unsubscribe) return;
        this._seen = undefined;
        this._unsubscribe = subscribePlayerState(this._onState);
        document.addEventListener('visibilitychange', this._onPageShown);
    }

    _stop() {
        this._unsubscribe?.();
        this._unsubscribe = null;
        document.removeEventListener('visibilitychange', this._onPageShown);
        clearTimeout(this._soon);
        clearTimeout(this._later);
        this._soon = this._later = null;
    }

    /**
     * Take a state of the player. The first only notes what plays: the view has just read
     * what it shows.
     *
     * @param {object} state - A player state.
     * @returns {void}
     */
    _onState(state) {
        const seen = playingSignature(state);
        const first = this._seen === undefined;
        if (!first && seen === this._seen) return;
        this._seen = seen;
        if (!first) this._callSoon();
        clearTimeout(this._later);
        const wait = untilCounted(state, this._counts);
        this._later = wait === null ? null : setTimeout(() => {
            this._later = null;
            this._onChange();
        }, wait);
    }

    /** The page shown again: what the view shows may be old. @returns {void} */
    _onPageShown() {
        if (document.visibilityState === 'visible') this._callSoon();
    }

    /** Call back once the burst of states is over, a single time for all of it. @returns {void} */
    _callSoon() {
        clearTimeout(this._soon);
        this._soon = setTimeout(() => {
            this._soon = null;
            this._onChange();
        }, SETTLE_MS);
    }
}
