/**
 * Unit tests for ag-toast-notification — what a toast does once it is on screen.
 *
 * Decided by the user on 2026-10-27: a toast can be closed; an error or a warning stays
 * until it is; a success or an info leaves after its duration, but not while a pointer, a
 * finger or the focus rests on it; an "in progress" notice turns into its result.
 *
 * Covers:
 * 1. the close button: a real button, which closes the toast once
 * 2. which types leave by themselves, and after how long
 * 3. the hold of a pointer, a finger or the focus
 * 4. setMessage(): the same toast, another message, that message's time
 * 5. the words, read once: no live region, no hidden copy; the error icon is not the close X
 * 6. the stylesheet: on a phone, below the top bar and its notch, the margins even; the type
 *    in the theme's own state colours (choice "b"), none of the toasts' own
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readStylesheet, mediaBlock, cssRuleBody, cssRules } from '../../test-utils.js';
import './ag-toast-notification.js';

/** A toast shown with the given properties, connected, rendered. */
async function toast(props) {
    const el = document.createElement('ag-toast-notification');
    Object.assign(el, { type: 'success', title: 'Saved', message: 'Done', duration: 4000 }, props);
    document.body.appendChild(el);
    el.show = true;
    await el.updateComplete;
    return el;
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
});

describe('the close button', () => {
    it('is a real button, named for a screen reader', async () => {
        const el = await toast();
        const close = el.querySelector('.toast-close');
        expect(close.tagName).toBe('BUTTON');
        expect(close.getAttribute('type')).toBe('button');
        expect(close.getAttribute('aria-label')).toBe('Dismiss');
    });

    it('closes the toast, says so once, and takes it off the page after its animation', async () => {
        const el = await toast({ type: 'error' });
        const closed = vi.fn();
        el.addEventListener('toast-close', closed);
        el.querySelector('.toast-close').click();
        el.querySelector('.toast-close').click();
        expect(el.show).toBe(false);
        expect(el.closing).toBe(true);
        expect(closed).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(300);
        expect(el.isConnected).toBe(false);
    });
});

describe('the time a toast stays', () => {
    it.each(['success', 'info'])('— %s — leaves after its duration', async (type) => {
        const el = await toast({ type, duration: 4000 });
        vi.advanceTimersByTime(3999);
        expect(el.show).toBe(true);
        vi.advanceTimersByTime(1);
        expect(el.show).toBe(false);
    });

    it.each(['error', 'warning'])('— %s — stays until it is closed, whatever duration it was given', async (type) => {
        const el = await toast({ type, duration: 4000 });
        vi.advanceTimersByTime(10 * 60 * 1000);
        expect(el.show).toBe(true);
    });

    it('— an info of duration 0, an operation in progress — stays until it is updated or closed', async () => {
        const el = await toast({ type: 'info', duration: 0 });
        vi.advanceTimersByTime(10 * 60 * 1000);
        expect(el.show).toBe(true);
    });
});

