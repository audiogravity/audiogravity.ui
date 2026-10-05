/**
 * Guards the fade of a tile whose software is missing: its inert part only.
 *
 * A whole tile faded to 0.45 took every word under the 4.5:1 floor, the badge that says
 * why the tile is grey — NOT INSTALLED, UNAVAILABLE — among them. The config tile was
 * mended first; the service, profile and systemd tiles now fade the same way: their
 * header (name, state) and their footer (the badge, and buttons already shown disabled
 * by their own style) stay out of it — all but a profile footer's list of critical
 * services, as inert as the body it fades with.
 */
import { describe, it, expect } from 'vitest';
import { readStylesheet, selectorList } from './test-utils.js';

/** The rules of tile.css as [selectors, body] pairs, comments removed. */
function rules() {
    const css = readStylesheet('css', 'components', 'tile.css').replace(/\/\*[\s\S]*?\*\//g, '');
    return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .map(([, sel, body]) => [selectorList(sel), body]);
}

const TILES = [
    ['.service-tile', '.service-header', '.service-footer'],
    ['.profile-tile', '.profile-header', '.profile-footer'],
    ['.systemd-tile', '.systemd-header', '.systemd-actions'],
];

describe('a tile of missing software', () => {
    it('is never faded whole, not even under the pointer', () => {
        const whole = [];
        for (const [selectors, body] of rules()) {
            for (const sel of selectors) {
                if (/\.(service|profile|systemd)-tile\.unavailable(:hover)?$/.test(sel) && /\bopacity\s*:/.test(body)) {
                    whole.push(sel);
                }
            }
        }
        expect(whole).toEqual([]);
    });

    it('fades everything but its header and its footer', () => {
        for (const [tile, header, footer] of TILES) {
            const fade = `${tile}.unavailable > :not(${header}, ${footer})`;
            const rule = rules().find(([selectors]) => selectors.includes(fade));
            expect(rule, fade).toBeDefined();
            expect(rule[1]).toMatch(/\bopacity\s*:/);
        }
    });

    it("fades a profile footer's list of critical services with its body", () => {
        // Read-only, like the body: left out of the fade with the rest of the footer, it
        // stood at full contrast inside a tile otherwise greyed (review, 2026-10-05).
        const fade = '.profile-tile.unavailable > .profile-footer > .profile-critical-services';
        const rule = rules().find(([selectors]) => selectors.includes(fade));
        expect(rule, fade).toBeDefined();
        expect(rule[1]).toMatch(/\bopacity\s*:/);
    });
});
