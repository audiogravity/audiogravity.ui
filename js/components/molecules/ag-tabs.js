/**
 * @module AgTabs
 * @description Molecule component for the main navigation tab bar.
 * Reads initial DOM buttons, then takes over management using Lit.
 * 
 * @element ag-tabs
 * 
 * @attr {string} active-tab - Current active tab ID
 * @attr {Array} tabs - Data array for tabs: [{ id, label, hidden, badgeCount, badgeType }]
 * 
 * @dependency css/layout.css - Main navigation (.tabs) and tab button (.tab-btn) styles
 * 
 * @fires tab-changed - Dispatched when a new tab is selected
 */

import { LitElement, html, nothing } from 'lit';
import { iconTabProfiles, iconTabServices, iconTabPipeline, iconTabSystem, iconTabPerformance, iconTabLibrary, iconHeadphones, iconSettingsSliders, iconSliders, iconShield, iconDsdLock, iconBell } from '../../ag-icons.js';
import { classMap } from 'lit/directives/class-map.js';
import { getCurrentUser } from '../../auth.js';
import { apiGet } from '../../api.js';
import '../atoms/ag-status-indicator.js';
import '../atoms/ag-license-badge.js';

const TAB_ICONS = {
    'audio-software': iconHeadphones,
    'systemd':        iconSettingsSliders,
    'config':         iconSliders,
    'admin':          iconShield,
};

const TAB_SVG_ICONS = {
    profiles:    iconTabProfiles,
    services:    iconTabServices,
    pipeline:    iconTabPipeline,
    system:      iconTabSystem,
    performance: iconTabPerformance,
    library:     iconTabLibrary,
};

/** Tabs that require an active trial or full license. */
const GATED_TABS = new Set(['systemd', 'performance', 'config', 'pipeline', 'library']);

export class AgTabs extends LitElement {
    static properties = {
        activeTab: { type: String, attribute: 'active-tab' },
        tabs: { type: Array }, // [{ id, label, hidden, badgeCount, badgeType }]
        _vertical: { type: Boolean, state: true },
        _sidebarHidden: { type: Boolean, state: true },
        _username: { type: String, state: true },
        _userRole: { type: String, state: true },
        _connected: { type: Boolean, state: true },
        _licenseStatus: { type: String, state: true },
        _licenseDaysRemaining: { type: Number, state: true },
        _tabStats: { type: Object, state: true },
        _previewTab: { type: String, state: true }, // Tab highlighted during swipe gesture
        _isMobile: { type: Boolean, state: true },
        _announcementCount: { type: Number, state: true },
        _animationsEnabled: { type: Boolean, state: true },
    };

    constructor() {
        super();
        this.activeTab = '';
        this.tabs = [];
        this._previewTab = null;
        // Use the smallest screen dimension so landscape phones are still detected as mobile
        this._isMobile = Math.min(window.screen.width, window.screen.height) <= 768;
        // On mobile the layout is always vertical — localStorage preference is ignored
        if (this._isMobile) {
            this._vertical = true;
        } else {
            const saved = localStorage.getItem('tabs-orientation');
            this._vertical = saved !== null ? saved === 'vertical' : false;
        }
        // Sur mobile, la sidebar est cachée par défaut (null → hidden), visible seulement si explicitement 'false'
        this._sidebarHidden = this._vertical && localStorage.getItem('tabs-sidebar-hidden') !== 'false';
        const _user = getCurrentUser();
        this._username = _user?.username || '';
        this._userRole = _user?.role || '';
        this._connected = window.AppState?.connected ?? true;
        this._licenseStatus = 'no_license';
        this._licenseDaysRemaining = null;
        this._tabStats = {};
        this._announcementCount = 0;
        this._animationsEnabled = window.AppState?.animationsEnabled ?? true;

        // Touch gesture state
        this._touchStartX = 0;
        this._touchStartY = 0;
        this._touchActive = false;
        this._touchOpening = false; // Edge swipe to open sidebar
        this._rafId = null;        // requestAnimationFrame handle for touchmove batching
        this._pendingTouchX = 0;
        this._pendingTouchY = 0;

        // Pre-bind handlers for robust event management
        this._boundTouchStart = this._handleTouchStart.bind(this);
        this._boundTouchMove = this._handleTouchMove.bind(this);
        this._boundTouchEnd = this._handleTouchEnd.bind(this);
    }

