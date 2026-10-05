/**
 * Tests for the Settings panel's per-device switches: Top Bar Metrics, Animations,
 * Portrait Lock.
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
import { deviceAppearance } from '../../test-utils.js';
import './ag-config-panel.js';
import './ag-top-bar.js';
import './ag-log-viewer.js';

const SETTINGS = ['topBarMetrics', 'animationsEnabled', 'lockPortrait'];

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

describe('Settings — Top Bar Metrics', () => {
    it('is offered, on by default', async () => {
        const sw = switchOf(await mount('ag-config-panel'), 'Top Bar Metrics');

        expect(sw).toBeTruthy();
        expect(sw.checked).toBe(true);
    });

    it('switched off, is remembered on this device and announced', async () => {
        // Announced as Animations is: a window event carrying detail.enabled.
        const heard = vi.fn();
        window.addEventListener('topbar-metrics-changed', heard);
        const sw = switchOf(await mount('ag-config-panel'), 'Top Bar Metrics');

        await flip(sw, false);

        window.removeEventListener('topbar-metrics-changed', heard);
        expect(AppState.topBarMetrics).toBe(false);
        expect(localStorage.getItem('topBarMetrics')).toBe('false');
        expect(heard.mock.calls.map(([e]) => e.detail)).toEqual([{ enabled: false }]);
    });

    it('takes the top bar with it, without a reload', async () => {
        const panel = await mount('ag-config-panel');
        const bar = await mount('ag-top-bar');
        expect(bar.querySelectorAll('.system-metrics .metric')).toHaveLength(4);

        await flip(switchOf(panel, 'Top Bar Metrics'), false);
        await bar.updateComplete;

        expect(bar.querySelectorAll('.system-metrics .metric')).toHaveLength(0);
    });

    it('shows the state of this device when the panel opens', async () => {
        const panel = await mount('ag-config-panel');
        AppState.topBarMetrics = false;   // set elsewhere — another open of the panel

        panel.active = true;
        await panel.updateComplete;

        expect(switchOf(panel, 'Top Bar Metrics').checked).toBe(false);
    });
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

describe('Settings — Appearance', () => {
    /** The Appearance menu of a panel. */
    const menuOf = (panel) => panel.querySelector('#config-appearance');

    /** Pick a choice the way a finger does: through the menu. */
    async function choose(panel, value) {
        const menu = menuOf(panel);
        menu.value = value;
        menu.dispatchEvent(new Event('change', { bubbles: true }));
        await panel.updateComplete;
    }

    /** A device that never chose, in the light palette. */
    function reset() {
        for (const key of ['appearance', 'darkMode']) {
            localStorage.removeItem(key);
            MemoryCache._cache.delete(key);
        }
        AppState.appearance = 'auto';
        AppState.darkMode = false;
        document.documentElement.classList.remove('dark-mode');
        document.body.classList.remove('dark-mode');
    }

    beforeEach(reset);
    afterEach(reset);

    it('offers Automatic, Light and Dark — Automatic on a device that never chose', async () => {
        const menu = menuOf(await mount('ag-config-panel'));
        expect([...menu.options].map(o => o.textContent.trim())).toEqual(['Automatic', 'Light', 'Dark']);
        expect(menu.value).toBe('auto');
        expect(menu.labels[0].textContent.trim()).toBe('Appearance');
    });

    it('replaces the light/dark switch', async () => {
        expect(switchOf(await mount('ag-config-panel'), 'Light/Dark Mode')).toBeUndefined();
    });

    it('set to Dark, is remembered on this device and applied', async () => {
        const panel = await mount('ag-config-panel');

        await choose(panel, 'dark');

        expect(localStorage.getItem('appearance')).toBe('dark');
        expect(AppState.appearance).toBe('dark');
        expect(AppState.darkMode).toBe(true);
        expect(document.body.classList.contains('dark-mode')).toBe(true);
        expect(document.documentElement.classList.contains('dark-mode')).toBe(true);
    });

    it('set to Automatic, takes the device\'s palette', async () => {
        deviceAppearance(true);
        const panel = await mount('ag-config-panel');
        await choose(panel, 'light');
        expect(document.body.classList.contains('dark-mode')).toBe(false);

        await choose(panel, 'auto');

        expect(localStorage.getItem('appearance')).toBe('auto');
        expect(document.body.classList.contains('dark-mode')).toBe(true);
    });

    it('shows the setting of this device when the panel opens', async () => {
        const panel = await mount('ag-config-panel');
        AppState.appearance = 'dark';   // set elsewhere — another open of the panel

        panel.active = true;
        await panel.updateComplete;

        expect(menuOf(panel).value).toBe('dark');
    });
});

describe('Settings — Appearance across a reload', () => {
    // As for Top Bar Metrics below: the API key must be in storage for a reload. And a
    // page starts without the MemoryCache of the one before: the reloads of this file
    // share a window, where the last one left its cache — and the settings it read.
    beforeEach(() => {
        localStorage.setItem('apiKey', 'test-key');
        delete window.MemoryCache;
        vi.resetModules();
    });

    afterEach(() => {
        for (const key of ['apiKey', 'appearance', 'darkMode']) localStorage.removeItem(key);
        document.documentElement.classList.remove('dark-mode');
        document.body.classList.remove('dark-mode');
    });

    it('comes back dark on a device whose old switch was on', async () => {
        localStorage.setItem('darkMode', 'true');

        const { AppState: reloaded } = await import('../../common.js');

        expect(reloaded.appearance).toBe('dark');
        expect(reloaded.darkMode).toBe(true);
        expect(document.body.classList.contains('dark-mode')).toBe(true);
    });

    it('comes back Automatic, in the device\'s palette, everywhere else', async () => {
        deviceAppearance(true);

        const { AppState: reloaded } = await import('../../common.js');

        expect(reloaded.appearance).toBe('auto');
        expect(reloaded.darkMode).toBe(true);
    });
});

describe('Settings — Top Bar Metrics across a reload', () => {
    // A reload evaluates every module again, the API key's among them: without one in
    // storage, core/config.js stops to ask for it, which a test has no way to answer.
    beforeEach(() => {
        localStorage.setItem('apiKey', 'test-key');
        vi.resetModules();
    });

    afterEach(() => {
        localStorage.removeItem('apiKey');
    });

    it('comes back off on a device that switched it off', async () => {
        localStorage.setItem('topBarMetrics', 'false');

        const { AppState: reloaded } = await import('../../common.js');

        expect(reloaded.topBarMetrics).toBe(false);
    });

    it('comes back on everywhere else', async () => {
        const { AppState: reloaded } = await import('../../common.js');

        expect(reloaded.topBarMetrics).toBe(true);
    });
});
