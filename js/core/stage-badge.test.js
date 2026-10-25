/**
 * The stage badge: the release stage the version names, in the corner of the app, and nothing
 * for a final release or a development build.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { mountStageBadge, stageOf } from './stage-badge.js';

describe('stageOf', () => {
    it.each([
        ['0.9.80', 'BETA'],
        ['v0.9.80', 'BETA'],
        ['1.0.0-rc.1', '1.0 RC'],
        ['1.0.0-rc.12', '1.0 RC'],
        ['v2.1.0-rc.3+build.7', '2.1 RC'],
        ['1.0.0', ''],
        ['1.0.0+build.7', ''],
        ['0.9.81-dev', ''],
        ['1.0.0-dev', ''],
        ['1.0.0-alpha.1', ''],
        ['', ''],
        [undefined, ''],
        ['garbage', ''],
    ])('names %j %j', (version, stage) => {
        expect(stageOf(version)).toBe(stage);
    });
});

describe('mountStageBadge', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('writes the stage the build names in a badge fixed to the page', () => {
        const badge = mountStageBadge('1.0 RC');
        expect(badge.textContent).toBe('1.0 RC');
        expect(badge.parentElement).toBe(document.body);
        expect(badge.style.position).toBe('fixed');
    });

    it('shows nothing when the build names no stage', () => {
        expect(mountStageBadge(undefined)).toBeNull();
        expect(mountStageBadge('')).toBeNull();
        expect(document.body.children.length).toBe(0);
    });

    it('goes away when pressed', () => {
        const badge = mountStageBadge('1.0 RC');
        badge.click();
        expect(document.body.contains(badge)).toBe(false);
    });
});

describe('common.js', () => {
    const source = readFileSync('js/common.js', 'utf8');

    it('mounts the badge with the stage the version names, in a production build only', () => {
        expect(source).toContain('stageOf(UI_VERSION)');
        expect(source).toMatch(/if \(import\.meta\.env\.PROD\) \{\s*const stage = stageOf\(UI_VERSION\);/);
        expect(source).not.toMatch(/VITE_BETA|VITE_STAGE/);
    });
});
