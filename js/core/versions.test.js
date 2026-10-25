/**
 * Unit tests for versions.js — one reading of a version string for every component
 * that compares two (the update banner, the version-skew banner).
 */
import { describe, it, expect } from 'vitest';
import { bareVersion } from './versions.js';

describe('bareVersion', () => {
    it.each([
        ['0.9.65', '0.9.65'],
        ['v0.9.65', '0.9.65'],
        ['V1.0.0', '1.0.0'],
        ['0.9.65-dev', '0.9.65'],
        ['0.9.65+build.7', '0.9.65'],
        ['v0.9.10-dev+abc', '0.9.10'],
        ['  v0.9.65 ', '0.9.65'],
        ['1.0.0-rc.1', '1.0.0-rc.1'],
        ['v1.0.0-rc.10+build.3', '1.0.0-rc.10'],
    ])('reads %j as %j', (raw, bare) => {
        expect(bareVersion(raw)).toBe(bare);
    });

    it('keeps a release candidate apart from its final release', () => {
        expect(bareVersion('1.0.0-rc.1')).not.toBe(bareVersion('1.0.0'));
    });

    it.each([null, undefined, ''])('is empty for %j', (nothing) => {
        expect(bareVersion(nothing)).toBe('');
    });
});
