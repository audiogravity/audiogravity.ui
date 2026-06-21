import { html, svg } from 'lit';
import { renderPipelineLink } from './ag-pipeline-link.js';

export default {
    title: 'Atoms/PipelineLink',
    argTypes: {
        active: { control: 'boolean' },
        link_type: {
            control: 'select',
            options: ['software', 'alsa', 'physical', 'internal']
        },
        connector: {
            control: 'select',
            options: ['toslink', 'rca', 'usb-a', 'usb-b', 'xlr', 'banana', 'rj45', 'antenna']
        },
        bitPerfect: { control: 'boolean' },
        sampleRate: { control: 'number' },
        sampleBits: { control: 'number' },
        sourceX: { control: 'number' },
        sourceY: { control: 'number' },
        targetX: { control: 'number' },
        targetY: { control: 'number' },
        latency_us: { control: 'number' },
        buffer_fill_percent: { control: 'number' }
    },
};

const Template = (args) => {
    const link = {
        sourceX: args.sourceX || 50,
        sourceY: args.sourceY || 100,
        targetX: args.targetX || 350,
        targetY: args.targetY || 100,
        active: args.active !== undefined ? args.active : true,
        bitPerfect: args.bitPerfect || false,
        link_type: args.link_type || 'physical',
        connector: args.connector || 'toslink',
        latency_us: args.latency_us,
        buffer_fill_percent: args.buffer_fill_percent
    };

    const sourceNode = {
        format: {
            sample_rate: args.sampleRate || 44100,
            sample_bits: args.sampleBits || 16
        }
    };

    return html`
        <div style="background: #0f172a; padding: 20px; border-radius: 8px;">
            <svg width="400" height="200" viewBox="0 0 400 200" style="overflow: visible;">
                ${renderPipelineLink(link, sourceNode)}
                
                <!-- Helper markers for source/target -->
                <circle cx="${link.sourceX}" cy="${link.sourceY}" r="4" fill="#64748b" />
                <circle cx="${link.targetX}" cy="${link.targetY}" r="4" fill="#64748b" />
                <text x="${link.sourceX}" y="${link.sourceY - 10}" fill="#94a3b8" font-size="10" text-anchor="middle">Source</text>
                <text x="${link.targetX}" y="${link.targetY - 10}" fill="#94a3b8" font-size="10" text-anchor="middle">Target</text>
            </svg>
        </div>
    `;
};

export const PhysicalToslink = Template.bind({});
PhysicalToslink.args = {
    active: true,
    link_type: 'physical',
    connector: 'toslink',
    sampleRate: 96000,
    sampleBits: 24,
    sourceX: 50,
    sourceY: 50,
    targetX: 350,
    targetY: 150
};

export const SoftwareLink = Template.bind({});
SoftwareLink.args = {
    active: true,
    link_type: 'software',
    sampleRate: 44100,
    sampleBits: 16,
    sourceX: 50,
    sourceY: 100,
    targetX: 350,
    targetY: 100
};

export const InactivePhysical = Template.bind({});
InactivePhysical.args = {
    active: false,
    link_type: 'physical',
    connector: 'rca',
    sourceX: 50,
    sourceY: 100,
    targetX: 350,
    targetY: 100
};

export const BitPerfectXLR = Template.bind({});
BitPerfectXLR.args = {
    active: true,
    link_type: 'physical',
    connector: 'xlr',
    bitPerfect: true,
    sampleRate: 192000,
    sampleBits: 24,
    sourceX: 50,
    sourceY: 100,
    targetX: 350,
    targetY: 100
};

// New stories with latency/buffer stats
export const WithExcellentLatency = Template.bind({});
WithExcellentLatency.args = {
    active: true,
    link_type: 'alsa',
    sampleRate: 96000,
    sampleBits: 24,
    latency_us: 35,
    buffer_fill_percent: 45,
    sourceX: 50,
    sourceY: 100,
    targetX: 350,
    targetY: 100
};

export const WithGoodLatency = Template.bind({});
WithGoodLatency.args = {
    active: true,
    link_type: 'software',
    sampleRate: 48000,
    sampleBits: 16,
    latency_us: 125,
    buffer_fill_percent: 68,
    sourceX: 50,
    sourceY: 100,
    targetX: 350,
    targetY: 100
};

export const WithAverageLatency = Template.bind({});
WithAverageLatency.args = {
    active: true,
    link_type: 'alsa',
    sampleRate: 44100,
    sampleBits: 16,
    latency_us: 350,
    buffer_fill_percent: 85,
    sourceX: 50,
    sourceY: 100,
    targetX: 350,
    targetY: 100
};

export const WithCriticalLatency = Template.bind({});
WithCriticalLatency.args = {
    active: true,
    link_type: 'software',
    sampleRate: 44100,
    sampleBits: 16,
    latency_us: 720,
    buffer_fill_percent: 95,
    sourceX: 50,
    sourceY: 100,
    targetX: 350,
    targetY: 100
};
