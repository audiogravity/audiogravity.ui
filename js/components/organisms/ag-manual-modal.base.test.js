/**
 * The manual's base can still be repointed per box through window.AG_CONFIG. A file of
 * its own: the base is read once, when the module loads, and the component registers
 * its element at the same moment, so it cannot be loaded twice in one file.
 */
import { describe, it, expect } from 'vitest';

window.AG_CONFIG = { manualBase: 'https://docs.example.lan/manual' };
const { MANUAL_BASE } = await import('./ag-manual-modal.js');

describe('MANUAL_BASE', () => {
    it('follows AG_CONFIG.manualBase when a box sets it', () => {
        expect(MANUAL_BASE).toBe('https://docs.example.lan/manual');
    });
});
