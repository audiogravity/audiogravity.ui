/**
 * @module AgProfilesPage
 * @description Page component for Audio Profiles management.
 * 
 * @element ag-profiles-page
 * 
 * @property {Array} profiles - List of available audio profiles
 * @property {string} activeProfileId - Currently active profile ID
 * @property {boolean} loading - Data loading state
 * 
 * @dependency ag-card-grid
 * @dependency ag-profile-card
 */
import { LitElement, html } from 'lit';
import { apiGet, apiPost } from '../../api.js';
import { showToast, showConfirm, handleError, getUserFriendlyError } from '../../ui-helpers.js';
import { AppState, EventEmitter, AgTimerManager } from '../../common.js';
import { addToHistory } from '../../history.js';
import { FetchController } from '../../core/FetchController.js';
import { ContextConsumer } from 'https://cdn.jsdelivr.net/npm/@lit/context@1.1.0/+esm';
import { appContext } from '../../core/app-context.js';
import '../molecules/ag-profile-detail-modal.js';
import '../atoms/ag-filter-bar.js';
import './ag-card-grid.js';
import '../molecules/ag-profile-card.js';

/**
 * AgProfilesPage
 * Orchestrates the Profiles tab: Loading, activating and deactivating profiles.
 */
export class AgProfilesPage extends LitElement {
    static properties = {
        profiles: { type: Array },
        services: { type: Object },
        activeProfiles: { type: Array },
        pipelineOutputs: { type: Object },
        profileMetrics: { type: Object },
        _filter: { type: String, state: true },
        _detailProfile: { type: Object, state: true }
    };

    constructor() {
        super();
        this.profiles = [];
        this.services = {};
        this.activeProfiles = [];
        this.pipelineOutputs = {};
        this.profileMetrics = {};
        this._filter = 'all';
        this._detailProfile = null;
        this._loaded = false;
        this._pollingInterval = null;

        this._bindAppVisible = this._handleAppVisible.bind(this);
        this._bindServiceChanged = this._handleServiceChanged.bind(this);
        this._bindPipelineUpdate = this._handlePipelineUpdate.bind(this);

        this.profilesFetch = new FetchController(this, {
            autoFetch: false,
            fetchFn: async () => {
                const [config, detailedProfiles] = await Promise.all([
                    apiGet('/profiles/configuration'),
                    apiGet('/profiles/detailed')
                ]);
                return { config, detailedProfiles };
            },
            onSuccess: (data) => {
                this.services = data.config?.services || {};
                this.profiles = data.detailedProfiles || [];
                this.activeProfiles = (data.detailedProfiles || [])
                    .filter(profile => profile.state === 'active')
                    .map(profile => profile.id);

                // PWA Snapshot support
                if (EventEmitter) {
                    EventEmitter.emit('profiles-list-update', this.profiles);
                }
            }
        });

        // Subscribe to Global App Context for Tab Changes
        new ContextConsumer(this, {
            context: appContext,
            subscribe: true,
            callback: (state) => {
                if (state && state.currentTab) {
                    this._handleTabChanged({ active: state.currentTab });
                }
            }
        });
    }

    createRenderRoot() {
        return this; // Light DOM
    }

