import { Redis } from 'ioredis';
import { config } from '../config/env.js';

/** The pub/sub channel the normalizer publishes inserted event IDs to (ARCHITECTURE.md §4.1). */
export const AGENT_EVENTS_CHANNEL = 'agent_events';

/**
 * A dedicated ioredis client for publishing — deliberately NOT the shared BullMQ
 * `connection` (which is configured with `maxRetriesPerRequest: null` and reserved
 * for the queue). A plain client can publish freely. Created lazily so importing
 * this module never opens a socket on its own.
 */
let publisher: Redis | null = null;

function getPublisher(): Redis {
  if (!publisher) publisher = new Redis(config.REDIS_URL);
  return publisher;
}

/**
 * Fan-out wake-up signal: PUBLISH the event id on `agent_events`. The payload is
 * only the id — subscribers (the SSE hub, Slack engine) re-read the durable row
 * from Postgres (§4.1). Fire-and-forget; a missed message is recovered by the
 * client's `Last-Event-ID` replay.
 */
export async function publishAgentEvent(eventId: string): Promise<void> {
  await getPublisher().publish(AGENT_EVENTS_CHANNEL, eventId);
}
