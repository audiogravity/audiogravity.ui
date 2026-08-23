/**
 * Guards for the support report window.
 *
 * The one that matters is the `this` binding: every handler here travels inside a
 * template handed to <ag-modal>, and Lit binds a listener's `this` to the component
 * that RENDERS the template — the modal — not to the one that wrote it. Unbound, the
 * handlers would look for these methods on <ag-modal> and throw on their first line,
 * with nothing on screen. That is the exact defect that made the configuration screen
 * fail to refresh; these tests call each handler *with the modal as `this`*, the way
 * Lit does, so the binding cannot regress unnoticed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class { requestUpdate() {} },
    html: (strings, ...values) => ({ strings, values }),
    nothing: null,
}));

const apiGet = vi.fn();
const copyToClipboard = vi.fn();
const downloadTextFile = vi.fn();
const showToast = vi.fn();
vi.mock('../../api.js', () => ({ apiGet: (...args) => apiGet(...args) }));
vi.mock('../../ui-helpers.js', () => ({
    copyToClipboard: (...args) => copyToClipboard(...args),
    downloadTextFile: (...args) => downloadTextFile(...args),
    showToast: (...args) => showToast(...args),
}));
vi.mock('../../ag-icons.js', () => ({ iconCopy: '', iconDownload: '' }));
vi.mock('./ag-modal.js', () => ({}));

import { AgSupportReport } from './ag-support-report.js';

/** A stand-in for <ag-modal>: it renders the template, so Lit calls the listeners
 *  with the modal as `this`. It knows `show`, and nothing else this component uses. */
const theModal = () => ({ tagName: 'AG-MODAL', show: true, dispatchEvent: vi.fn() });

beforeEach(() => {
    apiGet.mockReset();
    copyToClipboard.mockReset();
    downloadTextFile.mockReset();
    showToast.mockReset();
});

describe('the this binding through ag-modal', () => {
    it('closes itself when the handler is invoked by the modal', () => {
        const el = new AgSupportReport();
        el.show = true;
        el.dispatchEvent = vi.fn();

        el._handleClose.call(theModal());

        expect(el.show).toBe(false);
    });

    it('does not close the modal element instead of itself', () => {
        const el = new AgSupportReport();
        el.show = true;
        el.dispatchEvent = vi.fn();
        const modal = theModal();

        el._handleClose.call(modal);

        expect(modal.show).toBe(true);
    });

    it('copies its own text when the handler is invoked by the modal', async () => {
        const el = new AgSupportReport();
        el._text = 'REPORT BODY';
        copyToClipboard.mockResolvedValue(undefined);

        await el._copy.call(theModal());

        expect(copyToClipboard).toHaveBeenCalledWith('REPORT BODY');
    });

    it('binds the handlers to the instance, not merely to some function', () => {
        // A test that only checks "a function was passed" passes for any function.
        // Identity is the property that actually holds: each handler must be the
        // instance's own bound copy, not the shared prototype method.
        const el = new AgSupportReport();
        for (const name of ['_handleClose', '_copy', '_download']) {
            expect(el[name]).not.toBe(AgSupportReport.prototype[name]);
        }
    });
});

describe('collecting the report', () => {
    it('asks the core only when the window opens', async () => {
        const el = new AgSupportReport();
        apiGet.mockResolvedValue({ report_version: 1 });

        el.show = false;
        el.updated(new Map([['show', false]]));
        expect(apiGet).not.toHaveBeenCalled();

        el.show = true;
        el.updated(new Map([['show', true]]));
        await Promise.resolve();
        expect(apiGet).toHaveBeenCalledWith('/sysinfo/support-report');
    });

    it('does not collect a second time on reopen', async () => {
        // It shells out (lsblk, findmnt, dpkg) — this box is an audio machine before
        // it is a web server.
        const el = new AgSupportReport();
        apiGet.mockResolvedValue({ report_version: 1 });

        await el.load();
        expect(apiGet).toHaveBeenCalledTimes(1);

        el.show = true;
        el.updated(new Map([['show', true]]));
        expect(apiGet).toHaveBeenCalledTimes(1);
    });

    it('shows the failure instead of an empty window', async () => {
        const el = new AgSupportReport();
        apiGet.mockRejectedValue(new Error('403 Forbidden'));

        await el.load();

        expect(el._error).toContain('403 Forbidden');
        expect(el._text).toBe('');
        expect(el._loading).toBe(false);
    });

    it('clears the loading flag on success', async () => {
        const el = new AgSupportReport();
        apiGet.mockResolvedValue({ report_version: 1, box: { ag_version: '0.9.45' } });

        await el.load();

        expect(el._loading).toBe(false);
        expect(el._text).toContain('0.9.45');
    });
});

