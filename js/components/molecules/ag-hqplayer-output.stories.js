import './ag-hqplayer-output.js';

export default {
    title: 'Molecules/AgHqplayerOutput',
    tags: ['autodocs'],
};

/**
 * Default state — the component fetches its own data from /hqplayer/connection.
 * Requires a running backend with the hqplayer module enabled.
 *
 * When no HQPlayer is connected, the discovery panel offers two paths:
 * a local-subnet "Scan network" sweep, and a manual IP field for hosts on a
 * different (but routable) subnet that the scan cannot reach.
 */
const Template = () => {
    const el = document.createElement('ag-hqplayer-output');
    el.style.cssText = 'display:block;max-width:420px;padding:8px;';
    el.addEventListener('sources-changed',    () => console.log('sources-changed'));
    el.addEventListener('sources-changed', () => console.log('sources-changed'));
    return el;
};

export const Default = Template.bind({});

/**
 * Build a card with a fixed state, bypassing the network fetch.
 *
 * The Default story reads the live backend, which is right for exploring the
 * component but not for the manual screenshots: those must render the same way
 * on any machine, whatever HQPlayer is doing at that moment.
 *
 * @param {object} connection   - The /hqplayer/connection payload to display.
 * @param {boolean} useAsOutput - Whether library playback is routed to HQPlayer.
 * @param {object} [status]     - The /hqplayer/status payload: the volume on
 *   the card's face, and the mode and rate beside its name.
 * @returns {HTMLElement}
 */
function seeded(connection, useAsOutput, status = STATUS) {
    const el = document.createElement('ag-hqplayer-output');
    el.style.cssText = 'display:block;max-width:420px;padding:8px;';
    el._loadConnection = async () => {};   // no backend, no flicker
    el._loadStatus     = async () => {};   // nor for the volume the card follows
    el._connection  = connection;
    el._loading     = false;
    el._useAsOutput = useAsOutput;
    el._status      = status;
    return el;
}

/**
 * HQPlayer's answer: SDM at DSD128, and its volume over the range set in
 * HQPlayer — −60 to −3 dB, as the Mac's HQPlayer Desktop reports it.
 */
const STATUS = {
    available: true,
    state: 'stopped',
    active_filter: 'sinc-short',
    active_shaper: 'ASDM5',
    active_mode: 'SDM (DSD)',
    active_rate: 5644800,
    volume_db: -6,
    volume_min_db: -60,
    volume_max_db: -3,
    volume_fixed: false,
};

/** This box's own HQPlayer Embedded, at the range and level of hqplayerd.xml's defaults. */
const LOCAL_STATUS = { ...STATUS, volume_db: -3, volume_max_db: 0 };

const CONNECTED = {
    host: '10.0.4.200',
    port: 4321,
    available: true,
    naa_available: true,
    active_filter: 'sinc-short',
    active_mode: 'SDM (DSD)',
    product: 'Signalyst HQPlayer Desktop',
    engine_version: '5.28.1',
    major: 5,
    naa_version: '5.1.8-68',
    pairing_ok: true,
};

/** HQPlayer connected, library playback routed through it — the manual shot. */
export const UsedAsOutput = () => seeded(CONNECTED, true);

/** Connected, but playback still goes straight to the local DAC. */
export const ConnectedNotOutput = () => seeded(CONNECTED, false);

/**
 * HQPlayer's volume is fixed in its settings: it refuses every change, so the
 * card shows the level and says why there is no slider.
 */
export const VolumeFixed = () => seeded(CONNECTED, true, {
    ...STATUS, volume_db: -3.01, volume_min_db: null, volume_max_db: null, volume_fixed: true,
});

/** The volume could not be read: a dash, never 0.0 dB, and no slider. */
export const VolumeUnknown = () => seeded(CONNECTED, true, { ...STATUS, volume_db: null });

/**
 * The setting is on while HQPlayer stopped answering. The switch stays on
 * screen so it can always be turned off — hiding it would trap the user with
 * failing plays and no control.
 */
export const OutputButUnreachable = () =>
    seeded({ ...CONNECTED, available: false, naa_available: true }, true);

/**
 * The adapter on the box is on another major line than HQPlayer, which does not
 * carry sound. The card names both versions and *Use as output* is refused, so
 * the state has to be readable without anyone having to try the switch.
 */
export const PairingMismatch = () => seeded(
    { ...CONNECTED, major: 5, naa_version: '6.1.4-71', pairing_ok: false }, false);

/**
 * Either version could not be read — HQPlayer asleep, or an adapter that is not
 * installed. An unknown pairing is not a broken one: nothing is claimed and
 * nothing is blocked.
 */
export const PairingUnknown = () => seeded(
    { ...CONNECTED, engine_version: null, major: null, naa_version: null, pairing_ok: null },
    false);

const LOCAL = {
    host: '127.0.0.1',
    port: 4321,
    local: true,
    // Where its own settings page listens — the card offers to open it, on the
    // host the browser reached the box with. Only the box's own HQPlayer has one.
    web_port: 8088,
    configured_host: null,
    configured_port: 4321,
    available: true,
    naa_available: false,
    use_as_output: true,
    active_filter: 'sinc-short',
    active_mode: 'SDM (DSD)',
    product: 'Signalyst HQPlayer Embedded',
    engine_version: '5.16.2',
    major: 5,
    pairing_ok: null,
};

/**
 * HQPlayer Embedded runs on this box: the music plays through it, straight to
 * the DAC, until it stops. The switch is locked on — the core would refuse to
 * turn it off — and nothing is offered to disconnect.
 */
export const LocalInstance = () => seeded(LOCAL, true, LOCAL_STATUS);

/**
 * The same, with another HQPlayer chosen in the card beforehand: the card names
 * it, since the card returns to it — with its own output setting — when
 * HQPlayer Embedded stops, and offers to forget it.
 */
export const LocalInstanceWithChosenOne = () =>
    seeded({ ...LOCAL, configured_host: '10.0.4.200' }, true, LOCAL_STATUS);
