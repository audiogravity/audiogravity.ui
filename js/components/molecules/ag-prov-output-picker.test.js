/**
 * Unit tests for ag-prov-output-picker.js (logic-only, no DOM mount).
 * Covers the selection event contract.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class {},
    html: (strings, ...values) => ({ strings, values }),
    nothing: null,
}));
vi.mock('../utils-lit.js', () => ({ svgIcon: vi.fn() }));
vi.mock('../../ag-icons.js', () => ({
    iconConnectorUsbA: '', iconHardDrive: '', iconRadio: '', iconCircle: '', iconStar: '',
}));

import { AgProvOutputPicker } from './ag-prov-output-picker.js';

function makeEl(overrides = {}) {
    const el = Object.create(AgProvOutputPicker.prototype);
    el.outputs = [];
    el.selected = null;
    el.dispatchEvent = vi.fn();
    Object.assign(el, overrides);
    return el;
}

beforeEach(() => vi.clearAllMocks());

describe('_select', () => {
    it('sets selected to the candidate hw and emits output-select with the candidate', () => {
        const output = { hw: 'hw:2,0', label: 'Abacus', is_usb_dac: true };
        const el = makeEl();
        el._select(output);
        expect(el.selected).toBe('hw:2,0');
        expect(el.dispatchEvent).toHaveBeenCalledTimes(1);
        const ev = el.dispatchEvent.mock.calls[0][0];
        expect(ev.type).toBe('output-select');
        expect(ev.bubbles).toBe(true);
        expect(ev.detail).toEqual({ output });
    });
});
