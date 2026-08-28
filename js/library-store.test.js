/**
 * Unit tests for library-store.js — subscribeRendererStatus.
 *
 * Covers Fix 5 (DRY SSE): all 3 components previously subscribed independently
 * to window 'renderer-status-update'. The store now owns the single window
 * listener and multiplexes to registered callbacks.
 */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';

// Stub modules that library-store.js may import transitively.
vi.mock('./api.js', () => ({ apiGet: vi.fn(), buildAuthedUrl: vi.fn((path) => path) }));
vi.mock('./ui-helpers.js', () => ({
    showToast: vi.fn(),
    showConfirm: vi.fn(),
    handleError: vi.fn(),
    getUserFriendlyError: vi.fn(),
    showPasswordConfirm: vi.fn(),
    copyToClipboard: vi.fn(),
}));

// Provide a minimal window mock if not available (jsdom provides it in vitest).
// The subscribeRendererStatus tests rely on window.dispatchEvent.

import { subscribeRendererStatus, getOfflinePlayerSnapshot } from './library-store.js';

describe('subscribeRendererStatus', () => {
    it('invokes callback when renderer-status-update event fires', () => {
        const cb = vi.fn();
        const unsub = subscribeRendererStatus(cb);

        window.dispatchEvent(new CustomEvent('renderer-status-update', {
            detail: { connected: true, transport_state: 'PLAYING', renderer_name: 'music.#1' },
        }));

        expect(cb).toHaveBeenCalledOnce();
        expect(cb).toHaveBeenCalledWith(expect.objectContaining({ transport_state: 'PLAYING' }));
        unsub();
    });

    it('stops invoking callback after unsubscribe', () => {
        const cb = vi.fn();
        const unsub = subscribeRendererStatus(cb);
        unsub();

        window.dispatchEvent(new CustomEvent('renderer-status-update', {
            detail: { connected: false },
        }));

        expect(cb).not.toHaveBeenCalled();
    });

    it('supports multiple independent subscribers', () => {
        const cb1 = vi.fn();
        const cb2 = vi.fn();
        const unsub1 = subscribeRendererStatus(cb1);
        const unsub2 = subscribeRendererStatus(cb2);

        window.dispatchEvent(new CustomEvent('renderer-status-update', {
            detail: { connected: true },
        }));

        expect(cb1).toHaveBeenCalledOnce();
        expect(cb2).toHaveBeenCalledOnce();
        unsub1();
        unsub2();
    });

    it('does not invoke other subscribers after one unsubscribes', () => {
        const cb1 = vi.fn();
        const cb2 = vi.fn();
        const unsub1 = subscribeRendererStatus(cb1);
        const unsub2 = subscribeRendererStatus(cb2);
        unsub1();

        window.dispatchEvent(new CustomEvent('renderer-status-update', {
            detail: { connected: true },
        }));

        expect(cb1).not.toHaveBeenCalled();
        expect(cb2).toHaveBeenCalledOnce();
        unsub2();
    });

    it('ignores events with null detail', () => {
        const cb = vi.fn();
        const unsub = subscribeRendererStatus(cb);

        window.dispatchEvent(new CustomEvent('renderer-status-update', { detail: null }));

        expect(cb).not.toHaveBeenCalled();
        unsub();
    });

    it('isolates callback errors — one failing callback does not prevent others', () => {
        const bad = vi.fn(() => { throw new Error('boom'); });
        const good = vi.fn();
        const unsub1 = subscribeRendererStatus(bad);
        const unsub2 = subscribeRendererStatus(good);

        expect(() => window.dispatchEvent(new CustomEvent('renderer-status-update', {
            detail: { connected: true },
        }))).not.toThrow();

        expect(good).toHaveBeenCalledOnce();
        unsub1();
        unsub2();
    });
});

// ── getOfflinePlayerSnapshot ──────────────────────────────────────────────────

describe('getOfflinePlayerSnapshot', () => {
    const KEY = 'ag_snapshot_player_state';

    beforeEach(() => localStorage.clear());
    afterEach(() => localStorage.clear());

    it('returns null when localStorage is empty', () => {
        expect(getOfflinePlayerSnapshot()).toBeNull();
    });

    it('returns the parsed object when a valid snapshot exists', () => {
        const state = { sources: [{ source_id: 'src_mpd', title: 'Test' }] };
        localStorage.setItem(KEY, JSON.stringify(state));
        expect(getOfflinePlayerSnapshot()).toEqual(state);
    });

    it('returns null when localStorage contains malformed JSON', () => {
        localStorage.setItem(KEY, '{broken json{{');
        expect(getOfflinePlayerSnapshot()).toBeNull();
    });

    it('returns null for empty string value', () => {
        localStorage.setItem(KEY, '');
        expect(getOfflinePlayerSnapshot()).toBeNull();
    });
});

