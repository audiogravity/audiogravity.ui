/**
 * @module AgProvDopSwitch
 * @description The guided setup's DoP switch for MPD: whether DSD leaves for the DAC
 * MPD plays on as DoP — DSD wrapped in PCM words, which the DAC unwraps. Off, DSD
 * goes out natively when the DAC accepts it, converted to PCM otherwise. On, MPD
 * tries DoP first, even for a DAC that takes native DSD: it is for a DAC that
 * decodes DoP but that Linux cannot send DSD to.
 *
 * Controlled: the parent (ag-guided-config) holds the value and applies it with the
 * other guided fields. The switch is disabled, and says why, when MPD cannot say what
 * it applies, and while another output is chosen but not applied yet: DoP is set on
 * the output MPD plays on, and belongs to one DAC.
 *
 * @element ag-prov-dop-switch
 * @prop {boolean|null} checked - DoP on; null when MPD cannot say.
 * @prop {boolean} pending - Another output is chosen, not applied yet.
 * @prop {boolean} disabled - True while the parent applies a change.
 * @fires dop-change - Bubbles, with `{ checked }`, when the switch is flipped.
 * @dependency js/components/molecules/ag-prov-guided-switch.js
 */
import { AgProvGuidedSwitch } from './ag-prov-guided-switch.js';

/** What the switch does, shown under it. */
export const DOP_HINT = 'Off: DSD goes out as DSD when your DAC accepts it, converted to PCM '
    + 'otherwise. Turn it on only for a DAC that decodes DoP and that Linux cannot send DSD to: '
    + 'DSD then leaves as DoP, even for a DAC that takes native DSD.';

/** Why the switch is disabled when MPD cannot say what it applies. */
export const DOP_UNKNOWN = 'Unavailable: MPD cannot say how it sends DSD to this output right now.';

/** Why the switch is disabled while another output is chosen. */
export const DOP_PENDING = 'Apply the new output first: DoP is set on the output MPD plays on.';

export class AgProvDopSwitch extends AgProvGuidedSwitch {
    static label = 'Send DSD as DoP (DSD over PCM)';
    static hint = DOP_HINT;
    static unknownHint = DOP_UNKNOWN;
    static pendingHint = DOP_PENDING;
    static eventName = 'dop-change';
}

customElements.define('ag-prov-dop-switch', AgProvDopSwitch);
