/**
 * Unit tests for ag-audio-software-page.js.
 *
 * Covers, among the rest: the bulk-update confirmation is a Lit template, so a
 * package's label and version strings — vendor text — are shown as text, never
 * read as markup.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'lit';

const session = vi.hoisted(() => ({ admin: true }));

// Partial: common.js calls initAuth as it loads, so the real module must stay.
vi.mock(import('../../auth.js'), async (importOriginal) => ({
    ...(await importOriginal()),
    isGuest: () => false,
    isAdmin: () => session.admin,
    // common.js gates its own module load on this and throws otherwise, so a
    // test that imports the component has to be logged in.
    requireAuth: () => true,
}));

import { AgAudioSoftwarePage } from './ag-audio-software-page.js';
import { updateDecision } from '../molecules/ag-package-card.js';

describe('Bulk-update confirm dialog — vendor text is shown as text', () => {
    afterEach(() => { delete window.showConfirm; });

    /** Run Update All on ``packages``; return the confirmation it asked, rendered. */
    async function asked(packages) {
        window.showConfirm = vi.fn().mockResolvedValue(false);
        const page = Object.create(AgAudioSoftwarePage.prototype);
        // An own value, past Lit's reactive setter: no element was constructed to update.
        Object.defineProperty(page, 'packages', { value: packages });
        await page._handleUpdateAll();
        const box = document.createElement('div');
        render(window.showConfirm.mock.calls[0][1], box);
        return box;
    }

    it('shows a malicious label as text', async () => {
        const box = await asked([{
            id: 'evil', label: '<img src=x onerror=alert(1)>', installed_version: '1.0', available_version: '2.0',
        }]);
        expect(box.querySelector('img')).toBeNull();
        expect(box.querySelector('strong').textContent).toBe('<img src=x onerror=alert(1)>');
    });

    it('shows malicious version strings as text', async () => {
        const box = await asked([{
            id: 'pkg', label: 'Safe Package', installed_version: '1.0<script>', available_version: '2.0</script>',
        }]);
        expect(box.querySelector('script')).toBeNull();
        expect(box.querySelector('.package-version-info').textContent).toBe('1.0<script> → 2.0</script>');
    });

    it('lists a normal package as it is named', async () => {
        const box = await asked([{
            id: 'mpd', label: 'Music Player Daemon', installed_version: '0.23.12', available_version: '0.23.15',
        }]);
        expect(box.textContent).toContain('The following 1 packages will be updated:');
        expect(box.querySelector('strong').textContent).toBe('Music Player Daemon');
        expect(box.querySelector('.package-version-info').textContent).toBe('0.23.12 → 0.23.15');
    });
});

describe('Single-package confirmation — vendor text is plain text', () => {
    afterEach(() => { document.querySelectorAll('ag-confirm-dialog').forEach((d) => d.remove()); });

    it('names the package and its versions as they are, through the real dialog', async () => {
        // Escaped here, `&lt;` would show: showConfirm displays a string as text.
        const page = Object.create(AgAudioSoftwarePage.prototype);
        Object.defineProperty(page, 'packages', { value: [{
            id: 'p', label: '<b>x</b>', installed_version: '1.0', available_version: '2<i>',
            installer_type: 'apt_deb', service_id: 'mpd',
        }] });
        const asked = page._handleAction({ detail: { packageId: 'p', action: 'update' } });
        await Promise.resolve();
        const dialog = document.querySelector('ag-confirm-dialog');
        const box = document.createElement('div');
        render(dialog.messageTemplate, box);
        expect(box.textContent).toBe(
            'Update <b>x</b> from version 1.0 to 2<i>? This restarts <b>x</b> — anything playing through it will stop.');
        expect(box.querySelector('b, i')).toBeNull();
        dialog.dispatchEvent(new CustomEvent('dialog-cancel'));
        await asked;
    });
});

/**
 * The update path for a package whose vendor publishes no version.
 *
 * Roon's installer points at a fixed filename and ships no version file, so
 * there is nothing to compare against. Refusing on that basis left Roon with no
 * way to update from the interface at all — on a real box, stuck on a build
 * from years back. "Update" there means re-running the vendor's installer,
 * which always fetches the current build.
 *
 * Exercises the shipped decision — the card offers UPDATE on it, and the page
 * words its confirmation on it: a local re-implementation would keep passing
 * while the shipped decision drifted away from it.
 */
describe('Update of a package that publishes no version', () => {
    it('offers a reinstall for a vendor that publishes no version', () => {
        expect(updateDecision({
            installer_type: 'script',
            installed_version: '1.8 (build 1125) stable',
            available_version: null,
        })).toBe('reinstall');
    });

    it('still refuses when a package that should have a version has none', () => {
        // An apt package with no candidate means something is wrong; offering a
        // blind reinstall there would hide it.
        expect(updateDecision({
            installer_type: 'apt_simple',
            installed_version: '0.24.5-1',
            available_version: null,
        })).toBe('no-version');
    });

    it('keeps the up-to-date shortcut for packages that do publish one', () => {
        expect(updateDecision({
            installer_type: 'apt_deb',
            installed_version: '6.1.4-71',
            available_version: '6.1.4-71',
        })).toBe('up-to-date');
    });

    it('goes ahead when the published version differs', () => {
        expect(updateDecision({
            installer_type: 'apt_deb',
            installed_version: '5.1.5-67',
            available_version: '6.1.4-71',
        })).toBe('proceed');
    });
});

