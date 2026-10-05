/**
 * @module Appearance
 * @description The one place that decides between the light and the dark palette, and
 * switches the interface to it.
 *
 * Two controls do it — the Appearance setting in <ag-config-panel> and the button on the
 * login card — and they run in different worlds: the panel only ever exists inside the
 * application, where common.js has published AppState, MemoryCache and EventEmitter; the
 * button also runs on login.html, where none of the three exist and importing common.js
 * would drag the whole application bundle onto a page that shows a form. So the globals
 * are read rather than imported, and every one of them is optional.
 *
 * What must NOT be duplicated is the sequence itself. Written twice, the copies differ by
 * exactly what the second author forgot — that is how the toggle came to skip
 * `theme-changed`, which is what repaints the browser chrome inside the application.
 *
 * The setting is one of three: Automatic — the default — follows the device, light by day
 * and dark at night on a phone set to switch; Light and Dark hold whatever the device
 * does. It used to be a light/dark switch stored as `darkMode`, and that key still counts
 * as the choice of whoever set it, until a new choice is made: the update changes nothing
 * for someone who had picked a palette. public/theme-boot.js resolves the same way before
 * the first paint, and js/theme-boot.test.js holds the two together.
 */

import { parseStoredValue } from './core/stored-value.js';

/** The three choices, in the order the setting offers them. */
export const APPEARANCES = Object.freeze(['auto', 'light', 'dark']);

/** What the device answers about its own appearance. */
const SYSTEM_DARK = '(prefers-color-scheme: dark)';

/**
 * Read a preference the way MemoryCache wrote it: through MemoryCache when the page has
 * one, else straight from the storage, decoded the same way.
 *
 * @param {string} key - The storage key.
 * @returns {*} The stored value, or null when absent or unreadable.
 */
function stored(key) {
    if (window.MemoryCache) return window.MemoryCache.get(key, null);
    try {
        const raw = localStorage.getItem(key);
        return raw === null ? null : parseStoredValue(raw);
    } catch {
        return null; // private mode: the default stands
    }
}

/**
 * The appearance this device is set to.
 *
 * @returns {'auto'|'light'|'dark'} The stored choice; else the old switch's position,
 *   Dark for on and Light for off; else Automatic.
 */
export function appearancePreference() {
    const chosen = stored('appearance');
    if (APPEARANCES.includes(chosen)) return chosen;
    const legacy = stored('darkMode');
    if (legacy === true) return 'dark';
    if (legacy === false) return 'light';
    return 'auto';
}

/**
 * Whether the device itself is in its dark appearance.
 *
 * @returns {boolean} False where the browser cannot tell.
 */
export function systemPrefersDark() {
    return typeof window.matchMedia === 'function' && window.matchMedia(SYSTEM_DARK).matches;
}

/**
 * Whether a choice means the dark palette, now.
 *
 * @param {string} preference - 'auto', 'light' or 'dark'.
 * @returns {boolean} True for Dark, and for Automatic on a device in its dark appearance.
 */
export function isDarkFor(preference) {
    return preference === 'dark' || (preference === 'auto' && systemPrefersDark());
}

/**
 * Apply the light or the dark palette and announce it; nothing is stored.
 *
 * @param {boolean} dark - Whether the dark palette should apply.
 * @returns {boolean} The palette that was applied.
 */
function paint(dark) {
    if (window.AppState) window.AppState.darkMode = dark;

    // Both elements: the tokens are read from the root, the theme rules are scoped to
    // `body.dark-mode`. Stamping one leaves half the page in the other palette.
    document.documentElement.classList.toggle('dark-mode', dark);
    document.body.classList.toggle('dark-mode', dark);

    // The browser chrome has exactly one painter per surface, never two. Inside the
    // application, `theme-changed` wakes updateThemeColorMeta(); on the login page
    // nothing listens, and theme-boot's own routine — the same colours, the same Safari
    // remedy — is what the hook exposes. Calling both would redo the work and replace
    // the history entry twice for one click.
    if (window.EventEmitter) {
        window.EventEmitter.emit('theme-changed', { darkMode: dark });
    } else {
        const theme = document.documentElement.getAttribute('data-theme');
        if (window.agApplyAppearance && theme) window.agApplyAppearance(theme, dark);
    }

    // For a control that shows the palette rather than the setting: the login card's
    // button, whose icon must follow when Automatic turns the page dark under it.
    window.dispatchEvent(new CustomEvent('appearance-changed', { detail: { darkMode: dark } }));
    return dark;
}

/**
 * Set this device's appearance: store the choice, apply its palette, announce it.
 *
 * @param {string} preference - 'auto', 'light' or 'dark'; anything else is Automatic.
 * @returns {boolean} Whether the dark palette now applies, for the caller's own state.
 */
export function setAppearance(preference) {
    const chosen = APPEARANCES.includes(preference) ? preference : 'auto';
    // MemoryCache when the application provides one, so its in-memory copy cannot go
    // stale behind the panel; the same key and the same encoding either way, because
    // public/theme-boot.js reads it back before the next first paint.
    if (window.MemoryCache) window.MemoryCache.set('appearance', chosen);
    else {
        try {
            localStorage.setItem('appearance', chosen);
        } catch { /* private mode: the appearance still applies to this page */ }
    }
    if (window.AppState) window.AppState.appearance = chosen;
    return paint(isDarkFor(chosen));
}

/**
 * Apply the light or the dark palette, persist the choice, and announce it.
 *
 * The login card's button: a tap picks a palette, so it leaves Automatic.
 *
 * @param {boolean} dark - Whether the dark palette should apply.
 * @returns {boolean} The appearance that was applied, for the caller's own state.
 */
export function setDarkMode(dark) {
    return setAppearance(dark ? 'dark' : 'light');
}

/**
 * Put this device's appearance on the page as it loads, and follow the device from then
 * on: the one start both pages make (common.js, login.js).
 *
 * theme-boot.js has already stamped <html> and painted the browser chrome, before the
 * first paint; <body> exists only now. Nothing is announced, since nothing changed.
 *
 * @returns {boolean} Whether the dark palette applies.
 */
export function applyStoredAppearance() {
    const dark = isDarkFor(appearancePreference());
    document.documentElement.classList.toggle('dark-mode', dark);
    document.body.classList.toggle('dark-mode', dark);
    followSystemAppearance();
    return dark;
}

/** Whether this page already follows the device (followSystemAppearance). */
let following = false;

/**
 * Repaint when the device changes its own appearance, while the setting is Automatic.
 *
 * One listener for the page, on the browser's own change event — nothing is polled;
 * calling it again does nothing. A browser that cannot report the change keeps the
 * palette it had when the page loaded.
 */
export function followSystemAppearance() {
    if (following || typeof window.matchMedia !== 'function') return;
    following = true;
    const query = window.matchMedia(SYSTEM_DARK);
    query.addEventListener?.('change', () => {
        if (appearancePreference() === 'auto') paint(query.matches);
    });
}
