import { html } from 'lit';
import './ag-library-breadcrumbs.js';

export default {
    title: 'Molecules/LibraryBreadcrumbs',
    component: 'ag-library-breadcrumbs',
    argTypes: { rootLabel: { control: 'text' } },
};

const Template = (args) => {
    const el = document.createElement('ag-library-breadcrumbs');
    el.rootLabel = args.rootLabel;
    el.stack = args.stack ?? [];
    el.addEventListener('breadcrumb-root', () => console.log('root clicked'));
    return el;
};

export const Roon = Template.bind({});
Roon.args = {
    rootLabel: 'Root',
    stack: [{ title: 'Library' }, { title: 'Artists' }, { title: '-M-' }],
};

export const Empty = Template.bind({});
Empty.args = { rootLabel: 'Root', stack: [] };

export const Minim = Template.bind({});
Minim.args = {
    rootLabel: 'MinimServer',
    stack: [{ title: 'Album Artist' }, { title: 'Tindersticks' }],
};
