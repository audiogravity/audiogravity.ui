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
 * On 31 October — the class public/halloween-boot.js sets on <html> that day: the Halloween
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
