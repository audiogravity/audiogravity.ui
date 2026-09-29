/**
 * Unit tests for ag-stat-box — a label in capitals, a value with its unit.
 *
 * The label is set in capitals (.metric-label, css/components/metrics.css), and the
 * capital of the micro sign "µ" is the Greek "Μ", which reads as a Latin M: the
 * latency test's "Max Latency (µs)" showed as "MAX LATENCY (MS)" — milliseconds —
 * over values in microseconds (seen on a manual figure, 2026-09-29). A unit goes in
 * `unit`, beside the value, which is not set in capitals.
 *
 * Covers:
 * 1. the unit is written after the value, not in the label
 * 2. no stat box in the app carries "µ" in its label
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { appSources, openingTags } from '../../test-utils.js';
import './ag-stat-box.js';

describe('a stat box', () => {
    it('writes its unit after the value, not in the label', async () => {
        const el = document.createElement('ag-stat-box');
        Object.assign(el, { label: 'Max Latency', value: '246.00', unit: 'µs' });
        document.body.appendChild(el);
        await el.updateComplete;
        expect(el.querySelector('.metric-label').textContent.trim()).toBe('Max Latency');
        // The unit follows a non-breaking space: normalised here with the others.
        expect(el.textContent.replace(/\s+/g, ' ')).toContain('246.00 µs');
        el.remove();
    });
});

describe('the stat boxes of the app', () => {
    it('never put "µ" in a label, which capitals turn into an M', () => {
        const found = appSources().flatMap((file) => openingTags(readFileSync(file, 'utf8'))
            .filter((tag) => tag.startsWith('<ag-stat-box') && /\blabel="[^"]*[µμ]/.test(tag))
            .map((tag) => `${file}: ${tag.replace(/\s+/g, ' ').slice(0, 90)}`));
        expect(found).toEqual([]);
    });
});
