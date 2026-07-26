/**
 * @file Tests for the shared gesture geometry.
 *
 * The point of these is the INVARIANT between the two edge bands. It lived as a
 * sentence in a comment ("must stay ≥ the panel-open activation zones plus a
 * margin") while the panel-open value itself was hardcoded in two components that
 * never read it — so raising one of them would have broken the rule silently, and
 * the symptom would not have been a failing test but a user losing a radio station
 * to a swipe they meant for the settings panel.
 */
import { describe, it, expect } from 'vitest';
import {
    EDGE_GESTURE_PX,
    PANEL_OPEN_EDGE_PX,
    isScreenEdgeStart,
} from './gesture-constants.js';

describe('edge band invariant', () => {
    it('reserves more room than the panels actually claim', () => {
        // Equality is not enough: a gesture starting exactly at the boundary would
        // be refused by the row swipe AND ignored by the panel.
        expect(EDGE_GESTURE_PX).toBeGreaterThan(PANEL_OPEN_EDGE_PX);
    });

    it('keeps a usable safety margin, not a token one', () => {
        // The gap is what stops a near-edge left-to-right drag from removing a row
        // when the user was reaching for the panel. A couple of pixels would not
        // survive a shaky finger.
        expect(EDGE_GESTURE_PX - PANEL_OPEN_EDGE_PX).toBeGreaterThanOrEqual(10);
    });

    it('treats every panel-open touch as an edge start', () => {
        // Anything that opens a panel must also be something other gestures yield,
        // on BOTH edges — otherwise the panel opens and a row is removed at once.
        expect(isScreenEdgeStart(0)).toBe(true);
        expect(isScreenEdgeStart(PANEL_OPEN_EDGE_PX)).toBe(true);
        expect(isScreenEdgeStart(window.innerWidth - PANEL_OPEN_EDGE_PX)).toBe(true);
        expect(isScreenEdgeStart(window.innerWidth)).toBe(true);
    });

    it('leaves the middle of the screen alone', () => {
        expect(isScreenEdgeStart(window.innerWidth / 2)).toBe(false);
    });

    it('yields in the margin itself — where nothing should happen', () => {
        // The deliberate no-man's-land: past the panel-open band, still inside the
        // reserved band. A swipe here opens nothing and removes nothing.
        const inMargin = PANEL_OPEN_EDGE_PX + 1;
        expect(inMargin).toBeLessThan(EDGE_GESTURE_PX);
        expect(isScreenEdgeStart(inMargin)).toBe(true);
    });
});
