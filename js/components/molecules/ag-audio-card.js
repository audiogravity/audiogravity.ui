import { LitElement, html, nothing } from 'lit';
/**
 * Audio Device Card Molecule
 * @element ag-audio-card
 * 
 * @prop {Object} card - Audio card data (name, devices, usb details)
 * 
 * @dependency css/system.css - Uses .audio-card for layout
 */
export class AgAudioCard extends LitElement {
    static properties = {
        card: { type: Object }
    };

    createRenderRoot() {
        return this;
    }

    render() {
        if (!this.card) return nothing;

        return html`
            <div class="audio-card audio-card-section">
                <div class="audio-card-section-title">
                    <span class="text-accent">Card ${this.card.card_id}:</span>
                    <span>${this.card.card_name}</span>
                    ${this.card.usb_id ? html`<span class="badge audio-card-badge">USB</span>` : nothing}
                </div>
                <div class="audio-card-label">
                    ${this.card.long_name}
                </div>
                ${this.card.usb_bus ? html`<div class="audio-card-label-small">USB: ${this.card.usb_bus} | ID: ${this.card.usb_id}</div>` : nothing}
                <div class="mt-xs">
                    ${this.card.devices?.map(device => html`
                        <div class="audio-card-detail">
                            <span class="text-primary-color">${device.name}</span>
                            <span class="audio-card-version">(${device.subdevices_available}/${device.subdevices_total} available)</span>
                        </div>
                    `) || nothing}
                </div>
            </div>
        `;
    }
}

customElements.define('ag-audio-card', AgAudioCard);
