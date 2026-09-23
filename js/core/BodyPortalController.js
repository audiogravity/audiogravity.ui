/**
 * @module BodyPortalController
 * @description Renders part of a component's template on <body> rather than inside the
 * component — the dialogs a screen opens.
 *
 * `.main-content` is `position: fixed`, hence a stacking context of its own: a modal
 * rendered anywhere inside a tab stays under the top bar, the tabs and the player bar,
 * whatever its z-index (measured at 1366×768 on the package install dialog, 2026-09-21:
 * its buttons sat under the player bar and every click landed there).
 * ag-audio-software-page and ag-admin-page escape by creating their dialog elements by
 * hand on <body>. This is the same escape for a dialog written as part of a template,
 * which then keeps its bindings — properties, listeners — as if rendered in place.
 *
 * The template is rendered after every update of the host, into one container of its
 * own on <body>, with the host as the `this` of its listeners; Lit only touches what
 * changed, so a render with the dialog closed costs next to nothing. The container
 * leaves with the host.
 *
 * @example
 * constructor() {
 *     super();
 *     this._dialogs = new BodyPortalController(this, () => html`
 *         <ag-modal ?show=${this._confirming} …></ag-modal>`);
 * }
 */
import { nothing, render } from 'lit';

export class BodyPortalController {
    /**
     * @param {import('lit').ReactiveControllerHost & HTMLElement} host
     * @param {() => unknown} template - What to render on <body>; `nothing` for none.
     */
    constructor(host, template) {
        this.host = host;
        this._template = template;
        /** @type {HTMLElement|null} The host's container on <body>, while it is connected. */
        this.container = null;
        host.addController(this);
    }

    hostConnected() {
        if (this.container) return;
        this.container = document.createElement('div');
        this.container.className = 'ag-body-portal';
        document.body.appendChild(this.container);
        // Back in the document after a removal: the container is new and empty, and
        // nothing else would fill it before the host's next change.
        this.host.requestUpdate();
    }

    hostUpdated() {
        if (this.container) render(this._template(), this.container, { host: this.host });
    }

    hostDisconnected() {
        if (!this.container) return;
        render(nothing, this.container);
        this.container.remove();
        this.container = null;
    }
}
