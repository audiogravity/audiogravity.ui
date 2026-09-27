/**
 * Unit tests for scripts/sync-manual.js — the copy of the user manual each build
 * carries, so that the box serves its manual itself.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync,
    writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { carriesNotice, manualSource, syncManual, DEFAULT_SOURCE } from '../scripts/sync-manual.js';

const SCRIPT = path.join(process.cwd(), 'scripts', 'sync-manual.js');

/**
 * Lay out a manual the way the site repository holds it: chapters, their HTML pages,
 * the table of contents and a figure.
 * @param {string} dir - Where to write it.
 */
function writeManual(dir) {
    mkdirSync(path.join(dir, 'images'), { recursive: true });
    writeFileSync(path.join(dir, 'README.md'), '# Manual\n');
    writeFileSync(path.join(dir, '04-listening.md'), '# Listening\n');
    writeFileSync(path.join(dir, '04-listening.html'), '<h1>Listening</h1>');
    writeFileSync(path.join(dir, 'images', 'ios-fullscreen.webp'), 'RIFF');
}

describe('syncManual', () => {
    let tmp, source, target;

    beforeEach(() => {
        tmp = mkdtempSync(path.join(os.tmpdir(), 'ag-manual-'));
        source = path.join(tmp, 'site', 'docs', 'manual');
        target = path.join(tmp, 'ui', 'public', 'docs', 'manual');
        writeManual(source);
    });

    afterEach(() => rmSync(tmp, { recursive: true, force: true }));

    it('copies the chapters and their figures, and leaves the website\'s pages out', () => {
        expect(syncManual(source, target)).toEqual({ chapters: 2, images: 1 });
        expect(readdirSync(target).sort()).toEqual(['04-listening.md', 'README.md', 'images']);
        expect(readdirSync(path.join(target, 'images'))).toEqual(['ios-fullscreen.webp']);
        expect(readFileSync(path.join(target, '04-listening.md'), 'utf8')).toBe('# Listening\n');
    });

    it('replaces what the app held, so a chapter taken out of the manual leaves the app', () => {
        mkdirSync(target, { recursive: true });
        writeFileSync(path.join(target, '99-removed.md'), 'gone');
        syncManual(source, target);
        expect(existsSync(path.join(target, '99-removed.md'))).toBe(false);
    });

    it('updates the copy in place, as a running dev server needs', () => {
        // Vite tracks public/ through its watcher: after the folder was removed and
        // copied again, it answered every file of it with index.html (2026-09-27).
        syncManual(source, target);
        const folder = statSync(target).ino;
        const past = new Date('2020-01-01T00:00:00Z');
        utimesSync(path.join(target, 'README.md'), past, past);
        writeFileSync(path.join(source, '04-listening.md'), '# Listening, revised\n');

        syncManual(source, target);

        expect(statSync(target).ino).toBe(folder);
        expect(statSync(path.join(target, 'README.md')).mtimeMs).toBe(past.getTime());
        expect(readFileSync(path.join(target, '04-listening.md'), 'utf8')).toBe('# Listening, revised\n');
    });

    it('takes a figure out of the copy when the manual drops it', () => {
        syncManual(source, target);
        rmSync(path.join(source, 'images', 'ios-fullscreen.webp'));
        syncManual(source, target);
        expect(existsSync(path.join(target, 'images', 'ios-fullscreen.webp'))).toBe(false);
    });

    it('copies the figures only, and drops a figure folder the manual emptied', () => {
        mkdirSync(path.join(source, 'images', 'drafts'));
        expect(syncManual(source, target)).toEqual({ chapters: 2, images: 1 });
        expect(existsSync(path.join(target, 'images', 'drafts'))).toBe(false);

        rmSync(path.join(source, 'images'), { recursive: true });
        expect(syncManual(source, target)).toEqual({ chapters: 2, images: 0 });
        expect(existsSync(path.join(target, 'images'))).toBe(false);
    });

    it('tells whether the README carries the trademark notice', () => {
        expect(carriesNotice(source)).toBe(false);
        writeFileSync(path.join(source, 'README.md'), '# Manual\n\n*Names are trademarks of their respective owners.*\n');
        expect(carriesNotice(source)).toBe(true);
    });

    it('refuses a folder with no table of contents, and touches nothing', () => {
        mkdirSync(target, { recursive: true });
        writeFileSync(path.join(target, 'README.md'), 'kept');
        rmSync(path.join(source, 'README.md'));
        expect(() => syncManual(source, target)).toThrow(/README\.md missing/);
        expect(readFileSync(path.join(target, 'README.md'), 'utf8')).toBe('kept');
    });

    it('looks for the manual in the site repository beside this one', () => {
        expect(DEFAULT_SOURCE).toBe(path.resolve(process.cwd(), '..', 'audiogravity.site', 'docs', 'manual'));
        expect(manualSource({})).toBe(DEFAULT_SOURCE);
    });

    it('reads the manual from AG_MANUAL_SRC when it is set, as an absolute path', () => {
        expect(manualSource({ AG_MANUAL_SRC: 'elsewhere/manual' })).toBe(path.resolve('elsewhere/manual'));
    });
});

describe('sync-manual, run as a command', () => {
    let empty;

    beforeEach(() => { empty = mkdtempSync(path.join(os.tmpdir(), 'ag-no-manual-')); });
    afterEach(() => rmSync(empty, { recursive: true, force: true }));

    /**
     * Run the script against a folder that holds no manual — which fails before it
     * writes anything, so the app's own copy is never touched by these tests.
     * @param {string[]} args - Command-line arguments.
     */
    const run = (args) => spawnSync(process.execPath, [SCRIPT, ...args], {
        env: { ...process.env, AG_MANUAL_SRC: empty }, encoding: 'utf8',
    });

    it('stops a build that would ship without the manual', () => {
        const res = run(['--required']);
        expect(res.status).toBe(1);
        expect(res.stderr).toMatch(/a build must carry the manual/);
    });

    it('stops a build whose README lost the trademark notice, before copying anything', () => {
        writeFileSync(path.join(empty, 'README.md'), '# Manual\n');
        const res = run(['--required']);
        expect(res.status).toBe(1);
        expect(res.stderr).toMatch(/no longer carries the trademark notice/);
    });

    it('stops the build too when started through a symbolic link', () => {
        // Node resolves the link for import.meta.url, not for argv[1]: compared as they
        // came, the script took itself for an import and exited 0 without a word.
        const link = path.join(empty, 'sync-manual-link.js');
        symlinkSync(SCRIPT, link);
        const res = spawnSync(process.execPath, [link, '--required'], {
            env: { ...process.env, AG_MANUAL_SRC: path.join(empty, 'nothing') }, encoding: 'utf8',
        });
        expect(res.status).toBe(1);
    });

    it('only warns in development, where the window then says it cannot load', () => {
        const res = run([]);
        expect(res.status).toBe(0);
        expect(res.stderr).toMatch(/nothing to show/);
    });
});

describe('the build scripts carry the manual', () => {
    const scripts = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')).scripts;

    it('copies it before every build, and a missing manual stops the build', () => {
        expect(scripts.build).toMatch(/sync-manual -- --required && vite build/);
    });

    it('copies it before the development server starts', () => {
        expect(scripts.dev).toMatch(/sync-manual && vite$/);
    });
});
