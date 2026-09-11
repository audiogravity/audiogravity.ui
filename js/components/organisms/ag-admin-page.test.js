/**
 * Guards for the Admin page's user list after the connected-users counter was
 * dropped from the sidebar.
 *
 * Two things are locked down here. First, the page must not emit `users-stats`
 * any more — that event fed the "connected / accounts" counter next to the Admin
 * tab, which is gone on both ends. Second, `fetchFn` and `onSuccess` must agree
 * on the key holding the online users: they did not, and while the counter
 * existed the mismatch threw a TypeError that surfaced as a load error. With the
 * emit removed, nothing dereferenced the missing key any more, so the same
 * mismatch would have quietly left `activeUsers` undefined — and render() calls
 * `.includes()` on it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class { requestUpdate() {} connectedCallback() {} disconnectedCallback() {} },
    html: (strings, ...values) => ({ strings, values }),
}));
vi.mock('../../common.js', () => ({
    apiCall: vi.fn(), apiGet: vi.fn(), apiPost: vi.fn(),
    showToast: vi.fn(), showConfirm: vi.fn(), handleError: vi.fn(),
    AppState: { currentTab: 'admin' }, escapeHtml: (s) => s, addToHistory: vi.fn(),
}));
vi.mock('../../auth.js', () => ({ getCurrentUser: vi.fn(), isAdmin: vi.fn(() => true) }));
vi.mock('../../core/FetchController.js', () => ({
    FetchController: class { constructor(_host, opts) { this.opts = opts; } fetch() { return Promise.resolve(); } },
}));
vi.mock('@lit/context', () => ({ ContextConsumer: class {} }));
vi.mock('../../core/app-context.js', () => ({ appContext: {} }));
vi.mock('../molecules/ag-announcement-banner.js', () => ({}));
vi.mock('../molecules/ag-update-banner.js', () => ({}));
vi.mock('../molecules/ag-version-skew-banner.js', () => ({}));
vi.mock('./ag-card-grid.js', () => ({}));
vi.mock('../molecules/ag-license-activation.js', () => ({}));
vi.mock('../molecules/ag-license-status.js', () => ({}));
vi.mock('../molecules/ag-license-verify.js', () => ({}));
vi.mock('../molecules/ag-user-card.js', () => ({}));

import { apiGet } from '../../common.js';
import { isAdmin } from '../../auth.js';
import { AgAdminPage } from './ag-admin-page.js';

describe('ag-admin-page — no connected-users counter', () => {
    let emitted;

    beforeEach(() => {
        emitted = [];
        window.EventEmitter = { emit: (name, payload) => emitted.push([name, payload]), on: vi.fn(), off: vi.fn() };
        isAdmin.mockReturnValue(true);
    });

    afterEach(() => {
        delete window.EventEmitter;
        vi.clearAllMocks();
    });

    /** The page instance, with the mocked FetchController's options exposed. */
    const page = () => {
        const el = new AgAdminPage();
        return { el, opts: el.usersFetch.opts };
    };

    it('loads the users without emitting "users-stats"', async () => {
        apiGet.mockImplementation((path) => Promise.resolve(
            path === '/auth/users' ? [{ username: 'admin' }, { username: 'bob' }] : ['admin']
        ));

        const { el, opts } = page();
        opts.onSuccess(await opts.fetchFn());

        expect(el.users).toHaveLength(2);
        expect(el.activeUsers).toEqual(['admin']);   // still fed: the per-user online dot
        expect(emitted.map(([name]) => name)).not.toContain('users-stats');
    });

    it('leaves activeUsers an array when the viewer is not an admin', async () => {
        // The early return is the path where fetchFn and onSuccess must still
        // agree on the key name — nothing dereferences it any more, so a
        // mismatch would be silent until render() calls .includes().
        isAdmin.mockReturnValue(false);

        const { el, opts } = page();
        opts.onSuccess(await opts.fetchFn());

        expect(el.activeUsers).toEqual([]);
        expect(() => el.activeUsers.includes('admin')).not.toThrow();
    });

    it('applies an active_users SSE update without emitting "users-stats"', () => {
        const { el } = page();
        el.users = [{ username: 'admin' }, { username: 'bob' }];

        el._handleActiveUsersUpdate({ detail: ['bob'] });

        expect(el.activeUsers).toEqual(['bob']);
        expect(emitted.map(([name]) => name)).not.toContain('users-stats');
    });
});
