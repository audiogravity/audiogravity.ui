/**
 * Unit tests for tools/manual-shots/ — the tool that retakes the user manual's figures
 * from the dev instance. What drives a browser is exercised by running the tool; what
 * decides (sessions, geometry, which figures, the review page) is tested here, with the
 * guard that every figure of the manual has its recipe.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {
    PHONE, endBefore, firstLanIPv4, fitClip, forgeToken, instanceUrls, lanAddress, manualFigures,
    parseEnv, readSessionSecrets, roundClip, sessionStorageItems, toImageBox, union,
} from '../tools/manual-shots/harness.js';
import { PLAYBACK, RECIPES, needsPlayback, selectRecipes } from '../tools/manual-shots/recipes.js';
import { UNCHANGED_BELOW, escapeAttribute, reviewPage, verdict } from '../tools/manual-shots/review.js';
import { DEFAULT_SOURCE } from '../scripts/sync-manual.js';

const CAPTURE = path.join(process.cwd(), 'tools', 'manual-shots', 'capture.js');

/**
 * Decode one base64url part of a JWT.
 * @param {string} part
 * @returns {object}
 */
const jwtPart = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

describe('parseEnv', () => {
    it('reads assignments and skips blank lines and comments', () => {
        expect(parseEnv('# comment\n\nA=1\n  B = two  \n')).toEqual({ A: '1', B: 'two' });
    });

    it('drops matching quotes only', () => {
        expect(parseEnv('A="x y"\nB=\'z\'\nC="unclosed\n')).toEqual({ A: 'x y', B: 'z', C: '"unclosed' });
    });

    it('splits at the first "=" and ignores lines that assign nothing', () => {
        expect(parseEnv('URL=http://h/?a=b\nnoequal\n=orphan\n')).toEqual({ URL: 'http://h/?a=b' });
    });

    it('cuts a comment after a space off an unquoted value, as the core\'s python-dotenv does', () => {
        // .env.example writes its API key that way.
        expect(parseEnv('API_KEY=abc      # generate: openssl rand -hex 32\nTAG=a#b\nQ="x # y" # note\n'))
            .toEqual({ API_KEY: 'abc', TAG: 'a#b', Q: 'x # y' });
    });

    it('drops an export prefix', () => {
        expect(parseEnv('export API_KEY=k\n')).toEqual({ API_KEY: 'k' });
    });
});

describe('readSessionSecrets', () => {
    let dir;
    beforeEach(() => { dir = mkdtempSync(path.join(os.tmpdir(), 'ag-shots-env-')); });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    /** The dev core's accounts file, beside its environment. */
    const accounts = (users, name = 'users.json') =>
        writeFileSync(path.join(dir, name), JSON.stringify(users));

    it('returns the JWT secret and the API key of the dev core, and its admin\'s session', () => {
        const file = path.join(dir, '.env.dev');
        writeFileSync(file, 'JWT_SECRET_KEY=s3cret\nAPI_KEY="k3y"\nOTHER=1\n');
        accounts([{ username: 'bob' }, { username: 'admin', token_version: 3, session_key: 'abc' }]);
        expect(readSessionSecrets(file)).toEqual({
            jwtSecret: 's3cret', apiKey: 'k3y', algorithm: 'HS256', tokenVersion: 3, sessionKey: 'abc',
        });
    });

    it('reads an admin from before versions and keys as the core does', () => {
        const file = path.join(dir, '.env.dev');
        writeFileSync(file, 'JWT_SECRET_KEY=s\nAPI_KEY=k\nUSERS_FILE_PATH=accounts.json\n');
        accounts([{ username: 'admin' }], 'accounts.json');
        expect(readSessionSecrets(file)).toMatchObject({ tokenVersion: 0, sessionKey: '' });
    });

    it('names an accounts file without an admin', () => {
        const file = path.join(dir, '.env.dev');
        writeFileSync(file, 'JWT_SECRET_KEY=s\nAPI_KEY=k\n');
        accounts([{ username: 'bob' }]);
        expect(() => readSessionSecrets(file)).toThrow(/no admin account/);
    });

    it('signs with the algorithm the core is set to', () => {
        const file = path.join(dir, '.env.dev');
        writeFileSync(file, 'JWT_SECRET_KEY=s\nAPI_KEY=k\nJWT_ALGORITHM=HS512\n');
        accounts([{ username: 'admin' }]);
        expect(readSessionSecrets(file).algorithm).toBe('HS512');
    });

    it('names what the file lacks', () => {
        const file = path.join(dir, '.env.dev');
        writeFileSync(file, 'JWT_SECRET_KEY=s3cret\n');
        expect(() => readSessionSecrets(file)).toThrow(/does not define API_KEY/);
    });

    it('names the file it could not read', () => {
        expect(() => readSessionSecrets(path.join(dir, 'absent'))).toThrow(/absent/);
    });
});

