// =====================
// SERVICE WORKER - AUDIOGRAVITY v0.9.62-dev
// =====================

const CACHE_NAME = 'audiogravity-v0.9.62-dev';

// What marks a cache as this file's own, so activate sweeps ours and leaves anything
// else on the origin alone. Derived from CACHE_NAME rather than written out again —
// that line is rewritten at every release by ops/scripts/sync-version.mjs, which
// matches it exactly, so it must keep its shape and must stay the only source.
const CACHE_PREFIX = CACHE_NAME.split('-v')[0] + '-v';

// Vite-hashed assets injected at build time by vite-plugin-pwa (injectManifest).
// At runtime this becomes an array of { url, revision } objects covering all
// JS/CSS/image assets produced by Vite. During development it is an empty array.
const WB_MANIFEST = self.__WB_MANIFEST || [];

// Last resort, and only that: the offline page is /offline.html, precached below, and
// this string is what answers if precaching it ever failed. It used to be a full copy of
// that page — same markup, same 3 KB of styles — and the two drifted, as two copies do:
// the file the box actually served had been translated to French and named a product
// that does not exist ("contrôler Gravity"), while this copy stayed in English. Keeping
// it deliberately plain is what stops that happening again; there is nothing here worth
// synchronising, and the case it covers puts nothing on screen in the normal course.
const FALLBACK_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#12141c"><title>Audiogravity - Offline</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#12141c;color:#f8fafc;font-family:system-ui,sans-serif;text-align:center;padding:2rem}h1 sup{font-size:.38em;font-weight:inherit;vertical-align:super}</style></head><body><div><h1>Audiogravi<sup>ty</sup> is offline</h1><p>A network connection is required to control your streamer.</p></div></body></html>`;

// Everything Vite emits lands in /assets/ under a content hash — `chunkFileNames`
// and `assetFileNames` in vite.config.js both end in `-[hash]`, so the directory
// IS the immutability guarantee and nothing else needs to be read.
//
// This replaced a regex that spelled the hash out as `-[A-Za-z0-9_]{8,}`. Vite's
// hash alphabet is base64url, so it contains `-` too, and any chunk whose hash
// happened to carry one failed the test: measured on a build, `nowplaying-1_u92sT-.js`
// and `webauthn-_7fd-y_O.js` — 2 of 25. They fell through to network-first and
// rewrote their own precached entry on every single page load, which is a disk
// write per load for a file that cannot change. Worse, the affected set is drawn
// anew at every build, since it depends on the content hash: nothing could be
// reproduced twice, and a passing check proved nothing about the next build.
const ASSETS_PREFIX = '/assets/';

// CDN classification:
//   CDN_IMMUTABLE — version-pinned content (cdn.jsdelivr.net@x.y.z), cache-first like hashed assets.
//
// There is no stale-while-revalidate class left at all, here or same-origin. It
// existed for Google Fonts, whose stylesheet is mutable (the subset served depends
// on the browser asking); Inter now ships with the box, so no third-party host is
// left to revalidate — and the same-origin files that inherited that strategy could
// not be revalidated either, since the cache is renamed at every release. See the
// asset classification in the fetch handler.
const CDN_IMMUTABLE = new Set(['cdn.jsdelivr.net']);

// App shell: static files that never change between releases (no hash in name).
// Vite-hashed assets are in WB_MANIFEST above.
const CACHE_URLS = [
    // Both, deliberately, although the box answers them with the same bytes. The root is
    // the start_url the web manifest declares, and every shortcut in it points at the
    // index page with a hash. A Cache matches on the URL, so dropping either one loses an
    // offline entry point.
    // NOTE — no quoted paths in the comments of this list: js/static-assets.test.js reads
    // the entries by scanning for quoted strings inside it, and would take them for files.
    '/',
    '/index.html',
    '/login.html',
    '/offline.html',
    '/site.webmanifest',
    // Runs before the first paint; a cache miss here would put the white flash
    // back on exactly the cold loads this file exists to fix.
    '/theme-boot.js',
    // The two files the shell cannot start without, and neither carries a hash,
    // so the Workbox manifest above does not cover them. The cache is named after
    // the version, so a release empties it: without these entries the FIRST launch
    // after an update, made offline, starts a shell that is missing
    //   - its credentials — ag-config.js is a blocking <head> script carrying
    //     apiUrl and apiKey. Absent, window.AG_CONFIG is undefined, API_KEY falls
    //     to null and the interface suppresses its own requests until a reload;
    //     coming back online does not re-run a script the page already skipped.
    //   - its event stream — new Worker() reports failure asynchronously, so the
    //     try/catch around it in js/sse.js never fires and there is no main-thread
    //     fallback. The dashboard simply stops updating, silently.
    // Network-first still applies to both once online (Strategy 2 below rewrites
    // the entry on every successful load), so a key rotated by a same-version
    // reinstall is still picked up — precaching only supplies the offline floor.
    '/ag-config.js',
    '/js/sse-worker.js',
    // The icons, under the names public/pics/ actually ships. The three of them were
    // listed as apple-touch-icon.png, favicon-32x32.png and favicon-16x16.png — names no
    // file in the repository has ever carried — beside two logo_audiogravity_*.png that
    // exist nowhere at all. cache.add() catches its own failure, so five 404s per install
    // were logged and nothing else happened; the icons were simply never precached.
    '/pics/apple-touch-180.png',
    '/pics/favicon-32.png',
    '/pics/favicon-16.png',
    // CDN dependencies (Chart.js, CodeMirror). Inter is not among them any more:
    // it is a hashed asset in assets/, precached by the Workbox manifest above.
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
    'https://cdn.jsdelivr.net/npm/codemirror@5.65.16/lib/codemirror.min.css',
    'https://cdn.jsdelivr.net/npm/codemirror@5.65.16/lib/codemirror.min.js'
];

