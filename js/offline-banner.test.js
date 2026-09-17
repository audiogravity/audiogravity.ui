/**
 * The offline banner is fixed, so whatever starts under the topbar has to reserve its
 * height — on every screen width.
 *
 * It did not. The one compensation that existed sat inside `@media (width > 768px)`,
 * which is the width where the banner is least in the way; on a phone it cut the first
 * section title in half. Seen on an installed app in airplane mode, not deduced.
 *
 * Both cases below read the stylesheets rather than a rendered page: the defect is a
 * rule in the wrong block, which is visible in the source and invisible to a unit test
 * that mounts a component at one width.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CSS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'css');
const LAYOUT = fs.readFileSync(path.join(CSS_DIR, 'layout.css'), 'utf8');
const THEMES = fs.readFileSync(path.join(CSS_DIR, 'themes.css'), 'utf8');

/** Every css file, so a rule moved to another sheet is still covered. */
function allCss() {
    const out = [];
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith('.css')) out.push([full, fs.readFileSync(full, 'utf8')]);
        }
    };
    walk(CSS_DIR);
    return out;
}

describe('the banner reserves its height wherever content starts under the topbar', () => {
    it('declares that height once, as a dimension', () => {
        expect(THEMES, '--offline-banner-height n\'est pas déclaré dans themes.css')
            .toMatch(/--offline-banner-height:\s*\d+px/);
    });

    it('never writes that number out again', () => {
        // The height, the parked position and the desktop compensation each carried a
        // literal 32 or 40. Three copies of one measurement is how they drift apart.
        const height = Number(THEMES.match(/--offline-banner-height:\s*(\d+)px/)[1]);
        const bannerRules = LAYOUT.match(/[^}]*offline-banner[^{]*\{[^}]*\}/g) ?? [];
        for (const rule of bannerRules) {
            expect(rule, `un littéral ${height}px subsiste dans une règle du bandeau`)
                .not.toMatch(new RegExp(`(^|[^\\w-])${height}px`));
        }
    });

    it('sets the offset outside every desktop-only query', () => {
        // The whole defect in one assertion: the switch must be reachable at any width.
        // Cutting the file at the first `width >` / `min-width` block leaves what a phone
        // actually applies, and the declaration has to still be in there.
        const beforeDesktop = LAYOUT.split(/@media\s*\([^)]*(?:width\s*>|min-width)[^)]*\)/)[0];
        expect(beforeDesktop,
            '--offline-banner-offset n\'est posé que dans une requête desktop')
            .toMatch(/body\.is-offline\s*\{[^}]*--offline-banner-offset/);
    });

    it('is reserved exactly where the banner lands on the content', () => {
        // A padding-top that accounts for the fixed topbar is the top of a scrolling
        // surface, and the banner sits directly below that topbar — so such a rule owes
        // the banner its height. With ONE exception, which is the other half of this
        // case: a rule that also reserves --tabs-height has a horizontal tab bar there,
        // and on mobile that bar is moved to the banner's own top and painted over by it
        // (z-index 999 against 100). The banner then costs nothing extra, and adding the
        // offset would reserve a second banner's worth of empty space.
        //
        // So: the offset belongs in a topbar rule if and only if it reserves no tab bar.
        const offenders = [];
        for (const [file, css] of allCss()) {
            for (const [decl] of css.matchAll(/padding-top:\s*calc\([^;]*\);/g)) {
                if (!decl.includes('--topbar-height')) continue;
                const reservesTabs = decl.includes('--tabs-height');
                const reservesBanner = decl.includes('--offline-banner-offset');
                if (reservesTabs === reservesBanner) {
                    offenders.push(`${path.basename(file)} — ${reservesBanner
                        ? 'compte le bandeau ET la barre d\'onglets qu\'il recouvre'
                        : 'ne réserve rien pour le bandeau'}: ${decl.trim()}`);
                }
            }
        }
        expect(offenders, `\n  ${offenders.join('\n  ')}`).toEqual([]);
    });

    it('collapses to zero when the banner is parked off-screen', () => {
        // Without a declared default the four calc() above would resolve to an invalid
        // expression while online, and the padding would silently fall back to 0 —
        // putting the content under the TOPBAR, which is worse than the bug being fixed.
        expect(LAYOUT, 'aucune valeur par défaut pour --offline-banner-offset')
            .toMatch(/:root\s*\{[^}]*--offline-banner-offset:\s*0px/);
    });
});
