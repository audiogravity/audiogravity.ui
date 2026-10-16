import { html } from 'lit';
import './ag-stats-headline.js';

export default {
    title: 'Molecules/StatsHeadline',
    component: 'ag-stats-headline',
};

const Template = ({ summary, caption }) => html`
    <div class="lib-stats" style="max-width:390px">
        <ag-stats-headline .summary=${summary} caption=${caption}></ag-stats-headline>
    </div>
`;

/** Thirty days. */
export const ThirtyDays = Template.bind({});
ThirtyDays.args = {
    caption: 'in the last 30 days',
    summary: { total_seconds: 39.4 * 3600, listens: 418, albums: 61, active_days: 24, days: 30 },
};

/** The whole history: large figures. */
export const AllOfIt = Template.bind({});
AllOfIt.args = {
    caption: 'since 3 Mar 2025',
    summary: { total_seconds: 412 * 3600, listens: 5012, albums: 702, active_days: 452, days: 593 },
};
