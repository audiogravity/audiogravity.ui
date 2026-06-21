import { LitElement, html } from 'lit';
import { iconVolume } from '../../ag-icons.js';

/**
 * @module AgAudioOutput
 * @description Atom component for displaying an audio output device name with an icon.
 * 
 * @element ag-audio-output
 * @prop {string} value - The audio output device path or name
 */
export class AgAudioOutput extends LitElement {
    static properties = {
        value: { type: String }
    };

    createRenderRoot() {
        return this; // Light DOM
    }

    render() {
        if (!this.value) return html``;

        return html`
            <div class="ag-audio-output" title="Audio Output: ${this.value}">
                <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconVolume}</svg>
                <span class="audio-output-text">${this.value}</span>
            </div>
        `;
    }
}

customElements.define('ag-audio-output', AgAudioOutput);
