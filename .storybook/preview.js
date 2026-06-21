/**
 * STORYBOOK GLOBAL SETUP
 * Prevents real API calls and auth redirects during Storybook/Vitest tests.
 */
window.IS_STORYBOOK = true;
window.AG_CONFIG = {
    apiKey: 'mock-key-for-storybook',
    apiUrl: 'http://localhost:8000'
};

// Mock authentication state for components
window.sessionStorage.setItem('jwt_token', 'mock-token');
window.sessionStorage.setItem('jwt_user', JSON.stringify({ username: 'storybook-user', role: 'admin' }));
window.sessionStorage.setItem('jwt_expiry', new Date(Date.now() + 3600000).toISOString());

// --- GLOBAL FETCH MOCK FOR TESTS ---
const originalFetch = window.fetch;
window.fetch = (url, options) => {
    const urlStr = url.toString();
    console.warn(`[Storybook Mock Fetch] ${urlStr}`);

    // Standard responses for common endpoints
    const mocks = {
        '/auth/users': [],
        '/auth/users/active': [],
        '/sysinfo/status': { connected: true, uptime: 1000 },
        '/sysinfo/current': { cpu_percent: 10, memory_percent: 20 },
        '/perf/stats': [],
        '/performance/cpu/info': []
    };

    const match = Object.keys(mocks).find(key => urlStr.endsWith(key));
    if (match) {
        return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(mocks[match])
        });
    }

    // Default 200 OK for other unknown routes
    return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, message: 'Mock response' })
    });
};

import '../css/main.css';
import { ContextProvider } from 'https://cdn.jsdelivr.net/npm/@lit/context@1.1.0/+esm';
import { appContext } from '../js/core/app-context.js';


/** @type { import('@storybook/web-components-vite').Preview } */
const preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      test: "todo"
    }
  },

  decorators: [
    (story, context) => {
      const { theme, darkMode } = context.globals;
      const body = document.body;

      // Reset
      body.setAttribute('data-theme', theme || 'slate');
      if (darkMode === 'dark') {
        body.classList.add('dark-mode');
      } else {
        body.classList.remove('dark-mode');
      }

      // Instead of relying on a real AppState, we mock what AppContext Provider needs
      if (!window.__storybookContextProvider) {
         window.__storybookContextProvider = new ContextProvider(document.body, { context: appContext });
      }
      
      // We pass down fake context values depending on storybook globals
      window.__storybookContextProvider.setValue({
          theme: theme || 'slate',
          darkMode: darkMode === 'dark',
          user: { username: 'storybook-admin', role: 'admin' },
          isConnected: true,
          currentTab: 'dashboard'
      });

      return story();
    },
  ],
};

export const globalTypes = {
  theme: {
    name: 'Theme',
    description: 'Global theme for AudioGravity',
    defaultValue: 'slate',
    toolbar: {
      icon: 'circlehollow',
      items: [
        { value: 'slate', title: 'Slate (Default)' },
        { value: 'minimal', title: 'Minimal' },
      ],
    },
  },
  darkMode: {
    name: 'Dark Mode',
    description: 'Toggle Dark/Light mode',
    defaultValue: 'light',
    toolbar: {
      icon: 'mirror',
      items: [
        { value: 'light', title: 'Light' },
        { value: 'dark', title: 'Dark' },
      ],
    },
  },
};

export default preview;