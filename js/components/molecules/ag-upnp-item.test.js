/**
 * Unit tests for ag-upnp-item.js — a row of the UPnP server browser.
 *
 * Two things seen on an iPhone, in MinimServer's "[untagged]" (user, 2026-11-11): a
 * track the server sent without artwork showed a disc where the player shows a music
 * note, and the Play and "+" buttons touched. The picture is decided by the kind of
 * entry, the spacing by the row's stylesheet; both are tested here.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readStylesheet, cssRuleBody } from '../../test-utils.js';
import { upnpFallback } from './ag-upnp-item.js';

/** The `d` of the stem of Lucide's music note, as drawn by ag-library-cover. */
const NOTE_STEM = 'M9 18V5l12-2v13';

describe('upnpFallback — the kind of entry named to the cover', () => {
    it('names a track a track', () => {
        expect(upnpFallback({ hint: 'item', upnp_class: 'object.item.audioItem.musicTrack' })).toBe('track');
    });

    it('names an album an album, so a coverless one gets the note and not the folder', () => {
        expect(upnpFallback({ hint: 'container', upnp_class: 'object.container.album.musicAlbum' }))
            .toBe('album');
        expect(upnpFallback({ hint: 'container', upnp_class: 'object.container.album' })).toBe('album');
    });

    it('keeps a photo album a folder: it holds no music', () => {
        // A NAS that also shares pictures lists them: they hold no music.
        expect(upnpFallback({ hint: 'container', upnp_class: 'object.container.album.photoAlbum' }))
            .toBe('container');
    });

    it('names a playlist a playlist', () => {
        expect(upnpFallback({ hint: 'container', upnp_class: 'object.container.playlistContainer' }))
            .toBe('playlist');
    });

    it('keeps the folder for what is opened rather than played', () => {
        // MinimServer's own root holds these: "[folder view]", "Artist", "Genre"…
        for (const upnp_class of [
            'object.container',
            'object.container.storageFolder',
            'object.container.person.musicArtist',
            'object.container.genre.musicGenre',
        ]) {
            expect(upnpFallback({ hint: 'container', upnp_class })).toBe('container');
        }
    });

    it('keeps the folder for a container whose class the server left out', () => {
        expect(upnpFallback({ hint: 'container' })).toBe('container');
        expect(upnpFallback({ hint: 'container', upnp_class: '' })).toBe('container');
    });

    it('goes by the hint first: an entry that is not a container is a track', () => {
        expect(upnpFallback({ hint: 'item' })).toBe('track');
        expect(upnpFallback({})).toBe('track');
    });
});

describe('ag-upnp-item — a row on screen', () => {
    /**
     * Mount a row and wait for it and its cover to render.
     *
     * @param {object} item - A UPnP browse entry.
     * @returns {Promise<HTMLElement>} The connected, rendered row.
     */
    async function mount(item) {
        const el = document.createElement('ag-upnp-item');
        el.item = item;
        document.body.appendChild(el);
        await el.updateComplete;
        await el.querySelector('ag-library-cover')?.updateComplete;
        return el;
    }

    afterEach(() => { document.body.innerHTML = ''; });

    /** An untagged WAV, as MinimServer's "[untagged]" lists it: no artwork, no artist. */
    const untaggedTrack = {
        id: '0$untagged$*i19',
        title: '01 PRINCE - Breakfast Can Wait (Original).wav',
        subtitle: null,
        hint: 'item',
        res: 'http://10.0.0.42:9790/minimserver/*/01_musics/03_wav/track.wav',
        art_uri: null,
        cover_token: null,
        upnp_class: 'object.item.audioItem.musicTrack',
    };

    it('draws the music note behind a track sent without artwork', async () => {
        const cover = (await mount(untaggedTrack)).querySelector('ag-library-cover');

        expect(cover.getAttribute('fallback')).toBe('track');
        expect(cover.querySelector('.ag-libcv-icon path').getAttribute('d')).toBe(NOTE_STEM);
    });

    it('draws the music note behind an album sent without artwork', async () => {
        const cover = (await mount({
            id: '0$albums$*a1', title: 'Animals', hint: 'container', res: null, art_uri: null,
            cover_token: null, upnp_class: 'object.container.album.musicAlbum',
        })).querySelector('ag-library-cover');

        expect(cover.querySelector('.ag-libcv-icon path').getAttribute('d')).toBe(NOTE_STEM);
    });

    it('offers Play, then Add to queue drawn as the library\'s "+"', async () => {
        const buttons = [...(await mount(untaggedTrack)).querySelectorAll('.lib-browser-right button')];

        expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Play', 'Add to queue']);
        // Lucide plus: the same two strokes as ag-library-add-btn, the "+" of every other row.
        expect([...buttons[1].querySelectorAll('path')].map((p) => p.getAttribute('d')))
            .toEqual(['M5 12h14', 'M12 5v14']);
    });
});

describe('ag-upnp-item — the space between Play and "+"', () => {
    it('puts the other library rows\' gap between the buttons of a row', () => {
        // Both buttons carry a border: without a gap they touched and read as one.
        const browser = readStylesheet('css', 'components', 'library-browser.css');
        const rows = readStylesheet('css', 'components', 'library-list-row.css');

        expect(cssRuleBody(browser, '.lib-browser-right')).toMatch(/gap:\s*var\(--spacing-sm\)/);
        expect(cssRuleBody(rows, '.lib-lr-actions')).toMatch(/gap:\s*var\(--spacing-sm\)/);
    });
});
