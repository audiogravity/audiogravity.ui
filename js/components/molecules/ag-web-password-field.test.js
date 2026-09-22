/**
 * Unit tests for ag-web-password-field.js.
 *
 * The one field that asks for the password of a package's own web interface,
 * shared by the install dialog and the dialog that sets it afterwards. What is
 * worth guarding:
 * - the rules match the core's (`web_credentials.password_problem`), which is
 *   the one that decides;
 * - a generated password is uniform over its alphabet and different each time;
 * - the field says where to sign in and as whom, shows the value in clear, and
 *   hands every keystroke to its host;
 * - two fields in the page at once never share an id.
 */
import { describe, it, expect } from 'vitest';

import { generateWebPassword, webPasswordProblem } from './ag-web-password-field.js';

const CREDENTIALS = { username: 'hqplayer', port: 8088, already_set: false };

/**
 * Mount a field.
 * @param {string} value - The password it shows.
 * @returns {Promise<HTMLElement>} The element, rendered.
 */
async function mount(value = 'Zq7Rk2Lm9Tx4Wp1N') {
    const el = document.createElement('ag-web-password-field');
    el.credentials = CREDENTIALS;
    el.label = 'HQPlayer Embedded';
    el.value = value;
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
}

describe('ag-web-password-field', () => {
    it('shows the password in clear and says where to sign in, as whom', async () => {
        const el = await mount();
        const input = el.querySelector('input');
        expect(input.type).toBe('text');
        expect(input.value).toBe('Zq7Rk2Lm9Tx4Wp1N');
        const text = el.textContent.replace(/\s+/g, ' ');
        expect(text).toContain('hqplayer');
        expect(text).toContain(`http://${window.location.hostname}:8088`);
        expect(el.querySelector('label').htmlFor).toBe(input.id);
    });

    it('hands each keystroke to its host', async () => {
        const el = await mount();
        const seen = [];
        el.addEventListener('password-input', e => seen.push(e.detail.value));
        const input = el.querySelector('input');
        input.value = 'MyOwnPass42';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        expect(seen).toEqual(['MyOwnPass42']);
    });

    it('says what is wrong with an unusable password', async () => {
        const el = await mount('short');
        expect(el.querySelector('.ag-pid-warning').textContent).toContain('at least 8');
    });

    it('never gives two fields the same id', async () => {
        const one = await mount();
        const two = await mount();
        expect(one.querySelector('input').id).not.toBe(two.querySelector('input').id);
    });

    it('shows nothing without credentials', async () => {
        const el = document.createElement('ag-web-password-field');
        document.body.appendChild(el);
        await el.updateComplete;
        expect(el.querySelector('input')).toBeNull();
    });
});

describe('generateWebPassword', () => {
    it('draws sixteen letters and digits', () => {
        for (let i = 0; i < 50; i++) {
            expect(generateWebPassword()).toMatch(/^[A-Za-z0-9]{16}$/);
        }
    });

    it('draws a different one each time', () => {
        const drawn = new Set(Array.from({ length: 50 }, generateWebPassword));
        expect(drawn.size).toBe(50);
    });
});

describe('webPasswordProblem', () => {
    it.each([
        ['short', 'at least 8'],
        ['x'.repeat(65), 'at most 64'],
        ['has a space', 'no spaces'],
        ['accentué12', 'no spaces'],
        ['-sneaky123', 'cannot start with a dash'],
    ])('refuses %j', (password, fragment) => {
        expect(webPasswordProblem(password)).toContain(fragment);
    });

    it.each(['x'.repeat(8), 'x'.repeat(64), 'a!b#c$d%e&f*g'])('accepts %j', password => {
        expect(webPasswordProblem(password)).toBeNull();
    });
});
