// =====================
// ES6 MODULE IMPORTS (Phase 2)
// =====================

import { initAuth, logout, applyRoleClass, requireAuth } from './auth.js';
import { apiCall, apiCallWithRetry, apiGet, apiPost, apiDownload, apiUpload } from './api.js';
import { connectSSE, updateConnectionStatus, updateSystemMetrics, loadInitialMetrics, initVisibilityManager, startUptimeUpdates, sseStats } from './sse.js';
import { showToast, showConfirm, handleError, getUserFriendlyError } from './ui-helpers.js';
import { addToHistory, clearHistory, renderHistory } from './history.js';
import { AgTimerManager } from './timer.js';

import {
    API_BASE_URL, FRONTEND_VERSION, THEMES,
    API_KEY as CONFIG_API_KEY, API_KEY_HEADER, JWT_ENABLED, setApiKey,
    IS_TEST_ENV
} from './core/config.js';

// Legacy compatibility: ensure API_KEY is synced
let API_KEY = CONFIG_API_KEY;

// =====================
// PERFORMANCE TIMERS DOCUMENTATION (Phase 1)
// =====================

/**
 * IMPORTANT: All timers and intervals used in the application
 * are documented here for performance monitoring and optimization.
 *
 * Active Timers:
 * --------------
 * 1. SSE Connection (sse.js)
 *    - Permanent EventSource connection
 *    - Throttled events: sysinfo (500ms), services_metrics (500ms)
 *    - Auto-paused when tab hidden (Visibility API)
 *
 * 2. Uptime Updates (sse.js:264)
 *    - Interval: 30000ms (30 seconds)
 *    - Calls: GET /sysinfo/status
 *    - Auto-stopped when tab hidden (Phase 1 optimization)
 *
 * 3. Service Worker Updates (common.js:685)
 *    - Interval: 300000ms (5 minutes) - Phase 0 optimized from 60s
 *    - Checks for SW updates
 *    - Runs in background
 *
 * 4. Component-specific polling (only when tab active):
 *    - ag-latency-test.js:158 - 500ms during latency tests
 *    - ag-audio-software-page.js:440 - Variable during package operations
 *    - ag-profiles-page.js:142 - Variable for profile monitoring
 *    - ag-log-viewer.js:147 - Based on refreshInterval prop
 *
 * Removed Timers (Phase 1):
 * -------------------------
 * - ag-system-page.js connection check (was 1000ms) → Now uses EventEmitter
 * - ag-system-dashboard.js connection check (was 1000ms) → Now uses EventEmitter
 *
 * Performance Impact:
 * -------------------
 * - Phase 0: Deferred SSE → -50% CPU at load
 * - Phase 0: Lazy-load pages → -70% memory at load
 * - Phase 0: SW interval 60s→300s → -80% SW checks
 * - Phase 1: Remove connection polling → -10% CPU
 * - Phase 1: Uptime cleanup → -2% CPU when hidden
 */


// =====================
// MEMORY-CACHED LOCALSTORAGE
// =====================

/**
 * OPTIMIZATION: Memory cache for localStorage to avoid repeated parsing
 * Reduces JSON.parse calls and improves performance
 */
const MemoryCache = {
    _cache: new Map(),

    /**
     * Get value from cache or localStorage
     * @param {string} key - Storage key
     * @param {*} defaultValue - Default value if key doesn't exist
     * @returns {*} - Cached or stored value
     */
    get(key, defaultValue = null) {
        // Check memory cache first
        if (this._cache.has(key)) {
            return this._cache.get(key);
        }

        // Not in cache, read from localStorage
        try {
            const stored = localStorage.getItem(key);
            if (stored === null) {
                return defaultValue;
            }

            // Try to parse as JSON, fallback to raw value
            let value;
            try {
                value = JSON.parse(stored);
            } catch {
                value = stored; // Not JSON, use as-is
            }

            // Cache for future access
            this._cache.set(key, value);
            return value;
        } catch (error) {
            console.error(`MemoryCache.get error for key "${key}":`, error);
            return defaultValue;
        }
    },

    /**
     * Set value in both cache and localStorage
     * @param {string} key - Storage key
     * @param {*} value - Value to store
     */
    set(key, value) {
        try {
            // Update memory cache
            this._cache.set(key, value);

            // Update localStorage
            const toStore = typeof value === 'string' ? value : JSON.stringify(value);
            localStorage.setItem(key, toStore);
        } catch (error) {
            console.error(`MemoryCache.set error for key "${key}":`, error);
        }
    }
};

