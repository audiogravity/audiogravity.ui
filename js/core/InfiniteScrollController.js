/**
 * @module InfiniteScrollController
 * @description Loads the next page of a long list as the reader nears its end: an
 * IntersectionObserver on a sentinel element the host renders after its last row.
 *
 * Shared by the library's album grid (ag-library-browse) and the media server browser
 * (ag-library-upnp-browser). The browser used to ask for one page of 200 and stop
 * there: "474 albums" showed 200, and every album after "IRM" could not be reached
 * (measured in Chromium on MinimServer, 2026-11-11).
 *
 * The host renders the sentinel only while there is more to load, and calls
 * {@link InfiniteScrollController#sync} after each render with that same condition.
 * The sentinel is looked up in the host's light DOM by `selector`.
 *
 * Cost when idle: nothing while the list is complete; one observer otherwise, which
 * the browser drives — no scroll listener, no measuring on our side.
 */

export class InfiniteScrollController {
    /**
     * @param {import('lit').ReactiveControllerHost & Element} host - The list's component.
     * @param {object} options
     * @param {string} options.selector - Finds the sentinel in the host (e.g. '#lib-browse-sentinel').
     * @param {() => (boolean|Promise<boolean>)} options.onNearEnd - Called when the sentinel
     *   comes into reach; answers true once a page has landed, which has the end looked at
     *   again — false (or nothing) when no page landed: a failure, a page left stale.
     * @param {string} [options.rootMargin='0px 0px 200px 0px'] - How far ahead of the end
     *   the next page is asked for: 200 px below the viewport, so it lands before the
     *   reader gets there.
     */
    constructor(host, { selector, onNearEnd, rootMargin = '0px 0px 200px 0px' }) {
        this.host = host;
        this.selector = selector;
        this.onNearEnd = onNearEnd;
        this.rootMargin = rootMargin;
        /** @type {IntersectionObserver | null} */
        this._observer = null;
        host.addController(this);
    }

    hostDisconnected() { this.detach(); }

    /**
     * Watch the sentinel while there is more to load, and stop once there is not.
     * Idempotent: called after every render, it attaches once and keeps watching the
     * same sentinel until the list is complete.
     *
     * @param {boolean} active - Whether the list has more to load (the sentinel is rendered).
     */
    sync(active) {
        if (!active) { this.detach(); return; }
        if (this._observer) return;
        const sentinel = this.host.querySelector(this.selector);
        if (!sentinel) return;
        this._observer = new IntersectionObserver(
            (entries) => { if (entries[0]?.isIntersecting) this._reached(); },
            { rootMargin: this.rootMargin },
        );
        this._observer.observe(sentinel);
    }

    /**
     * The sentinel came into reach: ask for the next page, then look at the end again
     * once it has landed. An observer only reports a change, so a sentinel still in
     * reach after a page — a tall screen, a short page — was never reported again, and
     * the list stopped until the reader scrolled away and back. A new observer reports
     * the sentinel's state as soon as it starts: detached here, the host's next
     * {@link InfiniteScrollController#sync} attaches one. Not after a page that did not
     * land — that waits for the reader, rather than asking a failing server again and
     * again.
     *
     * @returns {Promise<void>}
     */
    async _reached() {
        if (!(await this.onNearEnd())) return;
        this.detach();
        this.host.requestUpdate();
    }

    /** Stop watching — the list is complete, reloading, or gone from the page. */
    detach() {
        if (this._observer) { this._observer.disconnect(); this._observer = null; }
    }
}
