import { createContext } from '@lit/context';

/**
 * Global Application Context using @lit/context
 * Replaces the need for EventBus.on() for global state propagation.
 */
export const appContext = createContext('app-context');
