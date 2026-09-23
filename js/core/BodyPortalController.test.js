/**
 * Unit tests for BodyPortalController.js — dialogs rendered on <body>.
 *
 * The reason it exists cannot be seen here: jsdom lays nothing out, so a modal stuck
 * under `.main-content`'s stacking context renders the same DOM as one on top. What is
 * held is the contract that makes the escape work — the template lands on <body>, not
 * in the host; it follows the host's updates with its bindings intact; it leaves with
 * the host and comes back with it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { LitElement, html, nothing } from 'lit';
import { BodyPortalController } from './BodyPortalController.js';

class PortalHost extends LitElement {
    static properties = { open: { type: Boolean }, label: { type: String } };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.open = false;
        this.label = 'Delete';
        this.clicks = 0;
        this._dialogs = new BodyPortalController(this, () => (this.open ? html`
            <div class="probe-dialog">
                <button @click=${this._onClick}>${this.label}</button>
            </div>` : nothing));
    }

    _onClick() { this.clicks += 1; }

    render() { return html`<p class="probe-page">page</p>`; }
}
customElements.define('probe-portal-host', PortalHost);

/** Mount a host inside a stand-in for `.main-content`. */
async function mount() {
    const main = document.createElement('main');
    main.className = 'main-content';
    document.body.appendChild(main);
    const el = document.createElement('probe-portal-host');
    main.appendChild(el);
    await el.updateComplete;
    return el;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('BodyPortalController', () => {
    it('renders on <body>, outside the host and outside .main-content', async () => {
        const el = await mount();
        el.open = true;
        await el.updateComplete;
        const dialog = document.querySelector('.probe-dialog');
        expect(dialog).not.toBeNull();
        expect(el.contains(dialog)).toBe(false);
        expect(document.querySelector('.main-content').contains(dialog)).toBe(false);
        expect(dialog.parentElement.parentElement).toBe(document.body);
    });

    it('follows the host\'s updates, and keeps the host as the `this` of its listeners', async () => {
        const el = await mount();
        el.open = true;
        await el.updateComplete;
        el.label = 'Deleting…';
        await el.updateComplete;
        const button = document.querySelector('.probe-dialog button');
        expect(button.textContent).toBe('Deleting…');
        button.click();
        expect(el.clicks).toBe(1);
        el.open = false;
        await el.updateComplete;
        expect(document.querySelector('.probe-dialog')).toBeNull();
    });

    it('leaves with the host, container and all', async () => {
        const el = await mount();
        el.open = true;
        await el.updateComplete;
        el.remove();
        expect(document.querySelector('.probe-dialog')).toBeNull();
        expect(document.querySelector('.ag-body-portal')).toBeNull();
    });

    it('comes back with the host, as it was', async () => {
        const el = await mount();
        el.open = true;
        await el.updateComplete;
        const main = el.parentElement;
        el.remove();
        main.appendChild(el);
        await el.updateComplete;
        expect(document.querySelectorAll('.ag-body-portal')).toHaveLength(1);
        expect(document.querySelector('.probe-dialog button').textContent).toBe('Delete');
    });

    it('gives each host a container of its own', async () => {
        const a = await mount();
        const b = await mount();
        expect(a._dialogs.container).not.toBe(b._dialogs.container);
        expect(document.querySelectorAll('.ag-body-portal')).toHaveLength(2);
    });
});
