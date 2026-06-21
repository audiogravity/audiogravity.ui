import { html } from 'lit';
import './ag-audio-pipeline.js';

export default {
    title: 'Organisms/AgAudioPipeline',
    component: 'ag-audio-pipeline',
    argTypes: {
        zoom: { control: { type: 'number', step: 0.1, min: 0.1, max: 2.0 } },
        showInactiveSources: { control: 'boolean' },
        showLegend: { control: 'boolean' },
        offsetX: { control: 'number' },
        offsetY: { control: 'number' }
    },
};

const mockPipeline = {
    nodes: [
        {
            id: 'streamer_01',
            name: 'Music Streamer',
            type: 'device',
            device_type: 'source',
            status: 'active',
            manufacturer: 'Audiogravity',
            model: 'Streamer Mk2',
            x: 50,
            y: 100,
            inputs: [
                { id: 'wifi', label: 'WiFi', connector: 'antenna', active: true }
            ],
            outputs: [
                { id: 'usb', label: 'USB Out', connector: 'usb-a', active: true },
                { id: 'optical', label: 'Optical Out', connector: 'toslink', active: false }
            ]
        },
        {
            id: 'dac_01',
            name: 'Heed Abacus',
            type: 'device',
            device_type: 'converter',
            status: 'active',
            manufacturer: 'Heed Audio',
            model: 'Abacus S',
            x: 350,
            y: 100,
            inputs: [
                { id: 'usb', label: 'USB', connector: 'usb-b', active: true },
                { id: 'opt1', label: 'OPT 1', connector: 'toslink', active: false }
            ],
            outputs: [
                { id: 'out', label: 'Line Out', connector: 'rca', active: true }
            ]
        },
        {
            id: 'amp_01',
            name: 'Naim NAIT',
            type: 'device',
            device_type: 'amplifier',
            status: 'active',
            manufacturer: 'Naim Audio',
            model: 'NAIT 5si',
            x: 650,
            y: 100,
            inputs: [
                { id: 'rca1', label: 'RCA 1', connector: 'rca', active: true }
            ],
            outputs: [
                { id: 'spk_l', label: 'Speaker L', connector: 'banana', active: true },
                { id: 'spk_r', label: 'Speaker R', connector: 'banana', active: true }
            ]
        },
        {
            id: 'src_mpd',
            name: 'MPD Player',
            type: 'service',
            status: 'active',
            volume: 85,
            x: 50,
            y: 350,
            metadata: {
                artist: 'Miles Davis',
                title: 'So What',
                source_format: 'FLAC 24/192',
                playback_status: 'Playing'
            }
        }
    ],
    links: [
        {
            source_id: 'src_mpd',
            target_id: 'streamer_01',
            target_port: 'wifi',
            active: true,
            link_type: 'software'
        },
        {
            source_id: 'streamer_01',
            target_id: 'dac_01',
            source_port: 'usb',
            target_port: 'usb',
            active: true,
            link_type: 'physical',
            connector: 'usb-a'
        },
        {
            source_id: 'dac_01',
            target_id: 'amp_01',
            source_port: 'out',
            target_port: 'rca1',
            active: true,
            link_type: 'physical',
            connector: 'rca'
        }
    ]
};

const Template = (args) => html`
    <div style="width: 100%; height: 600px; border: 1px solid #334155; border-radius: 8px;">
        <ag-audio-pipeline
            .pipeline="${args.pipeline || mockPipeline}"
            .zoom="${args.zoom || 0.8}"
            ?showInactiveSources="${args.showInactiveSources}"
            ?showLegend="${args.showLegend}"
            .offsetX="${args.offsetX || 0}"
            .offsetY="${args.offsetY || 0}">
        </ag-audio-pipeline>
    </div>
`;

export const FullSystem = Template.bind({});
FullSystem.args = {
    zoom: 0.8,
    showInactiveSources: true,
    showLegend: false
};

export const ZoomedIn = Template.bind({});
ZoomedIn.args = {
    zoom: 1.2,
    showInactiveSources: true,
    showLegend: false,
    offsetX: 50,
    offsetY: 50
};

export const WithLegend = Template.bind({});
WithLegend.args = {
    zoom: 0.8,
    showInactiveSources: true,
    showLegend: true
};
