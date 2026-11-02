/**
 * Unit tests for ag-progress-bar — the live variant, and how the bar follows the
 * position its source reports.
 *
 * A radio station has no end to count down to and no position to seek to. The
 * bar showed its knob stuck at the start, the time listened on one side and
 * "−0:00" on the other; it now gives way to a "Live" marker.
 *
 * The bar never moved back on its own: a seek from another controller, a track
 * restarted, the next track of the same name all left it where it was — measured on
 * MPD on 2026-11-02, both bars 1:35 to 2:33 ahead of the music. A track replayed with
 * Previous resumed where it had been left, from a page-wide memory of titles.
 *
 * Covers:
 * 1. live: the marker replaces the track and the times
 * 2. live and paused: the marker says so, in the grey of the greyed transport buttons
 * 3. live: nothing ticks
 * 4. back to a track: the bar and its ticker return
 * 5. the source goes back: followed; lagging reports and a lone 0 are not
 * 6. a new track: at its beginning on the same source, where it was on another one
 * 7. created again: where the last bar left the source's track, and only that track
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readStylesheet, cssRuleBody } from '../../test-utils.js';
import { forgetPositions } from './ag-progress-bar.js';

/**
 * The value of one declaration in a rule's body.
 * @param {string|null} body - The text between a rule's braces (see cssRuleBody).
 * @param {string} property - The property's name.
 * @returns {string|undefined} Its value as written, or undefined when not declared.
 */
