/**
 * @module gesture-constants
 * @description Shared constants for the app's touch-gesture layer.
 *
 * Scope, decided 2026-07-26 after a line-by-line comparison: this module owns the
 * shared *geometry*, not the gestures themselves. The now-playing swipe exists in a
 * mini and a fullscreen flavour that look alike but are not: the mini has an
 * `open-player` outcome the fullscreen has no use for, the fullscreen makes its
 * pull-down dismiss conditional on the scroll position and carries its own
 * scale/radius/opacity feel. All they truly share is the axis lock — roughly three
 * lines. Hoisting those would mean opening a third file to read one gesture, so it
 * was deliberately NOT done; do not "factor it out" without a new argument.
 *
 * Known nuance, worth knowing before touching either: the dead-zone exit differs —
 * the mini leaves it as soon as ONE axis passes the slop, the fullscreen waits for
 * BOTH. The mini therefore engages a hair earlier on a perfectly straight drag.
 * Worth unifying only as part of real feel work, never on its own. Kept in ONE
 * place so every pan gesture that must yield near a screen edge agrees on how
 * wide that edge band is — the row swipe-to-remove (SwipeToDismissController) and
 * the global tab-swipe (js/gestures.js) both read {@link EDGE_GESTURE_PX}, so the
 * value can't drift between them.
 */

/**
 * Width (px) of the screen-edge band reserved for the panel-open swipes: the
 * settings/config panel opens on a right-edge swipe (ag-config-panel.js) and the
 * sidebar on a left-edge swipe (ag-tabs.js). Any pan gesture that could otherwise
 * fire on a full-width row — the row swipe-to-remove, the global tab-swipe —
 * ignores a gesture that STARTS inside this band, so an edge swipe opens the panel
 * only and never also removes a row / switches a tab.
 *
 * Must stay ≥ {@link PANEL_OPEN_EDGE_PX} plus a margin — see that constant for why
 * the two differ on purpose. The invariant is enforced by gesture-constants.test.js,
 * not merely stated here.
 */
export const EDGE_GESTURE_PX = 40;

/**
 * Width (px) of the band in which an edge swipe actually OPENS a panel: the sidebar
 * on the left (ag-tabs.js), the settings/config panel on the right
 * (ag-config-panel.js).
 *
 * Deliberately NARROWER than {@link EDGE_GESTURE_PX}. The gap between the two is a
 * safety margin, not an oversight: a swipe starting there opens nothing, which is
 * exactly what we want, because the alternative is a left-to-right drag near the
 * edge REMOVING a radio station while the user was reaching for the panel. Doing
 * nothing beats doing something destructive by accident.
 *
 * Never raise this to meet EDGE_GESTURE_PX — that closes the margin and brings the
 * accidental deletions back.
 */
export const PANEL_OPEN_EDGE_PX = 25;

/**
 * True when a gesture that STARTS at viewport x-coordinate `clientX` falls inside
 * either screen-edge band ({@link EDGE_GESTURE_PX} wide). Pan gestures that must
 * yield the edges to the panel-open swipes (row swipe-to-remove, tab-swipe) call
 * this so the edge test lives in ONE place.
 *
 * @param {number} clientX - Pointer/touch viewport X at gesture start.
 * @returns {boolean} True if the gesture began in a reserved edge band.
 */
export function isScreenEdgeStart(clientX) {
    return clientX <= EDGE_GESTURE_PX || clientX >= window.innerWidth - EDGE_GESTURE_PX;
}

/**
 * Movement (px) a touch must travel before it counts as a gesture rather than a
 * tap — the dead-zone every pan shares, and the threshold at which a gesture
 * locks onto an axis.
 *
 * Lived as a bare `8` in the global tab-swipe and the mini-player, and as a
 * private constant in the swipe-to-dismiss controller and the fullscreen player
 * — four copies of one number, one of which carried the comment "shared with
 * mini-player" without any code making that true. A gesture that commits after
 * 8 px in one component and 10 px in another feels broken rather than tuned.
 *
 * @type {number}
 */
export const GESTURE_SLOP_PX = 8;
