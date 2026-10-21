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

/** Tracks with their covers, a station with its logo, the first still playing — the last
 *  recorded with no cover: the note. */
export const Latest = Template.bind({});
Latest.args = {
    listens: [
        { started_at: ago(4), seconds: 230, title: 'Blue in Green', artist: 'Miles Davis', album: 'Kind of Blue',
          live: false, source: 'Qobuz', output: 'Heed Abacus', in_progress: true,
          cover_token: 'mb:Miles Davis:Kind of Blue' },
        { started_at: ago(14), seconds: 540, title: 'So What', artist: 'Miles Davis', album: 'Kind of Blue',
          live: false, source: 'Qobuz', output: 'Heed Abacus', cover_token: 'mb:Miles Davis:Kind of Blue' },
        { started_at: ago(26), seconds: 360, title: 'Lazarus', artist: 'David Bowie', album: 'Blackstar',
          live: false, source: 'Local Library', output: 'Heed Abacus', cover_token: 'mb:David Bowie:Blackstar' },
        { started_at: ago(110), seconds: 4320, station: 'Radio Choco', live: true,
          source: 'Radio', output: 'Living room speaker', cover_token: 'url:https://example.org/radio-choco.png' },
        { started_at: ago(26 * 60), seconds: 240, title: 'AURA', artist: 'Amelie Lens', album: 'AURA',
          live: false, source: 'AirPlay', output: 'Heed Abacus', cover_token: null },
    ],
};

/** Nothing played yet. */
export const Empty = Template.bind({});
Empty.args = { listens: [] };