// ── pwa-install-prompt: _isDismissed / _markDismissed ────────────────────────
// These are module-private functions; we test them indirectly via localStorage.

describe('pwa-install-prompt dismiss persistence', () => {
    const DISMISS_KEY = 'ag_pwa_install_dismissed';
    const TTL_MS      = 30 * 24 * 60 * 60 * 1000;

    beforeEach(() => localStorage.clear());
    afterEach(() => localStorage.clear());

    it('banner is not dismissed when localStorage is empty', () => {
        expect(localStorage.getItem(DISMISS_KEY)).toBeNull();
    });

    it('sets a numeric timestamp string on dismiss', () => {
        const before = Date.now();
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
        const after = Date.now();
        const ts = parseInt(localStorage.getItem(DISMISS_KEY), 10);
        expect(ts).toBeGreaterThanOrEqual(before);
        expect(ts).toBeLessThanOrEqual(after);
    });

    it('is considered dismissed when timestamp is recent (< 30 days)', () => {
        const recent = Date.now() - 1000; // 1 second ago
        localStorage.setItem(DISMISS_KEY, String(recent));
        const ts = parseInt(localStorage.getItem(DISMISS_KEY), 10);
        expect(Date.now() - ts).toBeLessThan(TTL_MS);
    });

    it('is NOT considered dismissed when timestamp is older than 30 days', () => {
        const old = Date.now() - TTL_MS - 1000;
        localStorage.setItem(DISMISS_KEY, String(old));
        const ts = parseInt(localStorage.getItem(DISMISS_KEY), 10);
        expect(Date.now() - ts).toBeGreaterThanOrEqual(TTL_MS);
    });
});

// ---------------------------------------------------------------------------
// notifyOutputError — toast when the active output cannot play
// ---------------------------------------------------------------------------
// The reason for the silence used to be readable only in the fullscreen player,
// so pressing play on a DAC held by another service looked like a no-op.

import { notifyOutputError } from './library-store.js';
import { showToast } from './ui-helpers.js';

const BUSY = 'Failed to open ALSA device "hw:0,0": Device or resource busy';

/** Build a PlayerState carrying an active output with the given error. */
function stateWithError(error) {
    return { outputs: [{ id: 'dac', active: true, error }] };
}

describe('notifyOutputError', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        notifyOutputError(stateWithError(null)); // re-arm the edge detector
        vi.clearAllMocks();
    });

    it('raises a toast when the active output starts failing', () => {
        notifyOutputError(stateWithError(BUSY));
        expect(showToast).toHaveBeenCalledTimes(1);
        const [type, title, message] = showToast.mock.calls[0];
        expect(type).toBe('error');
        expect(title).toBe('Playback blocked');
        expect(message).toMatch(/in use by another player/);
    });

    it('does not repeat the toast while the same failure persists', () => {
        // State events arrive every second; only the transition may notify.
        notifyOutputError(stateWithError(BUSY));
        notifyOutputError(stateWithError(BUSY));
        notifyOutputError(stateWithError(BUSY));
        expect(showToast).toHaveBeenCalledTimes(1);
    });

    it('announces a different failure even without recovery in between', () => {
        notifyOutputError(stateWithError(BUSY));
        notifyOutputError(stateWithError('Failed to open "Heed" (alsa); No such device'));
        expect(showToast).toHaveBeenCalledTimes(2);
        expect(showToast.mock.calls[1][2]).toBe('Output unavailable');
    });

    it('re-arms after recovery so the next failure is announced again', () => {
        notifyOutputError(stateWithError(BUSY));
        notifyOutputError(stateWithError(null));   // recovered — no toast
        notifyOutputError(stateWithError(BUSY));
        expect(showToast).toHaveBeenCalledTimes(2);
    });

    it('stays silent when the output is healthy', () => {
        notifyOutputError(stateWithError(null));
        notifyOutputError({ outputs: [] });
        notifyOutputError(null);
        expect(showToast).not.toHaveBeenCalled();
    });

    it('ignores an error on an output that is not active', () => {
        notifyOutputError({ outputs: [{ id: 'dac', active: false, error: BUSY }] });
        expect(showToast).not.toHaveBeenCalled();
    });
});


// ---------------------------------------------------------------------------
// getSnapshot — the cache must be skippable
// ---------------------------------------------------------------------------
// Connecting or disconnecting a source changes the source list on the box. The
// UI then re-reads it — and a cached-but-stale snapshot would answer with the
// state from before the change, which is the whole bug this option exists for.

