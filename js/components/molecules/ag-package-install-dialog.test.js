/**
 * Unit tests for ag-package-install-dialog.js.
 *
 * The dialog exists because a noninteractive install skips the vendor's
 * licence: both Signalyst packages ship a full EULA as a debconf note, and
 * until now it was accepted by someone who was never shown it. It also carries
 * the version choice: only the operator knows which line their licence covers.
 *
 * So the two things worth guarding are: Install must not be reachable before
 * the terms are accepted, and the version that leaves in the event must be the
 * one selected on screen.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const apiGet = vi.fn();
vi.mock('../../api.js', () => ({ apiGet: (...args) => apiGet(...args) }));

import './ag-package-install-dialog.js';

const LICENCE = { title: 'HQPlayer License', body: 'HQPlayer End User License Agreement' };

const HQPLAYERD = {
    id: 'hqplayerd',
    label: 'HQPlayer Embedded',
    installed_version: null,
    offers_version_choice: true,
};

const MPD = { id: 'mpd', label: 'MPD', installed_version: null, offers_version_choice: false };

/** Answer the two routes the dialog reads. */
function serve({ notices = [], versions = [], unavailable = [], readable = true, fail = null } = {}) {
    apiGet.mockImplementation(async (path) => {
        if (fail && path.includes(fail)) throw new Error('unreachable');
        if (path.endsWith('/notices')) return { package_id: 'x', readable, notices };
        if (path.endsWith('/versions')) {
            return { package_id: 'x', offers_choice: true, versions, unavailable };
        }
        throw new Error('unexpected ' + path);
    });
}

/**
 * Mount the dialog and open it.
 * @param {Object} pkg - The package being installed.
 * @returns {Promise<HTMLElement>} The element, once its data has loaded.
 */
async function open(pkg) {
    const el = document.createElement('ag-package-install-dialog');
    el.pkg = pkg;
    document.body.appendChild(el);
    await el.updateComplete;
    el.show = true;
    await el.updateComplete;
    await Promise.resolve();
    await Promise.resolve();
    await el.updateComplete;
    return el;
}

/** The Install button, found by its label rather than by position. */
function installButton(el) {
    return [...el.querySelectorAll('button')].find(b => b.textContent.includes('Install'));
}

