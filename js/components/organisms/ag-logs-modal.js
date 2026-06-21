/**
 * @module AgLogsModal
 * @description Organism component for displaying installation/process logs with a progress bar.
 * Uses ag-modal as the layout foundation.
 * 
 * @element ag-logs-modal
 * 
 * @attr {boolean} is-open - Modal visibility state
 * @attr {string} title - Modal title
 * @attr {number} progress - Progress percentage (0-100)
 * @attr {string} statusText - Text displayed below progress bar
 * @attr {boolean} isActive - Whether the operation is active (animates progress bar)
 * @attr {boolean} showCancel - Whether to show the cancel button
 * @attr {Array} logs - Log entries: [{ timestamp, level, message }]
 * 
 * @dependency ag-modal
 * @dependency css/components/progress.css, css/components/modal.css - Progress bar and modal styles
 * 
 * @fires close-request - Dispatched when CLOSE button is clicked
 * @fires cancel-request - Dispatched when CANCEL OPERATION button is clicked
 */

import { LitElement, html } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { escapeHtml, showToast } from '../../common.js';
import { logger } from '../../utils.js';
import { copyToClipboard } from '../../ui-helpers.js';
import { iconCopy } from '../../ag-icons.js';

export class AgLogsModal extends LitElement {
    static properties = {
        isOpen: { type: Boolean, attribute: 'is-open' },
        title: { type: String },
        progress: { type: Number },
        statusText: { type: String },
        isActive: { type: Boolean },
        showCancel: { type: Boolean },
        logs: { type: Array }
    };

    constructor() {
        super();
        this.isOpen = false;
        this.title = 'Processing...';
        this.progress = 0;
        this.statusText = 'Initializing...';
        this.isActive = true;
        this.showCancel = false;
        this.logs = [];
    }

    createRenderRoot() {
        return this; // Light DOM
    }

    updated(changedProperties) {
        if (changedProperties.has('isOpen') && this.isOpen) {
            // Can scroll to bottom when opening if logs exist
            this._scrollToBottom();
        }
        if (changedProperties.has('logs')) {
            this._scrollToBottom();
        }
    }

    clearLogs() {
        this.logs = [];
    }

    appendLogs(newLogs) {
        if (!newLogs || !newLogs.length) return;

        const currentLogsMap = new Set(this.logs.map(l => l.timestamp));
        let added = false;

        const toAdd = newLogs.filter(log => {
            if (!currentLogsMap.has(log.timestamp)) {
                added = true;
                return true;
            }
            return false;
        });

        if (added) {
            this.logs = [...this.logs, ...toAdd];
        }
    }

    _scrollToBottom() {
        setTimeout(() => {
            const container = this.querySelector('#installLogsContainerLit');
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
        }, 10);
    }

    _handleClose() {
        this.isOpen = false;
        this.dispatchEvent(new CustomEvent('close-request', { bubbles: true, composed: true }));
    }

    _handleCancel() {
        this.dispatchEvent(new CustomEvent('cancel-request', { bubbles: true, composed: true }));
    }

    async _copyLogs() {
        let logsText = '';
        const container = this.querySelector('#installLogsContainerLit');
        if (container) {
            logsText = Array.from(container.querySelectorAll('.log-entry'))
                .map(entry => entry.textContent.replace(/\s+/g, ' ').trim())
                .join('\n');
        }
        if (!logsText && this.logs?.length) {
            logsText = this.logs.map(log => {
                const time = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '';
                const lvl  = (log.level || 'INFO').toUpperCase();
                return `[${time}] [${lvl}] ${log.message || ''}`;
            }).join('\n');
        }
        if (!logsText) {
            showToast('warning', 'Empty', 'No logs to copy');
            return;
        }
        logger.log("--- SYSTEM LOGS EXPORT ---");
        logger.log(logsText);
        logger.log("--------------------------");
        try {
            await copyToClipboard(logsText);
            showToast('success', 'Copied', 'Logs copied to clipboard!');
        } catch {
            showToast('error', 'Copy Failed', 'Browser blocked copying. See console for logs.');
        }
    }

    render() {
        const progressClasses = {
            'premium-progress': true,
            'active': this.isActive
        };

        return html`
            <ag-modal 
                ?show=${this.isOpen} 
                @modal-close=${this._handleClose}
                size="large"
                title="${this.title}"
                .bodyTemplate=${html`
                    <div class="install-progress-container">
                        <div class=${classMap(progressClasses)}>
                            <div class="premium-progress-bar">
                                <div class="premium-progress-fill" style="width: ${this.progress}%"></div>
                            </div>
                        </div>
                        <span class="install-progress-text">${this.statusText}</span>
                    </div>
                    <div class="log-container" id="installLogsContainerLit">
                        ${Array.isArray(this.logs) ? this.logs.map(log => html`
                            <div class="log-entry log-level-${log.level}" data-timestamp="${log.timestamp}">
                                <span class="log-time">${new Date(log.timestamp).toLocaleTimeString()}</span>
                                <span class="log-badge log-badge-${log.level}">${log.level.toUpperCase()}</span>
                                <span class="log-msg">${escapeHtml(log.message)}</span>
                            </div>
                        `) : ''}
                    </div>
                `}
                .footerTemplate=${html`
                    <button class="btn-action" @click=${this._copyLogs}>
                        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconCopy}</svg> Copy Logs
                    </button>
                    ${this.showCancel ? html`
                        <button class="btn-action error" @click=${this._handleCancel}>
                            Cancel Operation
                        </button>
                    ` : ''}
                    <button class="btn-action" @click=${this._handleClose}>Close</button>
                `}>
            </ag-modal>
        `;
    }
}

customElements.define('ag-logs-modal', AgLogsModal);
