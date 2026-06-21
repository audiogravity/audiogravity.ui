import { html } from 'lit';
import './ag-event-detail-modal.js';

export default {
    title: 'Organisms/EventDetailModal',
    component: 'ag-event-detail-modal',
    argTypes: {
        show: { control: 'boolean' },
        event: { control: 'object' }
    },
};

const Template = (args) => html`
  <div style="height: 500px; padding: 20px;">
    <ag-event-detail-modal 
        ?show="${args.show}"
        .event="${args.event}"
        @modal-close="${() => console.log('Close requested')}">
    </ag-event-detail-modal>
  </div>
`;

export const Default = Template.bind({});
Default.args = {
    show: true,
    event: {
        timestamp: '2026-03-03 19:40:01',
        level: 'ERROR',
        message: 'Database connection failed',
        details: {
            driver: 'sqlite3',
            path: '/var/lib/audiogravity/db.sqlite',
            error: 'Database is locked',
            retryCount: 3
        }
    }
};
