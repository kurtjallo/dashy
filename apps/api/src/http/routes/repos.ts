import type { FastifyPluginAsync } from 'fastify';
import crypto from 'node:crypto';
import { query } from '../../db/pool.js';
import { newId } from '../../lib/ids.js';
import { encrypt, decrypt } from '../../lib/crypto.js';
import { getSession } from '../session.js';
import { listRepos, createWebhook } from '../../lib/github.js';
import { config } from '../../config/env.js';

interface SourceRow {
  id: string;
  config: { webhook_secret_enc?: string } & Record<string, unknown>;
}

interface WorkspaceRepoRow {
  id: string;
  workspace_id: string;
  github_repo_id: string;
  full_name: string;
  webhook_id: string | null;
  webhook_status: string;
  created_at: string;
}

/**
 * Resolve (or lazily create) the workspace's single GitHub source, ensuring it
 * carries an AES-encrypted webhook secret. Returns the source id and the
 * decrypted secret to hand to GitHub when installing hooks.
 */
async function getOrCreateGithubSource(
  workspaceId: string,
): Promise<{ sourceId: string; secret: string }> {
  const existing = await query<SourceRow>(
    `SELECT id, config FROM sources WHERE workspace_id = $1 AND type = 'github' LIMIT 1`,
    [workspaceId],
  );

  const src = existing[0];
  if (src) {
    const enc = src.config?.webhook_secret_enc;
    if (enc) {
      return { sourceId: src.id, secret: decrypt(Buffer.from(enc, 'base64')) };
    }
    // Source exists without a secret (shouldn't normally happen) — backfill one.
    const secret = crypto.randomBytes(32).toString('hex');
    const webhookSecretEnc = encrypt(secret).toString('base64');
    await query(
      `UPDATE sources
         SET config = config || jsonb_build_object('webhook_secret_enc', $2::text)
       WHERE id = $1`,
      [src.id, webhookSecretEnc],
    );
    return { sourceId: src.id, secret };
  }

  const sourceId = newId('src');
  const secret = crypto.randomBytes(32).toString('hex');
  const webhookSecretEnc = encrypt(secret).toString('base64');
  await query(
    `INSERT INTO sources (id, workspace_id, type, status, config)
     VALUES ($1, $2, 'github', 'active', jsonb_build_object('webhook_secret_enc', $3::text))`,
    [sourceId, workspaceId, webhookSecretEnc],
  );
  return { sourceId, secret };
}

const plugin: FastifyPluginAsync = async (app) => {
  // GET /api/v1/repos — list the user's GitHub repos with connection status.
  app.get('/repos', async (req, reply) => {
    const session = getSession(req);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });

    const users = await query<{ gh_token_enc: Buffer | null }>(
      `SELECT gh_token_enc FROM users WHERE id = $1`,
      [session.userId],
    );
    const tokenEnc = users[0]?.gh_token_enc ?? null;
    if (!tokenEnc) return reply.code(400).send({ error: 'no_github_token' });

    const token = decrypt(tokenEnc);
    const repos = await listRepos(token);

    const connectedRows = await query<{ github_repo_id: string }>(
      `SELECT github_repo_id FROM workspace_repos WHERE workspace_id = $1`,
      [session.workspaceId],
    );
    const connected = new Set(connectedRows.map((r) => String(r.github_repo_id)));

    return reply.send({
      repos: repos.map((r) => ({
        githubRepoId: r.githubRepoId,
        fullName: r.fullName,
        connected: connected.has(String(r.githubRepoId)),
      })),
    });
  });

  // POST /api/v1/repos — connect a repo: ensure a source, install the webhook.
  app.post<{ Body: { fullName?: unknown; githubRepoId?: unknown } }>(
    '/repos',
    async (req, reply) => {
      const session = getSession(req);
      if (!session) return reply.code(401).send({ error: 'unauthorized' });

      const { fullName, githubRepoId } = req.body ?? {};
      if (typeof fullName !== 'string' || typeof githubRepoId !== 'number') {
        return reply.code(400).send({ error: 'invalid_body' });
      }

      const users = await query<{ gh_token_enc: Buffer | null }>(
        `SELECT gh_token_enc FROM users WHERE id = $1`,
        [session.userId],
      );
      const tokenEnc = users[0]?.gh_token_enc ?? null;
      if (!tokenEnc) return reply.code(400).send({ error: 'no_github_token' });
      const token = decrypt(tokenEnc);

      const { sourceId, secret } = await getOrCreateGithubSource(session.workspaceId);

      const repoId = newId('repo');
      const inserted = await query<WorkspaceRepoRow>(
        `INSERT INTO workspace_repos (id, workspace_id, github_repo_id, full_name, webhook_status)
         VALUES ($1, $2, $3, $4, 'pending')
         RETURNING id, workspace_id, github_repo_id, full_name, webhook_id, webhook_status, created_at`,
        [repoId, session.workspaceId, githubRepoId, fullName],
      );
      const repoRow = inserted[0];
      if (!repoRow) return reply.code(500).send({ error: 'insert_failed' });

      const webhookUrl = `${config.API_BASE_URL}/api/v1/webhooks/github?src=${sourceId}`;

      try {
        const { hookId } = await createWebhook(token, fullName, secret, webhookUrl);
        const updated = await query<WorkspaceRepoRow>(
          `UPDATE workspace_repos
             SET webhook_id = $2, webhook_status = 'installed'
           WHERE id = $1 AND workspace_id = $3
           RETURNING id, workspace_id, github_repo_id, full_name, webhook_id, webhook_status, created_at`,
          [repoRow.id, hookId, session.workspaceId],
        );
        return reply.send({ repo: updated[0] });
      } catch (err) {
        req.log.warn({ err, repo: fullName }, 'webhook install failed');
        const updated = await query<WorkspaceRepoRow>(
          `UPDATE workspace_repos
             SET webhook_status = 'failed'
           WHERE id = $1 AND workspace_id = $2
           RETURNING id, workspace_id, github_repo_id, full_name, webhook_id, webhook_status, created_at`,
          [repoRow.id, session.workspaceId],
        );
        return reply.send({
          repo: updated[0],
          note: 'repo connected but webhook install failed; will retry',
        });
      }
    },
  );
};

export default plugin;
