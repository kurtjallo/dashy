# Dashy.ai — Product Requirements Document

| | |
|---|---|
| **Product** | Dashy.ai — Overnight activity dashboard for AI coding agents |
| **Owner** | Kurt Jallo |
| **Status** | Draft |
| **Last Updated** | 2026-06-12 |

## 1. Executive Summary

### 1.1 Product Vision

**One-sentence description:** Dashy.ai is a neutral, cross-agent observability dashboard that shows developers exactly what their AI coding agents did overnight — every commit, run, failure, and cost — in a single morning-review feed.

**Target user:** Professional software developers and solo founders running autonomous AI coding agents (Claude Code, Codex, Cursor agents, Devin, and similar) on long-running or unattended tasks.

**Key differentiator:** Dashy.ai is the only neutral, agent-agnostic observability layer. Every existing surface is vendor-locked to a single agent; Dashy.ai aggregates activity across all agents into one timeline, regardless of vendor.

**Success definition:** Validate willingness to pay with 3 pilot teams at a 20% pilot-to-paid conversion rate, then scale post-launch (months 3–6+) to 5,000 signups on an organic-dominant acquisition model, growing toward 1,000 paying users at a 5–10% signup-to-paid rate while holding monthly churn below 5%.

### 1.2 Strategic Alignment

| Dimension | Detail |
|---|---|
| **Business objectives** | Capture the emerging "agent ops" category early; establish Dashy.ai as the default morning-review habit; build toward $1M–$10M ARR potential. |
| **User problems solved** | Developers wake up with no consolidated view of what agents did overnight (pain score 9/10, daily frequency); reviewing scattered logs, terminals, and Git history wastes the first hour of every workday. |
| **Market timing** | Autonomous/overnight agent usage is inflecting now; community evidence across Reddit, Facebook groups, and YouTube shows developers actively complaining about and hand-rolling workarounds for this exact gap. |
| **Competitive advantage** | No neutral cross-agent observability layer exists today; vendor dashboards cannot credibly cover competitors' agents, leaving the aggregation position structurally open to an independent player. |

### 1.3 Resource Requirements

| Resource | Estimate |
|---|---|
| **Dev effort** | Solo founder build; MVP scoped to 1–2 weeks |
| **Timeline / milestones** | Weeks 1–2: MVP (agent log ingestion + unified feed). Weeks 3–6: private beta with 3 pilot teams; validate 20% pilot-to-paid conversion. Weeks 7–12: public launch. Months 3–6+: scale to 5,000 signups, building toward 1,000 paying users (consistent with Section 9 phases) |
| **Team / skills** | One founder-engineer: full-stack web, agent CLI/log integration, basic data pipeline; no hires required for MVP |
| **Budget** | $0–10K total (hosting, domain, LLM/API costs). Acquisition is organic-dominant (community, content, launch channels) at ~$0 CAC; paid acquisition capped at $0–2K, used only for small tests to validate a $10–15 paid CAC (per Section 9.2) |

## 2. Problem & Opportunity

### 2.1 Problem Definition

Developers increasingly run AI coding agents overnight or unattended, but there is no single place to answer the question "what did my agents do while I was away?" Activity is fragmented across per-vendor dashboards, terminal scrollback, log files, and Git history.

**Quantified pain:**

| Evidence | Value |
|---|---|
| Pain score | 9 / 10 |
| Frequency | Daily — every morning an agent ran overnight |
| Market evidence | Recurring complaints and DIY workaround threads on Reddit, Facebook developer groups, and YouTube tutorials demonstrating hand-built monitoring hacks |

The cost is concrete and recurring: lost time reconstructing agent activity each morning, missed failures that silently burn compute spend, and reduced trust that suppresses further agent adoption.

### 2.2 Opportunity Analysis

