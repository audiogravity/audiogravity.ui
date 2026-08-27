/**
 * Unit tests for getUserFriendlyError — pure error message mapping — and for the
 * password-confirm field's styling contract (site#6).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render } from 'lit';
import { getUserFriendlyError, showPasswordConfirm, downloadBlob, downloadTextFile } from './ui-helpers.js';

describe('getUserFriendlyError', () => {
    it('maps "Failed to fetch" to connection error', () => {
        expect(getUserFriendlyError(new Error('Failed to fetch')))
            .toBe('Unable to connect to server. Please check your connection.');
    });

    it('maps "NetworkError" to network error', () => {
        // One condition, one wording: this used to say something different from the other
        // two transport sentences, for the same event.
        expect(getUserFriendlyError(new Error('NetworkError when attempting...')))
            .toBe('Unable to connect to server. Please check your connection.');
    });

    it('maps WebKit\'s "Load failed" to connection error', () => {
        // Missing from the list until an iPad reported a switched-off box as a wrong password.
        // Every screen going through this helper showed the raw browser sentence on iOS.
        expect(getUserFriendlyError(new Error('Load failed')))
            .toBe('Unable to connect to server. Please check your connection.');
    });

    it('does not turn a TypeError raised after a successful response into a connection error', () => {
        // FetchController wraps its own onSuccess callback in the same try as the request, so this
        // is what a `data.items.map` on a payload without `items` looks like — after an HTTP 200.
        // Reporting it as a dead network hides a real bug behind a plausible excuse.
        const bug = new TypeError("Cannot read properties of undefined (reading 'map')");
        expect(getUserFriendlyError(bug)).toBe(bug.message);
    });

    it('maps HTTP 401', () => {
        expect(getUserFriendlyError(new Error('HTTP 401')))
            .toBe('Invalid API key. Please check your configuration.');
    });

    it('maps HTTP 403', () => {
        expect(getUserFriendlyError(new Error('HTTP 403')))
            .toBe('Access denied. Insufficient permissions.');
    });

    it('maps HTTP 404', () => {
        expect(getUserFriendlyError(new Error('HTTP 404')))
            .toBe('Resource not found.');
    });

    it('maps HTTP 500', () => {
        expect(getUserFriendlyError(new Error('HTTP 500')))
            .toBe('Server error. Please try again later.');
    });

    it('maps HTTP 503', () => {
        expect(getUserFriendlyError(new Error('HTTP 503')))
            .toBe('Service temporarily unavailable. Please try again later.');
    });

    it('returns error.detail when available', () => {
        const err = { message: 'unknown', detail: 'Custom detail message' };
        expect(getUserFriendlyError(err)).toBe('Custom detail message');
    });

    it('returns error.message for unknown errors', () => {
        expect(getUserFriendlyError(new Error('Something weird')))
            .toBe('Something weird');
    });

    it('returns default for empty error', () => {
        expect(getUserFriendlyError({}))
            .toBe('An unexpected error occurred. Please try again.');
    });
});

describe('showPasswordConfirm — field styling contract', () => {
    afterEach(() => {
        document.querySelectorAll('ag-confirm-dialog').forEach((d) => d.remove());
    });

    /**
     * Render the dialog's message template into a detached container and return
     * its password field. The custom element is not defined in this environment,
     * so the template is rendered directly rather than through the component.
     */
    const fieldOf = (dialog) => {
        const container = document.createElement('div');
        render(dialog.messageTemplate, container);
        return container.querySelector('input[type="password"]');
    };

    it('styles the field through .form-control, never an inline font-size', () => {
        // An inline declaration outranks every selector, so a font-size written
        // in a `style` attribute escapes the mobile anti-zoom rule in base.css
        // and makes Safari zoom the page on focus — which pushed the dialog's
        // Confirm button off-screen (site#6).
        const promise = showPasswordConfirm('Confirm update', 'Enter your admin password.');
        const dialog = document.querySelector('ag-confirm-dialog');
        const field = fieldOf(dialog);

        expect(field).not.toBeNull();
        expect(field.classList.contains('form-control')).toBe(true);
        expect(field.getAttribute('style') ?? '').not.toMatch(/font-size/);

        dialog.dispatchEvent(new CustomEvent('dialog-cancel'));
        return expect(promise).resolves.toBeNull();
    });

    it('keeps the password affordances the browser needs', () => {
        const promise = showPasswordConfirm('Confirm', 'message');
        const dialog = document.querySelector('ag-confirm-dialog');
        const field = fieldOf(dialog);

        expect(field.getAttribute('autocomplete')).toBe('current-password');
        expect(field.getAttribute('placeholder')).toBe('Enter your password');

        dialog.dispatchEvent(new CustomEvent('dialog-cancel'));
        return expect(promise).resolves.toBeNull();
    });
});

