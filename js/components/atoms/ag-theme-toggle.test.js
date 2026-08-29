/**
 * Tests for the appearance toggle — the button, not the switching.
 *
 * Applying, persisting and announcing the appearance is appearance.js, tested in
 * js/appearance.test.js and shared with the configuration panel's switch. What is left
 * here is what the button itself owes: an initial state read off the document rather than
 * defaulted, an icon that names the destination rather than the current state, and the
 * delegation actually happening on click.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import './ag-theme-toggle.js';

/** Mount a toggle, with the document in the given appearance. */
async function mount(dark) {
    document.documentElement.classList.toggle('dark-mode', dark);
    document.documentElement.setAttribute('data-theme', 'gravity');
    const el = document.createElement('ag-theme-toggle');
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
}

describe('ag-theme-toggle', () => {
    beforeAll(async () => {
        await customElements.whenDefined('ag-theme-toggle');
    });

    beforeEach(() => {
        localStorage.clear();
        delete window.MemoryCache;
        delete window.AppState;
        delete window.agApplyAppearance;
    });

    afterEach(() => {
        document.body.innerHTML = '';
        document.documentElement.classList.remove('dark-mode');
        document.body.classList.remove('dark-mode');
    });

    it('takes its initial state from the document, not from a default', () => {
        // theme-boot.js stamps the appearance before the first paint. A component
        // starting from its own `false` would show the wrong icon on a dark page.
        return mount(true).then(el => {
            expect(el.darkMode).toBe(true);
            expect(el.querySelector('button').getAttribute('aria-pressed')).toBe('true');
        });
    });

    it('offers the appearance you are not in', async () => {
        const light = await mount(false);
        expect(light.querySelector('button').getAttribute('aria-label')).toMatch(/dark/i);
        light.remove();

        const dark = await mount(true);
        expect(dark.querySelector('button').getAttribute('aria-label')).toMatch(/light/i);
    });

    it('hands the click to the shared switch', async () => {
        // Not a second implementation: the observable effects of appearance.js, checked
        // here only to prove the button actually calls it — and calls it back.
        const el = await mount(false);
        el.querySelector('button').click();
        await el.updateComplete;
        expect(document.documentElement.classList.contains('dark-mode')).toBe(true);
        expect(document.body.classList.contains('dark-mode')).toBe(true);

        el.querySelector('button').click();
        await el.updateComplete;
        expect(document.documentElement.classList.contains('dark-mode')).toBe(false);
        expect(document.body.classList.contains('dark-mode')).toBe(false);
    });

    it('announces the change to whoever is listening', async () => {
        const el = await mount(false);
        const seen = [];
        el.addEventListener('ag-change', e => seen.push(e.detail));
        el.querySelector('button').click();
        expect(seen).toEqual([{ darkMode: true }]);
    });
});
