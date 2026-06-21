import './ag-format-strip.js';

export default {
    title: 'Molecules/AgFormatStrip',
    tags: ['autodocs'],
    argTypes: {
        format: { control: 'object' },
    },
};

const Template = ({ format }) => {
    const el = document.createElement('ag-format-strip');
    el.format = format;
    el.style.cssText = 'display:block;max-width:500px;padding:16px;';
    return el;
};

export const PCM = Template.bind({});
PCM.args = { format: { format: '16bit', sample_rate: '44.1kHz', bitrate: null, codec: 'FLAC' } };

export const HiRes = Template.bind({});
HiRes.args = { format: { format: '24bit', sample_rate: '96kHz', bitrate: null, codec: 'FLAC' } };

export const DSD = Template.bind({});
DSD.args = { format: { format: 'DSD128', sample_rate: '5.6MHz', bitrate: '11.3Mbps', codec: 'DSD' } };

export const Lossy = Template.bind({});
Lossy.args = { format: { format: '16bit', sample_rate: '44.1kHz', bitrate: '256kbps', codec: 'AAC' } };

export const Empty = Template.bind({});
Empty.args = { format: null };