// =====================
// EVENT SYSTEM
// =====================

const EventEmitter = {
    events: {},

    on(event, callback) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(callback);
    },

    off(event, callback) {
        if (!this.events[event]) return;
        this.events[event] = this.events[event].filter(cb => cb !== callback);
    },

    emit(event, data) {
        if (!this.events[event]) return;
        this.events[event].forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`Error in event handler for ${event}:`, error);
            }
        });
    }
};

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML
 */
export function escapeHtml(text) {
    if (typeof text !== 'string') return text;
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Make globally available
window.EventEmitter = EventEmitter;
window.escapeHtml = escapeHtml;

// =====================
// GLOBAL AUTHENTICATION LOCK
// =====================
// IMPORTANT: This must run immediately as the module loads to prevent ghost UI access.
if (!window.location.pathname.endsWith('login.html')) {
    initAuth();
    if (!requireAuth()) {
        // Redirection handled by requireAuth(), but we stop execution here.
        throw new Error('[Auth] Authentication required. Redirecting...');
    }
}

// Global logout listener
document.addEventListener('logout-click', async () => {
    try {
        await logout();
    } catch (e) {
        console.error('Logout failed:', e);
    }
    window.location.href = 'login.html';
});


/**
 * OPTIMIZATION: Throttling function to limit the execution rate
 * PERFORMANCE OPTIMIZATION (Phase 3): Low Power Mode aware.
 * Doubles the effective limit when Low Power Mode is enabled.
 */
function throttle(func, limit) {
    let inThrottle;
    return function (...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;

            // If Low Power Mode is on, double the wait time to reduce processing
            const effectiveLimit = AgTimerManager._lowPowerMode ? limit * 2 : limit;

            setTimeout(() => inThrottle = false, effectiveLimit);
        }
    }
}

// =====================
// STATE MANAGEMENT
// =====================

// OPTIMIZATION: Use MemoryCache for AppState initialization
const AppState = {
    connected: false,
    theme: (MemoryCache.get('theme', 'minimal') || 'minimal').toLowerCase().trim(),
    darkMode: MemoryCache.get('darkMode', false),
    compactMode: MemoryCache.get('compactMode', true),
    animationsEnabled: MemoryCache.get('animationsEnabled', true),
    currentTab: window.location.hash.slice(1) || MemoryCache.get('activeTab', 'profiles'),
    sseConnection: null,
    profileHistory: MemoryCache.get('profileHistory', []),
    serviceHistory: MemoryCache.get('serviceHistory', []),
    softwareHistory: MemoryCache.get('softwareHistory', []),
    systemdHistory: MemoryCache.get('systemdHistory', []),
    performanceHistory: MemoryCache.get('performanceHistory', []),
    configHistory: MemoryCache.get('configHistory', []),
    adminHistory: MemoryCache.get('adminHistory', []),
    pipelineHistory: MemoryCache.get('pipelineHistory', [])
};

/**
 * Apply a theme to the document body
 * @param {string} theme - Theme name
 * @param {boolean} persist - Whether to save to state and memory cache
 */
function applyTheme(theme, persist = false) {
    if (!theme) return;
    const normalizedTheme = theme.toLowerCase().trim();

    // Safety check for supported themes (optional but good)
    const validThemes = THEMES.map(t => t.value);
    const finalTheme = validThemes.includes(normalizedTheme) ? normalizedTheme : 'minimal';

    document.body.setAttribute('data-theme', finalTheme);
    document.documentElement.setAttribute('data-theme', finalTheme);

    if (persist) {
        if (AppState) AppState.theme = finalTheme;
        if (MemoryCache) MemoryCache.set('theme', finalTheme);
    }

    if (EventEmitter) {
        EventEmitter.emit('theme-applied', finalTheme);
    }

    // Dynamic PWA theme-color update
    updateThemeColorMeta();
}

/**
 * Update the <meta name="theme-color"> tag dynamically based on current theme and mode.
 * Uses remove+recreate and a history micro-signal to force Safari iOS PWA to re-read
 * the tag at runtime (Safari ignores setAttribute in standalone mode).
 */
