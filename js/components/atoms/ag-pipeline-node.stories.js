import { html, svg } from 'lit';
import { renderPipelineNode } from './ag-pipeline-node.js';

export default {
    title: 'Atoms/PipelineNode',
    argTypes: {
        status: { 
            control: 'select', 
            options: ['active', 'inactive', 'error'] 
        },
        type: { 
            control: 'select', 
            options: ['service', 'processing', 'alsa_output', 'device'] 
        },
        device_type: {
            control: 'select',
            options: ['source', 'converter', 'amplifier', 'output', 'endpoint']
        },
        name: { control: 'text' },
        manufacturer: { control: 'text' },
        model: { control: 'text' },
        volume: { control: { type: 'range', min: 0, max: 100 } },
        x: { control: 'number' },
        y: { control: 'number' }
    },
};

const Template = (args) => {
    const node = {
        id: 'test-node',
        name: args.name || 'Test Node',
        status: args.status || 'active',
        type: args.type || 'service',
        device_type: args.device_type || 'source',
        manufacturer: args.manufacturer || 'Manufacturer',
        model: args.model || 'Model X1',
        volume: args.volume,
        x: args.x || 50,
        y: args.y || 50,
        metadata: args.metadata || {
            artist: 'Sample Artist',
            title: 'Sample Track',
            source_format: 'FLAC 24/96',
            playback_status: 'Playing'
        },
        inputs: args.inputs || [],
        outputs: args.outputs || []
    };

    return html`
        <div style="background: #0f172a; padding: 40px; border-radius: 8px; min-height: 400px;">
            <svg width="800" height="400" viewBox="0 0 800 400" style="overflow: visible;">
                ${renderPipelineNode(node)}
            </svg>
        </div>
    `;
};

export const SoftwareService = Template.bind({});
SoftwareService.args = {
    name: 'MPD Player',
    type: 'service',
    status: 'active',
    volume: 85,
    x: 100,
    y: 100
};

export const DACDevice = Template.bind({});
DACDevice.args = {
    name: 'Heed Abacus',
    type: 'device',
    device_type: 'converter',
    status: 'active',
    manufacturer: 'Heed Audio',
    model: 'Abacus S',
    x: 100,
    y: 50,
    inputs: [
        { id: '1', label: 'USB', connector: 'usb-b', active: true },
        { id: '2', label: 'OPT 1', connector: 'toslink', active: false },
        { id: '3', label: 'COAX', connector: 'rca', active: false }
    ],
    outputs: [
        { id: 'out', label: 'Line Out', connector: 'rca', active: true }
    ]
};

export const StreamerDevice = Template.bind({});
StreamerDevice.args = {
    name: 'Music Streamer',
    type: 'device',
    device_type: 'source',
    status: 'active',
    manufacturer: 'Audiogravity',
    model: 'Streamer Mk2',
    x: 100,
    y: 50,
    inputs: [
        { id: 'wifi', label: 'WiFi', connector: 'antenna', active: true }
    ],
    outputs: [
        { id: 'usb', label: 'USB Out', connector: 'usb-a', active: true },
        { id: 'optical', label: 'Optical Out', connector: 'toslink', active: false }
    ]
};

export const Amplifier = Template.bind({});
Amplifier.args = {
    name: 'Naim NAIT',
    type: 'device',
    device_type: 'amplifier',
    status: 'active',
    manufacturer: 'Naim Audio',
    model: 'NAIT 5si',
    x: 100,
    y: 50,
    inputs: [
        { id: 'cd', label: 'CD', connector: 'rca', active: true },
        { id: 'tuner', label: 'Tuner', connector: 'rca', active: false }
    ],
    outputs: [
        { id: 'spk_l', label: 'Speaker L', connector: 'banana', active: true },
        { id: 'spk_r', label: 'Speaker R', connector: 'banana', active: true }
    ]
};

export const InactiveService = Template.bind({});
InactiveService.args = {
    name: 'AirPlay',
    type: 'service',
    status: 'inactive',
    x: 100,
    y: 100
};
