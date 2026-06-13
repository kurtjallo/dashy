/**
 * Slack delivery worker (ARCHITECTURE.md §4.4). Drains slack_alert_queue: claims
 * due rows with FOR UPDATE SKIP LOCKED, applies the >5-in-5-min digest collapse
 * (FR-8), POSTs Block Kit to hooks.slack.com, and records every terminal outcome
 * in slack_deliveries with latency measured from events.stored_at (the <2min SLO).
 *
 * Intended to run as a BullMQ repeatable job every ~10s. Each row is isolated in a
 * SAVEPOINT so one bad row can never abort the whole drain.
 */
import type { PoolClient } from 'pg';
import { pool } from '../../db/pool.js';
import { decrypt } from '../../lib/crypto.js';
import { postToSlack } from './client.js';
import {
  renderAlertBlocks,
  renderDigestBlocks,
  type SlackAlertEvent,
  type SlackDigestSummary,
} from './blockkit.js';

const CLAIM_LIMIT = 50;
const EXPIRY_MS = 30 * 60 * 1000; // rows older than 30 min are stale -> expired
const DIGEST_THRESHOLD = 5; // alerts 1-5 deliver individually; from #6 we digest
const MAX_ATTEMPTS = 3; // after the 3rd failure the queue row is terminal
const BACKOFFS_SEC = [30, 120, 480]; // next_attempt_at += 30s / 2m / 8m by attempt

/** A claimed queue row joined to its webhook + event. */
interface ClaimRow {
  id: string; // BIGSERIAL, returned as string by pg
  rule_id: string | null;
  webhook_id: string | null;
  event_id: string | null;
  status: string;
  attempts: number;
  digest_group: Date | null;
  created_at: Date;
  url_encrypted: Buffer;
  webhook_status: string;
  stored_at: Date;
  payload_ref: Record<string, unknown> | null;
  action_type: string;
  repo: string | null;
  actor: string | null;
  agent_slug: string | null;
}

const CLAIM_SQL = `
  SELECT q.id, q.rule_id, q.webhook_id, q.event_id, q.status, q.attempts,
         q.digest_group, q.created_at,
         w.url_encrypted, w.status AS webhook_status,
         e.stored_at, e.payload_ref, e.action_type, e.repo, e.actor,
         a.slug AS agent_slug
    FROM slack_alert_queue q
    JOIN slack_webhooks w ON w.id = q.webhook_id
    JOIN events e ON e.id = q.event_id
    LEFT JOIN agents a ON a.id = e.agent_id
   WHERE q.status IN ('pending', 'digesting')
     AND q.next_attempt_at <= now()
   ORDER BY q.next_attempt_at ASC
   FOR UPDATE OF q SKIP LOCKED
   LIMIT ${CLAIM_LIMIT}
`;

function alertTypeFor(actionType: string): string {
  if (actionType === 'pr_merged') return 'protected_branch_merge';
  if (actionType === 'devin_task_failed') return 'agent_run_failed';
  return 'agent_activity';
}

function toAlertEvent(row: ClaimRow): SlackAlertEvent {
  return {
    alert_type: alertTypeFor(row.action_type),
    action_type: row.action_type,
    repo: row.repo,
    actor: row.actor,
    agent: row.agent_slug,
    payload_ref: row.payload_ref,
  };
}

/** POST without throwing — a thrown fetch (timeout/abort) is treated as status 0. */
async function postSafe(url: string, body: unknown): Promise<number> {
  try {
    const { status } = await postToSlack(url, body);
    return status;
  } catch {
    return 0;
  }
}

function isSuccess(status: number): boolean {
  return status >= 200 && status < 300;
}

