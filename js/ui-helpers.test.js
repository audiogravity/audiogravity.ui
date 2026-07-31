/**
 * Unit tests for getUserFriendlyError — pure error message mapping — and for the
 * password-confirm field's styling contract (site#6).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render } from 'lit';
import { getUserFriendlyError, showPasswordConfirm } from './ui-helpers.js';

describe('getUserFriendlyError', () => {
    it('maps "Failed to fetch" to connection error', () => {
        expect(getUserFriendlyError(new Error('Failed to fetch')))
            .toBe('Unable to connect to server. Please check your connection.');
    });

    it('maps "NetworkError" to network error', () => {
        expect(getUserFriendlyError(new Error('NetworkError when attempting...')))
            .toBe('Network error. Please check your internet connection.');
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
