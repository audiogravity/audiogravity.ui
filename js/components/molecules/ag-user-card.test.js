/**
 * Unit tests for ag-user-card — the status badge of accounts that cannot be disabled.
 *
 * Your own card offered "Enabled" as a clickable badge: a click disabled the account
 * you were signed in with. The core now refuses it; the card no longer offers it.
 *
 * Covers:
 * 1. the badge is locked on the system account and on your own card, not on others
 * 2. a locked badge sends nothing
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class { dispatchEvent() {} },
    html: (strings, ...values) => ({ strings, values }),
}));
vi.mock('lit/directives/class-map.js', () => ({ classMap: (x) => x }));
vi.mock('../../webauthn.js', () => ({ isWebAuthnAvailable: () => false }));
vi.mock('../../ag-icons.js', () => ({ iconUser: '', iconUserAdmin: '', iconEye: '', iconKey: '' }));
vi.mock('../atoms/ag-badge.js', () => ({}));
vi.mock('../atoms/ag-button.js', () => ({}));
vi.mock('./ag-passkey-manager.js', () => ({}));
vi.mock('../atoms/ag-status-indicator.js', () => ({}));
vi.mock('../atoms/ag-switch.js', () => ({}));

globalThis.customElements ??= { define: () => {} };

const { AgUserCard } = await import('./ag-user-card.js');

/** A card for an account, as the admin page builds it. */
function card(username, isMe = false) {
    const el = new AgUserCard();
    el.user = { username, role: 'admin', enabled: true };
    el.isMe = isMe;
    el.dispatchEvent = vi.fn();
    return el;
}

describe('the status badge', () => {
    it.each([
        ['the system account', true, card('admin')],
        ['your own card', true, card('dora', true)],
        ['someone else', false, card('erin')],
    ])('%s: locked = %s', (_, locked, el) => {
        expect(el._statusLocked).toBe(locked);
        el._handleToggleStatus();
        expect(el.dispatchEvent).toHaveBeenCalledTimes(locked ? 0 : 1);
    });
});
