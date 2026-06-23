/**
 * Unit tests for ag-announcement-banner.js logic.
 *
 * Tested in isolation — pure functions extracted to avoid the auth-check
 * thrown by api.js on import. Mirrors the component's internal behaviour.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// ── Pure logic mirroring the component ───────────────────────────────────────

const _STORAGE_KEY = 'ag_dismissed_announcements';

function getDismissed() {
    try {
        return new Set(JSON.parse(localStorage.getItem(_STORAGE_KEY) || '[]'));
    } catch {
        return new Set();
    }
}

function saveDismissed(ids) {
    localStorage.setItem(_STORAGE_KEY, JSON.stringify([...ids]));
}

function icon(type) {
    return { version: '🚀', promo: '🎉', alert: '⚠️', info: 'ℹ️' }[type] ?? 'ℹ️';
}

function emitBadge(announcements, dismissed) {
    const count = announcements.filter(a => !dismissed.has(a.id)).length;
    window.dispatchEvent(new CustomEvent('announcement-badge', { detail: { count } }));
    return count;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('ag-announcement-banner — localStorage helpers', () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => localStorage.clear());

    it('getDismissed returns empty Set when storage is empty', () => {
        expect(getDismissed().size).toBe(0);
    });

    it('getDismissed survives malformed JSON without throwing', () => {
        localStorage.setItem(_STORAGE_KEY, 'NOT_JSON{{');
        expect(() => getDismissed()).not.toThrow();
        expect(getDismissed().size).toBe(0);
    });

    it('saveDismissed + getDismissed round-trip', () => {
        const ids = new Set(['a', 'b', 'c']);
        saveDismissed(ids);
        const loaded = getDismissed();
        expect(loaded.has('a')).toBe(true);
        expect(loaded.has('b')).toBe(true);
        expect(loaded.size).toBe(3);
    });
});

describe('ag-announcement-banner — _icon', () => {
    it('returns correct emoji for each known type', () => {
        expect(icon('version')).toBe('🚀');
        expect(icon('promo')).toBe('🎉');
        expect(icon('alert')).toBe('⚠️');
        expect(icon('info')).toBe('ℹ️');
    });

    it('falls back to ℹ️ for unknown type', () => {
        expect(icon('unknown')).toBe('ℹ️');
        expect(icon('')).toBe('ℹ️');
        expect(icon(undefined)).toBe('ℹ️');
    });
});

describe('ag-announcement-banner — _emitBadge', () => {
    it('emits count=0 when all announcements are dismissed', () => {
        const anns = [{ id: 'x', type: 'info', title: 'T' }];
        const dismissed = new Set(['x']);
        const events = [];
        const handler = e => events.push(e.detail);
        window.addEventListener('announcement-badge', handler);
        const count = emitBadge(anns, dismissed);
        window.removeEventListener('announcement-badge', handler);
        expect(count).toBe(0);
        expect(events[0].count).toBe(0);
    });

    it('emits correct count with partial dismissals', () => {
        const anns = [
            { id: 'a', type: 'info', title: 'A' },
            { id: 'b', type: 'info', title: 'B' },
            { id: 'c', type: 'info', title: 'C' },
        ];
        const dismissed = new Set(['b']);
        const events = [];
        const handler = e => events.push(e.detail);
        window.addEventListener('announcement-badge', handler);
        const count = emitBadge(anns, dismissed);
        window.removeEventListener('announcement-badge', handler);
        expect(count).toBe(2);
        expect(events[0].count).toBe(2);
    });

    it('emits count=N when nothing is dismissed', () => {
        const anns = [
            { id: '1', type: 'version', title: 'A' },
            { id: '2', type: 'promo',   title: 'B' },
        ];
        const dismissed = new Set();
        const events = [];
        const handler = e => events.push(e.detail);
        window.addEventListener('announcement-badge', handler);
        emitBadge(anns, dismissed);
        window.removeEventListener('announcement-badge', handler);
        expect(events[0].count).toBe(2);
    });
});
