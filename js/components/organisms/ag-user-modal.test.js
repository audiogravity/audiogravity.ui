/**
 * Unit tests for ag-user-modal.js — password trim fix (P3).
 * Fix: password is now .trim()-ed before validation so whitespace-only
 * passwords are rejected by the existing length < 6 check.
 */
import { describe, it, expect, vi } from 'vitest';

// Stub LitElement so the class can be imported in jsdom
vi.mock('lit', () => ({
    LitElement: class {
        dispatchEvent(e) { this._lastEvent = e; }
        requestUpdate() {}
    },
    html: (s) => s,
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
