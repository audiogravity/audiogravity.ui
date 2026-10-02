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
    ])('reads %j as %j', (raw, bare) => {
        expect(bareVersion(raw)).toBe(bare);
    });

    it.each([null, undefined, ''])('is empty for %j', (nothing) => {
        expect(bareVersion(nothing)).toBe('');
    });
});
