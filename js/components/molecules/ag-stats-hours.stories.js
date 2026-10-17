import { html } from 'lit';
import './ag-stats-hours.js';

export default {
    title: 'Molecules/StatsHours',
    component: 'ag-stats-hours',
};

/**
 * A week as a household listens: evenings every day, mornings on weekdays, afternoons at
 * the weekend, late on Friday and Saturday. Minutes per hour, on average per week.
 */
function household() {
    return Array.from({ length: 7 }, (_, day) => {
        const weekend = day >= 5;
        return Array.from({ length: 24 }, (_, hour) => {
            let minutes = 0;
            if (hour < 2) minutes = day === 4 || day === 5 ? 12 : 0;
            else if (hour >= 7 && hour <= 8) minutes = weekend ? 0 : 9;
            else if (hour >= 10 && hour <= 13) minutes = weekend ? 18 : 2;
            else if (hour >= 14 && hour <= 18) minutes = weekend ? 27 : 0;
            else if (hour >= 19 && hour <= 21) minutes = 31;
            else if (hour >= 22) minutes = day === 4 || day === 5 ? 44 : 16;
            return minutes * 60;
        });
    });
}

const Template = ({ week }) => html`
    <div class="lib-stats" style="max-width:390px">
        <ag-stats-hours .week=${week}></ag-stats-hours>
    </div>
`;

/** A household's week: a tap reads a square. */
export const Household = Template.bind({});
Household.args = { week: household() };

/** One evening only: a single square at the strongest step, the rest at nothing. */
export const OneEvening = Template.bind({});
OneEvening.args = {
    week: Array.from({ length: 7 }, (_, day) =>
        Array.from({ length: 24 }, (_, hour) => (day === 5 && hour === 21 ? 1800 : 0))),
};

/** Nothing recorded: the grid is not drawn. */
export const Empty = Template.bind({});
Empty.args = { week: Array.from({ length: 7 }, () => Array(24).fill(0)) };
