# TraceLab

<p align="center">
  <img src="./docs/assets/tracelab-mark.svg" alt="TraceLab — local-first API debugging workbench" width="720" />
</p>

<p align="center">
  <strong>API debugging without the cloud.</strong><br />
  Compose, execute, inspect, save, and replay HTTP requests from a focused local workbench.
</p>

<p align="center">
  <a href="./docs/architecture.md">Architecture</a> ·
  <a href="./docs/security-model.md">Security model</a> ·
  <a href="./CONTRIBUTING.md">Contributing</a> ·
  <a href="./LICENSE">MIT license</a>
</p>

> **Status:** early `0.1.x` release. TraceLab is intentionally local, single-user, and transparent about its safety boundaries.

TraceLab is a local-first API debugging workbench for developers who want a calm place to understand every request. It works without an account, analytics service, paid API, cloud database, or external proxy.

## Why TraceLab?

- **Real responses, not demo data.** Status, headers, timing, size, redirects, content type, and body come from the target server.
- **Local by default.** The browser talks to a loopback-only service that owns network execution and persistence.
- **Safe enough to inspect.** Destinations, headers, redirects, timeouts, body sizes, and history redaction are enforced in one place.
- **Portable workspaces.** Save requests and environments locally, then export a versioned TraceLab JSON bundle without secrets by default.

## What it can do

### Compose requests

- `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, and `OPTIONS`.
- Repeated, enabled/disabled query parameters and headers.
- No auth, bearer, basic, or API-key auth in headers or query parameters.
- JSON, raw text, and URL-encoded form bodies.
- `{{variableName}}` interpolation across URLs, params, headers, auth, and bodies.
- Clear missing-variable validation before a network request is attempted.

### Inspect responses

- Pretty JSON tree view and raw response view.
- Status, status text, headers, body, byte count, duration, redirects, and content type.
- Search, copy, and safe downloads for text and binary responses.
- Honest handling for empty, malformed JSON, text, HTML, and binary responses.

### Keep useful state

- SQLite-backed collections, saved requests, named environments, and bounded history.
- Save, update, duplicate, delete, rename, filter, replay, import, and export.
- Sanitized history that excludes resolved auth values, passwords, cookies, API keys, sensitive bodies, and response bodies.

## Architecture

```text
apps/web        React + Vite + TypeScript workbench
apps/server     Fastify local service + native Node HTTP transport + SQLite
packages/shared Shared Zod contracts, interpolation, URL, and redaction utilities
scripts/        Deterministic local targets used by browser tests
```

All arbitrary HTTP traffic runs through `apps/server`. The browser is not a general-purpose proxy and does not depend on target CORS headers. Read the [architecture notes](./docs/architecture.md) for the request lifecycle.

## Quick start

### Requirements

- Node.js 22 or newer. Node.js 24 is also supported.
- npm 10 or newer.

### Install and run

```bash
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:5173`. The local service binds to `127.0.0.1:4310` by default.

For local API testing, explicitly opt in from `.env`:

```dotenv
TRACELAB_ALLOW_PRIVATE_TARGETS=true
```

This permits loopback and private-network targets for development-only testing. Cloud metadata, link-local, multicast, unspecified, broadcast, and reserved destinations remain blocked. Leave the setting `false` unless local/private targets are required.

## Verify the project

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

The Playwright workflow uses a deterministic local target at `127.0.0.1:4320`; it never calls a third-party public API. If the browser is missing in a fresh environment:

```bash
npx playwright install chromium
```

## Security model

TraceLab is a local developer tool, not a hardened public proxy. The service binds to loopback by default, state-changing routes use a per-process request token, and arbitrary targets pass through validation, DNS checks, redirect limits, timeout limits, and response-size limits before the response reaches the UI.

History is sanitized by design. Resolved auth values, passwords, cookies, API keys, sensitive bodies, and response bodies are not retained. Masking is not encryption, and the local SQLite database is plaintext unless the host filesystem provides encryption.

Read the full [security model](./docs/security-model.md) before opting into private targets or designing an integration around TraceLab.

## Local data and reset

The default database is `.data/tracelab.sqlite`. SQLite WAL, shared-memory, journal, build, test, and environment files are ignored by Git.

To reset TraceLab, stop the development service and remove only these files:

```bash
rm -f .data/tracelab.sqlite .data/tracelab.sqlite-wal .data/tracelab.sqlite-shm .data/tracelab.sqlite-journal
```

Do not use a broad filesystem deletion command. The `Local` environment is recreated automatically on the next server start. For backup, stop the service and copy the database or use the built-in JSON export.

## Import and export

TraceLab uses a versioned JSON format for saved collections and non-local environments. Export omits request auth, request body values, and sensitive environment values by default. Import validates the complete file, previews the changes, suffixes colliding environment names, and never executes imported requests automatically.

This is not Postman compatibility. Postman import is not implemented or advertised.

## Current boundaries

Supported today: JSON, raw text, and URL-encoded bodies; basic, bearer, and API-key auth; HTTP/1.1 execution; bounded response capture; and replay for saved requests.

Not included yet: multipart file uploads, WebSockets, HTTP/2/3, OAuth refresh flows, cookie jars, proxies/PAC, client certificates, accounts, multi-user isolation, or encrypted storage.

## Manual smoke check

The response panel stays empty until a real request runs. For a quick end-to-end check:

1. Start TraceLab with `TRACELAB_ALLOW_PRIVATE_TARGETS=true` for a local test target.
2. Enter a local URL and send a request.
3. Confirm the actual status, headers, duration, size, and body appear.
4. Save the request, restart the app, and load it from the collection.
5. Open History and replay the saved request.
6. Confirm history does not contain a bearer token or sensitive environment value.

## Roadmap

Folder organization, richer response search/download polish, resizable panels, multipart requests, GraphQL, OpenAPI import, request comparison, and optional OS-keychain-backed secret storage.

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md) for setup, checks, and the project's privacy expectations. Security reports belong in the workflow described by [SECURITY.md](./SECURITY.md).

## License

MIT. See [LICENSE](./LICENSE).