    connectedCallback() {
        super.connectedCallback();
        if (EventEmitter) {
            EventEmitter.on('app-visible', this._bindAppVisible);
            EventEmitter.on('service-changed', this._bindServiceChanged);
            
            // PHASE 3.7: Reactive live updates for service states within profiles
            this._onServicesMetrics = (data) => {
                if (!this.profiles || !data.services) return;
                
                let hasChanged = false;
                const servicesData = data.services;
                
                // Update each profile's internal service status list
                this.profiles.forEach(profile => {
                    if (profile.services_status) {
                        profile.services_status.forEach(status => {
                            const serviceMetric = servicesData[status.logical_name] || servicesData[status.systemd_unit.replace('.service', '')];
                            if (serviceMetric && serviceMetric.state) {
                                const newState = serviceMetric.state;
                                if (status.state !== newState) {
                                    status.state = newState;
                                    status.is_running = (newState === 'active');
                                    hasChanged = true;
                                }
                            }
                        });
                    }
                });

                if (hasChanged) {
                    this.requestUpdate();
                }
            };
            EventEmitter.on('services-metrics', this._onServicesMetrics);

            this._onProfileMetrics = ({ profile_id, metrics }) => {
                if (!profile_id || !metrics) return;
                this.profileMetrics = { ...this.profileMetrics, [profile_id]: metrics };
            };
            EventEmitter.on('profile-metrics-update', this._onProfileMetrics);
        }

        // Track profiles awaiting async activation/deactivation
        this._pendingProfiles = new Map(); // profileId → { name, action }

        // PERFORMANCE OPTIMIZATION (Phase 2):
        // Memory leak prevention: use bound handler for SSE event
        this._onProfileUpdate = (e) => {
            const { profile_id, new_state, success, failed_services, message } = e.detail;
            const pending = this._pendingProfiles.get(profile_id);
            this._updateProfileState(profile_id, new_state);
            if (pending && new_state !== 'activating' && new_state !== 'deactivating') {
                this._pendingProfiles.delete(profile_id);
                const actionLabel = pending.action === 'activate' ? 'Activated' : 'Deactivated';
                if (success === false) {
                    if (showToast) showToast('warning', 'Some Services Failed', (failed_services || []).join(', ') || message, 6000);
                } else {
                    if (showToast) showToast('success', `Profile ${actionLabel}`, pending.name);
                }
                if (EventEmitter) {
                    EventEmitter.emit('profile-changed', { profileId: profile_id, action: pending.action === 'activate' ? 'activated' : 'deactivated' });
                }
                if (addToHistory) addToHistory('profile', `${actionLabel}: ${pending.name}`, success !== false);
            }
        };
        window.addEventListener('profile-state-update', this._onProfileUpdate);
        window.addEventListener('audio-pipeline-update', this._bindPipelineUpdate);

        if (AppState.currentTab === 'profiles' || window.location.hash === '#profiles') {
            this.updateComplete.then(() => this._loadProfiles());
            this._startPolling();
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        window.removeEventListener('profile-state-update', this._onProfileUpdate);
        window.removeEventListener('audio-pipeline-update', this._bindPipelineUpdate);
        if (EventEmitter) {
            EventEmitter.off('app-visible', this._bindAppVisible);
            EventEmitter.off('service-changed', this._bindServiceChanged);
            EventEmitter.off('services-metrics', this._onServicesMetrics);
            EventEmitter.off('profile-metrics-update', this._onProfileMetrics);
        }
    }

    _handleTabChanged(data) {
        if (data.active === 'profiles') {
            if (!this._loaded) {
                this._loadProfiles();
            }
        }
    }

    _handleAppVisible(currentTab) {
        if (currentTab === 'profiles') {
            this._loadProfiles();
        }
    }

    _handleServiceChanged() {
        if (AppState.currentTab === 'profiles') {
            setTimeout(() => this._loadProfiles(), 1500);
        }
    }

    _loadProfiles() {
        this._loaded = true;
        return this.profilesFetch.fetch();
    }

    _updateProfileState(profileId, newState) {
        const idx = this.profiles.findIndex(p => p.id === profileId);
        if (idx >= 0) {
            this.profiles[idx] = { ...this.profiles[idx], state: newState };
            this.activeProfiles = this.profiles
                .filter(p => p.state === 'active')
                .map(p => p.id);
            this.requestUpdate();
            if (EventEmitter) EventEmitter.emit('profiles-list-update', this.profiles);
        }
    }

    /**
     * Builds a flat map { internal_service_id: current_output } from the audio_pipeline SSE event.
     * @param {CustomEvent} e
     */
    _handlePipelineUpdate(e) {
        const outputs = {};
        (e.detail?.nodes || []).forEach(node => {
            (node.internal_services || []).forEach(svc => {
                if (svc.current_output !== undefined) {
                    outputs[svc.id] = svc.current_output;
                }
            });
        });
        this.pipelineOutputs = outputs;
    }

    _startPolling() {
        // Polling removed in favor of SSE (Phase 3)
    }

    _stopPolling() {
        // Polling removed in favor of SSE (Phase 3)
    }

    async _handleToggleProfile(e) {
        const profileId = e.detail.profileId;
        const profile = this.profiles.find(p => p.id === profileId);
        if (!profile) return;

        const isActive = this.activeProfiles.includes(profileId);
        const action = isActive ? 'deactivate' : 'activate';
        const actionLabel = action.charAt(0).toUpperCase() + action.slice(1);

        let confirmTitle = `${actionLabel} Profile`;
        let confirmMessage = `Are you sure you want to ${action} "${profile.name}"?`;

        if (profile.critical) {
            confirmTitle = `${actionLabel} Critical Profile`;
            if (action === 'activate') {
                confirmMessage = `Are you sure you want to activate "${profile.name}"? This will stop other audio services.`;
            } else {
                confirmMessage = `Are you sure you want to deactivate "${profile.name}"? This is a critical profile.`;
            }
        }

        const confirmed = await showConfirm(confirmTitle, confirmMessage);
        if (!confirmed) return;

        // Immediate visual feedback before HTTP response
        const pendingState = isActive ? 'deactivating' : 'activating';
        this._updateProfileState(profileId, pendingState);

        try {
            const result = await apiPost(`/profiles/${profileId}/${action}`);

            if (result.pending) {
                // Fire-and-forget: SSE event will deliver the final state and toast
                this._pendingProfiles.set(profileId, { name: profile.name, action });
            } else {
                // Synchronous response (legacy fallback)
                if (addToHistory) addToHistory('profile', `${actionLabel}d: ${profile.name}`, result.success);

                if (result.success) {
                    this._updateProfileState(profileId, result.state || (isActive ? 'inactive' : 'active'));
                    if (EventEmitter) {
                        EventEmitter.emit('profile-changed', {
                            profileId: profileId,
                            action: isActive ? 'deactivated' : 'activated',
                            profile: profile
                        });
                    }
                    if (showToast) showToast('success', isActive ? 'Profile Deactivated' : 'Profile Activated', profile.name);
                    if (result.failed_services && result.failed_services.length > 0) {
                        if (showToast) showToast('warning', 'Some Services Failed', result.failed_services.join(', '), 6000);
                    }
                } else {
                    this._updateProfileState(profileId, isActive ? 'active' : 'inactive');
                    throw new Error(result.message || `${actionLabel} failed`);
                }
            }
        } catch (error) {
            // Revert optimistic state on error
            this._updateProfileState(profileId, isActive ? 'active' : 'inactive');
            console.error('Profile action failed:', error);
            if (addToHistory) addToHistory('profile', `Failed: ${profile.name} - ${error.message}`, false);
            handleError(error, 'Profile operation failed');
        }
    }

    /**
     * Opens the detail modal for a given profile.
     * @param {CustomEvent} e - show-profile-detail event with { profile } in detail
     */
    _handleShowDetail(e) {
        this._detailProfile = e.detail?.profile || null;
    }

    /**
     * Resolves session history entries relevant to the given profile.
     * @param {Object} profile
     * @returns {Array}
     */
    _profileHistory(profile) {
        return (AppState.profileHistory || [])
            .filter(h => h.action && h.action.includes(profile.name))
            .slice(0, 8);
    }

    _showInfo() {
        if (!window.UIComponents || !window.UIComponents.InfoModal) return;

        const content = window.UIComponents.InfoModal.createContent(
            'Audiogravi<sup>ty</sup> Profiles represent high-level automation scenarios for your audio system.',
            [
                { title: 'One-Click Orchestration', text: 'Switching a profile automatically starts necessary services and stops conflicting ones to ensure bit-perfect playback.' },
                { title: 'Audiophile Scenarios', text: 'Profiles optimized for Hi-Res Audio or Minimalist configurations to reduce jitter.' },
                { title: 'Critical Profiles', text: 'Essential profiles for your audio chain, requiring confirmation before major changes.' },
                { title: 'Starts / Stops / Output', text: 'Each tile shows the raw service IDs started and stopped by the profile, and the live audio output port resolved from the pipeline (e.g. usb, toslink).' },
                { title: 'Health Bar', text: 'The coloured bar at the bottom of each tile shows the proportion of active (green), failed (red) and idle (grey) services in real time.' },
                { title: 'Last Activated', text: 'Relative timestamp of the last profile activation (e.g. "2h ago"). Updated on every activation event.' },
                { title: 'Quick Filter', text: 'Use ALL / ACTIVE / IDLE to narrow the profile list. Active profiles are always sorted to the top.' },
                { title: 'Detail View', text: 'Click a profile name to open a detail panel showing the full service table and the session activation history.' },
                { title: 'Dedicated History', text: 'Monitor every activation and potential service failure in the history panel.' }
            ]
        );
        window.UIComponents.InfoModal.show('About Audiogravity Profiles', content);
    }

    render() {
        // Sort: active profiles first, then rest — then apply filter
        const sorted = [...this.profiles].sort((a, b) => {
            const aActive = a.state === 'active' ? 0 : 1;
            const bActive = b.state === 'active' ? 0 : 1;
            return aActive - bActive;
        });

        const filtered = sorted.filter(p => {
            if (this._filter === 'active') return p.state === 'active';
            if (this._filter === 'idle')   return p.state !== 'active';
            return true;
        });

        const filterOptions = [
            { label: 'ALL',    value: 'all'    },
            { label: 'ACTIVE', value: 'active' },
            { label: 'IDLE',   value: 'idle'   }
        ];

        return html`
            <ag-profile-detail-modal
                .profile=${this._detailProfile}
                ?show=${!!this._detailProfile}
                .history=${this._detailProfile ? this._profileHistory(this._detailProfile) : []}
                @modal-close=${() => { this._detailProfile = null; }}>
            </ag-profile-detail-modal>
            <div class="profiles-zone tab-zone">
                <div class="tab-title-container">
                    <h2>PROFILES</h2>
                    <span class="badge info clickable" @click=${this._showInfo}>INFO</span>
                </div>
                <div class="tab-filter-row">
                    <ag-filter-bar
                        .options=${filterOptions}
                        value=${this._filter}
                        @filter-change=${e => { this._filter = e.detail.value; }}>
                    </ag-filter-bar>
                </div>

                <ag-card-grid
                    id="profilesGrid"
                    class="profiles-grid"
                    grid-class="profiles-grid-container"
                    skeleton-class="profile-tile"
                    empty-message="No profiles available"
                    .items=${filtered}
                    ?loading=${this.profilesFetch.loading}
                    error=${this.profilesFetch.error || ''}
                    .renderItem=${(profile, index) => html`
                        <ag-profile-card
                            .profile=${profile}
                            .isActive=${this.activeProfiles.includes(profile.id)}
                            .servicesConfig=${this.services}
                            .pipelineOutputs=${this.pipelineOutputs}
                            .profileMetrics=${this.profileMetrics[profile.id] || null}
                            .delayIndex=${index}>
                        </ag-profile-card>
                    `}
                    @toggle-profile=${this._handleToggleProfile}
                    @show-profile-detail=${this._handleShowDetail}>
                </ag-card-grid>
            </div>
        `;
    }
}

customElements.define('ag-profiles-page', AgProfilesPage);
