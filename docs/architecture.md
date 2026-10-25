# Architecture

TraceLab is a small monorepo with a deliberately narrow boundary between the browser and the network.

```text
apps/web       React + Vite workbench
apps/server    Fastify local execution and persistence service
packages/shared Zod contracts, interpolation, URL, and redaction utilities
scripts/       deterministic local targets used by browser tests
```

## Runtime boundaries

- `apps/web` owns request composition, response presentation, collections, environments, and keyboard-friendly workbench state.
- `apps/server` owns arbitrary HTTP execution, DNS resolution, redirect policy, CSRF checks, SQLite persistence, and history sanitization.
- `packages/shared` is the contract layer shared by the browser and server. It keeps request shapes, response shapes, import/export files, and redaction behavior in one place.
- The browser calls the local service through same-origin `/api/*` routes. It is not a general-purpose cross-origin proxy.

## Request lifecycle

1. The workbench builds a typed `RequestDefinition` from the method, URL, parameters, headers, auth, body, and timeout controls.
2. The local service validates the request and resolves environment variables before a network connection is opened.
3. Destination hostnames are resolved and checked against the configured target policy. The connection uses a pinned lookup for that hop.
4. The native Node HTTP transport follows a bounded, manually validated redirect policy and captures the real response.
5. The service returns status, headers, body metadata, timing, redirect count, and any explicit execution outcome.
6. The history record stores a sanitized request snapshot and metadata, never the resolved auth material or response body.

## Persistence

SQLite stores collections, saved requests, environments, and bounded history. The default database lives in `.data/tracelab.sqlite`, which is intentionally ignored by Git. The built-in JSON export is the portable backup format.

## Why a local service?

Keeping execution in a loopback-only service avoids browser CORS limitations while making the security boundary explicit. It also gives TraceLab one place to enforce request limits, timeout behavior, redirect rules, and redaction instead of duplicating those concerns across UI components.

See the [security model](./security-model.md) for the threat model and the limits of the safety controls.