import { getSnapshot } from './library-store.js';
import { apiGet as _apiGet } from './api.js';

describe('getSnapshot', () => {
    beforeEach(() => { _apiGet.mockReset(); });

    it('serves the cached value on a second call', async () => {
        _apiGet.mockResolvedValue({ sources: [{ source_id: 'src_mpd' }] });
        await getSnapshot();
        await getSnapshot();
        expect(_apiGet).toHaveBeenCalledTimes(1);
    });

    it('refetches when forced, and returns the new list', async () => {
        // The cache is warm from the previous test — exactly the situation a
        // connect/disconnect lands in.
        _apiGet.mockResolvedValue({
            sources: [{ source_id: 'src_mpd' }, { source_id: 'src_highresaudio' }],
        });
        const cached = await getSnapshot();
        expect(_apiGet).not.toHaveBeenCalled();          // still the stale one
        expect(cached.sources.map(s => s.source_id)).not.toContain('src_highresaudio');

        const fresh = await getSnapshot({ force: true });
        expect(_apiGet).toHaveBeenCalledTimes(1);
        expect(fresh.sources.map(s => s.source_id)).toContain('src_highresaudio');
    });
});

// ---------------------------------------------------------------------------
// getHraCategories — the pill bar of the HIGHRESAUDIO browse
//
// The list is fixed for an account, so it is worth caching for the page; an EMPTY
// list is not. HRA reports several failures as a 200 with nothing in it, the core
// passes that on as [], and cached it would leave the bar showing Favorites alone
// with nothing able to ask again on a screen that stays open for days.
// ---------------------------------------------------------------------------

import { getHraCategories } from './library-store.js';

