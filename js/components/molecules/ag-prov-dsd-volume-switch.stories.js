import { html } from 'lit';
import './ag-prov-dsd-volume-switch.js';

export default {
    title: 'Molecules/ProvDsdVolumeSwitch',
    component: 'ag-prov-dsd-volume-switch',
};

const Template = (args) => html`
  <div style="padding: 20px; max-width: 480px;">
    <ag-prov-dsd-volume-switch .checked=${args.checked} ?pending=${args.pending}
        ?disabled=${args.disabled}></ag-prov-dsd-volume-switch>
  </div>
`;

/** The default: the DAC's own volume goes to full while it receives DSD. */
export const On = Template.bind({});
On.args = { checked: true, disabled: false };

/** For a DAC that lowers DSD properly: its volume is left as set. */
export const Off = Template.bind({});
Off.args = { checked: false, disabled: false };

/** No setting can be read for the output MPD plays on. */
export const Unknown = Template.bind({});
Unknown.args = { checked: null, disabled: false };

/** Another output chosen, not applied yet: the setting belongs to one DAC. */
export const OtherOutputChosen = Template.bind({});
OtherOutputChosen.args = { checked: true, pending: true, disabled: false };
