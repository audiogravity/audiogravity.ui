# Audiogravi<sup>ty</sup> UI

Web frontend for [Audiogravi<sup>ty</sup>](https://audiogravity.app) — an audiophile
audio management application. Built with **Lit 3 Web Components**, **Vite**
and **Vitest**.

Audiogravi<sup>ty</sup> orchestrates MPD, Roon, HQPlayer, AirPlay, UPnP, Tidal and
Qobuz from a single PWA interface. This repo contains the frontend only.
The backend is required at runtime — see [API.md](API.md) for the contract.

---

## Stack

| Role | Technology |
|---|---|
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

A running Audiogravi<sup>ty</sup> backend is required on port 8000. On first launch a
prompt asks for the API key (visible in the backend `.env` file); it is
stored in `localStorage` for subsequent sessions.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full dev setup and
[API.md](API.md) for the backend API contract.

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

Override backend port: `BACKEND_PORT=8001 ./dev.sh start`

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

104 Lit Web Components organised by Atomic Design:

```
js/components/
  atoms/       Basic UI elements (buttons, badges, indicators)
  molecules/   Composite elements (cards, tiles, modals)
  organisms/   Feature sections (pipeline, library, profiles)
js/core/       Config, event bus, app context, fetch controller
js/api.js      REST client — all backend calls go through here
js/sse.js      SSE client — real-time updates from the backend
css/           Modular stylesheets with CSS custom property tokens
public/        Static assets, icons, PWA manifest
```

All components use **Light DOM** — no Shadow DOM, no style isolation issues,
fully compatible with global CSS and screen readers.

---

## Testing

```bash
npm test              # 108 unit tests, single run
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
