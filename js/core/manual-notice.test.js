/**
 * Unit tests for manual-notice.js — the trademark notice, read from the manual's README.
 */
import { describe, it, expect } from 'vitest';
import { parseNotice } from './manual-notice.js';

const README = [
    '0. [Quick start](00-quick-start.md)',
    '',
    '---',
    '',
    '*Roon, HQPlayer, AirPlay, Qobuz, Tidal and HIGHRESAUDIO, and their respective logos, are',
    'trademarks of their respective owners. Audiogravi<sup>ty</sup> is not affiliated with,',
    'endorsed by, or sponsored by any of them.*',
].join('\n');

describe('parseNotice', () => {
    it('reads it from the README, its lines joined and its markup kept', () => {
        expect(parseNotice(README)).toBe('Roon, HQPlayer, AirPlay, Qobuz, Tidal and HIGHRESAUDIO, and their '
            + 'respective logos, are trademarks of their respective owners. Audiogravi<sup>ty</sup> is not '
            + 'affiliated with, endorsed by, or sponsored by any of them.');
    });

    it('finds it wherever its lines break', () => {
        expect(parseNotice('*Names are trademarks\nof their respective\nowners.*')).toBe(
            'Names are trademarks of their respective owners.');
    });

    it('finds nothing in a README without it', () => {
        expect(parseNotice('0. [Quick start](00-quick-start.md)\n*An italic line.*')).toBeNull();
    });

    it('finds nothing when the words are there but not as an italic passage', () => {
        // The site's generator refuses the same README (check_notice), so the two agree.
        expect(parseNotice('Names are trademarks of their respective owners.')).toBeNull();
    });
});
