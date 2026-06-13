import type { FastifyPluginAsync } from 'fastify';
import { query } from '../../db/pool.js';
import { newId } from '../../lib/ids.js';
import { encrypt, decrypt } from '../../lib/crypto.js';
import { getSession } from '../session.js';
import { postToSlack } from '../../notifications/slack/client.js';

const SLACK_HOST = 'hooks.slack.com';

interface WebhookRow {
  id: string;
  name: string;
  url_masked: string;
  status: string;
  last_delivery_at: string | null;
}

interface RuleRow {
  id: string;
  webhook_id: string | null;
  repo_id: string | null;
  event_types: string[];
  enabled: boolean;
  created_at: string;
}

/**
 * Mask a Slack webhook URL for display: keep the scheme + host and the first path
 * token (e.g. `services`), replacing everything that follows with a bullet token so
 * the secret tail (`T.../B.../XXXX`) is never returned. The plaintext lives only in
 * the AES-encrypted `url_encrypted` column.
 */
export function maskSlackUrl(rawUrl: string): string {
  const u = new URL(rawUrl);
  const base = `${u.protocol}//${u.host}`;
  const first = u.pathname.split('/').filter(Boolean)[0];
  return first ? `${base}/${first}/•••` : `${base}/•••`;
}

/** Returns the parsed URL if it is a valid https hooks.slack.com URL, else null. */
function parseSlackUrl(rawUrl: string): URL | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (u.hostname !== SLACK_HOST) return null;
  return u;
}

const plugin: FastifyPluginAsync = async (app) => {
  // GET /api/v1/integrations/slack — webhooks (masked) + alert rules for the workspace.
  app.get('/integrations/slack', async (req, reply) => {
    const session = getSession(req);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });

    const [webhooks, rules] = await Promise.all([
      query<WebhookRow>(
        `SELECT id, name, url_masked, status, last_delivery_at
           FROM slack_webhooks
          WHERE workspace_id = $1
          ORDER BY created_at DESC`,
        [session.workspaceId],
      ),
      query<RuleRow>(
        `SELECT id, webhook_id, repo_id, event_types, enabled, created_at
           FROM slack_alert_rules
          WHERE workspace_id = $1
          ORDER BY created_at DESC`,
        [session.workspaceId],
      ),
    ]);

    return reply.send({ webhooks, rules });
  });

  // POST /api/v1/integrations/slack — register a webhook (URL encrypted, returned masked).
  app.post<{ Body: { name?: unknown; url?: unknown } }>(
    '/integrations/slack',
    async (req, reply) => {
      const session = getSession(req);
      if (!session) return reply.code(401).send({ error: 'unauthorized' });

      const { name, url } = req.body ?? {};
      if (typeof name !== 'string' || name.length === 0 || typeof url !== 'string') {
        return reply.code(400).send({ error: 'invalid_body' });
      }

      const parsed = parseSlackUrl(url);
      if (!parsed) return reply.code(400).send({ error: 'invalid_slack_url' });

      const urlMasked = maskSlackUrl(url);
      const inserted = await query<WebhookRow>(
        `INSERT INTO slack_webhooks (id, workspace_id, name, url_encrypted, url_masked)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, url_masked, status, last_delivery_at`,
        [newId('wh'), session.workspaceId, name, encrypt(url), urlMasked],
      );

      return reply.send({ webhook: inserted[0] });
    },
  );

  // DELETE /api/v1/integrations/slack/:id — remove a webhook scoped to the workspace.
  app.delete<{ Params: { id: string } }>(
    '/integrations/slack/:id',
    async (req, reply) => {
      const session = getSession(req);
      if (!session) return reply.code(401).send({ error: 'unauthorized' });

      await query(
        `DELETE FROM slack_webhooks WHERE id = $1 AND workspace_id = $2`,
        [req.params.id, session.workspaceId],
      );
      return reply.send({ ok: true });
    },
  );

  // POST /api/v1/integrations/slack/test — post a test alert to a webhook.
  app.post<{ Body: { webhookId?: unknown } }>(
    '/integrations/slack/test',
    async (req, reply) => {
      const session = getSession(req);
      if (!session) return reply.code(401).send({ error: 'unauthorized' });

      const { webhookId } = req.body ?? {};
      if (typeof webhookId !== 'string') {
        return reply.code(400).send({ error: 'invalid_body' });
      }

      const rows = await query<{ url_encrypted: Buffer }>(
        `SELECT url_encrypted FROM slack_webhooks WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
        [webhookId, session.workspaceId],
      );
      const row = rows[0];
      if (!row) return reply.code(404).send({ error: 'webhook_not_found' });

      const webhookUrl = decrypt(row.url_encrypted);
      const { status } = await postToSlack(webhookUrl, {
        text: 'Dashy.ai test alert — your Slack integration is connected.',
      });

      return reply.send({ status });
    },
  );

  // POST /api/v1/integrations/slack/rules — create an alert rule.
  app.post<{ Body: { webhookId?: unknown; repoId?: unknown; eventTypes?: unknown } }>(
    '/integrations/slack/rules',
    async (req, reply) => {
      const session = getSession(req);
      if (!session) return reply.code(401).send({ error: 'unauthorized' });

      const { webhookId, repoId, eventTypes } = req.body ?? {};
      const repoIdValue = repoId == null ? null : repoId;
      if (
        typeof webhookId !== 'string' ||
        (repoIdValue !== null && typeof repoIdValue !== 'string') ||
        !Array.isArray(eventTypes) ||
        !eventTypes.every((t) => typeof t === 'string')
      ) {
        return reply.code(400).send({ error: 'invalid_body' });
      }

      const inserted = await query<RuleRow>(
        `INSERT INTO slack_alert_rules (id, workspace_id, webhook_id, repo_id, event_types)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, webhook_id, repo_id, event_types, enabled, created_at`,
        [newId('rule'), session.workspaceId, webhookId, repoIdValue, eventTypes],
      );

      return reply.send({ rule: inserted[0] });
    },
  );

  // DELETE /api/v1/integrations/slack/rules/:id — remove a rule scoped to the workspace.
  app.delete<{ Params: { id: string } }>(
    '/integrations/slack/rules/:id',
    async (req, reply) => {
      const session = getSession(req);
      if (!session) return reply.code(401).send({ error: 'unauthorized' });

      await query(
        `DELETE FROM slack_alert_rules WHERE id = $1 AND workspace_id = $2`,
        [req.params.id, session.workspaceId],
      );
      return reply.send({ ok: true });
    },
  );
};

export default plugin;
