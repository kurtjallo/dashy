# Security Policy

## Reporting a vulnerability

Email **kurtjallorina4@gmail.com** with details (affected component, reproduction steps, impact).
You will receive an acknowledgment within 48 hours. Please do not open public issues for
security reports and allow reasonable time for a fix before any disclosure.

## Scope notes

Dashy.ai stores repository **metadata only** (PR titles, commit messages, actor identities,
timestamps) — never source code content or diffs. Third-party tokens are encrypted at rest
(AES-256-GCM). See `docs/ARCHITECTURE.md` §5 for the full security architecture.
