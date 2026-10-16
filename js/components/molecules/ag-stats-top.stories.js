import { html } from 'lit';
import './ag-stats-top.js';

export default {
    title: 'Molecules/StatsTop',
    component: 'ag-stats-top',
};

const Template = (args) => html`
    <div class="lib-stats" style="max-width:390px">
        <ag-stats-top .artists=${args.artists} .albums=${args.albums} .tracks=${args.tracks}></ag-stats-top>
    </div>
`;

const h = (x) => x * 3600;

/** The three rankings; the selector switches. */
export const MostPlayed = Template.bind({});
MostPlayed.args = {
    artists: [{ artist: 'Miles Davis', seconds: h(3.67), plays: 41 }, { artist: 'Amelie Lens', seconds: h(2.92), plays: 38 },
              { artist: 'Anna Calvi', seconds: h(2.17), plays: 27 }, { artist: 'Bill Evans', seconds: h(1.8), plays: 19 },
              { artist: 'Max Richter', seconds: h(1.53), plays: 12 }],
    albums: [{ album: 'Kind of Blue', artist: 'Miles Davis', seconds: h(2.43), plays: 6 },
             { album: 'Sunday at the Village Vanguard', artist: 'Bill Evans', seconds: h(1.3), plays: 3 }],
    tracks: [{ title: 'So What', artist: 'Miles Davis', album: 'Kind of Blue', seconds: h(1.08), plays: 7 },
             { title: 'Lazarus', artist: 'David Bowie', album: 'Blackstar', seconds: h(0.53), plays: 1 }],
};

/** Nothing ranked yet. */
export const Empty = Template.bind({});
Empty.args = { artists: [], albums: [], tracks: [] };
