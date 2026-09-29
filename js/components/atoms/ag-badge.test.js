/**
 * Unit tests for ag-badge — a clickable badge is a real button.
 *
 * Clickable, the badge is a <button>: the browser gives it Tab, Enter and Space and
 * announces it as a button, with no code of ours, and plain-btn draws it as the
 * other badges. It is of type "button", so a form it sits in is never submitted by
 * it. Not clickable, it is plain text and fires nothing.
 *
 * Covers:
 * 1. clickable: a button of type "button", drawn as a badge, carrying its label
 * 2. clickable: a click fires badge-click with its type and label
 * 3. clickable: a click does not submit the form around it
 * 4. not clickable: a span, no button, nothing fired
 * 5. it becomes a button when it turns clickable
 */
import { describe, it, expect, beforeEach } from 'vitest';
import './ag-badge.js';

/**
 * Mount a badge and record the badge-click events it fires.
 * @param {Object} props - Properties set on the badge.
 * @param {HTMLElement} [parent] - Where it is mounted (the body by default).
 */
async function badge(props, parent = document.body) {
    const el = document.createElement('ag-badge');
    Object.assign(el, { type: 'success', label: 'Enabled', ...props });
    parent.appendChild(el);
    await el.updateComplete;
    const fired = [];
    el.addEventListener('badge-click', (e) => fired.push(e.detail));
    return { el, fired };
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('a clickable badge', () => {
    it('is a button of type "button", drawn as a badge, carrying its label', async () => {
        const { el } = await badge({ clickable: true });
        const button = el.querySelector('button');
        expect(button).not.toBeNull();
        expect(button.type).toBe('button');
        // plain-btn drops the browser's button look; without it the badge is grey.
        expect([...button.classList]).toEqual(expect.arrayContaining(['badge', 'success', 'clickable', 'plain-btn']));
        expect(button.textContent.trim()).toBe('Enabled');
    });

    it('fires badge-click with its type and label', async () => {
        const { el, fired } = await badge({ clickable: true });
        el.querySelector('button').click();
        expect(fired).toEqual([{ type: 'success', label: 'Enabled' }]);
    });

    it('does not submit the form around it', async () => {
        const form = document.createElement('form');
        let submitted = 0;
        form.addEventListener('submit', (e) => { e.preventDefault(); submitted++; });
        document.body.appendChild(form);
        const { el } = await badge({ clickable: true }, form);
        el.querySelector('button').click();
        expect(submitted).toBe(0);
    });
});

describe('a badge that is not clickable', () => {
    it('is plain text: no button, nothing fired', async () => {
        const { el, fired } = await badge({ clickable: false });
        expect(el.querySelector('button')).toBeNull();
        el.querySelector('span.badge').click();
        expect(fired).toEqual([]);
    });

    it('becomes a button when it turns clickable', async () => {
        const { el } = await badge({ clickable: false });
        el.clickable = true;
        await el.updateComplete;
        expect(el.querySelector('button.badge')).not.toBeNull();
        expect(el.querySelector('span.badge')).toBeNull();
    });
});
