import './ag-now-playing.js';

export default {
    title: 'Organisms/AgNowPlaying',
    component: 'ag-now-playing',
    parameters: {
        docs: {
            description: {
                component: 'Sticky Now Playing banner that shows all active audio sources with transport controls.',
            },
        },
    },
};

export const Default = {
    render: () => {
        const el = document.createElement('ag-now-playing');
        el._items = [
            {
                source_id: 'src_mono-sgen',
                service_name: 'mono-sgen',
                display_name: 'Roon Bridge',
                protocol: 'roon',
                title: 'Clair de lune',
                artist: 'Claude Debussy',
                album: 'Suite bergamasque',
                playback_status: 'Playing',
                volume: 72,
                source_format: 'FLAC | 24bit | 96kHz',
                cover_token: null,
                can_next: true,
                can_set_volume: true,
            },
        ];
        el._hasItems = true;
        return el;
    },
};

export const MultiSource = {
    render: () => {
        const el = document.createElement('ag-now-playing');
        el._items = [
            {
                source_id: 'src_mpd',
                service_name: 'mpd',
                display_name: 'MPD',
                protocol: 'mpd',
                title: 'Space Oddity',
                artist: 'David Bowie',
                album: 'Space Oddity',
                playback_status: 'Playing',
                volume: 85,
                source_format: 'FLAC | 16bit | 44.1kHz',
                cover_token: null,
                can_next: true,
                can_set_volume: true,
            },
            {
                source_id: 'src_shairport-sync',
                service_name: 'shairport-sync',
                display_name: 'AirPlay',
                protocol: 'mpris',
                title: 'Come Together',
                artist: 'The Beatles',
                album: 'Abbey Road',
                playback_status: 'Paused',
                volume: 60,
                source_format: 'ALAC | 16bit | 44.1kHz',
                cover_token: null,
                can_next: false,
                can_set_volume: true,
            },
        ];
        el._hasItems = true;
        return el;
    },
};

export const Collapsed = {
    render: () => {
        const el = document.createElement('ag-now-playing');
        el._collapsed = true;
        el._items = [
            {
                source_id: 'src_shairport-sync',
                service_name: 'shairport-sync',
                display_name: 'AirPlay',
                protocol: 'mpris',
                title: 'Bohemian Rhapsody',
                artist: 'Queen',
                album: 'A Night at the Opera',
                playback_status: 'Playing',
                volume: 55,
                source_format: 'ALAC',
                cover_token: null,
                can_next: true,
                can_set_volume: true,
            },
        ];
        el._hasItems = true;
        return el;
    },
};
