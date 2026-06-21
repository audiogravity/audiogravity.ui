/**
 * @module AgConfigPanel
 * @description Organism component for the global configuration menu (Burger menu contents).
 * 
 * @element ag-config-panel
 * 
 * @attr {boolean} active - Visibility of the panel (toggled by burger menu)
 * @attr {boolean} darkMode - UI dark mode state
 * @attr {boolean} compactMode - UI compact layout state
 * @attr {boolean} animations - Whether UI animations are enabled
 * @attr {string} theme - Current selected theme ID
 * @attr {string} apiKey - Stored API Key
 * @attr {boolean} pushSubscribed - Push notification status
 * 
 * @dependency ag-switch
 * @dependency css/components/config-sidebar.css, css/components/forms.css - Config panel and form styles
 * @dependency AppState - Global state sync for preferences
 * @dependency MemoryCache - Persistence of settings
 * @dependency push-manager.js - Push subscription logic
 */

import { LitElement, html } from 'lit';
import { ContextConsumer } from 'https://cdn.jsdelivr.net/npm/@lit/context@1.1.0/+esm';
import { appContext } from '../../core/app-context.js';
import { AppState, MemoryCache, EventEmitter, API_KEY, THEMES, API_BASE_URL, setApiKey } from '../../common.js';
import { apiGet, apiDelete, apiDownload, apiUpload } from '../../api.js';
import { showToast, handleError } from '../../ui-helpers.js';
import { addToHistory } from '../../history.js';
import { validateAudioConfig, showValidationModal } from '../../validation.js';
import { connectSSE, loadInitialMetrics } from '../../sse.js';
import { FetchController } from '../../core/FetchController.js';
import { logger } from '../../utils.js';
import { toggleSubscription, getPushStatus } from '../../push-manager.js';
import { getCurrentUser } from '../../auth.js';
import { isWebAuthnAvailable, registerPasskey } from '../../webauthn.js';
import { iconSettings, iconClose, iconDownload, iconUpload, iconDsdLock, iconUnlock, iconKey, iconApiTree, iconLogout } from '../../ag-icons.js';

export class AgConfigPanel extends LitElement {
    static properties = {
        active: { type: Boolean, reflect: true },
        darkMode: { type: Boolean },
        compactMode: { type: Boolean },
        animations: { type: Boolean },
        theme: { type: String },
        apiKey: { type: String },
        showApiKey: { type: Boolean },
        bwVersion: { type: String },
        themes: { type: Array },
        pushSubscribed: { type: Boolean },
        passkeys: { type: Array },
        passkeysLoading: { type: Boolean }
    };