async function insertDelivery(
  client: PoolClient,
  row: ClaimRow,
  status: 'delivered' | 'failed',
  statusCode: number,
  isDigest: boolean,
  latencyMs: number | null,
): Promise<void> {
  await client.query(
    `INSERT INTO slack_deliveries
       (webhook_id, rule_id, event_id, status, slack_status_code, latency_ms, is_digest)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [row.webhook_id, row.rule_id, row.event_id, status, statusCode || null, latencyMs, isDigest],
  );
}

async function markDelivered(client: PoolClient, row: ClaimRow, statusCode: number): Promise<void> {
  await client.query(`UPDATE slack_alert_queue SET status = 'delivered' WHERE id = $1`, [row.id]);
  // Success also clears a 'failing' webhook back to 'active' (recovery).
  await client.query(
    `UPDATE slack_webhooks SET status = 'active', last_delivery_at = now() WHERE id = $1`,
    [row.webhook_id],
  );
  const latencyMs = Date.now() - row.stored_at.getTime();
  await insertDelivery(client, row, 'delivered', statusCode, false, latencyMs);
}

async function markFailure(client: PoolClient, row: ClaimRow, statusCode: number): Promise<void> {
  const attempts = row.attempts + 1;
  if (attempts >= MAX_ATTEMPTS) {
    await client.query(`UPDATE slack_alert_queue SET status = 'failed', attempts = $2 WHERE id = $1`, [
      row.id,
      attempts,
    ]);
    await client.query(`UPDATE slack_webhooks SET status = 'failing' WHERE id = $1`, [row.webhook_id]);
    await insertDelivery(client, row, 'failed', statusCode, false, null);
    return;
  }
  const backoff = BACKOFFS_SEC[attempts - 1] ?? BACKOFFS_SEC[BACKOFFS_SEC.length - 1] ?? 30;
  await client.query(
    `UPDATE slack_alert_queue
        SET attempts = $2, next_attempt_at = now() + ($3 || ' seconds')::interval
      WHERE id = $1`,
    [row.id, attempts, String(backoff)],
  );
}

/** Count deliveries to (rule, webhook) in the trailing 5 minutes (FR-8 window). */
async function recentDeliveryCount(client: PoolClient, row: ClaimRow): Promise<number> {
  const res = await client.query<{ c: number }>(
    `SELECT count(*)::int AS c
       FROM slack_deliveries
      WHERE rule_id = $1 AND webhook_id = $2
        AND created_at > now() - interval '5 minutes'`,
    [row.rule_id, row.webhook_id],
  );
  return res.rows[0]?.c ?? 0;
}

/** Stamp a pending row into the current 5-min digest bucket and hold it to window close. */
async function holdForDigest(client: PoolClient, row: ClaimRow): Promise<void> {
  await client.query(
    `UPDATE slack_alert_queue
        SET status = 'digesting',
            digest_group   = to_timestamp(floor(extract(epoch from now()) / 300) * 300),
            next_attempt_at = to_timestamp(floor(extract(epoch from now()) / 300) * 300)
                              + interval '5 minutes'
      WHERE id = $1`,
    [row.id],
  );
}

async function deliverIndividual(client: PoolClient, row: ClaimRow): Promise<void> {
  const url = decrypt(row.url_encrypted);
  const status = await postSafe(url, renderAlertBlocks(toAlertEvent(row)));
  if (isSuccess(status)) await markDelivered(client, row, status);
  else await markFailure(client, row, status);
}

function buildDigestSummary(rows: ClaimRow[]): SlackDigestSummary {
  const repos = new Set(rows.map((r) => r.repo).filter((r): r is string => r !== null));
  const mergeCount = rows.filter((r) => r.action_type === 'pr_merged').length;
  const failedCount = rows.filter((r) => r.action_type === 'devin_task_failed').length;
  return {
    repo: repos.size === 1 ? [...repos][0]! : null,
    count: rows.length,
    mergeCount,
    failedCount,
  };
}

/** Flush one digest message for a closed (rule, webhook, window) group. */
async function flushDigest(client: PoolClient, rows: ClaimRow[]): Promise<void> {
  const first = rows[0];
  if (!first) return;
  const ids = rows.map((r) => r.id);
  const url = decrypt(first.url_encrypted);
  const status = await postSafe(url, renderDigestBlocks(buildDigestSummary(rows)));

  if (isSuccess(status)) {
    await client.query(`UPDATE slack_alert_queue SET status = 'delivered' WHERE id = ANY($1::bigint[])`, [
      ids,
    ]);
    await client.query(
      `UPDATE slack_webhooks SET status = 'active', last_delivery_at = now() WHERE id = $1`,
      [first.webhook_id],
    );
    const latencyMs = Date.now() - first.stored_at.getTime();
    await insertDelivery(client, first, 'delivered', status, true, latencyMs);
  } else {
    // Reschedule the whole group for another window-close attempt; give up after MAX_ATTEMPTS.
    const attempts = first.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await client.query(`UPDATE slack_alert_queue SET status = 'failed', attempts = $2 WHERE id = ANY($1::bigint[])`, [
        ids,
        attempts,
      ]);
      await client.query(`UPDATE slack_webhooks SET status = 'failing' WHERE id = $1`, [first.webhook_id]);
      await insertDelivery(client, first, 'failed', status, true, null);
    } else {
      await client.query(
        `UPDATE slack_alert_queue
            SET attempts = $2, next_attempt_at = now() + interval '30 seconds'
          WHERE id = ANY($1::bigint[])`,
        [ids, attempts],
      );
    }
  }
}

/**
 * Drain one batch of due alert queue rows. Claims up to 50 rows under a single
 * transaction (FOR UPDATE SKIP LOCKED keeps it multi-consumer-safe), processes
 * each in its own savepoint, then flushes any closed digest windows.
 */
export async function drainSlackQueue(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const claimed = await client.query<ClaimRow>(CLAIM_SQL);

    // (rule_id|webhook_id|digest_group) -> held rows to collapse into one digest.
    const digestGroups = new Map<string, ClaimRow[]>();

    for (const row of claimed.rows) {
      await client.query('SAVEPOINT sp');
      try {
        // Stale rows are dropped — a late "agent merged to main" alert is worse than none.
        if (Date.now() - row.created_at.getTime() > EXPIRY_MS) {
          await client.query(`UPDATE slack_alert_queue SET status = 'expired' WHERE id = $1`, [row.id]);
          await client.query('RELEASE SAVEPOINT sp');
          continue;
        }

        if (row.status === 'digesting') {
          // Re-claimed at window close — collect for a single grouped flush below.
          const key = `${row.rule_id}|${row.webhook_id}|${row.digest_group?.getTime() ?? 0}`;
          const bucket = digestGroups.get(key);
          if (bucket) bucket.push(row);
          else digestGroups.set(key, [row]);
          await client.query('RELEASE SAVEPOINT sp');
          continue;
        }

        // Pending: deliver individually, unless this (rule, webhook) is already
        // bursting (>5 in the trailing 5 min) — then hold it for the digest.
        const recent = await recentDeliveryCount(client, row);
        if (recent >= DIGEST_THRESHOLD) await holdForDigest(client, row);
        else await deliverIndividual(client, row);

        await client.query('RELEASE SAVEPOINT sp');
      } catch (err) {
        await client.query('ROLLBACK TO SAVEPOINT sp');
        console.error('[slack] delivery row failed', { id: row.id, err });
      }
    }

    for (const rows of digestGroups.values()) {
      await client.query('SAVEPOINT sp');
      try {
        await flushDigest(client, rows);
        await client.query('RELEASE SAVEPOINT sp');
      } catch (err) {
        await client.query('ROLLBACK TO SAVEPOINT sp');
        console.error('[slack] digest flush failed', err);
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[slack] drainSlackQueue failed', err);
  } finally {
    client.release();
  }
}