- **Market size:** Every developer adopting autonomous coding agents is a prospective user; the segment is growing with agent adoption itself. Revenue potential is estimated at $1M–$10M ARR.
- **Competitive gap:** No neutral cross-agent observability layer exists. Vendor tools (each agent's own dashboard) are siloed by design; an independent aggregator is the structurally defensible position.
- **Timing:** Daily-frequency pain at a 9/10 severity with visible organic demand (Reddit/Facebook/YouTube) indicates a market pulling for a solution now, before incumbents move.

### 2.3 Success Criteria

**Primary metrics**

| Metric | Target | Phase |
|---|---|---|
| Pilot-to-paid conversion (3 pilot teams) | 20% | Weeks 3–6 validation gate (Phase 2/3) |
| Beta signups | 5,000 | Post-launch milestone, months 3–6+ (Phase 3/4) |
| Beta-signup-to-paid conversion | 5–10% | Post-launch |
| Paying users | 1,000 (requires ~10,000–20,000 cumulative signups at 5–10% conversion; 5,000 signups is the intermediate milestone, yielding ~250–500 paid) | Post-launch, beyond month 6 |
| Monthly churn | < 5% | Ongoing |
| CAC | Blended CAC near $0 — organic/community signups dominate; paid CAC of $10–15 validated only on small tests within the $0–2K paid budget | Ongoing |

Note: pilot-to-paid (a high-touch funnel with 3 hand-picked teams) and beta-signup-to-paid (a self-serve funnel) are distinct funnels with different expected rates and are tracked separately.

**Secondary metrics:** daily active usage of the morning feed, number of agents connected per account, time-to-first-connected-agent at onboarding.

**Expected behavior changes:** developers replace manual log/Git archaeology with a single morning Dashy.ai review; failures are caught the same morning rather than discovered days later; users grow confident enough to run more agents unattended.

**Business outcomes:** unit economics validated on an organic-dominant model (paid CAC $10–15 proven on small tests) against sub-5% churn; 20% pilot conversion confirms willingness to pay; the 5,000-signup milestone and a 5–10% self-serve conversion rate establish the proof points for scaling toward 1,000 paying users and $1M–$10M ARR.

## 3. User Requirements & Stories

### 3.1 Primary Personas

#### Persona A: Senior Developer / Tech Lead ("The Agent Wrangler")

| Dimension | Detail |
|---|---|
| Profile | Senior IC or tech lead delegating work to multiple AI coding agents in parallel (Cursor background agents, Devin, GitHub Copilot coding agent, Claude Code) |
| Goals | Know within minutes of starting the day what each agent produced overnight; triage which PRs/diffs need review first; catch failed or stalled agent runs before they waste another cycle |
| Motivations | Agents work while they sleep — the payoff only materializes if outputs are reviewed and merged quickly; review latency is now the bottleneck, not generation |
| Current workflow | Kicks off agent tasks in the evening; each morning opens GitHub notifications, Cursor agent logs, Devin task list, Copilot PR queue, Slack threads, and CI dashboards across ~6 browser tabs to reconstruct what happened |
| Pain points | No single timeline across agents; identical-looking PRs with no clear agent attribution; failed runs discovered hours late; duplicated review of work an agent already iterated on |
| Success criteria | Complete overnight picture in one view in under 5 minutes; zero missed failed runs; can prioritize review queue without opening any source tool |

#### Persona B: Engineering Manager ("The Morning Status Seeker")

| Dimension | Detail |
|---|---|
| Profile | Manages a team of 5–15 engineers, each running their own agents; accountable for velocity and quality |
| Goals | Morning visibility into agent + human output across the team; spot blocked work and review bottlenecks; report agent productivity upward |
| Motivations | Standups no longer capture reality — half the team's output was produced asynchronously by agents overnight; needs ground truth, not self-reports |
| Current workflow | Asks in Slack "what shipped overnight?", skims GitHub org activity, occasionally checks CI; has no view into Cursor/Devin/Copilot activity at all unless an engineer volunteers it |
| Pain points | Agent activity is invisible at the team level; cannot distinguish agent vs. human contributions; no way to see which agent runs failed silently |
| Success criteria | An overnight digest readable before standup; per-agent activity rollups; can answer "what did the agents do last night?" without asking anyone |
| v1 scope note | In v1 (MVP), Persona B is served **single-player**: they connect org-visible sources under their own GitHub OAuth identity and receive a personal digest covering the repos and agents they can see. Multi-user team workspaces, invites, and shared connections are post-MVP (see Epic 6). |

#### Persona C: Startup Founder ("The Fleet Operator")

| Dimension | Detail |
|---|---|
| Profile | Technical founder running a fleet of agents as a force multiplier for a tiny team; agents may outnumber humans |
| Goals | Maximize fleet throughput; know instantly when an agent is blocked, failing, or burning spend on a dead-end task; keep shipping velocity visible |
| Motivations | Every hour an agent sits failed or unreviewed is lost runway; the fleet is the team |
| Current workflow | Context-switches between agent consoles all day; relies on memory of which agent was assigned what; checks Slack/CI reactively when something breaks |
| Pain points | No fleet-level health view; alert fatigue from raw tool notifications; cannot prioritize which agent output to act on first |
| Success criteria | Real-time fleet status on one screen; actionable Slack alerts for failures only (not noise); time from agent failure to founder awareness under 15 minutes |

### 3.2 User Journey Mapping

#### Current state: morning tab-hopping

| Step | Touchpoint | User action | Pain point |
|---|---|---|---|
| 1 | GitHub | Scan notifications and PR list | Agent PRs mixed with human PRs and bot noise; no overnight grouping |
| 2 | Cursor logs | Open agent run history | Separate login/UI; no link back to resulting PRs |
| 3 | Devin tasks | Check task statuses | Failures not pushed anywhere; discovered only by visiting |
| 4 | Copilot PRs | Review coding-agent PR queue | Another distinct queue with its own conventions |
| 5 | Slack | Search threads for agent mentions | Unstructured; key failures buried in channels |
| 6 | CI | Check pipeline results | CI status not correlated with the agent run that triggered it |

Outcome: 20–40 minutes of manual reconstruction across 6 tools before any real work begins; failures discovered late; no shared team picture.

#### Future state: one dashboard + Slack alerts

| Step | Touchpoint | Experience |
|---|---|---|
| 1 | Slack (overnight digest) | One morning message summarizing all agent activity: completed, failed, awaiting review |
| 2 | Dashy.ai dashboard | Unified, chronologically ordered overnight feed across all connected sources (GitHub, Cursor, Devin at launch), with agent attribution inline; GitHub PR check/status results surface via the GitHub connection where available |
| 3 | Filtered views | One click to "failures only," "needs my review," or per-agent/per-repo views |
| 4 | Deep links | Each feed item links directly to the source PR, run, or log for action |

> **Scope note:** Dedicated CI-pipeline ingestion (CircleCI, Buildkite, etc.) and Copilot coding-agent ingestion are fast-follows, not v1 (see story 2.4 and FR-12). In v1, CI signal is limited to what the GitHub API exposes as PR checks/statuses.

#### Opportunity areas

1. **Time-to-triage:** collapse 6-tool, 20–40 minute reconstruction into a single sub-5-minute review.
2. **Failure latency:** push failures via Slack within minutes instead of passive discovery hours later (per the canonical latency targets in Section 5.6).
3. **Attribution:** make "which agent did this" a first-class, filterable attribute.
4. **Team visibility:** give managers a rollup that requires zero engineer self-reporting (single-player in v1; team workspaces post-MVP).

### 3.3 Core User Stories

#### Epic 1: Overnight Activity Feed (P0)

| ID | Story | Acceptance criteria | Priority | Dependencies |
|---|---|---|---|---|
| 1.1 | As a tech lead, I want a single chronological feed of all agent activity since I last checked, so that I can triage my morning in one place. | Given 3+ connected sources with overnight events, when I open the dashboard, then all events render in one merged, time-ordered feed within 3 seconds, each with source, agent, repo, status, and timestamp. GitHub-sourced PR items additionally show check/status state when the GitHub API provides it. | P0 | Epic 2 |
| 1.2 | As a tech lead, I want each feed item to deep-link to its source artifact, so that I can act without searching. | Given any feed item, when I click it, then I land on the exact PR, run, or log in the source tool in one click (no intermediate pages). | P0 | 1.1 |
| 1.3 | As an engineering manager, I want a "since last visit" marker, so that I never re-read activity I've already triaged. | Given a prior session, when I return, then new items are visually separated above a last-seen divider and a new-item count is shown. | P1 | 1.1 |

#### Epic 2: Multi-Source Ingestion (P0)

| ID | Story | Acceptance criteria | Priority | Dependencies |
|---|---|---|---|---|
| 2.1 | As a tech lead, I want to connect GitHub, Cursor, and Devin in minutes, so that the feed reflects my core agent surface at launch. | Given valid credentials/tokens, when I connect a source, then setup completes in under 5 minutes per source and historical events from the past 7 days backfill automatically (per FR-1). | P0 | — |
| 2.2 | As a founder, I want events to appear in near real time, so that the feed is trustworthy as a live status. | Given a new event in a connected source, when it occurs, then it appears in the feed within the canonical latency targets defined in Section 5.6 (webhook event-to-feed <60s p95; polling sources within 5 minutes). | P0 | 2.1 |
| 2.3 | As an admin, I want visibility into ingestion health, so that I know the feed is complete. | Given a source connection failure or token expiry, when it occurs, then the dashboard flags the degraded source within 10 minutes and shows last-successful-sync time per source. | P1 | 2.1 |
| 2.4 | As a tech lead, I want to connect GitHub Copilot coding agent and dedicated CI pipelines, so that my remaining agent and build surface joins the feed. *(Fast-follow; aligned with FR-12 — Should Have. Requires a new CI ingestion FR before scheduling.)* | Given a Copilot or CI source, when connected, then its events appear in the unified feed with the same attribution, deep-linking, and latency behavior as launch sources. | P2 | 2.1 |

#### Epic 3: Filtering & Triage Views (P0)

| ID | Story | Acceptance criteria | Priority | Dependencies |
|---|---|---|---|---|
| 3.1 | As a tech lead, I want to filter the feed by status (failed, completed, needs review), so that I can work failures first. | Given a populated feed, when I apply a status filter, then results update in under 1 second and the filter persists across sessions. | P0 | 1.1 |
| 3.2 | As a tech lead, I want to filter by agent, repo, and time window, so that I can isolate any slice of activity. | Given filters for agent + repo + last-12-hours, when applied together, then only matching items show and the active filter set is visible and clearable in one click. | P0 | 1.1, Epic 5 |
| 3.3 | As a manager, I want saved views (e.g., "failures, overnight"), so that my morning check is one click. | Given a configured filter set, when I save it as a named view, then it appears in my sidebar and loads with identical results on next visit. | P1 | 3.1, 3.2 |

#### Epic 4: Slack Alerts & Digest (P0)

| ID | Story | Acceptance criteria | Priority | Dependencies |
|---|---|---|---|---|
| 4.1 | As a founder, I want a Slack alert when an agent run fails, so that failure-to-awareness time is minutes, not hours. | Given an alert rule for failures, when a connected source reports a failed run, then a Slack message with agent, task, error summary, and deep link is delivered within the canonical Slack-alert latency target defined in Section 5.6 (<2 minutes p95 from ingestion). | P0 | Epic 2 |
| 4.2 | As a manager, I want a scheduled morning digest in Slack, so that overnight status is visible before standup. | Given a digest configured for 8:00 AM in my timezone, when the time arrives, then one message posts summarizing counts of completed/failed/needs-review by agent, with a dashboard link; delivery within ±5 minutes of schedule. | P0 | Epic 1, Epic 2 |
| 4.3 | As a tech lead, I want alert rules scoped by severity, repo, or agent, so that Slack stays signal-only. | Given a rule "failures only, repo X," when non-matching events occur, then no message is sent; when matching events occur, exactly one message is sent (no duplicates). | P1 | 4.1 |

#### Epic 5: Agent Attribution (P1)

| ID | Story | Acceptance criteria | Priority | Dependencies |
|---|---|---|---|---|
| 5.1 | As a tech lead, I want every event labeled with the agent that produced it, so that I can compare and trust outputs. | Given an ingested event, when displayed, then it carries a normalized agent identity (Cursor, Devin, Claude Code, or human; Copilot once story 2.4 ships) with ≥95% attribution accuracy on events from natively connected sources. | P1 | Epic 2 |
| 5.2 | As a manager, I want per-agent rollups (runs, PRs, failure rate), so that I can report on agent productivity. | Given 7 days of data, when I open the agent summary, then counts per agent of runs started, PRs opened, PRs merged, and failure rate display and reconcile with the underlying feed. | P1 | 5.1 |
| 5.3 | As a tech lead, I want human vs. agent contributions distinguished in the feed, so that review effort goes where it's needed. | Given mixed activity, when I toggle "agents only," then human-authored events are excluded and the toggle state persists. | P2 | 5.1 |

#### Epic 6: Team Onboarding (Post-MVP)

> **Scope note:** Epic 6 is deferred to post-MVP. v1 has no corresponding functional requirement, and Section 5.4 auth is GitHub-OAuth-only with no email-invite flow. Persona B is served single-player in v1 (personal feed and digest over org-visible sources). Promoting this epic requires adding a teams/invites/roles FR to Section 4 and an email or org-OAuth invite path to Section 5.4.

| ID | Story | Acceptance criteria | Priority | Dependencies |
|---|---|---|---|---|
| 6.1 | As a manager, I want to invite my team and share source connections, so that everyone sees the same feed without per-person setup. | Given an admin account, when I invite teammates by email, then they reach a populated feed in under 10 minutes from invite, with no individual source configuration required for org-level connections. | Post-MVP | Epic 2; new teams/invites FR; invite-capable auth (5.4) |
| 6.2 | As a new team member, I want a guided first-run setup, so that I reach value fast. | Given a first login, when onboarding completes, then the user has connected or inherited at least one source and seen the feed; target time-to-first-feed under 15 minutes. | Post-MVP | 6.1 |
| 6.3 | As an admin, I want role-based access (admin vs. member), so that connection credentials and alert rules are managed safely. | Given a member role, when the user attempts to edit org source connections or org-wide alert rules, then the action is denied and only admins can perform it. | Post-MVP | 6.1 |

#### Cross-section consistency notes (for Sections 4 and 5)

- **Backfill:** 7-day historical backfill on first connect is canonical (FR-1 and story 2.1 now agree).
- **Latency:** Section 5.6 should define one canonical latency table — webhook event-to-feed <60s p95; polling event-to-feed <5 min; dashboard feed render <5s after ingestion (p95); Slack failure alert <2 min p95 from ingestion. Stories 2.2/4.1 and FR-1, FR-5, FR-7 must reference this table rather than restating numbers.
- **CI ingestion:** No FR currently covers dedicated CI ingestion; story 2.4 cannot be scheduled until one is added. Until then, CI visibility is limited to GitHub PR checks/statuses.

## 4. Functional Requirements

This section defines the functional scope for Dashy.ai v1 using MoSCoW prioritization. The MVP target is a 1–2 week build delivering the core loop: ingest AI-agent coding activity (GitHub, Cursor, Devin), attribute it to the correct agent, and surface it as a real-time, filterable feed with Slack alerts and offline catch-up summaries.

### 4.1 Must Have (MVP — 1–2 Week Build)

#### FR-1: GitHub Webhook/API Ingestion (PRs, Commits, Merges, Issues)

**Description.** Connect one or more GitHub repositories and ingest pull requests, commits, merges, and issue events in near real time via GitHub webhooks, with REST API polling as a fallback and for historical backfill.

**User workflow.**
1. User authenticates via GitHub OAuth and selects repositories to monitor.
2. Dashy.ai auto-registers webhooks for `push`, `pull_request`, `issues`, and `pull_request_review` events.
3. Events appear in the activity feed within seconds of occurring; a 7-day backfill populates the feed on first connect.

**Input/output spec.**

| Input | Output |
|---|---|
| GitHub webhook payloads (`push`, `pull_request`, `issues`); REST API responses for backfill | Normalized `ActivityEvent` record: `{event_id, source: "github", repo, event_type, actor, branch, title, url, diff_stats (files/+/−), timestamp, raw_payload_ref}` |

**Business logic.**
- Deduplicate by GitHub delivery ID; events are idempotent on replay.
- Webhook signature (HMAC) verified on every delivery; unsigned payloads rejected.
- Fallback poller runs every 60s for repos where webhook registration fails (e.g., insufficient permissions).
- Merge events distinguished from plain pushes (merged PR → `merge` event type).

**Acceptance criteria.**
- A merged PR appears in the feed within 10 seconds of the GitHub event (p95).
- Replaying the same webhook delivery creates zero duplicate cards.
- First-connect backfill loads the prior 7 days of PRs/commits/issues for selected repos.

#### FR-2: Cursor Activity Log Ingestion

**Description.** Ingest coding-session activity from Cursor (agent runs, files edited, sessions completed) so background agent work that never touches a PR is still visible.

**User workflow.**
1. User installs the Dashy.ai connector (CLI agent or API key configuration) for their Cursor workspace.
2. Cursor agent sessions and edits stream to Dashy.ai.
3. Sessions appear as activity cards labeled with the Cursor agent and affected files/repo.

**Input/output spec.**

| Input | Output |
|---|---|
| Cursor activity log entries / connector payloads: session ID, workspace, files touched, action type, timestamps | Normalized `ActivityEvent`: `{event_id, source: "cursor", session_id, repo (mapped), files_changed, action_summary, agent: "cursor", timestamp}` |

**Business logic.**
- Workspace-to-repo mapping is user-configurable; unmapped workspaces land in an "Unassigned" bucket rather than being dropped.
- Sessions shorter than a configurable noise threshold (default 30s, no file changes) are suppressed from the feed but retained in storage.
- Connector retries with exponential backoff; events buffered locally up to 24h if Dashy.ai is unreachable.

**Acceptance criteria.**
- A completed Cursor agent session appears in the feed within 60 seconds.
- 100% of buffered events are delivered after a simulated 1-hour outage.
- Zero-file-change micro-sessions do not appear in the default feed view.

#### FR-3: Devin Task Completion Ingestion

**Description.** Ingest Devin task lifecycle events (started, completed, failed) including task description, resulting PRs/branches, and duration.

**User workflow.**
1. User connects Devin via API key/webhook configuration.
2. Devin task completions appear as activity cards with task description, outcome, and links to any resulting PRs.
3. Failed tasks are visually flagged so the user can intervene.

**Input/output spec.**

| Input | Output |
|---|---|
| Devin API/webhook payloads: task ID, description, status, linked PR/branch, start/end time | Normalized `ActivityEvent`: `{event_id, source: "devin", task_id, status: started\|completed\|failed, description, linked_pr_url, duration, agent: "devin", timestamp}` |

**Business logic.**
- Devin tasks that produce a PR are linked to the corresponding GitHub event so the feed shows one threaded card, not two.
- Failed tasks always render in the feed regardless of filters (safety override is on by default, user-disableable).
- Status transitions update the existing card in place rather than emitting a new card.
- Failed-task events emit a `needs_attention` flag consumed by Slack alerting (FR-7b) and the offline summary (FR-8).

**Acceptance criteria.**
- A Devin task completion appears in the feed within 60 seconds of the API event.
- A Devin task that opens a PR renders as a single linked card, not two separate cards.
- Failed tasks display a distinct "failed" state and are included in the next offline summary.

#### FR-4: Agent Attribution Engine

**Description.** Determine which agent (or human) performed each activity. Dashy.ai's market position is neutral aggregation across agent vendors; per-event agent attribution is the enabling capability that makes that aggregation trustworthy. Every event in Dashy.ai carries a confident attribution: Cursor, Devin, Copilot (post-MVP), specific bot accounts, or human developer.

**User workflow.** Attribution is automatic. The user sees an agent badge on every card and can correct a misattribution; corrections persist as rules.

**Input/output spec.**

| Input | Output |
|---|---|
| Normalized `ActivityEvent` + signals: commit author/committer, co-author trailers (e.g., `Co-Authored-By: Claude`), bot account patterns (`[bot]` suffix), branch naming conventions (e.g., `devin/*`, `cursor/*`), source-connector identity, commit message signatures | Attribution record: `{event_id, attributed_to: agent_id \| human_id, attribution_method, confidence: high\|medium\|low}` |

**Business logic.**
- Rule precedence: (1) source connector identity (Cursor/Devin event = that agent), (2) co-author/commit trailers, (3) bot account name patterns, (4) branch naming conventions, (5) default = human author.
- Events matching no agent rule attribute to the human GitHub author with `confidence: high`.
- Ambiguous matches (multiple rules conflict) attribute with `confidence: low` and a visible "verify" indicator.
- User corrections create workspace-level override rules applied to all future and historical events.

**Acceptance criteria.**
- Events with explicit agent trailers or connector identity attribute correctly 100% of the time.
- Every feed card displays an agent badge; no card is unattributed.
- A user correction re-attributes the event immediately and applies to subsequent matching events.

#### FR-5: Real-Time Activity Cards (Organized by Repo / Agent / Impact)

**Description.** The primary dashboard: a live feed of activity cards, groupable by repository, agent, or impact level, updating without page refresh.

**User workflow.**
1. User opens the dashboard and sees a reverse-chronological feed of cards.
2. User toggles grouping: by repo, by agent, or by impact.
3. Clicking a card expands details (diff stats, description, links to GitHub/Devin/Cursor source).

**Input/output spec.**

| Input | Output |
|---|---|
| Attributed `ActivityEvent` stream (FR-1–4) | Rendered cards: agent badge, event type icon, repo, title, diff stats, relative timestamp, deep link; live updates via WebSocket/SSE |

**Business logic.**
- New events push to open dashboards within 5 seconds of ingestion (p95).
- Impact grouping in MVP uses a deterministic heuristic: failed runs = needs attention; merges to default branch = critical; PRs opened/closed = high; commits/issues = normal. (Full impact scoring is Should Have, FR-9.)
- Feed paginates at 50 cards; infinite scroll loads history.
- Related events thread into one card (e.g., Devin task + its PR + its merge).

**Acceptance criteria.**
- A GitHub merge renders on an open dashboard within 5 seconds (p95) with no refresh.
- Switching grouping mode re-renders in under 1 second with no data loss.
- A threaded Devin-task-to-merge chain displays as a single expandable card.

#### FR-6: Filters (Project, Time Range, Developer)

**Description.** Filter the feed by project/repo, time range, and developer/agent, with combinable filters reflected in the URL for shareability.

**User workflow.** User selects one or more repos, a time range (presets: last hour, today, last 24h, last 7 days, custom), and one or more developers/agents. The feed, counts, and summaries update instantly. Filter state is shareable via URL.

**Input/output spec.**

| Input | Output |
|---|---|
| Filter selections: `{repos[], time_range, actors[]}` | Filtered event set; result count; filter state encoded in URL query params |

**Business logic.**
- Filters are conjunctive across dimensions (repo AND time AND actor) and disjunctive within a dimension (repo A OR repo B).
- Default view: all repos, last 24 hours, all actors.
- Filter state persists per user across sessions.

**Acceptance criteria.**
- Any filter combination returns results in under 500ms for a 30-day, multi-repo dataset.
- A shared filter URL reproduces the exact same view for another workspace member.
- Filter counts match the rendered card count exactly.

#### FR-7: Slack Webhook Notifications for Critical Merges

**Description.** Push a Slack message via incoming webhook when a critical merge occurs (merge to default/protected branch), so the team hears about high-impact agent activity without watching the dashboard.

**User workflow.**
1. User pastes a Slack incoming-webhook URL into Dashy.ai settings and selects which repos/branches count as critical.
2. On a qualifying merge, a formatted Slack message posts with agent attribution, repo, PR title, diff stats, and a link to the Dashy.ai card.
3. User can mute per repo or set quiet hours.

**Input/output spec.**

| Input | Output |
|---|---|
| Critical merge events; Slack webhook URL; notification rules `{repos, branches, quiet_hours}` | Slack Block Kit message: agent badge, repo, PR title, files/+/− stats, GitHub link, Dashy.ai link |

**Business logic.**
- "Critical" default = merge to repo default branch; user can add protected branches.
- Burst control: more than 5 critical merges within 5 minutes collapse into one summary message.
- Failed webhook deliveries retry 3 times with backoff, then surface an in-app warning.

**Acceptance criteria.**
- A qualifying merge produces a Slack message within 30 seconds.
- 6 merges in 5 minutes produce at most 2 Slack messages (initial + collapsed summary).
- Quiet-hours merges are held and included in the next summary, not dropped.

#### FR-7b: Slack Alerts for Failed Runs / Needs-Attention Events

**Description.** Push a Slack alert when an agent run fails or an event is flagged needs-attention, so a failed background agent is noticed in minutes, not the next morning. This backs the product's failure-latency value proposition (opportunity area 2; Persona C success criteria) and matches Epic 4.1 / Phase 1 scope. MVP coverage: Devin failed tasks (FR-3) at minimum; any connector event carrying the `needs_attention` flag routes through the same pipeline.

**User workflow.**
1. Failure alerts are enabled by default once a Slack webhook is configured (shared with FR-7).
2. When a Devin task fails (or any ingested event is flagged needs-attention), a Slack message posts with the agent, task description, failure status, and a link to the Dashy.ai card.
3. User can configure a separate webhook/channel for failures and adjust per-agent muting; quiet hours do not apply to failure alerts by default (user-overridable).

**Input/output spec.**

| Input | Output |
|---|---|
| `ActivityEvent` with `status: failed` or `needs_attention: true`; Slack webhook URL; failure-alert rules `{agents, repos, channel_override, respect_quiet_hours}` | Slack Block Kit message: failure badge, agent, repo/task description, duration before failure, Dashy.ai link, source link (e.g., Devin session) |

**Business logic.**
- Failure alerts use a distinct visual treatment (red/warn) and are never collapsed into merge burst summaries.
- Burst control applies separately: more than 5 failures within 5 minutes collapse into one failure-summary message.
- Bypasses quiet hours by default (failures are time-sensitive); user can opt failures into quiet hours.
- Same retry/backoff and in-app-warning behavior as FR-7.

**Acceptance criteria.**
- A failed Devin task produces a Slack alert within 30 seconds of the API event.
- Failure alerts fire during configured quiet hours unless the user has opted them in to quiet hours.
- 6 failures in 5 minutes produce at most 2 Slack messages (initial + collapsed failure summary).

#### FR-8: "While You Were Offline" Time-Range Summary

**Description.** On returning to the dashboard, the user sees a digest of everything their agents did since their last active session — the emotional core of the product ("you stepped away; here's what shipped").

**User workflow.**
1. Dashy.ai records the user's last-seen timestamp on each active session.
2. On next visit (gap > 30 minutes), a summary banner/panel shows: counts by event type and agent, critical merges, failed tasks, top repos by activity.
3. User clicks any summary line to jump to a pre-filtered feed view; dismissing the summary marks the period as seen.

**Input/output spec.**

| Input | Output |
|---|---|
| Last-seen timestamp; attributed event set in `[last_seen, now]` | Summary object: `{period, totals_by_event_type, totals_by_agent, critical_merges[], failed_tasks[], top_repos[]}` rendered as a panel; also generable on demand for any custom time range |

**Business logic.**
- Triggered only when the offline gap exceeds 30 minutes (configurable).
- Failed Devin tasks and critical merges are always itemized individually; routine commits are aggregated as counts.
- The same summary engine powers the Should-Have daily digest email (FR-9) — build once, render twice.

**Acceptance criteria.**
- After a simulated 8-hour gap with mixed activity, the summary shows correct per-agent and per-type counts (exact match with feed data).
- Summary renders in under 2 seconds for a 7-day offline period.
- Each summary line deep-links to a correctly pre-filtered feed view.

### 4.2 Should Have (Fast Follow)

| ID | Requirement | Summary |
|---|---|---|
| FR-9 | Daily digest email | Scheduled email reusing the FR-8 summary engine; per-user send time and timezone; one-click unsubscribe. |
| FR-10 | Impact scoring | Replace the FR-5 heuristic with a weighted score (lines changed, files touched, target branch, PR review state) producing critical/high/normal/low tiers used by feed grouping and Slack rules. |
| FR-11 | Multi-repo rollups | Aggregated cross-repo views per agent and per project group; org-level totals and trends for teams running agents across many repos. |
| FR-12 | Copilot integration | Ingest GitHub Copilot agent activity (coding agent PRs, Copilot-attributed commits) through the existing attribution engine (FR-4 rule extension). |

### 4.3 Could Have (Post-Launch, Demand-Driven)

| ID | Requirement | Summary |
|---|---|---|
| FR-13 | AI-generated natural-language summaries | LLM-written prose recaps of feed activity and offline periods ("Devin merged the auth refactor; Cursor cleaned up 3 flaky tests"), replacing count-based summaries. |
| FR-14 | Analytics add-on (paid) | Paid tier: agent productivity trends, per-agent throughput and failure rates, repo heatmaps, exportable charts. Gated as a separate add-on subscription; pricing to be set within the Section 8 tier structure ($15–49/dev/mo). |
| FR-15 | Audit/compliance export | Exportable, immutable event log (CSV/JSON) of all agent actions with attribution and timestamps for review and compliance workflows. |

### 4.4 Won't Have (v1 — Explicit Non-Goals)

| Exclusion | Rationale |
|---|---|
| Code review tooling | Dashy.ai observes and reports; GitHub remains the system of record for reviewing diffs. Linking out, not duplicating. |
| Agent orchestration/control | v1 is read-only visibility. No starting, stopping, or steering agents — keeps integration surface small and the 1–2 week build feasible. |
| Self-hosted deployment | Cloud-only for v1; self-hosting multiplies support and release cost before product-market fit is established. |

### 4.5 MoSCoW Summary

| Priority | Requirements |
|---|---|
| **Must** | FR-1 GitHub ingestion · FR-2 Cursor ingestion · FR-3 Devin ingestion · FR-4 Attribution engine · FR-5 Real-time activity cards · FR-6 Filters · FR-7 Slack critical-merge notifications · FR-7b Slack failed-run alerts · FR-8 Offline summary |
| **Should** | FR-9 Daily digest email · FR-10 Impact scoring · FR-11 Multi-repo rollups · FR-12 Copilot integration |
| **Could** | FR-13 AI natural-language summaries · FR-14 Analytics add-on (paid) · FR-15 Audit/compliance export |
| **Won't (v1)** | Code review tooling · Agent orchestration/control · Self-hosted deployment |

### 4.6 Impact vs. Effort Prioritization & Sequencing

| Requirement | Impact | Effort | Quadrant | Depends on |
|---|---|---|---|---|
| FR-1 GitHub ingestion | High | Medium | Strategic — build first | — |
| FR-4 Attribution engine | High | Medium | Strategic — build first | FR-1 |
| FR-5 Activity cards | High | Medium | Strategic | FR-1, FR-4 |
| FR-6 Filters | High | Low | Quick win | FR-5 |
| FR-3 Devin ingestion | High | Low | Quick win | FR-4 |
| FR-2 Cursor ingestion | Medium | Medium | Worthwhile | FR-4 |
| FR-7 Slack notifications | High | Low | Quick win | FR-1, FR-4 |
| FR-7b Failed-run alerts | High | Low | Quick win | FR-3, FR-7 |
| FR-8 Offline summary | High | Low–Med | Quick win | FR-5, FR-6 |
| FR-9 Daily digest email | Medium | Low | Quick win (fast follow) | FR-8 |
| FR-10 Impact scoring | Medium | Medium | Worthwhile | FR-5 |
| FR-12 Copilot integration | Medium | Low | Quick win (fast follow) | FR-4 |
| FR-11 Multi-repo rollups | Medium | Medium | Worthwhile | FR-5, FR-6 |
| FR-13 AI summaries | Medium | Medium | Defer until demand signal | FR-8 |
| FR-14 Analytics add-on | High (revenue) | High | Big bet — post-PMF | FR-10, FR-11 |
| FR-15 Audit export | Low–Med | Low | Opportunistic | FR-4 |

**Build sequence (MVP, 1–2 weeks).**

- **Days 1–4:** FR-1 GitHub ingestion + FR-4 attribution engine + event store. These two are the critical path; everything else renders or routes their output.
- **Days 4–7:** FR-5 activity cards with real-time updates; FR-6 filters; FR-3 Devin ingestion (low effort once the normalized event model exists).
- **Days 7–10:** FR-2 Cursor ingestion; FR-7 Slack notifications + FR-7b failed-run alerts (shared delivery pipeline); FR-8 offline summary (built on the same query layer as FR-6).
- **Buffer (days 10–14):** hardening — webhook retry/dedup testing, attribution edge cases, performance validation against acceptance criteria.

**Key dependency notes.**
- FR-4 (attribution) is the load-bearing component: FR-5, FR-7, FR-7b, FR-8, and all Should/Could items consume its output. Schedule it early and design the rule precedence to be extensible (FR-12 Copilot is a rule addition, not a rework). Note on positioning: neutral cross-vendor aggregation is the differentiator at the market level; attribution is the internal capability that makes it credible — the two claims are one story, not competing ones.
- FR-7 and FR-7b share one Slack delivery pipeline (webhook config, retry/backoff, burst control); FR-7b is a routing rule plus message template on top of it.
- FR-8 and FR-9 share one summary engine; building FR-8 first makes the daily digest a rendering task, not a new system.
- FR-14 (analytics add-on) requires FR-10 scoring and FR-11 rollups as data foundations — sequence both before monetizing analytics. Its price point should be defined in the Section 8 pricing structure rather than fixed here.

## 5. Technical Requirements

### 5.1 Architecture Overview

Dashy.ai is an event-driven, **webhook-first** pipeline: third-party sources (GitHub, Cursor, Devin) push activity to a webhook listener, events are normalized into a unified agent-activity schema, persisted to an event store, and surfaced in a React dashboard with real-time updates and Slack alerts. Live updates are delivered via SSE push fan-out; **API polling is used only as a fallback** for sources or gap windows where webhooks are unavailable or missed (per FR-1), not as the primary delivery mechanism.

```
GitHub / Cursor / Devin webhooks
        │
        ▼
 Webhook Listener (Next.js API routes / Route Handlers)
        │  (verify signature, enqueue raw payload)
        ▼
 Queue (BullMQ + Redis on Railway)
        │
        ▼
 Ingestion & Normalization Pipeline (worker)
        │  (map to unified event schema, dedupe, enrich)
        ▼
 Event Store (Postgres)
        │                         │
        ▼                         ▼
 REST API (dashboard)      Alert Dispatcher (Slack)
        │
        ▼
 React Dashboard (Next.js) — real-time via SSE
```

**Recommended stack (solo-founder pragmatic):**

| Layer | Choice | Rationale |
|---|---|---|
| App + API | Next.js (App Router, TypeScript) | One codebase for dashboard, API, and webhook endpoints |
| Database / event store | Postgres (Railway or Neon) | Relational queries for feeds/filters; JSONB for raw payloads |
| Queue | BullMQ + Redis (managed Railway Redis) | Industry-standard Node job queue; decouples webhook receipt from processing; built-in retries; Redis pub/sub doubles as the SSE fan-out bus |
| Real-time | Server-Sent Events (SSE) | Simpler than WebSockets for one-way feed updates; fine for MVP |
| Hosting | Vercel (app) + Railway (Postgres/worker) | Zero-ops deploys; worker process for queue consumers |
| Auth | GitHub OAuth (NextAuth/Auth.js) | Users already have GitHub; doubles as API authorization grant |
| Alerts | Slack incoming webhooks / Slack app | Lowest-friction notification channel |

> **Cross-reference note:** §9.2 (infrastructure dependencies) and Risk §10.1 must reference this stack verbatim — Next.js on Vercel, Postgres on Railway or Neon, BullMQ + Redis, SSE for real-time. The architecture is webhook-first with SSE push fan-out; polling exists only as a backfill/fallback path (FR-1), not the primary update mechanism.

### 5.2 Component Definitions

| Component | Responsibility | Key acceptance criteria |
|---|---|---|
| Webhook Listener | Receive POSTs from GitHub/Cursor/Devin; verify HMAC signatures; persist raw payload; enqueue; respond 200 in <500ms | Invalid signatures rejected with 401; no payload processing inline |
| Ingestion Pipeline | Consume queue; map source-specific payloads to the unified schema; deduplicate by source event ID; enrich (repo, agent identity); apply status transitions to lifecycle events | Same source event ingested twice produces exactly one stored event; a status update for an existing task/session updates that event's `status` rather than creating a duplicate feed entry |
| Event Store | Durable storage of normalized events + raw payloads | All normalized events queryable by team, source, agent, repo, time range |
| REST API | Serve dashboard queries (feed, filters, aggregates) | All endpoints authenticated; p95 response <300ms |
| Real-time Layer | Push new events and status updates to open dashboard sessions via SSE | New event visible without page refresh; status change to an existing card (e.g. Devin task started → failed) reflected in place without page refresh |
| Alert Dispatcher | Evaluate alert rules; send Slack messages | Alert delivered within 2 minutes of source event |
| Dashboard | React UI: activity feed, filters, per-agent/per-repo views | Initial load <2s on broadband |

### 5.3 Unified Agent-Activity Data Model

All sources normalize to a single event shape:

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Internal primary key |
| `team_id` | UUID | Tenant scoping; required on every query |
| `source` | enum: `github` \| `cursor` \| `devin` | Extensible for future sources |
| `source_event_id` | string | Dedup key (unique with `source`) |
| `agent` | string | Agent identity (e.g. bot account, Devin session, Cursor agent) |
| `actor_type` | enum: `agent` \| `human` | Distinguish agent vs. human activity |
| `repo` | string | `org/repo`; nullable for non-repo events |
| `action_type` | enum: `commit` \| `pr_opened` \| `pr_merged` \| `review` \| `task_started` \| `task_completed` \| `task_failed` \| `session_started` \| `session_completed` \| `comment` \| `error` | Normalized vocabulary. `task_failed` covers FR-3's failed Devin states; `session_started`/`session_completed` cover FR-2's Cursor agent sessions. `error` is reserved for ingestion/integration errors, not task outcomes |
| `status` | enum: `pending` \| `running` \| `succeeded` \| `failed` \| nullable | Current lifecycle state for long-running tasks/sessions (Devin tasks, Cursor sessions); null for point-in-time events (commits, comments) |
| `impact` | JSONB | e.g. `{files_changed, additions, deletions, tests_passed}` |
| `summary` | text | Human-readable one-liner for the feed |
| `url` | string | Deep link to source artifact |
| `occurred_at` | timestamptz | Source-reported time |
| `updated_at` | timestamptz | Last status transition time |
| `ingested_at` | timestamptz | Pipeline receipt time (latency measurement) |
| `raw_payload` | JSONB | Original payload for replay/debug |

**Status transitions (lifecycle events).** The event store is append-only for raw payloads, but normalized lifecycle events are *mutable in one column*: when a source reports a state change for an existing task/session (matched on `source` + source task/session ID), the pipeline updates that event's `status` and `updated_at` in place and emits an SSE update so the dashboard card refreshes without creating a duplicate feed entry (satisfying FR-3's started/completed/failed Devin states and in-place card updates). Every raw status-change payload is still stored append-only in `raw_payload` history (via the quarantine/raw tables) so transitions remain auditable and replayable. Terminal transitions (`task_completed`, `task_failed`, `session_completed`) also set `action_type` to the terminal value.

