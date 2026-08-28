/**
 * Guards for the Settings panel.
 *
 * Asserted against the source rather than a rendered component: importing the
 * panel pulls in api.js, which demands authentication at import time and throws
 * in this environment. Same approach as component-imports.test.js.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), 'ag-config-panel.js'),
    'utf8',
);

describe('Settings panel — the API key is not editable from here', () => {
    /*
     * The panel used to offer the key in a field any logged-in user could edit,
     * and it was the ONLY thing in production that could write a key into this
     * browser's storage — so it was the sole cause of the lockout it claimed to
     * repair. It also protected nothing: the installer already ships the key
     * inside the page the browser loads.
     */
    it('renders no API key field', () => {
        expect(SOURCE).not.toMatch(/API Key/i);
        expect(SOURCE).not.toMatch(/api-key-input/);
    });

    it('holds no API key state and no way to overwrite it', () => {
        expect(SOURCE).not.toMatch(/\bapiKey\b/);
        expect(SOURCE).not.toMatch(/\bsetApiKey\b/);
    });
});

describe('Settings panel — every toast names its type first', () => {
    /*
     * showToast(type, title, message). Six calls in the passkey section had it as
     * (message, type): the toast component received "Passkey removed" as its type and
     * "success" as its title, so the notice rendered unstyled with the word "success" for a
     * heading. Nothing failed — a wrong string is still a string — which is why it lasted.
     */
    const TYPES = new Set(['success', 'error', 'warning', 'info']);

    it('passes one of the four toast types as the first argument', () => {
        const firstArgs = [...SOURCE.matchAll(/showToast\(\s*(['"`])([^'"`]*)\1/g)].map(m => m[2]);
        expect(firstArgs.length).toBeGreaterThan(0);
        const wrong = firstArgs.filter(a => !TYPES.has(a));
        expect(wrong, `showToast called with a message where its type belongs: ${wrong.join(' | ')}`)
            .toEqual([]);
    });

    it('never starts a toast call with an expression instead of a type literal', () => {
        // `showToast(err.message || …, 'error')` — the inverted form — begins with an
        // identifier, not a quote. The check above cannot see it; this one can.
        const unquoted = [...SOURCE.matchAll(/showToast\(\s*([^'"`\s)][^,)]*)/g)].map(m => m[1].trim());
        expect(unquoted, `toast calls whose first argument is not a literal: ${unquoted.join(' | ')}`)
            .toEqual([]);
    });
});
