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
 * @returns {HTMLElement}
 */
function seeded(connection, useAsOutput) {
    const el = document.createElement('ag-hqplayer-output');
    el.style.cssText = 'display:block;max-width:420px;padding:8px;';
    el._loadConnection = async () => {};   // no backend, no flicker
    el._connection  = connection;
    el._loading     = false;
    el._useAsOutput = useAsOutput;
    return el;
}

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