### 5.4 API Requirements

**Webhook endpoints**
- `POST /api/webhooks/github`, `/api/webhooks/cursor`, `/api/webhooks/devin` — signature verification (HMAC per source), idempotent ingestion, 200 within 500ms, payloads up to 1MB.
- Unknown event types are stored raw and skipped without erroring.

**Dashboard REST API**
- `GET /api/events` — cursor-paginated feed; filters: `source`, `agent`, `repo`, `action_type`, time range.
- `GET /api/events/stream` — SSE stream of new events for the authenticated team.
- `GET /api/agents`, `GET /api/repos` — filter dimension lists.
- `GET /api/stats` — aggregates (events/agent/day, merge counts) for summary widgets.

**Auth**
- GitHub OAuth for login; sessions via secure HTTP-only cookies. All API routes require an authenticated session scoped to a team. No public unauthenticated endpoints except webhook receivers (signature-authenticated).

**Rate limiting**
- Dashboard API: 120 req/min per user; webhook endpoints: 600 req/min per team with 429 + `Retry-After` beyond that.

**Retry / error handling for flaky third-party APIs**
- All outbound calls (GitHub REST backfill, Slack) use exponential backoff with jitter: 3 retries (1s/4s/16s), honoring `Retry-After` on 429.
- Queue jobs retry up to 5 times then land in a dead-letter queue with alerting; DLQ items replayable manually.
- Webhook payloads are persisted before processing so any pipeline failure is recoverable without data loss.

