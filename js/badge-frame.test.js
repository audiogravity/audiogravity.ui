/**
 * Guards the rule "a frame says the badge can be pressed" (user rule, 2026-10-05).
 *
 * A badge that is not a button is a tag: a tint, no frame. Outlined, CRITICAL read as a
 * second button beside EDIT CONFIG, FAILED as a third beside START, and the same state
 * looked one way in a row of buttons and another in a card's header. The rule is written
 * in badge.css for .badge; nine families with boxes of their own restate it, and the
 * sweep below holds every one of them to it. This file also holds that every badge you
 * can press is marked as such — a <button>, or .clickable — so that it keeps its frame.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    appSources, cssRuleBody, filesUnder, mediaBlock, openingTags, readStylesheet, selectorList,
} from './test-utils.js';

/** What badge.css calls a tag: a badge that is not a button, not clickable, not filled. */
const TAG = '.badge:not(button, .clickable, .filled)';

/**
 * A family of tags drawn by rules of its own, outside .badge, is named so: a class ending
 * in -badge, -pill, -tag or -chip (ag-connector-badge is an element). Read on the last
 * compound of a selector, the element the rule draws.
 */
const FAMILY = /(?:^|[.\s])[\w-]*-(?:badge|pill|tag|chip)(?![\w-])/;

/**
 * The families that draw a frame because they ARE pressed — each read back from the
 * templates below, so that one that stops being pressable cannot keep its frame here.
 */
const PRESSABLE = ['lib-pill', 'lib-src-badge', 'amp-output-pill'];

/**
 * The element a selector draws: its last compound, with what its functional pseudo-classes
 * name set aside — `:not(.x-badge)` says what the element is not.
 * @param {string} selector
 * @returns {string}
 */
function lastCompound(selector) {
    return selector.replace(/:(?:not|is|where|has)\([^)]*\)/g, '').split(/\s+|>|~|\+/).filter(Boolean).at(-1) ?? '';
}

/**
 * Every rule written for the app — its stylesheets, and the styles its components carry
 * in their templates — comments out.
 * @returns {{file: string, selectors: string[], body: string}[]}
 */
function appRules() {
    if (appRules.cache) return appRules.cache;
    const rules = [];
    for (const file of [...filesUnder('css', /\.css$/), ...appSources().filter((f) => f.endsWith('.js'))]) {
        const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        for (const [, list, body] of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
            rules.push({ file, selectors: selectorList(list), body });
        }
    }
    appRules.cache = rules;
    return rules;
}

/**
 * The border declarations of a rule that draw a line: a colour other than transparent.
 * @param {string} body
 * @returns {string[]}
 */
function visibleBorders(body) {
    return [...body.matchAll(/(?:^|;)\s*(border(?:-(?:top|right|bottom|left))?(?:-color)?)\s*:\s*([^;]+)/g)]
        .filter(([, , value]) => !/transparent/.test(value) && !/^\s*(none|0)\b/.test(value))
        .map(([, prop, value]) => `${prop}: ${value.trim()}`);
}

/** The steps of an animation, '' when it is not declared. */
const keyframes = (css, name) => mediaBlock(css, new RegExp(`@keyframes\\s+${name}\\s*\\{`));

describe('a badge that is not a button', () => {
    const css = readStylesheet('css', 'components', 'badge.css');

    it('has no frame', () => {
        // Transparent rather than none: the badge keeps its height, and its row stays put.
        expect(cssRuleBody(css, TAG)).toMatch(/border-color:\s*transparent/);
    });

    it('takes the tint of its variant, the neutral one without', () => {
        // Translucent, so that it shows on --bg-tertiary too: an opaque --bg-tertiary left
        // no box on the cards of the guided configuration, drawn in that grey.
        expect(cssRuleBody(css, TAG)).toMatch(/background:\s*var\(--color-neutral-bg\)/);
        for (const [variants, token] of [
            [':is(.success, .success-pulse)', '--color-success-bg'],
            [':is(.error, .error-pulse)', '--color-error-bg'],
            [':is(.warning, .critical)', '--color-warning-bg'],
            ['.info', '--color-info-bg'],
        ]) {
            expect(cssRuleBody(css, TAG + variants), variants)
                .toMatch(new RegExp(`background:\\s*var\\(${token}\\)`));
        }
    });
});

describe('a badge you can press', () => {
    it('is a <button> or carries .clickable, so it keeps its frame', () => {
        // Read from the templates: a badge that answers a tap but is marked as neither
        // would be drawn as a tag, and pass for information. The class is read as a word:
        // `name-clickable` is not .clickable.
        const offenders = [];
        for (const file of appSources()) {
            const text = readFileSync(file, 'utf8');
            for (const tag of openingTags(text)) {
                const cls = tag.match(/\bclass="([^"]*)"/)?.[1] ?? '';
                if (!/(^|\s)badge(\s|$)/.test(cls) || !/@click=/.test(tag)) continue;
                if (/^<button\b/.test(tag) || /(?<![\w-])clickable(?![\w-])/.test(cls)) continue;
                offenders.push(`${file}: ${tag.replace(/\s+/g, ' ').slice(0, 100)}`);
            }
        }
        expect(offenders).toEqual([]);
    });
});

