import './ag-back-to-top.js';

/**
 * The button in a scrolling pane, placed as the Manual window places it: last in the pane,
 * whose bottom padding covers the button's offset. Scroll the pane: the button shows once a
 * full pane has gone by, and its ring fills with the reading.
 */
export default {
    title: 'Molecules/AgBackToTop',
    tags: ['autodocs'],
};

const Template = ({ paragraphs }) => {
    const pane = document.createElement('div');
    pane.style.cssText = 'height:320px;max-width:560px;overflow-y:auto;border:1px solid var(--border-color);'
        + 'padding:var(--spacing-lg) var(--spacing-xl) calc(var(--spacing-lg) + env(safe-area-inset-bottom, 0px));';
    pane.innerHTML = Array.from({ length: paragraphs }, (_, i) =>
        `<p>Paragraph ${i + 1}. Scroll down: the button shows once a full pane has gone by.</p>`).join('');
    const button = document.createElement('ag-back-to-top');
    button.target = pane;
    pane.append(button);
    return pane;
};

export const LongChapter = Template.bind({});
LongChapter.args = { paragraphs: 60 };

/** A pane with nothing to scroll: the button never shows. */
export const ShortChapter = Template.bind({});
ShortChapter.args = { paragraphs: 3 };
