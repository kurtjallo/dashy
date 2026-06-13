import { activityEventSchema, type ActivityEvent } from '@dashy/shared';

/**
 * A row as selected by the SSE queries: the `events` columns plus the joined
 * agent slug. Intentionally identical to `FeedRow` in http/routes/feed.ts so the
 * live stream emits the exact same wire shape as `GET /api/v1/events`.
 * `occurred_at`/`stored_at` arrive as `Date` from node-pg (TIMESTAMPTZ).
 */
export interface EventRow {
  id: string;
  source: string;
  agent_id: string | null;
  agent_slug: string | null;
  actor: string | null;
  actor_kind: string;
  confidence: string;
  repo: string | null;
  action_type: string;
  impact: string;
  occurred_at: Date;
  stored_at: Date;
  payload_ref: unknown;
}

/**
 * Map a DB row to the canonical wire shape and validate it so the contract can't
 * drift. Mirrors `toEvent()` in http/routes/feed.ts exactly (same columns, same
 * `activityEventSchema.parse()`); `agent` is always the resolved slug, never the
 * raw `agent_hint`.
 */
export function rowToActivityEvent(row: EventRow): ActivityEvent {
  return activityEventSchema.parse({
    id: row.id,
    source: row.source,
    agent_id: row.agent_id,
    agent: row.agent_slug ?? null,
    actor: row.actor,
    actor_kind: row.actor_kind,
    confidence: row.confidence,
    repo: row.repo,
    action_type: row.action_type,
    impact: row.impact,
    occurred_at: row.occurred_at.toISOString(),
    stored_at: row.stored_at.toISOString(),
    payload_ref: (row.payload_ref ?? null) as ActivityEvent['payload_ref'],
  });
}

/**
 * Serialize one event into the canonical SSE `activity` frame (ARCHITECTURE.md §4.2):
 *
 *   id: <ulid>\nevent: activity\ndata: <json>\n\n
 *
 * `id:` is the event ULID, which is what makes browser `Last-Event-ID` replay work
 * for free. Single source of truth — used by both the live hub and the replay path
 * so the two can never drift.
 */
export function activityFrame(ev: ActivityEvent): string {
  return `id: ${ev.id}\nevent: activity\ndata: ${JSON.stringify(ev)}\n\n`;
}