describe('ag-package-install-dialog', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        apiGet.mockReset();
    });

    describe('what it asks the core for', () => {
        it('reads the notices of any package', async () => {
            serve();
            await open(MPD);
            expect(apiGet).toHaveBeenCalledWith('/packages/mpd/notices');
        });

        it('does not ask for versions when the package offers no choice', async () => {
            // There is nothing to choose, and asking costs a request to a vendor.
            serve();
            await open(MPD);
            expect(apiGet).not.toHaveBeenCalledWith('/packages/mpd/versions');
        });

        it('asks for versions when the package offers the choice', async () => {
            serve({ versions: [{ major: 6, version: '6.0.2-3' }] });
            await open(HQPLAYERD);
            expect(apiGet).toHaveBeenCalledWith('/packages/hqplayerd/versions');
        });
    });

    describe('accepting the licence', () => {
        it('keeps Install out of reach until the terms are accepted', async () => {
            serve({ notices: [LICENCE] });
            const el = await open(HQPLAYERD);
            expect(installButton(el).disabled).toBe(true);
        });

        it('allows Install once they are', async () => {
            serve({ notices: [LICENCE] });
            const el = await open(HQPLAYERD);
            el.querySelector('.ag-pid-agree input').click();
            await el.updateComplete;
            expect(installButton(el).disabled).toBe(false);
        });

        it('asks for nothing when the package ships no notice', async () => {
            serve({ notices: [] });
            const el = await open(MPD);
            expect(el.querySelector('.ag-pid-agree')).toBeNull();
            expect(installButton(el).disabled).toBe(false);
        });

        it('shows the licence text it was given', async () => {
            serve({ notices: [LICENCE] });
            const el = await open(HQPLAYERD);
            expect(el.querySelector('.ag-pid-notice').textContent)
                .toContain('End User License Agreement');
        });

        it('forgets an acceptance when it closes', async () => {
            // Otherwise one package's agreement would carry over to the next.
            serve({ notices: [LICENCE] });
            const el = await open(HQPLAYERD);
            el.querySelector('.ag-pid-agree input').click();
            await el.updateComplete;
            el.show = false;
            await el.updateComplete;
            expect(el._accepted).toBe(false);
        });
    });

    describe('choosing a version', () => {
        const TWO_LINES = [
            { major: 6, version: '6.0.2-3' },
            { major: 5, version: '5.17.2-48' },
        ];

        it('preselects the newest line when nothing is installed', async () => {
            serve({ versions: TWO_LINES });
            const el = await open(HQPLAYERD);
            expect(el._chosen).toBe('6.0.2-3');
        });

        it('preselects the line already installed', async () => {
            // Someone running 5 almost certainly holds a licence for 5;
            // preselecting 6 would invite the mistake this chooser prevents.
            serve({ versions: TWO_LINES });
            const el = await open({ ...HQPLAYERD, installed_version: '5.17.2-48' });
            expect(el._chosen).toBe('5.17.2-48');
        });

        it('reads the major through a Debian epoch', async () => {
            serve({ versions: TWO_LINES });
            const el = await open({ ...HQPLAYERD, installed_version: '1:5.16.1-45.2' });
            expect(el._chosen).toBe('5.17.2-48');
        });

        it('falls back to the newest when the installed line is gone', async () => {
            serve({ versions: [{ major: 6, version: '6.0.2-3' }] });
            const el = await open({ ...HQPLAYERD, installed_version: '5.17.2-48' });
            expect(el._chosen).toBe('6.0.2-3');
        });

        it('sends the version that is selected', async () => {
            serve({ versions: TWO_LINES });
            const el = await open(HQPLAYERD);
            const chosen = vi.fn();
            el.addEventListener('install-confirmed', e => chosen(e.detail));
            el.querySelectorAll('.ag-pid-choice input')[1].dispatchEvent(
                new Event('change', { bubbles: true }));
            await el.updateComplete;
            installButton(el).click();
            expect(chosen).toHaveBeenCalledWith(
                { packageId: 'hqplayerd', version: '5.17.2-48' });
        });

        it('sends no version for a package that offers no choice', async () => {
            // null means "whatever the package's own rule picks", which is what
            // every other package has always done.
            serve();
            const el = await open(MPD);
            const chosen = vi.fn();
            el.addEventListener('install-confirmed', e => chosen(e.detail));
            installButton(el).click();
            expect(chosen).toHaveBeenCalledWith({ packageId: 'mpd', version: null });
        });

        it('names the chosen version on the button', async () => {
            serve({ versions: TWO_LINES });
            const el = await open(HQPLAYERD);
            expect(installButton(el).textContent).toContain('6.0.2-3');
        });
    });

    describe('when the terms cannot be read', () => {
        // Unreadable is not "nothing to accept". Treating it so left Install
        // live with no licence on screen — and a test here used to lock that in.

        it('says the terms could not be read', async () => {
            serve({ readable: false });
            const el = await open(HQPLAYERD);
            expect(el.querySelector('.ag-pid-warning').textContent)
                .toContain('could not be read');
        });

        it('still asks for acceptance before Install', async () => {
            serve({ readable: false });
            const el = await open(HQPLAYERD);
            expect(installButton(el).disabled).toBe(true);
            el.querySelector('.ag-pid-agree input').click();
            await el.updateComplete;
            expect(installButton(el).disabled).toBe(false);
        });

        it('treats a request that failed outright the same way', async () => {
            serve({ fail: '/notices' });
            const el = await open(HQPLAYERD);
            expect(installButton(el).disabled).toBe(true);
            expect(el.querySelector('.ag-pid-agree')).not.toBeNull();
        });

        it('points at where the vendor publishes them', async () => {
            serve({ readable: false });
            const el = await open({ ...HQPLAYERD, doc_url: 'https://signalyst.com/' });
            expect(el.querySelector('.ag-pid-warning a').getAttribute('href'))
                .toBe('https://signalyst.com/');
        });
    });

    describe('lines this box cannot install', () => {
        it('names them with what they lack', async () => {
            // Measured on Debian 13: HQPlayer Embedded 5.17.2-48 needs libgmpris.
            serve({
                versions: [{ major: 6, version: '6.0.2-3', missing: [] }],
                unavailable: [{ major: 5, version: '5.17.2-48', missing: ['libgmpris'] }],
            });
            const el = await open(HQPLAYERD);
            const note = el.querySelector('.ag-pid-unavailable').textContent;
            expect(note).toContain('5.17.2-48');
            expect(note).toContain('libgmpris');
        });

        it('does not offer them as a choice', async () => {
            serve({
                versions: [{ major: 6, version: '6.0.2-3', missing: [] }],
                unavailable: [{ major: 5, version: '5.17.2-48', missing: ['libgmpris'] }],
            });
            const el = await open(HQPLAYERD);
            const offered = [...el.querySelectorAll('.ag-pid-choice input')].map(i => i.value);
            expect(offered).toEqual(['6.0.2-3']);
        });
    });

    describe('when the version list cannot be fetched', () => {
        it('says so', async () => {
            serve({ fail: '/versions' });
            const el = await open(HQPLAYERD);
            const text = el.querySelector('.ag-pid-warning').textContent.replace(/\s+/g, ' ');
            expect(text).toContain('cannot be listed');
        });
    });

    it('dismisses without installing', async () => {
        serve({ notices: [LICENCE] });
        const el = await open(HQPLAYERD);
        const closed = vi.fn();
        const installed = vi.fn();
        el.addEventListener('modal-close', closed);
        el.addEventListener('install-confirmed', installed);
        [...el.querySelectorAll('button')]
            .find(b => b.textContent.includes('Cancel')).click();
        expect(closed).toHaveBeenCalled();
        expect(installed).not.toHaveBeenCalled();
    });
});
