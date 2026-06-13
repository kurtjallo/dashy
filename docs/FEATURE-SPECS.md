# Dashy.ai — MVP Feature Specifications

| | |
|---|---|
| **Product** | Dashy.ai — Overnight activity dashboard for AI coding agents |
| **Owner** | Kurt Jallo |
| **Status** | Draft |
| **Last Updated** | 2026-06-12 |
| **Companion doc** | [PRD.md](PRD.md) |

## Contents

1. Multi-Source Activity Ingestion (GitHub + Cursor + Devin)
2. Agent Attribution Engine
3. Overnight Activity Feed Dashboard
4. Filter & Time-Range System
5. Slack Alert Notifications
6. Team Onboarding & GitHub OAuth

---

## Multi-Source Activity Ingestion (GitHub; Cursor + Devin deferred to v0.2)

**Product:** Dashy.ai | **Category:** Core/Integration | **Priority:** Must-Have | **Target:** MVP v0.1 (Week 1)

### 1. Overview & Problem Statement

Dashy.ai's core promise — a single real-time dashboard showing what every AI coding agent on your team is doing — is only as good as the data flowing into it. Today, agent activity is scattered: GitHub holds PRs/commits/merges/issues created by agents (and humans), Cursor records local agent sessions in activity logs, and Devin exposes task status through its own API. There is no unified stream.

This feature builds the ingestion backbone: a webhook listener (GitHub, v0.1) plus a polling service (Cursor + Devin, v0.2) that pulls activity, normalizes every event into one agent-activity schema, and stores it in Postgres within 60 seconds of occurrence. Every downstream MVP feature — the live activity feed (SSE), the morning digest, Slack alerts, agent attribution — reads from the `events` table this feature populates. If ingestion is late, lossy, or duplicated, the whole product is wrong.

For MVP v0.1, GitHub is the sole source: every supported agent (Claude Code, Cursor, Devin, Copilot) ultimately lands its work in GitHub as PRs, commits, and issues, so GitHub-only ingestion still captures the activity that matters for the feed and digest. Direct Cursor/Devin polling adds session-level detail in v0.2.

- **Persona A (senior developer / tech lead managing multiple AI agents):** needs every agent action captured exactly once, attributed to the right agent, fast enough to act on.
- **Persona B (engineering manager wanting morning team visibility):** needs completeness over a 24h window — gaps from a flaky webhook or an overnight outage break trust in the morning digest.

### 2. Goals & Non-Goals

**Goals**
1. Ingest GitHub webhook events (PR opened/closed/merged, push/commits, issues opened/closed) with signature verification.
2. Normalize GitHub payloads into a single agent-activity event schema that is source-agnostic (so Cursor/Devin polling slots in at v0.2 with no schema change).
3. Guarantee idempotency (no duplicate events) via deterministic dedup keys.
4. Event-to-stored latency < 60s (p95); ingestion pipeline contributes to 99.5% uptime target.
5. Backfill automatically after outages using per-source sync cursors.
6. One-click GitHub webhook registration during onboarding.
7. Emit an attribution hint per event; the attribution engine (separate feature) owns agent identity via the `agents` table and writes `agent_id` back onto events.

**Non-Goals (MVP v0.1)**
- Cursor and Devin polling sources (→ v0.2; schema, `sync_cursors`, and worker loop are designed for them now, implemented later).
- Sources beyond GitHub, Cursor, Devin (Claude Code hooks, Windsurf, GitLab → post-MVP).
- Real-time delivery to the browser (the SSE feed feature consumes this; out of scope here beyond emitting an internal notification).
- Event enrichment/scoring beyond a coarse `impact` field.
- Historical import older than 7 days at connect time.
- Editing or deleting ingested events.

### 3. User Stories

1. As a tech lead (A), when I connect my GitHub org during onboarding, Dashy.ai registers webhooks on my selected repos automatically so agent PRs appear in my feed within a minute, without me touching repo settings.
2. As a tech lead (A), when Devin completes a task and opens a PR at 14:02:10, I see a stored, normalized event by 14:03:10 so I can review the PR while context is fresh.
3. As an engineering manager (B), when GitHub had a 2-hour webhook outage overnight, Dashy.ai backfills the missed events before my 9am digest so the morning view is complete.
4. As a tech lead (A), when GitHub redelivers the same webhook three times, I see exactly one event in my feed.
5. As a tech lead (A), events from Claude Code, Cursor, Devin, and Copilot bot accounts are tagged with the right agent so the feed's per-agent view is trustworthy.
6. As an engineering manager (B), I can see per-source sync health (last event received, error state) so I know whether to trust the dashboard.

*(v0.2)* As a tech lead, I can paste my Cursor and Devin API keys into Settings → Sources, click "Test connection," and see polling begin within one cycle.

### 4. Functional Requirements

**FR-1 GitHub webhook registration (onboarding).** After GitHub OAuth, user selects repos; for each, the API calls GitHub `POST /repos/{owner}/{repo}/hooks` with events `["pull_request","push","issues"]`, a per-workspace shared secret (32-byte random, stored encrypted in `sources.config`), and target URL `https://api.dashy.ai/api/v1/webhooks/github`. Registration failures surface inline with retry.

**FR-2 Webhook receipt & verification.** Verify `X-Hub-Signature-256` (HMAC-SHA256 of raw body with the workspace secret, constant-time compare). Invalid → 401, drop, increment `sources.error_count`. Valid → enqueue raw payload and respond 202 within 500ms (process async; never block the webhook response on normalization).

**FR-3 Normalization.** Map raw payloads to the unified schema (Section 6). GitHub mapping: `pull_request.opened → pr_opened`, `pull_request.closed + merged=true → pr_merged`, `pull_request.closed + merged=false → pr_closed`, `push → commit_pushed` (one event per push, commit list in payload ref), `issues.opened/closed → issue_opened/issue_closed`. Agent attribution hint: actor login matched against known agent patterns (`devin-ai-integration[bot]` → `devin`, `cursor[bot]` → `cursor`, `claude-code[bot]`/`claude[bot]` → `claude-code`, `copilot[bot]`/`github-copilot[bot]` → `copilot`, plus workspace-configured agent usernames). The match is stored in `agent_hint` (text); the attribution engine consumes the hint and sets the authoritative `agent_id` FK into the `agents` table. Unmatched actors get `agent_hint = null` and `agent_id = null` (human activity, still ingested). **Canonical agent slugs (used in all Dashy.ai specs):** `claude-code`, `cursor`, `devin`, `copilot`, `custom:<name>`.

**FR-4 Polling (Cursor + Devin) — deferred to v0.2.** Design retained so v0.2 is additive: worker loop every 60s per active source; Cursor `GET /v1/activity?since={cursor}`, Devin `GET /v1/sessions?status=finished&since={cursor}`; page, normalize, insert, then atomically advance `sync_cursors.cursor_value` (cursor advances only after successful insert; at-least-once + dedup = exactly-once stored). The `sources` and `sync_cursors` tables ship in v0.1 to avoid a migration later.

**FR-5 Idempotency.** Deterministic `dedup_key` per event: GitHub = `gh:{delivery_guid}` (header `X-GitHub-Delivery`) for webhooks, `gh:{event_type}:{entity_id}:{action}` for backfilled events; (v0.2) Cursor = `cu:{activity_id}`; Devin = `dv:{session_id}:{status}`. Inserts use `ON CONFLICT (workspace_id, dedup_key) DO NOTHING`.

**FR-6 Retry/backoff.** Outbound API failures (backfill; polls in v0.2): exponential backoff 1s → 2s → 4s … capped 5min, with jitter; after 10 consecutive failures mark source `status='error'` and surface in Settings + health endpoint. Failed async normalization jobs retry 3 times then land in `events_dead_letter`.

**FR-7 Backfill on outage.** On worker start and whenever `sources.last_event_at` is older than 15 minutes for a webhook source, run reconciliation: list PRs/issues/commits via GitHub REST since `sync_cursors.cursor_value`, normalize and insert (dedup makes overlap safe). Connect-time backfill: last 7 days. (v0.2: polling sources self-heal by design — cursor never advances past a failure.)

**FR-8 Source health.** `GET /api/v1/sources` returns per-source `status`, `last_event_at`, `last_poll_at`, `error_count`. Settings UI renders green/yellow/red.

**FR-9 Internal fanout.** After successful insert, publish the event ID to the Redis `agent_events` pub/sub channel so the SSE feed, Slack alert, and attribution features can consume without polling the table.

### 5. API Specification

**`POST /api/v1/webhooks/github`** — GitHub webhook receiver (unauthenticated path; HMAC-verified).
- Headers required: `X-GitHub-Delivery`, `X-GitHub-Event`, `X-Hub-Signature-256`.
- Responses: `202 {"accepted": true}`; `401 {"error":"invalid_signature"}`; `400 {"error":"missing_header","field":"X-GitHub-Delivery"}`; `200 {"ignored":true,"reason":"unhandled_event_type"}` for event types we don't process (so GitHub doesn't mark the hook failing).
- Validation: body ≤ 1MB; JSON parseable; known workspace resolvable from hook → repo mapping, else 404.

**`POST /api/v1/sources`** — connect a source (session-authenticated).
```json
// Request (github in v0.1; cursor/devin accepted from v0.2)
{ "type": "github", "config": { "label": "Acme org" } }
// 201 Response
{ "id": "src_01J9X...", "type": "github", "status": "active", "created_at": "2026-06-12T09:01:00Z" }
```
- Validation: `type ∈ {github}` in v0.1 (`cursor`, `devin` return `422 {"error":"source_type_not_yet_available"}` until v0.2); in v0.2, `api_key` required for cursor/devin and verified with a live test call before 201; failure → `422 {"error":"connection_test_failed","detail":"401 from api.devin.ai"}`.

**`GET /api/v1/sources`** — list sources with health.
```json
{ "sources": [ { "id":"src_01J9X...", "type":"github", "status":"active",
  "last_event_at":"2026-06-12T08:59:12Z", "last_poll_at":null, "error_count":0 } ] }
```

**`DELETE /api/v1/sources/:id`** — disconnect; deregisters GitHub hooks where applicable. `204` on success.

**`GET /api/v1/events?since=2026-06-12T00:00:00Z&source=github&agent=claude-code&limit=100&cursor=evt_...`** — paginated read for downstream features. This is the single feed query endpoint; the feed/filters feature extends it with additional filter params rather than adding a parallel endpoint.
```json
// 200 Response
{ "events": [ {
    "id": "evt_01J9XQ8KZ3",
    "source": "github",
    "agent_id": "agt_01J9W...",
    "agent": "devin",
    "repo": "acme/payments-api",
    "actor": "devin-ai-integration[bot]",
    "action_type": "pr_opened",
    "impact": "medium",
    "occurred_at": "2026-06-12T08:58:41Z",
    "stored_at": "2026-06-12T08:59:02Z",
    "payload_ref": { "pr_number": 412, "url": "https://github.com/acme/payments-api/pull/412", "title": "Add idempotency keys to charge endpoint", "additions": 184, "deletions": 22 }
  } ],
  "next_cursor": "evt_01J9XQ7..." }
```
- `agent` in responses is the slug resolved from `agents` via `agent_id` (one of `claude-code | cursor | devin | copilot | custom:<name>`), not the raw ingestion hint.
- Validation: `limit` 1–200 (default 50); `since` ISO-8601 else `400 {"error":"invalid_param","field":"since"}`; `agent` must be a known agent slug; all queries workspace-scoped from session.

**`POST /api/v1/sources/:id/backfill`** — manual backfill trigger. `202 {"job_id":"bf_...","window_hours":24}`; `409` if a backfill is already running.

### 6. Data Model & Database Changes

**Normalized event JSON schema** (the contract for all sources):
```json
{
  "id": "evt_<ulid>",
  "workspace_id": "ws_<ulid>",
  "source": "github | cursor | devin",
  "agent_id": "agt_<ulid> | null  (FK to agents; set by attribution engine — single source of agent identity)",
  "agent_hint": "claude-code | cursor | devin | copilot | custom:<name> | null  (coarse ingestion-time hint, never displayed)",
  "repo": "owner/name | null",
  "actor": "string (login / user id at source)",
  "action_type": "pr_opened|pr_merged|pr_closed|commit_pushed|issue_opened|issue_closed|cursor_session_completed|devin_task_completed|devin_task_failed",
  "impact": "low | medium | high",
  "occurred_at": "ISO-8601 (source timestamp)",
  "stored_at": "ISO-8601 (insert time)",
  "dedup_key": "string, unique per workspace",
  "payload_ref": { "...source-specific summary, <=8KB..." }
}
```
Agent identity contract: the attribution feature's `agents` table is the single source of truth for agent identity and slugs (`claude-code`, `cursor`, `devin`, `copilot`, `custom:<name>` — this spelling is canonical across all specs). Ingestion writes only `agent_hint`; the attribution engine (subscribed to the Redis `agent_events` channel) resolves and sets `agent_id`. UI and API responses display the agent resolved via `agent_id`.

Impact heuristic (MVP): `pr_merged`/`devin_task_completed` = high; `pr_opened`/`devin_task_failed` = medium; everything else = low.

