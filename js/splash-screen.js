/**
 * @module SplashScreen
 * @description In-app splash screen controller, for an installed app (PWA).
 *
 * - Shown once per opening of the installed app, which public/splash-boot.js decides
 *   before the first paint (the `splash-on` class on <html>); elsewhere the overlay is
 *   removed at once. A page about to leave for the other one calls skipNextSplash().
 * - Dismissed once the document is ready and the screen has been seen whole: the icon,
 *   the name and the line come in (~0.7 s, css/components/splash-screen.css), then one wave
 *   goes out of the icon — 2.1 s, counted from when the screen starts moving. At 0.7 s,
 *   counted from the navigation's start, it was gone before the wave was seen (user,
 *   2026-10-08: "much too fast").
 * - Its motion is CSS only. The wave goes on for as long as the screen stays, which is as
 *   long as the app takes to load.
 *
 * iOS shows its own launch image first (apple-touch-startup-image, in <head>): the plain
 * ground the entrance starts from, drawn by scripts/make-launch-images.mjs. Started by
 * js/main.js on index.html and by js/login.js on login.html, where a launch with no
 * session lands (public/session-boot.js).
 */

/**
 * Minimum time on screen (ms), counted from when the screen starts moving: the entrance,
 * then one whole wave — its 500 ms delay plus its 1600 ms (css/components/splash-screen.css).
 */
export const SPLASH_MIN_DURATION = 2100;

/** Maximum wait before force-dismissing (ms) — safety net */
export const SPLASH_MAX_DURATION = 8000;

/**
 * Longest the fade can take before the overlay is removed anyway (ms): its 400 ms, and
 * some margin. Its end is otherwise told by transitionend, which a fade cancelled or
 * held in the background may never send — and the screen's waves run as long as it is
 * in the page.
 */
export const SPLASH_FADE_MAX = 1000;

/**
 * Where a page about to leave says the next one should show no splash screen — read
 * once, and removed, by public/splash-boot.js; js/splash-boot.test.js holds the two
 * names together.
 */
export const SPLASH_SKIP_KEY = 'ag-splash-skip';

/**
 * Say the page this one is about to open shows no splash screen: it is the same opening
 * of the app (user's choice, 2026-10-08) — the sign-in page after a sign-out, the app
 * after a sign-in. Called just before the navigation.
 */
export function skipNextSplash() {
    try {
        sessionStorage.setItem(SPLASH_SKIP_KEY, String(Date.now()));
    } catch {
        // Storage refused (a private mode): the next page shows its splash screen.
    }
}

/**
 * @class SplashScreen
 * @description Controls the #ag-splash-screen overlay lifecycle.
 */
export class SplashScreen {
    constructor() {
        /** @type {HTMLElement|null} */
        this._el = document.getElementById('ag-splash-screen');
        this._dismissed = false;
    }

    /**
     * Initialise the splash screen: remove it where public/splash-boot.js did not show
     * it, else dismiss it once the document is ready and the minimum time has passed.
     */
    init() {
        if (!this._el) return;

        if (!document.documentElement.classList.contains('splash-on')) {
            this._el.remove();
            this._el = null;
            return;
        }

        // Safety net: force dismiss after max duration no matter what
        const safetyTimer = setTimeout(() => this._dismiss(), SPLASH_MAX_DURATION);

        const dismissWhenReady = async () => {
            const shownAt = await this._shownAt();
            const remaining = Math.max(0, shownAt + SPLASH_MIN_DURATION - performance.now());
            setTimeout(() => {
                clearTimeout(safetyTimer);
                this._dismiss();
            }, remaining);
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', dismissWhenReady, { once: true });
        } else {
            dismissWhenReady();
        }
    }

    /**
     * When the screen started moving, on the clock of performance.now().
     *
     * The start of its first animation on the document timeline — the same clock — rather
     * than the navigation's start: on a phone the page loads behind iOS's launch image, and
     * the screen only starts moving at its first paint. Any animation of the screen: the
     * entrance, or under Reduce motion the icon's pulse, which has no entrance before it.
     * Without any (no Web Animations), counted from the navigation's start.
     *
     * @returns {Promise<number>} Milliseconds since the time origin.
     * @private
     */
    async _shownAt() {
        const animations = this._el?.getAnimations?.({ subtree: true }) ?? [];
        if (!animations.length) return 0;
        // A cancelled one rejects its `ready`: it simply does not count.
        await Promise.all(animations.map((a) => a.ready.catch(() => {})));
        const starts = animations.map((a) => a.startTime).filter((s) => typeof s === 'number');
        return starts.length ? Math.min(...starts) : 0;
    }

    /**
     * Fade the splash screen out, then remove it from the DOM.
     * @private
     */
    _dismiss() {
        if (this._dismissed || !this._el) return;
        this._dismissed = true;
        const el = this._el;
        let fallback = null;

        const remove = () => {
            if (!el.isConnected || el.classList.contains('hidden')) return;
            clearTimeout(fallback);
            el.classList.add('hidden'); // display: none — its animations stop with it
            setTimeout(() => el.remove(), 100);
        };

        // Trigger CSS fade-out
        el.classList.add('dismissing');

        // Removed once faded (400 ms; 150 ms under Reduce motion). Its own fade only:
        // transitionend bubbles up from the children.
        el.addEventListener('transitionend', (e) => {
            if (e.target === el) remove();
        });
        fallback = setTimeout(remove, SPLASH_FADE_MAX);
    }
}

/** Singleton instance, exported for use in main.js */
export const splashScreen = new SplashScreen();
