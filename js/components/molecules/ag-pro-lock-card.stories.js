import { html } from 'lit';
import './ag-pro-lock-card.js';
import { SOURCE_ICONS } from '../library-constants.js';

export default {
    title: 'Molecules/ProLockCard',
    component: 'ag-pro-lock-card',
};

const Template = ({ name, description, icon }) => html`
    <div class="lib-src-list" style="max-width:420px">
        <ag-pro-lock-card name=${name} description=${description} .icon=${icon}></ag-pro-lock-card>
    </div>
`;

export const StreamingService = Template.bind({});
StreamingService.args = { name: 'Qobuz', description: 'Hi-Res streaming', icon: './pics/qobuz.webp' };

export const WithoutLogo = Template.bind({});
WithoutLogo.args = { name: 'UPnP media servers', description: 'MinimServer and other servers on your network', icon: '' };

/** Tidal's mark, painted in the text colour: it follows the theme — dark mode included. */
export const ThemeAwareMark = Template.bind({});
ThemeAwareMark.args = { name: 'Tidal', description: 'Hi-Res streaming', icon: SOURCE_ICONS.src_tidal };
