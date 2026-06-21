/**
 * @module AgButton
 * @description Atomic button component
 * Standardized action button for the application.
 */

import { LitElement, html } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import {
    iconRepeat, iconPause, iconPlay, iconShuffle, iconSkipBack, iconUpNext,
    iconMusicNote, iconVolume, iconSettings, iconClose, iconDownload, iconUpload,
    iconDsdLock, iconUnlock, iconKey, iconDocs, iconApiTree, iconArrowLeft,
    iconCode, iconCheck, iconWarning, iconSave, iconSliders, iconHistory,
    iconTrash, iconInfo, iconWifi, iconCpu, iconThermometer, iconMemory,
    iconHardDrive, iconConnection, iconClock, iconLogout, iconCopy, iconPencil,
    iconCheckCircle, iconCircle, iconSpinner, iconZap, iconEye, iconEyeOff,
    iconPowerCord, iconUser, iconUserAdmin, iconHeadphones, iconSettingsSliders,
    iconShield, iconArrowUp, iconArrowDown, iconFileText, iconTerminal, iconPower,
    iconDatabase, iconSmartphone, iconLayers, iconUndo, iconMinimize, iconMaximize,
    iconCreditCard, iconExternalLink, iconBarChart, iconPlus
} from '../../ag-icons.js';

/** Map from legacy icomoon class name to SVG icon template. */
const ICON_MAP = {
    'icon-loop2':            iconRepeat,
    'icon-pause2':           iconPause,
    'icon-play3':            iconPlay,
    'icon-shuffle':          iconShuffle,
    'icon-first':            iconSkipBack,
    'icon-last':             iconUpNext,
    'icon-music':            iconMusicNote,
    'icon-file-music':       iconMusicNote,
    'icon-volume-medium':    iconVolume,
    'icon-cog':              iconSettings,
    'icon-cross':            iconClose,
    'icon-download':         iconDownload,
    'icon-download3':        iconDownload,
    'icon-upload':           iconUpload,
    'icon-upload3':          iconUpload,
    'icon-lock':             iconDsdLock,
    'icon-unlocked':         iconUnlock,
    'icon-key':              iconKey,
    'icon-books':            iconDocs,
    'icon-tree':             iconApiTree,
    'icon-arrow-left':       iconArrowLeft,
    'icon-code':             iconCode,
    'icon-checkmark':        iconCheck,
    'icon-warning':          iconWarning,
    'icon-floppy-disk':      iconSave,
    'icon-equalizer2':       iconSliders,
    'icon-history':          iconHistory,
    'icon-bin':              iconTrash,
    'icon-info':             iconInfo,
    'icon-wifi':             iconWifi,
    'icon-chip':             iconCpu,
    'icon-thermometer':      iconThermometer,
    'icon-memory':           iconMemory,
    'icon-drive':            iconHardDrive,
    'icon-connection':       iconConnection,
    'icon-clock':            iconClock,
    'icon-exit':             iconLogout,
    'icon-copy':             iconCopy,
    'icon-pencil':           iconPencil,
    'icon-checkmark-circle': iconCheckCircle,
    'icon-circle':           iconCircle,
    'icon-spinner':          iconSpinner,
    'icon-spinner11':        iconSpinner,
    'icon-power':            iconZap,
    'icon-eye':              iconEye,
    'icon-eye-blocked':      iconEyeOff,
    'icon-power-cord':       iconPowerCord,
    'icon-user':             iconUser,
    'icon-user-tie':         iconUserAdmin,
    'icon-headphones':       iconHeadphones,
    'icon-cogs':             iconSettingsSliders,
    'icon-shield':           iconShield,
    'icon-processor':        iconCpu,
    'icon-arrow-up2':        iconArrowUp,
    'icon-arrow-down2':      iconArrowDown,
    'icon-file-text2':       iconFileText,
    'icon-terminal':         iconTerminal,
    'icon-power2':           iconPower,
    'icon-database':         iconDatabase,
    'icon-mobile':           iconSmartphone,
    'icon-stack':            iconLayers,
    'icon-undo2':            iconUndo,
    'icon-shrink2':          iconMinimize,
    'icon-enlarge2':         iconMaximize,
    'icon-paypal':           iconCreditCard,
    'icon-external-link':    iconExternalLink,
    'icon-stats-dots':       iconBarChart,
    'icon-plus':             iconPlus,
};

/**
 * Button Web Component
 * @element ag-button
 *
 * @attr {string} type - Variant type: 'primary', 'secondary', 'warning', 'error' (default: 'primary')
 * @attr {string} label - Text to display inside the button
 * @attr {string} icon - Optional icon class (e.g., 'icon-play')
 * @attr {boolean} disabled - If true, button is disabled
 * @attr {boolean} loading - If true, disables button and shows spinner state
 * @attr {boolean} compact - If true, renders a smaller button
 * @attr {string} aria-label - Accessibility label (useful for icon-only buttons)
 *
 * @dependency css/components/button.css - Classes .action-btn, .primary, .secondary, etc.
 * @fires btn-click - Fired when the button is clicked (and not disabled)
 *
 * @example
 * <ag-button type="primary" label="Save"></ag-button>
 * <ag-button type="secondary" icon="icon-stop" disabled></ag-button>
 */
export class AgButton extends LitElement {
    static properties = {
        type: { type: String },
        label: { type: String },
        icon: { type: String },
        disabled: { type: Boolean },
        loading: { type: Boolean },
        compact: { type: Boolean },
        ariaLabel: { type: String, attribute: 'aria-label' }
    };

    constructor() {
        super();
        this.type = 'primary';
        this.label = '';
        this.icon = '';
        this.disabled = false;
        this.loading = false;
        this.compact = false;
        this.ariaLabel = '';
    }

    // Light DOM to use global existing components/button.css (.action-btn)
    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        this.style.display = 'contents';
    }

    _handleClick(e) {
        if (this.disabled || this.loading) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        // Let natural click event bubble, but we can also fire a custom event
        this.dispatchEvent(new CustomEvent('btn-click', {
            bubbles: true,
            composed: true,
            detail: { action: this.label || this.icon }
        }));
    }

    render() {
        const classes = {
            'action-btn': true,
            [this.type]: true,
            'compact': this.compact,
            'is-loading': this.loading
        };

        const isDisabled = this.disabled || this.loading;

        // Define Aria Label fallback (icon, label, or empty)
        const computedAriaLabel = this.ariaLabel || this.label || this.icon || '';

        return html`
            <button 
                class=${classMap(classes)}
                ?disabled=${isDisabled}
                aria-label=${computedAriaLabel}
                @click=${this._handleClick}
            >
                ${this.loading ? html`<svg class="ag-spin" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconSpinner}</svg>` : ''}
                ${this.icon && !this.loading
                    ? ICON_MAP[this.icon]
                        ? html`<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICON_MAP[this.icon]}</svg>`
                        : html`<span class=${this.icon}></span>`
                    : ''}
                ${this.label ? html`<span class="action-btn-text">${this.label}</span>` : ''}
            </button>
        `;
    }
}

// Define the custom element
customElements.define('ag-button', AgButton);
