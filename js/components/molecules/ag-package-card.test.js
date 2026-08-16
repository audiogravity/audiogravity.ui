/**
 * Unit tests for ag-package-card.js — availability banner.
 *
 * A package the box cannot install used to show a greyed-out INSTALL button and
 * a bare "Not Supported" badge, with nothing to say why. The core now
 * distinguishes three cases, and they are not equivalent for the reader:
 * "the vendor publishes nothing for this system" is permanent, "the source
 * could not be reached" is worth retrying, and "another package forbids it"
 * is something the user can act on.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../auth.js', () => ({ isGuest: () => false }));

import './ag-package-card.js';

const basePkg = {
    id: 'roonserver',
    label: 'Roon Server',
    description: 'Roon capable audio player and core',
    status: 'not_installed',
    installed_version: null,
    available_version: null,
    installer_type: 'script',
    arch_support: ['x86_64'],
    is_supported: true,
};

/**
 * Mount the card with a package object.
 * @param {Object} pkg - Package payload as returned by GET /packages/.
 * @returns {Promise<HTMLElement>} The mounted element, after its first render.
 */
async function mount(pkg) {
    const el = document.createElement('ag-package-card');
    el.pkg = pkg;
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
}

describe('ag-package-card — availability', () => {
    let el;

    beforeEach(() => { document.body.innerHTML = ''; });
    afterEach(() => { el?.remove(); });

    it('says nothing when the package is available', async () => {
        el = await mount({ ...basePkg, availability: 'available' });
        expect(el.querySelector('.software-availability')).toBeNull();
    });

    it('stays silent for a core that does not send the field yet', async () => {
        el = await mount({ ...basePkg });
        expect(el.querySelector('.software-availability')).toBeNull();
    });

    it('explains a package blocked by a conflicting one', async () => {
        el = await mount({
            ...basePkg,
            is_supported: false,
            availability: 'blocked',
            availability_reason: 'Roon Bridge is installed — the two cannot run together',
        });
        const banner = el.querySelector('.software-availability');
        expect(banner).not.toBeNull();
        expect(banner.textContent).toContain('Unavailable');
        expect(banner.textContent).toContain('Roon Bridge is installed');
    });

    it('marks an unreachable source as unknown, not as incompatible', async () => {
        el = await mount({
            ...basePkg,
            is_supported: false,
            availability: 'unknown',
            availability_reason: 'vendor download site unreachable',
        });
        const banner = el.querySelector('.software-availability');
        expect(banner.textContent).toContain('Cannot be checked');
        // A warning, not an error: this one is worth retrying.
        expect(banner.querySelector('.badge.warning')).not.toBeNull();
        expect(banner.querySelector('.badge.error')).toBeNull();
    });

    it('marks a genuinely unsupported package as an error', async () => {
        el = await mount({
            ...basePkg,
            is_supported: false,
            availability: 'unsupported',
            availability_reason: 'vendor publishes no build for aarch64',
        });
        const banner = el.querySelector('.software-availability');
        expect(banner.textContent).toContain('Not available here');
        expect(banner.querySelector('.badge.error')).not.toBeNull();
    });

    it('does not repeat itself: no bare "Not Supported" badge next to the banner', async () => {
        el = await mount({
            ...basePkg,
            is_supported: false,
            availability: 'unsupported',
            availability_reason: 'vendor publishes no build for aarch64',
        });
        const badges = [...el.querySelectorAll('.software-meta .badge')].map(b => b.textContent.trim());
        expect(badges).not.toContain('Not Supported');
    });

    it('keeps the plain badge when the architecture alone is the reason', async () => {
        // No availability verdict from the core, but this box's arch is not
        // covered — the footer badge stays the only signal.
        el = await mount({ ...basePkg, is_supported: false, availability: 'available' });
        const badges = [...el.querySelectorAll('.software-meta .badge')].map(b => b.textContent.trim());
        expect(badges).toContain('Not Supported');
    });

    it('falls back to a generic sentence when the core sends no reason', async () => {
        el = await mount({ ...basePkg, is_supported: false, availability: 'unknown' });
        expect(el.querySelector('.software-availability').textContent)
            .toContain('could not be reached');
    });

    it('does not blame the vendor for a local conflict with no reason attached', async () => {
        el = await mount({ ...basePkg, is_supported: false, availability: 'blocked' });
        const text = el.querySelector('.software-availability').textContent;
        expect(text).toContain('another installed package');
        expect(text).not.toContain('no build');
    });

    it('stays neutral for a state it does not know yet', async () => {
        el = await mount({ ...basePkg, is_supported: false, availability: 'something-new' });
        const text = el.querySelector('.software-availability').textContent;
        expect(text).toContain('Unavailable');
        // Never a vendor claim we have no basis for.
        expect(text).not.toContain('no build');
    });

    it('keeps a compact signal on an installed package the box cannot install', async () => {
        // The banner is for a disabled INSTALL button and there is none here,
        // but suppressing the badge as well left the card completely mute about
        // a vendor that no longer publishes for this system.
        el = await mount({
            ...basePkg,
            status: 'installed',
            installed_version: '2.60',
            is_supported: false,
            availability: 'unsupported',
            availability_reason: 'vendor publishes no build for x86_64',
        });
        expect(el.querySelector('.software-availability')).toBeNull();
        const badges = [...el.querySelectorAll('.software-meta .badge')].map(b => b.textContent.trim());
        expect(badges).toContain('Not Supported');
    });

    it('says nothing on an installed package, whatever the verdict', async () => {
        // The banner explains a disabled INSTALL button. There is none here, and
        // "not available here" under an INSTALLED header contradicts itself.
        for (const availability of ['unsupported', 'unknown', 'blocked']) {
            document.body.innerHTML = '';
            el = await mount({
                ...basePkg,
                status: 'installed',
                installed_version: '2.60',
                is_supported: false,
                availability,
                availability_reason: 'vendor publishes no build for x86_64',
            });
            expect(el.querySelector('.software-availability')).toBeNull();
        }
    });
});

