/**
 * Every static file the shell promises is a file the box actually ships.
 *
 * Three different places name assets by path — the service worker's app-shell list, the
 * notification options in the same file, and the web manifest — and all three had entries
 * pointing at nothing:
 *
 *   - five of eleven same-origin app-shell entries, three of them icons under names the
 *     repository has never carried (`apple-touch-icon.png` for `apple-touch-180.png`,
 *     `favicon-32x32.png` for `favicon-32.png`, `favicon-16x16.png` for `favicon-16.png`)
 *     and two logos that exist nowhere;
 *   - a push notification asking for `android-chrome-192x192.png` and
 *     `favicon-32x32.png`, so every notification fell back to the browser's own glyph;
 *   - a manifest icon entry for an SVG, at `"sizes": "any"` — the entry a browser prefers
 *     for a scalable surface — which the interface no longer ships at all.
 *
 * None of it failed loudly. `cache.add` catches its own rejection, a notification icon
 * that 404s is simply not drawn, and a manifest icon that 404s falls through to the next
 * one. That is precisely why they have to be asserted: the only symptom is an absence.
 *
 * Same-origin paths only. The CDN entries in the app-shell list are the other half of its
 * job, and reaching for them would put a network call in the unit suite.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SW = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'site.webmanifest'), 'utf8'));

/**
 * Whether a URL the page would request resolves to a file in the repository. publicDir is
 * copied verbatim into the build, and the HTML entry points sit at the root.
 * @param {string} url Same-origin path, leading slash optional.
 * @returns {boolean}
 */
