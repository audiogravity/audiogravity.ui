import './ag-hra-search-filters.js';

export default {
    title: 'Molecules/AgHraSearchFilters',
    tags: ['autodocs'],
};

/**
 * The filter row of a HIGHRESAUDIO search: composer and record label.
 *
 * Two filters HRA offers are not here, and both for measured reasons: a **format**
 * makes HRA discard the words typed altogether (the same fifty albums come back for
 * any search term), and a **mood** takes about a minute to answer cold.
 *
 * Nothing is fetched — the two fields are free text — so this story needs no backend.
 * The `Clear` button appears only once something is set.
 */
const Template = () => {
    const el = document.createElement('ag-hra-search-filters');
    el.style.cssText = 'display:block;max-width:640px;padding:8px;';
    el.addEventListener('hra-filters-change', (e) => console.log('hra-filters-change', e.detail));
    return el;
};

export const Default = Template.bind({});

/** Pre-filled, so the `Clear` button and the emitted detail are both visible. */
export const Filled = () => {
    const el = Template();
    // The row owns its state; a story sets it the way a click would.
    queueMicrotask(() => {
        el._composer = 'Arvo Pärt';
        el._label = 'ECM';
        el.requestUpdate?.();
    });
    return el;
};
