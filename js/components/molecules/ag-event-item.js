import { LitElement, html, nothing } from 'lit';

/**
 * System Event Item Molecule
 * @element ag-event-item
 * 
 * @prop {Object} payload - The raw event payload {type, data, timestamp}
 * 
 * @fires event-click - Emitted when the item is clicked, contains the payload in detail.
 * @dependency css/components/history-panel.css - Uses .history-item layout
 */
export class AgEventItem extends LitElement {
    static properties = {
        payload: { type: Object }
    };

    constructor() {
        super();
        this.payload = null;
    }

    createRenderRoot() {
        return this; // Light DOM for components/history-panel.css (.history-item) styling
    }

    connectedCallback() {
        super.connectedCallback();
        this.style.display = 'contents';
    }

    _handleClick() {
        this.dispatchEvent(new CustomEvent('event-click', {
            bubbles: true,
            composed: true,
            detail: { payload: this.payload }
        }));
    }

    _formatEvent() {
        if (!this.payload) return { time: '', message: '', detail: '' };

        const { type, data, timestamp } = this.payload;
        const time = new Date(timestamp).toLocaleTimeString();
        let message = `Event: ${type}`;
        let detail = '';

        switch (type) {
            case 'connected':
                message = 'SSE Connected';
                detail = data.connection_id ? `ID: ${data.connection_id}` : '';
                break;
            case 'profile_state':
                message = `Profile ${data.profile_id} -> ${data.new_state}`;
                break;
            case 'latency_test_progress':
                message = 'Latency Test Progress';
                detail = `${data.progress}%`;
                break;
            case 'service_metrics':
                message = 'Service Metrics Update';
                break;
            default:
                if (data && typeof data === 'object') {
                    detail = JSON.stringify(data).substring(0, 50) + (JSON.stringify(data).length > 50 ? '...' : '');
                }
        }

        return { time, message, detail };
    }

    render() {
        if (!this.payload) return nothing;

        const { time, message, detail } = this._formatEvent();

        return html`
            <div class="history-item clickable" @click=${this._handleClick}>
                <div class="history-item-time">${time}</div>
                <div class="history-item-action">${message}</div>
                ${detail ? html`
                    <div class="history-item-detail" style="font-size: 10px; color: var(--text-tertiary);">
                        ${detail}
                    </div>
                ` : nothing}
            </div>
        `;
    }
}

customElements.define('ag-event-item', AgEventItem);
