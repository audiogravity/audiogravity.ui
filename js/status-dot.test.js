/**
 * The green "up / online / active" dot is a flat disc: no glow.
 *
 * It used to carry a coloured box-shadow in five places — the shared status dot
 * (service and profile cards, the top bar's "Connected"), the System tab's stream
 * dot, the queue's "now playing" label, the library's source list and the
 * pipeline's node panel — at four different sizes. The slow blink animated the
 * glow as well, so a glow removed from the rule alone came back on every frame of
 * the animation: the keyframes are checked here too.
 *
 * The orange "pending" dot (a service starting or stopping) had the same glow and
 * lost it too: no status dot glows, whatever its colour.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Body of the first rule whose selector list has `selector` as one of its items. */
function ruleBody(css, selector) {
    for (const [, sel, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (sel.split(',').map(s => s.trim()).includes(selector)) return body;
    }
    return null;
}

describe('no status dot glows', () => {
    const DOTS = [
        ['css/components/status-indicator.css', '.service-state-dot.up'],
        ['css/components/status-indicator.css', '.profile-status-dot.up'],
        ['css/components/status-indicator.css', '.profile-status.active'],
        ['css/system.css', '.connection-dot-large.connected'],
        ['css/components/library-queue.css', '.lib-queue-lbl::before'],
        ['css/components/library-sources.css', '.lib-src-status.up .lib-src-dot'],
    ];

    for (const [file, selector] of DOTS) {
        it(`${selector} is green and flat`, () => {
            const body = ruleBody(read(file), selector);
            expect(body, `no rule for ${selector} in ${file}`).toBeTruthy();
            expect(body).toMatch(/background:\s*var\(--color-success\)/);
            expect(body, `${selector} glows again`).not.toMatch(/box-shadow/);
        });
    }

    it('has no glow when orange either', () => {
        const css = read('css', 'components', 'status-indicator.css');
        for (const selector of ['.service-state-dot.pending', '.profile-status-dot.pending']) {
            const body = ruleBody(css, selector);
            expect(body, `no rule for ${selector}`).toBeTruthy();
            expect(body).toMatch(/background:\s*var\(--color-warning\)/);
            expect(body, `${selector} glows again`).not.toMatch(/box-shadow/);
        }
    });

    it('is red, steady and flat when failed', () => {
        // Added 2026-09-25 for the profile tile reading FAILED; the profile detail
        // already gave a failed service this class, which had no rule and showed nothing.
        const css = read('css', 'components', 'status-indicator.css');
        for (const selector of ['.service-state-dot.error', '.profile-status-dot.error']) {
            const body = ruleBody(css, selector);
            expect(body, `no rule for ${selector}`).toBeTruthy();
            expect(body).toMatch(/background:\s*var\(--color-error\)/);
            expect(body, `${selector} glows`).not.toMatch(/box-shadow/);
            expect(body, `${selector} blinks`).not.toMatch(/animation/);
        }
        for (const selector of ['.service-state-text.error', '.profile-status-text.error']) {
            expect(ruleBody(css, selector)).toMatch(/color:\s*var\(--color-error-text\)/);
        }
    });

    it('blinks by opacity alone', () => {
        const css = read('css', 'components', 'status-indicator.css');
        const frames = css.match(/@keyframes blinkSlow\s*\{([\s\S]*?\n)\}/);
        expect(frames, 'no blinkSlow keyframes').not.toBeNull();
        expect(frames[1]).toMatch(/opacity/);
        expect(frames[1], 'the blink animates a glow again').not.toMatch(/box-shadow/);
    });

    it('is flat in the pipeline node panel too', () => {
        const js = fs.readFileSync(path.join(ROOT, 'js', 'components', 'organisms', 'ag-audio-pipeline.js'), 'utf8');
        const dot = js.match(/<div class="ndp-dot"[^>]*>/);
        expect(dot).not.toBeNull();
        expect(dot[0]).not.toMatch(/box-shadow/);
    });
});
