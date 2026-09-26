/**
 * Unit tests for ag-event-detail-modal — its JSON colouring, now the one the manual's code
 * blocks use (core/code-highlight.js), and the escaping that makes unsafeHTML safe there.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import './ag-event-detail-modal.js';

describe('ag-event-detail-modal', () => {
    let el;

    beforeEach(() => {
        el = document.createElement('ag-event-detail-modal');
        document.body.appendChild(el);
    });

    afterEach(() => el.remove());

    it('colours a payload with the shared token classes', () => {
        const out = el._highlightJson({ name: 'mpd', pid: 42, ok: true, err: null });
        expect(out).toContain('<span class="hl-key">"name"</span>: <span class="hl-string">"mpd"</span>');
        expect(out).toContain('<span class="hl-num">42</span>');
        expect(out).toContain('<span class="hl-lit">true</span>');
        expect(out).toContain('<span class="hl-null">null</span>');
    });

    it('escapes what the payload carries, so no markup of its own reaches the page', () => {
        const out = el._highlightJson({ msg: '<img src=x onerror=alert(1)> & co' });
        expect(out).not.toContain('<img');
        expect(out).toContain('&lt;img src=x onerror=alert(1)&gt; &amp; co');
    });

    it('renders nothing for an empty payload', () => {
        expect(el._highlightJson(null)).toBe('');
    });
});
