import { html } from 'lit';
import { expect } from 'storybook/test';
import './ag-halloween-spiders.js';

export default {
    title: 'Atoms/HalloweenSpiders',
    component: 'ag-halloween-spiders',
};

/** What the app shows on 31 October: two spiders on their threads, one in each gutter. */
export const OnHalloween = {
    render: () => html`<ag-halloween-spiders preview></ag-halloween-spiders>`,
    play: async ({ canvasElement }) => {
        const sky = canvasElement.querySelector('.ag-hw-sky');
        await expect(sky).not.toBeNull();
        await expect(sky.getAttribute('aria-hidden')).toBe('true');
        await expect(sky.querySelectorAll('.ag-hw-spider')).toHaveLength(2);
        await expect(getComputedStyle(sky).pointerEvents).toBe('none');
    },
};

/** Any other day: nothing at all. */
export const AnyOtherDay = {
    render: () => html`<ag-halloween-spiders></ag-halloween-spiders>`,
};
