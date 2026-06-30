# Audiogravi<sup>ty</sup> UI — Install & Dev

Production deployment is handled by the **release package**, not a manual installer.
This doc covers (1) where deployment lives and (2) local development.

## Deployment

The UI ships as a versioned tarball built and published by the release
tooling — there is **no interactive installer in the repo**.

- **Build & publish:** managed by `audiogravity.ops` via `./release.sh frontend`.
  The package contains its own non-interactive `install.sh` that deploys the static
  assets + the `serve_https.py` proxy under a systemd service, and injects
  `window.AG_CONFIG` (API URL + key).
- **End-user install** (one-liner from the release):
  ```bash
  curl -fsSL https://github.com/audiogravity/audiogravity-releases/releases/latest/download/install-frontend.sh | sudo bash
  ```

## Development (Vite dev server)

Hot-module reload + a built-in proxy to the core.

```
Browser ──► Vite dev server (:3000)
              ├── /api/* ─► core (:8000)
              └── /sse/* ─► core (:8000, SSE)
```

**Prerequisites:** Node.js 18+, `npm install`, and the core running on `:8000`.

**Start:**
```bash
./dev.sh start                  # sets CORE_PORT / HTTPS, tails logs
# or directly:
npm run dev
```
Serves on **:3000**, bound to `0.0.0.0` (reachable on the LAN). `/api` and `/sse`
are proxied to the core (`CORE_PORT`, default 8000) — see `vite.config.js`.

> **AG_CONFIG in dev:** `window.AG_CONFIG` comes from `public/ag-config.js` (a dev
> key). In production it is injected by the package installer. Never commit a
> production key.

### Storybook (component dev)

```bash
npm run storybook                # http://localhost:6006
npm run build-storybook          # static build
npx vitest --project storybook   # component tests (Chromium via Playwright)
```

## PWA / HTTPS

The PWA requires HTTPS. The package's `serve_https.py` serves a self-signed cert;
trust it on iOS to enable "Add to Home Screen". The dev server can also run over
HTTPS with `VITE_HTTPS=true`.