describe('showPasswordConfirm — dialog contrast', () => {
    it('carries the dialog variant so the field is not the colour of the modal', () => {
        // .modal-dialog is --bg-primary and so is .form-control: without the
        // modifier the input reads as plain text with a hairline around it.
        const promise = showPasswordConfirm('Confirm', 'message');
        const dialog = document.querySelector('ag-confirm-dialog');
        const container = document.createElement('div');
        render(dialog.messageTemplate, container);
        const field = container.querySelector('input[type="password"]');

        expect(field.classList.contains('form-control--dialog')).toBe(true);

        dialog.dispatchEvent(new CustomEvent('dialog-cancel'));
        dialog.remove();
        return expect(promise).resolves.toBeNull();
    });
});


describe('downloadBlob — the two details that decide whether a file is written', () => {
    /** Drive the helper and report what the DOM and the object URL did. */
    function run(fn) {
        const seen = { inDocumentAtClick: null, revokedAtReturn: false };
        const url = 'blob:test-url';
        const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue(url);
        const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click')
            .mockImplementation(function () {
                // Captured DURING the click: that is the only moment it matters.
                seen.inDocumentAtClick = document.body.contains(this);
                seen.hrefAtClick = this.getAttribute('href');
                seen.downloadAtClick = this.getAttribute('download');
            });
        try {
            fn();
            seen.revokedAtReturn = revokeSpy.mock.calls.length > 0;
            seen.blob = createSpy.mock.calls[0]?.[0];
        } finally {
            createSpy.mockRestore(); revokeSpy.mockRestore(); clickSpy.mockRestore();
        }
        return seen;
    }

    it('clicks an anchor that is part of the document', () => {
        // A detached <a download> is ignored by some browsers, and click() then does
        // nothing at all — silently, with no error for anyone to catch.
        const seen = run(() => downloadBlob(new Blob(['x']), 'f.txt'));
        expect(seen.inDocumentAtClick).toBe(true);
        expect(seen.hrefAtClick).toBe('blob:test-url');
        expect(seen.downloadAtClick).toBe('f.txt');
    });

    it('does not revoke the object URL before returning', async () => {
        // click() does not download — it asks the browser to. Revoking on the next
        // line races the browser to the data: the click "succeeds" and no file lands.
        const seen = run(() => downloadBlob(new Blob(['x']), 'f.txt'));
        expect(seen.revokedAtReturn).toBe(false);
    });

    // Restored here, not at the end of the test body: a failure would otherwise leak
    // the click / URL spies into the tests that follow.
    afterEach(() => { vi.restoreAllMocks(); });

    it('still frees the memory, one turn later', async () => {
        const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-url');
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        downloadBlob(new Blob(['x']), 'f.txt');
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(revokeSpy).toHaveBeenCalledWith('blob:test-url');
    });

    it('leaves no anchor behind', () => {
        const before = document.body.children.length;
        run(() => downloadBlob(new Blob(['x']), 'f.txt'));
        expect(document.body.children.length).toBe(before);
    });

    it('downloadTextFile goes through the same path, with the given type', () => {
        const seen = run(() => downloadTextFile('hello', 'a.json', 'application/json'));
        expect(seen.inDocumentAtClick).toBe(true);
        expect(seen.revokedAtReturn).toBe(false);
        expect(seen.blob.type).toBe('application/json');
    });
});
