import type { NormalizeJobData } from '../jobs/queues.js';
import type { ActionType } from '@dashy/shared';
import { query } from '../db/pool.js';
import { newId } from '../lib/ids.js';
import { attribute } from '../attribution/attribute.js';
import { publishAgentEvent } from '../realtime/publish.js';
import { evaluateSlackRules } from '../notifications/slack/rules.js';

/**
 * Pure GitHub event -> canonical-event mapper. Extracted from `normalizeJob` so the
 * mapping rules (action map, impact, metadata-only payload_ref) can be unit-tested
 * without a database. Returns `null` for events we don't ingest in v0.1.
 *
 * Action map (docs/ARCHITECTURE.md §2, CLAUDE.md):
 *   pull_request.opened              -> pr_opened
 *   pull_request.closed + merged     -> pr_merged
 *   pull_request.closed + !merged    -> pr_closed
 *   push                             -> commit_pushed
 *   issues.opened                    -> issue_opened
 *   issues.closed                    -> issue_closed
 */
export function mapGithubEvent(
  event: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- public test helper: raw webhook payload is intentionally untyped
  payload: any,
): { action_type: ActionType; repo: string | null; actor: string | null; impact: string; occurred_at: string; payload_ref: Record<string, unknown> } | null {
  const repo: string | null = payload?.repository?.full_name ?? null;
  const defaultBranch: string | undefined = payload?.repository?.default_branch ?? undefined;
  const now = new Date().toISOString();

  let action_type: ActionType;
  let actor: string | null;
  let occurred_at: string;
  let impact: string;
  const payload_ref: Record<string, unknown> = {};

  switch (event) {
    case 'pull_request': {
      const pr = payload?.pull_request;
      const ghAction: string | undefined = payload?.action;
      if (ghAction === 'opened') {
        action_type = 'pr_opened';
        impact = 'medium';
      } else if (ghAction === 'closed') {
        if (pr?.merged) {
          action_type = 'pr_merged';
          impact = 'high';
        } else {
          action_type = 'pr_closed';
          impact = 'low';
        }
      } else {
        return null; // other PR actions (edited, synchronize, ...) are not ingested
      }
      actor = payload?.sender?.login ?? pr?.user?.login ?? null;
      occurred_at = pr?.updated_at ?? pr?.created_at ?? now;
      if (typeof pr?.number === 'number') payload_ref.pr_number = pr.number;
      if (pr?.html_url) payload_ref.url = pr.html_url;
      if (pr?.title) payload_ref.title = pr.title;
      if (typeof pr?.additions === 'number') payload_ref.additions = pr.additions;
      if (typeof pr?.deletions === 'number') payload_ref.deletions = pr.deletions;
      if (pr?.base?.ref) payload_ref.base_branch = pr.base.ref;
      if (defaultBranch) payload_ref.default_branch = defaultBranch;
      break;
    }

    case 'push': {
      action_type = 'commit_pushed';
      impact = 'low';
      actor = payload?.sender?.login ?? payload?.pusher?.name ?? null;
      occurred_at = payload?.head_commit?.timestamp ?? payload?.repository?.pushed_at ?? now;
      const commits = Array.isArray(payload?.commits) ? payload.commits : undefined;
      if (commits) payload_ref.commit_count = commits.length;
      if (payload?.compare) payload_ref.url = payload.compare;
      if (payload?.head_commit?.message) payload_ref.title = payload.head_commit.message;
      if (typeof payload?.ref === 'string') payload_ref.base_branch = payload.ref.replace('refs/heads/', '');
      if (defaultBranch) payload_ref.default_branch = defaultBranch;
      break;
    }

    case 'issues': {
      const issue = payload?.issue;
      const ghAction: string | undefined = payload?.action;
      if (ghAction === 'opened') {
        action_type = 'issue_opened';
        impact = 'medium';
      } else if (ghAction === 'closed') {
        action_type = 'issue_closed';
        impact = 'medium';
      } else {
        return null; // other issue actions are not ingested
      }
      actor = payload?.sender?.login ?? issue?.user?.login ?? null;
      occurred_at = issue?.updated_at ?? issue?.created_at ?? now;
      if (typeof issue?.number === 'number') payload_ref.issue_number = issue.number;
      if (issue?.html_url) payload_ref.url = issue.html_url;
      if (issue?.title) payload_ref.title = issue.title;
      if (defaultBranch) payload_ref.default_branch = defaultBranch;
      break;
    }

    default:
      return null; // unsupported event type
  }

  return { action_type, repo, actor, impact, occurred_at, payload_ref };
}

/**
 * BullMQ 'normalize' worker handler: maps a raw GitHub webhook payload to the
 * canonical event, runs attribution, and inserts idempotently. Redelivered
 * webhooks converge via ON CONFLICT (workspace_id, dedup_key) DO NOTHING.
 */
export async function normalizeJob(job: { data: NormalizeJobData }): Promise<void> {
  const { sourceId, workspaceId, deliveryId, event, payload } = job.data;

  const mapped = mapGithubEvent(event, payload);
  if (!mapped) return; // unsupported event — skip

  const { agentSlug, actorKind, confidence } = attribute(mapped.actor, payload);

  // Resolve the workspace-scoped agent row for this slug (if attributed).
  let agentId: string | null = null;
  if (agentSlug) {
    const rows = await query<{ id: string }>(
      'SELECT id FROM agents WHERE workspace_id = $1 AND slug = $2 LIMIT 1',
      [workspaceId, agentSlug],
    );
    agentId = rows[0]?.id ?? null;
  }

  const dedupKey = `gh:${deliveryId}`;

  const inserted = await query<{ id: string }>(
    `INSERT INTO events (
       id, workspace_id, source_id, source, agent_id, agent_hint,
       repo, actor, actor_login, actor_kind, confidence,
       action_type, impact, occurred_at, dedup_key, payload_ref
     ) VALUES (
       $1, $2, $3, 'github', $4, $5,
       $6, $7, $7, $8, $9,
       $10, $11, $12, $13, $14
     )
     ON CONFLICT (workspace_id, dedup_key) DO NOTHING
     RETURNING id`,
    [
      newId('evt'),
      workspaceId,
      sourceId,
      agentId,
      agentSlug,
      mapped.repo,
      mapped.actor,
      actorKind,
      confidence,
      mapped.action_type,
      mapped.impact,
      mapped.occurred_at,
      dedupKey,
      JSON.stringify(mapped.payload_ref),
    ],
  );

  // ON CONFLICT no-op (redelivered webhook) returns no row — only fan out for a
  // genuinely new event. Post-commit fan-out is best-effort: a Slack/Redis hiccup
  // must never fail (and thus retry/duplicate) this job.
  const eventId = inserted[0]?.id;
  if (!eventId) return;

  try {
    await publishAgentEvent(eventId);
    await evaluateSlackRules({
      workspaceId,
      eventId,
      action_type: mapped.action_type,
      actor_kind: actorKind,
      repo: mapped.repo,
      payload_ref: mapped.payload_ref,
    });
  } catch (err) {
    console.error('[normalize] post-insert fan-out failed', { eventId, err });
  }
}
