/**
 * PlayerChangeController — what tells Library → Stats that what plays has changed.
 *
 * The view counts the listen in progress as of its reading; left open, it said IN PROGRESS
 * for a track long over (review, 2026-10-19). Pinned: it follows only while asked, on the
 * player stream already open; it calls back once per change — not per state, not for a
 * station's next song —, once a track just started has played 30 seconds, and when the
 * page comes back; it stops with the view and takes up again when the view returns.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const store = vi.hoisted(() => ({ callbacks: [], unsubscribe: null }));
vi.mock('../library-store.js', () => ({
    subscribePlayerState: vi.fn((cb) => {
        store.callbacks.push(cb);
        return store.unsubscribe;
    }),
}));

const { PlayerChangeController, SETTLE_MS, playingSignature, untilCounted } =
    await import('./PlayerChangeController.js');
const { subscribePlayerState } = await import('../library-store.js');

/** A source of the player state, playing a library track 200 s in. */
function source(fields = {}) {
    return { source_id: 'src_mpd', control_id: 'src_mpd', playing: true, playback_status: 'Playing',
             origin: 'library', content_source_id: 'mpd', content_item_id: 'a.flac',
             title: 'So What', artist: 'Miles Davis', elapsed: 200, ...fields };
}
const state = (...sources) => ({ sources });
const radio = (title, fields = {}) => source({ origin: 'radio', origin_name: 'France Inter', live: true,
    content_item_id: null, title, elapsed: 900, ...fields });

/** A host as Lit gives one. */
function makeHost() {
    return { addController: vi.fn() };
}

/** The state the stream hands the controller now. */
const send = (s) => store.callbacks.at(-1)(s);

beforeEach(() => {
    vi.useFakeTimers();
    store.callbacks.length = 0;
    store.unsubscribe = vi.fn();
    subscribePlayerState.mockClear();
});

afterEach(() => {
    vi.useRealTimers();
});

describe('playingSignature', () => {
    it('tells a track, its source and whether it plays', () => {
        const base = playingSignature(state(source()));
        expect(playingSignature(state(source({ elapsed: 260, artist: 'Someone' })))).toBe(base);
        expect(playingSignature(state(source({ title: 'Freddie Freeloader', content_item_id: 'b.flac' })))).not.toBe(base);
        expect(playingSignature(state(source({ playback_status: 'Paused' })))).not.toBe(base);
        expect(playingSignature(state(source({ playing: false })))).toBe(playingSignature(state()));
    });

    it('a station is its station, whatever song it announces', () => {
        expect(playingSignature(state(radio('Le 18/20')))).toBe(playingSignature(state(radio('Le journal'))));
        expect(playingSignature(state(radio('Le 18/20')))).not.toBe(
            playingSignature(state(radio('Le 18/20', { origin_name: 'FIP' }))));
    });

    it('two sources, in whatever order the state lists them', () => {
        const airplay = source({ source_id: 'src_airplay', control_id: 'src_airplay', origin: 'airplay', title: 'AURA' });
        expect(playingSignature(state(source(), airplay))).toBe(playingSignature(state(airplay, source())));
    });

    it('reads a state with nothing in it', () => {
        expect(playingSignature(null)).toBe('[]');
        expect(playingSignature({})).toBe('[]');
    });
});

describe('untilCounted', () => {
    it('waits for what plays to reach the seconds that count, a second past', () => {
        expect(untilCounted(state(source({ elapsed: 0 })), 30)).toBe(31_000);
        expect(untilCounted(state(source({ elapsed: 12 })), 30)).toBe(19_000);
        expect(untilCounted(state(source({ elapsed: null })), 30)).toBe(31_000);
    });

    it('waits for nothing when all counts already, is paused, or nothing is asked', () => {
        expect(untilCounted(state(source({ elapsed: 30 })), 30)).toBe(null);
        expect(untilCounted(state(source({ elapsed: 0, playback_status: 'Paused' })), 30)).toBe(null);
        expect(untilCounted(state(), 30)).toBe(null);
        expect(untilCounted(state(source({ elapsed: 0 })), 0)).toBe(null);
    });

    it('waits for the last of two sources to count', () => {
        const airplay = source({ source_id: 'src_airplay', elapsed: 25 });
        expect(untilCounted(state(source({ elapsed: 5 }), airplay), 30)).toBe(26_000);
    });
});

