import { ContextProvider } from 'https://cdn.jsdelivr.net/npm/@lit/context@1.1.0/+esm';
import { appContext } from './app-context.js';
import { EventBus, AppState } from './event-bus.js';
import { getCurrentUser } from '../auth.js';

/**
 * AppContextProvider mounts to document.body and provides 
 * the 'appContext' downward to all child Lit components.
 */
class AppContextProvider {
    constructor() {
        // We attach the provider to document.body so all elements can consume it.
        this.provider = new ContextProvider(document.body, { context: appContext });
        
        // Initial state
        this._updateState();

        // Listen to legacy events to translate them into Context updates
        EventBus.on('auth-changed', () => this._updateState());
        EventBus.on('theme-changed', () => this._updateState());
        EventBus.on('tab-changed', () => this._updateState());
        EventBus.on('connection-status', () => this._updateState());
    }

    _updateState() {
        // Collect current state to broadcast
        const state = {
            user: getCurrentUser(),
            theme: AppState.theme,
            currentTab: AppState.currentTab,
            connected: AppState.connected
        };

        // Broadcast to all contextual descendants
        this.provider.setValue(state);
    }
}

// Initialize immediately so context is available before components mount
export const appContextProvider = new AppContextProvider();