### 5.5 Data Requirements

- **Validation:** every inbound payload validated against per-source schemas (Zod); normalized events validated before insert; malformed payloads stored in a quarantine table, never dropped silently.
- **Schema sketch:** `teams`, `users`, `integrations` (per-source credentials, encrypted), `events` (model above, indexed on `(team_id, occurred_at)`, `(team_id, agent)`, `(team_id, repo)`), `alert_rules`, `alert_deliveries`.
- **Retention:** normalized events retained 12 months (MVP); raw payloads retained 30 days then purged; retention configurable per plan later. Only code *metadata* (repo names, file counts, diff stats, commit messages/URLs) is stored — never code content.
- **Deletion:** team offboarding hard-deletes all team-scoped rows within 30 days.

### 5.6 Performance Specifications

| Metric | Target | How measured |
|---|---|---|
| Dashboard initial load | <2s (p95, broadband) | Synthetic monitoring + Web Vitals (LCP) |
| Event-to-dashboard latency | <60s from source event to feed (p95) | `occurred_at` vs. client render; `ingested_at` instrumentation |
| Slack alert latency | <2 min from source event (p95) | `occurred_at` vs. `alert_deliveries.sent_at` |
| Webhook ack time | <500ms (p99) | Server timing logs |
| Feed API response | <300ms (p95) | APM |

