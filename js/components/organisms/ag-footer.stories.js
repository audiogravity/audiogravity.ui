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

/** The one state the icon's dark rule exists for: a near-black square on a dark footer,
 *  where it needs its hairline to keep its edges. The class goes on <html>, which is what
 *  theme-boot.js stamps before the first paint — a story that only set it on the wrapper
 *  would render the light icon and show nothing of what was added. */
export const DarkTheme = () => {
    document.documentElement.classList.add('dark-mode');
    document.body.classList.add('dark-mode');
    return Template({ apiUrl: 'http://audiogravity.local/api', isLoggedIn: true, docsUrl: null });
};

export const Guest = Template.bind({});
Guest.args = {
    apiUrl: 'http://demo.audiogravity.io/api',
    isLoggedIn: false
};
