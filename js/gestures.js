/**
 * @module Gestures
 * @description Global touch gesture manager for lateral tab navigation.
 * Horizontal swipes on the main content area switch between tabs.
 * Works on both mobile and desktop (tablet).
 */

import { logger } from './utils.js';

export class GestureManager {
    constructor() {
        this.startX = 0;
        this.startY = 0;
        this.mainContent = null;
        this.tabsElement = null;
        this.threshold = 80;
        this.lastSwipeTime = 0;
        this.swipeCooldown = 300;
        this._committed = false;
    }

    init() {
        this.mainContent = document.getElementById('main-content');
        this.tabsElement = document.getElementById('mainTabs');

        if (!this.mainContent || !this.tabsElement) {
            logger.warn('GestureManager: Required elements not found. Retrying in 1s...');
            setTimeout(() => this.init(), 1000);
            return;
        }

        this.mainContent.addEventListener('touchstart', (e) => this._handleTouchStart(e), { passive: true });
        this.mainContent.addEventListener('touchmove', (e) => this._handleTouchMove(e), { passive: false });
        this.mainContent.addEventListener('touchend', (e) => this._handleTouchEnd(e), { passive: false });

        logger.log('Swipe gestures initialized on main content');
    }

    _handleTouchStart(e) {
        this.startX = e.touches[0].clientX;
        this.startY = e.touches[0].clientY;
        this._committed = false;
    }

    _handleTouchMove(e) {
        if (this._committed) {
            e.preventDefault();
            return;
        }

        const dx = Math.abs(e.touches[0].clientX - this.startX);
        const dy = Math.abs(e.touches[0].clientY - this.startY);

        if (dx < 8 && dy < 8) return;

        if (dx > dy * 1.5 && dx > 8) {
            if (this.startX <= 40 || this.startX >= window.innerWidth - 40) return;
            if (this._shouldIgnore(e.target)) return;
            this._committed = true;
            e.preventDefault();
        }
    }

    _handleTouchEnd(e) {
        if (!this._committed) return;

        const now = Date.now();
        if (now - this.lastSwipeTime < this.swipeCooldown) return;

        const endX = e.changedTouches[0].clientX;
        const deltaX = endX - this.startX;

        if (Math.abs(deltaX) > this.threshold) {
            this._navigate(deltaX > 0 ? 'prev' : 'next');
            this.lastSwipeTime = now;
        }
    }

    _shouldIgnore(target) {
        if (target.closest('.CodeMirror') ||
            target.closest('input[type="range"]') ||
            target.closest('.no-swipe') ||
            target.closest('.chart-container') ||
            target.closest('ag-progress-bar') ||
            target.closest('ag-volume-popover') ||
            target.closest('.np-controls') ||
            target.closest('.now-playing-bar') ||
            target.closest('ag-now-playing-fullscreen')) {
            return true;
        }
        // A horizontally-scrollable ancestor (overflow-x set via CSS class OR inline)
        // owns the gesture — don't switch tabs. Walk computed styles up to the body.
        let el = target;
        while (el && el !== document.body) {
            const ox = getComputedStyle(el).overflowX;
            if ((ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 2) {
                return true;
            }
            el = el.parentElement;
        }
        return false;
    }

    _navigate(direction) {
        const tabs = this.tabsElement.tabs || [];
        const visibleTabs = tabs.filter(t => !t.hidden);
        const currentTabId = this.tabsElement.activeTab;
        const currentIndex = visibleTabs.findIndex(t => t.id === currentTabId);

        if (currentIndex === -1) return;

        const targetIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;

        if (targetIndex >= 0 && targetIndex < visibleTabs.length) {
            this.tabsElement.selectTab(visibleTabs[targetIndex].id);
        }
    }
}

export const gestures = new GestureManager();
