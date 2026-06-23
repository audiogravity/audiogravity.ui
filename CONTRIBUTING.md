# Contributing to Audiogravi<sup>ty</sup> UI

> **Note — source-available, early access**
>
> Audiogravity UI is published under the MIT licence and you are free to read,
> fork, and adapt the code. However, **we are not accepting pull requests at
> this stage** of the project. If you find a bug or have a suggestion, please
> open an [issue](https://github.com/audiogravity/audiogravity.ui/issues) — we
> read everything.
>
> This policy will be revisited when the project reaches v1.0.

## Prerequisites

- **Node.js** 18+ and **npm**
- A running **Audiogravity backend** (`audiogravity.core`) on port 8000
  — see the backend repo for setup instructions

## Development setup

```bash
git clone https://github.com/audiogravity/audiogravity.ui
cd audiogravity.ui
npm install
npm run dev
```

Vite starts at **http://localhost:3000** and proxies API calls transparently:

| Path prefix | Forwarded to |
|---|---|
| `/api/*` | `http://localhost:8000/*` |
| `/sse/*` | `http://localhost:8000/sse/*` |
| `/sysinfo/terminal/ws` | `ws://localhost:8000` |

### API key

On first launch, a prompt asks for your `API_KEY` (visible in the backend's
`.env` file). The key is stored in `localStorage` — subsequent launches skip
the prompt.

### Custom backend port

```bash
BACKEND_PORT=9000 npm run dev
```

### Build flags

`.env*` files are gitignored. Create a local `.env.production` to set
build-time variables before `npm run build`:

```bash
# .env.production
VITE_BETA=true   # shows a dismissible BETA badge in the built app
```

## Available scripts

| Script | Description |
|---|---|
| `npm run dev` | Dev server with HMR at http://localhost:3000 |
| `npm run build` | Production build → `_site/` |
| `npm test` | Run all Vitest unit tests once |
| `npm run test:watch` | Tests in watch mode |
| `npm run lint:css` | Lint CSS with Stylelint |
| `npm run lint:css:fix` | Auto-fix CSS issues |
| `npm run storybook` | Component workspace at http://localhost:6006 |

## Project structure

```
js/
  components/     Lit Web Components (atoms / molecules / organisms)
  core/           config, event-bus, app-context
  api.js          REST client (fetch wrapper)
  auth.js         JWT session management
  sse.js          SSE client
css/              Modular stylesheets + theme tokens
public/           Static assets (icons, manifest, ag-config.js)
stories/          Storybook stories
```

## API contract

The frontend communicates exclusively with the Audiogravi<sup>ty</sup> backend via REST
and SSE. See [API.md](API.md) for the expected endpoints and authentication
scheme.

## Documentation

| File | Content |
|---|---|
| [docs/JAVASCRIPT.md](docs/JAVASCRIPT.md) | Component architecture, data flow, communication patterns |
| [docs/EVENTS_API.md](docs/EVENTS_API.md) | CustomEvent inventory (stable events) |
| [docs/CSS_ARCHITECTURE.md](docs/CSS_ARCHITECTURE.md) | CSS design system, tokens, naming conventions |
| [API.md](API.md) | Backend API contract (endpoints + SSE events) |

## Code style

- **No comments** unless the *why* is non-obvious
- **No new inline SVGs** — add icons to `js/ag-icons.js` (rule 15). All icons
  are sourced from [Lucide](https://lucide.dev) (ISC licence, listed in
  `../audiogravity.app/THIRD_PARTY_NOTICES.md`). To add a new icon: copy the
  SVG paths from lucide.dev, export a tagged-template constant from `ag-icons.js`
  with a JSDoc comment (`/** Description. (Lucide: icon-name) */`), and import
  it by name where needed.
- CSS changes must pass `npm run lint:css`
- One Lit component per file, Light DOM only

## License

MIT — see [LICENSE](LICENSE)