function ships(url) {
    if (url === '/') return fs.existsSync(path.join(ROOT, 'index.html'));
    const rel = url.replace(/^\//, '');
    return [path.join('public', rel), rel].some(c => fs.existsSync(path.join(ROOT, c)));
}

/** The same-origin entries of the service worker's app-shell list, in order. */
function shellUrls() {
    const block = SW.match(/const CACHE_URLS = \[([\s\S]*?)\];/);
    return block
        ? [...block[1].matchAll(/'([^']+)'/g)].map(m => m[1]).filter(u => !u.startsWith('http'))
        : null;
}

/** Every manifest entry that names an image, wherever it sits. */
function manifestIcons() {
    const out = [];
    const collect = (list, where) => (list ?? []).forEach(i => out.push({ src: i.src, where }));
    collect(MANIFEST.icons, 'icons');
    collect(MANIFEST.screenshots, 'screenshots');
    for (const s of MANIFEST.shortcuts ?? []) collect(s.icons, `shortcut "${s.name}"`);
    return out;
}

describe('the app shell lists files the box actually serves', () => {
    it('finds the list', () => {
        expect(shellUrls(), 'CACHE_URLS est introuvable').not.toBeNull();
        expect(shellUrls().length).toBeGreaterThan(4);
    });

    it('ships every same-origin entry it promises to precache', () => {
        const missing = shellUrls().filter(url => !ships(url));
        expect(missing, `précachés mais absents du dépôt :\n  ${missing.join('\n  ')}`).toEqual([]);
    });

    it('ships every image the service worker names elsewhere', () => {
        // The notification icon and badge are not in the list, so the case above cannot
        // see them — and they carried the same wrong names for as long.
        const refs = [...new Set([...SW.matchAll(/'(\/pics\/[^']+)'/g)].map(m => m[1]))];
        expect(refs.length, "aucune image nommée dans sw.js").toBeGreaterThan(0);
        const missing = refs.filter(url => !ships(url));
        expect(missing, `nommées par sw.js, absentes du dépôt :\n  ${missing.join('\n  ')}`).toEqual([]);
    });
});

describe('the marks the library shows exist too', () => {
    // SOURCE_MARKS names a .webp per brand per theme. They are binaries: they arrive as
    // untracked files, and `git commit -a` does not pick them up — the interface would
    // then ship a header naming four brands and showing none. The alt text saves the
    // reader, not the release.
    const MARKS = fs.readFileSync(
        path.join(ROOT, 'js', 'components', 'library-constants.js'), 'utf8');

    it('finds the marks', () => {
        expect([...MARKS.matchAll(/\.\/pics\/([\w-]+\.webp)/g)].length).toBeGreaterThan(4);
    });

    it('ships every file they name, in both variants', () => {
        const named = [...new Set([...MARKS.matchAll(/\.\/pics\/([\w-]+\.webp)/g)].map(m => m[1]))];
        const missing = named.filter(f => !fs.existsSync(path.join(ROOT, 'public', 'pics', f)));
        expect(missing, `nommés par SOURCE_MARKS, absents de public/pics :\n  ${missing.join('\n  ')}`)
            .toEqual([]);
    });

    it('gives each mark a light and a dark variant', () => {
        // One of the two missing is invisible in whichever theme the author was not in.
        const named = [...new Set([...MARKS.matchAll(/\.\/pics\/([\w-]+)-(light|dark)\.webp/g)]
            .map(m => m[1]))];
        expect(named.length).toBeGreaterThan(2);
        for (const base of named) {
            for (const variant of ['light', 'dark']) {
                const f = path.join(ROOT, 'public', 'pics', `${base}-${variant}.webp`);
                expect(fs.existsSync(f), `${base}-${variant}.webp`).toBe(true);
            }
        }
    });
});

describe('the app icon is declared once and reserved everywhere', () => {
    // The size lives in css/components/app-icon.css. The width/height attributes on each
    // <img> are what reserves the box before the stylesheet applies — without them the
    // footer would fall back to the PNG's natural 180px and blow apart a 50px bar, and
    // with a stale value the row reflows on load. Nothing but this case ties the three
    // numbers together.
    const ALL_CSS = ['components/app-icon.css', 'components/splash-screen.css']
        .map(f => fs.readFileSync(path.join(ROOT, 'css', ...f.split('/')), 'utf8')).join('\n');
    const CSS = fs.readFileSync(path.join(ROOT, 'css', 'components', 'app-icon.css'), 'utf8');

    // `(?<![\w-])` because `max-width` and `min-width` both end in the word being looked
    // for. Unanchored, a `min-width` written above the real declaration is what the case
    // would read, and it would then demand that number in every width="" attribute —
    // checked by mutation: `min-width: 96px` made it ask login.html for width="96".
    const WIDTH = String.raw`(?<![\w-])width:\s*(\d+)px`;
    const SIDE = Number(CSS.match(new RegExp(String.raw`\.ag-app-icon\s*\{[^}]*?${WIDTH}`, 's'))?.[1]);
    const SITES = ['login.html', 'index.html',
        path.join('js', 'components', 'organisms', 'ag-footer.js')];

    /** The size a tag actually renders at: its own modifier class if it has one. */
    const sizeOf = tag => {
        const mod = tag.match(/class="ag-app-icon ([\w-]+)"/)?.[1];
        if (!mod) return SIDE;
        // The rule may chain classes or scope itself to an ancestor to outrank the shared
        // one, so match the block that mentions the modifier rather than a selector made
        // of it alone.
        const own = ALL_CSS.match(new RegExp(String.raw`\.${mod}[^{}]*\{[^}]*?${WIDTH}`, 's'))?.[1];
        return own ? Number(own) : SIDE;
    };

    it('declares one size', () => {
        expect(SIDE, 'no width found on .ag-app-icon').toBeGreaterThan(0);
    });

    it('reserves that size at every call-site that renders it inline', () => {
        for (const file of SITES) {
            const src = fs.readFileSync(path.join(ROOT, ...file.split(path.sep)), 'utf8');
            const tags = [...src.matchAll(/<img[^>]*class="ag-app-icon[^"]*"[^>]*>/g)].map(m => m[0]);
            expect(tags.length, `${file} renders no app icon`).toBeGreaterThan(0);
            for (const tag of tags) {
                // The preview modal sizes itself larger on purpose; it carries its own
                // width in a style attribute and needs no reservation.
                if (/style="[^"]*width/.test(tag)) continue;
                const side = sizeOf(tag);
                expect(tag, `${file}: reserves a box the stylesheet does not draw`)
                    .toMatch(new RegExp(`width="${side}"`));
                expect(tag, `${file}: reserves a box the stylesheet does not draw`)
                    .toMatch(new RegExp(`height="${side}"`));
            }
        }
    });
});

describe('the manifest points at icons that exist', () => {
    it('declares some', () => {
        expect(manifestIcons().length).toBeGreaterThan(2);
    });

    it('ships every one of them', () => {
        const missing = manifestIcons().filter(i => !ships(i.src));
        expect(missing.map(i => `${i.where} — ${i.src}`),
            'icônes déclarées mais absentes du dépôt').toEqual([]);
    });

    it('offers a square icon for every purpose it declares', () => {
        // The retired entry was a wordmark five and a half times wider than tall, offered
        // at `sizes: "any"` — which is what a browser reaches for first on a scalable
        // surface. An app icon is square; a logotype stretched into one is not a logo.
        for (const purpose of new Set((MANIFEST.icons ?? []).map(i => i.purpose ?? 'any'))) {
            const square = (MANIFEST.icons ?? []).filter(
                i => (i.purpose ?? 'any') === purpose && /^(\d+)x\1$/.test(i.sizes ?? ''),
            );
            expect(square.length, `purpose "${purpose}" n'a aucune icône carrée`).toBeGreaterThan(0);
        }
    });
});