describe('ag-package-card — actions', () => {
    let el;

    beforeEach(() => { document.body.innerHTML = ''; });
    afterEach(() => { el?.remove(); });

    it('offers a disabled INSTALL for something unavailable and not installed', async () => {
        el = await mount({ ...basePkg, is_supported: false, availability: 'unsupported' });
        const buttons = [...el.querySelectorAll('.software-actions button')];
        expect(buttons).toHaveLength(1);
        expect(buttons[0].disabled).toBe(true);
        expect(buttons[0].textContent).toContain('INSTALL');
    });

    it('keeps UPDATE and UNINSTALL on an installed package the core marks unavailable', async () => {
        // A box that ended up with two conflicting products must be able to
        // remove one — hiding the buttons leaves the user stuck with the pair
        // the rule exists to prevent.
        el = await mount({
            ...basePkg,
            status: 'installed',
            installed_version: '2.60',
            is_supported: false,
            availability: 'blocked',
            availability_reason: 'Roon Bridge is installed — the two cannot run together',
        });
        const labels = [...el.querySelectorAll('.software-actions button')].map(b => b.textContent.trim());
        expect(labels.join(' ')).toContain('UNINSTALL');
        expect(labels.join(' ')).toContain('UPDATE');
    });

    it('offers a retry after a failed install, not actions on absent software', async () => {
        // A failed install leaves nothing on disk: UPDATE and UNINSTALL would
        // both act on something that is not there.
        el = await mount({ ...basePkg, status: 'error', installed_version: null });
        const labels = [...el.querySelectorAll('.software-actions button')].map(b => b.textContent.trim());
        expect(labels.join(' ')).toContain('INSTALL');
        expect(labels.join(' ')).not.toContain('UNINSTALL');
    });

    it('leaves a way out after a failed operation', async () => {
        // An operation that failed leaves the software wherever it was, very
        // often on disk and half updated. Falling through to no buttons at all
        // stranded the user on exactly the card that needs an action.
        el = await mount({
            ...basePkg,
            status: 'error',
            installed_version: '2.60',
            is_supported: false,
            availability: 'blocked',
        });
        const labels = [...el.querySelectorAll('.software-actions button')].map(b => b.textContent.trim());
        expect(labels.join(' ')).toContain('UNINSTALL');
    });

    it('still offers INSTALL normally when everything is fine', async () => {
        el = await mount({ ...basePkg, availability: 'available' });
        const buttons = [...el.querySelectorAll('.software-actions button')];
        expect(buttons).toHaveLength(1);
        expect(buttons[0].disabled).toBe(false);
    });
});

/**
 * "Installed" is not "configured".
 *
 * Installing a package deliberately does not write its configuration — that is
 * a separate step — so a freshly installed service runs on the defaults its
 * package ships and can play to the wrong output while the card looks perfectly
 * ready. The core judges this on a marker it writes into the file itself, not
 * on the file existing: every package ships one.
 */
describe('ag-package-card — configuration state', () => {
    let el;

    beforeEach(() => { document.body.innerHTML = ''; });
    afterEach(() => { el?.remove(); });

    /** @param {Object} extra - Fields to override on the installed base package. */
    async function mountInstalled(extra = {}, props = {}) {
        const card = document.createElement('ag-package-card');
        card.pkg = {
            ...basePkg,
            id: 'mpd',
            label: 'Music Player Daemon',
            service_id: 'mpd',
            status: 'installed',
            installed_version: '0.24.5-1',
            ...extra,
        };
        Object.assign(card, props);
        document.body.appendChild(card);
        await card.updateComplete;
        return card;
    }

    /** @param {HTMLElement} card - Mounted card. @returns {string[]} Footer badges. */
    const badges = card =>
        [...card.querySelectorAll('.software-meta .badge')].map(b => b.textContent.trim());

    it('says so when AG has not written the configuration', async () => {
        el = await mountInstalled({}, { configuredByAg: false });
        expect(badges(el)).toContain('Not configured');
    });

    it('says nothing once it is configured', async () => {
        el = await mountInstalled({}, { configuredByAg: true });
        expect(badges(el)).not.toContain('Not configured');
    });

    it('says nothing when the state could not be read', async () => {
        // A guest, or an endpoint that failed: silence, never an accusation.
        el = await mountInstalled();
        expect(badges(el)).not.toContain('Not configured');
    });

    it('says nothing about a package that is not installed', async () => {
        el = await mountInstalled({ status: 'not_installed', installed_version: null },
            { configuredByAg: false });
        expect(badges(el)).not.toContain('Not configured');
    });

    it('says nothing about a package AG does not drive', async () => {
        // Roon Server has no service_id: AG installs it and configures nothing.
        el = await mountInstalled({ service_id: null }, { configuredByAg: false });
        expect(badges(el)).not.toContain('Not configured');
    });
});
