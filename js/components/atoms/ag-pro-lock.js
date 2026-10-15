/**
 * @module AgProLock
 * @description The mark of a Pro feature on a Starter box: a padlock and the word "Pro".
 *
 * Shown on what Starter displays but does not open — a streaming service, a media server,
 * Roon, HQPlayer. The atom only draws the mark; what a tap does (the licence panel) belongs
 * to the control that carries it.
 *
 * @element ag-pro-lock
 *
 * @dependency css/components/pro-lock.css
 */
import { LitElement, html } from 'lit';
import { iconLock } from '../../ag-icons.js';

export class AgProLock extends LitElement {
    createRenderRoot() { return this; }

    render() {
        return html`
            <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" aria-hidden="true"
                 stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                ${iconLock}
            </svg>
            <span>Pro</span>
            <span class="sr-only">: available with the Pro edition</span>
        `;
    }
}

customElements.define('ag-pro-lock', AgProLock);