function updateThemeColorMeta() {
    const theme = AppState.theme;
    const isDark = AppState.darkMode;

    const colors = {
        'slate':   isDark ? '#1E293B' : '#FFFFFF',
        'gravity': isDark ? '#12141C' : '#FFFFFF',
        'minimal': isDark ? '#000000' : '#FFFFFF'
    };

    const color = colors[theme] || colors['slate'];

    // Step 1: Remove existing meta and recreate it - Safari requires a new node
    const existing = document.querySelector('meta[name="theme-color"]');
    if (existing) existing.remove();
    const meta = document.createElement('meta');
    meta.name    = 'theme-color';
    meta.content = color;
    document.head.appendChild(meta);

    // Step 2: Also set the html root background for safe-area / overscroll zones
    document.documentElement.style.backgroundColor = color;

    // Step 3: Fire a history micro-signal so Safari re-reads the meta.
    // This is the only reliable workaround for the Safari PWA standalone mode bug
    // where theme-color is cached at launch and not updated by DOM changes alone.
    try {
        const url = location.href;
        history.replaceState(history.state, '', url);
    } catch (_) { /* no-op in environments that disallow history */ }
}

// Listen for theme changes (including dark mode) to update PWA meta
if (EventEmitter) {
    EventEmitter.on('theme-changed', () => {
        updateThemeColorMeta();
    });
}

window.AppState = AppState; // Expose globally
window.applyTheme = applyTheme; // Expose globally

// Apply saved UI state immediately to avoid flashing or inconsistency
if (document.body) {
    if (AppState.darkMode) {
        document.body.classList.add('dark-mode');
        document.documentElement.classList.add('dark-mode');
    }
    if (AppState.compactMode) document.body.classList.add('compact-mode');
    if (!AppState.animationsEnabled) document.body.classList.add('no-animations');
    applyTheme(AppState.theme);
    updateThemeColorMeta();
}

// =====================
// API UTILITIES
// =====================





// =====================
// ERROR HANDLING
// =====================
// Error Handling moved to ui-helpers.js to break circular dependency with api.js

// Make API functions globally accessible for legacy support
window.apiCall = apiCall;
window.apiCallWithRetry = apiCallWithRetry;
window.apiGet = apiGet;
window.apiPost = apiPost;
window.handleError = handleError;





// formatTimestamp() removed - now using window.Utils.formatTimestamp() from utils.js

// =====================
// NAVIGATION
// =====================

