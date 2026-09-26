/**
 * Tests for escapeHtml — moved out of common.js so a module can use it without running the
 * page's authentication guard; these pin the behaviour it had there.
 */
import { describe, it, expect } from 'vitest';
import { escapeHtml } from './escape-html.js';

describe('escapeHtml', () => {
    it('escapes the three characters that open markup or an entity', () => {
        expect(escapeHtml('a & b <i>x</i>')).toBe('a &amp; b &lt;i&gt;x&lt;/i&gt;');
    });

    it('writes a no-break space as an entity, as a serialised text node does', () => {
        expect(escapeHtml('a\u00a0b')).toBe('a&nbsp;b');
    });

    it('leaves quotes alone — fit for an element body, not for an attribute', () => {
        expect(escapeHtml(`"a" 'b'`)).toBe(`"a" 'b'`);
    });

    it('returns a non-string unchanged', () => {
        expect(escapeHtml(undefined)).toBeUndefined();
        expect(escapeHtml(42)).toBe(42);
    });

    it('gives what the browser gives when it serialises a text node', () => {
        // The function used to make that round trip itself; it must not drift from it.
        const sample = 'a & b < c > d \u00a0 "e" \'f\' é — <script>&amp;</script>';
        const div = document.createElement('div');
        div.textContent = sample;
        expect(escapeHtml(sample)).toBe(div.innerHTML);
    });
});
