/**
 * Tests for the Settings panel's per-device switches: Animations, Portrait Lock.
 *
 * Rendered for real, unlike ag-config-panel.test.js, which reads the panel's source:
 * what is under test here is behaviour — this device remembers the choice, and what
 * shows it follows without a reload — and only running it can show that.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Partial: common.js calls initAuth as it loads, so the real module must stay.
vi.mock(import('../../auth.js'), async (importOriginal) => ({
    ...(await importOriginal()),
    // common.js gates its own module load on this and throws otherwise.
    requireAuth: () => true,
}));

import { AppState, MemoryCache } from '../../common.js';
import './ag-config-panel.js';
import './ag-log-viewer.js';

const SETTINGS = ['animationsEnabled', 'lockPortrait'];

/** Mount an element in the document and wait for its first render. */
async function mount(tag) {
    const el = document.createElement(tag);
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
}

/** A switch of the panel, found by the label of its row. */
function switchOf(panel, label) {
    const row = [...panel.querySelectorAll('.config-item-row')]
        .find(r => r.querySelector('label')?.textContent.trim() === label);
    return row?.querySelector('ag-switch');
}

/** Flip a switch the way a finger does: through its checkbox. */
async function flip(sw, checked) {
    const box = sw.querySelector('input[type="checkbox"]');
    box.checked = checked;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    await sw.updateComplete;
}

/** A fetch answering whatever is asked — the panel asks the core its version. */
function coreAnswering() {
    return vi.fn(async () => new Response(JSON.stringify({ version: '0.0.0-test', logs: [] }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
    }));
}

beforeEach(() => {
    vi.stubGlobal('fetch', coreAnswering());
    for (const key of SETTINGS) {
        localStorage.removeItem(key);
        MemoryCache._cache.delete(key);
        AppState[key] = true;
    }
});

afterEach(() => {
    document.body.innerHTML = '';
    document.body.classList.remove('no-animations');
    for (const key of SETTINGS) {
        localStorage.removeItem(key);
        AppState[key] = true;
    }
    vi.unstubAllGlobals();
});

describe('Settings — Animations', () => {
    it('switched off, is remembered on this device and stops the motion', async () => {
        const sw = switchOf(await mount('ag-config-panel'), 'Animations');

        await flip(sw, false);

        expect(AppState.animationsEnabled).toBe(false);
        expect(localStorage.getItem('animationsEnabled')).toBe('false');
        expect(document.body.classList.contains('no-animations')).toBe(true);
    });

    it('is announced to what animates on its own', async () => {
        // The tabs (their bell) and the log viewer (its LIVE badge) listen for it,
        // and nothing ever sent it: they kept the old setting until a reload.
        const heard = vi.fn();
        window.addEventListener('animations-changed', heard);
        const sw = switchOf(await mount('ag-config-panel'), 'Animations');

        await flip(sw, false);
        await flip(sw, true);

        window.removeEventListener('animations-changed', heard);
        expect(heard.mock.calls.map(([e]) => e.detail)).toEqual([{ enabled: false }, { enabled: true }]);
    });

    it('takes the log viewer with it, without a reload', async () => {
        const panel = await mount('ag-config-panel');
        const viewer = await mount('ag-log-viewer');
        expect(viewer.animationsEnabled).toBe(true);

        await flip(switchOf(panel, 'Animations'), false);

        expect(viewer.animationsEnabled).toBe(false);
    });
});

describe('Settings — Portrait Lock', () => {
    it('switched off, is remembered on this device', async () => {
        // Offered on touch screens only: the handler is driven directly here.
        const panel = await mount('ag-config-panel');

        panel._handleLockPortrait({ detail: { checked: false } });

        expect(panel.lockPortrait).toBe(false);
        expect(AppState.lockPortrait).toBe(false);
        expect(localStorage.getItem('lockPortrait')).toBe('false');
    });
});
