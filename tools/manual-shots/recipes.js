/**
 * @module manual-shots/recipes
 * @description How each figure of the user manual is taken: which tab it starts from, what
 * it frames, and what is staged for it. One recipe per `images/ios-<name>.webp` the
 * manual shows — js/manual-shots.test.js fails when a figure has none.
 *
 * A recipe opens panels through the components' own state (`_setView('outputs')`,
 * `_showInitModal = true`…) rather than by clicking: some panels have no button on a
 * box that is already set up. It never uses `_onSourceSelect`, which POSTs
 * /player/source — taking a picture must not change the active source.
 *
 * Staged, never real: what a figure shows that the box cannot be put into without
 * consequence is set in the page only — a response rewritten on its way in
 * (`page.route`), or a component's state. Nothing is ever written to the core.
 *
 * `needs` says what the lab must provide; `'playback'` marks the figures taken from
 * what plays now, which capture.js leaves out unless asked (README.md, "Figures taken
 * from what plays now").
 */

/**
 * @typedef {object} Clip
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {object} Shot
 * @property {Clip} clip - What the figure frames, in CSS pixels.
 * @property {Clip[]} [blur] - Boxes to hide, in CSS pixels (page coordinates).
 */

/**
 * @typedef {object} Recipe
 * @property {?string} tab - The app's tab (location hash); null for a page of its own.
 * @property {string} [path='/'] - The page to load.
 * @property {'dev'|'lan'|'prod'} [instance='dev'] - Which instance serves it (harness.instanceUrls()).
 * @property {boolean} [session=true] - Whether the admin session is seeded.
 * @property {number} [height=812] - Window height in CSS pixels: a clip must fit inside it.
 * @property {number} [settle=7000] - Milliseconds to let the page settle after loading.
 * @property {string[]} [needs] - What the lab must provide.
 * @property {(page: import('playwright').Page) => Promise<void>} [stage] - Set before loading (routes).
 * @property {(page: import('playwright').Page) => Promise<Shot>} run - Frame the figure.
 */

import process from 'node:process';
import { union } from './harness.js';

/** Tells capture.js to leave a recipe out unless --playback is given. */
export const PLAYBACK = 'playback';

/** The library page, for the views opened through its state. */
const LIB = "document.querySelector('ag-library-page')";

/**
 * The box of a rendered element.
 *
 * @param {import('playwright').Locator} locator - The element.
 * @param {object} [options]
 * @param {boolean} [options.scroll=false] - Scroll it into view first.
 * @returns {Promise<Clip>}
 * @throws {Error} When the element is not rendered.
 */
async function boxOf(locator, { scroll = false } = {}) {
    if (scroll) await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    if (!box) throw new Error(`nothing rendered for ${locator}`);
    return box;
}

/**
 * The box of the nth element matching a selector.
 *
 * @param {import('playwright').Page} page - The page.
 * @param {string} selector - CSS selector.
 * @param {number} [nth=0] - Which match.
 * @param {object} [options] - As boxOf().
 * @returns {Promise<Clip>}
 */
function box(page, selector, nth = 0, options) {
    return boxOf(page.locator(selector).nth(nth), options);
}

/**
 * The whole window: the figures that show a full phone screen.
 *
 * @param {import('playwright').Page} page - The page.
 * @returns {Clip}
 */
function fullWindow(page) {
    const { width, height } = page.viewportSize();
    return { x: 0, y: 0, width, height };
}

/**
 * Open the config editor of the profile tile whose text contains `name`.
 *
 * @param {import('playwright').Page} page - The Config tab.
 * @param {string} name - Part of the tile's text, e.g. "Music Player".
 * @returns {Promise<void>}
 */
async function openConfigEditor(page, name) {
    await page.locator('ag-config-card', { hasText: name }).getByRole('button', { name: /edit config/i }).click();
    await page.waitForTimeout(3500);
}

