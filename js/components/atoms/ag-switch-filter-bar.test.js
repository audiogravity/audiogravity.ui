/**
 * Tests for two atoms the listening history reuses: ag-switch and ag-filter-bar.
 *
 * Pinned: a switch given a label names its checkbox to assistive technologies (it had no
 * text of its own), and one without stays as it was; a filter bar says which option is
 * chosen, not by its colour alone.
 */
import { describe, it, expect, afterEach } from 'vitest';

import './ag-switch.js';
import './ag-filter-bar.js';

async function mount(tag, props) {
    const el = document.createElement(tag);
    Object.assign(el, props);
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
}

afterEach(() => {
    document.body.innerHTML = '';
});

describe('ag-switch', () => {
    it('names its checkbox with its label', async () => {
        const el = await mount('ag-switch', { label: 'Keep a history of what plays' });
        expect(el.querySelector('input[type="checkbox"]').getAttribute('aria-label'))
            .toBe('Keep a history of what plays');
    });

    it('adds no name when it has no label', async () => {
        const el = await mount('ag-switch', {});
        expect(el.querySelector('input').hasAttribute('aria-label')).toBe(false);
    });
});

describe('ag-filter-bar', () => {
    it('says which option is chosen', async () => {
        const el = await mount('ag-filter-bar', {
            options: [{ label: '7 days', value: '7d' }, { label: '30 days', value: '30d' }],
            value: '30d',
        });
        const pressed = [...el.querySelectorAll('button')].map(b => b.getAttribute('aria-pressed'));
        expect(pressed).toEqual(['false', 'true']);
    });
});