/**
 * INSTALL EVENT
 * Pre-cache the "app shell" (essential static files)
 */
self.addEventListener('install', (event) => {
    console.log(`[Service Worker] Installing ${CACHE_NAME}...`);
    // Do NOT call skipWaiting() here — it would cause the new SW to take control
    // before the client reloads, leaving already-parsed chunks from the old version
    // in memory while the SW serves new hashed filenames (404 on lazy imports).
    // skipWaiting is called only on explicit SKIP_WAITING message from the client.
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);

        // Precache Vite-hashed assets (injected by vite-plugin-pwa at build time).
        // Only `url` is read: every entry Vite produces is content-addressed, so its
        // `revision` is null and there is nothing to bust. What replaces a stale entry
        // is the cache rename at each release, not a revision check — the comment that
        // stood here claimed the opposite for as long as the code ignored the field.
        if (WB_MANIFEST.length > 0) {
            await Promise.all(
                WB_MANIFEST.map(({ url }) =>
                    cache.add(url).catch(err =>
                        console.warn(`[SW] Failed to precache ${url}:`, err)
                    )
                )
            );
        }

        // Precache static app shell files (no hash — names are stable).
        console.log(`[SW] Precaching app shell (${CACHE_URLS.length} entries)`);
        await Promise.all(
            CACHE_URLS.map(url =>
                cache.add(url).catch(err =>
                    console.warn(`[SW] Failed to cache ${url}:`, err)
                )
            )
        );
    })());
});

/**
 * ACTIVATE EVENT
 * Cleanup old caches when a new version is installed
 */
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // Only ours. This used to delete EVERY cache whose name was not the
                    // current one — harmless while this file owns the only one, and a
                    // trap for the first feature to open a second store on this origin,
                    // which would be wiped at the next release with nothing to say why.
                    if (cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME) {
                        console.log('[Service Worker] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            return self.clients.claim();
        })
    );
});

/**
 * FETCH EVENT
 */
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Ignorer ce qui n'est pas GET
    if (request.method !== 'GET') return;

    // Every rule below reads a PATH, and a path means nothing on its own: a third
    // party serving /assets/ or /api/ would otherwise be classified as ours. The
    // only cross-origin hosts this file knows about are named explicitly, in
    // CDN_IMMUTABLE.
    const isSameOrigin = url.origin === self.location.origin;

    // 1. GESTION DES APPELS API / SSE / SYSINFO
    // On ne cache JAMAIS les données dynamiques, mais on gère l'échec offline
    if (isSameOrigin && (
        url.pathname.startsWith('/api') ||
        url.pathname.startsWith('/sse') ||
        url.pathname.startsWith('/auth') ||
        url.pathname.startsWith('/status') ||
        url.pathname.startsWith('/sysinfo'))) {
        event.respondWith(
            fetch(request).catch(() => {
                // Retourner une erreur JSON propre au lieu d'une erreur réseau brute (évite popup iOS)
                return new Response(JSON.stringify({ error: 'offline', status: 'offline' }), {
                    status: 503,
                    headers: { 'Content-Type': 'application/json' }
                });
            })
        );
        return;
    }

    // Skip Vite dev-only paths
    if (url.pathname.startsWith('/@') || url.pathname.startsWith('/node_modules') || url.pathname === '/stats.html') {
        return;
    }

    // ── Asset classification ──────────────────────────────────────────────────
    //
    // Same-origin static files that carry no hash in their name — the interface's
    // images and the pre-paint theme script. They are immutable all the same, and
    // for a reason that has nothing to do with their names: CACHE_NAME carries the
    // product version, so a release DROPS the whole cache (see activate). Within one
    // version, nothing the box serves under these paths can change.
    //
    // That is why they no longer sit on a stale-while-revalidate strategy. Nothing
    // was ever revalidated by it: the background fetch was fired on EVERY request,
    // cache hit included, so each page load cost one network round trip and one disk
    // write per image — the brand marks, the favicons, and the 54 iOS splash screens
    // index.html declares — to re-store bytes that were already identical.
    //
    // /fonts/ was in that list too and matched nothing: the .woff2 files are pulled
    // in by css/fonts.css, so Vite hashes them into /assets/. What /fonts/ actually
    // serves is the two OFL licence texts, which no page requests.
    const isStableStatic = isSameOrigin &&
        (url.pathname.startsWith('/pics/') || url.pathname === '/theme-boot.js');

    const isHashedAsset  = isSameOrigin && url.pathname.startsWith(ASSETS_PREFIX);
    const isCDNImmutable = CDN_IMMUTABLE.has(url.hostname);
    const isNavigation   = request.mode === 'navigate';

    event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);

        // ── Strategy 1: Cache-first (immutable for the life of this cache) ────
        // Hashed Vite assets, version-pinned CDN files, and the stable static files
        // above. Same URL, same bytes, until a release renames the cache.
        //
        // cdn.jsdelivr.net URLs are version-pinned (@x.y.z) — cache-first avoids
        // unnecessary CDN requests on every navigation (CLAUDE.md §12).
        //
        // theme-boot.js belongs here and never on the network path: it is a
        // render-blocking <head> script, so a round trip in front of it is a round
        // trip in front of every paint — the delay that file exists to remove.
        if (isHashedAsset || isCDNImmutable || isStableStatic) {
            const cached = await caches.match(request);
            if (cached) return cached;
            try {
                const res = await fetch(request);
                if (res.ok) cache.put(request, res.clone()).catch(() => {});
                return res;
            } catch {
                return new Response('', { status: 404, statusText: 'Offline' });
            }
        }

        // ── Strategy 2: Network-first (HTML navigation, everything else) ──────
        try {
            const networkResponse = await fetch(request);
            if (networkResponse.ok && !isNavigation) {
                cache.put(request, networkResponse.clone())
                    .catch(err => console.warn('[SW] cache.put failed:', err));
            }
            return networkResponse;
        } catch {
            const cached = await caches.match(request);
            if (cached) return cached;
            if (isNavigation) {
                const offlinePage = await caches.match('/offline.html');
                return offlinePage || new Response(FALLBACK_HTML, {
                    headers: { 'Content-Type': 'text/html' }
                });
            }
            return new Response('', { status: 503, statusText: 'Offline' });
        }
    })());
});