/**
 * The value of a licence-panel row, found by its label ("Device ID", "Order ID").
 *
 * @param {import('playwright').Page} page - The Admin tab.
 * @param {string} label - The row's label.
 * @returns {Promise<Clip>}
 */
function licenceValue(page, label) {
    const row = page.locator('ag-license-status .profile-info-row', {
        has: page.locator('.info-label', { hasText: new RegExp(`^${label}$`) }),
    });
    return boxOf(row.locator('code'));
}

/**
 * Open the fullscreen player.
 *
 * @param {import('playwright').Page} page - A page of the app.
 * @param {string} [source] - A source id; without one, it follows what plays now.
 * @returns {Promise<Shot>}
 */
async function fullscreenPlayer(page, source) {
    await page.evaluate((s) => document.querySelector('ag-now-playing-fullscreen')._openPlayer(s), source);
    await page.waitForTimeout(5000);
    return { clip: fullWindow(page) };
}

/**
 * A licence in its trial, with the synthetic Device ID of the component's story: this
 * box holds a real licence, and a trial cannot be restored without deleting it.
 */
const TRIAL_LICENCE = Object.freeze({
    status: 'trial',
    days_remaining: 22,
    trial_days_total: 30,
    device_id: `${'abc123def456'.repeat(5)}abcd`,
    issued: null,
});

/** Where "Release notes" points in the staged update — not visible in the figure. */
const RELEASE_NOTES_URL = 'https://audiogravity.app/releases';

/**
 * Why a page's staging failed, for its recipe to say so. A response rewritten on its
 * way in fails inside a route handler, where an error reaches nobody: the page would
 * only wait for what never comes, and the recipe fail on an unrelated timeout.
 * @type {WeakMap<import('playwright').Page, Error>}
 */
const stagingFailures = new WeakMap();