    createRenderRoot() {
        return this; // Light DOM to inherit .tabs and .tab-btn from layout.css
    }

    connectedCallback() {
        // Read initial static HTML before lit wipes it out on first render
        if (this.tabs.length === 0) {
            const btns = Array.from(this.querySelectorAll('.tab-btn'));
            if (btns.length > 0) {
                this.tabs = btns.map(btn => {
                    const badge = btn.querySelector('.badge');
                    return {
                        id: btn.dataset.tab,
                        label: badge ? btn.childNodes[0].textContent.trim() : btn.textContent.trim(),
                        hidden: btn.style.display === 'none',
                        badgeCount: badge ? badge.textContent : null,
                        badgeType: badge ? badge.className.replace('badge', '').replace('tab-badge', '').trim() : 'info'
                    };
                });

                // Remove original buttons so Lit's render() doesn't duplicate them in Light DOM
                btns.forEach(btn => btn.remove());
            }
        }

        super.connectedCallback();

        // Add container role and layout class
        this.classList.add('tabs');
        this.setAttribute('role', 'tablist');
        this.setAttribute('aria-label', 'Main navigation');

        // Restore orientation from localStorage
        if (this._vertical) this.classList.add('tabs--vertical');
        if (this._sidebarHidden) this.classList.add('tabs--sidebar-hidden');

        // Le bouton mobile est rendu dans <body> pour éviter le clipping
        // causé par overflow:hidden du parent position:fixed
        this._sidebarToggleEl = document.createElement('button');
        this._sidebarToggleEl.className = 'tab-sidebar-toggle';
        this._sidebarToggleEl.addEventListener('click', () => this._toggleVisibility());
        this._syncSidebarToggleEl();
        document.body.appendChild(this._sidebarToggleEl);

        // Keyboard navigation trap
        this.addEventListener('keydown', this._handleKeyDown.bind(this));

        // Use window-level listeners for more robust gesture capture on mobile
        window.addEventListener('touchstart', this._boundTouchStart, { passive: false });
        window.addEventListener('touchmove', this._boundTouchMove, { passive: false });
        window.addEventListener('touchend', this._boundTouchEnd, { passive: true });
        window.addEventListener('touchcancel', this._boundTouchCancel = this._handleTouchCancel.bind(this), { passive: true });

        // Re-evaluate mobile status on orientation change (screen.width/height swap on Android but not iOS)
        this._orientationHandler = () => {
            this._isMobile = Math.min(window.screen.width, window.screen.height) <= 768;
            if (this._isMobile) this._vertical = true;
        };
        window.addEventListener('orientationchange', this._orientationHandler);
        window.addEventListener('resize', this._orientationHandler);

        // Auto-close sidebar on mobile when mouse leaves
        this._mouseLeaveHandler = () => {
            if (this._sidebarHidden || !this._vertical) return;
            this._autoCloseTimer = setTimeout(() => {
                this._sidebarHidden = true;
                localStorage.setItem('tabs-sidebar-hidden', true);
                this._syncSidebarToggleEl();
            }, 500);
        };
        this._mouseEnterHandler = () => {
            clearTimeout(this._autoCloseTimer);
        };
        this.addEventListener('mouseleave', this._mouseLeaveHandler);
        this.addEventListener('mouseenter', this._mouseEnterHandler);

        // Close sidebar when config panel opens (mutual exclusion)
        this._handleConfigPanelOpened = () => this.closeSidebar();
        document.addEventListener('config-panel-opened', this._handleConfigPanelOpened);

        // Toggle the vertical sidebar from the top-bar navigation button (mobile)
        this._handleNavClick = () => this._toggleVisibility();
        document.addEventListener('nav-click', this._handleNavClick);

        // Jump to the Library tab from the top-bar shortcut (selectTab handles licence gating)
        this._handleLibraryClick = () => this.selectTab('library');
        document.addEventListener('library-click', this._handleLibraryClick);

        // Listen for auth changes to update displayed username
        this._handleAuthChanged = ({ isAuthenticated, user }) => {
            this._username = isAuthenticated && user ? user.username : '';
            this._userRole = isAuthenticated && user ? user.role : '';
        };
        if (window.EventEmitter) {
            this._handleConnectionStatus = ({ connected }) => { this._connected = connected; };
            window.EventEmitter.on('connection-status', this._handleConnectionStatus);
            window.EventEmitter.on('auth-changed', this._handleAuthChanged);

            this._handleProfilesStats = (profiles) => {
                const active = profiles.filter(p => p.state === 'active').length;
                this._tabStats = { ...this._tabStats, profiles: { num: active, den: profiles.length } };
            };
            window.EventEmitter.on('profiles-list-update', this._handleProfilesStats);

            this._handleServicesStats = (services) => {
                const active = services.filter(s => s.state === 'active').length;
                this._tabStats = { ...this._tabStats, services: { num: active, den: services.length } };
            };
            window.EventEmitter.on('services-list-update', this._handleServicesStats);

            this._handleSoftwareStats = (stat) => {
                this._tabStats = { ...this._tabStats, 'audio-software': stat };
            };
            window.EventEmitter.on('audio-software-stats', this._handleSoftwareStats);

            this._handleUsersStats = (stat) => {
                this._tabStats = { ...this._tabStats, admin: stat };
            };
            window.EventEmitter.on('users-stats', this._handleUsersStats);
        }

        // Announcement badge — updated by ag-announcement-banner after each load/dismiss
        this._handleAnnouncementBadge = ({ detail }) => {
            this._announcementCount = detail?.count || 0;
        };
        window.addEventListener('announcement-badge', this._handleAnnouncementBadge);

        this._handleAnimationsChanged = ({ detail }) => {
            this._animationsEnabled = detail?.enabled ?? true;
        };
        window.addEventListener('animations-changed', this._handleAnimationsChanged);

        // Fetch initial counts so all tabs show stats immediately (before pages load)
        this._fetchInitialStats();
        this._fetchLicenseStatus();
    }

