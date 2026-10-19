/**
 * @module AgDsdLock
 * @description Padlock shown in place of the volume control when the active
 * source plays a DSD track its volume does nothing to — MPD leaves DSD alone, sent
 * as DSD, as DoP, or converted to PCM in its output (measured 2026-10-18) — so the
 * level is set on the amplifier. Whether the DSD reaches the DAC as DSD, as DoP or
 * converted to PCM, the lock is the same (ag-dsd-delivery says which). A player whose
 * volume acts on DSD keeps its slider, as the core says it (`volume_on_dsd`,
 * showsDsdLock): HQPlayer, a network renderer, and the box's MPD where it turns DSD
 * into PCM before its volume — a box where no output takes DSD as it is.
 *
 * Used by both the mini player (`ag-now-playing`) and the fullscreen player
 * (`ag-now-playing-fullscreen`). Positioning (inline vs absolute) is left to
 * the parent — this atom only contributes the SVG icon and its accessible name.
 *
 * @element ag-dsd-lock
 *
 * @dependency css/components/dsd-lock.css
 */
import { LitElement, html } from 'lit';
import { iconLock } from '../../ag-icons.js';

export class AgDsdLock extends LitElement {
    createRenderRoot() { return this; }

    /**
     * Name the icon for assistive technology. Set on connection, not in the
     * constructor: a custom element must not gain attributes while it is being
     * constructed.
     */
    connectedCallback() {
        super.connectedCallback();
        this.setAttribute('role', 'img');
        // True whatever the DAC does: held at full, left as set, or receiving PCM.
        this.setAttribute('aria-label', 'The volume has no effect on DSD: set the level on your amplifier');
    }

    render() {
        return html`
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
                 stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                ${iconLock}
            </svg>
        `;
    }
}

customElements.define('ag-dsd-lock', AgDsdLock);
