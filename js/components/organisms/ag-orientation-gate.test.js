/**
 * Unit tests for ag-orientation-gate — the portrait-enforcement overlay.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../orientation-lock.js', () => ({ applyOrientationLock: vi.fn() }));
import { applyOrientationLock } from '../../orientation-lock.js';
import './ag-orientation-gate.js';

describe('ag-orientation-gate', () => {
    let el;

    beforeEach(() => {
        el = document.createElement('ag-orientation-gate');
        document.body.appendChild(el);
    });

    afterEach(() => {
        el.remove();
        vi.clearAllMocks();
        delete window.AppState;
        delete window.MemoryCache;
    });

    it('tags itself with the .orientation-gate CSS hook on connect', () => {
        expect(el.classList.contains('orientation-gate')).toBe(true);
    });

    it('renders the rotate prompt and a landscape escape hatch', async () => {
        await el.updateComplete;
        expect(el.querySelector('.orientation-gate-inner')).toBeTruthy();
        expect(el.querySelector('.orientation-gate-icon svg')).toBeTruthy();
        expect(el.textContent).toContain('Rotate your device');
        expect(el.querySelector('.orientation-gate-dismiss')).toBeTruthy();
    });

    it('_dismiss turns the lock off (state + persisted) and applies it', () => {
        window.AppState = { lockPortrait: true };
        window.MemoryCache = { set: vi.fn() };
        el._dismiss();
        expect(window.AppState.lockPortrait).toBe(false);
        expect(window.MemoryCache.set).toHaveBeenCalledWith('lockPortrait', false);
        expect(applyOrientationLock).toHaveBeenLastCalledWith(false);
    });

    it('_setBackgroundInert inerts sibling top-level elements but never itself', () => {
        const sib = document.createElement('div');
        document.body.appendChild(sib);
        el._setBackgroundInert(true);
        expect(sib.hasAttribute('inert')).toBe(true);
        expect(el.hasAttribute('inert')).toBe(false);
        el._setBackgroundInert(false);
        expect(sib.hasAttribute('inert')).toBe(false);
        sib.remove();
    });
});
