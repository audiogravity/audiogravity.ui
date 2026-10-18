import { html } from 'lit';
import './ag-prov-dop-switch.js';

export default {
    title: 'Molecules/ProvDopSwitch',
    component: 'ag-prov-dop-switch',
};

const Template = (args) => html`
  <div style="padding: 20px; max-width: 480px;">
    <ag-prov-dop-switch .checked=${args.checked} ?pending=${args.pending}
        ?disabled=${args.disabled}></ag-prov-dop-switch>
  </div>
`;

export const Off = Template.bind({});
Off.args = { checked: false, disabled: false };

export const On = Template.bind({});
On.args = { checked: true, disabled: false };

/** MPD cannot say how it sends DSD to its output: nothing to show, nothing to change. */
export const Unknown = Template.bind({});
Unknown.args = { checked: null, disabled: false };

/** Another output chosen, not applied yet: DoP belongs to one DAC. */
export const OtherOutputChosen = Template.bind({});
OtherOutputChosen.args = { checked: true, pending: true, disabled: false };
