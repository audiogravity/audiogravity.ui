/**
 * @module audioStackDemoData
 * @description Shared Storybook demo fixtures for the audio-stack components.
 * Mirrors the GET /audio-stack/status shapes (output candidates and library
 * sources) so every story exercises the same contract. Single source of truth —
 * when the API shape evolves, update it here and every story follows.
 */

/** Demo output candidates, /audio-stack/status `outputs` shape. */
export const DEMO_OUTPUTS = [
    { hw: 'hw:2,0', card_name: 'Abacus', usb_id: '20b1:30ab', device_id: 0, is_usb_dac: true, recommended: true, label: 'Abacus — USB Audio' },
    { hw: 'hw:0,0', card_name: 'PCH', usb_id: null, device_id: 0, is_usb_dac: false, recommended: false, label: 'PCH — onboard' },
];

/** Demo library sources, /audio-stack/status `library_sources` shape. */
export const DEMO_SOURCES = [
    { kind: 'usb', uuid: 'u-1', fstype: 'ext4', path: '/mnt/aglibrary', label: 'MUSIC (ext4)' },
    { kind: 'mount', fstype: 'cifs', path: '/mnt/musics', label: '/mnt/musics (cifs)' },
];
