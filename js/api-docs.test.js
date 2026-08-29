/**
 * Whether the interface offers the API reference, and where it gets that answer.
 *
 * The reference is a setting on the box, off by default: `/docs` and `/openapi.json`
 * answer without an API key, so a core that left them on would serve the map of its whole
 * API to anything on the network. The interface must follow the box rather than assume —
 * a button leading to a 404 is worse than no button.
 *
 * The answer is read from the endpoint map of `/`, which is absent when the routes are
 * not mounted, and it is shared: the footer asks on connection and the panel when it
 * loads, and the two must not each cost a request. A failed lookup, though, is not an
 * answer — remembering it would hide the button until the page was reloaded.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./api.js', () => ({ apiGet: vi.fn() }));
vi.mock('./core/config.js', () => ({ API_BASE_URL: '/api' }));

const { apiGet } = await import('./api.js');
const { apiDocsUrl, docsUrlFrom, resetApiDocsUrl, openApiDocs } = await import('./api-docs.js');

/** The entry point's answer, with or without the reference mounted. */
const root = docs => ({
    app: 'Audiogravity API',
    version: '0.9.49-dev',
    endpoints: docs ? { sse: '/sse/{channel}', status: '/status', docs: '/docs' }
        : { sse: '/sse/{channel}', status: '/status' },
});

describe('apiDocsUrl', () => {
    beforeEach(() => {
        resetApiDocsUrl();
        apiGet.mockReset();
    });

    it('offers nothing when the core does not serve the reference', async () => {
        apiGet.mockResolvedValue(root(false));
        expect(await apiDocsUrl()).toBeNull();
    });

    it('points at the path the core reports, under this core\'s base', async () => {
        // No query string: FastAPI writes the schema's address into the page it serves,
        // so a `?url=` of ours would be read by nobody. The code this module replaces
        // carried one — inert there too.
        apiGet.mockResolvedValue(root(true));
        expect(await apiDocsUrl()).toBe(`${window.location.origin}/api/docs`);
    });

    it('asks the entry point, not the reference itself, and does not retry', async () => {
        // Probing /docs would 404 on every load of a box that has it off — noise in the
        // journal, for an answer `/` already carries. The second argument turns the retry
        // layer off: three attempts and three seconds of backoff against a box that is
        // already not answering, to decide whether to draw a button.
        apiGet.mockResolvedValue(root(false));
        await apiDocsUrl();
        expect(apiGet).toHaveBeenCalledWith('/', false);
    });

    it('costs one request however many callers ask', async () => {
        // The footer asks on connection and the panel on every opening.
        apiGet.mockResolvedValue(root(true));
        await Promise.all([apiDocsUrl(), apiDocsUrl(), apiDocsUrl()]);
        await apiDocsUrl();
        expect(apiGet).toHaveBeenCalledTimes(1);
    });

    it('reports no reference when the core cannot be reached', async () => {
        // Never rejects: an unreachable core renders as "no reference", which is the
        // state the interface should show anyway.
        apiGet.mockRejectedValue(new Error('offline'));
        await expect(apiDocsUrl()).resolves.toBeNull();
    });

    it('does not remember a failure', async () => {
        // The footer asks while the core may still be starting. Caching that "no" would
        // keep the reference hidden for the life of the page, with nothing to say why.
        apiGet.mockRejectedValueOnce(new Error('starting'));
        expect(await apiDocsUrl()).toBeNull();

        apiGet.mockResolvedValue(root(true));
        expect(await apiDocsUrl()).toBe(`${window.location.origin}/api/docs`);
    });
});

describe('docsUrlFrom', () => {
    // What the configuration panel uses: it already holds the answer from `/`, and a
    // second request for a field in hand is waste.
    it('reads the reference out of an answer already in hand', () => {
        expect(docsUrlFrom(root(true))).toBe(`${window.location.origin}/api/docs`);
    });

    it('answers null for a core that serves none', () => {
        expect(docsUrlFrom(root(false))).toBeNull();
    });

    it('answers null rather than throwing on nothing at all', () => {
        // The panel falls back to /status, whose answer carries no endpoint map.
        expect(docsUrlFrom(undefined)).toBeNull();
        expect(docsUrlFrom({ version: '0.9.49-dev' })).toBeNull();
    });
});

describe('openApiDocs', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        vi.unstubAllGlobals();
    });

    it('does nothing without a URL', () => {
        const open = vi.fn();
        vi.stubGlobal('open', open);
        openApiDocs(null);
        expect(open).not.toHaveBeenCalled();
    });

    it('uses the application modal when the page has one', () => {
        const modal = document.createElement('div');
        modal.id = 'agDocsModal';
        modal.open = vi.fn();
        document.body.appendChild(modal);

        openApiDocs('http://box/api/docs');

        expect(modal.open).toHaveBeenCalledWith('API Reference (Swagger)', 'http://box/api/docs');
    });

    it('falls back to a tab when it does not', () => {
        const open = vi.fn();
        vi.stubGlobal('open', open);
        openApiDocs('http://box/api/docs');
        expect(open).toHaveBeenCalledWith('http://box/api/docs', '_blank');
    });
});
