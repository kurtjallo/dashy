/**
 * Dashy.ai API — single always-on monolith (docs/ARCHITECTURE.md §1).
 * One process runs: HTTP API + webhook listener, BullMQ workers, SSE hub.
 */
import { buildServer } from './http/server.js';
import { startWorkers } from './jobs/workers.js';
import { config } from './config/env.js';

const server = await buildServer();
await startWorkers();
await server.listen({ port: config.port, host: '0.0.0.0' });
