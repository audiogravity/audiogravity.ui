import { html } from 'lit';
import './ag-stats-shares.js';

export default {
    title: 'Molecules/StatsShares',
    component: 'ag-stats-shares',
};

const Template = ({ rows }) => html`
    <div class="lib-stats" style="max-width:390px">
        <ag-stats-shares .rows=${rows} .total=${rows.reduce((s, r) => s + r.seconds, 0)}></ag-stats-shares>
    </div>
`;

const h = (x) => x * 3600;

/** By source: what names nothing is greyed. */
export const Sources = Template.bind({});
Sources.args = {
    rows: [{ label: 'Qobuz', seconds: h(15) }, { label: 'Local Library', seconds: h(10.6) },
           { label: 'Radio', seconds: h(5.5) }, { label: 'HIGHRESAUDIO', seconds: h(3.5) },
           { label: 'Tidal', seconds: h(2.4) }, { label: 'AirPlay', seconds: h(1.6) },
           { label: 'MinimServer', seconds: h(0.8) }, { label: null, seconds: h(0.2) }],
};

/** By output: two rows. */
export const Outputs = Template.bind({});
Outputs.args = { rows: [{ label: 'Heed Abacus', seconds: h(29) }, { label: 'Living room speaker', seconds: h(10.4) }] };

/** Genres: six, then the others and the unknown, greyed. */
export const Genres = Template.bind({});
Genres.args = {
    rows: [{ label: 'Jazz', seconds: h(9.5) }, { label: 'Classical', seconds: h(7.1) },
           { label: 'Electronic', seconds: h(5.9) }, { label: 'Rock', seconds: h(4.3) },
           { label: 'Soul', seconds: h(2.8) }, { label: 'A genre with a very long name', seconds: h(1.2) },
           { label: 'Other', seconds: h(2.3), muted: true }, { label: 'Unknown', seconds: h(6.3), muted: true }],
};
