import { html } from 'lit';
import './ag-stats-recent.js';

export default {
    title: 'Molecules/StatsRecent',
    component: 'ag-stats-recent',
};

const Template = ({ listens }) => html`
    <div class="lib-stats" style="max-width:390px">
        <ag-stats-recent .listens=${listens}></ag-stats-recent>
    </div>
`;

const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();

/** Tracks and a station. */
export const Latest = Template.bind({});
Latest.args = {
    listens: [
        { started_at: ago(10), seconds: 540, title: 'So What', artist: 'Miles Davis', album: 'Kind of Blue',
          live: false, source: 'Qobuz', output: 'Heed Abacus' },
        { started_at: ago(26), seconds: 360, title: 'Lazarus', artist: 'David Bowie', album: 'Blackstar',
          live: false, source: 'Local Library', output: 'Heed Abacus' },
        { started_at: ago(110), seconds: 4320, station: 'Radio Choco', live: true,
          source: 'Radio', output: 'Living room speaker' },
        { started_at: ago(26 * 60), seconds: 240, title: 'AURA', artist: 'Amelie Lens', album: 'AURA',
          live: false, source: 'AirPlay', output: 'Heed Abacus' },
    ],
};

/** Nothing played yet. */
export const Empty = Template.bind({});
Empty.args = { listens: [] };
