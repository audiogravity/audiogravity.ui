/**
 * Unit tests for scroll-behavior — smooth by default, at once when the reader asked for less
 * motion in the app or in the system.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { scrollBehavior } from './scroll-behavior.js';

/** Answer the system's Reduce motion query as given. */
function systemReducesMotion(on) {
    vi.stubGlobal('matchMedia', vi.fn((query) => ({ matches: on && query === '(prefers-reduced-motion: reduce)' })));
}

describe('scrollBehavior', () => {
    afterEach(() => {
        document.body.classList.remove('no-animations');
        vi.unstubAllGlobals();
    });

    it('scrolls smoothly when nothing asks for less motion', () => {
        systemReducesMotion(false);
        expect(scrollBehavior()).toBe('smooth');
    });

    it('jumps when animations are off in the app', () => {
        systemReducesMotion(false);
        document.body.classList.add('no-animations');
        expect(scrollBehavior()).toBe('auto');
    });

    it('jumps when the system asks for reduced motion, animations on in the app', () => {
        systemReducesMotion(true);
        expect(scrollBehavior()).toBe('auto');
    });

    it('scrolls smoothly in a browser that cannot answer the query', () => {
        vi.stubGlobal('matchMedia', undefined);
        expect(scrollBehavior()).toBe('smooth');
    });
});
