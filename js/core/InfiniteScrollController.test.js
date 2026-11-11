/**
 * Unit tests for InfiniteScrollController — the next page of a long list, asked for as
 * the reader nears its end. jsdom has no IntersectionObserver: a stand-in records what
 * is observed and lets a test bring the sentinel into view.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InfiniteScrollController } from './InfiniteScrollController.js';

/** Every IntersectionObserver created, newest last. */
let observers;

class FakeIntersectionObserver {
    constructor(callback, options) {
        this.callback = callback;
        this.options = options;
        this.observed = [];
        this.disconnected = false;
        observers.push(this);
    }
    observe(el) { this.observed.push(el); }
    disconnect() { this.disconnected = true; }
    /** Bring the observed sentinel into reach, or take it out. */
    fire(isIntersecting) { this.callback([{ isIntersecting }]); }
}

/**
 * A host holding (or not) a sentinel, with the controller hooks Lit would call.
 *
 * @param {boolean} [withSentinel=true]
 * @returns {HTMLElement & {controllers: object[], addController: Function}}
 */
function makeHost(withSentinel = true) {
    const host = document.createElement('div');
    host.controllers = [];
    host.addController = (c) => host.controllers.push(c);
    host.requestUpdate = vi.fn();
    if (withSentinel) {
        const s = document.createElement('div');
        s.id = 'sentinel';
        host.appendChild(s);
    }
    document.body.appendChild(host);
    return host;
}

beforeEach(() => {
    observers = [];
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
});

afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
});

describe('InfiniteScrollController', () => {
    it('registers itself with its host', () => {
        const host = makeHost();
        const ctrl = new InfiniteScrollController(host, { selector: '#sentinel', onNearEnd() {} });
        expect(host.controllers).toEqual([ctrl]);
    });

    it('asks for the next page when the sentinel comes into reach, and only then', () => {
        const host = makeHost();
        const onNearEnd = vi.fn();
        const ctrl = new InfiniteScrollController(host, { selector: '#sentinel', onNearEnd });
        ctrl.sync(true);

        expect(observers).toHaveLength(1);
        expect(observers[0].observed).toEqual([host.querySelector('#sentinel')]);
        observers[0].fire(false);
        expect(onNearEnd).not.toHaveBeenCalled();
        observers[0].fire(true);
        expect(onNearEnd).toHaveBeenCalledTimes(1);
    });

    it('looks 200 px ahead of the end by default, so the page lands before the reader', () => {
        const ctrl = new InfiniteScrollController(makeHost(), { selector: '#sentinel', onNearEnd() {} });
        ctrl.sync(true);
        expect(observers[0].options.rootMargin).toBe('0px 0px 200px 0px');
    });

    it('attaches once, whatever the number of renders', () => {
        const ctrl = new InfiniteScrollController(makeHost(), { selector: '#sentinel', onNearEnd() {} });
        ctrl.sync(true);
        ctrl.sync(true);
        ctrl.sync(true);
        expect(observers).toHaveLength(1);
    });

    it('stops watching once the list is complete, and watches again when it grows', () => {
        const ctrl = new InfiniteScrollController(makeHost(), { selector: '#sentinel', onNearEnd() {} });
        ctrl.sync(true);
        ctrl.sync(false);
        expect(observers[0].disconnected).toBe(true);
        ctrl.sync(true);
        expect(observers).toHaveLength(2);
    });

    it('waits for the sentinel when the host has not rendered it yet', () => {
        const host = makeHost(false);
        const ctrl = new InfiniteScrollController(host, { selector: '#sentinel', onNearEnd() {} });
        ctrl.sync(true);
        expect(observers).toHaveLength(0);

        const s = document.createElement('div');
        s.id = 'sentinel';
        host.appendChild(s);
        ctrl.sync(true);
        expect(observers[0].observed).toEqual([s]);
    });

    it('looks at the end again once a page has landed', async () => {
        // An observer reports changes only: a sentinel still in reach after a page —
        // a tall screen, a short page — was never reported again, and the list stopped.
        const host = makeHost();
        const ctrl = new InfiniteScrollController(host, {
            selector: '#sentinel', onNearEnd: vi.fn(async () => true) });
        ctrl.sync(true);
        observers[0].fire(true);
        await Promise.resolve(); await Promise.resolve();

        expect(observers[0].disconnected).toBe(true);
        expect(host.requestUpdate).toHaveBeenCalledTimes(1);
        ctrl.sync(true);                          // the host's next render
        expect(observers).toHaveLength(2);        // a new observer reports where the end is
    });

    it('waits for the reader when no page landed — no asking a failing server in a loop', async () => {
        const host = makeHost();
        const ctrl = new InfiniteScrollController(host, {
            selector: '#sentinel', onNearEnd: vi.fn(async () => false) });
        ctrl.sync(true);
        observers[0].fire(true);
        await Promise.resolve(); await Promise.resolve();

        expect(observers[0].disconnected).toBe(false);
        expect(host.requestUpdate).not.toHaveBeenCalled();
    });

    it('lets go of the observer when the host leaves the page', () => {
        const ctrl = new InfiniteScrollController(makeHost(), { selector: '#sentinel', onNearEnd() {} });
        ctrl.sync(true);
        ctrl.hostDisconnected();
        expect(observers[0].disconnected).toBe(true);
        expect(ctrl._observer).toBeNull();
    });
});
