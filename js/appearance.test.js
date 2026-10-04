/**
 * The appearance — which palette applies, and the one sequence that applies it.
 *
 * The sequence was written twice — <ag-config-panel>'s switch and the login card's button —
 * and the second copy differed from the first by exactly what its author forgot: the
 * `theme-changed` event, which is what repaints the browser chrome inside the
 * application. None of that shows up on screen: the palette flips either way, and only
 * the status bar of a home-screen launch keeps the old colour.
 *
 * The setting is now one of three — Automatic, the default, follows the device; Light and
 * Dark hold — and the old switch's stored position still counts as a choice.
 *
 * The globals are read rather than imported because the login page has none of them, so
 * each case below sets up the world it is describing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readStylesheet, deviceAppearance } from './test-utils.js';
import {
    APPEARANCES, appearancePreference, isDarkFor, setAppearance, setDarkMode, systemPrefersDark,
} from './appearance.js';

/** A device in its light or dark appearance (test-utils.js). */
const device = deviceAppearance;

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
    vi.unstubAllGlobals();
});

describe('the setting of a device', () => {
    it('is Automatic on a device that never chose', () => {
        expect(appearancePreference()).toBe('auto');
    });

    it('is the stored choice', () => {
        for (const choice of APPEARANCES) {
            localStorage.setItem('appearance', choice);
            expect(appearancePreference()).toBe(choice);
        }
    });

    it('is, before any new choice, the position of the old switch', () => {
        // Someone who had picked a palette keeps it through the update.
        localStorage.setItem('darkMode', 'true');
        expect(appearancePreference()).toBe('dark');
        localStorage.setItem('darkMode', 'false');
        expect(appearancePreference()).toBe('light');
    });

    it('is the new choice over the old switch', () => {
        localStorage.setItem('darkMode', 'true');
        localStorage.setItem('appearance', 'auto');
        expect(appearancePreference()).toBe('auto');
    });

    it('ignores a value it does not know', () => {
        localStorage.setItem('appearance', 'sepia');
        expect(appearancePreference()).toBe('auto');
    });

    it('is read through MemoryCache when the application provides one', () => {
        window.MemoryCache = { get: (key, fallback) => (key === 'appearance' ? 'dark' : fallback) };
        expect(appearancePreference()).toBe('dark');
    });
});

describe('the palette of a setting', () => {
    it('is the device\'s under Automatic', () => {
        device(true);
        expect(isDarkFor('auto')).toBe(true);
        device(false);
        expect(isDarkFor('auto')).toBe(false);
    });

    it('holds under Light and Dark, whatever the device does', () => {
        device(true);
        expect(isDarkFor('light')).toBe(false);
        device(false);
        expect(isDarkFor('dark')).toBe(true);
    });

    it('is light where the browser cannot tell the device\'s', () => {
        // jsdom has no matchMedia, as some embedded browsers do not.
        expect(systemPrefersDark()).toBe(false);
        expect(isDarkFor('auto')).toBe(false);
    });
});

describe('setAppearance', () => {
    it('stores the choice the way theme-boot.js reads it back', () => {
        // Key and encoding both matter: this is what decides the palette of the next cold
        // load, before any bundle evaluates. A raw string, as MemoryCache writes one.
        setAppearance('dark');
        expect(localStorage.getItem('appearance')).toBe('dark');
        setAppearance('auto');
        expect(localStorage.getItem('appearance')).toBe('auto');
    });

    it('applies the device\'s palette under Automatic', () => {
        device(true);
        expect(setAppearance('auto')).toBe(true);
        expect(document.documentElement.classList.contains('dark-mode')).toBe(true);
    });

    it('takes anything it does not know for Automatic', () => {
        setAppearance('sepia');
        expect(localStorage.getItem('appearance')).toBe('auto');
    });

    it('announces the palette to a control that shows it', () => {
        const heard = [];
        const listen = (e) => heard.push(e.detail);
        window.addEventListener('appearance-changed', listen);
        setAppearance('dark');
        setAppearance('light');
        window.removeEventListener('appearance-changed', listen);
        expect(heard).toEqual([{ darkMode: true }, { darkMode: false }]);
    });
});