function initNavigation() {
    const tabsContainer = document.querySelector('ag-tabs');
    if (!tabsContainer) return; // Not on a page with tabs (e.g., login.html)

    const tabContents = document.querySelectorAll('.tab-content');

    // PERFORMANCE OPTIMIZATION (Phase 0):
    // Initialize SSE on first tab interaction
    let sseInitialized = false;
    const initSSEOnFirstInteraction = () => {
        if (!sseInitialized) {
            console.log('[Performance] First interaction detected - initializing SSE and metrics');
            sseInitialized = true;
            connectSSE();
            loadInitialMetrics();
            startUptimeUpdates();
        }
    };

    // PERFORMANCE OPTIMIZATION (Phase 0): Lazy-load page components
    const lazyLoadedTabs = new Set();
    const lazyLoadTabContent = (tabName) => {
        if (lazyLoadedTabs.has(tabName)) return;

        const container = document.querySelector(`[data-lazy-container="${tabName}"]`);
        if (!container) return;

        console.log(`[Performance] Lazy-loading tab: ${tabName}`);
        lazyLoadedTabs.add(tabName);

        // Define tab content templates
        const templates = {
            'services': `
                <ag-services-page id="agServicesPage"></ag-services-page>
                <ag-history-panel type="service" title="HISTORY"></ag-history-panel>
            `,
            'audio-software': `
                <ag-audio-software-page id="agAudioSoftwarePage"></ag-audio-software-page>
                <ag-history-panel type="software" title="HISTORY"></ag-history-panel>
            `,
            'systemd': `
                <ag-systemd-page id="agSystemdPage"></ag-systemd-page>
                <ag-history-panel type="systemd" title="HISTORY"></ag-history-panel>
            `,
            'performance': `
                <ag-performance-page id="agPerformancePage"></ag-performance-page>
                <ag-history-panel type="performance" title="HISTORY"></ag-history-panel>
            `,
            'config': `
                <div class="config-zone tab-zone">
                    <ag-config-page id="agConfigPage"></ag-config-page>
                </div>
                <ag-history-panel type="config" title="HISTORY"></ag-history-panel>
            `,
            'system': `
                <ag-system-page id="agSystemPage"></ag-system-page>
            `,
            'pipeline': `
                <ag-pipeline-page id="agPipelinePage"></ag-pipeline-page>
            `,
            'admin': `
                <ag-admin-page id="agAdminPage"></ag-admin-page>
                <ag-history-panel type="admin" title="HISTORY"></ag-history-panel>
                <ag-log-viewer class="login-logs-zone tab-zone" title="LOGIN HISTORY" syslog-identifier=""
                    grep-pattern="auth.router" ?auto-refresh=${false} .reverse=${true}></ag-log-viewer>
            `
        };

        const template = templates[tabName];
        if (template) {
            container.innerHTML = template;
        }

        // Dynamic imports par tab — crée des chunks séparés à la compilation Vite
        // Les Web Components s'auto-upgradent dès que le module est chargé
        const lazyModules = {
            'pipeline': () => Promise.all([
                import('./components/organisms/ag-audio-pipeline.js'),
                import('./components/organisms/ag-mobile-pipeline.js'),
            ]),
            'performance': () => Promise.all([
                import('./components/organisms/ag-latency-test.js'),
                import('./components/organisms/ag-network-test.js'),
                import('./components/organisms/ag-perf-monitor.js'),
            ]),
            'admin': () => import('./components/organisms/ag-perf-monitor.js'),
            'audio-software': () => import('./components/organisms/ag-audio-software-page.js'),
            'config': () => import('./components/organisms/ag-config-editor.js'),
            'systemd': () => import('./components/organisms/ag-systemd-override-editor.js'),
            'system': () => import('./components/organisms/ag-system-dashboard.js'),
        };

        if (lazyModules[tabName]) lazyModules[tabName]();
    };

    // Écoute des événements émis par le composant ag-tabs
    document.addEventListener('tab-changed', (e) => {
        const tabName = e.detail.active;
        const previousTab = e.detail.previous;

        // Lazy-load tab content if needed
        lazyLoadTabContent(tabName);

        // Initialize SSE on first tab change
        initSSEOnFirstInteraction();

        // Mutation DOM : show/hide tab content
        const updateDOM = () => {
            tabContents.forEach(content => {
                content.classList.toggle('active', content.id === tabName);
            });
        };

        // View Transitions API — animate content area only, nav stays static
        if (document.startViewTransition && AppState.animationsEnabled && previousTab) {
            const tabs = tabsContainer?.tabs?.filter(t => !t.hidden) ?? [];
            const prevIdx = tabs.findIndex(t => t.id === previousTab);
            const nextIdx = tabs.findIndex(t => t.id === tabName);
            const dirClass = nextIdx >= prevIdx ? 'nav-forward' : 'nav-backward';

            document.documentElement.classList.add(dirClass, 'vt-active');
            const transition = document.startViewTransition(updateDOM);
            transition.finished.finally(() => {
                document.documentElement.classList.remove('nav-forward', 'nav-backward', 'vt-active');
            });
        } else {
            updateDOM();
        }

        // Mise à jour de l'état global (hors transition — pas d'impact visuel)
        AppState.currentTab = tabName;
        MemoryCache.set('activeTab', tabName);

        // Mise à jour de l'URL sans déclencher hashchange à nouveau
        if (window.location.hash.slice(1) !== tabName) {
            window.location.hash = tabName;
        }

        // Notification pour le lazy loading et gestion du cycle de vie
        if (window.EventEmitter) {
            EventEmitter.emit('tab-changed', {
                active: tabName,
                previous: previousTab
            });
        }
    });

    // Handle initial hash or persisted tab or default
    const getInitialTab = () => {
        const hash = window.location.hash.slice(1);
        // Valid tabs check could be added here
        return hash || AppState.currentTab || 'profiles';
    };

    const switchToTab = (tabId) => {
        if (!tabId) return;

        if (tabsContainer) {
            customElements.whenDefined('ag-tabs').then(() => {
                // Ensure the tab exists or fall back
                tabsContainer.selectTab(tabId);
            });
        } else {
            const button = document.querySelector(`[data-tab="${tabId}"]`);
            if (button) {
                button.click();
            }
        }
    };

    // Listen for manual URL hash changes (Back button, etc.)
    // Guard against re-entry: the tab-changed handler itself sets window.location.hash,
    // which would otherwise trigger a second selectTab → second tab-changed → HUD flash.
    window.addEventListener('hashchange', () => {
        const newTab = window.location.hash.slice(1);
        if (newTab && newTab !== AppState.currentTab && newTab !== tabsContainer?.activeTab) {
            switchToTab(newTab);
        }
    });

    // Handle initial load
    const startInitialTab = () => {
        const initialTab = getInitialTab();
        switchToTab(initialTab);
        // Initialize SSE on initial tab load
        initSSEOnFirstInteraction();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(startInitialTab, 100));
    } else {
        setTimeout(startInitialTab, 100);
    }

    // Fallback: connect on ANY interaction if it hasn't connected yet
    const interactionEvents = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    const onInteraction = () => {
        initSSEOnFirstInteraction();
        interactionEvents.forEach(e => document.removeEventListener(e, onInteraction));
    };
    interactionEvents.forEach(e => document.addEventListener(e, onInteraction, { passive: true }));
}








