import { html } from 'lit';
import './ag-support-report.js';
import { formatSupportReport } from '../../core/support-report-format.js';

export default {
    title: 'Organisms/SupportReport',
    component: 'ag-support-report',
    argTypes: {
        show: { control: 'boolean' },
    },
};

/** A report shaped like the core's real payload, for the stories below. */
const SAMPLE = {
    report_version: 1,
    generated_at: '2026-08-23T13:00:00+00:00',
    box: {
        ag_version: '0.9.45',
        architecture: 'aarch64',
        hostname: 'lounge',
        os: 'Linux 6.12.0',
        enabled_modules: ['auth', 'license', 'sysinfo', 'services'],
    },
    licence: {
        status: 'lifetime',
        plan: 'perpetual',
        device_id: '5637e65cac19c793aede9ad4b9f4b18afcb91b97',
        order_id: 'AG-F7W9-QLY4',
        activated_at: '2026-01-14',
        online_check: { status: 'valid', checked_at: '2026-08-23T12:00:00+00:00' },
    },
    system: {
        uptime: '3 days 2 hours',
        kernel: '6.12.0-rpi',
        os_release: 'Debian GNU/Linux 13 (trixie)',
        load_average: { one_minute: 0.33, five_minutes: 0.51, fifteen_minutes: 0.42 },
        memory: { percent: 60.8 },
        temperature: { cpu_temp: 55.7 },
        network_interfaces: [{ name: 'eth0', ipv4: ['10.0.0.42'], ipv6: [], is_up: true }],
    },
    packages: [
        { id: 'mpd', label: 'Music Player Daemon', status: 'installed', installed_version: '0.24.5', supported_here: true },
        { id: 'airplay', label: 'Shairport Sync', status: 'installed', installed_version: '4.3.2', supported_here: true },
    ],
    services: {
        managed: [
            { name: 'mpd', state: 'active', sub_state: 'running', enabled: true },
            { name: 'shairport-sync', state: 'failed', sub_state: 'failed', enabled: true },
        ],
        failed_elsewhere: [{ name: 'mnt-nas.mount', state: 'failed', sub_state: 'failed' }],
        total_units: 118,
    },
    audio_stack: {
        selected_output: { card_name: 'Abacus', device_id: 0 },
        outputs: [{ card_name: 'Abacus', usb_id: '20b1:30ab' }],
        services: [
            { service_id: 'mpd', configured: false, output: { card_name: 'Abacus', device_id: 0 } },
            { service_id: 'airplay', configured: true, output: { card_name: 'Abacus', device_id: 0 } },
        ],
        library_sources: [{ kind: 'mount', mountpoint: '/mnt/musics' }],
    },
    library: {
        has_local_library: true,
        declared_roots: ['/mnt/musics'],
        roots_detail: [{ path: '/mnt/musics', exists: true, readable: false }],
        mpd_database: { path: '/var/lib/mpd/db', exists: false },
    },
    streaming: { qobuz: false, tidal: false, highresaudio: false, roon: true },
    configs: [
        {
            service_id: 'mpd',
            path: '/etc/mpd.conf',
            exists: true,
            dropped_comments: 65,
            redacted: 1,
            truncated: 0,
            lines: [
                'music_directory "/mnt/musics"',
                'password «redacted»',
                'audio_output {',
                '    type "alsa"',
                '    device "hw:2,0"',
                '}',
            ],
        },
    ],
};

/** Render the window with a report already loaded — no core needed in Storybook. */
const Template = (args) => {
    const element = document.createElement('ag-support-report');
    element.show = args.show;
    element._text = args.text;
    element._error = args.error || '';
    element._loading = args.loading || false;
    return html`<div style="height: 640px; padding: 20px;">${element}</div>`;
};

export const HandEditedConfig = Template.bind({});
HandEditedConfig.args = { show: true, text: formatSupportReport(SAMPLE) };
HandEditedConfig.parameters = {
    docs: {
        description: {
            story:
                'The case the report was built for: MPD hand-written rather than AG-managed, ' +
                'shairport-sync failed, a failed NAS mount outside the AG set, a library path ' +
                'that exists but is not readable, and MPD never indexed. Each of those had to ' +
                'be guessed at, one round-trip at a time.',
        },
    },
};

export const Collecting = Template.bind({});
Collecting.args = { show: true, text: '', loading: true };

export const Failed = Template.bind({});
Failed.args = { show: true, text: '', error: 'Could not collect the report.' };