## 6. User Experience

### 6.1 Design Principles

| Principle | Description |
|---|---|
| Glanceable "morning briefing" | The default screen answers "what did my agents do overnight, and what needs me?" in a single viewport. Critical items (failed runs, PRs awaiting review) surface above the fold; no scrolling required to assess overall status. |
| Zero-config defaults | Connecting GitHub + one agent yields a useful dashboard immediately. Sensible defaults for grouping, alert thresholds, and feed ordering; configuration is optional refinement, never a prerequisite. |
| Information density without clutter | Developers prefer dense, scannable layouts over whitespace-heavy marketing UI. Use compact cards, monospace identifiers, status color coding, and progressive disclosure (expand for diffs/logs) rather than separate pages. |
| Respect the ritual | The product is built around a daily 2-minute morning check. Every interaction is optimized for triage speed: keyboard navigation, bulk dismiss, one-click jump to the PR or agent session. |

### 6.2 Interface Requirements

**Activity feed (core surface)**
- Feed of activity cards, each showing: agent name/icon, repo, action type (PR opened, run completed, run failed, review requested), timestamp, status, and a one-line summary.
- Cards expand inline to show details (commit list, diff stats, error output) without navigation.
- Grouping toggles: by repository and by agent; default grouping is by repo with agent badges.
- Filter bar: agent, repo, status (success/failed/needs-attention), and time range; filters persist per user.
- "Needs attention" items pinned to the top with distinct visual treatment.

