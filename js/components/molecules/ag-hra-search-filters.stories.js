import './ag-hra-search-filters.js';

export default {
    title: 'Molecules/AgHraSearchFilters',
    tags: ['autodocs'],
};

/** The option lists as the core publishes them, trimmed to what a story needs. */
const FORMATS = [
    { value: 'fl44', label: 'FLAC 44.1' },
    { value: 'fl96', label: 'FLAC 96' },
    { value: 'fl192', label: 'FLAC 192' },
];
const MOODS = [
    { value: 'Dreamy', label: 'Dreamy', group: 'positive' },
    { value: 'Uplifting', label: 'Uplifting', group: 'positive' },
    { value: 'Melancholic', label: 'Melancholic', group: 'negative' },
];
const SORTS = [
    { value: '', label: 'Default' },
    { value: '+title', label: 'Title ascending' },
    { value: '-title', label: 'Title descending' },
    { value: '-releaseDate', label: 'Release date descending' },
];

/**
 * HIGHRESAUDIO's advanced search, copied from their own application: artist, composer,
 * label, year, format, mood and the order. The eighth criterion, the free text, is the
 * search box of the view above and is not part of this component.
 *
 * Two things here are deliberate and measured. Setting a **format** makes HRA discard
 * the words typed — `queen` and `london` in FLAC 192 return the same fifty albums —
 * and it is offered anyway, because their application offers it and a form that behaves
 * differently from the one people know is the worse surprise. And the form is applied
 * by its **Search** button rather than on every change: a cold filtered search runs past
 * thirty seconds on HRA and comes back in about a second on the retry (measured through
 * the box), so seven controls firing one each would queue behind one another.
 *
 * **Mood is offered and HRA disregards it** — measured, the same albums come back with
 * it, without it, and with a mood of the opposite family. It is theirs, so it is here.
 *
 * The option lists come from `/library/highresaudio-search-filters`. Storybook has no
 * backend, so the stories seed them the way an answer would.
 */
const Template = ({ open = false } = {}) => {
    const el = document.createElement('ag-hra-search-filters');
    el.style.cssText = 'display:block;max-width:640px;padding:8px;';
    el.addEventListener('hra-filters-change', (e) => console.log('hra-filters-change', e.detail));
    queueMicrotask(() => {
        // `_loaded` stands in for the fetch: set, the toggle opens without asking.
        el._loaded = true;
        el._formats = FORMATS;
        el._moods = MOODS;
        el._sorts = SORTS;
        el._open = open;
        el.requestUpdate?.();
    });
    return el;
};

/** Folded away, which is how it sits above every ordinary search. */
export const Default = () => Template();

/** Open, with the seven controls and the two lists HRA publishes. */
export const Open = () => Template({ open: true });

/** Filled in and applied: the `Clear` button is out, and the toggle carries the count. */
export const Applied = () => {
    const el = Template({ open: true });
    queueMicrotask(() => {
        el._artist = 'Arvo Pärt';
        el._label = 'ECM';
        el._sort = '-releaseDate';
        el._apply();
        el.requestUpdate?.();
    });
    return el;
};
