#!/usr/bin/env node
/**
 * @file Draw iOS's launch images: the splash screen's ground, nothing on it.
 *
 * iOS shows an apple-touch-startup-image while an installed app starts, then the page's
 * own splash screen (#ag-splash-screen) takes over and plays its entrance — the icon, the
 * name, the line coming in from nothing. So the image is that nothing: the ground the
 * entrance starts from, in one colour. It first showed the screen at rest; the entrance
 * then made the icon vanish and come back, a flicker rather than an animation (user,
 * 2026-10-08). A plain launch screen is also what Apple's guidelines ask for — close to
 * the app's first screen, without logo or text.
 *
 * One image per <link> of index.html, at the size it declares (device width and height,
 * pixel ratio, orientation); login.html declares the same ones. The colour is the default
 * theme's dark ground, read from its stylesheet: a launch image cannot know the theme
 * chosen in the app, and whether iOS honours prefers-color-scheme in a startup image's
 * media is not verified. The splash screen pins that same theme on itself (index.html),
 * whatever the user's: on a light one, the launch cut from black to white.
 *
 *   node scripts/make-launch-images.mjs            # written to public/pics/splash
 *   node scripts/make-launch-images.mjs --out DIR  # elsewhere, to compare first
 */
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outArg = process.argv.indexOf('--out');
const OUT = outArg > -1 ? path.resolve(process.argv[outArg + 1]) : path.join(ROOT, 'public', 'pics', 'splash');

/**
 * The launch images a page declares, with the viewport each one stands for.
 *
 * @param {string} html - The page's markup (index.html).
 * @returns {{href: string, width: number, height: number, ratio: number}[]} Width and
 *   height in CSS pixels, as the screen stands in the image's orientation.
 */
export function launchImages(html) {
    const out = [];
    for (const [tag] of html.matchAll(/<link\s+rel="apple-touch-startup-image"[^>]*>/g)) {
        const media = tag.match(/media="([^"]+)"/)?.[1] ?? '';
        const href = tag.match(/href="([^"]+)"/)?.[1];
        const w = Number(media.match(/device-width:\s*(\d+)px/)?.[1]);
        const h = Number(media.match(/device-height:\s*(\d+)px/)?.[1]);
        const ratio = Number(media.match(/device-pixel-ratio:\s*(\d+)/)?.[1]);
        const landscape = /orientation:\s*landscape/.test(media);
        if (!href || !w || !h || !ratio) continue;
        out.push({ href, width: landscape ? h : w, height: landscape ? w : h, ratio });
    }
    return out;
}

/**
 * The default theme's dark ground, as its stylesheet declares it.
 *
 * @param {string} css - css/themes/minimal.css.
 * @returns {string} The `--bg-primary` of its dark appearance, `#rrggbb`.
 */
export function darkGround(css) {
    const block = css.match(/\[data-theme="minimal"\]\.dark-mode[^{]*\{([^}]*)\}/)?.[1] ?? '';
    const colour = block.match(/--bg-primary:\s*(#[0-9a-fA-F]{6})\b/)?.[1];
    if (!colour) throw new Error('no dark --bg-primary in the default theme');
    return colour.toLowerCase();
}

/**
 * A PNG of one colour — one grey channel when the colour is a grey, which every ground
 * of the default theme is.
 *
 * @param {number} width - Pixels.
 * @param {number} height - Pixels.
 * @param {string} colour - `#rrggbb`.
 * @returns {Buffer}
 */
export function plainPng(width, height, colour) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16));
    const png = new PNG({ width, height });
    for (let i = 0; i < png.data.length; i += 4) {
        png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = 255;
    }
    return PNG.sync.write(png, { colorType: r === g && g === b ? 0 : 2 });
}

function main() {
    const images = launchImages(readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
    const colour = darkGround(readFileSync(path.join(ROOT, 'css', 'themes', 'minimal.css'), 'utf8'));
    mkdirSync(OUT, { recursive: true });
    for (const { href, width, height, ratio } of images) {
        writeFileSync(path.join(OUT, path.basename(href)), plainPng(width * ratio, height * ratio, colour));
        console.log(`${path.basename(href)}  ${width * ratio}×${height * ratio}  ${colour}`);
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
