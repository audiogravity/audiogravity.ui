/**
 * Unit tests for ag-confirm-dialog — its two buttons and what it focuses when shown.
 *
 * Cancel and OK were the same grey .btn-action, 18px tall on a computer: nothing told the
 * action from the way out, and a confirmation that deletes looked like any other. They are
 * now the dialogs' buttons — Cancel outlined, OK filled, OK orange when the action deletes
 * or removes (user's choice, 2026-10-08). The focus code looked for `.action-btn.primary`,
 * which the buttons never wore: nothing was ever focused, and Enter did nothing.
 *
 * Covers:
 * 1. the buttons: classes by kind — plain, destructive, information
 * 2. the focus once shown: OK, Cancel when OK deletes, a field when the message holds one
 * 3. the confirmations of the app that delete or remove, each declared so
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { html } from 'lit';
import { readStylesheet } from '../../test-utils.js';
import './ag-confirm-dialog.js';

/**
 * Mount a dialog with the given properties.
 * @param {object} props - Properties to set on the dialog.
 * @returns {Promise<HTMLElement>}
 */
async function dialog(props = {}) {
    const el = document.createElement('ag-confirm-dialog');
    Object.assign(el, { title: 'Clear History', message: 'Clear config history?', ...props });
    document.body.appendChild(el);
    await el.updateComplete;
    await el.querySelector('ag-modal')?.updateComplete;
    return el;
}

/** The footer's buttons, by role. */
const cancelOf = (el) => el.querySelector('[data-dialog="cancel"]');
const okOf = (el) => el.querySelector('[data-dialog="ok"]');

beforeEach(() => { document.body.innerHTML = ''; });

describe('the confirm dialog\'s buttons', () => {
    it('are the dialogs\' buttons: Cancel outlined, OK filled', async () => {
        const el = await dialog();
        expect(cancelOf(el).className).toBe('action-btn secondary');
        expect(okOf(el).className).toBe('action-btn primary');
    });

    it('make OK orange when the action deletes or removes', async () => {
        const el = await dialog({ destructive: true });
        expect(okOf(el).className).toBe('action-btn warning');
        expect(cancelOf(el).className).toBe('action-btn secondary');
    });

    it('show OK alone in an information dialog', async () => {
        const el = await dialog({ infoMode: true });
        expect(cancelOf(el)).toBeNull();
        expect(okOf(el)).not.toBeNull();
    });

    it('no longer wear .btn-action', async () => {
        const el = await dialog();
        expect(el.querySelector('.modal-footer .btn-action')).toBeNull();
    });
});

describe('what the confirm dialog focuses once shown', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    /** Show a mounted dialog and let its focus timer run. */
    async function show(el) {
        el.show = true;
        await el.updateComplete;
        vi.advanceTimersByTime(150);
    }

    it('OK, so that Enter confirms', async () => {
        const el = await dialog();
        await show(el);
        expect(document.activeElement).toBe(okOf(el));
    });

    it('Cancel when OK deletes, so that Enter does not', async () => {
        const el = await dialog({ destructive: true });
        await show(el);
        expect(document.activeElement).toBe(cancelOf(el));
    });

    it('OK in an information dialog, destructive or not: there is no Cancel', async () => {
        const el = await dialog({ infoMode: true, destructive: true });
        await show(el);
        expect(document.activeElement).toBe(okOf(el));
    });

    it('the field when the message holds one — the password of a password confirm', async () => {
        const el = await dialog({ destructive: true, messageTemplate: html`<input id="pwd" type="password">` });
        await show(el);
        expect(document.activeElement?.id).toBe('pwd');
    });
});

describe('the confirmations that delete or remove', () => {
    /**
     * [file, a phrase of the call] — each call must declare `destructive: true`, read
     * from the opening of the call to its closing parenthesis.
     */
    const DESTRUCTIVE = [
        [['js', 'common.js'], "'Clear History'"],
        [['js', 'components', 'molecules', 'ag-passkey-manager.js'], "'Remove Passkey'"],
        [['js', 'components', 'molecules', 'ag-license-status.js'], "'Delete License'"],
        [['js', 'components', 'organisms', 'ag-guided-config.js'], "'Remove the music library?'"],
        [['js', 'components', 'molecules', 'ag-network-mount-form.js'], "'Remove network share'"],
        [['js', 'components', 'molecules', 'ag-network-mount-form.js'], "'Share is busy'"],
        [['js', 'components', 'organisms', 'ag-admin-page.js'], "'Delete User'"],
        [['js', 'components', 'organisms', 'ag-systemd-page.js'], "'Remove Override'"],
        // Systemd's restore writes the backup over the override and deletes it: the settings in
        // place are lost. Config's Restore Backup saves them first, and is not destructive.
        [['js', 'components', 'organisms', 'ag-systemd-page.js'], "'Restore Backup'"],
        [['js', 'components', 'organisms', 'ag-config-editor.js'], "'Unsaved Changes'"],
        [['js', 'components', 'organisms', 'ag-config-editor.js'], "'Cancel Changes'"],
        [['js', 'components', 'organisms', 'ag-config-editor.js'], "'Switch Mode'"],
    ];

    /**
     * The arguments of the confirm call that holds `at`: from its opening parenthesis to the
     * one that closes it (the texts' own parentheses are balanced).
     */
    const callAround = (source, at) => {
        const open = source.lastIndexOf('Confirm(', at) + 'Confirm'.length;
        let depth = 0;
        for (let i = open; i < source.length; i++) {
            if (source[i] === '(') depth++;
            else if (source[i] === ')' && --depth === 0) return source.slice(open, i + 1);
        }
        return '';
    };

    it.each(DESTRUCTIVE)('— %s, %s — declare it: OK is orange and Cancel is focused', (file, phrase) => {
        const source = readStylesheet(...file);
        let at = source.indexOf(phrase);
        expect(at, `${phrase} not found`).toBeGreaterThan(-1);
        // Every call carrying the phrase (Switch Mode has two).
        while (at !== -1) {
            expect(callAround(source, at)).toMatch(/destructive:\s*true/);
            at = source.indexOf(phrase, at + phrase.length);
        }
    });
});

describe('the message property', () => {
    it('is shown as text, tags included', async () => {
        // Markup goes through messageTemplate (a Lit template); a string never is.
        const message = '<img src=x onerror="window.__pwned=1">Hi';
        const el = await dialog({ message });
        const box = el.querySelector('#dialogMessage');
        expect(box.querySelector('img')).toBeNull();
        expect(box.textContent.trim()).toBe(message);
    });
});
