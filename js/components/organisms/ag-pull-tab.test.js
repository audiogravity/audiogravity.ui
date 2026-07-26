/**
 * Unit tests for the ag-pull-tab restore gesture.
 *
 * The tab is the small handle that brings the Now Playing bar back, and it used to
 * need several attempts. Two independent causes: the rule restored the bar for a
 * movement under 10 px (a tap) or an upward swipe past 30 px and did nothing in
 * between, and the target was 18 px tall — small enough that a finger routinely
 * travels into that dead band. The `@click` fallback did not rescue it either: the
 * browser cancels the synthetic click as soon as the finger passes its own slop.
 *
 * These cover the rule half only: anything that is not a deliberate downward drag
 * restores. The size half — the invisible catch area above the visible bar — is inline
 * layout, and neither the rendered template nor the source file proved reachable from
 * this harness; the invariant is stated in the component instead, next to the styles
 * it constrains.
 *
 * The component is imported for real (it pulls in `lit` only, no API layer), so these
 * run against the shipped logic rather than a copy of it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import './ag-pull-tab.js';

/** Build a touch pair carrying a vertical travel of `deltaY` px. */
function touches(deltaY) {
    const startY = 500;
    return {
        start: { touches: [{ clientY: startY }] },
        end: {
            changedTouches: [{ clientY: startY + deltaY }],
            preventDefault: vi.fn(),
        },
    };
}

describe('ag-pull-tab — restore gesture', () => {
    let el;
    let restored;

    beforeEach(() => {
        el = document.createElement('ag-pull-tab');
        restored = vi.fn();
        document.addEventListener('ag-np-restore', restored);
    });

    afterEach(() => {
        document.removeEventListener('ag-np-restore', restored);
    });

    /** Play a touch of `deltaY` px through the component. */
    function swipe(deltaY) {
        const t = touches(deltaY);
        el._handleTouchStart(t.start);
        el._handleTouchEnd(t.end);
        return t.end;
    }

    it('restores on a clean tap', () => {
        swipe(0);
        expect(restored).toHaveBeenCalledTimes(1);
    });

    it('restores on an upward swipe', () => {
        swipe(-60);
        expect(restored).toHaveBeenCalledTimes(1);
    });

    it.each([-12, -15, -20, -29])(
        'restores on a %i px travel — the band that used to do nothing',
        (deltaY) => {
            swipe(deltaY);
            expect(restored).toHaveBeenCalledTimes(1);
        },
    );

    it('restores on a sloppy tap that drifts downward within the slop', () => {
        // A finger never leaves a small target perfectly still; a few px of downward
        // drift is still a tap, not a dismissal.
        swipe(5);
        expect(restored).toHaveBeenCalledTimes(1);
    });

    it('ignores a deliberate downward drag', () => {
        swipe(40);
        expect(restored).not.toHaveBeenCalled();
    });

    it('suppresses the synthetic click it would otherwise duplicate', () => {
        // Without preventDefault the browser fires a click after the touch and the
        // bar would be restored twice.
        const end = swipe(-60);
        expect(end.preventDefault).toHaveBeenCalled();
    });

    it('leaves the click path alone when it ignores the gesture', () => {
        const end = swipe(40);
        expect(end.preventDefault).not.toHaveBeenCalled();
    });
});