describe('a tag of any family', () => {
    const family = (selector) => lastCompound(selector).match(/[\w-]*-(?:badge|pill|tag|chip)(?![\w-])/)?.[0]
        .replace(/^.*?([\w-]+)$/, '$1');

    it('draws no frame, whatever rule draws it', () => {
        // RT and non-RT in the latency monitor, ACTIVE and READY on an output card, the
        // iperf state beside START, the transport pill of the Pipeline list…: nine
        // families drew their own frame, each beside buttons that drew one too.
        const offenders = [];
        for (const { file, selectors, body } of appRules()) {
            for (const selector of selectors) {
                if (!FAMILY.test(lastCompound(selector))) continue;
                // What a :not() excludes does not make the rule a button's.
                const drawn = selector.replace(/:not\([^)]*\)/g, '');
                if (/\bbutton\b|\.clickable|:hover|:active|:focus/.test(drawn)) continue;
                if (PRESSABLE.includes(family(selector))) continue;
                for (const line of visibleBorders(body)) offenders.push(`${file} — ${selector} → ${line}`);
            }
        }
        expect(offenders).toEqual([]);
    });

    it('keeps a box of its own where its frame used to draw one', () => {
        // Without their frames, two tags lost their box on the ground under them: the
        // iperf state at rest, on --chart-bg (3 to 5 %), beside START; a station's codec on
        // its card, an opaque --bg-tertiary that matched the card in Slate light (1.04:1).
        // Both take the translucent neutral tint, and the grey that reads on it.
        const perf = cssRuleBody(readStylesheet('css', 'performance.css'), '.service-status-badge.unknown');
        const radio = cssRuleBody(readStylesheet('css', 'components', 'library-radio.css'), '.lib-radio-card ag-connector-badge');
        for (const body of [perf, radio]) {
            expect(body).toMatch(/background:\s*var\(--color-neutral-bg\)/);
            expect(body).toMatch(/(^|[\s;])color:\s*var\(--text-secondary\)/);
        }
    });

    it('keeps one only when it is pressed — read in the templates', () => {
        for (const name of PRESSABLE) {
            const tags = appSources().flatMap((file) => openingTags(readFileSync(file, 'utf8'))
                .filter((tag) => new RegExp(`\\bclass="[^"]*\\b${name}\\b`).test(tag)));
            expect(tags.length, `${name}: no template`).toBeGreaterThan(0);
            for (const tag of tags) {
                expect(/^<button\b/.test(tag) || /@click=/.test(tag), `${name}: ${tag.slice(0, 80)}`).toBe(true);
            }
        }
    });
});

describe('a badge in a tab title', () => {
    it('takes the look of its kind: the title gives it a shape, no colour', () => {
        // The title painted every badge in the info colour: LIVE beside NEW USER, two of
        // a kind; and --bg-primary on it read 3.5:1 in Slate light, 2.5:1 in Gravity light.
        const body = cssRuleBody(readStylesheet('css', 'components', 'tab-zone.css'), '.tab-zone .tab-title-container .badge');
        expect(body).not.toMatch(/(^|[\s;])(background|border-color|color)\s*:/);
        expect(body).toMatch(/text-transform:\s*uppercase/);
    });
});

describe('the restart badge', () => {
    it('keeps the frame of its variant: it is a button', () => {
        const body = cssRuleBody(readStylesheet('css', 'audio-software.css'), '.restart-badge');
        expect(body).not.toMatch(/(^|[\s;])border\s*:/);
    });
});

describe('a pulse', () => {
    const css = readStylesheet('css', 'components', 'badge.css');

    it("fades no word of a badge: a tag's tint breathes, or a button's frame", () => {
        const tint = keyframes(css, 'badgeTintPulse');
        const frame = keyframes(css, 'badgeFramePulse');
        expect(tint).toMatch(/background-color:\s*transparent/);
        expect(frame).toMatch(/border-color:\s*transparent/);
        for (const body of [tint, frame]) expect(body).not.toMatch(/opacity/);
        // .animate-pulse brings `pulse`, which fades the whole element: on a badge it
        // takes the frame's beat, on a tag the tint's.
        expect(cssRuleBody(css, '.badge.animate-pulse')).toMatch(/animation-name:\s*badgeFramePulse/);
        expect(cssRuleBody(css, `${TAG}:is(.animate-pulse, .critical, .success-pulse, .error-pulse)`))
            .toMatch(/animation-name:\s*badgeTintPulse/);
    });

    it('stops on a filled badge, whose frame is the colour of its fill', () => {
        // Nothing around words sitting on a fill can breathe without taking them along;
        // a beat of its frame would only repaint, unseen.
        expect(cssRuleBody(css, '.badge.filled:is(.animate-pulse, .critical, .success-pulse, .error-pulse)'))
            .toMatch(/animation:\s*none/);
    });

    it('moves no opacity on a badge or a tag, in any family', () => {
        // At the bottom of the old beat, a pulsing badge's words read 2.1 to 4.1:1, under
        // the floor for every colour in every theme mode but one; the THROTTLED and
        // loading tags blinked the same way.
        const fading = new Set();
        const files = [...new Set(appRules().map((r) => r.file))];
        for (const file of files) {
            const text = readFileSync(file, 'utf8');
            for (const [, name] of text.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
                if (/opacity/.test(keyframes(text, name))) fading.add(name);
            }
        }
        expect(fading.has('pulse'), 'the sweep no longer sees a keyframe on opacity').toBe(true);
        const offenders = [];
        for (const { file, selectors, body } of appRules()) {
            if (!selectors.some((s) => FAMILY.test(lastCompound(s)) || /\.badge\b/.test(lastCompound(s)))) continue;
            for (const [, value] of body.matchAll(/animation(?:-name)?\s*:\s*([^;]+)/g)) {
                for (const word of value.split(/[\s,]+/)) {
                    if (fading.has(word)) offenders.push(`${file} — ${selectors.join(', ')} → ${word}`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });
});
