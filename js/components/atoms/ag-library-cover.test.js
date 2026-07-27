/**
 * Unit tests for ag-library-cover.js — the `loading="lazy"` contract.
 *
 * This atom renders every cover in the app, including one per row of the playback
 * queue. The queue lives in the library tab, which is present in index.html from the
 * first paint even when another tab is active — and `display: none` does not stop an
 * <img> from downloading. A 67-track queue therefore issued 67 cover requests at
 * startup, for artwork nobody was looking at, all of it the same album.
 *
 * Measured on the deployed build (emulated phone, CPU x4, cold cache):
 *
 *   without loading="lazy"   271 network requests, 67 covers (6832 ms cumulated)
 *   with    loading="lazy"   137 network requests,  2 covers (15 ms cumulated)
 *
 * Half the startup traffic came from this one missing attribute, and the cost grows
 * with the queue length. Hence a test rather than a comment: removing the attribute
 * has no visible effect on a desktop with a warm cache, which is exactly how it got
 * shipped in the first place.
 */
import { describe, it, expect, afterEach } from 'vitest';
import './ag-library-cover.js';

/**
 * Mount the element with the given properties and wait for its first render.
 *
 * @param {object} props - Properties to assign before the element is connected.
 * @returns {Promise<HTMLElement>} The connected, rendered element.
 */
async function mount(props = {}) {
    const el = document.createElement('ag-library-cover');
    Object.assign(el, props);
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('ag-library-cover — deferred image loading', () => {
    it('marks the cover image as lazy so off-screen rows cost nothing', async () => {
        const el = await mount({ cover: '/api/audio_pipeline/cover?token=x' });
        const img = el.querySelector('img.ag-libcv-img');

        expect(img).not.toBeNull();
        expect(img.getAttribute('loading')).toBe('lazy');
    });

    it('still points at the requested cover', async () => {
        const el = await mount({ cover: '/api/audio_pipeline/cover?token=abc' });
        expect(el.querySelector('img.ag-libcv-img').getAttribute('src'))
            .toBe('/api/audio_pipeline/cover?token=abc');
    });

    it('renders no image at all when there is no cover, so nothing is requested', async () => {
        const el = await mount({ cover: '' });
        expect(el.querySelector('img.ag-libcv-img')).toBeNull();
    });

    it('drops the image once it has failed, instead of retrying on every render', async () => {
        const el = await mount({ cover: '/api/audio_pipeline/cover?token=missing' });
        el.querySelector('img.ag-libcv-img').dispatchEvent(new Event('error'));
        await el.updateComplete;

        expect(el.querySelector('img.ag-libcv-img')).toBeNull();
    });
});
