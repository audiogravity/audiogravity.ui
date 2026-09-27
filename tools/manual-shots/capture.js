/**
 * @module manual-shots/capture
 * @description Retake the user manual's figures from the dev instance, and put each one
 * beside the published figure on a review page. Nothing is written into the manual: a
 * person looks at the page, then copies in the figures to replace (README.md).
 *
 * Needs the dev instance running (./dev.sh start) and the dev core's .env.dev beside it;
 * `--help` prints the command line. Exit status: 0 when every figure was taken; 1 when one
 * failed, or when nothing could start (dev instance silent, secrets unreadable, no
 * browser); 2 for a bad command line.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {
    PHONE, compareFigures, dropDevBadge, encodeWebp, fitClip, instanceUrls, lanAddress, load, manualFigures,
    openPhone, readSessionSecrets, roundClip, sessionStorageItems, toImageBox,
} from './harness.js';
import { manualSource } from '../../scripts/sync-manual.js';
import { RECIPES, PLAYBACK, needsPlayback, selectRecipes } from './recipes.js';
import { reviewPage } from './review.js';

const USAGE = `usage: node tools/manual-shots/capture.js [figure ...] [--playback] [--list] [--out DIR]

  figure ...   figures to take, by name (software is images/ios-software.webp);
               none: every figure, less those taken from what plays now
  --playback   also the figures taken from what plays now: the lab is staged for them
  --list       every figure, the chapters that show it and what it needs; takes nothing
  --out DIR    where to write (default: AG_MANUAL_SHOTS_OUT, or ag-manual-shots in the
               system's temporary folder); a figure taken replaces its previous output`;

/**
 * The command line, read.
 *
 * @param {string[]} argv - Arguments after the script's path.
 * @returns {{ names: string[], playback: boolean, list: boolean, help: boolean, out: ?string, bad: ?string }}
 */
function parseArgs(argv) {
    const args = { names: [], playback: false, list: false, help: false, out: null, bad: null };
    for (let i = 0; i < argv.length; i += 1) {
        const a = argv[i];
        if (a === '--playback') args.playback = true;
        else if (a === '--list') args.list = true;
        else if (a === '--help' || a === '-h') args.help = true;
        else if (a.startsWith('--out=')) args.out = a.slice('--out='.length);
        else if (a === '--out') {
            // Never take the next option for the folder: "--out --playback" is a mistake.
            args.out = argv[i + 1]?.startsWith('-') ? '' : (argv[++i] ?? '');
        } else if (a.startsWith('-')) args.bad = `unknown option ${a}`;
        else args.names.push(a.replace(/^ios-/, '').replace(/\.webp$/, ''));
    }
    if (args.out === '') args.bad ??= '--out needs a folder';
    return args;
}

/**
 * Print every figure with the chapters that show it and what it needs.
 *
 * @param {Map<string, string[]>} figures - From manualFigures().
 */
function printList(figures) {
    const width = Math.max(...Object.keys(RECIPES).map((n) => n.length));
    for (const [name, recipe] of Object.entries(RECIPES)) {
        const chapters = figures.get(name)?.join(', ') || 'not shown by any chapter';
        const needs = (recipe.needs || []).filter((n) => n !== PLAYBACK);
        const flag = needsPlayback(recipe) ? ' [--playback]' : '';
        console.log(`${name.padEnd(width)}  ${chapters}${flag}${needs.length ? ` — needs ${needs.join('; ')}` : ''}`);
    }
}

/**
 * Take one figure, write it, and return it.
 *
 * @param {object} ctx
 * @param {import('playwright').Browser} ctx.browser - The browser.
 * @param {import('playwright').Page} ctx.workbench - A blank page, where images are encoded.
 * @param {{dev: string, lan: string, prod: string}} ctx.urls - The instances.
 * @param {?Record<string, string>} ctx.storage - The admin session.
 * @param {string} ctx.outDir - Where to write.
 * @param {string} name - The figure.
 * @returns {Promise<{webp: Buffer, size: number[]}>} The WebP and its [width, height].
 */
async function take({ browser, workbench, urls, storage, outDir }, name) {
    const recipe = RECIPES[name];
    const height = recipe.height ?? PHONE.height;
    // A context of its own per figure: a drawer or a dialog a recipe opened would
    // otherwise still be on screen for the next one.
    const context = await openPhone(browser, { height, storage: recipe.session === false ? null : storage });
    const page = await context.newPage();
    page.on('pageerror', (err) => console.warn(`  ${name}: page error — ${err.message}`));
    try {
        await recipe.stage?.(page);
        const url = `${urls[recipe.instance ?? 'dev']}${recipe.path ?? '/'}${recipe.tab ? `#${recipe.tab}` : ''}`;
        await load(page, url, recipe.settle ?? 7000);
        const shot = await recipe.run(page);
        await dropDevBadge(page);
        const clip = fitClip(roundClip(shot.clip), page.viewportSize());
        const png = await page.screenshot({ clip });
        const webp = await encodeWebp(workbench, png, { blur: (shot.blur || []).map((b) => toImageBox(b, clip)) });
        writeFileSync(path.join(outDir, `ios-${name}.webp`), webp);
        return { webp, size: [clip.width * PHONE.scale, clip.height * PHONE.scale] };
    } catch (err) {
        await page.screenshot({ path: path.join(outDir, `${name}.fail.png`) }).catch(() => {});
        throw err;
    } finally {
        await context.close();
    }
}

