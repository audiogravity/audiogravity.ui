/**
 * Unit tests for ag-pipeline-node.js — the format a service row of the diagram writes.
 */
import { describe, it, expect } from 'vitest';
import { serviceFormatLabel } from './ag-pipeline-node.js';

describe('serviceFormatLabel', () => {
    it('writes the bit depth of a lossless file', () => {
        expect(serviceFormatLabel({ format: 'FLAC', sample_bits: 24, sample_rate: 96000, bitrate: 2304 }))
            .toBe('FLAC 24/96k');
    });

    it('writes the bitrate of a lossy stream, which has no bit depth', () => {
        // The core sends no sample_bits for MP3, AAC, Ogg or Opus.
        expect(serviceFormatLabel({ format: 'MP3', sample_bits: null, sample_rate: 44100, bitrate: 128 }))
            .toBe('MP3 128k/44.1k');
    });

    it('keeps what it has when part of it is missing', () => {
        expect(serviceFormatLabel({ format: 'AAC', sample_rate: 48000 })).toBe('AAC 48k');
        expect(serviceFormatLabel({ format: 'MP3', bitrate: 128 })).toBe('MP3 128k');
        expect(serviceFormatLabel({ format: 'ALAC' })).toBe('ALAC');
    });

    it('writes nothing when nothing is known', () => {
        expect(serviceFormatLabel(null)).toBeNull();
        expect(serviceFormatLabel({})).toBeNull();
    });
});

describe('renderPipelineNode — the format a device node writes', () => {
    /** The flattened markup of a device node of the given type and metadata. */
    async function drawn(deviceType, metadata, internalServices = []) {
        const { renderPipelineNode } = await import('./ag-pipeline-node.js');
        const { flat } = await import('../../test-utils.js');
        return flat(renderPipelineNode({
            id: 'dev', type: 'device', device_type: deviceType, name: 'Box', status: 'active',
            inputs: [], outputs: [], internal_services: internalServices, metadata,
        }));
    }

    it("writes a server's now-playing with the label a service row uses", async () => {
        const out = await drawn('server', {
            now_playing: { title: 'So What', state: 'playing', format: 'FLAC', sample_bits: 24, sample_rate: 96000 },
        });
        expect(out).toContain('FLAC 24/96k');
    });

    it("writes a lossy stream's bitrate on the service row that plays it", async () => {
        const out = await drawn('streamer', {
            service_now_playing: { mpd: { title: 'Nawwâr', state: 'playing', format: 'MP3',
                                          sample_bits: null, sample_rate: 44100, bitrate: 128 } },
        }, [{ id: 'mpd', label: 'MPD', active: true }]);
        expect(out).toContain('MP3 128k/44.1k');
    });
});
