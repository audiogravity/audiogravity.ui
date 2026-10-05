/**
 * Unit tests for ag-format-strip.js — which cells it highlights as hi-res.
 */
import { describe, it, expect, afterEach } from 'vitest';
import './ag-format-strip.js';

/** Mount the strip with a FormatInfo and return its highlighted cells' labels. */
async function highlighted(format) {
    const el = document.createElement('ag-format-strip');
    el.format = format;
    document.body.appendChild(el);
    await el.updateComplete;
    return [...el.querySelectorAll('.ag-fms-cell.hi .ag-fms-label')].map((l) => l.textContent.trim());
}

describe('ag-format-strip — the hi-res highlight', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    it('highlights the format and the rate of a hi-res file', async () => {
        expect(await highlighted({ format: '24bit', sample_rate: '96kHz', bitrate: '4608kbps', codec: 'FLAC' }))
            .toEqual(['Format', 'Sample']);
    });

    it('highlights nothing for a lossy stream, whatever its rate', async () => {
        expect(await highlighted({ format: 'Lossy', sample_rate: '96kHz', bitrate: '256kbps', codec: 'AAC' }))
            .toEqual([]);
    });
});