/**
 * Run the command.
 *
 * @returns {Promise<number>} Exit status.
 */
async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) { console.log(USAGE); return 0; }
    if (args.bad) { console.error(`capture: ${args.bad}\n\n${USAGE}`); return 2; }

    const source = manualSource();
    const figures = manualFigures(source);
    if (args.list) { printList(figures); return 0; }

    const { run, leftOut, unknown, refused } = selectRecipes(RECIPES, args.names, { playback: args.playback });
    if (unknown.length) {
        console.error(`capture: no recipe for ${unknown.join(', ')} — see --list`);
        return 2;
    }
    if (refused.length) {
        console.error(`capture: ${refused.join(', ')} ${refused.length > 1 ? 'are' : 'is'} taken from what plays `
            + 'now — stage the lab (README.md), then add --playback');
        return 2;
    }

    const outDir = path.resolve(args.out || process.env.AG_MANUAL_SHOTS_OUT || path.join(os.tmpdir(), 'ag-manual-shots'));
    mkdirSync(outDir, { recursive: true });
    const urls = instanceUrls(await lanAddress());
    const storage = run.some((n) => RECIPES[n].session !== false) ? sessionStorageItems(readSessionSecrets()) : null;

    const { chromium, request } = await import('playwright');
    // The installed release serves HTTPS with the box's own certificate.
    const api = await request.newContext({ ignoreHTTPSErrors: true });
    const down = {};
    for (const instance of new Set(run.map((n) => RECIPES[n].instance ?? 'dev'))) {
        const ok = await api.get(`${urls[instance]}/`, { timeout: 5000 }).then((r) => r.ok(), () => false);
        if (!ok) {
            down[instance] = {
                dev: `the dev instance does not answer at ${urls.dev} — start it (./dev.sh start) or set AG_DEV_URL`,
                lan: `the dev instance does not answer at its network address, ${urls.lan}`,
                prod: `no installed release answers at ${urls.prod} — set AG_PROD_URL to one served over HTTPS`,
            }[instance];
        }
    }
    await api.dispose();
    if (down.dev) {
        console.error(`capture: ${down.dev}`);
        return 1;
    }

    const browser = await chromium.launch();
    const workbench = await (await browser.newContext()).newPage();
    const imagesDir = path.join(source, 'images');
    const entries = [];
    try {
        for (const name of run) {
            const entry = { name, chapters: figures.get(name) ?? [], needs: RECIPES[name].needs ?? [] };
            // What an earlier run left for this figure goes first: a figure that fails now
            // must not leave an older WebP behind, ready to be copied into the manual.
            for (const stale of [`ios-${name}.webp`, `${name}.fail.png`]) rmSync(path.join(outDir, stale), { force: true });
            try {
                const unreachable = down[RECIPES[name].instance ?? 'dev'];
                if (unreachable) throw new Error(unreachable);
                const { webp, size } = await take({ browser, workbench, urls, storage, outDir }, name);
                const published = path.join(imagesDir, `ios-${name}.webp`);
                const before = existsSync(published) ? readFileSync(published) : null;
                Object.assign(entry, { after: webp, afterSize: size, before });
                if (before) {
                    const cmp = await compareFigures(workbench, before, webp);
                    Object.assign(entry, { beforeSize: cmp.before, changed: cmp.changed });
                }
                const diff = !before ? 'not in the manual'
                    : entry.changed === null ? `new size (published ${entry.beforeSize.join('×')})`
                        : `${(entry.changed * 100).toFixed(1)} % of pixels changed`;
                console.log(`ok    ${name}  ${size.join('×')}  ${Math.round(webp.length / 1024)} KB  ${diff}`);
            } catch (err) {
                // A timeout says what was awaited, not why it never came: add what the lab
                // had to provide.
                const needs = entry.needs.filter((n) => n !== PLAYBACK);
                entry.error = err.message.split('\n')[0] + (needs.length ? ` (this figure needs ${needs.join('; ')})` : '');
                console.log(`FAIL  ${name}: ${entry.error}`);
            }
            entries.push(entry);
        }
    } finally {
        await browser.close();
    }

    writeFileSync(path.join(outDir, 'review.html'), reviewPage(entries, { source: urls.dev, outDir }));
    console.log(`\nFigures and review page (review.html) in ${outDir}`);
    if (leftOut.length) {
        console.log(`Left out, taken from what plays now: ${leftOut.join(', ')} — stage the lab (README.md), then --playback`);
    }
    return entries.some((e) => e.error) ? 1 : 0;
}

process.exitCode = await main().catch((err) => {
    // A missing .env.dev or browser: say what, without a stack trace.
    console.error(`capture: ${err.message}`);
    return 1;
});
