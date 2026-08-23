/**
 * Guards for the Config tab's refresh after a first-time setup.
 *
 * The defect these lock down: the tab kept showing the pre-setup view — banner,
 * NOT CONFIGURED tiles — until the page was reloaded by hand, at the exact
 * moment an owner is looking for confirmation that something happened.
 *
 * The refresh code was written and correct. It never ran. The provisioning panel
 * lives inside <ag-modal>, and the page hands the modal a template through
 * `.bodyTemplate`. Lit binds a listener's `this` to the component that RENDERS a
 * template, not to the one that wrote it — so both handlers were invoked on the
 * modal and threw `is not a function` on their first line, uncaught and with
 * nothing on screen. Measured against the running dev box: the core answered
 * `configured: true` for all three services while the tab showed none of it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class { connectedCallback() {} disconnectedCallback() {} },
    html: (strings, ...values) => ({ strings, values }),
    nothing: null,
}));
vi.mock('../../common.js', () => ({
    apiGet: vi.fn(), apiPost: vi.fn(), showToast: vi.fn(), showConfirm: vi.fn(), handleError: vi.fn(),
}));
vi.mock('../../auth.js', () => ({ isGuest: () => false, isAdmin: () => true }));
vi.mock('../../core/FetchController.js', () => ({
    FetchController: class { constructor(_host, opts) { this.opts = opts; } fetch() { return Promise.resolve(); } },
}));
vi.mock('@lit/context', () => ({ ContextConsumer: class {} }));
vi.mock('../../core/app-context.js', () => ({ appContext: {} }));
vi.mock('./ag-audio-stack-provisioning.js', () => ({}));
vi.mock('./ag-card-grid.js', () => ({}));
vi.mock('../molecules/ag-config-card.js', () => ({}));
vi.mock('./ag-modal.js', () => ({}));

import { apiGet } from '../../common.js';
import { AgConfigPage } from './ag-config-page.js';

const STATUS = {
    outputs: [{ hw: 'hw:0,0', card_name: 'Abacus' }],
    library_sources: [{ kind: 'mount', path: '/mnt/musics' }],
    services: [
        { service_id: 'mpd', configured: true, output: null },
        { service_id: 'upmpdcli', configured: true, output: null },
        { service_id: 'airplay', configured: true, output: null },
    ],
};

/** A stand-in for <ag-modal>: it renders the template, so Lit calls the
 *  listeners with the modal as `this`. It has none of the page's methods. */
const THE_MODAL = { tagName: 'AG-MODAL' };

beforeEach(() => vi.clearAllMocks());

describe('the handlers given to the modal survive being called by it', () => {
    it('stores the status even when invoked with the modal as `this`', () => {
        const page = new AgConfigPage();

        page._boundHandleStatusLoaded.call(THE_MODAL, { detail: STATUS });

        expect(page._statusServices).toHaveLength(3);
        expect(page._provisionableIds).toEqual(['mpd', 'upmpdcli', 'airplay']);
    });

    it('reloads the services grid even when invoked with the modal as `this`', async () => {
        const page = new AgConfigPage();
        const fetched = vi.spyOn(page.servicesFetch, 'fetch');

        await page._boundHandleProvisioned.call(THE_MODAL);

        expect(fetched).toHaveBeenCalled();
    });

    it('does not ask the box for the status a second time', async () => {
        // The panel re-reads it right after dispatching `provisioned` and hands
        // it over through `status-loaded`, so fetching it here too asked the same
        // question twice for one click — 80 ms and half a dozen process creations
        // on the box (lsblk, findmnt, a `sudo cat` per service).
        const page = new AgConfigPage();
        const status = vi.spyOn(page, '_loadAudioStatus');

        await page._boundHandleProvisioned.call(THE_MODAL);

        expect(status).not.toHaveBeenCalled();
        expect(apiGet).not.toHaveBeenCalledWith('/audio-stack/status');
    });

    it('is what makes the banner go away without a reload', () => {
        const page = new AgConfigPage();
        page._boundHandleStatusLoaded.call(THE_MODAL, {
            detail: { ...STATUS, services: STATUS.services.map(s => ({ ...s, configured: false })) },
        });
        expect(page._boxIsNew).toBe(true);          // the pre-setup view

        page._boundHandleStatusLoaded.call(THE_MODAL, { detail: STATUS });

        expect(page._boxIsNew).toBe(false);         // and it is gone
    });

    it('throws nothing where the unbound methods did', () => {
        const page = new AgConfigPage();

        // The shape of the original defect, kept as the thing NOT to go back to.
        expect(() => page._handleStatusLoaded.call(THE_MODAL, { detail: STATUS }))
            .toThrow(/is not a function/);
        expect(() => page._boundHandleStatusLoaded.call(THE_MODAL, { detail: STATUS }))
            .not.toThrow();
    });
});

describe('the modal template uses the bound handlers', () => {
    // The binding is only load-bearing at the CALL SITE: re-introducing
    // `@provisioned=${this._handleProvisioned}` compiles, and passes every
    // behavioural test above, while bringing the defect straight back. So this
    // reads the actual function the template hands over — a first attempt that
    // merely checked "a function is passed" was satisfied by the unbound one too.
    const listenersOf = (node, found = {}) => {
        if (!node || typeof node !== 'object') return found;
        if (Array.isArray(node)) { node.forEach(n => listenersOf(n, found)); return found; }
        if (node.strings) {
            node.strings.forEach((s, i) => {
                const m = /@([a-z-]+)=$/.exec(s.trimEnd());
                if (m && i < node.values.length) found[m[1]] = node.values[i];
                listenersOf(node.values[i], found);
            });
        }
        return found;
    };

    const openModal = () => {
        const page = new AgConfigPage();
        page._showInitModal = true;
        page._statusServices = STATUS.services.map(s => ({ ...s, configured: false }));
        return page;
    };

    it('hands over the bound handlers themselves, not the raw methods', () => {
        const page = openModal();
        const listeners = listenersOf(page.render());

        expect(listeners['status-loaded']).toBe(page._boundHandleStatusLoaded);
        expect(listeners['provisioned']).toBe(page._boundHandleProvisioned);
        expect(listeners['status-loaded']).not.toBe(page._handleStatusLoaded);
        expect(listeners['provisioned']).not.toBe(page._handleProvisioned);
    });

    it('hands over functions that keep working off the page', () => {
        // The property that actually matters, asserted on what the template gives.
        const page = openModal();
        const listeners = listenersOf(page.render());

        expect(() => listeners['status-loaded'].call(THE_MODAL, { detail: STATUS })).not.toThrow();
        expect(page._statusServices).toHaveLength(3);
    });
});
