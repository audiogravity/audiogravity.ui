import { html } from 'lit';
import './ag-event-item.js';

export default {
    title: 'Molecules/EventItem',
    component: 'ag-event-item',
};

const Template = (args) => html`
  <div style="padding: 20px; max-width: 400px; background: var(--bg-primary); border: 1px solid var(--border-color);">
    <ag-event-item 
        .payload="${args.payload}"
        @event-click="${(e) => console.log('Event clicked:', e.detail)}">
    </ag-event-item>
  </div>
`;

export const InfoEvent = Template.bind({});
InfoEvent.args = {
    payload: {
        timestamp: '19:40:01',
        level: 'INFO',
        message: 'System initialization complete',
        details: { mode: 'full-listen', latency: 'low' }
    }
};

export const CriticalEvent = Template.bind({});
CriticalEvent.args = {
    payload: {
        timestamp: '19:42:15',
        level: 'ERROR',
        message: 'Process xcore-audio-daemon crashed',
        details: { exit_code: 1, signal: 'SIGABRT' }
    }
};
