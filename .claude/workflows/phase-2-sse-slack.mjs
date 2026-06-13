export const meta = {
  name: 'phase-2-sse-slack',
  description: 'Build Dashy.ai Phase 2: SSE live updates + Slack alerts, against the locked ARCHITECTURE.md §4 design',
  phases: [
    { title: 'Build', detail: 'parallel disjoint new-file units: SSE api core, Slack engine, Slack config route', model: 'opus' },
    { title: 'Integrate', detail: 'wire shared files: normalize, queues, workers, server, index', model: 'opus' },
    { title: 'Web', detail: 'SSE live hook + Slack settings UI', model: 'opus' },
    { title: 'Verify', detail: 'adversarial gate + contract check + unit tests + fixes', model: 'opus' },
  ],
};

// ---------------------------------------------------------------------------
// House rules every code agent must obey (match Phase 1 patterns, not aspirational docs).
// ---------------------------------------------------------------------------
const HOUSE_RULES = [
  'HOUSE RULES (Dashy.ai — obey exactly):',
  '- Repo root is the cwd. This is a pnpm + Turborepo monorepo: apps/api (Fastify monolith), apps/web (Next 15), packages/shared (canonical zod schema).',
  '- Match EXISTING code patterns. Read the neighbouring files before writing. In apps/api: raw SQL via query<T>(sql, params) from ../db/pool.js with an explicit WHERE workspace_id = $1. Do NOT introduce Kysely/knex or a db.forWorkspace() wrapper — ARCHITECTURE.md §5.1 describes that as aspirational; it does not exist and you must not build it.',
  '- ESM everywhere: relative imports MUST end in .js (e.g. import { query } from "../db/pool.js"). Use `import type` for type-only imports. TypeScript strict; no `any` without an eslint-disable line that explains why.',
  '- Reuse existing libs: encrypt(str)->Buffer / decrypt(Buffer)->str from ../lib/crypto.js (keyed by ENCRYPTION_KEY — do NOT add a new SLACK_WEBHOOK_ENC_KEY env var); newId("wh"|"rule") from ../lib/ids.js; getSession(req)->{userId,workspaceId} from ../session.js; the shared BullMQ `connection` + Queue pattern from ../jobs/queues.js.',
  '- The canonical event wire shape and ActivityEvent type live in @dashy/shared (packages/shared/src/events.ts). Import it; never redefine it locally.',
  '- The database schema ALREADY EXISTS in apps/api/migrations (003_ingestion.sql = events/sources; 007_slack.sql = slack_webhooks/slack_alert_rules/slack_alert_queue/slack_deliveries). Do NOT write or edit migrations. Read 007_slack.sql for exact column names/types. slack_webhooks.url_encrypted is BYTEA (store the raw Buffer from encrypt(); node-pg maps Buffer->bytea). slack_alert_queue.id is BIGSERIAL (do not supply it).',
  '- Secrets: Slack webhook URLs are AES-256-GCM encrypted at rest and returned MASKED only (e.g. https://hooks.slack.com/services/T0.../•••). Outbound Slack POSTs are host-allowlisted to hooks.slack.com.',
  '- Store METADATA only — never code content or diffs.',
  '- Do NOT git commit, push, or change branches. Do NOT edit files outside your assigned set. Leave the working tree compiling.',
].join('\n');

