/**
 * Tests for ag-library-stats and ag-stats-recording — the listening history's view.
 *
 * Rendered for real, the core's routes faked (js/listening-api.js). Pinned:
 * - with Pro, the view reads the summary when it is shown, and only then; another period
 *   reads its own, and an older answer never replaces a newer one;
 * - on a Starter box it reads nothing the core would refuse: the padlock stands in for the
 *   figures, and the recording's switch and erase stay — the box records there too;
 * - the recording switch writes, goes back when refused, and the erase asks first.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const api = vi.hoisted(() => ({
    listeningSummary: vi.fn(),
    listeningSettings: vi.fn(),
    setListeningRecording: vi.fn(),
    clearListeningHistory: vi.fn(),
}));
const ui = vi.hoisted(() => ({ showConfirm: vi.fn(), showToast: vi.fn() }));
const calls = vi.hoisted(() => []);

// The core's routes, as js/listening-api.js reaches them: its addresses are tested too.
vi.mock('../../api.js', () => ({
    apiGet: (url) => {
        calls.push(['GET', url]);
        const period = url.match(/^\/listening\/summary\?period=(\w+)$/);
        if (period) return api.listeningSummary(period[1]);
        if (url === '/listening/settings') return api.listeningSettings();
        throw new Error(`unexpected GET ${url}`);
    },
    apiPut: (url, body) => {
        calls.push(['PUT', url, body]);
        if (url === '/listening/settings') return api.setListeningRecording(body.recording);
        throw new Error(`unexpected PUT ${url}`);
    },
    apiDelete: (url) => {
        calls.push(['DELETE', url]);
        if (url === '/listening/history') return api.clearListeningHistory();
        throw new Error(`unexpected DELETE ${url}`);
    },
}));
vi.mock('../../ui-helpers.js', () => ui);

import { setLicense } from '../../license-tiers.js';
import './ag-library-stats.js';
import { genreRows } from './ag-library-stats.js';

const PRO = { status: 'lifetime', pro: true };
const STARTER = { status: 'starter', pro: false };

function summary(period = '30d', extra = {}) {
    return {
        period, unit: period === '12m' || period === 'all' ? 'month' : 'day', recording: true,
        since: '2026-09-17', total_seconds: 7200, listens: 30, albums: 4, active_days: 3, days: 30,
        buckets: [{ start: '2026-10-15', seconds: 3600 }, { start: '2026-10-16', seconds: 3600 }],
        sources: [{ label: 'Qobuz', seconds: 7200 }], outputs: [{ label: 'Heed Abacus', seconds: 7200 }],
        quality: [{ key: 'dsd', seconds: 0 }, { key: 'hires', seconds: 7200 }, { key: 'cd', seconds: 0 },
                  { key: 'lossy', seconds: 0 }],
        genres: [{ label: 'Jazz', seconds: 6000, kind: 'genre' }, { label: null, seconds: 1200, kind: 'unknown' }],
        top_artists: [{ artist: 'Miles Davis', seconds: 7200, plays: 30 }], top_albums: [], top_tracks: [],
        recent: [{ started_at: new Date().toISOString(), seconds: 300, title: 'So What', live: false }],
        ...extra,
    };
}

async function mount(visible = true) {
    const el = document.createElement('ag-library-stats');
    el.visible = visible;
    document.body.appendChild(el);
    await el.updateComplete;
    await new Promise(r => setTimeout(r, 0));
    await el.updateComplete;
    return el;
}

beforeEach(() => {
    calls.length = 0;
    Object.values(api).forEach(fn => fn.mockReset());
    Object.values(ui).forEach(fn => fn.mockReset());
    api.listeningSummary.mockImplementation(async (period) => summary(period));
    api.listeningSettings.mockResolvedValue({ recording: true, listens: 30, since: '2026-09-17' });
});

afterEach(() => {
    document.body.innerHTML = '';
    setLicense(null);
});

describe('ag-library-stats — with Pro', () => {
    beforeEach(() => setLicense(PRO));

    it('reads the summary of 30 days when shown, and draws its sections', async () => {
        const el = await mount();
        expect(api.listeningSummary).toHaveBeenCalledExactlyOnceWith('30d');
        const headings = [...el.querySelectorAll('.lib-stats-heading')].map(h => h.textContent);
        expect(headings).toEqual(['Listening time', 'By source', 'By output', 'Sound quality',
                                  'Genres', 'Most played', 'Recently played', 'Recording']);
        expect(el.textContent).toContain('Roon and HQPlayer are not counted yet.');
        expect(el.textContent).toContain('Unknown: AirPlay and some streams carry no genre.');
    });

    it('asks the routes of the history, and nothing else', async () => {
        await mount();
        expect(calls).toEqual(expect.arrayContaining([['GET', '/listening/summary?period=30d'],
                                                      ['GET', '/listening/settings']]));
        expect(calls.every(([, url]) => url.startsWith('/listening/'))).toBe(true);
    });

    it('reads nothing while hidden, its settings included', async () => {
        await mount(false);
        expect(api.listeningSummary).not.toHaveBeenCalled();
        expect(api.listeningSettings).not.toHaveBeenCalled();
    });

    it('another period reads its own summary', async () => {
        const el = await mount();
        el.querySelector('.lib-stats > .lib-stats-selector ag-filter-bar')
            .dispatchEvent(new CustomEvent('filter-change', { detail: { value: '12m' } }));
        await new Promise(r => setTimeout(r, 0));
        await el.updateComplete;
        expect(api.listeningSummary).toHaveBeenLastCalledWith('12m');
        expect(el.querySelector('ag-stats-headline').caption).toBe('in the last 12 months');
    });

    it('an older answer never replaces a newer one', async () => {
        let releaseOld;
        api.listeningSummary.mockImplementationOnce(() => new Promise(r => { releaseOld = r; }));
        const el = await mount();
        el._onPeriod({ detail: { value: '7d' } });
        await new Promise(r => setTimeout(r, 0));
        releaseOld(summary('30d'));
        await new Promise(r => setTimeout(r, 0));
        await el.updateComplete;
        expect(el._summary.period).toBe('7d');
        expect(el._loading).toBe(false);
    });

    it('a period with nothing says so, and keeps the switch', async () => {
        api.listeningSummary.mockResolvedValue(summary('30d', { listens: 0, total_seconds: 0, recent: [] }));
        const el = await mount();
        expect(el.querySelector('.lib-stats-empty').textContent).toContain('Nothing recorded yet');
        expect(el.querySelector('ag-stats-recording')).not.toBeNull();
    });

    it('a refused read is said, not drawn as an empty history', async () => {
        api.listeningSummary.mockRejectedValue({ detail: 'Full license required.' });
        const el = await mount();
        expect(el.textContent).toContain('Full license required.');
    });

    it('the switch or the erase reads the summary again', async () => {
        const el = await mount();
        el.querySelector('ag-stats-recording').dispatchEvent(new CustomEvent('listening-changed', { bubbles: true }));
        await new Promise(r => setTimeout(r, 0));
        expect(api.listeningSummary).toHaveBeenCalledTimes(2);
    });

    it('says at the top when the recording is off, and leads to the switch', async () => {
        api.listeningSummary.mockImplementation(async (period) => summary(period, { recording: false }));
        const el = await mount();
        const notice = el.querySelector('.lib-stats-off');
        expect(notice.textContent).toContain('Recording is off');
        // At the top: before the period's selector and every figure.
        expect(notice.compareDocumentPosition(el.querySelector('.lib-stats-selector'))
            & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        notice.querySelector('button').click();
        expect(document.activeElement).toBe(el.querySelector('ag-stats-recording ag-switch input'));
    });

    it('says nothing while the box records', async () => {
        const el = await mount();
        expect(el.querySelector('.lib-stats-off')).toBeNull();
    });

    it('the genres that name nothing are named and greyed', () => {
        expect(genreRows([{ label: 'Jazz', seconds: 1, kind: 'genre' }, { label: null, seconds: 2, kind: 'other' },
                          { label: null, seconds: 3, kind: 'unknown' }]))
            .toEqual([{ label: 'Jazz', seconds: 1, muted: false }, { label: 'Other', seconds: 2, muted: true },
                      { label: 'Unknown', seconds: 3, muted: true }]);
    });
});

describe('ag-library-stats — on a Starter box', () => {
    beforeEach(() => setLicense(STARTER));

    it('reads no summary, shows the padlock, and keeps the recording', async () => {
        const el = await mount();
        expect(api.listeningSummary).not.toHaveBeenCalled();
        expect(el.querySelector('ag-pro-lock-card')).not.toBeNull();
        expect(el.querySelector('ag-stats-recording')).not.toBeNull();
        expect(el.querySelector('ag-stats-bars')).toBeNull();
    });

    it('reads the summary as soon as a licence opens Pro', async () => {
        const el = await mount();
        setLicense(PRO);
        await new Promise(r => setTimeout(r, 0));
        await el.updateComplete;
        expect(api.listeningSummary).toHaveBeenCalledWith('30d');
    });
});

describe('ag-library-stats — before the licence is read', () => {
    it('reads nothing and shows no padlock', async () => {
        setLicense(null);
        const el = await mount();
        expect(api.listeningSummary).not.toHaveBeenCalled();
        expect(el.querySelector('ag-pro-lock-card')).toBeNull();
    });
});

describe('ag-stats-recording', () => {
    beforeEach(() => setLicense(STARTER));

    async function recording() {
        const el = document.createElement('ag-stats-recording');
        el.visible = true;
        document.body.appendChild(el);
        await el.updateComplete;
        await new Promise(r => setTimeout(r, 0));
        await el.updateComplete;
        return el;
    }

    it('shows the switch as the core has it, with what the history holds', async () => {
        api.listeningSettings.mockResolvedValue({ recording: false, listens: 2, since: '2026-09-17' });
        const el = await recording();
        expect(el.querySelector('ag-switch').checked).toBe(false);
        expect(el.querySelector('ag-switch').label).toBe('Keep a history of what plays');
        expect(el.textContent).toContain('2 listens since');
    });

    it('switching writes, and announces it', async () => {
        api.setListeningRecording.mockResolvedValue({ recording: false, listens: 30, since: '2026-09-17' });
        const el = await recording();
        const heard = vi.fn();
        el.addEventListener('listening-changed', heard);
        el.querySelector('ag-switch').dispatchEvent(new CustomEvent('ag-change', { detail: { checked: false } }));
        await new Promise(r => setTimeout(r, 0));
        expect(api.setListeningRecording).toHaveBeenCalledWith(false);
        expect(calls).toContainEqual(['PUT', '/listening/settings', { recording: false }]);
        expect(heard).toHaveBeenCalledOnce();
        expect(el._settings.recording).toBe(false);
    });

    it('a refused switch goes back, and says why — tapped for real', async () => {
        // The switch flips itself on a tap: rebinding the same value left it where tapped,
        // and an event sent without flipping it hid that (review, 2026-10-16).
        api.setListeningRecording.mockRejectedValue({ detail: 'Guests cannot change this.' });
        const el = await recording();
        const input = el.querySelector('ag-switch input');
        input.click();
        await new Promise(r => setTimeout(r, 0));
        await el.updateComplete;
        await el.querySelector('ag-switch').updateComplete;
        expect(api.setListeningRecording).toHaveBeenCalledWith(false);
        expect(el.querySelector('ag-switch').checked).toBe(true);
        expect(input.checked).toBe(true);
        expect(ui.showToast).toHaveBeenCalledWith('error', 'Recording', 'Guests cannot change this.');
    });

    it('reads nothing while its view is hidden, and reads again each time it is shown', async () => {
        const el = document.createElement('ag-stats-recording');
        document.body.appendChild(el);
        await new Promise(r => setTimeout(r, 0));
        expect(api.listeningSettings).not.toHaveBeenCalled();
        el.visible = true;
        await new Promise(r => setTimeout(r, 0));
        expect(api.listeningSettings).toHaveBeenCalledOnce();
        el.visible = false;
        await el.updateComplete;
        el.visible = true;
        await new Promise(r => setTimeout(r, 0));
        expect(api.listeningSettings).toHaveBeenCalledTimes(2);
    });

    it('the erase asks first, and does nothing when cancelled', async () => {
        ui.showConfirm.mockResolvedValue(false);
        const el = await recording();
        el.querySelector('button.action-btn').click();
        await new Promise(r => setTimeout(r, 0));
        expect(ui.showConfirm).toHaveBeenCalledOnce();
        expect(ui.showConfirm.mock.calls[0][2]).toMatchObject({ destructive: true });
        expect(api.clearListeningHistory).not.toHaveBeenCalled();
    });

    it('confirmed, it erases, reads the settings again and announces it', async () => {
        ui.showConfirm.mockResolvedValue(true);
        api.clearListeningHistory.mockResolvedValue(null);
        const el = await recording();
        api.listeningSettings.mockResolvedValue({ recording: true, listens: 0, since: null });
        const heard = vi.fn();
        el.addEventListener('listening-changed', heard);
        el.querySelector('button.action-btn').click();
        await new Promise(r => setTimeout(r, 0));
        await new Promise(r => setTimeout(r, 0));
        expect(api.clearListeningHistory).toHaveBeenCalledOnce();
        expect(calls).toContainEqual(['DELETE', '/listening/history']);
        expect(heard).toHaveBeenCalledOnce();
        expect(el._settings.listens).toBe(0);
        await el.updateComplete;
        expect(el.querySelector('button.action-btn').getAttribute('aria-disabled')).toBe('true');
    });

    it('an empty history has nothing to erase', async () => {
        api.listeningSettings.mockResolvedValue({ recording: true, listens: 0, since: null });
        const el = await recording();
        el.querySelector('button.action-btn').click();
        await new Promise(r => setTimeout(r, 0));
        expect(ui.showConfirm).not.toHaveBeenCalled();
    });
});
