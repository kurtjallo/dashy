# Contributing

1. Read `docs/ARCHITECTURE.md` (especially the ADRs) before structural changes.
2. Branch from `main`, use Conventional Commits, open a PR — CI (typecheck, lint, test, build, docker) must pass.
3. The canonical event schema lives in `packages/shared/src/events.ts`; change it there and in
   `docs/ARCHITECTURE.md` §2 together, never in one place only.
4. New env vars: add to `.env.example` and the env schema in `apps/api/src/config/env.ts`.
5. Database changes go through `pnpm --filter @dashy/api migrate:create` — never raw schema edits.
