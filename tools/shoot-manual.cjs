/**
 * Manual screenshot pipeline — regenerates the user-manual illustrations.
 *
 * Renders real components through Storybook stories (plus the live login page)
 * in the manual's canonical look: iPhone viewport 390x844, deviceScaleFactor 2,
 * Minimal (Classic) theme in light mode. Demo album covers are served by
 * intercepting the cover endpoint with generated SVGs. Output is WebP (encoded
 * in-browser via OffscreenCanvas — no native image dependency), written
 * straight into the site repo's docs/manual/images/.
 *
 * Prerequisites (run from the ui repo root):
 *   npm run storybook            # port 6006 — all story-based shots
 *   ./dev.sh start               # port 3000 — the login-page shot only
 * Then:
 *   node tools/shoot-manual.cjs
 *
 * Env overrides: STORYBOOK_URL, AG_DEV_URL, AG_MANUAL_IMAGES_DIR.
 */
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');

const STORYBOOK_URL = process.env.STORYBOOK_URL || 'http://localhost:6006';
const AG_DEV_URL = process.env.AG_DEV_URL || 'http://localhost:3000';
const OUT_DIR = process.env.AG_MANUAL_IMAGES_DIR
    || path.resolve(__dirname, '../../audiogravity.site/docs/manual/images');
const GLOBALS = 'globals=theme:minimal;darkMode:light';
const WEBP_QUALITY = 0.85;

const DEVICE = {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
};

/** Story-based shots: Storybook iframe URL + the element to frame. */
const STORY_SHOTS = [
    { id: 'organisms-libraryqueue--mixed-sources', selector: 'ag-library-queue', file: 'ios-queue-mixed' },
    { id: 'organisms-nowplayingfullscreen--playing', selector: '.npfs-panel', file: 'ios-fullscreen' },
    { id: 'organisms-libraryoutputs--default', selector: 'ag-library-outputs', file: 'ios-outputs' },
    { id: 'organisms-librarybrowse--streaming', selector: 'ag-library-browse', file: 'ios-browse' },
    { id: 'pages-audiosoftwarepage--default', selector: 'ag-audio-software-page', file: 'ios-software' },
    { id: 'organisms-audiostackprovisioning--detected', selector: 'ag-audio-stack-provisioning', file: 'ios-provisioning' },
    { id: 'organisms-guidedconfig--mpd', selector: 'ag-guided-config', file: 'ios-guided' },
    { id: 'pages-servicespage--default', selector: 'ag-services-page', file: 'ios-services' },
    { id: 'organisms-configpanel--sidebar-open', selector: '.config-modal', file: 'ios-settings' },
    { id: 'molecules-updatebanner--update-available', selector: 'ag-update-banner', file: 'ios-update-banner' },
];

/** Deterministic hue from a token string. */
function hue(token) {
    let h = 0;
    for (const c of token) h = (h * 31 + c.charCodeAt(0)) % 360;
    return h;
}

