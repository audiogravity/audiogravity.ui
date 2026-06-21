import { html } from 'lit';
import './ag-footer.js';

export default {
    title: 'Organisms/Footer',
    component: 'ag-footer',
    argTypes: {
        apiUrl: { control: 'text' },
        isLoggedIn: { control: 'boolean' }
    },
};

const Template = (args) => html`
  <div style="background: var(--bg-primary); padding-top: 100px; display: flex; flex-direction: column; height: 300px; justify-content: flex-end;">
    <ag-footer 
        .apiUrl="${args.apiUrl}"
        ?isLoggedIn="${args.isLoggedIn}">
    </ag-footer>
  </div>
`;

export const Default = Template.bind({});
Default.args = {
    apiUrl: 'http://audiogravity.local/api',
    isLoggedIn: true
};

export const Guest = Template.bind({});
Guest.args = {
    apiUrl: 'http://demo.audiogravity.io/api',
    isLoggedIn: false
};
