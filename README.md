# Audiogravi<sup>ty</sup> UI

![Version](https://img.shields.io/badge/version-1.0.0--rc.1-orange)
![Tests](https://img.shields.io/badge/tests-4005%20passing-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
[![Storybook](https://img.shields.io/badge/Storybook-component%20docs-FF4785?logo=storybook&logoColor=white)](https://audiogravity.github.io/audiogravity.ui/)

Web UI for [Audiogravi<sup>ty</sup>](https://audiogravity.app) — an audiophile
audio management application. Built with **Lit 3 Web Components**, **Vite**
and **Vitest**.

Audiogravi<sup>ty</sup> orchestrates MPD, Roon, HQPlayer, AirPlay, UPnP, internet radio,
Qobuz, Tidal and HIGHRESAUDIO from a single PWA interface. This repo contains the UI only.
The core is required at runtime — see [API.md](API.md) for the contract.

---

## Stack

| Role | Technology |
|---|---|
| Language | Vanilla JS (ES modules, no framework, no TypeScript) |
| Components | [Lit 3](https://lit.dev/) — Web Components, Light DOM, [@lit/context](https://lit.dev/docs/data/context/) for shared state |
| Build | [Vite 7](https://vitejs.dev/) |
| Graph | SVG drawn by Lit components (`ag-audio-pipeline`) — no graph library |
| Config editor | [CodeMirror 5](https://codemirror.net/) (npm, loaded on demand) |
| In-app manual | [marked](https://marked.js.org/) — Markdown rendered client-side, loaded on demand |
| Charts | [Chart.js 4](https://www.chartjs.org/) (npm, with the Performance tab) |
| Terminal | [xterm.js](https://xtermjs.org/) (npm, loaded on demand) |
| Tests | [Vitest 4](https://vitest.dev/) — unit tests in jsdom, Storybook interaction tests in headless Chromium ([Playwright](https://playwright.dev/)) |
| Component dev | [Storybook 10](https://storybook.js.org/) |
| CSS linting | [Stylelint 17](https://stylelint.io/) |
| JS linting | [ESLint 10](https://eslint.org/) — `no-undef` only, deliberately |
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

`./dev.sh start --https` serves Vite over HTTPS with the certificate of an Audiogravi<sup>ty</sup>
UI installed on the same machine (`/var/www/audiogravity-ui/ssl/`) — needed to test on iOS,
which installs no service worker over plain HTTP.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full dev setup and
[API.md](API.md) for the core API contract.

---

## Dev environment

```bash
./dev.sh start         # start Vite (--https for TLS)
./dev.sh stop          # stop Vite
./dev.sh restart       # restart Vite
./dev.sh status        # show running state
./dev.sh logs          # tail Vite log
./dev.sh test          # run unit tests (no browser)
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
| `npm test` | Run every test: unit (jsdom) and Storybook interaction (headless Chromium) |
| `npm run test:watch` | Tests in watch mode |
| `npm run lint` | Lint CSS and JavaScript — run before every commit |
| `npm run lint:css` | Lint CSS with Stylelint |
| `npm run lint:css:fix` | Auto-fix CSS issues |
| `npm run lint:js` | Lint JavaScript with ESLint |
| `npm run storybook` | Component workspace at http://localhost:6006 |

---

## Architecture

Lit Web Components organised by Atomic Design:

```
js/components/
  atoms/       Basic UI elements (buttons, badges, indicators)
  molecules/   Composite elements (cards, tiles, modals)
  organisms/   Feature sections (pipeline, library, profiles)
js/core/       Config, event bus, app context, Lit reactive controllers
js/api.js      REST client — all core calls go through here
js/sse.js      SSE client — real-time updates from the core
css/           Modular stylesheets with CSS custom property tokens
public/        Static assets, icons, PWA manifest
```

Components render in the **Light DOM** — no Shadow DOM, so the global CSS and its
theme tokens reach them — with one exception: `ag-audio-pipeline`, the signal-path
diagram, renders in a shadow root with its own stylesheets.

---

## Testing

```bash
npm test                         # every test, single run
npx vitest run --project unit    # unit tests only, no browser (what the badge counts)
npm run test:watch               # watch mode
```

Tests cover utility functions, helpers, API routing logic and component
behaviour. The Storybook interaction tests run in headless Chromium and need
Playwright's browser (`npx playwright install chromium`).

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

MIT — see [LICENSE](LICENSE)

© 2026 Audiogravi<sup>ty</sup>
