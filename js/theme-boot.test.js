/**
 * Guards public/theme-boot.js, which applies the stored appearance before the
 * first paint.
 *
 * It runs before any module and can therefore import nothing: the theme list
 * and the browser-chrome colours are copied from js/core/config.js and
 * js/common.js. A copy that drifts is invisible — the page simply shows the
 * wrong appearance for a few hundred milliseconds, which nobody reports and no
 * rendering test catches, because by the time anything is asserted the bundle
 * has already corrected it. So the copies are compared here instead.
 *
 * The file also has to stay loadable under the pages' Content-Security-Policy,
 * which allows 'self' and no inline source, and has to stay synchronous: a
 * deferred or module script runs after the page is drawn, which is the whole
 * problem it exists to solve.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const BOOT = read('public', 'theme-boot.js');
const CONFIG = read('js', 'core', 'config.js');
const COMMON = read('js', 'common.js');

/** The pages that must run it before painting. */
const PAGES = ['index.html', 'login.html'];

describe('theme boot — reaches the page before the first paint', () => {
    for (const page of PAGES) {
        it(`${page} loads it synchronously, ahead of the stylesheet`, () => {
            const html = read(page).replace(/<!--[\s\S]*?-->/g, '');
            const tag = html.match(/<script[^>]*theme-boot\.js[^>]*>/);
            expect(tag, `${page} ne charge pas theme-boot.js`).not.toBeNull();
            // defer or type="module" would postpone it past the first paint.
            expect(tag[0], 'le script ne doit être ni defer ni module').not.toMatch(/defer|type="module"/);
            expect(html.indexOf(tag[0]))
                .toBeLessThan(html.indexOf('css/main.css'));
        });

        it(`${page} allows it under its own CSP`, () => {
            // Same-origin file precisely because no inline source is allowed.
            const scriptSrc = read(page).match(/script-src\s+([^;]+);/);
            expect(scriptSrc).not.toBeNull();
            expect(scriptSrc[1]).toContain("'self'");
            expect(scriptSrc[1], "un script en ligne resterait bloqué").not.toContain("'unsafe-inline'");
        });
    }

    it('is served at a stable path, not fingerprinted into assets/', () => {
        // Both pages reference it by a fixed URL, which only publicDir gives.
        expect(fs.existsSync(path.join(ROOT, 'public', 'theme-boot.js'))).toBe(true);
    });

    it('is precached, so a cold load offline still gets it', () => {
        expect(read('sw.js')).toContain("'/theme-boot.js'");
    });
});

