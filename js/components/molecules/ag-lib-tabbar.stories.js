import './ag-lib-tabbar.js';

export default {
    title: 'Molecules/AgLibTabbar',
    tags: ['autodocs'],
    argTypes: {
        tab: {
            control: { type: 'select' },
            options: ['browse', 'search', 'queue', 'library', 'radio'],
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

// The 'library' key is the sources view, labelled Sources.
export const Sources = Template.bind({});
Sources.args = { tab: 'library' };

export const Radio = Template.bind({});
Radio.args = { tab: 'radio' };
