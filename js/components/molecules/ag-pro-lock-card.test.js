/**
 * Tests for ag-pro-lock-card — a Pro feature as a Starter box shows it.
 *
 * Rendered for real: what is pinned is that the card is a button a finger and a keyboard
 * reach, that it names the feature and carries the padlock, and that a tap goes to the
 * licence panel rather than to the feature itself.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

import './ag-pro-lock-card.js';

/** Mount a card and wait for its first render. */
async function mount(props) {
    const el = document.createElement('ag-pro-lock-card');
    Object.assign(el, props);
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
}

afterEach(() => {
    document.body.innerHTML = '';
});

describe('ag-pro-lock-card', () => {
    it('is a real button naming the feature, with the padlock', async () => {
        const el = await mount({ name: 'Qobuz', description: 'Hi-Res streaming', icon: './pics/qobuz.webp' });
        const button = el.querySelector('button');
        expect(button).not.toBeNull();
        expect(button.getAttribute('type')).toBe('button');
        expect(button.textContent).toContain('Qobuz');
        expect(button.textContent).toContain('Hi-Res streaming');
        expect(button.querySelector('ag-pro-lock')).not.toBeNull();
        expect(button.querySelector('img').getAttribute('src')).toBe('./pics/qobuz.webp');
    });

    it('holds phrasing content only, as a button must', async () => {
        // It held divs: invalid HTML, which validators and accessibility checks flag
        // (review, 2026-10-15).
        const el = await mount({ name: 'Qobuz', description: 'Hi-Res streaming' });
        expect(el.querySelector('button div')).toBeNull();
    });

    it('draws a mark it is handed, as the source cards draw it', async () => {
        // As SOURCE_ICONS hands Tidal's: a logo painted in the text colour, which follows
        // the theme — its black image vanished on a dark one (2026-10-15). Drawn here:
        // library-constants pulls api.js, which wants a session at import.
        const { html } = await import('lit');
        const mark = html`<span class="lib-src-logo-tidal" role="img" aria-label="Tidal"></span>`;
        const el = await mount({ name: 'Tidal', description: 'Hi-Res streaming', icon: mark });
        expect(el.querySelector('.lib-src-ic .lib-src-logo-tidal')).not.toBeNull();
        expect(el.querySelector('img')).toBeNull();
    });

    it('shows the initials of a feature without a logo', async () => {
        const el = await mount({ name: 'UPnP media servers', description: '' });
        expect(el.querySelector('img')).toBeNull();
        expect(el.querySelector('.lib-src-ic').textContent.trim()).toBe('UP');
    });

    it('leads to the licence panel on a tap', async () => {
        const tabs = document.createElement('ag-tabs');
        tabs.selectTab = vi.fn();
        const el = await mount({ name: 'HQPlayer', description: '' });
        document.body.appendChild(tabs);
        el.querySelector('button').click();
        expect(tabs.selectTab).toHaveBeenCalledWith('admin', { keepOpen: false });
    });
});
