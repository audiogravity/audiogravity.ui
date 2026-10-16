import { html } from 'lit';
import './ag-stats-bars.js';

export default {
    title: 'Molecules/StatsBars',
    component: 'ag-stats-bars',
};

const day = (i) => {
    const d = new Date(2026, 8, 17 + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const HOURS = [1.1, 1.6, 2.8, 2.4, 0, 0.9, 1.2, 0, 1.8, 3.1, 2.2, 0.6, 0, 1.0, 0.8,
               1.5, 2.6, 1.9, 0, 0.7, 1.1, 0.9, 1.4, 2.9, 2.1, 0, 0.8, 2.1, 1.3, 0.6];

const Template = ({ buckets, unit }) => html`
    <div class="lib-stats" style="max-width:390px">
        <ag-stats-bars .buckets=${buckets} unit=${unit}></ag-stats-bars>
    </div>
`;

/** Thirty days: three labels, a tap reads a bar. */
export const ThirtyDays = Template.bind({});
ThirtyDays.args = { unit: 'day', buckets: HOURS.map((h, i) => ({ start: day(i), seconds: h * 3600 })) };

/** A week: every day named. */
export const SevenDays = Template.bind({});
SevenDays.args = { unit: 'day', buckets: HOURS.slice(-7).map((h, i) => ({ start: day(23 + i), seconds: h * 3600 })) };

/** Twelve months, by month. */
export const TwelveMonths = Template.bind({});
TwelveMonths.args = {
    unit: 'month',
    buckets: [31, 35, 29, 26, 27, 21, 19, 14, 12, 17, 36, 20.7]
        .map((h, i) => ({ start: `${i < 2 ? 2025 : 2026}-${String(((i + 10) % 12) + 1).padStart(2, '0')}-01`, seconds: h * 3600 })),
};

/** Under an hour at most: the scale goes by minutes. */
export const UnderAnHour = Template.bind({});
UnderAnHour.args = { unit: 'day', buckets: [5, 12, 0, 40, 25, 8, 33].map((m, i) => ({ start: day(23 + i), seconds: m * 60 })) };
