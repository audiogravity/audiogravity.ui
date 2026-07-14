/**
 * @module gesture-constants
 * @description Shared constants for the app's touch-gesture layer. Kept in ONE
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
 * Must stay ≥ the panel-open activation zones (25px, see ag-config-panel.js /
 * ag-tabs.js) plus a margin.
 */
export const EDGE_GESTURE_PX = 40;

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