**Timeline view**
- Chronological timeline of agent activity across all connected repos, with overnight window (last check → now) highlighted by default.

**Platform and visual requirements**
- Responsive web app: fully functional at desktop, tablet, and mobile widths (mobile supports the morning check use case end-to-end).
- Dark mode is the default theme (developer audience); light mode available.
- Feed loads in <2s on a typical connection; new activity appears without manual refresh.

### 6.3 Usability Criteria (Acceptance)

| Criterion | Target | How measured |
|---|---|---|
| Time to first value | <5 minutes from signup to populated dashboard (GitHub connect + 1 agent) | Instrumented onboarding funnel timestamps |
| Morning check ritual | Complete triage of overnight activity in <2 minutes | Session duration on briefing screen for returning users |
| Task completion rate | >90% on core tasks (connect integration, find a failed run, jump to PR) | Moderated/unmoderated usability tests, n≥10 per release |
| Onboarding drop-off | <20% abandonment between signup and first integration connected | Funnel analytics |

## 7. Non-Functional Requirements

### 7.1 Security

- **OAuth scope minimization:** request only the GitHub scopes required to read events and metadata (e.g. `read:user`, webhook-based repo events); never request code-content or write scopes for MVP. Scope list documented and reviewed before each integration ships.
- **Secrets and tokens:** all third-party tokens and webhook secrets encrypted at rest (AES-256, application-level encryption on top of provider disk encryption); never logged; TLS 1.2+ for all traffic.
- **Data minimization / GDPR:** Dashy.ai stores code *metadata*, not code content — a core privacy posture and sales point. DPA available; data export and deletion supported within 30 days of request; EU data residency evaluated post-MVP.
- **SOC 2 path:** MVP adopts SOC 2-aligned practices from day one (access logging, least-privilege, encrypted backups, vendor inventory) using a compliance platform (e.g. Vanta), targeting SOC 2 Type I once the first enterprise-pipeline customers require it.
- **Tenant isolation:** every query scoped by `team_id`; automated tests assert no cross-tenant data access.

