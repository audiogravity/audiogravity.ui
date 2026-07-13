/**
 * Unit tests for orientation-lock — the CSS-hook + Screen Orientation API bridge,
 * scoped to touch devices and skipping the redundant lock when already portrait.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { applyOrientationLock } from './orientation-lock.js';

/** Stub window.matchMedia so `(any-pointer: coarse)` resolves to `coarse`. */
const stubPointer = (coarse) => vi.stubGlobal('matchMedia', (q) => ({
    matches: coarse, media: q, addEventListener() {}, removeEventListener() {},
}));

describe('applyOrientationLock', () => {
    afterEach(() => {
        document.body.classList.remove('lock-portrait');
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('touch device, locked while in landscape: adds the class and calls lock("portrait")', () => {
        const lock = vi.fn().mockResolvedValue();
        stubPointer(true);
        vi.stubGlobal('screen', { orientation: { lock, type: 'landscape-primary' } });
        applyOrientationLock(true);
        expect(document.body.classList.contains('lock-portrait')).toBe(true);
        expect(lock).toHaveBeenCalledWith('portrait');
    });

    it('touch device, locked but already portrait: skips the redundant lock (manifest handles it)', () => {
        const lock = vi.fn().mockResolvedValue();
        stubPointer(true);
        vi.stubGlobal('screen', { orientation: { lock, type: 'portrait-primary' } });
        applyOrientationLock(true);
        expect(document.body.classList.contains('lock-portrait')).toBe(true);
        expect(lock).not.toHaveBeenCalled();
    });

    it('touch device, unlocked: removes the class and calls lock("any") to override the manifest', () => {
        const lock = vi.fn().mockResolvedValue();
        stubPointer(true);
        vi.stubGlobal('screen', { orientation: { lock, type: 'portrait-primary' } });
        applyOrientationLock(false);
        expect(document.body.classList.contains('lock-portrait')).toBe(false);
        expect(lock).toHaveBeenCalledWith('any');
    });

    it('non-touch (desktop/mouse): never touches the Screen Orientation API, still toggles the class', () => {
        const lock = vi.fn().mockResolvedValue();
        stubPointer(false);
        vi.stubGlobal('screen', { orientation: { lock, type: 'landscape-primary' } });
        applyOrientationLock(true);
        expect(document.body.classList.contains('lock-portrait')).toBe(true);
        expect(lock).not.toHaveBeenCalled();
    });

    it('no Screen Orientation API (iOS): no-op on the API, still toggles the class', () => {
        stubPointer(true);
        vi.stubGlobal('screen', { orientation: undefined });
        expect(() => applyOrientationLock(true)).not.toThrow();
        expect(document.body.classList.contains('lock-portrait')).toBe(true);
    });

    it('swallows a rejected lock()', async () => {
        const lock = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
        stubPointer(true);
        vi.stubGlobal('screen', { orientation: { lock, type: 'landscape-primary' } });
        expect(() => applyOrientationLock(true)).not.toThrow();
        await Promise.resolve();
        await Promise.resolve();
        expect(lock).toHaveBeenCalledWith('portrait');
    });

    it('swallows a SYNCHRONOUS throw from lock() (legacy engines)', () => {
        const lock = vi.fn(() => { throw new Error('InvalidStateError'); });
        stubPointer(true);
        vi.stubGlobal('screen', { orientation: { lock, type: 'landscape-primary' } });
        expect(() => applyOrientationLock(true)).not.toThrow();
        expect(lock).toHaveBeenCalled();
    });
});
