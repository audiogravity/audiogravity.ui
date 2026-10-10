/**
 * Unit tests for getUserFriendlyError — pure error message mapping — and for the
 * password-confirm field's styling contract (site#6).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { html, render } from 'lit';
import { readStylesheet } from './test-utils.js';
import { getUserFriendlyError, showConfirm, showPasswordConfirm, confirmRemoval, downloadBlob, downloadTextFile, showToast, copyToClipboard } from './ui-helpers.js';
import { asNetworkError } from './net-errors.js';

describe('getUserFriendlyError', () => {
    it('reads a tagged transport failure, whatever the engine called it', () => {
        // The tag is set at the fetch site; no wording is read here. The three engine sentences
        // used to be listed by text, which caught a caller's TypeError that merely contained the
        // word "NetworkError" and called a code bug a dead network.
        for (const wording of ['Failed to fetch', 'NetworkError when attempting...', 'Load failed']) {
            expect(getUserFriendlyError(asNetworkError(new TypeError(wording))))
                .toBe('Unable to connect to server. Please check your connection.');
        }
    });

    it('does not turn an untagged TypeError into a connection error', () => {
        // FetchController wraps its own onSuccess callback in the same try as the request, so this
        // is what a `data.items.map` on a payload without `items` looks like — after an HTTP 200.
        for (const wording of ['Load failed', "Cannot read properties of undefined (reading 'map')"]) {
            const bug = new TypeError(wording);
            expect(getUserFriendlyError(bug)).toBe(bug.message);
        }
    });

    it('reads a gateway answer the same way net-errors does', () => {
        // A 502 said "Bad gateway" here and "cannot reach the box" on the login screen, for the
        // one outage both see most: the core stopped behind the front.
        expect(getUserFriendlyError(Object.assign(new Error('HTTP 502'), { status: 502, detail: null })))
            .toBe('Unable to connect to server. Please check your connection.');
        expect(getUserFriendlyError(Object.assign(new Error('HTTP 503'), { status: 503, detail: null })))
            .toBe('Unable to connect to server. Please check your connection.');
        expect(getUserFriendlyError(Object.assign(new Error('WebAuthn not available'), { status: 503, detail: 'WebAuthn not available' })))
            .toBe('WebAuthn not available');
    });

    it('survives being handed nothing', () => {
        expect(getUserFriendlyError(undefined)).toBe('An unexpected error occurred. Please try again.');
        expect(getUserFriendlyError(null)).toBe('An unexpected error occurred. Please try again.');
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

describe('showToast — the type comes first, and a wrong one is said aloud', () => {
    it('coerces an unknown type and reports the call', () => {
        const container = document.createElement('div');
        container.id = 'toastContainer';
        document.body.appendChild(container);
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            showToast('Passkey removed', 'success');
            const toast = container.querySelector('ag-toast-notification');
            expect(toast.type).toBe('info');
            expect(spy).toHaveBeenCalledWith(expect.stringMatching(/showToast\(type, title, message\)/));
        } finally {
            spy.mockRestore();
            container.remove();
        }
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

describe('a confirmation that deletes — the option reaches the dialog', () => {
    afterEach(() => {
        document.querySelectorAll('ag-confirm-dialog').forEach((d) => d.remove());
    });

    it('showConfirm: destructive only when asked', () => {
        const plain = showConfirm('Restart Core', 'Continue?');
        const deletes = showConfirm('Clear History', 'Clear config history?', { destructive: true });
        const [a, b] = document.querySelectorAll('ag-confirm-dialog');
        expect(a.destructive).toBe(false);
        expect(b.destructive).toBe(true);
        for (const d of [a, b]) d.dispatchEvent(new CustomEvent('dialog-cancel'));
        return Promise.all([expect(plain).resolves.toBe(false), expect(deletes).resolves.toBe(false)]);
    });

    it('showPasswordConfirm: destructive only when asked', () => {
        const plain = showPasswordConfirm('Confirm update', 'Enter your admin password.');
        const deletes = showPasswordConfirm('Delete License', 'Enter your password.', { destructive: true });
        const [a, b] = document.querySelectorAll('ag-confirm-dialog');
        expect(a.destructive).toBe(false);
        expect(b.destructive).toBe(true);
        for (const d of [a, b]) d.dispatchEvent(new CustomEvent('dialog-cancel'));
        return Promise.all([expect(plain).resolves.toBeNull(), expect(deletes).resolves.toBeNull()]);
    });
});

describe('confirmRemoval — asking before a row leaves its list', () => {
    afterEach(() => {
        document.querySelectorAll('ag-confirm-dialog').forEach((d) => d.remove());
    });

    /** Render the dialog's message into a detached node and return that node. */
    function message(dialog) {
        const box = document.createElement('div');
        render(dialog.messageTemplate, box);
        return box;
    }

    it('names the item and the list, and offers an orange Remove', () => {
        const answer = confirmRemoval('Remove station', 'FIP', 'My Live Radio');
        const dialog = document.querySelector('ag-confirm-dialog');
        expect(dialog.title).toBe('Remove station');
        expect(dialog.okLabel).toBe('Remove');
        expect(dialog.destructive).toBe(true);
        expect(message(dialog).textContent.replace(/\s+/g, ' ').trim()).toBe('Remove FIP from My Live Radio?');
        dialog.dispatchEvent(new CustomEvent('dialog-cancel'));
        return expect(answer).resolves.toBe(false);
    });

    it('resolves true on Remove, so the caller goes ahead', () => {
        const answer = confirmRemoval('Remove server', 'MinimServer', 'UPnP servers');
        document.querySelector('ag-confirm-dialog').dispatchEvent(new CustomEvent('dialog-confirm'));
        return expect(answer).resolves.toBe(true);
    });

    it('adds the note after the question, and only when there is one', () => {
        confirmRemoval('Remove station', 'My stream', 'My Live Radio', 'Its address will be lost.');
        confirmRemoval('Remove station', 'FIP', 'Favorites');
        const [withNote, without] = document.querySelectorAll('ag-confirm-dialog');
        expect(message(withNote).textContent.replace(/\s+/g, ' ').trim())
            .toBe('Remove My stream from My Live Radio? Its address will be lost.');
        expect(message(without).textContent.replace(/\s+/g, ' ').trim()).toBe('Remove FIP from Favorites?');
    });

    it('shows a name from the network as text, never as markup', () => {
        // Station names come from the Radio Browser catalogue, renderer names from
        // whatever a device on the network announces.
        const name = '<img src=x onerror="window.__pwned=1">Radio';
        confirmRemoval('Remove renderer', name, 'Audio Output');
        const box = message(document.querySelector('ag-confirm-dialog'));
        expect(box.querySelector('img')).toBeNull();
        expect(box.querySelector('strong').textContent).toBe(name);
    });
});