describe('setDarkMode', () => {
    it('stamps both elements, since the tokens and the theme rules read different ones', () => {
        setDarkMode(true);
        expect(document.documentElement.classList.contains('dark-mode')).toBe(true);
        expect(document.body.classList.contains('dark-mode')).toBe(true);

        setDarkMode(false);
        expect(document.documentElement.classList.contains('dark-mode')).toBe(false);
        expect(document.body.classList.contains('dark-mode')).toBe(false);
    });

    it('is a choice of Light or Dark, which leaves Automatic', () => {
        device(true);
        setDarkMode(false);
        expect(localStorage.getItem('appearance')).toBe('light');
        expect(document.documentElement.classList.contains('dark-mode')).toBe(false);
    });

    it('goes through MemoryCache when the application provides one', () => {
        // Writing straight to localStorage would leave its in-memory copy stale, and the
        // panel reads that copy: the two controls would disagree until reload.
        const written = [];
        window.MemoryCache = { set: (k, v) => written.push([k, v]) };
        window.AppState = { appearance: 'auto', darkMode: false };

        setDarkMode(true);

        expect(written).toEqual([['appearance', 'dark']]);
        expect(window.AppState).toEqual({ appearance: 'dark', darkMode: true });
        expect(localStorage.getItem('appearance'), 'written twice').toBeNull();
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

/** A fresh copy of the module: whether it already follows the device is held per page. */
const fresh = async () => {
    vi.resetModules();
    return import('./appearance.js');
};

describe('the start of a page', () => {
    it('puts the appearance on both elements, then follows the device', async () => {
        const { applyStoredAppearance } = await fresh();
        const phone = device(true);
        const dark = () => [document.documentElement, document.body].map((e) => e.classList.contains('dark-mode'));

        expect(applyStoredAppearance()).toBe(true);
        expect(dark()).toEqual([true, true]);

        phone.flip(false);
        expect(dark()).toEqual([false, false]);
    });

    it('takes off a palette the page was stamped with, when the setting says otherwise', async () => {
        const { applyStoredAppearance } = await fresh();
        localStorage.setItem('appearance', 'light');
        document.documentElement.classList.add('dark-mode');

        expect(applyStoredAppearance()).toBe(false);
        expect(document.documentElement.classList.contains('dark-mode')).toBe(false);
    });

    it('is how both pages start — the application and the sign-in page', () => {
        // Each wrote the sequence out, and no test ran either: removing the call that
        // follows the device left every test green (code review, 2026-10-04).
        for (const page of ['common.js', 'login.js']) {
            expect(readStylesheet('js', page), page).toMatch(/\bapplyStoredAppearance\(\);/);
        }
    });
});

describe('following the device', () => {

    it('repaints when the device changes, under Automatic', async () => {
        const { followSystemAppearance } = await fresh();
        const phone = device(false);
        followSystemAppearance();

        phone.flip(true);
        expect(document.documentElement.classList.contains('dark-mode')).toBe(true);
        phone.flip(false);
        expect(document.documentElement.classList.contains('dark-mode')).toBe(false);
    });

    it('holds a palette that was chosen', async () => {
        const { followSystemAppearance } = await fresh();
        localStorage.setItem('appearance', 'light');
        const phone = device(false);
        followSystemAppearance();

        phone.flip(true);
        expect(document.documentElement.classList.contains('dark-mode')).toBe(false);
    });

    it('listens once, however often it is asked', async () => {
        const { followSystemAppearance } = await fresh();
        const phone = device(false);
        followSystemAppearance();
        followSystemAppearance();
        expect(phone.query.addEventListener).toHaveBeenCalledTimes(1);
    });

    it('does nothing where the browser cannot report the device\'s appearance', async () => {
        const { followSystemAppearance } = await fresh();
        expect(() => followSystemAppearance()).not.toThrow();
    });
});
