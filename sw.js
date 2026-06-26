// =====================
// SERVICE WORKER - AUDIOGRAVITY v0.9.8-dev
// =====================

const CACHE_NAME = 'audiogravity-v0.9.8-dev';

// Vite-hashed assets injected at build time by vite-plugin-pwa (injectManifest).
// At runtime this becomes an array of { url, revision } objects covering all
// JS/CSS/image assets produced by Vite. During development it is an empty array.
const WB_MANIFEST = self.__WB_MANIFEST || [];

// Inline offline fallback — hoisted to module scope so it is not re-created on
// every fetch event invocation.
const FALLBACK_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover"><meta name="theme-color" content="#12141c"><title>Audiogravity - Offline</title><style>:root{--bg-color:#12141c;--text-color:#f8fafc;--text-muted:#94a3b8;--accent:#00f2fe;}body{margin:0;padding:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background-color:var(--bg-color);color:var(--text-color);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,Cantarell,'Open Sans','Helvetica Neue',sans-serif;text-align:center;overflow:hidden;}.container{padding:2rem;max-width:400px;animation:fadeIn 0.5s ease-out;}.icon{width:80px;height:80px;margin-bottom:2rem;opacity:0.8;filter:drop-shadow(0 0 10px rgba(0,242,254,0.3));}h1{font-size:1.5rem;font-weight:600;margin:0 0 1rem 0;letter-spacing:0.5px;}p{color:var(--text-muted);font-size:1rem;line-height:1.5;margin:0 0 2rem 0;}.retry-btn{background:transparent;color:var(--accent);border:1px solid var(--accent);padding:0.75rem 2rem;border-radius:8px;font-size:1rem;font-weight:500;cursor:pointer;transition:all 0.2s ease;text-transform:uppercase;letter-spacing:1px;}.retry-btn:hover,.retry-btn:active{background:rgba(0,242,254,0.1);box-shadow:0 0 15px rgba(0,242,254,0.2);}.pulse{animation:pulse 2s infinite;}@keyframes fadeIn{from{opacity:0;transform:translateY(20px);}to{opacity:1;transform:translateY(0);}}@keyframes pulse{0%{opacity:0.6;transform:scale(0.98);}50%{opacity:1;transform:scale(1.02);}100%{opacity:0.6;transform:scale(0.98);}}</style></head><body><div class="container"><svg class="icon pulse" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path><path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg><h1>Audiogravity is offline</h1><p>A network connection is required to control your streamer.<br>Please check your connection.</p><button class="retry-btn" onclick="window.location.reload()">Retry</button></div></body></html>`;

// Regex hoisted to module scope — avoids re-compilation on every fetch event.
const RE_HASHED_ASSET = /\/assets\/[^/]+-[A-Za-z0-9_]{8,}\.(js|css|png|webp|svg|woff2?)$/;

// CDN classification:
//   CDN_SWR      — mutable content (Google Fonts: browser-specific subset), stale-while-revalidate.
//   CDN_IMMUTABLE — version-pinned content (cdn.jsdelivr.net@x.y.z), cache-first like hashed assets.
const CDN_SWR       = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);
const CDN_IMMUTABLE = new Set(['cdn.jsdelivr.net']);

// App shell: static files that never change between releases (no hash in name).
// Vite-hashed assets are in WB_MANIFEST above.
const CACHE_URLS = [
    '/',
    '/index.html',
    '/login.html',
    '/offline.html',
    '/site.webmanifest',
    '/pics/apple-touch-icon.png',
    '/pics/favicon-32x32.png',
    '/pics/favicon-16x16.png',
    '/pics/logo_audiogravity_light.png',
    '/pics/logo_audiogravity_dark.png',
    '/pics/audiogravity.svg',
    // CDN dependencies (Inter font, Chart.js, CodeMirror)
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
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
        // These use revision-based cache busting so stale entries are replaced.
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
                    if (cacheName !== CACHE_NAME) {
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

    // 1. GESTION DES APPELS API / SSE / SYSINFO
    // On ne cache JAMAIS les données dynamiques, mais on gère l'échec offline
    if (url.pathname.startsWith('/api') || 
        url.pathname.startsWith('/sse') || 
        url.pathname.startsWith('/auth') ||
        url.pathname.startsWith('/status') ||
        url.pathname.startsWith('/sysinfo')) {
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
    const isHashedAsset = RE_HASHED_ASSET.test(url.pathname);
    const isCDNImmutable = CDN_IMMUTABLE.has(url.hostname);
    const isCDNSWR       = CDN_SWR.has(url.hostname);
    const isNavigation   = request.mode === 'navigate';

    // ── Strategy 2 background refresh ────────────────────────────────────────
    // Must be initiated synchronously (before event.respondWith) so we can cover
    // it with event.waitUntil() — extending SW lifetime past the respondWith.
    // Without this, the browser may kill the SW before cache.put() completes.
    let _swrRefresh = null;
    if (!isHashedAsset && !isCDNImmutable &&
        (isCDNSWR || url.pathname.startsWith('/pics/') || url.pathname.startsWith('/fonts/'))) {
        _swrRefresh = fetch(request).then(async res => {
            if (!res.ok) return;
            const c = await caches.open(CACHE_NAME);
            await c.put(request, res);
        }).catch(() => {});
        event.waitUntil(_swrRefresh);
    }

    event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);

        // ── Strategy 1: Cache-first (hashed Vite assets + version-pinned CDN) ─
        // Immutable content: same URL always means same bytes.
        // cdn.jsdelivr.net URLs are version-pinned (@x.y.z) — cache-first avoids
        // unnecessary CDN requests on every navigation (CLAUDE.md §12).
        if (isHashedAsset || isCDNImmutable) {
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

        // ── Strategy 2: Stale-while-revalidate (Google Fonts, /pics/, /fonts/) ─
        // Background refresh already in flight via _swrRefresh + event.waitUntil().
        if (_swrRefresh !== null) {
            const cached = await caches.match(request);
            if (cached) return cached;
            // No cached version yet — wait for the in-flight fetch.
            await _swrRefresh;
            return await caches.match(request) || new Response('', { status: 404 });
        }

        // ── Strategy 3: Network-first (HTML navigation, everything else) ──────
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
        icon: '/pics/android-chrome-192x192.png',
        badge: '/pics/favicon-32x32.png',
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

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((windowClients) => {
                for (let client of windowClients) {
                    if (client.url === urlToOpen && 'focus' in client) return client.focus();
                }
                for (let client of windowClients) {
                    if (client.url.includes('audiogravity') && 'focus' in client) {
                        return client.navigate(urlToOpen).then(() => client.focus());
                    }
                }
                if (clients.openWindow) return clients.openWindow(urlToOpen);
            })
    );
});
