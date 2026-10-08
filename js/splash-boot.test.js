/**
 * Unit tests for public/splash-boot.js — the splash screen once per opening of the
 * installed app.
 *
 * Without it, the screen played on every page the app opened: 2.1 s before the sign-in
 * form after a sign-out, 2.1 s again before the app after a sign-in; and in a browser tab
 * it was painted for ~0.1 s before js/splash-screen.js took it out (measured 2026-10-08).
 * The user chose once per opening (2026-10-08). This plain script decides it before the
 * first paint; a page about to leave for the other one says so through skipNextSplash()
 * (js/splash-screen.js), under a key nothing but these tests ties to this file.
 *
 * Covers:
 * 1. shown: a launch of the installed app, iOS's or another's
 * 2. not shown: a browser tab, a reload, a page the previous one marked
 * 3. the mark: read once, too old to count after a while, the same key as skipNextSplash()
 * 4. where it runs: in both pages' <head>, before the body — and from the cache
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readStylesheet } from './test-utils.js';
import { SPLASH_SKIP_KEY, skipNextSplash } from './splash-screen.js';

const SOURCE = readStylesheet('public', 'splash-boot.js');

/**
 * Run the script in a page of the given kind.
 * @param {{standalone?: boolean, displayMode?: boolean, navigation?: string, storage?: Storage}} page
 * @returns {boolean} Whether the splash screen is shown.
 */
function run({ standalone = false, displayMode = false, navigation = 'navigate', storage = sessionStorage } = {}) {
    document.documentElement.classList.remove('splash-on');
    const navigator = { standalone };
    const matchMedia = (q) => ({ matches: displayMode && /display-mode:\s*standalone/.test(q) });
    const performance = { getEntriesByType: (type) => (type === 'navigation' ? [{ type: navigation }] : []) };
    // The script reads globals by name: parameters of the same names stand in for them.
    new Function('navigator', 'matchMedia', 'performance', 'sessionStorage', SOURCE)(navigator, matchMedia, performance, storage);
    return document.documentElement.classList.contains('splash-on');
}

beforeEach(() => { sessionStorage.clear(); });
afterEach(() => { vi.useRealTimers(); document.documentElement.classList.remove('splash-on'); });

describe('shown at a launch of the installed app', () => {
    it('on an iPhone\'s home screen (navigator.standalone)', () => {
        expect(run({ standalone: true })).toBe(true);
    });

    it('elsewhere (display-mode: standalone)', () => {
        expect(run({ displayMode: true })).toBe(true);
    });
});

describe('not shown', () => {
    it('in a browser tab — it was painted there for ~0.1 s', () => {
        expect(run()).toBe(false);
    });

    it('on a reload: the app\'s own after an update, or the user\'s', () => {
        expect(run({ standalone: true, navigation: 'reload' })).toBe(false);
    });

    it('on the page a sign-out or a sign-in opens: the same opening of the app', () => {
        skipNextSplash();
        expect(run({ standalone: true })).toBe(false);
    });
});

describe('the mark a leaving page leaves', () => {
    it('is the key skipNextSplash() writes', () => {
        expect(SOURCE).toContain(`'${SPLASH_SKIP_KEY}'`);
    });

    it('counts once: the page after shows its screen again', () => {
        skipNextSplash();
        expect(run({ standalone: true })).toBe(false);
        expect(sessionStorage.getItem(SPLASH_SKIP_KEY)).toBeNull();
        expect(run({ standalone: true })).toBe(true);
    });

    it('is forgotten even where it does not matter — a tab, a reload', () => {
        skipNextSplash();
        run({ navigation: 'reload' });
        expect(sessionStorage.getItem(SPLASH_SKIP_KEY)).toBeNull();
    });

    it('no longer counts after a while: left by a navigation that never happened, it would hide a later launch\'s', () => {
        vi.useFakeTimers({ now: 1_700_000_000_000 });
        skipNextSplash();
        vi.setSystemTime(1_700_000_000_000 + 10_000);
        expect(run({ standalone: true })).toBe(true);
    });

    it('a storage that refuses (a private mode) shows the screen', () => {
        const refusing = { getItem() { throw new Error('SecurityError'); }, removeItem() { throw new Error('SecurityError'); } };
        expect(run({ standalone: true, storage: refusing })).toBe(true);
    });
});

describe('where it runs', () => {
    it.each(['index.html', 'login.html'])('in %s\'s <head>, after the theme, before the body', (page) => {
        const html = readStylesheet(page);
        const at = html.indexOf('<script src="/splash-boot.js"></script>');
        expect(at).toBeGreaterThan(html.indexOf('<script src="/theme-boot.js"></script>'));
        expect(at).toBeLessThan(html.indexOf('<body'));
    });

    it('a plain script — a module would run after the first paint', () => {
        expect(SOURCE).not.toMatch(/^\s*(import|export)\b/m);
    });
});
