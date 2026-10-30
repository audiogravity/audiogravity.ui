/**
 * The page's half of the number on the app's icon: telling the service worker that the
 * app is looked at — when it starts, and each time it comes back to the foreground.
 * What the worker does with the message is sw.test.js's.
 */
import { describe, it, expect, vi } from 'vitest';
import { CLEAR_BADGE, clearAppBadge, watchAppBadge } from './app-badge.js';
import { readStylesheet } from '../test-utils.js';

/** A navigator whose icon can carry a number, with a worker in control of the page. */
function badgingNav() {
    const postMessage = vi.fn();
    return { nav: { setAppBadge: vi.fn(), serviceWorker: { controller: { postMessage } } }, postMessage };
}

/** A document whose visibility the test sets, as switching apps does. */
function page(visibilityState = 'visible') {
    const doc = new EventTarget();
    doc.visibilityState = visibilityState;
    const become = (state) => {
        doc.visibilityState = state;
        doc.dispatchEvent(new Event('visibilitychange'));
    };
    return { doc, become };
}

describe('the app tells the worker when it is looked at', () => {
    it('says so as soon as it starts', () => {
        const { nav, postMessage } = badgingNav();
        watchAppBadge({ nav, doc: page().doc });
        expect(postMessage).toHaveBeenCalledWith(CLEAR_BADGE);
    });

    it('says so again on each return to the foreground, and not when it leaves', () => {
        const { nav, postMessage } = badgingNav();
        const { doc, become } = page();
        watchAppBadge({ nav, doc });
        postMessage.mockClear();

        become('hidden');
        expect(postMessage, 'told on leaving the screen').not.toHaveBeenCalled();
        become('visible');
        expect(postMessage).toHaveBeenCalledTimes(1);
        expect(postMessage).toHaveBeenCalledWith(CLEAR_BADGE);
    });

    it('wakes no worker where an icon carries no number', () => {
        const postMessage = vi.fn();
        clearAppBadge({ serviceWorker: { controller: { postMessage } } });
        expect(postMessage).not.toHaveBeenCalled();
    });

    it('is how both pages the app opens on start — the interface and the sign-in page', () => {
        // Without a session the installed app opens on login.html, which does not load
        // main.js: the number stayed on the icon there until the sign-in (code review,
        // 2026-10-30).
        for (const page of ['main.js', 'login.js']) {
            expect(readStylesheet('js', page), page).toMatch(/\bwatchAppBadge\(\);/);
        }
    });

    it('does nothing, and throws nothing, with no worker in control', () => {
        // The dev server unregisters every worker (common.js); some browsers have none.
        expect(() => clearAppBadge({ setAppBadge: vi.fn(), serviceWorker: { controller: null } }))
            .not.toThrow();
        expect(() => clearAppBadge({ setAppBadge: vi.fn() })).not.toThrow();
    });
});