describe('a string message is shown as text; markup is a Lit template', () => {
    afterEach(() => {
        document.querySelectorAll('ag-confirm-dialog').forEach((d) => d.remove());
        vi.restoreAllMocks();
    });

    /** Render the dialog's message into a detached node and return that node. */
    function message(dialog) {
        const box = document.createElement('div');
        render(dialog.messageTemplate, box);
        return box;
    }

    const name = '<img src=x onerror="window.__pwned=1">Kitchen';

    it('showConfirm: a string with tags stays text, and the console says so', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        showConfirm('Remove Passkey', `Remove passkey ${name}?`);
        const box = message(document.querySelector('ag-confirm-dialog'));
        expect(box.querySelector('img')).toBeNull();
        expect(box.textContent).toBe(`Remove passkey ${name}?`);
        expect(error).toHaveBeenCalledWith(expect.stringContaining('[showConfirm]'));
    });

    it('showConfirm: plain text raises nothing', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        showConfirm('Restart Core', 'Restart "A & B" now?');
        const box = message(document.querySelector('ag-confirm-dialog'));
        expect(box.textContent).toBe('Restart "A & B" now?');
        expect(error).not.toHaveBeenCalled();
    });

    it('showConfirm: a Lit template keeps its markup and shows the name as text', () => {
        showConfirm('Remove Passkey', html`Remove passkey <strong>${name}</strong>?`);
        const box = message(document.querySelector('ag-confirm-dialog'));
        expect(box.querySelector('img')).toBeNull();
        expect(box.querySelector('strong').textContent).toBe(name);
    });

    it('showPasswordConfirm: a string with tags stays text', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        showPasswordConfirm('Confirm', `Remove ${name}? Enter your password.`);
        const box = message(document.querySelector('ag-confirm-dialog'));
        expect(box.querySelector('img')).toBeNull();
        expect(box.querySelector('p').textContent).toBe(`Remove ${name}? Enter your password.`);
    });
});

describe('showPasswordConfirm — the focus', () => {
    it('leaves it to the dialog, which focuses the field once shown: a second timer did it again 50 ms later', () => {
        const source = readStylesheet('js', 'ui-helpers.js');
        const start = source.indexOf('export function showPasswordConfirm');
        const body = source.slice(start, source.indexOf('\nexport ', start + 1));
        expect(body).not.toMatch(/\.focus\(/);
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

describe('copyToClipboard — a failure is reported, never passed off as a copy', () => {
    /** Run fn with document.execCommand replaced by impl, restoring what was there. */
    const withExec = async (impl, fn) => {
        const had = 'execCommand' in document;
        const saved = document.execCommand;
        document.execCommand = impl;
        try { await fn(); } finally {
            if (had) document.execCommand = saved; else delete document.execCommand;
        }
    };

    afterEach(() => vi.unstubAllGlobals());

    it('uses the Clipboard API when it accepts', async () => {
        const writeText = vi.fn().mockResolvedValue();
        vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
        await withExec(vi.fn(() => false), async () => {
            await copyToClipboard('abc');
            expect(writeText).toHaveBeenCalledWith('abc');
            expect(document.execCommand).not.toHaveBeenCalled();
        });
    });

    it('falls back to execCommand on plain HTTP, and resolves when it copies', async () => {
        vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
        await withExec(vi.fn(() => true), async () => {
            await expect(copyToClipboard('abc')).resolves.toBeUndefined();
            expect(document.execCommand).toHaveBeenCalledWith('copy');
        });
    });

    it('rejects when the fallback copies nothing — it returns false, it does not throw', async () => {
        vi.stubGlobal('navigator', {
            ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
        });
        await withExec(vi.fn(() => false), async () => {
            await expect(copyToClipboard('abc')).rejects.toThrow(/refused/);
            expect(document.querySelector('textarea')).toBeNull(); // no field left behind
        });
    });
});
