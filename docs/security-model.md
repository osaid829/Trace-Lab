# Security model

TraceLab is a local developer tool, not a hardened public proxy. Its safety controls are defense-in-depth for a desktop or single-user development workflow.

## Defaults that reduce exposure

- The service binds to `127.0.0.1` by default.
- State-changing `/api/*` requests require a per-process `x-tracelab-token` and an allowed local origin.
- Only `http:` and `https:` URLs are accepted. URL credentials are rejected.
- Request and response sizes, redirect hops, and execution time are bounded.
- Loopback and private-network targets are blocked by default.
- Imported requests are previewed and validated; they are never executed automatically.

## Network execution controls

- Header names and values are validated.
- Hop-by-hop and transport-managed headers are rejected.
- Hostnames are resolved before connection and every resolved address is checked.
- The request uses a pinned lookup for the validated hop.
- Redirects are manual, bounded, and validated again on every hop.
- Authorization-related headers are removed when a redirect crosses origins.
- Cloud metadata, link-local, multicast, unspecified, broadcast, and reserved destinations remain blocked even when private-target development mode is enabled.

## Data handling

- History keeps sanitized request snapshots and execution metadata only.
- Resolved auth values, passwords, cookies, API keys, sensitive bodies, and response bodies are not retained in history.
- Sensitive environment values are masked in the UI, but masking is not encryption.
- SQLite is local plaintext storage unless the host filesystem provides encryption.
- Export omits sensitive environment values by default and marks whether a bundle includes secrets.

## Opting into private targets

For local integration testing, set:

```dotenv
TRACELAB_ALLOW_PRIVATE_TARGETS=true
```

This is a development-only opt-in. It allows loopback and private-network targets but does not turn TraceLab into a safe service for LAN exposure. Do not bind the service to a non-loopback interface without designing and reviewing a separate deployment configuration.

## Limits and responsible use

DNS behavior, proxies, VPNs, network namespaces, operating-system behavior, and future dependency changes can prevent absolute guarantees. TraceLab intentionally uses fresh non-pooled HTTP connections and a bounded redirect policy, but users should still treat the app and its database as local developer tooling.

If you find a security issue, follow the private disclosure guidance in [SECURITY.md](../SECURITY.md) and do not include secrets or exploit details in a public issue.
