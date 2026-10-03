/**
 * @module scroll-behavior
 * @description How a scroll the app starts itself should move: smoothly, or at once for a
 * reader who asked for less motion — in the app (Settings, animations off: `no-animations`
 * on the body) or in the system (Reduce motion: `prefers-reduced-motion`).
 *
 * The stylesheets honour both for every transition (themes.css, responsive.css), and set
 * `scroll-behavior: auto` for the system's setting — which an explicit `behavior: 'smooth'`
 * overrides: measured in Chromium on 2026-10-03, a smooth `scrollTo` still ran with Reduce
 * motion on. Hence this question, asked before each call.
 */

/**
 * The `behavior` to give a `scrollTo` the app starts.
 * @returns {'auto' | 'smooth'} 'auto' — at once — when the reader asked for less motion.
 */
export function scrollBehavior() {
    const reduced = document.body.classList.contains('no-animations')
        || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    return reduced ? 'auto' : 'smooth';
}