// ---------------------------------------------------------------------------
// Integration contract — the seams I (orchestrator) pin so the parallel units fit
// together. Build agents implement these exact module exports; the Integrate agent
// wires them. ARCHITECTURE.md §4 is the behavioural spec.
// ---------------------------------------------------------------------------
const CONTRACT = [
  'INTEGRATION CONTRACT — implement these module exports VERBATIM (names + signatures). ARCHITECTURE.md §4 is the behavioural spec; read it.',
  '',
  'SSE unit (apps/api/src/realtime/ + one route):',
  '  realtime/publish.ts  -> export async function publishAgentEvent(eventId: string): Promise<void>',
  '      // PUBLISH "agent_events" <eventId> on a DEDICATED ioredis connection (new Redis(config.REDIS_URL)); do not reuse the BullMQ connection.',
  '  realtime/serialize.ts -> export function rowToActivityEvent(row): ActivityEvent',
  '      // mirror apps/api/src/http/routes/feed.ts toEvent(): same columns, same activityEventSchema.parse() validation.',
  '  realtime/hub.ts      -> SSEConnection interface; addConnection(workspaceId: string, raw: NodeJS.WritableStream, lastEventId: string | null): SSEConnection; removeConnection(conn): void; pushToWorkspace(workspaceId: string, ev: ActivityEvent): void; connectionCount(): number',
  '      // in-process Map<workspaceId, Set<SSEConnection>>; 25s ": ping" heartbeat per connection; remove a connection whose write throws. SSE frame: "id: <id>\\nevent: activity\\ndata: <json>\\n\\n".',
  '  realtime/subscriber.ts -> export async function startAgentEventsSubscriber(): Promise<void>',
  '      // dedicated ioredis subscriber SUBSCRIBE "agent_events"; on message=eventId: SELECT the event row (LEFT JOIN agents for slug, exactly like feed.ts) by id, rowToActivityEvent, pushToWorkspace(row.workspace_id, ev). LRU-dedupe the last 1000 event ids so double delivery pushes once.',
  '  http/routes/stream.ts -> default Fastify plugin exposing GET /stream (mounts under /api/v1 -> /api/v1/stream).',
  '      // auth via getSession (401 if none). Use reply.hijack() then write SSE headers on reply.raw (Content-Type text/event-stream, Cache-Control no-cache, Connection keep-alive, X-Accel-Buffering no). Read Last-Event-ID header: replay SELECT * FROM events WHERE workspace_id=$1 AND id > $2 ORDER BY id ASC LIMIT 1000 (ULIDs sort by time); if a full 1000 rows come back, instead emit a single "event: resync" frame. addConnection; on reply.raw socket close -> removeConnection.',
  '',
  'Slack engine unit (apps/api/src/notifications/slack/):',
  '  slack/rules.ts   -> export async function evaluateSlackRules(input: { workspaceId: string; eventId: string; action_type: string; actor_kind: string; repo: string | null; payload_ref: Record<string, unknown> | null }): Promise<void>',
  '      // FR-4 mapping: action_type==="pr_merged" AND payload_ref.base_branch===payload_ref.default_branch AND actor_kind==="agent" -> "protected_branch_merge"; action_type==="devin_task_failed" -> "agent_run_failed"; else return. Resolve workspace_repos.id from events.repo (owner/name) via full_name. SELECT enabled slack_alert_rules for the workspace whose event_types @> the mapped type AND (repo_id IS NULL OR repo_id = the resolved repo). For each match INSERT slack_alert_queue (rule_id, webhook_id, event_id, status "pending", next_attempt_at now()). Never throw out to the caller — try/catch + log.',
  '  slack/client.ts  -> export async function postToSlack(webhookUrl: string, body: unknown): Promise<{ status: number }>',
  '      // parse the URL; throw if host !== "hooks.slack.com"; fetch POST JSON with a 5s AbortController timeout.',
  '  slack/blockkit.ts-> export function renderAlertBlocks(ev): { blocks: unknown[] }; export function renderDigestBlocks(summary): { blocks: unknown[] }',
  '  slack/delivery.ts-> export async function drainSlackQueue(): Promise<void>',
  '      // §4.4: claim due rows (status in pending/digesting, next_attempt_at<=now) with SELECT ... FOR UPDATE SKIP LOCKED LIMIT 50, joined to slack_webhooks (url_encrypted, status) + events (stored_at, payload). Digest collapse (FR-8): count slack_deliveries in the last 5 min for (rule_id, webhook_id); alerts 1-5 deliver individually, from #6 stamp digest_group and hold; flush one digest per (rule_id,webhook_id) window at close. Deliver: decrypt url, renderAlertBlocks, postToSlack. 2xx -> status "delivered" + INSERT slack_deliveries(status "delivered", slack_status_code, latency_ms = now()-events.stored_at). non-2xx -> attempts+1, next_attempt_at += 30s/2m/8m by attempt; after 3rd failure mark queue "failed", flip slack_webhooks.status "failing", INSERT slack_deliveries failed. Rows older than 30 min -> "expired". Wrap each row so one bad row cannot abort the drain.',
  '',
  'Slack config route unit:',
  '  http/routes/slack.ts -> default Fastify plugin, all routes session-scoped to workspaceId (match routes/repos.ts; getSession; 401 if none):',
  '      GET    /integrations/slack            -> { webhooks: [{id,name,url_masked,status,last_delivery_at}], rules: [...] }',
  '      POST   /integrations/slack            -> body {name,url}; reject if URL host !== hooks.slack.com (400); encrypt url -> url_encrypted (Buffer), compute url_masked; INSERT slack_webhooks (newId("wh")); return masked row.',
  '      DELETE /integrations/slack/:id        -> delete webhook scoped to workspace.',
  '      POST   /integrations/slack/test       -> body {webhookId}; decrypt + postToSlack a "Dashy.ai test alert" message; return { status }.',
  '      POST   /integrations/slack/rules      -> body {webhookId, repoId|null, eventTypes:string[]}; INSERT slack_alert_rules (newId("rule")).',
  '      DELETE /integrations/slack/rules/:id  -> delete rule scoped to workspace.',
  '',
  'Shared-file edits are RESERVED for the Integrate agent — build agents must NOT touch these:',
  '  ingestion/normalize.ts, jobs/queues.ts, jobs/workers.ts, http/server.ts, index.ts.',
].join('\n');

