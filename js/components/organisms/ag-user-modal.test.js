/**
 * Unit tests for ag-user-modal.js.
 *
 * Covers:
 * 1. password trim fix (P3): whitespace-only passwords are rejected by the
 *    existing length < 6 check
 * 2. the role and enabled state are locked for the system account and for your
 *    own, and the window says why next to them (it used to say it in a tooltip)
 */
import { describe, it, expect, vi } from 'vitest';
import { flat } from '../../test-utils.js';

// Stub LitElement so the class can be imported in jsdom
vi.mock('lit', () => ({
    LitElement: class {
        dispatchEvent(e) { this._lastEvent = e; }
        requestUpdate() {}
    },
    html: (strings, ...values) => ({ strings, values }),
    nothing: '',
}));

vi.mock('lit/directives/class-map.js', () => ({ classMap: (x) => x }));
vi.mock('../../api.js', () => ({}));
vi.mock('../../auth.js', () => ({ isGuest: () => false }));
vi.mock('../../ag-icons.js', () => ({}));
vi.mock('../atoms/ag-status-indicator.js', () => ({}));

describe('AgUserModal._handleSave — password trim (Fix P3)', () => {
    async function makeModal(overrides = {}) {
        const { AgUserModal } = await import('./ag-user-modal.js');
        const modal = new AgUserModal();
        modal.user = null;         // creation mode
        modal.isSaving = false;
        modal._username = overrides.username ?? 'validuser';
        modal._password = overrides.password ?? 'valid123';
        modal._role = 'user';
        modal._enabled = true;
        modal._email = '';
        return modal;
    }

    it('whitespace-only password (6 spaces) is rejected', async () => {
        const modal = await makeModal({ password: '      ' });
        const errors = [];
        modal.dispatchEvent = (e) => { if (e.type === 'error') errors.push(e.detail); };
        modal._handleSave();
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0]).toMatch(/6 characters/i);
    });

    it('whitespace-only password (tabs) is rejected', async () => {
        const modal = await makeModal({ password: '\t\t\t\t\t\t' });
        const errors = [];
        modal.dispatchEvent = (e) => { if (e.type === 'error') errors.push(e.detail); };
        modal._handleSave();
        expect(errors.length).toBeGreaterThan(0);
    });

    it('valid password passes validation', async () => {
        const modal = await makeModal({ password: 'Secure1!' });
        const saves = [];
        modal.dispatchEvent = (e) => { if (e.type === 'save') saves.push(e.detail); };
        modal._handleSave();
        expect(saves.length).toBe(1);
        expect(saves[0].payload.password).toBe('Secure1!');
    });

    it('password with surrounding spaces is trimmed before sending', async () => {
        const modal = await makeModal({ password: '  Secret123  ' });
        const saves = [];
        modal.dispatchEvent = (e) => { if (e.type === 'save') saves.push(e.detail); };
        modal._handleSave();
        expect(saves.length).toBe(1);
        expect(saves[0].payload.password).toBe('Secret123');
    });

    it('short username is rejected regardless of password', async () => {
        const modal = await makeModal({ username: 'ab', password: 'valid123' });
        const errors = [];
        modal.dispatchEvent = (e) => { if (e.type === 'error') errors.push(e.detail); };
        modal._handleSave();
        expect(errors[0]).toMatch(/3 characters/i);
    });
});

describe('fields locked for the system account and your own', () => {
    const ME = { username: 'dora', role: 'admin' };

    it.each([
        ['creating an account', null, null],
        ['the system account', { username: 'admin' },
            { role: 'The system account keeps its role.', enabled: 'The system account cannot be disabled.' }],
        ['your own account', { username: 'dora' },
            { role: 'You cannot change your own role.', enabled: 'You cannot disable your own account.' }],
        ['someone else', { username: 'erin' }, null],
    ])('%s', async (_, user, reasons) => {
        const { lockedReasons } = await import('./ag-user-modal.js');
        expect(lockedReasons(user, ME)).toEqual(reasons);
    });

    it('says why, under each greyed-out field', async () => {
        const { AgUserModal } = await import('./ag-user-modal.js');
        const modal = new AgUserModal();
        modal.user = { username: 'dora', role: 'admin', enabled: true };
        modal.currentUser = ME;
        const out = flat(modal.render());
        const role = out.indexOf('<p class="help-text">You cannot change your own role.</p>');
        const enabled = out.indexOf('<p class="help-text">You cannot disable your own account.</p>');
        expect(role).toBeGreaterThan(out.indexOf('<select'));
        expect(enabled).toBeGreaterThan(out.indexOf('Account Enabled'));
    });

    it('shows nothing when both fields can change', async () => {
        const { AgUserModal } = await import('./ag-user-modal.js');
        const modal = new AgUserModal();
        modal.user = { username: 'erin', role: 'user', enabled: true };
        modal.currentUser = ME;
        expect(flat(modal.render())).not.toContain('<p class="help-text">');
    });
});
