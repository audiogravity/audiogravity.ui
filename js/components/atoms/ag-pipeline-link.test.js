/**
 * Unit tests for ag-pipeline-link.js — the latency a link writes.
 *
 * It was written in the histogram's bar colours: 2.0 to 3.8:1 on its pill in every light
 * theme (measured 2026-10-26). It takes its band's text colour now, which Minimal sets to
 * grey and ink under 200 µs, as its histogram draws them.
 *
 * Covers:
 * 1. each band's latency is written in that band's text colour
 * 2. no bar colour is written as text
 */
import { describe, it, expect } from 'vitest';
import { render } from 'lit';
import { renderPipelineLink } from './ag-pipeline-link.js';

/** The style of the latency a physical link writes, drawn into an <svg> by Lit. */
function latencyStyle(latency_us) {
    const host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    render(renderPipelineLink(
        { sourceX: 0, sourceY: 0, targetX: 300, targetY: 0, active: true, link_type: 'physical', connector: 'usb-a', latency_us },
        { format: { sample_rate: 44100, sample_bits: 16 } },
    ), host);
    const text = [...host.querySelectorAll('text')].find((t) => t.textContent.trim().endsWith('µs'));
    expect(text, `no latency written for ${latency_us} µs`).toBeTruthy();
    return text.getAttribute('style');
}

describe('the latency a link writes', () => {
    it.each([
        [35, 'excellent'], [125, 'good'], [350, 'average'], [720, 'critical'],
    ])('— %s µs — takes the text colour of its band, %s', (latency, band) => {
        expect(latencyStyle(latency)).toContain(`fill: var(--latency-text-${band})`);
    });

    it('is never written in a bar colour', () => {
        for (const latency of [35, 125, 350, 720]) expect(latencyStyle(latency)).not.toContain('--histogram-');
    });
});

/** The style of the buffer fill a physical link writes beside its latency. */
function bufferStyle(buffer_fill_percent) {
    const host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    render(renderPipelineLink(
        { sourceX: 0, sourceY: 0, targetX: 300, targetY: 0, active: true, link_type: 'physical', connector: 'usb-a', latency_us: 35, buffer_fill_percent },
        { format: { sample_rate: 44100, sample_bits: 16 } },
    ), host);
    const text = [...host.querySelectorAll('text')].find((t) => t.textContent.trim().endsWith('%'));
    expect(text, `no buffer fill written for ${buffer_fill_percent} %`).toBeTruthy();
    return text.getAttribute('style');
}

describe('the buffer fill a link writes', () => {
    it.each([
        [45, 'healthy'], [85, 'warning'], [95, 'critical'],
    ])('— %s %% — takes the text colour of its band, %s', (fill, band) => {
        // At rest it is a figure at rest, which Minimal writes in ink beside the latency.
        expect(bufferStyle(fill)).toContain(`fill: var(--buffer-text-${band})`);
    });
});
