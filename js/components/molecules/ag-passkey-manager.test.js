/**
 * Unit tests for ag-passkey-manager — the removal question.
 *
 * The device name is typed by the user when the passkey is registered. The question
 * is a Lit template (for the <strong>), and Lit renders the name in it as text.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'lit';

vi.mock('../../api.js', () => ({ apiGet: vi.fn(), apiCall: vi.fn() }));
vi.mock('../../ui-helpers.js', () => ({
    showConfirm: vi.fn(), showToast: vi.fn(), getUserFriendlyError: vi.fn(),
}));
vi.mock('../../webauthn.js', () => ({ registerPasskey: vi.fn(), isWebAuthnAvailable: () => true }));
vi.mock('../../auth.js', () => ({ getCurrentUser: () => ({ username: 'admin' }) }));

import { apiCall } from '../../api.js';
import { showConfirm } from '../../ui-helpers.js';
import { AgPasskeyManager } from './ag-passkey-manager.js';

/** The component's methods, without rendering it (no request at connection). */
const manager = () => Object.create(AgPasskeyManager.prototype);

beforeEach(() => vi.clearAllMocks());

describe('removing a passkey', () => {
    it('shows the device name as text in the question', async () => {
        showConfirm.mockResolvedValue(false);
        const name = '<img src=x onerror=alert(1)>Kitchen';
        await manager()._handleDelete('cred-1', name);
        const box = document.createElement('div');
        render(showConfirm.mock.calls[0][1], box);
        expect(box.querySelector('img')).toBeNull();
        expect(box.querySelector('strong').textContent).toBe(name);
        expect(box.textContent).toContain('You will no longer be able to sign in with this device.');
    });

    it('removes nothing when the question is declined', async () => {
        showConfirm.mockResolvedValue(false);
        await manager()._handleDelete('cred-1', 'Kitchen');
        expect(apiCall).not.toHaveBeenCalled();
    });
});
