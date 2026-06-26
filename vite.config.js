/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const BACKEND_PORT = process.env.BACKEND_PORT || '8001';
// Bundle analysis is opt-in: `vite build --mode analyze`. Off by default so the
// report is never produced during normal builds (and thus never deployed).
const isAnalyze = process.argv.includes('analyze');

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  // Root directory (where index.html is located)
  root: '.',
  // Public assets directory (static files that are copied as-is)
  publicDir: 'public',
  // Enabled to support sw.js, manifest, and other static assets

  // Development server configuration
  server: {
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: ['io.di-marco.net', '8443.tars.di-marco.net', 'tars.di-marco.net', '10.0.4.254', 'localhost'],
    https: process.env.VITE_HTTPS === 'true' ? {
      cert: '/var/www/audiogravity-frontend/ssl/cert.pem',
      key: '/var/www/audiogravity-frontend/ssl/key.pem',
    } : false,
    hmr: {
      protocol: process.env.VITE_HMR_CLIENT_PORT ? 'wss'
                : (process.env.VITE_HTTPS === 'true' ? 'wss' : 'ws'),
      port: 3000,
      clientPort: process.env.VITE_HMR_CLIENT_PORT
        ? parseInt(process.env.VITE_HMR_CLIENT_PORT)
        : 3000
    },
    // Proxy API requests to backend
    proxy: {
      '/api': {
        target: `http://localhost:${BACKEND_PORT}`,
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api/, '') // Remove /api prefix
      },
      '/sse': {
        target: `http://localhost:${BACKEND_PORT}`,
        changeOrigin: true
      },
      '/sysinfo/terminal/ws': {
        target: `ws://localhost:${BACKEND_PORT}`,
        ws: true,
        changeOrigin: true
      }
    }
  },
  // Build configuration
  build: {
    outDir: '_site',
    emptyOutDir: true,
    // Multi-page app configuration
    rollupOptions: {
      input: {
        main: './index.html',
        login: './login.html'
      },
      output: {
        // Granular chunk splitting for better caching and parallel loading.
        // Each group below is a stable unit that rarely changes independently:
        //   lit         — framework core (never changes within a Lit major)
        //   icons       — all SVG paths; updated only when new icons are added
        //   atoms       — primitive UI elements; stable between feature releases
        //   nowplaying  — mini + fullscreen player; changes with player features
        //   streaming   — service auth cards (HQP, Qobuz, Tidal, UPnP renderer)
        //   library     — library store, api, constants; isolated from UI atoms
        manualChunks(id) {
          if (id.includes('lit-html') || id.includes('lit-element') || id.includes('/lit/') || id.includes('@lit/')) return 'lit';
          if (id.includes('ag-icons.js')) return 'icons';
          if (id.includes('/atoms/')) return 'atoms';
          if (id.includes('ag-now-playing')) return 'nowplaying';
          if (id.includes('ag-hqplayer') || id.includes('ag-qobuz-output') || id.includes('ag-tidal-output') || id.includes('ag-upnp-renderer-card')) return 'streaming';
          if (id.includes('library-store') || id.includes('library-api') || id.includes('library-constants')) return 'library-core';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    },
    // Generate source maps — 'hidden' generates .map files but does NOT embed the
    // sourceMappingURL comment in the bundle. DevTools won't find them automatically,
    // but they can be uploaded to an error monitoring tool (e.g., Sentry) if needed.
    // SECURITY: Do NOT use `true` in production — it exposes full original source code.
    sourcemap: 'hidden',
    // Target modern browsers — prevents esbuild from adding -webkit- vendor prefixes
    // (e.g. -webkit-backdrop-filter) that conflict with Safari's compositing
    target: ['chrome90', 'firefox90', 'safari16', 'edge90'],
    // Minification
    minify: 'esbuild',
    // Asset handling
    assetsInlineLimit: 4096,
    // Inline assets smaller than 4KB

    // Chunk size warnings
    chunkSizeWarningLimit: 1000
  },
  // Plugin configuration
  plugins: [
  // Bundle analyzer — opt-in only (`vite build --mode analyze`).
  ...(isAnalyze ? [visualizer({
    filename: 'stats.html',
    open: false,
    gzipSize: true,
    brotliSize: true,
    template: 'treemap'
  })] : []),

  // PWA — injectManifest mode: uses our hand-written sw.js as the base and
  // injects the Workbox precache manifest (all hashed Vite assets) at the
  // self.__WB_MANIFEST injection point. The SW handles all cache logic itself.
  VitePWA({
    strategies: 'injectManifest',
    srcDir: '.',
    filename: 'sw.js',
    injectRegister: null,           // we register manually in common.js
    manifest: false,                // we have our own site.webmanifest in public/
    injectManifest: {
      // Precache all JS/CSS/image assets produced by Vite (hashed filenames).
      // HTML entry points and sw.js itself are excluded automatically.
      globPatterns: ['assets/**/*.{js,css,png,webp,svg,woff,woff2}'],
      globIgnores: ['stats.html'],
      // Raise limit for large Nuitka-generated chunks (main bundle ~570 KB).
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
    },
    devOptions: {
      enabled: false,               // SW off in dev (common.js guards this too)
    },
  }),
  ],
  test: {
    projects: [
      // Unit tests (Node.js, no browser)
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['js/**/*.test.js'],
          environment: 'jsdom',
        },
      },
      // Storybook interaction tests (browser)
      {
        extends: true,
        plugins: [
        storybookTest({
          configDir: path.join(dirname, '.storybook')
        })],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [{
              browser: 'chromium'
            }]
          },
          setupFiles: ['.storybook/vitest.setup.js']
        },
      },
    ]
  }
});