/**
 * Unit tests for ag-terminal — what the terminal says when the core closes it.
 *
 * The core closes an open terminal with 4001 once the session that opened it has
 * ended. After an admin changed their own password — their session goes on with a
 * new token — the terminal said "Authentication required." (review, 2026-09-28).
 *
 * Covers:
 * 1. 4001 on an open terminal says its session ended, and to reconnect
 * 2. 4001 at the door still asks for a session; 4003 still refuses a non-admin
 * 3. an ordinary close says nothing
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('lit', () => ({ LitElement: class {}, html: () => '', nothing: '' }));
vi.mock('../../ag-icons.js', () => ({ iconTerminal: '' }));
vi.mock('../../auth.js', () => ({ getAuthToken: () => null }));
vi.mock('../../common.js', () => ({ monoFontFamily: () => 'monospace' }));

globalThis.customElements ??= { define: () => {} };

const { closeMessage } = await import('./ag-terminal.js');

describe('what the terminal says when the core closes it', () => {
    it('an open terminal whose session ended', () => {
        expect(closeMessage(4001, true)).toMatch(/session that opened this terminal has ended.*Reconnect/);
    });

    it.each([
        [4001, false, 'Authentication required.'],
        [4003, false, 'Access denied — admin only.'],
        [4003, true, 'Access denied — admin only.'],
        [1000, true, ''],
    ])('code %s, open %s', (code, wasOpen, message) => {
        expect(closeMessage(code, wasOpen)).toBe(message);
    });
});
