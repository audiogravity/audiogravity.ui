/**
 * Unit tests for ag-docs-modal — the frame exists only while there is a document.
 *
 * The window sits in index.html from the start; an iframe with no address still made
 * a blank document at every launch of the app, which a probe took for the app loading
 * twice after a sign-in (user, 2026-10-09; measured in Chromium: one app document, and
 * an about:blank frame attached about a second after it). Rendered for real: what is
 * pinned is whether the frame is in the page.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import './ag-docs-modal.js';

/** @returns {Promise<HTMLElement>} A window mounted as index.html has it. */
async function mount() {
    const el = document.createElement('ag-docs-modal');
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
}

const frame = (el) => el.querySelector('iframe');

afterEach(() => {
    document.querySelectorAll('ag-docs-modal').forEach((el) => el.remove());
    vi.useRealTimers();
});

describe('ag-docs-modal — the frame', () => {
    it('is not in the page while the window has nothing to show', async () => {
        const el = await mount();
        expect(el.isOpen).toBe(false);
        expect(frame(el)).toBeNull();
    });

    it('comes with the document the window is opened on', async () => {
        const el = await mount();
        el.open('API Reference (Swagger)', '/api/docs');
        await el.updateComplete;
        expect(el.classList.contains('show')).toBe(true);
        expect(frame(el)?.getAttribute('src')).toBe('/api/docs');
    });

    it('stays while the window fades out, then goes with the address', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const el = await mount();
        el.open('API Reference (Swagger)', '/api/docs');
        await el.updateComplete;

        el.close();
        await el.updateComplete;
        expect(el.classList.contains('show')).toBe(false);
        expect(frame(el)).not.toBeNull();

        vi.advanceTimersByTime(300);
        await el.updateComplete;
        expect(el.src).toBe('');
        expect(frame(el)).toBeNull();
    });

    it('loads the document afresh at the next opening', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const el = await mount();
        el.open('API Reference (Swagger)', '/api/docs');
        await el.updateComplete;
        const first = frame(el);
        el.close();
        await el.updateComplete;
        vi.advanceTimersByTime(300);
        await el.updateComplete;

        el.open('API Reference (Swagger)', '/api/docs');
        await el.updateComplete;
        expect(frame(el)).not.toBeNull();
        expect(frame(el)).not.toBe(first);
    });

    it('closes on Escape', async () => {
        const el = await mount();
        el.open('API Reference (Swagger)', '/api/docs');
        await el.updateComplete;
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        await el.updateComplete;
        expect(el.isOpen).toBe(false);
    });
});
