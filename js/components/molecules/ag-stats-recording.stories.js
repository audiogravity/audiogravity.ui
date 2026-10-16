import { html } from 'lit';
import './ag-stats-recording.js';

/**
 * The recording reads its settings from the core (/listening/settings): without a core,
 * Storybook shows it as it is before the answer — the switch on and disabled.
 */
export default {
    title: 'Molecules/StatsRecording',
    component: 'ag-stats-recording',
};

export const BeforeTheCoreAnswers = () => html`
    <div class="lib-stats" style="max-width:390px">
        <ag-stats-recording></ag-stats-recording>
    </div>
`;
