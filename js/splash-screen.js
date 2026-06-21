/**
 * @module SplashScreen
 * @description In-app PWA splash screen controller.
 *
 * Strategy:
 * - Always shown when the app first loads (PWA standalone OR browser fallback)
 * - Dismissed automatically once the DOM is interactive + a min display time elapses
 * - On repeat visits the splash shows briefly (300ms) to avoid flicker
 *
 * The native iOS apple-touch-startup-image (in <head>) handles the
 * OS-level splash for Safari; this module handles Android/Chrome/Desktop PWA.
 */

/** Minimum visible duration (ms) — ensures the splash is seen even on fast loads */
const SPLASH_MIN_DURATION = 2500;

/** Maximum wait before force-dismissing (ms) — safety net */
const SPLASH_MAX_DURATION = 8000;

/**
 * @class SplashScreen
 * @description Controls the #ag-splash-screen overlay lifecycle.
 */
class SplashScreen {
    constructor() {
        /** @type {HTMLElement|null} */
        this._el = document.getElementById('ag-splash-screen');
        this._startTime = Date.now();
        this._dismissed = false;
    }

    /**
     * Initialise the splash screen.
     * Sets up automatic dismiss on DOMContentLoaded + minimum duration.
     */
    init() {
        if (!this._el) return;

        // Only show the splash when launched as an installed PWA (standalone mode).
        // navigator.standalone = iOS Safari PWA
        // display-mode: standalone = Android/Chrome/Desktop PWA
        const isPWA = navigator.standalone === true
                   || window.matchMedia('(display-mode: standalone)').matches;

        if (!isPWA) {
            // Remove instantly — no splash in regular browser
            this._el.remove();
            this._el = null;
            return;
        }

        // Start heartbeat animation on the icon (JS-driven, immune to CSS overrides)
        this._animateHeartbeat();

        // Safety net: force dismiss after max duration no matter what
        const safetyTimer = setTimeout(() => {
            this._dismiss();
        }, SPLASH_MAX_DURATION);

        // Primary dismiss: once DOM is ready AND min duration has passed
        const dismissWhenReady = () => {
            const elapsed = Date.now() - this._startTime;
            const remaining = Math.max(0, SPLASH_MIN_DURATION - elapsed);
            setTimeout(() => {
                clearTimeout(safetyTimer);
                this._dismiss();
            }, remaining);
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', dismissWhenReady, { once: true });
        } else {
            // DOM already ready (script loaded late)
            dismissWhenReady();
        }
    }


    /**
     * Animate the icon with a heartbeat effect (double-pulse zoom).
     * JS-driven to bypass CSS overrides.
     * @private
     */
    _animateHeartbeat() {
        const icon = this._el?.querySelector('.splash-icon');
        if (!icon) return;

        const cycleDuration = 1400; // ms per heartbeat cycle (lub-dub + pause)
        const start = performance.now();

        const tick = (now) => {
            if (this._dismissed || !this._el) return;

            const elapsed = (now - start) % cycleDuration;
            const progress = elapsed / cycleDuration;
            let scale = 1;

            // Lub-dub pattern (two pulses)
            if (progress < 0.12) {
                // First pulse (lub) - sharp zoom in
                scale = 1 + (0.15 * Math.sin((progress / 0.12) * Math.PI));
            } else if (progress >= 0.15 && progress < 0.25) {
                // Second pulse (dub) - smaller zoom in
                scale = 1 + (0.08 * Math.sin(((progress - 0.15) / 0.10) * Math.PI));
            } else {
                // Rest phase
                scale = 1;
            }

            icon.style.transform = `scale(${scale})`;
            requestAnimationFrame(tick);
        };

        requestAnimationFrame(tick);
    }

    /**
     * Animate out and remove the splash screen from the DOM.
     * @private
     */
    _dismiss() {
        if (this._dismissed || !this._el) return;
        this._dismissed = true;

        // Trigger CSS fade-out
        this._el.classList.add('dismissing');

        // Remove from DOM after transition ends (400ms)
        this._el.addEventListener('transitionend', () => {
            this._el?.classList.add('hidden');
            // Fully remove after hidden to free memory
            setTimeout(() => this._el?.remove(), 100);
        }, { once: true });

        console.log(`[Splash] Dismissed after ${Date.now() - this._startTime}ms`);
    }

}

/** Singleton instance, exported for use in main.js */
export const splashScreen = new SplashScreen();
