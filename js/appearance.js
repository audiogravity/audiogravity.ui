/**
 * @module Appearance
 * @description The one place that switches the interface between the light and the dark
 * palette.
 *
 * Two controls do it — the switch in <ag-config-panel> and the button on the login card —
 * and they run in different worlds: the panel only ever exists inside the application,
 * where common.js has published AppState, MemoryCache and EventEmitter; the button also
 * runs on login.html, where none of the three exist and importing common.js would drag
 * the whole application bundle onto a page that shows a form. So the globals are read
 * rather than imported, and every one of them is optional.
 *
 * What must NOT be duplicated is the sequence itself. Written twice, the copies differ by
 * exactly what the second author forgot — that is how the toggle came to skip
 * `theme-changed`, which is what repaints the browser chrome inside the application.
 */

/**
 * Apply the light or the dark palette, persist the choice, and announce it.
 *
 * @param {boolean} dark - Whether the dark palette should apply.
 * @returns {boolean} The appearance that was applied, for the caller's own state.
 */
export function setDarkMode(dark) {
    // MemoryCache when the application provides one, so its in-memory copy cannot go
    // stale behind the panel's switch; the same key and the same encoding either way,
    // because public/theme-boot.js reads it back before the next first paint.
    if (window.MemoryCache) window.MemoryCache.set('darkMode', dark);
    else {
        try {
            localStorage.setItem('darkMode', JSON.stringify(dark));
        } catch { /* private mode: the appearance still applies to this page */ }
    }
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

    return dark;
}
