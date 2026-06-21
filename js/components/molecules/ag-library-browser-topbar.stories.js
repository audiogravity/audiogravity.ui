import { html } from 'lit';
import './ag-library-browser-topbar.js';

export default {
    title: 'Molecules/LibraryBrowserTopbar',
    component: 'ag-library-browser-topbar',
    argTypes: { title: { control: 'text' } },
};

const Template = (args) => html`
  <ag-library-browser-topbar
    title="${args.title}"
    @browser-back=${() => console.log('back')}
    @browser-refresh=${() => console.log('refresh')}>
  </ag-library-browser-topbar>
`;

export const Default = Template.bind({});
Default.args = { title: 'My Live Radio' };

export const NoTitle = Template.bind({});
NoTitle.args = { title: '' };
