/**
 * @module manual-shots/harness
 * @description What every figure of the user manual needs, whatever it shows: where the
 * instances are, an admin session that needs no password, a browser shaped like the phone
 * the manual shows, and the turning of a capture into the WebP the manual publishes.
 *
 * The figures of audiogravity.site/docs/manual/images are browser captures of the real
 * interface — the dev instance, not Storybook — in the format of an iPhone 13 mini:
 * 375×812 CSS pixels at density 3, most of them cropped to one component.
 *
 * Nothing here imports Playwright: the functions that drive a browser are handed the
 * page, so the rest can be unit-tested without one (js/manual-shots.test.js).
 */
import { createHmac, randomUUID } from 'node:crypto';
import dgram from 'node:dgram';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const UI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The phone the manual shows: an iPhone 13 mini, as a browser renders it. */
export const PHONE = Object.freeze({ width: 375, height: 812, scale: 3 });

/**
 * WebP quality of the published figures. Measured on three figures on 2026-09-27: the
 * browser's encoder at 0.82 gives the fidelity of Pillow at 82 (the tool the figures
 * were first made with), for files 2 to 3 % larger.
 */
export const WEBP_QUALITY = 0.82;

/** The dev core's environment file, which holds the secrets an admin session is made of. */
export const DEFAULT_CORE_ENV = path.resolve(UI_ROOT, '..', 'audiogravity.core', '.env.dev');

/** Port of the Vite dev server (vite.config.js). */
const DEV_PORT = 3000;

/** Lifetime of a forged session, in seconds: longer than the slowest batch of captures. */
const SESSION_TTL = 7200;

/** The JWT algorithms a forged session can be signed with, and their HMAC digests. */
const HMAC_DIGESTS = Object.freeze({ HS256: 'sha256', HS384: 'sha384', HS512: 'sha512' });

/** Host names that reach this machine only. */
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

/**
 * The figures the manual shows, and the chapters that show them — read from the
 * chapters themselves, so a figure added or dropped there is seen here.
 *
 * @param {string} dir - The manual's folder.
 * @returns {Map<string, string[]>} Figure name (`software` for images/ios-software.webp)
 *   → chapter files, in file order; empty when the folder does not exist.
 */
export function manualFigures(dir) {
    const figures = new Map();
    if (!existsSync(dir)) return figures;
    for (const chapter of readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
        const text = readFileSync(path.join(dir, chapter), 'utf8');
        for (const [, name] of text.matchAll(/images\/ios-([a-z0-9-]+)\.webp/g)) {
            const chapters = figures.get(name) ?? [];
            if (!chapters.includes(chapter)) chapters.push(chapter);
            figures.set(name, chapters);
        }
    }
    return figures;
}

/**
 * The assignments of a dotenv file, read the way python-dotenv reads them for the core:
 * blank lines and comments skipped, an `export ` prefix dropped, a value in matching
 * quotes taken as written, and an unquoted value cut at a `#` that follows a space —
 * `.env.example` writes `API_KEY=…      # generate: …`.
 *
 * @param {string} text - The file's content.
 * @returns {Record<string, string>} Variable name → value.
 */
