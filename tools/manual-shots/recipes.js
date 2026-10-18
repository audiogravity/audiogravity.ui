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
import { endBefore, union } from './harness.js';

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
 * The box of an element a page may or may not show, or null when it shows none.
 *
 * For a row a live card can drop between two readings: boxOf() would wait the page's
 * whole timeout for it and fail the figure, where its absence only means there is
 * nothing to frame around.
 *
 * @param {import('playwright').Locator} locator - The element.
 * @returns {Promise<?Clip>}
 */
async function boxIfShown(locator) {
    if (!(await locator.count())) return null;
    return locator.first().boundingBox({ timeout: 1000 }).catch(() => null);
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
    pro: true,
});

/**
 * A box whose trial has ended without a licence, as the core reports it
 * (modules/license/service.py): the Starter Edition, Pro closed. Every padlock the app
 * draws follows from this answer. Same synthetic Device ID as the trial's.
 */
const STARTER_LICENCE = Object.freeze({
    status: 'starter',
    days_remaining: 0,
    trial_days_total: 30,
    device_id: TRIAL_LICENCE.device_id,
    issued: null,
    message: 'Trial expired. Audiogravity is running in Starter Edition.',
    pro: false,
});

/** A key of the right shape that belongs to no one: the figures never show a real one. */
const EXAMPLE_KEY = 'AG-7Q4M-K2XD-9PLW-3HTR';

/** Longer than the stepper bars' colour transition (--transition-normal, 250ms). */
const STEP_TRANSITION_MS = 600;

/**
 * Stage the licence figures: this box reports `licence` — the trial by default, or the
 * Starter Edition — with its synthetic Device ID and, when `check` is given, the licence
 * server's answer to a key check is that — the example key matches no order. The fields
 * are those the core's CheckKeyResponse carries.
 *
 * @param {import('playwright').Page} page - Any tab: every component reads the licence the
 *   tab bar reads.
 * @param {?object} [check] - What /license/check answers, over a valid lifetime licence.
 * @param {object} [licence=TRIAL_LICENCE] - What /license/status answers.
 * @returns {Promise<void>}
 */
async function stageLicence(page, check = null, licence = TRIAL_LICENCE) {
    await page.route(/\/license\/status(\?|$)/, (route) => route.fulfill({ json: licence }));
    if (!check) return;
    await page.route(/\/license\/check(\?|$)/, (route) => route.fulfill({
        json: { valid: true, key: EXAMPLE_KEY, plan: 'lifetime', expires_at: null, ...check },
    }));
}

/**
 * Stage a Starter box: the licence the core reports once a trial has ended without one.
 *
 * @param {import('playwright').Page} page - Any tab.
 * @returns {Promise<void>}
 */
function stageStarter(page) {
    return stageLicence(page, null, STARTER_LICENCE);
}

/**
 * MPD's DSD switches as the guided setup leaves them on a reader's box: DoP off, the
 * DAC's volume at full during DSD. The lab box sends DoP (its own MPD configuration);
 * the rest of the status is the dev core's, rewritten on its way in.
 *
 * @param {import('playwright').Page} page - The page, before it loads.
 * @returns {Promise<void>}
 */
async function stageDsdDefaults(page) {
    await page.route(/\/audio-stack\/status(\?|$)/, async (route) => {
        const response = await route.fetch();
        const json = await response.json();
        for (const service of json.services || []) {
            if (service.service_id === 'mpd') Object.assign(service, { dop: false, dsd_full_volume: true });
        }
        await route.fulfill({ response, json });
    });
}

/**
 * Open the licence window with its LICENSE KEY button, and wait for its Device ID.
 *
 * @param {import('playwright').Page} page - The Admin tab.
 * @returns {Promise<import('playwright').Locator>} The activation steps.
 */