const READ_FIRST = 'Before writing, READ these for patterns: docs/ARCHITECTURE.md (sections 2, 3, 4), apps/api/migrations/003_ingestion.sql, apps/api/migrations/007_slack.sql, apps/api/src/http/routes/feed.ts, apps/api/src/http/routes/repos.ts, apps/api/src/http/session.ts, apps/api/src/lib/crypto.ts, apps/api/src/lib/ids.ts, apps/api/src/jobs/queues.ts, apps/api/src/ingestion/normalize.ts, packages/shared/src/events.ts.';

const UNIT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['filesCreated', 'exports', 'typecheck', 'notes'],
  properties: {
    filesCreated: { type: 'array', items: { type: 'string' } },
    exports: { type: 'array', items: { type: 'string' }, description: 'exported symbols provided, matching the contract' },
    typecheck: { type: 'string', description: 'result of `pnpm --filter @dashy/api typecheck` after your changes' },
    notes: { type: 'string', description: 'deviations, assumptions, or follow-ups for the integrator' },
  },
};

// ===========================================================================
// Phase 1 — Build (parallel, disjoint NEW files only)
// ===========================================================================
phase('Build');

const build = await parallel([
  () => agent(
    [
      'You are building the SSE LIVE-UPDATES unit of Dashy.ai (apps/api). Create ONLY these new files and nothing else: apps/api/src/realtime/publish.ts, apps/api/src/realtime/serialize.ts, apps/api/src/realtime/hub.ts, apps/api/src/realtime/subscriber.ts, apps/api/src/http/routes/stream.ts.',
      READ_FIRST,
      '',
      CONTRACT,
      '',
      HOUSE_RULES,
      '',
      'When done, run `pnpm --filter @dashy/api typecheck` and confirm your files are clean (the route/subscriber will only be WIRED by the integrator, so unused-export lint is fine). Do not edit any existing file. Return the structured result.',
    ].join('\n'),
    { label: 'build:sse-api', phase: 'Build', model: 'opus', agentType: 'general-purpose', schema: UNIT_SCHEMA },
  ),
  () => agent(
    [
      'You are building the SLACK NOTIFICATION ENGINE unit of Dashy.ai (apps/api). Create ONLY these new files and nothing else: apps/api/src/notifications/slack/rules.ts, apps/api/src/notifications/slack/client.ts, apps/api/src/notifications/slack/blockkit.ts, apps/api/src/notifications/slack/delivery.ts.',
      READ_FIRST,
      '',
      CONTRACT,
      '',
      HOUSE_RULES,
      '',
      'Note: in v0.1 (GitHub-only) the live rule is protected_branch_merge; agent_run_failed wiring must exist but only fires once the Devin adapter lands in v0.2 — implement both. When done, run `pnpm --filter @dashy/api typecheck`. Do not edit any existing file. Return the structured result.',
    ].join('\n'),
    { label: 'build:slack-engine', phase: 'Build', model: 'opus', agentType: 'general-purpose', schema: UNIT_SCHEMA },
  ),
  () => agent(
    [
      'You are building the SLACK CONFIG API unit of Dashy.ai (apps/api). Create ONLY this new file and nothing else: apps/api/src/http/routes/slack.ts (a default-export Fastify plugin). It depends on apps/api/src/notifications/slack/client.ts (postToSlack) which a sibling agent is creating in parallel — import it as ../../notifications/slack/client.js per the contract; if it does not exist yet at typecheck time, that is expected and the integrator/verify pass will confirm.',
      READ_FIRST,
      '',
      CONTRACT,
      '',
      HOUSE_RULES,
      '',
      'Mirror apps/api/src/http/routes/repos.ts exactly for structure, session handling, and SQL style. Implement URL masking that keeps the scheme+host and the first path token, masking the rest. Return the structured result.',
    ].join('\n'),
    { label: 'build:slack-route', phase: 'Build', model: 'opus', agentType: 'general-purpose', schema: UNIT_SCHEMA },
  ),
]);

