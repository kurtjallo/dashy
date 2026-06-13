import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '../config/env.js';

/** Shared BullMQ Redis connection. maxRetriesPerRequest:null is required by BullMQ. */
export const connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });

export interface NormalizeJobData {
  sourceId: string;
  workspaceId: string;
  deliveryId: string;
  event: string;
  payload: unknown;
}

/** The 'normalize' queue — webhook payloads enqueued here, drained by the normalize worker. */
export const normalizeQueue = new Queue<NormalizeJobData>('normalize', { connection });

/** The 'slack-drain' queue — carries the repeatable tick that drains slack_alert_queue. */
export const slackDrainQueue = new Queue('slack-drain', { connection });
