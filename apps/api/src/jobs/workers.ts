/**
 * BullMQ workers — normalize-event, backfill, watchdog (repeatable, every 5 min),
 * slack-delivery, retention-purge. See docs/ARCHITECTURE.md §3-4.
 */
export async function startWorkers() {
  // TODO: instantiate BullMQ queues + workers against config.REDIS_URL
}
