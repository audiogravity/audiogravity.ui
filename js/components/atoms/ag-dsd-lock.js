/**
 * @module AgDsdLock
 * @description Padlock indicator shown next to the volume control when the
 * active source is decoding native DSD — volume is forced to 100% by the
 * pipeline and cannot be changed.
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
import { iconDsdLock } from '../../ag-icons.js';

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
        this.setAttribute('aria-label', 'Volume locked at 100% for native DSD');
    }

    render() {
        return html`
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
                 stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                ${iconDsdLock}
            </svg>
        `;
    }
}

customElements.define('ag-dsd-lock', AgDsdLock);
