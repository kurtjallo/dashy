import type { ActivityEvent } from '@dashy/shared';
import { activityFrame } from './serialize.js';

/** Heartbeat interval — a `: ping` comment every 25s defeats proxy idle timeouts (§4.2). */
const HEARTBEAT_MS = 25_000;

/**
 * One open SSE response, scoped to a workspace (ARCHITECTURE.md §4.2). The hub is
 * stateless beyond this map; Postgres is the durable buffer behind `Last-Event-ID`
 * replay, so a process restart loses only open sockets (clients auto-reconnect).
 */
export interface SSEConnection {
  workspaceId: string;
  lastEventId: string | null;
  raw: NodeJS.WritableStream;
  heartbeat?: NodeJS.Timeout;
}

/** workspace_id -> set of open connections. In-process; keyed so a connection only sees its tenant. */
const channels = new Map<string, Set<SSEConnection>>();

/**
 * Best-effort write. If the underlying socket has gone away the write throws (or
 * the stream is already destroyed) — reap the connection so it stops receiving.
 */
function safeWrite(conn: SSEConnection, chunk: string): boolean {
  try {
    // Writing after the socket closed throws (ERR_STREAM_WRITE_AFTER_END) — caught below.
    conn.raw.write(chunk);
    return true;
  } catch {
    removeConnection(conn);
    return false;
  }
}

/** Register an open SSE response for a workspace and start its heartbeat. */
export function addConnection(
  workspaceId: string,
  raw: NodeJS.WritableStream,
  lastEventId: string | null,
): SSEConnection {
  const conn: SSEConnection = { workspaceId, lastEventId, raw };
  conn.heartbeat = setInterval(() => {
    safeWrite(conn, ': ping\n\n');
  }, HEARTBEAT_MS);

  let set = channels.get(workspaceId);
  if (!set) {
    set = new Set<SSEConnection>();
    channels.set(workspaceId, set);
  }
  set.add(conn);
  return conn;
}

/** Remove a connection, stop its heartbeat, and prune the workspace set if empty. */
export function removeConnection(conn: SSEConnection): void {
  if (conn.heartbeat) {
    clearInterval(conn.heartbeat);
    conn.heartbeat = undefined;
  }
  const set = channels.get(conn.workspaceId);
  if (!set) return;
  set.delete(conn);
  if (set.size === 0) channels.delete(conn.workspaceId);
}

/** Push one event to every open connection for its workspace (no-op if none open). */
export function pushToWorkspace(workspaceId: string, ev: ActivityEvent): void {
  const set = channels.get(workspaceId);
  if (!set || set.size === 0) return;
  const data = activityFrame(ev);
  for (const conn of [...set]) {
    safeWrite(conn, data);
  }
}

/** Total open connections across all workspaces (capacity/health telemetry). */
export function connectionCount(): number {
  let total = 0;
  for (const set of channels.values()) total += set.size;
  return total;
}
