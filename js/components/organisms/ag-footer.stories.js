import { html } from 'lit';
import './ag-footer.js';

export default {
    title: 'Organisms/Footer',
    component: 'ag-footer',
    argTypes: {
        apiUrl: { control: 'text' },
        isLoggedIn: { control: 'boolean' },
        docsUrl: { control: 'text' },
    },
};

// `_docsUrl` is normally resolved from the core's own entry point — the API reference is
// a setting on the box, off by default — so it is set by hand here to render both states.
const Template = (args) => html`
  <div style="background: var(--bg-primary); padding-top: 100px; display: flex; flex-direction: column; height: 300px; justify-content: flex-end;">
    <ag-footer 
        .apiUrl="${args.apiUrl}"
        ._docsUrl="${args.docsUrl ?? null}"
        ?isLoggedIn="${args.isLoggedIn}">
    </ag-footer>
  </div>
`;

/** A deployed box: the API reference is off, so no button sits beside the address. */
export const Default = Template.bind({});
Default.args = {
    apiUrl: 'http://audiogravity.local/api',
    isLoggedIn: true,
    docsUrl: null,
};

/** A box whose owner switched the reference on — the only state that shows the button. */
export const WithApiReference = Template.bind({});
WithApiReference.args = {
    apiUrl: 'http://audiogravity.local/api',
    isLoggedIn: true,
    docsUrl: 'http://audiogravity.local/api/docs',
};

export const Guest = Template.bind({});
Guest.args = {
    apiUrl: 'http://demo.audiogravity.io/api',
    isLoggedIn: false
};
