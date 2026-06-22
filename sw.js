// =====================
// SERVICE WORKER - AUDIOGRAVITY v0.9.5
// =====================

const CACHE_NAME = 'audiogravity-v0.9.5';

// Fichiers critiques à mettre en cache IMMÉDIATEMENT à l'installation
const CACHE_URLS = [
    '/',
    '/index.html',
    '/login.html',
    '/offline.html',
    '/site.webmanifest',
    '/fonts/icomoon.woff?1zo0jr',
    '/pics/apple-touch-icon.png',
    '/pics/favicon-32x32.png',
    '/pics/favicon-16x16.png',
    '/pics/logo_audiogravity_light.png',
    '/pics/logo_audiogravity_dark.png',
    '/pics/audiogravity.svg',
    // CDN Dependencies for full offline functionality
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
    console.log('[Service Worker] Installing v1.1.0...');
    self.skipWaiting();
    
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Pre-caching app shell and CDN dependencies');
            return Promise.all(
                CACHE_URLS.map(url => {
                    return cache.add(url).catch(err => {
                        console.error(`[Service Worker] Failed to cache ${url}:`, err);
                    });
                })
            );
        })
    );
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

    // Ignorer les requêtes spécifiques à Vite/Dev
    if (url.pathname.startsWith('/@') || url.pathname.startsWith('/node_modules') || url.pathname === '/stats.html') {
        return;
    }

    const FALLBACK_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover"><meta name="theme-color" content="#12141c"><title>Audiogravity - Offline</title><style>:root{--bg-color:#12141c;--text-color:#f8fafc;--text-muted:#94a3b8;--accent:#00f2fe;}body{margin:0;padding:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background-color:var(--bg-color);color:var(--text-color);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,Cantarell,'Open Sans','Helvetica Neue',sans-serif;text-align:center;overflow:hidden;}.container{padding:2rem;max-width:400px;animation:fadeIn 0.5s ease-out;}.icon{width:80px;height:80px;margin-bottom:2rem;opacity:0.8;filter:drop-shadow(0 0 10px rgba(0,242,254,0.3));}h1{font-size:1.5rem;font-weight:600;margin:0 0 1rem 0;letter-spacing:0.5px;}p{color:var(--text-muted);font-size:1rem;line-height:1.5;margin:0 0 2rem 0;}.retry-btn{background:transparent;color:var(--accent);border:1px solid var(--accent);padding:0.75rem 2rem;border-radius:8px;font-size:1rem;font-weight:500;cursor:pointer;transition:all 0.2s ease;text-transform:uppercase;letter-spacing:1px;}.retry-btn:hover,.retry-btn:active{background:rgba(0,242,254,0.1);box-shadow:0 0 15px rgba(0,242,254,0.2);}.pulse{animation:pulse 2s infinite;}@keyframes fadeIn{from{opacity:0;transform:translateY(20px);}to{opacity:1;transform:translateY(0);}}@keyframes pulse{0%{opacity:0.6;transform:scale(0.98);}50%{opacity:1;transform:scale(1.02);}100%{opacity:0.6;transform:scale(0.98);}}</style></head><body><div class="container"><svg class="icon pulse" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path><path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg><h1>Vous êtes hors ligne</h1><p>L'application nécessite une connexion réseau pour contrôler Gravity.<br>Veuillez vérifier votre connexion.</p><button class="retry-btn" onclick="window.location.reload()">Réessayer</button></div></body></html>`;

    // 2. GESTION DES ASSETS (HTML, CSS, JS, Images)
    event.respondWith(
        (async () => {
            const getOfflineFallback = async () => {
                // Pour une requête de navigation (HTML), servir offline.html
                if (request.mode === 'navigate' || request.headers.get('accept').includes('text/html')) {
                    const offlineRes = await caches.match('/offline.html');
                    return offlineRes || new Response(FALLBACK_HTML, { headers: { 'Content-Type': 'text/html' } });
                }
                // Pour les autres assets (JS, CSS, Images), tenter le cache direct
                const cached = await caches.match(request);
                if (cached) return cached;
                
                // Si rien en cache et offline
                return new Response('', { status: 404, statusText: 'Offline' });
            };

            // Stratégie : Network First 
            try {
                // On tente le réseau avec un timeout raisonnable
                const networkResponse = await fetch(request);
                
                if (networkResponse && networkResponse.status === 200) {
                    const cache = await caches.open(CACHE_NAME);
                    
                    // Cacher les assets statiques et les CDNs autorisés
                    const path = url.pathname;
                    const isAsset = path.includes('/assets/') || path.includes('/css/') || 
                                    path.includes('/js/') || path.includes('/pics/') || 
                                    path.includes('/fonts/');
                    const isCDN = CACHE_URLS.some(u => u.includes(url.hostname));
                    
                    if (url.origin === location.origin || isAsset || isCDN) {
                        cache.put(request, networkResponse.clone());
                    }
                    return networkResponse;
                }
                
                // Si status != 200, tenter le cache
                const cachedResponse = await caches.match(request);
                return cachedResponse || networkResponse;
            } catch (err) {
                // Erreur réseau (vrai offline) -> Fallback
                return getOfflineFallback();
            }
        })()
    );
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