log('Build wave complete: ' + build.filter(Boolean).map((b) => (b.filesCreated || []).length + ' files').join(', '));

// ===========================================================================
// Phase 2 — Integrate (single agent; owns the shared files)
// ===========================================================================
phase('Integrate');

const integrate = await agent(
  [
    'You are the INTEGRATOR for Dashy.ai Phase 2. The SSE and Slack units have been created as new files. Your job is to wire them into the shared files — and you are the ONLY agent allowed to edit these: apps/api/src/ingestion/normalize.ts, apps/api/src/jobs/queues.ts, apps/api/src/jobs/workers.ts, apps/api/src/http/server.ts, apps/api/src/index.ts.',
    '',
    'Read the new files first to confirm their exact exports, then make these wirings:',
    '1. normalize.ts: change the events INSERT to add `RETURNING id` and capture the result. ONLY when a row was actually inserted (not an ON CONFLICT no-op) do the post-commit fan-out: `await publishAgentEvent(eventId)` (from ../realtime/publish.js) and `await evaluateSlackRules({ workspaceId, eventId, action_type: mapped.action_type, actor_kind, repo: mapped.repo, payload_ref: mapped.payload_ref })` (from ../notifications/slack/rules.js). Wrap the fan-out in try/catch that logs and swallows — a Slack/Redis hiccup must not fail (and thus retry/duplicate) the normalize job.',
    '2. queues.ts: add and export a `slackDrainQueue` (BullMQ Queue named "slack-drain") on the shared connection.',
    '3. workers.ts: keep the normalize worker; add a Worker("slack-drain", async () => { await drainSlackQueue(); }, { connection }) (drainSlackQueue from ../notifications/slack/delivery.js); and register the repeatable schedule via slackDrainQueue.add("drain", {}, { repeat: { every: 10000 }, jobId: "slack-drain", removeOnComplete: true, removeOnFail: 100 }). Update the file header comment to reflect what now runs.',
    '4. index.ts: after startWorkers(), `await startAgentEventsSubscriber()` (from ./realtime/subscriber.js) so the SSE hub receives fan-out in the same process.',
    '5. server.ts: register the stream and slack route plugins under the /api/v1 prefix (same pattern as the existing route registrations).',
    '',
    'Integration summaries from the build agents (for exact export names):',
    build.filter(Boolean).map((b, i) => `UNIT ${i + 1}: files=${JSON.stringify(b.filesCreated)} exports=${JSON.stringify(b.exports)} notes=${b.notes}`).join('\n'),
    '',
    HOUSE_RULES,
    '',
    'After wiring, run `pnpm --filter @dashy/api typecheck` and `pnpm --filter @dashy/api lint` and fix anything in the files you own (or the new files, if a small import/signature fix is needed to make them fit). Report exactly what you changed and the final typecheck/lint status.',
  ].join('\n'),
  { label: 'integrate:api', phase: 'Integrate', model: 'opus', agentType: 'general-purpose' },
);

// ===========================================================================
// Phase 3 — Web (single agent; owns all web edits to avoid page.tsx contention)
// ===========================================================================
phase('Web');

