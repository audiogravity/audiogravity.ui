import './ag-volume-popover.js';

export default {
    title: 'Molecules/AgVolumePopover',
    tags: ['autodocs'],
    argTypes: {
        volume: { control: { type: 'range', min: 0, max: 100 } },
    },
};

const Template = ({ volume }) => {
    const el = document.createElement('ag-volume-popover');
    el.volume = volume;
    el.addEventListener('volume-change', (e) => {
        el.volume = e.detail.volume;
    });
    return el;
};

export const Default = Template.bind({});
Default.args = { volume: 50 };

export const LowVolume = Template.bind({});
LowVolume.args = { volume: 10 };

export const MaxVolume = Template.bind({});
MaxVolume.args = { volume: 100 };