// =====================
// INITIALIZATION
// =====================

function initApp() {
    // Initialize navigation
    initNavigation();

    // Initialize Visibility API
    initVisibilityManager();

    // PERFORMANCE OPTIMIZATION (Phase 0):
    // Defer SSE connection and metrics loading until first user interaction
    // This eliminates ~50% CPU activity at rest
    // SSE will be initialized on first tab change (see initNavigation)

    // Load initial metrics - DEFERRED (will be called when SSE connects)
    // loadInitialMetrics();

    // Load and update uptime - DEFERRED (will be called when SSE connects)
    // startUptimeUpdates();

    // Connect to SSE - DEFERRED until first interaction
    // connectSSE();



    // Load histories
    renderHistory('profile');
    renderHistory('service');
    renderHistory('software');
    renderHistory('systemd');
    renderHistory('performance');
    renderHistory('config');
    renderHistory('admin');
    renderHistory('audio_pipeline');

    // Handle history clear events from ag-history-panel components
    document.addEventListener('clear-history', async (e) => {
        const { type } = e.detail;
        const confirmed = await window.showConfirm('Clear History', `Clear ${type} history?`);
        if (confirmed) {
            clearHistory(type);
        }
    });



    // Ensure role-based UI is applied now that all DOM elements are mounted and initialized
    if (typeof applyRoleClass === 'function') {
        applyRoleClass();
    }
}

// Prevent full app initialization during Storybook or Vitest tests
if (!IS_TEST_ENV) {
    document.addEventListener('DOMContentLoaded', initApp);
}

// =====================
// SERVICE WORKER REGISTRATION
// =====================

/**
 * OPTIMIZATION: Register Service Worker for offline caching
 */
if ('serviceWorker' in navigator) {
    console.log('[App] Checking Service Worker for port:', window.location.port);
    if (import.meta.env.DEV || IS_TEST_ENV || window.location.port === '3000') {
        console.log('[App] Development mode: unregistering Service Workers...');
        navigator.serviceWorker.getRegistrations().then(registrations => {
            for (let registration of registrations) {
                registration.unregister();
                console.log('[Service Worker] Unregistered');
            }
        });
    } else {
        window.addEventListener('load', () => {
            // Clear the reload guard set by the controllerchange handler so future
            // SW updates can also trigger a clean reload.
            sessionStorage.removeItem('sw-reloading');

            navigator.serviceWorker.register('/sw.js')
                .then((registration) => {
                    AgTimerManager.setInterval('service-worker-update', () => {
                        registration.update();
                    }, 300000, false);

                    registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                // Inform the user before the automatic reload triggered by
                                // the controllerchange listener below. The toast is intentionally
                                // brief — the page will reload within ~200 ms.
                                if (window.showToast) {
                                    window.showToast('info', 'Updating…', 'A new version is being applied.', 3000);
                                }
                                newWorker.postMessage({ type: 'SKIP_WAITING' });
                            }
                        });
                    });
                })
                .catch((error) => {
                    console.error('[Service Worker] Registration failed:', error);
                });

            // Reload once after SW takes control so the page uses the new chunk
            // hashes. Guard with sessionStorage to prevent reload loops.
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (sessionStorage.getItem('sw-reloading')) return;
                sessionStorage.setItem('sw-reloading', '1');
                window.location.reload();
            });
        });
    }
}

