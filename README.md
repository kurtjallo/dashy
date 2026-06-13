# Dashy.ai

See what your AI coding agents shipped overnight — one dashboard aggregating GitHub activity
from Claude Code, Cursor, Devin, and Copilot, with agent attribution and Slack alerts.

## Repository layout

```
apps/
  web/        Next.js dashboard (Vercel)
  api/        Node monolith: HTTP API + webhook listener + BullMQ workers + SSE hub (Railway, Docker)
packages/
  shared/     Canonical event schema & agent types (zod) — single source of truth for api + web
docs/
  PRD.md             Product requirements
  FEATURE-SPECS.md   Feature-level specifications
  ARCHITECTURE.md    System architecture & ADRs
```

## Getting started

```sh
corepack enable                # pnpm via corepack
pnpm install
cp .env.example .env           # fill in GitHub OAuth credentials
docker compose up -d           # postgres + redis
pnpm --filter @dashy/api migrate
pnpm dev                       # web on :3000, api on :4000
```

## Conventions

- **TypeScript everywhere**, strict mode; shared types come from `@dashy/shared` — never redefine the event shape locally.
- **Conventional Commits** (`feat:`, `fix:`, `chore:` …).
- **Migrations**: numbered, via `node-pg-migrate`; never edit an applied migration.
- **Branching**: short-lived feature branches off `main`; CI must pass before merge.
- Architecture decisions are recorded as ADRs in `docs/ARCHITECTURE.md` — read ADR-001..007 before proposing structural changes.

## Deployment

- `apps/web` → Vercel (auto from `main`)
- `apps/api` → Railway, built from `apps/api/Dockerfile`; Railway Postgres + Railway Redis
