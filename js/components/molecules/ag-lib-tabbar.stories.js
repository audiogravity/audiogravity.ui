import './ag-lib-tabbar.js';

export default {
    title: 'Molecules/AgLibTabbar',
    tags: ['autodocs'],
    argTypes: {
        tab: {
            control: { type: 'select' },
            options: ['browse', 'search', 'queue', 'library'],
        },
    },
};

const Template = ({ tab }) => {
    const el = document.createElement('ag-lib-tabbar');
    el.tab = tab;
    el.addEventListener('lib-tab-change', (e) => {
        el.tab = e.detail.tab;
    });
    return el;
};

export const Browse = Template.bind({});
Browse.args = { tab: 'browse' };

export const Search = Template.bind({});
Search.args = { tab: 'search' };

export const Queue = Template.bind({});
Queue.args = { tab: 'queue' };

export const Library = Template.bind({});
Library.args = { tab: 'library' };