describe('copy', () => {
    it('does nothing when there is no report yet', async () => {
        const el = new AgSupportReport();
        await el._copy();
        expect(copyToClipboard).not.toHaveBeenCalled();
    });

    it('tells the owner when the browser blocked the clipboard', async () => {
        const el = new AgSupportReport();
        el._text = 'REPORT';
        copyToClipboard.mockRejectedValue(new Error('denied'));

        await el._copy();

        expect(showToast).toHaveBeenCalledWith('error', 'Copy Failed', expect.stringContaining('Download'));
    });
});

describe('download', () => {
    it('does nothing when there is no report yet', () => {
        new AgSupportReport()._download();
        expect(downloadTextFile).not.toHaveBeenCalled();
    });

    it('names the file after the day it was taken', () => {
        const el = new AgSupportReport();
        el._text = 'REPORT';

        el._download.call(theModal());

        expect(downloadTextFile).toHaveBeenCalledWith(
            'REPORT',
            expect.stringMatching(/^audiogravity-support-\d{4}-\d{2}-\d{2}\.txt$/),
        );
    });
});

describe('the template itself', () => {
    // No test used to call render(). CLAUDE.md rule 7 exists because of exactly this:
    // a variable declared under one name and interpolated under another threw a
    // ReferenceError from render(), killed the component, and shipped. The `html` mock
    // returns its parts, so running the template costs nothing.
    const renderOf = (el) => {
        const collected = [];
        const walk = (node) => {
            if (Array.isArray(node)) return node.forEach(walk);
            if (node && typeof node === 'object' && 'values' in node) {
                collected.push(...(node.strings || []));
                return node.values.forEach(walk);
            }
            collected.push(node);
        };
        walk(el.render());
        return collected;
    };

    it('renders while collecting', () => {
        const el = new AgSupportReport();
        el.show = true;
        el._loading = true;
        expect(() => renderOf(el)).not.toThrow();
    });

    it('renders a loaded report', () => {
        const el = new AgSupportReport();
        el.show = true;
        el._text = 'REPORT BODY';
        const parts = renderOf(el);
        expect(parts).toContain('REPORT BODY');
    });

    it('renders a failure', () => {
        const el = new AgSupportReport();
        el.show = true;
        el._error = '403 Forbidden';
        const parts = renderOf(el);
        expect(parts).toContain('403 Forbidden');
    });

    it('renders an untouched component', () => {
        expect(() => renderOf(new AgSupportReport())).not.toThrow();
    });

    it('wires the footer buttons to its own bound handlers', () => {
        // The identity check that matters: the template must hand ag-modal the bound
        // copies, not the prototype methods.
        const el = new AgSupportReport();
        el._text = 'x';
        const parts = renderOf(el);
        for (const name of ['_handleClose', '_copy', '_download']) {
            expect(parts).toContain(el[name]);
        }
    });

    it('refuses backdrop close, so selecting the text cannot dismiss the window', () => {
        // A drag-select starting in the report body and ending on the backdrop
        // dispatches its click on the common ancestor — the overlay. Without this the
        // window would close and destroy the selection, on the one modal whose whole
        // content is text meant to be selected.
        const el = new AgSupportReport();
        const strings = renderOf(el).filter(p => typeof p === 'string').join(' ');
        expect(strings).toContain('no-backdrop-close');
    });
});

describe('reopening after a failure', () => {
    it('does not show the previous error again', async () => {
        const el = new AgSupportReport();
        apiGet.mockRejectedValue(new Error('403 Forbidden'));
        await el.load();
        expect(el._error).toBeTruthy();

        el.dispatchEvent = vi.fn();
        el._handleClose();

        expect(el._error).toBe('');
    });
});