describe('forgeToken', () => {
    const now = Date.UTC(2026, 8, 27, 12, 0, 0);

    it('signs an admin token the way the core checks it: HS256 over header.payload', () => {
        const [header, payload, signature] = forgeToken('s3cret', now).split('.');
        expect(jwtPart(header)).toEqual({ alg: 'HS256', typ: 'JWT' });
        expect(signature).toBe(createHmac('sha256', 's3cret').update(`${header}.${payload}`).digest('base64url'));
    });

    it('lasts two hours from now, for an admin, with a fresh id each time', () => {
        const claims = jwtPart(forgeToken('s3cret', now).split('.')[1]);
        expect(claims).toMatchObject({ sub: 'admin', role: 'admin', iat: now / 1000, exp: now / 1000 + 7200 });
        expect(claims.jti).not.toBe(jwtPart(forgeToken('s3cret', now).split('.')[1]).jti);
    });

    it('carries the admin\'s session version and key, as a login does', () => {
        const claims = jwtPart(forgeToken('s3cret', now, 'HS256', { tokenVersion: 2, sessionKey: 'k' }).split('.')[1]);
        expect(claims).toMatchObject({ tv: 2, sk: 'k' });
        expect(jwtPart(forgeToken('s3cret', now).split('.')[1])).toMatchObject({ tv: 0, sk: '' });
    });

    it('depends on the secret', () => {
        expect(forgeToken('a', now).split('.')[2]).not.toBe(forgeToken('b', now).split('.')[2]);
    });

    it('signs with the core\'s algorithm when it is not HS256', () => {
        const [header, payload, signature] = forgeToken('s3cret', now, 'HS512').split('.');
        expect(jwtPart(header).alg).toBe('HS512');
        expect(signature).toBe(createHmac('sha512', 's3cret').update(`${header}.${payload}`).digest('base64url'));
    });

    it('refuses an algorithm it cannot sign with', () => {
        expect(() => forgeToken('s3cret', now, 'RS256')).toThrow(/RS256/);
    });
});

describe('sessionStorageItems', () => {
    it('holds what the app keeps once signed in: token, user, expiry and API key', () => {
        const now = Date.UTC(2026, 8, 27, 12, 0, 0);
        const items = sessionStorageItems({ jwtSecret: 's', apiKey: 'k' }, now);
        expect(Object.keys(items).sort()).toEqual(['apiKey', 'jwt_expiry', 'jwt_token', 'jwt_user']);
        expect(items.apiKey).toBe('k');
        expect(JSON.parse(items.jwt_user)).toEqual({ username: 'admin', role: 'admin' });
        expect(items.jwt_expiry).toBe('2026-09-27T14:00:00.000Z');
    });
});

describe('the machine\'s address', () => {
    it('takes the first IPv4 address that is not a loopback', () => {
        expect(firstLanIPv4({
            lo: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }],
            eth0: [{ family: 'IPv6', internal: false, address: 'fe80::1' },
                { family: 'IPv4', internal: false, address: '10.0.4.254' }],
        })).toBe('10.0.4.254');
    });

    it('reads the numeric family of some Node 18 releases', () => {
        expect(firstLanIPv4({ eth0: [{ family: 4, internal: false, address: '192.168.1.2' }] })).toBe('192.168.1.2');
    });

    it('finds none on a machine with a loopback only', () => {
        expect(firstLanIPv4({ lo: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }] })).toBeUndefined();
    });

    it('answers the address the system routes from', async () => {
        expect(await lanAddress({ route: async () => '10.0.4.254', interfaces: () => ({}) })).toBe('10.0.4.254');
    });

    it('falls back to the interfaces when there is no route, or when the route names no address', async () => {
        const interfaces = () => ({ eth0: [{ family: 'IPv4', internal: false, address: '192.168.1.2' }] });
        expect(await lanAddress({ route: async () => { throw new Error('ENETUNREACH'); }, interfaces }))
            .toBe('192.168.1.2');
        expect(await lanAddress({ route: async () => '0.0.0.0', interfaces })).toBe('192.168.1.2');
    });

    it('answers localhost on a machine with no network at all', async () => {
        expect(await lanAddress({ route: async () => { throw new Error('ENETUNREACH'); }, interfaces: () => ({}) }))
            .toBe('localhost');
    });

    it('finds an address on this machine, never 0.0.0.0', async () => {
        expect(await lanAddress()).toMatch(/^(?!0\.0\.0\.0$)(\d{1,3}\.){3}\d{1,3}$|^localhost$/);
    });
});

