/**
 * @module keep-in-view
 * @description Keeping the selected item of a horizontally scrolling strip visible.
 *
 * Two strips in the app scroll sideways and can have their selection changed by
 * something other than a tap on the strip itself — the main tab rail (ag-tabs.js) and
 * the library tab bar (ag-lib-tabbar.js). Both are switched by the global content
 * swipe in js/gestures.js, and both by links deeper in the page. Left alone, either
 * would keep showing wherever it was last dragged, with the selected item off-screen.
 *
 * The two had grown the same seven lines independently, and they had already drifted:
 * one scrolled to `center` and the other to `nearest`, one made the first scroll
 * instant and the other animated it. This module is the single answer, so the next
 * strip inherits the decisions instead of re-deciding them.
 */

/**
 * Scroll a strip so the given element is visible, animating every time but the first.
 *
 * The first call is instant on purpose: it happens as a page appears, and a strip
 * gliding into position on arrival reads as a glitch rather than as feedback. Every
 * later call is a response to something the reader did, and there the movement is what
 * explains why the strip moved.
 *
 * `block: 'nearest'` is not cosmetic — the default, `start`, scrolls the PAGE
 * vertically to bring the strip to the top of the viewport, yanking the content out
 * from under the reader. `inline: 'center'` keeps the neighbours on both sides
 * reachable, which `nearest` does not once the selection sits at an edge.
 *
 * @param {Element | null | undefined} el - The selected item. No-op when absent.
 * @param {{ first?: boolean }} [opts] - `first` forces the instant, un-animated scroll.
 * @returns {void}
 */
export function keepInView(el, { first = false } = {}) {
    if (!el || typeof el.scrollIntoView !== 'function') return;
    const reduced = document.body.classList.contains('no-animations');
    el.scrollIntoView({
        behavior: first || reduced ? 'auto' : 'smooth',
        block: 'nearest',
        inline: 'center',
    });
}
