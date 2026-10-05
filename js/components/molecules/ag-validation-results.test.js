/**
 * Unit tests for ag-validation-results — the counts in its headers.
 *
 * The number of errors and the number of warnings sat in badges whose classes,
 * `badge-error` and `badge-warning`, no stylesheet defines: once tags became tints they
 * were drawn in the neutral grey, with nothing to mark them as errors or warnings (review,
 * 2026-10-05). They carry the real variants.
 *
 * Covers:
 * 1. the error count is an error tag, the warning count a warning tag, each with its number
 * 2. the count sits on the card's ground, not on a second tint over its header's
 */
import { describe, it, expect, afterEach } from 'vitest';
import { cssRuleBody, readStylesheet } from '../../test-utils.js';
import './ag-validation-results.js';

/**
 * Mount the results of a validation.
 * @param {Object} result - What the API answers for a validation.
 * @returns {Promise<HTMLElement>}
 */
async function mount(result) {
    const el = document.createElement('ag-validation-results');
    el.result = result;
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('the counts of ag-validation-results', () => {
    it('are an error tag and a warning tag', async () => {
        const el = await mount({ valid: false, errors: ['one', 'two'], warnings: ['three'] });
        const errors = el.querySelector('.validation-header.error .badge');
        const warnings = el.querySelector('.validation-header.warning .badge');
        expect([...errors.classList]).toEqual(['badge', 'error']);
        expect(errors.textContent.trim()).toBe('2');
        expect([...warnings.classList]).toEqual(['badge', 'warning']);
        expect(warnings.textContent.trim()).toBe('1');
    });

    it("sit on the card's ground, not on a second tint over their header's", () => {
        // The header is already a tint; the tag's own on top took the number under 4.5:1
        // in six cases out of twelve, down to 3.9:1 (computed from the tokens).
        const css = readStylesheet('css', 'validation.css');
        expect(css).toMatch(/\.validation-header\.error \.badge\.error,\s*\.validation-header\.warning \.badge\.warning\s*\{/);
        expect(cssRuleBody(css, '.validation-header.warning .badge.warning')).toMatch(/background:\s*var\(--bg-secondary\)/);
    });
});
