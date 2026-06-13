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
