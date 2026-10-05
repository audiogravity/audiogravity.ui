/**
 * Guards the colours of the log (System tab, the logs window): text on the plain ground.
 *
 * An error or a warning row was tinted, and its level tag tinted again on top: the level
 * and the time fell under 4.5:1 in every theme, and halving the tint was not enough
 * (measured as drawn, 2026-10-05). Rows are marked by a stripe now, tags are words in
 * their colour, and DEBUG — written in a debug grey that was never a text colour, 1.5 to
 * 3.6:1, a token since retired — takes --text-secondary. Every text token clears the floor on the log's ground
 * (--bg-tertiary), which js/colors.test.js holds.
 */
import { describe, it, expect } from 'vitest';
import { readStylesheet, cssRuleBody } from './test-utils.js';

const LEVELS = ['info', 'warning', 'error', 'debug'];

describe('the log', () => {
    const badges = readStylesheet('css', 'components', 'badge.css');
    const system = readStylesheet('css', 'system.css');

    it('draws no tint under a level tag', () => {
        for (const level of LEVELS) {
            expect(cssRuleBody(badges, `.log-badge-${level}`), level).not.toMatch(/background/);
        }
    });

    it('writes each level in a text colour', () => {
        for (const level of LEVELS) {
            expect(cssRuleBody(badges, `.log-badge-${level}`), level)
                .toMatch(/(^|[;\s])color:\s*var\(--(color-(info|warning|error)-text|text-secondary)\)/);
        }
    });

    it('marks an error or a warning row with a stripe, not a tint', () => {
        for (const level of ['error', 'warning']) {
            const body = cssRuleBody(system, `.log-entry.log-level-${level}`);
            expect(body, level).not.toMatch(/background/);
            expect(body, level).toMatch(new RegExp(`box-shadow:\\s*inset 3px 0 0 var\\(--color-${level}\\)`));
        }
    });
});
