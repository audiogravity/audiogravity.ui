/**
 * A keyless client costs the box one request, not a storm.
 *
 * Measured on the deployed box: 598 rejected cover fetches and 69 SSE reconnects in one
 * day, from clients whose key was gone — coverUrl even serialised the literal string
 * "null" into its URLs. The box has a resource budget; the client does not.
 *
 * The contract, checked against core/auth.py rather than assumed:
 *   - the middleware gates on the API key ALONE — a JWT without a key buys a guaranteed
 *     403, so a leftover authToken must not open anything;
 *   - PUBLIC_PATHS (/status, /push/*) answer keyless by design and must keep working;
 *   - a core running SECURITY_ENABLED=false legitimately serves keyless clients, and a
 *     flat client-side refusal would brick it.
 * Hence a verdict, not a wall: the first keyless protected request goes out as the probe,
 * its answer decides (403 → locked: everything suppressed and the app told once; anything
 * else → open: keyless traffic is legitimate). Per tab, so a reload does not re-probe.
 *
 * Every test builds a fresh module world: the verdict is deliberately sticky state, and a
 * test that leans on another test's latch fails the moment it runs alone.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./common.js', () => ({
    // Never import the real module here: it redirects to the login page at module load
    // when no session exists, and that hangs the whole suite. These are the exact exports
    // the modules under test pull (api.js and sse.js import lines are the contract).
    AppState: {},
    updateConnectionStatus: vi.fn(),
    throttle: (fn) => fn,
    EventEmitter: { on: () => {}, off: () => {}, emit: () => {} },
    AgTimerManager: { setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0, clearTimeout: () => {} },
}));
vi.mock('./auth.js', () => ({
    getAuthToken: () => localStorage.getItem('authToken'),
}));
vi.mock('./core/config.js', async (importOriginal) => ({
    // The real module with only the credential state overridden: the point is the
    // observed broken client (no key), not a synthetic config.
    ...(await importOriginal()),
    API_KEY: null,
}));

/** @returns {Response}-shaped stub */
const reply = (status) => ({ ok: status < 400, status, json: async () => ({ detail: 'x' }) });

/**
 * A fresh module world per test: no verdict, no latch, no listeners left behind.
 * @param {{verdict?: string, jwt?: string}} [state] - pre-seeded tab state
 */
async function freshWorld({ verdict, jwt } = {}) {
    vi.resetModules();
    sessionStorage.clear();
    localStorage.clear();
    if (verdict) sessionStorage.setItem('ag-keyless-verdict', verdict);
    if (jwt) localStorage.setItem('authToken', jwt);
    const api = await import('./api.js');
    const utils = await import('./components/utils-lit.js');
    return { api, utils };
}

beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('the probe: one request decides, instead of hundreds failing', () => {
    it('locks after a single 403 and suppresses everything that follows', async () => {
        const { api } = await freshWorld();
        const fetchMock = vi.fn(async () => reply(403));
        vi.stubGlobal('fetch', fetchMock);
        const events = [];
        window.addEventListener('ag-auth-missing', () => events.push(1));

        await expect(api.apiGet('/player/state/snapshot')).rejects.toThrow();
        expect(fetchMock).toHaveBeenCalledTimes(1);       // the probe went out

        await expect(api.apiGet('/library/albums')).rejects.toThrow(/No API key/);
        await expect(api.apiPost('/player/toggle', {})).rejects.toThrow(/No API key/);
        expect(fetchMock).toHaveBeenCalledTimes(1);       // nothing else did
        expect(events.length, 'the app is told exactly once').toBe(1);
    });

    it('marks the local refusal as final so the retry layer does not spin', async () => {
        const { api } = await freshWorld({ verdict: 'locked' });
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const error = await api.apiGet('/anything').catch(e => e);
        expect(error.status).toBe(401);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('opens keyless traffic when the core proves it does not gate on a key', async () => {
        // SECURITY_ENABLED=false: the server answers a keyless protected request. A flat
        // refusal here bricked a mode that worked before this layer existed.
        const { api } = await freshWorld();
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })));

        await api.apiGet('/player/state/snapshot');
        const url = api.buildAuthedUrl('/sse/dashboard');
        expect(url, 'a proven-open core gets URLs again').not.toBeNull();
        expect(url).not.toContain('api_key');
    });

    it('remembers the verdict across a reload of the same tab', async () => {
        const first = await freshWorld();
        vi.stubGlobal('fetch', vi.fn(async () => reply(403)));
        await first.api.apiGet('/x').catch(() => {});

        // Same tab, new page load: sessionStorage carries the verdict, no re-probe.
        vi.resetModules();
        localStorage.clear();
        const api = (await import('./api.js'));
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        await expect(api.apiGet('/y')).rejects.toThrow(/No API key/);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe('what stays open, and what never opens', () => {
    it('lets the public endpoints through even when locked', async () => {
        // /status feeds the version-skew banner and /push/* the notification manager;
        // the core serves them keyless by design (core/auth.py PUBLIC_PATHS).
        const { api } = await freshWorld({ verdict: 'locked' });
        const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
        vi.stubGlobal('fetch', fetchMock);
        await api.apiGet('/status');
        await api.apiPost('/push/subscribe', {});
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('gives a leftover JWT no URL: the middleware gates on the key alone', async () => {
        // The most likely broken-client state — cleared key, surviving authToken — and
        // the one an earlier version of this file pinned WRONG: it granted the JWT a URL,
        // and core/auth.py answers 403 to any non-public path without the key, JWT or not.
        const { api } = await freshWorld({ verdict: 'locked', jwt: 'stale-token' });
        expect(api.buildAuthedUrl('/player/state')).toBeNull();
    });

    it('renders covers as empty while locked, and never serialises null', async () => {
        const { api, utils } = await freshWorld({ verdict: 'locked' });
        expect(utils.coverUrl('mb:some-release')).toBe('');
        // And once open, the URL is built without the key rather than with "null".
        sessionStorage.setItem('ag-keyless-verdict', 'open');
        const { utils: utilsOpen } = await freshWorld({ verdict: 'open' });
        expect(utilsOpen.coverUrl('mb:some-release')).toContain('/audio_pipeline/cover');
        expect(utilsOpen.coverUrl('mb:some-release')).not.toContain('null');
    });

    it('opens no player SSE from the store while locked', async () => {
        await freshWorld({ verdict: 'locked' });
        const esSpy = vi.fn();
        vi.stubGlobal('EventSource', esSpy);
        const store = await import('./library-store.js');
        const unsubscribe = store.subscribePlayerState(() => {});
        expect(esSpy).not.toHaveBeenCalled();
        unsubscribe();
    });

    it('opens no dashboard worker, and keeps the caller sequence alive', async () => {
        // connectSSE() used to throw on null.toString() — which silently cancelled
        // loadInitialMetrics() scheduled right after it in common.js.
        await freshWorld({ verdict: 'locked' });
        const workerSpy = vi.fn();
        vi.stubGlobal('Worker', workerSpy);
        const sse = await import('./sse.js');
        expect(() => sse.connectSSE()).not.toThrow();
        expect(workerSpy).not.toHaveBeenCalled();
    });
});
