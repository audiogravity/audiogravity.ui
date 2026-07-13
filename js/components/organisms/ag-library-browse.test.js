/**
 * Unit tests for ag-library-browse.js — the artist drill-down fetch path.
 * Logic-only (no DOM mount): lit and the component's imports are mocked so the
 * class imports cleanly, then _fetchPage / _sectionLabel are exercised on a bare
 * instance. Artist mode must bypass the per-source pill routing and hit
 * /library/albums?artist_id=… for every source.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class {},
    html: (strings, ...values) => ({ strings, values }),
    nothing: null,
}));
const apiGetMock = vi.fn();
vi.mock('../../api.js', () => ({ apiGet: (...args) => apiGetMock(...args) }));
vi.mock('../utils-lit.js', () => ({ coverUrl: () => '', loadWithState: vi.fn() }));
vi.mock('../../library-api.js', () => ({ queueItem: vi.fn(), queueWithFeedback: vi.fn() }));
vi.mock('../../library-store.js', () => ({
    getFavoriteAlbumIds: vi.fn().mockResolvedValue(new Set()),
    setAlbumFavorited: vi.fn(),
    subscribeFavorites: vi.fn(() => () => {}),
}));
vi.mock('../../ui-helpers.js', () => ({ showToast: vi.fn() }));
vi.mock('../atoms/ag-library-cover.js', () => ({}));
vi.mock('../atoms/ag-library-add-btn.js', () => ({}));
vi.mock('../atoms/ag-library-fav-btn.js', () => ({}));
vi.mock('../molecules/ag-library-list-row.js', () => ({}));

import { AgLibraryBrowse } from './ag-library-browse.js';

function makeEl(overrides = {}) {
    return Object.assign(Object.create(AgLibraryBrowse.prototype), {
        sourceId: 'src_qobuz', zoneId: '', artistId: '', artistName: '', ...overrides,
    });
}

describe('ag-library-browse — artist drill-down', () => {
    beforeEach(() => apiGetMock.mockReset());

    it('_fetchPage hits /library/albums?artist_id=… when an artist is set', async () => {
        apiGetMock.mockResolvedValue([]);
        await makeEl({ sourceId: 'src_qobuz', artistId: '12345' })._fetchPage(0);
        const url = apiGetMock.mock.calls[0][0];
        expect(url).toContain('/library/albums?');
        expect(url).toContain('source_id=src_qobuz');
        expect(url).toContain('artist_id=12345');
    });

    it('_fetchPage bypasses the streaming pill routing in artist mode (Tidal)', async () => {
        apiGetMock.mockResolvedValue([]);
        await makeEl({ sourceId: 'src_tidal', artistId: '999' })._fetchPage(0);
        // Generic albums endpoint, not the Tidal favorites/featured routing.
        expect(apiGetMock.mock.calls[0][0]).toContain('artist_id=999');
    });

    it('_fetchPage carries the name-as-id for HRA (name-based backend)', async () => {
        apiGetMock.mockResolvedValue([]);
        await makeEl({ sourceId: 'src_highresaudio', artistId: 'Miles Davis' })._fetchPage(0);
        // URLSearchParams encodes the space as '+'; the name round-trips as artist_id.
        expect(apiGetMock.mock.calls[0][0]).toContain('artist_id=Miles+Davis');
    });

    it('_sectionLabel shows "Albums by <name>" in artist mode', () => {
        expect(makeEl({ artistId: 'Miles Davis', artistName: 'Miles Davis' })._sectionLabel)
            .toBe('Albums by Miles Davis');
    });

    it('_sectionLabel falls back to "artist" when the name is missing', () => {
        expect(makeEl({ artistId: 'x', artistName: '' })._sectionLabel).toBe('Albums by artist');
    });
});
