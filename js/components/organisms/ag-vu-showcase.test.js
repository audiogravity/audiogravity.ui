/**
 * Tests for ag-vu-showcase — the level meter over the whole screen, for a tablet.
 *
 * Opened by the full-screen player's event; while open it keeps the screen on and lifts
 * the portrait lock, and on exit it gives both back as they were.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const stopState = vi.fn();
let pushState = null;
const subscribePlayerState = vi.fn((cb) => { pushState = cb; return stopState; });
const subscribeLevels = vi.fn(() => () => {});
vi.mock('../../library-store.js', () => ({
    subscribePlayerState: (...a) => subscribePlayerState(...a),
    subscribeLevels: (...a) => subscribeLevels(...a),
}));
const applyOrientationLock = vi.fn();
vi.mock('../../orientation-lock.js', () => ({ applyOrientationLock: (...a) => applyOrientationLock(...a) }));

import { SHOWCASE_OPEN_EVENT, SHOWCASE_STATE_EVENT } from './ag-vu-showcase.js';
import { setLicense } from '../../license-tiers.js';

describe('ag-vu-showcase', () => {
    let lock;
    let request;

    beforeEach(() => {
        subscribePlayerState.mockClear();
        subscribeLevels.mockClear();
        stopState.mockClear();
        applyOrientationLock.mockClear();
        lock = { release: vi.fn(async () => {}) };
        request = vi.fn(async () => lock);
        Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
        window.AppState = { lockPortrait: true };
        setLicense({ pro: true });
    });

    afterEach(() => {
        document.body.innerHTML = '';
        delete navigator.wakeLock;
        delete window.AppState;
        setLicense(null);
    });

    async function showcase() {
        const el = document.createElement('ag-vu-showcase');
        document.body.appendChild(el);
        await el.updateComplete;
        return el;
    }

    async function open(el, sourceId = 'src_mpd') {
        window.dispatchEvent(new CustomEvent(SHOWCASE_OPEN_EVENT, { detail: { source_id: sourceId } }));
        await el.updateComplete;
        await Promise.resolve();
    }

    it('shows nothing, and follows nothing, until it is opened', async () => {
        const el = await showcase();
        expect(el.querySelector('.ag-vus-panel')).toBeNull();
        expect(subscribePlayerState).not.toHaveBeenCalled();
    });

    it('opens on the source the player follows, with two dials side by side in landscape', async () => {
        const el = await showcase();
        await open(el);
        expect(subscribePlayerState).toHaveBeenCalledWith(expect.any(Function), { sourceId: 'src_mpd' });
        pushState({ title: 'Elle', level_meter: true });
        await el.updateComplete;
        const meter = el.querySelector('.ag-vus-panel ag-vu-meter');
        expect(meter.getAttribute('layout')).toBe('auto');
        // Sized by the height left as well as the width: it must not scroll.
        expect(meter.hasAttribute('fit')).toBe(true);
    });

    it('draws no dial before it knows what plays', async () => {
        const el = await showcase();
        await open(el);
        expect(el.querySelector('ag-vu-meter')).toBeNull();
        expect(el.querySelector('.ag-vus-note')).toBeNull();
        expect(subscribeLevels).not.toHaveBeenCalled();
    });

    it('keeps the screen on and lifts the portrait lock while it is open', async () => {
        const el = await showcase();
        await open(el);
        expect(request).toHaveBeenCalledWith('screen');
        expect(applyOrientationLock).toHaveBeenCalledWith(false);
    });

    it('gives back the screen and the portrait lock on exit, as the device says', async () => {
        const el = await showcase();
        await open(el);
        await Promise.resolve();
        el.querySelector('.ag-vus-exit').click();
        await el.updateComplete;
        expect(el.querySelector('.ag-vus-panel')).toBeNull();
        expect(stopState).toHaveBeenCalledTimes(1);
        expect(lock.release).toHaveBeenCalledTimes(1);
        expect(applyOrientationLock).toHaveBeenLastCalledWith(true);
    });

    it('asks for the screen again when the page comes back: the browser dropped it', async () => {
        const el = await showcase();
        await open(el);
        document.dispatchEvent(new Event('visibilitychange'));
        expect(request).toHaveBeenCalledTimes(2);
        el.close();
        document.dispatchEvent(new Event('visibilitychange'));
        expect(request).toHaveBeenCalledTimes(2);
    });

    it('shows what plays', async () => {
        const el = await showcase();
        await open(el);
        pushState({ title: 'Elle', artist: '-M-', album: 'Îl', level_meter: true, format: null });
        await el.updateComplete;
        expect(el.querySelector('.ag-vus-title').textContent).toBe('Elle');
        expect(el.querySelector('.ag-vus-byline').textContent).toBe('-M- · Îl');
        expect(el.querySelector('.ag-vus-note')).toBeNull();
    });

    it('says so when what plays is not the box\'s own player, and follows no level', async () => {
        // Review of 2026-11-01: the dials stayed, and turned on MPD's copy for a sound
        // that does not go through it.
        const el = await showcase();
        await open(el);
        pushState({ title: 'From the phone', level_meter: false });
        await el.updateComplete;
        expect(el.querySelector('.ag-vus-note')).not.toBeNull();
        expect(el.querySelector('ag-vu-meter')).toBeNull();
        expect(subscribeLevels).not.toHaveBeenCalled();
    });

    it('draws the dials once the box\'s player plays again', async () => {
        const el = await showcase();
        await open(el);
        pushState({ title: 'From the phone', level_meter: false });
        await el.updateComplete;
        pushState({ title: 'Elle', level_meter: true });
        await el.updateComplete;
        expect(el.querySelector('ag-vu-meter')).not.toBeNull();
        expect(el.querySelector('.ag-vus-note')).toBeNull();
        expect(subscribeLevels).toHaveBeenCalledTimes(1);
    });

    it('says when it opens and closes, for the player under it to pause its own meter', async () => {
        const said = vi.fn();
        window.addEventListener(SHOWCASE_STATE_EVENT, said);
        const el = await showcase();
        await open(el);
        el.close();
        window.removeEventListener(SHOWCASE_STATE_EVENT, said);
        expect(said.mock.calls.map((c) => c[0].detail)).toEqual([{ open: true }, { open: false }]);
    });

    it('closes when the licence stops being Pro: its dials would be refused', async () => {
        const el = await showcase();
        await open(el);
        expect(el.querySelector('.ag-vus-panel')).not.toBeNull();
        setLicense({ pro: false });
        await el.updateComplete;
        expect(el.querySelector('.ag-vus-panel')).toBeNull();
        expect(stopState).toHaveBeenCalledTimes(1);
    });

    it('opens nothing while the licence is not read', async () => {
        setLicense(null);
        const el = await showcase();
        await open(el);
        expect(el.querySelector('.ag-vus-panel')).toBeNull();
        expect(subscribePlayerState).not.toHaveBeenCalled();
    });

    it('still opens where the browser cannot keep the screen on', async () => {
        delete navigator.wakeLock;
        const el = await showcase();
        await open(el);
        expect(el.querySelector('.ag-vus-panel')).not.toBeNull();
    });
});

import { readStylesheet, cssRuleBody, mediaBlock } from '../../test-utils.js';

describe('ag-vu-showcase — a phone on its side', () => {
    // It overflowed 2 to 49 px: nothing must scroll (the user, 2026-11-02). jsdom lays
    // nothing out: the contract is read from the stylesheet.
    const sheet = readStylesheet('css', 'components', 'vu-showcase.css');
    const phone = mediaBlock(sheet, /@media\s*\(height\s*<=\s*500px\)\s*and\s*\(orientation:\s*landscape\)/);

    it('gives the dials all the height the rest leaves', () => {
        expect(cssRuleBody(sheet, '.ag-vus-meters')).toMatch(/flex:\s*1 1 0/);
    });

    it('moves Exit to the end of the track\'s line', () => {
        expect(cssRuleBody(phone, '.ag-vus-panel')).toMatch(/"track exit"/);
        expect(cssRuleBody(phone, '.ag-vus-top')).toMatch(/grid-area:\s*exit/);
        expect(cssRuleBody(phone, '.ag-vus-track')).toMatch(/grid-area:\s*track/);
    });

    it('keeps clear of the notch', () => {
        const panel = cssRuleBody(phone, '.ag-vus-panel');
        expect(panel).toMatch(/safe-area-inset-left/);
        expect(panel).toMatch(/safe-area-inset-right/);
    });
});

describe('ag-vu-showcase — Pro', () => {
    afterEach(() => {
        setLicense(null);
        document.body.innerHTML = '';
    });

    it('leads a box without Pro to the licence panel instead of opening', async () => {
        subscribePlayerState.mockClear();
        applyOrientationLock.mockClear();
        setLicense({ pro: false });
        const tabs = { selectTab: vi.fn() };
        const query = vi.spyOn(document, 'querySelector').mockImplementation((sel) =>
            (sel === 'ag-tabs' ? tabs : null));
        const el = document.createElement('ag-vu-showcase');
        document.body.appendChild(el);
        el.open('src_mpd');
        query.mockRestore();
        await el.updateComplete;
        expect(tabs.selectTab).toHaveBeenCalledWith('admin', { keepOpen: false });
        expect(el.querySelector('.ag-vus-panel')).toBeNull();
        expect(subscribePlayerState).not.toHaveBeenCalled();
        expect(applyOrientationLock).not.toHaveBeenCalled();
    });
});
