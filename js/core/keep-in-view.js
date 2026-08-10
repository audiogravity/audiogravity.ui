/**
 * @module keep-in-view
 * @description Keeping the selected item of a scrolling strip visible.
 *
 * Two strips in the app scroll and can have their selection changed by something
 * other than a tap on the strip itself — the main tab rail (ag-tabs.js) and the
 * library tab bar (ag-lib-tabbar.js). Both are switched by the global content
 * swipe in js/gestures.js, and both by links deeper in the page. Left alone,
 * either would keep showing wherever it was last dragged, with the selected item
 * off-screen.
 *
 * The two had grown the same seven lines independently, and they had already
 * drifted: one scrolled to `center` and the other to `nearest`, one made the
 * first scroll instant and the other animated it. This module is the single
 * answer, so the next strip inherits the decisions instead of re-deciding them.
 *
 * Why this scrolls by hand instead of calling `scrollIntoView`: that API scrolls
 * EVERY scrollable ancestor it needs to, and `.main-content` is `overflow-x:
 * hidden` — a container the spec still lets it scroll programmatically, while
 * giving the reader no scrollbar and no touch panning to undo it. A tab change
 * could shift the whole page sideways until reload. Scrolling exactly one
 * container per axis — the nearest ancestor that scrolls BY DESIGN (`auto` or
 * `scroll`), never a clipping `hidden` one — removes that entire failure class.
 */

/**
 * Find the nearest ancestor that deliberately scrolls on the given axis.
 *
 * `overflow: hidden` ancestors are skipped on purpose: hidden means "clip, do
 * not scroll" — they are exactly the containers a programmatic scroll must
 * leave alone, since the reader has no way to scroll them back.
 *
 * @param {Element} el - Starting element (the strip item).
 * @param {'x' | 'y'} axis - Which axis to look for.
 * @returns {Element | null} the scroll container, or null when none exists
 */
function scrollParent(el, axis) {
    const overflow = axis === 'x' ? 'overflowX' : 'overflowY';
    const scrollSize = axis === 'x' ? 'scrollWidth' : 'scrollHeight';
    const clientSize = axis === 'x' ? 'clientWidth' : 'clientHeight';
    let p = el.parentElement;
    while (p && p !== document.body) {
        const o = getComputedStyle(p)[overflow];
        if ((o === 'auto' || o === 'scroll') && p[scrollSize] > p[clientSize] + 1) return p;
        p = p.parentElement;
    }
    return null;
}

/**
 * Scroll the strip so the given element is visible, animating every time but
 * the first.
 *
 * The first call is instant on purpose: it happens as a strip appears, and a
 * strip gliding into position on arrival reads as a glitch rather than as
 * feedback. Every later call is a response to something the reader did, and
 * there the movement is what explains why the strip moved.
 *
 * Horizontally the element is centred, so its neighbours on both sides stay
 * reachable — `nearest` would leave them hidden once the selection sits at an
 * edge. Vertically the behaviour is `nearest`: scroll only when the element is
 * actually out of view, so a vertical rail (ag-tabs in sidebar mode) does not
 * jump when its selection is already visible.
 *
 * @param {Element | null | undefined} el - The selected item. No-op when absent.
 * @param {{ first?: boolean }} [opts] - `first` forces the instant, un-animated scroll.
 * @returns {void}
 */
export function keepInView(el, { first = false } = {}) {
    if (!el || typeof el.getBoundingClientRect !== 'function') return;
    const reduced = document.body.classList.contains('no-animations');
    const behavior = first || reduced ? 'auto' : 'smooth';
    const r = el.getBoundingClientRect();

    const sx = scrollParent(el, 'x');
    if (sx && typeof sx.scrollTo === 'function') {
        const c = sx.getBoundingClientRect();
        const left = sx.scrollLeft + (r.left - c.left) - (c.width - r.width) / 2;
        sx.scrollTo({ left: Math.max(0, left), behavior });
    }

    const sy = scrollParent(el, 'y');
    if (sy && typeof sy.scrollTo === 'function') {
        const c = sy.getBoundingClientRect();
        if (r.top < c.top) {
            sy.scrollTo({ top: sy.scrollTop - (c.top - r.top), behavior });
        } else if (r.bottom > c.bottom) {
            sy.scrollTo({ top: sy.scrollTop + (r.bottom - c.bottom), behavior });
        }
    }
}
