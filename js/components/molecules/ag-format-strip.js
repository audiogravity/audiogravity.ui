/**
 * @module AgFormatStrip
 * @description Audio format strip molecule.
 * Renders four cells: FORMAT, SAMPLE, BITRATE, CODEC from a FormatInfo object.
 * Hi-res cells (DSD, MQA, sample rate ≥ 88.2 kHz) are highlighted with the
 * accent colour. Renders nothing when all fields are absent.
 *
 * @element ag-format-strip
 *
 * @prop {Object|null} format - FormatInfo: { format, sample_rate, bitrate, codec }
 *
 * @dependency css/components/format-strip.css
 */
import { LitElement, html, nothing } from 'lit';

export class AgFormatStrip extends LitElement {
    static properties = {
        format: { type: Object },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.format = null;
    }

    _isHiRes(fmt) {
        if (!fmt) return false;
        const f  = (fmt.format || '').toUpperCase();
        const sr = parseFloat(fmt.sample_rate || '0');
        return f.includes('DSD') || f.includes('MQA') || sr >= 88.2;
    }

    render() {
        const fmt = this.format;
        if (!fmt || (!fmt.format && !fmt.sample_rate && !fmt.bitrate && !fmt.codec)) return nothing;
        const hi = this._isHiRes(fmt);
        return html`
            <div class="ag-fms-strip">
                <div class="ag-fms-cell ${hi ? 'hi' : ''}">
                    <span class="ag-fms-label">Format</span>
                    <span class="ag-fms-value">${fmt.format ?? '—'}</span>
                </div>
                <div class="ag-fms-cell ${hi ? 'hi' : ''}">
                    <span class="ag-fms-label">Sample</span>
                    <span class="ag-fms-value">${fmt.sample_rate ?? '—'}</span>
                </div>
                <div class="ag-fms-cell">
                    <span class="ag-fms-label">Bitrate</span>
                    <span class="ag-fms-value">${fmt.bitrate ?? '—'}</span>
                </div>
                <div class="ag-fms-cell">
                    <span class="ag-fms-label">Codec</span>
                    <span class="ag-fms-value">${fmt.codec ?? '—'}</span>
                </div>
            </div>
        `;
    }
}

customElements.define('ag-format-strip', AgFormatStrip);
