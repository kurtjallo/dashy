-- Up Migration
-- CHECK constraints that mirror the shared TypeScript enums (packages/shared/src/events.ts:
-- ACTION_TYPES, IMPACT_LEVELS) so the DB and the API validators cannot drift, plus the
-- impact filter index. A drift test asserts these lists match the shared constants.

ALTER TABLE events
  ADD CONSTRAINT events_action_type_check CHECK (action_type IN (
    'pr_opened',
    'pr_merged',
    'pr_closed',
    'commit_pushed',
    'issue_opened',
    'issue_closed',
    'devin_task_completed',
    'devin_task_failed',
    'cursor_session'
  )),
  ADD CONSTRAINT events_impact_check CHECK (impact IN ('high', 'medium', 'low'));

CREATE INDEX idx_events_ws_impact_time ON events (workspace_id, impact, occurred_at DESC);

-- Down Migration
DROP INDEX IF EXISTS idx_events_ws_impact_time;
ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_impact_check,
  DROP CONSTRAINT IF EXISTS events_action_type_check;
