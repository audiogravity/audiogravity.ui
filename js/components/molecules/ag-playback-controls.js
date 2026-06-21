/**
 * @module AgPlaybackControls
 * @description Transport controls molecule for the Now Playing fullscreen player.
 * Renders repeat / prev / play-pause / next / shuffle buttons.
 * Fires `playback-control` events — the parent handles the API call.
 *
 * @element ag-playback-controls
 *
 * @attr {boolean} playing  - Whether playback is currently active.
 * @attr {boolean} can-next - Whether the next action is available.
 * @attr {boolean} can-prev - Whether the previous action is available.
 * @attr {boolean} repeat   - Whether repeat mode is on.
 * @attr {boolean} shuffle  - Whether shuffle mode is on.
 *
 * @fires playback-control - Bubbles. detail: { action: string, value?: number }
 *
 * @dependency css/components/playback-controls.css
 */
import { LitElement, html } from 'lit';
import { iconRepeat, iconSkipBack, iconPause, iconPlay, iconUpNext, iconShuffle } from '../../ag-icons.js';

export class AgPlaybackControls extends LitElement {
    static properties = {
        playing:  { type: Boolean },
        canNext:  { type: Boolean, attribute: 'can-next' },
        canPrev:  { type: Boolean, attribute: 'can-prev' },
        repeat:   { type: Boolean },
        shuffle:  { type: Boolean },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.playing = false;
        this.canNext = false;
        this.canPrev = false;
        this.repeat  = false;
        this.shuffle = false;
    }

    _emit(action, value) {
        const detail = value !== undefined ? { action, value } : { action };
        this.dispatchEvent(new CustomEvent('playback-control', { detail, bubbles: true }));
    }

    render() {
        const { playing, canNext, canPrev, repeat, shuffle } = this;
        return html`
            <div class="ag-pc-controls">
                <button class="ag-pc-ctrl small ${repeat ? 'active' : ''}"
                    @click=${() => this._emit('set_repeat', repeat ? 0 : 1)}
                    aria-label="Repeat" title="Repeat">
                    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconRepeat}</svg>
                </button>
                <button class="ag-pc-ctrl nav" ?disabled=${!canPrev}
                    @click=${() => this._emit('prev')}
                    aria-label="Previous" title="Previous">
                    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconSkipBack}</svg>
                </button>
                <button class="ag-pc-ctrl play"
                    @click=${() => this._emit('toggle')}
                    aria-label="${playing ? 'Pause' : 'Play'}" title="${playing ? 'Pause' : 'Play'}">
                    ${playing
                        ? html`<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconPause}</svg>`
                        : html`<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconPlay}</svg>`}
                </button>
                <button class="ag-pc-ctrl nav" ?disabled=${!canNext}
                    @click=${() => this._emit('next')}
                    aria-label="Next" title="Next">
                    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconUpNext}</svg>
                </button>
                <button class="ag-pc-ctrl small ${shuffle ? 'active' : ''}"
                    @click=${() => this._emit('set_shuffle', shuffle ? 0 : 1)}
                    aria-label="Shuffle" title="Shuffle">
                    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconShuffle}</svg>
                </button>
            </div>
        `;
    }
}

customElements.define('ag-playback-controls', AgPlaybackControls);
