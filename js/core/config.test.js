/**
 * Unit tests for core/config.js — how the API key is resolved.
 *
 * The key used to be read from this browser's storage FIRST, so a wrong value
 * stored once outranked the key the installer injects, and the interface stayed
 * locked out for good: every upgrade republished the right key and lost. The
 * Settings panel was the only thing that could store such a value, and it has
 * been removed; the injected key is now authoritative and a leftover override
 * is dropped.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/** Re-import config.js with a given injected config and stored override. */
async function loadConfig({ injected, stored } = {}) {
    vi.resetModules();
    localStorage.clear();
    if (stored) localStorage.setItem('apiKey', stored);
    window.AG_CONFIG = injected ? { apiKey: injected } : {};
    return import('./config.js');
}

describe('API key resolution', () => {
    let consoleError;

    beforeEach(() => {
        consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleError.mockRestore();
        localStorage.clear();
        delete window.AG_CONFIG;
    });

    it('prefers the key the installer injected over one kept in this browser', async () => {
        const { API_KEY } = await loadConfig({ injected: 'from-installer', stored: 'stale' });
        expect(API_KEY).toBe('from-installer');
    });

    it('drops the leftover override so it cannot come back later', async () => {
        // Left in place, it would resurface the day an install shipped without a
        // key — which is exactly the situation it must not rescue.
        await loadConfig({ injected: 'from-installer', stored: 'stale' });
        expect(localStorage.getItem('apiKey')).toBeNull();
    });

    it('still uses a stored key when nothing is injected (development)', async () => {
        const { API_KEY } = await loadConfig({ stored: 'dev-key' });
        expect(API_KEY).toBe('dev-key');
        expect(localStorage.getItem('apiKey')).toBe('dev-key');   // kept, it is the only one
    });

    it('reports a missing key instead of throwing', async () => {
        // The dev port makes config.js offer its one-off prompt; declining it is
        // the path under test. Stubbed so the outcome does not depend on jsdom
        // leaving prompt() unimplemented.
        const prompt = vi.spyOn(window, 'prompt').mockReturnValue(null);
        try {
            const { API_KEY } = await loadConfig({});
            expect(API_KEY).toBeNull();
            expect(consoleError).toHaveBeenCalled();
        } finally {
            prompt.mockRestore();
        }
    });

    it('no longer exposes a way to overwrite the key at runtime', async () => {
        const mod = await loadConfig({ injected: 'from-installer' });
        expect(mod.setApiKey).toBeUndefined();
    });
});
