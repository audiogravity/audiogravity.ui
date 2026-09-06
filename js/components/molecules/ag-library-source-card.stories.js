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

export const Radio = Template.bind({});
Radio.args = {
    node: { id: 'src_radio', name: 'Radio', status: 'active', kind: 'radio' },
    active: false, zoneId: '',
};

/*
 * An input diffusing. It IS a source — sound comes out of it — but it hides the
 * source behind it: what a phone pushes over AirPlay has an identity the box
 * cannot see. So there is no catalogue to open on this side, and a tap raises
 * the player instead of a grid.
 */
export const InputPlaying = Template.bind({});
InputPlaying.args = {
    node: { id: 'src_shairport-sync', name: 'AirPlay', status: 'active', kind: 'input' },
    active: false, zoneId: '',
};

/* The same card at rest: it answers no tap at all, and shows no pointer. */
export const InputIdle = Template.bind({});
InputIdle.args = {
    node: { id: 'src_upmpdcli', name: 'UPnP Bridge', status: '', kind: 'input' },
    active: false, zoneId: '',
};
