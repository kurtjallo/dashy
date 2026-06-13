# Changelog

All notable changes to Dashy.ai are documented here.
Format: [Keep a Changelog](https://keepachangelog.com); versioning: [SemVer](https://semver.org).

## [Unreleased]

### Added
- Initial monorepo scaffold (apps/web, apps/api, packages/shared) with Docker, CI, and docs.
- Database schema: 7 node-pg-migrate migrations for the full v0.1 data model.
- Phase 1 walking skeleton: GitHub OAuth (+ dev-login), repo connect with webhook install,
  signed webhook ingestion, BullMQ normalize worker with agent attribution, keyset-paginated
  feed API, and the web dashboard. Verified end-to-end locally (webhook → store → feed).
- Phase 2 — SSE live updates: `GET /api/v1/stream` (in-process hub over Redis `agent_events`
  pub/sub, 25s heartbeat, `Last-Event-ID` replay with resync fallback); the web feed pushes new
  cards without refresh via `EventSource`, degrading to 60s polling after repeated failures.
- Phase 2 — Slack alerts: FR-4 rule mapping (`protected_branch_merge`, `agent_run_failed`),
  Postgres-backed `slack_alert_queue` drained every 10s (`FOR UPDATE SKIP LOCKED`) with
  >5-in-5-min digest collapse, 30s/2m/8m retries, and `hooks.slack.com`-allowlisted delivery;
  webhook config API + settings UI, URLs AES-256-GCM encrypted at rest and returned masked.
