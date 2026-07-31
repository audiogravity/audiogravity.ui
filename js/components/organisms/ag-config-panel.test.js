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
