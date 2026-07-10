# Audiogravi<sup>ty</sup> UI

![Version](https://img.shields.io/badge/version-0.9.12--beta-orange)
![Tests](https://img.shields.io/badge/tests-388%20passing-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
[![Storybook](https://img.shields.io/badge/Storybook-component%20docs-FF4785?logo=storybook&logoColor=white)](https://audiogravity.github.io/audiogravity.ui/)

Web UI for [Audiogravi<sup>ty</sup>](https://audiogravity.app) — an audiophile
audio management application. Built with **Lit 3 Web Components**, **Vite**
and **Vitest**.

Audiogravi<sup>ty</sup> orchestrates MPD, Roon, HQPlayer, AirPlay, UPnP, Tidal and
Qobuz from a single PWA interface. This repo contains the UI only.
The core is required at runtime — see [API.md](API.md) for the contract.

---

## Stack

| Role | Technology |
|---|---|
| Language | Vanilla JS (ES modules, no framework, no TypeScript) |
| Components | [Lit 3](https://lit.dev/) — Web Components, Light DOM |
| Build | [Vite 7](https://vitejs.dev/) |
| Graph | [Cytoscape.js](https://js.cytoscape.org/) + dagre (npm) |
| Config editor | [CodeMirror 5](https://codemirror.net/) (CDN) |
| Charts | [Chart.js 4](https://www.chartjs.org/) (CDN) |
| Tests | [Vitest 4](https://vitest.dev/) |
| Component dev | [Storybook 10](https://storybook.js.org/) |
| CSS linting | [Stylelint 17](https://stylelint.io/) |
| PWA | Service Worker, Web Push, WebAuthn |

---

## Quick start

```bash
git clone https://github.com/audiogravity/audiogravity.ui
cd audiogravity.ui
npm install
./dev.sh start     # Vite at http://localhost:3000
```

A running Audiogravi<sup>ty</sup> core is required on port 8001 (default). On first launch a
prompt asks for the API key (visible in the core `.env` file); it is
stored in `localStorage` for subsequent sessions.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full dev setup and
[API.md](API.md) for the core API contract.

---

## Dev environment

```bash
./dev.sh start         # start Vite
./dev.sh stop          # stop Vite
./dev.sh status        # show running state
./dev.sh logs          # tail Vite log
./dev.sh test          # run unit tests
./dev.sh storybook     # component workspace at http://localhost:6006
./dev.sh help          # full command list
```

> **Note** — The default core port is 8001. Override if needed: `CORE_PORT=8002 ./dev.sh start`

---

## npm scripts

| Command | Description |
|---|---|
| `npm run dev` | Dev server with HMR at http://localhost:3000 |
| `npm run build` | Production build → `_site/` |
| `npm test` | Run all Vitest unit tests |
| `npm run test:watch` | Tests in watch mode |
| `npm run lint:css` | Lint CSS with Stylelint |
| `npm run lint:css:fix` | Auto-fix CSS issues |
| `npm run storybook` | Component workspace at http://localhost:6006 |

---

## Architecture

Lit Web Components organised by Atomic Design:

```
js/components/
  atoms/       Basic UI elements (buttons, badges, indicators)
  molecules/   Composite elements (cards, tiles, modals)
  organisms/   Feature sections (pipeline, library, profiles)
js/core/       Config, event bus, app context, fetch controller
js/api.js      REST client — all core calls go through here
js/sse.js      SSE client — real-time updates from the core
css/           Modular stylesheets with CSS custom property tokens
public/        Static assets, icons, PWA manifest
```

All components use **Light DOM** — no Shadow DOM, no style isolation issues,
fully compatible with global CSS and screen readers.

---

## Testing

```bash
npm test              # 188 unit tests, single run
npm run test:watch    # watch mode
```

Tests cover utility functions, helpers, API routing logic and component
behaviour. Browser-mode tests require Playwright (`npx playwright install`).

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

MIT — see [LICENSE](LICENSE)

© 2026 Audiogravi<sup>ty</sup>
