/**
 * @module HalloweenController
 * @description The app's Halloween dress, as a component reads it: on while <html> carries the
 * class public/halloween-boot.js keeps there — every 31 October by the device's clock, or with
 * `?halloween` in the address. That script holds the one rule and puts the class on and off, at
 * midnight too; nothing here reads the date. Most of the dress is drawn by CSS from the class
 * alone (css/components/halloween.css); a component draws its part through this controller,
 * which renders it again whenever the class comes or goes.
 *
 * @example
 * constructor() {
 *     super();
 *     this._halloween = new HalloweenController(this);
 * }
 * render() {
 *     return this._halloween.on ? html`…` : nothing;
 * }
 */

/** The class on <html> that says it is Halloween. */
export const HALLOWEEN_CLASS = 'ag-halloween';

/**
 * Whether the app wears its Halloween dress now.
 *
 * @returns {boolean}
 */
export function isHalloween() {
    return document.documentElement.classList.contains(HALLOWEEN_CLASS);
}

export class HalloweenController {
    /**
     * @param {import('lit').ReactiveControllerHost} host
     */
    constructor(host) {
        this.host = host;
        /** @type {boolean} Whether it is Halloween, as of the host's last render. */
        this.on = false;
        this._observer = null;
        host.addController(this);
    }

    hostConnected() {
        // Read again on every connection: a host taken out of the page and put back — a view
        // left and opened again — may come back on another day, and nothing else would draw it.
        const on = isHalloween();
        if (on !== this.on) {
            this.on = on;
            this.host.requestUpdate();
        }
        // Only the class attribute of <html>: the light or dark appearance, a tab change's
        // transition, the splash screen, this. The callback compares, so another class's change
        // costs a lookup and no render.
        this._observer = new MutationObserver(() => {
            const on = isHalloween();
            if (on === this.on) return;
            this.on = on;
            this.host.requestUpdate();
        });
        this._observer.observe(document.documentElement, { attributeFilter: ['class'] });
    }

    hostDisconnected() {
        this._observer?.disconnect();
        this._observer = null;
    }
}