    constructor() {
        super();
        this.active = false;
        this.showApiKey = false;
        this.bwVersion = '--';
        this.pushSubscribed = false;
        this.passkeys = [];
        this.passkeysLoading = false;

        // Load initial state from imported AppState
        this.darkMode = AppState ? AppState.darkMode : false;
        this.compactMode = AppState ? AppState.compactMode : true;
        this.animations = AppState ? AppState.animationsEnabled : true;
        this.theme = AppState ? AppState.theme : 'minimal';

        // Initialize state
        this.apiKey = API_KEY || '';
        this.themes = THEMES || [
            { value: 'slate', label: 'Slate (Modern)' },
            { value: 'minimal', label: 'Minimal (Classic)' }
        ];

        this._handleBurgerClick = this._handleBurgerClick.bind(this);
        this._handleClickOutside = this._handleClickOutside.bind(this);
        this._handlePushStatus = this._handlePushStatus.bind(this);
        this._togglePush = this._togglePush.bind(this);

        // Touch gesture state
        this._touchStartX = 0;
        this._touchStartY = 0;
        this._touchOpening = false; // Edge swipe to open panel
        this._modalEl = null;      // Cached .config-modal reference (avoid querySelector on every touchmove)
        this._rafId = null;        // requestAnimationFrame handle for touchmove batching
        this._pendingTouchX = 0;

        // Pre-bind touch handlers to allow removeEventListener
        this._boundTouchStart = this._handleTouchStart.bind(this);
        this._boundTouchMove = this._handleTouchMove.bind(this);
        this._boundTouchEnd = this._handleTouchEnd.bind(this);

        // Window-level handlers for right-edge swipe to open
        this._boundWindowTouchStart = this._handleWindowTouchStart.bind(this);
        this._boundWindowTouchMove = this._handleWindowTouchMove.bind(this);
        this._boundWindowTouchEnd = this._handleWindowTouchEnd.bind(this);
        this._boundWindowTouchCancel = this._handleWindowTouchCancel.bind(this);

        // Subscribe to Global App Context for theme changes
        new ContextConsumer(this, {
            context: appContext,
            subscribe: true,
            callback: (state) => {
                if (state && state.theme !== undefined) {
                    this.theme = state.theme;
                }
            }
        });

        // Timer for mouseleave delay
        this._closeTimeout = null;


        this.versionsFetch = new FetchController(this, {
            autoFetch: false,
            fetchFn: async () => {
                let rootInfo = await apiGet('/');
                if (!rootInfo || !rootInfo.version) {
                    rootInfo = await apiGet('/status');
                }
                if (!rootInfo || !rootInfo.version) {
                    throw new Error('Version not found');
                }
                return rootInfo.version;
            },
            onSuccess: (version) => {
                this.bwVersion = version;
            },
            onError: () => {
                this.bwVersion = '--';
            }
        });
    }

    createRenderRoot() {
        return this; // Light DOM to reuse global CSS
    }

    connectedCallback() {
        super.connectedCallback();
        document.addEventListener('burger-click', this._handleBurgerClick);
        document.addEventListener('click', this._handleClickOutside);
        
        // Swipe listeners (on component: close gesture when panel is open)
        this.addEventListener('touchstart', this._boundTouchStart, { passive: false });
        this.addEventListener('touchmove', this._boundTouchMove, { passive: false });
        this.addEventListener('touchend', this._boundTouchEnd, { passive: true });

        // Window-level listeners for right-edge swipe to open
        window.addEventListener('touchstart', this._boundWindowTouchStart, { passive: false });
        window.addEventListener('touchmove', this._boundWindowTouchMove, { passive: false });
        window.addEventListener('touchend', this._boundWindowTouchEnd, { passive: true });
        window.addEventListener('touchcancel', this._boundWindowTouchCancel, { passive: true });

        // Listen for push status updates
        if (EventEmitter) {
            EventEmitter.on('push-status-changed', this._handlePushStatus);
        }

        // Get initial push status
        this.pushSubscribed = getPushStatus();
        // Ensure theme is synced from common state immediately
        if (AppState) {
            this.theme = AppState.theme;
        }



        // Single unified product version — fetched live from the API root.
        this.loadVersions();

    }

    disconnectedCallback() {
        super.disconnectedCallback();
        document.removeEventListener('burger-click', this._handleBurgerClick);
        document.removeEventListener('click', this._handleClickOutside);
        this.removeEventListener('touchstart', this._boundTouchStart);
        this.removeEventListener('touchmove', this._boundTouchMove);
        this.removeEventListener('touchend', this._boundTouchEnd);
        window.removeEventListener('touchstart', this._boundWindowTouchStart);
        window.removeEventListener('touchmove', this._boundWindowTouchMove);
        window.removeEventListener('touchend', this._boundWindowTouchEnd);
        window.removeEventListener('touchcancel', this._boundWindowTouchCancel);

        if (EventEmitter) {
            EventEmitter.off('push-status-changed', this._handlePushStatus);
        }
        if (this._closeTimeout) {
            clearTimeout(this._closeTimeout);
            this._closeTimeout = null;
        }
    }

    loadVersions() {
        if (!this.apiKey && API_KEY) {
            this.apiKey = API_KEY;
        }
        return this.versionsFetch.fetch();
    }



    firstUpdated() {
    }