/**
 * Warning that an operation interrupts playback.
 *
 * Updating a package restarts the service it drives — its own post-install
 * script does it — and uninstalling stops it. Enforcing a guard would mean
 * rebuilding the whole audio pipeline before every operation just to ask
 * whether that service is playing, which is far too much to pay and is blind to
 * Roon regardless. Saying it costs nothing and is always true.
 */
describe('Playback warning in the confirmation', () => {
    /** @returns {Object} A bare instance, enough to call the method. */
    function page() {
        return Object.create(AgAudioSoftwarePage.prototype);
    }

    it('warns that an update restarts the service', () => {
        const text = page()._playbackWarningText(
            { label: 'Music Player Daemon', service_id: 'mpd' }, 'update');
        expect(text).toContain('restarts Music Player Daemon');
        expect(text).toContain('will stop');
    });

    it('warns that an uninstall stops and removes it', () => {
        const text = page()._playbackWarningText(
            { label: 'UPnP Bridge', service_id: 'upmpdcli' }, 'uninstall');
        expect(text).toContain('stops and removes UPnP Bridge');
    });

    it('says nothing when installing something that is not running yet', () => {
        expect(page()._playbackWarningText(
            { label: 'Roon Bridge', service_id: 'roon' }, 'install')).toBe('');
    });

    it('says nothing for a package AG does not start or stop', () => {
        // Roon Server has no service_id: AG installs it and has no handle on it.
        expect(page()._playbackWarningText(
            { label: 'Roon Server', service_id: null }, 'update')).toBe('');
    });

    it('leaves the label raw: the confirmation shows its message as text', () => {
        // Escaped here, `&lt;img` would show on screen (showConfirm renders text).
        const text = page()._playbackWarningText(
            { label: '<img src=x onerror=alert(1)>', service_id: 'mpd' }, 'update');
        expect(text).toContain('restarts <img src=x onerror=alert(1)>');
        expect(text).not.toContain('&lt;');
    });

    it('gives the uninstall dialog plain text, which Lit escapes itself', () => {
        // Escaped twice, entities reach the screen — `&gt;=` in the logs did.
        const text = page()._playbackWarningText(
            { label: 'A & B', service_id: 'mpd' }, 'uninstall');
        expect(text).toContain('stops and removes A & B');
        expect(text).not.toContain('&amp;');
    });
});

/**
 * The configuration state is admin-only on the core side and probes the box's
 * block devices to answer, so it is read when the tab is shown — never on the
 * startup fetch that exists only to light the update badge.
 */
describe('Reading which services AG has configured', () => {
    afterEach(() => { session.admin = true; });

    it('does not ask when the session is not an admin', async () => {
        // The endpoint is admin-gated: asking would take a guaranteed 403 on
        // every load. The guard returns before anything is fetched, so whatever
        // was known before is left untouched.
        session.admin = false;
        const page = Object.create(AgAudioSoftwarePage.prototype);
        page._unconfigured = new Set(['mpd']);

        await page._loadConfiguredServices();

        expect([...page._unconfigured]).toEqual(['mpd']);
    });

    it('reads it for an admin, and says nothing when the read fails', async () => {
        // No server in a unit test: the fetch rejects, which must clear the set
        // rather than leave a stale accusation behind.
        session.admin = true;
        const page = Object.create(AgAudioSoftwarePage.prototype);
        page._unconfigured = new Set(['mpd']);

        await page._loadConfiguredServices();

        expect([...page._unconfigured]).toEqual([]);
    });
});

describe('the INSTALLED filter', () => {
    // A failed update leaves the previous version running: the filter hid it.
    const PACKAGES = [
        { id: 'mpd', status: 'installed', installed_version: '0.24' },
        { id: 'hqplayerd', status: 'error', installed_version: '6.0' },
        { id: 'roonserver', status: 'error', installed_version: null },
        { id: 'shairport', status: 'not_installed', installed_version: null },
    ];

    /** What the filter shows, on a page holding PACKAGES (no Lit instance needed). */
    const visible = filter =>
        AgAudioSoftwarePage.prototype._visiblePackages.call({ packages: PACKAGES, _filter: filter });

    it('keeps what is on the box, a failed update included', () => {
        expect(visible('installed').map(p => p.id)).toEqual(['mpd', 'hqplayerd']);
    });

    it('shows everything unfiltered', () => {
        expect(visible('all')).toHaveLength(4);
    });
});