/**
 * MESSAGE EVENT
 */
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// =====================
// PUSH NOTIFICATIONS
// =====================

/**
 * PUSH EVENT
 */
self.addEventListener('push', (event) => {
    console.log('[Service Worker] Push notification received');

    let data = {};
    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data = { title: 'Audiogravity', message: event.data.text() };
        }
    }

    const title = data.title || 'Audiogravity';
    const options = {
        body: data.message || 'New notification from Audiogravity',
        // Under the names public/pics/ ships. These read android-chrome-192x192.png and
        // favicon-32x32.png, neither of which exists — the same wrong-name defect the
        // app-shell list carried, and just as silent: a notification whose icon 404s is
        // shown with the browser's default glyph, and nothing reports it.
        icon: '/pics/pwa-192.png',
        badge: '/pics/favicon-32.png',
        vibrate: [200, 100, 200],
        tag: data.tag || 'audiogravity-notification',
        requireInteraction: data.requireInteraction || false,
        data: {
            url: data.url || '/index.html',
            timestamp: Date.now(),
            ...data.customData
        },
        actions: [
            { action: 'open', title: 'Open' },
            { action: 'close', title: 'Dismiss' }
        ]
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

/**
 * NOTIFICATION CLICK EVENT
 */
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    if (event.action === 'close') return;

    const urlToOpen = event.notification.data.url || '/index.html';
    // The notification carries a PATH; a client carries a full URL. Resolving it against
    // this worker's own scope is what let the two be compared at all — the first test
    // below read `client.url === '/index.html'`, which no client URL can ever equal, and
    // the second asked whether the client's URL contained the string "audiogravity",
    // which is false on a box reached at an address. That is the address the installer
    // prints, so on an ordinary install NEITHER matched and every notification opened a
    // second window beside the one already showing the interface.
    const target = new URL(urlToOpen, self.location.origin);

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((windowClients) => {
                const ours = windowClients.filter((client) => {
                    try { return new URL(client.url).origin === self.location.origin; }
                    catch { return false; }
                });
                // Already on the right page, hash included: just raise it.
                for (const client of ours) {
                    if (client.url === target.href && 'focus' in client) return client.focus();
                }
                // Otherwise steer the interface that is already open, rather than
                // stacking another copy of it.
                //
                // navigate() REJECTS for a client this worker does not control, and
                // matchAll was asked for uncontrolled ones too — a window loaded before
                // this version took over is exactly that. Unhandled, the rejection ends
                // the handler with the loop already returned, so the click would do
                // nothing at all: worse than the defect this replaced, which at least
                // fell through to opening a window. Falling back to focus alone keeps
                // the notification useful; the page is the interface either way.
                const open = ours.find(client => 'focus' in client);
                if (open) {
                    if (!open.navigate) return open.focus();
                    return open.navigate(target.href)
                        .then(() => open.focus())
                        .catch(() => open.focus());
                }
                if (clients.openWindow) return clients.openWindow(target.href);
            })
    );
});