/** @type {Record<string, Recipe>} Keyed by figure: `software` is images/ios-software.webp. */
export const RECIPES = {
    software: {
        tab: 'audio-software', height: 2200,
        async run(page) {
            const p = await box(page, 'ag-audio-software-page');
            const third = await box(page, 'ag-package-card', 2);
            return { clip: { x: p.x, y: p.y, width: p.width, height: third.y + third.height + 4 - p.y } };
        },
    },
    guided: {
        tab: 'config', height: 1800,
        async run(page) {
            await openConfigEditor(page, 'Music Player');
            const field = await box(page, '.ag-guided-field');
            const actions = await box(page, '.ag-guided-actions');
            return { clip: union(field, actions) };
        },
    },
    'network-mount': {
        tab: 'config', height: 2400,
        async run(page) {
            await openConfigEditor(page, 'Music Player');
            await page.locator('.ag-nmf-toggle').click();
            await page.waitForTimeout(2500);
            return { clip: await box(page, '.ag-nmf') };
        },
    },
    provisioning: {
        tab: 'config', height: 2600,
        async run(page) {
            await page.evaluate(() => { document.querySelector('ag-config-page')._showInitModal = true; });
            await page.waitForTimeout(5000);
            return { clip: await box(page, 'ag-audio-stack-provisioning') };
        },
    },
    outputs: {
        tab: 'library', height: 1400,
        async run(page) {
            await page.evaluate(`${LIB}._setView('outputs')`);
            await page.waitForTimeout(3000);
            return { clip: await box(page, '.lib-view.active .lib-out-list') };
        },
    },
    browse: {
        tab: 'library', height: 1400,
        needs: ['a Qobuz account signed in'],
        async run(page) {
            await page.evaluate(`(() => { const l = ${LIB}; l._sourceId = 'src_qobuz'; l._setView('browse'); l._refreshBrowse?.(); })()`);
            await page.waitForTimeout(7000);
            // The source's logo sits in .lib-context, a sibling of the browser.
            const both = union(await box(page, '.lib-view.active .lib-context'),
                await box(page, '.lib-view.active ag-library-browse'));
            return { clip: { ...both, height: Math.min(both.height, 445) } };
        },
    },
    sources: {
        tab: 'library', height: 2600,
        async run(page) {
            await page.evaluate(`${LIB}._setView('library')`);
            await page.waitForTimeout(4000);
            const s = await box(page, '.lib-view.active ag-library-sources');
            return { clip: { ...s, height: Math.min(s.height, 900) } };
        },
    },
    radio: {
        tab: 'library', height: 1400,
        async run(page) {
            await page.evaluate(`${LIB}._setView('radio')`);
            await page.waitForTimeout(4000);
            const r = await box(page, '.lib-view.active ag-library-radio');
            return { clip: { ...r, height: Math.min(r.height, 376) } };
        },
    },
    'hqplayer-output': {
        tab: 'library', height: 2600,
        needs: ['HQPlayer Desktop reachable on the network, NAA running'],
        async run(page) {
            await page.evaluate(`${LIB}._setView('library')`);
            await page.locator('ag-hqplayer-output ag-status-indicator[label="Connected"]').waitFor({ timeout: 30000 });
            // Staged: turning "Use as output" on for real would route every play of the
            // box to that HQPlayer.
            await page.evaluate(() => { document.querySelector('ag-hqplayer-output')._useAsOutput = true; });
            await page.waitForTimeout(800);
            return { clip: await box(page, 'ag-hqplayer-output') };
        },
    },
    'hqplayer-embedded-card': {
        tab: 'library', height: 2600,
        needs: ['HQPlayer Embedded running on the box'],
        async run(page) {
            await page.evaluate(`${LIB}._setView('library')`);
            await page.waitForTimeout(5000);
            return { clip: await box(page, 'ag-hqplayer-output') };
        },
    },
    'hqplayer-embedded-install': {
        // The dialog prints the address the page was opened from.
        tab: 'audio-software', height: 812, instance: 'lan',
        async run(page) {
            await page.evaluate(() => {
                // Staged: once a box has set HQPlayer Embedded's web password, the dialog
                // says it is kept. A first install asks for one — what the figure shows.
                const p = document.querySelector('ag-audio-software-page');
                const pkg = p.packages.find((x) => x.id === 'hqplayerd');
                p._installDialogFor = { ...pkg, web_credentials: { ...pkg.web_credentials, already_set: false } };
            });
            await page.locator('ag-package-install-dialog .ag-pid-heading').first().waitFor({ timeout: 90000 });
            await page.waitForTimeout(1500);
            return { clip: await box(page, 'ag-package-install-dialog .modal-dialog') };
        },
    },
    'hqplayer-embedded-output': {
        tab: 'config', height: 1800,
        async run(page) {
            await openConfigEditor(page, 'HQPlayer Embedded');
            const editor = await box(page, 'ag-config-editor');
            const actions = await box(page, '.ag-guided-actions');
            return { clip: { x: editor.x, y: editor.y, width: editor.width, height: actions.y + actions.height - editor.y } };
        },
    },
    'config-editor': {
        tab: 'config', height: 1800,
        async run(page) {
            const p = await box(page, 'ag-config-page');
            const fourth = await box(page, 'ag-config-card', 3);
            return { clip: { x: p.x, y: p.y, width: p.width, height: fourth.y + fourth.height + 6 - p.y } };
        },
    },
    services: {
        tab: 'services', height: 1800,
        // The sparklines start as 30 zeros and gain a point every 10 s or so: minutes pass
        // before they say anything. AG_SERVICES_SETTLE (ms) lengthens the wait.
        settle: Number(process.env.AG_SERVICES_SETTLE) || 7000,
        async run(page) {
            const p = await box(page, 'ag-services-page');
            return { clip: { x: p.x, y: p.y, width: p.width, height: 900 } };
        },
    },
    'network-test': {
        tab: 'performance', height: 2600,
        async run(page) {
            // A real ping test, run from the box (~35 s).
            const test = page.locator('ag-network-test');
            await test.scrollIntoViewIfNeeded();
            await test.getByText(/PING/i).first().click();
            await page.waitForTimeout(500);
            await test.getByRole('button', { name: /^test$/i }).click();
            await page.waitForTimeout(35000);
            return { clip: await box(page, 'ag-network-test') };
        },
    },
    'system-info': {
        tab: 'system', height: 1400,
        async run(page) { return { clip: await box(page, 'ag-system-info') }; },
    },
    'system-actions': {
        tab: 'system', height: 1400,
        async run(page) { return { clip: await box(page, 'ag-system-actions', 0, { scroll: true }) }; },
    },
    'user-card': {
        tab: 'admin', height: 1400,
        async run(page) {
            // The card of whoever looks at the page shows them online — once the list of
            // connected users counts this very session, which takes a few seconds.
            const card = page.locator('ag-user-card').first();
            await card.locator('ag-status-indicator').waitFor({ timeout: 20000 }).catch(() => {
                throw new Error('the card never showed its online indicator');
            });
            return { clip: await boxOf(card) };
        },
    },
    settings: {
        tab: 'profiles', settle: 6000,
        async run(page) {
            await page.evaluate(() => { document.querySelector('ag-config-panel').active = true; });
            // The panel is translucent: the page behind it showed through, text included.
            await page.evaluate(() => {
                document.querySelectorAll('ag-profiles-page').forEach((el) => { el.style.visibility = 'hidden'; });
            });
            await page.waitForTimeout(1500);
            return { clip: await box(page, 'ag-config-panel .config-modal') };
        },
    },
    license: {
        tab: 'admin', height: 1400,
        async stage(page) {
            await page.route(/\/license\/status(\?|$)/, (route) => route.fulfill({ json: TRIAL_LICENCE }));
        },
        async run(page) {
            await page.locator('ag-license-status ag-license-badge').first().waitFor({ timeout: 15000 });
            return { clip: await box(page, 'ag-license-status') };
        },
    },
    'license-active': {
        tab: 'admin', height: 1400,
        needs: ['an activated licence'],
        async run(page) {
            await page.locator('ag-license-status ag-license-badge').first().waitFor({ timeout: 15000 });
            // The Order ID is the licence key; the Device ID ties it to this box.
            return {
                clip: await box(page, 'ag-license-status'),
                blur: [await licenceValue(page, 'Device ID'), await licenceValue(page, 'Order ID')],
            };
        },
    },
    'update-banner': {
        tab: 'admin', height: 1400,
        async stage(page) {
            // Staged: an update is on offer only when a newer release is out. The banner
            // offers the release the running version leads to (0.9.62-dev → 0.9.62).
            await page.route(/\/license\/online-status(\?|$)/, async (route) => {
                let response;
                try {
                    response = await route.fetch();
                    const body = await response.json();
                    const base = route.request().url().replace(/\/license\/online-status.*$/, '');
                    const status = await page.request.get(`${base}/status`, { headers: route.request().headers() });
                    const { version } = await status.json();
                    body.update = {
                        available: true,
                        latest: version.replace(/-.*$/, ''),
                        mandatory: false,
                        notes_url: body.update?.notes_url || RELEASE_NOTES_URL,
                    };
                    await route.fulfill({ response, json: body });
                } catch (err) {
                    stagingFailures.set(page, err);
                    // Let the page have what the core answered, or ask again unchanged.
                    await (response ? route.fulfill({ response }) : route.continue()).catch(() => {});
                }
            });
        },
        async run(page) {
            // Measured first: a banner with no update to offer still renders, empty — the
            // staging failure is what explains it.
            const shot = await box(page, 'ag-update-banner').then((clip) => ({ clip }), (err) => ({ err }));
            const failure = stagingFailures.get(page);
            if (failure) throw new Error(`could not offer an update in the page: ${failure.message.split('\n')[0]}`);
            if (shot.err) throw shot.err;
            return shot;
        },
    },
    login: {
        tab: null, path: '/login.html', instance: 'prod', session: false, settle: 5000,
        needs: ['a release installed on the box, served over HTTPS'],
        // The installed release, not the dev server: that one stamps "-DEV · LOCALHOST" on
        // the page, and the passkey button needs the secure context only HTTPS gives.
        async run(page) { return { clip: fullWindow(page) }; },
    },

    // ── Taken from what plays now (README.md) — last, so that nothing staged for them
    //    is undone by a later recipe ──
    'nowplaying-bar': {
        tab: 'library', needs: [PLAYBACK, 'a Qobuz track playing'],
        // The element itself has no height: its bar is fixed to the bottom of the window.
        async run(page) { return { clip: await box(page, 'ag-now-playing .now-playing-bar') }; },
    },
    'origin-badge': {
        tab: 'pipeline', needs: [PLAYBACK, 'a radio playing'],
        async run(page) {
            const card = await box(page, '.amp-np-card');
            const title = await box(page, '.amp-np-card .amp-np-title');
            // The card down to its title: the badge beside the transport is the subject.
            return { clip: { x: card.x, y: card.y, width: card.width, height: title.y + title.height + 22 - card.y } };
        },
    },
    fullscreen: {
        tab: 'library', needs: [PLAYBACK, 'a track playing on the box'],
        run: (page) => fullscreenPlayer(page, 'src_mpd'),
    },
    'output-busy': {
        tab: 'library',
        needs: [PLAYBACK, 'the DAC held by another player, then Play pressed'],
        run: (page) => fullscreenPlayer(page, 'src_mpd'),
    },
    'cast-renderer': {
        tab: 'library', needs: [PLAYBACK, 'an album cast to a network renderer'],
        // No source named: the player opens on what plays now — the renderer's item.
        run: (page) => fullscreenPlayer(page),
    },
    'queue-mixed': {
        // A short window: with three tracks up next, a full-height phone left the middle
        // of the figure empty. The mini player follows the window's bottom.
        tab: 'library', height: 640,
        needs: [PLAYBACK, 'a queue mixing sources'],
        async run(page) {
            await page.evaluate(`${LIB}._setView('queue')`);
            await page.waitForTimeout(4000);
            const queue = await box(page, '.lib-view.active ag-library-queue');
            const { width, height } = page.viewportSize();
            return { clip: { x: 0, y: queue.y, width, height: height - queue.y } };
        },
    },
    'signal-chain': {
        tab: 'pipeline', needs: [PLAYBACK, 'a track playing on the box'],
        async run(page) { return { clip: fullWindow(page) }; },
    },
};

