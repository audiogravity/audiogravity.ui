import './ag-upnp-item.js';

export default {
    title: 'Molecules/AgUpnpItem',
    tags: ['autodocs'],
    argTypes: {
        acting: { control: 'boolean' },
    },
};

const Template = ({ item, acting }) => {
    const el = document.createElement('ag-upnp-item');
    el.item   = item;
    el.acting = acting;
    el.style.cssText = 'display:block;max-width:420px;';
    el.addEventListener('upnp-navigate', (e) => console.log('upnp-navigate', e.detail));
    el.addEventListener('upnp-play',     (e) => console.log('upnp-play', e.detail));
    return el;
};

export const Container = Template.bind({});
Container.args = {
    item: { id: '1', title: 'Albums', subtitle: null, hint: 'container', res: null, art_uri: null, cover_token: null },
    acting: false,
};

export const Track = Template.bind({});
Track.args = {
    item: { id: '2', title: 'Wish You Were Here', subtitle: 'Pink Floyd', hint: 'item',
            res: 'http://server/track.flac', art_uri: null, cover_token: null },
    acting: false,
};

export const TrackPlaying = Template.bind({});
TrackPlaying.args = {
    item: { id: '3', title: 'Money', subtitle: 'Pink Floyd', hint: 'item',
            res: 'http://server/track.flac', art_uri: null, cover_token: null },
    acting: true,
};