// =====================
// DEV BADGE — visible only in dev (tree-shaken in prod)
// =====================

if (import.meta.env.DEV) {
    window.addEventListener('DOMContentLoaded', () => {
        const badge = document.createElement('div');
        badge.textContent = 'DEV';
        badge.title = 'Development mode — click to dismiss';
        Object.assign(badge.style, {
            position: 'fixed',
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
            right: 'calc(env(safe-area-inset-right, 0px) + 8px)',
            zIndex: '2147483647',
            padding: '4px 10px',
            background: '#f59e0b',
            color: '#000',
            fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim() || 'monospace',
            fontSize: '10px',
            fontWeight: '700',
            letterSpacing: '0.14em',
            borderRadius: '3px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            pointerEvents: 'auto',
            cursor: 'pointer',
            userSelect: 'none',
        });
        badge.addEventListener('click', () => badge.remove());
        document.body.appendChild(badge);
    });
}

// BETA BADGE — controlled by VITE_BETA=true in .env.production.
// Vite statically substitutes import.meta.env.VITE_BETA at build time;
// if absent or false the block is tree-shaken from the bundle.
if (import.meta.env.VITE_BETA === 'true') {
    window.addEventListener('DOMContentLoaded', () => {
        const badge = document.createElement('div');
        badge.textContent = 'BETA';
        badge.title = 'Beta build — click to dismiss';
        Object.assign(badge.style, {
            position: 'fixed',
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
            right: 'calc(env(safe-area-inset-right, 0px) + 8px)',
            zIndex: '2147483647',
            padding: '4px 10px',
            background: '#8b5cf6',
            color: '#fff',
            fontFamily: 'var(--font-family)',
            fontSize: '10px',
            fontWeight: '700',
            letterSpacing: '0.14em',
            borderRadius: '3px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            pointerEvents: 'auto',
            cursor: 'pointer',
            userSelect: 'none',
        });
        badge.addEventListener('click', () => badge.remove());
        document.body.appendChild(badge);
    });
}

// =====================
// CLEANUP ON PAGE UNLOAD
// =====================

/**
 * OPTIMIZATION: Proper cleanup of all event listeners and connections
 */
window.addEventListener('beforeunload', () => {

    // Close SSE connection
    if (AppState.sseConnection) {
        AppState.sseConnection.close();
        AppState.sseConnection = null;
    }

    // Clear memory cache (optional, helps with testing)
    // MemoryCache.clear();

    // Note: Event listeners with delegation are automatically cleaned up
    // when the page unloads, no manual removal needed
});

// =====================
// ES6 MODULE EXPORTS (Phase 2)
// =====================

/**
 * Export all public APIs for ES6 module usage
 * This allows other modules to import specific functions they need
 * Example: import { EventEmitter, apiGet, showToast } from './common.js'
 */
export {
    // Event System
    EventEmitter,

    // Constants & Keys
    API_KEY,
    API_KEY_HEADER,
    JWT_ENABLED,
    FRONTEND_VERSION,
    THEMES,
    API_BASE_URL,
    setApiKey,

    // Utility Functions
    MemoryCache,
    throttle,
    AgTimerManager,

    // Toast Notifications
    showToast,

    // Confirm Modal
    showConfirm,

    // Error Handling
    handleError,
    getUserFriendlyError,

    // State Management
    AppState,

    // API Calls
    apiCall,
    apiCallWithRetry,
    apiGet,
    apiPost,
    apiDownload,
    apiUpload,

    // History Management
    addToHistory,
    clearHistory,
    renderHistory,

    // SSE Connection
    connectSSE,
    updateConnectionStatus,
    sseStats,

    // System Metrics
    applyTheme,
    updateSystemMetrics,
    loadInitialMetrics
};