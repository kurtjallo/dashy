import Fastify from 'fastify';

/** Route registration lives in src/http/routes/ — one file per resource. */
export async function buildServer() {
  const app = Fastify({ logger: true });
  app.get('/health', async () => ({ status: 'ok' }));
  // TODO: register routes (events, feed, sources, webhooks, stream, auth, integrations/slack)
  return app;
}
