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
import { webPasswordProblem } from './ag-web-password-field.js';

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
                { packageId: 'hqplayerd', version: '5.17.2-48', webPassword: null });
        });

        it('sends no version for a package that offers no choice', async () => {
            // null means "whatever the package's own rule picks", which is what
            // every other package has always done.
            serve();
            const el = await open(MPD);
            const chosen = vi.fn();
            el.addEventListener('install-confirmed', e => chosen(e.detail));
            installButton(el).click();
            expect(chosen).toHaveBeenCalledWith({ packageId: 'mpd', version: null, webPassword: null });
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

    describe('the web interface password', () => {
        // HQPlayer Embedded's package installs its web interface with no
        // credentials; the core sets the ones chosen here right after.
        const WITH_WEB = {
            ...HQPLAYERD,
            offers_version_choice: false,
            web_credentials: { username: 'hqplayer', port: 8088, already_set: false },
        };
        const field = el => el.querySelector('ag-web-password-field .ag-pid-password');

        /** Type into the field the way a person does. */
        async function type(el, value) {
            field(el).value = value;
            field(el).dispatchEvent(new Event('input', { bubbles: true }));
            await el.updateComplete;
            await el.querySelector('ag-web-password-field').updateComplete;
        }

        it('comes prefilled with a random password, shown in clear', async () => {
            serve();
            const el = await open(WITH_WEB);
            expect(field(el).type).toBe('text');
            expect(field(el).value).toHaveLength(16);
            expect(webPasswordProblem(field(el).value)).toBeNull();
        });

        it('names the user and where to sign in', async () => {
            serve();
            const el = await open(WITH_WEB);
            const text = el.querySelector('.modal-body').textContent.replace(/\s+/g, ' ');
            expect(text).toContain('hqplayer');
            expect(text).toContain(`http://${window.location.hostname}:8088`);
        });

        it('sends the password that is in the field', async () => {
            serve();
            const el = await open(WITH_WEB);
            await type(el, 'MyOwnPass42');
            const sent = vi.fn();
            el.addEventListener('install-confirmed', e => sent(e.detail));
            installButton(el).click();
            expect(sent).toHaveBeenCalledWith(
                { packageId: 'hqplayerd', version: null, webPassword: 'MyOwnPass42' });
        });

        it('keeps Install out of reach while the password is unusable, and says why', async () => {
            serve();
            const el = await open(WITH_WEB);
            await type(el, 'short');
            expect(installButton(el).disabled).toBe(true);
            expect(el.querySelector('.ag-pid-warning').textContent).toContain('at least 8');
        });

        it('asks for nothing when the box already has credentials', async () => {
            // A reinstall keeps them; asking would promise a change that does not happen.
            serve();
            const el = await open({
                ...WITH_WEB, web_credentials: { ...WITH_WEB.web_credentials, already_set: true },
            });
            expect(field(el)).toBeNull();
            expect(el.querySelector('.modal-body').textContent).toContain('it is kept');
            const sent = vi.fn();
            el.addEventListener('install-confirmed', e => sent(e.detail));
            installButton(el).click();
            expect(sent.mock.calls[0][0].webPassword).toBeNull();
        });

        it('draws a new one each time it opens', async () => {
            serve();
            const el = await open(WITH_WEB);
            const first = field(el).value;
            el.show = false;
            await el.updateComplete;
            expect(el._webPassword).toBe('');
            // The same waits as open(): the dialog reloads, then the modal renders.
            el.show = true;
            await el.updateComplete;
            await Promise.resolve();
            await Promise.resolve();
            await el.updateComplete;
            // The field is an element of its own, drawn in its own update.
            await el.querySelector('ag-web-password-field').updateComplete;
            expect(field(el).value).toHaveLength(16);
            expect(field(el).value).not.toBe(first);
        });

        it('is not asked for a package without a web interface', async () => {
            serve();
            const el = await open(MPD);
            expect(field(el)).toBeNull();
        });
    });

    it('keeps its buttons in the footer, out of the part that scrolls', async () => {
        // A licence makes the body taller than a laptop screen, and the body is
        // what scrolls: buttons at its foot scrolled out of sight with it.
        serve({ notices: [LICENCE], versions: [{ major: 6, version: '6.0.2-3' }] });
        const el = await open(HQPLAYERD);
        const footer = el.querySelector('.modal-footer');
        expect(footer.contains(installButton(el))).toBe(true);
        expect([...footer.querySelectorAll('button')].map(b => b.textContent.trim()))
            .toEqual(['Cancel', 'Install 6.0.2-3']);
        expect(el.querySelector('.modal-body button')).toBeNull();
    });
});
