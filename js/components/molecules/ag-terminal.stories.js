import './ag-terminal.js';

export default {
    title: 'Molecules/AgTerminal',
    tags: ['autodocs'],
};

const Template = () => {
    const el = document.createElement('ag-terminal');
    el.style.cssText = 'display:block;height:400px;';
    return el;
};

export const Default = Template.bind({});
Default.args = {};
