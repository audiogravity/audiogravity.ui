/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';
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
        // Regroupe les dépendances Lit dans un chunk séparé et stable
        manualChunks: {
          lit: ['lit', 'lit-html', 'lit-element']
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
  // Bundle analyzer — opt-in only (`vite build --mode analyze`). Written to
  // frontend/stats.html (gitignored, OUTSIDE the _site/ build output) so the
  // report is never bundled into a release and never deployed.
  ...(isAnalyze ? [visualizer({
    filename: 'stats.html',
    open: false,
    gzipSize: true,
    brotliSize: true,
    template: 'treemap' // 'sunburst', 'treemap', 'network'
  })] : [])],
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