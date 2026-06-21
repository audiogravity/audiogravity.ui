import { createContext } from 'https://cdn.jsdelivr.net/npm/@lit/context@1.1.0/+esm';

/**
 * Global Application Context using @lit/context
 * Replaces the need for EventBus.on() for global state propagation.
 */
export const appContext = createContext('app-context');
