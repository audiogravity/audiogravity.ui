/**
 * @module AgThemeToggle
 * @description Light/dark appearance toggle, as a single icon button.
 */

import { LitElement, html } from 'lit';
import { iconSun, iconMoon } from '../../ag-icons.js';
import { setDarkMode } from '../../appearance.js';

/**
 * Flips the interface between the light and the dark palette.
 *
 * It changes the APPEARANCE, not the theme: which of minimal / slate / gravity applies
 * is a separate choice, made in the configuration panel, and this button leaves it
 * alone — it only switches the palette of whichever theme is in force.
 *
 * Written for the login page, which has no configuration panel and where the choice
 * used to be unreachable: someone signing in at night got the light palette full in the
 * face until they were through the form. It is deliberately NOT imported by js/main.js —
 * the application already offers the same switch inside <ag-config-panel>, and importing
 * it there would ship a second control nothing renders.
 *
 * The state is read off the document rather than kept here, so a page that arrives
 * already dark (public/theme-boot.js stamps it before the first paint) shows the right
 * icon immediately, with no flash and no second source of truth.
 *
 * Applying the choice is not this component's own business: it calls appearance.js, the
 * same function the panel's switch calls, so the two controls cannot drift apart.
 *
 * @element ag-theme-toggle
 * @fires ag-change - {detail: {darkMode: boolean}} after the appearance has changed.
 *
 * @example
 * <ag-theme-toggle></ag-theme-toggle>
 */
export class AgThemeToggle extends LitElement {
    static properties = {
        /** Whether the dark palette is currently applied. Reflected from the document. */
        darkMode: { type: Boolean },
    };

    constructor() {
        super();
        this.darkMode = false;
    }

    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        this.darkMode = document.documentElement.classList.contains('dark-mode');
    }

    /**
     * Apply the other appearance, persist it, and tell whoever is listening.
     */
    _toggle() {
        const dark = setDarkMode(!this.darkMode);
        this.darkMode = dark;

        this.dispatchEvent(new CustomEvent('ag-change', {
            detail: { darkMode: dark },
            bubbles: true,
            composed: true,
        }));
    }

    render() {
        // The icon names the destination, not the current state: what a button shows is
        // what pressing it gets you.
        const label = this.darkMode ? 'Switch to the light appearance' : 'Switch to the dark appearance';
        return html`
            <button type="button" class="ag-theme-toggle" title="${label}" aria-label="${label}"
                aria-pressed="${this.darkMode}" @click=${this._toggle}>
                <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor"
                    stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    ${this.darkMode ? iconSun : iconMoon}
                </svg>
            </button>
        `;
    }
}

customElements.define('ag-theme-toggle', AgThemeToggle);