/** Generate a simple album-art-ish SVG for a cover token. */
function coverSvg(token) {
    const h = hue(token);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">
        <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="hsl(${h},45%,52%)"/>
            <stop offset="1" stop-color="hsl(${(h + 40) % 360},55%,30%)"/>
        </linearGradient></defs>
        <rect width="300" height="300" fill="url(#g)"/>
        <circle cx="150" cy="150" r="86" fill="none" stroke="hsl(${h},35%,78%)" stroke-width="2" opacity="0.6"/>
        <circle cx="150" cy="150" r="30" fill="hsl(${h},35%,38%)" stroke="hsl(${h},30%,80%)" stroke-width="2" opacity="0.85"/>
        <circle cx="150" cy="150" r="5" fill="hsl(${h},25%,88%)"/>
    </svg>`;
}

/** Route demo covers + a plausible update payload into any page. */
async function stageRoutes(page) {
    await page.route('**/audio_pipeline/cover*', (route) => {
        const url = new URL(route.request().url());
        route.fulfill({ contentType: 'image/svg+xml', body: coverSvg(url.searchParams.get('token') || 'demo') });
    });
}

/** Remove the dev-mode badge before shooting. */
async function removeDevBadge(page) {
    await page.evaluate(() => {
        document.querySelector('div[title^="Development mode"]')?.remove();
    });
}

/**
 * Re-encode a PNG screenshot buffer to WebP inside the (already open) page.
 * @param {import('playwright').Page} page - any live page
 * @param {Buffer} pngBuffer - Playwright screenshot output
 * @returns {Promise<Buffer>} WebP bytes
 */
async function toWebp(page, pngBuffer) {
    const b64 = await page.evaluate(async ({ png, quality }) => {
        const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        canvas.getContext('2d').drawImage(bitmap, 0, 0);
        const blob = await canvas.convertToBlob({ type: 'image/webp', quality });
        const buf = new Uint8Array(await blob.arrayBuffer());
        let out = '';
        for (let i = 0; i < buf.length; i += 0x8000) {
            out += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
        }
        return btoa(out);
    }, { png: pngBuffer.toString('base64'), quality: WEBP_QUALITY });
    return Buffer.from(b64, 'base64');
}

/** Screenshot one element (viewport fallback) and write it as WebP. */
async function capture(page, selector, file) {
    await page.waitForTimeout(2500); // let Lit render + fonts settle
    await removeDevBadge(page);
    const el = await page.$(selector);
    const box = el ? await el.boundingBox() : null;
    const png = box && box.height > 20 && box.width > 20
        ? await el.screenshot()
        : await page.screenshot();
    const webp = await toWebp(page, png);
    const dest = path.join(OUT_DIR, `${file}.webp`);
    fs.writeFileSync(dest, webp);
    console.log(`${file}.webp  ${(webp.length / 1024).toFixed(0)} KB  (box ${JSON.stringify(box)})`);
}

/** The login page is served by the Vite dev server, staged for the docs. */
async function shootLogin(browser) {
    const probe = await fetch(`${AG_DEV_URL}/login.html`).then((r) => r.ok).catch(() => false);
    if (!probe) {
        console.warn(`SKIP ios-login: dev server not reachable at ${AG_DEV_URL} (./dev.sh start)`);
        return;
    }
    const page = await browser.newPage(DEVICE);
    await page.addInitScript(() => {
        localStorage.setItem('theme', 'minimal');
        localStorage.setItem('darkMode', 'false');
        localStorage.setItem('apiKey', 'demo-key');
    });
    await page.route('**/status*', (route) => {
        route.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: '0.9.16' }) });
    });
    await page.route('**/license/**', (route) => {
        route.fulfill({ contentType: 'application/json', body: '{}' });
    });
    await page.goto(`${AG_DEV_URL}/login.html`, { waitUntil: 'networkidle' });
    await page.evaluate(() => {
        // Stage the environment line and drop the empty licence chip for the doc shot.
        for (const el of document.querySelectorAll('*')) {
            if (el.children.length === 0 && /LOCALHOST|-DEV/i.test(el.textContent)) {
                el.textContent = 'v0.9.16 · audiogravity.local';
            }
            if (el.children.length === 0 && /^\s*No license\s*$/.test(el.textContent)) {
                el.closest('span, div, p')?.remove();
            }
        }
    });
    await capture(page, 'html', 'ios-login');
    await page.close();
}

(async () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const sb = await fetch(`${STORYBOOK_URL}/`).then((r) => r.ok).catch(() => false);
    if (!sb) {
        console.error(`Storybook not reachable at ${STORYBOOK_URL} — run: npm run storybook`);
        process.exit(1);
    }
    const browser = await chromium.launch();
    for (const shot of STORY_SHOTS) {
        const page = await browser.newPage(DEVICE);
        await stageRoutes(page);
        await page.goto(`${STORYBOOK_URL}/iframe.html?id=${shot.id}&viewMode=story&${GLOBALS}`, { waitUntil: 'networkidle' });
        try {
            await page.waitForSelector(shot.selector, { state: 'attached', timeout: 15000 });
        } catch {
            console.warn(`${shot.file}: selector '${shot.selector}' not found — viewport fallback`);
        }
        await capture(page, shot.selector, shot.file);
        await page.close();
    }
    await shootLogin(browser);
    await browser.close();
    console.log(`\nDone → ${OUT_DIR}`);
})();
