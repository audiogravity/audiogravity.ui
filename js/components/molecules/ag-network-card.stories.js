import { html } from 'lit';
import './ag-network-card.js';

export default {
    title: 'Molecules/NetworkCard',
    component: 'ag-network-card',
};

const ifaceMock = {
    name: 'eth0',
    address: '192.168.1.42',
    netmask: '255.255.255.0',
    mac: 'aa:bb:cc:dd:ee:ff',
    rx: '1.2 GB',
    tx: '450.5 MB'
};

const Template = (args) => html`
  <div style="padding: 20px; max-width: 400px;">
    <ag-network-card .iface="${args.iface}"></ag-network-card>
  </div>
`;

export const Ethernet = Template.bind({});
Ethernet.args = {
    iface: ifaceMock
};

export const WiFi = Template.bind({});
WiFi.args = {
    iface: { ...ifaceMock, name: 'wlan0', address: '192.168.1.43' }
};
