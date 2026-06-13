/**
 * Slack rule evaluation — the second consumer of the post-insert fan-out
 * (ARCHITECTURE.md §4.4). Runs in-process right after an event commits; maps the
 * event to an alert type (FR-4), matches enabled workspace rules, and enqueues
 * delivery rows. Never throws back to the caller — Slack must never block ingestion.
 */
import { query } from '../../db/pool.js';

/** The event facts needed to decide whether an alert fires. */
export interface SlackRuleInput {
  workspaceId: string;
  eventId: string;
  action_type: string;
  actor_kind: string;
  repo: string | null;
  payload_ref: Record<string, unknown> | null;
}

/**
 * FR-4 mapping from a canonical event to a Slack alert type.
 *  - pr_merged into the default branch by an agent -> protected_branch_merge
 *  - devin_task_failed                              -> agent_run_failed (wired now, fires in v0.2)
 * Returns null when the event does not qualify for any alert.
 */
export function mapAlertType(input: SlackRuleInput): string | null {
  if (
    input.action_type === 'pr_merged' &&
    input.actor_kind === 'agent' &&
    input.payload_ref !== null &&
    typeof input.payload_ref.base_branch === 'string' &&
    typeof input.payload_ref.default_branch === 'string' &&
    input.payload_ref.base_branch === input.payload_ref.default_branch
  ) {
    return 'protected_branch_merge';
  }
  if (input.action_type === 'devin_task_failed') {
    return 'agent_run_failed';
  }
  return null;
}

interface MatchingRuleRow {
  id: string;
  webhook_id: string | null;
}

/**
 * Evaluate the event against the workspace's enabled Slack alert rules and
 * enqueue a pending delivery row per match. Swallows and logs all errors.
 */
export async function evaluateSlackRules(input: SlackRuleInput): Promise<void> {
  try {
    const alertType = mapAlertType(input);
    if (!alertType) return;

    // Resolve the workspace_repos id for the event's repo (owner/name).
    let repoId: string | null = null;
    if (input.repo) {
      const repoRows = await query<{ id: string }>(
        `SELECT id FROM workspace_repos WHERE workspace_id = $1 AND full_name = $2 LIMIT 1`,
        [input.workspaceId, input.repo],
      );
      repoId = repoRows[0]?.id ?? null;
    }

    // Enabled rules for this workspace that target the mapped alert type and are
    // either repo-agnostic (repo_id IS NULL) or scoped to the resolved repo.
    const rules = await query<MatchingRuleRow>(
      `SELECT id, webhook_id
         FROM slack_alert_rules
        WHERE workspace_id = $1
          AND enabled = true
          AND event_types @> ARRAY[$2]::text[]
          AND (repo_id IS NULL OR repo_id = $3)`,
      [input.workspaceId, alertType, repoId],
    );

    for (const rule of rules) {
      await query(
        `INSERT INTO slack_alert_queue (rule_id, webhook_id, event_id, status, next_attempt_at)
         VALUES ($1, $2, $3, 'pending', now())`,
        [rule.id, rule.webhook_id, input.eventId],
      );
    }
  } catch (err) {
    console.error('[slack] evaluateSlackRules failed', { eventId: input.eventId, err });
  }
}
