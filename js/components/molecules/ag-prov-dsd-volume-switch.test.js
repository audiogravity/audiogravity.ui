/**
 * Unit tests for ag-prov-dsd-volume-switch.js (logic-only, no DOM mount).
 * Covers its texts, the event contract, and the switch disabled with its reason when
 * the setting cannot be read or another output is chosen.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class {},
    html: (strings, ...values) => ({ strings, values }),
    nothing: null,
}));
vi.mock('lit/directives/live.js', () => ({ live: (v) => v }));
vi.mock('../atoms/ag-switch.js', () => ({}));

import {
    AgProvDsdVolumeSwitch, DSD_VOLUME_HINT, DSD_VOLUME_PENDING, DSD_VOLUME_UNKNOWN,
} from './ag-prov-dsd-volume-switch.js';

function makeEl(overrides = {}) {
    const el = Object.create(AgProvDsdVolumeSwitch.prototype);
    el.checked = true;
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

describe('ag-prov-dsd-volume-switch', () => {
    it("shows the DAC's setting", () => {
        expect(switchOf(makeEl({ checked: true })).checked).toBe(true);
        expect(switchOf(makeEl({ checked: false })).checked).toBe(false);
    });

    it('is named for what it does', () => {
        const s = switchOf(makeEl());
        expect(s.label).toBe('Full DAC volume during DSD');
        expect(s.switchLabel).toBe(s.label);
    });

    it('says what it does, for any player, when the setting is read', () => {
        const s = switchOf(makeEl({ checked: true }));
        expect(s.disabled).toBe(false);
        expect(s.hint).toBe(DSD_VOLUME_HINT);
        expect(DSD_VOLUME_HINT).toContain('from any player');
    });

    it('is disabled, and says why, when the setting cannot be read', () => {
        const s = switchOf(makeEl({ checked: null }));
        expect(s.checked).toBe(false);
        expect(s.disabled).toBe(true);
        expect(s.hint).toBe(DSD_VOLUME_UNKNOWN);
    });

    it('is off and disabled, and says why, while another output is chosen', () => {
        // What it holds is the other DAC's setting: shown on, it would claim it for the new one.
        const s = switchOf(makeEl({ checked: true, pending: true }));
        expect(s.checked).toBe(false);
        expect(s.disabled).toBe(true);
        expect(s.hint).toBe(DSD_VOLUME_PENDING);
    });

    it('is disabled while the parent applies a change', () => {
        expect(switchOf(makeEl({ disabled: true })).disabled).toBe(true);
    });

    it('relays a flip to the parent, which owns the value', () => {
        const el = makeEl();
        el._onChange({ detail: { checked: false } });
        const ev = el.dispatchEvent.mock.calls[0][0];
        expect(ev.type).toBe('dsd-volume-change');
        expect(ev.bubbles).toBe(true);
        expect(ev.composed).toBe(true);
        expect(ev.detail).toEqual({ checked: false });
    });
});