async function openLicenceWindow(page) {
    await page.locator('ag-license-status button', { hasText: 'LICENSE KEY' }).click();
    const activation = page.locator('ag-license-activation');
    await activation.waitFor({ timeout: 10000 });
    await page.waitForFunction(() => document.querySelector('ag-license-activation')?._deviceId);
    return activation;
}

/**
 * The tab menu of a phone, Library unfolded into its views.
 *
 * @param {import('playwright').Page} page - The Library tab.
 * @returns {Promise<Shot>}
 */
async function tabMenu(page) {
    await page.evaluate(() => { document.querySelector('ag-tabs')._sidebarHidden = false; });
    await page.waitForTimeout(800);
    // Unfolded by a tap, as a reader would — the column opens on Library folded.
    await page.locator('ag-tabs .tab-btn[data-tab="library"]').click();
    await page.waitForTimeout(800);
    const column = await box(page, 'ag-tabs');
    const views = await box(page, 'ag-tabs ag-lib-tabbar.lib-menu');
    // The pointer left on the entry would keep it under its hover tint. It moves
    // to the empty column under the views, not out of it: leaving the column
    // closes it half a second later (ag-tabs, mouseleave).
    await page.mouse.move(column.x + column.width / 2, views.y + views.height + 60);
    await page.waitForTimeout(400);
    // The column down to the library's views: below them it is empty down to
    // Manual, at its foot.
    return { clip: { x: column.x, y: column.y, width: column.width, height: views.y + views.height + 16 - column.y } };
}

/**
 * Open the library's Sources view.
 *
 * @param {import('playwright').Page} page - The Library tab.
 * @returns {Promise<Clip>} The box of the whole view.
 */
async function sourcesView(page) {
    await page.evaluate(`${LIB}._setView('library')`);
    await page.waitForTimeout(4000);
    return box(page, '.lib-view.active ag-library-sources');
}

/**
 * The licence panel, once its badge is drawn.
 *
 * @param {import('playwright').Page} page - The Admin tab.
 * @returns {Promise<Shot>}
 */
async function licencePanel(page) {
    await page.locator('ag-license-status ag-license-badge').first().waitFor({ timeout: 15000 });
    const panel = await box(page, 'ag-license-status');
    // What follows can start inside the panel's last, fractional pixel: widened to a whole
    // pixel, the figure took a stroke of it (the NEW USER button's border, on Starter).
    const next = await boxIfShown(page.locator('ag-license-status + *'));
    const end = panel.y + panel.height;
    return { clip: { ...panel, height: (next ? Math.min(end, Math.floor(next.y)) : end) - panel.y } };
}

/**
 * An example listening history for the Stats figure: a household's month, summed as the
 * core sums one. The dev box's own history is a few listens, which draw nothing to read;
 * this one is set in the page (`/listening/summary` rewritten), never written to the core.
 *
 * Evenings every day, mornings on weekdays, afternoons at the weekend, late on Friday and
 * Saturday; two days away from home.
 *
 * @param {Date} [now] - Today, for the days of the period.
 * @returns {object} A `ListeningSummary` for the last 30 days.
 */
