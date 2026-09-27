/**
 * @module sync-manual
 * @description Copy the user manual into the app, so that the box serves it itself.
 *
 * The manual is written once, in audiogravity.site/docs/manual: the website publishes
 * it, and the app's Manual window used to fetch it from audiogravity.app — which a box
 * without internet access never reached. Each build now carries its own copy, taken
 * from the site repository beside this one, and the window reads it from the box.
 *
 * Copied: the chapters (every *.md, README.md included — it holds the table of
 * contents and the trademark notice) and their figures (the files of images/). Left out:
 * the HTML pages the site generates for the website, which the app does not read. A
 * chapter or a figure removed from the manual leaves the app too.
 *
 * The folder is updated in place, never removed and recreated: a running Vite dev server
 * tracks the files of public/ through its watcher, and after the folder was deleted and
 * copied again it answered every one of them with the app's index.html (measured on
 * 2026-09-27, Vite 7). Only what changed is written.
 *
 * Run by `npm run dev` and `npm run storybook`, where a missing manual only warns (the
 * window then says it could not load), and by `npm run build` with --required, where a
 * missing manual — or one whose README lost the trademark notice — stops the build: a
 * release must never ship without them.
 *
 * usage: node scripts/sync-manual.js [--required]
 * The source can be pointed elsewhere with AG_MANUAL_SRC.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseNotice } from '../js/core/manual-notice.js';

const UI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Where the manual is written: the site repository, beside this one. */
export const DEFAULT_SOURCE = path.resolve(UI_ROOT, '..', 'audiogravity.site', 'docs', 'manual');

/** Where Vite serves it from in development, and copies it from into the build. */
export const DEFAULT_TARGET = path.join(UI_ROOT, 'public', 'docs', 'manual');

/**
 * Where the manual is read from: AG_MANUAL_SRC when set, the site repository otherwise.
 * One rule for every reader — this copy, and tools/manual-shots/, which compares its
 * captures with the figures of the same manual.
 *
 * @param {Record<string, string|undefined>} [env=process.env] - Environment to read.
 * @returns {string} Absolute path of the manual's folder.
 */
export function manualSource(env = process.env) {
    return env.AG_MANUAL_SRC ? path.resolve(env.AG_MANUAL_SRC) : DEFAULT_SOURCE;
}

const FIGURES = 'images';

/**
 * The manual's files in a folder, as paths relative to it: the chapters (*.md) and the
 * files of images/. Anything else — the site's HTML pages, other folders — is not part
 * of the app's copy.
 *
 * @param {string} dir - A manual folder.
 * @returns {string[]} Relative paths; empty when `dir` does not exist.
 */
export function manualFiles(dir) {
    if (!existsSync(dir)) return [];
    const chapters = readdirSync(dir).filter((f) => f.endsWith('.md'));
    const figures = existsSync(path.join(dir, FIGURES))
        ? readdirSync(path.join(dir, FIGURES), { withFileTypes: true })
            .filter((e) => e.isFile()).map((e) => path.join(FIGURES, e.name))
        : [];
    return [...chapters, ...figures];
}

/**
 * Whether two files hold the same bytes.
 *
 * @param {string} a - A file.
 * @param {string} b - Another file, which may not exist.
 * @returns {boolean}
 */
function sameBytes(a, b) {
    return existsSync(b) && readFileSync(a).equals(readFileSync(b));
}

/**
 * Whether a manual's README carries the trademark notice the app shows under each chapter.
 *
 * @param {string} source - A manual directory.
 * @returns {boolean}
 */
export function carriesNotice(source) {
    const readme = path.join(source, 'README.md');
    return existsSync(readme) && parseNotice(readFileSync(readme, 'utf8')) !== null;
}

/**
 * Bring `target` in line with the manual's chapters and figures in `source`: write what
 * is new or changed, remove what the manual no longer has, leave the rest untouched.
 *
 * @param {string} source - A manual directory (README.md, chapters, images/).
 * @param {string} target - The app's copy; created when missing, never removed itself.
 * @returns {{chapters: number, images: number}} What the copy now holds.
 * @throws {Error} When `source` holds no README.md — nothing is touched then.
 */
export function syncManual(source, target) {
    if (!existsSync(path.join(source, 'README.md'))) {
        throw new Error(`no manual at ${source} (README.md missing)`);
    }
    const wanted = new Set(manualFiles(source));
    const images = [...wanted].filter((rel) => rel.startsWith(FIGURES + path.sep)).length;

    // Whatever the copy holds beyond the manual's files goes: removed chapters and figures,
    // and anything that is not part of a manual.
    if (existsSync(target)) {
        const held = readdirSync(target).flatMap((name) => (name === FIGURES
            ? readdirSync(path.join(target, FIGURES)).map((f) => path.join(FIGURES, f)) : [name]));
        for (const rel of held) {
            if (!wanted.has(rel)) rmSync(path.join(target, rel), { recursive: true, force: true });
        }
    }
    if (!images) rmSync(path.join(target, FIGURES), { recursive: true, force: true });

    mkdirSync(path.join(target, images ? FIGURES : ''), { recursive: true });
    for (const rel of wanted) {
        if (!sameBytes(path.join(source, rel), path.join(target, rel))) {
            copyFileSync(path.join(source, rel), path.join(target, rel));
        }
    }
    return { chapters: wanted.size - images, images };
}

/**
 * The site commit a copy was taken from, for the build log — marked when the copy
 * carries changes that no commit holds.
 *
 * @param {string} source - The manual directory.
 * @returns {string} e.g. "676be2b" or "676be2b-dirty"; '' when not a git checkout.
 */
function sourceCommit(source) {
    const git = (...args) => execFileSync('git', ['-C', source, ...args],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    try {
        return git('rev-parse', '--short', 'HEAD') + (git('status', '--porcelain', '--', '.') ? '-dirty' : '');
    } catch {
        return '';
    }
}

/**
 * Whether this file is the one Node was asked to run. Compared as real paths: Node
 * resolves symbolic links for import.meta.url but not for argv[1], so a script started
 * through a linked checkout would otherwise do nothing and exit 0, --required or not.
 *
 * @returns {boolean}
 */
function isMain() {
    try {
        return Boolean(process.argv[1])
            && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
    } catch {
        return false;
    }
}

if (isMain()) {
    const required = process.argv.includes('--required');
    const source = manualSource();
    const fail = (message) => {
        if (required) {
            console.error(`sync-manual: ${message} — a build must carry the manual`);
            process.exit(1);
        }
        console.warn(`sync-manual: ${message}`);
    };
    // Checked before anything is copied, so a refused build leaves the app's copy as it was.
    if (!carriesNotice(source) && existsSync(path.join(source, 'README.md'))) {
        fail('the manual\'s README no longer carries the trademark notice the app shows under each chapter');
    }
    try {
        const { chapters, images } = syncManual(source, DEFAULT_TARGET);
        const commit = sourceCommit(source);
        console.log(`Manual copied into public/docs/manual: ${chapters} files, ${images} figures`
            + (commit ? ` (audiogravity.site ${commit})` : ''));
    } catch (err) {
        fail(`${err.message} — the Manual window will have nothing to show`);
    }
}