    updated(changedProperties) {
        if (changedProperties.has('_vertical')) {
            this.classList.toggle('tabs--vertical', this._vertical);
        }

        if (changedProperties.has('_sidebarHidden')) {
            this.classList.toggle('tabs--sidebar-hidden', this._sidebarHidden);
            this._syncSidebarToggleEl();

            // Mutual exclusion: close config panel when sidebar opens
            if (!this._sidebarHidden) {
                const configPanel = document.querySelector('ag-config-panel');
                if (configPanel?.active) configPanel.active = false;
            }
        }

        if (changedProperties.has('activeTab')) {
            const tabId = this.activeTab;
            if (!tabId) return;

            // Use 'auto' (instant) for the very first scroll, then 'smooth'
            const behavior = this._hasScrolled ? 'smooth' : 'auto';
            this._hasScrolled = true;
            
            this.updateComplete.then(() => {
                const btn = this.querySelector(`[data-tab="${tabId}"]`);
                if (btn) {
                    btn.scrollIntoView({ 
                        behavior: behavior, 
                        block: 'nearest', 
                        inline: 'center' 
                    });
                }
            });
        }
    }

    _toggleOrientation() {
        // Orientation switching is disabled on mobile — always vertical
        if (this._isMobile) return;
        this._vertical = !this._vertical;
        localStorage.setItem('tabs-orientation', this._vertical ? 'vertical' : 'horizontal');
        // Reset hidden state when switching to horizontal
        if (!this._vertical && this._sidebarHidden) {
            this._sidebarHidden = false;
            localStorage.setItem('tabs-sidebar-hidden', 'false');
        }
    }

    closeSidebar() {
        if (this._sidebarHidden) return;
        this._sidebarHidden = true;
        localStorage.setItem('tabs-sidebar-hidden', 'true');
        this.classList.add('tabs--sidebar-hidden');
        this._syncSidebarToggleEl();
    }

    _toggleVisibility() {
        this._sidebarHidden = !this._sidebarHidden;
        localStorage.setItem('tabs-sidebar-hidden', this._sidebarHidden);
    }

