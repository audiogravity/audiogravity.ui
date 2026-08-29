/**
 * The light/dark switch, as one sequence for both controls.
 *
 * It was written twice — <ag-config-panel>'s switch and the login card's button — and the
 * second copy differed from the first by exactly what its author forgot: the
 * `theme-changed` event, which is what repaints the browser chrome inside the
 * application. None of that shows up on screen: the palette flips either way, and only
 * the status bar of a home-screen launch keeps the old colour.
 *
 * The globals are read rather than imported because the login page has none of them, so
 * each case below sets up the world it is describing.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setDarkMode } from './appearance.js';

describe('setDarkMode', () => {
    beforeEach(() => {
        localStorage.clear();
        delete window.MemoryCache;
        delete window.AppState;
        delete window.EventEmitter;
        delete window.agApplyAppearance;
        document.documentElement.setAttribute('data-theme', 'gravity');
    });

    afterEach(() => {
        document.documentElement.classList.remove('dark-mode');
        document.body.classList.remove('dark-mode');
    });

    it('stamps both elements, since the tokens and the theme rules read different ones', () => {
        setDarkMode(true);
        expect(document.documentElement.classList.contains('dark-mode')).toBe(true);
        expect(document.body.classList.contains('dark-mode')).toBe(true);

        setDarkMode(false);
        expect(document.documentElement.classList.contains('dark-mode')).toBe(false);
        expect(document.body.classList.contains('dark-mode')).toBe(false);
    });

    it('persists it the way theme-boot.js reads it back', () => {
        // Key and encoding both matter: this is what decides the palette of the next cold
        // load, before any bundle evaluates.
        setDarkMode(true);
        expect(localStorage.getItem('darkMode')).toBe('true');
        setDarkMode(false);
        expect(localStorage.getItem('darkMode')).toBe('false');
    });

    it('goes through MemoryCache when the application provides one', () => {
        // Writing straight to localStorage would leave its in-memory copy stale, and the
        // panel's switch reads that copy: the two controls would disagree until reload.
        const written = [];
        window.MemoryCache = { set: (k, v) => written.push([k, v]) };
        window.AppState = { darkMode: false };

        setDarkMode(true);

        expect(written).toEqual([['darkMode', true]]);
        expect(window.AppState.darkMode).toBe(true);
        expect(localStorage.getItem('darkMode'), 'écrit deux fois').toBeNull();
    });

    it('leaves the chrome to the application when the application is there', () => {
        // One painter per surface. updateThemeColorMeta() answers `theme-changed`, and it
        // replaces the history entry — doing it twice for one click is wasted work.
        const events = [];
        const hook = [];
        window.EventEmitter = { emit: (name, detail) => events.push([name, detail]) };
        window.agApplyAppearance = (...args) => hook.push(args);

        setDarkMode(true);

        expect(events).toEqual([['theme-changed', { darkMode: true }]]);
        expect(hook, "les deux peintres ont tourné").toEqual([]);
    });

    it('paints it through theme-boot when nothing else can, with the theme in force', () => {
        // The login page: no common.js, so no listener. The hook carries the same colours
        // and the same Safari remedy.
        const hook = [];
        window.agApplyAppearance = (...args) => hook.push(args);

        setDarkMode(true);

        expect(hook).toEqual([['gravity', true]]);
    });

    it('switches even with neither the event nor the hook', () => {
        // A page loaded without theme-boot.js must not end up with a dead control.
        expect(() => setDarkMode(true)).not.toThrow();
        expect(document.body.classList.contains('dark-mode')).toBe(true);
    });

    it('returns what it applied, so a caller can hold its own state', () => {
        expect(setDarkMode(true)).toBe(true);
        expect(setDarkMode(false)).toBe(false);
    });
});
