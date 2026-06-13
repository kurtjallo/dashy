/**
 * BullMQ workers — runs the 'normalize' worker (webhook payload -> canonical event)
 * and the 'slack-drain' worker, which is woken every ~10s by a repeatable job to
 * drain slack_alert_queue (ARCHITECTURE.md §3-4).
 */
import { Worker } from 'bullmq';
import { connection, slackDrainQueue } from './queues.js';
import { normalizeJob } from '../ingestion/normalize.js';
import { drainSlackQueue } from '../notifications/slack/delivery.js';

export async function startWorkers(): Promise<void> {
  new Worker('normalize', normalizeJob, { connection });

  new Worker(
    'slack-drain',
    async () => {
      await drainSlackQueue();
    },
    { connection },
  );

  // A single repeatable tick (~every 10s) drives the Slack delivery drain. A fixed
  // jobId keeps exactly one schedule across restarts.
  await slackDrainQueue.add(
    'drain',
    {},
    { repeat: { every: 10000 }, jobId: 'slack-drain', removeOnComplete: true, removeOnFail: 100 },
  );
}
