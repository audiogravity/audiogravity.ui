/**
 * Unit tests for ag-hra-search-filters.
 *
 * The row exists to narrow a search, so what matters is that it never narrows one by
 * accident: an untouched control is not a filter, a whitespace-only field is not a
 * filter, and every change announces itself so the organism can decide what to do.
 *
 * It also must not grow back the two filters HRA offers and we refuse — a format
 * control replaces the reader's search with something else (their defect), a mood
 * control takes about a minute to answer.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class {},
    html: (strings, ...values) => ({ strings, values }),
    nothing: null,
}));

const { AgHraSearchFilters } = await import('./ag-hra-search-filters.js');

/** A bare instance — no constructor, no DOM. */
const el = (over = {}) => Object.assign(Object.create(AgHraSearchFilters.prototype), {
    _composer: '', _label: '',
    dispatchEvent: vi.fn(),
    ...over,
});

describe('ag-hra-search-filters', () => {
    it('reads as empty until something is set', () => {
        expect(el().isEmpty).toBe(true);
        expect(el({ _composer: 'Mozart' }).isEmpty).toBe(false);
        expect(el({ _label: 'ECM' }).isEmpty).toBe(false);
    });

    it('does not count a field holding only spaces', () => {
        // Sent as-is it would be a value HRA tries to match, and the search would
        // silently return nothing.
        const host = el({ _composer: '   ' });
        expect(host.isEmpty).toBe(true);
        expect(host.value.composer).toBe('');
    });

    it('announces every change, with the whole row', () => {
        const host = el();
        host._set('_composer', 'Mozart');
        const ev = host.dispatchEvent.mock.calls[0][0];
        expect(ev.type).toBe('hra-filters-change');
        expect(ev.bubbles).toBe(true);
        expect(ev.detail).toEqual({ composer: 'Mozart', label: '' });
    });

    it('says nothing when a control is set to what it already held', () => {
        const host = el({ _composer: 'Mozart' });
        host._set('_composer', 'Mozart');
        expect(host.dispatchEvent).not.toHaveBeenCalled();
    });

    it('clearing announces itself too, so the results stop being narrowed', () => {
        const host = el({ _composer: 'Mozart', _label: 'ECM' });
        host.reset();
        expect(host.isEmpty).toBe(true);
        expect(host.dispatchEvent.mock.calls[0][0].detail)
            .toEqual({ composer: '', label: '' });
    });

    it('clearing an already empty row says nothing', () => {
        const host = el();
        host.reset();
        expect(host.dispatchEvent).not.toHaveBeenCalled();
    });

    it('offers neither format nor mood', () => {
        // Format: measured, HRA returns the same fifty albums for `queen`, `London` and
        // a nonsense term as soon as a format is given — the search is discarded.
        // Mood: measured at 59s on a cold query.
        const out = JSON.stringify(el().render());
        expect(out).not.toContain('format');
        expect(out).not.toContain('mood');
        expect(Object.keys(el().value)).toEqual(['composer', 'label']);
    });
});
