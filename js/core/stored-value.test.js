/**
 * Unit tests for stored-value.js — a value read back as MemoryCache.set wrote it.
 *
 * Covers:
 * 1. JSON comes back parsed: booleans, numbers, objects
 * 2. a string MemoryCache.set wrote as it is comes back as that string
 */
import { describe, it, expect } from 'vitest';
import { parseStoredValue } from './stored-value.js';

describe('a stored value', () => {
    it('comes back parsed when it was written as JSON', () => {
        expect(parseStoredValue('true')).toBe(true);
        expect(parseStoredValue('false')).toBe(false);
        expect(parseStoredValue('12')).toBe(12);
        expect(parseStoredValue('{"a":1}')).toEqual({ a: 1 });
    });

    it('comes back as the string itself when it was written as one', () => {
        // MemoryCache.set writes a string as it is: 'dark', not '"dark"'.
        expect(parseStoredValue('dark')).toBe('dark');
        expect(parseStoredValue('minimal')).toBe('minimal');
    });

    it('reads a JSON string as its text, as before', () => {
        expect(parseStoredValue('"dark"')).toBe('dark');
    });
});
