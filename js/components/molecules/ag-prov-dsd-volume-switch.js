/**
 * @module AgProvDsdVolumeSwitch
 * @description The guided setup's switch for the DAC MPD plays on: whether its own
 * volume is brought to full while it receives DSD, native or DoP — from any player,
 * HQPlayer included — and put back after. Some DACs apply their volume to the stream
 * before they recognise DSD: below full, they play nothing or noise. On by default;
 * off for a DAC that lowers DSD properly, whose volume the listener keeps.
 *
 * Controlled: the parent (ag-guided-config) holds the value and applies it with the
 * other guided fields. The switch is disabled, and says why, when the setting cannot be
 * read, and while another output is chosen but not applied yet: the setting belongs to
 * the DAC MPD plays on.
 *
 * @element ag-prov-dsd-volume-switch
 * @prop {boolean|null} checked - On; null when the setting cannot be read.
 * @prop {boolean} pending - Another output is chosen, not applied yet.
 * @prop {boolean} disabled - True while the parent applies a change.
 * @fires dsd-volume-change - Bubbles, with `{ checked }`, when the switch is flipped.
 * @dependency js/components/molecules/ag-prov-guided-switch.js
 */
import { AgProvGuidedSwitch } from './ag-prov-guided-switch.js';

/** What the switch does, shown under it. */
export const DSD_VOLUME_HINT = 'On: while this DAC receives DSD, from any player, its own volume '
    + 'is set to maximum, then put back. Some DACs play nothing, or noise, when their volume is '
    + 'lowered during DSD. Turn it off only for a DAC that lowers DSD properly.';

/** Why the switch is disabled when the setting cannot be read. */
export const DSD_VOLUME_UNKNOWN = 'Unavailable: no setting can be read for the output MPD plays on.';

/** Why the switch is disabled while another output is chosen. */
export const DSD_VOLUME_PENDING = 'Apply the new output first: this setting belongs to the DAC MPD plays on.';

export class AgProvDsdVolumeSwitch extends AgProvGuidedSwitch {
    static label = 'Full DAC volume during DSD';
    static hint = DSD_VOLUME_HINT;
    static unknownHint = DSD_VOLUME_UNKNOWN;
    static pendingHint = DSD_VOLUME_PENDING;
    static eventName = 'dsd-volume-change';
}

customElements.define('ag-prov-dsd-volume-switch', AgProvDsdVolumeSwitch);
