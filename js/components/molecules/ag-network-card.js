import { LitElement, html, nothing } from 'lit';
/**
 * Network Interface Card Molecule
 * @element ag-network-card
 * 
 * @prop {Object} iface - Network interface data (name, status, ip, mac)
 * 
 * @dependency css/system.css - Uses .network-interface styling
 */
export class AgNetworkCard extends LitElement {
    static properties = {
        iface: { type: Object }
    };

    createRenderRoot() {
        return this;
    }

    render() {
        if (!this.iface) return nothing;

        const statusClass = this.iface.is_up ? 'network-up' : 'network-down';
        const statusIcon = this.iface.is_up ? '●' : '○';
        const ipv4List = this.iface.ipv4 && this.iface.ipv4.length > 0 ? this.iface.ipv4 : [];
        const ipv6List = this.iface.ipv6 && this.iface.ipv6.length > 0 ? this.iface.ipv6 : [];

        return html`
            <div class="network-interface">
                <div class="network-interface-header">
                    <span class="network-interface-name ${statusClass}">
                        <span class="network-status-icon">${statusIcon}</span>
                        ${this.iface.name}
                    </span>
                    ${this.iface.mac ? html`<span class="network-mac">${this.iface.mac}</span>` : nothing}
                </div>
                ${ipv4List.map(ip => html`<div class="network-ip ipv4">IPv4: ${ip}</div>`)}
                ${ipv6List.map(ip => html`<div class="network-ip ipv6">IPv6: ${ip}</div>`)}
            </div>
        `;
    }
}

customElements.define('ag-network-card', AgNetworkCard);