export function exampleHistory(now = new Date()) {
    // Minutes per hour of the week, on average per week, Monday first.
    const week = Array.from({ length: 7 }, (_, day) => {
        const weekend = day >= 5;
        return Array.from({ length: 24 }, (_, hour) => {
            let minutes = 0;
            if (hour < 2) minutes = day === 4 || day === 5 ? 7 : 0;
            else if (hour >= 7 && hour <= 8) minutes = weekend ? 0 : 6;
            else if (hour >= 10 && hour <= 13) minutes = weekend ? 11 : 1;
            else if (hour >= 14 && hour <= 18) minutes = weekend ? 16 : 0;
            else if (hour >= 19 && hour <= 21) minutes = 19;
            else if (hour >= 22) minutes = day === 4 || day === 5 ? 26 : 10;
            return minutes * 60;
        });
    });
    const perWeekday = week.map(hours => hours.reduce((a, b) => a + b, 0));
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const away = new Set([11, 12]);                 // days back from today
    const swing = [1, 0.8, 1.15, 0.9, 1.05, 1.2, 0.85];
    const buckets = Array.from({ length: 30 }, (_, i) => {
        const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (29 - i));
        const back = 29 - i;
        const seconds = away.has(back) ? 0 : Math.round(perWeekday[(day.getDay() + 6) % 7] * swing[i % 7]);
        return { start: iso(day), seconds };
    });
    const total = buckets.reduce((s, b) => s + b.seconds, 0);
    const share = (x) => Math.round(x * total);
    const listens = Math.round(total / 265);
    return {
        period: '30d', unit: 'day', recording: true, since: '2025-03-03',
        total_seconds: total, listens, albums: Math.round(listens / 9),
        active_days: buckets.filter(b => b.seconds).length, days: 30, buckets,
        sources: [['Qobuz', 0.41], ['Local Library', 0.29], ['Radio', 0.13], ['HIGHRESAUDIO', 0.09],
                  ['Tidal', 0.05], ['AirPlay', 0.03]].map(([label, s]) => ({ label, seconds: share(s) })),
        outputs: [{ label: 'Heed Abacus', seconds: share(0.78) }, { label: 'Living room', seconds: share(0.22) }],
        quality: [{ key: 'dsd', seconds: share(0.05) }, { key: 'hires', seconds: share(0.44) },
                  { key: 'cd', seconds: share(0.38) }, { key: 'lossy', seconds: share(0.13) }],
        genres: [['Jazz', 0.27], ['Classical', 0.19], ['Electronic', 0.14], ['Rock', 0.12], ['Soul', 0.06],
                 ['Folk', 0.04]].map(([label, s]) => ({ label, seconds: share(s), kind: 'genre' }))
            .concat([{ label: null, seconds: share(0.06), kind: 'other' },
                     { label: null, seconds: share(0.12), kind: 'unknown' }]),
        week_hours: week,
        top_artists: [['Miles Davis', 0.05, 38], ['Nils Frahm', 0.04, 31], ['Anna Calvi', 0.03, 22],
                      ['Bill Evans', 0.03, 19], ['Max Richter', 0.02, 14]]
            .map(([artist, s, plays]) => ({ artist, seconds: share(s), plays })),
        top_albums: [{ album: 'Kind of Blue', artist: 'Miles Davis', seconds: share(0.03), plays: 6 }],
        top_tracks: [{ title: 'So What', artist: 'Miles Davis', album: 'Kind of Blue', seconds: share(0.01), plays: 7 }],
        recent: [
            { started_at: new Date(now.getTime() - 600e3).toISOString(), seconds: 540, title: 'So What',
              artist: 'Miles Davis', album: 'Kind of Blue', live: false, source: 'Qobuz', output: 'Heed Abacus' },
        ],
    };
}

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
        tab: 'config', height: 2200,
        stage: stageDsdDefaults,
        async run(page) {
            await openConfigEditor(page, 'Music Player');
            const field = await box(page, '.ag-guided-field');
            const actions = await box(page, '.ag-guided-actions');
            return { clip: union(field, actions) };
        },
    },
    'guided-dsd': {
        tab: 'config', height: 2200,
        stage: stageDsdDefaults,
        async run(page) {
            await openConfigEditor(page, 'Music Player');
            // The DSD heading and its two switches: DoP, and the DAC's volume during DSD.
            return { clip: await boxOf(page.locator('.ag-guided-field', {
                has: page.locator('ag-prov-dsd-volume-switch'),
            }).first()) };
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
    'tab-menu': {
        // The tab menu of a phone, Library unfolded into its views. Six of them unless
        // the library's source is the radio, which has no albums to browse: four.
        tab: 'library', needs: ['a source other than the radio in the library'],
        run: tabMenu,
    },
    'tab-menu-starter': {
        // The same menu on a Starter box: the Pro tabs behind their padlocks.
        tab: 'library', needs: ['a source other than the radio in the library'],
        stage: stageStarter,
        run: tabMenu,
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
            const s = await sourcesView(page);
            return { clip: { ...s, height: Math.min(s.height, 900) } };
        },
    },
    'sources-starter': {
        // A Starter box: the library's sources, the Pro ones behind their padlocks, down to
        // the last of them — above the next group. A Pro source cannot be the active one there.
        tab: 'library', height: 2600,
        needs: ['the local library or the radio as the library\'s source'],
        stage: stageStarter,
        async run(page) {
            const s = await sourcesView(page);
            const view = page.locator('.lib-view.active ag-library-sources');
            // Drawn for Starter only once the licence is read: its padlock cards say so.
            await view.locator('ag-pro-lock-card').first().waitFor({ timeout: 15000 });
            // "Other sources" under the active one; "Sources" when none is active.
            const group = view.locator('.lib-src-list > .lib-src-lbl', { hasText: /^\s*(Other sources|Sources)\s*$/ });
            const next = group.locator('xpath=following-sibling::*[contains(@class, "lib-src-lbl")][1]');
            const followed = (await next.count()) > 0;
            // The group's last card: the one before the next label, or the last of all.
            const last = followed
                ? next.locator('xpath=preceding-sibling::ag-library-source-card[1]')
                : group.locator('xpath=following-sibling::ag-library-source-card[last()]');
            const end = endBefore(await boxOf(last), followed ? await boxOf(next) : null, 16);
            return { clip: { ...s, height: end - s.y } };
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
    stats: {
        // The listening history, from its header down to the week's hours, with an
        // example month (exampleHistory) and a square tapped to show how one is read.
        tab: 'library', height: 1500,
        async stage(page) {
            await page.route(/\/listening\/summary(\?|$)/, (route) => route.fulfill({ json: exampleHistory() }));
            await page.route(/\/listening\/settings(\?|$)/, (route) =>
                route.fulfill({ json: { recording: true, listens: 4180, since: '2025-03-03' } }));
        },
        async run(page) {
            await page.evaluate(`${LIB}._setView('stats')`);
            const view = page.locator('.lib-view.active ag-library-stats');
            const hours = view.locator('ag-stats-hours');
            await hours.locator('.lib-stats-hours-grid').waitFor({ timeout: 15000 });
            // Saturday from 21:00: the readout above the grid names it.
            await hours.locator('.lib-stats-hours-row').nth(5).locator('button').nth(21).click();
            await page.waitForTimeout(500);
            const top = await boxOf(view.locator('.lib-stats-header'));
            // `has` reads its locator from inside the section: one built from the page
            // would match nothing there.
            const section = await boxOf(view.locator('.lib-stats-section', { has: page.locator('ag-stats-hours') }));
            // 12px of the page around it: the header's words and the grid's last column
            // would otherwise touch the figure's edge.
            const m = 12;
            return { clip: { x: section.x - m, y: top.y - m, width: section.width + 2 * m,
                             height: section.y + section.height - top.y + 2 * m } };
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
    'cpu-cards': {
        tab: 'performance', height: 1400,
        // Each card draws one bar per sample, a sample every 2 to 30 s: minutes pass before
        // the bars say anything. AG_PERFORMANCE_SETTLE (ms) lengthens the wait. The first
        // two cards only: the buttons under the grid come after every core's card.
        settle: Number(process.env.AG_PERFORMANCE_SETTLE) || 7000,
        async run(page) {
            const cards = page.locator('ag-governor-card');
            await cards.first().waitFor({ timeout: 15000 });
            return { clip: union(await boxOf(cards.nth(0)), await boxOf(cards.nth(1))) };
        },
    },
    'latency-test': {
        tab: 'performance', height: 2600,
        // A real test, run on the box with its default settings — one thread, 10 000 loops,
        // about a second at real-time priority 99: not while music plays.
        needs: ['nothing playing'],
        async run(page) {
            const test = page.locator('ag-latency-test');
            await test.scrollIntoViewIfNeeded();
            await test.getByRole('button', { name: /^test$/i }).click();
            await test.locator('.result-chart').waitFor({ timeout: 60000 });
            await page.waitForTimeout(1500);        // the result's figures fade in
            return { clip: await box(page, 'ag-latency-test') };
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
            // The panel is opaque now, but its box ends on a fraction of a pixel and the
            // clip takes the next row: the page below printed a line of its text there.
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
            await stageLicence(page);
        },
        run: licencePanel,
    },
    'license-starter': {
        // The panel of a Starter box: where every padlock leads.
        tab: 'admin', height: 1400,
        stage: stageStarter,
        run: licencePanel,
    },
    'license-active': {
        tab: 'admin', height: 1400,
        needs: ['an activated licence'],
        async run(page) {
            const shot = await licencePanel(page);
            // The Order ID is the licence key; the Device ID ties it to this box.
            return { ...shot, blur: [await licenceValue(page, 'Device ID'), await licenceValue(page, 'Order ID')] };
        },
    },
    'license-activation': {
        tab: 'admin', height: 1400,
        async stage(page) {
            await stageLicence(page, { status: 'available', activations_remaining: 1 });
        },
        async run(page) {
            const activation = await openLicenceWindow(page);
            await activation.locator('input').first().fill(EXAMPLE_KEY);
            await activation.getByRole('button', { name: /check key/i }).click();
            await activation.getByText('Key validated').waitFor({ timeout: 10000 });
            // The field is filled with the box's own name on the network: the lab's.
            const hostname = activation.getByPlaceholder(/audiogravity-server/);
            await hostname.fill('living-room');
            await hostname.blur();
            await page.waitForTimeout(STEP_TRANSITION_MS);
            return { clip: await boxOf(activation) };
        },
    },
    'license-activated': {
        tab: 'admin', height: 1400,
        async stage(page) {
            await stageLicence(page);
        },
        async run(page) {
            const activation = await openLicenceWindow(page);
            // Set in the component: a real activation would bind a licence to this box.
            await page.evaluate(async (key) => {
                const el = document.querySelector('ag-license-activation');
                el._key = key;
                el._result = { license_key: key, activated_at: '2026-10-06', plan: 'lifetime', version_scope: '1' };
                el._step = 3;
                await el.updateComplete;
            }, EXAMPLE_KEY);
            await page.waitForTimeout(STEP_TRANSITION_MS);
            return { clip: await boxOf(activation) };
        },
    },
    'license-verify': {
        tab: 'admin', height: 1400,
        async stage(page) {
            await stageLicence(page, { status: 'already_activated', activations_remaining: 0 });
        },
        async run(page) {
            await openLicenceWindow(page);
            const verify = page.locator('ag-license-verify');
            await verify.locator('input').first().fill(EXAMPLE_KEY);
            await verify.getByRole('button', { name: /verify/i }).click();
            await verify.locator('.badge', { hasText: 'ACTIVE' }).waitFor({ timeout: 10000 });
            return { clip: await boxOf(verify, { scroll: true }) };
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
            // The card of the stream that names what plays — with several streams on
            // the page, every box below comes from that one card.
            const card = page.locator('.amp-np-card', { has: page.locator('.amp-np-title') }).first();
            const frame = await boxOf(card);
            // The card down to its text, its artist and album lines whole: the badge
            // beside the transport is the subject. A radio whose format is known carries
            // it in a row under the text, and 22 px below the title cut that row in two:
            // the figure stops before it.
            const text = union(
                await boxOf(card.locator('.amp-np-title')),
                await boxIfShown(card.locator('.amp-np-artist')),
                await boxIfShown(card.locator('.amp-np-album')),
            );
            const format = await boxIfShown(card.locator('.amp-format-bar'));
            return { clip: { x: frame.x, y: frame.y, width: frame.width, height: endBefore(text, format, 22) - frame.y } };
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
