/**
 * @file Tests for the shared words of a package's availability verdict.
 *
 * The software card and the support report read them from here: the report once said
 * "not supported on this architecture" where the card said "Cannot be checked".
 */
import { describe, it, expect } from 'vitest';
import { describeAvailability } from './package-availability.js';

describe('describeAvailability', () => {
    it('has nothing to say about an available package', () => {
        expect(describeAvailability('available', null)).toBeNull();
    });

    it('has nothing to say when the core sent no verdict (a core older than the field)', () => {
        expect(describeAvailability(undefined, undefined)).toBeNull();
        expect(describeAvailability(null, 'ignored')).toBeNull();
    });

    it('keeps the core\'s own reason', () => {
        expect(describeAvailability('unknown', 'repository answered HTTP 503'))
            .toEqual({ label: 'Cannot be checked', reason: 'repository answered HTTP 503' });
    });

    it.each([
        ['unsupported', 'Not available here', 'no build for this system'],
        ['unknown', 'Cannot be checked', 'the source could not be reached'],
        ['blocked', 'Unavailable', 'another installed package prevents it'],
    ])('names %s and explains it when no reason came', (state, label, reason) => {
        expect(describeAvailability(state, null)).toEqual({ label, reason });
    });

    it('stays neutral about a verdict it does not know yet', () => {
        // Never a vendor claim it has no basis for.
        expect(describeAvailability('something-new', null)).toEqual({ label: 'Unavailable', reason: '' });
    });
});
