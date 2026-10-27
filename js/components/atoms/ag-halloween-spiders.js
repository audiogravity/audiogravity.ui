/**
 * @module AgHalloweenSpiders
 * @description Halloween in the app, every 31 October by the device's own clock: spiders let
 * down on a thread from the top of the page, in the screen's side gutters. Each comes down,
 * bounces a little on the silk, hangs there swaying, then climbs back out of sight, as the
 * landing's do (audiogravity.site, assets/halloween.css and halloween.js). No webs (user's
 * choice, 2026-10-27).
 *
 * Decoration only: the layer takes no pointer and no screen reader reads it. It lives in the
 * page's own layer (index.html puts it in .main-content): above the page, under anything
 * opened in it — a profile's or a service's window, a menu — and under everything fixed above
 * the page. Placed beside the page, it was drawn over those windows (code review, seen in
 * Chromium, 2026-10-27). Its threads come out from under the bar, the app's name and the tabs,
 * whatever their height on this screen — measured, not worked out: a thread let down from the
 * top of the screen crossed the app's name and the tabs on a computer.
 *
 * On any other day it draws nothing, and so it does for a viewer who asks for less motion. The
 * day is public/halloween-boot.js's to say — it puts the dress on and takes it off, at midnight
 * too — and this element follows it through HalloweenController. The sign-in page hangs the
 * same two (login.html), with nothing fixed above them there.
 *
 * @element ag-halloween-spiders
 *
 * @attr {boolean} preview - Shows the spiders whatever the date (Storybook). `?halloween` in the
 *   app's address does the same, to look at them on any day.
 *
 * @dependency css/components/halloween.css - Classes .ag-hw-*, the drawing (pics/halloween)
 */
import { LitElement, html, nothing } from 'lit';
import { HalloweenController } from '../../core/HalloweenController.js';

/**
 * The spiders, by their place: the left edge and the right edge. A third, two thirds of the way
 * across a computer's screen, covered the Library's Search button while it hung (Chromium,
 * 2026-10-27): the middle of the screen is some page's button; the gutters are no page's.
 */
const SPIDERS = [1, 2];

/**
 * What is fixed at the top of the screen, above the page: the bar, the app's name, the offline
 * banner — parked above the screen while the device has a network, it follows navigator.onLine
 * (pwa-manager.js), not the box — and the tabs when they are a bar: only the column is marked
 * (ag-tabs), and a column runs to the screen's foot.
 */
const CHROME = ['.topbar', '.app-title-bar', '.offline-banner', '.tabs:not(.tabs--vertical)'];

export class AgHalloweenSpiders extends LitElement {
    static properties = {
        preview: { type: Boolean },
        _still: { state: true },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.preview = false;
        this._still = false;
        this._halloween = new HalloweenController(this);
        this._watching = null;
        this._onResize = () => this._measure();
        this._onMotion = () => { this._still = Boolean(this._lessMotion?.matches); };
    }

    connectedCallback() {
        super.connectedCallback();
        // A viewer who asks for less motion gets no spider: nothing drawn, measured or watched.
        this._lessMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;
        this._lessMotion?.addEventListener('change', this._onMotion);
        this._onMotion();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._lessMotion?.removeEventListener('change', this._onMotion);
        this._unwatch();
    }

    /** Whether the spiders are drawn: on the day or for a preview, and with motion allowed. */
    get _shown() {
        return (this._halloween.on || this.preview) && !this._still;
    }

    /**
     * Where the page shows below what is fixed at the top of the screen — the bar, the app's
     * name, the offline banner, the tabs when they are a bar: the line the threads come out of
     * (--ag-hw-top). Not the content's own top: on a phone the content starts at the top of
     * the screen and runs under the bar (layout.css). Read when the spiders come out, again at
     * the next frame and once the page has loaded — the bar and the tabs are drawn by components
     * of their own, after this one: read at once, a phone's bar measured nothing (Chromium,
     * 2026-10-27) — on each resize, when the offline banner comes or goes (it slides: read at
     * the end of its move too) and when the tabs turn from a bar into a column or back. Only
     * while the spiders are out, and not at all while the app's own Animations setting is off:
     * the stylesheet hides them then (body.no-animations), and a resize would lay the page out
     * for nothing (code review, 2026-10-27). Turning the setting on again changes the body's
     * class, which _watch follows: read then. Read too early, the threads start higher, under
     * the bar, which hides them.
     */
    _measure() {
        if (document.body.classList.contains('no-animations')) return;
        const bottoms = CHROME
            .map((selector) => document.querySelector(selector)?.getBoundingClientRect())
            .filter((box) => box && box.height > 0 && box.bottom > 0)
            .map((box) => box.bottom);
        this.style.setProperty('--ag-hw-top', `${Math.round(Math.max(0, ...bottoms))}px`);
    }

    /** Follow what moves the line: the window's size, the offline banner, the tabs' shape. */
    _watch() {
        if (this._watching) return;
        const observer = new MutationObserver(this._onResize);
        // body.is-offline brings the banner down; ag-tabs' class turns the bar into a column.
        observer.observe(document.body, { attributeFilter: ['class'] });
        const tabs = document.querySelector('ag-tabs');
        if (tabs) observer.observe(tabs, { attributeFilter: ['class'] });
        const banner = document.querySelector('.offline-banner');
        banner?.addEventListener('transitionend', this._onResize);
        window.addEventListener('resize', this._onResize);
        if (document.readyState !== 'complete') window.addEventListener('load', this._onResize, { once: true });
        this._watching = { observer, banner };
    }

    /** Stop following it: the spiders are gone, or the element is. */
    _unwatch() {
        if (!this._watching) return;
        this._watching.observer.disconnect();
        this._watching.banner?.removeEventListener('transitionend', this._onResize);
        window.removeEventListener('resize', this._onResize);
        window.removeEventListener('load', this._onResize);
        this._watching = null;
    }

    updated() {
        if (!this._shown) {
            this._unwatch();
            return;
        }
        this._measure();
        requestAnimationFrame(this._onResize);
        this._watch();
    }

    render() {
        if (!this._shown) return nothing;
        return html`
            <div class="ag-hw-sky" aria-hidden="true">
                ${SPIDERS.map((n) => html`
                    <div class="ag-hw-spider ag-hw-s${n}">
                        <div class="ag-hw-sway"><div class="ag-hw-body"></div></div>
                    </div>
                `)}
            </div>
        `;
    }
}

customElements.define('ag-halloween-spiders', AgHalloweenSpiders);
