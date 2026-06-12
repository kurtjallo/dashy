# Dashy.ai — agent guide

Overnight activity dashboard for AI coding agents (B2B SaaS). One dashboard aggregating GitHub
activity from Claude Code, Cursor, Devin, and Copilot, with agent attribution and Slack alerts.

## Repo map

- `apps/web` — Next.js 15 dashboard (Vercel). `apps/api` — Node monolith: Fastify API + webhook
  listener + BullMQ workers + SSE hub, deployed to Railway via `apps/api/Dockerfile`.
- `packages/shared` — **canonical event schema and agent slugs (zod). Single source of truth;
  never redefine these types locally in api or web.** If the event shape changes, update
  `packages/shared/src/events.ts` AND `docs/ARCHITECTURE.md` §2 together.
- `docs/` — PRD.md (what/why), FEATURE-SPECS.md (feature contracts), ARCHITECTURE.md (how;
  ADR-001..007 record the locked decisions — read before structural changes, don't relitigate).

## Run it locally (first-time setup)

```sh
docker compose up -d              # start postgres + redis
cp .env.example .env              # local env (api loads the repo-root .env)
pnpm --filter @dashy/api migrate  # apply the database schema
pnpm dev                          # start both servers
```

- Web dashboard → http://localhost:3000
- API → http://localhost:4000 (health check: http://localhost:4000/health)

## Commands

- `pnpm dev` / `pnpm build` / `pnpm typecheck` / `pnpm lint` / `pnpm test` (Turborepo, all workspaces)
- `docker compose up -d` — local postgres + redis
- `pnpm --filter @dashy/api migrate` / `migrate:create` — node-pg-migrate; never edit applied migrations
- Always verify with the **root** gate (`pnpm lint` / `test` / `build`), never a single-package subset

## Locked decisions (ADRs)

TypeScript strict everywhere. Fastify, BullMQ on Redis (queues + pub/sub fan-out to SSE),
Postgres is the only state of record (Redis is ephemeral). GitHub-only ingestion in v0.1;
Cursor/Devin implement `SourceAdapter` (apps/api/src/ingestion/adapters) in v0.2.
Tenancy: `workspace_id` on every table, app-layer scoping. Agent slugs: `claude-code`,
`cursor`, `devin`, `copilot`, `custom:<name>`. REST under `/api/v1`, cursor pagination.

## Conventions

- Conventional Commits. Industry-standard/boring choices by default; flag deviations explicitly.
- New env vars go in `.env.example` AND `apps/api/src/config/env.ts` (zod schema) together.
- Store code METADATA only — never code content or diffs (see ARCHITECTURE.md §5).
- Performance targets: dashboard <2s, event-to-stored <60s, Slack alert <2min.