    _syncSidebarToggleEl() {
        if (!this._sidebarToggleEl) return;
        this._sidebarToggleEl.textContent = this._sidebarHidden ? '›' : '‹';
        this._sidebarToggleEl.title = this._sidebarHidden ? 'Afficher les onglets' : 'Masquer les onglets';
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._sidebarToggleEl) {
            this._sidebarToggleEl.remove();
            this._sidebarToggleEl = null;
        }
        document.removeEventListener('config-panel-opened', this._handleConfigPanelOpened);
        document.removeEventListener('nav-click', this._handleNavClick);
        document.removeEventListener('library-click', this._handleLibraryClick);
        if (this._handleAnnouncementBadge)
            window.removeEventListener('announcement-badge', this._handleAnnouncementBadge);
        if (this._handleAnimationsChanged)
            window.removeEventListener('animations-changed', this._handleAnimationsChanged);
        if (window.EventEmitter) {
            if (this._handleAuthChanged) window.EventEmitter.off('auth-changed', this._handleAuthChanged);
            if (this._handleConnectionStatus) window.EventEmitter.off('connection-status', this._handleConnectionStatus);
            if (this._handleProfilesStats) window.EventEmitter.off('profiles-list-update', this._handleProfilesStats);
            if (this._handleServicesStats) window.EventEmitter.off('services-list-update', this._handleServicesStats);
            if (this._handleSoftwareStats) window.EventEmitter.off('audio-software-stats', this._handleSoftwareStats);
            if (this._handleUsersStats) window.EventEmitter.off('users-stats', this._handleUsersStats);
        }
        window.removeEventListener('touchstart', this._boundTouchStart);
        window.removeEventListener('touchmove', this._boundTouchMove);
        window.removeEventListener('touchend', this._boundTouchEnd);
        window.removeEventListener('touchcancel', this._boundTouchCancel);
        if (this._orientationHandler) {
            window.removeEventListener('orientationchange', this._orientationHandler);
            window.removeEventListener('resize', this._orientationHandler);
        }
        