describe('getHraCategories', () => {
    const CATS = [{ title: 'Hörtipps', label: 'Listening Tips' }];

    beforeEach(() => { _apiGet.mockReset(); });

    it('asks the core again after an empty answer', async () => {
        _apiGet.mockResolvedValueOnce([]);
        expect(await getHraCategories()).toEqual([]);
        _apiGet.mockResolvedValueOnce(CATS);
        expect(await getHraCategories()).toEqual(CATS);
        expect(_apiGet).toHaveBeenCalledTimes(2);
    });

    it('serves the cached list once it has one', async () => {
        // Warm from the previous case.
        expect(await getHraCategories()).toEqual(CATS);
        expect(_apiGet).not.toHaveBeenCalled();
    });

    it('refetches when forced', async () => {
        _apiGet.mockResolvedValue(CATS);
        await getHraCategories({ force: true });
        expect(_apiGet).toHaveBeenCalledTimes(1);
    });

    it('answers with an empty list rather than throwing when the core is unreachable', async () => {
        _apiGet.mockRejectedValue(new Error('503'));
        expect(await getHraCategories({ force: true })).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// getHraConnection — the one bit the browse needs: does the account subscribe?
//
// An account with purchases and no subscription is signed in all the same, and
// can play its purchases only. The browse reads `has_subscription` to offer it
// the Vault alone; anything it cannot read is "subscribed", the state every
// account had before the field existed.
// ---------------------------------------------------------------------------

import {
    getHraConnection, rememberHraConnection, forgetHraAccount, hraHasSubscription,
    getHraGenres, getFavoriteAlbumIds,
} from './library-store.js';

describe('hraHasSubscription', () => {
    it('narrows only on an explicit false — absent, null and unknown all read as subscribed', () => {
        expect(hraHasSubscription({ has_subscription: false })).toBe(false);
        expect(hraHasSubscription({ has_subscription: true })).toBe(true);
        expect(hraHasSubscription({ connected: true })).toBe(true);   // core predates the field
        expect(hraHasSubscription(null)).toBe(true);                  // no answer at all
    });
});

describe('getHraConnection', () => {
    const CONN = { connected: true, username: 'a@b.co', has_subscription: false };

    beforeEach(() => { _apiGet.mockReset(); forgetHraAccount(); });

    it('reads /highresaudio/connection and hands the object through', async () => {
        _apiGet.mockResolvedValueOnce(CONN);
        expect(await getHraConnection()).toEqual(CONN);
        expect(_apiGet).toHaveBeenCalledWith('/highresaudio/connection');
    });

    it('serves the cached answer to the next pill switch', async () => {
        _apiGet.mockResolvedValueOnce(CONN);
        await getHraConnection();
        expect(await getHraConnection()).toEqual(CONN);
        expect(_apiGet).toHaveBeenCalledTimes(1);
    });

    it('asks again once the sources card forgot it — a new account must not inherit the old answer', async () => {
        _apiGet.mockResolvedValueOnce(CONN);
        await getHraConnection();
        forgetHraAccount();
        _apiGet.mockResolvedValueOnce({ ...CONN, has_subscription: true });
        expect((await getHraConnection()).has_subscription).toBe(true);
        expect(_apiGet).toHaveBeenCalledTimes(2);
    });

    it('a request in flight when the account changes can neither stamp the cache nor answer for it', async () => {
        // The forget-between-completed-fetches case above is the easy half. The
        // defect this pins: sign-out/sign-in while a GET is still in the air — the
        // old account's answer must not land in the new account's cache, and a
        // caller asking AFTER the change must get a fresh fetch, not the old flight.
        const OLD = { connected: true, username: 'old@x', has_subscription: true };
        const NEW = { connected: true, username: 'new@x', has_subscription: false };
        let resolveOld;
        _apiGet.mockReturnValueOnce(new Promise((r) => { resolveOld = r; }));
        const askedBefore = getHraConnection();     // the old account's flight
        forgetHraAccount();
        _apiGet.mockResolvedValueOnce(NEW);
        const askedAfter = getHraConnection();      // must open its own flight
        resolveOld(OLD);                            // the old answer lands late
        expect(await askedAfter).toEqual(NEW);
        expect(await askedBefore).not.toEqual(OLD); // never the forgotten account
        // And the cache holds the new account's answer, not the resurrected one.
        _apiGet.mockClear();
        expect(await getHraConnection()).toEqual(NEW);
        expect(_apiGet).not.toHaveBeenCalled();
    });

    it('a sign-in seeds the cache from the POST body — no second round-trip for the browse', async () => {
        rememberHraConnection(CONN);
        expect(await getHraConnection()).toEqual(CONN);
        expect(_apiGet).not.toHaveBeenCalled();
    });

    it('seeding with something unusable leaves the cache empty rather than poisoned', async () => {
        rememberHraConnection('not an object');
        _apiGet.mockResolvedValueOnce(CONN);
        expect(await getHraConnection()).toEqual(CONN);
        expect(_apiGet).toHaveBeenCalledTimes(1);
    });

    it('answers null rather than throwing when the core is unreachable, and does not keep it', async () => {
        _apiGet.mockRejectedValueOnce(new Error('503'));
        expect(await getHraConnection()).toBeNull();
        _apiGet.mockResolvedValueOnce(CONN);
        expect(await getHraConnection()).toEqual(CONN);
        expect(_apiGet).toHaveBeenCalledTimes(2);
    });

    it('answers null to a body that is not an object, and never caches it', async () => {
        // A truthy non-object, deliberately — null would pass even with the guard on
        // the read path only, since a falsy value cannot be stamped anywhere. What
        // this pins is sanitize-at-the-WRITE: a proxy's maintenance page must not
        // become a "fresh" cache entry that every later hit serves raw.
        _apiGet.mockResolvedValueOnce('<html>maintenance</html>');
        expect(await getHraConnection()).toBeNull();
        _apiGet.mockResolvedValueOnce(CONN);
        expect(await getHraConnection()).toEqual(CONN);
        expect(_apiGet).toHaveBeenCalledTimes(2);
        // And the plain 204 → null case still holds.
        forgetHraAccount();
        _apiGet.mockReset().mockResolvedValueOnce(null);
        expect(await getHraConnection()).toBeNull();
    });
});

describe('forgetHraAccount', () => {
    beforeEach(() => { _apiGet.mockReset(); forgetHraAccount(); });

    it('drops every cache scoped to the account — favourites and genres too, not just the connection', async () => {
        // Kept, the previous account's stars would show AND write against the new
        // account for the length of their TTLs (the genres claim "fixed for an
        // account" in their own cache comment — for AN account, not for all).
        _apiGet.mockResolvedValueOnce(['alb1']);                                  // ★ ids
        await getFavoriteAlbumIds('src_highresaudio');
        _apiGet.mockResolvedValueOnce([{ title: 'Jazz', path: 'Jazz' }]);         // genres
        await getHraGenres();
        expect(_apiGet).toHaveBeenCalledTimes(2);
        forgetHraAccount();
        _apiGet.mockResolvedValueOnce([]);
        await getFavoriteAlbumIds('src_highresaudio');
        _apiGet.mockResolvedValueOnce([]);
        await getHraGenres();
        expect(_apiGet).toHaveBeenCalledTimes(4);   // both were re-asked, not served
    });
});
