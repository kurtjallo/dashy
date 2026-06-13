/**
 * Local end-to-end smoke test for the Phase 1 walking skeleton.
 * Exercises the full path WITHOUT GitHub: dev-login -> seed a source with a known
 * webhook secret -> POST a signed (HMAC) pull_request payload -> the normalize worker
 * stores it -> GET /feed shows the attributed event.
 *
 * Run against a running API (node dist/index.js) with postgres + redis up:
 *   pnpm --filter @dashy/api exec tsx scripts/smoke-e2e.ts
 */
import crypto from 'node:crypto';
import { query } from '../src/db/pool.js';
import { newId } from '../src/lib/ids.js';
import { encrypt } from '../src/lib/crypto.js';

const API = process.env.API_BASE_URL ?? 'http://localhost:4000';

async function main() {
  // 1. dev-login -> session cookie + workspace
  const login = await fetch(`${API}/api/v1/auth/dev-login`, { method: 'POST' });
  if (!login.ok) throw new Error(`dev-login failed: ${login.status}`);
  const cookie = login.headers.getSetCookie()[0]?.split(';')[0];
  if (!cookie) throw new Error('no session cookie returned');
  const { workspaceId } = (await login.json()) as { workspaceId: string };
  console.log(`1. dev-login OK            workspace=${workspaceId}`);

  // 2. seed a github source with a known webhook secret (encrypted as the app stores it)
  const secret = 'smoke-test-webhook-secret-0123456789';
  const sourceId = newId('src');
  await query(
    `INSERT INTO sources (id, workspace_id, type, status, config)
     VALUES ($1, $2, 'github', 'active', $3::jsonb)`,
    [sourceId, workspaceId, JSON.stringify({ webhook_secret_enc: encrypt(secret).toString('base64') })],
  );
  console.log(`2. seeded source          source=${sourceId}`);

  // 3. craft a Devin-authored pull_request.opened, sign it, deliver it
  const payload = {
    action: 'opened',
    repository: { full_name: 'acme/payments-api', default_branch: 'main' },
    sender: { login: 'devin-ai-integration[bot]' },
    pull_request: {
      number: 412,
      html_url: 'https://github.com/acme/payments-api/pull/412',
      title: 'Add idempotency keys to charge endpoint',
      additions: 184,
      deletions: 22,
      base: { ref: 'main' },
      user: { login: 'devin-ai-integration[bot]' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
  const body = JSON.stringify(payload);
  const signature = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
  const delivery = newId('wh');
  const wh = await fetch(`${API}/api/v1/webhooks/github?src=${sourceId}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': signature,
      'x-github-delivery': delivery,
      'x-github-event': 'pull_request',
    },
    body,
  });
  console.log(`3. webhook delivered      status=${wh.status} ${JSON.stringify(await wh.json())}`);
  if (wh.status !== 202) throw new Error(`expected 202, got ${wh.status}`);

  // 4. poll the feed until the worker has stored + attributed the event
  let hit: { ev: Record<string, unknown>; summary: unknown } | null = null;
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 300));
    const res = await fetch(`${API}/api/v1/feed`, { headers: { cookie } });
    if (!res.ok) throw new Error(`feed failed: ${res.status}`);
    const feed = (await res.json()) as { summary: unknown; events: Array<Record<string, unknown>> };
    const ev = feed.events.find(
      (e) => (e.payload_ref as { pr_number?: number } | null)?.pr_number === 412,
    );
    if (ev) {
      hit = { ev, summary: feed.summary };
      break;
    }
  }
  if (!hit) throw new Error('event never appeared in /feed (worker/ingestion broken)');

  console.log('4. event in /feed:');
  console.log(JSON.stringify(hit.ev, null, 2));
  console.log('   summary:', JSON.stringify(hit.summary));

  // assertions
  const e = hit.ev;
  const checks: Array<[string, boolean]> = [
    ['action_type = pr_opened', e.action_type === 'pr_opened'],
    ['agent attributed = devin', e.agent === 'devin'],
    ['actor_kind = agent', e.actor_kind === 'agent'],
    ['confidence = exact', e.confidence === 'exact'],
    ['repo carried through', e.repo === 'acme/payments-api'],
    ['impact = medium', e.impact === 'medium'],
  ];
  let ok = true;
  for (const [name, pass] of checks) {
    console.log(`   ${pass ? 'PASS' : 'FAIL'}  ${name}`);
    if (!pass) ok = false;
  }
  if (!ok) throw new Error('attribution/mapping assertions failed');

  console.log('\nE2E PASS — webhook -> HMAC verify -> queue -> normalize -> attribute -> store -> feed.');
  process.exit(0);
}

main().catch((err) => {
  console.error('E2E FAIL:', err.message ?? err);
  process.exit(1);
});
