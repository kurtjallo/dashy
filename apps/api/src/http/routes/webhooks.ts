import type { FastifyPluginAsync } from 'fastify';
import crypto from 'node:crypto';
import { query } from '../../db/pool.js';
import { decrypt } from '../../lib/crypto.js';
import { normalizeQueue } from '../../jobs/queues.js';

interface SourceRow {
  id: string;
  workspace_id: string;
  type: string;
  config: { webhook_secret_enc?: string; [k: string]: unknown } | null;
}

/** Constant-time compare of the delivered signature against the expected HMAC. */
function signatureValid(rawBody: Buffer, secret: string, header: string | undefined): boolean {
  if (!header) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const plugin: FastifyPluginAsync = async (app) => {
  // Keep the RAW request body so we can verify GitHub's HMAC signature over the
  // exact bytes, while still exposing the parsed JSON on req.body.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    (req as unknown as { rawBody: Buffer }).rawBody = body as Buffer;
    try {
      done(null, JSON.parse((body as Buffer).toString('utf8')));
    } catch (e) {
      done(e as Error);
    }
  });

  app.post('/webhooks/github', async (req, reply) => {
    const src = (req.query as { src?: string } | undefined)?.src;
    if (!src) return reply.code(400).send({ error: 'missing src' });

    const rows = await query<SourceRow>(
      'SELECT id, workspace_id, type, config FROM sources WHERE id = $1 LIMIT 1',
      [src],
    );
    const source = rows[0];
    if (!source) return reply.code(404).send({ error: 'unknown source' });

    const encSecret = source.config?.webhook_secret_enc;
    if (!encSecret) return reply.code(401).send({ error: 'invalid signature' });

    let secret: string;
    try {
      secret = decrypt(Buffer.from(encSecret, 'base64'));
    } catch {
      return reply.code(401).send({ error: 'invalid signature' });
    }

    const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody ?? Buffer.alloc(0);
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    if (!signatureValid(rawBody, secret, signature)) {
      return reply.code(401).send({ error: 'invalid signature' });
    }

    const deliveryId = req.headers['x-github-delivery'] as string | undefined;
    const event = req.headers['x-github-event'] as string | undefined;
    if (!deliveryId || !event) return reply.code(400).send({ error: 'missing delivery headers' });

    // Hand off to the normalize worker; keep this handler fast (<500ms).
    await normalizeQueue.add('normalize', {
      sourceId: source.id,
      workspaceId: source.workspace_id,
      deliveryId,
      event,
      payload: req.body,
    });

    return reply.code(202).send({ queued: true });
  });
};

export default plugin;
