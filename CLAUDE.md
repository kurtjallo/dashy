# Dashy.ai — agent guide

Overnight activity dashboard for AI coding agents (B2B SaaS). One dashboard aggregating GitHub
activity from Claude Code, Cursor, Devin, and Copilot, with agent attribution and Slack alerts.

## How I work (operating rules)

> **Git approval gate (highest priority): NEVER `git commit`, `git push`, or open a PR
> (`gh pr create`) without Kurt's explicit approval for that specific action.** Do all the
> work — edit, run the gate, stage, draft the commit message and PR body — then STOP and ask.
> Branch creation and local edits are fine without asking. This overrides the "autonomous"
> defaults below: those govern *doing the work*, never *landing it in git*.

### 1. Plan mode default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions).
- If something goes sideways, STOP and re-plan immediately — don't keep pushing.
- Use plan mode for verification steps, not just building.
- Write detailed specs upfront to reduce ambiguity.

### 2. Subagent strategy
- Use subagents liberally to keep the main context window clean.
- Offload research, exploration, and parallel analysis to subagents.
- For complex problems, throw more compute at it via subagents.
- One task per subagent for focused execution.

### 3. Self-improvement loop
- After ANY correction from the user: capture the pattern (memory / `tasks/lessons.md`).
- Write rules for yourself that prevent the same mistake.
- Ruthlessly iterate on these lessons until the mistake rate drops.
- Review lessons at session start for the relevant project.

### 4. Verification before done
- Never mark a task complete without proving it works.
- Diff behavior between main and your changes when relevant.
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness.

### 5. Demand elegance (balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution."
- Skip this for simple, obvious fixes — don't over-engineer.
- Challenge your own work before presenting it.

### 6. Autonomous bug fixing
- When given a bug report: just fix it. Don't ask for hand-holding.
- Point at logs, errors, failing tests — then resolve them.
- Zero context switching required from the user.
- Go fix failing CI tests without being told how. (Still subject to the git approval gate above.)

### Task management
1. **Plan first**: write the plan (`tasks/todo.md`) with checkable items.
2. **Verify plan**: check in before starting implementation.
3. **Track progress**: mark items complete as you go.
4. **Explain changes**: high-level summary at each step.
5. **Document results**: add a review section to `tasks/todo.md`.
6. **Capture lessons**: update `tasks/lessons.md` after corrections.

### Core principles
- **Simplicity first**: make every change as simple as possible; impact minimal code.
- **No laziness**: find root causes, no temporary fixes, senior-developer standards.
- **No Claude co-author**: never add a `Co-Authored-By: Claude` trailer to commits or PRs.
- **Keep docs fresh**: when a change lands, update every affected `.md` in the same pass —
  `CHANGELOG.md` always; plus `README.md`, `docs/ARCHITECTURE.md` (§2 + the schema together if
  the event shape changes), `docs/FEATURE-SPECS.md`, and this file when they drift. Stale docs
  are a bug; never leave context behind the code.

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

- Conventional Commits, but **ask before committing/pushing/PR-ing** (see the git approval gate
  in "How I work"). Industry-standard/boring choices by default; flag deviations explicitly.
- No `Co-Authored-By: Claude` trailer on commits or PRs.
- New env vars go in `.env.example` AND `apps/api/src/config/env.ts` (zod schema) together.
- Store code METADATA only — never code content or diffs (see ARCHITECTURE.md §5).
- Performance targets: dashboard <2s, event-to-stored <60s, Slack alert <2min.
