/**
 * Log messages are shown as text, once.
 *
 * Both log views passed each message through escapeHtml() and THEN interpolated
 * it into a Lit template, which escapes text itself. The message was escaped
 * twice: dpkg's "hqplayerd depends on libomp5-19 (>= 1:19.1.6)" reached the
 * screen as "(&gt;= 1:19.1.6)". The fix drops escapeHtml(), so these tests also
 * guard what that removal must not reopen: a message carrying markup — log
 * lines relay third-party output — has to stay text, never become elements.
 *
 * Real Lit here, unlike ag-logs-modal.test.js, which replaces it and so cannot
 * see escaping at all.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Partial, as elsewhere: common.js calls initAuth as it loads and throws unless
// requireAuth says the session is logged in.
vi.mock(import('../../auth.js'), async (importOriginal) => ({
    ...(await importOriginal()),
    isGuest: () => false,
    isAdmin: () => true,
    requireAuth: () => true,
}));

import './ag-logs-modal.js';
import './ag-log-viewer.js';

const DPKG = 'hqplayerd depends on libomp5-19 (>= 1:19.1.6); however: '
    + 'Package libomp5-19 is not installed.';
const MARKUP = '<img src="x" onerror="window.__pwned = true"><b>bold</b>';

/** Let Lit (and a nested ag-modal) finish rendering. */
async function settle(el) {
    for (let i = 0; i < 4; i++) {
        await el.updateComplete;
        const modal = el.querySelector('ag-modal');
        if (modal) await modal.updateComplete;
        await Promise.resolve();
    }
}

describe.each([
    ['ag-logs-modal', (el) => { el.isOpen = true; }],
    ['ag-log-viewer', (el) => { el.autoRefresh = false; }],
])('%s', (tag, open) => {
    let el;

    beforeEach(() => {
        document.body.innerHTML = '';
        delete window.__pwned;
        el = document.createElement(tag);
        // Nothing here may reach a server: the viewer fetches on connect.
        el._fetchLogs = vi.fn();
        el.loadLogs = vi.fn();
        open(el);
        document.body.appendChild(el);
    });

    afterEach(() => { document.body.innerHTML = ''; });

    const show = async (message) => {
        el.logs = [{
            timestamp: '2026-09-21T12:40:56Z', level: 'error', message,
            // the viewer's shape
            time: '14:40:56', priority: 3,
        }];
        await settle(el);
        return el.querySelector('.log-msg');
    };

    it('shows ">=" as ">="', async () => {
        const msg = await show(DPKG);
        expect(msg).not.toBeNull();
        expect(msg.textContent).toContain('(>= 1:19.1.6)');
        expect(msg.textContent).not.toContain('&gt;');
    });

    it('keeps markup in a message as text', async () => {
        const msg = await show(MARKUP);
        expect(msg.textContent).toContain('<img');
        expect(msg.querySelector('img')).toBeNull();
        expect(msg.querySelector('b')).toBeNull();
        expect(window.__pwned).toBeUndefined();
    });
});