export function parseEnv(text) {
    const vars = {};
    for (const raw of text.split('\n')) {
        const line = raw.trim().replace(/^export\s+/, '');
        if (!line || line.startsWith('#')) continue;
        const i = line.indexOf('=');
        if (i < 1) continue;
        const value = line.slice(i + 1).trim();
        const quoted = value.match(/^(['"])(.*)\1(\s+#.*)?$/);
        vars[line.slice(0, i).trim()] = quoted ? quoted[2] : value.replace(/\s+#.*$/, '');
    }
    return vars;
}

/**
 * What an admin session is made of, read from the dev core: from its environment, the
 * key JWTs are signed with and its algorithm, and the API key every route also
 * requires; from its accounts file, the admin's session version and key, which the core
 * checks every token against (core/jwt_handler.py, session_is_current).
 *
 * @param {string} [file=DEFAULT_CORE_ENV] - The dotenv file (AG_CORE_ENV overrides it).
 * @returns {{ jwtSecret: string, apiKey: string, algorithm: string, tokenVersion: number,
 *   sessionKey: string }} The algorithm is JWT_ALGORITHM, HS256 when unset — the core's
 *   own default (core/config.py). The accounts file is USERS_FILE_PATH, beside the
 *   dotenv file when relative (users.json when unset); an admin without a version or a
 *   key there — created before they existed — reads as 0 and "", as in the core.
 * @throws {Error} When a file is unreadable, lacks a secret, or has no admin.
 */
export function readSessionSecrets(file = process.env.AG_CORE_ENV || DEFAULT_CORE_ENV) {
    let vars;
    try {
        vars = parseEnv(readFileSync(file, 'utf8'));
    } catch (err) {
        throw new Error(`cannot read the dev core's environment (${file}): ${err.message}`);
    }
    const missing = ['JWT_SECRET_KEY', 'API_KEY'].filter((k) => !vars[k]);
    if (missing.length) throw new Error(`${file} does not define ${missing.join(' and ')}`);
    const usersFile = path.resolve(path.dirname(file), vars.USERS_FILE_PATH || 'users.json');
    let admin;
    try {
        admin = JSON.parse(readFileSync(usersFile, 'utf8')).find((u) => u.username === 'admin');
    } catch (err) {
        throw new Error(`cannot read the dev core's accounts (${usersFile}): ${err.message}`);
    }
    if (!admin) throw new Error(`${usersFile} has no admin account`);
    return {
        jwtSecret: vars.JWT_SECRET_KEY, apiKey: vars.API_KEY, algorithm: vars.JWT_ALGORITHM || 'HS256',
        tokenVersion: admin.token_version ?? 0, sessionKey: admin.session_key ?? '',
    };
}

/**
 * An admin JWT signed with the dev secret, so the captures need no password. The dev
 * core accepts it as its own: same algorithm, same claims as a login issues — the
 * admin's session version (`tv`) and key (`sk`) included, without which it refuses it.
 *
 * @param {string} secret - JWT_SECRET_KEY of the dev core.
 * @param {number} [now=Date.now()] - Current time in ms (for tests).
 * @param {string} [algorithm='HS256'] - JWT_ALGORITHM of the dev core.
 * @param {{ tokenVersion?: number, sessionKey?: string }} [account] - The admin's, from
 *   readSessionSecrets().
 * @returns {string} The token.
 * @throws {Error} For an algorithm other than HS256, HS384 or HS512.
 */
export function forgeToken(secret, now = Date.now(), algorithm = 'HS256', { tokenVersion = 0, sessionKey = '' } = {}) {
    const digest = HMAC_DIGESTS[algorithm];
    if (!digest) throw new Error(`the dev core signs its tokens with ${algorithm}; only HS256, HS384 and HS512 can be forged`);
    const iat = Math.floor(now / 1000);
    const part = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const head = `${part({ alg: algorithm, typ: 'JWT' })}.${part({
        sub: 'admin', role: 'admin', iat, exp: iat + SESSION_TTL, jti: randomUUID(),
        tv: tokenVersion, sk: sessionKey,
    })}`;
    return `${head}.${createHmac(digest, secret).update(head).digest('base64url')}`;
}

/**
 * What the app keeps in localStorage once signed in as admin — the JWT, who it is and
 * when it ends, and the API key. The routes want both the token and the key.
 *
 * @param {{ jwtSecret: string, apiKey: string, algorithm?: string, tokenVersion?: number,
 *   sessionKey?: string }} secrets - From readSessionSecrets().
 * @param {number} [now=Date.now()] - Current time in ms (for tests).
 * @returns {Record<string, string>} localStorage key → value.
 */
export function sessionStorageItems({ jwtSecret, apiKey, algorithm, tokenVersion, sessionKey }, now = Date.now()) {
    return {
        jwt_token: forgeToken(jwtSecret, now, algorithm, { tokenVersion, sessionKey }),
        jwt_user: JSON.stringify({ username: 'admin', role: 'admin' }),
        jwt_expiry: new Date(now + SESSION_TTL * 1000).toISOString(),
        apiKey,
    };
}

/**
 * The address the system would send from to reach the outside: a UDP connect picks a
 * route and sends nothing (192.0.2.1 is TEST-NET-1, reserved for documentation).
 *
 * @returns {Promise<string>} The address; the promise rejects when there is no route.
 */
function routeAddress() {
    return new Promise((resolve, reject) => {
        const socket = dgram.createSocket('udp4');
        let open = true;
        const close = () => { if (open) { open = false; socket.close(); } };
        socket.once('error', (err) => { close(); reject(err); });
        // A failed connect is handed to this callback and emits no 'error' event: without
        // the check, address() would answer 0.0.0.0.
        socket.connect(9, '192.0.2.1', (err) => {
            if (err) { close(); reject(err); return; }
            const { address } = socket.address();
            close();
            resolve(address);
        });
    });
}

/**
 * This machine's address on the local network — what a reader types to reach the box.
 * Some screens print the host they were opened from (HQPlayer Embedded's install dialog,
 * the login page), and "localhost" would read wrong in the manual.
 *
 * The address the system routes from, or else the first non-internal IPv4 address.
 *
 * @param {object} [probes] - For tests.
 * @param {() => Promise<string>} [probes.route] - The routed address.
 * @param {() => object} [probes.interfaces=os.networkInterfaces] - The interface table.
 * @returns {Promise<string>} An IPv4 address, or "localhost" when there is none.
 */
export async function lanAddress({ route = routeAddress, interfaces = os.networkInterfaces } = {}) {
    try {
        const address = await route();
        if (address && address !== '0.0.0.0') return address;
    } catch {
        // No route out: the interfaces still name the machine.
    }
    return firstLanIPv4(interfaces()) ?? 'localhost';
}

/**
 * The first IPv4 address of a network-interface table that is not a loopback.
 *
 * @param {Record<string, Array<{family: string|number, internal: boolean, address: string}>>} table
 *   - As os.networkInterfaces() returns it (family is a number on some Node 18 releases).
 * @returns {string|undefined}
 */
export function firstLanIPv4(table) {
    return Object.values(table).flat()
        .find((n) => n && (n.family === 'IPv4' || n.family === 4) && !n.internal)?.address;
}

/**
 * Where the pages are served, as a recipe's `instance` names them.
 *
 * - `dev` — the dev instance through localhost, for almost every figure. localhost is
 *   a secure context even over plain HTTP; the network address is not, and there the
 *   browser has no WebAuthn and the app hides what passkeys offer (the Face ID row of
 *   Settings, the PASSKEYS button of the user card). Declaring that address secure
 *   takes the full Chromium, which draws text a few pixels differently from the
 *   headless shell every published figure was taken with — measured on 2026-09-27:
 *   figures identical to the pixel came out 2 to 7 % changed.
 * - `lan` — the same instance through the box's network address, for the screens that
 *   print the host they were opened from (HQPlayer Embedded's install dialog):
 *   "localhost" would read wrong in the manual. Same scheme and port as `dev`, so a dev
 *   server on HTTPS or another port is followed; when `dev` already names a host other
 *   than this machine, it is that address.
 * - `prod` — the release installed on the box, for the login page: the dev server
 *   stamps "-DEV · LOCALHOST" on it, and the passkey button needs HTTPS.
 *
 * @param {string} host - From lanAddress().
 * @param {Record<string, string|undefined>} [env=process.env] - AG_DEV_URL and AG_PROD_URL override.
 * @returns {{ dev: string, lan: string, prod: string }} Base URLs, without a trailing slash.
 */
export function instanceUrls(host, env = process.env) {
    const trim = (u) => u.replace(/\/+$/, '');
    const dev = new URL(env.AG_DEV_URL || `http://localhost:${DEV_PORT}`);
    const lan = new URL(dev.href);
    if (LOOPBACK_HOSTS.includes(dev.hostname)) lan.hostname = host;
    return {
        dev: trim(dev.href),
        lan: trim(lan.href),
        prod: trim(env.AG_PROD_URL || `https://${host}`),
    };
}

/**
 * The smallest box holding all the given ones — for a figure whose title is a sibling of
 * its component (a source's logo sits in .lib-context, outside ag-library-browse).
 *
 * @param {...?{x: number, y: number, width: number, height: number}} boxes - Absent ones are skipped.
 * @returns {{x: number, y: number, width: number, height: number}}
 */
export function union(...boxes) {
    const bs = boxes.filter(Boolean);
    if (!bs.length) throw new Error('union() of no box');
    const x = Math.min(...bs.map((b) => b.x));
    const y = Math.min(...bs.map((b) => b.y));
    const right = Math.max(...bs.map((b) => b.x + b.width));
    const bottom = Math.max(...bs.map((b) => b.y + b.height));
    return { x, y, width: right - x, height: bottom - y };
}

/**
 * A clip widened to whole CSS pixels, so the figure is an exact multiple of the density
 * and nothing of the box is cut.
 *
 * @param {{x: number, y: number, width: number, height: number}} clip - In CSS pixels.
 * @returns {{x: number, y: number, width: number, height: number}}
 */
export function roundClip(clip) {
    const x = Math.floor(clip.x);
    const y = Math.floor(clip.y);
    return { x, y, width: Math.ceil(clip.x + clip.width) - x, height: Math.ceil(clip.y + clip.height) - y };
}

/**
 * A rounded clip, made to fit the window — a screenshot is cut from the window's image,
 * and a clip that leaves it makes the capture fail.
 *
 * Across, it is cut to the window: the phone shows nothing beyond its edges, and a
 * full-width component at a fractional position rounds out one pixel wider than the
 * window. Down, it is refused, since the recipe can do something about it: a figure
 * running past the bottom needs a taller window, one starting above the top needs
 * scrolling into view.
 *
 * @param {{x: number, y: number, width: number, height: number}} clip - From roundClip().
 * @param {{width: number, height: number}} viewport - The window.
 * @returns {{x: number, y: number, width: number, height: number}}
 * @throws {Error} Saying what the recipe must change.
 */
export function fitClip(clip, viewport) {
    const x = Math.max(0, clip.x);
    const width = Math.min(clip.x + clip.width, viewport.width) - x;
    if (width <= 0 || clip.height <= 0) {
        throw new Error(`nothing to frame: the element measures ${clip.width}×${clip.height} at ${clip.x},${clip.y}`);
    }
    if (clip.y < 0) throw new Error(`the figure starts ${-clip.y} px above the window — scroll it into view`);
    if (clip.y + clip.height > viewport.height) {
        throw new Error(`the figure ends at ${clip.y + clip.height} px, past the bottom of the `
            + `${viewport.height} px window — raise the recipe's height`);
    }
    return { x, y: clip.y, width, height: clip.height };
}

/**
 * A box to hide, from page coordinates to the figure's pixels, widened by a margin so
 * the anti-aliased edge of the text goes too. The blur radius follows the height, as on
 * the licence figure first published (a third of it, never under 4 pixels).
 *
 * @param {{x: number, y: number, width: number, height: number}} box - In CSS pixels, page coordinates.
 * @param {{x: number, y: number}} clip - The figure's clip, in CSS pixels.
 * @param {number} [scale=PHONE.scale] - Device scale factor.
 * @param {number} [margin=2] - CSS pixels added on every side.
 * @returns {{x: number, y: number, width: number, height: number, radius: number}} In image pixels.
 */
export function toImageBox(box, clip, scale = PHONE.scale, margin = 2) {
    const x = Math.max(0, Math.floor((box.x - margin - clip.x) * scale));
    const y = Math.max(0, Math.floor((box.y - margin - clip.y) * scale));
    const width = Math.ceil((box.x + box.width + margin - clip.x) * scale) - x;
    const height = Math.ceil((box.y + box.height + margin - clip.y) * scale) - y;
    return { x, y, width, height, radius: Math.max(4, Math.floor(height / 3)) };
}

/**
 * A browser context shaped like the phone, signed in as admin unless told otherwise.
 *
 * @param {import('playwright').Browser} browser - A launched Chromium.
 * @param {object} [options]
 * @param {number} [options.height=PHONE.height] - Window height: grow it for tall crops.
 * @param {?Record<string, string>} [options.storage] - localStorage to seed (sessionStorageItems()), none when null.
 * @returns {Promise<import('playwright').BrowserContext>}
 */
export async function openPhone(browser, { height = PHONE.height, storage = null } = {}) {
    const context = await browser.newContext({
        viewport: { width: PHONE.width, height },
        deviceScaleFactor: PHONE.scale,
        isMobile: true,
        hasTouch: true,
        // The installed release serves HTTPS with the box's own certificate.
        ignoreHTTPSErrors: true,
    });
    if (storage) {
        await context.addInitScript((items) => {
            for (const [key, value] of Object.entries(items)) localStorage.setItem(key, value);
        }, storage);
    }
    return context;
}

/**
/** The id js/common.js gives the dev server's "DEV" badge. */
export const DEV_BADGE_ID = 'ag-dev-badge';

/**
 * Remove the dev server's "DEV" badge, found by its id (js/common.js): it used to be
 * found by its title, and the interface has no titles any more.
 *
 * @param {import('playwright').Page} page - A page of the dev instance.
 * @returns {Promise<void>}
 */
export async function dropDevBadge(page) {
    await page.evaluate((id) => document.getElementById(id)?.remove(), DEV_BADGE_ID);
}

/**
 * Load a page and let it settle. Waits a fixed time rather than for the network to go
 * idle: the app keeps an event stream open, so "networkidle" never comes.
 *
 * @param {import('playwright').Page} page - The page.
 * @param {string} url - What to load.
 * @param {number} settle - Milliseconds to wait once the document is parsed.
 * @returns {Promise<void>}
 */
export async function load(page, url, settle) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(settle);
    await dropDevBadge(page);
}

/**
 * Turn a PNG capture into the manual's WebP, hiding the given boxes under a blur.
 *
 * Runs in a blank page: the browser decodes, blurs and encodes, so the tool needs no
 * image library. A box's pixels are REPLACED by the blurred picture — never blended
 * over the sharp ones — and what the blur leaves transparent, along the figure's edge,
 * is filled with the box's own mean colour: nothing of the hidden text can show through.
 *
 * @param {import('playwright').Page} workbench - A blank page (about:blank).
 * @param {Buffer} png - The capture.
 * @param {object} [options]
 * @param {Array<{x: number, y: number, width: number, height: number, radius: number}>} [options.blur]
 *   - Boxes to hide, in image pixels (toImageBox()).
 * @param {number} [options.quality=WEBP_QUALITY] - WebP quality, 0 to 1.
 * @returns {Promise<Buffer>} The WebP file.
 */
export async function encodeWebp(workbench, png, { blur = [], quality = WEBP_QUALITY } = {}) {
    const b64 = await workbench.evaluate(async ({ png, blur, quality }) => {
        const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        for (const b of blur) {
            const mean = new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true });
            mean.drawImage(bitmap, b.x, b.y, b.width, b.height, 0, 0, 1, 1);
            const [r, g, bl] = mean.getImageData(0, 0, 1, 1).data;
            ctx.save();
            ctx.beginPath();
            ctx.rect(b.x, b.y, b.width, b.height);
            ctx.clip();
            ctx.globalCompositeOperation = 'copy';
            ctx.filter = `blur(${b.radius}px)`;
            ctx.drawImage(bitmap, 0, 0);
            ctx.globalCompositeOperation = 'destination-over';
            ctx.filter = 'none';
            ctx.fillStyle = `rgb(${r}, ${g}, ${bl})`;
            ctx.fillRect(b.x, b.y, b.width, b.height);
            ctx.restore();
        }
        const blob = await canvas.convertToBlob({ type: 'image/webp', quality });
        const buf = new Uint8Array(await blob.arrayBuffer());
        let out = '';
        for (let i = 0; i < buf.length; i += 0x8000) out += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        return btoa(out);
    }, { png: png.toString('base64'), blur, quality });
    return Buffer.from(b64, 'base64');
}

/**
 * How much a new figure differs from the published one: the share of pixels whose
 * colour moved by more than `threshold` on some channel. Two encodings of the same
 * screen stay under the threshold; a changed word does not.
 *
 * @param {import('playwright').Page} workbench - A blank page (about:blank).
 * @param {Buffer} before - The published WebP.
 * @param {Buffer} after - The new WebP.
 * @param {number} [threshold=32] - Per-channel difference, 0 to 255, below which a pixel counts as unchanged.
 * @returns {Promise<{before: number[], after: number[], changed: ?number}>} Sizes as [width, height];
 *   `changed` from 0 to 1, or null when the sizes differ.
 */
export async function compareFigures(workbench, before, after, threshold = 32) {
    return workbench.evaluate(async ({ before, after, threshold }) => {
        const decode = (b64) => createImageBitmap(
            new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'image/webp' }));
        const [a, b] = await Promise.all([decode(before), decode(after)]);
        const sizes = { before: [a.width, a.height], after: [b.width, b.height] };
        if (a.width !== b.width || a.height !== b.height) return { ...sizes, changed: null };
        const pixels = (img) => {
            const ctx = new OffscreenCanvas(img.width, img.height).getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0);
            return ctx.getImageData(0, 0, img.width, img.height).data;
        };
        const pa = pixels(a);
        const pb = pixels(b);
        let moved = 0;
        for (let i = 0; i < pa.length; i += 4) {
            if (Math.abs(pa[i] - pb[i]) > threshold || Math.abs(pa[i + 1] - pb[i + 1]) > threshold
                || Math.abs(pa[i + 2] - pb[i + 2]) > threshold) moved += 1;
        }
        return { ...sizes, changed: moved / (pa.length / 4) };
    }, { before: before.toString('base64'), after: after.toString('base64'), threshold });
}
