# Contributing to TraceLab

Thanks for helping make local API debugging calmer and safer.

## Development setup

TraceLab requires Node.js 22 or newer and npm 10 or newer.

```bash
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:5173`. The local service listens on `127.0.0.1:4310` by default.

To exercise a local or private target, explicitly set `TRACELAB_ALLOW_PRIVATE_TARGETS=true` in `.env`. Keep the default `false` unless the target is part of your local development workflow.

## Before opening a pull request

Run the same checks used by CI from the repository root:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

The browser test starts a deterministic local target at `127.0.0.1:4320`; it does not call a public API. If Playwright browsers are missing, run `npx playwright install chromium` once.

## Change guidelines

- Keep the browser, local service, and shared contract boundaries clear.
- Treat request and response data as potentially sensitive. Never add real credentials, tokens, cookies, or private URLs to fixtures, logs, screenshots, or documentation.
- Add or update tests for user-visible behavior and security-sensitive boundaries.
- Keep changes focused and explain the reason for behavior changes in the pull request description.
- Prefer accessible labels, keyboard paths, honest empty states, and reduced-motion-friendly UI behavior.
- Update the relevant documentation when commands, defaults, data handling, or limitations change.

## Pull requests

Describe:

1. what changed and why;
2. how a reviewer can try it;
3. which checks you ran;
4. any known limitations or follow-up work.

Small, reviewable pull requests are easier to validate against TraceLab's security model.
