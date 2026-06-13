import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { activityEventSchema, type ActivityEvent } from '@dashy/shared';
import { query } from '../../db/pool.js';
import { getSession } from '../session.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** A row as selected by the feed query: events columns + the joined agent slug. */
interface FeedRow {
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
 * The SELECT shared by /events and /feed. LEFT JOIN agents to resolve the slug
 * (events.agent_id -> agents.slug); keyset paginate over (occurred_at, id) using
 * idx_events_feed. The cursor predicate is appended only when a cursor is supplied.
 */
function pageSql(hasCursor: boolean): string {
  return `
    SELECT e.id, e.source, e.agent_id, a.slug AS agent_slug, e.actor, e.actor_kind,
           e.confidence, e.repo, e.action_type, e.impact, e.occurred_at, e.stored_at,
           e.payload_ref
    FROM events e
    LEFT JOIN agents a ON a.id = e.agent_id
    WHERE e.workspace_id = $1
      ${hasCursor ? 'AND (e.occurred_at, e.id) < ($2::timestamptz, $3)' : ''}
    ORDER BY e.occurred_at DESC, e.id DESC
    LIMIT ${hasCursor ? '$4' : '$2'}
  `;
}

/** Map a DB row to the canonical wire shape and validate it so the contract can't drift. */
function toEvent(row: FeedRow): ActivityEvent {
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

/** base64(`${occurred_at}|${id}`) — opaque keyset cursor over the feed ordering. */
function encodeCursor(occurredAt: string, id: string): string {
  return Buffer.from(`${occurredAt}|${id}`, 'utf8').toString('base64');
}

function decodeCursor(raw: string): { occurredAt: string; id: string } | null {
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8');
    const sep = decoded.indexOf('|');
    if (sep < 0) return null;
    const occurredAt = decoded.slice(0, sep);
    const id = decoded.slice(sep + 1);
    if (!occurredAt || !id) return null;
    return { occurredAt, id };
  } catch {
    return null;
  }
}

function parseLimit(raw: unknown): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

/** Fetch one keyset page (newest first) with its nextCursor. */
async function fetchPage(
  workspaceId: string,
  cursor: { occurredAt: string; id: string } | null,
  limit: number,
): Promise<{ events: ActivityEvent[]; nextCursor: string | null }> {
  // Over-fetch by one to know whether a further page exists.
  const fetchLimit = limit + 1;
  const params = cursor
    ? [workspaceId, cursor.occurredAt, cursor.id, fetchLimit]
    : [workspaceId, fetchLimit];
  const rows = await query<FeedRow>(pageSql(cursor !== null), params);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const events = pageRows.map(toEvent);

  let nextCursor: string | null = null;
  if (hasMore) {
    const last = pageRows[pageRows.length - 1]!;
    nextCursor = encodeCursor(last.occurred_at.toISOString(), last.id);
  }
  return { events, nextCursor };
}

function requireSession(
  req: FastifyRequest,
  reply: FastifyReply,
): { workspaceId: string } | null {
  const session = getSession(req);
  if (!session) {
    void reply.code(401).send({ error: 'unauthorized' });
    return null;
  }
  return { workspaceId: session.workspaceId };
}

interface SummaryRow {
  prs_opened: string;
  prs_merged: string;
  issues_closed: string;
  commits: string;
  agents_active: string;
}

const plugin: FastifyPluginAsync = async (app) => {
  // GET /api/v1/events — keyset-paginated activity feed for the session workspace.
  app.get('/events', async (req, reply) => {
    const ctx = requireSession(req, reply);
    if (!ctx) return;

    const q = req.query as { cursor?: string; limit?: string };
    const limit = parseLimit(q.limit);

    let cursor: { occurredAt: string; id: string } | null = null;
    if (q.cursor) {
      cursor = decodeCursor(q.cursor);
      if (!cursor) return reply.code(400).send({ error: 'invalid_cursor' });
    }

    const page = await fetchPage(ctx.workspaceId, cursor, limit);
    return reply.send(page);
  });

  // GET /api/v1/feed — 24h summary header + first page of newest events.
  app.get('/feed', async (req, reply) => {
    const ctx = requireSession(req, reply);
    if (!ctx) return;

    const [summaryRows, page] = await Promise.all([
      query<SummaryRow>(
        `
        SELECT
          COUNT(*) FILTER (WHERE action_type = 'pr_opened')     AS prs_opened,
          COUNT(*) FILTER (WHERE action_type = 'pr_merged')     AS prs_merged,
          COUNT(*) FILTER (WHERE action_type = 'issue_closed')  AS issues_closed,
          COUNT(*) FILTER (WHERE action_type = 'commit_pushed') AS commits,
          COUNT(DISTINCT agent_id)                              AS agents_active
        FROM events
        WHERE workspace_id = $1
          AND occurred_at >= now() - interval '24 hours'
        `,
        [ctx.workspaceId],
      ),
      fetchPage(ctx.workspaceId, null, DEFAULT_LIMIT),
    ]);

    const s = summaryRows[0];
    const summary = {
      prs_opened: Number(s?.prs_opened ?? 0),
      prs_merged: Number(s?.prs_merged ?? 0),
      issues_closed: Number(s?.issues_closed ?? 0),
      commits: Number(s?.commits ?? 0),
      agents_active: Number(s?.agents_active ?? 0),
    };

    return reply.send({ summary, events: page.events });
  });
};

export default plugin;
