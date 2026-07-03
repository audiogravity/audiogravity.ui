/**
 * Main Entry Point for ES6 Modules (Phase 2)
 * @module Main
 * @description Loads all application modules in the correct order
 *
 * This file replaces the multiple <script defer> tags in index.html
 * All modules are loaded as ES6 imports with proper dependency resolution
 */

// =====================
// SPLASH SCREEN (Init first — starts the dismiss timer immediately)
// =====================
import { splashScreen } from './splash-screen.js';
splashScreen.init();

// =====================
// CORE MODULES (Load first)
// =====================

// Utilities and components (no dependencies)
import './utils.js';
import './ui-components.js';

// Authentication and common functions (base dependencies)
import './auth.js';
import './common.js';
import { showTabHUD } from './ui-helpers.js';

// PWA Install Prompt Manager
import './pwa-install-prompt.js';

// Push Notification Manager
import { initPushManager } from './push-manager.js';

// Sync origin labels from backend (fire-and-forget; static fallbacks used until resolved)
import { initOriginLabels } from './components/library-constants.js';
initOriginLabels();

// Gesture Manager (Swipe)
import { gestures } from './gestures.js';

// =====================
// GLOBAL CONTEXT (Phase 4)
// =====================
import './core/app-context-provider.js';

// Lit Web Components (Phase 3)
// Atoms
import './components/atoms/ag-stat-box.js';
import './components/atoms/ag-badge.js';
import './components/atoms/ag-source-badge.js';
import './components/atoms/ag-button.js';
import './components/atoms/ag-tooltip.js';
import './components/atoms/ag-status-indicator.js';
import './components/atoms/ag-sparkline.js';
import './components/atoms/ag-switch.js';

import './components/atoms/ag-validation-badge.js';
import './components/atoms/ag-license-badge.js';
import './components/atoms/ag-library-cover.js';
import './components/atoms/ag-library-add-btn.js';
import './components/atoms/ag-connector-badge.js';
import './components/atoms/ag-dsd-lock.js';
import './components/atoms/ag-track-meta.js';
// Molecules

import './components/molecules/ag-library-list-row.js';
import './components/molecules/ag-library-browser-topbar.js';
import './components/molecules/ag-library-breadcrumbs.js';
import './components/molecules/ag-service-card.js';
import './components/molecules/ag-profile-card.js';
import './components/molecules/ag-package-card.js';
import './components/molecules/ag-skeleton-loader.js';
import './components/molecules/ag-toast-notification.js';
import './components/molecules/ag-tabs.js';
import './components/molecules/ag-user-card.js';
import './components/molecules/ag-config-card.js';
import './components/molecules/ag-systemd-card.js';
import './components/molecules/ag-governor-card.js';
import './components/molecules/ag-audio-card.js';
import './components/molecules/ag-network-card.js';
import './components/molecules/ag-system-info.js';
import './components/molecules/ag-system-tile.js';
import './components/molecules/ag-system-actions.js';
import './components/molecules/ag-terminal.js';
import './components/molecules/ag-config-diff.js';
import './components/molecules/ag-passkey-manager.js';
import './components/molecules/ag-event-item.js';
import './components/molecules/ag-validation-results.js';
import './components/molecules/ag-metric-detail.js';
import './components/molecules/ag-license-status.js';
import './components/molecules/ag-license-activation.js';
import './components/molecules/ag-license-verify.js';
import './components/molecules/ag-volume-popover.js';
import './components/molecules/ag-sleep-timer.js';
import './components/molecules/ag-playback-controls.js';
import './components/molecules/ag-progress-bar.js';
import './components/molecules/ag-format-strip.js';
import './components/molecules/ag-library-source-card.js';
import './components/molecules/ag-upnp-item.js';
import './components/molecules/ag-radio-card.js';
import './components/molecules/ag-hqplayer-output.js';
import './components/molecules/ag-upnp-renderer-card.js';
import './components/molecules/ag-qobuz-output.js';
import './components/molecules/ag-tidal-output.js';
import './components/molecules/ag-highresaudio-output.js';
// Organisms
import './components/organisms/ag-modal.js';
import './components/organisms/ag-confirm-dialog.js';
import './components/organisms/ag-user-modal.js';
import './components/organisms/ag-logs-modal.js';
import './components/organisms/ag-docs-modal.js';
import './components/organisms/ag-card-grid.js';
import './components/organisms/ag-log-viewer.js';
import './components/organisms/ag-event-detail-modal.js';
import './components/organisms/ag-json-config-modal.js';
// Lazy-loaded via lazyLoadTabContent (see common.js) :
//   ag-audio-pipeline, ag-mobile-pipeline       → pipeline tab
//   ag-audio-software-page                      → audio-software tab
//   ag-latency-test, ag-network-test, ag-perf-monitor → performance tab
//   ag-config-editor                            → config tab
//   ag-systemd-override-editor                  → systemd tab
//   ag-system-dashboard                         → system tab
import { AgHistoryPanel } from './components/organisms/ag-history-panel.js';
import { AgTopBar } from './components/organisms/ag-top-bar.js';
import { AgConfigPanel } from './components/organisms/ag-config-panel.js';
import { AgFooter } from './components/organisms/ag-footer.js';
import './components/organisms/ag-now-playing.js';
import './components/organisms/ag-now-playing-fullscreen.js';
import './components/organisms/ag-pull-tab.js';

// =====================
// FEATURE MODULES
// =====================

// Validation (depends on common)
import './validation.js';

// Application modules (depend on common + auth)
import './components/organisms/ag-profiles-page.js';
import './components/organisms/ag-services-page.js';
import './components/organisms/ag-systemd-page.js';
import './components/organisms/ag-performance-page.js';
import './components/organisms/ag-system-page.js';
import './components/organisms/ag-config-page.js';
import './components/organisms/ag-pipeline-page.js';
import './components/organisms/ag-admin-page.js';

// =====================
// LIBRARY PLAYER
// =====================
import './components/molecules/ag-lib-tabbar.js';
import './components/organisms/ag-library-browse.js';
import './components/organisms/ag-library-search.js';
import './components/organisms/ag-library-queue.js';
import './components/organisms/ag-library-sources.js';
import './components/organisms/ag-library-outputs.js';
import './components/organisms/ag-library-roon-browser.js';
import './components/organisms/ag-library-upnp-browser.js';
import './components/organisms/ag-library-radio.js';
import './components/organisms/ag-library-page.js';

// =====================
// INITIALIZATION
// =====================

// PWA Manager (Offline & Cache Warming)
import { PWAManager } from './pwa-manager.js';

console.log('✅ All modules loaded via ES6 imports (Phase 2)');
console.log('📦 Module bundling active - Tree-shaking enabled');
console.log('⚡ Lit Web Components loaded (Phase 3)');

// Initialize PWA features
PWAManager.init();

// Initialize Push Notifications
initPushManager().then(() => {
    console.log('🔔 Push system initialized');
});

// Initialize Gestures
gestures.init();

// HUD for Tab switching
document.addEventListener('tab-changed', (e) => {
    if (e.detail && e.detail.label) {
        showTabHUD(e.detail.label);
    }
});
