/**
 * What the service worker DOES with a request, exercised against the real file.
 *
 * `js/static-assets.test.js` already asserts that every path sw.js names is a file the
 * box ships. That is the other half: which of the three strategies a given URL lands in,
 * and what comes back when the network is gone. Nothing covered it, which is exactly how
 * the hashed-asset rule could be wrong for years — its failure mode is a redundant
 * network call and a redundant disk write, never a visible error.
 *
 * sw.js is loaded as source into a function whose parameters shadow the service worker
 * globals, so the file under test is the file that ships — no export, no refactor, no
 * second copy to keep in sync.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const ORIGIN = 'https://box.example';

/** Minimal stand-in for Response: what sw.js reads is `ok`, `status` and `clone()`. */
class FakeResponse {
    constructor(body = '', { status = 200, headers = {} } = {}) {
        this.body = body;
        this.status = status;
        this.headers = headers;
        this.ok = status >= 200 && status < 300;
    }
    clone() { return new FakeResponse(this.body, { status: this.status, headers: this.headers }); }
}

/** A Cache: keyed by absolute URL, so a Request and a relative string agree. */
class FakeCache {
    constructor(net) { this.net = net; this.store = new Map(); }
    _key(r) { return new URL(typeof r === 'string' ? r : r.url, ORIGIN + '/').href; }
    async add(url) {
        const res = await this.net(this._key(url));
        // The real Cache.add rejects a non-ok response; sw.js relies on that to log
        // a precache miss instead of storing an error page under a real name.
        if (!res.ok) throw new Error(`precache ${url}: ${res.status}`);
        this.store.set(this._key(url), res);
    }
    async put(req, res) { this.store.set(this._key(req), res); }
    async match(req) { return this.store.get(this._key(req)); }
}

/**
 * Load sw.js into a controlled scope and hand back its listeners plus the fakes.
 * @param {{manifest?: Array<{url: string}>}} [opts]
 */
function loadSw({ manifest = [] } = {}) {
    const listeners = {};
    const caches_ = { _caches: new Map() };
    const net = vi.fn(async () => new FakeResponse('net'));

    const openCache = async (name) => {
        if (!caches_._caches.has(name)) caches_._caches.set(name, new FakeCache(net));
        return caches_._caches.get(name);
    };
    caches_.open = openCache;
    caches_.match = async (req) => {
        for (const c of caches_._caches.values()) {
            const hit = await c.match(req);
            if (hit) return hit;
        }
        return undefined;
    };
    caches_.keys = async () => [...caches_._caches.keys()];
    caches_.delete = async (name) => caches_._caches.delete(name);

    const self_ = {
        __WB_MANIFEST: manifest,
        addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); },
        location: new URL(`${ORIGIN}/sw.js`),
        skipWaiting: vi.fn(),
        clients: { claim: vi.fn(async () => {}) },
        registration: { showNotification: vi.fn(async () => {}) },
    };

    const clients_ = { matchAll: vi.fn(async () => []), openWindow: vi.fn(async () => {}) };
    const quiet = { log() {}, warn() {}, error() {} };

    // The shipped file, evaluated with its globals shadowed by parameters — `self` and
    // the bare `clients` of notificationclick included. Nothing here comes from input.
    new Function('self', 'caches', 'fetch', 'clients', 'console', 'Response', SW_SRC)(
        self_, caches_, net, clients_, quiet, FakeResponse,
    );

    return { listeners, caches: caches_, net, self: self_, clients: clients_, openCache };
}

