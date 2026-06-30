// Guard: the derived frontend version files must match the single source VERSION.
// If someone bumps audiogravity.ops/VERSION without running `scripts/sync-version.mjs`
// (or `release.sh prepare`), this fails — making silent version drift impossible.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// audiogravity.ui is a standalone repo; VERSION lives in the sibling audiogravity.ops repo.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION_FILE = path.resolve(REPO_ROOT, '..', 'audiogravity.ops', 'VERSION');
const VERSION = readFileSync(VERSION_FILE, 'utf8').trim();
const read = (rel) => readFileSync(path.join(REPO_ROOT, rel), 'utf8');

describe('version propagation (single source: audiogravity.ops/VERSION)', () => {
    it(`VERSION is a valid semver (${VERSION})`, () => {
        expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
    });

    it('js/core/config.js UI_VERSION matches VERSION (UI display)', () => {
        expect(read('js/core/config.js')).toContain(`UI_VERSION = '${VERSION}'`);
    });

    it('sw.js CACHE_NAME matches VERSION (PWA cache busting)', () => {
        expect(read('sw.js')).toContain(`CACHE_NAME = 'audiogravity-v${VERSION}'`);
    });
});