    willUpdate(changedProperties) {
        if (changedProperties.has('active') && this.active) {
            // Re-sync properties from AppState when opening to ensure they are up to date
            if (AppState) {
                this.darkMode = AppState.darkMode;
                this.compactMode = AppState.compactMode;
                this.animations = AppState.animationsEnabled;
                this.theme = AppState.theme;
                this.requestUpdate(); // Force Lit to re-evaluate properties
            }
            if (API_KEY) this.apiKey = API_KEY;
            if (isWebAuthnAvailable()) this._loadPasskeys();
        }
    }

    _handleBurgerClick() {
        this.active = !this.active;
        if (this.active) {
            document.dispatchEvent(new CustomEvent('config-panel-opened'));
        }
    }

    _handleClickOutside(e) {
        if (!this.active) return;
        const path = e.composedPath ? e.composedPath() : [];
        const isBurger = path.some(el => el.tagName === 'AG-TOP-BAR');
        const isSelf = path.some(el => el === this);
        if (!isSelf && !isBurger) {
            this.active = false;
        }
    }

    _handleMouseLeave() {
        this._closeTimeout = setTimeout(() => {
            if (this.active) this.active = false;
        }, 500);
    }

    _handleMouseEnter() {
        if (this._closeTimeout) {
            clearTimeout(this._closeTimeout);
            this._closeTimeout = null;
        }
    }

    _closeModal() {
        this.active = false;
    }

    // Window-level handlers: right-edge swipe to open panel
    _handleWindowTouchStart(e) {
        if (this.active) return;
        const touch = e.touches[0];
        if (touch.clientX < window.innerWidth - 25) return;

        this._touchOpening = true;
        this._touchStartX = touch.clientX;
        this._touchStartY = touch.clientY;
        this._modalEl = this.querySelector('.config-modal');

        if (this._modalEl) {
            this._modalEl.style.transition = 'none';
            this._modalEl.style.visibility = 'visible';
            this._modalEl.style.opacity = '1';
        }
    }

    _handleWindowTouchMove(e) {
        if (!this._touchOpening) return;
        const deltaX = e.touches[0].clientX - this._touchStartX;
        const deltaY = e.touches[0].clientY - this._touchStartY;

        // If gesture is clearly vertical, cancel edge-swipe and let native scroll proceed
        if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 8) {
            this._touchOpening = false;
            if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
            if (this._modalEl) {
                this._modalEl.style.transition = '';
                this._modalEl.style.visibility = '';
                this._modalEl.style.opacity = '';
                this._modalEl.style.removeProperty('transform');
            }
            return;
        }