describe('PlayerChangeController', () => {
    it('follows only once asked, and once however often asked', () => {
        const host = makeHost();
        const ctl = new PlayerChangeController(host, vi.fn());
        expect(host.addController).toHaveBeenCalledWith(ctl);
        expect(subscribePlayerState).not.toHaveBeenCalled();
        ctl.follow(true);
        ctl.follow(true);
        expect(subscribePlayerState).toHaveBeenCalledTimes(1);
        ctl.follow(false);
        expect(store.unsubscribe).toHaveBeenCalledTimes(1);
    });

    it('calls back once a change has settled, once for its burst of states', () => {
        const onChange = vi.fn();
        const ctl = new PlayerChangeController(makeHost(), onChange);
        ctl.follow(true);
        send(state(source()));                       // the first: what the view just read
        send(state(source({ elapsed: 202 })));
        vi.advanceTimersByTime(SETTLE_MS * 2);
        expect(onChange).not.toHaveBeenCalled();
        send(state(source({ title: 'Freddie Freeloader', content_item_id: 'b.flac' })));
        send(state(source({ title: 'Freddie Freeloader', content_item_id: 'b.flac', artist: 'Miles' })));
        send(state(source({ title: 'Freddie Freeloader', content_item_id: 'b.flac', playback_status: 'Paused' })));
        vi.advanceTimersByTime(SETTLE_MS - 1);
        expect(onChange).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(onChange).toHaveBeenCalledTimes(1);
        ctl.follow(false);
    });

    it("a station's next song is no change", () => {
        const onChange = vi.fn();
        const ctl = new PlayerChangeController(makeHost(), onChange);
        ctl.follow(true);
        send(state(radio('Le 18/20')));
        send(state(radio('Le journal')));
        vi.advanceTimersByTime(60_000);
        expect(onChange).not.toHaveBeenCalled();
        ctl.follow(false);
    });

    it('calls back again once a track just started has played the seconds that count', () => {
        const onChange = vi.fn();
        const ctl = new PlayerChangeController(makeHost(), onChange, { counts: 30 });
        ctl.follow(true);
        send(state(source()));
        send(state(source({ title: 'Freddie Freeloader', content_item_id: 'b.flac', elapsed: 0 })));
        vi.advanceTimersByTime(SETTLE_MS);
        expect(onChange).toHaveBeenCalledTimes(1);   // the listen over, written
        vi.advanceTimersByTime(31_000 - SETTLE_MS);
        expect(onChange).toHaveBeenCalledTimes(2);   // the new one, counting now
        vi.advanceTimersByTime(600_000);
        expect(onChange).toHaveBeenCalledTimes(2);
        ctl.follow(false);
    });

    it('a view opened on a track just started reads again once it counts', () => {
        const onChange = vi.fn();
        const ctl = new PlayerChangeController(makeHost(), onChange, { counts: 30 });
        ctl.follow(true);
        send(state(source({ elapsed: 10 })));
        vi.advanceTimersByTime(20_999);
        expect(onChange).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(onChange).toHaveBeenCalledTimes(1);
        ctl.follow(false);
    });

    it('calls back when the page comes back', () => {
        const onChange = vi.fn();
        const ctl = new PlayerChangeController(makeHost(), onChange);
        ctl.follow(true);
        send(state(source()));
        document.dispatchEvent(new Event('visibilitychange'));
        vi.advanceTimersByTime(SETTLE_MS);
        expect(onChange).toHaveBeenCalledTimes(1);
        ctl.follow(false);
        document.dispatchEvent(new Event('visibilitychange'));
        vi.advanceTimersByTime(SETTLE_MS);
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('stops with the view, timers too, and takes up again when it returns', () => {
        const onChange = vi.fn();
        const ctl = new PlayerChangeController(makeHost(), onChange, { counts: 30 });
        ctl.follow(true);
        send(state(source({ elapsed: 0 })));
        ctl.hostDisconnected();
        expect(store.unsubscribe).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(60_000);
        expect(onChange).not.toHaveBeenCalled();
        ctl.hostConnected();
        expect(subscribePlayerState).toHaveBeenCalledTimes(2);
        // Taken up afresh: its first state is what the view shows, no change.
        send(state(source({ title: 'Freddie Freeloader', content_item_id: 'b.flac' })));
        vi.advanceTimersByTime(SETTLE_MS);
        expect(onChange).not.toHaveBeenCalled();
        ctl.follow(false);
        ctl.hostConnected();
        expect(subscribePlayerState).toHaveBeenCalledTimes(2);
    });
});
