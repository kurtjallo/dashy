import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

// Local dev: load the monorepo-root .env regardless of cwd — turbo runs each package's
// script from the package dir, so a plain dotenv/config would miss the root file. In
// production the platform injects env vars and no .env exists, so this is a harmless no-op.
loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../../.env') });

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().min(32),
  GITHUB_OAUTH_CLIENT_ID: z.string(),
  GITHUB_OAUTH_CLIENT_SECRET: z.string(),
  SENTRY_DSN: z.string().optional(),
});

const parsed = envSchema.parse(process.env);
export const config = { port: parsed.PORT, ...parsed };
