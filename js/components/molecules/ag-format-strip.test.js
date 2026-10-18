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

describe('ag-format-strip — how a DSD track reaches the DAC', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    /** Mount the strip and return the FORMAT cell's text, tag included. */
    async function formatCell(format) {
        const el = document.createElement('ag-format-strip');
        el.format = format;
        document.body.appendChild(el);
        await el.updateComplete;
        const tag = el.querySelector('ag-dsd-delivery');
        await tag?.updateComplete;
        return el.querySelector('.ag-fms-cell').textContent.replace(/\s+/g, ' ').trim();
    }

    const DSD128 = { format: 'DSD128', sample_rate: '5.6MHz', bitrate: '11.3Mbps', codec: 'DSD' };

    it('says nothing more when the DAC receives DSD', async () => {
        expect(await formatCell({ ...DSD128, dsd_delivery: 'native' })).toBe('Format DSD128');
    });

    it('warns under the format when the DSD was converted to PCM', async () => {
        expect(await formatCell({ ...DSD128, dsd_delivery: 'pcm' })).toBe('Format DSD128 Converted to PCM');
    });

    it('tags DoP under the format', async () => {
        expect(await formatCell({ ...DSD128, dsd_delivery: 'dop' })).toBe('Format DSD128 DoP');
    });
});
