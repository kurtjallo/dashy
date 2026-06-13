import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from '../config/env.js';
import { sessionPlugin } from './session.js';
import authRoutes from './routes/auth.js';
import reposRoutes from './routes/repos.js';
import webhooksRoutes from './routes/webhooks.js';
import feedRoutes from './routes/feed.js';

/** Route registration lives in src/http/routes/ — one file per resource. */
export async function buildServer() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: config.WEB_ORIGIN, credentials: true });
  await sessionPlugin(app);

  app.get('/health', async () => ({ status: 'ok' }));

  await app.register(authRoutes, { prefix: '/api/v1' });
  await app.register(reposRoutes, { prefix: '/api/v1' });
  await app.register(webhooksRoutes, { prefix: '/api/v1' });
  await app.register(feedRoutes, { prefix: '/api/v1' });

  return app;
}