**Postgres tables:**
```sql
CREATE TABLE sources (
  id            TEXT PRIMARY KEY,             -- src_<ulid>
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id),
  type          TEXT NOT NULL CHECK (type IN ('github','cursor','devin')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','error','paused')),
  config        JSONB NOT NULL DEFAULT '{}',  -- encrypted api_key, webhook secret, repo list
  error_count   INT NOT NULL DEFAULT 0,
  last_event_at TIMESTAMPTZ,
  last_poll_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sources_workspace ON sources (workspace_id);

CREATE TABLE events (
  id            TEXT PRIMARY KEY,             -- evt_<ulid>
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id),
  source_id     TEXT NOT NULL REFERENCES sources(id),
  source        TEXT NOT NULL,
  agent_id      TEXT REFERENCES agents(id),   -- authoritative; set by attribution engine
  agent_hint    TEXT,                          -- coarse ingestion hint ('claude-code','cursor','devin','copilot','custom:<name>')
  repo          TEXT,
  actor         TEXT NOT NULL,
  action_type   TEXT NOT NULL,
  impact        TEXT NOT NULL DEFAULT 'low',
  occurred_at   TIMESTAMPTZ NOT NULL,
  stored_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  dedup_key     TEXT NOT NULL,
  payload_ref   JSONB NOT NULL DEFAULT '{}'
);
CREATE UNIQUE INDEX uq_events_dedup ON events (workspace_id, dedup_key);
CREATE INDEX idx_events_feed   ON events (workspace_id, occurred_at DESC);
CREATE INDEX idx_events_agent  ON events (workspace_id, agent_id, occurred_at DESC);
CREATE INDEX idx_events_repo   ON events (workspace_id, repo, occurred_at DESC);

CREATE TABLE sync_cursors (
  source_id     TEXT NOT NULL REFERENCES sources(id),
  stream        TEXT NOT NULL,                -- 'activity','sessions','pulls','issues','commits'
  cursor_value  TEXT NOT NULL,                -- timestamp or opaque page token
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, stream)
);

CREATE TABLE events_dead_letter (
  id          BIGSERIAL PRIMARY KEY,
  source_id   TEXT,
  raw_payload JSONB NOT NULL,
  error       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
(The `agents` table is owned by the attribution spec; this migration depends on it.)

### 7. UX / UI Notes

- **Onboarding step 2 ("Connect your agents"):** GitHub repo multi-select (post-OAuth) with "Register webhooks" CTA showing per-repo success checkmarks. Cursor and Devin cards shown as "Coming in v0.2" (disabled, with a notify-me toggle); API-key input + "Test connection" lands in v0.2.
- **Settings → Sources:** table of connected sources with health dot (green = event/poll within 5 min, yellow = 5–15 min, red = `status='error'`), `last_event_at` relative time, "Backfill last 24h" button, disconnect.
- **Empty/edge states:** "No events yet — webhooks registered, waiting for activity (usually <60s after the next agent action)." Error state links to a fix flow (re-register webhook; re-enter key in v0.2).
- All built with the existing Next.js app shell; no new design system work.

### 8. Acceptance Criteria

1. **Given** a registered GitHub webhook, **when** a PR is opened by `devin-ai-integration[bot]`, **then** a row exists in `events` with `action_type='pr_opened'`, `agent_hint='devin'`, correct `repo`, and `stored_at - occurred_at < 60s` (p95 over a 100-event test run); after attribution runs, `agent_id` resolves to the `devin` agent.
2. **Given** a webhook request with an invalid `X-Hub-Signature-256`, **when** it hits `/api/v1/webhooks/github`, **then** the API returns 401 and no row is inserted.
3. **Given** the same GitHub delivery GUID sent 3 times, **when** all three are processed, **then** exactly one `events` row exists (verified via `uq_events_dedup`).
4. **Given** a PR opened by `claude-code[bot]`, **when** processed, **then** the stored `agent_hint` is `claude-code` and the resolved agent slug in `GET /api/v1/events` is `claude-code` (canonical spelling).
5. **Given** the ingestion worker is stopped for 2 hours during which 50 GitHub events occur, **when** it restarts, **then** all 50 events are backfilled within 10 minutes with zero duplicates.
6. **Given** the GitHub backfill API returns 500 for 10 consecutive attempts, **when** the 10th failure occurs, **then** `sources.status='error'`, the Settings UI shows red within one page load, and `sync_cursors.cursor_value` has not advanced.
7. **Given** 1M total `events` rows with ~10k in a workspace, **when** `GET /api/v1/events?limit=50` is called, **then** response time is p95 < 400ms (the shared feed-query budget, also used by the feed/filters spec; keeps dashboard load < 2s) and pagination via `next_cursor` returns no gaps or repeats.
8. **Given** a `pull_request` payload with an unrecognized action, **when** processed, **then** the API returns 200 `{"ignored":true}` and nothing lands in `events_dead_letter`.

### 9. Risks, Edge Cases & Open Questions

- **Cursor/Devin API instability or undocumented changes (now a v0.2 risk):** both APIs are young; mitigate with the dead-letter table, schema-tolerant parsing (unknown fields ignored, missing required fields → dead letter, not crash), and contract tests against recorded fixtures. *Open question:* confirm Cursor team-activity API access tier on Business plans before v0.2 planning.
- **GitHub-only v0.1 coverage gap:** local Cursor sessions and Devin tasks that never touch GitHub are invisible until v0.2; acceptable because PR/commit/issue activity is what the feed and digest center on. Stated explicitly in onboarding copy.
- **Webhook URL availability vs 99.5% uptime:** Vercel serverless for the receiver (independent of the Railway worker); GitHub retries failed deliveries, and FR-7 reconciliation covers anything beyond GitHub's redelivery window.
- **Agent attribution ambiguity:** agents committing under a human's token look human. MVP: built-in bot-login detectors plus workspace-configurable actor→agent mapping (attribution spec); flag as known limitation.
- **Push event fan-out:** a force-push or 100-commit push is one event with commit summaries in `payload_ref` (capped at 20 commits) to avoid feed spam.
- **Secrets at rest:** webhook secrets (and API keys, v0.2) AES-256-GCM encrypted in `sources.config` with a server-side key; never returned by any GET endpoint.
- **Rate limits:** GitHub backfill respects `X-RateLimit-Remaining` (pause when < 100); (v0.2) polling at 60s/source is well under Cursor/Devin limits at MVP scale (<50 workspaces).
- **Clock skew:** `occurred_at` always from source payload; latency SLO measured against it, with a sanity clamp (events "from the future" > 5 min clamped to `stored_at`).

### 10. Implementation Plan & Estimates

Solo founder. Revised MVP-wide cut to fit 10 working days: Cursor+Devin polling deferred to v0.2 (saves ~1.5d here plus onboarding step 4); attribution keeps built-in detectors + manual rules seed only; filters API work merged into the feed endpoint; Slack uses a per-channel rate cap. **This feature's revised total: 3 days** (was 4.5), within Week 1 alongside attribution.

| Phase | Scope | Est. |
|---|---|---|
| 1 | Migrations (`events` with `agent_id`/`agent_hint`, `sources`, `sync_cursors`, `events_dead_letter`), event schema module + impact heuristic, `GET /api/v1/events` (shared feed endpoint) | 0.5 d |
| 2 | GitHub: webhook receiver + HMAC verify + async normalize, onboarding hook registration, dedup, agent-hint matching (canonical slugs incl. `claude-code`, `copilot`) | 1.25 d |
| 3 | Backfill/reconciliation (startup + manual endpoint), Redis pub/sub fanout, source CRUD, Settings health UI | 0.75 d |
| 4 | Tests: signature fixtures, dedup race (parallel inserts), outage-replay integration test; latency measurement logging | 0.5 d |

Deferred to v0.2 (~1.5 d): Cursor + Devin polling clients, cursor advancement loop, API-key connection test, onboarding key-entry cards.

Dependencies: GitHub OAuth (auth feature) and the attribution spec's `agents` table migration must land first; SSE feed, Slack alerts, and the attribution engine consume the Redis `agent_events` channel from Phase 3. Instrumentation: log `stored_at - occurred_at` per event from day one to prove the <60s target.

---

## Agent Attribution Engine

**Product:** Dashy.ai | **Category:** Core | **Priority:** Must-Have | **Target Release:** MVP v0.1 (Week 1)

### 1. Overview & Problem Statement

Dashy.ai's core promise is answering "what did my AI agents do while I wasn't looking?" That promise is worthless if the dashboard can't reliably say *which* agent — Cursor, Devin, GitHub Copilot, Claude Code, or a human teammate — performed each activity. GitHub events arrive as raw commits, pushes, and PRs with author metadata that is messy: agents commit under bot accounts, under users' personal access tokens (PATs), via co-authored-by trailers, or are blended away entirely by squash merges.

The Agent Attribution Engine is the service that inspects every ingested activity event and assigns an actor identity (agent or human) plus a confidence level (`exact`, `inferred`, `unknown`). Every other MVP feature — the activity feed, agent-level filters, the morning digest, Slack alerts — depends on this attribution being trustworthy.

**Core principle: never silently misattribute.** When signals conflict or are absent, the engine labels the activity `unattributed` rather than guessing. Trust in attribution is the product's foundation; a single visible misattribution ("Dashy said Devin wrote this — it was me") destroys credibility with Persona A (senior dev/tech lead managing multiple agents) and makes Persona B's (engineering manager) morning summary unreliable.

### 2. Goals & Non-Goals

**Goals**
- Attribute ≥90% of activities from configured agents with `exact` or `inferred` confidence on a typical repo.
- Zero silent misattributions: every attribution carries a confidence level and the matched-rule explanation, visible in the UI.
- Workspace-configurable rules: map any bot account, email pattern, or branch prefix to a named agent in <30 seconds via settings UI.
- Attribution runs inline with event normalization and adds <500ms per event, preserving the <60s event-latency target.
- Ship built-in detection for Cursor, Devin, GitHub Copilot, Claude Code, and generic GitHub bots with zero configuration.

**Non-Goals (MVP)**
- ML-based or diff-content-based authorship inference (heuristics only).
- Per-line / partial-commit attribution (one actor per activity; co-authors stored as secondary).
- Retroactive re-attribution of full history when rules change beyond the last 30 days.
- Non-GitHub sources (GitLab, Linear, Jira) — schema is source-agnostic, but only GitHub signals ship in v0.1.
- Detecting agents that deliberately masquerade as humans with no detectable signals.

### 3. Personas & User Stories

**Persona A — Senior developer / tech lead (manages multiple AI agents)**
- As a tech lead, I want each commit/PR in my feed tagged with the agent that produced it, so I can review Devin's work with more scrutiny than my own.
- As a tech lead, I want to map our `acme-devin[bot]` account to "Devin" once, so all its activity is correctly labeled going forward.
- As a tech lead, when I amend an agent's commit, I want Dashy.ai to show the activity as mine with a "modified agent work" note — not credit the agent for my fix.
- As a tech lead, I want to see *why* something was attributed (which rule/signal matched), so I can trust or correct it.

**Persona B — Engineering manager (morning team visibility)**
- As an EM, I want my morning view broken down by agent vs. human contributions, so I can see how much of yesterday's output was agent-driven.
- As an EM, I want unattributed activity surfaced as its own bucket, so I know the numbers I'm reading are honest, not padded by guesses.
- As an EM, I want squash-merged PRs attributed to the PR's primary actor with blended authorship flagged, so totals stay roughly correct.

### 4. Functional Requirements

**FR-1 Signal extraction.** For every ingested activity event, extract: commit author name/email, committer name/email, GitHub login + account type (`User`/`Bot`), `Co-authored-by:` trailers, branch name, PR head ref, commit message markers, and source-system provenance (webhook sender, app installation ID).

**FR-2 Built-in detection rules (priority-ordered, first match wins within a tier):**
1. **Bot account (exact):** GitHub account type `Bot` or login matching known patterns (`*[bot]`, `devin-ai-integration`, `copilot-swe-agent`, `cursor-agent`, `github-actions`) → mapped agent, confidence `exact`.
2. **Workspace rule (exact):** workspace-configured mapping (login, email glob, or branch-prefix rule) → mapped agent, confidence `exact`.
3. **Co-authored-by trailer (inferred):** trailer matching known agent emails (`*@cursor.sh`, `noreply@anthropic.com` with "Claude" name, `*@devin.ai`, Copilot signatures) → primary actor is the human author; agent recorded as `co_actor`, confidence `inferred`.
4. **Commit message / branch markers (inferred):** branch prefixes (`devin/*`, `cursor/*`, `copilot/*`, `claude/*`) or message markers (e.g. "🤖 Generated with Claude Code") → agent, confidence `inferred`.
5. **No signal:** actor = the GitHub user, `actor_kind = human`, confidence `inferred`. If author identity itself is unresolvable, actor = `unattributed`, confidence `unknown`.

**FR-3 Conflict handling.** When two signals at the same tier disagree (e.g., branch says `devin/*` but workspace rule maps the author to Cursor) → `unattributed` with both candidate signals stored for UI display. Never pick arbitrarily.

**FR-4 Confidence model.** Every attribution stores `confidence ∈ {exact, inferred, unknown}` and `signals` (JSON array of matched rules). UI shows a confidence badge and a "why?" tooltip listing signals. This vocabulary is canonical across Dashy.ai: the activity feed renders these same three categorical values (no numeric confidence score exists anywhere in the product).

**FR-5 Workspace-configurable rules.** CRUD UI + API for rules of type `login`, `email_glob`, `branch_prefix` → agent. Rules apply to new events immediately and trigger async re-attribution of the workspace's last 30 days of events.

**FR-6 Manual correction.** A user can reassign any activity's actor; manual corrections get confidence `exact`, signal `manual_override`, and are never overwritten by re-attribution.

**FR-7 Edge cases.**
- *Human amends agent commit:* committer ≠ author and committer is human while author is an agent → attribute to the **committer (human)**, confidence `inferred`, flag `modified_agent_work=true`, agent stored as `co_actor`.
- *Squash merge:* attribute to the squashing actor; parse all `Co-authored-by` trailers into `co_actors`; flag `blended_authorship=true` when trailers include >1 distinct identity.
- *Agent pushing under user PAT:* author looks human; rely on tiers 2–4 (workspace rules, trailers, branch prefixes). If a workspace rule of type `email_glob` or `branch_prefix` matches, attribute to the agent (`exact` for rule match on email/login, `inferred` for branch). Otherwise it remains attributed to the human — documented limitation, mitigated by prompting workspaces to add rules (FR-8).
- *Unknown bot:* an unmapped `*[bot]` account → `unattributed` with a one-click "map this bot to an agent" suggestion in the UI.

**FR-8 Suggestion surfacing.** When ≥3 events in 7 days hit the unknown-bot or conflicting-signal path for the same identity, surface a settings banner suggesting a rule.

### 5. UX / UI Design Notes

- **Activity feed (existing MVP feed):** each row gets an actor chip — agent icon + name (Cursor, Devin, Copilot, Claude Code) or human avatar. Confidence shown as a subtle badge using the canonical vocabulary: solid chip = `exact`, dashed outline = `inferred`, gray "Unattributed" chip = `unknown`. (The feed spec adopts these exact three values in its card anatomy, API examples, and US-2 acceptance criterion — no high/medium/low labels and no numeric score.) Hover/click opens a popover: matched signals ("Bot account `devin-ai-integration[bot]`"), co-actors, and flags (`modified agent work`, `blended authorship`).
- **Unattributed bucket:** feed filter and dashboard stat card for unattributed activity; clicking an unattributed row offers "Attribute to…" (manual override) and "Create rule from this" (pre-filled rule form).
- **Settings → Attribution Rules:** table of rules (type, pattern, agent, created by, hit count last 30d), add/edit/delete, plus the suggestion banners from FR-8. Built-in rules shown read-only with an override toggle.
- **Tone:** honest by default. Never display an inferred attribution identically to an exact one. Empty/uncertain states say "We couldn't determine the actor" — no fake precision.
- **Performance:** attribution data is denormalized onto the event row, so the feed renders with no extra queries (keeps dashboard load <2s).

### 6. Technical Design

**Architecture.** Attribution is a pure-function Node module (`attribution/engine.ts`) invoked as a step inside the ingestion spec's async normalization job (ingestion FR-2): raw payloads land via the Vercel serverless webhook receiver (GitHub) or the Railway poller (Cursor, Devin), are enqueued, and the async normalization worker runs the attribution engine for **all three sources** after normalization and before the `events` INSERT. Input: normalized event + the workspace's rule set (cached in-memory per `workspace_id`, 60s TTL, invalidated on rule change). Output: `{ actor_kind, agent_id | user_identity, confidence, signals[], co_actors[], flags{} }` written onto the `events` row in the same transaction as the insert. No extra service and no additional queue beyond ingestion's existing one — pragmatic for a solo founder and keeps event latency well under 60s.

**Re-attribution job.** Rule create/update/delete enqueues a lightweight background job (simple Postgres-backed job row + polling worker already used for digests) that re-runs the engine over the workspace's last 30 days of events, skipping `manual_override` rows. Batched 500 rows per iteration.

**Built-in detectors** ship as a versioned constant list (`builtin_rules.ts`) so adding a new agent pattern is a code change + deploy, no migration.

**Database (Postgres).** IDs are TEXT prefixed ULIDs, consistent with the ingestion spec's `events` table (e.g. `agt_01H…`, `rule_01H…`, `evt_01H…`).

```sql
CREATE TABLE agents (
  id           text PRIMARY KEY,            -- prefixed ULID, e.g. 'agt_01H…'
  workspace_id text NOT NULL REFERENCES workspaces(id),
  slug         text NOT NULL,               -- 'cursor' | 'devin' | 'copilot' | 'claude-code' | custom
  display_name text NOT NULL,
  is_builtin   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, slug)
);

CREATE TABLE attribution_rules (
  id           text PRIMARY KEY,            -- prefixed ULID, e.g. 'rule_01H…'
  workspace_id text NOT NULL REFERENCES workspaces(id),
  rule_type    text NOT NULL CHECK (rule_type IN ('login','email_glob','branch_prefix')),
  pattern      text NOT NULL,
  agent_id     text NOT NULL REFERENCES agents(id),
  created_by   text NOT NULL REFERENCES users(id),
  enabled      boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, rule_type, pattern)
);
CREATE INDEX idx_attribution_rules_ws ON attribution_rules (workspace_id) WHERE enabled;

-- columns added to the existing events table (ingestion spec, canonical)
ALTER TABLE events
  ADD COLUMN actor_kind        text NOT NULL DEFAULT 'unattributed'
    CHECK (actor_kind IN ('agent','human','unattributed')),
  ADD COLUMN agent_id          text REFERENCES agents(id),
  ADD COLUMN actor_login       text,
  ADD COLUMN confidence        text NOT NULL DEFAULT 'unknown'
    CHECK (confidence IN ('exact','inferred','unknown')),
  ADD COLUMN attribution_signals jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN co_actors         jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN attribution_flags jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN manual_override   boolean NOT NULL DEFAULT false,
  ADD COLUMN attribution_version int NOT NULL DEFAULT 1;

CREATE INDEX idx_events_ws_agent   ON events (workspace_id, agent_id, occurred_at DESC);
CREATE INDEX idx_events_ws_unattr  ON events (workspace_id, occurred_at DESC)
  WHERE actor_kind = 'unattributed';
```

**Frontend (Next.js):** actor chip + confidence popover components; settings page at `/settings/attribution`. Re-attribution completions push an SSE message (`attribution.updated`) so open feeds refresh affected rows.

### 7. API Specification

All endpoints under the existing authenticated Node API (GitHub-OAuth session, workspace-scoped). Errors use `{ "error": { "code": string, "message": string } }`.

**`GET /api/v1/attribution/rules`** → `200`
```json
{ "rules": [ { "id": "rule_01H…", "rule_type": "login", "pattern": "acme-devin[bot]",
  "agent": { "id": "agt_01H…", "slug": "devin", "display_name": "Devin" },
  "enabled": true, "hit_count_30d": 142, "created_at": "2026-06-10T08:12:00Z" } ],
  "builtin_rules": [ { "rule_type": "login", "pattern": "*[bot] (copilot-swe-agent)", "agent_slug": "copilot" } ] }
```

**`POST /api/v1/attribution/rules`**
```json
{ "rule_type": "email_glob", "pattern": "*@devin.ai", "agent_id": "agt_01H…" }
```
Validation: `rule_type` ∈ enum; `pattern` 1–255 chars, non-empty after trim; `email_glob` must contain `@`; `branch_prefix` must match `^[A-Za-z0-9._/-]+$`; `agent_id` must belong to workspace. → `201` with the rule object and `{ "reattribution_job_id": "job_01H…" }`. Duplicate pattern → `409 rule_exists`. Invalid → `422 validation_failed` with `field`.

**`PATCH /api/v1/attribution/rules/:id`** — body: any of `pattern`, `agent_id`, `enabled`. → `200` updated rule + new re-attribution job. `404` if not in workspace.

**`DELETE /api/v1/attribution/rules/:id`** → `204`, enqueues re-attribution.

**`GET /api/v1/agents`** → `200 { "agents": [ { "id": "agt_01H…", "slug": "devin", "display_name": "Devin", "is_builtin": true } ] }`
**`POST /api/v1/agents`** — `{ "slug": "my-custom-bot", "display_name": "Nightly Refactor Bot" }`; slug `^[a-z0-9-]{2,40}$`, unique per workspace → `201` / `409 slug_taken`.

**`POST /api/v1/events/:id/attribution`** (manual override)
```json
{ "actor_kind": "agent", "agent_id": "agt_01H…" }
```
or `{ "actor_kind": "human", "actor_login": "kurt" }`. → `200`
```json
{ "id": "evt_01H…", "actor_kind": "agent", "agent_id": "agt_01H…", "confidence": "exact",
  "attribution_signals": [ { "type": "manual_override", "by_user": "usr_01H…", "at": "2026-06-12T14:01:00Z" } ],
  "manual_override": true }
```
`404` unknown event; `422` if `agent_id` and `actor_login` both present or both absent.

**`GET /api/v1/attribution/jobs/:id`** → `200 { "id": "job_01H…", "status": "running", "processed": 1500, "total": 4200 }` (statuses: `queued|running|done|failed`).

**`GET /api/v1/attribution/suggestions`** → `200 { "suggestions": [ { "identity": "mystery-bot[bot]", "event_count_7d": 11, "suggested_rule_type": "login" } ] }`

### 8. Acceptance Criteria

1. **Given** a commit pushed by GitHub account `devin-ai-integration[bot]` (type `Bot`), **When** the event is ingested, **Then** the activity shows actor "Devin", confidence `exact`, within 60s of the webhook.
2. **Given** a workspace rule mapping `email_glob *@acme-agents.dev` → Cursor, **When** a commit authored by `runner@acme-agents.dev` arrives, **Then** it is attributed to Cursor with confidence `exact` and the matched rule listed in signals.
3. **Given** a human-authored commit containing trailer `Co-authored-by: Claude <noreply@anthropic.com>`, **When** ingested, **Then** the primary actor is the human (`inferred`), and Claude Code appears in `co_actors`.
4. **Given** a commit whose branch is `devin/fix-auth` but whose author matches a workspace rule for Cursor, **When** ingested, **Then** the activity is `unattributed` with both conflicting signals stored and visible in the popover — never one picked silently.
5. **Given** an agent-authored commit later amended by a human (committer = human, author = agent), **When** ingested, **Then** the actor is the human, confidence `inferred`, flag `modified_agent_work=true`, and the agent appears in `co_actors`.
6. **Given** a squash merge whose message contains two distinct `Co-authored-by` trailers, **When** ingested, **Then** the squashing actor is the primary actor, both co-authors are stored, and `blended_authorship=true`.
7. **Given** an unmapped account `mystery-bot[bot]` with 3+ events in 7 days, **When** a user opens Settings → Attribution Rules, **Then** a suggestion to map it is shown, and creating the rule re-attributes the workspace's last 30 days within 5 minutes (job status `done`).
8. **Given** a user manually overrides an activity to "human: kurt", **When** any later re-attribution job runs, **Then** the override is preserved (`manual_override=true`, confidence `exact`).
9. **Given** a feed of 200 activities, **When** the dashboard loads, **Then** actor chips and confidence badges render with no additional API round-trips and total load remains <2s.
10. **Given** the seeded test corpus of 500 labeled events (mixed agents/humans/edge cases), **When** the engine runs, **Then** ≥90% are attributed `exact`/`inferred` correctly and **0** events are attributed to the wrong actor at `exact` confidence.
11. **Given** rule creation with `rule_type: "email_glob"` and `pattern: "no-at-sign"`, **When** POSTed, **Then** the API returns `422 validation_failed` identifying the `pattern` field.
12. **Given** events arriving via each of the three ingestion paths (GitHub webhook via Vercel receiver, and Cursor and Devin events via the Railway poller), **When** the async normalization job processes them, **Then** every resulting `events` row carries attribution columns — no path bypasses the engine.

### 9. Risks & Open Questions

**Risks**
- *Agents under user PATs are indistinguishable from humans* without workspace rules. Mitigation: FR-8 suggestions, onboarding step prompting "which bot accounts / branch prefixes do your agents use?", and honest `inferred` labeling on all human attributions.
- *Agent vendors change their signatures* (bot logins, trailer formats). Mitigation: built-in rules are a versioned constant list, cheap to hot-fix; `attribution_version` column enables targeted re-runs.
- *Re-attribution load* on large repos could stall the single worker. Mitigation: 30-day cap, 500-row batches, lowest job priority below ingestion.
- *Confidence-badge clutter* may overwhelm Persona B. Mitigation: badges are subtle; only `unattributed` is loud.

**Open questions**
1. Should `inferred` human attribution (tier 5 default) be downgraded to `unknown` for workspaces with zero configured rules, to push rule setup harder? (Lean: no — too noisy.)
2. Do Slack alerts/morning digest report unattributed counts explicitly in v0.1, or only in the web UI? (Lean: yes in digest, one line.)
3. When GitHub later exposes richer Copilot agent provenance APIs, do we backfill? (Defer; `attribution_version` makes it possible.)
4. Org-level vs workspace-level rules for multi-workspace accounts — out of scope until multi-workspace exists.

### 10. Implementation Plan & Estimates

Solo-founder plan, fits Week 1 of the MVP alongside the other five features (attribution is the first core service since the feed depends on it). **Total: 3.5 days.**

- **Phase 1 — Schema + engine core (1 day):** migrations (`agents`, `attribution_rules`, `events` columns, indexes); pure-function engine with tiered built-in rules; unit tests for tiers 1–5 and conflict handling.
- **Phase 2 — Pipeline integration + edge cases (1 day):** wire engine into the async normalization job covering all three ingestion paths (Vercel webhook receiver + Railway poller sources); amend/squash/co-author handling; seeded 500-event labeled test corpus; latency check (<500ms/event).
- **Phase 3 — Rules API + re-attribution job (0.75 day):** CRUD endpoints, validation, manual-override endpoint, Postgres-backed re-attribution job + job-status endpoint, rule-cache invalidation.
- **Phase 4 — UI (0.75 day):** actor chip + confidence popover in feed; `/settings/attribution` rules table + create/edit form; unattributed filter + suggestion banner; SSE `attribution.updated` refresh.

**Definition of done:** all 12 acceptance criteria pass; test corpus hits ≥90% correct with zero `exact`-confidence misattributions; rule change → re-attribution completes <5 min on a 10k-event workspace; no measurable regression to <2s dashboard load or <60s event latency.

---

## Overnight Activity Feed Dashboard

### 1. Overview

The Overnight Activity Feed Dashboard is the core morning-briefing screen of Dashy.ai. It answers one question in under two minutes: "What did my AI agents do while I was offline?" The dashboard renders a feed of activity cards — PRs opened/merged, issues closed, commits pushed — grouped by repository, agent type, and impact level, headed by a "While you were offline" summary computed from the dashboard's default overnight window (6pm yesterday in the user's timezone), refined by the user's last-seen timestamp when available. New events stream in live via SSE so the dashboard stays current throughout the workday without refresh.

This is the product's primary surface and primary retention driver: every other MVP feature (event ingestion, agent attribution, Slack alerts) ultimately renders here. Category: Core. Priority: Must-Have. Target: MVP v0.1, Week 2.

### 2. Problem Statement & User Personas

**Problem.** Developers running autonomous AI agents (Claude Code, Devin, Copilot Workspace, OpenAI Codex, etc.) overnight wake up to a scatter of GitHub notification emails, Slack noise, and raw PR lists with no way to distinguish agent work from human work, no sense of which changes matter, and no single place to triage. Reconstructing "what happened last night" takes 20–40 minutes of tab-hopping every morning.

**Persona A — Senior developer / tech lead ("Maya").** Runs 2–5 AI agents across 3–10 repos. Needs a glanceable morning review: which agents shipped what, which PRs need her review first, what failed. Success = morning triage in <2 minutes.

**Persona B — Engineering manager ("Devon").** Wants morning visibility into team-wide agent output without reading code: counts, high-impact items, which repos are hot. Success = a trustworthy summary header and impact-sorted feed he can skim before standup.

### 3. User Stories & Acceptance Criteria

**US-1: While-you-were-offline summary.**
As Maya, I want a summary of activity since I last looked, so I can orient instantly.
- Given Maya last viewed the dashboard at 22:14 yesterday, When she loads it at 08:00, Then the window is `max(last_seen_at, 6pm yesterday in her timezone)` — here 22:14 — and the header reads "While you were offline (9h 46m)" with counts for PRs opened, PRs merged, issues closed, commits, and agents active — each count matching the events stored in that window exactly.
- Given Maya has no `last_seen_at` (first visit, or last seen before 6pm yesterday), When she loads the dashboard, Then the window defaults to the overnight window defined by the filters spec: 6pm yesterday in the user's timezone through now.
- Given no events occurred in the window, When the dashboard loads, Then an empty state reads "All quiet overnight — no agent activity in the last N hours" with a link to connected-repo settings.

**US-2: Grouped activity cards.**
As Maya, I want cards grouped by repo, agent, or impact, so I can scan in the order I think.
- Given 30 events across 4 repos, When Maya selects "Group by repo", Then cards render under 4 repo headings sorted by event count descending; switching to "Group by agent" or "Group by impact" re-groups client-side in <200ms without refetching.
- Given any card, When rendered, Then it shows: agent badge + attribution confidence (high/medium/low), action verb, repo name, impact indicator (high/medium/low), relative timestamp, and a deep link that opens the GitHub source in a new tab.

**US-3: Real-time updates.**
As Devon, I want new events to appear without refreshing.
- Given the dashboard is open and an agent merges a PR, When Dashy.ai ingests the event, Then a new card appears at the top of its group within 60 seconds, with a subtle highlight animation, and summary counts increment.
- Given the SSE connection drops, When the client detects it, Then it shows a "Reconnecting…" pill, retries with exponential backoff (1s → 30s cap), and replays missed events via `Last-Event-ID` on reconnect.

**US-4: Performance and glanceability.**
- Given a returning authenticated user on a median connection, When the dashboard loads, Then first contentful render of summary + first 20 cards completes in <2s (p95).
- Given 200+ overnight events, When the user scrolls, Then additional cards load via cursor pagination in pages of 50 with no scroll jank.

**US-5: States and theming.**
- Given the dashboard is loading, Then skeleton cards (summary header + 6 card placeholders) render immediately.
- Given the API returns 5xx, Then an error state with a Retry button renders; retry refetches without full page reload.
- Given any user, Then dark mode is the default theme; a toggle persists light/dark preference in `localStorage` and the user profile.

### 4. Functional Requirements

1. **FR-1 Time window.** Compute window as `[offline_start, now]` where `offline_start` = `max(user.last_seen_at, 6pm yesterday in the user's timezone)` (the overnight default from the filters spec). If `last_seen_at` is null, use the overnight default alone. `last_seen_at` is updated on dashboard blur/close via beacon. Window is capped at 7 days lookback.
2. **FR-2 Feed query.** Return events in the workspace's connected repos within the window, each including the denormalized agent attribution columns on the events row (agent name, type, confidence score, per the attribution spec) and impact level (from the impact heuristic owned by the ingestion spec, Section 6; default `medium` if unscored).
3. **FR-3 Grouping.** Server returns a flat, time-sorted list; grouping by repo/agent/impact is performed client-side. Selected grouping persists per user.
4. **FR-4 Summary counts.** PRs opened, PRs merged, issues closed, commit count, distinct agents active — computed server-side in the same request as page 1.
5. **FR-5 Card anatomy.** Agent badge (logo/color per agent type) + confidence chip; action label ("opened PR #142", "merged PR #139", "closed issue #88", "pushed 6 commits"); repo `owner/name`; impact dot (red/amber/gray); relative timestamp with absolute on hover; deep link to GitHub.
6. **FR-6 SSE stream.** `GET /api/v1/stream` pushes `event: activity` messages for the session's workspace; supports `Last-Event-ID` replay from the last 1,000 events per workspace; heartbeat comment every 25s to defeat proxy timeouts. Fan-out follows the ingestion spec's Redis pub/sub contract (see Section 5).
7. **FR-7 States.** Skeleton loading, empty (no events / no repos connected — distinct copy), error with retry, SSE-degraded (falls back to 60s polling after 5 failed reconnects).
8. **FR-8 Theme.** Dark mode default via Tailwind `dark` class; preference persisted.
9. **FR-9 Mark as seen.** On unload/blur, `POST /api/v1/me/last-seen` (sendBeacon) updates `last_seen_at`.

Out of scope for v0.1: filtering/search within the feed, card-level actions (approve/merge), multi-user team views, mobile app (responsive web only).

### 5. Technical Architecture & Implementation Approach

- **Frontend:** Next.js (App Router) on Vercel. Dashboard is a client component hydrated from a server-fetched initial payload (summary + page 1) so first paint beats 2s. `EventSource` for SSE; SWR for pagination and polling fallback. Tailwind + a small card component library; CSS variables for theming.
- **API:** Node (Fastify/Express) on Railway. SSE fan-out adopts the ingestion spec's canonical contract: ingestion (Vercel webhook receiver and Railway worker) writes the event row and publishes the event ID to the Redis `agent_events` channel; the Railway API process holds a Redis subscriber connection on `agent_events`, loads the event row on message, and pushes it to an in-process SSE connection map keyed by `workspace_id`. Redis pub/sub broadcasts to every subscriber, so this works unchanged if the API ever runs more than one instance.
- **Data:** Postgres (Railway). Reads use the `events` table written by the ingestion feature (attribution fields are denormalized onto the events row per the attribution spec), joined to `repos` for display names. Summary counts via one aggregate query with `FILTER` clauses; feed via cursor pagination on `(occurred_at, id)`, served by ingestion's existing `idx_events_feed` index.
- **Auth:** GitHub OAuth session cookie (shared with the rest of the app); the session resolves the `workspace_id` used to scope all feed and SSE queries. SSE authenticates via the same cookie.
- **Performance:** initial payload limited to 20 cards + counts; ingestion's `idx_events_feed` keeps the window query <50ms at 100k events; Vercel edge caching disabled for this route (user-specific), but static assets and fonts are CDN-cached.

### 6. API & Data Model Changes

**Users-table migration (single migration, owned by this spec; the filters spec references these columns rather than re-adding them):**

```sql
ALTER TABLE users
  ADD COLUMN last_seen_at timestamptz,
  ADD COLUMN timezone text NOT NULL DEFAULT 'UTC',
  ADD COLUMN theme text NOT NULL DEFAULT 'dark',
  ADD COLUMN feed_grouping text NOT NULL DEFAULT 'repo', -- repo|agent|impact
  ADD COLUMN default_filters jsonb NOT NULL DEFAULT '{}'::jsonb; -- consumed by filters spec

-- events table and idx_events_feed are owned by the ingestion spec; no new
-- indexes are added here — feed queries reuse idx_events_feed (workspace_id, occurred_at DESC, id DESC).
```

**`GET /api/v1/feed?since=<ISO8601>&cursor=<opaque>&limit=50`** — 200 (scoped to the session's workspace):

```json
{
  "window": { "start": "2026-06-11T22:14:03Z", "end": "2026-06-12T08:01:10Z", "source": "last_seen" },
  "summary": { "prs_opened": 4, "prs_merged": 2, "issues_closed": 3, "commits": 27, "agents_active": 3 },
  "events": [
    {
      "id": "evt_01J9X8",
      "action_type": "pr_merged",
      "title": "Merged PR #139: Refactor auth middleware",
      "repo": { "id": 12, "full_name": "acme/api" },
      "agent": { "name": "Claude Code", "type": "claude_code", "confidence": "high", "confidence_score": 0.94 },
      "impact": "high",
      "occurred_at": "2026-06-12T03:12:44Z",
      "source_url": "https://github.com/acme/api/pull/139"
    }
  ],
  "next_cursor": "eyJvIjoi..."
}
```

`window.source` is `"last_seen"` when `last_seen_at` refined the window, else `"overnight_default"`. Validation: `since` must be valid ISO8601 and ≥ now−7d, else 422 `{ "error": "since_out_of_range" }`; `limit` 1–100 (default 50); invalid cursor → 400 `{ "error": "invalid_cursor" }`; unauthenticated → 401.

**`GET /api/v1/stream`** — SSE, 200 `text/event-stream`, scoped to the session's workspace. Events: `event: activity` with the same card JSON; `id:` set to event id; comment heartbeat every 25s. 401 if no session.

**`POST /api/v1/me/last-seen`** — body `{ "seen_at": "2026-06-12T08:30:00Z" }`; rejects future timestamps >2min skew (422); 204 on success.

**`PATCH /api/v1/me/preferences`** — body subset of `{ "theme": "dark|light", "feed_grouping": "repo|agent|impact", "timezone": "America/New_York" }`; enum/IANA-validated, 422 on invalid value; 200 returns updated preferences.

### 7. UX/UI Considerations

- **Layout:** sticky summary header (5 stat chips + window label + grouping toggle), then grouped card columns/sections; max content width 880px; single-column responsive at <768px.
- **Hierarchy for glanceability:** impact color dot and agent badge are the two strongest visual signals; high-impact groups sort first when grouping by impact; everything readable without hover.
- **Dark mode default** (near-black `#0B0F14` background, high-contrast text, WCAG AA minimum 4.5:1); light theme available.
- **Motion:** new SSE cards slide in with a 300ms highlight; respects `prefers-reduced-motion`.
- **States:** skeletons mimic final layout to avoid CLS; empty state differentiates "no repos connected" (CTA: connect repos) vs "no activity" (reassuring copy); error state never blanks the previously rendered feed.
- **Accessibility:** cards are links with full keyboard focus order; live region announces "N new events" rather than reading every card; timestamps use `<time datetime>`.

### 8. Success Metrics & Analytics

- Dashboard p95 load (FCP of summary + first cards) **<2s**; tracked via Vercel Web Analytics / `web-vitals`.
- Event ingest→card-visible latency **<60s** p95 (instrument `occurred_at` vs client render timestamp).
- Morning review duration: median session of first daily visit **<2 minutes** with ≥1 deep-link click (proxy for "found what mattered").
- Post-launch usability validation: when asked "what happened overnight?", 8/10 new-user testers answer correctly within 2 minutes (validated after launch; not a release gate).
- Engagement: % of WAU with ≥4 morning sessions/week (target 60% by week 6); SSE connection success rate ≥99%; uptime 99.5%.
- Instrumented events: `dashboard_viewed` (with window length, event count), `grouping_changed`, `card_clicked`, `sse_reconnect`, `empty_state_shown`.

### 9. Risks, Dependencies & Open Questions

**Dependencies:** GitHub webhook ingestion + `events` table and the Redis `agent_events` pub/sub contract (MVP feature 1) must land first; agent attribution (feature 2) supplies the denormalized attribution columns and the ingestion spec's impact heuristic (Section 6) supplies impact — dashboard degrades gracefully (badge "Unknown agent / low confidence", impact "medium") if those ship late. The filters spec consumes the `default_filters`/`timezone` columns added by this spec's migration.

**Risks:** (1) SSE through Vercel is awkward — mitigate by serving SSE from the Railway Node API directly. (2) The in-memory SSE connection map is per-instance — fine, since Redis pub/sub broadcasts every event to all instances, so each instance serves its own connections without coordination. (3) Last-seen heuristic can produce absurd windows (vacation) — capped at 7 days, and floored by the overnight default. (4) Summary count drift between server aggregate and streamed increments — client refetches summary on reconnect.

**Open questions:** Should timezone for the overnight window come from browser or the profile `timezone` column (MVP: profile, defaulting from browser on first login)? Do commit events render one card per push or per commit (MVP: per push, with commit count)? Should EMs (Persona B) see teammates' agents in v0.1 (deferred — workspace feed reflects connected repos, not per-teammate views)?

### 10. Phased Implementation Plan & Estimates

Solo-founder plan, ~5 days total within Week 2, alongside other MVP features:

- **Phase 1 (1.5 days):** Feed + summary API: window computation (overnight default + last-seen refinement), aggregate query, cursor pagination against `idx_events_feed`, users-table migration, `last-seen` and preferences endpoints, unit tests against seeded events.
- **Phase 2 (1.5 days):** Dashboard UI: layout, summary header, card component, client-side grouping, skeleton/empty/error states, dark-mode theming, responsive pass.
- **Phase 3 (1 day):** SSE: Redis `agent_events` subscriber, stream endpoint, heartbeats, `Last-Event-ID` replay buffer, client reconnect + polling fallback, live count increments.
- **Phase 4 (1 day):** Polish + hardening: performance budget verification (<2s p95 with 200-event seed), accessibility pass, analytics events, deploy to Vercel/Railway, smoke tests.

Exit criteria: all Section 3 acceptance criteria pass; load and latency targets verified against seeded production-like data.

---

## Feature Specification: Filter & Time-Range System

**Product:** Dashy.ai | **Category:** Core | **Priority:** Must-Have | **Target:** MVP v0.1 (Week 2)

---

### 1. Overview & Problem Statement

Dashy.ai's core promise is "see what your AI agents did overnight in under two minutes." A raw activity feed fails that promise the moment a user runs more than one agent on more than one repo: a senior dev with 4 agents across 3 repos can wake up to 200+ events, and an engineering manager checking team activity sees an order of magnitude more. Without filtering, the feed is noise and the morning-review workflow breaks.

The Filter & Time-Range System is the lens over the activity feed. It lets users slice events by project/repo, time range (with "overnight" as the opinionated default), developer/agent, action type, and impact level. Filters combine with AND logic, live in URL query params (so a filtered view is a shareable link), and can be saved as a per-user default. This spec does **not** define a new events endpoint: the ingestion spec owns the canonical `GET /api/v1/events` contract, and this spec extends it with the filter, time-range, and pagination query parameters that the feed, digest, and Slack-alert features all build on — making this spec a dependency for most other MVP features.

**Personas served:**
- **Persona A — Senior developer / tech lead running multiple AI agents:** "Show me only high-impact actions Claude Code took on `api-server` overnight."
- **Persona B — Engineering manager:** "Every morning, show me what the whole team's agents shipped in the last 24 hours, filtered to merged PRs and pushed commits."

---

### 2. Goals & Non-Goals

**Goals**
1. Filter the activity feed by repo (multi-select), time range, actor (developer or agent), action type, and impact level — all combinable with AND logic.
2. Default time range = "overnight" (6pm previous day → now, in the user's timezone) to serve the morning-review use case.
3. Filters encoded in URL query params: every filtered view is a shareable, bookmarkable link.
4. Per-user saved default filters (e.g., Persona B saves "my team, last 24h, pr_merged + commit_pushed").
5. Instant (<100ms) client-side filtering for already-loaded events; transparent server-side query when the requested range/filter exceeds the loaded window.
6. Extend the canonical `GET /api/v1/events` API (owned by the ingestion spec) with filter query params, cursor pagination, and supporting Postgres indexes, keeping dashboard load <2s at 10k+ events per workspace.

**Non-Goals (MVP v0.1)**
- OR logic, nested filter groups, or query builder UI.
- Free-text/full-text search over event payloads (post-MVP).
- Multiple named saved views per user (MVP = one saved default; named views in v0.2).
- Team-level shared saved filters (admin-managed presets are post-MVP).
- Filtering inside Slack digests (digest feature consumes this API but configures its own fixed window).
- Real-time re-evaluation of historical events when filter taxonomy changes.
- New action types beyond ingestion's normalized taxonomy (e.g., `deploy`, `review`, `ci_run`, `comment`). These ship only after ingestion's normalization layer emits them; the filter UI reads the enum from a shared constant so additions are zero-cost here.

---

### 3. User Stories & Personas

**Persona A — Senior dev / tech lead (multi-agent operator)**
- As a tech lead, I want the feed to default to "overnight" so my first morning glance only shows what happened while I was away.
- As a tech lead, I want to multi-select `api-server` and `web-app` repos and filter to `impact=high` so I review risky agent actions first.
- As a tech lead, I want to filter to a single agent (e.g., `claude-code`) so I can audit one agent's behavior when something looks off.
- As a tech lead, I want to copy the URL of my filtered view and paste it in Slack so a teammate sees exactly what I see.

**Persona B — Engineering manager (morning visibility)**
- As an EM, I want to save "last 24h + action types: pr_merged, commit_pushed" as my default so the dashboard opens pre-filtered every morning.
- As an EM, I want to filter by developer so I can see what each report's agents did before our 1:1.
- As an EM, I want a custom date range (e.g., last sprint) so I can pull a two-week view for retro discussion without waiting more than a couple of seconds.

**Shared**
- As any user, when no events match my filters, I want a clear empty state with a one-click "clear filters" action, not a blank screen.

---

### 4. Functional Requirements

**FR-1 — Filter bar.** A persistent filter bar renders above the activity feed with five controls: Repos (multi-select dropdown with search), Time Range (preset pills: Overnight | Last 24h | Last 7d | Custom…), Actor (multi-select of developers and agents, grouped), Action Type (multi-select over ingestion's canonical taxonomy: `pr_opened`, `pr_merged`, `pr_closed`, `commit_pushed`, `issue_opened`, `issue_closed`, `cursor_session_completed`, `devin_task_completed`, `devin_task_failed`), Impact (multi-select: `high`, `medium`, `low`).

**FR-2 — AND combination.** Active filters combine with AND across dimensions; values within one multi-select dimension combine with OR (e.g., repo IN (a,b) AND impact IN (high)).

**FR-3 — Overnight default.** With no URL params and no saved default, time range = "overnight": from 18:00 the previous calendar day in the user's stored timezone (from profile, default UTC) to now. The pill shows the resolved window on hover.

**FR-4 — Custom range.** Custom range picker accepts start/end datetimes; max span 90 days (MVP retention window); end must be ≥ start; future end clamps to now.

**FR-5 — URL as source of truth.** All active filters serialize to query params on the dashboard route (`/dashboard?repos=01J9...,01JA...&range=24h&impact=high…`). Loading a URL with params reconstructs the exact view. Changing filters updates the URL via `router.replace` (no history spam). Invalid param values are dropped with a non-blocking toast.

**FR-6 — Saved default.** "Save as my default" persists the current filter set per user. On loading `/dashboard` with no query params, the saved default is applied and reflected into the URL. "Reset to overnight" clears the saved default.

**FR-7 — Hybrid client/server filtering.** Filters apply instantly (<100ms) client-side against the loaded event window. If the requested time range or filter combination falls outside loaded data (older than oldest loaded event, or loaded page was server-filtered differently), the client issues a server query with a loading state on the feed only (filter bar stays interactive).

**FR-8 — SSE interaction.** New events arriving via SSE are evaluated against active client-side filters before insertion; non-matching events increment a muted "N hidden by filters" counter instead of appearing. Clicking the counter pill inserts the hidden events inline (each marked with an "outside filter" badge), keeps the active filters unchanged, and resets the counter to 0; subsequent non-matching SSE events begin accumulating in the counter again.

**FR-9 — Active-filter affordances.** Each non-default filter shows as a removable chip; a "Clear all" link resets to the user's default (or overnight). A result count ("142 events") renders beside the bar.

**FR-10 — Pagination.** Feed loads 50 events per page, cursor-based, infinite scroll ("Load more" fallback). Cursor is opaque and encodes `(occurred_at, id)`.

**FR-11 — Empty state.** Zero matches renders: "No events match your filters" + Clear-all button + the nearest prior matching event's date if one exists ("Last match: Jun 9").

---

### 5. API & Data Model Changes

#### 5.1 `GET /api/v1/events` (extension of the ingestion spec's canonical endpoint)

The ingestion spec owns this endpoint and its base contract; this spec adds the filter/time-range/pagination query parameters below. No new events endpoint is introduced.

Auth: session cookie (GitHub OAuth); events scoped to the caller's workspace. All ids (`events.id`, `repo_ids`, `actor_ids`) are TEXT ULIDs, per the ingestion data model.

**Query parameters**

| Param | Type | Validation | Notes |
|---|---|---|---|
| `repo_ids` | CSV of ULIDs | each must belong to workspace; max 50 | omit = all repos |
| `from` | ISO 8601 | required with `to`; ≤ now | inclusive |
| `to` | ISO 8601 | ≥ `from`; span ≤ 90d | exclusive |
| `range` | enum `overnight\|24h\|7d` | mutually exclusive with `from`/`to` (400 if both) | server resolves using `tz` |
| `tz` | IANA string | valid zone, default user profile tz | used for `overnight` |
| `actor_ids` | CSV of ULIDs | max 50 | developers and agents share the `actors` table |
| `action_types` | CSV enum | subset of ingestion's 9 types: `pr_opened,pr_merged,pr_closed,commit_pushed,issue_opened,issue_closed,cursor_session_completed,devin_task_completed,devin_task_failed` | |
| `impact` | CSV enum | `high,medium,low` | |
| `cursor` | string | opaque base64; 400 if malformed | |
| `limit` | int | 1–100, default 50 | |

**Example request**
```
GET /api/v1/events?repo_ids=01J9W3K8FZ7QH2M4N6P8R0S1TA,01J9W3K8G14XB7C9D2E4F6G8HB&range=overnight&tz=America/New_York&impact=high,medium&action_types=pr_merged,commit_pushed&limit=50
```

**200 response**
```json
{
  "events": [
    {
      "id": "01JXFG7T9V3WQK5M8N1P4R6S2D",
      "occurred_at": "2026-06-12T03:14:09Z",
      "repo": { "id": "01J9W3K8FZ7QH2M4N6P8R0S1TA", "name": "acme/api-server" },
      "actor": { "id": "01J9W3KA52BX8C1D4E7F0G3H6J", "type": "agent", "name": "claude-code", "owner_user_id": "01J9W3K9XQ2RT5V8W1Y4Z7A0BC" },
      "action_type": "pr_merged",
      "impact": "high",
      "title": "Merge PR #412: migrate auth middleware",
      "url": "https://github.com/acme/api-server/pull/412",
      "summary": "Refactored auth middleware; 14 files, +612/-488."
    }
  ],
  "page": { "next_cursor": "eyJvIjoiMjAyNi0wNi0xMlQwMzoxNDowOVoiLCJpZCI6IjAxSlhGRzdUOVYzV1FLNU04TjFQNFI2UzJEIn0", "has_more": true },
  "meta": { "total_estimate": 142, "resolved_from": "2026-06-11T22:00:00Z", "resolved_to": "2026-06-12T11:30:00Z" }
}
```

**Errors**
- `400 {"error":"validation_error","details":[{"param":"to","message":"must be >= from"}]}`
- `400` for `range` + `from/to` together, bad cursor, span >90d, unknown enum value.
- `401` no/expired session. `403` `repo_ids` includes a repo outside the workspace.

Ordering: `occurred_at DESC, id DESC` (ULIDs are lexicographically sortable, giving a stable tiebreak). Cursor = base64 JSON `{"o": "<occurred_at>", "id": "<ulid>"}`; query continues with `WHERE (occurred_at, id) < ($1, $2)`.

#### 5.2 Filter preferences

Preferences live on the single shared endpoint `PATCH /api/v1/me/preferences`, which the feed spec owns; this spec only defines the `default_filters` key and its validation.

```
GET   /api/v1/me/preferences      -> 200 { "default_filters": { ... } | null, ...other prefs }
PATCH /api/v1/me/preferences      body: { "default_filters": { "range":"24h","repo_ids":["01J9W3K8FZ7QH2M4N6P8R0S1TA"],"impact":["high"] } }
                                   -> 200 (echo) | 400 validation (same rules as /api/v1/events params)
PATCH /api/v1/me/preferences      body: { "default_filters": null }   # clears the saved default
```

#### 5.3 Database changes (Postgres)

Existing `events` table assumed (created by the ingestion feature, which owns the schema and the `action_type` taxonomy); this feature adds columns/indexes:

```sql
-- events: id TEXT (ULID) PK, workspace_id TEXT, repo_id TEXT, actor_id TEXT,
--         action_type TEXT, impact TEXT, occurred_at TIMESTAMPTZ, payload JSONB

ALTER TABLE events
  ADD CONSTRAINT events_action_type_chk CHECK (action_type IN
    ('pr_opened','pr_merged','pr_closed','commit_pushed','issue_opened','issue_closed',
     'cursor_session_completed','devin_task_completed','devin_task_failed')),
  ADD CONSTRAINT events_impact_chk CHECK (impact IN ('high','medium','low'));

-- Primary feed path: workspace + time, supports cursor keyset pagination
CREATE INDEX idx_events_ws_time ON events (workspace_id, occurred_at DESC, id DESC);
-- Common filtered paths
CREATE INDEX idx_events_ws_repo_time   ON events (workspace_id, repo_id, occurred_at DESC);
CREATE INDEX idx_events_ws_actor_time  ON events (workspace_id, actor_id, occurred_at DESC);
CREATE INDEX idx_events_ws_impact_time ON events (workspace_id, impact, occurred_at DESC);

-- user preferences
ALTER TABLE users ADD COLUMN default_filters JSONB,  -- null = overnight default
                  ADD COLUMN timezone TEXT NOT NULL DEFAULT 'UTC';
```

Pragmatic note: at MVP scale (≤ ~1M rows) `idx_events_ws_time` plus a filtered scan is sufficient; the three secondary indexes are cheap insurance. No partitioning at MVP. The `action_type` CHECK constraint mirrors ingestion's normalized enum exactly; both specs import it from a single shared constant so they cannot drift.

---

### 6. UX / UI Notes

- **Layout:** Single-row filter bar, sticky below the dashboard header; collapses to a "Filters (3)" button + bottom sheet under 768px width.
- **Time-range pills:** `Overnight · Last 24h · Last 7d · Custom`. Overnight pill tooltip: "6:00 PM yesterday → now (America/New_York)". Custom opens a dual datetime popover.
- **Multi-selects:** checkbox dropdowns with type-ahead; show count badge when collapsed ("Repos · 2"). Actor dropdown groups "Agents" above "Developers" with a robot/person icon.
- **Chips row** appears only when non-default filters are active; each chip has an `×`; trailing "Clear all".
- **Save default:** small "★ Save as default" text button at the bar's right edge; turns into "★ Default saved" with an undo toast.
- **Loading:** client-side filter changes are instant; server fetches show a skeleton on the feed list only — the filter bar never blocks. Result count updates with the response.
- **SSE hidden counter:** subtle pill at feed top: "3 new events hidden by filters — show". Clicking it reveals the hidden events inline with an "outside filter" badge on each, leaves filters unchanged, and resets the counter (per FR-8).
- **Shareability:** "Copy link" icon button next to result count copies the current URL.
- Keyboard/a11y: all dropdowns operable via keyboard; chips removable with Backspace when focused; filter state changes announced via `aria-live="polite"` result count.

---

### 7. Acceptance Criteria (Given / When / Then)

1. **Overnight default.** Given a user with no saved default and no URL params, when they open `/dashboard` at 8:00 AM in `America/New_York`, then the feed shows only events with `occurred_at` between 6:00 PM the previous day and now (NY time), and the Overnight pill is active.
2. **AND logic.** Given events exist in repos A and B with mixed impact, when the user selects repos {A} and impact {high}, then every rendered event is repo A AND impact high, and the result count equals the matching server count.
3. **URL round-trip.** Given a user sets repos to two ULIDs, range=24h, impact=high, when they copy the URL and a workspace teammate opens it in a fresh session, then the teammate sees the identical filter state and equivalent result set, within 2s page load.
4. **Saved default.** Given a user saves "last 24h + action_types=pr_merged,commit_pushed" as default, when they later open `/dashboard` with no params, then those filters are applied and reflected in the URL within the initial render.
5. **Instant client filtering.** Given 200 events are loaded, when the user toggles an impact value, then the visible list updates in <100ms with no network request (verified: no `/api/v1/events` call fired).
6. **Server fallback.** Given the loaded window covers the last 24h, when the user selects a custom range covering last month, then a server query fires, a skeleton shows on the feed only, and results render in <2s p95.
7. **Pagination stability.** Given >50 matching events and new events being inserted concurrently, when the user pages via `next_cursor` until `has_more=false`, then no event is duplicated or skipped across pages.
8. **Validation.** Given a request with `range=24h&from=2026-06-01T00:00:00Z`, when `GET /api/v1/events` is called, then the API returns 400 with `validation_error` naming the conflicting params. Same for span >90 days and unknown `action_types`.
9. **Authorization.** Given `repo_ids` containing a repo from another workspace, when the API is called, then it returns 403 and no events.
10. **SSE filtering.** Given impact=high is active, when a `low` impact event arrives via SSE, then it does not appear in the feed and the "hidden by filters" counter increments by 1. When the user clicks the counter pill, then the hidden events are inserted inline in timestamp order, each marked with an "outside filter" badge, the active filters remain unchanged, and the counter resets to 0.
11. **Empty state.** Given filters matching zero events, when results return, then the empty state with "Clear all" renders, and clicking it restores the user's default within 100ms.
12. **Invalid URL params.** Given `?impact=banana&range=24h`, when the page loads, then `impact` is dropped, a toast notes "Ignored invalid filter: impact", and `range=24h` still applies.

---

### 8. Performance, Security & Edge Cases

**Performance**
- `GET /api/v1/events` p95 < 400ms at 1M rows / 10k per workspace (keyset pagination, no OFFSET; `EXPLAIN ANALYZE` check in CI seed test). Supports the global dashboard-load <2s target.
- Client-side filter application <100ms for up to 1,000 loaded events (simple array predicate; memoized).
- `total_estimate` uses a capped `COUNT(*)` (`LIMIT 1001` subquery → "1000+") to avoid full counts on large ranges.
- SSE filter evaluation is O(1) per event; does not affect <60s event-latency target.

**Security**
- All queries hard-scoped by `workspace_id` from the session — never from client input.
- `repo_ids`/`actor_ids` validated as workspace members (403 otherwise) to prevent cross-tenant enumeration.
- All params parameterized via the query builder; CSV inputs parsed/validated as ULIDs or enum members before SQL.
- Shared URLs carry no auth — opening one requires the recipient's own session and workspace membership.
- `default_filters` JSONB validated server-side with the same schema as query params (reject unknown keys, cap array sizes) to prevent stored junk.

**Edge cases**
- DST: "overnight" resolved with IANA tz math (Luxon/`date-fns-tz`), so a 23h/25h night is handled; window is wall-clock 6 PM regardless.
- User travels / tz change: `tz` param overrides profile; profile tz editable in settings.
- Saved default references a since-disconnected repo: server drops the stale id, returns remaining filters, client toasts once and re-saves cleaned default.
- Two events with identical `occurred_at`: ULID `id` tiebreak in ordering and cursor guarantees stability.
- Clock skew on ingested events (GitHub timestamp vs ingest time): filter on `occurred_at` (provider timestamp); events arriving late but inside the window appear via SSE/refresh.
- 90-day custom range over a large workspace: enforced span cap + pagination keeps responses bounded.
- All filters deselected within a dimension = dimension omitted (treated as "all"), never an empty IN () query.

---

### 9. Implementation Phases (solo founder, fits Week 2 alongside other MVP features)

| Phase | Scope | Est. |
|---|---|---|
| **P1 — API params + indexes** | Filter/range/pagination params on `GET /api/v1/events` with full validation, keyset cursor pagination, tz-aware `overnight` resolution; migrations for check constraints + 4 indexes; seed script + `EXPLAIN` sanity check; integration tests for validation/authz/pagination. | 1.5 days |
| **P2 — Filter bar UI + URL state** | Filter bar components (pills, multi-selects, custom range popover), URL serialization/parsing with invalid-param handling, chips + clear-all, result count, empty state, client-side instant filtering + server fallback logic. | 2 days |
| **P3 — Preferences + SSE + polish** | `default_filters` key on `GET/PATCH /api/v1/me/preferences`, save-default UX, SSE filter gate + hidden counter + reveal-with-badge behavior, mobile collapse, a11y pass, copy-link button. | 1 day |
| **Buffer** | Cross-feature integration (feed + digest consume the API), bugfix. | 0.5 day |

**Total: ~5 days.** P1 is on the critical path for the feed and Slack digest features and ships first.

---

### 10. Success Metrics

**Activation / engagement**
- ≥70% of weekly-active users interact with at least one filter control in their first week (validates the feed-is-noise hypothesis).
- ≥40% of Persona-B users (multi-developer workspaces) save a default filter within 14 days of signup.
- ≥15% of active users open a shared filter URL (received, not self-generated) per month — proxy for team adoption / viral loop.
- Median time from dashboard open to first event click <30s during 7–10 AM local ("two-minute morning review" promise).

**Performance / reliability (instrumented)**
- `GET /api/v1/events` p95 <400ms; dashboard load with saved default applied <2s p95; 99.5% endpoint availability.
- Client-side filter application p95 <100ms (web-vitals custom mark).
- 0 cross-workspace data exposures (authz test suite + manual pen check).

**Guardrails**
- Empty-state rate <10% of filter applications (higher means filter defaults or taxonomy are wrong).
- Invalid-URL-param toast rate <2% of loads (higher means serialization bugs or stale shared links).

---

## Slack Alert Notifications

### 1. Overview

Slack Alert Notifications is the "before you open a browser" layer of Dashy.ai. The dashboard answers "what did my agents do?" — this feature answers "what do I need to know right now?" by pushing critical agent events (merges to protected/default branches, failed agent runs) into the Slack channels where teams already live. Users paste a Slack incoming-webhook URL, map rules to channels per repo, and receive Block Kit-formatted alerts within 2 minutes of the source event. Built-in digest collapse prevents channel spam when agents are highly active. This is a Must-Have MVP v0.1 (Week 2) integration: for Dashy.ai's core promise — visibility into autonomous AI agent activity — to be credible, the riskiest events cannot wait for someone to check a dashboard.

### 2. Problem Statement & User Stories

**Problem.** AI coding agents (Claude Code, Devin, Copilot Workspace, etc.) operate asynchronously and increasingly autonomously. The highest-risk moments — an agent merging to `main`, an agent run failing mid-task — happen while no human is watching. Today users discover these hours later via GitHub email noise or by manually scanning repos. Dashboards are pull; risk events need push.

**User stories.**

- **Persona A — Senior developer / tech lead managing multiple AI agents:**
  - "As a tech lead, I want a Slack alert within 2 minutes whenever any agent merges to a protected or default branch, so I can review the change before it propagates."
  - "As a tech lead, I want failed agent runs alerted to my `#agent-alerts` channel so I can restart or fix the agent without polling the dashboard."
  - "As a tech lead, I want alerts routed per repo (e.g., `repo-api` → `#backend-alerts`) so the right owner sees them."
- **Persona B — Engineering manager wanting morning team visibility:**
  - "As an EM, I want critical agent events surfaced in our team channel so the whole team has ambient awareness of what the agents shipped overnight."
  - "As an EM, I want bursts of alerts collapsed into a single summary so the channel stays readable and the team doesn't mute it."

### 3. Goals & Non-Goals

**Goals**
- Deliver Slack alerts for qualifying events with end-to-end latency <2 minutes (p95) from source event ingestion.
- Default rule set that works with zero configuration beyond pasting a webhook URL: alert on (a) any merge to the repo's default branch performed by an agent (derived from ingestion's `pr_merged` events), (b) failed agent runs where the source exposes run status (MVP: Devin task failures via ingestion's `devin_task_failed` events).
- Per-repo/per-project channel routing via multiple webhook URLs.
- Block Kit messages containing: agent name, action, repo, PR link, impact summary (files changed / additions / deletions).
- Anti-spam: >5 alerts matching the same rule+channel within 5 minutes collapse into one digest summary message.
- Setup in <3 minutes: paste webhook URL → "Send test message" → map rules.

**Non-Goals (MVP)**
- Slack OAuth app / bot token, slash commands, interactive buttons, threads, or two-way actions (acknowledge, rerun agent). Incoming webhooks only.
- Microsoft Teams, Discord, email, SMS channels.
- Per-user DM routing or @-mention escalation policies.
- Custom message templates or user-defined event types beyond the rule toggles shipped.
- Alert history UI beyond a simple delivery log table.
- GitHub Actions / check-run failure alerts — ingestion does not ingest `check_run` events in MVP; revisit when/if check-run ingestion is added to the ingestion spec's scope.

### 4. User Experience & Flows

**Flow 1 — Setup (Settings → Integrations → Slack)**
1. User clicks "Add Slack webhook". Modal: name field (e.g., "Backend alerts"), webhook URL field with inline validation (`https://hooks.slack.com/services/...`).
2. User clicks **Send test message**. Dashy.ai posts a Block Kit test message; UI shows success (green check) or the Slack error (e.g., `invalid_webhook`, 404) inline.
3. Webhook saved. URL is stored encrypted and displayed masked (`https://hooks.slack.com/services/T0…/•••`).

Note: the onboarding wizard's Slack step (onboarding spec, step 5) is a thin client of this flow — it calls this spec's `POST /api/integrations/slack/webhooks` and test endpoints. This spec is the single owner of Slack webhook storage and URL validation; Slack webhooks are **not** stored in onboarding's `integrations` table (remove `'slack'` from onboarding's `integrations.provider` CHECK constraint).

**Flow 2 — Rule configuration**
1. On the Slack integration page, a rules table shows one default rule per connected repo: event types `protected_branch_merge` + `agent_run_failed`, target = first webhook added.
2. User can per rule: toggle event types, change target webhook, set repo scope (specific repo or "All repos"), or disable the rule.
3. Empty state (no webhook yet): explainer card with screenshot of a sample alert and a "Create a Slack webhook" doc link.

**Flow 3 — Receiving an alert**
1. Agent merges PR #142 to `main` in `acme/api`. Dashy.ai's GitHub webhook ingestion (existing event pipeline) records the event with `action_type = 'pr_merged'` and `actor_kind = 'agent'` (the attribution spec's canonical agent flag).
2. Rule engine matches the event (base branch == repo default branch, see FR-4); alert is enqueued and delivered to Slack in <2 min.
3. Message (Block Kit): header "🤖 Agent merged to protected branch", fields — Agent: `claude-code`, Repo: `acme/api`, Branch: `main`, Action: "Merged PR #142: Add rate limiting middleware", Impact: "12 files, +480 / −36", button-style link "View PR", context line "Dashy.ai • 14:03 UTC".

**Flow 4 — Digest collapse**
1. Six qualifying events hit the same rule+channel within 5 minutes. Alerts 1–5 deliver normally; on alert 6 the window flips to digest mode.
2. Further alerts are buffered. When the 5-minute window closes, one summary posts: "🤖 8 agent events in the last 5 min in `acme/api` — 6 merges to main, 2 failed runs" with a "View in Dashy.ai" link to the filtered feed.

**Flow 5 — Delivery failure**
- On non-2xx from Slack: retry up to 3 times with exponential backoff (30s, 2m, 8m). After final failure, mark the webhook `status = failing` and show a warning banner on the integration page ("Last delivery failed: 404 — webhook may be revoked").

### 5. Functional Requirements

- **FR-1** Users can register 1–10 Slack incoming-webhook URLs per workspace; URLs validated against `^https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/\w+$` and encrypted at rest (AES-256-GCM, key in env var). This spec is the canonical owner of both the validation regex and webhook storage; the onboarding wizard reuses this endpoint and regex rather than defining its own.
- **FR-2** "Send test message" posts a real Block Kit message via the saved/pending URL and surfaces Slack's response in the UI.
- **FR-3** Rule engine evaluates every ingested event against active rules. Match criteria: event maps to one of the rule's enabled alert types (per FR-4) AND (rule repo scope = event repo OR scope = all).
- **FR-4** Supported alert types (MVP), defined strictly in terms of ingestion's canonical `action_type` enum and attribution's canonical `actor_kind` field:
  - `protected_branch_merge`: events with `action_type = 'pr_merged'` AND PR base branch == the repo's default branch AND `actor_kind = 'agent'`. **Dependency:** ingestion must include the PR base branch and the repo default branch in the event `payload_ref` for `pr_merged` events (small additive change to the ingestion spec).
  - `agent_run_failed`: events with `action_type = 'devin_task_failed'` only, for MVP. GitHub Actions check failures are out of scope because ingestion does not ingest `check_run` events (see Non-Goals).
- **FR-5** A default rule (both alert types, all repos) is auto-created when the first webhook is saved.
- **FR-6** Alert messages are Slack Block Kit JSON: header block, section with fields (agent, repo, branch, action), impact context, PR link button. Plaintext `text` fallback included for notifications.
- **FR-7** Latency: event ingestion → Slack 2xx response in <120s p95, measured and logged (`delivered_at - event_received_at`).
- **FR-8** Rate limiting: per (rule_id, webhook_id) sliding 5-minute window; alerts 1–5 deliver individually, ≥6 buffer into a single digest posted at window close. Digest links to the Dashy.ai feed filtered to those events.
- **FR-9** Delivery retries: 3 attempts, exponential backoff; permanent failure flips webhook to `failing` and surfaces a UI banner. A successful later delivery or test message resets status to `active`.
- **FR-10** Every delivery attempt is recorded in `slack_deliveries` for debugging (status, attempt count, latency, Slack response code).
- **FR-11** Disabling a rule or webhook stops deliveries immediately (checked at dequeue time, not just enqueue).

### 6. Technical Design

**Architecture.** Reuse the existing event pipeline: GitHub webhooks → Node API ingestion → `events` table → SSE fan-out to dashboards. Slack alerting adds a post-ingestion hook: after an event row is committed, `evaluateSlackRules(event)` runs in-process, maps the event to an alert type (FR-4: `action_type='pr_merged'` + base==default branch + `actor_kind='agent'` → `protected_branch_merge`; `action_type='devin_task_failed'` → `agent_run_failed`), matches rules via one indexed query, and inserts rows into `slack_alert_queue`. A worker loop (a BullMQ repeatable job every 10s on the Railway Node process — same job runner as ingestion) claims due rows with `SELECT ... FOR UPDATE SKIP LOCKED`, applies the rate-limit window check, renders Block Kit, and POSTs to Slack with a 5s timeout.

**Rate-limit/digest logic.** Counter = `SELECT count(*) FROM slack_deliveries WHERE rule_id=$1 AND webhook_id=$2 AND created_at > now() - interval '5 minutes' AND status='delivered'`. If ≥5, set queue row `digest_group = date_trunc(window)`; a digest row per group is flushed when `now() > window_end`.

**Block Kit payload (rendered example).**
```json
{
  "text": "Agent claude-code merged PR #142 to main in acme/api",
  "blocks": [
    { "type": "header", "text": { "type": "plain_text", "text": "🤖 Agent merged to protected branch" } },
    { "type": "section", "fields": [
      { "type": "mrkdwn", "text": "*Agent:*\nclaude-code" },
      { "type": "mrkdwn", "text": "*Repo:*\nacme/api" },
      { "type": "mrkdwn", "text": "*Branch:*\n`main`" },
      { "type": "mrkdwn", "text": "*Impact:*\n12 files, +480 / −36" }
    ]},
    { "type": "section",
      "text": { "type": "mrkdwn", "text": "*Merged PR #142:* Add rate limiting middleware" },
      "accessory": { "type": "button", "text": { "type": "plain_text", "text": "View PR" }, "url": "https://github.com/acme/api/pull/142" } },
    { "type": "context", "elements": [ { "type": "mrkdwn", "text": "Dashy.ai • 2026-06-12 14:03 UTC" } ] }
  ]
}
```

**Security.** Webhook URLs encrypted at rest; never returned in full by the API (masked). All endpoints scoped to the authenticated user's workspace (GitHub OAuth session). Outbound POSTs only to `hooks.slack.com` (host allowlist prevents SSRF via crafted URLs).

**Failure modes.** Slack down → retries absorb up to ~10 min outage; queue rows older than 30 min are marked `expired` (stale alerts are worse than none). Vercel/Railway deploy restarts → queue is Postgres-backed, nothing lost; `SKIP LOCKED` prevents double-claim.

### 7. API & Data Model

**Endpoints (Node API, all require session auth; 401 if unauthenticated, 403 if resource not in user's workspace).**

`POST /api/integrations/slack/webhooks` — create webhook. (Also called by the onboarding wizard's Slack step — single storage path for Slack webhooks.)
Request: `{ "name": "Backend alerts", "url": "https://hooks.slack.com/services/T024B/B0XYZ/abc123" }`
Validation: `name` 1–60 chars; `url` matches Slack regex (FR-1); max 10 webhooks (409 on excess).
201: `{ "id": "wh_8f2a", "name": "Backend alerts", "url_masked": "https://hooks.slack.com/services/T024B/•••", "status": "active", "created_at": "2026-06-12T14:00:00Z" }`
400 on validation failure: `{ "error": "invalid_url", "message": "Must be a Slack incoming webhook URL" }`

`POST /api/integrations/slack/webhooks/:id/test` — send test message.
200: `{ "delivered": true, "latency_ms": 412 }` · 502 if Slack rejects: `{ "delivered": false, "slack_status": 404, "slack_body": "no_service" }`

`GET /api/integrations/slack/webhooks` → 200 `{ "webhooks": [ ... ] }` (masked URLs, status, `last_delivery_at`).
`DELETE /api/integrations/slack/webhooks/:id` → 204 (cascades: rules retargeted to null and disabled).

`POST /api/integrations/slack/rules` — create/replace rule.
Request: `{ "webhook_id": "wh_8f2a", "repo_id": "wr_42", "event_types": ["protected_branch_merge", "agent_run_failed"], "enabled": true }` (`repo_id: null` = all repos; `repo_id` references `workspace_repos(id)` from the onboarding spec).
Validation: `event_types` non-empty subset of the two supported types; `webhook_id` must exist and be owned. 201 with the rule object.
`PATCH /api/integrations/slack/rules/:id` — partial update (toggle `enabled`, change `webhook_id`, `event_types`). 200.
`GET /api/integrations/slack/rules` → 200 rule list joined with repo + webhook names.
`GET /api/integrations/slack/deliveries?limit=50` → 200 recent delivery log for the warning banner / debugging.

**Database (Postgres).**

```sql
CREATE TABLE slack_webhooks (
  id            TEXT PRIMARY KEY DEFAULT ('wh_' || substr(gen_random_uuid()::text,1,8)),
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  url_encrypted BYTEA NOT NULL,
  url_masked    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active',  -- active | failing
  last_delivery_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_slack_webhooks_workspace ON slack_webhooks(workspace_id);

CREATE TABLE slack_alert_rules (
  id           TEXT PRIMARY KEY DEFAULT ('rule_' || substr(gen_random_uuid()::text,1,8)),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  webhook_id   TEXT REFERENCES slack_webhooks(id) ON DELETE SET NULL,
  repo_id      TEXT REFERENCES workspace_repos(id) ON DELETE CASCADE,  -- NULL = all repos (workspace_repos defined in onboarding spec)
  event_types  TEXT[] NOT NULL,
  enabled      BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_slack_rules_match ON slack_alert_rules(workspace_id, enabled) WHERE enabled;

CREATE TABLE slack_alert_queue (
  id           BIGSERIAL PRIMARY KEY,
  rule_id      TEXT NOT NULL REFERENCES slack_alert_rules(id) ON DELETE CASCADE,
  webhook_id   TEXT NOT NULL REFERENCES slack_webhooks(id) ON DELETE CASCADE,
  event_id     TEXT NOT NULL REFERENCES events(id),
  status       TEXT NOT NULL DEFAULT 'pending', -- pending | digesting | delivered | failed | expired
  digest_group TIMESTAMPTZ,                     -- window start when collapsed
  attempts     SMALLINT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_slack_queue_due ON slack_alert_queue(next_attempt_at) WHERE status IN ('pending','digesting');

CREATE TABLE slack_deliveries (
  id          BIGSERIAL PRIMARY KEY,
  webhook_id  TEXT NOT NULL,
  rule_id     TEXT,
  event_id    TEXT,
  status      TEXT NOT NULL,            -- delivered | failed
  slack_status_code SMALLINT,
  latency_ms  INTEGER,
  is_digest   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_slack_deliveries_window ON slack_deliveries(rule_id, webhook_id, created_at);
```

### 8. Acceptance Criteria

1. **Given** a saved valid webhook and the default rule, **when** an event with `action_type = 'pr_merged'`, `actor_kind = 'agent'`, and base branch == default branch is ingested, **then** a Block Kit message containing agent name, repo, branch, PR title, PR link, and impact stats is delivered to Slack within 120 seconds (p95) of Dashy.ai receiving the GitHub event.
2. **Given** the setup modal, **when** the user enters `https://example.com/hook`, **then** the save button is disabled and an inline error "Must be a Slack incoming webhook URL" is shown; the API also rejects it with 400 `invalid_url`.
3. **Given** a pending webhook URL, **when** the user clicks "Send test message", **then** a test message appears in the Slack channel and the UI shows success within 5 seconds, or shows the Slack status code on failure.
4. **Given** a rule scoped to repo `acme/api` targeting webhook A, **when** an agent merge occurs in `acme/web`, **then** no message is sent to webhook A.
5. **Given** an active rule+channel, **when** 8 qualifying events occur within 5 minutes, **then** exactly 5 individual alerts plus exactly 1 digest message ("8 agent events…", count accurate, link to filtered feed) are delivered — never more than 6 total messages for that window.
6. **Given** Slack returns 500 on delivery, **when** retries occur, **then** the message is retried at ~30s/2m/8m and, if a retry succeeds, exactly one copy is posted (no duplicates).
7. **Given** Slack returns 404 (revoked webhook) on all attempts, **when** the user opens Settings → Integrations → Slack, **then** the webhook shows status "failing" with the last error, and no further alerts are attempted until a successful test message resets it.
8. **Given** a rule is disabled while alerts are queued, **when** the worker processes those rows, **then** they are dropped (status `expired`/skipped) and nothing posts to Slack.
9. **Given** a connected Devin source, **when** an event with `action_type = 'devin_task_failed'` is ingested, **then** an `agent_run_failed` alert is delivered identifying the agent, repo, and failure context within 120 seconds.
10. **Given** any API request for webhook data, **when** the response is inspected, **then** the full webhook URL never appears — only the masked form.
11. **Given** an event with `action_type = 'pr_merged'` and `actor_kind = 'human'`, or a `pr_merged` event whose base branch is not the default branch, **then** no `protected_branch_merge` alert is sent.

### 9. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Agent attribution is wrong (human merge flagged as agent, or agent missed) → false/missed alerts erode trust | Medium | Depends on the shared agent-attribution spec (bot accounts, commit author patterns, agent session linkage). Alerts only fire on events with `actor_kind = 'agent'` — the same canonical field already shown in the feed; mislabels are fixed once, centrally. Digest link lets users verify in-app. |
| Ingestion doesn't ship the `payload_ref` base/default-branch addition for `pr_merged` events → `protected_branch_merge` can't be evaluated | Medium | Small additive change agreed with the ingestion spec; tracked as a hard dependency (Section 10). Fallback: alert on all agent `pr_merged` events (noisier but functional) until the field lands. |
| Channel spam → users mute the channel and the feature dies | High impact | Digest collapse (>5/5min) is in scope for v0.1, not deferred; per-repo routing reduces noise; rules are toggleable per event type. |
| Slack webhook revocation goes unnoticed → silent alert loss | Medium | `failing` status + persistent banner; delivery log; (post-MVP: email fallback notice). |
| GitHub webhook delivery lag eats the 2-min budget | Medium | Measure end-to-end from `event_received_at`; worker poll interval 10s leaves >100s headroom; latency logged per delivery for monitoring against the <2min target. |
| Solo founder scope creep (Slack OAuth app, interactive buttons, check_run ingestion) | High | Hard non-goals; incoming webhooks only; `agent_run_failed` limited to `devin_task_failed`; Postgres-backed alert table drained by the existing BullMQ runner — no new infra beyond the Redis already in the stack. |
| Encrypted URL key management on Vercel/Railway | Low | Single AES-256-GCM env key, documented rotation procedure; URLs are low-blast-radius secrets (post-only). |
| Process restart drops in-flight digests | Low | Queue and digest windows are Postgres state; worker is stateless and resumes on boot. |

### 10. Implementation Plan & Estimates

Total: **3.5 days**, fitting MVP v0.1 Week 2 alongside the other 5 MVP features.

| Phase | Work | Est. |
|---|---|---|
| 1. Data + API | Migrations for 4 tables; webhook CRUD + test endpoint + URL encryption/masking; rules CRUD; validation + auth scoping | 1.0 day |
| 2. Rule engine + delivery worker | Post-ingestion event→alert-type mapping (`pr_merged`+default-branch+`actor_kind='agent'`, `devin_task_failed`) and rule matching; Postgres queue with `SKIP LOCKED` poller; Block Kit renderer for both alert types; retries/backoff; delivery logging; digest collapse window | 1.0 day |
| 3. Settings UI | Integrations page: webhook list/add modal with inline validation, test-message button, masked URLs; rules table with toggles and channel mapping; failing-webhook banner; empty state | 1.0 day |
| 4. QA + hardening | End-to-end test against a real Slack workspace; latency measurement; digest burst test (script firing 10 events); revoked-webhook and restart scenarios; acceptance criteria pass | 0.5 day |

**Dependencies:** core GitHub event ingestion (Week 1) with the additive change to include PR base branch + repo default branch in `payload_ref` for `pr_merged` events; agent-attribution spec's `actor_kind` field; ingestion's `devin_task_failed` action type; onboarding spec's `workspace_repos` table (rules FK target); onboarding spec change: wizard step 5 calls `POST /api/integrations/slack/webhooks` and `'slack'` is removed from onboarding's `integrations.provider` CHECK constraint; `workspaces`/`events` tables; settings page shell. **Launch gate:** all 11 acceptance criteria pass; p95 delivery latency <120s over a 24h dogfood run on the founder's own repos.

---

## Team Onboarding & GitHub OAuth

**Product:** Dashy.ai | **Category:** Core | **Priority:** Must-Have | **Target:** MVP v0.1 (Week 2)

### 1. Overview & Problem Statement

Dashy.ai gives engineering teams a real-time dashboard of human and AI-agent (Cursor, Devin) coding activity. None of that value materializes until a team is connected: authenticated, repos selected, webhooks installed, and a dashboard showing data. This feature is the signup-to-first-value flow, targeting **under 5 minutes from "Sign in with GitHub" to a populated dashboard**.

Onboarding owns the *flow* (auth, workspace, wizard UX). The **Event Ingestion feature is the single owner** of webhook registration, the webhook receiver endpoint (`/api/v1/webhooks/github`), event normalization, dedup, and connect-time backfill. Onboarding invokes ingestion's APIs — it never installs hooks or writes events itself.

Problems solved:
- **Cold-start emptiness:** A new dashboard with zero events kills activation. We trigger ingestion's connect-time backfill of the last 24h of GitHub activity immediately so the first screen is never empty. (Ingestion's backfill window is standardized to **24h** — sufficient for first-value; the previously specced 7-day window is dropped to keep backfill fast and within rate limits.)
- **Trust friction:** Developers are skeptical of GitHub OAuth scope grabs. We request minimal scopes, encrypt tokens at rest, and store code *metadata* only — never code content (GDPR-relevant commitment).
- **Team structure:** Persona B (engineering manager) needs team-wide visibility, so onboarding must create a workspace with members and admin/member roles. (Billing, plans, and seat enforcement are explicitly out of MVP; pilot teams are free.)

### 2. Goals & Non-Goals

**Goals**
- G1: Median time from OAuth start to populated dashboard < 5 minutes; p90 < 8 minutes.
- G2: ≥ 80% of users who start OAuth complete repo selection; ≥ 70% reach the dashboard.
- G3: First dashboard view shows ≥ 1 event for any team with GitHub activity in the prior 24h.
- G4: Zero plaintext tokens anywhere (DB, logs, error reports).

**Non-Goals (MVP)**
- Payment/checkout, plans, plan enforcement, seat counting/billing logic, trials (pilot teams free).
- SSO/SAML, email+password auth, GitHub Enterprise Server.
- Granular RBAC beyond admin/member; member invitation via email blast (invite link only).
- GitLab/Bitbucket support.
- GitHub App installation model (decided: **OAuth App for MVP**, see §8; GitHub App migration is post-MVP).
- Invite-link expiry windows (links are non-expiring but admin-revocable in MVP).

### 3. Personas & User Stories

**Persona A — Senior dev / tech lead running multiple AI agents**
- A1: As a tech lead, I sign in with GitHub and connect my org's repos in a few clicks so my agents' PRs and commits appear in one dashboard.
- A2: As a tech lead, I optionally paste Cursor/Devin API credentials so agent sessions are correlated with GitHub events.
- A3: As a tech lead, I want to see exactly which OAuth scopes Dashy.ai requests and confirm it never reads code content.

**Persona B — Engineering manager**
- B1: As an EM, I create a workspace and invite my team via a link so everyone shows up in the morning view.
- B2: As an EM (admin), I connect a Slack incoming webhook during onboarding so blocked-agent alerts reach our channel within 2 minutes.
- B3: As an EM, when I first land on the dashboard I see the last 24 hours of team activity immediately, not an empty state.

### 4. UX Flow & Requirements

**Onboarding wizard (5 steps, steps 4–5 skippable):**

1. **Sign in with GitHub** — Single CTA. Scope explainer panel lists requested OAuth App scopes (`read:user`, `user:email`, `read:org`, `repo`, `admin:repo_hook` — see §8) with plain-English rationale and the "metadata only, never code content" pledge.
2. **Create workspace** — Pre-filled name from GitHub org/login; user becomes `admin`. Invite link generated (copyable; non-expiring, revocable by admin).
3. **Select org & repos** — Org picker, repo multi-select with search, "select all" capped at 50 repos in MVP. On confirm, onboarding calls **ingestion's repo-registration API**, which installs webhooks per repo (progress indicator per repo; partial failures shown inline with retry). Subscribed event types are ingestion's MVP set: `pull_request`, `push`, `issues`.
4. **Connect AI agents (optional)** — Fields for Cursor API key and/or Devin API key. "Skip for now" prominent. Keys validated with a live test call before save; stored encrypted.
5. **Connect Slack (optional)** — Paste Slack incoming-webhook URL; "Send test message" button; skip allowed.

**Finish → Dashboard:** On wizard completion, the API invokes **ingestion's backfill API** for a 24h backfill (PRs, pushes, issues from selected repos). The dashboard route renders within **<2s** with a skeleton, streams backfilled events via SSE as they land, and shows a one-time "Backfilling last 24 hours…" banner until the job completes (target < 60s for ≤ 20 repos).

**Member join flow:** Invitee opens invite link → GitHub OAuth → lands directly in the workspace dashboard as `member` (no wizard).

**Edge/error states:** OAuth denial → return to step 1 with explanation; webhook install failure (no admin rights on repo) → repo flagged "needs a repo admin," onboarding continues; invalid agent key → inline error, can skip; revoked invite link → "ask your admin for a new link."

### 5. Functional Requirements

- FR1: GitHub OAuth (web flow) with `state` CSRF parameter; create-or-login user keyed on GitHub user ID.
- FR2: Workspace creation; creator gets role `admin`; exactly one workspace per onboarding (multi-workspace later).
- FR3: Roles: `admin` (manage repos, integrations, invites, members) and `member` (view). Enforced server-side on every mutating endpoint.
- FR4: Repo selection delegates to **ingestion's webhook registration** (`POST /repos/.../hooks` via the user's OAuth token, per ingestion FR-1), subscribing to ingestion's event set: `pull_request`, `push`, `issues`. Ingestion owns the receiver at `POST /api/v1/webhooks/github`, per-workspace webhook secret, and HMAC signature verification. Onboarding only records per-repo install status returned by ingestion.
- FR5: 24h backfill triggered at onboarding completion via ingestion's backfill API; idempotent — ingestion dedups via its `dedup_key` (`uq_events_dedup` unique constraint), so re-runs don't duplicate events.
- FR6: Optional Cursor/Devin credentials validated then stored AES-256-GCM encrypted; never returned by any API (write-only; status flag only).
- FR7: Optional Slack webhook URL stored encrypted; test-message endpoint.
- FR8: Invite links: random 32-byte token, non-expiring, revocable by admin.
- FR9: GDPR posture: persist commit/PR metadata (SHAs, titles, file counts, line counts, timestamps, authors) only; diff/patch content is never stored. Workspace delete cascades all data and uninstalls webhooks.

### 6. API Specification

All endpoints under the Node API; session via httpOnly secure cookie (signed JWT). Auth required unless noted.

**`GET /api/auth/github/start`** (no auth) → 302 to GitHub authorize URL with `state` stored in a short-lived cookie.

**`GET /api/auth/github/callback?code=...&state=...`** (no auth)
- Validates `state` (else `403 {"error":"invalid_state"}`), exchanges code, upserts user, sets session cookie, 302 → `/onboarding` (new) or `/dashboard` (returning).
- `502 {"error":"github_unavailable"}` on GitHub token-exchange failure.

**`POST /api/workspaces`**
```json
{ "name": "Acme Engineering" }
```
- Validation: `name` 2–60 chars, required. → `201`
```json
{ "id": "ws_8f2k", "name": "Acme Engineering", "role": "admin",
  "invite_url": "https://app.dashy.ai/join/inv_Zk29xQ...", "created_at": "2026-06-12T09:01:00Z" }
```
- `409 {"error":"workspace_exists"}` if user already owns one (MVP limit).

**`GET /api/github/orgs`** → `200 [{"login":"acme","avatar_url":"..."}]`

**`GET /api/github/orgs/:org/repos?query=api&page=1`** → `200 {"repos":[{"id":812345,"full_name":"acme/api","private":true,"default_branch":"main"}],"has_more":false}`

**`POST /api/workspaces/:wsId/repos`** (admin only, else `403 {"error":"forbidden"}`)
```json
{ "repos": [{ "github_repo_id": 812345, "full_name": "acme/api" }] }
```
- Validation: 1–50 repos; each must be visible to caller's token. Internally calls ingestion's webhook-registration API per repo. → `200`
```json
{ "results": [
  { "github_repo_id": 812345, "status": "webhook_installed" },
  { "github_repo_id": 812399, "status": "failed", "error": "needs_repo_admin" } ] }
```

**`POST /api/workspaces/:wsId/integrations/agent`** (admin)
```json
{ "provider": "cursor", "api_key": "sk-cur-..." }
```
- `provider ∈ {cursor, devin}`; key validated live. → `201 {"provider":"cursor","status":"connected","last4":"9x2a"}`
- `422 {"error":"invalid_credentials"}` if validation call fails.

**`POST /api/workspaces/:wsId/integrations/slack`** (admin)
```json
{ "webhook_url": "https://hooks.slack.com/services/T000/B000/XXXX" }
```
- Validation: must match `https://hooks.slack.com/services/...`. → `201 {"status":"connected"}`; companion `POST .../slack/test` → `200 {"delivered":true}`.

**`POST /api/workspaces/:wsId/onboarding/complete`** → `202 {"backfill_job_id":"job_77a1","status":"queued"}` — invokes ingestion's 24h backfill API; idempotent (returns existing job).

**`POST /api/invites/:token/accept`** → `200 {"workspace_id":"ws_8f2k","role":"member"}`; `410 {"error":"invite_revoked"}`; `409 {"error":"already_member"}`.

**Webhook receiver:** owned by the Event Ingestion feature at **`POST /api/v1/webhooks/github`** (no session; HMAC `X-Hub-Signature-256` verified, else `401`) → `202`. Not defined here; see ingestion spec.

### 7. Data Model & Database Changes

Postgres. New tables:

```sql
CREATE TABLE users (
  id            TEXT PRIMARY KEY,            -- usr_*
  github_id     BIGINT UNIQUE NOT NULL,
  github_login  TEXT NOT NULL,
  email         TEXT,
  avatar_url    TEXT,
  gh_token_enc  BYTEA NOT NULL,              -- AES-256-GCM; key in env/KMS
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workspaces (
  id              TEXT PRIMARY KEY,          -- ws_*
  name            TEXT NOT NULL,
  webhook_secret  TEXT NOT NULL,
  onboarded_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK (role IN ('admin','member')),
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX idx_members_user ON workspace_members(user_id);

CREATE TABLE workspace_repos (
  id              TEXT PRIMARY KEY,          -- repo_*
  workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  github_repo_id  BIGINT NOT NULL,
  full_name       TEXT NOT NULL,
  webhook_id      BIGINT,
  webhook_status  TEXT NOT NULL DEFAULT 'pending',  -- pending|installed|failed
  UNIQUE (workspace_id, github_repo_id)
);
CREATE INDEX idx_repos_ws ON workspace_repos(workspace_id);

CREATE TABLE integrations (
  id             TEXT PRIMARY KEY,
  workspace_id   TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider       TEXT NOT NULL CHECK (provider IN ('cursor','devin','slack')),
  credential_enc BYTEA NOT NULL,
  status         TEXT NOT NULL DEFAULT 'connected',
  UNIQUE (workspace_id, provider)
);

CREATE TABLE invites (
  token        TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  revoked_at   TIMESTAMPTZ
);

CREATE TABLE backfill_jobs (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'queued', -- queued|running|done|failed
  started_at   TIMESTAMPTZ, finished_at TIMESTAMPTZ
);
```

Events land in the shared `events` table (owned by the Event Ingestion feature) deduped via ingestion's **`uq_events_dedup` unique constraint on `(workspace_id, dedup_key)`** — this single dedup key covers both webhook and backfill paths. No diff/patch column exists by design. Team-size can be derived with `COUNT(*)` on `workspace_members` when billing ships post-MVP — no seat-count column or maintenance logic in MVP.

### 8. Security, Privacy & Compliance

- **Auth model — decided for MVP:** GitHub **OAuth App** with scopes `read:user`, `user:email`, `read:org`, `repo`, and `admin:repo_hook` (required for ingestion's `POST /repos/.../hooks` webhook creation; surfaced honestly in the scope explainer). A GitHub App (finer-grained permissions, org-level install) is recorded as a **post-MVP migration**, not an open question — OAuth App is the Week 2 path.
- **Encryption at rest:** all tokens/keys AES-256-GCM with a 32-byte key from env (Railway secret); ciphertext in `BYTEA`; per-record random nonce. Keys never serialized to logs/Sentry (redaction middleware on `api_key`, `token`, `webhook_url`).
- **Webhook integrity:** HMAC-SHA256 signature check with per-workspace secret, enforced by ingestion's receiver; unsigned payloads rejected.
- **Sessions:** httpOnly, Secure, SameSite=Lax cookie; 30-day expiry; logout clears server-side session record.
- **GDPR:** store code metadata only, never code content; workspace deletion = cascade delete + webhook uninstall within 24h; data processing note in privacy policy.

### 9. Acceptance Criteria

- **AC1 (happy path):** Given a new GitHub user, when they complete OAuth, name a workspace, select 5 repos, and skip optional steps, then they reach a dashboard showing ≥1 backfilled event within 5 minutes total and dashboard first paint < 2s.
- **AC2 (backfill):** Given a workspace with ≤20 repos active in the last 24h, when onboarding completes, then ingestion's 24h backfill job finishes within 60s and events appear via SSE without page reload.
- **AC3 (webhooks):** Given webhooks installed via ingestion, when a PR is opened on a selected repo, then the event appears on the dashboard within 60s.
- **AC4 (Slack):** Given a connected Slack webhook, when "Send test message" is clicked, then the message arrives in Slack within 2 minutes (target <10s) and the API returns `200 {"delivered":true}`.
- **AC5 (roles):** Given a `member`, when they call `POST /api/workspaces/:id/repos`, then the API returns `403 forbidden` and no webhook is created.
- **AC6 (invites):** Given a valid invite link, when a new user accepts it, then they join as `member`; given a revoked link, the API returns `410 invite_revoked`.
- **AC7 (token safety):** Given any API response, log line, or error report, then no plaintext GitHub token, agent key, or Slack URL ever appears (verified by automated grep test in CI).
- **AC8 (partial failure):** Given a repo where the user lacks admin rights, when webhook install fails, then that repo shows `failed: needs_repo_admin`, other repos install, and onboarding still completes.
- **AC9 (OAuth abuse):** Given a callback with a mismatched `state`, then the API returns 403 and no session is created.
- **AC10 (idempotent backfill):** Given `onboarding/complete` called twice, then exactly one ingestion job runs and no duplicate events are stored (enforced by `uq_events_dedup`).

### 10. Implementation Plan, Risks & Metrics

**Phased plan (solo founder, ~4 days within the 2-week MVP):**
- **Day 1:** OAuth flow (OAuth App, scopes per §8), sessions, `users` table, token encryption helper.
- **Day 2:** Workspaces, members, roles, invites (non-expiring revocable tokens).
- **Day 3:** Org/repo listing, repo selection wired to ingestion's webhook-registration API; surface per-repo install status.
- **Day 3.5:** `onboarding/complete` → ingestion backfill API (24h window), SSE wiring to dashboard, wizard UI (steps 1–3).
- **Day 4:** Optional integrations (Cursor/Devin/Slack) UI + endpoints, error states, AC test pass.

**Risks & mitigations:** GitHub rate limits during backfill (cap 50 repos, 24h window, exponential backoff — owned by ingestion); Cursor/Devin APIs unstable (validation behind a provider adapter, skip path always available); webhook install permission gaps (graceful per-repo failure, AC8); solo-founder scope creep (Slack/agent steps are paste-a-key only, no OAuth for those in MVP; billing/seat logic, invite expiry, and GitHub App migration deliberately deferred); cross-feature coupling with ingestion (contract is two internal APIs — register repo, start backfill — agreed before Day 3).

**Success metrics (instrumented at each wizard step):** activation funnel (OAuth start → repo select → dashboard) with G1–G3 targets; webhook install success rate ≥ 95%; backfill p90 < 90s; event latency < 60s; 99.5% uptime on auth endpoints and ingestion's webhook receiver; members per workspace (leading indicator for $15–49/dev/mo revenue once billing ships post-MVP).