/**
 * Unit tests for ag-dsd-delivery.js (logic-only, no DOM mount).
 * A DSD track's format reads DSD whatever reaches the DAC: the tag says what does.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class {},
    html: (strings, ...values) => ({ strings, values }),
    nothing: null,
}));
vi.mock('./ag-badge.js', () => ({}));

import { AgDsdDelivery, DSD_DELIVERY_TAGS } from './ag-dsd-delivery.js';

function render(delivery) {
    const el = Object.create(AgDsdDelivery.prototype);
    el.delivery = delivery;
    return el.render();
}

describe('ag-dsd-delivery', () => {
    it('says nothing when the DAC receives DSD', () => {
        expect(render('native')).toBeNull();
    });

    it('says nothing while the core cannot tell', () => {
        expect(render(null)).toBeNull();
        expect(render(undefined)).toBeNull();
    });

    it('tags DoP, neutrally', () => {
        expect(render('dop').values).toEqual(['neutral', 'DoP']);
    });

    it('warns of a conversion to PCM', () => {
        expect(render('pcm').values).toEqual(['warning', 'Converted to PCM']);
    });

    it('knows no other way', () => {
        expect(Object.keys(DSD_DELIVERY_TAGS)).toEqual(['dop', 'pcm']);
        expect(render('mqa')).toBeNull();
    });
});
