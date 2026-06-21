import './ag-library-source-card.js';

export default {
    title: 'Molecules/AgLibrarySourceCard',
    tags: ['autodocs'],
    argTypes: {
        active:  { control: 'boolean' },
        zoneId:  { control: 'text' },
    },
};

const Template = ({ node, active, zoneId }) => {
    const el = document.createElement('ag-library-source-card');
    el.node   = node;
    el.active = active;
    if (zoneId) el.setAttribute('zone-id', zoneId);
    el.style.cssText = 'display:block;max-width:420px;padding:8px;';
    el.addEventListener('source-select', (e) => console.log('source-select', e.detail));
    return el;
};

export const MPD = Template.bind({});
MPD.args = { node: { id: 'src_mpd', name: 'MPD', status: 'active' }, active: true, zoneId: '' };

export const Roon = Template.bind({});
Roon.args = { node: { id: 'src_roon', name: 'Roon', status: 'active' }, active: false, zoneId: '' };

export const Qobuz = Template.bind({});
Qobuz.args = { node: { id: 'src_qobuz', name: 'Qobuz', status: '' }, active: false, zoneId: '' };
