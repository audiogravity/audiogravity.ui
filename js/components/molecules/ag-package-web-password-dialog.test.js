/**
 * Unit tests for ag-package-web-password-dialog.js.
 *
 * When the install could not set a package's web interface password, the card
 * offers to set it — the only way back used to be uninstalling and
 * reinstalling. What is worth guarding:
 * - a password is drawn on opening, and never kept past a close;
 * - the one in the field is the one that leaves, and only when usable;
 * - the operator is told the service restarts to use it.
 */
import { describe, it, expect, vi } from 'vitest';

import './ag-package-web-password-dialog.js';
import { webPasswordProblem } from './ag-web-password-field.js';

const HQPLAYERD = {
    id: 'hqplayerd', label: 'HQPlayer Embedded', status: 'installed',
    web_credentials: { username: 'hqplayer', port: 8088, already_set: false },
};

/**
 * Mount the dialog and open it.
 * @returns {Promise<HTMLElement>} The element, rendered open.
 */
async function open() {
    const el = document.createElement('ag-package-web-password-dialog');
    el.pkg = HQPLAYERD;
    document.body.appendChild(el);
    await el.updateComplete;
    el.show = true;
    await el.updateComplete;
    await el.querySelector('ag-web-password-field')?.updateComplete;
    return el;
}

const field = el => el.querySelector('ag-web-password-field .ag-pid-password');
const setButton = el => [...el.querySelectorAll('button')].find(b => b.textContent.includes('Set password'));

/** Type into the field the way a person does. */
async function type(el, value) {
    field(el).value = value;
    field(el).dispatchEvent(new Event('input', { bubbles: true }));
    await el.updateComplete;
    await el.querySelector('ag-web-password-field').updateComplete;
}

describe('ag-package-web-password-dialog', () => {
    it('opens with a usable random password, in clear', async () => {
        const el = await open();
        expect(field(el).type).toBe('text');
        expect(field(el).value).toHaveLength(16);
        expect(webPasswordProblem(field(el).value)).toBeNull();
    });

    it('says the service restarts to use it', async () => {
        const el = await open();
        expect(el.querySelector('.modal-body').textContent.replace(/\s+/g, ' '))
            .toContain('restarts to use it');
    });

    it('sets that explanation apart from the field, as a section of its own', async () => {
        // A bare hint kept only the small space a hint leaves inside a section, and the
        // field's heading sat right under it.
        const el = await open();
        const hint = [...el.querySelectorAll('.ag-pid-hint')]
            .find(p => p.textContent.includes('restarts to use it'));
        const section = hint.closest('.ag-pid-section');
        expect(section).not.toBeNull();
        expect(section.querySelector('ag-web-password-field')).toBeNull();
    });

    it('sends the password that is in the field', async () => {
        const el = await open();
        await type(el, 'MyOwnPass42');
        const sent = vi.fn();
        el.addEventListener('web-password-confirmed', e => sent(e.detail));
        setButton(el).click();
        expect(sent).toHaveBeenCalledWith({ packageId: 'hqplayerd', webPassword: 'MyOwnPass42' });
    });

    it('keeps the button out of reach while the password is unusable', async () => {
        const el = await open();
        await type(el, 'short');
        expect(setButton(el).disabled).toBe(true);
        const sent = vi.fn();
        el.addEventListener('web-password-confirmed', sent);
        el._confirm();
        expect(sent).not.toHaveBeenCalled();
    });

    it('forgets the password when it closes', async () => {
        const el = await open();
        el.show = false;
        await el.updateComplete;
        expect(el._password).toBe('');
    });

    it('dismisses without sending anything', async () => {
        const el = await open();
        const closed = vi.fn();
        const sent = vi.fn();
        el.addEventListener('modal-close', closed);
        el.addEventListener('web-password-confirmed', sent);
        [...el.querySelectorAll('button')].find(b => b.textContent.includes('Cancel')).click();
        expect(closed).toHaveBeenCalled();
        expect(sent).not.toHaveBeenCalled();
    });

    it('shows nothing for a package without a web interface', async () => {
        const el = document.createElement('ag-package-web-password-dialog');
        el.pkg = { id: 'mpd', label: 'MPD' };
        el.show = true;
        document.body.appendChild(el);
        await el.updateComplete;
        expect(el.querySelector('ag-modal')).toBeNull();
    });
});
