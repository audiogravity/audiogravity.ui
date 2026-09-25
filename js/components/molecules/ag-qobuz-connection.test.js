/**
 * Unit tests for ag-qobuz-connection.
 *
 * Covers the line under the account name: what Qobuz will actually play, which
 * is not what AG asks for once the plan has ended. The subscribed/unknown rule
 * itself is tested once, in library-store.test.js.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class { connectedCallback() {} },
    html: (strings, ...values) => ({ strings, values }),
    nothing: null,
}));
vi.mock('../../api.js', () => ({ apiGet: vi.fn(), apiPost: vi.fn(), apiDelete: vi.fn() }));
vi.mock('../../ui-helpers.js', () => ({ showToast: vi.fn() }));
vi.mock('../utils-lit.js', () => ({ loadConnection: vi.fn() }));
vi.mock('../../library-store.js', () => ({
    hasSubscription: (conn) => conn?.has_subscription !== false,
}));
vi.mock('../atoms/ag-status-indicator.js', () => ({}));

import { apiPost } from '../../api.js';
import { showToast } from '../../ui-helpers.js';
import { AgQobuzConnection } from './ag-qobuz-connection.js';

/** Read the description line for a connection state, without mounting. */
function desc(connection) {
    const el = Object.create(AgQobuzConnection.prototype);
    el._connection = connection;
    return el._connectedDesc;
}

describe('AgQobuzConnection connected description', () => {
    it('shows the plan and the format on a subscribed account', () => {
        expect(desc({ connected: true, subscription: 'Studio', format_id: 27,
                      has_subscription: true })).toBe('Studio · Hi-Res 24/192');
    });

    it('replaces the whole line when the plan has ended', () => {
        // "Studio · Hi-Res 24/192" would state the opposite of what is heard:
        // Qobuz serves 30-second MP3 excerpts to such an account.
        const line = desc({ connected: true, subscription: 'NO SUBSCRIPTION',
                            format_id: 27, has_subscription: false });
        expect(line).toBe('No subscription · 30-second previews');
        expect(line).not.toContain('Hi-Res');
    });

    it('reads an unknown answer as subscribed', () => {
        expect(desc({ connected: true, subscription: 'Studio', format_id: 27,
                      has_subscription: null })).toBe('Studio · Hi-Res 24/192');
        expect(desc({ connected: true, subscription: 'Studio', format_id: 27 }))
            .toBe('Studio · Hi-Res 24/192');
    });

    it('falls back to Active when the plan carries no name', () => {
        expect(desc({ connected: true, format_id: 6, has_subscription: true }))
            .toBe('Active · FLAC 16/44');
    });

    it('names an unknown format id rather than hiding it', () => {
        expect(desc({ connected: true, subscription: 'Studio', format_id: 99,
                      has_subscription: true })).toBe('Studio · Format 99');
    });
});

// The sign-in window. Chromium blocked a window opened 6 s after the click, and the
// new-tab fallback with it; the core may take a minute to answer on a slow line, since
// it downloads Qobuz's 9 MB web player first (measured on 2026-09-25).
describe('AgQobuzConnection sign-in window', () => {
    const OAUTH_URL = 'https://www.qobuz.com/signin/oauth?ext_app_id=1';
    let open;

    /** A card with its rendering left out, and a stand-in for the popup window. */
    function setup(popup = { closed: false, close: vi.fn(), location: { href: 'about:blank' } }) {
        const el = Object.create(AgQobuzConnection.prototype);
        el._connecting = false;
        el._startPolling = vi.fn();
        open = vi.spyOn(window, 'open').mockReturnValue(popup);
        return { el, popup };
    }

    beforeEach(() => vi.clearAllMocks());
    afterEach(() => open?.mockRestore());

    it('opens the window on the click, before the box has answered', async () => {
        let answer;
        apiPost.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
        const { el, popup } = setup();
        const connecting = el._connect();
        expect(open).toHaveBeenCalledTimes(1);          // still inside the click
        expect(open.mock.calls[0][0]).toBe('about:blank');
        answer({ oauth_url: OAUTH_URL });
        await connecting;
        expect(popup.location.href).toBe(OAUTH_URL);
        expect(el._oauthPopup).toBe(popup);
        expect(el._startPolling).toHaveBeenCalled();
    });

    it('closes the window and says why, in the core\'s words, when the sign-in cannot start', async () => {
        const detail = 'Could not start Qobuz sign-in: Qobuz took too long to send its web player: '
            + 'the connection is too slow. Try again.';
        apiPost.mockRejectedValue(Object.assign(new Error('HTTP 502'), { detail }));
        const { el, popup } = setup();
        await el._connect();
        expect(popup.close).toHaveBeenCalled();
        expect(showToast).toHaveBeenCalledWith('error', 'Qobuz sign-in failed', detail);
        expect(el._connecting).toBe(false);
        expect(el._startPolling).not.toHaveBeenCalled();
    });

    it('reads an answer without an address as a failure, not as a wait', async () => {
        // It used to leave the button on "Waiting for login…", disabled, for good.
        apiPost.mockResolvedValue({});
        const { el, popup } = setup();
        await el._connect();
        expect(popup.close).toHaveBeenCalled();
        expect(showToast).toHaveBeenCalledWith(
            'error', 'Qobuz sign-in failed', 'The box gave no Qobuz sign-in address.');
        expect(el._connecting).toBe(false);
    });

    it('falls back to a tab when the window was blocked even on the click', async () => {
        apiPost.mockResolvedValue({ oauth_url: OAUTH_URL });
        const { el } = setup(null);
        await el._connect();
        expect(open).toHaveBeenLastCalledWith(OAUTH_URL, '_blank');
        expect(el._startPolling).toHaveBeenCalled();
    });

    it('stops when the window was closed while the box was answering', async () => {
        apiPost.mockResolvedValue({ oauth_url: OAUTH_URL });
        const { el, popup } = setup({ closed: true, close: vi.fn(), location: { href: 'about:blank' } });
        await el._connect();
        expect(popup.location.href).toBe('about:blank');
        expect(open).toHaveBeenCalledTimes(1);          // no tab opened behind the user's back
        expect(el._startPolling).not.toHaveBeenCalled();
        expect(el._connecting).toBe(false);
    });
});
