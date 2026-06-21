import './ag-tidal-output.js';

export default {
    title: 'Molecules/AgTidalOutput',
    tags: ['autodocs'],
};

const Template = () => {
    const el = document.createElement('ag-tidal-output');
    el.style.cssText = 'display:block;max-width:420px;padding:8px;';
    el.addEventListener('tidal-connected',    () => console.log('tidal-connected'));
    el.addEventListener('tidal-disconnected', () => console.log('tidal-disconnected'));
    return el;
};

export const Default = Template.bind({});
