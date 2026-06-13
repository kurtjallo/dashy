/**
 * BullMQ workers — normalize-event, backfill, watchdog (repeatable, every 5 min),
 * slack-delivery, retention-purge. See docs/ARCHITECTURE.md §3-4.
 */
import { Worker } from 'bullmq';
import { connection } from './queues.js';
import { normalizeJob } from '../ingestion/normalize.js';

export async function startWorkers(): Promise<void> {
  new Worker('normalize', normalizeJob, { connection });
}
