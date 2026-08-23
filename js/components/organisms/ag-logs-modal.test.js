/**
 * Guard for the logs modal's own close button.
 *
 * Its three footer handlers go into the template handed to <ag-modal> as
 * `.footerTemplate`, and Lit binds a listener's `this` to the component that
 * RENDERS a template — the modal — not to the one that wrote it. So
 * `this.isOpen = false` was landing on <ag-modal>, which has no `isOpen` (it
 * uses `show`). The dialog closed anyway, but only because ag-audio-software-page
 * listens for the bubbled `close-request` and sets the property itself; on its
 * own — the Storybook story, or any future host — it stayed open.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class { requestUpdate() {} },
    html: (strings, ...values) => ({ strings, values }),
    nothing: null,
}));
vi.mock('lit/directives/class-map.js', () => ({ classMap: (o) => Object.keys(o).filter(k => o[k]).join(' ') }));
// common.js demands authentication at import time and throws in this
// environment — same reason ag-config-panel.test.js avoids importing it.
vi.mock('../../common.js', () => ({ escapeHtml: (s) => s, showToast: vi.fn() }));
vi.mock('../../utils.js', () => ({ logger: { debug: vi.fn(), error: vi.fn() } }));
vi.mock('../../ui-helpers.js', () => ({ copyToClipboard: vi.fn() }));
vi.mock('../../ag-icons.js', () => ({ iconCopy: '' }));
vi.mock('./ag-modal.js', () => ({}));

import { AgLogsModal } from './ag-logs-modal.js';

/** A stand-in for <ag-modal>: it renders the template, so Lit calls the
 *  listeners with the modal as `this`. It uses `show`, not `isOpen`. */
const theModal = () => ({ tagName: 'AG-MODAL', show: true, dispatchEvent: vi.fn() });

describe('closing the logs modal', () => {
    it('closes itself even when the handler is invoked by the modal', () => {
        const el = new AgLogsModal();
        el.isOpen = true;
        el.dispatchEvent = vi.fn();

        el._handleClose.call(theModal());

        expect(el.isOpen).toBe(false);
    });

    it('does not close the modal element instead of itself', () => {
        const el = new AgLogsModal();
        el.isOpen = true;
        el.dispatchEvent = vi.fn();
        const modal = theModal();

        el._handleClose.call(modal);

        expect(modal.isOpen).toBeUndefined();   // nothing was written on the wrong object
        expect(el.dispatchEvent).toHaveBeenCalled();
    });

    it('still asks its host to close, for hosts that drive it themselves', () => {
        const el = new AgLogsModal();
        el.dispatchEvent = vi.fn();

        el._handleCancel.call(theModal());

        const evt = el.dispatchEvent.mock.calls[0][0];
        expect(evt.type).toBe('cancel-request');
        expect(evt.bubbles).toBe(true);
    });
});
