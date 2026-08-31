/**
 * Unit tests for ag-hra-search-filters.
 *
 * The form is a copy of HIGHRESAUDIO's own advanced search, so what matters is that it
 * carries their eight criteria and nothing else, that it never narrows a search by
 * accident (an untouched control is not a criterion, a whitespace-only field is not
 * one), and that it costs one search when it is applied rather than one per keystroke —
 * this is the slowest endpoint HRA exposes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('lit', () => ({
    LitElement: class {},
    html: (strings, ...values) => ({ strings, values }),
    nothing: null,
}));

const getHraSearchFilters = vi.fn();
vi.mock('../../library-store.js', () => ({
    getHraSearchFilters: (...args) => getHraSearchFilters(...args),
}));

const { AgHraSearchFilters } = await import('./ag-hra-search-filters.js');

/** A bare instance — no constructor, no DOM. */
const el = (over = {}) => Object.assign(Object.create(AgHraSearchFilters.prototype), {
    _open: false,
    _artist: '', _composer: '', _label: '', _release: '',
    _format: '', _mood: '', _sort: '',
    _formats: [], _moods: [], _sorts: [],
    _applied: 0,
    _loaded: false,
    dispatchEvent: vi.fn(),
    ...over,
});

beforeEach(() => {
    getHraSearchFilters.mockReset();
    getHraSearchFilters.mockResolvedValue({
        formats: [{ value: 'fl192', label: 'FLAC 192' }],
        moods: [{ value: 'Dreamy', label: 'Dreamy', group: 'positive' }],
        sorts: [{ value: '', label: 'Default' }, { value: '+title', label: 'Title ascending' }],
    });
});

describe('ag-hra-search-filters', () => {
    it('carries the seven criteria HRA takes, under their own parameter names', () => {
        // The organism builds its request by walking this object, so a renamed key
        // would silently stop being sent rather than fail.
        expect(Object.keys(el().value)).toEqual([
            'artist', 'composer', 'label', 'release', 'format', 'mood', 'sort',
        ]);
    });

    it('reads as empty until something is set', () => {
        expect(el().isEmpty).toBe(true);
        expect(el({ _composer: 'Mozart' }).isEmpty).toBe(false);
        expect(el({ _sort: '+title' }).isEmpty).toBe(false);
    });

    it('does not count a field holding only spaces', () => {
        // Sent as-is it would be a value HRA tries to match, and the search would
        // silently return nothing.
        const host = el({ _composer: '   ' });
        expect(host.isEmpty).toBe(true);
        expect(host.value.composer).toBe('');
    });

    it('says nothing while the form is being filled in', () => {
        // A cold filtered search takes tens of seconds and the core runs two at a
        // time: a search per keystroke would queue the rest behind them.
        const host = el();
        host._set('_artist', 'Queen');
        host._set('_release', '2026');
        expect(host.dispatchEvent).not.toHaveBeenCalled();
        expect(host._artist).toBe('Queen');
    });

    it('announces the whole form when it is applied', () => {
        const host = el({ _artist: 'Queen', _sort: '-title' });
        host._apply();
        const ev = host.dispatchEvent.mock.calls[0][0];
        expect(ev.type).toBe('hra-filters-change');
        expect(ev.bubbles).toBe(true);
        expect(ev.detail).toEqual({
            artist: 'Queen', composer: '', label: '', release: '',
            format: '', mood: '', sort: '-title',
        });
    });

    it('counts what was applied, not what is typed', () => {
        // The count is all that shows when the form is folded away. Counting an
        // unapplied edit would claim a search that never ran.
        const host = el({ _artist: 'Queen' });
        expect(host._applied).toBe(0);
        host._apply();
        expect(host._applied).toBe(1);
        host._set('_label', 'ECM');
        expect(host._applied).toBe(1);
    });

    it('clearing announces itself too, so the results stop being narrowed', () => {
        const host = el({ _composer: 'Mozart', _label: 'ECM' });
        host.reset();
        expect(host.isEmpty).toBe(true);
        expect(host._applied).toBe(0);
        expect(host.dispatchEvent.mock.calls[0][0].detail.composer).toBe('');
    });

    it('keeps Clear reachable once fields are emptied by hand after a search', () => {
        // The criteria only change on Search or Clear, so wiping the fields leaves the
        // results narrowed by what was applied. Gating Clear on the fields alone hid
        // the one control that widens them again.
        const host = el({ _open: true, _applied: 2 });
        expect(host.isEmpty).toBe(true);
        expect(JSON.stringify(host.render())).toContain('Clear');
    });

    it('clearing an untouched form says nothing', () => {
        const host = el();
        host.reset();
        expect(host.dispatchEvent).not.toHaveBeenCalled();
    });

    it('clearing a form emptied by hand still announces, the search still being narrowed', () => {
        // Every field wiped one by one, but the applied criteria are still in effect
        // on screen: staying silent here would leave them there for good.
        const host = el({ _applied: 2 });
        host.reset();
        expect(host.dispatchEvent).toHaveBeenCalled();
    });

    it('fetches the option lists on the first opening, and only then', async () => {
        const host = el();
        await host._toggle();
        expect(host._open).toBe(true);
        expect(host._formats).toHaveLength(1);
        expect(host._sorts).toHaveLength(2);
        await host._toggle();          // closed
        await host._toggle();          // opened again
        expect(getHraSearchFilters).toHaveBeenCalledTimes(1);
    });

    it('never asks at all for someone who does not open the form', () => {
        el();
        expect(getHraSearchFilters).not.toHaveBeenCalled();
    });

    it('asks again after an answer that came back empty', async () => {
        // HRA reports some failures as a 200 with nothing in it. Kept, the three
        // menus would stay bare for as long as the page stays open.
        getHraSearchFilters.mockResolvedValueOnce({ formats: [], moods: [], sorts: [] });
        const host = el();
        await host._toggle();
        await host._toggle();
        await host._toggle();
        expect(getHraSearchFilters).toHaveBeenCalledTimes(2);
    });

    it('offers format, mood and order — the fields their own application offers', () => {
        // Format discards the words typed as soon as it is set (their defect, measured
        // and reported). It is here on purpose: their application has it, and a form
        // that behaves differently from the one people know is the worse surprise.
        const out = JSON.stringify(el({ _open: true }).render());
        expect(out).toContain('Audio format');
        expect(out).toContain('Mood');
        expect(out).toContain('Sort order');
    });

    it('lists an option carrying no family alongside the ones that do', () => {
        // The core types a mood by HRA's own field and falls back to "" when it is
        // absent. Switching to headings as soon as ONE option has a family dropped
        // every option that had none — gone from the menu, with nothing to say so.
        const out = JSON.stringify(el({
            _open: true,
            _moods: [
                { value: 'Dreamy', label: 'Dreamy', group: 'positive' },
                { value: 'Untyped', label: 'Untyped', group: '' },
            ],
        }).render());
        expect(out).toContain('Untyped');
        expect(out).toContain('positive');
    });

    it('offers neither album nor genre', () => {
        // Album: accepted by HRA and then silently ignored — `artist=Queen&album=Innuendo`
        // returns the same albums as `artist=Queen` alone. Genre: its own browse shelf.
        const out = JSON.stringify(el({ _open: true }).render());
        expect(out).not.toContain('Album');
        expect(out).not.toContain('Genre');
    });

    it('shows nothing but the toggle until it is opened', () => {
        const out = JSON.stringify(el().render());
        expect(out).toContain('Advanced search');
        expect(out).not.toContain('Composer');
    });
});
