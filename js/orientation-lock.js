/**
 * @module orientation-lock
 * @description Portrait orientation lock for the PWA.
 *
 * Two platforms, two mechanisms, one setting (`AppState.lockPortrait`):
 * - **Android** (installed PWA): the manifest `"orientation": "portrait"` locks
 *   it at install time. To let the user *disable* the lock at runtime we override
 *   the manifest default via the Screen Orientation API (`lock('any')`).
 * - **iOS**: there is no orientation-lock API and the manifest orientation is
 *   ignored, so the lock is enforced *visually* by the `body.lock-portrait` CSS
 *   hook + the `<ag-orientation-gate>` overlay (shown only in landscape).
 *
 * The Screen Orientation API is only driven on **touch** devices (phones,
 * tablets — `any-pointer: coarse`); never on a desktop/mouse install, where it
 * is a no-op at best and could constrain the window at worst.
 */

/**
 * Force portrait, or release rotation, honouring the touch-only scope.
 * @param {boolean} locked - true to force portrait, false to allow rotation
 * @returns {void}
 */
export function applyOrientationLock(locked) {
    if (document.body) {
        document.body.classList.toggle('lock-portrait', locked);
    }

    // Only touch devices (phones/tablets) drive the OS-level lock. iOS has no
    // lock() (guarded there → the CSS overlay enforces it); desktop is excluded.
    const coarse = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        && window.matchMedia('(any-pointer: coarse)').matches;
    const orientation = typeof screen !== 'undefined' && screen.orientation;
    if (coarse && orientation && typeof orientation.lock === 'function') {
        // Skip the redundant lock when we already want portrait and the screen is
        // portrait — a fresh default-locked start is already portrait via the
        // manifest. Still re-lock when re-enabling after an unlock left it landscape.
        const alreadyPortrait = (orientation.type || '').startsWith('portrait');
        if (!locked || !alreadyPortrait) {
            // Best-effort: a non-standalone/secure context rejects (swallowed), and
            // a few legacy engines throw synchronously rather than reject (try/catch).
            try {
                const result = orientation.lock(locked ? 'portrait' : 'any');
                if (result && typeof result.catch === 'function') result.catch(() => {});
            } catch {
                /* unsupported / wrong context — the overlay still enforces portrait */
            }
        }
    }

    // Let the overlay re-evaluate its visibility (and background inert) after a
    // toggle, since the overlay is otherwise CSS-media-query driven.
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new Event('orientation-lock-changed'));
    }
}
