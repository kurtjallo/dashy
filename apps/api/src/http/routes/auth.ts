import type { FastifyPluginAsync } from 'fastify';
import { query } from '../../db/pool.js';
import { newId } from '../../lib/ids.js';
import { encrypt } from '../../lib/crypto.js';
import { config } from '../../config/env.js';
import { exchangeCode } from '../../lib/github.js';
import { getSession, setSession, clearSession } from '../session.js';

interface UserRow {
  id: string;
  github_id: string;
  github_login: string;
  email: string | null;
  avatar_url: string | null;
}

interface WorkspaceRow {
  id: string;
  name: string;
}

const BUILTIN_AGENTS: Array<{ slug: string; display_name: string }> = [
  { slug: 'claude-code', display_name: 'Claude Code' },
  { slug: 'cursor', display_name: 'Cursor' },
  { slug: 'devin', display_name: 'Devin' },
  { slug: 'copilot', display_name: 'Copilot' },
];

/** Seed the four builtin agents for a workspace (idempotent on (workspace_id, slug)). */
async function seedBuiltinAgents(workspaceId: string): Promise<void> {
  for (const a of BUILTIN_AGENTS) {
    await query(
      `INSERT INTO agents (id, workspace_id, slug, display_name, is_builtin)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (workspace_id, slug) DO NOTHING`,
      [newId('agt'), workspaceId, a.slug, a.display_name],
    );
  }
}

/**
 * Ensure the user belongs to a workspace; create one (+ admin membership + builtin
 * agents) on first login. Returns the workspace id to put in the session.
 */
async function ensureWorkspace(userId: string, login: string): Promise<string> {
  const existing = await query<{ workspace_id: string }>(
    `SELECT workspace_id FROM workspace_members WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  if (existing[0]) return existing[0].workspace_id;

  const workspaceId = newId('ws');
  await query(`INSERT INTO workspaces (id, name) VALUES ($1, $2)`, [
    workspaceId,
    `${login}'s Workspace`,
  ]);
  await query(
    `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'admin')`,
    [workspaceId, userId],
  );
  await seedBuiltinAgents(workspaceId);
  return workspaceId;
}

/** UPSERT a user by github_id, returning the stored row. */
async function upsertUser(input: {
  githubId: number;
  login: string;
  email: string | null;
  avatarUrl: string | null;
  tokenEnc: Buffer;
}): Promise<UserRow> {
  const rows = await query<UserRow>(
    `INSERT INTO users (id, github_id, github_login, email, avatar_url, gh_token_enc)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (github_id) DO UPDATE SET
       github_login = EXCLUDED.github_login,
       email = EXCLUDED.email,
       avatar_url = EXCLUDED.avatar_url,
       gh_token_enc = EXCLUDED.gh_token_enc
     RETURNING id, github_id, github_login, email, avatar_url`,
    [
      newId('usr'),
      input.githubId,
      input.login,
      input.email,
      input.avatarUrl,
      input.tokenEnc,
    ],
  );
  return rows[0]!;
}

const plugin: FastifyPluginAsync = async (app) => {
  // Kick off GitHub OAuth.
  app.get('/auth/github', async (_req, reply) => {
    const params = new URLSearchParams({
      client_id: config.GITHUB_OAUTH_CLIENT_ID,
      scope: 'repo,read:user',
      redirect_uri: `${config.API_BASE_URL}/api/v1/auth/github/callback`,
    });
    return reply.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
  });

  // OAuth callback: exchange code, upsert user, ensure workspace, set session.
  app.get<{ Querystring: { code?: string } }>(
    '/auth/github/callback',
    async (req, reply) => {
      const code = req.query.code;
      if (!code) return reply.code(400).send({ error: 'missing code' });

      const gh = await exchangeCode(code);
      const user = await upsertUser({
        githubId: gh.githubId,
        login: gh.login,
        email: gh.email,
        avatarUrl: gh.avatarUrl,
        tokenEnc: encrypt(gh.accessToken),
      });
      const workspaceId = await ensureWorkspace(user.id, user.github_login);

      setSession(reply, { userId: user.id, workspaceId });
      return reply.redirect(config.WEB_ORIGIN);
    },
  );

  // Dev-only login shortcut. 404 in production.
  app.post('/auth/dev-login', async (_req, reply) => {
    if (config.NODE_ENV === 'production') {
      return reply.code(404).send({ error: 'not found' });
    }

    const user = await upsertUser({
      githubId: 1,
      login: 'dev',
      email: null,
      avatarUrl: null,
      tokenEnc: encrypt('dev-token'),
    });
    const workspaceId = await ensureWorkspace(user.id, user.github_login);

    setSession(reply, { userId: user.id, workspaceId });
    return reply.code(200).send({ userId: user.id, workspaceId });
  });

  // Clear session.
  app.post('/auth/logout', async (_req, reply) => {
    clearSession(reply);
    return reply.code(204).send();
  });

  // Current user + workspace, or 401.
  app.get('/me', async (req, reply) => {
    const session = getSession(req);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });

    const users = await query<UserRow>(
      `SELECT id, github_id, github_login, email, avatar_url FROM users WHERE id = $1`,
      [session.userId],
    );
    const workspaces = await query<WorkspaceRow>(
      `SELECT id, name FROM workspaces WHERE id = $1`,
      [session.workspaceId],
    );
    const user = users[0];
    const workspace = workspaces[0];
    if (!user || !workspace) return reply.code(401).send({ error: 'unauthorized' });

    return reply.send({
      user: { id: user.id, github_login: user.github_login, avatar_url: user.avatar_url },
      workspace: { id: workspace.id, name: workspace.name },
    });
  });
};

export default plugin;
