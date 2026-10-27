/**
 * Guard: the Stats view's ordered steps — its sound-quality classes and its week's hours —
 * read one role per class.
 *
 * Their default is the step of the text's colour each class drew, solid: Slate and Gravity
 * draw the view as before, pixel for pixel in both modes (Chromium, density 2, 2026-10-27).
 * Minimal points them at the latency histogram's four classes, its look included — the
 * colour at 70 % inside, itself as a 1px inset edge (user's choice from a capture of the
 * histogram, 2026-10-27). An edge of the fill's own colour was no default: it still
 * thickened Slate and Gravity's rounded corners, 2,124 to 6,203 pixels changed; the
 * default edge is 0px wide.
 *
 * Covers:
 * 1. each class fills with its role at --stats-step-fill and edges with it at --stats-step-edge
 * 2. the defaults are the text's colour in four mixes, solid and without an edge — the best
 *    class and the busiest hour the strongest, as before
 * 3. Minimal maps DSD, Hi-Res, CD and MP3/AAC, and the hours from the quietest to the
 *    busiest, to the histogram's Excellent, Good, Average and Critical, at 70 % with a
 *    full edge, each stated once for both modes
 * 4. no other stylesheet sets one — a theme to come, a component, a dark block — and the
 *    defaults state each once (code review, 2026-10-27: two themes named, the rest unread)
 */
import { describe, it, expect } from 'vitest';
import { readStylesheet, cssRules, filesUnder } from './test-utils.js';

/** [class, its role, the step it drew before — the default, Minimal's histogram class] */
const STEPS = [
    ['.lib-stats-q--dsd', '--stats-q-dsd', 'var(--text-primary)', '--latency-bar-excellent'],
    ['.lib-stats-q--hires', '--stats-q-hires', 'color-mix(in srgb, var(--text-primary) 75%, var(--bg-primary))', '--latency-bar-good'],
    ['.lib-stats-q--cd', '--stats-q-cd', 'color-mix(in srgb, var(--text-primary) 56%, var(--bg-primary))', '--histogram-average'],
    ['.lib-stats-q--lossy', '--stats-q-lossy', 'color-mix(in srgb, var(--text-primary) 40%, var(--bg-primary))', '--histogram-critical'],
    ['.lib-stats-heat--1', '--stats-heat-1', 'color-mix(in srgb, var(--text-primary) 40%, var(--bg-primary))', '--latency-bar-excellent'],
    ['.lib-stats-heat--2', '--stats-heat-2', 'color-mix(in srgb, var(--text-primary) 56%, var(--bg-primary))', '--latency-bar-good'],
    ['.lib-stats-heat--3', '--stats-heat-3', 'color-mix(in srgb, var(--text-primary) 75%, var(--bg-primary))', '--histogram-average'],
    ['.lib-stats-heat--4', '--stats-heat-4', 'var(--text-primary)', '--histogram-critical'],
];

/** A pattern matching `text` as written, spaces and all. */
const literally = (text) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

/** Every role, and the fill and edge beside them. */
const ROLES = [...STEPS.map(([, role]) => role), '--stats-step-fill', '--stats-step-edge'];

/** The declarations of a stylesheet's rule whose selector list is exactly `selectors`. */
const ruleOf = (file, selectors) => cssRules(readStylesheet(...file))
    .find((rule) => rule.selectors.join() === selectors)?.body;

describe("the Stats view's ordered steps", () => {
    it.each(STEPS)('— %s — fills with its role and edges with it', (selector, role) => {
        const body = ruleOf(['css', 'components', 'library-stats.css'], selector);
        expect(body, `no rule for ${selector} alone`).toBeTruthy();
        expect(body).toMatch(literally(`background: color-mix(in srgb, var(${role}) var(--stats-step-fill), transparent);`));
        expect(body).toMatch(literally(`box-shadow: inset 0 0 0 var(--stats-step-edge) var(${role});`));
    });

    it('defaults to the steps of the text colour they drew, solid and without an edge', () => {
        const defaults = ruleOf(['css', 'themes.css'], ':root,body');
        for (const [, role, before] of STEPS) {
            expect(defaults, role).toMatch(literally(`${role}: ${before};`));
        }
        expect(defaults).toMatch(literally('--stats-step-fill: 100%;'));
        expect(defaults).toMatch(literally('--stats-step-edge: 0px;'));
    });

    it("draws them in Minimal as the latency histogram's four classes, each stated once", () => {
        const theme = readStylesheet('css', 'themes', 'minimal.css');
        const light = ruleOf(['css', 'themes', 'minimal.css'], '[data-theme="minimal"]');
        for (const [, role, , histogram] of STEPS) {
            expect(light, role).toMatch(literally(`${role}: var(${histogram});`));
        }
        expect(light).toMatch(literally('--stats-step-fill: 70%;'));
        expect(light).toMatch(literally('--stats-step-edge: 1px;'));
        for (const role of ROLES) {
            expect(theme.match(new RegExp(`${role}:`, 'g')), `${role} stated more than once`).toHaveLength(1);
        }
    });

    it('is set nowhere else, and its defaults are stated once', () => {
        const setters = filesUnder('css', /\.css$/)
            .filter((file) => /--stats-[\w-]+\s*:/.test(readStylesheet(file)));
        expect(setters.sort()).toEqual(['css/themes.css', 'css/themes/minimal.css']);
        const defaults = readStylesheet('css', 'themes.css');
        for (const role of ROLES) {
            expect(defaults.match(new RegExp(`${role}:`, 'g')), `${role} stated more than once`).toHaveLength(1);
        }
    });
});