function declared(body, property) {
    return body?.match(new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+);`))?.[1].trim();
}

/**
 * Mount a progress bar.
 * @param {object} props - Properties to set on it.
 */
async function bar(props) {
    const el = document.createElement('ag-progress-bar');
    Object.assign(el, { title: 'Ma Benz', serverElapsed: 0, duration: 0, ...props });
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
}

// Bars write their position as they go: forget them after emptying the page.
beforeEach(() => { document.body.innerHTML = ''; forgetPositions(); });
afterEach(() => { vi.useRealTimers(); });

/**
 * Give a bar new properties, as its player does on a new state, and let it update.
 * @param {HTMLElement} el - The bar.
 * @param {object} props - The properties.
 */
async function update(el, props) {
    Object.assign(el, props);
    await el.updateComplete;
}

describe('a live broadcast', () => {
    it('shows a Live marker instead of the track and the times', async () => {
        const el = await bar({ live: true, playing: true });
        const marker = el.querySelector('.ag-pb-live');
        expect(marker).not.toBeNull();
        expect(marker.textContent.trim()).toBe('Live');
        expect(el.querySelector('.ag-pb-track')).toBeNull();
        expect(el.querySelector('.ag-pb-times')).toBeNull();
    });

    it('dims the marker while paused', async () => {
        const el = await bar({ live: true, playing: false });
        expect(el.querySelector('.ag-pb-live').classList.contains('ag-pb-live--paused')).toBe(true);
        el.playing = true;
        await el.updateComplete;
        expect(el.querySelector('.ag-pb-live').classList.contains('ag-pb-live--paused')).toBe(false);
    });

    it('greys out paused in the shade of the greyed transport buttons', () => {
        // Same colour at the same opacity composes to the same shade on any background,
        // the cover-tinted one of the full player included. A grey token of its own
        // (--text-secondary) read as a third, stronger shade beside the buttons.
        const bar = readStylesheet('css', 'components', 'progress-bar.css');
        const controls = readStylesheet('css', 'components', 'playback-controls.css');
        const paused = cssRuleBody(bar, '.ag-pb-live--paused');
        expect(declared(cssRuleBody(bar, '.ag-pb-live'), 'color'))
            .toBe(declared(cssRuleBody(controls, '.ag-pc-ctrl'), 'color'));
        expect(declared(paused, 'color')).toBeUndefined();
        expect(declared(paused, 'opacity'))
            .toBe(declared(cssRuleBody(controls, '.ag-pc-ctrl:disabled'), 'opacity'));
    });

    it('ticks nothing', async () => {
        vi.useFakeTimers();
        const el = await bar({ live: true, playing: true });
        vi.advanceTimersByTime(3000);
        expect(el._elapsed).toBe(0);
        expect(el._ticker).toBeNull();
    });
});

describe('back to a track', () => {
    it('brings the bar, its times and its ticker back', async () => {
        vi.useFakeTimers();
        const el = await bar({ live: true, playing: true });
        Object.assign(el, { live: false, title: 'So What', serverElapsed: 10, duration: 545 });
        await el.updateComplete;
        expect(el.querySelector('.ag-pb-live')).toBeNull();
        expect(el.querySelector('.ag-pb-track')).not.toBeNull();
        expect(el.querySelector('.ag-pb-times')).not.toBeNull();
        vi.advanceTimersByTime(2000);
        expect(el._elapsed).toBeGreaterThan(10);
    });

    it('ticks for a track that starts playing as its title changes', async () => {
        // The same update carried the new title and `playing`: the new-track branch
        // used to return before the ticker was armed, and the position stood still.
        vi.useFakeTimers();
        const el = await bar({ title: 'Track A', duration: 200, serverElapsed: 50, playing: false });
        Object.assign(el, { title: 'Track B', serverElapsed: 1, playing: true });
        await el.updateComplete;
        vi.advanceTimersByTime(2000);
        expect(el._elapsed).toBe(3);
    });
});

describe('when the source goes back', () => {
    // MPD's reports, as the box published them (2026-11-02): every 2 s or so, each a
    // fraction behind the music, the bar's own count running between them.
    const PLAYING = { source: 'src_mpd', title: 'So What', duration: 565, playing: true };

    beforeEach(() => { vi.useFakeTimers(); });

    it('follows a seek made from another controller', async () => {
        const el = await bar({ ...PLAYING, serverElapsed: 122.303 });
        vi.advanceTimersByTime(2000);
        await update(el, { serverElapsed: 124.334 });
        await update(el, { serverElapsed: 30.25 });
        expect(el._elapsed).toBe(30.25);
    });

    it('follows the track restarting', async () => {
        const el = await bar({ ...PLAYING, serverElapsed: 205 });
        await update(el, { serverElapsed: 0.159 });
        expect(el._elapsed).toBe(0.159);
    });

    it('takes a restart reported as 0 from the report after it', async () => {
        // Roon (whole seconds) and a UPnP speaker say 0 as the track starts again; the
        // core publishes their next position 2 s later.
        const el = await bar({ ...PLAYING, serverElapsed: 205 });
        await update(el, { serverElapsed: 0 });
        expect(el._elapsed).toBe(205);
        await update(el, { serverElapsed: 2 });
        expect(el._elapsed).toBe(2);
    });

    it('keeps counting through a 0 from a source that gives no position', async () => {
        // AirPlay through shairport-sync 4.3.7: 0 all along. The full player's seek puts
        // its target where the report goes; the 0 that follows is not the music
        // starting again.
        const el = await bar({ ...PLAYING, source: 'src_airplay', serverElapsed: 0 });
        vi.advanceTimersByTime(3000);
        expect(el._elapsed).toBe(3);
        await update(el, { serverElapsed: 60 });
        await update(el, { serverElapsed: 0 });
        expect(el._elapsed).toBe(60);
    });

    it('does not step back to a report that lags without going back', async () => {
        // A report read from the pipeline's 2 s cache, behind the bar's own count.
        const el = await bar({ ...PLAYING, serverElapsed: 103 });
        vi.advanceTimersByTime(2000);
        await update(el, { serverElapsed: 104 });
        expect(el._elapsed).toBe(105);
    });

    it('does not step back to a report a little behind the previous one', async () => {
        // A UPnP speaker's position, run on by the core, then corrected by its next report.
        const el = await bar({ ...PLAYING, serverElapsed: 100.4 });
        await update(el, { serverElapsed: 100 });
        expect(el._elapsed).toBe(100.4);
    });

    it('starts the next track of the same name at its beginning', async () => {
        const el = await bar({ ...PLAYING, title: 'I. Allegro', serverElapsed: 540 });
        await update(el, { serverElapsed: 0.205 });
        expect(el._elapsed).toBe(0.205);
    });

    it('leaves the bar where the finger put it until the source gives a position', async () => {
        const el = await bar({ ...PLAYING, serverElapsed: 30 });
        Object.assign(el, { _seekPending: true, _elapsed: 120 });   // what a drag leaves
        await update(el, { serverElapsed: null });
        expect(el._elapsed).toBe(120);
        await update(el, { serverElapsed: 120.4 });
        expect(el._elapsed).toBe(120.4);
    });
});

describe('a new track', () => {
    beforeEach(() => { vi.useFakeTimers(); });

    it('starts a track replayed with Previous at its beginning, not where it was left', async () => {
        // Reported at 0, as Roon reports a track starting: the bar resumed the 3:25 it
        // had counted for that title, and stayed there.
        const el = await bar({ source: 'src_roon', title: 'Track A', duration: 565, playing: true, serverElapsed: 200 });
        vi.advanceTimersByTime(5000);
        await update(el, { title: 'Track B', serverElapsed: 0 });
        vi.advanceTimersByTime(3000);
        await update(el, { title: 'Track A', serverElapsed: 0 });
        expect(el._elapsed).toBe(0);
    });

    it('judges the new track\'s reports against its own, not the last track\'s', async () => {
        // Against 3:25, every report of the new track would read as the source going
        // back, and a lagging one would step the bar back.
        const el = await bar({ source: 'src_mpd', title: 'Track A', duration: 565, playing: true, serverElapsed: 205 });
        await update(el, { title: 'Track B', serverElapsed: 5 });
        vi.advanceTimersByTime(3000);
        await update(el, { serverElapsed: 7 });
        expect(el._elapsed).toBe(8);
    });

    it('does so straight back from the next one too', async () => {
        // Next then Previous at once: the memory still holds Track A, at 3:25.
        const el = await bar({ source: 'src_roon', title: 'Track A', duration: 565, playing: true, serverElapsed: 200 });
        vi.advanceTimersByTime(5000);
        await update(el, { title: 'Track B', serverElapsed: 0 });
        await update(el, { title: 'Track A', serverElapsed: 0 });
        expect(el._elapsed).toBe(0);
    });

    it('picks another source\'s track up where a bar last saw it, when the source gives no position', async () => {
        const el = await bar({ source: 'src_airplay', title: 'Song', duration: 240, playing: true, serverElapsed: null });
        vi.advanceTimersByTime(50000);
        await update(el, { source: 'src_mpd', title: 'Other', serverElapsed: 10 });
        expect(el._elapsed).toBe(10);
        await update(el, { source: 'src_airplay', title: 'Song', serverElapsed: 0 });
        expect(el._elapsed).toBe(50);
    });

    it('does not lend one source\'s position to another source\'s track of the same name', async () => {
        const el = await bar({ source: 'src_mpd', title: 'Song', duration: 240, playing: true, serverElapsed: 100 });
        vi.advanceTimersByTime(1000);   // the tick leaves src_mpd's position behind
        await update(el, { source: 'src_airplay', serverElapsed: 0 });
        expect(el._elapsed).toBe(0);
    });

    it('sees a source it turns back to went back, when the source gives a position again', async () => {
        // MPD restarted Track A while the bar showed AirPlay: back on MPD, reported
        // without a position first, then at 0:05.
        const el = await bar({ source: 'src_mpd', title: 'Track A', duration: 565, playing: true, serverElapsed: 178 });
        vi.advanceTimersByTime(2000);
        await update(el, { source: 'src_airplay', title: 'Song', serverElapsed: 0 });
        await update(el, { source: 'src_mpd', title: 'Track A', serverElapsed: null });
        expect(el._elapsed).toBe(180);
        await update(el, { serverElapsed: 5 });
        expect(el._elapsed).toBe(5);
    });

    it('keeps the track through a title blank for a moment', async () => {
        // A source that gives no position: taken for two new plays, the blank restarted
        // the bar at 0:00 mid-song.
        const el = await bar({ source: 'src_airplay', title: 'Song', duration: 240, playing: true, serverElapsed: 0 });
        vi.advanceTimersByTime(120000);
        await update(el, { title: '' });
        vi.advanceTimersByTime(1000);
        await update(el, { title: 'Song' });
        expect(el._elapsed).toBe(121);
    });

    it('takes a title after a blank for the new track it is', async () => {
        const el = await bar({ source: 'src_airplay', title: 'Song', duration: 240, playing: true, serverElapsed: 0 });
        vi.advanceTimersByTime(120000);
        await update(el, { title: '' });
        await update(el, { title: 'Next song' });
        expect(el._elapsed).toBe(0);
    });

    it('takes a new length under the same title for a new track, on a source with no position', async () => {
        // Two tracks of the same name in a row, on AirPlay through shairport-sync 4.3.7,
        // which gives each track's length but never a position.
        const el = await bar({ source: 'src_airplay', title: 'Intro', duration: 120, playing: true, serverElapsed: 0 });
        vi.advanceTimersByTime(100000);
        await update(el, { duration: 210 });
        expect(el._elapsed).toBe(0);
    });

    it('keeps the track when its length is the same, or when the source gives positions', async () => {
        const silent = await bar({ source: 'src_airplay', title: 'Intro', duration: 120, playing: true, serverElapsed: 0 });
        vi.advanceTimersByTime(100000);
        await update(silent, { duration: 120.4 });
        expect(silent._elapsed).toBe(100);
        // MPD learns a stream's length after it starts: the same track, its position given.
        const mpd = await bar({ source: 'src_mpd', title: 'Stream', duration: 200, playing: true, serverElapsed: 50 });
        vi.advanceTimersByTime(3000);
        await update(mpd, { duration: 245 });
        expect(mpd._elapsed).toBe(53);
    });

    it('does not resume a source\'s former track on its new one', async () => {
        const el = await bar({ source: 'src_airplay', title: 'Song', duration: 240, playing: true, serverElapsed: null });
        vi.advanceTimersByTime(50000);
        await update(el, { source: 'src_mpd', title: 'Other', serverElapsed: 10 });
        await update(el, { source: 'src_airplay', title: 'Next song', serverElapsed: 0 });
        expect(el._elapsed).toBe(0);
    });
});

describe('a bar created again', () => {
    beforeEach(() => { vi.useFakeTimers(); });

    it('picks the track up where the last bar left it', async () => {
        // The full player closed and reopened on a source that gives no position.
        const first = await bar({ source: 'src_airplay', title: 'Song', duration: 240, playing: true, serverElapsed: null });
        vi.advanceTimersByTime(42000);
        first.remove();
        const again = await bar({ source: 'src_airplay', title: 'Song', duration: 240, playing: true, serverElapsed: 0 });
        expect(again._elapsed).toBe(42);
    });

    it('sees that the source went back while no bar showed it', async () => {
        // MPD restarted the track while the bars showed another source: the next bar
        // remembered it at 3:00, and its first report, 0:05, was kept below it.
        const first = await bar({ source: 'src_mpd', title: 'So What', duration: 565, playing: true, serverElapsed: 178 });
        vi.advanceTimersByTime(2000);
        first.remove();
        const again = await bar({ source: 'src_mpd', title: 'So What', duration: 565, playing: true, serverElapsed: 5 });
        expect(again._elapsed).toBe(5);
    });

    it('remembers one track per source: the one it played last', async () => {
        const first = await bar({ source: 'src_roon', title: 'Track A', duration: 240, playing: true, serverElapsed: 30 });
        vi.advanceTimersByTime(2000);
        await update(first, { title: 'Track B', serverElapsed: 0 });
        vi.advanceTimersByTime(4000);
        first.remove();
        const onB = await bar({ source: 'src_roon', title: 'Track B', duration: 240, playing: true, serverElapsed: null });
        expect(onB._elapsed).toBe(4);
        onB.remove();
        const onA = await bar({ source: 'src_roon', title: 'Track A', duration: 240, playing: true, serverElapsed: 0 });
        expect(onA._elapsed).toBe(0);
    });
});