### 7.2 Performance

Targets as specified in §5.6: dashboard load <2s (p95), event-to-dashboard latency <60s (p95), Slack alert latency <2 min (p95), feed API <300ms (p95). Performance budgets enforced in CI (Lighthouse) and production (APM dashboards with alerts when p95 exceeds target for 15 consecutive minutes).

### 7.3 Reliability

- **Uptime:** 99.5% monthly uptime target for the dashboard and ingestion path (MVP-appropriate; ~3.6h/month error budget).
- **No-loss ingestion:** raw payloads persisted before processing; queue with retries + DLQ guarantees at-least-once processing with idempotent writes (effectively exactly-once in the event store).
- **Webhook replay / backfill:** on outage or missed deliveries, a backfill job pulls missed activity from source APIs (e.g. GitHub Events API) for the gap window; GitHub webhook redelivery used where available. This polling-based backfill is the fallback path referenced in FR-1 — primary delivery remains webhook push + SSE. Acceptance: a simulated 1-hour outage results in zero permanently missing events after backfill.
- **Monitoring & alerting:** uptime checks on app and webhook endpoints; error tracking (Sentry); queue-depth and DLQ alerts; ingestion-latency alert when p95 event-to-dashboard exceeds 60s. Founder paged for hard-down and DLQ-growth conditions.

### 7.4 Scalability

- **Per-team volumes:** design assumption of up to ~5,000 events/day per active team (multiple agents committing/PR-ing continuously); ingestion path sized for 10x burst (agent fan-out runs).
- **Growth target:** architecture must support 1,000 paid seats without redesign — achievable on a single Postgres instance with proper indexing and 12-month retention; queue and stateless workers scale horizontally on Railway.
- **Scaling levers (deferred until needed):** read replicas for feed queries, table partitioning of `events` by month, moving SSE fan-out to a managed pub/sub (e.g. Pusher/Ably) beyond ~500 concurrent dashboard sessions.
- **Cost guardrail:** infrastructure cost should remain a small fraction of revenue at 1,000 seats; monthly cost review once paid usage begins.

---

**Editor's note for sections outside this excerpt (apply alongside the above):**
- **§9.2:** replace "Vercel/Supabase or similar" with the §5.1 stack verbatim: "Next.js (App Router, TypeScript) on Vercel; Postgres on Railway or Neon; BullMQ + Redis (managed Railway Redis) for queuing and pub/sub fan-out; SSE for real-time; GitHub OAuth via NextAuth/Auth.js; Slack for alerts."
- **Risk §10.1:** replace "MVP uses near-real-time polling + GitHub webhooks rather than full streaming" with: "MVP is webhook-first with SSE push fan-out to the dashboard (per FR-5, §5.1/5.2); API polling is used only as a backfill/fallback path for missed deliveries or webhook-less sources (per FR-1). Residual risk: webhook delivery gaps from third-party sources, mitigated by the backfill job in §7.3."

## 8. Success Metrics

### 8.1 North Star Metric

**Weekly morning-active teams**: teams that check the dashboard on **≥4 mornings per week**. This captures the core habit (the morning briefing ritual) and is the leading indicator of retention and willingness to pay.

### 8.2 KPI Framework

