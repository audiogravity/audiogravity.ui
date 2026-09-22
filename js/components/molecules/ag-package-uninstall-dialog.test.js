/**
 * Unit tests for ag-package-uninstall-dialog.js.
 *
 * A plain uninstall keeps a package's settings — HQPlayer's filter and
 * modulator choices, its web password — so a reinstall finds them again.
 * Deleting them too is the operator's explicit choice (decided 2026-09-21).
 * What is worth guarding:
 * - the choice is unticked when the dialog opens, and never carried over;
 * - it is only offered where it means something (`keeps_settings_on_uninstall`);
 * - `purge` leaves in the event only when ticked, and the screen says what it costs.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import './ag-package-uninstall-dialog.js';

const HQPLAYERD = {
    id: 'hqplayerd', label: 'HQPlayer Embedded', service_id: 'hqplayerd',
    keeps_settings_on_uninstall: true,
};
const ROON_SERVER = {
    id: 'roonserver', label: 'Roon Server', service_id: null,
    keeps_settings_on_uninstall: false,
};

/**
 * Mount the dialog and open it.
 * @param {Object} pkg - The package being uninstalled.
 * @param {string} [note] - The playback warning the page passes.
 * @returns {Promise<HTMLElement>} The element, rendered open.
 */
async function open(pkg, note = '') {
    const el = document.createElement('ag-package-uninstall-dialog');
    el.pkg = pkg;
    el.note = note;
    document.body.appendChild(el);
    await el.updateComplete;
    el.show = true;
    await el.updateComplete;
    return el;
}

/** The confirm button, found by its label rather than by position. */
function uninstallButton(el) {
    return [...el.querySelectorAll('button')].find(b => b.textContent.includes('Uninstall'));
}

/** The delete-settings checkbox, or undefined. */
function purgeBox(el) {
    return el.querySelector('.ag-pud-agree input[type="checkbox"]') ?? undefined;
}

/** Collect the confirmation the dialog emits. */
function listen(el) {
    const seen = [];
    el.addEventListener('uninstall-confirmed', e => seen.push(e.detail));
    return seen;
}

describe('ag-package-uninstall-dialog', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('asks the question and says what the uninstall interrupts', async () => {
        const el = await open(HQPLAYERD,
            ' This stops and removes HQPlayer Embedded — anything playing through it will stop.');
        const text = el.textContent.replace(/\s+/g, ' ');
        expect(text).toContain('Uninstall HQPlayer Embedded? This stops and removes HQPlayer Embedded');
    });

    it('offers to delete the settings, unticked, and says they are kept otherwise', async () => {
        const el = await open(HQPLAYERD);
        expect(purgeBox(el).checked).toBe(false);
        expect(el.textContent).toContain('Its settings are kept: a reinstall finds them again.');
    });

    it('a plain confirmation keeps the settings', async () => {
        const el = await open(HQPLAYERD);
        const seen = listen(el);
        uninstallButton(el).click();
        expect(seen).toEqual([{ packageId: 'hqplayerd', purge: false }]);
    });

    it('ticked, it asks for the deletion and says what it costs', async () => {
        const el = await open(HQPLAYERD);
        const seen = listen(el);
        purgeBox(el).click();
        await el.updateComplete;
        const warning = el.querySelector('.ag-pud-warning').textContent.replace(/\s+/g, ' ');
        expect(warning).toContain('This cannot be undone');
        expect(warning).toContain('factory settings');
        expect(warning).toContain('keep a copy of it first');
        expect(uninstallButton(el).textContent.trim()).toBe('Uninstall and delete');
        uninstallButton(el).click();
        expect(seen).toEqual([{ packageId: 'hqplayerd', purge: true }]);
    });

    it('never carries the choice over to the next package', async () => {
        const el = await open(HQPLAYERD);
        purgeBox(el).click();
        await el.updateComplete;
        el.show = false;
        await el.updateComplete;
        el.pkg = { ...HQPLAYERD, id: 'naa', label: 'HQPlayer NAA' };
        el.show = true;
        await el.updateComplete;
        expect(purgeBox(el).checked).toBe(false);
        const seen = listen(el);
        uninstallButton(el).click();
        expect(seen[0].purge).toBe(false);
    });

    it('offers nothing for a package whose uninstall already deletes everything', async () => {
        const el = await open(ROON_SERVER);
        expect(purgeBox(el)).toBeUndefined();
        const seen = listen(el);
        uninstallButton(el).click();
        expect(seen).toEqual([{ packageId: 'roonserver', purge: false }]);
    });

    it('cancelling asks to close and confirms nothing', async () => {
        const el = await open(HQPLAYERD);
        const seen = listen(el);
        let closed = 0;
        el.addEventListener('modal-close', () => { closed += 1; });
        [...el.querySelectorAll('button')].find(b => b.textContent.includes('Cancel')).click();
        expect(closed).toBe(1);
        expect(seen).toEqual([]);
    });

    it('shows a label as text, never as markup', async () => {
        const el = await open({ ...HQPLAYERD, label: '<img src=x onerror=alert(1)>' });
        expect(el.querySelector('img')).toBeNull();
        expect(el.textContent).toContain('<img src=x onerror=alert(1)>');
    });
});
