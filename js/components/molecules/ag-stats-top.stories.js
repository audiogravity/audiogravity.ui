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

const cover = (artist, album) => `mb:${artist}:${album}`;

/** The three rankings, each row with its cover — Max Richter with none: the note. */
export const MostPlayed = Template.bind({});
MostPlayed.args = {
    artists: [{ artist: 'Miles Davis', seconds: h(3.67), plays: 41, cover_token: cover('Miles Davis', 'Kind of Blue') },
              { artist: 'Amelie Lens', seconds: h(2.92), plays: 38, cover_token: cover('Amelie Lens', 'AURA') },
              { artist: 'Anna Calvi', seconds: h(2.17), plays: 27, cover_token: cover('Anna Calvi', 'Hunter') },
              { artist: 'Bill Evans', seconds: h(1.8), plays: 19,
                cover_token: cover('Bill Evans', 'Sunday at the Village Vanguard') },
              { artist: 'Max Richter', seconds: h(1.53), plays: 12, cover_token: null }],
    albums: [{ album: 'Kind of Blue', artist: 'Miles Davis', seconds: h(2.43), plays: 6,
               cover_token: cover('Miles Davis', 'Kind of Blue') },
             { album: 'Sunday at the Village Vanguard', artist: 'Bill Evans', seconds: h(1.3), plays: 3,
               cover_token: cover('Bill Evans', 'Sunday at the Village Vanguard') }],
    tracks: [{ title: 'So What', artist: 'Miles Davis', album: 'Kind of Blue', seconds: h(1.08), plays: 7,
               cover_token: cover('Miles Davis', 'Kind of Blue') },
             { title: 'Lazarus', artist: 'David Bowie', album: 'Blackstar', seconds: h(0.53), plays: 1,
               cover_token: cover('David Bowie', 'Blackstar') }],
};

/** Nothing ranked yet. */
export const Empty = Template.bind({});
Empty.args = { artists: [], albums: [], tracks: [] };