describe('a pointer, a finger or the focus on the toast', () => {
    it('holds it past its time, and leaving gives it its full time again', async () => {
        const el = await toast({ duration: 4000 });
        const card = el.querySelector('.toast');
        vi.advanceTimersByTime(3000);
        card.dispatchEvent(new Event('pointerenter'));
        vi.advanceTimersByTime(60 * 1000);
        expect(el.show).toBe(true);
        card.dispatchEvent(new Event('pointerleave'));
        vi.advanceTimersByTime(3999);
        expect(el.show).toBe(true);
        vi.advanceTimersByTime(1);
        expect(el.show).toBe(false);
    });

    it('holds it while the focus is inside, moving within it included', async () => {
        const el = await toast({ duration: 4000 });
        const card = el.querySelector('.toast');
        const close = el.querySelector('.toast-close');
        card.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        card.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: close }));
        vi.advanceTimersByTime(60 * 1000);
        expect(el.show).toBe(true);
        card.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }));
        vi.advanceTimersByTime(4000);
        expect(el.show).toBe(false);
    });

    it('stays while the focus is in it, a pointer passing over it and leaving', async () => {
        // One hold for both: the pointer leaving restarted the countdown of a toast the
        // keyboard was in.
        const el = await toast({ duration: 4000 });
        const card = el.querySelector('.toast');
        card.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        card.dispatchEvent(new Event('pointerenter'));
        card.dispatchEvent(new Event('pointerleave'));
        vi.advanceTimersByTime(60 * 1000);
        expect(el.show).toBe(true);
        card.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }));
        vi.advanceTimersByTime(4000);
        expect(el.show).toBe(false);
    });

    it('stays while a pointer rests on it, the focus leaving', async () => {
        const el = await toast({ duration: 4000 });
        const card = el.querySelector('.toast');
        card.dispatchEvent(new Event('pointerenter'));
        card.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        card.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }));
        vi.advanceTimersByTime(60 * 1000);
        expect(el.show).toBe(true);
        card.dispatchEvent(new Event('pointerleave'));
        vi.advanceTimersByTime(4000);
        expect(el.show).toBe(false);
    });
});

describe('setMessage — an operation\'s result in place of its notice', () => {
    it('keeps the same toast and shows the new words and type', async () => {
        const el = await toast({ type: 'info', title: 'Checking…', message: 'All packages', duration: 0 });
        el.setMessage('success', 'Checked', '2 updates are available', 4000);
        await el.updateComplete;
        const card = el.querySelector('.toast');
        expect(card.classList.contains('success')).toBe(true);
        expect(card.querySelector('.toast-title').textContent).toBe('Checked');
        expect(card.querySelector('.toast-message').textContent).toBe('2 updates are available');
    });

    it('gives the result its own time: a success leaves, an error stays', async () => {
        const done = await toast({ type: 'info', duration: 0 });
        done.setMessage('success', 'Checked', 'Up to date', 4000);
        vi.advanceTimersByTime(4000);
        expect(done.show).toBe(false);

        const failed = await toast({ type: 'info', duration: 0 });
        failed.setMessage('error', 'Check failed', 'No answer', 4000);
        vi.advanceTimersByTime(10 * 60 * 1000);
        expect(failed.show).toBe(true);
    });

    it('keeps its own duration when the update names none', async () => {
        const el = await toast({ type: 'info', duration: 2000 });
        el.setMessage('success', 'Checked', 'Up to date');
        expect(el.duration).toBe(2000);
    });
});

describe('the words of a toast', () => {
    it('are written once: no hidden copy for screen readers, no live region of its own', async () => {
        const el = await toast({ title: 'Added to queue', message: 'Kind of Blue' });
        expect(el.textContent.match(/Added to queue/g)).toHaveLength(1);
        expect(el.textContent.match(/Kind of Blue/g)).toHaveLength(1);
        expect(el.querySelector('.sr-only')).toBeNull();
        for (const node of [el, ...el.querySelectorAll('*')]) {
            expect(node.hasAttribute('aria-live'), node.className).toBe(false);
            expect(['status', 'alert']).not.toContain(node.getAttribute('role'));
        }
    });

    it('are said with their type, for what the colour and the icon show', async () => {
        const el = await toast({ type: 'error', title: 'Playback failed', message: 'No answer' });
        expect(el.announcement).toBe('Error: Playback failed. No answer');
    });

    it('show an error with a circled X, not the bare X of the close button', async () => {
        const el = await toast({ type: 'error' });
        const icon = el.querySelector('.toast-icon svg').innerHTML;
        const close = el.querySelector('.toast-close svg').innerHTML;
        expect(icon).toContain('<circle');
        expect(icon).not.toBe(close);
    });
});

