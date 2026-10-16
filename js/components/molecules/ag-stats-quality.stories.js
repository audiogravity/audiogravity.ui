import { html } from 'lit';
import './ag-stats-quality.js';

export default {
    title: 'Molecules/StatsQuality',
    component: 'ag-stats-quality',
};

const Template = ({ classes }) => html`
    <div class="lib-stats" style="max-width:390px">
        <ag-stats-quality .classes=${classes}></ag-stats-quality>
    </div>
`;

const h = (x) => x * 3600;

/** All four classes heard. */
export const AllClasses = Template.bind({});
AllClasses.args = {
    classes: [{ key: 'dsd', seconds: h(2.4) }, { key: 'hires', seconds: h(16.2) },
              { key: 'cd', seconds: h(15.4) }, { key: 'lossy', seconds: h(5.5) }],
};

/** Some formats were not shown: the fifth class, greyed. */
export const WithUnknown = Template.bind({});
WithUnknown.args = {
    classes: [{ key: 'dsd', seconds: 0 }, { key: 'hires', seconds: h(6) },
              { key: 'cd', seconds: h(3) }, { key: 'lossy', seconds: h(1) }, { key: 'unknown', seconds: h(0.7) }],
};