        this.removeEventListener('keydown', this._handleKeyDown);
        if (this._mouseLeaveHandler) {
            this.removeEventListener('mouseleave', this._mouseLeaveHandler);
        }
        if (this._mouseEnterHandler) {
            this.removeEventListener('mouseenter', this._mouseEnterHandler);
        }
        clearTimeout(this._autoCloseTimer);
    }

    /**
     * Return true when the tab requires a full license and none is active.
     * @param {string} tabId
     * @returns {boolean}
     */
    _isLocked(tabId) {
        return GATED_TABS.has(tabId) && (this._licenseStatus === 'starter' || this._licenseStatus === 'version_expired');
    }

    selectTab(tabId, { keepOpen = false } = {}) {
        if (this._isLocked(tabId)) {
            this.selectTab('admin', { keepOpen });
            if (this._licenseStatus === 'starter' && window.EventEmitter)
                window.EventEmitter.emit('show-license-modal');
            return;
        }
        if (this.activeTab === tabId) return;

        const previousTab = this.activeTab;
        this.activeTab = tabId;

        const activeTabObj = this.tabs.find(t => t.id === tabId);
        const label = activeTabObj ? activeTabObj.label : tabId;

        // Fermer le drawer après sélection sur mobile
        if (this._vertical && !this._sidebarHidden && !keepOpen) {
            this._sidebarHidden = true;
            localStorage.setItem('tabs-sidebar-hidden', true);
            this._syncSidebarToggleEl();
        }

        this.dispatchEvent(new CustomEvent('tab-changed', {
            detail: { active: tabId, previous: previousTab, label: label },
            bubbles: true,
            composed: true
        }));
    }

    // Touch handlers
    _handleTouchStart(e) {
        if (!this._vertical) {
            this._touchActive = false;
            this._touchOpening = false;
            return;
        }

        const touch = e.touches[0];

        // Reset any stale gesture state from a previous cancelled touch
        this._touchOpening = false;
        this._touchActive = false;

        if (this._sidebarHidden) {
            // Edge swipe to open: only activate within 25px of the left edge
            if (touch.clientX <= 25) {
                this._touchOpening = true;
                this._touchStartX = touch.clientX;
                this._touchStartY = touch.clientY;
                this.style.transition = 'none';
                if (this._sidebarToggleEl) this._sidebarToggleEl.style.transition = 'none';
            }
            return;
        }

        // Use the first button as proxy for the sidebar strip bounds
        const firstBtn = this.querySelector('.tab-btn');
        const ref = firstBtn || this;
        const rect = ref.getBoundingClientRect();

        // Hit-test: touch must be within the sidebar X range (with margin)
        const margin = 30;
        if (touch.clientX < rect.left - margin || touch.clientX > rect.right + margin) {
            return;
        }

        this._touchActive = true;
        this._touchStartX = touch.clientX;
        this._touchStartY = touch.clientY;

        this.style.transition = 'none';
        this.style.willChange = 'transform';
        if (this._sidebarToggleEl) this._sidebarToggleEl.style.transition = 'none';
    }

    // Reset all gesture state on system interruption (incoming call, notification, etc.)
    _handleTouchCancel() {
        if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
        this._touchActive = false;
        this._touchOpening = false;
        this._previewTab = null;
        this.style.transition = '';
        this.style.willChange = '';
        this.style.removeProperty('transform');
        if (this._sidebarToggleEl) {
            this._sidebarToggleEl.style.transition = '';
            this._sidebarToggleEl.style.removeProperty('transform');
        }
        const configModal = document.querySelector('.config-modal');
        if (configModal) { configModal.style.transition = ''; configModal.style.removeProperty('transform'); }
    }

    // Compute target tab index based on swipe distance (1 tab per ~50px)
    _computeSwipeTarget(deltaY, currentIndex, visibleTabs) {
        const tabHeight = 25;
        const steps = Math.max(1, Math.floor(Math.abs(deltaY) / tabHeight));
        const dir = deltaY < 0 ? 1 : -1;
        return (currentIndex + dir * steps + visibleTabs.length) % visibleTabs.length;
    }

    _handleTouchMove(e) {
        // Edge swipe to open sidebar (inline — simple transform, no RAF needed)
        if (this._touchOpening) {
            const deltaX = e.touches[0].clientX - this._touchStartX;
            const deltaY = e.touches[0].clientY - this._touchStartY;

            // If gesture is clearly vertical, cancel edge-swipe and let native scroll proceed
            if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 8) {
                this._touchOpening = false;
                this.style.transition = '';
                if (this._sidebarToggleEl) this._sidebarToggleEl.style.transition = '';
                return;
            }

            if (deltaX > 0 && Math.abs(deltaX) > Math.abs(deltaY)) {
                e.preventDefault();
                const maxX = this.offsetWidth;
                const clampedX = Math.min(deltaX, maxX);
                // Sidebar starts hidden at transform(-sidebarWidth); map clampedX [0..width] → [-width..0]
                this.style.transform = `translate3d(${clampedX - maxX}px, 0, 0)`;
                if (this._sidebarToggleEl) {
                    // Toggle is always at left:sidebarWidth; apply same offset so it tracks the right edge
                    this._sidebarToggleEl.style.transform = `translate3d(${clampedX - maxX}px, 0, 0)`;
                }
                // Push config panel right only once sidebar right edge touches config panel left edge
                const configModal = document.querySelector('.config-modal');
                if (configModal && configModal.classList.contains('active')) {
                    // sidebar right edge = clampedX (sidebar at left:-sidebarWidth + translateX)
                    // config left edge   = window.innerWidth - configModal.offsetWidth
                    const touchAt = window.innerWidth - configModal.offsetWidth;
                    const overlap = clampedX - touchAt;
                    if (overlap > 0) {
                        configModal.style.transition = 'none';
                        configModal.style.setProperty('transform', `translate3d(${overlap}px, 0, 0)`, 'important');
                    } else {
                        configModal.style.removeProperty('transform');
                    }
                }
            }
            return;
        }

        if (!this._touchActive) return;

        // Prevent default synchronously — iOS commits scroll gesture before any threshold
        e.preventDefault();

        // Store latest coordinates and batch visual update via RAF.
        // If multiple touchmove events fire before the next frame (e.g. 120Hz ProMotion),
        // only the last position is processed, avoiding redundant DOM writes.
        this._pendingTouchX = e.touches[0].clientX;
        this._pendingTouchY = e.touches[0].clientY;
        if (this._rafId) return;
        this._rafId = requestAnimationFrame(() => {
            this._rafId = null;
            this._applyTouchActiveMove();
        });
    }

    _applyTouchActiveMove() {
        const deltaX = this._pendingTouchX - this._touchStartX;
        const deltaY = this._pendingTouchY - this._touchStartY;

        // Visual feedback: horizontal (closing) or vertical (molette)
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
            if (deltaX < 0) {
                this._previewTab = null;
                this.style.transform = `translate3d(${deltaX}px, 0, 0)`;
                if (this._sidebarToggleEl) {
                    this._sidebarToggleEl.style.transform = `translate3d(${deltaX}px, 0, 0)`;
                }
            }
        } else {
            // Molette: sidebar stays fixed, only the preview highlight moves
            if (Math.abs(deltaY) > 15) {
                const visibleTabs = this.tabs.filter(t => !t.hidden);
                const currentIndex = visibleTabs.findIndex(t => t.id === this.activeTab);
                if (currentIndex !== -1) {
                    const targetIndex = this._computeSwipeTarget(deltaY, currentIndex, visibleTabs);
                    this._previewTab = visibleTabs[targetIndex].id;
                }
            } else {
                this._previewTab = null;
            }
        }
    }

    _handleTouchEnd(e) {
        // Edge swipe to open sidebar
        if (this._touchOpening) {
            this._touchOpening = false;
            this.style.transition = '';
            if (this._sidebarToggleEl) this._sidebarToggleEl.style.transition = '';
            const deltaX = e.changedTouches[0].clientX - this._touchStartX;
            // Toggle class synchronously BEFORE removing the inline transform so the
            // CSS transition fires from the dragged position to the new class position,
            // instead of snapping to left:0 first (flip/flop fix).
            if (deltaX > 60) {
                this.classList.remove('tabs--sidebar-hidden');
                this._sidebarHidden = false;
                localStorage.setItem('tabs-sidebar-hidden', 'false');
                this._syncSidebarToggleEl();
            }
            this.style.removeProperty('transform');
            if (this._sidebarToggleEl) this._sidebarToggleEl.style.removeProperty('transform');
            // Restore config modal transform (mutual exclusion will close it if needed)
            const configModal = document.querySelector('.config-modal');
            if (configModal) { configModal.style.transition = ''; configModal.style.removeProperty('transform'); }
            return;
        }

        if (!this._touchActive) return;
        this._touchActive = false;

        if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
        this.style.transition = ''; // Restore CSS transition
        this.style.willChange = '';
        if (this._sidebarToggleEl) this._sidebarToggleEl.style.transition = '';

        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;

        const deltaX = touchEndX - this._touchStartX;
        const deltaY = touchEndY - this._touchStartY;

        this._previewTab = null;

        // Determine orientation and threshold
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);

        if (absX > absY && absX > 40) {
            // Horizontal swipe — toggle class synchronously BEFORE removing the inline
            // transform so the CSS transition fires from the dragged position to the new
            // class position instead of snapping to left:0 first (flip/flop fix).
            if (deltaX < -60) {
                this.classList.add('tabs--sidebar-hidden');
                this._sidebarHidden = true;
                localStorage.setItem('tabs-sidebar-hidden', true);
                this._syncSidebarToggleEl();
            }
        } else if (absY > absX && absY > 30) {
            // Vertical swipe: multi-tab skip based on distance
            const visibleTabs = this.tabs.filter(t => !t.hidden);
            const currentIndex = visibleTabs.findIndex(t => t.id === this.activeTab);
            if (currentIndex !== -1) {
                const targetIndex = this._computeSwipeTarget(deltaY, currentIndex, visibleTabs);
                if (targetIndex !== currentIndex) {
                    this.selectTab(visibleTabs[targetIndex].id);
                }
            }
        }

        // Remove inline transform AFTER class is toggled: the CSS transition on
        // transform fires from the dragged position to the new class value.
        this.style.removeProperty('transform');
        if (this._sidebarToggleEl) this._sidebarToggleEl.style.removeProperty('transform');
    }

    setTabBadge(tabId, count, type = 'info') {
        this.tabs = this.tabs.map(tab => {
            if (tab.id === tabId) {
                return { ...tab, badgeCount: count, badgeType: type };
            }
            return tab;
        });
    }

    toggleTabVisibility(tabId, isVisible) {
        this.tabs = this.tabs.map(tab => {
            if (tab.id === tabId) {
                return { ...tab, hidden: !isVisible };
            }
            return tab;
        });
    }

    _handleKeyDown(e) {
        const visibleTabs = this.tabs.filter(t => !t.hidden);
        const currentIndex = visibleTabs.findIndex(t => t.id === this.activeTab);
        if (currentIndex === -1) return;

        let targetIndex = null;

        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault();
            targetIndex = (currentIndex + 1) % visibleTabs.length;
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault();
            targetIndex = (currentIndex - 1 + visibleTabs.length) % visibleTabs.length;
        } else if (e.key === 'Home') {
            e.preventDefault();
            targetIndex = 0;
        } else if (e.key === 'End') {
            e.preventDefault();
            targetIndex = visibleTabs.length - 1;
        }

        if (targetIndex !== null) {
            const targetTab = visibleTabs[targetIndex];
            this.selectTab(targetTab.id);

            // Focus after render
            this.updateComplete.then(() => {
                const btn = this.querySelector(`[data-tab="${targetTab.id}"]`);
                if (btn) btn.focus();
            });
        }
    }

    async _fetchInitialStats() {
        try {
            const stats = await apiGet('/stats/tabs');
            if (stats && typeof stats === 'object') {
                this._tabStats = { ...this._tabStats, ...stats };
            }
        } catch (_) {
            // Non-blocking: sidebar stats are best-effort
        }
    }

    async _fetchLicenseStatus() {
        try {
            const data = await apiGet('/license/status');
            if (data) {
                this._licenseStatus = data.status ?? 'no_license';
                this._licenseDaysRemaining = data.days_remaining ?? null;
                window.dispatchEvent(new CustomEvent('license-status', { detail: { status: this._licenseStatus } }));
            }
        } catch (_) {
            // Non-blocking
        }
    }

    render() {
        return html`
            <div class="tabs-logo-bar">
                <img class="tabs-logo" src="pics/audiogravity.svg" alt="Audiogravity">
                <ag-license-badge
                    status="${this._licenseStatus}"
                    .daysRemaining="${this._licenseDaysRemaining}">
                </ag-license-badge>
                <ag-status-indicator
                    state=${this._connected ? 'up' : 'down'}
                    title="${this._connected ? 'Backend connecté' : 'Backend déconnecté'}">
                </ag-status-indicator>
            </div>
            <div class="tabs-user-bar">
                ${this._username ? html`
                <span class="tabs-user">${this._username} / ${this._userRole}</span>` : ''}
            </div>
            ${this.tabs.map(tab => {
            const isActive = this.activeTab === tab.id;
            const isPreview = this._previewTab === tab.id && !isActive;
            const btnClasses = {
                'tab-btn': true,
                'active': isActive,
                'preview': isPreview
            };

            // Add hidden class to button classes
            if (tab.hidden) {
                btnClasses['d-none'] = true;
            }

            const locked = this._isLocked(tab.id);
            if (locked) btnClasses['tab-btn--locked'] = true;

            return html`
                    <button class=${classMap(btnClasses)}
                            data-tab="${tab.id}"
                            role="tab"
                            aria-selected="${isActive ? 'true' : 'false'}"
                            aria-controls="${tab.id}"
                            id="tab-${tab.id}"
                            tabindex="${isActive ? '0' : '-1'}"
                            title="${locked ? 'Requires a full license or active trial' : ''}"
                            @click=${() => this.selectTab(tab.id)}>
                        ${TAB_SVG_ICONS[tab.id] ? html`<span class="tab-icon tab-icon-svg"><svg viewBox="0 0 24 24">${TAB_SVG_ICONS[tab.id]}</svg></span>` : TAB_ICONS[tab.id] ? html`<span class="tab-icon tab-icon-svg"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${TAB_ICONS[tab.id]}</svg></span>` : ''}
                        ${tab.label}
                        ${locked ? html`<svg class="tab-lock-icon" aria-label="Locked" style="margin-left:.3em" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconDsdLock}</svg>` : ''}
                        ${!locked && tab.badgeCount ? html`<span class="badge ${tab.badgeType} tab-badge ml-sm">${tab.badgeCount}</span>` : ''}
                        ${!locked && tab.id === 'admin' && this._announcementCount > 0 ? html`
                            <span class="${this._animationsEnabled ? 'tab-bell-anim' : ''}" aria-label="New announcement" style="margin-left:.3em;color:var(--color-warning);flex-shrink:0;display:inline-block"><svg viewBox="0 0 24 24" width=".9em" height=".9em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconBell}</svg></span>
                        ` : ''}
                        ${this._tabStats[tab.id] ? html`<span class="tab-stats">${
                            `${this._tabStats[tab.id].num}/${this._tabStats[tab.id].den}`
                        }</span>` : ''}
                    </button>
                `;
        })}
            ${!this._isMobile ? html`
            <button class="tab-orientation-btn"
                    @click=${this._toggleOrientation}
                    title="${this._vertical ? 'Passer en horizontal' : 'Passer en vertical'}">
                <span class="btn-text">Switch</span>&nbsp;${this._vertical ? '⇄' : '⇅'}
            </button>` : nothing}
        `;
    }
}

customElements.define('ag-tabs', AgTabs);