describe('instanceUrls', () => {
    it('serves the dev instance through localhost, its network address apart, and a release over HTTPS', () => {
        expect(instanceUrls('10.0.4.254', {})).toEqual({
            dev: 'http://localhost:3000', lan: 'http://10.0.4.254:3000', prod: 'https://10.0.4.254',
        });
    });

    it('takes the release from the environment, trailing slashes dropped', () => {
        expect(instanceUrls('h', { AG_PROD_URL: 'https://other.lan//' }).prod).toBe('https://other.lan');
    });

    it('reaches the network address with the dev server\'s own scheme and port', () => {
        expect(instanceUrls('10.0.4.254', { AG_DEV_URL: 'https://localhost:3443/' }))
            .toMatchObject({ dev: 'https://localhost:3443', lan: 'https://10.0.4.254:3443' });
    });

    it('takes a dev server named by its network address as that address', () => {
        expect(instanceUrls('10.0.4.254', { AG_DEV_URL: 'http://10.0.4.202:3000' }))
            .toMatchObject({ dev: 'http://10.0.4.202:3000', lan: 'http://10.0.4.202:3000' });
    });
});

describe('geometry', () => {
    it('frames the union of several boxes, skipping absent ones', () => {
        expect(union({ x: 10, y: 20, width: 30, height: 40 }, null, { x: 0, y: 50, width: 100, height: 20 }))
            .toEqual({ x: 0, y: 20, width: 100, height: 50 });
        expect(() => union(null)).toThrow();
    });

    it('ends a figure the margin below its last box, or halfway to a row that comes sooner', () => {
        const title = { x: 0, y: 50, width: 300, height: 14 };
        expect(endBefore(title, null, 22)).toBe(86);
        // A radio's format row 13 px under its title: the figure stops halfway, before it.
        expect(endBefore(title, { y: 77 }, 22)).toBe(70.5);
        // A row further away than twice the margin leaves the margin as it was.
        expect(endBefore(title, { y: 200 }, 22)).toBe(86);
    });

    it('ends a figure on its last box when the next one touches it, or when the margin is none', () => {
        const title = { x: 0, y: 50, width: 300, height: 14 };
        expect(endBefore(title, { y: 64 }, 22)).toBe(64);
        expect(endBefore(title, null, 0)).toBe(64);
    });

    it('refuses a next box that starts inside the last one: it would cut the figure\'s subject', () => {
        const title = { x: 0, y: 50, width: 300, height: 14 };
        expect(() => endBefore(title, { y: 60 }, 22)).toThrow(/before the last one ends/);
        expect(() => endBefore(title, { y: 40 }, 22)).toThrow();
    });

    it('widens a clip to whole CSS pixels, cutting nothing', () => {
        expect(roundClip({ x: 10.4, y: 20.6, width: 100.2, height: 50.5 }))
            .toEqual({ x: 10, y: 20, width: 101, height: 52 });
    });

    it('keeps a clip that lies inside the window', () => {
        const clip = { x: 0, y: 0, width: 375, height: 812 };
        expect(fitClip(clip, { width: 375, height: 812 })).toEqual(clip);
    });

    it('cuts a clip to the window\'s width: a full-width box at a fractional position rounds one pixel wider', () => {
        expect(fitClip(roundClip({ x: 0.4, y: 10, width: 375, height: 50 }), { width: 375, height: 812 }))
            .toEqual({ x: 0, y: 10, width: 375, height: 50 });
    });

    it('says to raise the height of a figure running past the bottom, and to scroll one above the top', () => {
        const window = { width: 375, height: 812 };
        expect(() => fitClip({ x: 0, y: 700, width: 375, height: 113 }, window)).toThrow(/raise the recipe's height/);
        expect(() => fitClip({ x: 0, y: -4, width: 375, height: 10 }, window)).toThrow(/scroll it into view/);
    });

    it('refuses a clip that frames nothing', () => {
        expect(() => fitClip({ x: 0, y: 0, width: 375, height: 0 }, { width: 375, height: 812 }))
            .toThrow(/nothing to frame/);
    });

    it('turns a box to hide into figure pixels, with a margin and a radius a third of its height', () => {
        const hidden = toImageBox({ x: 110, y: 220, width: 50, height: 10 }, { x: 100, y: 200 });
        expect(hidden).toEqual({ x: 24, y: 54, width: 162, height: 42, radius: 14 });
    });

    it('keeps a box on the figure\'s edge inside the figure, and never blurs under 4 pixels', () => {
        const hidden = toImageBox({ x: 100, y: 200, width: 2, height: 1 }, { x: 100, y: 200 }, PHONE.scale, 0);
        expect(hidden).toMatchObject({ x: 0, y: 0, width: 6, height: 3, radius: 4 });
    });
});

describe('the manual\'s figures', () => {
    let dir;
    beforeEach(() => { dir = mkdtempSync(path.join(os.tmpdir(), 'ag-shots-manual-')); });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it('are read from the chapters, each with the chapters that show it', () => {
        writeFileSync(path.join(dir, '04-listening.md'),
            '<img src="images/ios-fullscreen.webp">\n![](images/ios-fullscreen.webp)\n![](images/other.png)\n');
        writeFileSync(path.join(dir, '09-troubleshooting.md'), '![](images/ios-output-busy.webp) ![](images/ios-fullscreen.webp)');
        writeFileSync(path.join(dir, '04-listening.html'), '<img src="images/ios-not-a-chapter.webp">');
        expect(Object.fromEntries(manualFigures(dir))).toEqual({
            fullscreen: ['04-listening.md', '09-troubleshooting.md'],
            'output-busy': ['09-troubleshooting.md'],
        });
    });

    it('are none when there is no manual', () => {
        expect(manualFigures(path.join(dir, 'absent')).size).toBe(0);
    });

});

describe('recipes', () => {
    it.skipIf(!existsSync(DEFAULT_SOURCE))('cover every figure the manual shows, and nothing else', () => {
        const shown = [...manualFigures(DEFAULT_SOURCE).keys()].sort();
        expect(Object.keys(RECIPES).sort()).toEqual(shown);
    });

    it('each say where the figure starts and how it is framed', () => {
        for (const [name, recipe] of Object.entries(RECIPES)) {
            expect(typeof recipe.run, name).toBe('function');
            expect(recipe.tab === null || typeof recipe.tab === 'string', name).toBe(true);
            expect(['dev', 'lan', 'prod'], name).toContain(recipe.instance ?? 'dev');
            if (recipe.height !== undefined) expect(recipe.height, name).toBeGreaterThan(0);
        }
    });

    it('take the figures that follow what plays now last', () => {
        const names = Object.keys(RECIPES);
        const firstPlayback = names.findIndex((n) => needsPlayback(RECIPES[n]));
        expect(firstPlayback).toBeGreaterThan(0);
        expect(names.slice(firstPlayback).every((n) => needsPlayback(RECIPES[n]))).toBe(true);
    });
});

describe('selectRecipes', () => {
    const table = {
        a: { run() {} },
        b: { run() {}, needs: [PLAYBACK, 'a radio playing'] },
        c: { run() {}, needs: ['an activated licence'] },
    };

    it('takes every figure but those following what plays now, and says which were left out', () => {
        expect(selectRecipes(table, [])).toEqual({ run: ['a', 'c'], leftOut: ['b'], unknown: [], refused: [] });
    });

    it('takes them all once the lab is staged for playback', () => {
        expect(selectRecipes(table, [], { playback: true }).run).toEqual(['a', 'b', 'c']);
    });

    it('takes the figures named, in the table\'s order', () => {
        expect(selectRecipes(table, ['c', 'a']).run).toEqual(['a', 'c']);
    });

    it('takes nothing when a name is unknown', () => {
        expect(selectRecipes(table, ['a', 'zz'])).toMatchObject({ run: [], unknown: ['zz'] });
    });

    it('refuses a playback figure named without --playback, and takes it with it', () => {
        expect(selectRecipes(table, ['a', 'b'])).toMatchObject({ run: [], refused: ['b'] });
        expect(selectRecipes(table, ['a', 'b'], { playback: true }).run).toEqual(['a', 'b']);
    });
});

describe('the review page', () => {
    const webp = (text) => Buffer.from(text);

    it('says how each figure compares', () => {
        expect(verdict({ error: 'x' }).key).toBe('failed');
        expect(verdict({ before: null, after: webp('n') }).key).toBe('new');
        expect(verdict({ before: webp('o'), after: webp('n'), changed: null }).key).toBe('resized');
        expect(verdict({ before: webp('o'), after: webp('n'), changed: UNCHANGED_BELOW / 2 }).key).toBe('unchanged');
        expect(verdict({ before: webp('o'), after: webp('n'), changed: 0.034 }))
            .toEqual({ key: 'changed', label: 'Changed · 3.4 % of pixels' });
    });

    it('escapes an attribute\'s quotes on top of the app\'s own escaping', () => {
        expect(escapeAttribute('<a href="x">&\'')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
    });

    it('embeds both images, and lists what failed with its reason', () => {
        const page = reviewPage([
            { name: 'software', chapters: ['03-first-run.md'], before: webp('OLD'), after: webp('NEW'),
                beforeSize: [3, 3], afterSize: [3, 3], changed: 0.5 },
            { name: 'login', error: 'no release answers at <https://x>' },
        ], { source: 'http://localhost:3000', outDir: '/tmp/out', when: new Date('2026-09-27T12:00:00Z') });
        expect(page).toMatch(/^<title>Manual figure review<\/title>/);
        expect(page).toContain(`data:image/webp;base64,${webp('OLD').toString('base64')}`);
        expect(page).toContain(`data:image/webp;base64,${webp('NEW').toString('base64')}`);
        expect(page).toContain('03-first-run.md');
        expect(page).toContain('no release answers at &lt;https://x&gt;');
        expect(page).toContain('1 changed');
        expect(page).toContain('1 failed');
        expect(page).toContain('2026-09-27 12:00 UTC');
    });
});

describe('capture.js, run as a command', () => {
    let empty;
    beforeEach(() => { empty = mkdtempSync(path.join(os.tmpdir(), 'ag-shots-cli-')); });
    afterEach(() => rmSync(empty, { recursive: true, force: true }));

    /**
     * Run the command. Every case here stops before a browser is launched.
     * @param {...string} args
     * @returns {import('node:child_process').SpawnSyncReturns<string>}
     */
    const capture = (...args) => spawnSync(process.execPath, [CAPTURE, ...args], {
        encoding: 'utf8', env: { ...process.env, AG_MANUAL_SRC: empty, AG_MANUAL_SHOTS_OUT: empty },
    });

    it('prints its usage', () => {
        const r = capture('--help');
        expect(r.status).toBe(0);
        expect(r.stdout).toContain('usage: node tools/manual-shots/capture.js');
    });

    it('lists every figure it can take', () => {
        const r = capture('--list');
        expect(r.status).toBe(0);
        for (const name of Object.keys(RECIPES)) expect(r.stdout).toContain(name);
    });

    it('refuses a figure it has no recipe for', () => {
        const r = capture('ios-nope.webp');
        expect(r.status).toBe(2);
        expect(r.stderr).toContain('no recipe for nope');
    });

    it('refuses a figure taken from what plays now unless the lab is staged for it', () => {
        const r = capture('fullscreen');
        expect(r.status).toBe(2);
        expect(r.stderr).toContain('--playback');
    });

    it('refuses an option it does not know', () => {
        const r = capture('--everything');
        expect(r.status).toBe(2);
        expect(r.stderr).toContain('unknown option --everything');
    });

    it('never takes the next option for the output folder', () => {
        const r = capture('--out', '--playback', 'fullscreen');
        expect(r.status).toBe(2);
        expect(r.stderr).toContain('--out needs a folder');
        expect(existsSync(path.join(process.cwd(), '--playback'))).toBe(false);
    });
});

describe('the DEV badge', () => {
    it('is found by the id the app gives it', async () => {
        const { DEV_BADGE_ID } = await import('../tools/manual-shots/harness.js');
        const source = readFileSync(path.join(process.cwd(), 'js', 'common.js'), 'utf8');
        expect(source).toContain(`badge.id = '${DEV_BADGE_ID}'`);
    });
});
