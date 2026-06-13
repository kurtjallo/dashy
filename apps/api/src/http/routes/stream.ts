import type { FastifyPluginAsync } from 'fastify';
import { query } from '../../db/pool.js';
import { getSession } from '../session.js';
import { rowToActivityEvent, activityFrame, type EventRow } from '../../realtime/serialize.js';
import { addConnection, removeConnection } from '../../realtime/hub.js';

/** Last-Event-ID replay is capped at the last 1000 events/workspace (§4.2). */
const REPLAY_LIMIT = 1000;

/**
 * Replay query: events newer than the client's last id. ULIDs sort
 * lexicographically by time, so `id > $2 ORDER BY id ASC` is a chronological
 * catch-up. Same columns + LEFT JOIN agents as feed.ts so frames match /events.
 */
const REPLAY_SQL = `
  SELECT e.id, e.source, e.agent_id, a.slug AS agent_slug, e.actor, e.actor_kind,
         e.confidence, e.repo, e.action_type, e.impact, e.occurred_at, e.stored_at,
         e.payload_ref
  FROM events e
  LEFT JOIN agents a ON a.id = e.agent_id
  WHERE e.workspace_id = $1 AND e.id > $2
  ORDER BY e.id ASC
  LIMIT ${REPLAY_LIMIT}
`;

const plugin: FastifyPluginAsync = async (app) => {
  // GET /api/v1/stream — Server-Sent Events live feed for the session workspace.
  app.get('/stream', async (req, reply) => {
    const session = getSession(req);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });

    // Take over the socket: Fastify will not send a reply for this request.
    reply.hijack();
    const raw = reply.raw;

    raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Reconnect catch-up. A full page back means the client is further behind than
    // the replay window can serve -> tell it to refetch the feed instead.
    const lastEventId = (req.headers['last-event-id'] as string | undefined) ?? null;
    if (lastEventId) {
      try {
        const rows = await query<EventRow>(REPLAY_SQL, [session.workspaceId, lastEventId]);
        if (rows.length >= REPLAY_LIMIT) {
          raw.write('event: resync\ndata: {}\n\n');
        } else {
          for (const row of rows) {
            raw.write(activityFrame(rowToActivityEvent(row)));
          }
        }
      } catch (err) {
        req.log.warn({ err }, 'sse replay failed');
      }
    }

    const conn = addConnection(session.workspaceId, raw, lastEventId);
    raw.on('close', () => removeConnection(conn));
  });
};

export default plugin;