describe('the stylesheet', () => {
    const css = readStylesheet('css', 'components', 'toast.css');

    /**
     * What a rule's `top` adds up, as written.
     * @param {{selectors: string[], body: string}[]} rules
     * @param {string} selector
     * @returns {string}
     */
    const topOf = (rules, selector) =>
        rules.find((r) => r.selectors.includes(selector))?.body.match(/(?:^|;)\s*top:\s*([^;]+)/)?.[1] ?? '';

    // An error stays until it is closed: wherever the toasts lie, they lie for good. Measured
    // in Chromium (2026-10-27) before these rules, three toasts hid the Library and Manual
    // tabs of a computer, every tab of a narrow window, the offline banner's RETRY on a phone
    // and the menu, Library and settings buttons under an installed app's notch.

    it('starts the toasts of a computer below the tab bar, or the title bar beside a column of tabs', () => {
        const rules = cssRules(css);
        // The offline banner lies over the title bar, and outgrows it where that bar is gone.
        const titleOrBanner = 'max(var(--title-bar-height), var(--offline-banner-offset))';
        const bar = topOf(rules, '.toast-container');
        for (const part of ['var(--topbar-height)', titleOrBanner, 'var(--tabs-height)']) expect(bar).toContain(part);
        const column = topOf(rules, 'body:has(.tabs--vertical) .toast-container');
        for (const part of ['var(--topbar-height)', titleOrBanner]) expect(column).toContain(part);
        expect(column).not.toContain('--tabs-height');
    });

    it('starts the toasts of a phone below the top bar and its notch, the offline banner and a tab bar', () => {
        const phone = cssRules(mediaBlock(css, /@media\s*\(width\s*<=\s*768px\)/));
        const frame = ['var(--topbar-height)', 'env(safe-area-inset-top, 0px)', 'var(--offline-banner-offset)'];
        const bar = topOf(phone, '.toast-container');
        for (const part of [...frame, 'var(--tabs-height)']) expect(bar).toContain(part);
        const column = topOf(phone, 'body:has(.tabs--vertical) .toast-container');
        for (const part of frame) expect(column).toContain(part);
        expect(column).not.toContain('--tabs-height');
    });

    it('gives the X a finger\'s 44px, as the app\'s touch size, and keeps its drawing', () => {
        const close = cssRules(css).find((r) => r.selectors.includes('.toast-close')).body;
        const drawn = Number(close.match(/(?:^|;)\s*width:\s*(\d+)px/)[1]);
        const coarse = cssRules(mediaBlock(css, /@media\s*\(pointer:\s*coarse\)/));
        const zone = coarse.find((r) => r.selectors.includes('.toast-close::before'))?.body ?? '';
        const margin = -Number(zone.match(/inset:\s*(-?\d+)px/)?.[1] ?? 0);
        expect(close).toMatch(/position:\s*relative/);
        expect(drawn).toBe(28);
        expect(drawn + 2 * margin).toBeGreaterThanOrEqual(44);
    });

    it('gives a phone\'s toast the whole width between even margins', () => {
        // A cap narrower than the column left 6px on the left and 18px on the right.
        const phone = mediaBlock(css, /@media\s*\(width\s*<=\s*768px\)/);
        expect(cssRuleBody(phone, '.toast')).toMatch(/max-width:\s*none/);
    });

    it('draws the card with the page\'s hairline, the type on its left edge and its icon', () => {
        expect(cssRuleBody(css, '.toast')).toMatch(/border:\s*1px solid var\(--border-color\)/);
        for (const type of ['success', 'error', 'warning', 'info']) {
            expect(cssRuleBody(css, `.toast.${type}`)).toMatch(new RegExp(`border-left-color:\\s*var\\(--color-${type}\\)`));
            expect(cssRuleBody(css, `.toast.${type} .toast-icon`)).toMatch(new RegExp(`color:\\s*var\\(--color-${type}-text\\)`));
        }
    });

    it('leaves the toasts no colours of their own in the themes — Minimal\'s information is its black', () => {
        for (const sheet of [['css', 'themes.css'], ['css', 'themes', 'minimal.css'], ['css', 'themes', 'slate.css'], ['css', 'themes', 'gravity.css']]) {
            expect(readStylesheet(...sheet)).not.toMatch(/--toast-(success|error|warning|info)\s*:/);
        }
    });
});
