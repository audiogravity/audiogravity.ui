/**
 * Unit tests for common.js utilities.
 *
 * common.js runs auth at module-level so helpers are tested by replicating
 * their logic directly in jsdom — avoids the module-load side-effects.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/** Replicate escapeHtml from common.js without the auth side effects. */
function escapeHtml(text) {
    if (typeof text !== 'string') return text;
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

describe('escapeHtml (P1 — XSS prevention)', () => {
    it('escapes < and > as entities', () => {
        expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('escapes & as &amp;', () => {
        expect(escapeHtml('foo & bar')).toBe('foo &amp; bar');
    });

    it('neutralises XSS payload — no executable HTML tag', () => {
        const payload = '<img src=x onerror=alert(1)>';
        const result = escapeHtml(payload);
        // The raw < is escaped so no real HTML element is created
        expect(result).not.toContain('<img');
        expect(result).toContain('&lt;img');
        // The word "onerror" remains in the text but is inert (not an attribute)
        expect(result).toContain('&lt;img src=x onerror=alert(1)&gt;');
    });

    it('leaves plain text unchanged', () => {
        expect(escapeHtml('Hello world')).toBe('Hello world');
    });

    it('passes through non-string values unchanged', () => {
        expect(escapeHtml(42)).toBe(42);
        expect(escapeHtml(null)).toBe(null);
        expect(escapeHtml(undefined)).toBe(undefined);
    });

    it('empty string returns empty string', () => {
        expect(escapeHtml('')).toBe('');
    });
});

// ── SW reload guard (sessionStorage anti-loop) ────────────────────────────────
// Replicates the logic from common.js controllerchange handler and load preamble.

/** Replicate the guard logic from common.js without SW registration side-effects. */
function makeSwReloadGuard(storage, reloadFn) {
    return {
        /** Called at window load — clears the guard so future updates can reload. */
        clearGuard() {
            storage.removeItem('sw-reloading');
        },
        /** Called in the controllerchange listener. */
        onControllerChange() {
            if (storage.getItem('sw-reloading')) return false;
            storage.setItem('sw-reloading', '1');
            reloadFn();
            return true;
        },
    };
}

describe('SW reload guard (sw-reloading sessionStorage key)', () => {
    let storage;
    let reloadSpy;
    let guard;

    beforeEach(() => {
        storage = { _data: {}, getItem: (k) => storage._data[k] ?? null, setItem: (k, v) => { storage._data[k] = v; }, removeItem: (k) => { delete storage._data[k]; } };
        reloadSpy = vi.fn();
        guard = makeSwReloadGuard(storage, reloadSpy);
    });

    afterEach(() => vi.restoreAllMocks());

    it('reloads on first controllerchange and sets guard key', () => {
        const didReload = guard.onControllerChange();
        expect(didReload).toBe(true);
        expect(reloadSpy).toHaveBeenCalledOnce();
        expect(storage.getItem('sw-reloading')).toBe('1');
    });

    it('does NOT reload if guard key is already set (loop prevention)', () => {
        storage.setItem('sw-reloading', '1');
        const didReload = guard.onControllerChange();
        expect(didReload).toBe(false);
        expect(reloadSpy).not.toHaveBeenCalled();
    });

    it('clearGuard removes the key so the next update can reload', () => {
        guard.onControllerChange();           // sets guard, reloads
        guard.clearGuard();                   // simulates next page load
        const didReload = guard.onControllerChange(); // should reload again
        expect(didReload).toBe(true);
        expect(reloadSpy).toHaveBeenCalledTimes(2);
    });

    it('clearGuard is idempotent when key is absent', () => {
        expect(() => guard.clearGuard()).not.toThrow();
        expect(storage.getItem('sw-reloading')).toBeNull();
    });

    it('two rapid controllerchange events only reload once', () => {
        guard.onControllerChange();
        guard.onControllerChange();
        expect(reloadSpy).toHaveBeenCalledOnce();
    });
});
