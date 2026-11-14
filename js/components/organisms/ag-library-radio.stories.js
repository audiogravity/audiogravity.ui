import { html } from 'lit';
import { expect } from 'storybook/test';
import { HALLOWEEN_CLASS } from '../../core/HalloweenController.js';
import './ag-library-radio.js';

/**
 * The organism fetches data from `/api/radio/*` on connect; in Storybook
 * without a backend the lists render empty (loading → empty-state copy).
 * The story is mostly visual: tabs, search filters, layout.
 */

export default {
    title: 'Organisms/LibraryRadio',
    component: 'ag-library-radio',
};

const Template = () => html`
    <div style="background: var(--bg-primary); color: var(--text-primary); min-height: 600px;">
        <ag-library-radio></ag-library-radio>
    </div>
`;

export const Default = Template.bind({});
Default.args = {};

/**
 * Edit station tapped in Favorites: the form shows above the Favorites list. It used
 * to be drawn by My Live Radio alone, so the tap showed nothing there. Rendered from a
 * fixed state, the loaders switched off: there is no backend in Storybook.
 */
export const EditFromFavorites = {
    render: () => {
        const station = { uuid: 'uuid-99', name: 'Station 99', url: 'https://stream.example/99',
                          favicon: '', tags: 'jazz', country: 'FR', codec: 'FLAC' };
        const el = document.createElement('ag-library-radio');
        el._loadAll = async () => {};
        el._loadFavorites = async () => {};
        el._loadLibrary = async () => {};
        Object.assign(el, { _view: 'favorites', _stations: [station], _favoriteUuids: new Set([station.uuid]) });
        el._openEditForm(station);
        const wrap = document.createElement('div');
        wrap.style.cssText = 'background: var(--bg-primary); color: var(--text-primary); min-height: 600px;';
        wrap.append(el);
        return wrap;
    },
    play: async ({ canvasElement }) => {
        const radio = canvasElement.querySelector('ag-library-radio');
        await radio.updateComplete;
        const form = radio.querySelector('form.lib-radio-custom-form');
        await expect(form).not.toBeNull();
        await expect(form.querySelector('input').value).toBe('Station 99');
    },
};

/**
 * On 31 October — the class public/holiday-boot.js sets on <html> that day: the Halloween
 * button above the search, and the Halloween genre among the others.
 */
export const OnHalloween = {
    render: Template,
    beforeEach() {
        document.documentElement.classList.add(HALLOWEEN_CLASS);
        return () => document.documentElement.classList.remove(HALLOWEEN_CLASS);
    },
    play: async ({ canvasElement }) => {
        const radio = canvasElement.querySelector('ag-library-radio');
        [...radio.querySelectorAll('.lib-radio-tab')].find((tab) => tab.textContent.trim() === 'Search').click();
        await radio.updateComplete;
        const button = radio.querySelector('.lib-radio-halloween');
        await expect(button).not.toBeNull();
        await expect(button.textContent.trim()).toBe('🎃 Halloween');
        const genres = [...radio.querySelectorAll('.lib-radio-filter')[1].options].map((option) => option.value);
        await expect(genres).toContain('halloween');
    },
};
