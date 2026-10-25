# Security policy

TraceLab is a local-first HTTP debugging tool. Please treat saved request definitions, environment values, and the local SQLite database as sensitive developer data.

## Reporting a vulnerability

Please use the repository's **Security** tab and private vulnerability reporting when it is available. Do not open a public issue containing credentials, exploit instructions, target URLs, database files, or other sensitive material.

If private reporting is not enabled, open a minimal public issue that only says a security report is needed and ask the maintainers for a private channel. Do not attach proof-of-concept payloads until a private channel is available.

Include, when safe:

- a short description of the impact;
- the affected version or commit;
- a minimal reproduction that does not contain secrets;
- the environment and configuration needed to reproduce it;
- any mitigation you have already applied.

## Scope notes

- TraceLab is not intended to be exposed as a public proxy or LAN service.
- SSRF protections and redaction are defense-in-depth, not an absolute security guarantee.
- Masked values are not encrypted values.
- Public issues, pull requests, logs, fixtures, and screenshots must not contain real secrets.

## Supported versions

The current `0.1.x` development line is the supported version. Because TraceLab is pre-1.0, security fixes may change behavior or configuration defaults when necessary.