/** Run the install handler to completion. */
async function install(sw) {
    const waits = [];
    await sw.listeners.install[0]({ waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
}

/** Dispatch one GET through the fetch handler and resolve what it answers. */
async function get(sw, url, { mode = 'no-cors' } = {}) {
    const absolute = new URL(url, ORIGIN + '/').href;
    let answered;
    const waits = [];
    const event = {
        request: { url: absolute, method: 'GET', mode },
        respondWith: (p) => { answered = p; },
        waitUntil: (p) => waits.push(p),
    };
    await sw.listeners.fetch[0](event);
    const response = answered === undefined ? undefined : await answered;
    await Promise.allSettled(waits);
    return { response, waits };
}

/** The cache sw.js is actually writing to this version. */
async function liveCache(sw) {
    const [name] = await sw.caches.keys();
    return sw.caches._caches.get(name);
}

describe('immutable assets are served from the cache, whatever their hash spells', () => {
    // The regex this replaced demanded `-[A-Za-z0-9_]{8,}` for the hash. Vite's alphabet
    // is base64url, so a hash may contain `-` — and those chunks silently fell through to
    // network-first, refetching and rewriting a file that cannot change. Both real names
    // below come from an actual build.
    const NAMES = [
        '/assets/main-Di28GOqk.js',            // hash without a dash — matched before too
        '/assets/nowplaying-1_u92sT-.js',      // dash INSIDE the hash — did not match
        '/assets/webauthn-_7fd-y_O.js',        // leading underscore and a dash
        '/assets/inter-latin-Dx4kXJAl.woff2',  // dashes in the name as well
        '/assets/webauthn-Cg0gqqmA.css',
    ];

    it.each(NAMES)('serves %s from the cache without touching the network', async (name) => {
        const sw = loadSw({ manifest: [{ url: name.slice(1), revision: null }] });
        await install(sw);
        const afterPrecache = sw.net.mock.calls.length;

        const { response } = await get(sw, name);

        expect(response, `${name} answered nothing`).toBeDefined();
        expect(sw.net.mock.calls.length,
            `${name} went to the network although it was precached`).toBe(afterPrecache);
    });

    it.each(NAMES)('does not rewrite the precached entry for %s on every load', async (name) => {
        const sw = loadSw({ manifest: [{ url: name.slice(1), revision: null }] });
        await install(sw);
        const cache = await liveCache(sw);
        const put = vi.spyOn(cache, 'put');

        await get(sw, name);
        await get(sw, name);

        expect(put, `${name} wrote to disk on a cache hit`).not.toHaveBeenCalled();
    });

    it('does not claim a third party\'s /assets/ as its own', async () => {
        const sw = loadSw();
        await install(sw);
        const url = 'https://elsewhere.example/assets/app-Di28GOqk.js';
        sw.net.mockClear();

        // Same path, another host: nothing guarantees it is content-addressed, so it must
        // not be treated as immutable. Only the hosts named in CDN_IMMUTABLE may be.
        //
        // Asking once proves nothing — cache-first also reaches the network on a miss.
        // What separates the two is the SECOND ask: cache-first would answer from the
        // copy it just stored and never call out again.
        await get(sw, url);
        await get(sw, url);

        expect(sw.net.mock.calls.length,
            'served from cache — a third-party path was treated as immutable').toBe(2);
    });
});

describe('the shell can start offline right after an update', () => {
    // The cache is named after the version, so a release empties it. The first launch
    // that follows has only what install() precached — and these two were not in it.
    // theme-boot.js was already precached; it is here so that stops being an accident.
    // It runs before the first paint, so a miss brings back the white flash it exists
    // to remove — and on the revalidation strategy a miss answers 404, not an outage.
    const CRITICAL = ['/ag-config.js', '/js/sse-worker.js', '/theme-boot.js'];

    it.each(CRITICAL)('precaches %s', async (url) => {
        const sw = loadSw();
        await install(sw);
        const cache = await liveCache(sw);
        expect(await cache.match(url), `${url} absent du précache`).toBeDefined();
    });

    it.each(CRITICAL)('still serves %s when the network is gone', async (url) => {
        const sw = loadSw();
        await install(sw);
        sw.net.mockRejectedValue(new TypeError('Failed to fetch'));

        const { response } = await get(sw, url);

        expect(response, `${url} n'a rien répondu hors ligne`).toBeDefined();
        expect(response.status,
            `${url} répond ${response.status} hors ligne — le shell démarre sans`).toBe(200);
    });

    it('refuses a shell entry that the box does not ship', async () => {
        // cache.add swallows its own failure by design (one missing icon must not abort
        // the install), so a 404 leaves a hole nothing reports. This asserts the hole is
        // a hole — the offline case above is what turns it into a visible failure.
        const sw = loadSw();
        sw.net.mockImplementation(async (url) =>
            String(url).includes('/ag-config.js') ? new FakeResponse('', { status: 404 })
                                                  : new FakeResponse('ok'));
        await expect(install(sw)).resolves.toBeUndefined();
        const cache = await liveCache(sw);
        expect(await cache.match('/ag-config.js')).toBeUndefined();
    });
});

describe('unhashed static files ride on the cache rename, not on revalidation', () => {
    // CACHE_NAME carries the product version and activate drops every older cache, so
    // nothing under these paths can change within one version. They used to sit on a
    // stale-while-revalidate strategy that fired a fetch on EVERY request, cache hit
    // included — one round trip and one disk write per image per page load, to re-store
    // identical bytes, on a box whose spare CPU belongs to the audio.
    const STABLE = ['/pics/qobuz.webp', '/pics/splash/apple-splash-1125-2436.png', '/theme-boot.js'];

    it.each(STABLE)('asks the network once for %s, then never again', async (url) => {
        const sw = loadSw();
        await install(sw);
        sw.net.mockClear();

        await get(sw, url);
        await get(sw, url);
        await get(sw, url);

        expect(sw.net.mock.calls.length,
            `${url} est redemandé à chaque chargement`).toBeLessThanOrEqual(1);
    });

    it('treats /fonts/ as ordinary — the woff2 are hashed into /assets/', async () => {
        // css/fonts.css pulls the faces in, so Vite hashes them. What /fonts/ really
        // serves is the two OFL licence texts, which no page requests; it had a
        // strategy branch of its own matching nothing.
        const sw = loadSw();
        await install(sw);
        sw.net.mockClear();

        await get(sw, '/fonts/OFL-Inter.txt');
        await get(sw, '/fonts/OFL-Inter.txt');

        expect(sw.net.mock.calls.length).toBe(2);
    });
});

describe('activating a new version sweeps only this file\'s caches', () => {
    it('deletes the previous version and leaves anything else alone', async () => {
        const sw = loadSw();
        await sw.caches.open('audiogravity-v0.0.1-old');
        await sw.caches.open('some-other-feature-store');
        await install(sw);

        const waits = [];
        await sw.listeners.activate[0]({ waitUntil: (p) => waits.push(p) });
        await Promise.all(waits);

        const left = await sw.caches.keys();
        expect(left, 'un cache de version précédente survit').not.toContain('audiogravity-v0.0.1-old');
        expect(left, 'un magasin qui ne nous appartient pas a été effacé')
            .toContain('some-other-feature-store');
    });
});

describe('a notification raises the window that is already open', () => {
    /** A window client as the browser reports it: a full URL, never a path. */
    const windowAt = (url) => ({ url, focus: vi.fn(async () => {}), navigate: vi.fn(async () => {}) });

    async function click(sw, { data = {}, action } = {}) {
        const waits = [];
        await sw.listeners.notificationclick[0]({
            action,
            notification: { close: vi.fn(), data },
            waitUntil: (p) => waits.push(p),
        });
        await Promise.all(waits);
    }

    it('focuses the interface on a box reached at an address', async () => {
        // The defect in one case. The old code compared `client.url` to the bare path
        // '/index.html', then looked for the string "audiogravity" inside the client URL
        // — false on an IP, which is what the installer prints. Neither matched, so every
        // notification opened a second window beside the one already showing.
        const sw = loadSw();
        const open = windowAt(`${ORIGIN}/index.html`);
        sw.clients.matchAll.mockResolvedValue([open]);

        await click(sw, { data: { url: '/index.html' } });

        expect(open.focus, 'la fenêtre ouverte n\'a pas été ramenée au premier plan').toHaveBeenCalled();
        expect(sw.clients.openWindow, 'une seconde fenêtre a été ouverte').not.toHaveBeenCalled();
    });

    it('steers the open interface to another page rather than stacking one', async () => {
        const sw = loadSw();
        const open = windowAt(`${ORIGIN}/index.html`);
        sw.clients.matchAll.mockResolvedValue([open]);

        await click(sw, { data: { url: '/index.html#services' } });

        expect(open.navigate).toHaveBeenCalledWith(`${ORIGIN}/index.html#services`);
        expect(sw.clients.openWindow).not.toHaveBeenCalled();
    });

    it('still focuses when navigate() refuses, instead of doing nothing', async () => {
        // navigate() rejects for a client this worker does not control — and matchAll was
        // asked for uncontrolled ones on purpose, since a window loaded before this
        // version took over is exactly that. Unhandled, the rejection ended the handler
        // with nothing opened and nothing focused: a notification that does nothing at
        // all, which is worse than the defect it replaced.
        const sw = loadSw();
        const open = windowAt(`${ORIGIN}/index.html`);
        open.navigate = vi.fn(async () => { throw new TypeError('not controlled'); });
        sw.clients.matchAll.mockResolvedValue([open]);

        await click(sw, { data: { url: '/index.html#services' } });

        expect(open.focus, 'le clic sur la notification n\'a rien fait').toHaveBeenCalled();
    });

    it('ignores a window belonging to another site', async () => {
        const sw = loadSw();
        sw.clients.matchAll.mockResolvedValue([windowAt('https://elsewhere.example/index.html')]);

        await click(sw, { data: { url: '/index.html' } });

        expect(sw.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/index.html`);
    });

    it('opens nothing when the notification was dismissed', async () => {
        const sw = loadSw();
        await click(sw, { action: 'close', data: { url: '/index.html' } });
        expect(sw.clients.openWindow).not.toHaveBeenCalled();
    });
});

describe('the offline page reads the same in both copies of it', () => {
    // The page the box serves had been translated to French and named a product that
    // does not exist ("contrôler Gravity"), while the fallback string inside sw.js
    // stayed in English — two copies of one screen, drifted. CLAUDE.md rule 1: every
    // string the product shows is in English.
    const OFFLINE_HTML = fs.readFileSync(path.join(ROOT, 'public', 'offline.html'), 'utf8');
    const FRENCH = /\b(hors ligne|Veuillez|Réessayer|nécessite|connexion réseau|Vous êtes)\b/i;

    it('serves an English offline page', () => {
        expect(OFFLINE_HTML).not.toMatch(FRENCH);
        expect(OFFLINE_HTML).toMatch(/is offline/);
    });

    it('writes the brand as markup on both, as the rule says', () => {
        // CLAUDE.md rule 1bis: rendered as HTML, the mark is Audiogravi<sup>ty</sup>. These
        // two pages load no stylesheet of the interface, so each carries the superscript
        // ratio itself; the rest of the treatment needs Inter and is not reproduced.
        const fallback = SW_SRC.match(/const FALLBACK_HTML = `([\s\S]*?)`;/)[1];
        for (const [what, text] of [['offline.html', OFFLINE_HTML], ['FALLBACK_HTML', fallback]]) {
            expect(text, `${what} écrit la marque sans son balisage`)
                .toMatch(/Audiogravi<sup>ty<\/sup>/);
            // A <sup> at its default size is a different mark, not a smaller one.
            expect(text, `${what} ne dimensionne pas l'exposant`).toMatch(/sup\s*\{[^}]*0?\.38em/);
        }
    });

    it('keeps the last-resort string in English too', () => {
        const fallback = SW_SRC.match(/const FALLBACK_HTML = `([\s\S]*?)`;/)?.[1];
        expect(fallback, 'FALLBACK_HTML est introuvable').toBeTruthy();
        expect(fallback).not.toMatch(FRENCH);
    });

    it('never calls the product anything but its name', () => {
        // "Gravity" alone was shown to users on the one screen they see when something
        // is wrong. Only what is DISPLAYED is checked — the comment recording the defect
        // quotes it, and a case that forbids naming a bug is a case nobody can satisfy.
        const shown = [
            ['offline.html', OFFLINE_HTML],
            ['FALLBACK_HTML', SW_SRC.match(/const FALLBACK_HTML = `([\s\S]*?)`;/)[1]],
        ];
        for (const [what, text] of shown) {
            const bare = [...text.matchAll(/(^|[^\w])Gravity\b/g)]
                .filter(m => !/Audiogravity/.test(text.slice(Math.max(0, m.index - 5), m.index + 10)));
            expect(bare.map(m => m[0]), `${what} nomme « Gravity » seul`).toEqual([]);
        }
    });
});

describe('the file says what the file does', () => {
    // A strategy was removed and the rest renumbered; the comments that named the old
    // one and its old number survived the edit and described a mechanism that no longer
    // existed. Prose rots silently — nothing else in the suite reads it.
    it('names every strategy it has, and no strategy it does not', () => {
        const declared = [...SW_SRC.matchAll(/── Strategy (\d)[:\s]/g)].map(m => Number(m[1]));
        expect(declared.length, 'aucune stratégie déclarée').toBeGreaterThan(1);
        expect(declared, 'la numérotation des stratégies a des trous')
            .toEqual(declared.map((_, i) => i + 1));

        const highest = Math.max(...declared);
        const referenced = [...SW_SRC.matchAll(/[Ss]trategy (\d)/g)].map(m => Number(m[1]));
        const ghosts = [...new Set(referenced.filter(n => n > highest))];
        expect(ghosts, `des commentaires renvoient à des stratégies absentes : ${ghosts}`).toEqual([]);
    });

    it('does not describe a revalidation strategy it no longer has', () => {
        // The classification comment explains at length WHY there is no longer one, so
        // the phrase itself is expected; what must not survive is a claim that some path
        // still uses it.
        expect(SW_SRC).not.toMatch(/keeps? that strategy/i);
        expect(SW_SRC, 'du code de revalidation subsiste').not.toMatch(/_swrRefresh/);
    });
});

describe('dynamic data is never served from the cache', () => {
    let sw;
    beforeEach(async () => { sw = loadSw(); await install(sw); });

    it.each(['/api/player/state', '/sse/events', '/status', '/sysinfo/current', '/auth/login'])(
        'answers %s with the offline marker rather than a stale body', async (url) => {
            sw.net.mockRejectedValue(new TypeError('Failed to fetch'));
            const { response } = await get(sw, url);
            expect(response.status).toBe(503);
            expect(JSON.parse(response.body).status).toBe('offline');
        });

    it('does not mistake a third party\'s /api/ for the core', async () => {
        // Both paths answer 503 when the network is down, so the status cannot tell them
        // apart — the BODY can. The core branch promises a JSON marker the client parses
        // (`isRetryableFailure` reads it); answering that for a host that is not the core
        // would have the interface report the box as offline over someone else's outage.
        sw.net.mockRejectedValue(new TypeError('Failed to fetch'));
        const { response } = await get(sw, 'https://elsewhere.example/api/thing');
        expect(response.body, 'a third-party host was answered as if it were the core').toBe('');
    });

    it('does not revalidate a third party\'s /pics/ in the background', async () => {
        // Counting network calls cannot separate the two strategies here: the background
        // refresh is started on EVERY request, cache hit included, so both make one call
        // per ask. What separates them is the answer when there is nothing to fall back
        // on — network-first reports the outage (503), the revalidation path reports a
        // missing file (404), which is a different thing to tell the page.
        sw.net.mockRejectedValue(new TypeError('Failed to fetch'));
        const { response } = await get(sw, 'https://elsewhere.example/pics/cover.png');
        expect(response.status,
            'a third-party image path was put on the revalidation strategy').toBe(503);
    });
});
