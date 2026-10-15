/**
 * @module AgProLockCard
 * @description A Pro feature, as a Starter box shows it: its name, what it offers, and the
 * Pro padlock. A tap takes the user to the licence panel.
 *
 * Stands in place of the real card — a streaming service's connection, the media servers,
 * HQPlayer — so a Starter box sees what Pro adds without calling routes the core refuses it.
 *
 * @element ag-pro-lock-card
 *
 * @prop {string} name - The feature's name, e.g. "Qobuz".
 * @prop {string} description - What it offers, in a few words.
 * @prop {string|import('lit').TemplateResult} icon - Its logo: an image's address, or a
 *   mark already drawn — SOURCE_ICONS, whose monochrome logos follow the theme (Tidal's
 *   black image vanished on a dark one, 2026-10-15). Its initials stand in without one.
 *
 * @dependency css/components/pro-lock.css, css/components/library-sources.css
 */
import { LitElement, html } from 'lit';
import { openLicensePanel } from '../../license-tiers.js';
import '../atoms/ag-pro-lock.js';

export class AgProLockCard extends LitElement {
    static properties = {
        name:        { type: String },
        description: { type: String },
        icon:        { attribute: false },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.name = '';
        this.description = '';
        this.icon = '';
    }

    render() {
        return html`
            <button type="button" class="plain-btn lib-src-card pro-lock-card"
                    @click=${() => openLicensePanel()}>
                <!-- Spans, not divs: a button holds phrasing content only (review,
                     2026-10-15). Each class declares its display (grid, flex), so the
                     card is drawn as the source cards are. -->
                <span class="lib-src-card-hd">
                    <span class="lib-src-ic">
                        ${typeof this.icon === 'string' && this.icon
                            ? html`<img src=${this.icon} alt="" width="24" height="24">`
                            : this.icon || this.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span class="lib-src-col">
                        <span class="lib-src-name">${this.name}</span>
                        <span class="lib-src-desc">${this.description}</span>
                    </span>
                    <ag-pro-lock></ag-pro-lock>
                </span>
            </button>
        `;
    }
}

customElements.define('ag-pro-lock-card', AgProLockCard);