        if (deltaX < 0 && Math.abs(deltaX) > Math.abs(deltaY)) {
            e.preventDefault();
            this._pendingTouchX = e.touches[0].clientX;
            if (this._rafId) return;
            this._rafId = requestAnimationFrame(() => {
                this._rafId = null;
                if (!this._modalEl) return;
                const dx = this._pendingTouchX - this._touchStartX;
                const clampedX = Math.max(0, this._modalEl.offsetWidth + dx);
                this._modalEl.style.setProperty('transform', `translate3d(${clampedX}px, 0, 0)`, 'important');
                // Push sidebar left only once config panel left edge touches sidebar right edge
                const tabsEl = document.querySelector('ag-tabs');
                if (tabsEl && !tabsEl._sidebarHidden) {
                    // config left edge = window.innerWidth - modalWidth + clampedX
                    // sidebar right edge = sidebarWidth (sidebar fully open, no transform)
                    // touch threshold: clampedX where they first meet
                    const modalWidth = this._modalEl.offsetWidth;
                    const sidebarWidth = tabsEl.offsetWidth;
                    const clampedXTouch = Math.max(0, sidebarWidth + modalWidth - window.innerWidth);
                    const overlap = clampedXTouch - clampedX; // positive once panel crosses threshold
                    if (overlap > 0) {
                        const shift = -Math.min(overlap, sidebarWidth);
                        tabsEl.style.transition = 'none';
                        tabsEl.style.setProperty('transform', `translate3d(${shift}px, 0, 0)`, 'important');
                        if (tabsEl._sidebarToggleEl) {
                            tabsEl._sidebarToggleEl.style.transition = 'none';
                            tabsEl._sidebarToggleEl.style.setProperty('transform', `translate3d(${shift}px, 0, 0)`, 'important');
                        }
                    } else {
                        tabsEl.style.removeProperty('transform');
                        if (tabsEl._sidebarToggleEl) tabsEl._sidebarToggleEl.style.removeProperty('transform');
                    }
                }
            });
        }
    }

    _handleWindowTouchEnd(e) {
        if (!this._touchOpening) return;
        if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
        this._touchOpening = false;

        const deltaX = e.changedTouches[0].clientX - this._touchStartX;

        if (this._modalEl) {
            this._modalEl.style.transition = '';
            this._modalEl.style.removeProperty('transform');
            this._modalEl.style.visibility = '';
            this._modalEl.style.opacity = '';
        }
        // Restore sidebar transform (mutual exclusion will close it if needed)
        const tabsEl = document.querySelector('ag-tabs');
        if (tabsEl) {
            tabsEl.style.transition = '';
            tabsEl.style.removeProperty('transform');
            if (tabsEl._sidebarToggleEl) {
                tabsEl._sidebarToggleEl.style.transition = '';
                tabsEl._sidebarToggleEl.style.removeProperty('transform');
            }
        }

        if (deltaX < -60) {
            document.dispatchEvent(new CustomEvent('config-panel-opened'));
            this.active = true;
        }
    }

    _handleWindowTouchCancel() {
        if (!this._touchOpening) return;
        if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
        this._touchOpening = false;
        if (this._modalEl) {
            this._modalEl.style.transition = '';
            this._modalEl.style.removeProperty('transform');
            this._modalEl.style.visibility = '';
            this._modalEl.style.opacity = '';
        }
        const tabsEl = document.querySelector('ag-tabs');
        if (tabsEl) {
            tabsEl.style.transition = '';
            tabsEl.style.removeProperty('transform');
            if (tabsEl._sidebarToggleEl) {
                tabsEl._sidebarToggleEl.style.transition = '';
                tabsEl._sidebarToggleEl.style.removeProperty('transform');
            }
        }
    }

    // Touch handlers (on component: close gesture when panel is open)
    _handleTouchStart(e) {
        if (!this.active) return;
        this._touchStartX = e.touches[0].clientX;
        this._touchStartY = e.touches[0].clientY;
        this._modalEl = this.querySelector('.config-modal');

        if (this._modalEl) {
            this._modalEl.style.transition = 'none';
            this._modalEl.style.willChange = 'transform';
        }
    }

    _handleTouchMove(e) {
        if (!this.active) return;

        // Prevent default synchronously — iOS commits scroll gesture before any threshold
        e.preventDefault();

        // Batch visual update via RAF
        this._pendingTouchX = e.touches[0].clientX;
        if (this._rafId) return;
        this._rafId = requestAnimationFrame(() => {
            this._rafId = null;
            const deltaX = this._pendingTouchX - this._touchStartX;
            // Visual feedback only for right swipe (closing)
            if (deltaX > 0 && this._modalEl) {
                this._modalEl.style.setProperty('transform', `translate3d(${deltaX}px, 0, 0)`, 'important');
            }
        });
    }

    _handleTouchEnd(e) {
        if (!this.active) return;
        if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }

        if (this._modalEl) {
            this._modalEl.style.transition = '';
            this._modalEl.style.removeProperty('transform');
        }

        const deltaX = e.changedTouches[0].clientX - this._touchStartX;
        const deltaY = e.changedTouches[0].clientY - this._touchStartY;

        // Swipe right to close (threshold 100px)
        if (deltaX > 100 && Math.abs(deltaX) > Math.abs(deltaY) * 2) {
            this.active = false;
        }
    }

    // Handlers
    async _exportConfig() {
        if (typeof apiDownload === 'function') {
            await apiDownload('/profiles/configuration/export-file', 'audio-config.json');
        }
    }

    _triggerImport() {
        const fileInput = this.querySelector('#importFile');
        if (fileInput) fileInput.click();
    }

    async _handleImportFile(e) {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const fileContent = await file.text();
            let config;
            try {
                config = JSON.parse(fileContent);
            } catch (err) {
                if (showToast) showToast('error', 'Invalid JSON', 'The configuration file is not valid JSON');
                e.target.value = '';
                return;
            }

            if (showToast) showToast('info', 'Validating...', 'Checking configuration validity');

            let validation = { valid: true, warnings: [], errors: [] };
            try {
                validation = await validateAudioConfig(config);
            } catch (err) {
                logger.warn('Validation API failed, proceeding without it', err);
            }

            if (!validation.valid) {
                showValidationModal(validation);
                if (addToHistory) addToHistory('import', `Import cancelled: ${validation.errors.length} validation error(s)`, false);
                e.target.value = '';
                return;
            }

            const performImport = async () => {
                try {
                    await apiUpload('/profiles/configuration/import-file', file);
                    const summary = validation.summary || {};
                    if (showToast) showToast('success', 'Import Successful', `Configuration imported: ${summary.services_count || '?'} services, ${summary.profiles_count || '?'} profiles`);
                    if (addToHistory) addToHistory('import', 'Configuration imported successfully', true);

                    if (EventEmitter) {
                        EventEmitter.emit('service-changed', { action: 'import' });
                        EventEmitter.emit('profile-changed', { action: 'import' });
                    }
                    e.target.value = '';
                } catch (err) {
                    if (handleError) handleError(err, 'Import failed');
                    if (addToHistory) addToHistory('import', `Import failed: ${err.message}`, false);
                    e.target.value = '';
                }
            };

            if (validation.warnings.length > 0) {
                showValidationModal(validation, performImport);
            } else {
                performImport();
            }

        } catch (error) {
            console.error('Import failed', error);
            e.target.value = '';
        }
    }

    _handleDarkMode(e) {
        this.darkMode = e.detail ? e.detail.checked : e.target.checked;
        if (AppState) AppState.darkMode = this.darkMode;
        if (MemoryCache) MemoryCache.set('darkMode', this.darkMode);
        document.body.classList.toggle('dark-mode', this.darkMode);
        document.documentElement.classList.toggle('dark-mode', this.darkMode);
        if (EventEmitter) EventEmitter.emit('theme-changed', { darkMode: this.darkMode });
    }

    _handleCompactMode(e) {
        this.compactMode = e.detail ? e.detail.checked : e.target.checked;
        if (AppState) AppState.compactMode = this.compactMode;
        if (MemoryCache) MemoryCache.set('compactMode', this.compactMode);
        document.body.classList.toggle('compact-mode', this.compactMode);
    }

    _handleAnimations(e) {
        this.animations = e.detail ? e.detail.checked : e.target.checked;
        if (AppState) AppState.animationsEnabled = this.animations;
        if (MemoryCache) MemoryCache.set('animationsEnabled', this.animations);
        document.body.classList.toggle('no-animations', !this.animations);
    }

    _handleThemeChange(e) {
        const newTheme = e.target.value;
        this.theme = newTheme;

        // Use global appstate theme application with persistence
        if (window.applyTheme) {
            window.applyTheme(newTheme, true);
        } else {
            if (AppState) AppState.theme = newTheme;
            if (MemoryCache) MemoryCache.set('theme', newTheme);
            document.body.setAttribute('data-theme', newTheme);
            document.documentElement.setAttribute('data-theme', newTheme);
            if (EventEmitter) EventEmitter.emit('theme-changed', { theme: newTheme });
        }
    }

    _handleApiKeyChange(e) {
        this.apiKey = e.target.value;
        setApiKey(this.apiKey);
        if (MemoryCache) MemoryCache.set('apiKey', this.apiKey);

        // Reconnect SSE 
        connectSSE();
        loadInitialMetrics();
        this.loadVersions();
    }

    _toggleApiKeyVisibility() {
        this.showApiKey = !this.showApiKey;
    }

    _handlePushStatus(data) {
        this.pushSubscribed = data.isSubscribed;
    }

    async _togglePush() {
        const success = await toggleSubscription();
        if (success) {
            this.pushSubscribed = getPushStatus();
        }
    }

    async _loadPasskeys() {
        try {
            this.passkeys = await apiGet('/auth/webauthn/credentials', false);
        } catch {
            this.passkeys = [];
        }
    }

    async _handlePasskeyToggle(e) {
        if (e.detail.checked) {
            await this._registerPasskey();
        } else {
            await this._removeAllPasskeys();
        }
    }

    async _removeAllPasskeys() {
        this.passkeysLoading = true;
        try {
            for (const p of this.passkeys) {
                await apiDelete(`/auth/webauthn/credentials/${p.credential_id}`, false);
            }
            this.passkeys = [];
            // Allow re-offer on next login
            const user = getCurrentUser();
            if (user) localStorage.removeItem(`passkey_offered_${user.username}`);
            localStorage.removeItem('passkey_auto');
            showToast('Face ID / Touch ID disabled', 'success');
        } catch (err) {
            showToast(err.message || 'Failed to remove passkeys', 'error');
            await this._loadPasskeys();
        } finally {
            this.passkeysLoading = false;
        }
    }

    async _registerPasskey() {
        const user = getCurrentUser();
        if (!user) return;
        const deviceName = navigator.userAgent.includes('iPhone') || navigator.userAgent.includes('iPad')
            ? 'iPhone / iPad'
            : navigator.userAgent.includes('Android')
                ? 'Android'
                : (navigator.userAgentData?.platform || 'This Device');

        try {
            this.passkeysLoading = true;
            await registerPasskey(user.username, deviceName);
            localStorage.setItem('passkey_auto', 'true');
            showToast('Passkey registered successfully', 'success');
            await this._loadPasskeys();
        } catch (err) {
            if (err.name !== 'NotAllowedError') {
                showToast(err.message || 'Passkey registration failed', 'error');
            }
        } finally {
            this.passkeysLoading = false;
        }
    }

    async _deletePasskey(credentialId) {
        try {
            await apiDelete(`/auth/webauthn/credentials/${credentialId}`, false);
            showToast('Passkey removed', 'success');
            await this._loadPasskeys();
        } catch (err) {
            showToast(err.message || 'Failed to remove passkey', 'error');
        }
    }


    _openApiDocs() {
        const fullApiUrl = API_BASE_URL.startsWith('http')
            ? API_BASE_URL
            : window.location.origin + API_BASE_URL;

        const docsUrl = `${fullApiUrl}/docs?url=${fullApiUrl}/openapi.json`;

        const agDocsModal = document.getElementById('agDocsModal');
        if (agDocsModal) {
            agDocsModal.open('API Reference (Swagger)', docsUrl);
        } else {
            // Fallback to new tab if modal not found
            window.open(docsUrl, '_blank');
        }
    }

    /**
     * Log the user out. Emits the global `logout-click` event (handled in
     * common.js, which calls auth.logout()) — same path as the old top-bar button.
     */
    _logout() {
        this.dispatchEvent(new CustomEvent('logout-click', { bubbles: true, composed: true }));
    }

    render() {
        return html`
            <div class="config-modal ${this.active ? 'active' : ''}"
                 @mouseenter=${this._handleMouseEnter}
                 @mouseleave=${this._handleMouseLeave}
                 @click=${e => e.stopPropagation()}>

                <button
                    class="config-panel-toggle"
                    aria-label="${this.active ? 'Close Settings' : 'Open Settings'}"
                    title="${this.active ? 'Close Settings' : 'Open Settings'}"
                    @click="${(e) => { e.stopPropagation(); this.active = !this.active; if (this.active) document.dispatchEvent(new CustomEvent('config-panel-opened')); }}"
                >${this.active ? '›' : '‹'}</button>

                <div class="config-header">
                    <h3><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconSettings}</svg> Settings</h3>
                    <button class="close-btn" @click=${this._closeModal} aria-label="Close">
                        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconClose}</svg>
                    </button>
                </div>

                <div class="config-content">
                    <div class="config-item">
                        <label>Export Configuration</label>
                        <button class="config-btn" @click=${this._exportConfig}><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconDownload}</svg> Download JSON</button>
                    </div>

                    <div class="config-item">
                        <label>Import Configuration</label>
                        <input type="file" id="importFile" accept=".json" style="display: none;" @change=${this._handleImportFile}>
                        <button class="config-btn" @click=${this._triggerImport}><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconUpload}</svg> Upload JSON</button>
                    </div>

                    <div class="config-item">
                        <label>API Key</label>
                        <div class="api-key-input">
                            <input type=${this.showApiKey ? 'text' : 'password'}
                                   class="form-control"
                                   .value=${this.apiKey}
                                   @change=${this._handleApiKeyChange}
                                   placeholder="Enter API Key">
                            <button class="icon-btn" @click=${this._toggleApiKeyVisibility}>
                                ${this.showApiKey
                                    ? html`<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconUnlock}</svg>`
                                    : html`<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconDsdLock}</svg>`}
                            </button>
                        </div>
                    </div>
                    
                    <div class="config-item">
                        <label>Theme</label>
                        <select class="theme-select" .value=${this.theme} @change=${this._handleThemeChange}>
                            ${this.themes.map(theme => html`
                                <option value="${theme.value}" ?selected=${this.theme === theme.value}>
                                    ${theme.label}
                                </option>
                            `)}
                        </select>
                    </div>
                    
                    <div class="config-item config-item-row">
                        <div class="config-item-half">
                            <label>Light/Dark Mode</label>
                            <ag-switch .checked=${this.darkMode} @ag-change=${this._handleDarkMode}></ag-switch>
                        </div>
                        <div class="config-item-half">
                            <label>Notifications</label>
                            <ag-switch variant="notification" .checked=${this.pushSubscribed} @ag-change=${this._togglePush}></ag-switch>
                        </div>
                    </div>
                    
                    <div class="config-item config-item-row">
                        <div class="config-item-half">
                            <label>Compact Mode</label>
                            <ag-switch .checked=${this.compactMode} @ag-change=${this._handleCompactMode}></ag-switch>
                        </div>
                        <div class="config-item-half">
                            <label>Animations</label>
                            <ag-switch .checked=${this.animations} @ag-change=${this._handleAnimations}></ag-switch>
                        </div>
                    </div>
                    
                    ${isWebAuthnAvailable() ? html`
                    <div class="config-item config-item-row">
                        <div class="config-item-half">
                            <label>Face ID / Touch ID</label>
                            <ag-switch
                                variant="notification"
                                .checked=${this.passkeys.length > 0}
                                ?disabled=${this.passkeysLoading}
                                @ag-change=${this._handlePasskeyToggle}>
                            </ag-switch>
                        </div>
                        <div class="config-item-half passkey-devices">
                            ${this.passkeys.map(p => html`
                                <span class="passkey-device-chip">
                                    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconKey}</svg>
                                    ${p.device_name}
                                    <button class="passkey-chip-delete" title="Remove"
                                        @click=${() => this._deletePasskey(p.credential_id)}>
                                        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconClose}</svg>
                                    </button>
                                </span>
                            `)}
                        </div>
                    </div>
                    ` : ''}

                    <div class="config-footer">
                        <button class="config-footer-logout" @click=${this._logout} title="Logout">
                            <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconLogout}</svg>
                            <span>Logout</span>
                        </button>
                        <div class="version-info">
                            <span>
                                <span class="version-label">Version:</span>
                                <span class="version-wrapper">
                                    <span>v${this.bwVersion}</span>
                                    <span class="version-icon clickable" title="Open API Documentation (Swagger)" @click=${this._openApiDocs}>
                                        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconApiTree}</svg>
                                    </span>
                                </span>
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}

customElements.define('ag-config-panel', AgConfigPanel);
