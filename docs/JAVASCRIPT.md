# Web Component Architecture

Audiogravity uses a **Component-Driven Architecture** powered by **Lit 3**, **Vite 7**, and **Light DOM** for seamless global CSS integration.

---

## Tech Stack

- **Core**: [Lit 3](https://lit.dev/) — Web Components with reactive properties
- **Build**: [Vite 7](https://vitejs.dev/) — tree-shaking, code splitting, hidden source maps
- **State**: Reactive Properties (Lit) + `EventEmitter` pub/sub for SSE data streams
- **Styling**: Design token system (CSS custom properties) + modular stylesheets
- **Graph**: [Cytoscape.js](https://js.cytoscape.org/) + dagre — audio pipeline visualisation
- **Charts**: [Chart.js 4](https://www.chartjs.org/) (performance & latency) — loaded via CDN
- **Editor**: [CodeMirror 5](https://codemirror.net/5/) — JSON/INI/XML/Libconfig — loaded via CDN

---

## Project Structure

```
js/
├── core/
│   ├── app-context.js          # @lit/context app state definition
│   ├── app-context-provider.js # Context provider component
│   ├── config.js               # FRONTEND_VERSION + runtime config (AG_CONFIG)
│   ├── event-bus.js            # EventEmitter pub/sub (SSE data relay)
│   └── FetchController.js      # Lit Reactive Controller for API fetches
├── components/
│   ├── atoms/                  # 20 base components (stateless)
│   ├── molecules/              # 42 composite components
│   └── organisms/              # 42 page-level components
├── api.js                      # Centralized fetch wrapper (auth headers, error mapping)
├── auth.js                     # JWT session & role management
├── common.js                   # Shared logic & EventEmitter instance
├── sse.js                      # SSE connection manager (SharedWorker + EventSource)
├── push-manager.js             # Web Push (VAPID) subscription manager
├── timer.js                    # AgTimerManager — centralized timer registry
├── ui-helpers.js               # Toast, modal, confirm helpers
└── validation.js               # Config validation helpers
css/
├── main.css                    # Master CSS manifest (import order is strict)
├── themes.css                  # Design tokens + no-animations rules
├── themes/                     # Slate, Minimal, Gravity themes
├── layout.css                  # App shell (topbar, sidebar, footer)
├── components/                 # Shared component stylesheets
└── (page stylesheets)          # admin, services, performance, system…
public/
├── js/sse-worker.js            # Shared Worker — single SSE connection across tabs
├── ag-config.js                # Runtime config injected by install.sh
└── pics/                       # Icons, splash screens, source logos
```

---

## Reactive Data Flow

```
Backend (FastAPI)
    │ SSE /sse/dashboard
    ▼
public/js/sse-worker.js (SharedWorker — one connection per browser)
    │
js/sse.js (EventSource client + reconnect logic)
    │ EventEmitter.emit('sysinfo-update', data)
    ▼
EventBus (js/core/event-bus.js)
    │ EventEmitter.on('sysinfo-update', handler)
    ▼
Lit Component (requestUpdate() → render())
    │ Light DOM
    ▼
Browser DOM (inherits global CSS tokens)
```

- SSE data is **never** stored in Shadow DOM — Light DOM components receive it directly.
- Lit **batches** multiple property changes into a single microtask render.
- Components **unsubscribe** from EventBus in `disconnectedCallback()` to prevent memory leaks.

---

## Component Patterns

### Atoms — Base Elements
Encapsulated, stateless. No data fetching.
`ag-badge`, `ag-button`, `ag-sparkline`, `ag-stat-box`, `ag-status-indicator`, `ag-switch`, `ag-tooltip`, `ag-validation-badge`, `ag-audio-output`, `ag-pipeline-node`, `ag-pipeline-link`, `ag-source-badge`, `ag-health-bar`, `ag-dsd-lock`…

### Molecules — Contextual UI
Combinations of atoms that handle a specific data chunk. May emit CustomEvents upward.
`ag-service-card`, `ag-profile-card`, `ag-package-card`, `ag-system-tile`, `ag-tabs`, `ag-user-card`, `ag-tidal-output`, `ag-qobuz-output`, `ag-hqplayer-output`…

### Organisms — View Logic
Fetch data, manage state, orchestrate molecules.
`ag-audio-pipeline`, `ag-pipeline-page`, `ag-services-page`, `ag-performance-page`, `ag-admin-page`, `ag-library-page`, `ag-now-playing`, `ag-now-playing-fullscreen`…

---

## Communication: 3 Mechanisms

| Mechanism | Scope | When to use |
|---|---|---|
| **CustomEvents** | Local (parent ↔ child) | Component → Parent (e.g. `save`, `tab-changed`, `toggle-service`) |
| **@lit/context** | Global (app-wide) | Low-frequency UI state: `theme`, `user`, `currentTab`, `connected` |
| **EventBus** | Global (app-wide) | High-frequency SSE streams: `sysinfo-update`, `service-metrics-sse` |

```javascript
// EventBus — subscribe in connectedCallback, unsubscribe in disconnectedCallback
import { EventEmitter } from '../../common.js';

connectedCallback() {
    super.connectedCallback();
    this._handler = (data) => { this.metrics = data; };
    EventEmitter.on('sysinfo-update', this._handler);
}

disconnectedCallback() {
    super.disconnectedCallback();
    EventEmitter.off('sysinfo-update', this._handler);
}
```

---

## Key Utilities

### FetchController (`js/core/FetchController.js`)
Lit Reactive Controller for API data fetching — centralizes loading/error/data states.

```javascript
import { FetchController } from '../../core/FetchController.js';

constructor() {
    super();
    this.cpuFetch = new FetchController(this, {
        url: '/api/performance/cpu',
        autoFetch: true,
        onSuccess: (data) => { this.cpuData = data; }
    });
}

render() {
    if (this.cpuFetch.loading) return html`<ag-skeleton-loader></ag-skeleton-loader>`;
    if (this.cpuFetch.error) return html`<p class="error">${this.cpuFetch.error}</p>`;
    return html`<div>${this.cpuFetch.data.model}</div>`;
}
```

### AgTimerManager (`js/timer.js`)
Centralized timer registry. Automatically throttles to ×3 intervals when the tab is hidden (Visibility API).

### Light DOM (`createRenderRoot`)
All components render into the host element, not a Shadow Root:

```javascript
createRenderRoot() {
    return this; // Light DOM — inherits all global CSS variables
}
```

---

## Vite Build

```javascript
// vite.config.js highlights
build: {
    target: ['chrome90', 'firefox90', 'safari16', 'edge90'],
    sourcemap: 'hidden',     // .map files generated but not referenced in bundle
    rollupOptions: {
        output: {
            manualChunks: { lit: ['lit', 'lit-html', 'lit-element'] }
        }
    }
}
```

- **`sourcemap: 'hidden'`**: source maps exist for debugging but are not exposed to end users.
- **Lit chunk**: stable, separately cached — browser only re-downloads app code on update.

```bash
npm run build -- --mode analyze   # generates stats.html (gitignored)
```

---

**Last updated**: 2026-06-21
