/**
 * Unit tests for ag-prov-dop-switch.js (logic-only, no DOM mount).
 * Covers the event contract, and the switch disabled with its reason when MPD
 * cannot say what it applies.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class {},
    html: (strings, ...values) => ({ strings, values }),
    nothing: null,
}));
vi.mock('lit/directives/live.js', () => ({ live: (v) => v }));
vi.mock('../atoms/ag-switch.js', () => ({}));

import { AgProvDopSwitch, DOP_HINT, DOP_PENDING, DOP_UNKNOWN } from './ag-prov-dop-switch.js';

function makeEl(overrides = {}) {
    const el = Object.create(AgProvDopSwitch.prototype);
    el.checked = false;
    el.pending = false;
    el.disabled = false;
    el.dispatchEvent = vi.fn();
    Object.assign(el, overrides);
    return el;
}

/** The bound values of the switch, in template order (ag-prov-guided-switch). */
function switchOf(el) {
    const [label, checked, disabled, switchLabel, , hint] = el.render().values;
    return { label, checked, disabled, switchLabel, hint };
}

beforeEach(() => vi.clearAllMocks());

describe('ag-prov-dop-switch', () => {
    it('shows what MPD applies', () => {
        expect(switchOf(makeEl({ checked: true })).checked).toBe(true);
        expect(switchOf(makeEl({ checked: false })).checked).toBe(false);
    });

    it('names the switch the same for the eye and for assistive technology', () => {
        const s = switchOf(makeEl());
        expect(s.label).toBe('Send DSD as DoP (DSD over PCM)');
        expect(s.switchLabel).toBe(s.label);
    });

    it('says what the switch does when MPD says what it applies', () => {
        const s = switchOf(makeEl({ checked: false }));
        expect(s.disabled).toBe(false);
        expect(s.hint).toBe(DOP_HINT);
    });

    it('is disabled, and says why, when MPD cannot say', () => {
        const s = switchOf(makeEl({ checked: null }));
        expect(s.checked).toBe(false);
        expect(s.disabled).toBe(true);
        expect(s.hint).toBe(DOP_UNKNOWN);
    });

    it('is disabled while the parent applies a change', () => {
        expect(switchOf(makeEl({ checked: true, disabled: true })).disabled).toBe(true);
    });

    it('is off and disabled, and says why, while another output is chosen', () => {
        // What it holds is the other DAC's DoP: shown on, it would claim it for the new one.
        const s = switchOf(makeEl({ checked: true, pending: true }));
        expect(s.checked).toBe(false);
        expect(s.disabled).toBe(true);
        expect(s.hint).toBe(DOP_PENDING);
    });

    it('relays a flip to the parent, which owns the value', () => {
        const el = makeEl();
        el._onChange({ detail: { checked: true } });
        const ev = el.dispatchEvent.mock.calls[0][0];
        expect(ev.type).toBe('dop-change');
        expect(ev.bubbles).toBe(true);
        expect(ev.composed).toBe(true);
        expect(ev.detail).toEqual({ checked: true });
    });
});
