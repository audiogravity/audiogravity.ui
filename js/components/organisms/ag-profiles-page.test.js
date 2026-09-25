/**
 * Unit tests for ag-profiles-page.js (logic only, no DOM mount): a profile switch
 * whose end is never announced stops being waited for.
 *
 * On 2026-09-24 every tile of the Profiles tab stayed PENDING on the x86 box: a
 * service restarting in a loop held the core's answer back, and nothing on the page
 * ever gave up waiting for it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class {
        connectedCallback() {}
        disconnectedCallback() {}
        requestUpdate() {}
    },
    html: (strings, ...values) => ({ strings, values }),
}));
vi.mock('../../api.js', () => ({ apiGet: vi.fn(), apiPost: vi.fn() }));
vi.mock('../../ui-helpers.js', () => ({
    showToast: vi.fn(), showConfirm: vi.fn(), handleError: vi.fn(), getUserFriendlyError: vi.fn(),
}));
vi.mock('../../common.js', () => ({
    AppState: {}, EventEmitter: { emit: vi.fn(), on: vi.fn(), off: vi.fn() }, AgTimerManager: {},
}));
vi.mock('../../history.js', () => ({ addToHistory: vi.fn() }));
vi.mock('../../core/FetchController.js', () => ({ FetchController: class {} }));
vi.mock('@lit/context', () => ({ ContextConsumer: class {} }));
vi.mock('../../core/app-context.js', () => ({ appContext: {} }));
vi.mock('../molecules/ag-profile-detail-modal.js', () => ({}));
vi.mock('../atoms/ag-filter-bar.js', () => ({}));
vi.mock('./ag-card-grid.js', () => ({}));
vi.mock('../molecules/ag-profile-card.js', () => ({}));

import { apiPost } from '../../api.js';
import { showToast, showConfirm } from '../../ui-helpers.js';
import { AgProfilesPage, PROFILE_PENDING_TIMEOUT_MS } from './ag-profiles-page.js';

function makeEl() {
    const el = Object.create(AgProfilesPage.prototype);
    el.profiles = [{ id: 'mpd', name: 'MPD', state: 'inactive' }];
    el.activeProfiles = [];
    el._loadProfiles = vi.fn();
    el.connectedCallback();          // makes the pending map and listens for the core's answer
    return el;
}

/** The core announcing where a profile ended up, as sse.js relays it. */
function announce(profileId, state) {
    window.dispatchEvent(new CustomEvent('profile-state-update', {
        detail: { profile_id: profileId, new_state: state, success: true },
    }));
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    showConfirm.mockResolvedValue(true);
    apiPost.mockResolvedValue({ pending: true });
});

afterEach(() => {
    vi.useRealTimers();
});

describe('ag-profiles-page — a switch that never reports back', () => {
    it('is waited for no longer than the core can take, then the profiles are read again', async () => {
        const el = makeEl();
        await el._handleToggleProfile({ detail: { profileId: 'mpd' } });
        expect(el.profiles[0].state).toBe('activating');          // the tile shows PENDING

        vi.advanceTimersByTime(PROFILE_PENDING_TIMEOUT_MS - 1);
        expect(el._loadProfiles).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(el._loadProfiles).toHaveBeenCalledTimes(1);
        expect(el._pendingProfiles.size).toBe(0);
        expect(showToast).toHaveBeenCalledWith(
            'warning', 'No answer from the profile', expect.stringContaining('MPD'), 6000);
        el.disconnectedCallback();
    });

    it('waits longer than the core gives a switch: 30 s to stop, 30 s to start', () => {
        expect(PROFILE_PENDING_TIMEOUT_MS).toBeGreaterThan(60000);
    });

    it('is not read again when the core answers in time', async () => {
        const el = makeEl();
        await el._handleToggleProfile({ detail: { profileId: 'mpd' } });
        announce('mpd', 'active');
        expect(el.profiles[0].state).toBe('active');
        expect(vi.getTimerCount()).toBe(0);                          // no stray wait left behind
        vi.advanceTimersByTime(PROFILE_PENDING_TIMEOUT_MS * 2);
        expect(el._loadProfiles).not.toHaveBeenCalled();
        el.disconnectedCallback();
    });

    it('keeps waiting through an answer that is itself still in transition', async () => {
        const el = makeEl();
        await el._handleToggleProfile({ detail: { profileId: 'mpd' } });
        announce('mpd', 'activating');
        vi.advanceTimersByTime(PROFILE_PENDING_TIMEOUT_MS);
        expect(el._loadProfiles).toHaveBeenCalledTimes(1);
        el.disconnectedCallback();
    });

    it('settles at once a switch whose end arrived before the answer', async () => {
        // The core starts the switch before it answers: with nothing to do, its end
        // can reach the page first. It used to leave a wait armed, and a false
        // "No answer" 75 s later.
        let answer;
        apiPost.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
        const el = makeEl();
        const toggling = el._handleToggleProfile({ detail: { profileId: 'mpd' } });
        for (let i = 0; i < 5; i++) await Promise.resolve();       // the request is out
        expect(apiPost).toHaveBeenCalled();
        announce('mpd', 'active');
        answer({ pending: true });
        await toggling;
        expect(vi.getTimerCount()).toBe(0);
        expect(showToast).toHaveBeenCalledWith('success', 'Profile Activated', 'MPD');
        vi.advanceTimersByTime(PROFILE_PENDING_TIMEOUT_MS * 2);
        expect(el._loadProfiles).not.toHaveBeenCalled();
        el.disconnectedCallback();
    });

    it('does not take an end announced before the request for the request\'s own', async () => {
        const el = makeEl();
        announce('mpd', 'inactive');                                // an older change
        await el._handleToggleProfile({ detail: { profileId: 'mpd' } });
        expect(el._pendingProfiles.has('mpd')).toBe(true);
        expect(vi.getTimerCount()).toBe(1);
        el.disconnectedCallback();
    });

    it('arms one wait per profile, however often it is asked', async () => {
        // A refresh can re-enable the tile while a switch is pending: the first wait
        // was left armed, and fired 75 s later against the second request.
        const el = makeEl();
        await el._handleToggleProfile({ detail: { profileId: 'mpd' } });
        el.profiles[0] = { ...el.profiles[0], state: 'inactive' };   // a refresh re-enabled it
        await el._handleToggleProfile({ detail: { profileId: 'mpd' } });
        expect(vi.getTimerCount()).toBe(1);
        vi.advanceTimersByTime(PROFILE_PENDING_TIMEOUT_MS);
        expect(el._loadProfiles).toHaveBeenCalledTimes(1);
        expect(showToast).toHaveBeenCalledTimes(1);
        el.disconnectedCallback();
    });

    it('stops every wait when the page goes away', async () => {
        const el = makeEl();
        await el._handleToggleProfile({ detail: { profileId: 'mpd' } });
        el.disconnectedCallback();
        expect(vi.getTimerCount()).toBe(0);
        vi.advanceTimersByTime(PROFILE_PENDING_TIMEOUT_MS * 2);
        expect(el._loadProfiles).not.toHaveBeenCalled();
    });
});