describe('theme boot — its copies match their source', () => {
    it('knows the same themes as the registry', () => {
        const registry = [...CONFIG.matchAll(/\{\s*value:\s*'(\w+)'/g)].map(m => m[1]);
        const booted = BOOT.match(/var THEMES = \[([^\]]+)\]/)[1]
            .split(',').map(s => s.trim().replace(/'/g, ''));
        expect(booted.sort()).toEqual(registry.sort());
    });

    it('falls back to the same theme as common.js', () => {
        const fallback = COMMON.match(/validThemes\.includes\(normalizedTheme\)\s*\?\s*normalizedTheme\s*:\s*'(\w+)'/);
        expect(fallback, 'le repli de common.js est introuvable').not.toBeNull();
        expect(BOOT).toContain(`var DEFAULT_THEME = '${fallback[1]}'`);
    });

    it('reads the keys common.js and the config panel write', () => {
        expect(COMMON).toMatch(/MemoryCache\.get\('theme'/);
        expect(COMMON).toMatch(/MemoryCache\.get\('darkMode'/);
        expect(BOOT).toContain("stored('theme')");
        expect(BOOT).toContain("stored('darkMode')");
    });

    it('paints the browser chrome the colours updateThemeColorMeta would', () => {
        const block = COMMON.match(/const colors = \{([\s\S]*?)\};/)[1];
        const expected = {};
        for (const [, theme, dark, light] of block.matchAll(
            /'(\w+)':\s*isDark \? '(#[0-9A-Fa-f]{6})' : '(#[0-9A-Fa-f]{6})'/g,
        )) {
            expected[theme] = { light, dark };
        }
        expect(Object.keys(expected).length).toBeGreaterThan(0);

        const booted = {};
        for (const [, theme, light, dark] of BOOT.matchAll(
            /(\w+):\s*\{\s*light:\s*'(#[0-9A-Fa-f]{6})',\s*dark:\s*'(#[0-9A-Fa-f]{6})'\s*\}/g,
        )) {
            booted[theme] = { light, dark };
        }
        expect(booted).toEqual(expected);
    });

    it('stamps the root element, the only one that exists that early', () => {
        // <body> is not parsed yet; custom properties inherit from <html>, and
        // common.js mirrors both onto <body> once it runs.
        expect(BOOT).toMatch(/document\.documentElement/);
        expect(BOOT).toMatch(/setAttribute\('data-theme'/);
        expect(BOOT).toMatch(/classList\.toggle\('dark-mode'/);
        expect(BOOT).not.toMatch(/document\.body\b/);
    });

    it('recreates the theme-color meta rather than updating it', () => {
        // Safari ignores setAttribute on this tag in standalone mode — the one
        // place the browser chrome is visible, and the one index.html ships a
        // static tag for. updateThemeColorMeta() in common.js carries the same
        // note; both have to remove the node and append a new one.
        expect(COMMON).toMatch(/Safari requires a new node|Safari ignores setAttribute/);
        const removal = BOOT.search(/removeChild|\.remove\(\)/);
        const creation = BOOT.search(/createElement\('meta'\)/);
        expect(removal, "la balise existante n'est pas retirée").toBeGreaterThan(-1);
        expect(creation, "aucune balise n'est créée").toBeGreaterThan(-1);
        expect(removal, 'le retrait doit précéder la création').toBeLessThan(creation);
    });

    it('survives storage being unavailable', () => {
        // Safari in private mode throws on localStorage access; the defaults
        // have to stand rather than the script dying and taking the paint with it.
        expect(BOOT).toMatch(/try\s*\{[\s\S]*localStorage[\s\S]*catch/);
    });

    it('carries the whole Safari remedy, not just the node swap', () => {
        // The routine is no longer only a before-first-paint one: <ag-theme-toggle> calls
        // it again on every flip, through window.agApplyAppearance. In standalone mode
        // Safari caches theme-color at launch and recreating the node is NOT enough —
        // updateThemeColorMeta() calls the history signal "the only reliable workaround",
        // and paints the root background for the safe-area zones. Both were missing here
        // while this file only ever ran once, when neither mattered.
        expect(COMMON).toMatch(/history\.replaceState/);
        expect(BOOT, "aucun signal d'historique").toMatch(/history\.replaceState/);
        expect(COMMON).toMatch(/documentElement\.style\.backgroundColor/);
        expect(BOOT, 'le fond de la racine n’est pas peint').toMatch(/style\.backgroundColor/);
    });
});

describe('theme boot — reachable from the interface, and safe there', () => {
    /** Run the file the way a page does, in this document. */
    function boot() {
        new Function(BOOT)();
    }

    beforeEach(() => {
        localStorage.clear();
        delete window.agApplyAppearance;
        document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.remove());
        document.documentElement.classList.remove('dark-mode');
    });

    it('exposes the routine the appearance switch calls', () => {
        boot();
        expect(typeof window.agApplyAppearance).toBe('function');
    });

    it('paints the chrome of a theme it knows', () => {
        boot();
        window.agApplyAppearance('gravity', true);
        expect(document.querySelector('meta[name="theme-color"]').content).toBe('#12141C');
        expect(document.documentElement.classList.contains('dark-mode')).toBe(true);
    });

    it('falls back rather than throwing on a theme it does not know', () => {
        // Themes are extensible, and this is now fed whatever data-theme the document
        // carries. A throw here would land AFTER the palette and the stored preference
        // had changed — the switch left half applied, and its ag-change never fired.
        boot();
        expect(() => window.agApplyAppearance('a-theme-added-later', true)).not.toThrow();
        const painted = document.querySelector('meta[name="theme-color"]').content;
        const fallback = BOOT.match(/var DEFAULT_THEME = '(\w+)'/)[1];
        const expected = BOOT.match(
            new RegExp(`${fallback}:\\s*\\{\\s*light:\\s*'(#[0-9A-Fa-f]{6})',\\s*dark:\\s*'(#[0-9A-Fa-f]{6})'`),
        )[2];
        expect(painted).toBe(expected);
    });
});
