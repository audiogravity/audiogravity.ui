import { html } from 'lit';
import './ag-manual-modal.js';

export default {
    title: 'Organisms/ManualModal',
    component: 'ag-manual-modal',
};

/**
 * The manual opens full-screen over the app and reads its chapters from the copy the box
 * serves under /docs/manual — `npm run storybook` copies it in from audiogravity.site, as
 * `npm run dev` and `npm run build` do. Click the button to trigger the fetch + Markdown
 * render; the trademark notice shows once, under the chapter.
 */
export const Default = () => html`
    <div style="height: 500px; padding: 20px;">
        <button
            class="action-btn primary"
            @click=${(e) => e.currentTarget.parentElement.querySelector('ag-manual-modal').open()}
        >
            Open user manual
        </button>
        <ag-manual-modal @manual-close=${() => console.log('manual closed')}></ag-manual-modal>
    </div>
`;

/**
 * Opens on Troubleshooting, the chapter with the most command blocks: each is coloured, and
 * carries a copy button unless the manual flags it `nocopy` (the NAS mount's credentials and
 * fstab lines, which hold example values to replace).
 */
export const CodeBlocks = () => html`
    <div style="height: 500px; padding: 20px;">
        <button
            class="action-btn primary"
            @click=${(e) => e.currentTarget.parentElement.querySelector('ag-manual-modal').open('09-troubleshooting')}
        >
            Open Troubleshooting
        </button>
        <ag-manual-modal @manual-close=${() => console.log('manual closed')}></ag-manual-modal>
    </div>
`;
