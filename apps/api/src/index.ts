/**
 * Dashy.ai API — single always-on monolith (docs/ARCHITECTURE.md §1).
 * One process runs: HTTP API + webhook listener, BullMQ workers, SSE hub.
 */
import { buildServer } from './http/server.js';
import { startWorkers } from './jobs/workers.js';
import { startAgentEventsSubscriber } from './realtime/subscriber.js';
import { config } from './config/env.js';

const server = await buildServer();
await startWorkers();
// Subscribe this process to the agent_events fan-out so the in-process SSE hub
// receives published events and pushes them to open connections (§4.1).
await startAgentEventsSubscriber();
await server.listen({ port: config.port, host: '0.0.0.0' });
