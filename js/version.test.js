// Guard: the derived frontend version files must match the single source /VERSION.
// If someone bumps /VERSION without running `scripts/sync-version.mjs` (or
// `release.sh prepare`), this fails — making silent version drift impossible.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'); // repo root
const VERSION = readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

describe('version propagation (single source: /VERSION)', () => {
    it(`/VERSION is a valid semver (${VERSION})`, () => {
        expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
    });

    it('config.js FRONTEND_VERSION matches /VERSION (UI display)', () => {
        expect(read('frontend/js/core/config.js')).toContain(`FRONTEND_VERSION = '${VERSION}'`);
    });

    it('sw.js CACHE_NAME matches /VERSION (PWA cache busting)', () => {
        expect(read('frontend/sw.js')).toContain(`CACHE_NAME = 'audiogravity-v${VERSION}'`);
    });
});