| Stage | Metric | Target |
|---|---|---|
| Acquisition | Customer acquisition cost (CAC) | $10–15 per signup via community channels |
| Acquisition | Signups/week post-launch | Growing week-over-week through Phase 3 |
| Activation | Signup → connected GitHub + ≥1 agent | ≥60% of signups |
| Activation | Time to first value | <5 minutes (median) |
| Engagement | Weekly morning-active teams (north star) | ≥40% of active teams hit ≥4 mornings/week |
| Engagement | Morning check duration | <2 minutes median (low is good — signals efficient triage) |
| Retention | Monthly logo churn | <5% |
| Retention | Pilot → paid conversion | 20% |
| Revenue | Pricing | $15–49/developer/month tiers |
| Revenue | Milestone | 1,000 paid subscriptions |

### 8.3 Analytics Implementation

**Event tracking (minimum set)**
- `signup_completed`, `github_connected`, `agent_connected` (with agent type)
- `dashboard_viewed` (with local time-of-day to compute morning activity)
- `card_expanded`, `filter_applied`, `grouping_changed`, `timeline_viewed`
- `alert_sent` / `alert_clicked` (Slack)
- `needs_attention_resolved`, `external_link_clicked` (jump to PR/agent)
- `subscription_started`, `subscription_upgraded`, `subscription_cancelled` (with exit reason)

**Dashboards**
- Activation funnel (signup → integrations → first morning check).
- North-star dashboard: weekly morning-active teams, trended.
- Revenue dashboard: MRR, churn, pilot conversion, progress to 1,000 paid subs.

**Experimentation**: lightweight A/B capability (feature flags) for onboarding flow and briefing-screen layout variants; minimum one experiment live during Phase 3.

**Review cadence**: weekly metrics review during Phases 1–3 (solo founder, 30 min); monthly deep-dive on retention cohorts and churn reasons from Phase 3 onward.

## 9. Implementation Plan

### 9.1 Phases

Note: the executive timeline in Section 1.3 includes Phase 0 (Week 0 discovery) as its first milestone; the MVP build (Phase 1, Weeks 1–2) does not start until Phase 0's exit criteria are met.

| Phase | Timeline | Scope | Exit criteria |
|---|---|---|---|
| **0 — Discovery** | Week 0 | 10–15 problem interviews with teams running coding agents; validate morning-briefing workflow; confirm agent/API access paths; finalize MVP cut. Recruit a pilot pool of ≥5 committed teams — intentionally over-recruited so that at least 3 can be actively onboarded in Phase 2, with the remainder as a buffer against drop-off and a waitlist for launch. | ≥5 teams committed to pilot pool; MVP spec frozen |
| **1 — MVP** | Weeks 1–2 | GitHub integration + 2 agents (e.g., Cursor background agents, Devin); activity feed dashboard; Slack alerts for failures/needs-attention. | Founder dogfooding daily; <5 min time-to-value verified |
| **2 — Pilot** | Weeks 3–6 | Onboard at least 3 of the 5+ committed teams from the Phase 0 pool (capped at 3 active pilots to keep weekly feedback loops manageable for a solo founder; remaining committed teams stay warm as backfill/waitlist); weekly feedback loops; iterate on the morning workflow (grouping, filters, alert tuning); instrument analytics. | ≥2 of 3 active pilots morning-active ≥4 days/week; pilot NPS feedback incorporated |
| **3 — Launch** | Weeks 7–12 | Self-serve billing ($15–49/dev/mo); public launch (waitlisted pilot-pool teams onboarded first); community GTM via Reddit (r/ExperiencedDevs, r/ChatGPTCoding, agent subreddits) and YouTube (dev-tool reviewers, demo content). | Paid conversions at ~20% of trials/pilots; churn tracking live |
| **4 — Expansion** | Months 4–6 | Analytics add-on (agent productivity/throughput reporting); enterprise tier (SSO, audit log, priority support); additional agent integrations by demand. | First analytics add-on and enterprise customers; path to 1,000 paid subs |

### 9.2 Resource Allocation (Solo Founder, $0–10K Budget)

| Area | Approach | Est. cost |
|---|---|---|
| Engineering | Solo founder + AI coding tools (Claude Code, Cursor) for ~3–5x throughput; managed infra (Vercel/Supabase or similar) to avoid ops work | $50–200/mo infra |
| Design | Component library (e.g., shadcn/ui) + AI-assisted design; no designer hire | ~$0 |
| GTM | Founder-led content on Reddit/YouTube; no paid ads until CAC of $10–15 is provable on small tests | $0–2K experiments |
| Tooling/APIs | Agent/GitHub API costs, analytics, billing (Stripe) | $100–300/mo |
| Contingency | Legal (ToS/privacy), domain, incidentals | $1–2K |

Total projected spend through month 6: well within the $10K ceiling; largest constraint is founder time, mitigated by ruthless MVP scoping (Section 9.1) and AI tooling.

## 10. Risks and Mitigations

### 10.1 Technical Risks

| Risk | Probability | Impact | Mitigation | Early-warning signals |
|---|---|---|---|---|
| API changes/deprecation by Cursor or Devin breaks integrations | High | High | Adapter-pattern integration layer so each agent connector is isolated and replaceable; contract tests run daily against live APIs; graceful degradation (stale-data banner, not blank dashboard) | Vendor changelog/deprecation notices; rising connector error rates; pilot reports of missing activity |
| No official APIs for some agents (scraping/webhook workarounds) | High | Medium | Prioritize agents with official APIs for MVP's 2 integrations; for others, use GitHub-side signals (PRs, commits, checks) as the universal fallback data source; lobby vendors for API access as a visible integration partner | Workaround breakage frequency; support tickets per unofficial integration |
| Real-time sync complexity (missed/duplicate events, ordering) | Medium | Medium | MVP uses near-real-time polling + GitHub webhooks rather than full streaming; idempotent event ingestion with dedupe keys; "last synced" timestamp visible in UI to set expectations | Event-lag metrics >5 min; duplicate-card bug reports |
| API cost management (polling many repos/agents at scale) | Medium | Medium | Per-team rate budgets; webhook-first architecture; caching; usage-based internal cost dashboard from Phase 2; pricing tiers ($15–49/dev/mo) sized to cover marginal API cost | API spend per team trending above gross margin threshold; rate-limit errors |

### 10.2 Business Risks

| Risk | Probability | Impact | Mitigation | Early-warning signals |
|---|---|---|---|---|
| Platform consolidation — GitHub ships native multi-agent dashboard | Medium | High | Differentiate on cross-platform coverage (GitHub will favor its own agents), the opinionated morning-briefing workflow, and Slack-native alerting; build the analytics add-on (Phase 4) as defensible depth | GitHub Universe/roadmap announcements; GitHub Agents UI feature expansion |
| Incumbent response — Datadog (or similar observability vendor) enters the space | Medium | Medium | Win on price ($15–49/dev/mo vs. enterprise observability pricing), zero-config setup (<5 min), and developer-team focus vs. platform-team focus; move fast on agent coverage | Incumbent product announcements; pilot prospects citing Datadog evaluation |
| Adoption uncertainty — teams don't form the morning-check habit | Medium | High | Phase 0 discovery validates demand before build (≥5-team committed pilot pool as the gate); Phase 2 pilot explicitly tests the habit metric (≥4 mornings/week) with the 3 active pilot teams before launch spend; Slack alerts pull users back daily | Pilot morning-active rate <40%; <20% pilot-to-paid conversion; churn >5% |
| Single-founder bus factor | High | Medium | Boring, managed infrastructure with documented runbooks; automated deploys, backups, and alerting; status page; revenue milestone (1,000 paid subs) triggers first hire/contractor; key credentials in escrow | Founder pages/incidents requiring >24h response; support backlog growth |