/**
 * Whether a recipe is taken from what plays now.
 *
 * @param {Recipe} recipe - A recipe.
 * @returns {boolean}
 */
export function needsPlayback(recipe) {
    return (recipe.needs || []).includes(PLAYBACK);
}

/**
 * Which recipes a command line asks for.
 *
 * With no name, every figure — less those taken from what plays now, unless
 * `playback` says the lab is set for them. A name the table does not know, or a
 * playback figure named without `playback`, is an error: nothing should be taken
 * from a lab that was not staged for it.
 *
 * @param {Record<string, Recipe>} recipes - The table (RECIPES).
 * @param {string[]} names - Figures named on the command line.
 * @param {object} [options]
 * @param {boolean} [options.playback=false] - --playback was given.
 * @returns {{ run: string[], leftOut: string[], unknown: string[], refused: string[] }}
 *   `run` in table order; `leftOut` are the playback figures skipped when none was named.
 */
export function selectRecipes(recipes, names, { playback = false } = {}) {
    const known = Object.keys(recipes);
    const unknown = names.filter((n) => !known.includes(n));
    if (!names.length) {
        const leftOut = playback ? [] : known.filter((n) => needsPlayback(recipes[n]));
        return { run: known.filter((n) => !leftOut.includes(n)), leftOut, unknown, refused: [] };
    }
    const named = known.filter((n) => names.includes(n));
    const refused = playback ? [] : named.filter((n) => needsPlayback(recipes[n]));
    return { run: unknown.length || refused.length ? [] : named, leftOut: [], unknown, refused };
}
