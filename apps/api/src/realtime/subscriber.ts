import { Redis } from 'ioredis';
import { config } from '../config/env.js';
import { query } from '../db/pool.js';
import { rowToActivityEvent, type EventRow } from './serialize.js';
import { pushToWorkspace } from './hub.js';
import { AGENT_EVENTS_CHANNEL } from './publish.js';

/** Cap on the LRU of recently-delivered event ids (matches the replay cap, §4.1). */
const DEDUPE_CAPACITY = 1000;

/**
 * LRU of the last 1000 delivered event ids. The same event can arrive twice (the
 * Redis pub/sub path plus the in-process emitter shortcut, §4.1), so we push once.
 * A `Map` preserves insertion order, which doubles as recency for eviction.
 */
const recent = new Map<string, true>();

function alreadySeen(eventId: string): boolean {
  if (recent.has(eventId)) {
    // Refresh recency: delete + re-insert moves it to the newest slot.
    recent.delete(eventId);
    recent.set(eventId, true);
    return true;
  }
  recent.set(eventId, true);
  if (recent.size > DEDUPE_CAPACITY) {
    const oldest = recent.keys().next().value;
    if (oldest !== undefined) recent.delete(oldest);
  }
  return false;
}

/** Same columns + LEFT JOIN agents as feed.ts, by id, so the SSE wire shape matches /events. */
const EVENT_BY_ID_SQL = `
  SELECT e.id, e.source, e.agent_id, a.slug AS agent_slug, e.actor, e.actor_kind,
         e.confidence, e.repo, e.action_type, e.impact, e.occurred_at, e.stored_at,
         e.payload_ref, e.workspace_id
  FROM events e
  LEFT JOIN agents a ON a.id = e.agent_id
  WHERE e.id = $1
  LIMIT 1
`;

let subscriber: Redis | null = null;

/**
 * Start the dedicated ioredis subscriber on `agent_events`. Idempotent — a second
 * call is a no-op. On each message (an event id) it loads the row, serializes it,
 * and fans it out to that workspace's open SSE connections.
 */
export async function startAgentEventsSubscriber(): Promise<void> {
  if (subscriber) return;
  const sub = new Redis(config.REDIS_URL);
  subscriber = sub;

  sub.on('message', (channel: string, eventId: string) => {
    if (channel !== AGENT_EVENTS_CHANNEL) return;
    // One bad message must never tear down the subscriber.
    void handleMessage(eventId).catch((err: unknown) => {
      console.error('[sse] agent_events message failed', err);
    });
  });

  await sub.subscribe(AGENT_EVENTS_CHANNEL);
}

async function handleMessage(eventId: string): Promise<void> {
  if (alreadySeen(eventId)) return;
  const rows = await query<EventRow & { workspace_id: string }>(EVENT_BY_ID_SQL, [eventId]);
  const row = rows[0];
  if (!row) return; // event vanished (deleted/retention) — nothing to push
  const ev = rowToActivityEvent(row);
  pushToWorkspace(row.workspace_id, ev);
}