const web = await agent(
  [
    'You are building the Phase 2 WEB surface for Dashy.ai (apps/web, Next.js 15 App Router). You own ALL web edits. Deliver two things, matching ARCHITECTURE.md §4.3 and the existing UI style (read apps/web/src/app/page.tsx, apps/web/src/lib/api.ts, apps/web/src/app/globals.css, apps/web/src/components/ActivityCard.tsx first).',
    '',
    'A. SSE LIVE FEED:',
    '  - New hook apps/web/src/lib/useEventStream.ts: opens new EventSource(`${API}/api/v1/stream`, { withCredentials: true }); listens for the "activity" event; parses event.data as an ActivityEvent (@dashy/shared) and invokes an onEvent callback; exposes a status ("live" | "reconnecting" | "polling"). Native EventSource auto-reconnects and auto-sends Last-Event-ID; after 5 consecutive errors fall back to a 60s poll of getFeed() and keep a low-frequency probe to recover. Clean up on unmount.',
    '  - Wire it into page.tsx: when signed in, prepend newly-streamed events into state deduped by id (newest first), increment the summary live, and render a small status pill ("● Live" / "Reconnecting…") near the page title using existing className idioms.',
    '',
    'B. SLACK SETTINGS:',
    '  - Extend apps/web/src/lib/api.ts with typed helpers: listSlack(), addSlackWebhook(name,url), testSlackWebhook(webhookId), deleteSlackWebhook(id), addSlackRule({webhookId,repoId,eventTypes}). They call /api/v1/integrations/slack* with credentials:"include", mirroring the existing helpers.',
    '  - New component apps/web/src/components/SlackSettings.tsx: lists connected Slack webhooks (showing the MASKED url + status), a form to add a webhook URL (https://hooks.slack.com/...), a "Send test" button per webhook, and a simple toggle to enable the "Alert on protected-branch merges" rule. Render it on the dashboard below RepoConnect.',
    '',
    HOUSE_RULES,
    '',
    'Do NOT touch apps/api. When done, run `pnpm --filter @dashy/web typecheck`, `pnpm --filter @dashy/web lint`, and `pnpm --filter @dashy/web build`; fix until clean. Report the files changed and final status.',
  ].join('\n'),
  { label: 'web:sse-slack', phase: 'Web', model: 'opus', agentType: 'general-purpose' },
);

// ===========================================================================
// Phase 4 — Verify (adversarial critic: gate + contract + tests + fixes)
// ===========================================================================
phase('Verify');

const VERIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['gateGreen', 'commands', 'contractChecks', 'testsAdded', 'issuesFixed', 'remainingRisks'],
  properties: {
    gateGreen: { type: 'boolean', description: 'true only if root pnpm typecheck && lint && test && build all pass' },
    commands: { type: 'array', items: { type: 'string' }, description: 'gate commands run and their pass/fail' },
    contractChecks: { type: 'array', items: { type: 'string' }, description: 'each §4 behaviour checked, with verdict' },
    testsAdded: { type: 'array', items: { type: 'string' } },
    issuesFixed: { type: 'array', items: { type: 'string' } },
    remainingRisks: { type: 'array', items: { type: 'string' } },
  },
};

const verify = await agent(
  [
    'You are the adversarial VERIFIER for Dashy.ai Phase 2 (SSE live updates + Slack alerts). The feature has just been implemented across apps/api and apps/web. Be skeptical: find what is wrong or missing, fix it, and prove the gate is green.',
    '',
    'Step 1 — Gate. From the repo root run, in order: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`. Fix every failure (in whichever file is at fault). Re-run until all four pass.',
    '',
    'Step 2 — Contract/behaviour audit against docs/ARCHITECTURE.md §4. Verify and fix as needed: (a) normalize.ts publishes to "agent_events" and calls evaluateSlackRules ONLY on a real insert (RETURNING id), inside a swallow-and-log try/catch; (b) the SSE route sets text/event-stream, emits frames as `id:`/`event: activity`/`data:`, sends a 25s heartbeat, and does Last-Event-ID replay with a resync fallback at >1000; (c) SSE + Slack are workspace-scoped (no cross-tenant leakage — the subscriber pushes only to the event row\'s workspace_id); (d) Slack rule mapping matches FR-4 (protected_branch_merge / agent_run_failed); (e) outbound Slack POST is allowlisted to hooks.slack.com; (f) Slack webhook URLs are encrypted at rest and only ever returned masked; (g) delivery logs slack_deliveries with latency_ms and honours the retry/expire schedule; (h) the 10s slack-drain repeatable job and the agent_events subscriber are both wired into the single process.',
    '',
    'Step 3 — Add focused UNIT tests (Vitest, no DB needed) under apps/api/test/ for the pure logic: Slack rule mapping (protected_branch_merge match, agent_run_failed match, non-default-branch no-match, human-actor no-match), Slack URL masking, the SSE activity frame serializer, and Block Kit render shape. Keep them deterministic and fast. Re-run `pnpm test` — must stay green.',
    '',
    HOUSE_RULES,
    '',
    'Return the structured verdict. gateGreen must be true; if you cannot make it true, set it false and list precisely why in remainingRisks.',
  ].join('\n'),
  { label: 'verify:gate', phase: 'Verify', model: 'opus', agentType: 'general-purpose', schema: VERIFY_SCHEMA },
);

return {
  build: build.filter(Boolean).map((b) => ({ files: b.filesCreated, typecheck: b.typecheck, notes: b.notes })),
  integrate,
  web,
  verify,
};
