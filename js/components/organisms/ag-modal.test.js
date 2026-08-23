/**
 * @file Guard for ag-modal's document-level Escape listener.
 *
 * The listener is installed on `document`, and it used to be removed only by
 * `updated()` on a `show → false` transition. That was enough for as long as every
 * modal was a permanent child of <body> in index.html: nothing ever removed one from
 * the DOM. It stops being enough the moment a modal is rendered inside a branch Lit
 * can destroy — a tab panel, an admin-only section, a page swapped out on logout. The
 * element goes away while still shown, the transition never happens, and the listener
 * stays alive for the life of the page holding the detached modal and everything its
 * templates reference.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class {
        requestUpdate() {}
        connectedCallback() {}
        disconnectedCallback() {}
    },
    html: (strings, ...values) => ({ strings, values }),
    nothing: null,
}));
vi.mock('lit/directives/class-map.js', () => ({
    classMap: (o) => Object.keys(o).filter((k) => o[k]).join(' '),
}));

import { AgModal } from './ag-modal.js';

/** Build a modal with the DOM bits its lifecycle touches. */
function aModal() {
    const modal = new AgModal();
    modal.classList = { add: vi.fn(), remove: vi.fn(), contains: () => false };
    modal.setAttribute = vi.fn();
    modal.addEventListener = vi.fn();
    return modal;
}

/** Count the capture-phase keydown listeners currently on `document`. */
let installed;

beforeEach(() => {
    installed = new Set();
    vi.spyOn(document, 'addEventListener').mockImplementation((type, fn, capture) => {
        if (type === 'keydown' && capture) installed.add(fn);
    });
    vi.spyOn(document, 'removeEventListener').mockImplementation((type, fn, capture) => {
        if (type === 'keydown' && capture) installed.delete(fn);
    });
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('the Escape listener', () => {
    it('is installed while the modal is shown', () => {
        const modal = aModal();
        modal.show = true;
        modal.updated(new Map([['show', true]]));

        expect(installed.size).toBe(1);
    });

    it('is removed when the modal is hidden', () => {
        const modal = aModal();
        modal.show = true;
        modal.updated(new Map([['show', true]]));
        modal.show = false;
        modal.updated(new Map([['show', false]]));

        expect(installed.size).toBe(0);
    });

    it('is removed when the modal is torn out of the DOM while still shown', () => {
        // The case that had no cover: no show → false transition ever happens, so
        // without disconnectedCallback the listener outlives the element.
        const modal = aModal();
        modal.show = true;
        modal.updated(new Map([['show', true]]));
        expect(installed.size).toBe(1);

        modal.disconnectedCallback();

        expect(installed.size).toBe(0);
    });

    it('survives being disconnected without ever having been shown', () => {
        expect(() => aModal().disconnectedCallback()).not.toThrow();
    });

    it('is not installed at all when escape-close is refused', () => {
        const modal = aModal();
        modal.noEscapeClose = true;
        modal.show = true;
        modal.updated(new Map([['show', true]]));

        expect(installed.size).toBe(0);
    });
});
