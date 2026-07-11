/**
 * Unit tests for ag-tabs.js — the mobile sidebar drag cleanup.
 *
 * Regression: an inline `transform` applied during an edge-swipe was left on the
 * sidebar (and toggle button) when the gesture turned vertical or ended without
 * a committed swipe. The stuck inline transform overrides the class-based CSS,
 * leaving the sidebar off-screen while its state says "open" — only a full reload
 * cleared it. _clearDragTransform() must run on every such path.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('lit', () => ({ LitElement: class {}, html: () => ({}), nothing: null }));
vi.mock('lit/directives/class-map.js', () => ({ classMap: () => ({}) }));
vi.mock('../../ag-icons.js', () => ({
    iconTabProfiles: '', iconTabServices: '', iconTabPipeline: '', iconTabSystem: '',
    iconTabPerformance: '', iconTabLibrary: '', iconHeadphones: '', iconSettingsSliders: '',
    iconSliders: '', iconShield: '', iconDsdLock: '', iconBell: '',
}));
vi.mock('../../auth.js', () => ({ getCurrentUser: vi.fn() }));
vi.mock('../../api.js', () => ({ apiGet: vi.fn() }));

import { AgTabs } from './ag-tabs.js';

/** Bare instance with mocked style targets. */
function makeEl(overrides = {}) {
    const el = Object.create(AgTabs.prototype);
    el.style = { removeProperty: vi.fn(), transition: '' };
    el._sidebarToggleEl = { style: { removeProperty: vi.fn(), transition: '' } };
    return Object.assign(el, overrides);
}

describe('ag-tabs — drag transform cleanup', () => {
    beforeEach(() => {
        vi.spyOn(document, 'querySelector').mockReturnValue(null);
    });
    afterEach(() => vi.restoreAllMocks());

    describe('_clearDragTransform', () => {
        it('removes the inline transform from the sidebar and the toggle button', () => {
            const el = makeEl();
            el._clearDragTransform();
            expect(el.style.removeProperty).toHaveBeenCalledWith('transform');
            expect(el._sidebarToggleEl.style.removeProperty).toHaveBeenCalledWith('transform');
        });

        it('also resets the config modal when present', () => {
            const modal = { style: { removeProperty: vi.fn(), transition: 'none' } };
            document.querySelector.mockReturnValue(modal);
            makeEl()._clearDragTransform();
            expect(modal.style.removeProperty).toHaveBeenCalledWith('transform');
            expect(modal.style.transition).toBe('');
        });

        it('is safe when the toggle button is not present', () => {
            const el = makeEl({ _sidebarToggleEl: null });
            expect(() => el._clearDragTransform()).not.toThrow();
        });
    });

    describe('_handleTouchMove — edge-swipe turned vertical', () => {
        it('clears the inline transform instead of leaving it stuck', () => {
            const el = makeEl({ _touchOpening: true, _touchStartX: 100, _touchStartY: 100 });
            const spy = vi.spyOn(el, '_clearDragTransform');

            // Mostly-vertical move (dy=30 > dx=5, > 8px threshold) → cancels the edge-swipe.
            el._handleTouchMove({
                touches: [{ clientX: 105, clientY: 130 }],
                preventDefault: vi.fn(),
            });

            expect(el._touchOpening).toBe(false);
            expect(spy).toHaveBeenCalledTimes(1);
        });
    });

    describe('_handleTouchEnd — ends with no active/opening drag', () => {
        it('clears any orphaned transform before the early return', () => {
            const el = makeEl({ _touchOpening: false, _touchActive: false });
            const spy = vi.spyOn(el, '_clearDragTransform');

            el._handleTouchEnd({ changedTouches: [{ clientX: 0, clientY: 0 }] });

            expect(spy).toHaveBeenCalledTimes(1);
        });
    });
});
